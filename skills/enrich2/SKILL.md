---
name: enrich2
description: Score variants from deep mutational scanning and other selection experiments with Enrich2 — describe libraries, selections and conditions as JSON, pick a log-ratio or regression scoring method, and combine replicates into scored tables.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [deep-mutational-scanning, variant-effect, selection, enrich2, regression]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-12
  against: Enrich2 2.0.2 / pandas 3.0.6 / numpy 2.5.4 / PyTables 3.11.1 / Python 3.12.3
  executed: 8
  unverified: 0
---
# Enrich2

## Overview

Enrich2 turns read counts from a selection experiment into per-variant scores with
standard errors. It was built for deep mutational scanning — a library of variants put
through selection and sequenced at several time points — and the statistics it implements
are described in Rubin, Gelman, Lucas et al., *A statistical framework for analyzing deep
mutational scanning data*, Genome Biology 18:150 (2017), doi:10.1186/s13059-017-1272-5.

Two things make it worth knowing rather than reimplementing. It fits a **weighted linear
regression across three or more time points** instead of taking a single before/after
ratio, which uses the whole trajectory and down-weights variants seen in few reads. And it
propagates a standard error all the way up from each individual library to the combined
per-condition score, so a variant counted twenty times is not reported with the same
confidence as one counted twenty thousand times.

Use it when you have counts (or FASTQ) from a selection at two or more time points and want
scores with errors. Do not reach for it to call differential expression, or to score a
single variant with no library context — it is a library-scale estimator and its variance
model assumes that.

## What a reader needs before starting

- **The tool is BSD-3-Clause** and installs from PyPI. No account, no key, no GPU, no
  container.
- **`enrich_cmd` needs Tk present even though it never opens a window.** The command-line
  entry point imports the GUI configurator at module scope, so on a machine without
  `tkinter` every invocation — including `enrich_cmd --help` — dies with
  `ModuleNotFoundError: No module named 'tkinter'`. Tk ships with CPython on Windows and
  macOS; on Debian and Ubuntu it is a separate package (`apt-get install python3-tk`), and
  headless server and container images routinely omit it. Install it into the same Python
  minor version you installed Enrich2 under — a `python3-tk` built for 3.12 does nothing
  for a 3.11 virtual environment.

```bash
pip install "Enrich2==2.0.2"
# Debian/Ubuntu, and any headless image without Tk:
#   apt-get install -y python3-tk
```

Confirm the install and read the scoring vocabulary off the tool itself:

```bash
enrich_cmd --version
enrich_cmd --help
```

## How a run is described

Everything is one JSON config file. Enrich2 decides **what kind of object you handed it by
which keys are present** — there is no `"type"` field — so a typo in a key name does not
produce a validation error, it silently changes the analysis into a different one.

| the config contains | Enrich2 treats it as | what it gives you |
|---|---|---|
| `conditions` | Experiment | per-condition scores, replicates combined |
| `selections` | Condition | one condition's replicates |
| `libraries` | Selection | one replicate scored across its time points |
| `fastq` or `identifiers` | SeqLib | counts for a single sequencing library |

Nesting is strict and top-down — an Experiment holds Conditions, which hold Selections,
which hold libraries. You may run the config at any level, which is the fastest way to
isolate a problem: score one Selection on its own before asking for the whole Experiment.

Within a SeqLib, the keys again select the class:

| keys | class | for |
|---|---|---|
| `identifiers` | `IdOnlySeqLib` | a counts file keyed by arbitrary names, no sequences |
| `variants` | `BasicSeqLib` | variant calls from single-end reads |
| `variants` + `overlap` | `OverlapSeqLib` | paired reads merged before calling |
| `barcodes` | `BarcodeSeqLib` | barcode counts, no variant mapping |
| `barcodes` with `map file` + `variants` | `BcvSeqLib` | barcodes resolved to variants |
| `barcodes` with `map file` + `identifiers` | `BcidSeqLib` | barcodes resolved to identifiers |

Every library needs `name` and `timepoint` (an integer; it is the x-axis of the
regression, so the spacing matters and is in whatever units you choose — generations,
hours, rounds). `output directory` is set once at the top level and inherited.

## Counts files

The quickest way in is to skip read processing entirely and hand Enrich2 counts you already
have. The format is narrow and the failure modes are worth knowing up front.

- Tab-separated, one header row, the identifier in the **first column** as the index.
- Exactly **one** data column, named **`count`** — singular. A different name fails with
  `ValueError: Invalid column names for counts file [<library name>]`.
  **Enrich2's own documentation gets this wrong**, instructing you to use the heading
  `counts`. The code tests for `count`, and a file headed `counts` is rejected — confirmed
  both ways against 2.0.2 on 2026-10-12. Trust the singular. The index column's own heading
  is not checked, so `id`, an empty leading tab, or anything else all work.
