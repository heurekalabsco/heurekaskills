---
name: matchms
description: Import, clean and compare tandem mass spectra (MS/MS) in Python with matchms — MGF, MSP, mzML, JSON and USI loading, metadata harmonization, peak filtering, cosine and modified cosine scores with tolerances in daltons, and spectral library search for metabolite annotation, with the checks that catch one-peak false matches.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [mass-spectrometry, metabolomics, spectral-matching, cheminformatics, file-io]
datasets: [https://raw.githubusercontent.com/matchms/matchms/master/tests/testdata/pesticides.mgf, https://massbank.eu/MassBank-api/records/MSBNK-Athens_Univ-AU158003, https://massbank.eu/MassBank-api/records/MSBNK-Athens_Univ-AU162303]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: matchms 0.34.0 / numpy 2.5.4 / Python 3.12.13, Try it also run on Python 3.13.12 / all 9 body Python blocks and the install run in page order in one fresh directory and Try it run again alone in a second fresh directory / techniques also checked on the matchms test files gnps_spectra.json, massbank_five_spectra.msp, testdata.mzml and MoNA-export-GC-MS-first10.msp, three live USIs (GNPS library, MassBank, MassIVE) and MassBank records for morphine, codeine and heroin
  executed: 11
  unverified: 0
---
# matchms — comparing MS/MS spectra

matchms takes fragmentation spectra that have already been extracted from an LC-MS/MS or
GC-MS run and answers the question a metabolomics project keeps asking: **which known
compound, or which other spectrum in my data, does this spectrum look like?** It reads the
common spectrum file formats, repairs the metadata that every library writes differently,
cleans peaks, and computes similarity scores between every query and every reference.

What it does not do: peak picking, feature detection, alignment or quantification. Those
happen upstream (MZmine, MS-DIAL, OpenMS, XCMS), which export the MS/MS spectra — usually as
MGF — that matchms starts from.

```bash
pip install matchms
```

Apache-2.0, from the Netherlands eScience Center and collaborators. No account, key or license
acceptance. Version 0.34.0 supports Python 3.10–3.14 and pulls in RDKit, numba and pyteomics;
the first similarity call in a session spends about a second compiling.

**Version note.** `ModifiedCosine` was renamed `ModifiedCosineGreedy` in 0.32.0; code written
for older releases fails with an `ImportError` on that name. The developers describe 0.34 as
one of the last releases before a 1.0 with breaking changes, so pin the version in a project.

The examples use public files:

- `pesticides.mgf` from the matchms repository (Apache-2.0) — 76 negative-mode Orbitrap
  spectra of pesticide standards from a GNPS library collection, including repeat spectra of
  the same compound and the same compound as different adducts.
- MassBank records, fetched over MassBank's REST API. Each record carries its own license;
  the morphine and codeine records used here are CC BY.

```python
import urllib.request
BASE = "https://raw.githubusercontent.com/matchms/matchms/master/tests/testdata/"
for f in ["pesticides.mgf", "massbank_five_spectra.msp", "gnps_spectra.json", "testdata.mzml"]:
    urllib.request.urlretrieve(BASE + f, f)
```

## 1. Load spectra

```python
from matchms.importing import load_spectra
from matchms.logging_functions import set_matchms_logger_level
set_matchms_logger_level("ERROR")      # matchms logs a warning per spectrum for missing fields

spectra = list(load_spectra("pesticides.mgf"))
s = spectra[0]
print(len(spectra), s)
print(s.get("precursor_mz"), s.get("ionmode"), s.get("charge"), s.get("compound_name"))
print(s.peaks.mz[:5], s.peaks.intensities[:5])
```

- `load_spectra` picks the reader from the extension (`.mgf`, `.msp`, `.mzml`, `.mzxml`,
  `.json`, `.pickle`). It and the format-specific `load_from_*` functions return a
  **generator**: wrap them in `list()` before you take a length or loop twice.
- **Harmonization happens on import.** Keys are lower-cased and renamed to one vocabulary —
  `PEPMASS`, `PrecursorMZ` and `precursor_mz` all become `precursor_mz`; `Ion_mode` becomes
  `ionmode`. Read values with `s.get("key")` and write with `s.set("key", value)`. Pass
  `metadata_harmonization=False` to see what the file actually said.
- A `Spectrum` needs `mz` as a sorted float array; unsorted or integer arrays raise
  `AssertionError` when you build one yourself.

**What each format brings, and what it leaves out.** Checked on the matchms test files:

| file | precursor m/z | ion mode | ms level | structure |
|---|---|---|---|---|
| GNPS MGF / JSON | yes | yes | yes | SMILES / InChI |
| MassBank / NIST MSP | yes | yes | as text `"MS2"` | SMILES, InChI, InChIKey |
| mzML / mzXML | yes | **missing** | **missing** | none |
| USI | yes | **missing** | **missing** | none |

Spectra converted from mzML have no `ionmode` or `ms_level` even when the file records them,
so a filter that requires ion mode will drop them. Set it yourself when you know the run's
polarity: `s.set("ionmode", "positive")`.

**Negative-mode MGF files often say `CHARGE=1`.** The pesticide file does, for every
spectrum. The `correct_charge` filter in section 2 fixes the sign from `ionmode`; until then a
negative-mode spectrum carries charge +1.

**One spectrum by USI.** A Universal Spectrum Identifier names a spectrum in GNPS, MassBank or
a MassIVE dataset. `load_from_usi` asks the public resolver at metabolomics-usi.gnps2.org and
**returns `None` instead of raising** when the identifier is unknown or the service answers
with an error page — always check:

```python
from matchms.importing import load_from_usi
usi = "mzspec:MASSBANK::accession:MSBNK-RIKEN-PR100038"
spec = load_from_usi(usi)
if spec is None:
    print("not retrieved — unknown identifier or resolver unavailable:", usi)
else:
    print(spec, spec.metadata)
```

The resolver returns peaks and precursor m/z only — no ion mode, adduct or structure — and it
is a single public service that was intermittently returning HTTP 500 during testing. For
anything more than a quick look, get the record from the source library instead (section 6).

## 2. Clean metadata — `SpectrumProcessor`

Libraries disagree on how to write a precursor, an adduct or a missing structure (`N/A`,
`n/a`, empty). Run a filter pipeline before scoring. matchms ships predefined lists:

| list | does |
|---|---|
| `BASIC_FILTERS` | renames fields, reads adduct and formula out of compound names, harmonizes empty values |
| `DEFAULT_FILTERS` | basic plus normalized intensities, charge sign from ion mode, parent mass, InChI / InChIKey / formula derived from SMILES, and **drops spectra with no precursor m/z or ion mode** |
| `LIBRARY_CLEANING` | default plus annotation repair and strict consistency checks between adduct, precursor m/z and structure — for building a reference library |

```python
from matchms import SpectrumProcessor
from matchms.filtering.default_pipelines import DEFAULT_FILTERS

processor = SpectrumProcessor(DEFAULT_FILTERS)
cleaned, report = processor.process_spectra(spectra, progress_bar=False, create_report=True)
print(len(spectra), "->", len(cleaned))
df = report.to_dataframe()
print(df[(df["removed spectra"] > 0) | (df["changed metadata"] > 0)].to_string())
c = cleaned[0]
print(c.get("charge"), c.get("adduct"), c.get("parent_mass"), c.get("inchikey"), c.get("formula"))
```

On the pesticide file nothing is dropped, every charge becomes −1, the adduct `[M-H]-` is read
from the end of the compound name, and the parent mass is computed as the neutral mass.

Things that bite:

- **The processor reorders your filters.** matchms filters are sorted into a fixed internal
  order, whatever order you pass; custom functions run last. Check `processor.filters` if order
  matters to you.
- **Count before and after, always.** On the matchms test files `DEFAULT_FILTERS` dropped 1 of
  10 mzML spectra (no charge, so no ion mode could be derived); `LIBRARY_CLEANING` dropped 8 of
  76 pesticide spectra, 4 of 5 GNPS spectra and **all 10** mzML spectra (no MS level). The
  report table names the filter responsible.
- **`LIBRARY_CLEANING` goes online.** Spectra with a name but no structure are looked up in
  PubChem by name. That is slow on a large library and needs network access; use it to
  curate a reference set, not on every query batch.
- Called directly, a filter returns a new spectrum and leaves its input alone (`clone=True` by
  default), and `process_spectra` clones each input once, so the original list is unchanged.
  Keep working with what is returned.

A filter is any function that takes a `Spectrum` and returns a `Spectrum` or `None`; pass it
in the list like a built-in one.

## 3. Clean peaks for matching

Score on peaks that carry information. For MS/MS matching, a reasonable start:

```python
peak_filters = DEFAULT_FILTERS + [
    ("select_by_relative_intensity", {"intensity_from": 0.01}),  # drop peaks below 1% of base peak
    ("select_by_mz", {"mz_from": 0, "mz_to": 1000}),
    ("require_minimum_number_of_peaks", {"n_required": 5}),
]
lib, _ = SpectrumProcessor(peak_filters).process_spectra(spectra, progress_bar=False)
print(len(spectra), "->", len(lib), "spectra;", sum(len(s.peaks) for s in spectra), "->", sum(len(s.peaks) for s in lib), "peaks")
```

- A filter given as a name takes its parameters as a dict in a tuple, as above.
- Raise `mz_to` for large molecules; the default list above cuts at 1000.
- `require_minimum_number_of_peaks` removes spectra too sparse to score meaningfully. Five is a
  floor, not a recommendation for confident annotation.
- `remove_peaks_around_precursor_mz` (default ±17 Da) removes the unfragmented precursor,
  which otherwise dominates scores between two spectra that share only a mass.
- `normalize_intensities` does not change cosine scores, which are scale-free. It matters for
  plotting and for any filter that uses absolute intensity.

## 4. Similarity scores

```python
from matchms.similarity import CosineGreedy, ModifiedCosineGreedy

a, b = lib[0], lib[1]
r = CosineGreedy(tolerance=0.01).pair(a, b)
print(r, float(r["score"]), int(r["matches"]))
```

`pair` returns a structured value with two fields: `score` (0–1) and `matches`, the number of
matched peak pairs. **Read both.**

**`tolerance` is in daltons, the same at every m/z.** The default of 0.1 Da suits nominal-mass
or low-resolution data. For Orbitrap or Q-TOF data, derive it from the instrument's ppm
accuracy at the top of the fragment range: 10 ppm at m/z 500 is 0.005 Da. Too tight is worse
than slightly loose — on the pesticide library, holding out repeat spectra as queries, the
correct compound ranked first for 16 of 16 queries at 0.01 Da and 0.005 Da, 14 at 0.002 Da
and 13 at 0.0005 Da, as matched-peak counts collapsed. `FlashSimilarity(use_ppm=True)` is the
one score that takes ppm directly, but it returns a score with no matched-peak count.

**A high score from one or two peaks is not a match.** In the same library, with tolerance
0.005 Da, 55 pairs of different spectra scored above 0.7 and 17 of those rested on fewer than
six matched peaks — pymetrozine and cyazofamid score 0.88 on a single shared peak. GNPS uses
cosine ≥ 0.7 with ≥ 6 matched peaks as its default library-match threshold. Always filter on
`matches` as well as `score`.

**Cosine vs modified cosine.** `CosineGreedy` matches peaks at the same m/z.
`ModifiedCosineGreedy` also matches peaks shifted by the difference between the two precursor
m/z values, so a structural analog — one extra methyl, a hydroxylation — still scores high
when the modification sits on fragments that keep it. It needs `precursor_mz` on both spectra
and raises `AssertionError` without it.

Measured on MassBank records from one laboratory and instrument (Q-TOF, 30 eV, `[M+H]+`),
tolerance 0.01 Da:

| pair | Δ precursor | cosine (matches) | modified cosine (matches) |
|---|---|---|---|
| morphine vs codeine (methyl ether) | 14.016 | 0.013 (27) | 0.996 (44) |
| morphine vs codeine at 40 eV | 14.016 | 0.585 (159) | 0.945 (175) |
| morphine vs heroin at 40 eV (diacetyl) | 84.021 | 0.433 (53) | 0.590 (52) |

It does not always help: for the pesticides recorded as both `[M-H]-` and `[M+Cl]-`, the two
scores were identical, because the chloride adduct loses chlorine and fragments like the
deprotonated ion. Use cosine for library identification and modified cosine for analog
search and molecular networking; report which one you used.

Other scores in `matchms.similarity`: `CosineHungarian` and `ModifiedCosineHungarian` (exact
optimal peak assignment, slower; for method comparison), `FlashSimilarity` (fast spectral
entropy or cosine for large libraries), `NeutralLossesCosine`, and metadata comparisons such as
`PrecursorMzMatch` and `MetadataMatch`.

## 5. Library search

`calculate_scores(references, queries, similarity)` scores every reference against every
query. Combine it with a precursor m/z window, then rank:

```python
import numpy as np, pandas as pd
from matchms import calculate_scores
from matchms.similarity import PrecursorMzMatch

def library_search(queries, references, tolerance=0.01, precursor_ppm=10, min_matches=6, top=3):
    cos = calculate_scores(references, queries, CosineGreedy(tolerance=tolerance)).to_array()
    score, matches = cos["CosineGreedy_score"].copy(), cos["CosineGreedy_matches"]
    same_mass = calculate_scores(references, queries,
                                 PrecursorMzMatch(tolerance=precursor_ppm, tolerance_type="ppm")).to_array()
    score[(matches < min_matches) | (same_mass == 0)] = 0
    rows = []
    for j, q in enumerate(queries):
        for i in np.argsort(-score[:, j])[:top]:
            if score[i, j] > 0:
                rows.append({"query": j, "ref": int(i), "hit": references[i].get("compound_name"),
                             "hit_adduct": references[i].get("adduct"), "score": round(float(score[i, j]), 3),
                             "matches": int(matches[i, j])})
    return pd.DataFrame(rows)

key = lambda s: (s.get("inchikey")[:14], s.get("adduct"))
seen, queries, references = set(), [], []
for s in lib:                       # repeat spectra of a compound become queries
    (queries if key(s) in seen else references).append(s)
    seen.add(key(s))
hits = library_search(queries, references)
best = hits.groupby("query").head(1)
right = sum(queries[q].get("inchikey")[:14] == references[r].get("inchikey")[:14] for q, r in zip(best["query"], best["ref"]))
print(len(queries), "queries,", len(best), "with a hit,", right, "correct compound")
print(best.head().to_string())
```

- `to_array()` gives a structured array named after the score class
  (`CosineGreedy_score`, `CosineGreedy_matches`); scores with a single value, such as
  `PrecursorMzMatch`, come back as a plain float array of 0 and 1.
- Dimensions are **references × queries**, in that order.
- Pass `is_symmetric=True` when scoring a set against itself (molecular networking); it
  computes half the matrix.
- The full matrix is dense. For tens of thousands of references, filter on precursor first and
  score only the candidates, or use `FlashSimilarity`.
- **Without the precursor window, the top hit is often the right compound as the wrong ion.**
  On the pesticides, cosine alone picked the correct compound for every query but the wrong
  adduct for 4 of 16; the 10 ppm precursor window fixed all four. With the six-peak minimum
  as well, 15 of 16 queries get a hit, all correct; the sixteenth is a 7-peak spectrum whose
  best match shares 5 peaks. Sparse spectra are where a matched-peak threshold costs you —
  report them as no confident match rather than lowering the bar. A compound name from a
  library match is a hypothesis: report the score, matched peaks, precursor error and the
  reference's instrument and collision energy with it.

## 6. Reference spectra and their licenses

matchms reads library exports directly: GNPS libraries as MGF or JSON, MassBank and MoNA as MSP.
Two cautions before you build a reference set:

- **Licenses are per record, not per library.** The first caffeine record from each of 22
  MassBank contributors carried six different licenses — CC BY, CC BY-SA, CC BY-NC,
  CC BY-NC-SA, CC BY-NC-ND and the German dl-de/by-2-0. MoNA exports carry a `license` field
  per spectrum too (the matchms MoNA test file is CC BY-NC-SA throughout). After import the
  value is in `s.get("license")`; filter on it if the result will be redistributed or used
  commercially.
- Collision energy and instrument type change spectra a great deal — morphine against codeine
  scored 0.013 at 30 eV and 0.585 at 40 eV by plain cosine. Prefer references acquired like
  your data.

MassBank's REST API returns one record as JSON with the license attached. A converter:

```python
import requests
from matchms import Spectrum

def massbank_spectrum(accession):
    r = requests.get("https://massbank.eu/MassBank-api/records/" + accession, timeout=30)
    r.raise_for_status()
    d = r.json()
    focused = {t["subtag"]: t["value"] for t in d["mass_spectrometry"].get("focused_ion", [])}
    peaks = sorted((p["mz"], p["intensity"]) for p in d["peak"]["peak"]["values"])
    return Spectrum(mz=np.array([p[0] for p in peaks], dtype=float),
                    intensities=np.array([p[1] for p in peaks], dtype=float),
                    metadata={"spectrum_id": d["accession"], "compound_name": d["compound"]["names"][0],
                              "smiles": d["compound"].get("smiles"), "inchi": d["compound"].get("inchi"),
                              "precursor_mz": float(focused["PRECURSOR_M/Z"]) if "PRECURSOR_M/Z" in focused else None,
                              "adduct": focused.get("PRECURSOR_TYPE"),
                              "ionmode": d["acquisition"]["mass_spectrometry"]["ion_mode"].lower(),
                              "instrument_type": d["acquisition"].get("instrument_type"),
                              "license": d["license"], "title": d["title"]})

morphine = massbank_spectrum("MSBNK-Athens_Univ-AU158003")
codeine = massbank_spectrum("MSBNK-Athens_Univ-AU162303")
for s in (morphine, codeine):
    print(s.get("title"), "|", s.get("license"), "|", len(s.peaks), "peaks")
print(CosineGreedy(tolerance=0.01).pair(morphine, codeine), ModifiedCosineGreedy(tolerance=0.01).pair(morphine, codeine))
```

Records are listed by name with
`https://massbank.eu/MassBank-api/records/search?compound_name=<name>`. The match is a
substring — a search for morphine also returns heroin and apomorphine — so check each title.

## 7. Write spectra out

```python
import os
from matchms.exporting import save_spectra

for style in ["matchms", "gnps", "sirius"]:
    out = f"cleaned_{style}.mgf"
    if os.path.exists(out):
        os.remove(out)
    save_spectra(cleaned[:3], out, export_style=style)
    print(style, [l.strip() for l in open(out) if l.split("=")[0] in ("PEPMASS", "PRECURSOR_MZ", "ADDUCT", "ION", "NAME", "COMPOUND_NAME")][:4])
back = list(load_spectra("cleaned_matchms.mgf"))
print(len(back), back[0].get("precursor_mz") == cleaned[0].get("precursor_mz"))
```

- **The default MGF style writes `PRECURSOR_MZ`, not `PEPMASS`.** matchms reads it back, but
  most other tools expect `PEPMASS`. Use `export_style="gnps"` for GNPS and general use, or
  `"sirius"` for SIRIUS, which also writes the adduct as `ION`.
- `save_spectra` refuses to overwrite an existing file (`FileExistsError`). The format-specific
  `save_as_mgf` and `save_as_msp` **append by default**, so running a notebook cell twice
  silently doubles the file. Prefer `save_spectra`.
- MGF, MSP and JSON round-trip precursor, adduct, ion mode and peaks unchanged on the tested
  files.

## Checklist before reporting an annotation

- Spectra counted after import and after every filter pipeline; any drop explained.
- Ion mode present on every spectrum, and queries scored only against references of the same
  polarity.
- Tolerance chosen from instrument accuracy, in daltons, and stated.
- Each hit reported with score, matched peaks, precursor m/z error, adduct and the reference's
  instrument and collision energy — never as a bare compound name.
- Minimum matched peaks applied (six is the common default).
- Cosine for identification, modified cosine for analogs; which one is named in the report.
- Reference licenses checked if results or the library will be shared.

## Try it

**Data** — `pesticides.mgf` from the matchms repository (Apache-2.0), and two MassBank records
from the same Q-TOF laboratory series, morphine `MSBNK-Athens_Univ-AU158003` and codeine
`MSBNK-Athens_Univ-AU162303` (both CC BY). No account needed; all three last confirmed
reachable 2026-11-06.

The run goes through three traps: the `CHARGE=1` on negative-mode spectra, a high cosine score
built on one peak, and an analog pair that plain cosine misses.

```python
import urllib.request, numpy as np, requests
from matchms import Spectrum, SpectrumProcessor, calculate_scores
from matchms.importing import load_spectra
from matchms.filtering.default_pipelines import DEFAULT_FILTERS
from matchms.similarity import CosineGreedy, ModifiedCosineGreedy
from matchms.logging_functions import set_matchms_logger_level
set_matchms_logger_level("ERROR")

urllib.request.urlretrieve("https://raw.githubusercontent.com/matchms/matchms/master/tests/testdata/pesticides.mgf", "pesticides.mgf")
raw = list(load_spectra("pesticides.mgf"))
flt = DEFAULT_FILTERS + [("select_by_relative_intensity", {"intensity_from": 0.01}),
                         ("require_minimum_number_of_peaks", {"n_required": 5})]
lib, _ = SpectrumProcessor(flt).process_spectra(raw, progress_bar=False)
print("spectra       :", len(raw), "->", len(lib), "| charge before", raw[0].get("charge"), "after", lib[0].get("charge"))

# 1. all-against-all cosine; self-scores are 1; count high scores on few peaks
a = calculate_scores(lib, lib, CosineGreedy(tolerance=0.005), is_symmetric=True).to_array()
S, M = a["CosineGreedy_score"], a["CosineGreedy_matches"]
off = ~np.eye(len(lib), dtype=bool)
high, thin = (S > 0.7) & off, (S > 0.7) & (M < 6) & off
i, j = np.argwhere(thin & (M == 1))[0]
print("cosine > 0.7  :", int(high.sum()) // 2, "pairs,", int(thin.sum()) // 2, "on < 6 matched peaks")
print("one-peak match:", lib[i].get("compound_name").split("_")[1], "vs", lib[j].get("compound_name").split("_")[1], round(float(S[i, j]), 3))

# 2. analog pair from MassBank — morphine and its methyl ether codeine
def mb(acc):
    d = requests.get("https://massbank.eu/MassBank-api/records/" + acc, timeout=30).json()
    pk = sorted((p["mz"], p["intensity"]) for p in d["peak"]["peak"]["values"])
    prec = {t["subtag"]: t["value"] for t in d["mass_spectrometry"]["focused_ion"]}["PRECURSOR_M/Z"]
    return Spectrum(mz=np.array([p[0] for p in pk], dtype=float), intensities=np.array([p[1] for p in pk], dtype=float),
                    metadata={"compound_name": d["compound"]["names"][0], "precursor_mz": float(prec), "license": d["license"]})
morphine, codeine = mb("MSBNK-Athens_Univ-AU158003"), mb("MSBNK-Athens_Univ-AU162303")
c = CosineGreedy(tolerance=0.01).pair(morphine, codeine)
m = ModifiedCosineGreedy(tolerance=0.01).pair(morphine, codeine)
dprec = codeine.get("precursor_mz") - morphine.get("precursor_mz")
print("morphine/codeine: d precursor", round(dprec, 4), "| cosine", round(float(c["score"]), 3), int(c["matches"]),
      "| modified", round(float(m["score"]), 3), int(m["matches"]), "|", morphine.get("license"), codeine.get("license"))

assert len(raw) == 76 and all(s.get("charge") == -1 for s in lib)        # sign fixed from ion mode
assert np.allclose(S.diagonal(), 1.0)                                       # every spectrum matches itself
assert thin.sum() > 0 and M[i, j] == 1 and S[i, j] > 0.7                    # one peak can make a high score
assert abs(dprec - 14.01565) < 0.002                                        # one CH2
assert float(m["score"]) > 0.9 > 0.1 > float(c["score"])                     # analog found only by modified cosine
print("all checks passed")
```

**Expect**

Invariants — a failure means the skill is wrong:

- Raw spectra carry charge +1 in a negative-mode file; after `DEFAULT_FILTERS` every charge is −1.
- Every spectrum scores 1.0 against itself.
- At least one pair of different compounds scores above 0.7 on a single matched peak.
- Morphine and codeine precursors differ by one CH2 (14.0157 Da); modified cosine scores them
  above 0.9 while plain cosine stays below 0.1.

Observed 2026-11-06 with matchms 0.34.0 on Python 3.12.13 and 3.13.12 — numbers to compare,
not assertions:

```
spectra       : 76 -> 67 | charge before 1 after -1
cosine > 0.7  : 55 pairs, 17 on < 6 matched peaks
one-peak match: Pymetrozine vs Cyazofamid 0.878
morphine/codeine: d precursor 14.0156 | cosine 0.013 27 | modified 0.996 44 | CC BY CC BY
all checks passed
```

## Sources

- matchms — https://github.com/matchms/matchms (Apache-2.0); documentation at
  https://matchms.readthedocs.io
- Huber F et al. (2020) matchms — processing and similarity evaluation of mass spectrometry
  data. *Journal of Open Source Software* 5(52):2411 — https://doi.org/10.21105/joss.02411
- de Jonge NF et al. (2024) Reproducible MS/MS library cleaning pipeline in matchms.
  *Journal of Cheminformatics* 16:88 — https://doi.org/10.1186/s13321-024-00878-1
- Watrous J et al. (2012) Mass spectral molecular networking of living microbial colonies.
  *PNAS* 109:E1743–E1752 (modified cosine) — https://doi.org/10.1073/pnas.1203689109
- Bittremieux W et al. (2021) Universal MS/MS visualization and retrieval with the Metabolomics
  Spectrum Resolver Web Service. bioRxiv preprint — https://doi.org/10.1101/2020.05.09.086066
- MassBank Europe REST API — https://massbank.eu/MassBank-api
