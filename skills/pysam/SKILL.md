---
name: pysam
description: Read, filter and write BAM, CRAM, SAM, VCF/BCF, FASTQ and tabix-indexed files in Python with pysam — region queries, read-flag and MAPQ filtering, per-base coverage and pileups without silent depth caps, sorting and indexing, genotype tuples, remote files over https, and the coordinate conventions that cause off-by-one errors.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [bam, vcf, file-io, sequencing-reads, variant-calling]
datasets: [https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/phase3/data/HG00096/alignment/HG00096.chrom20.ILLUMINA.bwa.GBR.low_coverage.20120522.bam, https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/ALL.chr20.phase3_shapeit2_mvncall_integrated_v5b.20130502.genotypes.vcf.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: pysam 0.24.1 (htslib 1.24, samtools 1.24) / numpy 2.5.4 / Python 3.12.13 on macOS arm64 / all blocks run in page order in one fresh directory and Try it run again alone in a second fresh directory / techniques also checked on the 2012 low-coverage CRAM of the same sample (bwa 0.5.9, GRCh37, reference fetched by MD5) and the 2020 30x GRCh38 CRAM (bwa-mem, chr-prefixed contigs) from the 1000 Genomes high-coverage release
  executed: 10
  unverified: 0
---
# pysam

pysam is a Python wrapper around htslib, the C library behind samtools and bcftools. It
reads and writes aligned reads (SAM/BAM/CRAM), variants (VCF/BCF), sequences (FASTA/FASTQ)
and any bgzip-compressed, tabix-indexed text file. It is the right tool when you need to
*compute over* reads or records in Python; if all you need is a count or a reformatted file,
the bundled samtools/bcftools commands (`pysam.view`, `pysam.sort`, ...) are shorter.

Most of pysam's failure modes are silent: a pileup that stops at 8,000 reads, a coverage
array that disagrees with a pileup over the same base, an iterator that ends early because
another query reused the file handle. This page is organized around those traps.

## Install

```bash
python -m pip install pysam
```

Wheels exist for Linux and macOS (x86-64 and arm64). There are no Windows wheels; use WSL.
Nothing else is needed: samtools and bcftools are compiled into the package and exposed as
Python functions, so no system `samtools` has to be on `PATH`.

## Coordinates: the single biggest source of bugs

| Where | Convention | Example for the 1st base of chr20 |
|---|---|---|
| `fetch(contig, start, stop)`, `pileup(...)`, `count_coverage(...)` | 0-based, half-open | `fetch("20", 0, 1)` |
| `read.reference_start`, `read.reference_end`, `column.reference_pos` | 0-based (end exclusive) | `0` |
| `record.start` / `record.stop` on a VCF record | 0-based, half-open | `0` |
| `record.pos` on a VCF record | 1-based (as in the file) | `1` |
| region strings `region="20:1-1"`, samtools command lines | 1-based, closed | `"20:1-1"` |

A one-base window at VCF position `P` is therefore `fetch(chrom, P - 1, P)`, or
`fetch(region=f"{chrom}:{P}-{P}")`. Both forms are shown together in the blocks below.

**Contig names are whatever the file says.** `"20"` and `"chr20"` are different contigs to
htslib, and asking for the wrong one raises `ValueError: invalid contig`. Do not infer the
convention from the genome build: the 1000 Genomes GRCh38 phased VCF uses `20`, while the
1000 Genomes GRCh38 CRAMs use `chr20`. Read `bam.references` or `list(vcf.header.contigs)`
first.

## Reading alignments

The examples use one public file throughout: chromosome 20 of sample HG00096 from the
1000 Genomes Project phase 3 low-coverage release (about 4x, GRCh37, bwa 0.5.9, 2012). It
is read directly over https; no account is needed.

```python
import pysam

URL = ("https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/phase3/data/HG00096/alignment/"
       "HG00096.chrom20.ILLUMINA.bwa.GBR.low_coverage.20120522.bam")

with pysam.AlignmentFile(URL) as remote:
    print(remote.references[:3], remote.nreferences, remote.has_index())
    # Copy a 100 kb window to a local BAM. The template carries the header over.
    with pysam.AlignmentFile("slice.bam", "wb", template=remote) as out:
        for read in remote.fetch("20", 1_000_000, 1_100_000):
            out.write(read)

pysam.index("slice.bam")
bam = pysam.AlignmentFile("slice.bam")
print(bam.mapped, bam.unmapped)
```

What happens here, and what to know about it:

- **Remote files need their index next to them** (`.bai`, `.crai`, `.csi`, `.tbi` at the
  same URL plus the suffix). htslib downloads the index into the **current working
  directory** and leaves it there; expect `HG00096...bam.bai` to appear. Pass
  `index_filename=` to point at an index stored elsewhere.
- `fetch()` with a region **requires an index** and raises `ValueError: fetch called on
  bamfile without index` otherwise. Index files must be coordinate-sorted first (see
  *Writing*).
- `fetch(until_eof=True)` streams the whole file in file order without an index, and also
  returns unplaced unmapped reads, which a region query never does.
- `fetch` returns every read that **overlaps** the window, so reads can start before
  `start`.
- `bam.mapped` / `bam.unmapped` come from the index, not from reading the file.
- `"rb"` (or no mode) reads BAM, `"rc"` CRAM, `"r"` SAM; pysam detects the format from the
  content anyway. For writing use `"wb"`, `"wc"` or `"w"`.

### CRAM needs the reference

CRAM stores reads as differences from a reference sequence, so decoding needs that
sequence. Pass `reference_filename="genome.fa"` (an indexed FASTA whose contigs match the
CRAM's `@SQ M5` checksums), or let htslib fetch each contig by MD5 from the ENA reference
server. Its built-in default URL is plain http and was answered with a redirect that
htslib did not follow; the failure surfaces as `OSError: truncated file` after
`[E::cram_next_slice] Failure to decode slice`, which says nothing about the reference.
Set the https endpoint and a local cache before Python starts:

```bash
export REF_PATH='https://www.ebi.ac.uk/ena/cram/md5/%s'
export REF_CACHE="$HOME/.cache/hts-ref/%2s/%2s/%s"
```

The first query on a contig downloads the whole contig (about 60 MB for chr20) and can take
several minutes; later queries hit the cache. Older lossy CRAMs may not store read names at
all — the 2012 1000 Genomes CRAMs return generated names such as `file.cram:125808918` — so
never pair mates or deduplicate by name in a CRAM without checking.

## Filtering reads

```python
import pysam
from collections import Counter

bam = pysam.AlignmentFile("slice.bam")

def usable(read, min_mapq=20):
    return not (read.is_unmapped or read.is_secondary or read.is_supplementary
                or read.is_duplicate or read.is_qcfail
                or read.mapping_quality < min_mapq)

tally = Counter()
for read in bam.fetch("20"):
    tally["total"] += 1
    tally["unmapped"] += read.is_unmapped
    tally["duplicate"] += read.is_duplicate
    tally["mapq0"] += read.mapping_quality == 0
    tally["usable"] += usable(read)
print(dict(tally))

read = next(bam.fetch("20", 1_050_000, 1_050_001))
print(read.query_name, read.flag, read.reference_start, read.reference_end,
      read.cigarstring, read.get_tag("RG"), read.is_reverse)
```

- An unmapped read whose mate is mapped is **placed** at its mate's position, so it is
  returned by a region query. Its `reference_end` is `None`, and in older files it may
  still carry a CIGAR. Always test `is_unmapped` before using alignment coordinates.
- `query_sequence` is stored in reference orientation; `get_forward_sequence()` and
  `get_forward_qualities()` give the read as sequenced.
- `query_sequence` and `query_qualities` cover soft clips; `query_alignment_sequence` and
  `query_alignment_length` do not.
- `get_aligned_pairs()` maps read positions to reference positions, with `None` on either
  side for insertions, deletions and clips.

## Counting reads and coverage

There are three tools, and **their default filters differ**:

| Call | Reads skipped by default | Base quality floor | Depth cap |
|---|---|---|---|
| `bam.count(...)` | none (`read_callback="nofilter"`) | — | none |
| `bam.count_coverage(...)` | unmapped, secondary, QC-fail, duplicate (`read_callback="all"`) | 15 (`quality_threshold`) | none |
| `bam.pileup(...)` | the same four flags (`stepper="all"`) plus orphan reads (`ignore_orphans=True`); overlapping mate bases counted once (`ignore_overlaps=True`) | 13 (`min_base_quality`) | **8,000** (`max_depth`) |

So over the same base, `count` can report a duplicate that the other two drop, and
`count_coverage` and `pileup` disagree whenever a base has quality 13 or 14, or a read is an
orphan. Set the filters explicitly whenever two numbers have to agree:

```python
import numpy as np
import pysam

bam = pysam.AlignmentFile("slice.bam")
start, stop = 1_000_000, 1_100_000

# A, C, G, T counts per position (four arrays), no depth cap.
acgt = np.array(bam.count_coverage("20", start, stop, quality_threshold=15,
                                   read_callback="all"))
depth_cc = acgt.sum(axis=0)

depth_pu = np.zeros(stop - start, dtype=int)
for col in bam.pileup("20", start, stop, truncate=True, min_base_quality=15,
                      ignore_orphans=False, ignore_overlaps=False, max_depth=1_000_000):
    depth_pu[col.reference_pos - start] = sum(
        1 for p in col.pileups if not p.is_del and not p.is_refskip)

print(depth_cc.sum(), depth_pu.sum(), int((depth_cc != depth_pu).sum()))

dup = next(r for r in bam.fetch("20") if r.is_duplicate)
pos = dup.reference_start + 10
print(bam.count("20", pos, pos + 1),
      bam.count("20", pos, pos + 1, read_callback="all"))
```

Pileup traps beyond the filters:

- **`max_depth` silently truncates.** The default stops at 8,000 reads per column, and
  `max_depth=0` does *not* mean unlimited — it also gives 8,000. Amplicon, CRISPR-editing,
  mitochondrial and capture data routinely exceed that. Pass a number larger than any
  depth you expect.
- **Pass `truncate=True`** to get only the columns inside `[start, stop)`. Without it,
  pileup yields every column touched by the overlapping reads.
- **`column.nsegments` is not the depth you filtered for.** It still counts reads whose base
  failed `min_base_quality`; `column.get_num_aligned()` and `column.pileups` honor it.
  Deletions and reference skips are in `pileups` too — check `is_del` / `is_refskip`.
- `pileup` defaults to `compute_baq=True`, which only takes effect when a reference FASTA is
  passed with `fastafile=`. With one, base qualities near indels are lowered and counts
  change.
- `col.get_query_sequences(mark_matches=..., add_indels=True)` returns bases in
  samtools-mpileup style; lowercase means reverse strand.

### Two queries on one file handle

A second `fetch` or `pileup` on the **same** `AlignmentFile` while a first iterator is still
open silently ends the first one. Nothing is raised:

```python
import pysam

bam = pysam.AlignmentFile("slice.bam")
n_alone = sum(1 for _ in bam.fetch("20", 1_000_000, 1_000_500))

outer = bam.fetch("20", 1_000_000, 1_000_500)
next(outer)
list(bam.fetch("20", 1_050_000, 1_050_500))
n_shared = 1 + sum(1 for _ in outer)

outer = bam.fetch("20", 1_000_000, 1_000_500, multiple_iterators=True)
next(outer)
list(bam.fetch("20", 1_050_000, 1_050_500))
n_separate = 1 + sum(1 for _ in outer)
print(n_alone, n_shared, n_separate)
```

Use `multiple_iterators=True` (it reopens the file) or a second `AlignmentFile` for nested
queries. For CRAM, `multiple_iterators` is not implemented and pysam warns; open a second
handle.

## Writing, sorting and indexing

```python
import random
import pysam

src = pysam.AlignmentFile("slice.bam")
reads = list(src.fetch("20"))
random.Random(0).shuffle(reads)  # stands in for any processing that breaks the order

with pysam.AlignmentFile("filtered.unsorted.bam", "wb", template=src) as out:
    for read in reads:
        if read.is_unmapped or read.is_duplicate or read.mapping_quality < 20:
            continue
        out.write(read)

try:
    pysam.index("filtered.unsorted.bam")
except pysam.SamtoolsError as err:
    print("cannot index an unsorted BAM:", str(err).strip()[:80])

pysam.sort("-o", "filtered.bam", "filtered.unsorted.bam")
pysam.index("filtered.bam")
print(pysam.idxstats("filtered.bam").splitlines()[19])
print(pysam.view("-c", "filtered.bam", "20:1000001-1001000").strip())

header = {"HD": {"VN": "1.6", "SO": "coordinate"}, "SQ": [{"SN": "amplicon", "LN": 1000}]}
with pysam.AlignmentFile("synthetic.bam", "wb", header=header) as out:
    for i in range(12_000):
        a = pysam.AlignedSegment(out.header)
        a.query_name = f"r{i}"
        a.query_sequence = "A" * 50
        a.flag = 0
        a.reference_id = 0
        a.reference_start = 100
        a.mapping_quality = 60
        a.cigarstring = "50M"
        a.query_qualities = pysam.qualitystring_to_array("I" * 50)
        out.write(a)
pysam.index("synthetic.bam")

deep = pysam.AlignmentFile("synthetic.bam")
default_depth = next(deep.pileup("amplicon", 120, 121, truncate=True)).nsegments
full_depth = next(deep.pileup("amplicon", 120, 121, truncate=True, max_depth=100_000)).nsegments
print(default_depth, full_depth)
```

- `template=` copies the header; `header=` takes a dict (or an `AlignmentHeader`) when you
  build one yourself. Set `query_sequence` **before** `query_qualities`: assigning a sequence
  resets the qualities.
- The samtools/bcftools wrappers take the same arguments as the command line, return stdout
  as a string, and raise `pysam.SamtoolsError` (with the tool's stderr) on a non-zero exit.
  htslib also prints `[E::...]` lines to stderr that you cannot suppress from Python.
- `pysam.sort` appends a `@PG` line to the header, as samtools does.

## Variants (VCF/BCF)

The matching 1000 Genomes phase 3 genotype file for chromosome 20 (2,504 samples, GRCh37)
is also read over https.

```python
import pysam

VCF = ("https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/"
       "ALL.chr20.phase3_shapeit2_mvncall_integrated_v5b.20130502.genotypes.vcf.gz")

vcf = pysam.VariantFile(VCF)
print(len(vcf.header.samples), vcf.header.info["AF"].number, vcf.header.info["DP"].number)
vcf.subset_samples(["HG00096"])  # parse one sample instead of 2,504

records = list(vcf.fetch("20", 1_000_000, 1_100_000))
long_one = next(r for r in records if r.start < 1_000_000)
print("starts before the window:", long_one.pos, long_one.stop, long_one.alts)

multi = next(r for r in records if len(r.alts) > 1)
call = multi.samples["HG00096"]
print(multi.pos, multi.ref, multi.alts, multi.info["AF"], call["GT"], call.phased, call.alleles)
print(sum(1 for _ in vcf.fetch(region="20:1000001-1100000")) == len(records))
```

- **`fetch` returns records that overlap the window by their `END`**, so a structural
  variant that starts hundreds of kilobases upstream comes back too. In this window a
  `<CN2>` copy-number record starting at 366,657 is returned for a query at 1,000,000.
  Filter on `record.start` if you mean "starts inside".
- `record.pos` is 1-based, `record.start`/`record.stop` 0-based half-open; `record.id` is
  `None` for `.`.
- INFO fields declared `Number=A` (one value per ALT allele, such as `AF` and `AC` here)
  come back as **tuples even for biallelic sites**: use `r.info["AF"][0]`, not
  `r.info["AF"]`. `Number=1` fields are scalars, and flags are `True`/absent.
- `GT` is a tuple of allele indices into `(ref,) + alts`; a missing call is `(None, None)`
  or `(None,)`. `call.alleles` gives the bases, `call.phased` says whether `|` was used.
  The index `2` in `(0, 2)` refers to the second ALT, not to a dosage.
- `subset_samples` must be called before iterating and makes large multi-sample files
  much faster to parse. For writing, `pysam.VariantFile("out.vcf.gz", "w",
  header=vcf.header)` then `out.write(record)`; index the result with
  `pysam.tabix_index("out.vcf.gz", preset="vcf")` or `pysam.bcftools.index`.

## FASTQ/FASTA and tabix-indexed text

```python
import os
import pysam

bam = pysam.AlignmentFile("slice.bam")
with open("reads.fq", "w") as fh:
    for i, read in enumerate(bam.fetch("20")):
        if i == 50:
            break
        qual = pysam.qualities_to_qualitystring(read.get_forward_qualities())
        fh.write(f"@{read.query_name}\n{read.get_forward_sequence()}\n+\n{qual}\n")

with pysam.FastxFile("reads.fq") as fq:
    first = next(fq)
    print(first.name, len(first.sequence), first.get_quality_array()[:5])
print(sum(1 for _ in pysam.FastxFile("reads.fq")))

with open("windows.bed", "w") as fh:
    for s in range(1_000_000, 1_100_000, 10_000):
        fh.write(f"20\t{s}\t{s + 10_000}\tw{s}\n")
bgz = pysam.tabix_index("windows.bed", preset="bed", force=True)
print(bgz, os.path.exists("windows.bed"))

tbx = pysam.TabixFile(bgz)
for row in tbx.fetch("20", 1_015_000, 1_025_000, parser=pysam.asBed()):
    print(row.contig, row.start, row.end, row.name)
```

- `FastxFile` reads FASTA and FASTQ, plain or gzip. Each entry has `name`, `comment`,
  `sequence` and `quality` (`None` for FASTA). For random access into an indexed FASTA use
  `pysam.FastaFile("genome.fa").fetch("20", 0, 100)` (0-based, half-open).
- **`tabix_index` compresses in place and deletes the original** (`windows.bed` is gone
  afterwards) unless you pass `keep_original=True`. The input must be sorted by contig and
  start. It returns the new filename.
- `TabixFile.fetch` returns raw tab-separated strings unless you pass a parser
  (`asBed`, `asGTF`, `asVCF`, `asTuple`).

## Try it

**Data.** Two files from the 1000 Genomes Project phase 3, read over https with no account
or download step: the chromosome 20 low-coverage alignments of sample HG00096 (BAM with
`.bai`, GRCh37) and the chromosome 20 phase 3 genotype VCF (with `.tbi`). The International
Genome Sample Resource distributes these without access restrictions. Both URLs last
confirmed reachable 2026-11-06.

**Run.** Copies a 100 kb window locally, then checks that the coverage tools agree once
their filters match, and that HG00096's heterozygous SNV calls are supported by reads.

```python
import numpy as np
import pysam

BAM = ("https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/phase3/data/HG00096/alignment/"
       "HG00096.chrom20.ILLUMINA.bwa.GBR.low_coverage.20120522.bam")
VCF = ("https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/"
       "ALL.chr20.phase3_shapeit2_mvncall_integrated_v5b.20130502.genotypes.vcf.gz")
CHROM, START, STOP = "20", 1_000_000, 1_100_000

with pysam.AlignmentFile(BAM) as remote, \
        pysam.AlignmentFile("tryit.bam", "wb", template=remote) as out:
    for read in remote.fetch(CHROM, START, STOP):
        out.write(read)
pysam.index("tryit.bam")
bam = pysam.AlignmentFile("tryit.bam")

reads = list(bam.fetch(CHROM, START, STOP))
assert all(r.reference_start < STOP for r in reads)
assert all(r.is_unmapped or r.reference_end > START for r in reads)
assert bam.count(CHROM, START, STOP) >= bam.count(CHROM, START, STOP, read_callback="all")

acgt = np.array(bam.count_coverage(CHROM, START, STOP, quality_threshold=15))
depth_pu = np.zeros(STOP - START, dtype=int)
for col in bam.pileup(CHROM, START, STOP, truncate=True, min_base_quality=15,
                      ignore_orphans=False, ignore_overlaps=False, max_depth=1_000_000):
    depth_pu[col.reference_pos - START] = sum(
        1 for p in col.pileups if not p.is_del and not p.is_refskip)
assert (acgt.sum(axis=0) == depth_pu).all()

vcf = pysam.VariantFile(VCF)
vcf.subset_samples(["HG00096"])
het, supported = 0, 0
for rec in vcf.fetch(CHROM, START, STOP):
    if rec.start < START or len(rec.ref) != 1 or len(rec.alts) != 1 or len(rec.alts[0]) != 1:
        continue
    gt = rec.samples["HG00096"]["GT"]
    if sorted(gt) != [0, 1]:
        continue
    het += 1
    counts = dict(zip("ACGT", (int(a[rec.start - START]) for a in acgt)))
    supported += counts.get(rec.alts[0], 0) > 0

print("reads in window:", len(reads))
print("depth sum:", int(depth_pu.sum()), "mean depth:", round(depth_pu.mean(), 2))
print("het SNVs:", het, "with alt-read support:", supported)
```

**Expect.**

Invariants — a failure means this page is wrong:

- every fetched read starts before `STOP` and every mapped one ends after `START`;
- `count` with no filter is at least `count` with `read_callback="all"`;
- `count_coverage` and `pileup` give identical depth at every one of the 100,000 positions
  once quality threshold, orphan and overlap handling, and depth cap are set the same;
- `het` is not larger than the number of VCF records in the window, and `supported` is not
  larger than `het`.

Observed on 2026-11-06 with pysam 0.24.1 — these move only if the files are re-released:

- `reads in window: 4989`
- `depth sum: 464925 mean depth: 4.65`
- `het SNVs: 98 with alt-read support: 77` — at under 5x many heterozygous sites see no
  alternate read by chance (the phase 3 calls were imputed across samples, not made from
  this file alone), so this is a sanity check, not a genotype concordance.

The run takes about a minute, almost all of it in the two remote queries. It leaves
`tryit.bam`, its index and the two downloaded remote indexes in the working directory.

## Pointers

- For interval arithmetic over BED/VCF tables in a dataframe rather than record by record,
  `polars-bio` covers that ground.
- To find and download raw reads before alignment, see `ena`.
- htslib's format specifications (SAM, VCF, CRAM, tabix) at https://samtools.github.io/hts-specs/
  define every flag and field referenced here.
