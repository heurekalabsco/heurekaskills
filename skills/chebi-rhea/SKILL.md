---
name: chebi-rhea
description: Resolve metabolites to ChEBI ids by InChIKey, map them to the pH 7.3 form Rhea uses, and pull Rhea reactions by ChEBI id, EC number or UniProt accession — all four directional Rhea ids per reaction, balanced equations, pinned releases.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, metabolites, metabolic-modeling, cheminformatics, uniprot]
covers: [chebi, rhea, chemical entities of biological interest, reaction knowledgebase, metabolite, small molecule, inchikey, inchi, smiles, ontology, conjugate acid, conjugate base, major microspecies, ph 7.3, protonation state, charge, zwitterion, cross-references, hmdb, kegg, metacyc, biochemical reaction, reaction direction, balanced equation, stoichiometry, ec number, enzyme, uniprot, sparql, identifier mapping]
papers: [PMID:41312627, PMID:34755880, PMID:26467479]
access: [open]
datasets: [https://www.ebi.ac.uk/chebi/backend/api/public/compound/CHEBI:15361/, 'https://www.ebi.ac.uk/chebi/backend/api/public/es_search/?term=QNAYBMKLOCPYGJ-REOHCLBHSA-N', https://ftp.ebi.ac.uk/pub/databases/chebi/flat_files/README, https://ftp.expasy.org/databases/rhea/rhea-release.properties, https://ftp.expasy.org/databases/rhea/tsv/chebi_pH7_3_mapping.tsv, https://ftp.expasy.org/databases/rhea/tsv/rhea-directions.tsv, https://ftp.expasy.org/databases/rhea/tsv/rhea2uniprot_sprot.tsv, 'https://www.rhea-db.org/rhea/?query=uniprot:P14618&columns=rhea-id,equation&format=tsv', https://sparql.rhea-db.org/sparql]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-15
  against: ChEBI 2.0 API (OpenAPI 2.0.0) serving ChEBI release 257 of 2026-11-05 / ChEBI flat files release 257 and archive rel256 / Rhea release 143 of 2026-11-04 via REST, SPARQL and the TSV directory / Python 3.12 standard library only / every block run in page order in one fresh directory including the not-found and malformed-id paths, and Try it run again alone in a fresh mktemp directory
  executed: 13
  unverified: 0
---
# ChEBI and Rhea — metabolite and reaction identifiers

**ChEBI** (EMBL-EBI) is the dictionary of small molecules of biological interest: one id per
chemical entity, with a structure, a charge, an ontology and cross-references. **Rhea** (SIB) is
the curated reaction knowledgebase built on it: every participant in every Rhea reaction is a
ChEBI id, and UniProt uses Rhea ids to say what an enzyme does.

Together they are the identifier backbone under the metabolic skills in this registry —
`human-gem`, `vmh`, `brenda`, `metabolights`, `pubchem` and `uniprot` all carry ChEBI ids or EC
numbers. This page is about getting from a structure to the right ChEBI id, from there to the
right reactions, and never taking a shortcut through a name.

The point that decides almost everything below: **ChEBI gives each protonation state its own
id, and Rhea only uses one of them — the major microspecies at pH 7.3.** Pyruvic acid
(`CHEBI:32816`) and pyruvate (`CHEBI:15361`) are different entries. Rhea's 223 pyruvate
reactions are all written with `CHEBI:15361`; ask Rhea for reactions of `CHEBI:32816` exactly and
you get none.

## Licence and access

No account, no key. Both sources are CC BY 4.0, and both say so themselves:

- ChEBI — "The data on this website is available under the Creative Commons License ( CC BY
  4.0 ), and governed by EMBL-EBI's terms of use" (https://www.ebi.ac.uk/chebi/about). The
  flat-file README adds what attribution means for them: give the ChEBI URL **and the release
  number**.
