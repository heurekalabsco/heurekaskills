---
name: flow-cytometry
description: Read and process flow and mass cytometry FCS files in Python with FlowKit and FlowIO — channel metadata, gain and log-amplifier preprocessing, $SPILL/$SPILLOVER compensation, logicle and arcsinh transforms, FlowJo workspace gates, subsampling, and writing FCS files that downstream tools will not double-compensate.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [flow-cytometry, fcs, compensation, file-io, single-cell]
datasets: [https://raw.githubusercontent.com/whitews/FlowIO/master/data/fcs_files/B01%20KC-A-W---91-US.fcs, https://raw.githubusercontent.com/whitews/FlowIO/master/data/fcs_files/data1.fcs]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: flowkit 1.3.2 / flowio 1.4.0 / flowutils 1.2.2 / numpy 2.5.4 / pandas 2.3.3 / Python 3.12.2 / all 14 Python blocks run in page order in one fresh directory and Try it run again alone in a second fresh directory / techniques also checked on files from a BD FACScan, a FACSAria (FCS 2.0 with SPILL), a Thermo Attune NxT and a CyTOF 5.1 instrument
  executed: 15
  unverified: 0
---
# Flow cytometry FCS files

FCS is the file every cytometer writes, and the binary values inside it are not the numbers
you should analyze. Between the bytes on disk and a population you can gate sit three steps
that are easy to skip silently: **preprocessing** (gain, log-amplifier decoding, time scaling),
**compensation** (removing spillover between detectors), and a **display transform** (logicle
or arcsinh). Each of them, done wrong or twice, still produces a plausible-looking plot.

Two BSD-3-licensed Python libraries cover this, both from the same author:

- **FlowIO** — reads and writes FCS 2.0 / 3.0 / 3.1. Raw bytes, metadata, nothing else.
- **FlowKit** — built on FlowIO and flowutils. Preprocessing, compensation, transforms,
  GatingML 2.0, and FlowJo 10 workspaces. Use this for anything beyond reading a header.

```bash
pip install flowkit          # pulls in flowio and flowutils
```

No account, key or license acceptance. FlowKit is pure Python; flowutils ships compiled
wheels for CPython 3.12–3.14 on Linux, macOS and Windows. FlowKit's plotting uses Bokeh and
is optional for everything here.

The examples use small public files from the FlowIO and FlowKit repositories:

```python
import urllib.request
BASE = "https://raw.githubusercontent.com/whitews/"
LSRII = "101_DEN084Y5_15_E01_008_clean.fcs"   # BD LSRII, FCS 3.1, 290k events, 17 MB
files = {
    "accuri.fcs":    "FlowIO/master/data/fcs_files/B01%20KC-A-W---91-US.fcs",   # BD Accuri C6 Plus, FCS 3.1
    "calibur.fcs":   "FlowIO/master/data/fcs_files/data1.fcs",                  # FACSCalibur, FCS 2.0
    "coulter.lmd":   "FlowIO/master/data/fcs_files/coulter.lmd",                # Beckman Coulter, 2 data sets
    LSRII:           "FlowKit/master/data/8_color_data_set/fcs_files/" + LSRII,  # keep this name — see section 5
    "8_color_ICS.wsp": "FlowKit/master/data/8_color_data_set/8_color_ICS.wsp",  # FlowJo 10 workspace
}
for name, path in files.items():
    urllib.request.urlretrieve(BASE + path, name)
```

## 1. Read the metadata before the events

```python
import flowio, flowkit as fk

meta = flowio.FlowData("accuri.fcs", only_text=True)     # TEXT segment only — fast on big files
print(meta.version, meta.event_count, meta.channel_count, meta.text.get("cyt"))

s = fk.Sample("accuri.fcs")
print(s.channels[["channel_number", "pnn", "pns", "png", "pne", "pnr"]])
print("fluorescence:", [s.pnn_labels[i] for i in s.fluoro_indices])
print("scatter:", [s.pnn_labels[i] for i in s.scatter_indices], "time:", s.time_index)
```

Things to read off that table before doing anything else:

- **`PnN` is the detector, `PnS` is the marker.** `FL1-A` vs `FITC-A`, `R780-A` vs `CD3`.
  Compensation, gates and FlowJo workspaces key on `PnN`; people talk in `PnS`. `PnS` is
  optional, is often blank, and is **not unique** — a CyTOF file checked here labels two
  different metal channels `CD14`. Select columns by `PnN` and use `PnS` only for display.
- **Metadata keys are lowercased and lose their `$`.** `$SPILLOVER` is
  `s.metadata["spillover"]`, `$P3N` is `s.metadata["p3n"]`.
- **Fluorescence vs scatter vs time is a name heuristic.** `FSC-*`/`SSC-*` are scatter,
  `Time` is time, and **everything else counts as fluorescence** — including an Accuri
  `Width` channel and a CyTOF `Cell_length`. That classification decides what gets
  compensated and transformed, so check it (sections 3 and 4).

## 2. What "raw" means: preprocessing

FlowKit's `source="raw"` is **not** the bytes on disk. By default (`preprocess=True`) it has
undone the instrument's encoding, which is what you want:

| keyword | meaning | what preprocessing does |
|---|---|---|
| `$PnE` = `f1,f2` with `f1 > 0` | log amplifier: value stored as a channel number over `f1` decades | converts back to linear, `f2 * 10^(f1 * x / PnR)` |
| `$PnG` | amplifier gain | divides linear channels by the gain |
| `$TIMESTEP` | seconds per time tick | multiplies the time channel |
| `$PnR` | range of the stored value | used above; also the natural `T` for transforms |

This matters most for **FCS 2.0 files from older BD analog instruments** (FACSCalibur,
FACScan): fluorescence is stored as 0–1023 channel numbers on a 4-decade log scale. Analyzing
those numbers as intensities compresses four decades into a linear axis.

```python
d = flowio.FlowData("calibur.fcs")
stored, linear = d.as_array(preprocess=False), d.as_array(preprocess=True)
for i in (0, 2):
    print(d.pnn_labels[i], "PnE", d.text[f"p{i+1}e"], "PnG", d.text.get(f"p{i+1}g"),
          "| stored max", stored[:, i].max(), "-> preprocessed max", round(linear[:, i].max(), 1))
```

Observed: `FSC-H` (gain 3.67) 1023 → 278.7; `FL1-H` (`PnE 4,0`) 768 → 1000.0. Modern digital
instruments store linear floats with `PnE 0,0` and gain 1, so preprocessing changes only the
time channel — which is why skipping it goes unnoticed until someone opens an old file.

**Files with more than one data set.** Beckman Coulter `.LMD` files hold two copies of the
run. `FlowData` refuses them (`MultipleDataSetsError`); read both and pick deliberately:

```python
sets = flowio.read_multiple_data_sets("coulter.lmd", ignore_offset_error=True)
for ds in sets:
    a = ds.as_array()
    print(ds.version, ds.event_count, ds.pnn_labels[:3], "FL1 max", round(a[:, 2].max(), 1))
```

Observed: an FCS 2.0 set (`FL1 Log`, 16-bit, `PnE 4.0,0.1024`, max 187.1) and an FCS 3.0 set
(`FL1`, 32-bit linear, max 193024) with the same 18,110 events. The two are on different
scales — use the 3.0 set and never mix them. `ignore_offset_error=True` is needed here
because the file declares its data end one byte off, a common and harmless writer bug;
only reach for it when the error message names an off-by-one offset.

## 3. Compensation

Every fluorochrome spills into neighboring detectors. The acquisition software stores the
spillover matrix in the file, under a keyword that depends on vendor and FCS version:

| keyword (FlowKit key) | where you meet it |
|---|---|
| `$SPILLOVER` (`spillover`) | the FCS 3.1 standard keyword |
| `$SPILL` / `SPILL` (`spill`) | BD instruments in FCS 2.0 and 3.0 — e.g. a FACSAria FCS 2.0 file checked here |
| `$COMP` (`comp`) | rare, older |
| none | CyTOF, most spectral exports, single-color files — nothing to apply |

The value is one line: `n, n detector names, n×n values` row by row. It is a **spillover**
matrix (fraction of signal from row fluorochrome seen in column detector); compensation
multiplies by its inverse. FlowKit handles the inversion — do not invert it yourself first.

```python
import numpy as np

s = fk.Sample(LSRII)
spill_key = next((k for k in ("spillover", "spill", "comp") if k in s.metadata), None)
print("spill keyword:", spill_key)
s.apply_compensation(s.metadata[spill_key])
print(s.compensation.as_dataframe().round(3).iloc[:3, :3])

raw, comp = s.get_events(source="raw"), s.get_events(source="comp")
touched = [s.pnn_labels[i] for i in range(raw.shape[1]) if not np.allclose(raw[:, i], comp[:, i])]
print("columns changed:", touched)
print("negative fraction in fluorescence after comp:",
      round(float((comp[:, s.fluoro_indices] < 0).mean()), 3))
```

**The matrix must cover every channel FlowKit classed as fluorescence**, and it often does
not. The Accuri file's `$SPILLOVER` lists eight `FL*` detectors, but FlowKit classes `Width`
as fluorescence too, so compensation fails with `Matrix labels do not match given fluorescent
labels … Width`. Declare such channels null when loading — not by editing the matrix:

```python
s = fk.Sample("accuri.fcs", null_channel_list=["Width"])
s.apply_compensation(s.metadata["spillover"])
print(s.compensation.matrix.shape, "applied to", s.compensation.detectors)
```

Sanity checks after compensating:

- **Some negative values are expected**: compensation subtracts, and noise around zero goes
  negative. A few percent of fluorescence values below zero is normal (2.6% on the LSRII file,
  5% on a FACSAria file). That is why log axes are wrong for compensated data — see section 4.
- **A matrix that is the identity compensates nothing.** An Attune file checked here carried
  a `$SPILLOVER` that was exactly the identity. Print the off-diagonal before claiming the
  data are compensated.
- **The in-file matrix is the one set at acquisition.** If the lab re-computed compensation
  from single-stain controls in FlowJo, that matrix lives in the workspace, not in the FCS
  file (section 5).
- **Spectral data** (Cytek, Sony) is unmixed, not compensated: more detectors than
  fluorochromes, a non-square matrix. FlowKit has `fk.SpectralMatrix` (ordinary least
  squares) for that; most spectral exports are already unmixed, so check whether the channels
  are detectors or fluorochromes before unmixing again.

## 4. Transforms — logicle for flow, arcsinh with a cofactor for CyTOF

Compensated fluorescence spans negative values to ~10⁵. A log axis cannot show the negatives
and stretches noise near zero into fake populations. Use a transform that is linear near zero
and logarithmic above.

**Logicle** (the FlowJo "biexponential" family) is the default for conventional flow. FlowKit
uses GatingML 2.0 parameters:

- `param_t` — top of scale; use the channel's `$PnR` (262144 on most BD digital instruments,
  16777216 on an Accuri). A wrong `T` squeezes or clips the top.
