---
name: pykingenie
description: Fit BLI and SPR sensorgrams to kinetic and equilibrium binding models with pykingenie — reads Octet .frd traces and their .fmf sample plate, or arrays from any instrument, and reports k_off, KD and a derived k_on, with the check for a pinned KD.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [binding-kinetics, bli, spr, biosensor, affinity]
datasets: [https://raw.githubusercontent.com/osvalB/pykingenie/main/test_files/230309_002.frd, https://raw.githubusercontent.com/osvalB/pykingenie/main/test_files/230309_ExpMethod.fmf]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-08
  against: pykingenie 1.0.9 / Python 3.11.17 / numpy 2.4.6 / scipy 1.17.1 / pandas 3.0.6 / matplotlib 3.11.2 / real OctetRED384 run 230309 from the project test corpus
  executed: 7
  unverified: 0
---

# pykingenie — binding kinetics from BLI and SPR sensorgrams

Turns a biosensor trace into `k_on`, `k_off` and `KD`. Use it to go from an Octet or
Biacore run to a number you can put in a figure, and — more often the useful part — to
find out whether the experiment actually determined that number.

**Nothing to obtain.** `pykingenie` is MIT, on PyPI, pure Python over numpy/scipy/pandas,
CPU only. No account, no API key, no licence to accept, no GPU. It is a library, not a
command-line tool, so every example below is Python.

Scope: affinity and rate constants from surface-based (BLI/SPR) and in-solution
experiments. It does not design the experiment, pick concentrations, or reference-subtract
for you.

## Install

```bash
pip install 'pykingenie==1.0.9'
python -c "from importlib.metadata import version; print(version('pykingenie'))"
```

Pin the version. The project is young and single-maintainer, and the fitting entry points
have moved between releases.

Check the version with `importlib.metadata`, not `pykingenie.__version__` — at 1.0.9 the
module attribute still reads `1.0.0` and will mislead a version guard.

## What it reads

| Source | Support |
|---|---|
| Octet `.frd` (traces, one file per sensor) | Native, `OctetExperiment.read_sensor_data` |
| Octet `.fmf` (sample plate — the concentrations) | Native, `OctetExperiment.read_sample_plate_info` |
| Gator (`ExperimentStep.ini` + `Setting.ini` + per-channel CSV) | Native, `GatorExperiment.read_all_gator_data` |
| KinGenie simulated CSV | Native, `KinGenieCsv.read_csv` |
| Biacore `.blr` | Not read. Export text from the instrument and pass arrays to `KineticsFitter` directly |

The split between the two Octet files is the thing to internalise: **`.frd` carries the
traces and no analyte concentration at all.** Concentrations live in the `.fmf` sample
plate. Read only the `.frd` files and `sample_conc` stays `None`, `sample_plate_loaded`
stays `False`, and you cannot fit anything that needs a concentration axis.

```python
import urllib.request
from pykingenie.octet import OctetExperiment

BASE = "https://raw.githubusercontent.com/osvalB/pykingenie/main/test_files/"
urllib.request.urlretrieve(BASE + "230309_002.frd", "230309_002.frd")

bli = OctetExperiment("one_sensor")
bli.read_sensor_data("230309_002.frd")

md = bli.exp_info[0]
print("sensor     :", bli.sensor_names, md["SensorType"])
print("instrument :", md["InstrumentType"], md["ExperimentType"])
print("steps      :", bli.no_steps, list(bli.df_steps["Type"].unique()))
print("conc       :", bli.sample_conc, "| plate loaded:", bli.sample_plate_loaded)
```

`df_steps` is the step table — `#Step`, `Name`, `Type`, `Start`, `Column_location`,
`Loading_location`. Step types are `BASELINE`, `LOADING`, `ASSOC`, `DISASSOC` and
`KREGENERATION`. Traces are nested per sensor then per step, so `bli.xs[sensor][step]`
is a time vector and `bli.ys[sensor][step]` the matching signal.

Add the sample plate and the concentration axis appears:

```python
import urllib.request
from pykingenie.octet import OctetExperiment

BASE = "https://raw.githubusercontent.com/osvalB/pykingenie/main/test_files/"
for n in range(1, 9):
    urllib.request.urlretrieve(BASE + f"230309_00{n}.frd", f"230309_00{n}.frd")
urllib.request.urlretrieve(BASE + "230309_ExpMethod.fmf", "230309_ExpMethod.fmf")

bli = OctetExperiment("run230309")
bli.read_sensor_data([f"230309_00{n}.frd" for n in range(1, 9)])
bli.read_sample_plate_info("230309_ExpMethod.fmf")   # must contain 'ExpMethod.fmf'
bli.generate_ligand_conc_df()

print(bli.ligand_conc_df.head(8).to_string(index=False))
print("analyte sets:", sorted(set(bli.ligand_conc_df["SampleID"])))
```

`read_sample_plate_info` finds the plate by **filename**: it looks for `ExpMethod.fmf` in
the names you pass. Rename the file and it silently loads nothing.

## The two-stage fit, and why the order is not optional

A kinetic fit needs a starting guess for `KD`, and `pykingenie` takes it from an
equilibrium fit of the steady-state signal. So the sequence is always:

1. `get_steady_state()` — median of the last points of each association curve, grouped by
   Smax ID.
2. `fit_steady_state(model='one_site')` — sets `Kd_ss`.
3. `fit_one_site_assoc_and_disso()` — the kinetic fit.

Skip stages 1–2 and stage 3 raises `ValueError: Kd_ss is not set. Please run
fit_steady_state() first.` That is the library telling you the truth, not a bug.

**`smax_id` says which curves share one sensor surface.** A dilution series run on a
single loaded sensor shares one `Smax`, so `smax_id=[0, 0, 0, ...]` is the physically
correct model and gives the better-determined fit. Give every curve its own id and each
gets a free `Smax`; at sub-saturating concentrations that is under-determined and the
steady-state `KD` can come out an order of magnitude wrong.

```python
import numpy as np
from pykingenie import (KineticsFitter, one_site_association_analytical,
                        one_site_dissociation_analytical)

KD, KOFF, SMAX = 0.050, 1.2e-2, 1.8          # KD µM, k_off 1/s, Smax nm
concs = [0.4, 0.2, 0.1, 0.05, 0.025]         # µM
ta, td = np.arange(0, 300, 1.0), np.arange(0, 600, 1.0)
rng = np.random.default_rng(0)

assoc, disso = [], []
for c in concs:
    a = one_site_association_analytical(ta, 0.0, SMAX, KOFF, KD, c)
    assoc.append(a + rng.normal(0, 0.004, ta.size))
    disso.append(one_site_dissociation_analytical(td, a[-1], KOFF)
                 + rng.normal(0, 0.004, td.size))

# One loaded surface -> one shared Smax. Do NOT also pass name_lst (see Traps).
fit = KineticsFitter(time_assoc_lst=[ta] * 5, association_signal_lst=assoc,
                     lig_conc_lst=concs, time_diss_lst=[td] * 5,
                     dissociation_signal_lst=disso, smax_id=[0] * 5)

fit.get_steady_state()
fit.fit_steady_state(model="one_site")
kd_ss = fit.Kd_ss                      # capture it now; the kinetic fit clears the table
fit.fit_one_site_assoc_and_disso(shared_smax=True)

row = fit.fit_params_kinetics.iloc[0]
err = fit.fit_params_kinetics_error.iloc[0]
print("KD steady state : %.4f µM" % kd_ss)
print("KD kinetic      : %.4f µM  (true %.4f)" % (row["Kd [µM]"], KD))
print("k_off           : %.5f 1/s (true %.5f)" % (row["k_off [1/s]"], KOFF))
print("k_on derived    : %.4f 1/µM/s" % row["(Derived) k_on [1/µM/s]"])
print("relative errors : KD %.3f%%  k_off %.3f%%" % (err["Kd [µM]"], err["k_off [1/s]"]))
```

## Units, and the fact that k_on is never fitted

The model is parameterised on **`KD` and `k_off`**. `k_on` is then computed as
`k_off / KD` and reported in the column literally named `(Derived) k_on [1/µM/s]`. It
carries no independent uncertainty — the error table has columns for `KD`, `k_off` and
`Smax` only.

| Quantity | pykingenie unit | To SI |
|---|---|---|
| `KD` | µM | `× 1e3` → nM |
| `k_off` | 1/s | already SI |
| `k_on` | 1/µM/s | `× 1e6` → 1/M/s |

Reporting a µM number as though it were nM is a factor of a thousand, and the column
headers are the only place the unit is stated. `rel_error = error / fit * 100`, so the
error table is in **percent**, not fractions.

## Read the bound before you believe the KD

This is the check that matters most, and it is not optional. The kinetic fit's lower
bound on `KD` is `min(Kd_ss / 1000, *concentrations)`. When the dilution series sits far
above the true `KD`, every curve is saturated, the steady-state signal cannot constrain
affinity, and the optimiser walks `KD` down to that bound and stops. The fit then
*reports* a `KD` — and the formal relative error still looks respectable, because the
covariance is computed about the point where the optimiser halted.

**So compare the fitted `KD` against `low_bounds[0]`.** Equal means not measured.

```python
import urllib.request, numpy as np
from pykingenie.octet import OctetExperiment
from pykingenie.main import KineticsAnalyzer

BASE = "https://raw.githubusercontent.com/osvalB/pykingenie/main/test_files/"
for n in range(1, 9):
    urllib.request.urlretrieve(BASE + f"230309_00{n}.frd", f"230309_00{n}.frd")
urllib.request.urlretrieve(BASE + "230309_ExpMethod.fmf", "230309_ExpMethod.fmf")

bli = OctetExperiment("run230309")
bli.read_sensor_data([f"230309_00{n}.frd" for n in range(1, 9)])
bli.read_sample_plate_info("230309_ExpMethod.fmf")
bli.generate_ligand_conc_df()

an = KineticsAnalyzer()
an.add_experiment(bli, "run230309")
an.merge_ligand_conc_df()
merged = an.combined_ligand_conc_df
conc_col = next(c for c in merged.columns if "Analyte]" in c)   # '[Analyte] (μM)'

sub = merged[(merged["SampleID"] == "wt - reg")
             & (merged["Replicate"] == 1)
             & (merged[conc_col] > 0)].copy()                   # drop the 0 µM blank
print("curves:", len(sub), "concs µM:", sorted(sub[conc_col]))

an.generate_fittings(sub)                  # NB: mutates `sub` in place
an.submit_steady_state_fitting(fitting_model="one_to_one")
f = an.fittings["wt - reg"]
kd_ss = f.Kd_ss
an.submit_kinetics_fitting(fitting_model="one_to_one", shared_smax=True)
an.get_fitting_results()                   # returns None; fills the attribute below

res = an.fit_params_kinetics_all.iloc[0]
pinned = np.isclose(res["Kd [µM]"], f.low_bounds[0], rtol=1e-6)
print("KD steady state : %.4g µM" % kd_ss)
print("KD kinetic      : %.4g µM" % res["Kd [µM]"])
print("lower bound     : %.4g µM  -> pinned: %s" % (f.low_bounds[0], pinned))
print("k_off           : %.3g 1/s" % res["k_off [1/s]"])
print("formal KD error : %.1f%%" % f.fit_params_kinetics_error.iloc[0]["Kd [µM]"])
```

On run 230309 that prints a pinned `KD` for all six analyte sets, at a formal error
between 4 and 5 percent. The honest read of that experiment is that **`k_off` is
measured** — dissociation is slow, around 1e-4 1/s — and `KD` is not, because the series
(1 nM to 130 nM) never approaches it. Reporting the pinned number as an affinity would be
reporting the lower bound of a search.

What to do instead, in order of preference: extend the dilution series downward until the
steady-state signal bends; fit `k_on` and `k_off` from the kinetics alone and quote
`KD = k_off / k_on` with its propagated error; or quote `k_off` and say `KD` was below the
range probed.

## Fitting data from any other instrument

`KineticsFitter` takes plain arrays, so anything you can export works — Biacore text,
a CSV, a reference-subtracted trace you built yourself. One entry per curve in each list:

```python
import numpy as np
from pykingenie import KineticsFitter

# two curves, 60 s association then 120 s dissociation, 1 Hz
ta, td = np.arange(0, 60, 1.0), np.arange(0, 120, 1.0)
assoc = [0.9 * (1 - np.exp(-0.05 * ta)), 0.45 * (1 - np.exp(-0.035 * ta))]
disso = [a[-1] * np.exp(-0.01 * td) for a in assoc]

fit = KineticsFitter(time_assoc_lst=[ta, ta],
                     association_signal_lst=assoc,
                     lig_conc_lst=[0.2, 0.05],
                     time_diss_lst=[td, td],
                     dissociation_signal_lst=disso,
                     smax_id=[0, 0])
fit.get_steady_state()
print("steady-state signals per Smax ID:", fit.signal_ss)
print("Smax guess (shared):", [round(s, 3) for s in fit.smax_guesses_shared])
```

Pass `is_single_cycle=True` for single-cycle kinetics, where titration steps run
back-to-back on one sensor without regeneration.

Other models reachable from `KineticsAnalyzer.submit_kinetics_fitting` via
`fitting_model`: `one_to_one`, `one_to_one_mtl` (mass transport limited), `one_to_one_if`
(induced fit), `two_to_one`, and `heterogeneous_ligand`. Use `fitting_region` to fit
`association`, `dissociation` or both.

## Traps

Each of these was reproduced on 1.0.9.

- **`name_lst` plus a grouped `smax_id` breaks the steady-state fit.** The result frame
  puts one `Smax` per group alongside one `Name` per curve, and pandas refuses with
  `ValueError: All arrays must be of the same length`. Omit `name_lst` when you share
  `Smax`, and label the curves yourself afterwards.
- **The kinetic fit clears `fit_params_ss`.** After `fit_one_site_assoc_and_disso` it is
  `None`. Read `Kd_ss` or the steady-state table before you run the kinetics.
- **`get_fitting_results()` returns `None`** despite its docstring. The frame is left on
  `KineticsAnalyzer.fit_params_kinetics_all`.
- **`generate_fittings(df)` mutates the DataFrame you hand it** — resets the index and
  renames `[Analyte] (μM)` to `Concentration_micromolar`. Pass a `.copy()` if you still
  need the original.
- **Two different mu characters.** Result columns use the micro sign U+00B5 (`Kd [µM]`),
  while the merged concentration column uses Greek mu U+03BC (`[Analyte] (μM)`). Indexing
  by a hand-typed string is a coin flip; select it with a substring match, as the example
  above does.
- **`pykingenie.__version__` reports `1.0.0` at 1.0.9.** Use `importlib.metadata.version`.
- **`scipy` prints `OptimizeWarning: Covariance of the parameters could not be estimated`**
  on some fits. It means the error table for that fit is not usable; the parameters may
  still be fine.

## Try it

A self-contained check that this skill still works. Public data, no account, no key.

**Data** — one real sensor trace and the sample plate from Octet run `230309`, part of the
project's own MIT-licensed test corpus:

    https://raw.githubusercontent.com/osvalB/pykingenie/main/test_files/230309_002.frd
    https://raw.githubusercontent.com/osvalB/pykingenie/main/test_files/230309_ExpMethod.fmf

Real OctetRED384 output, 650 kB and 68 kB, no licence to accept beyond the repository's
MIT terms. Last confirmed reachable 2026-10-08. The invariants below are structural — the
parser's shape and the recovery of known rate constants. The instrument strings and the
B1 concentration are observed values from this run, so a mismatch there is drift to
investigate rather than a failure.

```python
import urllib.request, numpy as np
from pykingenie.octet import OctetExperiment
from pykingenie import (KineticsFitter, one_site_association_analytical,
                        one_site_dissociation_analytical)

BASE = "https://raw.githubusercontent.com/osvalB/pykingenie/main/test_files/"
for f in ("230309_002.frd", "230309_ExpMethod.fmf"):
    urllib.request.urlretrieve(BASE + f, f)

# --- the reader, and the .frd/.fmf split -----------------------------------
bli = OctetExperiment("tryit")
bli.read_sensor_data("230309_002.frd")
types = list(bli.df_steps["Type"].unique())
assoc = bli.df_steps.index[bli.df_steps["Type"] == "ASSOC"]

print("sensor      :", bli.sensor_names, "|", bli.exp_info[0]["InstrumentType"])
print("steps       :", bli.no_steps, "| ASSOC steps:", len(assoc))
print("conc in .frd:", bli.sample_conc)

assert bli.no_sensors == 1 and bli.sensor_names == ["B1"]
assert {"BASELINE", "LOADING", "ASSOC", "DISASSOC"} <= set(types)
assert bli.sample_conc is None and bli.sample_plate_loaded is False
assert len(bli.xs[0]) == bli.no_steps == 115
assert len(bli.xs[0][assoc[0]]) == 1500

bli.read_sample_plate_info("230309_ExpMethod.fmf")
bli.generate_ligand_conc_df()
conc_col = next(c for c in bli.ligand_conc_df.columns if "oncentration" in c)
b1 = sorted(set(bli.ligand_conc_df[conc_col]))
print("plate loaded:", bli.sample_plate_loaded, "| B1 concs µM:", b1)
assert bli.sample_plate_loaded is True
assert any(abs(c - 0.0692) < 1e-6 for c in b1)        # observed, run 230309

# --- the numerical core, against known truth -------------------------------
KD, KOFF, SMAX = 0.050, 1.2e-2, 1.8
concs = [0.4, 0.2, 0.1, 0.05, 0.025]
ta, td = np.arange(0, 300, 1.0), np.arange(0, 600, 1.0)
rng = np.random.default_rng(0)
A, D = [], []
for c in concs:
    a = one_site_association_analytical(ta, 0.0, SMAX, KOFF, KD, c)
    A.append(a + rng.normal(0, 0.004, ta.size))
    D.append(one_site_dissociation_analytical(td, a[-1], KOFF)
             + rng.normal(0, 0.004, td.size))

fit = KineticsFitter(time_assoc_lst=[ta] * 5, association_signal_lst=A,
                     lig_conc_lst=concs, time_diss_lst=[td] * 5,
                     dissociation_signal_lst=D, smax_id=[0] * 5)
fit.get_steady_state()
fit.fit_steady_state(model="one_site")
kd_ss = fit.Kd_ss
fit.fit_one_site_assoc_and_disso(shared_smax=True)

r = fit.fit_params_kinetics.iloc[0]
kd, koff, kon = r["Kd [µM]"], r["k_off [1/s]"], r["(Derived) k_on [1/µM/s]"]
print("KD  : %.4f µM (true %.4f) = %.1f nM" % (kd, KD, kd * 1e3))
print("koff: %.5f 1/s (true %.5f)" % (koff, KOFF))
print("kon : %.4f 1/µM/s = %.2e 1/M/s" % (kon, kon * 1e6))

assert np.isclose(kon, koff / kd)                 # k_on is derived, never fitted
assert abs(kd - KD) / KD < 0.05
assert abs(koff - KOFF) / KOFF < 0.05
assert len(fit.fit_params_kinetics) == 1          # shared Smax -> one row
assert not np.isclose(kd, fit.low_bounds[0], rtol=1e-6)   # a real fit is not at its bound
assert fit.fit_params_ss is None                  # cleared by the kinetic fit

# --- error path: the steady-state seed is mandatory ------------------------
try:
    KineticsFitter([ta], [A[0]], [concs[0]]).fit_one_site_assoc_and_disso()
    raise AssertionError("expected ValueError")
except ValueError as e:
    print("unseeded fit:", e)

print("OK")
```

Expect `KD` within 5 percent of 0.0500 µM and `k_off` within 5 percent of 0.01200 1/s;
on 1.0.9 the run printed `KD 0.0500 µM = 50.0 nM`, `koff 0.01199`, `kon 0.2399 1/µM/s`
= `2.40e+05 1/M/s`.

## Limits

- Young project, one maintainer. Pin the version and re-run this page's checks after any
  upgrade; the fitting entry points have moved before.
- No Biacore `.blr` reader. Export from the instrument and pass arrays.
- Reference subtraction, baseline alignment and inter-step drift correction are the
  experimenter's job. A blank sensor at 0 µM is in the plate for that purpose — the
  worked example drops it rather than correcting with it.
- Errors come from the covariance of the fit. They describe the fit, not the experiment,
  and they say nothing about whether the concentration range determined the parameter.
  The bound check above is the thing that does.
