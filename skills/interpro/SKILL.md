---
name: interpro
description: Find every protein carrying a domain family (InterPro, Pfam, SMART, PROSITE, PANTHER) or every domain on one protein, with coordinates — full pagination, 408 retries, deleted entries and InterPro2GO joins on GO ids.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, pfam, uniprot, gene-ontology, protein-domains]
covers: [interpro, pfam, pfam-a, protein domain, protein family, domain family, domain architecture, homologous superfamily, repeat, active site, conserved site, smart, prosite, panther, cath-gene3d, superfamily, cdd, ncbifam, member database, interpro2go, gene ontology, go term, protein2ipr, domain coordinates, swiss-prot, trembl, human, all organisms, protein kinase, embl-ebi]
papers: [PMID:39565202, PMID:39540428, PMID:33125078, PMID:19744993]
access: [open]
datasets: ['https://www.ebi.ac.uk/interpro/api/protein/reviewed/entry/pfam/PF00085/taxonomy/uniprot/9606/?page_size=10', https://www.ebi.ac.uk/interpro/api/entry/all/protein/uniprot/P12931/, https://ftp.ebi.ac.uk/pub/databases/interpro/releases/111.0/interpro2go]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-12
  against: InterPro 111.0 (2026-11-05) with Pfam 39.0 and UniProtKB 2026_04 / QuickGO REST / Python 3.12 standard library only / curl 8 / macOS arm64
  executed: 7
  unverified: 1
  unverified_reason: The protein2ipr stream filter reads a 13.75 GB file and this host measured 0.3 MB per second from the EBI FTP, about thirteen hours for a full pass. Format and content were checked on the first 20 MB (1.35 million lines). Re-run on a host with fast EBI FTP access and compare per-entry protein counts with the API.
---

# InterPro and Pfam — protein domain families

InterPro (EMBL-EBI) classifies protein sequences into families, domains, repeats and sites. It
does this by integrating the signatures of its **member databases** — Pfam, SMART, PROSITE,
PANTHER, CATH-Gene3D, SUPERFAMILY, CDD, NCBIfam, PRINTS, HAMAP, PIRSF, SFLD — and running them
over every UniProtKB sequence. Each InterPro entry (`IPR…`) groups the member signatures that
describe the same thing.

This skill answers two questions, and the first is the one it exists for:

- **Which proteins carry domain family X?** For example, every reviewed human protein with Pfam
  `PF00085` or InterPro `IPR013766` — the starting set for finding a domain on a protein whose
  annotated function does not account for it.
- **Which domains sit on protein Y, and where?** The reverse query, with residue coordinates.

For one protein's curated features, sequence, isoforms and accession history, use `uniprot`;
this page points there rather than repeating it. For the structure under a domain hit, use
`alphafold` or `rcsb-pdb`.

**Pfam is served from here.** The standalone Pfam website (`pfam.xfam.org`) was decommissioned
in January 2023 and its data and views moved into InterPro — the Xfam blog's announcement
(<https://xfam.wordpress.com/2022/08/04/pfam-website-decommission/>) says the legacy site would
run "until January 2023, when it will be decommissioned". Checked 2026-11-12: `http://pfam.xfam.org/`
answers `301` to `https://www.ebi.ac.uk/interpro/entry/pfam/`, and `https://pfam.xfam.org/…`
does not answer at all (connection timeout). Pfam releases still come out — Pfam 39.0 shipped
with InterPro 111.0 — and the Pfam FTP directory still carries Pfam's own HMMs, alignments and
region file (see **Get the files**). There is no separate Pfam query service; query Pfam through
the InterPro API with `pfam` as the database.

**What you need: nothing.** The API and FTP are anonymous over `https`, with no key and no
account. Every block below is Python standard library.

## Licence

The InterPro documentation's licence page
(<https://interpro-documentation.readthedocs.io/en/latest/license.html>, checked 2026-11-12):
"All of the InterPro, Pfam, PRINTS and SFLD downloadable data provided on the InterPro website is
freely available under CC0 1.0 Universal (CC0 1.0) Public Domain Dedication." Pfam's own release
notes (`Pfam/current_release/relnotes.txt`) carry the same dedication and add "You can copy,
modify, distribute and perform the work, even for commercial purposes, all without asking
permission." Commercial use is fine. Cite InterPro and the member databases you used (Sources).

That sentence names four collections. The same page notes that the signature collections bundled
with InterProScan "may be under different license terms"; that concerns redistributing a member
database's own models, not the match records this page reads. The GO terms in the InterPro2GO
join belong to the Gene Ontology, whose data "are licensed under the Creative Commons Attribution
4.0 Unported License" (<https://geneontology.org/docs/go-citation-policy/>).

This page is original text, CC-BY-4.0, by Heureka Labs.

## Which release you are reading

**Every API response carries the release in a header: `InterPro-Version: 111.0`** (plus
`InterPro-Version-Minor: 0`). The body does not. Record it with anything you save. The API root
lists every database's version, so one call pins the member databases too:

```python
import json, urllib.request

with urllib.request.urlopen("https://www.ebi.ac.uk/interpro/api/", timeout=60) as r:
    root = json.load(r)
    print("InterPro-Version header:", r.headers["InterPro-Version"])
for k in ["interpro", "pfam", "smart", "profile", "panther", "cathgene3d", "reviewed", "go"]:
    d = root["databases"][k]
    print(f"{k:10} {d['name']:22} {d['version']:12} {(d['releaseDate'] or '')[:10]}")
```

On 2026-11-12:

```
InterPro-Version header: 111.0
interpro   InterPro               111.0        2026-11-05
pfam       Pfam                   39.0         2026-10-01
smart      SMART                  9.0          2020-02-14
profile    PROSITE profiles       2026_01      2026-01-28
panther    PANTHER                19.0         2024-06-20
cathgene3d CATH-Gene3D            4.3.0        2020-10-21
reviewed   UniProtKB/Swiss-Prot   2026_04      2026-11-04
go         Gene Ontology          2026-08-28   2026-08-28
```

`/api/utils/release/` returns every past release with its date (71.0 on 2018-11-08 through
111.0). The API only ever serves the current one; to pin an analysis to a past release, use the
FTP `releases/<version>/` directories.

Pfam 39.0 is a large jump, not a routine update: InterPro 111.0's release notes record "Integration
of 18111 new methods", 18,073 of them Pfam, and Pfam-A stands at 53,275 families. Re-run a count
taken against an earlier release rather than comparing it with one taken today.

## The URL grammar

A path names the thing you want back, then filters on other types:

```
/api/{type}/{db}/{accession}/{filter-type}/{db}/{accession}/…
```

| want | path |
|---|---|
| one entry's metadata | `/api/entry/pfam/PF00085/` · `/api/entry/interpro/IPR013766/` |
| proteins carrying an entry | `/api/protein/reviewed/entry/pfam/PF00085/` |
| … in one organism | `/api/protein/reviewed/entry/pfam/PF00085/taxonomy/uniprot/9606/` |
| … in one reference proteome | `/api/protein/reviewed/entry/pfam/PF00085/proteome/uniprot/UP000005640/` |
| every entry on one protein | `/api/entry/all/protein/uniprot/P12931/` |
| only InterPro / only Pfam entries on it | `/api/entry/interpro/protein/uniprot/P12931/` · `/api/entry/pfam/protein/uniprot/P12931/` |
| list entries of a type | `/api/entry/interpro/?type=repeat` |
| Pfam families not integrated into InterPro | `/api/entry/unintegrated/pfam/` |

Protein databases are `reviewed` (Swiss-Prot), `unreviewed` (TrEMBL) and `uniprot` (both).
Entry databases are `interpro`, `all`, and the member databases by their API names: `pfam`,
`smart`, `profile` (PROSITE profiles), `prosite` (PROSITE patterns), `panther`, `cathgene3d`, `ssf`
(SUPERFAMILY), `cdd`, `ncbifam`, `prints`, `hamap`, `pirsf`, `sfld`.

## The helper

The behaviours that decide whether a result is complete — pagination, 408, 503 and the meaning of
`204` — are handled here, and every block after this imports it. Save it as `interpro_api.py`.

```python
# interpro_api.py
import json, re, time, urllib.request, urllib.error, warnings

API = "https://www.ebi.ac.uk/interpro/api"


def ipr_get(url, max_tries=8):
    """GET one InterPro API URL -> (status, parsed body or None, release)."""
    for attempt in range(max_tries):
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                body = r.read()
                return r.status, (json.loads(body) if body else None), r.headers["InterPro-Version"]
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):     # busy, e.g. 503 "Timed out waiting
                time.sleep(15 * (attempt + 1))        # for a free Elasticsearch slot"
                continue
            if e.code != 408:
                body = e.read()
                return e.code, (json.loads(body) if body else None), e.headers.get("InterPro-Version")
            # 408: the query moved to the background. The 408 is cached against this
            # exact URL, so retrying it verbatim returns the same 408 in under a second.
            # A smaller page is a different URL and a cheaper query: shrink, then wait.
            m = re.search(r"page_size=(\d+)", url)
            if m and int(m.group(1)) > 25:
                url = url.replace(m.group(0), f"page_size={int(m.group(1)) // 2}")
            else:
                time.sleep(30 * (attempt + 1))
    raise TimeoutError(f"no answer after {max_tries} tries: {url}")


def walk(url):
    """Follow `next` to the end -> (rows, release). Raises on truncation or duplicates."""
    rows, counts, releases = [], set(), set()
    while url:
        code, d, rel = ipr_get(url)
        releases.add(rel)
        if code == 204:                # empty set: ambiguous, see "204 means three things"
            return [], rel
        if code != 200:
            raise RuntimeError(f"HTTP {code} {d} for {url}")
        counts.add(d["count"])
        rows += d["results"]
        url = d["next"]                # follow it verbatim; it carries the cursor and page size
    if len(releases) != 1 or len(counts) != 1:
        raise RuntimeError(f"release or count moved mid-walk: {releases} {counts}")
    declared = counts.pop()
    keys = {r["metadata"]["accession"] for r in rows}
    if len(keys) != len(rows):
        raise RuntimeError(f"{len(rows) - len(keys)} duplicate rows across pages")
    if len(rows) < declared:
        raise RuntimeError(f"truncated: {len(rows)} rows collected, {declared} declared")
    if len(rows) > declared:           # seen on large unreviewed sets; see "count is not exact"
        warnings.warn(f"{len(rows)} unique rows collected, {declared} declared")
    return rows, releases.pop()


def entry(db, acc):
    """Metadata for one entry, or a LookupError saying which kind of missing it is."""
    code, d, rel = ipr_get(f"{API}/entry/{db}/{acc}/")
    if code == 200:
        return d["metadata"]
    if code == 410:
        raise LookupError(f"{acc} was deleted on {d['deletion_date'][:10]}; "
                          f"its signatures were {d['history']['signatures']}")
    if code == 204:
        raise LookupError(f"{acc}: no {db} entry in release {rel} -- a typo, or a "
                          "killed Pfam family (look it up in Pfam-A.dead)")
    raise RuntimeError(f"HTTP {code} {d}")
```

### Pagination: page 1 is not the answer

A list response is `{"count", "next", "previous", "results"}`. `count` is the size of the whole
set; `results` is one page; `next` is a cursor URL (`?cursor=…&page_size=…`) or `null` on the
last page. The default page is 20 rows. Reading `results` from the first response and stopping
truncates silently: `PF00069` (protein kinase domain) in reviewed human proteins is 344 proteins,
and page 1 at the default size is 20 of them. `walk()` follows `next`, and refuses to return
fewer rows than `count` or the same accession twice.

**`count` is not always exact, and it errs low.** For every set up to a few hundred rows checked
on 2026-11-12 (29, 40, 130, 261, 344, 480 proteins) the rows collected equalled `count`. For
`PF00069` in **unreviewed** human proteins, two complete walks collected 4,746 distinct
accessions, no duplicates, against a declared `count` of 4,735 — and the `uniprot` count (5,066)
is 13 short of `reviewed` (344) plus `unreviewed` (4,735). So treat fewer rows than `count` as
truncation, and more rows as the count being an estimate: `walk()` warns rather than fails, and
the rows are the answer. Do not report `count` from a `page_size=1` request as the size of a
large set.

The documentation gives 200 as the maximum `page_size`. Entry lists accept more
(`/api/entry/pfam/?page_size=500` returned 500 rows), but a large page on a protein list is what
triggers the 408 below.

### 408: the query went to the background

The FAQ (<https://interpro-documentation.readthedocs.io/en/latest/faq.html>) says a request
taking "longer than a few minutes is moved to run in the background and the API will return the
HTTP status code 408", and that the data "will eventually become available". Two things it does
not say, measured 2026-11-12:

- **It happens on modest queries.** `IPR000719` in reviewed human proteins is 480 rows, and
  `page_size=200` answered `408 {"detail":"Query timed out"}` in 5 s. The same query at
  `page_size=20`, `50`, `100` and `150` answered `200` (in 5, 8, 26 and 17 s).
- **The 408 is cached per URL.** Repeated requests for the same `page_size=200` URL came back
  `408` with a `cached: true` header in under a second, still doing so after the smaller pages
  had succeeded. Waiting and retrying the identical URL can therefore spin; halving `page_size`
  is a new URL, and the `next` links then carry the smaller size forward. `ipr_get()` does that
  first and sleeps only once the page is already small.

### 503: the service is busy

Under load the API answers `503 {"detail":"Timed out waiting for a free Elasticsearch slot"}`.
It is transient; `ipr_get()` backs off and retries it, with 429 and the other 5xx codes. It
matters because of what it does to a walk that does not check its count: on 2026-11-12 a walk of
`PF00069` in unreviewed human proteins hit a 503 after 2,400 of 4,735 rows, and a loop that
stopped on the error and kept what it had would have looked complete.

A large protein walk is slow regardless. `IPR000719` human reviewed took 185 s over five pages;
`IPR001680` (WD40 repeat, 261 proteins) took 156 s. For a whole proteome, use the bulk file.

### 204 means three things

An empty result is `204 No Content` with an empty body, never `200` with `count: 0`. Three
different situations produce it, and the protein query cannot tell them apart:

| request | status | what is true |
|---|---|---|
| `protein/reviewed/entry/pfam/PF00936/taxonomy/uniprot/9606/` | 204 | real family (bacterial microcompartment), no human proteins |
| `protein/reviewed/entry/pfam/PF99999/taxonomy/uniprot/9606/` | 204 | no such family |
| `protein/reviewed/entry/interpro/IPR001440/taxonomy/uniprot/9606/` | 204 | entry **deleted** in 2024 |
| `entry/pfam/PF0008/` | 404 | malformed accession — the only one that errors |

So **look the entry up first** with `entry()`. A deleted InterPro entry answers `410` there, with
its deletion date and the signatures it held; a killed Pfam family and a typo both answer `204`.

## Every protein carrying a domain family

```python
from interpro_api import API, walk, entry

m = entry("pfam", "PF00085")                       # raises on deleted / missing
print(m["accession"], m["type"], m["name"]["name"], "| integrated into", m["integrated"])

rows, release = walk(f"{API}/protein/reviewed/entry/pfam/PF00085/taxonomy/uniprot/9606/?page_size=200")
print(len(rows), "reviewed human proteins | InterPro", release)
for r in rows[:4]:
    md, hit = r["metadata"], r["entries"][0]
    spans = [(f["start"], f["end"]) for loc in hit["entry_protein_locations"] for f in loc["fragments"]]
    print(f"  {md['accession']}  {md['gene'] or '-':8} {md['length']:5} aa  {spans}")
```

On 2026-11-12 against 111.0:

```
PF00085 domain Thioredoxin | integrated into IPR013766
29 reviewed human proteins | InterPro 111.0
  O00391  QSOX1      747 aa  [(52, 126)]
  O14530  TXNDC9     226 aa  [(79, 162)]
  O43396  TXNL1      289 aa  [(12, 104)]
  O76003  GLRX3      335 aa  [(21, 112)]
```

### Pick the signature deliberately: member entry or InterPro entry

A member signature and the InterPro entry that integrates it are different sets, and the gap is
not small:

| query (reviewed human, 111.0) | proteins |
|---|---|
| `pfam/PF00085` Thioredoxin | 29 |
| `interpro/IPR013766` Thioredoxin domain (PF00085 + PROSITE profile PS51352) | 40 |
| `pfam/PF00069` Protein kinase domain | 344 |
| `pfam/PF07714` Protein tyrosine and serine/threonine kinase | 130 |
| `interpro/IPR000719` Protein kinase domain (PF00069 + PS50011 + SM00220) | 480 |

The eleven proteins in `IPR013766` but not `PF00085` include six peroxiredoxins, matched by the
PROSITE profile but carrying a different Pfam family. And **SRC (`P12931`) is not in `PF00069`**:
its kinase domain matches `PF07714`, which is integrated into a different InterPro entry
(`IPR001245`). A "protein kinase domain" set built from `PF00069` alone drops SRC and most
tyrosine kinases. If the question is about a domain rather than a particular model of it, query
the InterPro entry and check its `member_databases`. If you need one model's boundaries, query
the member signature.

### Reviewed and unreviewed

`reviewed` is Swiss-Prot, roughly one curated entry per human gene. `unreviewed` is TrEMBL and
is much larger: `PF00069` matches 344 reviewed human proteins, 4,735 unreviewed, and 1,428,174
unreviewed across all organisms. For "which human genes carry X", use `reviewed`; for coverage
across species, expect the 408 path and consider the bulk file.

The organism filter is by NCBI taxon, `taxonomy/uniprot/9606`. A reference proteome filter
(`proteome/uniprot/UP000005640`) gave the same 344 for `PF00069` reviewed.

## Entry types and member databases

Every entry has a `type`. InterPro 111.0 holds 72,944 entries: 38,055 domain, 29,970 family,
3,519 homologous_superfamily, 782 conserved_site, 386 repeat, 133 active_site, 82 binding_site
and 17 ptm (from `release_notes.txt`). The API spells them `domain`, `family`,
`homologous_superfamily`, `repeat`, `conserved_site`, `active_site`, `binding_site`, `ptm`;
filter a list with `?type=repeat`.

Member signatures carry a type too, and an `integrated` field naming the InterPro entry they sit
in (`null` when unintegrated). Of Pfam 39.0's 53,275 families, 47,143 are integrated and 6,132
are not — `/api/entry/integrated/pfam/` and `/api/entry/unintegrated/pfam/`. An unintegrated Pfam
family has no InterPro entry, so it has no InterPro2GO mapping and does not appear in
`protein2ipr.dat.gz`.

Inside protein results, `entry_integrated` is lower-case (`"ipr013766"`), and so are the protein
accessions inside entry results (`"p12931"`). Upper-case before comparing.

## Coordinates

Each hit is a list of **locations** (one per copy of the domain on the protein), and each
location is a list of **fragments** (`start`, `end`, 1-based inclusive, plus a `dc-status`).
Thioredoxin itself (`P10599`, 105 aa) carries `IPR013766` at 1–105: no position is ever 0, and an
end can equal the protein length.
Iterate both levels:

- **Copies.** Of the 29 human `PF00085` proteins, 19 carry one thioredoxin domain, 6 two, 3 three
  and DNAJC10 four. `IPR001680` (WD40 repeat) has 1,275 locations across 261 proteins. Count
  proteins from the rows, never from the locations.
- **Fragments.** A PRINTS fingerprint is several short motifs in one location — on SRC,
  `PR00109` is one location of five fragments. Discontinuous structural domains are split the same
  way.
- **InterPro coordinates are not member coordinates.** On QSOX1 the InterPro entry `IPR013766`
  spans 36–156 and its Pfam member `PF00085` spans 52–126. Take boundaries from the signature
  whose model you mean.

## Every domain on one protein

```python
from interpro_api import API, walk

rows, release = walk(f"{API}/entry/all/protein/uniprot/P12931/?page_size=200")
print(len(rows), "entries on P12931 | InterPro", release)
for r in sorted(rows, key=lambda r: (r["metadata"]["source_database"] != "interpro",
                                     r["metadata"]["source_database"], r["metadata"]["accession"])):
    m = r["metadata"]
    locs = r["proteins"][0]["entry_protein_locations"]
    spans = [(f["start"], f["end"]) for loc in locs for f in loc["fragments"]]
    print(f"  {m['accession']:18} {m['source_database']:10} {m['type']:22} "
          f"-> {m['integrated'] or '-':10} {spans[:3]}")
```

On 2026-11-12, SRC returned 36 entries: 11 InterPro entries (among them `IPR001452` SH3,
`IPR000980` SH2, `IPR000719` and `IPR001245` kinase), 3 Pfam (`PF00018` SH3, `PF00017` SH2,
`PF07714` kinase) and 22 signatures from eight other member databases. Titin (`Q8WZ42`) returned
47, with Pfam `PF07679` (I-set immunoglobulin) at 162 locations and `PF00041` (fibronectin type
III) at 132.

`entry/all` mixes InterPro entries and member signatures. Filter on `source_database` before
counting "domains", or use `entry/interpro/` or `entry/pfam/` in the path.

## Deleted and merged entries

The two kinds of deleted accession behave differently:

- **InterPro entries leave a tombstone.** `entry/interpro/IPR001440/` answers `410` with
  `deletion_date` (2024-02-26) and `history`, including the member signatures it held. Its Pfam
  member `PF00515` (TPR_1) now sits in `IPR019734`. Look up the member signatures in the tombstone
  to find where the family went.
- **Killed Pfam families leave nothing in the API.** `entry/pfam/PF00138/` answers `204`, the same
  as an accession that never existed. The record is in `Pfam-A.dead.gz` on the Pfam FTP (1,357
  entries in 39.0): each has a `#=GF FW` line naming the family it was forwarded to, which is
  empty when there is none. `PF00138` forwards to `PF00139`; `PF00065` was split; `PF00099` was
  removed without a successor.

An accession list older than the current release needs both checks before you query proteins
with it; the protein query will just return `204`.

## Joining domains to GO terms by id

The motivating question is "which proteins carry a domain their annotated function does not
account for". That is a join between a domain and the protein's GO annotation, and it must be
**on GO ids, with the ontology's ancestry**, never on label text.

InterPro2GO is the curated mapping from an InterPro entry to GO terms. It is in each entry's
metadata (`go_terms`, with `identifier`, `name` and aspect) and as a flat file,
`interpro2go` on the FTP (29,922 mappings in 111.0; lines read
`InterPro:IPR000182 GNAT domain > GO:acyltransferase activity, transferring groups other than amino-acyl groups ; GO:0016747`).

Why labels fail, measured on the GNAT acetyltransferase domain (`IPR000182`), which maps to
`GO:0016747` "acyltransferase activity, transferring groups other than amino-acyl groups". Of its
25 reviewed human proteins, the mapped label appears in UniProt's GO annotation text for **2**.
The other 23 carry more specific terms — "N-acetyltransferase activity" (9 proteins),
"protein-lysine-acetyltransferase activity", "histone acetyltransferase activity",
"acetyltransferase activity" — none of which contains the parent's label, though all descend from
`GO:0016747`. A label-matching detector calls all 23 unexplained, and every one is a false
positive. It is wrong in the other direction too: the 2 proteins it does call explained are the
2 whose only coverage is circular or misplaced (below).

The id join asks QuickGO (EBI's GO annotation service, no account) for annotations to the mapped
term **or any descendant**, and drops the annotations InterPro2GO itself created — otherwise
every protein trivially "explains" its own domain:

```python
import json, urllib.parse, urllib.request
from interpro_api import API, walk, entry

IPR = "IPR000182"
go_ids = [g["identifier"] for g in entry("interpro", IPR)["go_terms"] or []]
rows, release = walk(f"{API}/protein/reviewed/entry/interpro/{IPR}/taxonomy/uniprot/9606/?page_size=200")
accs = sorted(r["metadata"]["accession"] for r in rows)

ann = []
for i in range(0, len(accs), 50):
    page = 1
    while True:
        qs = urllib.parse.urlencode({
            "geneProductId": ",".join(accs[i:i + 50]), "goId": ",".join(go_ids),
            "goUsage": "descendants", "goUsageRelationships": "is_a,part_of",
            "limit": 200, "page": page})
        with urllib.request.urlopen(
                f"https://www.ebi.ac.uk/QuickGO/services/annotation/search?{qs}", timeout=120) as r:
            d = json.load(r)
        ann += d["results"]
        if page >= d["pageInfo"]["total"]:
            break
        page += 1

independent = {a["geneProductId"].split(":")[1] for a in ann if a["assignedBy"] != "InterPro"}
print(f"{IPR} -> {go_ids} | {len(accs)} reviewed human proteins | InterPro {release}")
print("explained by an annotation not made from this domain:", len(independent))
print("not explained:", sorted(set(accs) - independent))
```

On 2026-11-12:

```
IPR000182 -> ['GO:0016747'] | 25 reviewed human proteins | InterPro 111.0
explained by an annotation not made from this domain: 23
not explained: ['Q8N159', 'Q8N8M0']
```

Read the residue, do not report it. `Q8N8M0` (histidine N-acetyltransferase) carries
`GO:0016747` only as the InterPro-assigned annotation, so no independent annotation covers its
domain. `Q8N159` (NAGS) is experimentally annotated `GO:0004042`, which the current ontology
places under `GO:0016746` (acyltransferase activity) but not under `GO:0016747` — an ontology
placement, not a missing function. Both are where a person looks next.

Three more things about this join:

- **A domain with no InterPro2GO mapping cannot be tested this way.** `IPR013766` (thioredoxin)
  has none. Absence of a mapping is not absence of function.
- **Annotations assigned by `InterPro` are circular here** (`GO_REF:0000002`, evidence `IEA`).
  Other automatic pipelines (UniProt's ARBA and UniRule, `GO_REF:0000120` and similar) may also
  key on InterPro signatures. For a strict reading, keep only experimental and curator evidence
  codes.
- **Join by UniProt accession, too.** Gene symbols collide and move; the protein side of this
  join is an accession from the InterPro rows, never a name.

For GO enrichment of the resulting gene set, use `pathway-enrichment`.

## Get the files

Two routes. For one family, write the API result to disk with a manifest. For a whole-proteome
question — every domain on every human protein — use the bulk files; 20,000 reverse queries is the
wrong tool.

### One family, to TSV

```python
import json, os
from interpro_api import API, walk, entry

DB, ACC, TAX, OUT = "pfam", "PF00085", "9606", "Data/interpro"
os.makedirs(OUT, exist_ok=True)
meta = entry(DB, ACC)
url = f"{API}/protein/reviewed/entry/{DB}/{ACC}/taxonomy/uniprot/{TAX}/?page_size=200"
rows, release = walk(url)

path = os.path.join(OUT, f"{ACC}_{TAX}_reviewed.tsv")
n = 0
with open(path, "w") as fh:
    fh.write("uniprot\tgene\tlength\tentry\tcopy\tfragment\tstart\tend\tdc_status\n")
    for r in rows:
        md = r["metadata"]
        for e in r["entries"]:
            for c, loc in enumerate(e["entry_protein_locations"], 1):
                for k, f in enumerate(loc["fragments"], 1):
                    fh.write(f"{md['accession']}\t{md['gene'] or ''}\t{md['length']}\t{e['accession']}"
                             f"\t{c}\t{k}\t{f['start']}\t{f['end']}\t{f['dc-status']}\n")
                    n += 1
with open(os.path.join(OUT, f"{ACC}_{TAX}_reviewed.manifest.json"), "w") as fh:
    json.dump({"query": url, "interpro_release": release, "entry": ACC, "type": meta["type"],
               "integrated": meta["integrated"], "proteins": len(rows), "fragment_rows": n,
               "file": path}, fh, indent=2)
print(f"{len(rows)} proteins, {n} fragment rows -> {path} | InterPro {release}")
```

On 2026-11-12: `29 proteins, 44 fragment rows -> Data/interpro/PF00085_9606_reviewed.tsv | InterPro 111.0`.

### Bulk files

Use `releases/<version>/` rather than `current_release/`; the second moves under you. Sizes on
2026-11-12:

| file | size | contents |
|---|---|---|
| `interpro/releases/111.0/protein2ipr.dat.gz` | 13.75 GB | every UniProtKB protein → InterPro entry, member signature, start, end. **Integrated signatures only** |
| `interpro/releases/111.0/interpro2go` | 2.9 MB | InterPro → GO ids |
| `interpro/releases/111.0/entry.list` | 3.8 MB | accession, type, name for every InterPro entry |
| `interpro/releases/111.0/ParentChildTreeFile.txt` | 656 KB | InterPro entry hierarchy |
| `interpro/releases/111.0/match_complete.xml.gz` | 55 GB | all matches including unintegrated signatures, as XML |
| `Pfam/releases/Pfam39.0/Pfam-A.regions.tsv.gz` | 7.9 GB | every Pfam-A region, integrated or not, on pfamseq |
| `Pfam/releases/Pfam39.0/Pfam-A.hmm.gz` | 628 MB | Pfam HMMs, for scanning your own sequences with HMMER |
| `Pfam/releases/Pfam39.0/Pfam-A.dead.gz` | 30 KB | killed families and their forwards |

All under `https://ftp.ebi.ac.uk/pub/databases/`. Each large InterPro file has an `.md5` beside it.

`protein2ipr.dat.gz` has no organism column, so a proteome subset is a stream filter against an
accession list — the reviewed human list comes from `uniprot`, or as below. The file is sorted by
accession and is read once, start to end; it is never stored uncompressed.

```python
import gzip, time, urllib.request

t = time.time()
with urllib.request.urlopen("https://rest.uniprot.org/uniprotkb/stream?format=list"
                            "&query=organism_id:9606%20AND%20reviewed:true", timeout=300) as r:
    human = set(r.read().decode().split())
    uniprot_release = r.headers["X-UniProt-Release"]

URL = "https://ftp.ebi.ac.uk/pub/databases/interpro/releases/111.0/protein2ipr.dat.gz"
kept = 0
with urllib.request.urlopen(URL, timeout=600) as resp, gzip.open(resp, "rt") as fh, \
        open("human_reviewed_protein2ipr_111.0.tsv", "w") as out:
    for line in fh:                        # acc, IPR, IPR name, signature, start, end
        if line.split("\t", 1)[0] in human:
            out.write(line)
            kept += 1
print(f"{len(human)} accessions (UniProt {uniprot_release}) -> {kept} rows in {time.time() - t:.0f} s")
```

This block is the one not run end to end (see `verified`): the full 13.75 GB pass was not
completed. The first 20 MB (1,350,824 lines, 209,963 accessions) were read; every line names an
InterPro entry, and for five sampled proteins carrying an unintegrated Pfam family in the API
(`A0A010RPC1` with `PF21274`, `A0A017HQZ0` with `PF13410`, and three more) the file has their
integrated signatures and not the unintegrated one. The first lines read:

```
A0A000	IPR004839	Aminotransferase, class I/classII, large domain	PF00155	41	381
A0A000	IPR010961	Tetrapyrrole biosynthesis, 5-aminolevulinic acid synthase	TIGR01821	12	391
```

A stream cannot be checked against `protein2ipr.dat.gz.md5`. If the subset has to be
reproducible, download the file, compare its md5 with the published one, then filter the local copy.

Two version traps in the bulk route:

- **`protein2ipr` drops unintegrated signatures.** 6,132 Pfam 39.0 families are unintegrated, and
  none of their matches are in this file. For Pfam completeness use `Pfam-A.regions.tsv.gz`.
- **`Pfam-A.regions` is computed on pfamseq, not on the UniProt release the API serves.**
  `Pfam.version.gz` for 39.0 reads "Based on UniProtKB : 2026_02", while the API serves
  2026_04. Accessions created or changed in between join to nothing.

## What does not work

- **`pfam.xfam.org`.** Decommissioned; `http` redirects to the InterPro Pfam browser and `https`
  does not connect. Older code and papers that call `pfam.xfam.org/family/<acc>?output=xml` get
  nothing.
- **Retrying a 408 at the same URL.** Cached; it returns the same 408 at once. Shrink `page_size`.
- **`results` from the first page.** Twenty rows by default. Follow `next`.
- **`count: 0`.** It does not occur. Empty is `204` with no body; `json.loads` on it raises.
- **Proteins with their matches for "any Pfam".** `protein/reviewed/entry/pfam/taxonomy/uniprot/9606/`
  answers with 19,743 reviewed human proteins that have at least one Pfam match, but each row's
  `entries` is empty. Matches with coordinates come back only when the path names one entry or one
  protein.
- **The FTP `parquet/` directory.** Listed in `current_release/` and `releases/111.0/`, empty on
  2026-11-12.

## Try it

**Data** — InterPro 111.0's matches of Pfam `PF00085` (thioredoxin) in reviewed human proteins,
the domain set for SRC (`P12931`), and the GNAT domain `IPR000182` with its InterPro2GO term.
CC0, no account. Last confirmed reachable 2026-11-12. The block pages through `PF00085` ten rows at
a time so the cursor is exercised, and asserts the collected rows equal the declared count. The
other checks are the counter-examples this page warns about, asserted so nobody removes them:
the kinase domain SRC lacks in `PF00069`, the three kinds of `204`, a deleted entry's `410`, and
the label-versus-id GO join.

```python
import json, re, time, urllib.parse, urllib.request, urllib.error

API = "https://www.ebi.ac.uk/interpro/api"

def get(url, tries=8):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                b = r.read()
                return r.status, (json.loads(b) if b else None), r.headers["InterPro-Version"]
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(15 * (i + 1))
                continue
            if e.code != 408:
                b = e.read()
                return e.code, (json.loads(b) if b else None), e.headers.get("InterPro-Version")
            m = re.search(r"page_size=(\d+)", url)
            if m and int(m.group(1)) > 25:
                url = url.replace(m.group(0), f"page_size={int(m.group(1)) // 2}")
            else:
                time.sleep(30 * (i + 1))
    raise TimeoutError(url)

def walk(url):
    rows, counts, rels, pages = [], set(), set(), 0
    while url:
        code, d, rel = get(url)
        assert code == 200, (code, url)
        counts.add(d["count"]); rels.add(rel); rows += d["results"]; url = d["next"]; pages += 1
    assert len(counts) == 1 and len(rels) == 1
    return rows, counts.pop(), rels.pop(), pages

# 1. pagination: rows collected must equal the declared count
rows, count, rel, pages = walk(f"{API}/protein/reviewed/entry/pfam/PF00085/taxonomy/uniprot/9606/?page_size=10")
accs = [r["metadata"]["accession"] for r in rows]
assert len(rows) == count == len(set(accs)), (len(rows), count)
assert pages == -(-count // 10)
spans = [(r["metadata"]["length"], f["start"], f["end"]) for r in rows for e in r["entries"]
         for loc in e["entry_protein_locations"] for f in loc["fragments"]]
assert all(1 <= s <= e <= L for L, s, e in spans)
copies = max(len(e["entry_protein_locations"]) for r in rows for e in r["entries"])
assert copies > 1                                    # some proteins carry several copies
print(f"PF00085 human reviewed: {len(rows)} of {count} over {pages} pages, "
      f"{len(spans)} domain copies, max {copies} on one protein | InterPro {rel}")

# 2. member signature vs InterPro entry: SRC's kinase domain is PF07714, not PF00069
code, d, _ = get(f"{API}/entry/all/protein/uniprot/P12931/?page_size=200")
on_src = {r["metadata"]["accession"] for r in d["results"]}
assert d["next"] is None and len(d["results"]) == d["count"]
assert {"PF07714", "IPR000719", "IPR001245"} <= on_src and "PF00069" not in on_src
print(f"P12931: {d['count']} entries; PF07714 yes, PF00069 no, IPR000719 yes")

# 3. 204 means three things; deleted InterPro entries answer 410
for path in ["protein/reviewed/entry/pfam/PF00936/taxonomy/uniprot/9606/",   # real family, no human
             "protein/reviewed/entry/pfam/PF99999/taxonomy/uniprot/9606/",   # never existed
             "protein/reviewed/entry/interpro/IPR001440/taxonomy/uniprot/9606/",  # deleted
             "entry/pfam/PF00138/"]:                                        # killed Pfam family
    assert get(f"{API}/{path}")[0] == 204, path
assert get(f"{API}/entry/pfam/PF00936/")[0] == 200
code, tomb, _ = get(f"{API}/entry/interpro/IPR001440/")
assert code == 410 and tomb["history"]["signatures"]["pfam"] == {"PF00515": "TPR_1"}
print("204 x4 (empty / missing / deleted / killed); IPR001440 -> 410, deleted", tomb["deletion_date"][:10])

# 4. GO join on ids with descendants, not on label text
IPR = "IPR000182"
code, m, _ = get(f"{API}/entry/interpro/{IPR}/")
go = {g["identifier"]: g["name"] for g in m["metadata"]["go_terms"]}
grows, gcount, _, _ = walk(f"{API}/protein/reviewed/entry/interpro/{IPR}/taxonomy/uniprot/9606/?page_size=200")
gaccs = sorted(r["metadata"]["accession"] for r in grows)
assert len(gaccs) == gcount
tsv = urllib.request.urlopen("https://rest.uniprot.org/uniprotkb/search?format=tsv&size=500&fields=accession,go&query="
                             + urllib.parse.quote(" OR ".join(f"accession:{a}" for a in gaccs)), timeout=120).read().decode()
labels = dict(line.split("\t", 1) for line in tsv.splitlines()[1:])
by_label = {a for a in gaccs if any(n in labels.get(a, "") for n in go.values())}
ann, page = [], 1
while True:                                          # QuickGO pages too: 200 rows a page
    qs = urllib.parse.urlencode({"geneProductId": ",".join(gaccs), "goId": ",".join(go),
                                 "goUsage": "descendants", "goUsageRelationships": "is_a,part_of",
                                 "limit": 200, "page": page})
    d = json.load(urllib.request.urlopen(f"https://www.ebi.ac.uk/QuickGO/services/annotation/search?{qs}", timeout=120))
    ann += d["results"]
    if page >= d["pageInfo"]["total"]:
        break
    page += 1
assert len(ann) == d["numberOfHits"]
by_id = {a["geneProductId"].split(":")[1] for a in ann if a["assignedBy"] != "InterPro"}
assert len(by_id) > len(by_label)
print(f"{IPR} -> {list(go)}: {gcount} proteins; label match {len(by_label)}, "
      f"id+descendants (not InterPro-assigned) {len(by_id)}; unexplained {sorted(set(gaccs) - by_id)}")
```

**Expect**

Invariants — these hold across releases, and a failure means the skill is wrong:

- Rows collected equal `count`, accessions are unique, and the page count is `ceil(count / 10)`.
  Reading only page 1 would have returned 10. (Equality holds for a set this size; for sets in the
  thousands `count` can run low — see *Pagination* — and only fewer rows means truncation.)
- Every fragment satisfies `1 <= start <= end <= protein length`, and at least one protein carries
  more than one copy of the domain.
- SRC carries `PF07714`, `IPR000719` and `IPR001245` and not `PF00069`.
- An existing family with no human proteins, a non-existent family, a deleted InterPro entry and a
  killed Pfam family all answer `204` on the query that names them; the deleted InterPro entry
  answers `410` on the entry endpoint, with its former Pfam member in the tombstone.
- The id join explains more proteins than the label join.

Observed 2026-11-12 against InterPro 111.0 (Pfam 39.0, UniProtKB 2026_04) — these move with each
release, so a mismatch is drift to investigate:

```
PF00085 human reviewed: 29 of 29 over 3 pages, 44 domain copies, max 4 on one protein | InterPro 111.0
P12931: 36 entries; PF07714 yes, PF00069 no, IPR000719 yes
204 x4 (empty / missing / deleted / killed); IPR001440 -> 410, deleted 2024-02-26
IPR000182 -> ['GO:0016747']: 25 proteins; label match 2, id+descendants (not InterPro-assigned) 23; unexplained ['Q8N159', 'Q8N8M0']
```

It took 42–84 s from a cold directory on 2026-11-12, depending on API load.

## Sources

- InterPro — https://www.ebi.ac.uk/interpro/ · API https://www.ebi.ac.uk/interpro/api/
- InterPro documentation — https://interpro-documentation.readthedocs.io/
- FTP — https://ftp.ebi.ac.uk/pub/databases/interpro/ · https://ftp.ebi.ac.uk/pub/databases/Pfam/
- QuickGO — https://www.ebi.ac.uk/QuickGO/
- Blum M et al. (2025) InterPro: the protein sequence classification resource in 2025. *Nucleic
  Acids Research* 53, D444–D456 — https://doi.org/10.1093/nar/gkae1082 (PMID 39565202)
- Paysan-Lafosse T et al. (2025) The Pfam protein families database: embracing AI/ML. *Nucleic
  Acids Research* 53, D523–D534 — https://doi.org/10.1093/nar/gkae997 (PMID 39540428)
- Binns D et al. (2009) QuickGO: a web-based tool for Gene Ontology searching. *Bioinformatics*
  25, 3045–3046 — https://doi.org/10.1093/bioinformatics/btp536 (PMID 19744993)
