---
name: pubchem
description: Resolve compound names, SMILES and InChIKeys to PubChem CIDs and parents, build property tables in batch, run similarity and substructure searches, pull BioAssay results with their depositors, and read annotations with each source's license. PUG-REST rate limits, silent failures and bulk files.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, cheminformatics, drug-discovery, smiles]
covers: [pubchem, ncbi, pug-rest, pug-view, cid, sid, aid, compound, substance, bioassay, small molecule, chemical structure, smiles, inchikey, inchi, iupac name, synonyms, cas number, molecular weight, xlogp, tpsa, lipinski, similarity search, substructure search, tanimoto, salt, parent compound, high-throughput screening, tox21]
papers: [PMID:39558165, PMID:29718389]
access: [open]
datasets: ["https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/imatinib/cids/JSON", "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2244/property/SMILES,ConnectivitySMILES,MolecularWeight,XLogP/JSON", "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/123596/cids/JSON?cids_type=parent", "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/fastsimilarity_2d/cid/5291/cids/JSON?Threshold=90&MaxRecords=100", "https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz.md5"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: PubChem PUG-REST and PUG-View live on 2026-11-06 and the Compound/Extras CID-SMILES.gz of 2026-11-06 / Python 3.12.2 standard library only / curl 8.7 / macOS arm64, no key
  executed: 7
  unverified: 0
---

# PubChem — compounds, identifiers, properties and screening results

PubChem is NCBI's open chemistry database. It has three linked collections:

- **Substances (SID).** What each depositor submitted, as they submitted it. One depositor
  record is one SID.
- **Compounds (CID).** PubChem's standardized structures, made from those substances.
  Many SIDs collapse into one CID: imatinib (CID 5291) is backed by 42 substance records
  that carry bioassay results.
- **BioAssays (AID).** Experiments deposited by screening centers, journals,
  pharmaceutical companies and other databases, with an outcome for each substance tested.

For a scientist, PubChem is first an identifier hub. It turns a drug name, a SMILES or an
InChIKey into one stable record, with computed properties, synonyms and cross-references.
Second, it is a store of screening results, including the inactives that curated
databases leave out. This skill covers both, and the places where each quietly gives a
wrong answer.

**What you need: nothing.** PUG-REST, PUG-View and the FTP site are anonymous. There is no
key. **The limit is 5 requests per second and 400 per minute**, plus a cap on server
running time. Going over returns HTTP 503 with `PUGREST.ServerBusy`. Every response carries
an `X-Throttling-Control` header (`Request Count status: Green (0%) ...`). Back off when it
turns yellow or red. On 2026-11-06, a burst of 15 parallel requests got 5 of them
refused.

Where PubChem's data overlaps a curated source, use that source. For measured affinities
with assay context, use `chembl` or `bindingdb`. Both deposit into PubChem, so pooling them
with PubChem counts the same measurement twice (see BioAssay below). For what a compound
has been *reported to do*, mined from the literature and keyed by CID, use `pubchef`.

## Terms of use: PubChem's own data is open, each depositor's is not necessarily

PubChem itself places no restrictions on use, and its computed data (structures, CIDs,
computed properties) is free for any purpose, commercial included. Much of PubChem,
though, is **deposited** content, and NCBI's policy says that anyone reusing or
redistributing it must follow the terms its copyright holder sets. In practice:

- **Annotations** (PUG-View: indications, pharmacology, toxicity, safety) carry a license
  per source. On imatinib's record on 2026-11-06, the 156 references included DrugBank
  under **CC BY-NC 4.0**, StatPearls under **CC BY-NC-ND 4.0**, the WHO Essential
  Medicines list under **CC BY-NC-SA 3.0 IGO**, and ECHA under its own legal notice. **That
  text is not usable commercially.** 37 of the 156 references stated no license at all. The
  annotation block below prints each item's license next to it. Keep that column, and
  filter on it before reusing any text.
- **BioAssay rows** carry their depositor's terms. ChEMBL's deposits are CC BY-SA 3.0, with
  attribution and share-alike if you redistribute a derived table. On imatinib, 4,470 of
  5,469 bioassay rows came from ChEMBL.
- Cite PubChem (the 2025 update paper, PMID 39558165) and record the retrieval date.
  PubChem changes daily.

This page is original text, CC-BY-4.0, by Heureka Labs.

## PUG-REST in one paragraph

`https://pubchem.ncbi.nlm.nih.gov/rest/pug/<domain>/<namespace>/<identifiers>/<operation>/<format>`.
For example, `compound/name/imatinib/cids/JSON` or
`compound/cid/2244/property/MolecularWeight,XLogP/CSV`. Use **POST** with a form field
(`name=`, `smiles=`, `inchikey=`, `cid=`) rather than putting identifiers in the path.
SMILES contain `/`, `#` and `\`, which break a URL, and a POSTed list has no length
problem: 10,000 CIDs in one property request returned in under a second on 2026-11-06.
An unknown identifier returns HTTP 404 with a `Fault` JSON (`PUGREST.NotFound`, `No CID
found`). A malformed request returns 400 `PUGREST.BadRequest`.

The helper below paces requests to 4 per second, retries a busy server with backoff,
turns `NotFound` into an exception you can catch, and drops the CID 0 that PubChem returns
for an unknown SMILES (see below). Later blocks import it:

```bash
cat > pubchem_api.py <<'PY'
"""PubChem PUG-REST: paced requests, retries on 'server busy', one identifier at a time where order matters."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
PAUSE = 0.25          # PubChem asks for at most 5 requests/s and 400/min
_last = [0.0]


class NotFound(Exception):
    pass


def request(path, data=None, params=None, tries=6):
    url = f"{PUG}/{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    body = urllib.parse.urlencode(data).encode() if data else None
    for i in range(tries):
        wait = PAUSE - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=180) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            fault = json.loads(e.read() or b"{}").get("Fault", {})
            if e.code == 404 or fault.get("Code") == "PUGREST.NotFound":
                raise NotFound(fault.get("Message", "not found"))
            if e.code in (500, 502, 503, 504) and i < tries - 1:   # 503 = PUGREST.ServerBusy
                time.sleep(2 ** i)
                continue
            raise RuntimeError(f"{e.code} {fault.get('Code')}: {fault.get('Message')} {fault.get('Details', '')}")


def cids_for(query, kind):
    """CIDs for one name, SMILES, InChIKey or CID. Unknown SMILES come back as CID 0, so drop it."""
    if kind == "cid":
        return [int(query)]
    if kind == "name":
        out = request("compound/name/cids/JSON", data={"name": query})
    elif kind == "smiles":
        out = request("compound/smiles/cids/JSON", data={"smiles": query})
    elif kind == "inchikey":
        out = request("compound/inchikey/cids/JSON", data={"inchikey": query})
    else:
        raise ValueError(kind)
    return [c for c in out["IdentifierList"]["CID"] if c]


def parent_of(cid):
    """The parent compound PubChem assigns (salt and solvent removed); None when there is none."""
    try:
        got = request(f"compound/cid/{cid}/cids/JSON", params={"cids_type": "parent"})
    except NotFound:
        return None
    return got["IdentifierList"]["CID"][0]


def properties(cids, props, chunk=1000):
    rows = []
    cids = sorted(set(cids))
    for i in range(0, len(cids), chunk):
        part = cids[i:i + chunk]
        got = request(f"compound/cid/property/{','.join(props)}/JSON",
                      data={"cid": ",".join(map(str, part))})
        rows += got["PropertyTable"]["Properties"]
    return {r["CID"]: r for r in rows}
PY
python3 -c "import pubchem_api as p; print(p.cids_for('imatinib mesylate','name'), p.parent_of(123596))"
```

Prints `[123596] 5291`: the salt, then its parent.

## Resolving identifiers: where it goes wrong

Each of these was observed on 2026-11-06:

| trap | what happens | do this |
|---|---|---|
| **A name resolves to one CID, and it may not be the form you meant** | `glucose` gives CID 5793 (D-glucopyranose, anomer unspecified). α-D-glucopyranose is 79025 and open-chain D-glucose is 107526. `name_type=word` returns every CID whose synonyms contain the word, 3,373 for `glucose` | resolve by structure when stereo matters, and compare on the InChIKey's first block (`WQZGKKKJIJFFOK`), which is the same for all stereo forms |
| **Salt and parent are different compounds** | `imatinib mesylate` is CID 123596 and `imatinib` is 5291. Bioassay results, synonyms and properties sit on different records | map every CID to its parent with `cids/JSON?cids_type=parent` and describe the parent |
| **An unknown SMILES is not an error** | `compound/smiles/cids` returns `{"CID": [0]}` with HTTP 200 | treat 0 as no match. The helper drops it |
| **Stereo in, stereo out** | racemic thalidomide SMILES gives CID 5426. The same SMILES with `[C@@H]` gives 75792 | decide whether your list carries stereo before matching |
| **Batch lookups lose your order** | POSTing two InChIKeys returned `[5291, 2244]` whatever order they were sent in | ask for `property/InChIKey` and join back on the key, or resolve one at a time |
| **A comma list of names is one name** | `name=aspirin,imatinib` returns NotFound | names and SMILES go one per request |
| **Old SMILES property names are renamed in the reply** | `CanonicalSMILES` comes back as `ConnectivitySMILES` (no stereo). `IsomericSMILES` comes back as `SMILES` (with stereo). Code reading the old key gets `KeyError`, or `None` from `.get()` | request `SMILES` and `ConnectivitySMILES` by their current names |
| **Missing properties are absent, not null** | `XLogP` is simply not in the row for imatinib mesylate or sodium chloride | use `.get()`, and count what was absent |
| **Types are mixed** | `MolecularWeight` is a JSON string (`"180.16"`). `XLogP` and `TPSA` are numbers | convert before arithmetic |

### A property table for your compound list

Input is a TSV with a `query` column and a `kind` column (`name`, `smiles`, `inchikey` or
`cid`). Output is `<input>.pubchem.csv`, one row per input and CID, with properties
describing the **parent** compound. Alongside it goes `<input>.pubchem.provenance.json`,
which records how each query resolved and which properties were missing. Unmatched
queries stay in the table with an empty CID:

```bash
printf 'query\tkind\nimatinib mesylate\tname\naspirin\tname\nglucose\tname\nO=C1CCC(N2C(=O)c3ccccc3C2=O)C(=O)N1\tsmiles\nKTUFNOKKBVMGRW-UHFFFAOYSA-N\tinchikey\nsodium chloride\tname\n2244\tcid\nnot-a-compound-xyz\tname\nCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCN(C)C(=O)c1ccccc1F\tsmiles\n' > compounds.tsv
cat > pubchem_table.py <<'PY'
"""Resolve a list of compounds to PubChem CIDs and their parents, and write a property table."""
import csv
import json
import sys
from datetime import date

from pubchem_api import NotFound, cids_for, parent_of, properties

PROPS = ["MolecularFormula", "MolecularWeight", "SMILES", "ConnectivitySMILES", "InChIKey",
         "IUPACName", "XLogP", "TPSA", "HBondDonorCount", "HBondAcceptorCount",
         "RotatableBondCount", "HeavyAtomCount", "Charge"]
src = sys.argv[1]
stem = src.rsplit(".", 1)[0]

rows, status = [], {}
with open(src) as fh:
    for q in csv.DictReader(fh, delimiter="\t"):
        try:
            cids = cids_for(q["query"], q["kind"])
        except NotFound:
            cids = []
        status[q["query"]] = "no match" if not cids else ("one CID" if len(cids) == 1 else f"{len(cids)} CIDs")
        for cid in cids or [None]:
            rows.append({"query": q["query"], "kind": q["kind"], "cid": cid,
                         "parent_cid": parent_of(cid) if cid else None})

wanted = {r["cid"] for r in rows if r["cid"]} | {r["parent_cid"] for r in rows if r["parent_cid"]}
props = properties(wanted, PROPS)
missing = {p: sorted(c for c, v in props.items() if p not in v) for p in PROPS}
with open(f"{stem}.pubchem.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=["query", "kind", "cid", "parent_cid", "is_parent"] + PROPS)
    w.writeheader()
    for r in rows:
        p = props.get(r["parent_cid"] or r["cid"], {})       # describe the parent, not the salt
        w.writerow({**r, "is_parent": r["cid"] is not None and r["cid"] == r["parent_cid"],
                    **{k: p.get(k, "") for k in PROPS}})
prov = {"source": "PubChem PUG-REST", "retrieved": date.today().isoformat(),
        "properties_describe": "the parent compound when PubChem assigns one, else the CID itself",
        "resolution": status,
        "properties_absent_for_cids": {k: v for k, v in missing.items() if v}}
with open(f"{stem}.pubchem.provenance.json", "w") as fh:
    json.dump(prov, fh, indent=2)
print(json.dumps(prov["resolution"], indent=1))
for r in rows:
    p = props.get(r["parent_cid"] or r["cid"], {})
    print(f"{r['query'][:34]:34} cid={r['cid']} parent={r['parent_cid']} {p.get('MolecularFormula', '')} {p.get('InChIKey', '')}")
PY
python3 pubchem_table.py compounds.tsv
```

On 2026-11-06:

```
imatinib mesylate                  cid=123596 parent=5291 C29H31N7O KTUFNOKKBVMGRW-UHFFFAOYSA-N
aspirin                            cid=2244 parent=2244 C9H8O4 BSYNRYMUTXBXSQ-UHFFFAOYSA-N
glucose                            cid=5793 parent=5793 C6H12O6 WQZGKKKJIJFFOK-GASJEMHNSA-N
O=C1CCC(N2C(=O)c3ccccc3C2=O)C(=O)N cid=5426 parent=5426 C13H10N2O4 UEJJHQNACJXSKW-UHFFFAOYSA-N
KTUFNOKKBVMGRW-UHFFFAOYSA-N        cid=5291 parent=5291 C29H31N7O KTUFNOKKBVMGRW-UHFFFAOYSA-N
sodium chloride                    cid=5234 parent=None ClNa FAPWRFPIFSIZLT-UHFFFAOYSA-M
2244                               cid=2244 parent=2244 C9H8O4 BSYNRYMUTXBXSQ-UHFFFAOYSA-N
not-a-compound-xyz                 cid=None parent=None
CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC cid=None parent=None
```

The resolution summary printed before these lines reads `one CID` for seven queries and
`no match` for the last two. Sodium chloride has no parent: PubChem assigns none for a
simple inorganic salt, so its row describes the CID itself, and the provenance file lists
it, with the mesylate, under `properties_absent_for_cids` for `XLogP`. Resolution makes
one or two requests per query at 4 per second, so 1,000 names take about eight minutes.
The property step is one request per 1,000 CIDs.

## Similar and containing structures

`fastsimilarity_2d` returns CIDs whose PubChem 2D fingerprint has a Tanimoto score of at
least `Threshold` (default 90) with the query. `fastsubstructure` returns CIDs containing
the query as a substructure. Both are synchronous. **Both stop at `MaxRecords` and do not
say so.** A result list exactly `MaxRecords` long is truncated. Raise the limit or narrow
the query. The order of the returned CIDs is not a ranking, and no score is returned. If
you need the scores, compute them yourself on the SMILES, with whatever fingerprint you
trust. They will not match PubChem's fingerprint.

```python
import csv
from pubchem_api import properties, request

QUERY = "CC1=C(C=C(C=C1)NC(=O)C2=CC=C(C=C2)CN3CCN(CC3)C)NC4=NC=CC(=N4)C5=CN=CC=C5"   # imatinib
THRESHOLD, MAX = 90, 2000
for kind, path in [("similar", "fastsimilarity_2d"), ("contains", "fastsubstructure")]:
    got = request(f"compound/{path}/smiles/cids/JSON", data={"smiles": QUERY},
                  params={"Threshold": THRESHOLD, "MaxRecords": MAX} if kind == "similar" else {"MaxRecords": MAX})
    cids = got["IdentifierList"]["CID"]
    print(f"{kind}: {len(cids)} CIDs" + ("  <- hit MaxRecords, the list is truncated" if len(cids) >= MAX else ""))
    props = properties(cids, ["MolecularWeight", "XLogP", "InChIKey", "SMILES"])
    with open(f"imatinib_{kind}.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["CID", "MolecularWeight", "XLogP", "InChIKey", "SMILES"])
        w.writeheader()
        w.writerows(props[c] for c in cids)
```

On 2026-11-06: `similar: 2000 CIDs  <- hit MaxRecords, the list is truncated` and
`contains: 1165 CIDs`, written to `imatinib_similar.csv` and `imatinib_contains.csv`. By
CID rather than SMILES, the same threshold returned 2,944 CIDs. Without `MaxRecords`, a
quinoline substructure search returned exactly 1,000,000, which is the server's own
ceiling, not the true count.

## BioAssay results for a compound

`compound/cid/<cid>/assaysummary/CSV` returns one row per tested substance per assay. The
columns are `AID`, `SID`, `Activity Outcome` (Active, Inactive, Inconclusive or
Unspecified), `Target Accession`, `Activity Value [uM]`, `Activity Name` (IC50, Kd, GI50,
Potency …), `Assay Type` (Confirmatory, Screening, Summary, Other) and `PubMed ID`. It does
**not** say who deposited the assay, and that decides what a row is worth. The block below
attaches each assay's depositor from `assay/aid/summary`:

```bash
cat > pubchem_bioactivity.py <<'PY'
"""All PubChem BioAssay results for one CID, with each assay's depositor attached."""
import csv
import io
import sys
import urllib.request
from collections import Counter

from pubchem_api import PUG, request

CID = sys.argv[1]
with urllib.request.urlopen(f"{PUG}/compound/cid/{CID}/assaysummary/CSV", timeout=300) as r:
    rows = list(csv.DictReader(io.StringIO(r.read().decode())))
aids = sorted({r["AID"] for r in rows}, key=int)
source = {}
for i in range(0, len(aids), 200):
    got = request("assay/aid/summary/JSON", data={"aid": ",".join(aids[i:i + 200])})
    source.update({str(s["AID"]): s.get("SourceName", "") for s in got["AssaySummaries"]["AssaySummary"]})
for r in rows:
    r["Source"] = source.get(r["AID"], "")

with open(f"pubchem_cid{CID}_bioactivity.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print(f"CID {CID}: {len(rows)} results in {len(aids)} assays, {len({r['SID'] for r in rows})} substance records")
print("outcome:", dict(Counter(r["Activity Outcome"] for r in rows)))
print("assay type:", dict(Counter(r["Assay Type"] for r in rows)))
print("depositor:", dict(Counter(r["Source"] for r in rows).most_common(5)))
act = [r for r in rows if r["Activity Outcome"] == "Active" and r["Target Accession"]]
print("active, by target:", dict(Counter(r["Target Accession"] for r in act).most_common(5)))
PY
python3 pubchem_bioactivity.py 5291
python3 pubchem_bioactivity.py 2244
```

On 2026-11-06, in about a minute for imatinib:

```
CID 5291: 5469 results in 4663 assays, 42 substance records
outcome: {'Inactive': 1014, 'Active': 1028, 'Inconclusive': 166, 'Unspecified': 3261}
assay type: {'Confirmatory': 3599, 'Other': 1673, 'Screening': 197}
depositor: {'ChEMBL': 4470, 'NCGC': 408, 'DTP/NCI': 230, 'Abbott Labs': 164, 'BindingDB': 54}
active, by target: {'P00519': 195, 'P10721': 137, 'P11274': 74, 'P16234': 23, 'P09619': 15}
CID 2244: 6194 results in 4071 assays, 107 substance records
outcome: {'Inactive': 3606, 'Inconclusive': 419, 'Active': 160, 'Unspecified': 2009}
assay type: {'Confirmatory': 2585, 'Other': 2730, 'Screening': 601, 'Summary': 278}
depositor: {'ChEMBL': 2110, '30476': 1263, 'NCGC': 1135, '824': 898, 'DTP/NCI': 180}
active, by target: {'P05979': 26, 'P79208': 16, 'P35354': 9, 'ACA62796': 4, 'P23219': 3}
```

How to read it:

- **Most of a drug's rows are other databases' rows.** 82% of imatinib's come from ChEMBL
  and a few from BindingDB. Those ChEMBL rows are mostly `Unspecified` outcome: a value with
  no active/inactive call. Drop `ChEMBL` and `BindingDB` rows when combining with those
  sources, and get the curated values from them directly.
- **PubChem's own strength is screening:** NCGC qHTS, the NCI-60 panel (`DTP/NCI`), Tox21
  and ToxCast. These carry real inactives, which a structure–activity table usually lacks.
  `SourceName` is sometimes a number rather than a name. On 2026-11-06, `824` held the
  Tox21 qHTS assays and `30476` the EPA ToxCast ones. The assay descriptions say so.
- **One CID is tested as many substances.** A row is per SID, so the same compound can be
  Active in one sample and Inactive in another sample in the same assay. Count per AID, not
  per row.
- `Activity Value [uM]` is whatever the depositor reported, in µM, under the type in
  `Activity Name`. A GI50 is not an IC50. Keep the type as a column.
- An `Active` call means active by *that depositor's* criterion, which differs between
  centers. For a single-concentration screen it is a hit, not a potency.

## Annotations, with the license of each line

PUG-View (`/rest/pug_view/data/compound/<cid>/JSON?heading=<section>`) returns the text
sections shown on a compound page, such as Drug Indication, Pharmacology, Toxicity or GHS
Classification. Each item points to a reference that carries `LicenseNote` and/or
`LicenseURL`:

```bash
cat > pubchem_annotations.py <<'PY'
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

CID, HEADING = sys.argv[1], sys.argv[2]
url = (f"https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/{CID}/JSON?"
       + urllib.parse.urlencode({"heading": HEADING}))
try:
    with urllib.request.urlopen(url, timeout=120) as r:
        rec = json.load(r)["Record"]
except urllib.error.HTTPError as e:
    raise SystemExit(f"{e.code}: no section {HEADING!r} for CID {CID} (use a heading from the record's table of contents)")
refs = {r["ReferenceNumber"]: r for r in rec.get("Reference", [])}


def items(sections):
    for s in sections:
        for info in s.get("Information", []):
            yield s["TOCHeading"], info
        yield from items(s.get("Section", []))


out = []
for heading, info in items(rec["Section"]):
    ref = refs.get(info.get("ReferenceNumber"), {})
    value = info.get("Value", {})
    text = " ".join(m.get("String", "") for m in value.get("StringWithMarkup", []))
    if "ExternalTableName" in value:
        text = f"(table {value['ExternalTableName']}, not inlined)"
    out.append({"heading": heading, "source": ref.get("SourceName"), "text": text,
                "license_url": ref.get("LicenseURL"), "license_note": ref.get("LicenseNote")})
with open(f"pubchem_cid{CID}_{HEADING.replace(' ', '_')}.json", "w") as fh:
    json.dump(out, fh, indent=1)
for o in out:
    lic = o["license_note"] or o["license_url"] or "NO LICENSE STATED"
    print(f"{o['source'][:34]:34} {lic[:70]:70} {o['text'][:50]!r}")
PY
python3 pubchem_annotations.py 5291 "Drug Indication"
```

On 2026-11-06:

```
ChEMBL                             Access to the web interface of ChEMBL is made under the EBI's Terms of '(table chembl_drug_indications, not inlined)'
DrugBank                           Creative Common's Attribution-NonCommercial 4.0 International License  'Imatinib is indicated for the treatment of adult a'
DrugBank                           Creative Common's Attribution-NonCommercial 4.0 International License  'FDA Label'
StatPearls                         This book is distributed under the terms of the Creative Commons Attri 'Imatinib mesylate (Imatinib) is an oral tyrosine k'
```

The JSON file keeps the full text and both license fields. Some items are a pointer to a
table (`ExternalTableName`) rather than text. A heading the record lacks returns HTTP 400
`PUGVIEW.BadRequest`, and the script exits with a message. Without `heading=`, the whole
record comes back: 750 kB for imatinib.

## Get the files

The property table, similarity lists, bioassay CSVs and annotation JSON above are all
written to disk. For every compound at once, use the FTP extras. They are regenerated
continually, each with an `.md5`. Sizes on 2026-11-06: `CID-SMILES.gz` 1.4 GB,
`CID-InChI-Key.gz` 6.9 GB, `CID-Parent.gz` 521 MB, `CID-Synonym-filtered.gz` 1.0 GB, `CID-MeSH` 2.9 MB.
**Ask the user before a multi-gigabyte download.** This block fetched and verified
`CID-SMILES.gz` in about 20 seconds on a fast link:

```bash
BASE=https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras
FILE=CID-SMILES.gz                              # about 1.4 GB; CID <tab> SMILES, every live compound
curl -fsS -O "$BASE/$FILE.md5"
want=$(awk '{print $1}' "$FILE.md5")
have=$( (md5sum "$FILE" 2>/dev/null || md5 -r "$FILE" 2>/dev/null) | awk '{print $1}')
if [ "$have" != "$want" ]; then
  curl -fS -C - -O "$BASE/$FILE" || { rm -f "$FILE"; curl -fS -O "$BASE/$FILE"; }
  have=$( (md5sum "$FILE" 2>/dev/null || md5 -r "$FILE") | awk '{print $1}')
fi
[ "$have" = "$want" ] && echo "$FILE OK" || { echo "checksum mismatch: delete $FILE and rerun" >&2; exit 1; }
gzip -dc "$FILE" | head -2
gzip -dc "$FILE" | awk -F'\t' '$1 == 2244 || $1 == 5291 {print; n++} n == 2 {exit}'
```

```
CID-SMILES.gz OK
1	CC(=O)OC(CC(=O)[O-])C[N+](C)(C)C
2	CC(=O)OC(CC(=O)O)C[N+](C)(C)C
2244	CC(=O)OC1=CC=CC=C1C(=O)O
5291	CC1=C(C=C(C=C1)NC(=O)C2=CC=C(C=C2)CN3CCN(CC3)C)NC4=NC=CC(=N4)C5=CN=CC=C5
```

The file is sorted by CID, and its SMILES include stereo, like the `SMILES` property.
`CID-Parent.gz` maps every CID to its parent, so you can do the salt-to-parent step from
the section above for a whole library without one request per compound. Full SDF
structure sets are under `pubchem/Compound/CURRENT-Full/`, in files of 500,000 CIDs each.

## Try it

**Data.** The live PUG-REST service, which is anonymous and needs no key. The block
resolves imatinib, its mesylate salt and the salt's parent, and it hits five of the traps
above on purpose: CID 0 for an unknown SMILES, renamed SMILES keys, string-typed numbers,
order-losing batch lookups, and silent truncation at `MaxRecords`. It prints results and
writes nothing. PubChem's own computed data has no use restriction. Confirmed reachable on
2026-11-06. Python 3 standard library only.

**Run.** In an empty directory:

```bash
cat > pubchem_check.py <<'PY'
import json, time, urllib.error, urllib.parse, urllib.request

PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"

def get(path, data=None, **params):
    time.sleep(0.25)                                   # at most 5 requests per second
    url = f"{PUG}/{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    body = urllib.parse.urlencode(data).encode() if data else None
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 503 or i == 4:                # 503 is PUGREST.ServerBusy: back off and retry
                raise
            time.sleep(2 ** i)

cids = lambda d: d["IdentifierList"]["CID"]

# 1. Names resolve to one CID each; the salt and the parent are different compounds.
imatinib = cids(get("compound/name/cids/JSON", data={"name": "imatinib"}))
salt = cids(get("compound/name/cids/JSON", data={"name": "imatinib mesylate"}))
parent = cids(get(f"compound/cid/{salt[0]}/cids/JSON", cids_type="parent"))
assert len(imatinib) == 1 and salt != imatinib and parent == imatinib

# 2. A SMILES PubChem has never seen is not an error: it returns CID 0.
unseen = cids(get("compound/smiles/cids/JSON", data={"smiles": "C" * 40 + "N(C)C(=O)c1ccccc1F"}))
assert unseen == [0], unseen

# 3. The old SMILES property names are accepted but answered under the new keys,
#    and some numbers come back as strings.
p = get("compound/cid/2244/property/CanonicalSMILES,IsomericSMILES,MolecularWeight,XLogP/JSON")["PropertyTable"]["Properties"][0]
assert set(p) == {"CID", "ConnectivitySMILES", "SMILES", "MolecularWeight", "XLogP"}, sorted(p)
assert isinstance(p["MolecularWeight"], str) and isinstance(p["XLogP"], float)

# 4. A batch lookup does not keep your order, so join back on a returned key.
keys = ["KTUFNOKKBVMGRW-UHFFFAOYSA-N", "BSYNRYMUTXBXSQ-UHFFFAOYSA-N"]      # imatinib, aspirin
batch = cids(get("compound/inchikey/cids/JSON", data={"inchikey": ",".join(keys)}))
table = get("compound/inchikey/property/InChIKey/JSON", data={"inchikey": ",".join(keys)})["PropertyTable"]["Properties"]
by_key = {r["InChIKey"]: r["CID"] for r in table}
assert set(batch) == set(by_key.values()) and [by_key[k] for k in keys] == [imatinib[0], 2244]

# 5. Fast searches stop at MaxRecords and do not say so.
capped = cids(get(f"compound/fastsimilarity_2d/cid/{imatinib[0]}/cids/JSON", Threshold=90, MaxRecords=100))
assert len(capped) == 100

active = get("compound/cid/2244/aids/JSON", aids_type="active")["InformationList"]["Information"][0]["AID"]
print(f"imatinib CID {imatinib[0]}; 'imatinib mesylate' CID {salt[0]}, parent {parent[0]}")
print(f"unseen SMILES -> {unseen}; aspirin MW {p['MolecularWeight']!r}, XLogP {p['XLogP']}, keys {sorted(p)}")
print(f"InChIKey batch returned {batch}; rejoined in input order -> {[by_key[k] for k in keys]}")
print(f"similarity at 90 with MaxRecords=100 -> {len(capped)} CIDs (truncated); aspirin active in {len(active)} assays")
PY
python3 pubchem_check.py
```

**Expect.** Run cold three times on 2026-11-06, about 5 seconds each:

```
imatinib CID 5291; 'imatinib mesylate' CID 123596, parent 5291
unseen SMILES -> [0]; aspirin MW '180.16', XLogP 1.2, keys ['CID', 'ConnectivitySMILES', 'MolecularWeight', 'SMILES', 'XLogP']
InChIKey batch returned [5291, 2244]; rejoined in input order -> [5291, 2244]
similarity at 90 with MaxRecords=100 -> 100 CIDs (truncated); aspirin active in 149 assays
```

*Invariants*, asserted, so a failure means the skill is wrong:

- A name gives one CID, and the salt's parent is the free base.
- An unseen SMILES gives `[0]`.
- `CanonicalSMILES` and `IsomericSMILES` come back as `ConnectivitySMILES` and `SMILES`.
- `MolecularWeight` is a string and `XLogP` a number.
- Joining on the returned InChIKey restores input order.
- A similarity search capped at 100 returns exactly 100.

*Observed values, 2026-11-06*. These move as PubChem grows, so a mismatch is drift:

- The CIDs above are stable identifiers and should not change.
- Aspirin is active in 149 assays.
- The order of the batch response.

The resolver was also run on aspirin, glucose, racemic and (S)-thalidomide, sodium
chloride, an InChIKey, a CID and two unmatchable queries. The bioassay block was run on
imatinib and aspirin, and the annotation block on imatinib, aspirin and ibuprofen.

## Sources

- PubChem — <https://pubchem.ncbi.nlm.nih.gov/>
- PUG-REST documentation — <https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest>
- PUG-View documentation — <https://pubchem.ncbi.nlm.nih.gov/docs/pug-view>
- Usage policies and limits — <https://pubchem.ncbi.nlm.nih.gov/docs/programmatic-access>
- PubChem data sources and their terms — <https://pubchem.ncbi.nlm.nih.gov/sources/>
- NCBI website and data usage policies — <https://www.ncbi.nlm.nih.gov/home/about/policies/>
- FTP — <https://ftp.ncbi.nlm.nih.gov/pubchem/>
- Kim S, et al. PubChem 2025 update. *Nucleic Acids Res.* 2025;53(D1):D1516–D1525. PMID 39558165
- Kim S, et al. An update on PUG-REST: RESTful interface for programmatic access to PubChem.
  *Nucleic Acids Res.* 2018;46(W1):W563–W570. PMID 29718389
