---
name: protein-engineering-campaign
description: Plan a protein-engineering campaign — how many designs to order for n validated hits, which assay runs first, and when to stop. Binomial sizing, a cost-optimal assay cascade and a futility rule, with per-stage attrition measured not assumed.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-design, study-design, sample-size, statistics]
datasets: [https://raw.githubusercontent.com/adaptyvbio/egfr_competition_2/main/results/result_summary.csv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-05
  against: Python 3.11.15 / numpy 2.4.6 / scipy 1.17.1 — Adaptyv Bio EGFR design competition round 2 release fetched 2026-10-05 (402 rows); Try it re-run cold in a fresh directory
  executed: 9
  unverified: 0
---
# Planning a protein-engineering campaign

A campaign is a cascade of filters with prices on them. Three decisions set what it
costs and whether it finishes.

1. **How many candidates enter the cascade**, given what you need to come out of it.
2. **In what order the assays run**, because the order changes the bill by an order of
   magnitude without changing the science.
3. **When to stop** — which has to be a rule you wrote down in advance, not the month the
   budget ran out.

Everything else belongs to a tool. Which designs to rank highest, what an interface
confidence number means, how to fit a sensorgram — those live with the tool that produces
them, and duplicating them here would mean two places to be wrong.

## What this decides, and what it does not

**Decides:** stage sizing, assay order, kill criteria *as a structure*, stopping and
futility rules, and whether a design campaign is the right instrument at all.

**Does not decide:** any threshold that belongs to a method. `binder-design-filtering`
owns interface-confidence and developability cutoffs with their sources, and it should
stay the only place in this registry that carries a number like that. If you want to
know where to cut a score, go there. This skill only asks how many survivors you need
and what it costs to get them.

**Does not run anything.** There is no pipeline here, no orchestration, and no state.
A campaign has state — what was ordered, what came back, what the plate reader said —
and that belongs in a project record, not in a page of documentation.

## Set up

Two standard libraries and nothing else. Every number below is computed, not asserted.

```bash
python3 -m pip install "numpy>=2.0" "scipy>=1.14"
```

## The attrition is stage-specific, and the stage people quote is not the one that kills you

Published "hit rates" almost always mean *bound the target at all*. Projects almost never
need that; they need an affinity, a selectivity or a function. The gap between the two is
usually larger than the gap between methods.

That is measurable rather than arguable, so measure it. The Adaptyv Bio EGFR design
competition round 2 released 402 designs that one lab expressed and characterised, with
expression, binding and K<sub>D</sub> for every row — a complete public cascade.

```bash
curl -sSLO https://raw.githubusercontent.com/adaptyvbio/egfr_competition_2/main/results/result_summary.csv
```

```python
import csv, collections

rows = list(csv.DictReader(open("result_summary.csv")))
print(len(rows), "designs ordered")
print(collections.Counter(r["expression"] for r in rows))
print(collections.Counter(r["binding"] for r in rows))

expressed = [r for r in rows if r["expression"] != "none"]
bound     = [r for r in expressed if r["binding"] == "true"]
tight     = [r for r in bound if float(r["kd"]) < 100e-9]

for label, n_in, n_out in [("ordered  -> expressed", len(rows),      len(expressed)),
                           ("expressed -> binds",    len(expressed), len(bound)),
                           ("binds -> KD < 100 nM",  len(bound),     len(tight))]:
    print(f"{label:<22} {n_out:>4}/{n_in:<4} = {n_out / n_in:.3f}")

print(f"composite ordered -> KD < 100 nM  {len(tight)}/{len(rows)} = {len(tight)/len(rows):.4f}")
```

Measured on the 2026-10-05 release:

| stage | in | out | pass rate |
|---|---|---|---|
| ordered → expressed at all | 402 | 380 | 0.945 |
| expressed → binds at all | 380 | 55 | 0.145 |
| binds → K<sub>D</sub> < 100 nM | 55 | 8 | 0.145 |
| **composite, ordered → K<sub>D</sub> < 100 nM** | **402** | **8** | **0.020** |

The hit rate quoted for this campaign is ~14%. Put both stages on the same denominator —
the 402 designs somebody paid for — and 13.7% bind while 2.0% reach 100 nM. That is
**6.9× fewer**, and it is the affinity gate, the one nobody quotes, that costs the second
factor of seven. Budget from the stage your project actually needs. Tighten the gate to
10 nM and 3 designs of 402 survive; ask for 1 nM and none do.

**Two notes on reading a number like this, both of which cost money if you miss them.**

*The denominator is a choice.* `binder-design-filtering` reports 14.0% for this same
release — 53 of 378 — because it drops the two `low`-expression rows. Keeping them gives
14.5%, 55 of 380. Both are defensible and they are not the same number. One of the two
rows dropped is a *strong* binder, which is the useful part: poor expression at screening
scale is a note to carry forward, not a kill criterion, and treating it as one here would
have discarded a hit.

*A stage's pass rate is a property of your system, not of the method.* The table above is
one target, one lab, one expression format. Use it to see the *shape* — multiplicative,
dominated by one or two stages — and then measure your own, which the arithmetic below
needs anyway.

## What the published numbers actually say

Dated, because this moves fast, and a stale attrition figure is the most expensive kind
of wrong number in a budget.

| year | campaign | screened per target | success | what "success" means |
|---|---|---|---|---|
| 2022 | Cao *et al.*, 13 target sites on 12 proteins | 15,000–100,000 designs per site, yeast display | hundreds of binders for FGFR2 and PDGFR; **fewer than 10 from 100,000** for TIE2 and CD3δ | binding detected by display |
| 2023 | Bennett *et al.*, deep-learning filtering added | libraries of ~10⁴ per target | ~**10× higher** than the energy-based baseline; still **<1%** | binding detected by display |
| 2024 | AlphaProteo, 8 targets with reported results | **54–172** candidates per target | **0%** (TNFα, 0/54) to **88%** (BHRF1); >10% on 6 of 8 | measurable binding, one round of medium-throughput screening |
| 2024 | Adaptyv Bio EGFR round 2 | 402 submitted designs, one target | **14%** bind; **2.0%** at <100 nM | measured, as above |
| 2025 | BindCraft | not stated in the abstract | **10–100%** | binding, predominantly nanomolar |

Read the rows across, not down. Between 2022 and 2025 the number of designs you must
order fell by three to four orders of magnitude — but **within** every single row the
spread across targets is larger than the spread across years. AlphaProteo's own range,
in one paper with one method, runs from 0 of 54 to 88%.

That is the planning consequence, and it is the opposite of what a headline number
suggests: **your target's difficulty dominates your method's quality.** A campaign sized
from a published average is sized for a target you do not have.

## How many to order

Start with the number everybody computes, and see what it actually buys.

```python
import numpy as np
from scipy import stats

stages = {"ordered -> expressed": 380/402, "expressed -> binds": 55/380, "binds -> KD<100nM": 8/55}
p = float(np.prod(list(stages.values())))
want = 5

n_det = int(np.ceil(want / p))
print(f"composite p = {p:.4f}")
print(f"deterministic N = ceil({want}/p) = {n_det}")
print(f"P(at least {want} hits | N={n_det}) = {stats.binom.sf(want-1, n_det, p):.3f}")
```

`N = n/p` delivers `n` hits **on average**, which means it misses about half the time.
At these rates it gives P(≥5) = 0.564. Half your campaigns come in short, and you find
out at the end.

The number you want is the smallest `N` whose *probability* of delivering clears a bar
you chose:

```python
import numpy as np
from scipy import stats

p, want = 0.0199, 5

def n_for(want, p, conf):
    if not 0 < p <= 1:
        raise ValueError(f"p={p} is not a rate to size from - see the futility rule below")
    n = want
    while stats.binom.sf(want - 1, n, p) < conf:
        n += 1
    return n

for conf in (0.50, 0.80, 0.90, 0.95):
    print(f"P(>={want}) >= {conf:.2f}  ->  N = {n_for(want, p, conf):>4}")
print("E[hits] at N=402:", round(402 * p, 2), " P(>=5):", round(stats.binom.sf(4, 402, p), 3))

try:                            # the error path, and it is not hypothetical
    n_for(want, 0.0, 0.90)
except ValueError as e:
    print("p = 0:", e)
```

The guard is load-bearing. With `p = 0` the loop can never meet any confidence level and
runs forever — a pilot that returned no hits is the single most likely input to this
function, and an agent executing it would hang rather than tell you. A measured rate of
zero is not a sizing problem; it is the futility question, below.

90% confidence costs 400 designs where the deterministic funnel asked for 252 — a 1.6×
premium for not being surprised. And note what falls out: 400 is what the arithmetic
asks for, the campaign ordered 402, and it returned exactly 8. That is a **retrodiction**,
not a prediction — the rates were measured from this very campaign — and it is the whole
lesson. Fed its own numbers the arithmetic is exact; fed somebody else's it is a guess.

### The hit rate is itself an estimate, and that costs designs

`p` came from one campaign. Treating it as known understates `N`. Put a posterior on the
uncertain stage and integrate over it — exact quadrature, no sampling, so the answer is
reproducible.

```python
import numpy as np
from scipy import stats, integrate

a, b = 0.5 + 55, 0.5 + (380 - 55)        # Jeffreys prior + the 55/380 screen result
p_known = (380/402) * (8/55)             # the stages we are treating as fixed
want = 5

def p_at_least(want, n):
    f = lambda t: stats.binom.sf(want - 1, n, t * p_known) * stats.beta.pdf(t, a, b)
    return integrate.quad(f, 0, 1, limit=200)[0]

print("screen rate posterior mean %.4f, 95%% CI %s"
      % (a/(a+b), np.round(stats.beta.ppf([0.025, 0.975], a, b), 4)))
n = want
while p_at_least(want, n) < 0.90:
    n += 1
print(f"N for P(>={want}) >= 0.90, p uncertain: {n}   (fixed-p answer was 400)")
print(f"what the fixed-p N of 400 really buys: {p_at_least(want, 400):.4f}")
```

With 380 observations behind it the premium is ten designs — 410 rather than 400, and the
400 that looked like 0.90 is really 0.889. Behind a pilot of 30 it is not ten designs, and
that asymmetry is the argument for running the pilot *before* the campaign rather than
instead of it.

## What order to run the assays in

Candidates that die in assay 1 never reach assay 2, so a cascade's cost depends on its
order. For independent screens that all have to be passed, there is an exact answer.

Compare running screen *i* then *j* against the reverse, for one candidate:

- `i` first: `c_i + p_i·c_j`
- `j` first: `c_j + p_j·c_i`

`i` belongs first exactly when `c_i + p_i·c_j ≤ c_j + p_j·c_i`, which rearranges to
`c_i/(1 − p_i) ≤ c_j/(1 − p_j)`. The comparison involves only the two assays, so sorting
on it is optimal — and that is the general result for independent filters, not a
heuristic (Paranjape *et al.* 2026, in the sources):

> **Run assays in ascending order of `cost / (1 − pass rate)`** — cheap first, and
> discriminating first, with the ratio settling which matters more.

```python
import itertools

assays = [   # name, cost per candidate, P(pass).  Replace with your own quotes and rates.
    ("expression + SDS-PAGE",   40, 0.80),
    ("display binding screen",   8, 0.15),
    ("SPR KD",                 220, 0.45),
    ("thermal stability",       60, 0.70),
    ("cell functional assay",  450, 0.50),
]

def expected_cost(order):
    cost, surviving = 0.0, 1.0
    for _, c, p in order:
        cost += surviving * c
        surviving *= p
    return cost

rule  = sorted(assays, key=lambda a: a[1] / (1 - a[2]))
best  = min(itertools.permutations(assays), key=expected_cost)
worst = max(itertools.permutations(assays), key=expected_cost)

print("ratio rule :", [a[0] for a in rule],  f"{expected_cost(rule):.2f}")
print("brute force:", [a[0] for a in best],  f"{expected_cost(best):.2f}")
print("rule is optimal:", abs(expected_cost(rule) - expected_cost(best)) < 1e-9)
print("worst order:", [a[0] for a in worst], f"{expected_cost(worst):.2f}",
      f"-> {expected_cost(worst)/expected_cost(best):.1f}x the bill")
```

The rule matches brute force over all 120 orderings, and the worst ordering costs
**10.2×** the best on these inputs. Note the tie: expression and thermal stability both
score 200, they come back in different orders, and the cost is identical — a tie really
is indifference, so break it on turnaround time.

**Where the rule stops applying.** It optimises expected spend on an AND-cascade of
independent screens, which is a narrower thing than a campaign. Four exceptions, all of
which genuinely occur:

- **Correlated failures.** If stability and expression fail on the same candidates, the
  second assay is not pruning what the model thinks it is. Estimate pass rates
  *conditional* on surviving the earlier screens, which is what your own historical data
  gives you and a published rate does not.
- **An assay whose result changes the design.** Anything feeding a learn step has
  information value beyond elimination. Run it early on a deliberately diverse subset,
  even when the ratio says last.
- **Material and time, not money.** If one assay consumes the protein, or adds six weeks,
  minimising dollars is the wrong objective. Swap `cost` for whatever is actually scarce;
  the rule is unchanged.
- **A fixed batch cost.** Plate- or run-level overheads make per-candidate costing wrong
  below a batch size. Price the batch.

## What kills a candidate at each boundary

Kill criteria are per-project, but their *structure* is not, and getting the structure
wrong is what produces a campaign that cannot be stopped.

**Three kinds, and they behave differently.**

- **Hard gates** — a property the project cannot use at any price. Wrong species
  cross-reactivity, a disallowed modification, an expression format incompatible with the
  final assay. Apply first, as a veto, never as a rank.
- **Ranked criteria** — more is better and there is no true threshold. Interface
  confidence, predicted stability. These order the queue; they do not end candidates.
  `binder-design-filtering` carries the numbers and the evidence for them.
- **Provisional kills** — fails today, might pass in a different format. The
  `low`-expression strong binder above is exactly this. Record it and move on; do not
  delete it.

**Write each gate down with the assay that evaluates it, before the campaign starts.**
A gate invented after seeing the data is not a gate, it is a preference, and the attrition
you projected no longer describes what you are doing.

**One gate per boundary, and state what it does to the count.** If a boundary carries two
gates, you have two pass rates multiplying, and the sizing above needs both.

## When to stop

Three rules. The first is the one people skip, and it is the one that saves the most money.

### Futility — the target may simply be refractory

AlphaProteo's TNFα result was 0 of 54. The planning question is not whether to feel
discouraged, it is what 0 of 54 implies about the next 54.

```python
import numpy as np
from scipy import stats

for k in (10, 20, 30, 54):
    jeff = stats.beta.ppf(0.95, 0.5, 0.5 + k)        # Jeffreys posterior, 95th percentile
    freq = 1 - 0.05 ** (1 / k)                       # exact one-sided 95% bound
    print(f"0 hits in {k:>2}: p is below {jeff:.3f} (Bayes) / {freq:.3f} (frequentist); "
          f"rule of three says ~{3/k:.3f}")

hi = stats.beta.ppf(0.95, 0.5, 54.5)
n = 5
while stats.binom.sf(4, n, hi) < 0.90:
    n += 1
print(f"\neven at the 95% upper bound after 0/54, N for P(>=5) >= 0.90 is {n} more designs")
```

The two bounds answer the same question with different priors and the **rule of three** —
a 95% upper bound of about `3/k` after `k` straight failures — tracks the frequentist one
closely enough to do in your head, and gets closer as `k` grows (0.056 against 0.054 at
k = 54; 0.30 against 0.26 at k = 10). It is conservative relative to the Jeffreys
posterior, never the other way round, which is the direction you want from a
back-of-envelope rule.

After 0 of 54, then, the rate is under 5.4% on the frequentist bound and under 3.5% on the
Jeffreys posterior. Take the optimistic one and assume the rate sits exactly *at* it, and
you still need 228 more designs for five hits. That is the decision: not "try harder", but
a priced choice between 228 more designs, a different target site, and a different
instrument entirely.

**So size a pilot to detect a refractory target, not to succeed.** Inverting the rule of
three: to rule out a rate of 10% you need 0 hits in ~30 candidates; for 5%, ~60. A 30-design
pilot is a fraction of a 400-design campaign and it is the cheapest information in the
whole plan. Run it on the real target, through the real cascade, before committing.

### Sufficiency — you have the answer, so stop measuring

The campaign ends when the *question* is answered, which is usually earlier than when the
candidate list is exhausted. State the stopping condition as a precision on the thing you
actually need — a confidence interval on K<sub>D</sub>, a fold-change you can call —
and compute the n that reaches it before you start. That calculation is
`statistical-power`'s, and it belongs in the plan next to the sizing above.

### Exhaustion — not a rule

Running out of money is an outcome. If the only stopping condition anybody can state is
the budget, the campaign has no defined success criterion, and that is worth discovering
in planning rather than in month nine.

## When a design campaign is the wrong approach

Three cases where the answer is not "order more designs".

- **A reagent already exists.** Someone has made a binder, an enzyme variant or an
  antibody against your target, and finding out costs an afternoon against the structural
  and literature record. A 2% composite hit rate makes an existing reagent worth real
  effort to find.
- **You have a functional starting point.** Directed evolution from a parent that already
  works explores a region of sequence space with a far higher density of improvements than
  design-from-scratch, because the hard part — fold, expression, the basic interaction —
  is already solved. Design is the instrument for *absence* of a starting point; evolution
  is the instrument for *improving* one. Picking the one that matches which you have is
  the single largest decision in the plan.
- **The target region is the problem.** Cao *et al.* found success rate correlated with
  the hydrophobicity of the targeted region, and both TIE2 and CD3δ failed at under 10
  binders from 100,000 designs. If a pilot and the literature both point at the site,
  re-choose the epitope before re-running the pipeline. No sizing fixes an undesignable
  surface.

## What the plan hands back

A campaign plan, and separately a note on how it was arrived at. The plan is the
deliverable; it contains no instructions to the reader and nothing to delete.

```text
Campaign plan — EGFR miniprotein binders, 2026-10-05
Goal                5 designs with KD < 100 nM, confirmed by SPR
Pilot               30 designs through the full cascade; abandon the site if 0 bind
Order size          400 designs  (P(>=5) = 0.90 at the measured composite rate of 0.0199)
Cascade             display binding screen -> thermal stability -> expression + SDS-PAGE
                    -> SPR KD -> cell functional assay
                    expected 57 cost units per design entering, vs 581 at worst
Hard gates          none declared
Provisional         low expression at screen scale is recorded, not a kill
Stop when           5 designs confirmed < 100 nM, or futility bound rules out p >= 0.05
```

And the summary, which is where the reasoning is checkable:

- **Proposed** — 400 designs and a 30-design pilot, from a composite rate of 0.0199 at
  90% confidence.
- **Inferred** — per-stage rates 0.945 / 0.145 / 0.145, measured from the 402-design
  public release, not from a published average.
- **Decided** — the affinity gate was set at 100 nM rather than 10 nM; at 10 nM the same
  data gives 3 of 402 and the order size exceeds 2,000.
- **Outstanding** — assay costs are placeholders from a generic quote and must be replaced
  with yours; the pilot has not run, so every rate here is borrowed from another lab's
  target and should be re-measured at the first boundary.

A field the plan cannot answer stays blank and gets named here. `Hard gates: none declared`
is honest. An invented gate is not.

## Try it

Fetches one public release, measures its cascade, sizes a campaign from it, and checks the
two claims this skill rests on.

**Data** — Adaptyv Bio EGFR protein design competition round 2, `results/result_summary.csv`
(402 rows; data ODbL, code Apache-2.0). Reachable 2026-10-05. Nothing is redistributed
here; the block fetches it.

**Run**

```python
import csv, io, itertools, urllib.request
from scipy import stats

URL = ("https://raw.githubusercontent.com/adaptyvbio/egfr_competition_2"
       "/main/results/result_summary.csv")
rows = list(csv.DictReader(io.StringIO(urllib.request.urlopen(URL).read().decode())))

expressed = [r for r in rows if r["expression"] != "none"]
bound     = [r for r in expressed if r["binding"] == "true"]
tight     = [r for r in bound if float(r["kd"]) < 100e-9]
p = len(tight) / len(rows)
print(f"{len(rows)} ordered -> {len(expressed)} expressed -> {len(bound)} bind "
      f"-> {len(tight)} under 100 nM   composite p = {p:.4f}")

want, det = 5, -(-5 * len(rows) // len(tight))
print(f"deterministic N = {det}, P(>={want}) there = {stats.binom.sf(want-1, det, p):.3f}")
n = want
while stats.binom.sf(want - 1, n, p) < 0.90:
    n += 1
print(f"N for P(>={want}) >= 0.90 = {n}")

assays = [("screen", 8, 0.15), ("stability", 60, 0.70), ("express", 40, 0.80),
          ("SPR", 220, 0.45), ("function", 450, 0.50)]
def cost(order):
    c, s = 0.0, 1.0
    for _, ci, pi in order:
        c += s * ci; s *= pi
    return c
rule = sorted(assays, key=lambda a: a[1] / (1 - a[2]))
best = min(itertools.permutations(assays), key=cost)
print(f"ratio rule {cost(rule):.2f} vs brute-force optimum {cost(best):.2f}")

# drift guards - a failure means the release moved, not that the skill is wrong
assert len(rows) >= 390,                       "release shrank - re-read the source"
assert 0.005 < p < 0.06,                       "composite rate moved - re-size"

# invariants - a failure means this skill is wrong
stage_rates = [len(expressed)/len(rows), len(bound)/len(expressed), len(tight)/len(bound)]
assert p < min(stage_rates),                   "a composite cannot exceed any stage"
assert stats.binom.sf(want-1, det, p) < 0.75,  "n/p is NOT a confident plan"
assert abs(cost(rule) - cost(best)) < 1e-9,    "c/(1-p) must attain the optimum"
assert stats.beta.ppf(0.95, 0.5, 54.5) < 3/54, "Jeffreys bound must sit under rule of three"
print("2 drift guards and 4 invariants hold")
```

**Expect**

*Invariants* — a failure here means this skill is wrong.

- `c/(1 − p)` ordering attains the brute-force optimum over all 120 permutations, exactly.
- `N = n/p` yields P(≥n) well under 0.75 — it is a mean, not a plan.
- The Jeffreys 95% bound after 0/54 is tighter than the rule of three's `3/k`.
- Pass rates multiply, so the composite is below every stage.

*Observed, 2026-10-05, on the release as published* — a mismatch is drift to investigate,
not a bug. Re-stamp the date and re-size.

- 402 ordered → 380 expressed → 55 bind → 8 under 100 nM; composite `p = 0.0199`.
- Deterministic `N = 252`, and P(≥5) there is `0.564`.
- `N = 400` for P(≥5) ≥ 0.90.
- Ratio-rule cascade cost `56.69`; brute-force optimum `56.69`.

## Sources

- Cao, L. *et al.* Design of protein-binding proteins from the target structure alone.
  *Nature* **605**, 551–560 (2022). doi:10.1038/s41586-022-04654-9 — "we designed
  15,000–100,000 binders for each of the 13 target sites on the 12 native proteins";
  810,000 binder designs characterised; "for some (FGFR2 and PDGFR), hundreds of binders
  were generated, whereas for others (TIE2 and CD3δ), fewer than 10 binders were obtained
  from libraries of 100,000 designs"; and the correlation between success rate and the
  hydrophobicity of the targeted region.
- Bennett, N. R. *et al.* Improving de novo protein binder design with deep learning.
  *Nat Commun* **14**, 2625 (2023). doi:10.1038/s41467-023-38328-5 — filtering with
  AlphaFold2 or RoseTTAFold "increases design success rates nearly 10-fold", from a
  baseline the paper describes as low.
- Zambaldi, V. *et al.* De novo design of high-affinity protein binders with AlphaProteo.
  arXiv:2409.08022 (2024) — 47 to 172 candidates tested per target by yeast surface
  display; Table 1's per-target success rates, 0% on TNFα (0/54) through 88% on BHRF1,
  with ">5% for 7 targets, >10% for 6 targets and >20% for 5 targets".
- Pacesa, M. *et al.* One-shot design of functional protein binders with BindCraft.
  *Nature* **646**, 483–492 (2025). doi:10.1038/s41586-025-09429-6 — "experimental success
  rates of 10-100%", binders predominantly nanomolar. The abstract states no per-target
  design count, so none is quoted above.
- Adaptyv Bio EGFR protein design competition, round 2 (2024).
  https://github.com/adaptyvbio/egfr_competition_2 — data ODbL, code Apache-2.0. The
  402-row release measured throughout, including the expression, binding and
  K<sub>D</sub> columns the cascade above is computed from.
- Paranjape, H., Mandal, A. and Sun, X. Optimality of sequential filtering under
  independent cost and selectivity models. arXiv:2606.07589 (2026) — the general result,
  proved rather than asserted: "ordering filters by increasing ratio of cost to rejection
  probability minimizes expected total cost" under an independence model. The derivation
  above is the standard adjacent-exchange argument for the same statement, and `## Try it`
  checks it against brute force rather than taking it on trust.
- The rule of three as a 95% upper bound after `k` consecutive failures is
  `1 − 0.05^(1/k) ≈ 3/k`, also derived above and checked numerically.

### Related skills

- `binder-design-filtering` — which designs to rank and cut, and every threshold that
  decides it, scored against this same public benchmark.
- `statistical-power` — the n that reaches a stated precision, for the sufficiency rule.
- `experimental-design` — randomisation, blocking and plate layout once the counts are set.
- `bindcraft`, `pxdesign`, `boltzgen`, `proteinmpnn` — the generators that fill the top of
  the funnel.
- `dna-chisel` — turning the chosen set into orderable sequence.
