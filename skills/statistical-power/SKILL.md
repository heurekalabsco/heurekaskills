---
name: statistical-power
description: Sample-size and power calculations for planning a study — a priori power, minimum detectable effect, and power curves. Closed-form for t-tests, ANOVA, proportions, correlation, and regression; Monte Carlo simulation for the rest.
category: utility
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.1.0
tags: [power-analysis, sample-size, effect-size, study-planning]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified: pending
---
# Statistical Power & Sample Size

## Overview

Power analysis answers one of the most consequential questions in study planning: **how large a sample do you need to reliably detect an effect of a given size, and what could you detect with the sample you can afford?** An underpowered study wastes resources and produces inconclusive or irreproducible results; an overpowered one wastes participants, money, and (in clinical work) exposes more people to risk than necessary. Getting this right *before* data collection is the single highest-leverage statistical decision in a project.

Four quantities are locked together for any given test: **sample size (n)**, **effect size**, **significance level (α)**, and **power (1 − β)**. Fix any three and the fourth is determined. Every calculation in this skill is some rearrangement of that relationship.

This skill covers the two ways to do power analysis:
- **Closed-form** formulas (fast, exact for standard tests) — see `references/closed_form_recipes.md`.
- **Simulation / Monte Carlo** (works for *any* design or model you can simulate and analyze) — see `references/simulation_based_power.md`.

For choosing and converting effect sizes — usually the hardest part — see `references/effect_sizes.md`.

## When to Use This Skill

- Determining required sample size before collecting data (a priori power analysis)
- Finding the minimum detectable effect (MDE) for a fixed, already-determined sample size
- Producing power curves (power vs. n, or power vs. effect size) for a grant or protocol
- Justifying a sample size for an IRB submission, grant, or pre-registration
- Powering designs with unequal group sizes or non-1:1 allocation
- Powering anything without a textbook formula (mixed models, logistic/Poisson regression, cluster-randomized trials, survival analysis, mediation, interactions) via simulation
- Accounting for multiple comparisons, attrition/dropout, or clustering in the sample-size estimate

## Installation

Use **uv**. Pin versions in production; unpinned is fine for exploration.

```bash
uv pip install "statsmodels>=0.14.6" "scipy>=1.11" "pingouin>=0.6" "numpy>=1.26" matplotlib pandas
# For simulation-based power of advanced models (optional, add as needed):
uv pip install lifelines            # survival
# mixed models and GLMs come with statsmodels
```

**Compatibility note:** use `statsmodels>=0.14.6` with `scipy>=1.11` to avoid `_lazywhere` import errors on SciPy 1.16+. Pingouin 0.5+ renamed power-function arguments to match the names used below.

---

## The one decision that drives everything: the effect size

Power calculations are only as trustworthy as the effect size you feed them. **Do not invent a number.** Use, in rough order of preference:

