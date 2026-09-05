---
name: survival-analysis
description: Time-to-event analysis with lifelines — Kaplan-Meier curves, log-rank comparisons and Cox regression on right-censored data. Tests the proportional-hazards assumption rather than assuming it, and covers stratification and RMST for when it fails.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [survival-analysis, kaplan-meier, cox-regression, censoring, time-to-event]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-09-04
  against: lifelines 0.30.3 / Python 3.11.15 / pandas 2.3.3 / numpy 2.4.6 / scipy 1.17.1
  executed: 12
  unverified: 0
---
# Survival Analysis

Time-to-event data asks *how long until something happens*, and it is defined by the
observations where the thing **has not happened yet**. A trial ends, a patient moves away,
a study closes its database — you know that person survived at least 1,200 days, and
nothing more. That is **right-censoring**, and it is information, not missing data.

This is the whole reason survival analysis exists as a separate field. Delete the censored
rows and you keep only the people who had the event, which is a sample of the unlucky.
Treat censored times as events and you record event-free patients as having had one. Both mistakes push the
answer the same direction — too pessimistic — and neither announces itself.

This skill covers the three things almost every time-to-event analysis needs — an estimate
of the survival curve, a comparison between groups, and a regression model for covariates —
plus the assumption check that decides whether the regression means anything.

## Installation

No account, no API key, no GPU. Pure Python.

```bash
pip install lifelines
```

It pulls in numpy, scipy, pandas, matplotlib, autograd, autograd-gamma and formulaic. Everything below runs on CPU in
seconds.

The example data ships **inside the package** — 27 datasets, including several real clinical
trials. Nothing here downloads anything, which is also why every block on this page can be
re-run to check the skill still holds.

## The data shape

Two columns carry the outcome, and every function on this page takes them separately:

- **duration** — time from a defined origin to either the event or the last contact
- **event** — 1 if the event was observed, 0 if the observation was censored

The origin has to be the same clinical moment for everyone (randomisation, diagnosis,
surgery) or the curve means nothing. In practice you rarely receive these two columns; you
receive dates and have to build them.

```python
import pandas as pd

records = pd.DataFrame({
    "patient":    ["A", "B", "C", "D"],
    "enrolled":   ["2024-01-15", "2024-02-01", "2024-02-20", "2024-03-05"],
    "last_seen":  ["2025-06-30", "2024-11-12", "2026-01-31", "2024-08-19"],
    "died":       [0, 1, 0, 1],
})
for c in ("enrolled", "last_seen"):
    records[c] = pd.to_datetime(records[c])

records["duration"] = (records["last_seen"] - records["enrolled"]).dt.days
records["event"] = records["died"]

print(records[["patient", "duration", "event"]].to_string(index=False))
assert (records["duration"] > 0).all(), "a non-positive duration means the dates are wrong"
```

Two rules worth enforcing in code, because both are silent failures:

- **Durations must be positive.** A zero or negative duration is a data-entry error or a
  wrong origin, and most estimators will happily consume it.
- **Administrative censoring is still censoring.** Someone event-free at the study close is
  censored at the close date, not an event, and not a dropped row.

## What censoring does to a naive average

Worth seeing once, with numbers. The GBSG2 trial below has 686 breast-cancer patients, of
whom 387 (56%) were still event-free when the study ended. GBSG2's endpoint is
**recurrence-free survival**, so an event is a recurrence *or* a death, not a death alone —
`time` is "recurrence free survival time (in days)" and `cens` is the event indicator.

```python
import pandas as pd
from lifelines import KaplanMeierFitter
from lifelines.datasets import load_gbsg2

df = load_gbsg2()
km = KaplanMeierFitter().fit(df["time"], df["cens"])

print("censored          :", int((df["cens"] == 0).sum()), "of", len(df))
print("Kaplan-Meier median:", km.median_survival_time_)
print("naive, all rows    :", df["time"].median())
print("naive, events only :", df.loc[df["cens"] == 1, "time"].median())
```

```
censored          : 387 of 686
Kaplan-Meier median: 1807.0
naive, all rows    : 1084.0
naive, events only : 646.0
```

