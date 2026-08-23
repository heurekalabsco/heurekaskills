---
name: bixbench
description: Access BixBench, a dataset of 205 open-ended bioinformatics questions paired with 64 data capsules taken from published papers' analysis notebooks. Load the index, browse questions by category and source paper, and pull a capsule's real data onto disk. A benchmark by origin, and a browsable corpus of worked analysis cases in its own right.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.1.0
tags: [benchmark, bioinformatics, agents, evaluation]
covers: [bixbench, benchmark, agent evaluation, bioinformatics, rna-seq, genomics, differential expression, whole genome sequencing, phylogenetics, transcriptomics, epigenomics, imaging, jupyter notebook, capsule, futurehouse, analysis cases]
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
    Three standalone blocks, all executed. The category tally, the question listing and the
    orphan count are continuations that reuse `rows` from the block above them and cannot run
    alone, so they are excluded from the denominator rather than counted either way.
---
# BixBench

**205 open-ended bioinformatics questions, each attached to a capsule of the real data needed to
answer it**, drawn from published papers' own analysis notebooks.

It was built to evaluate agents, and that origin shapes it — but as a corpus it is more generally
useful than that: a few dozen real analyses, with their inputs, their questions, and the notebook
the authors actually ran. This skill gets you all of it.

## Licence, and the version that bites

**Apache-2.0**, ungated. That makes it the permissive member of its family — LAB-Bench and its
subsets are CC-BY-SA-4.0, which is a different conversation.

**Cite the version, not the name.** The paper describes 53 scenarios and 296 open-answer
questions. The dataset on `main` today is **v1.5: 205 questions over 59 capsules**, after the
maintainers re-reviewed items they judged underspecified for open-answer grading and flattened
the schema to one question per row. They say scores should shift upward as a result, so **a
v1.0 number and a v1.5 number are not comparable.** The original is preserved at tag `v1.0`.

Every row in the current file carries `version: "1.5"` — check it rather than assuming.

## The index

One JSONL file, one row per question.

```python
import json, urllib.request

BASE = "https://huggingface.co/datasets/futurehouse/BixBench/resolve/main"

with urllib.request.urlopen(f"{BASE}/BixBench.jsonl", timeout=120) as fh:
    rows = [json.loads(line) for line in fh.read().decode().splitlines() if line.strip()]

print(f"{len(rows)} questions | {len({r['capsule_uuid'] for r in rows})} capsules "
      f"| {len({r['paper'] for r in rows})} source papers")
print(f"versions present: {sorted({r['version'] for r in rows})}")
print(f"fields per row  : {len(rows[0])}")
```

Run 2026-08-23:

```
205 questions | 59 capsules | 19 source papers
versions present: ['1.5']
fields per row  : 17
```

What the fields carry:

| field | |
|---|---|
| `question` · `ideal` · `distractors` | the question, the reference answer, and the wrong options for multiple-choice mode |
| `hypothesis` · `result` · `answer` | what the original analysis tested, what it found, and the graded answer |
| `eval_mode` | how the item is meant to be scored |
| `capsule_uuid` · `data_folder` | which capsule holds the data, and its zip filename |
| `categories` · `paper` | comma-joined topic labels, and the source publication |
| `id` · `tag` · `version` · `short_id` · `question_id` | identifiers |
| `canary` | see below |

Nineteen papers across fifty-nine capsules, so several capsules come from the same study —
treat them as independent samples and you overstate your effective n.

**One note on `canary`.** Every row carries a canary string: the convention that lets anyone
later test whether this dataset leaked into a model's training corpus. Reading it is fine, it
is part of the data. **Do not paste one somewhere it can be scraped** — a public repo, an issue,
a blog post — because that is the one action that destroys its only function, for everyone,
permanently.

## Browsing by topic

*Continues from the block above — reuses `rows`.*

