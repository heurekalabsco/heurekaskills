---
name: anndata
description: Work with AnnData annotated matrices and .h5ad files — layers, obs/var metadata, sparse backing, on-disk access, and format conversion. The data-format layer under the single-cell ecosystem.
category: utility
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.2.0
tags: [h5ad, single-cell, data-format, scverse]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-23
  against: anndata 0.13.2 / scanpy 1.12.3 / Python 3.12.11
  executed: 7
  unverified: 2
  unverified_reason: >-
    The scanpy clustering block needs leidenalg, which scanpy 1.12.3 keeps behind its
    `leiden` extra, and the AnnLoader block needs torch. Both run once those are
    installed. The Muon block is excluded from the denominator rather than counted
    unverified — it references variables this page never creates, so it cannot run
    standalone whether or not muon is present.
---
# AnnData

## Overview

AnnData is a Python package for handling annotated data matrices, storing experimental measurements (X) alongside observation metadata (obs), variable metadata (var), and multi-dimensional annotations (obsm, varm, obsp, varp, uns). Originally designed for single-cell genomics through Scanpy, it now serves as a general-purpose framework for any annotated data requiring efficient storage, manipulation, and analysis.

## When to Use This Skill

Use this skill when:
- Creating, reading, or writing AnnData objects
- Working with h5ad, zarr, or other genomics data formats
- Performing single-cell RNA-seq analysis
- Managing large datasets with sparse matrices or backed mode
- Concatenating multiple datasets or experimental batches
- Subsetting, filtering, or transforming annotated data
- Integrating with scanpy, scvi-tools, or other scverse ecosystem tools

## Installation

Requires Python 3.12+ — 0.13 dropped 3.11. Current stable release: 0.13.2 (released 2026-07-13).

```bash
uv pip install "anndata==0.13.2"

# Lazy I/O and dask-backed operations
uv pip install "anndata[dask,lazy]==0.13.2"
```

Use unpinned installs only when intentionally tracking the latest compatible release.

The extras 0.13 publishes are `dask`, `lazy`, `gpu`, `cu11`, `cu12` and `cu13` — the
`cu*` ones pull CUDA wheels, so ask for them only on a GPU box. The contributor extras
0.12 carried (`dev`, `test`, `doc`) were dropped, and asking for one now succeeds and
installs nothing extra rather than failing — so a stale `[dev]` in a script keeps
working while silently giving you none of what it used to. **Both installers warn**, and
both still exit 0, so the failure is a line in a log rather than a broken build:

```
pip  WARNING: anndata 0.13.2 does not provide the extra 'dev'
uv   warning: The package `anndata==0.13.2` does not have an extra named `dev`
```

Checked 2026-08-23 against pip 26.2.1 and uv 0.9.24, for `dev`, `test` and `doc`.

