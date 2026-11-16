---
name: virtues
description: Run the VirTues spatial proteomics foundation model on IMC, CODEX or MIBI images — masked-marker reconstruction, marker inpainting and patch embeddings — with the MIT virtues-sp31 weights on CPU, Apple MPS or CUDA.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [multiplex-imaging, spatial, image-analysis, embeddings, model-weights]
covers: [spatial proteomics, imaging mass cytometry, IMC, CODEX, MIBI, CyCIF, multiplexed immunofluorescence, tumor microenvironment, breast cancer, lung cancer, marker imputation, virtual staining, inpainting, foundation model, ESM-2 marker embeddings, SPORA, spora-io, Hugging Face]
papers: [doi:10.1038/s41586-026-10884-y]
access: [open]
datasets: [https://raw.githubusercontent.com/bunnelab/virtues/d2c25e1c1ea7184f98802c5cfe19f0afe53a2c7e/assets/example_dataset/imc/channels.parquet, https://huggingface.co/api/models/bunnelab/virtues/revision/43fd00fce052c46f9e0cc1a87f42806620632319, https://huggingface.co/bunnelab/virtues/resolve/43fd00fce052c46f9e0cc1a87f42806620632319/virtues-sp31/LICENCE.md]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-15
  against: VirTues commit d2c25e1 / spora-io commit ef15868 / weights virtues-sp31 at Hugging Face revision 43fd00f / torch 2.15.0, torchvision 0.29.2, numpy 2.5.4, Python 3.12.8 / arm64 macOS on Apple M1 Max, CPU and MPS / no CUDA device
  executed: 7
  unverified: 0
---

# VirTues — a foundation model for multiplexed tissue images

VirTues (Virtual Tissues) reads a multiplexed image — imaging mass cytometry, CODEX, MIBI
and similar — as a stack of channels, each tagged with the protein it measures. The tag is
an ESM-2 embedding of that protein's sequence, which is what lets one set of weights accept
any panel: a marker the model never saw in training is still described by its sequence.
From one forward pass you get back:

| output | shape for a (C, H, W) crop | what it is |
|---|---|---|
| `decoded_multiplex[0]` | (C, H, W) | every channel reconstructed, including the 8x8 patches you hid |
| `patch_summary[0]` | (H/8, W/8, 512) | one embedding per 8x8 patch, summarising all its markers |
| `channel_token_embeddings[0]` | (C, H/8, W/8, 512) | one embedding per marker per patch |

The reconstruction is the testable part, so this page is built around it: hide some
patches, or a whole marker, and score what comes back against what was measured. The
embeddings are what you would carry into cell typing, niche annotation or patient-level
models; those downstream pipelines live in upstream's companion benchmark repository and
are not run here.

## Which weights — route to `virtues-sp31`

The weights sit in one Hugging Face repository, `bunnelab/virtues`, which is ungated: no
account, no token, no click-through. It holds three instances under two licences, because
the training data differ:

| instance | trained on | weights licence | who may use it |
|---|---|---|---|
| `virtues-sp31` | 31 spatial proteomics datasets | MIT | anyone, commercial use included |
| `virtues-sp32` | the same 31 plus one cohort that cannot be redistributed | CC BY-NC 4.0 | non-commercial use only |
| `virtues-imc14` | 14 IMC datasets | CC BY-NC 4.0 | non-commercial use only |

**Every block here loads `virtues-sp31`, and you should too unless you are certain your use is
non-commercial.** Upstream's README recommends `sp32` for academic work and its demo
notebooks load `sp32` by default, so code copied from upstream silently puts a reader under
non-commercial terms. Upstream says plainly why `sp31` exists: "For commercial use, we
provide under a more permissive licence a model instance `virtues-sp31` trained on 31
datasets." The licence is also stated in a `LICENCE.md` inside each instance's folder on
the Hub; the Hub's model card itself carries no licence field, so the page shows no
licence chip.

Two more things in that repository to avoid. There is a `model.safetensors` at the
repository root with no licence file beside it and no row in upstream's table. Its LFS SHA-256
is byte-identical to `virtues-imc14/model.safetensors`, so it is the CC BY-NC `imc14` weights
under another name. Never load it. And the Hub's `main` branch can move, so the code below pins revision
`43fd00fce052c46f9e0cc1a87f42806620632319` and checks the file's SHA-256.

The code is MIT (EPFL, Laboratory of Artificial Intelligence in Molecular Medicine), and so
is `spora-io`, the data loader every upstream workflow imports. `spora-io`'s licence file
said CC BY-NC-ND until September 2026; it is MIT now, matching its package metadata.

## Before the first block

Nothing to obtain: no API key, no account, no GPU. What you do need:

- **Python 3.10 or newer**, `git`, and about 1.5 GB of disk on a Mac: 1.1 GB for the
  environment, 108 MB for the clone, 174 MB for `virtues-sp31`. On Linux the default PyTorch
  wheel brings CUDA libraries and is several times larger. Computing your own marker
  embeddings (below) adds the 565 MB ESM-2 checkpoint.
- **The AWS CLI**, only for the optional SPORA download block further down (`aws s3 ...
  --no-sign-request`, anonymous). Nothing else on the page uses it.
- **A source install.** VirTues is not on PyPI; you clone it. `spora-io` is not on PyPI
  either and installs from git. Both are pinned to a commit below.
- **No `flash-attn`.** Upstream's `setup.sh` installs it, and every attention layer in the
  model imports it at module level, but it only compiles against CUDA. On a Mac
  `pip install flash-attn` stops with `OSError: CUDA_HOME environment variable is not set`.
  The code below supplies a plain-PyTorch replacement when it is missing.

## How this page's code differs from upstream's notebooks

Upstream's notebooks are written for an NVIDIA GPU: `load_file(..., device='cuda')`,
`model.cuda()`, `crop.cuda()` and `torch.amp.autocast(device_type='cuda')`, with no CPU or
MPS fallback. The model code itself is untouched here. The differences are two, and both
are in `virtues_local.py` below:

1. **Device handling.** The device is chosen at run time — CUDA if present, else Apple MPS if
   a small attention call succeeds on it, else CPU — and `VIRTUES_DEVICE=cpu` overrides the
   choice. On CUDA the forward pass runs under autocast, as upstream does; on CPU and MPS it
   runs in float32.
2. **The attention kernel, when `flash-attn` is not installed.** The model calls one function,
   `flash_attn_varlen_qkvpacked_func`, which runs attention separately inside each of many
   variable-length sequences packed end to end. The replacement does the same arithmetic with
   PyTorch's `scaled_dot_product_attention` over a padded batch, and is registered under the
   module name the model imports. If `flash-attn` is installed, the real kernel is used and
   the replacement is never registered. Checked against attention computed one sequence at a
   time by explicit softmax, the replacement agreed to 6e-7.

**What could only be run on CPU and MPS.** Everything on this page was executed on an Apple
M1 Max with no CUDA device. CPU and MPS outputs agreed to within 1e-5 of each other. A CUDA
run uses half precision under autocast and, with `flash-attn` installed, a different
kernel, so expect small numerical differences from the figures below on a GPU — they were
not measured here, and the CUDA branch of the code was not executed.

## Try it

**Data** — the example tissue upstream ships inside its repository at
`assets/example_dataset`: one imaging mass cytometry image of non-small cell lung cancer
from Cords et al. (2024), 40 markers that pass QC and carry a UniProt ID, 697 x 597 pixels
at 1 µm per pixel, already in the SPORA layout with its standardization statistics, tissue
mask and ESM-2 marker embeddings. Upstream's acknowledgements list the dataset as CC BY 4.0
(Zenodo record 5850952). It arrives with `git clone`, so there is nothing else to fetch.
The weights come from the Hub at a pinned revision. Both were reachable on 2026-11-15.

**Run** — one block, from an empty directory to a scored reconstruction. It clones and pins
the code, builds a virtual environment, writes `virtues_local.py` (the only code this page
adds) and `reconstruct.py`, and runs the latter. The trap it routes through is the weights:
it loads `virtues-sp31` by name and revision, never upstream's default, and refuses any
other file by hash.

```bash
COLD=$(mktemp -d) && cd "$COLD"

# 1. Code at a pinned commit (MIT), plus the example tissue it ships
git clone -q https://github.com/bunnelab/virtues.git
git -C virtues checkout -q d2c25e1c1ea7184f98802c5cfe19f0afe53a2c7e

# 2. Environment — everything except flash-attn, which only builds against CUDA
python3 -m venv .venv && . .venv/bin/activate
pip install -q torch torchvision numpy pandas einops safetensors huggingface_hub omegaconf loguru \
  "spora-io @ git+https://github.com/bunnelab/spora-io.git@ef15868cb8eae512c79eadf6014732165ec6996a"
pip install -q --no-deps -e ./virtues

# 3. The device and attention handling this page adds
cat > virtues_local.py <<'PY'
"""Load VirTues virtues-sp31 on CUDA, Apple MPS or CPU."""
import hashlib, os, sys, types
import torch
import torch.nn.functional as F

HF_REPO = "bunnelab/virtues"
HF_REVISION = "43fd00fce052c46f9e0cc1a87f42806620632319"
WEIGHTS = "virtues-sp31/model.safetensors"   # MIT. sp32 and imc14 are CC BY-NC 4.0.
WEIGHTS_SHA256 = "ada33b22b7a11fd6600549186141f21543b43b3f31af580d9c6100e1f88263f0"


def _varlen_attention(qkv, cu_seqlens, max_seqlen, dropout_p=0.0,
                      softmax_scale=None, causal=False, **_ignored):
    """Same contract as flash_attn_varlen_qkvpacked_func, in plain PyTorch.
    qkv is (total_tokens, 3, heads, head_dim); cu_seqlens marks where each
    independent sequence starts. Tokens attend only within their own sequence."""
    if causal:
        raise NotImplementedError("VirTues never calls this with causal=True")
    total, _, heads, dim = qkv.shape
    dev = qkv.device
    starts = cu_seqlens.long()
    lens = starts[1:] - starts[:-1]
    n, longest = len(lens), int(lens.max())
    seq = torch.repeat_interleave(torch.arange(n, device=dev), lens)
    pos = torch.arange(total, device=dev) - starts[:-1][seq]
    padded = qkv.new_zeros(n, longest, 3, heads, dim)
    padded[seq, pos] = qkv
    real = torch.zeros(n, longest, dtype=torch.bool, device=dev)
    real[seq, pos] = True
    q, k, v = (padded[:, :, i].transpose(1, 2) for i in range(3))
    out = F.scaled_dot_product_attention(q, k, v, attn_mask=real[:, None, None, :],
                                         dropout_p=dropout_p, scale=softmax_scale)
    return out.transpose(1, 2)[seq, pos]


def attention_backend():
    """Use the real flash-attn if it is installed; otherwise register the fallback.
    Must run before anything from virtues.modules is imported."""
    try:
        import flash_attn.flash_attn_interface  # noqa: F401
        return "flash-attn"
    except ImportError:
        pkg = types.ModuleType("flash_attn")
        sub = types.ModuleType("flash_attn.flash_attn_interface")
        sub.flash_attn_varlen_qkvpacked_func = _varlen_attention
        pkg.flash_attn_interface = sub
        sys.modules["flash_attn"], sys.modules["flash_attn.flash_attn_interface"] = pkg, sub
        return "pytorch-sdpa-fallback"


def pick_device():
    if os.environ.get("VIRTUES_DEVICE"):                  # e.g. VIRTUES_DEVICE=cpu
        return torch.device(os.environ["VIRTUES_DEVICE"])
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        try:
            x = torch.randn(2, 2, 4, 8, device="mps")
            m = torch.ones(2, 1, 1, 4, dtype=torch.bool, device="mps")
            F.scaled_dot_product_attention(x, x, x, attn_mask=m).cpu()
            return torch.device("mps")
        except Exception:
            pass
    return torch.device("cpu")


def load_model(marker_embedding_dir, device, weights_dir="weights"):
    backend = attention_backend()
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file
    from virtues.modules.multiplex_virtues import MultiplexVirtues
    from virtues.utils.utils import load_marker_embeddings, load_marker_embedding_dict

    path = hf_hub_download(HF_REPO, WEIGHTS, revision=HF_REVISION, local_dir=weights_dir)
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    if h.hexdigest() != WEIGHTS_SHA256:
        raise RuntimeError(f"{path} is not the pinned virtues-sp31 file")

    model = MultiplexVirtues(prior_bias_embeddings=load_marker_embeddings(marker_embedding_dir))
    model.load_state_dict(load_file(path, device="cpu"))          # strict: every key must match
    return model.to(device).eval(), load_marker_embedding_dict(marker_embedding_dir), backend


@torch.no_grad()
def run(model, image, marker_idx, mask, device):
    """One forward pass on a (C, H, W) standardized crop; H and W multiples of 8."""
    args = ([image.to(device)], [marker_idx.to(device)], [mask.to(device)])
    if device.type == "cuda":                       # what upstream does on GPU
        with torch.autocast(device_type="cuda"):
            out = model.forward(*args)
    else:                                           # float32 on CPU and MPS
        out = model.forward(*args)
    return out


def random_patch_mask(channels, h, w, ratio, seed):
    """Mask `ratio` of the 8x8 patches in every channel, independently per channel."""
    g = torch.Generator().manual_seed(seed)
    n = (h // 8) * (w // 8)
    k = int(round(n * ratio))
    mask = torch.zeros(channels, n, dtype=torch.bool)
    for c in range(channels):
        mask[c, torch.randperm(n, generator=g)[:k]] = True
    return mask.view(channels, h // 8, w // 8)
PY

# 4. Masked-marker reconstruction on the example tissue
cat > reconstruct.py <<'PY'
import time, numpy as np, torch
from omegaconf import OmegaConf
from virtues_local import pick_device, load_model, run, random_patch_mask

ROOT = "virtues"
device = pick_device()
t0 = time.time()
model, marker_index, backend = load_model(f"{ROOT}/assets/example_dataset/marker_embeddings", device)
print(f"device {device}  attention {backend}  load {time.time() - t0:.1f}s")

from spora_io import MultiplexImagingDataset   # after load_model: needs no flash-attn itself
ds_cfg = OmegaConf.load(f"{ROOT}/configs/datasets/example_config.yaml")["datasets"]["example_dataset"]
ds = MultiplexImagingDataset(name=ds_cfg.name, path=f"{ROOT}/{ds_cfg.path}", modality=ds_cfg.modality,
                             standardization=ds_cfg.standardization, resolution=ds_cfg.resolution,
                             tile_size=128, disable_quantile_mask=True, filter_list=["gaussian_blur"],
                             use_mean_std=True, verbose=False)
tissue = ds.get_tissue(tissue_id="cords2024cancer_ocmzljpb_0001", kind="uniprot_filtered")
idx = torch.tensor([marker_index[u] for u in tissue.uniprot_ids], dtype=torch.long)
crop = tissue.image[:, 200:328, 200:328].float()
C, H, W = crop.shape
mask = random_patch_mask(C, H, W, ratio=0.75, seed=0)

t1 = time.time()
out = run(model, crop, idx, mask, device)
recon = out.decoded_multiplex[0].float().cpu()
print(f"forward {time.time() - t1:.2f}s  image {tuple(crop.shape)}  recon {tuple(recon.shape)}")

hidden = mask.repeat_interleave(8, 1).repeat_interleave(8, 2)            # pixel-level mask
mse = ((recon - crop)[hidden] ** 2).mean().item()
visible_mean = crop.masked_fill(hidden, float("nan")).nanmean(dim=(1, 2), keepdim=True)
baseline = ((visible_mean.expand_as(crop) - crop)[hidden] ** 2).mean().item()
r = [np.corrcoef(recon[c][hidden[c]], crop[c][hidden[c]])[0, 1] for c in range(C)]
print(f"masked-pixel MSE {mse:.4f}  baseline {baseline:.4f}  ratio {mse / baseline:.3f}")
print(f"median per-marker Pearson r on hidden pixels {np.nanmedian(r):.3f}")
print(f"patch_summary {tuple(out.patch_summary[0].shape)}  "
      f"channel tokens {tuple(out.channel_token_embeddings[0].shape)}")
torch.save({"crop": crop, "mask": mask, "recon": recon, "idx": idx}, "reconstruction.pt")
PY
python reconstruct.py
echo "workdir: $COLD"
```

The score: 75% of the 8x8 patches in every channel are hidden, independently per channel,
and the reconstruction is compared with the measured values on hidden pixels only. The
baseline predicts each hidden pixel as the mean of that channel's visible pixels. A ratio
below 1 means the model used the other channels and the surrounding tissue to do better
than a per-channel average.

**Expect**

*Invariants* — these hold whatever the version, and a failure means something is wrong:

- `load_model` returns without raising: the SHA-256 matches and `load_state_dict` reports
  no missing or unexpected keys
- the reconstruction has exactly the input's shape, `(40, 128, 128)`
- `patch_summary` is `(16, 16, 512)` and the channel tokens `(40, 16, 16, 512)` — one per
  8x8 patch, and per marker
- the masked-pixel MSE is well below the baseline (ratio under 1)
- the same mask and seed give the same numbers on repeat runs, and on CPU and MPS

*Observed, 2026-11-15, the pins above, Apple M1 Max* — drift to investigate, not a bug:

- `masked-pixel MSE 0.1049  baseline 0.2891  ratio 0.363`
- `median per-marker Pearson r on hidden pixels 0.751`
- CPU and MPS reconstructions differ by at most 7e-6
- forward pass 2.6 to 4.3 s on CPU and about 1.1 s on MPS for this crop, across runs; about
  1.7 GB peak memory on CPU
- cold, the whole block took 6 to 9 minutes across runs, nearly all of it `git clone` and the PyTorch
  install; the 174 MB weights download took under 30 s

Every block below runs from the directory this one created, with its environment active
(`. .venv/bin/activate`), and reuses `virtues_local.py`.

## Tile at 128 pixels — larger inputs reconstruct worse

The model accepts any crop whose height and width are multiples of 8, so nothing stops you
passing a whole region at once. Do not. It was trained on 128-pixel tiles (`data.tile_size: 128` in upstream's
`configs/base_config.yaml`), and quality falls
steadily as the input grows, with no error and no warning. This block reconstructs one
512 x 512 region three ways, with the same hidden patches each time:

```python
import time, torch
from virtues_local import pick_device, load_model, run, random_patch_mask
from omegaconf import OmegaConf
from spora_io import MultiplexImagingDataset

device = pick_device()
model, marker_index, _ = load_model("virtues/assets/example_dataset/marker_embeddings", device)
cfg = OmegaConf.load("virtues/configs/datasets/example_config.yaml")["datasets"]["example_dataset"]
ds = MultiplexImagingDataset(name=cfg.name, path=f"virtues/{cfg.path}", modality=cfg.modality,
                             standardization=cfg.standardization, resolution=cfg.resolution, tile_size=128,
                             disable_quantile_mask=True, filter_list=["gaussian_blur"], use_mean_std=True,
                             verbose=False)
t = ds.get_tissue(tissue_id="cords2024cancer_ocmzljpb_0001", kind="uniprot_filtered")
idx = torch.tensor([marker_index[u] for u in t.uniprot_ids], dtype=torch.long)
region = t.image[:, 64:576, 32:544].float()                    # 512 x 512 px of tissue
C, H, W = region.shape
mask = random_patch_mask(C, H, W, ratio=0.75, seed=0)          # one mask, reused for every tiling
hidden = mask.repeat_interleave(8, 1).repeat_interleave(8, 2)
visible = region.masked_fill(hidden, float("nan")).nanmean(dim=(1, 2), keepdim=True)
baseline = ((visible.expand_as(region) - region)[hidden] ** 2).mean()

for tile in (128, 256, 512):
    t0, recon = time.time(), torch.empty_like(region)
    for y in range(0, H, tile):
        for x in range(0, W, tile):
            p = tile // 8
            out = run(model, region[:, y:y + tile, x:x + tile], idx,
                      mask[:, y // 8:y // 8 + p, x // 8:x // 8 + p], device)
            recon[:, y:y + tile, x:x + tile] = out.decoded_multiplex[0].float().cpu()
    ratio = ((recon - region)[hidden] ** 2).mean() / baseline
    print(f"tiles of {tile:3d} px: MSE / baseline {ratio.item():.3f}  ({time.time() - t0:.1f}s)")
```

Observed on 2026-11-15, identical on CPU and MPS:

```
tiles of 128 px: MSE / baseline 0.312
tiles of 256 px: MSE / baseline 0.498
tiles of 512 px: MSE / baseline 0.678
```

It took about 5, 7 and 22 s on MPS, and 38, 70 and 197 s on CPU (timings vary with what
else the machine is doing) — the large tile is slower as well as worse; time grows faster
than the area. The whole example image
in one pass (696 x 592) took 396 s on CPU and 101 s on MPS and scored 0.662. Tile at 128
and stitch.

## Inpainting a marker the model cannot see

Hiding one marker entirely, with every other marker fully visible, asks the model to
predict a stain from the rest of the panel — the use case behind virtual staining and
imputing a marker a cohort never measured. This block does it for each of the 40 markers
in turn, on the crop the Try it block saved:

```python
import numpy as np, torch
from virtues_local import pick_device, load_model, run

saved = torch.load("reconstruction.pt")              # written by reconstruct.py
crop, idx = saved["crop"], saved["idx"]
device = pick_device()
model, marker_index, _ = load_model("virtues/assets/example_dataset/marker_embeddings", device)
uniprot_of = {i: u for u, i in marker_index.items()}

C, H, W = crop.shape
scores = []
for ch in range(C):
    mask = torch.zeros(C, H // 8, W // 8, dtype=torch.bool)
    mask[ch] = True            # this marker hidden everywhere; every other marker fully visible
    pred = run(model, crop, idx, mask, device).decoded_multiplex[0][ch].float().cpu()
    r = np.corrcoef(pred.flatten(), crop[ch].flatten())[0, 1]
    scores.append((round(float(r), 3), uniprot_of[int(idx[ch])]))
scores.sort()
print(f"markers {len(scores)}  median r {np.median([s for s, _ in scores]):.3f}")
print("hardest", scores[:3])
print("easiest", scores[-3:])
```

Observed on 2026-11-15, identical on CPU and MPS:

```
markers 40  median r 0.667
hardest [(0.281, 'P26447'), (0.283, 'P11836'), (0.301, 'P08138')]
easiest [(0.888, 'P62736'), (0.924, 'P08670'), (0.965, 'P02533')]
```

The spread is the finding. Cytokeratin 14 (`P02533`), vimentin (`P08670`) and smooth-muscle
actin (`P62736`) come back closely; S100A4 (`P26447`), CD20 (`P11836`) and CD271
(`P08138`) barely do. One plausible reading, not tested here, is that the first group stains
broad tissue compartments that other markers also outline, while the second marks scattered
individual cells. Either way, score every marker you intend to impute this way, on your
own tissue, before using the imputed channel for anything. Forty forward passes took 67 s on MPS and 140 s on CPU.

## Bringing your own data

The model needs three things for each image: the pixels as a `(C, H, W)` float array at
1 µm per pixel, standardized the way the training data were; one ESM-2 embedding per
marker, keyed by UniProt ID; and a tissue mask to compute the statistics over. Upstream's
README points to the SPORA format and its conversion guide for this ("Setting up a New
Dataset Not Contained in Spora"). That route is for keeping a dataset in their format; it
has a CUDA dependency of its own, covered below, and is more than inference needs. The two
blocks here give the model the same input without it.

**1. Marker embeddings.** VirTues reads a directory of `<UniProtID>.pt` files, each the
mean over residues of the last layer of ESM-2 `esm2_t30_150M_UR50D`. Upstream ships two
command-line utilities for this, and both run on CPU. Isoforms keep their suffix
(`P08575-8`, an isoform of CD45, is in the example panel). The check recomputes four of
the shipped embeddings from UniProt's current sequences:

```bash
. .venv/bin/activate
pip install -q fair-esm biopython requests
mkdir -p byo && printf "protein_id\nP01730\nP08575-8\nP05164\nP62736\n" > byo/markers.csv
python -m virtues.utils.download_fastas --input byo/markers.csv --output_dir byo/fasta
python -m virtues.utils.compute_esm_embeddings --input_dir byo/fasta --output_dir byo/emb --device cpu
python - <<'PY'
import torch, pathlib
mine = pathlib.Path("byo/emb/esm2_t30_150M_UR50D")
for f in sorted(mine.glob("*.pt")):
    a = torch.load(f)
    b = torch.load(f"virtues/assets/example_dataset/marker_embeddings/{f.name}")
    print(f.stem, tuple(a.shape), f"max abs diff vs shipped {(a - b).abs().max().item():.1e}")
PY
```

Observed on 2026-11-15: all four `(640,)`, with maximum differences of 2e-7 to 2e-6 from the
shipped files — the shipped embeddings are reproducible on CPU. The first run also downloads
the 150M-parameter ESM-2 checkpoint into the PyTorch hub cache; the embedding step itself
took 26 s for four sequences and peaked near 10 GB of memory (the utility asks ESM-2 for
contact maps as well as embeddings); budget more for long sequences. Put the new files in the same directory as
the rest of your panel's embeddings and pass that directory to `load_model`; every marker
in your image needs one. The `esm` skill covers embedding proteins for other purposes.

**2. Standardization.** For each image and channel, clip at the 99th percentile of tissue
pixels and take `log1p`; then z-score each channel with a mean and standard deviation pooled
over the tissue pixels of every image in your cohort; then a 3 x 3 Gaussian blur with
sigma 1. The block first proves the transform matches what `spora-io` hands the model, using
upstream's own statistics for the example tissue, and then runs the model with statistics
computed from your images — here a one-image cohort:

```python
import numpy as np, pandas as pd, torch, zarr
from torchvision.transforms import v2
from virtues_local import pick_device, load_model, run, random_patch_mask


def clip_log(raw, tissue, q=0.99):
    """Per image and channel: clip at the q-quantile of tissue pixels, then log1p."""
    upper = np.array([np.quantile(raw[c][tissue], q) for c in range(raw.shape[0])])
    return np.log1p(np.clip(raw, 0, upper[:, None, None]))


def cohort_stats(images, tissues):
    """Per-channel mean and std of clip_log values over tissue pixels of every image."""
    s = ss = n = 0
    for raw, tissue in zip(images, tissues):
        x = clip_log(raw, tissue)[:, tissue].astype(np.float64)       # (C, n_tissue_pixels)
        s, ss, n = s + x.sum(1), ss + (x ** 2).sum(1), n + x.shape[1]
    mean = s / n
    return mean, np.sqrt(ss / n - mean ** 2)


def standardize(raw, tissue, mean, std):
    x = (clip_log(raw, tissue) - mean[:, None, None]) / (std[:, None, None] + 1e-8)
    return v2.GaussianBlur(kernel_size=3, sigma=1.0)(torch.from_numpy(x).float())


# Raw example tissue, read as plain arrays — the shape your own data should take
D, tid = "virtues/assets/example_dataset", "cords2024cancer_ocmzljpb_0001"
panel = pd.read_parquet(f"{D}/imc/channels.parquet")
keep = (panel.qc_pass & panel.uniprot_id.notna()).to_numpy()
raw = np.asarray(zarr.open_group(f"{D}/imc/1_0mpp/images/{tid}.ome.zarr", mode="r")["0"])[keep]
tissue = np.load(f"{D}/segmentations/1_0mpp/tissue_masks/{tid}.npz")["mask"].astype(bool)
uniprot = panel.uniprot_id[keep].tolist()
print(f"raw {raw.shape} {raw.dtype}  tissue fraction {tissue.mean():.3f}  markers {len(uniprot)}")

# 1. Same transform, upstream's cohort statistics -> must equal what spora-io hands the model
sd = f"{D}/imc/1_0mpp/standardization/quantile_clipping_log1p/uq_0.99_image"
# Index the statistics by channel name, not by position, so column order cannot misalign them
mean = pd.read_parquet(f"{sd}/global_level_means.parquet").iloc[0][panel.channel_name].to_numpy(float)[keep]
std = pd.read_parquet(f"{sd}/global_level_stds.parquet").iloc[0][panel.channel_name].to_numpy(float)[keep]
mine = standardize(raw, tissue, mean, std)
from spora_io import MultiplexImagingDataset
ref = MultiplexImagingDataset(name="cords2024cancer", path=D, modality="imc",
                              standardization="quantile_clipping_log1p/uq_0.99_image", resolution=1.0,
                              tile_size=128, disable_quantile_mask=True, filter_list=["gaussian_blur"],
                              use_mean_std=True, verbose=False).get_tissue(tid, kind="uniprot_filtered")
assert list(ref.uniprot_ids) == uniprot
print(f"matches spora-io: max abs diff {(ref.image - mine).abs().max().item():.2e}")

# 2. Your situation: no upstream statistics, so compute them from your own cohort (here, one image)
own_mean, own_std = cohort_stats([raw], [tissue])
x = standardize(raw, tissue, own_mean, own_std)

device = pick_device()
model, marker_index, _ = load_model(f"{D}/marker_embeddings", device)
idx = torch.tensor([marker_index[u] for u in uniprot], dtype=torch.long)
for name, img in (("upstream stats", mine), ("own stats", x)):
    crop = img[:, 200:328, 200:328]
    mask = random_patch_mask(*crop.shape, ratio=0.75, seed=0)
    rec = run(model, crop, idx, mask, device).decoded_multiplex[0].float().cpu()
    hid = mask.repeat_interleave(8, 1).repeat_interleave(8, 2)
    vis = crop.masked_fill(hid, float("nan")).nanmean(dim=(1, 2), keepdim=True)
    ratio = ((rec - crop)[hid] ** 2).mean() / ((vis.expand_as(crop) - crop)[hid] ** 2).mean()
    print(f"{name:15} masked-pixel MSE / baseline {ratio.item():.3f}")
```

Observed on 2026-11-15:

```
raw (40, 697, 597) float32  tissue fraction 0.840  markers 40
matches spora-io: max abs diff 9.54e-07
upstream stats  masked-pixel MSE / baseline 0.363
own stats       masked-pixel MSE / baseline 0.381
```

The transform is the one upstream's loader applies with upstream's example configuration.
The statistics are yours: upstream's were pooled over all 2,040 images of the Cords cohort, and a one-image cohort cost a little
here (0.381 against 0.363). Pool over as many of your images as you have. Two choices remain
yours, and neither is in this code: resampling to 1 µm per pixel before anything else, and
the tissue mask (spora-io's own script uses Otsu thresholding of the QC-passing channels;
see
`multiplex-imaging-io` for reading vendor formats and pixel size, and `spatial-phenotyping`
for what to do with cells afterwards).

**The full SPORA conversion route** — upstream's documented path for a dataset you want to
keep in their format, from the spora-io documentation (Convert New Datasets): write each
image as a channel-first Zarr array with a `channels.parquet` panel and a
`channels_per_tissue.parquet` availability matrix; compute tissue masks; convert to
OME-Zarr; compute standardization statistics at global and image level; compute tile
coordinates. On a machine without CUDA, step two fails: `scripts/compute_tissue_masks.py`
constructs its H&E segmentation model with `device='cuda'` at import time, so it cannot
start even for a dataset with no H&E images. Save your own masks with
`utils_mx.save_np_as_npz` instead — the documentation says existing masks are never
overwritten. The remaining steps were not run for this page.

## The SPORA corpus is public

Upstream's training corpus, SPORA, is mirrored on the EMBL-EBI BioImage Archive, and its
bucket answers anonymous requests: no credentials, no account. Older advice that the SPORA
data sit in a bucket needing credentials is out of date — the credential requests filed on
the spora-io tracker were closed on 2026-10-28 with the news that the corpus is now in the
BioImage Archive "without access restrictions". Each dataset carries its own licence file,
and they are not all the same, so read them:

```bash
EP=https://livingobjects.ebi.ac.uk/bioimaging-01-pub
# every dataset in the public SPORA prefix
curl -s "$EP?list-type=2&prefix=spora-submissions/&delimiter=/" \
  | grep -oE '<Prefix>spora-submissions/[^<]+' | sed -E 's|.*spora-submissions/||; s|/$||' > spora_datasets.txt
wc -l < spora_datasets.txt
# each carries its own licence — read it before you use the data
while read -r d; do
  printf '%s\t%s\n' "$d" "$(curl -s "$EP/spora-submissions/$d/LICENSE" | grep -m1 -oE 'Attribution-NonCommercial|Attribution 4.0|CC0 1.0')"
done < spora_datasets.txt | sort -k2 | tee spora_licences.tsv | cut -f2 | sort | uniq -c
```

Observed on 2026-11-15: 35 datasets — 31 CC BY 4.0, 3 CC0 1.0, and one,
`klein2026explainable`, CC BY-NC 4.0. That one is non-commercial whatever the model's
licence. Pulling one tissue, with the panel, statistics and tiling `spora-io` needs to
load it, is small:

```bash
s3() { aws s3 "$@" --no-sign-request --endpoint-url https://livingobjects.ebi.ac.uk --only-show-errors; }
SRC=s3://bioimaging-01-pub/spora-submissions/damond2019map
DST=spora/damond2019map
s3 cp "$SRC/LICENSE" "$DST/LICENSE" && head -1 "$DST/LICENSE"
# everything except the images and per-cell masks: panel, metadata, statistics, tiling
s3 sync "$SRC" "$DST" --exclude "*/images/*" --exclude "segmentations/*" --exclude "metadata/cells.parquet"
# then one image and its tissue mask
T=damond2019map_aoazzubi_0000
s3 sync "$SRC/imc/1_0mpp/images/$T.ome.zarr" "$DST/imc/1_0mpp/images/$T.ome.zarr"
s3 cp "$SRC/segmentations/1_0mpp/tissue_masks/$T.npz" "$DST/segmentations/1_0mpp/tissue_masks/$T.npz"
du -sh "$DST" && find "$DST" -name "*.parquet" | wc -l
```

That took under 5 minutes and 23 MB on 2026-11-15 (EBI served about 0.1 MB/s for the image
chunks; budget accordingly for whole datasets — all of `damond2019map` is 18 GB). `spora-io` then
loads the partial copy directly — `MultiplexImagingDataset(name="damond2019map",
path="spora/damond2019map", modality="imc", ...)` returned 34 QC-passing markers for this
tissue. Upstream's dataset browser offers the same download as an `rclone` command against
the same endpoint; that was not run here.

**Across instruments.** One tissue each from four more SPORA datasets, standardized with
their published statistics and scored as in Try it on the most tissue-dense 128-pixel tile,
after embedding the 84 markers the example panel lacks:

| dataset | instrument | markers used | MSE / baseline |
|---|---|---|---|
| `schurch2020coordinated` | CODEX | 56 of 58 | 0.178 |
| `liu2022reproducible` | MIBI-TOF | 15 of 16 | 0.269 |
| `cords2024cancer` (the Try it crop) | IMC | 40 of 43 | 0.363 |
| `hoch2022multiplexed` | IMC | 37 of 41 | 0.442 |
| `damond2019map` | IMC | 34 of 37 | 0.542 |

Markers dropped are the ones without a UniProt ID or failing the dataset's own QC flag. A
fifth dataset, `lin2023high` (CyCIF, whole slide), was abandoned: its single image was still
downloading after 50 minutes. Whole-slide datasets are a different scale of download.

Treat this as a check that the pipeline handles other panels and instruments, not as
evidence of how the model generalises: these cohorts are in SPORA, and `virtues-sp31` was
trained on 31 SPORA datasets, so they are very likely training data. Held-out performance
has to be measured on images the model has not seen.

## What does not work

- **`pip install flash-attn` without CUDA.** It fails to build (`CUDA_HOME environment
  variable is not set`). The model's attention module imports it at module level, so `from
  virtues.modules.multiplex_virtues import MultiplexVirtues` raises `ModuleNotFoundError`
  until `attention_backend()` has run. Call `load_model` (or `attention_backend`) before
  importing anything from `virtues.modules`.
- **Upstream's notebooks as written, off an NVIDIA GPU.** All three hardcode CUDA.
- **Upstream's notebooks as written, for commercial use.** They load `virtues-sp32`,
  CC BY-NC 4.0.
- **Crops that are not multiples of 8.** A 130 x 130 crop raises `EinopsError` from the
  patching step (`C (H p) (W q) -> C H W (p q)`). Crop or pad to a multiple of 8, and
  preferably to 128.
- **A marker with no embedding.** The index lookup raises `KeyError` with the UniProt ID;
  compute the embedding first (above).
- **Hiding every patch of every channel.** The forward pass runs, but there is nothing left
  to condition on and the score in these blocks is undefined (`nan`).
- **`scripts/compute_tissue_masks.py` in spora-io without CUDA** — see above.
- **`virtues/train.py` and `virtues/utils/cell_tokens.py` hardcode CUDA too** (`.cuda()`,
  `device='cuda'`), and the segmentation code defaults to `device="cuda"`. Training,
  upstream's cell-token pipeline and segmentation were not attempted for this page;
  `virtues-sp31` does ship a `segmentation-head.safetensors`, under the same MIT licence.
- **`pip install virtues` or `pip install spora-io`.** Neither is on PyPI.

## Limits worth stating plainly

- **Reconstruction is the only output checked here against measured data.** The embeddings
  are produced and shaped as documented, but nothing on this page tests what they encode;
  upstream's benchmark suite does that, on GPU.
- **Expect the numbers to move on a GPU.** Half precision and the real `flash-attn` kernel
  are not what ran here.
- **One example tissue in Try it**, and four cohorts in the cross-instrument pass, all
  likely seen in training.
- **1 µm per pixel.** The SPORA training data are standardized to that resolution; feed
  other resolutions at your own risk.
- **The imputed channel is a prediction.** Some markers come back well and some do not,
  and which is which depends on the tissue. Measure it before relying on it.
