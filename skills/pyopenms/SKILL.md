---
name: pyopenms
description: Process LC-MS/MS data in Python with pyOpenMS — read mzML and mzXML, tell profile from centroid data, pick peaks, extract ion chromatograms with ppm windows, find and link features for metabolomics and proteomics, and read idXML, mzIdentML, pepXML and mzTab identifications with target-decoy FDR.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [mass-spectrometry, proteomics, metabolomics, file-io, mzml]
datasets: [https://raw.githubusercontent.com/OpenMS/OpenMS/v3.6.0/src/tests/topp/PeakPickerHiRes_input.mzML, https://raw.githubusercontent.com/OpenMS/OpenMS/v3.6.0/src/tests/topp/FeatureFinderMetabo_6_input.mzML, https://raw.githubusercontent.com/OpenMS/OpenMS/v3.6.0/src/tests/topp/FalseDiscoveryRate_5_input.idXML]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: pyopenms 3.6.0 / numpy 2.5.4 / pandas 3.1.1 / Python 3.12.13 on macOS arm64 / install command run in a fresh venv / all 18 Python body blocks run in page order in one fresh directory and Try it run again alone in a second fresh directory / techniques also checked on the PRIDE PXD000001 Orbitrap run (243 MB mzXML) and the 2012 PRIDE mzTab export of the same project
  executed: 20
  unverified: 0
---
# pyOpenMS

pyOpenMS is the Python binding of OpenMS, the open-source C++ library behind many proteomics
and metabolomics pipelines. It reads and writes the open mass-spectrometry formats, and it
exposes the same algorithms the OpenMS command-line tools run: peak picking, feature finding,
retention-time alignment, feature linking, and identification handling with target-decoy FDR.

Use it when the data are already in an open format (mzML, mzXML) and you need to look inside
them, or run one step of a pipeline under your own control. Vendor raw files (`.raw`, `.d`,
`.wiff`) are not read — convert them first, usually with ProteoWizard `msconvert`. For finding
public datasets to work on, the `pride`, `metabolights` and `metabolomics-workbench` skills
cover the repositories; this skill starts once the files are on disk.

```bash
pip install "pyopenms[dataframes]"     # the extra pulls in pandas for the to_df() helpers
```

No account, key or license acceptance; OpenMS is BSD-3-Clause. The 3.6 wheels on PyPI are
`abi3` builds for CPython 3.11 and newer, on Linux x86-64 and aarch64 (glibc 2.34+, so
Ubuntu 22.04 or later), Windows x86-64 and **Apple-silicon macOS 15+ only**. On an Intel Mac
or an older Linux, install from bioconda (`conda install -c bioconda pyopenms`, which has
`osx-64`). On macOS, `import pyopenms` prints a two-line note that memory status cannot be
measured; it is harmless.

**pyOpenMS 3.6 changed its binding layer, and most code on the web is for 3.5 or older.**
Many algorithms now *return* their result instead of filling an output argument you pass in —
`PeakPickerHiRes.pickExperiment(exp)` returns a new experiment, `MassTraceDetection.run(exp)`
returns a list, `IdXMLFile().load(path)` returns a tuple. Others did not change: file
`load(path, exp)` still fills the object you pass, and `PeakPickerHiRes.pick(in, out)` still
takes an output spectrum. A 3.5-style call fails loudly with `TypeError: ... incompatible
function arguments` and prints the accepted signatures; read them (`help(obj.method)`) rather
than guessing. Pin the version you wrote against.

The examples use small files from the OpenMS test suite at the `v3.6.0` tag (BSD-3-Clause):

```python
import urllib.request
BASE = "https://raw.githubusercontent.com/OpenMS/OpenMS/v3.6.0/src/tests/topp/"
for name in ["PeakPickerHiRes_input.mzML",        # profile Orbitrap MS1 + centroided MS2
             "FeatureFinderMetabo_6_input.mzML",  # centroided small-molecule LC-MS
             "FeatureFinderCentroided_1_input.mzML",  # centroided peptide LC-MS
             "FileConverter_4_input.mzXML",
             "FalseDiscoveryRate_5_input.idXML",  # PSMs with target and decoy hits
             "IDFileConverter_23_input.mzid",
             "MzTabExporter_8_output.mzTab",
             "FeatureLinkerUnlabeled_1_input1.featureXML",
             "FeatureLinkerUnlabeled_1_input2.featureXML",
             "FeatureLinkerUnlabeled_1_input3.featureXML"]:
    urllib.request.urlretrieve(BASE + name, name)
```

## 1. Read spectra

```python
import numpy as np, pyopenms as oms

exp = oms.MSExperiment()
oms.MzMLFile().load("PeakPickerHiRes_input.mzML", exp)     # fills exp; returns None
print(exp.getNrSpectra(), "spectra,", exp.getNrChromatograms(), "chromatograms")
for s in exp:
    mz, inten = s.get_peaks()                                # two numpy arrays
    prec = s.getPrecursors()
    print(s.getNativeID(), "MS%d" % s.getMSLevel(), "RT %.2f s" % s.getRT(), len(mz), "points",
          "precursor m/z %.4f z=%d" % (prec[0].getMZ(), prec[0].getCharge()) if prec else "")

mzx = oms.MSExperiment()
oms.MzXMLFile().load("FileConverter_4_input.mzXML", mzx)    # same object model for mzXML
print("mzXML:", mzx.getNrSpectra(), "spectra")
```

- **Retention time is in seconds** everywhere in the object model. The MassQL export
  (`exp.get_massql_df()`) is the exception: it reports minutes. Check the unit before
  comparing with a vendor viewer, which usually shows minutes.
- `exp.updateRanges()` must run before `getMinRT()`, `getMaxMZ()` and friends mean anything
  after you modify an experiment; on a freshly loaded file they are already set.
- **Iterating gives copies.** `for s in exp: s.setType(...)` and `exp[0].setMSLevel(...)`
  change a copy and leave `exp` untouched, with no warning. To modify spectra, take the list,
  change it, and put it back: `specs = exp.getSpectra(); ...; exp.setSpectra(specs)`.

For tables, `to_df()` gives one row per spectrum (arrays in cells) and
`to_df(long_format=True)` one row per peak:

```python
peaks = exp.to_df(long_format=True)
print(peaks.dtypes.to_dict())
print(peaks.groupby("ms_level").size().to_dict())
```

`rt` and `intensity` come back as float32 and `mz` as float64 — fine for plotting, but do
mass arithmetic on the float64 `mz` column, not on anything you have cast down.

**Large files.** Loading pulls every peak into memory; a 60-minute Orbitrap run (PRIDE
PXD000001, 7,534 spectra, 36.5 million MS1 points) is a few GB. Two ways to stay small:

```python
f = oms.MzMLFile()
opts = f.getOptions()
opts.setMSLevels([1])                    # skip MS2 at parse time
f.setOptions(opts)
ms1 = oms.MSExperiment()
f.load("PeakPickerHiRes_input.mzML", ms1)
print("MS1 only:", ms1.getNrSpectra())

oms.MzMLFile().store("indexed_copy.mzML", exp)   # store() writes indexed mzML
od = oms.OnDiscMSExperiment()
assert od.openFile("indexed_copy.mzML")           # needs an *indexed* mzML
print("on disk:", od.getNrSpectra(), "| spectrum 1 has", od.getSpectrum(1).size(), "peaks")
```

`OnDiscMSExperiment` reads one spectrum at a time from an indexed mzML (the `<indexedmzML>`
wrapper `msconvert` writes by default). On a plain, unindexed mzML `openFile` returns
`False` rather than raising — the test file loaded above is one — so check the return value.
It refuses mzXML outright. Its `getMetaData()` holds spectrum headers with no peaks.

## 2. Profile or centroid — check the data, not the label

Peak picking (centroiding) turns each profile peak into one m/z–intensity pair. Feature
finders and search engines expect centroided data; running them on profile data produces
thousands of spurious "peaks" per real one. Every spectrum carries a declared type, and the
declaration is often missing or wrong:

```python
pte = oms.PeakTypeEstimator()
for s in exp:
    print("MS%d" % s.getMSLevel(), "declared", s.getType().name, "| from the data", pte.estimateType(s).name)
```

Here the profile MS1 spectra declare `UNKNOWN`. Worse, the PRIDE PXD000001 mzXML declares
`centroided="1"` while its MS1 spectra are plainly profile (an Orbitrap peak sampled every
~0.0017 m/z with zero-intensity flanks, and `PeakTypeEstimator` says `PROFILE`). Note that
`s.getType(True)` does **not** settle this: it only looks at the data when the declared type
is `UNKNOWN`.

Picking with `PeakPickerHiRes` (for high-resolution Orbitrap and TOF data):

```python
pp = oms.PeakPickerHiRes()
picked = pp.pickExperiment(exp)                  # 3.6: returns a new MSExperiment
for a, b in zip(exp, picked):
    print("MS%d" % a.getMSLevel(), a.size(), "->", b.size(), b.getType().name)
```

`pickExperiment` skips spectra whose declared type is already centroid — the MS2 spectra
above pass through unchanged, which is right. But it also skips a profile spectrum that is
*mislabelled* centroid, and passing `check_spectrum_type=False` does not change that. Fix
the label first, then pick:

```python
ST = type(oms.MSSpectrum().getType())            # the SpectrumType enum
specs = exp.getSpectra()
for s in specs:
    if s.getMSLevel() == 1 and pte.estimateType(s) == ST.PROFILE:
        s.setType(ST.PROFILE)
exp_fixed = oms.MSExperiment(exp)
exp_fixed.setSpectra(specs)
picked = pp.pickExperiment(exp_fixed)
print("MS1 points after picking:", [s.size() for s in picked if s.getMSLevel() == 1])
```

On PXD000001 this took 1,431 MS1 spectra from 36.5 million points to 2.9 million in under
3 seconds; without the relabel, nothing was picked and nothing complained. Single spectra can
be picked regardless of label with `pp.pick(spectrum, out_spectrum)`.

Parameters worth knowing (`pp.getDefaults()` lists all): `signal_to_noise` (default `0`,
keep everything; `1`–`3` drops noise peaks, which on the MS1 above cut 889 picked peaks to
~200), and `ms_levels` (`[]` means all levels).

## 3. Mass tolerance — ppm or Da, and which one a parameter wants

Mass accuracy scales with m/z, so high-resolution data are described in **ppm**. A fixed Da
window is too wide at low m/z and too narrow at high m/z:

```python
def ppm_error(observed, theoretical):
    return (observed - theoretical) / theoretical * 1e6

def ppm_to_da(mz, ppm):
    return mz * ppm * 1e-6

for mz in (200.0, 500.0, 1500.0):
    print(f"m/z {mz:6.0f}: 10 ppm = {ppm_to_da(mz, 10):.4f} Da;  0.01 Da = {0.01 / mz * 1e6:5.1f} ppm")
```

Typical settings: Orbitrap MS1 3–10 ppm, Q-TOF 10–20 ppm, ion-trap MS2 0.3–0.5 Da.
Every OpenMS parameter fixes its own unit, and they differ between algorithms. Read the name
and description before setting a number:

| algorithm | parameter | unit |
|---|---|---|
| `MassTraceDetection` | `mass_error_ppm` (default 20) | ppm |
| `FeatureFinderAlgorithmPicked` | `mass_trace:mz_tolerance` | Th (Da/z) |
| `FeatureGroupingAlgorithmQT` | `distance_MZ:max_difference` + `distance_MZ:unit` | **Da by default (0.3)** |
| search results (`getSearchParameters()`) | `precursor_mass_tolerance` + `..._ppm` flag | either |

The linker default — 0.3 Da — is coarse enough to merge different compounds in a
high-resolution metabolomics run. Set `distance_MZ:unit` to `ppm` explicitly.

An extracted-ion chromatogram (XIC) with a ppm window is the most common question a lab
asks of a run — "how much of my compound is there, and when does it elute":

```python
def xic(experiment, target_mz, ppm=5.0, ms_level=1):
    df = experiment.to_df(long_format=True)
    df = df[df.ms_level == ms_level]
    half = ppm_to_da(target_mz, ppm)
    hit = df[(df.mz - target_mz).abs() <= half]
    return hit.groupby("rt")["intensity"].max()   # one point per scan (max, not sum, in centroid data)

met = oms.MSExperiment()
oms.MzMLFile().load("FeatureFinderMetabo_6_input.mzML", met)
trace = xic(met, 576.2838, ppm=5)          # the strongest feature in section 4
print(len(trace), "scans; apex at RT", trace.idxmax(), "s, intensity", round(float(trace.max())))
print("same m/z at 50 ppm:", len(xic(met, 576.2838, ppm=50)), "scans, max", round(float(xic(met, 576.2838, ppm=50).max())))
```

Use this on centroided data; on profile data, pick first or every profile point inside the
window counts. Here 5 and 50 ppm return the same 31 scans because nothing else sits near that
m/z; in a crowded region the wide window adds a neighbor's signal to yours. The XIC apex
(~2.6 × 10⁵) is a peak *height*; the feature finder below reports the same compound as an
integrated *area* (~3.3 × 10⁶). Do not compare one with the other.

## 4. Feature finding

A **feature** is one analyte's signal across retention time and its isotope peaks: an m/z,
an RT, a charge and an integrated intensity. It is what you quantify. Pick the algorithm by
analyte:

- **Small molecules** (metabolomics, lipidomics): `MassTraceDetection` →
  `ElutionPeakDetection` → `FeatureFindingMetabo`.
- **Peptides** (label-free proteomics): `FeatureFinderAlgorithmPicked`, which fits peptide
  isotope patterns for charges 1–4.

Both need centroided input (section 2).

```python
def find_small_molecule_features(experiment, ppm=10.0, noise=1e3):
    experiment.sortSpectra(True)
    mtd = oms.MassTraceDetection()
    p = mtd.getDefaults()
    p.setValue("mass_error_ppm", ppm)            # float parameter: pass a float
    p.setValue("noise_threshold_int", noise)     # absolute intensity, instrument-specific
    mtd.setParameters(p)
    traces = mtd.run(experiment)                  # 3.6: returns a list

    epd = oms.ElutionPeakDetection()
    split = epd.detectPeaks(traces)               # splits traces holding >1 chromatographic peak

    ffm = oms.FeatureFindingMetabo()
    q = ffm.getDefaults()
    q.setValue("remove_single_traces", "true")    # drop features with no isotope trace
    ffm.setParameters(q)
    features = oms.FeatureMap()
    ffm.run(split, features)                      # fills the map (and returns a tuple)
    features.setUniqueIds()
    return len(traces), features

met = oms.MSExperiment()
oms.MzMLFile().load("FeatureFinderMetabo_6_input.mzML", met)
for ppm in (5.0, 20.0):
    n, fm = find_small_molecule_features(met, ppm=ppm, noise=10.0)
    print(f"{ppm:4.0f} ppm: {n} mass traces -> {fm.size()} features")
df = fm.to_df()
print(df[["charge", "rt", "mz", "intensity", "quality"]].sort_values("intensity", ascending=False).head())
```

- **`noise_threshold_int` is an absolute intensity.** The default (10) suits nothing in
  particular; Orbitrap intensities run 10⁴–10⁹, TOF counts far lower. Look at the intensity
  distribution (`peaks.intensity.describe()`) and set it near the noise floor. On the full
  PXD000001 run, a threshold of 10⁵ still produced over 100,000 features and took minutes —
  the number of features is a parameter choice, not a property of the sample.
- **`mass_error_ppm` too tight splits one compound's trace into several**, too loose merges
  neighbors. Above, 5 ppm and 20 ppm give different feature counts on the same file; choose
  from the instrument's measured accuracy, not the default.
- `isotope_filtering_model` defaults to a metabolite isotope model; `charge_upper_bound`
  defaults to 3.

Peptides:

```python
pep_exp = oms.MSExperiment()
oms.MzMLFile().load("FeatureFinderCentroided_1_input.mzML", pep_exp)
pep_exp.updateRanges()
ffp = oms.FeatureFinderAlgorithmPicked()
params = ffp.getDefaults()
pep_features, seeds = oms.FeatureMap(), oms.FeatureMap()
ffp.run(pep_exp, pep_features, params, seeds)   # still the fill-the-argument style
pep_features.setUniqueIds()
print(pep_features.size(), "peptide features")
print(pep_features.to_df()[["charge", "rt", "mz", "intensity"]].head(3))
```

**Parameters are checked strictly on type and loosely on name.** Setting an integer on a
float parameter (`p.setValue("chrom_fwhm", 5)`) makes `setParameters` raise `Wrong parameter
type 'integer' for float parameter`. A misspelled key (`chrom_fwhn`) is accepted with only a
`received the unknown parameter` warning on stderr, and your value is silently ignored.
Guard against the second:

```python
def set_params(algo, **values):
    p = algo.getDefaults()
    for key, value in values.items():
        if not p.exists(key):
            raise KeyError(f"{type(algo).__name__} has no parameter {key!r}")
        p.setValue(key, value)
    algo.setParameters(p)

set_params(oms.FeatureFindingMetabo(), chrom_fwhm=5.0, remove_single_traces="true")
try:
    set_params(oms.FeatureFindingMetabo(), chrom_fwhn=5.0)
except KeyError as e:
    print("caught:", e)
```

Nested keys use colons (`"distance_MZ:unit"`). Boolean parameters accept `True` or the
strings `"true"`/`"false"`; anything else raises.

## 5. Across runs — align, then link

To compare samples, features from each run are matched into a `ConsensusMap`. Retention times
drift between runs, so align first and link second:

```python
runs = [f"FeatureLinkerUnlabeled_1_input{i}.featureXML" for i in (1, 2, 3)]
maps = []
for path in runs:
    fm = oms.FeatureMap()
    oms.FeatureXMLFile().load(path, fm)
    maps.append(fm)

ref = max(range(len(maps)), key=lambda i: maps[i].size())   # largest map as reference
aligner = oms.MapAlignmentAlgorithmPoseClustering()
aligner.setReference(maps[ref])
for i, fm in enumerate(maps):
    if i != ref:
        trafo = aligner.align(fm)                             # 3.6: returns the transformation
        oms.MapAlignmentTransformer().transformRetentionTimes(fm, trafo, True)

linker = oms.FeatureGroupingAlgorithmQT()
set_params(linker, **{"distance_MZ:max_difference": 10.0, "distance_MZ:unit": "ppm",
                      "distance_RT:max_difference": 30.0})
consensus = oms.ConsensusMap()
headers = consensus.getColumnHeaders()
for i, (path, fm) in enumerate(zip(runs, maps)):
    h = oms.ColumnHeader()
    h.filename, h.size = path, fm.size()
    headers[i] = h
consensus.setColumnHeaders(headers)
linker.group(maps, consensus)

table = consensus.to_df()
print(consensus.size(), "consensus features from", [m.size() for m in maps])
print("zeros per run:", (table[runs] == 0).sum().to_dict(), "| NaN:", int(table[runs].isna().sum().sum()))
print("present in all runs:", int((table[runs] > 0).all(axis=1).sum()))
```

**`ConsensusMap.to_df()` writes 0.0 where a feature was not found in a run, not NaN.** Not
detected is not the same as zero abundance; convert before any statistics
(`table[runs].replace(0, np.nan)`) and decide on imputation deliberately. Select run columns
by name — they are not guaranteed to come back in input order. On these three test maps,
alignment raised the number of features found in all three runs from 3 to 6 at a 30 s RT
window.

## 6. Identification files

Search engines write peptide-spectrum matches (PSMs) in several formats; pyOpenMS reads them
into the same two structures — protein-level runs and one `PeptideIdentification` per
spectrum, each holding ranked `PeptideHit`s:

```python
prot, peps = oms.IdXMLFile().load("FalseDiscoveryRate_5_input.idXML")   # 3.6: returns (proteins, peptides)
run = prot[0]
sp = run.getSearchParameters()
print(run.getSearchEngine(), "| precursor tol", sp.precursor_mass_tolerance,
      "ppm" if sp.precursor_mass_tolerance_ppm else "Da")
print(len(peps), "spectra with IDs; score", peps[0].getScoreType(),
      "higher is better:", peps[0].isHigherScoreBetter())
top = peps[0].getHits()[0]
print(top.getSequence().toString(), "z", top.getCharge(), "score", top.getScore(),
      "|", top.getMetaValue("target_decoy"))

mz_prot, mz_peps = oms.MzIdentMLFile().load("IDFileConverter_23_input.mzid")
print("mzIdentML:", len(mz_peps), "spectra; first RT:", mz_peps[0].getRT())
```

- **Search parameters are only as complete as the file.** This idXML reports a precursor
  tolerance of 0.0 — not recorded, not zero. Take tolerances from the search engine's own
  parameter file when they matter.
- **Score direction differs by engine and by stage.** Hyperscore and XCorr are higher-better;
  e-values, PEP and q-values are lower-better. Always read `isHigherScoreBetter()` and
  `getScoreType()` before sorting or thresholding.
- **mzIdentML may carry no retention time.** The file above loads 150 spectra with `RT = nan`
  (and a stderr note per spectrum); the link to the spectrum is the `spectrum_reference`
  meta value. Match on that, not on RT, when you need the spectrum back.
- **pepXML modifications are resolved by mass.** When the file gives only a delta mass,
  pyOpenMS picks one Unimod entry and warns that it was "not uniquely defined" — check the
  modification names in the sequences match what the search actually set.
- `PepXMLFile().load(path)` works the same way. Old-style calls that pass `prot, peps` lists
  to fill also still work for these three readers.

**Target-decoy FDR.** Search engines report a score; the false discovery rate comes from
decoy hits searched alongside. Each hit needs a `target_decoy` meta value (`target`, `decoy`
or `target+decoy`), which `PeptideIndexing` adds against a target+decoy FASTA if the engine
did not:

```python
pl = oms.PeptideIdentificationList()
for p in peps:
    pl.push_back(p)
before = sum(len(p.getHits()) for p in pl)
oms.FalseDiscoveryRate().apply(pl)
q = np.array([p.getHits()[0].getScore() for p in pl if p.getHits()])
print("hits", before, "->", sum(len(p.getHits()) for p in pl), "| score now", pl[0].getScoreType(),
      "higher better:", pl[0].isHigherScoreBetter())
print("PSMs at 1% FDR:", int((q <= 0.01).sum()), "| at 5%:", int((q <= 0.05).sum()))
print("original score kept as:", [k for k in pl[0].getHits()[0].getKeys() if k.endswith("_score")])
```

`FalseDiscoveryRate.apply` changes three things in place: **every score becomes a q-value**
(lower is better, so the direction flips), **decoy hits are removed** (66 decoy PSMs here, so
311 hits become 245), and the original score moves to a meta value such as `hyperscore_score`.
Without `target_decoy` it raises `Meta value 'target_decoy' does not exist`. Storing the result
with `IdXMLFile().store(...)` omits spectra left with no hits.

**mzTab.** pyOpenMS 3.6 loads mzTab into an object with no usable accessors, and fails
outright on the pre-1.0 drafts PRIDE generated for older projects (`Could not convert String
'--' to MzTabBoolean`). Read mzTab as what it is — tab-separated sections keyed by a line
prefix:

```python
import io, pandas as pd

def mztab_section(path, header, row):
    lines = [l.rstrip("\n") for l in open(path) if l.startswith((header + "\t", row + "\t"))]
    if not lines:
        return pd.DataFrame()
    return pd.read_csv(io.StringIO("\n".join(lines)), sep="\t",
                       na_values=["null", "--"]).drop(columns=[header])

print(open("MzTabExporter_8_output.mzTab").readline().strip())
for header, row in [("PRH", "PRT"), ("PEH", "PEP"), ("PSH", "PSM"), ("SMH", "SML")]:
    print(row, mztab_section("MzTabExporter_8_output.mzTab", header, row).shape)
```

`PRH`/`PRT` are proteins, `PEH`/`PEP` peptides, `PSH`/`PSM` spectrum matches and `SMH`/`SML`
small molecules. mzTab 1.0 writes missing values as `null`; the pre-1.0 drafts used `--`. The
same function read the 1,528 peptide rows of the 2012 PXD000001 export.

## 7. Peptide and formula masses

```python
seq = oms.AASequence.fromString("PEPTM(Oxidation)IDEK")
print(seq.toString(), "mono %.4f" % seq.getMonoWeight(), "| [M+2H]2+ m/z %.4f" % seq.getMZ(2),
      "|", seq.getFormula().toString())
print("glucose %.4f" % oms.EmpiricalFormula("C6H12O6").getMonoWeight())

tsg = oms.TheoreticalSpectrumGenerator()
set_params(tsg, add_metainfo="true")             # annotate ion names
theo = oms.MSSpectrum()
tsg.getSpectrum(theo, oms.AASequence.fromString("PEPTIDEK"), 1, 1)   # fills theo; charges 1..1
names = list(theo.getStringDataArrays()[0])
print([(round(float(m), 4), n) for m, n in zip(theo.get_peaks()[0][:4], names[:4])])
```

Modifications use Unimod names in parentheses, `M(Oxidation)`, `C(Carbamidomethyl)`;
`getMZ(z)` adds z protons. These are the numbers to put in an XIC (section 3) when looking for
a specific peptide.

## 8. Writing files

```python
import os
oms.MzMLFile().store("picked_plain.mzML", picked)
f = oms.MzMLFile()
o = f.getOptions()
o.setCompression(True)                           # zlib on the binary arrays
f.setOptions(o)
f.store("picked_zlib.mzML", picked)
print(os.path.getsize("picked_plain.mzML"), "->", os.path.getsize("picked_zlib.mzML"), "bytes")

oms.FeatureXMLFile().store("features.featureXML", fm)
oms.IdXMLFile().store("psms_fdr.idXML", prot, pl)
```

Uncompressed mzML is large — 72 MS1 spectra from PXD000001 wrote 10.8 MB plain and 3.9 MB
with zlib, and the full MS1 set grew from a 243 MB mzXML to 587 MB of plain mzML. Turn
compression on for anything you keep. `store` writes indexed mzML, which
`OnDiscMSExperiment` and most other tools can random-access. For hand-off to people,
`to_df()` on a `FeatureMap` or `ConsensusMap` and `to_csv` is usually what they want.

## Checklist before reporting a number

- The input format is open (mzML/mzXML) and the pyOpenMS version is recorded; 3.6 signatures
  differ from older tutorials.
- Profile vs centroid checked with `PeakTypeEstimator`, not just the declared type; MS1
  picked once.
- Every tolerance stated with its unit, and set from the instrument's accuracy rather than a
  default (linker default is 0.3 Da).
- Feature-finder noise threshold chosen from the file's own intensity distribution.
- Runs aligned before linking; missing values in the consensus table converted from 0 to NaN.
- Identifications: score direction read from the file; FDR computed from target-decoy hits,
  and the threshold (usually 1% PSM-level) stated.

## Try it

**Data** — three files from the OpenMS test suite at tag `v3.6.0` (BSD-3-Clause, no account),
last confirmed reachable 2026-11-06:

- `PeakPickerHiRes_input.mzML` — 5 spectra from an Orbitrap run: two profile MS1 spectra that
  declare no type, and three centroided MS2 spectra.
- `FeatureFinderMetabo_6_input.mzML` — 31 centroided MS1 spectra of a small-molecule LC-MS run.
- `FalseDiscoveryRate_5_input.idXML` — 311 PSMs scored by hyperscore, with target and decoy
  hits.

The run goes through the traps: modifying spectra while iterating (no effect), the 3.6
return-value API, picking only what is really profile, and the score flip under FDR.

```python
import urllib.request, numpy as np, pyopenms as oms

BASE = "https://raw.githubusercontent.com/OpenMS/OpenMS/v3.6.0/src/tests/topp/"
for name in ["PeakPickerHiRes_input.mzML", "FeatureFinderMetabo_6_input.mzML",
             "FalseDiscoveryRate_5_input.idXML"]:
    urllib.request.urlretrieve(BASE + name, name)

# 1. profile vs centroid, and the copy-on-iterate trap
exp = oms.MSExperiment()
oms.MzMLFile().load("PeakPickerHiRes_input.mzML", exp)
ST = type(oms.MSSpectrum().getType())
pte = oms.PeakTypeEstimator()
for s in exp:
    s.setType(ST.CENTROID)                                   # changes a copy only
declared = [s.getType() for s in exp]
estimated = [pte.estimateType(s) for s in exp]
levels = [s.getMSLevel() for s in exp]
print("declared :", [t.name for t in declared])
print("estimated:", [t.name for t in estimated], "levels", levels)

# 2. peak picking, 3.6 style
picked = oms.PeakPickerHiRes().pickExperiment(exp)
sizes = [(a.size(), b.size()) for a, b in zip(exp, picked)]
print("points before -> after:", sizes)

# 3. small-molecule features at two mass tolerances
met = oms.MSExperiment()
oms.MzMLFile().load("FeatureFinderMetabo_6_input.mzML", met)
met.sortSpectra(True)
counts = {}
for ppm in (5.0, 20.0):
    mtd = oms.MassTraceDetection()
    p = mtd.getDefaults(); p.setValue("mass_error_ppm", ppm); mtd.setParameters(p)
    traces = mtd.run(met)
    split = oms.ElutionPeakDetection().detectPeaks(traces)
    fm = oms.FeatureMap()
    oms.FeatureFindingMetabo().run(split, fm)
    counts[ppm] = (len(traces), fm.size())
print("traces, features by ppm:", counts)

# 4. target-decoy FDR flips the score
prot, peps = oms.IdXMLFile().load("FalseDiscoveryRate_5_input.idXML")
pl = oms.PeptideIdentificationList()
for p in peps:
    pl.push_back(p)
before = (pl[0].getScoreType(), pl[0].isHigherScoreBetter(), sum(len(p.getHits()) for p in pl))
oms.FalseDiscoveryRate().apply(pl)
after = (pl[0].getScoreType(), pl[0].isHigherScoreBetter(), sum(len(p.getHits()) for p in pl))
q = np.array([p.getHits()[0].getScore() for p in pl if p.getHits()])
print("before FDR:", before, "| after:", after, "| PSMs at 1% FDR:", int((q <= 0.01).sum()))

assert all(t.name == "UNKNOWN" for t, l in zip(declared, levels) if l == 1)   # setType on a copy did nothing
assert [e.name for e, l in zip(estimated, levels) if l == 1] == ["PROFILE", "PROFILE"]
assert all(b < a for (a, b), l in zip(sizes, levels) if l == 1)                # MS1 centroided
assert all(b == a for (a, b), l in zip(sizes, levels) if l == 2)               # MS2 left alone
assert all(n_feat > 0 for _, n_feat in counts.values())
assert before[1] is True and after[0] == "q-value" and after[1] is False
assert after[2] < before[2] and q.min() >= 0 and q.max() <= 1
print("all checks passed")
```

**Expect**

Invariants — a failure means the skill is wrong:

- Calling `setType` on spectra while iterating leaves the experiment unchanged; the profile
  MS1 spectra still declare `UNKNOWN`.
- `PeakTypeEstimator` calls both MS1 spectra profile; picking shrinks them and leaves the
  centroided MS2 spectra as they were.
- `pickExperiment(exp)` and `MassTraceDetection.run(exp)` return their results (3.6 API).
- After `FalseDiscoveryRate.apply`, the score type is `q-value`, lower is better, every q is
  in [0, 1], and the hit count drops because decoys are removed.

Observed 2026-11-06 with pyopenms 3.6.0 — numbers to compare, not assertions (OpenMS also
prints `Progress of ...` lines to the console, interleaved with these):

```
declared : ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']
estimated: ['PROFILE', 'CENTROID', 'CENTROID', 'CENTROID', 'PROFILE'] levels [1, 2, 2, 2, 1]
points before -> after: [(11934, 889), (415, 415), (905, 905), (522, 522), (12042, 889)]
traces, features by ppm: {5.0: (354, 179), 20.0: (394, 300)}
before FDR: ('hyperscore', True, 311) | after: ('q-value', False, 245) | PSMs at 1% FDR: 187
all checks passed
```

## Sources

- OpenMS — https://github.com/OpenMS/OpenMS (BSD-3-Clause); pyOpenMS documentation at
  https://pyopenms.readthedocs.io
- Röst HL et al. (2014) pyOpenMS: a Python-based interface to the OpenMS mass-spectrometry
  algorithm library. *Proteomics* 14:74–77 — https://doi.org/10.1002/pmic.201300246
- Pfeuffer J et al. (2024) OpenMS 3 enables reproducible analysis of large-scale mass
  spectrometry data. *Nature Methods* 21:365–367 — https://doi.org/10.1038/s41592-024-02197-7
- Kenar E et al. (2014) Automated label-free quantification of metabolites from liquid
  chromatography–mass spectrometry data. *Mol Cell Proteomics* 13:348–359
  (FeatureFindingMetabo) — https://doi.org/10.1074/mcp.M113.031278
- Elias JE, Gygi SP (2007) Target-decoy search strategy for increased confidence in
  large-scale protein identifications by mass spectrometry. *Nature Methods* 4:207–214 —
  https://doi.org/10.1038/nmeth1019
- PRIDE PXD000001 — the Orbitrap TMT run used to check profile detection and large-file
  handling, https://www.ebi.ac.uk/pride/archive/projects/PXD000001
