---
name: omega
description: Fragment designed genes into orderable oligopool subpools with OMEGA — place Golden Gate junctions by simulated annealing against measured ligation fidelity, check every gene reassembles in silico, and emit the oligos to order.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [golden-gate, oligopool, library-design, dna-assembly, protein-engineering]
covers: [oligopool, oligo pool, gene library, golden gate, type IIS, BsaI, BsmBI, BbsI, overhang fidelity, junction, subpool, gene synthesis, gene assembly, fragment design, variant library, designed proteins, GFP library, oligo order, T4 ligase, simulated annealing]
papers: [doi:10.1126/sciadv.ady2279, doi:10.1021/acssynbio.8b00333, doi:10.1371/journal.pone.0238592, doi:10.1093/synbio/ysx008]
datasets: [https://raw.githubusercontent.com/RomeroLab/omega/main/data/fastas/gfp_test_install.fasta]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-17
  against: OMEGA v1.0.0 (RomeroLab/omega at 160be2f) / biopython 1.88 / pandas 3.0.6 / numpy 1.26.4 / jsonargparse 4.52.0 / Python 3.11.17 on Linux
  executed: 10
  unverified: 0
---

Hundreds of designed genes are cheap to order as one oligopool and expensive to order as
individual genes. OMEGA is the step in between — it cuts each designed gene into
oligo-length fragments, picks the Golden Gate overhangs that join them back together, and
groups genes into subpools that can each be amplified with a single primer pair. The
overhangs are not chosen by rule of thumb but by simulated annealing against published
ligation-frequency measurements, because what actually fails in a one-pot assembly of this
size is two overhangs that mis-ligate.

OMEGA is from the Romero lab and is GPL-3.0. Copyleft binds code that links against it, not
a reader who runs the program, and nothing on this page reproduces its source. It runs on
CPU, needs no API key, no account and no GPU, and touches the network only when you clone it.

Where it sits next to other skills here — `dna-chisel` turns a designed protein into
codon-optimized DNA with the enzyme's recognition sites already stripped, which is what
OMEGA expects as input. `ggassembler` solves a problem that looks similar and is not: a
combinatorial library of one parent with degenerate codons at chosen positions. OMEGA takes
a set of *distinct, full-length* genes and makes them buildable from one pool.

## What you need

Python 3.10 or 3.11, and **numpy pinned below 2.0**. This is not a style preference — on
numpy 2.x OMEGA fails before doing any work:

```
ValueError: The truth value of an empty array is ambiguous. Use `array.size > 0` to check that an array is not empty.
```

raised from `library_classes.py` while constructing the `Library`. The project's own
environment file pins `numpy=1.26`; a plain `pip install numpy` will not.

Your input is a FASTA of codon-optimized coding sequences carrying **no internal recognition
site** for the enzyme you plan to assemble with, plus a CSV of forward/reverse primer pairs —
one pair is consumed per subpool. The repository ships 91 validated orthogonal pairs from
Subramanian et al. as `data/test_primers.csv`, and those are the ones to use unless you have
a reason not to.

## Install

OMEGA is distributed as a repository rather than a package, so you clone it and run
`code/omega.py` out of the checkout.

```bash
git clone https://github.com/RomeroLab/omega
cd omega
python3 -m venv .venv
./.venv/bin/pip install "numpy<2" biopython pandas jsonargparse more-itertools tqdm joblib regex
./.venv/bin/python -c "import numpy, Bio, pandas; print(numpy.__version__, Bio.__version__, pandas.__version__)"
```

The project also ships `environment.yml` for conda — `conda env create --file
environment.yml && conda activate omega` — pinning the same set. Use whichever you have; the
pip line above is the one this page was verified against.

Every command below assumes you are in the directory holding that checkout, and invokes the
virtual environment's interpreter explicitly rather than activating it.

## The arithmetic that decides your run

One parameter does most of the work. `njunctions` is the number of Golden Gate sites
available to a subpool, and the rest follows from it:

```
genes_per_pool = (njunctions - 2 - len(other_used_sites)) // (fragments_per_gene - 1)
n_pools        = ceil(n_genes / genes_per_pool)
```

The `- 2` is the vector's own upstream and downstream sites. `fragments_per_gene` falls out
of gene length against `oligo_len` (default 300 nt, less primers and padding). So with
`njunctions: 50` and ~700 bp genes cut into 4 fragments, a subpool holds `(50-2)//3 = 16`
genes, and 100 genes need 7 subpools — and therefore 7 primer pairs. Ask for more junctions
than the ligation data can supply orthogonally and fidelity drops; ask for fewer and you pay
for more subpools.

Both numbers are printed before any optimization starts, which is where to catch a
misconfigured run:

```bash
cd omega && PY=./.venv/bin/python
"$PY" code/omega.py genes --config configs/test_install.yml
```

```
Read 15 from data/fastas/gfp_test_install.fasta.
Sequence lengths are 657 - 726 bp
Using BsaI and T4_18h_37C data to assemble library.
Maximum number of GG sites allowed per pool: 50
Target number of genes per pool: 16 genes assembled in 1 pools.
Genes are broken into 4 fragments.
```

## The three output files

`optimization_results.csv` is per gene — the submitted sequence, one `oligo_N` column per
fragment, the chosen `ggsite_N` overhangs, the primer pair, and the fidelity figures.
`oligo_order.csv` is the two columns you actually send to a vendor, `name` and `sequence`.
`pool_stats.csv` is one row per subpool. A fourth file, `experiment_details.txt`, records
the ligase and incubation the chosen ligation dataset implies.

Two things will trip you up reading them back:

- All three CSVs are written with the pandas index, so each gains an unnamed leading column.
  Read them with `index_col=0` or carry an `Unnamed: 0` around.
- **The fidelity columns are named differently in different files.** `pool_stats.csv` calls
  them `min_gene` and `min_site`; `optimization_results.csv` calls the same quantities
  `min_gene_fidelity` and `min_site_fidelity`. Code written against one raises `KeyError` on
  the other.

```bash
cd omega && PY=./.venv/bin/python
"$PY" -c "
import pandas as pd
p = pd.read_csv('output/test_install/pool_stats.csv', index_col=0)
o = pd.read_csv('output/test_install/oligo_order.csv', index_col=0)
r = pd.read_csv('output/test_install/optimization_results.csv', index_col=0)
print('pools', len(p), '| oligos', len(o), '| genes', len(r))
print('pool_stats min cols :', [c for c in p.columns if 'min' in c])
print('results    min cols :', [c for c in r.columns if 'min' in c])
print('oligo lengths       :', o.sequence.str.len().min(), '-', o.sequence.str.len().max())
"
```

Every oligo comes out at exactly `oligo_len`. OMEGA pads short fragments with random 40%-GC
DNA, written in lowercase so you can see it and split between the two ends — the uppercase
stretches are primer, overhang and real coding sequence.

## Reading the fidelity numbers

Three figures, and they do not mean the same thing. `fidelity` is the Pryor-style
whole-assembly number, computed as if every site in the pool ligated in one sequential
reaction; it is what the optimizer descends on, and it looks alarmingly low because it is a
product over many sites. `min_gene` is the worst single gene in the pool, scoped to that
gene's own junctions, and it is the number that predicts whether you get the library you
ordered. `min_site` is the least orthogonal overhang chosen.

Judge a design on `min_gene`. A pool with `fidelity` 0.56 and `min_gene` 0.94 is a usable
design, not a failing one.

## Reproducibility — the design is seeded, the oligos are not

This is the trap worth knowing before you order anything. Run the stock config twice and
`pool_stats.csv` comes back byte-identical while `oligo_order.csv` does not:

```bash
cd omega && PY=./.venv/bin/python
for i in 1 2; do
  "$PY" code/omega.py genes --config configs/test_install.yml --output_dir "output/repro$i" > /dev/null 2>&1
done
cmp -s output/repro1/pool_stats.csv  output/repro2/pool_stats.csv  && echo "pool_stats:  identical" || echo "pool_stats:  differs"
cmp -s output/repro1/oligo_order.csv output/repro2/oligo_order.csv && echo "oligo_order: identical" || echo "oligo_order: differs"
```

The junction search seeds Python's `random`, so overhangs and fidelities reproduce. The
padding is generated with `numpy.random`, which nothing seeds — so the ordered sequences
diverge at the first padded base while the design above them is identical. If you need the
exact sequences you ordered to be regenerable, turn padding off and all three files become
stable:

```bash
cd omega && PY=./.venv/bin/python
for i in 1 2; do
  "$PY" code/omega.py genes --config configs/test_install.yml --pad_oligos false --output_dir "output/nopad$i" > /dev/null 2>&1
done
cmp -s output/nopad1/oligo_order.csv output/nopad2/oligo_order.csv \
  && echo "padding off, oligo_order: identical" || echo "padding off, oligo_order: differs"
```

Otherwise keep the `oligo_order.csv` you actually submitted. It is the only record of it.

## `opt_seeds` is ignored unless you clear `nopt_runs`

`nopt_runs` asks for N independent optimizations and keeps the best; `opt_seeds` names the
seeds explicitly. They are documented as mutually exclusive, and OMEGA does carry

```
ValueError: Cannot provide values for both `nopt_runs` and `opt_seeds`.
```

— but read the guard rather than the message. It tests `nopt_runs` first and reaches the
error only when **neither** is set, so passing `--opt_seeds` on top of a config that already
carries `nopt_runs` silently uses `nopt_runs` and discards your seeds, with no warning.
Clear it explicitly:

```bash
cd omega && PY=./.venv/bin/python
"$PY" code/omega.py genes --config configs/test_install.yml \
  --opt_seeds '[7]' --nopt_runs null --output_dir output/seeded > /dev/null 2>&1
"$PY" -c "
import pandas as pd
print('seed used:', pd.read_csv('output/seeded/pool_stats.csv', index_col=0)['seed'].tolist())
"
```

That prints `[7]`. Drop `--nopt_runs null` and it prints the seed `nopt_runs` picked
instead. Worth knowing that `nopt_runs` is itself deterministic — it draws its seeds from a
numpy generator fixed at 42 — so the default path reproduces too. It just does not reproduce
*your* seed.

## Enzyme and ligation data have to match

`enzyme` picks the Type IIS enzyme; `ligation_data` picks which published
overhang-ligation measurements the optimizer scores against. Mismatched, the run aborts
immediately rather than scoring against the wrong table:

```bash
cd omega && PY=./.venv/bin/python
"$PY" code/omega.py genes --config configs/test_install.yml \
  --enzyme BsmBI --ligation_data BsaI_cycling --output_dir output/mismatch 2>&1 | tail -2
```

The T4 datasets (`T4_01h_25C`, `T4_18h_25C`, `T4_01h_37C`, `T4_18h_37C`) are enzyme-agnostic
and pair with any enzyme; the cycling datasets (`BsaI_cycling`, `BbsI_cycling`,
`BsmBI_cycling`, `Esp3I_cycling`, `SapI_cycling`) are each tied to their own enzyme.

The default pairing — BsaI with `T4_18h_37C`, an 18-hour 37 °C ligation — is the one the
OMEGA paper used, and the alternatives are not interchangeable with it in practice. Scoring
the same 15-gene design against BsmBI with `BsmBI_cycling` instead dropped whole-pool
`fidelity` from 0.56 to 0.00016 and `min_gene` from 0.94 to 0.32 at otherwise identical
settings. Change it deliberately, and change your bench protocol with it.

## Scaling up

The repository's 100-sequence GFP library is the realistic shape. Nothing changes except the
pool count:

```bash
cd omega && PY=./.venv/bin/python
"$PY" code/omega.py genes --config configs/test_install.yml \
  --input_seqs data/fastas/gfp_lib_450-550.fasta --nopt_steps 50 --njobs 4 \
  --output_dir output/lib100 2>&1 | grep -E "^(Read|Target|Designed)"
```

100 genes become 7 subpools and 400 oligos, each subpool carrying its own primer pair
(`subra_0` through `subra_6`). Pools are balanced rather than filled to capacity, so you get
15/15/14/14/14/14/14 genes rather than six full pools and a remainder — which is why
`n_sites` differs between pools in `pool_stats.csv`.

Two settings matter once you are designing for real rather than testing. `nopt_steps` is 100
in `test_install.yml` purely so it finishes fast — the project's default is 3000, and the
template config uses 1000 with `nopt_runs: 5`. Raising `nopt_runs` buys more than raising
`nopt_steps`. And `njobs` parallelizes the runs within a subpool across CPUs; it defaults to
1, which is slow for no reason.

Run out of primer pairs and OMEGA stops before optimizing rather than halfway through:

```bash
cd omega && PY=./.venv/bin/python
head -3 data/test_primers.csv > two_primer_pairs.csv
"$PY" code/omega.py genes --config configs/test_install.yml \
  --input_seqs data/fastas/gfp_lib_450-550.fasta --primers two_primer_pairs.csv \
  --output_dir output/fewprimers 2>&1 | tail -2
```

## What OMEGA checks, and what it leaves to you

It checks the thing that matters most: every designed gene is reassembled in silico from its
own fragments, overhangs are required to match at each join, and the translated product is
compared against the translation of the sequence you submitted. A design that would not
rebuild your protein raises rather than shipping into an order.

It does not codon-optimize, and it does not remove internal recognition sites for you — feed
it sequences that already carry none, which is what `dna-chisel` is for. It does not design
combinatorial degenerate-codon libraries; that is `ggassembler`. It assumes one pair of
backbone overhangs for the whole library. And the wet-lab side — PCR conditions for
amplifying subpools out of the pool, the Golden Gate setup, the long digest — is specified in
the project's own README and paper, not here; the annealing temperature in particular is tied
to the Subramanian primers and the polymerase they were validated with.

The authors state plainly that the code has not been exhaustively tested. Read
`pool_stats.csv` before you spend money.

## What to hand back

The `oligo_order.csv` as submitted, the `pool_stats.csv` beside it, and a short note giving:
the enzyme and ligation dataset used, `njunctions`, `nopt_steps` and `nopt_runs`, the number
of subpools and which primer pair each took, and the worst `min_gene` across pools. Flag any
pool whose `min_gene` you would not bet the order on. If padding was left on, say so — that
file is then the only copy of those sequences.

## Try it

**Data** — the 15-sequence GFP test library and the 91 orthogonal primer pairs that ship with
OMEGA (`data/fastas/gfp_test_install.fasta`, `data/test_primers.csv`), both GPL-3.0 with the
repository and confirmed reachable 2026-10-17.

**Run** — in a fresh empty directory. The block clones OMEGA itself, so it depends on nothing
an earlier section left behind. Around a minute, including the install.

```bash
COLD=$(mktemp -d) && cd "$COLD"
git clone --quiet https://github.com/RomeroLab/omega && cd omega
python3 -m venv .venv
./.venv/bin/pip install --quiet "numpy<2" biopython pandas jsonargparse more-itertools tqdm joblib regex
PY=./.venv/bin/python
"$PY" code/omega.py genes --config configs/test_install.yml 2>&1 | grep -E "^(Read|Target|Genes|Designed)"
"$PY" -c "
import pandas as pd
p = pd.read_csv('output/test_install/pool_stats.csv', index_col=0)
o = pd.read_csv('output/test_install/oligo_order.csv', index_col=0)
print('pools      ', len(p))
print('oligos     ', len(o))
print('all 300 nt ', bool((o.sequence.str.len() == 300).all()))
print('n_sites    ', int(p.n_sites.iloc[0]))
print('seed       ', int(p.seed.iloc[0]))
print('fidelity   ', round(float(p.fidelity.iloc[0]), 4))
print('min_gene   ', round(float(p.min_gene.iloc[0]), 4))
"
```

**Expect** —

*Invariants.* 15 sequences read, cut into 4 fragments each, assembled in 1 pool, giving
**60 oligos** of exactly **300 nt**. `n_sites` is **47** — 15 genes × 3 internal junctions
plus the 2 backbone sites. Every gene passes the in-silico reassembly check, so the run
completes without a `ValueError`. A failure here means this page is wrong, or OMEGA is.

*Observed — OMEGA v1.0.0 (160be2f), numpy 1.26.4, 2026-10-17.* The stock config draws its
seed from a fixed generator, so these reproduce: seed **89**, `fidelity` **0.5637**,
`min_gene` **0.9393**. They follow from the shipped ligation data and the optimizer's RNG; if
upstream changes either, they move, and that is drift to investigate rather than a fault.
`min_gene` ≈ 0.94 against `fidelity` ≈ 0.56 is the expected relationship between the two
numbers, not a contradiction — see the fidelity section above.

Re-running this does **not** reproduce `oligo_order.csv` byte for byte, only
`pool_stats.csv`. That is the padding behaviour described above, not a failure.
