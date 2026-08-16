---
name: gaudi
description: Unsupervised multi-omics integration with GAUDI — two-stage UMAP, HDBSCAN clustering, and SHAP metagenes, in R or Python. Use when two or more omics layers share samples and you need sample clusters plus the features driving them.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
try-it: pending
tags: [multi-omics, umap, hdbscan, clustering, shap]
allowed-tools: Read, Write, Edit, Bash
verified: pending
---

# GAUDI: multi-omics integration via UMAP + HDBSCAN

GAUDI (Group Aggregation via UMAP Data Integration) is an unsupervised,
non-linear multi-omics integration method. It embeds each omics layer with UMAP
independently, concatenates those embeddings, runs a second UMAP over the
concatenation, clusters the result with HDBSCAN, and attributes features to the
latent dimensions with SHAP values from XGBoost.

Reference implementation: the `gaudi` R package (GPL-3), Castellano-Escuder et
al., *Nat Commun* 16:5771 (2025), doi:10.1038/s41467-025-60822-1.

Use it when you have **two or more omics layers measured on the same samples**
and want sample clusters plus an interpretable account of which features drive
them. It is a *clustering and stratification* method, not a supervised
predictor and not an imputation method.

**Everything documented below was verified by running gaudi 0.1.18 under
R 4.3.2.** The failure modes in *Sharp edges* are real and reproducible — read
that section before running anything on real data. Several of them fail
**silently**, and one of them silently deletes samples.

**No R available, or Python-only?** GAUDI is a composition of UMAP, HDBSCAN and
SHAP — the R package is one implementation of the method, not the method
itself. `references/python-implementation.md` states the algorithm
language-agnostically and gives a tested Python version that reproduces the R
package's clusters exactly on separable data. Do not install R just to run
this. Everything in this document other than the R call syntax — the input
contract, the parameter choices, the sharp edges, the reporting standards —
applies to either route.

## Why two stages of UMAP

The first UMAP normalises each layer's contribution: a 25,000-feature
transcriptome and a 700-feature metabolome both become an n×4 embedding, so the
integration is not dominated by whichever layer happens to be
highest-dimensional. The second UMAP integrates the standardised
representations. The paper validated this against nine alternative integration
strategies (intersection, union, subtraction, joint matrix factorisation, UMAP
on raw concatenated data) and selected concatenate-then-UMAP on cluster purity
and silhouette.

HDBSCAN is used rather than k-means because the second UMAP's latent space is
non-linear: HDBSCAN handles clusters of varying density and irregular shape, and
does not require the cluster count in advance. The cost is a dedicated noise
label (cluster `0`) that you must handle deliberately.

## Install and load

`gaudi` is not on CRAN or Bioconductor. If R is unavailable, skip this section
entirely and use `references/python-implementation.md`.

```r
# install.packages("devtools")
devtools::install_github("hirscheylab/gaudi")
```

Some functions need packages **attached**, not merely installed (see *Sharp
edges*). The safe preamble:

```r
library(gaudi)
library(dplyr)       # required by the survival helpers
library(patchwork)   # required by plot_gaudi_grid()
```

Check what is present before writing a script:

```bash
Rscript -e 'for (p in c("gaudi","uwot","dbscan","xgboost","SHAPforxgboost","dplyr","patchwork","sva","vegan","survminer","clusterProfiler","org.Hs.eg.db")) cat(sprintf("%-16s %s\n", p, ifelse(requireNamespace(p, quietly=TRUE), as.character(packageVersion(p)), "MISSING")))'
```

## Input contract

A **named list** of matrices or data frames, **samples in rows, features in
columns**, with **row names set to sample IDs**:

```r
omics_list <- list(
  expression  = expr_mat,    # n samples x p1 genes
  methylation = meth_mat,    # n samples x p2 probes
  protein     = prot_mat     # n samples x p3 proteins
)
```

Name the list. Element names carry through to `individual_factors` and make
`on_omics` indices legible — the `metagenes` slot is unnamed, so the list order
is your only record of which layer is which.