The correct median is **1,807 days**. Treating censored times as events gives 1,084 days.
Keeping only the patients who had an event gives 646 days — an answer wrong by a factor of nearly
three, produced by a one-line `groupby` that raises no error and looks entirely reasonable
in a table.

## Kaplan-Meier estimation

The Kaplan-Meier estimator is the survival curve with censoring handled correctly — at each
event time it conditions on everyone still at risk, and censored patients leave the risk set
without ever being counted as events.

```python
from lifelines import KaplanMeierFitter
from lifelines.datasets import load_gbsg2
from lifelines.utils import median_survival_times

df = load_gbsg2()
kmf = KaplanMeierFitter().fit(df["time"], event_observed=df["cens"], label="GBSG2")

print("median survival :", kmf.median_survival_time_)
print("95% CI on median:", median_survival_times(kmf.confidence_interval_).values.ravel())
print("S(1000 days)    : %.4f" % kmf.predict(1000))
print("S(2000 days)    : %.4f" % kmf.predict(2000))
print("at risk at t=0  :", int(kmf.event_table["at_risk"].iloc[0]))
```

```
median survival : 1807.0
95% CI on median: [1528. 2018.]
S(1000 days)    : 0.6578
S(2000 days)    : 0.4624
at risk at t=0  : 686
```

`predict` reads the curve at a time; `survival_function_` and
`confidence_interval_survival_function_` give the whole thing for plotting. `event_table` is
the underlying at-risk / events / censored bookkeeping, and is the first place to look when a
curve seems wrong — a risk set that collapses early means the tail is being estimated from a
handful of patients, and the curve there should not be read as a result.

## Comparing groups — the log-rank test

To compare arms, fit one curve per arm and test them with the log-rank statistic. Do not
compare mean survival times with a t-test — that discards the censoring and answers a
different question.

```python
from lifelines import KaplanMeierFitter
from lifelines.datasets import load_gbsg2
from lifelines.statistics import logrank_test

df = load_gbsg2()
for arm in ["no", "yes"]:
    m = df["horTh"] == arm
    f = KaplanMeierFitter().fit(df.loc[m, "time"], df.loc[m, "cens"])
    print(f"horTh={arm:<3} n={int(m.sum()):3d} events={int(df.loc[m,'cens'].sum()):3d} "
          f"median={f.median_survival_time_:.0f}")

a, b = df["horTh"] == "no", df["horTh"] == "yes"
res = logrank_test(df.loc[a, "time"], df.loc[b, "time"], df.loc[a, "cens"], df.loc[b, "cens"])
print("log-rank chi2 = %.4f, p = %.6f" % (res.test_statistic, res.p_value))
```

```
horTh=no  n=440 events=205 median=1528
horTh=yes n=246 events= 94 median=2018
log-rank chi2 = 8.5648, p = 0.003427
```

The log-rank test asks whether the two curves differ *anywhere*, weighting all event times
equally. It is at its most powerful when hazards are proportional, and it loses power when
curves cross — if you expect crossing (a treatment that harms early and helps late), the
log-rank test is the wrong instrument and will report a reassuring non-significant p-value
for two very different curves.

## The median is not always defined

If the curve never falls to 0.5, there is no median survival time. lifelines returns `inf`
rather than raising, so this propagates quietly into a results table.

```python
from lifelines import KaplanMeierFitter
from lifelines.datasets import load_gbsg2

df = load_gbsg2()
low = df[(df["pnodes"] <= 3) & (df["progrec"] > 100)]
fit = KaplanMeierFitter().fit(low["time"], low["cens"])

print("n =", len(low), "events =", int(low["cens"].sum()))
print("median      :", fit.median_survival_time_)
print("lowest S    : %.4f" % fit.survival_function_.iloc[-1].iloc[0])
print("S(1500 days): %.4f" % fit.predict(1500))
```

```
n = 126 events = 27
median      : inf
lowest S    : 0.6803
S(1500 days): 0.7807
```

This subgroup does well enough that only a third of it has an event by the end of follow-up.
`inf` is the honest answer — the data do not contain the median. Report survival at a fixed
horizon instead (`S(1500) = 0.78`), and never fill the cell with the largest observed time.

## Cox proportional hazards

