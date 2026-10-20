---
name: levseq
description: Turn a plate-format directed evolution screen into sequence-function data with LevSeq. Covers Nanopore demultiplexing by dual barcodes, per-well variant calling, reading the call markers, and joining LC-MS activity readouts to variants.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [directed-evolution, nanopore, variant-calling, sequence-function, protein-engineering]
allowed-tools: Read, Write, Edit, Bash
datasets: [https://zenodo.org/api/records/13694463/files/20240502-YL-ParLQ-ep2.fastq.zip/content, https://zenodo.org/api/records/13694463/files/20240502-YL-ParLQ-ep2.csv/content]
verified:
  date: 2026-10-20
  against: levseq 1.5.1 / pandas 2.3.3 / numpy 2.4.6 / pysam 0.24.1 / mappy 2.31 / samtools 1.19.2 / minimap2 2.26-r1175 / Python 3.11.17 on Ubuntu 24.04
  executed: 9
  unverified: 0
---

# LevSeq — every well's variant, paired with what that well did

LevSeq takes a basecalled Oxford Nanopore run over a plate-format screen and returns one
row per well — the called variant, the read depth behind it, and, when activity data is
supplied, the measured function alongside it. That table is the output a directed evolution
campaign actually needs: not "here are the hits", but full-length sequence for all 96 wells
including the ones that did nothing, which is what makes a screen usable as training data.

Use it after you have sequenced a plate. It sits downstream of library design — in this
registry, `dna-chisel` and `ggassembler` produce the constructs — and it is what turns the
resulting plate into the variant-to-function table that `enrich2` and
`protein-engineering-campaign` reason over.

The pipeline is three steps: demultiplex reads by their dual barcodes into plate and well,
align each well's reads to that plate's reference with minimap2 and call a consensus variant,
then optionally join an activity readout keyed on well.

## Before you start

Everything here runs on CPU. There is no GPU step and no account, key or licence to accept —
LevSeq is GPL-3.0 and published on the Python package index. Three things do need obtaining:

- **`samtools` and `minimap2` as executables on `PATH`.** The variant caller shells out to
  both. `pip` does not supply them; the `mappy` and `pysam` wheels it does install are not
  substitutes, and a run without them fails inside variant calling rather than at startup.
- **Basecalled FASTQ.** Input is already-basecalled reads, normally a `fastq_pass` directory
  from the sequencer. Basecalling is outside the tool.
- **pandas 2.x, pinned.** LevSeq 1.5.1 does not work correctly on pandas 3 — see
  **Pin pandas below 3** below, which is a silent wrong-answer bug rather than a crash. Pin it
  at install time.

Roughly 1 GB of disk for the worked example here, and about 2 minutes of CPU per 96-well plate.

## Install

Upstream recommends `conda install -c bioconda -c conda-forge samtools minimap2` inside a
conda environment, or the published Docker images (`yueminglong/levseq:levseq-1.5.1-x86` and
`…-arm64`), which carry the binaries already. On Debian or Ubuntu the distribution packages
work and need no conda. Installing them needs root; drop the `sudo` if you already are root,
as in most containers:

```bash
sudo apt-get update -qq && sudo apt-get install -y -qq samtools minimap2
python3 -m venv ~/levseq-env
~/levseq-env/bin/pip install -q "levseq==1.5.1" "pandas<3"
```

Confirm all three pieces are present before running anything — a missing aligner is the most
common cause of an empty result:

```bash
~/levseq-env/bin/levseq --help | head -3
~/levseq-env/bin/python -c "import pandas; print('pandas', pandas.__version__)"
samtools --version | head -1
minimap2 --version
```

On macOS with an M-series chip, upstream requires gcc 13 or 14 from Homebrew before the pip
install, because two dependencies compile from source.

## The reference file

One required input besides the reads: a CSV with exactly three columns naming, for each plate
barcode, what that plate is and what its parent gene was. `barcode_plate` is the reverse
barcode number used in the wet-lab prep, `name` is free text used for output folders, and
`refseq` is the parent coding sequence — A, T, G, C only, and its length must be divisible by
three, because the caller translates it.

```csv
barcode_plate,name,refseq
1,300-1,ATGGCGGTTCCCGGCTACGATTTTGGCAAAGTCCCGGATGCC...
2,300-2,ATGGCGGTTCCCGGCTACGATTTTGGCAAAGTCCCGGATGCC...
```

Plates present in the reads but absent from this file are skipped silently, which is the
intended way to process one plate out of a larger run. Plates listed here but absent from the
reads produce a full 96 rows of empty wells. For an oligopool experiment, repeat a
`barcode_plate` once per gene on that plate and pass `--oligopool`.

## Fetch a real run

The project publishes a complete MinION run of an error-prone PCR campaign on Zenodo under
CC-BY-4.0, which is what every command below is executed against. The archive is 93 MB
compressed and 246 MB extracted, holding 121,182 reads across six plates:

```bash
mkdir -p ~/levseq-demo && cd ~/levseq-demo
curl -sL --retry 3 --retry-delay 2 -o ep2.fastq.zip \
  "https://zenodo.org/api/records/13694463/files/20240502-YL-ParLQ-ep2.fastq.zip/content"
mkdir -p fastq_pass && unzip -q -o -j ep2.fastq.zip "*.fastq" -x "__MACOSX/*" -d fastq_pass
curl -sL --retry 3 --retry-delay 2 -o ref_all.csv \
  "https://zenodo.org/api/records/13694463/files/20240502-YL-ParLQ-ep2.csv/content"
head -1 ref_all.csv > ref.csv && sed -n '2p' ref_all.csv >> ref.csv
ls -la fastq_pass && cut -c1-40 ref.csv
```

The last two lines cut the six-plate reference down to plate 1. The full file runs fine and
takes about six times as long; one plate is enough to see every behaviour on this page.

## Run it

Three positional arguments — a run name, the directory holding the reads, and the reference
CSV. Output lands in a folder named after the run:

```bash
cd ~/levseq-demo
~/levseq-env/bin/levseq oneplate ~/levseq-demo/fastq_pass ~/levseq-demo/ref.csv \
  --output ~/levseq-demo/out
```

**Expect a wall of `[E::hts_open_format] Failed to open file … .bam : No such file or directory`
on stderr, and a zero exit.** Those lines are htslib reporting wells where no reads
demultiplexed, so no alignment was ever written. They are normal and not a reason to stop; the
run is finished when it prints `Run completed successfully`. Do not use them to count failed
wells, either: this plate emits 8 such lines naming 8 distinct wells while 9 wells end with
zero aligned reads, so the messages under-report. Count `Alignment Count == 0` in the output
instead.

Two useful flags: `--skip_demultiplexing` when reads are already split into per-barcode
folders, and `--skip_variantcalling` to stop after demultiplexing.

## Reading the output

The run folder carries two tables, one per well in each:

- **`variants.csv`** — the called variant plus the reference sequence on every row. Convenient
  to eyeball, bulky to work with.
- **`visualization_partial.csv`** — the same wells with the columns analysis actually wants:
  `nucleotide_mutation`, `amino_acid_substitutions`, `nt_sequence`, `aa_sequence`,
  `Alignment Count`, `Average mutation frequency`, `P adj. value`, and `Row`/`Column` for
  plate plotting. This is the file to join against, and the one the fitness step expects.

There is also `Platemaps/` with an interactive HTML plate view, and `Results/` with a
per-run CSV.

```bash
cd ~/levseq-demo
~/levseq-env/bin/python - <<'PY'
import pandas as pd
vp = pd.read_csv("out/oneplate/visualization_partial.csv")
aa, ac = vp["amino_acid_substitutions"], vp["Alignment Count"]
markers = ["#PARENT#", "#LOW#", "#N.A.#", "LEN"]
print("wells:", len(vp))
for m in markers:
    print(f"  {m:>10}: {(aa == m).sum()}")
print("  substitution calls:", len(aa[~aa.isin(markers)].dropna()))
print("read depth — median", ac.median(), "max", ac.max(), "| zero-read wells", (ac == 0).sum())
print(vp[["Well", "Alignment Count", "nucleotide_mutation",
          "amino_acid_substitutions"]].head(8).to_string(index=False))
PY
```

### What the markers mean

A well's `amino_acid_substitutions` is either a substitution string like `C42R_G90V_K123N_L173F`
— one-letter reference residue, 1-based residue number, one-letter observed residue, joined by
underscores — or one of five markers. Knowing which is which decides whether a blank well is a
failed prep or a real result:

| marker | meaning |
|---|---|
| `#PARENT#` | reads aligned and the translated protein is identical to `refseq`. A real result |
| `#LOW#` | 10 or fewer reads aligned. No call attempted, whatever the nucleotide column says |
| `#N.A.#` | zero reads aligned. The well failed, or that barcode pair was never used |
| `LEN` | the translated variant differs in length from the reference — a frameshift |
| `#DEL#` | the consensus is a deletion |

`LEN` is the one that costs people time: it is undocumented upstream, and it means the
nucleotide consensus carries an indel that shifted the reading frame, so no per-residue
comparison is possible. On the demo plate 4 wells are genuine frameshifts of this kind, each
carrying a single-base deletion such as `G167DEL`.

### Three traps worth knowing before you trust a column

**The nucleotide column is not depth-gated and the amino-acid column is.** Well A2 of the demo
plate reports `nucleotide_mutation` of `C41DEL_C42DEL_A325T_G353T_G509C` — five changes — from
an `Alignment Count` of **1**. Its `amino_acid_substitutions` correctly reads `#LOW#`. Filter on
`Alignment Count` yourself before believing any nucleotide call; the two columns do not apply
the same standard, and a single Nanopore read is not evidence of five mutations.

**A silent nucleotide change still shows as parent.** Well A4 carries `T163C` in the nucleotide
column and `#PARENT#` in the amino-acid column. That is correct — the substitution is
synonymous — but it means `#PARENT#` counts are protein-level, so a plate can show real
sequence diversity and no amino-acid diversity at all.

**Aggregate on the amino-acid column, not the nucleotide one**, unless the question really is
about DNA. Of the demo plate's 96 wells, 33 read `#PARENT#` at the protein level while the
nucleotide column marks fewer as unchanged.

### Pin pandas below 3

On pandas 3, LevSeq 1.5.1 **finishes with exit code 0 and reports the wrong thing**, which is
why the pin sits in the install block rather than in a footnote. Measured on the six-plate
demo run, same reads, same reference, same LevSeq:

| `amino_acid_substitutions` | pandas 2.3.3 | pandas 3.0.6 |
|---|---|---|
| `#N.A.#` (zero reads) | 106 | **0** |
| `LEN` (frameshift) | 27 | **133** |

Every zero-read well is relabelled as a frameshift. Counting frameshifts on pandas 3 overstates
them roughly fivefold on this dataset, and nothing in the output says so. The mechanism is a
chained `.iat` write in the labelling step, which pandas 3 turns into a no-op under
copy-on-write.

**The warning this raises will not tell you which case you are in.** pandas 2.3.3 prints a
`FutureWarning` carrying the same `ChainedAssignmentError` name — and then writes the value
correctly. So seeing that name in a log says nothing about whether the output is right. Check
the version, not the warning:

```bash
~/levseq-env/bin/python -c "
import pandas as pd
d = pd.DataFrame({'Substitutions': ['a', 'b', 'c']})
d.Substitutions.iat[1] = '#N.A.#'
print(pd.__version__, '->', d.Substitutions.tolist())
"
```

On pandas 2 that prints the written value; on pandas 3 the frame is unchanged. The same
incompatibility breaks `levseq.simulation` outright, with a `TypeError` on an int-to-float
assignment, so a pandas 3 environment is not usable for the package's own simulation harness
either.

## Joining activity data

Giving LevSeq an activity readout turns the variant table into sequence-function data. It
expects one CSV per plate, with the plate's barcode as the final `_<n>` of the filename, and
three columns: `Sample Vial Number` holding something whose last `-`-separated field is the
well, `Compound Name`, and `Area`, which becomes the fitness value. Rows not matching
`--compound` are dropped.

The demo record publishes no LC-MS file, so the block below writes a synthetic one to exercise
the join — the numbers in it are random and mean nothing biologically. Supply your own
instrument export in its place:

```bash
cd ~/levseq-demo
cp out/oneplate/visualization_partial.csv .
~/levseq-env/bin/python - <<'PY'
import csv, random
random.seed(1)
wells = [f"{r}{c}" for r in "ABCDEFGH" for c in range(1, 13)]
rows = []
for w in wells:
    rows.append({"Sample Vial Number": f"1-{w}", "Compound Name": "pdt",
                 "Area": round(random.uniform(1e4, 5e5), 1)})
    rows.append({"Sample Vial Number": f"1-{w}", "Compound Name": "substrate",
                 "Area": round(random.uniform(1e4, 2e5), 1)})
with open("lcms_demo_1.csv", "w", newline="") as fh:
    wr = csv.DictWriter(fh, fieldnames=["Sample Vial Number", "Compound Name", "Area"])
    wr.writeheader(); wr.writerows(rows)
print("wrote", len(rows), "rows for plate barcode 1")
PY
```

The join is a separate invocation. The positional arguments are still required and ignored on
this path, so pass the same run name and paths; what selects the join is the presence of
`--fitness_files`, `--smiles` and `--variant_df` together. Omit any one of the three and
LevSeq silently runs the whole sequencing pipeline again instead:

```bash
cd ~/levseq-demo
~/levseq-env/bin/levseq oneplate . ref.csv \
  --fitness_files "lcms_demo_1.csv" \
  --smiles 'CCO>>CC=O' \
  --compound pdt \
  --variant_df "visualization_partial.csv"
ls visualization_partial_seqfunc.csv
```

Output is written beside `--variant_df` with `_seqfunc` appended — here
`visualization_partial_seqfunc.csv`. Its columns are lowercased with spaces turned to
underscores, `Area` is renamed `fitness_value`, and the reaction SMILES is carried on every
row. The join is a left join on `<barcode_plate>_<well>`, so wells with no activity row keep
their sequence and get an empty `fitness_value`: supplying one plate's LC-MS against a
six-plate variant table joins 96 rows and leaves the rest sequence-only, with no warning that
five plates went unmatched. Check the non-null count yourself.

## Barcodes are provisional — ask before ordering primers

The barcode set shipped with LevSeq 1.x is **not settled**, and this matters before anyone
spends money. Upstream reports demultiplexing problems with the original barcodes, addressed
in 1.4 by alignment-aware variant calling rather than by changing the barcodes, and is
redesigning the scheme for 2.0 — strain- and sequence-aware barcodes, with demultiplexing
moved after alignment instead of before. The project asks to be contacted before you order
barcoded primers. Treat the 1.x barcodes as a working set for data you already have, not as a
design to commit a wet-lab order to.

## Try it

**Data.** The project's own epPCR MinION run of ParLQ, published on Zenodo as
`10.5281/zenodo.13694463` under CC-BY-4.0 — `20240502-YL-ParLQ-ep2.fastq.zip` (93 MB, 121,182
reads) plus `20240502-YL-ParLQ-ep2.csv`, the six-plate reference file. Both were last confirmed
reachable on 2026-10-20. Only plate 1 is used here, which takes about two minutes.

**Run.** Self-contained in an empty directory:

```bash
set -e
WORKDIR=$(mktemp -d) && cd "$WORKDIR"
command -v samtools >/dev/null && command -v minimap2 >/dev/null \
  || { echo "need samtools and minimap2 on PATH — see Install" >&2; exit 1; }
python3 -m venv env
./env/bin/pip install -q "levseq==1.5.1" "pandas<3"
curl -sL --retry 3 --retry-delay 2 -o ep2.fastq.zip \
  "https://zenodo.org/api/records/13694463/files/20240502-YL-ParLQ-ep2.fastq.zip/content"
mkdir -p fastq_pass && unzip -q -o -j ep2.fastq.zip "*.fastq" -x "__MACOSX/*" -d fastq_pass
curl -sL --retry 3 --retry-delay 2 -o ref_all.csv \
  "https://zenodo.org/api/records/13694463/files/20240502-YL-ParLQ-ep2.csv/content"
head -1 ref_all.csv > ref.csv && sed -n '2p' ref_all.csv >> ref.csv
./env/bin/levseq tryit "$WORKDIR/fastq_pass" "$WORKDIR/ref.csv" --output "$WORKDIR/out" >run.log 2>&1
./env/bin/python - <<'PY'
import pandas as pd
vp = pd.read_csv("out/tryit/visualization_partial.csv")
aa, ac = vp["amino_acid_substitutions"], vp["Alignment Count"]
markers = ["#PARENT#", "#LOW#", "#N.A.#", "LEN"]
assert len(vp) == 96, len(vp)
assert ((aa == "#N.A.#") == (ac == 0)).all(), "#N.A.# must mark exactly the zero-read wells"
assert aa.notna().all(), "every well carries a call or a marker"
for m in markers:
    print(f"{m:>10}: {(aa == m).sum()}")
print("substitution calls:", len(aa[~aa.isin(markers)].dropna()))
print("read depth median:", ac.median(), "max:", ac.max())
print("A5 call:", vp.loc[vp.Well == "A5", "amino_acid_substitutions"].item())
PY
```

**Expect.** Two assertions are invariants and hold across versions: the table has exactly one
row per well of a 96-well plate, and `#N.A.#` marks exactly the wells with zero aligned reads.
A failure there means the skill is wrong.

The counts are observed values, from LevSeq 1.5.1 on pandas 2.3.3 on 2026-10-20:

```
  #PARENT#: 33
     #LOW#: 10
    #N.A.#: 9
       LEN: 4
substitution calls: 40
read depth median: 74.0 max: 308.0
A5 call: C42R_G90V_K123N_L173F
```

A mismatch in those numbers is drift to investigate — an aligner or caller change — not a
broken skill. The nine `#N.A.#` and four `LEN` wells splitting any other way on the same data
is the pandas 3 bug above, so check `pandas.__version__` first.

## Citing

Long Y, Mora A, Li F-Z, Gürsoy E, Johnston KE, Arnold FH. LevSeq — rapid generation of
sequence-function data for directed evolution and machine learning. *ACS Synthetic Biology*
2025;14(1):230–238. doi:10.1021/acssynbio.4c00625

LevSeq is GPL-3.0, from the Arnold lab at Caltech. The source is at
`https://github.com/fhalab/LevSeq`.
