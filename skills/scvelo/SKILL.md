---
name: scvelo
description: Estimate RNA velocity from spliced and unspliced single-cell counts with scVelo — an environment pinned so it actually runs, the current preprocessing order (scanpy for log and HVG, neighbors before moments), stochastic and dynamical models, latent time, confidence, and the checks that tell a real trajectory from an artifact.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [single-cell, transcriptomics, rna-seq, h5ad, scverse]
covers: [rna velocity, velocity, scvelo, spliced, unspliced, velocyto, loom, latent time, pseudotime, trajectory, lineage, differentiation, dynamical model, stochastic model, pancreas, endocrinogenesis, dentate gyrus, hippocampus, neurogenesis, mouse, scrna-seq, 10x, starsolo, alevin-fry, kallisto bustools, cellrank]
datasets: [https://ndownloader.figshare.com/files/27686835, https://raw.githubusercontent.com/theislab/scvelo_notebooks/master/data/DentateGyrus/10X43_1.h5ad]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: scvelo 0.3.4 / scanpy 1.12.5 / anndata 0.13.4 / numpy 2.3.5 / pandas 2.3.3 / numba 0.68.1 / scikit-learn 1.9.1 / Python 3.12.13 on macOS arm64 / all blocks run in page order in one fresh directory and Try it run again alone in a second fresh directory / the same pipeline also run on the dentate gyrus dataset (2,930 cells, 14 clusters, several lineages) / the numpy and pandas incompatibilities reproduced on numpy 2.4.6 and 2.5.4 and pandas 3.1.1
  executed: 5
  unverified: 0
---
# scVelo — RNA velocity

RNA velocity reads the ratio of unspliced (pre-mRNA) to spliced (mature) reads per gene and
asks whether each gene is being switched on or off in each cell. Projected onto an embedding,
that gives an arrow per cell and, with the dynamical model, a shared **latent time**. scVelo is
the standard Python implementation and works on an `AnnData` with `spliced` and `unspliced`
layers.

Velocity is a model output, not a measurement. Arrows are produced for every dataset, including
ones where the model's assumptions fail, and a stream plot looks equally convincing in both
cases. Most of this page is about telling the two apart.

## Before you start

**You need spliced and unspliced count matrices.** A standard Cell Ranger run does not produce
them. They come from a separate counting step over the aligned reads, for example velocyto
(`velocyto run10x`, which writes a `.loom`), STARsolo with `--soloFeatures Gene Velocyto`, or
alevin-fry / kallisto|bustools in their spliced+unspliced modes. Whatever made them, the result
must be two cell × gene integer matrices on the same barcodes and genes as your expression data.

**scVelo 0.3.4 (February 2026) does not run on the current numpy and pandas.** Measured on
2026-11-06:

| Environment | What happens |
|---|---|
| numpy ≥ 2.4 | `scv.tl.velocity()` in its default `stochastic` mode raises `ValueError: setting an array element with a sequence` (numpy 2.3 only warns about the same line). |
| pandas ≥ 3.0 | `scv.tl.recover_dynamics()` raises `TypeError: unique requires a Series, Index, ...`. |
| numpy < 2.4 and pandas < 3 | Everything on this page runs. |

So install into its own environment with both pinned. Nothing on this page needs a GPU, an
account or a key.

```bash
python3.12 -m venv .venv-scvelo
. .venv-scvelo/bin/activate
pip install "scvelo==0.3.4" "numpy<2.4" "pandas<3"
python -c "import importlib.metadata as m; print({p: m.version(p) for p in ['scvelo','scanpy','anndata','numpy','pandas']})"
```

**Run the code as a script with a `__main__` guard.** `n_jobs > 1` in `velocity_graph` and
`recover_dynamics` starts worker processes. On macOS and Windows those use the spawn start
method, which re-imports your script; without the guard every call with `n_jobs > 1` fails
with `An attempt has been made to start a new process before the current process has finished
its bootstrapping phase`. A notebook or `n_jobs=1` avoids it at the cost of speed.

## Workflow

The three steps below each read the previous step's file, so they can be run and inspected one
at a time. The example is scVelo's bundled pancreas dataset (mouse endocrinogenesis at E15.5,
3,696 cells, Bastidas-Ponce et al. 2019), which `scv.datasets.pancreas()` downloads to
`data/Pancreas/` under the working directory.

### 1. Load, filter, normalize, find variable genes, build the graph

The order matters, and much older tutorial code gets it wrong for current versions:

