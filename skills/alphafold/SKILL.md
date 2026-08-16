---
name: alphafold
description: Retrieve predicted protein structures from the AlphaFold database by UniProt accession, and read their confidence metrics correctly — per-residue pLDDT, the PAE matrix for multi-domain proteins, and AlphaMissense variant annotations.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.1.0
tags: [protein-structure, alphafold, uniprot, plddt, pae]
datasets: [https://alphafold.ebi.ac.uk/api/prediction/P04637]
allowed-tools: Read, Write, Edit, Bash
verified: pending
---
# AlphaFold Protein Structure Database

The AlphaFold DB (EMBL-EBI) serves precomputed structure predictions covering most
of UniProt. This skill is about **retrieving and correctly interpreting** those
predictions.

It is not a prediction service. If the sequence you care about is not in the
database — a designed protein, a mutant, a complex, anything with a ligand — you
need to run a predictor instead. See *When not to use this database* at the end.

Confidence interpretation is the part people get wrong, and it is where a wrong
answer does real damage: a confidently-reported structure with a pLDDT of 40 is a
guess presented as a result.

## Fetching a prediction

One endpoint, keyed by UniProt accession. No authentication, no API key.

```bash
curl -s "https://alphafold.ebi.ac.uk/api/prediction/P04637"
```

```python
import requests

def fetch_prediction(accession, timeout=30):
    r = requests.get(
        f"https://alphafold.ebi.ac.uk/api/prediction/{accession}", timeout=timeout
    )
    if r.status_code == 404:
        raise LookupError(f"{accession} has no AlphaFold model")
    if r.status_code == 400:
        raise ValueError(f"{accession} is not a well-formed UniProt accession")
    r.raise_for_status()
    return r.json()
```

Three response codes carry meaning, and they are different problems:

| code | meaning | what to do |
|---|---|---|
| 200 | modelled | proceed |
| 404 | valid accession, no model | do not retry; predict it instead |
| 400 | malformed accession | fix the identifier — you probably passed a gene symbol |

**The response is a list, and it is not always length 1.** It contains the canonical
entry plus one record per UniProt isoform. For P04637 (TP53) it returns nine. The
canonical entry is the one whose `entryId` has no isoform suffix:

```python
def canonical(records, accession):
    """AF-P04637-F1 is canonical; AF-P04637-9-F1 is isoform 9."""
    want = f"AF-{accession}-F1"
    for rec in records:
        if rec["entryId"] == want:
            return rec
    return records[0]          # some accessions only ever return isoforms
```

Taking `records[0]` blindly usually works and sometimes silently hands you an
isoform with a different sequence length. Match the `entryId`.

## What each record gives you

Fields worth knowing, from a live response:

```
entryId              AF-P04637-F1                     stable model identifier
uniprotAccession     P04637                           echoed back
gene                 TP53
uniprotSequence      MEEPQSDPSV...                    the modelled sequence
uniprotStart/End     1 / 393                          residue range of this model
globalMetricValue    75.06                            MEAN pLDDT over the model
fractionPlddtVeryHigh 0.527                           fraction of residues >90
fractionPlddtConfident 0.071                          70-90
fractionPlddtLow     0.104                            50-70
fractionPlddtVeryLow 0.298                            <50
latestVersion        6                                model version
cifUrl / pdbUrl / bcifUrl                             coordinates
paeDocUrl            ...predicted_aligned_error_v6.json
plddtDocUrl          ...confidence_v6.json
amAnnotationsUrl     ...aa-substitutions.csv          AlphaMissense
```

Download coordinates straight from the URL in the record rather than composing the
filename yourself — the version suffix moves (`_v4` in older material, `_v6` at time
of writing), and a hand-built URL silently rots.

```python
rec = canonical(fetch_prediction("P04637"), "P04637")
open("P04637.cif", "wb").write(requests.get(rec["cifUrl"], timeout=60).content)
```

## Reading pLDDT

pLDDT is a **per-residue** confidence score from 0-100. In the PDB file it is stored
in the **B-factor column** — every atom of a residue carries that residue's score.
This is a repurposing of the field, not a real B-factor. Any tool that colours by
B-factor is colouring by confidence, which is usually what you want, but never report
it as a temperature factor.

The four bands, matching the `fractionPlddt*` fields above:

| pLDDT | band | how to treat it |
|---|---|---|
| > 90 | very high | backbone and side chains both reliable |
| 70-90 | confident | backbone reliable, side chains less so |
| 50-70 | low | treat as a hypothesis; fold may be roughly right |
| < 50 | very low | do not interpret as structure — often intrinsic disorder |

```python
from Bio.PDB import PDBParser

st = PDBParser(QUIET=True).get_structure("af", "P04637.pdb")
plddt = {res.id[1]: next(res.get_atoms()).get_bfactor() for res in st.get_residues()}
low = [n for n, v in plddt.items() if v < 50]
print(f"{len(low)} of {len(plddt)} residues below 50 pLDDT")
```

Two things pLDDT is not:

- **It is not accuracy.** It is the model's confidence. High-confidence errors exist.
- **A low score is information, not a failure.** Very low pLDDT correlates with
  intrinsic disorder. TP53 above is 30% very-low because its transactivation and
  regulatory regions are genuinely disordered — the model is right to be unsure.

Never report a mean pLDDT alone. `globalMetricValue` of 75 hides that this protein
is half very-high and a third very-low. Report the band distribution, or the pLDDT
over the region you actually care about.

## Reading PAE — required for anything multi-domain

Predicted Aligned Error answers a question pLDDT cannot: *if I align on residue i,
how wrong is residue j?* High pLDDT in two domains tells you nothing about whether
their **relative placement** is right. PAE does.

```python
pae = requests.get(rec["paeDocUrl"], timeout=60).json()[0]
matrix = pae["predicted_aligned_error"]        # N x N, angstroms, list of lists
print(len(matrix), "residues; max PAE", pae["max_predicted_aligned_error"])
```

The document is a **list containing one object** — index `[0]` before reading keys.

Interpretation: low PAE (dark on the standard plot) between two regions means their
relative position is confident. A block-diagonal pattern with high off-diagonal
values means each domain is individually well predicted but their arrangement is
not — treat the domains as separate rigid bodies and ignore the linker geometry.

If you are docking, measuring an inter-domain distance, or describing a binding site
that spans domains, check PAE first. Skipping this is the single most common way an
AlphaFold model gets over-interpreted.

## Going from a gene symbol to an accession

The API takes accessions only; a gene symbol returns HTTP 400. Resolve it first:

```bash
curl -s "https://rest.uniprot.org/uniprotkb/search?query=gene:TP53+AND+organism_id:9606+AND+reviewed:true&fields=accession,id,protein_name&format=tsv"
# Entry   Entry Name   Protein names
# P04637  P53_HUMAN    Cellular tumor antigen p53 ...
```

Always constrain by `organism_id` and `reviewed:true`. An unconstrained gene search
returns homologues across species and unreviewed TrEMBL entries, and picking the
first hit is how you end up modelling the wrong organism's protein.

## AlphaMissense annotations

Records include `amAnnotationsUrl`, a CSV of predicted pathogenicity for every
possible single amino-acid substitution:

```python
import pandas as pd
am = pd.read_csv(rec["amAnnotationsUrl"])       # protein_variant, am_pathogenicity, am_class
```

These are predictions of variant effect, not clinical determinations. They do not
substitute for ClinVar or a clinical genetics assessment, and they should never be
presented to a patient-facing decision.

## Limits worth stating in a write-up

- **One conformation.** No alternative states, no apo/holo pair, no conformational
  ensemble. A model is one snapshot of a molecule that may have several.
- **No ligands, cofactors, metals, or post-translational modifications.** A model of
  a metalloprotein has no metal in it.
- **Single chains.** Database entries are monomers; complexes are not covered.
- **Not mutation-aware.** The model is of the canonical sequence. You cannot read a
  point mutant's structure off it, and swapping the residue in the file is not a
  prediction.
- **Very long proteins may be absent.** Titin (Q8WZ42) returns 404.

## When not to use this database

Predict instead of retrieve when you need a complex, a ligand-bound pose, a designed
or mutated sequence, or a sequence with no UniProt entry. Structure prediction and
protein-ligand complexes are a different job from database retrieval — reach for a
prediction model, not this skill.

## Try it

A self-contained check that this skill still works. Public data, no account, no key.

**Data** — UniProt accession `P04637` (human TP53), resolved by the prediction endpoint:

    https://alphafold.ebi.ac.uk/api/prediction/P04637

AlphaFold DB is CC-BY-4.0 and needs no account or licence acceptance. Any accession works;
this one is used because it is multi-isoform and spans the full confidence range.
Last confirmed reachable 2026-08-11.

```python
import json, statistics, urllib.request

ACC = "P04637"
rec = json.loads(urllib.request.urlopen(
    f"https://alphafold.ebi.ac.uk/api/prediction/{ACC}", timeout=45).read())

# The endpoint returns a LIST — canonical entry plus one record per isoform.
entry = rec[0]
# ...and rec[0] is the canonical entry only by server ordering, which is not promised.
# Assert it, or an isoform with a different length silently becomes your answer.
assert entry["entryId"] == f"AF-{ACC}-F1", entry["entryId"]

pdb = urllib.request.urlopen(entry["pdbUrl"], timeout=60).read().decode()
plddt = [float(l[60:66]) for l in pdb.splitlines()
         if l.startswith("ATOM") and l[12:16].strip() == "CA"]

print("entries        :", len(rec))
print("residues       :", len(plddt), "| sequence:", len(entry["uniprotSequence"]))
print("API global     :", entry["globalMetricValue"])
print("recomputed mean: %.2f" % statistics.fmean(plddt))
print("min / max      : %.2f / %.2f" % (min(plddt), max(plddt)))
```

**Expect**

Invariants — these hold regardless of model version, and a failure means the skill is wrong:

- `rec` is a **list**, not a dict. Indexing it as a dict is the single most common way to
  misuse this API.
- `rec[0]` really is the canonical entry — the `entryId` assertion is what proves it. Order
  is server behaviour, not a documented guarantee, and every other invariant below holds for
  an isoform too, so nothing else here would notice a reorder.
- One pLDDT value per residue: `len(plddt) == len(entry["uniprotSequence"])` (393 here).
- The mean recomputed from the B-factor column matches `globalMetricValue` to within 0.1 —
  this is what confirms pLDDT really is carried in B-factor, rather than assumed.
- Every value lies in 0–100.

Observed 2026-08-11 against model **v6** (created 2025-08-01) — these move when AlphaFold
rebuilds, so treat a mismatch as drift to investigate, not as a failure:

- 9 entries · 393 residues · `globalMetricValue` 75.06 · recomputed 75.05 · range 32.78–98.69


## Sources

- AlphaFold DB — https://alphafold.ebi.ac.uk/
- API — https://alphafold.ebi.ac.uk/api-docs
- UniProt REST — https://rest.uniprot.org/
- Jumper et al. (2021) *Nature* 596, 583-589 — https://doi.org/10.1038/s41586-021-03819-2
- Varadi et al. (2024) *Nucleic Acids Research* 52, D368-D375 — https://doi.org/10.1093/nar/gkad1011

AlphaFold DB data is released by EMBL-EBI and Google DeepMind under CC-BY-4.0.
Cite the papers above when you use a model in published work.
