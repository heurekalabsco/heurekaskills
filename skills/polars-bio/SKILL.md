---
name: polars-bio
description: Genomic interval operations and bioinformatics file I/O on Polars DataFrames — overlap, nearest, merge, coverage, complement, and subtract over BED/VCF/BAM/GFF/BigWig, plus streaming FastQC, with cloud-native paths.
category: utility
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.4.0
tags: [genomic-intervals, bed, vcf, polars, file-io]
allowed-tools: Read, Write, Edit, Bash
datasets: []
verified:
  date: 2026-08-26
  against: polars-bio 0.34.0 / polars 1.44.1 / Python 3.11.15 / bioframe 0.8.0
  executed: 38
  unverified: 19
  unverified_reason: >-
    Each needs a format-specific input the validating environment could not synthesise —
    a BigBed track, a VCF Zarr store, a Hi-C pairs file, a CRAM plus its reference, or a
    VCF carrying AF/DP INFO and GQ FORMAT fields. Re-run with a set of real sample files
    in those formats; everything else in the skill executes against inline-generated data.
---
# polars-bio

## Overview

polars-bio is a high-performance Python library for genomic interval operations and bioinformatics file I/O, built on Polars, Apache Arrow, and Apache DataFusion. It provides a familiar DataFrame-centric API for interval arithmetic (overlap, nearest, merge, coverage, complement, subtract) and reading/writing common bioinformatics formats (BED, VCF, BAM, CRAM, GFF/GTF, FASTA, FASTQ).

Key value propositions:
- **6-38x faster** than bioframe on real-world genomic benchmarks
- **Streaming/out-of-core** support for large genomes via DataFusion
- **Cloud-native** file I/O (S3, GCS, Azure) with predicate pushdown
- **Two API styles**: functional (`pb.overlap(df1, df2)`) and method-chaining (`df1.lazy().pb.overlap(df2)`)
- **SQL interface** for genomic data via DataFusion SQL engine

## When to Use This Skill

Use this skill when:
- Performing genomic interval operations (overlap, nearest, merge, coverage, complement, subtract)
- Reading/writing bioinformatics file formats (BED, VCF, BAM, CRAM, GFF/GTF, FASTA, FASTQ)
- Processing large genomic datasets that don't fit in memory (streaming mode)
- Running SQL queries on genomic data files
- Migrating from bioframe to a faster alternative
- Computing read depth/pileup from BAM/CRAM files
- Working with Polars DataFrames containing genomic intervals

## Quick Start

### Installation

