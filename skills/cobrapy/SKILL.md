---
name: cobrapy
description: Run constraint-based metabolic modeling in Python with COBRApy — load SBML models, set the medium, run FBA, pFBA, flux variability and knockouts, and catch silent failures such as infeasible solves that still return numbers.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [metabolic-modeling, flux-balance-analysis, sbml, knockout, synthetic-biology]
datasets: [https://raw.githubusercontent.com/SysBioChalmers/yeast-GEM/v9.1.1/model/yeast-GEM.xml]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: cobra 0.32.1 / optlang 1.9.1 / swiglpk 5.0.13 / highspy 1.15.1 / osqp 1.1.3 / pandas 2.3.3 / Python 3.12.13 / yeast-GEM 9.1.1 / install line run in a fresh venv, every block run in page order in one fresh directory and Try it run again alone in a fresh mktemp directory
  executed: 10
  unverified: 0
---
# COBRApy — flux balance analysis and knockouts

A genome-scale metabolic model (GEM) is a stoichiometric matrix plus flux bounds and
gene-reaction rules. Flux balance analysis (FBA) assumes steady state and asks a linear
program for the flux distribution that maximizes an objective, usually a biomass reaction.
COBRApy is the standard Python toolbox for it, maintained by the openCOBRA community.

What it is good for: predicting growth on a medium, yields, which genes or reactions a
model needs, which fluxes are fixed versus free at the optimum, and what a knockout or a
medium change does *in the model*. What it is not: a kinetic or regulatory model. A
prediction is only as good as the reconstruction, and every number below should be reported
together with the model, its version, the medium and the solver.

```bash
pip install cobra               # LGPL-2.0+ / GPL-2.0+; brings the GLPK solver via swiglpk
pip install highspy osqp        # optional: a faster open solver, used as solver "hybrid"
```

No account or key. COBRApy runs on CPython 3.12 and 3.13; it pins `pandas<3`, so install it
into its own environment rather than next to code that needs pandas 3. GLPK is the default
solver. Gurobi, CPLEX and MOSEK work through the same interface but need their own licenses
(free academic licenses exist for all three).

## Models, and the licenses they come under

The model is the data, and its license is separate from COBRApy's:

| Source | Examples | Terms |
|---|---|---|
| SysBioChalmers on GitHub | `yeast-GEM`, `Human-GEM`, `Mouse-GEM` | CC BY 4.0 |
| BiGG at `bigg.bio` (BRIGHT, DTU) | pangenome collections such as `Ecoli_panGEMs` | CC BY 4.0 for BRIGHT collections; legacy models keep the terms below |
| Legacy BiGG Models, `bigg.ucsd.edu` | `e_coli_core`, `iML1515`, `iJO1366`, `iMM904` | Educational, research and non-profit use only; commercial use needs an agreement with UC San Diego |

Every example here uses **yeast-GEM 9.1.1**, the consensus *Saccharomyces cerevisiae* model
(4105 reactions, 1143 genes, CC BY 4.0), so anyone can run them. The legacy BiGG models are
a good source if your own license allows it. COBRApy also bundles three models for
`load_model` (`"textbook"`, `"iJO1366"`, `"salmonella"`); the first two are copies of BiGG
models, so treat them under BiGG's terms, and check the terms of any bundled model before
commercial use. The code below works unchanged on any SBML model once you swap
the reaction ids.

## 1. Load and inspect

```python
import urllib.request
from cobra.io import read_sbml_model

URL = "https://raw.githubusercontent.com/SysBioChalmers/yeast-GEM/v9.1.1/model/yeast-GEM.xml"
urllib.request.urlretrieve(URL, "yeast-GEM.xml")    # 11.6 MB
m = read_sbml_model("yeast-GEM.xml")                # reads .xml and .xml.gz
print(m.id, len(m.reactions), "reactions", len(m.metabolites), "metabolites", len(m.genes), "genes")
print("objective :", m.objective.expression, m.objective_direction, "=", m.reactions.r_2111.name)
print("boundary  :", len(m.exchanges), "exchanges", len(m.demands), "demands", len(m.sinks), "sinks")

def exchange(model, label):                         # ids are r_####; look exchanges up by name
    hits = [r for r in model.exchanges if r.name == f"{label} exchange"]
    assert len(hits) == 1, (label, hits)
    return hits[0]
print({lab: exchange(m, lab).id for lab in ["D-glucose", "oxygen", "ethanol", "carbon dioxide"]})

pgi = m.reactions.r_0467
print(pgi.name, "|", pgi.build_reaction_string(use_metabolite_names=True), pgi.bounds)
for rid in ["r_0467", "r_0886", "r_0486"]:          # single gene, "and" complex, "or" isozymes
    print(rid, m.reactions.get_by_id(rid).name, "GPR:", m.reactions.get_by_id(rid).gene_reaction_rule)
print("gene name :", repr(m.genes.YBR196C.name), [r.id for r in m.genes.YBR196C.reactions])

unbalanced = [r for r in m.reactions if not r.boundary and r.check_mass_balance()]
print("unbalanced:", len(unbalanced), "e.g.", [r.name for r in unbalanced[:3]])
```

- **Getting files.** Download the SBML yourself and use `read_sbml_model`. `load_model(id)`
  fetches other ids from BiGG over `http://`. On 2026-11-06 that failed under cobra 0.32.1,
  because BiGG answers with a 301 redirect to `https://` and cobra does not follow it.
- **Identifiers are model-specific.** yeast-GEM uses `r_1714` for the glucose exchange,
  `s_0565` for glucose, and systematic ORF names (`YBR196C`) for genes, with `gene.name`
  left empty. BiGG-style models use `EX_glc__D_e`, `PGI` and locus tags. Look reactions up by
  `reaction.name` (the `exchange` helper above), never by guessing an id.
- **The objective may not be the biomass equation.** In yeast-GEM the objective is `r_2111`
  ("growth"), which drains the product of the biomass pseudoreaction `r_4041`. Check
  `model.objective` and make sure you maximize what the paper you compare with maximized.
- **Mass balance.** 211 internal reactions in yeast-GEM 9.1.1 fail `check_mass_balance()`.
  Most are lumped lipid species (cardiolipins, triglycerides, sphingolipids) whose acyl chains
  carry generic formulas, and the biomass pseudoreaction is unbalanced by design. Read the
  list rather than treating every hit as an error; an unbalanced reaction in central
  metabolism is a curation problem worth reporting.

## 2. The medium and the sign convention

Exchange reactions are written `met_e <=>` (nothing on the right). **Negative flux is uptake,
positive is secretion.** The lower bound of an exchange is therefore minus the maximum uptake.
`model.medium` presents this the other way round: a dict of open uptake exchanges and their
maximum uptake as positive numbers. Fluxes are in mmol per gram dry weight per hour
(mmol/gDW/h); growth is in 1/h, so the doubling time is ln 2 / μ.

```python
from cobra.io import read_sbml_model
m = read_sbml_model("yeast-GEM.xml")
GLC, O2, ETOH, CO2 = "r_1714", "r_1992", "r_1761", "r_1672"   # found by name in section 1
print(m.medium)                                    # {'r_1654': 1000.0, 'r_1714': 1.0, ...}

m.medium[O2] = 0.0                                 # TRAP: edits a copy, changes nothing
print("still aerobic:", m.reactions.get_by_id(O2).lower_bound)

with m:                                            # changes inside "with" revert on exit
    medium = m.medium
    medium[GLC] = 10.0
    m.medium = medium                              # reassign the whole dict
    sol = m.optimize()
    print("glucose 10 :", sol.status, round(sol.objective_value, 4),
          sol.fluxes[[GLC, O2, CO2, ETOH]].round(3).to_dict())
with m:
    medium = m.medium
    medium[O2] = 0.0
    m.medium = medium
    sol = m.optimize()
    print("anaerobic  :", sol.status, sol.objective_value)
print("restored   :", m.reactions.get_by_id(O2).bounds, round(m.slim_optimize(), 4))
```

- Assigning `model.medium` **closes every uptake exchange you leave out**. Start from the
  current dict and edit it; do not build a new one from memory.
- yeast-GEM ships with glucose uptake limited to **1** mmol/gDW/h, not the 10 many papers
  use. Growth scales with it, so state the uptake rate with every growth rate.
- "Unlimited" is a model convention, not a constant: yeast-GEM uses 1000, other models use
  other values. Read the bounds; do not assume them.
- **Anaerobic growth comes back `optimal` with a growth of zero up to solver noise**
  (-1.5e-16 in one run, 4.8e-31 in another). Aerobic sterol and fatty acid
  synthesis are still in the biomass equation, so the model cannot grow without oxygen
  unless those are supplied in the medium. `status == "optimal"` means the LP solved, not
  that the cell grows; check the value too.
- **Plain FBA does not predict overflow metabolism.** At 10 mmol glucose the model respires
  everything (ethanol secretion 0), while real *S. cerevisiae* ferments to ethanol at high
  glucose even with oxygen present. Predicting that needs enzyme or proteome constraints,
  which plain FBA does not have.
- Growth is not proportional to uptake. Non-growth-associated maintenance (`r_4046` in
  yeast-GEM) is a fixed ATP drain, so μ is affine in the carbon uptake rate. `## Try it`
  measures this.

## 3. FBA — check the status before any number

```python
import math, warnings
from cobra.io import read_sbml_model
m = read_sbml_model("yeast-GEM.xml")

sol = m.optimize()
assert sol.status == "optimal"
mu = sol.objective_value
print(f"μ = {mu:.4f} /h, doubling {math.log(2) / mu:.2f} h, glucose {sol.fluxes['r_1714']}")
print(m.summary())                                  # uptake/secretion table, signs flipped for reading

with m:
    m.reactions.r_4046.bounds = (50, 50)            # more maintenance ATP than 1 mmol glucose can make
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")             # a UserWarning is the only signal
        bad = m.optimize()
    print("status:", bad.status, "objective_value:", bad.objective_value)   # a number, not NaN
    print("slim_optimize:", m.slim_optimize(), "| with error_value:", m.slim_optimize(error_value=0.0))
```

**An infeasible solve still returns a `Solution` full of numbers.** cobra 0.32.1 emits a
`UserWarning` and hands back the solver's last iterate. On yeast-GEM `objective_value` came
back as `0.0` in a fresh session and as `-0.189` after earlier solves, both with an
ordinary-looking flux table. Code that reads `objective_value` without checking `status`
reports that garbage as a result. Use one of these:

- `sol.status == "optimal"` before anything else.
- `m.optimize(raise_error=True)`, which raises `OptimizationError`.
- `m.slim_optimize()` when you need only the objective. It returns `nan` on failure, or
  `error_value` if you pass one.

Common causes of infeasibility are a lower bound forced above zero (ATP maintenance, a fixed
product flux), a closed exchange the biomass needs, or a reaction direction that contradicts
a fixed flux.

## 4. pFBA — one representative flux distribution

FBA's optimum is almost never unique, and `optimize()` returns whichever vertex the solver
reached. Parsimonious FBA fixes the objective at its optimum and then minimizes the total
absolute flux. Use it when you report or plot individual fluxes:

```python
from cobra.io import read_sbml_model
from cobra.flux_analysis import pfba
m = read_sbml_model("yeast-GEM.xml")

fba = m.optimize()
p = pfba(m)
print("growth   :", fba.objective_value, p.fluxes["r_2111"])
print("objective of the pFBA solution is the total flux:", round(p.objective_value, 3),
      "vs FBA's", round(fba.fluxes.abs().sum(), 3))
```

The pFBA `objective_value` is the **summed flux**, not growth. Read growth from the objective
reaction's flux. The FBA total varies between runs (101.8 and 105.1 on the same model on the
same day) because a different vertex came back; the pFBA total (100.76) does not.

