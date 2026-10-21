---
name: mutscan
description: Process deep mutational scanning and other MAVE sequencing with the mutscan R package — FASTQ to per-variant counts with an audited filter cascade, then edgeR or limma enrichment scored against wild type, plus QC plots.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [deep-mutational-scanning, variant-effect, fastq, statistics, r]
datasets: ["https://raw.githubusercontent.com/fmicompbio/mutscan/6aa85729d6ab31b4227c979a742e96f6d33dae62/inst/extdata/transInput_1.fastq.gz", "https://raw.githubusercontent.com/fmicompbio/mutscan/6aa85729d6ab31b4227c979a742e96f6d33dae62/inst/extdata/transInput_2.fastq.gz", "https://raw.githubusercontent.com/fmicompbio/mutscan/6aa85729d6ab31b4227c979a742e96f6d33dae62/inst/extdata/transOutput_1.fastq.gz", "https://raw.githubusercontent.com/fmicompbio/mutscan/6aa85729d6ab31b4227c979a742e96f6d33dae62/inst/extdata/transOutput_2.fastq.gz", "https://raw.githubusercontent.com/fmicompbio/mutscan/6aa85729d6ab31b4227c979a742e96f6d33dae62/inst/extdata/GSE102901_cis_se.rds"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: mutscan 1.2.0 / edgeR 4.10.7 / limma 3.68.5 / R 4.5.3 (conda) and R 4.6.1 with Bioconductor 3.23
  executed: 10
  unverified: 0
---
# mutscan

## Overview

mutscan is a Bioconductor package that takes a multiplexed assay of variant effect (MAVE) —
a deep mutational scan, a protein–protein interaction screen, any library of variants
sequenced before and after selection — from raw FASTQ to a statistical answer. It is
described in Soneson, Bendel, Diss and Stadler, *mutscan — a flexible R package for
efficient end-to-end analysis of multiplexed assays of variant effect data*, Genome Biology
24:132 (2023), doi:10.1186/s13059-023-02967-0.

The pipeline has three stages, and each hands a well-defined object to the next:

| stage | function | gives you |
|---|---|---|
| read processing | `digestFastqs()` | per-sample list: variant table, filter log, error statistics |
| assembly | `summarizeExperiment()` | a `SummarizedExperiment`, variants × samples |
| scoring | `calculateRelativeFC()` / `calculateFitnessScore()` | per-variant logFC and p-values, or fitness ratios |

Reach for it when you have the reads and want counts **and** a defensible model in one
place. The read layout is described with a small grammar rather than a fixed library
format, so the same function handles single variable regions, paired reads that overlap
and must be merged, paired reads covering two different proteins, UMIs, and
primer-anchored designs. Scoring is a wrapper over edgeR and limma, so the statistics are
the ones those packages are known for.

How it sits next to neighbours. The registry's `enrich2` skill scores counts you already
have with Enrich2's weighted regression across time points; it is the better fit for a
selection sampled at three or more time points. mutscan is built around an input-versus-
output comparison with replicates, and it also does the counting. DiMSum is another
FASTQ-to-fitness pipeline for the same experiments, with its own error model; it is a
separate tool and is not covered here. If the variants were screened one per well rather
than pooled — a plate-format directed evolution round — the `levseq` skill covers turning
that plate's reads into a per-well variant table.

## What a reader needs before starting

- **Licence: MIT**, copyright the Friedrich Miescher Institute for Biomedical Research.
  No account, key, GPU or container. CPU only; `digestFastqs()` takes `nThreads`.
- **GitHub reports the repository's licence as `NOASSERTION`. That is a detector
  artefact, not a missing licence.** R packages declare `License: MIT + file LICENSE` in
  `DESCRIPTION`, and the `LICENSE` file that convention requires holds only two lines,
  `YEAR` and `COPYRIGHT HOLDER`. GitHub's detector reads that stub, cannot match it, and
  gives up; the full MIT text sits next to it in `LICENSE.md`. Read the files rather than
  trusting an automated licence field — in this domain it errs in both directions.
- **R version decides which mutscan you get.** The current Bioconductor release (3.23)
  ships mutscan 1.2.0 and needs **R 4.6**. On R 4.5, `BiocManager` resolves to
  Bioconductor 3.22 and installs mutscan 1.0.0. On R 4.4 or older there is no mutscan at
  all: it entered Bioconductor in 3.22, and no earlier Bioconductor repository carries
  it. The two releases differ in one place that matters here: 1.2.0 adapted
  `calculateRelativeFC()` to newer edgeR and limma.
- **A C++ toolchain** whenever the package builds from source (Rcpp). Bioconductor ships
  macOS and Windows binaries for R installed from CRAN; a conda-provided R always builds
  from source.

### Install — R 4.6 from CRAN

```r
if (!requireNamespace("BiocManager", quietly = TRUE)) install.packages("BiocManager")
BiocManager::install("mutscan")
packageVersion("mutscan")   # 1.2.0 on Bioconductor 3.23
```

### Install — isolated conda environment

As of 2026-10-20 conda-forge and bioconda build R packages for R 4.5 but not yet for 4.6,
so this route pairs R 4.5 with bioconda's Bioconductor builds and installs mutscan 1.2.0
itself from the head of the upstream `RELEASE_3_23` branch, pinned by commit. It runs as an ordinary user, needs no root, and keeps everything in
`./mutscan-env`.

```bash
conda create -y -p ./mutscan-env -c conda-forge -c bioconda --override-channels \
  r-base=4.5 compilers make r-biocmanager r-rcpp r-dplyr r-tidyr r-tibble r-rlang \
  r-ggplot2 r-ggally r-ggrepel r-dt r-rmarkdown r-xfun \
  bioconductor-summarizedexperiment bioconductor-edger bioconductor-limma \
  bioconductor-iranges bioconductor-delayedarray

# csaw is compiled from source on every platform; the whole block took 9-10 minutes
# on osx-arm64 (measured), most of it compiling. mutscan 1.2.0 is pinned to the
# RELEASE_3_23 branch head of the upstream repository.
# Call the environment's own Rscript by path: if the environment is missing, a bare
# `Rscript` would quietly fall through to whatever R is on PATH and install there.
conda run -p ./mutscan-env ./mutscan-env/bin/Rscript -e '
  BiocManager::install("csaw", update = FALSE, ask = FALSE)
  install.packages("https://github.com/fmicompbio/mutscan/archive/6aa85729d6ab31b4227c979a742e96f6d33dae62.tar.gz",
                   repos = NULL, type = "source")
  stopifnot(packageVersion("mutscan") == "1.2.0")
  cat("mutscan", format(packageVersion("mutscan")), "on", R.version.string, "\n")'
```

Run every later block with that environment's R, the same way:
`conda run -p ./mutscan-env ./mutscan-env/bin/Rscript script.R`.

## Describing the reads

`digestFastqs()` is told what each read contains through two arguments per direction: a
string of element codes and a vector of their lengths, read left to right.

| code | element | what happens to it |
|---|---|---|
| `S` | skip | discarded |
| `U` | UMI | used to count unique molecules |
| `C` | constant | compared with `constant*` to estimate the sequencing error rate |
| `V` | variable | the region whose variants are counted |
| `P` | primer | located by sequence anywhere in the read; anchors what follows |

A length of `-1` means "whatever is left". A read built as one skipped base, a 10-nt UMI,
an 18-nt constant stretch and a 96-nt variable region is `"SUCV"` with `c(1, 10, 18, 96)`.
Repeat a code to describe two separated stretches of the same kind; mutscan joins them.

Three choices shape what a "variant" means downstream:

- **Wild type given, named.** Each read is aligned to the closest supplied sequence and
  named by its mutated codons, for instance `FOS.0.WT_JUN.13.CCC` — FOS unmutated, codon 13
  of JUN changed to CCC. Pass a **named** vector; an unnamed one yields the stand-in
  prefixes `f` and `r`.
- **Wild type omitted for a direction.** That direction is not aligned or mutation-filtered
  at all: its variable sequence becomes part of the name verbatim. This is the right mode
  for a random barcode and the wrong one for a mutated gene.
- **`mergeForwardReverse = TRUE`.** For two reads covering the same amplicon. Set
  `revComplReverse = TRUE` too, so the reverse read is in the forward orientation before
  the overlap is searched; supply a single wild type through `wildTypeForward`.

The mutation limits apply **per read direction**. With the default
`nbrMutatedCodonsMaxForward = 1` and `nbrMutatedCodonsMaxReverse = 1`, a pair carrying one
mutation in each protein survives as a double mutant. Raise or lower each side
deliberately.

## Counting: `digestFastqs()`

The example files below ship inside the package. They are 1,000-read subsamples of the
FOS–JUN interaction screen of Diss and Lehner, eLife 2018 (GEO GSE102901): the forward read
covers mutated FOS, the reverse read mutated JUN.

```r
suppressPackageStartupMessages({ library(mutscan); library(SummarizedExperiment) })
ext <- system.file("extdata", package = "mutscan")

FOS <- "ACTGATACACTCCAAGCGGAGACAGACCAACTAGAAGATGAGAAGTCTGCTTTGCAGACCGAGATTGCCAACCTGCTGAAGGAGAAGGAAAAACTA"
JUN <- "ATCGCCCGGCTGGAGGAAAAAGTGAAAACCTTGAAAGCTCAGAACTCGGAGCTGGCGTCCACGGCCAACATGCTCAGGGAACAGGTGGCACAGCTT"

digest_trans <- function(sample) digestFastqs(
  fastqForward  = file.path(ext, paste0(sample, "_1.fastq.gz")),
  fastqReverse  = file.path(ext, paste0(sample, "_2.fastq.gz")),
  adapterForward = "GGAAGAGCACACGTC", adapterReverse = "GGAAGAGCGTCGTGT",
  elementsForward = "SUCV", elementLengthsForward = c(1, 10, 18, 96),
  elementsReverse = "SUCV", elementLengthsReverse = c(1, 8, 20, 96),
  constantForward = "AACCGGAGGAGGGAGCTG", constantReverse = "GAAAAAGGAAGCTGGAGAGA",
  wildTypeForward = c(FOS = FOS), wildTypeReverse = c(JUN = JUN),
  forbiddenMutatedCodonsForward = "NNW", forbiddenMutatedCodonsReverse = "NNW",
  nThreads = 1)

inp <- digest_trans("transInput")
out <- digest_trans("transOutput")
names(inp)
head(inp$summaryTable[, c("mutantName", "nbrReads", "nbrUmis", "mutantNameAAHGVS")], 3)
```

`forbiddenMutatedCodons` takes IUPAC codes. `"NNW"` drops any read whose mutated codon
ends in A or T, which is right for an NNS library like this one (third base G or C), where
such codons can only be errors. It is **wrong for an NNK library** (third base G or T): it
throws away every legitimate T-ending codon. The NNK filter is `"NNM"`. Applying `"NNM"` to
these NNS reads makes the point — it charges 249 of 1,000 reads to the forbidden-codon
filter instead of 8. Pass `""` when the library was not built from degenerate codons.

Each result is a list of four: `parameters` (every argument, plus version and timing),
`summaryTable` (one row per distinct variant, with read and UMI counts, codon, amino-acid
and HGVS names, and a `mutationTypes` column), `filterSummary`, and `errorStatistics`
(matches and mismatches in the constant region by base quality).

### Read the filter log before anything else

Filters run in a fixed order and each read is charged to the **first** one it fails. So
the filter columns plus `nbrRetained` always add back to `nbrTotal`, and a single
dominant column tells you what went wrong.

```r
fs <- inp$filterSummary
steps <- grep("^f[0-9]", names(fs), value = TRUE)
stopifnot(sum(fs[steps]) + fs$nbrRetained == fs$nbrTotal)
t(fs[, c("nbrTotal", steps[fs[steps] > 0], "nbrRetained")])
```

The failure worth knowing is the quiet one. **If the element lengths do not add up to the
read length, `digestFastqs()` does not raise an error** — every read lands in
`f3_nbrReadWrongLength`, `nbrRetained` is 0, and the run "succeeds". Check that column on
every new design. A mismatched number of codes and lengths, by contrast, does stop
immediately.

The adapter filter matters more than it looks. With the adapters omitted, the reads that
carried them are not dropped at step 1; they reach the mutation filters, look heavily
mutated, and are discarded there instead — so the retained count barely moves while the
log now blames the wrong step.

Leave a large job's chunking alone unless memory says otherwise (`chunkSize`, default
100,000 reads), and pass several FASTQ files as a vector to `fastqForward` /
`fastqReverse` — in the same order — to treat a sample split across lanes as one.

