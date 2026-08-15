---
name: pathway-cca-coessentiality
description: Score pathway-pathway association by PCA to k components then first canonical correlation
category: analysis
tags: [cca, pathway-coessentiality]
author: Pol Castellano-Escuder
license: CC-BY-4.0
try-it: pending
---

# Pathway association mapping (PCA → CCA → CC1)

Method from **Stewart, Zachman, Castellano-Escuder et al., "Pathway coessentiality mapping
reveals complex II is required for de novo purine biosynthesis in acute myeloid leukaemia",
Nature Metabolism 7:2474–2488 (2025), doi:10.1038/s42255-025-01410-x**.

Standard coessentiality asks which two *genes* share a profile across samples. This method
lifts the question to *gene sets*: compress each set to its first few principal components,
then score every pair of sets by the **first canonical correlation (CC1)** between their
component blocks. CC1 ∈ [0,1] is the association score.

Use it when the question is set-level ("what processes track with complex II?") rather than
gene-level.

## The procedure

Given a numeric **samples × features** matrix and a collection of feature sets:

1. **For each set**, subset the matrix to that set's features and run PCA over samples
   (center and scale features). Keep the first **k = 4** components. Record the variance those
   k components explain.
2. **For each pair of sets**, compute the canonical correlations between their two component
   blocks and take the **largest one, CC1**.
3. **Cluster** the resulting symmetric CC1 matrix (hierarchical clustering) to expose groups of
   sets with shared association patterns.
4. **Rank and select.** The paper's criterion for "uniquely associated with group X" was
   CC1 ≥ median + 1 SD for X and ≤ median + 1 SD for every comparison group.

Any gene group can serve as a set — a pathway database entry, a protein complex, a custom
signature. The paper defined electron-transport-chain complexes I–V from annotated subunits and
scored them against ~2,827 pathway sets, which is how complex II's association with purine
biosynthesis surfaced. It also found that embedding a complex as a unit gave stronger
associations than scoring its genes individually.

## Why the PCA step is the method

Reducing every set to the same **fixed k** is what makes sets of different sizes comparable,
and it is not a convenience step. Canonical correlation between raw feature blocks rises
mechanically with block width: two *unrelated* random sets score progressively higher as they
get larger, approaching 1 for sets of a few hundred features. After reduction to k = 4 the
expected value for unrelated sets is flat across set sizes.

**Skip the reduction and CC1 measures set size rather than biology.**

k = 4 follows the paper. Raising k inflates CC1 slightly and monotonically, so k must be fixed
across every pair in a run, and reported.

## Any samples × features matrix works

Nothing in the math is specific to gene-dependency data. The paper used CRISPR knockout
dependency scores across cell lines, and "coessentiality" is what CC1 means *for that input*.
Substitute the matrix and CC1 measures co-variation in whatever the matrix encodes:
transcriptomics (co-expression), proteomics (co-regulation), methylation (co-methylation),
metabolomics, drug-response profiles (co-sensitivity).

Requirements: samples in rows, features in columns, roughly continuous values, features
mappable to the set definitions, and enough samples — that last one is usually the binding
constraint. Apply the assay's standard normalization first.

**Name the score for the data.** Reporting "coessentiality" from expression data is wrong; say
co-expression, co-methylation, co-variation.

## What CC1 does and does not tell you

**CC1 is unsigned.** Positively and negatively coupled sets produce the same value. CC1 says
*coupled*, never *same direction*. Recover direction separately, from the canonical vectors or
from signed feature-level correlations.

**CC1 is not comparable across cohorts of different size.** The expected CC1 for unrelated sets
falls steadily as sample count grows — roughly 0.43 at n = 50 and 0.09 at n = 1,100 for k = 4.
So 0.45 is indistinguishable from noise in a 50-sample cohort and strong in a 1,100-sample one.
Always report n alongside CC1, and never compare a subset's CC1 to the full cohort's. Small
clinical cohorts (n ≈ 30–60) are largely uninformative without a matched null.

**Overlapping sets inflate CC1 mechanically.** Hierarchical databases share features between
parent and child terms. Sets sharing half their features score high on essentially any data;
fully shared sets score 1. Compute the Jaccard overlap for every reported pair and either
exclude it or disclose it — a top hit that shares features with the query is arithmetic, not
discovery.