- `param_w` — width of the linear region in decades; 0.5 is the usual start, raise it when the
  negative spread around zero is wide.
- `param_m` — decades on the log part; 4.5 is standard.
- `param_a` — extra negative decades; 0 unless data run far below zero.

```python
s = fk.Sample(LSRII)
s.apply_compensation(s.metadata["spillover"])
t = float(s.metadata["p7r"])                      # $PnR of a fluorescence channel
s.apply_transform(fk.transforms.LogicleTransform(param_t=t, param_w=0.5, param_m=4.5, param_a=0))
x = s.get_events(source="xform")                  # compensated, then transformed
fl = x[:, s.fluoro_indices]
print("T =", t, "| fluorescence range", fl.min().round(3), "to", fl.max().round(3),
      "| FSC-A untouched:", x[:, 0].max())
```

Transformed fluorescence lands on roughly 0–1 (slightly below 0 for strongly negative events).
`apply_transform` touches **fluorescence channels only** unless `include_scatter=True`; scatter
stays linear, which is correct for FSC/SSC gating.

**arcsinh with a cofactor** is the convention for mass cytometry and common for flow in
clustering pipelines: `y = arcsinh(x / c)`, cofactor **5 for CyTOF**, roughly **150 for
fluorescence flow** (some groups use 120–200; spectral pipelines often tune per channel).
**This is not `fk.transforms.AsinhTransform`.** That class is the GatingML parametrized form,
scaled so `T` maps to 1, and gives completely different numbers:

