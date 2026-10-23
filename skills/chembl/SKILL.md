---
name: chembl
description: ChEMBL bioactivity data from its open REST API or bulk dump — map a UniProt to the right target, pull IC50/Ki/Kd with pChEMBL, filter assay type, confidence, validity flags and duplicates, and build a per-compound SAR table.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, drug-discovery, cheminformatics, binding-affinity]
covers: [chembl, bioactivity, structure-activity relationship, sar, medicinal chemistry, ic50, ki, kd, ec50, pchembl, potency, kinase, small molecule, compound, ligand, target, uniprot, assay, binding assay, selectivity, lead optimization, qsar, training data, salt form, parent compound, sqlite, postgresql, embl-ebi, egfr, abl1]
papers: [PMID:37933841, PMID:25883136, PMID:40065463, PMID:40971497, doi:10.6019/CHEMBL.database.37]
access: [open]
datasets: ["https://www.ebi.ac.uk/chembl/api/data/status.json", "https://www.ebi.ac.uk/chembl/api/data/target/CHEMBL5888.json", "https://www.ebi.ac.uk/chembl/api/data/activity.json?target_chembl_id=CHEMBL5888&standard_type__in=IC50,Ki,Kd&limit=1000", "https://ftp.ebi.ac.uk/pub/databases/chembl/ChEMBLdb/releases/chembl_37/checksums.txt"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: ChEMBL_37 (release date 2026-05-01) through the EBI ChEMBL REST API and the chembl_37 FTP release directory / Python 3.12.8 standard library only / sqlite3 3.50.2 / macOS arm64
  executed: 9
  unverified: 2
  unverified_reason: Two blocks were not run end to end. The bulk download needs 5.76 GB of transfer and about 36 GB of free disk, and this host's link to the EBI FTP server ran below 1 MB/s. Its free-space check, checksum and resume steps were run on chembl_37_bio.fa.gz from the same release directory, and the tarball's member list was read from its first bytes. The SQLite SAR block was run only against a database built from the chembl_37 table definitions, empty and then with a few synthetic rows, so it parses, every table and column it names exists, and its filters and salt-to-parent join behave as described, but it has not seen real data. Re-run both on a host with a fast route to the EBI FTP server.
---

# ChEMBL — bioactivity and structure–activity data

ChEMBL is EMBL-EBI's curated database of measured bioactivities for drug-like small
molecules: binding constants, potencies, functional and ADME results, each tied to a
compound, an assay, a target and the paper, patent or deposition it came from. It is the
usual starting point for a structure–activity relationship (SAR) table, a selectivity
profile, or a training set for a potency model.

Getting rows out is easy. Getting rows that mean what you think is the work. One target
returns IC50s next to percent inhibition at one concentration, potencies against mutant
constructs, values reported only as "greater than 10 µM", the same measurement cited by three
later papers, and a salt counted as a different compound from its free base. Each of those
silently changes a median or a model. This skill covers where each trap sits and how to
filter it out with a stated reason, and it ends in a CSV on disk together with a record of
every decision that shaped it.

**What you need: nothing.** The REST API and the FTP downloads are anonymous. There is no
key, account or click-through.

## Licence: CC BY-SA 3.0, and what share-alike means for your tables

Checked at source on 2026-10-21. The `LICENSE` file in the release directory is the full text
of Creative Commons Attribution-ShareAlike 3.0 Unported. The ChEMBL documentation's About page
says the same, and adds that the web interface is used under the EMBL-EBI Terms of Use.

**Commercial use is allowed.** The licence grants its rights worldwide and royalty-free, and
it has no non-commercial clause. Share-alike is not the same as non-commercial. The
obligations are attribution, and share-alike on adaptations you distribute.

Two obligations follow for anything you build from the data:

- **Attribution.** The release README asks for the ChEMBL URL and the release version, in
  the form `ChEMBL data is from http://www.ebi.ac.uk/chembl - the version of ChEMBL is
  chembl_37`. It should appear wherever the data is offered, or in the documentation of
  anything you redistribute. The SAR builder below writes that line into its provenance file
  for you. For papers, cite the database paper as well (see Sources). The release also ships
  a `REQUIRED.ATTRIBUTION` file. It asks that when ChEMBL is incorporated into other works,
  the ChEMBL IDs are preserved and the ChEMBL release number is clearly displayed. The SAR
  builder complies: every row carries its ChEMBL compound IDs, and the provenance file
  records the release.
- **Share-alike.** If you distribute an adaptation, such as a curated SAR table, a cleaned
  benchmark, or a dataset that reshapes or merges ChEMBL rows with your own, section 4(b) of the licence
  lets you release it only under CC BY-SA 3.0, a later version with the same elements (such
  as CC BY-SA 4.0), or a licence Creative Commons lists as compatible. You must include the
  licence or its URI, and you may not add terms or technical measures that restrict what
  recipients can do with it. A derived table cannot be published as CC BY 4.0 or CC0, and it
  cannot go behind a no-redistribution clause. Section 3(b) also asks you to label an
  adaptation as changed from the original. Under 3.0, placing the database in its entirety,
  unmodified, in a collection next to other, separate works is not an adaptation (section
  1(b)). Treat a table you have cleaned, aggregated or merged as one unless your own counsel
  says otherwise. **Either way, the ChEMBL part stays under CC BY-SA 3.0.** Section 4(a)
  lets the work itself be distributed only under this licence, including inside a
  collection, so a filtered or unmodified subset cannot be relicensed either. Only your own
  separate works in a collection are free of it.

Share-alike is triggered by distribution. Analysing ChEMBL privately, or inside one
organisation, without handing the derived data to anyone, does not trigger it. Whether a
model trained on ChEMBL counts as an adaptation is not settled by the licence text, and this
skill does not decide it. If that matters to you, ask your own counsel.

The FAQ adds one more caveat. Properties calculated with commercial software must be used
under that software's terms, and must not be extracted in isolation to train a model that
replicates the calculation. On 2026-10-21 the ChEMBL 37 `compound_properties` table and the
API's `molecule_properties` held none of the calculated `cx_` columns. The ChEMBL 35 dump
still had four of them (`cx_logp`, `cx_logd`, `cx_most_apka`, `cx_most_bpka`) and the ChEMBL 36
dump had none. The caveat still applies if you work from an older dump.

This page is original text, CC-BY-4.0, by Heureka Labs. It republishes no ChEMBL data beyond
a few counts quoted as observations.

## Which release you are reading

```bash
curl -s https://www.ebi.ac.uk/chembl/api/data/status.json
```

On 2026-10-21 this printed:

```
{"activities": 24527044, "chembl_db_version": "ChEMBL_37", "chembl_release_date": "2026-05-01", "compound_records": 3824604, "disinct_compounds": 2921148, "publications": 101100, "status": "UP", "targets": 18552}
```

The key really is spelled `disinct_compounds`. **The API always serves the current release
and nothing older.** The FAQ says so, and there is no version parameter. A table pulled today
and the same query run after ChEMBL 38 ships can differ, so record `chembl_db_version` with
every pull. For an analysis that must be reproducible, work from a dump of a named release,
which has a DOI of its own (ChEMBL 37 is `10.6019/CHEMBL.database.37`).

## How the API behaves

The base is `https://www.ebi.ac.uk/chembl/api/data/<resource>.json`. The resources this skill
uses are `activity`, `assay`, `target`, `molecule` and `status`. Filters are Django-style query
parameters: `field=value`, `field__in=a,b,c`, `field__gte=6`, `field__isnull=false`, plus
`only=` to choose fields and `order_by=` to sort. Six behaviours matter, each confirmed live on
2026-10-21:

| behaviour | consequence |
|---|---|
| No `.json` suffix and no `format=json` returns **XML** | always write `.json` |
| `limit` is capped at **1000**; `limit=5000` returns 1000 rows without complaint | page through `page_meta.next` |
| `page_meta.next` is a **path** (`/chembl/api/data/...`), not a URL | prefix the host |
| An **unknown or misspelled filter is ignored**, not rejected | `target_chembl=` instead of `target_chembl_id=` matched all 24,527,044 activities |
| Numeric fields such as `standard_value`, `pchembl_value` and the ligand efficiencies are **JSON strings** | convert before comparing; server-side `__gte` filters do compare numerically |
| `__in` lists travel in the URL, and a URL over about 4 kB gets **HTTP 400** | 200 ids passed, 400 failed; send 100 at a time |

The documentation offers POST with an `X-HTTP-Method-Override: GET` header for long id lists.
On 2026-10-21 a form-encoded body returned HTTP 500 `keywords must be strings`, and a JSON
body returned HTTP 400 saying it was not serialised as JSON. Use chunked GETs. An unknown id in a path gives HTTP 404 with an
empty body. An unknown id in a filter gives HTTP 200 with zero rows. A malformed number gives
HTTP 400 with a message (`'abc' value must be a decimal number.`). Without `order_by`, pages
came back in ascending `activity_id`, and three complete pulls of 3,232, 24,904 and 58,847
rows had no repeats and no gaps. A 1000-row page took about 10 seconds. No rate limit is
documented, so keep requests sequential.

This helper does the paging, refuses a query that matches implausibly many rows (the symptom
of a misspelled filter), checks the row count against the server's total, and chunks id
lookups. The later blocks import it, so run them from the same directory:

```bash
cat > chembl_api.py <<'PY'
"""A small ChEMBL REST client: JSON only, complete paging, chunked id lookups, a row ceiling."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

HOST = "https://www.ebi.ac.uk"
API = HOST + "/chembl/api/data"
PAGE = 1000    # the server caps limit at 1000, whatever you ask for
CHUNK = 100    # ids per __in request; a URL over about 4 kB is refused with HTTP 400


def get_json(url, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code < 500 or i == tries - 1:   # a 4xx is the request, not the server
                raise
        except (urllib.error.URLError, TimeoutError):
            if i == tries - 1:
                raise
        time.sleep(2 * (i + 1))


def fetch_all(resource, params, max_rows=100_000):
    """Every row a filter matches. Refuses before paging if the match is suspiciously large."""
    url = f"{API}/{resource}.json?" + urllib.parse.urlencode({**params, "limit": PAGE})
    page = get_json(url)
    total = page["page_meta"]["total_count"]
    if total > max_rows:
        raise SystemExit(
            f"refusing: {resource} filter matches {total:,} rows, over max_rows {max_rows:,}. "
            "An unknown or misspelled filter is ignored, not rejected, so check the names.")
    key = next(k for k in page if k != "page_meta")
    rows = list(page[key])
    while page["page_meta"]["next"]:                 # 'next' is a path, not a full URL
        page = get_json(HOST + page["page_meta"]["next"])
        rows += page[key]
    if len(rows) != total:
        raise SystemExit(f"{resource}: received {len(rows)} rows, server reported {total}")
    return rows


def fetch_by_ids(resource, id_field, ids, extra=None):
    """Look up many ids with GET requests of CHUNK ids each."""
    ids, rows = sorted(set(ids)), []
    for i in range(0, len(ids), CHUNK):
        rows += fetch_all(resource, {f"{id_field}__in": ",".join(ids[i:i + CHUNK]), **(extra or {})})
    return rows


def release():
    s = get_json(f"{API}/status.json")
    return s["chembl_db_version"], s["chembl_release_date"]
PY
python3 -c "import chembl_api; print(chembl_api.release())"
```

Printed `('ChEMBL_37', '2026-05-01')`. Here is the refusal working on a misspelled filter:

```python
from chembl_api import fetch_all

try:
    fetch_all("activity", {"target_chembl": "CHEMBL5888"})      # should be target_chembl_id
except SystemExit as e:
    print(e)
```

```
refusing: activity filter matches 24,527,044 rows, over max_rows 100,000. An unknown or misspelled filter is ignored, not rejected, so check the names.
```

## From a UniProt accession to the right target

ChEMBL attaches every assay to one **target**, and a target is not a protein. Its
`target_type` can be `SINGLE PROTEIN`, `PROTEIN COMPLEX`, `PROTEIN FAMILY`,
`SELECTIVITY GROUP`, `PROTEIN-PROTEIN INTERACTION`, `CHIMERIC PROTEIN`, or a non-molecular
type such as a cell line or an organism. The same gene in a different species is a separate
target. Ask which targets contain an accession:

```python
from collections import Counter
from chembl_api import fetch_all

ACCESSION = "P24941"   # CDK2, human
targets = fetch_all("target", {"target_components__accession": ACCESSION,
                               "only": "target_chembl_id,target_type,pref_name,organism,target_components"})
for t in sorted(targets, key=lambda t: (t["target_type"] != "SINGLE PROTEIN", t["target_type"])):
    print(f"{t['target_chembl_id']:<14} {t['target_type']:<27} {len(t['target_components'])} components  {t['pref_name']}")
print(Counter(t["target_type"] for t in targets))
```

On 2026-10-21 (ChEMBL_37) this listed 21 targets, abridged here:

```
CHEMBL301      SINGLE PROTEIN              1 components  Cyclin-dependent kinase 2
CHEMBL1907605  PROTEIN COMPLEX             2 components  Cyclin-dependent kinase 2/cyclin E1
CHEMBL3038469  PROTEIN COMPLEX             2 components  CDK2/Cyclin A2
...
CHEMBL3559691  PROTEIN FAMILY              20 components  Cyclin-dependent kinase
CHEMBL4523689  PROTEIN-PROTEIN INTERACTION 2 components  Protein cereblon/Cyclin-dependent kinase 2
CHEMBL2111326  SELECTIVITY GROUP           2 components  Cyclin-dependent kinase 2 and 4 (CDK2 and CDK4)
Counter({'PROTEIN COMPLEX': 11, 'PROTEIN-PROTEIN INTERACTION': 5, 'PROTEIN FAMILY': 3, 'SINGLE PROTEIN': 1, 'SELECTIVITY GROUP': 1})
```

Two consequences:

- **The single-protein target can hold the minority of the data.** CDK2 is usually assayed
  with its cyclin. On 2026-10-21, CHEMBL301 had 3,454 activities with a pChEMBL value, and four
  CDK2/cyclin complexes held another 6,219 (CHEMBL1907605 2,943, CHEMBL3038469 1,400,
  CHEMBL2094128 1,151, CHEMBL2094126 725). Decide which complexes count as "CDK2" for your
  question, pull each one, and keep the target as a column rather than pooling them. A
  complex's assays are scored 7 or 6, never 9, so any confidence filter has to follow the
  target type. The SAR builder below does this. Many complex assays are scored 6, a
  homologous assignment, so a floor of 7 keeps only the direct ones: on CHEMBL2094126, 58
  of its 124 assays are 6.
- **A family or selectivity-group target is not evidence about one protein.** An activity
  against "Cyclin-dependent kinase" (20 components) does not say which CDK was inhibited.

The release ships the same mapping as a file, `chembl_uniprot_mapping.txt` (see **Get the
files**). It lists every target type, not only single proteins, so filter on its fourth
column.

## Reading an activity row

One target's rows, summarised. ABL1 is a good teacher because it has mutant constructs and
an approved drug sold as a salt. It is 25 pages, so this takes about four and a half minutes:

```python
from collections import Counter
from chembl_api import fetch_all

TARGET = "CHEMBL1862"   # ABL1, human
acts = fetch_all("activity", {"target_chembl_id": TARGET, "only": ",".join([
    "standard_type", "standard_relation", "standard_units", "pchembl_value",
    "data_validity_comment", "potential_duplicate", "assay_variant_mutation",
    "molecule_chembl_id", "parent_molecule_chembl_id", "assay_type"])})
assays = fetch_all("assay", {"target_chembl_id": TARGET, "only": "assay_type,confidence_score"})


def show(label, counter, n=6):
    print(f"{label}: " + ", ".join(f"{k!r}={v}" for k, v in counter.most_common(n)))


print(len(acts), "activity rows")
show("standard_type", Counter(a["standard_type"] for a in acts))
show("standard_units", Counter(a["standard_units"] for a in acts))
show("standard_relation", Counter(a["standard_relation"] for a in acts), 9)
show("assay_type (rows)", Counter(a["assay_type"] for a in acts))
show("confidence_score (assays)", Counter(x["confidence_score"] for x in assays))
show("data_validity_comment", Counter(a["data_validity_comment"] for a in acts))
show("potential_duplicate", Counter(a["potential_duplicate"] for a in acts))
show("variant", Counter(a["assay_variant_mutation"] for a in acts), 5)
print("rows with a pChEMBL value:", sum(a["pchembl_value"] is not None for a in acts))
print("rows tested as a salt or other non-parent form:",
      sum(a["molecule_chembl_id"] != a["parent_molecule_chembl_id"] for a in acts))
```

On 2026-10-21 (ChEMBL_37):

```
24904 activity rows
standard_type: 'Inhibition'=7204, 'IC50'=5295, 'Kd'=1912, 'kon'=1908, 'k_off'=1908, 'Ki'=1781
standard_units: '%'=10564, 'nM'=8877, None=2217, 's-1'=1908, 'C'=1205, 'K'=26
standard_relation: '='=21480, '>'=2143, None=632, '<'=605, '>='=16, '~'=16, '<='=12
assay_type (rows): 'B'=24054, 'F'=788, 'A'=62
confidence_score (assays): 9=2450, 8=318
data_validity_comment: None=24853, 'Outside typical range'=48, 'Potential transcription error'=3
potential_duplicate: 0=24062, 1=842
variant: None=15412, 'T315I'=2004, 'Q252H'=1402, 'H396P'=1389, 'E255K'=1158
rows with a pChEMBL value: 6314
rows tested as a salt or other non-parent form: 1674
```

Every line of that is a decision the reader has to make. In turn:

**`standard_type`, `standard_value`, `standard_units`.** ChEMBL keeps what the paper
published (`type`, `value`, `units`, `relation`) and its own standardised version
(`standard_*`). The paper's 0.041 µM becomes `standard_value` 41.0 nM. Use the standard fields.
Standardisation converts log values back to concentrations, rounds the result, and does
not cover every type. More than a quarter of ABL1's rows are `Inhibition` in `%`. That is a single-concentration readout, not a dose–response, and it
cannot be put on the same axis as an IC50. Rows with units such as `ug.mL-1` cannot become
molar without a molecular weight. Filter on `standard_type` first and on `standard_units`
second.

**`standard_relation`.** `=` is a measured value. `>` means the true value is larger than
the number, which for an IC50 means *weaker* than stated: `IC50 > 10000 nM` is "inactive at
the top concentration tested". `<` is the reverse, and `>=`, `<=`, `>>` and `<<` are what they
look like. `~` is approximate. The dump's schema allows exactly those eight. A `None` relation
means the row has no numeric value at all. That held for all 5,307 such rows on NIK, ABL1
and EGFR. The result is then text, such as `Not active` in `standard_text_value` or
`Not Determined` in `activity_comment`.

**On a log scale the inequality flips.** IC50 > 10 µM is pIC50 < 5. ChEMBL gives none of
the censored rows a pChEMBL. Dropping them without a trace biases a SAR table
toward the compounds that worked, so the builder below keeps them as bounds in their own
column.

**`pchembl_value`.** This is −log10 of a molar half-maximal or affinity value. The FAQ defines
when it is filled: `standard_type` is one of IC50, XC50, EC50, AC50, Ki, Kd, Potency or ED50;
`standard_relation` is `=`; `standard_units` is `nM`; `standard_value` is above zero; and
`data_validity_comment` is empty or `Manually validated`. That held in both directions on every
row tested on 2026-10-21. That was all 86,983 activities of NIK, ABL1 and EGFR, plus 8,000 rows
sampled across the whole table. pChEMBL agreed with `9 − log10(standard_value)` to within
0.0055 on every row. It is stored to two decimals, and differences above 0.005 mean it was computed
before the standard value was rounded. Test agreement at 0.01, not exact equality. pChEMBL puts different
measurements on one scale. It does not make them the same measurement. An IC50 depends on assay
conditions (substrate and ATP concentration, for a kinase), and a Ki or Kd is a different
quantity. Keep `standard_type` as a column, and never take a median across types.

**`assay_type`.** The assay's type, copied onto each activity: **B** binding (Ki, IC50 or Kd
against a molecular target), **F** functional (a biological effect, often in cells), **A**
ADME, **T** toxicity, **P** physicochemical (no biological material), **U** unclassified. A
cellular IC50 against ABL1 is `F` and belongs in a different column from a biochemical one.

