---
name: assaybench
description: Load AssayBench and AssayBench-Loop — 1,901 BioGRID ORCS CRISPR screen entries in five phenotype classes, pinned on Hugging Face — and score an adaptive hit-discovery policy with the benchmark's enrichment factor against a random baseline.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, crispr, evaluation, experimental-design, public-data]
covers: [assaybench, assaybench-loop, assayloop, crispr screen, crispr knockout, crispri, crispra, pooled screen, genome-wide screen, biogrid orcs, hit discovery, adaptive screening, active learning, sequential experimental design, bayesian optimization, lab in the loop, enrichment factor, nauc, adjusted ndcg, virtual cell, fitness, proliferation, drug response, host-pathogen, infection, reporter, trafficking, gene ranking, hugging face, human]
papers: [doi:10.48550/arXiv.2605.10876, doi:10.48550/arXiv.2609.11877]
access: [open]
datasets: [https://huggingface.co/api/datasets/Genentech/assaybench/revision/fa2ed4195d2eea1e5ed570d1a67c21e47650962d, https://huggingface.co/datasets/Genentech/assaybench/resolve/fa2ed4195d2eea1e5ed570d1a67c21e47650962d/biogrid/train-00000-of-00001.parquet, https://huggingface.co/datasets/Genentech/assaybench/resolve/fa2ed4195d2eea1e5ed570d1a67c21e47650962d/LaTest/train-00000-of-00001.parquet]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-15
  against: assaybench 0.2.1 (PyPI, 2026-09-30) / Genentech/assaybench dataset at Hub revision fa2ed41 (2026-09-29) / datasets 5.2.0, huggingface_hub 2.4.0, pyarrow 26.0.1, numpy 2.5.5 / Python 3.12.8 on macOS arm64
  executed: 6
  unverified: 0
---

# AssayBench — CRISPR screens as a benchmark for picking hits

AssayBench is a curated set of published CRISPR screens from BioGRID ORCS, released by
Genentech as a benchmark. Each entry is one screen reduced to what a model can be scored
against: the genes in the library, which of them were called hits, a graded relevance score
per gene, and a structured description of the experiment (cell line, modality, condition,
phenotype). It serves two tasks:

| task | what a method produces | primary metric | paper |
|---|---|---|---|
| AssayBench | one ranked list of 100 genes per screen, before any data | adjusted nDCG@100 | arXiv 2605.10876 |
| AssayBench-Loop | 10 rounds of 100 genes, each round chosen after the previous round's labels are revealed | hit enrichment factor (EF) | arXiv 2609.11877 |

This page covers the data and the second task: loading the screens at a pinned revision,
what a record holds, and scoring an adaptive policy exactly the way the benchmark does, with
baselines beside it so a number has context. Running the pretrained AssayFormer policy that
the AssayBench-Loop paper introduces is covered in `assayloop`.

## What "1,389 screens" means

The numbers in the papers and on the dataset card describe different subsets of one file.
Measured on the pinned revision:

| count | what it is |
|---|---|
| 1,901 | entries in the `biogrid` config. Bidirectional screens appear up to three times: `U_<id>_inc`, `U_<id>_dec` and `U_<id>_merged` |
| 1,349 / 218 / 334 | the temporal split in column `yearfold0`: train / validation / test |
| 20 + 20 | the AssayBench-Loop validation and test sets — curated genome-wide subsets of the validation and test folds, shipped with the package as the manifests `assayloop-validation` and `assayloop-test` |
| **1,389** | AssayBench-Loop: all 1,349 training entries plus the 20 + 20 |
| 19 | the separate `LaTest` config: screens published in late 2025 and early 2026, all labelled `test` |

The dataset card states 1,565 unique screens and 1,920 in its abstract; those are the card's
and the paper's figures and were not re-derived here.

**The five phenotype classes are in `cleaned_phenotype`, not `screen_category`.** The dataset
card describes `screen_category` as the coarse phenotype; in the file it holds directionality
(`unidirectional` 1,261, `bidirectional` 565, `recovered_bidirectional` 75). The class counts
in `cleaned_phenotype` are Fitness / Proliferation / Viability 1,027; Drug / Chemical /
Environmental Response 579; Host-Pathogen / Infection Response 160; Molecular Output /
Reporter / Pathway Activity 91; Trafficking / Localization / Structural Phenotypes 44. The
card's own table (1,029 / 590 / 163 / 91 / 44) sums to 1,917 and predates the current file.

## Licence and access

Nothing to obtain: no account, no token, no click-through.

- **Dataset — MIT, ungated.** The Hub card declares `license: mit`; the repository reports
  `gated: false`, `private: false`. The screens come from BioGRID ORCS, whose terms page grants
  the same MIT-style permission ("Permission is hereby granted, free of charge, to any person
  obtaining a copy...").
- **Package — MIT.** `assaybench` on PyPI declares `License-Expression: MIT`; the GitHub
  repository carries an MIT `LICENSE`, copyright Genentech, Inc.
- **Two optional inputs are not covered by that licence, and the package never downloads
  them for you.** The `%essential` metric needs DepMap Public 26Q1's
  `CRISPRInferredCommonEssentials.csv`, which upstream's notice says remains under DepMap's terms
  "including its research-purpose limitation and restrictions on clinical and commercial use";
  `assaybench` checks the file's checksum and refuses any other release. The pathway-diversity
  metrics need MSigDB gene sets, fetched with `assaybench download msigdb-go-bp` on the Broad's
  terms. EF, nAUC, FH and shortfall — everything on this page — need neither. The `depmap`
  skill covers getting DepMap files.

## Before the first block

- **Python 3.11 or newer.** `assaybench` declares `requires-python >=3.11`.
- **About 1.1 GB of disk** for the two parquet files (1,092,438,556 and 4,588,072 bytes), and
  about 400 MB for the environment.
- Network access to `huggingface.co` and the CDN its downloads redirect to.

## Try it

**Data** — the `Genentech/assaybench` dataset on the Hugging Face Hub, both configs, at commit
`fa2ed4195d2eea1e5ed570d1a67c21e47650962d` (2026-09-29), verified by SHA-256. MIT, ungated.
Reachable on 2026-11-15.

**Run** — one block from an empty directory: it installs the pinned package, writes the three
files the rest of this page builds on (`get_files.py`, `loop_eval.py`, `try_it.py`), downloads
the data, and runs the checks. The trap it routes through is the screen set: it resolves the
20 test screens by name from the package's own manifest and refuses to continue if any is
missing, where the package's loader would log a warning and hand back fewer.

```bash
COLD=$(mktemp -d) && cd "$COLD"
python3 -m venv .venv && . .venv/bin/activate
pip install -q "assaybench==0.2.1"

cat > get_files.py <<'EOF'
# Download both AssayBench configs at a pinned Hub revision and verify each file's SHA-256.
import hashlib, pathlib
from huggingface_hub import hf_hub_download

REPO = "Genentech/assaybench"
REVISION = "fa2ed4195d2eea1e5ed570d1a67c21e47650962d"   # Hub commit of 2026-09-29
FILES = {   # path in the repo -> SHA-256 the Hub records for that revision
    "biogrid/train-00000-of-00001.parquet": "fce157f3a436625df9ba51e2cf95fa15357465341aa6feee9d40a14b5bd3cb7a",
    "LaTest/train-00000-of-00001.parquet":  "f33f970b83bb5caf91736e03949c30d96d46111367010026a24d7b3e62c13860",
}
out = pathlib.Path("assaybench_data")
for name, want in FILES.items():
    path = pathlib.Path(hf_hub_download(REPO, name, repo_type="dataset",
                                        revision=REVISION, local_dir=out))
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""):
            h.update(chunk)
    if h.hexdigest() != want:
        raise SystemExit(f"{name}: SHA-256 {h.hexdigest()} is not the pinned {want}")
    print(f"{path}  {path.stat().st_size:,} bytes  sha256 ok")
EOF

cat > loop_eval.py <<'EOF'
# Score an adaptive hit-discovery policy the way AssayBench-Loop does: 20 held-out screens,
# a shared candidate pool, 10 rounds of 100 genes, labels revealed after every round.
import numpy as np, pyarrow.parquet as pq
from assaybench import (load_manifest, screen_from_example, gene_universe,
                        enrichment_factor, adjusted_nauc, fraction_of_hits, shortfall)

BIOGRID = "assaybench_data/biogrid/train-00000-of-00001.parquet"
ROUNDS, BATCH = 10, 100

def load_set(name="assayloop-test"):
    """The manifest's screens, read from the pinned file. Every name must resolve."""
    m = load_manifest(name)
    field, values = m.source["split_field"], set(m.split_values)
    rows = pq.read_table(BIOGRID, filters=[("dataset_name", "in", m.dataset_names)]).to_pylist()
    rows = {r["dataset_name"]: r for r in rows if r[field] in values}
    missing = [n for n in m.dataset_names if n not in rows]
    if missing:
        raise SystemExit(f"{m.summary()}: {len(missing)} screens not in the file: {missing}")
    return [screen_from_example(rows[n]) for n in m.dataset_names]

def run_policy(policy, screen, universe, seed=0):
    """Drive one screen. A label is True/False for a gene the screen measured, None otherwise."""
    rng = np.random.default_rng(seed)
    label_of = dict(zip(screen.genes, screen.hits))
    acquired, history, rounds = set(), [], []
    for t in range(ROUNDS):
        candidates = [g for g in universe if g not in acquired]
        batch = list(policy(screen.context(), list(history), candidates, BATCH, rng))
        if len(batch) > BATCH or len(set(batch)) != len(batch) or acquired & set(batch):
            raise ValueError(f"round {t}: a batch must be at most {BATCH} new, distinct genes")
        rounds.append(batch)
        acquired.update(batch)
        history += [(g, label_of.get(g)) for g in batch]
    return rounds

def score(rounds, screen, universe):
    picked = [g for batch in rounds for g in batch]
    hits = [g for g, h in zip(screen.genes, screen.hits) if h]
    return {"EF": enrichment_factor(picked, screen.genes, hits, universe, budget=ROUNDS * BATCH),
            "nAUC": adjusted_nauc(rounds, screen.genes, hits, universe),
            "FH": fraction_of_hits(picked, screen.genes, hits),
            "SF": shortfall(picked, screen.genes)}

def evaluate(policy, screens, universe, seed=0):
    per_screen = {s.dataset_name: score(run_policy(policy, s, universe, seed), s, universe) for s in screens}
    mean = {k: float(np.mean([v[k] for v in per_screen.values()])) for k in ("EF", "nAUC", "FH", "SF")}
    return mean, per_screen

def random_policy(context, history, candidates, k, rng):
    return list(rng.choice(candidates, size=k, replace=False))
EOF

cat > try_it.py <<'EOF'
# Checks the pinned file, the benchmark set, the metric and the random baseline.
from collections import Counter
import numpy as np, pyarrow.parquet as pq
from assaybench import load_manifest, gene_universe, classify_acquisitions, enrichment_factor
from loop_eval import BIOGRID, ROUNDS, BATCH, load_set, run_policy, evaluate, random_policy

meta = pq.read_table(BIOGRID, columns=["dataset_name", "yearfold0"]).to_pylist()
folds = Counter(r["yearfold0"] for r in meta)
print("entries", len(meta), dict(folds))
assert len(meta) == 1901 and folds == {"train": 1349, "validation": 218, "test": 334}

test, val = load_set("assayloop-test"), load_set("assayloop-validation")
assert len(test) == len(val) == 20 and not {s.dataset_name for s in test} & {s.dataset_name for s in val}
print("AssayBench-Loop screens:", folds["train"] + len(val) + len(test))       # 1,349 + 20 + 20

man = load_manifest("assayloop-test")
crit = man.selection_criteria
for s, row in zip(test, man.screens):
    assert row["num_hits"] == s.total_hits and row["num_genes"] == len(s.genes), s.dataset_name
    assert crit["num_genes_min"] <= len(s.genes) <= crit["num_genes_max"], s.dataset_name
    assert s.total_hits >= crit["num_hits_min"] and s.total_hits / len(s.genes) < crit["max_hit_rate"]

universe = gene_universe(test)
print("candidate pool:", len(universe), "genes")
assert len(universe) == 21147

# EF exactly as defined: |G∩H| / ((N_L + N_hallucinated + N_unfilled) * |H|/|L|).
# This checks the division; the four counts come from the package's own classifier, so it
# does not independently check how picks are classified.
s = test[0]
picked = [g for b in run_policy(random_policy, s, universe, seed=0) for g in b]
hits = [g for g, h in zip(s.genes, s.hits) if h]
c = classify_acquisitions(picked, s.genes, hits, universe, ROUNDS * BATCH)
by_hand = c.n_hits / ((c.n_in_library + c.n_out_of_universe + c.n_unfilled) * len(hits) / len(s.genes))
assert abs(by_hand - enrichment_factor(picked, s.genes, hits, universe, ROUNDS * BATCH)) < 1e-12
print(f"{s.dataset_name}: {c.n_in_library} in library, {c.n_out_library_in_universe} forgiven, "
      f"{c.n_hits} hits, EF {by_hand:.3f}")

efs = []
for seed in range(5):
    mean, _ = evaluate(random_policy, test, universe, seed)
    efs.append(mean["EF"])
    print(f"random seed {seed}: " + "  ".join(f"{k} {v:.3f}" for k, v in mean.items()))
print(f"random EF, 5 seeds: mean {np.mean(efs):.3f}")
assert 0.7 < np.mean(efs) < 1.3
EOF

python get_files.py && python try_it.py
```

**Expect** — invariants, which hold for this revision whatever the date; a failure means the
page is wrong or the pin was not honoured:

- both files pass their SHA-256 check;
- 1,901 entries split 1,349 / 218 / 334, and 1,349 + 20 + 20 = 1,389 AssayBench-Loop screens;
- each of the 20 test screens has the hit and library counts its manifest records, and meets
  the manifest's own selection criteria (18,000–22,000 genes, at least 50 hits, hit rate under 15%);
- the candidate pool is 21,147 genes;
- EF recomputed by hand from its four terms equals `enrichment_factor`;
- random selection averages an EF near 1, which is what EF is normalised to mean.

Observed on 2026-11-15 (assaybench 0.2.1, numpy 2.5.5; the seeded draws depend on numpy's
generator, so another numpy may print different digits):

```
entries 1901 {'train': 1349, 'validation': 218, 'test': 334}
AssayBench-Loop screens: 1389
candidate pool: 21147 genes
1985: 894 in library, 106 forgiven, 12 hits, EF 1.173
random seed 0: EF 1.008  nAUC 0.030  FH 0.048  SF 0.101
random seed 1: EF 0.884  nAUC 0.028  FH 0.042  SF 0.103
random seed 2: EF 0.958  nAUC 0.031  FH 0.046  SF 0.091
random seed 3: EF 0.939  nAUC 0.031  FH 0.044  SF 0.100
random seed 4: EF 1.059  nAUC 0.035  FH 0.050  SF 0.095
random EF, 5 seeds: mean 0.970
```

Install and download took about a minute and a half here; the checks take about five seconds.

## Get the files

`get_files.py` above is the download: both configs as parquet under `assaybench_data/`, at the
pinned revision, each checked against the SHA-256 the Hub records for it. To pin a later
revision, list the Hub's commits and read the new hashes from the tree API, then change
`REVISION` and `FILES` together:

```bash
curl -s https://huggingface.co/api/datasets/Genentech/assaybench/commits/main \
  | python3 -c "import json,sys; [print(c['id'][:7], c['date'][:10], c['title']) for c in json.load(sys.stdin)[:5]]"
curl -s "https://huggingface.co/api/datasets/Genentech/assaybench/tree/fa2ed4195d2eea1e5ed570d1a67c21e47650962d?recursive=true" \
  | python3 -c "import json,sys; [print(f['path'], f['size'], f.get('lfs', {}).get('oid', '')) for f in json.load(sys.stdin) if f['path'].endswith('.parquet')]"
```

**What changed in the last revisions.** Two commits on 2026-09-29 followed the AssayLoop
preprint (2026-09-10): `52d733d` ("fix hit alignment, add unmasked scores") changed the data,
and `fa2ed41`, the pinned revision, fixed only the feature metadata; its BioGRID parquet has
the same SHA-256 as `52d733d`'s. Against `bc37bf8`, the revision before both, the data change
renames one screen
(`U_1513_inc` became `U_1513_dec`, validation fold), changes the hit set of eight
bidirectional entries (six training, two validation: `U_1389`, `U_1633`, `U_1636` `_inc` and
`_merged`, and `U_1718_inc`/`_merged`), and adds the `unmasked_scores` column. No gene list,
relevance score or split label changed, and none of the 40 AssayBench-Loop evaluation screens
is among the nine entries touched. The released AssayFormer checkpoint predates it.

## What a screen record holds

One row per entry. The columns that matter for scoring:

| column | type | what it is |
|---|---|---|
| `dataset_name` | str | the entry's id: a BioGRID ORCS screen number (`"1985"`), or `U_<id>_inc` / `_dec` / `_merged` for the directional halves and union of a bidirectional screen |
| `relevance_genes` | list[str] | the screen's library — every gene that was measured. HGNC symbols |
| `hit` | list[bool] | the published hit call, parallel to `relevance_genes` |
| `relevance_scores` | list[float] | graded relevance, parallel: positive for hits, 0 for non-hits, negative for genes that moved in the opposite direction |
| `combined_scores`, `unmasked_scores`, `raw_scores` | list[float] | the continuous scores behind the relevance score; `raw_scores` is in the source's own units |
| `yearfold0` | str | `train` / `validation` / `test` — the temporal split the benchmarks use |
| `randomfold0..2`, `phenotypefold0..2`, `cell_linefold0..2`, `authorfold0..2` | str | alternative splits; unused by AssayBench-Loop |
| `cleaned_phenotype` | str | one of the five phenotype classes |
| `phenotype`, `cell_line`, `cell_type`, `library_type`, `library_methodology`, `condition_clause`, `duration`, `significance_criteria`, `notes` | str | the experiment description a policy is allowed to see |
| `author`, `source_id` | str | first author and year; `source_id` is a PubMed id for most screens but a DOI or a bioRxiv URL for some (`U_1736_dec`, `U_1987_merged`) |

Checked on every one of the 1,901 rows at this revision, not assumed: the six per-gene arrays
have equal length, no gene repeats within a library, every entry has at least one hit, and
`hit` is exactly `relevance_score > 0`. The `LaTest` config has the same shape minus
`unmasked_scores` and the random folds.

Library sizes run from 32 genes (`U_1423_*`) to 21,205 (`1256`), and hit rates from one hit in
20,506 genes (`2026`) to 98% (`1149`). Those extremes are why the benchmark evaluates only on
its curated 20: see *Scoring outside the curated set* below.

```python
# Counts and invariants over the whole file (run in the Try it directory)
from collections import Counter
import numpy as np, pyarrow.parquet as pq

BIOGRID = "assaybench_data/biogrid/train-00000-of-00001.parquet"
ARRAYS = ["relevance_genes", "relevance_scores", "combined_scores", "unmasked_scores", "raw_scores", "hit"]

meta = pq.read_table(BIOGRID, columns=["dataset_name", "cleaned_phenotype", "screen_category"]).to_pylist()
print("cleaned_phenotype:", dict(Counter(r["cleaned_phenotype"] for r in meta).most_common()))
print("screen_category:", dict(Counter(r["screen_category"] for r in meta)))

bad = []
for batch in pq.ParquetFile(BIOGRID).iter_batches(batch_size=200, columns=["dataset_name"] + ARRAYS):
    for r in batch.to_pylist():
        n = len(r["relevance_genes"])
        rs, hit = np.asarray(r["relevance_scores"]), np.asarray(r["hit"], dtype=bool)
        if any(len(r[k]) != n for k in ARRAYS) or len(set(r["relevance_genes"])) != n \
                or not np.array_equal(hit, rs > 0) or not hit.any():
            bad.append(r["dataset_name"])
print("rows breaking an invariant:", len(bad), bad[:5])
```

Observed: `rows breaking an invariant: 0 []`, with the class and category counts given above.
This matters because `screen_from_example`, the package's row normaliser, pads or truncates
arrays of unequal length to the gene list without saying so. On this revision it has nothing
to pad; on another, run the check before trusting a loaded screen.

## The protocol, exactly

AssayBench-Loop scores a policy like this, and `loop_eval.py` above implements it:

1. **Screens:** the 20 in `assayloop-test` (the 20 in `assayloop-validation` are for choosing
   models). Every reported number is a plain mean over the 20, each screen weighted equally.
2. **Candidate pool:** one shared pool, the genes present in at least two of the 20 libraries —
   `gene_universe(screens)`, 21,147 genes. A policy may name any gene; the pool is what it is
   offered.
3. **Budget:** 10 rounds of 100 genes. After each round the policy learns, for every gene it
   picked, whether that gene was a hit — or that the screen never measured it.
4. **Score:** the hit enrichment factor (AssayLoop Eq. 3)

   EF = |G ∩ H| / ((N_L + N_hallucinated + N_unfilled) · |H| / |L|)

   with G the genes picked over all rounds, L the screen's library, H its hits, N_L the picks
   inside the library, N_hallucinated picks that are not real gene symbols (not in the pool),
   and N_unfilled the budget slots left empty. A real gene outside this screen's library costs
   nothing — no label exists for it — so picks outside L but inside the pool are dropped from
   the denominator. EF 1 is random; EF 4 means four times the hits random selection would find
   for the same effective spend. Secondary: adjusted nAUC (how early the hits came), FH
   (fraction of all hits found) and SF (share of picks outside the library).

`enrichment_factor` takes `universe` and `budget` as optional arguments, and both defaults
change the number: with `universe=None` every out-of-library pick is forgiven, hallucinations
included, and with `budget=None` empty slots cost nothing. Pass both, as `score()` does.

Two things the harness enforces that the metric functions do not. **A repeated gene is an
error:** `enrichment_factor` counts every pick as it appears, so a policy that names the same
hit twice would be credited twice; `run_policy` raises instead. **A short batch is allowed and
charged:** returning 40 genes in a 100-gene round is legal and costs 60 unfilled slots, the
benchmark's convention.

The error path, checked:

```python
from loop_eval import load_set, run_policy
from assaybench import gene_universe

screens = load_set()
universe = gene_universe(screens)

def repeats(context, history, candidates, k, rng):
    return candidates[:50] + candidates[:50]

try:
    run_policy(repeats, screens[0], universe)
except ValueError as e:
    print("refused:", e)
```

Observed: `refused: round 0: a batch must be at most 100 new, distinct genes`.

## Scoring a policy, with baselines beside it

A policy is a function `policy(context, history, candidates, k, rng) -> list of genes`.
`context` is the screen's description (`phenotype`, `cell_line`, `condition_clause` and the
rest; it carries no labels), `history` is every `(gene, label)` revealed so far, where `label`
is `True`, `False`, or `None` for a gene the screen did not measure.

Two baselines, run in the Try it directory. The first ranks genes by how many training
entries called them a hit and ignores feedback. It counts entries, not screens: a
bidirectional screen appears as `_inc`, `_dec` and `_merged`, so a hit in one direction is
counted twice (that half plus `_merged`). The second is adaptive: it weights each
training screen by how many of the labels seen so far it reproduces, then ranks genes by
weighted training hits — so it starts as the first baseline and moves toward screens that
behave like this one.

```python
from collections import Counter
import numpy as np, pyarrow.parquet as pq
from assaybench import gene_universe
from loop_eval import BIOGRID, load_set, evaluate

screens = load_set("assayloop-test")
universe = gene_universe(screens)
col = {g: i for i, g in enumerate(universe)}

train = pq.read_table(BIOGRID, columns=["relevance_genes", "hit"], filters=[("yearfold0", "==", "train")])
H = np.zeros((train.num_rows, len(universe)), dtype=np.float32)   # gene was a hit in training screen t
M = np.zeros_like(H)                                              # gene was measured in training screen t
for t, (genes, hits) in enumerate(zip(train["relevance_genes"].to_pylist(), train["hit"].to_pylist())):
    for g, h in zip(genes, hits):
        if g in col:
            M[t, col[g]], H[t, col[g]] = 1.0, float(h)
print("training entries:", train.num_rows)

freq = H.sum(axis=0)
def prior_hit_policy(context, history, candidates, k, rng):
    return sorted(candidates, key=lambda g: (-freq[col[g]], g))[:k]

def agreement_policy(context, history, candidates, k, rng):
    hit, seen = np.zeros(len(universe), np.float32), np.zeros(len(universe), np.float32)
    for g, label in history:
        if label is not None and g in col:          # None: this screen did not measure g
            seen[col[g]], hit[col[g]] = 1.0, float(label)
    agree = H @ hit + (M - H) @ (seen - hit)        # labels training screen t reproduces
    score = ((agree + 1.0) / (M @ seen + 2.0)) @ H
    return sorted(candidates, key=lambda g: (-score[col[g]], g))[:k]

for name, policy in [("prior-hit", prior_hit_policy), ("agreement", agreement_policy)]:
    mean, per_screen = evaluate(policy, screens, universe)
    print(f"{name:10s}", "  ".join(f"{k} {v:.3f}" for k, v in mean.items()))
```

Observed on 2026-11-15, next to figures from the AssayLoop paper's Table 1 (inherited, not
re-run here, except where marked):

