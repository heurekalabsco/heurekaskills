---
name: metabolomics-workbench
description: Find and retrieve public metabolomics and lipidomics studies from the NIH Metabolomics Workbench — study design, experimental factors, named metabolites and measured values over its path-segment REST API — plus the RefMet endpoints that map arbitrary metabolite names onto one nomenclature so two studies can be joined.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [metabolomics, lipidomics, mass-spectrometry, public-data, multi-omics]
covers: [metabolomics, lipidomics, mass spectrometry, nmr, metabolites, refmet, metabolomics workbench, mwtab, gc-ms, lc-ms, ce-ms, skeletal muscle, plasma, serum, urine, liver, feces, blood, sarcopenia, aging, muscle atrophy, cachexia, diabetes, cancer, human, mouse, kegg, hmdb, lipid nomenclature, untargeted metabolomics]
papers: [PMID:26467476, PMID:33199890, PMID:31320689, PMID:29706851, PMID:41590684]
access: [open]
datasets: [https://www.metabolomicsworkbench.org/rest/study/study_id/ST001179/summary]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-17
  against: Metabolomics Workbench REST API as served 2026-08-17 / studies ST001179 and ST004166 both v1 rev 1 / Python 3.12.8 stdlib only
  executed: 15
  unverified: 1
  unverified_reason: the one curl -O under Get the files transfers a 1.25 GB raw-data archive, so its URL and byte count were confirmed with an HTTP HEAD request (200, Content-Length 1253871672) rather than by downloading it
---
# Metabolomics Workbench

The Metabolomics Workbench is the NIH Common Fund's metabolomics repository — a few
thousand deposited studies with sample metadata, experimental factors, named
metabolites and the measured values behind them, plus **RefMet**, a reference
nomenclature for metabolite names. Everything below is open: no account, no key, no
click-through.

Two things to settle before you start.

**This is not the only public metabolomics repository.** MetaboLights, run by EMBL-EBI,
is the European counterpart, and the two do not mirror each other — a study deposited
in one is usually not in the other, and neither has a habit of importing the other's
holdings. A question of the form *is there public metabolomics on X* is therefore
rarely answered by searching one of them. Search here, and search MetaboLights
separately before concluding that nothing exists. The grammar described below is
specific to this repository and does not transfer.

**The interesting content is the values, and the hard part is the names.** Downloading
one study is easy. Combining two is not, because depositors name metabolites however
their instrument software named them — `Ala` in one study, `Alanine` in the next,
`γ-Butyrobetaine` and `3-Dehydroxycarnitine` for the same compound. The RefMet section
is the part of this skill that earns its keep.

## The URL grammar

Everything is path segments. There are no query parameters, and guessing
`?study_id=ST000001` gets you nothing.

```
https://www.metabolomicsworkbench.org/rest/<context>/<input>/<value>/<output>[/txt]
                                            \_______/  \_____/  \_____/  \______/
                                          what you're   how     the      what you
                                            asking     you're  identifier  want
                                             about     keying    itself     back
```

```bash
curl -s "https://www.metabolomicsworkbench.org/rest/study/study_id/ST001179/summary/txt"
# study_id      ST001179
# study_title   Metabolomic analysis of skeletal muscle in young and aged mice
# species       Mus musculus
# institute     Kyoto Prefectural University
# analysis_type CE-MS
# ...
# license       CC BY 4.0
```

Eight contexts exist. `study` and `refmet` are the two that matter for most work:

| context | keyed by | what it returns |
|---|---|---|
| `study` | `study_id` `analysis_id` `study_title` `institute` `metabolite_id` `kegg_id` `refmet_name` | studies, their design, metabolites and values |
| `refmet` | `match` `name` `refmet_id` `kegg_id` `inchi_key` `pubchem_cid` `formula` `super_class` `main_class` `sub_class` | the reference nomenclature |
| `compound` | `regno` `formula` `inchi_key` `lm_id` `pubchem_cid` `hmdb_id` `kegg_id` `smiles` `abbrev` | structures and cross-references |
| `metstat` | one segment of eight `;`-separated slots | faceted study search |
| `moverz` | `MB` `LIPIDS` `REFMET` | m/z to candidate metabolites |
| `gene` | `gene_symbol` `gene_id` `gene_name` `mgp_id` `taxid` | gene records |
| `protein` | `uniprot_id` `refseq_id` `gene_symbol` and others | protein records |
| `exactmass` | lipid abbreviation and adduct | computed exact masses |

Output verbs for the `study` context, all confirmed live on 2026-08-17:

| verb | gives you | keyed by |
|---|---|---|
| `summary` | title, species, institute, sample count, licence | `study_id` |
| `factors` | one row per sample, with the packed factor string | `study_id` |
| `allfactors` | the same, minus sample ids, plus `subject_type` | `study_id` |
| `analysis` | one row per analysis — instrument, ion mode, **units** | `study_id` |
| `metabolites` | named metabolites, with `refmet_name` | `study_id` or `analysis_id` |
| `number_of_metabolites` | per-analysis counts | `study_id` |
| `data` | measured values, full precision | `study_id` **only** |
| `datatable` | wide TSV — **rounded**, see below | `analysis_id` **only** |
| `mwtab` | the complete submission record | `study_id` or `analysis_id` |
| `species` `source` `disease` | the curated annotation | `study_id`, or `ST` for all |
| `available` | every project/study/analysis triple | ignores the value |
| `untarg_studies` | every untargeted study | ignores the value |
| `files` `rawdatasize` | deposited raw archives and their sizes | `study_id` |
| `named_metabolites` | one-line per-analysis summary | `study_id` |
| `metaboanalyst` `lion` | reformatted exports for those tools | `study_id` |

**`data` and `datatable` take opposite keys, and each returns nothing useful for the
other's key.** `study/study_id/<ST>/datatable` answers 200 with a two-word header and
no rows; `study/analysis_id/<AN>/data` answers 200 with `[]`. Neither is an error you
would notice.

Append `/txt` to any JSON verb for tab-delimited output. Handy at a shell prompt,
lossy in a script — nested structures flatten.

**`last_name` is advertised and does not work.** It is listed among the accepted input
specifiers, and on 2026-08-17 it returned `[]` for the exact submitter surname of every
study tested (`Kamei` for ST001179, `Kind` for ST000001, `Anderson` for ST004166), in
three letter cases. Search by `institute` instead, which does work.

**You cannot probe these URLs with HEAD.** `curl -I` against `/rest/` returns HTTP 406
while the same URL under GET returns 200. Archives under `/studydownload/` do answer
HEAD, which is how you check a download's size before starting it.

## Three response shapes, and a rejection that looks like success

This is the part that breaks naive code, and it breaks it silently.

**A rejected path still answers HTTP 200.** A wrong context, a wrong input specifier or
a wrong output verb comes back as `200 OK` with `Content-Type: text/html` and an English
sentence in the body — helpfully listing the valid choices, unhelpfully doing so with a
success code. Any code that branches on `r.status_code == 200` treats a typo as data.

**A successful response has one of three shapes**, depending only on how many things
matched:

| matched | shape |
|---|---|
| nothing | `[]` — a JSON *array*, not an empty object, not a 404 |
| exactly one | a flat object, fields at the top level |
| more than one | an object of objects keyed `"1"`, `"2"`, … or `"Row1"`, `"Row2"`, … |

The row-key prefix is not consistent across verbs: `factors` numbers its rows `1`, `2`,
`3`; `allfactors` on the same study numbers them `Row1`, `Row2`, `Row3`. Never depend on
the key — take `.values()`.

The shape flip is the dangerous one, because whether you get a flat object or a wrapper
depends on the *data*, not on the endpoint. `study_id` is a **prefix match, not an exact
lookup**: `ST001179` returns one flat record, `ST0011` returns 97 wrapped ones, and code
written against the first form breaks on a two-character change.

Normalise once, at the boundary:

```python
import json, urllib.error, urllib.request
from urllib.parse import quote

BASE = "https://www.metabolomicsworkbench.org/rest"

def mw(*segments, timeout=90):
    """One REST call. Segments are path parts and are encoded individually."""
    url = BASE + "".join("/" + quote(str(s), safe="") for s in segments)
    with urllib.request.urlopen(url, timeout=timeout) as r:
        ctype = r.headers.get("Content-Type", "")
        body = r.read().decode("utf-8", "replace")
    # A wrong context, input specifier or output verb still returns HTTP 200 —
    # the only signal is that the body is HTML instead of JSON.
    if "text/html" in ctype:
        raise ValueError(f"server rejected {url!r}: {body.strip()[:200]}")
    return json.loads(body) if "json" in ctype else body

def rows(payload):
    """Normalise the three shapes this API returns into a list of dicts.

    []                       -> no match
    {"a": 1, "b": 2}         -> exactly one match, fields at the top level
    {"1": {...}, "2": {...}} -> many matches, 1-based keys ("Row1" on some verbs)
    """
    if isinstance(payload, list):          # [] means nothing matched
        return payload
    if all(isinstance(v, dict) for v in payload.values()) and payload:
        return list(payload.values())      # numbered wrapper
    return [payload]                       # single record, unwrapped

print("no match     :", rows(mw("study", "study_id", "ST999999", "summary")))
one = rows(mw("study", "study_id", "ST001179", "summary"))
print("one match    :", len(one), "row  ->", one[0]["study_title"])
many = rows(mw("study", "study_id", "ST0011", "summary"))
print("prefix match :", len(many), "rows ->", [r["study_id"] for r in many[:5]], "...")
try:
    mw("study", "study_id", "ST001179", "study_title")
except ValueError as e:
    print("bad verb     :", str(e)[:150])
```

```
no match     : []
one match    : 1 row  -> Metabolomic analysis of skeletal muscle in young and aged mice
prefix match : 97 rows -> ['ST001199', 'ST001198', 'ST001197', 'ST001196', 'ST001195'] ...
bad verb     : server rejected '.../study/study_id/ST001179/study_title': This output item
does not exist<br> Chose from: 'ava
```

Encode each segment separately, as `mw()` does. Metabolite names carry spaces, commas,
parentheses and apostrophes, and an unencoded space raises `InvalidURL` in `urllib`
before the request is even sent. `moverz` is the one exception — see below.

The remaining blocks in this skill continue from `mw()` and `rows()`.

## Finding studies

Three routes, and they do not find the same studies.

**Title substring.** `study/study_title/<text>/summary` matches anywhere in the title and
is case-insensitive — `sarcopenia`, `Sarcopenia` and `SARCOPENIA` return the same two
studies, and so does the mid-title phrase `gut microbiota in muscle`. It searches the
title only, not the study summary, which is why it misses as much as it does.

**The curated annotation.** Every study carries a controlled `species`, `Sample source`
and `Disease`. Those three verbs *ignore the value you pass* and return the whole
registry, so pass the bare prefix `ST` and filter locally — one request each, then
intersect in memory.

**`metstat`.** Eight semicolon-separated slots in a single path segment, in this order:
`analysis_type ; polarity ; chromatography ; species ; source ; disease ; kegg_id ;
refmet_name`. Empty slots are skipped but the semicolons must stay, or the remaining
values land in the wrong fields.

The annotation finds studies the title search misses, which is not a marginal effect:

```python
import collections

by_title = {r["study_id"] for r in rows(mw("study", "study_title", "sarcopenia", "summary"))}
print("title contains 'sarcopenia' :", sorted(by_title))

disease = collections.defaultdict(set)
for r in rows(mw("study", "study_id", "ST", "disease")):
    disease[r["Disease"]].add(r["Study ID"])
tissue = collections.defaultdict(set)
for r in rows(mw("study", "study_id", "ST", "source")):
    tissue[r["Sample source"]].add(r["Study ID"])
species = {r["Study ID"]: r["Latin name"]
           for r in rows(mw("study", "study_id", "ST", "species"))}

print(f"registry: {len(disease)} disease terms, {len(tissue)} sample-source terms, "
      f"{len(species)} studies with a species")
print("annotated Disease=Sarcopenia :", sorted(disease["Sarcopenia"]))
print("missed by the title search   :", sorted(disease["Sarcopenia"] - by_title))
print("Sample source=Muscle         :", len(tissue["Muscle"]), "studies;",
      sum(1 for s in tissue["Muscle"] if species.get(s) == "Homo sapiens"), "human")
```

```
title contains 'sarcopenia' : ['ST002998', 'ST003002']
registry: 258 disease terms, 319 sample-source terms, 4465 studies with a species
annotated Disease=Sarcopenia : ['ST001179', 'ST002998', 'ST003002', 'ST003703']
missed by the title search   : ['ST001179', 'ST003703']
Sample source=Muscle         : 144 studies; 20 human
```

Half the sarcopenia studies never say "sarcopenia" in the title. **Always cross the
annotation, never search titles alone.** Note also that `Sample source` is `Muscle`, not
"Skeletal muscle" — the vocabulary is the curators', and a plausible-sounding term
returns `[]` rather than an error.

The same query through `metstat`:

```python
import urllib.request

SLOTS = ["", "", "", "", "Muscle", "Sarcopenia", "", ""]
url = ("https://www.metabolomicsworkbench.org/rest/metstat/"
       + quote(";".join(SLOTS), safe=";"))
print(url)
for r in json.loads(urllib.request.urlopen(url, timeout=90).read()).values():
    print(f"  {r['study']}  {r['species']:6} {r['source']:8} {r['disease']:12} "
          f"{r['study_title'][:62]}")

SLOTS[3] = "Human"
url2 = ("https://www.metabolomicsworkbench.org/rest/metstat/"
        + quote(";".join(SLOTS), safe=";"))
print("with species=Human ->",
      json.loads(urllib.request.urlopen(url2, timeout=90).read()))
```

```
https://www.metabolomicsworkbench.org/rest/metstat/;;;;Muscle;Sarcopenia;;
  ST003703  Mouse  Muscle   Sarcopenia   NAD Depletion in Skeletal Muscle does not Compromise Muscle Fu
  ST001179  Mouse  Muscle   Sarcopenia   Metabolomic analysis of skeletal muscle in young and aged mice
with species=Human -> []
```

That last line is a real finding rather than a bug. As of 2026-08-17 there is **no human
study annotated both `Muscle` and `Sarcopenia`** in this repository. All four sarcopenia
studies are something else: two mouse skeletal-muscle studies (ST001179, ST003703), one
human *faecal* study and one bacterial-culture study from the same Hong Kong gut-microbiome
project (ST003002 and ST002998). Human skeletal-muscle metabolomics does exist here, under
other disease labels — ST004166 (79 injections, muscle wasting in cancer), ST001907
(exercise training), ST001615-ST001617 (limb ischemia), ST000149 (insulin and amino
acids). So if you came looking for the metabolomics half of a human sarcopenia
multi-omics pairing — the companion to a muscle-biopsy RNA-seq series, say — it is not
deposited here under that label, and that is the finding to report rather than a gap to
paper over. MetaboLights is the next place to look, and a general-purpose repository is
the third, because depositors of paired designs sometimes lodge both halves together
instead of splitting them across a transcriptomics archive and a metabolomics one.

## Study design and experimental factors

A study id is not a table. It fans out to one or more **analyses**, each with its own
instrument, ion mode and — this one matters — its own **units**. Read `analysis` before
you read any values.

The design lives in a packed string — pipe-separated `key:value` pairs, as in `Age:28m`
for ST001179. Split on `|` first, then on the **first** colon only. Values contain
punctuation: ST000001's real factor string is
`Arabidopsis Genotype:fatb-ko KD; At1g08510 | Plant Wounding Treatment:Control - Non-Wounded`,
where a semicolon and a hyphen both sit inside values. Splitting on anything but `|` and
the first `:` will cut a value in half.

```python
import collections

STUDY = "ST001179"

s = rows(mw("study", "study_id", STUDY, "summary"))[0]
print(f"{s['study_id']}  {s['study_title']}")
print(f"  {s['species']} · {s['institute']} · {s['analysis_type']} · "
      f"n={s['number_of_samples']} · released {s['release_date']} · {s['license']}")

for a in rows(mw("study", "study_id", STUDY, "analysis")):
    print(f"  {a['analysis_id']}  {a['analysis_summary']:44} "
          f"{a['ms_instrument_name'] or a['nmr_instrument_type']:18} units={a['units']!r}")

def parse_factors(text):
    """'Age:28m | Diet:HFD' -> {'Age': '28m', 'Diet': 'HFD'}"""
    out = {}
    for part in text.split("|"):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip()] = v.strip()
    return out

samples = {}
for f in rows(mw("study", "study_id", STUDY, "factors")):
    samples[f["local_sample_id"]] = parse_factors(f["factors"])

keys = sorted({k for v in samples.values() for k in v})
print(f"\n{len(samples)} samples · factor variables: {keys}")
for k in keys:
    print(f"  {k}: {dict(collections.Counter(v.get(k) for v in samples.values()))}")
```

```
ST001179  Metabolomic analysis of skeletal muscle in young and aged mice
  Mus musculus · Kyoto Prefectural University · CE-MS · n=10 · released 2019-07-17 · CC BY 4.0
  AN001956  None (Direct infusion) POSITIVE ION MODE     Agilent CE-TOFMS   units='fold'
  AN001957  None (Direct infusion) NEGATIVE ION MODE     Agilent CE-TOFMS   units='fold'

10 samples · factor variables: ['Age']
  Age: {'28m': 5, '8w': 5}
```

Two sample identifiers travel together and they are not interchangeable.
`local_sample_id` (`Old-1`) is the depositor's own label and is what keys the value
tables; `mb_sample_id` (`SA081610`) is the repository's. Join on `local_sample_id`.

Factor *names* are free text chosen by the depositor. `Age` here; elsewhere `Treatment`,
`Genotype`, `Group`, `Status`, `Arabidopsis Genotype`. There is no controlled vocabulary,
so read the keys rather than assuming them, and never hardcode `factors["Group"]`. Names
can also collide with the API's own fields — ST004166 has a depositor factor literally
called `Sample source` alongside the response's `sample_source`.

**`number_of_samples` counts injections, not subjects, and QC runs are in there.**
ST004166 reports 79 samples; `sample_source` splits them into **61 `Muscle` biopsies and
18 `_QC_` instrument controls**, and all 79 appear as columns in `data`. ST001179 and
ST003002 have none, so this is per-study rather than universal — which is why you must
check rather than assume:

```python
import collections

for sid in ["ST004166", "ST001179", "ST003002"]:
    s = rows(mw("study", "study_id", sid, "summary"))[0]
    f = rows(mw("study", "study_id", sid, "factors"))
    print(f"{sid}: number_of_samples={s['number_of_samples']}, factors rows={len(f)}, "
          f"sample_source={dict(collections.Counter(r['sample_source'] for r in f))}")
```

```
ST004166: number_of_samples=79, factors rows=79, sample_source={'_QC_': 18, 'Muscle': 61}
ST001179: number_of_samples=10, factors rows=10, sample_source={'Muscle': 10}
ST003002: number_of_samples=51, factors rows=51, sample_source={'Feces': 51}
```

Filter on `sample_source` before any group comparison. Folding 18 instrument-QC injections
into a two-group test inflates n and shrinks the variance, and produces a p-value about
nothing. The QC columns are genuinely useful — for assessing drift and deciding whether
the batch is usable at all — but they are not biological replicates.

## The named metabolites in a study

```python
import collections

STUDY = "ST001179"

mets = rows(mw("study", "study_id", STUDY, "metabolites"))
per_analysis = collections.Counter(m["analysis_id"] for m in mets)
print(f"{len(mets)} metabolite rows across {len(per_analysis)} analyses: {dict(per_analysis)}")

declared = {c["analysis_id"]: int(c["num_metabolites"])
            for c in rows(mw("study", "study_id", STUDY, "number_of_metabolites"))}
for an in sorted(declared):
    print(f"  {an}: number_of_metabolites says {declared[an]:>4}, "
          f"metabolites returns {per_analysis[an]:>4}")

blank = [m["metabolite_name"] for m in mets if not m.get("refmet_name")]
print(f"\n{len(blank)} of {len(mets)} rows carry no refmet_name:")
for n in blank:
    print("   ", repr(n))
```

```
165 metabolite rows across 2 analyses: {'AN001956': 113, 'AN001957': 52}
  AN001956: number_of_metabolites says  119, metabolites returns  113
  AN001957: number_of_metabolites says   56, metabolites returns   52

5 of 165 rows carry no refmet_name:
    '2-(Creatinine-3-yl)propionic acid'
    'O-Acetylhomoserine\u30002-Aminoadipic acid'
    'myo-Inositol 1-phosphate myo-Inositol 3-phosphate'
    'p-Toluic acid m-Toluic acid o-Toluic acid'
    'UDP-glucose UDP-galactose'
```

**Two different counts, and both are right.** `number_of_metabolites` counts every row
of the submitted table; `metabolites` and `data` return only the rows that carry an
identification. The ten-row gap here is exactly the unidentified features — `XC0001`,
`XA0017` and eight more, rows with an m/z and a migration time but no name, no KEGG id
and no HMDB id. It is not a completeness filter: rows with only one non-null sample
value *are* returned. If you quote a metabolite count, say which one you mean.

Two things visible in the blank-`refmet_name` list, both normal rather than defects:

- **Co-eluting sets are deposited as one row with several names in it.** `p-Toluic acid
  m-Toluic acid o-Toluic acid` is three isomers the assay could not separate. There is
  no single correct RefMet name for that row, which is why the field is empty, and any
  mapping you invent for it is a fabricated identification.
- **Names contain characters you will not expect.** That second entry separates its two
  compounds with U+3000 IDEOGRAPHIC SPACE, not a regular space. Metabolite names also
  carry apostrophes, commas and Greek letters. Treat them as opaque unicode, quote them
  on the way into CSV, and never use them as filenames.

## Measured values as a table you can analyse

Read this section before choosing an endpoint. The convenient one is lossy.

`data` is keyed by **study id** and stacks every analysis into one flat numbered dict.
`analysis_id` is the only thing separating them, so group before you pivot — two ion
modes routinely report the same compound, and pivoting on `metabolite_name` alone
overwrites one with the other.

```python
import collections

STUDY = "ST001179"

data = rows(mw("study", "study_id", STUDY, "data"))
by_analysis = collections.defaultdict(list)
for r in data:
    by_analysis[r["analysis_id"]].append(r)
print(f"{len(data)} rows -> "
      + ", ".join(f"{an} ({len(v)} metabolites, units={v[0]['units']!r})"
                  for an, v in sorted(by_analysis.items())))

def wide(analysis_rows):
    """One tidy table per analysis: metabolite x sample, floats, None for missing."""
    samples = sorted({s for r in analysis_rows for s in r["DATA"]})
    table = []
    for r in analysis_rows:
        vals = [None if r["DATA"].get(s) in (None, "") else float(r["DATA"][s])
                for s in samples]
        table.append((r["metabolite_name"], r.get("refmet_name") or "", vals))
    return samples, table

for an, rs in sorted(by_analysis.items()):
    samples, table = wide(rs)
    missing = sum(v is None for _, _, vs in table for v in vs)
    print(f"\n{an}: {len(table)} x {len(samples)} = {len(table)*len(samples)} cells, "
          f"{missing} missing (JSON null, not a string)")
    print("  samples:", samples)
    for name, ref, vals in table[:2]:
        print(f"  {name[:40]:40} {vals[:3]} ...")

# The wide TSV endpoint looks like the shortcut. It formats to 2 decimal places.
an = "AN001956"
lines = mw("study", "analysis_id", an, "datatable").rstrip("\n").split("\n")
hdr = lines[0].split("\t")
flat = {(l.split("\t")[0], hdr[i]): l.split("\t")[i]
        for l in lines[1:] for i in range(2, len(hdr))}
lost = compared = 0
for r in by_analysis[an]:
    for smp, v in r["DATA"].items():
        if v is None:
            continue
        t = flat.get((smp, r["metabolite_name"]))
        if t is None:
            continue
        compared += 1
        if float(v) != 0.0 and float(t) == 0.0:
            lost += 1
print(f"\ndatatable vs data for {an}: {compared} values compared, "
      f"{lost} non-zero values rendered as 0.00 ({100*lost/compared:.0f}%)")
r0 = by_analysis[an][0]
smp = sorted(r0["DATA"])[0]
print(f"  e.g. {r0['metabolite_name'][:34]!r} / {smp}: "
      f"data={r0['DATA'][smp]}  datatable={flat[(smp, r0['metabolite_name'])]}")
```

```
165 rows -> AN001956 (113 metabolites, units='fold'), AN001957 (52 metabolites, units='fold')

AN001956: 113 x 10 = 1130 cells, 146 missing (JSON null, not a string)
  samples: ['Old-1', 'Old-2', 'Old-3', 'Old-4', 'Old-5', 'Young-1', 'Young-2', 'Young-3', 'Young-4', 'Young-5']
  1-Aminocyclopropane-1-carboxylic acid Ho [0.000129326, 0.00012833, 8.42269e-05] ...
  1-Methyladenosine                        [3.89154e-05, None, 3.85369e-05] ...

AN001957: 52 x 10 = 520 cells, 61 missing (JSON null, not a string)
  samples: ['Old-1', 'Old-2', 'Old-3', 'Old-4', 'Old-5', 'Young-1', 'Young-2', 'Young-3', 'Young-4', 'Young-5']
  2-Hydroxyglutaric acid                   [0.00075908, 0.000759585, 0.000580567] ...
  2-Hydroxyisobutyric acid                 [None, None, None] ...

datatable vs data for AN001956: 984 values compared, 654 non-zero values rendered as 0.00 (66%)
  e.g. '1-Aminocyclopropane-1-carboxylic a' / Old-1: data=0.000129326  datatable=0.00
```

**`datatable` formats every value to two decimal places.** For this study — normalised
ratios, values around 10⁻⁴ — **66% of the non-zero measurements come back as `0.00`**.
There is no warning, no null, no error: a complete-looking wide TSV in which two thirds
of the biology has been rounded to zero. Statistics computed on it are wrong and look
fine.

The rounding is absolute, not relative, so whether it costs you anything depends
entirely on the magnitude of the study's units. Checked on the same day against
ST000001, whose units are `Peak height` with values in the thousands: 2,448 values
compared, **zero** losses. That is why the trap survives — it is invisible in exactly
the studies people use to sanity-check their code.

**Use `data` for anything you will compute on.** Reach for `datatable` only for a quick
eyeball, after confirming the units are large, and never for a study reporting ratios,
fold changes, concentrations in molar units, or anything else near zero. `datatable/file`
is the same numbers with a different corruption — it replaces `'` with `^`, so
`2'-Deoxycytidine` arrives as `2^-Deoxycytidine` and no longer joins to anything.

Two more things about values:

- **Missing values are JSON `null`, not `""` and not `NA`.** `float(v)` on them raises
  `TypeError`. Guard, as `wide()` does.
- **Present values are strings.** `"0.000129326"`, not a number. Cast deliberately.
- **`units` is per analysis and is free text** — `fold`, `Peak height`, `peak area`,
  `nmol/g`. Stacking two analyses into one matrix without checking is a unit error, and
  no code will stop you.

## RefMet — standardising metabolite names

This is the section worth your attention. Retrieving one study is a solved problem;
combining two is where metabolomics actually goes wrong, and the cause is almost always
nomenclature. RefMet is a curated reference vocabulary with a class hierarchy, and
`refmet/match` maps a free-text name onto it.

```python
def standardise(name):
    """Map one arbitrary metabolite name onto RefMet. Returns None when unmatched.

    refmet/match answers HTTP 200 whether or not it matched; a miss is a record
    with every field set to the string "-". Checking the status code is not a
    check.
    """
    r = mw("refmet", "match", name, "all")
    if r.get("refmet_name", "-") == "-":
        return None
    return r

for q in ["lactate", "D-Glucose", "alpha-ketoglutarate", "hexadecanoic acid",
          "palmitate", "LysoPC(16:0)", "TG(16:0_18:1_18:2)", "PC 34:1",
          "C16:0", "threo-beta-Methylaspartic acid", "not a metabolite"]:
    r = standardise(q)
    if r is None:
        print(f"  {q:32} -> UNMATCHED")
    else:
        print(f"  {q:32} -> {r['refmet_name']:32} {r['refmet_id']:10} "
              f"{r['formula']:12} {r['super_class']} / {r['main_class']}")
```

```
  lactate                          -> Lactic acid                      RM0135904  C3H6O3       Organic acids / Short-chain acids
  D-Glucose                        -> Glucose                          RM0135901  C6H12O6      Carbohydrates / Monosaccharides
  alpha-ketoglutarate              -> 2-Oxoglutaric acid               RM0135911  C5H6O5       Organic acids / TCA acids
  hexadecanoic acid                -> Palmitic acid                    RM0153571  C16H32O2     Fatty Acyls / Fatty acids
  palmitate                        -> Palmitic acid                    RM0153571  C16H32O2     Fatty Acyls / Fatty acids
  LysoPC(16:0)                     -> LPC 16:0                         RM0134475  C24H50NO7P   Glycerophospholipids / Glycerophosphocholines
  TG(16:0_18:1_18:2)               -> TG 16:0_18:1_18:2                RM0134340  C55H100O6    Glycerolipids / Triradylglycerols
  PC 34:1                          -> PC 34:1                          RM0010728  C42H82NO8P   Glycerophospholipids / Glycerophosphocholines
  C16:0                            -> CAR 16:0                         RM0153848  C23H45NO4    Fatty Acyls / Fatty esters
  threo-beta-Methylaspartic acid   -> UNMATCHED
  not a metabolite                 -> UNMATCHED
```

Trivial name to systematic name, anion form to acid form, and vendor lipid shorthand to
RefMet shorthand all resolve — `lactate` to `Lactic acid`, `palmitate` to `Palmitic
acid`, `LysoPC(16:0)` to `LPC 16:0`, `TG(16:0_18:1_18:2)` to `TG 16:0_18:1_18:2`.
Spelled-out Greek prefixes work sometimes (`alpha-ketoglutarate` resolves) and not
others (see trap 4). Five traps, all confirmed on 2026-08-17:

1. **A miss is `"-"`, not a 404 and not an empty body.** Every field of the record is
   the literal string `-`. Code that trusts the status code, or that writes
   `r["refmet_name"]` straight into a column, silently fills your table with hyphens
   and then joins on them. Check the sentinel — that is what `standardise()` is for.
2. **`C16:0` resolves to `CAR 16:0`, an acyl carnitine.** Anyone writing `C16:0` means
   palmitic acid; the matcher reads it as carnitine shorthand and returns a confident,
   wrong, well-formed answer. Bare `Cn:n` shorthand is ambiguous and RefMet resolves the
   ambiguity differently from how a fatty-acid chemist would. **Never feed bare chain
   shorthand through `match` unattended** — expand it (`hexadecanoic acid` and
   `palmitate` both land correctly) or review every mapping by hand.
3. **The output verb is ignored.** `refmet/match/<name>/name` returns the identical full
   record as `/all`. Do not build logic around narrowing the response.
4. **Non-ASCII defeats it.** `threo-β-Methylaspartic acid` misses, and so does the
   ASCII-transliterated `threo-beta-Methylaspartic acid`, while the systematic
   `threo-3-Methyl-L-aspartic acid` matches. Greek letters, and their spelled-out forms,
   are not reliably handled — as it happens the depositor of ST001179 had already mapped
   this one correctly by hand.
5. **There is no batch endpoint.** `lactate;glucose`, `lactate,glucose` and
   `lactate|glucose` are each read as one long name and each returns `"-"`. One name per
   request, measured at **0.57 s per call** (165 calls in 94.8 s). Budget five minutes
   for a 500-metabolite panel and cache the result to disk — the mapping does not change
   between your runs.

`refmet/name/<exact name>/all` is the strict lookup and returns more fields (SMILES,
InChIKey, PubChem CID, six-decimal exact mass) but only for a name already spelled
exactly right. `match` is fuzzy and returns fewer fields with a 4-decimal mass. Use
`match` to resolve, then `name` to enrich. `refmet/<super_class|main_class|sub_class>/…`
walks the hierarchy — useful for "give me every sterol".

### What standardising actually buys you

The concrete case. Two skeletal-muscle studies, different species, different
instruments, different depositors — ST001179 (aged mouse muscle, CE-MS) and ST004166
(human muscle in cancer-associated wasting, LC-MS). How many metabolites do they share?

```python
A, B = "ST001179", "ST004166"

def name_map(study):
    """submitted metabolite_name -> refmet_name, for one study."""
    return {m["metabolite_name"]: (m.get("refmet_name") or "")
            for m in rows(mw("study", "study_id", study, "metabolites"))}

a, b = name_map(A), name_map(B)
raw = set(a) & set(b)
std = {v for v in a.values() if v} & {v for v in b.values() if v}

print(f"{A}: {len(a)} submitted names, {sum(1 for v in a.values() if v)} carry a refmet_name")
print(f"{B}: {len(b)} submitted names, {sum(1 for v in b.values() if v)} carry a refmet_name")
print(f"\njoin on submitted metabolite_name : {len(raw):>3} shared metabolites")
print(f"join on refmet_name               : {len(std):>3} shared metabolites")
print(f"recovered by standardising        : {len(std) - len(raw):>3} "
      f"(+{100*(len(std)-len(raw))/len(raw):.0f}%)")

inv_a, inv_b = {}, {}
for k, v in a.items():
    if v:
        inv_a.setdefault(v, k)
for k, v in b.items():
    if v:
        inv_b.setdefault(v, k)
print("\nmetabolites the raw join misses, and the two spellings responsible:")
for ref in sorted(std - raw)[:10]:
    print(f"  {ref[:30]:30}  {A}={inv_a[ref][:24]:24}  {B}={inv_b[ref][:24]}")
```

```
ST001179: 165 submitted names, 160 carry a refmet_name
ST004166: 356 submitted names, 356 carry a refmet_name

join on submitted metabolite_name :  62 shared metabolites
join on refmet_name               : 110 shared metabolites
recovered by standardising        :  48 (+77%)

metabolites the raw join misses, and the two spellings responsible:
  1-Methyl nicotinamide           ST001179=1-Methylnicotinamide      ST004166=1-Methyl nicotinamide
  3-Dehydroxycarnitine            ST001179=γ-Butyrobetaine           ST004166=3-Dehydroxycarnitine
  4-Guanidinobutanoic acid        ST001179=4-Guanidinobutyric acid   ST004166=4-Guanidinobutanoic acid
  5'-Methylthioadenosine          ST001179=5'-Deoxy-5'-methylthioad  ST004166=5'-Methylthioadenosine
  Alanine                         ST001179=Ala                       ST004166=Alanine
  Aminoisobutyric acid            ST001179=2-Aminoisobutyric acid 2  ST004166=Aminoisobutyric acid
  Arginine                        ST001179=Arg                       ST004166=Arginine
  Asparagine                      ST001179=Asn                       ST004166=Asparagine
  Aspartic acid                   ST001179=Asp                       ST004166=Aspartic acid
  CAR 2:0                         ST001179=O-Acetylcarnitine         ST004166=CAR 2:0
```

**62 shared metabolites become 110.** Joining on the submitted name throws away 44% of
the overlap, and the losses are not exotic — one study wrote `Ala`, the other wrote
`Alanine`. Nobody inspecting a merged table would notice alanine was missing.

**Prefer the deposited `refmet_name` over calling `match` yourself, for studies already
in this repository.** Checked across all 165 names of ST001179: the deposited field and
a live `refmet/match` agreed on 159, **disagreed on none**, and the deposited field was
right on one name (`threo-β-Methylaspartic acid`) that live matching missed. The
curators have done this work, so use it. Where live `match` earns its place is names
coming from *outside* — your own assay, a paper's supplementary table, another
repository — which have no `refmet_name` to inherit.

## The full submission record

`mwtab` returns everything the depositor submitted: project and study summaries,
collection and treatment protocols, sample preparation, chromatography, instrument
settings, and the metabolite annotation table with m/z, retention or migration time,
KEGG and HMDB ids. It is the authoritative record, and the only place some of that
metadata exists.

**It is not valid JSON for a multi-analysis study.** `Content-Type` says
`application/json`, and the body is one complete JSON document *per analysis*,
concatenated with no array around them. `json.loads` raises `Extra data`.

```python
def mwtab_text(study):
    """The raw body. Do NOT route this through mw() — mw() calls json.loads,
    which is exactly what fails here."""
    url = f"{BASE}/study/study_id/{quote(study, safe='')}/mwtab"
    return urllib.request.urlopen(url, timeout=120).read().decode("utf-8", "replace")

def mwtab(study):
    """study/<id>/mwtab returns one JSON document PER ANALYSIS, concatenated.

    Content-Type says application/json, but a multi-analysis study is not valid
    JSON — json.loads raises 'Extra data'. Decode incrementally instead.
    """
    text = mwtab_text(study)
    dec, i, out = json.JSONDecoder(), 0, []
    while i < len(text):
        while i < len(text) and text[i].isspace():
            i += 1
        if i >= len(text):
            break
        obj, i = dec.raw_decode(text, i)   # returns (object, index just past it)
        out.append(obj)
    return out

for study in ["ST000001", "ST001179"]:
    try:
        json.loads(mwtab_text(study))
        verdict = "json.loads succeeds"
    except json.JSONDecodeError as e:
        verdict = f"json.loads raises JSONDecodeError: {e.msg}"
    docs = mwtab(study)
    print(f"{study}: {verdict}  ->  {len(docs)} document(s)")
    for d in docs:
        h = d["METABOLOMICS WORKBENCH"]
        print(f"    {h['ANALYSIS_ID']}  created {h['CREATED_ON']}  blocks={len(d)}  "
              f"metabolites={len(d['MS_METABOLITE_DATA']['Metabolites'])}")
    print(f"    STUDY_SUMMARY: {docs[0]['STUDY']['STUDY_SUMMARY'][:110]}...")
```

```
ST000001: json.loads succeeds  ->  1 document(s)
    AN000001  created 2016-09-17  blocks=12  metabolites=107
    STUDY_SUMMARY: This experiment tests the consequence of a mutation at the FatB gene in the wound-response of Arabidopsis. The...
ST001179: json.loads raises JSONDecodeError: Extra data  ->  2 document(s)
    AN001956  created May 7, 2019, 12:25 pm  blocks=12  metabolites=119
    AN001957  created May 7, 2019, 12:25 pm  blocks=12  metabolites=56
    STUDY_SUMMARY: Sarcopenia is the age-induced, progressive loss of skeletal muscle mass and function, which results in poor mu...
```

A single-analysis study parses cleanly, which is precisely how this bug reaches
production: the code works on the first study you try. Request
`study/analysis_id/<AN>/mwtab` if you want one guaranteed document, or decode
incrementally as above.

Two smaller notes. `CREATED_ON` has no fixed format — `2016-09-17` in one record,
`May 7, 2019, 12:25 pm` in another; parse defensively or leave it as a string. And the
block set varies between studies: ST000001 carries `PROJECT.PUBLICATIONS`, ST001179 and
ST004166 do not, so use `.get()`.

## Which studies measured my metabolite

`study/refmet_name/<name>/data` and `study/kegg_id/<id>/data` invert the question.

```python
METABOLITE = "Carnosine"          # must be a refmet_name, not a synonym

cov = rows(mw("study", "refmet_name", METABOLITE, "data"))
studies = {r["study_id"] for r in cov}
print(f"{METABOLITE}: measured in {len(studies)} studies")
print("  DATA populated in", sum(1 for r in cov if r["DATA"]), "of", len(cov),
      "rows -- this verb is a coverage index, not values")

muscle = {r["Study ID"] for r in rows(mw("study", "study_id", "ST", "source"))
          if r["Sample source"] == "Muscle"}
human = {r["Study ID"] for r in rows(mw("study", "study_id", "ST", "species"))
         if r["Latin name"] == "Homo sapiens"}

hits = sorted(studies & muscle & human)
print(f"\nhuman + muscle + {METABOLITE}: {len(hits)} studies")
for sid in hits:
    s = rows(mw("study", "study_id", sid, "summary"))[0]
    print(f"  {sid}  n={s['number_of_samples']:>4}  {s['analysis_type']:12} "
          f"{s['study_title'][:66]}")
```

```
Carnosine: measured in 606 studies
  DATA populated in 0 of 606 rows -- this verb is a coverage index, not values

human + muscle + Carnosine: 5 studies
  ST000149  n= 120  LC-MS        High Insulin Combined With Essential Amino Acids Stimulates Skelet
  ST000484  n=  40  LC-MS        Amino Acid Quantifcation of obese patients on a 16 week caloric re
  ST000841  n=  28  LC-MS        Metabolomics of muscle in insulin sensitive and resistant obese in
  ST001005  n=  30  LC-MS        Amino Acid Concentrations in Muscle Tissue of Muscle Wasting in Ca
  ST004166  n=  79  LC-MS        Distinct skeletal muscle metabolomic alterations are associated wi
```

**The verb is `data` and it returns no data.** All 606 rows carry `"DATA": []`. It is a
coverage index — *which studies measured this* — and you still fetch each study's values
separately. Useful, but do not plan a cross-study matrix around one request.

The input must be an exact `refmet_name`. `carnosine` in lower case, or a synonym,
returns nothing. Resolve through `refmet/match` first.

## m/z to candidate metabolites

For an unidentified feature, `moverz` searches by mass:
`moverz/<MB|LIPIDS|REFMET>/<m/z>/<adduct>/<tolerance in Da>`.

```python
def moverz(db, mz, adduct, tol_da):
    """m/z -> candidate metabolites. Always tab-delimited text, whatever the
    Content-Type header says, so do not send this through a JSON decoder."""
    url = ("https://www.metabolomicsworkbench.org/rest/moverz/"
           f"{db}/{mz}/{quote(adduct, safe='+')}/{tol_da}")
    txt = urllib.request.urlopen(url, timeout=90).read().decode("utf-8", "replace")
    rs = [l.split("\t") for l in txt.rstrip("\n").split("\n") if l.strip()]
    return rs[0], rs[1:]

hdr, body = moverz("REFMET", 255.2, "M+H", 0.2)
print(len(body), "candidates within 0.2 Da")
print("columns:", hdr)
for r in body[:5]:
    print("  " + " | ".join((r[0], r[1], r[2], r[3][:30], r[7], r[8])))
```

```
81 candidates within 0.2 Da
columns: ['Input m/z', 'Matched m/z', 'Delta', 'Name', 'Systematic name', 'Formula', 'Ion', 'Category', 'Main class', 'Sub class']
  255.2 | 255.1955 | .0045 | 5-Hydroxyculmorin | Prenol Lipids | Isoprenoids
  255.2 | 255.1955 | .0045 | Hydroxypentadecadienoic acid | Fatty Acyls | Fatty acids
  255.2 | 255.2107 | .0107 | 18-Nor-4(19),8,11,13-abietatet | Prenol Lipids | Isoprenoids
  255.2 | 255.1856 | .0144 | Tetra-base | Benzenoids | Benzenes
  255.2 | 255.1743 | .0257 | ST 18:4;O | Sterol Lipids | Steroids
```

**`moverz` returns `Content-Type: text/html` on success**, with a tab-delimited body — so
the HTML check in `mw()` would reject a perfectly good response. That is why it has its
own function. The adduct segment works either raw (`M+H`) or percent-encoded (`M%2BH`).

81 candidates for one mass at 0.2 Da is the honest answer, not a failure. **A mass match
is a hypothesis, not an identification**, and reporting the top row as "the metabolite"
is the classic untargeted-metabolomics error. Narrow with retention time, isotope
pattern, MS/MS fragmentation or an authentic standard before naming anything.

## Get the files

Everything above prints. This writes a study to disk in a form an analyst can open:
a sample sheet with the factors split into columns, a metabolite table carrying RefMet
and the mwtab annotation, one full-precision value matrix per analysis, the complete
submission records, and a manifest recording units, licence, study version and the
retrieval date.

Three decisions in here are the point of the section. Values come from `data`, not
`datatable`, so they keep their precision. `mwtab` is split into one file per analysis,
so each file on disk is valid JSON. And the manifest stores `units_by_analysis` beside
the numbers, because a matrix of floats with no units is not a dataset.

```python
import datetime, json, os, urllib.request
from urllib.parse import quote

STUDY, OUT = "ST001179", "Data/metabolomics_workbench"
BASE = "https://www.metabolomicsworkbench.org/rest"
os.makedirs(OUT, exist_ok=True)

def fetch(*segments):
    url = BASE + "".join("/" + quote(str(s), safe="") for s in segments)
    with urllib.request.urlopen(url, timeout=120) as r:
        if "text/html" in r.headers.get("Content-Type", ""):
            raise ValueError(f"server rejected {url}")
        return r.read().decode("utf-8", "replace")

def rows(payload):
    if isinstance(payload, list):
        return payload
    if payload and all(isinstance(v, dict) for v in payload.values()):
        return list(payload.values())
    return [payload]

def documents(text):
    dec, i, out = json.JSONDecoder(), 0, []
    while i < len(text):
        while i < len(text) and text[i].isspace():
            i += 1
        if i >= len(text):
            break
        obj, i = dec.raw_decode(text, i)
        out.append(obj)
    return out

def csv_text(table):
    return "\n".join(",".join('"' + str(c).replace('"', '""') + '"' for c in row)
                     for row in table) + "\n"

written = []
def save(name, blob):
    path = os.path.join(OUT, name)
    with open(path, "w") as fh:
        fh.write(blob)
    written.append({"path": path, "bytes": os.path.getsize(path)})
    print(f"  {os.path.getsize(path):>9,} B  {path}")

# 1. Study record and per-analysis metadata.
summary = rows(json.loads(fetch("study", "study_id", STUDY, "summary")))[0]
analyses = rows(json.loads(fetch("study", "study_id", STUDY, "analysis")))
save(f"{STUDY}_summary.json",
     json.dumps({"summary": summary, "analyses": analyses}, indent=2))

# 2. Sample sheet, with the packed factor string split into columns.
factors = rows(json.loads(fetch("study", "study_id", STUDY, "factors")))
keys = []
for f in factors:
    for part in f["factors"].split("|"):
        k = part.split(":", 1)[0].strip()
        if ":" in part and k not in keys:
            keys.append(k)
table = [["local_sample_id", "mb_sample_id", "sample_source"] + keys]
for f in factors:
    parsed = dict(p.split(":", 1) for p in f["factors"].split("|") if ":" in p)
    table.append([f["local_sample_id"], f["mb_sample_id"], f["sample_source"]]
                 + [parsed.get(k, "").strip() for k in keys])
save(f"{STUDY}_samples.csv", csv_text(table))

# 3. mwtab — ONE FILE PER ANALYSIS, so each file is valid JSON on its own.
annot = {}
for d in documents(fetch("study", "study_id", STUDY, "mwtab")):
    an = d["METABOLOMICS WORKBENCH"]["ANALYSIS_ID"]
    save(f"{STUDY}_{an}_mwtab.json", json.dumps(d, indent=2))
    annot[an] = {m["Metabolite"]: m for m in d["MS_METABOLITE_DATA"]["Metabolites"]}

# 4. Metabolite table, carrying RefMet plus the mwtab annotation columns.
mets = rows(json.loads(fetch("study", "study_id", STUDY, "metabolites")))
table = [["analysis_id", "metabolite_name", "refmet_name", "kegg_id", "hmdb_id", "mz"]]
for m in mets:
    a = annot.get(m["analysis_id"], {}).get(m["metabolite_name"], {})
    table.append([m["analysis_id"], m["metabolite_name"], m.get("refmet_name") or "",
                  a.get("KEGG ID", ""), a.get("HMDB ID", ""), a.get("m/z", "")])
save(f"{STUDY}_metabolites.csv", csv_text(table))

# 5. Measured values — from 'data', at full precision, one file per analysis.
#    'datatable' would be quicker and would round these to 2 decimal places.
per = {}
for r in rows(json.loads(fetch("study", "study_id", STUDY, "data"))):
    per.setdefault(r["analysis_id"], []).append(r)
units = {}
for an, rs in sorted(per.items()):
    samples = sorted({s for r in rs for s in r["DATA"]})
    units[an] = rs[0]["units"]
    table = [["metabolite_name", "refmet_name"] + samples]
    for r in rs:
        table.append([r["metabolite_name"], r.get("refmet_name") or ""]
                     + ["" if r["DATA"].get(s) in (None, "") else r["DATA"][s]
                        for s in samples])
    save(f"{STUDY}_{an}_values.csv", csv_text(table))

# 6. Raw instrument files, if any — check the size before committing to a download.
raw = []
for fn in json.loads(fetch("study", "study_id", STUDY, "files")).get("files", []):
    url = f"https://www.metabolomicsworkbench.org/studydownload/{fn}"
    with urllib.request.urlopen(
            urllib.request.Request(url, method="HEAD"), timeout=90) as r:
        size = int(r.headers.get("Content-Length") or 0)
    raw.append({"file": fn, "url": url, "bytes": size})
    print(f"  raw archive available: {fn} = {size:,} B (not downloaded)")
if not raw:
    print("  no raw instrument archive deposited for this study")

# 7. Manifest — units, licence and retrieval date, beside the data.
save(f"{STUDY}_manifest.json", json.dumps({
    "study_id": STUDY, "study_title": summary["study_title"],
    "species": summary["species"], "license": summary["license"],
    "license_url": summary["license_url"], "study_url": summary["study_url"],
    "study_version": summary["version"], "revision_no": summary["revision_no"],
    "retrieved": datetime.date.today().isoformat(),
    "units_by_analysis": units, "raw_archives": raw, "files": written,
}, indent=2))
print(f"\n{len(written)} files written to {OUT}/")
```

Run 2026-08-17 against ST001179 v1 rev 1:

```
      1,829 B  Data/metabolomics_workbench/ST001179_summary.json
        400 B  Data/metabolomics_workbench/ST001179_samples.csv
     70,528 B  Data/metabolomics_workbench/ST001179_AN001956_mwtab.json
     36,325 B  Data/metabolomics_workbench/ST001179_AN001957_mwtab.json
     13,487 B  Data/metabolomics_workbench/ST001179_metabolites.csv
     18,006 B  Data/metabolomics_workbench/ST001179_AN001956_values.csv
      8,566 B  Data/metabolomics_workbench/ST001179_AN001957_values.csv
  no raw instrument archive deposited for this study
      1,250 B  Data/metabolomics_workbench/ST001179_manifest.json

8 files written to Data/metabolomics_workbench/
```

Sizes move if the study is revised; the file count, the one-mwtab-per-analysis split,
and the "no raw archive" branch are what should hold.

**Check the raw-archive size before you download it.** Most studies with raw data deposit
a single zip of mzML files, and they are large. ST001179 deposited none at all, which is
common for older studies and for CE-MS — the processed table is all there is. Changing
one line to `STUDY, OUT = "ST004166", ...` takes the other branch, same run:

```
      2,043 B  Data/metabolomics_workbench/ST004166_summary.json
      3,341 B  Data/metabolomics_workbench/ST004166_samples.csv
    557,137 B  Data/metabolomics_workbench/ST004166_AN006915_mwtab.json
    442,877 B  Data/metabolomics_workbench/ST004166_AN006916_mwtab.json
     22,642 B  Data/metabolomics_workbench/ST004166_metabolites.csv
    124,914 B  Data/metabolomics_workbench/ST004166_AN006915_values.csv
    106,651 B  Data/metabolomics_workbench/ST004166_AN006916_values.csv
  raw archive available: ST004166_Rawfiles.zip = 1,253,871,672 B (not downloaded)
      1,525 B  Data/metabolomics_workbench/ST004166_manifest.json
```

**1.25 GB of mzML for 79 injections, against 1.3 MB of processed tables.** The block
reports the size and deliberately does not fetch it, because you almost never need the
raw files — you need them only to re-do peak picking or re-do the identifications, and
if you are doing neither, the processed table is the dataset.

To fetch one deliberately, having seen the size:

```bash
curl -O "https://www.metabolomicsworkbench.org/studydownload/ST004166_Rawfiles.zip"
```

Record `version` and `revision_no` in the manifest, as above. Studies are revised in
place under the same accession, so a directory of CSVs with no version stamp cannot be
compared against a re-download later.

## Try it

A self-contained check that this skill still works. Public data, no account, no key,
Python standard library only. Runs in about five seconds.

**Data** — study `ST001179`, "Metabolomic analysis of skeletal muscle in young and aged
mice" (Kamei lab, Kyoto Prefectural University; 5 young vs 5 aged mice, CE-MS, two ion
modes), resolved through the REST endpoint:

    https://www.metabolomicsworkbench.org/rest/study/study_id/ST001179/summary