**`confidence_score`.** This sits on the **assay**, not the activity row. The activity
endpoint does not return it, so fetch the target's assays and join on `assay_chembl_id`. It
scores how specifically the assay was mapped to its target:

| score | meaning (FAQ wording, abridged) |
|---|---|
| 9 | direct single protein target |
| 8 | homologous single protein target |
| 7 / 6 | direct / homologous protein complex subunits |
| 5 / 4 | multiple direct / homologous protein targets, such as a family |
| 3 | molecular target that is not a protein |
| 1 | non-molecular target (cell line, organism) |
| 0 | target assignment not yet curated |

Score 8 includes assays whose source species was not stated, which default to human. 318 of
ABL1's 2,768 assays are scored 8, and 3,818 of its binding-assay IC50, Ki and Kd rows come
from them. Requiring 9 is strict. Accepting 8 trades certainty about the species for
coverage. Choose deliberately, and say which you chose.

**`data_validity_comment`.** These are ChEMBL's flags on suspect values: `Outside typical
range`, `Potential transcription error` (a value that differs from another by exactly 10³
or 10⁶, usually a unit slip), `Potential author error`, `Potential missing data`,
`Non standard unit for type`, `Author confirmed error`, and `Manually validated`, which marks
a checked value that is fine. Drop everything flagged except `Manually validated`. Counts
across ChEMBL_37 on 2026-10-21: Outside typical range 345,635; Potential transcription error
4,398; Potential missing data 2,509; Manually validated 505 (373 of them with a pChEMBL);
Potential author error 155; Author confirmed error 2; Non standard unit for type 0.

**`potential_duplicate`.** A `1` marks a row ChEMBL judges to be a later paper citing an
earlier measurement: same compound, target, type, value and unit. It is not an independent
replicate. 355,508 activities carried the flag in ChEMBL_37. Drop them when counting
measurements or taking a median.

**`assay_variant_mutation`.** The construct was not wild type. More than a third of ABL1's rows
are against mutants, including the gatekeeper T315I. Mixing them into a wild-type SAR is a
classic error, and so is dropping them when resistance is the question. ChEMBL 37 also
added a `modality` field, which marks about 29,000 targeted-protein-degradation activities
(on EGFR, 1,449 rows). These are degraders, often reported as DC50 rather than IC50.

## Parents and salts

A compound tested as a salt is a separate molecule record. Its `parent_molecule_chembl_id`
points at the free base, and the `canonical_smiles` on the activity row is the salt's:

```python
from chembl_api import fetch_all, fetch_by_ids