The Cox model relates covariates to the hazard without assuming a shape for the baseline
hazard. Coefficients are log hazard ratios; `exp(coef)` is the hazard ratio.

`CoxPHFitter` takes a numeric frame, so categorical columns must be encoded first.

```python
import pandas as pd
from lifelines import CoxPHFitter
from lifelines.datasets import load_gbsg2

df = load_gbsg2()
d = pd.get_dummies(df, columns=["horTh", "menostat", "tgrade"], drop_first=True, dtype=float)

cph = CoxPHFitter().fit(d, duration_col="time", event_col="cens")
print(cph.summary[["exp(coef)", "exp(coef) lower 95%", "exp(coef) upper 95%", "p"]].round(4).to_string())
print("concordance:", round(cph.concordance_index_, 4))
```

```
              exp(coef)  exp(coef) lower 95%  exp(coef) upper 95%       p
covariate
age              0.9906               0.9727               1.0088  0.3091
tsize            1.0078               1.0001               1.0156  0.0478
pnodes           1.0500               1.0348               1.0654  0.0000
progrec          0.9978               0.9967               0.9989  0.0001
estrec           1.0002               0.9993               1.0011  0.6613
horTh_yes        0.7073               0.5492               0.9109  0.0073
menostat_Pre     0.7723               0.5390               1.1065  0.1590
tgrade_II        1.8891               1.1591               3.0788  0.0107
tgrade_III       2.1807               1.2885               3.6909  0.0037
concordance: 0.6919
```

Reading it: hormone therapy multiplies the hazard by **0.71** (a 29% reduction); each
additional positive node multiplies it by 1.05, so ten nodes is roughly a 63% increase
(1.05^10). Concordance 0.69 means the model ranks pairs of patients correctly 69% of the
time — respectable for clinical covariates, and far from individually predictive.

Two things a hazard ratio is not. It is not a risk ratio, and it is not a statement about
how much longer anyone lives; it is a ratio of instantaneous event rates, averaged over
follow-up. That averaging is exactly what the next section tests.

## Test the proportional-hazards assumption

The model's name is its assumption — each covariate's effect is a constant multiplier on the
hazard **at every time**. A treatment that works well for a year and then stops working
violates it, and the fitted hazard ratio silently becomes an average over a period in which
the effect was changing.

This check takes one line, and skipping it is the most common serious error in applied
survival analysis.

```python
import pandas as pd
from lifelines import CoxPHFitter
from lifelines.datasets import load_gbsg2
from lifelines.statistics import proportional_hazard_test

df = load_gbsg2()
d = pd.get_dummies(df, columns=["horTh", "menostat", "tgrade"], drop_first=True, dtype=float)
cph = CoxPHFitter().fit(d, duration_col="time", event_col="cens")

ph = proportional_hazard_test(cph, d, time_transform="rank")
print(ph.summary[["test_statistic", "p"]].round(4).to_string())
print("violating at 0.05:", list(ph.summary.index[ph.summary["p"] < 0.05]))
```

```
              test_statistic       p
age                   2.7889  0.0949
estrec                1.4248  0.2326
horTh_yes             0.2088  0.6477
menostat_Pre          0.0051  0.9432
pnodes                0.5734  0.4489
progrec               1.0797  0.2988
tgrade_II             1.8325  0.1758
tgrade_III            5.8638  0.0155
tsize                 0.1808  0.6707
violating at 0.05: ['tgrade_III']
```

The model above looked healthy — sensible hazard ratios, a significant treatment effect,
concordance 0.69 — and **grade III tumours violate proportional hazards**. Their reported
hazard ratio of 2.18 is an average across follow-up of an effect that is not constant, so
quoting it as *the* effect of grade III is wrong in a way no goodness-of-fit summary reveals.

The treatment covariate, `horTh_yes`, passes comfortably (p = 0.65). That distinction is the
useful outcome here — the trial's primary comparison is safe; one prognostic covariate is not.

`cph.check_assumptions(d)` prints the same test with prose advice and residual plots.

## When proportional hazards fails

Two honest responses, and neither is to ignore the test.

**Stratify** the offending covariate. Each stratum gets its own baseline hazard, so the
variable is adjusted for without a proportionality claim — at the cost of no longer
estimating its effect.

