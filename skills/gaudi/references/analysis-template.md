# GAUDI analysis template

A complete, guarded GAUDI run. Every failure mode documented in the *Sharp
edges* section of `SKILL.md` is turned into a loud error here rather than the
silent sample loss or cryptic message it produces by default.

Copy the block below into `gaudi_analysis.R`, edit the CONFIG section, and run
it with `Rscript gaudi_analysis.R`. It expects `omics_list` to already exist —
a named list of matrices, samples in rows, row names set to sample IDs, already
transformed, scaled and imputed per layer.

What it produces in `OUT_DIR`:

| file | contents |
|---|---|
| `min_pts_sweep.csv` | cluster count, noise and silhouette across the sweep |
| `cluster_assignments.csv` | `sample_id`, `UMAP1`, `UMAP2`, `clust` |
| `metagenes_<layer>.csv` | SHAP contributions per feature, per layer |
| `embedding.png`, `gaudi_grid.png` | the 2-D embedding and the metagene grid |
| `gaudi_object.rds` | the full `GAUDIObject` |
| `run_provenance.txt` | versions, seed, parameters, and the caveats to carry into any write-up |

```r
#!/usr/bin/env Rscript
# ---------------------------------------------------------------------------
# GAUDI multi-omics integration — analysis template
#
# Method:  Castellano-Escuder et al., Nat Commun 16:5771 (2025)
#          doi:10.1038/s41467-025-60822-1
# Package: gaudi (github.com/hirscheylab/gaudi), GPL-3
#
# Two-stage UMAP -> HDBSCAN clustering -> SHAP/XGBoost feature attribution.
#
# Fill in the CONFIG block. Everything below it is guarded so that the
# documented failure modes surface as loud errors rather than silent
# sample loss. Read the "Sharp edges" section of SKILL.md first.
# ---------------------------------------------------------------------------

suppressPackageStartupMessages({
  library(gaudi)
  library(dplyr)      # REQUIRED: survival helpers call bare mutate()/across()
  library(patchwork)  # REQUIRED: plot_gaudi_grid() composes with | and /
  library(ggplot2)
  library(tibble)
  library(readr)
})

# ======================= CONFIG ============================================
SEED     <- 42        # UMAP + XGBoost are both stochastic
MIN_PTS  <- NULL      # SET THIS. NULL uses the 3% rule -> fragments small n
SWEEP    <- c(5, 8, 10, 15, 20, 30)   # min_pts values to scan
OUT_DIR  <- "results/gaudi"
USE_CONSENSUS <- FALSE   # TRUE -> c_gaudi(); slower, more reproducible
N_MAX    <- 10           # consensus iterations when USE_CONSENSUS
NOISE    <- "keep"       # "keep" | "drop" | "reassign"  -- a reported decision
# ==========================================================================

set.seed(SEED)
dir.create(OUT_DIR, recursive = TRUE, showWarnings = FALSE)

# --- 1. Load ---------------------------------------------------------------
# Samples in ROWS, features in COLUMNS, row names = sample IDs.
# Preprocess per layer FIRST: transform, scale, impute, drop constant features.
#
# omics_list <- list(
#   expression  = as.matrix(read.csv("data/expr.csv", row.names = 1)),
#   methylation = as.matrix(read.csv("data/meth.csv", row.names = 1)),
#   protein     = as.matrix(read.csv("data/prot.csv", row.names = 1))
# )
stopifnot(exists("omics_list"))

# --- 2. Guard the known failure modes -------------------------------------
stopifnot(is.list(omics_list), length(omics_list) >= 2)
if (is.null(names(omics_list)))
  stop("Name omics_list: metagenes is unnamed, so list order is your only record.")

# NA -> a sample is silently dropped, then bind_cols() crashes cryptically.
bad_na <- names(which(sapply(omics_list, anyNA)))
if (length(bad_na))
  stop("NA present in: ", paste(bad_na, collapse = ", "),
       ". GAUDI cannot tolerate NA -- impute upstream.")

# Row names are mandatory.
if (any(sapply(omics_list, function(x) is.null(rownames(x)))))
  stop("Every layer needs row names (sample IDs).")

# The zero-SD filter tests samples, not features -- filter features ourselves.
omics_list <- lapply(omics_list, function(x) {
  keep <- apply(x, 2, function(f) sd(f) > 0)
  if (any(!keep)) message("  dropping ", sum(!keep), " zero-variance feature(s)")
  x[, keep, drop = FALSE]
})

# Sample intersection is silent -- make it explicit.
common <- Reduce(intersect, lapply(omics_list, rownames))
if (length(common) < 10) stop("Only ", length(common), " shared samples.")
for (nm in names(omics_list))
  message(sprintf("  %-14s %4d samples x %6d features",
                  nm, nrow(omics_list[[nm]]), ncol(omics_list[[nm]])))
message("Shared samples across all layers: ", length(common))

# --- 3. Sweep min_pts -----------------------------------------------------
# The default (3% of n, floor 2) yields ~20 doubleton clusters at n=60.
# Never accept a single cluster count without seeing its stability.
message("\nSweeping min_pts...")
sweep_tbl <- do.call(rbind, lapply(SWEEP, function(mp) {
  r <- suppressMessages(gaudi(omics_list, min_pts = mp, compute_features = FALSE))
  data.frame(min_pts = mp,
             k       = length(setdiff(unique(r@clusters), 0)),
             noise   = sum(r@clusters == 0),
             noise_frac = round(mean(r@clusters == 0), 3),
             silhouette = round(r@silhouette_score, 4))
}))
print(sweep_tbl)
write_csv(sweep_tbl, file.path(OUT_DIR, "min_pts_sweep.csv"))

if (is.null(MIN_PTS)) {
  MIN_PTS <- sweep_tbl$min_pts[which.max(sweep_tbl$silhouette)]
  warning("MIN_PTS was NULL; picked ", MIN_PTS, " by silhouette. ",
          "Silhouette is internal to the embedding -- justify this against ",
          "external evidence before reporting.", call. = FALSE)
}
message("Using min_pts = ", MIN_PTS)

# --- 4. Integrate ---------------------------------------------------------
message("\nRunning ", if (USE_CONSENSUS) "c_gaudi()" else "gaudi()", "...")
res <- if (USE_CONSENSUS) {
  # c_gaudi defaults to sparser XGBoost (eta=1, gamma=100); pin for comparability
  c_gaudi(omics_list, n_max = N_MAX, min_pts = MIN_PTS,
          xgboost_params = list(lambda = 0, eta = 0.5, gamma = 50,
                               max_depth = 10, subsample = 0.95))
} else {
  gaudi(omics_list, min_pts = MIN_PTS)
}

# Confirm no samples vanished.
if (nrow(res@factors) != length(common))
  warning("Expected ", length(common), " samples, got ", nrow(res@factors),
         " -- samples were dropped upstream.", call. = FALSE)

k         <- length(setdiff(unique(res@clusters), 0))
noise_n   <- sum(res@clusters == 0)
message(sprintf("\nk = %d | noise = %d (%.1f%%) | silhouette = %.3f | gaudi %s",
                k, noise_n, 100 * noise_n / nrow(res@factors),
                res@silhouette_score, res@gaudiVersion))
if (k < 2) warning("Fewer than 2 clusters -- no structure recovered.", call. = FALSE)

# --- 5. Handle noise (an explicit, reported decision) ---------------------
res_used <- switch(NOISE,
  keep     = res,
  drop     = { message("Dropping ", noise_n, " noise samples."); drop_clusters(res, 0) },
  reassign = { message("Reassigning noise to nearest cluster (inflates separation).")
               gaudi(omics_list, min_pts = MIN_PTS, reassign_cluster_zero = TRUE) },
  stop("NOISE must be keep | drop | reassign")
)

# --- 6. Export ------------------------------------------------------------
clusters <- res_used@factors |> rownames_to_column("sample_id")
write_csv(clusters, file.path(OUT_DIR, "cluster_assignments.csv"))

# metagenes is UNNAMED -- recover names by input order.
# NOTE: with combine_omics=TRUE, index 1 is the ComBat-combined layer and all
# subsequent indices shift by one.
for (i in seq_along(res_used@metagenes)) {
  nm <- if (i <= length(omics_list)) names(omics_list)[i] else paste0("layer", i)
  mg <- res_used@metagenes[[i]] |> rownames_to_column("feature")
  write_csv(mg, file.path(OUT_DIR, sprintf("metagenes_%s.csv", nm)))
  message(sprintf("  %-14s %d features, %d non-zero SHAP (contrib1)",
                  nm, nrow(mg), sum(mg$contrib1 > 0)))
}

ggsave(file.path(OUT_DIR, "embedding.png"),
       plot_factors(res_used, label_size = 4, draw_lines = TRUE),
       width = 7, height = 6, dpi = 300)
ggsave(file.path(OUT_DIR, "gaudi_grid.png"),
       plot_gaudi_grid(res_used, top_features = 15, on_omics = 1),
       width = 14, height = 7, dpi = 300)

saveRDS(res_used, file.path(OUT_DIR, "gaudi_object.rds"))

# --- 7. Optional: survival ------------------------------------------------
# Named-vector input is BROKEN; use data frames with row names.
#
# time_df   <- data.frame(time   = clin$os_days,  row.names = clin$sample_id)
# censor_df <- data.frame(censor = clin$os_event, row.names = clin$sample_id)
# pairs <- get_pairwise_survival_data(res_used, time_df, censor_df)
# pairs$padj <- p.adjust(pairs$pval, method = "BH")   # pval is RAW
# write_csv(pairs |> mutate(clusters = sapply(clusters, paste, collapse = "v")),
#           file.path(OUT_DIR, "survival_pairwise.csv"))
# ggsave(file.path(OUT_DIR, "km_top_pair.png"),
#        plot_survival(res_used, time_df, censor_df, pairs[["clusters"]][[1]])$plot,
#        width = 7, height = 6, dpi = 300)

# --- 8. Optional: enrichment ---------------------------------------------
# Requires gene symbols as feature names. Returns UNCORRECTED results.
#
# library(org.Hs.eg.db)
# e <- gaudi_enrichment(res_used, on_omics = 1, on_factor = 1,
#                       organism = org.Hs.eg.db)
# e$padj <- p.adjust(e$pvalue, method = "BH")
# write_csv(e[e$padj < 0.05, ], file.path(OUT_DIR, "enrichment_factor1.csv"))
#
# on_factor = 2 needs a manually sorted vector (contrib2 is not sorted):
# gl <- setNames(res_used@metagenes[[1]]$contrib2, rownames(res_used@metagenes[[1]]))
# gl <- sort(gl[gl != 0], decreasing = TRUE)
# e2 <- clusterProfiler::gseGO(gl, ont = "ALL", OrgDb = org.Hs.eg.db,
#                              keyType = "SYMBOL", minGSSize = 2, maxGSSize = 200)

# --- 9. Provenance -------------------------------------------------------
writeLines(c(
  "GAUDI run",
  paste("date:            ", Sys.time()),
  paste("gaudi version:   ", res_used@gaudiVersion),
  paste("R version:       ", R.version.string),
  paste("seed:            ", SEED),
  paste("function:        ", if (USE_CONSENSUS) paste0("c_gaudi(n_max=", N_MAX, ")") else "gaudi"),
  paste("layers:          ", paste(names(omics_list), collapse = ", ")),
  paste("features/layer:  ", paste(sapply(omics_list, ncol), collapse = ", ")),
  paste("samples (shared):", length(common)),
  paste("min_pts:         ", MIN_PTS),
  paste("clusters:        ", k),
  paste("noise:           ", noise_n),
  paste("noise handling:  ", NOISE),
  paste("silhouette:      ", round(res_used@silhouette_score, 4)),
  "",
  "Caveats to carry into any write-up:",
  "- silhouette is computed on the same embedding it evaluates (internal)",
  "- SHAP contributions are unsigned magnitudes, not directions",
  "- UMAP inter-cluster distances are not a metric; do not quantify them",
  "- cluster count must be anchored to external evidence before interpretation"
), file.path(OUT_DIR, "run_provenance.txt"))

message("\nDone. Outputs in ", OUT_DIR)
message("Record min_pts, seed, package versions and noise handling with the results.")
```
