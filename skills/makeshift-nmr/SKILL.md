---
name: makeshift-nmr
description: Analyse protein NMR dynamics with makeshift — pick peaks in UCSF spectra, fit CPMG relaxation dispersion to per-residue R2eff, predict T1/T2/NOE from a structure and read BMRB shifts. Flags the 0.2.0 traps that fail late or silently.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [nmr, spectroscopy, protein-dynamics, relaxation-dispersion, chemical-shifts]
covers: [protein nmr, cpmg, relaxation dispersion, r2eff, rex, conformational exchange, hsqc, ucsf, sparky, peak picking, lineshape fitting, hydronmr, t1, t2, noe, rotational diffusion, nmr-star, bmrb, chemical shifts, re-referencing, lacs, panav, shp2, ubiquitin]
papers: [doi:10.64898/2026.08.17.745346]
datasets: [https://zenodo.org/records/22161246/files/hsqcN15wfb_25deg_ntrc.ucsf, https://zenodo.org/records/22161246/files/SHP2_NSH2_CPMG.zip]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-22
  against: makeshift-nmr 0.2.0 from the package index (upstream commit 1bee3eb) / pandas 3.1.0 and pandas 2.3.3 / numpy 2.5.4 / scipy 1.18.1 / nmrglue 0.12 / Python 3.12.8 on macOS arm64
  executed: 14
  unverified: 0
---

# makeshift — protein NMR dynamics

`makeshift` is a small Python package for protein NMR. It reads UCSF-format spectra,
picks and fits peaks, turns a constant-time CPMG series into per-residue R2eff dispersion
curves, predicts relaxation from a structure, and parses NMR-STAR depositions from the
Biological Magnetic Resonance Bank (BMRB).

Use it when you want conformational exchange or backbone dynamics out of spectra you
already have, in Python, without standing up a full NMR analysis suite.

## What you need, before anything runs

Nothing to obtain. No account, no API key, no licence to accept, no GPU. The package is
MIT-licensed and installs from the package index. Everything below is CPU-only, and each
step runs in seconds once its data is on disk.

Three things to know before you start:

- **The install name is `makeshift-nmr`, the import name is `makeshift`.** There is an
  unrelated `makeshift` package on the index, a text-template generator. Installing
  that one gives you an import error, not an NMR library.
- **Network is needed for data, not for the tool.** The worked examples pull a 1 MB
  spectrum and a 31 MB CPMG series from the project's own Zenodo deposit, structures from
  RCSB or the AlphaFold database, and assignments and shifts from BMRB. Zenodo can be
  slow: the 31 MB archive took about 15 minutes on 2026-10-22.
- **Everything on this page is stamped 0.2.0.** The defects it documents are present in
  0.2.0 and on upstream `main` at the same commit. Pin the version, and recheck the traps
  before relying on them after an upgrade.

## Install

```bash
python3 -m venv ms && . ms/bin/activate
pip install makeshift-nmr==0.2.0
python -c "import makeshift, pandas; print(pandas.__version__)"
```

The package pulls in matplotlib, seaborn and scikit-learn as well as the numerical stack.
Everything on this page works on pandas 3 except reloading the CPMG lineshape cache, and
that cache is unsafe on pandas 2 too. The section on it says what to do instead.

## Getting a structure, and the auto-detect that does not work

`fetch_structure` takes a local path, a four-character PDB id, or a UniProt accession,
and is documented to infer which you gave it. **In 0.2.0 that inference raises for
anything that is not an existing file.** `detect_source` checks `os.path.exists` first,
so a real local path works. Every other identifier then reaches `_PDB_RE`, which
`makeshift/utils/structures.py` uses but never imports (it imports only `_UNIPROT_RE`):

```python
from makeshift.utils import detect_source, fetch_structure

open("local.pdb", "w").write("END\n")
for ident in ("local.pdb", "1UBQ", "P04637"):
    try:
        print(ident, "->", detect_source(ident))
    except NameError as e:
        print(ident, "-> NameError:", e)        # name '_PDB_RE' is not defined

# local.pdb -> file. Both identifiers raise, the UniProt accession included, because the
# unbound PDB test runs before the UniProt one. Passing source= skips detect_source:
print(fetch_structure("1UBQ", source="rcsb", cache_dir="./cache"))     # ./cache/1ubq.pdb
print(fetch_structure("P04637", source="afdb", cache_dir="./cache"))   # ./cache/AF-P04637-F1-v6.pdb
```

So **always pass `source=`**: `'rcsb'` for a PDB id, `'afdb'` for a UniProt accession,
`'file'` for a path. A bare `fetch_structure("1UBQ")` is the natural spelling and the
one that breaks. A mistyped path breaks the same way, with the same `NameError` rather
than a file-not-found error. Without `cache_dir`, structures go to a cache under your
home directory.

The `version` argument has a second trap. Its docstring says the default is `'v4'` and
that v4 coordinates "are carried forward by later AFDB releases, so this stays the
stable default". The signature default is in fact `'v6'`, and v4 is gone: AFDB returns
404 for it. Taking the docstring at its word is how you get an error:

```python
from makeshift.utils import fetch_structure
print(fetch_structure("P04637", source="afdb", cache_dir="./cache"))   # v6, the real default
try:
    fetch_structure("P04637", source="afdb", version="v4", cache_dir="./cache")
except ValueError as e:
    print("v4:", e)        # could not fetch 'P04637' from afdb (...model_v4.pdb): HTTP 404
```

## Spectra and peak picking

`Spectrum.from_ucsf` reads a UCSF (Sparky) file. `pick_peaks` returns a DataFrame with
both array indices and ppm values. The package registers two example datasets, and
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
NtrC receiver domain, a protein of ~124 residues and so roughly that many amide
cross-peaks:

| baseline | peaks | N range (ppm) | H range (ppm) |
|---|---|---|---|
| 10 | 413 | 96.78 – 137.76 | 6.01 – 10.99 |
| 20 | 158 | 96.78 – 130.69 | 6.73 – 10.96 |
| 30 | 132 | 106.10 – 128.84 | 6.73 – 10.09 |
| 50 | 116 | 106.10 – 128.84 | 6.73 – 10.09 |
| 100 | 44 | 107.87 – 128.84 | 6.78 – 10.06 |

The chemical shifts are the tell, not the count. At the default, picked peaks run out to
96.8 and 137.8 ppm in nitrogen, outside the backbone amide window, so most of the
extra 280 are noise maxima. By baseline 30 the range has closed to 106–129 ppm and the
count is in the right place. **Pick a baseline by looking at where the peaks are, not by
accepting the default**, and say in your methods which value you used.

## CPMG relaxation dispersion

This is the part worth the install. A constant-time CPMG series is described by a YAML
config. `makeshift` picks peaks on the reference plane, fits every peak in every plane,
converts volumes to R2eff, and classifies each peak as exchanging or not.

### Get the series and write its config

The SHP2 N-SH2 series in the project's Zenodo deposit holds a reference plane and 15 CPMG
planes. Upstream's own config for it, `examples/SHP2_NSH2_CPMG.yaml` at commit `1bee3eb`,
uses 14 of them and leaves out the 25 Hz plane. The block below writes the same plane set,
so every figure on this page can be checked against upstream's example:

```python
from pathlib import Path
from makeshift.utils import fetch

data_dir = fetch("SHP2_NSH2_CPMG")     # 31 MB, SHA-256 checked, extracted under ~/.makeshift/datasets

# (vCPMG in Hz, plane number in the file name). 50 Hz and 450 Hz are recorded twice.
PLANES = [(50, 6), (50, 14), (100, 9), (150, 2), (200, 11), (250, 7), (350, 3),
          (450, 12), (450, 16), (600, 8), (750, 15), (1000, 10), (1250, 5), (1500, 13)]

config = f"""\
time_T2: 0.04
data_dir: {data_dir}
reference: nuCPMG_0_1_SH2-WB_N15-CPMG.ucsf
sequence: MTSRRWFHPNITGVEAENLLLTRGVDGSFLARPSKSNPGDFTLSVRRNGAVTHIKIQNTGDYYDLYGGEKFATLAELVQYYMEHHGQLKEKNGDVIELKYPLNCA
pdb: 9EHD
baseline_ref_plane: 50
planes:
""" + "".join(f"  - {{file: nuCPMG_{v}_{n}_SH2-WB_N15-CPMG.ucsf, vcpmg: {v}}}\n"
              for v, n in PLANES)

# One copy per route: every run writes cache lines into its config (see the cache section).
Path("shp2.yaml").write_text(config)
Path("shp2_unassigned.yaml").write_text(config)
```

`time_T2` is the constant-time CPMG delay in seconds. `load_config` requires only
`time_T2`, `data_dir`, `reference` and `planes`. A four-character `pdb` value is downloaded
from RCSB as the config loads, into a cache under your home directory. Planes are sorted by
`vcpmg` on load, and the repeated 50 Hz and 450 Hz planes feed the error estimate: R2eff
errors come from the spread between repeats wherever that is larger than the propagated
noise, which on this series is 1,610 of 2,030 points.

Upstream's config also carries `peaklist: 52759`, the BMRB entry holding the N-SH2
backbone assignment. The config above leaves it out so the same text serves both routes
below, and the assigned run passes it as an argument instead. The two routes get separate
files because a run's cache would otherwise leak into the next one.

### The assigned route: `CPMGExperiment`

The pipeline's entry point is `CPMGExperiment.from_config(yaml).run(out_dir)`. Give it an
assignment and it maps the picked peaks onto it, fits, computes R2eff, and classifies
each peak against a HYDRONMR rigid-body prediction made from the config's structure:

```python
from makeshift.relaxation import CPMGExperiment

exp = CPMGExperiment.from_config("shp2.yaml").run("out", peaklist=52759)
print(len(exp.ref_df), "assigned peaks |", len(exp.fit_results), "fits")
print(exp.classifications["label"].value_counts().to_dict())
```

`peaklist` accepts a BMRB id as digits, a `PeakList`, a DataFrame, or a path to a CSV
with `res`, `atom` and `shift` columns (that CSV is itself an assignment list, in long
format, one row per observation). Observed on this series: the BMRB peaks are shifted by
+0.080 ppm in 1H to fit the spectrum (96 of 100 within tolerance), 93 of the 145 picked
peaks are mapped, giving 1,395 fits, and the labels come out `flat` 66, `Rex` 22,
`elevated_R2` 5. The run writes `out/outputs/shp2.csv`, with one row per mapped peak plus
a row for each residue with no peak (4 prolines and 1 unassigned residue here), and keeps
the same tables on the object as `ref_df`, `fit_results`, `all_r2eff` and
`classifications`. Pass `make_plots=True` for the diagnostic PDFs.

### Leave the peaklist out and `run_protein` fails at the end

`run_protein(yaml_path, out_dir)` is upstream's backward-compatible wrapper around the same
call. With no peaklist, as for a protein nobody has assigned yet, it prints
`No peaklist provided or in config — skipping`, does all the work, and then fails in
classification:

```python
from makeshift.relaxation import run_protein
try:
    run_protein("shp2_unassigned.yaml", "out_unassigned")
except KeyError as e:
    print("KeyError:", e)      # "['assn_label'] not in index"
```

Peak picking, lineshape fitting and R2eff all complete first, so you pay the whole cost
before the failure. `CPMGExperiment.run` without a peaklist fails the same way. Without
assignments, use the lower-level functions instead: they do the science and never touch
`assn_label`.

### The unassigned route

```python
from makeshift.relaxation import load_config, load_planes, fit_peaks, compute_r2eff

cfg = load_config("shp2_unassigned.yaml")
ref_sp, planes, vcpmg, time_T2 = load_planes(cfg)      # NB: four return values
ref_df = ref_sp.pick_peaks(baseline=cfg["baseline_ref_plane"])
fits = fit_peaks(planes, ref_df, ref_sp.uc, cfg, overwrite_cache=True)
r2 = compute_r2eff(fits, vcpmg, time_T2)

print(len(ref_df), "peaks |", len(fits), "fits |", len(r2), "R2eff rows")
print("all converged:", int(fits.converged.sum()) == len(fits))
```

On this series that is 145 peaks, 2175 fits (145 x 15 planes, the reference included) and
2030 R2eff rows (145 x 14 CPMG planes). Every one of the 2175 fits converges. `fit_peaks`
reports `135 groups (8 overlapping)`: peaks closer than the fitting radius are fitted
jointly.

`load_planes` returns **four** values, and `plane_data[0]` is the reference plane, not the
first CPMG point. Unpacking it as two values is a `ValueError`.

Exchange shows up as R2eff falling with increasing pulse rate, so rank peaks by
Rex, which is R2eff at the lowest vCPMG minus R2eff at the highest:

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
above 2 s-1, the largest 9.598 s-1 (at N 125.448, H 9.507 ppm). The numbers are identical
on pandas 3.1.0 and 2.3.3. SHP2's N-SH2 domain is a known exchanging system, so
widespread dispersion is the expected answer rather than a surprise. A run that returned
a flat median here would mean something had gone wrong upstream of the fit.

Treat two kinds of number differently. **That R2eff falls with vCPMG for exchanging
residues is an invariant**, and a run where nothing disperses is a failure. The specific
medians and maxima are **observed values** for this dataset, this plane set and this
fitting radius, and they move with the baseline, the lineshape and the planes you include.

### The lineshape cache: refit every time

`fit_peaks` saves its fits to a zip and writes the cache's location into your YAML as a
`fit_lineshapes_cache:` line. That is by design, and upstream's example config ships with
the line. The low-level call puts the cache next to the YAML. `CPMGExperiment.run` puts it
under `out/caches/`, and also caches its HYDRONMR prediction beside the YAML with a
`hydronmr_r2_cache:` line. Unless you
pass `overwrite_cache=True`, the next `fit_peaks` on that config loads the cache instead
of fitting.

**The cache is keyed by the config file alone.** Nothing checks that the peaks, planes or
lineshape match what was cached. What happens next depends on your pandas:

```python
# Continuing from the unassigned route, whose fit_peaks call wrote the cache.
from makeshift.relaxation import fit_peaks
fewer = ref_sp.pick_peaks(baseline=100)                 # 129 peaks instead of 145
try:
    stale = fit_peaks(planes, fewer, ref_sp.uc, cfg)    # no overwrite -> loads the cache
    print(len(fewer), "peaks in,", stale.ref_index.nunique(), "peaks of fits out")
except OSError as e:
    print("OSError:", str(e)[:40])
```

- **pandas 2.3.3** prints `129 peaks in, 145 peaks of fits out`, with a `FutureWarning`
  about passing literal JSON to `read_json`. The cache silently returns the earlier fits
  for a different peak set.
- **pandas 3.x** raises an `OSError` saying the file name is too long (the errno and
  wording vary by platform). The cache stores `DataFrame.to_json()` text, and the reader
  hands that text to `pandas.read_json`, which stopped accepting literal JSON in pandas 3
  and now treats the whole document as a file name.

So pinning `pandas<3` does not fix this: it turns a crash into stale results. **Pass
`overwrite_cache=True` on every `fit_peaks` call**, as the unassigned route above does.
Before rerunning `CPMGExperiment` on a changed config, delete `out/caches/`, the
`shp2_hydronmr_r2.csv` it writes beside the YAML, and the two cache lines, because `run`
gives you no way to skip either cache. The fits
themselves are unaffected: R2eff, median Rex and the top dispersing peaks are identical
on both pandas versions, so this is an I/O defect, not a numerical one.

Because the config is rewritten on every run, keep it out of version control or expect
a dirty tree.

## Predicting relaxation from a structure

`makeshift.hydronmr` is a Python port of the HYDRONMR bead-model calculation: a structure
in, a rotational diffusion tensor and per-residue T1, T2, T1/T2 and NOE out. It needs no
experimental data, which makes it the reference curve to compare a measured T1/T2
profile against.

```python
from makeshift import hydronmr
from makeshift.utils import fetch_structure
import pandas as pd

pdb = fetch_structure("1UBQ", source="rcsb", cache_dir="./cache")
res = hydronmr.run(pdb, csv_path="ubq_hydronmr.csv")
df = pd.read_csv("ubq_hydronmr.csv")
print(len(df), list(df.columns))
print("T1/T2 mean %.4f  min %.4f  max %.4f"
      % (df.T1_over_T2.mean(), df.T1_over_T2.min(), df.T1_over_T2.max()))
```

For ubiquitin (1UBQ, 602 atoms at the default 3.0 A bead radius) it prints a rotational
diffusion coefficient of 3.334e+07 s-1 and a harmonic-mean correlation time of 5.0 ns,
then writes **75 rows for a 76-residue protein**: the table starts at residue 2. Mean
T1/T2 is 2.7697 over the range 2.6213 to 3.2194. The correlation time runs a little long
against the ~4 ns usually quoted for ubiquitin at 25 C, which is the known behaviour of a
bead model at this radius, so compare profiles shape by shape rather than trusting the
absolute value. `run` also returns a `Result` carrying `per_residue`, `to_dataframe()`
and `to_csv()`.

## Chemical shifts from a deposition

`makeshift` also reads NMR-STAR v3 depositions. **Use the classes, not the upstream README.**
The README's API table documents `parse_nmr_star`, `get_sequences`, `get_sample_info`,
`get_chem_shifts` and a free `reref(df, method=...)`, and none of them exists in 0.2.0:
`makeshift.parse_nmr_star` is an `AttributeError`. The working API is:

- `NMRStarEntry.from_bmrb(id)` or `NMRStarEntry.from_file(path)`, with `.sequences()`,
  `.sample_info()`, `.shift_reference()` and many more readers on the entry.
- `ChemicalShifts.from_entry(entry)` or `ChemicalShifts.from_bmrb(id, reref=None,
  calc_csi=False)`, a tidy table in `.data` with one row per assigned atom.
- `ChemicalShifts.reref(method="panav")` or `method="lacs"`, which corrects the table
  **in place**, returns the same object, and stores what it did on `reref_offsets`,
  `reref_check` and (PANAV only) `reref_cona`.
- `makeshift.reref.compute_offsets(df, method)`, which returns `(offsets, check, meta)`
  and changes nothing, for when you want the suggestion without applying it.
- `PeakList.from_bmrb(id)`, the amide peak list that the CPMG pipeline takes as `peaklist`.

```python
from makeshift import NMRStarEntry, ChemicalShifts, PeakList

entry = NMRStarEntry.from_bmrb(5363)          # downloads and parses; leaves no file behind
print(entry.get_entry_title())
print(entry.sequences()[["entity", "ID", "Polymer_type"]].to_string(index=False))

cs = ChemicalShifts.from_entry(entry)
print(cs.data.shape, cs.data.groupby(["ChemShift_ID", "Entity_ID"]).size().to_dict())

cs.reref(method="panav")                      # in place
print("PANAV offsets:", cs.reref_offsets)

peaks = PeakList.from_bmrb(5363)              # prints a Note: first saveframe, first entity
print(peaks.data.shape, list(peaks.data.columns))
```

Entry 5363 is the hERR2 protein bound to DNA, and it shows the two things to
watch. **It has three shift saveframes and three polymer entities**, one each: the protein
(1,090 shifts) and two DNA strands (92 and 94). `ChemicalShifts` keeps all of them,
1,276 rows in all. `PeakList.from_bmrb` takes the first saveframe and the first entity,
here the protein's 91 amide peaks, and prints a `Note` naming what it skipped. Choose
others with `cs_saveframe=` and `entity_id=`. The two must belong together:
`cs_saveframe="chemical_shifts_2", entity_id=1` is a `ValueError` listing the entities
that saveframe holds.

**Re-referencing is a suggestion to check, not a correction to apply blindly.** On this
entry PANAV proposes N −0.346, CA +1.694 and CB +2.225 ppm, and no carbonyl offset because
no carbonyl shifts were deposited. `reref` applies those offsets to the 275 protein N,
CA and CB rows and leaves the DNA rows alone. LACS proposes CA and CB +2.101, N +0.884
and H −0.212 ppm. The two methods agree that the deposited CA and CB shifts sit about
2 ppm from where their statistics expect them, while `entry.shift_reference()` says the
entry was referenced to DSS. Whether that is a referencing error or something about this
protein is your call, and `compute_offsets` lets you see the suggestion before deciding.

## Try it

A cold check that this skill still holds, from one public file and nothing else.
No account, no key, no GPU. It needs the network twice: to install, and to fetch.

**Data**: `hsqcN15wfb_25deg_ntrc.ucsf`, a 512x512 15N-HSQC of the NtrC receiver domain
at 25 C, from the project's own example deposit on Zenodo (record 22161246, CC-BY-4.0,
1.0 MB). `fetch` verifies it against a SHA-256 recorded in the package. Last confirmed
reachable 2026-10-22.

    https://zenodo.org/records/22161246/files/hsqcN15wfb_25deg_ntrc.ucsf