```python
v = np.array([0.0, 150.0, 262144.0])
print("GatingML AsinhTransform:", fk.transforms.AsinhTransform(param_t=262144, param_m=4, param_a=0).apply(v).round(3))
print("arcsinh(x/150):        ", np.arcsinh(v / 150).round(3))
```

Observed `[0, 0.193, 1]` against `[0, 0.881, 8.159]`. Published CyTOF and clustering methods
mean the second. Apply it with numpy, and choose the channels yourself — on a CyTOF file
FlowKit classes `Cell_length` and every barcode, bead and DNA channel as "fluorescence", and
only the antibody channels should be transformed:

```python
def arcsinh_frame(sample, channels, cofactor):
    df = sample.as_dataframe(source="comp" if sample.compensation is not None else "raw",
                             col_multi_index=False)
    df[channels] = np.arcsinh(df[channels] / cofactor)
    return df

s = fk.Sample(LSRII)
s.apply_compensation(s.metadata["spillover"])
markers = [s.pnn_labels[i] for i in s.fluoro_indices]          # 7 antibodies + a viability dye here
df = arcsinh_frame(s, markers, cofactor=150)
print(df[markers].describe().loc[["min", "50%", "max"]].round(2).iloc[:, :4])
```

Sanity check on any transform: plot a histogram of a marker you know is bimodal (CD3 on PBMC,
CD4 vs CD8). A good transform shows the negative population as a tight peak at the low end;
a cofactor too small splits that peak into two "populations" that are only noise.