Layers need not share features or dimensionality, but they must overlap in
samples. GAUDI **silently intersects** on sample names and returns only the
intersection, so a naming mismatch shows up as a quietly smaller result rather
than an error. Check it yourself:

```r
Reduce(intersect, lapply(omics_list, rownames))   # confirm before running
```

Pass `samples_in_rows = FALSE` if your matrices are features×samples. Row names
are mandatory in either orientation — unnamed input fails with a confusing
`n_neighbors must be smaller than the dataset size`.

### Preprocess before GAUDI

GAUDI does no normalisation. Do it per layer, upstream:

- **Impute missing values.** GAUDI cannot tolerate `NA` — see *Sharp edges*.
- Scale/standardise per layer (z-score is the usual choice).
- Apply the layer-appropriate transform first: log-CPM or VST for counts,
  M-values for methylation betas, log for intensity-based metabolomics.
- Drop features that are constant or near-constant.

## Running it

```r
res <- gaudi(
  omics_list,
  umap_params      = list(n_neighbors = 15, n_components = 4),  # per-layer
  umap_params_conc = list(n_neighbors = 15, n_components = 2),  # integrated
  min_pts          = NULL,       # NULL -> max(floor(0.03 * n), 2)  <- SET THIS
  xgboost_params   = list(lambda = 0, eta = 0.5, gamma = 50,
                          max_depth = 10, subsample = 0.95),
  compute_features = TRUE,
  combine_omics    = FALSE,
  samples_in_rows  = TRUE,
  reassign_cluster_zero = FALSE,
  method           = "xgboost"   # or "rf"
)
```

`metric = "euclidean"` and `min_dist = 0.01` are not arguments — they are
`uwot::umap` defaults that GAUDI inherits. To change them, add them to
`umap_params`.

Published defaults and their stated rationale:

| parameter | default | why |
|---|---|---|
| `n_neighbors` | 15 | uwot default; balances local/global structure |
| `n_components` (stage 1) | 4 | enough for primary variance components per layer |
| `n_components` (stage 2) | 2 | visualisation and interpretation |
| `min_dist` | 0.01 | tight local packing, favours compact clusters |
| `lambda` | 0 | no regularisation — sparse biological signal |
| `eta` | 0.5 | moderate learning rate |
| `gamma` | 50 | sparse trees; few features retained |
| `max_depth` | 10 | admits feature interactions |
| `subsample` | 0.95 | stable feature selection across runs |

Sizing guidance from the package: reduce `n_neighbors` below 100 samples,
consider raising it above 1000. Scaling is roughly linear; 1000 samples ×
25,000 features × 5 layers runs in under 10 minutes on standard hardware.

### Result object

`GAUDIObject`, an S4 object with five slots:

| slot | contents |
|---|---|
| `@factors` | data.frame, n × 3: `UMAP1`, `UMAP2`, `clust`; row names = sample IDs |
| `@clusters` | numeric vector of cluster labels; `0` = HDBSCAN noise |
| `@silhouette_score` | mean silhouette over the 2-D embedding; `0` if one cluster |
| `@individual_factors` | **named** list of per-layer n×4 embeddings |
| `@metagenes` | **unnamed** list, one data.frame per layer: `contrib1`, `contrib2` |

`metagenes[[i]]` holds mean absolute SHAP contributions, so values are
**non-negative** — magnitude only, no direction. Rows are sorted by
`|contrib1|` descending. Because `gamma = 50` forces sparse trees, most
features are exactly `0`; that is the intended behaviour, not a failure. To
recover direction, compare the feature across clusters directly (e.g. limma).

```r
res@silhouette_score
table(res@clusters)                       # inspect the size of cluster 0
head(res@metagenes[[1]], 20)              # top features for layer 1
nonzero <- sum(res@metagenes[[1]]$contrib1 > 0)
```

### Consensus variant