The example runs into the two traps a reader meets first: the structure auto-detect
that raises, and a peak-picking default that returns mostly noise.

**Run**

```bash
COLD=$(mktemp -d) && cd "$COLD"
python3 -m venv ms-check && . ms-check/bin/activate
pip install -q makeshift-nmr==0.2.0
```

```python
import os
from makeshift.utils import fetch, detect_source, fetch_structure
from makeshift.spectra import Spectrum

# The trap, first: the documented source='auto' default raises in 0.2.0.
try:
    detect_source("1UBQ")
    print("auto-detect: worked")
except NameError as e:
    print("auto-detect raises NameError:", e)
pdb = fetch_structure("1UBQ", source="rcsb", cache_dir="./cache")   # explicit source works
print("structure fetched:", os.path.getsize(pdb) > 0)

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
structure fetched: True
spectrum: Spectrum(shape=512x512, dims=2)
background reproducible: True | value: 1714.6844
peaks by baseline: {10: 413, 30: 132, 100: 44}
monotonic in baseline: True
baseline= 10  peaks=413  N 96.78-137.76 ppm  H 6.01-10.99 ppm
baseline= 30  peaks=132  N 106.10-128.84 ppm  H 6.73-10.09 ppm
ppm column matches uc conversion: True | columns: ['N_axis', 'H_axis', 'cid', 'N_lw', 'H_lw', 'est_vol', 'N_ppm', 'H_ppm']
```

