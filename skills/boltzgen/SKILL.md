---
name: boltzgen
description: Design protein and peptide binders against a target with BoltzGen — the design specification YAML, the six protocols, weight provenance, and how to read the design confidence metrics. Generation, not prediction. Needs an NVIDIA GPU to run the model; the specification, install and output checks run on CPU.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-design, generative-models, protein-structure, binding-affinity, boltzgen]
datasets: [https://files.rcsb.org/download/4ZQK.cif, https://files.rcsb.org/download/3HFM.cif, https://huggingface.co/boltzgen/boltzgen-1/resolve/main/boltzgen1_ifold.ckpt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: >-
    boltzgen 0.3.2 (PyPI) in a linux/amd64 container — torch 2.13.0+cpu, gemmi 0.7.5,
    rdkit 2026.3.5, Python 3.12.14; the three cuequivariance CUDA packages were omitted
    because no GPU is present and they are imported lazily, and the CUDA-inclusive
    resolution was checked separately by pip --dry-run. Structure blocks run against
    gemmi 0.7.5 / numpy 2.3.3 / Python 3.12.8 on macOS arm64. RCSB entries and the
    Hugging Face repositories boltzgen/boltzgen-1 and boltzgen/inference-data probed
    2026-08-28.
  executed: 13
  unverified: 2
  unverified_reason: >-
    The two unexecuted blocks are `boltzgen run` invocations. Every model step's trainer
    configuration hard-codes `accelerator: gpu` and the pipeline calls
    `torch.cuda.get_device_capability()` before any step starts, so neither can run on the
    validating host, which has no NVIDIA GPU. Re-run both on a linux x86_64 machine with a
    CUDA GPU and roughly 6 GB free for weights.
---

# BoltzGen

BoltzGen invents binders. You give it a target — a protein, a peptide, a nucleic acid, a
small molecule — and it returns protein or peptide sequences and backbones proposed to bind
it, ranked. Nothing about the binder exists beforehand: not its sequence, not its fold, not
its length.

That is the whole distinction from the other Boltz model in this registry.

| | asked | answered |
|---|---|---|
| `boltz2-nim` | here are two molecules, how do they sit together and how tightly do they bind? | one structure, one affinity |
| BoltzGen | here is one molecule, invent something that binds it | thousands of candidate binders, ranked |

They are not alternatives. BoltzGen *contains* Boltz-2: after the generative step proposes
a backbone and an inverse-folding step writes a sequence onto it, a Boltz-2 checkpoint
re-folds the designed sequence with the target to see whether the proposal survives being
predicted independently. Prediction is BoltzGen's scoring oracle, not its output.

Where this page stops: it covers getting a correct design specification in and reading what
comes out. Deciding which of ten thousand designs to order — interface confidence, self
consistency, sequence liabilities, thresholds and their provenance — is the subject of the
`binder-design-filtering` skill, which starts where this one ends.

## What you must have before the first block that runs the model

**An NVIDIA GPU, and a linux x86_64 machine to put it in.** This is not a preference. Three
of BoltzGen's hard dependencies — `cuequivariance_ops_cu12`, `cuequivariance_ops_torch_cu12`
and `cuequivariance_torch` — publish CUDA-only wheels, so the package does not install at
all on Apple silicon, an ARM server, or Windows-native Python. There is no CPU fallback:
every model step's trainer configuration hard-codes `accelerator: gpu`, and the pipeline
calls `torch.cuda.get_device_capability()` while it is still building the configuration, so
`boltzgen run` and `boltzgen configure` fail on a CPU-only host before any step starts.

| requirement | figure, measured 2026-08-28 |
|---|---|
| NVIDIA GPU | required for `design`, `inverse_folding`, `folding`, `design_folding`, `affinity` |
| linux x86_64 | the CUDA wheels publish no other platform |
| Python | `>=3.11` |
| install download | **3.5 GB** of wheels, 2.7 GB of it CUDA runtime |
| model weights | **5.6 GB** on first run for `protein-anything`, to `~/.cache` unless `--cache` or `$HF_HOME` says otherwise; a further 1.9 GB for the affinity checkpoint |
| small-molecule dictionary | **373 MB**, needed even by the CPU-only `boltzgen check` |

No account, no API key, no click-through licence, no request form. Two licences, and they
are separate questions:

- **Code** — `HannesStark/boltzgen` ships a root `LICENSE` reading `MIT License,
  Copyright (c) 2025 Hannes Stärk`. Confirmed 2026-08-28 against the repository, not the
  README badge.
- **Weights** — the public checkpoint repository `boltzgen/boltzgen-1` on Hugging Face
  declares `license: mit` in its model card and is not gated: the API reports
  `gated: false, private: false`, and an anonymous request for each checkpoint returns 200.
  Its declared base model, `boltz-community/boltz-2`, is likewise `license: mit`.

**Do not take the README's checkpoint defaults at face value.** Its command-line reference
gives `--design_checkpoints` a default of `boltzgen/boltzgen1_diverse` and
`boltzgen/boltzgen1_adherence`, and names three more one-file repositories beside them.
None of the five appears in the organisation's public model listing and all five answer
**401** to an anonymous request. The shipped code does not use them: in 0.3.2 every default
artifact resolves to `boltzgen/boltzgen-1`, the public repository, so no token is involved
and nothing is gated. The README is stale on this point and the code is what runs. The next
section shows how to confirm that for whatever version you install.

## Install

Check the tree resolves on your machine before committing to 3.5 GB. This downloads package
metadata only.

```bash
python3 -m venv .venv
./.venv/bin/pip install --disable-pip-version-check --quiet --upgrade pip
./.venv/bin/pip install --dry-run --disable-pip-version-check boltzgen==0.3.2 \
  2>&1 | grep -E "^(ERROR: (Could not find|No matching)|Would install boltzgen)" \
  || echo "resolved: every dependency has a wheel for this platform"
```

On macOS arm64, 2026-08-28:

```text
ERROR: Could not find a version that satisfies the requirement cuequivariance_ops_cu12>=0.5.0 (from boltzgen) (from versions: none)
ERROR: No matching distribution found for cuequivariance_ops_cu12>=0.5.0
```

That is the whole story of the platform requirement, told by pip. On linux x86_64 the same
command resolves 101 packages. The size of what it resolves is worth seeing before you start
it:

```bash
docker run --rm --platform linux/amd64 -v "$PWD":/out python:3.12-slim sh -c '
  pip install --quiet --root-user-action=ignore --upgrade pip &&
  pip install --dry-run --root-user-action=ignore --report /out/resolve.json boltzgen==0.3.2 >/dev/null &&
  python - <<EOF
import json, urllib.request, concurrent.futures
pkgs = json.load(open("/out/resolve.json"))["install"]
def size(p):
    req = urllib.request.Request(p["download_info"]["url"], method="HEAD")
    with urllib.request.urlopen(req, timeout=30) as r:
        return p["metadata"]["name"], int(r.headers.get("Content-Length") or 0)
with concurrent.futures.ThreadPoolExecutor(16) as ex:
    rows = dict(ex.map(size, pkgs))
cuda = {n: s for n, s in rows.items() if n.startswith(("nvidia-", "cuequivariance")) or n == "triton"}
ver = {p["metadata"]["name"]: p["metadata"]["version"] for p in pkgs}
print("packages          :", len(pkgs))
print("boltzgen / torch  :", ver["boltzgen"], "/", ver["torch"])
print("total wheels      : %.2f GB" % (sum(rows.values()) / 2**30))
print("CUDA-only wheels  : %d packages, %.2f GB" % (len(cuda), sum(cuda.values()) / 2**30))
print("largest           :", ", ".join("%s %.0f MB" % (n, s / 2**20)
      for n, s in sorted(rows.items(), key=lambda t: -t[1])[:4]))
EOF'
```

Run 2026-08-28:

```text
packages          : 101
boltzgen / torch  : 0.3.2 / 2.13.0
total wheels      : 3.46 GB
CUDA-only wheels  : 23 packages, 2.70 GB
largest           : nvidia-cublas-cu12 554 MB, torch 502 MB, nvidia-cublas 404 MB, nvidia-cudnn-cu13 349 MB
```

The install itself, on a machine that resolved:

```bash
python3 -m venv .venv
./.venv/bin/pip install --disable-pip-version-check --upgrade pip
./.venv/bin/pip install --disable-pip-version-check boltzgen==0.3.2
./.venv/bin/boltzgen --help | head -3
```

```text
usage: boltzgen [-h] [-v] {run,configure,execute,download,check,merge} ...

Boltzgen command line interface
```

Pin the version. `boltzgen` is pre-1.0 and its CLI surface — those six subcommands, the
protocol names, the step names, the flag spellings — is the thing this page describes. An
unpinned install silently moves it.

## Getting the weights yourself

`boltzgen run` downloads what it needs on first use, to `~/.cache` unless `--cache` or
`$HF_HOME` says otherwise. Two reasons to look first: to know what is coming, and to check
where the version you install actually points, because the README and the code disagree.

```python
import urllib.request, urllib.error

# What 0.3.2 resolves to. Read your own version's list out of the installed package with
#   python -c "from boltzgen.cli.boltzgen import ARTIFACTS; print(ARTIFACTS)"
# — that dict is what `boltzgen run` and `boltzgen download` both use.
ARTIFACTS = {
    "design-diverse":   ("boltzgen/boltzgen-1", "boltzgen1_diverse.ckpt",   "model"),
    "design-adherence": ("boltzgen/boltzgen-1", "boltzgen1_adherence.ckpt", "model"),
    "inverse-fold":     ("boltzgen/boltzgen-1", "boltzgen1_ifold.ckpt",     "model"),
    "folding":          ("boltzgen/boltzgen-1", "boltz2_conf_final.ckpt",   "model"),
    "affinity":         ("boltzgen/boltzgen-1", "boltz2_aff.ckpt",          "model"),
    "moldir":           ("boltzgen/inference-data", "mols.zip",             "dataset"),
}
# The repositories the README's CLI reference names for the same files.
README_REPOS = {
    "design-diverse":   ("boltzgen/boltzgen1_diverse",   "boltzgen1_diverse.ckpt"),
    "design-adherence": ("boltzgen/boltzgen1_adherence", "boltzgen1_adherence.ckpt"),
    "inverse-fold":     ("boltzgen/boltzgen1_ifold",     "boltzgen1_ifold.ckpt"),
    "folding":          ("boltzgen/boltz2_conf_final",   "boltz2_conf_final.ckpt"),
    "affinity":         ("boltzgen/boltz2_affinity",     "boltz2_aff.ckpt"),
}


def probe(repo, fname, kind="model"):
    seg = "" if kind == "model" else "datasets/"
    url = f"https://huggingface.co/{seg}{repo}/resolve/main/{fname}"
    req = urllib.request.Request(url, method="HEAD",
                                 headers={"User-Agent": "boltzgen-skill-check"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            # Hugging Face reports the real object size out of band; Content-Length is
            # the LFS pointer for a large file.
            return r.status, int(r.headers.get("x-linked-size")
                                 or r.headers.get("Content-Length") or 0)
    except urllib.error.HTTPError as e:
        return e.code, 0


total = 0
print(f"{'artifact':16} {'repository the code uses':28} {'anon':>5} {'size':>9}  README repo")
for name, (repo, fname, kind) in ARTIFACTS.items():
    code, size = probe(repo, fname, kind)
    total += size
    other = README_REPOS.get(name)
    alt = probe(*other)[0] if other else "-"
    print(f"{name:16} {repo:28} {code:>5} {size / 2**30:6.2f} GB  {alt}")
print(f"\n{total / 2**30:.1f} GB for every artifact, all of it anonymous")

assert all(probe(r, f, k)[0] == 200 for r, f, k in ARTIFACTS.values()), \
    "every artifact the code resolves to must be fetchable without credentials"
```

```text
artifact         repository the code uses      anon      size  README repo
design-diverse   boltzgen/boltzgen-1            200   1.80 GB  401
design-adherence boltzgen/boltzgen-1            200   1.80 GB  401
inverse-fold     boltzgen/boltzgen-1            200   0.01 GB  401
folding          boltzgen/boltzgen-1            200   1.94 GB  401
affinity         boltzgen/boltzgen-1            200   1.92 GB  401
moldir           boltzgen/inference-data        200   0.36 GB  -

7.8 GB for every artifact, all of it anonymous
```

Every artifact 0.3.2 reaches for is anonymously fetchable, so `--models_token` — which
carries a default value in the released package — is not doing anything for these
repositories. Do not treat that default as a credential you are relying on; if a version
moves the defaults to the repositories in the last column, this block is how you find out.

Stage them yourself with `boltzgen download`, for an air-gapped machine or to pin what a
run used. It takes any of `design-diverse`, `design-adherence`, `inverse-fold`, `folding`,
`affinity`, `moldir` or `all`, and writes a Hugging Face cache tree under `--cache` that
`boltzgen run --cache` then reads. The two artifacts the CPU-only `check` path needs:

```bash
./.venv/bin/boltzgen download inverse-fold moldir --cache ./weights
du -sh ./weights
```

```text
Warning: You are sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN to enable higher rate limits and faster downloads.
Using model artifact: weights/models--boltzgen--boltzgen-1/snapshots/c1be29e1f82ffcc72264f64b993c43fb4e0d17f0/boltzgen1_ifold.ckpt
Downloading inverse-fold to weights/models--boltzgen--boltzgen-1/snapshots/c1be29e1f82ffcc72264f64b993c43fb4e0d17f0/boltzgen1_ifold.ckpt
Using dataset artifact: weights/datasets--boltzgen--inference-data/snapshots/c3d36fd276e9caf098c75d4113c6d5eb320b1a4c/mols.zip
Downloading moldir to weights/datasets--boltzgen--inference-data/snapshots/c3d36fd276e9caf098c75d4113c6d5eb320b1a4c/mols.zip
397M	./weights
```

The warning on the first line is the access test answering itself: the download is
unauthenticated and it works. Add `design-diverse design-adherence folding` for a real run,
which brings the total to about 5.9 GB, and `affinity` if the target is a small molecule.

To point at loose files instead of a cache tree, pass paths — this is also how you pin a
specific checkpoint after downloading it by hand:

```bash
./.venv/bin/boltzgen run design.yaml \
  --output run1 --protocol protein-anything \
  --design_checkpoints  weights/boltzgen1_diverse.ckpt weights/boltzgen1_adherence.ckpt \
  --inverse_fold_checkpoint weights/boltzgen1_ifold.ckpt \
  --folding_checkpoint  weights/boltz2_conf_final.ckpt \
  --moldir              weights/mols.zip
```

`--design_checkpoints` takes several paths and splits the design budget equally between
them; the default uses two. They are named for what they emphasise — diversity of the
generated set, and adherence to what the specification asked for — and the project documents
no more than that, so running only one narrows the population you later filter in a way you
cannot easily reason about. `--moldir` takes the `.zip` directly; do not unpack it.

## Protocols

`--protocol` is not a style setting. It changes which pipeline steps run and what the
inverse-folding step is allowed to emit.

| protocol | design | what changes |
|---|---|---|
| `protein-anything` | proteins binding proteins or peptides | the default; adds a `design_folding` step that re-folds the binder alone |
| `peptide-anything` | linear or cyclic peptides | no cysteine in inverse folding, no `design_folding`, no hydrophobic-patch metric |
| `protein-small_molecule` | proteins binding a small molecule | adds an `affinity` step using the Boltz-2 affinity checkpoint |
| `antibody-anything` | antibody CDRs on an existing framework | no cysteine, no `design_folding` |
| `nanobody-anything` | nanobody CDRs | same settings as `antibody-anything` |
| `protein-redesign` | redesigning or optimising an existing protein | no `design_folding`; uses the file's `design:` block rather than a separate binder chain |

`protein-redesign` also replaces the ranking metrics wholesale: the design-versus-target
columns are dropped and ranking falls back to `design_residue_iptm`, `iptm`, `ptm` and the
re-folding RMSD, because there is no separate binder chain to score against a target.

The cysteine rule is the one that changes results silently. Under `peptide-anything`,
`antibody-anything` and `nanobody-anything`, inverse folding refuses to place cysteine, so a
cyclic peptide you intended to close with a disulfide comes back without one unless you
write the cysteines into the specification yourself and declare the bond. Override the
default with `--inverse_fold_avoid ''`.

## The design specification

One YAML file describes one design job: what to invent, what to invent it against, and
which parts of the target matter. Everything is a list under `entities`, and each entry is
one of `protein`, `dna`, `rna`, `ligand` or `file`.

```yaml
entities:
  # A designed binder. The number is a length range, sampled per design.
  - protein:
      id: D
      sequence: 60..90

  # The target, read out of a structure file.
  - file:
      path: 4zqk.cif             # resolved relative to THIS yaml, not your shell's cwd
      include:
        - chain:
            id: A                # label_asym_id — see the next section
      binding_types:
        - chain:
            id: A
            binding: 37,39,41,96..108
        - chain:
            id: B
            not_binding: all
```

The `sequence:` field of a designed chain is a small language, not a sequence. Digits are
counts of residues to invent; letters are residues you fix.

| written | means |
|---|---|
| `17` | invent exactly 17 residues |
| `60..90` | invent between 60 and 90, resampled for each design |
| `3..5C6C3` | invent 3–5, then a fixed Cys, then invent 6, then a fixed Cys, then invent 3 |
| `15..20AAAAAAVTTTT18PPP` | mixed fixed and designed stretches, in order |

Ranges are inclusive at both ends, and a range resamples per design — so with
`--diffusion_batch_size` above 1, every design in a batch shares one sampled length. A
batch size close to the total design count therefore samples the length space badly.

Other keys on a `file` entity, all optional:

| key | effect |
|---|---|
| `include` | which chains and residues of the file to use at all; default is everything |
| `binding_types` | `binding:` / `not_binding:` — where the binder should and should not sit |
| `structure_groups` | `visibility: 1` gives the model the structure, `0` withholds it, `2` puts a group in its own frame so its position relative to group 1 is unspecified |
| `design` | residues *inside the loaded file* to redesign — this is how CDR and `protein-redesign` jobs are written |
| `secondary_structure` | `helix:` / `sheet:` / `loop:` on designed positions |
| `residue_constraints` | `allowed:` / `disallowed:` amino acids at a designed `position:` |
| `exclude`, `include_proximity` | drop chains, or keep only what is near something |
| `reset_res_index` | renumber a chain's residues consecutively **after** every selector above has been applied — it does not change what `res_index` means in `include` or `binding` |

`constraints:` sits beside `entities`, not inside it, and takes `bond:` entries naming
`[chain_id, residue, atom]` on each side — a disulfide, or a staple to a ligand. Residue
numbers in a constraint are counted **as if every length range had sampled its minimum**,
which is the one place in the format where the number you write is not a position in the
finished chain.

## Chain and residue selectors: the one that silently designs the wrong site

Every `id:` in a design specification is an mmCIF **`label_asym_id`**, and every residue
number is a 1-based index into that chain's **`_entity_poly_seq`** — the deposited sequence,
which is `label_seq_id`. Neither is what a structure viewer puts in front of you by default,
and neither is what a paper's numbering uses. BoltzGen's own documentation flags this; what
follows is what it costs, measured.

Three separate consequences, and only the first usually produces an error:

1. **The chain letter can be different.** Author chain ids are whatever the depositors
   chose; `label_asym_id` is assigned in order over every entity in the file, ligands and
   waters included. A letter that is not a `label_asym_id` at all raises
   `Specified chain id … not in file`. A letter that happens to be one — the ligand or water
   chain, or a different polymer — is accepted and gives you the wrong molecule.
2. **The residue numbers are almost always different.** Author numbering usually follows the
   parent protein, so it carries the offset of whatever construct was crystallised.
3. **Unresolved residues still occupy an index.** `_entity_poly_seq` holds the whole
   deposited sequence, so a residue with no density is counted. Selecting it is legal, and
   the model is being told to attend to a position for which the file has no coordinates.

Read the file before you write the specification:

```python
import urllib.request, gemmi

# PD-1 / PD-L1, and an anti-lysozyme Fab. Public RCSB entries, no account.
for pdb in ("4ZQK", "3HFM"):
    urllib.request.urlretrieve(
        f"https://files.rcsb.org/download/{pdb}.cif", f"{pdb.lower()}.cif")

def chain_table(path):
    """Every polymer chain BoltzGen can see, keyed the way a design spec keys it."""
    st = gemmi.read_structure(path)
    st.setup_entities()
    auth_of = {r.subchain: ch.name for ch in st[0] for r in ch}
    rows = []
    for sub in st[0].subchains():
        if sub.check_polymer_type() == gemmi.PolymerType.Unknown:
            continue                       # ligands and waters are not design targets
        label = sub.subchain_id()
        offsets = sorted({r.seqid.num - r.label_seq for r in sub if r.label_seq})
        rows.append({
            "yaml_id": label,                  # what `include: chain: id:` takes
            "auth_asym_id": auth_of[label],    # what a structure viewer shows
            "observed": len(sub),
            "first_label_seq": sub[0].label_seq,
            "first_auth_seq": sub[0].seqid.num,
            "auth_minus_label": offsets,
        })
    return rows

for path in ("4zqk.cif", "3hfm.cif"):
    print(path)
    for r in chain_table(path):
        print(f"  id: {r['yaml_id']:<3} viewer shows chain {r['auth_asym_id']:<3} "
              f"{r['observed']:>4} obs  label_seq starts {r['first_label_seq']:>3}  "
              f"auth_seq starts {r['first_auth_seq']:>4}  "
              f"auth-label {r['auth_minus_label']}")
```

```text
4zqk.cif
  id: A   viewer shows chain A    115 obs  label_seq starts   1  auth_seq starts   18  auth-label [17]
  id: B   viewer shows chain B    106 obs  label_seq starts   1  auth_seq starts   33  auth-label [32]
3hfm.cif
  id: A   viewer shows chain L    214 obs  label_seq starts   1  auth_seq starts    1  auth-label [0]
  id: B   viewer shows chain H    215 obs  label_seq starts   1  auth_seq starts    1  auth-label [0]
  id: C   viewer shows chain Y    129 obs  label_seq starts   1  auth_seq starts    1  auth-label [0]
```

`3hfm.cif` is the loud failure: its viewer chains are `L`, `H` and `Y`, so `id: H` for the
antibody heavy chain raises `Specified chain id H not in file` and you fix it in seconds.
`4zqk.cif` is the quiet one — the letters agree, the numbers do not, and nothing complains.

Here is what that costs. PD-L1's binding site for PD-1 is a published, checkable set of
residues; the block computes it from the structure rather than trusting a citation:

```python
import gemmi, numpy as np

st = gemmi.read_structure("4zqk.cif")
st.setup_entities()
st.remove_ligands_and_waters()

def polymer(label_asym_id):
    return next(s for s in st[0].subchains() if s.subchain_id() == label_asym_id)

target, partner = polymer("A"), polymer("B")          # PD-L1, PD-1

def coords(span):
    xyz, owner = [], []
    for res in span:
        for atom in res:
            xyz.append([atom.pos.x, atom.pos.y, atom.pos.z])
            owner.append(res.label_seq)
    return np.array(xyz), np.array(owner)

tx, towner = coords(target)
px, _ = coords(partner)
d = np.linalg.norm(tx[:, None, :] - px[None, :, :], axis=-1)
site = sorted(set(towner[(d <= 4.5).any(axis=1)].tolist()))

by_label = {r.label_seq: r for r in target}
print("PD-L1 (label_asym A) residues within 4.5 A of PD-1")
print("  res_index, what the YAML wants  :", ",".join(str(i) for i in site))
print("  auth_seq,  what a viewer shows  :",
      ",".join(str(by_label[i].seqid.num) for i in site))

print(f"\n{'res_index':>9}  {'residue you meant':<20} {'residue auth numbering gives':<28}")
for i in site[:8]:
    right = by_label[i]
    wrong = by_label.get(right.seqid.num)
    got = f"{wrong.name} (res_index {wrong.label_seq})" if wrong else "out of range"
    print(f"{i:>9}  {right.name + ' auth ' + str(right.seqid.num):<20} {got:<28}")

shifted = {by_label[i].seqid.num for i in site}
overlap = set(site) & shifted
print(f"\n{len(site)} interface residues; pasting the viewer's numbers instead selects "
      f"{len(overlap)} of them.")
```

```text
PD-L1 (label_asym A) residues within 4.5 A of PD-1
  res_index, what the YAML wants  : 2,6,9,37,39,41,49,59,96,98,100,102,103,104,105,106,107,108
  auth_seq,  what a viewer shows  : 19,23,26,54,56,58,66,76,113,115,117,119,120,121,122,123,124,125

res_index  residue you meant    residue auth numbering gives
        2  PHE auth 19          MET (res_index 19)          
        6  VAL auth 23          CYS (res_index 23)          
        9  ASP auth 26          PRO (res_index 26)          
       37  ILE auth 54          GLU (res_index 54)          
       39  TYR auth 56          ASP (res_index 56)          
       41  GLU auth 58          LYS (res_index 58)          
       49  GLN auth 66          GLN (res_index 66)          
       59  VAL auth 76          SER (res_index 76)          

18 interface residues; pasting the viewer's numbers instead selects 0 of them.
```

The auth numbers on the right — 54, 56, 66, 113, 115, 117, 121, 123, 125 — are the PD-L1
contact residues as the literature names them. Written into `binding:` unconverted, they
select **none** of the site, and the run completes normally: eighteen residues were named,
eighteen residues were used, the model bound the wrong face of the protein. There is no
error, no warning, and nothing in the output that looks wrong.

### Validate the specification against the file it points at

```python
import re, gemmi, yaml, pathlib

spec = """
entities:
  # The binder BoltzGen will invent: 60-90 residues, sequence and structure both new.
  - protein:
      id: D
      sequence: 60..90

  # The target, read out of a real structure file.
  - file:
      path: 4zqk.cif
      include:
        - chain:
            id: A            # label_asym_id, not the chain letter a viewer shows
      binding_types:
        - chain:
            id: A
            binding: 37,39,41,96..108
        - chain:
            id: B
            not_binding: all
"""
pathlib.Path("pdl1_binder.yaml").write_text(spec)


def expand(ranges, n):
    """1-based inclusive residue selectors: '5', '5..9', '..9', '9..', comma-joined."""
    out = []
    for part in str(ranges).split(","):
        part = part.strip()
        if re.fullmatch(r"\d+", part):
            out.append(int(part))
        elif re.fullmatch(r"\d+\.\.\d+", part):
            a, b = map(int, part.split("..")); out += list(range(a, b + 1))
        elif re.fullmatch(r"\.\.\d+", part):
            out += list(range(1, int(part[2:]) + 1))
        elif re.fullmatch(r"\d+\.\.", part):
            out += list(range(int(part[:-2]), n + 1))
        elif part == "all":
            out += list(range(1, n + 1))
        else:
            raise ValueError(f"malformed residue range {part!r}")
    return out


def chains_of(path):
    """label_asym_id -> (auth chain, SEQRES length, set of label_seq with coordinates)."""
    st = gemmi.read_structure(str(path)); st.setup_entities()
    auth_of = {r.subchain: ch.name for ch in st[0] for r in ch}
    seqres = {}
    for ent in st.entities:
        for sub in ent.subchains:
            seqres[sub] = len(ent.full_sequence)
    out = {}
    for sub in st[0].subchains():
        if sub.check_polymer_type() == gemmi.PolymerType.Unknown:
            continue
        lab = sub.subchain_id()
        out[lab] = (auth_of[lab], seqres.get(lab, len(sub)),
                    {r.label_seq for r in sub})
    return out


def validate(spec_path):
    spec_path = pathlib.Path(spec_path)
    doc = yaml.safe_load(spec_path.read_text())
    problems, notes = [], []
    for ent in doc["entities"]:
        kind, body = next(iter(ent.items()))
        if kind == "protein":
            seq = str(body.get("sequence", ""))
            if not re.fullmatch(r"(\d+(\.\.\d+)?|[ACDEFGHIKLMNPQRSTVWY]+)+", seq):
                problems.append(f"protein {body.get('id')}: malformed sequence {seq!r}")
            continue
        if kind != "file":
            continue
        # File paths resolve against the YAML's directory, not the working directory.
        target = (spec_path.parent / body["path"]).resolve()
        if not target.exists():
            problems.append(f"file: {body['path']} not found next to {spec_path.name}")
            continue
        avail = chains_of(target)
        for section in ("include", "binding_types", "design", "structure_groups"):
            for item in body.get(section, []) or []:
                block = item.get("chain") or item.get("group") or {}
                cid = block.get("id")
                if cid is None:
                    problems.append(f"{section}: entry with no id"); continue
                if cid not in avail:
                    problems.append(
                        f"{section}: id {cid!r} is not a label_asym_id in "
                        f"{body['path']} — it has {sorted(avail)} "
                        f"(viewer chains {sorted({v[0] for v in avail.values()})})")
                    continue
                auth, n, resolved = avail[cid]
                for key in ("res_index", "binding", "not_binding"):
                    if key not in block:
                        continue
                    picked = expand(block[key], n)
                    bad = [i for i in picked if not 1 <= i <= n]
                    if bad:
                        problems.append(
                            f"{section} {cid}.{key}: {bad[:5]} outside 1..{n}")
                    missing = [i for i in picked if 1 <= i <= n and i not in resolved]
                    if missing:
                        notes.append(
                            f"{section} {cid}.{key}: {len(missing)} of {len(picked)} "
                            f"residues have no coordinates in the file "
                            f"(res_index {missing[:5]}) — they still occupy an index")
    return problems, notes


problems, notes = validate("pdl1_binder.yaml")
print("pdl1_binder.yaml   :", problems or "valid")
for n in notes:
    print("  note:", n)

BAD = {
  "viewer chain letter": {"entities": [{"file": {"path": "3hfm.cif",
      "include": [{"chain": {"id": "H"}}]}}]},
  "auth residue numbers": {"entities": [{"file": {"path": "4zqk.cif",
      "include": [{"chain": {"id": "A", "res_index": "113..125"}}]}}]},
  "zero-based range":     {"entities": [{"file": {"path": "4zqk.cif",
      "include": [{"chain": {"id": "A", "res_index": "0..10"}}]}}]},
}
print()
for label, doc in BAD.items():
    pathlib.Path("bad.yaml").write_text(yaml.safe_dump(doc))
    p, _ = validate("bad.yaml")
    print(f"rejects {label:22}: {p[0] if p else 'NOT CAUGHT'}")
```

```text
pdl1_binder.yaml   : valid
  note: binding_types B.not_binding: 12 of 118 residues have no coordinates in the file (res_index [53, 54, 55, 56, 57]) — they still occupy an index

rejects viewer chain letter   : include: id 'H' is not a label_asym_id in 3hfm.cif — it has ['A', 'B', 'C'] (viewer chains ['H', 'L', 'Y'])
rejects auth residue numbers  : include A.res_index: [116, 117, 118, 119, 120] outside 1..115
rejects zero-based range      : include A.res_index: [0] outside 1..115
```

**Read what that third result does and does not prove.** The auth-numbered selection was
caught only because part of it ran off the end of a 115-residue chain. An offset that stays
in range — which is the common case, and exactly the PD-L1 case above — passes every static
check there is. Range checking finds typos. Only converting the numbers finds this.

Two more things the block shows. `not_binding: all` on chain B silently covers 12 residues
that have no coordinates in the file, because the selector counts the deposited sequence.
And the SEQRES length, not the observed residue count, is the upper bound — chain B has 106
observed residues and 118 valid indices.

### How often this actually bites

Run over eighteen public entries chosen to span what people design against — checkpoint
complexes, antibody-antigen pairs, a TCR-pMHC, viral spikes, and small single-chain
controls:

```python
import os, urllib.request, gemmi

# Eighteen entries spanning what people actually design against: an immune checkpoint
# complex, three antibody-antigen complexes, a TCR-pMHC, two viral spikes, an enzyme
# with eight chains, and small single-chain controls.
IDS = ["4ZQK", "3HFM", "2DD8", "1YY9", "1AO7", "6VXX", "6XR8", "7KMG", "8R3A",
       "6M1U", "7RPZ", "1G13", "1BRS", "5O45", "1UBQ", "1HHP", "2HHB", "1CRN"]

rows = []
for pdb in IDS:
    fn = f"{pdb.lower()}.cif"
    if not os.path.exists(fn):
        urllib.request.urlretrieve(f"https://files.rcsb.org/download/{pdb}.cif", fn)
    st = gemmi.read_structure(fn); st.setup_entities()
    auth_of = {r.subchain: ch.name for ch in st[0] for r in ch}
    seqres = {s: len(e.full_sequence) for e in st.entities for s in e.subchains}
    for sub in st[0].subchains():
        if sub.check_polymer_type() == gemmi.PolymerType.Unknown:
            continue
        lab = sub.subchain_id()
        rows.append((pdb, lab, auth_of[lab], seqres.get(lab, len(sub)), len(sub),
                     sorted({r.seqid.num - r.label_seq for r in sub if r.label_seq})))

chain = [r for r in rows if r[1] != r[2]]
num   = [r for r in rows if r[5] != [0]]
multi = [r for r in num if len(r[5]) > 1]
gaps  = [r for r in rows if r[3] != r[4]]
print(f"{len(rows)} polymer chains over {len(IDS)} entries")
print(f"  design id differs from the viewer's chain letter : {len(chain):>2}"
      f"  ({100*len(chain)//len(rows)}%)")
print(f"  auth_seq_id differs from res_index               : {len(num):>2}"
      f"  ({100*len(num)//len(rows)}%)")
print(f"    ...by a non-constant offset                    : {len(multi):>2}")
print(f"  SEQRES longer than the observed residues         : {len(gaps):>2}"
      f"  ({100*len(gaps)//len(rows)}%)")
print("\nworst cases:")
for r in sorted(rows, key=lambda r: -(len(r[5]) + (r[1] != r[2]) + (r[3] - r[4]) / 500)):
    if (r[1] != r[2]) + (r[5] != [0]) + (r[3] != r[4]) < 3:
        continue
    print(f"  {r[0]} id={r[1]:<2} viewer={r[2]:<2} indices={r[3]:<5} with coords={r[4]:<5} "
          f"auth-label offsets={r[5]}")
```

```text
56 polymer chains over 18 entries
  design id differs from the viewer's chain letter :  8  (14%)
  auth_seq_id differs from res_index               : 16  (28%)
    ...by a non-constant offset                    :  6
  SEQRES longer than the observed residues         : 34  (60%)

worst cases:
  2DD8 id=A  viewer=H  indices=245   with coords=220   auth-label offsets=[-5, -4, -3, -2, -1, 0]
  2DD8 id=B  viewer=L  indices=213   with coords=212   auth-label offsets=[0, 1]
  2DD8 id=C  viewer=S  indices=202   with coords=192   auth-label offsets=[316]
```

Three findings worth carrying:

- **Six of the sixteen renumbered chains carry a non-constant offset**, so "subtract a
  constant" is not a workaround. `2DD8` — an antibody bound to a coronavirus receptor
  binding domain, which is the exact shape of a real design job — needs six different
  offsets on one chain, has viewer chains `H/L/S` against design ids `A/B/C`, and hides 25
  residues with no coordinates. All three problems, one file.
- **Sixty percent of chains have indices with no coordinates.** On `6VXX`, the SARS-CoV-2
  spike, that is 309 of 1281 positions. A `binding:` range crossing one of those regions is
  legal and is asking the model to attend to a position the file does not describe.
- **`7RPZ`, which ships in BoltzGen's own example directory, carries offsets of -2 and -1.**
  The trap is not confined to exotic entries.

Structures predicted by AlphaFold and deposited in AlphaFold DB have `label_seq_id` equal to
`auth_seq_id` and no unresolved residues, so a design job against a predicted target avoids
all three. Convert anyway — the habit is what protects the experimental case.


## `boltzgen check` — the only part of the pipeline that runs without a GPU

`check` parses a specification, resolves it against the target file, reports how many
residues will be designed and how many are unresolved, and writes an annotated mmCIF you can
open in a viewer to see the binding site you actually selected. It runs the parser, not the
model, so it needs no GPU and no checkpoint — only the 373 MB molecule dictionary.

```bash
./.venv/bin/boltzgen check pdl1_binder.yaml --output checked --cache ./weights
```

```text
Warning: You are sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN to enable higher rate limits and faster downloads.
Using dataset artifact: weights/datasets--boltzgen--inference-data/snapshots/c3d36fd276e9caf098c75d4113c6d5eb320b1a4c/mols.zip
Creating output directory: checked
************** Checking design spec: pdl1_binder.yaml **************
Total designed residues: 82
There are 0 unresolved residues and 47 unresolved atoms in the target.
Design specification visualization is written to checked/pdl1_binder.cif
********************************************************************
```

Run it on every specification before spending GPU time. It catches the wrong chain id, an
out-of-range residue index and a malformed range immediately, and its output file is the
only way to see a wrong-but-in-range selection before the run.

### What the checked file actually contains

Two things about the output are not what the command's description implies, and both are
worth seeing before you open it in a viewer.

```python
import gemmi
from collections import Counter

doc = gemmi.cif.read("checked/pdl1_binder.cif")
block = doc.sole_block()

chains = Counter(block.find_loop("_atom_site.label_asym_id"))
print("chains written        :", dict(chains))

b = Counter(float(v) for v in block.find_loop("_atom_site.B_iso_or_equiv"))
print("B_iso_or_equiv values :", dict(sorted(b.items())))

qa = block.find("_ma_qa_metric.", ["name", "type"])
print("_ma_qa_metric declares:", [(r[0], r[1]) for r in qa])
vals = Counter(float(v) for v in block.find_loop("_ma_qa_metric_local.metric_value"))
print("its metric_value      :", dict(sorted(vals.items())))

# The binder chain the spec asked for is not in this file: check writes only residues
# that already have coordinates, and nothing has been designed yet.
assert "D" not in chains, "the designed chain should not be in a check output"
# B-factor is 100 per designed residue plus 80 per declared binding-site residue.
assert set(b) <= {0.0, 80.0, 100.0, 180.0}, "B-factor is a design/binding code"
# The table is declared as pLDDT and holds the design colour weight times 100.
assert set(vals) <= {80.0, 100.0}, "the pLDDT column carries a colour flag"
assert vals[100.0] == 16, "one entry per residue named in binding:"
print("\nOnly the target is written — the designed chain has no coordinates yet.")
print("B_iso_or_equiv: 100 per designed residue + 80 per declared binding-site residue.")
print("_ma_qa_metric_local is declared pLDDT and holds 100 for binding-site residues,")
print("80 for the rest. Nothing in this file was predicted.")
```

```text
chains written        : {'A': 874}
B_iso_or_equiv values : {0.0: 745, 80.0: 129}
_ma_qa_metric declares: [('pLDDT', 'pLDDT')]
its metric_value      : {80.0: 99, 100.0: 16}

Only the target is written — the designed chain has no coordinates yet.
B_iso_or_equiv: 100 per designed residue + 80 per declared binding-site residue.
_ma_qa_metric_local is declared pLDDT and holds 100 for binding-site residues,
80 for the rest. Nothing in this file was predicted.
```

**The binder is not in the file.** `check` writes only residues that already have
coordinates, and nothing has been designed yet — so the visualisation is the target, with
your binding-site selection marked on it. That is still the check you want (it is the only
way to see a wrong-but-in-range selection before the run), but do not go looking for the
designed chain.

**Both annotation columns are named after confidence and carry neither.**
`_atom_site.B_iso_or_equiv` is `100` per designed residue plus `80` per declared
binding-site residue, so it takes one of four values and is `0` or `80` in a target-only
file like this one. `_ma_qa_metric_local` is *declared* as pLDDT in `_ma_qa_metric` and
holds the design colour weight times 100 — `100` for a binding-site residue, `80` for the
rest. Colouring by either is what makes the selection visible, which is the point; reading
either as model confidence would be reading a prediction that has not happened yet.

**`Total designed residues` is resampled every time you run `check`.** The specification
above asks for `60..90`, and three consecutive runs reported 86, 63 and 76. The number is a
draw from the range, not a property of the specification, so do not treat a change in it as
a change in what you asked for.

## Running the pipeline

```bash
./.venv/bin/boltzgen run pdl1_binder.yaml \
  --output run1 \
  --protocol protein-anything \
  --num_designs 50 \
  --budget 30
```

Seven steps run in order, and `--steps` restricts to any subset of them:

| step | what it does | needs |
|---|---|---|
| `design` | the generative model proposes backbones for the binder | GPU |
| `inverse_folding` | writes a sequence onto each backbone | GPU |
| `folding` | re-folds the designed sequence *with* the target, using Boltz-2 | GPU |
| `design_folding` | re-folds the binder *alone*, to see whether it holds its shape unaided | GPU |
| `affinity` | Boltz-2 affinity prediction, small-molecule targets only | GPU |
| `analysis` | computes interface and structure metrics over the refolded complexes | CPU-bound |
| `filtering` | applies hard filters, ranks, and picks a diverse subset | seconds |

`--num_designs` is the count of *intermediate* designs generated; `--budget` is how many
survive into the final diversity-optimised set, and defaults to 30. Start at 50 to confirm
the specification behaves, then raise it — the project's own guidance is 10,000 to 60,000
intermediate designs for a real campaign. That ratio is the point of the pipeline rather
than an inefficiency in it: what you are buying with GPU time is a population large enough
that filtering has something to choose from. Cost is roughly linear in `--num_designs` and
grows with target size; a 50-design smoke test is minutes on a datacentre GPU and a full
campaign is GPU-days. Those are orders of magnitude, not measurements — no timing on this
page was measured, because the validating host has no GPU.

Two flags that save whole runs:

- **`--reuse`** restarts an interrupted run without losing finished designs, and generates
  only the shortfall. There is no reason not to pass it.
- **`--steps filtering`** re-runs only the last step against results you already have, in
  seconds. Filtering is meant to be re-run with different thresholds; regenerating designs
  to change a cut-off is wasted GPU time. `boltzgen merge` combines several output
  directories first, so parallel runs across machines can be filtered as one population.

## What comes out

```text
run1/
  config/, steps.yaml                       what was actually run
  intermediate_designs/                     backbones from the design step (.cif + .npz)
  intermediate_designs_inverse_folded/      backbones with sequences on them
    refold_cif/                             the designed binder re-folded WITH the target
    refold_design_cif/                      the binder re-folded alone
    aggregate_metrics_analyze.csv
    per_target_metrics_analyze.csv
  final_ranked_designs/
    intermediate_ranked_<N>_designs/        top N on quality alone
    final_<budget>_designs/                 quality plus diversity — the set to order from
    all_designs_metrics.csv                 every design filtering considered
    final_designs_metrics_<budget>.csv      the selected set
    results_overview.pdf
```

Two things about that tree matter more than the rest.

**The structures in `final_ranked_designs/` are copies of `refold_cif/`, not of the
generated backbones.** What you order is the re-prediction, which is the only structure that
was produced without knowing the answer.

**In `intermediate_designs_inverse_folded/`, designed residues have backbone coordinates
only — every side-chain atom is at `(0, 0, 0)`.** Those files are an intermediate, not a
model. Anything that computes packing, contacts or SASA over them will produce numbers
without complaining. Use `refold_cif/`.

## Reading the design confidence metrics

The metric columns in `all_designs_metrics.csv` are not the fields you know from a folding
model, and three of them have names that invite the wrong reading. The definitions below
come from the shipped scoring code, and the block after them runs that code to show what the
names mean.

| column | what it actually measures |
|---|---|
| `ptm` | pTM over the whole complex — the familiar one |
| `iptm` | pTM over all cross-chain token pairs |
| `design_ptm` | pTM restricted to pairs **inside the designed chain** — the binder's own fold, and nothing about the target |
| `target_ptm` | the same, restricted to the target |
| `design_iptm` | pTM over pairs between the **designed chain** and the target |
| `design_to_target_iptm` | pTM over pairs between the **designed residues** and the target |
| `design_residue_iptm` | pTM over cross-chain pairs where either side is a designed residue — the one that still works when every chain contains designed residues |
| `design_iiptm` | as `design_to_target_iptm`, restricted to designed residues with an atom within 8 Å of the target |
| `design_to_target_ipsae` / `target_to_design_ipsae` | ipSAE between the designed chain and the target, computed in each direction over pairs whose PAE is under 15 Å |
| `design_ipsae_min` | the smaller of those two |
| `min_design_to_target_pae` | the single best predicted aligned error across the interface |
| `delta_sasa_original` / `_refolded` | buried surface area, on the generated and the re-folded structure |
| `plip_hbonds` / `plip_saltbridge` | interface hydrogen bonds and salt bridges |
| `filter_rmsd`, `filter_rmsd_design` | how far the re-fold moved from the design, with and without the target |
| `affinity_probability_binary1` | Boltz-2 binder probability, `protein-small_molecule` only |

**`design_ptm` is not the complex pTM.** Everywhere else in this field a `ptm` is global.
Here it is masked to the designed chain, so a binder that folds beautifully and misses the
target entirely scores as well as one that binds. It is a useful number — it is the closest
thing to "is this a real protein" — but it is not a binding score, and ranking on it ranks
foldability.

**`min_design_to_target_pae` is a minimum over the whole interface block**, not a mean. One
confidently placed pair sets it, so it is the most optimistic number in the row and moves
independently of how much of the interface is real. The default ranking uses it as
`neg_min_design_to_target_pae` — negated, because ranking maximises — alongside the ipTM
columns rather than instead of them.

**`design_iptm` and `design_to_target_iptm` differ only when part of a chain is designed.**
For a de novo binder the whole chain is new, the two masks coincide, and the numbers are
identical. For CDR grafting or `protein-redesign`, `design_mask` is a handful of residues
inside a chain that is otherwise fixed, and the two diverge — `design_iptm` scores the whole
scaffold against the target while `design_to_target_iptm` scores only what you changed. The
default ranking uses `design_to_target_iptm`.

**Under `protein-redesign` it uses neither**, and the reason is worth knowing: "target" is
defined as everything outside the designed *chains*, so when every chain carries designed
residues there is no target left and both columns collapse to zero. That protocol overrides
the ranking to `design_residue_iptm`, `iptm`, `ptm` and the re-folding RMSD instead. If you
ever see `design_to_target_iptm` at exactly 0 across a whole run, this is why.

BoltzGen's scoring functions import and run without weights or a GPU, so this is checkable
rather than something to take on trust:

```python
import torch
from boltzgen.model.layers.confidence_utils import compute_ptms
from boltzgen.data import const

BINS = 64
CENTERS = torch.arange(0.5 * 32 / BINS, 32.0, 32 / BINS)      # the PAE head's bins


def pae_logits(target_pae, sigma=1.5):
    """Logits whose softmax peaks at the requested PAE for every token pair."""
    return -((CENTERS.view(1, 1, 1, -1) - target_pae.unsqueeze(-1)) ** 2) / (2 * sigma**2)


def scene(n_target, n_binder, designed, intra=1.0, designed_iface=1.0,
          scaffold_iface=1.0, sep=6.0):
    """A two-chain complex; `designed` is the slice of the binder chain being designed.

    `designed_iface` is the PAE between the designed residues and the target;
    `scaffold_iface` is the PAE between the rest of the binder chain and the target.
    They differ only for a partial redesign — a CDR graft on a fixed framework.
    """
    n = n_target + n_binder
    asym = torch.tensor([0] * n_target + [1] * n_binder)
    # Both masks are boolean: the interface-contact step scatters a bool into
    # zeros_like(design_mask), so a float mask raises inside compute_ptms.
    chain_design = torch.zeros(n, dtype=torch.bool)
    chain_design[n_target:] = True                  # the whole binder chain
    design = torch.zeros(n, dtype=torch.bool)
    design[designed] = True                         # the residues actually being designed

    same = asym[:, None] == asym[None, :]
    is_design = design[:, None] | design[None, :]
    pae = torch.where(same, torch.tensor(intra),
                      torch.where(is_design, torch.tensor(designed_iface),
                                  torch.tensor(scaffold_iface)))

    # Backbone-ish coordinates: two parallel rods `sep` angstrom apart. The N-CA-C angle
    # has to be a real one — compute_ptms discards any frame whose |cos| exceeds 0.9063
    # as collinear, and a flat or folded-back triple silently zeroes every pTM.
    idx = torch.arange(n).float()
    ca = torch.stack([idx * 3.8 % 60, torch.where(asym == 0, 0.0, sep), idx * 0.1], -1)
    xyz = torch.stack([ca + torch.tensor([-1.0, 0.9, 0.0]),
                       ca,
                       ca + torch.tensor([1.0, 0.9, 0.0])], 1).reshape(1, -1, 3)
    a2t = torch.zeros(1, 3 * n, n)
    a2t[0, torch.arange(3 * n), torch.arange(n).repeat_interleave(3)] = 1

    feats = {
        "frames_idx": torch.arange(3 * n).reshape(1, n, 3),
        "token_pad_mask": torch.ones(1, n),
        "atom_pad_mask": torch.ones(1, 3 * n),
        "asym_id": asym.unsqueeze(0),
        "mol_type": torch.full((1, n), const.chain_type_ids["PROTEIN"]),
        "atom_to_token": a2t,
        "design_mask": design.unsqueeze(0),
        "chain_design_mask": chain_design.unsqueeze(0),
    }
    return pae_logits(pae.unsqueeze(0)), xyz, feats


NAMES = ("ptm iptm ligand_iptm protein_iptm chain_pair_iptm design_to_target_iptm "
         "design_residue_iptm design_iptm design_iiptm target_ptm design_ptm "
         "design_ipsae_min design_to_target_ipsae target_to_design_ipsae "
         "chain_pair_ipsae").split()

def report(label, **kw):
    logits, xyz, feats = scene(**kw)
    out = compute_ptms(logits, xyz, feats, multiplicity=1)
    d = {k: v for k, v in zip(NAMES, out) if torch.is_tensor(v)}
    print(f"{label:36} " + "  ".join(
        f"{k}={d[k].item():.3f}" for k in
        ("ptm", "design_ptm", "design_iptm", "design_to_target_iptm")))
    return d


T, B = 100, 60
whole = slice(T, T + B)
print("100-residue target, 60-residue binder chain\n")
a = report("de novo binder, docked", n_target=T, n_binder=B, designed=whole)
b = report("de novo binder, interface vague", n_target=T, n_binder=B, designed=whole,
           designed_iface=22.0, scaffold_iface=22.0)
c = report("12 CDR residues on a docked scaffold", n_target=T, n_binder=B,
           designed=slice(T + 20, T + 32), designed_iface=22.0, scaffold_iface=1.0)

print(f"\ndesign_ptm survives the interface collapsing: {a['design_ptm'].item():.3f} -> "
      f"{b['design_ptm'].item():.3f}, while design_iptm goes "
      f"{a['design_iptm'].item():.3f} -> {b['design_iptm'].item():.3f}")
assert b["design_ptm"] > 0.8, "design_ptm must not depend on the interface"
assert b["design_iptm"] < 0.2, "design_iptm must collapse with the interface"

print(f"design_iptm and design_to_target_iptm agree on a fully designed chain "
      f"({a['design_iptm'].item():.3f} / {a['design_to_target_iptm'].item():.3f}) and "
      f"diverge on a partly designed one "
      f"({c['design_iptm'].item():.3f} / {c['design_to_target_iptm'].item():.3f})")
assert torch.isclose(a["design_iptm"], a["design_to_target_iptm"], atol=1e-4)
assert not torch.isclose(c["design_iptm"], c["design_to_target_iptm"], atol=1e-2)

print(f"ipSAE is directional: design->target {c['design_to_target_ipsae'].item():.3f}, "
      f"target->design {c['target_to_design_ipsae'].item():.3f}, "
      f"design_ipsae_min {c['design_ipsae_min'].item():.3f}")
```

```text
100-residue target, 60-residue binder chain

de novo binder, docked               ptm=0.873  design_ptm=0.873  design_iptm=0.873  design_to_target_iptm=0.873
de novo binder, interface vague      ptm=0.562  design_ptm=0.873  design_iptm=0.044  design_to_target_iptm=0.044
12 CDR residues on a docked scaffold ptm=0.873  design_ptm=0.873  design_iptm=0.873  design_to_target_iptm=0.044

design_ptm survives the interface collapsing: 0.873 -> 0.873, while design_iptm goes 0.873 -> 0.044
design_iptm and design_to_target_iptm agree on a fully designed chain (0.873 / 0.873) and diverge on a partly designed one (0.873 / 0.044)
ipSAE is directional: design->target 0.832, target->design 0.638, design_ipsae_min 0.638
```

The first two rows are the same de novo binder differing only in interface confidence.
`ptm` moves, `design_iptm` collapses, and `design_ptm` does not move at all — because it
never looked at the interface. Ranking on `design_ptm` would put those two designs level.

The third row is the one to remember for antibody and redesign work. The scaffold is
confidently docked and the twelve residues you actually designed are not, and the two
interface columns say opposite things: `design_iptm` 0.873, `design_to_target_iptm` 0.044.
Read the first and you ship a design whose new residues are placed at random.

ipSAE is directional, and by enough to matter — 0.832 one way and 0.638 the other on the
third row. It counts only pairs whose PAE is under 15 Å, so the two directions divide by
different residue counts. `design_ipsae_min` takes the pessimistic one, which is the number
to prefer.

## Choosing what to order

Stop here and change tools. BoltzGen's own `filtering` step gives you a ranked, diversity-
optimised set, and it is the right first cut — but the decision of what to synthesise wants
thresholds with provenance, an independent re-prediction, sequence liability screening and
a realistic view of hit rates. The `binder-design-filtering` skill covers exactly that, and
consumes what `refold_cif/` and `all_designs_metrics.csv` contain.

Three things the filtering step does before you see a number, which change what the counts
in `all_designs_metrics.csv` mean:

- **Designs with an identical designed sequence are dropped**, keeping the first. Two
  backbones that inverse-fold to the same sequence are one row, not two.
- **`has_x` removes any design whose sequence contains `X`.** An unresolved token is a
  failed design, not a low-scoring one.
- **`--filter_biased`, on by default, removes amino-acid composition outliers** — caps on
  the alanine, glycine, glutamate, leucine and valine fractions. Turning it off with
  `--filter_biased=false` recovers designs that are real but compositionally odd, and also
  the poly-alanine ones.

Two knobs worth setting before you leave BoltzGen's own filter, because they are cheap and
the defaults are conservative:

- **`--alpha`** trades quality against sequence diversity in the final set — `0.0` picks the
  best-scoring designs and nothing else, `1.0` picks the most different ones. Defaults are
  `0.001`, or `0.01` under `peptide-anything`. Nearly pure quality. Raise it when the top of
  your ranking is one design and fifty near-copies.
- **`--additional_filters`** takes hard cuts as `'feature>threshold'` or
  `'feature<threshold'` — `>` when higher is better. Quote them, or the shell reads the
  angle brackets as redirection.

## Try it

A cold check of the two claims this page rests on: that a design specification's chain and
residue selectors are not the ones a viewer shows, and that the weights are still obtainable
without credentials. No GPU, no BoltzGen install — the checks run against the file formats
and the hosts.

**Data** — two RCSB entries, both open, no account:

    https://files.rcsb.org/download/4ZQK.cif   PD-1 / PD-L1 complex
    https://files.rcsb.org/download/3HFM.cif   anti-lysozyme Fab with lysozyme

wwPDB releases coordinate data into the public domain under CC0, so neither file needs an
account or carries a use restriction. Both were confirmed reachable 2026-08-28, as was
`boltzgen/boltzgen-1` on Hugging Face, whose model card declares MIT and whose files need no
token.

```bash
python3 -m venv .venv
./.venv/bin/pip install --disable-pip-version-check --quiet "gemmi>=0.6.5" numpy pyyaml
curl -fsSL -o 4zqk.cif https://files.rcsb.org/download/4ZQK.cif
curl -fsSL -o 3hfm.cif https://files.rcsb.org/download/3HFM.cif

cat > check_spec.py <<'PY'
import re, sys, urllib.request, urllib.error, gemmi, numpy as np, yaml, pathlib

# ---- 1. what a design spec's `id:` and residue numbers actually mean ---------------
def chains_of(path):
    """label_asym_id -> (viewer chain, SEQRES length, {label_seq with coordinates})."""
    st = gemmi.read_structure(path); st.setup_entities()
    auth_of = {r.subchain: ch.name for ch in st[0] for r in ch}
    seqres = {s: len(e.full_sequence) for e in st.entities for s in e.subchains}
    return {s.subchain_id(): (auth_of[s.subchain_id()],
                              seqres.get(s.subchain_id(), len(s)),
                              {r.label_seq for r in s})
            for s in st[0].subchains()
            if s.check_polymer_type() != gemmi.PolymerType.Unknown}

for path in ("4zqk.cif", "3hfm.cif"):
    for cid, (auth, n, resolved) in chains_of(path).items():
        print(f"{path}  id: {cid:<3} viewer chain {auth:<3} "
              f"{n:>4} indices, {len(resolved):>4} with coordinates")

assert set(chains_of("3hfm.cif")) == {"A", "B", "C"}, "3HFM design ids are A/B/C"
assert {v[0] for v in chains_of("3hfm.cif").values()} == {"H", "L", "Y"}, \
    "3HFM viewer chains are H/L/Y — a spec written with those raises"

# ---- 2. what pasting a viewer's residue numbers costs ------------------------------
st = gemmi.read_structure("4zqk.cif"); st.setup_entities(); st.remove_ligands_and_waters()
pol = {s.subchain_id(): s for s in st[0].subchains()}

def coords(span):
    xyz = [[a.pos.x, a.pos.y, a.pos.z] for r in span for a in r]
    owner = [r.label_seq for r in span for _ in r]
    return np.array(xyz), np.array(owner)

tx, towner = coords(pol["A"]); px, _ = coords(pol["B"])
d = np.linalg.norm(tx[:, None, :] - px[None, :, :], axis=-1)
site = sorted(set(towner[(d <= 4.5).any(axis=1)].tolist()))
by_label = {r.label_seq: r for r in pol["A"]}
auth = [by_label[i].seqid.num for i in site]
print(f"\nPD-L1 interface, res_index : {','.join(map(str, site))}")
print(f"PD-L1 interface, auth_seq  : {','.join(map(str, auth))}")
overlap = set(site) & set(auth)
print(f"pasting auth numbers selects {len(overlap)} of {len(site)} interface residues")
assert len(overlap) == 0, "the two numberings must not be interchangeable here"

# ---- 3. the spec validator, on a good spec and a bad one ---------------------------
def expand(spec, n):
    out = []
    for part in str(spec).split(","):
        part = part.strip()
        if part == "all": out += list(range(1, n + 1))
        elif re.fullmatch(r"\d+", part): out.append(int(part))
        elif re.fullmatch(r"\d+\.\.\d+", part):
            a, b = map(int, part.split("..")); out += list(range(a, b + 1))
        elif re.fullmatch(r"\.\.\d+", part): out += list(range(1, int(part[2:]) + 1))
        elif re.fullmatch(r"\d+\.\.", part): out += list(range(int(part[:-2]), n + 1))
        else: raise ValueError(f"malformed range {part!r}")
    return out

def validate(doc, base=pathlib.Path(".")):
    problems = []
    for ent in doc["entities"]:
        kind, body = next(iter(ent.items()))
        if kind != "file":
            continue
        avail = chains_of(str(base / body["path"]))
        for section in ("include", "binding_types"):
            for item in body.get(section, []) or []:
                block = item["chain"]
                cid = block["id"]
                if cid not in avail:
                    problems.append(f"{section}: id {cid!r} is not a label_asym_id — "
                                    f"the file has {sorted(avail)} "
                                    f"(viewer chains {sorted({v[0] for v in avail.values()})})")
                    continue
                n = avail[cid][1]
                for key in ("res_index", "binding", "not_binding"):
                    if key in block:
                        bad = [i for i in expand(block[key], n) if not 1 <= i <= n]
                        if bad:
                            problems.append(f"{section} {cid}.{key}: {bad[:3]} outside 1..{n}")
    return problems

good = yaml.safe_load(f"""
entities:
  - protein: {{id: D, sequence: 60..90}}
  - file:
      path: 4zqk.cif
      include: [{{chain: {{id: A}}}}]
      binding_types: [{{chain: {{id: A, binding: "{','.join(map(str, site))}"}}}}]
""")
bad = yaml.safe_load("""
entities:
  - file:
      path: 3hfm.cif
      include: [{chain: {id: H}}]
""")
print("\ngood spec :", validate(good) or "valid")
print("bad spec  :", validate(bad)[0])
assert not validate(good) and validate(bad)

# ---- 4. are the weights still obtainable without credentials? ----------------------
def probe(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(
                url, method="HEAD", headers={"User-Agent": "boltzgen-skill-check"}),
                timeout=30) as r:
            return r.status, int(r.headers.get("x-linked-size")
                                 or r.headers.get("Content-Length") or 0)
    except urllib.error.HTTPError as e:
        return e.code, 0

print()
for name in ("boltzgen1_ifold.ckpt", "boltzgen1_diverse.ckpt", "boltz2_conf_final.ckpt"):
    code, size = probe(f"https://huggingface.co/boltzgen/boltzgen-1/resolve/main/{name}")
    print(f"boltzgen-1/{name:24} what the code resolves to {code}  {size / 2**30:5.2f} GB")
code, _ = probe("https://huggingface.co/boltzgen/boltzgen1_ifold/resolve/main/"
                "boltzgen1_ifold.ckpt")
print(f"boltzgen1_ifold          what the README names     {code}")
assert probe("https://huggingface.co/boltzgen/boltzgen-1/resolve/main/"
             "boltzgen1_ifold.ckpt")[0] == 200, "the public checkpoints must be reachable"
print("\nall assertions passed")
PY

./.venv/bin/python check_spec.py
```

**Expect**

Invariants — these hold regardless of release, and a failure means this page is wrong:

- `3HFM`'s design ids are `A`, `B`, `C` while a viewer shows `H`, `L`, `Y`, so a
  specification written from the viewer raises rather than misbehaving.
- `4ZQK` chain `B` has more valid indices (118) than residues with coordinates (106): the
  selector counts the deposited sequence, not the modelled one.
- The eighteen PD-L1 interface residues, expressed as `res_index` and as `auth_seq_id`, are
  disjoint sets — the assertion that pasting one for the other selects **none** of the site.
- The validator accepts the converted specification and rejects the viewer-chain one.
- The checkpoints answer 200 without credentials — the last assertion. If that starts
  failing, the model is no longer obtainable on the route this page documents and the skill
  needs a human decision, not a patch.

Observed 2026-08-28 — checkpoint sizes move when the weights are rebuilt, and the `401` on
the repository the README names becomes a `200` if it is ever published. Treat a mismatch on
these as drift to investigate:

```text
4zqk.cif  id: A   viewer chain A    115 indices,  115 with coordinates
4zqk.cif  id: B   viewer chain B    118 indices,  106 with coordinates
3hfm.cif  id: A   viewer chain L    214 indices,  214 with coordinates
3hfm.cif  id: B   viewer chain H    215 indices,  215 with coordinates
3hfm.cif  id: C   viewer chain Y    129 indices,  129 with coordinates

PD-L1 interface, res_index : 2,6,9,37,39,41,49,59,96,98,100,102,103,104,105,106,107,108
PD-L1 interface, auth_seq  : 19,23,26,54,56,58,66,76,113,115,117,119,120,121,122,123,124,125
pasting auth numbers selects 0 of 18 interface residues

good spec : valid
bad spec  : include: id 'H' is not a label_asym_id — the file has ['A', 'B', 'C'] (viewer chains ['H', 'L', 'Y'])

boltzgen-1/boltzgen1_ifold.ckpt     what the code resolves to 200   0.01 GB
boltzgen-1/boltzgen1_diverse.ckpt   what the code resolves to 200   1.80 GB
boltzgen-1/boltz2_conf_final.ckpt   what the code resolves to 200   1.94 GB
boltzgen1_ifold          what the README names     401

all assertions passed
```

## Citing

Stark, H. *et al.* BoltzGen: Toward universal binder design. *bioRxiv* (2025).
doi:10.1101/2025.11.20.689494
