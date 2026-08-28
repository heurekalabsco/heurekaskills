# GAUDI without R — the method, and a Python implementation

Use this when R is unavailable, the `gaudi` package will not install, or the
project is Python-only. GAUDI is a composition of four standard, widely
available components, so it reimplements in about sixty lines. Nothing about
the method requires R.

This file gives the algorithm language-agnostically first, then a tested Python
implementation, then the traps that make a naive port silently wrong.

## The method

Given `L` omics layers measured on overlapping samples:

1. **Align.** Orient every layer samples × features. Intersect sample IDs across
   all layers and subset to the intersection. Drop zero-variance features.
   Layers need not share features or dimensionality.
2. **Embed each layer independently.** UMAP on layer `l` → an `n × 4` embedding.
   Doing this per layer is the point of the method — it puts a 25,000-feature
   transcriptome and a 700-feature metabolome on the same footing, so
   integration is not dominated by whichever layer is highest-dimensional.
3. **Concatenate.** Column-bind the `L` embeddings → `n × 4L`.
4. **Embed again.** A second UMAP over the concatenation → `n × 2`.
5. **Cluster.** HDBSCAN on the 2-D embedding with `minPts`. HDBSCAN is used
   rather than k-means because the space is non-linear and the cluster count is
   unknown; the cost is a dedicated noise label.
6. **Score.** Mean silhouette over the 2-D embedding. Note this is internal — it
   is computed on the same embedding that produced the clusters.
7. **Attribute.** For each layer and each of the two latent dimensions, fit a
   gradient-boosted regressor predicting the coordinate from that layer's
   features, then take mean absolute SHAP value per feature. That vector is the
   layer's *metagene* for that dimension.

Parameters, with the published defaults:

| step | parameter | default |
|---|---|---|
| per-layer UMAP | `n_neighbors` | 15 |
| | `n_components` | 4 |
| | `min_dist` | 0.01 |
| | `metric` | euclidean |
| integrated UMAP | `n_neighbors` | 15 |
| | `n_components` | 2 |
| HDBSCAN | `minPts` | `max(floor(0.03 · n), 2)` — see the warning below |
| XGBoost | `objective` | `reg:squarederror` |
| | `lambda` (L2) | 0 |
| | `eta` (learning rate) | 0.5 |
| | `gamma` | 50 |
| | `max_depth` | 10 |
| | `subsample` | 0.95 |
| | `nrounds` | 10 |

**The `minPts` default is unsafe on small data**, because `floor(0.03 · n)`
tracks the sample count and nothing about the data. Below ~150 samples it
collapses toward the floor of 2, and a `minPts` of 2 imposes no constraint at
all — whatever HDBSCAN finds in the embedding is returned as clusters.

What that costs you depends on separation, not on `n` alone. Measured on this
implementation, 2026-08-28, with the pinned three-group generator in the
`## Try it` section of `SKILL.md` (n = 60, truth k = 3, default `min_pts` = 2):

| group separation | default (2) | `min_pts=5` | `min_pts=10` |
|---|---|---|---|
| clean (shift 3.0) | k=3, ARI 1.00 | k=3, ARI 1.00 | k=3, ARI 1.00 |
| weak (shift 0.8) | **k=5**, ARI 0.70 | k=3, ARI 0.75 | k=3, ARI 0.78 |
| very weak (shift 0.4) | **k=8**, ARI 0.13 | k=3, ARI 0.20 | k=0 (all noise) |

So on cleanly separated data the default happens to be harmless here, and an
earlier version of this file overstated the case by calling the fragmentation a
property of the method: it is a property of the method *applied to data whose
groups are not cleanly separated*, which is the case you are usually in and
cannot recognise in advance. The R package fragments harder at `minPts = 2` on
its own clean synthetic set — 19 clusters, in the *Sharp edges* table of
`SKILL.md` — so the size of the effect is implementation-specific even though
the exposure is not. **Set `min_pts` explicitly and sweep it** either way.

**Bound the sweep from above, too.** At `min_pts` equal to the group size, this
implementation returns every sample as noise, a silhouette of `0.0`, and no
error — the `len(set(lab)) > 1` guard reports a single-label result as `0.0`,
so an empty answer arrives looking like a computed one. `min_pts=20` on 20
samples per group does it. Check the noise count before you read the
silhouette.

## Dependencies

```bash
pip install numpy pandas scikit-learn umap-learn hdbscan xgboost shap
```