- `scv.pp.filter_and_normalize` now only filters genes and normalizes `X`, `spliced` and
  `unspliced` per cell. It no longer takes `n_top_genes` or `log`; passing `n_top_genes` raises
  `TypeError: normalize_per_cell() got an unexpected keyword argument 'n_top_genes'`.
- Log-transform and select variable genes with scanpy afterwards. `log1p` touches only `X`; the
  `spliced` and `unspliced` layers stay normalized but unlogged, which is what velocity needs.
- Compute the neighbor graph with scanpy **before** `scv.pp.moments`, and call `moments` with
  `n_neighbors=None, n_pcs=None`. Given a number of neighbors larger than the existing graph,
  `moments` recomputes the graph itself, a path scVelo has deprecated.

```python
# step1_preprocess.py
import scvelo as scv
import scanpy as sc


def main():
    adata = scv.datasets.pancreas()
    assert {"spliced", "unspliced"} <= set(adata.layers), "no spliced/unspliced layers"
    print("loaded", adata.shape, "| clusters:", adata.obs["clusters"].nunique())

    # fraction of unspliced counts: 16 % here, 10 % on dentate gyrus; a few % suggests a counting problem
    u, s = adata.layers["unspliced"].sum(), adata.layers["spliced"].sum()
    print(f"unspliced fraction {u / (u + s):.3f}")

    scv.pp.filter_and_normalize(adata, min_shared_counts=20)
    sc.pp.log1p(adata)
    sc.pp.highly_variable_genes(adata, n_top_genes=2000, subset=True)
    sc.pp.pca(adata, n_comps=30)
    sc.pp.neighbors(adata, n_neighbors=30, n_pcs=30)
    scv.pp.moments(adata, n_pcs=None, n_neighbors=None)

    # anndata 0.13 lists None (an alias for X) among the layer keys
    print("after preprocessing", adata.shape, "| layers:", sorted(k for k in adata.layers if k))
    adata.write_h5ad("pancreas_pp.h5ad")


if __name__ == "__main__":
    main()
```

`moments` writes `Ms` and `Mu`, the neighbor-smoothed spliced and unspliced abundances that
every velocity model below fits. They are dense float32 arrays of shape cells × genes, so memory
grows with both: keep the gene subset at a few thousand.

### 2. Stochastic velocity and the stream plot

The stochastic model fits one steady-state ratio per gene and is fast. Use it to look at the data
before spending minutes on the dynamical model.

```python
# step2_velocity.py
import matplotlib
matplotlib.use("Agg")
import anndata as ad
import scvelo as scv


def main():
    adata = ad.read_h5ad("pancreas_pp.h5ad")
    scv.tl.velocity(adata, mode="stochastic")
    scv.tl.velocity_graph(adata, n_jobs=4)
    print("velocity genes:", int(adata.var["velocity_genes"].sum()), "of", adata.n_vars)

    scv.pl.velocity_embedding_stream(
        adata, basis="umap", color="clusters", save="pancreas_stochastic.png", show=False
    )
    adata.write_h5ad("pancreas_stochastic.h5ad")


if __name__ == "__main__":
    main()
```

The plot lands in `figures/scvelo_pancreas_stochastic.png`: scVelo prefixes the name and writes
into `./figures/`. The `basis` must already exist in `obsm` as `X_<basis>`. The pancreas file
ships one; for your own data run `sc.tl.umap(adata)` after the neighbor graph.

`velocity_genes` are the genes whose fit passed scVelo's quality filters. Only these contribute
to the velocity graph. A few dozen out of thousands means the spliced/unspliced signal is too
weak to support arrows.

### 3. Dynamical model, latent time and confidence

`recover_dynamics` fits the full transcription–splicing–degradation kinetics per gene. It is
the slow step, a little over two minutes for this dataset on four cores.

```python
# step3_dynamics.py
import matplotlib
matplotlib.use("Agg")
import anndata as ad
import scvelo as scv


def main():
    adata = ad.read_h5ad("pancreas_stochastic.h5ad")
    scv.tl.recover_dynamics(adata, n_jobs=4)
    scv.tl.velocity(adata, mode="dynamical")
    scv.tl.velocity_graph(adata, n_jobs=4)
    scv.tl.latent_time(adata)
    scv.tl.velocity_confidence(adata)

    by = adata.obs.groupby("clusters", observed=True)
    print(by["latent_time"].median().sort_values().round(2).to_string())
    print(by["velocity_confidence"].mean().round(2).to_string())
    print(adata.var["fit_likelihood"].dropna().sort_values(ascending=False).head(8).round(3).to_string())

    scv.pl.scatter(adata, color="latent_time", color_map="gnuplot", save="latent_time.png", show=False)
    scv.pl.velocity_embedding_stream(
        adata, basis="umap", color="clusters", save="pancreas_dynamical.png", show=False
    )
    adata.write_h5ad("pancreas_dynamical.h5ad")


if __name__ == "__main__":
    main()
```

