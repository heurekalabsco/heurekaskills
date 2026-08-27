---
name: ena
description: Find and download public sequencing runs from the European Nucleotide Archive — search 44 million runs by study, organism, instrument, library strategy or date, then get every FASTQ URL together with its exact size and MD5 in the same call, so the transfer can be totalled and refused or subset before a byte moves. Resolves SRA and DDBJ accessions too.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [ena, fastq, sra, sequencing-reads, public-data]
covers: [ena, european nucleotide archive, insdc, sra, ddbj, fastq, sequencing reads, raw reads, run accession, srr, err, drr, bioproject, prjna, prjeb, wgs, rna-seq, chip-seq, atac-seq, amplicon, 16s, metagenome, nanopore, pacbio, illumina, novaseq, ebola, human, mouse, download]
papers: [PMID:41335099, PMID:39558171, PMID:37956313, PMID:25214632, PMID:26091036]
access: [open]
datasets: [https://www.ebi.ac.uk/ena/portal/api/results?format=tsv, https://www.ebi.ac.uk/ena/portal/api/returnFields?result=read_run&format=tsv, https://www.ebi.ac.uk/ena/portal/api/filereportcount?accession=PRJNA257197&result=read_run, https://www.ebi.ac.uk/ena/portal/api/filereport?accession=SRR1972616&result=read_run&fields=fastq_ftp&format=tsv, https://www.ebi.ac.uk/ena/portal/api/filereport?accession=DRR057058&result=read_run&fields=fastq_bytes&format=tsv, https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR197/006/SRR1972616/SRR1972616_1.fastq.gz, https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR197/006/SRR1972616/SRR1972616_2.fastq.gz, https://ftp.sra.ebi.ac.uk/vol1/fastq/DRR057/DRR057058/DRR057058.fastq.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: ENA Portal API (ebi.ac.uk/ena/portal/api, read_run index built 2026-08-27 06:00) / ftp.sra.ebi.ac.uk over HTTPS / Python 3.13.7 standard library only / curl 8.7.1
  executed: 12
  unverified: 0
---
# European Nucleotide Archive

ENA is EMBL-EBI's node of the INSDC, which means it holds the same raw reads as NCBI's SRA
and DDBJ, under the same accessions, and serves them as ordinary files over HTTPS. On
2026-08-27 its `read_run` index carried **44,308,969 runs**.

Nothing here needs an account, an API key, or a licence click-through. INSDC's data policy
states that "no use restrictions or licensing requirements will be included in any sequence
data records, and no restrictions or licensing fees will be placed on the redistribution or
use of the database by any party." EMBL-EBI's Terms of Use (revised 5 February 2024) add no
restriction of their own. Human data that *would* need consent review is not in ENA at all —
it is deposited in the European Genome-phenome Archive, a different resource with a different
gate, and nothing in this skill touches it.

**The reason to come here rather than to SRA is one field.** A single `filereport` call
returns the file URLs *and* `fastq_bytes` beside them, so the size of a transfer is known
before it starts. SRA's own tooling reaches the same reads through `sra-tools` and a local
prefetch cache, which commits to the download in order to discover how big it was. Here you
can total 891 runs, see 175 GB, and decide.

Make that step mandatory. The download function below takes a byte budget and refuses the
whole run rather than truncating it.

## The one call

```bash
curl -s "https://www.ebi.ac.uk/ena/portal/api/filereport?accession=SRR1972616&result=read_run&fields=run_accession,library_layout,read_count,base_count,fastq_ftp,fastq_bytes,fastq_md5&format=tsv"
```

```
run_accession	library_layout	read_count	base_count	fastq_ftp	fastq_bytes	fastq_md5
SRR1972616	PAIRED	2737	552874	ftp.sra.ebi.ac.uk/vol1/fastq/SRR197/006/SRR1972616/SRR1972616_1.fastq.gz;ftp.sra.ebi.ac.uk/vol1/fastq/SRR197/006/SRR1972616/SRR1972616_2.fastq.gz	221771;189518	609b9133b8fa45b6c7828a42f41f0e98;a20b03a336e56b90ae3e36ecafafd6e2
```

That one row carries the three traps this whole skill is organised around:

1. **`fastq_ftp` has no URL scheme.** It is a bare host-and-path. Passing it to a fetcher
   fails in a way that reads like a DNS or network error rather than a formatting one.
2. **Every file field is a semicolon-separated list**, and its length is not implied by
   `library_layout`. Two here; one, three or six elsewhere.
3. **`fastq_bytes` is a `text` field, not a number**, precisely because of (2). It has to be
   split before it can be summed.

`accession=` accepts a run (`SRR…`/`ERR…`/`DRR…`), an experiment, a sample, a study
(`SRP…`/`ERP…`/`DRP…`) or a BioProject (`PRJNA…`/`PRJEB…`/`PRJDB…`), and expands it to every
run underneath. That expansion is why the next section exists.

## A client

Errors come back as 4xx with a body that names exactly what was wrong. `urllib` throws that
body away unless you read it, and the resulting message — `HTTP Error 400: Bad Request` —
is useless. Read it.

```python
import json, urllib.error, urllib.parse, urllib.request

API = "https://www.ebi.ac.uk/ena/portal/api"


def portal(endpoint, **params):
    """One ENA Portal API call, returned as text. On 4xx, raise with ENA's own message —
    which is specific ("Invalid column (fastq_bytes) has been provided in query") and is
    thrown away by every default urllib error path."""
    params.setdefault("format", "tsv")
    url = f"{API}/{endpoint}?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=600) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace").strip()
        raise RuntimeError(f"HTTP {e.code} from /{endpoint} — {detail}") from None


def table(text):
    """A TSV report as a list of dicts. An empty report is a HEADER ROW AND NOTHING ELSE.
    That is not an error and does not raise — it is what an accession ENA has never seen,
    or one that is still private, looks like. Check for it explicitly."""
    lines = text.splitlines()
    if not lines:
        return []
    head = lines[0].split("\t")
    return [dict(zip(head, ln.split("\t"))) for ln in lines[1:] if ln]


for row in table(portal("results")):
    if row["resultId"] in ("read_run", "read_experiment", "read_study", "analysis", "sample"):
        print(f"{row['resultId']:<17} {int(row['recordCount']):>12,}  updated {row['lastUpdated']}")
```

```
analysis            25,825,460  updated 2026-08-26 18:00
read_experiment     44,308,969  updated 2026-08-27 06:00
read_run            44,308,969  updated 2026-08-27 06:00
sample              59,345,791  updated 2026-08-27 04:00
read_study          44,308,969  updated 2026-08-27 06:00
```

`/results` lists 15 result types. Four matter for reads:

| `result=` | one row per | use it for |
|---|---|---|
| `read_run` | **run** | the reads themselves — this is the default answer |
| `read_experiment` | experiment | library-level metadata; still carries the run's file columns |
| `read_study` | study × run | grouping runs under their study without a second call |
| `analysis` | analysis object | what a submitter *derived* — BAM, CRAM, VCF, assemblies |

`analysis` is the one people miss. It is a separate namespace (`ERZ…`) with its own file
columns — `submitted_ftp` for what was uploaded and `generated_ftp` for what ENA built — and
a study's aligned BAMs live there, not under `read_run`.

## Turning a row into files

Everything downstream needs the semicolon lists unpacked and checked against each other.

```python
FILE_SOURCES = ("fastq", "submitted", "sra")
RUN_FIELDS = ("run_accession,experiment_accession,sample_accession,study_accession,"
              "scientific_name,instrument_platform,instrument_model,library_strategy,"
              "library_layout,read_count,base_count,"
              "fastq_ftp,fastq_bytes,fastq_md5,"
              "submitted_ftp,submitted_bytes,submitted_md5,submitted_format,"
              "sra_ftp,sra_bytes,sra_md5,first_public")


def files_of(row):
    """Every downloadable file in one run row as (url, bytes, md5, source).

    The three lists in a source are positionally aligned, so they are zipped rather than
    read independently — and the lengths are asserted, because a silent mis-zip pairs a
    URL with another file's checksum and only shows up as a corrupt download."""
    out = []
    for src in FILE_SOURCES:
        paths = [p for p in row.get(f"{src}_ftp", "").split(";") if p]
        sizes = [b for b in row.get(f"{src}_bytes", "").split(";") if b]
        md5s = [m for m in row.get(f"{src}_md5", "").split(";") if m]
        if len(sizes) != len(paths) or (md5s and len(md5s) != len(paths)):
            raise ValueError(f"{row['run_accession']}: {src} lists disagree — "
                             f"{len(paths)} paths, {len(sizes)} sizes, {len(md5s)} md5s")
        for i, p in enumerate(paths):
            # The scheme is missing from the report and https:// is the one to add.
            out.append(("https://" + p, int(sizes[i]), md5s[i] if md5s else None, src))
    return out


def runs(accession, **kw):
    """Every run under any accession — run, experiment, sample, study or BioProject."""
    return table(portal("filereport", accession=accession, result="read_run",
                        fields=RUN_FIELDS, **kw))


rows = runs("PRJNA257197")
total = sum(b for r in rows for _, b, _, _ in files_of(r))
nfiles = sum(len(files_of(r)) for r in rows)
print(f"PRJNA257197: {len(rows)} runs, {nfiles} files, {total:,} bytes = {total / 1e9:.2f} GB")
print("smallest run:", min(rows, key=lambda r: sum(b for _, b, _, _ in files_of(r)))["run_accession"])
```

```
PRJNA257197: 891 runs, 1782 files, 175,649,401,521 bytes = 175.65 GB
smallest run: SRR1972616
```

Two calls, no transfer, and the decision is already made: 175 GB for the study, or 411 KB
for the smallest run in it.

**Ask for the count first when the accession might be large.** `/filereportcount` takes the
same `accession` and `result` and returns one integer, so a 58,869-row report is a choice
rather than a surprise:

```python
def run_count(accession):
    return int(table(portal("filereportcount", accession=accession, result="read_run"))[0]["count"])


for acc in ("SRR1972616", "PRJNA257197", "PRJNA63443"):
    print(f"{acc:<13} {run_count(acc):>7,} runs")
```

```
SRR1972616          1 runs
PRJNA257197       891 runs
PRJNA63443     58,869 runs
```

`PRJNA63443` is the shape to watch for. It is an **umbrella BioProject**: 58,869 runs
spanning 23 distinct study titles, 56.28 TB of FASTQ, of which 56,341 runs belong to a single
child study (`SRP012412`, ENCODE). An accession that looks like one experiment in a paper's
data-availability statement can expand to a consortium. Count before you report, and read
`study_title` and `secondary_study_accession` off the rows before you treat them as one
experiment.

## `library_layout` does not tell you how many files there are

This is the assumption that silently loses data, and it is worth stating as a measurement
rather than a warning. Sampling 5,000 runs with `library_layout="PAIRED"` on 2026-08-27:

| fastq files | runs | what it is |
|---|---|---|
| 2 | 4,502 | the expected `_1` / `_2` pair |
| 1 | 386 | declared paired, published as one file |
| **3** | **104** | `_1`, `_2`, **and** a third file of unpaired reads |
| 0 | 8 | no FASTQ at all — see the next section |

The same holds going the other way. Across a deliberately awkward sample of 28 runs on
2026-08-27 — LS454 through PromethION, 2008 submissions through 2024, viral to human — the
combinations seen were `PAIRED` with two FASTQ files (13 runs), `PAIRED` with three (4),
`SINGLE` with one (4) and `SINGLE` with **none** (7, all PacBio, data under `submitted_ftp`).

The three-file case is the dangerous one, because of the order the list comes in:

```python
d = runs("DRR057058")[0]
print(d["library_layout"], "| read_count", d["read_count"], "| base_count", d["base_count"])
for url, size, _, _ in files_of(d):
    print(f"  {size:>9,}  {url.rsplit('/', 1)[1]}")
```

```
PAIRED | read_count 3809 | base_count 2287421
         63  DRR057058.fastq.gz
    527,683  DRR057058_1.fastq.gz
    724,182  DRR057058_2.fastq.gz
```

**The unpaired file sorts first.** `fastq_ftp.split(";")[0]` on this run returns a 63-byte
file holding **one read**, when `_1` and `_2` hold 3,808 each. Nothing errors; you simply
analyse one read out of 3,809 and the pipeline downstream reports an empty result. Take the
whole list, always, and never index into it.

Two invariants tie the numbers together and are worth asserting after a download:

- **`read_count` = reads in `_1` + reads in the unpaired file.** 3,808 + 1 = 3,809 here;
  2,737 + 0 = 2,737 for `SRR1972616`. It counts fragments, not mates.
- **`base_count` = bases across *all* the run's FASTQ files.** 1,145,082 + 1,142,323 + 16 =
  2,287,421 exactly.

## When `fastq_ftp` is empty

ENA generates FASTQ from what was submitted. Where it cannot — PacBio HDF5 or unaligned BAM,
some Nanopore submissions — `fastq_ftp` is blank and the data is under `submitted_ftp`, in
whatever format the submitter sent.

```python
for acc in ("ERR1016522", "SRR23922663"):
    r = runs(acc)[0]
    fs = files_of(r)
    print(f"{acc}  {r['instrument_model']}  fastq={sum(1 for f in fs if f[3] == 'fastq')} "
          f"submitted={sum(1 for f in fs if f[3] == 'submitted')} "
          f"sra={sum(1 for f in fs if f[3] == 'sra')}  "
          f"formats={r['submitted_format'] or '-'}  "
          f"total={sum(b for _, b, _, _ in fs) / 1e9:.1f} GB")
```

```
ERR1016522  PacBio RS  fastq=0 submitted=5 sra=0  formats=PACBIO_HDF5;PACBIO_HDF5;PACBIO_HDF5;PACBIO_HDF5;PACBIO_HDF5  total=7.9 GB
SRR23922663  Sequel II  fastq=0 submitted=6 sra=0  formats=BAM;BAM;BAM;BAM;BAM;BAM  total=494.9 GB
```

`SRR23922663` is a single run holding 494.9 GB in six BAMs. It is exactly the case the
size-first rule exists for.

Three things this section corrects:

- **`sra_ftp` is, in practice, always empty.** It appears in `returnFields` and is a natural
  thing to build a fallback on. Across 11,000 runs sampled on 2026-08-27 — recent WGS,
  pre-2012 submissions, Nanopore, ATAC-seq, and 3,000 rows of `PRJNA63443` — it was populated
  **zero** times. Treat `submitted_ftp` as the only real alternate and do not let a
  `sra_ftp` branch decide whether a run is fetchable.
- **`read_count` is 0 for these runs**, because ENA never parsed the submitted files. A
  `read_count` of 0 does not mean the run is empty.
- **A run with no files at all does exist.** Registered rows with `read_count` 0 and every
  file field blank turned up 22 times in 2,000 sampled Nanopore runs. `files_of()` returns an
  empty list for them; check for that before reporting a run as available.

## Finding runs you do not have an accession for

`/search` takes a `query` in ENA's own grammar. `/count` takes the identical query and
returns one integer — run it first, always, because there is no pagination to save you.

```bash
BASE=https://www.ebi.ac.uk/ena/portal/api
Q='tax_tree(9606) AND library_strategy="ATAC-seq" AND first_public>=2024-01-01'

# How many, before asking for any of them.
curl -s -G "$BASE/count" --data-urlencode "query=$Q" -d result=read_run

# And a breakdown by a controlled field — still without fetching a row.
curl -s -G "$BASE/count" --data-urlencode "query=$Q" -d result=read_run -d field=library_layout
```

```
count
33717
library_layout	count
paired	29353
single	4364
```

`/count` with `field=` is the cheapest way to see the shape of a result set, and it works on
any controlled-value field — `instrument_model` on that query splits 33,717 runs across 31
models, the largest being `illumina novaseq 6000` at 16,017. Note the values come back
**lowercased** there while the query grammar needs the vocabulary's own capitalisation.

The grammar in full:

| form | example | note |
|---|---|---|
| equality | `library_strategy="ATAC-seq"` | **values need double quotes**; unquoted is a parse error |
| comparison | `read_count>=1000000`, `first_public>=2024-01-01` | numbers and dates |
| ranges | `base_count>=1000000000 AND base_count<=5000000000` | no `BETWEEN` |
| boolean | `AND`, `OR`, `NOT`, parentheses | uppercase |
| taxonomy | `tax_eq(9606)`, `tax_tree(9606)` | id only, never a name |
| geospatial | `geo_box1(…)`, `geo_circle(…)` | environmental sampling |

`tax_eq` matches that taxon exactly; `tax_tree` includes everything below it. For a species
the difference is small — human, 7,718,826 against 7,720,589 runs — and for a clade it is the
whole question: on 2026-08-27 `tax_tree(2)` (Bacteria) matched 4,119,422 runs and `tax_eq(2)`
matched **3,510**, those annotated at the kingdom node itself. There is no name-based taxonomy
operator; resolve the name to an id first (`result=taxon` does this).

Controlled fields have a fixed vocabulary, and `/controlledVocab?field=…` is the authoritative
list — `library_strategy` has 41 values with capitalisation that is not guessable (`ATAC-seq`,
`ChIP-Seq`, `Bisulfite-Seq`, `RNA-Seq`, `WGS`, `Hi-C`). Guessing `atac-seq` returns zero rows
with no error.

### The fields you can return are not the fields you can search

```python
ret = {r["columnId"] for r in table(portal("returnFields", result="read_run"))}
srch = {r["columnId"] for r in table(portal("searchFields", result="read_run"))}
print(f"{len(ret)} returnable, {len(srch)} searchable, {len(ret - srch)} returnable-only")
print("returnable-only, file-related:",
      sorted(c for c in ret - srch if c.endswith(("_ftp", "_bytes", "_md5"))))
try:
    portal("search", result="read_run", query="fastq_bytes>0", fields="run_accession", limit=1)
except RuntimeError as e:
    print(e)
```

```
195 returnable, 160 searchable, 35 returnable-only
returnable-only, file-related: ['bam_bytes', 'bam_ftp', 'bam_md5', 'fastq_bytes', 'fastq_ftp', 'fastq_md5', 'sra_bytes', 'sra_ftp', 'sra_md5', 'submitted_bytes', 'submitted_ftp']
HTTP 400 from /search — Invalid column (fastq_bytes) has been provided in query
```

**Every file column is returnable and none of them is searchable.** So "find me runs smaller
than 1 GB" is not a query — it is a query on `read_count` or `base_count`, which *are*
searchable, followed by a filter on the returned `fastq_bytes`. Plan for the report to come
back larger than the set you want.

### There is no pagination

`limit` caps the rows. There is no `offset`, and asking for one is a hard error rather than a
silently ignored parameter:

```python
for label, call in (
    ("offset=100", lambda: portal("search", result="read_run", query='study_accession="PRJNA257197"',
                                  fields="run_accession", limit=10, offset=100)),
    ("bogus field", lambda: portal("filereport", accession="SRR1972616", result="read_run",
                                   fields="run_accession,not_a_field")),
):
    try:
        call()
        print(f"{label:<12} no error")
    except RuntimeError as e:
        print(f"{label:<12} {e}")

# An accession ENA does not have is NOT an error: 200, header row, no data.
empty = portal("filereport", accession="PRJNA000000", result="read_run", fields="run_accession")
print("unknown accession ->", repr(empty), "->", len(table(empty)), "rows")

# An UNRECOGNISED parameter, by contrast, is silently ignored.
print("bogus param  ->", len(table(portal("search", result="read_run",
                                          query='study_accession="PRJNA257197"',
                                          fields="run_accession", limit=3, nonsense="x"))), "rows")
```

```
offset=100   HTTP 400 from /search — Unsupported param offset
bogus field  HTTP 400 from /filereport — Invalid fieldName(s) supplied: not_a_field
unknown accession -> 'run_accession\n' -> 0 rows
bogus param  -> 3 rows
```

Three consequences.

**Omitting `limit` returns the entire result set.** The interactive API documentation shows a
default of 10, which is a form default for that page and not the server's behaviour: an
unbounded `read_run` search for human WGS streamed 1,184,788 rows on 2026-08-27. `/count`
first, every time.

**A result set too large to hold has to be split by query, not by page.** Slice on
`first_public` date windows, or on `study_accession`, and check `/count` for each slice.

**Row order is not stable between identical calls, and there is no sort parameter.** Three
consecutive identical `filereport` calls for `PRJNA63443` on 2026-08-27 returned
`SRR013732`, `SRR013514` and `SRR013514` as the first data row. So `limit=1` is not "the
first run", `limit=N` is an arbitrary N of them, and any listing you intend to compare
against a later one has to be sorted client-side on an accession.

For a long list of specific accessions, `GET` runs out of URL. `POST /search` takes the same
parameters as form fields, and `includeAccessions` takes the list:

```python
def post_search(**params):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f"{API}/search", data=data)
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read().decode("utf-8", "replace")


picked = ["SRR1972616", "SRR1735177", "DRR057058", "ERR1016522"]
got = table(post_search(result="read_run", includeAccessions=",".join(picked),
                        fields="run_accession,instrument_platform,fastq_bytes", format="tsv"))
for r in sorted(got, key=lambda r: r["run_accession"]):        # sort: the API's order is not stable
    print(f"  {r['run_accession']:<12} {r['instrument_platform']:<12} {r['fastq_bytes'] or '(no fastq)'}")
```

```
  DRR057058    ILLUMINA     63;527683;724182
  ERR1016522   PACBIO_SMRT  (no fastq)
  SRR1735177   ILLUMINA     269625;237535
  SRR1972616   ILLUMINA     221771;189518
```

## Get the files

The output is a directory of reads with a manifest beside it recording where each file came
from, how big it was, and that its MD5 matched. The budget is a required argument, and the
function refuses the whole run rather than fetching part of it — a half-fetched paired run is
worse than none, because it looks complete.

```python
import hashlib, os


class Refused(RuntimeError):
    """The transfer was declined on its reported size, before anything moved."""


def fetch_run(accession, outdir="Data/ena", budget_bytes=1_000_000_000, sources=("fastq", "submitted")):
    """Download every file of ONE run, size-checked first, MD5-verified after.

    `budget_bytes` is checked against the run's own reported total, so a refusal happens
    before a connection is opened. An accession that expands to several runs is refused
    too — an earlier version took `rows[0]`, which on a BioProject quietly downloaded one
    arbitrary run of 891 and reported success."""
    rows = runs(accession)
    if not rows:
        raise LookupError(f"{accession}: no run rows — unknown accession, or still private "
                          f"(ENA answers 200 with an empty report for both)")
    if len(rows) > 1:
        whole = sum(b for r in rows for _, b, _, _ in files_of(r))
        raise Refused(f"{accession} expands to {len(rows)} runs, {whole / 1e9:.2f} GB total — "
                      f"this fetches one run. Loop over the report's run_accession values "
                      f"with a budget for the total you actually want.")
    row = rows[0]
    picked = [f for f in files_of(row) if f[3] in sources]
    if not picked:
        raise LookupError(f"{accession}: registered but carries no files "
                          f"(read_count={row['read_count']}) — nothing to download")

    need = sum(b for _, b, _, _ in picked)
    if need > budget_bytes:
        raise Refused(f"{accession}: {need:,} bytes ({need / 1e9:.2f} GB) over the "
                      f"{budget_bytes:,} byte budget — {len(picked)} file(s). Raise the "
                      f"budget deliberately, or pick a smaller run.")

    dest_dir = os.path.join(outdir, accession)
    os.makedirs(dest_dir, exist_ok=True)
    manifest = {k: row[k] for k in ("run_accession", "study_accession", "sample_accession",
                                    "scientific_name", "instrument_model", "library_strategy",
                                    "library_layout", "read_count", "base_count", "first_public")}
    manifest["files"] = []
    for url, size, md5, src in picked:
        path = os.path.join(dest_dir, url.rsplit("/", 1)[1])
        urllib.request.urlretrieve(url, path)
        got = os.path.getsize(path)
        if got != size:
            raise IOError(f"{path}: {got:,} bytes on disk, report said {size:,}")
        digest = hashlib.md5(open(path, "rb").read()).hexdigest() if md5 else None
        if md5 and digest != md5:
            raise IOError(f"{path}: md5 {digest} != reported {md5}")
        manifest["files"].append({"url": url, "path": path, "bytes": got,
                                  "md5": md5, "md5_verified": bool(md5), "source": src})
        print(f"  {got:>10,} B  {path}  {'md5 ok' if md5 else 'no md5 published'}")

    with open(os.path.join(dest_dir, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
    return manifest


m = fetch_run("SRR1972616")
print(f"{m['run_accession']}: {len(m['files'])} files, {m['read_count']} fragments, "
      f"{m['base_count']} bases, {m['scientific_name']}")

for acc in ("PRJNA257197", "SRR23922663", "PRJNA000000"):
    try:
        fetch_run(acc)
    except (LookupError, Refused) as e:
        print(f"  {type(e).__name__}: {e}")
```

```
     221,771 B  Data/ena/SRR1972616/SRR1972616_1.fastq.gz  md5 ok
     189,518 B  Data/ena/SRR1972616/SRR1972616_2.fastq.gz  md5 ok
SRR1972616: 2 files, 2737 fragments, 552874 bases, Zaire ebolavirus
  Refused: PRJNA257197 expands to 891 runs, 175.65 GB total — this fetches one run. Loop over the report's run_accession values with a budget for the total you actually want.
  Refused: SRR23922663: 494,856,949,850 bytes (494.86 GB) over the 1,000,000,000 byte budget — 6 file(s). Raise the budget deliberately, or pick a smaller run.
  LookupError: PRJNA000000: no run rows — unknown accession, or still private (ENA answers 200 with an empty report for both)
```

Three refusals, no bytes transferred for any of them. For a whole study, total the report
first and then loop `fetch_run` over the `run_accession` values it gave you. Two more things
about the transfer itself:

**`ftp.sra.ebi.ac.uk` serves the same tree over HTTPS and supports byte ranges.** A `Range`
request returns `206`, so the first few hundred bytes of a 500 GB BAM are one cheap call —
enough to confirm a magic number or read a header before committing.

**Aspera is the alternative for very large transfers.** `fastq_aspera` carries the same paths
for an `ascp` client with the `era-fasp` user. It needs software HTTPS does not, so it is
worth reaching for at the terabyte scale and not below.

## Try it

A cold check that this skill still holds: it counts a study, totals it without transferring
it, refuses the total, takes the smallest run instead, verifies both mates by MD5, and
recomputes `read_count` and `base_count` from the bytes on disk. It then runs four
counter-examples that each break a rule the primary run obeys. Public data, no account, no
key, Python 3 standard library only. Transfers about 0.65 MB and takes under ten seconds.

**Data** — `SRR1972616`, one run of **PRJNA257197**, *Ebola virus epidemiology, transmission
and evolution during seven months in Sierra Leone* (Park et al., *Cell*, 2015; the project
also carries Gire et al., *Science*, 2014). Zaire ebolavirus RNA-seq on an Illumina HiSeq
2500, 2,737 fragments, two gzipped FASTQ files:

    https://www.ebi.ac.uk/ena/portal/api/filereportcount?accession=PRJNA257197&result=read_run
    https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR197/006/SRR1972616/SRR1972616_1.fastq.gz
    https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR197/006/SRR1972616/SRR1972616_2.fastq.gz

INSDC records carry no use restrictions and no licensing requirement, and ENA serves them
without an account. This run is used because it is the smallest in a large, published,
long-stable study — so the contrast between 175 GB and 411 KB is the point of the exercise
rather than a detail of it. The counter-examples are `DRR057058` (three FASTQ files for a
`PAIRED` run, the first of them 63 bytes), `ERR1016522` (PacBio, no FASTQ at all),
`PRJNA000000` (an accession ENA has never seen) and an `offset` parameter that does not
exist. Last confirmed reachable 2026-08-27.

```python
import gzip, hashlib, os, urllib.error, urllib.parse, urllib.request

API = "https://www.ebi.ac.uk/ena/portal/api"
FIELDS = ("run_accession,library_layout,read_count,base_count,"
          "fastq_ftp,fastq_bytes,fastq_md5,submitted_ftp,submitted_bytes,sra_ftp")


def portal(endpoint, **params):
    params.setdefault("format", "tsv")
    url = f"{API}/{endpoint}?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=600) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code < 500:                       # 4xx carries ENA's own explanation
                raise RuntimeError(f"HTTP {e.code} — "
                                   f"{e.read().decode('utf-8', 'replace').strip()}") from None
            if attempt == 3:
                raise
        except urllib.error.URLError:
            if attempt == 3:
                raise


def table(text):
    lines = text.splitlines()
    if not lines:
        return []
    head = lines[0].split("\t")
    return [dict(zip(head, ln.split("\t"))) for ln in lines[1:] if ln]


def files_of(row, src="fastq"):
    """(url, bytes, md5) per file. The scheme is missing and the lists are positional."""
    paths = [p for p in row.get(f"{src}_ftp", "").split(";") if p]
    sizes = [b for b in row.get(f"{src}_bytes", "").split(";") if b]
    md5s = [m for m in row.get(f"{src}_md5", "").split(";") if m]
    assert len(sizes) == len(paths), (len(paths), len(sizes))
    assert not md5s or len(md5s) == len(paths), (len(paths), len(md5s))
    return [("https://" + p, int(sizes[i]), md5s[i] if md5s else None)
            for i, p in enumerate(paths)]


def runs(acc):
    return table(portal("filereport", accession=acc, result="read_run", fields=FIELDS))


# 1. COUNT before reporting. One integer, no transfer.
n = int(table(portal("filereportcount", accession="PRJNA257197", result="read_run"))[0]["count"])
assert n > 100, n

# 2. REPORT the whole study and total it — still no read data moves.
study = runs("PRJNA257197")
assert len(study) == n, (len(study), n)
per_run = {r["run_accession"]: files_of(r) for r in study}
total = sum(b for fs in per_run.values() for _, b, _ in fs)
nfiles = sum(len(fs) for fs in per_run.values())

# 3. INVARIANTS on the report itself.
for r in study:
    assert r["run_accession"].startswith(("SRR", "ERR", "DRR")), r["run_accession"]
    for url, size, md5 in per_run[r["run_accession"]]:
        assert size > 0 and len(md5) == 32, (url, size, md5)
# The report NEVER carries a scheme — that is the trap the https:// above exists for.
assert all("://" not in r["fastq_ftp"] for r in study)
# No run in this study has an sra_ftp entry.
assert all(not r["sra_ftp"] for r in study)

# 4. REFUSE the study, take the smallest run instead.
smallest = min(per_run, key=lambda a: sum(b for _, b, _ in per_run[a]))
budget = 1_000_000
assert total > budget, "the study should be far over any sane budget"
assert sum(b for _, b, _ in per_run[smallest]) < budget

# 5. FETCH it, verify every byte and every checksum.
os.makedirs("Data/ena", exist_ok=True)
reads = bases = 0
for url, size, md5 in per_run[smallest]:
    path = os.path.join("Data/ena", url.rsplit("/", 1)[1])
    urllib.request.urlretrieve(url, path)
    assert os.path.getsize(path) == size, (path, os.path.getsize(path), size)
    assert hashlib.md5(open(path, "rb").read()).hexdigest() == md5, path
    with gzip.open(path, "rt") as fh:
        lines = fh.read().splitlines()
    assert len(lines) % 4 == 0, len(lines)
    reads += len(lines) // 4
    bases += sum(len(lines[i]) for i in range(1, len(lines), 4))

rec = [r for r in study if r["run_accession"] == smallest][0]
# base_count counts EVERY fastq file of the run; read_count counts fragments, not mates.
assert bases == int(rec["base_count"]), (bases, rec["base_count"])
assert reads == int(rec["read_count"]) * len(per_run[smallest]), (reads, rec["read_count"])

print(f"study runs      : {n}")
print(f"files / bytes   : {nfiles} / {total:,} = {total / 1e9:.2f} GB")
print(f"smallest run    : {smallest}  {sum(b for _, b, _ in per_run[smallest]):,} bytes")
print(f"downloaded      : {len(per_run[smallest])} files, {reads} reads, {bases} bases")
print(f"report says     : read_count {rec['read_count']}  base_count {rec['base_count']}")

# 6. COUNTER-EXAMPLE (a): a PAIRED run with THREE fastq files, the first 63 bytes.
d = runs("DRR057058")[0]
fs = files_of(d)
assert d["library_layout"] == "PAIRED" and len(fs) == 3, (d["library_layout"], len(fs))
assert fs[0][0].endswith("DRR057058.fastq.gz"), fs[0][0]      # the UNPAIRED file sorts first
url, size, md5 = fs[0]
path = os.path.join("Data/ena", url.rsplit("/", 1)[1])
urllib.request.urlretrieve(url, path)
assert hashlib.md5(open(path, "rb").read()).hexdigest() == md5
with gzip.open(path, "rt") as fh:
    orphan = len(fh.read().splitlines()) // 4
assert orphan == 1 and int(d["read_count"]) > 1000, (orphan, d["read_count"])
print(f"\nDRR057058       : {d['library_layout']}, {len(fs)} files, "
      f"[0] is {size} B holding {orphan} of {d['read_count']} reads")

# 7. COUNTER-EXAMPLE (b): no fastq at all — the data is under submitted_ftp.
p = runs("ERR1016522")[0]
assert files_of(p, "fastq") == [] and int(p["read_count"]) == 0
sub = files_of(p, "submitted")
assert len(sub) == 5, len(sub)
print(f"ERR1016522      : 0 fastq, read_count {p['read_count']}, "
      f"{len(sub)} submitted files, {sum(b for _, b, _ in sub) / 1e9:.1f} GB")

# 8. COUNTER-EXAMPLE (c): an unknown accession is 200 + header row, NOT an error.
blank = portal("filereport", accession="PRJNA000000", result="read_run", fields="run_accession")
assert blank.strip() == "run_accession" and table(blank) == []
print(f"PRJNA000000     : HTTP 200, {len(table(blank))} rows, body {blank!r}")

# 9. COUNTER-EXAMPLE (d): there is no pagination. offset is rejected, not ignored.
try:
    portal("search", result="read_run", query='study_accession="PRJNA257197"',
           fields="run_accession", limit=10, offset=100)
    raise AssertionError("offset should not be accepted")
except RuntimeError as e:
    assert "offset" in str(e), e
    print(f"offset=100      : {e}")
```

**Expect**

```
study runs      : 891
files / bytes   : 1782 / 175,649,401,521 = 175.65 GB
smallest run    : SRR1972616  411,289 bytes
downloaded      : 2 files, 5474 reads, 552874 bases
report says     : read_count 2737  base_count 552874

DRR057058       : PAIRED, 3 files, [0] is 63 B holding 1 of 3809 reads
ERR1016522      : 0 fastq, read_count 0, 5 submitted files, 7.9 GB
PRJNA000000     : HTTP 200, 0 rows, body 'run_accession\n'
offset=100      : HTTP 400 — Unsupported param offset
```

Invariants — true whatever ENA's index build date, so a failure here means the skill is
wrong rather than that upstream moved:

- `/filereportcount` and the row count of the matching `/filereport` agree exactly.
- **No value in `fastq_ftp` contains `://`.** The report is bare host-and-path, which is the
  reason every URL in this skill is built by prefixing `https://`.
- `fastq_ftp`, `fastq_bytes` and `fastq_md5` are semicolon lists of **equal length**, every
  size is positive, and every MD5 is 32 hex characters. They are positional; zipping them is
  the only correct read.
- Each downloaded file's size on disk equals its reported `fastq_bytes`, and its MD5 equals
  its reported `fastq_md5`.
- **`base_count` equals the bases summed over every FASTQ file of the run**, and
  **`read_count` counts fragments** — so a two-mate run yields `2 × read_count` records on
  disk.
- **`DRR057058` is `library_layout=PAIRED` with three files, and the unpaired one sorts
  first.** Taking `[0]` gets 1 read out of 3,809. `library_layout` is not a file count.
- **`ERR1016522` has no FASTQ and `read_count` 0, and five submitted files.** A blank
  `fastq_ftp` is not an absent run.
- **An accession ENA has never seen returns HTTP 200 with a header row and no data.** It is
  indistinguishable from a private one and is not an error.
- **`offset` is rejected with HTTP 400.** There is no pagination; an unrecognised parameter
  would instead be ignored silently.

Observed 2026-08-27, against the `read_run` index built that day — these move as ENA grows
and as records are revised, so a mismatch is drift to investigate, not a bug:

- `PRJNA257197` — 891 runs · 1,782 files · 175,649,401,521 bytes (175.65 GB)
- `SRR1972616` — 221,771 + 189,518 = 411,289 bytes · 2,737 fragments · 552,874 bases ·
  MD5 `609b9133…` / `a20b03a3…`
- `DRR057058` — 63 / 527,683 / 724,182 bytes · `read_count` 3,809 = 3,808 paired + 1 unpaired
  · `base_count` 2,287,421
- `ERR1016522` — 5 `PACBIO_HDF5` files, 7.9 GB · `SRR23922663` — 6 BAMs, 494.9 GB
- Registry sizes — `read_run` 44,308,969 · `analysis` 25,825,460 · `sample` 59,345,791 ·
  15 result types · 195 return fields and 160 search fields on `read_run`
- `PRJNA63443` — 58,869 runs across 23 study titles, 56.28 TB
- Of 5,000 sampled `PAIRED` runs — 4,502 with two FASTQ files, 386 with one, 104 with three,
  8 with none
- `tax_eq(9606)` 7,718,826 runs against `tax_tree(9606)` 7,720,589

## Sources

- Portal API parameter reference — https://www.ebi.ac.uk/ena/portal/api/api-docs
- Portal API browser — https://www.ebi.ac.uk/ena/portal/api/swagger-ui/index.html
- Programmatic access to ENA — https://ena-docs.readthedocs.io/en/latest/retrieval/programmatic-access.html
- INSDC data policy — https://www.insdc.org/policy/
- EMBL-EBI Terms of Use — https://www.ebi.ac.uk/about/terms-of-use/
- *The European Nucleotide Archive in 2025*, **Nucleic Acids Research** 54, D120-D127 (2026) —
  https://doi.org/10.1093/nar/gkaf1295
- Gire et al. (2014) *Science* 345, 1369-1372 — https://doi.org/10.1126/science.1259657
- Park et al. (2015) *Cell* 161, 1516-1526 — https://doi.org/10.1016/j.cell.2015.06.007

ENA records carry no licence and no use restriction. Credit belongs to the submitting
laboratory — `study_title`, `center_name` and the study's own publication are what to cite
when reads are reused.
