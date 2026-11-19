---
name: eqtl-catalogue
description: Query the eQTL Catalogue's uniformly processed molQTL summary statistics over FTP — the REST API is retired, release 7 is bgzip+tabix while pre-release 8 is parquet, a QTD dataset id means different data in each, and tabix carries no column names.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [eqtl, sqtl, gene-expression, human-genetics, public-data]
covers: [eqtl, sqtl, molqtl, expression quantitative trait locus, splicing qtl, transcript qtl, exon qtl, summary statistics, fine mapping, credible set, susie, colocalisation, cis-qtl, lead variant, permutation p-value, gtex, blueprint, immune cell, monocyte, macrophage, t cell, lcl, brain, adipose, tabix, parquet, grch38, ensembl gene, rsid, molecular trait]
papers: [PMID:34493866, PMID:37721944, PMID:26708335, PMID:29379200, PMID:27863251, PMID:32913098]
access: [open]
platform: ebi-ftp
datasets: [https://raw.githubusercontent.com/eQTL-Catalogue/eQTL-Catalogue-resources/master/data_tables/dataset_metadata_r7.tsv, https://raw.githubusercontent.com/eQTL-Catalogue/eQTL-Catalogue-resources/master/data_tables/dataset_metadata_r8_beta.tsv, https://raw.githubusercontent.com/eQTL-Catalogue/eQTL-Catalogue-resources/master/tabix/Columns.md, https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/sumstats/QTS000002/QTD000021/QTD000021.all.tsv.gz, https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/sumstats/QTS000002/QTD000021/QTD000021.all.tsv.gz.tbi, https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/sumstats/QTS000002/QTD000021/QTD000021.permuted.tsv.gz, https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/sumstats/QTS000015/QTD000116/QTD000116.all.tsv.gz, https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/susie/QTS000002/QTD000021/QTD000021.credible_sets.tsv.gz, https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/r8_beta/sumstats/QTS000015/QTD000116/QTD000116.permuted.parquet]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-19
  against: eQTL Catalogue release 7 (758 datasets, 42 studies, files dated 2023-04-06) and pre-release 8 beta (592 datasets, 16 studies, files dated 2026-09-09) read over https from the EMBL-EBI public FTP / dataset metadata tables at eQTL-Catalogue-resources master / pysam 0.24.1 (htslib 1.22) / pyarrow 26.0.1 / Python 3.13.9 / curl 8.14.1
  executed: 12
  unverified: 0
---
# eQTL Catalogue — uniformly processed molQTL summary statistics

The eQTL Catalogue re-maps QTLs from dozens of published studies through one pipeline, so
effect sizes from BLUEPRINT monocytes and GTEx adipose are comparable without you
re-processing anything. Release 7 covers five molecular-trait levels — gene
expression (`ge`), exon (`exon`), transcript (`tx`), txrevise promoter/splicing/3′-end
events (`txrev`) and Leafcutter intron excision (`leafcutter`) — plus two
platform-specific quantifications (`microarray`, and `aptamer` for SomaScan protein
levels), across 99 tissue and cell-type terms. Where
`gtex` gives you one study deeply, this gives you many studies on one footing, including
immune cell types GTEx does not sample.

What it is **not** is a lookup service. There is no API any more, the per-dataset nominal
file is a few gigabytes, and the two live releases do not share a file format. Almost every
mistake with this resource is a pathing or identifier mistake made before a single number
is read, so this page is mostly about those.

**What you need:** nothing to register for and no key. The data is distributed under
CC-BY-4.0 (<https://www.ebi.ac.uk/eqtl/License/>) over anonymous HTTPS. For the region
queries below you need `pysam` (`pip install pysam`, bundles htslib — the `tabix` CLI from
htslib works equally well), and for pre-release 8 a parquet reader (`pip install pyarrow`).
Both come from PyPI with no system packages.

## Start here — the REST API is retired, and it says so with 410

Every code sample written against `https://www.ebi.ac.uk/eqtl/api/...` before 2026 is dead.
The host still answers, which is what makes this worth checking first: you get a `410 Gone`
with a plain-text body, not a connection error and not a 404, so a wrapper that only
branches on `>= 500` or on `404` will sail past it and report "no associations found".

```bash
# 410 Gone with a text/plain body -- a deliberate retirement, not an outage.
curl -s -o /dev/null -w '%{http_code}\n' 'https://www.ebi.ac.uk/eqtl/api/v2/datasets?size=2'
curl -s 'https://www.ebi.ac.uk/eqtl/api/v2/datasets?size=2'; echo

# The FTP root is what replaced it, and it answers 200.
curl -s -o /dev/null -w '%{http_code}\n' 'https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/'
```

Everything from here on is plain HTTPS against `ftp.ebi.ac.uk` plus two TSV tables held in
the project's own resources repository. `ftp://` URLs appear throughout the upstream
documentation; the same paths over `https://` work and are what range requests and tabix
need, so prefer them.

## The two live releases are different file formats, not different directories

This is the one that wastes a day. Release 7 and pre-release 8 are both current, both
served, and interchangeable in neither path nor parser.

| | release 7 | pre-release 8 (beta) |
|---|---|---|
| sumstats prefix | `/pub/databases/spot/eQTL/sumstats/` | `/pub/databases/spot/eQTL/r8_beta/sumstats/` |
| fine mapping | `/pub/databases/spot/eQTL/susie/` | `/pub/databases/spot/eQTL/r8_beta/susie/` |
| nominal file | `<QTD>.all.tsv.gz` + `.tbi` | `<QTD>.all.parquet` |
| permutations | `<QTD>.permuted.tsv.gz` | `<QTD>.permuted.parquet` |
| region query | tabix on the `.tbi` | parquet row-group/predicate pushdown |
| datasets | 758 across 42 studies | 592 across 16 studies |

There is no `.tbi` anywhere under `r8_beta`, so tabix cannot be pointed at it at all. And
pre-release 8 is a *partial* reprocessing: it has fewer datasets than release 7 because only
16 of the 42 studies have been re-run so far. Release 7 is still the one to use unless you
specifically need a study it reprocessed.

```python
"""Confirm the layout of both releases before trusting any path. Stdlib only."""
import re
import urllib.request

BASE = "https://ftp.ebi.ac.uk/pub/databases/spot/eQTL"


def listing(url):
    with urllib.request.urlopen(url, timeout=120) as fh:
        html = fh.read().decode("utf-8", "replace")
    return re.findall(r'href="([^"?/][^"]*)"', html)


r7 = listing(f"{BASE}/sumstats/QTS000002/QTD000021/")
r8 = listing(f"{BASE}/r8_beta/sumstats/QTS000015/QTD000116/")
print("release 7 :", r7)
print("r8 beta   :", r8)

assert any(f.endswith(".all.tsv.gz") for f in r7), "release 7 should ship bgzip TSV"
assert any(f.endswith(".tbi") for f in r7), "release 7 should ship a tabix index"
assert any(f.endswith(".all.parquet") for f in r8), "r8_beta should ship parquet"
assert not any(f.endswith(".tbi") for f in r8), "r8_beta has no tabix index -- confirmed"
```

A directory listing is only safe to request this deep in the tree. `GET /sumstats/` is a
listing of every study and the server resets the connection rather than render it; resolve
study and dataset ids from the metadata table below instead of walking the tree.

Each release-7 dataset directory also holds a `*.cc.tsv.gz` alongside the `*.all.tsv.gz`.
It carries the same nineteen columns over a smaller variant set and the project's column
reference does not say what selects them, so this page does not use it — if you need every
tested variant, `*.all.tsv.gz` is the file.

## Trap 1 — a `QTD` id is not a stable key across releases

`dataset_id` looks like an accession and behaves like a row number. The same `QTD000116`
names GTEx v8 adipose subcutaneous in release 7 (581 samples) and GTEx **v10** adipose
subcutaneous in pre-release 8 (711 samples): same tissue, different genotypes, different
expression matrix, different numbers. Meanwhile `QTD000021` (BLUEPRINT monocyte) exists in
release 7 and is simply absent from pre-release 8.

So a `QTD` id is meaningful only together with the release it came from. Record both, and
re-resolve ids from the metadata table of the release you are actually reading rather than
carrying a list of ids forward.

```python
"""dataset_id is release-scoped. Resolve it, never hardcode it across releases."""
import csv
import io
import urllib.request

RES = ("https://raw.githubusercontent.com/eQTL-Catalogue/"
       "eQTL-Catalogue-resources/master/data_tables")


def metadata(name):
    with urllib.request.urlopen(f"{RES}/{name}", timeout=120) as fh:
        text = fh.read().decode()
    rows = list(csv.DictReader(io.StringIO(text), delimiter="\t"))
    return {r["dataset_id"]: r for r in rows}


r7 = metadata("dataset_metadata_r7.tsv")
r8 = metadata("dataset_metadata_r8_beta.tsv")
print(f"release 7: {len(r7)} datasets / {len({r['study_id'] for r in r7.values()})} studies")
print(f"r8 beta  : {len(r8)} datasets / {len({r['study_id'] for r in r8.values()})} studies")

shared = sorted(set(r7) & set(r8))
moved = [d for d in shared if r7[d]["study_label"] != r8[d]["study_label"]]
print(f"ids in both releases: {len(shared)}; of those, "
      f"{len(moved)} point at a different study version")

for field in ("study_label", "sample_size"):
    print(f"  QTD000116 {field:12s} r7={r7['QTD000116'][field]:10s} "
          f"r8={r8['QTD000116'][field]}")
print("  QTD000021 in r8_beta  :", r8.get("QTD000021"))

# Quantification methods are release-scoped too: aptamer and microarray datasets exist
# only in release 7, and majiq only in pre-release 8.
print("  r7 quant_method:", sorted({r["quant_method"] for r in r7.values()}))
print("  r8 quant_method:", sorted({r["quant_method"] for r in r8.values()}))
```

The metadata table is the entry point for everything else: `study_id` and `dataset_id`
together give you the FTP path, and nothing else in the tree tells you what a `QTD` id
contains.

## Trap 2 — tabix hands you nineteen unlabelled columns

`pysam.TabixFile(...).header` is **empty** on these files. The index was built skipping the
header line, so htslib does not treat it as a comment and does not return it. The rows come
back as bare tab-separated strings and nothing in the handle tells you which field is `beta`
and which is `se`.

Two further details make guessing worse than it looks:

- **The upstream column documentation is not in file order.** `Columns.md` lists `variant`
  first and `pvalue` third; the file's first three columns are `molecular_trait_id`,
  `chromosome`, `position`. Positional indices copied from the documentation silently read
  the wrong field.
- **The header line is CRLF-terminated in `*.all.tsv.gz`** — and LF-terminated in
  `*.permuted.tsv.gz`, `*.cc.tsv.gz` and the credible-set files, so it is not even uniform
  within a dataset directory. Split it on `\t` without stripping and your last column is
  named `rsid\r`, so every later `row["rsid"]` raises `KeyError`. Strip `\r\n`, per file.

Read the header out of the first bgzip block with a range request and strip it:

```python
"""Recover the column names a tabix handle does not carry. Stdlib only."""
import gzip
import io
import urllib.request

URL = ("https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/sumstats/"
       "QTS000002/QTD000021/QTD000021.all.tsv.gz")


def columns(url):
    """First line of a bgzip file, without downloading the file."""
    req = urllib.request.Request(url, headers={"Range": "bytes=0-65535"})
    with urllib.request.urlopen(req, timeout=180) as fh:
        head = fh.read()
    line = gzip.GzipFile(fileobj=io.BytesIO(head)).readline().decode()
    return line.rstrip("\r\n").split("\t")      # rstrip BOTH, or you get 'rsid\r'

cols = columns(URL)
print(len(cols), cols)
assert cols[:3] == ["molecular_trait_id", "chromosome", "position"]
assert cols[-1] == "rsid", "strip \\r or the last column is named 'rsid\\r'"
assert len(cols) == 19
```

Nineteen bytes of HTTP range is the whole cost, and it makes the result a dict instead of a
positional guess. Do this once per dataset; the column set is uniform within a release.

## Trap 3 — region strings carry no `chr`, and `X` is per-dataset

The `chromosome` column — and therefore the tabix index — uses `1`…`22`, `X`. The `variant`
column in the same row uses `chr20_46120612_T_C`. Pass the `variant`-style name to a region
query and htslib raises `ValueError: could not create iterator for region 'chr20:...'`.

And **the X chromosome is present in some datasets and not others.** In release 7,
`QTD000116` (GTEx adipose) indexes 23 contigs including `X`; `QTD000021` (BLUEPRINT
monocyte) indexes 22 and has no X at all. Checking `tb.contigs` costs one round trip and is
the only reliable answer — "the 2023 release added X chromosome QTLs" is true of the project
and not of every dataset in it.

One more coordinate convention: `TabixFile.fetch(contig, start, stop)` is **0-based and
half-open**, like the rest of pysam, while the `tabix` CLI takes 1-based inclusive regions.
`fetch("20", 46120612, 46120613)` returns nothing for a variant at position 46120612;
`fetch("20", 46120611, 46120613)` returns it.

```python
"""Region queries: contig naming, X coverage, and the coordinate base."""
import pysam

BASE = "https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/sumstats"
BLUEPRINT = f"{BASE}/QTS000002/QTD000021/QTD000021.all.tsv.gz"
GTEX = f"{BASE}/QTS000015/QTD000116/QTD000116.all.tsv.gz"

tb = pysam.TabixFile(BLUEPRINT)
print("header carried by tabix:", tb.header)          # [] -- see Trap 2
print("contigs:", len(tb.contigs), tb.contigs)
assert tb.header == [], "tabix carries no column names on these files"
assert "X" not in tb.contigs, "QTD000021 indexes autosomes only"
assert "chr1" not in tb.contigs, "contigs are unprefixed"

print("GTEx adipose contigs:", len(pysam.TabixFile(GTEX).contigs))   # 23, X included

# 0-based half-open, so the start must be one less than the variant position.
print("fetch(20, 46120612, 46120613):", len(list(tb.fetch("20", 46120612, 46120613))))
print("fetch(20, 46120611, 46120613):", len(list(tb.fetch("20", 46120611, 46120613))))
assert list(tb.fetch("20", 46120612, 46120613)) == []

try:
    list(tb.fetch("chr20", 46120611, 46120613))
    raise AssertionError("a chr-prefixed region should not resolve")
except ValueError as exc:
    print("chr-prefixed region rejected:", exc)
```

Opening a remote `TabixFile` downloads the whole `.tbi` — 1.9 MB for `QTD000021`, 2.2 MB
for `QTD000116` — and htslib caches it as `<name>.tsv.gz.tbi` in the working directory, so
the second query against a dataset is cheap and a script run in a clean directory pays for
the index again. That is also the only thing these region queries write.

The upstream documentation asks for roughly one tabix request every couple of seconds; a
tight loop over thousands of regions gets the client IP blocked by the EBI firewall, which
looks exactly like the dataset having gone away. Batch by region, sleep between datasets.

## Trap 4 — one row is not one association

A single genomic position returns one row **per molecular trait whose cis window contains
it**, and the rows are then duplicated again for every dbSNP rsid mapped to that variant.
Both are intended; both break naive counting.

`chr11_8600556_TAA_T` against `ENSG00000166394` appears three times in release 7 BLUEPRINT
monocytes — `rs60307962`, `rs754402784`, `rs397770102` — with identical `pvalue`, `beta`
and `se`, because one indel carries three rsids. A 100 kb window there yields 6,303 rows
from 339 distinct variants.

So: count associations as distinct `(variant, molecular_trait_id)` pairs, never as rows, and
never de-duplicate on `rsid` — that keeps one arbitrary row per rsid instead of collapsing
them. If you need an rsid at all, aggregate them into a list per variant.

```python
"""Rows inflate two ways. Count (variant, molecular_trait_id) pairs instead."""
import collections

import pysam

URL = ("https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/sumstats/"
       "QTS000002/QTD000021/QTD000021.all.tsv.gz")
COLS = ["molecular_trait_id", "chromosome", "position", "ref", "alt", "variant",
        "ma_samples", "maf", "pvalue", "beta", "se", "type", "ac", "an", "r2",
        "molecular_trait_object_id", "gene_id", "median_tpm", "rsid"]

rows = [dict(zip(COLS, line.rstrip("\r\n").split("\t")))
        for line in pysam.TabixFile(URL).fetch("11", 8600000, 8700000)]

pairs = collections.Counter((r["variant"], r["molecular_trait_id"]) for r in rows)
print(f"rows={len(rows)}  variants={len({r['variant'] for r in rows})}  "
      f"traits={len({r['molecular_trait_id'] for r in rows})}  pairs={len(pairs)}")
print(f"pairs duplicated by multiple rsids: {sum(1 for n in pairs.values() if n > 1)}")

dup = ("chr11_8600556_TAA_T", "ENSG00000166394")
same = [r for r in rows if (r["variant"], r["molecular_trait_id"]) == dup]
print("  rsids:", [r["rsid"] for r in same])
assert len(same) == 3
assert len({(r["pvalue"], r["beta"], r["se"]) for r in same}) == 1, \
    "duplicated rows carry identical statistics -- the rsid is the only difference"

# an/2 is the per-dataset sample size for an autosomal variant; the metadata table's
# sample_size is study-level and can differ from the variant's actual allele count.
print("  an/2 at this variant:", int(same[0]["an"]) / 2)
```

`maf` is the minor-allele frequency *within the QTL-mapping context* — one cell type in one
study — not a population frequency. `r2` is the imputation quality where the study reported
one and `NA` where it did not, and `median_tpm` is `NA` for microarray and aptamer datasets.
Treat every one of those as a string until you have decided what `NA` should become.

## Trap 5 — `p_beta`, not `pvalue`, is what makes a gene significant

`*.permuted.tsv.gz` has one row per molecular trait: the trait's single best variant plus
two empirical p-values from 1,000 permutations. `pvalue` on that row is the *nominal*
p-value of the lead variant, uncorrected for the thousands of variants tested in the cis
window, so filtering on it declares most of the genome significant. `p_perm` is the raw
permutation p-value and floors at `1/1001 ≈ 0.000999` — it cannot distinguish the strongest
signals from each other. `p_beta`, the beta-approximation of the permutation p-value, is the
column to filter and to rank on (FastQTL, PMID:26708335).

The permuted file is small — under a megabyte per dataset — so this is the one file to
download whole.

```python
"""Permutation results: one row per trait, ranked on p_beta."""
import gzip
import urllib.request

URL = ("https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/sumstats/"
       "QTS000002/QTD000021/QTD000021.permuted.tsv.gz")

with urllib.request.urlopen(URL, timeout=300) as fh:
    lines = gzip.decompress(fh.read()).decode().splitlines()
cols = lines[0].rstrip("\r").split("\t")
rows = [dict(zip(cols, ln.rstrip("\r").split("\t"))) for ln in lines[1:] if ln.strip()]
print(len(cols), cols)
print(f"{len(rows)} rows / {len({r['molecular_trait_id'] for r in rows})} traits")
assert len(rows) == len({r["molecular_trait_id"] for r in rows}), "one row per trait"

lead = sorted(rows, key=lambda r: float(r["p_beta"]))[0]
print("top eGene:", {k: lead[k] for k in
                     ("molecular_trait_id", "variant", "pvalue", "p_perm", "p_beta",
                      "n_variants", "n_traits")})

floor = min(float(r["p_perm"]) for r in rows)
tied = sum(1 for r in rows if float(r["p_perm"]) == floor)
print(f"p_perm floors at {floor:.6f}; {tied} traits are tied there")
assert abs(floor - 1 / 1001) < 1e-6, "p_perm cannot resolve below 1/(permutations+1)"
assert float(lead["p_beta"]) < float(lead["p_perm"]), "p_beta resolves past that floor"

sig = [r for r in rows if float(r["p_beta"]) < 0.01]
print(f"traits with p_beta < 0.01: {len(sig)} of {len(rows)}")
```

`n_traits` is how many alternatives were permuted together under one
`molecular_trait_object_id` — 1 for `ge`, many for `tx`, `exon` and `txrev`, where the
object is the gene and the traits are its transcripts, exons or events. The permutation is
performed across that set and reported for the best pair, so a `tx` row's `p_beta` is a
statement about the gene, and `molecular_trait_id` tells you which transcript carried it.

## Identifiers: three trait columns, and tissue labels are not keys

`molecular_trait_id` is the thing tested, `molecular_trait_object_id` is the unit the
permutation ran over, and `gene_id` is the Ensembl gene either maps to. For `ge` all three
coincide and it is easy to assume they always do; for `tx` the trait is `ENST…`, the object
and gene are `ENSG…`, and joining the wrong one collapses transcripts or fans out genes.
Ensembl ids in release 7 are unversioned (`ENSG00000166436`, no `.14` suffix) — do not
compare them against versioned ids without stripping.

On the tissue side, join on `dataset_id`, or on the whole tuple
(`study_label`, `sample_group`, `condition_label`, `quant_method`) — never on
`tissue_label`. Release 7 has 758 dataset rows against 99 distinct `tissue_label` values
and 284 distinct `sample_group` values, so neither is a key: `CD4+ T cell` alone covers 109
datasets spanning different studies, quantification methods and conditions.
`tissue_id` is an ontology CURIE drawn from four vocabularies — 375 Cell Ontology (`CL_`),
337 Uber-anatomy (`UBERON_`), 45 EFO and one BTO term in release 7 — so code that parses
`UBERON_` out of it drops a third of the registry. `condition_label` carries the treatment
arm (`naive`, `IFNg`, `LPS_24h`, …) and two rows differing only there are different
experiments, not replicates.

```python
"""Tissue labels are not keys, and tissue_id spans four ontologies."""
import collections
import csv
import io
import urllib.request

RES = ("https://raw.githubusercontent.com/eQTL-Catalogue/"
       "eQTL-Catalogue-resources/master/data_tables/dataset_metadata_r7.tsv")
with urllib.request.urlopen(RES, timeout=120) as fh:
    rows = list(csv.DictReader(io.StringIO(fh.read().decode()), delimiter="\t"))

print(f"{len(rows)} datasets, {len({r['tissue_label'] for r in rows})} tissue labels, "
      f"{len({r['sample_group'] for r in rows})} sample groups")
print("ontology prefixes:",
      dict(collections.Counter(r["tissue_id"].split("_")[0] for r in rows)))

worst = collections.Counter(r["tissue_label"] for r in rows).most_common(1)[0]
print(f"busiest label {worst[0]!r} covers {worst[1]} datasets")
assert worst[1] > 1, "a tissue_label is not a dataset key"

mono = [r for r in rows if r["sample_group"] == "monocyte" and r["quant_method"] == "ge"]
for r in sorted(mono, key=lambda r: r["dataset_id"]):
    print(f"  {r['dataset_id']}  {r['study_label']:14s} {r['condition_label']:10s} "
          f"n={r['sample_size']:>4s}  {r['tissue_id']}")
```

## Fine-mapped credible sets, and a schema that does not match its documentation

SuSiE credible sets live under `susie/<QTS>/<QTD>/<QTD>.credible_sets.tsv.gz` — about
10 MB per dataset, no tabix index, so download the one you want. These are the files to use
for colocalisation: a credible set is the set of variants that could be causal, with a
posterior inclusion probability each.

`Columns.md` documents seventeen columns including `cs_index`, `finemapped_region`,
`cs_avg_r2`, `posterior_mean`, `posterior_sd` and `cs_log10bf`. **The release 7 files have
thirteen**, and `finemapped_region` is called `region`. Read the header; do not build a
schema from the documentation.

```python
"""Credible-set header, read without downloading 10 MB."""
import gzip
import io
import urllib.request

URL = ("https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/susie/"
       "QTS000002/QTD000021/QTD000021.credible_sets.tsv.gz")
DOCS = ("https://raw.githubusercontent.com/eQTL-Catalogue/"
        "eQTL-Catalogue-resources/master/tabix/Columns.md")

req = urllib.request.Request(URL, headers={"Range": "bytes=0-200000"})
with urllib.request.urlopen(req, timeout=180) as fh:
    head = fh.read()
stream = gzip.GzipFile(fileobj=io.BytesIO(head))
cols = stream.readline().decode().rstrip("\r\n").split("\t")
first = dict(zip(cols, stream.readline().decode().rstrip("\r\n").split("\t")))
print(len(cols), cols)
print("first row:", first)

with urllib.request.urlopen(DOCS, timeout=120) as fh:
    docs = fh.read().decode()
assert "finemapped_region" in docs, "the docs name this column finemapped_region"
assert "region" in cols and "finemapped_region" not in cols, \
    "release 7 files call it region -- 13 columns, not the documented 17"
assert {"cs_id", "pip", "cs_size", "cs_min_r2"} <= set(cols)
print("documented-only columns absent from the file:",
      sorted({"cs_index", "finemapped_region", "cs_avg_r2", "posterior_mean",
              "posterior_sd", "cs_log10bf"} - set(cols)))
```

`cs_id` is unique per credible set within a dataset and `cs_size` is how many variants it
holds, repeated on every row of the set. A `cs_size` in the hundreds with a low maximum
`pip` means fine mapping did not localise the signal — report that rather than taking the
top-`pip` variant as causal. `cs_min_r2` is the floor on pairwise LD within the set and is
the quickest check that a set is one signal rather than two merged.

Merged credible sets for pre-release 8, one parquet per quantification method, are deposited
on Zenodo under CC-BY-4.0 at <https://doi.org/10.5281/zenodo.22846842> — convenient if you
want every dataset at once rather than one at a time.

## Get the files

A complete retrieval, from a tissue name to a tab-separated file plus a manifest, using only
the resource's own tables. The gene's cis window is derived from the permuted file rather
than from an external gene-coordinate lookup, so the recipe has no dependency beyond the
Catalogue itself.

```python
"""eQTL Catalogue release 7 -> cis associations for one gene in one dataset, + manifest."""
import csv
import gzip
import io
import json
import urllib.request
from datetime import date, timezone

import pysam

RELEASE = "r7"
FTP = "https://ftp.ebi.ac.uk/pub/databases/spot/eQTL"
RES = ("https://raw.githubusercontent.com/eQTL-Catalogue/"
       "eQTL-Catalogue-resources/master/data_tables")
STUDY, GROUP, QUANT = "BLUEPRINT", "monocyte", "ge"
GENE = "ENSG00000166436"          # TRIM66
WINDOW = 200_000                  # bp either side of the lead variant


def read_text(url, timeout=300):
    with urllib.request.urlopen(url, timeout=timeout) as fh:
        return fh.read()


# 1. Resolve the dataset. Never hardcode a QTD id -- it is release-scoped (Trap 1).
meta = list(csv.DictReader(
    io.StringIO(read_text(f"{RES}/dataset_metadata_{RELEASE}.tsv", 120).decode()),
    delimiter="\t"))
hits = [r for r in meta if (r["study_label"], r["sample_group"], r["quant_method"])
        == (STUDY, GROUP, QUANT)]
if len(hits) != 1:
    raise SystemExit(f"{len(hits)} datasets match -- narrow on condition_label: "
                     f"{[r['condition_label'] for r in hits]}")
ds = hits[0]
qts, qtd = ds["study_id"], ds["dataset_id"]
print(f"{RELEASE} {qtd}: {ds['study_label']} / {ds['sample_group']} / "
      f"{ds['condition_label']} / n={ds['sample_size']} / {ds['tissue_id']}")

# 2. Lead variant and cis window for the gene, from the permuted file (<1 MB).
perm = gzip.decompress(
    read_text(f"{FTP}/sumstats/{qts}/{qtd}/{qtd}.permuted.tsv.gz")).decode().splitlines()
pcols = perm[0].rstrip("\r").split("\t")
prow = next((dict(zip(pcols, ln.rstrip("\r").split("\t"))) for ln in perm[1:]
             if ln.startswith(GENE + "\t") or f"\t{GENE}\t" in ln), None)
if prow is None:
    raise SystemExit(f"{GENE} was not tested in {qtd}")
chrom, pos = prow["chromosome"], int(prow["position"])
print(f"lead variant {prow['variant']}  p_beta={prow['p_beta']}  "
      f"n_variants={prow['n_variants']}")

# 3. Column names, which tabix does not carry (Trap 2).
nominal = f"{FTP}/sumstats/{qts}/{qtd}/{qtd}.all.tsv.gz"
req = urllib.request.Request(nominal, headers={"Range": "bytes=0-65535"})
with urllib.request.urlopen(req, timeout=180) as fh:
    cols = gzip.GzipFile(fileobj=io.BytesIO(fh.read())).readline().decode()
cols = cols.rstrip("\r\n").split("\t")

# 4. Region query. Unprefixed contig, 0-based half-open start (Trap 3).
tb = pysam.TabixFile(nominal)
if chrom not in tb.contigs:
    raise SystemExit(f"contig {chrom} is not indexed in {qtd}: {tb.contigs}")
start = max(0, pos - WINDOW - 1)
rows = [dict(zip(cols, ln.rstrip("\r\n").split("\t")))
        for ln in tb.fetch(chrom, start, pos + WINDOW)]
rows = [r for r in rows if r["molecular_trait_id"] == GENE]

# 5. Collapse the rsid duplication (Trap 4): one row per variant, rsids gathered.
by_variant = {}
for r in rows:
    cur = by_variant.setdefault(r["variant"], dict(r, rsid=[]))
    if r["rsid"] not in cur["rsid"]:
        cur["rsid"].append(r["rsid"])
assoc = sorted(by_variant.values(), key=lambda r: float(r["pvalue"]))
print(f"{len(rows)} rows -> {len(assoc)} distinct variants for {GENE}")

out = [c for c in cols if c != "rsid"] + ["rsids"]
with open(f"{qtd}_{GENE}_cis.tsv", "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t", lineterminator="\n")
    w.writerow(out)
    for r in assoc:
        w.writerow([r[c] for c in out[:-1]] + [",".join(r["rsid"])])

# 6. The manifest. Without it these numbers cannot be compared to a later pull.
manifest = {
    "retrieved": date.today().isoformat(),
    "resource": "eQTL Catalogue",
    "release": RELEASE,
    "licence": "CC-BY-4.0",
    "study_id": qts, "dataset_id": qtd,
    "dataset": {k: ds[k] for k in ("study_label", "sample_group", "condition_label",
                                   "tissue_id", "quant_method", "sample_size", "pmid")},
    "gene_id": GENE,
    "region": f"{chrom}:{start + 1}-{pos + WINDOW}",
    "lead_variant": prow["variant"], "p_beta": prow["p_beta"],
    "source_files": [nominal, f"{FTP}/sumstats/{qts}/{qtd}/{qtd}.permuted.tsv.gz"],
    "variants": len(assoc), "rows_before_rsid_collapse": len(rows),
}
with open(f"{qtd}_{GENE}_manifest.json", "w") as fh:
    json.dump(manifest, fh, indent=2, sort_keys=True)
print(json.dumps(manifest, indent=2, sort_keys=True)[:400])
print("top association:", {k: assoc[0][k] for k in
                           ("variant", "rsid", "maf", "pvalue", "beta", "se")})
```

Scaling up from there: the per-dataset nominal files are 1–5 GB each and there are 758 of
them in release 7, so whole-release work means either the permuted files (under a megabyte
each, the right choice for "which genes have a QTL anywhere") or the merged Zenodo credible
sets. Download a `.all.tsv.gz` only when you need every variant in a locus for one dataset,
and when you do, fetch the `.tbi` alongside it so later queries are local.

CC-BY-4.0 requires attribution: cite Kerimov *et al.* 2021 (PMID:34493866) and 2023
(PMID:37721944) plus the original study for every dataset you used — `pmid` is a column in
the metadata table precisely so you can.

## Pre-release 8: parquet, and the X chromosome

Pre-release 8 carries no tabix index, so region selection happens in the parquet reader.
The permuted files are small enough to read whole; for the 4–5 GB nominal files use
`pyarrow.dataset` with a filter so only the matching row groups are fetched.

Two things differ beyond the format. The schema is typed — `position` is `int32` and
`pvalue` a `double`, so no string parsing and no `NA` sentinels — and the datasets that have
been reprocessed include X-chromosome QTLs as a matter of course.

```python
"""Pre-release 8 is parquet. Same columns, typed, and X is there."""
import urllib.request

import pyarrow.parquet as pq

URL = ("https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/r8_beta/sumstats/"
       "QTS000015/QTD000116/QTD000116.permuted.parquet")

with urllib.request.urlopen(URL, timeout=300) as fh:
    open("QTD000116.permuted.parquet", "wb").write(fh.read())

pf = pq.ParquetFile("QTD000116.permuted.parquet")
print(f"{pf.metadata.num_rows} rows x {pf.metadata.num_columns} columns")
print(pf.schema_arrow)

tbl = pf.read(columns=["molecular_trait_id", "chromosome", "position", "p_beta"])
chroms = set(tbl.column("chromosome").to_pylist())
print("chromosomes:", len(chroms), "X present:", "X" in chroms)
assert "X" in chroms, "GTEx v10 in r8_beta includes X-chromosome QTLs"
assert str(tbl.schema.field("position").type) == "int32", "typed, not strings"

import pyarrow.compute as pc
x = tbl.filter(pc.equal(tbl.column("chromosome"), "X"))
best = x.sort_by([("p_beta", "ascending")]).slice(0, 3).to_pylist()
print("strongest X-chromosome eGenes:", best)
```

The same column names appear in both releases, so a reader that selects by name rather than
by position works against either once the file format is handled. That is the practical
argument for reading the header in release 7 rather than hardcoding indices.

## Try it

**Data.** eQTL Catalogue release 7 and pre-release 8 beta, over anonymous HTTPS from the
EMBL-EBI public FTP, CC-BY-4.0, no key or account. Four artefacts, each chosen because it
exercises a trap: the retired REST API endpoint (410 Gone), the two dataset metadata tables
(a `QTD` id meaning different data in each), release 7 BLUEPRINT monocyte `ge`
(`QTS000002/QTD000021` — unlabelled tabix columns, a CRLF header, autosomes only, and the
three-rsid indel `chr11_8600556_TAA_T`), and release 7 GTEx adipose subcutaneous
(`QTS000015/QTD000116` — the same id, X-chromosome contig present). All last confirmed
reachable 2026-11-19.

**Run.** Needs `pysam` (`pip install pysam`). It downloads about 5 MB and, because
htslib caches a remote tabix index next to the working directory, leaves two `.tbi` files
behind — `QTD000021.all.tsv.gz.tbi` (1.9 MB) and `QTD000116.all.tsv.gz.tbi` (2.2 MB).
Nothing else is written, and neither multi-gigabyte `.tsv.gz` is fetched.

```python
"""eQTL Catalogue -- self-check. pysam + the standard library.

Downloads ~5 MB. htslib caches each remote .tbi in the working directory; those two
files are the only thing written.
"""
import collections
import csv
import gzip
import io
import urllib.error
import urllib.request

import pysam

FTP = "https://ftp.ebi.ac.uk/pub/databases/spot/eQTL"
RES = ("https://raw.githubusercontent.com/eQTL-Catalogue/"
       "eQTL-Catalogue-resources/master/data_tables")
BLUEPRINT = f"{FTP}/sumstats/QTS000002/QTD000021/QTD000021.all.tsv.gz"
GTEX = f"{FTP}/sumstats/QTS000015/QTD000116/QTD000116.all.tsv.gz"
ok = []


def check(label, got, want):
    ok.append(got == want)
    print(f"  [{'PASS' if got == want else 'FAIL'}] {label}: {got!r}"
          + ("" if got == want else f"  (expected {want!r})"))


def get(url, timeout=300, byte_range=None):
    headers = {"Range": byte_range} if byte_range else {}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as fh:
        return fh.read()


print("1. SHAPE -- the REST API is retired, and says so with 410 rather than 404.")
try:
    get("https://www.ebi.ac.uk/eqtl/api/v2/datasets?size=2", 120)
    check("GET /eqtl/api/v2/datasets", 200, 410)
except urllib.error.HTTPError as exc:
    check("GET /eqtl/api/v2/datasets", exc.code, 410)

print("\n2. INVARIANT -- a QTD id is release-scoped, not an accession.")
tables = {}
for rel in ("r7", "r8_beta"):
    text = get(f"{RES}/dataset_metadata_{rel}.tsv", 120).decode()
    tables[rel] = {r["dataset_id"]: r
                   for r in csv.DictReader(io.StringIO(text), delimiter="\t")}
r7, r8 = tables["r7"], tables["r8_beta"]
print(f"     release 7: {len(r7)} datasets; r8_beta: {len(r8)} datasets")
check("QTD000116 study in r7", r7["QTD000116"]["study_label"], "GTEx")
check("QTD000116 study in r8_beta", r8["QTD000116"]["study_label"], "GTEx_v10")
check("  ... and its sample size moved",
      (r7["QTD000116"]["sample_size"], r8["QTD000116"]["sample_size"]), ("581", "711"))
check("QTD000021 is absent from r8_beta", "QTD000021" in r8, False)
check("tissue_label is not a dataset key",
      max(collections.Counter(r["tissue_label"] for r in r7.values()).values()) > 1, True)

print("\n3. INVARIANT -- tabix carries no column names, and the header is CRLF.")
raw = get(BLUEPRINT, 180, "bytes=0-65535")
line = gzip.GzipFile(fileobj=io.BytesIO(raw)).readline().decode()
check("header line ends CRLF", line.endswith("\r\n"), True)
check("un-stripped split names the last column 'rsid\\r'",
      line.rstrip("\n").split("\t")[-1], "rsid\r")
cols = line.rstrip("\r\n").split("\t")
check("19 columns, molecular_trait_id first", (len(cols), cols[0], cols[-1]),
      (19, "molecular_trait_id", "rsid"))
check("file order differs from the documented order",
      cols[:3], ["molecular_trait_id", "chromosome", "position"])

tb = pysam.TabixFile(BLUEPRINT)
check("TabixFile.header is empty", tb.header, [])

print("\n4. INVARIANT -- contigs are unprefixed, and X coverage is per-dataset.")
check("BLUEPRINT monocyte indexes autosomes only", sorted(tb.contigs, key=int), 
      [str(c) for c in range(1, 23)])
check("GTEx adipose adds X", "X" in pysam.TabixFile(GTEX).contigs, True)
try:
    list(tb.fetch("chr20", 46120611, 46120613))
    check("a chr-prefixed region resolves", True, False)
except ValueError:
    check("a chr-prefixed region is rejected", "ValueError", "ValueError")
check("fetch is 0-based half-open: start == position returns nothing",
      list(tb.fetch("20", 46120612, 46120613)), [])
check("  ... start == position - 1 returns the variant",
      len(list(tb.fetch("20", 46120611, 46120613))) > 0, True)

print("\n5. INVARIANT -- one row is not one association.")
rows = [dict(zip(cols, ln.rstrip("\r\n").split("\t")))
        for ln in tb.fetch("11", 8600000, 8700000)]
pairs = collections.Counter((r["variant"], r["molecular_trait_id"]) for r in rows)
print(f"     {len(rows)} rows, {len({r['variant'] for r in rows})} variants, "
      f"{len(pairs)} variant-trait pairs")
check("rows exceed variant-trait pairs", len(rows) > len(pairs), True)
same = [r for r in rows
        if (r["variant"], r["molecular_trait_id"]) == ("chr11_8600556_TAA_T",
                                                       "ENSG00000166394")]
check("one indel carries three rsids", sorted(r["rsid"] for r in same),
      ["rs397770102", "rs60307962", "rs754402784"])
check("  ... with identical statistics",
      len({(r["pvalue"], r["beta"], r["se"]) for r in same}), 1)

print("\n6. INVARIANT -- p_perm floors at 1/(permutations+1); p_beta does not.")
perm = gzip.decompress(
    get(f"{FTP}/sumstats/QTS000002/QTD000021/QTD000021.permuted.tsv.gz")
).decode().splitlines()
pcols = perm[0].rstrip("\r").split("\t")
prows = [dict(zip(pcols, ln.rstrip("\r").split("\t"))) for ln in perm[1:] if ln.strip()]
check("one permuted row per molecular trait",
      len(prows) == len({r["molecular_trait_id"] for r in prows}), True)
check("p_perm floor is 1/1001",
      abs(min(float(r["p_perm"]) for r in prows) - 1 / 1001) < 1e-6, True)
lead = min(prows, key=lambda r: float(r["p_beta"]))
check("the top eGene's p_beta resolves past that floor",
      float(lead["p_beta"]) < float(lead["p_perm"]), True)

print("\n7. OBSERVED 2026-11-19, release 7 (file dates 2023-04-06) -- drift, not failure.")
print(f"     release 7 {len(r7)} datasets / "
      f"{len({r['study_id'] for r in r7.values()})} studies")
check("QTD000021 permuted traits", len(prows), 16060)
check("  top eGene", lead["molecular_trait_id"], "ENSG00000166436")
check("  its lead variant", lead["variant"], "chr11_8683418_C_T")
check("  traits with p_beta < 0.01",
      sum(1 for r in prows if float(r["p_beta"]) < 0.01), 6648)
check("rows in 11:8600000-8700000", len(rows), 6303)

print(f"\n{sum(ok)}/{len(ok)} checks passed")
assert all(ok), "eQTL Catalogue self-check failed"
```

**Expect.** All checks `PASS` and a final `27/27 checks passed`. Sections 1–6 are
invariants: a failure there means this page is wrong about the resource. Section 7 is
observed on release 7 as of 2026-11-19 — those counts move only when the release is
re-processed, so a mismatch there means a new release has landed and the dataset ids,
counts and file format all need re-checking, not that the skill is broken.

## Limits worth stating in a write-up

- **An eQTL is an association in one tissue in one cohort, not a mechanism.** The
  Catalogue's value is that effect sizes are comparable across studies; it says nothing
  about which gene a variant acts through, and the nearest gene to a lead variant is often
  not the mediated one.
- **Absence of a QTL is not absence of regulation.** `n_variants` on the permuted row
  bounds what was testable, sample sizes run from a few dozen to several hundred, and a
  gene not expressed in a tissue is not tested there at all. A missing row and a tested
  null look identical downstream unless you carry `n_variants` and `median_tpm`.
- **Do not compare `beta` across quantification methods.** `ge` betas are on normalised
  expression, `leafcutter` on intron excision ratios, `txrev` on event usage. The sign and
  the ranking transfer; the magnitude does not.
- **Release 7 is a 2023 processing.** Its genotypes, Ensembl annotation and dbSNP build
  (v151 rsids) are those of 2023. Say which release you used and when you pulled it;
  pre-release 8 reprocesses 16 of the 42 studies and will change numbers for those.
- **Credible sets are per-dataset, not consensus.** The same locus fine-mapped in two
  tissues gives two credible sets, and their overlap is evidence about sharing, not a
  single answer. Report `cs_size` and `cs_min_r2` alongside any top-`pip` variant.

## Sources

- Data access, after the REST API retirement — <https://www.ebi.ac.uk/eqtl/Data_access/>
- Licence (CC-BY-4.0) — <https://www.ebi.ac.uk/eqtl/License/>
- FTP root, release 7 and `r8_beta` — <https://ftp.ebi.ac.uk/pub/databases/spot/eQTL/>
- Dataset metadata tables and column documentation —
  <https://github.com/eQTL-Catalogue/eQTL-Catalogue-resources> (`data_tables/`, `tabix/`).
  `tabix/tabix_ftp_paths.tsv` gives the metadata joined to ready-made paths for the
  nominal, credible-set and log-Bayes-factor files; its URLs are `ftp://`, so rewrite the
  scheme to `https://` before handing them to tabix or a range request.
- Alternative column set in `*.cc.tsv.gz`, and the `imported/` tree of externally
  harmonised studies — both under the same FTP root, neither used by this page
- Merged pre-release 8 credible sets — <https://doi.org/10.5281/zenodo.22846842>
- Resource papers: Kerimov *et al.* 2021 (PMID:34493866) and 2023 (PMID:37721944).
  `p_beta` and the permutation scheme: Ongen *et al.* 2016 (PMID:26708335). The worked
  datasets are BLUEPRINT (PMID:27863251), Alasoo *et al.* 2018 (PMID:29379200) and GTEx
  (PMID:32913098) — cite the originating study of every dataset you use, as CC-BY-4.0
  requires.
