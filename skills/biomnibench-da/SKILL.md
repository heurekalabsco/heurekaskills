---
name: biomnibench-da
description: Access BiomniBench-DA, 50 publicly released biomedical data-analysis tasks built from Nature, Cell and Science papers and graded on the whole agent trajectory against expert rubrics. Browse the task catalogue and trace a task back to its source paper without an account, then pull one task's real data with a Hugging Face login. Leaves the rubrics alone.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, agents, evaluation, multi-omics]
covers: [biomnibench, benchmark, agent evaluation, process-level evaluation, rubric, llm agents, paper-derived, provenance, biomedical, single-cell, scrna-seq, chip-seq, proteomics, clinical trial, colorectal cancer, immunotherapy, nafld, liver, melanoma, tcga, geo, gene expression, differential expression, data analysis, huggingface, gated dataset, harbor, held-out]
papers: [doi:10.64898/2026.05.12.724604]
access: [open, registered]
datasets: [https://huggingface.co/api/datasets/phylobio/BiomniBench-DA/tree/main?recursive=true, https://huggingface.co/datasets/phylobio/BiomniBench-DA/resolve/main/README.md]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: BiomniBench-DA public release on Hugging Face main (revision e1c8ca5, 50 tasks / 766 files) / Python 3.12 / huggingface_hub 1.29.0 / standard library elsewhere
  executed: 6
  unverified: 1
  unverified_reason: >-
    The `hf download` that pulls a task's files needs a Hugging Face account that has accepted
    this dataset's terms, and the validating environment has none — its refusal path was run
    and is quoted, but no transfer was. The `--exclude` filter it relies on was checked
    separately, against the real 766-path listing and through the function the downloader
    itself uses, so what is unproven is the transfer rather than the filter. Re-run from an
    approved account. Four further blocks are continuations that reuse `files` from the block
    above them and cannot run alone, so they are excluded from the denominator rather than
    counted either way.
---
# BiomniBench-DA

**50 biomedical data-analysis tasks, each built on a published paper's own data and graded on
the whole analytical trajectory rather than the final number.** Every task was co-developed
with an original author of the paper or a domain expert, and scored against a rubric that
asks how the analysis was done — data handling, method selection, statistical rigour,
biological interpretation, scientific reasoning, source reliability — not only what it
concluded.

That design is the reason to care about it as a corpus. Fifty real analyses, with the inputs
the authors worked from, structured so that *how you got there* is the thing being measured.

This skill gets you the catalogue, the provenance, and the data. It does not get you the
rubrics, and it does not run the grader.

## Before anything else — the dataset is gated

The files sit behind a Hugging Face account and a click-through. The gate is set to
**automatic approval**, so anyone with a free account gets in immediately after accepting the
terms on the dataset page — no committee, no waiting. But it is still a gate, and it means
**this skill cannot run unattended on a fresh machine.**

What that costs you is narrower than it sounds. The dataset card and the *file listing* are
served to anyone, and the listing turns out to carry most of what you need to plan work —
task structure, provenance, download budget. Only the file contents are closed.

Test the boundary rather than trusting this paragraph.

```bash
REPO=https://huggingface.co/datasets/phylobio/BiomniBench-DA

# The dataset card is served to anyone. This is NOT a sign the files are.
curl -sS -o /dev/null -w "card       %{http_code}  %{content_type}\n" \
  "$REPO/resolve/main/README.md"

# The file listing is served to anyone too, and it is the whole catalogue.
curl -sS -o /dev/null -w "tree api   %{http_code}  %{content_type}\n" \
  "https://huggingface.co/api/datasets/phylobio/BiomniBench-DA/tree/main?recursive=true"

# Any actual task file is not.
curl -sSL -o /tmp/gate.txt -w "task file  %{http_code}  %{content_type}\n" \
  "$REPO/resolve/main/da-1-3/task.toml"
echo "body: $(cat /tmp/gate.txt)"
```

Run 2026-08-27:

```
card       200  text/plain; charset=utf-8
tree api   200  application/json; charset=utf-8
task file  401  text/plain; charset=utf-8
body: Access to dataset phylobio/BiomniBench-DA is restricted. You must have access to it and be authenticated to access it. Please log in.
```

Two things to take from that. **A 200 on the card proves nothing about the files** — every
gated dataset on the Hub serves its card openly, so a reachability check pointed at the README
reports healthy on a repository you cannot read. And the 401 arrives as `text/plain`, not
JSON, so a client that parses the response body will raise a decoding error rather than tell
you about the gate.

To get through it, sign in to Hugging Face, open the dataset page, accept the terms, and
create a read token. The smaller `-sample` repository published alongside it is gated the same
way — it is not an open preview.

## Licence — three different ones are in play

- **The benchmark's own artifacts are CC-BY-4.0.** Instructions, rubrics, reference traces and
  judge prompts. That is the licence on this dataset.
- **The underlying data is not covered by that.** Each task ships files taken from a published
  study, and those keep whatever terms their source set. The card says so directly, and it
  matters here more than in most benchmarks because the data is the bulk of the repository.
- **Third-party harnesses that wrap this benchmark carry their own, different licences.**
  `omicverse/OmicOS-BiomniBench` is PolyForm Noncommercial 1.0.0 — a licence that forbids
  commercial use, on a wrapper around data that permits it. Someone who arrives at a harness
  first and assumes the terms flow through gets this exactly backwards.

Reorganised copies of this dataset also exist on the Hub under other accounts, ungated and
relabelled with licences the original does not carry. They are not authoritative, they are not
covered by the maintainers' terms, and they republish the graded material the gate exists to
protect. Fetch from `phylobio/BiomniBench-DA`.

## The paper describes twice the dataset you can download

The paper reports **100 tasks across 17 task types and 5 disease areas**. The public release
is **50**; the other half is held back as a private evaluation set. Any number you quote needs
to say which it refers to, and a score measured on the public 50 is not a score on the
benchmark the paper reports.

There is no index file, no manifest, no parquet. The structure *is* the directory tree, and
task directories are named `da-<paper>-<task>`, so the tree tells you how the two halves were
split.

**Read the listing through a paginating fetch, not a single request.** The endpoint has two
silent failure modes and this helper is what closes both; the reasoning is under *Two ways to
mis-read the listing* below.

```python
import collections, json, re, urllib.request

def hf_tree(repo="phylobio/BiomniBench-DA"):
    """Page through the whole file listing. One request caps out at 1000 entries and
    says so only in a `Link` header; asking for more answers HTTP 200 with a JSON
    object instead of a list. Both are silent, and both corrupt every count below."""
    url = (f"https://huggingface.co/api/datasets/{repo}"
           "/tree/main?recursive=true&limit=1000")
    out = []
    while url:
        with urllib.request.urlopen(url, timeout=120) as fh:
            page, link = json.load(fh), fh.headers.get("Link", "")
        if not isinstance(page, list):
            raise RuntimeError(f"tree endpoint did not return a listing: {page}")
        out += page
        nxt = re.search(r'<([^>]+)>;\s*rel="next"', link)
        url = nxt.group(1) if nxt else None
    return out

tree = hf_tree()
files = [e for e in tree if e["type"] == "file"]
tasks = sorted({e["path"].split("/")[0] for e in tree if e["path"].startswith("da-")},
               key=lambda t: (int(t.split("-")[1]), int(t.split("-")[2])))

# `da-<paper>-<task>`. The paper index is the provenance key; the task index is
# that paper's own numbering and is NOT dense in the public half.
by_paper = collections.defaultdict(list)
for t in tasks:
    _, paper, idx = t.split("-")
    by_paper[int(paper)].append(int(idx))

present = sorted(by_paper)
absent = [i for i in range(1, max(present) + 1) if i not in by_paper]

print(f"files {len(files)} | public tasks {len(tasks)} | source papers {len(present)}")
print(f"paper index present : {present}")
print(f"paper index absent  : {absent}")
print(f"tasks per paper     : min {min(map(len, by_paper.values()))} "
      f"max {max(map(len, by_paper.values()))}")
print()
print("task indices, first six papers (a gap means that task is in the held-out half):")
for p in present[:6]:
    idx = sorted(by_paper[p])
    print(f"  paper {p:<3} public {idx}   highest index {max(idx)}, {max(idx) - len(idx)} missing below it")
```

Run 2026-08-27:

```
files 766 | public tasks 50 | source papers 21
paper index present : [1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 24, 25, 26]
paper index absent  : [2, 7, 21, 22, 23]
tasks per paper     : min 1 max 4

task indices, first six papers (a gap means that task is in the held-out half):
  paper 1   public [3, 4]   highest index 4, 2 missing below it
  paper 3   public [4, 5]   highest index 5, 3 missing below it
  paper 4   public [1, 6, 7]   highest index 7, 4 missing below it
  paper 5   public [1, 3]   highest index 3, 1 missing below it
  paper 6   public [2, 5]   highest index 5, 3 missing below it
  paper 8   public [1, 2, 3]   highest index 3, 0 missing below it
```

**The public half is a subsample, not a prefix.** Twenty-one papers appear and five paper
indices (2, 7, 21, 22, 23) are absent entirely, so those papers' tasks are all held out.
Within the papers that do appear, task numbering is full of holes — paper 1 publishes tasks
3 and 4 and withholds 1 and 2.

The arithmetic reconciles, which is worth knowing because it tells you the numbering is dense
over the full corpus rather than arbitrary. Summing the highest public task index per paper
gives 95, so at least 45 tasks are withheld from papers that *do* appear; add one apiece for
the five papers with no public task and you are at 100, the paper's stated total.

Two consequences for anyone sampling from this. Tasks sharing a paper index share a source
study and usually share the data files themselves, so **they are not independent** — treat 50
tasks over 21 papers as an effective n closer to 21. And a paper contributing four public
tasks is over-represented relative to one contributing a single task.

### Two ways to mis-read the listing, both silent

Since every number on this page is derived from that one endpoint, it is worth knowing how it
lies. Neither failure raises, and neither shows up as a bad status code.

**It paginates at 1000 entries.** A plain request returns at most 1000 and puts the
continuation in a `Link: …; rel="next"` header. This repository holds 987 entries today, so a
single request happens to be complete — and would stop being complete the moment the
maintainers add a task, with no signal other than counts that quietly shrink.

**Raising `limit` makes it worse, not safer.** `limit=1001` and above answer **HTTP 200** with
a JSON *object* — `{"error": "✖ Invalid limit for index tree pagination"}` — rather than a
list. Code that trusts the status and calls `len()` on the result gets `1`, and every count
downstream collapses to nothing without an exception anywhere. The helper above rejects a
non-list response for exactly this reason.

One field that does *not* lie, checked because it easily could: `size` on an LFS-backed entry
is the real object size, not the ~130-byte pointer file. All 307 LFS entries carry both
figures and they agree, so the budget arithmetic below can use `size` directly.

## `tests/` is the answer key, and it is a prefix

Every task holds four things — the instruction, a task configuration, an environment, and the
graded material — and the graded material is segregated by directory rather than by
convention. That turns "remember not to look" into a one-line path test.

*Continues from the block above — reuses `files`.*

```python
GRADED_PREFIX = "tests/"          # everything after the task directory

def part(path):
    seg = path.split("/")
    if len(seg) < 2 or not path.startswith("da-"):
        return "repo"
    return GRADED_PREFIX if seg[1] == "tests" else seg[1]

split = collections.Counter(part(e["path"]) for e in files)
graded = [e["path"] for e in files if part(e["path"]) == GRADED_PREFIX]

for k in sorted(split, key=lambda k: -split[k]):
    print(f"{split[k]:4}  {k}")
print()
print(f"graded files: {len(graded)}  "
      f"({len(set(p.split('/')[0] for p in graded))} tasks)")
print("basenames under tests/:",
      dict(collections.Counter(p.split("/")[-1] for p in graded)))
```

Run 2026-08-27:

```
 513  environment
 151  tests/
  50  instruction.md
  50  task.toml
   2  repo

graded files: 151  (50 tasks)
basenames under tests/: {'llm_judge.py': 50, 'rubric.txt': 50, 'test.sh': 50, 'llm_judge.cpython-312.pyc': 1}
```

**Filter on the prefix, never on the filenames.** Three names cover 150 of the 151 files; the
151st is a `__pycache__` artifact one task committed by accident, and a basename allowlist
sails straight past it. The path test catches it because it is still under `tests/`.

`rubric.txt` is the scoring key an expert wrote for that task. Reading one turns that task
into something you already know the answer to, which is a private cost. **Republishing one —
into a public repository, an issue, a blog post, a training corpus — is a shared cost**, and
it is permanent: the item stops measuring anything for everyone, and the maintainers cannot
un-publish it. The 50 held-out tasks exist precisely because this happens. Do not quote,
paraphrase, or commit rubric content anywhere it can be scraped.

One discrepancy to be aware of: the dataset card describes `tests/` as holding a *reference
trace*, a rubric and a judge harness, but only three file kinds ship. Either the reference
trace lives inside `rubric.txt` or it is not in the public release — treat the whole directory
as graded either way, which the prefix test already does.

## Tracing a task back to its paper

This is the benchmark's selling point and the place where the public release is thinnest.
**There is no machine-readable mapping from a task to its source publication anywhere in the
repository.** The card says the attribution lives inside each task's `instruction.md`, which
is behind the gate. From the open surface, the only provenance signal is the *filenames* of
the data files — and those were named by whoever downloaded them, not by a convention.

*Continues from the listing block — reuses `files`.*

```python
data = [e for e in files if "/environment/data/" in e["path"]]
tasks = sorted({e["path"].split("/")[0] for e in files if e["path"].startswith("da-")})

# Do NOT anchor these with \b -- accessions are followed by "_" in filenames such as
# GSE236581_counts.mtx, and "_" is a word character, so \b never matches there. That
# one habit cost 12 of the 13 GEO hits on the first pass.
PATTERNS = {
    "GEO":    re.compile(r"GS[EM]\d{5,9}"),
    "SRA":    re.compile(r"[SED]RR\d{5,9}"),
    "PRIDE":  re.compile(r"PXD\d{6}"),
    "TCGA":   re.compile(r"TCGA"),
    # Springer Nature supplementary files are named <journal>_<year>_<article>_MOESM<n>_ESM
    "SPRINGER": re.compile(r"(4\d{4})_(\d{4})_(\d{3,5})_MOESM"),
}

found = collections.defaultdict(set)
for e in data:
    name = e["path"].split("/")[-1]
    task = e["path"].split("/")[0]
    for kind, rx in PATTERNS.items():
        for m in rx.finditer(name):
            if kind == "SPRINGER":
                j, y, a = m.groups()
                # a Springer DOI ends in a check character the filename does not
                # carry, so this is a stem, not a resolvable DOI -- see the next block
                found[task].add((kind, f"10.1038/s{j}-0{y[2:]}-{int(a):05d}-?"))
            else:
                found[task].add((kind, m.group(0)))

print(f"tasks with a resolvable identifier in an open filename : {len(found)} / {len(tasks)}")
print(f"tasks with nothing to go on                            : {len(tasks) - len(found)}")
print(f"kinds seen: {sorted({k for v in found.values() for k, _ in v})}\n")
for t in sorted(found, key=lambda s: (int(s.split('-')[1]), int(s.split('-')[2]))):
    ids = sorted({v for _, v in found[t]})
    shown = ", ".join(ids[:3]) + (f" (+{len(ids) - 3} more)" if len(ids) > 3 else "")
    print(f"  {t:<9} {shown}")
```

Run 2026-08-27:

```
tasks with a resolvable identifier in an open filename : 16 / 50
tasks with nothing to go on                            : 34

kinds seen: ['GEO', 'SPRINGER', 'TCGA']

  da-1-3    GSE236581
  da-1-4    GSE236581
  da-4-1    GSE243013
  da-4-7    GSE243013
  da-11-1   GSM5820724, GSM5820725, GSM5820726 (+7 more)
  da-12-4   TCGA
  da-13-3   10.1038/s41591-025-04023-?
  da-13-5   10.1038/s41591-025-04023-?
  da-13-6   10.1038/s41591-025-04023-?
  da-16-1   GSE135251, GSM3998167, GSM3998168 (+214 more)
  da-19-3   GSM2715535, GSM2715536, GSM2715537 (+1 more)
  da-19-4   GSM2715535, GSM2715536, GSM2715537 (+1 more)
  da-19-6   GSM2715541, GSM2715542, GSM2715543 (+1 more)
  da-25-1   GSE118435, GSE120741, GSE126078 (+1 more)
  da-26-2   TCGA
  da-26-4   TCGA
```

**Sixteen of fifty. For the other thirty-four the open surface offers no identifier at all** —
`subspace_score_table.csv`, `paper_deg.xlsx`, `data_mutations.txt`, `Metadata.csv`. The three
largest files in the repository are `4118e166-34f5-4c1f-9eed-c64b90a3dace.h5ad`, 12.2 GB each;
that UUID is not a CELLxGENE Discover dataset id and resolves nowhere public. For those tasks
the paper is recoverable only from the gated `instruction.md`.

A few of the thirty-four leave a human-readable trail without a machine-readable one —
`da-9-1` ships `NatureMed_CyTOF_metadata.csv` alongside `PICI0002_ph2_clinical.csv`, which
names a journal and a trial identifier but matches no accession pattern. Worth a manual look;
not something to automate against.

So the provenance claim is true of the benchmark and only partly visible in what it ships. If
you need paper attribution across the whole set, plan on the gated route.

Where an identifier does exist, it resolves the rest of the way.

```python
import json, string, urllib.parse, urllib.request

def geo_to_paper(acc):
    """GEO accession -> series title and the PubMed id GEO records for it."""
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    uid = json.load(urllib.request.urlopen(
        f"{base}/esearch.fcgi?db=gds&retmode=json&term={acc}[ACCN]+AND+gse[ETYP]",
        timeout=60))["esearchresult"]["idlist"][0]
    rec = json.load(urllib.request.urlopen(
        f"{base}/esummary.fcgi?db=gds&retmode=json&id={uid}", timeout=60))["result"][uid]
    return rec["title"], rec.get("pubmedids") or []

def springer_stem_to_doi(stem):
    """A Springer supplementary filename gives every part of the DOI except its final
    check character. Ask Crossref about all 36 candidates in ONE OR-filtered request
    rather than probing a resolver 36 times -- anonymous callers get rate-limited, and
    a 429 mid-loop looks like a missing paper."""
    filt = ",".join(f"doi:{stem}-{c}" for c in string.digits + string.ascii_lowercase)
    url = ("https://api.crossref.org/works?rows=50&select=DOI,title,issued&filter="
           + urllib.parse.quote(filt, safe=":,./-"))
    req = urllib.request.Request(url, headers={"User-Agent": "biomnibench-provenance"})
    hits = json.load(urllib.request.urlopen(req, timeout=60))["message"]["items"]
    return hits[0] if len(hits) == 1 else None

title, pmids = geo_to_paper("GSE236581")            # from da-1-3 / da-1-4
print(f"da-1-3  GSE236581 -> PMID {pmids}")
print(f"          {title}")

hit = springer_stem_to_doi("10.1038/s41591-025-04023")   # from da-13-3 / -5 / -6
print(f"\nda-13-3 41591_2025_4023_MOESM2_ESM -> {hit['DOI']}")
print(f"          {hit['title'][0]} ({hit['issued']['date-parts'][0][0]})")
```

Run 2026-08-27:

```
da-1-3  GSE236581 -> PMID ['38981439']
          Spatiotemporal single-cell analysis decodes cellular dynamics underlying different responses to immunotherapy in Colorectal Cancer

da-13-3 41591_2025_4023_MOESM2_ESM -> 10.1038/s41591-025-04023-9
          Plasma proteome adaptations during feminizing gender-affirming hormone therapy (2025)
```

Two tasks, two papers, no account needed. The Springer route is the one worth keeping: a
supplementary filename like `41591_2025_4023_MOESM2_ESM` encodes journal, year and article
number but drops the DOI's trailing check character, and asking a resolver about all
thirty-six candidates in a single OR-filtered request is cheaper and more honest than
guessing. `41591` is Nature Medicine; the same scheme covers 41586 Nature, 41587 Nature
Biotechnology, 41588 Nature Genetics, 41467 Nature Communications.

Elsevier supplements have no equivalent. They are named `mmc1.xlsx`, `mmc2.csv` and so on,
carrying a supplement number and nothing about the article, so the eight such files spread
across five tasks contribute nothing to this — one of those five is only resolvable because a
sibling file happens to carry a GEO accession.

## Budget before you download

The dataset card declares `size_categories: n<1K`. That is a count of tasks, and reading it as
a size estimate is wrong by five orders of magnitude.

*Continues from the listing block — reuses `files`.*

```python
import statistics

GB = 1e9
on_disk = sum(e["size"] for e in files)
# `oid` is the content hash. Tasks built on the same paper ship the SAME blob under
# several task directories, so summing file sizes double-counts the transfer.
blobs = {e["oid"]: e["size"] for e in files}

per_task = collections.Counter()
for e in files:
    if e["path"].startswith("da-"):
        per_task[e["path"].split("/")[0]] += e["size"]

print(f"files {len(files)} -> {on_disk / GB:.1f} GB checked out")
print(f"distinct blobs {len(blobs)} -> {sum(blobs.values()) / GB:.1f} GB transferred")
print(f"largest single file: {max(e['size'] for e in files) / GB:.1f} GB")
print(f"per-file median: {statistics.median(e['size'] for e in files) / 1e3:.0f} KB")
print()
print("heaviest tasks:")
for t, n in per_task.most_common(3):
    print(f"  {t:<9} {n / GB:6.1f} GB")
print("lightest tasks:")
for t, n in sorted(per_task.items(), key=lambda kv: kv[1])[:3]:
    print(f"  {t:<9} {n / 1e6:6.2f} MB")
print()
under = [t for t, n in per_task.items() if n < 100e6]
print(f"tasks under 100 MB: {len(under)} of {len(per_task)}")
```

Run 2026-08-27:

```
files 766 -> 82.9 GB checked out
distinct blobs 607 -> 37.1 GB transferred
largest single file: 19.2 GB
per-file median: 210 KB

heaviest tasks:
  da-1-3      19.3 GB
  da-1-4      19.3 GB
  da-17-5     12.2 GB

lightest tasks:
  da-4-6      0.16 MB
  da-9-1      0.17 MB
  da-12-2     0.30 MB

tasks under 100 MB: 35 of 50
```

**The card's quick-start pulls the whole repository, and the whole repository is 83 GB on
disk.** The distribution is what makes that avoidable: the median file is 210 KB and 35 of the
50 tasks fit under 100 MB each, while two tasks alone account for nearly half the total. Take
tasks, not the repo.

The 83 / 37 gap is deduplication, and it is specific to how this dataset is laid out. Tasks
sharing a paper ship byte-identical copies of the same inputs under separate directories — 766
files over 607 distinct blobs — so content-addressed transfer moves 37 GB and your filesystem
still holds 83. Size an available-space check against the larger figure.

Data files are not laid out flat, either. Of 463 files under `environment/data/`, 130 sit
directly in that directory and 333 are nested one to three levels below it, so walk what
lands rather than constructing paths.

## Get the files

Two routes, and the first needs no account.

**The catalogue.** Everything above, written to disk as two tables — one row per file with the
graded material flagged, one row per task with its size and any identifiers found. This is
enough to choose a task, budget the download, and record what you took.

```python
import collections, csv, json, os, re, urllib.request

OUT = "Data/biomnibench-da"
os.makedirs(OUT, exist_ok=True)

def hf_tree(repo="phylobio/BiomniBench-DA"):
    """Paginating fetch — one request truncates at 1000 entries, and a larger `limit`
    returns an error object with HTTP 200 rather than a longer list."""
    url = (f"https://huggingface.co/api/datasets/{repo}"
           "/tree/main?recursive=true&limit=1000")
    out = []
    while url:
        with urllib.request.urlopen(url, timeout=120) as fh:
            page, link = json.load(fh), fh.headers.get("Link", "")
        if not isinstance(page, list):
            raise RuntimeError(f"tree endpoint did not return a listing: {page}")
        out += page
        nxt = re.search(r'<([^>]+)>;\s*rel="next"', link)
        url = nxt.group(1) if nxt else None
    return out

files = [e for e in hf_tree() if e["type"] == "file"]

ACC = re.compile(r"GS[EM]\d{5,9}|[SED]RR\d{5,9}|PXD\d{6}|TCGA|(?:4\d{4})_\d{4}_\d{3,5}_MOESM")

rows, per_task = [], collections.defaultdict(lambda: {"data": 0, "bytes": 0, "acc": set()})
for e in files:
    p = e["path"]
    task = p.split("/")[0] if p.startswith("da-") else ""
    graded = task and p.split("/")[1] == "tests"
    rows.append({"task": task, "path": p, "bytes": e["size"],
                 "graded": int(bool(graded)), "lfs": int("lfs" in e)})
    if task:
        t = per_task[task]
        t["bytes"] += e["size"]
        if "/environment/data/" in p:
            t["data"] += 1
            t["acc"].update(m.group(0) for m in ACC.finditer(p.split("/")[-1]))

with open(f"{OUT}/files.tsv", "w", newline="") as fh:
    w = csv.DictWriter(fh, rows[0].keys(), delimiter="\t")
    w.writeheader(); w.writerows(rows)

with open(f"{OUT}/tasks.tsv", "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["task", "paper", "data_files", "bytes", "identifiers"])
    for t in sorted(per_task, key=lambda s: (int(s.split("-")[1]), int(s.split("-")[2]))):
        v = per_task[t]
        w.writerow([t, t.split("-")[1], v["data"], v["bytes"], ",".join(sorted(v["acc"]))])

print(f"{OUT}/files.tsv   {len(rows)} rows "
      f"({sum(r['graded'] for r in rows)} flagged graded)")
print(f"{OUT}/tasks.tsv   {len(per_task)} rows")
print(f"smallest complete task: "
      f"{min(per_task, key=lambda t: per_task[t]['bytes'])} "
      f"({min(v['bytes'] for v in per_task.values()) / 1e3:.0f} KB)")
```

Run 2026-08-27:

```
Data/biomnibench-da/files.tsv   766 rows (151 flagged graded)
Data/biomnibench-da/tasks.tsv   50 rows
smallest complete task: da-4-6 (156 KB)
```

**The data itself.** This needs the account and the accepted terms from the section at the
top. The client comes from the Hub's own package.

```bash
python3 -m venv .venv
./.venv/bin/pip install "huggingface_hub>=0.36"
```

Then pull one task, without its answer key. `da-4-6` is the smallest complete task at 156 KB,
which makes it the right one to prove the path with before committing to a 19 GB task.

```bash
export HF_TOKEN=hf_...        # a read token from an account that accepted the terms

./.venv/bin/hf download phylobio/BiomniBench-DA \
  --repo-type dataset \
  --include "da-4-6/*" \
  --exclude "*/tests/*" \
  --local-dir Data/biomnibench-da
```

Without an approved account that command stops at `Error: Access denied. This repository
requires approval.` — it does not partially download.

**Check the filter rather than trusting it**, because a glob that silently matches nothing
looks exactly like a glob that works. This runs the real 766-path listing through the same
function the downloader uses, so it answers the question without needing the account. Run it
with the interpreter from the environment above — `./.venv/bin/python` — since it imports the
Hub package rather than reaching the network for a client.

*Continues from the block above — reuses `files`.*

```python
from huggingface_hub.utils import filter_repo_objects

paths = [e["path"] for e in files]

def graded(p):
    return p.startswith("da-") and p.split("/")[1] == "tests"

for inc, exc, label in [(["da-4-6/*"], None,           "include only"),
                        (["da-4-6/*"], ["*/tests/*"],  "include + exclude"),
                        (None,         ["*/tests/*"],  "whole repo, minus graded")]:
    kept = list(filter_repo_objects(paths, allow_patterns=inc, ignore_patterns=exc))
    print(f"{label:26} kept {len(kept):4}   graded present {sum(map(graded, kept))}")
```

Run 2026-08-27:

```
include only               kept    7   graded present 3
include + exclude          kept    4   graded present 0
whole repo, minus graded   kept  615   graded present 0
```

`--include` alone brings the rubric down with everything else — three of the seven files in
`da-4-6` are graded material. Adding the exclusion drops exactly those, and repo-wide it drops
exactly 151, which is the count from the split above. That agreement is the point: the numbers
are derived independently and they match.

## What this skill will not do

It stops at the data. It does not answer tasks, read rubrics, run the judge, or stand up the
evaluation environment. Each task ships a `task.toml` for the Harbor runner
(`harbor-framework/harbor`, Apache-2.0) and a per-task Dockerfile, and the default verifier
calls a commercial LLM as judge, so a scored run needs a container runtime and a paid API key
on top of the dataset access described here. That path is out of scope.

The boundary is deliberate rather than cautious. Fetching and cataloguing a benchmark is safe
and useful. Wiring an agent to the rubric that scores it is how a benchmark stops measuring
anything — and with half this one already held back for exactly that reason, the public half
is the part that can still be spent.

## Try it

**Data.** The BiomniBench-DA file listing and dataset card on Hugging Face
(`phylobio/BiomniBench-DA`), CC-BY-4.0. Both are served without an account; the task files
behind them are not, and this block asserts that boundary rather than assuming it. Last
confirmed reachable 2026-08-27.

**Run.** Standard library only, no token, no install.

```python
import collections, json, re, urllib.error, urllib.request

REPO = "phylobio/BiomniBench-DA"
TREE = f"https://huggingface.co/api/datasets/{REPO}/tree/main?recursive=true"
CARD = f"https://huggingface.co/datasets/{REPO}/resolve/main/README.md"
TASK = f"https://huggingface.co/datasets/{REPO}/resolve/main/da-1-3/task.toml"

def status(url):
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:      # 401 RAISES here -- it is not a falsy return
        return e.code

# The gate, tested rather than asserted. Card and listing are public; files are not.
print(f"card / tree / task file       : {status(CARD)} / {status(TREE)} / {status(TASK)}")
assert status(TASK) == 401, "task files are no longer gated — recheck the access section"

def hf_tree():
    """Paginating fetch. A single request caps at 1000 entries and reports the rest only
    in a `Link` header, and `limit` above 1000 answers 200 with an error OBJECT."""
    url, out = TREE + "&limit=1000", []
    while url:
        with urllib.request.urlopen(url, timeout=120) as fh:
            page, link = json.load(fh), fh.headers.get("Link", "")
        assert isinstance(page, list), f"tree endpoint did not return a listing: {page}"
        out += page
        nxt = re.search(r'<([^>]+)>;\s*rel="next"', link)
        url = nxt.group(1) if nxt else None
    return out

tree = hf_tree()
files = [e for e in tree if e["type"] == "file"]
assert all({"type", "path", "oid", "size"} <= set(e) for e in tree), "tree schema moved"

tasks = sorted({e["path"].split("/")[0] for e in tree if e["path"].startswith("da-")})
rel = collections.defaultdict(set)
for e in files:
    if e["path"].startswith("da-"):
        rel[e["path"].split("/")[0]].add(e["path"].split("/", 1)[1])

CANON = {"instruction.md", "task.toml", "environment/Dockerfile"}
missing = {t: sorted(CANON - rel[t]) for t in tasks if CANON - rel[t]}
assert not missing, f"task missing a canonical file: {missing}"
assert all(any(r.startswith("environment/data/") for r in rel[t]) for t in tasks), \
    "a task ships no data"

graded = [e for e in files if e["path"].startswith("da-")
          and e["path"].split("/")[1] == "tests"]
per_task = collections.Counter(e["path"].split("/")[0] for e in graded)
assert all(per_task[t] >= 3 for t in tasks), "a task ships no graded material"
# Prefix, not basename. One task commits a __pycache__ artifact under tests/, so a
# three-name allowlist leaks a file that a `tests/` prefix catches.
assert len({p["path"].split("/")[-1] for p in graded}) == 4, \
    "the set of filenames under tests/ changed"

blobs = {e["oid"]: e["size"] for e in files}
papers = {t.split("-")[1] for t in tasks}
print(f"files / tasks / source papers : {len(files)} / {len(tasks)} / {len(papers)}")
print(f"graded files under tests/     : {len(graded)}")
print(f"bytes on disk / transferred   : {sum(e['size'] for e in files) / 1e9:.1f} GB"
      f" / {sum(blobs.values()) / 1e9:.1f} GB")
print(f"tasks under 100 MB            : "
      f"{sum(1 for t in tasks if sum(e['size'] for e in files if e['path'].startswith(t + '/')) < 100e6)}")
print("all assertions passed")
```

**Expect.**

Invariants — these hold whatever the maintainers republish, and a failure means this page is
wrong rather than stale:

- **A task file returns 401, not 200 and not 404.** If it returns 200 the dataset has been
  ungated and the access section above needs rewriting; nothing here reads file contents
  either way.
- **Every task carries the same skeleton** — an instruction, a task configuration, a
  Dockerfile, at least one file under `environment/data/`, and at least three files under
  `tests/`. All 50 do today, and code that walks this corpus depends on it.
- **Every graded file sits under `tests/`.** The basenames are not a fixed set — one task
  already ships a fourth — so the prefix is the boundary and the assertion is on the prefix.
- The listing carries `oid` on every entry, which is what makes the deduplicated total
  computable without downloading anything.

Observed 2026-08-27 against the public release at revision `e1c8ca5` — these move when the
maintainers revise the release, so treat a mismatch as drift to investigate:

```
card / tree / task file       : 200 / 200 / 401
files / tasks / source papers : 766 / 50 / 21
graded files under tests/     : 151
bytes on disk / transferred   : 82.9 GB / 37.1 GB
tasks under 100 MB            : 35
all assertions passed
```

## Sources

- BiomniBench — Qu et al., *BiomniBench — process-level evaluation of LLM agents for
  real-world biomedical research*, bioRxiv
  [10.64898/2026.05.12.724604](https://doi.org/10.64898/2026.05.12.724604) (2026), CC-BY.
  Describes 100 tasks; the public release is 50.
- Dataset — [`phylobio/BiomniBench-DA`](https://huggingface.co/datasets/phylobio/BiomniBench-DA),
  CC-BY-4.0, gated with automatic approval.
- Runner — [`harbor-framework/harbor`](https://github.com/harbor-framework/harbor),
  Apache-2.0. Named because `task.toml` targets it; running it is out of scope here.

CC-BY-4.0 covers the benchmark's own contribution. The data inside each task came from a
published study and keeps that study's terms, so check the source before redistributing
anything you pull out of a task directory.
