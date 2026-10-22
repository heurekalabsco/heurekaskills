---
name: admet-ai
description: Predict 41 Therapeutics Data Commons ADMET endpoints plus physicochemical properties for small molecules with ADMET-AI on CPU, with percentiles against 2,845 approved drugs, and read its unbounded regression heads without trusting impossible values.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [admet, cheminformatics, small-molecule, chemprop, drug-discovery]
covers: [ADMET, absorption, distribution, metabolism, excretion, toxicity, solubility, lipophilicity, permeability, Caco-2, PAMPA, blood-brain barrier, CYP inhibition, CYP substrate, hERG, DILI, AMES mutagenicity, Tox21, clearance, half-life, volume of distribution, plasma protein binding, bioavailability, SMILES, small molecule, lead optimisation, Therapeutics Data Commons, DrugBank percentile]
papers: [doi:10.1093/bioinformatics/btae416, doi:10.1038/s41589-022-01131-2]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-22
  against: admet_ai 2.0.1 (released 2026-02-22) / chemprop 2.3.1 / torch 2.14.1 / rdkit 2026.3.6 / pandas 3.0.6 / numpy 2.4.6 / Python 3.11.17 / CPU only, 4 cores, linux x86_64 / model ensembles and DrugBank reference set as shipped in the 2.0.1 wheel
  executed: 7
  unverified: 0
---
# ADMET-AI

ADMET-AI predicts 41 ADMET endpoints from the Therapeutics Data Commons with
Chemprop message-passing ensembles, and adds 11 physicochemical and
structural-alert properties computed with RDKit. Every one of those 52 numbers
comes back alongside a percentile against a reference set of approved drugs, so
a prediction can be read as "where does this molecule sit among drugs that
shipped" rather than as a bare float.

It runs on CPU in a fraction of a second per molecule, and the model weights are
shipped inside the package — there is nothing to download at first use and no
service to call.

The part this skill spends most of its length on is **how to read the output**.
The classification heads are calibrated probabilities and behave sensibly. The
regression heads are unbounded linear outputs, and a meaningful fraction of them
return physically impossible values — including for molecules in the tool's own
reference set. Taking those at face value is the mistake this page exists to
prevent.

## What you need before you start

- **A Python 3.11 or newer environment.** No API key, no account, no licence to
  accept, no GPU. ADMET-AI is MIT licensed.
- **Roughly 6 GB of disk.** `pip install admet-ai` pulls PyTorch, and on Linux
  the default PyTorch wheel brings CUDA runtime libraries with it whether or not
  a GPU is present. The measured environment below came to 6.1 GB, of which the
  ADMET-AI package itself — model ensembles and reference set included — is
  20 MB. Installing a CPU-only PyTorch build before ADMET-AI avoids most of that
  bulk; that route was not exercised here, so the figure quoted is for the plain
  install.
- **About a minute of install time**, then roughly 5 seconds of import on each
  first use.

```bash
pip install admet-ai
```

## The 52 properties

`predict` always returns all of them. There is no way to ask for a subset, so
selecting the endpoints you care about is something you do after the call.

**11 physicochemical and structural-alert properties** (RDKit, not learned):
`molecular_weight`, `logP`, `hydrogen_bond_acceptors`, `hydrogen_bond_donors`,
`Lipinski`, `QED`, `stereo_centers`, `tpsa`, `PAINS_alert`, `BRENK_alert`,
`NIH_alert`. `Lipinski` is a **count of rules satisfied out of 4**, not a
boolean, and the three `*_alert` fields are counts of matching substructures,
so zero is the clean result.

**31 classification endpoints**, each a probability in [0, 1]: `AMES`,
`BBB_Martins`, `Bioavailability_Ma`, `CYP1A2_Veith`, `CYP2C19_Veith`,
`CYP2C9_Substrate_CarbonMangels`, `CYP2C9_Veith`,
`CYP2D6_Substrate_CarbonMangels`, `CYP2D6_Veith`,
`CYP3A4_Substrate_CarbonMangels`, `CYP3A4_Veith`, `Carcinogens_Lagunin`,
`ClinTox`, `DILI`, `HIA_Hou`, `PAMPA_NCATS`, `Pgp_Broccatelli`,
`Skin_Reaction`, `hERG`, and the twelve Tox21 assays `NR-AR`, `NR-AR-LBD`,
`NR-AhR`, `NR-Aromatase`, `NR-ER`, `NR-ER-LBD`, `NR-PPAR-gamma`, `SR-ARE`,
`SR-ATAD5`, `SR-HSE`, `SR-MMP`, `SR-p53`.

