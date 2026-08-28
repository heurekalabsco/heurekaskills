---
name: smaht
description: Search and download SMaHT somatic mosaicism data — somatic variant calls, WGS and RNA-seq reads, and the donors, tissues and assays behind them. Walks donor to tissue to library to file and checks each file's tier before transferring. Cell-line benchmarking data is open with no account; every file from human tissue is protected under dbGaP, a route this skill describes rather than opens.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [smaht, somatic-mosaicism, public-data, controlled-access, dbgap]
covers: [somatic mosaicism, somatic mutation, mosaicism, post-mortem tissue, colo829, hapmap, whole genome sequencing, wgs, rna-seq, kinnex, duplex sequencing, nanoseq, codec, hidef-seq, fiber-seq, single-cell wgs, pta, tencats, retrotransposon, mobile element insertion, snv, indel, cram, vcf, brain, liver, lung, colon, skin, human]
papers: [PMID:40604182, PMID:41279200, doi:10.1101/2025.10.13.681545, doi:10.1101/2025.10.07.680917]
access: [open, registered, controlled]
platform: snovault
datasets: [https://data.smaht.org/search/?type=File&limit=1&format=json, https://data.smaht.org/profiles/?format=json, https://data.smaht.org/pages/6c1d10cd-0627-40f5-897c-c96c89023b29/?format=json, https://smaht-open-data-public.s3.amazonaws.com/smaht-production/files/3f56d78a-8a95-40d4-a589-c171086026a4/SMAVCIX7BJ31.vcf, https://smaht-open-data-public.s3.amazonaws.com/smaht-production/wfoutput/a5954483-b11b-44bc-843d-32e8ea1394e8/SMAFIUOX9B9G.bam, https://smaht-open-data-public.s3.amazonaws.com/smaht-production/wfoutput/deaf7bda-ccb4-43bd-8d65-df029166442f/SMAFIXYRG3LP.cram]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: SMaHT Data Portal at data.smaht.org (smaht-portal on snovault), live 2026-08-27 — 1,421 File (350 open, 1,071 protected), 606 FileSet, 635 Sample, 6 Donor, 40 Assay, 76 object types / Python 3.12.8 stdlib / pysam 0.24.0 / curl 8.7.1 / aws-cli 2.8.11
  executed: 21
  unverified: 1
  unverified_reason: >-
    One block shows the authenticated portal download route (curl --user with a SMaHT
    access key pair). The validating environment holds no portal account, so the block ran
    and its documented 401 was observed, but the credentialed 200 path was not exercised.
    Re-run it from a host holding a portal access key. The anonymous bucket route beside
    it, which is what this skill actually uses, was executed in full.
---
# SMaHT — data.smaht.org

SMaHT is the NIH Common Fund programme for **somatic mosaicism**: the mutations a cell
acquires after conception, which differ between a person's own tissues and are invisible to
the blood-derived DNA most genetics runs on. Its portal is where to go when the question is
*what somatic variation has been measured in normal human tissue, and how well can anyone
detect it*.

On 2026-08-27 the portal held **1,421 files** over **606 file sets** from **6 donors**, and
those numbers are small for a reason that shapes every answer below: **the portal has
released benchmarking data and no production data at all.** 954 files are tagged
`Benchmarking`; zero are tagged `Production`.

Three things go wrong for newcomers, and the first is the one that will silently corrupt a
download script:

1. **`open_data_url` does not mean the file is open.** SMaHT publishes *two* AWS buckets,
   `smaht-open-data-public` and `smaht-open-data-protected`, and every file record carries a
   URL into one of them. 1,071 protected files have an `open_data_url`, and it answers
   **403** to anyone without a dbGaP authorisation. The field's presence tells you nothing;
   the bucket hostname tells you everything.
2. **Three fields claim to describe access and only two agree.** `status` and
   `file_access_status` are the file's own tier. `access_status` is a *sample*-level
   summary, and filtering on it silently loses 124 open files.
3. **An empty result set is HTTP 404** — with a complete, valid JSON body reporting
   `total: 0`. Every HTTP client in wide use either raises on that or throws the body away.
   A malformed request is a *400*, and that one really is an error.

## What is released, and to whom

| What you want | Tier | How |
|---|---|---|
| Any metadata — donors, tissues, samples, libraries, assays, QC, file listings | open | anonymous JSON API |
| Sequence, variants and expression from **cell lines** (COLO829, HapMap mixtures) | open | AWS Open Data public bucket, no account |
| Reference files — GRCh38 fasta, gene models, stratification BEDs | open | same bucket |
| Limited donor metadata — age, sex, Hardy scale | open | anonymous JSON API |
| The portal's own `@@download` URL, for anything | registered | free self-registration + access key |
| The 10 published somatic-variant **truth sets** | registered | `@@download` only — no bucket URL |
| Sequence, germline variants and full donor metadata from **human tissue** | controlled | dbGaP — see *Requesting access* |

Of 1,421 file records on 2026-08-27: **350 open** and **1,071 protected**. The open tier is
340 files totalling **20.0 TB** in the public bucket, plus 10 truth-set files reachable only
through the portal; the protected tier is 28.6 TB. Within the open tier, 192 files are under
1 GB and 169 under 100 MB, so there is plenty to work with before anything large moves.

The portal's own access page states the rule that produces that split:

> **Open Access**: The open-access data/metadata files are available for download after a
> login as a SMaHT Network member as well as a self-registered Data Portal user who is not
> part of the SMaHT Network.
>
> **Protected Access**: All sequence data (DNA and RNA), inherited germline variant data, and
> full donor metadata files are protected-access data under dbGaP.

and, on the same page:

> Production Data are only available to members of the SMaHT Consortium at this time. Please
> check back for upcoming releases.

**This skill uses only the anonymous route.** It reads metadata without an account and
downloads from the public bucket, which the AWS Open Data registry entry describes as
"publicly available data files without restriction". It documents the account route and the
dbGaP tier; it needs neither, and it cannot obtain dbGaP access for you.

### Benchmarking is not production, and right now it is all there is

The consortium's stated goal is ~20 tissue types from 150 post-mortem donors. None of that
is on the portal yet. What *is* there is the benchmarking programme — the work of
establishing that these assays can detect mutations present in well under 1% of cells at
all — and it has five parts:

| Dataset | What it is | Tier |
|---|---|---|
| `colo829t` / `colo829bl` / `colo829blt_50to1` / `colo829blt_in_silico` | The COLO829 melanoma line and its matched normal, mixed at known ratios | open |
| `hapmap` | A defined mixture of HapMap cell lines | open |
| `colo829_snv_indel_challenge_data`, `mei_detection_challenge_data` | Truth sets for the SNV/indel and mobile-element detection challenges | open |
| `lb_fibroblast`, `lb_ipsc_*` | Fibroblasts from one donor and iPSC lines derived from them | protected |
| `tissue` | Brain, lung, liver, colon and skin from donors ST001–ST004 | protected |

Two consequences worth stating before anyone plans work. **A method-development question is
fully answerable today**, because the cell-line truth sets are open and that is exactly what
they exist for. **A biological question about somatic mutation in human tissue is not**, from
this portal, at this tier — the tissue data exists and is protected, and the donor records
you *can* see are four benchmarking donors, not a cohort.

## Talking to the portal

SMaHT runs on snovault, the ENCODE portal stack, in its own `smaht-portal` build — the same
family as the 4D Nucleome portal. So `/search/` is a typed object store, not a full-text
index. **`type=` is mandatory**, it names one class of object, and each class has its own
fields and facets. The grammar transfers between snovault portals; the field names and
vocabularies do not, because they come from SMaHT's own schemas.

```bash
BASE=https://data.smaht.org

# Anything but format=json is a negotiation you did not intend to have.
curl -s -o /dev/null -w 'curl default Accept   -> %{content_type}\n' "$BASE/search/?type=File&limit=1"
curl -s -o /dev/null -H 'Accept: text/html,application/xhtml+xml,*/*;q=0.8' \
  -w 'browser Accept        -> %{content_type}\n' "$BASE/search/?type=File&limit=1"
curl -s -o /dev/null -H 'Accept: text/html,application/xhtml+xml,*/*;q=0.8' \
  -w 'browser + format=json -> %{content_type}\n' "$BASE/search/?type=File&limit=1&format=json"

# type= is mandatory: omit it and you are redirected to type=Item.
curl -s -o /dev/null -w 'no type=              -> %{http_code} %{redirect_url}\n' \
  "$BASE/search/?q=COLO829&limit=0&format=json"

# A type that does not exist is a 400. A filter that matches nothing is a 404.
curl -s -w '\nbogus type=           -> %{http_code}\n' "$BASE/search/?type=Files&limit=0&format=json"
curl -s -o /dev/null -w 'no matches            -> %{http_code}\n' \
  "$BASE/search/?type=File&status=nonesuch&limit=0&format=json"
```

```
curl default Accept   -> application/json
browser Accept        -> text/html; charset=utf-8
browser + format=json -> application/json
no type=              -> 301 https://data.smaht.org/search/?q=COLO829&limit=0&format=json&type=Item
{"@type": ["HTTPBadRequest", "Error"], "status": "error", "code": 400, "title": "Bad Request", "description": "Invalid type: Files"}
bogus type=           -> 400
no matches            -> 404
```

Note the first three lines. The portal negotiates on `Accept`, and a bare `curl` or
`urllib.request` sends `*/*` and gets JSON — which makes it easy to write a working script
that omits `format=json` and then breaks the moment it runs behind anything setting a
browser-style `Accept`, returning a 67 KB HTML page with a 200 status. **Always send
`format=json`, and check `content-type` rather than the status code alone.**

Here is the helper the rest of this page uses. The 404-on-empty behaviour is the whole reason
it exists:

```python
import json, urllib.error, urllib.parse, urllib.request

BASE = "https://data.smaht.org"


def search(item_type, *, limit=25, fields=(), **filters):
    """One /search/ call. Returns the decoded response, including `facets` and `total`.

    Repeat a filter key (pass a list) for OR. Suffix a key with '!' for NOT.
    Python identifiers cannot hold dots, so '__' in a keyword becomes '.'.

    An empty result set is served as **HTTP 404 with a complete JSON body**, so catch it
    and return the body. A 400 is a real error — a `type=` that does not exist — and is
    left to raise.
    """
    params = [("type", item_type), ("format", "json"), ("limit", str(limit))]
    params += [("field", f) for f in fields]
    for key, value in filters.items():
        key = key.replace("__", ".")
        for v in (value if isinstance(value, (list, tuple)) else [value]):
            params.append((key, str(v)))
    url = f"{BASE}/search/?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=300) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        body = json.loads(e.read())
        if "total" not in body:          # a genuinely missing path, not an empty hit
            raise
        return body


res = search("File", limit=0)
print(res["total"], "files;", len(res["facets"]), "facets\n")
for f in res["facets"][:10]:
    print(f"  {f['field']:48s} {f['title']}")
```

```
1421 files; 22 facets

  type                                             Data Type
  access_status                                    Access
  data_description                                 Data Description
  donors.display_title                             Donor
  donors.donor_groups                              Donor Groups
  donors.age                                       Donor Age
  donors.sex                                       Donor Sex
  donors.hardy_scale                               Donor Hardy Scale
  sample_summary.tissues                           Tissue
  assays.display_title                             Experimental Assay
```

`requests.raise_for_status()` raises on that 404, `urlopen` raises `HTTPError`, and `curl -f`
discards the body — so a query that simply matched nothing reads as a broken endpoint, and a
retry loop keyed on status codes will hammer a URL that is working perfectly. **Catch the
404, parse the body, branch on `total`.**

Every block below continues in this session, with `search` already defined.

## Trap 1 — `open_data_url` is not a tier

Every file record carries `href`, which is the portal's `@@download` route and needs a login
even for a fully open file. Almost every record also carries `open_data_url`, which is a
bucket URL — and there are two buckets.

```bash
# SMAVCIX7BJ31 is an open 11 KB somatic SNV VCF from the COLO829BL cell line.
# SMAVCT7L6LG9 is a protected 1 KB somatic SNV VCF from benchmarking-donor tissue.
# Both File records carry an `open_data_url`; only one of them can be read.

curl -s -o open.vcf -w 'open file, public bucket    -> HTTP %{http_code}  %{content_type}\n' \
  "https://smaht-open-data-public.s3.amazonaws.com/smaht-production/files/3f56d78a-8a95-40d4-a589-c171086026a4/SMAVCIX7BJ31.vcf"

curl -s -o prot.out -w 'protected file, its bucket  -> HTTP %{http_code}  %{content_type}\n' \
  "https://smaht-open-data-protected.s3.amazonaws.com/smaht-production/files/2630cf90-d4d1-4a14-ac91-b45cd297bcb8/SMAVCT7L6LG9.vcf"

curl -s -o portal.out -w 'open file, portal download  -> HTTP %{http_code}  %{content_type}\n' \
  "https://data.smaht.org/variant-calls/3f56d78a-8a95-40d4-a589-c171086026a4/@@download/SMAVCIX7BJ31.vcf"

head -1 open.vcf
grep -o '<Code>[^<]*</Code>' prot.out
head -c 95 portal.out; echo
```

```
open file, public bucket    -> HTTP 200  binary/octet-stream
protected file, its bucket  -> HTTP 403  application/xml
open file, portal download  -> HTTP 403  application/json
##fileformat=VCFv4.0
<Code>AccessDenied</Code>
{"@type": ["HTTPForbidden", "Error"], "status": "error", "code": 403, "title": "Not logged in."
```

Both refusals are 403 and neither is empty. `curl -O` without `-f` will write S3's ~250-byte
`AccessDenied` XML to disk under a `.vcf` name, and the portal's 403 says `"Not logged in."`,
which reads like the *file* is private when the file is open and only the route is gated.
**Always pass `-f`, or check the status code and the content type.**

The field that actually answers "can I read this" is the bucket hostname. Here is every
combination that exists on the portal:

```python
import collections, urllib.parse

FIELDS = ("accession", "status", "file_access_status", "access_status",
          "open_data_url", "file_size", "md5sum", "file_format.display_title",
          "data_category", "dataset", "donors.display_title",
          "sample_summary.studies", "assays.display_title")
files = {r["accession"]: r for r in search("File", limit="all", fields=FIELDS)["@graph"]}


def bucket(rec):
    """Which S3 bucket a file's open_data_url points at — this, not the field's
    presence, is what says whether you can read the bytes."""
    return urllib.parse.urlparse(rec.get("open_data_url") or "").netloc or "(no bucket URL)"


rows = collections.Counter(
    (r["status"], r.get("file_access_status"), r.get("access_status"), bucket(r))
    for r in files.values())
print(f"{'status':10s} {'file_access_status':19s} {'access_status':14s} {'bucket':43s}    n")
for (st, fas, acs, b), n in sorted(rows.items(), key=lambda kv: -kv[1]):
    print(f"{st:10s} {str(fas):19s} {str(acs):14s} {b:43s} {n:4d}")
```

```
status     file_access_status  access_status  bucket                                         n
protected  None                Protected      smaht-open-data-protected.s3.amazonaws.com   728
protected  None                None           smaht-open-data-protected.s3.amazonaws.com   343
open       Open                Open           smaht-open-data-public.s3.amazonaws.com      226
open       Open                None           smaht-open-data-public.s3.amazonaws.com      114
open       Open                None           (no bucket URL)                               10
```

Read that table as three findings:

- **`status` and the bucket agree, always.** Every `open` file is on the public bucket or has
  no bucket URL; every `protected` file is on the protected bucket. Across 6,322
  record-observations in a sweep over every assay, dataset, tissue, donor, format and file
  subtype, there was not one exception. Either check is sound; the bucket check is the one
  that also catches the last row — ten open files with no bucket URL at all, which a
  `status=open` filter would hand you as fetchable.
- **`file_access_status` mirrors `status` exactly** — `Open` on all 350 open files and absent
  on all 1,071 protected ones. It is a fine filter (`file_access_status=Open`).
- **`access_status` is a different question wearing the same name.** It is the *sample's*
  designation, so it is `None` for the 467 files with no sample — QC roll-ups, reference
  files. `access_status=Open` returns 226 of 350 open files and looks like a complete answer.

Restrict to what you can actually fetch with `status=open`, not with `access_status`.

`principals_allowed.view` is **not** the check either. A protected file reports
`{"view": ["system.Everyone"]}` — that governs the metadata record, which really is public,
not the bytes.

With `files` in hand, the benchmarking-versus-production claim made above is checkable
directly:

```python
studies = collections.Counter(
    (tuple(r.get("sample_summary", {}).get("studies", [])) or ("(no study)",), r["status"])
    for r in files.values())
for (study, status), n in sorted(studies.items()):
    print(f"  {study[0]:12s} {status:10s} {n:5d} files")

print()
for label, kw in [("Benchmarking donors", dict(study="Benchmarking")),
                  ("Production donors  ", dict(study="Production"))]:
    d = search("Donor", limit="all", fields=("display_title", "sex", "age", "hardy_scale"), **kw)
    who = ", ".join(sorted(r["display_title"] for r in d["@graph"])) or "(none)"
    print(f"  {label} -> {d['total']}  {who}")
print(f"  Protected donor records visible anonymously -> "
      f"{search('ProtectedDonor', limit=0)['total']}")
```

```
  (no study)   open         124 files
  (no study)   protected    343 files
  Benchmarking open         226 files
  Benchmarking protected    728 files

  Benchmarking donors -> 4  ST001, ST002, ST003, ST004
  Production donors   -> 0  (none)
  Protected donor records visible anonymously -> 0
```

`ProtectedDonor` is a real object type with its own schema — clinical history, exposures,
demographics, death circumstances — and it returns nothing anonymously. Its `status` enum has
no open value at all, so a `ProtectedDonor` record can never become public; the open `Donor`
record beside it is the redacted view. That pairing is the whole donor privacy model in one
line.

## The `type=` vocabulary is the whole interface

Getting `type=` wrong is the difference between 1,421 results and a 404 that looks like a
broken endpoint, and the vocabulary is not guessable. The authoritative list is `/profiles/`,
817 KB on 2026-08-27, carrying **76** classes with their full JSON Schema. Read it rather than
guessing:

```python
import json, urllib.request

with urllib.request.urlopen(f"{BASE}/profiles/?format=json", timeout=300) as r:
    profiles = json.load(r)
names = sorted(k for k in profiles if not k.startswith("@"))
abstract = {k for k in names if profiles[k].get("isAbstract")}
print(len(names), "types,", len(abstract), "of them abstract\n")

for t in ("File", "OutputFile", "SubmittedFile", "VariantCalls", "AlignedReads",
          "FileSet", "Sample", "TissueSample", "Analyte", "Library", "Tissue",
          "Assay", "Sequencing", "Donor"):
    n = search(t, limit=0)["total"]
    print(f"  {t:16s} {n:6d}  {'abstract' if t in abstract else ''}".rstrip())
```

```
76 types, 10 of them abstract

  File               1421  abstract
  OutputFile         1091
  SubmittedFile       322  abstract
  VariantCalls        175
  AlignedReads         96
  FileSet             606
  Sample              635  abstract
  TissueSample        407
  Analyte             390
  Library             584
  Tissue               14
  Assay                40
  Sequencing           63
  Donor                 6
```

The types that carry almost every question, with live counts from 2026-08-27:

| `type=` | n | what it is |
|---|---|---|
| `File` | 1,421 | **start here** — abstract over every file subtype |
| `OutputFile` | 1,091 | pipeline output — alignments, variant calls, expression, QC |
| `SubmittedFile` | 322 | what a centre uploaded; abstract over the next three |
| `VariantCalls` | 175 | submitted VCFs — somatic and germline |
| `AlignedReads` | 96 | submitted BAM/CRAM |
| `FileSet` | 606 | one sequencing run over one library — the join between sample and file |
| `Library` | 584 | a sequencing library, with its assay and DNA target |
| `Sample` | 635 | abstract over `TissueSample` (407), `CellSample` (186), `CellCultureSample` (42) |
| `Analyte` | 390 | the extracted DNA or RNA |
| `Assay` | 40 | the assay vocabulary itself — **14 of these have data** |
| `Donor` | 6 | the open donor record; `ProtectedDonor` is its gated counterpart |

`File`, `Sample`, `SubmittedFile`, `SampleSource` and `Preparation` are **abstract** —
searching them returns every subtype, and the `type` facet breaks the total down. That makes
`type=File` the right query almost always. Two abstract config types, `GenericConfig` and
`SubmittedItem`, time out at 60 s with a 504 rather than answering; neither holds anything a
reader wants.

An accession resolves on its own, without knowing its subtype — `/<accession>/` 301s to the
canonical `/<collection>/<uuid>/` path, and any HTTP client that follows redirects will land
on the record.

## Facets are self-documenting — and two ways to misread them

Every response carries a `facets` block listing the filterable fields for that type, their
human titles and their term counts. Read it instead of hardcoding a field list.

```python
facets = {f["field"]: f for f in search("File", limit=0)["facets"]}
grouped = [f for f in facets.values() if f.get("has_group_by")]
print("grouped facets:", [f["field"] for f in grouped])
et = facets["assays.display_title"]
for g in et["terms"][1:4]:
    members = ", ".join(f"{t['key']} ({t['doc_count']})" for t in g["terms"])
    print(f"  group {g['key']!r} = {g['doc_count']}  ->  {members}")

print()
A = "assays__display_title"
for v in ("Bulk WGS", "WGS", "Duplex-seq WGS", "CODEC"):
    r = search("File", limit=0, **{A: v})
    print(f"  filter assays.display_title={v!r:16s} -> {r['total']:4d}  {r['notification']!r}")

# The vocabulary is what the consortium plans to run, not what it has released.
vocab = search("Assay", limit="all", fields=("display_title", "category"))["@graph"]
empty = [a["display_title"] for a in vocab
         if search("File", limit=0, **{A: a["display_title"]})["total"] == 0]
print(f"\n  {len(vocab)} assays in the vocabulary; {len(empty)} of them have no released file")
print("  e.g.", ", ".join(sorted(empty)[:6]))
```

```
grouped facets: ['sample_summary.tissues', 'assays.display_title']
  group 'Bulk WGS' = 386  ->  WGS (304), Fiber-seq (59), Ultra-Long WGS (13), Hi-C (10)
  group 'Bulk RNA-seq' = 252  ->  RNA-seq (180), Kinnex (72)
  group 'Duplex-seq WGS' = 240  ->  scMETA-VISTA-seq (84), CODEC (63), NanoSeq (56), CompDuplex-seq (25), META-VISTA-seq (9), HiDEF-seq (3)

  filter assays.display_title='Bulk WGS'       ->    0  'No results found'
  filter assays.display_title='WGS'            ->  304  'Success'
  filter assays.display_title='Duplex-seq WGS' ->    0  'No results found'
  filter assays.display_title='CODEC'          ->   63  'Success'

  40 assays in the vocabulary; 26 of them have no released file
  e.g. ATAC-seq, Bot-seq, Bulk NTSeq, CUT&Tag, DLP+, HAT-seq
```

**The first misreading is the group heading.** A facet carrying `has_group_by: true` returns
two levels — a top-level `key` that is a display grouping, and a nested `terms` list of the
values you can filter on. `'Bulk WGS'` names 386 files in the facet and matches nothing as a
filter, because it is a heading over four real assay names. Two facets on `File` are grouped:
`assays.display_title` and `sample_summary.tissues` (whose headings are germ layers —
`Endoderm`, `Ectoderm` — over the tissues themselves).

**The second is the vocabulary itself.** `type=Assay` lists 40 assays across 13 categories,
because SMaHT registered the assays the consortium intends to run. **26 of them have no
released file.** An agent that reads the `Assay` collection and reports "SMaHT has ATAC-seq
and Strand-seq data" is reading a plan, not a holding. The 14 with data on 2026-08-27 were
WGS, RNA-seq, Kinnex, scMETA-VISTA-seq, CODEC, Fiber-seq, NanoSeq, CompDuplex-seq,
Single-cell PTA WGS, TEnCATS, Ultra-Long WGS, Hi-C, META-VISTA-seq and HiDEF-seq.

## Query grammar

Everything below was checked against `type=File` on 2026-08-27.

| Want | Syntax | Note |
|---|---|---|
| JSON | `format=json` | always send it — the server otherwise negotiates on `Accept` |
| Page size | `limit=25` | **25 is the default** — a bare query silently truncates |
| Everything | `limit=all` | fine here; `type=File` unfielded takes roughly 30 s |
| Count only | `limit=0` | returns `total` and `facets`, with an empty `@graph` |
| Offset | `from=25` | pairs with `limit` |
| Trim the payload | `field=accession&field=status` | repeatable; `@id` and `@type` always come back |
| OR | repeat the key | `status=open&status=protected` → 1,421 = 350 + 1,071 |
| NOT | `status%21=protected` | a literal `!` 301s to the encoded form |
| Punctuation in a value | `Colon%2C+Asc` | a bare `,` or a `%20` both 301 to this |
| Free text | `q=COLO829` | still needs `type=` |
| Sort | `sort=file_size` / `sort=-file_size` | `-` is descending |

```python
print("all files                 ", search("File", limit=0)["total"])
print("open                      ", search("File", limit=0, status="open")["total"])
print("protected                 ", search("File", limit=0, status="protected")["total"])
print("OR of the two             ", search("File", limit=0, status=["open", "protected"])["total"])
print("NOT protected             ", search("File", limit=0, **{"status!": "protected"})["total"])
print("q=COLO829                 ", search("File", limit=0, q="COLO829")["total"])
print("cram AND open             ",
      search("File", limit=0, status="open", file_format__display_title="cram")["total"])

everything = search("File", limit="all", fields=("accession",), status="open")
default = search("File", fields=("accession",), status="open")
page2 = search("File", limit=5, fields=("accession",), status="open", **{"from": 5})
big = search("File", limit=1, fields=("accession", "file_size"), status="open", sort="-file_size")
print(f"limit=all returned {len(everything['@graph'])} of {everything['total']};"
      f" no limit= returned {len(default['@graph'])};"
      f" from=5&limit=5 returned {[r['accession'] for r in page2['@graph']]}")
print(f"largest open file: {big['@graph'][0]['accession']}, "
      f"{big['@graph'][0]['file_size'] / 1e12:.2f} TB")
```

```
all files                  1421
open                       350
protected                  1071
OR of the two              1421
NOT protected              350
q=COLO829                  178
cram AND open              91
limit=all returned 350 of 350; no limit= returned 25; from=5&limit=5 returned ['SMAEFVQDFKMJ', 'SMAEFBTYEJ75', 'SMAEFC3M1GRR', 'SMAEFD692KUL', 'SMAEF1ATPIOJ']
largest open file: SMAARNRVZGBE, 2.04 TB
```

`350 + 1071 = 1421`, so OR and NOT are doing what they claim, and `no limit= returned 25` is
the line to internalise — a query with no `limit` looks like a complete answer and is a
first page.

The portal canonicalises query strings and redirects anything else: a space as `%20`, a bare
`,`, and a literal `!` each get a **301** to the encoded form. A client that does not follow
redirects sees an HTML redirect page instead of JSON. `urllib.parse.urlencode` emits the
canonical form already, which is why the helper above never meets this.

That last line is a warning of a different kind. **The open tier contains single files above
2 TB** — in-silico COLO829BLT mixtures at 500× coverage. Sort by size before you plan a
transfer, and never write a loop that fetches "all open files" without a size budget.

### `field=` drops what it cannot resolve, silently

`field=` is the difference between a usable pipeline and a slow one, and it has one sharp
edge: asking for a sub-field the search index does not embed removes the **whole parent key**
from the response, with a 200 and no warning.

```python
for f in ("samples.accession", "samples.display_title", "file_sets.accession", "no_such_field"):
    r = search("File", limit=1, fields=("accession", f), accession="SMAVCIX7BJ31")["@graph"][0]
    print(f"  field={f:24s} -> keys {sorted(k for k in r if not k.startswith('@'))}")
```

```
  field=samples.accession        -> keys ['accession']
  field=samples.display_title    -> keys ['accession', 'samples']
  field=file_sets.accession      -> keys ['accession', 'file_sets']
  field=no_such_field            -> keys ['accession']
```

`samples` is embedded on `File` with `display_title`, `@id`, `uuid` and `status` but **no
`accession`** — so `field=samples.accession` produces records with no `samples` key at all, and
a pipeline built on it concludes that no file has a sample. `file_sets.accession` works,
because that embed does carry one. Ask for the parent (`field=samples`) when unsure, look at
what comes back, and only then narrow.

## Donor to tissue to library to file

Six levels, and a file hangs off exactly one of them — the `FileSet` — when it hangs off
anything at all:

```
Donor  ST001                              open record; ProtectedDonor holds the rest
└── Tissue  ST001-1A (Liver), ST001-1D (Lung), ST001-1K (Skin, Abdomen)
    └── TissueSample  ST001-1A-101X …     a piece of that tissue
        └── Analyte  UMICH_ANALYTE_ST001-1A-101X_LIVER      the DNA or RNA extracted
            └── Library                   one prep, carrying the assay and DNA target
                └── FileSet               one sequencing run of that library
                    └── File              reads, variant calls, expression, QC
```

467 of 1,421 files have no `file_sets` link at all — QC roll-ups, reference files and the ten
external truth sets — so a walk that starts from a donor will not reach them. Those are
exactly the files with no donor either, so nothing is lost by it.

`Donor` and `File` are the two ends you will actually query. `donors` is a calculated field
on `File`, so a single search closes the loop without walking down:

```python
FILE_FIELDS = (
    "accession", "display_title", "status", "file_access_status",
    "file_format.display_title", "file_size", "md5sum", "open_data_url", "extra_files",
    "data_category", "data_type", "dataset", "donors.display_title",
    "sample_summary.tissues", "assays.display_title", "sequencers.display_title",
    "file_sets.accession", "reference_genome.display_title",
)


def files_for(**filters):
    """Every File matching a filter, keyed by accession. `File` is abstract, so this
    covers OutputFile, VariantCalls, AlignedReads, SupplementaryFile and the rest."""
    res = search("File", limit="all", fields=FILE_FIELDS, **filters)
    return {r["accession"]: r for r in res["@graph"]}


# Down: donor -> tissue -> tissue sample -> analyte -> library -> file set.
donor = search("Donor", limit=1, fields=("accession", "display_title", "sex", "age",
                                         "hardy_scale", "study", "tissues.display_title",
                                         "tissues.tissue_type"),
               display_title="ST001")["@graph"][0]
print(f"{donor['display_title']} ({donor['accession']}) — {donor['study']}, "
      f"{donor['sex']}, Hardy {donor['hardy_scale']}")
for t in donor["tissues"]:
    print(f"    tissue {t['display_title']:10s} {t.get('tissue_type', '')}")

for t, kw in [("TissueSample", {"sample_sources__donor__display_title": "ST001"}),
              ("Analyte", {"samples__sample_sources__donor__display_title": "ST001"}),
              ("FileSet", {"libraries__analytes__samples__sample_sources__donor__display_title": "ST001"})]:
    print(f"    {t:13s} {search(t, limit=0, **kw)['total']:4d}")

# Up: file -> donor, in one query, because donors is a calculated field on File.
st001 = files_for(donors__display_title="ST001")
print(f"    File          {len(st001):4d}")
by_kind = collections.Counter(
    (r["status"], tuple(r.get("data_category", [])), r["file_format"]["display_title"])
    for r in st001.values())
for (status, cat, fmt), n in sorted(by_kind.items(), key=lambda kv: -kv[1])[:6]:
    print(f"      {n:4d}  {status:10s} {'/'.join(cat):22s} {fmt}")
```

```
ST001 (SMADOWNO1XMS) — Benchmarking, Male, Hardy 4
    tissue ST001-1A   Liver
    tissue ST001-1D   Lung
    tissue ST001-1K   Skin, Abdomen
    TissueSample   123
    Analyte         60
    FileSet        105
    File           185
        52  protected  Sequencing Reads       cram
        34  protected  Somatic Variant Calls  vcf
        29  protected  Sequencing Reads       bam
        20  protected  RNA Quantification     tsv
        12  protected  Germline Variant Calls vcf
         8  protected  RNA Quantification/Quality Control tar_gz
```

Filters chain through the hierarchy with dotted paths, which is what
`libraries.analytes.samples.sample_sources.donor.display_title` is. They are long, and the
`facets` block on each type is where to find the exact spelling — no other list of them
exists.

**How deep a chain works is per-type, and a path that is not indexed returns zero rather than
an error.** `FileSet` answers the full five-hop path above; `Library` does not —
`analytes.samples.sample_sources.donor.display_title` on `Library` returns `0` with the same
404 an honestly empty query gives, while `analytes.display_title` on the same type works.
When a filter you expected to match returns nothing, re-run it one hop shorter before
concluding the data is absent.

`sample_summary` is the flattened convenience view of that whole chain, present on every
`File`: `donor_ids`, `tissues`, `sample_names`, `analytes`, `studies`. Use it for display and
grouping; use the dotted paths for filtering.

## Trap 2 — the item endpoint hides what the search index shows

Fetching a record directly is the obvious way to read one file's metadata, and it returns
*less* than `/search/` does. Embedded objects the anonymous user may not read are replaced by
a stub — and on SMaHT that includes `file_format` and `software` on a fully open file:

```python
import json, urllib.request

with urllib.request.urlopen(f"{BASE}/SMAVCIX7BJ31/?format=json", timeout=300) as r:
    item = json.load(r)
print("item endpoint  file_format ->", json.dumps(item["file_format"]))
print("item endpoint  software    ->", json.dumps(item["software"]))

hit = search("File", limit=1, accession="SMAVCIX7BJ31",
             fields=("accession", "file_format.display_title",
                     "software.display_title"))["@graph"][0]
print("search index   file_format ->", json.dumps(hit["file_format"]))
print("search index   software    ->", json.dumps(hit["software"]))
```

```
item endpoint  file_format -> {"error": "no view permissions"}
item endpoint  software    -> [{"error": "no view permissions"}]
search index   file_format -> {"display_title": "vcf"}
search index   software    -> [{"display_title": "VISTA-META-Seq Pipeline"}]
```

So `rec["file_format"]["display_title"]` raises `KeyError` against the item endpoint and works
against the search index, for the same open file. **Read metadata through `/search/` with
`field=`.** Where you must walk an embedded list from an item, guard every iteration with an
`"error" not in obj` test rather than assuming the shape.

## Get the files

The pattern is four steps: find the files, partition by the route that actually works, write
a manifest, then fetch with the portal's md5 as the check.

### Triage before you transfer anything

This is the answer to give a user before starting a transfer, and reporting the protected
half as "download failed" is the failure it exists to prevent.

```python
PUBLIC = "smaht-open-data-public.s3.amazonaws.com"


def triage(recs):
    """Partition files by the route that actually works, and print what is withheld."""
    fetchable, gated, portal_only = [], [], []
    for r in sorted(recs.values(), key=lambda r: (r["status"], -r.get("file_size", 0))):
        host = urllib.parse.urlparse(r.get("open_data_url") or "").netloc
        (fetchable if host == PUBLIC else gated if host else portal_only).append(r)
    for name, group in (("open bucket", fetchable), ("protected", gated),
                        ("portal only", portal_only)):
        gb = sum(r.get("file_size", 0) for r in group) / 1e9
        print(f"  {name:12s} {len(group):4d} files  {gb:10.2f} GB")
    return fetchable, gated, portal_only


print("ST001 (benchmarking donor, brain/liver/lung/skin):")
triage(st001)
print("COLO829 (benchmarking cell line pair):")
colo = files_for(donors__display_title="COLO829")
open_colo, _, portal_colo = triage(colo)
print()
for r in portal_colo[:3]:
    print(f"  portal-only: {r['accession']}  {r['file_format']['display_title']:7s} "
          f"{r.get('file_size', 0):>12,}  {r['display_title'][:44]}")
```

```
ST001 (benchmarking donor, brain/liver/lung/skin):
  open bucket     0 files        0.00 GB
  protected     185 files     6441.39 GB
  portal only     0 files        0.00 GB
COLO829 (benchmarking cell line pair):
  open bucket   172 files    13957.51 GB
  protected       0 files        0.00 GB
  portal only     6 files        1.76 GB

  portal-only: SMAEF4ZH5FM6  tar     1,757,123,584  SMAEF4ZH5FM6.tar
  portal-only: SMAEF1ATPIOJ  vcf_gz     2,778,041  SMAEF1ATPIOJ.vcf.gz
  portal-only: SMAEFVQDFKMJ  vcf_gz     2,570,760  SMAEFVQDFKMJ.vcf.gz
```

The split is total: **every ST001 file is protected, every COLO829 file is open.** That is the
tissue-versus-cell-line line, and it holds for the other three benchmarking donors and for the
LB fibroblast/iPSC series too.

The third column is the one nobody expects. Ten `ExternalOutputFile` records — the
high-confidence somatic SNV, indel and mobile-element **truth sets** published alongside the
benchmarking preprints — are `status: open` and carry **no bucket URL at all**. They exist only
behind the portal's `@@download`, so a free account is the price of the reference answers even
though the data they score is anonymous. Each carries a `doi_list` naming the preprint it
belongs to.

### Write a manifest first

```python
import csv

MANIFEST_COLUMNS = ["accession", "annotated_filename", "data_category", "file_format",
                    "reference_genome", "file_size", "md5sum", "url"]


def manifest(recs, path="smaht_manifest.tsv"):
    """One TSV row per file you can actually fetch, and a printed account of the rest."""
    rows, withheld = [], []
    for r in sorted(recs.values(), key=lambda r: r["accession"]):
        host = urllib.parse.urlparse(r.get("open_data_url") or "").netloc
        if host != PUBLIC:
            withheld.append((r, "protected bucket" if host else "portal @@download only"))
            continue
        rows.append({
            "accession": r["accession"],
            "annotated_filename": r["display_title"],
            "data_category": "/".join(r.get("data_category", [])),
            "file_format": r["file_format"]["display_title"],
            "reference_genome": r.get("reference_genome", {}).get("display_title", ""),
            "file_size": r["file_size"],
            "md5sum": r["md5sum"],
            "url": r["open_data_url"],
        })
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=MANIFEST_COLUMNS, delimiter="\t")
        w.writeheader()
        w.writerows(rows)
    total = sum(r["file_size"] for r in rows)
    print(f"{path}: {len(rows)} files, {total / 1e9:,.3f} GB")
    for r, why in withheld:
        print(f"  withheld {r['accession']} ({r['status']}, {why})")
    return rows


rows = manifest({a: r for a, r in colo.items()
                 if "Somatic Variant Calls" in r.get("data_category", [])})
```

```
smaht_manifest.tsv: 13 files, 0.201 GB
  withheld SMAEF1ATPIOJ (open, portal @@download only)
  withheld SMAEF4ZH5FM6 (open, portal @@download only)
  withheld SMAEFBTYEJ75 (open, portal @@download only)
  withheld SMAEFC3M1GRR (open, portal @@download only)
  withheld SMAEFD692KUL (open, portal @@download only)
  withheld SMAEFVQDFKMJ (open, portal @@download only)
```

`display_title` is the SMaHT *annotated filename*, and it encodes the sample, donor, protocol,
centre, accession and pipeline — `SMHTCOLO829BL-X-X-M45-A025-bch2-SMAVCIX7BJ31-vistaseq_1_GRCh38_ALT.vcf`.
The portal publishes the full code tables as a versioned PDF from its Sample and File
Nomenclature page; do not try to parse the name for metadata that is a field on the record.

The portal also has a `/metadata/` endpoint that returns a manifest TSV. It is built for the
logged-in download flow and, tried anonymously on 2026-08-27, it answered **504** rather than
returning anything. Build the manifest from `/search/`; every column you need is there.

### Fetch and verify

```python
import hashlib, pathlib, urllib.request


def fetch(row, outdir="smaht"):
    """Download one manifest row and check it against the portal's own md5."""
    pathlib.Path(outdir).mkdir(exist_ok=True)
    dest = pathlib.Path(outdir) / row["url"].rsplit("/", 1)[-1]
    if not dest.exists() or dest.stat().st_size != int(row["file_size"]):
        with urllib.request.urlopen(row["url"], timeout=1800) as r, open(dest, "wb") as fh:
            while chunk := r.read(1 << 20):
                fh.write(chunk)
    digest = hashlib.md5()
    with open(dest, "rb") as fh:
        while chunk := fh.read(1 << 20):
            digest.update(chunk)
    if digest.hexdigest() != row["md5sum"]:
        raise ValueError(f"{dest}: md5 {digest.hexdigest()} != portal {row['md5sum']}")
    print(f"  {dest}  {dest.stat().st_size:>9,} bytes  md5 ok")
    return dest


for row in sorted(rows, key=lambda r: r["file_size"])[:4]:
    fetch(row)
```

```
  smaht/SMAVCIX7BJ31.vcf     11,724 bytes  md5 ok
  smaht/SMAVCWAHSV4B.vcf     12,701 bytes  md5 ok
  smaht/SMAVCPVPW5ZI.vcf     31,491 bytes  md5 ok
  smaht/SMAVCCOD41VH.vcf     42,574 bytes  md5 ok
```

The md5 check is not optional. The bucket is plain HTTPS with no signature, a truncated
transfer produces a shorter file with no error, and for a CRAM that means a corruption you
discover much later, inside an analysis.

### The index sidecars have no URL of their own

477 files carry an `extra_files` entry — 389 `.crai`, 85 `.bai`, plus a `.tbi` and the
reference genome's `.fai`, `.dict` and bwa index. **None of those entries carries an
`open_data_url`.** A BAM or CRAM without its index is unusable for anything but a full scan,
so derive the sidecar URL from the parent's:

```python
import urllib.request


def sidecars(rec):
    """(url, expected_size_or_None) for every index file beside `rec` in the bucket.

    An extra_files entry carries no open_data_url of its own — derive it from the
    parent's — and seven of them on the portal carry no file_size or md5sum either.
    """
    parent = rec.get("open_data_url")
    if not parent:
        return []
    prefix = parent.rsplit("/", 1)[0]
    return [(prefix + "/" + x["upload_key"].split("/", 1)[1], x.get("file_size"))
            for x in rec.get("extra_files") or []]


indexed = [r for r in open_colo if r.get("extra_files")]
print(f"{len(indexed)} of {len(open_colo)} open COLO829 files carry an index sidecar")
for rec in sorted(indexed, key=lambda r: r["file_size"])[:3]:
    for url, size in sidecars(rec):
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=300) as resp:
            got = int(resp.headers["Content-Length"])
        print(f"  {rec['accession']} {rec['file_format']['display_title']:5s} -> "
              f"{url.rsplit('/', 1)[-1]:22s} HTTP {resp.status} {got:>10,} bytes "
              f"{'(matches record)' if got == size else '(record has no file_size)'}")
```

```
88 of 172 open COLO829 files carry an index sidecar
  SMAFIUOX9B9G bam   -> SMAFIUOX9B9G.bam.bai   HTTP 200  2,355,152 bytes (matches record)
  SMAFI3XS3VN8 bam   -> SMAFI3XS3VN8.bam.bai   HTTP 200  2,404,784 bytes (matches record)
  SMAFIBK64RYY bam   -> SMAFIBK64RYY.bam.bai   HTTP 200  2,901,408 bytes (matches record)
```

The `upload_key` on a sidecar is `<uuid>/<name>` while the parent's URL is
`.../smaht-production/{files,wfoutput}/<uuid>/<name>` — two prefixes, depending on whether the
file was submitted or produced by a pipeline. Splicing the name onto the parent's directory
handles both. Seven sidecars carry no `file_size` and no `md5sum`, so guard those lookups.

### The same bucket over the S3 API

`open_data_url` is an `https://<bucket>.s3.amazonaws.com/<key>` URL; the CLI wants
`s3://<bucket>/<key>`. Anonymous access needs `--no-sign-request`, and the public bucket is
listable, which is the fastest way to see a file and its sidecars together.

```bash
# https://smaht-open-data-public.s3.amazonaws.com/<key>  ->  s3://smaht-open-data-public/<key>
aws s3 ls --no-sign-request \
  "s3://smaht-open-data-public/smaht-production/wfoutput/a5954483-b11b-44bc-843d-32e8ea1394e8/"

# The protected bucket is in the same registry entry and refuses the same request.
aws s3 ls --no-sign-request "s3://smaht-open-data-protected/smaht-production/" 2>&1 | tail -1
```

```
2026-01-09 15:04:59  757049330 SMAFIUOX9B9G.bam
2026-01-09 15:05:05    2355152 SMAFIUOX9B9G.bam.bai
An error occurred (AccessDenied) when calling the ListObjectsV2 operation: Access Denied
```

The public bucket held 489 objects and 20.0 TB on 2026-08-27. Listing it is the check on
whether a file really is fetchable; the protected bucket refuses even a listing.

### Reading a BAM or CRAM without downloading it

The open tier is 91 CRAMs and 47 BAMs, and the smallest CRAM is 10 GB. The bucket serves HTTP
range requests, so htslib can index into one remotely and you need no local copy at all:

```bash
python3 -m venv .venv
./.venv/bin/pip install --quiet --disable-pip-version-check pysam
./.venv/bin/python -c "import pysam; print('pysam', pysam.__version__)"
```

```
pysam 0.24.0
```

```bash
./.venv/bin/python - <<'PY'
import pysam

BUCKET = "https://smaht-open-data-public.s3.amazonaws.com/smaht-production"
BAM = f"{BUCKET}/wfoutput/a5954483-b11b-44bc-843d-32e8ea1394e8/SMAFIUOX9B9G.bam"

af = pysam.AlignmentFile(BAM, "rb", index_filename=BAM + ".bai")
header = af.header.to_dict()
print("references:", len(af.references), af.references[:3])
print("read groups:", [(g.get("ID"), g.get("SM"), g.get("PL")) for g in header.get("RG", [])])

reads = bases = 0
for rec in af.fetch("chr17", 7_668_400, 7_687_550):        # TP53, GRCh38
    reads += 1
    bases += rec.query_alignment_length
print(f"TP53: {reads} reads, {bases:,} aligned bases, from a {af.header.nreferences}-contig "
      f"757 MB BAM with nothing on disk")
PY
```

```
references: 195 ('chr1', 'chr2', 'chr3')
read groups: [('e4927d21', 'SMACUXH6VVAL', 'PACBIO')]
TP53: 133 reads, 238,531 aligned bases, from a 195-contig 757 MB BAM with nothing on disk
```

**A CRAM is different, and this is where it bites.** The header reads remotely just fine, but
decoding a record needs the reference the file was compressed against — and SMaHT's CRAMs name
it by an internal pipeline path that does not exist on your machine:

```bash
./.venv/bin/python - <<'PY'
import pysam

CRAM = ("https://smaht-open-data-public.s3.amazonaws.com/smaht-production/wfoutput/"
        "deaf7bda-ccb4-43bd-8d65-df029166442f/SMAFIXYRG3LP.cram")

af = pysam.AlignmentFile(CRAM, "rc", index_filename=CRAM + ".crai", check_sq=False)
sq = af.header.to_dict()["SQ"][0]
print(f"header: {len(af.references)} contigs, first {sq['SN']} ({sq['LN']:,} bp)")
print(f"@SQ UR: {sq['UR']}")
print(f"@SQ M5: {sq['M5']}")
try:
    next(af.fetch("chr21", 5_010_000, 5_011_000))
except OSError as e:
    print(f"decoding a slice -> {type(e).__name__}: {e}")
PY
```

```
header: 195 contigs, first chr1 (248,956,422 bp)
@SQ UR: /var/lib/cwl/stge454d9d3-f1db-48b2-b14a-8a023b24e813/SMAFI23ELK2A.fa
@SQ M5: 6aef897c3d6ff0c78aff06ac189178dd
decoding a slice -> OSError: truncated file
```

`OSError: truncated file` on a file that is neither truncated nor corrupt. htslib prints the
real cause to **stderr** — `Failed to open reference file '/var/lib/cwl/…'` — so a script that
captures only stdout sees an unexplained I/O error. Note what the path names, though:
`SMAFI23ELK2A` is a SMaHT accession, and it is the open 3.1 GB GRCh38 fasta in the public
bucket. You can fetch that, or you can let htslib resolve the reference by the `M5` checksum
and pull only the contigs you touch:

```bash
# htslib resolves a CRAM's reference by the @SQ M5 checksum when REF_PATH is set.
# The EBI registry serves those sequences, and REF_CACHE keeps what it fetched.
mkdir -p refs
export REF_PATH='refs/%2s/%2s/%s:https://www.ebi.ac.uk/ena/cram/md5/%s'
export REF_CACHE='refs/%2s/%2s/%s'

./.venv/bin/python - <<'PY'
import pysam
CRAM = ("https://smaht-open-data-public.s3.amazonaws.com/smaht-production/wfoutput/"
        "deaf7bda-ccb4-43bd-8d65-df029166442f/SMAFIXYRG3LP.cram")
af = pysam.AlignmentFile(CRAM, "rc", index_filename=CRAM + ".crai")
reads = [r for r in af.fetch("chr21", 5_010_000, 5_060_000)]
print(f"{len(reads)} reads; longest {max(r.query_length for r in reads):,} bp; "
      f"mean MAPQ {sum(r.mapping_quality for r in reads) / len(reads):.1f}")
print("first:", reads[0].query_name, reads[0].reference_start, reads[0].query_sequence[:24])
PY
du -sh refs
```

```
48 reads; longest 28,586 bp; mean MAPQ 36.0
first: m84063_240321_130720_s4/266471006/ccs 5010020 CTAAAGTGCTGGGATTACAGGTGT
 45M	refs
```

45 MB of chr21 instead of a 3.1 GB fasta. Take the assembly from the File record's
`reference_genome`, which is authoritative — `GRCh38 [Official]`, `GRCh38 with ALT contigs`
or `NYU CHM13` — and not from the CRAM header, whose `UR` describes the machine it was built
on.

## Requesting access

There are two gates above the anonymous route, and they are unrelated to each other. Establish
which one a question needs *before* anybody starts an application.

### The free portal account — for the truth sets and the download UI

Self-registration is open to anyone with an institutional email address, through Google
OAuth. It gets you the portal's own `@@download` route and an access key, which is what the
ten published truth sets require and what the browse UI's download button uses. It does
**not** unlock anything protected.

Register at the portal, then Profile → Access Keys. Keep the pair out of your shell history:

```bash
# SMAHT_KEY / SMAHT_SECRET come from Profile -> Access Keys on the portal, after login.
curl -s -o /dev/null -L --user "${SMAHT_KEY:-}:${SMAHT_SECRET:-}" \
  -w 'portal @@download with a key pair -> HTTP %{http_code}\n' \
  "https://data.smaht.org/variant-calls/3f56d78a-8a95-40d4-a589-c171086026a4/@@download/SMAVCIX7BJ31.vcf"
```

```
portal @@download with a key pair -> HTTP 401
```

With a valid pair that becomes a 200 and the file. The two refusals mean different things: no
`--user` header at all is **403** with `"Not logged in."`, and a wrong or empty key pair is
**401**. A 401 means fix the credential; a 403 means the credential is not what is missing.

One inconsistency to know about. The portal's own *How to Download Files* page still describes
the member-only flow — "Become a verified member of the SMaHT Network … **AND** get added to
the portal user base at DAC" — while the *Creating an Account* and *Data Availability and
Access* pages both say a non-member may self-register and download open-access data. The two
newer pages are the access policy and are what this section follows; if self-registration is
refused, that older page names the contact who can add you.

### The dbGaP tier — and it is not open yet

Everything from human tissue — reads, alignments, germline variants, full donor metadata — is
controlled under the NIH Genomic Data Sharing Policy. Three facts change what is worth doing,
in this order:

**The binding constraint is consent, not paperwork.** The portal is explicit that the gate
exists "due to the nature of our donor consent agreement". These are post-mortem donors
consented for somatic mosaicism research in normal tissue; a question outside that scope is
not answerable with this data even after an application succeeds. Establish that the consent
covers your question first.

**Check whether you need the protected files at all.** For method development the answer is
usually no — the COLO829 and HapMap benchmarking data, the in-silico mixtures at known
allele fractions, and the published truth sets are the open tier, and they are precisely what
a detection method needs. The portal's own access table also marks *somatic* variants, gene
expression and epigenetic profiles from production donors as **open** when those are
released; it is reads, germline variants and full donor metadata that stay protected.

**The applications cannot be made today.** SMaHT has registered two dbGaP studies —
**phs004193** for Benchmarking and **phs004194** for Production — and neither resolves on
dbGaP as of 2026-08-27; `study.cgi?study_id=phs004193` redirects to the dbGaP front page. The
portal's own page says so plainly:

> We are in the process of releasing the SMaHT studies on dbGaP. Instructions on how to get
> protected data permission from dbGaP are coming soon.

So the honest answer to "how do I get the tissue data" is *not yet, and watch that page*.

What to do in the meantime, in order:

1. Confirm the open tier cannot answer the question. Run `triage()` above on the datasets you
   care about and look at what is actually withheld.
2. Read the papers. `type=Publication` on the portal lists the network paper and the
   benchmarking preprints, and their data-availability statements are where a study accession
   will be named first.
3. Ask the DAC — `smhelp@hms-dbmi.atlassian.net` — whether the study you need has been
   released, and register your portal account under the institutional email you will use on
   the dbGaP application. The portal states it will interface with dbGaP to authenticate
   approved users, and that an address mismatch will block access.
4. When the studies open, apply through dbGaP: a named investigator, an institutional signing
   official, a research use statement, a data access request and a data-use certification.
   Turnaround is weeks to months, and approvals are renewable and revocable.

**This skill cannot obtain dbGaP access and does not promise it.** An agent may usefully draft
a research use statement and checklist the requirements. It **must not fill in the
attestations** — IRB determination, data security plan, non-re-identification. Those are legal
claims published under a named person's name, and the signing official is the point of the
process.

## What the portal will not answer

- **It is not a variant browser.** There is no "somatic mutations near *TP53*" query. Fetch
  the VCFs and intersect them yourself, or slice a BAM as above.
- **There is no production tissue data.** 954 files are `Benchmarking` and none is
  `Production`. A question about somatic mosaicism across 150 donors is a question about a
  resource that does not exist publicly yet.
- **There is no FASTQ, and no histology.** `type=UnalignedReads` returns zero, and no file
  record in either tier carries `file_format=fastq` — reads are published aligned, as CRAM or
  BAM. Whether unaligned reads sit behind dbGaP is not answerable from outside it.
  `HistologyImage`, `PathologyReport` and `Protocol` are schema-only so far, with no records
  visible; the access table marks histology as open for production donors, which do not exist
  yet.
- **The `Assay` collection is a plan.** 26 of 40 assays have no released file.
- **Its `q=` is weak.** Free text over embedded metadata, not over paper full text. Filter on
  facet fields and use `q=` only to widen a search already scoped with `type=`.
- **Counts move.** Every number here is dated 2026-08-27, and the AWS Open Data registry
  entry lists the update frequency as bi-annual with continuous portal releases between.
  Treat exact totals as drift indicators, not invariants.

## Try it

**Data.** `SMAVCIX7BJ31` — an 11,724-byte somatic SNV VCF called by META-VISTA-seq on
COLO829BL, the lymphoblastoid normal of the COLO829 benchmarking pair, released open and
served from `smaht-open-data-public`. COLO829 is a commercially available cell line, and the
AWS Open Data registry entry describes this bucket as "publicly available data files without
restriction, including aligned reads from WGS and RNA-Seq, as well as variants identified from
cell line samples that are commercially available without restriction". No account is needed.
The run also touches one protected file's `open_data_url`, deliberately, to prove that it
refuses.

**Run.** In a fresh empty directory, with Python 3 (standard library only):

```bash
cat > try_smaht.py <<'PY'
import hashlib, json, urllib.error, urllib.parse, urllib.request

BASE = "https://data.smaht.org"
PUBLIC = "smaht-open-data-public.s3.amazonaws.com"
PROTECTED = "smaht-open-data-protected.s3.amazonaws.com"
OPEN_FILE = "SMAVCIX7BJ31"      # COLO829BL somatic SNV VCF, open tier
codes = {}


def search(item_type, *, limit=25, fields=(), **filters):
    """An empty result set is HTTP 404 with a full JSON body — unwrap it, do not raise."""
    params = [("type", item_type), ("format", "json"), ("limit", str(limit))]
    params += [("field", f) for f in fields]
    for key, value in filters.items():
        key = key.replace("__", ".")
        for v in (value if isinstance(value, (list, tuple)) else [value]):
            params.append((key, str(v)))
    url = f"{BASE}/search/?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=300) as r:
            body, code = json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        body, code = json.loads(e.read()), e.code
        if "total" not in body:
            raise
    codes[body["total"]] = code
    return body


def host(rec):
    return urllib.parse.urlparse(rec.get("open_data_url") or "").netloc or "(none)"


# 1. Response shape. Every /search/ answer carries these, whatever the type.
res = search("File", limit=1, fields=("accession",))
for key in ("@graph", "total", "facets", "filters", "notification", "columns", "sort"):
    assert key in res, f"missing {key}"
assert res["notification"] == "Success"
assert len(res["@graph"]) == 1 and res["@graph"][0]["@id"].startswith("/")
print(f"shape ok — {res['total']} files, {len(res['facets'])} facets")

# 2. An empty result set is a 404 carrying the ordinary envelope; a bad type is a 400.
empty = search("File", limit=0, status="nonesuch")
assert empty["total"] == 0 and empty["notification"] == "No results found"
assert codes[0] == 404 and len(empty["facets"]) > 0
try:
    search("Files", limit=0)
    raise AssertionError("an invalid type should raise")
except urllib.error.HTTPError as e:
    assert e.code == 400, e.code
print(f"empty result -> HTTP {codes[0]} with total=0 and {len(empty['facets'])} facets; "
      f"invalid type -> HTTP 400")

# 3. Three access fields, and only two of them agree with the file's real tier.
FF = ("accession", "status", "file_access_status", "access_status",
      "open_data_url", "file_size", "md5sum", "file_format.display_title")
allf = {r["accession"]: r for r in search("File", limit="all", fields=FF)["@graph"]}
n_open = sum(1 for r in allf.values() if r["status"] == "open")
n_fas = sum(1 for r in allf.values() if r.get("file_access_status") == "Open")
n_as = sum(1 for r in allf.values() if r.get("access_status") == "Open")
assert n_fas == n_open, (n_fas, n_open)
assert n_as < n_open, "access_status is a sample-level field and should undercount"
print(f"status=open {n_open}; file_access_status=Open {n_fas} (agrees); "
      f"access_status=Open {n_as} (undercounts by {n_open - n_as})")

# 4. THE trap: open_data_url is present on protected files, on a bucket that refuses you.
by_host = {}
for r in allf.values():
    by_host.setdefault((r["status"], host(r)), []).append(r)
assert {k for k in by_host if k[0] == "open"} <= {("open", PUBLIC), ("open", "(none)")}
assert {k for k in by_host if k[0] == "protected"} == {("protected", PROTECTED)}
n_prot_url = len(by_host[("protected", PROTECTED)])
print(f"{n_prot_url} protected files carry an open_data_url — all on {PROTECTED}")

# 5. The public bucket serves anonymously; the protected bucket does not.
rec = allf[OPEN_FILE]
assert host(rec) == PUBLIC and rec["status"] == "open"
with urllib.request.urlopen(rec["open_data_url"], timeout=300) as r:
    blob = r.read()
assert len(blob) == rec["file_size"] and hashlib.md5(blob).hexdigest() == rec["md5sum"]
assert blob.startswith(b"##fileformat=VCF")
try:
    urllib.request.urlopen(by_host[("protected", PROTECTED)][0]["open_data_url"], timeout=120)
    raise AssertionError("the protected bucket should refuse an anonymous read")
except urllib.error.HTTPError as e:
    assert e.code == 403, e.code
    denied = e.code
print(f"{OPEN_FILE} {rec['file_format']['display_title']} {len(blob):,} bytes, md5 matches; "
      f"protected bucket -> HTTP {denied}")
PY
python3 try_smaht.py
```

**Expect.**

```
shape ok — 1421 files, 22 facets
empty result -> HTTP 404 with total=0 and 22 facets; invalid type -> HTTP 400
status=open 350; file_access_status=Open 350 (agrees); access_status=Open 226 (undercounts by 124)
1071 protected files carry an open_data_url — all on smaht-open-data-protected.s3.amazonaws.com
SMAVCIX7BJ31 vcf 11,724 bytes, md5 matches; protected bucket -> HTTP 403
```

**Invariants** — a failure here means this skill is wrong, not that SMaHT moved:

- `notification == "Success"` and `@graph`/`total`/`facets`/`filters`/`columns`/`sort` present
  on every `/search/` response.
- A hit is HTTP 200; an empty result set is HTTP **404** carrying the same JSON envelope, with
  its facets intact; an invalid `type=` is HTTP **400**.
- `file_access_status == "Open"` on exactly the files with `status == "open"`, and
  `access_status == "Open"` on strictly fewer.
- Every `open` file's `open_data_url`, where present, is on the public bucket; every
  `protected` file's is on the protected bucket, and that bucket refuses anonymously with
  **403**.
- The downloaded bytes match both `file_size` and `md5sum` from the portal record.

**Observed values, 2026-08-27** — a mismatch here is drift to investigate:

- 1,421 files; 22 facets on `File`; 350 open and 1,071 protected.
- `access_status=Open` returns 226, undercounting the open tier by 124.
- `SMAVCIX7BJ31` is 11,724 bytes, md5 `d5589d26e2af17f1a1b43bac731f298f`, GRCh38 with ALT
  contigs.

## Sources

- SMaHT Data Portal — <https://data.smaht.org>
- Data availability and access, including the open-versus-protected table —
  <https://data.smaht.org/docs/access/data-availability-and-access>
- Creating an account, and who may self-register —
  <https://data.smaht.org/docs/access/creating-an-account>
- Protected data access and the dbGaP study accessions —
  <https://data.smaht.org/docs/access/getting-dbgap-access>
- Sample and file nomenclature —
  <https://data.smaht.org/docs/additional-resources/sample-file-nomenclature>
- AWS Open Data registry entry, which carries the bucket ARNs and the data-use statement —
  <https://registry.opendata.aws/smaht/>
- Somatic Mosaicism across Human Tissues Network. *Nature* 2025 — PMID:40604182
- Comprehensive benchmarking of somatic mutation detection by the SMaHT Network. *bioRxiv*
  2025 — PMID:41279200
- NIH Genomic Data Sharing Policy — <https://sharing.nih.gov/genomic-data-sharing-policy>
- NIH Common Fund SMaHT programme — <https://commonfund.nih.gov/smaht>

The portal asks that SMaHT data be cited as generated by the NIH Common Fund SMaHT Network,
naming the dbGaP study accessions (`phs004193` for Benchmarking, `phs004194` for Production)
and crediting the SMaHT Data Analysis Center under grant 1UM1DA058230.
