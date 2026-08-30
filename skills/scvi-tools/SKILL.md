---
name: scvi-tools
description: Deep generative models for single-cell omics with scvi-tools — probabilistic batch correction (scVI), transfer learning, differential expression with uncertainty, and multi-modal integration (totalVI, MultiVI).
category: models
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.4.0
tags: [single-cell, batch-correction, generative-models, scvi, multimodal]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-30
  against: scvi-tools 1.5.0.post1 / torch 2.13.0 / scanpy 1.12.4 / Python 3.12.3
  executed: 3
  unverified: 1
  unverified_reason: >-
    The Typical Workflow block calls scvi.data.heart_cell_atlas_subsampled(), which
    downloads from exampledata.scverse.org, and the validating environment had no
    outbound route to that host — the block was not run rather than found broken.
    Re-run it from a host that can reach exampledata.scverse.org. The optional GPU
    line of the install block ("scvi-tools[cuda]") also went unrun for want of a CUDA
    host; the extra itself is present in the 1.5.0.post1 metadata.
---
# scvi-tools

## Overview

scvi-tools is a comprehensive Python framework for probabilistic models in single-cell genomics. Built on PyTorch and PyTorch Lightning, it provides deep generative models using variational inference for analyzing diverse single-cell data modalities. Current stable release: **scvi-tools 1.5.0** (July 2026).

**Model namespaces matter:** core models (scVI, scANVI, totalVI, MultiVI, PeakVI, AUTOZI, CondSCVI, DestVI, LinearSCVI, AmortizedLDA) live under `scvi.model`. Most other models (VeloVI, contrastiveVI, CellAssign, PoissonVI, scBasset, MrVI, MethylVI/MethylANVI, CytoVI, SysVI, Decipher, gimVI, scVIVA, ResolVI, Stereoscope, Solo, totalANVI, DIAGVI, DRVI, JointEmbeddingSCVI) live under `scvi.external`. The reference files specify the correct namespace per model. Class attributes are mostly upper-case (`scvi.external.VELOVI`, `scvi.external.POISSONVI`, `scvi.external.RNAStereoscope`) — take the exact spelling from the reference file rather than from the prose name.

## When to Use This Skill

Use this skill when:
- Analyzing single-cell RNA-seq data (dimensionality reduction, batch correction, integration)
- Working with single-cell ATAC-seq or chromatin accessibility data
- Integrating multimodal data (CITE-seq, multiome, paired/unpaired datasets)
- Analyzing spatial transcriptomics data (deconvolution, spatial mapping)
- Performing differential expression analysis on single-cell data
- Conducting cell type annotation or transfer learning tasks
- Working with specialized single-cell modalities (methylation, cytometry, RNA velocity)
- Building custom probabilistic models for single-cell analysis

## Core Capabilities

scvi-tools provides models organized by data modality:

### 1. Single-Cell RNA-seq Analysis
Core models for expression analysis, batch correction, and integration. See `references/models-scrna-seq.md` for:
- **scVI**: Unsupervised dimensionality reduction and batch correction
- **scANVI**: Semi-supervised cell type annotation and integration
- **AUTOZI**: Zero-inflation detection and modeling
- **VeloVI**: RNA velocity analysis
- **contrastiveVI**: Perturbation effect isolation
- **DRVI**: Unsupervised *disentangled* representation learning — a decoder-side constraint
  keeps latent dimensions from mixing, so they can be read one at a time
- **JointEmbeddingSCVI**: scVI variant trained with a cross-correlation objective on a
  binomially thinned view of the counts, for embeddings robust to dropout

### 2. Chromatin Accessibility (ATAC-seq)
Models for analyzing single-cell chromatin data. See `references/models-atac-seq.md` for:
- **PeakVI**: Peak-based ATAC-seq analysis and integration
- **PoissonVI**: Quantitative fragment count modeling
- **scBasset**: Deep learning approach with motif analysis

### 3. Multimodal & Multi-omics Integration
Joint analysis of multiple data types. See `references/models-multimodal.md` for:
- **totalVI**: CITE-seq protein and RNA joint modeling
- **totalANVI**: Semi-supervised CITE-seq (totalVI with cell-type labels)
- **MultiVI**: Paired and unpaired multi-omic integration (MuData-based)
- **MrVI**: Multi-resolution cross-sample analysis
- **DIAGVI**: Diagonal integration of unpaired single-cell datasets (added in 1.4.3)

### 4. Spatial Transcriptomics
Spatially-resolved transcriptomics analysis. See `references/models-spatial.md` for:
- **DestVI**: Multi-resolution spatial deconvolution
- **Stereoscope**: Cell type deconvolution
- **Tangram**: Spatial mapping and integration
- **scVIVA**: Cell-environment relationship analysis