## 5. FlowJo workspaces — reuse the lab's gates

When gates were drawn in FlowJo 10, load the `.wsp` with the FCS files rather than redrawing.
FlowKit applies the workspace's own compensation matrices and transforms:

```python
wsp = fk.Workspace("8_color_ICS.wsp", fcs_samples=LSRII)
print(wsp.get_sample_ids(), wsp.get_sample_groups())
assert wsp.get_sample_ids(), "no FCS file matched the workspace — check file names"
sid = wsp.get_sample_ids()[0]
wsp.analyze_samples(sample_id=sid)
rep = wsp.get_gating_results(sid).report
print(rep[["gate_path", "gate_name", "count", "relative_percent"]].head(8).to_string())

try:
    wsp.get_gate_membership(sid, "TNFa+")
except ValueError as e:
    print("ambiguous:", e)
cd8_tnf = wsp.get_gate_membership(sid, "TNFa+", gate_path=("root", "Time", "Singlets", "aAmine-", "CD3+", "CD8+"))
print("CD8 TNFa+ events:", int(cd8_tnf.sum()))
```

Observed: Singlets 239,001; CD3+ 133,670; CD4+ 82,484; CD8+ 47,165; CD8 TNFa+ 8. **Gate names
repeat across branches** — `TNFa+` exists under both CD4+ and CD8+ — so always address a gate
by its path.

**Files are matched to the workspace by sample ID** — the `$FIL` keyword when the file has one,
otherwise the file name on disk. This LSRII file has no `$FIL`, so saving it as `lsrii.fcs`
makes it match nothing: the workspace loads without complaint, `get_sample_ids()` returns
`[]`, and `analyze_samples` then dies with a `ZeroDivisionError`. Keep the names FlowJo saw,
and check `get_sample_ids()` is non-empty before analyzing. `fcs_samples` also takes a
directory; workspace samples with no matching file are skipped silently. Before trusting the
result, compare a few counts against the statistics the lab
exported from FlowJo — they should agree to the event.

## 6. Subsampling

FlowKit keeps a fixed random subsample (10,000 events, seed 1 by default) for plotting.
`get_events`, `as_dataframe` and `export` return **all events unless you pass
`subsample=True`**.

```python
s = fk.Sample(LSRII)
s.subsample_events(50000, random_seed=7)
print(s.get_events(source="raw", subsample=True).shape, "of", s.event_count)
```

