---
name: moltenprot
description: Fit protein thermal unfolding curves — DSF, nanoDSF, CD — with the standalone MoltenProt CLI for an apparent free energy of unfolding, not just a melting temperature. Use to rank constructs, buffers or ligands whose melts are too close to separate.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [thermal-stability, dsf, nanodsf, circular-dichroism, curve-fitting]
datasets: [https://raw.githubusercontent.com/kvr2007/moltenprot/master/moltenprot/demo_data/Ratio96.csv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-06
  against: moltenprot 0.4.1b0 from git master commit 20d9382 / pandas 2.3.3 / numpy 2.4.6 / scipy 1.17.1 / Python 3.11.17 on Linux x86_64
  executed: 14
  unverified: 0
---

# MoltenProt — rank stability, not melting temperature

A thermal shift assay gives you a curve per well. The usual readout is one number
off that curve, the melting temperature, and most of the time it is enough. When it
is not — two constructs melting within a tenth of a degree of each other, a buffer
screen where the top hits all land on the same plateau — a melting temperature has
nothing left to say and the ranking becomes noise.

MoltenProt fits a thermodynamic model to the whole curve instead of locating its
midpoint. That yields an unfolding enthalpy, and from it an apparent free energy of
unfolding extrapolated to 25 °C. **Two wells with the same melting temperature can
differ several-fold in that free energy**, and the worked example below is a real
pair out of a 96-well plate that differ by 0.08 °C in melting temperature and
24.6 kJ/mol in apparent stability.

It reads plate data as exported — nanoDSF instrument spreadsheets, plain CSV from
anything else, and wavelength-resolved CD or fluorescence spectra — and writes CSV
tables you can rank directly.

**The word "apparent" is doing real work.** The free energy this reports is a
model-dependent extrapolation from a non-equilibrium measurement, not a calorimetric
measurement. It is a *better ranking statistic* than a melting temperature for
samples of the same protein under different conditions. It is not a substitute for
isothermal titration calorimetry or differential scanning calorimetry, and comparing
it between unrelated proteins is not meaningful.

## What you need, before anything runs

Nothing to buy, register for, or accept. No API key, no account, no GPU — the fit is
CPU-only and a 96-well plate takes seconds.

One wrinkle at the install step: **MoltenProt is not on PyPI.** `pip install
moltenprot` fails. You install it from its git repository or from a wheel attached to
a GitHub release. The standalone application is **GPL-3.0**, which permits commercial
use, and it is what this skill documents.

Be deliberate about which MoltenProt you are using. The same fitting is also offered
through a separately hosted web service run by a third party, and a hosted service
carries its own terms of use independent of the GPL on this code. If you are
considering the web version, read its terms yourself — this skill makes no claim
about them, and the command-line tool below needs no such check.

## Install

```bash
python3 -m venv mp-venv
source mp-venv/bin/activate
pip install "moltenprot[multiproc]@git+https://github.com/kvr2007/moltenprot.git@master"
moltenprot --help | head -3
```

`[multiproc]` adds `joblib`, which is what `-j` needs to fit wells in parallel.
There is also a `[gui]` extra that pulls in Qt; skip it for scripted use. The
dependency set is otherwise just pandas, numpy, scipy, matplotlib and the two Excel
readers, all from PyPI.

To confirm the install beyond the help text, `python -m moltenprot.test` runs the
project's own test suite. Expect a single failure in its command-line test when
`moltenprot` is not on `PATH` — that test shells out by name, so it fails inside a
non-activated virtual environment while the other tests pass.

## Three input shapes, and the one you have decides your flags

```bash
curl -sO https://raw.githubusercontent.com/kvr2007/moltenprot/master/moltenprot/demo_data/Ratio96.csv
curl -sO https://raw.githubusercontent.com/kvr2007/moltenprot/master/moltenprot/demo_data/Ratio_F330_F350_Scattering48.xlsx
curl -sO https://raw.githubusercontent.com/kvr2007/moltenprot/master/moltenprot/demo_data/CD_spectrum.csv

# An instrument spreadsheet carries several readouts. Ask which, before you fit.
moltenprot -i Ratio_F330_F350_Scattering48.xlsx --print_readouts
```

That prints `Ratio 330nm 350nm Scattering deltaF` for this file. Each readout is
fitted separately and gets its own results table, so excluding the ones you do not
want is the difference between one fit and five.

- **Plain CSV** — first column temperature, one column per sample. Name the signal
  with `--readout` so the output files are labelled; `-d C` or `-d K` sets the
  temperature scale of the *input*. Use `--sep` and `--dec` if your export is
  semicolon-and-comma rather than comma-and-point.
- **Instrument XLSX** — readouts and any plate annotations are read out of the file.
  Add `--raw` if you exported the raw rather than the processed sheet, `--panta-rhei`
  for a Panta export, `--refold` if the run included a refolding ramp.
- **Spectrum CSV** — `--spectrum` reinterprets the columns as wavelengths rather
  than samples, so each wavelength is fitted as its own unfolding curve. This is the
  path for CD and for wavelength-resolved fluorescence.

## Running a plate

```bash
moltenprot -i Ratio96.csv -o out96 --readout Ratio -j 4
ls out96/Ratio96/
```

Output lands in `<output>/<input-basename>/` and, per readout, you get
`<readout>_results.csv` (one row per well, the fitted parameters), a matching
`_results_stdev.csv` of standard errors, the preprocessed and fitted curves, and
`MP_session.json`, which is the whole session and is what to keep if you want to
reopen the analysis rather than re-fit it.

`-r pdf|xlsx|html` adds a report, `--genpics` writes per-well plots, `--heatmaps all`
writes plate heatmaps. None of them are needed to get the numbers.

## "Fatal" does not mean a non-zero exit code

This is the trap that matters most for anything automated, and it is the one a
reader of the documentation would not find.

**MoltenProt prints `Fatal:` and exits 0** for a missing input file, for an output
folder that already exists, and for a readout name it does not recognise. Only an
argument-parsing failure, or an unhandled Python exception, gives you a non-zero
status.

```bash
moltenprot -i no_such_file.csv -o e1 ; echo "missing input   -> rc=$?"
moltenprot -i Ratio96.csv -o out96 --readout Ratio ; echo "folder exists   -> rc=$?"
moltenprot -i Ratio_F330_F350_Scattering48.xlsx -o e2 --exclude_readout Nonsense ; echo "bad readout     -> rc=$?"
moltenprot -o e3 ; echo "no input at all -> rc=$?"
```

The first three print `rc=0`. So **do not gate on the exit status.** Check that the
results file you expect actually exists:

```bash
test -s out96/Ratio96/Ratio_results.csv || { echo "fit produced no results"; exit 1; }
```

Two related notes. The existing-folder refusal is why `-f` exists; it is a guard
against silently overwriting a previous fit, not an error to work around blindly.
And a malformed `--dec` does not come back as a clean message — it surfaces as a
`TypeError` from inside numpy's `polyfit`, because the columns parsed as strings.
A traceback mentioning `polyfit` almost always means the separator flags are wrong
for the file.

## Reading the results table

Three things about this table will bite you if you assume otherwise.

```python
import pandas as pd

r = pd.read_csv("out96/Ratio96/Ratio_results.csv", index_col=0)
print("shape:", r.shape)
print("columns:", list(r.columns))

# 1. Temperatures are in KELVIN, whatever scale the input used.
r["Tm_C"] = r["Tm_fit"] - 273.15
r["T_onset_C"] = r["T_onset"] - 273.15
print("\nTm range, K:", round(r.Tm_fit.min(), 2), "-", round(r.Tm_fit.max(), 2))
print("Tm range, C:", round(r.Tm_C.min(), 2), "-", round(r.Tm_C.max(), 2))

# 2. Rows are sorted by the model's own ranking statistic, NOT in plate order.
print("\nfirst five rows:", list(r.index[:5]))
print("sorted by dG_std descending:", r.dG_std.is_monotonic_decreasing)

# 3. Energies are in J/mol, not kJ/mol.
print("\ndG_std range, kJ/mol:", round(r.dG_std.min()/1000, 1), "-", round(r.dG_std.max()/1000, 1))
print(r[["Tm_C", "T_onset_C", "dG_std", "BS_factor"]].head(5).round(3).to_string())
```

Because of point 2, **never take a well identity from a row position.** Index by the
well label. The sort key is a property of the model, and the order genuinely moves
when you change fitting options — the same plate refitted with a different heat
capacity reorders the table while every fitted value per well stays put.

The columns that matter, for the default two-state equilibrium model:

| column | what it is |
|---|---|
| `Tm_fit` | melting temperature, **K** |
| `dHm_fit` | van't Hoff unfolding enthalpy at `Tm_fit`, **J/mol** |
| `T_onset` | temperature at which 1% is unfolded, **K** — derived from `Tm_fit` and `dHm_fit` |
| `dG_std` | apparent free energy of unfolding at 298.15 K, **J/mol** — the ranking statistic |
| `S` | standard error of the fit; **lower is a better fit** |
| `BS_factor` | dimensionless signal window; **higher is better**, and this is what to filter on |
| `*_init` | the pre-fit starting estimates, not results — ignore them unless a fit failed |

Two of those are derived in closed form, which means you can check them rather than
trust them:

```python
import numpy as np, pandas as pd

r = pd.read_csv("out96/Ratio96/Ratio_results.csv", index_col=0)
T_std, R = 298.15, 8.314

# dG_std at dCp = 0 is the Becktel-Schellman extrapolation from Tm and dHm.
recomputed = r.dHm_fit * (1 - T_std / r.Tm_fit)
print("max |recomputed - reported| dG_std, J/mol:",
      float((recomputed - r.dG_std).abs().max()))

# T_onset is Tm shifted to the temperature where the unfolded fraction is 1%.
onset = 1 / (1 / r.Tm_fit - R / r.dHm_fit * np.log(0.01 / 0.99))
print("max |recomputed - reported| T_onset, K:",
      float((onset - r.T_onset).abs().max()))
```

Both come back at numerical zero. That is also the proof of the units: the identity
only closes with `Tm_fit` in kelvin and the energies in J/mol.

## The heat capacity change is zero by default, and that inflates every dG_std

MoltenProt tells you this on every run — `One or more dCp values are set to 0; this
results in an overestimate of dG_std` — and it is easy to read past.

The extrapolation from the melting temperature down to 25 °C needs the heat capacity
change of unfolding. With it left at zero the extrapolation is linear in temperature
and overshoots. Supply a value in J/mol/K with `--dCp` if you have one, or per sample
through a layout file.

```bash
moltenprot -i Ratio96.csv -o outdcp --readout Ratio --dCp 8000 -j 4
```

```python
import pandas as pd

a = pd.read_csv("out96/Ratio96/Ratio_results.csv", index_col=0)
b = pd.read_csv("outdcp/Ratio96/Ratio_results.csv", index_col=0).reindex(a.index)

print("melting temperatures unchanged:", bool((a.Tm_fit - b.Tm_fit).abs().max() < 1e-9))
print("dG_std lower everywhere with dCp > 0:", bool((b.dG_std < a.dG_std).all()))
print("mean reduction: %.0f J/mol (%.1f%%)"
      % ((a.dG_std - b.dG_std).mean(),
         100 * ((a.dG_std - b.dG_std) / a.dG_std).mean()))
print("rank agreement, Spearman:", round(a.dG_std.corr(b.dG_std, method="spearman"), 4))
print("top five, dCp=0   :", list(a.index[:5]))
print("top five, dCp=8000:", list(b.sort_values('dG_std', ascending=False).index[:5]))
```

The practical reading of this, on the demo plate: the choice moves every value by
tens of percent but barely moves the ordering. So a *relative* ranking within one
plate survives leaving `dCp` at zero; an *absolute* free energy does not, and should
not be quoted from a default-settings run. It also does not touch the melting
temperatures at all, which is the clue that it affects only the extrapolation.

## Filter on the signal window before you believe a ranking

A fit converges on a bad well as readily as on a good one. `BS_factor` is the
dimensionless size of the signal change relative to the scatter, and it is the
column to screen on — not `S`, which is scale-dependent.

```python
import pandas as pd

r = pd.read_csv("out96/Ratio96/Ratio_results.csv", index_col=0)
print("BS_factor range: %.3f - %.3f" % (r.BS_factor.min(), r.BS_factor.max()))
print("wells below 0.8:", int((r.BS_factor < 0.8).sum()), "of", len(r))

keep = r[r.BS_factor >= 0.8]
print("\ntop three by dG_std, after filtering:")
print(keep.nlargest(3, "dG_std")[["Tm_fit", "dG_std", "BS_factor"]].round(2).to_string())
print("\nhighest melting temperature of all:")
print(r.nlargest(1, "Tm_fit")[["Tm_fit", "dG_std", "BS_factor"]].round(2).to_string())
```

0.8 is a starting point, not a standard — look at the distribution for your own
assay and plot the curves for anything you exclude. The point of the last two
blocks together is the one the tool exists for: on this plate the well with the
highest melting temperature is **not** the one with the highest apparent stability.

Read those two outputs against each other. On the demo plate the hottest well is
also one of the five the filter drops — its signal window is 0.60, so part of why it
looks hot is that its curve is poorly resolved. That is the honest version of the
claim, and it survives the filter: among the wells that pass, the highest melting
temperature and the highest `dG_std` are still different wells.

## Other input shapes

```bash
# An instrument export, fitting only the two readouts worth fitting.
moltenprot -i Ratio_F330_F350_Scattering48.xlsx -o outx \
  --exclude_readout 330nm 350nm deltaF -j 4
ls outx/Ratio_F330_F350_Scattering48/

# A CD melt, one fit per wavelength.
moltenprot -i CD_spectrum.csv -o outcd --spectrum --readout CD -j 4
head -1 outcd/CD_spectrum/CD_results.csv
```

Note what comes back from the scattering readout. Aggregation is irreversible, so it
is fitted with an empirical model by default rather than the equilibrium one, and
**that table has no `dG_std` column at all** — it reports `T_onset_fit`, `Tm_fit` and
a combined `T_eucl` instead. The available columns follow from the model, so check
the header rather than assuming. `--model_sct` overrides the model used for
scattering; `--model` sets it for everything else.

The models are selected by name: `santoro1988` (two-state equilibrium, the default,
ranks on `dG_std`), `santoro1988i` (three-state equilibrium, ranks on
`dG_comb_std`), `santoro1988d` and `santoro1988di` (empirical two- and three-state,
rank on a combined temperature `T_eucl`), `irrev` and `lumry_eyring` (kinetic, rank
on a rate constant), and `skip` to preprocess without fitting. **Only the two
equilibrium models produce a free energy** — if `dG_std` is the reason you reached
for this tool, do not change `--model` away from them without expecting the column
to vanish.

## The Python API, when you want the fit in memory

The CLI writes files. For a pipeline that would only read them straight back in,
drive it directly instead.

```python
import moltenprot.core as mp

session = mp.parse_plain_csv("Ratio96.csv", readout="Ratio")
session.SetAnalysisOptions(model="santoro1988", dCp=0, savgol=10, baseline_fit=10)
session.PrepareAndAnalyseAll(n_jobs=4)

results = session.datasets["Ratio"].plate_results
print("readouts:", list(session.datasets))
print("shape:", results.shape)
print(results[["Tm_fit", "dG_std", "BS_factor"]].head(3).round(3).to_string())
print("standard temperature:", mp.T_std, "K | gas constant:", mp.R, "J/mol/K")
```

The parser you want depends on the input, mirroring the three shapes above:
`parse_plain_csv`, `parse_prom_xlsx`, `parse_spectrum_csv`. Each returns a session
holding one fit object per readout, keyed by readout name in `.datasets` — so the
results live at `session.datasets["<readout>"].plate_results` and not on the session
itself. `WriteOutputAll` writes the same files the CLI does.

Expect `RuntimeWarning: overflow encountered in exp` on the way through. The fitter
evaluates the model well outside its sensible range while searching, numpy says so,
and it does not indicate a bad fit — judge that from `BS_factor` and `S`.

## Try it

A cold check that this skill still holds, from one public file and nothing else.
No account, no key, no GPU. Needs network access twice, to install and to fetch.

**Data** — `Ratio96.csv`, the 96-well nanoDSF demo plate distributed in the
MoltenProt repository (1137 temperature points, 96 wells, a 330/350 nm fluorescence
ratio). It ships inside the GPL-3.0 source tree, so anyone who can get the tool can
get the data. Last confirmed reachable 2026-10-06.

    https://raw.githubusercontent.com/kvr2007/moltenprot/master/moltenprot/demo_data/Ratio96.csv

The example routes through all three traps: a fatal error that exits 0, kelvin
temperatures, and a results table whose row order is a ranking rather than the plate.

**Run**

```bash
python3 -m venv mp-check && . mp-check/bin/activate
pip install -q "moltenprot[multiproc]@git+https://github.com/kvr2007/moltenprot.git@master"
curl -sO https://raw.githubusercontent.com/kvr2007/moltenprot/master/moltenprot/demo_data/Ratio96.csv

# The trap, first: a fatal error reports success.
moltenprot -i absent.csv -o nowhere ; echo "exit code after a fatal error: $?"

moltenprot -i Ratio96.csv -o out --readout Ratio -j 4
moltenprot -i Ratio96.csv -o out_dcp --readout Ratio --dCp 8000 -j 4
test -s out/Ratio96/Ratio_results.csv && echo "results written"
```

```python
import numpy as np, pandas as pd

r = pd.read_csv("out/Ratio96/Ratio_results.csv", index_col=0)
b = pd.read_csv("out_dcp/Ratio96/Ratio_results.csv", index_col=0).reindex(r.index)
print("wells fitted:", len(r), "| no failed fits:", int(r.Tm_fit.isna().sum()) == 0)

# INVARIANT: temperatures are kelvin. The closed-form identities only hold in kelvin.
T_std, R = 298.15, 8.314
print("max |recomputed - reported| dG_std, J/mol: %.2e"
      % float((r.dHm_fit * (1 - T_std / r.Tm_fit) - r.dG_std).abs().max()))
print("max |recomputed - reported| T_onset, K:    %.2e"
      % float((1 / (1 / r.Tm_fit - R / r.dHm_fit * np.log(0.01 / 0.99)) - r.T_onset).abs().max()))

# INVARIANT: the table is ranked by dG_std, not laid out by plate.
print("ranked by dG_std:", r.dG_std.is_monotonic_decreasing,
      "| plate order:", list(r.index[:3]) == ["A1", "A2", "A3"])

# INVARIANT: dCp only moves the extrapolation, never the melt itself.
print("Tm unchanged by --dCp:", bool((r.Tm_fit - b.Tm_fit).abs().max() < 1e-9),
      "| dG_std lower everywhere:", bool((b.dG_std < r.dG_std).all()))

# THE POINT: two wells, one melting temperature, very different stability.
r["Tm_C"] = r.Tm_fit - 273.15
pair = r.loc[["G7", "G5"], ["Tm_C", "dG_std", "BS_factor"]]
print("\n" + pair.round(3).to_string())
print("dTm = %.3f C ; d(dG_std) = %.1f kJ/mol"
      % (abs(pair.Tm_C.diff().iloc[1]), abs(pair.dG_std.diff().iloc[1]) / 1000))

# OBSERVED: hottest melt is not the most stable well.
print("\nhighest Tm   :", r.Tm_C.idxmax(), "at %.2f C," % r.Tm_C.max(),
      "dG_std %.1f kJ/mol" % (r.dG_std[r.Tm_C.idxmax()] / 1000))
print("highest dG_std:", r.dG_std.idxmax(), "at %.2f C," % r.Tm_C[r.dG_std.idxmax()],
      "dG_std %.1f kJ/mol" % (r.dG_std.max() / 1000))
print("Spearman, Tm vs dG_std:", round(r.Tm_C.corr(r.dG_std, method="spearman"), 3))
```

**Expect**

Invariants — a mismatch here means this skill is wrong:

- `exit code after a fatal error: 0`, printed after a `Fatal:` line saying the file
  does not exist. If this ever becomes non-zero, the skill is out of date in the
  reader's favour and the exit-code section can be simplified.
- 96 wells fitted, none failed.
- Both closed-form identities close to numerical zero (order 1e-10 J/mol and
  1e-13 K). This is simultaneously the units check.
- `ranked by dG_std: True` and `plate order: False`.
- `--dCp` leaves every `Tm_fit` bit-identical and lowers every `dG_std`.
- Wells **G7** and **G5** sit within **0.1 °C** of each other and differ by more
  than **20 kJ/mol** in `dG_std`, both with `BS_factor` above 0.8 so neither is a
  bad fit. This is the claim the tool is for.
- The well with the highest melting temperature is not the well with the highest
  `dG_std`.

Observed on 2026-10-06 with moltenprot 0.4.1b0 at git master commit 20d9382,
pandas 2.3.3, numpy 2.4.6, scipy 1.17.1, Python 3.11.17 — a change in these is drift
to investigate, not a failure:

- G7 is 65.04 °C / 60.4 kJ/mol and G5 is 64.95 °C / 35.9 kJ/mol, a gap of
  24.6 kJ/mol at a melting-temperature difference of 0.082 °C.
- Melting temperatures span 320.93–340.96 K (47.78–67.81 °C); `dG_std` spans
  22.9–68.3 kJ/mol.
- The hottest melt is **E7** at 67.81 °C with 38.2 kJ/mol; the highest `dG_std` is
  **H7** at 65.80 °C with 68.3 kJ/mol. Spearman between the two rankings is **0.783**
  — correlated, and not a substitute for one another.
- E7's `BS_factor` is **0.602**, so it is one of the five wells a 0.8 filter drops.
  Among the wells that pass that filter the hottest is **F1** at 66.31 °C with
  62.5 kJ/mol, still not the highest `dG_std`.
- `--dCp 8000` lowers `dG_std` by a mean of 17397 J/mol (37.7%), with Spearman 0.9495
  against the default run.
- 5 of 96 wells fall below `BS_factor` 0.8.
- The fit takes a few seconds with `-j 4`, and prints the `dCp` warning plus
  `RuntimeWarning: overflow encountered in exp` from the fitter.

## Sources

- Repository and `COPYING` (GPL-3.0): https://github.com/kvr2007/moltenprot
- Releases, including prebuilt wheels and desktop binaries:
  https://github.com/kvr2007/moltenprot/releases
- Kotov V, Mlynek G, Vesper O, et al. *In-depth interrogation of protein thermal
  unfolding data with MoltenProt.* Protein Science (2021). doi:10.1002/pro.3986
- Becktel WJ, Schellman JA. *Protein stability curves.* Biopolymers (1987).
  doi:10.1002/bip.360261104 — the extrapolation `dG_std` is computed with.
