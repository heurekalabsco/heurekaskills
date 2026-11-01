---
name: admet-ai
description: Predict 41 Therapeutics Data Commons ADMET endpoints plus 11 RDKit properties from SMILES with ADMET-AI on CPU — raw predictions by default, DrugBank percentiles only for non-commercial use, and a range gate for the unbounded regression heads.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [admet, cheminformatics, drug-discovery, licensing, smiles]
covers: [ADMET, absorption, distribution, metabolism, excretion, toxicity, solubility, lipophilicity, permeability, Caco-2, PAMPA, blood-brain barrier, CYP inhibition, CYP substrate, hERG, DILI, AMES mutagenicity, Tox21, clearance, half-life, volume of distribution, plasma protein binding, bioavailability, SMILES, small molecule, lead optimisation, Therapeutics Data Commons, chemprop]
papers: [doi:10.1093/bioinformatics/btae416, doi:10.1038/s41589-022-01131-2]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-23
  against: admet-ai 2.0.1 / chemprop 2.3.1 / torch 2.14.1 / lightning 2.6.6 / rdkit 2026.3.6 / pandas 3.1.0 / numpy 2.5.4 / scipy 1.18.1 / Python 3.12.8 / CPU only, macOS 27 arm64, no GPU / model ensembles, metadata table and reference set as shipped in the 2.0.1 wheel
  executed: 13
  unverified: 0
---
# ADMET-AI

ADMET-AI predicts 41 ADMET endpoints drawn from the Therapeutics Data Commons
(TDC) with Chemprop message-passing ensembles, and computes 11 physicochemical
and structural-alert properties with RDKit alongside them. Input is SMILES;
output is 52 numbers per molecule. It runs on CPU at a few milliseconds per
molecule, and the weights ship inside the package, so there is nothing to
download at first use and no service to call.

**Everything it returns is a model output, not a measurement.** No value here is
an observation of the molecule; each is what an ensemble trained on a few
hundred to a few thousand assay results extrapolates. Two sections of this page
exist because that distinction has teeth: the learned regression heads are
unbounded and routinely leave the physically possible range, and two of them
score worse than predicting the training mean.

## Before the first call — what you need, and the one licence that bites

- **Python 3.11 or newer.** No API key, no account, no GPU.
- **Roughly 270 MB of download and 1.1 to 1.3 GiB of disk.** Measured on macOS
  arm64 from an empty environment with no package cache: about 270 MB of wheels,
  leaving 1.25 GiB installed by `pip` and 1.10 GiB by `uv`, which precompiles
  less bytecode. The cold install took five and a half minutes, nearly all of it
  download. ADMET-AI itself is a 14.3 MB wheel — 27 MB installed, model weights
  and reference set included — and the rest is PyTorch and its dependencies. On
  Linux expect more: the default PyTorch wheel bundles CUDA runtime libraries
  whether or not a GPU is present, and the `torch` 2.14.1 cp312 wheel on PyPI is
  554.6 MB for manylinux x86_64 against 127.3 MB for macOS arm64. Installing a
  CPU-only PyTorch build first avoids most of that; that route was not exercised
  here, so no command for it is given.
- **The code and the model weights are MIT.** The installed distribution carries
  `License-Expression: MIT`, and the repository's `LICENSE.txt` is the MIT text,
  copyright an individual author.

**The reference set is not MIT, and it is what the percentile columns are made
of.** Every `*_drugbank_approved_percentile` column is computed against
`drugbank_approved.csv`, a 2,845-row table bundled in the wheel. Upstream's
reproduction instructions say that file was built from DrugBank XML v5.1.14 and
that it "assumes that the file `drugbank.xml` has been downloaded from DrugBank
(license required)". The terms on that download, read at source on 2026-10-23:

- DrugBank's releases page says of its complete-database downloads, "These
  DrugBank datasets are released under a Creative Common's
  Attribution-NonCommercial 4.0 International License", linking
  `creativecommons.org/licenses/by-nc/4.0/legalcode`
  (<https://go.drugbank.com/releases/latest>).
- DrugBank's Terms of Use (updated 2025-09-17) grant access "solely for
  educational, scientific, and non-commercial research purposes unless you have
  paid for a commercial license" (§1.3) and state that "DrugBank gives no rights
  to use the Databases, Platform, or Services in any commercial application"
  (§2.2) (<https://trust.drugbank.com/drugbank-trust-center/terms-of-use>).
- The same file's `atc` and `atc_name_*` columns are the WHO Collaborating Centre
  for Drug Statistics Methodology's ATC classification, whose copyright notice
  reads "Copying and distribution for commercial purposes is not allowed."
  (<https://atcddd.fhi.no/copyright_disclaimer/>). DrugBank does publish a
  separate Open Data release under CC0 that its own page says may be used
  commercially, but that is a vocabulary of identifiers and names with no ATC
  classification, and it is not what this reference set was built from.

So this page **defaults to `drugbank_path=None`**, which loads the models without
that reference set and returns every raw prediction — only the percentile columns
disappear. The percentile and ATC sections further down are labelled as the
non-commercial route and are there for readers whose use is academic or otherwise
non-commercial. **Do not opt into them on someone else's behalf, and do not opt
in when the use is commercial or has not been stated.** A commercial reader who
still wants percentiles has a clean route — see *Percentiles against your own
reference set*, which touches no DrugBank data at all.

```bash
pip install 'admet-ai==2.0.1'
python -c "import admet_ai, importlib.metadata as m; print('admet-ai', m.version('admet_ai'))"
```

## The first call

```python
from admet_ai import ADMETModel

model = ADMETModel(drugbank_path=None)      # no DrugBank reference set loaded

one = model.predict(smiles="CC(=O)Oc1ccccc1C(=O)O")
print(type(one).__name__, len(one))          # dict, 52 entries
print("logP     %.3f" % one["logP"])
print("hERG     %.4f" % one["hERG"])
print("half-life %.2f h  <- below the possible minimum of 0; see the range gate"
      % one["Half_Life_Obach"])

many = model.predict(smiles=["CC(=O)Oc1ccccc1C(=O)O",
                             "CN1C=NC2=C1C(=O)N(C)C(=O)N2C"])
print(type(many).__name__, many.shape)       # DataFrame, (2, 52)
```

Construct `ADMETModel` **once** and reuse it. Construction is not lazy — both
ensembles (5 models each, 10 in total) are loaded from disk inside `__init__`,
which took 0.04 s here against roughly 4.6 s for the import itself. What costs
time per call is inference: pass a list rather than looping over single strings.
A thousand valid molecules took 7.5 s on CPU, about 7.5 ms each.

## The 52 properties, and why the schema is not fixed

The package ships its own metadata table describing every property — category,
task type, units, the possible range, training-set size and held-out
performance. Read the schema from there rather than hardcoding it:

```python
from admet_ai.admet_info import get_admet_info

info = get_admet_info()
print(info.shape)                                             # (52, 14)
print(info.groupby(["category", "task_type"]).size().to_string())
print("training sizes %d to %d molecules"
      % (info["size"].min(), info["size"].max()))

regression = info[(info.task_type == "regression")
                  & (info.category != "Physicochemical")]
print(regression[["id", "units", "minimum", "maximum", "R^2"]].to_string(index=False))
```

- **11 physicochemical and structural-alert properties**, computed by RDKit and
  not learned: `molecular_weight`, `logP`, `hydrogen_bond_acceptors`,
  `hydrogen_bond_donors`, `Lipinski`, `QED`, `stereo_centers`, `tpsa`,
  `PAINS_alert`, `BRENK_alert`, `NIH_alert`. `Lipinski` is a **count of rules
  satisfied out of 4**, not a boolean, and the three `*_alert` fields count
  matching substructures, so zero is the clean result.
- **31 classification endpoints**, each a number in [0, 1]. Treat them as
  probabilities only in the loose sense — nothing upstream reports a calibration
  curve, so a 0.7 is not a claim that 70% of such molecules are positive.
- **10 learned regression endpoints**, in the units of their training set.

Training sets run from **278** molecules (`Carcinogens_Lagunin`) to **13,130**
(`CYP2D6_Veith`), which is the single most useful number on this page for
deciding how much weight a prediction carries.

**Three things change the returned schema**, so code that assumes 104 columns
will break:

| what you pass | keys returned |
|---|---|
| `drugbank_path=None` (the default here) | 52 |
| the bundled reference set (library default) | 104 — each property plus its percentile |
| `include_physchem=False` | 41 — the learned endpoints only |

Build percentile column names with the suffix helper rather than writing them
out; it is the same function the library uses internally, and it accounts for the
ATC filter renaming every one of them:

```python
from admet_ai.utils import get_drugbank_suffix

print(get_drugbank_suffix(atc_code=None))           # drugbank_approved_percentile
print(get_drugbank_suffix(atc_code="analgesics"))   # drugbank_approved_analgesics_percentile
```

**One unit in that table is wrong.** `Clearance_Hepatocyte_AZ` is
`uL/min/10^6 cells` and `Clearance_Microsome_AZ` is `uL/min/mg` — they are
different assays and the table has them right. But `Caco2_Wang` is listed as
`log(10^-6 cm/s)`, and the shipped predictions for the 2,845 reference drugs run
from -19.38 to -3.73 with a median of -4.93. Those are log10 of cm/s; on the
stated unit they would sit near 1. TDC's own dataset page states no unit for this
endpoint, so the table is the only source and it is off by the 10^-6 factor. Read
`Caco2_Wang` as log cm/s.

## Return type follows the argument type, and the index is not unique

A single SMILES string gives a **dict**; a list gives a **DataFrame indexed by
the input SMILES**, not by position. Code handling both must branch on the type.
The index is the part that bites:

```python
from admet_ai import ADMETModel

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
CAFFEINE = "CN1C=NC2=C1C(=O)N(C)C(=O)N2C"

model = ADMETModel(drugbank_path=None)
out = model.predict(smiles=[CAFFEINE, ASPIRIN, CAFFEINE])

print(out.shape)                      # (3, 52) — the duplicate is kept
print(list(out.index) == [CAFFEINE, ASPIRIN, CAFFEINE])   # True — input order kept
print(out.index.is_unique)            # False
print(type(out.loc[CAFFEINE, "logP"]).__name__)           # Series, not a float

# De-duplicate first, then map back. One prediction per distinct molecule.
distinct = list(dict.fromkeys([CAFFEINE, ASPIRIN, CAFFEINE]))
scored = model.predict(smiles=distinct)
if not scored.index.is_unique:
    raise RuntimeError("reference rows are not unique after de-duplication")
print(float(scored.loc[CAFFEINE, "logP"]))                # a scalar
```

Duplicates are **not** collapsed and input order **is** preserved — both worth
stating because the opposite is the natural guess. What you lose is scalar
lookup: `out.loc[smiles, column]` silently returns a Series as soon as any
molecule repeats, and arithmetic on it propagates a shape nobody expected.

## Unparseable SMILES — gate the input, do not rely on the warning

Through the Python API, RDKit-unparseable input is dropped before inference: the
call succeeds, prints `Warning: N invalid molecules removed.` **to stdout** (not
stderr, so a pipeline capturing only stderr sees nothing), and returns a frame
**shorter than the list you passed in**. If *every* input is unparseable the call
instead dies inside PyTorch with `TypeError: cat(): argument 'tensors'
(position 1) must be tuple of Tensors, not NoneType`, which says nothing about
SMILES.

Gate the input yourself. An explicit `raise` rather than an `assert`, because
`python -O` strips asserts and would turn this check into silence:

```python
from rdkit import Chem, RDLogger
from rdkit.Chem.MolStandardize import rdMolStandardize

RDLogger.DisableLog("rdApp.*")          # RDKit's own parse errors go to stderr


def prepare(smiles_list):
    """Canonical, single-fragment SMILES for the parseable inputs, plus the rejects."""
    if isinstance(smiles_list, str):
        raise TypeError("pass a list of SMILES, not a single string")
    good, bad = [], []
    for s in smiles_list:
        mol = Chem.MolFromSmiles(s) if isinstance(s, str) and s.strip() else None
        if mol is None or mol.GetNumAtoms() == 0:
            bad.append(s)
            continue
        parent = rdMolStandardize.LargestFragmentChooser().choose(mol)
        good.append(Chem.MolToSmiles(parent))
    if not good:
        raise ValueError(f"no input SMILES could be parsed; {len(bad)} rejected")
    return list(dict.fromkeys(good)), bad


good, bad = prepare(["CC(=O)Oc1ccccc1C(=O)O", "not_a_smiles", "C1CC", "",
                     "CN(C)C(=N)NC(=N)N.Cl"])
print(len(good), "to predict;", len(bad), "rejected:", bad)
print(good[-1])            # the hydrochloride came through as the parent base
```

`C1CC` is the quiet half of this — a plausible-looking string with an unclosed
ring, easy to miss in a hand-built list. Taking the largest fragment means a salt
such as metformin hydrochloride is scored as the parent molecule, which is
usually what a caller wants, and is a decision worth recording rather than
leaving implicit.

## The range gate — read the regression heads against the shipped bounds

The 10 learned regression endpoints are unbounded linear outputs. Five of them
have a finite physical bound in the package's own metadata (`PPBR_AZ` is
[0, 100]; `VDss_Lombardo`, `Half_Life_Obach`, `Clearance_Hepatocyte_AZ` and
`Clearance_Microsome_AZ` are [0, inf)), and nothing in the model enforces any of
them. Counted over the 2,845 predictions the bundled reference set already
carries:

| endpoint | possible range | outside it | held-out R² |
|---|---|---|---|
| `VDss_Lombardo` | 0 to inf L/kg | 996 below 0 | **-1.21** |
| `Clearance_Microsome_AZ` | 0 to inf uL/min/mg | 694 below 0 | 0.28 |
| `Half_Life_Obach` | 0 to inf hr | 633 below 0 | **-2.39** |
| `Clearance_Hepatocyte_AZ` | 0 to inf uL/min/10^6 cells | 430 below 0 | 0.26 |
| `PPBR_AZ` | 0 to 100 % | 74 below 0, **313 above 100** | 0.59 |

Frame these as *outside the possible range* rather than merely negative:
`PPBR_AZ` has more values above 100% bound than below 0%, and a percent-bound of
112 is as impossible as one of -4. The other five regression endpoints carry no
finite bound in the table — four are log-scale and one is a free energy in
kcal/mol — so negative values are expected there and mean nothing is wrong.

Flag out-of-range predictions explicitly instead of clipping them. Clipping to
the bound hides which predictions were unusable, and the direction and size of
the excursion is the signal that the molecule is far from the training
distribution:

```python
import pandas as pd
from admet_ai import ADMETModel
from admet_ai.admet_info import get_admet_info


def range_flags(preds):
    """One row per (molecule, endpoint) whose prediction is outside its possible range."""
    info = get_admet_info().set_index("id")
    frame = preds if isinstance(preds, pd.DataFrame) else pd.DataFrame([preds])
    rows = []
    for endpoint, meta in info.iterrows():
        lo, hi = meta["minimum"], meta["maximum"]
        if endpoint not in frame.columns:
            continue
        values = frame[endpoint]
        outside = values[(values < lo) | (values > hi)]
        for smiles, value in outside.items():
            rows.append({"smiles": smiles, "endpoint": endpoint, "value": float(value),
                         "minimum": lo, "maximum": hi, "units": meta["units"]})
    return pd.DataFrame(rows, columns=["smiles", "endpoint", "value",
                                       "minimum", "maximum", "units"])


model = ADMETModel(drugbank_path=None)
preds = model.predict(smiles=["CC(=O)Oc1ccccc1C(=O)O",
                              "CN1C=NC2=C1C(=O)N(C)C(=O)N2C",
                              "CC(C)Cc1ccc(cc1)C(C)C(=O)O"])
flags = range_flags(preds)
print(flags.to_string(index=False))
if flags.empty:
    print("nothing outside range in this set")
```

**Two endpoints are worse than useless as values.** `Half_Life_Obach` and
`VDss_Lombardo` carry held-out R² of **-2.39** and **-1.21** in the package's own
metadata table, meaning each does worse on its benchmark split than predicting
the training mean for every molecule. Aspirin — a molecule nobody would call out
of distribution — is predicted at about **-19.7 hours** half-life here. For those
two:

- **Do not report the number**, and do not rank on it either. A rank derived from
  a model with negative R² is not a weaker version of a good answer; there is no
  evidence it orders molecules better than chance on held-out data.
- Where a half-life or volume-of-distribution estimate is actually needed, use a
  dedicated PK model or a measurement. This one does not support the claim.

For the other three bounded endpoints (R² 0.26 to 0.59), **rank on the raw value
or on the percentile — they give the same order**, because percentiles are
computed with `scipy.stats.percentileofscore`, which is monotone in the raw
value and never reverses it. The percentile is the more legible of the two when
the raw value is outside its possible range, but it is not more informative, and
it does not repair a bad model.

The classification heads carry no equivalent problem: they are bounded in [0, 1]
by construction.

## Percentiles against the bundled reference set — the non-commercial route

**This section uses DrugBank-derived and WHOCC-derived data. Use it only if your
use is non-commercial, having read the terms quoted at the top of this page.**
The commercial-safe alternative is the next section.

Passing no `drugbank_path` loads the bundled 2,845-drug reference set and adds a
percentile column for all 52 properties, giving 104 keys. A percentile of 13 for
`hERG` means the molecule's predicted hERG liability is below that of about 87%
of the reference drugs — a statement about one model's outputs on two molecule
sets, not about measured liability. A percentile inherits whatever the underlying
model is worth, so the `Half_Life_Obach` and `VDss_Lombardo` percentiles are no
more rankable than their raw values; see *The range gate* above.

```python
from admet_ai import ADMETModel

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"

model = ADMETModel()                       # library default: bundled reference set
scored = model.predict(smiles=ASPIRIN)
print(len(scored), sum(1 for k in scored if k.endswith("_percentile")))
print("hERG %.4f at percentile %.2f"
      % (scored["hERG"], scored["hERG_drugbank_approved_percentile"]))
print("reference drugs:", len(model.drugbank))
```

Percentiles can be taken against a therapeutic subset, and `atc_code` is
misnamed: it wants a lowercase **ATC class name** from the reference set's own
`atc_name_*` columns — `"analgesics"`, `"nervous system"`, `"dermatologicals"`
— of which there are 884. An actual ATC code raises `ValueError: Invalid ATC
code: N02`. Filtering **renames every percentile column**, from
`<property>_drugbank_approved_percentile` to
`<property>_drugbank_approved_<atc_code>_percentile`, so code hardcoding the
unfiltered suffix raises `KeyError` the moment anyone adds a filter.

```python
from admet_ai import ADMETModel

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"

whole = ADMETModel().predict(smiles=ASPIRIN)
subset_model = ADMETModel(atc_code="analgesics")
subset = subset_model.predict(smiles=ASPIRIN)

print("reference subset:", len(subset_model.drugbank_atc_filtered), "drugs")
print("prediction unchanged:", subset["hERG"] == whole["hERG"])
print("whole  %.2f" % whole["hERG_drugbank_approved_percentile"])
print("subset %.2f" % subset["hERG_drugbank_approved_analgesics_percentile"])
print("old column still present:",
      "hERG_drugbank_approved_percentile" in subset)      # False
```

`atc_code` needs that reference set to exist. With the default route it fails
loudly rather than silently ignoring the argument —
`ADMETModel(drugbank_path=None, atc_code="analgesics")` raises `ValueError:
DrugBank reference set must be provided to filter by ATC code.`

## Percentiles against your own reference set — no DrugBank data

A percentile is only a position within whatever population you choose, and
`drugbank_path` accepts any CSV. Score your own library on the default route,
save it, and use it as the reference. Nothing DrugBank-derived is read, and the
numbers mean more: a position among the compounds you actually care about beats a
position among approved drugs.

Three things to get right, all of them learned by hitting them:

- **The reference CSV must carry a column for every property being predicted**,
  because the library iterates the prediction columns and indexes the reference
  by name. A reference built with `include_physchem=False` against a model using
  physchem raises `KeyError: 'molecular_weight'`.
- **`drugbank_path` must be a `pathlib.Path`.** A `str` raises
  `AttributeError: 'str' object has no attribute 'exists'`, and a path that does
  not exist raises `FileNotFoundError: The path to the drugbank archive is not
  correct: ...`.
- **The columns are still named `*_drugbank_approved_percentile`** even though no
  DrugBank data is involved. Rename them on the way out, or a downstream reader
  will believe something untrue about where the reference came from.

```python
from pathlib import Path
from admet_ai import ADMETModel

REFERENCE = Path("my_reference.csv")
LIBRARY = ["CCO", "c1ccccc1", "CC(=O)Oc1ccccc1C(=O)O",
           "CN1C=NC2=C1C(=O)N(C)C(=O)N2C", "CC(C)Cc1ccc(cc1)C(C)C(=O)O"]

# 1. score the reference population on the default route, with no DrugBank data
ADMETModel(drugbank_path=None).predict(smiles=LIBRARY).to_csv(REFERENCE,
                                                              index_label="smiles")

# 2. use it as the reference population
model = ADMETModel(drugbank_path=REFERENCE)
scored = model.predict(smiles="CC(C)Cc1ccc(cc1)C(C)C(=O)O")
renamed = {k.replace("drugbank_approved_percentile", "reference_percentile"): v
           for k, v in scored.items()}
print("reference size:", len(model.drugbank))
print("hERG percentile within my library: %.1f" % renamed["hERG_reference_percentile"])
print("resolution: one step is %.1f percentile points" % (100 / len(model.drugbank)))
```

A five-molecule reference resolves percentiles to 20-point steps, which is the
other half of this trade: your own population is more meaningful and far coarser.
A few hundred molecules is where it starts to read sensibly.

## Scoring a file from the command line

`admet_predict` reads a CSV, keeps the columns already there and appends the
prediction columns, which is what makes it usable on an annotated library. Pass
`--drugbank_path None` for the default route — the CLI accepts the literal string
`None` and maps it to no reference set, which is how upstream generates the
reference set itself.

```bash
printf 'smiles,compound_id\nCC(=O)Oc1ccccc1C(=O)O,CMP-1\nBAD,CMP-2\nCN1C=NC2=C1C(=O)N(C)C(=O)N2C,CMP-3\n' > library.csv

admet_predict --data_path library.csv --save_path scored.csv \
    --smiles_column smiles --drugbank_path None

python -c "
import pandas as pd
d = pd.read_csv('scored.csv')
print(d.shape)
print(d[['smiles', 'compound_id', 'molecular_weight', 'hERG']].to_string(index=False))
"
```

Three behaviours differ from the Python API, and all three can lose data:

- **Invalid rows are kept, with NaN predictions.** Unlike `predict`, the CLI
  concatenates predictions back onto the input rows, so `BAD` above survives into
  the output with every prediction column empty. Three rows in, three rows out.
  Check for NaN before treating the file as scored; row counts will not tell you.
- **A row with an *empty* SMILES cell is dropped entirely**, with its own warning
  (`Warning: N molecules were removed from the dataset because they were missing
  SMILES.`). So an empty cell and an unparseable string behave differently —
  one disappears, the other stays as NaN.
- **Without `--save_path` it overwrites the input file in place.** Measured: a
  two-column input came back with 54 columns and the original file gone. Always
  pass `--save_path`.

**A duplicate SMILES plus an unparseable one crashes the CLI.** Either alone is
fine — a repeated SMILES gives one output row per input row in input order, and
an unparseable one gives the NaN row above. Together, the concat onto a
non-unique index fails and no output is written at all:

```bash
printf 'smiles,compound_id\nCC(=O)Oc1ccccc1C(=O)O,CMP-1\nBAD,CMP-2\nCC(=O)Oc1ccccc1C(=O)O,CMP-3\n' > dupinvalid.csv

admet_predict --data_path dupinvalid.csv --save_path crash.csv \
    --smiles_column smiles --drugbank_path None > crash.log 2>&1
status=$?
tail -2 crash.log
echo "exit status: $status  |  output written: $([ -f crash.csv ] && echo yes || echo no)"
```

It exits non-zero with `pandas.errors.InvalidIndexError: Reindexing only valid
with uniquely valued Index objects`. De-duplicate and drop unparseable rows
before calling the CLI — the `prepare` function above does both — or score
through the Python API, which survives this input.

## Try it

A self-contained check that this page still holds. The molecules are written by
the block itself, so there is nothing to fetch and nothing to go stale, which is
why `datasets:` is an empty list. Needs `pip install 'admet-ai==2.0.1'` from
*Before the first call*; nothing else, and no DrugBank data is read.

**Data** — four SMILES written inline: aspirin, caffeine and ibuprofen, plus
`not_a_smiles` to route the check through the silent-drop behaviour rather than
around it.

**Run**

```python
import pandas as pd
from admet_ai import ADMETModel
from admet_ai.admet_info import get_admet_info
from admet_ai.utils import get_drugbank_suffix

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
CAFFEINE = "CN1C=NC2=C1C(=O)N(C)C(=O)N2C"
IBUPROFEN = "CC(C)Cc1ccc(cc1)C(C)C(=O)O"

model = ADMETModel(drugbank_path=None)

# --- invariant: the default route returns 52 properties and no percentiles ---
one = model.predict(smiles=ASPIRIN)
assert isinstance(one, dict), type(one)
assert len(one) == 52, len(one)
assert not [k for k in one if k.endswith("_percentile")]
assert model.drugbank is None

# --- invariant: return type follows argument type; duplicates are kept in order ---
many = model.predict(smiles=[ASPIRIN, "not_a_smiles", CAFFEINE, IBUPROFEN, CAFFEINE])
assert isinstance(many, pd.DataFrame)
assert list(many.index) == [ASPIRIN, CAFFEINE, IBUPROFEN, CAFFEINE]   # bad input dropped
assert many.shape == (4, 52), many.shape
assert not many.index.is_unique
assert isinstance(many.loc[CAFFEINE, "logP"], pd.Series)              # not a scalar

# --- invariant: the metadata table describes exactly what predict returns ---
info = get_admet_info()
assert set(info["id"]) == set(one), "metadata table and prediction keys disagree"
assert int((info.category == "Physicochemical").sum()) == 11
assert int((info.task_type == "classification").sum()) == 31
regression = info[(info.task_type == "regression") & (info.category != "Physicochemical")]
assert len(regression) == 10, len(regression)

# --- invariant: classification heads are bounded, regression heads are not ---
classification = list(info[info.task_type == "classification"]["id"])
assert all(0.0 <= one[k] <= 1.0 for k in classification)
bounded = regression[regression["minimum"] > float("-inf")]
assert set(bounded["id"]) == {"PPBR_AZ", "VDss_Lombardo", "Half_Life_Obach",
                              "Clearance_Hepatocyte_AZ", "Clearance_Microsome_AZ"}

# --- invariant: the two endpoints this page refuses to report score below zero ---
r2 = info.set_index("id")["R^2"]
assert r2["Half_Life_Obach"] < 0 and r2["VDss_Lombardo"] < 0, "R2 caveat no longer applies"

# --- invariant: the percentile suffix helper tracks the ATC filter ---
assert get_drugbank_suffix(None) == "drugbank_approved_percentile"
assert get_drugbank_suffix("analgesics") == "drugbank_approved_analgesics_percentile"

# --- invariant: identical input gives identical output in one process ---
assert model.predict(smiles=ASPIRIN) == one

# --- observed values, admet-ai 2.0.1, CPU, 2026-10-23 ---
lo = regression.set_index("id")["minimum"]
hi = regression.set_index("id")["maximum"]
outside = sorted(e for e in regression["id"]
                 if not (lo[e] <= one[e] <= hi[e]))
print("aspirin MW         : %.3f" % one["molecular_weight"])
print("aspirin Lipinski   : %.1f of 4" % one["Lipinski"])
print("aspirin hERG       : %.4f" % one["hERG"])
print("aspirin half-life  : %.2f h" % one["Half_Life_Obach"])
print("caffeine half-life : %.2f h" % float(many.loc[CAFFEINE, "Half_Life_Obach"].iloc[0]))
print("aspirin outside possible range:", outside)
print("R2 Half_Life_Obach %.2f  VDss_Lombardo %.2f"
      % (r2["Half_Life_Obach"], r2["VDss_Lombardo"]))
print("training sizes     : %d to %d" % (info["size"].min(), info["size"].max()))
print("OK")
```

**Expect**

The assertions are the test; the printed lines are the record. The invariants
must hold on any version — 52 properties and no percentile columns on the
default route, a dict for one SMILES and a DataFrame for a list, the
unparseable input dropped while the duplicate is kept in input order, a
non-unique index returning a Series, the metadata table's ids matching the
prediction keys exactly, 11 physicochemical and 31 classification and 10 learned
regression endpoints, classification heads inside [0, 1], the same five
regression endpoints carrying a finite lower bound, negative R² on the two
endpoints this page refuses to report, and the suffix helper tracking the ATC
filter. A failure there means this page is wrong.

The observed values were produced by admet-ai 2.0.1 on CPU on 2026-10-23:

```
aspirin MW         : 180.159
aspirin Lipinski   : 4.0 of 4
aspirin hERG       : 0.0208
aspirin half-life  : -19.73 h
caffeine half-life : 5.19 h
aspirin outside possible range: ['Half_Life_Obach', 'VDss_Lombardo']
R2 Half_Life_Obach -2.39  VDss_Lombardo -1.21
training sizes     : 278 to 13130
OK
```

The tool writes its own output around those lines and that is expected: a
progress bar per ensemble member on stderr, and `Warning: 1 invalid molecules
removed.` on stdout, which is the silent-drop behaviour being exercised rather
than a problem with the run.

A mismatch in the recorded numbers after an upstream release is drift to
investigate, not a bug. Version 2 retrained every model from scratch, so
predictions already differ from the published figures and from the public web
server, which is still version 1.

## Limits worth stating when you report a result

- **The training sets are small and mostly drug-like.** 278 to 13,130 molecules
  per endpoint. A prediction for a peptide, a metal complex, a PROTAC or anything
  far outside that space is an extrapolation, and nothing in the output says so.
- **There is no uncertainty estimate.** Each ensemble is averaged into a point
  value; the spread across member models is not exposed.
- **Half-life and volume of distribution should not be reported at all** from
  this tool — see the range gate. Negative R² on the benchmark split is not a
  caveat, it is a disqualification for those two endpoints.
- **A percentile is a position, not a verdict.** A molecule can sit at the 99th
  percentile for solubility among approved drugs and still be too insoluble for
  your assay.
- **Version 2 predictions are not the paper's.** The published benchmarks and the
  public web server are version 1, which used RDKit fingerprints alongside the
  graph model; version 2 "uses Chemprop v2 (without RDKit fingerprints)" and was
  retrained from scratch, and upstream states its predictions "will not exactly
  match" version 1's. Cite accordingly, and never compare across the two.
- **Two of the names are endpoints, not findings.** `DILI` and `ClinTox` are
  trained on small, heavily curated clinical sets. A high probability is a flag
  for a person to look at.
- **Batch composition shifts predictions in the last decimal place.** Repeating a
  call in one process is exactly reproducible, but the same molecule scored
  alongside different neighbours moved by up to 4e-6 here — float32 noise, not a
  reason to worry, and a reason not to assert bit-equality across batches.

## When not to use this

Reach for something else when the question is about a **specific** measured
property of a molecule that exists and has been assayed — look the measurement
up rather than predict it. This tool is for triaging molecules nobody has made,
and for ordering a library too large to assay. For a compound already in ChEMBL
with human pharmacokinetic data attached, a prediction is strictly worse
information than the record.

It is also the wrong tool for target affinity. Nothing here models a protein; the
endpoints are properties of the molecule alone.
