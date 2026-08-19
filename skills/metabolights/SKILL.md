---
name: metabolights
description: Find and retrieve public metabolomics studies from EMBL-EBI MetaboLights — search by disease, tissue or organism, read the ISA-Tab study design and factors, and download the Metabolite Assignment File holding identified metabolites and their per-sample intensities. Covers LC-MS, GC-MS and NMR studies across human, mouse and rat.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [metabolomics, mass-spectrometry, nmr, metabolites, public-data]
covers: [metabolomics, lipidomics, mass spectrometry, LC-MS, GC-MS, NMR, metabolites, metabolite profiling, untargeted, targeted, serum, plasma, urine, skeletal muscle, liver, sarcopenia, aging, diabetes, cancer, human, mouse, rat, ISA-Tab, MAF, isotopologue]
papers: [PMID:31691833, PMID:24214965]
access: [open]
platform: isa-tab
datasets: [https://www.ebi.ac.uk/metabolights/ws/studies/MTBLS3341]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-19
  against: MetaboLights WS (3,292 public studies) / EBI Search REST / Python 3.12.8 stdlib only
  executed: 7
  unverified: 0
---
# MetaboLights

EMBL-EBI's repository for metabolomics — **3,292 public studies** at the time of writing,
spanning LC-MS, GC-MS and NMR. This skill finds studies, reads what was actually measured and
under what design, and gets the numbers onto disk.

Nothing here needs an account or a key.

Two things shape everything below, and both surprise people:

- **The MetaboLights API has no search.** `/studies` returns 3,292 bare accessions and nothing
  else. Search lives in a different service entirely.
- **The measured values are not in the JSON.** The API describes the study; the numbers live in
  a tab-separated file you fetch from a different host. And whether that file contains
  per-sample values at all *varies by submitter* — see *The MAF is the data*, which is the one
  section to read if you read only one.

## Finding studies — use EBI Search, not the MetaboLights API

The obvious guess fails: `/studies/search?query=…` returns **HTTP 400**. MetaboLights is
indexed as a domain in EBI Search instead.

```python
import json, urllib.parse, urllib.request

def search(query, size=10):
    """Study accessions matching a free-text query, via EBI Search."""
    url = ("https://www.ebi.ac.uk/ebisearch/ws/rest/metabolights?"
           + urllib.parse.urlencode({
               "query": query, "format": "json", "size": size,
               "fields": "name,description,organism,study_design",
           }))
    d = json.loads(urllib.request.urlopen(url, timeout=45).read())
    out = []
    for e in d["entries"]:
        f = e.get("fields", {})
        first = lambda k: (f.get(k) or [""])[0]
        out.append({"accession": e["id"], "name": first("name"),
                    "organism": first("organism")})
    return d["hitCount"], out

total, hits = search("sarcopenia")
print(total, "studies")
for h in hits[:4]:
    print(f"  {h['accession']:<11} {h['organism'][:18]:<18} {h['name'][:52]}")
```

`hitCount` is the real total; `size` caps what comes back, so page with `start=` rather than
assuming the first response is everything.

**Query terms are OR-ed and ranked**, so a two-word query returns more than either word alone,
sorted by relevance. Narrow with the `organism` and `study_design` fields rather than by
adding words.

## Reading a study

```python
def study(acc):
    url = f"https://www.ebi.ac.uk/metabolights/ws/studies/{acc}"
    return json.loads(urllib.request.urlopen(url, timeout=45).read())

d = study("MTBLS3341")
inv = d["isaInvestigation"]
st = inv["studies"][0]
print("title      :", st["title"][:70])
print("factors    :", [f["factorName"] for f in st["factors"]])
print("design     :", [x["annotationValue"] for x in st["studyDesignDescriptors"]][:4])
print("assays     :", [(a["measurementType"]["annotationValue"],
                        a["technologyType"]["annotationValue"]) for a in st["assays"]])
print("publication:", [(p.get("pubMedID"), p.get("title", "")[:40]) for p in st["publications"]])
print("validation :", d["validation"])
```

Three fields carry most of the triage value:

- **`factors`** is the experimental design — what was varied. A study with no factors is
  descriptive, not comparative, and will not support the contrast you probably want.
- **`studyDesignDescriptors`** carries the free-text subject terms — `sarcopenia`,
  `untargeted metabolites`, the instrument class.
- **`validation`** is MetaboLights' own completeness check, shaped `{"errors": [], "warnings":
  []}`. A study with errors is not necessarily unusable, but it is worth looking at before
  building on it.

**`assays[i].dataFiles` is empty even when the study has data.** Do not read that as "no data" —
the ISA JSON describes structure, and the file inventory is a separate call.

## What files exist

```python
def files(acc):
    url = f"https://www.ebi.ac.uk/metabolights/ws/studies/{acc}/files"
    d = json.loads(urllib.request.urlopen(url, timeout=45).read())
    return [(f["file"], f["type"]) for f in d["study"]]

