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
datasets: ['https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID%3A37994696&format=json&resultType=core&pageSize=1', https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10767826/fullTextXML, https://www.ebi.ac.uk/europepmc/webservices/rest/PPR1260519/fullTextXML, 'https://www.ebi.ac.uk/europepmc/annotations_api/annotationsByArticleIds?articleIds=MED%3A37994696&format=JSON', https://ftp.ebi.ac.uk/pub/databases/pmc/oa/PMC13900_PMC17829.xml.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-24
  against: Europe PMC Articles RESTful API version 6.9 / Annotations API JSON / EMBL-EBI public FTP tree for PMC / Python 3.14.6 stdlib only / curl 8.7.1
  executed: 12
  unverified: 1
  unverified_reason: the supplementaryFiles download would not complete in four attempts while the service was unstable; it needs a re-run once the endpoint is healthy
---
# Europe PMC

Europe PMC is EMBL-EBI's life-science literature database: **49,311,574 records** in total,
of which **12,543,777** carry full text in Europe PMC and **8,447,605** are in the
open-access subset. **1,295,737** are preprints. It is a superset of MEDLINE rather than a
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
you to notice. Seven measured cases, each of which produces a wrong answer silently:

| what you do | what you get | what it looks like |
|---|---|---|
| pass `page=2` | **the same 25 records as `page=1`** | a working pager |
| misspell a field — `TI:CRISPR`, `FIRST_AUTH:"Doudna J"` | `hitCount: 0` | an empty topic |
| omit `synonym` | expansion **off**; `heart attack` returns 221,755 instead of 1,767,816 | a complete search |
| fetch full text as `/MED/{pmid}/fullTextXML` | `404` | an article with no full text |
| filter `HAS_TMT:y` to find annotated articles — the field is `HAS_TM` | `hitCount: 0` registry-wide | nothing is annotated |
| give up on full text when `pmcid` is `null` | you skip a 185 kB preprint | a record without full text |
| add up `/profile` `pubType` counts | 433,690 for a 243,641-hit query | a breakdown |
| ask for `pageSize=1001` | `200`, and no `resultList` key at all | until your code raises |

The one request error it *does* raise, it mislabels — see **Sorting** below.

**The partial defence is the request echo** — partial, and it is worth being exact about
what it proves. Every `/search` response carries a `request` object holding six search
parameters as the service normalised them, under *its own* key names: what you sent as
`query` comes back as `queryString`.

```python
import json, urllib.request

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"
url = B + "/search?query=CRISPR&format=json&pageSize=3&page=77&bogusParam=9"
with urllib.request.urlopen(url, timeout=60) as r:
    body = json.load(r)

print("echoed:", body["request"])
for sent in ("query", "format", "page", "bogusParam"):
    print(f"  {sent:11s} present in echo? {sent in body['request']}")
```

Observed 2026-11-24 — the echo is
`{'queryString': 'CRISPR', 'resultType': 'lite', 'cursorMark': '*', 'pageSize': 3, 'sort': '', 'synonym': False}`,
and all four of those names report `False`.

**So absence from the echo does not mean a parameter was discarded.** `format` is absent and
plainly took effect — the body above is JSON, where the default is XML. `query` is absent
only because it is echoed under another name. The `request` object is a fixed six-key
summary of the search state, not a log of what the service understood, and it cannot tell
you whether `page` was read.

What it is genuinely good for is the five values besides the query that it *does* report,
which are exactly the ones that change a result set with no other visible sign: `synonym`
(default `False`),
`sort` (default `''`), `pageSize`, `resultType` (default `'lite'`) and `cursorMark` (reads
`'*'` when you omit it). Read those back before you trust a count.

Showing that a parameter is *ignored* takes a comparison of result sets, not a look at the
echo — which is what **Paging** below does for `page`.

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
| `HAS_TM` | `HAS_TM:y` | carries text-mined annotations; `HAS_TMT` is **not** a field |
| `CITED` | `CITED:100`, `CITED:[100 TO 200]` | a filter **and** a sort key; ranges work |

`CITED` is worth a second look because it is easy to assume it is sort-only. It filters:
`CITED:100` returns 21,431 records with exactly 100 citations and the range
`CITED:[100 TO 200]` returns 969,184. Bracketed ranges are Lucene syntax and need
URL-encoding, not quoting.

An unknown field is not an error. `TITLE:CRISPR` returns 27,574 and `TI:CRISPR` returns 0,
both at `200`. If a query returns zero, suspect your field name before you conclude anything
about the literature — and note that a plausible-looking name you half-remember is the
likeliest form of this mistake. `HAS_TMT:y` returns zero for precisely that reason, and
**Text-mined annotations** below works it through.

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

Observed 2026-11-24:

```
(200, '1000 rows of 243641')
(200, "ERROR 404: Invalid page size provided. Valid size is between 1 and 1000")
(200, 'ERROR 404: No search criteria provided. Please provide a search criteria which is less than 1500 characters.')
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

Observed 2026-11-24 — `false` gives 221,755 and `true` gives 1,767,816. The default is
`false`, so a search written without the parameter is the narrow one. For a systematic review
that is the difference between a defensible search and an unreportable one, and nothing in
the response flags it. Decide deliberately and record which you used.

### Sorting — the one error that lies to you

`sort` takes `<field> <direction>` and **the direction is mandatory**. A malformed value does
not return `400`. It returns **HTTP 503**, carrying a JSON body —
`{"errCode":503,"errMsg":"Search service is temporarily unavailable. Please retry later."}` —
which reads as an outage and is in fact a permanent error in your request. Measured four
times in a row, each attempt interleaved with a well-formed sort on the same query that
returned `200` in between:

| `sort` | result |
|---|---|
| `CITED desc`, `CITED asc`, `P_PDATE_D desc`, `FIRST_PDATE_D desc` | `200` |
| `CITED` (no direction) | `503` |
| `CITED descending` | `503` |
| `NONSENSE desc` | `503` |

**Two different 503s reach you from this host, and the status does not tell them apart —
the body does.** Europe PMC was genuinely unstable while this page was written, so both
shapes were measured side by side:

| body | `Content-Type` | what it is |
|---|---|---|
| `{"errCode":503,"errMsg":"Search service is temporarily unavailable. Please retry later."}` | `application/json` | a malformed `sort` — or a transient outage |
| `<html><head><title>503 Service Temporarily Unavailable</title>…`, 190 bytes, `nginx` in the footer | `text/html` | infrastructure; wait and retry |

The HTML one is never about your request: it never reaches the application, so no query can
provoke it and no edit to your query will clear it. Back off and retry.

The JSON one is ambiguous, and that is the part worth knowing. A bad `sort` produces it
every time, but a **well-formed** query produced it once during the outage and then
succeeded unchanged on retry — so the body alone does not prove the fault is yours.
Discriminate by re-running the identical query with `sort` omitted: still `503`, and it is
the service; `200`, and your `sort` was the problem. Do that once before you back off,
because a client that retries every `5xx` blindly will spin on a bad sort until it gives up
and then report an upstream outage that is not happening.

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

Observed 2026-11-24 — 125 records fetched, **25 distinct**. Every page is page one, including
page 4,000 of a 243,641-hit query.

The correct loop passes `cursorMark`, starting at `*`, and walks `nextCursorMark`. It has
**two** stop conditions and a correct walk needs both — neither of them is "I have collected
`hitCount` records":

```python
import json, urllib.request, urllib.parse

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"

def walk(query, want, page_size=100):
    cursor, out = "*", []
    while len(out) < want:             # `want` is a CAP the caller chose, not a terminator:
                                       # the two breaks below are what detect exhaustion
        u = (B + "/search?format=json&sort=P_PDATE_D%20asc"
             + f"&pageSize={page_size}"
             + "&query=" + urllib.parse.quote(query)
             + "&cursorMark=" + urllib.parse.quote(cursor))
        with urllib.request.urlopen(u, timeout=60) as r:
            d = json.load(r)
        batch = d["resultList"]["result"]
        if not batch:
            break                      # exhausted: an empty final page
        out.extend(batch)
        nxt = d.get("nextCursorMark")   # .get, never [...] — it is absent at the end
        if not nxt or nxt == cursor:
            break                      # exhausted: no cursor offered on a full page
        cursor = nxt
    return out[:want], d["hitCount"]

rows, total = walk("CRISPR AND SRC:MED", want=20, page_size=5)
print(f"collected {len(rows)}, distinct {len({r['id'] for r in rows})}, hitCount {total}")
```

Observed 2026-11-24 — `collected 20, distinct 20, hitCount 222870`.

**Which terminator fires depends on `pageSize`, so assume neither.** Walking the two-hit
query `EXT_ID:37994696 OR EXT_ID:33180112` to exhaustion, measured both ways (the code is
step 2 of **Try it**):

| `pageSize` | requests | how it ended |
|---|---|---|
| 1 | 3 | two pages of one record each, then an **empty** page, `nextCursorMark` absent |
| 5 | 1 | one page holding both records, `nextCursorMark` **already** absent |

The empty final page is therefore not guaranteed: when one page covers the whole result set
the service simply stops offering a cursor. So `nextCursorMark` is a key that *will* be
missing on the last response you get, whichever shape that is — read it with `.get()` and
treat its absence as the end. `d["nextCursorMark"]` raises `KeyError` exactly when the walk
succeeded. A pager that instead stops after `hitCount` records never reaches either
terminator and cannot tell a complete walk from a truncated one.

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

Observed 2026-11-24 — `source` reads
`MED 222870, PMC 5236, PPR 14249, AGR 953, ETH 308, PAT 25`, plus explicit zero rows for
`CBA`, `CTX`, `HIR` and `CIT`, and it sums to **exactly** 243,641, the unfiltered `hitCount`.

**`source` partitions the result set; `pubType` does not.** `pubType` reads
`ALL 243641, FULL TEXT 206220, OPEN ACCESS 168499, REVIEW 58945, BOOKS AND DOCUMENTS 26`, and
every row but `ALL` is an overlapping subset — most open-access records also have full text,
and a review can be either. Adding them gives 433,690 for a 243,641-hit query. Use them as
independent filters, never as a breakdown.

That `source` sums exactly to `hitCount` is an **invariant**, and a cheap way to confirm you
are reasoning about the whole result set rather than a slice of it. The counts themselves are
observed values and grow daily.

## Full text

Full text comes back as JATS XML from a **single bare accession** — no `{source}/{id}`
prefix, which is the reverse of `/citations` and `/references` below. The accession is the
PMCID for anything in PMC, and the record's own `id` for a preprint:

| request | result |
|---|---|
| `/PMC10767826/fullTextXML` | `200`, 87,690 bytes |
| `/PPR1260519/fullTextXML` — a preprint whose `pmcid` is `null` | `200`, 185,484 bytes |
| `/MED/37994696/fullTextXML` | `404` |
| `/PMC/PMC10767826/fullTextXML` | `404` |
| `/PPR/PPR1260519/fullTextXML` | `404` |
| `/37994696/fullTextXML` — bare PMID | `500` |
| `/PPR803623/fullTextXML` — a preprint with `inEPMC: N` | `500` |

**"No PMCID" is not "no full text", and this is the expensive version of the mistake.**
`PPR1260519` carries 185,484 bytes of JATS under its own `PPR…` id while its `pmcid` reads
`null` and `inEPMC` reads `Y`. Code that gives up as soon as `pmcid` is missing reports an
absence over an article that is sitting right there — and it reports it for the whole
preprint corpus, 1,295,737 records, which is the part of the index you are least likely to
have another copy of. Resolve the accession from `pmcid` **or** from `id` when `source` is
`PPR`.

**The two failure codes split on path shape, not on availability.** A `404` means the *path*
was wrong — an extra `{source}/` segment the route will not accept — and every `404` above is
a record that does have full text. A `500` means the single segment you gave it is not an
accession it can serve, and that covers two different mistakes at once: a bare PMID
(`/37994696/…`, the wrong kind of id for a record whose full text lives under a PMCID) and a
real preprint accession with no full text behind it (`/PPR803623/…`, `inEPMC: N`).

So neither code tells you on its own whether an article has full text. **`inEPMC` does** —
read it from the record before you fetch, and you never have to interpret either one: a
`404` is then a bug in your URL and a `500` is a record you should not have asked for.
Neither is a server fault worth retrying. The `biorxiv` skill covers this same route from
the preprint side, including the per-preprint licences that decide what you may do with the
text.

```python
import json, urllib.request, urllib.error

B = "https://www.ebi.ac.uk/europepmc/webservices/rest"

def fulltext(ext_id):
    u = B + f"/search?query=EXT_ID%3A{ext_id}&format=json&resultType=core&pageSize=1"
    with urllib.request.urlopen(u, timeout=60) as r:
        hits = json.load(r)["resultList"]["result"]
    if not hits:
        return None, None, "no such record"
    rec = hits[0]
    if rec.get("inEPMC") != "Y":            # ask this before spending a request
        return rec, None, f"inEPMC={rec.get('inEPMC')} — no full text here"
    # the accession this route accepts: the PMCID in PMC, the PPR id for a preprint
    acc = rec.get("pmcid") or (rec["id"] if rec.get("source") == "PPR" else None)
    if not acc:
        return rec, None, f"in EPMC but no accession this route accepts ({rec['id']})"
    try:
        with urllib.request.urlopen(B + f"/{acc}/fullTextXML", timeout=90) as r:
            return rec, r.read(), None
    except urllib.error.HTTPError as e:
        why = "not held in Europe PMC" if e.code == 500 else "wrong URL shape"
        return rec, None, f"HTTP {e.code} for {acc} — {why}"

for ext in ("37994696", "PPR1260519", "PPR803623"):
    rec, xml, why = fulltext(ext)
    print(f"{ext:11s} pmcid={str(rec.get('pmcid')):12s} inEPMC={rec.get('inEPMC')} "
          f"licence={str(rec.get('license')):9s} -> {len(xml) if xml else why}")
```

Observed 2026-11-24:

```
37994696    pmcid=PMC10767826  inEPMC=Y licence=cc by     -> 87690
PPR1260519  pmcid=None         inEPMC=Y licence=cc by     -> 185484
PPR803623   pmcid=None         inEPMC=N licence=None      -> inEPMC=N — no full text here
```

The middle row is the one a `pmcid`-only helper loses, and the third is why the `inEPMC` test
comes first: it declines without spending a request, instead of fetching a `500` and then
having to work out which kind of `500` it was.

### `OPEN_ACCESS:y` is not a reuse licence

The open-access subset is not uniformly reusable, and `license` only exists on
`resultType=core`. Over 200 consecutive recent OA records the licences were **134 `cc by`,
46 `cc by-nc-nd`, 19 `cc by-nc`, 1 `cc by-nc-sa`** — so **33.0%** of that sample carries a
non-commercial or no-derivatives term. If you are assembling a corpus for anything beyond
personal reading, filter on `license` rather than on `OPEN_ACCESS:y`, and record the licence
next to each document. The proportions are an observed value; that the subset is mixed is not.

`IN_EPMC:y` is a third thing again: 12,543,777 records are readable in Europe PMC, against
8,447,605 in the OA subset. Readable is not redistributable.

The `pubmed` skill covers the same articles from the NCBI side, where PMC states its own
licence and text-mining terms; a corpus assembled for reuse is worth checking against both.

## Text-mined annotations

The Annotations API lives at `www.ebi.ac.uk/europepmc/annotations_api`, **not** under
`/webservices/rest` — that path returns `404`. Two further things will catch you, and a third
is worth knowing before you loop this per article:

- **The response is a top-level JSON list**, one element per requested article. Indexing it
  as a dict raises. Ask for one article and you get a list of one.
- **The old `textMinedTerms` REST endpoint is a dead end. The search filter is not — it is
  spelled `HAS_TM`.** `/MED/{pmid}/textMinedTerms` returns `404` on every form tried, and
  that one really is gone. `HAS_TMT:y` returning `hitCount: 0` is a different thing wearing
  the same costume: `HAS_TMT` is not a field, so this is the unknown-field trap at the top
  of this page, and the zero says nothing about the index. Drop the stray `T` and the filter
  works — `HAS_TM:y` matches **38,046,363** records, and `EXT_ID:37994696 AND HAS_TM:y`
  matches 1, the same record whose `hasTextMinedTerms` reads `Y` and for which the
  Annotations API returns 160 annotations. Use `HAS_TM:y` to decide whether to ask; the
  per-record `hasTextMinedTerms` field agrees with it.
- Bulk text-mined links are on the FTP tree under `TextMinedTerms/`, one CSV per linked
  resource (`alphafold.csv`, `arrayexpress.csv`, `bioproject.csv`, …), which is the route to
  take for accession mining across the whole corpus rather than per article.

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

Observed 2026-11-24 — `MED 37994696 PMC10767826 annotations: 160`, typed
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
sub-namespace where there is one and is `null` on all 160 tags here, so treat it as optional
rather than as a discriminator; `provider` records who mined it, and all 160 here are
`Europe PMC`.

`section` records where in the article the mention sits, as a PURL — on this article
`Abstract`, `Acknowledgments`, `Article`, `Figure`, `Introduction`, `References`, `Table` and
`Title` — so a hit in the introduction can be weighted differently from one in a table
caption, and mentions landing in `References` can be dropped, since those are other people's
titles rather than this article's claims.

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

Three routes, in increasing size. The first and third were run to completion for this page;
the second would not complete and is written up as the unreliable route it turned out to be.

**One article's full text**, as JATS XML — a bare accession, as under **Full text** above
(the PMCID here; a preprint's own `PPR…` id works the same way):

```bash
curl -s -o PMC10767826.xml \
  "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10767826/fullTextXML"
ls -l PMC10767826.xml
head -c 120 PMC10767826.xml; echo
```

Observed 2026-11-24 — 87,690 bytes, beginning
`<?xml version="1.0" encoding="UTF-8"?><article xml:lang="en" article-type="research-article">`.

**One article's supplementary files**, as a zip. This endpoint takes the bare PMCID too, and
`404`s on `/MED/{pmid}/supplementaryFiles`:

```bash
curl -sL -o PMC13750652-suppl.zip \
  "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC13750652/supplementaryFiles"
ls -l PMC13750652-suppl.zip
python3 -I -c "import zipfile; print(zipfile.ZipFile('PMC13750652-suppl.zip').namelist()[:4])"
```

Observed 2026-11-16 — 9,716,724 bytes holding `.tiff` and `.xlsx` members.

**This is the one route on this page that would not complete on re-verification, and it is
worth knowing why before you build on it.** On 2026-11-24, during a spell when the service
was returning intermittent `503`s elsewhere, four consecutive attempts all ended early —
19,606, 19,606, 3,445,075 and finally 190 bytes, that last being the nginx `503` page. What
came down was a *valid zip prefix*, first member `pbio.3004094.s001.tiff`, so the route and
the response shape are right; it simply did not finish. Two things make that worse than an
ordinary slow download:

- **You cannot size it up front.** `HEAD` is not answered on this path, and a plain `GET`
  waited the full 500 s without sending response headers at all — the archive is assembled
  on demand, so there is no `Content-Length` to read ahead of the body.
- **A partial download still opens as a zip.** The 3.4 MB fragment above identifies as a zip
  archive and yields its first member name, so "it parsed" is not a completeness check. Only
  reading the central directory to the end — or comparing against a member count you decided
  in advance — distinguishes a finished archive from a truncated one.

So assert on a member count or an uncompressed size rather than on the absence of an error,
and retry on mismatch. For bulk supplementary data, take the FTP tree below instead of
looping this route.

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

Observed 2026-11-24 — 1,321 archives listed; the sample is 1,194,493 bytes and holds 63
`<article>` elements. Note the plural root: parse `<articles>` and iterate its children, do
not expect a single `<article>` document as `fullTextXML` returns.

Neighbouring directories in `https://ftp.ebi.ac.uk/pub/databases/pmc/` carry the rest —
`preprints/` and `preprint_abstracts/`, `manuscripts/` for agency-deposited author
manuscripts, `pdf/`, `DOI/`, and `PMCOALiteMetadata/PMCOALiteMetadata.tgz` for metadata
without full text. There is **no per-article manifest at `oa/`** — `oa_file_list.csv` returns
`404` — so map a PMCID to its archive by the ranges in the filenames.

## Try it

**Data.** Four live records, all public and needing no account, all confirmed reachable
2026-11-24:

- `PMID:37994696` / `PMC10767826` — Europe PMC's own 2023 resource paper, CC BY, in the
  open-access subset; the full-text, licence and annotation assertions run on it.
- `PPR1260519` — a CC BY preprint with full text and **no** PMCID, which is the
  counter-example to "full text means PMCID".
- `PPR803623` — a preprint with `inEPMC: N`, so its `fullTextXML` is the `500` path.
- `PMID:33180112` — the second half of the two-hit query the cursor walk exhausts.

The search and `/profile` assertions run against the live index on the query `CRISPR`.

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

# 1. INVARIANT — the `request` echo is a fixed six-key summary, NOT a log of what was read.
echo = get(B + "/search?query=CRISPR&format=json&pageSize=3&page=77&bogusParam=9")["request"]
assert set(echo) == {"queryString", "resultType", "cursorMark",
                     "pageSize", "sort", "synonym"}, echo
assert echo["queryString"] == "CRISPR" and echo["pageSize"] == 3, echo
# `query` is absent because it is echoed under another name; `format` is absent and plainly
# worked, since `get` just parsed JSON. So absence from the echo proves nothing either way.
assert "query" not in echo and "format" not in echo, echo
# `page` being ignored has to be shown by comparing RESULT SETS, not by reading the echo:
pages = [[x["id"] for x in get(
            f"{B}/search?query=CRISPR&format=json&pageSize=25"
            f"&sort=P_PDATE_D%20asc&page={p}")["resultList"]["result"]]
         for p in (1, 2, 1000)]
assert len(set().union(*pages)) == 25, "page= unexpectedly paginated"
print(f"echo        : keys {sorted(echo)}")
print(f"page trap   : {sum(len(p) for p in pages)} rows fetched, "
      f"{len(set().union(*pages))} distinct -> page= is ignored")

# 2. INVARIANT — a walk ends on a MISSING nextCursorMark. Which of the two terminators
#    fires depends on pageSize, so a correct walk handles both and indexes neither.
def walk(query, page_size, want=None):
    cursor, ids, reqs, ended = "*", [], 0, None
    while True:
        d = get(f"{B}/search?query={urllib.parse.quote(query)}&format=json"
                f"&pageSize={page_size}&sort=P_PDATE_D%20asc"
                f"&cursorMark={urllib.parse.quote(cursor)}")
        reqs += 1
        batch = d["resultList"]["result"]
        if not batch:
            ended = "empty page"
            break
        ids += [x["id"] for x in batch]
        nxt = d.get("nextCursorMark")       # .get — absent on the last response
        if not nxt or nxt == cursor:
            ended = "no cursor offered"
            break
        if want is not None and len(ids) >= want:
            ended = "capped"               # a cap, not a terminator
            break
        cursor = nxt
    return ids, reqs, ended

TWO = "EXT_ID:37994696 OR EXT_ID:33180112"      # a genuine two-hit query
one_at_a_time, reqs_1, end_1 = walk(TWO, 1)
both_at_once, reqs_5, end_5 = walk(TWO, 5)
assert sorted(one_at_a_time) == sorted(both_at_once) == ["33180112", "37994696"]
assert (reqs_1, end_1) == (3, "empty page"), (reqs_1, end_1)
assert (reqs_5, end_5) == (1, "no cursor offered"), (reqs_5, end_5)
ids, reqs, ended = walk("CRISPR AND SRC:MED", 5, want=20)
assert len(ids) == len(set(ids)) == 20 and ended == "capped", (len(ids), ended)
print(f"cursorMark  : two-hit walk ends in {reqs_1} requests on an {end_1} at pageSize=1 "
      f"and {reqs_5} with {end_5} at pageSize=5; {len(ids)} distinct from the big query")

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

# 5. INVARIANT — full text answers to a bare accession: the PMCID for anything in PMC, the
#    record's own id for a preprint. A null `pmcid` does NOT mean there is no full text.
def core(ext_id):
    return get(B + f"/search?query=EXT_ID%3A{ext_id}&format=json"
                   "&resultType=core&pageSize=1")["resultList"]["result"][0]

rec = core("37994696")                      # in PMC
ppr = core("PPR1260519")                    # a preprint: pmcid is null, full text exists
pmcid = rec["pmcid"]
assert ppr.get("pmcid") is None and ppr["inEPMC"] == "Y", (ppr.get("pmcid"), ppr["inEPMC"])
sizes = {}
for acc in (pmcid, ppr["id"]):
    with urllib.request.urlopen(f"{B}/{acc}/fullTextXML", timeout=90) as r:
        xml = r.read().lstrip()
    assert xml.startswith(b"<?xml") or xml.startswith(b"<!DOCTYPE"), xml[:80]
    assert b"<article" in xml[:400], xml[:120]
    sizes[acc] = len(xml)
# every prefixed form is a 404 — a wrong URL shape, not a missing article
for bad in (f"/MED/{rec['pmid']}/fullTextXML", f"/PMC/{pmcid}/fullTextXML",
            f"/PPR/{ppr['id']}/fullTextXML"):
    try:
        urllib.request.urlopen(B + bad, timeout=90)
        raise AssertionError(bad + " unexpectedly succeeded")
    except urllib.error.HTTPError as e:
        assert e.code == 404, (bad, e.code)
# a record genuinely not held here answers 500, not 404
absent = core("PPR803623")
assert absent["inEPMC"] == "N", absent["inEPMC"]
try:
    urllib.request.urlopen(f"{B}/{absent['id']}/fullTextXML", timeout=90)
    raise AssertionError("PPR803623 unexpectedly returned full text")
except urllib.error.HTTPError as e:
    assert e.code == 500, e.code
print(f"full text   : {pmcid} -> {sizes[pmcid]} bytes, {ppr['id']} -> "
      f"{sizes[ppr['id']]} bytes with pmcid=None; prefixed -> 404; inEPMC=N -> 500")

# 6. INVARIANT — annotations come back as a top-level list carrying resolvable URIs.
payload = get(A + "?articleIds=MED%3A37994696&format=JSON")
assert isinstance(payload, list) and len(payload) == 1, type(payload)
anns = payload[0]["annotations"]
uris = [t["uri"] for a in anns for t in a.get("tags", []) if t.get("uri")]
assert anns and len(uris) == len(anns), (len(anns), len(uris))
hosts = Counter(u.split("://")[1].split("/")[0] for u in uris)
print(f"annotations : {len(anns)} over {len(Counter(a['type'] for a in anns))} types, "
      f"every one carrying a URI across {len(hosts)} namespace(s) {sorted(hosts)}")

# 7. INVARIANT — the text-mining filter is HAS_TM. HAS_TMT is a misspelling, and its zero is
#    the unknown-field trap from the top of this page rather than a fact about the index.
has_tm = hits("HAS_TM:y")
assert rec["hasTextMinedTerms"] == "Y"
assert hits("EXT_ID:37994696 AND HAS_TM:y") == 1        # the real field filters
assert has_tm > 30_000_000                              # and it is live registry-wide
assert hits("HAS_TMT:y") == 0                           # the misspelling: unknown field
print(f"HAS_TM      : HAS_TM:y matches {has_tm}, EXT_ID+HAS_TM:y matches 1, "
      f"misspelt HAS_TMT:y matches 0")
```

**Expect.** Every `assert` above is an invariant: a failure means this page is wrong, not that
upstream moved. The eight `print` lines carry observed values, and this is exactly what the
block printed, run end to end in a clean directory on 2026-11-24 — about 35 requests in
6 minutes 11 seconds, so give it time rather than assuming it has hung:

```
echo        : keys ['cursorMark', 'pageSize', 'queryString', 'resultType', 'sort', 'synonym']
page trap   : 75 rows fetched, 25 distinct -> page= is ignored
cursorMark  : two-hit walk ends in 3 requests on an empty page at pageSize=1 and 1 with no cursor offered at pageSize=5; 20 distinct from the big query
field names : TITLE/AUTH resolve, TI/FIRST_AUTH silently return 0
sources     : SRC sum == /profile sum == ALL == 243641; pubType rows sum to 433690, so they overlap
full text   : PMC10767826 -> 87690 bytes, PPR1260519 -> 185484 bytes with pmcid=None; prefixed -> 404; inEPMC=N -> 500
annotations : 160 over 4 types, every one carrying a URI across 2 namespace(s) ['identifiers.org', 'linkedlifedata.com']
HAS_TM      : HAS_TM:y matches 38046363, EXT_ID+HAS_TM:y matches 1, misspelt HAS_TMT:y matches 0
```

Drift to investigate, not failure: `243641`, `433690`, `38046363`, `160`, `4 types`, `87690`
and `185484` all move as the index grows and as annotation models are re-run; a third URI
namespace appearing is drift too, not a fault.

What must hold is the rest:

- the echo carrying **exactly** those six keys — no `query`, no `format`, while `format=json`
  demonstrably worked;
- `25 distinct` records across three different `page` values;
- the two-hit walk ending in **3** requests on an empty page at `pageSize=1` and **1** with
  no cursor offered at `pageSize=5` — both terminators, neither of them an index into
  `nextCursorMark`;
- `SRC` counts summing exactly to `hitCount` while `pubType` rows overrun it;
- `PPR1260519` returning full text **with `pmcid` null**, every prefixed path returning
  `404`, and an `inEPMC: N` record returning `500`;
- every annotation carrying a resolvable URI;
- `HAS_TM:y` filtering — registry-wide and on one record — while the misspelt `HAS_TMT:y`
  reads zero.

That last pair is the page's own trap caught in the act: a zero from `HAS_TMT:y` is a fact
about the field name, not about the index.

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
- Read a `503`'s **body** before deciding what it was: an nginx HTML page is infrastructure
  and wants backoff, while the JSON `errCode` body can be a malformed `sort`. Rule `sort`
  out with one re-run before you start retrying (see **Sorting**).