### 5. Specialized Modalities
Additional specialized analysis tools. See `references/models-specialized.md` for:
- **MethylVI/MethylANVI**: Single-cell methylation analysis
- **CytoVI**: Flow/mass cytometry batch correction
- **Solo**: Doublet detection
- **CellAssign**: Marker-based cell type annotation

## Typical Workflow

All scvi-tools models follow a consistent API pattern:

```python
# 1. Load and preprocess data (AnnData format)
import scvi
import scanpy as sc

adata = scvi.data.heart_cell_atlas_subsampled()
sc.pp.filter_genes(adata, min_counts=3)
sc.pp.highly_variable_genes(adata, n_top_genes=1200)

# 2. Register data with model (specify layers, covariates)
scvi.model.SCVI.setup_anndata(
    adata,
    layer="counts",  # Use raw counts, not log-normalized
    batch_key="batch",
    categorical_covariate_keys=["donor"],
    continuous_covariate_keys=["percent_mito"]
)

# 3. Create and train model
model = scvi.model.SCVI(adata)
model.train()

# 4. Extract latent representations and normalized values
latent = model.get_latent_representation()
normalized = model.get_normalized_expression(library_size=1e4)

# 5. Store in AnnData for downstream analysis
adata.obsm["X_scVI"] = latent
adata.layers["scvi_normalized"] = normalized

# 6. Downstream analysis with scanpy
sc.pp.neighbors(adata, use_rep="X_scVI")
sc.tl.umap(adata)
sc.tl.leiden(adata)
```

**Key Design Principles:**
- **Raw counts required**: Models expect unnormalized count data for optimal performance
- **Unified API**: Consistent interface across all models (setup → train → extract)
- **AnnData-centric**: Seamless integration with the scanpy ecosystem
- **GPU acceleration**: Automatic utilization of available GPUs
- **Batch correction**: Handle technical variation through covariate registration

## Common Analysis Tasks

### Differential Expression
Probabilistic DE analysis using the learned generative models:

```python
de_results = model.differential_expression(
    groupby="cell_type",
    group1="TypeA",
    group2="TypeB",
    mode="change",  # Use composite hypothesis testing
    delta=0.25      # Minimum effect size threshold
)
```

See `references/differential-expression.md` for detailed methodology and interpretation.

### Model Persistence
Save and load trained models:

```python
# Save model
model.save("./model_directory", overwrite=True)

# Load model
model = scvi.model.SCVI.load("./model_directory", adata=adata)
```

### Batch Correction and Integration
Integrate datasets across batches or studies:

```python
# Register batch information
scvi.model.SCVI.setup_anndata(adata, batch_key="study")

# Model automatically learns batch-corrected representations
model = scvi.model.SCVI(adata)
model.train()
latent = model.get_latent_representation()  # Batch-corrected
```

## Theoretical Foundations

scvi-tools is built on:
- **Variational inference**: Approximate posterior distributions for scalable Bayesian inference
- **Deep generative models**: VAE architectures that learn complex data distributions
- **Amortized inference**: Shared neural networks for efficient learning across cells
- **Probabilistic modeling**: Principled uncertainty quantification and statistical testing

See `references/theoretical-foundations.md` for detailed background on the mathematical framework.

## Additional Resources

- **Workflows**: `references/workflows.md` contains common workflows, best practices, hyperparameter tuning, and GPU optimization
- **Model References**: Detailed documentation for each model category in the `references/` directory
- **Official Documentation**: https://docs.scvi-tools.org/en/stable/
- **Tutorials**: https://docs.scvi-tools.org/en/stable/tutorials/index.html
- **API Reference**: https://docs.scvi-tools.org/en/stable/api/index.html

## Installation

Requires Python **3.12+** (scvi-tools 1.4 dropped older versions).

```bash
uv pip install scvi-tools
# For GPU support
uv pip install "scvi-tools[cuda]"
```

For reproducible environments, pin a version: `uv pip install scvi-tools==1.5.0.post1`.

The scanpy steps in the workflow above need one extra: `sc.tl.leiden` raises
`ModuleNotFoundError` on a stock install, so add `uv pip install "scanpy[leiden]"` (or
`leidenalg`) before clustering.

**Compute backends:** training runs on PyTorch (CPU/GPU/TPU). **JAX support was removed in
1.5.0** — `scvi.model.JaxSCVI` no longer exists (`AttributeError`), and models that once
defaulted to JAX now run on PyTorch, including `scvi.external.MRVI` and
`scvi.external.Tangram`. An experimental MLX backend for Apple silicon
(`scvi.model.mlxSCVI`) remains, and raises `ModuleNotFoundError` until `mlx` is installed.

## Best Practices