**10 regression endpoints**, in the units of their training set: `Caco2_Wang`
(log cm/s), `Clearance_Hepatocyte_AZ` and `Clearance_Microsome_AZ` (uL/min/mg),
`Half_Life_Obach` (hours), `HydrationFreeEnergy_FreeSolv` (kcal/mol),
`LD50_Zhu` (log(1/(mol/kg))), `Lipophilicity_AstraZeneca` (logD7.4), `PPBR_AZ`
(percent bound), `Solubility_AqSolDB` (log mol/L), `VDss_Lombardo` (L/kg).

Each property also appears with a `_drugbank_approved_percentile` suffix, giving
104 fields in total.

## The two calling shapes

This is the first thing to get right, because the return type depends on the
argument type rather than on a flag.

```python
from admet_ai import ADMETModel

model = ADMETModel()

one = model.predict(smiles="CC(=O)Oc1ccccc1C(=O)O")
print(type(one), len(one))            # dict, 104 entries keyed by property

many = model.predict(smiles=["CC(=O)Oc1ccccc1C(=O)O",
                             "CN1C=NC2=C1C(=O)N(C)C(=O)N2C"])
print(type(many), many.shape)         # DataFrame, (2, 104), indexed by SMILES
print(many.loc["CN1C=NC2=C1C(=O)N(C)C(=O)N2C", "logP"])
```

A single SMILES string yields a **dict**; a list yields a **DataFrame** whose
index is the input SMILES, not a positional range. Code that handles both has to
branch on the type.

Instantiate `ADMETModel()` once and reuse it. Construction is cheap because
weights load lazily, but each call re-runs the two model ensembles, so batching a
list is far cheaper than looping over single strings.

## Invalid SMILES vanish silently — realign by index, never by position

RDKit-unparseable input is dropped before inference. The run succeeds, a warning
goes to stderr, and the returned DataFrame is **shorter than the list you passed
in**. Zipping the output back onto your input list by position will therefore
mis-assign every row after the first bad one.

```python
from admet_ai import ADMETModel

smis = ["CC(=O)Oc1ccccc1C(=O)O", "not_a_smiles",
        "CN1C=NC2=C1C(=O)N(C)C(=O)N2C", "C1CC"]
out = ADMETModel().predict(smiles=smis)

print(out.shape)                               # (2, 104) — two inputs dropped
missing = [s for s in smis if s not in out.index]
print("dropped:", missing)                     # the two unparseable strings

# Correct: look rows up by the SMILES you asked about.
print(out.loc["CC(=O)Oc1ccccc1C(=O)O", "molecular_weight"])
```

`C1CC` is the quieter half of this: it is a well-formed-looking string with an
unclosed ring, so it is easy to miss in a hand-built list.

If **every** input is invalid the call does not return an empty frame — it fails
inside PyTorch with `TypeError: cat(): argument 'tensors' (position 1) must be
tuple of Tensors, not NoneType`. That message says nothing about SMILES, so
filter with RDKit first when the input is untrusted and you want a diagnosable
failure:

```python
from rdkit import Chem

def keep_parseable(smis):
    good, bad = [], []
    for s in smis:
        (good if Chem.MolFromSmiles(s) is not None else bad).append(s)
    return good, bad

good, bad = keep_parseable(["CC(=O)Oc1ccccc1C(=O)O", "not_a_smiles", "C1CC"])
print(len(good), "parseable;", len(bad), "rejected:", bad)
```

## Percentiles, and what the ATC filter does to the column names

The reference set is **2,845 approved drugs** shipped as a CSV inside the
package, already scored on all 52 properties. A percentile of 13 for `hERG`
means the molecule's predicted hERG liability is lower than that of about 87% of
approved drugs.

Percentiles can be taken against a therapeutic subset instead, and the
`atc_code` argument is misnamed: it expects a lowercase **ATC class name** drawn
from the reference set's own `atc_name_*` columns — `"analgesics"`,
`"nervous system"`, `"dermatologicals"` — of which there are 884. Passing an
actual ATC code raises `ValueError: Invalid ATC code: N02`.

The consequence worth knowing in advance: filtering **renames every percentile
field**, from `<property>_drugbank_approved_percentile` to
`<property>_drugbank_approved_<atc_code>_percentile`. Code that hardcodes the
unfiltered suffix raises `KeyError` the moment someone adds a filter.