## 5. FVA — what is fixed at the optimum, and loops

Flux variability analysis returns, for each reaction, the minimum and maximum flux that is
consistent with an objective of at least `fraction_of_optimum` of the maximum.

```python
import cobra
from cobra.io import read_sbml_model
from cobra.flux_analysis import flux_variability_analysis as fva, pfba

cobra.Configuration().processes = 1                 # see section 6
m = read_sbml_model("yeast-GEM.xml")
loop = ["r_0163", "r_0165", "r_0302", "r_0303"]     # ethanol/acetaldehyde and citrate/cis-aconitate pairs
probe = loop + ["r_0467", "r_0304"]                 # glucose-6-phosphate isomerase, a heme step

print(fva(m, probe, fraction_of_optimum=1.0))
print(fva(m, ["r_0467", "r_1992"], fraction_of_optimum=0.9))

p = pfba(m).fluxes                                   # minimal total flux runs no cycle at the bound
print("pFBA:", p[loop].round(3).to_dict(), "| reactions at |flux| >= 999:", int((p.abs() >= 999).sum()))
```

What this shows on yeast-GEM 9.1.1:

- At 100% of optimum, cytosolic and mitochondrial alcohol dehydrogenase (`r_0163`,
  `r_0165`) each span 0 to 1000, and the two aconitase steps span -1000 to 1000. Nothing
  but the arbitrary 1000 bound limits them, the mark of a cycle that can run at any rate
  without changing the network's net exchange. **A range that ends at the model's bound is usually a loop, not biology.** In a
  full FVA at the optimum, 455 of 4105 reactions reached ±999 or more.
