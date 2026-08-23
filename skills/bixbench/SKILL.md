---
name: bixbench
description: Find, fetch and explore BixBench, the bioinformatics agent benchmark built from published papers' real analysis notebooks. Enumerate its 205 questions and 59 data capsules by category, organism and source paper, pull a capsule, and read its data without touching the graded material. Covers the version split, the orphan capsules, and the canary the dataset ships.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, bioinformatics, agents, evaluation]
covers: [bixbench, benchmark, agent evaluation, bioinformatics, rna-seq, genomics, differential expression, whole genome sequencing, phylogenetics, transcriptomics, epigenomics, imaging, jupyter notebook, capsule, futurehouse, eval harness]
papers: [doi:10.48550/arXiv.2503.00096]
access: [open]
datasets: [https://huggingface.co/datasets/futurehouse/BixBench/resolve/main/BixBench.jsonl]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-22
  against: BixBench v1.5 (HF main, 205 rows / 64 capsule zips) / Python 3.12.8 / standard library only
  executed: 3
  unverified: 0
  unverified_reason: >-
    Three standalone blocks, all executed. The category tally and the orphan count are
    continuations that reuse `index` from the block above them and cannot run alone, so
    they are excluded from the denominator rather than counted either way.
---
# BixBench

A benchmark of open-ended bioinformatics tasks built from **published papers' actual analysis
notebooks**. An agent is given a capsule of real data and asked to reproduce a finding.

This skill gets you the benchmark and lets you look around it. It does not answer the
questions and does not grade anything.

## Before anything else: what you must not read

Every question row carries the fields that make it a benchmark — and reading them is how a
benchmark dies.

| in the index | |
|---|---|
| **safe** | `id` · `tag` · `version` · `capsule_uuid` · `short_id` · `question_id` · `categories` · `paper` · `data_folder` |
| **graded material — do not read** | `question` · `ideal` · `distractors` · `hypothesis` · `result` · `answer` · `eval_mode` |

Inside a capsule the usual split is by directory:

```
CapsuleData-<uuid>/         the real data — this is what you came for
CapsuleNotebook-<uuid>/     holds <uuid>_executed.ipynb — the worked solution. Do not open.
```

**That layout holds for 39 of the 64 published capsules, and a prefix test alone is not
enough.** Reading every zip's central directory on 2026-08-23:

| capsules | layout |
|---|---|
| 39 | `CapsuleData-` + `CapsuleNotebook-`, as above |
| 21 | `CapsuleData-` only — no notebook anywhere in the archive |
| **3** | both, **plus a second copy of the solution notebook inside `CapsuleData-`** |
| **1** | a third top-level prefix, `CapsuleFolder-<uuid>/`, wrapping both |

`2ed9023e-75d7-40fe-a425-b6b84ac8329c` carries
`CapsuleData-<uuid>/CapsuleNotebook-<uuid>_postprocessed_executed.ipynb` — so
`startswith("CapsuleData-")` extracts a worked solution. `8690e7cb-7405-4d2a-9721-e85824d05822`
nests everything one level deeper, so the same test matches nothing and a naive extractor writes
an empty directory and reports success.

**All four are orphans** — none is referenced by the index — so a reader who selects a capsule
from the index, as the code below does, never meets them. That is luck, not a guarantee. The
extractor therefore checks the layout rather than a prefix, and refuses anything it does not
recognise.

**There is also a `canary` field on every row.** It exists so that anyone can detect this
benchmark leaking into a training corpus. Do not print it, quote it, commit it, or paste it
into an issue. If you need to reference the policy, link the dataset card. A canary published
into a permanent history is unrecoverable and poisons the signal for every evaluator, not just
you.

## Licence, and the version that bites

**Apache-2.0**, ungated. That makes it the permissive member of its family — LAB-Bench and its
subsets are CC-BY-SA-4.0, which is a different conversation.

**Cite the version, not the name.** The paper describes 53 scenarios and 296 open-answer
questions. The dataset on `main` today is **v1.5: 205 questions over 59 capsules**, after the
maintainers re-reviewed items they judged underspecified for open-answer grading and flattened
the schema to one question per row. They say scores should shift upward as a result, so **a
v1.0 number and a v1.5 number are not comparable.** The original is preserved at tag `v1.0`.

Every row in the current file carries `version: "1.5"` — check it rather than assuming.

## What is actually in it

```python
import json, urllib.request

URL = "https://huggingface.co/datasets/futurehouse/BixBench/resolve/main/BixBench.jsonl"
SAFE = {"id", "tag", "version", "capsule_uuid", "short_id", "question_id",
        "categories", "paper", "data_folder"}

with urllib.request.urlopen(URL, timeout=120) as fh:
    rows = [json.loads(line) for line in fh.read().decode().splitlines() if line.strip()]

# Keep only the non-graded fields. Everything downstream works off this projection, so a
# stray print() cannot leak an answer.
index = [{k: r[k] for k in SAFE if k in r} for r in rows]

capsules = {r["capsule_uuid"] for r in index}
papers = {r["paper"] for r in index}
print(f"{len(index)} questions | {len(capsules)} capsules | {len(papers)} source papers")
print(f"versions present: {sorted({r['version'] for r in index})}")
print(f"questions per capsule: {len(index) / len(capsules):.1f} average")
```

Run 2026-08-22:

```
205 questions | 59 capsules | 19 source papers
versions present: ['1.5']
questions per capsule: 3.5 average
```

Nineteen papers across fifty-nine capsules — several capsules come from the same study, so
treating capsules as independent samples overstates your effective n.

## Finding the tasks that match what you work on

`categories` is a free-text list per row, which is what makes the benchmark browsable.
**Continues from the block above** — it reuses `index` rather than refetching.

```python
import collections

cats = collections.Counter()
for r in index:
    for c in str(r["categories"]).strip("[]").replace("'", "").split(","):
        if c.strip():
            cats[c.strip()] += 1

for name, n in cats.most_common(12):
    print(f"{n:4}  {name}")
```

```
  74  Genomics
  69  RNA-seq
  69  Transcriptomics
  67  Differential Expression Analysis
  48  Whole Genome Sequencing (WGS)
  47  Phylogenetics and Evolutionary Analysis
  30  Sequence Analysis
  25  Other
  21  Imaging
  16  Genomic Variant Analysis
  12  Epigenomics
  10  Functional Genomics
```

Categories overlap heavily — the counts sum well past 205 because most rows carry several. RNA-seq
and differential expression dominate; if your interest is imaging or epigenomics you are looking at
roughly one row in ten.

## The count that does not add up, and why it matters

The repository publishes **64** capsule zips. The index references **59**. The five extras are
real files that no question points at — **continuing from the first block**, which supplies
`index`:

```python
import json, urllib.request

api = json.load(urllib.request.urlopen(
    "https://huggingface.co/api/datasets/futurehouse/BixBench", timeout=90))
published = {s["rfilename"].removeprefix("CapsuleFolder-").removesuffix(".zip")
             for s in api["siblings"] if s["rfilename"].endswith(".zip")}
referenced = {r["capsule_uuid"] for r in index}

print(f"published {len(published)} | referenced {len(referenced)} | "
      f"orphans {len(published - referenced)} | missing {len(referenced - published)}")
for u in sorted(published - referenced):
    print(f"  orphan: CapsuleFolder-{u}.zip")
```

```
published 64 | referenced 59 | orphans 5 | missing 0
  orphan: CapsuleFolder-2ed9023e-75d7-40fe-a425-b6b84ac8329c.zip
  orphan: CapsuleFolder-8690e7cb-7405-4d2a-9721-e85824d05822.zip
  orphan: CapsuleFolder-a45810bb-beee-466a-b31f-ba60268afa53.zip
  orphan: CapsuleFolder-d36654ed-2cd6-41c1-84f9-1a3a16be3de5.zip
  orphan: CapsuleFolder-d49cde68-cc3a-479d-88cb-11302207ac3c.zip
```

**Count the index, not the directory.** A reader who lists zips concludes there are 64 tasks and
is wrong by five.

The `v1.0` tag settles why, so this needs no hedging: at v1.0 the dataset referenced 53 capsules
across 296 questions with **zero** orphans, and the set of capsules referenced at v1.0 but not at
v1.5 is **exactly** these five. Eleven zips were added and none removed, so the re-review dropped
their questions and left the data published. Four of the five are also the malformed capsules
described above — which is the likeliest reason they were dropped.

`missing 0` is the reassuring half: every referenced capsule does have a zip, so nothing in the
index is a dead link.

## Get the files

`data_folder` on each row is the zip's filename, so a capsule needs no URL construction.

```python
import io, json, os, urllib.request, zipfile

OUT = "Data/bixbench"
BASE = "https://huggingface.co/datasets/futurehouse/BixBench/resolve/main"
UUID = "33b801bb-9b47-4a0a-9314-05325c82fde7"
os.makedirs(OUT, exist_ok=True)

# Standalone: fetch and project the index here rather than inheriting it, so this block runs
# on its own. It is the one a reader is most likely to copy in isolation.
SAFE = {"id", "tag", "version", "capsule_uuid", "short_id", "question_id",
        "categories", "paper", "data_folder"}
with urllib.request.urlopen(f"{BASE}/BixBench.jsonl", timeout=120) as fh:
    index = [{k: r[k] for k in SAFE if k in r}
             for r in (json.loads(l) for l in fh.read().decode().splitlines() if l.strip())]

row = next(r for r in index if r["capsule_uuid"] == UUID)
name = row["data_folder"]                       # already 'CapsuleFolder-<uuid>.zip'

raw = urllib.request.urlopen(f"{BASE}/{name}", timeout=600).read()
zf = zipfile.ZipFile(io.BytesIO(raw))
names = zf.namelist()

# The safety boundary. A prefix test is NOT sufficient: three capsules hide a second copy of
# the solution inside CapsuleData-, and one nests everything under a third prefix. So verify
# the layout, then exclude notebooks wherever they sit.
tops = {n.split("/")[0] for n in names if "/" in n}
expected = {f"CapsuleData-{UUID}", f"CapsuleNotebook-{UUID}"}
if not tops <= expected:
    raise SystemExit(f"unrecognised capsule layout {sorted(tops)} — inspect before extracting")

data_prefix = f"CapsuleData-{UUID}/"
kept, withheld = [], []
for entry in names:
    if entry.endswith("/"):
        continue                                        # directory entry, not a file
    is_data = entry.startswith(data_prefix) and not entry.endswith(".ipynb")
    (kept if is_data else withheld).append(entry)
    if is_data:
        zf.extract(entry, OUT)

assert not any(".ipynb" in k or "_executed" in k for k in kept), f"solution leaked: {kept}"
assert kept, "extracted nothing — check the layout before trusting this"

print(f"{name}  {len(raw) / 1e6:.1f} MB")
print(f"  extracted {len(kept)} data file(s)")
print(f"  left in the archive: {[os.path.basename(w) for w in withheld]}")
for entry in sorted(kept):
    print(f"    {os.path.basename(entry)[:44]:46} {zf.getinfo(entry).file_size / 1e3:9.1f} KB")

manifest = {"capsule": row["capsule_uuid"], "paper": row["paper"],
            "categories": row["categories"], "extracted": len(kept), "withheld": len(withheld)}
with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=2)
```

Run 2026-08-22 — sizes move if the maintainers repackage, the withheld list is the part that
should hold:

```
CapsuleFolder-33b801bb-9b47-4a0a-9314-05325c82fde7.zip  5.4 MB
  extracted 4 data file(s)
  left in the archive: ['CapsuleNotebook-33b801bb-9b47-4a0a-9314-05325c82fde7_executed.ipynb']
    HGNC_05-09-19.txt                                 5202.8 KB
    Issy_ASXL1_blood_coldata_gender.xlsx                10.0 KB
    Issy_ASXL1_blood_featureCounts_GeneTable_fin     13866.6 KB
    gencode.v31.primary_assembly.genes.csv           11271.9 KB
```

A capsule is real working data — a gene-symbol table, a sample sheet with sex covariates, a featureCounts gene table
and a GENCODE gene list. That is the point of the benchmark: the agent does bioinformatics, not
trivia.

**Budget from the distribution, not from this example.** Measured across all 64 on 2026-08-23:
min 9 KB, **median 10.2 MB, max 481.3 MB**, 23 capsules over 100 MB, 5.91 GB for the set. The
one above is 5.4 MB and unpacks to ~30 MB — near the small end. The largest referenced capsule
is roughly 1 GB uncompressed, and the block above holds the whole archive in memory before
extracting, so stream it to disk instead for anything of that size. Pull the ones you need.

## What this skill will not do

It stops at the data. It does not answer questions, does not run the grader, and does not stand
up the evaluation environment — that is `futurehouse/bixbench:aviary-notebook-env` and the
harness in the upstream repository.

That boundary is deliberate. Fetching and browsing a benchmark is safe and useful; wiring an
agent to its answers is how a benchmark stops measuring anything.

## Try it

**Data.** BixBench v1.5 (`futurehouse/BixBench` on Hugging Face), Apache-2.0, ungated. Last
confirmed reachable 2026-08-22.

**Run.**

```python
import collections, json, urllib.request

URL = "https://huggingface.co/datasets/futurehouse/BixBench/resolve/main/BixBench.jsonl"
SAFE = {"id", "tag", "version", "capsule_uuid", "short_id", "question_id",
        "categories", "paper", "data_folder"}
GRADED = {"question", "ideal", "distractors", "hypothesis", "result", "answer", "eval_mode"}

with urllib.request.urlopen(URL, timeout=120) as fh:
    rows = [json.loads(l) for l in fh.read().decode().splitlines() if l.strip()]

# The graded fields are present and are deliberately not carried forward.
assert all(GRADED <= set(r) for r in rows), "a row is missing graded fields — recheck the split"
assert "canary" in rows[0], "canary field gone — check the dataset card before proceeding"
index = [{k: r[k] for k in SAFE if k in r} for r in rows]
# SAFE and GRADED are disjoint literals, so asserting that here proves nothing. What is worth
# checking is that no key exists upstream that neither list knows about — a new field would
# otherwise be silently unclassified.
unknown = set().union(*(set(r) for r in rows)) - SAFE - GRADED - {"canary"}
assert not unknown, f"unclassified field(s) upstream: {sorted(unknown)} — classify before use"

caps = {r["capsule_uuid"] for r in index}
api = json.load(urllib.request.urlopen(
    "https://huggingface.co/api/datasets/futurehouse/BixBench", timeout=90))
zips = {s["rfilename"].removeprefix("CapsuleFolder-").removesuffix(".zip")
        for s in api["siblings"] if s["rfilename"].endswith(".zip")}

print(f"questions / capsules / papers : {len(index)} / {len(caps)} / {len({r['paper'] for r in index})}")
print(f"versions                      : {sorted({r['version'] for r in index})}")
print(f"zips / referenced / orphaned  : {len(zips)} / {len(caps)} / {len(zips - caps)}")
assert not (caps - zips), f"referenced capsule with no zip: {caps - zips}"
assert all(r["capsule_uuid"] in r["data_folder"] for r in index), "data_folder no longer names the capsule"

top = collections.Counter()
for r in index:
    for c in str(r["categories"]).strip("[]").replace("'", "").split(","):
        if c.strip():
            top[c.strip()] += 1
print(f"top category                  : {top.most_common(1)[0][0]} ({top.most_common(1)[0][1]})")
print(f"categories per row (mean)     : {sum(top.values()) / len(index):.1f}")
print("all assertions passed")
```

**Expect.**

Invariants — these hold whatever the maintainers republish, and a failure means this page is
wrong:

- The graded fields are **present on every row**, and **no upstream key is unclassified**. The
  projection is an allowlist, so a field added upstream is excluded by default — it fails in the
  safe direction, and the second assertion is what tells you it happened.
- A `canary` field exists. Its value is never printed.
- **Every referenced capsule has a zip** (`caps - zips` is empty). The reverse is not an
  invariant — orphan zips exist by design of the re-review.
- `data_folder` contains its row's `capsule_uuid`, so a capsule URL never needs constructing.
- Categories are multi-valued, so their counts sum above the row count.

Observed 2026-08-22 against **v1.5** — these move when the dataset is revised, so treat a
mismatch as drift to investigate rather than a failure:

```
questions / capsules / papers : 205 / 59 / 19
versions                      : ['1.5']
zips / referenced / orphaned  : 64 / 59 / 5
top category                  : Genomics (74)
categories per row (mean)     : 2.5
all assertions passed
```

## Sources

- BixBench — Mitchener et al., *BixBench: a comprehensive benchmark for LLM-based agents in
  computational biology*, arXiv [2503.00096](https://arxiv.org/abs/2503.00096) (2025). The
  paper describes v1.0; the dataset on `main` is v1.5.
- Dataset — [`futurehouse/BixBench`](https://huggingface.co/datasets/futurehouse/BixBench),
  Apache-2.0. Read the card for the canary policy rather than copying the value.
- Harness and environment — [`Future-House/BixBench`](https://github.com/Future-House/BixBench),
  Apache-2.0.

Capsules derive from published papers' notebooks and data. Apache-2.0 covers the benchmark's own
contribution; the underlying data carries whatever terms its source publication set. Fetch from
upstream, and check the source paper before redistributing anything you pull out of a capsule.