## Assembling samples: `summarizeExperiment()`

```r
se <- summarizeExperiment(
  x = list(input = inp, output = out),
  coldata = data.frame(Name = c("input", "output"),
                       Condition = c("input", "output")),
  countType = "umis")
dim(se)
colSums(assay(se, "counts"))
```

Two rules are enforced with a clear error, and one thing happens without being asked:

- `x` must be a **named** list, and its names must match `coldata$Name`.
- `countType = "umis"` is the default. If the read layout had no `U` element, ask for
  `"reads"`; mutscan refuses to count UMIs it never saw.
- The filter log of every sample is copied into `colData`, so the QC plots below can draw
  it.

Two collapsing helpers then reduce the rows:

- `collapseMutantsByAA(se)` merges codons that encode the same protein. **Synonymous
  variants fold into the wild-type row** — 37 codon rows, wild type included, become the
  single `f.0.WT` row of the bundled CIS object — which is usually what you want for protein
  scoring and never what you want for a codon-level question. Total counts are preserved.
- `collapseMutantsBySimilarity()` merges sequences within a Hamming distance
  (`collapseMaxDist`) — the tool
  for error-prone barcodes, not for named mutants.

## Scoring against wild type: `calculateRelativeFC()`

This fits each variant with edgeR's quasi-likelihood GLM (`method = "edgeR"`, the default)
or limma-voom (`method = "limma"`) and reports a logFC for the coefficient you name. It
needs **replicates** — at least two samples per condition — because the dispersion is
estimated from them.