`scikit-learn` ≥ 1.3 ships `sklearn.cluster.HDBSCAN`, which works as a drop-in
for the `hdbscan` package if you prefer one fewer dependency — note its noise
label convention matches `hdbscan` (`-1`), not R's (`0`).

## Porting traps

These are the differences that produce a *plausible but wrong* result rather
than an error. Every one was confirmed against the installed packages.

| | R (`uwot` / `dbscan`) | Python (`umap-learn` / `hdbscan`) |
|---|---|---|
| **`min_dist` default** | **0.01** | **0.1** — 10× larger |
| noise label | `0`, clusters `1..k` | `-1`, clusters `0..k-1` |
| `minPts` | one argument | splits into `min_cluster_size` *and* `min_samples` |
| `n_neighbors`, `metric`, `init` | 15, euclidean, spectral | same |

The `min_dist` difference is the one that bites. GAUDI never passes `min_dist`
explicitly — it inherits `uwot`'s 0.01. Construct `umap.UMAP` without setting it
and you get 0.1, a visibly looser embedding, and different clusters. **Set
`min_dist=0.01` explicitly.**

For the noise label, add 1 to the Python labels to land on R's convention
(`-1 → 0`), which is what the code below does so that everything in `SKILL.md`
about cluster 0 applies unchanged.

For `minPts`, R's `dbscan::hdbscan(minPts = m)` sets both the minimum cluster
size and the core-distance neighbourhood. Pass `m` to both Python arguments.

## Implementation

```python
import numpy as np, pandas as pd, umap, hdbscan, xgboost as xgb, shap
from sklearn.metrics import silhouette_score


def gaudi(omics, min_pts=None, n_components_layer=4, n_components_conc=2,
          n_neighbors=15, min_dist=0.01, compute_features=True, seed=42):
    """GAUDI multi-omics integration.

    omics : dict of {layer_name: DataFrame}, samples in rows (index = sample ID),
            features in columns. Preprocess per layer first — transform, scale,
            impute. Missing values are rejected, not imputed here.

    Returns dict with keys: factors, clusters, silhouette_score,
    individual_factors, metagenes.
    """
    names = list(omics)
    common = sorted(set.intersection(*[set(df.index) for df in omics.values()]))
    if len(common) < 10:
        raise ValueError(f"only {len(common)} samples shared across layers")
    omics = {k: v.loc[common] for k, v in omics.items()}
    for k, v in omics.items():
        if v.isna().any().any():
            raise ValueError(f"NA in layer '{k}' — impute upstream")
        omics[k] = v.loc[:, v.std(axis=0, ddof=1) > 0]

    # 1. per-layer UMAP -> n x 4 each
    emb = [umap.UMAP(n_neighbors=n_neighbors, n_components=n_components_layer,
                     min_dist=min_dist, metric="euclidean",
                     random_state=seed).fit_transform(v.values)
           for v in omics.values()]

    # 2. concatenate -> 3. integrated UMAP -> n x 2
    integ = umap.UMAP(n_neighbors=n_neighbors, n_components=n_components_conc,
                      min_dist=min_dist, metric="euclidean",
                      random_state=seed).fit_transform(np.hstack(emb))

    # 4. HDBSCAN; +1 puts noise at 0 to match the R convention
    n = len(common)
    if min_pts is None:
        min_pts = int(np.floor(0.03 * n))
    min_pts = max(min_pts, 2)
    lab = hdbscan.HDBSCAN(min_cluster_size=min_pts,
                          min_samples=min_pts).fit_predict(integ) + 1

    factors = pd.DataFrame(integ, index=common,
                           columns=[f"UMAP{i+1}" for i in range(n_components_conc)])
    factors["clust"] = lab
    sil = float(silhouette_score(integ, lab)) if len(set(lab)) > 1 else 0.0

    # 5. metagenes: mean |SHAP| of each feature on each latent dimension
    metagenes = []
    if compute_features:
        for nm in names:
            X = omics[nm].values
            cols = {}
            for j in range(n_components_conc):
                m = xgb.XGBRegressor(objective="reg:squarederror", reg_lambda=0,
                                     learning_rate=0.5, gamma=50, max_depth=10,
                                     subsample=0.95, n_estimators=10,
                                     random_state=seed, verbosity=0)
                m.fit(X, integ[:, j])
                cols[f"contrib{j+1}"] = np.abs(
                    shap.TreeExplainer(m).shap_values(X)).mean(axis=0)
            metagenes.append(pd.DataFrame(cols, index=omics[nm].columns)
                             .sort_values("contrib1", ascending=False))

    return dict(factors=factors, clusters=lab, silhouette_score=sil,
                individual_factors=dict(zip(names, emb)), metagenes=metagenes)
```

