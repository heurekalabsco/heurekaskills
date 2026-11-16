---
name: europe-pmc
description: Search Europe PMC's 49 million life-science citations and 1.3 million preprints, pull open-access full text as JATS XML, text-mined annotations and citation links, past the ignored page parameter that hands back the first 25 records forever.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [europe-pmc, literature, full-text, preprints, text-mining]
covers: [europe pmc, literature, publications, papers, abstracts, full text, jats xml, open access, preprints, pmid, pmcid, doi, citations, references, cited by, text mining, named entities, gene names, diseases, organisms, chemicals, accession numbers, gene ontology, literature search, systematic review, bibliometrics, medline, pubmed central, patents, theses]
papers: [PMID:37994696, PMID:33180112, PMID:39325770, PMID:37857688]
access: [open]
datasets: ['https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID%3A37994696&format=json&resultType=core&pageSize=1', https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10767826/fullTextXML, 'https://www.ebi.ac.uk/europepmc/annotations_api/annotationsByArticleIds?articleIds=MED%3A37994696&format=JSON', https://ftp.ebi.ac.uk/pub/databases/pmc/oa/PMC13900_PMC17829.xml.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-16
  against: Europe PMC Articles RESTful API version 6.9 / Annotations API JSON / EMBL-EBI public FTP tree for PMC / Python 3.11 stdlib only / curl 8.5.0
  executed: 13
  unverified: 0
---
# Europe PMC

Europe PMC is EMBL-EBI's life-science literature database: **49,263,134 records** in total,
of which **12,509,736** carry full text in Europe PMC and **8,416,121** are in the
open-access subset. **1,288,155** are preprints. It is a superset of MEDLINE rather than a
copy of it — patents, NIH/agency-deposited manuscripts, theses, agricultural literature and
preprints all sit in the same index and answer the same query grammar.

**No account, no API key, no registration.** Every call below is plain HTTPS against
`https://www.ebi.ac.uk`, and every one of them was run against the live service to write this
page. Nothing here needs a key, a licence click-through or a GPU.

Three hosts matter, and only these:

| host | what it serves |
|---|---|
| `www.ebi.ac.uk/europepmc/webservices/rest` | search, full text, citations, references |
| `www.ebi.ac.uk/europepmc/annotations_api` | text-mined annotations — **a different base path** |
| `ftp.ebi.ac.uk/pub/databases/pmc` | bulk archives |

## The service answers 200 when you are wrong

This is the whole reason to read further. Europe PMC almost never rejects a malformed
request. It answers `200`, hands back a plausible-looking result, and leaves the mistake for
you to notice. Six measured cases, each of which produces a wrong answer silently:

| what you do | what you get | what it looks like |
|---|---|---|
| pass `page=2` | **the same 25 records as `page=1`** | a working pager |
| misspell a field — `TI:CRISPR`, `FIRST_AUTH:"Doudna J"` | `hitCount: 0` | an empty topic |
| omit `synonym` | expansion **off**; `heart attack` returns 221,347 instead of 1,763,842 | a complete search |
| fetch full text as `/MED/{pmid}/fullTextXML` | `404` | an article with no full text |
| filter `HAS_TMT:y` to find annotated articles | `hitCount: 0` registry-wide | nothing is annotated |
| add up `/profile` `pubType` counts | 431,630 for a 242,675-hit query | a breakdown |
| ask for `pageSize=1001` | `200`, and no `resultList` key at all | until your code raises |

The one request error it *does* raise, it mislabels — see **Sorting** below.

**The defence is the request echo.** Every `/search` response repeats the parameters the
service actually understood. Anything absent from that echo was discarded. Check it before
you trust a result set:

```python
import json, urllib.request

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"
url = B + "/search?query=CRISPR&format=json&pageSize=3&page=77&bogusParam=9"
with urllib.request.urlopen(url, timeout=60) as r:
    body = json.load(r)

print("echoed:", body["request"])
for sent in ("page", "bogusParam"):
    print(sent, "understood?" , sent in body["request"])
```

Observed 2026-11-16 — the echo is
`{'queryString': 'CRISPR', 'resultType': 'lite', 'cursorMark': '*', 'pageSize': 3, 'sort': '', 'synonym': False}`.
Neither `page` nor `bogusParam` appears. They were not rejected; they were dropped. The
recognised set is `query`, `resultType`, `cursorMark`, `pageSize`, `sort`, `synonym`,
`format`.

## Search

`GET /search` takes a Lucene-style query. `resultType=lite` is the default and returns 27
fields; `resultType=core` adds 27 more, including `abstractText`, `authorList`,
`meshHeadingList`, `grantsList`, `journalInfo`, `fullTextUrlList` and — the one worth knowing
about — `license`.

Useful fields, all confirmed live:

| field | example | note |
|---|---|---|
| `EXT_ID` | `EXT_ID:37994696` | the id within a source; for `SRC:MED` this is the PMID |
| `SRC` | `SRC:PPR` | `MED`, `PMC`, `PPR`, `PAT`, `AGR`, `ETH` |
| `AUTH` | `AUTH:"Doudna J"` | `AUTHOR` is an accepted alias; `FIRST_AUTH` is **not** a field |
| `TITLE` | `TITLE:CRISPR` | `TI` is **not** a field and returns zero |
| `JOURNAL` | `JOURNAL:"Nucleic acids research"` | |
| `OPEN_ACCESS` | `OPEN_ACCESS:y` | in the OA subset |
| `IN_EPMC` | `IN_EPMC:y` | full text readable in Europe PMC, OA or not |
| `CITED` | used in `sort`, not as a filter | |

An unknown field is not an error. `TITLE:CRISPR` returns 27,511 and `TI:CRISPR` returns 0,
both at `200`. If a query returns zero, suspect your field name before you conclude anything
about the literature.

### The error envelope — check `errCode` before you index `resultList`

When `/search` does reject a request, it mostly does so **inside** a `200`. The body is then
`{"errCode": …, "errMsg": …}` with **no `resultList` key**, so the obvious
`d["resultList"]["result"]` raises `KeyError` rather than reporting the error:

```python
import json, urllib.request

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"

def search(qs):
    with urllib.request.urlopen(B + "/search?" + qs, timeout=60) as r:
        status, body = r.status, json.load(r)
    if "errCode" in body:                      # check this first, always
        return status, f"ERROR {body['errCode']}: {body['errMsg']}"
    return status, f"{len(body['resultList']['result'])} rows of {body['hitCount']}"

for qs in ("query=CRISPR&format=json&pageSize=1000",
           "query=CRISPR&format=json&pageSize=1001",
           "query=&format=json"):
    print(search(qs))
```

Observed 2026-11-16:

```
(200, '1000 rows of 242675')
(200, "ERROR 404: Invalid page size provided. Valid size is between 1 and 1000")
(200, 'ERROR 404: No search criteria provided. Please provide a search criteria which is less than 1500 characters')
```

`pageSize` is valid from 1 to 1000. Note the `errCode` is `404` in both cases — it is not an
HTTP status and does not mean "not found", so do not map it onto one.

### Synonym expansion is off unless you ask

```python
import json, urllib.request, urllib.parse

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"

def hits(query, synonym):
    u = (B + "/search?format=json&pageSize=1&synonym=" + synonym
         + "&query=" + urllib.parse.quote(query))
    with urllib.request.urlopen(u, timeout=60) as r:
        d = json.load(r)
    return d["hitCount"], d["request"]["synonym"]

for syn in ("false", "true"):
    print(syn, hits("heart attack", syn))
```

Observed 2026-11-16 — `false` gives 221,347 and `true` gives 1,763,842. The default is
`false`, so a search written without the parameter is the narrow one. For a systematic review
that is the difference between a defensible search and an unreportable one, and nothing in
the response flags it. Decide deliberately and record which you used.

### Sorting — the one error that lies to you

`sort` takes `<field> <direction>` and **the direction is mandatory**. A malformed value does
not return `400`. It returns **HTTP 503 with `Search service is temporarily unavailable.
Please retry later.`** — which reads as an outage and is in fact a permanent error in your
request. Measured four times in a row, each attempt interleaved with a well-formed sort on
the same query that returned `200` in between:

| `sort` | result |
|---|---|
| `CITED desc`, `CITED asc`, `P_PDATE_D desc`, `FIRST_PDATE_D desc` | `200` |
| `CITED` (no direction) | `503` |
| `CITED descending` | `503` |
| `NONSENSE desc` | `503` |

If your client retries `5xx` with backoff, a bad sort will spin until it gives up and then
report an upstream outage. Treat a 503 from `/search` as a request error until you have
proved otherwise by re-running the same query with `sort` omitted.

### Paging — `cursorMark`, and nothing else

`page` is not a parameter. Passing it changes nothing, and the loop everyone writes first
returns the first page for as long as you let it run:

```python
import json, urllib.request

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"
Q = "query=CRISPR&format=json&pageSize=25&sort=P_PDATE_D%20asc"

seen = []
for page in (1, 2, 400, 1000, 4000):
    with urllib.request.urlopen(f"{B}/search?{Q}&page={page}", timeout=60) as r:
        seen.append([x["id"] for x in json.load(r)["resultList"]["result"]])

print("records fetched:", sum(len(p) for p in seen))
print("distinct ids   :", len(set().union(*seen)))
```

Observed 2026-11-16 — 125 records fetched, **25 distinct**. Every page is page one, including
page 4,000 of a 242,675-hit query.

The correct loop passes `cursorMark`, starting at `*`, and walks `nextCursorMark`. It
terminates when the result list comes back **empty** — not when you have collected
`hitCount` records, and not when `nextCursorMark` repeats:

```python
import json, urllib.request, urllib.parse

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"

def walk(query, want, page_size=100):
    cursor, out = "*", []
    while len(out) < want:
        u = (B + "/search?format=json&sort=P_PDATE_D%20asc"
             + f"&pageSize={page_size}"
             + "&query=" + urllib.parse.quote(query)
             + "&cursorMark=" + urllib.parse.quote(cursor))
        with urllib.request.urlopen(u, timeout=60) as r:
            d = json.load(r)
        batch = d["resultList"]["result"]
        if not batch:
            break                      # exhausted — this is the only stop condition
        out.extend(batch)
        nxt = d.get("nextCursorMark")
        if not nxt or nxt == cursor:
            break                      # defensive; not observed on a live walk
        cursor = nxt
    return out[:want], d["hitCount"]

rows, total = walk("CRISPR AND SRC:MED", want=20, page_size=5)
print(f"collected {len(rows)}, distinct {len({r['id'] for r in rows})}, hitCount {total}")
```

Observed 2026-11-16 — `collected 20, distinct 20, hitCount 221736`. On a two-hit query the
walk takes **three** requests: two that return one record each and one that returns an empty
list with `nextCursorMark` absent. A pager that stops after `hitCount` records never sees the
terminator; a pager that stops on the empty list always does.

### `/profile` — a census in one request, and one facet that does not partition

`GET /profile` returns the same query's counts broken down by `source`, `pubType` and
`subset`, for the price of a single request:

```python
import json, urllib.request, urllib.parse

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"

def hits(q):
    u = B + "/search?format=json&pageSize=1&query=" + urllib.parse.quote(q)
    with urllib.request.urlopen(u, timeout=60) as r:
        return json.load(r)["hitCount"]

with urllib.request.urlopen(B + "/profile?query=CRISPR&format=json", timeout=60) as r:
    prof = json.load(r)["profileList"]

src = {x["name"]: x["count"] for x in prof["source"]}
pub = {x["name"]: x["count"] for x in prof["pubType"]}
print("source :", src)
print("sum of sources", sum(src.values()), "vs ALL", hits("CRISPR"))
print("pubType:", pub)
print("sum of pubTypes", sum(v for k, v in pub.items() if k != "ALL"))
```

Observed 2026-11-16 — `source` reads
`MED 221736, PMC 5488, PPR 14165, AGR 953, ETH 308, PAT 25`, plus explicit zero rows for
`CBA`, `CTX`, `HIR` and `CIT`, and it sums to **exactly** 242,675, the unfiltered `hitCount`.

**`source` partitions the result set; `pubType` does not.** `pubType` reads
`ALL 242675, FULL TEXT 205335, OPEN ACCESS 167678, REVIEW 58591, BOOKS AND DOCUMENTS 26`, and
every row but `ALL` is an overlapping subset — most open-access records also have full text,
and a review can be either. Adding them gives 431,630 for a 242,675-hit query. Use them as
independent filters, never as a breakdown.

That `source` sums exactly to `hitCount` is an **invariant**, and a cheap way to confirm you
are reasoning about the whole result set rather than a slice of it. The counts themselves are
observed values and grow daily.

## Open-access full text

Full text comes back as JATS XML, and the path **takes the bare PMCID**. This is the one
place where the `{source}/{id}` convention used everywhere else in the API does not apply:

| request | result |
|---|---|
| `/PMC10767826/fullTextXML` | `200`, 87,690 bytes |
| `/MED/37994696/fullTextXML` | `404` |
| `/PMC/PMC10767826/fullTextXML` | `404` |
| `/37994696/fullTextXML` (bare PMID) | `500` |

A reader who builds the URL the same way they built the `/citations` URL gets a `404` and
concludes the article has no full text. It has full text. Resolve the PMCID from the record
first, and read the `404` as "not in the full-text subset" only once you are sure you asked
with a PMCID:

```python
import json, urllib.request, urllib.error

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"

def fulltext(pmid):
    u = B + f"/search?query=EXT_ID%3A{pmid}&format=json&resultType=core&pageSize=1"
    with urllib.request.urlopen(u, timeout=60) as r:
        rec = json.load(r)["resultList"]["result"][0]
    pmcid = rec.get("pmcid")
    if not pmcid:
        return rec, None, "no PMCID — not in PMC at all"
    try:
        with urllib.request.urlopen(B + f"/{pmcid}/fullTextXML", timeout=90) as r:
            return rec, r.read(), None
    except urllib.error.HTTPError as e:
        return rec, None, f"HTTP {e.code} for {pmcid}"

rec, xml, why = fulltext("37994696")
print(rec["pmcid"], "licence:", rec.get("license"), "isOpenAccess:", rec["isOpenAccess"])
print("bytes:", len(xml) if xml else why)
```

Observed 2026-11-16 — `PMC10767826 licence: cc by isOpenAccess: Y`, 87,690 bytes.

### `OPEN_ACCESS:y` is not a reuse licence

The open-access subset is not uniformly reusable, and `license` only exists on
`resultType=core`. Over 200 consecutive recent OA records the licences were **145 `cc by`,
38 `cc by-nc-nd`, 16 `cc by-nc`, 1 `cc by-nc-sa`** — so **27.5%** of that sample carries a
non-commercial or no-derivatives term. If you are assembling a corpus for anything beyond
personal reading, filter on `license` rather than on `OPEN_ACCESS:y`, and record the licence
next to each document. The proportions are an observed value; that the subset is mixed is not.

`IN_EPMC:y` is a third thing again: 12,509,736 records are readable in Europe PMC, against
8,416,121 in the OA subset. Readable is not redistributable.

## Text-mined annotations

The Annotations API lives at `www.ebi.ac.uk/europepmc/annotations_api`, **not** under
`/webservices/rest` — that path returns `404`. Two further things will catch you:

- **The response is a top-level JSON list**, one element per requested article. Indexing it
  as a dict raises. Ask for one article and you get a list of one.
- **The old `textMinedTerms` endpoint and the `HAS_TMT` search field are dead ends.**
  `/MED/{pmid}/textMinedTerms` returns `404` on every form tried, and `HAS_TMT:y` returns
  `hitCount: 0` across the whole index — while the per-record field `hasTextMinedTerms` still
  reads `Y` and the Annotations API returns 160 annotations for that same record. The flag is
  not a filter. Do not use it to decide whether to ask.

```python
import json, urllib.request
from collections import Counter

A = "https://www.ebi.ac.uk/europepmc/annotations_api/annotationsByArticleIds"

with urllib.request.urlopen(A + "?articleIds=MED%3A37994696&format=JSON", timeout=90) as r:
    payload = json.load(r)

print("top level is a", type(payload).__name__, "of", len(payload))
art = payload[0]                                   # a list of one, not a dict
anns = art["annotations"]
print(art["source"], art["extId"], art["pmcid"], "annotations:", len(anns))
print(Counter(a["type"] for a in anns).most_common())

ident = [t["uri"] for a in anns for t in a.get("tags", []) if t.get("uri")]
print("tags carrying a resolvable identifier:", len(ident), "of", len(anns))
print("example:", ident[0])
```

Observed 2026-11-16 — `MED 37994696 PMC10767826 annotations: 160`, typed
`Resources 155, Accession Numbers 3, Diseases 1, Organisms 1`. The *mix* is a property of the
article, not of the API — a wet-lab paper returns mostly `Organisms`, `Gene_Proteins`,
`Gene Ontology` and `Chemicals`. Do not hardcode a type list.

**Join on `tags[].uri`, never on `exact`.** Each annotation carries `prefix`, `exact` and
`postfix` — the matched surface string and its two context windows — plus `tags[]`, where
`uri` is a resolvable entity URI. The surface string is what the author typed and is ambiguous
across papers; the URI is the resolved entity.

**The URI namespace is not fixed.** On this article 159 of 160 tags resolve under
`identifiers.org` and one — a disease mention — is a UMLS concept URI under
`linkedlifedata.com`. Parse the URI, do not assume its prefix. `subType` names the
sub-namespace where there is one (`DOI`, `IntAct`, `Europe PMC`), and `provider` records who
mined it; all 160 here are `Europe PMC`.

`section` records where in the article the mention sits, as a PURL — on this article
`Article`, `Introduction`, `Table`, `Abstract` and `Figure` — so a hit in the introduction can
be weighted differently from one in a table caption.

## Citations and references

These use the `{source}/{id}` shape — the opposite of `fullTextXML`:

```python
import json, urllib.request

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"

for kind in ("citations", "references"):
    u = B + f"/MED/37994696/{kind}?format=json&pageSize=5"
    with urllib.request.urlopen(u, timeout=60) as r:
        d = json.load(r)
    print(kind, "hitCount:", d["hitCount"], "| keys:", sorted(d.keys()))

u = B + "/MED/99999999/references?format=json&pageSize=1"
with urllib.request.urlopen(u, timeout=60) as r:
    print("nonexistent PMID ->", json.load(r)["hitCount"], "hits, HTTP 200")
```

A PMID that does not exist returns `hitCount: 0` at `200`, exactly as an article with no
references does. The two are indistinguishable from the response, so check the record exists
with `EXT_ID:` before reading zero as a fact about the article. `databaseLinks` uses the same
shape and returns a body with only `version` and `request` when there are none.

## Get the files

Three routes, in increasing size. All were run to completion for this page.

**One article's full text**, as JATS XML — bare PMCID, as above:

```bash
curl -s -o PMC10767826.xml \
  "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10767826/fullTextXML"
ls -l PMC10767826.xml
head -c 120 PMC10767826.xml; echo
```

Observed 2026-11-16 — 87,690 bytes, beginning
`<?xml version="1.0" encoding="UTF-8"?><article xml:lang="en" article-type="research-article">`.

**One article's supplementary files**, as a zip. This endpoint takes the bare PMCID too, and
`404`s on `/MED/{pmid}/supplementaryFiles`:

```bash
curl -sL -o PMC13750652-suppl.zip \
  "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC13750652/supplementaryFiles"
ls -l PMC13750652-suppl.zip
python3 -c "import zipfile; print(zipfile.ZipFile('PMC13750652-suppl.zip').namelist()[:4])"
```

Observed 2026-11-16 — 9,716,724 bytes holding `.tiff` and `.xlsx` members. Supplementary
files are frequently larger than the article; check `Content-Length` before you fetch a
thousand of them.

**The whole open-access subset**, from the EBI FTP tree. It is partitioned into **1,321**
gzipped archives named by the PMCID range they cover, each holding many articles under a
single `<articles>` root:

```bash
curl -s "https://ftp.ebi.ac.uk/pub/databases/pmc/oa/" \
  | grep -oE 'PMC[0-9]+_PMC[0-9]+\.xml\.gz' | sort -u > oa-archives.txt
wc -l < oa-archives.txt

curl -s -o oa-sample.xml.gz \
  "https://ftp.ebi.ac.uk/pub/databases/pmc/oa/PMC13900_PMC17829.xml.gz"
ls -l oa-sample.xml.gz
gzip -dc oa-sample.xml.gz | grep -c '<article '
```

Observed 2026-11-16 — 1,321 archives listed; the sample is 1,194,493 bytes and holds 63
`<article>` elements. Note the plural root: parse `<articles>` and iterate its children, do
not expect a single `<article>` document as `fullTextXML` returns.

Neighbouring directories in `https://ftp.ebi.ac.uk/pub/databases/pmc/` carry the rest —
`preprints/` and `preprint_abstracts/`, `manuscripts/` for agency-deposited author
manuscripts, `pdf/`, `DOI/`, and `PMCOALiteMetadata/PMCOALiteMetadata.tgz` for metadata
without full text. There is **no per-article manifest at `oa/`** — `oa_file_list.csv` returns
`404` — so map a PMCID to its archive by the ranges in the filenames.

## Try it

**Data.** Europe PMC's own 2023 resource paper, `PMID:37994696` / `PMC10767826`, CC BY, in
the open-access subset. Public, no account. Confirmed reachable 2026-11-16. The search and
`/profile` assertions run against the live index on the query `CRISPR`.

**Run.** Self-contained; Python 3 standard library only, no files required.

```python
import json, urllib.request, urllib.error, urllib.parse
from collections import Counter

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"
A = "https://www.ebi.ac.uk/europepmc/annotations_api/annotationsByArticleIds"

def get(url, timeout=90):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.load(r)

def hits(q):
    return get(B + "/search?format=json&pageSize=1&query=" + urllib.parse.quote(q))["hitCount"]

# 1. INVARIANT — `page` is not a recognised parameter and is dropped silently.
echo = get(B + "/search?query=CRISPR&format=json&pageSize=3&page=77")["request"]
assert "page" not in echo, echo
pages = [[x["id"] for x in get(
            f"{B}/search?query=CRISPR&format=json&pageSize=25"
            f"&sort=P_PDATE_D%20asc&page={p}")["resultList"]["result"]]
         for p in (1, 2, 1000)]
assert len(set().union(*pages)) == 25, "page= unexpectedly paginated"
print(f"page trap   : {sum(len(p) for p in pages)} rows fetched, "
      f"{len(set().union(*pages))} distinct -> page= is ignored")

# 2. INVARIANT — cursorMark paginates, and the walk ends on an empty result list.
cursor, ids, reqs = "*", [], 0
while True:
    d = get(f"{B}/search?query=CRISPR%20AND%20SRC%3AMED&format=json&pageSize=5"
            f"&sort=P_PDATE_D%20asc&cursorMark={urllib.parse.quote(cursor)}")
    reqs += 1
    batch = d["resultList"]["result"]
    if not batch or len(ids) >= 20:
        break
    ids += [x["id"] for x in batch]
    cursor = d["nextCursorMark"]
assert len(ids) == len(set(ids)) == 20, (len(ids), len(set(ids)))
print(f"cursorMark  : {len(ids)} distinct ids in {reqs} requests")

# 3. INVARIANT — an unknown field name is zero hits, not an error.
assert hits("TI:CRISPR") == 0 and hits("FIRST_AUTH:\"Doudna J\"") == 0
assert hits("TITLE:CRISPR") > 0 and hits('AUTH:"Doudna J"') > 0
print("field names : TITLE/AUTH resolve, TI/FIRST_AUTH silently return 0")

# 4. INVARIANT — sources partition the result set; pubType facets do not.
per = {s: hits(f"CRISPR AND SRC:{s}")
       for s in ("MED", "PMC", "PPR", "PAT", "AGR", "ETH")}
allhits = hits("CRISPR")
assert sum(per.values()) == allhits, (per, allhits)
prof = get(B + "/profile?query=CRISPR&format=json")["profileList"]
facet = {x["name"]: x["count"] for x in prof["source"]}
assert sum(facet.values()) == allhits, (facet, allhits)
pub = {x["name"]: x["count"] for x in prof["pubType"]}
overlap = sum(v for k, v in pub.items() if k != "ALL")
assert pub["ALL"] == allhits and overlap > allhits, (pub, allhits)
print(f"sources     : SRC sum == /profile sum == ALL == {allhits}; "
      f"pubType rows sum to {overlap}, so they overlap")

# 5. INVARIANT — full text answers to the bare PMCID only.
rec = get(B + "/search?query=EXT_ID%3A37994696&format=json"
              "&resultType=core&pageSize=1")["resultList"]["result"][0]
pmcid = rec["pmcid"]
with urllib.request.urlopen(f"{B}/{pmcid}/fullTextXML", timeout=90) as r:
    xml = r.read()
assert xml.lstrip().startswith(b"<?xml") and b"<article" in xml[:200], xml[:80]
for bad in (f"/MED/{rec['pmid']}/fullTextXML", f"/PMC/{pmcid}/fullTextXML"):
    try:
        urllib.request.urlopen(B + bad, timeout=90)
        raise AssertionError(bad + " unexpectedly succeeded")
    except urllib.error.HTTPError as e:
        assert e.code == 404, (bad, e.code)
print(f"full text   : {pmcid} -> {len(xml)} bytes; "
      f"source/id form -> 404; licence {rec['license']!r}")

# 6. INVARIANT — annotations come back as a top-level list carrying resolvable URIs.
payload = get(A + "?articleIds=MED%3A37994696&format=JSON")
assert isinstance(payload, list) and len(payload) == 1, type(payload)
anns = payload[0]["annotations"]
uris = [t["uri"] for a in anns for t in a.get("tags", []) if t.get("uri")]
assert anns and len(uris) == len(anns), (len(anns), len(uris))
assert rec["hasTextMinedTerms"] == "Y" and hits("HAS_TMT:y") == 0
hosts = Counter(u.split("://")[1].split("/")[0] for u in uris)
print(f"annotations : {len(anns)} over {len(Counter(a['type'] for a in anns))} types, "
      f"every one carrying a URI across {len(hosts)} namespace(s) {sorted(hosts)}; "
      f"HAS_TMT:y matches 0 while the record flag says Y")
```

**Expect.** Every `assert` above is an invariant: a failure means this page is wrong, not that
upstream moved. The six `print` lines carry observed values, and these are what they printed
on 2026-11-16:

```
page trap   : 75 rows fetched, 25 distinct -> page= is ignored
cursorMark  : 20 distinct ids in 5 requests
field names : TITLE/AUTH resolve, TI/FIRST_AUTH silently return 0
sources     : SRC sum == /profile sum == ALL == 242675; pubType rows sum to 431630, so they overlap
full text   : PMC10767826 -> 87690 bytes; source/id form -> 404; licence 'cc by'
annotations : 160 over 4 types, every one carrying a URI across 2 namespace(s) ['identifiers.org', 'linkedlifedata.com']; HAS_TMT:y matches 0 while the record flag says Y
```

Drift to investigate, not failure: `242675`, `431630`, `160`, `4 types` and `87690` all move
as the index grows and as annotation models are re-run; a third URI namespace appearing is
drift too, not a fault. What must hold is the rest — `25 distinct` from three different
`page` values, the `404` on the `{source}/{id}` full-text form, `SRC` counts summing exactly
to `hitCount` while `pubType` rows overrun it, every annotation carrying a URI, and
`HAS_TMT:y` matching zero while the record's own flag reads `Y`.

## Limits and etiquette

No key, no quota published, and nothing here was rate-limited across roughly 120 requests
made in under twenty minutes. That is not a licence to hammer it: EMBL-EBI runs this as a
public good.

- Keep concurrency low and sequential where you can. Three of the eight datasets probed for
  this page failed under concurrency and answered immediately when retried alone.
- Prefer `resultType=lite` and a large `pageSize` (1000 is the documented ceiling and is
  accepted) over `core` for sweeps; fetch `core` only for the records you keep.
- For anything above a few thousand full-text articles, take the FTP archives instead of
  looping the API — that is what they are for.
- Cache by PMCID. Full text for a published article does not change.
- A `503` is a request error until you have ruled out `sort` (see **Sorting**).