- Rhea — "Rhea is available under the Creative Commons Attribution 4.0 International (CC BY 4.0)
  License. This means that you are free to copy, distribute, display and make commercial use of
  the database in all legislations, provided you credit Rhea."
  (https://www.rhea-db.org/help/license-disclaimer). The FTP `LICENSE.txt` asks that the
  copyright statement travel with each copy of the files.

One requirement that is not a licence: **Rhea sits behind Cloudflare, which refuses Python's
default `User-Agent`** with `403` and a body of `error code: 1010`. curl's default is accepted.
Send a descriptive `User-Agent` from code, as the helper below does. ChEBI does not care.

## The helper

Every Python block below imports this file. Standard library only.

```bash
cat > chebi_rhea.py <<'EOF'
"""ChEBI + Rhea helpers: ids in, ids out. Standard library only."""
import csv, io, json, os, urllib.error, urllib.parse, urllib.request

CHEBI = "https://www.ebi.ac.uk/chebi/backend/api/public"
RHEA_REST = "https://www.rhea-db.org/rhea/"
RHEA_SPARQL = "https://sparql.rhea-db.org/sparql"
RHEA_TSV = "https://ftp.expasy.org/databases/rhea/tsv/"
# Rhea sits behind Cloudflare, which refuses Python's default User-Agent (403, "error code: 1010").
UA = {"User-Agent": "chebi-rhea-client/1.0 (python urllib)"}


def _open(url, data=None, accept="application/json", timeout=180):
    req = urllib.request.Request(url, data=data, headers={**UA, "Accept": accept})
    return urllib.request.urlopen(req, timeout=timeout)


def chebi_get(path):
    """GET a ChEBI 2.0 API path. Returns (status, parsed JSON or {'detail': text})."""
    try:
        with _open(f"{CHEBI}/{path}") as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(body)
        except ValueError:                      # a malformed id gets an HTML 404
            return e.code, {"detail": body[:80]}


def chebi_by_inchikey(key):
    """Exact InChIKey -> every ChEBI accession carrying it. A list, and often more than one."""
    q = urllib.parse.urlencode({"term": key, "size": 100})
    code, d = chebi_get(f"es_search/?{q}")
    if code == 404:                             # "No compound matches the provided term"
        return []
    if code != 200:
        raise RuntimeError(f"es_search {code}: {d}")
    return sorted({h["_source"]["chebi_accession"] for h in d["results"]
                   if h["_source"].get("inchikey") == key})


def compound(chebi_id):
    """One ChEBI record. A secondary id answers 200 with the primary record - compare ids."""
    code, d = chebi_get(f"compound/{chebi_id}/")
    if code == 404:
        raise LookupError(f"{chebi_id}: not in ChEBI ({d.get('detail')})")
    if code != 200:
        raise RuntimeError(f"{chebi_id}: HTTP {code}")
    return d


def relations(rec, kind):
    """Outgoing ontology edges of one type ('is a', 'is conjugate acid of', ...)."""
    return [(f"CHEBI:{r['final_id']}", r["final_name"])
            for r in rec["ontology_relations"]["outgoing_relations"] if r["relation_type"] == kind]


def xrefs(rec, sources=None):
    """Curated cross-references as {source name: [accessions]}."""
    out = {}
    for x in rec["database_accessions"].get("MANUAL_X_REF", []):
        if sources is None or x["source_name"] in sources:
            out.setdefault(x["source_name"], []).append(x["accession_number"])
    return out


def rhea_tsv(name, cache="rhea_tsv"):
    """Download (once) and parse one file from Rhea's TSV directory."""
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, name)
    if not os.path.exists(path):
        with _open(RHEA_TSV + name, accept="*/*") as r, open(path + ".part", "wb") as f:
            f.write(r.read())
        os.replace(path + ".part", path)
    with open(path, newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def ph73_map():
    """ChEBI id -> ChEBI id of its major microspecies at pH 7.3 (Rhea's own table)."""
    return {f"CHEBI:{r['CHEBI']}": f"CHEBI:{r['CHEBI_PH7_3']}"
            for r in rhea_tsv("chebi_pH7_3_mapping.tsv")}


def sparql(query):
    prefixes = ("PREFIX rh:<http://rdf.rhea-db.org/>\n"
                "PREFIX rdfs:<http://www.w3.org/2000/01/rdf-schema#>\n"
                "PREFIX CHEBI:<http://purl.obolibrary.org/obo/CHEBI_>\n"
                "PREFIX ec:<http://purl.uniprot.org/enzyme/>\n")
    data = urllib.parse.urlencode({"query": prefixes + query}).encode()
    with _open(RHEA_SPARQL, data=data, accept="application/sparql-results+json") as r:
        d = json.load(r)
    return [{k: v["value"] for k, v in b.items()} for b in d["results"]["bindings"]]


def reactions(pattern, page_size=1000):
    """Approved Rhea reactions matching a pattern on ?r, each with its four ids.

    The left side is the one with curatedOrder 1; LR consumes it, RL produces it.
    curatedOrder is typed xsd:long, so a bare `rh:curatedOrder 1` matches nothing - FILTER it.
    """
    q = """SELECT ?master ?lr ?rl ?bi ?balanced ?transport ?eq
                  (GROUP_CONCAT(DISTINCT ?ecn; separator=";") AS ?ec) WHERE {
      ?r rdfs:subClassOf rh:Reaction ; rh:status rh:Approved ; rh:accession ?master ;
         rh:equation ?eq ; rh:isChemicallyBalanced ?balanced ; rh:isTransport ?transport ;
         rh:bidirectionalReaction/rh:accession ?bi ; rh:side ?L .
      ?L rh:curatedOrder ?o . FILTER(?o = 1)
      ?r rh:directionalReaction ?d1 . ?d1 rh:substrates ?L ; rh:accession ?lr .
      ?r rh:directionalReaction ?d2 . ?d2 rh:products ?L ; rh:accession ?rl .
      OPTIONAL { ?r rh:ec ?e . BIND(STRAFTER(STR(?e), "enzyme/") AS ?ecn) }
      %s
    } GROUP BY ?master ?lr ?rl ?bi ?balanced ?transport ?eq ORDER BY ?master
    LIMIT %d OFFSET %d"""
    rows, offset = [], 0
    while True:                   # unpaged, a hub metabolite (water, H+) cuts the stream off
        page = sparql(q % (pattern, page_size, offset))
        rows += page
        if len(page) < page_size:
            return rows
        offset += page_size


def rhea_by_chebi(chebi_id):
    """Reactions with this exact ChEBI entity as a participant - no ontology or charge expansion."""
    n = int(chebi_id.split(":")[1])
    return reactions(f"""?r rh:side/rh:contains/rh:compound ?c .
      {{ ?c rh:chebi CHEBI:{n} }} UNION {{ ?c rh:underlyingChebi CHEBI:{n} }}
      UNION {{ ?c rh:reactivePart/rh:chebi CHEBI:{n} }}""")


def rhea_by_ec(ec_number):
    return reactions(f"?r rh:ec ec:{ec_number} .")


def rhea_by_ids(masters):
    vals = " ".join(f'"{m}"' for m in masters)
    return reactions(f"VALUES ?master {{ {vals} }}") if masters else []


def rhea_rest(query, columns="rhea-id"):
    """Rhea REST search as TSV rows. No `limit` returns every hit; an empty `limit=` breaks it."""
    url = RHEA_REST + "?" + urllib.parse.urlencode({"query": query, "columns": columns, "format": "tsv"})
    with _open(url, accept="text/plain") as r:
        text = r.read().decode()
    return list(csv.DictReader(io.StringIO(text), delimiter="\t"))


def rhea_by_uniprot(accession):
    """Rhea reactions UniProt annotates to this protein, with any physiological direction."""
    masters = [row["Reaction identifier"] for row in rhea_rest(f"uniprot:{accession}")]
    out = rhea_by_ids(masters)
    directed = {}
    for row in rhea_tsv("rhea2uniprot_sprot.tsv"):
        if row["ID"] == accession and row["DIRECTION"] != "UN":
            directed.setdefault(f"RHEA:{row['MASTER_ID']}", []).append(
                (row["DIRECTION"], f"RHEA:{row['RHEA_ID']}"))
    for r in out:
        r["physiological"] = directed.get(r["master"], [])
    return out


def participants(master):
    """Participants of one reaction: side (1 = left), coefficient, ChEBI id, formula, charge."""
    q = """SELECT ?side ?coef ?chebi ?name ?formula ?charge WHERE {
      ?r rh:accession "%s" ; rh:side ?s . ?s rh:curatedOrder ?side ; ?coef ?p .
      ?coef rdfs:subPropertyOf rh:contains . ?p rh:compound ?c . ?c rh:name ?name .
      OPTIONAL { ?c rh:formula ?formula } OPTIONAL { ?c rh:charge ?charge }
      OPTIONAL { ?c rh:chebi ?c1 } OPTIONAL { ?c rh:underlyingChebi ?c2 }
      OPTIONAL { ?c rh:reactivePart/rh:chebi ?c3 }
      BIND(REPLACE(STR(COALESCE(?c1, ?c2, ?c3)), "^.*CHEBI_", "CHEBI:") AS ?chebi)
    } ORDER BY ?side ?name""" % master
    rows = sparql(q)
    for row in rows:
        row["coef"] = row["coef"].rsplit("contains", 1)[1]   # '1', '2', 'N', '2n', 'Nplus1', ...
    return rows
EOF
```

## Releases — read the number, record it

Both services always serve their newest release; neither API takes a version parameter. So
"pinning" here means **reading the release number at fetch time, recording it beside what you
fetched, and knowing where the frozen copy lives**.

| | live release (2026-11-15) | where the number is | frozen copies |
|---|---|---|---|
| ChEBI | 257, 2026-11-05 (monthly) | `flat_files/README`, line `ChEBI Release:` | `archive/relNNN/` from 245 (the first ChEBI 2.0 release); 1.0 releases to 244 under `archive/chebi_legacy/` |
| Rhea | 143, 2026-11-04 (three to five a year) | `rhea-release.properties` | `old_releases/NNN.tar.bz2` (about 400 MB each) |

```python
import re
from chebi_rhea import _open

readme = _open("https://ftp.ebi.ac.uk/pub/databases/chebi/flat_files/README", accept="*/*").read().decode()
chebi_release = int(re.search(r"ChEBI Release:\s*(\d+)", readme).group(1))
props = _open("https://ftp.expasy.org/databases/rhea/rhea-release.properties", accept="*/*").read().decode()
rhea = dict(line.split("=", 1) for line in props.split())
print("ChEBI release", chebi_release, "| Rhea release", rhea["rhea.release.number"], rhea["rhea.release.date"])
```

The newest ChEBI release is **not** in `archive/` yet: `archive/rel257/` does not exist on
2026-11-15, and the OBO PURL `http://purl.obolibrary.org/obo/chebi/257/chebi_lite.obo.gz`
redirects there and answers `404`. To reproduce a run later, either keep your own copy of the
files you read, or work from the newest archived release (`rel256`) and say so.

## Resolve a metabolite to a ChEBI id — by InChIKey

`es_search` is a text search over the whole index; it ranks, it does not match. Filter its hits
to the ones whose `inchikey` equals the key you sent, and **return a list**:

```python
from chebi_rhea import chebi_by_inchikey, compound

for label, key in [("pyruvic acid", "LCTONWCANYUPML-UHFFFAOYSA-N"),
                   ("pyruvate(1-)", "LCTONWCANYUPML-UHFFFAOYSA-M"),
                   ("L-alanine",    "QNAYBMKLOCPYGJ-REOHCLBHSA-N"),
                   ("L-glutamic acid", "WHUUTDBJXJRKMK-VKHMYHEASA-N"),
                   ("not a compound", "XXXXXXXXXXXXXX-UHFFFAOYSA-N")]:
    hits = chebi_by_inchikey(key)
    print(f"{label:16} {key}  ->", [(h, compound(h)["ascii_name"]) for h in hits])
```

What comes back, and why each line matters:

- The **last character of the InChIKey is the protonation flag** (`N` neutral, `M` minus one
  proton, `K` minus three …). Pyruvic acid and pyruvate share the first 25 characters and are
  two ChEBI entries. Truncating to the 14-character skeleton (`LCTONWCANYUPML`) also matches
  pyruvic-13C3 acid — a different, labelled compound.
- **One InChIKey can be two ChEBI ids.** Standard InChI does not distinguish a zwitterion from
  its neutral form, so `QNAYBMKLOCPYGJ-REOHCLBHSA-N` is both `CHEBI:16977` (L-alanine) and
  `CHEBI:57972` (L-alanine zwitterion). Glycine does the same. L-glutamic acid's key also hits
  `CHEBI:53374`, γ-poly(L-glutamic acid) — a polymer stored with its monomer's structure. Taking
  `hits[0]` picks one of these silently; the next section is how to choose.
- An unknown key answers `404` with `{"detail": "No compound matches the provided term: …"}` —
  an empty list, not an exception.

Never resolve by name. `es_search?term=citrate` returns 144 hits, and the two top-scoring tie:
`CHEBI:133748` "citrate anion" (an ontology class with no structure) and `CHEBI:16947`
"citrate(3−)", the one Rhea uses. `term=glucose` returns 976.

### Secondary ids redirect silently

`compound/CHEBI:26462/` answers `200` with the record for `CHEBI:15361` — 26462 is a merged
secondary id. Compare `chebi_accession` with what you asked for before storing anything. The
batch endpoint says it explicitly:

```python
import json
from chebi_rhea import CHEBI, _open

r = json.load(_open(f"{CHEBI}/compounds/?chebi_ids=15361,26462,999999999"))
for k, v in r.items():
    print(k, v["exists"], v["id_type"], "->", v["primary_chebi_id"])
```

`GET compounds/?chebi_ids=` takes about 500 ids before the request line passes the server's
4,094-byte limit (`400`); a `POST` of 1,000 ids answered `500`. Send 200 at a time.

## Read the record — parents, charge, cross-references

```python
from chebi_rhea import compound, relations, xrefs

for cid in ["CHEBI:15361", "CHEBI:32816"]:
    rec = compound(cid)
    chem = rec["chemical_data"]
    print(cid, rec["ascii_name"], "| stars", rec["stars"], "| formula", chem["formula"], "| charge", chem["charge"])
    print("   is a              :", relations(rec, "is a"))
    print("   conjugate acid of :", relations(rec, "is conjugate acid of"))
    print("   conjugate base of :", relations(rec, "is conjugate base of"))
    print("   xrefs             :", xrefs(rec, {"KEGG COMPOUND", "HMDB", "MetaCyc", "LIPID MAPS"}))
```

Things the record does not tell you unless you look:

- **`ontology/parents/{id}/` is every outgoing edge**, `has role` and `has functional parent`
  included — not the `is a` parents. Filter on `relation_type`.
- **Cross-references sit mostly on the neutral form.** Pyruvate (`CHEBI:15361`, the form Rhea
  uses) carries KEGG `C00022` and UM-BBD; HMDB, MetaCyc, LIPID MAPS, DrugBank and five more
  sit only on pyruvic acid (`CHEBI:32816`). ATP(4−) (`CHEBI:30616`) carries no manual xrefs at all.
  To get from a Rhea participant to HMDB, walk `is conjugate base of` to the neutral entry.
- **`name` is HTML.** L-alanine is `<small>L</small>-alanine`; use `ascii_name` for text and
  never for joins.
- `stars` is curation level: 3 is checked by ChEBI curators, 2 is from a submitter. Ontology
  classes such as "citrate anion" have no `default_structure` and so no InChIKey.

## The pH 7.3 form — which ChEBI id Rhea means

Rhea writes every participant as its **major microspecies at pH 7.3** and publishes the
mapping it uses: `chebi_pH7_3_mapping.tsv`, three columns — ChEBI id, ChEBI id of the pH 7.3
form, and whether that was computed or curated (121,975 computed, 897 curated, release 143).

```python
from chebi_rhea import chebi_by_inchikey, ph73_map

ph = ph73_map()
for key in ["LCTONWCANYUPML-UHFFFAOYSA-N", "QNAYBMKLOCPYGJ-REOHCLBHSA-N", "WHUUTDBJXJRKMK-VKHMYHEASA-N",
            "BAWFJGJZGIEFAR-NNYOXOHSSA-N", "KRKNYBCHXYNGOX-UHFFFAOYSA-N"]:
    hits = chebi_by_inchikey(key)
    forms = sorted({ph[h] for h in hits if h in ph})
    print(key, hits, "-> pH 7.3:", forms, "| not in map:", [h for h in hits if h not in ph])
```

This is how to choose between the several ids one InChIKey returns: map every hit, keep the
distinct pH 7.3 forms. L-alanine and L-alanine zwitterion both map to `CHEBI:57972`; the
polyglutamate hit is not in the table and drops out; L-glutamic acid lands on `CHEBI:29985`,
L-glutamate(1−). If more than one distinct form survives, stop and look — do not pick.

## Reactions — four ids each, and which way they run

Every Rhea reaction is a set of four ids, always consecutive:

| id | direction | example, pyruvate kinase |
|---|---|---|
| master | undirected (`UN`) — the one search results return | `RHEA:18157` pyruvate + ATP = phosphoenolpyruvate + ADP + H(+) |
| master + 1 | left to right (`LR`) | `RHEA:18158` pyruvate + ATP => phosphoenolpyruvate + ADP + H(+) |
| master + 2 | right to left (`RL`) | `RHEA:18159` phosphoenolpyruvate + ADP + H(+) => pyruvate + ATP |
| master + 3 | bidirectional (`BI`) | `RHEA:18160` |

The arithmetic held for all 19,005 rows of `rhea-directions.tsv` in release 143, but read the ids
from the data, not by adding. **The written equation is not the physiological direction.** The
master for pyruvate kinase is written against glycolysis; UniProt's annotation of `P14618`
(PKM) points at `RL`, `RHEA:18159`, and so do Reactome and MetaCyc's cross-references, which
attach to the directed ids.

### By ChEBI id — SPARQL, exact

```python
from chebi_rhea import rhea_by_chebi

for cid in ["CHEBI:15361", "CHEBI:32816"]:
    rx = rhea_by_chebi(cid)
    print(cid, len(rx), "approved reactions")
pk = next(r for r in rhea_by_chebi("CHEBI:15361") if r["master"] == "RHEA:18157")
print(pk)
```

`isChemicallyBalanced` is `true` for every approved reaction (18,612 in release 143); the 7
unbalanced reactions are all `Preliminary`, which the helper excludes. Approved and balanced is
also mass- and charge-balanced, which you can recompute yourself from the participants — Try it
does.

### By EC number and by UniProt accession

```python
from chebi_rhea import rhea_by_ec, rhea_by_uniprot

for r in rhea_by_ec("2.7.1.40"):
    print(r["master"], r["lr"], r["rl"], r["bi"], r["eq"])
for r in rhea_by_uniprot("P14618"):
    print(r["master"], r["ec"], "| physiological:", r["physiological"], "|", r["eq"])
```

UniProt annotations live outside the Rhea SPARQL graph, so the UniProt route uses the REST
search (`query=uniprot:P14618`) for the masters and `rhea2uniprot_sprot.tsv` for direction. Rows
there whose `DIRECTION` is `LR` or `RL` are UniProt's curated **physiological direction**; `UN`
alone means none was stated. That file covers Swiss-Prot; TrEMBL is the separate 149 MB
`rhea2uniprot_trembl.tsv.gz`. For anything else about the protein, point at `uniprot`.

The EC route is Rhea's own EC assignment. For kinetic constants by EC number, `brenda`.

### The participants, with stoichiometry

```python
from chebi_rhea import participants

for p in participants("RHEA:18157") + [{"side": "-"}] + participants("RHEA:14993"):
    print(p)
```

Stoichiometric coefficients are predicates — `contains1`, `contains2`, … and the symbolic
`containsN`, `contains2n`, `containsNplus1`, `containsNminus1` for polymer reactions such as
fatty-acid synthesis (`RHEA:14993`, a Preliminary reaction with "n malonyl-CoA"). Do not cast
the coefficient to `int`. Generic participants ("a long-chain fatty acid", `CHEBI:57560`) have
formulas with `R`, and residues in proteins (`L-seryl-[protein]`) are linked through
`rh:reactivePart`, not `rh:chebi` — the helper matches all three.

## REST or SPARQL — they answer different questions

The REST search on a ChEBI id is generous; SPARQL on `rh:chebi` is exact. Same release,
same day:

| ChEBI id | REST `query=chebi:…` | SPARQL exact, approved | why they differ |
|---|---|---|---|
| `CHEBI:15361` pyruvate | 223 | 223 | — |
| `CHEBI:32816` pyruvic acid | 223 | 0 | REST maps to the pH 7.3 form; nothing in Rhea uses the acid |
| `CHEBI:4167` D-glucopyranose | 165 | 118 | REST adds ontology children (alpha- and beta-D-glucose) |
| `CHEBI:17234` glucose | 166 | 0 | the class itself is never a participant |
| `CHEBI:57540` NAD(+) | 1,315 | 1,268 | the 47 extra are `Preliminary` reactions |
| `CHEBI:16947` citrate(3−) | 33 | 33 | — |
| `CHEBI:29999` L-serine residue | 72 | 70 | linked through `rh:reactivePart`; the two extra are approved reactions on a substituted seryl residue, reached through the ontology |
| `CHEBI:15377` water | 6,877 | 6,809 | 68 `Preliminary`; SPARQL needs paging here and took minutes |
| `CHEBI:15378` H(+) | 10,586 | 10,407 | 179 `Preliminary`, likewise |

Neither is wrong. Use REST to ask "what in Rhea involves this molecule, roughly"; use SPARQL
on the pH 7.3 id for a join that has to be exact. And never compare counts across the two.

## Why names fail — measured

Rhea's `chebiId_name.tsv` gives each of its 13,308 participants a short name; ChEBI's
`ascii_name` gives each entry another. Join the two on the text — Rhea 143 against ChEBI
release 257, and identically against 256 — and the result is:

| outcome of the name join | Rhea participants |
|---|---|
| lands on the same ChEBI id | 4,145 (31%) |
| lands on a **different** ChEBI id | 2,228 (17%) |
| finds nothing | 6,935 (52%) |

The wrong-id cases are the dangerous ones, because they look right:

| Rhea name | Rhea's id | ChEBI entry whose `ascii_name` is that string |
|---|---|---|
| L-alanine | `CHEBI:57972` (zwitterion) | `CHEBI:16977`, neutral L-alanine |
| isopentenyl diphosphate | `CHEBI:128769` (the 3− ion) | `CHEBI:16584`, the neutral acid |
| coproporphyrin III | `CHEBI:131725` (the 4− ion) | `CHEBI:27609`, the neutral acid |

Rhea names the pH 7.3 form with the familiar name; ChEBI gives the familiar name to the neutral
form and a charged name ("L-alanine zwitterion", "isopentenyl diphosphate(3−)") to the one Rhea
uses. Join on ChEBI ids after mapping both sides to the pH 7.3 form, and the question does not
arise. The last block of *Get the files* recomputes this table from the files you downloaded.

## Get the files

Rhea's TSV directory and ChEBI's flat files, with the release number read off each and written
into the directory name, and a manifest of sizes and checksums. About 120 MB; ChEBI's
`structures.tsv.gz` (89 MB) is most of it and is what carries InChIKeys.

```bash
set -euo pipefail
RHEA=$(curl -sf https://ftp.expasy.org/databases/rhea/rhea-release.properties | sed -n 's/^rhea.release.number=//p')
CHEBI=$(curl -sf https://ftp.ebi.ac.uk/pub/databases/chebi/flat_files/README | sed -n 's/.*ChEBI Release: *\([0-9]*\).*/\1/p')
echo "Rhea $RHEA, ChEBI $CHEBI"
mkdir -p "rhea_$RHEA" "chebi_$CHEBI"
for f in rhea-directions.tsv rhea2ec.tsv rhea2uniprot_sprot.tsv chebi_pH7_3_mapping.tsv chebiId_name.tsv rhea-obsoletes.tsv; do
  curl -sf -o "rhea_$RHEA/$f" "https://ftp.expasy.org/databases/rhea/tsv/$f"
done
curl -sf -o "rhea_$RHEA/LICENSE.txt" https://ftp.expasy.org/databases/rhea/LICENSE.txt
for f in compounds structures relation relation_type database_accession source secondary_ids chemical_data; do
  curl -sf -o "chebi_$CHEBI/$f.tsv.gz" "https://ftp.ebi.ac.uk/pub/databases/chebi/flat_files/$f.tsv.gz"
done
curl -sf -o "chebi_$CHEBI/README" https://ftp.ebi.ac.uk/pub/databases/chebi/flat_files/README
# the live directories can roll over mid-download - confirm the release did not move
test "$(curl -sf https://ftp.expasy.org/databases/rhea/rhea-release.properties | sed -n 's/^rhea.release.number=//p')" = "$RHEA"
grep -q "ChEBI Release: *$CHEBI\b" "chebi_$CHEBI/README"
shasum -a 256 rhea_$RHEA/* chebi_$CHEBI/* > MANIFEST.sha256
ls -l rhea_$RHEA chebi_$CHEBI
```

To reproduce an older ChEBI release, swap `flat_files/` for `archive/rel256/flat_files/`
(same file names). For an older Rhea, `old_releases/142.tar.bz2`.

Then the two local indexes this page keeps reaching for — InChIKey to ChEBI id, and ChEBI id to
its pH 7.3 form — built from the files, not the API:

```python
import csv, glob, gzip, sys
from collections import defaultdict

csv.field_size_limit(sys.maxsize)          # structures.tsv carries whole molfiles in quotes
chebi_dir = sorted(glob.glob("chebi_[0-9]*"))[-1]
rhea_dir = sorted(glob.glob("rhea_[0-9]*"))[-1]

names = {}
with gzip.open(f"{chebi_dir}/compounds.tsv.gz", "rt", newline="") as f:
    for r in csv.DictReader(f, delimiter="\t"):
        names[r["id"]] = (r["chebi_accession"], r["ascii_name"], r["stars"])

by_key = defaultdict(set)
with gzip.open(f"{chebi_dir}/structures.tsv.gz", "rt", newline="") as f:
    for r in csv.DictReader(f, delimiter="\t"):
        if r["standard_inchi_key"] and r["compound_id"] in names:
            by_key[r["standard_inchi_key"]].add(names[r["compound_id"]][0])

ph = {}
with open(f"{rhea_dir}/chebi_pH7_3_mapping.tsv", newline="") as f:
    for r in csv.DictReader(f, delimiter="\t"):
        ph[f"CHEBI:{r['CHEBI']}"] = f"CHEBI:{r['CHEBI_PH7_3']}"

with open("inchikey_to_chebi.tsv", "w") as out:
    out.write("inchikey\tchebi_id\tph7_3_chebi_id\n")
    for key in sorted(by_key):
        for cid in sorted(by_key[key]):
            out.write(f"{key}\t{cid}\t{ph.get(cid, '')}\n")

multi = sum(len(v) > 1 for v in by_key.values())
print(f"{len(by_key):,} InChIKeys; {multi:,} map to more than one ChEBI id")
print("QNAYBMKLOCPYGJ-REOHCLBHSA-N ->", sorted(by_key["QNAYBMKLOCPYGJ-REOHCLBHSA-N"]))
```

On release 257: 188,644 distinct InChIKeys, 1,473 of them carried by more than one ChEBI id.
An empty `ph7_3_chebi_id` means Rhea's table has no entry for that id — usually because it is
not a small molecule Rhea could use (a polymer, a class), not because the form is the input.

And the name-join measurement from *Why names fail*, recomputed on the same files:

```python
import csv, glob, gzip
from collections import Counter, defaultdict

chebi_dir = sorted(glob.glob("chebi_[0-9]*"))[-1]
rhea_dir = sorted(glob.glob("rhea_[0-9]*"))[-1]
by_name = defaultdict(set)
with gzip.open(f"{chebi_dir}/compounds.tsv.gz", "rt", newline="") as f:
    for r in csv.DictReader(f, delimiter="\t"):
        by_name[r["ascii_name"]].add(r["chebi_accession"])

outcome, wrong = Counter(), []
with open(f"{rhea_dir}/chebiId_name.tsv") as f:          # no header; the name has a leading space
    for line in f:
        cid, name = (x.strip() for x in line.rstrip("\n").split("\t"))
        hits = by_name.get(name, set())
        if not hits:
            outcome["finds nothing"] += 1
        elif cid in hits:
            outcome["same id" if hits == {cid} else "same id among several"] += 1
        else:
            outcome["different id"] += 1
            wrong.append((name, cid, sorted(hits)))
print(chebi_dir, rhea_dir, sum(outcome.values()), "Rhea participants:", dict(outcome))
print([w for w in wrong if w[0] == "L-alanine"])
```

## What does not work

Each was tried on 2026-11-15.

| tried | result |
|---|---|
| the ChEBI 1.0 SOAP web service, `https://www.ebi.ac.uk/webservices/chebi/2.0/webservice?wsdl` and its `test/getCompleteEntity` / `getLiteEntity` REST wrappers | `500`, HTML. Retired with ChEBI 2.0 (release 245); `libChEBIpy` and older Biopython-era clients call it |
| legacy pages — `searchId.do?chebiId=`, `displayAutoXrefs.do`, `advancedSearchFT.do` | `200`, but a redirect into the new single-page site: HTML, no data |
| `https://ftp.ebi.ac.uk/pub/databases/chebi/Flat_file_tab_delimited/` | `404`. The 1.0 flat files are gone; 2.0 uses `flat_files/` with different tables and column names |
| the OBO PURL for the newest release, `…/obo/chebi/257/chebi_lite.obo.gz` | `404` until that release reaches `archive/`; the unversioned PURL works |
| `https://www.ebi.ac.uk/chebi/compound/CHEBI:15361` (no `backend/api/public`) | `404` JSON. The API root is `/chebi/backend/api/public/`; the schema is at `/chebi/backend/api/schema/?format=json` |
| `compound/CHEBI:abc/` | `404` HTML, not JSON — parse defensively |
| any Rhea call with Python's default `User-Agent` | `403`, `error code: 1010` |
| Rhea REST with an empty `limit=` | one row, or `500` with an error page, depending on the query. Omit the key for everything |
| Rhea REST `columns=` with an unknown column name (`rhea-direction`, `status`, `chebi-smiles`) | silently dropped from the output, `200`. Check the header row |
| Rhea REST for a directed id, `query=RHEA:18158` | header only — search returns masters. Use `rhea-directions.tsv` or SPARQL |
| Rhea REST `uniprot` column | a count of enzymes, not accessions (36,345 for `RHEA:18157`) |
| SPARQL `?side rh:curatedOrder 1` | zero rows, no error — the literal is `xsd:long`. `FILTER(?o = 1)` |
| SPARQL for every reaction of water (`CHEBI:15377`) unpaged | the response stream is cut off mid-body (`IncompleteRead`). Page with `LIMIT`/`OFFSET`, as the helper does |
| SPARQL for reactions of a UniProt accession | Rhea's graph holds no UniProt data; use the REST search or `rhea2uniprot_*.tsv` |
| `rhea2ec.tsv` for directed ids | every row is `UN`; EC is assigned on the master only |

## Try it

**Data.** Live ChEBI 2.0 API and Rhea REST, SPARQL and TSV endpoints — no account, CC BY 4.0
(ChEBI per https://www.ebi.ac.uk/chebi/about, Rhea per its licence page). The records are
three metabolites by InChIKey (pyruvic acid, L-alanine, L-glutamic acid), one secondary ChEBI
id, pyruvate kinase as an EC number (`2.7.1.40`), a reaction (`RHEA:18157`) and a protein
(`P14618`, human PKM). Last confirmed reachable 2026-11-15.

**Run.** Standard library only; paste into a fresh directory.

```bash
COLD=$(mktemp -d) && cd "$COLD"
cat > tryit.py <<'EOF'
import csv, io, json, re, urllib.error, urllib.parse, urllib.request
from collections import Counter

UA = {"User-Agent": "chebi-rhea-tryit/1.0 (python urllib)"}
API = "https://www.ebi.ac.uk/chebi/backend/api/public"

def fetch(url, data=None, accept="application/json"):
    req = urllib.request.Request(url, data=data, headers={**UA, "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")

def by_key(key):
    code, body = fetch(f"{API}/es_search/?" + urllib.parse.urlencode({"term": key, "size": 100}))
    if code == 404:
        return []
    return sorted({h["_source"]["chebi_accession"] for h in json.loads(body)["results"]
                   if h["_source"].get("inchikey") == key})

def rec(cid):
    code, body = fetch(f"{API}/compound/{cid}/")
    assert code == 200, (cid, code)
    return json.loads(body)

def rel(r, kind):
    return [f"CHEBI:{x['final_id']}" for x in r["ontology_relations"]["outgoing_relations"] if x["relation_type"] == kind]

def tsv(name):
    code, body = fetch("https://ftp.expasy.org/databases/rhea/tsv/" + name, accept="*/*")
    assert code == 200, name
    return list(csv.DictReader(io.StringIO(body), delimiter="\t"))

def sparql(q):
    pre = ("PREFIX rh:<http://rdf.rhea-db.org/>\nPREFIX CHEBI:<http://purl.obolibrary.org/obo/CHEBI_>\n"
           "PREFIX ec:<http://purl.uniprot.org/enzyme/>\n")
    code, body = fetch("https://sparql.rhea-db.org/sparql", urllib.parse.urlencode({"query": pre + q}).encode(),
                       "application/sparql-results+json")
    assert code == 200, body[:200]
    return [{k: v["value"] for k, v in b.items()} for b in json.loads(body)["results"]["bindings"]]

def rest(query):
    code, body = fetch("https://www.rhea-db.org/rhea/?" + urllib.parse.urlencode(
        {"query": query, "columns": "rhea-id", "format": "tsv"}), accept="text/plain")
    assert code == 200, code
    return [l for l in body.splitlines()[1:] if l.strip()]

REACTIONS = """SELECT DISTINCT ?master ?lr ?rl ?bi ?balanced ?eq WHERE {
  ?r rdfs:subClassOf rh:Reaction ; rh:status rh:Approved ; rh:accession ?master ; rh:equation ?eq ;
     rh:isChemicallyBalanced ?balanced ; rh:bidirectionalReaction/rh:accession ?bi ; rh:side ?L .
  ?L rh:curatedOrder ?o . FILTER(?o = 1)
  ?r rh:directionalReaction ?d1 . ?d1 rh:substrates ?L ; rh:accession ?lr .
  ?r rh:directionalReaction ?d2 . ?d2 rh:products ?L ; rh:accession ?rl . %s } ORDER BY ?master"""

# --- releases -----------------------------------------------------------------------------
readme = fetch("https://ftp.ebi.ac.uk/pub/databases/chebi/flat_files/README", accept="*/*")[1]
props = dict(l.split("=", 1) for l in fetch("https://ftp.expasy.org/databases/rhea/rhea-release.properties", accept="*/*")[1].split())
print("ChEBI release", re.search(r"ChEBI Release:\s*(\d+)", readme).group(1),
      "| Rhea release", props["rhea.release.number"], props["rhea.release.date"])

# --- InChIKey -> ChEBI: a list, protonation-specific ------------------------------------------
acid = by_key("LCTONWCANYUPML-UHFFFAOYSA-N")
ala = by_key("QNAYBMKLOCPYGJ-REOHCLBHSA-N")
glu = by_key("WHUUTDBJXJRKMK-VKHMYHEASA-N")
assert acid == ["CHEBI:32816"]
assert {"CHEBI:16977", "CHEBI:57972"} <= set(ala)         # neutral and zwitterion share a key
assert "CHEBI:16015" in glu and len(glu) >= 2              # the polymer shares the monomer's key
assert by_key("XXXXXXXXXXXXXX-UHFFFAOYSA-N") == []
print("pyruvic acid key ->", acid, "| L-alanine key ->", ala, "| L-glutamic acid key ->", glu)

# --- the pH 7.3 form decides -------------------------------------------------------------------
ph = {f"CHEBI:{r['CHEBI']}": f"CHEBI:{r['CHEBI_PH7_3']}" for r in tsv("chebi_pH7_3_mapping.tsv")}
assert {ph[h] for h in acid} == {"CHEBI:15361"}
assert {ph[h] for h in ala if h in ph} == {"CHEBI:57972"}
assert {ph[h] for h in glu if h in ph} == {"CHEBI:29985"}
print("pH 7.3 forms: pyruvic acid -> CHEBI:15361, L-alanine -> CHEBI:57972, L-glutamic acid -> CHEBI:29985")

pyr, pyra = rec("CHEBI:15361"), rec("CHEBI:32816")
assert pyr["chemical_data"]["charge"] == -1 and pyra["chemical_data"]["charge"] == 0
assert rel(pyr, "is conjugate base of") == ["CHEBI:32816"]
src = lambda r: {x["source_name"] for x in r["database_accessions"].get("MANUAL_X_REF", [])}
assert "HMDB" in src(pyra) and "HMDB" not in src(pyr)      # xrefs live on the neutral form
print("pyruvate is_a:", rel(pyr, "is a"), "| HMDB on pyruvic acid only")
assert rec("CHEBI:26462")["chebi_accession"] == "CHEBI:15361"   # secondary id, silent 200

# --- Rhea: exact by ChEBI id, and the REST search is not exact ----------------------------------
exact = sparql(REACTIONS % "?r rh:side/rh:contains/rh:compound/rh:chebi CHEBI:15361 .")
assert sparql(REACTIONS % "?r rh:side/rh:contains/rh:compound/rh:chebi CHEBI:32816 .") == []
assert all(r["balanced"] == "true" for r in exact)
assert len(rest("chebi:32816")) == len(rest("chebi:15361"))   # REST maps the acid onto pyruvate
assert sparql("SELECT (COUNT(*) AS ?n) WHERE { ?r rh:accession 'RHEA:18157' ; rh:side ?L . ?L rh:curatedOrder 1 }")[0]["n"] == "0"
print("pyruvate, exact:", len(exact), "approved reactions; pyruvic acid, exact: 0")

# --- the four ids, cross-checked against rhea-directions.tsv ---------------------------------------
dirs = {f"RHEA:{r['RHEA_ID_MASTER']}": r for r in tsv("rhea-directions.tsv")}
for r in exact:
    d = dirs[r["master"]]
    assert (r["lr"], r["rl"], r["bi"]) == tuple(f"RHEA:{d[k]}" for k in ("RHEA_ID_LR", "RHEA_ID_RL", "RHEA_ID_BI"))
pk = next(r for r in exact if r["master"] == "RHEA:18157")
print("RHEA:18157 ->", pk["lr"], pk["rl"], pk["bi"], "|", pk["eq"])

# --- recompute the balance from formulas and charges -------------------------------------------
parts = sparql("""SELECT ?side ?coef ?formula ?charge ?chebi WHERE { ?r rh:accession "RHEA:18157" ; rh:side ?s .
  ?s rh:curatedOrder ?side ; ?coef ?p . ?coef rdfs:subPropertyOf rh:contains . ?p rh:compound ?c .
  ?c rh:formula ?formula ; rh:charge ?charge ; rh:chebi ?chebi }""")
atoms, charge = Counter(), 0
for p in parts:
    n = int(p["coef"].rsplit("contains", 1)[1]) * (1 if p["side"] == "1" else -1)
    for el, k in re.findall(r"([A-Z][a-z]?)(\d*)", p["formula"]):
        atoms[el] += n * int(k or 1)
    charge += n * int(p["charge"])
assert len(parts) == 5 and not any(atoms.values()) and charge == 0
print("RHEA:18157 recomputed: atoms and charge balance across", len(parts), "participants")

# --- EC and UniProt routes; physiological direction ------------------------------------------------
ec = sparql(REACTIONS % "?r rh:ec ec:2.7.1.40 .")
assert "RHEA:18157" in {r["master"] for r in ec}
assert "RHEA:18157" in {l.split("\t")[0] for l in rest("uniprot:P14618")}
phys = {(r["DIRECTION"], r["RHEA_ID"]) for r in tsv("rhea2uniprot_sprot.tsv") if r["ID"] == "P14618" and r["MASTER_ID"] == "18157"}
assert ("RL", "18159") in phys
print("EC 2.7.1.40:", len(ec), "reactions | P14618 physiological direction for RHEA:18157:", sorted(phys))

# --- a label join picks the wrong entity -------------------------------------------------------------
rhea_names = {}
for line in fetch("https://ftp.expasy.org/databases/rhea/tsv/chebiId_name.tsv", accept="*/*")[1].splitlines():
    cid, name = line.split("\t")
    rhea_names[cid.strip()] = name.strip()
assert rhea_names["CHEBI:57972"] == "L-alanine" and rec("CHEBI:16977")["ascii_name"] == "L-alanine"
print("Rhea 'L-alanine' is CHEBI:57972; ChEBI's entry named 'L-alanine' is CHEBI:16977")
EOF
python3 -I tryit.py
```

**Expect**

Invariants — a failure means the page is wrong:

- An InChIKey resolves to a **list**. Neutral and zwitterion forms (L-alanine) share one key;
  a polymer can share its monomer's key (L-glutamic acid).
- The pH 7.3 table collapses those to one id each: `CHEBI:15361`, `CHEBI:57972`, `CHEBI:29985`.
- Pyruvate is charge −1 and the conjugate base of pyruvic acid; HMDB is on the acid only.
- `CHEBI:26462` answers with the record for `CHEBI:15361`.
- SPARQL on the exact id finds no reaction for pyruvic acid; the REST search returns the same
  count for both ids.
- A bare `rh:curatedOrder 1` returns zero.
- The LR/RL/BI ids from SPARQL equal the row in `rhea-directions.tsv` for every reaction.
- `RHEA:18157` balances when recomputed from its five participants' formulas and charges.
- UniProt's direction for `P14618` on `RHEA:18157` is `RL`, `RHEA:18159`.
- Rhea's "L-alanine" and ChEBI's "L-alanine" are different ids.

Observed 2026-11-15, ChEBI release 257 and Rhea release 143 — these move with releases, so a
mismatch is drift to investigate:

```
ChEBI release 257 | Rhea release 143 2026-11-04
pyruvic acid key -> ['CHEBI:32816'] | L-alanine key -> ['CHEBI:16977', 'CHEBI:57972'] | L-glutamic acid key -> ['CHEBI:16015', 'CHEBI:53374']
pH 7.3 forms: pyruvic acid -> CHEBI:15361, L-alanine -> CHEBI:57972, L-glutamic acid -> CHEBI:29985
pyruvate is_a: ['CHEBI:35179'] | HMDB on pyruvic acid only
pyruvate, exact: 223 approved reactions; pyruvic acid, exact: 0
RHEA:18157 -> RHEA:18158 RHEA:18159 RHEA:18160 | pyruvate + ATP = phosphoenolpyruvate + ADP + H(+)
RHEA:18157 recomputed: atoms and charge balance across 5 participants
EC 2.7.1.40: 6 reactions | P14618 physiological direction for RHEA:18157: [('RL', '18159'), ('UN', '18157')]
Rhea 'L-alanine' is CHEBI:57972; ChEBI's entry named 'L-alanine' is CHEBI:16977
```

## Citing it

- ChEBI — https://www.ebi.ac.uk/chebi — cite the release number (ChEBI's own request). Malik A,
  et al. (2026) ChEBI: re-engineered for a sustainable future. *Nucleic Acids Res.* 54,
  D1768–D1778, https://doi.org/10.1093/nar/gkaf1271 ; Hastings J, et al. (2016) *Nucleic Acids Res.* 44,
  D1214–D1219, https://doi.org/10.1093/nar/gkv1031
- Rhea — https://www.rhea-db.org — Bansal P, et al. (2022) Rhea, the reaction knowledgebase in
  2022. *Nucleic Acids Res.* 50, D693–D700, https://doi.org/10.1093/nar/gkab1016
