# Biohub Platform and ESMFold2

## Overview

EvolutionaryScale and Forge now surface current hosted ESM workflows through the [Biohub platform](https://biohub.ai). The Python SDK still uses `esm.sdk.forge` client classes and "Forge" naming in some places, but current Biohub APIs use `https://biohub.ai` endpoints.

Use this reference when you need **all-atom structure prediction** (ESMFold2) or when upstream docs point to `biohub.ai` instead of `forge.evolutionaryscale.ai`.

## Authentication

Create API keys in the [Biohub developer console](https://biohub.ai/developer-console/api-keys). Store the key in `ESM_API_KEY` (same env var used by `esm.sdk.client()` on Forge).

```python
import os

token = os.environ["ESM_API_KEY"]
```

Never commit API keys or paste them into notebooks checked into git.

## Installation

`uv pip install "esm==3.4.0"` is the standard reproducible path for everything in this skill, ESMFold2 included. Release 3.4.0 (2026-08-27) is the first on PyPI to carry the ESMFold2 model code, so the git install upstream still recommends is no longer required — the model card's "a PyPI release is coming soon" predates it.

If you do need a git install for something newer than the last release, avoid floating branch installs in automated or production instructions. Pin a full 40-character commit SHA from the official Biohub repository and review it before installing:

```bash
uv pip install "esm@git+https://github.com/Biohub/esm.git@<full-40-character-commit-sha>"
```

Confirm which install source your task requires before mixing PyPI and GitHub builds in one environment. The same caution applies to the third-party MLX port used for Apple Silicon inference, which upstream's own notebook installs from a personal fork at `@main`.

## ESMFold2 Structure Prediction

ESMFold2 is a structure prediction model built on a frozen ESMC 6B trunk. It runs two ways: **locally from open weights** (`biohub/ESMFold2` and `biohub/ESMFold2-Fast`, both MIT and ungated — covered in section 7 of `SKILL.md`, including the ~27 GB the trunk brings with it), or **hosted** through Biohub. Biohub lists ESMFold2 as a 2026-04/2026-05 model family and documents `esmfold2-fast-2026-05` for hosted inference.

For the hosted route, `esmfold2_client()` is the idiomatic entry point. It is a thin wrapper that returns a `SequenceStructureForgeInferenceClient` already pointed at `https://biohub.ai` with `esmfold2-fast-2026-05` as its default model, so the two forms are equivalent and the wrapper is less to get wrong:

```python
import os
from esm.sdk import esmfold2_client
from esm.sdk.api import FoldingConfig
from esm.models.esmfold2 import ProteinInput, StructurePredictionInput

client = esmfold2_client(
    model="esmfold2-fast-2026-05",
    token=os.environ["ESM_API_KEY"],
)

sequence = "MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK"

fold_input = StructurePredictionInput(
    sequences=[ProteinInput(id="A", sequence=sequence)]
)

config = FoldingConfig(num_loops=3, num_sampling_steps=32)
result = client.fold_all_atom(fold_input, config=config)

with open("result.cif", "w") as f:
    f.write(result.complex.to_mmcif())
```

## Hosted ESMC Embeddings

Biohub also documents hosted ESMC inference with `esmc_client()` and dated ESMC model IDs:

```python
import os
from esm.sdk import esmc_client
from esm.sdk.api import ESMProtein, LogitsConfig

model = esmc_client(
    model="esmc-600m-2024-12",
    url="https://biohub.ai",
    token=os.environ["ESM_API_KEY"],
)

protein = ESMProtein(sequence="MPRTKEINDAGLIVHSPQWFYK")
protein_tensor = model.encode(protein)
logits_output = model.logits(
    protein_tensor,
    LogitsConfig(sequence=True, return_embeddings=True),
)
embeddings = logits_output.embeddings
```

### Model IDs and local equivalents

| Hosted model ID | Local weights | Use case |
|----------|----------|----------|
| `esmfold2-fast-2026-05` | `biohub/ESMFold2-Fast` | Fast single-sequence folding; no MSA reader |
| Check Biohub docs for additional variants | `biohub/ESMFold2` | MSA-conditioned, higher accuracy on hard targets |

The `-Fast` checkpoint silently discards any MSA you attach rather than raising, so a paired alignment you spent effort building buys nothing unless you load the full model.

ESMFold2 predicts static all-atom structures, and does so for complexes — several chains, DNA, RNA, ligands by CCD code or SMILES, non-standard residues and covalent bonds. Every residue and atom index in that input grammar is 0-based. Treat outputs as hypotheses that require experimental validation, especially for therapeutic, clinical, or safety-sensitive uses.

## Relationship to Forge (ESM3 / ESM C)

| Capability | Typical endpoint | Client |
|------------|------------------|--------|
| ESM3 generation | `https://forge.evolutionaryscale.ai` | `esm.sdk.client()` or `ESM3ForgeInferenceClient` |
| ESM C 6B embeddings (hosted) | Forge | `ESM3ForgeInferenceClient` with `esmc-6b-2024-12` |
| ESMC hosted embeddings | `https://biohub.ai` | `esmc_client()` with dated ESMC model IDs |
| ESMFold2 structure prediction | `https://biohub.ai` | `SequenceStructureForgeInferenceClient` |

For ESM3 and ESM C cloud usage patterns, see `forge-api.md`. For local open-weight models, see `esm3-api.md` and `esm-c-api.md`.

## Additional Resources

- **Biohub:** https://biohub.ai
- **Biohub/esm repository:** https://github.com/Biohub/esm
- **Tutorials:** https://github.com/Biohub/esm/tree/main/cookbook/tutorials
- **ESMC & ESMFold2 preprint:** https://biohub.ai/papers/esm_protein.pdf
