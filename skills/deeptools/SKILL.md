---
name: deeptools
description: Turn aligned ChIP-seq, ATAC-seq, CUT&RUN or MNase reads into normalized bigWig tracks, TSS heatmaps and profiles, sample correlations and enrichment fingerprints with deepTools 4.x — including the 3.x flags that now fail and the 4.0 behaviors that silently change numbers.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [chip-seq, sequencing-reads, genomic-intervals, quality-control, bioinformatics]
datasets: [https://zenodo.org/records/1324070/files/wt_H3K4me3_rep1.bam, https://zenodo.org/records/1324070/files/wt_input_rep1.bam, 'https://api.genome.ucsc.edu/getData/track?genome=mm10;track=ncbiRefSeqCurated;chrom=chrX']
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: deeptools 4.0.0 (Rust core) compared tool by tool with its bundled 3.5.x-equivalent *_old commands / pysam 0.24.1 / pyBigWig 0.3.29 / numpy 2.5.4 / matplotlib 3.11.2 / Python 3.12 / all 12 blocks run in page order in one fresh directory with a fresh venv, and Try it run again alone in a second fresh directory / 4.0-vs-3.5 behavior also checked on nf-core yeast paired-end and single-end test BAMs and deepTools' own paired-end chr2L test BAM
  executed: 12
  unverified: 0
---
# deepTools

deepTools turns sorted, indexed BAM files into coverage tracks and summary plots. It is
the usual middle layer of a ChIP-seq, ATAC-seq, CUT&RUN or MNase-seq analysis: after
alignment, before or beside peak calling. Five tools do most of the work:

| Tool | Input | Output | Use it for |
|---|---|---|---|
| `bamCoverage` | one BAM | bigWig / bedGraph | a normalized coverage track |
| `bamCompare` | two BAMs | bigWig / bedGraph | ChIP over input (log2 ratio, difference) |
| `computeMatrix` | bigWigs + regions | gzipped matrix | signal around TSSs, peaks, gene bodies |
| `plotHeatmap` / `plotProfile` | that matrix | PNG/PDF/SVG + optional tables | the figures |
| `multiBamSummary` + `plotCorrelation` / `plotPCA` | BAMs | `.npz`, plots, tables | do replicates agree |
| `plotFingerprint` | BAMs | plot + QC metrics | did the IP enrich at all |

deepTools is MIT-licensed, installs from PyPI or bioconda, and needs no account, key or
GPU. Version 4.0.0 needs Python 3.12 or newer.

## Version 4 changed the engine — read this before reusing an older command

deepTools 4.0.0 (September 2026) replaced the Python core of `bamCoverage`, `bamCompare`,
`computeMatrix`, `multiBamSummary` and `alignmentSieve` with a Rust implementation. The old
code ships beside it as `bamCoverage_old`, `bamCompare_old`, `computeMatrix_old`,
`multiBamSummary_old` and `alignmentSieve_old`, and upstream says those will be removed.
The plotting tools, `plotFingerprint` and `multiBigwigSummary` were not rewritten.

The comparisons below ran each 4.0 tool against its bundled `_old` twin on the same files
(listed in `verified:`); the `_old` tools keep the 3.5.x computation but share 4.0's argument
parser. Flags that tutorials and pipelines written for 3.5.x still pass:

| 3.x usage | In 4.0.0 |
|---|---|
| `--ignoreDuplicates` | **Error** (also in the `_old` tools). Mark duplicates upstream and pass `--samFlagExclude 1024`. |
| `--exactScaling` | **Error.** Exact counting is now the only mode. |
| `bamCompare --scaleFactorsMethod SES` | **Error.** Only `readCount` and `None` remain. |
| `computeMatrix --smartLabels` / `--quiet` | **Error.** Labels are sample names by default now. |
| `--plotFileFormat plotly` | **Error.** plotly is gone; matplotlib only, with an optional `--ggplot` theme. |
| `multiBamSummary --genomeChunkSize`, `alignmentSieve --genomeChunkLength` | Removed. |

Those fail loudly. These do not, and they change results:

- **`--region` changes the normalization.** With `--region` set, the 4.0 `bamCoverage` and
  `bamCompare` compute CPM/RPKM/BPM/RPGC and `readCount` scale factors from the reads *inside
  that region*, not the whole file. Restricting a run to one 10 kb peak inflated CPM about
  186-fold, and `bamCompare` swapped which sample it scaled down. The `_old` tools used
  whole-file counts. Do not use `--region` to "quickly test" a normalized track; run the whole file (it
  is fast now), or compute the factor yourself and pass `--scaleFactor` (shown below).
- **Chromosome names must match exactly.** The 3.5.x code quietly matched `chrX` in a BED against `X`
  in a BAM or bigWig. 4.0 does not: `computeMatrix` prints a warning per region (to stdout,
  not stderr), writes a matrix with **zero rows and exits 0**, and the next `plotHeatmap` crashes with
  `need at least one array to concatenate`. A blacklist with the wrong naming is skipped with
  a warning and nothing is removed.
- **Blacklisted bins are no longer gaps.** The 3.5.x code left blacklisted intervals out of
  the bigWig (they read as missing). 4.0 filters at base-pair level and writes those bins as
  `0` — or, with `--extendReads`, as non-zero signal from extended fragments that reach into
  them. If a blacklist must mask the output, pass it again to `computeMatrix`.
- **Paired-end extension is not capped the way it was.** With `--extendReads`, 4.0 extends
  properly paired reads to the TLEN the aligner wrote, however long. On a yeast test BAM
  containing "proper" pairs with TLENs up to 89 kb, 4.0 produced 2.5 times the `_old`
  coverage; on deepTools' own paired-end test BAM, 8.7% more. Single-end reads extended to a
  fixed length agreed. With `--maxFragmentLength 1000` (which drops pairs above
  that length) the two versions agreed exactly on the second file and within 0.2% on the
  first. Set it for ChIP/ATAC/CUT&RUN data.
- **Small numeric drift.** The estimated fragment length can differ by a base (187 vs 186 on
  the data below), moving RPGC values about 0.5%. Values are now float32. Bigwigs made with
  3.5.x and 4.0 should not be mixed in one comparison.

`computeMatrix` matrices were identical to the `_old` output when names matched (largest difference
6e-5). `bamCoverage` CPM tracks matched in all but 0.08% of 50 bp bins.

## Install

```bash
python -m pip install "deeptools==4.0.0"
bamCoverage --version
```

Bioconda carries the same release (`conda install -c bioconda deeptools=4.0.0`).
Everything below runs from one empty working directory, in order.

## Inputs, and the checks that save an afternoon

Every BAM must be coordinate-sorted and indexed. Get the example data: an H3K4me3 ChIP and
its input from mouse neural progenitor cells, paired-end 51 bp, aligned to mm10 with
Ensembl-style chromosome names (`X`, not `chrX`), with reads only on chromosome X. They are
from a Galaxy Training Network teaching set on Zenodo (record 1324070, CC-BY-4.0, no
account). The two files are 63 MB and 114 MB.

```bash
for s in wt_H3K4me3_rep1 wt_input_rep1; do
  curl -sSfL -o "$s.bam" "https://zenodo.org/records/1324070/files/$s.bam"
  python -c "import pysam, sys; pysam.index(sys.argv[1])" "$s.bam"
done
ls -l *.bam*
```

`pysam` is installed with deepTools. Two checks belong before any deepTools command: what
the BAM calls its chromosomes and where reads actually are, and what your region file calls
them. Here the regions are RefSeq transcripts from the UCSC API, which names chromosomes
`chrX`; the script writes one BED per naming so the mismatch can be seen.

```python
import json, urllib.request
import pysam

bam = pysam.AlignmentFile("wt_H3K4me3_rep1.bam")
stats = [(s.contig, s.mapped) for s in bam.get_index_statistics() if s.mapped]
print("contigs in header:", len(bam.references), "| contigs with reads:", stats)
mapped = sum(n for _, n in stats)

url = ("https://api.genome.ucsc.edu/getData/track?"
       "genome=mm10;track=ncbiRefSeqCurated;chrom=chrX")
rows = json.load(urllib.request.urlopen(url, timeout=60))["ncbiRefSeqCurated"]

seen, genes = set(), []
for r in sorted(rows, key=lambda r: r["txStart"]):
    if not r["name"].startswith("NM_") or r["name2"] in seen:
        continue                      # one coding transcript per gene
    seen.add(r["name2"])
    genes.append((r["chrom"], r["txStart"], r["txEnd"], r["name2"], 0, r["strand"]))

for fname, rename in [("genes_chrX_ucsc.bed", lambda c: c),
                      ("genes_X.bed", lambda c: c.removeprefix("chr"))]:
    with open(fname, "w") as out:
        for c, s, e, n, sc, st in genes:
            out.write(f"{rename(c)}\t{s}\t{e}\t{n}\t{sc}\t{st}\n")

print("mapped reads:", mapped, "| genes:", len(genes))
print("BAM names:", set(bam.references) & {"X", "chrX"},
      "| UCSC names:", {g[0] for g in genes})
```

The BAM header lists 22 contigs but only `X` has reads. That matters twice: a whole-genome
default spends time on empty chromosomes, and a genome-wide effective genome size is wrong
for this file (see RPGC below).

## `bamCoverage` — one normalized track

```bash
bamCoverage -b wt_H3K4me3_rep1.bam -o k4_raw.bw \
  --binSize 50 --extendReads --samFlagExclude 1024 --maxFragmentLength 1000 -p 4
bamCoverage -b wt_H3K4me3_rep1.bam -o k4_cpm.bw \
  --binSize 50 --extendReads --samFlagExclude 1024 --maxFragmentLength 1000 -p 4 \
  --normalizeUsing CPM
```

Choices that decide what the numbers mean:

- **`--normalizeUsing`**. `CPM` divides each bin by millions of counted reads; `RPKM` also by
  bin length in kb; `BPM` scales so all bins sum to one million (TPM-like, so it depends on
  how much signal sits in peaks); `RPGC` scales to 1x average coverage and needs
  `--effectiveGenomeSize`. Without it the bigWig holds raw counts.
- **A bin counts every read or fragment that overlaps it.** A 187 bp fragment touches about
  five 50 bp bins, so large bins inflate values relative to per-base coverage.
- **`--extendReads`** without a number uses each pair's own fragment for paired-end data
  and an estimated length for unpaired mates. For single-end data give a length
  (`--extendReads 200`). Do not extend spliced RNA-seq reads.
- **`--centerReads`** keeps only the central part of each fragment, which sharpens
  punctate signals such as transcription-factor ChIP. `--MNase` and `--Offset` cover MNase
  nucleosome centers and Ribo-/GRO-seq offsets.
- **Duplicates and MAPQ.** `--ignoreDuplicates` no longer exists; duplicates are excluded
  only if they are *flagged*. These files went through `sambamba markdup` and carry no
  duplicate flags, which suggests duplicates were already removed. `--minMappingQuality 30`
  drops multi-mappers; whatever you filter is also left out of the CPM denominator.
- **`-p`** sets threads (`max` and `max/2` work).

Check the track rather than trusting the file name. A CPM track divided by the raw track
must equal one million over the number of counted reads, in every covered bin:

```python
import numpy as np
import pyBigWig, pysam

mapped = sum(s.mapped for s in pysam.AlignmentFile("wt_H3K4me3_rep1.bam").get_index_statistics())
raw, cpm = pyBigWig.open("k4_raw.bw"), pyBigWig.open("k4_cpm.bw")
L = raw.chroms("X")
r = np.nan_to_num(raw.values("X", 0, L, numpy=True))[::50]
c = np.nan_to_num(cpm.values("X", 0, L, numpy=True))[::50]
ratio = np.median(c[r > 0] / r[r > 0])
print(f"CPM/raw = {ratio:.6f}; 1e6/mapped = {1e6/mapped:.6f}")
print("chromosomes in the bigWig:", len(cpm.chroms()), "| max CPM:", float(c.max()))
print("signal at the Kdm5c promoter:",
      [(s, e, round(v, 1)) for s, e, v in cpm.intervals("X", 152233400, 152233600)])
```

Here they agree. Flag and MAPQ filters lower the denominator: on this file
`--minMappingQuality 30` made it 1,159,048 reads instead of 1,204,821, so compare against the
filtered count when you set one. `--maxFragmentLength` did not change it. The bigWig lists every
chromosome in the BAM header, with zero coverage where there are no reads.

### Never test a normalized track with `--region`

```bash
bamCoverage -b wt_H3K4me3_rep1.bam -o region_cpm.bw --binSize 50 --extendReads \
  --normalizeUsing CPM -r X:152230000:152240000
SF=$(python -c "import pysam; b=pysam.AlignmentFile('wt_H3K4me3_rep1.bam'); print(1e6/sum(s.mapped for s in b.get_index_statistics()))")
bamCoverage -b wt_H3K4me3_rep1.bam -o region_fixed.bw --binSize 50 --extendReads \
  --scaleFactor "$SF" -r X:152230000:152240000
python - <<'EOF'
import pyBigWig
for f in ["k4_cpm.bw", "region_cpm.bw", "region_fixed.bw"]:
    print(f, round(pyBigWig.open(f).stats("X", 152233500, 152233550)[0], 2))
EOF
```

The `--region` CPM is the region's own read count used as the library size. Passing the
whole-file factor as `--scaleFactor` with no `--normalizeUsing` reproduces the full-run value.
This only works without read filters; with them, compute the denominator after the same
filters.

### RPGC and the effective genome size

RPGC's factor is effective genome size / (counted reads × fragment length). Use the
deepTools effective-genome-size table (docs page *Effective Genome Size*), choosing the
read-length row if multi-mappers were filtered and the non-N total otherwise; mm10 at 50 bp
is 2,308,840,607. But that is the size of the genome the *reads* cover. These files contain
chromosome X only, so a genome-wide value scales them to about 14x instead of about 1x:

```bash
for ess in 2308840607 171031299; do
  bamCoverage -b wt_H3K4me3_rep1.bam -o rpgc_$ess.bw --binSize 1 --extendReads \
    --normalizeUsing RPGC --effectiveGenomeSize $ess -p 4 > /dev/null
  python -c "import pyBigWig,sys; print(sys.argv[1], round(pyBigWig.open(sys.argv[2]).stats('X')[0], 3))" $ess rpgc_$ess.bw
done
```

Use `--ignoreForNormalization` (for example `chrX chrM` in a male sample) when some
chromosomes should not set the scale. At bin size 50 the mean RPGC value is about
1 + 50/fragment length, by the bin-overlap rule above.

## `bamCompare` — ChIP over input

```bash
bamCompare -b1 wt_H3K4me3_rep1.bam -b2 wt_input_rep1.bam -o k4_over_input.bw \
  --binSize 50 --extendReads --samFlagExclude 1024 --maxFragmentLength 1000 -p 4 \
  --operation log2 --pseudocount 1
python -c "
import pyBigWig; b = pyBigWig.open('k4_over_input.bw')
print('Kdm5c TSS log2:', round(b.stats('X', 152233400, 152233600, type='max')[0], 2),
      '| chrX mean:', round(b.stats('X')[0], 3))"
```

`readCount` (the default) scales the larger library down to the smaller one;
`--scaleFactorsMethod None --normalizeUsing CPM` normalizes each sample separately instead.
Other operations: `ratio`, `subtract`, `add`, `mean`, `reciprocal_ratio`, `first`,
`second`. The log2 track's chromosome-wide mean is negative because most bins are
background, where the input has more reads than the ChIP after scaling.

## `computeMatrix`, `plotHeatmap`, `plotProfile`

`reference-point` aligns every region on one point (`TSS`, `TES` or `center`) and takes fixed
flanks. `scale-regions` stretches or shrinks each body to `--regionBodyLength` and adds
flanks; use it for gene bodies, not for peaks of similar size.

```bash
computeMatrix reference-point -S k4_cpm.bw k4_over_input.bw -R genes_X.bed \
  --referencePoint TSS -b 2000 -a 2000 --binSize 50 --skipZeros -p 4 -o tss.mat.gz
computeMatrix scale-regions -S k4_cpm.bw -R genes_X.bed \
  -b 1000 -a 1000 --regionBodyLength 3000 --binSize 50 --skipZeros -p 4 -o body.mat.gz
computeMatrix reference-point -S k4_cpm.bw -R genes_chrX_ucsc.bed -b 2000 -a 2000 \
  -o wrong_names.mat.gz > wrong_names.log 2>&1
echo "exit status with chrX names: $?"
echo "rows with matching names: $(zcat < tss.mat.gz | tail -n +2 | wc -l)"
echo "rows with chrX names:     $(zcat < wrong_names.mat.gz | tail -n +2 | wc -l) ($(grep -c '^Warning' wrong_names.log) warnings)"

plotHeatmap -m tss.mat.gz -o tss_heatmap.png --kmeans 2 \
  --outFileSortedRegions tss_clusters.bed
plotProfile -m body.mat.gz -o body_profile.png --outFileNameData body_profile.tab
cut -f13 tss_clusters.bed | sort | uniq -c
```

Points to know:

- The matrix is a gzipped table with one JSON header line starting `@`, then BED6 plus the
  binned values, all samples side by side. `--outFileNameMatrix` writes it uncompressed.
- `--skipZeros` drops regions with no signal in any sample; without it, empty genes dilute
  the profile. `--missingDataAsZero` now drops bins beyond chromosome ends rather than
  filling them.
- `--blackListFileName` on `computeMatrix` is what masks blacklisted bins in the figure (see
  the 4.0 notes).
- `--kmeans` / `--hclust` cluster regions; the clusters are in column 13 of
  `--outFileSortedRegions`. Use its first six columns as BED: the block columns hold
  absolute coordinates, not BED12 offsets.
- `plotProfile --outFileNameData` and `plotHeatmap --outFileNameMatrix` export the numbers
  behind the figures, which is what to report.

Read the matrix in Python when the figure is not the end point:

```python
import gzip, json
import numpy as np

with gzip.open("tss.mat.gz", "rt") as fh:
    header = json.loads(fh.readline()[1:])
    rows = [line.rstrip("\n").split("\t") for line in fh]
vals = np.array([[np.nan if v == "nan" else float(v) for v in r[6:]] for r in rows])
b = header["sample_boundaries"]
cpm = vals[:, b[0]:b[1]]
prof = np.nanmean(cpm, axis=0)
pos = (np.arange(cpm.shape[1]) - cpm.shape[1] // 2) * header["bin size"][0]
print(header["sample_labels"], "| regions:", len(rows), "| bins per sample:", cpm.shape[1])
print("profile peak at", int(pos[prof.argmax()]), "bp from TSS; peak/edge =",
      round(prof.max() / np.mean([prof[0], prof[-1]]), 1))
```

## Replicate agreement and enrichment QC

```bash
multiBamSummary bins -b wt_H3K4me3_rep1.bam wt_input_rep1.bam -l H3K4me3 input \
  --binSize 10000 --extendReads -p 4 -o bins.npz --outRawCounts bins.tsv
plotCorrelation -in bins.npz --corMethod spearman --skipZeros --whatToPlot heatmap \
  -o correlation.png --outFileCorMatrix correlation.tsv
cat correlation.tsv
plotFingerprint -b wt_H3K4me3_rep1.bam wt_input_rep1.bam -l H3K4me3 input \
  --extendReads -r X -p 4 -o fingerprint.png \
  --outQualityMetrics fingerprint_qc.tsv --JSDsample wt_input_rep1.bam
cut -f1,2,8,10 fingerprint_qc.tsv
```

- Use Spearman and `--skipZeros` for ChIP. Pearson on raw counts is dominated by a few
  peaks, and the zero bins of every empty chromosome make any pair look correlated.
- `--outRawCounts` rows are sorted differently than in 3.5.x (`1, 10, 11, …` rather than
  starting at `Y`), and counts are integers. Sort by coordinate before comparing tables.
- `plotPCA -in bins.npz` takes the same input; it was reimplemented in 4.0 with corrected
  `--transpose`, `--log2`, `--rowCenter` and `--ntop` handling, so PCA plots can differ from
  3.5.x.
- `plotFingerprint` samples the genome, so its metrics move slightly between runs (on this
  data "% genome enriched" read 2.08 and 2.09); `-r X` keeps it on the chromosome with reads.
  A good IP bows far from the diagonal; input stays near it. The JS distance against the
  input and the "% genome enriched" columns are the numbers to report.
- For a mark like H3K27me3 or H3K9me3 (broad domains) expect a weaker fingerprint than for
  H3K4me3; that is biology, not failure.

## Try it

**Data.** The H3K4me3 ChIP-seq BAM from the Galaxy Training Network set on Zenodo (record
1324070, CC-BY-4.0, 63 MB, no account) — mouse neural progenitor cells, paired-end, mm10
with `X`-style names, chromosome X only — and mm10 RefSeq Curated transcripts on chrX from
the UCSC Genome Browser API (free, no key). Both reachable on 2026-11-06.

**Run.** From an empty directory with deepTools 4.0.0 installed. It routes through the two
silent 4.0 traps: chromosome naming, and normalization under `--region`.

```bash
set -euo pipefail
curl -sSfL -o k4.bam "https://zenodo.org/records/1324070/files/wt_H3K4me3_rep1.bam"
python - <<'EOF'
import json, urllib.request, pysam
pysam.index("k4.bam")
url = "https://api.genome.ucsc.edu/getData/track?genome=mm10;track=ncbiRefSeqCurated;chrom=chrX"
rows = json.load(urllib.request.urlopen(url, timeout=60))["ncbiRefSeqCurated"]
seen = set()
with open("tss_ucsc.bed", "w") as a, open("tss_X.bed", "w") as b:
    for r in sorted(rows, key=lambda r: r["txStart"]):
        if r["name"].startswith("NM_") and r["name2"] not in seen:
            seen.add(r["name2"])
            rest = f'{r["txStart"]}\t{r["txEnd"]}\t{r["name2"]}\t0\t{r["strand"]}\n'
            a.write(f'{r["chrom"]}\t{rest}')
            b.write(f'{r["chrom"].removeprefix("chr")}\t{rest}')
print("genes:", len(seen))
EOF
bamCoverage -b k4.bam -o raw.bw -bs 50 -e -p 4
bamCoverage -b k4.bam -o cpm.bw -bs 50 -e -p 4 --normalizeUsing CPM
bamCoverage -b k4.bam -o cpm_region.bw -bs 50 -e --normalizeUsing CPM -r X:152230000:152240000
computeMatrix reference-point -S cpm.bw -R tss_X.bed -b 2000 -a 2000 -bs 50 \
  --skipZeros -p 4 -o tss.mat.gz
computeMatrix reference-point -S cpm.bw -R tss_ucsc.bed -b 2000 -a 2000 -bs 50 \
  --skipZeros -o tss_ucsc.mat.gz > ucsc_names.log 2>&1
plotProfile -m tss.mat.gz -o tss_profile.png --outFileNameData tss_profile.tab
python - <<'EOF'
import gzip, json
import numpy as np, pyBigWig, pysam

mapped = sum(s.mapped for s in pysam.AlignmentFile("k4.bam").get_index_statistics())
raw, cpm, reg = (pyBigWig.open(f) for f in ["raw.bw", "cpm.bw", "cpm_region.bw"])
L = cpm.chroms("X")
r = np.nan_to_num(raw.values("X", 0, L, numpy=True))[::50]
c = np.nan_to_num(cpm.values("X", 0, L, numpy=True))[::50]
ratio = float(np.median(c[r > 0] / r[r > 0]))
assert abs(ratio / (1e6 / mapped) - 1) < 1e-4, (ratio, 1e6 / mapped)

def rows(path):
    with gzip.open(path, "rt") as fh:
        head = json.loads(fh.readline()[1:])
        return head, [l.rstrip("\n").split("\t") for l in fh]

head, good = rows("tss.mat.gz")
_, bad = rows("tss_ucsc.mat.gz")
assert len(bad) == 0 and len(good) > 500, (len(bad), len(good))
m = np.array([[np.nan if v == "nan" else float(v) for v in x[6:]] for x in good])
prof = np.nanmean(m, axis=0)
pos = (np.arange(m.shape[1]) - m.shape[1] // 2) * 50
assert abs(pos[prof.argmax()]) <= 1000, pos[prof.argmax()]
assert prof.max() > 3 * np.mean([prof[0], prof[-1]])

full = cpm.stats("X", 152233500, 152233550)[0]
inreg = reg.stats("X", 152233500, 152233550)[0]
print(f"mapped reads {mapped} | CPM/raw {ratio:.6f} = 1e6/mapped {1e6/mapped:.6f}")
print(f"TSS rows: X-named {len(good)}, chr-named {len(bad)}")
print(f"profile peak {int(pos[prof.argmax()])} bp from TSS, peak/edge {prof.max()/np.mean([prof[0], prof[-1]]):.1f}")
print(f"Kdm5c promoter CPM: whole file {full:.1f}, with --region {inreg:.1f} ({inreg/full:.0f}x)")
EOF
```

**Expect.**

Invariants — if one fails, the skill is wrong:

- CPM divided by raw counts equals 1e6 / mapped reads in every covered bin (no read filters
  are set, so every mapped read is counted).
- The `X`-named BED gives a matrix with hundreds of rows; the `chrX`-named BED gives **zero
  rows** and computeMatrix still exits 0. This is the 4.x behavior; if the chr-named matrix
  ever has rows, upstream restored name aliasing and the 4.0 note above needs revisiting.
- The mean H3K4me3 profile peaks within 1 kb of the TSS and is several-fold above the
  ±2 kb edges — H3K4me3 marks active promoters.

Observed on 2026-11-06 with deepTools 4.0.0 — drift to investigate, not failure:

- 1,204,821 mapped reads; 902 chrX genes from the UCSC call (one `NM_` transcript per gene);
  819 rows survive `--skipZeros` with `X` names, 0 with `chrX` names.
- Mean profile peaks 200 bp downstream of the TSS at 31.2 times the edge signal.
- Kdm5c promoter bin (X:152,233,500–152,233,550): CPM 1613.5 from the whole file, 299,907.4
  with `--region` — **186x**, which is the file's read count over the 6,482 reads inside the
  10 kb region. If this ratio becomes 1, the 4.0 `--region` normalization was fixed upstream;
  revise the warning above.
