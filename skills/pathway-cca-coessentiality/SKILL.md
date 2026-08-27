---
name: pathway-cca-coessentiality
description: Score pathway-pathway association by PCA to k components then first canonical correlation
category: analysis
tags: [cca, pathway-coessentiality]
author: Pol Castellano-Escuder
version: 1.3.0
license: CC-BY-4.0
datasets: []
verified:
  date: 2026-08-19
  against: NumPy 2.4.6 / Python 3.11.15
  executed: 1
  unverified: 0
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

## Try it

A self-contained check that this skill's own claims still hold. No account, no key, nothing
to download beyond `numpy`. Runs in about a second.

**Data** — generated inline, and the frontmatter says so with `datasets: []` rather than
naming a source. That is the point rather than a shortcut: every claim below is about what
CC1 does when there is **nothing to find**, and only simulation can guarantee that. The
matrices here are drawn from independent normals, so any score above the null is arithmetic,
not biology. The one place a real signal appears, it is planted by adding a shared factor to
two disjoint feature sets, so its true answer is known too.

**Run**

```python
import numpy as np

rng = np.random.default_rng(20260819)
K = 4  # fixed across every pair in a run, and reported


def block(M, k=K):
    """Center + scale features, PCA over samples, return the first k component scores."""
    X = M - M.mean(0)
    sd = X.std(0, ddof=1)
    X = X[:, sd > 0] / sd[sd > 0]          # zero-variance filter, on the FEATURE axis
    U, S, _ = np.linalg.svd(X, full_matrices=False)
    k = min(k, X.shape[1], X.shape[0] - 1)  # a set smaller than k silently gives fewer
    return U[:, :k] * S[:k]


def cc1(A, B):
    """Largest canonical correlation between two sample-aligned blocks."""
    def whiten(Z):
        Q, R = np.linalg.qr(Z - Z.mean(0))
        d = np.abs(np.diag(R))
        return Q[:, d > 1e-10 * d.max()]
    Qa, Qb = whiten(A), whiten(B)
    return float(np.clip(np.linalg.svd(Qa.T @ Qb, compute_uv=False)[0], 0, 1))


# 1. The reduction IS the method. Both sets are pure noise — there is nothing to find.
N = 200
print(f"1. unrelated sets, n = {N} samples: raw feature blocks vs k = 4 components")
raw_curve, red_curve = [], []
for w in (5, 10, 25, 50, 80):
    r = [(cc1(A, B), cc1(block(A), block(B)))
         for A, B in ((rng.standard_normal((N, w)), rng.standard_normal((N, w)))
                      for _ in range(20))]
    raw_curve.append(np.mean([x[0] for x in r]))
    red_curve.append(np.mean([x[1] for x in r]))
    print(f"   set width {w:3d} features   raw CC1 = {raw_curve[-1]:.3f}   k=4 CC1 = {red_curve[-1]:.3f}")
assert np.all(np.diff(raw_curve) > 0), "raw CC1 must chase set size"
assert raw_curve[-1] > 0.9 > raw_curve[0], "raw CC1 must reach the top of the scale"
assert np.ptp(red_curve) < 0.05, "k=4 CC1 must be flat across set size"

# Past width = n/2 the raw score is not even statistics: two subspaces of more than half
# the sample dimension must intersect, so CC1 is exactly 1 by dimension counting.
wide = cc1(rng.standard_normal((N, N // 2)), rng.standard_normal((N, N // 2)))
print(f"   set width {N // 2:3d} features   raw CC1 = {wide:.3f}   (exactly 1 by dimension counting)")
assert wide > 1 - 1e-9

# 2. The k = 4 null is not a constant — it falls with sample count.
print("\n2. k = 4 null for unrelated sets, by cohort size")
null = {}
for n in (50, 200, 1100):
    v = [cc1(block(rng.standard_normal((n, 40))), block(rng.standard_normal((n, 40))))
         for _ in range(60)]
    null[n] = float(np.mean(v))
    print(f"   n = {n:5d}   mean CC1 = {null[n]:.3f}   sd = {np.std(v):.3f}")
assert null[50] > null[200] > null[1100], "the null must fall as n grows"

# 3. Invariants, and the two failures that are silent.
print("\n3. invariants and silent failures")
M = rng.standard_normal((150, 90))
shared = rng.standard_normal((150, 1))
S1, S2 = M[:, :20] + shared, M[:, 40:60] + shared      # disjoint features, planted coupling
S3 = M[:, 60:80]                                       # disjoint and unrelated
b1, b2, b3 = block(S1), block(S2), block(S3)
print(f"   self-comparison CC1, 1 - CC1   = {1 - cc1(b1, b1):.1e}")
print(f"   symmetry |CC1(a,b) - CC1(b,a)| = {abs(cc1(b1, b2) - cc1(b2, b1)):.1e}")
print(f"   planted shared factor          = {cc1(b1, b2):.3f}")
print(f"   unrelated pair, same n and k   = {cc1(b1, b3):.3f}")
print(f"   set of 3 features under k = 4  -> {block(M[:, :3]).shape[1]} components, "
      f"CC1 = {cc1(block(M[:, :3]), b3):.3f}")
print(f"   rows of one block permuted     = {cc1(b1, b2[rng.permutation(150)]):.3f}  "
      "(no exception raised)")
assert abs(cc1(b1, b1) - 1) < 1e-12 and cc1(b1, b2) > cc1(b1, b3)
assert 0.0 <= cc1(b1, b3) <= 1.0

# 4. The confounding trap. One global axis loaded onto every feature — proliferation,
#    purity, batch — and disjoint unrelated sets stop being distinguishable from real ones.
print(f"\n4. a single global axis, n = {N} (diagnose it BEFORE reading any score)")
for label, g in (("no global factor ", 0.0), ("moderate global  ", 1.0)):
    scores, pc1 = [], []
    for _ in range(20):
        F = rng.standard_normal((N, 60))
        F += g * rng.standard_normal((N, 1)) * rng.uniform(0.8, 1.2, size=(1, 60))
        Z = (F - F.mean(0)) / F.std(0, ddof=1)
        ev = np.linalg.svd(Z, compute_uv=False) ** 2
        pc1.append(ev[0] / ev.sum())
        scores.append(cc1(block(F[:, :20]), block(F[:, 30:50])))   # disjoint, unrelated
    print(f"   {label}  CC1 = {np.mean(scores):.3f} "
          f"[{np.min(scores):.3f}, {np.max(scores):.3f}]   "
          f"PC1 of full matrix = {np.mean(pc1) * 100:.1f}% of variance")
    if g == 0.0:
        clean = np.mean(scores)
    else:
        assert np.mean(scores) > 0.8 > clean, "a global axis must inflate unrelated pairs"
```

