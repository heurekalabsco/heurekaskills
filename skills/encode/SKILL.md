---
name: encode
description: Search and download ENCODE experiments — ChIP-seq, ATAC-seq, DNase-seq, RNA-seq, Hi-C — by assay, target, biosample and organism, pick the right processed file, and look up SCREEN cCREs for a region or gene from a pinned registry.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, chip-seq, chromatin, genomic-intervals]
covers: [encode, encyclopedia of dna elements, screen, ccre, candidate cis-regulatory elements, enhancer, promoter, ctcf, transcription factor binding, tf chip-seq, histone chip-seq, histone marks, h3k27ac, h3k4me3, atac-seq, dnase-seq, chromatin accessibility, rna-seq, hi-c, idr peaks, narrowpeak, bigwig, grch38, hg19, mm10, k562, hepg2, gm12878, human, mouse]
papers: [PMID:22955616, PMID:32728249, PMID:41168159, PMID:31713622, PMID:41501460]
access: [open]
platform: snovault
datasets: ['https://www.encodeproject.org/help/citing-encode/?format=json', 'https://www.encodeproject.org/experiments/ENCSR000EGM/?format=json', 'https://www.encodeproject.org/annotations/ENCSR800VNX/?format=json', https://encode-public.s3.amazonaws.com/2020/09/25/f707c036-df65-4784-82da-816fc1c31b70/ENCFF660GHM.bed.gz, https://encode-public.s3.amazonaws.com/2023/02/27/f8be19b8-5226-4e19-bbdf-636b05c6a45f/ENCFF420VPZ.bed.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-15
  against: ENCODE portal at www.encodeproject.org live 2026-11-15 (27,043 released experiments) / cCRE Registry V4 annotation ENCSR800VNX file ENCFF420VPZ md5 ea1820bd71581ba01c94fc600fbf794d / Python 3.12 standard library only / curl 8.7.1
  executed: 8
  unverified: 0
---
# ENCODE portal and SCREEN cCREs

ENCODE is the NHGRI catalogue of functional elements in the human and mouse genomes. Its
portal, `www.encodeproject.org`, serves every experiment, file and annotation as JSON, and
on 2026-11-15 held **27,043 released experiments** — 5,002 TF ChIP-seq, 3,832 histone
ChIP-seq, 3,490 DNase-seq, 559 ATAC-seq, several thousand RNA-seq — over human, mouse, fly
and worm. SCREEN is the ENCODE viewer for the **Registry of candidate cis-regulatory
elements (cCREs)**: 2,348,854 human elements in Registry V4, each with a stable `EH38E…`
accession and a class (promoter-like, enhancer-like, CTCF, and so on).

Every API call here is anonymous. The traps are not about access; they are about picking
the wrong record without noticing:

1. **`preferred_default` is not unique.** An experiment reprocessed twice keeps both
   analyses' files `released`, and both sets carry `preferred_default: true`. Filter to the
   experiment's `default_analysis` first, or you get two different peak files for one
   experiment.
2. **A search without `status=released` includes archived and revoked records**, and a
   revoked file still downloads. Nothing stops you; the filter is the control.
3. **The portal tags Registry V3 as `current`.** Registry V4 is newer, is what SCREEN
   serves today, and reclassifies 44% of the elements the two share.
4. **`from=` (paging) is refused with an HTML 403.** A larger `limit`, or `limit=all`, is
   the only way past the first 25 hits.
5. **A target label is not an identity.** `target.label=CTCF` returns human, mouse and fly
   experiments together.

## Access and terms

No account, no key. The portal's data use policy
(<https://www.encodeproject.org/help/citing-encode/>, read 2026-11-15) says:

> External data users may freely download, analyze and publish results based on any ENCODE
> data without restrictions.

The same page sets the one operational limit — **at most 10 GET requests per second** from
one user or lab, enforced by IP block — and asks that you cite the ENCODE papers and the
experiment and file accessions you used; see *Citing it*. Every code block here makes its
requests one at a time, which stays well under the limit; do not parallelise a crawl. SCREEN's registry files are ENCODE annotations on the same portal under
the same policy. All `released` files sit in the public `encode-public` S3 bucket and need no
AWS credentials.

## What lives where

| What you want | Where | Route |
|---|---|---|
| Experiments, files, targets, biosamples, audits | portal JSON | `/search/?type=…&format=json` |
| One record | portal JSON | `/experiments/ENCSR…/?format=json` (also `/files/`, `/annotations/`, `/targets/`, `/genes/`) |
| A processed file | `encode-public` S3 | `cloud_metadata.url` on the file record, or `href` (307 to a signed S3 URL) |
| The cCRE registry (all elements, one assembly) | portal annotation | `ENCSR800VNX` (GRCh38, V4), `ENCSR412JPD` (mm10, V4) |
| Biosample-specific cCRE calls | portal annotations | `type=Annotation&annotation_type=candidate Cis-Regulatory Elements&encyclopedia_version=ENCODE v4` |
| SCREEN's own API | not usable — see *What does not work* | |

## A helper that handles the portal's two quirks

```python
import json, urllib.request, urllib.parse, urllib.error

PORTAL = "https://www.encodeproject.org"


def portal(path, **params):
    """GET a portal path as JSON. A search matching nothing is HTTP 404 with a valid body."""
    params.setdefault("format", "json")
    url = PORTAL + path + ("&" if "?" in path else "?") + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        if e.code == 404 and body.startswith(b"{"):
            return json.loads(body)          # zero hits: total 0, @graph []
        raise RuntimeError(f"HTTP {e.code} for {url}: {body[:120]!r}") from None


def search(type_, fields=(), **filters):
    """Every hit in one request. from= is refused, so a large limit is the only paging."""
    params = {"type": type_, "limit": "all", **filters}
    if fields:
        params["field"] = list(fields)
    res = portal("/search/", **params)
    assert len(res["@graph"]) == res["total"], (len(res["@graph"]), res["total"])
    return res["@graph"]
```

Filter keys are dotted field paths (`target.genes.geneid`, `biosample_ontology.term_name`),
which do not survive as Python keyword names — pass them with `**{...}`. Repeat a key for OR;
append `!` for NOT (`audit.ERROR.category!=*` means "no ERROR audit of any kind"). `field=`
trims the response to what you name, which matters with `limit=all`: all 27,043 released
experiments with two fields came back as 4 MB in 74 s.

## Finding experiments

```python
FIELDS = ("accession", "assay_title", "target.name", "biosample_ontology.term_name",
          "biosample_summary", "assembly", "date_released")

hits = search("Experiment", fields=FIELDS,
              status="released",
              assay_title="TF ChIP-seq",
              perturbed="false",
              **{"target.genes.geneid": "10664",                       # CTCF, NCBI Gene id
                 "biosample_ontology.term_name": "K562",
                 "replicates.library.biosample.donor.organism.scientific_name": "Homo sapiens",
                 "audit.ERROR.category!": "*"})
for h in hits:
    print(h["accession"], h["target"]["name"], h["biosample_summary"], h["assembly"])
```

```
ENCSR000AKO CTCF-human Homo sapiens K562 ['hg19', 'GRCh38']
ENCSR000DWE CTCF-human Homo sapiens K562 ['hg19', 'GRCh38']
ENCSR000DMA CTCF-human Homo sapiens K562 ['hg19', 'GRCh38']
ENCSR000BPJ CTCF-human Homo sapiens K562 ['hg19', 'GRCh38']
ENCSR000EGM CTCF-human Homo sapiens K562 ['hg19', 'GRCh38']
```

The filters that matter, and why each one is there:

- **`status=released`.** Without it the 528 `target.label=CTCF` TF ChIP-seq experiments include 17
  `archived` and 9 `revoked`. Across all experiments: 27,043 released, 1,230 archived, 369
  revoked.
- **Target by gene id or target name, not label.** A target is organism-specific
  (`/targets/CTCF-human/`, `/targets/CTCF-mouse/`) and carries NCBI Gene ids in
  `target.genes.geneid`. On 2026-11-15, released TF ChIP-seq gave **502** for
  `target.label=CTCF` and **457** for `target.genes.geneid=10664` — the label quietly adds 42
  mouse and 3 fly experiments. The id is also the join key to other sources: the gene record
  `/genes/10664/` lists `ENSEMBL:ENSG00000102974`, `UniProtKB:P49711` and `HGNC:13723` in
  `dbxrefs`. One wrinkle the other way: modified forms share the gene, so `geneid=5430`
  (POLR2A) returns 187 `POLR2A`, 45 `POLR2AphosphoS5` and 6 `POLR2AphosphoS2` experiments.
  When the modification matters, filter on `target.name` (`POLR2A-human`).
- **Histone marks are targets too** — `target.name=H3K27ac-human` — but their `genes` list
  the histone genes, so use the name, not a gene id.
- **Organism lives on the donor.** `replicates.library.biosample.donor.organism.scientific_name`
  works; `organism.scientific_name` is not a field of Experiment and returns **zero hits,
  silently** (HTTP 404 with `total: 0`, which `portal()` turns into an empty list).
- **`perturbed=false`** drops CRISPR, shRNA, drug and other treated samples. `K562` ATAC-seq
  is 64 released experiments, of which 60 are perturbed — mostly DMSO and drug time courses.
- **Assay names are `assay_title`** as the portal prints them: `TF ChIP-seq`,
  `Histone ChIP-seq`, `ATAC-seq`, `DNase-seq`, `Mint-ChIP-seq`, `polyA plus RNA-seq`,
  `total RNA-seq`, `in situ Hi-C`, `intact Hi-C`. ENCODE holds **no CUT&RUN**:
  `assay_term_name=CUT&RUN` returns 0, and a free-text search for it finds 2 ChIP-seq records
  that merely mention it.

## Audits: which ones exclude an experiment

Every experiment carries an `audit` object with four levels. On released experiments,
2026-11-15:

| Level | Meaning | Use |
|---|---|---|
| `ERROR` | the data are broken or missing a required component — `extremely low read depth` (333), `file validation error` (155), `missing antibody` (72), `missing control alignments` (41) | **exclude** |
| `NOT_COMPLIANT` | fails the ENCODE standard for the assay — `insufficient read depth` (1,851), `unreplicated experiment` (1,694), `poor library complexity` (390), `severe bottlenecking` (355), `low FRiP score` (142), `insufficient replicate concordance` (81) | exclude for anything quantitative; read the category for exploratory use |
| `WARNING` | worth knowing — `low read depth`, `mild to moderate bottlenecking`, `borderline replicate concordance` | keep, report |
| `INTERNAL_ACTION` | curation to-do for the DCC | ignore |

Of 5,002 released TF ChIP-seq, 150 carry an `ERROR` and 758 a `NOT_COMPLIANT`; requiring
neither leaves 4,210. Exclude by category rather than by level when you know what you can
tolerate — `audit.NOT_COMPLIANT.category!=insufficient read depth` drops only that one.

```python
def audit_summary(accession):
    exp = portal(f"/experiments/{accession}/")
    audit = exp.get("audit", {})
    return {level: sorted({a["category"] for a in audit[level]})
            for level in sorted(audit) if level != "INTERNAL_ACTION"}

for acc in ("ENCSR000EGM", "ENCSR000DWE"):
    print(acc, audit_summary(acc))
```

```
ENCSR000EGM {'WARNING': ['improper control_type of control experiment', 'low read length', 'mild to moderate bottlenecking', 'missing controlled_by']}
ENCSR000DWE {'NOT_COMPLIANT': ['insufficient read depth', 'poor library complexity', 'severe bottlenecking'], 'WARNING': ['control low read depth', 'inconsistent platforms', 'low read depth', 'low read length', 'mild to moderate bottlenecking']}
```

Both are among the five CTCF K562 experiments the search above returned, because it excluded
only `ERROR`. Four of the five carry `NOT_COMPLIANT` audits; `ENCSR000EGM` is the only one
with warnings alone.

## Picking the file

One experiment can carry dozens of files. `ENCSR000EGM` (CTCF, K562) has 73: fastq, BAM,
bigWig and peak files, on two assemblies, from **three analyses** — ENCODE4 v1.5.1 on
GRCh38 (`released`), ENCODE3 on GRCh38 (`archived`) and ENCODE3 on hg19 (`archived`). The
files of the archived analyses are still `released`, and the ENCODE3 GRCh38 peaks still carry
`preferred_default: true`. So this experiment has **two** GRCh38 peak files marked preferred:
`ENCFF660GHM` (`IDR thresholded peaks`, ENCODE4) and `ENCFF396BZQ`
(`optimal IDR thresholded peaks`, ENCODE3). Across all released GRCh38 TF ChIP-seq bed files
marked `preferred_default`, 1,870 of 5,461 belong to an archived analysis.

The rule that resolves it: **take the experiment's `default_analysis`, then
`preferred_default` within it.**

```python
FILE_FIELDS = ("accession", "status", "output_type", "file_format", "file_format_type",
               "assembly", "preferred_default", "biological_replicates", "analyses.@id",
               "md5sum", "file_size", "href", "cloud_metadata.url")


def default_files(experiment, assembly="GRCh38"):
    """Released files of the experiment's default analysis, on one assembly."""
    exp = portal(f"/experiments/{experiment}/", frame="object")
    if exp["status"] != "released":
        raise ValueError(f"{experiment} is {exp['status']}, not released")
    analysis = exp.get("default_analysis")
    if analysis is None:
        return exp, None, []
    files = search("File", fields=FILE_FIELDS, dataset=f"/experiments/{experiment}/",
                   status="released", assembly=assembly)
    return exp, analysis, [f for f in files
                           if analysis in [a["@id"] for a in f.get("analyses", [])]]


def pick(experiment, output_type, file_format="bed", assembly="GRCh38"):
    """The one preferred file of a type, or an explanation of why there is not one."""
    exp, analysis, files = default_files(experiment, assembly)
    cands = [f for f in files if f["output_type"] == output_type
             and f["file_format"] == file_format and f.get("preferred_default")]
    if len(cands) != 1:
        types = sorted({f["output_type"] for f in files})
        raise LookupError(f"{experiment}: {len(cands)} preferred {output_type!r} "
                          f"{file_format} on {assembly} in {analysis}; types here: {types}")
    return cands[0]


f = pick("ENCSR000EGM", "IDR thresholded peaks")
print(f["accession"], f["output_type"], f["biological_replicates"], f["file_size"], f["md5sum"])
```

```
ENCFF660GHM IDR thresholded peaks [1, 2] 932480 2b9e2c2ba7afe8d64f5f3549ce16cf1a
```

Which `output_type` to ask for depends on the assay. Among `preferred_default` GRCh38 files
in released analyses on 2026-11-15:

| Assay | Preferred peaks | Also present |
|---|---|---|
| TF ChIP-seq (ENCODE4) | `IDR thresholded peaks` — the reproducible set across replicates | `conservative IDR thresholded peaks`, per-replicate `IDR thresholded peaks`, `IDR ranked peaks` |
| TF ChIP-seq (ENCODE3 era, where still default) | `optimal IDR thresholded peaks` | `conservative IDR thresholded peaks` |
| Histone ChIP-seq, Mint-ChIP-seq, ATAC-seq | `pseudoreplicated peaks` (5,924 histone, 878 ATAC) | `replicated peaks` — stricter, and marked preferred far less often (258 histone, 50 ATAC); ask for the type, then check `preferred_default` |
| DNase-seq | `peaks` | `read-depth normalized signal`, `hotspots` |
| RNA-seq | `gene quantifications` (tsv) | strand-specific signal bigWigs |

`biological_replicates` tells you whether a file pools replicates (`[1, 2]`) or is one
replicate (`[1]`); ask for the pooled one unless you are measuring reproducibility.

Three ways `pick()` correctly refuses, each seen on a real experiment:

- **No preferred file at all.** `ENCSR160FPV` (DNase-seq, K562, 2025) has 134 biological
  replicates and 808 GRCh38 files, every peak file single-replicate and **none** marked
  preferred. There is no file to pick; decide which replicates you want.
- **No default analysis.** `ENCSR054ZMK` (NR2F2, HepG2, unreplicated) has no
  `default_analysis` and no GRCh38 files. It is one of 10 of the 5,002 released TF
  ChIP-seq experiments in that state on 2026-11-15, none with any processed file — including
  the newest, `ENCSR269ZGG`, released 2025-09-27.
- **The assembly you asked for is only in an archived analysis.** `ENCSR000EGM` on `hg19`
  returns nothing from the default analysis, because its hg19 files belong to the archived
  ENCODE3 analysis. 719 released experiments are hg19-only (mostly older Hi-C and WGS). For a
  GRCh38 project use GRCh38 files; do not mix in hg19 peaks without lifting them over.

## Downloading

A file record gives two routes to the same bytes:

- **`cloud_metadata.url`** — the plain public S3 URL, no redirect, no credentials.
- **`href`** — `/files/ENCFF…/@@download/…`, which answers **307** to a signed S3 URL that
  expires.

Verify against the record's `md5sum`, which is the md5 of the file as stored (the `.gz`, not
its contents). Do **not** compare against the S3 `ETag`: for multipart uploads it is not an
md5 (`ENCFF420VPZ` has ETag `8217cc90…-4`, md5 `ea1820bd…`).

```python
import hashlib, os, gzip


def download(f, outdir="."):
    """Stream a released file to disk and check the portal's md5. Returns the local path."""
    if f["status"] != "released":
        raise ValueError(f"{f['accession']} is {f['status']}")
    url = f.get("cloud_metadata", {}).get("url") or PORTAL + f["href"]
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, url.rsplit("/", 1)[-1])
    md5 = hashlib.md5()
    with urllib.request.urlopen(url, timeout=600) as r, open(path, "wb") as out:
        for chunk in iter(lambda: r.read(1 << 20), b""):
            md5.update(chunk)
            out.write(chunk)
    if md5.hexdigest() != f["md5sum"]:
        os.remove(path)
        raise IOError(f"{f['accession']}: md5 {md5.hexdigest()} != {f['md5sum']}")
    return path


path = download(f, "encode_files")
peaks = [line.rstrip("\n").split("\t") for line in gzip.open(path, "rt")]
print(path, len(peaks), "peaks; first:", peaks[0][:3], "signal", peaks[0][6])
```

```
encode_files/ENCFF660GHM.bed.gz 58684 peaks; first: ['chr12', '53676079', '53676369'] signal 592.70051
```

Peak files are BED narrowPeak (0-based, half-open), coordinates on the file's `assembly`.
A transfer can stall rather than fail: one 15 MB download through the signed `href` URL hung
at 99% for five minutes on 2026-11-15, and the same file over `cloud_metadata.url` finished
normally. Throughput also varies a lot: the 33 MB registry file below took seconds on one
run and 16 minutes on another, the same afternoon. Keep a timeout and the md5 check, and
budget for slow transfers before fetching hundreds of files.

## Status: released, archived, revoked

| Status | Meaning | Treat as |
|---|---|---|
| `released` | current | use |
| `archived` | superseded (an older processing, an earlier peak call) but not wrong | history only |
| `revoked` | withdrawn because something is wrong with it | never use |

Of 1,659,000 file records on 2026-11-15: 1,474,057 released, 146,787 archived, 38,156
revoked. **A revoked file still downloads.** `ENCFF142ITE` is revoked; its `href` answers 307
to a signed URL in the `encode-private` bucket, and that URL serves the bytes. The plain S3
URL in that bucket is 403, which is the only place anything refuses. So the guard is a
`status=released` filter on every search and a status check before every download, as in
`download()` above. The same holds one level up: revoked experiment `ENCSR723JHW` (CTCF) is
returned by any search that omits the status filter.

## cCREs: the SCREEN registry

The Registry of cCREs is ENCODE's integrated map of regulatory elements: representative
accessible regions (`rDHS`, accession `EH38D…`) classified by their H3K4me3, H3K27ac, CTCF
and, in V4, TF ChIP signal into cCREs (accession `EH38E…` for human, `EM10E…` for mouse),
each with one class.

**Pin the registry version.** It changes classes, not just membership:

| Version | Portal annotation (GRCh38) | bed file | Elements | Classes |
|---|---|---|---|---|
| V4 (SCREEN today) | `ENCSR800VNX` | `ENCFF420VPZ` | 2,348,854 | `PLS`, `pELS`, `dELS`, `CA-H3K4me3`, `CA-CTCF`, `CA-TF`, `CA`, `TF` |
| V3 | `ENCSR487PRC` | `ENCFF234XEZ` | 1,063,878 | `PLS`, `pELS`, `dELS`, `DNase-H3K4me3`, `CTCF-only`, each optionally `,CTCF-bound` |

The two share 1,019,358 accessions, all with identical coordinates — so an `EH38E` accession
does identify a region across versions — but **444,867 of them (44%) change class**, mostly
because V4 drops the `CTCF-bound` suffix and renames `CTCF-only` to `CA-CTCF`; 4,413 move
from `CTCF-only` to `dELS`. A class label is only meaningful with its version next to it.

**The portal tags V3 as `current`.** `encyclopedia_version` on the V3 annotations is
`['ENCODE v3', 'current']` and on V4 is `['ENCODE v4']`. Do not select on `current`. For
mouse, V4 is `ENCSR412JPD` (mm10). There is no V4 registry on hg19; the hg19 annotations are
the V1 encyclopedia.

```python
import collections

REGISTRY = "ENCSR800VNX"                     # Registry V4, GRCh38
reg = portal(f"/annotations/{REGISTRY}/")
print(reg["accession"], reg["status"], reg["encyclopedia_version"], reg["assembly"])
bed = next(f for f in reg["files"] if f["file_format"] == "bed" and f["status"] == "released")
print(bed["accession"], bed["md5sum"], bed["file_size"])
ccre_path = download(bed, "encode_files")


def load_registry(path):
    by_chrom = collections.defaultdict(list)
    with gzip.open(path, "rt") as fh:
        for line in fh:
            c = line.rstrip("\n").split("\t")
            by_chrom[c[0]].append((int(c[1]), int(c[2]), c[3], c[9]))
    return by_chrom


registry = load_registry(ccre_path)


def ccres_in(chrom, start, end):
    """cCREs overlapping a 0-based half-open interval."""
    return [r for r in registry[chrom] if r[0] < end and r[1] > start]


# by gene: key on the NCBI Gene id, take the location on the registry's assembly
gene = portal("/genes/7157/", frame="object")                 # TP53
loc = next(l for l in gene["locations"] if l["assembly"] == "GRCh38")
hits = ccres_in(loc["chromosome"], loc["start"] - 10_000, loc["end"] + 10_000)
print(gene["symbol"], loc, len(hits), sorted(collections.Counter(h[3] for h in hits).items()))
print(hits[0])
```

```
ENCSR800VNX released ['ENCODE v4'] ['GRCh38']
ENCFF420VPZ ea1820bd71581ba01c94fc600fbf794d 32795453
TP53 {'assembly': 'GRCh38', 'chromosome': 'chr17', 'start': 7668402, 'end': 7687550} 31 [('CA', 1), ('CA-CTCF', 2), ('CA-H3K4me3', 2), ('PLS', 4), ('TF', 3), ('dELS', 5), ('pELS', 14)]
(7659793, 7660031, 'EH38E4154951', 'CA')
```

The 31 elements in that window are the same 31, with the same classes, that SCREEN's live
backend returned for the same coordinates on 2026-11-15. The gene location comes from the
portal's own gene record; it is close to, but not identical with, NCBI's or Ensembl's
(TP53 here ends at 7,687,550, NCBI at 7,687,490). For anything TSS-precise — promoter
windows, strand — take coordinates from `ensembl` and keep this registry for the elements.
The bed file has no rDHS column; V4 rows are `chrom start end EH38E… 0 . start end rgb class`.

For **cell-type-specific** classes (which elements are active in K562), the portal carries
one annotation per biosample: `type=Annotation`, `annotation_type=candidate Cis-Regulatory
Elements`, `encyclopedia_version=ENCODE v4`, `biosample_ontology.term_name=K562` — 1,678 such
GRCh38 annotations for V4 on 2026-11-15, each with one bed and one bigBed, fetched exactly as
the registry file above. A biosample name does not pick one: K562 alone has **six** V4
annotations, three of them on treated cells (the description says `(treated)`), so read the
description and the annotation's source experiments before choosing.

## Get the files

Write a manifest first — one row per file with the accession, the experiment, what it is,
its analysis and its checksum — then fetch from it. The manifest is what makes the download
citable and repeatable.

```python
import csv

COLUMNS = ["file", "experiment", "assay", "target", "biosample", "output_type",
           "file_format", "assembly", "analysis", "biological_replicates", "md5sum",
           "file_size", "url"]


def manifest(experiments, output_type_by_assay, path="encode_manifest.tsv"):
    rows, skipped = [], []
    for acc in experiments:
        exp, analysis, files = default_files(acc)
        want = output_type_by_assay[exp["assay_title"]]
        chosen = [f for f in files if f["output_type"] == want
                  and f["file_format"] == "bed" and f.get("preferred_default")]
        if len(chosen) != 1:
            skipped.append((acc, exp["assay_title"], len(chosen)))
            continue
        f = chosen[0]
        rows.append({"file": f["accession"], "experiment": acc, "assay": exp["assay_title"],
                     "target": exp.get("target", ""), "biosample": exp["biosample_ontology"],
                     "output_type": f["output_type"], "file_format": f["file_format"],
                     "assembly": f["assembly"], "analysis": analysis,
                     "biological_replicates": f["biological_replicates"],
                     "md5sum": f["md5sum"], "file_size": f["file_size"],
                     "url": f["cloud_metadata"]["url"]})
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS, delimiter="\t")
        w.writeheader()
        w.writerows(rows)
    print(f"{path}: {len(rows)} files, {sum(r['file_size'] for r in rows) / 1e6:.1f} MB")
    for s in skipped:
        print("  skipped", s)
    return rows


OUTPUT = {"TF ChIP-seq": "IDR thresholded peaks", "Histone ChIP-seq": "pseudoreplicated peaks",
          "ATAC-seq": "pseudoreplicated peaks", "DNase-seq": "peaks"}
rows = manifest(["ENCSR000EGM", "ENCSR000AKP", "ENCSR483RKN", "ENCSR000EKS", "ENCSR160FPV"],
                OUTPUT)
for r in rows:
    download({"accession": r["file"], "status": "released", "md5sum": r["md5sum"],
              "cloud_metadata": {"url": r["url"]}}, "encode_files")
print(sorted(os.listdir("encode_files")))
```

```
encode_manifest.tsv: 4 files, 8.7 MB
  skipped ('ENCSR160FPV', 'DNase-seq', 0)
['ENCFF274YGF.bed.gz', 'ENCFF420VPZ.bed.gz', 'ENCFF544LXB.bed.gz', 'ENCFF558BLC.bed.gz', 'ENCFF660GHM.bed.gz']
```

`ENCSR160FPV` is skipped and reported rather than given an arbitrary replicate. For bulk
work the portal also has `/metadata/?type=Experiment&…` (a files TSV of 59 columns,
including `File analysis status` and the audit columns), which worked anonymously on
2026-11-15; it omits revoked files but **includes archived-analysis files**, so filter on
`File analysis status == released` and `File Status == released` before using it.

## What does not work

Tried on 2026-11-15, so you do not have to:

- **`from=` for paging** — every request carrying `from` (even `from=0`) is answered **403
  Forbidden** with an HTML body from the load balancer. Use `limit=all` with `field=` to keep
  it small; `limit=10000` also works.
- **`organism.scientific_name` on Experiment** — not a field there; zero hits, no error.
- **SCREEN's GraphQL host**, `screen.api.wenglab.org/graphql` — **403**
  `{"error":"request not allowed"}` for anonymous GET and POST.
- **The SCREEN website**, `screen.wenglab.org` — **429** with a bot challenge to a scripted
  client. It is a browser application, not an API.
- **The old SCREEN API**, `screen-beta-api.wenglab.org` — **500**.
  `screen.encodeproject.org` still loads, but it is an older interface whose code calls
  that dead API.
- **The registry's own download host**, `downloads.wenglab.org/Registry-V4/GRCh38-cCREs.bed`,
  does answer 200 (129 MB uncompressed, with an extra rDHS column and no published
  checksum). Prefer the portal's `ENCFF420VPZ`: it is compressed, has an accession you can
  cite and an md5 you can check.
- **CUT&RUN** — not in ENCODE.

The Weng lab runs a second GraphQL host for its Factorbook site that answers SCREEN-style
queries anonymously today. It is undocumented as a SCREEN interface, so this skill does not
depend on it; the registry file above is the stable route and answers the same region
queries.

## Try it

A self-contained check that this skill still works. Public data, no account, no key.

**Data** — the ENCODE data use page; experiment `ENCSR000EGM` (CTCF TF ChIP-seq in K562,
Snyder lab, released 2012-05-14, reprocessed by the ENCODE4 pipeline); DNase-seq experiment
`ENCSR160FPV`; and the Registry V4 GRCh38 annotation `ENCSR800VNX` with its bed file
`ENCFF420VPZ` (33 MB):

    https://www.encodeproject.org/experiments/ENCSR000EGM/?format=json
    https://www.encodeproject.org/annotations/ENCSR800VNX/?format=json

ENCODE data are released for use without restriction (quoted under *Access and terms*).
Last confirmed reachable 2026-11-15. Runs in a fresh directory with the Python standard
library; it downloads about 34 MB.

```python
import collections, gzip, hashlib, json, os, urllib.error, urllib.parse, urllib.request

P = "https://www.encodeproject.org"

def get(path, **q):
    q.setdefault("format", "json")
    url = P + path + "?" + urllib.parse.urlencode(q, doseq=True)
    try:
        with urllib.request.urlopen(url, timeout=300) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        return e.code, (json.loads(body) if body.startswith(b"{") else body)

def fetch(url, md5, dest):
    h = hashlib.md5()
    with urllib.request.urlopen(url, timeout=600) as r, open(dest, "wb") as out:
        for chunk in iter(lambda: r.read(1 << 20), b""):
            h.update(chunk); out.write(chunk)
    assert h.hexdigest() == md5, (dest, h.hexdigest(), md5)
    return dest

# 0. the terms
_, page = get("/help/citing-encode/")
assert "freely download, analyze and publish results based on any ENCODE data without restrictions" \
    in page["layout"]["blocks"][0]["body"]

# 1. preferred_default is NOT unique; default_analysis makes it so
_, exp = get("/experiments/ENCSR000EGM/", frame="object")
FF = ["accession", "output_type", "file_format", "preferred_default", "analyses.@id",
      "md5sum", "cloud_metadata.url", "biological_replicates"]
_, res = get("/search/", type="File", dataset="/experiments/ENCSR000EGM/", status="released",
             assembly="GRCh38", file_format="bed", limit="all", field=FF)
preferred = [f for f in res["@graph"] if f.get("preferred_default")]
in_default = [f for f in preferred if exp["default_analysis"] in [a["@id"] for a in f["analyses"]]]
print("preferred GRCh38 bed:", sorted((f["accession"], f["output_type"]) for f in preferred))
print("in default analysis :", [(f["accession"], f["output_type"]) for f in in_default])
assert len(preferred) >= 2 and len(in_default) == 1
peaks = in_default[0]
assert peaks["output_type"] == "IDR thresholded peaks" and peaks["biological_replicates"] == [1, 2]

os.makedirs("encode_files", exist_ok=True)
p = fetch(peaks["cloud_metadata"]["url"], peaks["md5sum"], "encode_files/" + peaks["accession"] + ".bed.gz")
rows = [l.split("\t") for l in gzip.open(p, "rt")]
assert all(len(r) == 10 and int(r[1]) < int(r[2]) for r in rows)
print(peaks["accession"], len(rows), "narrowPeak rows")

# 2. some experiments have no preferred file at all
_, many = get("/search/", type="File", dataset="/experiments/ENCSR160FPV/", status="released",
              assembly="GRCh38", limit="all", field=["preferred_default", "output_type"])
assert many["total"] > 100 and not any(f.get("preferred_default") for f in many["@graph"])
print("ENCSR160FPV:", many["total"], "released files, none preferred")

# 3. label is not identity
lab = get("/search/", type="Experiment", status="released", assay_title="TF ChIP-seq",
          **{"target.label": "CTCF"}, limit="0")[1]["total"]
gid = get("/search/", type="Experiment", status="released", assay_title="TF ChIP-seq",
          **{"target.genes.geneid": "10664"}, limit="0")[1]["total"]
print("target.label=CTCF", lab, "| geneid 10664", gid)
assert lab > gid

# 4. the portal's quirks: zero hits is a 404 with a body; from= is a 403
code, body = get("/search/", type="Experiment", **{"organism.scientific_name": "Homo sapiens"}, limit="0")
assert code == 404 and body["total"] == 0
code, _ = get("/search/", type="Experiment", limit="5", **{"from": "5"})
assert code == 403
print("zero-hit search -> 404 with total 0; from= -> 403")

# 5. the registry: V3 is tagged current, V4 is the one to pin
_, v3 = get("/annotations/ENCSR487PRC/")
_, v4 = get("/annotations/ENCSR800VNX/")
assert "current" in v3["encyclopedia_version"] and v4["encyclopedia_version"] == ["ENCODE v4"]
bed = next(f for f in v4["files"] if f["file_format"] == "bed" and f["status"] == "released")
c = fetch(bed["cloud_metadata"]["url"], bed["md5sum"], "encode_files/" + bed["accession"] + ".bed.gz")
reg = collections.defaultdict(list)
for line in gzip.open(c, "rt"):
    f = line.rstrip("\n").split("\t")
    reg[f[0]].append((int(f[1]), int(f[2]), f[3], f[9]))
n = sum(map(len, reg.values()))
classes = collections.Counter(r[3] for v in reg.values() for r in v)
_, tp53 = get("/genes/7157/", frame="object")
loc = next(l for l in tp53["locations"] if l["assembly"] == "GRCh38")
hits = [r for r in reg[loc["chromosome"]] if r[0] < loc["end"] + 10_000 and r[1] > loc["start"] - 10_000]
print(bed["accession"], n, "cCREs;", len(classes), "classes; TP53 +/-10 kb:", len(hits))
assert set(classes) == {"PLS", "pELS", "dELS", "CA-H3K4me3", "CA-CTCF", "CA-TF", "CA", "TF"}
assert all(r[2].startswith("EH38E") for r in hits)
```

**Expect**

Invariants — a failure means the skill is wrong:

- The data use page carries the "without restrictions" sentence.
- `ENCSR000EGM` has **more than one** `preferred_default` GRCh38 bed file, and exactly one
  within its `default_analysis`, the replicate-pooled `IDR thresholded peaks`. Picking by
  `preferred_default` alone is the bug this guards.
- The downloaded file matches the record's md5, and every row is 10-column narrowPeak.
- `ENCSR160FPV` has released files and none is preferred — there is no default to take.
- `target.label=CTCF` returns more experiments than `target.genes.geneid=10664`.
- A zero-hit search is HTTP 404 with `total: 0`; a request with `from=` is 403.
- The V3 registry annotation is tagged `current`; V4 is not. V4 uses exactly the eight
  classes listed, and every cCRE accession is `EH38E…`.

Observed on 2026-11-15 — these move when ENCODE reprocesses, and a mismatch is drift to
investigate:

```
preferred GRCh38 bed: [('ENCFF396BZQ', 'optimal IDR thresholded peaks'), ('ENCFF660GHM', 'IDR thresholded peaks')]
in default analysis : [('ENCFF660GHM', 'IDR thresholded peaks')]
ENCFF660GHM 58684 narrowPeak rows
ENCSR160FPV: 808 released files, none preferred
target.label=CTCF 502 | geneid 10664 457
zero-hit search -> 404 with total 0; from= -> 403
ENCFF420VPZ 2348854 cCREs; 8 classes; TP53 +/-10 kb: 31
```

## Related skills

- `4dn` — chromatin conformation (Hi-C, Micro-C, imaging) on the same snovault platform;
  ENCODE's own Hi-C is here, 4DN's is there.
- `geo` — where most ChIP-seq, ATAC-seq and RNA-seq from outside the consortium lives.
- `ensembl` — gene and transcript coordinates, TSS and strand, for promoter windows around
  the cCREs found here.

## Citing it

The data use page asks for three things: the consortium papers, an acknowledgement of the
ENCODE production lab behind each dataset (the `lab` field on the experiment), and the
`ENCSR…` and `ENCFF…` accessions of every dataset and file you used (the manifest above
carries them). The papers it names are the integrated analysis (ENCODE Project Consortium,
*Nature* 2012, PMID 22955616) and the portal (Kagda et al., *Nat Commun* 2025, PMID 41168159;
Luo et al., *Nucleic Acids Res* 2020, PMID 31713622). The expanded encyclopaedias paper
(*Nature* 2020, PMID 32728249) describes the registry's earlier versions. For Registry V4
cCREs, cite Moore et al., *Nature* 2026 (PMID 41501460), and state the registry version and
the file accession (`ENCFF420VPZ`) next to every cCRE class you report.