The bundled object below is the full CIS experiment from the same study, already digested:
three replicates of input and output, with optical densities recorded per sample.

```r
cis <- readRDS(system.file("extdata", "GSE102901_cis_se.rds", package = "mutscan"))
aa  <- collapseMutantsByAA(cis)

# Replicate is stored as an integer; as a number it would fit a linear trend in
# replicate ID instead of one offset per replicate.
aa$Replicate <- factor(aa$Replicate)
design <- model.matrix(~ Replicate + Condition, data = colData(aa))
colnames(design)

fc <- calculateRelativeFC(aa, design = design, coef = "Conditioncis_output",
                          WTrows = "f.0.WT", method = "edgeR")
fc["f.0.WT", c("logFC", "PValue")]
head(fc[order(fc$PValue), c("logFC", "logCPM", "PValue", "FDR")])
```

**`WTrows` is what makes the score relative to wild type, and leaving it out changes the
question silently.** With `WTrows` set, normalisation defaults to `normMethod = "sum"`,
scaling every library by its wild-type count, and the wild-type row comes out at logFC 0 —
every other logFC is enrichment relative to wild type. Without it, normalisation falls back
to TMM over all variants, and the wild-type row itself acquires a logFC (1.74 on this
dataset). Nothing warns you. Decide which reference you mean and set `WTrows` accordingly;
the value must be a row name exactly as the collapsed object spells it, and an unknown name
is refused with the list of valid ones.