```python
import pandas as pd
from lifelines import CoxPHFitter
from lifelines.datasets import load_gbsg2
from lifelines.statistics import proportional_hazard_test

df = load_gbsg2()
d = pd.get_dummies(df, columns=["horTh", "menostat", "tgrade"], drop_first=True, dtype=float)

cph = CoxPHFitter().fit(d, duration_col="time", event_col="cens", strata=["tgrade_III"])
print(cph.summary.loc[["horTh_yes", "pnodes"], ["exp(coef)", "p"]].round(4).to_string())
print("concordance:", round(cph.concordance_index_, 4))

ph = proportional_hazard_test(cph, d, time_transform="rank")
print("still violating:", list(ph.summary.index[ph.summary["p"] < 0.05]))
```

```
           exp(coef)       p
covariate
horTh_yes     0.6990  0.0056
pnodes        1.0492  0.0000
concordance: 0.6886
still violating: ['age', 'pnodes']
```

The treatment estimate barely moves (0.707 to 0.699), which is the reassuring outcome — the
violation was not distorting the primary result.

Stratifying does not clear the page, and the output above is honest about that — `age` and
`pnodes` now cross 0.05 (p = 0.042 and p = 0.018) where they did not before. Removing a
covariate from the model changes the residuals of the ones that remain, so a re-test after
stratifying is a new set of tests, not a confirmation of the old one. With eight covariates
left after `tgrade_III` becomes the strata, tested at α = 0.05, some of this is multiplicity. Treat a borderline flag as a prompt to plot the
scaled Schoenfeld residuals and look at the shape, not as a verdict — the question is whether
the effect drifts enough over follow-up to change what you would report.

**Report restricted mean survival time.** RMST is the area under the survival curve out to a
horizon you choose — average event-free time over that window. It assumes nothing about
proportionality and is in days, which is a unit clinicians can act on.

```python
from lifelines import KaplanMeierFitter
from lifelines.datasets import load_gbsg2
from lifelines.utils import restricted_mean_survival_time

df = load_gbsg2()
rmst = {}
for arm in ["no", "yes"]:
    m = df["horTh"] == arm
    f = KaplanMeierFitter().fit(df.loc[m, "time"], df.loc[m, "cens"])
    rmst[arm] = restricted_mean_survival_time(f, t=2000)
    print(f"horTh={arm:<3} RMST(2000 days) = {rmst[arm]:.1f} days")
print("difference: %.1f days" % (rmst["yes"] - rmst["no"]))
```

```
horTh=no  RMST(2000 days) = 1340.4 days
horTh=yes RMST(2000 days) = 1513.2 days
difference: 172.8 days
```

"173 more event-free days over five and a half years" is a claim a reader can weigh against
the toxicity of the therapy. "Hazard ratio 0.71" is not, and it is the number that stops
being interpretable when the assumption fails.

Choose the horizon **before** looking at the curves, and choose it inside the follow-up of
both arms — RMST at a horizon beyond where one arm still has patients at risk is an artefact
of where the data ran out.

## Errors you will actually hit

```python
import warnings
import pandas as pd
from lifelines import CoxPHFitter
from lifelines.datasets import load_gbsg2

df = load_gbsg2()

# 1. A string column reaches the design matrix — encode categoricals first.
try:
    CoxPHFitter().fit(df, duration_col="time", event_col="cens")
except ValueError as e:
    print("ValueError:", e)

# 2. Collinear covariates: a warning, not an error, and the coefficients are unusable.
d = pd.get_dummies(df, columns=["horTh", "menostat", "tgrade"], drop_first=True, dtype=float)
d["pnodes_duplicate"] = d["pnodes"]
with warnings.catch_warnings():
    warnings.simplefilter("error")
    try:
        CoxPHFitter().fit(d, duration_col="time", event_col="cens")
    except Exception as e:
        print(type(e).__name__ + ":", str(e)[:110])
```

```
ValueError: could not convert string to float: 'no'
LinAlgWarning: An ill-conditioned matrix detected: slice 0 has rcond = 1.9234907034010305e-17.
```

