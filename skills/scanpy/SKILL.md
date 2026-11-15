---
name: scanpy
description: Analyze single-cell RNA-seq count matrices in Python with Scanpy — QC metrics and outlier filtering, doublet calls, normalization, highly variable genes, PCA, neighbors, UMAP, Leiden clustering and marker genes — while keeping the raw counts intact for downstream tools.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [single-cell, scverse, transcriptomics, clustering, rna-seq]
datasets: [https://exampledata.scverse.org/scanpy/pbmc3k_raw.h5ad, https://cf.10xgenomics.com/samples/cell-exp/3.0.0/pbmc_1k_v3/pbmc_1k_v3_filtered_feature_bc_matrix.h5, https://cf.10xgenomics.com/samples/cell-exp/3.0.0/neuron_1k_v3/neuron_1k_v3_filtered_feature_bc_matrix.h5]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: scanpy 1.12.5 / anndata 0.13.4 / igraph 1.0.0 / leidenalg 0.12.0 / scikit-misc 0.5.3 / scikit-image 0.26.0 / numpy 2.5.4 / pandas 3.1.1 / Python 3.12 on macOS arm64 / install block run with uv pip into a fresh venv / all workflow blocks run in page order in one fresh directory and Try it run again alone in a second fresh directory / the same pipeline also run on 10x pbmc_1k_v3 (human, Chromium v3) and neuron_1k_v3 (mouse brain, lowercase mt- genes)
  executed: 11
  unverified: 0
---
# Scanpy

Scanpy is the scverse toolkit for single-cell expression analysis. It works on an AnnData
object — cells in rows (`obs`), genes in columns (`var`), the matrix in `X`, and extra
matrices in `layers`. The file format and the object itself are covered by `anndata`; this
page is about the analysis.

The standard path is short, and each step changes `X` in place. That is where nearly every
mistake comes from: a step that expects counts receives log-normalized values, or the
"saved" counts turn out to be the same array that was just normalized. Neither raises an
error. Read *Traps* before adapting the pipeline.

## Install

Leiden clustering, the `seurat_v3` gene selector and Scrublet are optional extras.

```bash
python -m pip install "scanpy[leiden,skmisc,scrublet]"
```

No account, key or GPU is needed. Everything below runs on a laptop in under a minute for a
few thousand cells.

## The workflow

The blocks below run in order in one Python session. They use the 10x PBMC 3k dataset, the
raw unfiltered-by-QC count matrix that scverse hosts as an `.h5ad`.

### 1. Load counts

```python
import numpy as np
import scanpy as sc

url = "https://exampledata.scverse.org/scanpy/pbmc3k_raw.h5ad"
adata = sc.read("pbmc3k_raw.h5ad", backup_url=url)
adata.var_names_make_unique()
print(adata)

X = adata.X
vals = X.data if hasattr(X, "data") else np.asarray(X).ravel()
assert np.allclose(vals, np.round(vals)) and vals.min() >= 0, "X is not raw counts"
```

For Cell Ranger output use `sc.read_10x_h5("filtered_feature_bc_matrix.h5")` or
`sc.read_10x_mtx("filtered_feature_bc_matrix/")`. Both return gene symbols as `var_names`
with Ensembl IDs in `var["gene_ids"]`. Symbols are not unique — always call
`var_names_make_unique()` before anything indexes by name.

`sc.read(..., backup_url=...)` downloads the file only if it is not already on disk. Fetching
the same URL with plain `urllib.request.urlretrieve` returns `HTTP 403` from this host on
2026-11-06 (it rejects Python's default user agent); scanpy's downloader and `curl` both work.

The final assertion matters. Public `.h5ad` files are often already normalized, and every
step below assumes integer counts. If it fails, look in `adata.layers` and `adata.raw` for
the counts before going further.

### 2. QC metrics and cell filtering

Mitochondrial genes are `MT-` in human and `mt-` in mouse. A case-sensitive `MT-` prefix
finds zero genes in a mouse dataset, the QC filter then removes nothing, and nothing warns.
Match case-insensitively and check the count.

```python
adata.var["mt"] = adata.var_names.str.upper().str.startswith("MT-")
assert adata.var["mt"].sum() > 0, "no mitochondrial genes found — check the gene naming"

sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], percent_top=None, log1p=True, inplace=True)

def mad_outlier(x, nmads):
    med = np.median(x)
    return np.abs(x - med) > nmads * np.median(np.abs(x - med))

low_quality = (
    mad_outlier(adata.obs["log1p_total_counts"], 5)
    | mad_outlier(adata.obs["log1p_n_genes_by_counts"], 5)
    | (adata.obs["pct_counts_mt"] > 20)
)
print(f"removing {int(low_quality.sum())} of {adata.n_obs} cells")
adata = adata[~low_quality].copy()
sc.pp.filter_genes(adata, min_cells=3)
```

Thresholds relative to the sample's own distribution (median absolute deviations) travel
between datasets better than fixed cut-offs like "200 genes". The mitochondrial ceiling is
tissue-dependent: 20% is ordinary for PBMCs, too strict for heart or kidney. Filter each
sample separately before combining samples — a pooled median hides a bad library.

Always end a subset with `.copy()`. A slice is a view, and writing to a view either warns or
silently copies, depending on the operation.

### 3. Doublets

Scrublet simulates doublets from the cells you have, so it runs on counts and per sample.
With several samples pass `batch_key="sample"`.

```python
sc.pp.scrublet(adata, random_state=0, verbose=False)
print(adata.obs["predicted_doublet"].value_counts())
adata = adata[~adata.obs["predicted_doublet"]].copy()
```

### 4. Keep the counts, then normalize

```python
adata.layers["counts"] = adata.X.copy()

sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

assert adata.layers["counts"].max() > 50, "counts layer was overwritten"
```

The `.copy()` is not optional — see *Traps*. After this block `X` holds log-normalized
values and `layers["counts"]` holds integers. Tools that model counts — scVI (`scvi-tools`),
pseudobulk differential expression (`pydeseq2`) — read the layer.

`target_sum=1e4` is the conventional scale. Leaving it at `None` scales to the median
library size instead, which changes the numbers but not the structure.

### 5. Highly variable genes

```python
sc.pp.highly_variable_genes(adata, flavor="seurat_v3", layer="counts", n_top_genes=2000)
print(int(adata.var["highly_variable"].sum()), "highly variable genes")
```

Which input each flavor expects:

| flavor | input | note |
|---|---|---|
| `seurat_v3`, `seurat_v3_paper` | counts | needs `n_top_genes`; pass `layer="counts"` |
| `seurat` (default), `cell_ranger` | log-normalized `X` | `cell_ranger` is meant for `n_top_genes` |
| `pearson_residuals` | counts | under `sc.experimental.pp` |

Give `seurat_v3` log-normalized data and it only emits a `UserWarning` about non-integers,
then returns a gene list anyway. For multiple samples add `batch_key="sample"` so a gene
variable in only one batch does not dominate.

Leave `subset=False` (the default). The `highly_variable` column is a mask that PCA picks up
by itself; subsetting deletes every other gene, so a marker you want to plot or test later
is gone.

### 6. PCA, neighbors, UMAP, clusters

```python
import matplotlib
matplotlib.use("Agg")

sc.pp.pca(adata, n_comps=50)
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata, random_state=0)
sc.tl.leiden(adata, flavor="igraph", n_iterations=2, resolution=1.0, random_state=0)

print(adata.obs["leiden"].value_counts().sort_index())
ax = sc.pl.umap(adata, color=["leiden", "LYZ", "MS4A1"], show=False)
ax[0].figure.savefig("umap.png", dpi=150, bbox_inches="tight")
```

`pca` uses `var["highly_variable"]` automatically when the column exists. Choose `n_pcs`
from the variance curve (`sc.pl.pca_variance_ratio`), not by habit.

Pass `flavor="igraph", n_iterations=2` to `leiden`. Without it, scanpy 1.12 still uses the
slower `leidenalg` backend with iterations until convergence, and warns that the default
will change to igraph — so code that omits it will give different clusters after an
upgrade. `resolution` controls the number of clusters, and no value is correct a priori;
report the one you used.

UMAP is a picture. Distances between clusters on it are not meaningful; never quantify on
UMAP coordinates. Clustering runs on the neighbor graph, not on the UMAP.

### 7. Marker genes

```python
sc.tl.rank_genes_groups(adata, "leiden", method="wilcoxon", use_raw=False)
markers = sc.get.rank_genes_groups_df(adata, group=None)
markers.to_csv("markers.csv", index=False)
print(markers.groupby("group", observed=True).head(3))
```

`logfoldchanges` is computed by undoing `log1p`, so it is only meaningful on log-normalized
input — which is why `use_raw=False` is explicit here (see *Traps* on `.raw`). These
cell-level p-values treat every cell as independent; they rank markers within one dataset
and are not evidence of differential expression between conditions. For conditions with
biological replicates, aggregate counts per sample and cluster and test the pseudobulk —
`pydeseq2` covers that.

### 8. Save

```python
adata.write_h5ad("pbmc3k_processed.h5ad", compression="gzip")
back = sc.read_h5ad("pbmc3k_processed.h5ad")
assert back.layers["counts"].max() > 50 and "leiden" in back.obs
print(back)
```

## Traps

**Saving counts without `.copy()` saves nothing.** `adata.layers["counts"] = adata.X` and
`adata.raw = adata` both keep a reference to the same sparse buffer in anndata 0.13.
`normalize_total` and `log1p` then modify that buffer in place, so the "counts" become
log-normalized values, with no warning. This block shows it on a toy matrix:

```python
import numpy as np
import scipy.sparse as sp
import anndata as ad
import scanpy as sc

counts = sp.random(200, 50, density=0.3, format="csr", random_state=0)
counts.data = np.ceil(counts.data * 20)

a = ad.AnnData(counts.copy())
a.layers["counts"] = a.X            # aliased
b = ad.AnnData(counts.copy())
b.layers["counts"] = b.X.copy()     # independent

for obj in (a, b):
    sc.pp.normalize_total(obj, target_sum=1e4)
    sc.pp.log1p(obj)

print("aliased layer still integer:", np.allclose(a.layers["counts"].data, np.round(a.layers["counts"].data)))
print("copied layer still integer: ", np.allclose(b.layers["counts"].data, np.round(b.layers["counts"].data)))
```

The first line prints `False`, the second `True`.

**`.raw` is not "raw counts".** It is a frozen snapshot of `X` and `var` at the moment you
assign it, kept so that genes dropped later can still be plotted and tested. Whatever `X`
held then — counts or log values — is what `.raw` holds. `rank_genes_groups` and the
plotting functions default to `use_raw=True` whenever `.raw` exists, so the matrix they
silently read depends on when someone assigned it. Prefer a `counts` layer and an unsubsetted
`X`; if you need `.raw`, assign `adata.raw = adata.copy()` right after `log1p`, and pass
`use_raw` explicitly.

**`seurat_v3` on log data does not fail.** It warns once and returns plausible genes. Pass
`layer="counts"`.

**Gene names.** Mouse is `mt-`, `Rps`/`Rpl`; human is `MT-`, `RPS`/`RPL`. Duplicate symbols
exist in every 10x reference, hence `var_names_make_unique()`.

**Defaults that are scheduled to move.** `leiden` (backend and iterations) and several
`pp` functions warn about future defaults. Pin the arguments you rely on rather than the
current defaults, and record `scanpy`, `anndata` and `numpy` versions with the result.

**Random seeds.** `scrublet`, `umap` and `leiden` take `random_state` and default to `0`.
Neighbor search can still differ slightly across platforms and library versions, so cluster
numbers and counts are not stable identifiers between runs — name clusters by their markers.

**Integration.** Several samples with a visible batch effect need correction before
clustering. Harmony on the PCA (`sc.external.pp.harmony_integrate`) is fast; scVI
(`scvi-tools`) models the counts directly.

## Try it

**Data.** 10x Genomics PBMC 3k (Chromium v1, 2,700 cells), the raw count matrix as hosted by
scverse at `https://exampledata.scverse.org/scanpy/pbmc3k_raw.h5ad` (5.9 MB). 10x
distributes this dataset under CC BY 4.0; no account is needed. Reachable on 2026-11-06.

**Run.** One block from download to markers, routed through the two silent traps: the
counts layer must survive normalization, and the mitochondrial match must find genes.

```python
import numpy as np
import scanpy as sc

adata = sc.read("pbmc3k_raw.h5ad",
                backup_url="https://exampledata.scverse.org/scanpy/pbmc3k_raw.h5ad")
adata.var_names_make_unique()
n_raw = adata.n_obs

adata.var["mt"] = adata.var_names.str.upper().str.startswith("MT-")
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], percent_top=None, log1p=True, inplace=True)

def mad_outlier(x, nmads):
    med = np.median(x)
    return np.abs(x - med) > nmads * np.median(np.abs(x - med))

bad = (mad_outlier(adata.obs["log1p_total_counts"], 5)
       | mad_outlier(adata.obs["log1p_n_genes_by_counts"], 5)
       | (adata.obs["pct_counts_mt"] > 20))
adata = adata[~bad].copy()
sc.pp.filter_genes(adata, min_cells=3)
sc.pp.scrublet(adata, random_state=0, verbose=False)
adata = adata[~adata.obs["predicted_doublet"]].copy()

adata.layers["counts"] = adata.X.copy()
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata, flavor="seurat_v3", layer="counts", n_top_genes=2000)
sc.pp.pca(adata, n_comps=50)
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
sc.tl.umap(adata, random_state=0)
sc.tl.leiden(adata, flavor="igraph", n_iterations=2, resolution=1.0, random_state=0)
sc.tl.rank_genes_groups(adata, "leiden", method="wilcoxon", use_raw=False)
markers = sc.get.rank_genes_groups_df(adata, group=None)

# invariants
c = adata.layers["counts"].data
assert np.allclose(c, np.round(c)) and c.max() > 50, "counts layer was overwritten"
assert int(adata.var["mt"].sum()) == 13
assert int(adata.var["highly_variable"].sum()) == 2000
assert adata.X.shape == adata.layers["counts"].shape
assert np.allclose(np.expm1(adata.X).sum(axis=1), 1e4, rtol=1e-3)
assert adata.obs["leiden"].notna().all()
top = markers.groupby("group", observed=True).head(10)
b_cluster = top.loc[top["names"] == "CD79A", "group"].tolist()
assert b_cluster, "no cluster has CD79A among its top markers"
in_b = adata.obs["leiden"].isin(b_cluster).to_numpy()
ms4a1 = adata[:, "MS4A1"].X.toarray().ravel()
assert ms4a1[in_b].mean() > 3 * ms4a1[~in_b].mean()

print(f"cells: {n_raw} -> {adata.n_obs}; genes kept: {adata.n_vars}")
print(f"clusters: {adata.obs['leiden'].nunique()}; B-cell cluster(s): {b_cluster}")
adata.write_h5ad("pbmc3k_processed.h5ad")
```

**Expect.**

Invariants — a failure means this page is wrong:

- The `counts` layer is still integer-valued after normalization.
- 13 mitochondrial genes are found.
- Exactly 2,000 genes flagged highly variable, with all genes still present in `X`.
- Every cell's normalized counts sum back to 10,000.
- Every cell has a cluster, and one cluster carries the B-cell markers `CD79A` (and `MS4A1`).

Observed on 2026-11-06 with scanpy 1.12.5 / anndata 0.13.4 / igraph 1.0.0 — drift to
investigate, not a bug, if these move:

- `cells: 2700 -> 2578; genes kept: 13581`
- 9 Leiden clusters at resolution 1.0; the B-cell cluster is `1`. Top markers per cluster:
  `CCL5`/`GZMK` and `CCL5`/`NKG7`/`CST7` (two cytotoxic T populations), `LTB`/`IL32` (CD4 T),
  `CD74`/`HLA-DRA`/`CD79A` (B), `NKG7`/`GNLY`/`GZMB` (NK), `CST3`/`LYZ`/`LGALS2` (dendritic),
  `LST1`/`FCER1G` (CD16 monocytes), `S100A9`/`S100A8`/`LYZ` (CD14 monocytes), and one
  cluster whose top markers are ribosomal proteins.
- The run prints only a download progress bar and the two summary lines.

The same pipeline was run on 10x `pbmc_1k_v3` (1,222 → 1,082 cells, 13 clusters) and on the
mouse `neuron_1k_v3` (1,301 → 1,092 cells, 16 clusters). The mouse run is the reason for the
case-insensitive mitochondrial match: a case-sensitive `MT-` finds 0 of its 13 `mt-` genes.