- Accepted extensions are `.tsv`, `.txt`, `.csv` and `.h5`. **A `.csv` is still parsed as
  tab-separated** — the extension is allowed but the delimiter is not negotiable, so a
  genuinely comma-separated file fails deep inside pandas with
  `ValueError: ('Lengths must match to compare', (0,), (1,))`, which names neither the file
  nor the real problem. Write `.tsv` and the question never arises.
- An `.h5` file is read as a previous Enrich2 store, carrying its `/raw` tables and
  metadata across rather than being parsed as text.

Filtering is per library — `"identifiers": {"min count": 10}` drops anything below the
threshold before scoring.

## Scoring methods

`enrich_cmd` takes the config, a **scoring method** and a **log-ratio method**, all three
positional and in that order.

Scoring methods, as the tool lists them:

| method | what it does | time points needed |
|---|---|---|
| `WLS` | weighted least squares regression on the trajectory | 3 or more |
| `OLS` | ordinary least squares, unweighted | 3 or more |
| `ratios` | log ratio, first to last time point | 2 or more |
| `simple` | the original Enrich log-ratio definition | 2 or more |
| `counts` | no scoring at all, counts only | 1 or more |

Asking for a regression with only two time points is refused outright, with
`ValueError: Insufficient number of timepoints for regression scoring [<name>]`. That is
the right behaviour — a line through two points has no residual and so no honest standard
error — but it means a two-point experiment is a `ratios` experiment, decided by the design
rather than by preference.

The log-ratio method sets what each count is measured *against*, and this is the choice
that most changes the answer:

- **`wt`** — against the wild-type variant's own count. The usual choice for a protein DMS,
  because it measures each variant relative to the unselected parent rather than to the
  library's composition. It requires a wild type to be present in the data; with an
  identifier-only library there is none, and the run stops with
  `ValueError: Failed to use wild type log ratio method, wild type sequence not present
  [<name>]`.
- **`complete`** — against the summed counts of variants seen at every time point.
- **`full`** — against all reads, including variants missing from some time points.

For `complete`, the score is a plain difference of logs with a half-count added to every
term:

    score = ln((count + 0.5) / (column total + 0.5)) at the last time point
          - ln((count + 0.5) / (column total + 0.5)) at the first

The half-count is not cosmetic — it is what keeps a variant that falls to zero reads from
producing an infinite score. It also means a reported score is always slightly shrunk
toward zero relative to the naive ratio, most visibly for the low-count variants where that
shrinkage is the point. The `## Try it` section below recomputes this from the counts and
checks it against what Enrich2 wrote.

## Running it

    enrich_cmd <config.json> <scoring method> <log ratio method>

for example:

    enrich_cmd config.json ratios complete --no-plots

Useful flags, all confirmed against 2.0.2 — `--no-plots` (skip the PDF figures),
`--no-tsv` (HDF5 only, no text output), `--recalculate` (force recomputation instead of
reusing what is already in the store), `--output-dir DIR` (override the config's
`output directory`), `--log FILE`, `--component-outliers`, and `--sfmap-aa-file FILE`.

## Reading the output

Each object writes an HDF5 store named after it with a type suffix — `*_lib.h5` for a
library, `*_sel.h5` for a selection, `*_exp.h5` for an experiment — plus, unless you passed
`--no-tsv`, a `tsv/` directory with one subdirectory per object. The HDF5 store is the real
output; the TSVs are a convenience view of it.

What lands in the score tables depends on the method, so check the columns rather than
assuming them:

- A **selection** scored with `ratios` gives `score`, `SE`, `logratio`, `variance`, where
  `score` and `logratio` are equal.
- A **selection** scored with `WLS` or `OLS` gives `score`, `SE`, `SE_pctile`, `slope`,
  `intercept`, `SE_slope`, `t`, `pvalue_raw`, and here `score` is the fitted `slope`.
- An **experiment** gives per-condition `score`, `SE` and `epsilon` (the convergence
  residual of the random-effects fit, typically tiny).

The experiment-level TSV is the one that catches people. Its header is **two rows** — the
condition name over the quantity — so it is a pandas `MultiIndex`, and reading it with the
default single-row header silently mislabels every column. Pass `header=[0, 1]`; the
worked example is at the end of the next section.

Enrich2 also reports `Failed to find wild type score, skipping wild type p-value
calculations` and carries on. On an identifier-only run that is expected and not a problem;
on a variant run with `wt` it means the wild type did not survive your own count filter,
and the scores are not relative to what you think they are.

## Try it

A self-contained check that this skill still works. No account, no key, no network beyond
the install, and nothing to download — the counts are written by the block itself, which is
why this skill declares `datasets: []`. Real public DMS counts would be better at catching
an upstream schema change, but the behaviour under test here is Enrich2's own arithmetic,
and inline data makes that exactly reproducible.