```python
from admet_ai import ADMETModel
from admet_ai.constants import DEFAULT_DRUGBANK_PATH
from admet_ai.drugbank import create_atc_code_mapping
import pandas as pd

ref = pd.read_csv(DEFAULT_DRUGBANK_PATH)
print(len(ref), "approved drugs in the reference set")
print(len(create_atc_code_mapping(drugbank=ref)), "distinct ATC class names")

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
whole = ADMETModel().predict(smiles=ASPIRIN)
subset = ADMETModel(atc_code="analgesics").predict(smiles=ASPIRIN)

# The prediction is unchanged; only the reference population moves.
print(whole["hERG"] == subset["hERG"])
print(whole["hERG_drugbank_approved_percentile"])
print(subset["hERG_drugbank_approved_analgesics_percentile"])
```

Build the suffix from the filter you passed rather than writing it out:

```python
suffix = "drugbank_approved_percentile"                     # atc_code=None
suffix = f"drugbank_approved_{'analgesics'}_percentile"     # atc_code set
```

## Read the regression heads through the percentile, not the value

The 10 regression endpoints are unbounded linear outputs. Nothing constrains a
half-life, a volume of distribution or a percent-bound figure to its physically
possible range, and in practice a large minority of them land outside it.

Counted over the 2,845 approved drugs the package ships with its own predictions
already attached:

| endpoint | unit | negative predictions |
|---|---|---|
| `VDss_Lombardo` | L/kg | 996 of 2,845 |
| `Half_Life_Obach` | hours | 633 of 2,845 |
| `Clearance_Hepatocyte_AZ` | uL/min/mg | 430 of 2,845 |
| `PPBR_AZ` | percent bound | 74 of 2,845 |

A negative half-life is not a borderline call; it is impossible. Aspirin, a
molecule nobody would call out of distribution, is predicted at about **-19.7
hours**. `Solubility_AqSolDB` and `Caco2_Wang` are excluded from the table
because they are logarithmic and negative values are the expected case there.

So, for those four endpoints:

- **Use the percentile for ranking**, which is monotone in the raw value and
  stays interpretable even when the value is nonsense.
- **Treat the absolute number as unusable** unless it falls in the physically
  possible range, and say so when you report it.
- **Do not clip to zero.** Clipping hides which predictions were out of range,
  and ranking is what the number is good for anyway.

The classification heads carry no equivalent problem — they are bounded in
[0, 1] by construction.

## Scoring a file from the command line

`admet_predict` takes a CSV, adds the 104 columns and **preserves the columns
already there**, which is what makes it usable on an annotated library.

```bash
printf 'smiles,compound_id\nCC(=O)Oc1ccccc1C(=O)O,CMP-1\nCN1C=NC2=C1C(=O)N(C)C(=O)N2C,CMP-2\n' > library.csv

admet_predict --data_path library.csv --save_path scored.csv --smiles_column smiles

python -c "import pandas as pd; d=pd.read_csv('scored.csv'); print(d.shape); print(d[['compound_id','molecular_weight','hERG']].to_string(index=False))"
```

The CLI and the Python API produce bit-identical numbers; the choice between
them is about where your data already lives. Rows whose SMILES fail to parse are
dropped from the output file exactly as they are from the DataFrame, so compare
the row count of `scored.csv` against your input before joining on it.

## Try it

A self-contained check that this skill still works. The molecules are written by
the block itself — nothing is fetched, so there is no dataset to go stale and
`datasets:` is deliberately empty. Requires `pip install admet-ai` (see *What you
need before you start*).

**Data** — four SMILES strings, inline: aspirin, caffeine and ibuprofen, plus
`not_a_smiles` to route the check through the silent-drop trap rather than
around it.

**Run**