for m in fetch_by_ids("molecule", "molecule_chembl_id", ["CHEMBL941", "CHEMBL1642"],
                      {"only": "molecule_chembl_id,pref_name,molecule_hierarchy"}):
    print(m["molecule_chembl_id"], m["pref_name"], "-> parent", m["molecule_hierarchy"]["parent_chembl_id"])
for field in ("molecule_chembl_id", "parent_molecule_chembl_id"):
    n = len(fetch_all("activity", {field: "CHEMBL941", "target_chembl_id": "CHEMBL1862",
                                   "only": "activity_id"}))
    print(f"ABL1 activities with {field}=CHEMBL941: {n}")
```

```
CHEMBL941 IMATINIB -> parent CHEMBL941
CHEMBL1642 IMATINIB MESYLATE -> parent CHEMBL941
ABL1 activities with molecule_chembl_id=CHEMBL941: 160
ABL1 activities with parent_molecule_chembl_id=CHEMBL941: 173
```

Filtering on `molecule_chembl_id` misses the 13 rows measured on imatinib mesylate. Group,
filter and count on `parent_molecule_chembl_id`, and take the structure for the SAR table
from the **parent's** molecule record. In the dump, the same link is the
`molecule_hierarchy` table (`molregno` to `parent_molregno`).

## Get the files

### A clean SAR table for one target, from the API

This writes `chembl_sar_<target>.csv`, with one row per parent compound per activity type,
and `chembl_sar_<target>.provenance.json`. The second file is the summary. It records the
release, the target and its UniProt accessions, every filter, how many rows each rule
removed, and the attribution line the licence asks for. The CSV holds only data. Read the
JSON to see what was decided and correct it. The rules are applied in order, and each
excluded row is counted under the first rule it fails:

1. binding assays only (`assay_type` B);
2. assay `confidence_score` of at least the minimum for the target's type, from
   `MIN_CONFIDENCE`: 9 for a `SINGLE PROTEIN` (direct single-protein assignment) and 7 for a
   `PROTEIN COMPLEX` (direct complex-subunit assignment). Lower them to 8 and 6 to admit
   homologous assignments;
3. wild-type constructs only (no `assay_variant_mutation`);
4. no `data_validity_comment` except `Manually validated`;
5. no `potential_duplicate`;
6. censored values (`>`, `<`, `>=`, `<=`, `>>`, `<<`) are kept as bounds on the pChEMBL
   scale in `censored_bounds`, and approximate values (`~`) in `approximate`, never as
   measurements;
7. a measured row must carry a pChEMBL value.

The confidence minimum has to follow the target type. A complex target's assays are never
scored 9 or 8, because those scores mean a single protein. On 2026-10-21 the four CDK2/cyclin
complexes named above had only scores 7 and 6 (CHEMBL1907605: 318 and 33; CHEMBL3038469:
371 and 3; CHEMBL2094128: 172 and 118; CHEMBL2094126: 66 and 58). A fixed minimum of 9
therefore excludes every row of a complex.

The script refuses a target whose type has no entry in `MIN_CONFIDENCE`, which covers
families, selectivity groups and non-molecular targets. It refuses to write if the ChEMBL
release changed during the run. If no row survives the filters, it still writes the
provenance JSON, then exits naming the rule that removed the most rows, with the counts.
`MAX_ROWS` is the row ceiling passed to the helper. Raise it deliberately for a target with
more than 100,000 activities of the chosen types.

```bash
cat > chembl_sar.py <<'PY'
"""Per-compound SAR table for one ChEMBL target, with every exclusion counted."""
import csv
import json
import math
import os
import statistics
import sys
from collections import Counter, defaultdict