Released under CC BY 4.0, as reported by the endpoint itself. No account or licence
acceptance is needed. Last confirmed reachable 2026-08-17. This study is used because it
is small, because it is annotated `Disease=Sarcopenia` while its title never says so,
and because its two analyses and near-zero `fold` units route the example through four
separate traps at once.

```python
import json, urllib.request
from urllib.parse import quote

BASE = "https://www.metabolomicsworkbench.org/rest"
STUDY, POS = "ST001179", "AN001956"

def mw(*seg):
    url = BASE + "".join("/" + quote(str(s), safe="") for s in seg)
    with urllib.request.urlopen(url, timeout=90) as r:
        ctype, body = r.headers.get("Content-Type", ""), r.read().decode("utf-8", "replace")
    if "text/html" in ctype:          # a rejected path still answers HTTP 200
        raise ValueError(body.strip()[:80])
    return json.loads(body) if "json" in ctype else body

def rows(p):
    if isinstance(p, list):
        return p
    return list(p.values()) if p and all(isinstance(v, dict) for v in p.values()) else [p]

s = rows(mw("study", "study_id", STUDY, "summary"))[0]
assert s["study_id"] == STUDY and s["license"] == "CC BY 4.0"

# One study id fans out to several analyses; each has its own units.
analyses = rows(mw("study", "study_id", STUDY, "analysis"))
units = {a["analysis_id"]: a["units"] for a in analyses}

# 'data' stacks every analysis into one flat numbered dict.
data = rows(mw("study", "study_id", STUDY, "data"))
per = {}
for r in data:
    per.setdefault(r["analysis_id"], []).append(r)
nulls = sum(1 for r in data for v in r["DATA"].values() if v is None)

# The wide TSV endpoint is keyed by ANALYSIS id, and formats to 2 decimal places.
lines = mw("study", "analysis_id", POS, "datatable").rstrip("\n").split("\n")
hdr = lines[0].split("\t")
flat = {(l.split("\t")[0], hdr[i]): l.split("\t")[i]
        for l in lines[1:] for i in range(2, len(hdr))}
lost = tot = 0
for r in per[POS]:
    for smp, v in r["DATA"].items():
        t = flat.get((smp, r["metabolite_name"]))
        if v is None or t is None:
            continue
        tot += 1
        lost += float(v) != 0.0 and float(t) == 0.0

# refmet: a miss is HTTP 200 with every field set to "-", not a 404.
hit = mw("refmet", "match", "alpha-ketoglutarate", "all")
miss = mw("refmet", "match", "not a metabolite", "all")

try:
    mw("study", "study_id", STUDY, "study_title")
    bad = "accepted (unexpected)"
except ValueError as e:
    bad = f"rejected with HTTP 200 + HTML: {e}"

print("title          :", s["study_title"])
print("analyses       :", units)
print("data rows      :", len(data), "=",
      " + ".join(f"{k}:{len(v)}" for k, v in sorted(per.items())))
print("null cells     :", nulls)
print("samples        :", len(rows(mw("study", "study_id", STUDY, "factors"))))
print("datatable      : %d/%d values (%.0f%%) non-zero in data but 0.00 here"
      % (lost, tot, 100 * lost / tot))
print("refmet hit     :", hit["refmet_name"], "/", hit["refmet_id"])
print("refmet miss    :", miss["refmet_name"], "<- sentinel, not an error")
print("bad output verb:", bad)
```