| policy | EF | nAUC | FH | SF | source |
|---|---|---|---|---|---|
| random, mean of 5 seeds | 0.970 | 0.031 | 0.046 | 0.098 | this page |
| prior-hit frequency | 2.914 | 0.115 | 0.152 | 0.011 | this page |
| agreement-weighted training hits | 3.118 | 0.126 | 0.163 | 0.010 | this page |
| AssayFormer (released checkpoint) | 4.829 | 0.172 | 0.232 | 0.100 | re-run as described in `assayloop`; paper 4.83 |
| random, one draw | 1.04 | 0.034 | 0.049 | 0.100 | paper |
| prior-hit baseline | 2.87 | 0.115 | 0.149 | 0.015 | paper |
| best LLM handoff to AssayFormer | 5.67 | 0.217 | 0.277 | 0.076 | paper |

The prior-hit row here is close to the paper's but not identical; the paper's baseline may
break ties or count frequency differently, and its training data is `bc37bf8`, the revision
before the 2026-09-29 data change (`52d733d`). The AssayFormer row was reproduced by running the released checkpoint through
this same `evaluate()` harness: per-screen EF matches the upstream loop on all 20 screens.

## Loading through the package instead

`assaybench` has its own loaders — `AssayBenchDataset` (the original task's splits and
prompts) and `load_screens` (manifests to `ScreenRecord`s). Both call `load_dataset` with no
revision, so they read whatever `main` is today. The `datasets` cache directory is named after
the commit it resolved, which is what lets you check:

