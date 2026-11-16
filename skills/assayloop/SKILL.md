---
name: assayloop
description: Run AssayFormer, Genentech's pretrained acquisition policy for CRISPR screens, on CPU or Apple MPS — give it the hit labels from rounds already assayed and get the next batch of genes — and reproduce its published enrichment factor of 4.83.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [crispr, experimental-design, model-weights, evaluation, drug-discovery]
covers: [assayloop, assayformer, assayllm, assaybench-loop, crispr screen, pooled screen, genome-wide screen, hit discovery, adaptive screening, active learning, sequential experimental design, amortized experimental design, lab in the loop, next batch, acquisition policy, transformer, reinforcement learning, grpo, enrichment factor, biogrid orcs, genentech, hugging face, apple silicon, mps, cpu, human]
papers: [doi:10.48550/arXiv.2609.11877, doi:10.48550/arXiv.2605.10876]
access: [open]
datasets: [https://huggingface.co/api/models/Genentech/assayformer/revision/4927703e5903984ae0254a9fe8e93ec0b29c27e4, https://huggingface.co/Genentech/assayformer/resolve/4927703e5903984ae0254a9fe8e93ec0b29c27e4/model_last.pt, https://raw.githubusercontent.com/Genentech/AssayLoop/e7251afacda88c803864896e0d1444196f482471/deployment/examples/u_1733_merged.json, https://huggingface.co/datasets/Genentech/assaybench/resolve/fa2ed4195d2eea1e5ed570d1a67c21e47650962d/biogrid/train-00000-of-00001.parquet]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-15
  against: AssayLoop commit e7251af / Genentech/assayformer at Hub revision 4927703 (model_last.pt sha256 c5a58d77) / Genentech/assaybench at Hub revision fa2ed41 / assaybench 0.2.1 / torch 2.11.0 from PyPI / Python 3.12.8 on macOS arm64, Apple M1 Max, CPU and MPS, no CUDA device
  executed: 4
  unverified: 0
---

# AssayLoop — pick the next genes to screen with AssayFormer

A pooled CRISPR screen measures ~20,000 genes; a follow-up campaign that tests genes in
small batches can only afford a few hundred per round. AssayLoop is Genentech's framework
for choosing those batches, and **AssayFormer** is its learned part: a small transformer
(3 layers, 5,033,117 parameters) trained across 1,349 historical screens to read a screen's
description plus every hit and non-hit observed so far, and score every gene in a
24,217-gene vocabulary for what to test next. It was trained with supervised learning and
then reinforcement learning (GRPO) on the benchmark's own objective.

| component | what it is | needs | on this page |
|---|---|---|---|
| AssayFormer | the released checkpoint, 20 MB, MIT | nothing — CPU is enough | run, reproduced, used for next batches |
| AssayLoop handoff | an LLM picks rounds 1–2 or 1–3 from prior knowledge, then AssayFormer continues | an LLM endpoint and its key | described, not run |
| AssayLLM | a 27B model post-trained for this task, usable as the warm-start LLM | a GPU server to host 55.6 GB of weights | described, not run |

The benchmark it is scored on — the screens, the 21,147-gene candidate pool, the enrichment
factor (EF) and the random and frequency baselines — is covered in `assaybench`. This page
assumes it rather than restating it.

## Licence and access

- **Code — MIT.** `Genentech/AssayLoop` carries an MIT `LICENSE`, copyright 2026 Genentech, Inc.
- **Weights — MIT, ungated.** `Genentech/assayformer` on the Hugging Face Hub declares
  `license: mit`, `gated: false`, `private: false`. No account, no token.
- **Benchmark data — MIT, ungated** (`Genentech/assaybench`; see `assaybench`).

Upstream's README states the cost plainly: "No API key is needed to run AssayFormer or to
reproduce its numbers." That holds for every screen whose description embedding ships with
the package. Two paths do need a key, and nothing on this page uses either:

- **A screen of your own** needs an `OPENAI_API_KEY`. AssayFormer conditions on a
  `text-embedding-3-small` embedding of the screen description. The package ships 1,356
  precomputed embeddings — every screen in the training and validation folds and the 20 + 20
  AssayBench-Loop evaluation screens. Measured here, 286 of the 334 test-fold entries are not
  covered, nor is any new screen; those raise rather than fall back (shown below).
- **The LLM warm start** (the AssayLoop handoff and AssayLLM) needs an LLM endpoint: a
  self-hosted OpenAI-compatible server (`ASSAYLOOP_LLM_PROVIDER=vllm`, how AssayLLM is served)
  or a hosted provider with its key in a `.env` file. Optional.

The AssayLLM weights are on the Hub too, and their licences differ:
`Genentech/assayllm-handoff-grpo` declares `apache-2.0`; `Genentech/assayllm-sft` declares no
licence on its card. If you host AssayLLM, use the first.

## Before the first block

- **Python 3.11 or newer**, `git`, and about 2.7 GB of disk: 1.5 GB for the environment, the
  20 MB checkpoint, and the 1.1 GB benchmark file in the Hugging Face cache. No GPU.
- **A source install.** `assayloop` is not on PyPI. It installs from GitHub, pinned to a
  commit below; `assaybench` comes from PyPI as a dependency.
- **Not `uv sync --extra torch` on a Mac.** Upstream's install line pins torch to the CUDA
  12.8 wheel index, which publishes no macOS wheel; on Apple Silicon it stops with
  "torch (v2.11.0+cu128) only has wheels for the following platforms: manylinux_2_28_aarch64,
  manylinux_2_28_x86_64, win_amd64". Installing with `pip` ignores that index and takes
  torch's ordinary PyPI wheel, which is what the block below does. On Linux with CUDA,
  upstream's `uv sync` route is fine.
- The repository ships no lock file, so everything except the two pins resolves to current
  releases. The whole Try it block, install and downloads included, took about seven minutes
  here.

## Try it

**Data** — the released checkpoint `Genentech/assayformer` at Hub revision
`4927703e5903984ae0254a9fe8e93ec0b29c27e4` (MIT, ungated), checked against the SHA-256
upstream publishes for it; and the AssayBench-Loop test screens from `Genentech/assaybench`
at revision `fa2ed4195d2eea1e5ed570d1a67c21e47650962d` (MIT, ungated), also checked by
SHA-256. Both were reachable on 2026-11-15.

**Run** — one block from an empty directory: it installs the code at a pinned commit, writes
`af_common.py` (pinned loading, reused by every later block) and `run_assayformer.py`, and
runs AssayFormer for 10 rounds of 100 genes on all 20 test screens. The traps it routes
through: the checkpoint file must be named (the loader's default, `model.pt`, is not in the
release), the device must be named (the loader's `auto` never picks MPS), and the screens are
read from a pinned file rather than through the package loader, which reads whatever the
dataset's `main` branch is today.

```bash
COLD=$(mktemp -d) && cd "$COLD"
python3 -m venv .venv && . .venv/bin/activate
pip install -q "torch==2.11.0" \
  "assayloop @ git+https://github.com/Genentech/AssayLoop@e7251afacda88c803864896e0d1444196f482471"

cat > af_common.py <<'EOF'
# Pinned weights, pinned screens, and the shared candidate pool AssayFormer was scored on.
import hashlib, logging, os
import pyarrow.parquet as pq
from huggingface_hub import hf_hub_download, snapshot_download
from assaybench import load_manifest, screen_from_example, gene_universe
from assayloop.models.amortized_ranker import AmortizedRankerModel

logging.disable(logging.INFO)              # quiets the per-request HTTP log
MODEL_REV = "4927703e5903984ae0254a9fe8e93ec0b29c27e4"     # Genentech/assayformer, 2026-09-11
WEIGHTS_SHA256 = "c5a58d77c43916cd1261410cc0085fc45877dd7888db09aed9022002738d39f4"
DATA_REV = "fa2ed4195d2eea1e5ed570d1a67c21e47650962d"      # Genentech/assaybench, 2026-09-29
DATA_SHA256 = "fce157f3a436625df9ba51e2cf95fa15357465341aa6feee9d40a14b5bd3cb7a"

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""):
            h.update(chunk)
    return h.hexdigest()

def load_model(device=None):
    ckpt = snapshot_download("Genentech/assayformer", revision=MODEL_REV)
    if sha256(f"{ckpt}/model_last.pt") != WEIGHTS_SHA256:
        raise SystemExit("model_last.pt is not the released checkpoint")
    device = device or os.environ.get("ASSAYFORMER_DEVICE", "cpu")
    return AmortizedRankerModel(checkpoint=ckpt, ckpt_file="model_last.pt", device=device)

def load_test_screens():
    """The paper's 20 test screens from the pinned file, in manifest order, and their 21,147-gene pool."""
    path = hf_hub_download("Genentech/assaybench", "biogrid/train-00000-of-00001.parquet",
                           repo_type="dataset", revision=DATA_REV)
    if sha256(path) != DATA_SHA256:
        raise SystemExit("biogrid parquet is not the pinned revision")
    m = load_manifest("assayloop-test")
    rows = pq.read_table(path, filters=[("dataset_name", "in", m.dataset_names)]).to_pylist()
    rows = {r["dataset_name"]: r for r in rows if r["yearfold0"] == "test"}
    missing = [n for n in m.dataset_names if n not in rows]
    if missing:
        raise SystemExit(f"screens missing from the pinned file: {missing}")
    screens = [screen_from_example(rows[n]) for n in m.dataset_names]
    return screens, gene_universe(screens)
EOF

cat > run_assayformer.py <<'EOF'
# Run AssayFormer for 10 rounds of 100 genes on each of the 20 test screens and score it.
import time
import numpy as np
from assaybench import SequentialLoop, enrichment_factor, adjusted_nauc, fraction_of_hits, shortfall
from assayloop.acquisitions.greedy_from_model import GreedyFromModel
from assayloop.tasks import make_task
from af_common import load_model, load_test_screens

model = load_model()
screens, universe = load_test_screens()
unknown = [g for g in universe if model.vocab.to_idx(g) == 0]     # id 0 is <unk>
print(f"device {model.device} | {len(screens)} screens | pool {len(universe)} | not in vocabulary {len(unknown)}")
assert len(screens) == 20 and len(universe) == 21147 and not unknown

start, rows = time.time(), {}
for s in screens:
    run = SequentialLoop(make_task(s, universe_genes=universe), model, GreedyFromModel(),
                         metrics=[], batch_size=100).run(n_steps=10, verbose=False)
    rounds = [list(step.acquired_batch) for step in run.history]
    picked = [g for r in rounds for g in r]
    hits = [g for g, h in zip(s.genes, s.hits) if h]
    assert len(picked) == len(set(picked)) == 1000
    rows[s.dataset_name] = (enrichment_factor(picked, s.genes, hits, universe, budget=1000),
                            adjusted_nauc(rounds, s.genes, hits, universe),
                            fraction_of_hits(picked, s.genes, hits), shortfall(picked, s.genes))
mean = np.mean(list(rows.values()), axis=0)
print(f"U_1733_merged EF {rows['U_1733_merged'][0]:.2f}")
print("mean over 20: EF {:.3f}  nAUC {:.3f}  FH {:.3f}  SF {:.3f}".format(*mean))
print(f"{time.time() - start:.1f} s for 20 screens x 10 rounds")
assert abs(rows["U_1733_merged"][0] - 7.61) < 0.005 and abs(mean[0] - 4.83) < 0.005
EOF

python run_assayformer.py
```

**Expect** — invariants; a failure means the reproduction is broken, not that upstream moved,
because every input is pinned by hash:

- the checkpoint and the benchmark file pass their SHA-256 checks;
- 20 screens, a pool of 21,147 genes, and every pool gene in AssayFormer's vocabulary;
- every run acquires 1,000 distinct genes;
- EF 7.61 on `U_1733_merged`, the figure upstream's README and model card print for it;
- mean EF 4.83 over the 20 screens, AssayFormer's row in Table 1 of the AssayLoop paper.

Observed on 2026-11-15:

```
device cpu | 20 screens | pool 21147 | not in vocabulary 0
U_1733_merged EF 7.61
mean over 20: EF 4.829  nAUC 0.172  FH 0.232  SF 0.100
5.5 s for 20 screens x 10 rounds
```

The paper's row reads EF 4.83, nAUC 17.2%, FH 23.2%, SF 10.0% — all four reproduced. For scale,
a random policy averages EF about 1 on the same screens and the best non-learned baseline in
`assaybench` reaches about 3.1. The paper's best AssayLoop handoff reaches 5.67 (inherited;
see *The handoff* below). The first run downloads the benchmark file, about a minute here.

## CPU or Apple MPS

The loader's `device="auto"` chooses CUDA if present and otherwise the CPU; it never chooses
MPS. Ask for it by name:

```bash
ASSAYFORMER_DEVICE=mps python run_assayformer.py
```

Observed: the same four means and the same EF on every screen, in 6.4–7.0 s against the
CPU's 5.5–6.8 s across runs; the model is small enough that the CPU is no slower. On every screen the CPU and MPS
runs picked the same 1,000 genes; on one (`U_1735_dec`) the order of picks first differed at
the 133rd pick, near-tied scores resolving differently, without changing its EF.

## The next batch from your own results

This is the use outside the benchmark: you have assayed some genes, you know which were hits,
and you want the next 100. The feedback is a two-column table, `gene` and `hit` (0 or 1).
The example below uses the one upstream publishes for its browser demo: `U_1733_merged` (RelA
nuclear translocation in HeLa, Schraivogel 2022) after two AssayFormer rounds, 200 genes with
17 hits. Run it in the Try it directory:

```python
# Feed AssayFormer the labels from rounds already assayed and get the next 100 genes to test.
import csv, io, json, urllib.request
from assaybench import Observation
from af_common import load_model, load_test_screens

EXAMPLE = ("https://raw.githubusercontent.com/Genentech/AssayLoop/"
           "e7251afacda88c803864896e0d1444196f482471/deployment/examples/u_1733_merged.json")
example = json.load(urllib.request.urlopen(EXAMPLE))
feedback = list(csv.DictReader(io.StringIO(example["paste"]), delimiter="\t"))   # columns: gene, hit

model = load_model()
screens, universe = load_test_screens()
screen = next(s for s in screens if s.dataset_name == example["screen_id"])

genes = [row["gene"] for row in feedback]
if len(set(genes)) != len(genes):
    raise SystemExit("a gene appears twice in the feedback")
if {row["hit"] for row in feedback} - {"0", "1"}:
    raise SystemExit("hit must be 0 or 1")
unknown = [g for g in genes if model.vocab.to_idx(g) == 0]
if unknown:      # the model would read every one of these as the same <unk> token
    raise SystemExit(f"not in AssayFormer's vocabulary: {unknown[:10]}")
observed = [Observation(candidate=r["gene"], label={"hit": r["hit"] == "1"}) for r in feedback]
print(f"{screen.dataset_name}: {len(observed)} genes assayed, {sum(r['hit'] == '1' for r in feedback)} hits")

assayed = set(genes)
candidates = [g for g in universe if g not in assayed]
scores = model.predict(observed, candidates, task_context=screen.context()).scores
batch = sorted(candidates, key=lambda g: (-scores[g], g))[:100]

with open("next_batch.tsv", "w") as f:
    f.write("rank\tgene\tscore\n")
    f.writelines(f"{i}\t{g}\t{scores[g]:.4f}\n" for i, g in enumerate(batch, 1))
print("next batch:", ", ".join(batch[:10]), "...")

truth = dict(zip(screen.genes, screen.hits))      # only possible because this screen is historical
print("hits in the next batch:", sum(bool(truth.get(g)) for g in batch), "| upstream recorded:", example["expected_next_hits"])
assert set(batch) == set(example["next_batch_labels"])
```

Observed:

```
U_1733_merged: 200 genes assayed, 17 hits
next batch: VPS16, SYS1-DBNDD2, MED12, GLMN, DDX17, TADA2B, KCTD10, ARIH1, IDH3A, BRAP ...
hits in the next batch: 7 | upstream recorded: 7
```

The batch is the same 100 genes upstream recorded for this state, 7 of them hits, written to
`next_batch.tsv` with their scores. The scores rank genes against each other; they are not
probabilities of being a hit.

Three things about feeding it your own results:

- **Unknown symbols are silent in the model, so the block refuses them.** The vocabulary maps
  any symbol it does not know to one shared `<unk>` id, so a misspelled or outdated symbol
  would be read as information about a different, shared token. Check symbols against current
  HGNC names before blaming the model.
- **A gene your screen could not measure has no clean encoding.** The model has two labels,
  hit and not-hit. The benchmark's own loop reports an unmeasured pick to the model as
  not-hit; do the same, or leave the gene out of the feedback and out of the candidates.
- **The description is not optional.** `task_context` is how AssayFormer knows which screen it
  is in. For a screen the package already knows, its record's `context()` finds the shipped
  embedding by the exact description text; for anything else, see the next section.

## A screen of your own needs an embedding key

AssayFormer embeds the screen description — phenotype, phenotype class, cell line, cell type,
library methodology, condition and, where present, organism, contrast and free-text
description — with OpenAI's `text-embedding-3-small`. Without a key, a
description it has not seen fails loudly rather than quietly using some other vector:

```python
# A screen of your own: AssayFormer conditions on an embedding of the screen's description.
from af_common import load_model

model = load_model()
mine = {"phenotype": "decreases cell viability under olaparib",
        "cleaned_phenotype": "Drug / Chemical / Environmental Response",
        "cell_line": "HAP1", "cell_type": "Near-haploid Cell Line",
        "library_methodology": "Knockout", "condition_clause": " under olaparib treatment (1.0 uM)"}
try:
    scores = model.predict([], ["BRCA1", "BRCA2", "PARP1"], task_context=mine).scores
    print(scores)
except RuntimeError as e:
    print("RuntimeError:", e)
```

Observed without a key: `RuntimeError: Text not found in the embedding cache, and no OpenAI
API key is configured, so it cannot be embedded. Set OPENAI_API_KEY to embed new screens.`
With `OPENAI_API_KEY` exported in your shell, the same call embeds the description (one short
request) and scores the genes; that path was not run here. Keep the key in the environment or
a `.env` file that is never committed. Fill the same fields AssayBench records use, in the
same style; the embedding is of exactly that text.

## The handoff (AssayLoop) and AssayLLM — not run

The paper's headline result combines an LLM and AssayFormer: the LLM chooses the first two or
three rounds from what it knows about the biology, then AssayFormer continues with those
labels as context. Reported on the same 20 test screens (inherited from the paper's Table 1,
not reproduced here): EF 5.67, nAUC 21.7% and 27.7% of hits recovered for the best handoffs,
against AssayFormer alone at 4.83; with AssayLLM as the warm-start model, 5.05.

Upstream's commands are `assayloop run --model null --acq llm_single --lm-config <config>` to collect the
LLM rounds and `assayloop eval-ranker-handoff --ckpt-file model_last.pt --warm-dir ... --n 3`
to hand off. Collecting the LLM rounds needs the LLM endpoint described under *Licence and
access*.

**Replaying the published LLM rounds instead does not work today.** Upstream's
`scripts/fetch_sweeps.sh` downloads the recorded LLM runs from a GitHub release named
`data-v1`; on 2026-11-15 the repository had no releases and no tags, and both archive URLs
return 404. Until that release exists, the handoff rows can only be reproduced by paying for
new LLM calls, which also will not reproduce them exactly. The script also needs bash 4 or
newer (`declare -A`), which macOS's `/bin/bash` 3.2 is not.

## What does not work

- **`uv sync --extra torch` on macOS** — see *Before the first block*; install with `pip`.
- **`AmortizedRankerModel(checkpoint=...)` without `ckpt_file`** raises `FileNotFoundError`:
  the default is `model.pt`, the best-on-validation epoch, which the release does not include.
  Every published number uses `model_last.pt`.
- **`device="auto"` on a Mac** runs on the CPU; MPS has to be named.
- **The shipped embedding cache covers less than its error message says.** The message reads
  "Every screen in the public screen sets ships pre-embedded"; for the full 334-entry test
  fold, 286 are not, so `assayloop` on `--screen-set test` needs an `OPENAI_API_KEY`.
- **`scripts/fetch_sweeps.sh`** — 404, as above.

## Limits worth stating plainly

- AssayFormer scores only genes in its 24,217-symbol vocabulary, all human, and was trained
  on screens published up to 2020; its screen-level knowledge is that literature's.
- The 4.83 is a mean over 20 genome-wide screens. Per screen it ran from 0.0 (`U_1863_inc`, a
  CRISPRa infection screen with 50 hits) to 12.95 (`U_1735_dec`). One screen's next batch is
  not a promise about yours.
- On historical screens the next batch can be scored, as above; on a new screen it cannot,
  until you assay it.
- The released checkpoint predates the benchmark revision it is scored against here
  (2026-09-29); none of the screens that revision changed is among the 20 test screens, which
  is why the published number still reproduces.