### Using it

```python
omics = {
    "expression":  pd.read_csv("data/expr.csv", index_col=0),
    "methylation": pd.read_csv("data/meth.csv", index_col=0),
}

# Sweep min_pts before trusting any cluster count.
for mp in (5, 8, 10, 15, 20):
    r = gaudi(omics, min_pts=mp, compute_features=False)
    k = len(set(r["clusters"]) - {0})
    print(f"min_pts={mp:2d}  k={k:2d}  noise={(r['clusters']==0).sum():3d} "
          f"sil={r['silhouette_score']:.3f}")

res = gaudi(omics, min_pts=10)
res["factors"].to_csv("results/cluster_assignments.csv")
for nm, mg in zip(omics, res["metagenes"]):
    mg.to_csv(f"results/metagenes_{nm}.csv")
```

Plot the embedding with anything — the result is just a DataFrame:

```python
import matplotlib.pyplot as plt
f = res["factors"]
plt.scatter(f.UMAP1, f.UMAP2, c=f.clust, cmap="viridis", s=40)
plt.xlabel("UMAP1"); plt.ylabel("UMAP2"); plt.tight_layout()
plt.savefig("results/embedding.png", dpi=300)
```

## What reproduces, and what does not

Verified by running this implementation and the R package on identical
synthetic input — 60 samples, two layers (300 and 150 features), three
well-separated groups, `min_pts=5`:

| | R `gaudi` 0.1.18 | this implementation |
|---|---|---|
| clusters found | 3 | 3 |
| noise samples | 0 | 0 |
| silhouette | 0.946 | 0.942 |
| ARI vs. ground truth | — | **1.000** |
| ARI vs. R's partition | — | **1.000** |

**Cluster assignments reproduce.** That is the output of the method, and on
separable data the two implementations agreed exactly.

Re-run 2026-08-28 on the pinned generator now in `SKILL.md`'s `## Try it`
(same shape — 60 samples, 300- and 150-feature layers, three groups,
`min_pts=5`): k = 3, 0 noise, silhouette **0.941**, ARI 1.000 against ground
truth, under umap-learn 0.5.12 / hdbscan 0.8.44 / scikit-learn 1.9.0. The
original run's synthetic input was described but never pinned, so its 0.942
could only ever be compared approximately; the generator is written out in
`## Try it` from now on so a later pass can reproduce the figure exactly rather
than land near it. The R column has not been re-run — no R toolchain — so it
stands as recorded on the version stated above.

**Metagene rankings do not reproduce feature-for-feature.** On the same run the
two implementations shared no features in their top five, and reported 6 and 4
non-zero contributions respectively out of 300. This is expected rather than a
defect in either: `gamma = 50` forces extremely sparse trees, so nearly all
features get exactly zero, and the regressor is fitted against stochastic UMAP
coordinates that differ between implementations. Treat metagenes as *a* set of
features consistent with the embedding, not *the* set — and do not compare a
metagene list produced in Python against one produced in R as though a
disagreement were meaningful. If feature attribution is central to your claim,
run it several times with different seeds and keep what is stable.

Both implementations are stochastic. Set `random_state`/`set.seed` and report
it either way.

## Not reimplemented here

The R package ships convenience helpers this file deliberately does not port,
because each is a couple of lines against a standard Python library and porting
them would import their defects (see *Sharp edges* in `SKILL.md`):

| R helper | Python equivalent |
|---|---|
| `c_gaudi()` consensus | run `gaudi()` `n` times, Procrustes-align to the highest-silhouette run (`scipy.spatial.procrustes`), take the per-sample median embedding, cluster that |
| `get_pairwise_survival_data()`, `plot_survival()` | `lifelines.statistics.logrank_test` per cluster pair, then `statsmodels.stats.multitest.multipletests(..., method="fdr_bh")` |
| `gaudi_enrichment()` | `gseapy.prerank` on a metagene column. The R helper returns uncorrected results; correct your own either way |
| `plot_gaudi_grid()` | matplotlib/seaborn against `factors` and `metagenes` |

Two cautions carried over from the R helpers, because they are properties of
the analysis and not of the language: pairwise survival p-values must be
corrected across all `choose(k, 2)` comparisons, and SHAP contributions are
unsigned magnitudes, so enrichment on them is ranked-magnitude, not
directional.