```python
from assaybench import AssayBenchDataset, load_screens

PIN = "fa2ed4195d2eea1e5ed570d1a67c21e47650962d"
ds = AssayBenchDataset(dataset_name="biogrid", split_type="year", fold=0, novel_dataset_name="LaTest")
train, val, test, latest = ds.get_train_test_split()
resolved = ds.dataset["train"].cache_files[0]["filename"]
assert PIN in resolved, f"main has moved past the pin: {resolved}"
print(len(train), len(val), len(test), len(latest))

screens = load_screens("assayloop-test")
assert len(screens) == 20, len(screens)
print([s.dataset_name for s in screens[:3]])
```

Observed: `1349 218 334 19` and `['U_1733_merged', 'U_1735_dec', 'U_1736_dec']`. The first call
downloads the same 1.1 GB into the Hugging Face cache and builds a 1.0 GB Arrow copy under
`~/.cache/huggingface/datasets` (about a minute here). Two things to know:

- **`load_screens` with a manifest drops unknown names with only a log warning** (its
  `strict` defaults to `False` for manifests, `True` for an explicit `dataset_names=` list).
  A manifest naming a screen that is not in the file returns fewer screens and a smaller
  mean. Assert the count, as above, or pass `strict=True`.
- **It returns screens in file order, not manifest order** — `U_1733_merged` first rather
  than the manifest's `1985`. Anything indexed by position (`screens[0]`) differs between the
  two loaders.

