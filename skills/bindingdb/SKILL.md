---
name: bindingdb
description: BindingDB measured protein–ligand affinities (Ki, IC50, Kd, EC50) — query by UniProt or compound, stream one target's set from the monthly TSV with each row's licence, keep > and < values as bounds, and avoid double counting with ChEMBL.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, drug-discovery, cheminformatics, binding-affinity]
covers: [bindingdb, binding affinity, protein-ligand, ki, ic50, kd, ec50, pki, pic50, inhibitor, small molecule, ligand, target, uniprot, us patent, medicinal chemistry, sar, structure-activity relationship, qsar, training data, drug discovery, kinase, enzyme inhibition, censored values, chembl overlap, ucsd, egfr, nik, map3k14, imatinib]
papers: [PMID:39574417, PMID:26481362]
access: [open]
datasets: ["https://www.bindingdb.org/rwd/bind/BindingDB_UniProt.txt", "https://bindingdb.org/rest/getLigandsByUniprots?uniprot=Q99558&response=application/json"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-22
  against: BindingDB monthly release 202610 (TSV files dated 2026-09-29; release notes 2026-10-05 name ChEMBL 37 as the imported release) and the live BindingDB REST services / ChEMBL_37 REST API for the overlap block / Python 3.12 standard library only / macOS arm64
  executed: 7
  unverified: 0
---

# BindingDB — measured protein–ligand binding affinities

BindingDB is a public database of measured binding affinities between proteins and small,
drug-like molecules, run from UC San Diego. Its own staff curate values out of journal articles
and, in volume, out of US patents. It also imports ChEMBL's protein-target rows, selected PubChem
confirmatory assays, the PDSP Ki database and a few smaller sets. On 2026-10-22 its front page
counted 3,248,380 measurements, 1,446,269 compounds and 11,516 targets, and said 1.6 million of
those were curated by BindingDB's own curators. That headline is broader than it sounds. It
matches every row the 202610 dump does not label `ChEMBL` (1,585,423), which includes imports
from PubChem, PDSP Ki, CSAR, D3R and a lab deposit. The rows labelled as BindingDB's own
curation — literature, US patents and WIPO patents — are 1,451,073. The difference matters for
redistribution, and the next section says why.

Use it next to ChEMBL, not instead of it. Its distinctive content is the patent data: series
from granted US patents that often never appear in a paper. Its weak point is the same as its
strength. A large part of it is ChEMBL, and ChEMBL in turn imports BindingDB's patent data, so a
table built from both double counts unless you remove the overlap (see **Overlap with ChEMBL**).
For ChEMBL itself, the `chembl` skill covers the target mapping, pChEMBL and its validity flags.

**What you need: nothing.** The web services and the download files are anonymous. The website's
search-result "Make Data Set" download asks for a free registration; this skill does not use it.

## Licence: split by where each row came from

Checked at source on 2026-10-22. BindingDB's Info page (<https://www.bindingdb.org/rwd/bind/info.jsp>)
says:

> Data imported from ChEMBL are provided under their Creative Commons Attribution-Share Alike 3.0
> Unported License. All data curated by BindingDB staff are provided under the Creative Commons
> Attribution 3.0 License.

The licence link for the curated data points at CC BY 3.0 United States
(<https://creativecommons.org/licenses/by/3.0/us/>). The download policy shown before a
search-result download adds the obligations:

> Data curated by BindingDB are made available subject to a Creative Commons Attribution License,
> so long as BindingDB is cited. Data in BindingDB from ChEMBL are subject to a Creative Commons
> Attribution-Share Alike License, which, in addition to citation of ChEMBL, also requires that
> any collection or product based on ChEMBL data be redistributed under the same Share Alike
> license.

The Info page also says what counts as curated by BindingDB: "data extracted from the literature
and patents by the BindingDB project". The TSV files label those rows `Curated from the literature
by BindingDB`, `US Patent` and `WIPO`. The 2024 database paper settles the WIPO case, which the
Info page leaves implicit: BindingDB "also curate[s] selected recent WIPO ... patents of particular
interest", and the paper's Table 1 counts "BDB US Patents" and "BDB WIPO Patents" under the
footnote "Rows marked BDB list data curated by the BindingDB project." This skill treats all three
labels as BindingDB-curated.

**The two sources name different versions of that licence, and a redistributor should know.** The
Info page and the download policy both say Creative Commons Attribution 3.0, linking the 3.0 US
port; the 2024 paper says "data curated by BindingDB are shared under the Creative Commons
Attribution 4.0 License (CC BY 4.0)". Both are attribution-only, both allow commercial reuse and
redistribution, and neither adds a condition the other lacks, so nothing about what you may do
turns on it. The skill's provenance files record CC BY 3.0 US, because that is what the database's
own pages say today, beside the data they govern, while the paper is fixed at its publication
date. Cite BindingDB either way, and note the disagreement rather than asserting one version.

What that means for a reader:

- **Commercial use is allowed for both kinds of row.** Neither licence has a non-commercial
  clause. The obligations are attribution, and share-alike for the ChEMBL rows.
- **Cite BindingDB** for anything built from it. The policy names the 2015 paper; the 2024
  paper is newer (see Sources). The policy prints the 2015 paper's pages as `D0145-D1053`; they
  are D1045–D1053.
- **ChEMBL rows carry share-alike.** If you distribute a table that contains them, it goes out
  under CC BY-SA 3.0 (or a compatible later version), with ChEMBL credited. Analysis you keep
  inside your organisation does not trigger share-alike. Whether a model trained on the data is
  an adaptation is not settled by the licence text, and this skill does not decide it.
- **Every other source has no licence stated by BindingDB.** PubChem, PDSP Ki, CSAR, D3R and
  the Taylor lab deposit are neither "curated by BindingDB staff" nor "imported from ChEMBL".
  BindingDB's licence statement does not cover them (its D3R page asks users to cite D3R and
  disclaims liability, which is not a licence). They are 134,350 rows of the 202610 dump, 4.1%,
  and they are the gap between the two counts in the paragraph above. This skill leaves those
  rows out of every file it writes, counts them in the provenance record, and lets you opt in
  (`INCLUDE_UNSTATED = True`) for analysis you keep to yourself after checking the original
  source's terms.

The licence is decided **per row**, from the `Curation/DataSource` column of the TSV files. The
file a row comes in does not decide it: the file named `BindingDB_Articles` holds ChEMBL rows
too (see **Reading a TSV row**). The web services report no source at all, so a web-service pull
has to be treated as mixed. If you will redistribute anything, build it from the TSV files.

This page is original text, CC-BY-4.0, by Heureka Labs. It republishes no BindingDB data beyond a
few counts and values quoted as observations.

## Which release you are reading

The download files are rebuilt about monthly and carry the release in their name:
`BindingDB_All_202610_tsv.zip` is the 202610 release, built on 2026-09-29. **Only the current
release is on the server.** Checked on 2026-10-22: the previous month's
`BindingDB_BindingDB_Articles_202509_tsv.zip` returns HTTP 404, so a hard-coded file name stops
working within weeks. Read the release off the download page instead, which lists the current file
names as plain HTML. Every block below that downloads anything starts with these lines:

```bash
DL=https://www.bindingdb.org/rwd/bind/chemsearch/marvin/Download.jsp
PAGE=$(curl -fsS --retry 4 --retry-delay 5 "$DL") \
  || { echo "refusing: cannot read $DL (the server answers 503 under load; try again)" >&2; exit 1; }
REL=$(printf '%s' "$PAGE" | grep -oE '/rwd/bind/downloads/BindingDB_All_[0-9]{6}_tsv\.zip' \
       | grep -oE '[0-9]{6}' | sort -u | tail -1)
case "$REL" in 2[0-9][0-9][0-9][01][0-9]) ;; *)        # nothing parsed: refuse, never guess
  echo "refusing: no BindingDB_All release name on $DL (read '$REL')" >&2; exit 1 ;; esac
