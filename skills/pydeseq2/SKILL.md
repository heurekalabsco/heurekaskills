---
name: pydeseq2
description: Differential gene expression for bulk RNA-seq with PyDESeq2 — formulaic designs, Wald tests, FDR correction, LFC shrinkage, and result visualization.
category: analysis
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.1.0
tags: [rna-seq, differential-expression, deseq2, statistics]
datasets: [https://raw.githubusercontent.com/owkin/PyDESeq2/main/datasets/synthetic/test_counts.csv, https://raw.githubusercontent.com/owkin/PyDESeq2/main/datasets/synthetic/test_metadata.csv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-24
  against: pydeseq2 0.5.4 / anndata 0.12.19 / pandas 2.3.3 / numpy 2.4.6 / Python 3.11.15
  executed: 60
  unverified: 2
  unverified_reason: >-
    Two blocks in references/workflow_guide.md cannot execute by construction — each carries
    a literal `...` standing in for a design or an interaction contrast vector the reader
    supplies. Rewriting them as complete worked examples, against metadata that actually
    carries an interaction term, is what would make them runnable.
---
# PyDESeq2

## Overview

PyDESeq2 is a Python implementation of DESeq2 for differential expression analysis with bulk RNA-seq data. Design and execute complete workflows from data loading through result interpretation, including formulaic single-factor and multi-factor designs, Wald tests with multiple testing correction, optional apeGLM shrinkage, and integration with pandas and AnnData.

## When to Use This Skill

This skill should be used when:
- Analyzing bulk RNA-seq count data for differential expression
- Comparing gene expression between experimental conditions (e.g., treated vs control)
- Performing multi-factor designs accounting for batch effects or covariates
- Converting R-based DESeq2 workflows to Python
- Integrating differential expression analysis into Python-based pipelines
- Users mention "DESeq2", "differential expression", "RNA-seq analysis", or "PyDESeq2"

## Quick Start Workflow

For users who want to perform a standard differential expression analysis:

```python
import pandas as pd
from pydeseq2.dds import DeseqDataSet
from pydeseq2.default_inference import DefaultInference
from pydeseq2.ds import DeseqStats

# 1. Load data
counts_df = pd.read_csv("counts.csv", index_col=0).T  # Transpose to samples × genes
metadata = pd.read_csv("metadata.csv", index_col=0)

# 2. Filter low-count genes
genes_to_keep = counts_df.columns[counts_df.sum(axis=0) >= 10]
counts_df = counts_df[genes_to_keep]

# 3. Make the reference level explicit and fit DESeq2
metadata["condition"] = pd.Categorical(
    metadata["condition"], categories=["control", "treated"]
)
inference = DefaultInference(n_cpus=4)
dds = DeseqDataSet(
    counts=counts_df,
    metadata=metadata,
    design="~condition",
    refit_cooks=True,
    inference=inference,
)
dds.deseq2()

# 4. Perform statistical testing
ds = DeseqStats(
    dds,
    contrast=["condition", "treated", "control"],
    inference=inference,
)
ds.summary()

# 5. Access results — .copy() matters: lfc_shrink() overwrites results_df in place,
#    so without it this name would follow the shrunk values later.
results = ds.results_df.copy()
significant = results[results.padj < 0.05]
print(f"Found {len(significant)} significant genes")
```

## Core Workflow Steps

The six steps, with code, are in
[references/core_workflow_steps.md](references/core_workflow_steps.md):

1. **Data preparation** — raw integer counts with genes as columns and samples as rows,
   and matching metadata. Never feed normalized or transformed values to DESeq2.
2. **Design specification** — the design factors and the reference level for each.
3. **DESeq2 fitting** — size factors, dispersions, and the GLM fit.
4. **Statistical testing** — Wald tests for a named contrast.
5. **Optional LFC shrinkage** — for ranking and visualization.
6. **Result export** — the results table with adjusted p-values.

Multi-factor designs, contrasts, and interaction terms are in
[references/analysis_patterns.md](references/analysis_patterns.md).

## Completing the Run

Extend the Quick Start with shrinkage and export. Shrunk LFCs are for ranking and
plotting — keep the unshrunk table for the p-values you report.

```python
# Shrink the log2 fold changes for ranking/visualization.
# The coefficient name comes from the design, not the contrast: inspect
# dds.obsm["design_matrix"].columns if you are unsure what to pass.
# lfc_shrink() rewrites ds.results_df IN PLACE — it returns nothing, and any name
# still bound to ds.results_df now sees shrunk values. That is why step 5 copied.
ds.lfc_shrink(coeff="condition[T.treated]")
shrunk = ds.results_df

results.to_csv("deseq2_results.csv")          # unshrunk — report these stats

# to_picklable_anndata() leaves uns["trend_coeffs"] as a pandas Series, which the
# h5ad writer refuses (IORegistryError). Convert it first.
adata = dds.to_picklable_anndata()
adata.uns["trend_coeffs"] = adata.uns["trend_coeffs"].to_numpy()
adata.write_h5ad("dds.h5ad")                  # portable full object
```

A volcano plot off the shrunk table:

```python
import numpy as np, matplotlib.pyplot as plt

d = shrunk.dropna(subset=["padj"])
sig = (d.padj < 0.05) & (d.log2FoldChange.abs() > 1)
plt.scatter(d.log2FoldChange, -np.log10(d.padj), s=6, c=np.where(sig, "crimson", "lightgray"))
plt.axhline(-np.log10(0.05), ls="--", lw=0.8); plt.axvline(-1, ls="--", lw=0.8); plt.axvline(1, ls="--", lw=0.8)
plt.xlabel("log2 fold change"); plt.ylabel("-log10 adjusted p")
plt.savefig("volcano.png", dpi=200, bbox_inches="tight")
```

To batch several contrasts, build the `DeseqDataSet` once and loop `DeseqStats` over
each contrast — refitting the model per contrast wastes the expensive step.

## Result Interpretation

### Identifying Significant Genes

```python
# Filter by adjusted p-value
significant = ds.results_df[ds.results_df.padj < 0.05]

# Filter by both significance and effect size
sig_and_large = ds.results_df[
    (ds.results_df.padj < 0.05) &
    (abs(ds.results_df.log2FoldChange) > 1)
]

# Separate up- and down-regulated
upregulated = significant[significant.log2FoldChange > 0]
downregulated = significant[significant.log2FoldChange < 0]

print(f"Upregulated: {len(upregulated)}")
print(f"Downregulated: {len(downregulated)}")
```

### Ranking and Sorting

```python
# Sort by adjusted p-value
top_by_padj = ds.results_df.sort_values("padj").head(20)

# Sort by absolute fold change (use shrunk values)
ds.lfc_shrink(coeff="condition[T.treated]")
ds.results_df["abs_lfc"] = abs(ds.results_df.log2FoldChange)
top_by_lfc = ds.results_df.sort_values("abs_lfc", ascending=False).head(20)

# Sort by a combined metric
ds.results_df["score"] = -np.log10(ds.results_df.padj) * abs(ds.results_df.log2FoldChange)
top_combined = ds.results_df.sort_values("score", ascending=False).head(20)
```

### Quality Metrics

```python
# Check normalization (size factors should be close to 1)
print("Size factors:", dds.obs["size_factors"])

# Examine dispersion estimates
import matplotlib.pyplot as plt
plt.hist(dds.var["dispersions"], bins=50)
plt.xlabel("Dispersion")
plt.ylabel("Frequency")
plt.title("Dispersion Distribution")
plt.show()

# Check p-value distribution (should be mostly flat with peak near 0)
plt.hist(ds.results_df.pvalue.dropna(), bins=50)
plt.xlabel("P-value")
plt.ylabel("Frequency")
plt.title("P-value Distribution")
plt.show()
```

## Visualization Guidelines

### Volcano Plot

Visualize significance vs effect size:

```python
import matplotlib.pyplot as plt
import numpy as np

results = ds.results_df.copy()
results["-log10(padj)"] = -np.log10(results.padj)

plt.figure(figsize=(10, 6))
significant = results.padj < 0.05

plt.scatter(
    results.loc[~significant, "log2FoldChange"],
    results.loc[~significant, "-log10(padj)"],
    alpha=0.3, s=10, c='gray', label='Not significant'
)
plt.scatter(
    results.loc[significant, "log2FoldChange"],
    results.loc[significant, "-log10(padj)"],
    alpha=0.6, s=10, c='red', label='padj < 0.05'
)

plt.axhline(-np.log10(0.05), color='blue', linestyle='--', alpha=0.5)
plt.xlabel("Log2 Fold Change")
plt.ylabel("-Log10(Adjusted P-value)")
plt.title("Volcano Plot")
plt.legend()
plt.savefig("volcano_plot.png", dpi=300)
```

### MA Plot

Show fold change vs mean expression:

```python
plt.figure(figsize=(10, 6))

plt.scatter(
    np.log10(results.loc[~significant, "baseMean"] + 1),
    results.loc[~significant, "log2FoldChange"],
    alpha=0.3, s=10, c='gray'
)
plt.scatter(
    np.log10(results.loc[significant, "baseMean"] + 1),
    results.loc[significant, "log2FoldChange"],
    alpha=0.6, s=10, c='red'
)

plt.axhline(0, color='blue', linestyle='--', alpha=0.5)
plt.xlabel("Log10(Base Mean + 1)")
plt.ylabel("Log2 Fold Change")
plt.title("MA Plot")
plt.savefig("ma_plot.png", dpi=300)
```

## Troubleshooting Common Issues

### Data Format Problems

**Issue:** "Index mismatch between counts and metadata"

**Solution:** Ensure sample names match exactly
```python
print("Counts samples:", counts_df.index.tolist())
print("Metadata samples:", metadata.index.tolist())

# Take intersection if needed
common = counts_df.index.intersection(metadata.index)
counts_df = counts_df.loc[common]
metadata = metadata.loc[common]
```

**Issue:** "All genes have zero counts"

**Solution:** Check if data needs transposition
```python
print(f"Counts shape: {counts_df.shape}")
# If genes > samples, transpose is needed
if counts_df.shape[1] < counts_df.shape[0]:
    counts_df = counts_df.T
```

### Design Matrix Issues

**Issue:** "Design matrix is not full rank"

**Cause:** Confounded variables (e.g., all treated samples in one batch)

**Solution:** Remove confounded variable or add interaction term
```python
# Check confounding
print(pd.crosstab(metadata.condition, metadata.batch))

# Either simplify design or add interaction
design = "~condition"  # Remove batch
# OR
design = "~condition + batch + condition:batch"  # Model interaction
```

### No Significant Genes

**Diagnostics:**
```python
# Check dispersion distribution
plt.hist(dds.var["dispersions"], bins=50)
plt.show()

# Check size factors
print(dds.obs["size_factors"])

# Look at top genes by raw p-value
print(ds.results_df.nsmallest(20, "pvalue"))
```

**Possible causes:**
- Small effect sizes
- High biological variability
- Insufficient sample size
- Technical issues (batch effects, outliers)

## Try it

A self-contained check that this skill still works. No account, no key, no GPU — but it
does need network access the first time, which is the part worth knowing about.

**Data** — the synthetic bulk RNA-seq matrix PyDESeq2 uses for its own CI: 100 samples ×
10 genes of integer counts, with `condition` in {A, B} and `group` in {X, Y}.

    https://raw.githubusercontent.com/owkin/PyDESeq2/main/datasets/synthetic/test_counts.csv
    https://raw.githubusercontent.com/owkin/PyDESeq2/main/datasets/synthetic/test_metadata.csv

`load_example_data()` looks local but is not. It first tries a `datasets/` directory beside
the installed package; a wheel does not ship one, so on any `pip install` it falls back to
fetching those two URLs. Offline, it raises a URL error rather than returning data. The
library still hardcodes the `owkin` path even though the project moved to `scverse` in
December 2025 — GitHub redirects it, and that redirect is what the URLs above probe. The
data is MIT, like the package. Last confirmed reachable 2026-08-24.

```bash
pip install "pydeseq2==0.5.4"
```

```python
import numpy as np
from pydeseq2.dds import DeseqDataSet
from pydeseq2.ds import DeseqStats
from pydeseq2.utils import load_example_data

# Orientation is the trap: DESeq2 wants samples x genes, and most count files ship
# genes x samples. load_example_data already returns samples x genes.
counts = load_example_data("raw_counts")       # 100 samples x 10 genes, integer
metadata = load_example_data("metadata")       # condition in {A, B}, group in {X, Y}
print("counts  :", counts.shape, counts.to_numpy().dtype)
print("metadata:", metadata.shape, sorted(metadata["condition"].unique()))

dds = DeseqDataSet(counts=counts, metadata=metadata, design="~condition", quiet=True)
dds.deseq2()

ds = DeseqStats(dds, contrast=["condition", "B", "A"], quiet=True)
ds.summary()
res = ds.results_df.copy()          # copy: lfc_shrink() overwrites results_df in place

print("columns :", list(res.columns))
print("genes   :", len(res), "| padj < 0.05:", int((res.padj < 0.05).sum()))
print("size factors: %.3f - %.3f" % (dds.obs["size_factors"].min(), dds.obs["size_factors"].max()))
print("design matrix:", list(dds.obsm["design_matrix"].columns))
print(res.round(4).to_string())

# lfc_shrink takes a DESIGN MATRIX column, not the contrast triple.
ds.lfc_shrink(coeff="condition[T.B]")
shrunk = ds.results_df
print("shrunk LFC range: %.3f - %.3f" % (shrunk.log2FoldChange.min(), shrunk.log2FoldChange.max()))

try:
    ds.lfc_shrink(coeff="condition_B_vs_A")
    raise SystemExit("expected a KeyError for a contrast-shaped coeff")
except KeyError:
    print("contrast-shaped coeff -> KeyError, as it should")

# Exporting the fitted object: uns["trend_coeffs"] is a pandas Series, which h5ad
# cannot write. Convert it or write_h5ad raises IORegistryError.
adata = dds.to_picklable_anndata()
print("trend_coeffs is a", type(adata.uns["trend_coeffs"]).__name__,
      "->", np.round(adata.uns["trend_coeffs"].to_numpy(), 4))
adata.uns["trend_coeffs"] = adata.uns["trend_coeffs"].to_numpy()
adata.write_h5ad("dds.h5ad")
print("wrote dds.h5ad after converting trend_coeffs")

# --- invariants -------------------------------------------------------------
assert counts.shape == (100, 10) and metadata.shape == (100, 2)
assert list(res.columns) == ["baseMean", "log2FoldChange", "lfcSE", "stat", "pvalue", "padj"]
assert len(res) == counts.shape[1]                      # one row per gene
assert (dds.obs["size_factors"] > 0).all()
assert list(dds.obsm["design_matrix"].columns) == ["Intercept", "condition[T.B]"]
d = res.dropna(subset=["padj"])
assert (d.padj >= d.pvalue - 1e-12).all()               # BH is never below the raw p
assert (shrunk.log2FoldChange.abs() <= res.log2FoldChange.abs() + 1e-9).all()
assert res.pvalue.equals(shrunk.pvalue)                 # shrinkage does not touch p-values

# --- observed 2026-08-24, pydeseq2 0.5.4 ------------------------------------
assert int((res.padj < 0.05).sum()) == 3
assert sorted(res.index[res.padj < 0.05]) == ["gene2", "gene4", "gene5"]
assert abs(res.loc["gene5", "log2FoldChange"] - 0.5821) < 1e-3
print("OK")
```

**Expect**

Invariants — these hold across versions, and a failure means the skill is wrong:

- `results_df` carries exactly `baseMean, log2FoldChange, lfcSE, stat, pvalue, padj`, one
  row per **gene** — 10 here, from a 100 × 10 matrix. If you get 100 rows, the counts went
  in transposed.
- The design matrix column is `condition[T.B]`, not the contrast `["condition","B","A"]`.
  `lfc_shrink()` takes the former; passing the latter raises `KeyError`. This is the single
  most common way to get stuck, so the block asserts both directions.
- `lfc_shrink()` returns `None` and rewrites `results_df` **in place**. Without the `.copy()`
  above, `res` and `shrunk` are the same object and any "unshrunk" figure you report is
  shrunk. The two assertions comparing them are meaningless without it.
- Shrinkage moves `log2FoldChange` toward zero and leaves `pvalue` untouched.
- `padj >= pvalue` everywhere Benjamini-Hochberg returned a value.
- All size factors are positive.
- `to_picklable_anndata()` hands back `uns["trend_coeffs"]` as a pandas Series, and
  `write_h5ad` rejects it with `IORegistryError`. Convert to an array first.

Observed 2026-08-24 against **pydeseq2 0.5.4** — the dataset is fixed and the fit is
deterministic, so these should reproduce exactly; a change means upstream drifted:

```
counts  : (100, 10) int64
metadata: (100, 2) ['A', 'B']
columns : ['baseMean', 'log2FoldChange', 'lfcSE', 'stat', 'pvalue', 'padj']
genes   : 10 | padj < 0.05: 3
size factors: 0.620 - 1.850
design matrix: ['Intercept', 'condition[T.B]']
        baseMean  log2FoldChange   lfcSE    stat  pvalue    padj
gene1     8.5413          0.6328  0.2891  2.1889  0.0286  0.0641
gene2    21.2812          0.5386  0.1500  3.5912  0.0003  0.0016
gene3     5.0101         -0.6328  0.2952 -2.1435  0.0321  0.0641
gene4   100.5180         -0.4121  0.1186 -3.4739  0.0005  0.0017
gene5    27.1425          0.5821  0.1547  3.7624  0.0002  0.0016
gene6     5.4130          0.0015  0.3103  0.0047  0.9963  0.9963
gene7    28.2940          0.1343  0.1499  0.8959  0.3703  0.4114
gene8    40.3583         -0.2707  0.1364 -1.9843  0.0472  0.0787
gene9    37.1662         -0.2127  0.1332 -1.5964  0.1104  0.1431
gene10   11.5893          0.3860  0.2446  1.5782  0.1145  0.1431
shrunk LFC range: -0.396 - 0.522
contrast-shaped coeff -> KeyError, as it should
trend_coeffs is a Series -> [0.0861 4.8285]
wrote dds.h5ad after converting trend_coeffs
OK
```

## Reference Documentation

For comprehensive details beyond this workflow-oriented guide:

- **API Reference** (`references/api_reference.md`): Complete documentation of PyDESeq2 classes, methods, and data structures. Use when needing detailed parameter information or understanding object attributes.

- **Workflow Guide** (`references/workflow_guide.md`): In-depth guide covering complete analysis workflows, data loading patterns, multi-factor designs, troubleshooting, and best practices. Use when handling complex experimental designs or encountering issues.

Load these references into context when users need:
- Detailed API documentation: `Read references/api_reference.md`
- Comprehensive workflow examples: `Read references/workflow_guide.md`
- Troubleshooting guidance: `Read references/workflow_guide.md` (see Troubleshooting section)

## Key Reminders

1. **Data orientation matters:** Count matrices typically load as genes × samples but need to be samples × genes. Always transpose with `.T` if needed.

2. **Sample filtering:** Remove samples with missing metadata before analysis to avoid errors.

3. **Gene filtering:** Filter low-count genes (e.g., < 10 total reads) to improve power and reduce computational time.

4. **Design formula order:** Put adjustment variables before the variable of interest (e.g., `"~batch + condition"` not `"~condition + batch"`).

5. **LFC shrinkage timing:** Apply shrinkage after statistical testing and only for visualization/ranking purposes. P-values remain based on unshrunken estimates.

6. **Result interpretation:** Use `padj < 0.05` for significance, not raw p-values. The Benjamini-Hochberg procedure controls false discovery rate.

7. **Contrast specification:** The format is `[variable, test_level, reference_level]` where test_level is compared against reference_level.

8. **Save intermediate objects:** Prefer `.h5ad` over pickle for portable outputs, converting `uns["trend_coeffs"]` to an array first — `to_picklable_anndata()` leaves it a pandas Series and the h5ad writer rejects that. Only load pickle files that you created yourself and trust.

9. **`lfc_shrink()` mutates:** it returns `None` and rewrites `ds.results_df` in place. Copy the unshrunk table before calling it, or the "unshrunk" numbers you report will be shrunk ones.

## Installation and Requirements

```bash
uv pip install pydeseq2==0.5.4
```

**System requirements:**
- Python 3.11+
- PyDESeq2 0.5.4
- pandas 2.2.0+
- numpy 2.0.0+
- scipy 1.12.0+
- scikit-learn 1.4.0+
- anndata 0.11.0+
- formulaic 1.0.2+ and formulaic-contrasts 0.2.0+

**Optional for visualization:**
- matplotlib
- seaborn

## Additional Resources

- **Official Documentation:** https://pydeseq2.readthedocs.io
- **GitHub Repository:** https://github.com/scverse/PyDESeq2
- **Publication:** Muzellec et al. (2023) Bioinformatics, DOI: 10.1093/bioinformatics/btad547
- **Original DESeq2 (R):** Love et al. (2014) Genome Biology, DOI: 10.1186/s13059-014-0550-8