**Expect**

Invariants — these follow from the math, not from a library version. A failure here means
this page is wrong, and the assertions in the block are what enforce them:

- **CC1 lies in [0, 1]**, and canonical correlation is **symmetric** — `CC1(a,b)` and
  `CC1(b,a)` agree to floating point (2e-16 here), which is why only the upper triangle is
  ever computed.
- **Self-comparison is exactly 1**, to 1e-16. Every median, SD and threshold in a run must
  exclude the diagonal or it is biased upward.
- **Without the PCA step, CC1 measures set width.** Two sets containing nothing but noise
  climb monotonically with width, and past width = n/2 they hit exactly 1 — at that point
  two subspaces spanning more than half the sample dimension have to intersect, so the score
  is dimension counting rather than statistics. Reduced to k = 4 the same pairs sit flat
  across every width. The *shape* is the invariant; the heights are not, because both the
  climb and the flat level are functions of n — at n = 200 the raw curve runs 0.27 → 0.98
  and the reduced one sits near 0.22, but at n = 1100 the same code gives 0.11 → 0.51 and a
  flat level near 0.10. This is the single check to run if you are unsure an implementation
  is doing the method rather than something adjacent to it.
- **A set smaller than k yields fewer than k components, silently** — no warning, no error,
  and its scores are then on a different footing from every other set's. Hence the minimum
  set size of 5.
- **Sample misalignment does not raise.** Permuting the rows of one block leaves the shapes
  valid and returns a plausible-looking number instead of an error. Assert on identifiers
  before subsetting; nothing downstream will catch this for you.
- **The null is a function of n**, not a constant, so a CC1 is uninterpretable without the
  sample count beside it.

Observed 2026-08-19, NumPy 2.4.6 / Python 3.11.15, seed 20260819. These are simulation
estimates, so a mismatch is drift to investigate rather than a failure — but read the two
kinds differently, because they are not equally reproducible.

Averaged over replicates, and stable to about ±0.03 across twelve seeds:

- k = 4 null for unrelated sets: **0.446** at n = 50, **0.217** at n = 200, **0.099** at
  n = 1,100 — reproducing the values quoted earlier on this page.
- The confounding trap, at n = 200: one moderate global axis takes **disjoint, unrelated**
  sets from **0.225** to **0.953**, while the first component of the full matrix goes from
  3.8% to 50.4% of variance. That second number is the diagnostic — it is visible before any
  pair is scored, which is the only reason the trap is avoidable.

Single draws, printed by check 3, where only the **ordering** is reproducible:

- A planted shared factor between two disjoint sets scores **0.947** (0.93–0.96 across
  seeds), against **0.251** for an unrelated pair at the same n and k. Permuting the rows of
  one block collapses that 0.947 to **0.302** — no exception, just a number that looks like
  any other.
- Those last two figures move over roughly **0.13–0.42** from one seed to the next, because
  each is a single realization of the n = 150 null rather than an average of sixty. That
  spread is not noise in the check; it is the thing this page is about. A lone CC1 of 0.30
  means nothing until you know what the null is at your n — which is why the assertions test
  that the planted pair beats the unrelated one, and never that either hits a fixed value.
