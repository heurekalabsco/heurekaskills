---
name: dimsum
description: Score deep mutational scanning experiments with DiMSum — paired FASTQ or variant counts to fitness with per-variant error from a fitted error model. Covers the conda pins it now needs, the design file, and its whitespace-delimited outputs.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [deep-mutational-scanning, variant-effect, fastq, selection, dimsum]
covers: [deep mutational scanning, DMS, MAVE, multiplexed assay of variant effect, saturation mutagenesis, variant fitness, error model, enrichment score, selection experiment, yeast growth selection, protein mutagenesis, single mutants, double mutants, epistasis, paired-end reads, cutadapt, VSEARCH, starcode, FastQC, MaveDB, TDP-43, R, bioconda]
papers: [PMID:32799905, PMID:31519910]
datasets: ["https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR871/006/SRR8713496/SRR8713496_1.fastq.gz", "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR871/006/SRR8713496/SRR8713496_2.fastq.gz", "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR871/000/SRR8713500/SRR8713500_1.fastq.gz", "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR871/000/SRR8713500/SRR8713500_2.fastq.gz", "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR871/007/SRR8713497/SRR8713497_1.fastq.gz", "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR871/007/SRR8713497/SRR8713497_2.fastq.gz", "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR871/002/SRR8713502/SRR8713502_1.fastq.gz", "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR871/002/SRR8713502/SRR8713502_2.fastq.gz"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: DiMSum 1.4 (bioconda r-dimsum 1.4 r44hdfd78af_4, upstream commit a441cdf) with R 4.4.3, ggplot2 3.5.2, GGally 2.2.1, ggstats 0.9.0, data.table 1.18.6.1, cutadapt 5.2, VSEARCH 2.32.0, starcode 1.4, FastQC 0.11.9, openjdk 25.0.2 on macOS arm64, CPU only, 4 cores. The environment's pandoc 2.19.2 is an x86_64 binary that needs Rosetta 2. The re-run was on a Mac without Rosetta, so it reproduced that failure, then ran every block with a native pandoc 3.12.1 in its place. The documented pandoc 2.19.2 under Rosetta was not executed; pandoc affects only the version banner and report.html, not any computed value. Same environment solved, not executed, on linux-64 and osx-64. Reads from ENA runs SRR8713496, SRR8713497, SRR8713500 and SRR8713502 (SRA study SRP188188), probed 2026-10-21.
  executed: 7
  unverified: 0
---
# DiMSum

## Overview

DiMSum turns a deep mutational scanning (DMS) experiment into one number per variant,
with an error bar that means something. It reads paired-end FASTQ from the library
before and after selection, or a table of variant counts you already have, and writes a
fitness score and a standard error for every single, double and synonymous variant. It
comes from the Lehner lab and is described in Faure, Schmiedel, Baeza-Centurion and
Lehner, *Genome Biology* 21:207 (2020), doi:10.1186/s13059-020-02091-3.

The part worth reaching for is the **error model**. A log ratio of output to input counts
has Poisson noise that shrinks as counts grow, but real DMS replicates scatter more than
that — bottlenecks during transformation or selection inflate the counting noise, and
some replicates disagree by a roughly constant amount whatever the depth. DiMSum fits
both effects per replicate, from the data, and then propagates them into every variant's
error. So a variant seen ten times is not reported with the confidence of one seen ten
thousand times, and a replicate that went through a bottleneck is weighted down when
replicates are merged.

When to choose it over the neighbours:

- **`enrich2`** (in this registry) scores time-course selections by regression across three
  or more time points. DiMSum is built around the one-input, one-output design, with
  biological replicates of the whole experiment, and spends its effort on how noisy each
  replicate actually was.
- **mutscan** is an R/Bioconductor package that goes from FASTQ (including UMI and barcoded
  designs) to counts and then tests enrichment with the edgeR and limma count models. It
  makes different assumptions; if your design looks like an RNA-seq comparison with many
  conditions, it may be the better fit.
- The Bloom lab's current DMS pipeline (`dms-vep-pipeline-3`) and its escape-modelling
  companion `polyclonal` are licensed for educational, academic research and not-for-profit
  use only, with for-profit users told to contact Fred Hutch. The older `dms_tools2` has not
  been pushed since October 2022. DiMSum is MIT-licensed and installable from bioconda.

Do not use it for designs with no selection step (a single sequencing of a library is a
library-QC question, not a fitness one), or to score individual clones. A plate screen that
sequences one clone per well is the `levseq` skill.

## What a reader needs before starting

- **Nothing to obtain, except Rosetta 2 on Apple Silicon.** DiMSum is MIT-licensed. Its
  external tools (cutadapt, VSEARCH, starcode, FastQC) are open source and come with the
  bioconda package. No account, key, GPU or container.
- **On an Apple Silicon Mac, Rosetta 2 must be installed.** The `r-dimsum` build used here
  requires pandoc older than 3, and the pandoc that conda resolves for it on osx-arm64
  (2.19.2, build `hce30654_2`) is an x86_64 binary. Without Rosetta, every DiMSum run stops
  before stage 1 with `Bad CPU type in executable` (see Troubleshooting). Check in `bash`
  with

      if [ "$(uname -m)" = arm64 ]; then
        arch -x86_64 /usr/bin/true && echo "Rosetta 2 present"
      else
        echo "Not Apple Silicon; Rosetta 2 not needed"
      fi

  The `uname -m` guard is there because an Intel Mac runs x86_64 code natively and would
  otherwise report Rosetta as present. On Apple Silicon without Rosetta, the `arch` call
  fails with the same `Bad CPU type` message. Install it with
  `softwareupdate --install-rosetta --agree-to-license`, which needs an administrator
  account. Do not try to get around this by asking conda for `pandoc>=3`: the solver then
  falls back to an older `r-dimsum` build. Intel Macs and Linux do not need Rosetta.
- **conda (or mamba) with the bioconda and conda-forge channels**, and about 2 GB of disk for
  the environment, measured with `du` on macOS arm64.
- **A bash shell.** The blocks below use bash syntax (`${run: -1}`, `read -r`). Save each
  one to a file and run it with `bash`, not `zsh` or `sh`. The counts and `## Try it` blocks
  end with `exit 1` when DiMSum fails, so pasting them into an interactive terminal would
  close it on a failure.
- Runtime is short. The `## Try it` run, 4 × 100,000 read pairs through all stages, took
  about 75 seconds on 4 CPU cores. The download before it is what varies: 3 to 4 minutes on
  2026-10-20, about 22 minutes on 2026-10-21.

## Install

A plain `conda create ... r-dimsum` no longer produces a working install on every platform,
and the failure only appears halfway through a run. DiMSum 1.4 checks whether a plot object
is a gridded figure by reading `names(plot_object)`. ggplot2 4.0 and GGally 2.4 moved their
plot objects to S7 classes, where that call returns `NULL`, so the error-model stage dies with

    Error in if (names(plot_object)[1] == "grobs") { : argument is of length zero

after it has spent minutes trimming and aligning. On Apple Silicon the unpinned solve picks
exactly those versions. On linux-64 it currently picks an older R 4.0 stack that predates
them, which is why the problem is easy to miss. The pins below hold the plotting stack at
versions that work. With them, linux-64, osx-64 and osx-arm64 all solve to the same R 4.4.3
environment (ggplot2 3.5.2, GGally 2.2.1, ggstats 0.9.0). That environment was built and run
on osx-arm64 only. On linux-64 and osx-64 it was solved, not executed.

```bash
conda create -y -n dimsum -c conda-forge -c bioconda --strict-channel-priority \
  r-dimsum=1.4 "r-ggplot2<4" "r-ggally<2.3" "r-ggstats<0.10"
```

`r-ggstats` is pinned because recent releases require ggplot2 4.0 at load time. Without
that pin the ggplot2 pin alone gets you `namespace 'ggplot2' 3.5.2 is already loaded, but
>= 4.0.0 is required` instead.

The pins are a workaround, not a permanent part of the install. The failing test is
`names(plot_object)[1] == "grobs"` in DiMSum's `R/dimsum__save_png.R`. Once a DiMSum release
after 1.4 no longer makes that test, drop all three pins together, then solve without them and
re-run `## Try it` to confirm.

Upstream's own command (`r-base=4.0 fastqc=0.11 r-dimsum`) cannot be solved on osx-arm64,
because no R 4.0 build exists there. Upstream's route on a Mac is different: its installation
guide uses the x86_64 Miniforge installer, and the maintainer recommends an `osx-64`
environment in upstream issue #24. In conda that means creating the environment for the
x86_64 target platform, with `CONDA_SUBDIR=osx-64` set for `conda create`. That also runs
under Rosetta 2. Unpinned, it currently solves to R 4.0.5 with ggplot2 3.3.6, which avoids the
plotting crash. It was solved here but not executed. The same issue reports a stage-4
`object 'dimsum_meta_new_report' not found` failure under R 4.4.3 in container builds, which
the runs behind this page, on the R 4.4.3 environment above, did not reproduce.

Then activate it. **Each block below starts with these three lines**, because two things
go wrong without the third:

```bash
eval "$(conda shell.bash hook)"
conda activate dimsum
# Put the environment first, and put its Java on PATH for FastQC.
export PATH="$CONDA_PREFIX/bin:$CONDA_PREFIX/lib/jvm/bin:$PATH"

command -v Rscript java cutadapt vsearch starcode fastqc pandoc
pandoc --version | head -1
DiMSum --help | grep -c -- '--'
Rscript -e 'cat("DiMSum", format(packageVersion("DiMSum")), "| ggplot2", format(packageVersion("ggplot2")), "| GGally", format(packageVersion("GGally")), "\n")'
```

Every path printed should sit inside the environment, `pandoc --version` should print a
2.x version, and the last line should report `DiMSum 1.4 | ggplot2 3.5.2 | GGally 2.2.1`. If
the pandoc line prints `Bad CPU type in executable` instead (zsh spells it
`bad CPU type in executable`), the Mac is missing Rosetta 2
(see above). `DiMSum --help` still works in that state, so it is not a sufficient check on its
own.

- **The `DiMSum` command is an R script that finds R through `PATH`** (`#!/usr/bin/env
  Rscript`). When `conda activate` is run from a shell where conda's base is already
  active, it can put the environment's `bin` back where base's was. That position may be
  *behind* a system R in `/usr/local/bin`, and the system R does not have DiMSum installed.
  The symptom is `Error: Required R packages not installed. Please install the following
  packages: DiMSum`. That message does not mean the install failed.
- **FastQC needs `java` on `PATH`**, and on macOS the current conda-forge `openjdk` build
  puts it in `$CONDA_PREFIX/lib/jvm/bin`, not `$CONDA_PREFIX/bin`. The Linux layout was not
  checked, and the extra `PATH` entry does no harm if that directory does not exist. Without
  Java a FASTQ run stops at stage 1 with `object 'dimsum_meta_new_report' not found`, after
  a line saying `Unable to locate a Java Runtime` (macOS) that is easy to miss in the log. A
  counts-only run does not call FastQC and is unaffected.

## How a run is described

A run needs three things: a wild-type sequence, an **experimental design file**, and the
reads or counts.

**The wild-type sequence** (`--wildtypeSequence`) is the nucleotide sequence of the
mutated region only, after the constant regions are trimmed off. Lower-case letters mark
internal constant stretches that DiMSum cuts out before calling variants. If the sequence
translates without a premature stop, DiMSum treats the target as coding and also reports
amino-acid level fitness. Override that with `--sequenceType`.

**The design file** is tab-separated with one row per sequenced sample:

| column | meaning |
|---|---|
| `sample_name` | letters and digits only; in counts mode it must equal the count-table column name |
| `experiment_replicate` | 1, 2, … — one per independent input library (a biological replicate of the whole experiment) |
| `selection_id` | `0` before selection, `1` after |
| `selection_replicate` | output samples only (1, 2, …); **blank** for inputs |
| `technical_replicate` | blank unless one sample was sequenced in several files |
| `pair1`, `pair2` | FASTQ file names, FASTQ mode only |

Optional columns add `generations` (to scale fitness per generation), and `cell_density`
plus `selection_time` (to turn fitness into growth rates). Several outputs from the same
input (selection replicates) are **summed**, not modelled. The error model works across
`experiment_replicate`s, so replicate at that level if you want it to learn anything.

**Constant regions.** `--cutadapt5First` and `--cutadapt5Second` are the 5' constant
sequences on read 1 and read 2. By default each read's 3' constant region is taken to be
the reverse complement of the other read's 5' one, which holds for a standard overlapping
amplicon. Set `--cutadapt3First` and `--cutadapt3Second` when it does not.

**File names.** `--fastqFileExtension` is the stem only (default `.fastq`), and
`--gzipped T` (the default) appends `.gz`. Passing `.fastq.gz` is rejected outright, see
Troubleshooting.

**Library filters** run in stage 4 and decide which reads count as variants.
`--maxSubstitutions` (default 2) caps amino-acid substitutions for coding targets and
nucleotide ones otherwise. `--indels` defaults to `none`. `--permittedSequences` takes
IUPAC codes, one per mutated position, for libraries that only allow certain bases, and
`--mutagenesisType codon` tells DiMSum the library was built codon by codon (NNK and
similar). Everything filtered out is written to `*_indel_variant_data_merge.tsv` and
`*_rejected_variant_data_merge.tsv`, which is the first place to look when counts are lower
than you expected.

**Count thresholds** (`--fitnessMinInputCountAll`, `--fitnessMinInputCountAny` and the
output equivalents) default to 0. With real data, look at the input count histograms in
the report first, then set a threshold below which variants are mostly sequencing errors.
The defaults keep everything, and the error model will give those variants large errors
rather than dropping them.

## What it computes

For each experiment replicate *r*, a variant's raw fitness is the natural log of its
output/input count ratio minus the same quantity for wild type, so wild type is 0 by
construction. When `--fitnessNormalise T` (the default), each replicate is then shifted and
scaled to agree with the others, and everything is re-centred so the wild-type mean is 0.

Each replicate's error is

    sigma_r^2 = scale_r * (m_in,r / n_in + m_out,r / n_out) + a_r

where `n_in` and `n_out` are the variant's counts, `m_in,r` and `m_out,r` are multiplicative
terms (fitted with a lower bound of 1, so 1 means plain Poisson noise and anything above it
means a bottleneck inflated the noise), and `a_r` is an additive replicate error (lower bound
1e-4). The fit runs on 100 bootstrap resamples of the variants, spread over `--numCores`
worker processes. Those workers get fixed random streams (`parallel::clusterSetRNGStream` with
seed 1234567), but which resamples each worker draws depends on how many workers there are.
So a rerun on the same input reproduces the fit exactly only at the same `--numCores`. A
different core count gives slightly different parameters. The `set.seed(1603)` in DiMSum's
source seeds only the replicate-normalisation fit, not the bootstrap. Replicates are merged
by inverse-variance weighting.
The `## Try it` block recomputes all three steps from DiMSum's own outputs.

The fitted parameters are in `<project>/tmp/errormodel.txt`, and the normalisation in
`<project>/tmp/normalisationmodel.txt`. Read `errormodel.txt` before you trust the scores.
A multiplicative term well above 1 points at a bottleneck in that replicate, and a large
additive term means the replicates disagree beyond what counting explains.

## Running it

From FASTQ, all five stages (QC, trim, align, count, then fitness):

    DiMSum --fastqFileDir <dir> --experimentDesignPath <design.txt> \
      --wildtypeSequence <ACGT...> --cutadapt5First <seq> --cutadapt5Second <seq> \
      --projectName <name> --numCores <n>

From a count table, stages 4 and 5 only, with `--countPath` in place of the FASTQ
arguments. The count table is tab-separated, with an `nt_seq` column (the variant
sequence; case is ignored except for the lower-case constant regions) and one integer
column per `sample_name` in the design file. The package ships such a table, which makes
a fast check that the statistics half works on your machine:

```bash
eval "$(conda shell.bash hook)"
conda activate dimsum
export PATH="$CONDA_PREFIX/bin:$CONDA_PREFIX/lib/jvm/bin:$PATH"

# The toy count table that ships inside the R package: nt_seq plus one column per sample.
TOY=$(Rscript -e 'cat(system.file("demo", "countFile_Toy.txt", package = "DiMSum"))')
cp "$TOY" counts.tsv
head -1 counts.tsv

# Same design layout as for FASTQ, minus pair1/pair2. sample_name must match the count columns.
printf 'sample_name\texperiment_replicate\tselection_id\tselection_replicate\ttechnical_replicate\n' > design_counts.txt
for e in 1 2 3 4; do
  printf 'input%s\t%s\t0\t\t\n' "$e" "$e" >> design_counts.txt
  printf 'output%sA\t%s\t1\t1\t\n' "$e" "$e" >> design_counts.txt
done

DiMSum --countPath counts.tsv --experimentDesignPath design_counts.txt \
  --wildtypeSequence GGTAATAGCAGAGGGGGTGGAGCTGGTTTGGGAAACAATCAAGGTAGTAATATGGGTGGTGGGATGAACTTTGGTGCGTTCAGCATTAATCCAGCCATGATGGCTGCCGCCCAGGCAGCACTACAG \
  --projectName toy --numCores 4 > toy.log 2>&1 || { tail -20 toy.log; exit 1; }
tail -n +2 toy/fitness_singles.txt | wc -l
cat toy/tmp/errormodel.txt
```

On 2026-10-20 this printed 399 single-mutant rows and four replicates' worth of parameters
(for example `input 2 1.1595…` and `reperror 3 0.02522…`) in about a minute. Those parameter
values are for `--numCores 4`. With `--numCores 2` the same table gave `input 2 1.1332…` and
`reperror 3 0.02466…`, because the bootstrap draws split differently across workers.
Upstream's documented shortcut for this demo, `DiMSum --runDemo T`, does not work from the
command line (see Troubleshooting).

Restarting is supported but costs disk. `--retainIntermediateFiles T` keeps the trimmed and
aligned reads, which can run to many gigabytes for a full dataset. With them kept,
`--startStage 4` re-runs only the statistics after you change a filter or threshold.

## Reading the output

Everything lands in `<outputPath>/<projectName>/`:

| file | contents |
|---|---|
| `fitness_singles.txt` | one row per single substitution (amino acid for coding targets): `Pos`, `WT_AA`, `Mut`, `mean_count`, `fitness`, `sigma` |
| `fitness_doubles.txt` | double mutants, with both singles' fitness alongside (`fitness1`, `fitness2`) for epistasis work |
| `fitness_synonymous.txt`, `fitness_wildtype.txt` | per-replicate counts, `fitnessN_uncorr`, `sigmaN_uncorr`, then merged `fitness`, `sigma` |
| `fitness_singles_MaveDB.csv` | `hgvs_pro`, `score`, `se`, ready for a MaveDB upload |
| `<project>_fitness_replicates.RData` | `all_variants`, `wildtype`, `synonymous`, `singles`, `doubles` data.tables |
| `<project>_variant_data_merge.tsv` | the count table after filtering, one column per sample |
| `report.html` | the diagnostic report, including error-model fit and replicate scatter plots |

Three things catch people:

- **The `fitness_*.txt` files are space-delimited**, despite their extension and despite
  the `.tsv` files beside them being tab-delimited. `data.table::fread` detects this. A
  reader hard-coded to tabs gets one column.
- **`Pos` counts from 1 at the first codon of `--wildtypeSequence`**, not from the start of
  the protein. Add the offset yourself. In the `## Try it` data the library starts at TDP-43
  residue 290, so the offset is 289.
- **`fitness_singles.txt` only has merged values.** The per-replicate estimates for
  amino-acid variants are in the `.RData` file.

What "fitness" means depends on the assay. In a growth selection where the mutated protein
is toxic, as in the `## Try it` data, higher fitness means less toxic, not more active.

```r
library(data.table)

si <- fread("tdp43/fitness_singles.txt")          # whitespace-delimited
si[, residue := Pos + 289L]                       # this library starts at TDP-43 G290

# Keep estimates whose error bar is small relative to the spread of effects.
confident <- si[sigma < 0.25]
cat(nrow(confident), "of", nrow(si), "singles have sigma < 0.25\n")

# Position x amino-acid matrix, the usual heatmap input.
mat <- dcast(si, residue + WT_AA ~ Mut, value.var = "fitness")
print(dim(mat))
print(mat[1:3, 1:8])

# Per-replicate values live in the RData objects, not in the text files.
e <- new.env()
print(load("tdp43/tdp43_fitness_replicates.RData", envir = e))
print(grep("^(fitness|sigma)[0-9]", names(e$all_variants), value = TRUE))
```

Run from the directory the `## Try it` block used, this printed `135 of 282 singles have
sigma < 0.25`, a 42 × 23 matrix starting at residue 290 (`G`), and
`fitness1_uncorr fitness2_uncorr sigma1_uncorr sigma2_uncorr`.

## Try it

A real FASTQ-to-fitness run on public data, checked against DiMSum's own error model.

**Data.** Bolognesi et al., *The mutational landscape of a prion-like domain*, Nature
Communications 10:4162 (2019), doi:10.1038/s41467-019-12101-z. It is a DMS of TDP-43
residues 290–331 under a yeast toxicity selection, and its reads are in SRA study SRP188188
(GEO GSE128165). We use two experiment replicates, input and output each: runs SRR8713496
and SRR8713500 (replicate 5A), and SRR8713497 and SRR8713502 (replicate 6A). These are the
samples, wild-type sequence and constant regions DiMSum's own demo uses. INSDC data are open,
with no account, and ENA serves them over HTTPS. All eight URLs were reachable on 2026-10-20
and 2026-10-21.

Only the first 100,000 read pairs of each file are streamed. The full runs are 0.6–1.5 GB
per file, and the gzipped subsets on disk total about 39 MB. The download took 3 to 4
minutes on 2026-10-20 and about 22 minutes on 2026-10-21, so ENA's throughput, not DiMSum,
sets the wall time.

**Install**, plus Rosetta 2 first on Apple Silicon (see "What a reader needs"):

```bash
# Skip this if the dimsum environment from Install exists: with -y, conda create
# deletes an existing environment of the same name and builds it again.
conda create -y -n dimsum -c conda-forge -c bioconda --strict-channel-priority \
  r-dimsum=1.4 "r-ggplot2<4" "r-ggally<2.3" "r-ggstats<0.10"
```

**Run.** Save it to a file and run it with `bash` in an empty directory. It fetches the
reads, writes the design file, runs every stage, then recomputes the error model, the
wild-type normalisation and the replicate merge from the files DiMSum wrote. It is routed
through two traps: the extension stays at its default `.fastq` even though the files are
gzipped, and the `fitness_*.txt` files are read as whitespace-delimited.

```bash
eval "$(conda shell.bash hook)"
conda activate dimsum
export PATH="$CONDA_PREFIX/bin:$CONDA_PREFIX/lib/jvm/bin:$PATH"

# Data: the first 100,000 read pairs of four runs from SRA study SRP188188.
N=100000
ENA=https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR871
mkdir -p fastq
while read -r run name; do
  for r in 1 2; do
    curl -s "$ENA/00${run: -1}/$run/${run}_$r.fastq.gz" | gzip -dc 2>/dev/null \
      | head -n $((4 * N)) | gzip > "fastq/${name}_read$r.fastq.gz"
    got=$(( $(gzip -dc "fastq/${name}_read$r.fastq.gz" | wc -l) / 4 ))
    [ "$got" -eq "$N" ] || { echo "only $got reads for $run read $r"; exit 1; }
  done
done <<'RUNS'
SRR8713496 bTDP1-IN-5A
SRR8713500 bTDP1-OU-5A
SRR8713497 bTDP1-IN-6A
SRR8713502 bTDP1-OU-6A
RUNS

# Two experiments, each one input and one output. Tab-separated; blank cells stay blank.
{
  printf 'sample_name\texperiment_replicate\tselection_id\tselection_replicate\ttechnical_replicate\tpair1\tpair2\n'
  printf 'input1\t1\t0\t\t\tbTDP1-IN-5A_read1.fastq.gz\tbTDP1-IN-5A_read2.fastq.gz\n'
  printf 'output1\t1\t1\t1\t\tbTDP1-OU-5A_read1.fastq.gz\tbTDP1-OU-5A_read2.fastq.gz\n'
  printf 'input2\t2\t0\t\t\tbTDP1-IN-6A_read1.fastq.gz\tbTDP1-IN-6A_read2.fastq.gz\n'
  printf 'output2\t2\t1\t1\t\tbTDP1-OU-6A_read1.fastq.gz\tbTDP1-OU-6A_read2.fastq.gz\n'
} > design.txt

# FASTQ -> fitness. The extension stays at its default (.fastq); gzip is implied.
DiMSum --fastqFileDir fastq --experimentDesignPath design.txt \
  --wildtypeSequence GGTAATAGCAGAGGGGGTGGAGCTGGTTTGGGAAACAATCAAGGTAGTAATATGGGTGGTGGGATGAACTTTGGTGCGTTCAGCATTAATCCAGCCATGATGGCTGCCGCCCAGGCAGCACTACAG \
  --cutadapt5First TGGCTTTGGGAATCAGGGTGGATTT \
  --cutadapt5Second ACATGCCCATCATACCCCAACTGCT \
  --projectName tdp43 --numCores 4 > dimsum.log 2>&1 \
  || { tail -20 dimsum.log; exit 1; }

# Check the outputs against the error model DiMSum says it fitted.
Rscript - <<'RSCRIPT'
library(data.table)
p  <- "tdp43"
em <- fread(file.path(p, "tmp/errormodel.txt"))
nm <- fread(file.path(p, "tmp/normalisationmodel.txt"))
wt <- fread(file.path(p, "fitness_wildtype.txt"))   # space-delimited, not TSV
si <- fread(file.path(p, "fitness_singles.txt"))
mv <- fread(file.path(p, "fitness_singles_MaveDB.csv"))
counts <- fread(file.path(p, "tdp43_variant_data_merge.tsv"))
reps <- 1:2
par <- function(k, r) em[parameter == k & rep == r, mean_value]

# 1. Per-replicate error: sigma^2 = scale * (m_in/n_in + m_out/n_out) + a
sig <- sapply(reps, function(r) sqrt(nm[[paste0("scale_", r)]] *
  (par("input", r) / wt[[paste0("count_e", r, "_s0")]] +
   par("output", r) / wt[[paste0("count_e", r, "_s1")]]) + par("reperror", r)))
d1 <- max(abs(sig - unlist(wt[, paste0("sigma", reps, "_uncorr"), with = FALSE])))

# 2. Wild type sits at zero by construction; normalisation moves each replicate by
#    (0 + shift) * scale, then everything is re-centred on the mean.
raw <- sapply(reps, function(r) nm[[paste0("shift_", r)]] * nm[[paste0("scale_", r)]])
d2 <- max(abs((raw - mean(raw)) - unlist(wt[, paste0("fitness", reps, "_uncorr"), with = FALSE])))

# 3. Replicates merge by inverse-variance weighting.
f <- unlist(wt[, paste0("fitness", reps, "_uncorr"), with = FALSE])
s <- unlist(wt[, paste0("sigma", reps, "_uncorr"), with = FALSE])
d3 <- max(abs(c(sum(f / s^2) / sum(1 / s^2), sqrt(1 / sum(1 / s^2))) - c(wt$fitness, wt$sigma)))

cat(sprintf("sigma recompute %.1e | wt fitness recompute %.1e | merge recompute %.1e\n", d1, d2, d3))
stopifnot(d1 < 1e-4, d2 < 1e-4, d3 < 1e-12)
stopifnot(all(em[parameter %in% c("input", "output"), mean_value] >= 1))
stopifnot(all(si$Nham_aa == 1), nrow(mv) == nrow(si), all(startsWith(mv$hgvs_pro, "p.")))
stopifnot(all(colSums(counts[, grep("_count$", names(counts)), with = FALSE]) <= 100000))

print(em[, .(parameter, rep, mean_value = signif(mean_value, 4))])
cat("WT counts (in1 in2 out1 out2):", unlist(wt[, .(count_e1_s0, count_e2_s0, count_e1_s1, count_e2_s1)]), "\n")
cat("singles:", nrow(si), "| synonymous:", nrow(fread(file.path(p, "fitness_synonymous.txt"))),
    "| doubles:", nrow(fread(file.path(p, "fitness_doubles.txt"))), "\n")
cat("counted substitution reads per sample:",
    colSums(counts[, grep("_count$", names(counts)), with = FALSE]), "\n")
print(si[order(fitness)][c(1:3, (.N - 2):.N), .(Pos, WT_AA, Mut, fitness = round(fitness, 3), sigma = round(sigma, 3))])
RSCRIPT
```

**Expect.**

*Invariants* (if one fails, this skill is wrong):

- Each replicate's wild-type `sigma` recomputes from `errormodel.txt` and
  `normalisationmodel.txt` with the formula above, and so does each replicate's normalised
  wild-type fitness. The tolerance is 1e-4, not machine precision, because
  `normalisationmodel.txt` stores `scale` and `shift` rounded to four decimals.
- The merged wild-type `fitness` and `sigma` equal the inverse-variance combination of the
  replicate columns to within 1e-12.
- Every multiplicative term in `errormodel.txt` is at least 1.
- Every row of `fitness_singles.txt` is a single amino-acid substitution, and the MaveDB
  file has one `p.`-prefixed HGVS row per single.
- No sample's counted reads exceed the 100,000 read pairs fed in.

*Observed, DiMSum 1.4 with `--numCores 4` on 2026-10-20* (a change here means drift to
investigate, not a bug; values move with read depth, with the core count, and with upstream
changes to cutadapt, VSEARCH or the fit):

```
sigma recompute 1.5e-07 | wt fitness recompute 1.6e-05 | merge recompute 1.4e-17
   parameter   rep mean_value
      <char> <int>      <num>
1:     input     1   1.000000
2:     input     2   1.000000
3:    output     1   1.000000
4:    output     2   1.831000
5:  reperror     1   0.002582
6:  reperror     2   0.003273
WT counts (in1 in2 out1 out2): 8783 9838 5867 6771
singles: 282 | synonymous: 217 | doubles: 1954
counted substitution reads per sample: 26613 18885 26334 20403
     Pos  WT_AA    Mut fitness sigma
   <int> <char> <char>   <num> <num>
1:    33      M      R  -1.734 0.516
2:    36      A      P  -1.665 0.576
3:    33      M      K  -1.444 0.458
4:    28      S      I   1.349 0.215
5:    42      Q      L   1.398 0.201
6:    42      Q      *   1.664 0.267
```

Two runs on identical input, both at `--numCores 4`, gave byte-identical error models and
fitness tables. The bootstrap's random streams are fixed, but they are tied to the number of
workers, so change `--numCores` and these values shift slightly. Only 19–27% of the input
pairs end up counted as variants. VSEARCH drops pairs that fail the Q30 minimum, and stage 4
rejects indels and variants with more than two substitutions. The rejected files hold the
rest. Depth changes the error model: the same four runs at 200,000 pairs gave `output 2`
1.084 and `input 2` 1.117, which is why those numbers are listed as observed values and not
invariants.

## Troubleshooting

Both of these were reproduced against 1.4. Run the block from the directory the `## Try it`
block used, so that `fastq/` and `design.txt` exist.

```bash
eval "$(conda shell.bash hook)"
conda activate dimsum
export PATH="$CONDA_PREFIX/bin:$CONDA_PREFIX/lib/jvm/bin:$PATH"

# 1. The documented counts-only demo, run from a directory with no FASTQ in it.
mkdir -p demo_check && cd demo_check
DiMSum --runDemo T 2>&1 | grep -E "^Error" | tail -1
cd ..

# 2. A full file extension where DiMSum wants only the stem.
DiMSum -i fastq -l .fastq.gz -e design.txt -w ACGT 2>&1 | grep -E "^Error" | tail -1
```

prints

```
Error: Invalid FASTQ file name './bTDP1-IN-5A_read1.fastq.gz' in experimentDesign file (file not found)
Error: Invalid 'fastqFileExtension' argument (only alphanumeric characters allowed)
```

- **`--runDemo T` looks for FASTQ.** Upstream documents `DiMSum --runDemo T` as the
  counts-only demo, but the command-line wrapper always passes a FASTQ directory (`./` by
  default), and the R code only switches to the bundled counts when that directory is
  unset. Use the counts-mode block above, or add
  `--countPath "$(Rscript -e 'cat(system.file("demo","countFile_Toy.txt",package="DiMSum"))')"`.
- **`-l .fastq.gz`.** Give the stem (`.fastq`) and leave `--gzipped T`.
- **`Bad CPU type in executable`, then `subscript out of bounds`.** On an Apple Silicon Mac
  without Rosetta 2, every run stops right after printing its binary versions, with

      sh: .../bin/pandoc: Bad CPU type in executable
      Error in strsplit(info, "\n", useBytes = TRUE)[[1]] :
        subscript out of bounds

  The environment's pandoc is an x86_64 binary. Install Rosetta 2 as described under "What a
  reader needs before starting". Reinstalling the environment does not help. Inside a DiMSum
  run the message always comes from `sh` and reads `Bad CPU type`. Running `pandoc` directly
  from zsh prints the lower-case `bad CPU type in executable` instead. Both mean the same
  thing.
- `Error in if (names(plot_object)[1] == "grobs")` or `ggplot2 ... >= 4.0.0 is required` —
  the plotting stack is too new. Recreate the environment with the pins under Install.
- `Required R packages not installed ... DiMSum` — the wrong `Rscript` is first on `PATH`.
  Run the `export PATH=...` line.
- `object 'dimsum_meta_new_report' not found` at stage 1 — FastQC could not start Java.
  Same fix. The same message at a later stage means a report step failed, so look higher in
  the log for `There were problems while running`.
- Very few counted variants — check `*_rejected_variant_data_merge.tsv` and
  `*_indel_variant_data_merge.tsv`. A wrong wild-type sequence or wrong constant regions
  put almost every read there.
