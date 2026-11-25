---
name: wikipathways
description: Get WikiPathways community pathways as pinned monthly GMT gene sets, GPML diagrams, SPARQL and the JSON API — Entrez-keyed joins, species filtering, revision ids, and which legacy web-service endpoints are dead.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, entrez, metabolites, enrichment]
covers: [wikipathways, pathway, pathways, gene set, gene sets, gmt, gpml, pathvisio, sparql, rdf, linked data, community curation, metabolite, metabolites, chebi, entrez, ncbi gene, ensembl, hgnc, wikidata, human, mouse, rat, yeast, zebrafish, arabidopsis, adverse outcome pathway, rare disease, lipids, signaling]
papers: [PMID:37941138]
access: [open]
datasets: [https://zenodo.org/records/24247740/files/wikipathways-20261110-gmt-Homo_sapiens.gmt, https://www.wikipathways.org/json/getCounts.json, "https://sparql.wikipathways.org/sparql?query=SELECT%20%2A%20WHERE%20%7B%3Fs%20%3Fp%20%3Fo%7D%20LIMIT%201"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-19
  against: WikiPathways release 20261110 (GMT, GPML and RDF; Zenodo 10.5281/zenodo.24247740 for the human GMT) / SPARQL endpoint serving release 20261110 / JSON API files dated 2026-11-16 / Python 3.12 standard library only / curl 8 / macOS arm64
  executed: 5
  unverified: 0
---

# WikiPathways — community pathways as files, gene sets and RDF

WikiPathways is an open, community-curated pathway database: about 2,200 pathways across 40-odd
species (1,131 human on 2026-11-19), each drawn as a diagram whose nodes carry database
identifiers. Unlike Reactome, which models reactions curated by a central team, a WikiPathways
pathway is a drawing contributed and maintained by a community (adverse outcome pathways, rare
disease, lipids, COVID-19 and others), and quality varies by pathway.

This skill gets the content out: pinned gene-set files, the diagrams, metabolites, and the live
listing. For enrichment statistics on a gene list against these gene sets, use
`pathway-enrichment`. For Reactome's own pathways and reactions, use `reactome`.

**What you need: nothing.** No key or account. Send a `User-Agent` header; the
`www.wikipathways.org` front end answers Python's default one with HTTP 403.

## Licence

From <https://www.wikipathways.org/terms.html>, checked 2026-11-19: "WikiPathways content is
covered by the Creative Commons CC0 Waiver, which states that you are free to share (copy,
distribute and transmit) and remix (adapt) the work." The Zenodo deposits of each release carry
the same `cc-zero` licence. Commercial use and redistribution need no permission; the terms page
asks for attribution as a community norm, so cite the release and the paper.

This page is original text, CC-BY-4.0, by Heureka Labs.

## Four routes, and which to use

| route | what it is | state | use it for |
|---|---|---|---|
| **Monthly release files** — `data.wikipathways.org/<YYYYMMDD>/` | GMT gene sets (Entrez), GPML diagrams, RDF dumps, per species | frozen on the 10th of each month | anything you need to reproduce: gene sets for enrichment, bulk downloads |
| **Zenodo** | the same files, with a DOI and an md5 (see **Releases** for how records are grouped) | frozen | citing a release; fetching one after it leaves the roughly 9-month window on `data.wikipathways.org` |
| **SPARQL** — `sparql.wikipathways.org/sparql` | the RDF of one release, queryable | the most recent release (20261110 on 2026-11-19) | metabolites (ChEBI), node types, interactions, ontology tags, questions the GMT cannot answer |
| **JSON API** — `www.wikipathways.org/json/*.json` | whole-database JSON files, regenerated with every edit | live (files dated 2026-11-16 on 2026-11-19) | what exists right now, pathway metadata, search across all species |

The release files and SPARQL agree with each other; the JSON files can be ahead of both. On
2026-11-19, 2 of 2,218 pathways in the JSON carried a revision date after 2026-11-10.

## What does not work

The classic MediaWiki site and its web service were retired when WikiPathways moved to a static,
GitHub-built site. The JSON page says so itself: "the Classic WikiPathways website has now been
retired and that includes the old web service." Old tutorials, Stack Overflow answers and older
client libraries still point at these. Tested on 2026-11-19:

| endpoint | what happens now |
|---|---|
| `webservice.wikipathways.org/getPathway?pwId=WP254&format=json`, `/findPathwaysByXref`, `/listPathways` and the other REST methods | **404**. The bare host returns a 200 HTML page that redirects to the JSON API docs, so a script that only checks the host looks healthy |
| `www.wikipathways.org/wpi/webservice/webservice.php/...` | **404** |
| `www.wikipathways.org/wpi/wpi.php?action=downloadFile&type=gpml&pwTitle=Pathway:WP254` | **404** |
| `www.wikipathways.org/index.php/Pathway:WP254?oldid=117018` (a specific old revision) | **403**, a Cloudflare "you have been blocked" page, even from curl. This route to old revisions is closed |
| `www.wikipathways.org/instance/WP254_r117018` (the revision-pinned link form) | **404** |
| `www.wikipathways.org/instance/WP254` and `index.php/Pathway:WP254` | **200**, but the body is a 1.6 kB HTML page with a JavaScript/meta-refresh redirect to `/pathways/WP254.html`; `curl -L` does not follow it |
| `data.wikipathways.org/current/gmt/wikipathways-current-gmt-Homo_sapiens.gmt` (a guessed stable name) | **503**. Files under `current/` keep their dated names, so the current human GMT is `current/gmt/wikipathways-20261110-gmt-Homo_sapiens.gmt` until the next release |
| any missing file on `data.wikipathways.org`, including a release that has left the window (`/20260210/gmt/…` on 2026-11-19) | usually **503** from the cache, sometimes 404 (`gpml/…-Ovis_aries.zip` gave 404, `…-Nicotiana_tabacum.zip` 503). A 503 here reads like an outage; retrying will not help. Go to Zenodo |
| any `www.wikipathways.org` URL with Python's default `User-Agent` | **403**. `data.wikipathways.org` and `sparql.wikipathways.org` accepted it |

What replaced them: the JSON files (one file per question, covering every pathway), the
per-pathway assets under
`https://www.wikipathways.org/wikipathways-assets/pathways/<WPID>/` (`<WPID>.gpml`,
`<WPID>.json`, `<WPID>.svg`, `<WPID>-datanodes.tsv`), the release files, and SPARQL.

## Releases, pinning and identifiers

- **Releases are dated, monthly, on the 10th.** The current one on 2026-11-19 is **20261110**.
  The release date is in every file name and in field 2 of every GMT name
  (`WikiPathways_20261110`). Record it with every result.
- **`data.wikipathways.org` keeps about 9 months.** Its index says 12, but on 2026-11-19 it
  listed 20260310 through 20261110 plus one 2023 snapshot, and 20260210 already answered 503.
  For anything older, and for a citable copy, use Zenodo.
- **Zenodo groups releases inconsistently, so pin a record id and look files up by name.** The
  human GMT for 20261110 is record 24247740 (<https://doi.org/10.5281/zenodo.24247740>), md5
  `97e86976bc90c0e046ff0a2d1f303c00`, byte-identical to the `data.wikipathways.org` copy. That
  record holds one file and sits under its own concept (24247739); October 2026 is likewise its
  own record and concept (23394371 under 23394370). The older human GMTs, 20250610 to 20260210,
  share concept 7718765, and one record of it (18646540) holds eight monthly files. So a concept
  DOI does not mean "latest human GMT", and a record can hold several months: cite the record
  DOI and select the file by its dated name.
- **A pathway id is `WP<n>`; a revision is `WP<n>_r<rev>`.** You will meet three revision
  notations: GPML `Version="WP254_r140926"` and SPARQL IRIs
  `https://identifiers.org/wikipathways/WP254_r140926` carry an integer for older edits but a
  timestamp for newer ones (`WP5639_r20260809204000`); the JSON API's `revision` is a date
  (`2025-10-31`). None of them is comparable across the three. Key everything on the bare
  `WP<n>` plus the release date, and strip a suffix with `id.split("_r")[0]`.
- **Gene sets in the GMT are NCBI Gene (Entrez) ids, nothing else.** No symbols, no Ensembl. The
  GMT is built by mapping every gene node, whatever database its author used, to Entrez for that
  species. WP254's diagram has 93 gene nodes citing Entrez (84 distinct ids) and 3 citing Ensembl; its
  GMT set has 88 Entrez ids, 4 of them reached only through the Ensembl nodes.
- **GMT sets contain duplicates.** 375 of 991 human sets list at least one Entrez id twice
  (a gene drawn twice). Deduplicate before computing set sizes.

## Species filtering

- **Only 18 species have a GMT file; 44 have pathways.** No GMT exists for *Escherichia coli*,
  *Mycobacterium tuberculosis*, *Oryza sativa*, *Bombyx mori* and two dozen others. For those, use
  the GPML zip (41 species) and read identifiers from the diagrams. Three species have neither:
  *Ovis aries*, *Glycine max* and *Nicotiana tabacum* (one pathway each) are in the JSON listing
  with no release file; fetch their diagrams from the per-pathway assets.
- **The GMT is not every pathway even for human.** 991 of 1,131 human pathways have a GMT line.
  138 of the 140 missing have no Entrez-mapped gene node. 132 of those have no gene, protein or
  RNA node at all (metabolite-only pathways such as WP3602 "Metabolism overview", with 118 ChEBI
  ids in SPARQL); six (WP4195, WP4485, WP4486, WP4487, WP4580, WP5274) have gene or protein nodes
  that cite only EC numbers, UniProt or Wikidata and never map to Entrez. The other two, WP2597
  and WP5151, have Entrez-mapped genes in SPARQL and are absent from the GMT with no reason given. A pathway
  missing from your enrichment output may simply not be in the file.
- **The GMT is species-filtered; the diagrams are not.** Mouse WP1 (statin pathway) contains a
  node for human CETP (Entrez 1071, a gene mice lack). The mouse GMT drops it (19 ids); SPARQL
  returns it (20). Filter on the pathway's species, never on the gene ids alone.

## Joining genes: on Entrez ids, never on labels or symbols

**Node labels are drawing text.** In 40 randomly chosen human pathways, 74 of 867 gene nodes
(8.5%) had a label that is not the gene's HGNC symbol: `SHP1` for PTPN6, `VEGFR` for KDR, `SDPR`
for CAVIN2 (a retired symbol), `FOXO` for FOXO1, `Calcineurin` for PPP3CA, `mir-200b-3p` for
MIR200B. Never derive gene membership from GPML `TextLabel` or the SVG.

**Symbols cross species.** In the SPARQL graph, a gene node whose author used an HGNC symbol is
the shared IRI `https://identifiers.org/hgnc.symbol/<SYMBOL>`, and its `wp:bdbEntrezGene` values
are the Entrez ids of every species whose gene carries that exact symbol. So for WP5434 "Cancer
pathways" (human), SPARQL returns **1,607** Entrez ids where the human GMT has **509**; the GMT is
a subset of the SPARQL set. The 1,098 extra ids, resolved in NCBI Gene: dog 404, platypus 327,
pig 315, Atlantic cod 31, zebrafish 13, *Xenopus tropicalis* 4, chicken 2, and human 2. The two
human ones are real genes the GMT leaves out: TERC (7012, through the `hgnc.symbol/TERC` node)
and LOC105369213 (through the `PLCG2` node). Mouse and rat ids are absent because their symbols
are spelled differently (`Plcg2`), which is the other half of the trap. Gene nodes are also shared across pathways, so a node's `rdfs:label` is pooled from every
pathway that draws it (Entrez 2316, FLNA, carries the label `SH2B1` from one drawing). Take gene
sets from the GMT, knowing it can drop a non-coding human gene such as TERC; use SPARQL for what
the GMT does not carry, filtering its Entrez ids to your species.

**To join your data:** map your genes to Entrez first (the `ncbi-gene` skill covers symbol and
Ensembl to Entrez), then intersect on Entrez ids within one species. Mouse symbols do not match
human sets, and a symbol match across species proves nothing.

## Get the files

**Gene sets for one species and release, as a long table.** The block downloads the pinned
human GMT from `data.wikipathways.org`, falls back to the Zenodo copy if the dated folder has left
the window, checks the md5 against the Zenodo record, and writes one row per pathway and gene (duplicates
removed) plus a provenance record. Change `SPECIES`, `RELEASE` and `ZENODO` together; the Zenodo
record id differs per species and month.

```python
import hashlib
import json
import time
import urllib.error
import urllib.request

RELEASE = "20261110"
SPECIES = "Homo_sapiens"
ZENODO = "24247740"            # Zenodo record of this species' GMT for this release
UA = {"User-Agent": "heurekaskills-wikipathways-skill"}
NAME = f"wikipathways-{RELEASE}-gmt-{SPECIES}.gmt"


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        return r.read()


try:
    raw, source = fetch(f"https://data.wikipathways.org/{RELEASE}/gmt/{NAME}"), "data.wikipathways.org"
except urllib.error.HTTPError as e:   # a missing or aged-out file answers 503, sometimes 404
    print(f"data.wikipathways.org: HTTP {e.code}; using Zenodo")
    raw, source = fetch(f"https://zenodo.org/records/{ZENODO}/files/{NAME}"), "zenodo"
rec = json.loads(fetch(f"https://zenodo.org/api/records/{ZENODO}"))
expected = next(f["checksum"] for f in rec["files"] if f["key"] == NAME)
md5 = "md5:" + hashlib.md5(raw).hexdigest()
assert md5 == expected, (md5, expected)
open(NAME, "wb").write(raw)

rows, sets = [], 0
for line in raw.decode().splitlines():
    f = line.split("\t")
    name, rel, wpid, organism = f[0].split("%")
    assert rel == f"WikiPathways_{RELEASE}" and "_r" not in wpid
    genes = sorted(set(f[2:]), key=int)              # sets can list a gene twice
    sets += 1
    rows += [(wpid, name, organism, RELEASE, g) for g in genes]

with open(f"wikipathways_{SPECIES}_{RELEASE}.tsv", "w") as fh:
    fh.write("pathway\tname\tspecies\trelease\tentrez\n")
    fh.writelines("\t".join(r) + "\n" for r in rows)
json.dump({"source": source, "file": NAME, "release": RELEASE, "species": SPECIES,
           "zenodo_doi": rec["doi"], "md5": md5, "pathways": sets, "rows": len(rows),
           "note": "GMT omits pathways with no gene nodes; ids are NCBI Gene for this species",
           "licence": "CC0 1.0", "downloaded": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
          open(f"wikipathways_{SPECIES}_{RELEASE}.provenance.json", "w"), indent=2)
print(f"{source}: {sets} pathways, {len(rows)} pathway-gene rows; md5 matches {rec['doi']}")
```

On 2026-11-19:

```
data.wikipathways.org: 991 pathways, 40285 pathway-gene rows; md5 matches 10.5281/zenodo.24247740
```

**What the newest release is, and the diagrams for a species with no GMT.** The release listing
is an HTML index; read the dated folder names from it. GPML zips hold one `.gpml` file per
pathway, with `Organism`, `Version` (the revision) and one `Xref` per node.

```bash
UA="heurekaskills-wikipathways-skill"
curl -fsS -A "$UA" https://data.wikipathways.org/ | grep -oE '>[0-9]{8}<' | tr -d '<>' | sort -r | head -3
REL=$(curl -fsS -A "$UA" https://data.wikipathways.org/ | grep -oE '>[0-9]{8}<' | tr -d '<>' | sort -r | head -1)
curl -fsS -A "$UA" "https://data.wikipathways.org/$REL/gpml/wikipathways-$REL-gpml-Escherichia_coli.zip" -o ecoli.zip
python3 - ecoli.zip <<'PY'
import sys, zipfile, xml.etree.ElementTree as ET
from collections import Counter
NS = {"g": "http://pathvisio.org/GPML/2013a"}
dbs, n = Counter(), 0
with zipfile.ZipFile(sys.argv[1]) as z:
    for name in z.namelist():
        root = ET.fromstring(z.read(name))
        n += 1
        for node in root.findall("g:DataNode", NS):
            x = node.find("g:Xref", NS)
            dbs[(node.get("Type"), x.get("Database") or "(none)")] += 1
print(f"{n} E. coli pathways; node types and identifier sources:")
for k, v in dbs.most_common(6):
    print(f"  {v:4}  {k}")
PY
```

On 2026-11-19:

```
20261110
20261010
20260910
11 E. coli pathways; node types and identifier sources:
   414  ('Protein', 'Uniprot-TrEMBL')
   116  ('Metabolite', 'HMDB')
    96  ('GeneProduct', 'Ensembl')
    47  ('Metabolite', 'ChEBI')
    28  ('GeneProduct', 'Uniprot-TrEMBL')
    25  ('Protein', '(none)')
```

Read the identifier source before joining: GPML nodes cite whatever database the author chose
(UniProt for most E. coli proteins, Ensembl for its gene products, HMDB and ChEBI for its
metabolites), and 25 E. coli protein nodes cite no database at all. The release RDF (`/<release>/rdf/`, about 63 MB zipped
for the wp and gpml layers) is the bulk route to the same content as SPARQL.

## SPARQL: metabolites and what the GMT leaves out

`https://sparql.wikipathways.org/sparql` takes `query=` by GET. Ask for CSV or JSON with an
`Accept` header; the default answer is SPARQL XML. Select pathways with `a wp:Pathway` and
`dcterms:identifier "WP254"`: the identifier also matches the unversioned IRI
`https://identifiers.org/wikipathways/WP254`, which is typed as a pathway and as a data node and
carries the labels other pathways gave it (`B. Apoptosis`, `FAS / FAS-L (Apoptosis)`). The
release the endpoint serves is in its VoID description.

```python
import csv
import io
import urllib.parse
import urllib.request

PREFIX = """PREFIX wp: <http://vocabularies.wikipathways.org/wp#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX void: <http://rdfs.org/ns/void#>
"""


def sparql(q):
    url = "https://sparql.wikipathways.org/sparql?" + urllib.parse.urlencode({"query": PREFIX + q})
    req = urllib.request.Request(url, headers={"Accept": "text/csv",
                                               "User-Agent": "heurekaskills-wikipathways-skill"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode())))


rel = sparql('SELECT ?t WHERE { ?d a void:Dataset ; dcterms:title ?t . FILTER(STRSTARTS(?t, "WikiPathways RDF 2")) }')
print("endpoint serves:", rel[0]["t"])

# metabolites (ChEBI) per pathway — absent from the GMT entirely
for r in sparql("""SELECT ?id ?title (COUNT(DISTINCT ?c) AS ?chebi) WHERE {
      VALUES ?id { "WP3602" "WP4487" "WP254" }
      ?pw a wp:Pathway ; dcterms:identifier ?id ; dc:title ?title .
      OPTIONAL { ?m a wp:Metabolite ; dcterms:isPartOf ?pw ; wp:bdbChEBI ?c . }
    } GROUP BY ?id ?title ORDER BY ?id"""):
    print(f"  {r['id']:7} {r['chebi']:>4} ChEBI  {r['title']}")

# the symbol-node trap: Entrez ids reached through gene nodes, per pathway
for wp in ("WP254", "WP5434"):
    rows = sparql(f"""SELECT DISTINCT ?pw ?e WHERE {{
          ?pw a wp:Pathway ; dcterms:identifier "{wp}" .
          ?g dcterms:isPartOf ?pw ; wp:bdbEntrezGene ?e . }}""")
    print(f"  {wp}: {rows[0]['pw'].rsplit('/', 1)[1]} -> {len({r['e'] for r in rows})} Entrez ids via SPARQL")
```

On 2026-11-19:

```
endpoint serves: WikiPathways RDF 20261110
  WP254      0 ChEBI  Apoptosis
  WP3602   118 ChEBI  Metabolism overview
  WP4487     8 ChEBI  Ophthalmate biosynthesis in hepatocytes
  WP254: WP254_r140926 -> 88 Entrez ids via SPARQL
  WP5434: WP5434_r142317 -> 1607 Entrez ids via SPARQL
```

WP254's 88 equals its GMT set. WP5434's 1,607 is its 509 GMT ids plus 1,096 ids from other
species that spell the same symbols identically and 2 human genes the GMT omits (see **Joining
genes**). For gene sets, use the GMT.

## The JSON API: what exists now

Each file under `https://www.wikipathways.org/json/` answers one question for every pathway at
once and is regenerated with each edit: `listPathways`, `getPathwayInfo` (1.2 MB),
`findPathwaysByXref` (12 MB), `findPathwaysByText`, `getOntologyTermsByPathway`,
`listCommunities`, `getCounts` and others. There is no per-pathway query; download the file and
filter it. In `findPathwaysByXref` each identifier field is one comma-separated string, and
`uniprot` groups several accessions per node with `;`. The fields are separate lists, not
columns: do not zip `ncbigene` against `hgnc` to pair a symbol with an id.

```python
import json
import urllib.request

UA = {"User-Agent": "heurekaskills-wikipathways-skill"}
get = lambda f: json.loads(urllib.request.urlopen(urllib.request.Request(
    f"https://www.wikipathways.org/json/{f}.json", headers=UA), timeout=300).read())

print("counts:", get("getCounts"))
xref = get("findPathwaysByXref")["pathwayInfo"]
hits = [p for p in xref if "ncbigene:7157" in {s.strip() for s in p["ncbigene"].split(",")}]
by_sp = {}
for p in hits:
    by_sp[p["species"]] = by_sp.get(p["species"], 0) + 1
print("pathways with Entrez 7157 (TP53):", len(hits), by_sp)
newer = [(p["id"], p["revision"]) for p in xref if p["revision"] > "2026-11-10"]
print("edited after release 20261110:", newer)
```

On 2026-11-19:

```
counts: {'organisms': '41', 'pathways': '2218', 'authors': '677', 'communities': '20'}
pathways with Entrez 7157 (TP53): 91 {'Homo sapiens': 91}
edited after release 20261110: [('WP5293', '2026-11-15'), ('WP5393', '2026-11-15')]
```

`getCounts` reports 41 organisms while the pathway listings name 44 distinct species; count from
the listing if the number matters.

## Try it

**Data.** WikiPathways release 20261110: the human GMT on Zenodo (record 24247740, CC0, no
account), the SPARQL endpoint, and the live site. Reachable on 2026-11-19.

**Run.** Self-contained; Python 3.9+ standard library only; about 20 seconds.

```python
import csv
import hashlib
import io
import json
import urllib.error
import urllib.parse
import urllib.request

UA = {"User-Agent": "heurekaskills-wikipathways-tryit"}
RELEASE, ZENODO = "20261110", "24247740"
NAME = f"wikipathways-{RELEASE}-gmt-Homo_sapiens.gmt"


def get(url, headers=UA):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=300) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""


def sparql(q):
    q = ("PREFIX wp: <http://vocabularies.wikipathways.org/wp#>\n"
         "PREFIX dcterms: <http://purl.org/dc/terms/>\nPREFIX void: <http://rdfs.org/ns/void#>\n" + q)
    code, body = get("https://sparql.wikipathways.org/sparql?" + urllib.parse.urlencode({"query": q}),
                     dict(UA, Accept="text/csv"))
    assert code == 200, code
    return list(csv.DictReader(io.StringIO(body.decode())))


# 1. the pinned GMT matches its Zenodo checksum, and every line has the documented shape
code, raw = get(f"https://zenodo.org/records/{ZENODO}/files/{NAME}")
meta = json.loads(get(f"https://zenodo.org/api/records/{ZENODO}")[1])
expected = next(f["checksum"] for f in meta["files"] if f["key"] == NAME)   # records can hold several months
assert code == 200 and "md5:" + hashlib.md5(raw).hexdigest() == expected
gmt = {}
for line in raw.decode().splitlines():
    f = line.split("\t")
    name, rel, wpid, org = f[0].split("%")
    assert rel == "WikiPathways_" + RELEASE and org == "Homo sapiens" and "_r" not in wpid
    assert all(g.isdigit() for g in f[2:])
    gmt[wpid] = set(f[2:])
dups = sum(1 for line in raw.decode().splitlines() if len(line.split("\t")[2:]) != len(set(line.split("\t")[2:])))
print("GMT              :", len(gmt), "human sets,", dups, "with a duplicated gene; md5 ok", meta["doi"])

# 2. SPARQL: which release, WP254 equal to its GMT set, WP5434 inflated by symbol nodes
served = sparql('SELECT ?t WHERE { ?d a void:Dataset ; dcterms:title ?t . '
                'FILTER(STRSTARTS(?t, "WikiPathways RDF 2")) }')[0]["t"]
def entrez(wp):
    rows = sparql(f'SELECT DISTINCT ?pw ?e WHERE {{ ?pw a wp:Pathway ; dcterms:identifier "{wp}" . '
                  f'?g dcterms:isPartOf ?pw ; wp:bdbEntrezGene ?e . }}')
    return {r["pw"].rsplit("/", 1)[1] for r in rows}, {r["e"].rsplit("/", 1)[1] for r in rows}
rev254, e254 = entrez("WP254")
rev5434, e5434 = entrez("WP5434")
assert all(r.startswith("WP254_r") for r in rev254)
assert gmt["WP5434"] <= e5434 and len(e5434) > len(gmt["WP5434"])
if served.endswith(RELEASE):
    assert e254 == gmt["WP254"]
print("SPARQL           :", served, "| WP254", rev254, len(e254), "= GMT", len(gmt["WP254"]),
      "| WP5434 SPARQL", len(e5434), "> GMT", len(gmt["WP5434"]))

# 3. metabolite-only pathways have no GMT line but do have ChEBI ids
chebi = sparql('SELECT (COUNT(DISTINCT ?c) AS ?n) WHERE { ?pw a wp:Pathway ; dcterms:identifier "WP3602" . '
               '?m a wp:Metabolite ; dcterms:isPartOf ?pw ; wp:bdbChEBI ?c . }')[0]["n"]
assert "WP3602" not in gmt and int(chebi) > 0
print("WP3602           : not in GMT;", chebi, "ChEBI ids in SPARQL")

# 4. retired endpoints stay dead; the replacements answer
dead = {u: get(u)[0] for u in (
    "https://webservice.wikipathways.org/getPathway?pwId=WP254&format=json",
    "https://www.wikipathways.org/instance/WP254_r117018")}
assert all(c == 404 for c in dead.values()), dead
code, gpml = get("https://www.wikipathways.org/wikipathways-assets/pathways/WP254/WP254.gpml")
assert code == 200 and b'Version="WP254_r' in gpml
print("legacy           :", sorted(set(dead.values())), "| GPML asset 200")

# 5. the default Python User-Agent (an observation, not an invariant)
print("default UA on www:", get("https://www.wikipathways.org/json/getCounts.json", headers={})[0])
```

**Expect**

Invariants — a failure means the skill is wrong:

- The downloaded GMT's md5 equals the checksum in Zenodo record 24247740.
- Every GMT line has a name field of four `%`-separated parts, field 2 `WikiPathways_20261110`,
  organism `Homo sapiens`, a bare `WP<n>` id with no `_r` suffix, and only numeric (Entrez) ids.
- SPARQL resolves WP254 to a `WP254_r…` revision; while it serves release 20261110, its Entrez set
  for WP254 equals the GMT set.
- WP5434's SPARQL Entrez set contains its GMT set and is strictly larger (symbol-keyed nodes pull
  in other species' ids).
- WP3602 has no GMT line and has ChEBI ids in SPARQL.
- The retired web-service method and the revision-pinned `instance/WP254_r117018` link return 404;
  the GPML asset returns 200 with a `WP254_r` version.

Observed on 2026-11-19 against release 20261110 — counts move each month, and the last line
depends on the site's edge configuration, so treat a mismatch as drift to investigate:

```
GMT              : 991 human sets, 375 with a duplicated gene; md5 ok 10.5281/zenodo.24247740
SPARQL           : WikiPathways RDF 20261110 | WP254 {'WP254_r140926'} 88 = GMT 88 | WP5434 SPARQL 1607 > GMT 509
WP3602           : not in GMT; 118 ChEBI ids in SPARQL
legacy           : [404] | GPML asset 200
default UA on www: 403
```

When the endpoint moves to a newer release, the WP254 equality check is skipped (the first field
of the SPARQL line shows which release it served); re-pin `RELEASE` and `ZENODO` to compare again.

## Sources

- WikiPathways — https://www.wikipathways.org/ ; terms and CC0 waiver —
  https://www.wikipathways.org/terms.html
- Monthly releases — https://data.wikipathways.org/ ; JSON API — https://www.wikipathways.org/json/ ;
  SPARQL — https://sparql.wikipathways.org/sparql
- Human GMT 20261110 on Zenodo — https://doi.org/10.5281/zenodo.24247740
- Agrawal et al. (2024) WikiPathways 2024: next generation pathway database. *Nucleic Acids
  Research* 52, D679–D689 — https://doi.org/10.1093/nar/gkad960
