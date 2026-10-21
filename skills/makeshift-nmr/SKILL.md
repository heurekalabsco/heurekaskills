---
name: makeshift-nmr
description: Analyse protein NMR dynamics with makeshift — pick peaks from UCSF spectra, fit CPMG relaxation dispersion to per-residue R2eff, and predict T1/T2/NOE from a structure. Notes the auto-detect defect and a cache that breaks on pandas 3.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [nmr, protein-dynamics, relaxation-dispersion, cpmg, chemical-shifts]
datasets: [https://zenodo.org/records/22161246/files/hsqcN15wfb_25deg_ntrc.ucsf, https://zenodo.org/records/22161246/files/SHP2_NSH2_CPMG.zip]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: makeshift-nmr 0.2.0 from the package index / pandas 3.0.6 and pandas 2.3.3 / numpy 2.4.6 / scipy 1.17.1 / nmrglue 0.12 / Python 3.11 on Linux x86_64
  executed: 7
  unverified: 1
  unverified_reason: The chemical-shift route reads NMR-STAR depositions from the BMRB host, which the validating environment has no outbound route to — the call fails at the proxy rather than at the service, so nothing here is evidence about BMRB itself. Re-run the chemical shifts section from a host that can reach bmrb.io.
---

# makeshift — protein NMR dynamics

`makeshift` is a small, dependency-light Python package for protein NMR: it reads
UCSF-format spectra, picks and fits peaks, turns a constant-time CPMG series into
per-residue R2eff dispersion curves, predicts relaxation from a structure, and parses
NMR-STAR depositions from the Biological Magnetic Resonance Bank.

Use it when you want conformational exchange or backbone dynamics out of spectra you
already have, in Python, without standing up a full NMR analysis suite.

## What you need, before anything runs

Nothing to obtain. No account, no API key, no licence to accept, no GPU. The package is
MIT-licensed and installs from the package index; everything below is CPU-only and runs
in seconds to a few minutes.

Two things to know before you start:

- **The install name is `makeshift-nmr`, the import name is `makeshift`.** There is an
  unrelated `makeshift` package on the index — a text-template generator. Installing
  that one gives you an import error, not an NMR library.
- **Network is needed for data, not for the tool.** The worked examples pull a 1 MB
  spectrum and a 31 MB CPMG series from the project's own Zenodo deposit, and structures
  from RCSB or the AlphaFold database. The chemical-shift route needs the BMRB host.

## Install

```bash
python3 -m venv ms && . ms/bin/activate
pip install makeshift-nmr
python -c "import makeshift, pandas; print(pandas.__version__)"
```

Everything in this page works on pandas 3. One feature does not — the CPMG lineshape
cache — and the section on it says exactly where the boundary is and what to do.

## Getting a structure, and the auto-detect that does not work

`fetch_structure` takes a local path, a four-character PDB id, or a UniProt accession,
and is documented to infer which you gave it. **In 0.2.0 that inference always raises.**
`makeshift/utils/structures.py` calls `_PDB_RE` but imports only `_UNIPROT_RE` from its
constants module, so the name is unbound at the point of use:

```python
from makeshift.utils import detect_source, fetch_structure

for ident in ("1UBQ", "P04637"):
    try:
        print(ident, "->", detect_source(ident))
    except NameError as e:
        print(ident, "-> NameError:", e)        # name '_PDB_RE' is not defined

# Both fail, including the UniProt accession, because the unbound PDB test runs first.
# Passing source= explicitly skips detect_source entirely and works:
print(fetch_structure("1UBQ", source="rcsb"))
print(fetch_structure("P04637", source="afdb"))
```

So **always pass `source=`**. `'rcsb'` for a PDB id, `'afdb'` for a UniProt accession,
`'file'` for a path. A bare `fetch_structure("1UBQ")` is the natural spelling and the
one that breaks.

The `version` argument has a second trap. Its docstring says the default is `'v4'` and
that v4 coordinates "are carried forward by later AFDB releases, so this stays the
stable default". The signature default is in fact `'v6'`, and v4 is gone — AFDB returns
404 for it. Taking the docstring at its word is how you get an error:

```python
from makeshift.utils import fetch_structure
print(fetch_structure("P04637", source="afdb"))                   # v6, the real default
try:
    fetch_structure("P04637", source="afdb", version="v4")
except ValueError as e:
    print("v4:", e)        # ... HTTP 404 — the docstring's "stable default" is withdrawn
```

## Spectra and peak picking

`Spectrum.from_ucsf` reads a UCSF (Sparky) file; `pick_peaks` returns a DataFrame with
both array indices and ppm values. The package registers two example datasets and
`fetch` verifies each against a recorded SHA-256 before returning it.

```python
from makeshift.utils import fetch, list_datasets
from makeshift.spectra import Spectrum

print(list_datasets())                       # ['SHP2_NSH2_CPMG', 'NTRC_HSQC']
sp = Spectrum.from_ucsf(fetch("NTRC_HSQC"))
print(repr(sp), sp.data.shape)               # Spectrum(shape=512x512, dims=2)
print("background: %.4f" % sp.estimate_background())
peaks = sp.pick_peaks()
print(len(peaks), list(peaks.columns))
```

`estimate_background` samples the spectrum with a fixed seed, so it is reproducible
across runs: 1714.6844 for this spectrum, every time.

**The `baseline` default picks mostly noise.** `baseline` is a multiplier on that
background estimate, and the default of 10 is far too permissive. On this HSQC of the
NtrC receiver domain — a protein of ~124 residues, so expect roughly that many amide
cross-peaks:

| baseline | peaks | N range (ppm) | H range (ppm) |
|---|---|---|---|
| 10 | 413 | 96.78 – 137.76 | 6.01 – 10.99 |
| 20 | 158 | 96.78 – 130.69 | 6.73 – 10.96 |
| 30 | 132 | 106.10 – 128.84 | 6.73 – 10.09 |
| 50 | 116 | 106.10 – 128.84 | 6.73 – 10.09 |
| 100 | 44 | 107.87 – 128.84 | 6.78 – 10.06 |

The chemical shifts are the tell, not the count. At the default, picked peaks run out to
96.8 and 137.8 ppm in nitrogen — outside the backbone amide window — so most of the
extra 280 are noise maxima. By baseline 30 the range has closed to 106–129 ppm and the
count is in the right place. **Pick a baseline by looking at where the peaks are, not by
accepting the default**, and say in your methods which value you used.

## CPMG relaxation dispersion

This is the part worth the install. A constant-time CPMG series is described by a YAML
config; `makeshift` picks peaks on the reference plane, fits every peak in every plane,
and converts volumes to R2eff.

```yaml
time_T2: 0.04                 # constant-time CPMG delay, seconds
data_dir: ~/.makeshift/datasets/SHP2_NSH2_CPMG/SHP2_NSH2_CPMG
reference: nuCPMG_0_1_SH2-WB_N15-CPMG.ucsf
sequence: MTSRRWFHPNITGVEAENLLLTRGVDGSFLARPSKSNPGDFTLSVRRNGAVTHIKIQNTGDYYDLYGGEKFATLAELVQYYMEHHGQLKEKNGDVIELKYPLNCA
pdb: 9EHD
baseline_ref_plane: 50
planes:
  - {file: nuCPMG_50_6_SH2-WB_N15-CPMG.ucsf, vcpmg: 50}
  - {file: nuCPMG_100_9_SH2-WB_N15-CPMG.ucsf, vcpmg: 100}
  - {file: nuCPMG_1500_13_SH2-WB_N15-CPMG.ucsf, vcpmg: 1500}
```

`load_config` requires only `time_T2`, `data_dir`, `reference` and `planes`. A
four-character `pdb` value is downloaded from RCSB as the config loads. Planes are
sorted by `vcpmg` on load, and duplicate `vcpmg` values are kept — they are what the
error estimate uses.

### `run_protein` needs a peaklist, whatever it says

The one-call wrapper is `run_protein(yaml_path, out_dir)`. It prints
`No peaklist provided or in config — skipping` and then dies at the end:

```python
from makeshift.relaxation import run_protein
try:
    run_protein("shp2.yaml", "out")
except KeyError as e:
    print("KeyError:", e)      # "['assn_label'] not in index"
```

Peak picking, lineshape fitting and R2eff all complete first, so you pay the whole cost
before the failure. **Supply a peaklist.** `peaklist` accepts a `PeakList`, a DataFrame,
a BMRB id as digits, or a path to a CSV with `res`, `atom` and `shift` columns:

```python
run_protein("shp2.yaml", "out", peaklist="assignments.csv")
```

If you have no assignments, drive the lower-level functions instead — they do the
science and never touch `assn_label`.

### The pipeline without assignments

```python
from makeshift.relaxation import load_config, load_planes, fit_peaks, compute_r2eff

cfg = load_config("shp2.yaml")
ref_sp, planes, vcpmg, time_T2 = load_planes(cfg)      # NB: four return values
ref_df = ref_sp.pick_peaks(baseline=cfg["baseline_ref_plane"])
fits = fit_peaks(planes, ref_df, ref_sp.uc, cfg, overwrite_cache=True)
r2 = compute_r2eff(fits, vcpmg, time_T2)

print(len(ref_df), "peaks |", len(fits), "fits |", len(r2), "R2eff rows")
print("all converged:", int(fits.converged.sum()) == len(fits))
```

On the SHP2 N-SH2 series — 14 CPMG planes plus a reference, 145 picked peaks — that is
145 peaks, 2175 fits (145 x 15 planes, the reference included) and 2030 R2eff rows
(145 x 14 CPMG planes). Every one of the 2175 fits converges. `fit_peaks` reports
`135 groups (8 overlapping)`: peaks closer than the fitting radius are fitted jointly.

`load_planes` returns **four** values and `plane_data[0]` is the reference plane, not the
first CPMG point. Unpacking it as two values is a `ValueError`.

Exchange shows up as R2eff falling with increasing pulse rate, so rank residues by
Rex — R2eff at the lowest vCPMG minus R2eff at the highest:

```python
lo = r2[r2.vcpmg == r2.vcpmg.min()].groupby("ref_index").R2eff.mean()
hi = r2[r2.vcpmg == r2.vcpmg.max()].groupby("ref_index").R2eff.mean()
rex = (lo - hi).dropna().sort_values(ascending=False)

print("median Rex: %.3f s-1" % rex.median())
print("peaks with Rex > 2 s-1:", int((rex > 2).sum()), "of", len(rex))
for i, v in rex.head(3).items():
    print("  N %7.3f  H %6.3f  Rex %6.3f s-1"
          % (ref_df.loc[i].N_ppm, ref_df.loc[i].H_ppm, v))
```

Observed on this series (50 Hz against 1500 Hz): median Rex 1.276 s-1, 58 of 145 peaks
above 2 s-1, the largest 9.598 s-1. SHP2's N-SH2 domain is a known exchanging system, so
widespread dispersion is the expected answer rather than a surprise — a run that returned
a flat median here would mean something had gone wrong upstream of the fit.

Two numbers to treat differently: **that R2eff falls with vCPMG for exchanging residues
is an invariant**, and a run where nothing disperses is a failure. The specific medians
and maxima are **observed values** for this dataset at this fitting radius, and will move
with the baseline, the lineshape and the plane subset you include.

### The lineshape cache breaks on pandas 3, and it rewrites your config

`fit_peaks` caches the fits and **edits your YAML in place** to record where:

```python
# After any successful fit_peaks, the config file has gained a line:
#   fit_lineshapes_cache: out/caches/shp2_fit_lineshapes.json.zip
# On the next run the cache is loaded instead of refitting — which is where it breaks.
from makeshift.relaxation import fit_peaks
try:
    fits = fit_peaks(planes, ref_df, ref_sp.uc, cfg)      # no overwrite -> loads cache
except OSError as e:
    print("OSError:", str(e)[:60])      # [Errno 36] File name too long: '[{"ref_index":0,...
```

The cache writer stores `DataFrame.to_json()` text inside a zip; the reader hands that
text straight to `pandas.read_json`. Passing literal JSON to `read_json` was deprecated
in pandas 2 and removed in pandas 3, so pandas 3 treats the JSON document as a filename
and raises `OSError: [Errno 36] File name too long`.

Measured both sides of the boundary:

- **pandas 2.3.3** — the cache loads, `2175 rows loaded from cache (145 peaks x 15 planes)`,
  with a `FutureWarning` that names exactly this removal.
- **pandas 3.0.6** — `OSError: [Errno 36] File name too long`.

The trap is the combination: the first run succeeds and points your config at a cache,
and every later run of that config then fails. Three ways out, in order of preference —
pass `overwrite_cache=True` and refit; delete the cache file and the
`fit_lineshapes_cache:` line from the YAML; or pin `pandas<3` if you want caching to
work. The fits themselves are unaffected: R2eff, median Rex and the top dispersing peaks
are identical on both pandas versions, so this is an I/O defect, not a numerical one.

Also note `fit_peaks` mutating an input file at all. Keep configs out of version control,
or expect a dirty tree after every run.

## Predicting relaxation from a structure

`makeshift.hydronmr` is a Python port of the HYDRONMR bead-model calculation: a structure
in, a rotational diffusion tensor and per-residue T1, T2, T1/T2 and NOE out. No
experimental data needed, which makes it the reference curve to compare a measured T1/T2
profile against.

```python
from makeshift import hydronmr
from makeshift.utils import fetch_structure
import pandas as pd

pdb = fetch_structure("1UBQ", source="rcsb")
res = hydronmr.run(pdb, csv_path="ubq_hydronmr.csv")
df = pd.read_csv("ubq_hydronmr.csv")
print(len(df), list(df.columns))
print("T1/T2 mean %.4f  min %.4f  max %.4f"
      % (df.T1_over_T2.mean(), df.T1_over_T2.min(), df.T1_over_T2.max()))
```

For ubiquitin (1UBQ, 602 atoms at the default 3.0 A bead radius) it prints a rotational
diffusion coefficient of 3.334e+07 s-1 and a harmonic-mean correlation time of 5.0 ns,
then writes **75 rows for a 76-residue protein** — the table starts at residue 2. Mean
T1/T2 is 2.7697 over the range 2.6213 to 3.2194. The correlation time runs a little long
against the ~4 ns usually quoted for ubiquitin at 25 C, which is the known behaviour of a
bead model at this radius, so compare profiles shape-by-shape rather than trusting the
absolute value. `run` also returns a `Result` carrying `per_residue`, `to_dataframe()`
and `to_csv()`.

## Chemical shifts from a deposition

`makeshift`'s other half reads NMR-STAR v3 depositions: `ChemicalShifts.from_bmrb(id)`
and `PeakList.from_bmrb(id)` fetch and parse an entry, `parse_nmr_star` reads a local
`.str` file, and `get_sequences`, `get_sample_info` and `get_chem_shifts` pull entities,
sample composition and assigned shifts into DataFrames. `reref(df, method='panav')` or
`method='lacs'` corrects backbone referencing errors and returns corrected shifts, a
per-atom convergence flag, and the offsets applied.

```python
from makeshift import ChemicalShifts
from makeshift.peaklist import PeakList

cs = ChemicalShifts.from_bmrb(5363)         # downloads bmr5363_3.str, then parses it
peaks = PeakList.from_bmrb(5363)            # amide peak list, usable as a CPMG peaklist
print(cs.data.shape, peaks.data.shape)
```

**This block is the one thing on this page not executed here**, because the validating
environment has no route to the BMRB host — the call fails at the network proxy
(`URLError: Tunnel connection failed: 403 Forbidden`) rather than at the service, so this
run is evidence about the sandbox and not about BMRB. The parsing half is unaffected by
that gap only in principle; treat the signatures above as read off the installed code and
confirm them on first use. Everything else on this page was run.

If you only need an assignment list for a CPMG fit and cannot reach BMRB, `from_csv` is
the offline route: a CSV with `res` (e.g. `A12`), `atom` and `shift` columns, long-format,
one row per observation.

## Try it

A cold check that this skill still holds, from one public file and nothing else.
No account, no key, no GPU. Needs network twice — to install, and to fetch.

**Data** — `hsqcN15wfb_25deg_ntrc.ucsf`, a 512x512 15N-HSQC of the NtrC receiver domain
at 25 C, from the project's own example deposit on Zenodo (record 22161246, CC-BY-4.0,
1.0 MB). `fetch` verifies it against a SHA-256 recorded in the package. Last confirmed
reachable 2026-10-21.

    https://zenodo.org/records/22161246/files/hsqcN15wfb_25deg_ntrc.ucsf

