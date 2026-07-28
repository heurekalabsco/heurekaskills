# gaudi 0.1.18 — verified API reference

All signatures taken from the installed package NAMESPACE and source, and
exercised under R 4.3.2. Behaviour notes marked **[verified]** were observed
empirically, not read from documentation.

## Exported functions

```
gaudi(omics, umap_params, umap_params_conc, min_pts, xgboost_params,
      compute_features, combine_omics, clean_feature_names,
      samples_in_rows, reassign_cluster_zero, method)
c_gaudi(omics, n_max, ...)            # same args plus n_max

align_omics(omics)
clean_feature_names(omics)
umap_factorization(umap_params)
xgboost_model(x, y, xgboost_params)
generate_batch(vec)
bootstrap_omics(data, n, perturbation = 0.1)

drop_clusters(object, clusters = 0)
reassign_cluster_zero(data, nearest_centroid = FALSE)

plot_factors(object, label_size = 0, draw_lines = FALSE,
             ad_hoc_label = NULL, palette = "magma")
plot_metagenes(object, on_omics = 1, on_factor = 1, top = 10,
               palette = "plasma")
plot_gaudi_grid(object, top_features = 10, on_omics = 1, label_size = 4,
                draw_lines = TRUE, ad_hoc_label = NULL, annotations = TRUE)

plot_survival(object, time, censor, show_clusters = NULL)
get_pairwise_survival_data(object, time, censor)

gaudi_enrichment(object, on_omics, on_factor = 1, organism = org.Hs.eg.db,
                 ontology = "ALL", minGSSize = 2, maxGSSize = 200)
```

## Defaults

```r
gaudi:   umap_params      = list(n_neighbors = 15, n_components = 4)
         umap_params_conc = list(n_neighbors = 15, n_components = 2)
         min_pts          = NULL   # -> max(floor(0.03 * n_samples), 2)
         xgboost_params   = list(lambda = 0, eta = 0.5, gamma = 50,
                                 max_depth = 10, subsample = 0.95)
         compute_features = TRUE   combine_omics = FALSE
         clean_feature_names = FALSE   samples_in_rows = TRUE
         reassign_cluster_zero = FALSE  method = "xgboost"

c_gaudi: n_max = 10
         xgboost_params = list(lambda = 0, eta = 1, gamma = 100,
                              max_depth = 10, subsample = 0.95)   # DIFFERENT
```

`metric = "euclidean"` and `min_dist = 0.01` are inherited `uwot::umap`
defaults, not `gaudi()` arguments. **[verified]** against `formals(uwot::umap)`.

Fixed internally, not user-settable: `objective = "reg:squarederror"`,
`nrounds = 10`, `early_stopping_rounds = 8`,
`nthread = parallel::detectCores() - 2`.

## GAUDIObject (S4)

| slot | class | notes |
|---|---|---|
| `factors` | data.frame | n × 3: `UMAP1`, `UMAP2`, `clust`; row names = sample IDs |
| `clusters` | numeric | `0` = HDBSCAN noise |
| `silhouette_score` | numeric | mean silhouette on 2-D embedding; `0` if k = 1 |
| `individual_factors` | list | **named** from input list; n×4 each; **empty for `c_gaudi`** |
| `metagenes` | list | **unnamed** — positional only; `contrib1`, `contrib2` |
| `gaudiVersion` | character | e.g. `"0.1.18"` |

**[verified]** `individual_factors` inherits input names; `metagenes` does not.
Keep your input list order to know which layer is which.

## Verified behaviours

| behaviour | result |
|---|---|
| shuffled row order across layers | correctly realigned by name; n preserved |
| partial sample overlap (40/60) | silently intersected to 40 |
| unnamed rows | error: `n_neighbors must be smaller than the dataset size` |
| single `NA` in one cell | that **sample** dropped, then `bind_cols` size-mismatch crash |
| constant **sample** (flat row) | dropped silently |
| constant **feature** (flat column) | **kept** (filter intends features, tests samples) |
| `samples_in_rows = FALSE` | works; row names still required |
| `metagenes[[i]]$contrib1` | sorted descending |
| `metagenes[[i]]$contrib2` | **not** sorted |
| SHAP values | non-negative; ~99% exactly 0 at `gamma = 50` |
| `combine_omics = TRUE` | prepends ComBat layer; `on_omics` indices shift by 1 |
| `reassign_cluster_zero = TRUE` | reorders `@factors` rows (noise moved to end) |

## Attachment requirements

| function | needs attached | failure if missing |
|---|---|---|
| `plot_gaudi_grid` | `patchwork` | `non-numeric argument to binary operator` |
| `get_pairwise_survival_data` | `dplyr` | `could not find function "mutate"` |
| `plot_survival` | `dplyr` | same |
| `gaudi_enrichment` | org db installed | `Annotation data package ... is not installed` |

## Survival input

Documented as accepting named vectors — **the vector path is broken**
(`could not find function ":="`). **[verified]** Use data frames:

```r
time_df   <- data.frame(time   = <numeric>, row.names = <sample ids>)
censor_df <- data.frame(censor = <0/1>,     row.names = <sample ids>)
```

`get_pairwise_survival_data` returns `clusters` (list col), `pval` (**raw**
log-rank), `distance` (centroid Euclidean in the 2-D manifold), `quality`
(`0.8 * log10(p)/log10(min p) + 0.2 * scaled distance`; triage heuristic only).
Correct `pval` across all `choose(k, 2)` pairs yourself.

## Enrichment

`gaudi_enrichment` hardcodes `pvalueCutoff = 1`, `pAdjustMethod = "none"`,
`keyType = "SYMBOL"`. Returns `gseGO(...)@result` **unfiltered and
uncorrected**. Row names of the selected layer must be gene symbols. Works only
for `on_factor = 1` (sort order); build the vector manually for factor 2.

## min_pts sensitivity (n = 60, 3 true groups, clean separation)

| `min_pts` | k found | noise | silhouette |
|---|---|---|---|
| 2 (default at n=60) | 19 | 4 | 0.332 |
| 5 | 3 | 0 | 0.959 |
| 10 | 3 | 0 | 0.956 |
| 18 | 3 | 0 | 0.941 |

The default is unusable below ~150 samples. Always set and sweep `min_pts`.