`c_gaudi()` runs `gaudi()` `n_max` times, picks the highest-silhouette run as a
reference, Procrustes-aligns the others onto it (`vegan::procrustes`), takes the
per-sample median embedding, and clusters that. Use it when UMAP
run-to-run variability matters — reporting a single stochastic embedding as
*the* result is not defensible.

```r
res_c <- c_gaudi(omics_list, n_max = 10, min_pts = 12)
```

Two differences to know: `c_gaudi` defaults to **different** XGBoost parameters
(`eta = 1`, `gamma = 100` — sparser than `gaudi()`), and it returns
`individual_factors` **empty**. Pass `xgboost_params` explicitly if you want
metagenes comparable to `gaudi()`.

## Sharp edges

These are verified defects and traps in gaudi 0.1.18, not hypotheticals.

### `NA` silently deletes samples, then crashes

`align_omics()` computes `apply(x, 2, sd) > 0` on the features×samples matrix
and keeps columns passing the test. A single `NA` anywhere in a sample's column
makes its `sd` return `NA`, the test yields `NA`, and **that sample is dropped**.
Because layers are filtered independently, they end up with different sample
counts and the run dies in `dplyr::bind_cols` with:

```
Can't recycle `..1` (size 59) to match `..2` (size 60).
```

That message names neither `NA` nor the sample. **Impute before calling GAUDI**
and assert completeness:

```r
stopifnot(!any(sapply(omics_list, function(x) anyNA(x))))
```

For >20% missingness, drop the affected samples or features rather than
imputing.

### The zero-SD filter removes constant *samples*, not constant *features*

The same line intends to drop zero-variance features but, given the matrix
orientation at that point, tests **samples**. Consequences: a
constant/flatlined sample is dropped without warning, and genuinely constant
features survive into the model. So filter zero-variance features yourself
upstream, and verify the returned sample count:

```r
stopifnot(nrow(res@factors) == length(Reduce(intersect, lapply(omics_list, rownames))))
```

### The default `min_pts` fragments small datasets

`min_pts` defaults to `max(floor(0.03 * n), 2)`. Below ~100 samples this
collapses to 2 or 3, and HDBSCAN returns a shower of doubleton clusters. On a
60-sample, 3-group synthetic set with clean separation:

| `min_pts` | clusters found | noise | silhouette |
|---|---|---|---|
| 2 (the default at n=60) | **19** | 4 | 0.33 |
| 5 | 3 | 0 | **0.96** |
| 10 | 3 | 0 | 0.96 |
| 18 | 3 | 0 | 0.94 |

The truth was 3. **Always set `min_pts` explicitly below ~150 samples**, and
sweep it rather than accepting the first answer:

```r
for (mp in c(5, 8, 10, 15, 20)) {
  r <- gaudi(omics_list, min_pts = mp, compute_features = FALSE)
  cat(sprintf("min_pts=%2d  k=%2d  noise=%3d  sil=%.3f\n",
      mp, length(setdiff(unique(r@clusters), 0)), sum(r@clusters == 0),
      r@silhouette_score))
}
```

Report the sweep, not just the chosen value. A cluster count that swings wildly
across `min_pts` is a finding about the data, and silhouette alone will not tell
you the count is wrong — it is computed on the same embedding that produced the
clusters, so it rewards the geometry UMAP already imposed. Anchor cluster counts
to something external (survival, known subtypes, held-out annotation) before
claiming they are biological.

### `gaudi_enrichment()` only works on factor 1

Metagene rows are sorted by `|contrib1|`, and `clusterProfiler::gseGO` requires
a decreasing-sorted input. So `on_factor = 2` fails with
`geneList should be a decreasing sorted vector`. Sort it yourself for
dimension 2:

```r
gl <- res@metagenes[[1]][["contrib2"]]
names(gl) <- rownames(res@metagenes[[1]])
gl <- sort(gl[gl != 0], decreasing = TRUE)
gse <- clusterProfiler::gseGO(gl, ont = "ALL", OrgDb = org.Hs.eg.db,
                              keyType = "SYMBOL", minGSSize = 2, maxGSSize = 200)
```