echo "current release: $REL"
printf '%s' "$PAGE" | grep -oE 'BDB_rn[0-9-]+\.txt' | sort -u | tail -2
```

Run each block here as a script (`bash block.sh`, or let an agent run it), not by pasting it into
an interactive shell: the guards refuse with `exit`, which would close an interactive shell.

On 2026-10-22 this printed `current release: 202610`, then `BDB_rn2026-08-22.txt` and
`BDB_rn2026-10-05.txt`. The refusal is not decoration: the same page answered HTTP 503 twice
during this session's testing, and with the guard a bad fetch stops the block instead of
producing a wrong file name. Parse the release from the file family you are about to
download, rather than assuming every family shares one release.

Release notes live at `https://www.bindingdb.org/rwd/bind/downloads/rnotes/<name>` and say what
each update added and which ChEMBL release was imported (the 2026-10-05 notes: ChEMBL 37). Each
zip has an `.md5` file next to it holding the bare hash with no file name, so `md5sum -c` will
not read it; compare the hash yourself, as the blocks below do.

For a version you must cite exactly, BindingDB points to its quarterly long-term archive at the
UC San Diego Library (<https://library.ucsd.edu/dc/collection/bb03870458>); that host did not
answer from here on 2026-10-22, so the archive is named but not tested.

The web services answer from the live database and report no release. Record the date of every
web-service pull.

## The web services

Base `https://bindingdb.org/rest/`. Three services matter, and each returns a different JSON
shape:

| service | asks for | top-level key | fields per row |
|---|---|---|---|
| `getLigandsByUniprots?uniprot=A,B` | every affinity for one or more UniProt accessions | `getLindsByUniprotsResponse` → `affinities` | `query` (target name), `monomerid` (string), `smile`, `affinity_type`, `affinity`, `pmid`, `doi` |
| `getLigandsByPDBs?pdb=A,B&identity=92` | affinities for proteins similar to a PDB entry | `getLindsByPDBsResponse` → `affinities` | as above |
| `getTargetByCompound?smiles=…&cutoff=0.85` | targets of compounds similar to a SMILES | `getLindsByUniprotResponse` → `bdb.affinities` | `bdb.monomerid` (integer), `bdb.smiles`, `bdb.target`, `bdb.species`, `bdb.affinity_type`, `bdb.affinity` |

The keys really are spelled `getLinds…`, and the compound service reuses the UniProt service's
key. Add `response=application/json`. Behaviours confirmed live on 2026-10-22:

| behaviour | consequence |
|---|---|
| `affinity` is a **string** that can start with `>` or `<` (and, in the singular `getLigandsByUniprot` service, with spaces) | parse the qualifier; never `float()` it blind |
| The `cutoff` is compared with the **bare number**; the qualifier is ignored | `cutoff=1000` on NIK returned 63 rows such as `Ki >1.2`, which says nothing about potency. Ask without a cutoff and filter locally |
| A non-numeric `cutoff` is ignored, not rejected | `cutoff=abc` returned the uncut set |
| An unknown accession returns **HTTP 200 with an empty list**, the same as a real protein with no data | check the accession's format before asking, and treat empty as "unknown or no data" |
| The singular `getLigandsByUniprot` returns an **empty body** for an unknown accession | `json.loads` fails on it; test for an empty body first |
| A UniProt query also returns rows for **multichain targets** containing that protein; `query` names the target | EGFR (`P00533`) gave 32,363 rows, 780 of them for "Receptor tyrosine-protein kinase erbB-2" complexes |
| No source, organism or assay, and `query` is the target name **without** BindingDB's construct annotation | the licence of a row cannot be told, and mutant constructs look like wild type: all 31,583 EGFR rows were named plain "Epidermal growth factor receptor", while the TSV puts 7,935 EGFR measurements on variant constructs |
| Rows that look identical can be separate measurements | 77 of NIK's 2,092 rows match another on compound, type, value and document; the TSV gives each its own reactant set, so do not deduplicate on these fields |
| Large targets are slow, and how slow varies | EGFR's 9.4 MB answer took 195 seconds here and 250 on another host. The helper below allows 600 seconds; budget three to five minutes |

The documentation says the default format is XML. On 2026-10-22 both UniProt services returned
JSON without the `response` parameter. Ask for JSON explicitly anyway.

This helper handles the qualifier, the accession check, the empty answers and retries. The later
blocks import it, so run them from the same directory:

```bash
cat > bindingdb_rest.py <<'PY'
"""A small BindingDB web-service client: JSON, accession checks, qualifier-aware values."""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

REST = "https://bindingdb.org/rest"
UNIPROT = re.compile(r"[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2}")
VALUE = re.compile(r"\s*([<>]=?|~)?\s*([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*")


def get_json(service, params, tries=4, timeout=600):
    url = f"{REST}/{service}?" + urllib.parse.urlencode({**params, "response": "application/json"},
                                                         safe=",;")
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                body = r.read()
            if not body.strip():                  # some services answer "no match" with an empty body
                return None
            return json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code < 500 or i == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if i == tries - 1:
                raise
        time.sleep(3 * (i + 1))


def parse_affinity(text):
    """'>10000' -> ('>', 10000.0); ' 3' -> ('=', 3.0). nM throughout. Refuses anything else."""
    m = VALUE.fullmatch(text or "")
    if not m:
        raise ValueError(f"unparseable affinity {text!r}")
    value = float(m.group(2))
    if value <= 0:
        raise ValueError(f"non-positive affinity {text!r}")
    return m.group(1) or "=", value


def ligands_for_uniprot(accession):
    """Every affinity BindingDB's web service holds for one UniProt accession, uncut.

    Pass no cutoff: the service compares the cutoff with the bare number and ignores the
    qualifier, so '>10000' passes a cutoff of 10000. Filter locally instead."""
    if not UNIPROT.fullmatch(accession):
        raise SystemExit(f"refusing: {accession!r} is not a UniProt accession")
    doc = get_json("getLigandsByUniprots", {"uniprot": accession})
    rows = (doc or {}).get("getLindsByUniprotsResponse", {}).get("affinities", [])
    if not rows:
        raise SystemExit(f"no BindingDB rows for {accession}; the service gives the same empty "
                         "answer for an accession with no data and for one it does not know")
    out = []
    for r in rows:
        rel, nm = parse_affinity(r["affinity"])
        out.append({"monomerid": r["monomerid"], "smiles": r["smile"], "type": r["affinity_type"],
                    "relation": rel, "value_nM": nm, "pmid": r["pmid"], "doi": r["doi"],
                    "target": r["query"]})
    return out
PY
python3 -c "
from collections import Counter
from bindingdb_rest import ligands_for_uniprot
rows = ligands_for_uniprot('Q99558')                      # NIK (MAP3K14), human
print(len(rows), 'rows;', len({r['monomerid'] for r in rows}), 'compounds')
print(sorted(Counter((r['type'], r['relation']) for r in rows).items()))
for bad in ('Q00000', 'q99558'):
    try:
        ligands_for_uniprot(bad)
    except SystemExit as e:
        print(e)
"
```

On 2026-10-22 this printed:

```
2092 rows; 1663 compounds
[(('IC50', '<'), 127), (('IC50', '='), 946), (('IC50', '>'), 88), (('Kd', '='), 18), (('Kd', '>'), 10), (('Ki', '<'), 1), (('Ki', '='), 834), (('Ki', '>'), 68)]
no BindingDB rows for Q00000; the service gives the same empty answer for an accession with no data and for one it does not know
refusing: 'q99558' is not a UniProt accession
```

`Q00000` has a valid format and no entry, so it gets through the format check and is caught by
the empty-answer check. A lower-case accession is refused before any request is sent.

### By compound

`getTargetByCompound` takes a SMILES and a Tanimoto cutoff and returns, for each similar
compound, its targets and affinities. Target names carry BindingDB's construct annotations
(see the next section), so mutants and truncated domains show up as separate targets:

```python
from collections import Counter
from bindingdb_rest import get_json, parse_affinity

IMATINIB = "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1"
doc = get_json("getTargetByCompound", {"smiles": IMATINIB, "cutoff": 1.0})
if doc is None:                              # an empty body: no answer, not "no targets"
    raise SystemExit("getTargetByCompound returned an empty body; try again later")
body = next(iter(doc.values()))              # the key is 'getLindsByUniprotResponse', even here
hits = body["bdb.affinities"]
print(len(hits), "rows;", len({h["bdb.monomerid"] for h in hits}), "compound(s);",
      len({(h["bdb.target"], h["bdb.species"]) for h in hits}), "target/species pairs")
rel = Counter(parse_affinity(h["bdb.affinity"])[0] for h in hits)
print("types", dict(Counter(h["bdb.affinity_type"] for h in hits)), "relations", dict(rel))
best = sorted((parse_affinity(h["bdb.affinity"])[1], h["bdb.affinity_type"], h["bdb.target"], h["bdb.species"])
              for h in hits if parse_affinity(h["bdb.affinity"])[0] == "=")[:5]
for nm, t, target, sp in best:
    print(f"  {t} {nm:g} nM  {target} ({sp})")
```

On 2026-10-22:

```
61 rows; 1 compound(s); 57 target/species pairs
types {'Kd': 44, 'Ki': 8, 'IC50': 9} relations {'>': 44, '=': 17}
  Kd 2 nM  Tyrosine-protein kinase ABL1 [201-500] (Human)
  Ki 14 nM  Breakpoint cluster region protein/Tyrosine-protein kinase ABL1 (Human)
  IC50 40 nM  Tyrosine-protein kinase ABL1/ABL2 (Human)
  Kd 40 nM  Tyrosine-protein kinase ABL1 [201-500,Y253F] (Human)
  Kd 100 nM  Tyrosine-protein kinase ABL1 [201-500,E255K] (Human)
```

**This service sees a small part of the data.** Every row came back from one monomer and one
source label (`bdb.inhibitor` is `Cobweb_bdb` on all 61). In the 202610 TSV dump the same
InChIKey has 1,223 rows under three monomer ids, 1,103 of them imported from ChEMBL. Use the
service to find targets, and the TSV files to count measurements.

The service is also the least reliable of the three. For about half an hour on 2026-10-22 this
request, and every other SMILES tried, came back as HTTP 200 with an empty body, while the
UniProt service kept answering; it then recovered and returned the output above again. The
download page answered HTTP 503 twice in the same window. Treat an empty body as "ask again
later", not as "no targets" — the block exits with a message rather than reading it as zero
hits.

## Reading a TSV row

The TSV files hold one binding measurement per row, with the ligand, the target, the value and
the source, and links to other databases. Several things in them are not what the format
document (BindingDB-TSV-Format.pdf, dated July 7, 2025) leads you to expect:

- **Width.** The document says the number of columns varies with the number of protein chains.
  In the 202610 files every row is padded to the header's 640 columns: 40 fixed columns, then 12
  per chain for 50 chains. Read chain columns by header name, and tolerate short rows anyway.
- **Values.** The four affinity columns are `Ki (nM)`, `IC50 (nM)`, `Kd (nM)` and `EC50 (nM)`,
  all nanomolar. The document mentions `>X`. The files also carry `<X`, `> X` with a space, and
  leading spaces on plain numbers (` 0.543`). Across the 202610 dump the only qualifiers are `>`
  and `<`; no `~`, `>=` or `<=` appeared. 262 cells hold zero (`0.000`, `>0.000`, `0.000000`), which cannot go on a log scale;
  the builder drops and counts them.
- **More than one value per row.** A row can fill two or three of the four columns, and some rows
  fill none (kinetics or thermodynamics only). Split a row into one measurement per filled
  column, and never put an IC50 and a Ki on one axis.
- **Repeated rows.** Some `BindingDB Reactant_set_id` values appear on two to four lines that are
  identical in every column. The Articles subset file has 190 such lines over 122 ids; the 202610
  full dump had none. Drop exact repeats.
- **Source.** `Curation/DataSource` holds exact strings, and the format document's list
  (`BindingDB, ChEMBL, PubChem, PDSP Ki, CSAR, PubChem AID, or Deposited by Author`) does not
  match them, so map them as written. In the 202610 full dump, of 3,243,660 rows: `ChEMBL`
  1,658,237; `US Patent` 1,349,222; `PubChem` 102,553; `Curated from the literature by BindingDB` 93,085; `PDSP Ki` 27,715; `WIPO`
  8,766; `D3R` 2,990; `CSAR` 818; `Taylor Research Group, UCSD` 274. Just over half of BindingDB
  is ChEMBL.
- **Constructs.** `Target Name` is the UniProt name plus BindingDB's annotation in square
  brackets: residue ranges for truncated constructs (`[201-500]`), point mutations
  (`[201-500,Y253F]`), insertions as quoted residues (`[1-770,'NPG',771-1210]`) and internal
  deletions as two ranges (`[1-745,751-1210]`). Some point mutations sit in parentheses
  instead (`Tyrosine-protein kinase ABL1 (Q252H)`), and a few ABL1 rows carry only the mutation
  as the target name (`E255K`). Brackets and parentheses also occur in ordinary names
  (`[flavin-containing]`, `(NOD2)`), so test the tokens, not the presence of a bracket. Mutant
  constructs still carry the wild-type UniProt accession: in the Articles file, 4,979 rows with a
  bracketed point mutation had a SwissProt accession on their chain. Filtering on the accession
  does not remove mutants.
- **Complexes.** `Number of Protein Chains in Target` above 1 marks a multichain target, and each
  chain has its own accession columns. A complex's value is not evidence about one subunit.
- **The ITC file's header is broken.** `BindingDB_ITC_202610_tsv.zip` has a first line of `null`
  fields, so read its columns by position from another file's header.

### Censored values

`>` means the true value is larger than the number: `Ki >10000` is "no measurable binding at the
highest concentration tested", not a Ki of 10 µM. `<` is the reverse. On a −log10 scale the
inequality flips: Ki > 10,000 nM is pKi < 5. The builder below keeps censored values as bounds
in their own column on the p scale (`<5.00`), and keeps `~` values, if any appear, in a column of
their own. It never puts a bound into a median. Dropping them without a trace biases a table
toward the compounds that worked; treating them as measured values biases it the other way.

## Overlap with ChEMBL

The two databases feed each other:

- BindingDB imports ChEMBL rows whose target is a protein, labelled `ChEMBL` in
  `Curation/DataSource`.
- ChEMBL imports BindingDB's patent data as its source 37 (`BindingDB Patent Bioactivity Data`,
  "bioactivity data … extracted from more than 1000 granted US patents published from 2013
  onwards").

For NIK (`Q99558`, ChEMBL target `CHEMBL5888`), 1,353 of the 1,899 ChEMBL_37 activities the block
below counts (Ki, IC50, Kd and EC50, in nM) are source 37, that is, BindingDB patent rows. BindingDB's 202610 NIK set has 2,092
measurements: 1,483 from US patents, 477 imported from ChEMBL and 132 from WIPO patents. Of
those, 1,514 match a ChEMBL activity (block below), so a naive pool of the two lists them twice.

So before you pool the two:

1. drop BindingDB rows whose source is `ChEMBL`, and take those measurements from ChEMBL itself;
2. drop ChEMBL rows with `src_id` 37, or the BindingDB `US Patent` rows they duplicate;
3. match what remains on document (DOI, PMID or patent number), the InChIKey's first block, type
   and value, and keep one copy.

This block counts the overlap for one target. It reads the measurement file the builder below
writes and queries ChEMBL's API, so run it after the builder:

```bash
cat > bindingdb_chembl_overlap.py <<'PY'
"""How much of one target's BindingDB set is already in ChEMBL, and the reverse."""
import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter

MEASUREMENTS = sys.argv[1]            # bindingdb_<ACC>_<release>_measurements.csv from the builder
CHEMBL_TARGET = sys.argv[2]           # the matching ChEMBL single-protein target, e.g. CHEMBL5888
HOST = "https://www.ebi.ac.uk"
API = HOST + "/chembl/api/data"


def get(url):
    for i in range(5):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)
        except Exception:
            if i == 4:
                raise
            time.sleep(2 * (i + 1))


def every(resource, **params):
    page = get(f"{API}/{resource}.json?" + urllib.parse.urlencode({**params, "limit": 1000}))
    key = next(k for k in page if k != "page_meta")
    rows = list(page[key])
    while page["page_meta"]["next"]:
        page = get(HOST + page["page_meta"]["next"])
        rows += page[key]
    return rows


def by_ids(resource, field, ids, only):
    ids, out = sorted(set(ids)), []
    for i in range(0, len(ids), 100):
        out += every(resource, **{f"{field}__in": ",".join(ids[i:i + 100]), "only": only})
    return out


def doc_keys(doi="", pmid="", patent=""):
    keys = set()
    if doi:
        keys.add("doi:" + doi.strip().lower())
    if pmid:
        keys.add("pmid:" + str(pmid).strip())
    m = re.search(r"(\d{6,})", patent or "")
    if m:
        keys.add("patent:" + m.group(1).lstrip("0"))
    return keys


def value_key(nm):
    return f"{float(nm):.3g}"                 # 3 significant figures absorbs rounding differences


bdb = list(csv.DictReader(open(MEASUREMENTS)))
acts = every("activity", target_chembl_id=CHEMBL_TARGET, standard_type__in="Ki,IC50,Kd,EC50",
             standard_units="nM", only="activity_id,src_id,document_chembl_id,molecule_chembl_id,"
                                       "standard_type,standard_relation,standard_value")
docs = {d["document_chembl_id"]: d for d in by_ids("document", "document_chembl_id",
        {a["document_chembl_id"] for a in acts}, "document_chembl_id,doi,pubmed_id,patent_id,src_id")}
keys = {m["molecule_chembl_id"]: (m["molecule_structures"] or {}).get("standard_inchi_key")
        for m in by_ids("molecule", "molecule_chembl_id", {a["molecule_chembl_id"] for a in acts},
                        "molecule_chembl_id,molecule_structures")}


def chembl_keys(a):
    d, ik = docs[a["document_chembl_id"]], keys.get(a["molecule_chembl_id"]) or ""
    return [(k, ik[:14], a["standard_type"], value_key(a["standard_value"]))
            for k in doc_keys(d["doi"], d["pubmed_id"], d["patent_id"])
            if a["standard_value"] is not None and ik]


def bdb_keys(r):
    return [(k, r["inchikey"][:14], r["type"], value_key(r["value_nM"].lstrip("<>~= ")))
            for k in doc_keys(r["article_doi"], r["pmid"], r["patent"])]


# Match on the document, the InChIKey's first block (the connectivity; the full key differs
# between the two databases' structure handling more often than the molecule does), the
# type and the value to three significant figures.
in_chembl = {k for a in acts for k in chembl_keys(a)}
in_bdb = {k for r in bdb for k in bdb_keys(r)}
chembl_docs = {k[0] for k in in_chembl}
rows = Counter()
for r in bdb:
    ks = bdb_keys(r)
    rows[(r["source"], "doc")] += any(k[0] in chembl_docs for k in ks)
    rows[(r["source"], "match")] += any(k in in_chembl for k in ks)
    rows[(r["source"], "n")] += 1
back = Counter()
for a in acts:
    back[(a["src_id"], "n")] += 1
    back[(a["src_id"], "match")] += any(k in in_bdb for k in chembl_keys(a))

print(f"BindingDB {len(bdb)} measurements; ChEMBL {CHEMBL_TARGET} {len(acts)} activities in nM")
for src in sorted({s for s, _ in rows}):
    print(f"  BindingDB {src}: {rows[(src, 'n')]}; document in ChEMBL {rows[(src, 'doc')]}; "
          f"same measurement in ChEMBL {rows[(src, 'match')]}")
for src in sorted({s for s, _ in back}):
    print(f"  ChEMBL src_id {src}: {back[(src, 'n')]}; same measurement in BindingDB {back[(src, 'match')]}")
PY
M=$(ls -1 bindingdb_Q99558_*_measurements.csv 2>/dev/null | tail -1)
[ -f "$M" ] || { echo "refusing: no bindingdb_Q99558_*_measurements.csv here; run the builder first" >&2
                 exit 1; }
python3 bindingdb_chembl_overlap.py "$M" CHEMBL5888
```

On 2026-10-22, with the 202610 NIK set:

```
BindingDB 2092 measurements; ChEMBL CHEMBL5888 1899 activities in nM
  BindingDB ChEMBL: 477; document in ChEMBL 477; same measurement in ChEMBL 360
  BindingDB US Patent: 1483; document in ChEMBL 1154; same measurement in ChEMBL 1154
  BindingDB WIPO: 132; document in ChEMBL 0; same measurement in ChEMBL 0
  ChEMBL src_id 1: 536; same measurement in BindingDB 357
  ChEMBL src_id 37: 1353; same measurement in BindingDB 1154
  ChEMBL src_id 54: 4; same measurement in BindingDB 0
  ChEMBL src_id 65: 3; same measurement in BindingDB 0
  ChEMBL src_id 72: 3; same measurement in BindingDB 3
```

Every one of the 477 BindingDB `ChEMBL` rows comes from a document ChEMBL holds, but only
360 match a ChEMBL activity exactly. The other 117 differ in the value, the type or the structure
as each database records it, and value matching would keep both copies, so remove the overlap by
source and document (steps 1 and 2), not by value alone. Matching on the full InChIKey found 249
of the 477 and 645 of the patent rows: the two databases often differ in the key's stereo and
protonation blocks for the same compound, which is why the block uses the first block only. The
132 WIPO rows and 329 rows from two US patent documents that ChEMBL does not hold for this
target (318 of them from a 2024 application) are in BindingDB alone, and that is
BindingDB's own contribution for this target. The match takes about a minute; it pages through
ChEMBL's API, as the `chembl` skill describes.

## Get the files

### One target's affinity set from the monthly dump

The full TSV dump, `BindingDB_All_202610_tsv.zip`, is 594,284,548 bytes and holds one
9,004,582,822-byte TSV. You do not have to unpack it: the builder streams it out of the zip.
**Ask the user before downloading.** Throughput varies by more than it looks: one connection ran
at 50 to 100 kB/s here on 2026-10-22 and at about 365 kB/s on another host, so budget anywhere
from half an hour to three hours. An interruption over that long is likely, and the block is built
for it — it resumes, and it never tells you to delete a partial file. The block checks free space first and refuses if the reading is missing, not a
number, or below 700 MB. Here the file was fetched with parallel range requests to save time; the
block itself was then run on it, and its resume, checksum, mismatch and free-space refusal paths
all behaved as written.

```bash
DL=https://www.bindingdb.org/rwd/bind/chemsearch/marvin/Download.jsp
PAGE=$(curl -fsS --retry 4 --retry-delay 5 "$DL") \
  || { echo "refusing: cannot read $DL (the server answers 503 under load; try again)" >&2; exit 1; }
REL=$(printf '%s' "$PAGE" | grep -oE '/rwd/bind/downloads/BindingDB_All_[0-9]{6}_tsv\.zip' \
       | grep -oE '[0-9]{6}' | sort -u | tail -1)
case "$REL" in 2[0-9][0-9][0-9][01][0-9]) ;; *)        # nothing parsed: refuse, never guess
  echo "refusing: no BindingDB_All release name on $DL (read '$REL')" >&2; exit 1 ;; esac
FILE=BindingDB_All_${REL}_tsv.zip          # in 202610: 594,284,548 B, one 9,004,582,822 B TSV
NEED_KB=700000
AVAIL_KB=$(df -Pk . | awk 'NR == 2 {print $4}')
if ! [ "$AVAIL_KB" -ge "$NEED_KB" ] 2>/dev/null; then    # a non-numeric reading refuses too
  echo "refusing: free space here reads '$AVAIL_KB' kB, about $NEED_KB kB needed" >&2
  exit 1
fi
BASE=https://www.bindingdb.org/rwd/bind/downloads
SIZE=$(curl -fsSI --retry 3 --retry-delay 2 "$BASE/$FILE" \
       | awk 'tolower($1) == "content-length:" {print $2}' | tr -d '\r')
case "$SIZE" in ''|*[!0-9]*)                           # no size to check against: refuse
  echo "refusing: no Content-Length for $FILE (read '$SIZE')" >&2; exit 1 ;; esac
curl -f -C - -O "$BASE/$FILE" \
  || { echo "transfer failed or was interrupted; rerun this block to resume. Do not delete $FILE" >&2
       exit 1; }
curl -fsS --retry 3 --retry-delay 2 -o "$FILE.md5" "$BASE/${FILE%.zip}.md5" \
  || { echo "could not fetch ${FILE%.zip}.md5; rerun this block" >&2; exit 1; }
python3 - "$FILE" "$SIZE" <<'PY'
import hashlib, os, sys
path, expected = sys.argv[1], int(sys.argv[2])
have = os.path.getsize(path)
if have < expected:        # a short file is an interrupted transfer, not a corrupt one
    raise SystemExit(f"{path}: {have:,} of {expected:,} bytes. The transfer is incomplete; "
                     "rerun the block to resume it. Do not delete the file.")
if have > expected:
    raise SystemExit(f"{path}: {have:,} bytes, longer than the server's {expected:,}. "
                     "Delete it and download again.")
want = open(path + ".md5").read().split()[0]          # a bare hash, no file name
h = hashlib.md5()
with open(path, "rb") as fh:
    for chunk in iter(lambda: fh.read(1 << 20), b""):
        h.update(chunk)
if h.hexdigest() != want:  # complete but wrong: this one really is corrupt
    raise SystemExit(f"{path}: complete at {have:,} bytes, but md5 {h.hexdigest()} != {want}. "
                     "Delete it and download again.")
print(f"{path}: {have:,} bytes, md5 OK")
PY
```

This writes three files for one UniProt accession:

- `bindingdb_<accession>_<release>_measurements.csv`, one row per measurement: ligand ids and
  SMILES, target name, organism, chain count, a `variant` flag, type, relation, the value in nM
  as written, the p value (−log10 molar) with its flipped relation, source, licence, document
  ids, pH, temperature and dates;
- `bindingdb_<accession>_<release>_summary.csv`, one row per construct, compound (InChIKey) and
  type, from single-chain, non-variant constructs only: the number of measured values, their
  median, minimum and maximum p value, the censored bounds, the sources and the licences;
- `bindingdb_<accession>_<release>.provenance.json`, the summary for a person: the release, every
  count of what was dropped and why, the licences present, whether share-alike applies, and the
  citations. The CSVs hold only data; read the JSON to see what was decided, and correct it.

It reads each row's chain accession columns (SwissProt and TrEMBL), so a target is matched on any
chain. Rows from sources without a stated licence are left out and counted. Exact repeats are
dropped. A row with more than one affinity becomes one measurement per type. Zero values are
dropped and counted. The summary keeps each construct name apart, so a full-length protein and a
kinase-domain construct (`[64-515]`) are separate rows, and leaves out multichain targets and
variant constructs: point mutations in brackets or parentheses, insertions written as quoted
residues (`[1-770,'NPG',771-1210]`) and internal deletions written as two ranges
(`[1-745,751-1210]`). They stay in the measurements file, flagged. The script refuses a malformed
accession, a zip with other than one TSV, and a header missing the columns it reads. If nothing
survives it still writes the provenance JSON, removes any CSVs an earlier run left, and exits
saying whether the accession matched nothing or every match was left out for its licence.

A polyprotein accession is the case the summary cannot fix. SARS-CoV-2's `P0DTD1` returned 13,924
measurements, almost all under the one name `Replicase polyprotein 1ab` with the full 7,096-residue
sequence, so main-protease and papain-like-protease inhibitors share a summary row group. Separate
them through the assay descriptions (`BindingDB_Assays`, joined via `BindingDB_rsid_eaids`) before
you trust a median there.

```bash
cat > bindingdb_target.py <<'PY'
"""Target-level affinity set for one UniProt accession from a BindingDB TSV zip.

Streams the zip without unpacking it, keeps the licence of every row, and writes
a measurement table, a per-compound summary and a provenance file."""
import csv
import io
import json
import math
import os
import re
import statistics
import sys
import zipfile
from collections import Counter, defaultdict

ZIP = sys.argv[1]                        # e.g. BindingDB_All_202610_tsv.zip
ACC = sys.argv[2]                        # UniProt accession, e.g. P00533
TYPES = ["Ki", "IC50", "Kd", "EC50"]     # each type stays in its own rows; never pooled
# BindingDB states a licence for its own curated rows (articles and patents) and for rows
# imported from ChEMBL. Every other source is left out unless you set INCLUDE_UNSTATED = True,
# for analysis you keep to yourself after checking that source's own terms.
LICENCE = {
    "Curated from the literature by BindingDB": "CC BY 3.0 US",
    "US Patent": "CC BY 3.0 US",            # patents extracted by the BindingDB project
    "WIPO": "CC BY 3.0 US",
    "ChEMBL": "CC BY-SA 3.0",
}
INCLUDE_UNSTATED = False
VALUE = re.compile(r"\s*([<>]=?|~)?\s*([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*")
MUTATION = re.compile(r"[ACDEFGHIKLMNPQRSTVWY]\d+(?:[ACDEFGHIKLMNPQRSTVWY*]|del|ins\w*|fs)")
FLIP = {">": "<", ">=": "<=", "<": ">", "<=": ">="}
CHAINS = "Number of Protein Chains in Target (>1 implies a multichain complex)"

if not re.fullmatch(r"[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2}", ACC):
    raise SystemExit(f"refusing: {ACC!r} is not a UniProt accession")
release = re.search(r"_(\d{6})_tsv\.zip$", os.path.basename(ZIP))
release = release.group(1) if release else "unknown"


def variant(target_name):
    """True when BindingDB's construct annotation names a sequence change.

    Square brackets hold ranges and changes: [201-500] is a truncation (not a variant),
    [L858R], [1-770,'NPG',771-1210] (insertion) and [1-745,751-1210] (internal deletion)
    are variants. Some point mutations are in parentheses instead, (T315I), and a few
    rows carry nothing but the mutation as the target name (E255K)."""
    if MUTATION.fullmatch(target_name.strip()):
        return True
    for block in re.findall(r"\[([^\]]*)\]", target_name):
        tokens = [t.strip() for t in block.split(",")]
        if any(MUTATION.fullmatch(t) or t.startswith("'") for t in tokens):
            return True
        if sum(bool(re.fullmatch(r"\d+-\d+", t)) for t in tokens) > 1:
            return True
    return any(MUTATION.fullmatch(t.strip()) for block in re.findall(r"\(([^)]*)\)", target_name)
               for t in block.split(","))


zf = zipfile.ZipFile(ZIP)
members = [n for n in zf.namelist() if n.endswith(".tsv")]
if len(members) != 1:
    raise SystemExit(f"refusing: expected one .tsv in {ZIP}, found {members}")
rows, seen_lines = [], defaultdict(set)
counts = Counter()
with zf.open(members[0]) as fh:
    rd = io.TextIOWrapper(fh, encoding="utf-8", newline="")
    head = rd.readline().rstrip("\r\n").split("\t")
    col = {h: i for i, h in enumerate(head)}
    need = ["BindingDB Reactant_set_id", "Ligand SMILES", "Ligand InChI Key",
            "BindingDB MonomerID", "Target Name",
            "Target Source Organism According to Curator or DataSource", "pH", "Temp (C)",
            "Curation/DataSource", "Article DOI", "BindingDB Entry DOI", "PMID", "Patent Number",
            "Date of publication", "Date in BindingDB", "ChEMBL ID of Ligand", CHAINS]
    missing = [c for c in need + [f"{t} (nM)" for t in TYPES] if c not in col]
    if missing:          # every column this script reads, so a rename refuses instead of KeyError
        raise SystemExit(f"refusing: header lacks {missing}; the file format changed")
    id_cols = [i for i, h in enumerate(head)
               if re.fullmatch(r"UniProt \((SwissProt|TrEMBL)\) Primary ID of Target Chain \d+", h)]
    nchain = col[CHAINS]
    for line in rd:
        line = line.rstrip("\r\n")
        if not line:
            continue
        counts["lines"] += 1
        f = line.split("\t")
        if ACC not in {f[i] for i in id_cols if i < len(f)}:
            continue
        rsid = f[0]
        if line in seen_lines[rsid]:              # the subset files repeat some rows verbatim
            counts["exact duplicate lines dropped"] += 1
            continue
        seen_lines[rsid].add(line)
        source = f[col["Curation/DataSource"]]
        lic = LICENCE.get(source)
        if lic is None and not INCLUDE_UNSTATED:
            counts[f"left out, licence not stated by BindingDB: {source or '(blank)'}"] += 1
            continue
        for t in TYPES:
            raw = f[col[f"{t} (nM)"]].strip()
            if not raw:
                continue
            m = VALUE.fullmatch(raw)
            if not m:
                counts[f"unparseable {t} value"] += 1
                continue
            if float(m.group(2)) <= 0:              # '0.000' cannot go on a log scale
                counts[f"zero {t} value dropped"] += 1
                continue
            rel, nm = m.group(1) or "=", float(m.group(2))
            rows.append({
                "reactant_set_id": rsid, "monomer_id": f[col["BindingDB MonomerID"]],
                "inchikey": f[col["Ligand InChI Key"]], "smiles": f[col["Ligand SMILES"]],
                "target_name": f[col["Target Name"]],
                "organism": f[col["Target Source Organism According to Curator or DataSource"]],
                "n_chains": f[nchain], "variant": variant(f[col["Target Name"]]),
                "type": t, "relation": rel, "value_nM": raw.strip(),
                "p_relation": FLIP.get(rel, rel), "p_value": f"{9 - math.log10(nm):.3f}",
                "source": source, "licence": lic or "not stated by BindingDB",
                "article_doi": f[col["Article DOI"]], "pmid": f[col["PMID"]],
                "patent": f[col["Patent Number"]], "bindingdb_entry_doi": f[col["BindingDB Entry DOI"]],
                "chembl_ligand": f[col["ChEMBL ID of Ligand"]],
                "pH": f[col["pH"]].strip(), "temp": f[col["Temp (C)"]].strip(),
                "published": f[col["Date of publication"]], "added": f[col["Date in BindingDB"]],
            })

stem = f"bindingdb_{ACC}_{release}"
for t in TYPES:
    counts[f"measurements kept: {t}"] = sum(r["type"] == t for r in rows)

# Per-compound summary over single-chain, non-variant constructs. Each construct name
# (full length, or a truncation such as [64-515]) keeps its own rows.
excluded, groups = Counter(), defaultdict(lambda: {"vals": [], "bounds": [], "approx": [], "src": set(), "lic": set()})
for r in rows:
    if r["n_chains"] != "1":
        excluded["multichain complex" if r["n_chains"].isdigit() else "chain count missing"] += 1
        continue
    if r["variant"]:
        excluded["variant construct (mutation, insertion or deletion)"] += 1
        continue
    g = groups[(r["target_name"], r["inchikey"], r["type"])]
    g["smiles"], g["src"], g["lic"] = r["smiles"], g["src"] | {r["source"]}, g["lic"] | {r["licence"]}
    p = float(r["p_value"])
    if r["relation"] == "=":
        g["vals"].append(p)
    elif r["relation"] == "~":
        g["approx"].append(f"~{p:.2f}")
    else:                                   # Ki > 10000 nM is pKi < 5: the inequality flips
        g["bounds"].append(f"{r['p_relation']}{p:.2f}")
licences = Counter(r["licence"] for r in rows)
prov = {
    "bindingdb_release": release, "zip": os.path.basename(ZIP), "uniprot": ACC,
    "types": TYPES, "lines_scanned": counts["lines"], "measurements": len(rows),
    "row_counts": {k: v for k, v in counts.items() if k != "lines"},
    "summary_excluded": dict(excluded), "summary_rows": len(groups),
    "licences_in_measurements": dict(licences),
    "include_unstated": INCLUDE_UNSTATED,
    "outputs": {"measurements": f"{stem}_measurements.csv" if rows else None,
                "summary": f"{stem}_summary.csv" if groups else None},
    "share_alike": ("ChEMBL-derived rows are CC BY-SA 3.0; a table you distribute that contains "
                    "them must carry CC BY-SA 3.0") if licences.get("CC BY-SA 3.0") else None,
    "cite": ["BindingDB, https://www.bindingdb.org, release " + release,
             "Liu T et al. BindingDB in 2024. Nucleic Acids Res 2025;53(D1):D1633-D1644. doi:10.1093/nar/gkae1075",
             "Gilson MK et al. BindingDB in 2015. Nucleic Acids Res 2016;44(D1):D1045-D1053. doi:10.1093/nar/gkv1072"]
            + (["ChEMBL, https://www.ebi.ac.uk/chembl (the ChEMBL release BindingDB imported is in its release notes)"]
               if licences.get("CC BY-SA 3.0") else []),
}
with open(f"{stem}.provenance.json", "w") as fh:
    json.dump(prov, fh, indent=2)
for path in (f"{stem}_measurements.csv", f"{stem}_summary.csv"):
    if os.path.exists(path):                 # a file from an earlier run would contradict the JSON
        os.remove(path)
if not rows:
    left = {k: v for k, v in counts.items() if k.startswith("left out")}
    raise SystemExit(f"no measurements written for {ACC} from {ZIP}: {counts['lines']} lines scanned; "
                     + (f"rows left out for licence {left}" if left else
                        "no row names this accession on any chain (check it, or try the TrEMBL id)")
                     + f". See {stem}.provenance.json")

with open(f"{stem}_measurements.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
out = []
for (target, key, t), g in sorted(groups.items()):
    v = g["vals"]
    out.append({"target_name": target, "inchikey": key, "type": t, "n_measured": len(v),
                "p_median": f"{statistics.median(v):.2f}" if v else "",
                "p_min": f"{min(v):.2f}" if v else "", "p_max": f"{max(v):.2f}" if v else "",
                "censored_bounds": ";".join(sorted(g["bounds"])), "approximate": ";".join(sorted(g["approx"])),
                "sources": ";".join(sorted(g["src"])), "licences": ";".join(sorted(g["lic"])),
                "smiles": g["smiles"]})
if out:
    with open(f"{stem}_summary.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)
print(f"BindingDB {release}: {ACC}; {counts['lines']} lines scanned; {len(rows)} measurements kept")
for k, v in sorted(counts.items()):
    if k != "lines":
        print(f"  {v:7d}  {k}")
print(f"licences: {dict(licences)}")
print(f"summary: {len(out)} construct x compound x type rows over {len({k[0] for k in groups})} "
      f"construct name(s); left out of it: {dict(excluded)}")
for t in TYPES:
    sub = [r for r in out if r["type"] == t and r["n_measured"]]
    print(f"  {t}: {len(sub)} measured, {sum(1 for r in out if r['type'] == t and not r['n_measured'])} bounds only, "
          f"{sum(float(r['p_max']) - float(r['p_min']) > 1 for r in sub)} spread over 1 log unit")
PY
FILE=$(ls -1 BindingDB_All_*_tsv.zip 2>/dev/null | tail -1)
[ -f "$FILE" ] || { echo "refusing: no BindingDB_All_*_tsv.zip here; run the download block first" >&2; exit 1; }
python3 bindingdb_target.py "$FILE" Q99558     # NIK (MAP3K14), human
python3 bindingdb_target.py "$FILE" P00533     # EGFR: variants and complexes
```

On 2026-10-22, about 90 seconds per accession (the file is read once per run):

```
BindingDB 202610: Q99558; 3243660 lines scanned; 2092 measurements kept
        0  measurements kept: EC50
     1161  measurements kept: IC50
       28  measurements kept: Kd
      903  measurements kept: Ki
licences: {'CC BY 3.0 US': 1615, 'CC BY-SA 3.0': 477}
summary: 1495 construct x compound x type rows over 1 construct name(s); left out of it: {}
  Ki: 498 measured, 30 bounds only, 33 spread over 1 log unit
  IC50: 797 measured, 154 bounds only, 33 spread over 1 log unit
  Kd: 11 measured, 5 bounds only, 0 spread over 1 log unit
  EC50: 0 measured, 0 bounds only, 0 spread over 1 log unit
BindingDB 202610: P00533; 3243660 lines scanned; 32233 measurements kept
      168  left out, licence not stated by BindingDB: PubChem
      325  measurements kept: EC50
    29788  measurements kept: IC50
     1541  measurements kept: Kd
      579  measurements kept: Ki
        1  zero IC50 value dropped
licences: {'CC BY 3.0 US': 16168, 'CC BY-SA 3.0': 16065}
summary: 14263 construct x compound x type rows over 6 construct name(s); left out of it: {'variant construct (mutation, insertion or deletion)': 7935, 'multichain complex': 795}
  Ki: 227 measured, 52 bounds only, 43 spread over 1 log unit
  IC50: 10834 measured, 2834 bounds only, 858 spread over 1 log unit
  Kd: 137 measured, 33 bounds only, 43 spread over 1 log unit
  EC50: 105 measured, 41 bounds only, 12 spread over 1 log unit
```

NIK gives the same 2,092 measurements as the web service, here with sources and licences. EGFR
shows why the variant filter matters: 7,935 of its 32,233 measurements are on mutant, insertion or
deletion constructs, and the summary keeps six construct names apart. Run on CDK2 (`P24941`),
12,866 of 16,274 measurements were on multichain targets, the CDK2–cyclin complexes; on ABL1
(`P00519`), 1,213 were on complexes and 254 on variants. Run on `P28223` against the PDSP Ki file,
all 364 matches were left out for licence, and the script exited without writing a CSV.

### Smaller files

Every file below is a zip with an `.md5` beside it, at
`https://www.bindingdb.org/rwd/bind/downloads/<name>`. The names carry the release, so substitute
the `$REL` the discovery block found for the `202610` shown here. Sizes are `Content-Length` for
release 202610 on 2026-10-22, and the builder above reads any of the TSV zips:

| file | bytes | what is in it |
|---|---|---|
| `BindingDB_All_202610_tsv.zip` | 594,284,548 | everything |
| `BindingDB_ChEMBL_202610_tsv.zip` | 344,797,338 | rows imported from ChEMBL (CC BY-SA 3.0) |
| `BindingDB_Patents_202610_tsv.zip` | 171,600,536 | rows curated from patents |
| `BindingDB_PubChem_202610_tsv.zip` | 23,095,044 | rows imported from PubChem (licence not stated) |
| `BindingDB_BindingDB_Articles_202610_tsv.zip` | 18,271,888 | rows curated from articles, plus some ChEMBL and Taylor-lab rows |
| `BindingDB_Assays_202610_tsv.zip` | 10,120,429 | plain-text assay descriptions, keyed by entry and assay id |
| `BindingDB_Covid-19_202610_tsv.zip` | 9,381,911 | coronavirus targets |
| `BindingDB_PDSPKi_202610_tsv.zip` | 5,590,095 | rows imported from PDSP Ki (licence not stated) |
| `BindingDB_ITC_202610_tsv.zip` | 145,018 | isothermal titration calorimetry (broken header) |
| `BindingDB_CSAR_202610_tsv.zip` | 131,136 | CSAR benchmark data (licence not stated) |

The assay descriptions are not in the main rows. `BindingDB_rsid_eaids_202610_tsv.zip` maps each
`Reactant_set_id` to the entry and assay ids that `BindingDB_Assays` is keyed on. SDF versions,
in 2D and with computed 3D coordinates, sit beside each TSV, and a MySQL dump of the whole
database (`/rwd/bind/BDB-mySQL_All_202610_dmp.zip`, 257,801,530 bytes) is on the same download
page. The Oracle dump is discontinued; its last file is from 2025-02.

A few files have no release in their name and are replaced in place, so they do not rot:
`/rwd/bind/BindingDB_UniProt.txt` maps BindingDB polymer ids to UniProt accessions (586,678 bytes
on 2026-10-22) and `/rwd/bind/BindingDBTargetSequences.fasta` holds every target sequence
(7,658,614 bytes).

## Try it

**Data.** `BindingDB_BindingDB_Articles_<release>_tsv.zip`, BindingDB's file of measurements
curated from journal articles (18,271,888 bytes in release 202610), plus two live web-service
queries for NIK (`Q99558`), and `BindingDB_UniProt.txt` (586,678 bytes), the accession-to-target
mapping, which is one of the few BindingDB files whose name carries no release. The block reads
the download page for the current release rather than naming one, because only the current
release is on the server. The articles file is mostly
CC BY 3.0 US, and holds 429 CC BY-SA 3.0 ChEMBL rows and 260 Taylor-lab rows with no stated
licence; the block reads it and prints counts, and writes no data beyond the download. Anonymous,
no key. It needs only `python3` and `curl`. Confirmed reachable on 2026-10-22. The counts under
**Expect** are from release 202610, and they move when BindingDB rebuilds. The two URLs declared
in `datasets:` are the mapping file and the REST call, the two things here whose addresses never
change; the download page and the release-named zip cannot be declared, so a release roll that
breaks them shows up when this block is run, not in the nightly probe.

**Run.** In an empty directory:

```bash
STEM=BindingDB_BindingDB_Articles                           # 18,271,888 B in release 202610
DL=https://www.bindingdb.org/rwd/bind/chemsearch/marvin/Download.jsp
PAGE=$(curl -fsS --retry 4 --retry-delay 5 "$DL") \
  || { echo "refusing: cannot read $DL (the server answers 503 under load; try again)" >&2; exit 1; }
REL=$(printf '%s' "$PAGE" | grep -oE "/rwd/bind/downloads/${STEM}_[0-9]{6}_tsv\.zip" \
       | grep -oE '[0-9]{6}' | sort -u | tail -1)
case "$REL" in 2[0-9][0-9][0-9][01][0-9]) ;; *)        # nothing parsed: refuse, never guess
  echo "refusing: no ${STEM} release name on $DL (read '$REL')" >&2; exit 1 ;; esac
FILE=${STEM}_${REL}_tsv.zip
BASE=https://www.bindingdb.org/rwd/bind/downloads
SIZE=$(curl -fsSI --retry 3 --retry-delay 2 "$BASE/$FILE" \
       | awk 'tolower($1) == "content-length:" {print $2}' | tr -d '\r')
case "$SIZE" in ''|*[!0-9]*)                           # no size to check against: refuse
  echo "refusing: no Content-Length for $FILE (read '$SIZE')" >&2; exit 1 ;; esac
curl -fsS -C - -O "$BASE/$FILE" \
  || { echo "transfer failed or was interrupted; rerun this block to resume. Do not delete $FILE" >&2
       exit 1; }
curl -fsS --retry 3 --retry-delay 2 -o "$FILE.md5" "$BASE/${FILE%.zip}.md5" \
  || { echo "could not fetch ${FILE%.zip}.md5; rerun this block" >&2; exit 1; }
curl -fsS --retry 3 --retry-delay 2 -O https://www.bindingdb.org/rwd/bind/BindingDB_UniProt.txt \
  || { echo "could not fetch BindingDB_UniProt.txt; rerun this block" >&2; exit 1; }
cat > bindingdb_check.py <<'PY'
import hashlib, io, json, os, re, sys, urllib.parse, urllib.request, zipfile
from collections import Counter, defaultdict

FILE, SIZE, MAP = sys.argv[1], int(sys.argv[2]), "BindingDB_UniProt.txt"
VALUE = re.compile(r"\s*([<>]=?|~)?\s*([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*")
TYPES = ["Ki (nM)", "IC50 (nM)", "Kd (nM)", "EC50 (nM)"]

# 1. Size first: a short file is an interrupted transfer, not a corrupt one. Then the
#    .md5 file, which is a bare hash with no file name, so compare it yourself.
have = os.path.getsize(FILE)
if have != SIZE:
    raise SystemExit(f"{FILE}: {have:,} bytes against the server's {SIZE:,}. "
                     + ("Incomplete; rerun the block to resume. Do not delete it."
                        if have < SIZE else "Longer than the server's copy; delete and refetch."))
want = open(FILE + ".md5").read().split()[0]
got = hashlib.md5(open(FILE, "rb").read()).hexdigest()
if got != want:
    raise SystemExit(f"{FILE}: complete at {have:,} bytes but md5 {got} != {want}; "
                     "delete it and download again")

# 2. Stream the TSV out of the zip and read every affinity cell.
zf = zipfile.ZipFile(FILE)
(member,) = zf.namelist()
rd = io.TextIOWrapper(zf.open(member), encoding="utf-8", newline="")
head = rd.readline().rstrip("\r\n").split("\t")
col = {h: i for i, h in enumerate(head)}
assert all(t in col for t in TYPES) and "Curation/DataSource" in col, "header changed"
lines, blank, widths, by_rsid = 0, 0, Counter(), defaultdict(set)
sources, rels, per_row, spaced = Counter(), Counter(), Counter(), 0
for line in rd:
    line = line.rstrip("\r\n")
    if not line:
        blank += 1
        continue
    lines += 1
    f = line.split("\t")
    widths[len(f)] += 1
    by_rsid[f[0]].add(line)
    sources[f[col["Curation/DataSource"]]] += 1
    filled = [t for t in TYPES if f[col[t]].strip()]
    per_row[len(filled)] += 1
    for t in filled:
        raw = f[col[t]]
        m = VALUE.fullmatch(raw)
        assert m and float(m.group(2)) > 0, (t, raw)          # qualifier + positive nM, nothing else
        rels[(t.split()[0], m.group(1) or "=")] += 1
        spaced += bool(re.match(r"\s*[<>]\s+\d", raw))
assert all(len(v) == 1 for v in by_rsid.values()), "a reactant set id carries two different rows"
dupe_lines = lines - len(by_rsid)

# 3. The web service: an unknown accession and a known one give the same shape, and the
#    cutoff is compared with the bare number, so censored rows slip through it.
def svc(**p):
    url = "https://bindingdb.org/rest/getLigandsByUniprots?" + urllib.parse.urlencode(
        {**p, "response": "application/json"})
    with urllib.request.urlopen(url, timeout=300) as r:
        return json.load(r)["getLindsByUniprotsResponse"]["affinities"]

unknown = svc(uniprot="Q00000", cutoff=10000)
assert unknown == []
nik_all = svc(uniprot="Q99558")
nik_cut = svc(uniprot="Q99558", cutoff=1000)
leak = [r for r in nik_cut if r["affinity"].lstrip().startswith(">")]
assert leak, "no censored row passed the cutoff"
assert all(float(r["affinity"].lstrip("<> ")) <= 1000 for r in nik_cut)
assert {r["affinity_type"] for r in nik_all} <= {"Ki", "IC50", "Kd", "EC50"}

# 4. The identifier mapping: polymer id, accession, name, and no release in its file name.
mapped = [l.split("\t") for l in open(MAP, encoding="utf-8").read().splitlines() if l.strip()]
assert {len(r) for r in mapped} == {3}, "mapping is polymer id, accession, name"
name_of = {acc: name for _, acc, name in mapped}
assert "Q99558" in name_of, "NIK is absent from the published mapping"
assert {r["query"] for r in nik_all} == {name_of["Q99558"]}   # service and mapping agree

print(f"{member}: md5 ok; {lines} rows ({blank} blank lines), {len(head)} columns; widths {dict(widths)}")
print(f"sources {dict(sources.most_common())}")
print(f"measurements per row {dict(sorted(per_row.items()))}; '> N' with a space: {spaced}")
print("relations " + ", ".join(f"{t}{r}{n}" for (t, r), n in sorted(rels.items())))
print(f"{len(by_rsid)} reactant sets; {dupe_lines} rows repeat an earlier row verbatim")
print(f"web service: Q00000 -> {len(unknown)} rows; Q99558 uncut {len(nik_all)}, cutoff 1000 -> "
      f"{len(nik_cut)}, of which {len(leak)} are '>' bounds, e.g. {leak[0]['affinity_type']} {leak[0]['affinity']}")
print(f"{MAP}: {len(name_of)} accessions mapped; Q99558 -> {name_of['Q99558']}")
PY
python3 bindingdb_check.py "$FILE" "$SIZE"
```

**Expect.** Run cold in a fresh empty directory on 2026-10-22, this printed:

```
BindingDB_BindingDB_Articles.tsv: md5 ok; 93710 rows (2 blank lines), 640 columns; widths {640: 93710}
sources {'Curated from the literature by BindingDB': 93021, 'ChEMBL': 429, 'Taylor Research Group, UCSD': 260}
measurements per row {0: 1290, 1: 88728, 2: 3611, 3: 81}; '> N' with a space: 4
relations EC50<7, EC50=3827, EC50>396, IC50<334, IC50=54884, IC50>8306, Kd<7, Kd=2490, Kd>153, Ki<149, Ki=22254, Ki>3386
93520 reactant sets; 190 rows repeat an earlier row verbatim
web service: Q00000 -> 0 rows; Q99558 uncut 2092, cutoff 1000 -> 1831, of which 63 are '>' bounds, e.g. Ki >1.2
BindingDB_UniProt.txt: 10041 accessions mapped; Q99558 -> Mitogen-activated protein kinase kinase kinase 14
```

*Invariants*, asserted by the script, so a failure means the skill is wrong:

- The zip's MD5 equals the bare hash in its `.md5` file.
- The header has the four `(nM)` affinity columns and `Curation/DataSource`.
- Every filled affinity cell is an optional `<`, `>`, `<=`, `>=` or `~`, optional spaces, and a
  positive number. Nothing else appears in those columns.
- Lines that share a `Reactant_set_id` are identical, so dropping exact repeats loses nothing.
- An unknown accession returns an empty list from the web service.
- With `cutoff=1000`, the web service returns `>` rows whose bare number is at most 1000.
- The web service's affinity types are among Ki, IC50, Kd and EC50.
- Every line of the identifier mapping has three fields, NIK's accession is in it, and the target
  name it gives matches the name the web service returned for every NIK row.

*Observed values, release 202610 and the live service on 2026-10-22*. These move with each
release, so a mismatch means drift to investigate:

- 93,710 rows and 640 columns; the source counts; the measurements-per-row counts.
- The relation counts per type, and 4 values written `> N` with a space.
- 93,520 reactant sets, 190 repeated rows.
- NIK: 2,092 rows uncut, 1,831 at cutoff 1000, 63 of them `>` bounds.
- 10,041 distinct accessions over the mapping's 11,534 lines, since several polymer ids can
  carry the same accession.

## Sources

- BindingDB — <https://www.bindingdb.org/rwd/bind/index.jsp>
- Info page, with the licence statement — <https://www.bindingdb.org/rwd/bind/info.jsp>
- Downloads and release notes — <https://www.bindingdb.org/rwd/bind/chemsearch/marvin/Download.jsp>
- Web services — <https://www.bindingdb.org/rwd/bind/BindingDBRESTfulAPI.jsp>
- TSV format — <https://www.bindingdb.org/rwd/bind/chemsearch/marvin/BindingDB-TSV-Format.pdf>
- Long-term archive — <https://library.ucsd.edu/dc/collection/bb03870458>
- Liu T, Hwang L, Burley SK, et al. BindingDB in 2024: a FAIR knowledgebase of protein-small
  molecule binding data. *Nucleic Acids Res.* 2025;53(D1):D1633–D1644. doi:10.1093/nar/gkae1075.
  Open access; the source for the WIPO curation statement, Table 1's "Rows marked BDB" footnote,
  and the CC BY 4.0 wording — <https://pmc.ncbi.nlm.nih.gov/articles/PMC11701568/>
- Gilson MK, Liu T, Baitaluk M, et al. BindingDB in 2015: a public database for medicinal
  chemistry, computational chemistry and systems pharmacology. *Nucleic Acids Res.*
  2016;44(D1):D1045–D1053. doi:10.1093/nar/gkv1072. The paper BindingDB's download policy asks
  you to cite.
- ChEMBL source 37, BindingDB Patent Bioactivity Data — <https://www.ebi.ac.uk/chembl/api/data/source.json>
- Creative Commons Attribution 3.0 United States — <https://creativecommons.org/licenses/by/3.0/us/>
- Creative Commons Attribution-ShareAlike 3.0 Unported — <https://creativecommons.org/licenses/by-sa/3.0/>
