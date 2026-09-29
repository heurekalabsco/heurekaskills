---
name: pubchef
description: Look up what a compound has been reported to do — PubCheF pairs PubChem compounds with 5,215 function labels mined from the PubMed literature, plus a 10,311-compound benchmark and ZINC20-wide predictions. Match by CID, SMILES or InChIKey.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [pubchef, chemical-function, literature-mining, pubchem, cheminformatics]
covers: [pubchef, chemical function, compound function, drug repurposing, mechanism of action, bioactivity, pubmed, literature mining, text mining, pubchem, cid, smiles, inchikey, zinc20, chembl, open targets, small molecule, cheminformatics, anticancer, antibiotic, antiviral, antifungal, antimalarial, cytotoxic, anti-inflammatory, neuroprotective, function labels, benchmark, virtual screening, ligand]
papers: [doi:10.64898/2026.08.09.743788, PMID:38873033, PMID:38106612]
access: [open]
platform: huggingface
datasets: [https://huggingface.co/datasets/kosonocky/PubCheF/resolve/main/labels.txt, https://huggingface.co/datasets/kosonocky/PubCheF-Benchmark/resolve/main/pubchef-test-fpbal-0.5.csv, https://huggingface.co/datasets/kosonocky/PubCheF-Benchmark/resolve/main/opentargets-20240626.csv, https://huggingface.co/datasets/kosonocky/PubCheF/resolve/main/cid_smiles_pmid_func_propagated_cutoff_1_hard.csv, https://huggingface.co/datasets/kosonocky/PubCheF-1-ZINC20-Predictions/resolve/main/zinc20_instock_20240430.tar.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-09-29
  against: PubCheF / PubCheF-Benchmark / PubCheF-1-ZINC20-Predictions as of the 2026-08-17 revisions — Python 3.13, rdkit 2026.03.6, huggingface_hub 2.0.0, pandas 3.0.6
  executed: 7
  unverified: 3
  unverified_reason: >-
    The three unexecuted blocks all pull Git-LFS objects, which Hugging Face serves by
    redirecting to its Xet CDN (*.cdn.hf.co) — the validating environment has no route to
    that host, so the 172 MB PubCheF table and the 9.5 GB ZINC20 prediction archive could
    not be downloaded here. Every non-LFS file in the same repositories was fetched and
    parsed. Re-run from a host with general outbound HTTPS to confirm the two full-release
    blocks and the PubChem PUG REST identifier lookup.
---
# PubCheF — what has this compound been reported to do?

Most chemical databases answer *what a compound is* — structure, formula, vendors, assay
readouts. PubCheF answers a different question, and one the rest of this registry has no
route to: **what the literature says the compound does**. It pairs PubChem compounds with
short function labels (`Anticancer`, `Antimalarial`, `Apoptosis Inducer`, `Oxytocic`) mined
from PubMed, so a compound arriving from a screen or a synthesis plan can be checked against
what has already been written about it.

Use it to triage a hit list, to find functional analogues of a compound whose mechanism you
know, or to see whether an activity you are about to claim is already reported. It is
**literature co-occurrence, not measurement** — see "What the labels are not" before you
treat a label as evidence.

Released with Kosonocky et al., *Learning from human and chemical languages to predict
biological function*, bioRxiv 2026 (`doi:10.64898/2026.08.09.743788`).

## What you need before you start

Nothing to obtain. All three datasets are public, ungated, and CC-BY-4.0 on Hugging Face —
no account, no token, no licence to accept. The only cost is disk and bandwidth, and it is
uneven, so choose deliberately:

| Repository | File | Size | What it is |
|---|---|---|---|
| `kosonocky/PubCheF` | `labels.txt` | 128 KB | the function vocabulary with occurrence counts |
| `kosonocky/PubCheF` | `cid_smiles_pmid_func_propagated_cutoff_1_hard.csv` | 172.7 MB | the main table, label propagation applied |
| `kosonocky/PubCheF` | `cid_smiles_pmid_func_pre_prop.csv` | 169.7 MB | the same table before propagation |
| `kosonocky/PubCheF-Benchmark` | `pubchef-test-fpbal-0.5.csv` | 980 KB | held-out evaluation set, function labels |
| `kosonocky/PubCheF-Benchmark` | `opentargets-20240626.csv` | 1.5 MB | Open Targets indications, a *different* vocabulary |
| `kosonocky/PubCheF-1-ZINC20-Predictions` | `zinc20_instock_20240430.tar.gz` | 9.5 GB | predicted labels across ZINC20 in-stock |

Start with `labels.txt` and the benchmark — together they are under 3 MB and answer most
"is this resource useful to me" questions. Pull the 172 MB table only when you need
coverage beyond the held-out set, and the 9.5 GB archive only for screening-scale work.

```bash
pip install huggingface_hub pandas rdkit
```

## Get the files

`huggingface_hub` resolves and caches; re-running is free after the first fetch.

```python
from huggingface_hub import hf_hub_download

labels_path = hf_hub_download(
    repo_id="kosonocky/PubCheF", filename="labels.txt", repo_type="dataset")
bench_path = hf_hub_download(
    repo_id="kosonocky/PubCheF-Benchmark",
    filename="pubchef-test-fpbal-0.5.csv", repo_type="dataset")
ot_path = hf_hub_download(
    repo_id="kosonocky/PubCheF-Benchmark",
    filename="opentargets-20240626.csv", repo_type="dataset")

print(labels_path)
print(bench_path)
print(ot_path)
```

`huggingface_hub` prints a notice about unauthenticated requests on every call. It is a
rate-limit hint, not a requirement — these repositories are ungated and the downloads above
complete without a token. Set `HF_TOKEN` only if you are pulling the large files repeatedly
and want the faster path.

The full table is the same call with a bigger file. Give it room — 172 MB down, and roughly
1 GB resident once pandas has it as Python strings.

```python
from huggingface_hub import hf_hub_download
import pandas as pd

full_path = hf_hub_download(
    repo_id="kosonocky/PubCheF",
    filename="cid_smiles_pmid_func_propagated_cutoff_1_hard.csv",
    repo_type="dataset")

full = pd.read_csv(full_path)
print(full.columns.tolist())      # ['cid', 'smiles', 'pmids', 'labels']
print(full.dtypes)
print(full.head(3))
```

Four columns, per the dataset's own Croissant record — `cid` (Int64), `smiles`, `pmids`,
`labels`. **Print `head()` before you write any parsing code.** The per-cell encoding of
`pmids` and `labels` is not documented in the dataset card and was not observed here (see
`verified.unverified_reason`), so read it off the file rather than assuming it matches the
benchmark's Python-literal convention below.

`cid_smiles_pmid_func_pre_prop.csv` is the same shape without label propagation applied.
Take the `pre_prop` file when you want only labels asserted directly against a compound;
take the `propagated_cutoff_1_hard` file for the version the paper evaluates.

The ZINC20 prediction archive is a single 9.5 GB tarball. Stream it rather than loading it.

```bash
python -c "
from huggingface_hub import hf_hub_download
p = hf_hub_download(repo_id='kosonocky/PubCheF-1-ZINC20-Predictions',
                    filename='zinc20_instock_20240430.tar.gz',
                    repo_type='dataset')
print(p)
"
tar -tzf "$(ls ~/.cache/huggingface/hub/datasets--kosonocky--PubCheF-1-ZINC20-Predictions/snapshots/*/zinc20_instock_20240430.tar.gz)" | head -20
```

## The function vocabulary

`labels.txt` is one label per line as `Label: count`, sorted by count descending. It is the
cheapest way to find out whether PubCheF knows about the activity you care about, and the
count tells you how much literature sits behind the label.

```python
def load_vocabulary(path):
    vocab = {}
    with open(path) as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue
            label, _, count = line.rpartition(": ")
            vocab[label] = int(count)
    return vocab

vocab = load_vocabulary(labels_path)
print("labels          :", len(vocab))
print("count range     :", min(vocab.values()), "-", max(vocab.values()))
print("top 5           :", list(vocab)[:5])

hits = [(l, c) for l, c in vocab.items() if "kinase inhibitor" in l.lower()]
print("kinase inhibitor labels:", len(hits))
for label, count in sorted(hits, key=lambda t: -t[1])[:5]:
    print(f"  {label:<45} {count}")
```

The vocabulary is floored — the least-supported labels in the release sit at exactly 50
occurrences, so a label that never cleared that bar is simply absent. **A compound with no
labels is not a compound with no reported function**; it is a compound whose reported
functions did not clear the release's cutoff, or that PubMed does not discuss by a name the
pipeline matched.

## Matching a compound — use InChIKey, not the SMILES string

The tables key on PubChem CID and carry a `smiles` column. If you already have a CID, index
on it and stop reading. If you have a structure, the tempting move is to match your SMILES
against the `smiles` column as a string, and it *almost* works — which is the problem.

In the 10,311-row benchmark, 10,288 SMILES round-trip unchanged through RDKit 2026.03.6 and
**23 do not**. They are the same molecules written with the equivalent opposite double-bond
stereo descriptors, plus one aromatic-carbon radical case. A string join drops those 23
silently and reports a clean run. Canonicalising both sides through InChIKey does not:

```python
import csv, ast
from rdkit import Chem
from rdkit import RDLogger
RDLogger.DisableLog("rdApp.*")

rows = list(csv.DictReader(open(bench_path)))

index, unparseable = {}, 0
for row in rows:
    mol = Chem.MolFromSmiles(row["smiles"])
    if mol is None:
        unparseable += 1
        continue
    index.setdefault(Chem.MolToInchiKey(mol), []).append(row)

print("rows            :", len(rows))
print("unparseable     :", unparseable)
print("distinct keys   :", len(index))
print("colliding keys  :", sum(1 for v in index.values() if len(v) > 1))

def lookup(smiles):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"RDKit could not parse {smiles!r}")
    return index.get(Chem.MolToInchiKey(mol), [])

for hit in lookup("CCOC(=O)c1cc(=O)c2cc(CSC(=S)N(C)c3ccccc3)ccc2o1"):
    print("CID", hit["id"], "->", sorted(ast.literal_eval(hit["ground_truth"])))
```

InChIKey is one-to-one across the benchmark — 10,311 rows, 10,311 distinct keys, no
collisions — so the index is a plain dict lookup rather than a disambiguation problem.

Measuring the gap the string match leaves, on the same file:

```python
raw = {row["smiles"] for row in rows}
missed = [row for row in rows if Chem.MolToSmiles(Chem.MolFromSmiles(row["smiles"])) not in raw]
print("rows a canonical-SMILES string join would miss:", len(missed))
for row in missed[:3]:
    print("  CID", row["id"])
    print("    in file :", row["smiles"][:78])
    print("    rdkit   :", Chem.MolToSmiles(Chem.MolFromSmiles(row["smiles"]))[:78])
```

**If you only have an InChIKey or a name**, resolve it to a CID at PubChem first and index
on `cid`; PubChem's PUG REST takes an InChIKey directly. This block reaches a host the
validating environment could not, so treat it as documented rather than confirmed:

```bash
curl -s "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/BSYNRYMUTXBXSQ-UHFFFAOYSA-N/cids/TXT"
```

## The two benchmark files are not one table

`PubCheF-Benchmark` ships two CSVs with **identical column names** — `id`, `smiles`,
`ground_truth` — and they are not the same kind of thing. Concatenating them is the mistake
this section exists to prevent. Every difference below was measured on the 2026-08-17
revision:

| | `pubchef-test-fpbal-0.5.csv` | `opentargets-20240626.csv` |
|---|---|---|
| rows | 10,311 | 6,677 |
| `id` namespace | PubChem CID (integer) | ChEMBL id (`CHEMBL…`) |
| `ground_truth` literal | Python `set` — `{'Antitumor'}` | Python `list` — `['lymphoma']` |
| distinct labels | 3,191 | 2,177 |
| vocabulary | PubCheF function labels | Open Targets disease indications |
| overlap with the other file's labels | — | none |

Two consequences. `ast.literal_eval` hands you a `set` from one file and a `list` from the
other, so anything downstream that assumes order or assumes uniqueness will be wrong on one
of them. And the label spaces are **disjoint** — scoring function predictions against the
Open Targets file measures nothing, because no PubCheF label appears in it.

```python
import ast, collections

def read_ground_truth(path):
    out = []
    for row in csv.DictReader(open(path)):
        out.append((row["id"], ast.literal_eval(row["ground_truth"])))
    return out

bench_gt = read_ground_truth(bench_path)
ot_gt = read_ground_truth(ot_path)

bench_types = collections.Counter(type(v).__name__ for _, v in bench_gt)
ot_types = collections.Counter(type(v).__name__ for _, v in ot_gt)
bench_labels = {l for _, v in bench_gt for l in v}
ot_labels = {l for _, v in ot_gt for l in v}

print("benchmark rows / literal :", len(bench_gt), dict(bench_types))
print("opentargets rows / literal:", len(ot_gt), dict(ot_types))
print("label overlap             :", len(bench_labels & ot_labels))
print("benchmark labels in vocab :",
      f"{len(bench_labels & set(vocab))}/{len(bench_labels)}")
```

The benchmark's labels are a strict subset of `labels.txt`, which is the useful invariant:
anything the benchmark asks a model to predict is a label the vocabulary defines, so you can
build the label index from `labels.txt` alone and never meet an unknown class at scoring time.

The Open Targets file is there as a *comparison* set — clinically grounded indications for a
partly overlapping set of molecules — and only 27 structures are shared between the two
files, so it is a separate evaluation, not extra rows.

## What the labels are not

Read this before a label reaches a slide.

- **Co-occurrence, not assay.** A label says a compound and a function were written about
  together in PubMed and the pipeline linked them. It is not a measurement, not a dose, not
  a confirmed mechanism, and it carries no potency.
- **Literature bias is inherited.** `Anticancer` and `Cytotoxic` lead the vocabulary by a
  wide margin. That is what gets published, not what compounds mostly do. A rare label with
  50 occurrences and a common one with 85,021 are not comparable evidence.
- **Propagation is a modelling choice.** The main release ships in two variants, and the
  propagated one asserts labels the source text did not state directly for that compound.
  When provenance matters, work from `cid_smiles_pmid_func_pre_prop.csv` and say which
  variant you used.
- **The ZINC20 set is predicted.** Those labels come out of a model, not out of PubMed.
  Never merge them into the mined table without a column recording which is which.
- **Absence is not evidence.** Below-cutoff labels and compounds PubMed does not discuss look
  identical from here — both are simply missing.

Cite the release when you use it. CC-BY-4.0 asks for attribution, and the DOI is in the
frontmatter.

## Try it

A self-contained check that this skill still works. Public data, CC-BY-4.0, no account and
no key.

**Data** — the two benchmark CSVs and the label vocabulary, all fetched over plain HTTPS:

    https://huggingface.co/datasets/kosonocky/PubCheF/resolve/main/labels.txt
    https://huggingface.co/datasets/kosonocky/PubCheF-Benchmark/resolve/main/pubchef-test-fpbal-0.5.csv
    https://huggingface.co/datasets/kosonocky/PubCheF-Benchmark/resolve/main/opentargets-20240626.csv

Under 3 MB in total, and none of the three is a Git-LFS object, so they download without
the Xet CDN hop the 172 MB table needs. Last confirmed reachable 2026-09-29.

The example routes through the trap: it looks a compound up by **InChIKey**, then measures
how many rows a plain SMILES string join would have dropped, and asserts that the two
benchmark files parse to different container types.

```python
import ast, csv, io, urllib.request
from rdkit import Chem
from rdkit import RDLogger
RDLogger.DisableLog("rdApp.*")

BASE = "https://huggingface.co/datasets/kosonocky"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pubchef-skill/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read().decode()

vocab = {}
for line in fetch(f"{BASE}/PubCheF/resolve/main/labels.txt").splitlines():
    if line.strip():
        label, _, count = line.rpartition(": ")
        vocab[label] = int(count)

bench = list(csv.DictReader(io.StringIO(
    fetch(f"{BASE}/PubCheF-Benchmark/resolve/main/pubchef-test-fpbal-0.5.csv"))))
ot = list(csv.DictReader(io.StringIO(
    fetch(f"{BASE}/PubCheF-Benchmark/resolve/main/opentargets-20240626.csv"))))

index, canonical = {}, set()
for row in bench:
    mol = Chem.MolFromSmiles(row["smiles"])
    assert mol is not None, row["id"]
    index.setdefault(Chem.MolToInchiKey(mol), []).append(row)
    canonical.add(Chem.MolToSmiles(mol))

raw = {row["smiles"] for row in bench}
missed = len(canonical - raw)

hit, = index[Chem.MolToInchiKey(Chem.MolFromSmiles(
    "CCOC(=O)c1cc(=O)c2cc(CSC(=S)N(C)c3ccccc3)ccc2o1"))]
labels = ast.literal_eval(hit["ground_truth"])

bench_labels = {l for r in bench for l in ast.literal_eval(r["ground_truth"])}
ot_labels = {l for r in ot for l in ast.literal_eval(r["ground_truth"])}

print("vocabulary        :", len(vocab), "labels,",
      min(vocab.values()), "-", max(vocab.values()), "occurrences")
print("benchmark rows    :", len(bench), "| distinct InChIKeys:", len(index))
print("string-join misses:", missed)
print("CID 44226566      :", hit["id"], type(labels).__name__, sorted(labels))
print("opentargets rows  :", len(ot),
      "| literal:", type(ast.literal_eval(ot[0]["ground_truth"])).__name__)
print("label overlap     :", len(bench_labels & ot_labels))

# --- invariants: true of any PubCheF release ---
assert all(isinstance(ast.literal_eval(r["ground_truth"]), set) for r in bench[:500])
assert all(isinstance(ast.literal_eval(r["ground_truth"]), list) for r in ot[:500])
assert bench_labels <= set(vocab), "benchmark asks for a label the vocabulary does not define"
assert not (bench_labels & ot_labels), "the two ground-truth vocabularies have converged"
assert len(index) == len(bench), "InChIKey is no longer one-to-one on the benchmark"
assert min(vocab.values()) >= 50, "the vocabulary cutoff moved"
assert all(r["id"].isdigit() for r in bench)
assert all(r["id"].startswith("CHEMBL") for r in ot)

# --- observed 2026-09-29, rdkit 2026.03.6: drift here is a version bump, not a bug ---
assert len(vocab) == 5215, f"vocabulary is now {len(vocab)} labels"
assert (len(bench), len(ot)) == (10311, 6677)
assert (len(bench_labels), len(ot_labels)) == (3191, 2177)
assert missed == 23, f"{missed} rows are non-canonical under this RDKit, was 23"
assert labels == {"Antitumor"}
print("\nOK")
```

**Expect** — exactly this, on the 2026-08-17 dataset revisions:

```
vocabulary        : 5215 labels, 50 - 85021 occurrences
benchmark rows    : 10311 | distinct InChIKeys: 10311
string-join misses: 23
CID 44226566      : 44226566 set ['Antitumor']
opentargets rows  : 6677 | literal: list
label overlap     : 0

OK
```

The assertions are split deliberately. The **invariants** — set versus list, benchmark
labels contained in the vocabulary, the two vocabularies disjoint, InChIKey one-to-one, the
50-occurrence floor, the two id namespaces — must hold in any release; a failure there means
this skill is wrong. The **observed values** — 5,215 labels, 10,311 and 6,677 rows, 23
non-canonical SMILES — are dated and RDKit-version-stamped. `missed` in particular moves
when RDKit changes its canonical form, so a different number there is drift to record, not a
break.