Subsample for clustering or embedding to keep runtime sane, with a recorded seed and the
**same number of events per sample** so a large sample does not dominate. Report frequencies
and counts from the full event set, never from the subsample.

## 7. Writing FCS files

`flowio.create_fcs` writes FCS 3.1, float32 only, from a **flattened** event list:

```python
rng = np.random.default_rng(0)
events = rng.lognormal(6, 1.5, size=(10000, 3)).astype(np.float32)
with open("synthetic.fcs", "wb") as fh:
    flowio.create_fcs(fh, events.flatten().tolist(),
                      channel_names=["FSC-A", "SSC-A", "FL1-A"],
                      opt_channel_names=["", "", "CD4"],
                      metadata_dict={"CYT": "synthetic", "P3R": "262144"})
back = flowio.FlowData("synthetic.fcs")
print(back.version, back.event_count, back.pns_labels, np.allclose(back.as_array(), events))
```

`$PnR` defaults to 262144 when not given; set it to the real range if values exceed that, or
downstream tools will pick a transform top of scale that clips.

**Exporting processed events can cause double compensation.** `Sample.export(...,
include_metadata=True)` copies every original keyword — including `$SPILLOVER` — onto events
that are already compensated:

```python
s = fk.Sample(LSRII)
s.apply_compensation(s.metadata["spillover"])
s.export("comp_with_meta.fcs", source="comp", include_metadata=True)
s.export("comp_minimal.fcs", source="comp")
for f in ("comp_with_meta.fcs", "comp_minimal.fcs"):
    t = flowio.FlowData(f, only_text=True).text
    print(f, "still carries a spill matrix:", "spillover" in t or "spill" in t)
```

Observed: `True` for the first, `False` for the second. FlowJo and most tools apply an
in-file spillover matrix on load, so the first file gets compensated a second time. Export
compensated or transformed data without the original metadata, or write it yourself with
`create_fcs` and only the keywords you mean. Exporting `source="xform"` writes logicle values
(0–1) under a `$PnR` of 262144 — fine for re-reading in Python, misleading for anything that
will transform again. For hand-off to another tool, export `source="comp"` without metadata,
or ship the original FCS plus the compensation matrix and gates.

## Checklist before reporting a number

- `fk.Sample(...)` loaded with the default `preprocess=True`; FCS 2.0 log channels decoded.
- Fluorescence/scatter/time classification checked; non-marker channels declared null or
  excluded from transforms.
- Compensation: keyword found, matrix not the identity, applied once — and if a FlowJo
  workspace exists, its matrix used rather than the acquisition one.
- Transform: logicle with `T` from `$PnR`, or arcsinh with a stated cofactor (5 CyTOF,
  ~150 flow). Never log10 of compensated data.
- Gates addressed by full path; counts reconciled against FlowJo if gates came from there.
- Frequencies from all events; any subsample size and seed recorded.

## Try it

**Data** — two small public FCS files from the FlowIO repository (BSD-3-Clause), last
confirmed reachable 2026-11-06:

- `B01 KC-A-W---91-US.fcs` — BD Accuri C6 Plus, FCS 3.1, 1,589 events, carries `$SPILLOVER`
  and a `Width` channel the matrix does not cover.
- `data1.fcs` — BD FACSCalibur, FCS 2.0, 13,367 events, 4-decade log amplifiers and a gain on
  forward scatter.

The run routes through both traps: compensation without the null channel must fail, and the
log-amplified file must change scale under preprocessing.

