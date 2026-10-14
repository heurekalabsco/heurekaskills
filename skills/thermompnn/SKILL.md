---
name: thermompnn
description: Predict ddG of folding for point mutants with ThermoMPNN — site-saturation scans on CPU from a PDB. Covers the sign convention, how output positions map back to residue numbers, and why scoring against the repo's own test files anticorrelates.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-stability, ddg, protein-design, thermompnn]
covers: [protein stability, thermostability, ddG, folding free energy, point mutant, missense, site-saturation mutagenesis, stabilizing mutation, destabilizing mutation, protein engineering, mutation effect prediction, megascale, barnase, inverse folding features]
datasets: [https://files.rcsb.org/download/1BNI.pdb, https://files.rcsb.org/download/2CI2.pdb]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-11
  against: ThermoMPNN at commit 370f76e (repository HEAD, pushed 2026-09-09) / weights models/thermoMPNN_default.pt shipped in-repo / torch 2.5.1, numpy 2.2.6, biopython 1.88, Python 3.10.20 / CPU only, 4 cores, linux x86_64 / structures from RCSB PDB
  executed: 11
  unverified: 0
---

# Predicting mutant stability with ThermoMPNN

ThermoMPNN answers one question: if you mutate this residue to that one, does the fold get
more or less stable? It is a graph neural network transfer-learned on frozen ProteinMPNN
features, so it reads backbone geometry and returns a predicted ddG in kcal/mol for every
point mutant you ask about.

Stability is the property that decides whether a designed or remodelled protein survives
expression and purification, and it is a different question from the ones the design tools
answer. `proteinmpnn` tells you what sequence fits a backbone; it does not tell you which
of those substitutions destabilises the fold. `binder-design-filtering` ranks interface
confidence, which is about the complex. This page is about the monomer's own fold.

Two things make it practical. The checkpoint is 39 MB and inference is CPU-only, so a full
site-saturation scan of a 200-residue chain finishes in well under a minute on a laptop.
And the weights ship inside the repository, so there is nothing to fetch from a model hub
and no credential anywhere in the workflow.

The part that costs people real experiments is not the model. It is that the output sign
convention is the opposite of the one used by the experimental data files shipped in the
same repository, and that the `position` column is not a residue number. Both are silent:
you get a well-formed CSV either way.

## What you need before you start

Nothing you have to apply for. ThermoMPNN is MIT licensed, the licence covers the
checkpoints committed to the repository, and there is no account, API key, token or GPU
anywhere in this page. Inference runs on CPU.

Two practical requirements:

- **Python 3.10.** The project declares `requires-python` as at least 3.10 and below 3.11.
  Everything here was verified on 3.10.20.
- **About 2.5 GB of disk** for the dependency tree, nearly all of it PyTorch, plus ~70 MB
  for the repository and its weights.

There is no official web API. A Colab notebook is linked from the repository README for
anyone who would rather not install it, and a third-party commercial endpoint exists that
this page deliberately does not route through, because its terms are not the project's.

## Install

Pin a commit rather than the tag. There is exactly one release tag, `v1.0.0`, dated
2023-11-13, and development continued for years past it — the commit below is repository
HEAD as verified, from 2026-09-09.

```bash
git clone https://github.com/Kuhlman-Lab/ThermoMPNN
cd ThermoMPNN
git checkout 370f76ec62bd929f7425e311d8df04a0d094990f
```

The repository's own instructions offer a `uv sync --extra cpu` route that resolves torch
from `download.pytorch.org`. That index was unreachable from the validating environment,
so everything below was verified with the dependency set installed from PyPI instead,
which works the same way and is what is documented here:

```bash
python3.10 -m venv .venv
. .venv/bin/activate
pip install torch==2.5.1 torchmetrics==1.9.0 pytorch-lightning==2.6.5 \
            biopython==1.88 tqdm==4.70.0 pandas==2.3.3 numpy==2.2.6 \
            omegaconf==2.3.1 joblib==1.6.0 wandb==0.30.0
```

`wandb` is in that list because it has to be. It is an experiment-logging service used
only during training, but `train_thermompnn.py` imports it at module scope and the
inference path imports from that module, so leaving it out fails with
`ModuleNotFoundError: No module named 'wandb'` before anything is scored. Nothing in this
page logs to or contacts that service.

On a PyPI install the linux torch wheel brings CUDA libraries with it even though
inference here is CPU-only. That is a disk cost, not a GPU requirement —
`torch.cuda.is_available()` returning `False` is the expected state, and the code selects
CPU on its own.

## Run a site-saturation scan

`analysis/custom_inference.py` is the ready-made path. It takes one PDB and one chain and
scores every substitution at every modelled position.

```bash
curl -sS -o 1bni.pdb https://files.rcsb.org/download/1BNI.pdb
python analysis/custom_inference.py --pdb 1bni.pdb --chain A --out_dir .
```

That writes `ThermoMPNN_inference_1bni.csv` and prints the same table. On 4 CPU cores
barnase (108 modelled residues, 2160 predictions) took about 14 s, and a 194-residue chain
took about 13 s — most of the wall clock is imports and loading the checkpoint, not the
scan, so runtime barely moves with protein size in this range.

`--model_path` can be left off. The script then looks for a checkpoint itself and resolves
to `models/thermoMPNN_default.pt`. One wrinkle if you ever train your own: the search puts
**any** `.ckpt` it finds in `models/` or `vanilla_model_weights/` ahead of that default, so
a stray training checkpoint in either directory silently becomes the model doing your
predictions. Pass `--model_path` explicitly if those directories are not pristine.

## Reading the output — the sign, and the alphabet

```python
import pandas as pd

df = pd.read_csv("ThermoMPNN_inference_1bni.csv", index_col=0)
df["ddG_pred"] = pd.to_numeric(df["ddG_pred"])

print(len(df), df["position"].nunique(), len(df) // df["position"].nunique())
synonymous = df[df.wildtype == df.mutation]
print(len(synonymous), synonymous.ddG_pred.abs().max())
```

```
2160 108 20
108 0.0
```

**Positive means destabilising.** Negative means the model expects the mutant to be more
stable than the wild type. This is worth stating flatly because it is inverted relative to
the common `ddG = dG_mut - dG_wt` convention, and inverted relative to the experimental
data files in this very repository (see the benchmarking section below). Three independent
checks agree on it:

```python
import pandas as pd

df = pd.read_csv("ThermoMPNN_inference_1bni.csv", index_col=0)
df["ddG_pred"] = pd.to_numeric(df["ddG_pred"])

nonsyn = df[df.wildtype != df.mutation]
means = nonsyn.groupby("mutation").ddG_pred.mean().sort_values()
print(means.tail(3).round(3).to_dict())
print(means.head(3).round(3).to_dict())
print(nonsyn.nlargest(1, "ddG_pred")[["position", "wildtype", "mutation", "ddG_pred"]].to_string(index=False))
```

```
{'G': 1.493, 'D': 1.628, 'P': 2.101}
{'C': 0.641, 'F': 0.752, 'L': 0.827}
 position wildtype mutation  ddG_pred
       85        I        Q  4.075784
```

Mutation to proline is the most destabilising substitution on average and mutation to
hydrophobics the least, which is the right way round only if positive is destabilising.
The single most extreme prediction is a buried isoleucine going to glutamine. And in
`datasets.py` the training loader reads its label column as `row.DDG * -1.`, so the model
was fit to the negation of the experimental sign.

**There are 20 rows per position, not 19.** The alphabet the scan iterates includes the
wild-type residue itself, so every position carries a wild-type-to-wild-type row. Those
come back as exactly `0.0` — which is a useful free assertion that the position and
wild-type bookkeeping lined up — but they are not predictions. Filter them out before you
count mutations, rank anything or average over a position, or every per-position statistic
is diluted by a zero that is not a measurement.

## The `position` column is not a residue number

This is the one that quietly ruins downstream work. `position` is an index into the chain's
numbering span, zero-based from the **lowest residue number present in the selected
chain**:

```
position = PDB residue number - lowest residue number in that chain
```

Barnase in 1BNI starts at residue 3, because the first two residues are not modelled. So
`position 0` is residue 3, and the Ile at `position 85` above is **Ile88** — a buried core
residue, which is why it dominates the scan. Read the column as a residue number and every
finding is off by three. In chymotrypsin inhibitor 2 the same arithmetic shifts by
nineteen.

Derive the mapping from the structure instead of assuming an offset:

```python
import pandas as pd
from Bio.PDB import PDBParser
from Bio.PDB.Polypeptide import protein_letters_3to1 as three_to_one

df = pd.read_csv("ThermoMPNN_inference_1bni.csv", index_col=0)
df["ddG_pred"] = pd.to_numeric(df["ddG_pred"])

chain = PDBParser(QUIET=True).get_structure("s", "1bni.pdb")[0]["A"]
residues = [r for r in chain if r.id[0] == " "]
lowest = min(r.id[1] for r in residues)
index_to_resnum = {r.id[1] - lowest: r.id[1] for r in residues}

df["resnum"] = df["position"].map(index_to_resnum)
wt_from_structure = {r.id[1] - lowest: three_to_one.get(r.get_resname(), "X") for r in residues}
print(all(wt_from_structure[p] == w for p, w in zip(df.position, df.wildtype)))
print(index_to_resnum[0], index_to_resnum[85])

real = df[df.wildtype != df.mutation].copy()
print(len(real), (real.ddG_pred < 0).sum())
print(real.nsmallest(5, "ddG_pred")[["resnum", "wildtype", "mutation", "ddG_pred"]].to_string(index=False))
```

```
True
3 88
2052 157
 resnum wildtype mutation  ddG_pred
     69        R        I -1.297870
     69        R        L -1.258683
     15        Q        I -1.206350
     69        R        V -1.203439
     15        Q        M -0.885549
```

Checking the wild-type letters against the structure, as that first line does, is the
cheapest guard available and it catches a wrong chain, a shifted mapping and a mismatched
file in one line. Do it every time.

Two reasons not to shortcut it with `position + lowest`. Gap positions keep their slots:
drop five residues out of the middle of a chain and the scan returns 103 positions still
numbered up to 107, with the five indices simply absent — so the index space tracks the
numbering span, not the residues that exist. And insertion codes have no index of their
own. The dictionary above is correct in both cases; the arithmetic is correct only for a
contiguously numbered chain.

## Ranking candidates

With the synonymous rows dropped and real residue numbers attached, the predicted
stabilising set is the bottom of the distribution:

157 of 2052 substitutions are predicted stabilising, and the top of that list is a pattern
to recognise rather than to order straight from: surface polar residues replaced by
hydrophobics. Those often do raise thermodynamic stability and are also how you get
aggregation and lost function, neither of which this model scores. ThermoMPNN predicts
folding stability, full stop — not solubility, not expression, not activity, not binding.
Arg69 and Gln15 are solvent-exposed positions on a ribonuclease; a stability model has no
way to know whether either matters catalytically.

Treat the ranking as a shortlist to filter with everything else you know, and trust the
destabilising end more than the stabilising end. Most mutations really are destabilising,
and that is what the training distribution is made of.

## Scoring a chosen set of mutations

`custom_inference.py` only does whole-chain saturation. When you have a specific list —
the twelve variants you can actually clone, or one position's worth of options — call the
model directly instead of scanning everything and filtering. Mutations are passed as
`Mutation` objects whose `position` is the **index**, not the residue number, so the
conversion has to happen on the way in:

```python
import os, torch
from omegaconf import OmegaConf
from Bio.PDB import PDBParser
from Bio.PDB.Polypeptide import protein_letters_3to1 as three_to_one
from datasets import Mutation
from train_thermompnn import TransferModelPL
from protein_mpnn_utils import alt_parse_PDB

cfg = OmegaConf.merge(OmegaConf.load("local.yaml"), OmegaConf.create({
    "training": {"num_workers": 1, "learn_rate": 0.001, "epochs": 100, "lr_schedule": True},
    "model": {"hidden_dims": [64, 32], "subtract_mut": True, "num_final_layers": 2,
              "freeze_weights": True, "load_pretrained": True, "lightattn": True,
              "lr_schedule": True}}))
cfg.platform.thermompnn_dir = os.getcwd()
model = TransferModelPL.load_from_checkpoint("models/thermoMPNN_default.pt", cfg=cfg).model.eval()

parsed = alt_parse_PDB("1bni.pdb", "A")
residues = [r for r in PDBParser(QUIET=True).get_structure("s", "1bni.pdb")[0]["A"] if r.id[0] == " "]
lowest = min(r.id[1] for r in residues)
wt = {r.id[1]: three_to_one.get(r.get_resname(), "X") for r in residues}

want = [(88, "Q"), (88, "K"), (69, "I"), (15, "I")]
muts = [Mutation(position=rn - lowest, wildtype=wt[rn], mutation=mt, ddG=None, pdb=parsed[0]["name"])
        for rn, mt in want]
with torch.no_grad():
    pred, _ = model(parsed, muts)
for (rn, mt), out in zip(want, pred):
    print("%s%d%s %+.4f" % (wt[rn], rn, mt, out["ddG"].item()))
```

```
I88Q +4.0758
I88K +4.0507
R69I -1.2979
Q15I -1.2063
```

Those are the same four numbers the full scan produced, which is the point — this is the
same model on the same features, just asked a narrower question. Run it from the
repository root, since the imports are plain module names rather than an installed
package. The `cfg` block is not optional decoration: those hyperparameters describe the
architecture the checkpoint was saved from, and the load fails without them.

## Chains, and what the model actually sees

`--chain` selects what gets parsed, and only the selected chain reaches the network. On a
complex that means you are scoring the isolated chain's own fold, not its stability in
context.

Several chains can be passed as one string. It works, and it is worth knowing exactly what
it does:

```bash
python analysis/custom_inference.py --pdb 1bni.pdb --chain AB --out_dir ./ab
```

1BNI holds three copies of barnase, so `--chain AB` returns 4320 rows over 216 positions.
Both chains are concatenated into **one** index space — positions 0-107 are chain A,
108-215 are chain B — and the `chain` column records the literal string `AB` on every row,
so nothing in the output tells you which chain a position belongs to. Chain A's own
predictions also move, by up to 0.20 kcal/mol here, because the neighbouring chain is now
part of the graph. Which chains you include is a modelling decision; make it deliberately,
and if you pass more than one, reconstruct the chain boundaries yourself from the residue
counts.

The default is `--chain A`, and it is a real default rather than a guess at the first
chain. Chymotrypsin inhibitor 2 is deposited as chain `I`, so the default fails on it and
`--chain I` is required.

## When it fails, it fails loudly

Both of the common mistakes raise and exit non-zero, which is the good news. The messages
just do not say what went wrong:

```bash
curl -sS -o 2ci2.pdb https://files.rcsb.org/download/2CI2.pdb
python analysis/custom_inference.py --pdb 2ci2.pdb --out_dir . ; echo "exit=$?"
```

```
ValueError: need at least one array to concatenate
exit=1
```

That is a chain-not-found error. The selected chain matched no `ATOM` records, the
coordinate list came back empty, and the failure surfaces from inside featurisation with
no mention of chains. A missing input file raises `FileNotFoundError` and also exits 1.
Nothing here fails silently or writes a partial CSV, so gating a batch job on the exit
status is safe — but when you see that `concatenate` message, check your chain ID first.

## Benchmarking against the shipped test sets

The repository ships experimental ddG data under `data_all/`, which is the obvious way to
sanity-check predictions, and doing it naively gives you an anticorrelation and the
impression that the model is broken. Those files use the opposite sign convention from the
model's output — negative is destabilising in the files, positive is destabilising in the
predictions.

`examples/2OCJ.pdb` is the p53 DNA-binding domain and `data_all/testing/myoglobin_clean.csv`
carries its measured values, so the two can be joined directly:

```python
import subprocess, pandas as pd, numpy as np
from Bio.PDB import PDBParser

subprocess.run(["python", "analysis/custom_inference.py", "--pdb", "examples/2OCJ.pdb",
                "--chain", "A", "--out_dir", "."], check=True, capture_output=True)

pred = pd.read_csv("ThermoMPNN_inference_2OCJ.csv", index_col=0)
pred["ddG_pred"] = pd.to_numeric(pred["ddG_pred"])

exp = pd.read_csv("data_all/testing/myoglobin_clean.csv")
exp.columns = [c.lstrip("#") for c in exp.columns]
exp = exp[exp.PDB == "2OCJA"].copy()

residues = [r for r in PDBParser(QUIET=True).get_structure("s", "examples/2OCJ.pdb")[0]["A"] if r.id[0] == " "]
lowest = min(r.id[1] for r in residues)
exp["position"] = exp.MUT.str[1:-1].astype(int) - lowest
exp["wt"], exp["mut"] = exp.MUT.str[0], exp.MUT.str[-1]

j = exp.merge(pred, left_on=["position", "wt", "mut"], right_on=["position", "wildtype", "mutation"])
r = np.corrcoef(j.DDG, j.ddG_pred)[0, 1]
print(len(j), round(r, 4), round(-r, 4))
```

```
42 -0.7511 0.7511
```

Negate one side and ThermoMPNN recovers r = 0.75 against experiment on those 42 mutants.
The raw join gives -0.75. If you are scoring the model against any external ddG table,
establish which convention that table uses before reading anything into the number — a
sign error and a broken model look identical, and only one of them is likely.

Note also that these are the paper's own published test sets. A correlation computed on
them tells you the model reproduces its reported behaviour; it is not held-out performance
for your target, and nothing here measures that.

## Try it

**Data.** Barnase, RCSB PDB entry `1BNI`, chain A — 108 modelled residues numbered 3-110.
A public, anonymous ~260 kB download from the RCSB, no licence to accept and no account.
Confirmed reachable 2026-10-11. The model weights come from the repository clone and need
no separate fetch.

**Run.** In an empty directory, with Python 3.10 on the path. This provisions everything it
uses, scores all 2160 substitutions through the model directly, and checks the result:

```bash
set -e
git clone --quiet https://github.com/Kuhlman-Lab/ThermoMPNN
cd ThermoMPNN
git checkout --quiet 370f76ec62bd929f7425e311d8df04a0d094990f
python3.10 -m venv .venv
. .venv/bin/activate
pip install --quiet torch==2.5.1 torchmetrics==1.9.0 pytorch-lightning==2.6.5 \
            biopython==1.88 tqdm==4.70.0 pandas==2.3.3 numpy==2.2.6 \
            omegaconf==2.3.1 joblib==1.6.0 wandb==0.30.0
curl -sS -o 1bni.pdb https://files.rcsb.org/download/1BNI.pdb
python - <<'CHECK'
import os, torch
from omegaconf import OmegaConf
from Bio.PDB import PDBParser
from Bio.PDB.Polypeptide import protein_letters_3to1 as three_to_one
from datasets import Mutation
from train_thermompnn import TransferModelPL
from protein_mpnn_utils import alt_parse_PDB

ALPHABET = "ACDEFGHIKLMNPQRSTVWY"

cfg = OmegaConf.merge(OmegaConf.load("local.yaml"), OmegaConf.create({
    "training": {"num_workers": 1, "learn_rate": 0.001, "epochs": 100, "lr_schedule": True},
    "model": {"hidden_dims": [64, 32], "subtract_mut": True, "num_final_layers": 2,
              "freeze_weights": True, "load_pretrained": True, "lightattn": True,
              "lr_schedule": True}}))
cfg.platform.thermompnn_dir = os.getcwd()
model = TransferModelPL.load_from_checkpoint("models/thermoMPNN_default.pt", cfg=cfg).model.eval()

parsed = alt_parse_PDB("1bni.pdb", "A")
residues = [r for r in PDBParser(QUIET=True).get_structure("s", "1bni.pdb")[0]["A"] if r.id[0] == " "]
lowest = min(r.id[1] for r in residues)
wt = {r.id[1]: three_to_one.get(r.get_resname(), "X") for r in residues}

muts, keys = [], []
for rn in sorted(wt):
    for mt in ALPHABET:
        muts.append(Mutation(position=rn - lowest, wildtype=wt[rn], mutation=mt,
                             ddG=None, pdb=parsed[0]["name"]))
        keys.append((rn, wt[rn], mt))
with torch.no_grad():
    pred, _ = model(parsed, muts)
ddg = {k: p["ddG"].item() for k, p in zip(keys, pred)}
real = {k: v for k, v in ddg.items() if k[1] != k[2]}
mean_to = lambda m: sum(v for k, v in real.items() if k[2] == m) / sum(1 for k in real if k[2] == m)

# invariants — properties of the method and the file; a failure here is a real problem
assert len(ddg) == 20 * len(wt), "20 scores per position, wild type included"
assert all(ddg[(rn, w, w)] == 0.0 for rn, w in wt.items()), "wild-type-to-wild-type must be exactly zero"
assert all(three_to_one.get(r.get_resname(), "X") == wt[r.id[1]] for r in residues), "wild-type letters must match the structure"
assert lowest == 3 and len(wt) == 108, "1BNI chain A is 108 residues numbered from 3"
assert mean_to("P") > mean_to("L"), "positive ddG must mean destabilising"
assert mean_to("P") == max(mean_to(m) for m in ALPHABET), "proline most destabilising on average"

# observed values — ThermoMPNN 370f76e, recorded 2026-10-11; drift, not failure, if these move
worst, best = max(real, key=real.get), min(real, key=real.get)
assert worst == (88, "I", "Q") and abs(real[worst] - 4.0758) < 2e-3
assert best == (69, "R", "I") and abs(real[best] + 1.2979) < 2e-3
assert sum(1 for v in real.values() if v < 0) == 157

print("scores", len(ddg), "| positions", len(wt), "| per position", len(ddg) // len(wt))
print("mean ddG to P %.4f  to L %.4f" % (mean_to("P"), mean_to("L")))
print("most destabilising %s%d%s %+.4f" % (worst[1], worst[0], worst[2], real[worst]))
print("most stabilising   %s%d%s %+.4f" % (best[1], best[0], best[2], real[best]))
print("predicted stabilising", sum(1 for v in real.values() if v < 0), "of", len(real))
print("OK")
CHECK
```

**Expect.** Every assertion passes and the block prints:

```
scores 2160 | positions 108 | per position 20
mean ddG to P 2.1005  to L 0.8266
most destabilising I88Q +4.0758
most stabilising   R69I -1.2979
predicted stabilising 157 of 2052
OK
```

The assertions are split deliberately. The invariants — 20 scores per position, every
wild-type-to-wild-type score exactly zero, wild-type letters matching the structure,
residue 3 as the first position, proline the most destabilising substitution on average —
are properties of the method and hold across releases, so a failure there means something
is genuinely wrong. The observed values below them are dated to ThermoMPNN at commit
370f76e on 2026-10-11; if those move while the invariants hold, the model or the structure
changed and the numbers need re-recording, not the skill rewriting.