for name, kind in files("MTBLS3341"):
    print(f"  {kind:<24} {name}")
```

Four ISA-Tab *kinds*, and the `type` tells you which is which without parsing names:

| type | file | what it is |
|---|---|---|
| `metadata_investigation` | `i_Investigation.txt` | study-level metadata |
| `metadata_sample` | `s_<ACC>.txt` | one row per sample, with its characteristics |
| `metadata_assay` | `a_<ACC>_*.txt` | one row per assay run, linking sample to raw file |
| `metadata_maf` | `m_<ACC>_*_maf.tsv` | **the measured values** |

**Kinds, not files — a type can repeat, and this is the easiest way to lose half a study.**
`MTBLS3341` ships **six** files: positive *and* negative ionisation, so two `metadata_assay`
and two `metadata_maf`. Building `{f["type"]: f["file"] for f in ...}` is the natural thing to
write and it silently keeps whichever came last, discarding an entire ionisation mode. Group
into lists and decide deliberately which mode you want, or concatenate both:

```python
from collections import defaultdict

def files_by_type(acc):
    url = f"https://www.ebi.ac.uk/metabolights/ws/studies/{acc}/files"
    d = json.loads(urllib.request.urlopen(url, timeout=45).read())
    out = defaultdict(list)
    for f in d["study"]:
        out[f["type"]].append(f["file"])
    return dict(out)

by_type = files_by_type("MTBLS3341")
print({k: len(v) for k, v in by_type.items()})
print("MAFs:", by_type["metadata_maf"])
```

## Get the files

**Downloads come from the FTP tree over HTTPS, not from the web service.** Both plausible
web-service paths fail, and one of them fails misleadingly:

| attempt | result |
|---|---|
| `ws/studies/<ACC>/download/<file>` | **400** `"There is no study."` — the study exists |
| `ws/studies/<ACC>/files/<file>` | **404** |
| `ftp.ebi.ac.uk/pub/databases/metabolights/studies/public/<ACC>/<file>` | **200** |

```python
import os, urllib.request

FTP = "https://ftp.ebi.ac.uk/pub/databases/metabolights/studies/public"

def fetch(acc, outdir="Data/metabolights"):
    """Every ISA-Tab file onto disk — both ionisation modes if the study has them."""
    os.makedirs(outdir, exist_ok=True)
    manifest = []
    for name, kind in files(acc):
        dest = os.path.join(outdir, f"{acc}_{name}")
        urllib.request.urlretrieve(f"{FTP}/{acc}/{name}", dest)
        manifest.append({"file": name, "type": kind, "path": dest,
                         "bytes": os.path.getsize(dest)})
        print(f"  {kind:<24} {manifest[-1]['bytes']:>9,} B  {name[:44]}")
    with open(os.path.join(outdir, f"{acc}_manifest.json"), "w") as fh:
        json.dump({"accession": acc, "source": f"{FTP}/{acc}/", "files": manifest}, fh, indent=2)
    return manifest