`get_train_test_split()` returns dicts with a rendered `question` prompt and drops the
`combined_scores` and `unmasked_scores` columns; read the parquet when you need those.

## Scoring outside the curated set

The harness accepts any screen, but EF is only meaningful where the effective budget is
large. Measured with the random policy against the 21,147-gene pool:

| screen | library | hits | effective picks of 1,000 | EF, three seeds |
|---|---|---|---|---|
| `U_1423_merged` | 32 | 9 | 0–2 | 0.0, 0.0, 0.0 |
| `U_1037_dec` | 474 | 99 | 22–26 | 0.77, 0.44, 1.84 |
| `1149` | 508 | 499 (98%) | 24–34 | 1.02 each |
| `2026` | 20,506 | 1 | 974–975 | 21.05, 0.0, 0.0 |
| `1256` | 21,205 | 1,361 | 903–914 | 1.19, 1.36, 1.01 |
| `vlp_myeloid_tnf_neg` (LaTest) | 582 | 31 | 22–27 | 2.89, 1.39, 3.41 |

A small library against a genome-wide pool leaves almost every pick forgiven, so EF rests on a
handful of genes; a screen with one hit swings between 0 and 21. And `1256`'s library has
2,021 genes that are not in the pool at all, so a pool-bound policy can never pick them. To
score a non-genome-wide screen, give it its own library as the pool
(`gene_universe([screen], min_screen_freq=1)`), so every pick is charged, and report the
effective budget beside the EF. For a set of screens of your own, keep the selection rule the
benchmark used (18,000–22,000 genes, at least 50 hits, hit rate under 15%) or say that you
did not.

## What does not work

- **`AssayBenchDataset(max_examples=...)`** fails on `load()` with `AttributeError:
  'DatasetDict' object has no attribute 'select'`. Slice the returned lists instead.
- **Pinning through the package.** Neither loader takes a revision. Use `get_files.py`, or the
  cache-path assertion above.
- **The dataset card's tables.** Its phenotype counts sum to 1,917 rather than the file's 1,901,
  and it calls `screen_category` the phenotype class. Trust the file.
- **`%essential` and pathway metrics out of the box.** Both need assets the package
  deliberately does not ship (see *Licence and access*); calling them without the files raises
  a missing-asset error rather than computing against something else.

## Limits worth stating plainly

- A screen's hit set is what its authors called a hit at their threshold. Genes outside a
  library have no label at all, which is why EF forgives them; it also means a policy can be
  right about a gene the benchmark cannot score.
- The random rows are draws, not expectations; five seeds here spread from 0.884 to 1.059.
  Compare policies on the same seeds, or report the spread.
- Nothing here is the original single-shot AssayBench task. That task scores one ranked list
  per screen with `RankingMetrics` (adjusted nDCG@100) over the 334 test-fold entries; its
  frequency baselines are defined in upstream's `benchmarking/` directory and were not
  re-derived here.