```python
from admet_ai import ADMETModel
from admet_ai.constants import DEFAULT_DRUGBANK_PATH
import pandas as pd

ASPIRIN, CAFFEINE = "CC(=O)Oc1ccccc1C(=O)O", "CN1C=NC2=C1C(=O)N(C)C(=O)N2C"
IBUPROFEN = "CC(C)Cc1ccc(cc1)C(C)C(=O)O"

model = ADMETModel()

# --- shape invariants: the return type follows the argument type ---
one = model.predict(smiles=ASPIRIN)
assert isinstance(one, dict) and len(one) == 104
base = [k for k in one if not k.endswith("_percentile")]
assert len(base) == 52, len(base)

many = model.predict(smiles=[ASPIRIN, "not_a_smiles", CAFFEINE, IBUPROFEN])
assert isinstance(many, pd.DataFrame)
assert many.shape == (3, 104), many.shape          # invalid input silently dropped
assert "not_a_smiles" not in many.index
assert list(many.index) == [ASPIRIN, CAFFEINE, IBUPROFEN]

# --- invariant: classification heads are bounded, regression heads are not ---
CLASSIFICATION = ["AMES", "BBB_Martins", "DILI", "hERG", "Pgp_Broccatelli",
                  "CYP3A4_Veith", "ClinTox", "NR-AR", "SR-MMP", "PAMPA_NCATS"]
assert all(0.0 <= one[k] <= 1.0 for k in CLASSIFICATION)
assert all(0.0 <= p <= 100.0 for k, p in one.items() if k.endswith("_percentile"))

# --- invariant: identical input gives identical output ---
assert model.predict(smiles=ASPIRIN) == one

# --- invariant: the unbounded heads really do leave the possible range ---
ref = pd.read_csv(DEFAULT_DRUGBANK_PATH)
assert len(ref) == 2845, len(ref)
neg = {c: int((ref[c] < 0).sum())
       for c in ["Half_Life_Obach", "VDss_Lombardo", "PPBR_AZ"]}
assert all(v > 0 for v in neg.values()), neg
assert one["Half_Life_Obach"] < 0          # aspirin, impossibly

# --- observed values, admet_ai 2.0.1, checked 2026-10-22 ---
print("aspirin MW        : %.3f" % one["molecular_weight"])
print("aspirin Lipinski  : %.1f of 4" % one["Lipinski"])
print("aspirin hERG      : %.4f (pct %.1f)"
      % (one["hERG"], one["hERG_drugbank_approved_percentile"]))
print("aspirin half-life : %.2f h  <-- impossible, rank on the percentile instead"
      % one["Half_Life_Obach"])
print("caffeine half-life: %.2f h" % many.loc[CAFFEINE, "Half_Life_Obach"])
print("negatives in 2845 approved drugs:", neg)

assert abs(one["molecular_weight"] - 180.159) < 0.01
assert one["Lipinski"] == 4.0
assert abs(one["hERG"] - 0.0208) < 0.005
assert abs(many.loc[CAFFEINE, "Half_Life_Obach"] - 5.19) < 0.5
print("OK")
```

**Expect**

The assertions above are the test; the printed lines are the record. The
invariants — 104 fields of which 52 are properties, a dict for one SMILES and a
DataFrame for a list, three rows returned for four inputs, probabilities within
[0, 1], percentiles within [0, 100], identical input giving identical output, and
at least one negative value in each of the three unbounded endpoints — must hold
on any version. A failure there means this page is wrong.

The observed values are version-stamped and were produced by admet_ai 2.0.1 on
2026-10-22:

```
aspirin MW        : 180.159
aspirin Lipinski  : 4.0 of 4
aspirin hERG      : 0.0208 (pct 13.4)
aspirin half-life : -19.73 h  <-- impossible, rank on the percentile instead
caffeine half-life: 5.19 h
negatives in 2845 approved drugs: {'Half_Life_Obach': 633, 'VDss_Lombardo': 996, 'PPBR_AZ': 74}
```

A mismatch in those numbers after an upstream release is drift to investigate,
not a bug — ADMET-AI v2 retrained every model from scratch, so predictions
already differ from the v1 figures in the paper and from the public web server
built on v1.

## Limits worth stating when you report a result

- **The training sets are small and the chemistry is mostly drug-like.** The TDC
  ADMET collections run from a few hundred to a few thousand molecules. A
  prediction for a peptide, a metal complex, a PROTAC or anything far outside
  that space is an extrapolation, and nothing in the output says so.
- **There is no uncertainty estimate.** The ensembles are averaged into a point
  value; spread is not exposed.
- **Percentiles are relative to approved drugs, not to actives.** A molecule can
  sit at the 99th percentile for solubility among approved drugs and still be
  too insoluble for your assay.
- **v2 predictions are not the paper's.** The published benchmarks and the
  `admet.ai.greenstonebio.com` server are v1 and use RDKit fingerprints
  alongside the graph model; v2 drops those and was retrained. Cite accordingly,
  and do not compare a v2 number to a v1 figure.
- **Two of the names are endpoints, not verdicts.** `DILI` and `ClinTox` are
  trained on small, heavily curated clinical sets, and a high probability is a
  flag for a human to look at, not a finding.

## When not to use this

Reach for something else when the question is about a **specific** measured
property and a measurement exists — look it up rather than predict it. ADMET-AI
is for triaging molecules that have never been made, and for ranking a library
you cannot assay in full. For a molecule already in ChEMBL with human
pharmacokinetic data attached, a prediction is strictly worse information than
the record.

It is also the wrong tool for target affinity. Nothing here models a protein; the
endpoints are properties of the molecule alone.