**Self-comparison is trivially 1.** Exclude the diagonal before computing any median, SD, or
threshold, or every summary statistic is biased upward.

**A single feature scored against a set** is not a correlation with that set's first component;
it is the multiple correlation of the feature regressed on all k components. Describe it that
way.

**CC1 is associational.** It is co-variation across samples — not causality, not clinical
validation. The paper treated hits as hypotheses and confirmed the complex II → purine
biosynthesis link with CRISPR screening, mass-spec metabolomics, isotope tracing, and an in vivo
leukaemia model. Hold results to that standard.

## The confounding trap when generalizing

Dependency-score matrices are comparatively decorrelated. Expression, proteomics, and
methylation matrices usually are not: proliferation rate, sample purity, cell-type composition,
and batch load on nearly every feature at once.

**A single such global axis pushes essentially every pair toward 1, including unrelated ones.**
In controlled tests, a moderate global factor drove disjoint, unrelated sets from a baseline
near 0.12 up to 0.83–0.98. Every CC1 in such a run is suspect.

Diagnose it before running anything by checking the variance explained by the first component of
the *full* matrix. If that component dominates, deal with it before interpreting any score.

Removing global components by regression is tempting but hazardous: in tests where real
structure was also present, removing one component left substantial inflation while removing two
destroyed the real signal — the second component *was* the biology. There is no safe
scree-position rule. Only regress out components you can independently identify, such as a
recorded batch variable or measured purity.

## Calibrating significance

The published method reports no p-values and no multiple-testing correction across the full
pairwise grid, so treat raw output as a **ranking heuristic**. The median + 1 SD cut is
distribution-relative and does not transfer across data types or cohort sizes — recompute it on
your own distribution and report the median and SD used. Never hard-code a threshold from
another study.

For calibrated significance, use a permutation null — but choose the right one:

- **Sample-label permutation** (shuffle sample order in one block) breaks cross-set coupling
  while preserving each set's internal structure. Adequate for dependency-like data. **It fails
  when a global axis is present**: shuffling destroys the global coupling too, so the null
  collapses and unrelated pairs get declared significant. Anti-conservative precisely where help
  is needed.
- **Size-matched random-set permutation** (hold the query set fixed, draw random feature sets of
  matched size from the measured pool) keeps the global axis in both the observed score and the
  null, so it cancels. In tests this correctly separated an unrelated pair from a real signal
  where label permutation did not, and it also behaves correctly on clean data — the safer
  default.

A matched null sitting unusually high is itself the signal that a global axis dominates. Correct
across pairs with BH-FDR.

## Implementation notes

Language-agnostic: the method needs only PCA and canonical correlation, both standard. R and
Python return identical CC1 to six decimal places on the same input, including across CCA
implementations that use different underlying algorithms.

Canonical correlation is symmetric, so compute the upper triangle only.

Practical guards — each of these fails loudly or, worse, silently in common libraries:

- **Missing values** typically abort PCA and canonical correlation outright. Set an explicit
  policy: drop features/samples above a missingness threshold, then impute or use complete
  cases. Apply it globally and record it. Mass-spec data needs an assay-appropriate imputation,
  since missingness there is usually not random.
- **Zero-variance features** break scaled PCA. Filter them on the *feature* axis; confusing the
  axes here is an easy and consequential bug.
- **Sets smaller than k** silently yield fewer than k components, putting their CC1 on a
  different footing. Set a minimum set size (≥ 5) and record how many sets were dropped.
  Restrict every set to features actually measured in your matrix first — coverage varies widely
  by platform.
- **Sample misalignment is silent.** Mismatched row *counts* usually raise an error, but rows in
  the wrong *order* do not — they just return a wrong number. Intersect and reorder samples by
  ID before subsetting, and assert the identifiers match.

## Reporting checklist

Input data type, provenance, and normalization; **n samples**; feature-set source and its
coverage in your matrix; **k** and the variance explained per set; minimum set size;
missing-value and zero-variance policy; variance share of the full matrix's first component; the
null model used, if any; the selection threshold with the median and SD it came from; Jaccard
overlap for reported pairs; and explicitly that CC1 is unsigned and uncorrected.
