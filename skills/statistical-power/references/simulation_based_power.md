# Simulation-Based (Monte Carlo) Power

Closed-form power exists for a handful of standard tests. For everything else,
simulate. This is not a second-best approximation — for complex designs it is the
*correct* method, and it has one big advantage: the power estimate uses the exact
analysis you will run on the real data, so there is no mismatch between the
planning model and the analysis model.

## The recipe (always the same)

1. **Simulate** a dataset of size *n* from your assumed truth: the effect you want
   to detect, plus realistic structure (baseline rates, residual SD, cluster random
   effects, dropout, covariate distributions).
2. **Analyze** it with the *exact* model/test planned for the real study.
3. **Repeat** R times. Power = fraction of replicates where the test is significant.
   Use R ≥ 1,000; use 5,000–10,000 for a stable estimate near the 80% decision point.

Always report the **Monte Carlo confidence interval** on the estimate (a Wilson
interval on the hit count). With R = 1,000 the
±2 SE width near p = 0.8 is roughly ±0.025, so don't over-interpret 0.81 vs 0.79.

## The harness

Write these two functions into the project — `simulate_power()` from SKILL.md plus a
bisection search — and keep them next to the analysis code, so the assumed truth is part of
the record. You supply `gen_and_test(n, rng) -> bool`, which builds one dataset, runs the
analysis, and returns whether it was significant. The `rng` is a seeded
`numpy.random.Generator`, so runs are reproducible and replicates are independent.

```python
import numpy as np
from scipy import stats
from statsmodels.stats.proportion import proportion_confint

def simulate_power(gen_and_test, n, n_sims=2000, alpha=0.05, seed=0):
    """gen_and_test(n, rng) -> True when the planned test is significant."""
    rng = np.random.default_rng(seed)
    hits = sum(bool(gen_and_test(n, rng)) for _ in range(n_sims))
    lo, hi = proportion_confint(hits, n_sims, method="wilson")
    return hits / n_sims, lo, hi

def find_sample_size(gen_and_test, target_power=0.80, lo=10, hi=1000, n_sims=2000, seed=0):
    """Bisect on n. Each step costs n_sims model fits, so bisect rather than sweep."""
    while lo < hi:
        mid = (lo + hi) // 2
        pw, *_ = simulate_power(gen_and_test, mid, n_sims=n_sims, seed=seed)
        if pw >= target_power: hi = mid
        else: lo = mid + 1
    return lo, simulate_power(gen_and_test, lo, n_sims=n_sims, seed=seed)[0]

def gen_and_test(n, rng):
    a = rng.normal(0.0, 1.0, n)
    b = rng.normal(0.5, 1.0, n)          # assumed true effect, d = 0.5
    return stats.ttest_ind(a, b).pvalue < 0.05

print(simulate_power(gen_and_test, n=200, n_sims=2000))
n, est = find_sample_size(gen_and_test, target_power=0.80, n_sims=2000)
print(f"n per group = {n} (simulated power {est:.3f})")
```

Run as written this prints `n per group = 64 (simulated power 0.807)` — the same 64 the
closed-form t-test returns for d = 0.5, which is the point of starting here. **Validate the
harness on a design that has a formula before trusting it on one that doesn't**, then swap
in the data-generating block for your real design: the two-group `gen_and_test` above is the
sanity check, and the table below says what to generate for the cases that need simulation.

Bisection assumes power increases with n, which holds for these designs but not for
sequential or adaptive rules — sweep a grid there instead.

## When you must simulate

| Design / analysis | Why no formula | What to simulate |
|-------------------|----------------|------------------|
| Logistic / Poisson regression | Power depends on the full covariate distribution | Generate predictors, compute the linear predictor, draw the outcome, fit the GLM |
| Mixed-effects / repeated measures | Random effects + within-subject correlation | Draw subject/cluster random effects, then observations; fit `mixedlm` |
| Cluster-randomized trial | ICC inflates variance; clusters are the unit | Cluster random intercepts via ICC; fit a mixed model or use the design effect |
| Survival (Cox / log-rank) | Censoring and event-time distribution | Draw event and censoring times; fit `lifelines` CoxPH or run a log-rank test |
| Interaction terms | Power for an interaction ≪ power for main effects | Generate the factorial structure and the interaction effect; test that coefficient |
| Mediation | Product-of-coefficients null is non-normal | Simulate the path model; bootstrap or test the indirect effect |
| Non-standard / custom test | No theory at all | Whatever your analysis script does |

## Key correctness points

- **Analyze exactly as planned.** If the real analysis adjusts for covariates,
  include them in the simulation. If it uses a robust SE or a specific correction,
  apply it in `gen_and_test`. The whole value of simulation is fidelity to the plan.
- **Handle estimation failures.** GLMs and mixed models can fail to converge or hit
  perfect separation. Wrap the fit in `try/except` and count a failure as
  *not significant* (conservative). If failures are common, that itself is a
  warning about the design or sample size.
- **Watch Type I error too.** As a check, simulate under the *null* (effect = 0)
  and confirm the rejection rate ≈ α. If it's inflated (common with small-cluster
  mixed models or naive cluster SEs), your planned analysis is anticonservative and
  the power number is meaningless until you fix the analysis.
- **Seed it.** A fixed seed makes the search reproducible and stops `find_sample_size`
  from chasing simulation noise around the boundary.

## Modeling realistic complications

- **Dropout.** Either simulate missingness directly (drop rows / occasions under
  the assumed mechanism, then analyze the reduced data — captures the real power
  loss including any bias), or compute the analyzed n and inflate the enrolled n by
  `1/(1−dropout)`.
- **Clustering / ICC.** Split total variance into between-cluster (τ²) and residual
  (σ²) with `ICC = τ²/(τ²+σ²)`, draw a cluster random effect ~ N(0, τ), add it to
  every member of the cluster, and fit the planned mixed model inside `gen_and_test`.
  Bisect on the **number of clusters**, not on the number of individuals: past a modest
  cluster size, adding members to existing clusters buys very little power.
- **Unequal allocation / stratification.** Generate the exact group sizes and strata
  the design will produce; don't assume balance the design won't deliver.
- **Repeated measures.** Subject random intercept (and slope, if relevant) plus a
  within-subject residual; the within-subject correlation is `τ²/(τ²+σ²)`.

## Reporting a simulation-based power analysis

State enough that someone could rerun it:

```
Power was estimated by simulation (5,000 replicates per sample size). Data were
generated assuming a baseline event rate of 20%, a treatment log-odds of 0.8, and
analyzed with logistic regression adjusting for age and site, matching the planned
analysis. A sample of n = 150 per arm yielded 82% power (95% Monte Carlo CI
80.5-83.5%) at α = .05 (two-sided). Code is available at [link].
```