- **For reporting fluxes, use pFBA.** Minimizing total flux leaves no reaction near the
  bound, so a pFBA vector carries no cycle at 1000. `loopless_solution(model, fluxes)` is
  meant to strip loops from one flux vector, but on yeast-GEM it depended on the starting
  vector. From one vector with cytosolic alcohol dehydrogenase at 1000 it returned 2.373.
  From another, with both alcohol dehydrogenases at 1000, it returned 999.967 for both.
  Check its output rather than assuming it worked.
- **Loopless FVA is not reliable on a genome-scale model with open solvers**, so it is not in
  the block above. On these four reactions with GLPK, `fva(m, loop, loopless="fastSNP")`
  pinned all four to 0 in about 40 s in four of eight runs, and in the other four it was
  still running after several minutes, with or without `m.solver.configuration.timeout`.
  `loopless="cycleFreeFlux"` returned in about 8 s but still reported 1000 for `r_0163` and
  `r_0302`. With `hybrid`, `fastSNP` returned `inf`/`-inf` bounds and `cycleFreeFlux`
  raised a `ValueError`. If you need loopless ranges, run them on the few reactions you care
  about, in a process you can kill, and compare the result with the pFBA vector.
  Passing `loopless=True` is deprecated.
- **Values near the solver tolerance (`1e-7` by default, `cobra.Configuration().tolerance`)
  cannot be read either way.** The heme step `r_0304` carries 8.1e-8, a real but trace
  requirement of the biomass equation. In a full FVA run with the `hybrid` solver, 114
  reactions came back with ranges entirely below 1e-7, some with the minimum larger than the
  maximum. Threshold before you call a flux "active" or "zero", and say which threshold.
