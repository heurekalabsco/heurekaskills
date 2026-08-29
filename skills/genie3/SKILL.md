---
name: genie3
description: Generate de novo protein backbones with Genie 3, the SE(3)-equivariant diffusion model from the AlQuraishi lab — unconditional folds, motif scaffolding and target-conditioned binders, on a laptop CPU with no GPU. Covers what the written PDB really contains (a Cα trace, not the all-atom structure the name implies) and the geometry checks that catch a silently exploded sample.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-design, protein-structure, generative-models, genie3]
datasets: [https://huggingface.co/yeqinglin/genie3/resolve/main/pretrained/v1/config.yaml, https://huggingface.co/yeqinglin/genie3/resolve/main/pretrained/v1/checkpoints/step%3D600000.ckpt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: genie3 at commit d77ae5a (repository HEAD, last pushed 2026-05-10) installed from source / pretrained v1 checkpoint step=600000 from HuggingFace yeqinglin/genie3 / torch 2.7.1, lightning 2.6.5, numpy 2.5.2, ml-collections 1.1.0, biopython 1.85, Python 3.12.8 / CPU only on arm64 macOS with no CUDA device / MotifBench 22_1BCF and BinderBench 01_bhrf1 as shipped in the repository / code and weight licences re-checked 2026-08-28
  executed: 12
  unverified: 0
---

# Generating protein backbones with Genie 3

**Two unrelated models released in 2026 are called Genie 3.** This page is about the
protein one — `aqlaboratory/genie3`, a diffusion model that samples protein structures,
from Mohammed AlQuraishi's laboratory. The other Genie 3 is a video and world model from a
different organisation, and shares nothing with this but the name. Nothing below applies
to it.

Genie 3 turns a specification into three-dimensional protein coordinates. It does not
produce a sequence you could order, and it says nothing about whether the thing it drew
will fold or bind. It is the first step of a pipeline, and this page is about that step.

Three modes, all from one checkpoint:

| mode | you supply | you get back |
|---|---|---|
| unconditional | a length, or a range of lengths | a monomer backbone per sample |
| motif scaffolding | a motif structure and a segment layout | a backbone holding that motif in place |
| binder design | a target structure and interface residues | a binder chain posed against the target |

The reason to reach for it over the alternatives is cost. It is an equivariant network
rather than a general-purpose transformer stack, and a 50-residue monomer samples in well
under a minute on a laptop CPU — no GPU anywhere in the generation path. That matters more
than it sounds: most tools in this class cannot be tried at all without renting a card
first.

## What a reader must obtain

Nothing gated, and no account.

- **Code** — `https://github.com/aqlaboratory/genie3`. Its `LICENSE` is the stock Apache
  License 2.0 text, and the GitHub licence API reports `Apache-2.0`. Confirmed
  28 Aug 2026.
- **Weights** — HuggingFace `yeqinglin/genie3`, model card `license: apache-2.0`, and the
  API reports `gated: false`. Anonymous HTTP download: no token, no request form, no
  click-through. The current checkpoint (`pretrained/v1`) is 347 MB; the legacy Genie 2
  checkpoint beside it is 189 MB.

**Code and weights are licensed separately, and both are Apache-2.0.** Worth stating,
because it is not the norm in this field, and because it makes commercial use of a
generated backbone a non-question.

**One boundary, stated before you install anything.** The repository ships an evaluation
pipeline as well as the generator, and this page documents the generator. The upstream
`scripts/setup/setup.sh` additionally installs ColabFold and its AlphaFold2 parameters,
ESMFold, FoldSeek (GPL-3.0), a DSSP binary and TMscore built from source pulled off a lab
web page. None of that is needed to generate a backbone, none of it is installed by the
steps below, and its terms are its own rather than Genie 3's — read them before you build
that half.

## The shipped CLI is GPU-only. The model is not.

`genie3 generate` builds its PyTorch Lightning trainer with `accelerator="gpu"` hardcoded,
in the generation path and the training path both. On a machine with no CUDA device it
fails while constructing the trainer, before the checkpoint is read, and no flag changes
it. The exact error depends on what else the machine has — on Apple silicon Lightning
selects MPS and then rejects the DDP strategy; on a CPU-only Linux box it reports that the
GPU accelerator cannot run on your system.

The model underneath is device-agnostic. The sampler branches on
`self.device.type == "cuda"` only to save and restore RNG state, and the checkpoint loader
already maps to CPU. So everything below drives the model directly rather than through the
CLI. It is a dozen lines, and it gives you the device back.

## Install

Python 3.10 or newer. Clone the repository rather than installing from the git URL: the
motif and binder sections use structure files that live in the repository and not in the
wheel.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
git clone --depth 1 https://github.com/aqlaboratory/genie3.git
.venv/bin/python -m pip install ./genie3
```

That pulls `torch==2.7.1` (pinned by the package), `lightning`, `numpy`, `scipy`,
`pandas`, `biopython<1.86`, `ml-collections`, `zstandard`, `huggingface_hub`, `wandb` and
`tensorboard`. All are permissive and none needs CUDA. On a laptop it takes a few minutes,
most of it the torch wheel. There is no `genie3` package on PyPI — the repository is the
only install route.

## Get the weights

```bash
mkdir -p genie3/pretrained/v1/checkpoints
curl -sSL -o genie3/pretrained/v1/config.yaml \
  https://huggingface.co/yeqinglin/genie3/resolve/main/pretrained/v1/config.yaml
curl -sSL -o "genie3/pretrained/v1/checkpoints/step=600000.ckpt" \
  https://huggingface.co/yeqinglin/genie3/resolve/main/pretrained/v1/checkpoints/step%3D600000.ckpt
ls -l genie3/pretrained/v1/checkpoints/
```

The `=` in the filename has to be percent-encoded in the URL and left literal on disk —
the model config refers to it by that exact name. Upstream's `scripts/setup/download.sh`
does the same through `huggingface_hub`; two `curl`s skip the dependency and take the
347 MB checkpoint without the training-data manifests.

## Generating a backbone

Genie 3 reads one experiment YAML. Write it:

```bash
cat > genie3/unconditional.yaml <<'YAML'
experiment:
  name: first_backbone
  seed: 0

paths:
  rootdir: out/first

generation:
  dataset:
    source: unconditional
    min_length: 50
    max_length: 50
    length_step: 50
    n_sample: 1
  sampler:
    sampler:
      direction_scale: 0.8
YAML
```

`generation.base` is omitted on purpose: it defaults to `pretrained/v1/config.yaml` and
`pretrained/v1/checkpoints/step=600000.ckpt`, resolved against the working directory.
That is why the weights went inside the clone and why everything below runs from there.

The driver that replaces the GPU-only CLI:

```bash
cat > genie3/genie3_cpu.py <<'PY'
"""Run one Genie 3 generation experiment on the CPU.

Usage: python genie3_cpu.py <experiment.yaml>

The shipped `genie3 generate` hardcodes accelerator="gpu". This builds the same
sampling config and hands it to a CPU trainer instead. Setting predict_sequence
and predict_sidechain on the sampler adds the optional side-chain stage.
"""
import sys
import time

from lightning import Trainer, seed_everything

from genie3.config import load_experiment_config, to_generation_config
from genie3.generation.config.registry import build_sample_config_from_dict
from genie3.generation.data.data_module import GenieDataModule
from genie3.generation.runner.runner import GenieRunner

run_config = load_experiment_config(sys.argv[1])
config = build_sample_config_from_dict(to_generation_config(run_config))
seed_everything(run_config.experiment.seed, workers=True)

trainer = Trainer(
    accelerator="cpu",
    devices=1,
    deterministic=True,
    logger=False,
    enable_progress_bar=False,
    inference_mode=False,      # as the shipped CLI does; see the note below
)

start = time.time()
trainer.test(GenieRunner(config), GenieDataModule(config.dataset))
print(f"backbones written under {config.io.outdir} in {time.time() - start:.0f}s")

# Optional second stage: pack side chains onto the backbone just written.
sampler = config.inference.sampler.sampler
if getattr(sampler, "predict_sidechain", False):
    config.dataset.source = "sidechain"
    config.dataset.datadir = config.io.outdir
    start = time.time()
    trainer.test(GenieRunner(config), GenieDataModule(config.dataset))
    print(f"side chains added in {time.time() - start:.0f}s")
PY
( cd genie3 && ../.venv/bin/python genie3_cpu.py unconditional.yaml )
```

`inference_mode=False` mirrors what the shipped CLI does, and it is worth knowing that it
is not load-bearing for anything on this page: the same 50-residue run under Lightning's
default inference mode completed cleanly and produced a byte-identical PDB. Keep it anyway
rather than diverging from upstream, which sets it on every run — the beam-search sampler
this page does not cover is the plausible reason it is there.

## One experiment per Python process

`build_sample_config_from_dict` mutates a module-level `ConfigDict` singleton. Call it a
second time in the same interpreter and it dies:

```
TypeError: Cannot update a FieldReference from another FieldReference: 'batch_size'
```

There is no reset. The upstream CLI never hits it because `genie3 run` launches generation
in a child process, so the singleton is touched once per process and no more.

The consequence for anything you write: **do not loop over lengths, seeds or problems
inside one script.** Loop in the shell, one process per experiment.

```bash
( cd genie3 && for length in 60 70 80; do
  sed "s/min_length: 50/min_length: $length/; s/max_length: 50/max_length: $length/; \
       s/length_step: 50/length_step: $length/; s|out/first|out/L$length|" \
      unconditional.yaml > "L$length.yaml"
  ../.venv/bin/python genie3_cpu.py "L$length.yaml"
done )
```

A single YAML can sweep lengths by itself — `min_length`, `max_length` and `length_step`
give the range, `n_sample` the count per length — and that is one process and the better
answer when the sweep really is over length alone.

## What the file actually contains

Genie 3 is described as an all-atom model. The PDB it writes for an unconditional sample
is not an all-atom structure, so look before you hand it to anything:

```bash
head -3 genie3/out/first/pdbs/50_0.pdb
awk '/^ATOM/{n=substr($0,13,4); gsub(/ /,"",n); print n}' genie3/out/first/pdbs/50_0.pdb | sort -u | tr '\n' ' '
awk '/^ATOM/{print substr($0,18,3)}' genie3/out/first/pdbs/50_0.pdb | sort -u | tr '\n' ' '
```

You get **one atom per residue — the Cα — and every residue named `ALA`**. Not a truncated
file and not an error: unconditional features are built from a length using a Cα-only atom
representation, and with the default sampler the residue type is never predicted, so the
writer falls back to its `default_resname`. The poly-alanine sequence is a placeholder,
not a design.

"All-atom" describes what the model *conditions on* — a motif or a target enters as its
full complement of heavy atoms, which is the advance over the Cα-only Genie 2 — plus an
optional second stage that packs side chains. It does not describe what unconditional
generation emits.

Two consequences that bite:

- **There are no N, C or O backbone atoms**, so nothing downstream can compute a peptide
  bond length, a φ/ψ angle or a hydrogen bond from this file.
- **The sequence is not real.** Anything reading residue names off it — a molecular
  weight, a pI, a BLAST search — is reading fifty alanines.

## Check the geometry, not just that it parsed

A generated backbone can be geometrically impossible and still parse cleanly, so check the
one invariant a Cα trace has: consecutive Cα atoms in a trans peptide sit about 3.8 Å
apart, and every other pair should be further apart than a clash.

```bash
cat > genie3/check_backbone.py <<'PY'
"""Geometry sanity check for a Ca-trace PDB written by Genie 3."""
import sys

import numpy as np

xyz, residue_names = [], []
for line in open(sys.argv[1]):
    if line.startswith("ATOM") and line[12:16].strip() == "CA":
        xyz.append([float(line[30:38]), float(line[38:46]), float(line[46:54])])
        residue_names.append(line[17:20])
xyz = np.asarray(xyz)

step = np.linalg.norm(np.diff(xyz, axis=0), axis=1)
dist = np.linalg.norm(xyz[:, None] - xyz[None], axis=-1)
sep = np.abs(np.subtract.outer(np.arange(len(xyz)), np.arange(len(xyz))))
radius = np.sqrt(((xyz - xyz.mean(0)) ** 2).sum(1).mean())
expected = 2.2 * len(xyz) ** 0.38

print(f"residues                    {len(xyz)}")
print(f"distinct residue names      {len(set(residue_names))}")
print(f"CA-CA median (A)            {np.median(step):.2f}")
print(f"CA-CA breaks (>4.2 A)       {int((step > 4.2).sum())} at {np.flatnonzero(step > 4.2)[:5].tolist()}")
print(f"CA-CA compressed (<3.5 A)   {int((step < 3.5).sum())} at {np.flatnonzero(step < 3.5)[:5].tolist()}")
print(f"clashes (<3.0 A, |i-j| > 2) {int(((dist < 3.0) & (sep > 2)).sum() // 2)}")
print(f"radius of gyration (A)      {radius:.1f}  (compact monomer ~{expected:.1f})")
PY
( cd genie3 && ../.venv/bin/python check_backbone.py out/first/pdbs/50_0.pdb )
```

**Check short steps as well as long ones.** Chain breaks are the obvious failure and a PDB
parser will not mention them — a sampler pushed outside its regime returns a chain that is
locally sensible and globally in pieces. The subtler one is a single compressed link, and
it showed up in the sweep below: a 200-residue sample had 199 steps between 3.79 and
3.88 Å and one of 2.98 Å at residue 70. That is cis-peptide spacing in a run of trans
geometry, it is one number out of two hundred, and a mean or a span check will miss it.

Radius of gyration is the cheap globularity check. A compact monomer sits near
`2.2 × N^0.38` Å, so about 9.7 Å at 50 residues and 16.5 Å at 200. Well above that and the
sample is extended rather than folded, which happens often enough to be worth screening
every sample: one of six samples at 60–80 residues in the sweep came back at 21.9 Å
against an expected 12.6 Å, with textbook bond lengths and no breaks.

## Length, `direction_scale`, and where it stops working

`direction_scale` trades diversity against quality. Upstream's guidance is `0.8` for
monomers of 300 residues or fewer and `0.0` above that; the motif example uses `0.1` and
the binder examples `0.0`.

Everything below was measured on one laptop CPU, seed 0, `v1` checkpoint, DDIM sampler at
its default 100 sampling steps, and `direction_scale: 0.8` unless the row says otherwise.
Times are wall clock on a busy shared machine and should be read as orders of magnitude.
Lengths above 300 were not measured here.

| request | wall clock | CA–CA span (Å) | breaks | clashes | Rg (Å) | compact monomer ≈ |
|---|---|---|---|---|---|---|
| 10 residues | 12 s | 3.83–3.89 | 0 | 0 | 5.0 | 5.0 |
| 20 residues | 13 s | 3.84–3.88 | 0 | 0 | 9.0 | 6.6 |
| 50 residues | 22 s | 3.83–3.88 | 0 | 0 | 10.6 | 9.7 |
| 60–80 residues, 6 samples | 181 s | 3.79–3.90 | 0 | 0 | 10.7–**21.9** | 10.5–11.7 |
| 100 residues | 53 s | 3.79–3.88 | 0 | 0 | 13.0 | 12.7 |
| 200 residues | 156 s | **2.98**–3.88 | 0 | 0 | 21.3 | 16.5 |
| 300 residues | 365 s | 3.81–3.89 | 0 | 0 | 19.3 | 20.2 |
| 50 residues, `direction_scale: 0.0` | 25 s | 3.84–3.89 | 0 | 0 | 9.7 | 9.7 |
| 50 residues, `direction_scale: 5.0` | 23 s | **210–1003** | **49 of 49** | 0 | **388** | 9.7 |

Four things that sweep established.

**Out-of-range `direction_scale` fails silently.** At `5.0` the sampler exits cleanly,
writes a well-formed 50-residue PDB, logs no warning, and every consecutive Cα pair is
hundreds of ångströms apart. There is no validation on the parameter. This is the single
strongest argument for running the geometry check on every sample rather than on a
spot-check.

**Nothing enforces a lower length bound.** `min_n_res` is 20 in the shared config, but it
filters training data. Ask for 10 residues and you get 10 residues, with correct local
geometry and no warning that you are far outside anything the model was trained on.

**Sample quality varies within a single valid setting.** Bond lengths were textbook in
every non-pathological sample above, and globularity was not: one of the six 60–80 residue
samples came back with a radius of gyration of 21.9 Å where 11 Å was expected, and the
200-residue sample carried one compressed Cα–Cα link. Generate more than you need and
screen, rather than trusting a single sample.

**Sampling is reproducible.** Two runs at seed 0 in separate processes produced
byte-identical coordinates; seed 7 produced a different structure. `experiment.seed` is
the handle, and `deterministic=True` on the trainer is what keeps it.

One thing to know about the other sampler: `ddpm` takes only `noise_scale`, so a config
written for `ddim` fails immediately with
`DDPMSampler.__init__() got an unexpected keyword argument 'direction_scale'`. DDIM at 100
sampling steps is the default and the one every upstream example uses.

**When a GPU starts to matter.** Not for one backbone, and not for a handful. Cost grows
faster than linearly with length — roughly 7× from 50 to 200 residues on the numbers
above, which is what a triangular update over a pair representation costs — so a laptop is
comfortable to a few hundred residues and a few dozen samples. Past that, three things push you onto a card: generating
thousands of candidates rather than dozens; beam search, which co-folds partial
trajectories at checkpoints and needs the evaluation stack; and training, which the CLI
only offers on GPU anyway.

## The side-chain stage, and what it does not fix

Setting both `predict_sequence` and `predict_sidechain` on the sampler runs a second pass
that reads the Cα trace back in, predicts residue types and packs side chains onto it.

```bash
cat > genie3/allatom.yaml <<'YAML'
experiment:
  name: allatom
  seed: 0

paths:
  rootdir: out/allatom

generation:
  dataset:
    source: unconditional
    min_length: 50
    max_length: 50
    length_step: 50
    n_sample: 1
  sampler:
    sampler:
      direction_scale: 0.8
      predict_sequence: true
      predict_sidechain: true
YAML
( cd genie3 && ../.venv/bin/python genie3_cpu.py allatom.yaml )
awk '/^ATOM/{n=substr($0,13,4); gsub(/ /,"",n); print n}' genie3/out/allatom/pdbs/50_0.pdb | sort -u | tr '\n' ' '
awk '/^ATOM/{print substr($0,77,2)}' genie3/out/allatom/pdbs/50_0.pdb | sort | uniq -c
```

Two things to know before relying on it.

**It still writes no N, C or O.** You get Cα plus side-chain heavy atoms — `CB`, `CG`,
`OD1`, `NZ`, `SD` and so on. The main-chain amide nitrogen and the carbonyl are absent
from both stages, so this is not a full-atom structure either.

**The element column is wrong.** Columns 77–78 read `C` for every Cα and `N` for every
other atom, oxygens and the methionine sulphur included. The atom-symbol one-hot is never
populated for generated side-chain atoms, so the writer's `argmax` returns index 0 of
`["N", "C", "O", "S"]` for all of them. Anything that trusts the element column — van der
Waals radii, bond perception, most renderers — is wrong on every atom but Cα. Re-derive it
from the atom name:

```bash
cat > genie3/fix_elements.py <<'PY'
"""Rewrite the element column of a Genie 3 PDB from the PDB atom name."""
import sys

with open(sys.argv[1]) as source, open(sys.argv[2], "w") as out:
    for line in source:
        if line.startswith("ATOM"):
            name = line[12:16].strip()
            element = name[0] if name[0].isalpha() else name[1]
            line = f"{line[:76]}{element:>2}{line[78:]}"
        out.write(line)
print(f"wrote {sys.argv[2]}")
PY
( cd genie3 && ../.venv/bin/python fix_elements.py out/allatom/pdbs/50_0.pdb out/allatom/pdbs/50_0_fixed.pdb )
awk '/^ATOM/{print substr($0,77,2)}' genie3/out/allatom/pdbs/50_0_fixed.pdb | sort | uniq -c
```

The first-letter rule is safe for the twenty standard residues, whose heavy atoms are all
C, N, O or S and whose PDB names all begin with the element. It is not safe for metals or
modified residues, and this model generates neither.

The stage is also expensive. On CPU it cost about ten times the backbone itself for a
50-residue sample, because it runs the atomised representation rather than one token per
residue.

## Motif scaffolding

MotifBench ships with the repository, so there is nothing extra to download. A problem is
a JSON naming a motif PDB and a segment layout — `8-15,A3,16-30,A4,…`, where letters index
motifs, digits index the segments declared in that motif's `REMARK 999 INPUT` lines, and
bare ranges are scaffold lengths. Motif residues enter as every heavy atom the motif file
supplies, which is the capability the Cα-only predecessor lacked — and which means the
motif file, not the model, decides how much geometry is held.

```bash
cat > genie3/motif.yaml <<'YAML'
experiment:
  name: motif_1bcf
  seed: 0

paths:
  rootdir: out/motif
  dataset: data/design/motif_scaffolding/motifbench

generation:
  dataset:
    source: motif
    selections: 22_1BCF
    n_sample: 1
  sampler:
    sampler:
      direction_scale: 0.1
YAML
( cd genie3 && ../.venv/bin/python genie3_cpu.py motif.yaml )
```

`selections` is a comma-separated list of problem names; omit it and every problem in the
set is sampled, which for MotifBench is 30 of them. Output lands under
`out/motif/<problem>/pdbs/`, beside a `scaffold_info.tsv` recording the scaffold lengths
that were actually drawn from the ranges — for `22_1BCF` above, `14,A3,30,A4,20,A2,17,A1,12`.

The file this writes is **mixed**, and reading it needs care:

- The generated scaffold is a Cα trace named `UNK`, exactly as unconditional generation is.
- The motif positions keep whatever the motif file declared. MotifBench's `22_1BCF.pdb`
  names only the six metal-ligating side chains of ferritin and lists the rest as `UNK`, so
  the output has 125 residues, 157 atoms, and real residue names on exactly those six.
- **Columns 73–76 carry a group letter marking the conditioned positions** — `A` on all 32
  motif residues here, blank on the 93 scaffold residues. That is the reliable way to tell
  which residues were held rather than generated, and it is not in the upstream README.
- The element column is correct for motif atoms and wrong for generated ones, for the
  reason given above — the motif's symbols come from the input file.

## Binder design

`source: target` conditions generation on a target structure and a set of interface
residues, and writes the binder chain first. The repository ships a pre-processed
BinderBench set — ten targets including TNFα, PD-L1, IL-7Rα and VEGF-A — under
`data/design/binder_design/binderbench`, each with a target PDB, a FASTA, an MSA and a
problem JSON carrying `hotspot` and `extended` interface residue lists.

```bash
cat > genie3/binder.yaml <<'YAML'
experiment:
  name: binder_bhrf1
  seed: 0

paths:
  rootdir: out/binder
  dataset: data/design/binder_design/binderbench

generation:
  dataset:
    source: target
    selections: 01_bhrf1
    n_sample: 1
    cond_strategy: hotspot
  sampler:
    sampler:
      direction_scale: 0.0
YAML
( cd genie3 && ../.venv/bin/python genie3_cpu.py binder.yaml )
```

`cond_strategy` picks the residue list that conditions the binder: `hotspot` is the short
list, `extended` the wider patch the shipped examples default to. Binder length is drawn
from `binder_min_length`–`binder_max_length` in the problem JSON, so the same config gives
a different-length binder at a different seed — 110 residues out of an 80–120 range on the
run above.

What lands in `out/binder/01_bhrf1/pdbs/` is a two-chain complex with 295 atoms, and its
composition is worth reading carefully:

| chain | what it is | residue names | atoms |
|---|---|---|---|
| A, first | the generated binder | `UNK` throughout | Cα only |
| B | the target, copied through | real, from the target PDB | Cα for all 157, plus full side chains on exactly the six hotspot residues |

So the conditioning is all-atom precisely where you told it to be, and nowhere else. The
binder is the same Cα trace unconditional generation produces, and the target chain is not
a substitute for the original PDB — take that from `targets/pdb/` if you need it whole.

**This is where CPU stops being comfortable.** The token count is the binder plus the
entire target, not the binder alone: BHRF1 is a single 157-residue chain and the run above
took about five minutes. The BinderBench TNFα problem is a 438-residue trimer, several
times larger, and was not attempted here.

Building a problem for your own target needs an MSA, and upstream's
`scripts/problem/binder_design/prepare.py` gets it from the ColabFold MSA server — a
third-party service, and the only network dependency in the binder path.

## What to do with the backbone

Genie 3 hands you geometry. The rest of the pipeline is other tools, and two of them are
documented here.

**Sequence design.** A Cα trace is not what most inverse-folding models expect.
ProteinMPNN's vanilla weights read N, CA, C and O, and this file has only Cα — the CA-only
checkpoints are the ones that take a Cα trace, and picking the right one is the difference
between a designed sequence and a silent failure. The `proteinmpnn` skill covers that
choice, and the ways a backbone stops being designed without anything saying so.

**Deciding what to make.** Generation is cheap and synthesis is not, so the ranking step
after co-folding is where the money is decided. The `binder-design-filtering` skill covers
that end, and this page deliberately does not repeat it.

The scale of the winnowing is worth internalising before you start. In the largest
published autonomous binder campaign to date, 1,315 tested designs came from ten
generators, and Genie 3 produced 185 of them. On TNFα — a compact homotrimer against which
several earlier efforts reported no binders at all — 150 designs spanning 92 distinct
backbones were tested and twelve bound. **All eight binders from that campaign's
multi-target arm were sequence variants of a single Genie 3 backbone**: eight distinct
sequences, every one 83 residues long, every one tracing to the same root backbone
identifier in the released per-design provenance table. The other four binders came from
three backbones by a different generator. That is the shape of this work — the backbone
that matters was one of ninety-two, and it was found by making many and filtering hard.

## Genie 2 checkpoints

Genie 2 is the Cα-only predecessor, and its checkpoint sits beside the current one on
HuggingFace under `pretrained/legacy/` at 189 MB. Genie 3 loads it directly: point
`generation.base.config` and `generation.base.checkpoint` at the legacy pair, and the
config loader forces `max_n_chain: 1` and a Cα protein representation to match. The
repository ships `examples/unconditional/experiment_legacy.yaml` and a motif equivalent.
Useful for reproducing older results; there is no reason to prefer it for new work.

## Limits

- **A backbone is not a design.** Nothing in the generation path predicts whether a
  sequence exists that folds to it, and self-consistency — design a sequence, fold it,
  compare — is the cheapest available check. It needs an inverse-folding model and a
  structure predictor, neither of which is in this path.
- **Unconditional generation is a Cα trace.** Rebuilding a full backbone, if you need one,
  is a separate step this model does not do.
- **The side-chain stage predicts a sequence.** Treat it as a starting point, not as an
  inverse-folding result; upstream's own binder pipeline runs a dedicated inverse-folding
  model over the backbone rather than using it.
- **Nothing validates sampler parameters.** Out-of-range values produce clean exits and
  nonsense coordinates.
- **The evaluation half of the repository is a different project** in dependency and
  licence terms, and it needs a GPU. Generation does not.

## Try it

**Data.** The Genie 3 `v1` checkpoint and its config, from HuggingFace `yeqinglin/genie3`
— 347 MB, Apache-2.0, ungated, no account. Confirmed reachable 28 Aug 2026. The structure
under test is produced by the model, so there is no second dataset to fetch.

**Run.** Cold, in an empty directory. Budget twenty minutes or so, nearly all of it
downloads — the torch wheel, a 61 MB clone and the 347 MB checkpoint.

```bash
mkdir -p genie3-try && cd genie3-try
python3 -m venv .venv
.venv/bin/python -m pip install -q --upgrade pip
git clone -q --depth 1 https://github.com/aqlaboratory/genie3.git
.venv/bin/python -m pip install -q ./genie3
cd genie3

mkdir -p pretrained/v1/checkpoints
curl -sSL -o pretrained/v1/config.yaml \
  https://huggingface.co/yeqinglin/genie3/resolve/main/pretrained/v1/config.yaml
curl -sSL -o "pretrained/v1/checkpoints/step=600000.ckpt" \
  https://huggingface.co/yeqinglin/genie3/resolve/main/pretrained/v1/checkpoints/step%3D600000.ckpt

cat > tryit.yaml <<'YAML'
experiment:
  name: tryit
  seed: 0
paths:
  rootdir: out
generation:
  dataset:
    source: unconditional
    min_length: 50
    max_length: 50
    length_step: 50
    n_sample: 1
  sampler:
    sampler:
      direction_scale: 0.8
YAML

cat > tryit.py <<'PY'
import warnings

import numpy as np
from lightning import Trainer, seed_everything

from genie3.config import load_experiment_config, to_generation_config
from genie3.generation.config.registry import build_sample_config_from_dict
from genie3.generation.data.data_module import GenieDataModule
from genie3.generation.runner.runner import GenieRunner

warnings.filterwarnings("ignore")
run_config = load_experiment_config("tryit.yaml")
config = build_sample_config_from_dict(to_generation_config(run_config))
seed_everything(run_config.experiment.seed, workers=True)
Trainer(accelerator="cpu", devices=1, deterministic=True, logger=False,
        enable_progress_bar=False, enable_model_summary=False,
        inference_mode=False).test(GenieRunner(config), GenieDataModule(config.dataset))

xyz, atom_names, residue_names = [], set(), set()
for line in open("out/pdbs/50_0.pdb"):
    if line.startswith("ATOM"):
        atom_names.add(line[12:16].strip())
        residue_names.add(line[17:20])
        if line[12:16].strip() == "CA":
            xyz.append([float(line[30:38]), float(line[38:46]), float(line[46:54])])
xyz = np.asarray(xyz)
step = np.linalg.norm(np.diff(xyz, axis=0), axis=1)
dist = np.linalg.norm(xyz[:, None] - xyz[None], axis=-1)
sep = np.abs(np.subtract.outer(np.arange(len(xyz)), np.arange(len(xyz))))

print()
print(f"residues                    {len(xyz)}")
print(f"distinct atom names         {' '.join(sorted(atom_names))}")
print(f"distinct residue names      {' '.join(sorted(residue_names))}")
print(f"CA-CA all within 3.6-4.1 A  {bool((step > 3.6).all() and (step < 4.1).all())}")
print(f"chain breaks (>4.2 A)       {int((step > 4.2).sum())}")
print(f"non-local clashes (<3.0 A)  {int(((dist < 3.0) & (sep > 2)).sum() // 2)}")
PY

../.venv/bin/python tryit.py 2>/dev/null
```

**Expect.**

```

residues                    50
distinct atom names         CA
distinct residue names      ALA
CA-CA all within 3.6-4.1 A  True
chain breaks (>4.2 A)       0
non-local clashes (<3.0 A)  0
```

**Invariants** — true of any working install, so a mismatch means this skill is wrong, not
that upstream moved. Fifty residues in, fifty Cα out. One distinct atom name, `CA`, and one
distinct residue name, `ALA` — the Cα-trace and poly-alanine facts this page is built on.
No chain break, no non-local clash, and every Cα–Cα step inside the trans-peptide window.
That last line is a property of this sample rather than of the model: longer requests
occasionally produce one compressed link, as the sweep above found at 200 residues.

**Version- and host-dependent** — the coordinates themselves. Sampling is deterministic for
a given seed on a given machine, but floating-point arithmetic is not identical across CPUs,
so the numbers behind those checks move and the checks do not. On the validating host on
28 Aug 2026 the Cα–Cα span was 3.83–3.88 Å and the radius of gyration 10.6 Å against an
expected 9.7 Å for a compact 50-mer. Treat a drift there as something to look at, not as a
failure. A `False` on the bond-length line, or a non-zero break or clash count, is a
failure.

## Sources

- Genie 3 code — https://github.com/aqlaboratory/genie3 (Apache-2.0)
- Genie 3 weights — https://huggingface.co/yeqinglin/genie3 (Apache-2.0, ungated)
- Lin, Y., Lee, M., Vermani, A., Jiang, E., De Cooman, S., Spetko, M. and AlQuraishi, M.
  (2026) *Fast and Ultra-Capable Protein Design — Advancing the Frontier Through Atomistic
  SE(3)-Equivariance with Genie 3.* bioRxiv — https://doi.org/10.64898/2026.05.01.722168.
  Cite this if you use Genie 3.
- Anthropic. *Autonomous de novo protein binder design*, 2026 —
  https://www-cdn.anthropic.com/30bf50e22a01388bb29bf077ee3f244531594b7a.pdf — the 1,315
  tested designs, the ten generators and their per-generator counts, the TNFα result, and
  the per-design provenance release the single-backbone claim above was checked against.