Requires Python 3.11–3.14 (see [PyPI](https://pypi.org/project/polars-bio/)).

```bash
uv pip install "polars-bio==0.34.0"
```

For pandas compatibility (pandas ≥3.0):

```bash
uv pip install "polars-bio[pandas]==0.34.0"
```

Nothing else is needed — the wheel bundles the Rust engine and its Polars runtime.

### Basic Overlap Example

```python
import polars as pl
import polars_bio as pb

# Create two interval DataFrames
df1 = pl.DataFrame({
    "chrom": ["chr1", "chr1", "chr1"],
    "start": [1, 5, 22],
    "end":   [6, 9, 30],
})

df2 = pl.DataFrame({
    "chrom": ["chr1", "chr1"],
    "start": [3, 25],
    "end":   [8, 28],
})

# Functional API (returns LazyFrame by default)
result = pb.overlap(df1, df2)
result_df = result.collect()

# Get a DataFrame directly
result_df = pb.overlap(df1, df2, output_type="polars.DataFrame")

# Method-chaining API (via .pb accessor on LazyFrame)
result = df1.lazy().pb.overlap(df2)
result_df = result.collect()
```

### Reading a BED File

```python
import polars_bio as pb

# Eager read (loads entire file)
df = pb.read_bed("regions.bed")

# Lazy scan (streaming, for large files)
lf = pb.scan_bed("regions.bed")
result = lf.collect()
```

## Core Capabilities

### 1. Genomic Interval Operations

polars-bio provides 8 core interval operations for genomic range arithmetic. All operations accept Polars DataFrames with `chrom`, `start`, `end` columns (configurable). All operations return a `LazyFrame` by default (use `output_type="polars.DataFrame"` for eager results).

**Operations:**
- `overlap` / `count_overlaps` - Find or count overlapping intervals between two sets (`overlap_output="left"` returns df1-only hits since 0.30.0)
- `nearest` - Find nearest intervals (with configurable `k`, `overlap`, `distance` params)
- `merge` - Merge overlapping/bookended intervals within a set
- `cluster` - Assign cluster IDs to overlapping intervals
- `coverage` - Compute per-interval coverage counts (two-input operation)
- `complement` - Find gaps between intervals within a genome
- `subtract` - Remove portions of intervals that overlap another set

**Example:**
```python
import polars_bio as pb

# Find overlapping intervals (returns LazyFrame)
result = pb.overlap(df1, df2, suffixes=("_1", "_2"))

# Count overlaps per interval
counts = pb.count_overlaps(df1, df2)

# Merge overlapping intervals
merged = pb.merge(df1)

# Find nearest intervals
nearest = pb.nearest(df1, df2)

# Collect any LazyFrame result to DataFrame
result_df = result.collect()
```

**Reference:** See `references/interval_operations.md` for detailed documentation on all operations, parameters, output schemas, and performance considerations.

### 2. Bioinformatics File I/O

Read and write common bioinformatics formats with `read_*`, `scan_*`, `write_*`, and `sink_*` functions. Supports cloud storage (S3, GCS, Azure) and compression (GZIP, BGZF).

**Supported formats:**
- **BED** - Genomic intervals (`read_bed`, `scan_bed`, `write_*` via generic)
- **VCF** - Genetic variants (`read_vcf`, `scan_vcf`, `write_vcf`, `sink_vcf`)
- **VCF Zarr** - Analysis-ready Zarr stores (`read_vcf_zarr`, `scan_vcf_zarr`, `register_vcf_zarr`, `describe_vcf_zarr`; local directory paths)
- **BAM** - Aligned reads (`read_bam`, `scan_bam`, `write_bam`, `sink_bam`)
- **CRAM** - Compressed alignments (`read_cram`, `scan_cram`, `write_cram`, `sink_cram`)
- **GFF** - Gene annotations (`read_gff`, `scan_gff`)
- **GTF** - Gene annotations (`read_gtf`, `scan_gtf`)
- **FASTA** - Reference sequences (`read_fasta`, `scan_fasta`, `write_fasta`, `sink_fasta`)
- **FASTQ** - Sequencing reads (`read_fastq`, `scan_fastq`, `write_fastq`, `sink_fastq`)
- **SAM** - Text alignments (`read_sam`, `scan_sam`, `write_sam`, `sink_sam`)
- **Hi-C pairs** - Chromatin contacts (`read_pairs`, `scan_pairs`)
- **BigWig** - Continuous signal tracks (`read_bigwig`, `scan_bigwig`, `register_bigwig`)
- **BigBed** - Indexed interval tracks (`read_bigbed`, `scan_bigbed`, `register_bigbed`)

**Example:**
```python
import polars_bio as pb

# Read VCF file
variants = pb.read_vcf("samples.vcf.gz")

# Lazy scan BAM file (streaming)
alignments = pb.scan_bam("aligned.bam")

# Read GFF annotations
genes = pb.read_gff("annotations.gff3")

# Read a BigWig signal track (chrom, start, end, value)
signal = pb.read_bigwig("coverage.bw")

# Cloud storage (individual params, not a dict)
df = pb.read_bed("s3://bucket/regions.bed",
                 allow_anonymous=True)
```

**Reference:** See `references/file_io.md` for per-format column schemas, parameters, cloud storage options, and compression support.

### 3. SQL Data Processing

Register bioinformatics files as tables and query them using DataFusion SQL. Combines the power of SQL with polars-bio's genomic-aware readers.

```python
import polars as pl
import polars_bio as pb

# Register files as SQL tables (path first, name= keyword)
pb.register_vcf("samples.vcf.gz", name="variants")
pb.register_bed("target_regions.bed", name="regions")

# Query with SQL (returns LazyFrame)
# NOTE: `end` is a reserved word — double-quote it in a select list
result = pb.sql('SELECT chrom, start, "end", ref, alt FROM variants WHERE qual > 30')
result_df = result.collect()

# Register a Polars DataFrame as a SQL table
pb.from_polars("my_intervals", df)
result = pb.sql("SELECT * FROM my_intervals WHERE chrom = 'chr1'").collect()
```

**Reference:** See `references/sql_processing.md` for register functions, SQL syntax, and examples.

### 4. Pileup Operations

Compute per-base read depth from BAM/CRAM files with CIGAR-aware depth calculation.

```python
import polars_bio as pb

# Compute depth across a BAM file
depth_lf = pb.depth("aligned.bam")
depth_df = depth_lf.collect()

# With quality filter
depth_lf = pb.depth("aligned.bam", min_mapping_quality=20)
```

**Reference:** See `references/pileup_operations.md` for parameters and integration patterns.

### 5. FASTQ Quality Control

`pb.fastqc()` runs FastQC's 12 core modules over a FASTQ file (plain, `.gz`, or BGZF) in a
single streaming pass, returning tables rather than an HTML report. Output is bit-exact
against FastQC 0.12.1 run with `--nogroup`.

```python
import polars_bio as pb

qc = pb.fastqc("reads.fastq.gz")

# Per-module PASS / WARN / FAIL verdicts
qc.summary().collect()

# Individual modules are LazyFrames — collect the ones you need
qc.basic_stats.collect()        # n_seq, total_bases, min_len, max_len, gc_pct
qc.per_base_quality.collect()   # position, mean, median, q1, q3, p10, p90

# Compute only what is needed — cheaper on large files
qc = pb.fastqc("reads.fastq.gz", modules=["basic_stats", "adapter_content"])
```

**Reference:** See `references/fastqc.md` for the module list, output schemas, the long-form
`tidy` table, and the SQL entry point.

## Key Concepts

### Coordinate Systems

polars-bio defaults to **1-based** coordinates (genomic convention). This can be changed globally:

```python
import polars_bio as pb

# Switch to 0-based half-open coordinates (default is 1-based / False)
pb.set_option("datafusion.bio.coordinate_system_zero_based", True)

# Switch back to 1-based (default)
pb.set_option("datafusion.bio.coordinate_system_zero_based", False)
```

I/O functions also accept `use_zero_based` to set coordinate metadata on the resulting DataFrame:

```python
# Read BED with explicit 0-based metadata
df = pb.read_bed("regions.bed", use_zero_based=True)
```

**Important:** BED files are always 0-based half-open in the file format. polars-bio handles the conversion automatically when reading BED files. Coordinate metadata is attached to DataFrames by I/O functions and propagated through operations.

### Two API Styles

**Functional API** - standalone functions, explicit inputs:
```python
result = pb.overlap(df1, df2, suffixes=("_1", "_2"))
merged = pb.merge(df)
```

**Method-chaining API** - via `.pb` accessor on **LazyFrames** (not DataFrames):
```python
result = df1.lazy().pb.overlap(df2)
merged = df.lazy().pb.merge()
```

**Important:** The `.pb` accessor for interval operations is only available on `LazyFrame`. On `DataFrame`, `.pb` provides write operations only (`write_bam`, `write_vcf`, etc.).

Method-chaining enables fluent pipelines:
```python
# Chain interval operations (note: overlap outputs suffixed columns,
# so rename before merge which expects chrom/start/end)
result = (
    df1.lazy()
    .pb.overlap(df2)
    .filter(pl.col("start_2") > 1000)
    .select(
        pl.col("chrom_1").alias("chrom"),
        pl.col("start_1").alias("start"),
        pl.col("end_1").alias("end"),
    )
    .pb.merge()
    .collect()
)
```

### Probe-Build Architecture

For two-input operations (overlap, nearest, count_overlaps, coverage), polars-bio uses a probe-build join strategy:
- The **first** DataFrame is the **probe** (iterated over)
- The **second** DataFrame is the **build** (indexed for lookup)

For best performance, pass the larger DataFrame as the first argument (probe) and the smaller one as the second (build).

### Column Conventions

By default, polars-bio expects columns named `chrom`, `start`, `end`. Custom column names can be specified via lists:

```python
result = pb.overlap(
    df1, df2,
    cols1=["chromosome", "begin", "finish"],
    cols2=["chr", "pos_start", "pos_end"],
)
```

### Return Types and Collecting Results

All interval operations and `pb.sql()` return a **LazyFrame** by default. Use `.collect()` to materialize results, or pass `output_type="polars.DataFrame"` for eager evaluation:

```python
# Lazy (default) - collect when needed
result_lf = pb.overlap(df1, df2)
result_df = result_lf.collect()

# Eager - get DataFrame directly
result_df = pb.overlap(df1, df2, output_type="polars.DataFrame")
```

### Streaming and Out-of-Core Processing

For datasets larger than available RAM, use `scan_*` functions and streaming execution:

```python
# Scan files lazily
lf = pb.scan_bed("large_intervals.bed")

# Process with Polars streaming (requires polars ≥1.37, bundled with polars-bio)
result = lf.collect(engine="streaming")
```

DataFusion streaming is enabled by default for interval operations, processing data in batches without loading the full dataset into memory.

## Common Pitfalls

1. **`.pb` accessor on DataFrame vs LazyFrame:** Interval operations (overlap, merge, etc.) are only on `LazyFrame.pb`. `DataFrame.pb` only has write methods. Use `.lazy()` to convert before chaining interval ops.

2. **LazyFrame returns:** All interval operations and `pb.sql()` return `LazyFrame` by default. Don't forget `.collect()` or use `output_type="polars.DataFrame"`.

3. **Column name mismatches:** polars-bio expects `chrom`, `start`, `end` by default. Use `cols1`/`cols2` parameters (as lists) if your columns have different names.

4. **Coordinate system metadata:** Interval operations read coordinate metadata from I/O functions or DataFrame `config_meta`. For manually built DataFrames, set `df.config_meta.set(coordinate_system_zero_based=True)` (0-based) or `False` (1-based). If metadata is missing, polars-bio falls back to the global `datafusion.bio.coordinate_system_zero_based` setting (with a warning). Set `pb.set_option("datafusion.bio.coordinate_system_check", True)` to raise `MissingCoordinateSystemError` instead. Mismatched systems between inputs raise `CoordinateSystemMismatchError`.

5. **Probe-build order matters:** For overlap, nearest, and coverage, the first DataFrame is probed against the second. Swapping arguments changes which intervals appear in the left vs right output columns, and can affect performance.

6. **INT32 position limit:** Genomic positions are stored as 32-bit integers, limiting coordinates to ~2.1 billion. This is sufficient for all known genomes but may be an issue with custom coordinate spaces.

7. **BAM index requirements:** a whole-file `read_bam` / `scan_bam` does **not** need a `.bai` — the file is read sequentially. The index is what makes region queries possible, so create one with `samtools index` when querying a locus rather than a whole file.

8. **Parallel execution disabled by default:** DataFusion parallelism defaults to 1 partition. Enable for large datasets:
   ```python
   pb.set_option("datafusion.execution.target_partitions", 8)
   ```

9. **CRAM has separate functions:** Use `read_cram`/`scan_cram`/`register_cram` for CRAM files (not `read_bam`). CRAM functions require a `reference_path` parameter.

10. **A BED3 file reads as zero rows, and nothing raises.** `read_bed` / `scan_bed` /
    `register_bed` project every BED to a fixed four-column schema — `chrom`, `start`,
    `end`, `name` — and a file with only the three mandatory columns has no `name` field,
    so every record fails to parse. The failure is *logged* by the Rust layer
    (`Error reading record from BED file` on stderr) and then swallowed: you get an empty
    DataFrame, not an exception. BED4 through BED12 all read correctly, so the fix is to
    give the file a name column:

    ```bash
    awk 'BEGIN{OFS="\t"} {print $1,$2,$3,(NF>3?$4:"r"NR)}' three_col.bed > four_col.bed
    ```

    Check `df.height` after reading any BED you did not write yourself. A zero-row result
    from a non-empty file means this, not an empty interval set. Observed on 0.33.1, 0.34.0
    and 0.35.1 alike, so it is long-standing behaviour rather than a recent regression.
    Reported upstream as biodatageeks/polars-bio#456.

11. **`end` is a reserved SQL word:** `pb.sql("SELECT chrom, start, end FROM regions")` fails with a `ParserError`. Double-quote it — `SELECT chrom, start, "end" FROM regions`. It parses unquoted when table-qualified (`v.end`), inside a function (`MAX(end)`), or in a `WHERE` clause; only a bare select-list position breaks.

12. **`coverage` was wrong on the 1-based path before 0.35.1 — pin at or above it.** The
    global default is **1-based** (`datafusion.bio.coordinate_system_zero_based = false`),
    which is the path a hand-built DataFrame with no `config_meta` gets. On `0.35.0` and
    earlier, `coverage` returned numbers on that path that contradicted each other. For a
    query `[10, 20]`, whose 1-based inclusive length is 11:

    | target | ≤ 0.35.0 | ≥ 0.35.1 |
    |---|---|---|
    | identical to the query | 10 | **11** |
    | `[5, 25]`, a strict superset | 12 | **11** |
    | `[0, 100]`, a much larger superset | 12 | **11** |

    A target identical to the query and one strictly containing it must both return the
    query's own length. The old numbers were 10 and 12 against a length of 11 — three
    answers where there can only be one, and the superset exceeding the interval it
    measures. Fixed in **0.35.1** (biodatageeks/polars-bio#450); the same release also
    stopped a zero-length target reporting one covered base on the 0-based path. The
    0-based path was correct throughout and is unchanged.

    If you are pinned below 0.35.1 and cannot move, set the metadata explicitly on **both**
    frames — that routes you onto the 0-based path, which was always right:

    ```python
    for df in (query, target):
        df.config_meta.set(coordinate_system_zero_based=True)   # BED semantics
    ```

    Setting it is worth doing regardless of version: Pitfall 4 covers coordinate metadata
    generally, and `coverage` is the operation where leaving it unset historically returned
    a plausible wrong number instead of an error.


## Best Practices

1. **Use `scan_*` for large files:** Prefer `scan_bed`, `scan_vcf`, etc. over `read_*` for files larger than available RAM. Scan functions enable streaming and predicate pushdown.

2. **Configure parallelism for large datasets:**
   ```python
   import os
   pb.set_option("datafusion.execution.target_partitions", os.cpu_count())
   ```

3. **Use BGZF compression:** BGZF-compressed files (`.bed.gz`, `.vcf.gz`) support parallel block decompression, significantly faster than plain GZIP.

4. **Select columns early:** When only specific columns are needed, select them early to reduce memory usage:
   ```python
   df = pb.read_vcf("large.vcf.gz").select("chrom", "start", "end", "ref", "alt")
   ```

5. **Use cloud paths directly:** Pass S3/GCS/Azure URIs directly to read/scan/register functions instead of downloading files first. Authenticated access uses your cloud SDK credentials (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, Azure defaults) only when those cloud paths are accessed:
   ```python
   df = pb.read_bed("s3://my-bucket/regions.bed", allow_anonymous=True)
   ```

6. **Prefer functional API for single operations, method-chaining for pipelines:** Use `pb.overlap()` for one-off operations and `.lazy().pb.overlap()` when building multi-step pipelines.

## Try it

A self-contained check that this skill still works. No account, no key, no network beyond
installing the package.

**Data** — generated inline by the block below (`datasets: []`). polars-bio is a file-format
and interval-arithmetic library, so the input that determines its behaviour is the *shape* of
a BED file, not the contents of any particular public dataset. Two files are written that
differ only in column count, which is exactly the axis Pitfall 10 turns on. Nothing here can
rot behind a URL.

**Run** — in a fresh empty directory, after `uv pip install "polars-bio==0.34.0"`:

```python
import polars as pl
import polars_bio as pb

# --- Data: the same three intervals as BED3 and as BED6 --------------------
rows = [("chr1", 0, 5), ("chr1", 4, 8), ("chr1", 21, 29)]
with open("three.bed", "w") as f:                    # chrom, start, end
    for c, s, e in rows:
        f.write(f"{c}\t{s}\t{e}\n")
with open("six.bed", "w") as f:                      # + name, score, strand
    for i, (c, s, e) in enumerate(rows, 1):
        f.write(f"{c}\t{s}\t{e}\tr{i}\t0\t+\n")

three, six = pb.read_bed("three.bed"), pb.read_bed("six.bed")
print("BED3 rows :", three.height, "   <- Pitfall 10")
print("BED6 rows :", six.height)
print("schema    :", six.columns)
print("dtypes    :", [str(t) for t in six.dtypes])

# --- Coordinates: BED is 0-based half-open, polars-bio returns 1-based -----
raw = pb.read_bed("six.bed", use_zero_based=True)
print("file 0-based start :", raw.row(0)[1], "| default 1-based start :", six.row(0)[1])

# --- Interval arithmetic on a known answer --------------------------------
target = pl.DataFrame({"chrom": ["chr1", "chr1"], "start": [3, 25], "end": [8, 28]})
target.config_meta.set(coordinate_system_zero_based=False)
merged = pb.merge(six.lazy().select("chrom", "start", "end")).collect().sort("start")
hits   = pb.count_overlaps(six.lazy().select("chrom", "start", "end"), target).collect()
print("merged    :", merged.select("start", "end").rows())
print("overlaps  :", hits["count"].to_list())

# --- Coverage, both coordinate systems (Pitfall 12) ------------------------
def coverage_of(q, t, zero_based):
    Q = pl.DataFrame({"chrom": ["chr1"], "start": [q[0]], "end": [q[1]]})
    T = pl.DataFrame({"chrom": ["chr1"], "start": [t[0]], "end": [t[1]]})
    for d in (Q, T):
        d.config_meta.set(coordinate_system_zero_based=zero_based)
    return pb.coverage(Q, T, output_type="polars.DataFrame")["coverage"][0]

qi = (10, 20)                       # identical target, and a strict superset
zb_same, zb_super = coverage_of(qi, qi, True), coverage_of(qi, (5, 25), True)
ob_same, ob_super = coverage_of(qi, qi, False), coverage_of(qi, (5, 25), False)
print("coverage 0-based identical/superset:", zb_same, "/", zb_super)
print("coverage 1-based identical/superset:", ob_same, "/", ob_super)

# --- INVARIANTS: these hold across versions --------------------------------
assert six.height == 3, "a BED6 file must round-trip all three records"
assert six.row(0)[1] == 1 and raw.row(0)[1] == 0, "0-based file start 0 -> 1-based 1"
assert six.row(0)[2] == 5, "end is unchanged by the 0-based -> 1-based shift"
assert merged.height == 2, "intervals 1-5 and 5-8 are bookended and must merge"
assert merged.select("start", "end").rows() == [(1, 8), (22, 29)]
assert hits["count"].to_list() == [1, 1, 1], "each interval meets exactly one target"
assert three.height <= six.height, "BED3 can never yield more records than BED6"
assert zb_same == zb_super == 10, "0-based: identical and superset targets both cover the query"
assert zb_same <= 10 and ob_same <= 11, "coverage can never exceed the query's own length"

# --- OBSERVED 2026-09-05, polars-bio 0.35.1: drift, not failure ------------
print()
print("BED3 rows observed:", three.height, "(expected 0 on 0.33.1 through 0.35.1)")
print("column count      :", len(six.columns), "(expected 4 — score/strand are dropped)")
print("1-based coverage  :", ob_same, "/", ob_super, "(expected 11 / 11 on >=0.35.1 — Pitfall 12)")
```

**Expect** — the invariants above are assertions and must pass. The three values below are
*observed*, dated, and version-stamped; a mismatch is drift to investigate, not a bug. This
block was re-executed on **0.35.1** on 2026-09-05 to confirm the Pitfall 12 fix; the
`verified:` block in the frontmatter still describes the full 0.34.0 sweep, which the rest of
the skill has not been re-run against:

```
BED3 rows : 0    <- Pitfall 10
BED6 rows : 3
schema    : ['chrom', 'start', 'end', 'name']
dtypes    : ['String', 'UInt32', 'UInt32', 'String']
file 0-based start : 0 | default 1-based start : 1
merged    : [(1, 8), (22, 29)]
overlaps  : [1, 1, 1]
coverage 0-based identical/superset: 10 / 10
coverage 1-based identical/superset: 11 / 11

BED3 rows observed: 0 (expected 0 on 0.33.1 through 0.35.1)
column count      : 4 (expected 4 — score/strand are dropped)
1-based coverage  : 11 / 11 (expected 11 / 11 on >=0.35.1 — Pitfall 12)
```

If `BED3 rows` prints `3`, upstream has fixed the record-parsing bug and Pitfall 10 should be
retired. If the schema grows past four columns, the extended-field note in
`references/file_io.md` needs updating with it. If `1-based coverage` prints `10 / 12` you
are on a release older than 0.35.1 and are hitting biodatageeks/polars-bio#450 — upgrade, or
follow the workaround in Pitfall 12. Anything other than `11 / 11` or that known-bad
`10 / 12` is new drift and worth investigating.

## Resources

### references/

Detailed documentation for each major capability:

- **interval_operations.md** - All 8 interval operations with parameters, examples, output schemas, and performance tips. Core reference for genomic range arithmetic.

- **file_io.md** - Supported formats table, per-format column schemas, cloud storage configuration, compression support, and common parameters.

- **sql_processing.md** - Register functions, DataFusion SQL syntax, combining SQL with interval operations, and example queries.

- **pileup_operations.md** - Per-base read depth computation from BAM/CRAM files, parameters, and integration with interval operations.

- **fastqc.md** - Streaming FASTQ quality control — the 12 modules, per-module output schemas, the long-form `tidy` table, the PASS/WARN/FAIL summary, and the SQL entry point.

- **configuration.md** - Global settings (parallelism, coordinate systems, streaming modes), logging, and metadata management.

- **bioframe_migration.md** - Operation mapping table, API differences, performance comparison, migration code examples, and pandas compatibility mode.