- Reaching 90% of optimum widens most ranges. FVA bounds are each reached by a different
  flux distribution, so the set of all minima is not itself a feasible solution.
- **Full FVA on a genome-scale model is slow.** All 4105 reactions took about 14 minutes with
  `hybrid` on a laptop; `find_blocked_reactions(m)` (1396 blocked on the default medium) took
  about 2 minutes. Pass the reactions you care about.

## 6. Knockouts and essentiality

```python
import cobra
from cobra.io import read_sbml_model
from cobra.flux_analysis import single_gene_deletion, single_reaction_deletion, double_gene_deletion

cobra.Configuration().processes = 1
m = read_sbml_model("yeast-GEM.xml")
m.solver = "hybrid"                                # see section 7: GLPK can stall in long scans
m.solver.configuration.timeout = 60
wt = m.slim_optimize()

for gene in ["YBR196C", "YGR240C", "YML126C"]:     # PGI1; PFK1, one subunit of an "and"; ERG13
    with m:
        m.genes.get_by_id(gene).knock_out()
        print(gene, "KO:", round(m.slim_optimize(), 4), "of", round(wt, 4))

ko = single_gene_deletion(m)                       # all 1143 genes, about 2 minutes
print(ko.status.value_counts().to_dict())
ko["growth"] = ko.growth.fillna(0.0)               # infeasible knockouts come back NaN, not 0
essential = ko[ko.growth < 0.01 * wt]
print(len(essential), "genes essential at <1% of wild type")
print(ko.knockout["YKL060C"])                      # look a gene up; ids is a set

print(single_reaction_deletion(m, ["r_0467", "r_0886", "r_0450", "r_0486"]))
print(double_gene_deletion(m, ["YGR192C", "YJL052W", "YJR009C"]).round(4))   # GAPDH isozymes
```

- **`processes` hangs or crawls outside Linux.** Deletions and FVA use one worker process per
  CPU by default (10 on an 11-core laptop). Under the `spawn` start method (macOS, Windows),
  a script without an `if __name__ == "__main__":` guard failed with a bootstrapping
  `RuntimeError` and left the run stuck. With the guard, deleting 60 yeast-GEM genes took
  12 s with 10 workers against 3 s with `processes=1`. Set `cobra.Configuration().processes
  = 1` unless the model is large and you have measured a gain.