The second one matters more than it looks. By default it is a **warning**, so a script that
does not promote warnings fits the model, prints a summary, and hands back coefficients split
arbitrarily between two identical columns. Redundant dummy columns (forgetting
`drop_first=True`) are the usual cause. Promote it with
`warnings.simplefilter("error", category=scipy.linalg.LinAlgWarning)` in any pipeline that
fits models unattended.

## Common pitfalls

- **Dropping censored rows.** The single most damaging error, and it produces a plausible
  number rather than a crash. See the three-fold discrepancy above.
- **Immortal time bias.** Classifying patients by something that happens *after* the origin
  (received a transplant, responded to therapy) guarantees the group survived long enough to
  qualify. Use a time-varying covariate, not a baseline group.
- **Reading the tail of a curve.** The right-hand end is estimated from whoever is left,
  sometimes a handful of patients. Plot the at-risk counts underneath, and stop the curve
  where the risk set becomes too small to support it.
- **Fitting Cox and never testing PH.** The section above exists because this is the norm.
- **Treating a hazard ratio as a risk ratio**, or as a ratio of survival times. It is neither.
- **Choosing the RMST horizon after seeing the curves.** That is selecting the horizon where
  the difference looks largest.
- Planning sample size for a survival endpoint is a separate problem — the `statistical-power`
  skill in this registry covers simulation-based power for time-to-event designs.

## Try it

A self-contained check that this skill still works. The data ships inside the package, so
this needs no network, no account and no key — `pip install lifelines` is the only setup.

**Data** — the GBSG2 cohort, `lifelines.datasets.load_gbsg2()`. 686 node-positive breast
cancer patients from the German Breast Cancer Study Group 2 trial, 299 events and 387
censored (the endpoint is recurrence-free survival, so an event is recurrence or death), distributed inside the lifelines wheel under the package's MIT licence. Because it
is bundled rather than fetched, this block cannot rot from a URL going dead — it is pinned to
the installed version, and `datasets: []` in the frontmatter records that there is nothing to
probe. The example routes through the trap the page is built around — a model that looks
healthy while one covariate violates proportional hazards.

```python
import numpy as np, pandas as pd
from lifelines import KaplanMeierFitter, CoxPHFitter
from lifelines.datasets import load_gbsg2
from lifelines.statistics import logrank_test, proportional_hazard_test
from lifelines.utils import restricted_mean_survival_time

df = load_gbsg2()                      # ships inside the wheel — no download
n, events = len(df), int(df["cens"].sum())
print(f"cohort         : {n} patients, {events} events, {n - events} censored")

# --- censoring is not missingness: the naive summaries below are both wrong ---
km = KaplanMeierFitter().fit(df["time"], df["cens"])
naive_all = df["time"].median()
naive_evt = df.loc[df["cens"] == 1, "time"].median()
print(f"KM median      : {km.median_survival_time_:.0f} days")
print(f"naive (all)    : {naive_all:.0f} days   <- censored times treated as events")
print(f"naive (events) : {naive_evt:.0f} days   <- event-free patients dropped")

# --- two arms of the trial ---
arms = {}
for arm in ["no", "yes"]:
    m = df["horTh"] == arm
    arms[arm] = KaplanMeierFitter().fit(df.loc[m, "time"], df.loc[m, "cens"], label=arm)
    print(f"horTh={arm:<3}      : n={int(m.sum()):3d}  events={int(df.loc[m,'cens'].sum()):3d}  "
          f"median={arms[arm].median_survival_time_:.0f} d")

lr = logrank_test(df.loc[df.horTh == "no", "time"], df.loc[df.horTh == "yes", "time"],
                  df.loc[df.horTh == "no", "cens"], df.loc[df.horTh == "yes", "cens"])
print(f"log-rank       : chi2={lr.test_statistic:.4f}  p={lr.p_value:.6f}")

# --- a median that does not exist ---
low = df[(df.pnodes <= 3) & (df.progrec > 100)]
lowfit = KaplanMeierFitter().fit(low["time"], low["cens"])
print(f"low-risk median: {lowfit.median_survival_time_}  "
      f"(curve stops at S={float(lowfit.survival_function_.iloc[-1].iloc[0]):.4f})")

# --- Cox, then the assumption nobody checks ---
d = pd.get_dummies(df, columns=["horTh", "menostat", "tgrade"], drop_first=True, dtype=float)
cph = CoxPHFitter().fit(d, duration_col="time", event_col="cens")
hr = cph.summary.loc["horTh_yes", "exp(coef)"]
print(f"Cox HR horTh   : {hr:.4f}  (p={cph.summary.loc['horTh_yes','p']:.4f})")
print(f"concordance    : {cph.concordance_index_:.4f}")

ph = proportional_hazard_test(cph, d, time_transform="rank").summary["p"]
bad = ph[ph < 0.05]
print(f"PH violations  : {list(bad.index)}  p={[round(float(v), 4) for v in bad.values]}")

# --- what to report when PH fails: RMST needs no proportionality ---
rmst = {a: restricted_mean_survival_time(arms[a], t=2000) for a in ("no", "yes")}
print(f"RMST @2000d    : no={rmst['no']:.1f} d  yes={rmst['yes']:.1f} d  "
      f"diff={rmst['yes'] - rmst['no']:.1f} d")

# ---- invariants: a failure here means this skill is wrong ----
assert (n, events) == (686, 299)
assert km.median_survival_time_ > naive_all > naive_evt      # censoring biases naive down
sf = km.survival_function_.values.ravel()
assert np.all(np.diff(sf) <= 0) and sf[0] <= 1.0             # KM is non-increasing
assert lowfit.median_survival_time_ == np.inf                # undefined median is inf
assert hr < 1.0 and cph.summary.loc["horTh_yes", "p"] < 0.05 # therapy lowers hazard
assert "tgrade_III" in bad.index                             # the violation is real
assert rmst["yes"] > rmst["no"]
print("invariants     : OK")
```