```python
import collections

def categories_of(row):
    """`categories` ships in TWO representations — some rows are a plain comma-joined
    string, others a Python list repr like "['Genomics', 'RNA-seq']". Splitting on commas
    without normalising yields labels such as "['Whole Genome Sequencing (WGS)'" and counts
    Genomics under two different keys, which silently halves it."""
    raw = str(row["categories"]).strip()
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw[1:-1]
    return [c.strip().strip("'\"") for c in raw.split(",") if c.strip().strip("'\"")]

cats = collections.Counter(c for r in rows for c in categories_of(r))
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

Categories overlap — counts sum past 205 because most rows carry several, 2.5 on average across
20 distinct labels. RNA-seq and differential expression dominate; imaging or epigenomics is
roughly one row in ten.

**Normalise before counting.** The column holds two representations — most rows are a plain
comma-joined string, some are a Python list repr. A naive `split(",")` yields labels like
`['Whole Genome Sequencing (WGS)'` and files Genomics under two keys, dropping it from 74 to 47
and changing which category looks largest. `## Try it` asserts against exactly that.

## Reading the questions

Counting topics tells you what is in here; this gets you the items themselves. *Continues from
the first two blocks — reuses `rows` and `categories_of`.*

```python
WANT = "Genomics"
hits = [r for r in rows if WANT in categories_of(r)]
print(f"{len(hits)} questions tagged {WANT}, drawn from "
      f"{len({r['capsule_uuid'] for r in hits})} capsules\n")

for r in hits[:3]:
    # `paper` is the literal string "Not Available" on a third of the rows -- see below
    src = r["paper"] if str(r["paper"]).strip() != "Not Available" else "source not recorded"
    print(f"[{r['short_id']}]  {src}")
    print(f"  capsule {r['capsule_uuid']}  ({r['eval_mode']})")
    print(f"  Q       {' '.join(str(r['question']).split())[:160]}")
    print(f"  ideal   {' '.join(str(r['ideal']).split())[:110]}")
    n = len(r['distractors']) if isinstance(r['distractors'], list) else 'n/a'
    print(f"  wrong   {n} distractors\n")
```

```
74 questions tagged Genomics, drawn from 28 capsules

[bix-11]  source not recorded
  capsule cd811ead-7887-4369-b175-05aff4223765  (llm_verifier)
  Q       What is the difference between median treeness values for fungi versus animals?
  ideal   0.05
  wrong   3 distractors

[bix-11]  source not recorded
  capsule cd811ead-7887-4369-b175-05aff4223765  (llm_verifier)
  Q       What percentage of fungal genes have treeness values above 0.06?
  ideal   35%
  wrong   3 distractors

[bix-11]  source not recorded
  capsule cd811ead-7887-4369-b175-05aff4223765  (llm_verifier)
  Q       What is the maximum treeness value among animal genes?
  ideal   0.1126
  wrong   3 distractors
```

Everything stays in memory. The index is a few hundred KB, so there is no reason to stage it on
disk — only capsules are downloaded, and only when you want the data an item was written
against.

A row carries the question, the reference answer in `ideal`, and exactly three wrong options in
`distractors` — all 205 rows, no exceptions — so the corpus reads as a set of worked analysis
problems with their answers attached. `question`, `ideal`, `distractors` and `eval_mode` are
populated on every row.

**`paper` is not.** It holds the literal string `Not Available` on **68 of 205 rows**, and the
137 that do carry a value resolve to just **17 distinct publications**. So a third of the corpus
does not name where it came from, and the rest is far more concentrated than the row count
suggests. Filter on it and you silently drop a third of the set; group by it and 17 buckets
absorb everything. Treat it as a hint, not a join key — `capsule_uuid` is the identifier that is
actually complete.

Reading an item also means it is no longer a blind test of anything, which matters only if you
later evaluate on the same items.

## The count that does not add up, and why it matters

The repository publishes **64** capsule zips. The index references **59**. The five extras are
real files that no question points at. *Continues from the first block.*

```python
import json, urllib.request

api = json.load(urllib.request.urlopen(
    "https://huggingface.co/api/datasets/futurehouse/BixBench", timeout=90))
published = {s["rfilename"].removeprefix("CapsuleFolder-").removesuffix(".zip")
             for s in api["siblings"] if s["rfilename"].endswith(".zip")}
referenced = {r["capsule_uuid"] for r in rows}

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

`data_folder` is the zip's filename, so a capsule needs no URL construction.

```python
import io, json, os, urllib.request, zipfile

OUT = "Data/bixbench"
BASE = "https://huggingface.co/datasets/futurehouse/BixBench/resolve/main"
UUID = "33b801bb-9b47-4a0a-9314-05325c82fde7"
os.makedirs(OUT, exist_ok=True)

# Standalone: fetch the index here rather than inheriting it.
with urllib.request.urlopen(f"{BASE}/BixBench.jsonl", timeout=120) as fh:
    rows = [json.loads(l) for l in fh.read().decode().splitlines() if l.strip()]

row = next(r for r in rows if r["capsule_uuid"] == UUID)
name = row["data_folder"]                       # already 'CapsuleFolder-<uuid>.zip'

raw = urllib.request.urlopen(f"{BASE}/{name}", timeout=600).read()
zf = zipfile.ZipFile(io.BytesIO(raw))
zf.extractall(OUT)

files = [n for n in zf.namelist() if not n.endswith("/")]
print(f"{name}  {len(raw) / 1e6:.1f} MB  ->  {len(files)} file(s)")
for n in sorted(files):
    print(f"  {n.split('/')[-1][:52]:54} {zf.getinfo(n).file_size / 1e3:9.1f} KB")

with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump({"capsule": UUID, "paper": row["paper"],
               "categories": row["categories"], "files": len(files)}, fh, indent=2)
```

Run 2026-08-23:

```
CapsuleFolder-33b801bb-9b47-4a0a-9314-05325c82fde7.zip  5.4 MB  ->  5 file(s)
  HGNC_05-09-19.txt                                         5202.8 KB
  Issy_ASXL1_blood_coldata_gender.xlsx                        10.0 KB
  Issy_ASXL1_blood_featureCounts_GeneTable_final.txt       13866.6 KB
  gencode.v31.primary_assembly.genes.csv                   11271.9 KB
  CapsuleNotebook-33b801bb-9b47-4a0a-9314-05325c82fde7        33.3 KB
```

A gene-symbol table, a sample sheet with sex covariates, a featureCounts gene table, a GENCODE
gene list — and the notebook the authors ran. Real working data, which is the point.

**The internal layout is not uniform**, so do not construct paths you expect to exist. Reading
every zip's central directory on 2026-08-23:

| capsules | layout |
|---|---|
| 39 | `CapsuleData-<uuid>/` + `CapsuleNotebook-<uuid>/` |
| 21 | `CapsuleData-<uuid>/` only — no notebook in the archive |
| 3 | both, plus a second copy of the notebook inside `CapsuleData-` |
| 1 | everything nested one level deeper under `CapsuleFolder-<uuid>/` |

Code assuming a fixed path breaks on about a third of the set. `extractall`, then walk what
landed. All four odd ones are orphans, so index-driven work never meets them.

**Budget from the distribution.** Measured across all 64: min 9 KB, **median 10.2 MB, max
481.3 MB**, 23 over 100 MB, **5.91 GB** for the set. The example above is near the small end.
The largest referenced capsule is ~1 GB uncompressed, and this block holds the whole archive in
memory before extracting — stream to disk for anything that size.

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

BASE = "https://huggingface.co/datasets/futurehouse/BixBench/resolve/main"
with urllib.request.urlopen(f"{BASE}/BixBench.jsonl", timeout=120) as fh:
    rows = [json.loads(l) for l in fh.read().decode().splitlines() if l.strip()]

FIELDS = {"id", "tag", "version", "question", "ideal", "distractors", "canary", "capsule_uuid",
          "short_id", "question_id", "hypothesis", "result", "answer", "categories", "paper",
          "data_folder", "eval_mode"}
assert all(set(r) == FIELDS for r in rows), "schema changed — recheck the field table"

caps = {r["capsule_uuid"] for r in rows}
api = json.load(urllib.request.urlopen(
    "https://huggingface.co/api/datasets/futurehouse/BixBench", timeout=90))
zips = {s["rfilename"].removeprefix("CapsuleFolder-").removesuffix(".zip")
        for s in api["siblings"] if s["rfilename"].endswith(".zip")}

print(f"questions / capsules / papers : {len(rows)} / {len(caps)} / {len({r['paper'] for r in rows})}")
print(f"versions                      : {sorted({r['version'] for r in rows})}")
print(f"zips / referenced / orphaned  : {len(zips)} / {len(caps)} / {len(zips - caps)}")
assert not (caps - zips), f"referenced capsule with no zip: {caps - zips}"
assert all(r["capsule_uuid"] in r["data_folder"] for r in rows), "data_folder no longer names the capsule"

def categories_of(row):
    raw = str(row["categories"]).strip()
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw[1:-1]
    return [c.strip().strip("'\"") for c in raw.split(",") if c.strip().strip("'\"")]

top = collections.Counter(c for r in rows for c in categories_of(r))
assert "Genomics" in top and "'Genomics'" not in top, "categories not normalised — check both representations"
print(f"top category                  : {top.most_common(1)[0][0]} ({top.most_common(1)[0][1]})")
print(f"categories per row (mean)     : {sum(top.values()) / len(rows):.1f}")
print("all assertions passed")
```

**Expect.**

Invariants — these hold whatever the maintainers republish, and a failure means this page is
wrong:

- **Every row carries the same 17 fields.** If that fires, the schema moved and the field table
  above needs rewriting before anyone relies on it.
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