**Data** — five identifiers at two time points, written inline. `var_A` rises against a
falling library, `var_E` collapses to a fifth of its starting count.

```bash
pip install "Enrich2==2.0.2"
# Debian/Ubuntu, and any headless image without Tk:
#   apt-get install -y python3-tk
```

**Run** — writes the counts and the config, scores them, then recomputes the log ratio
independently and compares. Routed through the two traps on purpose: the count column must
be named `count`, and `complete` carries the half-count correction.

```python
import json, math, subprocess, sys

import pandas as pd

c0 = {"var_A": 1000, "var_B": 800, "var_C": 600, "var_D": 400, "var_E": 200}
c1 = {"var_A": 1500, "var_B": 760, "var_C": 300, "var_D": 120, "var_E": 40}

# The column MUST be called `count` -- `counts` or `reads` is rejected.
for name, counts in (("t0.tsv", c0), ("t1.tsv", c1)):
    with open(name, "w") as fh:
        fh.write("id\tcount\n")
        for k, v in counts.items():
            fh.write(f"{k}\t{v}\n")

cfg = {
    "name": "try it selection",
    "output directory": "results",
    "libraries": [
        {"name": "T0", "timepoint": 0, "identifiers": {}, "counts file": "t0.tsv"},
        {"name": "T1", "timepoint": 1, "identifiers": {}, "counts file": "t1.tsv"},
    ],
}
with open("config.json", "w") as fh:
    json.dump(cfg, fh, indent=2)

# Two time points, so `ratios` -- a regression method would be refused here.
run = subprocess.run(
    ["enrich_cmd", "config.json", "ratios", "complete", "--no-plots"],
    capture_output=True, text=True,
)
if run.returncode != 0:
    sys.exit(f"enrich_cmd failed\n{run.stdout}\n{run.stderr}")

scores = pd.read_csv(
    "results/tsv/try_it_selection_sel/main_identifiers_scores.tsv",
    sep="\t", index_col=0,
)
print("columns:", list(scores.columns))

# Invariant: `complete` is a difference of logs with +0.5 on every term.
T0, T1 = sum(c0.values()), sum(c1.values())
worst = 0.0
for k in c0:
    expected = (math.log((c1[k] + 0.5) / (T1 + 0.5))
                - math.log((c0[k] + 0.5) / (T0 + 0.5)))
    worst = max(worst, abs(expected - scores.loc[k, "score"]))
print(f"max |recomputed - reported| = {worst:.2e}")
assert worst < 1e-12, "log-ratio definition no longer matches"

# Invariant: score equals logratio for this method, and SE rises as counts fall.
assert (scores["score"] == scores["logratio"]).all()
assert scores.loc["var_E", "SE"] > scores.loc["var_A", "SE"]
# Invariant: the half-count shrinks every score toward zero vs the naive ratio.
naive_A = math.log(c1["var_A"] / T1) - math.log(c0["var_A"] / T0)
assert abs(scores.loc["var_A", "score"]) < abs(naive_A)

print(scores[["score", "SE"]].round(4).to_string())
print("ordered A>B>C>D>E:", list(scores["score"].sort_values(ascending=False).index))
```

**Expect** — three invariants and one set of observed values.

*Invariants* (a failure here means this skill is wrong):

- The recomputed log ratio matches Enrich2's `score` to within 1e-12.
- `score` and `logratio` are identical for the `ratios` method, `SE` is larger for the
  low-count `var_E` than for `var_A`, and the half-count makes every score smaller in
  magnitude than the naive ratio.
- Scores order `var_A > var_B > var_C > var_D > var_E`, matching the counts.

*Observed, Enrich2 2.0.2 on 2026-10-12* (drift to investigate, not a bug):

```
columns: ['score', 'SE', 'logratio', 'variance']
max |recomputed - reported| = 5.55e-16
        score      SE
id
var_A  0.5033  0.0486
var_B  0.0467  0.0571
var_C -0.5944  0.0755
var_D -1.1031  0.1072
var_E -1.5015  0.1743
ordered A>B>C>D>E: ['var_A', 'var_B', 'var_C', 'var_D', 'var_E']
```

The residual is floating-point noise, not a discrepancy — it is the cost of recomputing
the same logarithms in a different order, and it is why the assertion above tests against
1e-12 rather than demanding exact equality.

## Scoring a real experiment

A single selection is one replicate. The point of the Experiment level is to combine
replicates into one score per condition, with a random-effects fit that accounts for both
the within-replicate standard errors and the scatter between replicates.