**Expect**

Invariants — asserted in the block. These follow from the estimators and the bundled data,
and a failure means the skill is wrong, not that upstream moved:

- The cohort is 686 patients with 299 events and 387 censored. The dataset is frozen in the
  package, so this is fixed for a given install.
- `KM median > naive(all rows) > naive(events only)`. The direction is the point — both naive
  summaries understate survival, and the events-only one is the worse of the two.
- The Kaplan-Meier survival function is non-increasing and starts at or below 1.
- A curve that never reaches 0.5 gives `median_survival_time_ == inf`, not `NaN` and not an
  exception.
- Hormone therapy lowers the hazard — `exp(coef) < 1` at p < 0.05 — and `tgrade_III` appears
  in the proportional-hazards violations. This is the trap the page is about, asserted so a
  future edit cannot quietly drop it.
- RMST is higher in the treated arm, agreeing in direction with both the log-rank test and
  the Cox model.

Observed 2026-09-04 against **lifelines 0.30.3 / Python 3.11.15 / pandas 2.3.3 / numpy 2.4.6
/ scipy 1.17.1**. lifelines pins its bundled data, so these should be stable across patch
releases; a mismatch is drift to investigate, not an automatic failure:

```
cohort         : 686 patients, 299 events, 387 censored
KM median      : 1807 days
naive (all)    : 1084 days   <- censored times treated as events
naive (events) : 646 days   <- event-free patients dropped
horTh=no       : n=440  events=205  median=1528 d
horTh=yes      : n=246  events= 94  median=2018 d
log-rank       : chi2=8.5648  p=0.003427
low-risk median: inf  (curve stops at S=0.6803)
Cox HR horTh   : 0.7073  (p=0.0073)
concordance    : 0.6919
PH violations  : ['tgrade_III']  p=[0.0155]
RMST @2000d    : no=1340.4 d  yes=1513.2 d  diff=172.8 d
invariants     : OK
```

## Sources

- lifelines — https://github.com/CamDavidsonPilon/lifelines (MIT)
- Documentation — https://lifelines.readthedocs.io/
- Package index — https://pypi.org/project/lifelines/

The GBSG2 data is distributed with lifelines, which cites it to M. Schumacher et al. for the
German Breast Cancer Study Group (1994), *Journal of Clinical Oncology* 12, 2086-2093, and
W. Sauerbrei and P. Royston (1999), *Journal of the Royal Statistical Society Series A*
162(1), 71-94. Cite the trial, not this page, when you report an analysis of it.