The edgeR table carries `logFC`, `logCPM`, `F`, `PValue`, `FDR`, `logFC_shrunk`,
`df.total`, `df.prior` and `df.test`; the limma table carries `logFC`, `CI.L`, `CI.R`,
`AveExpr`, `t`, `P.Value`, `adj.P.Val`, `B`, `se.logFC`, `df.total` and `df.prior`
(mutscan 1.2.0 with edgeR 4.10.7 and limma 3.68.5). Different column names for the same
quantity — select by name, not position.

### Fitness scores

`calculateFitnessScore()` implements the score of the original study, one column per
replicate. Counts are turned into frequencies and multiplied by each culture's optical
density (the product of the `ODCols`); each variant's log2 output/input ratio of those
values is then divided by the same log2 ratio for wild type.

```r
fit <- calculateFitnessScore(aa, pairingCol = "Replicate", ODCols = c("OD1", "OD2"),
                             comparison = c("Condition", "cis_output", "cis_input"),
                             WTrows = "f.0.WT")
fit["f.0.WT", ]   # exactly 1 by construction
```

Use it to reproduce a published fitness scale; prefer `calculateRelativeFC()` when you
need a test, an FDR or more than two conditions.

## Plots and the QC report

Every plotting function returns a `ggplot` object (`plotPairs()` a `GGally` matrix), so
save them with `ggsave()`.

