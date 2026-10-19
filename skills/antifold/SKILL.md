---
name: antifold
description: Design antibody and nanobody CDR sequences on a fixed Fv backbone with AntiFold — per-residue log probabilities, region and IMGT-position constraints, CPU inference. Covers the renamed output columns and how a non-Fv chain still scores.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [antibody-design, inverse-folding, nanobody, antifold]
covers: [antibody, nanobody, VHH, Fab, Fv, CDR, CDRH3, framework, IMGT numbering, inverse folding, sequence design, humanisation, affinity maturation, library design, ESM-IF1, SAbDab, OAS, antibody engineering, variable domain]
datasets: [https://files.rcsb.org/download/6Y1L.pdb, https://github.com/oxpig/AntiFold/releases/download/weights-v1/model.pt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-19
  against: AntiFold at commit 9918344 (repository HEAD, pushed 2026-09-27) / weights model.pt from release weights-v1, sha256 d5c442fa0372c28f4d0026d2f551b6f8ba7e7a127cb6837813a88093ed233e9e / torch 2.14.1, anarcii 2.0.8, gemmi 0.7.5, biotite 2.0.0, biopython 1.88, numpy 2.5.4, pandas 3.0.6, Python 3.13.16 / CPU only, linux x86_64 / structures from RCSB PDB
  executed: 9
  unverified: 0
---

# Antibody inverse folding with AntiFold

AntiFold answers one question: given this antibody variable-domain backbone, what sequence
would fold into it? It is ESM-IF1 fine-tuned on solved antibody structures, so unlike a
general inverse-folding model it has seen thousands of Fv folds and knows that the framework
is nearly invariant while the loops are not.

That is the whole reason to reach for it rather than `proteinmpnn`. A general model asked to
redesign an Fv will happily rewrite the framework, because from backbone geometry alone there
is nothing special about it. AntiFold scores every position in the IMGT frame, so you can say
"resample CDRH3 and leave the rest alone" in the vocabulary the structure is actually
annotated in, and the constraint means what an antibody engineer thinks it means.

Two things about this page are worth knowing before you start. The output column names in the
project's own README are a release behind the code, so a reader copying them gets a
`KeyError`; the real ones are below. And AntiFold does not refuse input it was not trained
for — hand it a Fab, or a structure that is not an antibody at all, and it returns a full,
well-formed table of per-residue log probabilities either way. Both of those are documented
here because they are the two ways a run looks like it worked and did not.

## What you need before the first run

- **Python 3.13.** `setup.py` declares `python_requires=">=3.13"`; an older interpreter is
  refused at install time, not at run time.
- **~550 MB of model weights**, fetched automatically on the first inference from the
  project's GitHub release and written next to the installed package. Nothing to sign up
  for and no token — but the first run is a download, so do not time it as inference.
- **No GPU.** CUDA is used when present and CPU is the default otherwise; a paired Fv scores
  in a few seconds on a laptop core. `--device` overrides the choice.
- **BSD 3-Clause**, for the code and the weights alike. No non-commercial clause, no
  click-through, no registration.

Numbering is handled for you. AntiFold renumbers input chains to IMGT with ANARCII before
inference, so a structure straight out of the PDB works and you do not need to pre-number
anything. Pass `--skip_anarcii_numbering` only if your file is already IMGT-numbered and you
want it left exactly as it is.

## Install

From source, not PyPI. The published `antifold` wheel is years behind the repository and
predates the switch to ANARCII numbering, so the flags and the output columns in this page do
not apply to it.

```bash
git clone https://github.com/oxpig/AntiFold
cd AntiFold
python3.13 -m venv .venv
. .venv/bin/activate
pip install .
```

On Linux that pulls the CUDA build of PyTorch — `requirements.txt` asks only for
`torch>=2.3`, and the default wheel brings the NVIDIA runtime libraries with it, several
gigabytes of them, whether or not a GPU exists. Inference is unaffected and still runs on
CPU. If the download matters to you, install a CPU-only `torch` into the environment before
`pip install .`; the project points at PyTorch's own install matrix for picking that wheel.

There is no console script. Invoke the module:

```bash
python -m antifold.main --help
```

**Give the structure a path, not a bare filename.** AntiFold splits `--pdb_file` into a
directory and a stem and then re-joins them, so `--pdb_file 6y1l.pdb` becomes a lookup for
`/6y1l.pdb` at the filesystem root and dies with `FileNotFoundError: Unable to find PDB/CIF
file: /6y1l.[pdb|cif]`. Write `./6y1l.pdb` or an absolute path. This is the first thing that
goes wrong for everybody, and the message does not point at the cause.

## Score a backbone

One paired Fv, heavy chain `H` and light chain `L`:

```bash
curl -sS -o 6y1l.pdb https://files.rcsb.org/download/6Y1L.pdb
python -m antifold.main \
    --pdb_file ./6y1l.pdb \
    --heavy_chain H \
    --light_chain L \
    --out_dir out
```

That writes `out/6y1l_HL.csv` — one row per scored residue, 27 columns:

| column | what it is |
| --- | --- |
| `pdb_posins` | residue number with insertion code, e.g. `112A` |
| `pdb_chain` | chain as given in the input |
| `pdb_res` | the residue that is there |
| `top_res` | the model's argmax for the position |
| `pdb_pos` | IMGT position as an integer |
| `perplexity` | how tolerant the position is — 1.0 means one residue fits, higher means many do |
| `assumed_region` | IMGT region label, or empty |
| `A` … `Y` | log probability for each of the 20 amino acids, in alphabetical order |

**The README names four of these differently.** It documents `aa_orig` and `aa_pred` and
omits `assumed_region`; the code emits `pdb_res`, `top_res` and `assumed_region`, in a
different column order. Read the header, not the README. The twenty amino-acid columns are a
log-softmax, so `exp()` across a row sums to 1 and `top_res` is always the argmax of that
row — both cheap things to assert if you are building on top of the file.

## The constant domain is scored, and it should not be

Most antibody structures in the PDB are Fabs, not Fvs, and AntiFold will score the whole
chain you give it. On `6Y1L` — a Fab — that is 440 rows: 223 for the heavy chain, 217 for the
light. Only 226 of them are in the variable domain.

`assumed_region` is the tell. It is populated exactly where `pdb_pos` is 1-128 and empty
above it, so the CH1 and CL residues come back scored but unlabelled. They are also scored
badly, because the model never saw a constant domain in training:

```bash
python - <<'PY'
import pandas as pd
df = pd.read_csv("out/6y1l_HL.csv")
fv = df[df.assumed_region.notna()]
ch = df[df.assumed_region.isna()]
print("rows %d  variable %d  constant %d" % (len(df), len(fv), len(ch)))
print("recovery  whole chain %.4f   variable domain only %.4f"
      % ((df.top_res == df.pdb_res).mean(), (fv.top_res == fv.pdb_res).mean()))
print("mean perplexity  variable %.3f   constant %.3f"
      % (fv.perplexity.mean(), ch.perplexity.mean()))
PY
```

Native-sequence recovery over the whole file is 0.689. Over the variable domain alone it is
0.907. Nothing failed; 214 rows the model has no business predicting dragged the headline
number down by twenty points. Any recovery or perplexity figure you report from AntiFold has
to say which rows it was computed over, and the answer should almost always be
`assumed_region.notna()`.

Trimming the structure to the variable domain before you run is the cleaner fix where you
have the option. Filtering afterwards is equivalent for scoring, and is what you want when
the antigen or the constant domain is load-bearing for the geometry.

## A structure that is not an antibody still scores

This is the failure mode to internalise, because nothing about the output announces it.
Hand AntiFold ubiquitin:

```bash
curl -sS -o 1ubq.pdb https://files.rcsb.org/download/1UBQ.pdb
python -m antifold.main --pdb_file ./1ubq.pdb --heavy_chain A --out_dir ubq
```

It logs one line — `Hchain=A is not an antibody chain, numbered as given` — switches itself
into custom-chain mode, and writes `ubq/1ubq_A.csv` with 76 complete rows of log
probabilities. No error, no non-zero exit.

Worse, the rows carry region labels. `assumed_region` is assigned from the residue number
against the IMGT ranges and nothing else, so ubiquitin's residues 27-38 are labelled `CDRH1`
and 56-65 `CDRH2`. The column is named *assumed* for exactly this reason, and a pipeline that
filters on `assumed_region == "CDRH3"` will find positions in any protein you give it.

The numbers are the only signal, and they are soft: mean perplexity 3.96 on ubiquitin against
1.82 on a real Fv, recovery 0.539 against 0.907. Those are a smell, not a test. **The test is
the log line.** If you are running AntiFold over a set of structures, grep the run log for
`is not an antibody chain` and treat a hit as a failed input, because the CSV will not tell
you.

## Sample sequences in a region

Scoring gives you the landscape; `--num_seq_per_target` draws from it.

```bash
python -m antifold.main \
    --pdb_file ./6y1l.pdb \
    --heavy_chain H \
    --light_chain L \
    --num_seq_per_target 5 \
    --sampling_temp "0.2" \
    --regions "CDRH3" \
    --seed 42 \
    --out_dir sampled
```

`--regions` takes IMGT region names, chain-prefixed position ranges, or a mix of both:

- `CDRH3`, `CDRL1`, `FWH2` — one region on one chain.
- `CDR1 CDR2 CDR3` — the named region on *both* chains.
- `CDRH` / `CDRL` — all three CDRs of one chain; `allH` / `allL` — a whole chain.
- `H:111-112 L:66-70` — explicit positions. The `H:`/`L:` prefix is required, because IMGT
  numbering restarts on each chain, and a range covers insertion codes, so `H:111` also
  selects `111A` and `111B`.
- `CDRH3 L:66-70` — regions and positions together.

Everything outside the selection is held fixed, including the constant domain. `--seed` makes
the draw reproducible; at `--sampling_temp 0.2` the samples sit close to the argmax, and
raising it towards 1.0 buys diversity at the cost of likelihood.

Two ways this goes wrong, both of which raise rather than designing nothing. An unrecognised
entry is rejected before inference, with the full list of region names and a reminder that
positions need a prefix:

```
Invalid --regions entry '111-112'. Choose an IMGT region name (all, allH, allL, FWH, FWL,
CDRH, CDRL, FW1, ... CDR3, CDRH3, CDRL3, FW4, FWH4, FWL4) or chain-prefixed IMGT positions,
e.g. H:111, L:66-70 or H:10-12,15
```

And a valid name that matches no position in *this* structure — `CDRL3` on a nanobody, or a
prefix naming a chain you did not run — raises a `ValueError` naming the structure and the
selection.

## Reading score, global_score and seq_recovery

The FASTA headers are where this gets misread, and all three numbers mean something narrower
than they look.

```
>6y1l_HL , score=1.0470, global_score=1.0470, regions=['CDRH3'], model_name=AntiFold, seed=42
>seq1 T=0.20, sample=1, score=0.9329, global_score=1.0062, seq_recovery=0.9795, mutations=H:T108Y,...
```

**Lower is better.** Both scores are a mean negative log-likelihood of the sequence under the
model — `NLLLoss` over the log-softmax, averaged across the masked positions. The README
calls them "average log-odds", which reads as higher-is-better and is the opposite of what the
code computes.

**`score` is region-restricted, `global_score` is not** — except on the first record, where
they are both the global figure. The native row discards its region score and prints the
global one twice, so the native `score=1.0470` is not comparable with a sample's
`score=0.9329`. Compare `global_score` to `global_score`: 1.0470 native against 1.0051-1.0074
across the five samples, which is the real statement that low-temperature sampling improved
the sequence's likelihood.

**`seq_recovery` is diluted by every residue you passed in.** It is `1 - mutations / length`
over the full scored sequence, so on this Fab a CDRH3 redesign that replaced 8 of 12 loop
residues reports 0.9818. That is arithmetic, not agreement: 8 mutations in 440 residues.
Recovery within the designed region is the number you want, and you compute it yourself from
the `mutations=` field.

## Nanobodies and single chains

A VHH is one chain, so name it and leave the light chain out. The repository ships a VHH and
an antibody-antigen complex under `data/`, so from the clone these run as written:

```bash
python -m antifold.main \
    --pdb_file ./data/nanobody/8oi2_imgt.pdb \
    --nanobody_chain B \
    --num_seq_per_target 3 \
    --sampling_temp "0.2" \
    --regions "CDRH3" \
    --seed 42 \
    --out_dir nb
```

Mutations come back prefixed `H:` even though the chain is `B` — the nanobody chain is mapped
onto the heavy-chain frame, and the prefix refers to that frame rather than to your chain ID.
Asking for a light-chain region raises rather than designing nothing:

```
ValueError: 8oi2_imgt_B: --regions CDRL3 selects no positions in this structure. Check the
chain prefixes match the chains being run (a single heavy chain has no L: positions)
```

For an antibody-antigen complex, name the antigen so its geometry is used as context while
only the antibody is designed. This enables custom-chain mode, and the antigen's residues are
scored alongside the Fv:

```bash
python -m antifold.main \
    --pdb_file ./data/antibody_antigen/3hfm.pdb \
    --heavy_chain H \
    --light_chain L \
    --antigen_chain Y \
    --out_dir complex
```

One caution on raw downloads here. ANARCII finds the antibody domain in whatever chain you
name, so a VHH expressed as a fusion comes back renumbered around that domain and the rest of
the construct is carried along — PDB entry `8OI2`, whose chain B is a 507-residue fusion,
scores as 466 rows with IMGT positions repeating. Check the row count against the domain you
meant to design before reading anything else out of the file.

## What AntiFold does not tell you

It returns sequences that fit a backbone. It does not say whether they express, fold, bind, or
survive a developability screen, and a low `global_score` is not an affinity prediction. The
model has no notion of the antigen beyond the coordinates you give it, and a CDRH3 resampled
without `--antigen_chain` is designed against empty space where the epitope used to be.

Three neighbours cover the questions this one does not: `thermompnn` for whether a
substitution destabilises the fold, `immunebuilder` for a model when you have sequence but no
structure, and `binder-design-filtering` for ranking a designed complex. `proteinmpnn`
remains the right tool for a non-antibody backbone — which is precisely the input AntiFold
accepts and should not.

ESM-IF1, the foundation AntiFold fine-tunes, is archived read-only upstream. AntiFold is the
maintained path for this task, and `--esm_if1_mode` reaches the original weights if you need
a baseline.

## Try it

**Data.** RCSB PDB entry `6Y1L`, the Fab of antibody A.17 with an L47R mutation — chains `H`
and `L`, a public anonymous ~650 kB download with no licence to accept and no account.
Confirmed reachable 2026-10-19. The block also pulls the 541 MB AntiFold weights from the
project's GitHub release, which the first inference does on its own, and `pip install .`
brings the CUDA PyTorch wheels described above — several gigabytes in total, and the bulk of
the runtime. Inference itself is seconds.

**Run.** In a fresh empty directory, with `python3.13` and `git` on the path. This provisions
everything it uses:

```bash
set -e
git clone --quiet https://github.com/oxpig/AntiFold
cd AntiFold
git checkout --quiet 9918344067f34a6b026f2634fdba212fc3e6e986
python3.13 -m venv .venv
. .venv/bin/activate
pip install --quiet .
curl -sS -o 6y1l.pdb https://files.rcsb.org/download/6Y1L.pdb
python -m antifold.main --pdb_file ./6y1l.pdb --heavy_chain H --light_chain L \
    --num_seq_per_target 5 --sampling_temp "0.2" --regions "CDRH3" --seed 42 \
    --out_dir out >/dev/null 2>&1
python - <<'CHECK'
import hashlib, re, numpy as np, pandas as pd, antifold.antiscripts as A

AAS = list("ACDEFGHIKLMNPQRSTVWY")
df = pd.read_csv("out/6y1l_HL.csv")
fv, ch = df[df.assumed_region.notna()], df[df.assumed_region.isna()]
lp = df[AAS].to_numpy()

heads = [l[1:].strip() for l in open("out/6y1l_HL.fasta") if l.startswith(">")]
num = lambda h, k: float(re.search(rf"{k}=(-?[\d.]+)", h).group(1))
muts = lambda h: re.search(r"mutations=(\S+)", h).group(1).split(",")
native, samples = heads[0], heads[1:]

# invariants — properties of the method and the file format; a failure here is a real problem
assert list(df.columns[:7]) == ["pdb_posins", "pdb_chain", "pdb_res", "top_res",
                                "pdb_pos", "perplexity", "assumed_region"]
assert np.allclose(np.exp(lp).sum(1), 1.0, atol=1e-3), "the 20 columns are a log-softmax"
assert ([AAS[i] for i in lp.argmax(1)] == df.top_res).all(), "top_res is the argmax"
assert fv.pdb_pos.max() <= 128 and ch.pdb_pos.min() > 128, "assumed_region marks IMGT 1-128"
assert len(ch) > 0, "6Y1L is a Fab, so the constant domain is scored and unlabelled"
assert fv.perplexity.mean() < ch.perplexity.mean(), "the model is out of domain above 128"
for h in samples:
    assert all(m.startswith("H:") and 105 <= int(m[3:-1]) <= 117 for m in muts(h)), \
        "--regions CDRH3 confines every mutation to heavy-chain IMGT 105-117"
    assert abs(num(h, "seq_recovery") - (1 - len(muts(h)) / len(df))) < 5e-5, \
        "seq_recovery divides by every scored residue, not by the designed region"
    assert num(h, "global_score") < num(native, "global_score"), \
        "lower is better, and sampling at T=0.2 improves on the native sequence"
assert num(native, "score") == num(native, "global_score"), \
    "the native record prints the global score twice"
assert hashlib.sha256(open(A.ANTIFOLD_WEIGHTS_PATH, "rb").read()).hexdigest() \
    == A.ANTIFOLD_WEIGHTS_SHA256, "weights match the hash the project pins"

# observed values — AntiFold 9918344 on 2026-10-19; drift to re-record, not failures
assert (len(df), len(fv), len(ch)) == (440, 226, 214)
assert abs((df.top_res == df.pdb_res).mean() - 0.6886) < 5e-4
assert abs((fv.top_res == fv.pdb_res).mean() - 0.9071) < 5e-4
assert len(samples) == 5 and sorted(len(muts(h)) for h in samples) == [8, 8, 8, 8, 9]

print("rows %d  variable %d  constant %d" % (len(df), len(fv), len(ch)))
print("recovery  whole chain %.4f  variable domain %.4f"
      % ((df.top_res == df.pdb_res).mean(), (fv.top_res == fv.pdb_res).mean()))
print("mean perplexity  variable %.3f  constant %.3f"
      % (fv.perplexity.mean(), ch.perplexity.mean()))
print("global_score  native %.4f  samples %.4f-%.4f"
      % (num(native, "global_score"),
         min(num(h, "global_score") for h in samples),
         max(num(h, "global_score") for h in samples)))
print("CDRH3 mutations per sample", sorted(len(muts(h)) for h in samples))
print("OK")
CHECK
```

**Expect.** Every assertion passes and the block prints:

```
rows 440  variable 226  constant 214
recovery  whole chain 0.6886  variable domain 0.9071
mean perplexity  variable 1.817  constant 4.753
global_score  native 1.0470  samples 1.0051-1.0074
CDRH3 mutations per sample [8, 8, 8, 8, 9]
OK
```

The split is deliberate. The invariants — the column names, the twenty columns being a
log-softmax, `top_res` as the argmax, `assumed_region` marking IMGT 1-128, `--regions CDRH3`
confining mutations to heavy-chain 105-117, the `seq_recovery` denominator, the native record
printing its global score twice, and the pinned weight hash — are properties of the method and
the file format, so a failure there means something is genuinely wrong. The observed values
below them are dated to AntiFold at commit `9918344` on 2026-10-19; if those move while the
invariants hold, the weights or the structure changed and the numbers want re-recording
rather than the page rewriting.

## Provenance

- Code and weights: <https://github.com/oxpig/AntiFold>, BSD 3-Clause.
- Paper: Høie, Hummer et al., *AntiFold: improved antibody structure-based design using
  inverse folding*, Bioinformatics Advances 5(1):vbae202, 2025.
  <https://doi.org/10.1093/bioadv/vbae202>
- Numbering: ANARCII, <https://github.com/oxpig/ANARCII>, BSD 3-Clause.
- Structures: RCSB PDB, <https://www.rcsb.org>.
