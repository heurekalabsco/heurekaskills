---
name: gdc
description: Query the NCI Genomic Data Commons (TCGA, TARGET, CPTAC) and download open-tier STAR gene counts, masked somatic MAFs, copy number segments and clinical tables pinned to a data release; controlled BAMs are described, never fetched.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [cancer, public-data, controlled-access, multi-omics, rna-seq]
covers: [gdc, genomic data commons, tcga, the cancer genome atlas, target, cptac, pan-cancer, tumor, tumour, somatic mutation, maf, star counts, gene expression, rna-seq, copy number, segment, methylation, clinical, survival, biospecimen, tcga barcode, sample type, gdc-client, wxs, breast, leukemia, lung, glioblastoma, neuroblastoma, human]
papers: [PMID:27653561, PMID:33619384, PMID:33619257, PMID:29625048]
access: [open, controlled]
datasets: [https://api.gdc.cancer.gov/status, https://api.gdc.cancer.gov/data/528628e5-34b8-41c7-a275-623b2bd05c2e, https://api.gdc.cancer.gov/data/04e03ae1-b2f3-446d-862d-172fea6320de, https://api.gdc.cancer.gov/history/97cdb8ea-b796-4814-b88e-60d59ebd4033]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-15
  against: GDC Data Release 46.0 (2026-08-10) / GDC API tag 8.5.0 / Python 3.12 standard library only / curl 8.7.1 / multi-record pass over TCGA-BRCA TCGA-LAML TCGA-SKCM TCGA-GBM TCGA-UCEC TARGET-AML TARGET-NBL CPTAC-3
  executed: 10
  unverified: 1
  unverified_reason: The gdc-client block was not run because the validating environment does not install third-party binaries; the same files were fetched through the API blocks and md5-checked. Re-run from a host with gdc-client installed.
---
# NCI Genomic Data Commons (GDC)

The GDC is the National Cancer Institute's home for harmonised cancer genomics: TCGA's 33
tumour types, the paediatric TARGET projects, CPTAC, and about sixty smaller programmes —
93 projects and 1,337,360 files in Data Release 46.0. Sequencing reads are re-aligned to
GRCh38 and re-processed through one set of GDC pipelines, so a STAR count table from TCGA-BRCA
and one from CPTAC-3 come out of the same workflow. Not every file went through that: the
23,135 `Simple Germline Variation` files are SNP-array genotype calls from the `Birdseed`
workflow, the `ABSOLUTE LiftOver` gene-level copy number is, as its workflow name says, lifted
over rather than re-derived, and clinical, biospecimen and slide files are not aligned to
anything. Read `analysis.workflow_type` before assuming a file came from reads.

It holds two tiers, and they must never be confused:

| tier | what is in it | who can get it |
|---|---|---|
| **open** | STAR gene counts, masked somatic MAFs, copy number segments and gene-level copy number, methylation beta values, miRNA quantification, RPPA, clinical and biospecimen supplements, slide images | anyone, no account |
| **controlled** | BAMs, raw and annotated VCFs, the **unmasked** aggregated MAF, splice-junction counts, germline variants, fusion and structural-variant calls | a researcher whose dbGaP request for that study has been approved |

This skill retrieves the open tier. It describes the controlled tier — what is there and what
getting it takes — and never fetches it. Nothing here needs an account or a key; every block except the
`gdc-client` one in Step 4 is Python standard library or `curl`.

**Terms of use, read 2026-11-15** from
[gdc.cancer.gov/access-data/data-access-policies](https://gdc.cancer.gov/access-data/data-access-policies).
Open data is governed by the NIH Genomic Data Sharing Policy, which the GDC states as:

> Any user accessing GDC open data must adhere to the NIH Genomic Data Sharing (GDS) Policy
> which indicates that investigators who download unrestricted-access data from NIH-designated
> data repositories should: Not attempt to identify individual human research participants
> from whom the data were obtained. Acknowledge in all oral or written presentations,
> disclosures, or publications the specific dataset(s) or applicable accession number(s) and
> the NIH-designated data repositories through which the investigator accessed any data.

and for the other tier:

> Any user requesting access to GDC controlled data must apply for dbGaP authorization, which
> is granted by an NIH Data Access Committee (DAC).

There is no non-commercial clause on the open tier. Two obligations travel with every file you
take: do not try to re-identify anyone, and cite the dataset and the GDC. The same page caps a
single IP at 250 concurrent connections — a parallel downloader has a ceiling.

## The release is the version, and the Legacy Archive is gone

```bash
curl -s https://api.gdc.cancer.gov/status
echo
curl -s -w '\nHTTP %{http_code}\n' 'https://api.gdc.cancer.gov/legacy/files?size=1'
```

```
{"commit":"8f7c2a51ab0084b216ad1b62a3fae8b945439c53","data_release":"Data Release 46.0 - August 10, 2026","data_release_version":{"major":46,"minor":0,"release_date":"2026-08-10"},"status":"OK","tag":"8.5.0","version":1}

The GDC Legacy Archive is no longer available. For assistance, contact the GDC Help Desk at support@nci-gdc.datacommons.io
HTTP 410
```

- **`data_release_version` is what you pin.** The API only ever serves the current release;
  there is no `?release=` parameter and no way to query the index as it stood at DR 40. So
  record the release number next to every file list you build, at the moment you build it.
  *Data releases move files* below shows what changes between releases.
- **The Legacy Archive answers `410 Gone`**, at `/legacy/...` and at `/v0/legacy/...`. Older
  tutorials route hg19 TCGA data (the pre-harmonisation level-3 files, HTSeq counts, the
  original MC3 calls) through it. None of that is reachable from the GDC any more; the
  sequencing-derived files it serves are GRCh38 from the current pipelines. Code that still
  calls `/legacy` needs rewriting, not retrying.

## Filters are JSON, and a wrong field name fails silently

Every search endpoint — `/projects`, `/cases`, `/files` — takes a `filters` object built from
`{"op": "in", "content": {"field": …, "value": […]}}` clauses joined by `and` / `or`. Send it
as a JSON POST body; as a GET parameter it has to be URL-encoded JSON. Three things about it
cost hours:

```python
import json, urllib.error, urllib.request

API = "https://api.gdc.cancer.gov"


def call(endpoint, body=None):
    """POST a JSON body (or GET when body is None). Returns (status, parsed JSON)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}/{endpoint}", data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as fh:
            return fh.status, json.load(fh)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def field_in(field, values):
    return {"op": "in", "content": {"field": field, "value": list(values)}}


def total(endpoint, filters):
    status, body = call(endpoint, {"filters": filters, "size": 0})
    return status, body["data"]["pagination"]["total"], body.get("warnings")


# 1. A misspelt FILTER field is not an error. 200, zero hits, empty warnings.
print("cases.project.project_id :", total("files", field_in("cases.project.project_id", ["TCGA-BRCA"])))
print("cases.project.projectid  :", total("files", field_in("cases.project.projectid", ["TCGA-BRCA"])))
print("project.project_id       :", total("files", field_in("project.project_id", ["TCGA-BRCA"])))

# 2. A misspelt FIELDS (return) name IS reported -- in warnings, with a 200.
status, body = call("cases/9d95a65b-e41d-4f93-92d4-99dce29ff40d"
                    "?fields=submitter_id,demographic.gender,demographic.sex_at_birth")
print("\nfields typo  :", status, body["data"], body["warnings"])

# 3. Malformed JSON is the one filter mistake that fails loudly.
status, body = call("files", {"filters": str(field_in("data_type", ["Masked Somatic Mutation"]))})
print("python repr  :", status, body["message"][-40:])


# So validate every filter field against the endpoint's own mapping before querying.
def checked(endpoint, filters):
    known = set(call(f"{endpoint}/_mapping")[1]["fields"])

    def walk(node):
        content = node["content"]
        if isinstance(content, list):
            for child in content:
                yield from walk(child)
        else:
            yield content["field"]

    unknown = sorted(set(walk(filters)) - known)
    if unknown:
        raise KeyError(f"/{endpoint} has no field(s) {unknown}; a query would return 0 silently")
    return filters


try:
    checked("files", field_in("project.project_id", ["TCGA-BRCA"]))
except KeyError as e:
    print("\nchecked()    :", e)
```

```
cases.project.project_id : (200, 71423, {})
cases.project.projectid  : (200, 0, {})
project.project_id       : (200, 0, {})

fields typo  : 200 {'submitter_id': 'TCGA-A7-A0CE', 'demographic': {'sex_at_birth': 'female'}} {'fields': 'unrecognized values: [demographic.gender]'}
python repr  : 400 tation']}} for filters is not valid json

checked()    : "/files has no field(s) ['project.project_id']; a query would return 0 silently"
```

- **A zero from the GDC is not evidence of absence until the field name is checked.** The
  misspelt field and the right field *on the wrong endpoint* both answer `200` with no hits and
  `warnings: {}`. On `/files` the project lives at `cases.project.project_id`; on `/cases` it
  is `project.project_id`. `/{endpoint}/_mapping` lists every valid field — 1,139 on `/files`,
  1,118 on `/cases` in DR 46.0 — and `checked()` turns the silent zero into an exception.
- **The data dictionary renames fields.** `demographic.gender` is now `demographic.sex_at_birth`;
  code written against the old name gets a warning and a missing key, never a crash. Read
  `warnings` on every response.
- **The API omits null fields rather than returning `null`.** A living patient's
  `demographic.days_to_death` is absent from the record, not empty. Use `.get()`.
- **Filter values are matched case-insensitively** — `tcga-brca` returns the same 71,423 files
  as `TCGA-BRCA`. Harmless, but do not rely on case to tell two things apart.
- **`size` defaults to 10.** A query without it returns ten hits and a `total` of 1.3 million;
  read `pagination.total` and page. No 10,000-row window was hit — `size=10001` and
  `from=50000` both worked — but large pages are slow, and latency swings from under a second
  to over a minute on the same call. Use long timeouts.
- **Keep `and` flat.** An `and` nested inside another `and` is accepted on its own, but the
  same filter with `facets` returns `500 internal server error`. Every block below flattens.

## The tier is per file, not per data type or workflow

Filter on `access` explicitly, every time. Neither the data type nor the workflow name decides
the tier:

```python
import json, urllib.request

API = "https://api.gdc.cancer.gov"


def post(endpoint, body):
    req = urllib.request.Request(f"{API}/{endpoint}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as fh:
        return json.load(fh)


def field_in(field, values):
    return {"op": "in", "content": {"field": field, "value": list(values)}}


def all_of(*clauses):
    """AND, kept flat: an 'and' nested in an 'and' plus facets is a 500."""
    flat = []
    for c in clauses:
        flat += c["content"] if c["op"] == "and" else [c]
    return {"op": "and", "content": flat}


def facet(filters, by):
    aggs = post("files", {"filters": filters, "size": 0, "facets": by})["data"]["aggregations"]
    return {b["key"]: b["doc_count"] for b in aggs[by]["buckets"]}


PROJECT = field_in("cases.project.project_id", ["TCGA-BRCA"])
tiers = {a: facet(all_of(PROJECT, field_in("access", [a])), "data_type")
         for a in ("open", "controlled")}
print(f"{'data_type':38} {'open':>6} {'controlled':>10}")
for dt in sorted(set(tiers["open"]) | set(tiers["controlled"]),
                 key=lambda k: (-(tiers["open"].get(k, 0) + tiers["controlled"].get(k, 0)), k)):
    print(f"{dt:38} {tiers['open'].get(dt, 0):>6} {tiers['controlled'].get(dt, 0):>10}")

# A workflow name does not pick a tier. Both of these workflows emit one open
# and one controlled data type, under the same name.
for wf in ("STAR - Counts", "Aliquot Ensemble Somatic Variant Merging and Masking"):
    split = {a: facet(all_of(PROJECT, field_in("analysis.workflow_type", [wf]),
                             field_in("access", [a])), "data_type") for a in ("open", "controlled")}
    print(f"\nworkflow {wf!r}\n   open {split['open']}\n   controlled {split['controlled']}")

# Nor does the data type, across the whole GDC.
everywhere = {a: facet(field_in("access", [a]), "data_type") for a in ("open", "controlled")}
both = sorted(set(everywhere["open"]) & set(everywhere["controlled"]))
print("\ndata types that are open in some projects and controlled in others:")
for dt in both:
    print(f"   {dt:32} open {everywhere['open'][dt]:>6}  controlled {everywhere['controlled'][dt]:>6}")
```

```
data_type                                open controlled
Annotated Somatic Mutation                  0      10781
Aligned Reads                               0       9282
Raw Simple Somatic Mutation                 0       6753
Transcript Fusion                           0       4924
Structural Rearrangement                    0       3976
Gene Level Copy Number                   3314          0
Copy Number Segment                      3256          0
Slide Image                              3112          0
Masked Intensities                       2476          0
Raw Intensities                             0       2263
Simple Germline Variation                   0       2263
Allele-specific Copy Number Segment      2257          0
Masked Copy Number Segment               2229          0
Biospecimen Supplement                   2205          0
Methylation Beta Value                   1238          0
Gene Expression Quantification           1231          0
Splice Junction Quantification              0       1231
Isoform Expression Quantification        1207          0
miRNA Expression Quantification          1207          0
Clinical Supplement                      1183          0
Pathology Report                         1105          0
Intermediate Analysis Archive               0       1027
Aggregated Somatic Mutation                 0        992
Masked Somatic Mutation                   992          0
Protein Expression Quantification         919          0

workflow 'STAR - Counts'
   open {'Gene Expression Quantification': 1231}
   controlled {'Splice Junction Quantification': 1231}

workflow 'Aliquot Ensemble Somatic Variant Merging and Masking'
   open {'Masked Somatic Mutation': 992}
   controlled {'Aggregated Somatic Mutation': 992}

data types that are open in some projects and controlled in others:
   Biospecimen Supplement           open  27914  controlled    516
   Clinical Supplement              open  15946  controlled    517
   Gene Expression Quantification   open  27843  controlled    472
   Masked Somatic Mutation          open  24498  controlled   2268
   Raw Intensities                  open   1426  controlled  24236
```

What this means for a query:

- **"Masked" means germline-filtered, not "open".** In TCGA the masked MAF is open, but 2,268
  masked MAFs are controlled elsewhere — 846 in TARGET, 497 in MATCH, 435 in BEATAML1.0, 207 in
  CGCI, 148 in OHSU, 70 in CPTAC, 51 in ORGANOID, 7 in HCMI and 7 in VAREPOP (counts by
  programme, DR 46.0). Gene expression is controlled for all 472 MATCH files.
- **Filtering on a workflow alone pulls in controlled files.** `STAR - Counts` emits the open
  gene-count table *and* the controlled splice-junction table; the MAF workflow emits the open
  masked MAF *and* the controlled unmasked one, with the same filename prefix
  (`…aliquot_ensemble_masked.maf.gz` against `…aliquot_ensemble_raw.maf.gz`). Filter on
  `data_type` *and* `access`.
- **Within the open TCGA tier, "masked" still matters.** `Copy Number Segment` (DNAcopy, from
  SNP6 arrays) keeps germline copy-number variants; `Masked Copy Number Segment` is the same
  segmentation with them removed (`nocnv` in the filename). For somatic copy number, use the
  masked one.

**A facet ignores the filter on its own field.** Filter to `access=open` and facet on
`access`, and the response still carries a `controlled` bucket — 43,492 of them for TCGA-BRCA,
beside a `total` of 27,931. The facet answers "what would the other values give", which is
what a portal sidebar wants and not what a count wants. Count with `pagination.total`, and only
facet on fields you did not filter.

## Barcodes, sample types, and why a filter on a normal returns tumours

Key on the GDC UUID — `case_id`, `file_id` — and carry the submitter id as a label. The
submitter id is where the trap is: TCGA's barcode encodes the sample type, other programmes'
ids do not, and the API has the answer in a field.

```python
import json, urllib.request
from collections import Counter, defaultdict

API = "https://api.gdc.cancer.gov"


def post(endpoint, body):
    req = urllib.request.Request(f"{API}/{endpoint}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as fh:
        return json.load(fh)["data"]


def field_in(field, values):
    return {"op": "in", "content": {"field": field, "value": list(values)}}


def all_of(*clauses):
    flat = []
    for c in clauses:
        flat += c["content"] if c["op"] == "and" else [c]
    return {"op": "and", "content": flat}


def samples(project):
    data = post("cases", {"filters": field_in("project.project_id", [project]), "size": 5000,
                          "fields": "submitter_id,samples.submitter_id,samples.sample_type"})
    if len(data["hits"]) < data["pagination"]["total"]:
        raise RuntimeError(f"{project}: {data['pagination']['total']} cases; raise size or page")
    for case in data["hits"]:
        for s in case.get("samples", []):
            yield s["submitter_id"], s.get("sample_type", "<field absent>")


# TCGA: the two digits after the participant are the sample type. Check, don't trust.
for project in ("TCGA-BRCA", "TCGA-LAML"):
    by_code = defaultdict(Counter)
    for barcode, kind in samples(project):
        by_code[barcode[13:15]][kind] += 1
    print(project)
    for code in sorted(by_code):
        print(f"   {code}  {dict(by_code[code])}")

# CPTAC-3: the trailing number is NOT a sample-type code.
by_suffix = defaultdict(Counter)
for sid, kind in samples("CPTAC-3"):
    tail = sid.rsplit("-", 1)[-1]
    if sid.startswith(("C3L-", "C3N-")) and tail in ("01", "10", "11"):
        by_suffix[tail][kind] += 1
print("CPTAC-3")
for tail in sorted(by_suffix):
    print(f"   -{tail} {dict(by_suffix[tail])}")

# A filter on a nested sample field matches a file if ANY linked sample matches.
# Every masked MAF links its tumour AND its matched normal, so "normal" matches all.
mafs = all_of(field_in("cases.project.project_id", ["TCGA-BRCA"]),
              field_in("data_type", ["Masked Somatic Mutation"]))
n_all = post("files", {"filters": mafs, "size": 0})["pagination"]["total"]
n_normal = post("files", {"filters": all_of(mafs, field_in(
    "cases.samples.sample_type", ["Blood Derived Normal", "Solid Tissue Normal"])),
    "size": 0})["pagination"]["total"]
print(f"\nTCGA-BRCA masked MAFs: {n_all}; of those 'linked to a normal sample': {n_normal}")
```

```
TCGA-BRCA
   01  {'Primary Tumor': 2173}
   06  {'Metastatic': 8}
   10  {'Blood Derived Normal': 1054}
   11  {'Solid Tissue Normal': 162}
TCGA-LAML
   03  {'Primary Blood Derived Cancer - Peripheral Blood': 356}
   11  {'Solid Tissue Normal': 340}
   12  {'Buccal Cell Normal': 1}
CPTAC-3
   -01 {'Primary Tumor': 1050, 'Solid Tissue Normal': 19}
   -10 {'Solid Tissue Normal': 11, 'Primary Tumor': 1}
   -11 {'Primary Tumor': 125}

TCGA-BRCA masked MAFs: 992; of those 'linked to a normal sample': 992
```

A TCGA barcode reads `TCGA-A7-A0CE-01A-11W-A019-09`: project `TCGA`, tissue source site `A7`,
participant `A0CE` (those three are the case `submitter_id`), then sample type `01` with vial
`A` (the sample), then portion, analyte, plate and centre (the aliquot). Characters 14–15 are
the sample type, and across all 11,428 TCGA cases they agree with `samples.sample_type` almost
everywhere: `01` primary tumour, `02` recurrent, `03` primary blood-derived cancer, `05`
additional new primary, `06` metastatic, `07` additional metastatic, `10` blood-derived normal,
`11` solid-tissue normal, `12` buccal normal, `14` bone-marrow normal. The exceptions in DR 46.0
are ten `01` samples typed `FFPE Scrolls`, one `01` typed `Recurrent Tumor`, and two `11`
samples with no `sample_type` at all.

**Do not generalise the rule.** Three counter-examples from the run above and the multi-project
pass:

- **"Tumour is 01" is false for leukaemia.** TCGA-LAML has no `01` at all — its tumours are
  `03`, and its normals are `11`. A `01`-only filter returns an empty LAML cohort.
- **CPTAC's trailing number is a serial, not a code.** `C3N-…-01` is a solid-tissue normal 19
  times in CPTAC-3; `-10` is mostly normal tissue, where in TCGA `10` is blood. Parsing CPTAC
  ids with the TCGA rule mislabels tumours as normals and the reverse.
- **TARGET ids grow extra segments** — `TARGET-20-PAVESI-EOI2-14A`,
  `TARGET-20-PAYGYM-Sorted-leukemic-09A`, cell-line and model ids like `TARGET-20-ML1-50A` —
  so fixed character offsets land in the wrong segment. In TARGET-AML, 1,835 of 3,227
  STAR-count files are bone-marrow primaries (`09`) and 412 are recurrent bone marrow (`04`).

So read `samples.sample_type` (and `samples.tissue_type`, `Tumor` / `Normal`) from the API and
treat the barcode as a label. The field can be missing outright — 21 CPTAC-3 STAR-count files
have samples with no `sample_type` key — so use `.get()`.

**And a filter on a sample field is "any linked sample".** A masked MAF is a tumour–normal pair
and is linked to both, so every one of the 992 TCGA-BRCA masked MAFs matches a filter for
normal samples. Copy number depends on the workflow. Every TCGA-BRCA DNAcopy file — all 2,229
`Masked Copy Number Segment` and the 2,229 DNAcopy `Copy Number Segment` — links exactly one
sample, and DNAcopy segments exist *for the normal samples themselves* (`…-10A`, `…-11A`), so a
normal-sample filter there returns the normals' own segmentations. The `GATK4 CNV` segments
(1,027) and the ASCAT2, ASCAT3 and AscatNGS allele-specific and gene-level files link two
samples, tumour and normal, like a MAF. Filter broadly, then decide per file from its own `cases.samples` list — or, inside a MAF, from
`Tumor_Sample_Barcode`. The same applies to `format=TSV` output, which flattens samples into
`cases.0.samples.0.sample_type`, `cases.0.samples.1.sample_type` with the normal frequently in
position 0.

## Data releases move files under new UUIDs

A file UUID is permanent, but it does not always stay current. When the GDC reprocesses or
re-headers a file, the new version gets a **new UUID** and the old one drops out of the index:

```python
import hashlib, json, urllib.error, urllib.request

API = "https://api.gdc.cancer.gov"
OLD = "97cdb8ea-b796-4814-b88e-60d59ebd4033"   # a masked MAF as released in DR 32.0


def get(path):
    try:
        with urllib.request.urlopen(f"{API}/{path}", timeout=600) as fh:
            return fh.status, fh.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


# The current index has never heard of it ...
status, body = get(f"files/{OLD}")
print(f"/files/{OLD[:8]}…        HTTP {status} {json.loads(body)['message'][:22]}…")

# ... /history says what replaced it, and in which data release ...
status, body = get(f"history/{OLD}")
for v in json.loads(body):
    print(f"/history  v{v['version']}  {v['uuid']}  {v['file_change']:10} DR {v['data_release']}"
          f"  {v['release_date']}")

# ... /files/versions gives both md5s and every release the latest copy is in ...
status, body = get(f"files/versions/{OLD}")
v = json.loads(body)[0]
print(f"/files/versions  md5 {v['md5']} -> latest {v['latest_id'][:8]}… md5 {v['latest_md5']}"
      f"  in DR {v['latest_release'][0]}–{v['latest_release'][-1]}")

# ... and /data still serves the superseded bytes, flagged only by the status code.
status, old = get(f"data/{OLD}")
status_new, new = get(f"data/{v['latest_id']}")
print(f"/data old  HTTP {status}  md5 {hashlib.md5(old).hexdigest()}  {len(old):,} B")
print(f"/data new  HTTP {status_new}  md5 {hashlib.md5(new).hexdigest()}  {len(new):,} B")
```

```
/files/97cdb8ea…        HTTP 404 97cdb8ea-b796-4814-b88…
/history  v2  528628e5-34b8-41c7-a275-623b2bd05c2e  released   DR 35.0  2022-09-28
/history  v1  97cdb8ea-b796-4814-b88e-60d59ebd4033  superseded DR 32.0  2022-03-29
/files/versions  md5 5f5391ceb63decf90d0a442b8126050a -> latest 528628e5… md5 a6c9f2c3ad9a40b918e934dc86113c37  in DR 35.0–46.0
/data old  HTTP 203  md5 5f5391ceb63decf90d0a442b8126050a  39,292 B
/data new  HTTP 200  md5 a6c9f2c3ad9a40b918e934dc86113c37  39,292 B
```

Four things follow:

- **A UUID list from an old paper still downloads.** `/data` serves a superseded file with
  **`203 Non-Authoritative Information`** — a 2xx, so `raise_for_status()` passes. Check for
  exactly `200`, and send any 203 through `/history` to find its replacement.
- **The same UUID will not be found by search.** `/files/{uuid}` is `404` and a `file_id`
  filter returns zero hits, so a "which of my files still exist" check against search reports a
  live file as deleted.
- **A new UUID is not always new data.** In this MAF only the `#filedate` header line changed
  (20211014 → 20220517); the 39,292-byte size is identical and the md5 is not. Diff before
  concluding results moved.
- **`/files/versions/{uuid}` is the release map.** `latest_release` lists every data release
  that carries the current copy — DR 32.0 through 46.0 for the STAR-count file used below,
  which first appeared in DR 32.0. That is the release in which the GDC dropped HTSeq: its
  release notes say "Files from the HTSeq pipeline are no longer supported", and normalised
  counts moved into STAR-Counts
  (<https://docs.gdc.cancer.gov/Data/Release_Notes/Data_Release_Notes/>). That list is
  how you state "this file is unchanged since DR 32".

## Reading what you downloaded — and joining on Ensembl ids

The two open files most people want are the STAR gene counts and the masked MAF. Both carry an
Ensembl gene id, and that is the join key, not the gene symbol:

```python
import csv, gzip, urllib.request
from collections import Counter

DATA = "https://api.gdc.cancer.gov/data"
STAR = "04e03ae1-b2f3-446d-862d-172fea6320de"   # TCGA-A7-A0CE-01A, STAR - Counts
MAF = "528628e5-34b8-41c7-a275-623b2bd05c2e"    # TCGA-A7-A0CE, masked somatic MAF


def fetch(file_id):
    with urllib.request.urlopen(f"{DATA}/{file_id}", timeout=600) as fh:
        if fh.status != 200:
            raise RuntimeError(f"{file_id}: HTTP {fh.status}")
        return fh.read()


def read_star_counts(raw):
    """One row per gene, keyed on the UNVERSIONED Ensembl id.

    Four traps: a '# gene-model' comment line before the header; four N_* summary
    rows that are not genes; versioned ids (ENSG00000000003.15); and 44 _PAR_Y
    rows whose unversioned id repeats an X-chromosome gene, all zero."""
    lines = raw.decode().splitlines()
    model = lines[0]
    reader = csv.DictReader(lines[1:], delimiter="\t")
    genes, skipped = {}, Counter()
    for row in reader:
        gid = row["gene_id"]
        if gid.startswith("N_"):
            skipped["N_ summary row"] += 1
            continue
        if gid.endswith("_PAR_Y"):
            skipped["_PAR_Y copy"] += 1
            continue
        base = gid.split(".")[0]
        if base in genes:
            raise ValueError(f"duplicate gene id {base}")
        genes[base] = row
    return model, genes, skipped


def read_maf(raw):
    lines = gzip.decompress(raw).decode().splitlines()
    meta = [ln for ln in lines if ln.startswith("#")]
    rows = list(csv.DictReader((ln for ln in lines if not ln.startswith("#")), delimiter="\t"))
    return meta, rows


model, genes, skipped = read_star_counts(fetch(STAR))
print(f"STAR counts : {model!r}, {len(genes)} genes, skipped {dict(skipped)}")
sym = Counter(r["gene_name"] for r in genes.values())
print(f"              {sum(1 for n in sym.values() if n > 1)} gene symbols name more than one "
      f"gene id, e.g. MATR3 x{sym['MATR3']}, PDE11A x{sym['PDE11A']}")

meta, variants = read_maf(fetch(MAF))
print(f"masked MAF  : {len(variants)} variants, {len(meta)} '#' lines, e.g. {meta[1]!r}")
print(f"              tumour {variants[0]['Tumor_Sample_Barcode']}  "
      f"normal {variants[0]['Matched_Norm_Sample_Barcode']}")

# Join mutation to expression on Ensembl id, never on symbol.
hits = [(v["Hugo_Symbol"], v["Gene"], v["Variant_Classification"],
         float(genes[v["Gene"]]["tpm_unstranded"])) for v in variants
        if v["Gene"] in genes and v["Variant_Classification"] in (
            "Nonsense_Mutation", "Frame_Shift_Del", "Frame_Shift_Ins", "Splice_Site")]
missing = [v["Gene"] for v in variants if v["Gene"] not in genes]
print(f"              {len(missing)} MAF gene ids absent from the counts table")
for symbol, gid, kind, tpm in sorted(hits, key=lambda h: -h[3]):
    print(f"   {symbol:8} {gid}  {kind:18} TPM {tpm:9.3f}")
```

```
STAR counts : '# gene-model: GENCODE v36', 60616 genes, skipped {'N_ summary row': 4, '_PAR_Y copy': 44}
              67 gene symbols name more than one gene id, e.g. MATR3 x2, PDE11A x2
masked MAF  : 107 variants, 7 '#' lines, e.g. '#annotation.spec gdc-2.0.0-aliquot-merged-masked'
              tumour TCGA-A7-A0CE-01A-11W-A019-09  normal TCGA-A7-A0CE-10A-01W-A021-09
              0 MAF gene ids absent from the counts table
   FAM171A1 ENSG00000148468  Nonsense_Mutation  TPM    39.932
   STRN4    ENSG00000090372  Nonsense_Mutation  TPM    25.697
   NIPBL    ENSG00000164190  Frame_Shift_Ins    TPM    17.396
   EYA4     ENSG00000112319  Splice_Site        TPM     9.771
   MYCT1    ENSG00000120279  Nonsense_Mutation  TPM     6.636
   TRERF1   ENSG00000124496  Nonsense_Mutation  TPM     2.704
   ANK1     ENSG00000029534  Nonsense_Mutation  TPM     0.768
   SALL1    ENSG00000103449  Frame_Shift_Del    TPM     0.211
```

**Why ids and not symbols.** In the GENCODE v36 table behind every STAR-count file, 67 symbols
name two or more distinct Ensembl genes (`MATR3`, `PDE11A`, …) once the `_PAR_Y` copies are
dropped, and 110 if they are kept. A symbol join silently doubles those rows or picks one at
random. On the most mutated TCGA-UCEC tumour in DR 46.0 (`TCGA-A5-A0G2`, 31,298 variants in
12,375 genes), 15 of the mutated genes hit more than one row by symbol (`VAMP7`, `AKAP17A`,
`CCDC39`, `GTPBP6`, …); by unversioned Ensembl id every one of the 12,375 matched exactly once.

The STAR table, column by column:

- `unstranded`, `stranded_first`, `stranded_second` are raw read counts; which strand column
  is right depends on the library protocol. `tpm_unstranded`, `fpkm_unstranded` and
  `fpkm_uq_unstranded` are normalised values shipped alongside. Raw counts go into a
  count-based model such as `pydeseq2`; never feed it TPM.
- The ids carry a version suffix (`ENSG00000000003.15`) from GENCODE v36. Strip it to join to
  a MAF (whose `Gene` column is unversioned) or to anything keyed on a current release; the
  `ensembl` skill covers resolving ids that have since been retired.
- `_PAR_Y` rows are the pseudo-autosomal copies on chrY, always zero; drop them or the
  stripped id collides with the chrX gene.

The masked MAF has 140 columns and seven `#` header lines naming the tumour and normal aliquot
UUIDs. One file is one tumour–normal pair, not one patient: a case with two tumour aliquots has
two MAFs (three for `C3L-01032` in CPTAC-3).

Copy number segment files (`…seg.v2.txt`) have six columns — `GDC_Aliquot, Chromosome, Start,
End, Num_Probes, Segment_Mean` — and `GDC_Aliquot` is an aliquot **UUID**, not a barcode. Map it
back with a `/cases` filter on `samples.portions.analytes.aliquots.aliquot_id` — which, being a
nested field, returns the whole case, so pick the matching aliquot out of the response.

## Get the files

Three things land on disk: the file list as a manifest pinned to the release, the files
themselves with md5s checked, and a clinical table. The block takes cases by `submitter_id`
across four projects, deliberately — a TCGA solid tumour, a TCGA leukaemia, a TARGET case and a
CPTAC case — because each breaks a different assumption above.

**Step 1 — manifest, sample map and downloads.**

```python
import csv, datetime, hashlib, json, os, time, urllib.error, urllib.request

API = "https://api.gdc.cancer.gov"
OUT = "Data/gdc"
CASES = ["TCGA-A7-A0CE", "TCGA-AB-2826", "TARGET-30-PARBAJ", "C3L-01032"]
WANTED = [  # (data_type, workflow) -- both, because one workflow can emit two tiers
    ("Gene Expression Quantification", "STAR - Counts"),
    ("Masked Somatic Mutation", "Aliquot Ensemble Somatic Variant Merging and Masking"),
    ("Masked Copy Number Segment", "DNAcopy"),
]
FIELDS = ("file_id,file_name,md5sum,file_size,state,access,data_type,analysis.workflow_type,"
          "cases.case_id,cases.submitter_id,cases.project.project_id,"
          "cases.samples.submitter_id,cases.samples.sample_type,cases.samples.tissue_type")


def call(endpoint, body=None, tries=4):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(tries):
        req = urllib.request.Request(f"{API}/{endpoint}", data=data,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=600) as fh:
                return fh.status, fh.read()
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == tries - 1:
                raise
        time.sleep(2 ** attempt)


def field_in(field, values):
    return {"op": "in", "content": {"field": field, "value": list(values)}}


def all_of(*clauses):
    flat = []
    for c in clauses:
        flat += c["content"] if c["op"] == "and" else [c]
    return {"op": "and", "content": flat}


def search(filters, page=500):
    """Every hit, paged on a stable sort. size defaults to 10 if you forget it."""
    out, start = [], 0
    while True:
        _, raw = call("files", {"filters": filters, "fields": FIELDS, "size": page,
                                "from": start, "sort": "file_id:asc"})
        data = json.loads(raw)["data"]
        out += data["hits"]
        start += page
        if start >= data["pagination"]["total"]:
            return out


release = json.loads(call("status")[1])["data_release_version"]
tag = f"DR{release['major']}.{release['minor']}"
os.makedirs(f"{OUT}/{tag}", exist_ok=True)

hits = []
for data_type, workflow in WANTED:
    hits += search(all_of(field_in("cases.submitter_id", CASES),
                          field_in("data_type", [data_type]),
                          field_in("analysis.workflow_type", [workflow]),
                          field_in("access", ["open"])))
assert all(h["access"] == "open" for h in hits)

# The manifest gdc-client reads: id, filename, md5, size, state -- tab separated.
manifest = f"{OUT}/{tag}/gdc_manifest.txt"
with open(manifest, "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t", lineterminator="\n")
    w.writerow(["id", "filename", "md5", "size", "state"])
    for h in hits:
        w.writerow([h["file_id"], h["file_name"], h["md5sum"], h["file_size"], h["state"]])

# One row per (file, sample) -- a MAF links a tumour and its normal; a DNAcopy segment one sample.
with open(f"{OUT}/{tag}/samples.tsv", "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t", lineterminator="\n")
    w.writerow(["file_id", "data_type", "project_id", "case_id", "case_submitter_id",
                "sample_submitter_id", "sample_type", "tissue_type"])
    for h in hits:
        for c in h["cases"]:
            for s in c.get("samples", []):
                w.writerow([h["file_id"], h["data_type"], c["project"]["project_id"],
                            c["case_id"], c["submitter_id"], s["submitter_id"],
                            s.get("sample_type", ""), s.get("tissue_type", "")])

for h in hits:
    dest = f"{OUT}/{tag}/{h['file_id']}/{h['file_name']}"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    status, raw = call(f"data/{h['file_id']}")
    if status != 200:          # 203 = a superseded file; never keep it silently
        raise RuntimeError(f"{h['file_id']}: HTTP {status}")
    if hashlib.md5(raw).hexdigest() != h["md5sum"]:
        raise RuntimeError(f"{h['file_id']}: md5 mismatch")
    with open(dest, "wb") as out:
        out.write(raw)

with open(f"{OUT}/{tag}/provenance.json", "w") as fh:
    json.dump({"source": API, "data_release": release, "fetched": datetime.date.today().isoformat(),
               "cases": CASES, "wanted": WANTED, "files": len(hits),
               "terms": "NIH Genomic Data Sharing Policy, open-access tier"}, fh, indent=2)

print(f"{tag}: {len(hits)} files, {sum(h['file_size'] for h in hits):,} B, md5 verified")
# Coverage = files linked to a TUMOUR sample of the case. Keying on the case alone
# would count a case whose only file of a type is its normal's.
tumour = {}
for h in hits:
    for c in h["cases"]:
        if any(s.get("tissue_type", "").lower() == "tumor" for s in c.get("samples", [])):
            key = (c["submitter_id"], h["data_type"])
            tumour[key] = tumour.get(key, 0) + 1
print("tumour-sample files per case:")
for case in CASES:
    row = [str(tumour.get((case, dt), "--")) for dt, _ in WANTED]
    print(f"   {case:17} counts {row[0]:2}  masked MAF {row[1]:2}  masked CN {row[2]}")
```

```
DR46.0: 16 files, 25,872,827 B, md5 verified
tumour-sample files per case:
   TCGA-A7-A0CE      counts 1   masked MAF 1   masked CN 1
   TCGA-AB-2826      counts 1   masked MAF 1   masked CN 1
   TARGET-30-PARBAJ  counts 2   masked MAF --  masked CN --
   C3L-01032         counts 1   masked MAF 3   masked CN --
```

Read the coverage grid before the files. `TARGET-30-PARBAJ` has RNA-seq and no exome in the
GDC at all — a case with expression is not a case with mutations. CPTAC-3 has no DNAcopy
(SNP6 array) segments; its copy number is `GATK4 CNV` and `AscatNGS` output, so a masked-segment
filter finds nothing there. The grid counts files linked to a **tumour** sample
(`tissue_type` `Tumor`), so a case whose only file of a type belonged to its normal would show
`--`. The sixteen files are more than the grid: `TCGA-A7-A0CE` also brings a normal STAR table
and two normal segment files (blood and tissue), `TCGA-AB-2826` a normal segment file — each
DNAcopy segment file is one sample — while `TARGET-30-PARBAJ`'s two STAR tables are its primary
and its recurrence, and `C3L-01032` has three MAFs. `samples.tsv` is the table that says which
file is which sample — use it, not the filename.

The output tree is `Data/gdc/DR46.0/<file_id>/<file_name>`, the layout `gdc-client` uses, beside
`gdc_manifest.txt`, `samples.tsv` and `provenance.json`. Name the release directory from
`/status` at fetch time, as the block does, rather than hardcoding it, and point later steps
at the directory that run wrote — not at a fresh `/status` read, which names a different
directory once the GDC moves to the next release.

**Step 2 — clinical, from `/cases`.** The per-case clinical fields come straight from the API,
which is easier to join than the BCR XML supplements:

```python
import csv, json, os, urllib.request

API = "https://api.gdc.cancer.gov"
PROJECT = "TCGA-BRCA"
COLUMNS = ["case_id", "submitter_id", "demographic.sex_at_birth", "demographic.vital_status",
           "demographic.days_to_death", "diagnoses.age_at_diagnosis",
           "diagnoses.primary_diagnosis", "diagnoses.days_to_last_follow_up"]


def post(endpoint, body):
    req = urllib.request.Request(f"{API}/{endpoint}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as fh:
        return json.load(fh)


def pick(record, dotted):
    """Walk a dotted path. A list (diagnoses) yields every element's value, so a
    case with two diagnoses is visible rather than silently reduced to the first.
    A key the API omitted -- it omits nulls -- comes back as ''."""
    values = [record]
    for key in dotted.split("."):
        nxt = []
        for v in values:
            v = v.get(key) if isinstance(v, dict) else None
            nxt += v if isinstance(v, list) else [v]
        values = nxt
    return ";".join("" if v is None else str(v) for v in values)


status = post("cases", {"filters": {"op": "in", "content": {
    "field": "project.project_id", "value": [PROJECT]}}, "size": 5000,
    "fields": ",".join(COLUMNS)})
warnings, hits = status["warnings"], status["data"]["hits"]
if warnings:
    raise KeyError(f"unrecognised fields: {warnings}")
assert len(hits) == status["data"]["pagination"]["total"], "raise size or page"

os.makedirs("Data/gdc", exist_ok=True)
dest = f"Data/gdc/{PROJECT}_clinical.tsv"
with open(dest, "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t", lineterminator="\n")
    w.writerow(COLUMNS)
    for h in sorted(hits, key=lambda h: h["submitter_id"]):
        w.writerow([pick(h, c) for c in COLUMNS])

rows = list(csv.DictReader(open(dest), delimiter="\t"))
dead = [r for r in rows if r["demographic.vital_status"] == "Dead"]
multi = [r for r in rows if ";" in r["diagnoses.age_at_diagnosis"]]
print(f"{dest}: {len(rows)} cases, {len(dead)} dead, "
      f"{sum(1 for r in dead if r['demographic.days_to_death'])} of them with days_to_death, "
      f"{len(multi)} with more than one diagnosis")
print("age_at_diagnosis is in DAYS:", rows[0]["submitter_id"], rows[0]["diagnoses.age_at_diagnosis"])
```

```
Data/gdc/TCGA-BRCA_clinical.tsv: 1098 cases, 152 dead, 151 of them with days_to_death, 182 with more than one diagnosis
age_at_diagnosis is in DAYS: TCGA-3C-AAAU 22019;20211
```

- **`diagnoses` is a list, and 182 of 1,098 TCGA-BRCA cases have more than one entry** — a
  second primary, recorded with its own age. `diagnoses[0]` is not "the" diagnosis, and its
  order is not chronological (`TCGA-3C-AAAU` lists 22019 days before 20211). Choose the
  diagnosis whose `primary_diagnosis` matches the project's tumour, deliberately.
- **Ages and intervals are in days.** 22,019 days is 60.3 years.
- **`Dead` without `days_to_death` happens** — 1 of 152 in TCGA-BRCA, 13 of 133 in TCGA-LAML.
  An overall-survival table built from these needs a rule for them; the `survival-analysis`
  skill covers censoring. The same block run on TARGET-AML (2,492 cases) and CPTAC-3 (1,866)
  found every death dated and no multi-diagnosis cases; TARGET-AML's normal bone-marrow donors
  (`TARGET-00-BM…`) have no diagnosis at all.

**Step 3 — bulk: one request, one tarball.** For more than a handful of files, POST the ids to
`/data` and receive a single `tar.gz`; `/manifest` turns the same ids into a `gdc-client`
manifest:

```bash
mkdir -p Data/gdc/bulk
IDS='{"ids":["528628e5-34b8-41c7-a275-623b2bd05c2e","04e03ae1-b2f3-446d-862d-172fea6320de"]}'

# Two or more ids: one tar.gz with a MANIFEST.txt and one directory per file UUID.
curl -sS -o Data/gdc/bulk/batch.tar.gz -X POST -H 'Content-Type: application/json' \
  -d "$IDS" https://api.gdc.cancer.gov/data
tar tzf Data/gdc/bulk/batch.tar.gz

# The same ids as a gdc-client manifest (id, filename, md5, size, state).
curl -sS -o Data/gdc/bulk/gdc_manifest.txt -X POST -H 'Content-Type: application/json' \
  -d "$IDS" https://api.gdc.cancer.gov/manifest
cat Data/gdc/bulk/gdc_manifest.txt; echo

# One controlled id in the batch refuses the whole batch.
curl -sS -w ' HTTP %{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{"ids":["528628e5-34b8-41c7-a275-623b2bd05c2e","67c05840-b651-445f-99b9-12142b566acf"]}' \
  https://api.gdc.cancer.gov/data
```

```
MANIFEST.txt
528628e5-34b8-41c7-a275-623b2bd05c2e/affeafc3-20c4-47df-8d28-063e04a07437.wxs.aliquot_ensemble_masked.maf.gz
04e03ae1-b2f3-446d-862d-172fea6320de/58b399a0-3070-44aa-9a40-f0e2c0fea0fc.rna_seq.augmented_star_gene_counts.tsv
id	filename	md5	size	state
528628e5-34b8-41c7-a275-623b2bd05c2e	affeafc3-20c4-47df-8d28-063e04a07437.wxs.aliquot_ensemble_masked.maf.gz	a6c9f2c3ad9a40b918e934dc86113c37	39292	validated
04e03ae1-b2f3-446d-862d-172fea6320de	58b399a0-3070-44aa-9a40-f0e2c0fea0fc.rna_seq.augmented_star_gene_counts.tsv	595a4c3f329ee1612c746f09ed07e137	4245525	validated
{"message":"Not authorized to download: 67c05840-b651-445f-99b9-12142b566acf."}
 HTTP 403
```

- **A POST with exactly one id returns the bare file, not a tarball** — code that always runs
  `tar` on the result breaks on a one-file query.
- **`/manifest` does not filter by tier.** It wrote a line for the controlled
  `…aliquot_ensemble_raw.maf.gz` when asked; the 403 only arrives at download. Build manifests
  from an `access=open` search, as Step 1 does.
- **Neither the tarball nor the manifest keeps a fixed order** — two runs on 2026-11-15
  listed the same two files in opposite orders. Match members by UUID, not position.
- **The tarball is not md5-checked for you.** Extract it into its own empty directory and
  verify each member against the manifest's `md5` column.

**Step 4 — the GDC Data Transfer Tool, for anything large.** `gdc-client` resumes interrupted
transfers and parallelises, which matters for BAM-sized data. It is Apache-2.0 and maintained at
github.com/NCI-GDC/gdc-client; the GitHub repository carries tags (2.7.0 on 2026-10-30) but no
release binaries, and the GDC's transfer-tool page at
gdc.cancer.gov/access-data/gdc-data-transfer-tool offered 2.3 zips for macOS, Ubuntu and Windows
on 2026-11-15. It is not on PyPI. Given the manifest from Step 1:

```bash
# The manifest Step 1 wrote most recently -- not hardcoded, not re-read from /status.
MANIFEST=$(ls -t Data/gdc/DR*/gdc_manifest.txt | head -1)
gdc-client download -m "$MANIFEST" -d "$(dirname "$MANIFEST")"
```

For controlled files the same command takes `-t <token file>`, the token downloaded from the
GDC Data Portal after an eRA Commons login with an approved dbGaP project. Without one, every
controlled file is the 403 shown above.

## Requesting access

Everything above is open to anyone. This section is about the controlled tier — BAMs, raw VCFs,
the unmasked MAFs that keep germline and low-confidence calls, germline variants — and about
where this skill stops. **This skill cannot obtain controlled data, makes no request on
anyone's behalf, and does not predict that an application will succeed.**

**First decide whether you need it.** The open masked MAFs, STAR counts and masked segments
answer most somatic questions. The controlled tier is for re-calling variants, germline work,
reads-level analysis (re-alignment, allele-specific expression, fusion discovery) or the
unfiltered calls.

**What it may be used for.** Each programme's controlled data sits under a dbGaP study, and
the study's consent groups and data use limitations — not the application — decide whether
your question is allowed. The accession is on the project record:

| programme | dbGaP study | where the GDC records it |
|---|---|---|
| TCGA | `phs000178` | `program.dbgap_accession_number` |
| TARGET | `phs000218`, plus a per-project study (`phs000465` TARGET-AML, `phs000467` TARGET-NBL) | both fields |
| CPTAC-3 | `phs001287` | `dbgap_accession_number` |
| CPTAC-2 | `phs000892` | `dbgap_accession_number` |

Read the study's consent groups and use limitations before anything else; the `dbgap` skill
reads them from the public study catalogue and builds the triage table.

**Who applies, and how.** From the GDC's
[controlled-access page](https://gdc.cancer.gov/access-data/obtaining-access-controlled-data):
a principal investigator obtains an NIH eRA Commons account, then requests the study through
dbGaP Authorized Access with a research use statement, countersigned by the institution's
signing official. An approved PI can then add lab members as downloaders in dbGaP; each needs
their own eRA Commons account and must have logged in to dbGaP once. Access is then exercised
by logging in to the GDC Data Portal and downloading a token for `gdc-client` or the API's
`X-Auth-Token` header.

What a reader can get help with here: drafting a research use statement, checking which consent
group a question needs, and listing the requirements. What a person must do themselves: every
attestation in the Data Use Certification — IRB status, data security, non-re-identification —
which is a legal commitment by the institution under a named investigator.

## What does not work

- **`/legacy/*` and `/v0/legacy/*` — `410 Gone`.** No hg19 data, no HTSeq counts, no
  pre-harmonisation level-3 files.
- **A misspelt filter field, or a field on the wrong endpoint — `200` with zero hits and no
  warning.** Validate against `/{endpoint}/_mapping`.
- **Nested `and` plus `facets` — `500 internal server error`.**
- **A facet on a field you also filtered — buckets that ignore that filter.**
- **`/data` on a controlled UUID without a token, or with a bad one — `403`**, JSON
  `{"message": "Not authorized to download: <uuid>."}`. A batch containing one such id fails
  entirely.
- **`/data` on a superseded UUID — `203`, the old bytes.** Not an error, which is the problem.
- **`HEAD` on `/data/{uuid}` and `/history/{uuid}` without `Content-Type: application/json`
  — `400`.** `curl -I` and Python's `Request(method="HEAD")` send no content type, so both get
  it. With the header, `HEAD` answers like the `GET` minus the body: `200` with
  `Content-Length`, `203` for a superseded file. A `GET` with a `Range` header returns `206`.
- **A TCGA barcode rule applied to CPTAC or TARGET ids** — wrong sample types, no error.

## Try it

A cold check that this skill still holds. Public data, no account, no key, Python standard
library only. Allow up to ten minutes — the cold run on 2026-11-15 took 7m44s, almost all of it
API latency rather than data volume (about 4 MB is downloaded).

**Data** — two open files from TCGA case `TCGA-A7-A0CE` (TCGA-BRCA), released under the NIH
Genomic Data Sharing Policy's open tier, which requires citation and forbids re-identification:
the masked somatic MAF `528628e5-34b8-41c7-a275-623b2bd05c2e` (39,292 B) and the primary-tumour
STAR count table `04e03ae1-b2f3-446d-862d-172fea6320de` (4,245,525 B). Also touched, on purpose:
the DR 32.0 copy of that MAF (`97cdb8ea-…`, the release trap) and its controlled unmasked twin
(`67c05840-…`, expected to refuse — a negative control, so not in `datasets:`). Last confirmed
reachable 2026-11-15.

```python
import csv, gzip, hashlib, json, urllib.error, urllib.request

API = "https://api.gdc.cancer.gov"
MAF = "528628e5-34b8-41c7-a275-623b2bd05c2e"        # TCGA-A7-A0CE masked MAF, DR 35.0 on
MAF_DR32 = "97cdb8ea-b796-4814-b88e-60d59ebd4033"   # the same MAF as released in DR 32.0
MAF_RAW = "67c05840-b651-445f-99b9-12142b566acf"    # its unmasked twin -- controlled
STAR = "04e03ae1-b2f3-446d-862d-172fea6320de"       # TCGA-A7-A0CE-01A STAR - Counts


def call(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}/{path}", data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as fh:
            return fh.status, fh.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def field_in(field, values):
    return {"op": "in", "content": {"field": field, "value": list(values)}}


def all_of(*clauses):
    flat = []
    for c in clauses:
        flat += c["content"] if c["op"] == "and" else [c]
    return {"op": "and", "content": flat}


def files(filters, **extra):
    status, raw = call("files", {"filters": filters, "size": 0, **extra})
    assert status == 200, status
    body = json.loads(raw)
    return body["data"], body["warnings"]


# 1. The release is a number the API reports; the Legacy Archive is gone.
status, raw = call("status")
release = json.loads(raw)["data_release_version"]
assert status == 200 and isinstance(release["major"], int), raw[:200]
assert call("legacy/files")[0] == 410
print(f"data release          : DR {release['major']}.{release['minor']} ({release['release_date']}); "
      f"/legacy -> 410")

# 2. INVARIANT. A misspelt filter field is a 200 with zero hits and no warning.
brca = field_in("cases.project.project_id", ["TCGA-BRCA"])
good, _ = files(brca)
bad, warnings = files(field_in("cases.project.projectid", ["TCGA-BRCA"]))
assert good["pagination"]["total"] > 0 and bad["pagination"]["total"] == 0 and not warnings
fields = set(json.loads(call("files/_mapping")[1])["fields"])
assert "cases.project.project_id" in fields and "cases.project.projectid" not in fields
print(f"silent filter typo    : right field {good['pagination']['total']} files, "
      f"typo 0 and warnings {warnings}")

# 3. INVARIANT. One workflow, two tiers: the masked MAF is open, its twin is not.
WF = field_in("analysis.workflow_type", ["Aliquot Ensemble Somatic Variant Merging and Masking"])
tiers = {}
for access in ("open", "controlled"):
    agg, _ = files(all_of(brca, WF, field_in("access", [access])), facets="data_type")
    tiers[access] = {b["key"]: b["doc_count"] for b in agg["aggregations"]["data_type"]["buckets"]}
assert set(tiers["open"]) == {"Masked Somatic Mutation"}, tiers
assert set(tiers["controlled"]) == {"Aggregated Somatic Mutation"}, tiers
print(f"one workflow, 2 tiers : open {tiers['open']}  controlled {tiers['controlled']}")

# 4. INVARIANT. A facet ignores the filter on its own field: filter to open,
#    facet on access, and the controlled bucket is still there.
agg, _ = files(all_of(brca, field_in("access", ["open"])), facets="access")
buckets = {b["key"]: b["doc_count"] for b in agg["aggregations"]["access"]["buckets"]}
assert agg["pagination"]["total"] == buckets["open"] and buckets.get("controlled", 0) > 0, buckets
print(f"facet on filtered key : total {agg['pagination']['total']}, buckets {buckets}")

# 5. INVARIANT. Controlled bytes need a token; the refusal is a 403 with JSON.
status, raw = call(f"data/{MAF_RAW}")
assert status == 403 and b"Not authorized" in raw, (status, raw[:120])
print(f"controlled download   : HTTP {status} {json.loads(raw)['message'][:30]}…")

# 6. INVARIANT. A superseded file: gone from /files, listed by /history, still
#    served by /data -- under 203, not 200.
assert call(f"files/{MAF_DR32}")[0] == 404
history = {h["uuid"]: h for h in json.loads(call(f"history/{MAF_DR32}")[1])}
assert history[MAF_DR32]["file_change"] == "superseded" and history[MAF]["file_change"] == "released"
status, old = call(f"data/{MAF_DR32}")
assert status == 203, status
print(f"superseded file       : /files 404, /history -> {MAF[:8]}… (DR "
      f"{history[MAF]['data_release']}), /data HTTP {status}")

# 7. INVARIANT. The masked MAF is linked to tumour AND matched normal.
_, raw = call(f"files/{MAF}?fields=cases.samples.submitter_id,cases.samples.sample_type,md5sum")
meta = json.loads(raw)["data"]
kinds = sorted(s["sample_type"] for c in meta["cases"] for s in c["samples"])
assert kinds == ["Blood Derived Normal", "Primary Tumor"], kinds
print(f"MAF's linked samples  : {kinds}")

# 8. INVARIANT. STAR counts: comment line, 4 N_ rows, _PAR_Y copies; after dropping
#    those, unversioned Ensembl ids are unique and cover every gene in the MAF.
status, raw = call(f"data/{STAR}")
lines = raw.decode().splitlines()
assert lines[0].startswith("# gene-model: GENCODE"), lines[0]
rows = list(csv.DictReader(lines[1:], delimiter="\t"))
n_summary = sum(r["gene_id"].startswith("N_") for r in rows)
n_par = sum(r["gene_id"].endswith("_PAR_Y") for r in rows)
genes = [r["gene_id"].split(".")[0] for r in rows
         if r["gene_id"].startswith("ENSG") and not r["gene_id"].endswith("_PAR_Y")]
assert n_summary == 4 and len(genes) == len(set(genes)), (n_summary, len(genes))
status, gz = call(f"data/{MAF}")
assert status == 200 and hashlib.md5(gz).hexdigest() == meta["md5sum"]
maf = [ln for ln in gzip.decompress(gz).decode().splitlines() if not ln.startswith("#")]
maf_genes = {r["Gene"] for r in csv.DictReader(maf, delimiter="\t")}
assert maf_genes <= set(genes), sorted(maf_genes - set(genes))[:5]
print(f"STAR counts           : {lines[0][2:]}, {len(genes)} genes, {n_summary} N_ rows, "
      f"{n_par} _PAR_Y rows dropped")
print(f"masked MAF            : {len(maf) - 1} variants in {len(maf_genes)} genes, "
      f"all found by Ensembl id, md5 ok")
```

**Expect.** Invariants first — a failure in any of these means the skill is wrong, not that
upstream moved:

- `/status` reports an integer `data_release_version.major`; `/legacy/files` is `410`.
- A misspelt filter field returns `200`, **zero hits and empty `warnings`**, and the
  misspelling is absent from `/files/_mapping`. If this ever starts warning, the silent-zero
  section can be softened; the mapping check stays.
- The MAF workflow yields exactly `Masked Somatic Mutation` in the open tier and exactly
  `Aggregated Somatic Mutation` in the controlled tier for TCGA-BRCA.
- Faceting `access` under an `access=open` filter still returns a `controlled` bucket, and the
  `open` bucket equals `pagination.total`.
- The controlled twin answers `403` with `Not authorized`; the DR 32.0 MAF is `404` on
  `/files`, `superseded` in `/history`, and `203` on `/data`.
- The masked MAF links exactly one `Primary Tumor` and one `Blood Derived Normal` sample.
- The STAR table opens with `# gene-model: GENCODE`, has 4 `N_` rows, unique unversioned ids
  once `_PAR_Y` rows are dropped, and contains every `Gene` id in the MAF; the MAF's md5 matches
  the index.

Observed values, GDC Data Release 46.0, read 2026-11-15 — a mismatch here is drift to
investigate, not a bug:

```
data release          : DR 46.0 (2026-08-10); /legacy -> 410
silent filter typo    : right field 71423 files, typo 0 and warnings {}
one workflow, 2 tiers : open {'Masked Somatic Mutation': 992}  controlled {'Aggregated Somatic Mutation': 992}
facet on filtered key : total 27931, buckets {'controlled': 43492, 'open': 27931}
controlled download   : HTTP 403 Not authorized to download: 67…
superseded file       : /files 404, /history -> 528628e5… (DR 35.0), /data HTTP 203
MAF's linked samples  : ['Blood Derived Normal', 'Primary Tumor']
STAR counts           : gene-model: GENCODE v36, 60616 genes, 4 N_ rows, 44 _PAR_Y rows dropped
masked MAF            : 107 variants in 105 genes, all found by Ensembl id, md5 ok
```

## Neighbours

- `dbgap` — the consent groups and use limitations behind `phs000178`, `phs000218` and
  `phs001287`, before anyone applies for the controlled tier.
- `ensembl` — resolving GENCODE v36 / Ensembl 102-era gene ids against a current release.
- `depmap` — the same cancer types as cell lines, with CRISPR dependency; join on gene ids
  rather than symbols there too.
- cBioPortal re-serves many TCGA studies as pre-processed tables with its own study ids and
  sample naming; when a figure needs to match a GDC release, take the data from the GDC and cite
  the release.

## Citing it

Cite the GDC (Heath et al., *Nat Genet* 2021, PMID 33619384), name the **data release**
(`Data Release 46.0`), and list the project ids. For TCGA work, also cite the dbGaP study
`phs000178` and the relevant TCGA marker paper. `provenance.json` from *Get the files* carries
the release; `gdc_manifest.txt` carries the file UUIDs and md5s that prove which bytes were
read.