```r
library(ggplot2)
ggsave("filtering.pdf", plotFiltering(cis, valueType = "fractions",
                                      plotType = "filtered", facetBy = "step"),
       width = 8, height = 10)
ggsave("volcano.pdf", plotVolcano(fc), width = 6, height = 5)
ggsave("meandiff.pdf", plotMeanDiff(fc), width = 6, height = 5)
generateQCReport(cis, outFile = file.path(getwd(), "qc_report.html"))
```

`generateQCReport()` renders an HTML report through rmarkdown and needs pandoc on `PATH`;
the conda route above provides it. Give `outFile` an absolute path.

## Try it

A cold, end-to-end check: real reads in, counts and a wild-type-relative score out.

**Data** — four FASTQ files and one processed object, fetched from the upstream
repository pinned to the Bioconductor 3.23 commit (`6aa8572`), so the bytes cannot move
under the test. The FASTQs are 1,000-read paired subsamples of the TRANS experiment in
Diss and Lehner, eLife 2018 (GEO GSE102901); the `.rds` is that study's full CIS
experiment, digested by mutscan's authors. All are distributed in the package under its
MIT licence, need no account, and total about 260 KB (sizes measured 2026-10-20). They are
byte-identical to the copies installed with mutscan 1.2.0. Install mutscan first, by
either route above.

**Run** — saved as `try_mutscan.R` and run with `Rscript try_mutscan.R` on the R 4.6
route, or `conda run -p ./mutscan-env ./mutscan-env/bin/Rscript try_mutscan.R` on the conda
route, from the directory that holds `./mutscan-env`. It routes through
the three traps: the filter log must account for every read, the replicate must be a
factor, and the score is only wild-type-relative when `WTrows` is given.

