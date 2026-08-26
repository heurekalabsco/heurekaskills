---
name: biostudies
description: Search and retrieve studies from EBI BioStudies, the archive holding the ArrayExpress collection of functional-genomics submissions whose E-MTAB accessions mostly never reach GEO. Resolve an accession, traverse the nested section tree that carries title, organism and protocols, and download processed files and MAGE-TAB sample tables.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.1.0
tags: [arrayexpress, rna-seq, transcriptomics, public-data, microarray]
covers: [arrayexpress, biostudies, E-MTAB, E-GEOD, E-MEXP, S-BIAD, S-BSST, EMPIAR, rna-seq, scRNA-seq, single cell, microarray, functional genomics, transcriptomics, gene expression, differential expression, MAGE-TAB, SDRF, h5ad, ENA, fastq, EMBL-EBI, bioimages, cryo-EM, heart, lymphatic endothelial cells, human, mouse, cardiac inflammation, EFO]
papers: [PMID:33211879, PMID:42167442, PMID:29069414, PMID:26700850, PMID:30357387, PMID:25361974, PMID:12519949, PMID:17087822]
access: [open]
datasets: [https://www.ebi.ac.uk/biostudies/api/v1/studies/E-MTAB-17485, https://www.ebi.ac.uk/biostudies/api/v1/studies/S-BIAD1500]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-19
  against: BioStudies API v1 / ENA Portal API / Python 3.12.8 / curl 8.7.1
  executed: 7
  unverified: 0
  records: 20 accessions across ArrayExpress, BioImages, BioImages-EMPIAR, JCB,
    SourceData, BioModels, EuropePMC and uncollected S-BSST deposits
---
# EBI BioStudies and the ArrayExpress collection

BioStudies (EMBL-EBI) is a **container archive**, not a repository of one data type.
ArrayExpress is a *collection* inside it, and it is where a large share of European
functional-genomics work is deposited instead of GEO. An `E-MTAB-*` accession in a
methods section is the ArrayExpress equivalent of a `GSE*`, and this is the endpoint
that resolves it.

Other collections in the same archive answer to the same API — BioImages (`S-BIAD*`),
BioImages-EMPIAR (`EMPIAR-*`), EuropePMC supplementary data (`S-EPMC*`), BioModels
(`MODEL*`), SourceData (`S-SCDT-*`), JCB (`S-JCBD-*`), plus direct submissions with no
collection at all (`S-BSST*`). Scoping to the right one is a large part of using this
well — and **an accession prefix does not name a collection**. `EMPIAR-*` and `S-JCBD-*`
records come back from a `bioimages` scope because those are sub-collections of it, and
192 of the 1,746 `S-BSST*` deposits are attached to BioImages rather than to nothing —
none to any other collection. Read `AttachTo` off the record; do not infer it from the
prefix.

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
# -f matters as much: this path serves a 14 KB HTML page on 404, and without -f
# curl writes it into the destination and exits 0.
curl -fsSL -o E-MTAB-17485.sdrf.txt -w 'http=%{http_code} redirects=%{num_redirects} bytes=%{size_download}\n' \
  "https://www.ebi.ac.uk/biostudies/files/E-MTAB-17485/E-MTAB-17485.sdrf.txt"
```

Printed 2026-08-19:

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

Failure modes, all checked 2026-08-19. **Only `/studies` 404s.** The other two routes
answer 200 for an accession that does not exist:

| request | `/studies/{acc}` | `/studies/{acc}/info` | `/studies/{acc}/files` |
|---|---|---|---|
| `E-MTAB-17485` | 200 | 200, `files: 3` | 200, `total: 3` |
| `e-mtab-17485` | **404** — lookup is case-sensitive | **200, `{}`** | **200, `total: 0`** |
| `GSE12345` | 404 — GEO ids are not accessions here | 200, `{}` | 200, `total: 0` |
| `E-MTAB-99999999` | 404 `{"errorMessage":"Study not found"}` | 200, `{}` | 200, `total: 0` |

That asymmetry is the trap. A pipeline that starts from `/files` reports a typo'd or
embargoed accession as **a released study holding no data**, which is also exactly what
`EMPIAR-13332` and `S-EPMC285135` legitimately are. Resolve through `/studies` or
`/info` first and treat a missing `files` key as "no such study" — `/info` returning
`{}` is the only signal either of those routes gives you.

A 404 itself conflates *never existed*, *not yet released*, and *withdrawn*. Since
embargoed studies also 404, an accession printed in a paper that does not resolve is
usually an unreleased deposit rather than a typo — worth saying so instead of reporting
"no data".

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
    # `accno` is optional on a section — absent on Author, Funding, Publication and
    # on the Study root of several collections. Index it and you get a KeyError the
    # moment you point this at anything but an ArrayExpress deposit.
    print(f"  {p.get('accno', '-'):16} {one(p, 'Type')}")
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
    print(f"  {t.get('accno', '-'):12} {a} n={n}")
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

Run 2026-08-19 against `E-MTAB-17485`, abridged:

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
| title | **either place** — see below |
| description, organism, assay type | `section.attributes` |
| wet-lab and analysis protocols | `section.subsections` of type `Protocols`, one per step |
| organism part, cell type, disease, genotype | section `Source Characteristics` |
| factor levels and group sizes | sections `Experimental Factors` and `Factors Table` |
| EFO term IDs | `valqual` on the attribute that carries the label |
| pointers to raw reads | `section.links`, `Type` of `ENA` |
| the per-sample table | not in the JSON at all — the SDRF file |

**`Title` is on the envelope for some collections and in the Study section for others,
and `ReleaseDate` is not guaranteed at all.** Checked 2026-08-19: `E-MTAB-17485`,
`S-BIAD2193`, `S-EPMC285135` and `S-SCDT-EMBOJ-2018-99599` carry it in both places;
`S-BSST1` carries it **only** at top level and its Study section holds nothing but
`Description`; `MODEL6614879888` and `EMPIAR-13332` carry it **only** in the section.
`S-SCDT-EMBOJ-2018-99599` has no `ReleaseDate` anywhere. Reading one place and calling
the other absent is how a harvest writes `"title": null` for a whole collection:

```python
def attr(node, name):
    """Try the envelope and the Study section. Neither alone is reliable."""
    for a in node.get("attributes") or []:
        if a["name"] == name:
            return a.get("value")
    return None

title = attr(study, "Title") or attr(study["section"], "Title")
```

Two more details that bite. `Organism` on the Study section is a **summary**; a study
with several organisms lists several, and the authoritative per-sample assignment is the
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


def search_all(query, collection=None, limit=None, **params):
    """`totalHits` can be an estimate. Page to exhaustion for a real count.

    No default ceiling, and the second return value says whether you got the
    whole set. A ceiling that stops short and returns a bare list is how a
    caller reports 20,000 records as the whole of an 80,763-record collection.
    Search itself has no deep-page cap — page 3,303 of EuropePMC works.
    """
    out, page = [], 1
    while True:
        hits = search(query, collection, page=page, page_size=1000, **params)["hits"]
        if not hits:
            return out, True
        out += hits
        if limit and len(out) >= limit:
            return out[:limit], False
        page += 1


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
by_path, _ = search_all("cardiac lymphatic", collection="arrayexpress")
by_param, _ = search_all("cardiac lymphatic", **{"collection": "ArrayExpress"})
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
print("collections NEST — a scope returns its sub-collections too")


def exact(query, collection):
    d = search(query, collection=collection, page_size=1)
    assert d["isTotalHitsExact"], query
    return d["totalHits"]


whole = exact("*:*", "bioimages")
parts = {p: exact(f"accession:{p}*", "bioimages")
         for p in ("S-BIAD", "EMPIAR", "S-JCBD", "S-BSST")}
print(f"  /bioimages/search?query=*:*   {whole} records = {parts}")
print(f"  /BioImages-EMPIAR/search      {exact('*:*', 'BioImages-EMPIAR')}"
      "   <- addressable on its own")
print(f"  /JCB/search                   {exact('*:*', 'JCB')}"
      "   <- and counted inside bioimages as well")

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

Printed 2026-08-19:

```
space-separated terms are OR, not AND — ranking hides it
  cardiac                    1224  exact=False top=['E-GEOD-64403', 'E-GEOD-50221', 'E-GEOD-30076']
  lymphatic                   139  exact=True  top=['E-GEOD-16908', 'E-GEOD-6257', 'E-GEOD-84551']
  cardiac lymphatic          1386  exact=False top=['E-MTAB-17485', 'E-MTAB-17510', 'E-GEOD-16908']
  cardiac OR lymphatic       1386  exact=False top=['E-MTAB-17485', 'E-MTAB-17510', 'E-GEOD-16908']
  cardiac AND lymphatic        10  exact=True  top=['E-MTAB-17485', 'E-MTAB-17510', 'E-MTAB-12742']
  "cardiac lymphatic"           2  exact=True  top=['E-MTAB-17485', 'E-MTAB-17510']

scope — the same query, whole archive vs one collection
  ALL BioStudies      375  ['S-EPMC8756423', 'S-SCDT-10_1038-S44321-025-00345-W', 'S-EPMC11376687', 'S-EPMC8478352']
  arrayexpress         10  ['E-MTAB-17485', 'E-MTAB-17510', 'E-MTAB-12742', 'E-GEOD-26328']

two ways to express the collection filter — same result set
  /arrayexpress/search        1390 records
  /search?collection=…        1390 records
  symmetric difference       0
  reported totalHits         1385  <- estimate, under the truth

an unknown collection is HTTP 200 with zero hits, never an error
  /arrayexpress      10 hits
  /ArrayExpress      10 hits
  /array-express      0 hits
  /biostudies         0 hits
  /pride              0 hits

collections NEST — a scope returns its sub-collections too
  /bioimages/search?query=*:*   5007 records = {'S-BIAD': 1384, 'EMPIAR': 3003, 'S-JCBD': 424, 'S-BSST': 192}
  /BioImages-EMPIAR/search      3003   <- addressable on its own
  /JCB/search                   424   <- and counted inside bioimages as well

field-scoped queries, which also make the count exact
  accession:E-MTAB-17485                                     1 exact=True  ['E-MTAB-17485']
  organism:"Mus musculus" AND cardiac AND lymphatic          2 exact=True  ['E-MTAB-17510', 'E-MTAB-62']
  accession:E-MTAB* AND lymphatic                           29 exact=True  ['E-MTAB-17485', 'E-MTAB-8950', 'E-MTAB-17510']
  accession:E-GEOD* AND lymphatic                           97 exact=True  ['E-GEOD-16908', 'E-GEOD-6257', 'E-GEOD-84551']
  study_type:"RNA-seq of coding RNA from single cells" A     8 exact=True  ['E-MTAB-17510', 'E-MTAB-11524', 'E-MTAB-10434']
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

Five things that determine whether a search is usable:

**Space is OR, and ranking disguises it.** `cardiac lymphatic` returns byte-identical
counts to `cardiac OR lymphatic` — 1,386 apparent, 1,390 real. It *looks* like AND
because relevance ranking floats the both-terms records to the top, so a caller reading
only page one never notices, and a caller counting hits reports a number two orders of
magnitude too large. Write `AND` explicitly, or quote the phrase. `cardiac AND
lymphatic` is 10; `"cardiac lymphatic"` is 2.

**`totalHits` is an estimate unless `isTotalHitsExact` is true.** Multi-term free-text
queries return an approximation that *under*-reports and climbs with `pageSize` — for
`cardiac lymphatic` inside ArrayExpress on 2026-08-19: 1,385 at `pageSize=1`, 1,386 at
100, 1,388 at 1,000, and 1,390 when paged out. Single-term and field-scoped queries come
back exact. Never report `totalHits` as "N studies exist" without checking the flag;
page to exhaustion when the number matters, and note that `search_all` above returns a
completeness flag alongside the hits for exactly that reason.

**Both collection-filter forms work and agree.** The path prefix
`/api/v1/arrayexpress/search?query=…` and the query parameter
`/api/v1/search?query=…&collection=ArrayExpress` returned the identical 1,390
accessions when each was paged to exhaustion — symmetric difference zero — and on
2026-08-19 the same estimates at every `pageSize` tried. An earlier check on 2026-08-17
saw the parameter form estimate 1,040 against the prefix form's 1,386 for that same set;
that gap has closed, which is one more reason not to compare estimates. Collection names
are case-insensitive.

**A wrong collection name is a silent zero.** `/array-express/search` and
`/pride/search` both return HTTP 200 with `totalHits: 0` — no 404, no error message.
Any pipeline that scopes by collection needs a positive control, or a typo becomes
"there is no public data for this".

**A right collection name returns more than you asked for, because collections nest.**
`/bioimages/search?query=*:*` is 5,007 records: 1,384 `S-BIAD*` image deposits, **3,003
`EMPIAR-*`** cryo-EM entries in the `BioImages-EMPIAR` sub-collection, 424 `S-JCBD-*`
in `JCB`, and 192 `S-BSST*` attached to BioImages. Every one of the 3,003 EMPIAR records
declares **zero files** — their data lives in EMPIAR's own archive, and BioStudies holds
only the metadata stub — so "BioImages has 5,007 studies" and "BioImages has 5,007
studies with images in it" differ by a factor of three. `BioImages-EMPIAR` and `JCB` are
addressable on their own, and the same records are counted under both scopes. Filter on
`accession:S-BIAD*` when you mean the image deposits.

Query fields confirmed working inside a collection: `accession` (with `*` wildcard),
`organism`, `title`, `study_type`, `author`, `type`, boolean `AND`/`OR`/`NOT`, quoted
phrases. Useful parameters alongside `query`: `pageSize` (caps at 1000), `page`,
`sortBy=release_date`, `sortOrder=descending`, and top-level filters such as
`organism=Mus musculus` and `release_date=[2026-01-01 TO 2026-12-31]`. The `facet.*`
parameters match the metadata value **literally and case-sensitively** —
on `query=cardiac lymphatic` inside ArrayExpress, `facet.organism=Mus musculus` returns
725 hits and `facet.organism=mus musculus` returns zero. Prefer `organism:"…"` inside
`query`, which is not case-fragile.

`query=*` returns zero. Use `query=*:*` for a whole-collection sweep. Measured
2026-08-19 with `*:*`, and these do **not** partition the archive — BioImages contains
the other two: ArrayExpress 80,763, EuropePMC 3,302,748, BioImages 5,007 (of which
`BioImages-EMPIAR` 3,003 and `JCB` 424, leaving 1,384 `S-BIAD*`), SourceData 3,719,
BioModels 3,578.

## How much of ArrayExpress is not in GEO

The point of this archive for a "is there public data for X" question is the part GEO
does not have, so be precise about the overlap. Exact counts inside the ArrayExpress
collection, 2026-08-19:

| family | records | released | what it is |
|---|---|---|---|
| `E-GEOD-*` | 59,378 | 2001–2023 | historic imports of GEO series |
| `E-MTAB-*` | 15,127 | 2008–today | direct submissions to ArrayExpress |
| `E-MEXP-*` | 3,665 | 2002–2024 | MIAMExpress-era direct submissions |
| `E-TABM-*` | 1,128 | 2004–2022 | early MAGE-TAB direct submissions |
| `E-SMDB-*` | 338 | 2003–2013 | Stanford Microarray Database imports |
| `E-ERAD-*` | 304 | 2011–2026 | ENA/Sanger-routed submissions |
| ~34 more | 823 | 2002–2025 | `E-TIGR-` 125, `E-BUGS-` 111, `E-CAGE-` 60, `E-NASC-` 59, `E-PROT-` 5, … |

**`E-GEOD` + `E-MTAB` is 74,505 of 80,763 — 6,258 records sit in families neither name
covers**, and `E-MEXP-*` and `E-TABM-*` in particular are direct deposits, not GEO
mirrors. Each of those counts is an exact `accession:{family}*` field query, and the
`E-MTAB-*` figure moves within a day.

So most of the collection *is* GEO, mirrored years ago — and a bare `GSE16908` free-text
search still resolves to `E-GEOD-16908`, whose record links back to the GEO accession.
But that mirroring has stopped: the newest `E-GEOD-*` release dates observed were 2019,
with a single 2023 outlier, while `E-MTAB-*` accessions were released on the day of
checking. `GSE250000` has no ArrayExpress import.

The consequence for triage: everything that is not `E-GEOD-*` is the genuinely
non-overlapping part — 21,385 records, of which `E-MTAB-*` is the actively growing
three quarters. `accession:E-MTAB* AND <your terms>` is the query for what GEO does not
have *and is still receiving* — 29 records for `lymphatic`, against 97 for the
`E-GEOD-*` imports — while `*:* NOT accession:E-GEOD*` is the query for the whole of
it. Note the `*:*`: a bare `NOT accession:E-GEOD*` returns **zero**, because the parser
needs a positive clause to subtract from and does not say so. The older families are
microarray-era and small, which is why they are easy to forget and also why forgetting
them costs little for recent work.

## Listing files

`/files` is a flat, denormalised list, so the tree above is not needed to find data — it
expands the separate `File List` JSONs that BioImages deposits reference, and it reaches
subsections the study record only summarises. Checked against 17 records across seven
collections, its count equalled `/info`'s `files` every time. Four defaults around it
will silently lose data.

```python
import json, urllib.request

API = "https://www.ebi.ac.uk/biostudies/api/v1"
PAGE = 1000                       # hard cap; limit=2000 returns zero items, not an error


def file_page(accession, offset=0, limit=PAGE, timeout=120):
    url = f"{API}/studies/{accession}/files?limit={limit}&offset={offset}"
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def study_info(accession, timeout=60):
    """`/info` answers 200 with `{}` for an accession that does not exist."""
    with urllib.request.urlopen(f"{API}/studies/{accession}/info", timeout=timeout) as r:
        info = json.loads(r.read())
    if "files" not in info:
        raise LookupError(f"{accession}: no such released study — /info returned {{}}")
    return info


def file_list(accession, cap=None):
    """Page against the declared count. Three defaults lose data silently.

    /files answers 200 with total 0 for an accession that does not exist, so a
    typo or an embargo reads as a study with no files — go through /info, which
    at least returns {}. The default page is 25. And an offset past the end
    returns the LAST page again rather than an empty one, so a loop that stops
    on an empty page never stops.
    """
    total = study_info(accession)["files"]
    items, seen = [], set()
    while len(items) < (min(total, cap) if cap else total):
        page = file_page(accession, offset=len(items))["items"]
        fresh = [i for i in page if i["path"] not in seen]
        if not fresh:
            break
        seen.update(i["path"] for i in fresh)
        items += fresh
    if cap is None and len(items) != total:
        raise RuntimeError(f"{accession}: listed {len(items)} of {total} declared")
    return items, total


print("the default is 25 items — always check pagination.total")
for limit in (25, 1000, 2000):
    d = file_page("S-BIAD2193", limit=limit)
    note = "   <- over the cap, silently empty" if limit > PAGE else ""
    print(f"  limit={limit:<5} -> {len(d['items'])} of {d['pagination']['total']}{note}")
d = file_page("S-BIAD1069", offset=4_715_142)
print(f"  offset past the end -> {len(d['items'])} items, not 0"
      "   <- the last page, repeated")
print()

print("a nonexistent accession is 200 and an empty list, not a 404")
for acc in ("E-MTAB-17485", "E-MTAB-99999999", "e-mtab-17485"):
    d = file_page(acc)
    try:
        declared = study_info(acc)["files"]
    except LookupError:
        declared = "LookupError"
    print(f"  {acc:18} /files total={d['pagination']['total']:<4} /info -> {declared}")
print()

for acc in ("E-MTAB-17485", "S-BIAD2193", "S-BIAD1500", "EMPIAR-13332", "S-BIAD4"):
    items, total = file_list(acc)
    info = study_info(acc)
    zipped = [i for i in items if i.get("isDirectory") == "true"]
    size = sum(i["Size"] for i in items)
    print(f"{acc:14} info.files={info['files']:<6} listed={len(items)}/{total:<6} "
          f"{size / 1e9:.2f} GB  zipped-folder entries={len(zipped)}")
    for i in items[:2]:
        print(f"    {i['Size']:>14,} B  dir={i.get('isDirectory'):5} "
              f"{i.get('Type') or i.get('Description') or '-':<15} {i['path'][:44]}")
    if len(items) > 2:
        print(f"    … {len(items) - 2} more")
    print(f"    mirror {info['httpLink']}")
```

Printed 2026-08-19:

```
the default is 25 items — always check pagination.total
  limit=25    -> 25 of 549
  limit=1000  -> 549 of 549
  limit=2000  -> 0 of 0   <- over the cap, silently empty
  offset past the end -> 142 items, not 0   <- the last page, repeated

a nonexistent accession is 200 and an empty list, not a 404
  E-MTAB-17485       /files total=3    /info -> 3
  E-MTAB-99999999    /files total=0    /info -> LookupError
  e-mtab-17485       /files total=0    /info -> LookupError

E-MTAB-17485   info.files=3      listed=3/3      0.00 GB  zipped-folder entries=0
         2,480,580 B  dir=false Processed Data  DESeq2_DEG_analysis_filter50Reads.tsv
             6,964 B  dir=false IDF File        E-MTAB-17485.idf.txt
    … 1 more
    mirror https://ftp.ebi.ac.uk/pub/databases/biostudies/E-MTAB-/485/E-MTAB-17485
S-BIAD2193     info.files=549    listed=549/549    2.02 GB  zipped-folder entries=0
         3,690,492 B  dir=false -               img_training/mtec12/7.tif
         3,690,492 B  dir=false -               img_training/mtec12/1.tif
    … 547 more
    mirror https://ftp.ebi.ac.uk/biostudies/fire/S-BIAD/193/S-BIAD2193
S-BIAD1500     info.files=1      listed=1/1      0.00 GB  zipped-folder entries=1
           329,519 B  dir=true  -               README.zip
    mirror https://ftp.ebi.ac.uk/biostudies/fire/S-BIAD/500/S-BIAD1500
EMPIAR-13332   info.files=0      listed=0/0      0.00 GB  zipped-folder entries=0
    mirror https://ftp.ebi.ac.uk/biostudies/fire/EMPIAR-/332/EMPIAR-13332
S-BIAD4        info.files=19988  listed=19988/19988  1.78 GB  zipped-folder entries=0
         2,651,128 B  dir=false -               S-BIAD4/MappedOPT/ADM.nii
         5,828,214 B  dir=false -               S-BIAD4/MappedOPT/DRAXIN.nii
    … 19986 more
    mirror https://ftp.ebi.ac.uk/biostudies/fire/S-BIAD/S-BIAD0-99/S-BIAD4
```

- **The default page size is 25**, and the parameter is `limit`/`offset` — *not* the
  `pageSize`/`page` pair that search uses. Passing `pageSize=1000` is accepted, ignored,
  and returns 25 items with no warning. `S-BIAD2193` declares 549 files; the naive
  request returns 25 of them.
- **`limit` caps at 1000, and exceeding it returns an empty list with `total: 0`** rather
  than an error — which for a study that genuinely has no files is the same response, so
  the cap and an empty deposit are indistinguishable from the reply alone.
- **`offset` is a page index in disguise — it is floored to a multiple of `limit`.**
  `limit=1000&offset=500` on `S-BIAD2193` returns 549 items *starting at global index 0*,
  not at 500. Any window that is not page-aligned silently returns a different slice than
  you asked for, with HTTP 200. This skill's pagers always step by a full `limit`, so they
  are safe; resuming from a partial count is not.
- **An offset past the end returns the last page again, not an empty page.** `S-BIAD1069`
  declares 4,715,142 files, and `offset=4715142` answers with 142 items — the same tail
  `offset=4715000` returns. That is the flooring rule at the boundary.
  A naive `while True: ... if not page: break` pager does **not** hang here: advancing by
  `len(page)` walks off the aligned grid and it terminates after 8 extra requests, having
  appended 994 duplicate rows. The damage is silent duplication, not a hang — and the
  pathological case is the *smallest* deposits, not the largest: `S-BIAD1500` holds one
  file and that pager issues roughly a thousand requests before stopping. Terminate on
  `pagination.total`, not on an empty response, and dedupe on `path`.
- **A suppressed record answers 403 on `/studies` and `/info` while `/files` still answers
  200.** `S-BIAD1499` is one. The helpers special-case 404 only, so a 403 propagates as a
  raw `HTTPError` and kills a loop over a list of accessions instead of raising the
  `LookupError` the rest of the skill promises. Catch both.
- **`isDirectory: "true"` is a zipped folder, and it is often the whole deposit.** It
  carries a real `Size` and is usually fetchable. Sampled across 60 BioImages and S-BSST
  studies, three had such entries — `S-BIAD1500`, `S-BSST1197`, `S-BSST225` — and in each
  *every* entry was one, so a filter of `isDirectory == "false"` returns nothing at all
  for them. **Do not read that as the shape: mixed deposits exist and are common** —
  `S-BIAD617` is 65 of 67 and `S-BIAD662` is 1 of 114 — so filtering on the flag drops an
  arbitrary fraction rather than everything, which is harder to notice. Do not treat the
  flag as "skip this" in either case.
- `Size` in the listing is the declared size. Read it *before* fetching: the mouse
  companion study `E-MTAB-17510` is one 2.2 GB `.h5ad`, and `S-BSST3223` is four zips
  totalling 33 GB — neither is something to start downloading by accident.
- `path` may contain subdirectories (`img_training/mtec12/7.tif`), so percent-encode it
  and recreate the directories locally.

## Get the files

The end state is files on disk plus a manifest recording where they came from and which
release they are, because BioStudies deposits are versioned by re-release and a bare
directory of TSVs cannot be compared against a later fetch.

```python
import json, os, urllib.error, urllib.parse, urllib.request

API = "https://www.ebi.ac.uk/biostudies/api/v1"
FILES = "https://www.ebi.ac.uk/biostudies/files"     # NOT under /api/v1/
MAX_BYTES = 500_000_000            # per file; raise deliberately, not by accident


def get_json(url, timeout=120):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def study_info(accession):
    """200 with `{}` is this endpoint's answer for an accession that isn't there."""
    info = get_json(f"{API}/studies/{accession}/info")
    if "files" not in info:
        raise LookupError(f"{accession}: no such released study — /info returned {{}}")
    return info


def all_files(accession):
    """Page against the declared count. An offset past the end repeats the LAST
    page instead of returning nothing, so dedupe on path and stop on `total`."""
    total = study_info(accession)["files"]
    items, seen = [], set()
    while len(items) < total:
        page = get_json(f"{API}/studies/{accession}/files"
                        f"?limit=1000&offset={len(items)}")["items"]
        fresh = [i for i in page if i["path"] not in seen]
        if not fresh:
            break
        seen.update(i["path"] for i in fresh)
        items += fresh
    if len(items) != total:
        raise RuntimeError(f"{accession}: listed {len(items)} of {total} declared")
    return items


def attr(node, name):
    """Title sits on the envelope for some collections and in the Study section
    for others; ReleaseDate is absent from a few. Try both, expect neither."""
    return next((a.get("value") for a in node.get("attributes") or []
                 if a["name"] == name), None)


def fetch(accession, path, dest, mirror):
    """`/biostudies/files/` 404s on paths with non-ASCII characters, under every
    encoding. The FTP mirror serves the same bytes. Try it before giving up."""
    quoted = urllib.parse.quote(path)     # subdirectories and spaces both occur
    last = None
    for url in (f"{FILES}/{accession}/{quoted}", f"{mirror}/Files/{quoted}"):
        try:
            urllib.request.urlretrieve(url, dest)   # follows the 302 to the mirror
            return url
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code} on {url}"
    raise RuntimeError(f"{accession}: {path} unfetchable — {last}")


def harvest(ACC, OUT=None):
    OUT = OUT or f"Data/biostudies/{ACC}"
    os.makedirs(OUT, exist_ok=True)
    study = get_json(f"{API}/studies/{ACC}")
    info = study_info(ACC)

    manifest, skipped, failed = [], [], []
    for it in all_files(ACC):
        # NOTE there is no isDirectory filter here. `isDirectory: "true"` marks a
        # ZIPPED FOLDER holding real bytes, and on some deposits it is every entry
        # — skipping it is how a harvest returns nothing and prints success.
        if it["Size"] > MAX_BYTES:
            skipped.append(it)
            print(f"  skip {it['Size']:>15,} B  {it['path']}  (over MAX_BYTES)")
            continue
        dest = os.path.join(OUT, it["path"])
        os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
        try:
            url = fetch(ACC, it["path"], dest, info["httpLink"])
        except RuntimeError as e:
            failed.append(it["path"])
            print(f"  FAIL {it['Size']:>15,} B  {e}")
            continue
        got = os.path.getsize(dest)
        manifest.append({"path": it["path"], "url": url, "bytes": got,
                         "declared": it["Size"], "size_ok": got == it["Size"],
                         "zipped_folder": it.get("isDirectory") == "true",
                         "section": it.get("Section"), "type": it.get("Type")})
        print(f"  {'ok  ' if got == it['Size'] else 'SIZE'} {got:>15,} B  "
              f"{it.get('Type') or it.get('Description') or '-':<15} {dest}")

    meta = {"accession": ACC,
            "collection": attr(study, "AttachTo"),
            "release_date": (attr(study, "ReleaseDate")
                             or attr(study["section"], "ReleaseDate")),
            "title": attr(study, "Title") or attr(study["section"], "Title"),
            "record": f"{API}/studies/{ACC}",
            "mirror": info["httpLink"],
            "files_declared": info["files"],
            "files_downloaded": len(manifest),
            "files_skipped": [s["path"] for s in skipped],
            "files_failed": failed}
    meta["files"] = manifest
    with open(os.path.join(OUT, "manifest.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    # Every declared file is accounted for as fetched, skipped or failed. Without
    # this the summary below reads "all sizes match declared = True" on zero files.
    assert len(manifest) + len(skipped) + len(failed) == info["files"]
    return meta, manifest


for ACC in ("E-MTAB-17485", "S-BSST717", "S-BIAD1500"):
    meta, manifest = harvest(ACC)
    print(f"{ACC}: {len(manifest)} of {meta['files_declared']} declared, "
          f"{sum(m['bytes'] for m in manifest):,} B, "
          f"sizes match = {all(m['size_ok'] for m in manifest)}, "
          f"failed = {meta['files_failed']}")
    print(f"  collection {meta['collection']} · released {meta['release_date']}")
    print(f"  title  {str(meta['title'])[:66]}")
    print(f"  via    {[m['url'].split('/')[2] for m in manifest]}")
    print()
```

Run 2026-08-19, two long paths wrapped:

```
  ok         2,480,580 B  Processed Data  Data/biostudies/E-MTAB-17485/DESeq2_DEG_analysis_filter50Reads.tsv
  ok             6,964 B  IDF File        Data/biostudies/E-MTAB-17485/E-MTAB-17485.idf.txt
  ok            16,885 B  SDRF File       Data/biostudies/E-MTAB-17485/E-MTAB-17485.sdrf.txt
E-MTAB-17485: 3 of 3 declared, 2,504,429 B, sizes match = True, failed = []
  collection ArrayExpress · released 2026-08-03
  title  Age-Associated Loss of Lymphatic Vessels Promotes Cardiac Inflamma
  via    ['www.ebi.ac.uk', 'www.ebi.ac.uk', 'www.ebi.ac.uk']

  ok         1,531,202 B  Dados do experimento Data/biostudies/S-BSST717/PEREIRA,
    Ricardo Aparecido. Efeitos do tratamento do extrato metanólico de …pdf
S-BSST717: 1 of 1 declared, 1,531,202 B, sizes match = True, failed = []
  collection None · released 2014-01-01
  title  Efeitos do tratamento do extrato metanólico de Baccharis dracuncul
  via    ['ftp.ebi.ac.uk']

  FAIL         329,519 B  S-BIAD1500: README.zip unfetchable — HTTP 404 on
    https://ftp.ebi.ac.uk/biostudies/fire/S-BIAD/500/S-BIAD1500/Files/README.zip
S-BIAD1500: 0 of 1 declared, 0 B, sizes match = True, failed = ['README.zip']
  collection BioImages · released 2024-12-03
  title  Cell-autonomous timing drives the vertebrate segmentation clock’s
  via    []
```

What `E-MTAB-17485` actually exposes, in full: one 2.4 MB processed table
(`DESeq2_DEG_analysis_filter50Reads.tsv`) and the two MAGE-TAB files. That is 2.5 MB
total. The 18 GB of FASTQ is not here — see below.

Read the processed file before believing its name. Inspected 2026-08-19, that table is
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

**The two routes are not interchangeable, and the API one is the weaker.** Checked on
the smallest file of each of 13 studies, they returned identical byte counts everywhere
except `S-BSST717`, whose only file is a PDF with a Portuguese title — accents and a
comma. `https://www.ebi.ac.uk/biostudies/files/S-BSST717/…` answers **404 with a 14 KB
HTML page** under every encoding tried (`quote`, `quote_plus`, NFC, NFD, raw), while
`{httpLink}/Files/…` serves the 1,531,202 bytes correctly from NFC plus
percent-encoding. Two consequences: `urlretrieve` raises and takes the whole harvest
with it unless you catch it and fall through to the mirror, and `curl -sSL -o` without
`-f` writes that HTML page into a file named like the data. Use `curl -fsSL`.

## The MAGE-TAB pair, and where the raw reads are

Every ArrayExpress deposit carries two tab-delimited files. The **IDF** is the
investigation header — title, contacts, protocol text, publication references. The
**SDRF** is the sample and data relationship table, and it is the only place the
per-sample design exists in full. The JSON `Samples` section is a summary of it.

**Nothing about the column names is stable, and most of the collection has no runs.**
`Comment[ENA_RUN]` in one deposit is `Comment [ENA_RUN]` in the next, `Factor Value[x]`
is `FactorValue [x]`, `Characteristics[organism]` is `Characteristics [Organism]` — and
`E-GEOD-129166` uses `Comment[Sample_title]` and `Comment [ArrayExpress FTP file]` in
the same header row. Normalise before matching. Then remember that 59,378 of the 80,763
records are microarray-era: there is no run column at all, and no ENA link.

```python
import csv, json, re, urllib.parse, urllib.request

BS = "https://www.ebi.ac.uk/biostudies"
ENA = "https://www.ebi.ac.uk/ena/portal/api/filereport"


def key(c):
    """MAGE-TAB column names are NOT stable. Normalise before matching."""
    return re.sub(r"\s+", "", c).lower()


def col(row, *wanted):
    want = {key(w) for w in wanted}
    return next((c for c in row if key(c) in want), None)


def cols_like(row, prefix):
    return [c for c in row if key(c).startswith(key(prefix))]


def sdrf(acc):
    url = f"{BS}/files/{acc}/{urllib.parse.quote(acc)}.sdrf.txt"
    with urllib.request.urlopen(url, timeout=90) as r:
        return list(csv.DictReader(r.read().decode("utf-8", "replace").splitlines(),
                                   delimiter="\t"))


def ena_link(acc):
    with urllib.request.urlopen(f"{BS}/api/v1/studies/{acc}", timeout=60) as r:
        study = json.loads(r.read())
    links = []
    for item in study["section"].get("links") or []:
        links.extend(item if isinstance(item, list) else [item])
    return next((l["url"] for l in links
                 if any(a["name"] == "Type" and a["value"] == "ENA"
                        for a in l.get("attributes") or [])), None)


def ena_runs(study_acc):
    """200 with a header row and nothing under it is ENA's answer for a study with
    no runs. It is an empty result, not an error, and `rows[0]` is an IndexError."""
    fields = ("run_accession,sample_title,library_layout,read_count,"
              "fastq_ftp,fastq_bytes,fastq_md5,submitted_ftp,submitted_bytes")
    url = f"{ENA}?accession={study_acc}&result=read_run&format=tsv&fields={fields}"
    with urllib.request.urlopen(url, timeout=90) as r:
        tsv = r.read().decode()
    # ENA does not promise a row order — sort, or "the first run" moves between calls.
    return sorted(csv.DictReader(tsv.splitlines(), delimiter="\t"),
                  key=lambda x: x["run_accession"])


def reads(run):
    """`fastq_*` is empty when ENA never normalised the submission; the bytes are
    then only under `submitted_*`. int("") is a ValueError that kills the budget."""
    for f, b in (("fastq_ftp", "fastq_bytes"), ("submitted_ftp", "submitted_bytes")):
        if run.get(f) and run.get(b):
            return ([f"https://{u}" for u in run[f].split(";")],
                    [int(x) for x in run[b].split(";")], f.split("_")[0])
    return [], [], None


for ACC in ("E-MTAB-17485", "E-MTAB-17510", "E-ERAD-0", "E-GEOD-129166"):
    rows = sdrf(ACC)
    run_col = col(rows[0], "Comment[ENA_RUN]")
    org_col = col(rows[0], "Characteristics[organism]")
    factors = cols_like(rows[0], "FactorValue")
    runs = {r[run_col] for r in rows} if run_col else set()

    print(f"{ACC}  {len(rows)} SDRF rows")
    print(f"  run column     {run_col!r}")
    print(f"  organism col   {org_col!r}")
    print(f"  factor columns {[c for c in factors]}")
    print(f"  runs in SDRF   {len(runs)}"
          + ("" if run_col else "   <- array study: no sequencing runs at all"))

    study = ena_link(ACC)
    if not study:
        arr = col(rows[0], "Array Design REF")
        print(f"  no ENA link — hybridisations, not runs; array {rows[0].get(arr)}\n")
        continue

    got = ena_runs(study)
    print(f"  ENA {study:12} {len(got)} runs")
    if not got:
        print("    ENA returned an empty table for a study the record links to\n")
        continue
    missing = runs - {r["run_accession"] for r in got}
    if missing:
        print(f"    in SDRF but NOT in ENA: {sorted(missing)}")
    urls, sizes, src = reads(got[0])
    total = sum(sum(reads(r)[1]) for r in got)
    print(f"    first run {got[0]['run_accession']}  {got[0]['library_layout']}  "
          f"reads via {src}  {sum(sizes) / 1e9:.2f} GB")
    print(f"    {urls[0] if urls else '-'}")
    print(f"    {total / 1e9:.1f} GB across {len(got)} runs\n")
```

Printed 2026-08-19:

```
E-MTAB-17485  24 SDRF rows
  run column     'Comment[ENA_RUN]'
  organism col   'Characteristics[organism]'
  factor columns ['Factor Value[rna interference]']
  runs in SDRF   12
  ENA ERP203237    12 runs
    first run ERR17675096  PAIRED  reads via fastq  1.40 GB
    https://ftp.sra.ebi.ac.uk/vol1/fastq/ERR176/096/ERR17675096/ERR17675096_1.fastq.gz
    18.3 GB across 12 runs

E-MTAB-17510  55 SDRF rows
  run column     'Comment[ENA_RUN]'
  organism col   'Characteristics[organism]'
  factor columns ['Factor Value[age]']
  runs in SDRF   15
  ENA ERP203682    14 runs
    in SDRF but NOT in ENA: ['ERR17716994']
    first run ERR17716992  PAIRED  reads via submitted  0.00 GB
    https://ftp.sra.ebi.ac.uk/vol1/run/ERR177/ERR17716992/105488-007-006_S19_L003_I1_001.fastq.gz
    405.8 GB across 14 runs

E-ERAD-0  12 SDRF rows
  run column     'Comment [ENA_RUN]'
  organism col   'Characteristics[Organism]'
  factor columns ['FactorValue [phenotype]']
  runs in SDRF   6
  ENA ERP000486    0 runs
    ENA returned an empty table for a study the record links to

E-GEOD-129166  212 SDRF rows
  run column     None
  organism col   'Characteristics[organism]'
  factor columns ['Factor Value[organism part]', 'Factor Value[clinical information]', 'Factor Value[clinical history]']
  runs in SDRF   0   <- array study: no sequencing runs at all
  no ENA link — hybridisations, not runs; array A-AFFY-44
```

Five things this establishes. The first four are why the four accessions are there:
each breaks a step that works on `E-MTAB-17485`.

**BioStudies holds metadata and processed files. Raw reads are in ENA.** The record's
`section.links` entry with `Type` of `ENA` carries the study accession — `ERP203237`
here — and the ENA Portal API turns that into per-run FASTQ URLs with byte counts, read
counts and MD5s. `E-MTAB-17485` is 2.5 MB in BioStudies and 18.3 GB of FASTQ in ENA.
Budget before fetching anything — but budget from whichever of `fastq_bytes` and
`submitted_bytes` is populated.

**`fastq_*` is empty whenever ENA never normalised the submission.** Every one of the
14 runs in `ERP203682` — the mouse companion `E-MTAB-17510`, named two paragraphs down
— has empty `fastq_ftp`, `fastq_bytes` and `fastq_md5` and `read_count` of `0`. Its
405.8 GB sits under `submitted_ftp`/`submitted_bytes` in the submitter's own filenames.
`[int(b) for b in r["fastq_bytes"].split(";")]` raises `ValueError: invalid literal for
int() with base 10: ''` on it, and a study cited alongside `E-MTAB-17485` in the same
paper is where that happens.

**An ENA link in the record does not mean ENA has the runs.** `E-ERAD-0` links to
`ERP000486`; the Portal API answers HTTP 200 with a header row and no data, for
`result=read_run`, `result=analysis`, and the `search` endpoint alike. And the reverse
gap exists too: `E-MTAB-17510`'s SDRF names 15 runs, ENA returns 14, and `ERR17716994`
is in neither ENA's study listing nor its own run query. Reconcile the two lists and
say which one you are counting.

**`Comment[FASTQ_URI]` in the SDRF is not reliable.** Checked across five ArrayExpress
studies on 2026-08-17: two of five had first URIs that 404'd (`E-MTAB-17485`,
`E-MTAB-17510` — both missing the path separator after `fastq`), three resolved
(`E-MTAB-14722`, `E-MTAB-13907`, `E-MTAB-11524`), and the working ones use two different
ENA layouts (`/vol1/fastq/` for ENA-normalised reads, `/vol1/run/` for submitted
filenames). Treat the column as a hint, verify with a HEAD request, and resolve through
the ENA Portal API when it fails. The run accession itself was correct in every case.