from chembl_api import API, fetch_all, fetch_by_ids, get_json, release

TARGET = sys.argv[1] if len(sys.argv) > 1 else "CHEMBL1862"   # ABL1, human
TYPES = ["IC50", "Ki", "Kd"]          # each type stays in its own rows; never pooled
# Minimum assay confidence_score per target type. 9/7 = direct single protein / complex;
# lower to 8/6 to admit homologous assignments. Types not listed here are refused.
MIN_CONFIDENCE = {"SINGLE PROTEIN": 9, "PROTEIN COMPLEX": 7}
MAX_ROWS = 100_000                    # ceiling on activity rows; raise deliberately for huge targets
KEEP_VALIDITY = {None, "Manually validated"}
FLIP = {">": "<", ">=": "<=", ">>": "<<", "<": ">", "<=": ">=", "<<": ">>"}

rel = release()
target = get_json(f"{API}/target/{TARGET}.json")
accessions = [c["accession"] for c in target["target_components"]]
if target["target_type"] not in MIN_CONFIDENCE:
    raise SystemExit(f"refusing: {TARGET} is a {target['target_type']} ({target['pref_name']}), "
                     f"not one of {sorted(MIN_CONFIDENCE)}")
min_conf = MIN_CONFIDENCE[target["target_type"]]

assays = {a["assay_chembl_id"]: a for a in fetch_all("assay", {
    "target_chembl_id": TARGET, "only": "assay_chembl_id,assay_type,confidence_score"})}
acts = fetch_all("activity", {
    "target_chembl_id": TARGET, "standard_type__in": ",".join(TYPES),
    "only": ",".join([
        "activity_id", "assay_chembl_id", "document_chembl_id", "molecule_chembl_id",
        "parent_molecule_chembl_id", "standard_type", "standard_relation", "standard_value",
        "standard_units", "pchembl_value", "data_validity_comment", "potential_duplicate",
        "assay_variant_mutation"])}, max_rows=MAX_ROWS)


