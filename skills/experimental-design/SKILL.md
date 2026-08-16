---
name: experimental-design
description: Design a study before data is collected — pick a design, randomize, block and stratify, and lay out treatment combinations. Covers factorial and fractional-factorial DOE, crossover, split-plot, Latin squares, and plate layouts.
category: utility
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.1.0
tags: [doe, randomization, blocking, factorial, study-design]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified: pending
---
# Experimental Design

## Overview

The design of a study — how units are assigned to conditions, what is held constant, what is varied, and in what structure — determines what questions the data can answer. No analysis can rescue a confounded or pseudoreplicated design after the fact. This skill is about the decisions made *before* data collection: picking a design that isolates the effect of interest, randomizing to license causal claims, blocking to remove known nuisance variation, and structuring multi-factor experiments so effects are estimable rather than tangled together.

The three ideas behind almost every good design (Fisher's principles):
- **Randomization** — assign treatments at random so that confounders, known and unknown, are balanced in expectation. This is what turns a comparison into a causal claim.
- **Replication** — independent repetition at the right level, so you can estimate variability and your effects aren't artifacts of a single unit. The most common fatal error is **pseudoreplication**: counting repeated measurements on the same unit as independent replicates.
- **Blocking / local control** — group similar units (by batch, day, site, litter) and randomize within blocks, removing that nuisance variation from the error term instead of letting it inflate noise.

This skill helps you choose among design types, generate the actual randomization or DOE layout (with reproducible scripts), and avoid the structural mistakes that make data uninterpretable.

## When to Use This Skill

- Planning any comparative experiment or trial and deciding how to assign units
- Randomizing subjects/samples to arms (simple, blocked, stratified, or cluster)
- Removing nuisance variation by blocking or stratification
- Designing multi-factor experiments: full or fractional factorial, screening designs
- Optimizing a response over continuous factors (response-surface designs)
- Within-subject / repeated-measures, crossover, split-plot, or Latin-square designs
- Cluster- or group-randomized designs (sites, clinics, classrooms, litters)
- Deciding the number and level of replicates and avoiding pseudoreplication
- Sequential, group-sequential, or adaptive designs with interim analyses
- Laying out plates/batches and randomizing run order to defeat drift

## Installation

```bash
uv pip install "numpy>=1.26" "pandas>=2.0" pyDOE3
```

`pyDOE3` supplies factorial, fractional-factorial, Plackett-Burman, central-composite,
Box-Behnken, and Latin-hypercube generators. It returns coded matrices; the `to_real`
helper below converts them to real factor units with named columns and randomized run
order.

One note before you pin the dependency. The lineage runs pyDOE → pyDOE2 → pyDOE3 and, as
of 2026, continues in `pydoe`, which reclaims the original name and carries the whole
copyright chain; pyDOE2 has been dormant since 2020. Everything below is written and
checked against `pyDOE3` 1.6.2 (released 2026-01-12). `pydoe` 1.4.0 (2026-08-05) exposes
the same generators under the same names, so these imports work unchanged if you switch.
Both are BSD-3-Clause.

---

## Choosing a design

Start from the question and the structure of your units, not from a favorite design.

```
What are you trying to learn?
│
├─ Compare a few predefined conditions (A vs B vs C)?
│   ├─ Units independent, possibly with a known nuisance factor (day, batch, site)?
│   │     → Completely randomized (no nuisance) or RANDOMIZED BLOCK design.
│   ├─ Each unit can receive every condition in sequence (washout possible)?
│   │     → CROSSOVER / repeated-measures design (more power, watch carry-over).
│   └─ You can only randomize groups, not individuals (schools, clinics)?
│         → CLUSTER-randomized design (analyze at the cluster level; see pseudoreplication).
│
├─ Screen MANY factors (5+) to find the few that matter?
│     → FRACTIONAL FACTORIAL or PLACKETT-BURMAN screening design.
│
├─ Quantify main effects AND interactions among a handful of factors?
│     → FULL 2^k FACTORIAL design.
│
├─ Find the settings that OPTIMIZE a response (curvature matters)?
│     → RESPONSE-SURFACE design: central composite or Box-Behnken.
│
└─ Explore a simulation/computer model over a continuous space?
      → SPACE-FILLING design: Latin hypercube.
```

Detailed guidance per branch:
- **Randomization, blocking, stratification, controls** → `references/randomization_and_blocking.md`
- **Factorial, fractional-factorial, screening, response-surface, DOE concepts (aliasing, resolution)** → `references/factorial_and_doe.md`
- **Crossover, repeated-measures, split-plot, Latin-square, cluster, nested designs** → `references/design_types.md`
- **Sequential, group-sequential, and adaptive designs (interim analyses)** → `references/sequential_and_adaptive.md`

---

## Generating the design

Always seed the generator and save the schedule to a file. The exact allocation has
to be archivable and regenerable — that is a requirement for trial registration and
simply good lab practice. Write these into the project as a small module so the
record shows how the assignment was produced.

### Randomization / allocation schedules

```python
import numpy as np, pandas as pd

def block_randomization(n, arms, block_size=None, seed=None):
    """Permuted blocks — keeps arms balanced throughout enrollment."""
    rng = np.random.default_rng(seed)
    block_size = block_size or 2 * len(arms)
    if block_size % len(arms):
        raise ValueError("block_size must be a multiple of len(arms)")
    out = []
    while len(out) < n:
        block = np.repeat(arms, block_size // len(arms))
        out.extend(rng.permutation(block))
    return pd.DataFrame({"subject": range(1, n + 1), "arm": out[:n]})

def stratified_block_randomization(strata, arms, block_size=None, seed=None):
    """strata = {name: n}. Randomizes within each stratum so a known prognostic
    factor is balanced across arms."""
    rng = np.random.default_rng(seed)
    frames = []
    for i, (name, n) in enumerate(strata.items()):
        df = block_randomization(n, arms, block_size, seed=rng.integers(1 << 32))
        df["stratum"] = name
        frames.append(df)
    return pd.concat(frames, ignore_index=True)

def cluster_randomization(clusters, arms=("treatment", "control"), seed=None):
    """The cluster is the unit of randomization, not the individual."""
    rng = np.random.default_rng(seed)
    assigned = [arms[i % len(arms)] for i in range(len(clusters))]
    return pd.DataFrame({"cluster": clusters, "arm": rng.permutation(assigned)})

sched = block_randomization(60, ["treatment", "control"], seed=42)
print(sched.arm.value_counts())          # sanity-check balance before you use it
sched.to_csv("allocation_schedule.csv", index=False)
```

Choosing among them: **simple** randomization is fine for large n but drifts out of
balance with small n; **block** guarantees balance throughout; **stratified block**
additionally balances a known prognostic factor; **cluster** is mandatory when the
intervention is delivered at a group level. See
`references/randomization_and_blocking.md`.

### DOE matrices

`pyDOE3` generates the coded matrices; scale them into real units yourself so the
saved run sheet is directly usable at the bench.

```bash
uv pip install pyDOE3 numpy pandas
```

```python
import numpy as np, pandas as pd
from pyDOE3 import ff2n, fracfact, pbdesign, ccdesign, bbdesign

def to_real(coded, factors, seed=None):
    """Map a coded design (-1..+1) to real units and randomize run order."""
    df = pd.DataFrame(coded, columns=list(factors))
    for name, (lo, hi) in factors.items():
        df[name] = lo + (df[name] + 1) / 2 * (hi - lo)
    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)
    df.insert(0, "run_order", range(1, len(df) + 1))
    return df

factors = {"temp_C": (20, 60), "conc_mM": (1, 10), "pH": (6, 8)}

design = to_real(ff2n(3), factors, seed=42)              # full 2^3, 8 runs
screen = to_real(pbdesign(7)[:, :7],                      # Plackett-Burman screen
                 {f"factor_{i}": (0, 1) for i in range(7)}, seed=42)
rsm = to_real(ccdesign(2, center=(1, 1)),                 # response surface
              {"temp_C": (20, 60), "conc_mM": (1, 10)}, seed=42)

design.to_csv("experimental_runs.csv", index=False)
```

Randomize run order — otherwise factors are confounded with time and drift (machine
warm-up, reagent aging). `to_real` above does it by default. See
`references/factorial_and_doe.md` for picking generators, reading the alias
structure, and choosing resolution.

---

## The mistakes that ruin studies

These are structural — they can't be fixed in analysis, only in design.

1. **Pseudoreplication.** Treating repeated measurements of one unit as independent
   replicates: 3 mice with 100 cells each is n = 3 (mice), not n = 300 (cells), for
   any treatment applied to the mouse. The replicate must be at the level the
   treatment is randomized. This single error invalidates a large share of published
   experiments. Randomize and replicate at the right level; analyze with the nesting
   respected (mixed model). See `references/design_types.md`.
2. **Confounding by a nuisance variable.** Running all treatment samples on Monday
   and all controls on Tuesday confounds treatment with day. Randomize across, or
   block on, every nuisance factor you can name (batch, day, plate, technician,
   instrument, position).
3. **No or broken randomization.** Convenience assignment (first-come → treatment)
   lets confounders sneak in. Use a seeded schedule and follow it.
4. **No proper control.** Without a concurrent control (and, where relevant, a
   vehicle/sham and blinding), you can't separate the treatment effect from time,
   placebo, or handling effects.
5. **Batch effects mistaken for biology.** In omics especially, process samples in a
   randomized/blocked order across batches; never let batch align with the condition.
6. **Edge/position effects on plates.** Evaporation and thermal gradients make plate
   edges differ. Randomize or block sample positions; don't put all controls in
   column 1.
7. **Aliasing ignored in fractional designs.** A low-resolution fractional factorial
   confounds main effects with interactions; know your alias structure before
   concluding a factor "has no effect."
8. **Optimizing without curvature.** A two-level factorial can't detect a curved
   response; you'll miss an interior optimum. Use a response-surface design.

---

## Workflow

1. **State the question, the unit, and the response.** What is randomized? What is
   measured? At what level is a true independent replicate? This determines everything.
2. **List nuisance factors** (batch, day, site, operator, position) — plan to block,
   stratify, or randomize across each.
3. **Pick the design** using the decision tree and reference files.
4. **Decide replication** at the correct level (and get n from the
   **statistical-power** skill for the chosen design).
5. **Generate the layout** with the seeded snippets above, written into the project as a
   small module so the allocation is regenerable.
6. **Randomize run/processing order** and plate/batch positions.
7. **Document** the design, seed, and schedule (pre-register if possible) so the
   analysis is confirmatory and the layout is auditable.
8. **Match the analysis to the design** — blocks, strata, clusters, and nesting must
   appear in the model. A design feature omitted from the model is a design feature
   you did not get.

---

## Try it

A self-contained check that this skill still works. No account, no key, nothing to download
beyond the packages above.

**Data** — generated inline, and the frontmatter says so with `datasets: []` rather than
naming a source. That is not a shortcut: this skill is used *before* any data exists, so its
claims are about the structure of an allocation, not the content of a dataset. There is
nothing to fetch, and every assertion below is checkable from the design matrix alone.

```python
import numpy as np, pandas as pd
from pyDOE3 import ff2n, fracfact

def block_randomization(n, arms, block_size=None, seed=None):
    rng = np.random.default_rng(seed)
    block_size = block_size or 2 * len(arms)
    if block_size % len(arms):
        raise ValueError("block_size must be a multiple of len(arms)")
    out = []
    while len(out) < n:
        block = np.repeat(arms, block_size // len(arms))
        out.extend(rng.permutation(block))
    return pd.DataFrame({"subject": range(1, n + 1), "arm": out[:n]})

def max_running_imbalance(arms_seq, a="treatment"):
    """Worst |n_a - n_b| at ANY point during enrollment, not just at the end."""
    diff = np.cumsum([1 if x == a else -1 for x in arms_seq])
    return int(np.abs(diff).max())

def counts(seq):
    c = pd.Series(list(seq)).value_counts()
    return ", ".join(f"{str(k)}={int(v)}" for k, v in sorted(c.items()))

# 1. Permuted blocks bound imbalance THROUGHOUT enrollment; simple randomization does not.
n, arms, bs = 60, ["treatment", "control"], 4
blocked = block_randomization(n, arms, block_size=bs, seed=42)
simple = np.random.default_rng(42).choice(arms, size=n)

mb, ms = max_running_imbalance(blocked.arm), max_running_imbalance(simple)
print(f"max running imbalance  blocked(bs={bs}): {mb}   simple: {ms}")
print(f"final balance          blocked: {counts(blocked.arm)}")
print(f"                       simple:  {counts(simple)}")
assert mb <= bs // 2, "permuted blocks must bound imbalance at half the block size"

# 2. A full 2^k factorial is exactly orthogonal — every main effect estimable independently.
X = ff2n(3)
print(f"\nfull 2^3: {X.shape[0]} runs, Gram matrix = {X.shape[0]} x I:",
      np.array_equal(X.T @ X, X.shape[0] * np.eye(3)))
assert np.array_equal(X.T @ X, X.shape[0] * np.eye(3))

# 3. Mistake 7 made numerical: a resolution-III fraction aliases C with AB perfectly.
F = fracfact("a b ab")
alias = abs(np.corrcoef(F[:, 0] * F[:, 1], F[:, 2])[0, 1])
print(f"res-III 2^(3-1): {F.shape[0]} runs, |corr(A*B, C)| = {alias:.6f}")
assert abs(alias - 1.0) < 1e-12, "C is aliased with AB by construction"

# 4. The error path is part of the contract, not an afterthought.
try:
    block_randomization(10, ["a", "b", "c"], block_size=4)
except ValueError as e:
    print(f"error path      : ValueError({e})")
else:
    raise AssertionError("expected ValueError: 4 does not divide across 3 arms")

print("\nall checks passed")
```

**Expect**

Invariants — these hold regardless of package version, and a failure means the skill is
**wrong**, not that something drifted:

- Permuted blocks bound the running imbalance at **half the block size** at every point in
  enrollment (≤ 2 for `block_size=4`), and finish exactly balanced. The guarantee is
  *throughout*, not merely at the end — that is the whole reason to prefer them at small n.
- A full 2^k factorial is exactly orthogonal: `X.T @ X` equals the run count times the
  identity, so every main effect is estimable independently of the others.
- A resolution-III fraction aliases a main effect with an interaction **perfectly**:
  `|corr(A*B, C)| = 1.000000`, exactly. That is mistake 7 above made numerical — in those
  four runs C and AB are not merely correlated, they are the same column, and no analysis
  applied afterwards can separate them.
- `block_size` not a multiple of `len(arms)` raises `ValueError` rather than silently
  producing an unbalanced schedule.

Observed 2026-08-16 with `pyDOE3` 1.6.2, NumPy 2.4.6, pandas 3.0.5. The run is seeded and
reproducible, but the simple-randomization figures depend on NumPy's generator stream — if
those two numbers move, treat it as drift to investigate, not as a failure:

```
max running imbalance  blocked(bs=4): 2   simple: 9
final balance          blocked: control=30, treatment=30
                       simple:  control=33, treatment=27

full 2^3: 8 runs, Gram matrix = 8 x I: True
res-III 2^(3-1): 4 runs, |corr(A*B, C)| = 1.000000
error path      : ValueError(block_size must be a multiple of len(arms))

all checks passed
```

Simple randomization landing at 33/27, having been as far as 9 apart mid-enrollment, is the
failure mode blocking exists to prevent. It is a property of the method at this n, not an
unlucky seed.

---

## Resources

### References
- `references/randomization_and_blocking.md` — randomization methods, blocking,
  stratification, controls, blinding, batch/plate layout.
- `references/factorial_and_doe.md` — factorial and fractional designs, resolution
  and aliasing, screening, and response-surface methodology.
- `references/design_types.md` — completely randomized, randomized block, crossover,
  repeated-measures, split-plot, Latin-square, cluster, and nested designs; the
  pseudoreplication problem in depth.
- `references/sequential_and_adaptive.md` — group-sequential designs, alpha spending,
  interim stopping, and adaptive sample-size re-estimation.

### Related skills
- **statistical-power** — required sample size / power for the design you've chosen.

Fitting the models a design implies is done with statsmodels or PyMC; analysis and
reporting after collection are outside this skill.

### Key references
- Fisher, R. A. (1935). *The Design of Experiments*.
- Montgomery, D. C. (2019). *Design and Analysis of Experiments* (10th ed.).
- Hurlbert, S. H. (1984). Pseudoreplication and the design of ecological field
  experiments. *Ecological Monographs*, 54(2), 187–211.
- Lazic, S. E. (2016). *Experimental Design for Laboratory Biologists*.