**The SDRF has one row per data file, not per sample — but not two rows per run.**
`E-MTAB-17485` is 24 rows over 12 paired-end runs, and it is tempting to read that as
"paired-end, so double". `E-MTAB-17510` is 55 rows over 15 runs — three or four rows
each — from 10 `Source Name` values. Deduplicate on the run column; do not divide.

The `E-MTAB-17485` design read off the SDRF: 12 human dermal lymphatic endothelial cell
samples, paired-end, three arms of four (`Control`, `cMAF_OE`, `IL33_OE`) under a single
`rna interference` factor. Its companion `E-MTAB-17510` is the mouse single-cell arm of
the same study — worth stating precisely, because the paper's abstract describes human
*and* mouse work and `E-MTAB-17485` alone is human bulk RNA-seq. Human plus mouse means
both accessions.

## What this does not cover

- **Submitting data.** Deposition goes through the BioStudies submission tool and needs
  an account. This skill is read-only.
- **Embargoed studies.** A private deposit 404s on `/studies` exactly like a nonexistent
  one, so this skill cannot distinguish "no such accession" from "not released yet", and
  there is no anonymous route to an unreleased record. If a paper cites an accession that
  404s, ask the authors rather than concluding the data does not exist. What it must not
  do is ask `/files`, which answers 200 with an empty list for both cases.