fetch("MTBLS3341")
```

The same tree also holds `FILES/` (raw instrument data — often tens of GB), `HASHES/`,
`METADATA_REVISIONS/`, and a `<ACC>.mhd.json`. Check a raw file's size with a HEAD request
before fetching it; the metadata above is a few kilobytes, the raw data is not.

## The MAF is the data — and its shape is not guaranteed

The Metabolite Assignment File is what you came for: one row per identified metabolite, with
identifiers (`database_identifier`, `chemical_formula`, `smiles`, `inchi`), analytical context
(`mass_to_charge`, `retention_time`), and then — **sometimes** — one column per sample.

**Sometimes.** This is the trap, and it is silent. Measured across three studies:

| study | MAF columns | samples declared | per-sample columns present |
|---|---|---|---|
| `MTBLS1` | 150 | 132 | **132** |
| `MTBLS3341` | 40 | 19 | **19** |
| `MTBLS2679` | 25 | 133 | **0** |

`MTBLS2679` declares 133 samples and publishes none of them individually — its MAF ends at
`smallmolecule_abundance_sub`, `padj`, `FoldChangeLog2`. It reports a summary, not a matrix.
Code that assumes "the columns after the annotation block are samples" reads `padj` as a
measurement and produces a table that looks right.

**So do not guess by position. Intersect with the sample sheet**, which is the authority on
what a sample is called:

```python
import csv, io

def maf_matrix(acc, outdir="Data/metabolights"):
    """Metabolite x sample intensities, with the sample columns identified honestly."""
    by_type = files_by_type(acc)
    mafs = by_type["metadata_maf"]
    if len(mafs) > 1:
        print(f"   note: {len(mafs)} MAFs (ionisation modes) — reading {mafs[0]}, "
              f"the others are {mafs[1:]}")
    maf_name, smp_name = mafs[0], by_type["metadata_sample"][0]

    grab = lambda n: urllib.request.urlopen(f"{FTP}/{acc}/{n}", timeout=60).read().decode("utf-8", "replace")
    maf = list(csv.DictReader(io.StringIO(grab(maf_name)), delimiter="\t"))
    samples = {r["Sample Name"].strip() for r in
               csv.DictReader(io.StringIO(grab(smp_name)), delimiter="\t")
               if r.get("Sample Name")}

    cols = [c for c in (maf[0].keys() if maf else []) if c.strip() in samples]
    print(f"  {acc}: {len(maf)} metabolites x {len(cols)} sample columns "
          f"({len(samples)} samples declared)")
    if not cols:
        print("   -> this MAF carries summary statistics only, no per-sample values")
    return maf, cols

maf_matrix("MTBLS3341")
```

Metabolite naming is the other obstacle to combining studies. Prefer `database_identifier`
(ChEBI, HMDB) over `metabolite_identification`, which is free text and inconsistent between
submitters.

## Related repositories

Metabolomics is split across two archives that do not mirror each other, so a negative result
in one is not a negative result overall. The NIH Metabolomics Workbench is the other, and its
`refmet` service is the better tool for reconciling metabolite names across studies. Searching
both is normal practice.

## Try it

A self-contained check. Public data, no account, no key. Fetches a few hundred kilobytes.

**Data** — `MTBLS3341`, *"Reduced uremic metabolites are prominent feature of sarcopenia"*, a
human LC-MS study:

    https://www.ebi.ac.uk/metabolights/ws/studies/MTBLS3341

Openly accessible with no account or licence acceptance. EMBL-EBI's licensing policy states
CC0 is preferred across its resources; MetaboLights is not named individually on that page, so
confirm per-study terms before redistributing. Last confirmed reachable 2026-08-19.

```python
import csv, io, json, urllib.parse, urllib.request
from collections import defaultdict

WS  = "https://www.ebi.ac.uk/metabolights/ws"
FTP = "https://ftp.ebi.ac.uk/pub/databases/metabolights/studies/public"
ACC = "MTBLS3341"
get = lambda u: urllib.request.urlopen(u, timeout=60).read()

# 1. The API has no search — the obvious path is a 400, and EBI Search is the way in.
try:
    get(f"{WS}/studies/search?query=sarcopenia")
    searched = "200 (unexpected)"
except urllib.error.HTTPError as e:
    searched = f"{e.code}"
ebi = json.loads(get("https://www.ebi.ac.uk/ebisearch/ws/rest/metabolights?"
                     + urllib.parse.urlencode({"query": "sarcopenia", "format": "json", "size": 5})))

# 2. Study shape.
d  = json.loads(get(f"{WS}/studies/{ACC}"))
st = d["isaInvestigation"]["studies"][0]

# 3. File inventory, keyed by type rather than by filename.
inv = defaultdict(list)
for f in json.loads(get(f"{WS}/studies/{ACC}/files"))["study"]:
    inv[f["type"]].append(f["file"])

