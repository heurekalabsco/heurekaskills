# FASTQ Quality Control (FastQC)

## Overview

`pb.fastqc()` computes FastQC's 12 core modules over a FASTQ file in a **single streaming
pass**, returning Polars tables instead of an HTML report. Input may be plain, `.gz`, or BGZF.
Results are bit-exact against FastQC 0.12.1 run with `--nogroup`. Ten of the twelve modules are
also independent of how the work was split across cores, so a file run on 4 cores and the same
file run on 32 give identical numbers. The two exceptions are described under
[sampled modules](#sampled-modules) below.

Because the output is a table rather than a report, quality control composes with the rest of a
pipeline: thresholds become filters, and many files become one concatenated frame.

## pb.fastqc()

```python
import polars_bio as pb

qc = pb.fastqc("reads.fastq.gz")
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | str | required | Path to a FASTQ file (plain, `.gz`, or `.bgz`) |
| `modules` | list[str] | `None` | Modules to compute (`None` = all 12) |
| `group` | bool | `True` | Reserved for FastQC-style position binning of long reads — currently a no-op (see below) |

Returns a `FastQCResult`. Each module is exposed as a **LazyFrame** attribute — call
`.collect()` on the ones needed. `qc.computed` is the set of modules actually computed.

### Selecting modules

Computing only what is needed is meaningfully cheaper on large files:

```python
qc = pb.fastqc("reads.fastq.gz", modules=["basic_stats", "adapter_content"])
qc.basic_stats.collect()
```

Touching a module that was not requested raises `KeyError` naming the module and how to get it,
rather than returning an empty frame:

```python
qc = pb.fastqc("reads.fastq.gz", modules=["basic_stats"])
qc.per_base_quality.collect()
# KeyError: module 'per_base_quality' was not computed (requested: ['basic_stats']);
#           call fastqc(..., modules=[..., 'per_base_quality'])
```

## Module summary

`qc.summary()` is a **method** (the modules themselves are attributes) returning one row per
module with FastQC's PASS / WARN / FAIL verdict:

```python
qc.summary().collect()
```

```
┌──────────────────┬────────┐
│ module           ┆ status │
╞══════════════════╪════════╡
│ basic_stats      ┆ PASS   │
│ per_base_quality ┆ PASS   │
│ per_seq_gc       ┆ WARN   │
│ …                ┆ …      │
└──────────────────┴────────┘
```

This is the table to gate a pipeline on — for example, stopping when any module fails:

```python
import polars as pl

failed = qc.summary().filter(pl.col("status") == "FAIL").collect()
if failed.height:
    raise RuntimeError(f"FastQC failures: {failed['module'].to_list()}")
```

## The 12 modules and their schemas

| Module | Columns |
|--------|---------|
| `basic_stats` | `metric`, `value` — `n_seq`, `total_bases`, `min_len`, `max_len`, `gc_pct` |
| `per_base_quality` | `position`, `mean`, `median`, `q1`, `q3`, `p10`, `p90` |
| `per_seq_quality` | `quality`, `count` |
| `per_base_content` | `position`, `G`, `A`, `T`, `C` |
| `per_seq_gc` | `gc_pct`, `count` |
| `per_base_n` | `position`, `n_pct` |
| `seq_length` | `length`, `count` |
| `overrepresented` | `sequence`, `count`, `pct`, `possible_source` |
| `adapter_content` | `position`, `adapter`, `pct` |
| `dup_levels` | `dup_level`, `pct` |
| `per_tile_quality` | `tile`, `position`, `deviation` |
| `kmer_content` | `kmer`, `count`, `obs_exp_max`, `max_position`, `pvalue` |

`position` is `Int32` and is 1-based, matching FastQC's own reports.

## The tidy table

`qc.tidy` is a LazyFrame holding every module's output in one long-form table — useful for
persisting a run, or for comparing many samples without joining twelve frames:

| Column | Type | Description |
|--------|------|-------------|
| `module` | String | Module name |
| `label` | String | Series label within the module (e.g. the adapter name), else null |
| `position` | Int32 | Base position, for positional modules, else null |
| `metric` | String | Metric name |
| `value` | Float64 | Numeric value, else null |
| `value_str` | String | String value — carries the PASS/WARN/FAIL `status` rows |

```python
import polars as pl

tidy = qc.tidy.collect()

# Mean quality by position, from the tidy table
tidy.filter(
    (pl.col("module") == "per_base_quality") & (pl.col("metric") == "mean")
).select("position", "value")
```

## SQL entry point

`fastqc` is also a SQL table function, so a file can be checked without registering it:

```python
qc_rows = pb.sql("SELECT * FROM fastqc('reads.fastq.gz')").collect()
```

The table carries the `tidy` schema. Column projection is **not** pushed into the table function
— `SELECT module, metric` still returns all six columns — so project afterwards in Polars.

## Comparing several files

```python
import polars as pl
import polars_bio as pb

samples = ["s1.fastq.gz", "s2.fastq.gz", "s3.fastq.gz"]

stats = pl.concat([
    pb.fastqc(path, modules=["basic_stats"]).basic_stats.collect()
      .with_columns(sample=pl.lit(path))
    for path in samples
])

# One row per sample, one column per metric
stats.pivot(on="metric", index="sample", values="value")
```

## Sampled modules

Four modules inherit sampling behaviour from FastQC itself rather than reading every record, so
their numbers are estimates by design — matching FastQC, not diverging from it:

| Module | Behaviour |
|--------|-----------|
| `per_tile_quality` | Samples 10% of reads after the first 10,000 |
| `kmer_content` | Samples 2% of reads, and the selection depends on file order |
| `dup_levels`, `overrepresented` | Stop accumulating after 100,000 unique observations, which is FastQC's own cutoff and a good estimate on a high-diversity library |

The consequence to remember is that `per_tile_quality` and `kmer_content` are the two modules
that are not exact over all reads, and `kmer_content` is the one whose output can shift with
partitioning, because which reads it samples depends on the order they are seen. Force a single
partition when exact FastQC parity on k-mers matters. The remaining ten modules are exact on
every read and unaffected by partitioning.

```python
import polars_bio as pb

pb.set_option("datafusion.execution.target_partitions", 1)
qc = pb.fastqc("reads.fastq.gz", modules=["kmer_content"])
```

## Notes and pitfalls

1. **Modules are attributes, `summary()` is a method.** `qc.basic_stats` is a LazyFrame;
   `qc.summary()` is called. Mixing the two up gives either a bound-method repr or a
   `TypeError`.

2. **Everything is lazy.** Module attributes and `tidy` are LazyFrames — nothing is
   materialised until `.collect()`.

3. **`per_tile_quality` needs Illumina-style read IDs.** Tile numbers are parsed out of the read
   name (`@INSTR:1:FLOWCELL:1:1101:1000:2000`). On FASTQ files whose headers carry no tile
   coordinates — including most public archive downloads that have been renamed — the module
   computes but returns zero rows. That is not a failure.

4. **Empty modules are meaningful.** `overrepresented` and `kmer_content` legitimately return
   zero rows on a clean library; an empty frame means "nothing flagged", not "not computed".
   Check `qc.computed` to distinguish the two.

5. **`group` does nothing yet.** It is reserved for FastQC's position binning of long reads
   (`group=False` == FastQC `--nogroup`), but is a no-op for the current modules, and passing
   `group=False` emits a `UserWarning` saying so. Positional output is always per-position,
   which is why the bit-exact comparison is against FastQC run with `--nogroup`. Leave it at the
   default and treat the results as ungrouped.