**Expect**

Invariants — these hold regardless of what the repository grows to, and a failure means
this skill is *wrong* rather than out of date:

- The summary of a single study is a **flat object**, not wrapped in `{"1": …}`. That is
  what `rows(...)[0]` proves; the shape depends on the match count, not the endpoint.
- `study/study_id/<ST>/data` **stacks every analysis together**, so the row count equals
  the sum of the per-analysis counts and `analysis_id` is the only separator.
- Missing values are JSON `null`, so `nulls > 0` and iterating `DATA` without a guard
  raises `TypeError`.
- `datatable` is keyed by `analysis_id` and rounds to two decimals, so for a study whose
  units are near zero **`lost` is a large fraction of `tot`** while `data` keeps full
  precision. If `lost` ever drops to 0 here, `datatable` has been fixed upstream — good
  news, and still drift to confirm before trusting it.
- `refmet/match` on a nonsense string returns HTTP 200 with `refmet_name == "-"`. It
  never 404s, so a status-code check is not a check.
- A wrong output verb returns HTTP 200 with an HTML body. The `ValueError` is raised by
  the content-type test, which is the only thing that can detect it.
- `refmet/match` normalises a synonym — `alpha-ketoglutarate` resolves to a different
  string than the one submitted.

Observed 2026-08-17 against ST001179 **version 1, revision 1** — these move if the study
is revised or the repository is rebuilt, so treat a mismatch as drift to investigate:

```
title          : Metabolomic analysis of skeletal muscle in young and aged mice
analyses       : {'AN001956': 'fold', 'AN001957': 'fold'}
data rows      : 165 = AN001956:113 + AN001957:52
null cells     : 207
samples        : 10
datatable      : 654/984 values (66%) non-zero in data but 0.00 here
refmet hit     : 2-Oxoglutaric acid / RM0135911
refmet miss    : - <- sentinel, not an error
bad output verb: rejected with HTTP 200 + HTML: This output item does not exist<br> Chose from: ...
```

## Limits worth stating in a write-up

- **Values are as deposited, not harmonised.** Units, normalisation and batch structure
  are the depositor's choices and differ between studies. Two studies' numbers are not
  on a common scale even after their names are, and RefMet fixes the nomenclature
  problem, not the quantification one.
- **Named metabolites only.** The `metabolites` and `data` verbs cover rows the curators
  could identify. Unidentified features live in the `mwtab` annotation table with an m/z
  and a retention time, and in the raw files. Most untargeted features are never named.
- **Coverage is uneven.** 258 disease terms and 319 sample-source terms over a few
  thousand studies means many cells of that grid hold one study or none. Report the
  study count you found, not just the studies.
- **Annotation is per study, not per sample.** A study tagged `Disease=Cancer` may
  include healthy controls; the sample-level truth is in `factors`.