Current API notes:
- Use `anndata.io` for non-native `read_*` and `write_*` helpers. Top-level `anndata.read_h5ad` and `anndata.read_zarr` remain supported.
- **Removed in 0.13**, not merely deprecated — `ad.read` and `AnnData.concatenate()` now raise `AttributeError`. Use `ad.read_h5ad` and `ad.concat`.
- Still deprecated and still working: `AnnData.*_keys()` (use the mapping's own `.keys()`) and `anndata.__version__` (use `importlib.metadata.version("anndata")`).
- Treat `anndata.experimental` APIs as useful but unstable. Prefer them for large-data workflows only when their current caveats are acceptable.

### Behaviour changes in 0.13 to know before writing code

These bite silently — the old form either raises or quietly does something different.

- **No `dtype=` on the constructor.** `ad.AnnData(X, dtype='float32')` raises `TypeError`. Cast first: `ad.AnnData(X.astype('float32'))`.
- **Writing to a subset's `.X` no longer reaches the parent.** `.X` now behaves the way `.layers` and the other slots already did, so `my_subset.X = 0` leaves the object the subset came from untouched. Assign into the original, or take an explicit `.copy()` and keep the result.
- **`adata['key'] = ...` is gone.** `AnnData.__setitem__` and `__delitem__` were removed; write to `.obs`, `.var`, `.layers`, `.obsm` or `.uns` explicitly.
- **`.X` now surfaces as a layer under the `None` key.** The text repr shows `layers: None (.X)`, and `list(adata.layers.keys())` returns `[None]` for an object whose `.layers` you never touched. Code that treated a non-empty `.layers` as proof that someone added one needs updating.
- **Zarr needs the v3 package line** (`zarr>=3.1`), and new stores are written in zarr format 3 with sharding on by default. Both remain settings you can change — see *Troubleshooting*.

## Quick Start

### Creating an AnnData object
```python
import anndata as ad
import numpy as np
import pandas as pd

# Minimal creation
X = np.random.rand(100, 2000)  # 100 cells × 2000 genes
adata = ad.AnnData(X)

# With metadata
obs = pd.DataFrame({
    'cell_type': ['T cell', 'B cell'] * 50,
    'sample': ['A', 'B'] * 50
}, index=[f'cell_{i}' for i in range(100)])

var = pd.DataFrame({
    'gene_name': [f'Gene_{i}' for i in range(2000)]
}, index=[f'ENSG{i:05d}' for i in range(2000)])

adata = ad.AnnData(X=X, obs=obs, var=var)
```

### Reading data
```python
# Native formats (read_h5ad/read_zarr remain at top-level)
adata = ad.read_h5ad('data.h5ad')
adata = ad.read_h5ad('large_data.h5ad', backed='r')  # lazy load for large files
adata = ad.read_zarr('data.zarr')

# Other formats: prefer anndata.io (top-level imports are deprecated)
from anndata.io import read_csv, read_loom, read_mtx

adata = read_csv('data.csv')
adata = read_loom('data.loom')

# 10X Genomics: read with scanpy.read_10x_mtx / read_10x_h5, not anndata directly
import scanpy as sc
adata = sc.read_10x_h5('filtered_feature_bc_matrix.h5')
adata = sc.read_10x_mtx('filtered_feature_bc_matrix/')
```

### Writing data
```python
# Write h5ad file
adata.write_h5ad('output.h5ad')

# Write with compression
adata.write_h5ad('output.h5ad', compression='gzip')

# Write other formats
adata.write_zarr('output.zarr')
adata.write_csvs('output_dir/')
```

### Basic operations
```python
# Subset by conditions
t_cells = adata[adata.obs['cell_type'] == 'T cell']

# Subset by indices
subset = adata[0:50, 0:100]

# Add metadata
adata.obs['quality_score'] = np.random.rand(adata.n_obs)
adata.var['highly_variable'] = np.random.rand(adata.n_vars) > 0.8

# Access dimensions
print(f"{adata.n_obs} observations × {adata.n_vars} variables")
```

## Core Capabilities

### 1. Data Structure

Understand the AnnData object structure including X, obs, var, layers, obsm, varm, obsp, varp, uns, and raw components.

**See**: `references/data_structure.md` for comprehensive information on:
- Core components (X, obs, var, layers, obsm, varm, obsp, varp, uns, raw)
- Creating AnnData objects from various sources
- Accessing and manipulating data components
- Memory-efficient practices

### 2. Input/Output Operations

Read and write data in various formats with support for compression, backed mode, and cloud storage.

**See**: `references/io_operations.md` for details on:
- Native formats (h5ad, zarr)
- Alternative formats (CSV, MTX, Loom, 10X, Excel)
- Backed mode for large datasets
- Remote data access
- Format conversion
- Performance optimization

Common commands:
```python
from anndata.io import read_mtx

# Read/write h5ad
adata = ad.read_h5ad('data.h5ad', backed='r')
adata.write_h5ad('output.h5ad', compression='gzip')

# 10X Genomics (via scanpy)
import scanpy as sc
adata = sc.read_10x_h5('filtered_feature_bc_matrix.h5')

# Read MTX format
adata = read_mtx('matrix.mtx').T
```

### 3. Concatenation

Combine multiple AnnData objects along observations or variables with flexible join strategies.

**See**: `references/concatenation.md` for comprehensive coverage of:
- Basic concatenation (axis=0 for observations, axis=1 for variables)
- Join types (inner, outer)
- Merge strategies (same, unique, first, only)
- Tracking data sources with labels
- Lazy concatenation (AnnCollection)
- On-disk concatenation for large datasets

Common commands:
```python
# Concatenate observations (combine samples)
adata = ad.concat(
    [adata1, adata2, adata3],
    axis=0,
    join='inner',
    label='batch',
    keys=['batch1', 'batch2', 'batch3']
)

# Concatenate variables (combine modalities)
adata = ad.concat([adata_rna, adata_protein], axis=1)

# Lazy collection over backed AnnData objects (experimental)
from anndata.experimental import AnnCollection

backed_adatas = [
    ad.read_h5ad(path, backed='r')
    for path in ['data1.h5ad', 'data2.h5ad']
]
collection = AnnCollection(
    backed_adatas,
    join_obs='outer',
    join_vars='inner',
    label='dataset'
)
```

### 4. Data Manipulation

Transform, subset, filter, and reorganize data efficiently.

**See**: `references/manipulation.md` for detailed guidance on:
- Subsetting (by indices, names, boolean masks, metadata conditions)
- Transposition
- Copying (full copies vs views)
- Renaming (observations, variables, categories)
- Type conversions (strings to categoricals, sparse/dense)
- Adding/removing data components
- Reordering
- Quality control filtering

Common commands:
```python
# Subset by metadata
filtered = adata[adata.obs['quality_score'] > 0.8]
hv_genes = adata[:, adata.var['highly_variable']]

# Transpose
adata_T = adata.T

# Copy vs view
view = adata[0:100, :]  # View (lightweight reference)
copy = adata[0:100, :].copy()  # Independent copy

# Convert strings to categoricals
adata.strings_to_categoricals()
```

### 5. Best Practices

Follow recommended patterns for memory efficiency, performance, and reproducibility.

**See**: `references/best_practices.md` for guidelines on:
- Memory management (sparse matrices, categoricals, backed mode)
- Views vs copies
- Data storage optimization
- Performance optimization
- Working with raw data
- Metadata management
- Reproducibility
- Error handling
- Integration with other tools
- Common pitfalls and solutions

Key recommendations:
```python
# Use sparse matrices for sparse data
from scipy.sparse import csr_matrix
adata.X = csr_matrix(adata.X)

# Convert strings to categoricals
adata.strings_to_categoricals()

# Use backed mode for large files
adata = ad.read_h5ad('large.h5ad', backed='r')

# Store raw before filtering
adata.raw = adata.copy()
adata = adata[:, adata.var['highly_variable']]
```

## Integration with Scverse Ecosystem

AnnData serves as the foundational data structure for the scverse ecosystem:

### Scanpy (Single-cell analysis)
```python
import scanpy as sc

# Preprocessing
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata, n_top_genes=2000)

# Dimensionality reduction
sc.pp.pca(adata, n_comps=50)
sc.pp.neighbors(adata, n_neighbors=15)
sc.tl.umap(adata)
sc.tl.leiden(adata)   # needs scanpy[leiden] — leidenalg is not in the base install

# Visualization
sc.pl.umap(adata, color=['cell_type', 'leiden'])
```

### Muon (Multimodal data)
```python
import muon as mu

# Combine RNA and protein data
mdata = mu.MuData({'rna': adata_rna, 'protein': adata_protein})
```

### PyTorch integration

`AnnLoader` still works in 0.13 but warns on construction that it is deprecated and
points at `annbatch.Loader` as its replacement. Prefer `annbatch` for new code.

```python
from anndata.experimental import AnnLoader

# Create DataLoader for deep learning
dataloader = AnnLoader(adata, batch_size=128, shuffle=True)

for batch in dataloader:
    X = batch.X
    # Train model
```

## Common Workflows

### Single-cell RNA-seq analysis
```python
import anndata as ad
import scanpy as sc

# 1. Load data (10X via scanpy; anndata handles h5ad/zarr natively)
adata = sc.read_10x_h5('filtered_feature_bc_matrix.h5')

# 2. Quality control
adata.obs['n_genes'] = (adata.X > 0).sum(axis=1)
adata.obs['n_counts'] = adata.X.sum(axis=1)
adata = adata[adata.obs['n_genes'] > 200]
adata = adata[adata.obs['n_counts'] < 50000]

# 3. Store raw
adata.raw = adata.copy()

# 4. Normalize and filter
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata, n_top_genes=2000)
adata = adata[:, adata.var['highly_variable']]

# 5. Save processed data
adata.write_h5ad('processed.h5ad')
```

### Batch integration
```python
# Load multiple batches
adata1 = ad.read_h5ad('batch1.h5ad')
adata2 = ad.read_h5ad('batch2.h5ad')
adata3 = ad.read_h5ad('batch3.h5ad')

# Concatenate with batch labels
adata = ad.concat(
    [adata1, adata2, adata3],
    label='batch',
    keys=['batch1', 'batch2', 'batch3'],
    join='inner'
)

# Apply batch correction
import scanpy as sc
sc.pp.combat(adata, key='batch')

# Continue analysis
sc.pp.pca(adata)
sc.pp.neighbors(adata)
sc.tl.umap(adata)
```

### Working with large datasets
```python
# Open in backed mode
adata = ad.read_h5ad('100GB_dataset.h5ad', backed='r')

# Filter based on metadata (no data loading)
high_quality = adata[adata.obs['quality_score'] > 0.8]

# Load filtered subset
adata_subset = high_quality.to_memory()

# Process subset
process(adata_subset)

# Or process in chunks
chunk_size = 1000
for i in range(0, adata.n_obs, chunk_size):
    chunk = adata[i:i+chunk_size, :].to_memory()
    process(chunk)
```

## Troubleshooting

### Out of memory errors
Use backed mode or convert to sparse matrices:
```python
# Backed mode
adata = ad.read_h5ad('file.h5ad', backed='r')

# Sparse matrices
from scipy.sparse import csr_matrix
adata.X = csr_matrix(adata.X)
```

### Slow file reading
Use compression and appropriate formats:
```python
# Optimize for storage
adata.strings_to_categoricals()
adata.write_h5ad('file.h5ad', compression='gzip')

# Use Zarr for cloud storage. In 0.13 both of these are already the defaults —
# set them explicitly only to pin the behaviour, or to opt back out.
import anndata as ad

ad.settings.zarr_write_format = 3      # default 3 since 0.13; set 2 to write v2 stores
ad.settings.auto_shard_zarr_v3 = True  # default True since 0.13
adata.write_zarr('file.zarr', chunks=(1000, 1000))
```

### Index alignment issues
Always align external data on index:
```python
# Wrong
adata.obs['new_col'] = external_data['values']

# Correct
adata.obs['new_col'] = external_data.set_index('cell_id').loc[adata.obs_names, 'values']
```

## Try it

A self-contained check that this skill still works. No account, no key, no download.

**Data** — generated inline, which is why the frontmatter declares `datasets: []`. AnnData is
the container rather than the contents: every claim below is about how the object behaves, so
a fetched file would test somebody else's server instead. Six cells by four genes is enough to
show all of it, and nothing here can rot behind a URL.

The block deliberately runs at the two places 0.13 changed under existing code. Both are silent
failures — the old form still executes, it just no longer does what it used to.

**Run** — needs Python 3.12+:

```bash
uv pip install "anndata==0.13.2"
```

```python
import importlib.metadata as md
import numpy as np, pandas as pd, anndata as ad

rng = np.random.default_rng(0)
adata = ad.AnnData(
    X=rng.random((6, 4)),
    obs=pd.DataFrame({"cell_type": ["T", "B"] * 3},
                     index=[f"cell_{i}" for i in range(6)]),
    var=pd.DataFrame({"gene_name": [f"Gene_{j}" for j in range(4)]},
                     index=[f"ENSG{j:05d}" for j in range(4)]),
)

# .X is exposed as a layer under the None key, on an object whose .layers
# nobody has touched. Code that reads a non-empty .layers as "someone added
# one" is wrong from 0.13 on.
assert list(adata.layers.keys()) == [None]
assert "layers: None (.X)" in repr(adata)
print("layers keys    :", list(adata.layers.keys()))

# Writing .X through a subset does NOT reach the object it came from.
before = adata.X[0:3].copy()
subset = adata[0:3]                                 # a view
subset.X = np.zeros((3, 4))                         # warns: view -> actual
assert np.array_equal(adata.X[0:3], before)         # parent untouched
assert np.array_equal(subset.X, np.zeros((3, 4)))   # the write landed on the copy
print("parent intact  :", np.array_equal(adata.X[0:3], before))

# The constructor takes no dtype=; cast before you build.
try:
    ad.AnnData(rng.random((6, 4)), dtype="float32")
    raise SystemExit("dtype= was accepted — this skill is out of date")
except TypeError:
    print("dtype= kwarg   : TypeError, as documented")

# Removed in 0.13, not deprecated.
assert not hasattr(ad, "read")
assert not hasattr(ad.AnnData, "concatenate")

# h5ad round-trip preserves values and metadata.
adata.write_h5ad("try_it.h5ad")
back = ad.read_h5ad("try_it.h5ad")
assert np.array_equal(back.X, adata.X)
assert back.obs["cell_type"].tolist() == adata.obs["cell_type"].tolist()
assert back.var_names.tolist() == adata.var_names.tolist()
print("h5ad round-trip: X, obs and var_names all identical")

print("anndata        :", md.version("anndata"))
print("X[0, 0]        : %.6f" % adata.X[0, 0])
print("zarr defaults  : format", ad.settings.zarr_write_format,
      "| auto-shard", ad.settings.auto_shard_zarr_v3)
```

**Expect** — every `assert` above is an **invariant**: it holds for any 0.13.x, and a failure
means this skill is wrong rather than merely stale. The block exits 0 and prints:

```
layers keys    : [None]
parent intact  : True
dtype= kwarg   : TypeError, as documented
h5ad round-trip: X, obs and var_names all identical
anndata        : 0.13.2
X[0, 0]        : 0.636962
zarr defaults  : format 3 | auto-shard True
```

One line on stderr is expected and is not a failure — assigning `.X` on a view is what
turns it into a real object:

```
ImplicitModificationWarning: Setting element `.X` of view, initializing view as actual.
```

The last three printed lines are **observed values**, recorded 2026-08-23 against anndata
0.13.2. A change there is drift to investigate, not a bug: `0.636962` is the first draw of
NumPy's PCG64 from seed 0 and moves only if that generator does, and the two zarr defaults
became defaults in 0.13 and are settings a caller can override.

## Additional Resources

- **Official documentation**: https://anndata.readthedocs.io/
- **Scanpy tutorials**: https://scanpy.readthedocs.io/
- **Scverse ecosystem**: https://scverse.org/
- **GitHub repository**: https://github.com/scverse/anndata