def reason(a):
    """The first rule a row fails, or None if it is kept as a measured value."""
    assay = assays[a["assay_chembl_id"]]
    if assay["assay_type"] != "B":
        return f"assay_type {assay['assay_type']}, not binding"
    if (assay["confidence_score"] or 0) < min_conf:
        return f"confidence_score {assay['confidence_score']} (minimum {min_conf})"
    if a["assay_variant_mutation"]:
        return "mutant or variant construct"
    if a["data_validity_comment"] not in KEEP_VALIDITY:
        return f"data_validity_comment: {a['data_validity_comment']}"
    if a["potential_duplicate"] == 1:
        return "potential_duplicate"
    if a["standard_relation"] in FLIP:
        return "censored"
    if a["standard_relation"] == "~":
        return "approximate"
    if a["pchembl_value"] is None:
        return "no pChEMBL (relation, units or value)"
    return None


def p_scale(a):
    """9 - log10(nM), or None when the value cannot go on the pChEMBL scale."""
    v = a["standard_value"]
    if a["standard_units"] == "nM" and v is not None and float(v) > 0:
        return 9 - math.log10(float(v))
    return None


kept, bounds, approx, seen = (defaultdict(list) for _ in range(4))
dropped = Counter()
for a in acts:
    r, p = reason(a), p_scale(a)
    key = (a["parent_molecule_chembl_id"], a["standard_type"])
    if r is None:
        kept[key].append(a)
    elif r == "censored" and p is not None:
        # IC50 > 10000 nM is pIC50 < 5: the inequality flips on the log scale.
        bounds[key].append(f"{FLIP[a['standard_relation']]}{p:.2f}")
        dropped["censored, kept as a bound"] += 1
    elif r == "approximate" and p is not None:
        approx[key].append(f"~{p:.2f}")
        dropped["approximate (~), kept in its own column"] += 1
    else:
        dropped[r if r not in ("censored", "approximate") else f"{r}, not in nM"] += 1
        continue
    seen[key].append(a)

if release() != rel:
    raise SystemExit(f"ChEMBL release changed during the run ({rel} -> {release()}); run again")
out = f"chembl_sar_{TARGET}.csv"
prov = {
    "chembl_release": rel[0], "release_date": rel[1],
    "target": TARGET, "target_name": target["pref_name"], "target_type": target["target_type"],
    "organism": target["organism"], "uniprot": accessions, "standard_types": TYPES,
    "filters": {"assay_type": "B", "min_confidence_score": min_conf,
                "data_validity_comment_kept": ["(none)", "Manually validated"],
                "potential_duplicate": 0, "assay_variant_mutation": "(none)",
                "grouped_by": "parent_molecule_chembl_id, standard_type",
                "aggregate": "median of pchembl_value"},
    "activity_rows": len(acts), "rows_kept": sum(map(len, kept.values())),
    "rows_excluded": dict(dropped.most_common()),
    "table_rows": len(seen), "csv": out if seen else None,
    "attribution": f"ChEMBL data is from http://www.ebi.ac.uk/chembl - the version of ChEMBL is {rel[0].lower()}",
    "required_attribution": "keep the ChEMBL IDs and display the ChEMBL release number",
    "licence": "CC BY-SA 3.0 Unported, https://creativecommons.org/licenses/by-sa/3.0/",
}
with open(out.replace(".csv", ".provenance.json"), "w") as fh:
    json.dump(prov, fh, indent=2)
if not seen:
    if os.path.exists(out):           # a CSV left by an earlier run would contradict "csv": null
        os.remove(out)
    top = dropped.most_common(1)
    raise SystemExit(
        f"no rows survived for {TARGET}: {len(acts)} {'/'.join(TYPES)} activity rows; "
        + (f"the rule that removed the most was '{top[0][0]}' ({top[0][1]} of {len(acts)}); "
           if top else "the target has no activities of these types; ")
        + f"all exclusions {dict(dropped.most_common())}. No CSV written; see the provenance JSON.")

mols = {m["molecule_chembl_id"]: m for m in fetch_by_ids(
    "molecule", "molecule_chembl_id", {k[0] for k in seen},
    {"only": "molecule_chembl_id,pref_name,molecule_structures"})}
rows = []
for key in sorted(seen):
    parent, stype = key
    vals = [float(a["pchembl_value"]) for a in kept.get(key, [])]
    mol = mols.get(parent) or {}
    struct = mol.get("molecule_structures") or {}
    rows.append({
        "parent_chembl_id": parent, "pref_name": mol.get("pref_name") or "",
        "standard_type": stype, "n_measured": len(vals),
        "pchembl_median": f"{statistics.median(vals):.2f}" if vals else "",
        "pchembl_min": f"{min(vals):.2f}" if vals else "",
        "pchembl_max": f"{max(vals):.2f}" if vals else "",
        "censored_bounds": ";".join(sorted(bounds.get(key, []))),
        "approximate": ";".join(sorted(approx.get(key, []))),
        "n_documents": len({a["document_chembl_id"] for a in seen[key] if a["document_chembl_id"]}),
        "tested_as": ";".join(sorted({a["molecule_chembl_id"] for a in seen[key]})),
        "canonical_smiles": struct.get("canonical_smiles", ""),
        "standard_inchi_key": struct.get("standard_inchi_key", ""),
    })