What the outputs are:

- `latent_time` (obs): a 0–1 ordering anchored on cells scVelo picks as roots. It is one time
  axis for the **whole** dataset.
- `velocity_confidence` (obs): how well a cell's velocity agrees with its neighbors'. It measures
  local coherence, not correctness. A smooth wrong flow scores high.
- `fit_likelihood` (var): per-gene goodness of fit of the kinetic model. The top genes are the
  ones driving the result; look at their phase portraits with
  `scv.pl.scatter(adata, var_names=[...])` before trusting the arrows.

## Reading the result honestly

The model assumes each gene has one transcription rate when on, one constant splicing and
degradation rate, and that the cells sample the transient phases. Check these before reporting
a direction:

1. **Look at the phase portraits of the top `fit_likelihood` genes.** A real induction or
   repression shows as an almond shape in spliced-vs-unspliced space. A cloud, or two clusters
   on different slopes, means the gene's kinetics differ between populations and its arrows are
   unreliable.
2. **`latent_time` is meaningless across unrelated lineages.** On the dentate gyrus dataset,
   which has neuronal, glial, vascular and immune cells, scVelo warns `Uncertain or fuzzy root
   cell identification`, finds four root regions, and places microglia at time 0. That ordering
   is an artifact of forcing one clock onto separate lineages. Subset to one lineage, re-run the
   graph and moments on that subset, and compute latent time there.
3. **Known failure modes give confident wrong arrows.** Mature cells with a transcriptional
   boost, multiple kinetic regimes in one gene, and cell-cycle signal can each produce a smooth,
   high-confidence flow that points backwards. In the dentate gyrus run, mature and immature
   granule cells receive almost the same latent time (0.84 and 0.86), the reverse of the known
   order. Say which direction you expected, and why, before you look.
4. **Check against something independent.** A marker gene with known timing, a sampled time
   point, or lineage-tracing data. Arrows that agree with prior knowledge on one known
   transition are the minimum evidence before using them on an unknown one.
5. **Report the settings.** The neighbor count, the HVG count and `min_shared_counts` all move
   the result. Velocity on 2,000 genes and on 3,000 genes are different analyses.

## Pitfalls

- **Counts copied by reference.** To keep raw counts, write
  `adata.layers["counts"] = adata.X.copy()`. Without `.copy()` the layer shares its data with `X`
  and is overwritten by the normalization that follows.
- **Barcode mismatch after merging.** A `.loom` from velocyto names cells `sample:BARCODEx`, while
  Cell Ranger names them `BARCODE-1`. `scv.utils.merge(adata, ldata)` keeps only the cells whose
  names match exactly, without a warning. Only when *no* names match does it try to clean them
  itself, and that cleaner assumes 12-base barcodes by default, while 10x v2 and v3 barcodes are
  16. Rename the cells yourself before merging and check that the merged object has the number of
  cells you expect.
- **Non-integer layers.** `filter_and_normalize` decides whether a layer is already normalized
  by checking for integers. Layers saved as floats are skipped without a message, so normalize
  them deliberately if you know they hold raw counts.
- **Gene count drives memory.** `Ms` and `Mu` are dense. 100,000 cells × 2,000 genes is 1.6 GB for
  the pair before the model runs.
- **Velocity is not a lineage call.** For fate probabilities and terminal states built on top of
  the velocity graph, CellRank is the established next step; it takes the `AnnData` this page
  writes.

## Try it

**Data**: two public datasets scVelo itself distributes. Both are open and need no account.
Both were last confirmed reachable on 2026-11-06.

- **Pancreas**: mouse pancreatic endocrinogenesis at E15.5, 3,696 cells × 27,998 genes, with
  `spliced` and `unspliced` layers and a precomputed UMAP. Bastidas-Ponce et al.,
  *Development* 2019, GEO GSE132188. Downloaded by `scv.datasets.pancreas()` from figshare.
- **Dentate gyrus**: 2,930 cells, 14 clusters (La Manno et al., *Nature* 2018), used above as
  the multi-lineage counter-example. It downloads from the scVelo notebooks repository.

The run writes a script and executes it, so the `__main__` guard is in place. It goes through
the current preprocessing order, the stochastic model and the dynamical model, and asserts the
pancreas differentiation order. It needs the pinned environment from *Before you start* and
takes about three minutes on four cores.