`fetch` also prints download progress and a ready line before the `spectrum:` line; they
are left out above. The invariants are `structure fetched`, the reproducible background, the monotonic peak
counts and the ppm agreement. A `False` on any of them means the skill is wrong. The
`NameError` line is the 0.2.0 defect: if a later release prints `auto-detect: worked`,
upstream has fixed it, so update the auto-detect section rather than the test. The
background value, the peak counts and the ppm ranges are observed for this spectrum with
makeshift 0.2.0. If they move, check the version before concluding the spectrum changed.

## Pitfalls

- `fetch_structure` with the default `source='auto'` raises `NameError` for every PDB id,
  UniProt accession or mistyped path. Only an existing local file gets through. Pass
  `source=` explicitly.
- The `version` docstring for the AlphaFold route names a default (`'v4'`) that is both
  wrong and withdrawn upstream. The working default is `'v6'`.
- The upstream README's chemical-shift functions (`parse_nmr_star`, `get_chem_shifts` and
  the rest) do not exist in 0.2.0. Use `NMRStarEntry`, `ChemicalShifts` and `PeakList`.
- `ChemicalShifts.reref` changes the table in place. Use `compute_offsets` to see the
  offsets first.
- `PeakList.from_bmrb` narrows a multi-entity entry to its first saveframe and entity,
  and only prints a note about it. Pass `cs_saveframe=` and `entity_id=`.