```python
import urllib.request, numpy as np, flowio, flowkit as fk

BASE = "https://raw.githubusercontent.com/whitews/FlowIO/master/data/fcs_files/"
urllib.request.urlretrieve(BASE + "B01%20KC-A-W---91-US.fcs", "accuri.fcs")
urllib.request.urlretrieve(BASE + "data1.fcs", "calibur.fcs")

# 1. the null-channel trap
s = fk.Sample("accuri.fcs")
try:
    s.apply_compensation(s.metadata["spillover"])
    raise SystemExit("expected a label mismatch on Width")
except ValueError as e:
    assert "Width" in str(e)
s = fk.Sample("accuri.fcs", null_channel_list=["Width"])
s.apply_compensation(s.metadata["spillover"])
spill = s.compensation.matrix
raw, comp = s.get_events(source="raw"), s.get_events(source="comp")
fl = s.fluoro_indices
print("accuri      :", s.version, s.event_count, "events,", len(fl), "fluorescence channels")
print("matrix      :", spill.shape, "max off-diagonal", round(float((spill - np.eye(len(spill))).max()), 4))
print("neg after comp:", round(float((comp[:, fl] < 0).mean()), 4), "| before:", round(float((raw[:, fl] < 0).mean()), 4))

# 2. logicle on compensated data, T from $PnR
t = float(s.metadata["p3r"])
s.apply_transform(fk.transforms.LogicleTransform(param_t=t, param_w=0.5, param_m=4.5, param_a=0))
x = s.get_events(source="xform")[:, fl]
print("logicle     : T =", t, "range", round(float(x.min()), 3), "to", round(float(x.max()), 3))

# 3. FCS 2.0 log-amplifier decoding
d = flowio.FlowData("calibur.fcs")
stored, lin = d.as_array(preprocess=False), d.as_array(preprocess=True)
print("calibur     :", d.version, d.event_count, "events; FL1-H PnE", d.text["p3e"],
      "stored max", stored[:, 2].max(), "-> linear max", round(float(lin[:, 2].max()), 1),
      "| FSC-H gain", d.text["p1g"], "->", round(float(lin[:, 0].max()), 1))

assert s.version == "3.1" and s.event_count == 1589 and spill.shape == (8, 8)
assert (comp[:, fl] < 0).mean() > (raw[:, fl] < 0).mean()          # compensation subtracts
assert -1 < x.min() and x.max() < 1.2                                 # logicle lands near 0-1
assert d.version == "2.0" and stored[:, 2].max() <= 1023
assert abs(lin[:, 2].max() - 10 ** (4 * stored[:, 2].max() / 1024)) < 1e-6 * lin[:, 2].max()
assert abs(lin[:, 0].max() - stored[:, 0].max() / float(d.text["p1g"])) < 1e-6
print("all checks passed")
```

**Expect**

Invariants — a failure means the skill is wrong:

- Compensating the Accuri file without declaring `Width` null raises a `ValueError` naming
  `Width`; with it, an 8×8 matrix is applied.
- The fraction of negative fluorescence values rises after compensation.
- Logicle output on compensated data sits near 0–1.
- On the FCS 2.0 file, preprocessing maps a stored log channel `x` to `10^(4x/1024)` and divides
  forward scatter by its `$PnG`.

Observed 2026-11-06 with flowkit 1.3.2 / flowio 1.4.0 — numbers to compare, not assertions:

```
accuri      : 3.1 1589 events, 8 fluorescence channels
matrix      : (8, 8) max off-diagonal 0.263
neg after comp: 0.0592 | before: 0.0
logicle     : T = 16777216.0 range 0.108 to 0.53
calibur     : 2.0 13367 events; FL1-H PnE 4,0 stored max 768.0 -> linear max 1000.0 | FSC-H gain 3.67 -> 278.7
all checks passed
```

## Sources

- FlowKit — https://github.com/whitews/FlowKit (BSD-3-Clause); documentation at
  https://flowkit.readthedocs.io
- FlowIO — https://github.com/whitews/FlowIO (BSD-3-Clause)
- White S et al. (2021) FlowKit: a Python toolkit for integrated manual and automated
  cytometry analysis workflows. *Frontiers in Immunology* 12:768541 —
  https://doi.org/10.3389/fimmu.2021.768541
- Spidlen J et al. (2021) Data File Standard for Flow Cytometry, Version FCS 3.2.
  *Cytometry A* 99:100–102 — https://doi.org/10.1002/cyto.a.24225
- Moore WA, Parks DR (2012) Update for the logicle data scale. *Cytometry A* 81A:273–277 —
  https://doi.org/10.1002/cyto.a.22030
- Bendall SC et al. (2011) Single-cell mass cytometry of differential immune and drug
  responses across a human hematopoietic continuum. *Science* 332:687–696 (arcsinh, cofactor 5) —
  https://doi.org/10.1126/science.1198704
