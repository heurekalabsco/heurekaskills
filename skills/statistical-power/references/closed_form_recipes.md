# Closed-Form Power Recipes

Exact argument tables and the underlying statsmodels/scipy calls for every standard
test. Use this when you need the precise argument names, or a case the recipes in
SKILL.md don't cover.

The four solver quantities — `effect_size`, sample size, `alpha`, `power` — obey
one identity: pass three, set the fourth to `None`, and `solve_power` returns it.

## Table of contents
- [Two independent means (t-test)](#two-independent-means)
- [Paired / one-sample mean](#paired--one-sample-mean)
- [One-way ANOVA](#one-way-anova)
- [Two proportions](#two-proportions)
- [One proportion](#one-proportion)
- [Correlation](#correlation)
- [Chi-square (goodness-of-fit / contingency)](#chi-square)
- [Multiple regression (R² increment)](#multiple-regression)
- [Effect-size argument cheat sheet](#effect-size-units-per-test)

---

## Two independent means

Effect size = **Cohen's d** = (μ₁ − μ₂) / σ_pooled.

```python
from statsmodels.stats.power import TTestIndPower
analysis = TTestIndPower()

# n per group for d=0.5, 80% power, two-sided
n1 = analysis.solve_power(effect_size=0.5, alpha=0.05, power=0.80,
                          ratio=1.0, alternative="two-sided")

# achieved power at n1=64 per group
pw = analysis.solve_power(effect_size=0.5, nobs1=64, alpha=0.05,
                          ratio=1.0, alternative="two-sided")

# minimum detectable d at n1=30 per group, 80% power
d_min = analysis.solve_power(nobs1=30, alpha=0.05, power=0.80, ratio=1.0,
                             alternative="two-sided")
```

`ratio = nobs2 / nobs1`. For 2:1 allocation set `ratio=2.0`; the returned `nobs1`
is the smaller group. `alternative` ∈ `"two-sided"`, `"larger"`, `"smaller"`.

## Paired / one-sample mean

Effect size = **Cohen's dz** for paired (mean difference / SD of the differences),
or d for one-sample. Use `TTestPower` (single-sample solver); `nobs` is the number
of pairs / observations.

```python
from statsmodels.stats.power import TTestPower
TTestPower().solve_power(effect_size=0.4, alpha=0.05, power=0.80,
                         alternative="two-sided")  # -> number of pairs
```

Note: for paired designs dz depends on the within-pair correlation ρ:
`dz = d_raw / sqrt(2(1−ρ))`. Higher ρ ⇒ larger dz ⇒ smaller n. If you only know
the raw mean difference and SDs, estimate ρ or simulate.

## One-way ANOVA

Effect size = **Cohen's f** = sqrt(η² / (1 − η²)). `nobs` here is **total** n
across all groups; divide by `k_groups` for per-group n.

```python
from statsmodels.stats.power import FTestAnovaPower
total_n = FTestAnovaPower().solve_power(effect_size=0.25, k_groups=4,
                                        alpha=0.05, power=0.80)
per_group = total_n / 4
```

Conversions: f = 0.10 (small), 0.25 (medium), 0.40 (large). From η²:
`f = sqrt(eta2/(1-eta2))`. From R²: same formula with R².

## Two proportions

Effect size = **Cohen's h** = 2·asin(√p₁) − 2·asin(√p₂). Convert proportions to h,
then use the normal approximation `NormalIndPower`.

```python
from statsmodels.stats.power import NormalIndPower
from statsmodels.stats.proportion import proportion_effectsize
h = proportion_effectsize(0.40, 0.55)
n1 = NormalIndPower().solve_power(effect_size=h, alpha=0.05, power=0.80,
                                  ratio=1.0, alternative="two-sided")
```

Alternative: work in raw proportions instead of the arcsine scale. This gives per-group n
directly, handles unequal n via `ratio`, and takes `alternative=` rather than any manual
doubling of α.

```python
from statsmodels.stats.proportion import samplesize_proportions_2indep_onetail
n1 = samplesize_proportions_2indep_onetail(diff=0.15, prop2=0.40, power=0.80,
                                           ratio=1, alpha=0.05, alternative="two-sided")
print(n1)   # 172.80 per group — the h route above gives 172.66 for the same design
```

`prop2` is the reference proportion and `p1 = prop2 + diff`, so this is the 0.40-vs-0.55
design from the block above. The two routes agree to a fraction of a subject here; they
diverge for rare events, where neither normal approximation is trustworthy.

For small samples or rare events, prefer **simulation** with the exact test you'll
run (Fisher's exact, or a chi-square with continuity correction).

## One proportion

Test p against a fixed reference p₀. Convert both to the arcsine scale via Cohen's h
and treat the reference group as infinite (`ratio=0`).

```python
from statsmodels.stats.power import NormalIndPower
from statsmodels.stats.proportion import proportion_effectsize
h = proportion_effectsize(0.60, 0.50)
n = NormalIndPower().solve_power(effect_size=h, alpha=0.05, power=0.80, ratio=0.0)
```

For exact binomial planning use `statsmodels.stats.proportion.proportion_effectsize`
with the exact-test power via simulation if the sample is small.

## Correlation

Effect size = **Pearson r**. statsmodels has no solver for this one; use the Fisher z
transform. Required n for r at power 1−β, two-sided:

```
z_r = arctanh(r)
n   = ((z_{1-α/2} + z_{1-β}) / z_r)^2 + 3
```

```python
import numpy as np
from scipy import stats

def n_correlation(r, alpha=0.05, power=0.80):
    z_r = np.arctanh(r)
    return ((stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(power)) / z_r) ** 2 + 3

print(n_correlation(0.30))   # 84.93 -> enrol 85
```

`pingouin.power_corr(r=0.3, power=0.8, alternative="two-sided")` is the library call for
the same quantity. It returns 84.07 against the formula's 84.93 — pingouin (a port of R's `pwr.r.test`) takes
its critical value from the *t* distribution on n − 2 df and adds the far tail, where the
formula above uses the normal — so both round up to **n = 85**. Prefer whichever you
will state in the protocol, and do not present the difference as a disagreement.

## Chi-square

Effect size = **Cohen's w** = sqrt(Σ (p_i − p0_i)² / p0_i). For a contingency table,
`w = sqrt(χ²/N)` and equals Cramér's V·sqrt(min(r−1, c−1)). Degrees of freedom:
goodness-of-fit `dof = k − 1`; contingency `dof = (r−1)(c−1)`. `n_bins = dof + 1`.

```python
from statsmodels.stats.power import GofChisquarePower
n = GofChisquarePower().solve_power(effect_size=0.3, n_bins=5, alpha=0.05, power=0.80)
```

w benchmarks: 0.10 (small), 0.30 (medium), 0.50 (large).

## Multiple regression

Effect size = **Cohen's f²** = R²/(1−R²) for the overall model, or
ΔR²/(1−R²_full) for a set of added predictors. Solve it directly on the noncentral F
(noncentrality λ = f²·n) and search over whole n — searching integers is more reliable here
than asking a continuous solver for a fractional sample size:

```python
import numpy as np
from scipy import stats

def n_regression(f2, df_num, k_total, alpha=0.05, power=0.80, n_max=100_000):
    """Smallest n giving `power` to detect Cohen's f2 from `df_num` tested predictors."""
    for n in range(k_total + 2, n_max):
        df_den = n - k_total - 1
        crit = stats.f.ppf(1 - alpha, df_num, df_den)
        if 1 - stats.ncf.cdf(crit, df_num, df_den, f2 * n) >= power:
            return n
    raise ValueError("no n below n_max reaches the target power")

# detect f^2 = 0.15 from 3 tested predictors (3 total in the model)
print(n_regression(0.15, df_num=3, k_total=3))   # 77
```

- `df_num` = number of predictors being **tested** (the numerator df).
- `k_total` = total predictors in the model (including controls). `df_denom = n − k_total − 1`.

f² benchmarks: 0.02 (small), 0.15 (medium), 0.35 (large).

## Effect-size units per test

| Test | Solver | Effect size | Small / Medium / Large |
|------|--------|-------------|------------------------|
| Two independent means | `TTestIndPower` (n per group) | Cohen's d | 0.2 / 0.5 / 0.8 |
| Paired / one-sample | `TTestPower` (n pairs) | Cohen's d (dz) | 0.2 / 0.5 / 0.8 |
| One-way ANOVA | `FTestAnovaPower` (**total** n) | Cohen's f | 0.1 / 0.25 / 0.4 |
| Two proportions | `NormalIndPower` via `proportion_effectsize`, or `samplesize_proportions_2indep_onetail` | Cohen's h (or raw props) | 0.2 / 0.5 / 0.8 |
| One proportion | `NormalIndPower` with `ratio=0` | Cohen's h | 0.2 / 0.5 / 0.8 |
| Correlation | Fisher z formula, or `pingouin.power_corr` | Pearson r | 0.1 / 0.3 / 0.5 |
| Chi-square | `GofChisquarePower` | Cohen's w | 0.1 / 0.3 / 0.5 |
| Regression (ΔR²) | `n_regression` above (noncentral F) | Cohen's f² | 0.02 / 0.15 / 0.35 |

Benchmarks are last-resort conventions — prefer a smallest-effect-of-interest.
See `effect_sizes.md`.
