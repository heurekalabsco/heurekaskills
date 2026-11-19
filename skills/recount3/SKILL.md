---
name: recount3
description: Download recount3 uniformly processed RNA-seq — gene, exon and junction counts for human and mouse SRA studies, GTEx tissues and TCGA cancers — straight from the open bucket, and turn coverage sums into read-scale counts correctly.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [rna-seq, transcriptomics, public-data, gtex, sra]
covers: [recount3, recount2, monorail, sra, gtex, tcga, bulk rna-seq, gene counts, exon counts, splice junctions, junction counts, coverage, bigwig, gencode, gencode v26, gencode v29, refseq, fantom, human, mouse, cancer, tumor, normal tissue, brain, blood, liver, skin, muscle, cell line, uniform reprocessing]
papers: [PMID:34844637, PMID:28398307]
access: [open]
datasets: [https://recount-opendata.s3.amazonaws.com/recount3/release/human/homes_index, https://recount-opendata.s3.amazonaws.com/recount3/release/human/data_sources/sra/gene_sums/15/SRP009615/sra.gene_sums.SRP009615.G026.gz, https://recount-opendata.s3.amazonaws.com/recount3/release/human/data_sources/sra/metadata/15/SRP009615/sra.recount_qc.SRP009615.MD.gz, https://recount-opendata.s3.amazonaws.com/recount3/release/human/data_sources/sra/junctions/15/SRP009615/sra.junctions.SRP009615.ALL.MM.gz, https://recount-opendata.s3.amazonaws.com/recount3/release/human/data_sources/gtex/gene_sums/ER/BLADDER/gtex.gene_sums.BLADDER.G026.gz, https://recount-opendata.s3.amazonaws.com/recount3/release/human/data_sources/gtex/metadata/gtex.recount_project.MD.gz, https://recount-opendata.s3.amazonaws.com/recount3/release/mouse/data_sources/sra/gene_sums/63/SRP170963/sra.gene_sums.SRP170963.M023.gz, https://recount-opendata.s3.amazonaws.com/recount3/release/human/annotations/gene_sums/human.gene_sums.G029.gtf.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-19
  against: recount-opendata S3 bucket recount3/release (project index rows processed 2019-10-01 to 2025-09-26) / annotations G026 G029 M023 / recount3 R package source on the devel branch, read not run / Python 3.12 stdlib only / curl 8.7.1
  executed: 6
  unverified: 1
  unverified_reason: The Bioconductor recount3 block was not run because the package is not installed in the validating environment. Re-run from an R 4.4 or later session with recount3 installed from Bioconductor.
---
# recount3 — uniformly processed RNA-seq

recount3 is one pipeline (Monorail: STAR alignment, then coverage summarised over
annotation) run over about 329,000 human and 418,000 mouse SRA runs, 19,214 GTEx
samples and 11,348 TCGA samples. Its value is that the counts for a 2012 study
and a 2024 study, or for a GTEx tissue and a TCGA tumour, came out of the same
aligner, the same annotation and the same summarisation, so they can sit in one
matrix without a cross-study reprocessing project.

**No account, no key, nothing to accept.** The AWS Open Data Registry entry for the
bucket states the licence as "recount3 is Public Domain, recount2 is CC0"
(https://registry.opendata.aws/recount/). Cite the recount3 paper when you use it
(see *Citing it*). Everything below uses `curl` and the Python standard library.

The Bioconductor package `recount3` reads the same files; it is shown once, under
*The R package*, for readers already in R. Nothing else on this page needs R.

Three traps cause most wrong recount3 analyses, and none raises an error:

1. **The counts are base-pair coverage sums, not read counts.** A raw cell is roughly
   *read count x read length*. Hand it to a count model unscaled and every library looks
   36x to 200x deeper than it is, by a factor that differs between studies.
2. **The annotation is part of the file name, and the gene id version moves with it.**
   `ENSG00000141510.16` (GENCODE v26) and `ENSG00000141510.17` (v29) are the same TP53.
3. **Sample ids differ by source.** SRA columns are run accessions, GTEx columns are
   GTEx sample ids with a `.1`/`.2`/`.3` suffix, TCGA columns are GDC file UUIDs, and the
   junction files key on recount3's own `rail_id`.

## Where the files are

The bucket is `s3://recount-opendata`, readable anonymously over plain HTTPS at
`https://recount-opendata.s3.amazonaws.com/recount3/release/`. The older host
`duffel.rail.bio/recount3/`, which the R package and the documentation still name,
answers every file request with a 302 redirect to the same bucket, and its directory
URLs return 404. Point code at the bucket.

Every project file follows one grammar:

    {root}/{organism}/data_sources/{source}/{kind}/{shard}/{project}/{source}.{kind}.{project}.{ext}.gz

| part | values |
|---|---|
| `organism` | `human`, `mouse` |
| `source` | `sra`, `gtex`, `tcga` (mouse has `sra` only) |
| `kind` | `metadata`, `gene_sums`, `exon_sums`, `junctions`, `base_sums` (per-run bigWig coverage) |
| `shard` | the **last** two characters of the project: `SRP009615` is `15`, `BLADDER` is `ER`, `CHOL` is `OL` |
| `ext` for counts | the annotation code, below |

| code | annotation | organism |
|---|---|---|
| `G026` | GENCODE v26 (the build GTEx v8 used) | human |
| `G029` | GENCODE v29 | human |
| `R109` | RefSeq release 109 | human |
| `F006` | FANTOM6 CAT | human |
| `M023` | GENCODE M23 (labelled `gencode_v23` by the R package) | mouse |
| `ERCC`, `SIRV` | spike-in controls | both |

Metadata comes as five tables per SRA project (`recount_project`, `recount_qc`,
`recount_seq_qc`, `recount_pred`, and `sra` with the SRA submission fields); GTEx and
TCGA projects carry `gtex` or `tcga` in place of `sra` and no `recount_pred`. Junctions
come as a Matrix Market triplet: `.MM.gz` counts, `.RR.gz` junction coordinates and
annotation, `.ID.gz` the sample order. GTEx junctions also come in a `UNIQUE` variant
(uniquely mapped reads only) beside `ALL`.

What is in the bucket, as read on 2026-11-19:

```bash
ROOT=https://recount-opendata.s3.amazonaws.com/recount3/release
curl -s $ROOT/human/homes_index; echo; curl -s $ROOT/mouse/homes_index; echo
# A project directory, listed through the S3 API (anonymous, no CLI needed).
curl -s "https://recount-opendata.s3.amazonaws.com/?list-type=2&prefix=recount3/release/human/data_sources/sra/gene_sums/15/SRP009615/" \
  | tr '<' '\n' | sed -n 's/^Key>//p; s/^Size>//p' | paste - -
```

`human/homes_index` lists seven sources: `sra`, `gtex`, `tcga`, and also `ANSWER_ALS`,
`TARGET_ALS`, `ega` and `LIBD`. The last four have directories in the bucket but are
not in the R package's project catalogue and are not documented as public releases;
this page does not cover them.

## Is my study in it?

Each source has one project index, one row per sample, at
`{organism}/data_sources/{source}/metadata/{source}.recount_project.MD.gz`. It carries
ids only, not titles, so find the study first (an SRP from a GEO series via `geo`, or
from ENA via `ena`) and then check it here.

```python
import collections, csv, gzip, io, urllib.request

ROOT = "https://recount-opendata.s3.amazonaws.com/recount3/release"

def project_index(org, source):
    url = f"{ROOT}/{org}/data_sources/{source}/metadata/{source}.recount_project.MD.gz"
    with urllib.request.urlopen(url, timeout=300) as fh:
        rows = list(csv.DictReader(io.StringIO(gzip.decompress(fh.read()).decode()), delimiter="\t"))
    return rows

for org, source in [("human", "sra"), ("human", "gtex"), ("human", "tcga"), ("mouse", "sra")]:
    rows = project_index(org, source)
    n = collections.Counter(r["project"] for r in rows)
    print(f"{org:5} {source:4} {len(n):6} projects {len(rows):7} samples  "
          f"processed {min(r['date_processed'] for r in rows)} .. {max(r['date_processed'] for r in rows)}")

sra = collections.Counter(r["project"] for r in project_index("human", "sra"))
for p in ["SRP009615", "SRP166108", "SRP000001"]:
    print(p, sra.get(p, "not in recount3"))
```

Observed 2026-11-19: human SRA 8,802 projects / 329,290 samples; GTEx 32 / 19,214;
TCGA 33 / 11,348; mouse SRA 10,116 / 417,966. The registry entry and the recount3 site
say 8,679 human and 10,088 mouse studies, and the index has rows processed as late as
2025-09-26 (human) and 2026-02-18 (mouse) — **the `release` path is not frozen**. Record the project index you used
(the manifest under *Get the files* does) if you need to say later which projects
existed.

GTEx projects are tissues (`BRAIN`, `LIVER`, ...), and one of the 32 is `STUDY_NA`
(133 samples filed under no tissue name; check its `gtex` table before using it). TCGA projects are the cancer codes (`BRCA`,
`CHOL`, ...) and include both tumour and normal samples; split them on
`cgc_sample_sample_type` in the `tcga` table.

## Trap 1 — coverage sums are not read counts

recount3 does not count reads. It sums per-base coverage over each gene's exons, so a
read of length *L* that lies inside a gene adds *L* to that gene. The R package source
says so directly ("the raw counts are the sum of base-level coverage"). Two
consequences:

- **The scale is read length.** For a 36 bp single-end study a raw value is about 36x
  the reads; for a 2x76 paired-end GTEx sample about 150x. The ratio differs per study,
  so unscaled raw values are not comparable across studies, and a count model that
  expects reads (`pydeseq2`, edgeR, limma-voom) is handed libraries 36 to 200 times
  deeper than were sequenced.
- **There are two documented ways back**, both computed from `recount_qc`:
  - read-scale counts: `raw / star.average_mapped_length`, what the R package's
    `compute_read_counts()` does (for paired-end runs this length is both mates
    together, so the result is on the scale of read pairs);
  - AUC scaling to a common library: `raw * 4e7 / bc_auc.all_reads_all_bases`, which is
    what the R package's `transform_counts()` does by default.

```python
import csv, gzip, io, statistics, urllib.request

ROOT = "https://recount-opendata.s3.amazonaws.com/recount3/release"

def table(path):
    with urllib.request.urlopen(f"{ROOT}/{path}", timeout=300) as fh:
        lines = gzip.decompress(fh.read()).decode().splitlines()
    return list(csv.reader([l for l in lines if not l.startswith("##")], delimiter="\t"))

base = "human/data_sources/sra"
genes = table(f"{base}/gene_sums/15/SRP009615/sra.gene_sums.SRP009615.G026.gz")
qc = table(f"{base}/metadata/15/SRP009615/sra.recount_qc.SRP009615.MD.gz")
QC = {r[1]: dict(zip(qc[0], r)) for r in qc[1:]}   # keyed on external_id (column 2)

runs = genes[0][1:]
reads, auc_scaled = {}, {}
for j, run in enumerate(runs, 1):
    q = QC[run]
    L = float(q["star.average_mapped_length"])
    auc = float(q["bc_auc.all_reads_all_bases"])
    col = [int(r[j]) for r in genes[1:]]
    # Guard: coverage over genes is a subset of all coverage. If this fails, the QC row
    # does not describe this column and neither scaling is meaningful (see Trap 1b).
    assert sum(col) <= auc, (run, sum(col), auc)
    reads[run] = [round(v / L) for v in col]
    auc_scaled[run] = [round(v * 4e7 / auc) for v in col]
    print(run, "raw sum", sum(col), "read-scale sum", sum(reads[run]),
          "featureCounts assigned", q["gene_fc_count_all.assigned"])
```

The independent check is `gene_fc_count_all.assigned` in the same table, a featureCounts
read count from the same alignment. Read-scale sums came out 1.11 to 1.13 times it in
this study, 1.01 to 1.06 in GTEx BLADDER, 1.09 to 1.16 in TCGA CHOL. They are not equal
— coverage summed per gene counts a read twice where genes overlap, and featureCounts
does not — and they should never be off by a factor of read length. If yours is near
36, 76, 100 or 150, the coverage was not scaled.

### Trap 1b — sometimes the QC row and the counts disagree

In mouse SRP170963 (368 single-cell runs, P7 microglia), 356 count columns hold **more**
gene coverage than the run's total coverage in `recount_qc`, which cannot happen if both
describe one alignment. The SRA record decides which is wrong: SRR8249477 sequenced
32,850 bases according to SRA, and its `gene_sums` column holds over 600 million bases of
gene coverage. So the count columns do not belong to the runs they are labelled with,
and no scaling repairs that. We found this in 1 of the 5 projects we read in full and in
none of 22 more sampled for this check alone (15 human, 7 mouse SRA projects of 3 to 40
runs each), so it is not common, and it is silent where it happens.
Keep the `sum(col) <= auc` guard in any loop over projects; it is the cheap check that
catches this.

## Trap 2 — annotation versions and id suffixes

The same project has separate count files per annotation, and their gene ids are
different keys:

| | G026 | G029 |
|---|---|---|
| genes in the file | 63,856 | 64,837 |
| TP53 | `ENSG00000141510.16` | `ENSG00000141510.17` |
| ids shared, versioned | 60,482 | |
| ids shared, suffix stripped | 63,437 | |

Join on the versioned id when both sides come from the same annotation; that is the
exact key. Strip the suffix only to cross annotations, and know what stripping costs:
G026 has 45 `_PAR_Y` rows (`ENSG00000002586.18_PAR_Y` is the Y copy of CD99) that
collapse onto their X-copy id; in SRP009615 and GTEx BLADDER all 45 are all-zero rows. Drop the
`_PAR_Y` rows before stripping, never after. Do not join on gene symbol: 2,699 symbols
repeat within G026 alone (`Y_RNA` 831 times).

G026 is the GENCODE build GTEx v8 used, and TP53 is `ENSG00000141510.16` in both; the
GTEx Portal's current releases use later builds with different suffixes (see `gtex` for
the version table). Pick G026 to line up with GTEx v8, G029 for a newer GENCODE.

## Trap 3 — sample identifiers by source

| source | count-file column | to join elsewhere, use |
|---|---|---|
| `sra` | run accession, `SRR...`/`ERR...`/`DRR...` | itself; `sample_acc` and `experiment_acc` are in the `sra` table |
| `gtex` | GTEx `SAMPID` plus `.1`, `.2` or `.3` | the `SAMPID` column of the `gtex` table |
| `tcga` | GDC file UUID | `tcga_barcode` or `gdc_file_id` in the `tcga` table (see `gdc`) |
| junction `.ID.gz` | `rail_id` | map through `recount_project` (`rail_id` -> `external_id`) |

The GTEx suffix is not decoration. 79 GTEx samples appear as two or three columns
(146 extra columns in all), for example `GTEX-P4PP-2026-SM-3P61N.1`, `.2`, `.3`. Strip
the suffix to join to GTEx covariates and you get a one-to-many join; decide whether to
sum, pick one, or keep all of them before the join, not after.

Junction `.ID.gz` order is not the `gene_sums` column order. Map by `rail_id`.

## Junctions

The `.MM.gz` matrix is junctions x samples, 1-based, integer **read** counts — unlike the
gene and exon files, these are reads spanning a junction, not coverage. Each column sums
exactly to `junction_coverage` in `recount_qc` (checked for all 12 runs of SRP009615).
`.RR.gz` gives `chromosome`, `start`, `end`, `length`, `strand`, `annotated` and the
annotation sources that know each end. SRP009615 has 281,448 junctions with at least one
read; a GTEx tissue's matrix runs to tens of MB.

## The R package

For readers in R, Bioconductor's `recount3` builds a `RangedSummarizedExperiment` from
the same files. Not run for this page (see `verified:`); it is here so a reader already
in R does not translate the Python by hand.

```r
library(recount3)
proj <- available_projects()                       # human by default
p <- subset(proj, project == "SRP009615" & project_type == "data_sources")
rse <- create_rse(p, type = "gene", annotation = "gencode_v26")
assay(rse, "counts") <- transform_counts(rse)      # AUC scaling, 4e7 target
reads <- compute_read_counts(rse)                  # raw / average mapped length
```

## Get the files

One project, one annotation, everything except per-run bigWigs, with a manifest of
size, SHA-256, URL and date. Directory listings go through the S3 API with continuation
tokens, so a project with more than 1,000 files in one `kind` is listed whole.

```python
import hashlib, os, re, sys, urllib.parse, urllib.request
from datetime import date

BUCKET = "https://recount-opendata.s3.amazonaws.com"
PREFIX = "recount3/release"


def list_keys(prefix):
    """Every (key, size) under a prefix, following S3 continuation tokens."""
    out, token = [], None
    while True:
        q = {"list-type": "2", "prefix": prefix}
        if token:
            q["continuation-token"] = token
        with urllib.request.urlopen(f"{BUCKET}/?{urllib.parse.urlencode(q)}", timeout=120) as fh:
            xml = fh.read().decode()
        out += [(k, int(s)) for k, s in re.findall(r"<Key>([^<]+)</Key>.*?<Size>(\d+)</Size>", xml)]
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", xml)
        if "<IsTruncated>true</IsTruncated>" not in xml:
            return out
        token = m.group(1)


def get_project(org, source, project, annotation, outdir,
                kinds=("metadata", "gene_sums", "exon_sums", "junctions")):
    os.makedirs(outdir, exist_ok=True)
    keys = []
    for kind in kinds:
        found = list_keys(f"{PREFIX}/{org}/data_sources/{source}/{kind}/{project[-2:]}/{project}/")
        if kind in ("gene_sums", "exon_sums"):
            found = [(k, s) for k, s in found if k.endswith(f".{annotation}.gz")]
        if not found:
            raise SystemExit(f"no {kind} files for {org}/{source}/{project} ({annotation})")
        keys += found
    manifest = [("file", "bytes", "sha256", "url", "retrieved")]
    for key, size in keys:
        url = f"{BUCKET}/{key}"
        dest = os.path.join(outdir, key.rsplit("/", 1)[1])
        urllib.request.urlretrieve(url, dest)
        got = os.path.getsize(dest)
        if got != size:
            raise SystemExit(f"{dest}: {got} bytes on disk, {size} in the listing")
        with open(dest, "rb") as fh:
            sha = hashlib.sha256(fh.read()).hexdigest()
        manifest.append((os.path.basename(dest), str(size), sha, url, date.today().isoformat()))
    with open(os.path.join(outdir, "MANIFEST.tsv"), "w") as fh:
        fh.writelines("\t".join(r) + "\n" for r in manifest)
    return manifest[1:]


if __name__ == "__main__":
    org, source, project, annotation, outdir = sys.argv[1:6]
    for row in get_project(org, source, project, annotation, outdir):
        print(row[0], row[1])
```

Save it as `get_recount3.py` and run, for example:

```bash
python3 get_recount3.py human sra SRP009615 G026 recount3_SRP009615   # 10 files, 28 MB
python3 get_recount3.py human gtex BLADDER G029 recount3_BLADDER        # adds UNIQUE junctions
python3 get_recount3.py human sra SRP999999 G026 nothing                 # exits 1: no metadata files
```

Also save the annotation GTF that matches the counts,
`{root}/human/annotations/gene_sums/human.gene_sums.G026.gtf.gz` (1.8 MB; `exon_sums`
annotations sit beside it under `annotations/exon_sums/`), and the project index you
checked against, since the `release` path keeps gaining rows.

Sizes to expect: the bucket served 0.2 to 1 MB/s to us. A small SRA project is tens of
MB; exon files are about ten times the gene file; GTEx BRAIN and TCGA BRCA gene files
are 296 MB and 131 MB, and the largest human SRA project (SRP166108, 8,464 runs) has a
64 MB G026 gene file and 8,464 bigWigs (1.3 GB). Leave `base_sums` out of `kinds` unless you need
base-level coverage.

## What does not work

- `https://duffel.rail.bio/recount3/` and every directory under it: 404. Files there
  302 to the S3 bucket; use the bucket.
- Guessing the shard from the first characters of the project: 404. It is the last two.
- A `recount_pred` table for a GTEx or TCGA project: there is none; only SRA projects
  carry it.
- Sample ids in the junction `.ID.gz` against count-file columns: no match; they are
  `rail_id`.
- Treating `homes_index` as the list of public sources: it also names four sources
  (`ANSWER_ALS`, `TARGET_ALS`, `ega`, `LIBD`) outside the documented release.

## Try it

A self-contained check that this skill still works. Public data, no account, no key,
Python standard library only; about 30 MB of downloads, two minutes on a slow link.

**Data** — the recount-opendata bucket, `recount3/release`: human SRA SRP009615 (12
single-end 36 bp K562 runs, gene sums in G026, metadata, junctions), GTEx BLADDER (21
paired-end samples), mouse SRA SRP170963 (the counter-example in Trap 1b), the GTEx
project index, and the G026 and G029 gene annotations. Public domain per the AWS Open
Data Registry entry. SRP009615 is small enough to run anywhere and is single-end, so
read length is the whole scale factor; BLADDER is the smallest paired-end case. Last
confirmed reachable 2026-11-19.

```python
import csv, gzip, io, re, statistics, urllib.request

ROOT = "https://recount-opendata.s3.amazonaws.com/recount3/release"


def fetch(path):
    with urllib.request.urlopen(f"{ROOT}/{path}", timeout=300) as fh:
        return gzip.decompress(fh.read()).decode()


def table(path):
    """Tab-separated recount3 file -> (## header lines, rows). Rows include the column header."""
    lines = fetch(path).splitlines()
    meta = [l for l in lines if l.startswith("##")]
    return meta, list(csv.reader([l for l in lines if not l.startswith("##")], delimiter="\t"))


def project_files(org, src, proj, ann):
    sub = f"{org}/data_sources/{src}"
    k = proj[-2:]  # the two-character shard is the LAST two characters of the project
    meta, genes = table(f"{sub}/gene_sums/{k}/{proj}/{src}.gene_sums.{proj}.{ann}.gz")
    _, qc = table(f"{sub}/metadata/{k}/{proj}/{src}.recount_qc.{proj}.MD.gz")
    _, sq = table(f"{sub}/metadata/{k}/{proj}/{src}.recount_seq_qc.{proj}.MD.gz")
    by_ext = lambda t: {r[1]: dict(zip(t[0], r)) for r in t[1:]}  # column 2 is external_id
    return meta, genes, by_ext(qc), by_ext(sq)


# 1. A small single-end human SRA project (12 runs, 36 bp, K562 shRNA lines).
meta, genes, QC, SQ = project_files("human", "sra", "SRP009615", "G026")
head, rows = genes[0], genes[1:]
assert meta[0] == "##annotation=G026", meta
assert head[0] == "gene_id" and len(head) - 1 == len(QC) == 12
assert all(v.isdigit() for r in rows[:5000] for v in r[1:])
print("SRP009615 G026          :", len(rows), "genes x", len(head) - 1, "runs")

# 2. THE TRAP. Every cell is a sum of per-base coverage, not a read count.
#    Divide by the mapped read length to get read-scale counts; the featureCounts
#    gene-assigned read total in recount_qc is the independent check.
ratio_raw, ratio_reads = [], []
for j, run in enumerate(head[1:], 1):
    raw = sum(int(r[j]) for r in rows)
    L = float(QC[run]["star.average_mapped_length"])
    fc = int(QC[run]["gene_fc_count_all.assigned"])
    auc = int(QC[run]["bc_auc.all_reads_all_bases"])
    assert raw <= auc, (run, raw, auc)  # gene coverage is a subset of all coverage
    ratio_raw.append(raw / fc)
    ratio_reads.append(raw / L / fc)
print("raw sum / reads assigned: median %.1f  (read length here: 36 bp)" % statistics.median(ratio_raw))
print("raw/L   / reads assigned: min %.3f max %.3f" % (min(ratio_reads), max(ratio_reads)))
assert 30 < statistics.median(ratio_raw) < 40
assert all(0.9 < x < 1.3 for x in ratio_reads), ratio_reads

# 3. Paired-end check: GTEx BLADDER. average_mapped_length is BOTH mates (~150 for 2x76),
#    so a raw column is ~150x its read count, not 36x.
_, g2, Q2, S2 = project_files("human", "gtex", "BLADDER", "G026")
pe = [round(float(Q2[s]["star.average_mapped_length"]) / float(S2[s]["avg_len"])) for s in g2[0][1:]]
assert set(pe) == {2}, set(pe)
x = [sum(int(r[j]) for r in g2[1:]) / int(Q2[s]["gene_fc_count_all.assigned"]) for j, s in enumerate(g2[0][1:], 1)]
print("GTEx BLADDER raw / reads: median %.1f, every run paired (mapped/read length = 2)" % statistics.median(x))
assert statistics.median(x) > 140

# 4. COUNTER-EXAMPLE: a project whose count columns do not describe their runs. In mouse
#    SRP170963 most columns hold MORE gene coverage than the run's total coverage (AUC),
#    and SRA's own record says SRR8249477 sequenced 32,850 bases. Scaling these columns
#    by their QC row gives nonsense. Check before you scale.
_, g3, Q3, _ = project_files("mouse", "sra", "SRP170963", "M023")
_, sra = table("mouse/data_sources/sra/metadata/63/SRP170963/sra.sra.SRP170963.MD.gz")
SRA = {r[1]: dict(zip(sra[0], r)) for r in sra[1:]}
bad = 0
for j, s in enumerate(g3[0][1:], 1):
    raw = sum(int(r[j]) for r in g3[1:])
    if raw > int(Q3[s]["bc_auc.all_reads_all_bases"]):
        bad += 1
    if s == "SRR8249477":
        print(f"SRR8249477              : {raw} bases of gene coverage, "
              f"{SRA[s]['run_total_bases']} bases sequenced (SRA)")
        assert raw > 1000 * int(SRA[s]["run_total_bases"])
print(f"mouse SRP170963         : {bad} of {len(g3[0]) - 1} runs have gene coverage > total AUC")
assert bad > 0

# 5. Annotation versions are different keys. Same gene, different version suffix.
def gene_ids(ann):
    txt = fetch(f"human/annotations/gene_sums/human.gene_sums.{ann}.gtf.gz")
    out = {}
    for line in txt.splitlines():
        f = line.split("\t")
        if len(f) > 8 and f[2] == "gene":
            a = dict(re.findall(r'(\S+) "([^"]*)"', f[8]))
            out[a["gene_id"]] = a["gene_name"]
    return out
g26, g29 = gene_ids("G026"), gene_ids("G029")
assert len(g26) == len(rows)
tp53 = sorted(k for k in g26 if k.startswith("ENSG00000141510")) + sorted(k for k in g29 if k.startswith("ENSG00000141510"))
print("TP53 in G026 / G029     :", tp53)
assert tp53 == ["ENSG00000141510.16", "ENSG00000141510.17"]
shared_v = len(set(g26) & set(g29))
bare = lambda ids: {i.split(".")[0] for i in ids}
print(f"G026 vs G029 shared ids : {shared_v} versioned, {len(bare(g26) & bare(g29))} after stripping the suffix")
# Stripping the suffix is not free either: _PAR_Y twins collapse onto their X copy.
par = [k for k in g26 if k.endswith("_PAR_Y")]
assert len(bare(g26)) == len(g26) - len(par)
print(f"G026 _PAR_Y rows        : {len(par)} (collapse onto the X-copy id if you strip the suffix)")

# 6. Sample ids differ by source. GTEx columns are SAMPID plus a ".N" run suffix, and the
#    same SAMPID can be two or three columns.
_, gp = table("human/data_sources/gtex/metadata/gtex.recount_project.MD.gz")
ext = [r[1] for r in gp[1:]]
stripped = [re.sub(r"\.\d+$", "", e) for e in ext]
dup = len(stripped) - len(set(stripped))
print(f"GTEx columns            : {len(ext)}; {dup} extra columns share a SAMPID with another column")
assert all(re.search(r"\.\d+$", e) for e in ext) and dup > 0

# 7. Junctions: ID file is rail_id, not run accession, and in a different order from
#    gene_sums. Column sums of the MM matrix equal recount_qc junction_coverage (reads).
P = "human/data_sources/sra/junctions/15/SRP009615/sra.junctions.SRP009615.ALL"
ids = fetch(f"{P}.ID.gz").split()[1:]
_, proj = table("human/data_sources/sra/metadata/15/SRP009615/sra.recount_project.SRP009615.MD.gz")
rail_to_run = {r[0]: r[1] for r in proj[1:]}
mm = [l for l in fetch(f"{P}.MM.gz").splitlines() if not l.startswith("%")]
n_junc, n_samp, n_nz = map(int, mm[0].split())
tot = [0] * n_samp
for l in mm[1:]:
    i, j, v = l.split()
    tot[int(j) - 1] += int(v)
assert len(mm) - 1 == n_nz and n_samp == len(ids) == 12
for rid, t in zip(ids, tot):
    assert t == int(QC[rail_to_run[rid]]["junction_coverage"]), (rid, t)
print(f"junctions               : {n_junc} x {n_samp}, column sums == junction_coverage for all {n_samp}")
assert [rail_to_run[r] for r in ids] != head[1:]
print("OK")
```

**Expect** — invariants (a failure means this page is wrong):

- Gene files open with `##annotation=<code>` and `##date.generated=` lines, then a
  `gene_id` header and one column per sample; every cell is a non-negative integer.
- Per run, gene coverage sum <= `bc_auc.all_reads_all_bases` in a healthy project, and
  raw / `star.average_mapped_length` lands within 0.9 to 1.3 of
  `gene_fc_count_all.assigned`. Raw / assigned reads is on the order of read length,
  never near 1.
- Paired-end runs have `star.average_mapped_length` about twice `avg_len`.
- The G026 GTF has exactly one gene per row of a G026 gene file; G026 and G029 give TP53
  different version suffixes; stripping suffixes in G026 loses exactly the `_PAR_Y` rows.
- Every GTEx column id ends in `.N`; junction `.ID.gz` rows are `rail_id`s, and each
  `.MM.gz` column sum equals that run's `junction_coverage`.

Observed 2026-11-19 (drift to investigate, not a failure):

```text
SRP009615 G026          : 63856 genes x 12 runs
raw sum / reads assigned: median 39.9  (read length here: 36 bp)
raw/L   / reads assigned: min 1.108 max 1.127
GTEx BLADDER raw / reads: median 156.4, every run paired (mapped/read length = 2)
SRR8249477              : 619738665 bases of gene coverage, 32850 bases sequenced (SRA)
mouse SRP170963         : 356 of 368 runs have gene coverage > total AUC
TP53 in G026 / G029     : ['ENSG00000141510.16', 'ENSG00000141510.17']
G026 vs G029 shared ids : 60482 versioned, 63437 after stripping the suffix
G026 _PAR_Y rows        : 45 (collapse onto the X-copy id if you strip the suffix)
GTEx columns            : 19214; 146 extra columns share a SAMPID with another column
junctions               : 281448 x 12, column sums == junction_coverage for all 12
OK
```

If step 4 stops failing its guard, recount3 has repaired SRP170963: replace it with
another counter-example or drop the step, and say so.

## Citing it

Wilks C, Zheng SC, Chen FY et al. recount3: summaries and queries for large-scale
RNA-seq expression and splicing. *Genome Biol* 22, 323 (2021),
doi:10.1186/s13059-021-02533-6. For recount2 data, Collado-Torres L et al.,
*Nat Biotechnol* 35, 319–321 (2017), doi:10.1038/nbt.3838. Cite the original study
(the SRP's GEO series, GTEx, TCGA) as well as recount3 for the data you use.