1. A **minimally important effect** — the smallest effect that would actually change a decision or matter scientifically/clinically (the "smallest effect size of interest", SESOI). This is the most defensible basis: you power to detect what matters, not what you hope to see.
2. A **pilot or prior-study estimate**, but shrink it — published and pilot effects are inflated by publication bias and the winner's curse. Powering on a raw pilot estimate routinely underpowers the real study.
3. A **convention** (Cohen's small/medium/large) only as a last resort, and say so explicitly.

Whatever you pick, run a **sensitivity analysis**: report how required n changes across a plausible range of effect sizes, not a single point. A power analysis presented as one number hides its biggest source of uncertainty. See `references/effect_sizes.md` for benchmarks and conversions between d, f, r, η², odds ratios, and Cohen's h/w.

> **Avoid post-hoc ("observed") power.** Computing power from the effect size you just estimated is circular: it is a deterministic function of the p-value and tells you nothing new. If a study is already done and you want to know what it could have detected, report a **sensitivity analysis** (MDE at the achieved n) or, better, the confidence interval around the observed effect. This is a common reviewer complaint — do not produce observed power even if asked without flagging the issue.

---

## Quick recipes (closed-form)

statsmodels has a different solver per test. These are the calls you need:

```bash
uv pip install statsmodels scipy numpy matplotlib
```

```python
import numpy as np
from statsmodels.stats.power import TTestIndPower, FTestAnovaPower, NormalIndPower
from statsmodels.stats.proportion import proportion_effectsize

# 1. Per group to detect Cohen's d = 0.5, two-sided, 80% power
TTestIndPower().solve_power(effect_size=0.5, power=0.80, alpha=0.05, ratio=1.0)

# 2. 3:1 allocation — returns n for group 1; group 2 is ratio * n
TTestIndPower().solve_power(effect_size=0.5, power=0.80, alpha=0.05, ratio=3.0)

# 3. Fixed n=30/group — minimum detectable d at 80% power (leave effect_size=None)
TTestIndPower().solve_power(nobs1=30, power=0.80, alpha=0.05, effect_size=None)

# 4. One-way ANOVA, 4 groups, Cohen's f = 0.25 (nobs is TOTAL, not per group)
FTestAnovaPower().solve_power(effect_size=0.25, k_groups=4, power=0.80, alpha=0.05)

# 5. Two proportions 0.40 vs 0.55 — convert to Cohen's h first
h = proportion_effectsize(0.40, 0.55)
NormalIndPower().solve_power(effect_size=abs(h), power=0.80, alpha=0.05)

# 6. Correlation r = 0.30, via Fisher z
from scipy import stats
r, alpha, target = 0.30, 0.05, 0.80
z = 0.5 * np.log((1 + r) / (1 - r))
n = ((stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(target)) / z) ** 2 + 3
```

A power curve for the grant figure:

```python
import numpy as np
import matplotlib
matplotlib.use("Agg")                     # writing to a file, no display needed
import matplotlib.pyplot as plt
from statsmodels.stats.power import TTestIndPower

ns = np.arange(10, 120, 5)
pw = TTestIndPower().power(effect_size=0.5, nobs1=ns, alpha=0.05, ratio=1.0)
plt.plot(ns, pw); plt.axhline(0.8, ls="--", lw=0.8)
plt.xlabel("n per group"); plt.ylabel("power"); plt.savefig("power_curve.png", dpi=200)
```

Watch the two traps: `FTestAnovaPower` takes **total** n while `TTestIndPower` takes
n **per group**, and `solve_power` solves for whichever argument you pass as `None`.
Full argument tables are in `references/closed_form_recipes.md`.

---

## When there is no formula: simulate

Closed-form power exists only for a handful of simple tests. For **logistic/Poisson regression, mixed-effects / repeated-measures models, cluster-randomized trials, survival analysis, mediation, multi-way interactions, or any non-standard analysis**, the right tool is simulation. The logic is always the same three steps:

1. **Simulate** a dataset from your assumed truth (the effect you want to detect, plus realistic noise, baseline rates, cluster structure, etc.).
2. **Analyze** it with the *exact* test/model you plan to use on the real data.
3. **Repeat** many times (≥1,000; 5,000–10,000 for a stable estimate near 80%). Power is the fraction of replicates in which the test is significant.

The whole harness is about fifteen lines. Write it into the project so the assumed
truth is part of the record:

```python
import numpy as np
from statsmodels.stats.proportion import proportion_confint

def simulate_power(gen_and_test, n, n_sims=2000, alpha=0.05, seed=0):
    """gen_and_test(n, rng) -> True when the planned test is significant."""
    rng = np.random.default_rng(seed)
    hits = sum(bool(gen_and_test(n, rng)) for _ in range(n_sims))
    lo, hi = proportion_confint(hits, n_sims, method="wilson")
    return hits / n_sims, lo, hi

def gen_and_test(n, rng):
    from scipy import stats
    a = rng.normal(0.0, 1.0, n)
    b = rng.normal(0.5, 1.0, n)          # assumed true effect, d = 0.5
    return stats.ttest_ind(a, b).pvalue < 0.05

pw, lo, hi = simulate_power(gen_and_test, n=64, n_sims=2000)
print(f"Power at n=64: {pw:.3f} (95% CI {lo:.3f}-{hi:.3f})")
```

To find the n that hits target power, bisect on n rather than sweeping — each
evaluation costs `n_sims` model fits.

Always report the **Monte Carlo confidence interval** so the reader knows whether
0.81 vs. 0.79 is signal or simulation noise. See `references/simulation_based_power.md` for the full patterns, including how to search for the n that hits target power and how to model dropout and clustering.

---

## Adjustments people forget

These routinely make the difference between an adequately powered study and an underpowered one. Apply them explicitly and state that you did.

- **Multiple comparisons.** If the analysis tests *m* hypotheses with a Bonferroni-style correction, power each test at the corrected α (e.g. α/m), which raises n. Better: power on the family-wise or FDR-controlled procedure directly via simulation. Ignoring this silently underpowers every secondary endpoint.
- **Attrition / dropout / unusable samples.** Power gives the n you need *analyzed*. Inflate the *enrolled* n: `n_enroll = ceil(n_analyzed / (1 − dropout_rate))`. A 20% dropout rate means enrolling 25% more than the formula returns.
- **Clustering (design effect).** When observations are nested (patients within clinics, cells within animals, repeated measures within subject), the effective sample size is smaller than the raw count. Inflate by the design effect `DEFF = 1 + (m − 1)·ICC`, where *m* is cluster size and ICC the intraclass correlation. Treating clustered data as independent is **pseudoreplication** and badly overstates power — for cluster-randomized designs, simulate instead.
- **One- vs. two-sided.** Two-sided is the default and almost always the right choice; a one-sided test buys power only by refusing to detect an effect in the unexpected direction. Justify any one-sided test.
- **Unequal allocation.** Equal groups are most efficient for a fixed total n. If allocation is fixed by design (e.g. 2:1 treatment:control), pass `ratio=` so the calculation reflects it.

---

## Workflow

1. **State the design and the planned analysis.** The test you will run determines the power method. If the analysis is a mixed model or GLM, go straight to simulation.
2. **Choose the effect size** on a defensible basis (SESOI > shrunk pilot > convention) and write down the justification.
3. **Set α and target power.** Conventional defaults are α = 0.05 (two-sided) and power = 0.80; 0.90 is common for confirmatory/clinical work. State them.
4. **Compute** — closed-form via statsmodels where a formula exists, Monte Carlo simulation where it doesn't.
5. **Sensitivity analysis.** Recompute across a range of plausible effect sizes and produce a power curve. This is the deliverable, not a single number.
6. **Apply adjustments** for dropout, clustering, and multiplicity.
7. **Report** following the template below.

---

## Reporting template

A defensible power statement contains every input, so a reader could reproduce it. Adapt:

```
A priori power analysis was conducted to determine the sample size needed to detect
a [between-group difference of Cohen's d = 0.50], which we considered the smallest
effect of clinical interest. With α = .05 (two-sided) and power = .80, a two-sample
t-test requires n = 64 per group (128 total; computed with statsmodels 0.14).
Allowing for 20% attrition, we will enrol 160 participants. A sensitivity analysis
showed required n ranges from 45 to 100 per group across plausible effects
d = 0.40–0.60 (Figure X).
```

For simulation: also state the data-generating assumptions (baseline rate, residual SD, ICC, cluster sizes), the number of simulations, and the Monte Carlo CI.

---

## Common pitfalls

1. **Inventing the effect size** or copying an inflated pilot estimate — the most common way power analyses go wrong.
2. **Reporting a single n** instead of a sensitivity range / power curve.
3. **Post-hoc / observed power** — circular and uninformative; use sensitivity analysis or the effect-size CI instead.
4. **Ignoring clustering** (pseudoreplication) — counting cells/measurements as if they were independent subjects.
5. **Forgetting dropout** — powering the analyzed n but enrolling the same number.
6. **Confusing α with power**, or one-sided with two-sided.
7. **Powering only the primary endpoint** while reporting secondary/interaction tests that need far larger n.
8. **Using a t-test formula for a model you won't actually fit** (e.g. planning a logistic regression with a means-based calculation) — match the power method to the planned analysis.

---

## Try it

A self-contained check that this skill still works. No key, no account, no GPU.

**Data** — none to fetch, and that is not a shortcut. A power analysis runs *before* data
exists: its inputs are design parameters (effect size, α, target power), so there is no
dataset to obtain and `datasets:` is deliberately empty. The Monte Carlo cross-check
generates its own samples from a fixed seed, which is what makes the number below
reproducible rather than approximately right.

```python
import numpy as np
from scipy import stats
from statsmodels.stats.power import TTestIndPower, FTestAnovaPower
from statsmodels.stats.proportion import proportion_confint

D, ALPHA, TARGET = 0.5, 0.05, 0.80

# Closed form. TTestIndPower is PER GROUP; FTestAnovaPower is TOTAL across all groups.
n_per_group = TTestIndPower().solve_power(effect_size=D, alpha=ALPHA, power=TARGET, ratio=1.0)
anova_total = FTestAnovaPower().solve_power(effect_size=D / 2, k_groups=2, alpha=ALPHA, power=TARGET)
anova4_total = FTestAnovaPower().solve_power(effect_size=0.25, k_groups=4, alpha=ALPHA, power=TARGET)

# Monte Carlo cross-check at the n the formula returns, rounded up to whole subjects.
n = int(np.ceil(n_per_group))
rng = np.random.default_rng(0)
hits = sum(stats.ttest_ind(rng.normal(0.0, 1.0, n), rng.normal(D, 1.0, n)).pvalue < ALPHA
           for _ in range(2000))
mc, (lo, hi) = hits / 2000, proportion_confint(hits, 2000, method="wilson")
closed_form_power = TTestIndPower().solve_power(effect_size=D, nobs1=n, alpha=ALPHA, ratio=1.0)

print(f"t-test n per group : {n_per_group:.4f} -> enrol {n}")
print(f"ANOVA k=2 TOTAL n  : {anova_total:.4f}  (= 2 x per group)")
print(f"ANOVA k=4 TOTAL n  : {anova4_total:.4f}  -> {anova4_total / 4:.2f} per group")
print(f"power at n={n}      : {closed_form_power:.4f} closed form")
print(f"                     {mc:.3f} simulated (95% MC CI {lo:.3f}-{hi:.3f})")

# The two solvers disagree on units, and this identity is what proves which is which:
# a two-group ANOVA with f = d/2 is the same test as a two-sided t-test.
assert abs(anova_total - 2 * n_per_group) < 1e-6, "FTestAnovaPower is not returning TOTAL n"
assert closed_form_power >= TARGET, "rounding n up must not lose the target power"
assert lo <= closed_form_power <= hi, "simulation and closed form disagree beyond MC error"
print("invariants OK")
```

**Expect**

Invariants — these follow from the mathematics, not from a release, and a failure means the
skill is wrong:

- **`FTestAnovaPower` returns TOTAL n; `TTestIndPower` returns n PER GROUP.** This is the
  trap most likely to halve or double a study, so the check proves it rather than asserting
  it: a two-group ANOVA at f = d/2 *is* a two-sided t-test, so its total must equal exactly
  twice the t-test's per-group n. The assertion holds to 1e-6.
- Rounding the required n **up** cannot drop you below the target power.
- The simulated power at n = 64 contains the closed-form value inside its Monte Carlo CI.
  Closed form and simulation are independent routes to the same quantity; if they disagree
  by more than MC error, one of them is being called wrong.
- n = 64 per group for d = 0.5 at α = .05, 80% power is the textbook value (Cohen 1988) — a
  useful sanity anchor for any power tool.

Observed 2026-08-12 on statsmodels 0.14.6 / scipy 1.17.1 / numpy 2.4.6, Python 3.11 — a
mismatch here is drift to investigate, not a failure:

```
t-test n per group : 63.7656 -> enrol 64
ANOVA k=2 TOTAL n  : 127.5312  (= 2 x per group)
ANOVA k=4 TOTAL n  : 178.3971  -> 44.60 per group
power at n=64      : 0.8015 closed form
                     0.807 simulated (95% MC CI 0.790-0.824)
invariants OK
```

The simulated 0.807 is reproducible only because the seed is fixed; re-seeding moves it
within roughly ±0.018 at 2,000 replicates.

---

## Resources

### References
- `references/closed_form_recipes.md` — per-test argument tables and exact statsmodels/pingouin calls, including proportions, chi-square, and regression.
- `references/simulation_based_power.md` — full simulation patterns for GLMs, mixed models, cluster designs, survival, and dropout.
- `references/effect_sizes.md` — choosing effect sizes (SESOI), Cohen's benchmarks, and conversions between d, f, r, η²/f², OR, h, and w.

### Related skills
- **experimental-design** — once you know n, lay out the actual study (randomization, blocking, factorial/DOE, crossover, sequential designs).

Assumption checks, running the test, effect sizes and reporting come after data
collection and are outside this skill; the models referenced here are fitted with
statsmodels or PyMC.

### Key references
- Cohen, J. (1988). *Statistical Power Analysis for the Behavioral Sciences* (2nd ed.).
- Lakens, D. (2022). *Sample Size Justification*. Collabra: Psychology, 8(1).
- Arnold, B. F. et al. (2011). Simulation methods to estimate design power. *BMC Medical Research Methodology*, 11:94.