- **Cross-archive resolution.** A `GSE*` that was never mirrored is not here and never
  will be; go to GEO. Proteomics goes to PRIDE and metabolomics to MetaboLights —
  neither is a BioStudies collection, and asking for them by that name returns a silent
  zero. EM is the exception that looks like the rule: `BioImages-EMPIAR` *is* a
  collection here and its 3,003 `EMPIAR-*` records resolve, but every one of them
  declares **zero files**, because it is a metadata stub and the image stacks live in
  EMPIAR proper. The `/empiar/search` path returns zero — the collection is spelled
  `BioImages-EMPIAR`.
- **Reanalysis.** What you get is what the submitter uploaded. Processed files use the
  submitter's pipeline, genome build and normalisation, none of which are harmonised
  across studies, and a study's processed table may not cover its whole design.

## Try it

Checks the response *shape*, not just reachability. Public data, no account, no key.

**Data** — ArrayExpress accession `E-MTAB-17485`, a 2026 bulk RNA-seq study of human
dermal lymphatic endothelial cells from an age-associated cardiac lymphatic project,
resolved by the BioStudies study endpoint:

    https://www.ebi.ac.uk/biostudies/api/v1/studies/E-MTAB-17485

plus `S-BIAD1500`, a BioImages deposit whose single declared file is a zipped folder:

    https://www.ebi.ac.uk/biostudies/api/v1/studies/S-BIAD1500