rows.sort(key=lambda r: (r["standard_type"], -float(r["pchembl_median"] or -1)))
with open(out, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

salts = sum(any(a["molecule_chembl_id"] != a["parent_molecule_chembl_id"] for a in v)
            for v in seen.values())
print(f"{rel[0]}: {TARGET} {target['pref_name']} ({target['target_type']}, {target['organism']}, "
      f"{','.join(accessions)}); minimum confidence {min_conf}")
print(f"{len(acts)} {'/'.join(TYPES)} rows; kept {prov['rows_kept']}; excluded {sum(dropped.values())}")
for r, n in dropped.most_common():
    print(f"  {n:6d}  {r}")
print(f"{len(rows)} parent x type rows in {out}; {salts} include a salt or other non-parent form")
for stype in TYPES:
    sub = [r for r in rows if r["standard_type"] == stype and r["n_measured"]]
    spread = sum(float(r["pchembl_max"]) - float(r["pchembl_min"]) > 1 for r in sub)
    print(f"  {stype}: {len(sub)} compounds measured, {spread} spread over more than 1 log unit")
PY
python3 chembl_sar.py CHEMBL1862
python3 chembl_sar.py CHEMBL1907605     # CDK2/cyclin E1, a PROTEIN COMPLEX: minimum confidence 7
```

On 2026-10-21 (ChEMBL_37), in about five minutes for both targets:

```
ChEMBL_37: CHEMBL1862 Tyrosine-protein kinase ABL1 (SINGLE PROTEIN, Homo sapiens, P00519); minimum confidence 9
8988 IC50/Ki/Kd rows; kept 2011; excluded 6977
    3818  confidence_score 8 (minimum 9)
    1260  mutant or variant construct
     788  assay_type F, not binding
     652  censored, kept as a bound
     306  potential_duplicate
      91  no pChEMBL (relation, units or value)
      46  assay_type A, not binding
      13  data_validity_comment: Outside typical range
       3  data_validity_comment: Potential transcription error
2329 parent x type rows in chembl_sar_CHEMBL1862.csv; 49 include a salt or other non-parent form
  IC50: 1010 compounds measured, 20 spread over more than 1 log unit
  Ki: 626 compounds measured, 12 spread over more than 1 log unit
  Kd: 110 compounds measured, 6 spread over more than 1 log unit
ChEMBL_37: CHEMBL1907605 Cyclin-dependent kinase 2/cyclin E1 (PROTEIN COMPLEX, Homo sapiens, P24864,P24941); minimum confidence 7
4276 IC50/Ki/Kd rows; kept 2234; excluded 2042
    1196  censored, kept as a bound
     599  potential_duplicate
     167  confidence_score 6 (minimum 7)
      45  data_validity_comment: Outside typical range
      34  no pChEMBL (relation, units or value)
       1  censored, not in nM
3205 parent x type rows in chembl_sar_CHEMBL1907605.csv; 20 include a salt or other non-parent form
  IC50: 1179 compounds measured, 2 spread over more than 1 log unit
  Ki: 887 compounds measured, 12 spread over more than 1 log unit
  Kd: 0 compounds measured, 0 spread over more than 1 log unit
```

Only 2,011 of 8,988 rows survive. On ABL1 the biggest single cut is the confidence rule:
3,818 rows fail it first. Lowering the single-protein minimum to 8 passes them on to the
later rules. Whether to do that is the reader's call. On the CDK2/cyclin E1 complex the
minimum of 7 keeps 2,234 of 4,276 rows. With a minimum of 9 the same complex would have kept
none.

The table's columns are:

- the parent id and name, and the type;
- `n_measured` and the median, minimum and maximum pChEMBL of the measured rows;
- `censored_bounds` such as `<5.00`, and `approximate` values such as `~6.10`;
- `n_documents` and `tested_as`, the documents and the forms actually tested, counted over
  every row in the table, bounds and approximations included;
- the parent's SMILES and InChIKey.

A row with an empty median holds only bounds or approximations. Compounds whose measurements
spread more than one log unit are worth opening before you trust the median. The same script
on NIK (`CHEMBL5888`) kept 925 of 1,902 rows.

When nothing survives, the script says why. Run against CDK2/cyclin E (`CHEMBL2094126`) with
the complex minimum wrongly set to 9, it wrote the provenance JSON with `"csv": null` and
exited with `no rows survived for CHEMBL2094126: 962 IC50/Ki/Kd activity rows; the rule that
removed the most was 'confidence_score 6 (minimum 9)' (769 of 962); all exclusions
{'confidence_score 6 (minimum 9)': 769, 'confidence_score 7 (minimum 9)': 193}. No CSV
written; see the provenance JSON.` A protein family such as `CHEMBL3559691` is refused before
any activity is fetched.

From here, `datamol` standardises the SMILES and clusters the series. `pubchef` matches the
InChIKeys against literature-mined compound functions. `open-targets` places the target in its
disease evidence, and that evidence includes ChEMBL's own drug and clinical-candidate records.

### The UniProt mapping file

```bash
REL=37
curl -fsS -o chembl_${REL}_uniprot_mapping.txt \
  https://ftp.ebi.ac.uk/pub/databases/chembl/ChEMBLdb/releases/chembl_${REL}/chembl_uniprot_mapping.txt
head -1 chembl_${REL}_uniprot_mapping.txt
awk -F'\t' '!/^#/ {n[$4]++} END {for (t in n) print n[t], t}' chembl_${REL}_uniprot_mapping.txt | sort -rn | head -4
awk -F'\t' '$1 == "P24941" && $4 == "SINGLE PROTEIN"' chembl_${REL}_uniprot_mapping.txt
```

On 2026-10-21 this downloaded 1,254,330 B and printed:

```
# chembl_37 target list, 01/05/2026
11055 SINGLE PROTEIN
1738 PROTEIN-PROTEIN INTERACTION
1605 PROTEIN COMPLEX
1568 PROTEIN FAMILY
P24941	CHEMBL301	Cyclin-dependent kinase 2	SINGLE PROTEIN
```

The columns are UniProt accession, target id, preferred name and target type, with one row
per accession and target pair, so the counts above are pairs, not targets. The file is not
listed in `checksums.txt`.

### The whole database

Use a dump when a question spans many targets, when you need SQL joins the API does not
offer, or when the analysis must be pinned to one release. Pin the release directory
(`releases/chembl_37/`) rather than `latest/`, which moves when ChEMBL 38 ships. Sizes measured
on 2026-10-21 from `Content-Length` and from the tar headers:

| file | download | unpacked |
|---|---|---|
| `chembl_37_sqlite.tar.gz` | 5,764,252,857 B | one 30,480,314,368 B `chembl_37.db` |
| `chembl_37_postgresql.tar.gz` | 2,088,889,426 B | one 2,160,344,468 B `pg_restore` archive, much larger once restored |
| `chembl_37_mysql.tar.gz` | 2,101,694,224 B | not measured |
| `chembl_37_chemreps.txt.gz` | 292,540,141 B | SMILES, InChI and InChIKey for every compound |

SQLite needs no server, so it is the simplest to start with. Budget about 36 GB of disk for the
tarball and the database together, and delete the tarball afterwards. The PostgreSQL archive
loads with `pg_restore --no-owner -d chembl_37 chembl_37_postgresql.dmp` into a database you
have created. The release README names the server versions the dumps were built for: SQLite 3.26.0,
PostgreSQL 10.15 and MySQL 5.7.27. For the schema, the directory holds
`schema_documentation.html` and `schema_documentation.txt`, which the README lists with a
`chembl_37_` prefix they do not have, and `chembl_37_schema.pdf`. The schema PNG the README
lists was not there on 2026-10-21.

**Ask the user before running the download.** It transfers 5.76 GB and needs about 36 GB of
free disk for the tarball and the database together. The block checks free space first and
refuses with a message if there is too little. **This block was not run in full here:** the
link to the EBI FTP server was too slow. Its free-space check, checksum, resume and failure
paths were run on `chembl_37_bio.fa.gz` from the same release directory.

```bash
REL=37
FILE=chembl_${REL}_sqlite.tar.gz          # 5,764,252,857 B; unpacks to a 30,480,314,368 B database
NEED_KB=36000000                          # tarball plus database, about 36 GB
BASE=https://ftp.ebi.ac.uk/pub/databases/chembl/ChEMBLdb/releases/chembl_${REL}
AVAIL_KB=$(df -Pk . | awk 'NR == 2 {print $4}')
if ! [ "$AVAIL_KB" -ge "$NEED_KB" ] 2>/dev/null; then    # non-numeric output refuses too
  echo "refusing: free space here reads '$AVAIL_KB' kB, about $NEED_KB kB needed" >&2
  exit 1
fi
curl -fsS -O "$BASE/checksums.txt"
curl -f -C - -O "$BASE/$FILE"             # rerun the same line to resume an interrupted transfer
awk -v f="$FILE" '$2 == f {print $1 "  " $2}' checksums.txt | shasum -a 256 -c -   # Linux: sha256sum -c -
tar -xzf "$FILE"
ls -l chembl_${REL}/chembl_${REL}_sqlite/
```

`shasum -c` (or `sha256sum -c` on Linux) prints `chembl_37_sqlite.tar.gz: OK`, or `FAILED`, in which case delete the file
and fetch it again. The `awk` line prints nothing for a file name that is not in
`checksums.txt`, and `shasum` then exits non-zero with `no properly formatted SHA checksum
lines found`.

The same SAR filters in SQL. The dump has no `parent_molecule_chembl_id` or
`assay_variant_mutation` columns. They become a join to `molecule_hierarchy` and the assay's
`variant_id`. **This block has been validated only against the chembl_37 schema, empty and
with synthetic rows. Its output has not been checked on the real database.** Run it from the
directory you extracted into:

```python
import csv
import sqlite3
import statistics
from collections import defaultdict

DB = "chembl_37/chembl_37_sqlite/chembl_37.db"
TARGET = "CHEMBL1862"
MIN_CONFIDENCE = {"SINGLE PROTEIN": 9, "PROTEIN COMPLEX": 7}   # as in the API builder

SQL = """
SELECT pmd.chembl_id   AS parent_chembl_id,
       act.standard_type,
       act.pchembl_value,
       d.chembl_id     AS document_chembl_id,
       cs.canonical_smiles
FROM activities act
JOIN assays a               ON a.assay_id = act.assay_id
JOIN target_dictionary td   ON td.tid = a.tid
LEFT JOIN docs d            ON d.doc_id = act.doc_id
LEFT JOIN molecule_hierarchy mh ON mh.molregno = act.molregno
JOIN molecule_dictionary pmd    ON pmd.molregno = COALESCE(mh.parent_molregno, act.molregno)
LEFT JOIN compound_structures cs ON cs.molregno = pmd.molregno
WHERE td.chembl_id = ?
  AND a.assay_type = 'B'
  AND a.confidence_score >= ?
  AND a.variant_id IS NULL
  AND act.standard_type IN ('IC50', 'Ki', 'Kd')
  AND act.pchembl_value IS NOT NULL
  AND act.potential_duplicate = 0
  AND (act.data_validity_comment IS NULL OR act.data_validity_comment = 'Manually validated')
"""

con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
version = con.execute("SELECT name FROM version").fetchone()[0]
target = con.execute("SELECT target_type, pref_name FROM target_dictionary WHERE chembl_id = ?",
                     (TARGET,)).fetchone()
if target is None:
    raise SystemExit(f"refusing: {TARGET} is not a target in {version}")
if target[0] not in MIN_CONFIDENCE:
    raise SystemExit(f"refusing: {TARGET} is a {target[0]} ({target[1]}), "
                     f"not one of {sorted(MIN_CONFIDENCE)}")
groups, smiles, docs = defaultdict(list), {}, defaultdict(set)
for parent, stype, p, doc, smi in con.execute(SQL, (TARGET, MIN_CONFIDENCE[target[0]])):
    groups[(parent, stype)].append(float(p))
    if doc:
        docs[(parent, stype)].add(doc)
    smiles[parent] = smi
with open(f"chembl_sar_{TARGET}_{version}.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["parent_chembl_id", "standard_type", "n_measured", "pchembl_median",
                "n_documents", "canonical_smiles"])
    for (parent, stype), vals in sorted(groups.items()):
        w.writerow([parent, stype, len(vals), f"{statistics.median(vals):.2f}",
                    len(docs[(parent, stype)]), smiles[parent]])
