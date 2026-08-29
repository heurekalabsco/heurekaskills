---
name: rosetta-foundry
description: Design proteins with RFdiffusion3 and predict structures with RoseTTAFold3 from the Rosetta Commons Foundry package — install, the checkpoint registry, the two incompatible input grammars, shipped defaults that contradict the documentation, and how to read RF3 confidence including a field that does not hold what its name says. Running either model needs a GPU.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-design, structure-prediction, protein-structure, plddt, pae]
platform: foundry
datasets: [https://files.ipd.uw.edu/pub/rfd3/rfd3_foundry_2025_12_01_remapped.ckpt, https://raw.githubusercontent.com/RosettaCommons/foundry/production/models/rf3/tests/data/inference_regression_tests/5vht_from_file/5vht_from_file_summary_confidences.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: rc-foundry 0.2.0 (PyPI) / atomworks 2.2.1 / torch 2.13.0 / biotite 1.4.0 / Python 3.12.8 on macOS arm64, Apple M1 Max, MPS available and CUDA absent / checkpoint registry and all eight weight URLs probed 2026-08-28 / RCSB entries 1UBQ, 1BRS, 6VXX, 2R5Z, 1MG5, 7V11, 1BNA, 1Q75
  executed: 11
  unverified: 3
  unverified_reason: >-
    The three unexecuted blocks fetch the large checkpoints and run the two models against
    them, so all three need several gigabytes of weights on disk. The weights host
    files.ipd.uw.edu served this machine at roughly 18 kB/s on one connection and about
    250 kB/s across twenty-four, against roughly 900 kB/s to RCSB and GitHub from the
    same host at the same time, so the 2.5 GB RFdiffusion3 checkpoint did not finish
    inside the verification window. Both CLIs were driven as far as the checkpoint-loading
    step, and the 6.4 MB ProteinMPNN checkpoint was installed and discovered to prove the
    install path itself. Re-run the three blocks on a host with usable throughput to
    files.ipd.uw.edu, or from the project's Docker image, which ships the weights inside it.
---

# Designing and predicting with Foundry — RFdiffusion3 and RoseTTAFold3

Foundry is one Python distribution from the Institute for Protein Design that carries
several separate models. Two of them are the ends of the same loop:

- **RFdiffusion3 (`rfd3`)** generates structures. It is an all-atom diffusion model, so
  it designs against ligands, nucleic acids and metals rather than only protein backbones.
- **RoseTTAFold3 (`rf3`)** predicts structures. It is an all-atom co-folding predictor in
  the AlphaFold 3 family, used to check whether a designed sequence folds the way it was
  meant to.

They ship in one package, install with one command, share one checkpoint registry, and are
covered here together because most of what goes wrong is shared and the rest is the ways
they differ from each other. Those differences are the expensive part: the same idea
carries a different key name, the same key carries the opposite default, and the same JSON
file is invalid for the other model.

The package also carries `rfd3na` (nucleic-acid design, same family as RFdiffusion3) and
`mpnn`. Foundry's `mpnn` is a re-implementation of ProteinMPNN and LigandMPNN inside this
codebase, not the original release — the `proteinmpnn` skill documents that original,
which runs on a laptop CPU and is the better tool when inverse folding is all you need.
Once you have designs and have to decide which to order, `binder-design-filtering` is the
skill for that; nothing here ranks designs. For an unrelated open AlphaFold 3
reproduction, `protenix` is a second predictor worth comparing against, and its input
grammar is a useful contrast with RF3's.

## What you need before you run anything

State of the requirements as of 28 Aug 2026, against `rc-foundry` 0.2.0.

| requirement | detail |
|---|---|
| **A GPU** | CUDA, Intel XPU or Apple MPS. Both models are diffusion networks with hundreds of denoising steps over an all-atom representation. The CPU branch exists and is not a path — the accelerator selector logs an error and falls back to it. |
| **Python 3.12 exactly** | The released wheel declares `>=3.12,<3.13`. 3.11 and 3.13 will not resolve. |
| **~16 GB of disk** | 13.5 GB for all eight checkpoints, plus the package and its dependency tree. |
| **Patience for the weights** | See below — the download is the slowest part of this by a wide margin. |
| Optional — HBPLUS | Only for hydrogen-bond conditioning in RFdiffusion3. Free, installed separately. |

No account, no API key, no application, no click-through. The checkpoints are plain HTTPS
objects on a public host.

**Apple Silicon works, and the README understates it.** The project README presents MPS
support as living in a community fork. The released `rc-foundry` 0.2.0 on PyPI already
carries it — the accelerator selector picks `mps` and forces float32, and both models carry
MPS-specific code paths for the kernels Metal does not implement. `pip install
"rc-foundry[all]"` resolves and installs on macOS arm64 unchanged, because the only
Linux-only dependencies are the `rf3` extra's CUDA kernels and their markers skip them.
Inference only; there is no multi-GPU training on MPS.

### Licence — the code and the weights are not the same question

**The code is unambiguous.** `RosettaCommons/foundry` carries a `LICENSE.md` that is stock
BSD-3-Clause, "Copyright (c) 2025, Institute for Protein Design, University of Washington".
The published wheel repeats it and classifies as `License :: OSI Approved :: BSD License`.
`atomworks`, the structure-handling library every model here depends on, is BSD-3-Clause
from the same group. Commercial use is fine.

**The weights are not covered by a statement of their own.** The checkpoints are not in the
repository; they are downloaded from `files.ipd.uw.edu` by a CLI in the repository, and
`LICENSE.md` grants rights over "the software" in source and binary form without mentioning
model parameters. Three things bear on it, and they are worth keeping apart:

- The project's Docker overview, which is the channel that actually redistributes the
  weights inside an image, says: *"Foundry is fully open-source under a BSD-3-Clause
  License"*.
- IPD's own release announcement says *"Training code and model weights for RFdiffusion3
  are available on GitHub through the Rosetta Commons Foundry"* and states no terms.
- The download is ungated. No account, no acceptance step, no terms page in front of it.

Compare what the older `RosettaCommons/RFdiffusion` does, which is to say it in the LICENSE:
*"This copyright and license covers both the source code and model weights referenced for
download in the README file."* Foundry has no equivalent sentence. Nothing restricts use and
nothing gates access, so this is a disclosure rather than a blocker — but if you are about to
build a product on the outputs, that missing sentence is the thing to get in writing from IPD
rather than to infer from the repository licence.

**And do not generalise across the organisation.** `RosettaCommons` publishes both, and the
answers are opposite:

| | licence | commercial use |
|---|---|---|
| `foundry`, `atomworks` | BSD-3-Clause | fine |
| `RFdiffusion`, `RFdiffusion2` | BSD, and RFdiffusion's LICENSE covers its weights explicitly | fine |
| core **Rosetta**, **PyRosetta** | not OSI-licensed | needs a paid University of Washington licence |

`pyrosetta` is not on public PyPI at all, and `pyrosetta-installer` publishes under
`Rosetta Software License`. Confirming BSD-3-Clause here and carrying it across to PyRosetta
gets the answer backwards, and that mistake has a cost — PyRosetta sits under several
standard binder-design builds.

### Which RFdiffusion should you use

RFdiffusion3 is the current model and the one to reach for. It is all-atom, so a ligand,
a nucleic acid or a metal is part of the design problem rather than something bolted on
afterwards; the older RFdiffusion is protein-backbone-only with a separate all-atom
variant. Use the original `RosettaCommons/RFdiffusion` only when you are reproducing
published work that used it, or when you specifically need its explicit weights licence.

## Install

Give it its own virtualenv. The dependency tree pins `biotite` and pulls a full torch,
lightning and rdkit stack, and it will fight anything else in the environment.

```bash
python3.12 -m venv .venv && . .venv/bin/activate
pip install --upgrade pip
pip install "rc-foundry[all]"
```

The `[all]` extra is `rfd3` + `rfd3na` + `rf3`. The `rf3` extra is three cuEquivariance
CUDA packages carrying `sys_platform == 'linux'` markers, so on macOS it resolves to
nothing and the install succeeds anyway. Nothing here builds from source on a current
index — every dependency has a wheel — so no compiler is needed, which is unusual for a
tree this size and worth knowing before you provision a build image.

Then confirm what you actually got, and which device you are about to run on:

```python
import platform, sys, torch
from importlib.metadata import version

if torch.cuda.is_available():
    device, note = "cuda", torch.cuda.get_device_name(0)
elif torch.backends.mps.is_available():
    device, note = "mps", "Apple Metal - float32 only, inference only, no multi-GPU"
elif hasattr(torch, "xpu") and torch.xpu.is_available():
    device, note = "xpu", "Intel"
else:
    device, note = "cpu", "no accelerator - inference is impractically slow here"

print("python     :", sys.version.split()[0], "on", platform.machine())
print("rc-foundry :", version("rc-foundry"))
print("atomworks  :", version("atomworks"))
print("torch      :", torch.__version__)
print("device     :", device, "-", note)
```

Observed 2026-08-28:

```
python     : 3.12.8 on arm64
rc-foundry : 0.2.0
atomworks  : 2.2.1
torch      : 2.13.0
device     : mps - Apple Metal - float32 only, inference only, no multi-GPU
```

Two pieces of noise you will see and can ignore. Importing anything that touches
`atomworks` prints a block about `CCD_MIRROR_PATH` and `PDB_MIRROR_PATH` not being set —
those are only needed for training against a local PDB mirror. And composing a config
prints `UserWarning: provider=hydra.searchpath ... is not available`, because the shipped
configs list search paths that only exist in a git checkout.

**The wheel ships code and configs and no example data.** 132 config YAMLs, zero example
JSONs, zero structures, zero MSAs. Both model READMEs open with a quickstart that points at
`models/rfd3/docs/examples/demo.json` or `models/rf3/tests/data/5vht_from_json.json`, and
neither file exists after a `pip install`. Clone the repository if you want them, or write
your own input — the sections below do the latter.

## Weights

```bash
foundry list-available
```

```
Available models:

  rfd3na   - RFdiffusion3NA checkpoint
  rfd3     - RFdiffusion3 checkpoint
  rf3      - latest RF3 checkpoint trained with data until 1/2024 (expect best 
performance)
  proteinmpnn - ProteinMPNN checkpoint
  ligandmpnn - LigandMPNN checkpoint
  rf3_preprint_921 - RF3 preprint checkpoint trained with data until 9/2021
  rf3_preprint_124 - RF3 preprint checkpoint trained with data until 1/2024
  solublempnn - SolubleMPNN checkpoint
```

`base-models` expands to `rfd3 rfd3na proteinmpnn ligandmpnn rf3` — five of the eight, and
one more than the README's "latest RFD3, RF3 and MPNN variants" suggests. `all` takes
everything, which adds two more RF3 checkpoints and SolubleMPNN.

**`--checkpoint-dir` does not persist unless a `.env` file already exists.** The README says
the flag "sets `FOUNDRY_CHECKPOINT_DIRS`"; it writes that key through `python-dotenv`, which
is a no-op when there is no `.env` to write to, and the next command then searches only
`~/.foundry/checkpoints` and fails with `Invalid checkpoint: rfd3`. Export the variable
yourself and it is honoured:

```bash
export FOUNDRY_CHECKPOINT_DIRS=$PWD/checkpoints
foundry install proteinmpnn --checkpoint-dir "$FOUNDRY_CHECKPOINT_DIRS"  # 6 MB, a dry run
foundry install rfd3 rf3    --checkpoint-dir "$FOUNDRY_CHECKPOINT_DIRS"  # 5.3 GB, see below
foundry list-installed
```

Not executed to completion here. The 6.4 MB ProteinMPNN install ran and `list-installed`
found it; the two large checkpoints did not finish inside the verification window, for the
throughput reason set out below. Take the small one first whatever your connection — it
exercises the whole path (registry lookup, download, destination, discovery) for six
megabytes instead of five gigabytes.

Check what is fetchable and how big it is before committing to the download:

```python
import urllib.error, urllib.request
from foundry.inference_engines.checkpoint_registry import REGISTERED_CHECKPOINTS

def probe(url, timeout=60):
    req = urllib.request.Request(url, method="HEAD",
                                 headers={"User-Agent": "foundry-skill-check"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, int(r.headers.get("Content-Length") or 0)
    except urllib.error.HTTPError as e:
        return e.code, 0
    except Exception as e:
        return type(e).__name__, 0

total = 0
print(f"{'name':18} {'status':>6} {'size':>9}  hash published?")
for name, info in REGISTERED_CHECKPOINTS.items():
    code, size = probe(info.url)
    if code == 200:
        total += size
    print(f"{name:18} {str(code):>6} {size/2**30:8.2f}G  {info.sha256 is not None}")

print(f"\n{len(REGISTERED_CHECKPOINTS)} checkpoints, {total/2**30:.1f} GB for all of them")
print("published sha256 count:",
      sum(1 for i in REGISTERED_CHECKPOINTS.values() if i.sha256 is not None))
```

Observed 2026-08-28:

```
name               status      size  hash published?
rfd3na                200     2.51G  False
rfd3                  200     2.51G  False
rf3                   200     2.83G  False
proteinmpnn           200     0.01G  False
ligandmpnn            200     0.01G  False
rf3_preprint_921      200     2.83G  False
rf3_preprint_124      200     2.83G  False
solublempnn           200     0.01G  False

8 checkpoints, 13.5 GB for all of them
published sha256 count: 0
```

Two things that table settles.

**Nothing is gated.** All eight answer 200 to an anonymous request.

**The integrity check never runs.** The downloader has a SHA-256 verification path and
prints `✓ Hash verification passed` when it fires, but no registered checkpoint carries a
hash, so `verify_hash` is `None` for every one of them and the hasher is never constructed.
A truncated or substituted 2.5 GB checkpoint is not detected at download time — it surfaces
later as a load failure, or does not surface at all. Record the size and your own hash after
the first successful download if you care about reproducing a run later.

**Budget hours for this, not minutes.** On 2026-08-28 `files.ipd.uw.edu` served this host at
roughly 18 kB/s on a single connection and about 250 kB/s across twenty-four parallel ranged
requests, while RCSB and GitHub served the same host at roughly 900 kB/s at the same time.
That is one measurement from one network path and yours may differ entirely — but check
your throughput on the 6.4 MB ProteinMPNN checkpoint before starting a 2.5 GB one, and
consider the project's Docker image, whose default tag ships the weights inside it. This is
an observed value, not a property of the software.

### Which RF3 checkpoint

Three are RF3, and which one you take changes the answer:

| name | training cutoff | when |
|---|---|---|
| `rf3` | 01/2024 | Default. The current model, with fixes made after the preprint. |
| `rf3_preprint_124` | 01/2024 | Reproducing the preprint's numbers. |
| `rf3_preprint_921` | 09/2021 | Benchmarking against models cut at the same date, AlphaFold 2 and 3 included. |

`base-models` gives you only `rf3`. A target whose experimental structure predates the
cutoff is recall, not prediction — benchmark on `rf3_preprint_921` if that distinction
matters to your claim. The inference API is identical across all three.

The model READMEs also give `wget` URLs for non-`_remapped` files, which exist on the host
and are not what `foundry install` fetches. Take the registry's names; the remapped files
are the ones whose parameter keys match this release's loader.

## The shipped defaults are not the documented defaults

Both models are driven by Hydra, so arguments are `key=value` and not `--key value`, and
what a flag defaults to is whatever the packaged YAML composes to. Two of RF3's documented
defaults are wrong in the direction that changes results, and several keys mean different
things across the two models. Compose the configs the way the CLI does and read them off:

```python
from pathlib import Path
import rf3, rfd3
from hydra import compose, initialize_config_dir

def effective(pkg, engine):
    """Compose the shipped inference config exactly as the CLI does."""
    with initialize_config_dir(config_dir=str(Path(pkg.__file__).parent / "configs"),
                               version_base="1.3"):
        return compose(config_name="inference", overrides=[f"inference_engine={engine}"])

rf3_cfg, rfd3_cfg = effective(rf3, "rf3"), effective(rfd3, "rfdiffusion3")

DOCUMENTED = [
    ("rf3",  "num_steps",                      rf3_cfg.num_steps,                     200),
    ("rf3",  "annotate_b_factor_with_plddt",   rf3_cfg.annotate_b_factor_with_plddt,  False),
    ("rf3",  "n_recycles",                     rf3_cfg.n_recycles,                    10),
    ("rf3",  "diffusion_batch_size",           rf3_cfg.diffusion_batch_size,          5),
    ("rf3",  "early_stopping_plddt_threshold", rf3_cfg.early_stopping_plddt_threshold, 0.5),
    ("rfd3", "diffusion_batch_size",           rfd3_cfg.diffusion_batch_size,         8),
    ("rfd3", "inference_sampler.num_timesteps", rfd3_cfg.inference_sampler.num_timesteps, 200),
    ("rfd3", "skip_existing",                  rfd3_cfg.skip_existing,                True),
    ("rfd3", "prevalidate_inputs",             rfd3_cfg.prevalidate_inputs,           False),
]
print(f"{'model':5} {'key':32} {'shipped':>9} {'documented':>11}")
for model, key, shipped, documented in DOCUMENTED:
    flag = "" if shipped == documented else "   <-- docs disagree"
    print(f"{model:5} {key:32} {str(shipped):>9} {str(documented):>11}{flag}")

print("\nsame-named keys that differ between the two models:")
for key in sorted(set(rf3_cfg.keys()) & set(rfd3_cfg.keys())):
    a, b = rf3_cfg.get(key), rfd3_cfg.get(key)
    if key not in ("_target_", "inputs", "out_dir", "ckpt_path") and a != b:
        print(f"  {key:24} rf3={a!s:8} rfd3={b!s}")
print("  recycles                 rf3=%s  rfd3=inference_sampler.%s"
      % ([k for k in rf3_cfg if "recycl" in k][0],
         [k for k in rfd3_cfg.inference_sampler if "recycl" in k][0]))
```

Observed 2026-08-28 against `rc-foundry` 0.2.0:

```
model key                                shipped  documented
rf3   num_steps                               50         200   <-- docs disagree
rf3   annotate_b_factor_with_plddt          True       False   <-- docs disagree
rf3   n_recycles                              10          10
rf3   diffusion_batch_size                     5           5
rf3   early_stopping_plddt_threshold         0.5         0.5
rfd3  diffusion_batch_size                     8           8
rfd3  inference_sampler.num_timesteps        200         200
rfd3  skip_existing                         True        True
rfd3  prevalidate_inputs                   False       False

same-named keys that differ between the two models:
  diffusion_batch_size     rf3=5        rfd3=8
  skip_existing            rf3=False    rfd3=True
  recycles                 rf3=n_recycles  rfd3=inference_sampler.n_recycle
```

What to take from it:

- **`num_steps` is 50, not the documented 200.** The README says 200 is the standard and
  that 50 costs nothing measurable — but the shipped default is already 50, so a run you
  believed was at the standard setting was at the fast one. Pass `num_steps=200` explicitly
  if you are comparing against published numbers.
- **`annotate_b_factor_with_plddt` is True, not the documented False**, which is the more
  dangerous direction: the B-factor column of an RF3 output *does* carry pLDDT and the
  documentation tells you it does not. It also silently forces `one_model_per_file=True`,
  because biotite cannot vary B-factors across models in one file — so the output layout
  changes with it.
- **`skip_existing` defaults the opposite way in the two models.** Re-running RFdiffusion3
  into a directory that already has output quietly designs nothing; re-running RoseTTAFold3
  overwrites. Set it explicitly in a pipeline.
- **`n_recycles` for RF3, `inference_sampler.n_recycle` for RFdiffusion3.** Singular against
  plural, top level against nested. A typo'd key is not silently ignored — Hydra rejects it —
  but it is a routine irritation when moving between the two.
- **`ckpt_path` defaults to a registry name**, `rf3` or `rfd3`, resolved against the
  checkpoint search path. The RF3 README describes the default as a symlink under
  `/net/software`, which is an IPD-internal path and not what the released config does.

**A key that is not already in the config needs a `+`.** RFdiffusion3's own documentation
offers `rfd3 design inputs=null specification.length=200` as a quick smoke test. It fails —
`specification` is an empty mapping in the shipped config, so adding a child to it is an
append, and Hydra raises `ConfigCompositionException: Could not override
'specification.length'`. The working form is `+specification.length=200`.

## RFdiffusion3 — describing a design

One JSON or YAML file describes a batch of designs. **The top level is a mapping keyed by
design name**, and each value is one independent job. This is not the same shape as
RoseTTAFold3's input, which is a list — the two files are not interchangeable and neither
model gives a useful error when handed the other's.

The constraints are expressed with two small languages. A **contig string** lays out the
chain: `A40-60` takes residues 40 to 60 of chain A from the input structure, a bare `70`
means design exactly 70 new residues, `50-70` means design a uniformly random length in
that range, and `/0` is a chain break. An **InputSelection** picks atoms, and accepts a
boolean, a contig string, or a mapping from residue ranges to atom names with the
shorthands `ALL`, `BKBN` and `TIP`.

The model's own parser is a Pydantic model that imports without weights, so a specification
can be checked on any machine before it reaches a GPU:

```python
import json, urllib.request
from pydantic import ValidationError
from rfd3.inference.input_parsing import DesignInputSpecification as Spec

# A real, public target: ubiquitin, 76 residues, chain A.
urllib.request.urlretrieve("https://files.rcsb.org/download/1UBQ.pdb", "1UBQ.pdb")

jobs = {
    # top level is a DICT keyed by design name -- one key, one independent job
    "monomer_60": {
        "length": "60-80",
        "is_non_loopy": True,
    },
    "ubiquitin_binder": {
        "input": "1UBQ.pdb",
        # designed segment, chain break, then the target taken from the input
        "contig": "50-70,/0,A1-76",
        "select_hotspots": {"A8": "CD1,CD2", "A44": "CG2,CD1", "A70": "CG1,CG2"},
        "infer_ori_strategy": "hotspots",
        "is_non_loopy": True,
    },
    "ubiquitin_motif_scaffold": {
        "input": "1UBQ.pdb",
        # scaffold the 42-49 loop into a new 90-110 residue protein
        "contig": "30-50,A42-49,30-50",
        "length": "90-110",
        "select_fixed_atoms": {"A42-49": "BKBN"},
    },
}
json.dump(jobs, open("designs.json", "w"), indent=2)

for name, doc in jobs.items():
    print(f"{name:26} valid   ({Spec(**doc).length!r} length spec)")

BAD = {
    "unknown key (typo)":        {"length": "60", "lenght": "70"},
    "hotspot on a missing chain": {"input": "1UBQ.pdb", "contig": "50,/0,A1-76",
                                   "select_hotspots": {"Z8": "CB"}},
    "contig past the last residue": {"input": "1UBQ.pdb", "contig": "A1-200"},
    "atom that is not in the residue": {"input": "1UBQ.pdb", "contig": "A1-76",
                                        "select_fixed_atoms": {"A1": "CZ3"}},
}
print()
for label, doc in BAD.items():
    try:
        Spec(**doc)
        print(f"{label:32} ACCEPTED -- not caught before the GPU")
    except ValidationError as e:
        print(f"{label:32} rejected: {e.errors()[0]['msg'][:64]}")
    except Exception as e:
        print(f"{label:32} rejected: {type(e).__name__}: {str(e)[:56]}")
```

Observed 2026-08-28:

```
monomer_60                 valid   ('60-80' length spec)
ubiquitin_binder           valid   (None length spec)
ubiquitin_motif_scaffold   valid   ('90-110' length spec)

unknown key (typo)               rejected: Extra inputs are not permitted
hotspot on a missing chain       rejected: Value error, [component=Z8] Residue Z8 not found in atom array.
contig past the last residue     rejected: Value error, [component=A77] Residue A77 not found in atom array
atom that is not in the residue  rejected: Value error, Could not find requested atoms 'CZ3' in atom array.
```

That establishes four things.

- **Constructing the specification reads the structure file.** Validation is not syntactic:
  it opens `input`, resolves every selection against the real atoms, and fails on a residue
  or atom that is not there. That is why hotspot atom names have to be right for the actual
  residue — `A8` in ubiquitin is a leucine, so `CD1,CD2` resolves and `CG2` does not. The
  same machinery runs under `prevalidate_inputs=True`, which is off by default and worth
  turning on for any batch you are about to spend GPU hours on.
- **Unknown keys are rejected**, so a typo costs you a message rather than a silently
  different design.
- **`length` accepts an int or a `"min-max"` string** and is coerced to a string either way,
  so the `"length": 100` in the project's own symmetry examples is fine.
- **A binder job has no `length`.** With a contig that already fixes the target chain, the
  designed segment's length comes from the contig's range.

Run against every design specification the project ships — 19 of them across six example
files, covering enzyme active sites, small-molecule and nucleic-acid binders, protein
binders with hotspots, partial diffusion and C/D symmetry — this parser accepts all 19 and
rejects none. It is a real gate, not a formality.

### Running a design

```bash
export FOUNDRY_CHECKPOINT_DIRS=$PWD/checkpoints
rfd3 design \
  out_dir=./designs_out \
  inputs=designs.json \
  n_batches=1 \
  diffusion_batch_size=8 \
  inference_sampler.num_timesteps=200 \
  prevalidate_inputs=True \
  skip_existing=False
```

Not executed here — the checkpoint did not finish downloading in the verification window,
for the reason under Weights above. Everything up to the checkpoint-loading step was
executed, and the failure at that step is the assertion `Invalid checkpoint: rfd3`.

`n_batches × diffusion_batch_size` designs come out per key in the input file, named
`{inputfile}_{key}_{batch}_{model}.cif.gz`, each with a sibling `.json` holding the
specification that produced it and the contig that was actually sampled — which is the
thing to keep, because a `50-70` contig picks a different length every time. Costs scale
with `num_timesteps` and, superlinearly, with the token count. Those are orders of
magnitude and not measurements; no timing in this skill was measured, because no model was
run on the validating host.

Three knobs that matter more than the rest. `inference_sampler.step_scale` (1.5) trades
diversity for designability, higher being less diverse and more designable.
`inference_sampler.gamma_0` (0.6) does the same in the other direction, lower being more
designable and less diverse. `low_memory_mode=True` switches to a memory-efficient
tokenisation when a large system will not fit.

**The B-factor column of an RFdiffusion3 output is not pLDDT.** It carries the sequence
head's per-token confidence, and the project's own guidance is that it "usually doesn't
mean anything" beyond flagging a design that has drifted far out of distribution. This is
the opposite convention from RF3's output in the same package, where the same column does
carry pLDDT by default. Never read a B-factor from this package without knowing which model
wrote the file.

## RoseTTAFold3 — describing a prediction

RF3's input is **a list of jobs**, each with a `name` and a list of `components`. A
component is a polymer given as `seq`, a small molecule given as `ccd_code`, `smiles` or a
`path` to an SDF or CIF, and an optional `chain_id` and `msa_path`. Covalent links go in a
job-level `bonds` list as `chain/res_name/res_id/atom_name` pairs.

```python
import json
from rf3.utils.inference import InferenceInput

# RF3's top level is a LIST of jobs; each job is {name, components[, bonds]}.
# (RFdiffusion3's is a DICT keyed by design name. They are not interchangeable.)
jobs = [
    {
        "name": "ubiquitin_with_zinc",
        "components": [
            {"seq": "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG",
             "chain_id": "A"},
            {"ccd_code": "ZN"},                      # from the wwPDB CCD
            {"smiles": "CC(=O)Oc1ccccc1C(=O)O"},     # aspirin, atoms named automatically
        ],
    }
]
json.dump(jobs, open("fold.json", "w"), indent=2)

for job in jobs:
    inp = InferenceInput.from_json_dict(job)
    aa = inp.atom_array
    chains = sorted({str(c) for c in aa.chain_id})
    print(f"{job['name']}")
    print(f"  components  : {len(job['components'])}")
    print(f"  chains      : {chains}  (unnamed components got ids automatically)")
    print(f"  atoms       : {len(aa)}")
    for c in chains:
        m = aa.chain_id == c
        print(f"    chain {c}: {m.sum():4d} atoms, "
              f"{len(set(aa.res_id[m])):3d} residues, "
              f"res_name[0]={aa.res_name[m][0]}")
```

Observed 2026-08-28:

```
ubiquitin_with_zinc
  components  : 3
  chains      : ['A', 'B', 'C']  (unnamed components got ids automatically)
  atoms       : 1257
    chain A: 1243 atoms,  76 residues, res_name[0]=MET
    chain B:    1 atoms,   1 residues, res_name[0]=ZN
    chain C:   13 atoms,   1 residues, res_name[0]=L:0
```

A SMILES component is given the residue name `L:0` — the `L:` prefix is reserved precisely
so a custom molecule can never collide with a CCD code. If you need to write a bond to it,
that is the name to use, and the CIF-supplied case is 0-indexed while a CCD component is
1-indexed. Where the molecule is in the CCD, give the code: the project's own ordering of
accuracy is CCD first, then a CIF or SDF file, then SMILES last.

### The polymer type is inferred from the sequence, and it gets it wrong

There is no `dnaSequence` or `rnaSequence` field. Everything polymeric goes through `seq`,
and the type is guessed by counting how many of the letters are valid in each alphabet.
Protein wins only if it *strictly* outscores both nucleic alphabets — and A, C, G, T and U
are all valid amino-acid codes too, so any peptide written only in those letters loses.

```python
from rf3.utils.inference import InferenceInput

def polymer_of(component):
    """What RF3 actually builds from one `components` entry."""
    aa = InferenceInput.from_json_dict(
        {"name": "probe", "components": [component]}).atom_array
    names = list(dict.fromkeys(str(n) for n in aa.res_name))
    if all(len(n) == 2 and n.startswith("D") for n in names):
        return "DNA"
    if all(len(n) == 1 for n in names):
        return "RNA"
    return "protein"

print("inferred from the sequence alphabet, with no type given:")
for seq in ["MQIFVKTLTGKTITLEVE", "GATTACAW", "GATTACA", "ACGT", "CAT", "AAAA", "GAUUACA"]:
    print(f"  seq={seq!r:22} -> {polymer_of({'seq': seq, 'chain_id': 'A'})}")

print("\nsame sequences with chain_type stated explicitly:")
for seq, ct in [("AAAA", "polypeptide(L)"), ("GATTACA", "polypeptide(L)"),
                ("GATTACA", "polydeoxyribonucleotide"), ("GAUUACA", "polyribonucleotide")]:
    got = polymer_of({"seq": seq, "chain_id": "A", "chain_type": ct})
    print(f"  seq={seq!r:12} chain_type={ct:26} -> {got}")

assert polymer_of({"seq": "AAAA", "chain_id": "A"}) == "RNA"
assert polymer_of({"seq": "AAAA", "chain_id": "A",
                   "chain_type": "polypeptide(L)"}) == "protein"
print("\na tetra-alanine peptide written as AAAA is modelled as RNA unless you say otherwise")
```

Observed 2026-08-28:

```
inferred from the sequence alphabet, with no type given:
  seq='MQIFVKTLTGKTITLEVE'   -> protein
  seq='GATTACAW'             -> protein
  seq='GATTACA'              -> DNA
  seq='ACGT'                 -> DNA
  seq='CAT'                  -> DNA
  seq='AAAA'                 -> RNA
  seq='GAUUACA'              -> RNA

same sequences with chain_type stated explicitly:
  seq='AAAA'       chain_type=polypeptide(L)             -> protein
  seq='GATTACA'    chain_type=polypeptide(L)             -> protein
  seq='GATTACA'    chain_type=polydeoxyribonucleotide    -> DNA
  seq='GAUUACA'    chain_type=polyribonucleotide         -> RNA

a tetra-alanine peptide written as AAAA is modelled as RNA unless you say otherwise
```

A poly-alanine peptide becomes RNA. A `CAT` or `TAG` tripeptide becomes DNA. Adding one
letter outside the nucleotide alphabet flips it back — `GATTACAW` is a peptide because of
the tryptophan. Nothing warns you; the job runs and predicts a different molecule.

**`chain_type` is the fix, and it is not in the README.** It takes the mmCIF `entity_poly`
vocabulary — `polypeptide(L)`, `polydeoxyribonucleotide`, `polyribonucleotide` — and an
unrecognised value is rejected rather than ignored. State it on every short polymer, on
every peptide, and on every nucleic acid whose alphabet does not settle the question.
Anything longer than about twenty residues of ordinary protein infers correctly, which is
exactly why this bites on the short cases nobody checks.

The one-letter escape for a non-canonical residue is a parenthesised CCD code inside an
otherwise-normal sequence — `MTG(PTM)…`. It does not work as a way of writing a whole
nucleic acid: `(DG)(DA)(DT)…` with no bare letters raises `Could not infer chain type from
sequence`, because there is nothing to count.

### MSAs, and the run that produces no structure

RF3 takes `.a3m` or `.fasta` per chain via `msa_path`, or as `_msa_paths_by_chain_id`
records inside an input CIF. It does not search for you and does not accept pre-paired
MSAs — it pairs on the fly. `raise_if_missing_msa_for_protein_of_length_n=10` turns a
silently missing MSA into an error for any protein of at least that length, which is the
flag to set in a pipeline.

**Without an MSA, the default run often writes no structure at all.** `early_stopping_plddt_threshold`
is 0.5, evaluated on the mean all-atom pLDDT after one recycle, and pLDDT here runs 0 to 1,
so that threshold is the middle of the range rather than a formality. When it trips there is
no `.cif.gz` — only a `.score` file with `early_stopped: True` and the pLDDT that caused it.
The project reports this saves 10–20× on obviously bad inputs. Set
`early_stopping_plddt_threshold=0.0` when you want the structure regardless.

```bash
export FOUNDRY_CHECKPOINT_DIRS=$PWD/checkpoints
rf3 fold \
  inputs=fold.json \
  out_dir=./fold_out \
  ckpt_path=rf3 \
  n_recycles=10 \
  num_steps=200 \
  diffusion_batch_size=5 \
  early_stopping_plddt_threshold=0.0 \
  annotate_b_factor_with_plddt=True
```

Not executed here, for the same checkpoint-download reason as the design command above.

Outputs land as `{name}_model.cif.gz` for the top-ranked structure, `{name}_confidences.csv`,
`{name}_ranking_scores.csv`, `{name}_summary_confidences.json`, and `seed-N_sample-M/`
directories for the rest. The CIF holds **all five diffusion samples as separate models in
one file** unless `one_model_per_file=True` — which `annotate_b_factor_with_plddt=True` sets
for you, so turning on pLDDT annotation also changes the file layout. PyMOL hides secondary
structure for multi-model files; `dss` brings it back.

The shipped example inputs use two different path conventions, which is worth knowing
before you copy one. RFdiffusion3's examples reference `../input_pdbs/…`, relative to the
examples directory. RF3's reference `models/rf3/docs/examples/…`, relative to the repository
root. Three of RF3's six shipped example jobs fail to build from anywhere else, and all six
build from the repository root. Since the wheel ships neither set, use absolute paths in
anything you write yourself.

## Reading RF3's confidence output, and the field that is misnamed

```python
import json, urllib.request
from rf3.inference_engines.rf3 import compute_ranking_score

URL = ("https://raw.githubusercontent.com/RosettaCommons/foundry/production/models/rf3/"
       "tests/data/inference_regression_tests/5vht_from_file/"
       "5vht_from_file_summary_confidences.json")
s = json.load(urllib.request.urlopen(URL, timeout=60))

print("fields in *_summary_confidences.json:")
for k, v in s.items():
    print(f"  {k:20} {v}")

# 1. the scale. pLDDT bins run 0..1 (50 bins, max_value 1.0), not 0..100.
print(f"\noverall_plddt = {s['overall_plddt']} -- on 0-1, so the AlphaFold bands are /100")
assert 0.0 <= s["overall_plddt"] <= 1.0

# 2. chain_ptm is not pTM. It is the per-chain mean pLDDT.
mean_chain_ptm = sum(s["chain_ptm"]) / len(s["chain_ptm"])
print(f"chain_ptm     = {s['chain_ptm']}, mean {mean_chain_ptm:.4f}")
print(f"overall_plddt = {s['overall_plddt']}   <- the same number")
print(f"ptm           = {s['ptm']:.4f}   <- not that number")
assert abs(mean_chain_ptm - s["overall_plddt"]) < 0.01
assert abs(mean_chain_ptm - s["ptm"]) > 0.05

# 3. chain_pair matrices are upper-triangular with nulls elsewhere.
m = s["chain_pair_pae"]
print(f"\nchain_pair_pae = {m}")
print(f"  [0][1] = {m[0][1]}   [1][0] = {m[1][0]}   diagonal = {m[0][0]}")
assert m[1][0] is None and m[0][0] is None

# 4. ranking_score, from RF3's own function.
print("\nranking_score = 0.8*ipTM + 0.2*pTM - 100*has_clash, ipTM falling back to pTM")
print(f"{'case':34} {'ipTM':>6} {'pTM':>6} {'clash':>6} {'ranking':>9}")
for label, iptm, ptm, clash in [
    ("the 5vht dimer above",       s["iptm"], s["ptm"], s["has_clash"]),
    ("monomer (ipTM is None)",     None,      0.91,     False),
    ("monomer, poor",              None,      0.35,     False),
    ("dimer, no interface",        0.10,      0.91,     False),
    ("dimer, good but clashing",   0.90,      0.90,     True),
]:
    r = compute_ranking_score(iptm, ptm, clash)
    print(f"{label:34} {str(iptm)[:6]:>6} {ptm:6.2f} {str(clash):>6} {r:9.3f}")

assert abs(compute_ranking_score(s["iptm"], s["ptm"], s["has_clash"])
           - s["ranking_score"]) < 5e-4
assert abs(compute_ranking_score(None, 0.91, False) - 0.91) < 1e-9
```

Observed 2026-08-28, against the prediction of PDB 5VHT that the project commits as a
regression fixture:

```
fields in *_summary_confidences.json:
  chain_ptm            [0.85, 0.84]
  chain_pair_pae_min   [[None, 0.72], [None, None]]
  chain_pair_pde_min   [[None, 0.29], [None, None]]
  chain_pair_pae       [[None, 4.86], [None, None]]
  chain_pair_pde       [[None, 0.86], [None, None]]
  overall_plddt        0.8449
  overall_pde          0.809
  overall_pae          4.5743
  ptm                  0.9105080962181091
  iptm                 0.9110991358757019
  has_clash            False
  ranking_score        0.911

overall_plddt = 0.8449 -- on 0-1, so the AlphaFold bands are /100
chain_ptm     = [0.85, 0.84], mean 0.8450
overall_plddt = 0.8449   <- the same number
ptm           = 0.9105   <- not that number

chain_pair_pae = [[None, 4.86], [None, None]]
  [0][1] = 4.86   [1][0] = None   diagonal = None

ranking_score = 0.8*ipTM + 0.2*pTM - 100*has_clash, ipTM falling back to pTM
case                                 ipTM    pTM  clash   ranking
the 5vht dimer above               0.9110   0.91  False     0.911
monomer (ipTM is None)               None   0.91  False     0.910
monomer, poor                        None   0.35  False     0.350
dimer, no interface                   0.1   0.91  False     0.262
dimer, good but clashing              0.9   0.90   True   -99.100
```

Five things to carry away.

- **`chain_ptm` is not pTM. It holds the per-chain mean pLDDT.** The summary builder fills
  that key from the chain-level pLDDT dictionary, and the chain-level PAE it computes
  alongside is never written out at all. The check above is the proof rather than the
  claim: the mean of `chain_ptm` reproduces `overall_plddt` to four decimals and misses
  `ptm` by 0.065. Anyone reading `chain_ptm` as a per-chain fold-confidence score is
  reading a different quantity, and it is systematically lower.
- **pLDDT runs 0 to 1 here, not 0 to 100.** The confidence head has 50 bins over
  `max_value: 1.0`. The AlphaFold reading conventions all divide by 100 — above 0.90 both
  backbone and side chains are reliable, 0.70–0.90 the backbone is, 0.50–0.70 is a
  hypothesis, below 0.50 is not structure. This also explains
  `early_stopping_plddt_threshold=0.5`, which is the middle of the scale and not a
  near-zero floor.
- **`overall_pae` and `overall_pde` are in ångström**, from 64 bins over 32 Å, and lower is
  better — the opposite direction to every other number in the file.
- **The `chain_pair_*` matrices are upper-triangular with `null` everywhere else**,
  diagonal included. `m[i][j]` for `j > i` is a number; `m[j][i]` and `m[i][i]` are `None`.
  Iterate both orders and take whichever is not `None`, or a symmetric read silently drops
  half your interfaces.
- **`ranking_score` handles a monomer correctly**, which is not universal among AlphaFold 3
  reproductions: `iptm` comes through as `None` for a single chain and the formula
  substitutes pTM for it, so a monomer scores on its own merits instead of collapsing to a
  fifth of pTM. Comparing `ranking_score` across jobs with different chain counts is still
  a bad idea, but it is not arithmetically doomed the way it is elsewhere. A clash costs 100
  points, so the score is bimodal and distances across that gap mean nothing.

## Is the structure chemically sane, or only parseable

A generated backbone can load, render and still be nonsense. Check the bonds. This
distinguishes a bad backbone from a merely discontinuous one, which is the distinction that
decides whether you have a bug or a gap:

```python
import numpy as np
from atomworks.io import parse

# Backbone bond geometry. Two of these are inside a residue and always real; two span
# residues and can legitimately be absent (a chain break) or short (a cis peptide bond).
INTRA = {"N-CA": (1.458, 0.06), "CA-C": (1.525, 0.08)}
INTER = {"C-N": (1.329, 0.10), "CA-CA": (3.80, 0.25)}
CIS_CA_CA = (2.90, 0.25)     # a cis peptide bond, not an error
BREAK = {"C-N": 2.0, "CA-CA": 4.5}   # beyond this the chain is simply not continuous

def backbone_geometry(path):
    """Distinguish a chemically implausible backbone from a discontinuous one."""
    aa = parse(path)["assemblies"]["1"][0]
    aa = aa[np.isin(aa.atom_name, ["N", "CA", "C"]) & (aa.hetero == False)]
    bad, cis, breaks, n = [], 0, 0, 0
    for chain in sorted(set(aa.chain_id)):
        c = aa[aa.chain_id == chain]
        res = sorted(set(c.res_id))
        get = lambda r, a: c.coord[(c.res_id == r) & (c.atom_name == a)]
        for i, r in enumerate(res):
            for bond, (ideal, tol) in INTRA.items():
                a, b = (get(r, x) for x in bond.split("-"))
                if len(a) and len(b):
                    n += 1
                    d = float(np.linalg.norm(a[0] - b[0]))
                    if abs(d - ideal) > tol:
                        bad.append((str(chain), int(r), bond, round(d, 2)))
            if i + 1 >= len(res) or res[i + 1] != r + 1:
                continue
            for bond, (ideal, tol) in INTER.items():
                x, y = bond.split("-")
                a, b = get(r, x), get(res[i + 1], y)
                if not (len(a) and len(b)):
                    continue
                n += 1
                d = float(np.linalg.norm(a[0] - b[0]))
                if d > BREAK[bond]:
                    breaks += bond == "CA-CA"
                elif bond == "CA-CA" and abs(d - CIS_CA_CA[0]) <= CIS_CA_CA[1]:
                    cis += 1
                elif abs(d - ideal) > tol:
                    bad.append((str(chain), int(r), bond, round(d, 2)))
    return {"bonds": n, "bad": bad, "cis_peptides": cis, "chain_breaks": breaks}

r = backbone_geometry("1UBQ.pdb")
print(f"1UBQ, 1.8 A crystal structure: {r['bonds']} bonds, {len(r['bad'])} implausible, "
      f"{r['cis_peptides']} cis peptides, {r['chain_breaks']} chain breaks")

# Break it, so the check is shown to be able to fail.
with open("1UBQ_broken.pdb", "w") as fh:
    for ln in open("1UBQ.pdb"):
        if ln.startswith("ATOM") and ln[22:26].strip() == "40" and ln[12:16].strip() == "CA":
            ln = ln[:30] + f"{float(ln[30:38]) + 1.0:8.3f}" + ln[38:]
        fh.write(ln)
r2 = backbone_geometry("1UBQ_broken.pdb")
print(f"the same file with one CA moved 1 A: {len(r2['bad'])} implausible bonds")
for row in r2["bad"]:
    print("   ", row)

assert len(r["bad"]) == 0
assert len(r2["bad"]) > 0
```

Observed 2026-08-28:

```
1UBQ, 1.8 A crystal structure: 302 bonds, 0 implausible, 0 cis peptides, 0 chain breaks
the same file with one CA moved 1 A: 2 implausible bonds
    ('A', 40, 'N-CA', 1.36)
    ('A', 40, 'CA-C', 2.49)
```

**The cis-peptide and chain-break carve-outs are not decoration; a simpler version of this
check is wrong.** Applied to eight structures spanning a 76-residue monomer, a six-chain
complex, a cryo-EM trimer, protein–DNA, an enzyme with a cofactor, a membrane receptor and
two nucleic-acid-only entries, a naive "consecutive residue numbers are bonded, 3.8 Å
apart" rule flagged real depositions as broken: barstar's cis-proline gives three CA–CA
distances near 2.9 Å, and 2R5Z carries an unmodelled gap whose residues are numbered
consecutively and sit 5.4 Å apart. With those separated out, seven of the eight come back
clean. The eighth, 1MG5, keeps two genuinely long peptide bonds at 1.50 and 1.54 Å in the
deposited coordinates — which is the check doing its job, not a false positive.

Run this on RFdiffusion3 output before anything downstream. A design whose backbone is not
chemically plausible will still be sequenced by an inverse-folding model and still be
predicted by RF3, and both will hand back numbers.

## Limits

- **Confidence is not accuracy.** RF3 reports its own view of a prediction. A confidently
  wrong interface is an ordinary outcome for a complex with no homologue in training.
- **A diffusion batch is not an ensemble.** Eight RFdiffusion3 designs or five RF3 samples
  are draws, not a conformational landscape, and their spread is not a free energy.
- **RF3's inference API is explicitly unstable.** Its README says input formats and
  confidence outputs are still being cleaned up. Pin `rc-foundry` and re-read this section
  after an upgrade.
- **RFdiffusion3 cannot be steered by secondary structure.** `is_non_loopy: true` biases
  towards fewer loops and more helices, and that is the whole of the control.
- **Partial diffusion's `partial_t` is a noise level in ångström, not a step count.** It is
  strongly non-linear; start near 2 Å and work up.
- **No affinity prediction anywhere in this package.** RF3 returns a pose and confidence.
- **`ranking_score` is a within-job key.** Ranking designs against each other across jobs
  needs the interface-aware measures that `binder-design-filtering` covers.
- **Training cutoffs decide what "prediction" means.** `rf3` is cut at 01/2024; predicting
  something deposited before that is recall.

## Try it

A cold check that this page still holds — the weights are still fetchable, the confidence
field is still misnamed, and the two input grammars are still different shapes. Standard
library only, no install, no GPU, seconds.

**Data.** Two public artefacts, both reachable without an account and last confirmed
2026-08-28:

    https://files.ipd.uw.edu/pub/rfd3/rfd3_foundry_2025_12_01_remapped.ckpt
    https://raw.githubusercontent.com/RosettaCommons/foundry/production/models/rf3/tests/data/inference_regression_tests/5vht_from_file/5vht_from_file_summary_confidences.json

The first is the RFdiffusion3 checkpoint, probed rather than downloaded — it is 2.5 GB. The
second is the confidence output of an RF3 prediction of PDB 5VHT that the project commits
as a regression fixture; it is a real model output, under the repository's BSD-3-Clause
terms, and it is what makes the `chain_ptm` claim checkable without running anything.

```python
import json, urllib.error, urllib.request

IPD = "https://files.ipd.uw.edu/pub"
CHECKPOINTS = {                      # the registry `foundry list-available` prints
    "rfd3":             f"{IPD}/rfd3/rfd3_foundry_2025_12_01_remapped.ckpt",
    "rfd3na":           f"{IPD}/rfdiffusion3na/rfd3na-1190.ckpt",
    "rf3":              f"{IPD}/rf3/rf3_foundry_01_24_latest_remapped.ckpt",
    "rf3_preprint_124": f"{IPD}/rf3/rf3_foundry_01_24_preprint_remapped.ckpt",
    "rf3_preprint_921": f"{IPD}/rf3/rf3_foundry_09_21_preprint_remapped.ckpt",
    "proteinmpnn":      f"{IPD}/ligandmpnn/proteinmpnn_v_48_020.pt",
    "ligandmpnn":       f"{IPD}/ligandmpnn/ligandmpnn_v_32_010_25.pt",
    "solublempnn":      f"{IPD}/ligandmpnn/solublempnn_v_48_020.pt",
}

def probe(url):
    req = urllib.request.Request(url, method="HEAD",
                                 headers={"User-Agent": "foundry-skill-check"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, int(r.headers.get("Content-Length") or 0)
    except urllib.error.HTTPError as e:
        return e.code, 0
    except Exception as e:
        return type(e).__name__, 0

total = 0
for name, url in CHECKPOINTS.items():
    code, size = probe(url)
    total += size if code == 200 else 0
    print(f"{name:18} {str(code):>5} {size / 2**30:6.2f} GB")
print(f"{'':18} {'':>5} {total / 2**30:6.2f} GB total, ungated\n")

# --- the field that does not mean what it is named -------------------------------
URL = ("https://raw.githubusercontent.com/RosettaCommons/foundry/production/models/rf3/"
       "tests/data/inference_regression_tests/5vht_from_file/"
       "5vht_from_file_summary_confidences.json")
s = json.load(urllib.request.urlopen(URL, timeout=90))

chain_mean = sum(s["chain_ptm"]) / len(s["chain_ptm"])
print(f"chain_ptm      {s['chain_ptm']}  mean {chain_mean:.4f}")
print(f"overall_plddt  {s['overall_plddt']}          <- chain_ptm is per-chain pLDDT")
print(f"ptm            {s['ptm']:.4f}         <- and not this")
print(f"chain_pair_pae {s['chain_pair_pae']}  <- upper triangle only, None elsewhere")

ranking = 0.8 * s["iptm"] + 0.2 * s["ptm"] - 100 * int(s["has_clash"])
print(f"ranking_score  {s['ranking_score']} recomputed {ranking:.3f}")

# --- the two input grammars are not interchangeable -------------------------------
rfd3_job = {"binder": {"length": "60-80", "is_non_loopy": True}}          # dict of specs
rf3_job = [{"name": "peptide",                                            # list of jobs
            "components": [{"seq": "AAAA", "chain_id": "A",
                            "chain_type": "polypeptide(L)"}]}]
json.dump(rfd3_job, open("designs.json", "w"), indent=2)
json.dump(rf3_job, open("fold.json", "w"), indent=2)
print(f"\nrfd3 inputs -> {type(json.load(open('designs.json'))).__name__}"
      f", keys are design names: {list(rfd3_job)}")
print(f"rf3  inputs -> {type(json.load(open('fold.json'))).__name__}"
      f", each item carries name+components")

assert probe(CHECKPOINTS["rfd3"])[0] == 200, "the RFdiffusion3 checkpoint is gone"
assert probe(CHECKPOINTS["rf3"])[0] == 200, "the RoseTTAFold3 checkpoint is gone"
assert 0.0 <= s["overall_plddt"] <= 1.0, "RF3 pLDDT is on 0-1, not 0-100"
assert abs(chain_mean - s["overall_plddt"]) < 0.01, "chain_ptm is no longer pLDDT"
assert abs(chain_mean - s["ptm"]) > 0.05, "chain_ptm now tracks pTM"
assert s["chain_pair_pae"][1][0] is None and s["chain_pair_pae"][0][0] is None
assert abs(ranking - s["ranking_score"]) < 5e-4
assert isinstance(rfd3_job, dict) and isinstance(rf3_job, list)
print("\nall assertions passed")
```

**Expect**

Invariants — these hold across releases, and a failure means this page is wrong:

- Every registered checkpoint answers 200 to an anonymous `HEAD`. The two asserts cover
  `rfd3` and `rf3`; if either starts refusing, the models are no longer obtainable and that
  needs a human decision rather than a patch.
- `overall_plddt` lies in 0–1. If it ever exceeds 1, the scale changed and every threshold
  on this page is off by a factor of 100.
- The mean of `chain_ptm` equals `overall_plddt` and differs from `ptm`. **If this assert
  starts failing, that is good news**: it means `chain_ptm` was fixed to carry pTM, and the
  confidence section above needs rewriting.
- `chain_pair_*[j][i]` and `chain_pair_*[i][i]` are `None` for `j > i`.
- `ranking_score` reproduces `0.8·ipTM + 0.2·pTM − 100·has_clash`.
- An RFdiffusion3 input file is a mapping and an RF3 input file is a list. Neither model
  accepts the other's shape.

Observed 2026-08-28 — sizes move when checkpoints are rebuilt, so a mismatch there is drift
to investigate rather than a failure:

```
rfd3                 200   2.51 GB
rfd3na               200   2.51 GB
rf3                  200   2.83 GB
rf3_preprint_124     200   2.83 GB
rf3_preprint_921     200   2.83 GB
proteinmpnn          200   0.01 GB
ligandmpnn           200   0.01 GB
solublempnn          200   0.01 GB
                          13.52 GB total, ungated

chain_ptm      [0.85, 0.84]  mean 0.8450
overall_plddt  0.8449          <- chain_ptm is per-chain pLDDT
ptm            0.9105         <- and not this
chain_pair_pae [[None, 4.86], [None, None]]  <- upper triangle only, None elsewhere
ranking_score  0.911 recomputed 0.911

rfd3 inputs -> dict, keys are design names: ['binder']
rf3  inputs -> list, each item carries name+components

all assertions passed
```

## Sources

- Foundry — https://github.com/RosettaCommons/foundry
- AtomWorks, the structure layer both models are built on — https://github.com/RosettaCommons/atomworks
- RFdiffusion3 input specification — https://rosettacommons.github.io/foundry/models/rfd3/input.html
- RoseTTAFold3 inference guide — https://rosettacommons.github.io/foundry/models/rf3/index.html
- Butcher, J. et al. (2025) *De novo design of all-atom biomolecular interactions with RFdiffusion3*, bioRxiv — https://doi.org/10.1101/2025.09.18.676967
- Corley, N. et al. (2025) *Accelerating biomolecular modeling with AtomWorks and RF3*, bioRxiv — https://doi.org/10.1101/2025.08.14.670328
- RFdiffusion3 release announcement — https://www.ipd.uw.edu/2025/12/rfdiffusion3-now-available/
- Abramson, J. et al. (2024) *Nature* 630, 493–500 — the AlphaFold 3 architecture RF3 is measured against — https://doi.org/10.1038/s41586-024-07487-w

Foundry's source is BSD-3-Clause, Institute for Protein Design, University of Washington.
The trained checkpoints carry no licence statement of their own; see the licence section
above for exactly what is and is not stated about them. Chemical component definitions come
from the wwPDB CCD, under its own terms.