The example routes through the two traps a reader meets first: the structure auto-detect
that always raises, and a peak-picking default that returns mostly noise.

**Run**

```bash
COLD=$(mktemp -d) && cd "$COLD"
python3 -m venv ms-check && . ms-check/bin/activate
pip install -q makeshift-nmr
```

```python
from makeshift.utils import fetch, detect_source, fetch_structure
from makeshift.spectra import Spectrum

# The trap, first: the documented source='auto' default is broken in 0.2.0.
try:
    detect_source("1UBQ")
    print("auto-detect: worked")
except NameError as e:
    print("auto-detect raises NameError:", e)
pdb = fetch_structure("1UBQ", source="rcsb")   # explicit source is the working route

# A real published HSQC, checksum-verified against the package's own registry.
sp = Spectrum.from_ucsf(fetch("NTRC_HSQC", cache_dir="./cache"))
print("spectrum:", repr(sp))

# INVARIANT: the background estimate is seeded, so it is reproducible run to run.
bg1, bg2 = sp.estimate_background(), sp.estimate_background()
print("background reproducible:", bg1 == bg2, "| value: %.4f" % bg1)

# INVARIANT: baseline is a multiple of that background, so peak count falls as it rises.
counts = {b: len(sp.pick_peaks(baseline=b)) for b in (10, 30, 100)}
print("peaks by baseline:", counts)
print("monotonic in baseline:", counts[10] > counts[30] > counts[100])

# THE POINT: the default picks noise. Only at baseline>=30 does the N range sit
# inside the backbone amide window, which is what tells you the extra peaks are junk.
for b in (10, 30):
    pk = sp.pick_peaks(baseline=b)
    print("baseline=%3d  peaks=%3d  N %.2f-%.2f ppm  H %.2f-%.2f ppm"
          % (b, len(pk), pk.N_ppm.min(), pk.N_ppm.max(), pk.H_ppm.min(), pk.H_ppm.max()))

# INVARIANT: picked positions carry both an array index and a ppm value, and the
# ppm column must agree with the axis conversion for the same point.
pk = sp.pick_peaks(baseline=30)
row = pk.iloc[0]
print("ppm column matches uc conversion:",
      abs(sp.ppm(0, row.N_axis) - row.N_ppm) < 1e-9,
      "| columns:", list(pk.columns))
```

