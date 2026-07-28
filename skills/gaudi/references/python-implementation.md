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

**The `minPts` default is unusable on small data** and this is not
implementation-specific — it is a property of the method. Below ~150 samples
`floor(0.03 · n)` collapses toward the floor of 2 and HDBSCAN returns a shower
of doubleton clusters. Set it explicitly and sweep it. See the *Sharp edges*
section of `SKILL.md`.

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
