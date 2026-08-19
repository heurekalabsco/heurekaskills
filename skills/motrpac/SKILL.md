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
datasets: [https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/PHENO.rda, https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/PROT_HEART_DA.rda, https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/METAB_HEART_DA.rda, https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/METAB_NORM_DATA_FLAT.rda, https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/TRAINING_REGULATED_FEATURES.rda, https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da/PROT/pass1b-06_t58-heart_prot-pr_training-dea-fdr.txt, https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da/METAB/redundant/pass1b-06_t58-heart_metab_training-dea-fdr.txt, https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da/IMMUNO/pass1b-06_immunoassay_training-dea-fdr.txt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-18
  against: MotrpacRatTraining6moData git tag v2.1.0 (its DESCRIPTION still reads 2.0.0) / motrpac-rat-training-6mo-extdata bucket / GEO GSE242358 and its three subseries / Python 3.12.8 / pyreadr 0.5.3 / pandas 2.3.2 / numpy 2.3.3 / R 4.4.1. Techniques re-run across 16 assay-by-tissue combinations spanning all nine assays, both sexes, single-sex tissues, an incomplete design cell, an empty selection and four combinations that do not exist
  executed: 8
  unverified: 1
  unverified_reason: the whole-package R install block could not be run to completion — the roughly 400 MB archive is the obstacle, not the URL. GitHub's tarball endpoint answered HTTP 504 twice on 2026-08-17 and 200 on 2026-08-18, so the failure the block routes around is intermittent; the codeload archive it uses instead answered 200 on both days but had transferred only 215 MB after 420 s, and install.packages() on the result was never reached. Every other block, including all downloads and both conversion routes, was executed verbatim.
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
guess from the package name: `PHENO` carries the design columns, and on 2026-08-18 all
6,156 of its rows read `key.agegroup == "6 months"` and `key.protocol == "phase 1b"`.
The `## Try it` block at the end asserts exactly this, so the claim re-checks itself.

The consortium did run an **18-month aged arm**, and it is public — but only as
physiology. In `MotrpacRatTrainingPhysiologyData`, `VO2MAX$age` and `BODY_MASSES$age`
both take the values `6M` and `18M` (verified 2026-08-18): body composition, VO2max, run
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

**That grid is not filled in every tissue, and the holes are silent.** Ovary and testes
are one sex, so their tables carry four contrasts per feature, not eight. **Vena cava has
no female 1-week or 2-week samples at all**: `TRNSCRPT_VENACV_DA` is 16,338 features × 6
contrasts, and `METAB_VENACV_DA` has 1,278 rows, which is not divisible by eight. Brown
adipose metabolomics is ragged feature by feature — 47 features are missing female 1w and
47 are missing male 8w. All four measured at `v2.1.0`. Count the contrasts you have per
feature; do not compute them from the design.

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

Run 2026-08-18:

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

Run 2026-08-18 at tag `v2.1.0`:

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

**No assay covers all twenty tissues.** Metabolomics is the widest at nineteen — there is
no metabolomics on blood, which was profiled by RNA-seq instead, and the bucket returns
404 for `t30-blood-rna` metab. Transcriptomics is also nineteen (no plasma), the
immunoassay seventeen (no blood, hypothalamus or vena cava), proteomics and
phosphoproteomics seven, ATAC and RRBS eight, acetylation and ubiquitylation two. The `N`
row for `ATAC` and `METHYL` is not "matrix only" by accident — see *Epigenomics in the
package is an excerpt*.

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

Run 2026-08-18 at `v2.1.0`:

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

- **`METAB`** sits one level deeper, and the two sub-paths are different analyses **that
  pair with different package objects**. `METAB/meta-regression/…_metab-meta-reg_…`
  collapses a metabolite measured on several platforms into one row — 1,234 rows for
  heart — and is the file that matches `METAB_HEART_DA_METAREG`.
  `METAB/redundant/…_metab_…` keeps one row per feature **per platform**, with `dataset`,
  `is_targeted` and `site` columns — 1,430 rows for heart — and is the file that matches
  plain `METAB_HEART_DA`. Crossing the pair is the easy mistake: `METAB_HEART_DA` against
  the meta-regression file agrees on neither the row count nor the FDR. A metabolite can
  appear more than once in the redundant file, so a naive count of significant hits
  double-counts. The plain `METAB/…_metab_…` path does not exist and returns 404.
- **`UBIQ`** uses `prot-ub-protein-corrected`, not the `prot-ub` from the code table.
- **`IMMUNO`** is one pooled file for every tissue, with no tissue in the filename;
  filter it on `tissue_abbreviation`. **That request answers 200 for a tissue the
  immunoassay never ran on** — `VENACV`, `HYPOTH` and `BLOOD` are simply absent from the
  file, and the filter returns an empty frame that a loop will happily write to disk.
  Every other assay answers 404 for a combination that does not exist. Check the row
  count, not the status code.

The `TISSUE` map below is the whole of `TISSUE_ABBREV_TO_CODE`. Carrying a handful of
entries is a trap of its own — with the five obvious ones, three of the seven proteomics
tissues and fourteen of the nineteen metabolomics tissues raise `KeyError` rather than
fetching anything, and nothing about `VENACV` suggests `t65-aorta` or `OVARY` suggests
`t64-ovaries`.

```python
import io, os, urllib.error, urllib.request, gzip
import pandas as pd

DA   = "https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da"
OUT  = "Data/motrpac/tsv"
os.makedirs(OUT, exist_ok=True)

# TISSUE_ABBREV_TO_CODE in full — five entries is not enough, and there is no way to guess
# t65-aorta from VENACV or t64-ovaries from OVARY
TISSUE = {"ADRNL": "t60-adrenal",   "BAT": "t69-brown-adipose", "BLOOD": "t30-blood-rna",
          "COLON": "t61-colon",     "CORTEX": "t53-cortex",     "HEART": "t58-heart",
          "HIPPOC": "t52-hippocampus", "HYPOTH": "t54-hypothalamus", "KIDNEY": "t59-kidney",
          "LIVER": "t68-liver",     "LUNG": "t66-lung",         "OVARY": "t64-ovaries",
          "PLASMA": "t31-plasma",   "SKM-GN": "t55-gastrocnemius",
          "SKM-VL": "t56-vastus-lateralis", "SMLINT": "t67-small-intestine",
          "SPLEEN": "t62-spleen",   "TESTES": "t63-testes",     "VENACV": "t65-aorta",
          "WAT-SC": "t70-white-adipose"}
ASSAY  = {"ACETYL": "prot-ac", "ATAC": "epigen-atac-seq", "IMMUNO": "immunoassay",
          "METAB": "metab", "METHYL": "epigen-rrbs", "PHOSPHO": "prot-ph",
          "PROT": "prot-pr", "TRNSCRPT": "transcript-rna-seq", "UBIQ": "prot-ub"}

def da_url(assay, tissue, metareg=False):
    """Default is the REDUNDANT table, because that is what METAB_*_DA pairs with.
    Pass metareg=True only when joining METAB_*_DA_METAREG — the two differ by 196
    rows for heart, and crossing them drops 314 of 1,430 keys with FDR off by 0.27."""
    code = ASSAY[assay]
    if assay == "IMMUNO":                       # one pooled file, all tissues
        return f"{DA}/IMMUNO/pass1b-06_immunoassay_training-dea-fdr.txt"
    if assay == "METAB":
        # metareg pairs with METAB_*_DA_METAREG; redundant pairs with plain METAB_*_DA
        sub, code = ("meta-regression", "metab-meta-reg") if metareg else ("redundant", "metab")
        return f"{DA}/METAB/{sub}/pass1b-06_{TISSUE[tissue]}_{code}_training-dea-fdr.txt"
    if assay == "UBIQ":
        code = "prot-ub-protein-corrected"
    return f"{DA}/{assay}/pass1b-06_{TISSUE[tissue]}_{code}_training-dea-fdr.txt"

want = [("PROT", "HEART"), ("PROT", "CORTEX"), ("PHOSPHO", "KIDNEY"), ("ACETYL", "LIVER"),
        ("UBIQ", "LIVER"), ("TRNSCRPT", "OVARY"), ("TRNSCRPT", "VENACV"),
        ("METAB", "HEART"), ("METAB", "VENACV"),
        ("IMMUNO", "HEART"), ("IMMUNO", "VENACV"), ("PROT", "ADRNL")]

for assay, tissue in want:
    url = da_url(assay, tissue)
    try:
        raw = urllib.request.urlopen(url, timeout=180).read()
    except urllib.error.HTTPError as e:
        print(f"  {assay:9} {tissue:7} HTTP {e.code}  {url.rsplit('/', 1)[1]}")
        continue
    df = pd.read_csv(io.BytesIO(raw), sep="\t")
    if assay == "IMMUNO":
        # The pooled file hyphenates (SKM-GN), the coverage grid above does not (SKMGN).
        # Matching literally reported SKM-GN, SKM-VL and WAT-SC as never assayed when the
        # assay ran on all three, at 53, 39 and 53 rows.
        norm = lambda x: str(x).replace("-", "").upper()
        df = df[df["tissue_abbreviation"].map(norm) == norm(tissue)]
        if df.empty:                            # 200 + zero rows is the failure mode here
            print(f"  {assay:9} {tissue:7} HTTP 200 but 0 rows. IMMUNO ran on 14 of the 20 "
                  f"tissues; confirm against the coverage grid before concluding it did not "
                  f"run here")
            continue
    key = ["feature_ID", "panel"] if assay == "IMMUNO" else \
          ["feature_ID", "dataset"] if assay == "METAB" else ["feature_ID"]
    # METAB's two sub-paths collide on this filename, so record which one produced it.
    tag = "_metareg" if assay == "METAB" and "meta-regression" in url else ""
    dest = os.path.join(OUT, f"{assay}_{tissue.replace('-', '')}{tag}_training-dea-fdr.tsv.gz")
    with gzip.open(dest, "wt") as fh:
        df.to_csv(fh, sep="\t", index=False)
    print(f"  {assay:9} {tissue:7} {len(df):>8,} rows x {df.shape[1]:<3} "
          f"key {'+'.join(key):18} unique {df.drop_duplicates(key).shape[0]:>8,} -> {os.path.basename(dest)}")
```

Run 2026-08-18:

```
  PROT      HEART      9,184 rows x 12  key feature_ID         unique    9,184 -> PROT_HEART_training-dea-fdr.tsv.gz
  PROT      CORTEX    11,108 rows x 12  key feature_ID         unique   11,108 -> PROT_CORTEX_training-dea-fdr.tsv.gz
  PHOSPHO   KIDNEY    30,144 rows x 12  key feature_ID         unique   30,144 -> PHOSPHO_KIDNEY_training-dea-fdr.tsv.gz
  ACETYL    LIVER      9,750 rows x 12  key feature_ID         unique    9,750 -> ACETYL_LIVER_training-dea-fdr.tsv.gz
  UBIQ      LIVER      9,344 rows x 12  key feature_ID         unique    9,344 -> UBIQ_LIVER_training-dea-fdr.tsv.gz
  TRNSCRPT  OVARY     17,035 rows x 18  key feature_ID         unique   17,035 -> TRNSCRPT_OVARY_training-dea-fdr.tsv.gz
  TRNSCRPT  VENACV    16,338 rows x 18  key feature_ID         unique   16,338 -> TRNSCRPT_VENACV_training-dea-fdr.tsv.gz
  METAB     HEART      1,430 rows x 22  key feature_ID+dataset unique    1,430 -> METAB_HEART_training-dea-fdr.tsv.gz
  METAB     VENACV       213 rows x 26  key feature_ID+dataset unique      213 -> METAB_VENACV_training-dea-fdr.tsv.gz
  IMMUNO    HEART         39 rows x 18  key feature_ID+panel   unique       39 -> IMMUNO_HEART_training-dea-fdr.tsv.gz
  IMMUNO    VENACV  HTTP 200 but 0 rows. IMMUNO ran on 14 of the 20 tissues; confirm against the coverage grid before concluding it did not run here
  PROT      ADRNL   HTTP 404  pass1b-06_t60-adrenal_prot-pr_training-dea-fdr.txt
```

The last two lines are the two ways a combination can be absent, and they do not look
alike: a 404 carrying a GCS `NoSuchKey` body for every assay served as its own per-tissue
file, and a 200 carrying nothing for the immunoassay.

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

### `feature_ID` is the key for seven assays out of nine

The arithmetic above holds for `PROT`, `PHOSPHO`, `ACETYL`, `UBIQ` and `TRNSCRPT`, where a
feature is measured once, and for the two epigenomic tables on the bucket (heart ATAC:
728,326 regions × 2 sexes × 4 timepoints). **It does not hold for `METAB` or `IMMUNO`**,
where the same metabolite or analyte is measured on several platforms and the row key is
`feature_ID` **plus the platform column**. The bucket calls that column
`dataset` in the metabolomics files and `panel` in the immunoassay file; the package calls
it `dataset` in both.

Measured at `v2.1.0`, heart:

| table | rows | unique `feature_ID` | unique `feature_ID` + platform |
|---|---|---|---|
| `PROT_HEART_DA` | 73,472 | 9,184 | — |
| `METAB_HEART_DA` | 11,440 | 1,309 | **1,430** |
| `IMMUNO_HEART_DA` | 312 | 37 | **39** |

11,440 = 1,430 × 2 × 4 and 312 = 39 × 2 × 4; neither works from the `feature_ID` count.
And the join to the bucket does not merely lose rows, it **invents** them — merging
`METAB_HEART_DA` to `METAB/redundant/…` on `feature_ID` alone returns **1,724 rows out of
a 1,430-row table**, with the wrong FDR attached to the cross-platform ones (max |Δ| 0.88).
On `["feature_ID", "dataset"]` it returns 1,430, one-to-one, max |Δ| 9.9e-17. Verified the
same way on plasma, vena cava and hypothalamus metabolomics and on heart and plasma
immunoassay, and asserted in `## Try it`.

### `TRAINING_REGULATED_FEATURES` is per feature **and platform**, and not always eight rows

`TRAINING_REGULATED_FEATURES` is the consortium's selection at **5% FDR**, expanded back
to one row per sex per timepoint. Three things about it that a heart-proteomics example
hides — all measured across its 88 assay-by-tissue cells at `v2.1.0`:

- **The unit is `(feature_ID, platform)`**, with `platform` `NA` for the seven
  single-platform assays, a `metab-*` or panel name for the others, and `meta-reg` for a
  metabolite pooled across platforms. Heart metabolomics is 561 distinct `feature_ID` but
  **568** feature-platform pairs.
- **The row count per unit is `n_sexes × n_timepoints present`**, so 8 in most cells, **4**
  in ovary and testes, **6** in vena cava, and **both 6 and 8 inside one cell** in brown
  adipose metabolomics. Never derive it from a constant.
- **For metabolomics the reference table is the meta-regression file, not the redundant
  one.** Heart: 568 pairs in the selection, 568 rows at `adj_p_value < 0.05` in
  `METAB/meta-regression/…`, and 603 in `METAB/redundant/…`. Check against the wrong file
  and 35 features look like a discrepancy in the consortium's selection.

For heart proteomics — one platform, both sexes, all four timepoints — it collapses to the
simple case: 693 features, 5,544 rows, exactly the count of `adj_p_value < 0.05` in the
text table. That cell is the exception that reads like the rule.

A cell can also be legitimately empty. The immunoassay measured 46 analytes in ovary and
none reached 5% FDR, so `TRAINING_REGULATED_FEATURES` has **no rows** for `IMMUNO`/`OVARY`
— an empty selection there is the right answer, not a failed download.

## Epigenomics in the package is an excerpt

`ATAC` and `METHYL` ship only `_NORM_DATA_05FDR` objects, and the suffix is doing more
work than it looks. `ATAC_HEART_NORM_DATA_05FDR` has **75 rows**. The full heart ATAC
differential analysis, which lives only on the bucket, has 5,826,608 rows — **728,326
regions** × 2 sexes × 4 timepoints — of which exactly 75 pass 5% FDR. The `.rda` was
parsed on 2026-08-17; the equivalent `training-dea-fdr.txt` was streamed again on
2026-08-18 and holds 728,326 rows with exactly 75 at `adj_p_value < 0.05`, and
728,326 × 8 = 5,826,608. The two agree, which is what confirms the suffix means "the
training-regulated selection" and not "a convenience subset" — and 75 is also the number
of `ATAC`/`HEART` features in `TRAINING_REGULATED_FEATURES`, at eight rows each.

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

Run 2026-08-18:

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
  2026-08-18: `ATAC` and `METHYL` exist **only as `.rda`** (29 MB and 160 MB); `PROT`,
  `PHOSPHO`, `UBIQ`, `ACETYL` and `TRNSCRPT` exist **only as `.txt`** (158 MB, 108 MB,
  3.9 MB, 3.2 MB, 3.1 MB) and 404 as `.rda` — which is the extension the package
  documentation prints for them. Change the extension before concluding a file is gone.

## Objects pyreadr cannot read

Most of the 206 objects are data frames or character vectors and convert cleanly. These do
not, checked one by one on 2026-08-18 with pyreadr 0.5.3:

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
(`METAB_NORM_DATA_FLAT`, `IMMUNO_NORM_DATA_FLAT`); reach for those first, but read
*Joining a matrix to the animals* before you do — they are keyed on `pid`, not
`viallabel`, and the nested originals are not. Note that
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

Run 2026-08-18 under R 4.4.1:

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
in every assay.

**The two flat tables are keyed differently, and merging them on `viallabel` fails
silently.** `METAB_NORM_DATA_FLAT` and `IMMUNO_NORM_DATA_FLAT` hold every tissue in one
object, so their sample columns cannot be vial labels — they are **8-digit `pid`**, the
animal, where the per-tissue matrices carry 11-digit vial labels. Measured at `v2.1.0`:
none of the 54 metabolomics column names appears in `PHENO$viallabel` and all 54 appear in
`PHENO$pid`. Merge them on `viallabel` and every phenotype column comes back `NA` for all
778,626 rows, with no error — the shape is right and the content is empty. They also add a
fifth identifier column `dataset`, which has to go into `id_vars` or the platform label
becomes a sample. `METAB_NORM_DATA_NESTED` does not share the problem: its per-platform,
per-tissue frames are vial-label-headed like everything else.

So decide the key from the header rather than assuming it, and collapse `PHENO` to one row
per animal when it is `pid` — `PHENO` has 6,156 rows for 147 rats, one per vial.

```python
import os, re, urllib.request
import pandas as pd, pyreadr

TAG  = "v2.1.0"
BASE = f"https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/{TAG}/data"
OUT  = "Data/motrpac"
os.makedirs(OUT, exist_ok=True)

def fetch(name):
    p = os.path.join(OUT, name + ".rda")
    if not os.path.exists(p):
        urllib.request.urlretrieve(f"{BASE}/{name}.rda", p)
    tables = pyreadr.read_r(p)
    assert tables, f"{name} is not a data.frame — pyreadr returns {{}}, not an error"
    return list(tables.values())[0]

pheno = fetch("PHENO")
WANT  = ["pid", "sex", "key.anirandgroup", "key.agegroup", "key.intervention", "key.sacrificetime"]

def to_long(name):
    mat  = fetch(name)
    ids  = [c for c in mat.columns if not re.fullmatch(r"\d+", str(c))]
    samp = [c for c in mat.columns if re.fullmatch(r"\d+", str(c))]
    key  = "viallabel" if len(str(samp[0])) == 11 else "pid"      # 11 digits vs 8
    long = mat.melt(id_vars=ids, var_name=key, value_name="value").astype({key: str})
    ann  = pheno[[key] + [c for c in WANT if c != key]].astype({key: str}).drop_duplicates(key)
    out  = long.merge(ann, on=key, how="left")
    print(f"  {name:26} {mat.shape[0]:>6,} x {mat.shape[1]:<3} | id cols {ids}")
    print(f"  {'':26} {len(samp):>3} sample columns keyed on {key:9} | long {len(out):>9,} rows "
          f"| unmatched {int(out['sex'].isna().sum())}")
    return out

heart = to_long("TRNSCRPT_HEART_NORM_DATA")
to_long("PROT_HEART_NORM_DATA")
flat  = to_long("METAB_NORM_DATA_FLAT")
to_long("IMMUNO_NORM_DATA_FLAT")

print("\nage groups     :", sorted(heart["key.agegroup"].dropna().unique()))
print("design cells, heart transcriptomics:")
print(heart.drop_duplicates("viallabel").groupby(["key.anirandgroup", "sex"]).size().unstack(fill_value=0))
print("\ndesign cells, metabolomics (animal level, all tissues):")
print(flat.drop_duplicates("pid").groupby(["key.anirandgroup", "sex"]).size().unstack(fill_value=0))

dest = os.path.join(OUT, "TRNSCRPT_HEART_long.csv.gz")
heart.to_csv(dest, index=False, compression="gzip")
print("\nwrote", dest, f"{os.path.getsize(dest):,} bytes")
```

Run 2026-08-18:

```
  TRNSCRPT_HEART_NORM_DATA   14,445 x 54  | id cols ['feature', 'feature_ID', 'tissue', 'assay']
                              50 sample columns keyed on viallabel | long   722,250 rows | unmatched 0
  PROT_HEART_NORM_DATA        9,184 x 64  | id cols ['feature', 'feature_ID', 'tissue', 'assay']
                              60 sample columns keyed on viallabel | long   551,040 rows | unmatched 0
  METAB_NORM_DATA_FLAT       14,419 x 59  | id cols ['feature', 'feature_ID', 'tissue', 'assay', 'dataset']
                              54 sample columns keyed on pid       | long   778,626 rows | unmatched 0
  IMMUNO_NORM_DATA_FLAT         720 x 64  | id cols ['feature', 'feature_ID', 'tissue', 'assay', 'dataset']
                              59 sample columns keyed on pid       | long    42,480 rows | unmatched 0

age groups     : ['6 months']
design cells, heart transcriptomics:
sex                                female  male
key.anirandgroup
Eight-week program Control Group        5     5
Eight-week program Training Group       5     5
Four-week program                       5     5
One-week program                        5     5
Two-week program                        5     5

design cells, metabolomics (animal level, all tissues):
sex                                female  male
key.anirandgroup
Eight-week program Control Group        6     5
Eight-week program Training Group       6     5
Four-week program                       6     6
One-week program                        5     5
Two-week program                        5     5

wrote Data/motrpac/TRNSCRPT_HEART_long.csv.gz 5,473,930 bytes
```

Five animals per sex per group in heart transcriptomics — six in some metabolomics cells.
**This is a small design**, and the number that matters for power is that cell size, not
the 14,445 features. Sample counts differ by assay on the same tissue —
`PROT_HEART_NORM_DATA` is 9,184 × 64, so 60 sample columns against transcriptomics' 50 —
so count them per object rather than carrying one number across a manuscript. The `0` in
the `unmatched` column is the check that matters; it is what the `viallabel` assumption
turns into 778,626.

**Check `OUTLIERS` yourself; the matrices are not consistently cleaned.** It lists 79
sample-level exclusions with reasons, across all eight assays that have any. Verified
2026-08-18: the flagged liver transcriptomics sample (reason `PC2`) is **still a column**
in `TRNSCRPT_LIVER_NORM_DATA`, while the flagged liver proteomics sample — a suspected
sex mismatch or sample swap — is **not** in `PROT_LIVER_NORM_DATA`. Drop them explicitly
if you re-derive anything, and prefer
`TRAINING_REGULATED_NORM_DATA_NO_OUTLIERS` over `TRAINING_REGULATED_NORM_DATA` when you
want the cleaned version of that object.

## Installing the R packages, and why it usually fails

If you are working in R and want the packages rather than individual objects, know that
`remotes::install_github("MoTrPAC/MotrpacRatTraining6moData")` frequently does not work.
The repository is roughly 400 MB and GitHub's tarball endpoint times out generating the
archive — **intermittently**, which is the worst kind:
`https://api.github.com/repos/MoTrPAC/MotrpacRatTraining6moData/tarball/v2.1.0` returned
**HTTP 504** on both attempts made 2026-08-17 and **HTTP 200** on 2026-08-18. The
package's own README calls it intermittent too. The codeload archive is a different
endpoint and answered 200 on both days:

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
confirmed to answer HTTP 200 on both dates and had transferred 215 MB after 420 seconds
without finishing, so the download works and is simply slow; `install.packages()` on the
result was not reached. Everything else here was run verbatim. The citable alternative is the
Zenodo snapshot of the same tag, DOI `10.5281/zenodo.16851449`, a 399 MB zip.

Either way, prefer the per-object route above unless you specifically want the analysis
package's functions — pulling 400 MB to read one 460 kB table is a poor trade, and it is
the reason this skill is built the way it is.

## Limits worth stating in a write-up

- **Rat, not human.** MoTrPAC has a human arm, and **none of the routes in this skill
  serve any of it**: the packages are rat-only, the bucket paths are all `pass1b-06`, and
  the four GEO series are *Rattus norvegicus*. Do not plan around obtaining human MoTrPAC
  data here. Map with
  `RAT_TO_HUMAN_GENE` — 21,461 rows joining rat symbol, RGD, NCBI, Ensembl and UniProt
  identifiers to a human ortholog symbol — and say in the text that you did, because
  one-to-many and absent orthologs are silent otherwise.
- **The annotation is old.** Transcript features are built against Ensembl release 95 on
  **Rnor_6.0**, superseded by mRatBN7.2. Coordinates from `ATAC` and `METHYL` features,
  which are genomic intervals, are on that build and must be lifted before they meet
  anything modern.
- **Sex is a factor, not a nuisance.** Every differential analysis is per-sex by design,
  and the published headline was how much of the response differs between sexes. Pooling
  the sexes discards the finding. Two tissues are single-sex by anatomy (ovary, testes)
  and one — vena cava — is missing its female 1-week and 2-week samples, so a
  sex-difference statement there rests on 4w and 8w only.
- **Timepoints are training duration, not time of day.** `comparison_group` counts weeks
  of training. Circadian information is separate, in `PHENO` columns including
  `key.sacrificetime`.
- **`IMMUNO` is a targeted panel**, tens of analytes, not a discovery assay — 720 rows for
  17 tissues in one pooled file, 26 to 60 per tissue across six panels. Absence of a
  protein there means it was not on the panel, and absence of a tissue means the assay was
  not run there, which the file expresses as nothing at all rather than as an error.
- **One intervention.** Progressive treadmill endurance training. Nothing here speaks to
  resistance training, and the acute-exercise arm is not in this release.

## Try it

A self-contained check on the two open routes, on the claim that decides whether this
resource fits an aging question, and on the four places where a technique that works on
heart proteomics silently produces a wrong answer somewhere else. Public data, no account,
no key.

**Data** — six objects from `MotrpacRatTraining6moData` at tag `v2.1.0` (code MIT, data
CC BY 4.0), plus four plain-text tables from the public bucket:

    https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/PHENO.rda
    https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/PROT_HEART_DA.rda
    https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/METAB_HEART_DA.rda
    https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/METAB_VENACV_DA.rda
    https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/METAB_NORM_DATA_FLAT.rda
    https://raw.githubusercontent.com/MoTrPAC/MotrpacRatTraining6moData/v2.1.0/data/TRAINING_REGULATED_FEATURES.rda
    https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da/PROT/pass1b-06_t58-heart_prot-pr_training-dea-fdr.txt
    https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da/METAB/redundant/pass1b-06_t58-heart_metab_training-dea-fdr.txt
    https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da/METAB/meta-regression/pass1b-06_t58-heart_metab-meta-reg_training-dea-fdr.txt
    https://storage.googleapis.com/motrpac-rat-training-6mo-extdata/training-da/IMMUNO/pass1b-06_immunoassay_training-dea-fdr.txt

About 20 MB in total, no licence acceptance and no account. Heart proteomics is the
well-behaved case; heart and vena cava metabolomics and the pooled immunoassay are the
ones that break a heart-proteomics-shaped pipeline. Last confirmed reachable 2026-08-18.
Needs `pip install pyreadr pandas`.

```python
import io, os, re, urllib.request
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

def txt(path):
    return pd.read_csv(io.BytesIO(urllib.request.urlopen(f"{BUCK}/{path}", timeout=180).read()), sep="\t")

pheno = rda("PHENO")
trf   = rda("TRAINING_REGULATED_FEATURES")
trf["platform"] = trf["platform"].fillna("NA")          # NA for the 7 single-platform assays

# 1. what cohort is this? the answer is in PHENO, not in the file names
print("PHENO rows / age groups / protocols :", len(pheno),
      sorted(pheno["key.agegroup"].unique()), sorted(pheno["key.protocol"].unique()))
assert sorted(pheno["key.agegroup"].unique()) == ["6 months"]

# 2. a _DA table is sex x timepoint contrasts — and feature_ID is the key only for the
#    seven single-platform assays
prot = rda("PROT_HEART_DA")
ptsv = txt("PROT/pass1b-06_t58-heart_prot-pr_training-dea-fdr.txt")
nfeat, nsex, ntime = (prot["feature_ID"].nunique(), prot["sex"].nunique(),
                      prot["comparison_group"].nunique())
print("PROT_HEART_DA rows                  :", len(prot),
      f"= {nfeat} features x {nsex} sexes x {ntime} timepoints")
assert len(prot) == nfeat * nsex * ntime == 73472
m = prot[["feature_ID", "selection_fdr"]].drop_duplicates().merge(
        ptsv[["feature_ID", "adj_p_value"]], on="feature_ID")
print("PROT/HEART matched to bucket TSV    :", len(m),
      f"| max |Δ FDR| = {float(np.nanmax(np.abs(m.selection_fdr - m.adj_p_value))):.1e}")
assert len(m) == len(ptsv) == nfeat

# 3. METAB and IMMUNO break that: the row key is feature_ID + dataset, because the same
#    metabolite is measured on several platforms. Merging on feature_ID alone INFLATES.
metab = rda("METAB_HEART_DA")
red   = txt("METAB/redundant/pass1b-06_t58-heart_metab_training-dea-fdr.txt")
naive = metab[["feature_ID", "selection_fdr"]].drop_duplicates().merge(
            red[["feature_ID", "adj_p_value"]], on="feature_ID")
right = metab[["feature_ID", "dataset", "selection_fdr"]].drop_duplicates().merge(
            red[["feature_ID", "dataset", "adj_p_value"]], on=["feature_ID", "dataset"])
print("METAB/HEART bucket rows             :", len(red),
      f"| merge on feature_ID -> {len(naive)} rows, max |Δ FDR| "
      f"{float(np.nanmax(np.abs(naive.selection_fdr - naive.adj_p_value))):.1e}"
      f" | merge on feature_ID+dataset -> {len(right)} rows, max |Δ FDR| "
      f"{float(np.nanmax(np.abs(right.selection_fdr - right.adj_p_value))):.1e}")
assert len(naive) > len(red) and len(right) == len(red) == 1430
assert float(np.nanmax(np.abs(right.selection_fdr - right.adj_p_value))) < 1e-12
assert metab["feature_ID"].nunique() == 1309 < 1430
assert len(metab) == 1430 * nsex * ntime

# 4. the design is not a full grid everywhere: female vena cava has no 1w or 2w sample
ven = rda("METAB_VENACV_DA")
cells = ven.groupby("sex")["comparison_group"].unique().apply(sorted).to_dict()
print("METAB_VENACV_DA rows                :", len(ven), "| timepoints per sex:", cells)
assert len(ven) % (2 * 4) != 0 and cells["female"] == ["4w", "8w"]

# 5. IMMUNO is one pooled file for every tissue — HTTP 200 for a tissue it never ran on
imm = txt("IMMUNO/pass1b-06_immunoassay_training-dea-fdr.txt")
print("IMMUNO pooled rows / tissues        :", len(imm), imm["tissue_abbreviation"].nunique(),
      "| VENACV rows:", int((imm["tissue_abbreviation"] == "VENACV").sum()),
      "| OVARY rows:", int((imm["tissue_abbreviation"] == "OVARY").sum()),
      "at FDR<0.05:", int((imm[imm.tissue_abbreviation == "OVARY"].adj_p_value < 0.05).sum()))
assert imm["tissue_abbreviation"].nunique() == 17
assert (imm["tissue_abbreviation"] == "VENACV").sum() == 0

# 6. the two _FLAT matrices are keyed on pid (8 digits), not viallabel (11)
flat = rda("METAB_NORM_DATA_FLAT")
samp = [str(c) for c in flat.columns if re.fullmatch(r"\d+", str(c))]
print("METAB_NORM_DATA_FLAT sample columns :", len(samp),
      "| in PHENO.viallabel:", len(set(samp) & set(pheno.viallabel.astype(str))),
      "| in PHENO.pid:", len(set(samp) & set(pheno.pid.astype(str))))
assert set(samp) & set(pheno.viallabel.astype(str)) == set()
assert set(samp) <= set(pheno.pid.astype(str))

# 7. TRAINING_REGULATED_FEATURES: the unit is (feature_ID, platform), and the row count per
#    unit is n_sexes x n_timepoints present — 8, 6 or 4, not always 8
mreg = txt("METAB/meta-regression/pass1b-06_t58-heart_metab-meta-reg_training-dea-fdr.txt")
for assay, tissue, expect in [("PROT", "HEART", 8), ("TRNSCRPT", "OVARY", 4),
                              ("METAB", "VENACV", 6), ("IMMUNO", "HEART", 8)]:
    sel = trf[(trf.assay == assay) & (trf.tissue == tissue)]
    per = sorted(int(x) for x in sel.groupby(["feature_ID", "platform"]).size().unique())
    print(f"TRF {assay:8} {tissue:6} {sel.feature_ID.nunique():>5} features, "
          f"{sel.drop_duplicates(['feature_ID','platform']).shape[0]:>5} feature-platform pairs, "
          f"{len(sel):>6} rows, {per} rows each")
    assert per == [expect]
    assert len(sel) == sel.drop_duplicates(["feature_ID", "platform"]).shape[0] * expect
sel = trf[(trf.assay == "METAB") & (trf.tissue == "HEART")]
print("METAB/HEART: TRF pairs / meta-reg FDR<0.05 / redundant FDR<0.05 :",
      sel.drop_duplicates(["feature_ID", "platform"]).shape[0],
      int((mreg.adj_p_value < 0.05).sum()), int((red.adj_p_value < 0.05).sum()))
assert sel.drop_duplicates(["feature_ID", "platform"]).shape[0] == int((mreg.adj_p_value < 0.05).sum())
sel = trf[(trf.assay == "PROT") & (trf.tissue == "HEART")]
assert sel.feature_ID.nunique() == int((ptsv.adj_p_value < 0.05).sum()) == 693

print("\nage groups in the open omics release:", sorted(pheno["key.agegroup"].unique()))
```

What it printed on 2026-08-18:

```
PHENO rows / age groups / protocols : 6156 ['6 months'] ['phase 1b']
PROT_HEART_DA rows                  : 73472 = 9184 features x 2 sexes x 4 timepoints
PROT/HEART matched to bucket TSV    : 9184 | max |Δ FDR| = 1.1e-16
METAB/HEART bucket rows             : 1430 | merge on feature_ID -> 1724 rows, max |Δ FDR| 8.8e-01 | merge on feature_ID+dataset -> 1430 rows, max |Δ FDR| 9.9e-17
METAB_VENACV_DA rows                : 1278 | timepoints per sex: {'female': ['4w', '8w'], 'male': ['1w', '2w', '4w', '8w']}
IMMUNO pooled rows / tissues        : 720 17 | VENACV rows: 0 | OVARY rows: 46 at FDR<0.05: 0
METAB_NORM_DATA_FLAT sample columns : 54 | in PHENO.viallabel: 0 | in PHENO.pid: 54
TRF PROT     HEART    693 features,   693 feature-platform pairs,   5544 rows, [8] rows each
TRF TRNSCRPT OVARY    896 features,   896 feature-platform pairs,   3584 rows, [4] rows each
TRF METAB    VENACV    23 features,    23 feature-platform pairs,    138 rows, [6] rows each
TRF IMMUNO   HEART      4 features,     5 feature-platform pairs,     40 rows, [8] rows each
METAB/HEART: TRF pairs / meta-reg FDR<0.05 / redundant FDR<0.05 : 568 568 603

age groups in the open omics release: ['6 months']
```

**Expect**

Invariants — these hold regardless of release, and a failure means this skill is wrong,
not that upstream moved:

- `PHENO` has exactly **one** age group. Any second value means an aged arm has been
  released into the omics package and every "young adult only" statement above needs
  revisiting — which is a good outcome, not a bug, but it must be noticed.
- A `_DA` table has `n_keys × n_sexes × n_timepoints_present` rows, where the key is
  `feature_ID` for the single-platform assays and `feature_ID` **+ `dataset`** for `METAB`
  and `IMMUNO`. Treating it as one row per `feature_ID` is the most common way to misread
  these objects, and on metabolomics it does not even produce a whole number.
- `n_timepoints_present` is not always four and `n_sexes` is not always two. Ovary and
  testes are single-sex; vena cava has no female 1w or 2w. Count them, never assume them.
- `selection_fdr` in the `_DA` table equals `adj_p_value` in the matching bucket table for
  every row **when joined on the full key** — and the matching table for plain
  `METAB_*_DA` is `METAB/redundant/…`, not the meta-regression file. Joined on
  `feature_ID` alone, metabolomics returns *more* rows than the bucket table has, with
  max |Δ FDR| near 1 rather than near zero. That inflation is the assertion here.
- `TRAINING_REGULATED_FEATURES` for a tissue and assay contains exactly the
  `(feature_ID, platform)` pairs at `adj_p_value < 0.05` in the matching bucket table —
  the **meta-regression** one for metabolomics — at `n_sexes × n_timepoints` rows each.
  For heart proteomics that collapses to features at eight rows each; nowhere else is it
  safe to assume either.
- The immunoassay's pooled file answers **200 with zero rows** for a tissue it never ran
  on. Every other assay answers 404. Assert on the row count.
- Sample columns in `METAB_NORM_DATA_FLAT` and `IMMUNO_NORM_DATA_FLAT` are `pid`, and are
  **disjoint from `PHENO$viallabel`**. A `viallabel` merge on them returns a full-size
  frame with every phenotype column `NA`.
- pyreadr returns a truthy dict for every object here. The assertion inside `rda()` is
  what stops an empty dict from becoming a confusing `IndexError` later.

Observed 2026-08-18 against tag **v2.1.0** — these move when the consortium re-releases,
so a mismatch is drift to investigate rather than a failure:

- `PHENO` 6,156 rows · age groups `['6 months']` · protocols `['phase 1b']`
- `PROT_HEART_DA` 73,472 rows = 9,184 features × 2 sexes × 4 timepoints; 9,184 matched to
  the bucket table, max |Δ FDR| 1.1e-16
- `METAB_HEART_DA` 1,430 feature-platform keys, 1,309 distinct `feature_ID`; the naive
  join returns 1,724 rows against a 1,430-row bucket table
- `METAB_VENACV_DA` 1,278 rows, female `4w 8w` only
- immunoassay 720 rows over 17 tissues; ovary 46 analytes, none at 5% FDR
- `METAB_NORM_DATA_FLAT` 54 `pid` columns, none of them a vial label
- training-regulated: heart proteins 693 / 5,544 rows · ovary transcripts 896 / 3,584 ·
  vena cava metabolites 23 / 138 · heart immunoassay 4 features but 5 feature-panel pairs
  / 40 rows · heart metabolites 568 pairs, matching the 568 at FDR < 0.05 in the
  meta-regression file and not the 603 in the redundant one

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