print(version, len(groups), "parent x type rows")
```

It applies the API builder's filters, including the confidence minimum per target type, and
refuses other target types before querying activities. There are two differences. It drops censored and
approximate rows rather than keeping them in their own columns, and it treats any assay with
a `variant_id` as a variant.

## Try it

**Data.** The live ChEMBL REST API, which is anonymous and needs no key. The target is NIK,
MAP3K14 (`CHEMBL5888`, UniProt Q99558), a kinase with about 1,900 IC50, Ki and Kd rows, so the
block runs in under a minute. ChEMBL data is CC BY-SA 3.0. The block prints counts and writes
no ChEMBL data to disk. It needs only `python3`. Confirmed reachable on 2026-10-21.

**Run.** In an empty directory:

```bash
cat > chembl_check.py <<'PY'
import json, math, re, statistics, time, urllib.parse, urllib.request
from collections import Counter, defaultdict

HOST = "https://www.ebi.ac.uk"
API = HOST + "/chembl/api/data"
TARGET, ACCESSION = "CHEMBL5888", "Q99558"          # NIK (MAP3K14), human
PCHEMBL_TYPES = {"IC50", "XC50", "EC50", "AC50", "Ki", "Kd", "Potency", "ED50"}
OK_VALIDITY = {None, "Manually validated"}


def get(path, **params):
    url = path if path.startswith("http") else f"{API}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for i in range(5):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)
        except Exception:
            if i == 4:
                raise
            time.sleep(2 * (i + 1))


def every(resource, **params):
    page = get(f"{resource}.json", limit=1000, **params)
    key = next(k for k in page if k != "page_meta")
    rows = list(page[key])
    while page["page_meta"]["next"]:
        page = get(HOST + page["page_meta"]["next"])
        rows += page[key]
    return rows, page["page_meta"]["total_count"]


# 1. Release, and two API behaviours that bite: the page cap and silently ignored filters.
status = get("status.json")
assert re.fullmatch(r"ChEMBL_\d+", status["chembl_db_version"]), status
capped = get("activity.json", target_chembl_id=TARGET, limit=5000, only="activity_id")
assert capped["page_meta"]["limit"] == 1000 and len(capped["activities"]) == 1000
typo = get("activity.json", target_chembl=TARGET, limit=1, only="activity_id")  # misspelled key
assert typo["page_meta"]["total_count"] == status["activities"]                # = whole table

# 2. Target and UniProt: the accession maps back to this target, among others.
target = get(f"target/{TARGET}.json")
by_acc, _ = every("target", target_components__accession=ACCESSION,
                  only="target_chembl_id,target_type")
assert ACCESSION in [c["accession"] for c in target["target_components"]]
assert TARGET in {t["target_chembl_id"] for t in by_acc}

# 3. Activities: paging is complete, and pChEMBL means exactly what the skill says.
acts, total = every("activity", target_chembl_id=TARGET, standard_type__in="IC50,Ki,Kd")
assert len({a["activity_id"] for a in acts}) == len(acts) == total
for a in acts:
    eligible = (a["standard_type"] in PCHEMBL_TYPES and a["standard_relation"] == "="
                and a["standard_units"] == "nM" and a["standard_value"] is not None
                and float(a["standard_value"]) > 0 and a["data_validity_comment"] in OK_VALIDITY)
    if a["pchembl_value"] is not None:
        assert eligible, a
        nm = float(a["standard_value"])                       # strings in JSON, not numbers
        assert abs(float(a["pchembl_value"]) - (9 - math.log10(nm))) <= 0.01, a
    else:
        assert not eligible, a
    if a["standard_relation"] in {"<", ">", "<=", ">=", "<<", ">>", "~"}:
        assert a["pchembl_value"] is None, a                   # censored: never a pChEMBL

