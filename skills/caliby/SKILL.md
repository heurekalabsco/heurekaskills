---
name: caliby
description: Design protein sequences against a structural ensemble rather than one backbone with Caliby — a Potts model whose parameters average across conformers, so one sequence is optimised for all of them at once. Covers where ensembles come from, what the energy means, and the silent ways the molecule Caliby designs stops being the molecule you handed it.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-design, inverse-folding, protein-structure, caliby]
datasets: [https://files.rcsb.org/download/1D3Z.pdb, https://huggingface.co/ProteinDesignLab/caliby-weights/resolve/main/caliby/caliby.ckpt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-29
  against: caliby at commit 41d3156 (repository HEAD, last pushed 2026-07-01) / weights caliby, soluble_caliby, caliby_distill and the Protpardelle-1c cc95 checkpoint from ProteinDesignLab/caliby-weights / torch 2.13.0, numpy 2.1.3, biotite 1.6.0, Python 3.12.8 / CPU device on arm64 macOS, Apple M1 Max / structures from RCSB PDB / ProteinMPNN commit 8907e66 for the comparison
  executed: 15
  unverified: 0
---

# Ensemble-conditioned sequence design with Caliby

Caliby answers the same question ProteinMPNN does — what sequence would fold into this
backbone — but it answers it with a different object, and that object is the reason this
page exists.

ProteinMPNN factorises the sequence autoregressively: it decodes positions in a random
order and conditions each choice on the residues already placed. Caliby instead predicts an
explicit **Potts model** over the whole chain — a field `h` giving each position's own
preference over amino acids, and couplings `J` giving every pair's — and then samples from
it by Markov chain Monte Carlo with the temperature annealed from 1.0 down to 0.01.

That representation is what makes the ensemble possible. Two backbones give two Potts
models over the same positions, so they can be **averaged into one energy function** before
a single sequence is sampled against it. ProteinMPNN offers nothing to average — its
factorisation is defined by a decoding order drawn fresh for each structure, so there is no
shared object to combine. This is not a claim about which model is better; it is a claim
about what each one can be asked. Everything below measures what the difference actually
buys, including where it buys almost nothing and where it costs a great deal.

## What a reader must obtain

**Nothing gated.** The code is one public GitHub repository, `ProteinDesignLab/caliby`,
Apache-2.0 in the `LICENSE` at its root. The weights live in a separate Hugging Face
repository, `ProteinDesignLab/caliby-weights`, which the API reports as `license:
apache-2.0` and `gated: false` — no account, no token, no request form. Weights download
themselves on first use.

Check the path, not just the tool, because a path carries its dependencies' terms. As of
29 Aug 2026 this one is clean throughout: Protpardelle-1c, which generates the ensembles,
is MIT; the AtomWorks fork that parses structures is BSD-3-Clause; the Chroma layers
vendored into the repository carry Apache-2.0 headers and no Chroma weights are ever
fetched. The optional AlphaFold2 self-consistency extra pulls DeepMind's AF2 parameters,
whose `LICENSE` in the weights repository is CC-BY-4.0. Nothing on any of these routes is
non-commercial.

**No GPU is required and none was used for anything on this page.** Every entry point
selects `"cuda" if torch.cuda.is_available() else "cpu"`, with no hardcoded accelerator, so
a machine without an NVIDIA card runs on CPU without being asked to. That includes
Protpardelle-1c ensemble generation. See *How long this takes on CPU* for what that costs.

What you do need: **Python 3.12 or newer** (the package requires it), **`uv`**, about
**2 GB of disk** for the environment and **440 MB** for the weights if you use the full
ensemble pipeline. `uv` is the install route the project supports; get it from your package
manager — `brew install uv`, `pipx install uv`, or `pip install uv`.

Be ready for the install to be slow. It resolves 184 packages, clones a large git
dependency, and builds `prody` from source. On a warm cache it is a few minutes; from cold,
budget twenty.

## Install

```bash
uv venv venv -p python3.12
VIRTUAL_ENV=venv uv pip install "git+https://github.com/ProteinDesignLab/caliby.git"
mkdir -p structs
for id in 1UBQ 1BRS 1REI 1F88; do
  curl -fsSL -o "structs/$id.cif" "https://files.rcsb.org/download/$id.cif"
done
curl -fsSL -o structs/1UBQ.pdb https://files.rcsb.org/download/1UBQ.pdb
curl -fsSL -o structs/1BRS.pdb https://files.rcsb.org/download/1BRS.pdb
./venv/bin/python -c "import caliby, torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"
```

Everything below runs from that directory with `./venv/bin/python`, and writes weights into
`./model_params` — a path relative to the **current working directory**, so running from
somewhere else downloads them again.

Use `curl -f`. RCSB answers a missing entry with an HTML error page under a 404, and
without `-f` curl writes that page into the file. The parser then dies inside AtomWorks
with an error that names nothing about the real problem.

## The first design

```python
import torch
from caliby import load_model

model = load_model("caliby")

torch.manual_seed(0)
out = model.sample(["structs/1UBQ.pdb"], num_seqs_per_pdb=4, out_dir="first",
                   num_workers=0)
for eid, seq, U in zip(out["example_id"], out["seq"], out["U"]):
    print("%-14s U=%9.2f  %s" % (eid, U, seq))
print("native        ", out["input_seq"][0])

scored = model.score(["structs/1UBQ.pdb"], num_workers=0)
print("native energy  %.4f   per-residue table %s"
      % (scored["U"][0], tuple(scored["U_i"][0].shape)))
```

Three things about that call are load-bearing.

**Pass `num_workers=0` for anything small.** The default is 2, and the data loader's worker
processes cost more to start than the work they do: scoring ubiquitin takes **2.8 s** at
`num_workers=0` and **17.8 s** at the default on this machine. Workers also failed outright
once during this page's measurements, with `DataLoader worker exited unexpectedly` and no
usable traceback. Raise it only when you are feeding hundreds of structures at once.

**Seed it yourself.** The Hydra command-line entry points call `seed_everything(0)` before
they do anything. The Python API does not — `load_model` and `sample` take no seed
argument, and only `generate_ensembles` has one. Sampling is MCMC, so without
`torch.manual_seed` nothing you do is reproducible, and nothing warns you.

**Sampling is stochastic; scoring is not.** Repeated `score` calls on one structure return
bit-identical energies. Repeated `sample` calls do not, even at the default temperature of
0.01 — 16 samples of ubiquitin were 16 distinct sequences.

## What the energy is, and what it is not

`U` is the Potts energy of the sampled sequence under the model fitted to that backbone, in
the model's own arbitrary units. **Lower is better, and that is the entire interpretation.**
`U_i` is the per-residue local conditional table, one row per residue and one column per
token in the reduced Potts alphabet.

`U` is not a log-likelihood per residue, and it is not comparable across:

- **Different targets or different lengths.** It is a sum over positions and pairs, so it
  scales with size. Ubiquitin's native sequence scores −168.22 and lysozyme's −269.39;
  the second is not a better protein.
- **Different checkpoints.** On rhodopsin, `caliby` scores its designs at −1428.84 and
  `soluble_caliby` scores its own at −1469.98. Those are two different energy functions.
- **A design against its native.** Designs of ubiquitin average about −202 while the native
  sequence scores −168.22. The model prefers its own sequences to the one evolution
  chose. That is a property of the objective, not evidence about the protein.

Compare `U` between sequences designed for the **same** structure with the **same**
checkpoint. That comparison is exactly what the next section is built on.

## The ensemble is the whole point

Ubiquitin has both an X-ray structure (`1UBQ`) and an NMR structure (`1D3Z`) whose deposited
file holds ten models of the same 76 residues. Ten models is an ensemble that already
exists, so it is the cleanest place to see what conditioning on one does.

```bash
curl -fsSL -o structs/1D3Z.pdb https://files.rcsb.org/download/1D3Z.pdb
mkdir -p ens
./venv/bin/python - <<'PY'
cur, n = [], 0
for line in open("structs/1D3Z.pdb"):
    if line.startswith("MODEL"):
        cur = []
    elif line.startswith("ENDMDL"):
        n += 1
        open("ens/model_%02d.pdb" % n, "w").writelines(cur + ["END\n"])
    elif line.startswith(("ATOM", "TER")):
        cur.append(line)
print("wrote", n, "single-model files")
PY
```

Splitting is not optional. **Handed the ten-model file directly, Caliby uses model 1 and
silently discards the other nine** — `score` on `1D3Z.pdb` and on the split `model_01.pdb`
return the same energy to every decimal place. ProteinMPNN does the same thing. Ensemble
conditioning is something you have to ask for.

### The averaging is exact, and you can check it

```python
import statistics
import torch
from caliby import load_model

models = ["ens/model_%02d.pdb" % i for i in range(1, 11)]
model = load_model("caliby")

per = model.score(models, num_workers=0)["U"]
ens = model.score_ensemble({"ubq": models}, num_workers=0)["U"][0]
for name, u in zip(range(1, 11), per):
    print("  model %2d  U=%9.4f" % (name, u))
print("mean over conformers %.4f   sd %.4f" % (statistics.mean(per), statistics.pstdev(per)))
print("ensemble energy      %.4f   difference %.6f"
      % (ens, ens - statistics.mean(per)))
```

The ten conformers score between −162.5166 and −158.6933, and the ensemble energy of the
same sequence is **−160.5816**, equal to the mean of the ten to within `1.2e-5`.

That equality is not a coincidence and it is worth stating precisely, because it *is* the
mechanism: the energy is linear in `h` and `J`, and the ensemble's parameters are the
per-conformer parameters averaged. Averaging in energy space is a geometric mean in
probability space. So "ensemble-conditioned" means, exactly, **sample the sequence that
minimises the average energy over the conformers** — not a vote, not a consensus of ten
separate designs, and not a rerun on the best model.

One consequence you should plan for. Averaging parameters position by position only means
anything if the positions correspond, so conformers must carry the same residues, in the
same numbering, in the same chains. Delete six residues from one conformer of the ten and
the run refuses rather than guessing — `ValueError: Residue index mismatch between decoys`,
before any design happens. That check can be turned off with
`ensemble_ignore_res_idx_mismatch`; there is no good reason to.

### What it changes

```python
import itertools, statistics
import torch
from caliby import load_model

NATIVE = "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG"
models = ["ens/model_%02d.pdb" % i for i in range(1, 11)]
model = load_model("caliby")


def report(label, seqs, U):
    rec = [sum(a == b for a, b in zip(NATIVE, s)) / len(NATIVE) for s in seqs]
    pw = [sum(a == b for a, b in zip(x, y)) / len(x)
          for x, y in itertools.combinations(seqs, 2)]
    print("%-24s recovery %.4f +- %.4f   pairwise identity %.4f   U %.2f"
          % (label, statistics.mean(rec), statistics.pstdev(rec),
             statistics.mean(pw), statistics.mean(U)))


torch.manual_seed(0)
one = model.sample([models[0]], num_seqs_per_pdb=16, out_dir="d_one", num_workers=0,
                   verbose=False)
report("designed on model 1", one["seq"], one["U"])

torch.manual_seed(0)
ten = model.ensemble_sample({"ubq": models}, num_seqs_per_pdb=16, out_dir="d_ten",
                            num_workers=0, verbose=False)
report("designed on all ten", ten["seq"], ten["U"])

# Now score each set of designs both ways. sample() writes the designed sequence onto the
# input backbone as a CIF, so those files can be fed straight back in as conformers.
import glob
for label, files in (("designed on model 1", sorted(glob.glob("d_one/samples/*.cif"))),
                     ("designed on all ten", sorted(glob.glob("d_ten/samples/*.cif")))):
    on_one = model.score(files, num_workers=0)["U"]
    on_ten = model.score_ensemble({"x%d" % i: [f] + models[1:] for i, f in enumerate(files)},
                                  num_workers=0)["U"]
    print("%-24s U on model 1 alone %8.2f   U on the ensemble %8.2f"
          % (label, statistics.mean(on_one), statistics.mean(on_ten)))
```

Recovery barely moves — 0.5230 ± 0.0248 designing on model 1, 0.5280 ± 0.0305 designing on
all ten. **If you were expecting the ensemble to change native-sequence recovery on a rigid
protein, it does not, and anyone claiming otherwise from sixteen samples is reading noise.**

The cross-evaluation is where it shows up:

| designs made on | scored on model 1 alone | scored on the 10-model ensemble |
|---|---|---|
| model 1 alone | **−198.20** | −194.81 |
| all ten models | −198.28 | **−196.59** |

Sequences designed against the ensemble are **1.79 better across the ensemble and 0.08
worse on the single structure** — which is to say, indistinguishable on the structure they
gave up and measurably better everywhere else. On a tightly restrained NMR ensemble the
robustness is close to free. That is not true in general, and the next section is the case
where it is not.

## Where ensembles come from

Four sources, in decreasing order of how much you can trust them:

| source | cost | how wide |
|---|---|---|
| deposited NMR models | free, already in the file | narrow, restraint-shaped |
| MD frames or multiple crystal forms | expensive, real physics | whatever you sampled |
| Protpardelle-1c partial diffusion | seconds on CPU | tunable, and wide by default |
| Gaussian jitter of one backbone | free | narrow, and not a conformational ensemble |

The project's own recommendation is Protpardelle-1c partial diffusion, at 32 conformers per
backbone, with 8 or 16 also usable. It is a diffusion model that re-noises and re-denoises
your structure, and it runs on CPU — sixteen conformers of ubiquitin in **4.1 s** of
sampling, or about 15 s for the whole call once its weights are cached. On the way it logs
`LigandMPNN weights path not found` and `Foldseek executable not found`; both are upstream
messages about optional components this path does not use, and neither affects the output.

```python
import glob, itertools, statistics
import torch
from caliby import generate_ensembles, load_model

NATIVE = "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG"
gen = generate_ensembles(["structs/1UBQ.pdb"], out_dir="pp", num_samples_per_pdb=16,
                         batch_size=8, seed=0)
model = load_model("caliby")

torch.manual_seed(0)
raw = model.ensemble_sample(gen, num_seqs_per_pdb=1, out_dir="pp_raw", num_workers=0,
                            verbose=False)
print("primary = generated conformer :", raw["input_seq"][0])

conformers = {"1UBQ": ["structs/1UBQ.pdb"] + gen["1UBQ"]}
torch.manual_seed(0)
fixed = model.ensemble_sample(conformers, num_seqs_per_pdb=1, out_dir="pp_fixed",
                              num_workers=0, verbose=False)
print("primary = your own structure  :", fixed["input_seq"][0])
```

**`generate_ensembles()` does not return your structure, and that is a trap with teeth.**
Protpardelle-1c emits *poly-glycine backbones* — coordinates only, every residue `GLY`. The
returned dict holds those and nothing else, so feeding it straight into `ensemble_sample()`
makes a poly-glycine model the **primary conformer**, and the primary conformer is what
supplies the residue types, the reported `input_seq`, and the sequence any `fixed_pos_seq`
constraint is read against. The first line above prints 76 `G` characters. The
command-line entry point does not have this problem — it reads a directory and requires the
original file to be in it — so the discrepancy is between the two interfaces, not in the
model. Prepend your own structure, as the second call does.

With that fixed, the same comparison as before, over a 17-member ensemble:

```python
import glob, itertools, statistics
import torch
from caliby import load_model

NATIVE = "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG"
generated = sorted(glob.glob("pp/*/1UBQ/sample_*.pdb"))
conformers = {"1UBQ": ["structs/1UBQ.pdb"] + generated}
model = load_model("caliby")

torch.manual_seed(0)
des = model.ensemble_sample(conformers, num_seqs_per_pdb=16, out_dir="pp_des",
                            num_workers=0, verbose=False)
seqs = des["seq"]
rec = [sum(a == b for a, b in zip(NATIVE, s)) / len(NATIVE) for s in seqs]
pw = [sum(a == b for a, b in zip(x, y)) / len(x) for x, y in itertools.combinations(seqs, 2)]
print("protpardelle ensemble   recovery %.4f +- %.4f   pairwise identity %.4f"
      % (statistics.mean(rec), statistics.pstdev(rec), statistics.mean(pw)))

torch.manual_seed(0)
single = model.sample(["structs/1UBQ.pdb"], num_seqs_per_pdb=16, out_dir="pp_single",
                      num_workers=0, verbose=False)
for label, files in (("designed on 1UBQ alone", sorted(glob.glob("pp_single/samples/*.cif"))),
                     ("designed on the ensemble", sorted(glob.glob("pp_des/samples/*.cif")))):
    on_one = model.score(files, num_workers=0)["U"]
    on_all = model.score_ensemble({"y%d" % i: [f] + generated for i, f in enumerate(files)},
                                  num_workers=0)["U"]
    print("%-26s U on 1UBQ alone %8.2f   U on the ensemble %8.2f"
          % (label, statistics.mean(on_one), statistics.mean(on_all)))
```

| designs made on | scored on `1UBQ` alone | scored on the 17-member ensemble |
|---|---|---|
| `1UBQ` alone | **−202.27** | −161.64 |
| the ensemble | −181.14 | **−174.26** |

Here the trade is real and large: **+12.62 across the ensemble costs 21.13 on the single
structure**, and recovery against the native falls from 0.5535 ± 0.0239 to 0.4021 ± 0.0339
while pairwise identity between designs falls from 0.8354 to 0.7511. A Protpardelle
ensemble is much wider than a set of NMR models, and a sequence that satisfies all of it is
a visibly different sequence.

**Which of those two pictures you get is set by how wide your ensemble is, not by Caliby.**
Choose the ensemble to match the question: deposited conformers if you want the molecule to
tolerate the motions it actually makes, synthetic partial diffusion if you want a design
that survives the backbone being slightly wrong — which is the usual situation with a
generated backbone.

The fourth route needs no second file at all. `gaussian_conformers_cfg` jitters the one
structure you have with Gaussian noise and treats the copies as the ensemble:

```python
import itertools, statistics
import torch
from caliby import load_model

NATIVE = "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG"
model = load_model("caliby")
for std in (0.0, 0.1, 0.3):
    torch.manual_seed(0)
    overrides = ({"gaussian_conformers_cfg": {"n_conformers": 10, "noise_std": std}}
                 if std else None)
    r = model.sample(["structs/1UBQ.pdb"], num_seqs_per_pdb=16, out_dir="g_%s" % std,
                     num_workers=0, verbose=False, sampling_overrides=overrides)
    rec = [sum(a == b for a, b in zip(NATIVE, s)) / len(NATIVE) for s in r["seq"]]
    pw = [sum(a == b for a, b in zip(x, y)) / len(x)
          for x, y in itertools.combinations(r["seq"], 2)]
    print("noise %.1f A  recovery %.4f   pairwise identity %.4f   U %.2f"
          % (std, statistics.mean(rec), statistics.mean(pw), statistics.mean(r["U"])))
```

Ten jittered copies at 0.1 Å give recovery 0.5625 and at 0.3 Å give 0.5650, against 0.5535
for the single structure — a slight *increase*, and pairwise identity rises too. This is a
smoothing device, not an ensemble: random noise has no preferred direction, so averaging it
back out mostly denoises the Potts parameters. Use it to stabilise a design; do not report
it as conformational conditioning.

## Choosing a checkpoint

| `load_model` name | trained on | use for |
|---|---|---|
| `caliby` | all PDB chains, 0.3 Å noise, monomers | the default |
| `soluble_caliby` | monomers, annotated transmembrane proteins excluded | designs that must stay soluble |
| `soluble_caliby_v1` | as above, plus interfaces | soluble designs with a partner chain |
| `caliby_distill` | distilled from ensemble-conditioned `caliby` | fast screening, no ensemble needed |
| `soluble_caliby_distill` | distilled from ensemble-conditioned `soluble_caliby` | the same, soluble |
| `caliby_packer_000/010/030` | sidechain diffusion at 0.0/0.1/0.3 Å noise | packing sidechains, not designing |

Names ending in `.ckpt` are treated as file paths; anything else is a model name and is
resolved and downloaded. The default checkpoint is 45 MB; adding Protpardelle-1c and the
ProteinMPNN weights it uses internally brings `model_params/` to 438 MB.

```python
import itertools, statistics
import torch
from caliby import load_model

NATIVE = "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG"
for name in ("caliby", "soluble_caliby"):
    m = load_model(name)
    torch.manual_seed(0)
    r = m.sample(["structs/1F88.cif"], num_seqs_per_pdb=4, out_dir="f88_" + name,
                 num_workers=0, verbose=False)
    nat = r["input_seq"][0]
    rec = [sum(a == b for a, b in zip(nat, s)) / len(nat) for s in r["seq"]]
    print("1F88 %-15s recovery %.4f   U %.2f" % (name, statistics.mean(rec),
                                                 statistics.mean(r["U"])))

d = load_model("caliby_distill")
torch.manual_seed(0)
r = d.sample(["structs/1UBQ.pdb"], num_seqs_per_pdb=16, out_dir="distill", num_workers=0,
             verbose=False)
rec = [sum(a == b for a, b in zip(NATIVE, s)) / len(NATIVE) for s in r["seq"]]
pw = [sum(a == b for a, b in zip(x, y)) / len(x) for x, y in itertools.combinations(r["seq"], 2)]
print("1UBQ caliby_distill   recovery %.4f   pairwise identity %.4f   U %.2f"
      % (statistics.mean(rec), statistics.mean(pw), statistics.mean(r["U"])))
```

The soluble checkpoint's effect has a checkable direction. Bovine rhodopsin (`1F88`) is a
seven-transmembrane protein whose native sequence is largely lipid-facing — exactly what a
soluble-trained model was taught not to produce. Recovery drops from **0.3102** to
**0.2523**: it is actively designing away from the native membrane-facing residues, which
is what you want for a solubilised variant and precisely what you do not want if you are
reproducing a membrane protein.

The distilled checkpoint is a genuinely different model, not a faster path to the same
answer. On ubiquitin it recovers **0.4161** of the native sequence against **0.5535** for
`caliby` on the same backbone with the same seed — closer to the ensemble-conditioned
behaviour it was distilled from, which is the point, but far enough from the default that
you should not swap one for the other silently. It costs the same per sequence as the
default; what it saves is the ensemble generation.

## Temperature

Caliby anneals from 1.0 down to the temperature you name, which defaults to 0.01. The
number you set is the *floor*, not a fixed temperature, so it behaves differently from a
single-shot sampler's.

```python
import itertools, statistics
import torch
from caliby import load_model

NATIVE = "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG"
model = load_model("caliby")
for T in (0.01, 0.1, 0.2, 0.5, 1.0):
    torch.manual_seed(0)
    r = model.sample(["structs/1UBQ.pdb"], num_seqs_per_pdb=16, out_dir="T%s" % T,
                     num_workers=0, verbose=False, temperature=T)
    rec = [sum(a == b for a, b in zip(NATIVE, s)) / len(NATIVE) for s in r["seq"]]
    pw = [sum(a == b for a, b in zip(x, y)) / len(x)
          for x, y in itertools.combinations(r["seq"], 2)]
    print("T=%.2f  unique %2d/16  recovery %.4f  pairwise identity %.4f  U %.2f"
          % (T, len(set(r["seq"])), statistics.mean(rec), statistics.mean(pw),
             statistics.mean(r["U"])))
```

| final temperature | recovery | pairwise identity | mean `U` |
|---|---|---|---|
| 0.01 *(default)* | 0.5535 | 0.8354 | −202.27 |
| 0.1 | 0.5502 | 0.8332 | −202.21 |
| 0.2 | 0.5329 | 0.7981 | −200.76 |
| 0.5 | 0.4712 | 0.5334 | −178.79 |
| 1.0 | 0.3207 | 0.2562 | −116.50 |

Diversity is nearly free up to 0.1 and cheap to 0.2. Above that you are paying for it in
both recovery and energy, and at 1.0 the sequences are barely constrained by the structure
at all. Note that all 16 samples are distinct even at 0.01 — the diversity at low
temperature comes from the MCMC chain, not from the temperature, so raising it is not the
only way to get a library.

## Constraining the design

```python
import statistics
import torch
from caliby import load_model, make_constraints

NATIVE = "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG"
model = load_model("caliby")

torch.manual_seed(0)
c = make_constraints({"1UBQ": {"fixed_pos_seq": "A1-10"}})
r = model.sample(["structs/1UBQ.pdb"], num_seqs_per_pdb=4, out_dir="c_fix", num_workers=0,
                 pos_constraint_df=c, verbose=False)
print("fixed A1-10 held native in %d/4 designs" % sum(s[:10] == NATIVE[:10] for s in r["seq"]))

torch.manual_seed(0)
r = model.sample(["structs/1UBQ.pdb"], num_seqs_per_pdb=4, out_dir="c_omit", num_workers=0,
                 omit_aas=["C", "M"], verbose=False)
print("omit C,M -> C %d, M %d across 4 designs"
      % (sum(s.count("C") for s in r["seq"]), sum(s.count("M") for s in r["seq"])))

torch.manual_seed(0)
c = make_constraints({"1UBQ": {"pos_restrict_aatype": "A1:AG,A2:AG,A3:AG"}})
r = model.sample(["structs/1UBQ.pdb"], num_seqs_per_pdb=4, out_dir="c_res", num_workers=0,
                 pos_constraint_df=c, verbose=False)
print("restricted first three positions ->", [s[:3] for s in r["seq"]])

tied = make_constraints({"1REI": {"symmetry_pos": "|".join("A%d,B%d" % (i, i)
                                                           for i in range(1, 108))}})
for label, cons in (("untied", None), ("tied  ", tied)):
    torch.manual_seed(0)
    r = model.sample(["structs/1REI.cif"], num_seqs_per_pdb=8, out_dir="c_" + label.strip(),
                     num_workers=0, pos_constraint_df=cons, verbose=False)
    pairs = [s.split(":") for s in r["seq"]]
    print("1REI %s  chains identical %d/8   chain-to-chain identity %.3f   U %.1f"
          % (label, sum(a == b for a, b in pairs),
             statistics.mean(sum(x == y for x, y in zip(a, b)) / len(a) for a, b in pairs),
             statistics.mean(r["U"])))
```

Four constraint types, all confirmed: `fixed_pos_seq` held all ten positions native in 4 of
4 designs; `omit_aas=["C", "M"]` produced zero cysteines and zero methionines;
`pos_restrict_aatype` returned `AAG` at the three restricted positions in every design; and
`symmetry_pos` is a correctness fix rather than a preference. On the immunoglobulin
light-chain dimer `1REI`, whose two chains are identical 107-residue natives, **none of
eight untied designs returned two matching chains** and the copies averaged only 69.0%
identity to each other — two different genes for what has to be one protein. Tied, all
eight returned identical chains at no cost in energy (−580.6 against −582.9).

Two things about the position strings that will cost you a run:

**Positions are residue numbers, not offsets into the sequence you got back.** They are
matched against the parsed `res_id`, which is `label_seq_id` — the mmCIF sequence
numbering, not `auth_seq_id`. In PyMOL, `set cif_use_auth, off` shows the numbering the
constraints use. This matters more than it sounds, because Caliby drops unresolved residues
rather than padding them: rhodopsin's chain A spans label ids 1–348 with ten residues
missing across two gaps, so it comes back as 338 characters and label residue 240 is the
236th character rather than the 240th.

**A range that does not exist is a warning, not an error.** Asking to fix `A400-410` on a
76-residue chain prints `Warning: Requested position A400 not found in structure.` eleven
times and then designs everything. A wrong chain letter *is* fatal — `ValueError: Chain ID
Z not found in chain annotation` — so the two mistakes fail very differently.

## Four ways the molecule you designed is not the molecule you handed it

Every one of these is silent, and none of them is announced anywhere in the output.

**1. The file format changes the molecule.** Caliby builds **biological assembly 1**, and
mmCIF carries the assembly definitions while a PDB-format file handed to the same parser
does not. Barnase–barstar is the worked example, and the difference is threefold:

```python
from caliby import load_model

model = load_model("caliby")
for p in ("structs/1BRS.pdb", "structs/1BRS.cif", "structs/1D3Z.pdb", "ens/model_01.pdb"):
    r = model.score([p], num_workers=0)
    chains = r["seq"][0].split(":")
    print("%-20s chains=%d  lengths=%s  total=%4d  X=%d  U=%9.2f"
          % (p, len(chains), [len(c) for c in chains], sum(map(len, chains)),
             r["seq"][0].count("X"), r["U"][0]))
```

`1BRS.cif` gives **2 chains and 195 residues** — one barnase, one barstar, the biological
unit. `1BRS.pdb` gives **6 chains and 588 residues** — the whole asymmetric unit, three
copies of each. Same entry, same day, same command; three times as much protein designed,
and different answers for every residue because the neighbourhood changed. Decide which one
you mean, and check what you got.

**2. Residues missing a backbone frame atom are deleted, not designed.** ProteinMPNN's
failure here is to copy the native residue and quietly shrink the recovery denominator.
Caliby's is different and, for a pipeline, worse: the residues leave the molecule.

```python
import statistics
import torch
from caliby import load_model

NATIVE = "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG"


def strip(path, drop):
    open(path, "w").writelines(
        l for l in open("structs/1UBQ.pdb")
        if not (l.startswith(("ATOM", "HETATM")) and drop(l)))


strip("noO.pdb", lambda l: 10 <= int(l[22:26]) <= 25 and l[12:16].strip() == "O")
strip("noC.pdb", lambda l: 10 <= int(l[22:26]) <= 25 and l[12:16].strip() == "C")
strip("gap.pdb", lambda l: 30 <= int(l[22:26]) <= 35)
strip("ca.pdb", lambda l: l[12:16].strip() != "CA")

model = load_model("caliby")
for tag, path in (("intact", "structs/1UBQ.pdb"), ("no O 10-25", "noO.pdb"),
                  ("no C 10-25", "noC.pdb"), ("gap 30-35", "gap.pdb"),
                  ("CA trace", "ca.pdb")):
    torch.manual_seed(0)
    try:
        r = model.sample([path], num_seqs_per_pdb=4, out_dir="m_" + tag[:4].strip(),
                         num_workers=0, verbose=False)
        inp = r["input_seq"][0]
        rec = ("%.4f" % statistics.mean(
            sum(a == b for a, b in zip(NATIVE, s)) / len(NATIVE) for s in r["seq"])
        ) if len(inp) == len(NATIVE) else "n/a"
        print("%-11s parsed %2d residues   X in output %d   recovery %s"
              % (tag, len(inp), sum(s.count("X") for s in r["seq"]), rec))
    except Exception as e:
        print("%-11s %s: %s" % (tag, type(e).__name__, str(e)[:70]))
```

Deleting the backbone **O** from sixteen residues changes nothing structural — the parser
imputes missing atoms, all 76 residues are designed, and recovery falls from 0.5559 to
0.4671 because the geometry got worse. Deleting the backbone **C** from the same sixteen
removes them from the protein: the input parses as **60 residues**, the designs are 60
characters long, there is no `X` and no warning, and you are holding a sequence for a
protein that is missing an internal sixteen-residue block. A CA-only trace is the one that
fails loudly, with a `ValueError` from a preprocessing stage named `ErrIfAllUnresolved`.
There is no CA-only checkpoint; if a CA trace is what you have, this is not the tool.

**3. Gaps close, and the output is no longer alignable to the input numbering.** Deleting
residues 30–35 outright gives a 70-residue input and a 70-residue design, with the two
sides of the gap adjacent in the string. Nothing marks the join. The designed CIF in
`out_dir` carries the real residue ids and is the only thing you can map back safely — the
FASTA-like `seq` field cannot be.

That is also the exact difference from ProteinMPNN's handling, and it is a clean identity
rather than an impression. ProteinMPNN pads numbering gaps with `X`; Caliby drops them.
Across three entries with substantial disorder, **Caliby's parsed length equals
ProteinMPNN's parsed length minus its `X` count, exactly**:

```bash
git clone -q --depth 1 https://github.com/dauparas/ProteinMPNN.git
for id in 1F88 1IGT 6VXX; do
  curl -fsSL -o structs/$id.pdb https://files.rcsb.org/download/$id.pdb
  ./venv/bin/python ProteinMPNN/protein_mpnn_run.py --pdb_path structs/$id.pdb \
      --out_folder mpnn_$id --num_seq_per_target 1 --sampling_temp 0.1 --seed 37 > /dev/null
  ./venv/bin/python -c "
s = open('mpnn_$id/seqs/$id.fa').read().split(chr(10))[1]
print('$id ProteinMPNN parsed %d, X %d, so observed %d'
      % (len(s.replace('/', '')), s.count('X'), len(s.replace('/', '')) - s.count('X')))"
done
```

| entry | ProteinMPNN parsed | of which `X` | Caliby parsed |
|---|---|---|---|
| `1F88` rhodopsin | 674 | 31 | **643** |
| `1IGT` intact IgG | 1390 | 74 | **1316** |
| `6VXX` spike trimer | 3363 | 447 | **2916** |

Neither behaviour is wrong. They are different contracts, and a script that assumes the
output length equals the input length is broken by one of them and not the other.

**4. A multi-model file is model 1.** Covered above, and it is the failure most likely to
look like success: you point the tool at an NMR ensemble, everything runs, and you got a
single-structure design.

One more thing this section settles: **non-protein content is dropped entirely.** `1TUP` is
p53 bound to its DNA response element, and Caliby parses three protein chains and zero
nucleic acid tokens — the DNA-binding surface is designed as though it faced solvent.
Waters go too, and selenomethionine is converted to methionine. The model's tokenizer has
DNA, RNA and ligand token types, so this is the preprocessing pipeline's choice, not an
architectural limit; either way, a binding site defined by a non-protein partner is not
being conditioned on.

## Checked across fourteen structures

Everything above was written against ubiquitin and a handful of favourites, which proves
nothing about the method. These are the fourteen entries the parsing and scoring were run
across, chosen to differ on the axes RCSB actually varies on — 20 to 2916 residues, one to
four chains, X-ray and NMR, membrane and soluble, natural and de novo, with and without
nucleic acid, and with disorder ranging from none to 447 unresolved residues.

| entry | what it is | chains | residues parsed | native `U` |
|---|---|---|---|---|
| `1L2Y` | Trp-cage miniprotein, 38 NMR models | 1 | 20 | −23.90 |
| `1CRN` | crambin | 1 | 46 | −80.60 |
| `2GB1` | protein G B1 domain | 1 | 56 | −81.28 |
| `5PTI` | BPTI | 1 | 58 | −111.47 |
| `1UBQ` | ubiquitin, X-ray | 1 | 76 | −168.22 |
| `1D3Z` | ubiquitin, 10 NMR models | 1 | 76 | −160.69 |
| `1QYS` | Top7, de novo designed | 1 | 92 | −160.27 |
| `1AKI` | hen lysozyme | 1 | 129 | −269.39 |
| `1BRS` | barnase–barstar, from mmCIF | 2 | 195 | −404.42 |
| `1REI` | immunoglobulin light-chain dimer | 2 | 214 | −453.76 |
| `1TUP` | p53 core domain bound to DNA | 3 | 585 | −920.95 |
| `1F88` | bovine rhodopsin | 2 | 643 | −896.90 |
| `1IGT` | intact IgG antibody | 4 | 1316 | −2297.71 |
| `6VXX` | SARS-CoV-2 spike trimer | 3 | 2916 | −4783.83 |

Nothing in that set failed to parse, and **no entry produced a single `X`** — including the
three with hundreds of unresolved residues, because Caliby drops them rather than padding.
What the sweep did turn up is everything in the section above: the assembly-versus-file-format
divergence on `1BRS`, the vanished DNA on `1TUP`, the multi-model file on `1L2Y` and `1D3Z`,
and the length identity against ProteinMPNN on the three disordered entries. The only hard
failure found anywhere was the CA-only trace, and that one raises.

## How long this takes on CPU

Apple M1 Max, CPU device, `num_workers=0`, `caliby` checkpoint, 500 Potts sweeps, 29 Aug
2026. The middle column is a plain single-structure design; the right-hand column adds a
four-member ensemble.

| structure | residues | s per sequence | s per sequence, 4-member ensemble |
|---|---|---|---|
| `1CRN` | 46 | 1.8 | 4.4 |
| `1UBQ` | 76 | 3.7 | 5.3 |
| `1QYS` | 92 | 3.9 | 6.2 |
| `1AKI` | 129 | 4.4 | 7.7 |
| `1BRS` | 195 | 5.6 | 10.4 |
| `1REI` | 214 | 6.3 | 10.8 |
| `1F88` | 643 | 14.7 | 59.1 |
| `1IGT` | 1316 | 30.8 | 194.5 |
| `6VXX` | 2916 | 61.8 | 952.7 |

Single-structure design is close to linear in residues, at roughly **20 ms per residue per
sequence** at the large end. ProteinMPNN on the same machine does 8 sequences of 592
residues in 9.3 s, which is 2.0 ms per residue per sequence — so Caliby costs about ten
times more per residue, and is still comfortably a laptop workload. A hundred designs on a
200-residue target is about ten minutes.

**Ensemble conditioning does not scale that way, and it is the number to plan around.** The
averaged couplings are a dense N×N object rather than the sparse neighbour graph a single
structure uses, so cost grows faster than the chain length. Against a single structure, a
four-member ensemble costs 1.4× at 76 residues, 4.0× at 643, 6.3× at 1316 and **15.4× at
2916** — sixteen minutes for one sequence on the spike trimer, and that is with four
conformers rather than the thirty-two the project recommends. Ensemble-condition domains and
small complexes; screen large assemblies on a single structure, or with `caliby_distill`,
which needs no ensemble at all.

## What a designed sequence is, and is not

Caliby samples from a learned energy over sequences given backbones. That is the whole
claim. It contains no model of folding kinetics, stability, expression, aggregation or
function, and it has not been told what your protein is for.

**Native-sequence recovery is a similarity measure, not a success criterion.** It asks how
often the model reproduces one particular natural solution, and many sequences fold to the
same backbone. Across the structures on this page, recovery at the default temperature runs
from 0.2523 (rhodopsin under the soluble checkpoint, where disagreeing with the native is
the *goal*) to 0.5650. Compare designs against other designs on the same backbone, never
against a number from a different target.

**A lower `U` is not a better protein.** Every design here beats the native ubiquitin
sequence on energy by 30-plus units. The energy is the objective the sampler was given, and
optimising it harder is not evidence of anything experimental.

**Ensemble conditioning is a hypothesis about robustness, and this page measures it only in
the model's own units.** The published motivation is that ensemble-designed sequences are
more often predicted to fold back into the target. Testing that needs a structure predictor
and a fold-back comparison, which Caliby will run for you through its optional AF2
self-consistency path — and which is a separate question from everything measured here.
Deciding which of the resulting designs to actually order is separate again; the
`binder-design-filtering` skill is where that belongs.

## Try it

**Data.** Ubiquitin, PDB entry `1D3Z` — an NMR structure holding ten models of one
76-residue chain, 1.0 MB, from RCSB PDB, which releases its coordinate files into the public
domain under CC0 1.0. No account needed; confirmed reachable 29 Aug 2026. The `caliby`
checkpoint (45 MB) downloads itself from `ProteinDesignLab/caliby-weights` on first use,
Apache-2.0 and ungated.

**Run.** Cold in an empty directory — 97 s end to end with the package cache already warm,
of which about fifteen seconds is model work and the rest is the install. On a machine that
has never installed this before the install dominates completely; see the note above it.
Everything here is scoring, which is deterministic, so the numbers below are reproducible
rather than sampled. The block deliberately routes through the trap in *Four ways the
molecule you designed is not the molecule you handed it* — it scores the ten-model file as
handed over, and then the ten models split apart.

```bash
set -e
uv venv venv -p python3.12
VIRTUAL_ENV=venv uv pip install -q "git+https://github.com/ProteinDesignLab/caliby.git"

# -f matters: RCSB answers a missing entry with an HTML error page under a 404, and
# without -f curl writes that page into the file.
curl -fsSL -o 1D3Z.pdb https://files.rcsb.org/download/1D3Z.pdb

./venv/bin/python - <<'PY'
import statistics
from caliby import load_model

# Split the deposited NMR file into one file per model.
cur, n = [], 0
for line in open("1D3Z.pdb"):
    if line.startswith("MODEL"):
        cur = []
    elif line.startswith("ENDMDL"):
        n += 1
        open("model_%02d.pdb" % n, "w").writelines(cur + ["END\n"])
    elif line.startswith(("ATOM", "TER")):
        cur.append(line)
models = ["model_%02d.pdb" % i for i in range(1, n + 1)]
print("models in the deposited file :", n)

model = load_model("caliby")

whole = model.score(["1D3Z.pdb"], num_workers=0)
per = model.score(models, num_workers=0)
ens = model.score_ensemble({"ubq": models}, num_workers=0)

print("chains parsed                :", len(whole["seq"][0].split(":")))
print("residues parsed              :", len(whole["seq"][0]))
print("unresolved (X) in sequence   :", whole["seq"][0].count("X"))
print("native sequence              :", whole["seq"][0])
print("all ten models same sequence :", len(set(per["seq"])) == 1)
print("energy of the file as handed over : %.4f" % whole["U"][0])
print("energy of model 1 alone           : %.4f" % per["U"][0])
print("per-conformer energies, min / max : %.4f / %.4f" % (min(per["U"]), max(per["U"])))
print("mean over the ten conformers      : %.4f" % statistics.mean(per["U"]))
print("energy under ensemble conditioning: %.4f" % ens["U"][0])
print("ensemble minus mean               : %.2e" % (ens["U"][0] - statistics.mean(per["U"])))

# The whole file is model 1: the other nine are discarded without a word.
assert abs(whole["U"][0] - per["U"][0]) < 1e-4
# Ensemble conditioning averages the Potts parameters, and the energy is linear in them,
# so the ensemble energy of a fixed sequence IS the mean of the per-conformer energies.
assert abs(ens["U"][0] - statistics.mean(per["U"])) < 1e-3
# The conformers genuinely differ -- the equality above is not true because they are equal.
assert max(per["U"]) - min(per["U"]) > 1.0
# Unresolved residues are dropped rather than padded, so there is never an X.
assert "X" not in whole["seq"][0] and len(whole["seq"][0]) == 76
print("OK")
PY
```

**Expect.**

```text
models in the deposited file : 10
chains parsed                : 1
residues parsed              : 76
unresolved (X) in sequence   : 0
native sequence              : MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG
all ten models same sequence : True
energy of the file as handed over : -160.6865
energy of model 1 alone           : -160.6865
per-conformer energies, min / max : -162.5166 / -158.6933
mean over the ten conformers      : -160.5816
energy under ensemble conditioning: -160.5816
ensemble minus mean               : -1.22e-05
OK
```

*Invariants* — a failure here means this page is wrong, not that upstream moved:

- The ten-model file and its first model score identically. That is the trap: pointing
  Caliby at an NMR ensemble does not give you ensemble conditioning.
- The ensemble energy of a fixed sequence equals the mean of the per-conformer energies.
  This is the definition of what "ensemble-conditioned" does, and the assertion is what
  makes it a claim rather than a description.
- The ten conformers differ from one another by more than one energy unit, so the equality
  above is not trivially satisfied.
- The parsed sequence is 76 residues with no `X`. Caliby drops unresolved residues instead
  of padding them, which is why the count matches the observed residues and not the
  numbering span.

*Observed values*, caliby commit `41d3156`, `caliby` checkpoint, torch 2.13.0, arm64 CPU,
29 Aug 2026 — a mismatch is drift to investigate, not a bug. The energies are stable across
repeated runs on one machine because scoring involves no sampling, and may move in the last
decimal places on a different architecture; the assertions bracket them rather than pinning
them.

## Citing this

Shuai, R. W., Lu, T., Bhatti, S., Kouba, P. & Huang, P.-S. Ensemble-conditioned protein
sequence design with Caliby. *bioRxiv* (2025). doi:10.1101/2025.09.30.679633

For ensembles generated with partial diffusion, cite also Lu, T. *et al.* Conditional
protein structure generation with Protpardelle-1C. *bioRxiv* (2025).
doi:10.1101/2025.08.18.670959

Code and weights: https://github.com/ProteinDesignLab/caliby and
https://huggingface.co/ProteinDesignLab/caliby-weights