- **Infeasible knockouts get `growth = NaN`.** A filter like `growth < x` silently drops NaN
  rows, so `fillna(0)` before calling genes essential, and count the NaN rows.
- **Use a threshold, not `== 0`.** Lethal knockouts come back as values like 0.0, 5.8e-13
  or 3.3e-12, never reliably exactly zero. A fraction of wild type (1–10%) is the usual cutoff; say which one you used. At 1%,
  194 of 1143 yeast-GEM genes were essential on the default medium.
- **Gene–protein–reaction rules decide everything.** Knocking out one gene of an "or"
  (isozyme) changes nothing: the three GAPDH genes each and in pairs leave growth at
  wild type. One subunit of an "and" complex removes the reaction (PFK1 alone drops growth
  to 0.0805). `ids` is a Python `set`.
- **Model essentiality is not in vivo essentiality.** Deleting FBA1 (`YKL060C`), which is
  lethal in real yeast, still gives 99% of wild-type growth through a network bypass, and
  deleting the GAPDH reaction `r_0486` outright keeps 92%. Compare model calls against a
  measured screen before trusting them. For human cell lines that means CRISPR data; see the
  `depmap` skill for those screens.

## 7. Solver choice, timeouts and saving

```python
from cobra.io import read_sbml_model, save_json_model, write_sbml_model, load_json_model
m = read_sbml_model("yeast-GEM.xml")

m.solver = "hybrid"                    # HiGHS for LP/MILP + OSQP for QP; needs highspy and osqp
print(type(m.solver).__module__, m.slim_optimize(), "timeout:", m.solver.configuration.timeout)
m.solver = "glpk"                      # TRAP: the switch carries timeout 0 over from hybrid
print("glpk after hybrid:", m.slim_optimize(), m.solver.status)
m.solver.configuration.timeout = 60    # seconds per solve; a stuck solve becomes status "time_limit"
print("with a timeout   :", m.slim_optimize(), m.solver.status)

save_json_model(m, "yeast-GEM.json")
write_sbml_model(m, "yeast-GEM_out.xml")
print(load_json_model("yeast-GEM.json").slim_optimize(), read_sbml_model("yeast-GEM_out.xml").slim_optimize())
```

- **Switching solvers carries configuration over.** After `hybrid`, the GLPK interface
  inherited `timeout = 0`, and every solve returned `time_limit` with NaN instantly. Set the
  timeout explicitly after any `model.solver =` assignment.
- **GLPK can stall forever on a genome-scale model.** In a gene-deletion scan of yeast-GEM
  9.1.1 on 2026-11-06, the warm-started GLPK solve of the `YDR044W` knockout (the gene behind
  the trace heme flux in section 5) never returned. The same knockout solved in under a
  second from a cold start. With a timeout, that row came back as `time_limit` with NaN
  growth. With `hybrid`, all 1143 deletions finished in about 130 s, all `optimal`. Set a
  timeout for any long scan, and prefer `hybrid` on models with more than a few thousand
  reactions.
- Different solvers agree on the optimum to about 1e-7 but can return **different flux
  distributions** at that optimum. Report the solver, and use pFBA or FVA for statements
  about individual fluxes.
- Save edited models as SBML (portable) or JSON (fast and diff-friendly). Pickling ties the
  file to library versions.

## Production yield — a quick strain-design question

```python
from cobra.io import read_sbml_model
from cobra.flux_analysis import production_envelope
m = read_sbml_model("yeast-GEM.xml")
env = production_envelope(m, ["r_1992"], objective="r_1761", points=5)   # oxygen vs ethanol
print(env[["r_1992", "flux_minimum", "flux_maximum", "carbon_yield_maximum"]])
```

This gives the maximum ethanol secretion and its carbon yield across oxygen uptake rates,
**without** requiring growth. At zero oxygen the maximum is 2 mmol ethanol per mmol glucose
(carbon yield 0.667, the fermentation stoichiometry), even though section 2 showed the model
cannot grow there. To ask the question at a fixed growth rate, set the objective reaction's
lower bound inside a `with model:` block first.

## Checklist before reporting a number

1. Model name, version or commit, and its license.
2. The medium as a dict of exchange to maximum uptake. State any bound you changed.
3. `status == "optimal"` on every solve you report, and a growth value above your threshold.
   NaN and `time_limit` rows from scans counted and named.