# 4. The MAF, with sample columns identified by intersection, not by position.
maf = list(csv.DictReader(io.StringIO(get(f"{FTP}/{ACC}/{inv['metadata_maf'][0]}").decode("utf-8", "replace")), delimiter="\t"))
smp = {r["Sample Name"].strip() for r in
       csv.DictReader(io.StringIO(get(f"{FTP}/{ACC}/{inv['metadata_sample'][0]}").decode("utf-8", "replace")), delimiter="\t")
       if r.get("Sample Name")}
cols = [c for c in maf[0] if c.strip() in smp]

# 5. The same intersection on a study whose MAF publishes no per-sample values at all.
inv2 = defaultdict(list)
for f in json.loads(get(f"{WS}/studies/MTBLS2679/files"))["study"]:
    inv2[f["type"]].append(f["file"])
maf2 = list(csv.DictReader(io.StringIO(get(f"{FTP}/MTBLS2679/{inv2['metadata_maf'][0]}").decode("utf-8", "replace")), delimiter="\t"))
smp2 = {r["Sample Name"].strip() for r in
        csv.DictReader(io.StringIO(get(f"{FTP}/MTBLS2679/{inv2['metadata_sample'][0]}").decode("utf-8", "replace")), delimiter="\t")
        if r.get("Sample Name")}
cols2 = [c for c in maf2[0] if c.strip() in smp2]

assert searched == "400", "the MetaboLights API gained a search endpoint"
assert set(d) == {"mtblsStudy", "isaInvestigation", "validation"}, sorted(d)
assert {"metadata_maf", "metadata_sample", "metadata_assay", "metadata_investigation"} <= set(inv)
assert len(inv["metadata_maf"]) == 2, "MTBLS3341 has positive and negative ionisation modes"
assert cols, "MTBLS3341's MAF should carry per-sample columns"
assert not cols2, "MTBLS2679's MAF is expected to carry none"

print(f"search endpoint on the WS API      : HTTP {searched}")
print(f"EBI Search, 'sarcopenia'           : {ebi['hitCount']} studies")
print(f"study payload keys                 : {sorted(d)}")
print(f"factors                            : {[f['factorName'] for f in st['factors']]}")
print(f"assay                              : {st['assays'][0]['technologyType']['annotationValue']}")
print(f"validation                         : {d['validation']}")
print(f"{ACC} MAF                       : {len(maf)} metabolites x {len(cols)} samples of {len(smp)} declared")
print(f"MTBLS2679 MAF                      : {len(maf2)} metabolites x {len(cols2)} samples of {len(smp2)} declared")
```

**Expect**

Invariants — these hold regardless of release, and a failure means the skill is wrong:

- The MetaboLights web service still has **no search**: `/studies/search` is a 400. If it ever
  returns 200, this skill's first section is obsolete rather than merely stale.
- A study payload is exactly `mtblsStudy`, `isaInvestigation`, `validation` — three keys.
- The file inventory carries all four ISA-Tab types, so keying on `type` is safe and parsing
  filenames is unnecessary.
- **`MTBLS3341` has per-sample columns and `MTBLS2679` has none**, from identical code. That
  asymmetry is the whole point of intersecting with the sample sheet, and the two assertions
  are what stop the technique silently degrading into positional guessing.

Observed 2026-08-19 — these move when a submitter revises a study, so treat a mismatch as drift
to investigate rather than a failure:

```
search endpoint on the WS API      : HTTP 400
EBI Search, 'sarcopenia'           : 9 studies
study payload keys                 : ['isaInvestigation', 'mtblsStudy', 'validation']
factors                            : ['Disease', 'Age', 'Gender', 'Frail scale']
assay                              : mass spectrometry
validation                         : {'errors': [], 'warnings': []}
MTBLS3341 MAF                       : 57 metabolites x 19 samples of 19 declared
MTBLS2679 MAF                      : 28 metabolites x 0 samples of 133 declared
```

## Sources

- MetaboLights — https://www.ebi.ac.uk/metabolights/
- Web service — https://www.ebi.ac.uk/metabolights/ws
- EBI Search — https://www.ebi.ac.uk/ebisearch/
- ISA-Tab specification — https://isa-specs.readthedocs.io/
- EMBL-EBI licensing policy — https://www.ebi.ac.uk/licencing
