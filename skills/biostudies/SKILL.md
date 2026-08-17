---
name: biostudies
description: Search and retrieve studies from EBI BioStudies, the archive holding the ArrayExpress collection of functional-genomics submissions whose E-MTAB accessions mostly never reach GEO. Resolve an accession, traverse the nested section tree that carries title, organism and protocols, and download processed files and MAGE-TAB sample tables.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [arrayexpress, rna-seq, transcriptomics, public-data, microarray]
covers: [arrayexpress, biostudies, E-MTAB, rna-seq, scRNA-seq, single cell, microarray, functional genomics, transcriptomics, gene expression, differential expression, MAGE-TAB, SDRF, h5ad, ENA, fastq, EMBL-EBI, bioimages, heart, lymphatic endothelial cells, dermis, skin, human, mouse, aging, cardiac inflammation, cancer, immune cells, EFO]
papers: [PMID:33211879, PMID:42167442, PMID:29069414, PMID:26700850, PMID:30357387, PMID:25361974, PMID:12519949, PMID:17087822]
access: [open]
datasets: [https://www.ebi.ac.uk/biostudies/api/v1/studies/E-MTAB-17485]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-17
  against: BioStudies API v1 / ENA Portal API / Python 3.12.8 / curl 8.7.1
  executed: 7
  unverified: 0
---
# EBI BioStudies and the ArrayExpress collection

BioStudies (EMBL-EBI) is a **container archive**, not a repository of one data type.
ArrayExpress is a *collection* inside it, and it is where a large share of European
functional-genomics work is deposited instead of GEO. An `E-MTAB-*` accession in a
methods section is the ArrayExpress equivalent of a `GSE*`, and this is the endpoint
that resolves it.

Other collections in the same archive answer to the same API — BioImages (`S-BIAD*`),
EuropePMC supplementary data (`S-EPMC*`), BioModels (`MODEL*`), SourceData
(`S-SCDT-*`), JCB (`S-JCBD-*`), plus direct submissions with no collection at all
(`S-BSST*`). Scoping to the right one is a large part of using this well.

No account, no key, no licence click-through. Everything below is anonymous HTTP.

**The one thing to internalise:** metadata is not flat. Title, organism, protocols and
sample groups live at different depths of a nested `section` / `subsections` tree whose
leaves are `attributes` arrays. A reader who expects GEO's shape finds a `section` key
and no `title` key, concludes the API is useless, and starts scraping HTML. The
traversal is twenty lines and it is the whole skill.

## Resolving an accession

One path, keyed by accession, for every collection.

```sh
# The whole record, metadata tree included.
curl -s "https://www.ebi.ac.uk/biostudies/api/v1/studies/E-MTAB-17485" | head -c 200; echo

# A flat file list — no tree walking needed.
curl -s "https://www.ebi.ac.uk/biostudies/api/v1/studies/E-MTAB-17485/files" | head -c 200; echo

# File count and the FTP/Globus mirror for the same study.
curl -s "https://www.ebi.ac.uk/biostudies/api/v1/studies/E-MTAB-17485/info" \
  | tr ',' '\n' | grep -E '"files"|httpLink'

# One file to disk. Note /biostudies/files/ — NOT /api/v1/ — and -L, because this
# path 302s to the FTP mirror. Without -L you get a 0-byte file and exit code 0.
curl -sSL -o E-MTAB-17485.sdrf.txt -w 'http=%{http_code} redirects=%{num_redirects} bytes=%{size_download}\n' \
  "https://www.ebi.ac.uk/biostudies/files/E-MTAB-17485/E-MTAB-17485.sdrf.txt"
```

Printed 2026-08-17:

```
{
  "accno" : "E-MTAB-17485",
  "attributes" : [ {
    "name" : "Title",
    "value" : "Age-Associated Loss of Lymphatic Vessels Promotes Cardiac Inflammation (Bulk-RNA-SEQ)"
  }, {
    "name" : "Rele
{"items":[{"path":"DESeq2_DEG_analysis_filter50Reads.tsv","file_position":"1","Description":"Processed Data","Size":2480580,"file_type":"file","file_owner":"E-MTAB-17485","type":"file","Section":"proc
"files":3
"httpLink":"https://ftp.ebi.ac.uk/pub/databases/biostudies/E-MTAB-/485/E-MTAB-17485"
http=200 redirects=1 bytes=16885
```

The four routes worth memorising:

| what you want | path |
|---|---|
| full record + metadata tree | `/api/v1/studies/{accession}` |
| flat file list with sizes | `/api/v1/studies/{accession}/files` |
| file count, FTP and Globus mirrors | `/api/v1/studies/{accession}/info` |
| the bytes of one file | `/biostudies/files/{accession}/{path}` — no `/api/v1` |

Failure modes, all checked 2026-08-17:

| request | result |
|---|---|
| `E-MTAB-17485` | 200 |
| `e-mtab-17485` | **404** — accession lookup is case-sensitive |
| `GSE12345` | 404 — GEO identifiers are not accessions here |
| `E-MTAB-99999999` | 404 `{"errorMessage":"Study not found"}` |

A 404 conflates *never existed*, *not yet released*, and *withdrawn*. Since embargoed
studies also 404, an accession printed in a paper that does not resolve is usually an
unreleased deposit rather than a typo — worth saying so instead of reporting "no data".

## The section tree

`section` is a recursive node. `attributes` is a **list** of `{name, value}` and names
repeat legitimately. `subsections`, `files` and `links` are lists whose elements are
**either an object or a list of objects** — BioStudies wraps repeated siblings of one
type into a nested list, so the studies with the most data are exactly the ones that
break naive traversal with `AttributeError: 'list' object has no attribute 'get'`.

```python
import json, urllib.error, urllib.request

API = "https://www.ebi.ac.uk/biostudies/api/v1"


def fetch_study(accession, timeout=45):
    """Any BioStudies accession — E-MTAB-*, S-BIAD*, S-EPMC*, MODEL*, S-BSST*."""
    try:
        with urllib.request.urlopen(f"{API}/studies/{accession}", timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise LookupError(
                f"{accession}: not found, not yet released, withdrawn — "
                "or wrong case, the lookup is case-sensitive") from None
        raise


def flatten(container):
    """`subsections`, `files` and `links` hold EITHER an object OR a list of objects.

    BioStudies wraps repeated siblings of one type into a nested list, so the
    studies with the most data are exactly the ones that break naive traversal
    with AttributeError: 'list' object has no attribute 'get'.
    """
    out = []
    for item in container or []:
        out.extend(item if isinstance(item, list) else [item])
    return out


def attrs(node):
    """`attributes` is a list of {name, value}. Names repeat, legitimately."""
    out = {}
    for a in node.get("attributes") or []:
        out.setdefault(a["name"], []).append(a.get("value"))
    return out


def one(node, name, default=None):
    return attrs(node).get(name, [default])[0]


def walk(section, path=()):
    """Yield (tuple_of_section_types, section), depth first, root included."""
    here = path + (section.get("type") or "?",)
    yield here, section
    for child in flatten(section.get("subsections")):
        yield from walk(child, here)


def sections(section, type_):
    return [s for _, s in walk(section) if s.get("type") == type_]


study = fetch_study("E-MTAB-17485")
root = study["section"]

# Collection and release date are TOP-LEVEL attributes, not section ones.
print("accession :", study["accno"], "| envelope type:", study["type"])
print("collection:", one(study, "AttachTo"), "| released:", one(study, "ReleaseDate"))
print("title     :", one(root, "Title"))
print("organism  :", attrs(root).get("Organism"))
print("assay     :", one(root, "Study type"))
print()

print("section tree")
for path, sec in walk(root):
    print(f"  {'  ' * (len(path) - 1)}{path[-1]:<26} {sec.get('accno') or '-':<32} "
          f"{len(attrs(sec))} attrs")
print()

print(f"protocols ({len(sections(root, 'Protocols'))})")
for p in sections(root, "Protocols"):
    print(f"  {p['accno']:16} {one(p, 'Type')}")
print()

print("sample characteristics")
for c in sections(root, "Source Characteristics"):
    for k, v in attrs(c).items():
        print(f"  {k:22} {', '.join(v)}")
print()

print("experimental factors and group sizes")
for ef in sections(root, "Experimental Factors"):
    # This node repeats one attribute name once per level — a dict comprehension
    # over `attributes` keeps only the last, which is why attrs() returns lists.
    print("  levels:", json.dumps(attrs(ef)))
for t in sections(root, "Factors Table"):
    a = attrs(t)
    n = a.pop("No. of Samples", ["?"])[0]
    print(f"  {t['accno']:12} {a} n={n}")
print()

print("ontology terms ride on the attribute, in valqual")
for _, sec in walk(root):
    for a in sec.get("attributes") or []:
        if a.get("valqual"):
            q = {v["name"]: v["value"] for v in a["valqual"]}
            print(f"  {sec['type']:12} {a['name']:12} {a['value'][:34]:34} {q}")
print()

print("external links — raw data is NOT in BioStudies")
for l in flatten(root.get("links")):
    t = {a["name"]: a["value"] for a in l.get("attributes") or []}
    print(f"  {t.get('Type'):12} {l['url']}")
```

Run 2026-08-17 against `E-MTAB-17485`, abridged:

```
accession : E-MTAB-17485 | envelope type: submission
collection: ArrayExpress | released: 2026-08-03
title     : Age-Associated Loss of Lymphatic Vessels Promotes Cardiac Inflammation (Bulk-RNA-SEQ)
organism  : ['Homo sapiens']
assay     : RNA-seq of coding RNA

section tree
  Study                      s-E-MTAB-17485                   4 attrs
    Protocols                  P-MTAB-168545                    4 attrs
    …six more Protocols…
    Author                     -                                4 attrs
    Organization               o1                               2 attrs
    Samples                    s-samples-factors-E-MTAB-17485   3 attrs
      Experimental Factors       exp_factor-E-MTAB-17485          1 attrs
        Factors Table              factors_0                        2 attrs
        Factors Table              factors_1                        2 attrs
        Factors Table              factors_2                        2 attrs
      Source Characteristics     source_chars-E-MTAB-17485        7 attrs
    Assays and Data            s-assays-data-E-MTAB-17485       3 attrs
      Processed Data             processed-data                   0 attrs
      MAGE-TAB Files             mt-E-MTAB-17485                  0 attrs
    MINSEQE Score              score-E-MTAB-17485               5 attrs

protocols (7)
  P-MTAB-168545    sample collection protocol
  P-MTAB-168546    nucleic acid extraction protocol
  P-MTAB-168547    nucleic acid library construction protocol
  P-MTAB-168548    nucleic acid sequencing protocol
  P-MTAB-168549    growth protocol
  P-MTAB-168550    treatment protocol
  P-MTAB-168551    normalization data transformation protocol

sample characteristics
  Organism               Homo sapiens
  Developmental stage    adult
  Genotype               wild type genotype
  Organism part          dermis
  Cell type              endothelial cell
  Cultured cell          endothelial cell derived cell line
  Disease                healthy

experimental factors and group sizes
  levels: {"Rna interference": ["IL33_OE", "cMAF_OE", "Control"]}
  factors_0    {'rna interference': ['cMAF_OE']} n=4
  factors_1    {'rna interference': ['Control']} n=4
  factors_2    {'rna interference': ['IL33_OE']} n=4

ontology terms ride on the attribute, in valqual
  Study        Study type   RNA-seq of coding RNA              {'Ontology': 'EFO', 'TermId': 'EFO_0003738'}
  Protocols    Type         sample collection protocol         {'Ontology': 'EFO', 'TermId': 'EFO_0005518'}
  …
  Factors Table No. of Samples 4                               {'url': 'https://www.ebi.ac.uk/ena/browser/view/ERS31026426,ERS31026430,ERS31026431,ERS31026432'}

external links — raw data is NOT in BioStudies
  ENA          ERP203237
```

Where things actually live, for an ArrayExpress record:

| you want | where it is |
|---|---|
| collection, release date | **top-level** `attributes`, names `AttachTo` and `ReleaseDate` |
| title, description, organism, assay type | `section.attributes` |
| wet-lab and analysis protocols | `section.subsections` of type `Protocols`, one per step |
| organism part, cell type, disease, genotype | section `Source Characteristics` |
| factor levels and group sizes | sections `Experimental Factors` and `Factors Table` |
| EFO term IDs | `valqual` on the attribute that carries the label |
| pointers to raw reads | `section.links`, `Type` of `ENA` |
| the per-sample table | not in the JSON at all — the SDRF file |

Two details that bite. `Organism` on the Study section is a **summary**; a study with
several organisms lists several, and the authoritative per-sample assignment is the
SDRF. And `Factors Table` carries the group sizes, but `valqual` on `No. of Samples`
holds an ENA browser URL enumerating that group's sample accessions, which is the
cheapest way to get a group-to-sample mapping without parsing the SDRF.

Section type names are conventions of the submission template, not a schema.
ArrayExpress deposits carry `Protocols` and `Source Characteristics`; a BioImages or
SourceData record has a different vocabulary. Match on section `type` you have observed
for the collection you are reading, and treat an absent type as absent rather than an
error.

## Searching — collection scope and boolean semantics

```python
import json, urllib.parse, urllib.request

API = "https://www.ebi.ac.uk/biostudies/api/v1"


def search(query, collection=None, page=1, page_size=100, **params):
    """collection=None searches every collection; 'arrayexpress' scopes to one."""
    prefix = f"/{collection}" if collection else ""
    qs = urllib.parse.urlencode({"query": query, "page": page,
                                 "pageSize": min(page_size, 1000), **params})
    with urllib.request.urlopen(f"{API}{prefix}/search?{qs}", timeout=90) as r:
        return json.loads(r.read())


def search_all(query, collection=None, limit=20000, **params):
    """`totalHits` can be an estimate. Page to exhaustion for a real count."""
    out, page = [], 1
    while len(out) < limit:
        hits = search(query, collection, page=page, page_size=1000, **params)["hits"]
        if not hits:
            return out
        out += hits
        page += 1
    return out


print("space-separated terms are OR, not AND — ranking hides it")
for q in ["cardiac", "lymphatic", "cardiac lymphatic", "cardiac OR lymphatic",
          "cardiac AND lymphatic", '"cardiac lymphatic"']:
    d = search(q, collection="arrayexpress", page_size=3)
    print(f"  {q:24} {d['totalHits']:>6}  exact={str(d['isTotalHitsExact']):5} "
          f"top={[h['accession'] for h in d['hits']]}")

print()
print("scope — the same query, whole archive vs one collection")
for coll in (None, "arrayexpress"):
    d = search("cardiac AND lymphatic", collection=coll, page_size=4)
    print(f"  {coll or 'ALL BioStudies':16} {d['totalHits']:>6}  "
          f"{[h['accession'] for h in d['hits']]}")

print()
print("two ways to express the collection filter — same result set")
by_path = search_all("cardiac lymphatic", collection="arrayexpress")
by_param = search_all("cardiac lymphatic", **{"collection": "ArrayExpress"})
print(f"  /arrayexpress/search        {len(by_path)} records")
print(f"  /search?collection=…        {len(by_param)} records")
print("  symmetric difference       "
      f"{len({h['accession'] for h in by_path} ^ {h['accession'] for h in by_param})}")
est = search("cardiac lymphatic", collection="arrayexpress", page_size=1)
print(f"  reported totalHits         {est['totalHits']}  <- estimate, under the truth")

print()
print("an unknown collection is HTTP 200 with zero hits, never an error")
for c in ("arrayexpress", "ArrayExpress", "array-express", "biostudies", "pride"):
    d = search("cardiac AND lymphatic", collection=c, page_size=1)
    print(f"  /{c:14} {d['totalHits']:>5} hits")

print()
print("field-scoped queries, which also make the count exact")
for q in ('accession:E-MTAB-17485',
          'organism:"Mus musculus" AND cardiac AND lymphatic',
          'accession:E-MTAB* AND lymphatic',
          'accession:E-GEOD* AND lymphatic',
          'study_type:"RNA-seq of coding RNA from single cells" AND lymphatic',
          'author:"David John" AND lymphatic'):
    d = search(q, collection="arrayexpress", page_size=4)
    print(f"  {q[:54]:54} {d['totalHits']:>5} exact={str(d['isTotalHitsExact']):5} "
          f"{[h['accession'] for h in d['hits']][:3]}")

print()
print("newest first")
for h in search("lymphatic", collection="arrayexpress", page_size=3,
                sortBy="release_date", sortOrder="descending")["hits"]:
    print(f"  {h['accession']:14} {h['release_date']}  files={h['files']:<3} "
          f"links={h['links']:<3} {h['title'][:46]}")

print()
print("a GEO series number resolves to its ArrayExpress import, if there was one")
for gse in ("GSE16908", "GSE115989", "GSE250000"):
    h = search(gse, collection="arrayexpress", page_size=2)["hits"]
    print(f"  {gse:12} -> {[x['accession'] for x in h] or 'not imported'}")
```

Printed 2026-08-17:

```
space-separated terms are OR, not AND — ranking hides it
  cardiac                    1225  exact=False top=['E-GEOD-64403', 'E-GEOD-50221', 'E-GEOD-30076']
  lymphatic                   139  exact=True  top=['E-GEOD-16908', 'E-GEOD-6257', 'E-GEOD-84551']
  cardiac lymphatic          1386  exact=False top=['E-MTAB-17485', 'E-MTAB-17510', 'E-GEOD-16908']
  cardiac OR lymphatic       1386  exact=False top=['E-MTAB-17485', 'E-MTAB-17510', 'E-GEOD-16908']
  cardiac AND lymphatic        10  exact=True  top=['E-MTAB-17485', 'E-MTAB-17510', 'E-MTAB-12742']
  "cardiac lymphatic"           2  exact=True  top=['E-MTAB-17485', 'E-MTAB-17510']

scope — the same query, whole archive vs one collection
  ALL BioStudies      375  ['S-EPMC8756423', 'S-SCDT-10_1038-S44321-025-00345-W', 'S-EPMC11376687', 'S-EPMC8478352']
  arrayexpress         10  ['E-MTAB-17485', 'E-MTAB-17510', 'E-MTAB-12742', 'E-GEOD-26328']

two ways to express the collection filter — same result set
  /arrayexpress/search        1389 records
  /search?collection=…        1389 records
  symmetric difference       0
  reported totalHits         1386  <- estimate, under the truth

an unknown collection is HTTP 200 with zero hits, never an error
  /arrayexpress      10 hits
  /ArrayExpress      10 hits
  /array-express      0 hits
  /biostudies         0 hits
  /pride              0 hits

field-scoped queries, which also make the count exact
  accession:E-MTAB-17485                                     1 exact=True  ['E-MTAB-17485']
  organism:"Mus musculus" AND cardiac AND lymphatic          2 exact=True  ['E-MTAB-17510', 'E-MTAB-62']
  accession:E-MTAB* AND lymphatic                           29 exact=True  ['E-MTAB-17485', 'E-MTAB-8950', 'E-MTAB-17510']
  accession:E-GEOD* AND lymphatic                           97 exact=True  ['E-GEOD-16908', 'E-GEOD-6257', 'E-GEOD-84551']
  study_type:"RNA-seq of coding RNA from single cells" A      8 exact=True  ['E-MTAB-17510', 'E-MTAB-11524', 'E-MTAB-10434']
  author:"David John" AND lymphatic                          2 exact=True  ['E-MTAB-17485', 'E-MTAB-17510']

newest first
  E-MTAB-17510   2026-08-14  files=3   links=4   Age-Associated Loss of Lymphatic Vessels Promo
  E-MTAB-17485   2026-08-03  files=3   links=1   Age-Associated Loss of Lymphatic Vessels Promo
  E-MTAB-14722   2026-04-24  files=8   links=1   Single-cell RNA-sequencing data from developin

a GEO series number resolves to its ArrayExpress import, if there was one
  GSE16908     -> ['E-GEOD-16908']
  GSE115989    -> ['E-GEOD-115989']
  GSE250000    -> not imported
```

Four things that determine whether a search is usable:

**Space is OR, and ranking disguises it.** `cardiac lymphatic` returns byte-identical
counts to `cardiac OR lymphatic` — 1,386 apparent, 1,389 real. It *looks* like AND
because relevance ranking floats the both-terms records to the top, so a caller reading
only page one never notices, and a caller counting hits reports a number two orders of
magnitude too large. Write `AND` explicitly, or quote the phrase. `cardiac AND
lymphatic` is 10; `"cardiac lymphatic"` is 2.

**`totalHits` is an estimate unless `isTotalHitsExact` is true.** Multi-term free-text
queries return an approximation that *under*-reports and drifts with `pageSize` — 1,386
at `pageSize=1`, 1,387 at 1,000, 1,389 when paged out. Single-term and field-scoped
queries come back exact. Never report `totalHits` as "N studies exist" without checking
the flag; page to exhaustion when the number matters.

**Both collection-filter forms work and agree.** The path prefix
`/api/v1/arrayexpress/search?query=…` and the query parameter
`/api/v1/search?query=…&collection=ArrayExpress` returned the identical 1,389
accessions when each was paged to exhaustion — symmetric difference zero. Their
*estimates* differ badly (1,386 vs 1,040 for the same set), which is the estimate
problem above and not two different filters. The path prefix is the better default
because it also gives the more honest estimate. Collection names are case-insensitive.

**A wrong collection name is a silent zero.** `/array-express/search` and
`/pride/search` both return HTTP 200 with `totalHits: 0` — no 404, no error message.
Any pipeline that scopes by collection needs a positive control, or a typo becomes
"there is no public data for this".

Query fields confirmed working inside a collection: `accession` (with `*` wildcard),
`organism`, `title`, `study_type`, `author`, `type`, boolean `AND`/`OR`/`NOT`, quoted
phrases. Useful parameters alongside `query`: `pageSize` (caps at 1000), `page`,
`sortBy=release_date`, `sortOrder=descending`, and top-level filters such as
`organism=Mus musculus` and `release_date=[2026-01-01 TO 2026-12-31]`. The `facet.*`
parameters match the metadata value **literally and case-sensitively** —
`facet.organism=Mus musculus` returns 33 hits, `facet.organism=mus musculus` returns
zero. Prefer `organism:"…"` inside `query`, which is not case-fragile.

`query=*` returns zero. Use `query=*:*` for a whole-collection sweep. Measured
2026-08-17 with `*:*`: ArrayExpress 80,759 records, EuropePMC 3,302,748, BioImages
4,997, SourceData 3,711, BioModels 3,578, JCB 424.

## How much of ArrayExpress is not in GEO

The point of this archive for a "is there public data for X" question is the part GEO
does not have, so be precise about the overlap. Exact counts inside the ArrayExpress
collection, 2026-08-17:

| family | records | what it is |
|---|---|---|
| `E-GEOD-*` | 59,378 | historic imports of GEO series |
| `E-MTAB-*` | 15,123 | direct submissions to ArrayExpress |
| `E-ERAD-*` | 304 | ENA/Sanger-routed submissions |
| `E-PROT-*` | 5 | proteomics |

So most of the collection *is* GEO, mirrored years ago — and a bare `GSE16908` free-text
search still resolves to `E-GEOD-16908`, whose record links back to the GEO accession.
But that mirroring has stopped: the newest `E-GEOD-*` release dates observed were 2019,
with a single 2023 outlier, while `E-MTAB-*` accessions were released on the day of
checking. `GSE250000` has no ArrayExpress import.

The consequence for triage: the ~15k `E-MTAB-*` records are the genuinely
non-overlapping half, and they are also the actively growing half. Searching
`accession:E-MTAB* AND <your terms>` inside the collection is the query that answers
"what is here that GEO does not have" — 29 records for `lymphatic`, against 97 for the
`E-GEOD-*` imports.

## Listing files

`/files` is a flat, denormalised list, so the tree above is not needed to find data. Two
defaults will silently lose files.

```python
import json, urllib.request

API = "https://www.ebi.ac.uk/biostudies/api/v1"
PAGE = 1000                       # hard cap; limit=2000 returns zero items, not an error


def file_page(accession, offset=0, limit=PAGE, timeout=120):
    url = f"{API}/studies/{accession}/files?limit={limit}&offset={offset}"
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def file_list(accession, cap=100_000):
    """The endpoint defaults to limit=25 and silently truncates. Page it."""
    first = file_page(accession)
    total = first["pagination"]["total"]
    items = list(first["items"])
    while len(items) < min(total, cap):
        nxt = file_page(accession, offset=len(items))["items"]
        if not nxt:
            break
        items += nxt
    return items, total


def study_info(accession, timeout=60):
    with urllib.request.urlopen(f"{API}/studies/{accession}/info", timeout=timeout) as r:
        return json.loads(r.read())


print("the default is 25 items — always check pagination.total")
d = file_page("S-BIAD2193", limit=25)
print(f"  limit=25   -> {len(d['items'])} of {d['pagination']['total']}")
d = file_page("S-BIAD2193", limit=1000)
print(f"  limit=1000 -> {len(d['items'])} of {d['pagination']['total']}")
d = file_page("S-BIAD2193", limit=2000)
print(f"  limit=2000 -> {len(d['items'])} items, total reported {d['pagination']['total']}"
      "   <- over the cap, silently empty")
print()

for acc in ("E-MTAB-17485", "E-MTAB-17510", "S-BIAD2193"):
    items, total = file_list(acc)
    info = study_info(acc)
    files = [i for i in items if i.get("isDirectory") == "false"]
    size = sum(i["Size"] for i in files)
    print(f"{acc}  info.files={info['files']}  listed={len(items)}/{total}  {size / 1e9:.2f} GB")
    for i in files[:3]:
        print(f"    {i['Size']:>14,} B  {i.get('Type') or i.get('Description') or '-':<15} {i['path']}")
    if len(files) > 3:
        print(f"    … {len(files) - 3} more")
    print(f"    mirror {info['httpLink']}")
    print()
```

Printed 2026-08-17:

```
the default is 25 items — always check pagination.total
  limit=25   -> 25 of 549
  limit=1000 -> 549 of 549
  limit=2000 -> 0 items, total reported 0   <- over the cap, silently empty

E-MTAB-17485  info.files=3  listed=3/3  0.00 GB
         2,480,580 B  Processed Data  DESeq2_DEG_analysis_filter50Reads.tsv
             6,964 B  IDF File        E-MTAB-17485.idf.txt
            16,885 B  SDRF File       E-MTAB-17485.sdrf.txt
    mirror https://ftp.ebi.ac.uk/pub/databases/biostudies/E-MTAB-/485/E-MTAB-17485

E-MTAB-17510  info.files=3  listed=3/3  2.21 GB
     2,208,060,569 B  Processed Data  scRNA_HamzaLukas_detailedAnnotation_300425.h5ad
             9,499 B  IDF File        E-MTAB-17510.idf.txt
            41,107 B  SDRF File       E-MTAB-17510.sdrf.txt
    mirror https://ftp.ebi.ac.uk/pub/databases/biostudies/E-MTAB-/510/E-MTAB-17510

S-BIAD2193  info.files=549  listed=549/549  2.02 GB
         3,690,492 B  -               img_training/mtec12/7.tif
         3,690,492 B  -               img_training/mtec12/1.tif
         3,690,492 B  -               img_training/mtec12/27.tif
    … 546 more
    mirror https://ftp.ebi.ac.uk/biostudies/fire/S-BIAD/193/S-BIAD2193
```

- **The default page size is 25**, and the parameter is `limit`/`offset` — *not* the
  `pageSize`/`page` pair that search uses. Passing `pageSize=1000` is accepted, ignored,
  and returns 25 items with no warning. `S-BIAD2193` declares 549 files; the naive
  request returns 25 of them.
- **`limit` caps at 1000, and exceeding it returns an empty list with `total: 0`** rather
  than an error. Some deposits are enormous — BioImages studies with 11 million files
  exist — so paging by `offset` against `pagination.total` is the only correct approach.
- `Size` in the listing is the declared size. Read it *before* fetching: the mouse
  companion study `E-MTAB-17510` is one 2.2 GB `.h5ad`, which is not something to start
  downloading by accident.
- `path` may contain subdirectories (`img_training/mtec12/7.tif`), so percent-encode it
  and recreate the directories locally.

## Get the files

The end state is files on disk plus a manifest recording where they came from and which
release they are, because BioStudies deposits are versioned by re-release and a bare
directory of TSVs cannot be compared against a later fetch.

```python
import json, os, urllib.parse, urllib.request

API = "https://www.ebi.ac.uk/biostudies/api/v1"
FILES = "https://www.ebi.ac.uk/biostudies/files"     # NOT under /api/v1/

ACC = "E-MTAB-17485"
OUT = f"Data/biostudies/{ACC}"
MAX_BYTES = 500_000_000            # per file; raise deliberately, not by accident


def get_json(url, timeout=120):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def all_files(accession):
    """limit caps at 1000 and defaults to 25 — page against pagination.total."""
    items, total = [], None
    while total is None or len(items) < total:
        d = get_json(f"{API}/studies/{accession}/files?limit=1000&offset={len(items)}")
        total = d["pagination"]["total"]
        if not d["items"]:
            break
        items += d["items"]
    return items


os.makedirs(OUT, exist_ok=True)
study = get_json(f"{API}/studies/{ACC}")
info = get_json(f"{API}/studies/{ACC}/info")
top = {a["name"]: a["value"] for a in study.get("attributes") or []}

manifest, skipped = [], []
for it in all_files(ACC):
    if it.get("isDirectory") == "true":
        continue
    if it["Size"] > MAX_BYTES:
        skipped.append(it)
        print(f"  skip {it['Size']:>15,} B  {it['path']}  (over MAX_BYTES)")
        continue
    # Quote the path: subdirectories and spaces both occur in real deposits.
    url = f"{FILES}/{ACC}/{urllib.parse.quote(it['path'])}"
    dest = os.path.join(OUT, it["path"])
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest)          # follows the 302 to the mirror
    got = os.path.getsize(dest)
    manifest.append({"path": it["path"], "url": url, "bytes": got,
                     "declared": it["Size"], "size_ok": got == it["Size"],
                     "section": it.get("Section"), "type": it.get("Type"),
                     "format": it.get("Format")})
    print(f"  {'ok  ' if got == it['Size'] else 'SIZE'} {got:>15,} B  "
          f"{it.get('Type') or it.get('Description') or '-':<15} {dest}")

meta = {"accession": ACC,
        "collection": top.get("AttachTo"),
        "release_date": top.get("ReleaseDate"),
        "title": next((a["value"] for a in study["section"]["attributes"]
                       if a["name"] == "Title"), None),
        "record": f"{API}/studies/{ACC}",
        "mirror": info["httpLink"],
        "files_declared": info["files"],
        "files_downloaded": len(manifest),
        "files_skipped": [s["path"] for s in skipped]}
meta["files"] = manifest
with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump(meta, fh, indent=2)

print()
print(f"{len(manifest)} files, {sum(m['bytes'] for m in manifest):,} B, "
      f"all sizes match declared = {all(m['size_ok'] for m in manifest)}")
print(f"collection {meta['collection']} · released {meta['release_date']}")
print(f"manifest -> {OUT}/manifest.json")
print()
print("on disk:")
for root, _, names in os.walk(OUT):
    for n in sorted(names):
        p = os.path.join(root, n)
        print(f"  {os.path.getsize(p):>12,} B  {p}")
```

Run 2026-08-17:

```
  ok         2,480,580 B  Processed Data  Data/biostudies/E-MTAB-17485/DESeq2_DEG_analysis_filter50Reads.tsv
  ok             6,964 B  IDF File        Data/biostudies/E-MTAB-17485/E-MTAB-17485.idf.txt
  ok            16,885 B  SDRF File       Data/biostudies/E-MTAB-17485/E-MTAB-17485.sdrf.txt

3 files, 2,504,429 B, all sizes match declared = True
collection ArrayExpress · released 2026-08-03
manifest -> Data/biostudies/E-MTAB-17485/manifest.json

on disk:
     2,480,580 B  Data/biostudies/E-MTAB-17485/DESeq2_DEG_analysis_filter50Reads.tsv
         6,964 B  Data/biostudies/E-MTAB-17485/E-MTAB-17485.idf.txt
        16,885 B  Data/biostudies/E-MTAB-17485/E-MTAB-17485.sdrf.txt
         1,391 B  Data/biostudies/E-MTAB-17485/manifest.json
```

What `E-MTAB-17485` actually exposes, in full: one 2.4 MB processed table
(`DESeq2_DEG_analysis_filter50Reads.tsv`) and the two MAGE-TAB files. That is 2.5 MB
total. The 18 GB of FASTQ is not here — see below.

Read the processed file before believing its name. Inspected 2026-08-17, that table is
11,689 rows by 16 columns — an unnamed Ensembl gene ID index, **eight** normalised count
columns (`Stuffer_Control_1_S1` … `cMAF_OE_8_S8`), then `gene_id`, `gene_name`, `chr`,
`start`, `end`, `strand`, `gene_biotype`. Despite `DESeq2_DEG_analysis` in the filename
there is no log2 fold change and no adjusted p-value in it; it is normalised counts plus
gene coordinates. And eight columns is 8 of the study's 12 samples — the `IL33_OE` arm
declared in `Experimental Factors` is absent.

Both of those generalise. Processed files are whatever the submitter chose to upload:
their naming is not a schema, and they are not guaranteed to span the declared design.
Check the column count against the sample count, and the actual column names against
what you need, before treating a processed file as the study.

Compare the size on disk against the listing's `Size` — the download path 302s to the
FTP mirror, and a redirect not followed writes a plausible-looking short file. The same
bytes are also at `{httpLink}/Files/{path}` on `ftp.ebi.ac.uk`, which is the route to
prefer for bulk work; note the `/Files/` segment, which `httpLink` itself omits.

## The MAGE-TAB pair, and where the raw reads are

Every ArrayExpress deposit carries two tab-delimited files. The **IDF** is the
investigation header — title, contacts, protocol text, publication references. The
**SDRF** is the sample and data relationship table, and it is the only place the
per-sample design exists in full. The JSON `Samples` section is a summary of it.

```python
import csv, json, urllib.error, urllib.request

ACC = "E-MTAB-17485"
SDRF = f"Data/biostudies/{ACC}/{ACC}.sdrf.txt"
ENA = "https://www.ebi.ac.uk/ena/portal/api/filereport"

with open(SDRF) as fh:
    rows = list(csv.DictReader(fh, delimiter="\t"))

# One row per data FILE, not per sample: paired-end gives two rows per run.
runs = {}
for r in rows:
    runs.setdefault(r["Comment[ENA_RUN]"], r)
print(f"{len(rows)} SDRF rows -> {len(runs)} sequencing runs")
print()

factor = [c for c in rows[0] if c.startswith("Factor Value")]
chars = [c for c in rows[0] if c.startswith("Characteristics")]
print("the design table the study section only summarises")
print(f"  {'run':14} {'sample':10} {'factor':10} {'organism':13} part")
for run, r in sorted(runs.items())[:6]:
    print(f"  {run:14} {r['Source Name']:10} {r[factor[0]]:10} "
          f"{r['Characteristics[organism]']:13} {r['Characteristics[organism part]']}")
print(f"  … {len(runs) - 6} more")
print()
print("factor column :", factor)
print("characteristics:", [c[16:-1] for c in chars])
print()

# Do NOT trust Comment[FASTQ_URI]. Resolve the runs through ENA instead.
bad = 0
for run, r in list(runs.items())[:3]:
    uri = r.get("Comment[FASTQ_URI]", "")
    https = "https://" + uri.split("://", 1)[1] if "://" in uri else uri
    try:
        code = urllib.request.urlopen(
            urllib.request.Request(https, method="HEAD"), timeout=45).status
    except urllib.error.HTTPError as e:
        code = e.code
        bad += 1
    print(f"  SDRF Comment[FASTQ_URI] -> HTTP {code}  {uri}")
print(f"  {bad} of 3 sampled URIs did not resolve")
print()

# The study section's links entry is the authoritative pointer to raw reads.
study = json.loads(urllib.request.urlopen(
    f"https://www.ebi.ac.uk/biostudies/api/v1/studies/{ACC}", timeout=60).read())
links = []
for item in study["section"].get("links") or []:
    links.extend(item if isinstance(item, list) else [item])
ena = [l["url"] for l in links
       if any(a["name"] == "Type" and a["value"] == "ENA" for a in l.get("attributes") or [])]
print("ENA study accession from the record's links:", ena)

fields = "run_accession,sample_title,library_layout,read_count,fastq_ftp,fastq_bytes,fastq_md5"
url = f"{ENA}?accession={ena[0]}&result=read_run&format=tsv&fields={fields}"
tsv = urllib.request.urlopen(url, timeout=90).read().decode()
# ENA does not promise a row order — sort, or "the first run" differs between calls.
ena_rows = sorted(csv.DictReader(tsv.splitlines(), delimiter="\t"),
                  key=lambda r: r["run_accession"])
print(f"{len(ena_rows)} runs in {ena[0]}")
total = 0
for r in ena_rows[:3]:
    urls = ["https://" + u for u in r["fastq_ftp"].split(";")]
    sizes = [int(b) for b in r["fastq_bytes"].split(";")]
    total += sum(sizes)
    print(f"  {r['run_accession']:13} {r['sample_title']:10} {r['library_layout']:7} "
          f"{int(r['read_count']):>11,} reads  {sum(sizes) / 1e9:.2f} GB")
    print(f"    {urls[0]}")
allsize = sum(sum(int(b) for b in r["fastq_bytes"].split(";")) for r in ena_rows)
print(f"  … {len(ena_rows) - 3} more · {allsize / 1e9:.1f} GB of FASTQ in total")

head = urllib.request.urlopen(urllib.request.Request(
    "https://" + ena_rows[0]["fastq_ftp"].split(";")[0], method="HEAD"), timeout=60)
print(f"\n  HEAD first FASTQ -> HTTP {head.status}, "
      f"{int(head.headers['Content-Length']):,} bytes")
```

Printed 2026-08-17:

```
24 SDRF rows -> 12 sequencing runs

the design table the study section only summarises
  run            sample     factor     organism      part
  ERR17675096    Sample 1   cMAF_OE    Homo sapiens  dermis
  ERR17675097    Sample 10  Control    Homo sapiens  dermis
  ERR17675098    Sample 11  Control    Homo sapiens  dermis
  ERR17675099    Sample 12  Control    Homo sapiens  dermis
  ERR17675100    Sample 2   cMAF_OE    Homo sapiens  dermis
  ERR17675101    Sample 3   cMAF_OE    Homo sapiens  dermis
  … 6 more

factor column : ['Factor Value[rna interference]']
characteristics: ['organism', 'developmental stage', 'genotype', 'organism part', 'cell type', 'cultured cell', 'disease']

  SDRF Comment[FASTQ_URI] -> HTTP 403  ftp://ftp.sra.ebi.ac.uk/vol1/fastqERR176/096/ERR17675096/ERR17675096_1.fastq.gz
  SDRF Comment[FASTQ_URI] -> HTTP 404  ftp://ftp.sra.ebi.ac.uk/vol1/fastqERR176/097/ERR17675097/ERR17675097_1.fastq.gz
  SDRF Comment[FASTQ_URI] -> HTTP 404  ftp://ftp.sra.ebi.ac.uk/vol1/fastqERR176/098/ERR17675098/ERR17675098_1.fastq.gz
  3 of 3 sampled URIs did not resolve

ENA study accession from the record's links: ['ERP203237']
12 runs in ERP203237
  ERR17675096   Sample 1   PAIRED   47,291,696 reads  1.40 GB
    https://ftp.sra.ebi.ac.uk/vol1/fastq/ERR176/096/ERR17675096/ERR17675096_1.fastq.gz
  ERR17675097   Sample 10  PAIRED   58,843,700 reads  1.75 GB
    https://ftp.sra.ebi.ac.uk/vol1/fastq/ERR176/097/ERR17675097/ERR17675097_1.fastq.gz
  ERR17675098   Sample 11  PAIRED   55,781,260 reads  1.65 GB
    https://ftp.sra.ebi.ac.uk/vol1/fastq/ERR176/098/ERR17675098/ERR17675098_1.fastq.gz
  … 9 more · 18.3 GB of FASTQ in total

  HEAD first FASTQ -> HTTP 200, 701,849,491 bytes
```

Three things this establishes.

**BioStudies holds metadata and processed files. Raw reads are in ENA.** The record's
`section.links` entry with `Type` of `ENA` carries the study accession — `ERP203237`
here — and the ENA Portal API turns that into per-run FASTQ URLs with byte counts, read
counts and MD5s. `E-MTAB-17485` is 2.5 MB in BioStudies and 18.3 GB of FASTQ in ENA.
Budget from `fastq_bytes` before fetching anything.

**`Comment[FASTQ_URI]` in the SDRF is not reliable.** All three sampled URIs for this
study are missing the path separator after `fastq`, and the FTP host answers 404 or 403
depending on how far up the bad path it gets. Checked across five
ArrayExpress studies on 2026-08-17: two of five had first URIs that 404'd
(`E-MTAB-17485`, `E-MTAB-17510`), three resolved (`E-MTAB-14722`, `E-MTAB-13907`,
`E-MTAB-11524`), and the working ones use two different ENA layouts
(`/vol1/fastq/` for ENA-normalised reads, `/vol1/run/` for submitted filenames). Treat
the column as a hint, verify with a HEAD request, and resolve through the ENA Portal API
when it fails. `Comment[ENA_RUN]` — the run accession itself — was correct in every case.

**The SDRF has one row per data file, not per sample.** 24 rows describe 12 paired-end
runs. Deduplicate on `Comment[ENA_RUN]` before counting samples or you double every
group size. Columns follow the MAGE-TAB convention — `Characteristics[...]` for sample
annotation, `Factor Value[...]` for the experimental variable, `Comment[...]` for
identifiers and library details.

The `E-MTAB-17485` design read off the SDRF: 12 human dermal lymphatic endothelial cell
samples, paired-end, three arms of four (`Control`, `cMAF_OE`, `IL33_OE`) under a single
`rna interference` factor. Its companion `E-MTAB-17510` is the mouse single-cell arm of
the same study — worth stating precisely, because the paper's abstract describes human
*and* mouse work and `E-MTAB-17485` alone is human bulk RNA-seq. Human plus mouse means
both accessions.

## What this does not cover

- **Submitting data.** Deposition goes through the BioStudies submission tool and needs
  an account. This skill is read-only.
- **Embargoed studies.** A private deposit 404s exactly like a nonexistent one, so this
  skill cannot distinguish "no such accession" from "not released yet", and there is no
  anonymous route to an unreleased record. If a paper cites an accession that 404s, ask
  the authors rather than concluding the data does not exist.
- **Cross-archive resolution.** A `GSE*` that was never mirrored is not here and never
  will be; go to GEO. Proteomics goes to PRIDE, metabolomics to MetaboLights, EM maps to
  EMPIAR — none of those are BioStudies collections, and asking for them by that name
  returns a silent zero.
- **Reanalysis.** What you get is what the submitter uploaded. Processed files use the
  submitter's pipeline, genome build and normalisation, none of which are harmonised
  across studies, and a study's processed table may not cover its whole design.

## Try it

Checks the response *shape*, not just reachability. Public data, no account, no key.

**Data** — ArrayExpress accession `E-MTAB-17485`, a 2026 bulk RNA-seq study of human
dermal lymphatic endothelial cells from an age-associated cardiac lymphatic project,
resolved by the BioStudies study endpoint:

    https://www.ebi.ac.uk/biostudies/api/v1/studies/E-MTAB-17485

BioStudies records are openly available from EMBL-EBI with no account or licence
acceptance; individual submissions carry the submitter's terms, and this one is public.
Chosen because it exercises every structural trap at once — nested subsection lists, a
repeated attribute name, protocols as sibling sections, and raw data held in ENA rather
than here. Last confirmed reachable 2026-08-17.

```python
import json, urllib.parse, urllib.request

API = "https://www.ebi.ac.uk/biostudies/api/v1"
ACC = "E-MTAB-17485"


def j(url, timeout=90):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def flatten(container):
    out = []
    for item in container or []:
        out.extend(item if isinstance(item, list) else [item])
    return out


def attrs(node):
    out = {}
    for a in node.get("attributes") or []:
        out.setdefault(a["name"], []).append(a.get("value"))
    return out


def walk(sec, path=()):
    here = path + (sec.get("type") or "?",)
    yield here, sec
    for child in flatten(sec.get("subsections")):
        yield from walk(child, here)


study = j(f"{API}/studies/{ACC}")
root = study["section"]

# 1. Envelope. Metadata is NOT flat -- there is a `section`, and no `title` key.
assert set(study) == {"accno", "attributes", "section", "type"}, sorted(study)
assert study["accno"] == ACC
assert "title" not in study and "organism" not in study

# 2. The collection is a top-level attribute, not a field and not in the section.
assert attrs(study)["AttachTo"] == ["ArrayExpress"]

# 3. The container trap: subsections/files/links elements are objects OR lists.
assert any(isinstance(x, list) for x in root["subsections"]), "nesting changed"
assert all(isinstance(x, list) for x in root["links"])

tree = list(walk(root))
assert tree[0][0] == ("Study",)
prot = [s for p, s in walk(root) if s["type"] == "Protocols"]
chars = [s for p, s in walk(root) if s["type"] == "Source Characteristics"]
assert prot and chars, "expected Protocols and Source Characteristics sections"

# 4. Organism is on a nested section, not the envelope.
assert attrs(chars[0])["Organism"] == attrs(root)["Organism"]

# 5. The file list agrees with the info endpoint, and honours pagination.
info = j(f"{API}/studies/{ACC}/info")
fl = j(f"{API}/studies/{ACC}/files?limit=1000")
assert fl["pagination"]["total"] == info["files"] == len(fl["items"])
assert {i["path"] for i in fl["items"]} >= {f"{ACC}.idf.txt", f"{ACC}.sdrf.txt"}

# 6. Space-separated terms are OR. Confirm AND is a strict subset.
#    Page to exhaustion -- totalHits under-reports on multi-term queries, so a
#    single page of the OR result is not the whole set to compare against.
def hits(q, coll="arrayexpress"):
    # Returns the past-the-end response, by which point totalHits has settled
    # on an exact figure, plus the accession set actually retrieved.
    got, page = [], 1
    while True:
        qs = urllib.parse.urlencode({"query": q, "pageSize": 1000, "page": page})
        d = j(f"{API}/{coll}/search?{qs}")
        if not d["hits"]:
            return d, {h["accession"] for h in got}
        got += d["hits"]
        page += 1

d_or, s_or = hits("cardiac lymphatic")
d_and, s_and = hits("cardiac AND lymphatic")
d_ph, s_ph = hits('"cardiac lymphatic"')
assert s_ph <= s_and <= s_or, "phrase ⊆ AND ⊆ OR no longer holds"
assert len(s_and) < len(s_or)
assert ACC in s_and and ACC in s_ph

# 7. An unknown collection is a silent zero, never an error.
_, s_bad = hits("cardiac AND lymphatic", coll="array-express")
assert s_bad == set()

print("accession      :", study["accno"], "| envelope keys:", sorted(study))
print("collection     :", attrs(study)["AttachTo"][0])
print("title          :", attrs(root)["Title"][0][:62])
print("organism       :", attrs(chars[0])["Organism"], "| assay:", attrs(root)["Study type"])
print("sections       :", len(tree), "in", len({p for p, _ in tree}), "distinct paths")
print("section types  :", sorted({s["type"] for _, s in tree}))
print("protocols      :", len(prot))
print("files          :", info["files"], "|", sorted(i["path"] for i in fl["items"]))
print("bytes          :", f'{sum(i["Size"] for i in fl["items"]):,}')
print("ena link       :", [l["url"] for l in flatten(root["links"])])
print()
print("search 'cardiac lymphatic'   :", len(s_or), "records (OR); totalHits said",
      d_or["totalHits"], "exact =", d_or["isTotalHitsExact"])
print("search 'cardiac AND …'       :", len(s_and), "records; totalHits said",
      d_and["totalHits"], "exact =", d_and["isTotalHitsExact"])
print('search \'"cardiac lymphatic"\' :', len(s_ph), "records ->", sorted(s_ph))
print("bad collection name          :", len(s_bad), "records, HTTP 200")
```

**Expect**

Invariants — true regardless of what upstream releases next, so a failure means this
skill is wrong rather than stale:

- The envelope has exactly `accno`, `attributes`, `section`, `type`. There is **no**
  top-level `title` or `organism`. Code that reads `study["title"]` is the mistake this
  asserts against.
- The collection is a top-level `attributes` entry named `AttachTo`, not a field and not
  in the section.
- At least one element of `section["subsections"]` is a **list**, and every element of
  `section["links"]` is a list. This is the container trap, and it is what a traversal
  written for a uniform tree fails on.
- Organism resolves identically from the Study section and from the nested
  `Source Characteristics` section — the traversal reaches the right node.
- `pagination.total` from `/files` equals `files` from `/info` equals the number of items
  returned when `limit=1000`. If these diverge, the file list is being truncated.
- Space-separated terms are OR — `"cardiac lymphatic"` ⊆ `cardiac AND lymphatic` ⊆
  `cardiac lymphatic`, with the AND set strictly smaller.
- An unknown collection name returns HTTP 200 and zero hits, not an error.

Observed 2026-08-17 — these move as studies are released, so a mismatch is drift to
investigate, not a bug:

```
accession      : E-MTAB-17485 | envelope keys: ['accno', 'attributes', 'section', 'type']
collection     : ArrayExpress
title          : Age-Associated Loss of Lymphatic Vessels Promotes Cardiac Infl
organism       : ['Homo sapiens'] | assay: ['RNA-seq of coding RNA']
sections       : 20 in 12 distinct paths
section types  : ['Assays and Data', 'Author', 'Experimental Factors', 'Factors Table', 'MAGE-TAB Files', 'MINSEQE Score', 'Organization', 'Processed Data', 'Protocols', 'Samples', 'Source Characteristics', 'Study']
protocols      : 7
files          : 3 | ['DESeq2_DEG_analysis_filter50Reads.tsv', 'E-MTAB-17485.idf.txt', 'E-MTAB-17485.sdrf.txt']
bytes          : 2,504,429
ena link       : ['ERP203237']

search 'cardiac lymphatic'   : 1389 records (OR); totalHits said 1389 exact = True
search 'cardiac AND …'       : 10 records; totalHits said 10 exact = True
search '"cardiac lymphatic"' : 2 records -> ['E-MTAB-17485', 'E-MTAB-17510']
bad collection name          : 0 records, HTTP 200
```

The two `"cardiac lymphatic"` phrase hits are the human bulk and mouse single-cell arms
of the same study. New deposits will join that set.

## Sources

- BioStudies — https://www.ebi.ac.uk/biostudies/
- API — https://www.ebi.ac.uk/biostudies/help#api
- ArrayExpress collection — https://www.ebi.ac.uk/biostudies/arrayexpress
- FTP mirror — https://ftp.ebi.ac.uk/pub/databases/biostudies/
- ENA Portal API, for the raw reads — https://www.ebi.ac.uk/ena/portal/api/
- Sarkans et al. (2021) *Nucleic Acids Research* 49, D1507-D1512 — https://doi.org/10.1093/nar/gkaa1062
- Athar et al. (2026) *Journal of Molecular Biology* — https://doi.org/10.1016/j.jmb.2026.169874
- Athar et al. (2019) *Nucleic Acids Research* 47, D711-D715 — https://doi.org/10.1093/nar/gky964
- Rayner et al. (2006) *BMC Bioinformatics* 7, 489, the MAGE-TAB format — https://doi.org/10.1186/1471-2105-7-489

BioStudies is operated by EMBL-EBI. Individual submissions carry their submitters' terms
and citation requests, and the record's own publication references are in the IDF —
cite the depositing study, not just the archive, when you use someone's data.
