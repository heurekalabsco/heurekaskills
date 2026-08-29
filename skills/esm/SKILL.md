---
name: esm
description: Run the ESM protein models — ESMFold2 all-atom structure and complex prediction with DNA, RNA, ligands and modified residues, ESMC embeddings up to 6B, ESM3 generation and inverse folding. Covers which weights are open and under what licence, the CUDA, Apple Silicon and hosted routes, and the dependency pin that breaks upstream's own quickstart.
category: models
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.4.0
tags: [protein-language-model, esm3, esmc, embeddings, structure-prediction]
datasets: [https://huggingface.co/api/models/biohub/ESMFold2, https://huggingface.co/api/models/biohub/ESMFold2-Fast, https://huggingface.co/api/models/biohub/ESMC-6B]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: esm 3.4.0 (PyPI, released 2026-08-27) / transformers 4.57.6 / torch 2.11.0 / biotite 1.7.1 / Python 3.12.8 on macOS 26.4 arm64, Apple M1 Max, 64 GB, no CUDA / biohub/ESMFold2-Fast and biohub/ESMC-6B downloaded and folded on CPU / biohub HF model records and Biohub/esm LICENSE.md read 2026-08-28
  executed: 14
  unverified: 9
  unverified_reason: >-
    Six ESM3 blocks and the two hosted-API blocks need either the esm3-open checkpoint in a
    generation loop or an ESM_API_KEY, neither of which this host has; the flash-attn install
    block is CUDA-only and publishes no macOS wheel; and the fold block as written names
    device="cuda". ESMFold2 itself was run here end to end on CPU instead — the equivalent
    fp32 block below it loaded biohub/ESMFold2-Fast with its 25.4 GB ESMC-6B trunk and folded
    ubiquitin to a valid 601-atom mmCIF, which is where the pLDDT, pTM and timing quoted in
    section 7 come from. Re-run the ESM3 blocks with an ESM_API_KEY, and the CUDA fold on an
    NVIDIA host.
---
# ESM: Evolutionary Scale Modeling

## Overview

ESM provides protein language models for understanding, generating, and designing proteins. Use this skill for current EvolutionaryScale/Biohub workflows: ESM3 for generative design, ESMC for representation learning and embeddings, hosted Biohub inference, and ESMFold2 all-atom structure prediction.

**What you need before running anything here.** More is open than this skill used to say.
Every model it runs locally — `esm3-sm-open-v1`, all three ESMC sizes *including the 6B*, and
both ESMFold2 checkpoints — sits on Hugging Face under the `biohub` org, ungated, needing no
account and no licence acceptance. Checked 2026-08-28:

| repo | licence tag on the card | gated | size |
|---|---|---|---|
| `biohub/esm3-sm-open-v1` | — (MIT per the repository) | no | 1.4B params |
| `biohub/ESMC-300M` / `ESMC-600M` | `mit`, `other` | no | 0.33B / 0.58B params |
| `biohub/ESMC-6B` | `mit`, `other` | no | **25.4 GB** |
| `biohub/ESMFold2` | `mit` | no | 0.94 GB, plus a 0.42 GB `ccd.pkl` |
| `biohub/ESMFold2-Fast` | `mit` | no | 0.75 GB, plus the same `ccd.pkl` |

Only ESM3-medium and ESM3-large remain hosted-only and need an `ESM_API_KEY` from the Biohub
developer console — see *Authentication*.

The ESM3 and ESMC examples below are written `.to("cuda")` as upstream writes them. **Swap in
`.to("cpu")` and they run without a GPU** — `esmc_300m` embeds a short sequence on CPU in
seconds, and none of the ESMC sizes need CUDA to produce embeddings. ESMFold2 is the one where
hardware genuinely decides what is practical; section 7 has the table. On any machine without
CUDA, expect two startup warnings about Transformer Engine and xformers falling back to pure
PyTorch — they are informational, they name the numerical difference, and nothing is wrong.

Two things that table does not show, both of which cost real time if you meet them at runtime:

- **ESMFold2 is a folding head on a frozen ESMC-6B, and pulls it too.** That 0.94 GB is the
  folding trunk alone. Its `config.json` names `esmc_id` as `biohub/ESMC-6B`, and so does
  `-Fast`. Budget roughly **27 GB** and a first-load time to match, not 1 GB.
- **The `other` tag on the ESMC cards is not a second licence.** Their `license_link` points
  at the repository's `THIRD_PARTY_NOTICE.md`, which lists only dependency licences — PyTorch,
  flash-attn and xformers under BSD, einops, jaxtyping and attrs under MIT, lightning under
  Apache-2.0. The repository's own `LICENSE.md` is unmodified MIT, `Copyright 2026 Chan
  Zuckerberg Biohub, Inc.`, carrying no non-commercial, field-of-use or research-only clause.
  What does bind you is the separate [Acceptable Use Policy](https://biohub.org/acceptable-use-policy/),
  which the model cards name as the out-of-scope boundary. GitHub's API reports the repository
  as `NOASSERTION`; that is its classifier declining to resolve a `LICENSE.md`, not a licence
  problem.

## Core Capabilities

### 1. Protein Sequence Generation with ESM3

Generate novel protein sequences with desired properties using multimodal generative modeling.

**When to use:**
- Designing proteins with specific functional properties
- Completing partial protein sequences
- Generating variants of existing proteins
- Creating proteins with desired structural characteristics

**Basic usage:**

```python
from esm.models.esm3 import ESM3
from esm.sdk.api import ESM3InferenceClient, ESMProtein, GenerationConfig

# Open weights, MIT-licensed — no account, no licence acceptance. Drop .to("cuda") for CPU.
model: ESM3InferenceClient = ESM3.from_pretrained("esm3-open").to("cuda")

# Create protein prompt
protein = ESMProtein(sequence="MPRT___KEND")  # '_' represents masked positions

# Generate completion
protein = model.generate(protein, GenerationConfig(track="sequence", num_steps=8))
print(protein.sequence)
```

**For remote/cloud usage via the hosted API:**

```python
import os
import esm
from esm.sdk.api import ESMProtein, GenerationConfig

# Same interface as local ESM3; token from ESM_API_KEY (see Authentication)
model = esm.sdk.client("esm3-medium-2024-08", token=os.environ["ESM_API_KEY"])

# Generate
protein = model.generate(protein, GenerationConfig(track="sequence", num_steps=8))
```

See `references/esm3-api.md` for detailed ESM3 model specifications, advanced generation configurations, and multimodal prompting examples.

### 2. Structure Prediction and Inverse Folding

Use ESM3's structure track for structure prediction from sequence or inverse folding (sequence design from structure).

**Structure prediction:**

```python
from esm.sdk.api import ESM3InferenceClient, ESMProtein, GenerationConfig

# Predict structure from sequence
protein = ESMProtein(sequence="MPRTKEINDAGLIVHSP...")
protein_with_structure = model.generate(
    protein,
    GenerationConfig(track="structure", num_steps=protein.sequence.count("_"))
)

# Access predicted structure
coordinates = protein_with_structure.coordinates  # 3D coordinates
pdb_string = protein_with_structure.to_pdb()
```

**Inverse folding (sequence from structure):**

```python
# Design sequence for a target structure
protein_with_structure = ESMProtein.from_pdb("target_structure.pdb")
protein_with_structure.sequence = None  # Remove sequence

# Generate sequence that folds to this structure
designed_protein = model.generate(
    protein_with_structure,
    GenerationConfig(track="sequence", num_steps=50, temperature=0.7)
)
```

### 3. Protein Embeddings with ESM C

Generate high-quality embeddings for downstream tasks like function prediction, classification, or similarity analysis.

**When to use:**
- Extracting protein representations for machine learning
- Computing sequence similarities
- Feature extraction for protein classification
- Transfer learning for protein-related tasks

**Basic usage:**

```python
from esm.models.esmc import ESMC
from esm.sdk.api import ESMProtein, LogitsConfig

# Load ESM C model
model = ESMC.from_pretrained("esmc_300m").to("cuda")

# Get embeddings
protein = ESMProtein(sequence="MPRTKEINDAGLIVHSP...")
protein_tensor = model.encode(protein)
logits_output = model.logits(
    protein_tensor,
    LogitsConfig(sequence=True, return_embeddings=True),
)
embeddings = logits_output.embeddings
```

**Batch processing:**

```python
# Encode multiple proteins
proteins = [
    ESMProtein(sequence="MPRTKEIND..."),
    ESMProtein(sequence="AGLIVHSPQ..."),
    ESMProtein(sequence="KTEFLNDGR...")
]

embeddings_list = [
    model.logits(
        model.encode(p),
        LogitsConfig(sequence=True, return_embeddings=True),
    ).embeddings
    for p in proteins
]
```

See `references/esm-c-api.md` for ESM C model details, efficiency comparisons, and advanced embedding strategies.

### 4. Function Conditioning and Annotation

Use ESM3's function track to generate proteins with specific functional annotations or predict function from sequence.

**Function-conditioned generation:**

```python
from esm.sdk.api import ESMProtein, FunctionAnnotation, GenerationConfig

# Create protein with desired function
protein = ESMProtein(
    sequence="_" * 200,  # Generate 200 residue protein
    function_annotations=[
        FunctionAnnotation(label="fluorescent_protein", start=50, end=150)
    ]
)

# Generate sequence with specified function
functional_protein = model.generate(
    protein,
    GenerationConfig(track="sequence", num_steps=200)
)
```

### 5. Chain-of-Thought Generation

Iteratively refine protein designs using ESM3's chain-of-thought generation approach.

```python
from esm.sdk.api import GenerationConfig

# Multi-step refinement
protein = ESMProtein(sequence="MPRT" + "_" * 100 + "KEND")

# Step 1: Generate initial structure
config = GenerationConfig(track="structure", num_steps=50)
protein = model.generate(protein, config)

# Step 2: Refine sequence based on structure
config = GenerationConfig(track="sequence", num_steps=50, temperature=0.5)
protein = model.generate(protein, config)

# Step 3: Predict function
config = GenerationConfig(track="function", num_steps=20)
protein = model.generate(protein, config)
```

### 6. Batch Processing with the Hosted API

Process multiple proteins efficiently using the client's async methods.

```python
import os
import asyncio
import esm
from esm.sdk.api import ESMProtein, GenerationConfig

client = esm.sdk.client("esm3-medium-2024-08", token=os.environ["ESM_API_KEY"])

# Async batch processing
async def batch_generate(proteins_list):
    tasks = [
        client.async_generate(protein, GenerationConfig(track="sequence"))
        for protein in proteins_list
    ]
    return await asyncio.gather(*tasks)

# Execute
proteins = [ESMProtein(sequence=f"MPRT{'_' * 50}KEND") for _ in range(10)]
results = asyncio.run(batch_generate(proteins))
```

See `references/forge-api.md` for hosted-API documentation, authentication, rate limits, and batch processing patterns. Note that it predates the Biohub migration — treat `references/biohub-platform.md` as authoritative where they disagree.

### 7. All-Atom Structure and Complex Prediction with ESMFold2

ESMFold2 is the newest model in this package and, for most people, the reason to reach for
it. Where ESMFold predicted a protein backbone from a sequence, ESMFold2 predicts a
**complex** — several protein chains, DNA, RNA, small-molecule ligands by CCD code or SMILES,
non-standard residues, and covalent bonds between any of them — in one all-atom pass, with
pLDDT, PAE, pTM and ipTM out the other side.

**Two checkpoints, and one silent trap between them:**

| checkpoint | MSA conditioning | folding-trunk params | reach for it when |
|---|---|---|---|
| `biohub/ESMFold2` | yes | 234.8 M | the target is hard, or you have a paired MSA |
| `biohub/ESMFold2-Fast` | no | 188.8 M | you want single-sequence throughput |

`-Fast` has no alignment reader. **Give it an MSA and it ignores it without raising** — you
get a single-sequence prediction with nothing to tell you the alignment was dropped. If you
went to the trouble of building one, load the full checkpoint.

#### The import that upstream documents does not resolve

The model card opens with this line, and an agent that copies it will not get far:

```python
from transformers.models.esmfold2.modeling_esmfold2 import ESMFold2Model   # do not
```

`transformers.models.esmfold2` first shipped in **transformers 5.16.0**. `esm` 3.4.0 pins
`transformers>=4.57.6,<5.0.0`. The two requirements have no solution, so the card's own
quickstart cannot run in an environment where `esm` is installed — this is not a version you
can nudge. Use the package's own class, which takes the same checkpoints and stays inside the
pin:

```python
from esm.models.esmfold2 import EsmFold2Model   # note the capitalisation: EsmFold2Model
```

The package also ships `EsmFold2HFAdapter`, which wraps a transformers-native ESMFold2 in this
same interface. It is the bridge *from* the HF port, not a way to reach it — with `esm`
installed there is no HF port to wrap, and `esmfold2` is absent from the transformers config
registry entirely. Ignore it unless you are deliberately running the two side by side.

Verify the conflict yourself rather than taking it on trust — no download, no GPU:

```bash
printf 'esm==3.4.0\ntransformers>=5.16.0\n' > conflict.txt
uv pip compile conflict.txt --python-version 3.12 -o /dev/null
```

```
  × No solution found when resolving dependencies:
  ╰─▶ Because esm==3.4.0 depends on transformers>=4.57.6,<5.0.0
      and you require esm==3.4.0, we can conclude that you require
      transformers>=4.57.6,<5.0.0.
      And because you require transformers>=5.16.0, we can conclude that your
      requirements are unsatisfiable.
```

#### The input grammar

One `StructurePredictionInput` lists the molecules; the builder folds it. Everything you vary
between a monomer and a drug-bound receptor is in that list, not in the call.

```python
from esm.models.esmfold2 import (
    DNAInput, ESMFold2InputBuilder, EsmFold2Model, LigandInput, ProteinInput,
    RNAInput, StructurePredictionInput,
)

UBIQUITIN = (
    "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG"
)

# A monomer.
spi = StructurePredictionInput(sequences=[ProteinInput(id="A", sequence=UBIQUITIN)])

# A protein-nucleic acid complex. id=["A", "B"] is ONE sequence present TWICE —
# not two different chains, which is the mistake this argument invites.
RNASEH = (
    "MNKIIIYTDGGARGNPGPAGIGVVITDEKGNTLHESSAYIGETTNNVAEYEALIRALEDLQ"
    "MFGDKLVDMEVEVRMNSELIVRQMQGVYKVKEPTLKEKFAKIAHIKMERVPNLVFVHIPRE"
    "KNARADELVNEAIDKALS"
)
spi = StructurePredictionInput(
    sequences=[
        ProteinInput(id=["A", "B"], sequence=RNASEH),   # the enzyme, two copies
        RNAInput(id="C", sequence="CGACACCUGAUUCC"),    # the strand it cuts
        DNAInput(id="D", sequence="GGAATCAGGTGTCG"),    # the partner strand
    ]
)
```

Ligands, non-standard residues and covalent bonds are three more entries in the same list.
**Every residue and atom index in this grammar is 0-based** — `Modification.position` is
declared `# zero-indexed` on the dataclass and is used as a direct index into the sequence,
and `CovalentBond.res_idx1` / `res_idx2` address the same 0-based residue numbering. This is
worth stating because it is the opposite of the PDB numbering most people arrive holding, and
an off-by-one here produces a job that validates cleanly and describes the wrong molecule:

```python
from esm.models.esmfold2 import CovalentBond, LigandInput, Modification

PEPTIDE = "HAEGTFTSDVSSYLEGQAAKEFIAWLVRGRG"
FATTY_TAIL = "C(=O)(CCOCCOCC(=O)NCCOCCOCCNCC(=O)N[C@@H](CCC(=O)NCCCCCCCCCCCCCCCCCC(=O)O)C(=O)O)"
lysine = PEPTIDE.index("K")          # 0-based, and so is res_idx1 below

spi = StructurePredictionInput(
    sequences=[
        ProteinInput(id="A", sequence=UBIQUITIN),
        ProteinInput(
            id="B",
            sequence=PEPTIDE,
            # 0-based: position=1 is the SECOND residue, the A of HAEGTF.
            modifications=[Modification(position=1, ccd="AIB")],
        ),
        LigandInput(id="C", smiles=FATTY_TAIL),        # or ccd=["SAH"] for a known component
    ],
    covalent_bonds=[
        CovalentBond(chain_id1="B", res_idx1=lysine, atom_idx1=8,
                     chain_id2="C", res_idx2=0, atom_idx2=0),
    ],
)
```

Folding is then two lines, and the fold call is identical on every backend below — only the
loading line changes. `from_pretrained` defaults to `device="cpu"`, so name the device you
actually want rather than relying on the default:

```python
model = EsmFold2Model.from_pretrained("biohub/ESMFold2-Fast", device="cuda").eval()
result = ESMFold2InputBuilder().fold(model, spi, num_loops=3, num_sampling_steps=50)

print(f"pLDDT {float(result.plddt.mean()):.3f}  pTM {float(result.ptm):.3f}")
print(f"ipTM  {float(result.iptm):.3f}")            # only meaningful for >1 chain
open("pred.cif", "w").write(result.complex.to_mmcif())
```

Read **ipTM** whenever there is more than one molecule — it reports whether the chains are
placed correctly against each other, which is a different question from whether each folded
well, and pLDDT will not tell you.

#### Where it runs

`from_pretrained` defaults to `device="cpu"`, so nothing forces CUDA at import. What varies is
whether the arithmetic is fast enough to be worth waiting for.

| backend | how | what to know |
|---|---|---|
| **NVIDIA CUDA** | `.cuda()`, as upstream writes it | the reference path; fused Triton kernels are CUDA-only |
| **Apple Silicon** | a pure-MLX port, `mlx_lm.models.esmfold2` | M1–M4 only; 32 GB RAM minimum, 48 GB comfortable |
| **CPU** | the `device="cpu"` default, plus `esmc_precision="fp32"` | works, and is usable for short chains — see below |
| **Hosted** | `esmfold2_client(model="esmfold2-fast-2026-05")` | no weights, no GPU; needs `ESM_API_KEY` |

**The CPU route needs one argument, and fails confusingly without it.** `esmc_precision`
defaults to `"bf16"`, but the folding trunk stays fp32 on CPU, so the default combination dies
part-way into the first forward pass with a message that names neither setting:

```
RuntimeError: expected m1 and m2 to have the same dtype, but got: c10::BFloat16 != float
```

Pass `esmc_precision="fp32"` and it runs. Budget ~25 GB of RAM for the trunk at fp32:

```python
model = EsmFold2Model.from_pretrained(
    "biohub/ESMFold2-Fast", device="cpu", esmc_precision="fp32"
).eval()
```

Folding 76-residue ubiquitin this way — CPU only, no CUDA, no MLX — took **57 s** at
`num_loops=1, num_sampling_steps=20` on an M1 Max, and returned pLDDT 0.819 and pTM 0.771 with
a radius of gyration of 11.7 Å against ubiquitin's experimental ~11.8 Å. That is a real
structure, not a smoke test, but note the settings are well below the defaults
(`num_loops=3, num_sampling_steps=50`) and accuracy scales with both. Use CPU to prove a
pipeline end to end on a short chain; use one of the other three rows for real work.

The Apple Silicon route is real and offline, but read the install before you take it: the MLX
port is a **personal fork of `mlx-lm`** installed from a floating `@main` branch and
`--no-deps`, because its own packaging wants a `transformers` newer than the `esm` pin allows.
That is a third-party dependency on a moving target in your environment. Pin a full
40-character commit SHA rather than `@main` if it is going anywhere near automation, and see
`references/biohub-platform.md`, which covers the same caution for the `esm` package itself.

Upstream's own laptop benchmark, quoted rather than measured here — ESMFold2-Fast at 50
sampling steps, mean seconds per fold, from `cookbook/tutorials/esmfold2_local_applesilicon.ipynb`:

| residues | M4 Pro (MLX) | L40, reference kernels | L40, fused kernels |
|---:|---:|---:|---:|
| 100 | 2.4 | 0.6 | 0.6 |
| 300 | 15.8 | 2.6 | 1.0 |
| 500 | 42.9 | 9.0 | 2.2 |
| 1000 | 189.3 | 121.9 | 9.1 |

Peak memory runs near 14 GiB for short inputs and about 41 GiB at 1000 residues. Past roughly
1000 residues, use CUDA or the hosted API.

**On using ESMFold2 to filter binder designs.** The 2026 autonomous campaign report found that
ensembling ESMFold2 and ESMFold2-Fast with a second, architecturally different predictor beat
any single model at separating real binders from designs — five seeds each, scored by ipSAE.
Producing those predictions is this skill; choosing thresholds, scoring the ranking and
deciding what to order is the `binder-design-filtering` skill, which covers it with the
benchmark numbers attached. Do not reinvent that here.

## Model Selection Guide

**ESM3 Models (Generative):**
- `esm3-open` (1.4B) - Open weights (MIT), local usage, no account needed
- `esm3-medium-2024-08` (7B) - Best balance of quality and speed (hosted only)
- `esm3-large-2024-03` (98B) - Highest quality, slower (hosted only)

**ESM C Models (Embeddings):**
- `esmc_300m` / `esmc-300m-2024-12` (30 layers) - Lightweight, fast inference (open weights, local)
- `esmc_600m` / `esmc-600m-2024-12` (36 layers) - Balanced performance (open weights, local)
- `esmc-6b-2024-12` (80 layers) - Maximum quality. Available hosted **and** locally: `biohub/ESMC-6B` is ungated open weights, 25.4 GB. Earlier versions of this skill said the 6B required the hosted platform or SageMaker; that is no longer true.

**ESMFold2 (all-atom structure and complexes):**
- `biohub/ESMFold2-Fast` - single-sequence, no MSA reader, the throughput choice (open weights, local)
- `biohub/ESMFold2` - MSA-conditioned, for hard targets and paired alignments (open weights, local)
- `esmfold2-fast-2026-05` - the same fast model hosted, no weights to download

Both ESMFold2 checkpoints load a frozen `biohub/ESMC-6B` as their language trunk, so choosing
either commits you to the 25.4 GB download as well. See section 7.

Local `ESMC.from_pretrained()` examples use underscore aliases (`esmc_300m`, `esmc_600m`). Hosted API clients use dated model IDs such as `esmc-600m-2024-12`.

**Selection criteria:**
- **Local development/testing:** Use `esm3-open` or `esmc_300m`
- **Production quality:** Use `esm3-medium-2024-08` via the hosted API
- **Maximum accuracy:** Use `esm3-large-2024-03` or `esmc-6b-2024-12` via the hosted API
- **High throughput:** Use the hosted API with explicit async concurrency limits
- **Cost optimization:** Use smaller models, implement caching strategies

## Installation

Install from PyPI ([`esm` on PyPI](https://pypi.org/project/esm/)). Current release: **3.4.0**
(2026-08-27), which is the first PyPI release carrying ESMFold2 — the model card still says a
PyPI release is "coming soon" and tells you to install from git, and that instruction is now
stale. Requires **Python >=3.12** (the `<3.13` cap earlier versions of this skill quoted was
lifted; 3.12, 3.13 and 3.14 are all declared).

**Basic installation:**

```bash
uv pip install "esm==3.4.0"
```

**With Flash Attention (recommended for faster inference on NVIDIA GPUs):**

```bash
uv pip install "esm==3.4.0"
uv pip install flash-attn --no-build-isolation
```

The CUDA-only extras — `cuequivariance-torch` and `cuequivariance-ops-torch-cu13` — are
declared with `sys_platform == "linux" and platform_machine == "x86_64"` markers, so they are
skipped on macOS and ARM and the install succeeds there without them.

Do not add `transformers>=5.16` to this environment to get the HF-native ESMFold2 class; that
combination has no solution against the `esm` pin. See section 7.

The hosted client ships with the `esm` package - no extra install for ESM3 or ESMC remote inference.

## Authentication

Hosted API access requires an API key. Never hardcode tokens in scripts or commit them to version control.

1. Check whether `ESM_API_KEY` is already set in the environment.
2. If not, check a local `.env` for `ESM_API_KEY` only (do not load unrelated secrets).
3. If still missing, create a key in the [Biohub developer console](https://biohub.ai/developer-console/api-keys). The API migrated from `forge.evolutionaryscale.ai` to `biohub.ai` — use Forge only for legacy access that has not been moved.

```python
import os

token = os.environ["ESM_API_KEY"]  # raises KeyError if unset
```

`esm.sdk.client()` reads `ESM_API_KEY` automatically when `token` is omitted. Keep endpoint URLs fixed to trusted hosts such as `https://biohub.ai`; do not take API hosts from untrusted user input.

**Biohub platform:** hosted models are served from [biohub.ai](https://biohub.ai); the API migrated there from Forge. SDK class names still reference "Forge", which is expected. See `references/biohub-platform.md` for ESMFold2 and Biohub-specific setup.

## Common Workflows

For detailed examples and complete workflows, see `references/workflows.md` which includes:
- Novel GFP design with chain-of-thought
- Protein variant generation and screening
- Structure-based sequence optimization
- Function prediction pipelines
- Embedding-based clustering and analysis

## References

This skill includes comprehensive reference documentation:

- `references/esm3-api.md` - ESM3 model architecture, API reference, generation parameters, and multimodal prompting
- `references/esm-c-api.md` - ESM C model details, embedding strategies, and performance optimization
- `references/forge-api.md` - Forge platform documentation, authentication, batch processing, and deployment
- `references/biohub-platform.md` - Biohub API migration, ESMFold2 structure prediction, and developer-console auth
- `references/workflows.md` - Complete examples and common workflow patterns

These references contain detailed API specifications, parameter descriptions, and advanced usage patterns. Load them as needed for specific tasks.

## Try it

A cold check on the claims this skill makes that are most likely to rot — whether the weights
are still open, whether ESMFold2 still hangs off ESMC-6B, and whether the dependency pin that
breaks upstream's own quickstart is still in place. **No GPU, no install, no account,
standard library only.** It reads metadata rather than downloading the ~27 GB.

**Data** — the Hugging Face model records for the three repos a local ESMFold2 run touches:

    https://huggingface.co/api/models/biohub/ESMFold2
    https://huggingface.co/api/models/biohub/ESMFold2-Fast
    https://huggingface.co/api/models/biohub/ESMC-6B

All three are ungated and need no account or licence acceptance; the two ESMFold2 cards are
tagged `mit` and ESMC-6B `mit, other` (see the note on `other` at the top of this skill). Last
confirmed reachable 2026-08-28.

```python
import json, urllib.request

def hf(repo):
    url = f"https://huggingface.co/api/models/{repo}"
    with urllib.request.urlopen(url, timeout=45) as r:
        return json.loads(r.read())

def raw(repo, path):
    url = f"https://huggingface.co/{repo}/raw/main/{path}"
    with urllib.request.urlopen(url, timeout=45) as r:
        return json.loads(r.read())

# --- 1. the weights are still open ------------------------------------------------
for repo, want in [("biohub/ESMFold2", ["mit"]),
                   ("biohub/ESMFold2-Fast", ["mit"]),
                   ("biohub/ESMC-6B", ["mit", "other"])]:
    m = hf(repo)
    lic = m["cardData"]["license"]
    lic = [lic] if isinstance(lic, str) else lic
    assert m["gated"] is False, f"{repo} became gated"
    assert lic == want, f"{repo} licence moved: {lic}"
    print(f"{repo:24s} gated={m['gated']!s:5s} licence={','.join(lic)}")

# --- 2. ESMFold2 is a head on ESMC-6B, and both checkpoints say so ----------------
for repo in ("biohub/ESMFold2", "biohub/ESMFold2-Fast"):
    cfg = raw(repo, "config.json")
    assert cfg["model_type"] == "esmfold2"
    assert cfg["esmc_id"] == "biohub/ESMC-6B", f"{repo} trunk moved to {cfg['esmc_id']}"
    print(f"{repo:24s} trunk={cfg['esmc_id']} msa_encoder={cfg['msa_encoder']['enabled']}")

# the -Fast variant must NOT read MSAs; that asymmetry is the silent trap
assert raw("biohub/ESMFold2", "config.json")["msa_encoder"]["enabled"] is True
assert raw("biohub/ESMFold2-Fast", "config.json")["msa_encoder"]["enabled"] is False

# --- 3. the files a local load needs are actually published ----------------------
files = {s["rfilename"] for s in hf("biohub/ESMFold2")["siblings"]}
assert {"model.safetensors", "config.json", "ccd.pkl"} <= files, sorted(files)
print("biohub/ESMFold2          publishes model.safetensors + config.json + ccd.pkl")

# --- 4. the transformers pin that breaks the model card's own quickstart ---------
with urllib.request.urlopen("https://pypi.org/pypi/esm/json", timeout=45) as r:
    info = json.loads(r.read())["info"]
pin = next(d for d in info["requires_dist"] if d.startswith("transformers"))
assert "<5.0.0" in pin, f"pin changed: {pin} - re-check the import advice in section 7"
print(f"esm {info['version']:8s} pins {pin}")
```

Expect:

```
biohub/ESMFold2          gated=False licence=mit
biohub/ESMFold2-Fast     gated=False licence=mit
biohub/ESMC-6B           gated=False licence=mit,other
biohub/ESMFold2          trunk=biohub/ESMC-6B msa_encoder=True
biohub/ESMFold2-Fast     trunk=biohub/ESMC-6B msa_encoder=False
biohub/ESMFold2          publishes model.safetensors + config.json + ccd.pkl
esm 3.4.0    pins transformers<5.0.0,>=4.57.6
```

Any assertion firing is a real change, not flake. A gated flag flipping to `True` or a licence
tag moving means the §3b position in this skill needs re-checking before anyone relies on it;
`esmc_id` moving means the download budget in section 7 is wrong; and the pin widening past
`<5.0.0` means the import warning there can finally be deleted.

## Best Practices

**For generation tasks:**
- Start with smaller models for prototyping (`esm3-open`)
- Use temperature parameter to control diversity (0.0 = deterministic, 1.0 = diverse)
- Implement iterative refinement with chain-of-thought for complex designs
- Validate generated sequences with structure prediction or wet-lab experiments

**For embedding tasks:**
- Batch process sequences when possible for efficiency
- Cache embeddings for repeated analyses
- Normalize embeddings when computing similarities
- Use appropriate model size based on downstream task requirements

**For production deployment:**
- Use the hosted Biohub API for scalability and the latest models
- Implement error handling and retry logic for API calls
- Monitor token usage and implement rate limiting
- Consider AWS SageMaker deployment for dedicated infrastructure

## Resources and Documentation

- **GitHub Repository:** https://github.com/Biohub/esm (current ESMC/ESMFold2/Biohub docs; ESM3 docs remain linked from the repository)
- **Forge Platform (legacy):** https://forge.evolutionaryscale.ai
- **Biohub Platform:** https://biohub.ai
- **Scientific Paper:** Hayes et al., Science (2025) - https://www.science.org/doi/10.1126/science.ads0018
- **Blog Posts:**
  - ESM3 Release: https://www.evolutionaryscale.ai/blog/esm3-release
  - ESM C Launch: https://www.evolutionaryscale.ai/blog/esm-cambrian
- **Community:** Slack community at https://bit.ly/3FKwcWd
- **Model Weights:** Hugging Face EvolutionaryScale and Biohub organizations

## Responsible Use

ESM is designed for beneficial applications in protein engineering, drug discovery, and scientific research. Follow the Responsible Biodesign Framework (https://responsiblebiodesign.ai/) and Biohub Acceptable Use Policy (https://biohub.org/acceptable-use-policy/) when designing novel proteins. Consider biosafety and ethical implications of protein designs before experimental validation.