Also: `gaudi_enrichment()` hardcodes `pvalueCutoff = 1` and
`pAdjustMethod = "none"`, so it returns **everything unfiltered and
uncorrected**. You must correct and filter yourself:

```r
e <- gaudi_enrichment(res, on_omics = 1, organism = org.Hs.eg.db)
e$padj <- p.adjust(e$pvalue, method = "BH")
e <- e[e$padj < 0.05, ]
```

Never report rows straight out of that function as significant. Note also that
SHAP scores are all non-negative, so GSEA is running on a one-sided statistic —
`fgsea` will warn about `scoreType`. Treat the result as ranked-magnitude
enrichment, not directional enrichment.

Row names of the chosen layer must be **gene symbols** for this to work.

### Survival helpers need data frames and `dplyr` attached

`get_pairwise_survival_data()` and `plot_survival()` are documented as accepting
named vectors. They **do not** — the vector path hits an unquoted `:=` and dies
with `could not find function ":="`. Pass data frames with a `time` / `censor`
column and sample row names. Both functions also call bare `mutate()` /
`across()`, so `library(dplyr)` must be attached.

```r
library(dplyr)
time_df   <- data.frame(time   = clin$os_days,   row.names = clin$sample_id)
censor_df <- data.frame(censor = clin$os_event,  row.names = clin$sample_id)

pairs <- get_pairwise_survival_data(res, time_df, censor_df)
head(pairs)   # clusters, pval, distance, quality

plot_survival(res, time_df, censor_df, pairs[["clusters"]][[1]])
```

`quality` is `0.8 * normalised(-log p) + 0.2 * scaled centroid distance` — an
uninterpretable triage heuristic for ranking which cluster pair to examine, not
a statistic. The `pval` column is a **raw** pairwise log-rank p-value across all
`choose(k, 2)` comparisons; correct it before reporting:

```r
pairs$padj <- p.adjust(pairs$pval, method = "BH")
```

`plot_survival()` drops cluster 0 and any `NA` rows automatically.

### `plot_gaudi_grid()` needs `patchwork` attached

It composes panels with `|` and `/`. Without `library(patchwork)` it fails with
`non-numeric argument to binary operator`. `plot_factors()` and
`plot_metagenes()` are unaffected.

### `combine_omics = TRUE` shifts every metagene index

With `combine_omics = TRUE`, GAUDI ComBat-corrects the concatenated layers
(treating layer identity as batch) and **prepends** that combined result to
`metagenes`. For a two-layer input, `length(metagenes)` becomes 3:
`[[1]]` = combined, `[[2]]` = layer 1, `[[3]]` = layer 2. Every `on_omics`
index shifts by one. Verify by row count:

```r
sapply(res@metagenes, nrow)
```

### Cluster 0 is noise, and dropping it is a decision

`drop_clusters(res, clusters = 0)` removes noise samples;
`reassign_cluster_zero = TRUE` instead assigns each to its nearest neighbour's
cluster. Both change downstream n. State which you used and why — silently
absorbing noise into clusters inflates apparent separation. Report the noise
fraction either way.

Note that `reassign_cluster_zero = TRUE` reorders `@factors` rows (noise samples
move to the end), so re-match by row name rather than position when joining
metadata.

## A defensible run

```r
library(gaudi); library(dplyr); library(patchwork)
set.seed(42)   # UMAP and XGBoost are both stochastic

stopifnot(!any(sapply(omics_list, anyNA)))
common <- Reduce(intersect, lapply(omics_list, rownames))
message(length(common), " samples shared across ", length(omics_list), " layers")

res <- gaudi(omics_list, min_pts = 12, samples_in_rows = TRUE)

cat("k =", length(setdiff(unique(res@clusters), 0)),
    "| noise =", sum(res@clusters == 0),
    "| silhouette =", round(res@silhouette_score, 3), "\n")
stopifnot(nrow(res@factors) == length(common))

ggplot2::ggsave("results/gaudi_embedding.png", plot_factors(res, label_size = 4),
                width = 7, height = 6, dpi = 300)
ggplot2::ggsave("results/gaudi_grid.png", plot_gaudi_grid(res, top_features = 15),
                width = 14, height = 7, dpi = 300)

clusters <- tibble::rownames_to_column(res@factors, "sample_id")
readr::write_csv(clusters, "results/gaudi_clusters.csv")
```