```python
import json
from pathlib import Path

# Six counts files -- two replicates x three time points -- written inline so this
# section runs on its own. Replicate 2 is the same selection, measured independently.
series = {
    (1, 0): {"var_A": 1000, "var_B": 800, "var_C": 600, "var_D": 400, "var_E": 200},
    (1, 1): {"var_A": 1200, "var_B": 780, "var_C": 420, "var_D": 240, "var_E": 90},
    (1, 2): {"var_A": 1500, "var_B": 760, "var_C": 300, "var_D": 120, "var_E": 40},
    (2, 0): {"var_A": 1000, "var_B": 800, "var_C": 600, "var_D": 400, "var_E": 200},
    (2, 1): {"var_A": 1150, "var_B": 790, "var_C": 440, "var_D": 260, "var_E": 100},
    (2, 2): {"var_A": 1420, "var_B": 770, "var_C": 320, "var_D": 140, "var_E": 50},
}
for (rep, tp), counts in series.items():
    rows = "".join(f"{k}\t{v}\n" for k, v in counts.items())
    Path(f"r{rep}_t{tp}.tsv").write_text("id\tcount\n" + rows)

def library(rep, tp):
    return {"name": f"rep{rep} T{tp}", "timepoint": tp, "identifiers": {},
            "counts file": f"r{rep}_t{tp}.tsv"}

# Three time points per replicate is what makes WLS available at all.
cfg = {
    "name": "demo experiment",
    "output directory": "results",
    "conditions": [{
        "name": "selected",
        "selections": [
            {"name": f"replicate {rep}", "libraries": [library(rep, tp) for tp in (0, 1, 2)]}
            for rep in (1, 2)
        ],
    }],
}
Path("experiment.json").write_text(json.dumps(cfg, indent=2))
print("conditions:", [c["name"] for c in cfg["conditions"]])
print("selections :", [s["name"] for s in cfg["conditions"][0]["selections"]])
```

```bash
enrich_cmd experiment.json WLS complete --no-plots
```

Now read the combined per-condition scores, with the two-row header handled correctly:

```python
import pandas as pd

scores = pd.read_csv(
    "results/tsv/demo_experiment_exp/main_identifiers_scores.tsv",
    sep="\t", header=[0, 1], index_col=0,
)
print("columns:", list(scores.columns))
print(scores[("selected", "score")].round(3).to_string())

# Reading it with the default header mislabels everything -- one row, no scores.
naive = pd.read_csv(
    "results/tsv/demo_experiment_exp/main_identifiers_scores.tsv",
    sep="\t", index_col=0,
)
print("naive header gives columns:", list(naive.columns))
```

Run the same config with `OLS` to see how much of a score depends on the weighting, and
with `counts` to get the merged count table alone — useful as a sanity check before
committing to a scoring model, since it writes
`tsv/<experiment>/main_identifiers_counts.tsv` and nothing else.

## Troubleshooting

Each of these was reproduced against 2.0.2; the message is what you will actually see.

```bash
printf 'id\tcount\nvar_A\t1000\nvar_B\t800\n' > tp0.tsv
printf 'id\tcount\nvar_A\t1500\nvar_B\t760\n' > tp1.tsv
cat > two_timepoints.json <<'JSON'
{ "name": "two timepoints", "output directory": "err_results",
  "libraries": [
    {"name": "T0", "timepoint": 0, "identifiers": {}, "counts file": "tp0.tsv"},
    {"name": "T1", "timepoint": 1, "identifiers": {}, "counts file": "tp1.tsv"}
  ] }
JSON

# A regression method on two time points -- a design problem, not a bug.
# Grep the exception line: Enrich2 can emit an UnclosedFileWarning after it, so the
# error is not reliably the last line of output.
enrich_cmd two_timepoints.json WLS complete --no-plots 2>&1 | grep -E "^ValueError" | tail -1

# `wt` log ratios with no wild type in the data (any identifier-only library).
enrich_cmd two_timepoints.json ratios wt --no-plots 2>&1 | grep -E "^ValueError" | tail -1
```

The two commands above print, respectively:

```
ValueError: Insufficient number of timepoints for regression scoring [two timepoints]
ValueError: Failed to use wild type log ratio method, wild type sequence not present [two timepoints]
```

- `ModuleNotFoundError: No module named 'tkinter'` — Tk is missing for *this* interpreter.
  See the requirements section above; it is not an Enrich2 configuration problem.
- `ValueError: Invalid column names for counts file [...]` — the data column is not named
  `count`.
- `ValueError: ('Lengths must match to compare', (0,), (1,))` — a comma-separated file with
  a `.csv` extension. Convert it to tab-separated.
- `IOError: Counts file '...' not found` — relative paths in the config resolve against the
  working directory you launch from, not the config file's location. Run from the config's
  directory, or write absolute paths.
- Scores that do not change after you edit the counts — Enrich2 reuses the existing HDF5
  store when it finds one. Pass `--recalculate`, or write to a fresh `--output-dir`.