**Expect**

```
auto-detect raises NameError: name '_PDB_RE' is not defined
spectrum: Spectrum(shape=512x512, dims=2)
background reproducible: True | value: 1714.6844
peaks by baseline: {10: 413, 30: 132, 100: 44}
monotonic in baseline: True
baseline= 10  peaks=413  N 96.78-137.76 ppm  H 6.01-10.99 ppm
baseline= 30  peaks=132  N 106.10-128.84 ppm  H 6.73-10.09 ppm
ppm column matches uc conversion: True | columns: ['N_axis', 'H_axis', 'cid', 'N_lw', 'H_lw', 'est_vol', 'N_ppm', 'H_ppm']
```

The `NameError`, the three invariant lines and the `True` values are the assertions. The
background value, the peak counts and the ppm ranges are observed for this spectrum with
makeshift 0.2.0 — if they move, check the version before concluding the spectrum changed.

## Pitfalls

- `fetch_structure` with the default `source='auto'` always raises `NameError`. Pass
  `source=` explicitly.
- The `version` docstring for the AlphaFold route names a default (`'v4'`) that is both
  wrong and withdrawn upstream. The working default is `'v6'`.
- `run_protein` fails with `KeyError: ['assn_label']` unless a peaklist is given, after
  doing all the expensive work. Pass one, or use the lower-level functions.
- `load_planes` returns four values, and its plane list starts with the reference plane.
- `fit_peaks` writes a cache and edits your config file to point at it; reloading that
  cache raises `OSError` on pandas 3.
- Peak counts from `pick_peaks()` at the default baseline are dominated by noise. Choose
  the baseline from the chemical-shift range, not the count.

## Sources

- Package — `makeshift-nmr` 0.2.0 on the Python package index, MIT licence.
- Repository — github.com/WaymentSteeleLab/makeshift
- Paper — El Nesr and Wayment-Steele, "Makeshift — a lightweight software for accessing
  and analyzing NMR data and protein dynamics", bioRxiv 2026, doi 10.64898/2026.08.17.745346
- Example data — Zenodo record 22161246, "Example datasets for makeshift", CC-BY-4.0
- NMR-STAR format and depositions — the Biological Magnetic Resonance Bank, bmrb.io