1. **Use raw counts**: Always provide unnormalized count data to models
2. **Filter genes**: Remove low-count genes before analysis (e.g., `min_counts=3`)
3. **Register covariates**: Include known technical factors (batch, donor, etc.) in `setup_anndata`
4. **Feature selection**: Use highly variable genes for improved performance
5. **Model saving**: Always save trained models to avoid retraining
6. **GPU usage**: Enable GPU acceleration for large datasets (`accelerator="gpu"`)
7. **Scanpy integration**: Store outputs in AnnData objects for downstream analysis
8. **Out-of-core training**: For collections too large to hold in memory, `scvi.dataloaders.AnnbatchDataModule` (1.5.0+) wraps an `annbatch.Loader` over sharded Zarr and passes batch and covariate keys through to the model

## Try it

A self-contained check that this skill still works. No account, no key, no download, no GPU.

**Data** — generated inline by the library itself, which is why the frontmatter declares
`datasets: []`. `scvi.data.synthetic_iid()` ships with scvi-tools and draws 400 cells by 100
genes across two batches and three labels. The real-data route is the *Typical Workflow*
block above, which pulls the heart cell atlas from a server; this section deliberately takes
the other path, because every claim below is about how a **trained model** behaves and a
fetched matrix would put somebody else's host in the way of testing that. It also draws every
label from the same distribution, so **nothing in it is truly differentially expressed** —
which is what makes the differential-expression result below a test rather than a decoration.

**Run** — needs Python 3.12+. Takes well under a minute on CPU:

```bash
uv pip install "scvi-tools==1.5.0.post1"
```

```python
import numpy as np
import scvi

scvi.settings.seed = 0                      # every number below is reproducible with this
adata = scvi.data.synthetic_iid()           # 400 cells x 100 genes, 2 batches, 3 labels
assert adata.shape == (400, 100)

# The trap the Overview opens with: the prose name is not the class attribute, and the
# namespace differs per model. CytoVI is spelled CYTOVI, and it is in scvi.external.
assert hasattr(scvi.external, "CYTOVI")
assert not hasattr(scvi.external, "CytoVI")
assert not hasattr(scvi.model, "CYTOVI")

# JAX went away in 1.5.0. This is an AttributeError, not a missing optional dependency.
try:
    scvi.model.JaxSCVI
    raise SystemExit("JaxSCVI still exists — this skill is out of date")
except AttributeError:
    print("JaxSCVI        : AttributeError, as documented")

scvi.model.SCVI.setup_anndata(adata, batch_key="batch", labels_key="labels")
model = scvi.model.SCVI(adata, n_latent=10)
model.train(max_epochs=20)

# One row per cell, one column per latent dimension.
latent = model.get_latent_representation()
assert latent.shape == (adata.n_obs, 10)

# library_size is honoured: each cell's normalized profile sums to it.
norm = model.get_normalized_expression(library_size=1e4)
assert np.allclose(np.asarray(norm).sum(axis=1), 1e4, rtol=1e-5)

# One row per gene, carrying the composite-hypothesis columns `mode="change"` adds.
de = model.differential_expression(
    groupby="labels", group1="label_0", group2="label_1",
    mode="change", delta=0.25, silent=True,
)
assert len(de) == adata.n_vars
assert {"proba_de", "lfc_mean", "is_de_fdr_0.05"} <= set(de.columns)

# A reloaded model is the same model, not merely a similar one.
model.save("scvi_try_it", overwrite=True)
reloaded = scvi.model.SCVI.load("scvi_try_it", adata=adata)
assert np.array_equal(reloaded.get_latent_representation(), latent)

print("latent shape   :", latent.shape)
print("row sums       : %.2f" % np.asarray(norm).sum(axis=1).mean())
print("genes called DE:", int(de["is_de_fdr_0.05"].sum()), "of", len(de))
print("max proba_de   : %.4f" % de["proba_de"].max())
```

**Expect**

*Invariants* — these hold across versions, and a failure means the skill is **wrong**:

- `latent` is `(400, 10)` — one row per cell, one column per latent dimension.
- Every row of `get_normalized_expression(library_size=1e4)` sums to 10000.
- `differential_expression` returns one row per gene (100), carrying `proba_de`,
  `lfc_mean` and `is_de_fdr_0.05`.
- A saved model reloads to *identical* latent coordinates, not approximately equal ones.
- `scvi.external.CYTOVI` exists while `scvi.external.CytoVI` does not, and
  `scvi.model.JaxSCVI` raises `AttributeError`.

*Observed* on scvi-tools 1.5.0.post1 / torch 2.13.0 / Python 3.12.3, 2026-08-30 — a
mismatch here is **drift to investigate**, not a bug:

```
JaxSCVI        : AttributeError, as documented
latent shape   : (400, 10)
row sums       : 10000.00
genes called DE: 0 of 100
max proba_de   : 0.2926
```

`genes called DE: 0` is the line to read closely. The generator draws all three labels from
one distribution, so a correct change-mode test should call nothing significant on it; a
non-zero count means the test is finding structure that is not there. With the seed pinned
the run is deterministic — repeated runs returned these numbers unchanged.