BioStudies records are openly available from EMBL-EBI with no account or licence
acceptance; individual submissions carry the submitter's terms, and both of these are
public. `E-MTAB-17485` is here because it exercises every structural trap at once —
nested subsection lists, a repeated attribute name, protocols as sibling sections, and
raw data held in ENA rather than here. The rest of the accessions below are here because
each one broke a technique that worked on it. Last confirmed reachable 2026-08-19.

```python
import csv, json, re, urllib.error, urllib.parse, urllib.request

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


def key(c):
    return re.sub(r"\s+", "", c).lower()


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

# --- counter-examples: every one of these broke a technique that worked on ACC ---

# 6. Title is on the ENVELOPE for a bare S-BSST deposit and in the SECTION for a
#    BioModels one. Reading only `section.attributes` writes a null title.
bsst = j(f"{API}/studies/S-BSST1")
assert attrs(bsst).get("Title"), "S-BSST1 carries Title at top level"
assert "Title" not in attrs(bsst["section"]), "S-BSST1 has no section Title"
model = j(f"{API}/studies/MODEL6614879888")
assert "Title" not in attrs(model) and attrs(model["section"])["Title"]
# ReleaseDate is not guaranteed at all.
assert "ReleaseDate" not in attrs(j(f"{API}/studies/S-SCDT-EMBOJ-2018-99599"))

# 7. /info and /files answer 200 for an accession that does not exist. Only
#    /studies 404s, so a typo reads as a released study holding no data.
for dead in ("E-MTAB-99999999", "e-mtab-17485"):
    try:
        j(f"{API}/studies/{dead}")
        raise AssertionError(f"{dead} should 404")
    except urllib.error.HTTPError as e:
        assert e.code == 404
    assert j(f"{API}/studies/{dead}/info") == {}, "/info no longer returns {}"
    assert j(f"{API}/studies/{dead}/files")["pagination"]["total"] == 0

# 8. isDirectory "true" is a ZIPPED FOLDER holding the deposit's data, not a
#    listing artefact. S-BIAD1500 declares one file and it is exactly that, so
#    `if isDirectory == "true": continue` harvests the study down to nothing.
one = j(f"{API}/studies/S-BIAD1500/files?limit=1000")
assert one["pagination"]["total"] == 1
assert one["items"][0]["isDirectory"] == "true" and one["items"][0]["Size"] > 0
assert [i for i in one["items"] if i["isDirectory"] == "false"] == []

# 9. An offset past the end repeats the LAST page. A pager that stops on an
#    empty page never stops.
big = j(f"{API}/studies/S-BIAD1069/info")["files"]
assert big > 1_000_000
assert j(f"{API}/studies/S-BIAD1069/files?limit=1000&offset={big}")["items"]

# 10. MAGE-TAB column names are not stable, and most of ArrayExpress has no runs.
def sdrf(acc):
    url = f"https://www.ebi.ac.uk/biostudies/files/{acc}/{acc}.sdrf.txt"
    with urllib.request.urlopen(url, timeout=90) as r:
        return list(csv.DictReader(r.read().decode("utf-8", "replace").splitlines(),
                                   delimiter="\t"))

erad, geod = sdrf("E-ERAD-0")[0], sdrf("E-GEOD-129166")[0]
assert "Comment[ENA_RUN]" not in erad and "Comment [ENA_RUN]" in erad
assert "FactorValue [phenotype]" in erad and "Characteristics[Organism]" in erad
assert not [c for c in geod if key(c) == key("Comment[ENA_RUN]")], "array study"
assert any(key(c) == key("Comment[ENA_RUN]") for c in sdrf(ACC)[0])

# 11. ENA's fastq_* columns are empty when the submission was never normalised;
#     the bytes are only under submitted_*. int("") kills a byte budget.
ENA = "https://www.ebi.ac.uk/ena/portal/api/filereport"
def runs(study_acc):
    url = (f"{ENA}?accession={study_acc}&result=read_run&format=tsv&fields="
           "run_accession,fastq_bytes,submitted_bytes")
    with urllib.request.urlopen(url, timeout=90) as r:
        return list(csv.DictReader(r.read().decode().splitlines(), delimiter="\t"))

mouse = runs("ERP203682")
assert mouse and all(not r["fastq_bytes"] for r in mouse), "fastq_* filled in upstream"
assert all(r["submitted_bytes"] for r in mouse)
assert runs("ERP000486") == [], "ENA: 200 and a header row is an empty result"

# 12. Collections nest. /bioimages is a strict superset of the S-BIAD deposits.
def hits(q, coll="arrayexpress"):
    got, page = [], 1
    while True:
        qs = urllib.parse.urlencode({"query": q, "pageSize": 1000, "page": page})
        d = j(f"{API}/{coll}/search?{qs}")
        if not d["hits"]:
            return d, {h["accession"] for h in got}
        got += d["hits"]
        page += 1

def total(q, coll):
    d = j(f"{API}/{coll}/search?" + urllib.parse.urlencode({"query": q, "pageSize": 1}))
    assert d["isTotalHitsExact"], q
    return d["totalHits"]

bioimages = total("*:*", "bioimages")
biad = total("accession:S-BIAD*", "bioimages")
empiar = total("*:*", "BioImages-EMPIAR")
assert 0 < biad < bioimages and empiar > biad, "EMPIAR outnumbers the S-BIAD deposits"
assert total("*:*", "JCB") == total("accession:S-JCBD*", "bioimages")

# 13. Space-separated terms are OR. Confirm AND is a strict subset.
d_or, s_or = hits("cardiac lymphatic")
d_and, s_and = hits("cardiac AND lymphatic")
d_ph, s_ph = hits('"cardiac lymphatic"')
assert s_ph <= s_and <= s_or, "phrase ⊆ AND ⊆ OR no longer holds"
assert len(s_and) < len(s_or)
assert ACC in s_and and ACC in s_ph

# 14. An unknown collection is a silent zero, never an error.
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
print("S-BSST1 title on envelope    :", attrs(bsst)["Title"][0][:44])
print("dead accession /files total  :", j(f"{API}/studies/E-MTAB-99999999/files")["pagination"]["total"],
      "with /info", j(f"{API}/studies/E-MTAB-99999999/info"))
print("S-BIAD1500 declares          :", one["pagination"]["total"], "file, isDirectory =",
      one["items"][0]["isDirectory"], f'({one["items"][0]["Size"]:,} B)')
print("S-BIAD1069 files             :", f"{big:,}", "| offset past the end returns",
      len(j(f"{API}/studies/S-BIAD1069/files?limit=1000&offset={big}")["items"]), "items")
print("E-ERAD-0 run column          : 'Comment [ENA_RUN]'  (spaced, and no bare form)")
print("E-GEOD-129166 run column     : absent — array study, no ENA link")
print("ERP203682 fastq_bytes        :", {r["fastq_bytes"] for r in mouse},
      "-> reads only under submitted_*")
print("ERP000486 runs               :", len(runs("ERP000486")), "(200, header row only)")
print()
print("bioimages scope              :", bioimages, "=", biad, "S-BIAD +", empiar,
      "EMPIAR +", total("*:*", "JCB"), "JCB + others")
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

Counter-examples, added 2026-08-19 after each of them broke a step that `E-MTAB-17485`
passes. They are assertions so the simplification cannot come back:

- **`Title` moves between the envelope and the Study section.** `S-BSST1` has it only on
  the envelope; `MODEL6614879888` only in the section; `S-SCDT-EMBOJ-2018-99599` has no
  `ReleaseDate` at all. Reading one place writes `"title": null` for a whole collection.
- **`/info` and `/files` answer 200 for an accession that does not exist** — `{}` and an
  empty list with `total: 0`. Only `/studies` 404s. A file-count pipeline reports a typo
  as a released study with no data.
- **`isDirectory: "true"` is a zipped folder holding the deposit.** `S-BIAD1500` declares
  one file and that file is one, so filtering the flag out harvests the study to nothing
  and reports success.
- **An offset past the end repeats the last page.** `S-BIAD1069` declares 4,715,142
  files and `offset=4715142` returns 142 of them. A pager that stops on an empty page
  does not stop.
- **MAGE-TAB column names are not stable and most of ArrayExpress has no runs.**
  `E-ERAD-0` spells it `Comment [ENA_RUN]`, `FactorValue [phenotype]` and
  `Characteristics[Organism]`; `E-GEOD-129166` has no run column and no ENA link.
- **ENA's `fastq_*` columns are empty when the submission was never normalised**
  (`ERP203682`), and an ENA link in the record does not mean ENA has runs (`ERP000486`
  answers 200 with a header row and nothing else).
- **Collections nest.** `/bioimages` is a strict superset of the `S-BIAD*` deposits, and
  the `EMPIAR-*` sub-collection alone outnumbers them.

Observed 2026-08-19 — these move as studies are released, so a mismatch is drift to
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

S-BSST1 title on envelope    : Longitudinal assessment of sputum microbiome
dead accession /files total  : 0 with /info {}
S-BIAD1500 declares          : 1 file, isDirectory = true (329,519 B)
S-BIAD1069 files             : 4,715,142 | offset past the end returns 142 items
E-ERAD-0 run column          : 'Comment [ENA_RUN]'  (spaced, and no bare form)
E-GEOD-129166 run column     : absent — array study, no ENA link
ERP203682 fastq_bytes        : {''} -> reads only under submitted_*
ERP000486 runs               : 0 (200, header row only)

bioimages scope              : 5007 = 1384 S-BIAD + 3003 EMPIAR + 424 JCB + others
search 'cardiac lymphatic'   : 1390 records (OR); totalHits said 1390 exact = True
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