- **Studies are revised in place.** The accession does not change when the data does.
  Record `version` and `revision_no`.
- **Sample sizes are small, and smaller than the headline figure.** Ten mice in ST001179;
  ST004166's 79 becomes 61 once the QC injections come out. Perfectly normal for
  metabolomics and a real constraint on what a reanalysis can conclude, so quote the
  biological n rather than `number_of_samples`.
- **A search that returns nothing here has not shown the data does not exist.** Check
  MetaboLights, and check whether the metabolomics half of a multi-omics study was
  deposited alongside its transcriptomics in a general repository instead of either
  metabolomics archive.

## Sources

- Metabolomics Workbench — https://www.metabolomicsworkbench.org/
- REST API documentation — https://www.metabolomicsworkbench.org/tools/mw_rest.php
- RefMet — https://www.metabolomicsworkbench.org/databases/refmet/
- Sud et al. (2016) *Nucleic Acids Research* 44, D463-D470 — https://doi.org/10.1093/nar/gkv1042
- Fahy & Subramaniam (2020) *Nature Methods* 17, 1173-1174 — https://doi.org/10.1038/s41592-020-01009-y
- Uchitomi et al. (2019) *Scientific Reports* 9, 10425 — https://doi.org/10.1038/s41598-019-46929-8 (the paper behind ST001179, used throughout)
- MetaboLights, the EMBL-EBI counterpart — https://www.ebi.ac.uk/metabolights/

Deposited studies carry their own licence, reported in the `license` field of every
`summary` response; the studies used here are CC BY 4.0. Cite the depositing study's
paper and its accession when you reuse its data, and cite the repository and RefMet
papers when you rely on the infrastructure.