```bash
cat > velo_try.py <<'EOF'
import importlib.metadata as md
import matplotlib
matplotlib.use("Agg")
import numpy as np
import scanpy as sc
import scvelo as scv


def main():
    print({p: md.version(p) for p in ["scvelo", "scanpy", "numpy", "pandas"]})
    adata = scv.datasets.pancreas()
    n_cells = adata.n_obs
    assert adata.layers["spliced"].shape == adata.layers["unspliced"].shape == adata.shape

    try:
        scv.pp.filter_and_normalize(adata.copy(), min_shared_counts=20, n_top_genes=2000)
        raise SystemExit("expected n_top_genes to be rejected")
    except TypeError as e:
        assert "n_top_genes" in str(e)

    scv.pp.filter_and_normalize(adata, min_shared_counts=20)
    sc.pp.log1p(adata)
    sc.pp.highly_variable_genes(adata, n_top_genes=2000, subset=True)
    sc.pp.pca(adata, n_comps=30)
    sc.pp.neighbors(adata, n_neighbors=30, n_pcs=30)
    scv.pp.moments(adata, n_pcs=None, n_neighbors=None)

    scv.tl.velocity(adata, mode="stochastic")
    scv.tl.velocity_graph(adata, n_jobs=4)
    n_stoch = int(adata.var["velocity_genes"].sum())

    scv.tl.recover_dynamics(adata, n_jobs=4)
    scv.tl.velocity(adata, mode="dynamical")
    scv.tl.velocity_graph(adata, n_jobs=4)
    scv.tl.latent_time(adata)
    scv.tl.velocity_confidence(adata)

    t = adata.obs.groupby("clusters", observed=True)["latent_time"].median()
    conf = float(adata.obs["velocity_confidence"].mean())
    lik = adata.var["fit_likelihood"].dropna()
    print("cells", n_cells, "| genes", adata.n_vars, "| stochastic velocity genes", n_stoch)
    print("latent time medians:", t.sort_values().round(2).to_dict())
    print("mean velocity confidence", round(conf, 3), "| top genes", list(lik.sort_values(ascending=False).index[:5]))

    assert adata.n_obs == n_cells and adata.n_vars == 2000
    assert adata.layers["Ms"].shape == adata.layers["Mu"].shape == adata.shape
    assert adata.uns["velocity_graph"].shape == (n_cells, n_cells)
    assert np.isclose(adata.obs["latent_time"].min(), 0) and np.isclose(adata.obs["latent_time"].max(), 1)
    assert lik.between(0, 1).all()
    assert t["Ductal"] < t["Ngn3 high EP"] < t["Pre-endocrine"] < t[["Alpha", "Beta", "Delta", "Epsilon"]].min()
    print("all checks passed")


if __name__ == "__main__":
    main()
EOF
python velo_try.py
```

**Expect**

Invariants — a failure means the skill is wrong:

- Passing `n_top_genes` to `filter_and_normalize` raises a `TypeError`, and the scanpy order
  that replaces it runs.
- `Ms` and `Mu` have the shape of the filtered object, and the velocity graph is cells × cells.
- `latent_time` spans exactly 0 to 1 and every `fit_likelihood` lies in [0, 1].
- Latent time follows the known endocrine order: ductal cells, then Ngn3-high progenitors, then
  pre-endocrine cells, then all four hormone-producing types. If this assertion fails, the
  velocity is wrong for this dataset, not just shifted.

Observed 2026-11-06 with scvelo 0.3.4, scanpy 1.12.5, numpy 2.3.5, pandas 2.3.3. These are
numbers to compare, not assertions:

```
cells 3696 | genes 2000 | stochastic velocity genes 1036
latent time medians: {'Ngn3 low EP': 0.1, 'Ductal': 0.1, 'Ngn3 high EP': 0.43, 'Pre-endocrine': 0.71, 'Epsilon': 0.74, 'Delta': 0.75, 'Beta': 0.77, 'Alpha': 0.79}
mean velocity confidence 0.844 | top genes ['Pcsk2', 'Ank', 'Nfib', 'Top2a', 'Dcdc2a']
all checks passed
```

The same script on the dentate gyrus data (swap in `scv.datasets.dentategyrus()` and drop the
pancreas-specific order assertion) runs to completion. It reports 557 stochastic velocity genes,
prints the fuzzy-root warning, and produces the cross-lineage latent time described under
*Reading the result honestly*. That is the expected behavior, and it is why the order assertion
is specific to a single-lineage dataset.