```r
suppressPackageStartupMessages({ library(mutscan); library(SummarizedExperiment) })
stopifnot(packageVersion("mutscan") >= "1.2.0")

base <- "https://raw.githubusercontent.com/fmicompbio/mutscan/6aa85729d6ab31b4227c979a742e96f6d33dae62/inst/extdata"
dir.create(dd <- file.path(tempdir(), "mutscan-try"), showWarnings = FALSE)
files <- c(paste0(rep(c("transInput", "transOutput"), each = 2), c("_1", "_2"), ".fastq.gz"),
           "GSE102901_cis_se.rds")
for (f in files) download.file(file.path(base, f), file.path(dd, f), mode = "wb", quiet = TRUE)

FOS <- "ACTGATACACTCCAAGCGGAGACAGACCAACTAGAAGATGAGAAGTCTGCTTTGCAGACCGAGATTGCCAACCTGCTGAAGGAGAAGGAAAAACTA"
JUN <- "ATCGCCCGGCTGGAGGAAAAAGTGAAAACCTTGAAAGCTCAGAACTCGGAGCTGGCGTCCACGGCCAACATGCTCAGGGAACAGGTGGCACAGCTT"
dig <- function(s) digestFastqs(
  file.path(dd, paste0(s, "_1.fastq.gz")), file.path(dd, paste0(s, "_2.fastq.gz")),
  adapterForward = "GGAAGAGCACACGTC", adapterReverse = "GGAAGAGCGTCGTGT",
  elementsForward = "SUCV", elementLengthsForward = c(1, 10, 18, 96),
  elementsReverse = "SUCV", elementLengthsReverse = c(1, 8, 20, 96),
  constantForward = "AACCGGAGGAGGGAGCTG", constantReverse = "GAAAAAGGAAGCTGGAGAGA",
  wildTypeForward = c(FOS = FOS), wildTypeReverse = c(JUN = JUN),
  forbiddenMutatedCodonsForward = "NNW", forbiddenMutatedCodonsReverse = "NNW")
res <- list(input = dig("transInput"), output = dig("transOutput"))

# Invariant 1: every read is charged to exactly one filter or retained.
for (r in res) {
  fs <- r$filterSummary; steps <- grep("^f[0-9]", names(fs), value = TRUE)
  stopifnot(sum(fs[steps]) + fs$nbrRetained == fs$nbrTotal,
            sum(r$summaryTable$nbrReads) == fs$nbrRetained,
            fs$f3_nbrReadWrongLength == 0)
  cat("total", fs$nbrTotal, "retained", fs$nbrRetained,
      "adapter", fs$f1_nbrAdapter, "too many codons", fs$f10a_nbrTooManyMutCodons, "\n")
}

se <- summarizeExperiment(res, data.frame(Name = names(res), Condition = names(res)),
                          countType = "reads")
# Invariant 2: read counts in the assembled matrix equal the retained reads.
stopifnot(all(colSums(assay(se, "counts")) ==
              sapply(res, function(r) r$filterSummary$nbrRetained)))
cat("variants x samples:", dim(se), "\n")

cis <- readRDS(file.path(dd, "GSE102901_cis_se.rds"))
aa <- collapseMutantsByAA(cis)
# Invariant 3: collapsing to amino acids preserves every count.
stopifnot(sum(assay(aa, "counts")) == sum(assay(cis, "counts")))
aa$Replicate <- factor(aa$Replicate)
design <- model.matrix(~ Replicate + Condition, data = colData(aa))

fc <- calculateRelativeFC(aa, design, coef = "Conditioncis_output", WTrows = "f.0.WT")
tmm <- calculateRelativeFC(aa, design, coef = "Conditioncis_output")
fit <- calculateFitnessScore(aa, pairingCol = "Replicate", ODCols = c("OD1", "OD2"),
                             comparison = c("Condition", "cis_output", "cis_input"),
                             WTrows = "f.0.WT")
# Invariant 4: with WTrows, wild type is the zero point; fitness puts it at exactly 1.
stopifnot(abs(fc["f.0.WT", "logFC"]) < 1e-8, all(fit["f.0.WT", ] == 1))

cat("rows codon -> aa:", nrow(cis), "->", nrow(aa), "\n")
cat("WT logFC with WTrows:", signif(fc["f.0.WT", "logFC"], 3),
    "| without:", round(tmm["f.0.WT", "logFC"], 3), "\n")
cat("FDR < 0.05:", sum(fc$FDR < 0.05), "of", nrow(fc), "\n")
top <- head(fc[order(fc$PValue), ], 5)
print(data.frame(logFC = round(top$logFC, 2), FDR = signif(top$FDR, 2),
                 row.names = rownames(top)))
```

**Expect**

*Invariants* — a failure means this skill is wrong:

- Every sample's filter columns plus `nbrRetained` equal `nbrTotal`, the variant table's
  read counts sum to `nbrRetained`, and no read fails the length check.
- With `countType = "reads"` the assembled matrix's column sums equal the retained reads.
- `collapseMutantsByAA()` preserves the total count.
- With `WTrows = "f.0.WT"` the wild-type logFC is zero to within 1e-8, and every
  replicate's fitness score for wild type is exactly 1.

*Observed, mutscan 1.2.0 / edgeR 4.10.7 / limma 3.68.5 / R 4.5.3, 2026-10-21 (unchanged from
edgeR 4.10.6 on 2026-10-20), and identical on
R 4.6.1 apart from the floating-point residue on the wild-type line* — drift to investigate,
not a bug:

```
total 1000 retained 279 adapter 314 too many codons 392
total 1000 retained 285 adapter 366 too many codons 338
variants x samples: 560 2
rows codon -> aa: 1007 -> 640
WT logFC with WTrows: 8.73e-16 | without: 1.74
FDR < 0.05: 568 of 640
       logFC     FDR
f.27.* -4.50 1.1e-22
f.7.G  -4.18 1.1e-22
f.28.* -4.39 1.1e-22
f.28.G -3.94 1.1e-22
f.7.*  -4.46 1.1e-22
```

The top of the list is the sanity check a biologist reads first. Three of the five
strongest depletions are premature stop codons (`*`), which should abolish the
interaction, and the other two are glycine substitutions, a classic helix breaker in a
coiled coil. The non-zero wild-type logFC on the "without" side is the `WTrows` trap in
number form.

## Troubleshooting

Each message below was reproduced against mutscan 1.2.0.

```r
suppressPackageStartupMessages({ library(mutscan); library(SummarizedExperiment) })
ext <- system.file("extdata", package = "mutscan")
r1 <- file.path(ext, "transInput_1.fastq.gz"); r2 <- file.path(ext, "transInput_2.fastq.gz")
show_error <- function(expr) tryCatch({ expr; "no error" },
                                      error = function(e) conditionMessage(e))

# Element lengths that do not sum to the read length: no error, every read discarded.
quiet <- digestFastqs(r1, r2, elementsForward = "SUCV", elementLengthsForward = c(1, 10, 18, 90),
                      elementsReverse = "SUCV", elementLengthsReverse = c(1, 8, 20, 96))
quiet$filterSummary[, c("nbrTotal", "f3_nbrReadWrongLength", "nbrRetained")]

# No UMI in the layout, but UMIs requested.
noumi <- digestFastqs(r1, r2, elementsForward = "SCV", elementLengthsForward = c(11, 18, 96),
                      elementsReverse = "SCV", elementLengthsReverse = c(9, 20, 96))
show_error(summarizeExperiment(list(a = noumi), data.frame(Name = "a")))

# One sample per condition: nothing to estimate a dispersion from.
cis <- collapseMutantsByAA(readRDS(file.path(ext, "GSE102901_cis_se.rds")))
one <- cis[, cis$Replicate == 1]
show_error(calculateRelativeFC(one, model.matrix(~ Condition, colData(one)),
                               coef = "Conditioncis_output", WTrows = "f.0.WT"))
```

- `'countType' is set to 'umis', but no UMI sequences were provided when quantifying.` —
  the layout has no `U`; pass `countType = "reads"`.
- `'x' must be a named list` / `names in 'x' do not match 'coldata$Name'` — name the list
  passed to `summarizeExperiment()` and use the same names in `coldata$Name`.
- `NA dispersions not allowed` (edgeR) or `No residual degrees of freedom in linear model
  fits` (limma) — no replicates; the model has nothing to estimate variance from.
- `One or more named coef arguments do not match a column of the design matrix.` — print
  `colnames(design)`; the coefficient is the column name, such as `Conditioncis_output`,
  not the level.
- `All values in 'WTrows' must be one of: ...` — after `collapseMutantsByAA()` the
  wild-type row keeps its pre-collapse name (`f.0.WT` here, `FOS.0.WT_JUN.0.WT` for a
  named two-protein design). Use `grep("WT", rownames(se), value = TRUE)` to find it.
- `'elementsForward' and 'elementsLengthsForward' must have the same length` — one length
  per code. (The message spells the argument `elementsLengths`; the argument is
  `elementLengthsForward`.)
- `nbrRetained` near zero with `f3_nbrReadWrongLength` near `nbrTotal` — the element
  lengths do not cover the read; count them against an actual read.
- `C17 standard requested but CC17 is not defined` while compiling `locfit` (an edgeR
  dependency) — seen with a conda-forge R 4.6 that builds everything from source. That R's
  `Makeconf` leaves `CC17` empty; point `R_MAKEVARS_USER` at a file that sets
  `CC17 = <the CC from R CMD config CC> -std=gnu17`. On macOS and Windows, CRAN's R 4.6 normally
  installs binaries and skips that compile.