- Without a peaklist, `run_protein` and `CPMGExperiment.run` fail with
  `KeyError: ['assn_label']` after doing all the expensive work. Pass one, or use the
  lower-level functions.
- `load_planes` returns four values, and its plane list starts with the reference plane.
- The lineshape cache is keyed by the config file alone: stale fits on pandas 2, an
  `OSError` on pandas 3. Pass `overwrite_cache=True`.
- Peak counts from `pick_peaks()` at the default baseline are dominated by noise. Choose
  the baseline from the chemical-shift range, not the count.

## Sources

- Package: `makeshift-nmr` 0.2.0 on the Python package index, MIT licence.
- Repository: github.com/WaymentSteeleLab/makeshift, commit `1bee3eb` (2026-10-19), the
  0.2.0 code, and `examples/SHP2_NSH2_CPMG.yaml` for the CPMG plane set.
- Paper: El Nesr and Wayment-Steele, "makeshift: a lightweight software for accessing
  and analyzing NMR data and protein dynamics", bioRxiv 2026, doi 10.64898/2026.08.17.745346
- Example data: Zenodo record 22161246, "Example datasets for makeshift", CC-BY-4.0
- Assignments and depositions: the Biological Magnetic Resonance Bank, bmrb.io (entries
  52759 and 5363)