4. Units: mmol/gDW/h for fluxes, 1/h for growth.
5. For individual fluxes, pFBA or an FVA range rather than a single FBA vertex. Ranges that
   end at the model's bound flagged as possible loops.
6. Essentiality threshold stated, and calls compared with experimental data where any exists.
7. Solver and cobra version.

## Try it

**Data**: yeast-GEM 9.1.1, the consensus *Saccharomyces cerevisiae* model from
SysBioChalmers, as SBML from its tagged GitHub release (CC BY 4.0, no account). It was last
confirmed reachable on 2026-11-06 at 11.6 MB. It uses `r_####` ids, so the run looks
exchanges up by name. It also goes through three traps: the medium copy, an infeasible
solve that still returns a number, and a knockout that the model survives but a real cell
does not.

```python
import math, urllib.request, cobra
from cobra.io import read_sbml_model
from cobra.flux_analysis import pfba, flux_variability_analysis, single_gene_deletion

cobra.Configuration().processes = 1      # no worker processes: safe in scripts and notebooks
URL = "https://raw.githubusercontent.com/SysBioChalmers/yeast-GEM/v9.1.1/model/yeast-GEM.xml"
urllib.request.urlretrieve(URL, "yeast-GEM.xml")
m = read_sbml_model("yeast-GEM.xml")

def exchange(label):                      # yeast-GEM ids are r_####; look exchanges up by name
    hits = [r for r in m.exchanges if r.name == f"{label} exchange"]
    assert len(hits) == 1, (label, hits)
    return hits[0]
glc, o2 = exchange("D-glucose"), exchange("oxygen")

# 1. the medium trap: editing the returned dict changes nothing
m.medium[o2.id] = 0.0
assert o2.lower_bound == -1000
print("model       :", m.id, len(m.reactions), "reactions,", len(m.genes), "genes; glucose uptake", m.medium[glc.id])

# 2. FBA, status first; uptake is negative flux
sol = m.optimize()
assert sol.status == "optimal"
mu = sol.objective_value
print("FBA         : growth", round(mu, 4), "/h, doubling", round(math.log(2) / mu, 1), "h, glucose flux", sol.fluxes[glc.id])

ngam = m.reactions.r_4046                 # non-growth associated maintenance, fixed in ATP
with m:                                   # 10x the glucose is not 10x the growth
    med = m.medium; med[glc.id] = 10.0; m.medium = med
    mu10 = m.slim_optimize()
with m:
    ngam.bounds = (0, 0)
    yield_no_maint = m.slim_optimize()    # growth per mmol glucose once maintenance is free
print("glucose 10x : growth", round(mu10, 4), "ratio", round(mu10 / mu, 3), "| slope", round((mu10 - mu) / 9, 5), "vs", round(yield_no_maint, 5))

# 3. infeasible solves still hand back numbers
with m:
    ngam.bounds = (50, 50)                # more maintenance ATP than 1 mmol glucose can make
    bad = m.optimize()
    slim = m.slim_optimize()
    print("infeasible  : status", bad.status, "objective", bad.objective_value, "| slim", slim)
assert bad.status == "infeasible" and math.isnan(slim)

# 4. pFBA keeps the optimum and minimizes total flux
p = pfba(m)
print("pFBA        : growth", round(p.fluxes["r_2111"], 4), "total |flux|", round(sol.fluxes.abs().sum(), 2), "->", round(p.objective_value, 2))

# 5. FVA: the glucose bound is binding at optimum, oxygen loosens off it
f100 = flux_variability_analysis(m, [glc.id, o2.id], fraction_of_optimum=1.0)
f90 = flux_variability_analysis(m, [glc.id, o2.id], fraction_of_optimum=0.9)
print("FVA 100%    :", f100.round(3).values.tolist(), "| 90%:", f90.round(3).values.tolist())

# 6. knockouts: sole gene (ERG13), isozyme (TDH3), and a model gap (FBA1, lethal in vivo)
ko = single_gene_deletion(m, ["YML126C", "YGR192C", "YKL060C"]).assign(gene=lambda d: d.ids.map(lambda s: next(iter(s))))
ko = ko.set_index("gene")
print("knockouts   :", ko.growth.round(4).sort_index().to_dict(), ko.status.unique().tolist())

assert abs(sol.fluxes[glc.id] + 1.0) < 1e-9
assert mu10 / mu > 10 and abs((mu10 - mu) / 9 - yield_no_maint) < 1e-6
assert abs(p.fluxes["r_2111"] - mu) < 1e-6 and p.objective_value <= sol.fluxes.abs().sum() + 1e-6
assert abs(f100.loc[glc.id, "minimum"] + 1) < 1e-6 and abs(f100.loc[glc.id, "maximum"] + 1) < 1e-6
assert f90.loc[o2.id, "maximum"] - f90.loc[o2.id, "minimum"] > f100.loc[o2.id, "maximum"] - f100.loc[o2.id, "minimum"]
assert ko.loc["YML126C", "growth"] < 1e-6 and abs(ko.loc["YGR192C", "growth"] - mu) < 1e-6
print("all checks passed")
```