# 4. Assays: the type vocabulary, and the confidence score lives on the assay.
assays, _ = every("assay", target_chembl_id=TARGET,
                  only="assay_chembl_id,assay_type,confidence_score")
conf = {x["assay_chembl_id"]: x for x in assays}
assert {x["assay_type"] for x in assays} <= set("BFATPU")
assert {a["assay_chembl_id"] for a in acts} <= conf.keys()

# 5. Molecule hierarchy: a salt form points at its parent, and a parent is its own parent.
pairs = {(a["molecule_chembl_id"], a["parent_molecule_chembl_id"]) for a in acts}
ids = sorted({m for p in pairs for m in p})
mols = {}
for i in range(0, len(ids), 100):
    rows, _ = every("molecule", molecule_chembl_id__in=",".join(ids[i:i + 100]),
                    only="molecule_chembl_id,molecule_hierarchy")
    mols.update({m["molecule_chembl_id"]: m["molecule_hierarchy"] for m in rows})
for mol, parent in pairs:
    assert mols[mol] is None or mols[mol]["parent_chembl_id"] == parent, (mol, parent)
    assert mols[parent] is None or mols[parent]["parent_chembl_id"] == parent, parent

# A small clean SAR table: binding, confidence 9, wild type, not a duplicate, measured values
# only. Requiring a pChEMBL already excludes every validity flag except Manually validated.
keep = defaultdict(list)
for a in acts:
    x = conf[a["assay_chembl_id"]]
    if (a["standard_type"] == "IC50" and a["pchembl_value"] and x["assay_type"] == "B"
            and x["confidence_score"] == 9 and not a["assay_variant_mutation"]
            and a["potential_duplicate"] == 0):
        keep[a["parent_molecule_chembl_id"]].append(float(a["pchembl_value"]))
sar = sorted(((statistics.median(v), len(v), p) for p, v in keep.items()), reverse=True)

print(f"{status['chembl_db_version']} ({status['chembl_release_date']}): "
      f"{status['activities']:,} activities, {status['targets']:,} targets")
print(f"{TARGET} {target['pref_name']}: {target['target_type']}, {target['organism']}; "
      f"{ACCESSION} maps to {len(by_acc)} target(s): {dict(Counter(t['target_type'] for t in by_acc))}")
print(f"{len(acts)} IC50/Ki/Kd rows, {sum(a['pchembl_value'] is not None for a in acts)} with pChEMBL; "
      f"relations {dict(Counter(a['standard_relation'] for a in acts))}")
print(f"{len(assays)} assays: type {dict(Counter(x['assay_type'] for x in assays))}, "
      f"confidence {dict(sorted(Counter(x['confidence_score'] for x in assays).items()))}")
print(f"{sum(m != p for m, p in pairs)} salt-to-parent pairs checked; "
      f"{len(sar)} parents in the clean IC50 table; top 3:")
for med, n, p in sar[:3]:
    print(f"  {p}  median pIC50 {med:.2f}  n={n}")
PY
python3 chembl_check.py
```

**Expect.** Run cold in a fresh empty directory on 2026-10-21, this printed:

```
ChEMBL_37 (2026-05-01): 24,527,044 activities, 18,552 targets
CHEMBL5888 Mitogen-activated protein kinase kinase kinase 14: SINGLE PROTEIN, Homo sapiens; Q99558 maps to 1 target(s): {'SINGLE PROTEIN': 1}
1902 IC50/Ki/Kd rows, 1724 with pChEMBL; relations {'=': 1727, '>': 164, '<': 7, None: 3, '>=': 1}
143 assays: type {'B': 143}, confidence {8: 11, 9: 132}
2 salt-to-parent pairs checked; 538 parents in the clean IC50 table; top 3:
  CHEMBL5980321  median pIC50 9.15  n=1
  CHEMBL5883627  median pIC50 9.10  n=1
  CHEMBL5787482  median pIC50 9.10  n=1
```

*Invariants*, asserted by the script, so a failure means the skill is wrong:

- The release name has the form `ChEMBL_<n>`.
- A request for 5,000 rows returns 1,000.
- A misspelled filter matches exactly the whole activity table.
- The target's own UniProt accession maps back to it.
- Paging returns every row once, with a count equal to the server's total.
- A row has a pChEMBL value **if and only if** the FAQ's conditions hold: an eligible type,
  relation `=`, units nM, a positive value, and no validity flag other than `Manually
  validated`.
- Every pChEMBL agrees with `9 − log10(standard_value)` to 0.01.
- No censored row has a pChEMBL.
- Assay types come from B, F, A, T, P and U.
- Every activity's assay belongs to the target.
- Every tested form's parent agrees with the molecule hierarchy, and every parent is its own
  parent.

*Observed values, ChEMBL_37, 2026-10-21*. These move with each release, so a mismatch means
drift to investigate:

- 24,527,044 activities and 18,552 targets.
- NIK has 1,902 IC50, Ki and Kd rows, 1,724 of them with a pChEMBL.
- 143 assays, 132 of them scored 9.
- 2 salt-to-parent pairs.
- 538 parents in the clean IC50 table.
- The top three compounds and their medians.

## Sources

- ChEMBL — <https://www.ebi.ac.uk/chembl/>
- REST API documentation — <https://chembl.gitbook.io/chembl-interface-documentation/web-services/chembl-data-web-services>
- Assay and activity FAQ (pChEMBL, confidence score, data validity, duplicates) — <https://chembl.gitbook.io/chembl-interface-documentation/frequently-asked-questions/chembl-data-questions>
- Licensing and citation FAQ — <https://chembl.gitbook.io/chembl-interface-documentation/frequently-asked-questions/general-questions>
- Release 37 files, `LICENSE`, `README`, release notes and checksums — <https://ftp.ebi.ac.uk/pub/databases/chembl/ChEMBLdb/releases/chembl_37/>
- Zdrazil B, et al. The ChEMBL Database in 2023: a drug discovery platform spanning multiple bioactivity data types and time periods. *Nucleic Acids Res.* 2024;52(D1):D1180–D1192. doi:10.1093/nar/gkad1004. This is the paper ChEMBL asks you to cite, and it is the newest ChEMBL paper in *Nucleic Acids Research* as of 2026-10-21. The licensing FAQ and the release's `REQUIRED.ATTRIBUTION` file still name the 2019 paper (doi:10.1093/nar/gky1075); the FAQ's citation section names the 2023 one, which is newer.
- Davies M, et al. ChEMBL web services: streamlining access to drug discovery data and utilities. *Nucleic Acids Res.* 2015;43(W1):W612–W620. doi:10.1093/nar/gkv352
- Newer ChEMBL papers outside *NAR*: "Fifteen years of ChEMBL and its role in cheminformatics and drug discovery", *J Cheminform* 2025, doi:10.1186/s13321-025-00963-z; and "Drug and Clinical Candidate Drug Data in ChEMBL", *J Med Chem* 2025, doi:10.1021/acs.jmedchem.5c00920.
- Release DOI for ChEMBL 37 — doi:10.6019/CHEMBL.database.37
- Creative Commons Attribution-ShareAlike 3.0 Unported — <https://creativecommons.org/licenses/by-sa/3.0/>
