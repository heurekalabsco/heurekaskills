---
name: motrpac
description: Retrieve MoTrPAC multi-omics from the openly licensed R data package and public bucket instead of the account-gated Data Hub API — transcriptomics, proteomics, phosphoproteomics, acetylome, metabolomics, ATAC-seq and RRBS across twenty rat tissues including heart, skeletal muscle, liver and adipose, in endurance-trained animals. Young-adult 6-month cohort, not an aged one.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [multi-omics, exercise, rat, transcriptomics, public-data]
covers: [exercise, endurance training, treadmill, multi-omics, transcriptomics, proteomics, phosphoproteomics, acetylome, ubiquitylome, metabolomics, epigenomics, atac-seq, rrbs, dna methylation, immunoassay, heart, skeletal muscle, gastrocnemius, vastus lateralis, liver, white adipose, brown adipose, kidney, lung, hippocampus, rat, f344, pass1b, vo2max, aging]
papers: [PMID:38693412, PMID:32589957, PMID:38701776, PMID:38693320, PMID:38984994, doi:10.5281/zenodo.7877121]
access: [open]
platform: motrpac
datasets: [https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/PHENO.rda, https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/PROT_HEART_DA.rda, https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/TRAINING_REGULATED_FEATURES.rda, https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da/PROT/pass1b-06_t58-heart_prot-pr_training-dea-fdr.txt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-17
  against: MotrpacRatTraining6moData git tag v2.1.0 (its DESCRIPTION still reads 2.0.0) / motrpac-rat-training-6mo-extdata bucket / Python 3.12.8 / pyreadr 0.5.3 / pandas 2.3.2 / R 4.4.1
  executed: 8
  unverified: 1
  unverified_reason: the whole-package R install block could not be run to completion — GitHub's tarball endpoint answers HTTP 504 for this repository (reproduced twice on 2026-08-17), which is the failure the block routes around, and the codeload archive it uses instead answered 200 but had transferred only 215 MB of roughly 400 MB after 420 s. Every other block, including all downloads and both conversion routes, was executed verbatim.
---
# MoTrPAC — rat endurance exercise training multi-omics

MoTrPAC (Molecular Transducers of Physical Activity Consortium, NIH Common Fund) ran
a treadmill training intervention in Fischer 344 rats and then measured nine molecular
assays across twenty tissues **in the same animals**. That combination is what makes it
unusual: cardiac, skeletal-muscle, hepatic and adipose readouts from one cohort, one
protocol, one set of sample identifiers, so a cross-organ pipeline can be validated
without stitching cohorts together.

Two things decide whether it answers your question, and both are settled below before any
code: **which animals are in the open release**, and **which route actually serves the
data** — because the obvious one does not.

## The open release is young adult, not aged

Every openly available omics object comes from **PASS1B-06 — 6-month-old rats**. Not a
guess from the package name: `PHENO` carries the design columns, and on 2026-08-17 all
6,156 of its rows read `key.agegroup == "6 months"` and `key.protocol == "phase 1b"`.
The `## Try it` block at the end asserts exactly this, so the claim re-checks itself.

The consortium did run an **18-month aged arm**, and it is public — but only as
physiology. In `MotrpacRatTrainingPhysiologyData`, `VO2MAX$age` and `BODY_MASSES$age`
both take the values `6M` and `18M` (verified 2026-08-17): body composition, VO2max, run
speed, muscle mass, fibre typing and plasma clinical analytes. **No aged omics has been
released on any open route.** Checked, same date:

- not in the R data package — `PHENO` has one age group
- not on the public bucket — `training-da/PROT/pass1b-06_…` returns 200, the identical
  URL with `pass1b-18` returns 404, and so does `pass1a-06` (the acute-exercise arm)
- not in GEO — a title search for MoTrPAC returns exactly four *Rattus norvegicus*
  series, `GSE242358` and its three subseries, all titled *…In 6 Months Old Rats*

So: reach for this as an **exercise-response and cross-tissue-integration** resource. If
your question is about age, the open omics cannot answer it, and the aged physiology
lives in a differently licensed package (see the licence table). Say which one you used.

**The design.** Training ran for 1, 2, 4 or 8 weeks, both sexes, with a **sedentary
control group that was held for 8 weeks and serves as the reference for every
timepoint** — there is no per-timepoint control. Differential-analysis tables therefore
carry `comparison_group` in `1w 2w 4w 8w` and are computed **separately per sex**.

## Do not route through the Data Hub API

The portal at motrpac-data.org is a single-page app, so its endpoints are invisible in
the page source and turn up only in its JavaScript bundle. Both refuse anonymous
callers, so neither belongs in a pipeline:

```bash
curl -s -o /dev/null -w "data_files  -> HTTP %{http_code}\n" "https://services.motrpac-data.org/v1/data_files"
curl -s "https://services.motrpac-data.org/v1/data_files" | grep -o UNAUTHENTICATED
curl -s -o /dev/null -w "search/api  -> HTTP %{http_code}\n" "https://search.motrpac-data.org/search/api"
curl -s "https://search.motrpac-data.org/search/api" | grep -o "Not authenticated"
```

Run 2026-08-17:

```
data_files  -> HTTP 401
UNAUTHENTICATED
search/api  -> HTTP 401
Not authenticated
```

The block greps rather than printing the bodies because the JSON field order is not
stable — the same endpoint returned `{"message":…,"code":401}` and `{"code":401,"message":…}`
on two calls minutes apart. The full first message is *UNAUTHENTICATED — Method doesn't
allow unregistered callers (callers without established identity). Please use API Key or
other form of API consumer identity to call this API*; the second is
`{"detail":"Not authenticated"}`. Match on the status code, never on a serialised body.

No public registration route for such a key is advertised, so treat these as internal to
the portal. Nothing in this skill needs them — every route below is anonymous.

## What is open, and under exactly which terms

| resource | licence | what it carries |
|---|---|---|
| `MotrpacRatTraining6moData` | **code MIT, data CC BY 4.0** — its README states the two separately | 206 objects — differential analyses, normalised matrices, sample metadata |
| `MotrpacRatTraining6mo` | MIT | companion analysis functions, R only |
| `MotrpacRatTraining6moWATData` | **MIT** | subcutaneous white adipose companion paper |
| `MotrpacRatTrainingPhysiologyData` | **GPL-3** | physiology for both the 6-month **and 18-month** arms |
| `motrpac-rat-training-6mo-extdata` bucket | no separate terms — same data as the package | full epigenomics, feature annotations, plain-text DA tables |
| GEO `GSE242358` (+ `GSE242354`, `GSE242355`, `GSE242357`) | GEO terms | raw RNA-seq (915), RRBS (416), ATAC-seq (416) samples |

Two of these repositories report no licence through GitHub's licence API, which is what
you see if you only check that field. Both actually carry one, and they are **not the
same one** — R packages conventionally split the year and copyright holder into `LICENSE`
and the licence text into `LICENSE.md`, which defeats the detector. Read both files:

- `MotrpacRatTraining6moWATData` — `LICENSE.md` is the MIT text, `DESCRIPTION` says
  `MIT + file LICENSE`. Usable on the same terms as the main package.
- `MotrpacRatTrainingPhysiologyData` — `LICENSE.md` is **GPL-3**, `DESCRIPTION` says
  `GPL (>= 3) + file LICENSE`. Anyone may download and use it; share-alike bites if you
  **redistribute** a derived dataset or package. This is the one holding the aged arm, so
  if you publish an aged-vs-adult comparison, check the obligation before you ship files.

Cite the version you used. The consortium's data use agreement asks for MoTrPAC to be
acknowledged as the source **including the dataset version number**, which is a
reasonable request and also the only way anyone can reproduce you — the objects change
between releases.

## Object names are the index

Everything in the data package follows `{ASSAY}_{TISSUE}_{KIND}`, and there is no search
endpoint, so knowing the grammar *is* the query interface.

Nine assays, with the codes used in bucket paths:

| abbrev | code | assay |
|---|---|---|
| `TRNSCRPT` | `transcript-rna-seq` | RNA-seq |
| `PROT` | `prot-pr` | global proteomics |
| `PHOSPHO` | `prot-ph` | phosphoproteomics |
| `ACETYL` | `prot-ac` | protein acetylation |
| `UBIQ` | `prot-ub` | protein ubiquitylation |
| `METAB` | `metab` | metabolomics, 13 platforms |
| `ATAC` | `epigen-atac-seq` | chromatin accessibility |
| `METHYL` | `epigen-rrbs` | DNA methylation, RRBS |
| `IMMUNO` | `immunoassay` | targeted multiplexed immunoassay |

Twenty tissues: `ADRNL BAT BLOOD COLON CORTEX HEART HIPPOC HYPOTH KIDNEY LIVER LUNG
OVARY PLASMA SKMGN SKMVL SMLINT SPLEEN TESTES VENACV WATSC`. `SKMGN` is gastrocnemius,
`SKMVL` vastus lateralis, `WATSC` subcutaneous white adipose, `BAT` brown adipose.

Three naming traps, all confirmed against the objects themselves:

- **`TISSUE_ABBREV` is hyphenated and object names are not.** The vector holds `SKM-GN`,
  `SKM-VL`, `WAT-SC`; the files are `TRNSCRPT_SKMGN_DA.rda`. Strip the hyphen when you
  build a filename, and keep it when you filter a `tissue` column.
- **`VENACV` maps to the tissue code `t65-aorta`.** The label was renamed from aorta to
  vena cava; the code was not. Bucket URLs still need `t65-aorta`.
- **`TISSUE_ABBREV_TO_CODE` and `ASSAY_ABBREV_TO_CODE` are named character vectors, and
  pyreadr drops the names** — you get the values in order with no keys. Order matches
  `TISSUE_ABBREV` / `ASSAY_ABBREV` exactly (checked in R), so zip them positionally, or
  read the mapping in R where the names survive.

Object kinds you will meet: `_DA` (differential analysis), `_NORM_DATA` (normalised
matrix), `_RAW_COUNTS`, `_NORM_DATA_05FDR`, `_DA_METAREG` (metabolomics meta-regression),
`_META` (assay-level sample metadata), plus cross-cutting objects such as `PHENO`,
`OUTLIERS`, `TRAINING_REGULATED_FEATURES`, `RAT_TO_HUMAN_GENE` and `FEATURE_TO_GENE`.

## Coverage is ragged — build the grid before you plan

Nine assays times twenty tissues is 180 cells, and most are empty. Proteomics ran on
seven tissues; acetylation and ubiquitylation on heart and liver only. Derive it rather
than assuming — the unauthenticated GitHub contents API lists the package's `data/`
directory in one request:

```python
import json, re, urllib.request
from collections import defaultdict

TAG = "v2.1.0"
REPO = "MoTrPAC/MotrpacRatTraining6moData"
entries = json.loads(urllib.request.urlopen(
    f"https://api.github.com/repos/{REPO}/contents/data?ref={TAG}", timeout=60).read())

objects = sorted(e["name"][:-4] for e in entries if e["name"].endswith(".rda"))
print(f"{len(objects)} data objects at {TAG}")

ASSAYS = ["ACETYL", "ATAC", "IMMUNO", "METAB", "METHYL", "PHOSPHO", "PROT", "TRNSCRPT", "UBIQ"]
TISSUES = ["ADRNL", "BAT", "BLOOD", "COLON", "CORTEX", "HEART", "HIPPOC", "HYPOTH",
           "KIDNEY", "LIVER", "LUNG", "OVARY", "PLASMA", "SKMGN", "SKMVL", "SMLINT",
           "SPLEEN", "TESTES", "VENACV", "WATSC"]

grid = defaultdict(set)
for o in objects:
    m = re.match(rf"({'|'.join(ASSAYS)})_({'|'.join(TISSUES)})_(.+)$", o)
    if m:
        grid[(m.group(1), m.group(2))].add(m.group(3))

kinds = sorted({k for v in grid.values() for k in v})
print("per-tissue object kinds:", kinds)
print()
print("assay      " + "".join(f"{t[:6]:>7}" for t in TISSUES))
for a in ASSAYS:
    row = f"{a:<11}"
    for t in TISSUES:
        ks = grid.get((a, t), set())
        row += f"{('DA' if any(k.startswith('DA') for k in ks) else ('N' if ks else '.')):>7}"
    print(row)
print("\nDA = differential analysis present · N = matrix only · . = assay not run there")
```

Run 2026-08-17 at tag `v2.1.0`:

```
206 data objects at v2.1.0
per-tissue object kinds: ['DA', 'DA_METAREG', 'NORM_DATA', 'NORM_DATA_05FDR', 'RAW_COUNTS']

assay        ADRNL    BAT  BLOOD  COLON CORTEX  HEART HIPPOC HYPOTH KIDNEY  LIVER   LUNG  OVARY PLASMA  SKMGN  SKMVL SMLINT SPLEEN TESTES VENACV  WATSC
ACETYL           .      .      .      .      .     DA      .      .      .     DA      .      .      .      .      .      .      .      .      .      .
ATAC             .      N      .      .      .      N      N      .      N      N      N      .      .      N      .      .      .      .      .      N
IMMUNO          DA     DA      .     DA     DA     DA     DA      .     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA      .     DA
METAB           DA     DA      .     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA
METHYL           .      N      .      .      .      N      N      .      N      N      N      .      .      N      .      .      .      .      .      N
PHOSPHO          .      .      .      .     DA     DA      .      .     DA     DA     DA      .      .     DA      .      .      .      .      .     DA
PROT             .      .      .      .     DA     DA      .      .     DA     DA     DA      .      .     DA      .      .      .      .      .     DA
TRNSCRPT        DA     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA     DA      .     DA     DA     DA     DA     DA     DA     DA
UBIQ             .      .      .      .      .     DA      .      .      .     DA      .      .      .      .      .      .      .      .      .      .

DA = differential analysis present · N = matrix only · . = assay not run there
```

Metabolomics is the only assay on all twenty tissues; transcriptomics covers nineteen
(no plasma). The `N` row for `ATAC` and `METHYL` is not "matrix only" by accident — see
*Epigenomics in the package is an excerpt*.

Use the **contents** API, not the recursive **tree** API, for this repository. The tree
endpoint answered twice and then returned HTTP 504 repeatedly on 2026-08-17 — the
repository is large enough to trip it. The contents endpoint returned all 206 entries in
0.8 s and pages at 1,000 entries, so one request covers this directory.

## Get the files

The artifacts are R `.rda` objects, but you do not need R and you do not need to install
the package. Each object is an individual file in the repository, so fetch the ones you
want **at a pinned tag** and convert them where they land. `pyreadr` (`pip install
pyreadr`) reads `.rda` into pandas without an R installation.

Pin the tag, not `main`. The latest release is **`v2.1.0`** (2025-08-13) and the
`DESCRIPTION` file in it still says `Version: 2.0.0`, so the package's own version string
is not a usable identifier — cite the git tag or the Zenodo DOI instead.

```python
import hashlib, json, os, urllib.request
import pandas as pd, pyreadr

TAG  = "v2.1.0"                      # pin it — main moves and carries no version bump
BASE = f"https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/{TAG}/data"
OUT  = "Data/motrpac"
os.makedirs(OUT, exist_ok=True)

# one organ pair, three omes each, the animal-level phenotype table, and two objects
# that are not data frames — kept in the list deliberately, to exercise both failure modes
WANT = ["TRNSCRPT_HEART_DA", "PROT_HEART_DA", "METAB_HEART_DA",
        "TRNSCRPT_SKMGN_DA", "PROT_SKMGN_DA", "METAB_SKMGN_DA",
        "PHENO", "METAB_NORM_DATA_NESTED", "GRAPH_PW_ENRICH"]

manifest, needs_r = [], []
for name in WANT:
    rda = os.path.join(OUT, name + ".rda")
    if not os.path.exists(rda):
        urllib.request.urlretrieve(f"{BASE}/{name}.rda", rda)
    sha = hashlib.sha256(open(rda, "rb").read()).hexdigest()

    try:
        tables = pyreadr.read_r(rda)
    except pyreadr.custom_errors.LibrdataError as e:
        needs_r.append(name)          # some objects raise ...
        print(f"  {name:22} pyreadr raised — {e}")
        continue
    if not tables:                    # ... and others return an EMPTY dict, silently
        needs_r.append(name)
        print(f"  {name:22} not a data.frame — export it from R (see below)")
        continue

    for key, df in tables.items():
        csv = os.path.join(OUT, key + ".csv.gz")
        df.to_csv(csv, index=False, compression="gzip")
        manifest.append({"object": key, "url": f"{BASE}/{name}.rda", "tag": TAG,
                         "rda_sha256": sha, "rows": len(df), "cols": df.shape[1],
                         "csv": csv, "csv_bytes": os.path.getsize(csv)})
        print(f"  {key:26} {len(df):>9,} x {df.shape[1]:<3} -> {csv}")

with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump({"source": "MotrpacRatTraining6moData", "tag": TAG,
               "licence": "code MIT, data CC BY 4.0",
               "cohort": "PASS1B-06 — 6-month-old F344 rats",
               "files": manifest, "needs_r_export": needs_r}, fh, indent=2)

print(f"\n{len(manifest)} tables written; {sum(m['csv_bytes'] for m in manifest):,} bytes of CSV")
```

Run 2026-08-17 at `v2.1.0`:

```
  TRNSCRPT_HEART_DA            115,560 x 22  -> Data/motrpac/TRNSCRPT_HEART_DA.csv.gz
  PROT_HEART_DA                 73,472 x 18  -> Data/motrpac/PROT_HEART_DA.csv.gz
  METAB_HEART_DA                11,440 x 27  -> Data/motrpac/METAB_HEART_DA.csv.gz
  TRNSCRPT_SKMGN_DA            110,192 x 22  -> Data/motrpac/TRNSCRPT_SKMGN_DA.csv.gz
  PROT_SKMGN_DA                 47,992 x 18  -> Data/motrpac/PROT_SKMGN_DA.csv.gz
  METAB_SKMGN_DA                 9,880 x 27  -> Data/motrpac/METAB_SKMGN_DA.csv.gz
  PHENO                          6,156 x 509 -> Data/motrpac/PHENO.csv.gz
  METAB_NORM_DATA_NESTED not a data.frame — export it from R (see below)
  GRAPH_PW_ENRICH        pyreadr raised — Invalid file, or file has unsupported features

7 tables written; 26,874,057 bytes of CSV
```

Write the manifest. The `.rda` checksum plus the tag is what lets a later rebuild be
compared against this one, and the objects do change between releases — CSVs with no
provenance stamp are not reproducible. Swap `to_csv` for `df.to_parquet(...)` if pyarrow
is installed and you would rather keep dtypes.

**Both guards are load-bearing, and they catch different things.** For an object that is
not a data frame, pyreadr either returns an **empty dict** with no exception and no
warning, or raises `LibrdataError`. The first is the dangerous one:
`list(tables.values())[0]` becomes an `IndexError` far from the cause, and a bare loop
over `.items()` silently writes nothing and reports success. The last two entries in
`WANT` are there to make sure both branches are exercised rather than assumed.

## A route with no R and no pyreadr at all

The same differential analyses are on a public Google Cloud Storage bucket as
tab-separated text, which is the shortest path if you only want the training-effect
results. The grammar, with three exceptions:

```
https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da/
    {ASSAY}/pass1b-06_{tissue_code}_{assay_code}_training-dea-fdr.txt
```

- **`METAB`** sits one level deeper, and the two sub-paths are different analyses.
  `METAB/meta-regression/…_metab-meta-reg_…` collapses a metabolite measured on several
  platforms into one row — 1,234 rows for heart. `METAB/redundant/…_metab_…` keeps one row
  per feature **per platform**, with `dataset`, `is_targeted` and `site` columns — 1,430
  rows for heart, so a metabolite can appear more than once and a naive count of
  significant hits double-counts. The plain `METAB/…_metab_…` path does not exist and
  returns 404.
- **`UBIQ`** uses `prot-ub-protein-corrected`, not the `prot-ub` from the code table.
- **`IMMUNO`** is one pooled file for every tissue, with no tissue in the filename;
  filter it on `tissue_abbreviation`.

```python
import io, os, urllib.error, urllib.request, gzip
import pandas as pd

DA   = "https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da"
OUT  = "Data/motrpac/tsv"
os.makedirs(OUT, exist_ok=True)

TISSUE = {"HEART": "t58-heart", "SKM-GN": "t55-gastrocnemius", "LIVER": "t68-liver",
          "WAT-SC": "t70-white-adipose", "VENACV": "t65-aorta"}   # note: VENACV -> t65-aorta
ASSAY  = {"ACETYL": "prot-ac", "ATAC": "epigen-atac-seq", "IMMUNO": "immunoassay",
          "METAB": "metab", "METHYL": "epigen-rrbs", "PHOSPHO": "prot-ph",
          "PROT": "prot-pr", "TRNSCRPT": "transcript-rna-seq", "UBIQ": "prot-ub"}

def da_url(assay, tissue, metareg=True):
    code = ASSAY[assay]
    if assay == "IMMUNO":                       # one pooled file, all tissues
        return f"{DA}/IMMUNO/pass1b-06_immunoassay_training-dea-fdr.txt"
    if assay == "METAB":
        sub, code = ("meta-regression", "metab-meta-reg") if metareg else ("redundant", "metab")
        return f"{DA}/METAB/{sub}/pass1b-06_{TISSUE[tissue]}_{code}_training-dea-fdr.txt"
    if assay == "UBIQ":
        code = "prot-ub-protein-corrected"
    return f"{DA}/{assay}/pass1b-06_{TISSUE[tissue]}_{code}_training-dea-fdr.txt"

want = [("PROT", "HEART"), ("TRNSCRPT", "HEART"), ("PHOSPHO", "HEART"),
        ("ACETYL", "HEART"), ("UBIQ", "HEART"), ("METAB", "HEART"),
        ("PROT", "SKM-GN"), ("TRNSCRPT", "LIVER"), ("PROT", "WAT-SC"),
        ("IMMUNO", "HEART")]

for assay, tissue in want:
    url = da_url(assay, tissue)
    try:
        raw = urllib.request.urlopen(url, timeout=120).read()
    except urllib.error.HTTPError as e:
        print(f"  {assay:9} {tissue:7} HTTP {e.code}  {url.rsplit('/', 1)[1]}")
        continue
    df = pd.read_csv(io.BytesIO(raw), sep="\t")
    if assay == "IMMUNO":
        df = df[df["tissue_abbreviation"] == tissue]
    dest = os.path.join(OUT, f"{assay}_{tissue.replace('-', '')}_training-dea-fdr.tsv.gz")
    with gzip.open(dest, "wt") as fh:
        df.to_csv(fh, sep="\t", index=False)
    print(f"  {assay:9} {tissue:7} {len(df):>8,} rows x {df.shape[1]:<3} -> {os.path.basename(dest)}")
```

Run 2026-08-17:

```
  PROT      HEART      9,184 rows x 12  -> PROT_HEART_training-dea-fdr.tsv.gz
  TRNSCRPT  HEART     14,445 rows x 18  -> TRNSCRPT_HEART_training-dea-fdr.tsv.gz
  PHOSPHO   HEART     40,208 rows x 12  -> PHOSPHO_HEART_training-dea-fdr.tsv.gz
  ACETYL    HEART      5,213 rows x 12  -> ACETYL_HEART_training-dea-fdr.tsv.gz
  UBIQ      HEART      7,078 rows x 12  -> UBIQ_HEART_training-dea-fdr.tsv.gz
  METAB     HEART      1,234 rows x 26  -> METAB_HEART_training-dea-fdr.tsv.gz
  PROT      SKM-GN     5,999 rows x 12  -> PROT_SKMGN_training-dea-fdr.tsv.gz
  TRNSCRPT  LIVER     14,437 rows x 18  -> TRNSCRPT_LIVER_training-dea-fdr.tsv.gz
  PROT      WAT-SC     9,964 rows x 12  -> PROT_WATSC_training-dea-fdr.tsv.gz
  IMMUNO    HEART         39 rows x 18  -> IMMUNO_HEART_training-dea-fdr.tsv.gz
```

This route is plain text and needs nothing but a HTTP client — but it is **unversioned**.
There is no tag, no checksum and no release note on the bucket. Use the package route
when reproducibility matters and this one when you want a quick answer or a file too
large to have been shipped inside the package.

## Two tables, two different questions

The most consequential thing to get right. For the same tissue and assay you have two
tables and they answer different questions:

| | rows | what it tests |
|---|---|---|
| `PROT_HEART_DA.rda` | 73,472 | timewise contrasts — each trained timepoint against the sedentary control, **separately per sex** |
| `…_training-dea-fdr.txt` | 9,184 | one row per feature — an F-test of the whole training model `~1+group` against `~1`, with per-sex F statistics and a combined p and FDR |

9,184 features × 2 sexes × 4 timepoints = 73,472 exactly, and the `feature_ID` sets are
identical. The link between them is `selection_fdr` in the `_DA` table, which equals
`adj_p_value` in the text table to within 1.1e-16 (measured, all 9,184 features).

Which means: **`adj_p_value` inside a `_DA` row is not the training-effect FDR.** It is
the adjusted p for that one sex-by-timepoint contrast. Selecting training-regulated
features on it, rather than on `selection_fdr`, is a different and much weaker analysis
than the one the consortium published.

`TRAINING_REGULATED_FEATURES` is the consortium's selection at **5% FDR**, expanded back
to eight rows per feature. For heart proteomics that is 693 features and 5,544 rows,
which is exactly the count of `adj_p_value < 0.05` in the text table — verified, and
asserted in `## Try it`.

## Epigenomics in the package is an excerpt

`ATAC` and `METHYL` ship only `_NORM_DATA_05FDR` objects, and the suffix is doing more
work than it looks. `ATAC_HEART_NORM_DATA_05FDR` has **75 rows**. The full heart ATAC
differential analysis, which lives only on the bucket, has 5,826,608 rows — **728,326
regions** × 2 sexes × 4 timepoints — of which exactly 75 pass 5% FDR. Both numbers
measured 2026-08-17, and they agree, which is what confirms the suffix means "the
training-regulated selection" and not "a convenience subset".

So any epigenome-wide question — your own multiple-testing correction, a background set,
an enrichment against all accessible regions — needs the bucket. Objects are readable
anonymously; the bucket is **not listable**, so a wrong name gives 404 rather than an
empty result, and the naming convention is the only index you get:

```python
import urllib.error, urllib.request

EXT = "https://storage.googleapis.com/motrpac-rat-training-6mo-extdata"

probes = [("epigen-rda",    "ATAC_HEART_DA"),
          ("epigen-rda",    "ATAC_HEART_NORM_DATA"),
          ("epigen-rda",    "METHYL_HEART_DA"),
          ("epigen-rda",    "METHYL_SKMGN_DA"),
          ("epigen-rda",    "ATAC_ADRNL_DA"),          # ATAC was never run on adrenal
          ("feature-annot", "ATAC_FEATURE_ANNOT"),
          ("feature-annot", "METHYL_FEATURE_ANNOT"),
          ("feature-annot", "PROT_FEATURE_ANNOT")]     # documented as .rda; only .txt exists

for folder, obj in probes:
    url = f"{EXT}/{folder}/{obj}.rda"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=45) as r:
            print(f"  {obj:24} {int(r.headers['Content-Length']):>13,} bytes")
    except urllib.error.HTTPError as e:
        print(f"  {obj:24} HTTP {e.code:<9} {folder}/{obj}.rda does not exist")

try:
    urllib.request.urlopen(f"https://storage.googleapis.com/storage/v1/b/"
                           f"motrpac-rat-training-6mo-extdata/o", timeout=45)
    print("\nbucket listing: allowed")
except urllib.error.HTTPError as e:
    print(f"\nbucket listing: HTTP {e.code} — anonymous callers cannot enumerate the bucket, "
          "so the naming convention above is the only index")
```

Run 2026-08-17:

```
  ATAC_HEART_DA              250,595,765 bytes
  ATAC_HEART_NORM_DATA        32,863,319 bytes
  METHYL_HEART_DA            256,313,831 bytes
  METHYL_SKMGN_DA            291,527,234 bytes
  ATAC_ADRNL_DA            HTTP 404       epigen-rda/ATAC_ADRNL_DA.rda does not exist
  ATAC_FEATURE_ANNOT          29,078,861 bytes
  METHYL_FEATURE_ANNOT       160,193,038 bytes
  PROT_FEATURE_ANNOT       HTTP 404       feature-annot/PROT_FEATURE_ANNOT.rda does not exist

bucket listing: HTTP 401 — anonymous callers cannot enumerate the bucket, so the naming convention above is the only index
```

Two findings in that output worth carrying:

- A 404 means the assay was never run on that tissue, and there is no way to tell the two
  apart without the coverage grid — `ATAC_ADRNL_DA` is absent because ATAC was not done on
  adrenal, exactly as the grid shows. Build the grid first; probing names blindly cannot
  distinguish "not measured" from "wrong filename". Objects that do exist are a quarter of
  a gigabyte each and use the **unhyphenated** tissue token. pyreadr reads them — the
  5,826,608-row `ATAC_HEART_DA` was parsed for the numbers above — but it holds the whole
  frame in memory, so pull the equivalent `training-dea-fdr.txt` and stream it if that is a
  problem.
- **Some `.rda` feature-annotation URLs printed in the package's own documentation are
  dead, and the extension is split by assay.** All seven were probed both ways on
  2026-08-17: `ATAC` and `METHYL` exist **only as `.rda`** (29 MB and 160 MB); `PROT`,
  `PHOSPHO`, `UBIQ`, `ACETYL` and `TRNSCRPT` exist **only as `.txt`** (158 MB, 108 MB,
  3.9 MB, 3.2 MB, 3.1 MB) and 404 as `.rda` — which is the extension the package
  documentation prints for them. Change the extension before concluding a file is gone.

## Objects pyreadr cannot read

Most of the 206 objects are data frames or character vectors and convert cleanly. These do
not, checked one by one on 2026-08-17 with pyreadr 0.5.3:

| object | how it fails |
|---|---|
| `METAB_NORM_DATA_NESTED` | empty dict |
| `IMMUNO_NORM_DATA_NESTED` | empty dict |
| `GRAPH_COMPONENTS` | empty dict |
| `REPFDR_INPUTS`, `REPFDR_RES` | empty dict |
| `GENE_UNIVERSES` | empty dict |
| `PATHWAY_PARENTS` | empty dict |
| `GRAPH_PW_ENRICH` | raises `LibrdataError` |

`METAB_NORM_DATA_NESTED` is 13 metabolomics platforms, each a list of tissues, each a data
frame — a shape a pandas dict cannot express. Flat equivalents exist for two of them
(`METAB_NORM_DATA_FLAT`, `IMMUNO_NORM_DATA_FLAT`); reach for those first. Note that
`GRAPH_STATES` **does** read fine (34,244 × 10), so do not assume everything with `GRAPH`
in the name needs R. When there is no flat version, export once from R and work in
whatever you like afterwards:

```r
tag  <- "v2.1.0"
base <- sprintf("https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/%s/data", tag)
out  <- "Data/motrpac/nested"
dir.create(out, recursive = TRUE, showWarnings = FALSE)

name <- "METAB_NORM_DATA_NESTED"
rda  <- file.path(out, paste0(name, ".rda"))
if (!file.exists(rda)) download.file(file.path(base, paste0(name, ".rda")), rda,
                                     mode = "wb", quiet = TRUE)

env <- new.env()
obj <- get(load(rda, envir = env)[1], envir = env)

n <- 0
for (platform in names(obj)) {
  for (tissue in names(obj[[platform]])) {
    df <- obj[[platform]][[tissue]]
    f  <- file.path(out, sprintf("%s__%s__%s.csv", name, platform, gsub("-", "", tissue)))
    write.csv(cbind(feature = rownames(df), df), f, row.names = FALSE)
    n <- n + 1
  }
}
cat(sprintf("%d platforms, %d tables written to %s\n", length(obj), n, out))
cat("platforms:", paste(names(obj), collapse = ", "), "\n")
```

Run 2026-08-17 under R 4.4.1:

```
13 platforms, 113 tables written to Data/motrpac/nested
platforms: metab-t-amines, metab-t-acoa, metab-t-nuc, metab-t-oxylipneg, metab-t-ka, metab-t-etamidpos, metab-t-tca, metab-u-lrppos, metab-u-lrpneg, metab-u-hilicpos, metab-u-rppos, metab-u-rpneg, metab-u-ionpneg
```

`metab-t-*` are targeted platforms and `metab-u-*` untargeted; the same metabolite can
appear on several, which is what the meta-regression objects exist to reconcile. Note
that `load()` returns the object *name*, not the object — assigning `x <- load(f)` gives
you a string, which is a routine way to lose an hour.

## Joining a matrix to the animals

Per-tissue `_NORM_DATA` objects are wide: the four identifier columns `feature`,
`feature_ID`, `tissue`, `assay`, then **one column per sample**, headed by `viallabel`.
That is the key into `PHENO`, and it is what makes cross-assay and cross-tissue
integration possible at all — the same animal's `pid` appears under a different vial label
in every assay. The two flat tables, `METAB_NORM_DATA_FLAT` and `IMMUNO_NORM_DATA_FLAT`,
add a fifth identifier column `dataset`, so add it to `id_vars` before melting them or the
platform label becomes a sample.

```python
import os, urllib.request
import pandas as pd, pyreadr

TAG  = "v2.1.0"
BASE = f"https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/{TAG}/data"
OUT  = "Data/motrpac"
os.makedirs(OUT, exist_ok=True)

def fetch(name):
    p = os.path.join(OUT, name + ".rda")
    if not os.path.exists(p):
        urllib.request.urlretrieve(f"{BASE}/{name}.rda", p)
    return list(pyreadr.read_r(p).values())[0]

mat   = fetch("TRNSCRPT_HEART_NORM_DATA")
pheno = fetch("PHENO")

ID = ["feature", "feature_ID", "tissue", "assay"]
long = mat.melt(id_vars=ID, var_name="viallabel", value_name="value")

keep = ["viallabel", "pid", "sex", "key.anirandgroup", "key.agegroup",
        "key.intervention", "key.sacrificetime"]
ann = long.merge(pheno[keep].astype({"viallabel": str}), on="viallabel", how="left")

print("matrix         :", mat.shape, "->", len(mat.columns) - len(ID), "sample columns")
print("long rows      :", f"{len(ann):,}")
print("unmatched      :", int(ann['pid'].isna().sum()))
print("age groups     :", sorted(ann['key.agegroup'].dropna().unique()))
print("design cells   :")
print(ann.drop_duplicates('viallabel')
         .groupby(['key.anirandgroup', 'sex']).size().unstack(fill_value=0))

dest = os.path.join(OUT, "TRNSCRPT_HEART_long.csv.gz")
ann.to_csv(dest, index=False, compression="gzip")
print("\nwrote", dest, f"{os.path.getsize(dest):,} bytes")
```

Run 2026-08-17:

```
matrix         : (14445, 54) -> 50 sample columns
long rows      : 722,250
unmatched      : 0
age groups     : ['6 months']
design cells   :
sex                                female  male
key.anirandgroup
Eight-week program Control Group        5     5
Eight-week program Training Group       5     5
Four-week program                       5     5
One-week program                        5     5
Two-week program                        5     5

wrote Data/motrpac/TRNSCRPT_HEART_long.csv.gz 5,473,930 bytes
```

Five animals per sex per group in heart transcriptomics. **This is a small design**, and
the number that matters for power is that cell size, not the 14,445 features. Sample
counts differ by assay on the same tissue — `PROT_HEART_NORM_DATA` is 9,184 × 64, so 60
sample columns against transcriptomics' 50 — so count them per object rather than carrying
one number across a manuscript.

**Check `OUTLIERS` yourself; the matrices are not consistently cleaned.** It lists 79
sample-level exclusions with reasons, across all eight assays that have any. Verified
2026-08-17: the flagged liver transcriptomics sample (reason `PC2`) is **still a column**
in `TRNSCRPT_LIVER_NORM_DATA`, while the flagged liver proteomics sample — a suspected
sex mismatch or sample swap — is **not** in `PROT_LIVER_NORM_DATA`. Drop them explicitly
if you re-derive anything, and prefer
`TRAINING_REGULATED_NORM_DATA_NO_OUTLIERS` over `TRAINING_REGULATED_NORM_DATA` when you
want the cleaned version of that object.

## Installing the R packages, and why it usually fails

If you are working in R and want the packages rather than individual objects, know that
`remotes::install_github("MoTrPAC/MotrpacRatTraining6moData")` frequently does not work.
The repository is roughly 400 MB and GitHub's tarball endpoint times out generating the
archive: `https://api.github.com/repos/MoTrPAC/MotrpacRatTraining6moData/tarball/v2.1.0`
returned **HTTP 504** on both attempts made 2026-08-17. The package's own README carries
a troubleshooting section for the same failure. The codeload archive is a different
endpoint and does answer 200:

```r
options(timeout = 3600)
dir.create("motrpac_pkg", showWarnings = FALSE)
tarball <- "motrpac_pkg/MotrpacRatTraining6moData-v2.1.0.tar.gz"
download.file(
  "https://codeload.github.com/MoTrPAC/MotrpacRatTraining6moData/tar.gz/refs/tags/v2.1.0",
  tarball, mode = "wb")
install.packages(tarball, repos = NULL, type = "source")
library(MotrpacRatTraining6moData)
data(PHENO); dim(PHENO)
```

**This is the one block in this skill not executed to completion.** The codeload URL was
confirmed to answer HTTP 200 and had transferred 215 MB after 420 seconds without
finishing, so the download works and is simply slow; `install.packages()` on the result
was not reached. Everything else here was run verbatim. The citable alternative is the
Zenodo snapshot of the same tag, DOI `10.5281/zenodo.16851449`, a 399 MB zip.

Either way, prefer the per-object route above unless you specifically want the analysis
package's functions — pulling 400 MB to read one 460 kB table is a poor trade, and it is
the reason this skill is built the way it is.

## Limits worth stating in a write-up

- **Rat, not human.** MoTrPAC has a human arm; none of it is in these packages. Map with
  `RAT_TO_HUMAN_GENE` — 21,461 rows joining rat symbol, RGD, NCBI, Ensembl and UniProt
  identifiers to a human ortholog symbol — and say in the text that you did, because
  one-to-many and absent orthologs are silent otherwise.
- **The annotation is old.** Transcript features are built against Ensembl release 95 on
  **Rnor_6.0**, superseded by mRatBN7.2. Coordinates from `ATAC` and `METHYL` features,
  which are genomic intervals, are on that build and must be lifted before they meet
  anything modern.
- **Sex is a factor, not a nuisance.** Every differential analysis is per-sex by design,
  and the published headline was how much of the response differs between sexes. Pooling
  the sexes discards the finding.
- **Timepoints are training duration, not time of day.** `comparison_group` counts weeks
  of training. Circadian information is separate, in `PHENO` columns including
  `key.sacrificetime`.
- **`IMMUNO` is a targeted panel**, tens of analytes, not a discovery assay. Absence of a
  protein there means it was not on the panel.
- **One intervention.** Progressive treadmill endurance training. Nothing here speaks to
  resistance training, and the acute-exercise arm is not in this release.

## Try it

A self-contained check on the two open routes and on the claim that decides whether this
resource fits an aging question. Public data, no account, no key.

**Data** — four objects from `MotrpacRatTraining6moData` at tag `v2.1.0` (code MIT, data
CC BY 4.0), plus one plain-text table from the public bucket:

    https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/PHENO.rda
    https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/PROT_HEART_DA.rda
    https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/TRAINING_REGULATED_FEATURES.rda
    https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da/PROT/pass1b-06_t58-heart_prot-pr_training-dea-fdr.txt

About 13 MB in total, no licence acceptance and no account. Heart proteomics is used
because it is one of the few assays present in both routes at a size that downloads
quickly. Last confirmed reachable 2026-08-17. Needs `pip install pyreadr pandas`.

```python
import io, os, urllib.request
import numpy as np, pandas as pd, pyreadr

TAG  = "v2.1.0"
PKG  = f"https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/{TAG}/data"
BUCK = "https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da"
os.makedirs("motrpac_check", exist_ok=True)

def rda(name):
    p = os.path.join("motrpac_check", name + ".rda")
    if not os.path.exists(p):
        urllib.request.urlretrieve(f"{PKG}/{name}.rda", p)
    tables = pyreadr.read_r(p)
    assert tables, f"{name} is not a data.frame — pyreadr returns {{}}, not an error"
    return list(tables.values())[0]

pheno = rda("PHENO")
da    = rda("PROT_HEART_DA")
trf   = rda("TRAINING_REGULATED_FEATURES")

tsv = pd.read_csv(io.BytesIO(urllib.request.urlopen(
    f"{BUCK}/PROT/pass1b-06_t58-heart_prot-pr_training-dea-fdr.txt", timeout=120).read()),
    sep="\t")

# 1. what cohort is this? the answer is in PHENO, not in the file names
ages      = sorted(pheno["key.agegroup"].unique())
protocols = sorted(pheno["key.protocol"].unique())
print("PHENO rows / age groups / protocols :", len(pheno), ages, protocols)

# 2. the DA table is sex x timepoint contrasts, not one row per feature
nfeat, nsex, ntime = (da["feature_ID"].nunique(), da["sex"].nunique(),
                      da["comparison_group"].nunique())
print("PROT_HEART_DA rows                  :", len(da),
      f"= {nfeat} features x {nsex} sexes x {ntime} timepoints")
print("timepoints / sexes                  :",
      sorted(da["comparison_group"].unique()), sorted(da["sex"].unique()))
assert len(da) == nfeat * nsex * ntime

# 3. the two open routes agree: selection_fdr is the bucket's training-effect FDR
m = da[["feature_ID", "selection_fdr"]].drop_duplicates().merge(
        tsv[["feature_ID", "adj_p_value"]], on="feature_ID")
delta = float(np.nanmax(np.abs(m["selection_fdr"] - m["adj_p_value"])))
print("features matched to bucket TSV      :", len(m), f"| max |Δ FDR| = {delta:.1e}")
assert len(m) == nfeat and delta < 1e-12

# 4. TRAINING_REGULATED_FEATURES is the 5% FDR selection, expanded to 8 rows/feature
sel  = trf[(trf["assay"] == "PROT") & (trf["tissue"] == "HEART")]
hits = int((tsv["adj_p_value"] < 0.05).sum())
print("training-regulated PROT/HEART       :", sel["feature_ID"].nunique(),
      f"features, {len(sel)} rows | FDR<0.05 in TSV = {hits}")
assert sel["feature_ID"].nunique() == hits
assert len(sel) == hits * nsex * ntime

print("\nage groups in the open omics release:", ages)
```

What it printed on 2026-08-17:

```
PHENO rows / age groups / protocols : 6156 ['6 months'] ['phase 1b']
PROT_HEART_DA rows                  : 73472 = 9184 features x 2 sexes x 4 timepoints
timepoints / sexes                  : ['1w', '2w', '4w', '8w'] ['female', 'male']
features matched to bucket TSV      : 9184 | max |Δ FDR| = 1.1e-16
training-regulated PROT/HEART       : 693 features, 5544 rows | FDR<0.05 in TSV = 693

age groups in the open omics release: ['6 months']
```

**Expect**

Invariants — these hold regardless of release, and a failure means this skill is wrong,
not that upstream moved:

- `PHENO` has exactly **one** age group. Any second value means an aged arm has been
  released into the omics package and every "young adult only" statement above needs
  revisiting — which is a good outcome, not a bug, but it must be noticed.
- A `_DA` table has `n_features × n_sexes × n_timepoints` rows. Treating it as one row per
  feature is the most common way to misread these objects.
- `selection_fdr` in the `_DA` table equals `adj_p_value` in the bucket's
  `training-dea-fdr.txt` for every feature. This is what proves the two open routes are
  the same analysis and that `selection_fdr`, not `adj_p_value`, is the training-effect
  FDR.
- `TRAINING_REGULATED_FEATURES` for a tissue and assay contains exactly the features at
  `adj_p_value < 0.05`, at eight rows each. That is the operational definition of
  "training-regulated" in this resource.
- pyreadr returns a truthy dict for every object here. The assertion inside `rda()` is
  what stops an empty dict from becoming a confusing `IndexError` later.

Observed 2026-08-17 against tag **v2.1.0** — these move when the consortium re-releases,
so a mismatch is drift to investigate rather than a failure:

- `PHENO` 6,156 rows · age groups `['6 months']` · protocols `['phase 1b']`
- `PROT_HEART_DA` 73,472 rows = 9,184 features × 2 sexes × 4 timepoints
  (`1w 2w 4w 8w`, `female male`)
- 9,184 features matched to the bucket table, max |Δ FDR| 1.1e-16
- training-regulated heart proteins 693 features / 5,544 rows, matching 693 at FDR < 0.05

## Sources

- MoTrPAC — https://www.motrpac.org/
- Data Hub (portal, browsable by hand) — https://motrpac-data.org/
- Data package — https://github.com/MoTrPAC/MotrpacRatTraining6moData
- Analysis package — https://github.com/MoTrPAC/MotrpacRatTraining6mo
- Physiology package, includes the 18-month arm, GPL-3 —
  https://github.com/MoTrPAC/MotrpacRatTrainingPhysiologyData
- White adipose companion package, MIT —
  https://github.com/MoTrPAC/MotrpacRatTraining6moWATData
- Zenodo snapshots of the data package — https://doi.org/10.5281/zenodo.7877121
- GEO SuperSeries — https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE242358
- MoTrPAC Study Group (2024) *Nature* 629, 174-183 —
  https://doi.org/10.1038/s41586-023-06877-w
- Sanford et al. (2020) *Cell* 181, 1464-1474 —
  https://doi.org/10.1016/j.cell.2020.06.004
- Schenk et al. (2024) *Function* 5, zqae014 — adult and aged rat physiology —
  https://doi.org/10.1093/function/zqae014
- Amar et al. (2024) *Cell Metabolism* 36, 1411-1429 — mitochondrial response across
  tissues — https://doi.org/10.1016/j.cmet.2023.12.021
- Many et al. (2024) *Nature Metabolism* 6, 963-979 — white adipose companion —
  https://doi.org/10.1038/s42255-023-00959-9

Licences, precisely: the main data package states MIT for its code and CC BY 4.0 for its
data; the analysis and white adipose packages are MIT; the physiology package is GPL-3.
Acknowledge MoTrPAC as the source and name the dataset version you used — the consortium's
data use agreement asks for both, and nothing else makes the analysis reproducible.
