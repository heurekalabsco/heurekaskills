---
name: lab-bench
description: Fetch and cite LAB-Bench and LAB-Bench 2, the benchmarks for AI agents doing biology research — literature, figures, tables, databases, protocols, sequences, cloning, patents, clinical trials. Per-subset counts, the record schema, the standard citation, the share-alike constraint that governs reuse, and how to avoid contaminating the benchmark.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, agents, evaluation, public-data, licensing]
covers: [lab-bench, labbench2, benchmark, agent evaluation, litqa, seqqa, dbqa, figqa, tableqa, protocolqa, suppqa, cloning scenarios, patentqa, trialqa, sourcequality, futurehouse, edison scientific, molecular cloning, primer design, restriction enzyme, protocol troubleshooting, scientific figures, supplementary information, clinical trials, patents, canary, share-alike, contamination, hugging face, parquet]
papers: [doi:10.48550/arXiv.2407.10362, doi:10.48550/arXiv.2604.09554]
access: [open, registered]
datasets: [https://huggingface.co/api/datasets/futurehouse/lab-bench, https://huggingface.co/datasets/futurehouse/lab-bench/resolve/main/SuppQA/train-00000-of-00001.parquet, https://huggingface.co/api/datasets/EdisonScientific/labbench2]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: >-
    LAB-Bench public split at revision 5c77cec (1,967 items, 8 subsets) and LAB-Bench 2
    dataset card dated 2026-03-13 (1,912 rows, 16 configs) / Python 3.12.8 / pyarrow 25.0.1
  executed: 8
  unverified: 1
  unverified_reason: >-
    The authenticated LAB-Bench 2 download needs a Hugging Face account that has accepted the
    dataset's terms, and the validating environment has no HF token. Everything the gate lets
    through unauthenticated — the card, the config list, the row counts, the field list and the
    GatedRepo response itself — was executed. Re-run the one remaining block from a host with
    HF_TOKEN set after accepting the terms on the dataset page.
---
# LAB-Bench and LAB-Bench 2

The benchmark most often cited when somebody claims an AI system can do biology research. Two
things a reader needs before anything else: **there is a version 2, and the ecosystem has moved
to it**, and **the licence is share-alike**, which decides what you may do with what you fetch.

This skill gets you the benchmark and cites it correctly. It does not run an evaluation.

## Which version, and why it matters

| | LAB-Bench | LAB-Bench 2 |
|---|---|---|
| published by | FutureHouse, July 2024 | Edison Scientific, February 2026 |
| dataset | `futurehouse/lab-bench` | `EdisonScientific/labbench2` |
| paper | arXiv 2407.10362 | arXiv 2604.09554 |
| what you can download | 1,967 items, ~80% of the set | 1,912 task rows, the whole set |
| gated | no | yes, auto-approved |
| answer format | multiple choice, 2 to 10 options | mostly open response |
| categories | 8 | 5 broad, 15 task tags |

Edison Scientific is the rebranded FutureHouse, so this is one lineage and not two competing
benchmarks. LAB-Bench 2 keeps most of the v1 capability areas, updates them to more realistic
framings, and adds `patentqa`, `trialqa` and `sourcequality`, which have no v1 equivalent.

**It is materially harder.** Both the dataset card and the paper report model-specific accuracy
falling by 26–46% across subtasks moving from v1 to v2 — that is headroom v1 has largely lost to
saturation. The v2 paper's own framing is that frontier models reached "near saturation or
superhuman performance on LAB-Bench subcategories" before it was written.

So: **new work should target LAB-Bench 2.** Reach for v1 when you are reproducing a published v1
number, when you need multiple-choice items rather than open response, or when you need something
ungated that runs without an account.

**Numbers do not transfer between them.** They are different items with a different answer format
and a different grader. A v1 accuracy and a v2 accuracy are not comparable, and neither is
comparable to the other's human baseline.

## Licence — share-alike, and what that forbids

Both datasets, both papers and both harness repositories are **CC-BY-SA-4.0**. Confirmed on
2026-08-27 from the `LICENSE` file in `futurehouse/lab-bench`, which is the verbatim Creative
Commons Attribution-ShareAlike 4.0 International text, and from the repository licence GitHub
reports for `Future-House/LAB-Bench` and `EdisonScientific/labbench2`.

ShareAlike is the constraint that shapes everything below. Fetching, reading, analysing and
evaluating against it are all unrestricted. What share-alike governs is **sharing**: publish an
adapted version — a re-hosted copy, a reformatted subset, a derived corpus of items — and the
Adapter's Licence you apply must itself be CC-BY-SA-4.0 or a compatible licence.

The practical rule for anything built on top of this:

- **Fetch from upstream at run time.** Do not vendor a copy into your own repository, package or
  container image.
- **A local projection is fine.** The `## Get the files` block below writes a derived index to
  your disk. Keeping it is unrestricted; redistributing it puts CC-BY-SA-4.0 on it.
- **Attribute where you do share.** Name the creators, link the source, state the licence, and say
  what you changed.

**And the licence does not cover everything inside the benchmark.** FigQA and TableQA embed
figures and tables lifted from published papers, and v2's file-backed tasks reference PDFs from
the same. CC-BY-SA-4.0 covers the benchmark's own contribution to those items — the question, the
answer, the curation. The underlying figure carries whatever terms its publisher set, and neither
maintainer addresses this. Redistributing a figure is a separate question from redistributing the
benchmark, and it is not answered by the dataset's licence.

If you need a licence-clean benchmark in this family for something you intend to redistribute,
BixBench is Apache-2.0 — the `bixbench` skill covers it. The original LitQA, archived on GitHub as
`Future-House/LitQA` and superseded by LitQA2 in v1 and LitQA3 in v2, ships a verbatim CC-BY-4.0
`LICENSE`, but `litqa-v0.jsonl` holds 51 questions and the repository is archived.

## Access

**LAB-Bench v1 needs nothing.** No account, no token, no click-through. Every block in the next
four sections runs on a bare machine.

**LAB-Bench 2 is `gated: auto`.** You need a free Hugging Face account and you must accept the
dataset's terms on its page once; approval is automatic and immediate rather than a review. After
that, a token in `HF_TOKEN` gets you the files. The card, the config list, the row counts and the
field list are all readable **without** a token, which is why the v2 sections below could be
verified anyway — only the download of task rows is behind the gate.

## Setup

The parquet work below needs one dependency.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install "pyarrow>=18"
```

## LAB-Bench v1 — the subsets, and their sizes

Eight subsets, published as one parquet file each. Read the counts from the card and cross-check
them against the dataset viewer, which computes from the files rather than from the card's own
declaration.

```python
import json, urllib.request

DS = "futurehouse/lab-bench"
card = json.load(urllib.request.urlopen(
    f"https://huggingface.co/api/datasets/{DS}", timeout=60))
tree = json.load(urllib.request.urlopen(
    f"https://huggingface.co/api/datasets/{DS}/tree/main?recursive=1", timeout=60))
view = json.load(urllib.request.urlopen(
    f"https://datasets-server.huggingface.co/size?dataset={DS}", timeout=120))

files = {e["path"]: e["size"] for e in tree if e["type"] == "file"}
declared = {d["config_name"]: d["splits"][0]["num_examples"] for d in card["cardData"]["dataset_info"]}
served = {c["config"]: c["num_rows"] for c in view["size"]["configs"]}

print(f"licence {card['cardData']['license']} | gated {card['gated']} | "
      f"last modified {card['lastModified'][:10]}")
print(f"{'subset':18} {'card':>6} {'viewer':>7} {'MB on main':>11}")
for cfg in sorted(declared):
    mb = files[f"{cfg}/train-00000-of-00001.parquet"] / 1e6
    flag = "" if declared[cfg] == served.get(cfg) else "  <-- DISAGREE"
    print(f"{cfg:18} {declared[cfg]:>6} {served.get(cfg, '-'):>7} {mb:>11.1f}{flag}")
print(f"{'TOTAL':18} {sum(declared.values()):>6} {view['size']['dataset']['num_rows']:>7} "
      f"{sum(files[f'{c}/train-00000-of-00001.parquet'] for c in declared) / 1e6:>11.1f}")
```

Run 2026-08-27:

```
licence cc-by-sa-4.0 | gated False | last modified 2025-09-27
subset               card  viewer  MB on main
CloningScenarios       33      33         0.1
DbQA                  520     520         0.2
FigQA                 181     181       227.0
LitQA2                199     199         0.1
ProtocolQA            108     108         0.3
SeqQA                 600     600         0.4
SuppQA                 82      82         0.0
TableQA               244     244       106.1
TOTAL                1967    1967       334.2
```

What each subset asks for, and what it is good for:

| subset | items | the task |
|---|---|---|
| SeqQA | 600 | manipulating DNA and protein sequences — ORFs, PCR primers, restriction digests, GC content |
| DbQA | 520 | looking up specific entries across biological databases, often several at once |
| TableQA | 244 | reading a table image from a paper |
| LitQA2 | 199 | finding the right paper and reasoning over its full text |
| FigQA | 181 | reading a figure image from a paper |
| ProtocolQA | 108 | spotting a deliberately introduced error in a lab protocol |
| SuppQA | 82 | pulling a value out of supplementary material |
| CloningScenarios | 33 | multi-step molecular cloning workflows, designed to require tools |

**SeqQA and DbQA are 57% of the set and measure something quite different from LitQA2.** The first
two are largely generated programmatically and reward tool use over knowledge; LitQA2 is
expert-written and rewards retrieval. An aggregate "LAB-Bench accuracy" is dominated by the
programmatic subsets and hides that. Report per-subset, or say plainly what you averaged.

**The paper's numbers are not these numbers.** Table 1 of the v1 paper reports the *full* set —
LitQA2 248, SuppQA 102, FigQA 226, TableQA 305, DbQA 650, ProtocolQA 135, SeqQA 750,
CloningScenarios 41, total **2,457**. What you can download is 1,967, and every subset comes out
at 80.0–80.5% of its paper figure. That is deliberate: 20% of each subtask is held back privately
to monitor contamination. Quote 2,457 while running 1,967 items and you are describing a set you
do not have.

**Two of the eight are large.** FigQA is 227 MB and TableQA 106 MB, because both embed the images
inline. The other six total under 1 MB. Do not loop a download over all eight without meaning to.

## What a task record looks like

The schema is not uniform across subsets, so read it rather than assuming. Parquet keeps its
schema in a footer, which means an HTTP range request gets the layout of a 227 MB file for tens of
kilobytes.

```python
import io, json, urllib.request
import pyarrow.parquet as pq

DS = "futurehouse/lab-bench"
BASE = f"https://huggingface.co/datasets/{DS}/resolve/main"

class HFFile(io.RawIOBase):
    """Seekable read-only view of a remote file, served by HTTP range requests."""
    def __init__(self, url, size):
        self.url, self.size, self.pos, self.pulled = url, size, 0, 0
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def read(self, n=-1):
        n = self.size - self.pos if n < 0 else min(n, self.size - self.pos)
        if n <= 0: return b""
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"})
        with urllib.request.urlopen(req, timeout=120) as fh:
            buf = fh.read()
        self.pos += len(buf); self.pulled += len(buf)
        return buf

# One call for every file size — cheaper and gentler than a HEAD per subset.
sizes = {e["path"]: e["size"] for e in json.load(urllib.request.urlopen(
    f"https://huggingface.co/api/datasets/{DS}/tree/main?recursive=1", timeout=60)) if e["type"] == "file"}

CFGS = ["CloningScenarios", "DbQA", "FigQA", "LitQA2", "ProtocolQA", "SeqQA", "SuppQA", "TableQA"]
schemas, pulled = {}, 0
for cfg in CFGS:
    path = f"{cfg}/train-00000-of-00001.parquet"
    fh = HFFile(f"{BASE}/{path}", sizes[path])
    meta = pq.ParquetFile(fh)
    schemas[cfg] = {f.name: str(f.type) for f in meta.schema_arrow}
    pulled += fh.pulled
    print(f"{cfg:18} {meta.metadata.num_rows:>4} rows  {len(schemas[cfg])} fields")

shared = sorted(set.intersection(*(set(s) for s in schemas.values())))
print(f"\nfooters read without downloading any subset: {pulled / 1e3:.0f} KB total\n")
print("shared by all 8 subsets:")
for name in shared:
    types = sorted({s[name] for s in schemas.values()})
    note = "" if len(types) == 1 else "   <-- type varies by subset"
    print(f"    {name:14} {' | '.join(types)}{note}")
print("\nper-subset additions:")
for cfg in CFGS:
    extra = {k: v for k, v in schemas[cfg].items() if k not in shared}
    print(f"    {cfg:18} {', '.join(f'{k} ({v})' for k, v in extra.items()) or '-'}")
```

Run 2026-08-27:

```
CloningScenarios     33 rows  7 fields
DbQA                520 rows  7 fields
FigQA               181 rows  9 fields
LitQA2              199 rows  12 fields
ProtocolQA          108 rows  8 fields
SeqQA               600 rows  7 fields
SuppQA               82 rows  8 fields
TableQA             244 rows  9 fields

footers read without downloading any subset: 484 KB total

shared by all 8 subsets:
    canary         string
    distractors    list<element: string>
    id             string
    ideal          string
    question       string
    source         null | string   <-- type varies by subset
    subtask        string

per-subset additions:
    CloningScenarios   -
    DbQA               -
    FigQA              figure (struct<bytes: binary, path: string>), figure-path (string)
    LitQA2             tag (string), version (string), sources (list<element: string>), is_opensource (bool), key-passage (string)
    ProtocolQA         protocol (string)
    SeqQA              -
    SuppQA             paper-title (string)
    TableQA            tables (list<element: struct<bytes: binary, path: string>>), table-path (list<element: string>)
```

Reading that:

| field | |
|---|---|
| `id` | the item identifier |
| `question` | the prompt shown to the system under test |
| `ideal` | the correct answer |
| `distractors` | the wrong options, so an item is `ideal` plus `distractors` shuffled — a variable-length list, see below |
| `subtask` | the fine-grained task type — the routing key, see below |
| `source` | provenance, populated on FigQA, SuppQA and TableQA and null-typed on the other five |
| `canary` | the leakage marker, see *Not contaminating it* |
| `figure` · `tables` | the image bytes, inline — this is where FigQA's 227 MB lives |
| `figure-path` · `table-path` | the filename the image came from |
| `protocol` | ProtocolQA only — the protocol text carrying the seeded error |
| `key-passage` | LitQA2 only — the passage that supports the answer |
| `tag` · `version` · `sources` · `is_opensource` | LitQA2 only — provenance and whether the source paper is open access |

**`source` is null-typed in five subsets and string-typed in three.** That is a schema conflict,
not a cosmetic difference: `pyarrow.concat_tables` raises `ArrowInvalid` — *Schema at index 1 was
different*, listing `source: null` against `source: string` — rather than coercing. Pass
`promote_options="permissive"` and null resolves against string. Verified 2026-08-27 against DbQA
and SuppQA.

**There is no safe/unsafe directory split here.** Some benchmarks segregate graded material into
its own path, so "do not read the answers" becomes a one-line prefix test. LAB-Bench does not: the
answer sits in a column beside the question in the same file, and any read of a subset materialises
it. The boundary is a field allowlist you have to apply yourself, which is weaker than a
mechanical one — so apply it immediately on load rather than remembering to be careful later.
`## Get the files` does exactly that and prints what it withheld.

## How many options an item has, and why 25% is the wrong baseline

v1 is multiple choice throughout, and it is tempting to assume four options and a 25% chance
floor. That is true of exactly one subset. `distractors` is a variable-length list, so the number
of options varies item by item — and reading only its lengths costs a fraction of a megabyte.

```python
import collections, io, json, urllib.request
import pyarrow.parquet as pq

DS = "futurehouse/lab-bench"
BASE = f"https://huggingface.co/datasets/{DS}/resolve/main"

class HFFile(io.RawIOBase):
    def __init__(self, url, size):
        self.url, self.size, self.pos, self.pulled = url, size, 0, 0
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def read(self, n=-1):
        n = self.size - self.pos if n < 0 else min(n, self.size - self.pos)
        if n <= 0: return b""
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"})
        with urllib.request.urlopen(req, timeout=120) as fh:
            buf = fh.read()
        self.pos += len(buf); self.pulled += len(buf)
        return buf

sizes = {e["path"]: e["size"] for e in json.load(urllib.request.urlopen(
    f"https://huggingface.co/api/datasets/{DS}/tree/main?recursive=1", timeout=60)) if e["type"] == "file"}

CFGS = ["CloningScenarios", "DbQA", "FigQA", "LitQA2", "ProtocolQA", "SeqQA", "SuppQA", "TableQA"]
chance, n_items, pulled = 0.0, 0, 0
print(f"{'subset':18} {'items':>5} {'options':>14} {'chance':>7}")
for cfg in CFGS:
    path = f"{cfg}/train-00000-of-00001.parquet"
    fh = HFFile(f"{BASE}/{path}", sizes[path])
    # Only the lengths are used. The distractor strings are never printed or kept.
    opts = [len(d) + 1 for d in pq.ParquetFile(fh).read(
        columns=["distractors"]).column("distractors").to_pylist()]
    pulled += fh.pulled
    p = sum(1 / k for k in opts) / len(opts)
    chance += sum(1 / k for k in opts); n_items += len(opts)
    lo, hi = min(opts), max(opts)
    mode = collections.Counter(opts).most_common(1)[0][0]
    span = f"{lo}" if lo == hi else f"{lo}-{hi} (mode {mode})"
    print(f"{cfg:18} {len(opts):>5} {span:>14} {p:>6.1%}")
print(f"\nwhole public split: {n_items} items, random-guess accuracy {chance / n_items:.1%}, "
      f"{pulled / 1e3:.0f} KB pulled")
```

Run 2026-08-27:

```
subset             items        options  chance
CloningScenarios      33   4-8 (mode 4)  22.6%
DbQA                 520              4  25.0%
FigQA                181   2-7 (mode 4)  22.3%
LitQA2               199  2-10 (mode 4)  24.4%
ProtocolQA           108   4-7 (mode 4)  23.2%
SeqQA                600   4-5 (mode 4)  24.7%
SuppQA                82   4-8 (mode 5)  21.3%
TableQA              244   4-7 (mode 4)  20.6%

whole public split: 1967 items, random-guess accuracy 23.8%, 670 KB pulled
```

**Only DbQA is uniformly four options.** Everything else varies: LitQA2 spans 2 to 10, FigQA has
items down to a coin flip and up to seven, SuppQA's most common item has five options rather than
four. So the chance baseline is a per-item quantity, and averaged over the public split it is
**23.8%, not 25%** — with per-subset baselines from 20.6% (TableQA) to 25.0% (DbQA).

That is a 4.4-point spread between subsets, which is enough to change how a marginal result reads.
Compute the baseline from `len(distractors) + 1` on the items you actually scored rather than
assuming one; and if you report a per-subset breakdown, report its baseline beside it, because a
fixed 25% line drawn across a chart of all eight is wrong on seven of them.

**Do not read `distractors` for its contents.** Its lengths are a property of the item; its values
are the answer key inverted. The block above takes `len()` and discards the strings, which is the
pattern to copy.

## Subtasks, and the count that does not match

`subtask` is what you filter on. Six subsets carry a single label; SeqQA and DbQA are composites.

```python
import collections, io, json, urllib.request
import pyarrow.parquet as pq

DS = "futurehouse/lab-bench"
BASE = f"https://huggingface.co/datasets/{DS}/resolve/main"

class HFFile(io.RawIOBase):
    def __init__(self, url, size):
        self.url, self.size, self.pos, self.pulled = url, size, 0, 0
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def read(self, n=-1):
        n = self.size - self.pos if n < 0 else min(n, self.size - self.pos)
        if n <= 0: return b""
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"})
        with urllib.request.urlopen(req, timeout=120) as fh:
            buf = fh.read()
        self.pos += len(buf); self.pulled += len(buf)
        return buf

sizes = {e["path"]: e["size"] for e in json.load(urllib.request.urlopen(
    f"https://huggingface.co/api/datasets/{DS}/tree/main?recursive=1", timeout=60)) if e["type"] == "file"}

CFGS = ["CloningScenarios", "DbQA", "FigQA", "LitQA2", "ProtocolQA", "SeqQA", "SuppQA", "TableQA"]
labels, pulled = {}, 0
for cfg in CFGS:
    path = f"{cfg}/train-00000-of-00001.parquet"
    fh = HFFile(f"{BASE}/{path}", sizes[path])
    # columns=["subtask"] is what keeps this cheap: FigQA is 227 MB and this reads ~66 KB of it.
    labels[cfg] = collections.Counter(
        pq.ParquetFile(fh).read(columns=["subtask"]).column("subtask").to_pylist())
    pulled += fh.pulled
    sizes_ = collections.Counter(labels[cfg].values())
    shape = ", ".join(f"{n}x{k}" for n, k in sorted(sizes_.items(), key=lambda x: -x[0]))
    print(f"{cfg:18} {sum(labels[cfg].values()):>4} items  {len(labels[cfg]):>2} label(s)   {shape}")

flat = collections.Counter()
for c in labels.values():
    flat.update(c)
print(f"\n{len(CFGS)} subsets, {len(flat)} distinct subtask labels, "
      f"{sum(flat.values())} items, {pulled / 1e3:.0f} KB pulled")
print(f"labels carrying the '-public' suffix: {sum(1 for k in flat if k.endswith('-public'))} of {len(flat)}")
print(f"example label: {sorted(labels['SeqQA'])[-1]}")
```

Run 2026-08-27:

```
CloningScenarios     33 items   1 label(s)   33x1
DbQA                520 items  10 label(s)   80x3, 40x7
FigQA               181 items   1 label(s)   181x1
LitQA2              199 items   1 label(s)   199x1
ProtocolQA          108 items   1 label(s)   108x1
SeqQA               600 items  15 label(s)   40x15
SuppQA               82 items   1 label(s)   82x1
TableQA             244 items   1 label(s)   244x1

8 subsets, 31 distinct subtask labels, 1967 items, 485 KB pulled
labels carrying the '-public' suffix: 31 of 31
example label: RE-seq-numfrags-v1-public
```

Three things fall out of that.

**The dataset card says 30 narrower subtasks; the public split carries 31 distinct labels.** Off by
one, and it is not obvious from either side alone — the card's own config list stops at the eight
broad categories, so nothing there contradicts it. Count the column.

**SeqQA is fifteen evenly sized programmatic tasks of forty items each**, so it is a
stratified set rather than a topic, and a random 100-item sample of SeqQA is roughly seven of each.
DbQA is ten, with three at eighty and seven at forty.

**Every label carries a `-public` suffix.** The split is stamped into the label, so the item you
are holding says out loud that it comes from the released 80%. Nothing in the public parquet
carries a `-private` label, which is the check that the held-out 20% is genuinely absent rather
than merely unadvertised.

## LAB-Bench 2

Everything here reads from the public card. No token is needed for any of it — the gate is on the
task rows, not the metadata.

```python
import json, urllib.request

card = json.load(urllib.request.urlopen(
    "https://huggingface.co/api/datasets/EdisonScientific/labbench2", timeout=60))
info = {d["config_name"]: d for d in card["cardData"]["dataset_info"]}

print(f"licence {card['cardData']['license']} | gated {card['gated']!r} | "
      f"last modified {card['lastModified'][:10]}")
print(f"\n{'config':16} {'items':>6} {'download KB':>12}")
for cfg in sorted(info, key=lambda c: -info[c]["splits"][0]["num_examples"]):
    d = info[cfg]
    print(f"{cfg:16} {d['splits'][0]['num_examples']:>6} {d['download_size'] / 1e3:>12.1f}")

per_tag = {c: v for c, v in info.items() if c != "all"}
print(f"\nsum of tag configs {sum(v['splits'][0]['num_examples'] for v in per_tag.values())} "
      f"| the 'all' config {info['all']['splits'][0]['num_examples']}")

v2 = {f["name"] for f in info["all"]["features"]}
v1 = {"id", "question", "ideal", "distractors", "canary", "source", "subtask"}
print(f"\nfields in v2 'all' ({len(v2)}): {' '.join(sorted(v2))}")
print(f"dropped from the v1 core: {' '.join(sorted(v1 - v2)) or '-'}")
print(f"added since v1         : {' '.join(sorted(v2 - v1))}")

# What the gate does when you have no token. `x-error-code` names the failure class where
# the bare 401 does not — though it says GatedRepo whether or not a token was sent.
url = "https://huggingface.co/datasets/EdisonScientific/labbench2/resolve/main/dbqa2/train-00000-of-00001.parquet"
try:
    urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60)
    print("\nfile fetch: allowed without a token")
except urllib.error.HTTPError as err:
    print(f"\nfile fetch without a token: HTTP {err.code}  "
          f"x-error-code: {err.headers.get('x-error-code')}")
```

Run 2026-08-27:

```
licence cc-by-sa-4.0 | gated 'auto' | last modified 2026-03-13

config            items  download KB
all                1912        470.1
seqqa2              400         60.4
litqa3              168        100.2
sourcequality       150         33.0
protocolqa2         125         61.2
suppqa2             125         47.3
patentqa            121         55.3
trialqa             120         71.5
figqa2              101         36.5
figqa2-img          101         27.0
figqa2-pdf          101         28.7
tableqa2            100         30.2
tableqa2-img        100         25.2
tableqa2-pdf        100         26.7
dbqa2                86         22.8
cloning              14         23.2

sum of tag configs 1912 | the 'all' config 1912

fields in v2 'all' (16): answer_regex canary files ground_truth id ideal is_opensource key_passage mode prompt_suffix question sources tag type validator_params version
dropped from the v1 core: distractors source subtask
added since v1         : answer_regex files ground_truth is_opensource key_passage mode prompt_suffix sources tag type validator_params version

file fetch without a token: HTTP 401  x-error-code: GatedRepo
```

**1,912 is a count of task rows, not of distinct questions.** FigQA2 appears three times at 101
items — as `figqa2`, `figqa2-img` and `figqa2-pdf` — and TableQA2 three times at 100. Those are
delivery variants of the same questions: the figure supplied as an image, as the source PDF, or not
supplied at all so the system has to retrieve it. Table 1 of the v2 paper lists them exactly that
way and still totals 1,912, so the headline number counts each variant. Distinct questions come to
**1,510** — 402 fewer. Which figure is right depends on what you are claiming; quoting 1,912 as a
question count overstates the benchmark's breadth by a fifth.

SeqQA2 and CloningQA have the same three delivery modes, but there they are a runtime `--mode`
flag rather than separate configs — so their 400 and 14 are already distinct-question counts. This
is not consistent across the dataset, and the config list is the only place it shows.

**`distractors` is gone.** v1 is multiple choice throughout; v2 is mostly open response, graded by
`answer_regex` and `validator_params` rather than by option matching. That is the single largest
reason v1 and v2 numbers are not comparable — v1 items have a chance floor averaging 23.8%, and
open-response items have none at all.

The other new fields: `files` names the attachments a task needs, `mode` is the
`{file, retrieve, inject}` struct that says how they may be supplied, `sources` and `is_opensource`
carry provenance, `key_passage` is the supporting text, `ground_truth` flags whether the reference
answer is verified, and `prompt_suffix` is per-task instruction appended to the question.
`subtask` is replaced by `tag`, which takes the config names above.

**No held-out private split, as far as anything published says.** v1 keeps 20% back; the v2 paper
and card describe no such split, and Table 1's total matches what the repository serves exactly, so
what is gated appears to be the whole benchmark. The gate is doing the job the private split does
in v1 — which means acceptance of the terms is the only thing standing between v2 and a training
corpus.

**Two upstream pointers are wrong or stale, and both send you somewhere useful anyway.** The
dataset card's arXiv badge is an unfilled placeholder rather than a real identifier — the working
link is on the GitHub harness README. And the paper's abstract gives the dataset URL as
`huggingface.co/datasets/futurehouse/labbench2`, which is the pre-rebrand path; it 307-redirects to
`EdisonScientific/labbench2`. Use the Edison Scientific path directly.

## Getting into LAB-Bench 2

Accept the terms once on <https://huggingface.co/datasets/EdisonScientific/labbench2>, create a
read token under your Hugging Face account settings, and put it in the environment. Approval is
automatic — there is no review and no waiting.

```bash
export HF_TOKEN=hf_your_read_token_here

python3 -m venv .venv && . .venv/bin/activate
pip install "huggingface_hub>=0.26" "pyarrow>=18"

python - <<'PY'
import os, pyarrow.parquet as pq
from huggingface_hub import hf_hub_download

# Fields carrying the answer or the grading rule. Drop them on load.
GRADED = {"question", "ideal", "key_passage", "answer_regex", "validator_params",
          "prompt_suffix", "canary"}

path = hf_hub_download("EdisonScientific/labbench2",
                       "dbqa2/train-00000-of-00001.parquet",
                       repo_type="dataset", local_dir="Data/labbench2",
                       token=os.environ["HF_TOKEN"])
tb = pq.read_table(path)
keep = [n for n in tb.schema.names if n not in GRADED]
print(f"{tb.num_rows} rows, {tb.num_columns} fields")
print(f"kept     {sorted(keep)}")
print(f"withheld {sorted(set(tb.schema.names) & GRADED)}")
PY
```

**This block is the one thing on this page that was not executed** — see `unverified_reason` in the
frontmatter. Everything the gate lets through unauthenticated was.

**A failure here does not tell you which failure it is.** No token, an invalid token, and a valid
token on an account that has not accepted the terms all produce the byte-identical response — HTTP
401 with `x-error-code: GatedRepo` and the same message. Verified 2026-08-27 by sending no
`Authorization` header and then a fabricated one; the two replies are indistinguishable.
`huggingface_hub` surfaces all of them as `GatedRepoError`.

Worse, **an invalid token is silent everywhere else**: the same fabricated token against the
ungated v1 repository returns a normal 302 and downloads the file, because Hugging Face falls back
to anonymous access rather than rejecting bad credentials. So a wrong token announces itself only
on gated repositories, and there it looks exactly like unaccepted terms. Diagnose in two steps —
confirm the token identifies you (`huggingface-cli whoami`), then reopen the dataset page and check
the terms.

The task attachments — PDFs, images, bioinformatics files — are not in the parquet. They live in
Google Cloud Storage and the upstream harness fetches them on demand into `~/.cache/labbench2`.
Reading the parquet alone gets you the task metadata, not the material a file-mode task needs.

## Not contaminating it

A benchmark answers a question exactly once per model, and only if the model has not seen it. Both
of these are old enough and public enough that the risk is real rather than theoretical.

**Upstream asks for something specific.** The v1 paper states it plainly:

> We request that you do not reveal examples from this dataset in plain text or images online, to
> reduce the risk of leakage into foundation model training corpora.

That is narrower than it first reads. It covers item content — questions, answers, distractors,
figures, protocols. It does not cover describing the benchmark, citing it, reporting scores, or
documenting how to fetch it, all of which help it. What it rules out is pasting items into a
public repository, an issue, a blog post, a slide deck or a chat transcript that gets scraped.

**Every row carries a canary.** Both versions ship a `canary` column, and the v1 README and paper
publish a canary GUID that is a superset of the BIG-bench canary string, so that anyone building a
training corpus can filter on it. Read it if you like — it is part of the data. **Do not reproduce
it anywhere public.** Publishing that string is the single action that destroys its only function
for everyone, permanently: corpus filters keyed on it start dropping unrelated documents, and a
model emitting it stops being evidence of exposure. It is deliberately not printed anywhere on this
page. Read it off the dataset card when you need it.

**Nothing you can run is a clean held-out evaluation.** v1's public split has been downloadable
since July 2024 and the card reported 9,830 downloads in the preceding thirty days when this page
was written, so circulation is ongoing rather than historic. The 20% that would settle contamination
is private, and **no submission route exists** — no leaderboard, no evaluation server, no contact
address for scoring against the held-out set, in either version. The maintainers report the
public-versus-private gap in their own supplementary results; you cannot reproduce that comparison.
So a v1 number in 2026 is a number on a set that has been in public circulation for two years, and
should be reported as such.

v2 is newer and gated, which is better, and the gate is the only barrier — there is no held-out
remainder behind it.

**Practical rules if you evaluate against either:**

- Project out the graded fields on load, before anything can print one by accident. Every block on
  this page that touches item rows does it, and prints what it withheld.
- Never send an item into a service that trains on inputs.
- Never commit fetched task content to a repository, public or private — a private repo can be
  opened later, and history is permanent.
- Report which version and which subsets, and note that the public split is contaminable.
- If you look at items to understand the benchmark, say so; those items are no longer a blind test
  for you.

## Get the files

Two of the small subsets, fetched from upstream to disk, plus a derived index with every graded
field projected out. The two big subsets are named in the block rather than fetched — FigQA and
TableQA are 227 MB and 106 MB, and you should choose to pull those deliberately.

```python
import json, os, urllib.request
import pyarrow as pa, pyarrow.csv as csv, pyarrow.parquet as pq

DS = "futurehouse/lab-bench"
BASE = f"https://huggingface.co/datasets/{DS}/resolve/main"
OUT = "Data/lab-bench"
WANT = ["SuppQA", "DbQA"]          # 25 KB and 171 KB; FigQA is 227 MB and TableQA 106 MB
os.makedirs(OUT, exist_ok=True)

# Fields that carry the answer, the graded context, or the canary. Project them out
# once, here, so nothing downstream can print one by accident.
GRADED = {"question", "ideal", "distractors", "key-passage", "protocol", "figure", "tables", "canary"}

# Declared sizes, so a truncated download is caught here rather than three steps later.
sizes = {e["path"]: e["size"] for e in json.load(urllib.request.urlopen(
    f"https://huggingface.co/api/datasets/{DS}/tree/main?recursive=1", timeout=60)) if e["type"] == "file"}

tables = {}
for cfg in WANT:
    path = f"{cfg}/train-00000-of-00001.parquet"
    dest = os.path.join(OUT, f"{cfg}.parquet")
    urllib.request.urlretrieve(f"{BASE}/{path}", dest)
    assert os.path.getsize(dest) == sizes[path], \
        f"{cfg}: got {os.path.getsize(dest)} of {sizes[path]} bytes — interrupted download"
    tb = pq.read_table(dest)
    keep = [n for n in tb.schema.names if n not in GRADED]
    tables[cfg] = tb.select(keep).append_column(
        "subset", pa.array([cfg] * tb.num_rows, pa.string()))
    print(f"{cfg:8} {os.path.getsize(dest) / 1e3:>7.1f} KB  {tb.num_rows:>4} rows  "
          f"kept {sorted(keep)}  withheld {sorted(set(tb.schema.names) & GRADED)}")

# `source` is null-typed in five subsets and string-typed in three, so a plain
# concat_tables raises ArrowInvalid. promote_options resolves null against string.
index = pa.concat_tables(tables.values(), promote_options="permissive")

def flatten(tb):
    """CSV has no list type, and two of the kept fields are lists — LitQA2's `sources`
    and TableQA's `table-path`. Without this, adding either subset to WANT fails with
    `ArrowInvalid: Unsupported Type: list<element: string>` at the write, not the read."""
    cols = [pa.array(["; ".join(v) if v else None for v in tb.column(f.name).to_pylist()],
                     pa.string()) if pa.types.is_list(f.type) else tb.column(f.name)
            for f in tb.schema]
    return pa.Table.from_arrays(cols, names=tb.schema.names)

csv.write_csv(flatten(index), os.path.join(OUT, "index.csv"))
with open(os.path.join(OUT, "PROVENANCE.json"), "w") as fh:
    json.dump({"dataset": DS, "revision": json.load(urllib.request.urlopen(
        f"https://huggingface.co/api/datasets/{DS}", timeout=60))["sha"],
        "licence": "CC-BY-SA-4.0", "subsets": WANT, "rows": index.num_rows,
        "projection": "graded fields and canary removed"}, fh, indent=2)

print(f"\nindex.csv  {index.num_rows} rows x {index.num_columns} cols  "
      f"{os.path.getsize(os.path.join(OUT, 'index.csv')) / 1e3:.1f} KB")
for name, _, files in os.walk(OUT):
    for f in sorted(files):
        print(f"  {os.path.join(name, f):32} {os.path.getsize(os.path.join(name, f)) / 1e3:>8.1f} KB")
```

Run 2026-08-27:

```
SuppQA      25.3 KB    82 rows  kept ['id', 'paper-title', 'source', 'subtask']  withheld ['canary', 'distractors', 'ideal', 'question']
DbQA       171.1 KB   520 rows  kept ['id', 'source', 'subtask']  withheld ['canary', 'distractors', 'ideal', 'question']

index.csv  602 rows x 5 cols  58.3 KB
  Data/lab-bench/DbQA.parquet         171.1 KB
  Data/lab-bench/PROVENANCE.json        0.2 KB
  Data/lab-bench/SuppQA.parquet        25.3 KB
  Data/lab-bench/index.csv             58.3 KB
```

**Check the size against what the repository declares.** `urlretrieve` writes what it received and
returns; an interrupted transfer leaves a short file that looks finished, and the failure surfaces
later as `Parquet magic bytes not found in footer` from a file that is plainly there. That is not
hypothetical — it is what an interrupted FigQA pull did while this page was being written, leaving
164 MB of 227 on disk. The assertion above turns it into an error at the point it happened, and it
matters most for the two subsets big enough to be interrupted.

Two things about what landed. **The `.parquet` files still contain the answers** — the projection
guards what you compute over, not what is on disk, and it cannot: the question and its answer are
columns of the same file. Treat `Data/lab-bench/*.parquet` as material you would not paste
anywhere. **`PROVENANCE.json` pins the revision**, because `main` moves — the SeqQA items were
revised on 2025-02-18 and FigQA on 2024-08-19, and a run recorded without a commit sha cannot say
which it used.

**It generalises.** `WANT` takes any of the eight; the block was run across all of them on
2026-08-27 and produces a 1,967-row, 11-column index — the union of the safe fields, with
FigQA's `figure-path`, TableQA's `table-path`, SuppQA's `paper-title` and LitQA2's four extras
filling in where a subset has them and null elsewhere. `GRADED` covers every answer-bearing field
in all eight, including the two that appear in only one subset each. Budget 333 MB and a few
minutes if you include FigQA and TableQA.

`index.csv` is a derived work under CC-BY-SA-4.0. Keeping it is unrestricted; publishing it
attaches share-alike terms to whatever you publish it in.

## What this skill will not do

It fetches, describes and cites. It does not run an evaluation, does not implement a grader, and
does not stand up an agent against the tasks — for that, the upstream harnesses are
`Future-House/LAB-Bench` for v1 and `EdisonScientific/labbench2` for v2, both CC-BY-SA-4.0.

That boundary is why the blocks above never print an item. Fetching and characterising a benchmark
is safe and useful; putting its answers where a crawler can reach them is how the benchmark stops
measuring anything.

## The citation

**Cite LAB-Bench as a preprint.** It was submitted to the NeurIPS 2024 Datasets and Benchmarks
track and, as of 2026-08-27, has no journal or proceedings version — OpenAlex records it as a
preprint with arXiv as its only location, and the arXiv record carries no `journal_ref` and no
external DOI. Anyone citing it as a NeurIPS paper is citing something that does not exist.

The current version is **v3, 17 July 2024**. Nine authors:

```bibtex
@misc{laurent2024labbench,
  title        = {LAB-Bench: Measuring Capabilities of Language Models for Biology Research},
  author       = {Jon M. Laurent and Joseph D. Janizek and Michael Ruzo and Michaela M. Hinks
                  and Michael J. Hammerling and Siddharth Narayanan and Manvitha Ponnapati
                  and Andrew D. White and Samuel G. Rodriques},
  year         = {2024},
  eprint       = {2407.10362},
  archivePrefix= {arXiv},
  primaryClass = {cs.AI},
  doi          = {10.48550/arXiv.2407.10362}
}
```

**LAB-Bench 2 is a separate citation, not a version bump.** Different author list — twelve authors,
four of them shared with v1 (Laurent, Narayanan, White, Rodriques) — different institution,
different arXiv identifier. Current version v2, 5 May 2026. The key, title and author list below
are the ones the upstream harness publishes; the `doi` line is arXiv's own registration, which
upstream omits:

```bibtex
@misc{laurent2026labbench2,
  title        = {LABBench2: An Improved Benchmark for AI Systems Performing Biology Research},
  author       = {Jon M. Laurent and Albert Bou and Michael Pieler and Conor Igoe
                  and Alex Andonian and Siddharth Narayanan and James Braza
                  and Alexandros Sanchez Vassopoulos and Jacob L. Steenwyk and Blake Lash
                  and Andrew D. White and Samuel G. Rodriques},
  year         = {2026},
  eprint       = {2604.09554},
  archivePrefix= {arXiv},
  primaryClass = {cs.AI},
  doi          = {10.48550/arXiv.2604.09554}
}
```

Four details worth getting right, because they are the ones people get wrong:

- **Spelling.** The v1 benchmark is hyphenated, `LAB-Bench`. The v2 benchmark is not, `LABBench2`
  — that is the spelling in its own title, README and BibTeX key. The Hugging Face repository is
  `labbench2`, lowercase.
- **Publisher.** v1 is FutureHouse; v2 is Edison Scientific. Same organisation, renamed.
- **Cite the dataset separately from the paper** when your number depends on which items you ran,
  which it does. Name the repository and the commit sha — `PROVENANCE.json` above records it.
- **Say which split.** "LAB-Bench" without qualification reads as the 2,457-item full set. If you
  ran the download, you ran the 1,967-item public split, and the difference is 20%.

## Try it

**Data.** The LAB-Bench v1 public split (`futurehouse/lab-bench` on Hugging Face), CC-BY-SA-4.0,
ungated, no account needed; and the LAB-Bench 2 dataset card
(`EdisonScientific/labbench2`), whose metadata is public even though its files are gated. Both
confirmed reachable 2026-08-27.

This block downloads nothing. It reads two dataset cards and four parquet footers by range
request — about half a megabyte in total, against a corpus of 334 MB — and it never materialises a
question or an answer.

**Run.** In an empty directory:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install --quiet "pyarrow>=18"

python - <<'PY'
import io, json, urllib.request
import pyarrow as pa, pyarrow.parquet as pq

DS = "futurehouse/lab-bench"
BASE = f"https://huggingface.co/datasets/{DS}/resolve/main"

class HFFile(io.RawIOBase):
    def __init__(self, url, size):
        self.url, self.size, self.pos, self.pulled = url, size, 0, 0
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def read(self, n=-1):
        n = self.size - self.pos if n < 0 else min(n, self.size - self.pos)
        if n <= 0: return b""
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"})
        with urllib.request.urlopen(req, timeout=120) as fh:
            buf = fh.read()
        self.pos += len(buf); self.pulled += len(buf)
        return buf

def get(url):
    with urllib.request.urlopen(url, timeout=90) as fh:
        return json.load(fh)

v1 = get(f"https://huggingface.co/api/datasets/{DS}")
v2 = get("https://huggingface.co/api/datasets/EdisonScientific/labbench2")
sizes = {e["path"]: e["size"] for e in get(
    f"https://huggingface.co/api/datasets/{DS}/tree/main?recursive=1") if e["type"] == "file"}

assert v1["cardData"]["license"] == v2["cardData"]["license"] == "cc-by-sa-4.0", "licence changed"
assert v1["gated"] is False, "v1 became gated"
assert v2["gated"] == "auto", "v2 gating changed"

counts = {d["config_name"]: d["splits"][0]["num_examples"] for d in v1["cardData"]["dataset_info"]}
served = {c["config"]: c["num_rows"] for c in
          get(f"https://datasets-server.huggingface.co/size?dataset={DS}")["size"]["configs"]}
assert counts == served, f"card and viewer disagree: {counts} vs {served}"

# Four subsets spanning the axes this dataset varies on: smallest, largest, image-bearing,
# and the one with the widest schema.
tabs, opts, pulled = {}, [], 0
for cfg in ["SuppQA", "SeqQA", "FigQA", "LitQA2"]:
    p = f"{cfg}/train-00000-of-00001.parquet"
    fh = HFFile(f"{BASE}/{p}", sizes[p])
    pf = pq.ParquetFile(fh)
    names = {f.name for f in pf.schema_arrow}
    assert pf.metadata.num_rows == counts[cfg], f"{cfg} row count moved"
    assert {"id", "question", "ideal", "distractors", "canary", "subtask", "source"} <= names, \
        f"{cfg} lost a core field"
    tabs[cfg] = pf.read(columns=["id", "source", "subtask"])
    # Lengths only — the distractor strings are counted and discarded, never printed.
    opts += [len(d) + 1 for d in
             pf.read(columns=["distractors"]).column("distractors").to_pylist()]
    pulled += fh.pulled

# The "uniform four-option, 25% chance" assumption this page exists to correct.
assert len(set(opts)) > 1, "option counts became uniform — the chance-baseline section is stale"

# `source` is null in SeqQA and string in FigQA, so this raises without promote_options --
# the trap a naive multi-subset load walks into.
try:
    pa.concat_tables([tabs["SeqQA"], tabs["FigQA"]])
    raise SystemExit("FAIL: source types no longer conflict — the promote_options note is stale")
except pa.lib.ArrowInvalid:
    pass
merged = pa.concat_tables(tabs.values(), promote_options="permissive")

labels = set(merged.column("subtask").to_pylist())
assert all(s.endswith("-public") for s in labels), f"a non-public subtask label appeared: {labels}"

print(f"v1 items / subsets      : {sum(counts.values())} / {len(counts)}")
print(f"v1 largest subset       : {max(counts, key=counts.get)} ({max(counts.values())})")
print(f"v2 rows / configs       : {v2['cardData']['dataset_info'][0]['splits'][0]['num_examples']} "
      f"/ {len(v2['cardData']['dataset_info']) - 1} tags")
print(f"footers read            : {pulled / 1e3:.0f} KB for "
      f"{sum(sizes[f'{c}/train-00000-of-00001.parquet'] for c in tabs) / 1e6:.0f} MB of parquet")
print(f"sampled rows / labels   : {merged.num_rows} / {len(labels)}")
print(f"sampled options / chance: {min(opts)}-{max(opts)} / "
      f"{sum(1 / k for k in opts) / len(opts):.1%}")
print("all assertions passed")
PY
```

**Expect.**

Invariants — these hold whatever the maintainers republish, and a failure means this page is
wrong:

- **Both datasets are CC-BY-SA-4.0**, v1 ungated and v2 `gated: auto`. A change here changes what
  you may lawfully do, and it is the first thing to re-check.
- **The card's declared counts equal what the dataset viewer computes from the files.** Those are
  two independent sources; if they diverge, the card is stale and every number on this page is
  suspect.
- **Every subset carries `id`, `question`, `ideal`, `distractors`, `canary`, `subtask` and
  `source`.** The per-subset additions vary; those seven do not.
- **`source` conflicts between null and string across subsets**, so a plain `concat_tables` raises.
  The block asserts the raise rather than the workaround — if it stops raising, the note above is
  what needs deleting.
- **Every `subtask` label ends in `-public`.** A `-private` label in the public download would mean
  the held-out split had leaked.
- **Option counts are not uniform.** `distractors` is variable-length, so the chance baseline is a
  per-item quantity. If this assertion stops firing, the section arguing against a flat 25% line is
  the thing to delete.
- No canary value is read or printed, and no distractor string is either — only their lengths.

Observed 2026-08-27 — these move when the maintainers revise, so treat a mismatch as drift to
investigate rather than a failure:

```
v1 items / subsets      : 1967 / 8
v1 largest subset       : SeqQA (600)
v2 rows / configs       : 1912 / 15 tags
footers read            : 366 KB for 227 MB of parquet
sampled rows / labels   : 1062 / 18
sampled options / chance: 2-10 / 24.0%
all assertions passed
```

## Sources

- LAB-Bench — Laurent et al., *LAB-Bench: Measuring Capabilities of Language Models for Biology
  Research*, arXiv [2407.10362](https://arxiv.org/abs/2407.10362) (2024). Describes the full
  2,457-item set; 1,967 of those are downloadable.
- LAB-Bench 2 — Laurent et al., *LABBench2: An Improved Benchmark for AI Systems Performing Biology
  Research*, arXiv [2604.09554](https://arxiv.org/abs/2604.09554) (2026).
- Datasets — [`futurehouse/lab-bench`](https://huggingface.co/datasets/futurehouse/lab-bench) and
  [`EdisonScientific/labbench2`](https://huggingface.co/datasets/EdisonScientific/labbench2), both
  CC-BY-SA-4.0. Read the v1 card for the canary policy rather than copying the value from anywhere.
- Harnesses — [`Future-House/LAB-Bench`](https://github.com/Future-House/LAB-Bench) and
  [`EdisonScientific/labbench2`](https://github.com/EdisonScientific/labbench2), CC-BY-SA-4.0.

FigQA, TableQA and the v2 file-backed tasks embed figures, tables and PDFs from published papers.
CC-BY-SA-4.0 covers the benchmark's contribution to those items; the underlying material carries
its publisher's terms. Fetch from upstream, and check the source before redistributing anything you
pull out of a subset.
