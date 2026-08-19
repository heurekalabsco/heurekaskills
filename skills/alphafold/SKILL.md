---
name: alphafold
description: Retrieve predicted protein structures from the AlphaFold database by UniProt accession, and read their confidence metrics correctly — per-residue pLDDT, the PAE matrix for multi-domain proteins, and AlphaMissense variant annotations.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.3.0
tags: [protein-structure, alphafold, uniprot, plddt, pae]
covers: [protein structure, structure prediction, alphafold, uniprot, plddt, pae, alphamissense, missense variants, variant effect, cif, pdb, proteome, human, all organisms]
papers: [PMID:34265844, PMID:34791371, PMID:37733863]
access: [open]
datasets: [https://alphafold.ebi.ac.uk/api/prediction/P04637]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-18
  against: AlphaFold DB model v6 / Python 3.12.8 / requests 2.34.2 / biopython 1.88 / pandas 3.0.5
  executed: 10
  unverified: 0
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
        raise LookupError(
            f"{accession}: no model under this accession — check UniProt for a "
            "primary accession or a DELETED flag before predicting")
    if r.status_code == 400:
        raise ValueError(f"{accession} is not a well-formed UniProt accession")
    r.raise_for_status()
    return r.json()
```

Three response codes carry meaning, and they are different problems:

| code | meaning | what to do |
|---|---|---|
| 200 | at least one record exists — **not** necessarily for the protein you asked for | check `entryId` and length, below |
| 404 | no model under *this* accession | resolve the accession through UniProt, then decide |
| 400 | malformed identifier — body is `{"error": "Invalid identifier format. …"}` | fix it; you probably passed a gene symbol |

`404` is the one that gets mishandled, because "predict it instead" is wrong at least twice:

- **Secondary accessions 404, and the API does not follow the redirect.** `Q15086` is a
  secondary accession of `P04637`. `https://rest.uniprot.org/uniprotkb/Q15086.json` returns
  `primaryAccession: P04637` — which has a model. Retrying under the primary is the fix;
  running a prediction burns compute on a structure you already had.
- **Deleted entries 404.** `A0A5S6R8N3` is `inactiveReasonType: DELETED` in UniProt ("Not part
  of a reference proteome"). There is nothing to predict — the sequence left the database.
- **Sequences over 2700 residues 404** — *sometimes*. See *Proteins with no canonical model*.

On 404, ask UniProt what the accession is before concluding anything.

**The response is a list, it is not always length 1, and it does not always contain the
protein you asked for.** It holds the canonical entry plus one record per UniProt isoform —
nine for `P04637` (TP53). But when AlphaFold declined to model a protein, **the canonical
record is simply missing while the isoform records remain**, and falling back to `records[0]`
hands you a different, shorter protein without a word of warning:

| accession | protein | UniProt length | `records[0]` | you get |
|---|---|---|---|---|
| `P11532` | DMD dystrophin | 3685 | `AF-P11532-9-F1` | 525 aa — 14% |
| `Q8NF91` | SYNE1 nesprin-1 | 8797 | `AF-Q8NF91-9-F1` | 977 aa — 11% |
| `Q09666` | AHNAK | 5890 | `AF-Q09666-2-F1` | 149 aa — 2.5% |
| `Q03001` | DST dystonin | 7570 | `AF-Q03001-3-F1` | 2649 aa — 35% |
| `Q02224` | CENPE | 2701 | `AF-Q02224-3-F1` | 2580 aa — 96% |

`Q02224` is the one to worry about: 96% of the right length passes any eyeball check and is
still the wrong molecule. Match the `entryId` **and** check the length against UniProt —
the `entryId` match is necessary, not sufficient.

```python
def canonical(records, accession):
    """AF-P04637-F1 is canonical; AF-P04637-9-F1 is isoform 9.

    Raises rather than falling back to records[0]; the table above is what that
    fallback returns, silently, for every protein over 2700 residues.
    """
    want = f"AF-{accession}-F1"
    for rec in records:
        if rec["entryId"] == want:
            return rec
    raise LookupError(
        f"{accession}: no canonical model. Got {[r['entryId'] for r in records]} — "
        "isoform and/or third-party records only. Check the UniProt length: above "
        "2700 residues AlphaFold DB has no model of the canonical sequence."
    )


def full_length(rec, accession, timeout=60):
    """Confirm the record covers the whole protein UniProt declares."""
    d = requests.get(f"https://rest.uniprot.org/uniprotkb/{accession}.json"
                     "?fields=accession,sequence", timeout=timeout).json()
    declared = d["sequence"]["length"]
    got = len(rec["uniprotSequence"])
    if got != declared or rec["uniprotStart"] != 1:
        raise ValueError(
            f"{accession}: model covers {rec['uniprotStart']}-{rec['uniprotEnd']} "
            f"({got} aa) of the {declared} aa UniProt declares")
    return rec
```

### Proteins with no canonical model — the 2700-residue limit

AlphaFold DB holds no model for a sequence longer than **2700 residues**. Walking UniProt's
declared lengths, 2026-08-18 against v6:

| accession | protein | length | API | canonical `AF-…-F1`? |
|---|---|---|---|---|
| `P42345` | MTOR | 2549 | 200 | yes |
| `Q02224` | CENPE | 2701 | 200 | **no** — one isoform record |
| `P51587` | BRCA2 | 3418 | 404 | — |
| `P11532` | DMD | 3685 | 200 | **no** — 14 isoform records |
| `Q5VST9` | OBSCN | 7968 | 404 | — |
| `Q8WZ42` | TTN titin | 34350 | 404 | — |

The cutoff is sharp and it surfaces in **two shapes**: `404` when nothing survives, `200` when
isoform records do. Only the first is obvious, and only the second corrupts an analysis.

There is no fragment set to stitch back together either. Older AlphaFold material refers to
`-F1`/`-F2`/`-F3` models for long proteins; under v6 they are gone —
`AF-Q8WZ42-F2-model_v4.cif`, `AF-Q8NF91-F2-model_v4.cif` and `AF-P11532-F1-model_v2.cif` all
404. Do not write a loop that walks `F1, F2, F3…`. If you need the full-length structure of a
protein this long, predict it; the database does not have it under any accession.

## What each record gives you

Fields worth knowing, from a live response:

```
entryId              AF-P04637-F1                     stable model identifier
uniprotAccession     P04637                           echoed back
gene                 TP53
uniprotSequence      MEEPQSDPSV...                    the modelled sequence
uniprotStart/End     1 / 393                          residue range — NOT always 1 / len
providerId           GDM                              who computed it — not always AlphaFold
toolUsed             AlphaFold Monomer v2.0 pipeline
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
rec = full_length(canonical(fetch_prediction("P04637"), "P04637"), "P04637")
open("P04637.cif", "wb").write(requests.get(rec["cifUrl"], timeout=60).content)
```

### Not every record is an AlphaFold model

The endpoint also serves third-party predictions, and neither the URL nor the database name
warns you. `providerId` and `toolUsed` are what distinguish them:

| accession | protein | `providerId` | `toolUsed` | `entryId` |
|---|---|---|---|---|
| `P04637` | TP53 | `GDM` | AlphaFold Monomer v2.0 pipeline | `AF-P04637-F1` |
| `P0DTC2` | SARS-CoV-2 spike | `VR3D` | **ColabFold v1.5.2** | `AF-0000000365840314` |
| `P0DTD1` | SARS-CoV-2 rep1ab | `VR3D` | ColabFold v1.5.2 | `AF-0000000365840311` (one of 28) |

`GDM` is Google DeepMind — a real AlphaFold model. `VR3D` is Viro3D (MRC-University of
Glasgow), computed with ColabFold, carrying `latestVersion: 1` and a numeric `entryId` that
matches no `AF-{accession}-F1` pattern. The whole SARS-CoV-2 proteome arrives this way:
checked 2026-08-18, `AF-P0DTC2-F1-model_v6.cif` and its `_v4` predecessor both 404, so there
is no AlphaFold model of spike to fall back to.

Two consequences:

- **Attribution.** Citing Jumper et al. for a Viro3D record is wrong. The file's own PDB
  header names its reference (Litvin et al., *Mol Syst Biol* 2025, PMID 40958060) and its own
  copyright holder. Read `providerId` before writing a methods section, and check the licence
  on the file rather than assuming the CC-BY-4.0 that covers AlphaFold DB's own models.
- **`entryId` matching.** Code keyed on `AF-{accession}-F1` finds nothing here, so `canonical()`
  raises — which is right. You are not looking at an AlphaFold model, and that should be a
  decision rather than an accident.

## Get the files

Everything above reads the record. This puts the artifacts on disk, which is usually what
you actually wanted — coordinates to open in a viewer, PAE to plot, AlphaMissense to join
against variants.

Take every URL **from the record**, and write a manifest beside the files recording the
model version they came from. A directory of `.cif` files with no version stamp cannot be
compared against a rebuild later, and AlphaFold does rebuild.

```python
import json, os, urllib.request

ACC, OUT = "P04637", "Data/alphafold"
os.makedirs(OUT, exist_ok=True)

recs = json.loads(urllib.request.urlopen(
    f"https://alphafold.ebi.ac.uk/api/prediction/{ACC}", timeout=45).read())
rec = next(r for r in recs if r["entryId"] == f"AF-{ACC}-F1")

wanted = {"cifUrl": "structure.cif", "pdbUrl": "structure.pdb",
          "paeDocUrl": "pae.json", "amAnnotationsUrl": "alphamissense.csv"}

manifest = []
for key, base in wanted.items():
    url = rec.get(key)
    if not url:                      # not every entry has every artifact
        print(f"  {key:18} absent for this entry — skipping")
        continue
    dest = os.path.join(OUT, f"{ACC}_{base}")
    urllib.request.urlretrieve(url, dest)
    manifest.append({"field": key, "url": url, "path": dest,
                     "bytes": os.path.getsize(dest)})
    print(f"  {key:18} {manifest[-1]['bytes']:>10,} bytes -> {dest}")

with open(os.path.join(OUT, f"{ACC}_manifest.json"), "w") as fh:
    json.dump({"accession": ACC, "modelVersion": rec["latestVersion"],
               "provider": rec["providerId"], "tool": rec["toolUsed"],
               "uniprotRange": [rec["uniprotStart"], rec["uniprotEnd"]],
               "files": manifest}, fh, indent=2)
print(f"\n{len(manifest)} files, model version {rec['latestVersion']}, "
      f"provider {rec['providerId']}, residues {rec['uniprotStart']}-{rec['uniprotEnd']}")
```

Run 2026-08-18 against model v6: four files — 363,485 B `.cif`, 254,339 B `.pdb`,
422,267 B PAE, 141,628 B AlphaMissense. Sizes move with each rebuild; the count and the
`absent` branch are the parts that should hold. The `providerId` and range go in the manifest
because they are the two things a rebuild can change under you without changing a filename.

The `next(...)` raises `StopIteration` for an accession with no canonical record — `P11532`,
`Q02224`, `P0DTC2`. That is the intended behaviour: fail rather than write a directory of
files for the wrong protein under the right accession's name.

**`amAnnotationsUrl` is not always there**, which is why the loop skips rather than fails.
Checked 2026-08-18 against v6, it appears only on **canonical human `GDM` records**:

| record | `amAnnotationsUrl` |
|---|---|
| `AF-P04637-F1`, `AF-P10636-F1`, `AF-Q6ZWJ8-F1` (human canonical) | present |
| `AF-Q6ZWJ8-4-F1`, `AF-Q6ZWJ8-2-F1` (human **isoforms**) | absent |
| `AF-P00648-F1`, `AF-Q8W3K0-F1` (bacterial, plant) | absent |
| `AF-0000000365840314` (`P0DTC2`, Viro3D) | absent |

So it is not simply "non-human yields three files" — a human isoform yields three too. Code
that indexes the key directly raises `KeyError` on most of the database. And note what the old
`records[0]` fallback did here: for `P11532` it returned an isoform record, so AlphaMissense
vanished *quietly* along with 86% of dystrophin. Canonical human records also carry
`amAnnotationsHg19Url` and `amAnnotationsHg38Url`, the same table in genome coordinates.

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
offset = rec["uniprotStart"] - 1                       # 0 for a full-length model
plddt = {res.id[1] + offset: next(res.get_atoms()).get_bfactor()
         for res in st.get_residues()}                 # keyed by UniProt position
assert min(plddt) == rec["uniprotStart"] and max(plddt) == rec["uniprotEnd"]
low = [n for n, v in plddt.items() if v < 50]
print(f"{len(low)} of {len(plddt)} residues below 50 pLDDT")
```

**That offset is not decoration — residue numbers in the file restart at 1 regardless of
where the model sits in the protein.** `P0DTD1` record `AF-0000000365840311` declares
`uniprotStart 1368 / uniprotEnd 1493`, and its PDB runs `ATOM 1 N LEU A 1` through
`ATOM 1981 OXT SER A 126`. Mapping a UniProt variant onto that model without the offset lands
you 1367 residues from the residue you meant, and nothing in the output says so. For records
with `uniprotStart == 1` the offset is zero and the line changes nothing — which is exactly
why the bug stays invisible until the day it doesn't.

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
print(len(am), "rows /", len(rec["uniprotSequence"]), "residues =",
      round(len(am) / len(rec["uniprotSequence"]), 3))
```

Expect 19 rows per residue — every substitution but the wild-type. `P04637` gives 7467 =
19 × 393 and `P10636` 14402 = 19 × 758. Check it rather than assuming it: `P0CG48`
(polyubiquitin-C) returns 13034 rows with no duplicates, which is 19 × 686 against the 685
residues UniProt declares. A row count that is not a clean multiple means the AlphaMissense
release and your UniProt sequence version disagree, and a join by position will be off.

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
- **Nothing over 2700 residues.** Not "may be absent": titin (`Q8WZ42`), OBSCN (`Q5VST9`),
  BRCA2 (`P51587`), RYR1 (`P21817`) and DMD (`P11532`) all lack a canonical model, and half of
  them still answer `200`. See *Proteins with no canonical model*.
- **Not every record is AlphaFold's.** Check `providerId`; `VR3D` records are ColabFold
  predictions from Viro3D, under their own citation and copyright.

## When not to use this database

Predict instead of retrieve when you need a complex, a ligand-bound pose, a designed
or mutated sequence, or a sequence with no UniProt entry. Structure prediction and
protein-ligand complexes are a different job from database retrieval — reach for a
prediction model, not this skill.

## Try it

A self-contained check that this skill still works. Public data, no account, no key.

**Data** — UniProt accession `P04637` (human TP53), resolved by the prediction endpoint:

    https://alphafold.ebi.ac.uk/api/prediction/P04637

AlphaFold DB is CC-BY-4.0 and needs no account or licence acceptance. `P04637` is the happy
path — multi-isoform, spanning the full confidence range. The accessions after it are the
counter-examples that broke an earlier version of this skill, asserted so nobody puts the
simplification back. Last confirmed reachable 2026-08-18.

```python
import json, statistics, urllib.request, urllib.error

def api(acc):
    try:
        with urllib.request.urlopen(
                f"https://alphafold.ebi.ac.uk/api/prediction/{acc}", timeout=45) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None

ACC = "P04637"
code, recs = api(ACC)
# NEVER recs[0]: for a protein AlphaFold declined to model, the canonical record is
# absent and recs[0] is a short isoform of a different protein.
entry = next(r for r in recs if r["entryId"] == f"AF-{ACC}-F1")

pdb = urllib.request.urlopen(entry["pdbUrl"], timeout=60).read().decode()
plddt = [float(l[60:66]) for l in pdb.splitlines()
         if l.startswith("ATOM") and l[12:16].strip() == "CA"]

print("entries        :", len(recs))
print("residues       :", len(plddt), "| sequence:", len(entry["uniprotSequence"]))
print("API global     :", entry["globalMetricValue"])
print("recomputed mean: %.2f" % statistics.fmean(plddt))
print("min / max      : %.2f / %.2f" % (min(plddt), max(plddt)))
print("provider       :", entry["providerId"], "|", entry["toolUsed"])

assert len(plddt) == len(entry["uniprotSequence"]) == 393
assert abs(statistics.fmean(plddt) - entry["globalMetricValue"]) < 0.1
assert all(0 <= v <= 100 for v in plddt)
assert entry["providerId"] == "GDM"

# --- the 2700-residue limit, and what records[0] would have handed you ---
assert "AF-P42345-F1" in [r["entryId"] for r in api("P42345")[1]]   # MTOR, 2549 aa: modelled
for acc, declared in [("Q02224", 2701), ("P11532", 3685), ("Q09666", 5890)]:
    code, rs = api(acc)
    assert code == 200 and rs, acc
    assert f"AF-{acc}-F1" not in [r["entryId"] for r in rs], f"{acc} now has a canonical model"
    longest = max(len(r["uniprotSequence"]) for r in rs)
    assert longest < declared
    print(f"{acc}: 200, {len(rs)} record(s), no canonical; longest {longest}/{declared} aa "
          f"({longest/declared:.0%}); records[0] = {len(rs[0]['uniprotSequence'])} aa")

# --- 404 does not mean "predict it": Q15086 is a secondary accession of P04637 ---
assert api("Q15086")[0] == 404
prim = json.loads(urllib.request.urlopen(
    "https://rest.uniprot.org/uniprotkb/Q15086.json?fields=accession", timeout=45).read())
assert prim["primaryAccession"] == "P04637"
print("Q15086         : 404 here, but UniProt resolves it to P04637 — retry, don't predict")

# --- not every record is an AlphaFold model ---
code, viral = api("P0DTC2")
assert viral[0]["providerId"] == "VR3D" and viral[0]["toolUsed"].startswith("ColabFold")
assert not viral[0]["entryId"].startswith("AF-P0DTC2")
print("P0DTC2         :", viral[0]["entryId"], "-", viral[0]["toolUsed"], "(Viro3D, not AlphaFold)")

# --- a sub-range record: file residue numbers are NOT UniProt positions ---
code, rep = api("P0DTD1")
sub = next(r for r in rep if r["uniprotStart"] != 1)
assert len(sub["uniprotSequence"]) == sub["uniprotEnd"] - sub["uniprotStart"] + 1
print(f"P0DTD1         : {len(rep)} records; one covers "
      f"{sub['uniprotStart']}-{sub['uniprotEnd']} of 7096 — add uniprotStart-1 before mapping")
```

**Expect**

Invariants — these hold regardless of model version, and a failure means the skill is wrong:

- The response is a **list**, not a dict. Indexing it as a dict is the most common way to
  misuse this API.
- The canonical entry is found by matching `entryId`, never by position. `Q02224`, `P11532`
  and `Q09666` all answer `200` with **no** canonical record, so `records[0]` there is an
  isoform of a different length — 96%, 14% and 3% of the declared protein respectively. The
  96% case is the dangerous one.
- One pLDDT value per residue: `len(plddt) == len(entry["uniprotSequence"])` (393 here).
- The mean recomputed from the B-factor column matches `globalMetricValue` to within 0.1 —
  this is what confirms pLDDT really is carried in B-factor, rather than assumed.
- Every value lies in 0–100.
- `404` is not "no structure exists anywhere" — `Q15086` 404s and resolves to `P04637`.
- `providerId` is not always `GDM`; a `VR3D` record is a ColabFold model from Viro3D.
- `uniprotStart` is not always 1, and the coordinate file still numbers from 1.

Observed 2026-08-18 against model **v6** (created 2025-08-01) — these move when AlphaFold
rebuilds, so treat a mismatch as drift to investigate, not as a failure:

```
entries        : 9
residues       : 393 | sequence: 393
API global     : 75.06
recomputed mean: 75.05
min / max      : 32.78 / 98.69
provider       : GDM | AlphaFold Monomer v2.0 pipeline
Q02224: 200, 1 record(s), no canonical; longest 2580/2701 aa (96%); records[0] = 2580 aa
P11532: 200, 14 record(s), no canonical; longest 2344/3685 aa (64%); records[0] = 525 aa
Q09666: 200, 1 record(s), no canonical; longest 149/5890 aa (3%); records[0] = 149 aa
Q15086         : 404 here, but UniProt resolves it to P04637 — retry, don't predict
P0DTC2         : AF-0000000365840314 - ColabFold v1.5.2 (Viro3D, not AlphaFold)
P0DTD1         : 28 records; one covers 1368-1493 of 7096 — add uniprotStart-1 before mapping
```


## Sources

- AlphaFold DB — https://alphafold.ebi.ac.uk/
- API — https://alphafold.ebi.ac.uk/api-docs
- UniProt REST — https://rest.uniprot.org/
- Jumper et al. (2021) *Nature* 596, 583-589 — https://doi.org/10.1038/s41586-021-03819-2
- Varadi et al. (2024) *Nucleic Acids Research* 52, D368-D375 — https://doi.org/10.1093/nar/gkad1011

AlphaFold DB data is released by EMBL-EBI and Google DeepMind under CC-BY-4.0 — that covers
`providerId: GDM` records, which is most but not all of what the endpoint serves. Third-party
records carry their own citation and copyright in the file header; Viro3D (`VR3D`) records
name Litvin et al. (2025) *Molecular Systems Biology* 21, 1599 —
https://doi.org/10.1038/s44320-025-00147-9. Cite what actually produced the model.