**Expect**

Invariants (a failure means the skill is wrong):

- Item assignment on `m.medium` leaves the oxygen bound at -1000.
- Glucose uptake appears as flux -1.0, the medium's limit.
- Ten times the glucose gives more than ten times the growth. The slope between the two
  points equals the yield with maintenance switched off.
- Forcing maintenance to 50 gives status `infeasible`, and `slim_optimize()` gives NaN.
- pFBA keeps growth and does not increase total flux. At 100% of optimum the glucose
  exchange is pinned at -1, and the oxygen range widens at 90%.
- Knocking out ERG13 (`YML126C`, single gene) abolishes growth. Knocking out TDH3
  (`YGR192C`, one of three isozymes) leaves it unchanged.

Observed on 2026-11-06 with cobra 0.32.1, GLPK and yeast-GEM 9.1.1. These are numbers to
compare against, not assertions:

```
model       : yeastGEM_v9__46__1__46__1 4105 reactions, 1143 genes; glucose uptake 1.0
FBA         : growth 0.0811 /h, doubling 8.5 h, glucose flux -1.0
glucose 10x : growth 0.8386 ratio 10.341 | slope 0.08417 vs 0.08417
infeasible  : status infeasible objective -0.1886131660123251 | slim nan
pFBA        : growth 0.0811 total |flux| 101.76 -> 100.76
FVA 100%    : [[-1.0, -1.0], [-2.352, -2.352]] | 90%: [[-1.0, -0.904], [-2.726, -2.071]]
knockouts   : {'YGR192C': 0.0811, 'YKL060C': 0.0805, 'YML126C': 0.0} ['optimal']
all checks passed
```

The infeasible `objective` is whatever the solver stopped at. It will differ between
solvers and versions, which is exactly why the code must not read it.

## Sources

- COBRApy: https://github.com/opencobra/cobrapy (LGPL-2.0-or-later or GPL-2.0-or-later).
  Documentation at https://cobrapy.readthedocs.io
- Ebrahim A et al. (2013) COBRApy: COnstraints-Based Reconstruction and Analysis for Python.
  *BMC Systems Biology* 7:74. https://doi.org/10.1186/1752-0509-7-74
- Orth JD, Thiele I, Palsson BØ (2010) What is flux balance analysis? *Nature Biotechnology*
  28:245–248. https://doi.org/10.1038/nbt.1614
- Lewis NE et al. (2010) Omic data from evolved E. coli are consistent with computed optimal
  growth from genome-scale models (pFBA). *Molecular Systems Biology* 6:390.
  https://doi.org/10.1038/msb.2010.47
- Gudmundsson S, Thiele I (2010) Computationally efficient flux variability analysis.
  *BMC Bioinformatics* 11:489. https://doi.org/10.1186/1471-2105-11-489
- Saa PA, Nielsen LK (2016) Fast-SNP: a fast matrix pre-processing algorithm for efficient
  loopless flux optimization of metabolic models. *Bioinformatics* 32:3807–3814.
  https://doi.org/10.1093/bioinformatics/btw555
- King ZA et al. (2016) BiGG Models: a platform for integrating, standardizing and sharing
  genome-scale models. *Nucleic Acids Research* 44:D515–D522. https://doi.org/10.1093/nar/gkv1049
  License terms at https://bigg.ucsd.edu/license and https://bigg.bio/about
- Lu H et al. (2019) A consensus S. cerevisiae metabolic model Yeast8 and its ecosystem for
  comprehensively probing cellular metabolism. *Nature Communications* 10:3586.
  https://doi.org/10.1038/s41467-019-11581-3. Repository: https://github.com/SysBioChalmers/yeast-GEM
