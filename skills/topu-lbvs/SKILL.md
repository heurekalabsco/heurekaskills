---
name: topu-lbvs
description: Benchmark ligand-based virtual screening against TopU-LBVS — 93 ChEMBL targets in 7 protein classes, property-matched hard decoys at a fixed 1:40 ratio, three protocols with seeded splits. Fetch the libraries and score EF@1%.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, virtual-screening, cheminformatics, drug-discovery, evaluation]
covers: [ligand-based virtual screening, lbvs, virtual screening, hard negatives, decoys, property-matched decoys, chembl, bioactivity, enrichment factor, drug discovery, hit finding, molecular property prediction, ecfp4, morgan fingerprint, tanimoto, graph neural network, kinase, gpcr, nuclear receptor, protease, ion channel, cytochrome p450, egfr, herg, thrombin, estrogen receptor, acetylcholinesterase, adenosine a2a, small molecule, scaffold split]
papers: [doi:10.48550/arXiv.2609.29740]
access: [open]
datasets: [https://huggingface.co/api/datasets/topu-benchmark/topu-lbvs, https://huggingface.co/datasets/topu-benchmark/topu-lbvs/resolve/main/targets_master.csv, https://huggingface.co/datasets/topu-benchmark/topu-lbvs/resolve/main/topu-lbvs-mini/thrb/s1/CHEMBL204_topUnbiased.csv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-09-26
  against: >-
    TopU-LBVS dataset at revision 281d456 (2,210 files, 821.5 MB) and the topu-lbvs
    repository at main / Python 3.11.15 / rdkit 2026.03.6 / numpy 2.4.6 / datasets 5.0.1
  executed: 6
  unverified: 1
  unverified_reason: >-
    The precomputed *_ecfp4.npz route is unrun. Those files are Git-LFS objects whose
    download redirects to object storage this validating host could not reach, while
    plain-text CSVs on the same host fetched normally — so the block is unverified, not
    broken. Re-run from a host that can fetch Hugging Face LFS objects. The CSV route
    reaches the same molecules and is fully executed, so nothing here depends on it.
---

# TopU-LBVS

A multi-target benchmark for **ligand-based virtual screening** — ranking compounds for one
protein target from ligand structure alone, with no receptor. TopU-LBVS exists because the
usual LBVS numbers are flattered by easy negatives: if decoys are drawn at random from a
compound library they differ from the actives in molecular weight and logP, and a model that
has learned nothing but "actives in this series are heavy" scores well.

TopU-LBVS removes that shortcut. For each of 93 targets it builds a screening library of
property-matched, structurally similar decoys at a **fixed 1:40 active-to-decoy ratio**, so
enrichment has to come from something other than bulk physicochemistry. Two consequences
follow from that ratio and are worth holding onto before you read any score:

- **EF@1% cannot exceed 41.** With 1 active per 41 compounds, a perfect ranking fills the top
  1% with actives and no more. Published EF numbers in the single digits are a large fraction
  of the achievable range, not a small one.
- **A fair comparison needs the paired control.** Setting 3 re-runs the same targets with
  random decoys and matched active counts, so the EF gap between Setting 1 and Setting 3
  isolates the effect of decoy construction rather than of the model.

## Before you start

Nothing to obtain — no account, no key, no licence click-through. The dataset is public on
Hugging Face and every fetch below ran anonymously.

Two licences apply and they are not the same one:

- **Code** (the evaluation harness and baselines) is **MIT**.
- **Data** (the screening libraries and splits) is **CC-BY-SA-4.0**.

Share-alike on the data restricts **redistribution**, not use. Screening against these
libraries, publishing the scores, and building models on them are unrestricted. But a
derivative of the *data* that you redistribute — a reformatted copy, a merged library, a
filtered subset published as its own dataset — carries CC-BY-SA-4.0 forward. Cite, and keep
your own redistribution separate from your model weights.

Sizes, measured at revision `281d456`: the whole release is **821.5 MB across 2,210 files**.
The `topu-lbvs-mini` CSV layer used by the Try it check is about 29 MB, and one target's
Setting-1 pair is under 4 MB.

## What is in the release

Four protocol directories, plus `targets_master.csv` and `README.md` at the root:

| directory | targets | what it is |
|---|---|---|
| `topu-lbvs-full` | 93 | the main benchmark — train on ChEMBL bioactivity, test on the TopU library |
| `topu-lbvs-mini` | 7 | one target per protein class, carrying both Setting 1 and the Setting 3 control |
| `topu-lbvs-few-tier1` | 46 | few-shot protocol, tier 1 |
| `topu-lbvs-few-tier2` | 47 | few-shot protocol, tier 2 |

The two few-shot tiers partition the 93 targets (46 + 47). File counts are uniform and were
checked exhaustively: every one of the 93 `full` targets carries exactly 13 files, and every
few-shot target exactly 9 — with one exception, recorded under **Known gaps** below.

`targets_master.csv` is the index. It carries 93 rows keyed by a short target slug, with the
ChEMBL target ID, UniProt accession, a representative PDB code, the protein class, and active
and decoy counts at each curation stage.

```python
# Registry overview, straight from the index. No dependencies beyond the standard library.
import csv, io, collections, statistics, urllib.request

BASE = "https://huggingface.co/datasets/topu-benchmark/topu-lbvs/resolve/main"
raw = urllib.request.urlopen(f"{BASE}/targets_master.csv", timeout=90).read().decode()
rows = list(csv.DictReader(io.StringIO(raw)))

print("targets:", len(rows))
classes = collections.Counter(r["class"] for r in rows)
print("protein classes:", len(classes))
for name, n in classes.most_common():
    print(f"  {name:20s} {n}")

# Library size is actives + decoys. The ratio is fixed, so size scales with the active count.
sizes = sorted((int(r["topu_active_count"]) + int(r["topu_inactive_count"]), r["target"])
               for r in rows)
print("\nlibrary size  min %d (%s)  median %d  max %d (%s)"
      % (sizes[0][0], sizes[0][1],
         statistics.median(s[0] for s in sizes),
         sizes[-1][0], sizes[-1][1]))

# The ratio is exact, not approximate — check it rather than trusting it.
off = [r["target"] for r in rows
       if int(r["topu_inactive_count"]) != 40 * int(r["topu_active_count"])]
print("targets deviating from 1:40:", len(off))
```

That prints 93 targets over 7 classes — Kinase 26, Other Enzymes 24, GPCR 13, Nuclear Receptor
11, Protease 10, Ion channel 5, Cytochrome P450 4 — and confirms the 1:40 ratio holds exactly
for all 93. Libraries run from **410 compounds** (five targets tie at the floor) to **14,432**
for `kcnh2`, median 2,173. The paper describes libraries as roughly 400 to 10,000 compounds;
`kcnh2` is the one target above that range, which matters only if you are sizing a download.

Targets are mostly human (84 of 93); the remainder are HIV-1 (3) plus one each of *E. coli*
K-12, *M. tuberculosis*, rat, sheep, mouse and rabbit.

## Get the files

**Start here: `load_dataset` does not work on this dataset, and the failure is misleading.**

The dataset card declares five `configs` pointing at `flat/topu-lbvs-*/{train,validation,test}.parquet`.
No `flat/` directory exists in the repository — there are no `.parquet` files in it at all, and
all five declared paths return 404. So the loader resolves a path from the card, fails to find
it, and reports that it could not find the *dataset*, which reads like a name error or a
permissions problem rather than a broken card.

```python
# The error path, so you recognise it instead of debugging your own code.
from datasets import load_dataset
try:
    load_dataset("topu-benchmark/topu-lbvs", "mini_hard")
except FileNotFoundError as e:
    print("FileNotFoundError, as expected:")
    print(str(e)[:400])
```

The message names `hf://datasets/topu-benchmark/topu-lbvs@281d456.../flat/topu-lbvs-full/train.parquet`
— note it reports the *first* config's path whatever config you asked for, so do not read the
name in the error as the thing you requested. Fetch files directly instead.

### The addressing scheme, and the join you cannot skip

Paths look like `<protocol>/<target>/<...>/<CHEMBL_ID>_<kind>.<ext>`. The directory is named
with the short target slug (`thrb`), and the files inside it are named with the ChEMBL target
ID (`CHEMBL204`). **Neither name is derivable from the other**, so every download needs a
lookup through the protocol's `targets.csv` first. Constructing paths from the slug alone is
the mistake to avoid; it 404s on every target.

```bash
# Resolve a slug to its ChEMBL ID, then fetch that target's Setting-1 pair.
set -euo pipefail
BASE="https://huggingface.co/datasets/topu-benchmark/topu-lbvs/resolve/main"
TARGET="thrb"

curl -sSL -o mini_targets.csv "$BASE/topu-lbvs-mini/targets.csv"
CHEMBL=$(awk -F, -v t="$TARGET" 'NR>1 && $1==t {print $3}' mini_targets.csv)
echo "$TARGET -> $CHEMBL"

D="topu-lbvs-mini/$TARGET/s1"
mkdir -p "$D/splits/seed_2026"
curl -sSL -o "$D/${CHEMBL}_topUnbiased.csv" "$BASE/$D/${CHEMBL}_topUnbiased.csv"
curl -sSL -o "$D/${CHEMBL}_final.csv"       "$BASE/$D/${CHEMBL}_final.csv"
curl -sSL -o "$D/splits/seed_2026/split_info.json" \
     "$BASE/$D/splits/seed_2026/split_info.json"
wc -l "$D"/*.csv
```

Two CSVs carry every molecule you need, with the columns `smiles,ID,is_active`:

- **`<CHEMBL_ID>_final.csv`** — the **training pool**: curated ChEMBL actives and inactives at
  a 1:10 ratio, with the TopU test library removed.
- **`<CHEMBL_ID>_topUnbiased.csv`** — the **test library**: the TopU hard-decoy screen at 1:40.

`splits/seed_<seed>/split_info.json` records how the pool divides into train and validation
(85/15 on actives), the counts at every stage, and a `verify_status` field. It is the cheapest
way to check a download landed intact, because the numbers in it are independently checkable
against the CSVs you just fetched.

```python
# Confirm the download against the split manifest rather than assuming it.
import csv, json

D = "topu-lbvs-mini/thrb/s1"
info = json.load(open(f"{D}/splits/seed_2026/split_info.json"))
test = list(csv.DictReader(open(f"{D}/CHEMBL204_topUnbiased.csv")))
pool = list(csv.DictReader(open(f"{D}/CHEMBL204_final.csv")))

t_act = sum(r["is_active"] == "1" for r in test)
p_act = sum(r["is_active"] == "1" for r in pool)
print(f"test  {len(test):6d} rows  {t_act:5d} actives  ratio 1:{(len(test)-t_act)/t_act:.0f}")
print(f"pool  {len(pool):6d} rows  {p_act:5d} actives  ratio 1:{(len(pool)-p_act)/p_act:.0f}")
print("manifest verify_status:", info["verify_status"])

assert t_act == info["test_actives"] and len(test) - t_act == info["test_inactives"]
assert p_act == info["n_actives_total"]
print("counts agree with the manifest")
```

### CSV or NPZ

Beside each CSV sits a `*_ecfp4.npz` with precomputed ECFP4 features. The dataset's own
protocol README documents those archives as holding `X` (n × 2048 fingerprints), `y` (labels),
`smiles` and `ids`.

**This skill uses the CSV route throughout, and you probably should too.** Recomputing ECFP4
from SMILES with rdkit takes about 11 seconds for a full target pair, the CSVs are a fraction
of the download, and you control the fingerprint parameters instead of inheriting them. The
NPZ files are also Git-LFS objects, so on networks that proxy or block object storage they
fail while the CSVs beside them succeed.

```python
# The NPZ route, for when you want upstream's exact features. NOT executed during validation
# (see unverified_reason) — treat the key names as upstream's documentation, not as measured.
import numpy as np

z = np.load("topu-lbvs-mini/thrb/s1/CHEMBL204_topUnbiased_ecfp4.npz", allow_pickle=True)
print("keys:", list(z.keys()))
print("X", z["X"].shape, z["X"].dtype, "| y", z["y"].shape, "| actives", int(z["y"].sum()))
```

### Fetching a whole protocol

The mini protocol's CSV layer is the practical unit for local work — seven targets, both
settings' pools, about 29 MB.

```bash
# All seven mini targets' Setting-1 CSVs, resolved through targets.csv.
set -euo pipefail
BASE="https://huggingface.co/datasets/topu-benchmark/topu-lbvs/resolve/main"
curl -sSL -o mini_targets.csv "$BASE/topu-lbvs-mini/targets.csv"

tail -n +2 mini_targets.csv | while IFS=, read -r target name chembl rest; do
  D="topu-lbvs-mini/$target/s1"
  mkdir -p "$D/splits/seed_2026"
  for f in "${chembl}_topUnbiased.csv" "${chembl}_final.csv"; do
    [ -s "$D/$f" ] || curl -sSL -o "$D/$f" "$BASE/$D/$f"
  done
  [ -s "$D/splits/seed_2026/split_info.json" ] || curl -sSL \
     -o "$D/splits/seed_2026/split_info.json" \
     "$BASE/$D/splits/seed_2026/split_info.json"
  echo "$target ($chembl) done"
done
du -sh topu-lbvs-mini
```

To enumerate the repository rather than guess at it, use the tree API — but note it **pages at
50 entries**, and a single unpaginated request returns a small, plausible-looking slice that
silently omits almost everything.

```python
# Full file inventory. The Link header is the only thing that tells you there is more.
import json, re, urllib.request, collections

url = ("https://huggingface.co/api/datasets/topu-benchmark/topu-lbvs"
       "/tree/main?recursive=true&expand=true")
entries, pages = [], 0
while url and pages < 100:
    with urllib.request.urlopen(url, timeout=90) as r:
        entries += json.load(r)
        link = r.headers.get("Link", "") or ""
    pages += 1
    m = re.search(r'<([^>]+)>;\s*rel="next"', link)
    url = m.group(1) if m else None

files = [e for e in entries if e.get("type") == "file"]
print(f"pages {pages}  entries {len(entries)}  files {len(files)}")
print("total size: %.1f MB" % (sum(e.get("size") or 0 for e in files) / 1e6))
print("by extension:", dict(collections.Counter(
    e["path"].rsplit(".", 1)[-1] for e in files if "." in e["path"])))
print("top level:", sorted({e["path"].split("/")[0] for e in entries}))
```

## The three protocols

**Setting 1 — the main benchmark** (`topu-lbvs-full`, and `s1/` under `topu-lbvs-mini`). Train
on the curated ChEMBL pool at 1:10 with the TopU library held out, then rank the full TopU
library at 1:40. Primary metric **EF@1%**.

**Setting 3 — the paired random-decoy control** (`s3/` under `topu-lbvs-mini`). Same targets and
the same number of test actives, but decoys drawn at random instead of property-matched. Run it
alongside Setting 1 and report both: the gap is the measurement. Reporting a Setting 3 number
alone reintroduces exactly the easy-negative inflation the benchmark was built to remove.

**Few-shot** (`topu-lbvs-few-tier1`, `topu-lbvs-few-tier2`). Train and test both drawn from the
TopU library, split into two tiers by available actives. Primary metric **EF@10%**, because at
tier-1 active counts the top 1% of a library can hold fewer compounds than a meaningful
enrichment needs.

Every protocol ships three seeds — **2026, 2027 and 2028**. Report the mean and spread across
all three; a single seed on a few-hundred-active library is noise.

## Scoring

Enrichment factor at a fraction *f* of the ranked library is the precision in the top *f*
divided by the base rate:

    EF@f = (actives in top f / size of top f) / (total actives / library size)

The base rate is fixed at 1/41, so **EF@1% is bounded above by 41.0** and a random ranker
scores 1.0. Use PR-AUC for model selection on the validation split, where the imbalance makes
ROC-AUC look uniformly good.

```python
# EF and PR-AUC over the Setting-1 library, with a Tanimoto nearest-neighbour baseline.
import csv, numpy as np
from rdkit import Chem, DataStructs, RDLogger
from rdkit.Chem import rdFingerprintGenerator
RDLogger.DisableLog("rdApp.*")

D, CHEMBL = "topu-lbvs-mini/thrb/s1", "CHEMBL204"
gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)

def featurise(path):
    fps, y = [], []
    for r in csv.DictReader(open(path)):
        m = Chem.MolFromSmiles(r["smiles"])
        if m is None:
            continue
        fps.append(gen.GetFingerprint(m))
        y.append(int(r["is_active"]))
    return fps, np.array(y)

pool_fps, pool_y = featurise(f"{D}/{CHEMBL}_final.csv")
test_fps, test_y = featurise(f"{D}/{CHEMBL}_topUnbiased.csv")
refs = [f for f, lab in zip(pool_fps, pool_y) if lab == 1]

# Baseline: score each test compound by its closest known active.
scores = np.array([max(DataStructs.BulkTanimotoSimilarity(f, refs)) for f in test_fps])

def ef(scores, y, frac):
    n = max(1, round(len(y) * frac))
    top = np.argsort(-scores, kind="stable")[:n]
    return (y[top].sum() / n) / (y.sum() / len(y)), int(y[top].sum()), n

for frac in (0.01, 0.05, 0.10):
    val, hits, n = ef(scores, test_y, frac)
    print(f"EF@{frac:>5.0%} = {val:5.2f}   ({hits} actives in top {n})")

order = np.argsort(-scores, kind="stable")
tp = np.cumsum(test_y[order])
prec = tp / np.arange(1, len(order) + 1)
rec = tp / test_y.sum()
print("PR-AUC  = %.4f" % np.sum(np.diff(np.concatenate([[0], rec])) * prec))
print("ceiling = %.2f" % (len(test_y) / test_y.sum()))
```

Run on `thrb` this gives EF@1% 10.49, EF@5% 5.20, EF@10% 3.66 and PR-AUC 0.1794 against a
ceiling of 41.00. Across the seven mini targets the same baseline ranges from **3.15**
(`aa2ar`) to **10.49** (`thrb`) — a nearest-neighbour search on fingerprints is a real
baseline here, not a floor, and any learned model is worth reporting against it.

To run upstream's own baselines and models instead, clone the MIT-licensed harness — it wraps
`morgan_rf`, `tanimoto_nn`, GIN, GAT, GPS, D-MPNN and MolFormer behind `run_setting1.py`,
`run_setting2.py` and `run_setting3.py`, each taking `--model`, `--target` and `--seeds`, with
Weights & Biases optional behind `--no_wandb`.

    git clone https://github.com/topu-benchmark/topu-lbvs.git

Its `requirements.txt` pins numpy, scipy, pandas, rdkit, scikit-learn, torch,
torch_geometric, chemprop, transformers and lightning. That is a GPU-scale dependency set;
the CSV route above needs only rdkit and numpy.

## Known gaps and traps

Measured at revision `281d456`, in the order you are likely to hit them.

1. **`load_dataset` cannot work.** The card's five configs point at `flat/*.parquet` paths
   that do not exist. Fetch files directly.
2. **The slug/ChEMBL-ID split.** Directories are named by slug, files by ChEMBL target ID.
   Always join through the protocol's `targets.csv`.
3. **`aces` is missing one file.** `topu-lbvs-mini/aces/s3/CHEMBL220_test_s3_seed2026_ecfp4.npz`
   is absent, so the Setting 3 control for `aces` cannot be evaluated at seed 2026. Every other
   mini target carries all nine `s3` files. Use seeds 2027 and 2028 for `aces`, and say so
   rather than reporting a 7-target Setting 3 mean that quietly rests on 6 at that seed.
4. **`ID` is not a unique key, so do not audit leakage on it.** Across the seven mini targets'
   Setting-1 files, 732 ChEMBL IDs occur more than once within a training pool and 143 IDs
   appear in both the training pool and the test library — while **zero SMILES** are shared
   between pool and library. Every pair inspected was a stereoisomer of one flat structure with
   both members labelled decoy. The split is clean at the structure level; an ID-keyed check
   reports 143 false positives and an ID-keyed de-duplication silently deletes real test
   compounds. Audit on canonical SMILES.
5. **The tree API pages at 50 entries.** Follow the `Link` header, or you will conclude the
   repository holds 50 files when it holds 2,210.
6. **`.npz` and `.npy` files are Git-LFS objects.** Their download redirects to object storage.
   On a restricted network they can fail while text files on the same host succeed — that is a
   network symptom, not a missing file, and the CSV route is unaffected.

## Try it

A self-contained check that this skill still works. Public data, no account, no key. Fetches
about 3.9 MB and runs in well under a minute.

**Data** — the `thrb` (thrombin, `CHEMBL204`) Setting-1 pair from the mini protocol:

    https://huggingface.co/datasets/topu-benchmark/topu-lbvs/resolve/main/topu-lbvs-mini/thrb/s1/CHEMBL204_topUnbiased.csv
    https://huggingface.co/datasets/topu-benchmark/topu-lbvs/resolve/main/topu-lbvs-mini/thrb/s1/CHEMBL204_final.csv

Licensed CC-BY-SA-4.0, public, no account. `thrb` is the smallest complete mini target. Last
confirmed reachable 2026-09-26.

The block routes through the two traps most likely to bite: it resolves the slug to its ChEMBL
ID through `targets.csv` rather than assuming the filename, and it audits leakage on canonical
SMILES rather than on `ID` — asserting the 2 shared IDs and 0 shared structures, so nobody
"fixes" the audit by keying it on `ID` again.

```python
# pip install rdkit numpy
import csv, io, json, urllib.request, numpy as np
from rdkit import Chem, DataStructs, RDLogger
from rdkit.Chem import rdFingerprintGenerator
RDLogger.DisableLog("rdApp.*")

BASE = "https://huggingface.co/datasets/topu-benchmark/topu-lbvs/resolve/main"
get = lambda p: urllib.request.urlopen(f"{BASE}/{p}", timeout=180).read().decode()

# Trap 1: the filename uses the ChEMBL ID, the directory uses the slug. Join, never guess.
idx = {r["target"]: r["chembl_id"]
       for r in csv.DictReader(io.StringIO(get("topu-lbvs-mini/targets.csv")))}
TARGET = "thrb"
CHEMBL = idx[TARGET]
assert CHEMBL == "CHEMBL204", CHEMBL

D = f"topu-lbvs-mini/{TARGET}/s1"
test = list(csv.DictReader(io.StringIO(get(f"{D}/{CHEMBL}_topUnbiased.csv"))))
pool = list(csv.DictReader(io.StringIO(get(f"{D}/{CHEMBL}_final.csv"))))
info = json.loads(get(f"{D}/splits/seed_2026/split_info.json"))

# --- invariants: these hold across versions. A failure means the skill is wrong. ---
t_act = sum(r["is_active"] == "1" for r in test)
p_act = sum(r["is_active"] == "1" for r in pool)
assert (len(test) - t_act) == 40 * t_act, "test library is not at the fixed 1:40 ratio"
assert (len(pool) - p_act) == 10 * p_act, "training pool is not at 1:10"
assert t_act == info["test_actives"] and p_act == info["n_actives_total"]
assert info["verify_status"] == "PASS"
assert set(test[0]) == {"smiles", "ID", "is_active"}

# Trap 2: audit leakage on structure, not on ID.
shared_ids = {r["ID"] for r in test} & {r["ID"] for r in pool}
shared_smiles = {r["smiles"] for r in test} & {r["smiles"] for r in pool}
assert not shared_smiles, "a structure leaked between training pool and test library"

gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)
def featurise(rows):
    fps, y = [], []
    for r in rows:
        m = Chem.MolFromSmiles(r["smiles"])
        assert m is not None, f"unparseable SMILES {r['ID']}"   # all 51,894 parse
        fps.append(gen.GetFingerprint(m)); y.append(int(r["is_active"]))
    return fps, np.array(y)

pool_fps, pool_y = featurise(pool)
test_fps, test_y = featurise(test)
refs = [f for f, lab in zip(pool_fps, pool_y) if lab == 1]
scores = np.array([max(DataStructs.BulkTanimotoSimilarity(f, refs)) for f in test_fps])

n = round(len(test_y) * 0.01)
top = np.argsort(-scores, kind="stable")[:n]
ef1 = (test_y[top].sum() / n) / (test_y.sum() / len(test_y))
ceiling = len(test_y) / test_y.sum()
assert 1.0 < ef1 <= ceiling, f"EF@1% {ef1} outside (1, {ceiling}]"

print(f"{TARGET} ({CHEMBL})")
print(f"  test library   {len(test):6d} = {t_act} actives + {len(test)-t_act} decoys (1:40)")
print(f"  training pool  {len(pool):6d} = {p_act} actives + {len(pool)-p_act} decoys (1:10)")
print(f"  shared IDs {len(shared_ids)} / shared structures {len(shared_smiles)}")
print(f"  EF@1% {ef1:.2f} of a possible {ceiling:.2f}   ({int(test_y[top].sum())} in top {n})")
```

**Expect** — invariants first, then values that are dated and may drift.

*Invariants.* The test library is 1:40 and the training pool 1:10, both agreeing with
`split_info.json`; `verify_status` is `PASS`; the columns are exactly `smiles,ID,is_active`;
every SMILES parses under rdkit; no structure is shared between pool and library; and EF@1%
lands in `(1, 41]`.

*Observed, 2026-09-26 at revision `281d456`, rdkit 2026.03.6.* Test library 4,264 = 104 + 4,160.
Training pool 47,630 = 4,330 + 43,300. Shared IDs 2, shared structures 0. EF@1% **10.49** of a
possible 41.00, with 11 actives in the top 43. A changed EF here means the fingerprint or
rdkit version moved, not that the benchmark broke — the assertion is the bound, not the value.

## Licence and citation

Code MIT; data CC-BY-SA-4.0. The benchmark is described in *TopU-LBVS — A Realistic Multi
Target Benchmark for Ligand Based Virtual Screening* (Kumar, Zhou, Shiralkar, Huang and
Coskunuzer, arXiv:2609.29740, 24 September 2026), submitted to the NeurIPS 2026 Datasets and
Benchmarks track and under review at the time of writing. Cite the paper, and state the
revision of the dataset you scored against — this one is `281d456`.