Record for provenance — `min_pts` (and the sweep), the seed, the per-layer
preprocessing, `gaudi` version (`res@gaudiVersion`), noise fraction,
silhouette, and how cluster 0 was handled.

For a guarded end-to-end version of this — the same run with every failure mode
in *Sharp edges* turned into a loud error, plus a `min_pts` sweep and a
provenance file — see `references/analysis-template.md`. Copy the block into
`gaudi_analysis.R`, fill in the CONFIG section, and run it with `Rscript`.

## Reporting

State plainly:

- number of layers, features per layer, and the **final** sample n after
  intersection
- preprocessing and imputation per layer
- `min_pts` and how it was chosen; the cluster-count sweep
- clusters found, noise fraction, treatment of cluster 0
- silhouette — and that it is computed on the same embedding it evaluates
- random seed; whether `gaudi()` or `c_gaudi()` was used
- for metagenes: that SHAP values are unsigned importance
- multiple-testing correction for pairwise survival and enrichment

Do not claim clusters are biological subtypes on silhouette alone. Do not read
UMAP inter-cluster distances as quantitative — UMAP preserves local
neighbourhoods, not global geometry, so the layout is topology, not a metric
space. Cluster assignments are the output; the coordinates are a picture of
them.

## Limits

- **Unsupervised clustering**, not classification or prediction. No `predict()`;
  new samples require re-running the whole integration.
- **Stochastic.** Set a seed; prefer `c_gaudi()` when stability matters.
- **Complete data required.** No `NA` tolerance — impute upstream.
- **Requires matched samples** across layers. For unmatched single-cell layers,
  the paper matches cells first (PCA + greedy matching, validated with
  Procrustes) *before* GAUDI; that matching is a separate analysis with its own
  assumptions.
- **Unsigned feature attribution.** Magnitude only.
- **Silhouette is internal.** It cannot validate that the cluster count is
  biologically real.

## Reference files

- `references/api-reference.md` — every exported signature, the full default
  set for `gaudi()` and `c_gaudi()`, the `GAUDIObject` slot table, and a
  behaviour matrix of what was observed empirically. Read it when you need an
  argument you cannot find above, or to confirm a slot's shape before indexing.
- `references/analysis-template.md` — a complete guarded analysis script.
  Copy the fenced block to `gaudi_analysis.R` and edit the CONFIG section.
- `references/python-implementation.md` — the method stated
  language-agnostically, plus a tested Python implementation for when R is
  unavailable. Includes the porting traps that make a naive translation
  silently wrong (`min_dist` defaults differ 10×; the noise label differs) and
  a verified account of what reproduces across implementations and what does
  not.

## Sources

- Castellano-Escuder P., Zachman D.K., Han K., Hirschey M.D. GAUDI:
  interpretable multi-omics integration with UMAP embeddings and density-based
  clustering. *Nat Commun* 16, 5771 (2025).
  https://doi.org/10.1038/s41467-025-60822-1
- Package: https://github.com/hirscheylab/gaudi (GPL-3)
- Benchmarks: https://github.com/hirscheylab/umap_multiomics_integration (MIT)
- Archived code: https://doi.org/10.5281/zenodo.15442172
- McInnes L., Healy J., Melville J. UMAP. arXiv:1802.03426
- Campello R.J.G.B. et al. HDBSCAN. *PAKDD* (2013)
- Lundberg S.M., Lee S.-I. A unified approach to interpreting model predictions.
  *NeurIPS* (2017)

