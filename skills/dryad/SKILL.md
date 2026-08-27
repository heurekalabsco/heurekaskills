---
name: dryad
description: Retrieve published datasets from Dryad by DOI — the CC0 data behind a paper with the depositor's methods prose, funder and ROR affiliations, spatial coverage and linked publication. Resolve a paper DOI to its deposit and page a file manifest with SHA-256 digests anonymously, then write a dataset card. File bytes need a free Dryad API token.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, data-sharing, publishing, provenance, doi]
covers: [dryad, CC0, published data, data availability statement, supplementary data, README, methods, usage notes, provenance, dataset card, ROR, ORCID, funder, award number, spatial coverage, latitude, longitude, SHA-256, checksum, versions, DOI, primary article, preprint, journal ISSN, ecology, evolution, genomics, human subjects, ethics statement, data reuse]
papers: [doi:10.1371/journal.pone.0250278]
access: [open, registered]
datasets: [https://datadryad.org/api/v2/datasets/doi%3A10.5061%2Fdryad.ttdz08kxq, https://datadryad.org/api/v2/datasets/doi%3A10.7280%2FD1KS3N, https://datadryad.org/api/v2/datasets/doi%3A10.5061%2Fdryad.sj3tx964z, https://datadryad.org/api/v2/datasets/doi%3A10.7941%2FD1SP93]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: Dryad API v2.1.0 / Python 3.12.8, standard library only / curl 8.7.1
  executed: 8
  unverified: 1
  unverified_reason: >-
    The OAuth2 token exchange and the byte download it enables need a Dryad API
    account, which is self-service from a Dryad account page but which the validating
    environment does not hold — as is the token-gated branch of the harvest block, whose
    anonymous path did run end to end. Every anonymous route is executed, including an
    assertion that the download answers 401 without a token. Re-run the token block from
    a host holding Dryad API credentials in DRYAD_ID and DRYAD_SECRET.
  records: 28 datasets across four DOI prefixes, published 2012 to 2026, 526 B to
    33.7 GB, 1 to 151 files, 1 to 4 published versions
---
# Dryad

Dryad is the generic repository that paper-associated data lands in when there is no
domain archive for it — the processed tables, alignments, survey sheets and image
stacks an analysis actually starts from. It holds 72,079 datasets as of 2026-08-27,
and its terms make the licence question uniform before you ask it. From the Terms of
Service:

> By Submitting a Dataset to Dryad, the Submitter grants Dryad irrevocable permission
> to make the Dataset available to the public under a CC0 instrument.

So there is no per-record licence negotiation. Every one of the 800 records sampled
for this page carried `https://spdx.org/licenses/CC0-1.0.html`, and the `## Try it`
block asserts it on every record it touches.

**The point of coming here is context, not bytes.** A Dryad DOI resolves in one call
to the depositor's own methods prose, the authors with ORCIDs and ROR-identified
affiliations, the funder and award number, the spatial coverage, the human-subjects
statement, and a typed link back to the paper. That is the provenance a dataset card
needs, and it arrives alongside the file manifest rather than after a separate hunt.

## What is anonymous, and what needs an account

Everything on this page up to `## Get the files` is anonymous HTTP — no key, no
account, no click-through. Two limits sit on that:

- **30 requests per minute.** Past that the API answers `429`. An account raises it;
  Dryad's help pages put the account rate at eight times the anonymous one.
- **File bytes need a bearer token.** `GET /files/{id}/download`,
  `/datasets/{doi}/download` and `/versions/{id}/download` all answer `401
  Unauthorized, must have current bearer token` to an anonymous caller — checked
  2026-08-27 against four datasets including deposits published this month, and the
  OpenAPI document marks all three routes `bearerAuth`. Dryad's own API README still
  shows the dataset download as a plain unauthenticated `GET`; it is not one.

Getting the token is self-service and free. Dryad's account help says:

> To create an API account, visit your Dryad My account page, and click Create a Dryad
> API account. You will be provided with an API account ID and secret, and an initial
> API token with which to use the Dryad API. Tokens expire every 10 hours.

The Dryad account itself is an ORCID login. So the requirement is an account anyone
can open, in the same class as an API key — but you need it before the first byte
lands, and `## Get the files` says so where it matters rather than here only.

## Resolving a DOI

**The slash is the load-bearing character.** `doi:10.5061/dryad.ttdz08kxq` has to reach
the path as `doi%3A10.5061%2Fdryad.ttdz08kxq`. The colon is optional and so is the
`doi:` prefix; an unencoded `/` is a routing failure, not a lookup failure.

That distinction is visible in the response and worth reading, because the two 404s
mean opposite things:

```bash
API=https://datadryad.org/api/v2
DOI='doi:10.5061/dryad.ttdz08kxq'

# The slash is the load-bearing character. Encode it, or the router never sees a DOI.
ENC=$(python3 -c "import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=''))" "$DOI")
echo "encoded: $ENC"

for path in "$ENC" "doi%3A10.5061/dryad.ttdz08kxq" "doi%3A10.5061%2Fdryad.zzzzzzzzz"; do
  printf '%-40s ' "$path"
  curl -s -o probe.json -w 'http=%{http_code} ' "$API/datasets/$path"
  echo "body=$(head -c 22 probe.json)"
  sleep 2
done
```

Printed 2026-08-27:

```
encoded: doi%3A10.5061%2Fdryad.ttdz08kxq
doi%3A10.5061%2Fdryad.ttdz08kxq          http=200 body={"_links":{"self":{"hr
doi%3A10.5061/dryad.ttdz08kxq            http=404 body=
doi%3A10.5061%2Fdryad.zzzzzzzzz          http=404 body={"error":"not-found"}
```

An **empty** 404 body means you mis-encoded the path. `{"error":"not-found"}` means the
DOI is genuinely not in Dryad — a typo, a withdrawal, or a DOI from another repository.
Collapsing the two turns a bug in your own code into a report that a paper's data is
missing.

## Reading the provenance off a record

One call returns it all. The helper below is the one every later block uses, and it
handles the rate limit properly — the `RateLimit-*` headers appear **only on the 429**,
so there is no budget to read before you are already blocked.

```python
import json, time, urllib.error, urllib.parse, urllib.request

API = "https://datadryad.org/api/v2"


def get(path, **params):
    """Anonymous GET. 30 requests/minute; a 429 carries the reset as a Unix second.

    The RateLimit-* headers appear ONLY on the 429 — a 200 carries none of them, so
    there is no budget to read before you are already blocked. Sleep to the stated
    reset rather than backing off blind.
    """
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                # e.headers is case-insensitive; dict(e.headers) is NOT — the names
                # arrive lowercased over HTTP/2 and a "RateLimit-Reset" lookup misses.
                reset = int(e.headers.get("ratelimit-reset") or 0)
                time.sleep(max(2, reset - int(time.time()) + 2))
                continue
            if e.code == 404:
                body = e.read()
                raise LookupError(
                    f"{path}: {'no such DOI in Dryad' if body else 'ROUTING failure — the / in the DOI is not %2F encoded'}"
                ) from None
            raise
    raise RuntimeError(f"{path}: still rate-limited after {attempt + 1} attempts")


def dataset(doi):
    """`doi:10.5061/dryad.xxxx` or a bare `10.5061/dryad.xxxx` — both resolve."""
    return get("/datasets/" + urllib.parse.quote(doi, safe=""))


ds = dataset("doi:10.5061/dryad.ttdz08kxq")

print("title     :", ds["title"][:64])
print("licence   :", ds["license"])
print("published :", ds["publicationDate"], "| version", ds["versionNumber"],
      "| curation", ds["curationStatus"])
print("bytes     :", f"{ds['storageSize']:,}")
print("landing   :", ds["sharingLink"])
print()

print("who made it")
for a in ds.get("authors") or []:
    name = f"{a.get('lastName') or '?'}, {a.get('firstName') or '?'}"
    print(f"  {name:<22} {a.get('orcid') or '-':<21} "
          f"{a.get('affiliation') or '-'} {a.get('affiliationROR') or ''}")
print()

print("what it belongs to")
print("  journal ISSN :", ds.get("relatedPublicationISSN") or "-")
for w in ds.get("relatedWorks") or []:
    print(f"  {w['relationship']:<22} {w['identifierType']:<4} {w['identifier']}")
print()

# Absent, not null. `methods`, `usageNotes`, `funders`, `locations`, `hsiStatement`
# and `relatedWorks` are omitted entirely when empty — ds["methods"] is a KeyError,
# not None, on the majority of deposits.
for k in ("methods", "usageNotes", "funders", "locations", "hsiStatement", "keywords"):
    v = ds.get(k)
    print(f"  {k:<14} {'present' if v else 'ABSENT ':<8} {str(v)[:44]}")
```

Printed 2026-08-27:

```
title     : Molecular subtyping of alzheimer’s disease with consensus non-ne
licence   : https://spdx.org/licenses/CC0-1.0.html
published : 2021-04-22 | version 9 | curation Published
bytes     : 10,047,907
landing   : http://datadryad.org/dataset/doi:10.5061/dryad.ttdz08kxq

who made it
  Zheng, Chunlei         0000-0002-9737-461X   Case Western Reserve University https://ror.org/051fd9666
  Xu, Rong               -                     Case Western Reserve University https://ror.org/051fd9666

what it belongs to
  journal ISSN : 1932-6203
  primary_article        DOI  https://doi.org/10.1371/journal.pone.0250278

  methods        present  <p style="text-indent:0px;text-align:justify
  usageNotes     present  <p>Please see the readme file for the datafi
  funders        ABSENT   None
  locations      ABSENT   None
  hsiStatement   ABSENT   None
  keywords       present  ["Alzheimer's disease"]
```

Where each piece of provenance lives, with presence measured over the 200 datasets
published in 2026 up to 2026-08-27:

| you want | field | present |
|---|---|---|
| licence | `license` — always CC0 | 200/200 |
| who, with ORCID and ROR | `authors[].orcid`, `.affiliationROR` | 200/200 |
| discipline | `fieldOfScience` | 199/200 |
| the journal | `relatedPublicationISSN` | 188/200 |
| who paid, and under which award | `funders[].organization`, `.identifier`, `.awardNumber` | 169/200 |
| the paper, preprint or software | `relatedWorks[]` | 118/200 |
| how the data was made | `methods` | 41/200 |
| ethics and consent | `hsiStatement` | 13/200 |
| how to use the files | `usageNotes` | 3/200 |
| where it was collected | `locations[]` | 1/200 |
| transfer cost before you commit | `storageSize` | 200/200 |
| the period the data covers | no field exists — read the README | — |

**Fields are omitted, not nulled.** `ds["methods"]` raises `KeyError` on four datasets in
five, so use `.get()` everywhere and treat a missing key as an empty one.

`locations`, where it is there at all, carries a `place`, a `point` of
`latitude`/`longitude`, and a `box` of `swLatitude`/`swLongitude`/`neLatitude`/`neLongitude`.
The corners are typed by the depositor and Dryad does not validate them — `doi:10.7280/D1KS3N`
has a box whose south-west latitude sits north of its north-east one.

## The methods prose is HTML, and it moved

`methods`, `usageNotes`, `abstract` and `hsiStatement` are HTML fragments pasted out of a
word processor. Write the raw value into a dataset card and you ship `<div>` tags and
non-breaking spaces.

The larger problem is that the prose relocated. Dryad's submission form once had free-text
methods and usage-notes fields; it now requires a README file in the deposit instead. So
`methods` is populated on most of the 2022–2023 cohort and on a quarter of the 2026 one, and
a harvester keyed on it reads one decade correctly and misreports the rest as undocumented:

```python
from html.parser import HTMLParser


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out = []

    def handle_data(self, d):
        self.out.append(d)

    def handle_startendtag(self, tag, attrs):
        self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("p", "div", "br", "li", "tr", "h1", "h2", "h3"):
            self.out.append("\n")


def as_text(html_fragment):
    """`methods`, `usageNotes`, `abstract` and `hsiStatement` are HTML, not plain text.

    Depositors paste from a word processor, so the markup arrives with &nbsp; as well
    as tags. Write the raw value into a dataset card and you get <div> and \xa0 in it.
    """
    p = _Text()
    p.feed(html_fragment or "")
    text = "".join(p.out).replace("\xa0", " ")
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


print("methods, raw:")
print("   ", repr(ds["methods"][:96]))
print("methods, as text:")
print("   ", repr(as_text(ds["methods"])[:96]))
print()

# Where the depositor's prose actually lives, by era. Dryad moved from form fields to a
# required README file, so a harvester keyed on `methods` alone reads the wrong decade.
print(f"{'published':<12} {'n':>4} {'methods':>8} {'usageNotes':>11}")
for label, window in (("2015-2018", dict(publishedSince="2015-01-01", publishedBefore="2018-12-31")),
                      ("2019-2021", dict(publishedSince="2019-01-01", publishedBefore="2021-12-31")),
                      ("2022-2023", dict(publishedSince="2022-01-01", publishedBefore="2023-12-31")),
                      ("2024-2025", dict(publishedSince="2024-01-01", publishedBefore="2025-12-31")),
                      ("2026",      dict(publishedSince="2026-01-01"))):
    hits = get("/search", per_page=100, **window)["_embedded"]["stash:datasets"]
    print(f"{label:<12} {len(hits):>4} {sum(1 for h in hits if h.get('methods')):>8} "
          f"{sum(1 for h in hits if h.get('usageNotes')):>11}")
```

Printed 2026-08-27:

```
methods, raw:
    '<p style="text-indent:0px;text-align:justify;"><span><span style="font-style:normal;"><span><spa'
methods, as text:
    'ROSMAP gene expression data and corresponding metadata were downloaded from synapse.org (syn3219'

published       n  methods  usageNotes
2015-2018     100        2          99
2019-2021     100       59          48
2022-2023     100       72          20
2024-2025     100       34           1
2026          100       23           1
```

Read as a rule: **check `methods`, fall back to `usageNotes`, and if neither is there the
prose is in the deposit's README file** — which is one of the paths in the manifest, and one
of the bytes that needs a token. Every one of the thirty 2026 deposits sampled for this page
carried a `README` file; eight of them carried a `methods` field.

## From a paper to its deposit

Two endpoints look interchangeable and are not. `/datasets` accepts exactly `page`,
`per_page`, `publicationISSN`, `publicationName`, `manuscriptNumber` and `curationStatus`.
**Any other parameter is dropped in silence**, so an unsupported filter returns all 72,079
datasets wearing the shape of a result set. `/search` is the one with the query grammar.

```python
import urllib.error, urllib.parse, urllib.request


def probe(path, **params):
    """Status plus total, without raising — the filters below fail in three ways."""
    url = f"{API}{path}?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            body = json.loads(r.read())
            return r.status, body.get("total"), [d["identifier"] for d in
                                                 body.get("_embedded", {}).get("stash:datasets", [])][:2]
    except urllib.error.HTTPError as e:
        return e.code, None, []


PAPER = "10.1371/journal.pone.0250278"

print(f"{'request':<58} {'http':>4} {'total':>6}  first hits")
for label, path, params in (
        # /datasets takes page, per_page, publicationISSN, publicationName,
        # manuscriptNumber and curationStatus. ANY other key is dropped in silence,
        # so a q= filter returns the whole repository looking like a result set.
        ("/datasets?q=alzheimer", "/datasets", dict(q="alzheimer", per_page=2)),
        ("/search?q=alzheimer", "/search", dict(q="alzheimer", per_page=2)),
        # relatedWorkIdentifier is an EXACT match on a value stored as a full URL,
        # and handing it that URL is a 500 rather than a no-match.
        ("/search?relatedWorkIdentifier=<bare doi>", "/search", dict(relatedWorkIdentifier=PAPER)),
        ("/search?relatedWorkIdentifier=<https url>", "/search",
         dict(relatedWorkIdentifier=f"https://doi.org/{PAPER}")),
        ("/search?relatedWorkIdentifier=*<bare doi>", "/search",
         dict(relatedWorkIdentifier="*" + PAPER)),
        # relatedId matches manuscript numbers and PubMed IDs too, and needs no wildcard.
        ("/search?relatedId=<bare doi>", "/search", dict(relatedId=PAPER)),
):
    code, total, hits = probe(path, **params)
    print(f"{label:<58} {code:>4} {str(total):>6}  {hits}")
    time.sleep(2)
```

Printed 2026-08-27:

```
request                                                    http  total  first hits
/datasets?q=alzheimer                                       200  72079  ['doi:10.5061/dryad.7rh4625', 'doi:10.5061/dryad.r8d4q']
/search?q=alzheimer                                         200    220  ['doi:10.5061/dryad.hqbzkh1g2', 'doi:10.5061/dryad.37pvmcvp1']
/search?relatedWorkIdentifier=<bare doi>                    200      0  []
/search?relatedWorkIdentifier=<https url>                   500   None  []
/search?relatedWorkIdentifier=*<bare doi>                   200      1  ['doi:10.5061/dryad.ttdz08kxq']
/search?relatedId=<bare doi>                                200      1  ['doi:10.5061/dryad.ttdz08kxq']
```

**Use `relatedId` to go from a paper to its deposit.** It takes the bare DOI and also matches
manuscript numbers and PubMed IDs. `relatedWorkIdentifier` is an exact match against a value
Dryad stores as a full `https://doi.org/…` URL, so the bare DOI misses, the leading-wildcard
form `*10.1371/journal.pone.0250278` hits, and passing the stored URL itself is a **500** — a
failure mode that reads as "the service is down" rather than "wrong parameter".

The rest of the `/search` grammar, all anonymous: `q` (all terms must match, `*` wildcard,
`-term` negation, quotes for a phrase), `subject`, `author`, `orcid`, `affiliation`, `funder`,
`facility` and `org` (ROR ids, URL-encoded), `award`, `tenant`, `publicationISSN`,
`publishedSince` / `publishedBefore`, `modifiedSince` / `modifiedBefore`, and
`relatedWorkRelationship`. Relationship values seen across 200 records in 2026 were
`primary_article`, `preprint`, `article`, `software`, `supplemental_information` and
`dataset`.

Going the other way — from a journal to everything it deposited — `publicationISSN` works on
both endpoints and is the one filter `/datasets` genuinely honours.

## Versions

A Dryad DOI resolves to the latest published version. The versions list is **ascending by
publication date, so the latest is the last element** — and `_links.stash:version` on the
dataset record is a one-hop shortcut to the same thing.

```python
def versions(doi):
    """Ascending by publication date. The LATEST is the LAST element, not the first."""
    enc = urllib.parse.quote(doi, safe="")
    out, page = [], 1
    while True:
        d = get(f"/datasets/{enc}/versions", per_page=100, page=page)
        out += d["_embedded"]["stash:versions"]
        if len(out) >= d["total"] or not d["_links"].get("next"):
            return out
        page += 1


for doi in ("doi:10.5061/dryad.sj3tx964z", "doi:10.5061/dryad.ttdz08kxq"):
    ds_v = dataset(doi)
    vs = versions(doi)
    print(doi)
    print("  published versions :",
          [(v["versionNumber"], v["publicationDate"]) for v in vs])
    # The record's own versionNumber counts every internal revision, published or not,
    # so it need not equal the number of entries above and the numbers need not be
    # contiguous. Do not compute "how many versions" from it.
    print(f"  record says version {ds_v['versionNumber']}, {len(vs)} of them are public")
    latest = vs[-1]["_links"]["self"]["href"]
    print("  latest, the long way :", latest)
    print("  latest, in one hop   :", ds_v["_links"]["stash:version"]["href"],
          "<- same" if ds_v["_links"]["stash:version"]["href"] == latest else "<- DIFFERENT")
    time.sleep(2)
```

Printed 2026-08-27:

```
doi:10.5061/dryad.sj3tx964z
  published versions : [(2, '2021-05-30'), (3, '2022-02-02'), (4, '2022-11-23')]
  record says version 4, 3 of them are public
  latest, the long way : /api/v2/versions/207850
  latest, in one hop   : /api/v2/versions/207850 <- same
doi:10.5061/dryad.ttdz08kxq
  published versions : [(9, '2021-04-22')]
  record says version 9, 1 of them are public
  latest, the long way : /api/v2/versions/116480
  latest, in one hop   : /api/v2/versions/116480 <- same
```

`versionNumber` counts internal revisions, published or not. The Alzheimer's record says
version 9 and has exactly one public version; `doi:10.5061/dryad.zw3r228jc` jumped from 5
to 11 between its two published versions. **Never infer a version count from that number**,
and pin a reanalysis to a `/versions/{id}` URL rather than to the DOI, because the DOI moves
when the depositor publishes again.

## The file manifest

`/versions/{id}/files` defaults to **20 rows and caps at 100**, while `total` reports the
truth. A single unpaged GET on a 40-file deposit returns twenty rows and a 200, which is
exactly the shape of a complete answer.

```python
def files(version_href):
    """per_page defaults to 20 and caps at 100. `total` is the honest number.

    A one-shot GET on a 40-file deposit returns 20 and a 200, which is the shape of a
    complete answer. Page to `total` and assert it, or half the manifest goes missing
    without an error anywhere.
    """
    out, page = [], 1
    while True:
        d = get(f"{version_href.replace('/api/v2', '')}/files", per_page=100, page=page)
        out += d["_embedded"]["stash:files"]
        if len(out) >= d["total"]:
            assert len(out) == d["total"], f"{len(out)} listed, {d['total']} declared"
            return out
        page += 1


# Not every Dryad DOI starts 10.5061 — partner institutions mint under their own
# prefix, and a regex anchored on 10.5061 drops them.
DOI = "doi:10.7941/D1SP93"
ds_f = dataset(DOI)
vhref = ds_f["_links"]["stash:version"]["href"]

naive = get(f"{vhref.replace('/api/v2', '')}/files")
full = files(vhref)
print(f"{DOI}  declared {naive['total']} files")
print(f"  one unpaged GET returned {naive['count']}  <- silently short")
print(f"  paged to exhaustion       {len(full)}")
print(f"  bytes {sum(f['size'] for f in full):,} vs storageSize {ds_f['storageSize']:,}")
print()
for f in sorted(full, key=lambda f: f["size"])[:4]:
    print(f"  {f['size']:>10,} B  {f['digestType']:<7} {f['digest'][:16]}…  "
          f"{f['mimeType']:<26} {f['path'][:34]}")
```

Printed 2026-08-27:

```
doi:10.7941/D1SP93  declared 40 files
  one unpaged GET returned 20  <- silently short
  paged to exhaustion       40
  bytes 33,690,074,287 vs storageSize 33,690,074,287

       2,095 B  sha-256 ddc70cc66479e5ab…  text/csv                   Processed_datasets_metadata.csv
       2,114 B  sha-256 6b104a943ab53769…  text/markdown              README.md
      53,486 B  sha-256 a0b88c54bdd92870…  text/csv                   raw_data_metadata.csv
  92,276,736 B  sha-256 a6d462296bdbf0c1…  application/x-hdf          Au_5nm_260kx_450e_Std_UTC_FFCorr_T
```

Three things to take from that. **`storageSize` equals the summed file sizes of the latest
version**, which makes it a reliable transfer-cost check before you commit to anything — this
deposit is 33.7 GB. **`digest` is a SHA-256 you can verify after download**, and it is the only
integrity check on offer. And **not every Dryad DOI starts `10.5061`**: partner institutions
mint under their own prefixes, `10.7941` and `10.7280` among them, so a regex anchored on
`10.5061` drops them.

## Get the files

The end state is a directory holding the data plus three things that say what it is —
a dataset card a person reads, a manifest with digests, and the full record kept verbatim so a
later fetch can be diffed against it. The card is what makes this more than a download.

**Before running this: the metadata half needs nothing, the byte half needs a token.** Set
`DRYAD_TOKEN` and the data files land; leave it unset and you get the card, the manifest and
the provenance record, with every skipped file named and the reason given. The block below
does both and reports which happened.

```python
import csv, os


def card(ds, files_):
    """A dataset card — what this is, who made it, where it came from, what is in it."""
    L = []
    add = L.append
    add(f"# {ds['title']}\n")
    add(f"- **DOI** {ds['identifier']}")
    add(f"- **Landing page** {ds['sharingLink']}")
    add(f"- **Licence** {ds['license']}")
    add(f"- **Published** {ds['publicationDate']}  ·  last modified {ds['lastModificationDate']}")
    add(f"- **Version** {ds['versionNumber']} ({ds['curationStatus']})")
    add(f"- **Size** {ds['storageSize']:,} bytes across {len(files_)} files")
    if ds.get("fieldOfScience"):
        add(f"- **Field** {ds['fieldOfScience']}")
    if ds.get("keywords"):
        add(f"- **Keywords** {', '.join(ds['keywords'])}")

    add("\n## Authors\n")
    for a in ds.get("authors") or []:
        # An institutional depositor has a lastName and nothing else. Formatting that
        # assumes a first name prints "None" into the card.
        bits = [", ".join(x for x in (a.get("lastName"), a.get("firstName")) if x)]
        if a.get("orcid"):
            bits.append(f"ORCID {a['orcid']}")
        if a.get("affiliation"):
            bits.append(a["affiliation"] + (f" ({a['affiliationROR']})" if a.get("affiliationROR") else ""))
        add("- " + " · ".join(bits))

    if ds.get("funders"):
        add("\n## Funding\n")
        for f in ds["funders"]:
            award = f.get("awardNumber") or ""
            add(f"- {f.get('organization')} {f.get('identifier') or ''} {award}".rstrip())

    if ds.get("relatedWorks") or ds.get("relatedPublicationISSN"):
        add("\n## Related works\n")
        if ds.get("relatedPublicationISSN"):
            add(f"- journal ISSN {ds['relatedPublicationISSN']}")
        for w in ds.get("relatedWorks") or []:
            add(f"- {w['relationship']} · {w['identifierType']} · {w['identifier']}")

    if ds.get("locations"):
        add("\n## Spatial coverage\n")
        add("Depositor-entered and not validated by Dryad — check the corners before using a box.\n")
        for loc in ds["locations"]:
            p, b = loc.get("point"), loc.get("box")
            add(f"- {loc.get('place') or 'unnamed'}"
                + (f" · point {p['latitude']}, {p['longitude']}" if p else "")
                + (f" · box SW {b['swLatitude']}, {b['swLongitude']}"
                   f" NE {b['neLatitude']}, {b['neLongitude']}" if b else ""))

    for label, key in (("Abstract", "abstract"), ("Methods", "methods"),
                       ("Usage notes", "usageNotes"), ("Human subjects", "hsiStatement")):
        if ds.get(key):
            add(f"\n## {label}\n")
            add(as_text(ds[key]))

    add("\n## Files\n")
    for f in sorted(files_, key=lambda f: f["path"]):
        add(f"- `{f['path']}` — {f['size']:,} B · {f['mimeType']} · "
            f"{f['digestType']} {f['digest']}")
    return "\n".join(L) + "\n"


class _DropAuthOnRedirect(urllib.request.HTTPRedirectHandler):
    """`/files/{id}/download` 302s to a presigned URL on object storage.

    urllib copies every header except content-length and content-type onto the
    redirected request, so a Dryad bearer token would be handed to a third-party host
    — a credential leak, and a presigned URL already carries its own signature, so a
    second Authorization header is rejected rather than ignored. `curl -L` drops it for
    you; urllib does not, and `curl --location-trusted` would put it back.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None:
            new.headers.pop("Authorization", None)
            new.unredirected_hdrs.pop("Authorization", None)
        return new


OPENER = urllib.request.build_opener(_DropAuthOnRedirect)


def harvest(doi, out_dir=None, max_bytes=50_000_000):
    out_dir = out_dir or os.path.join("Data", "dryad", doi.split("/")[-1])
    os.makedirs(out_dir, exist_ok=True)
    ds = dataset(doi)
    vhref = ds["_links"]["stash:version"]["href"]
    fl = files(vhref)

    with open(os.path.join(out_dir, "manifest.tsv"), "w", newline="") as fh:
        w = csv.writer(fh, delimiter="\t")
        w.writerow(["path", "bytes", "mimeType", "digestType", "digest", "file_id", "download"])
        for f in fl:
            fid = f["_links"]["self"]["href"].rsplit("/", 1)[-1]
            w.writerow([f["path"], f["size"], f["mimeType"], f["digestType"], f["digest"],
                        fid, f"{API}/files/{fid}/download"])

    with open(os.path.join(out_dir, "provenance.json"), "w") as fh:
        json.dump({"retrieved": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "record": f"{API}/datasets/{urllib.parse.quote(doi, safe='')}",
                   "version_record": f"https://datadryad.org{vhref}",
                   "dataset": ds, "files": fl}, fh, indent=2)

    with open(os.path.join(out_dir, "DATASET_CARD.md"), "w") as fh:
        fh.write(card(ds, fl))

    token = os.environ.get("DRYAD_TOKEN")
    fetched, skipped = [], []
    for f in fl:
        if f["size"] > max_bytes:
            skipped.append((f["path"], "over max_bytes"))
            continue
        if not token:
            skipped.append((f["path"], "no DRYAD_TOKEN — bytes need an account"))
            continue
        fid = f["_links"]["self"]["href"].rsplit("/", 1)[-1]
        req = urllib.request.Request(f"{API}/files/{fid}/download",
                                     headers={"Authorization": f"Bearer {token}"})
        dest = os.path.join(out_dir, f["path"])
        os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
        with OPENER.open(req, timeout=300) as r, open(dest, "wb") as out:
            out.write(r.read())
        got = os.path.getsize(dest)
        assert got == f["size"], f"{f['path']}: {got} bytes, manifest says {f['size']}"
        fetched.append(f["path"])
    return out_dir, ds, fl, fetched, skipped


out_dir, ds_h, fl_h, fetched, skipped = harvest("doi:10.7280/D1KS3N")
print("wrote to", out_dir)
for name in sorted(os.listdir(out_dir)):
    print(f"  {os.path.getsize(os.path.join(out_dir, name)):>8,} B  {name}")
print("data files fetched :", fetched or "none")
for path, why in skipped:
    print(f"  skipped {path} — {why}")
print()
print("--- DATASET_CARD.md ---")
print(open(os.path.join(out_dir, "DATASET_CARD.md")).read())
```

Printed 2026-08-27 with `DRYAD_TOKEN` unset:

```
wrote to Data/dryad/D1KS3N
     1,332 B  DATASET_CARD.md
       214 B  manifest.tsv
     3,821 B  provenance.json
data files fetched : none
  skipped README.txt — no DRYAD_TOKEN — bytes need an account

--- DATASET_CARD.md ---
# Bird Surveys

- **DOI** doi:10.7280/D1KS3N
- **Landing page** http://datadryad.org/dataset/doi:10.7280/D1KS3N
- **Licence** https://spdx.org/licenses/CC0-1.0.html
- **Published** 2015-04-15  ·  last modified 2019-09-17
- **Version** 1 (Published)
- **Size** 526 bytes across 1 files
- **Keywords** bird monitoring, Irvine Ranch Conservancy, The Nature Conservancy, TNC

## Authors

- The Nature Conservancy San Diego Field Office

## Funding

- The Nature Conservancy https://ror.org/0563w1497

## Related works

- supplemental_information · URL · http://www.nature.org/ourinitiatives/regions/northamerica/unitedstates/california/contact/index.htm

## Spatial coverage

Depositor-entered and not validated by Dryad — check the corners before using a box.

- Orange County (Calif.) · point 33.676911, -117.776166 · box SW 33.947514, -118.1259 NE 33.333992, -117.412987
- unnamed · box SW 33.745432, -117.763653 NE 33.784819, -117.665462

## Abstract

For more detailed metadata, including data access and usage instructions, please download and consult README.txt file.

## Methods

Characterize bird species richness and biodiversity; define habitat associations; document special status species

## Files

- `README.txt` — 526 B · text/plain · sha-256 6e276f1dd562fa07f1e45e1c44c85f3af34a94eefe10838d35e5f12db0e3d60d
```

### The token, when you want the bytes

Create the API account from your own Dryad account page — ORCID login, then *Create a Dryad
API account* — and it hands you an application id and secret. Exchange those for a token
through the OAuth2 client-credentials grant. Tokens last ten hours, so fetch one per run
rather than storing it.

```bash
export DRYAD_TOKEN=$(curl -s -X POST https://datadryad.org/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded;charset=UTF-8' \
  -d "client_id=$DRYAD_ID&client_secret=$DRYAD_SECRET&grant_type=client_credentials" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

# Confirm the token before spending a long download on it.
curl -s -H "Authorization: Bearer $DRYAD_TOKEN" https://datadryad.org/api/v2/test

# One file by id, from the manifest's `download` column.
curl -fL -H "Authorization: Bearer $DRYAD_TOKEN" \
  -o README.txt "https://datadryad.org/api/v2/files/138975/download"

# Or the whole latest version as a zip. Check storageSize first — deposits reach tens of GB.
curl -fL -H "Authorization: Bearer $DRYAD_TOKEN" -o dataset.zip \
  "https://datadryad.org/api/v2/datasets/doi%3A10.7280%2FD1KS3N/download"
```

**The route redirects to object storage, and that is where the token can leak.** Dryad answers
`/files/{id}/download` with a 302 to a presigned URL on another host. `curl -L` drops a custom
`Authorization` header across a host change and is safe as written above; `curl
--location-trusted` would forward it, and so does `urllib.request.urlopen`, which is why the
block above installs an opener that strips the header on redirect. A presigned URL carries its
own signature, so forwarding a second credential is both a leak and a rejected request.

This block and the token-gated branch of `harvest()` are what was not executed here — the
validating environment holds no Dryad credentials. What *is* executed is the other half of the
claim: `## Try it` asserts that the same download route answers `401` without a token, so the
requirement is measured even where the satisfying path is not. After downloading, verify each
file against the `digest` column of `manifest.tsv`; Dryad publishes SHA-256 for exactly this.

## What Dryad will not give you

- **No temporal coverage field.** `publicationDate` and `lastModificationDate` describe the
  deposit, not the period the data covers. That is in the README, in prose.
- **No structured sample table.** Nothing here is the equivalent of a MAGE-TAB SDRF or an
  ISA-Tab; the files are whatever the depositor uploaded, and the README is the only key.
- **No embargo visibility.** Dryad's own API documentation states that without a token only
  published datasets are available, and its Private for Peer Review option keeps a deposit
  unpublished while a manuscript is under review. So a DOI printed in an accepted paper can
  404 before that paper appears, and from outside that is indistinguishable from a typo.
- **No content typing beyond MIME.** `mimeType` comes from the upload; a `.csv` of anything is
  `text/csv`.

## Try it

Checks the response *shape* and the traps, not just reachability. Every call below is
anonymous — no account, no key — except the last, which asserts the one that is not.

**Data** — four published Dryad deposits, all CC0, all confirmed reachable 2026-08-27:

    https://datadryad.org/api/v2/datasets/doi%3A10.5061%2Fdryad.ttdz08kxq
    https://datadryad.org/api/v2/datasets/doi%3A10.7280%2FD1KS3N
    https://datadryad.org/api/v2/datasets/doi%3A10.5061%2Fdryad.sj3tx964z
    https://datadryad.org/api/v2/datasets/doi%3A10.7941%2FD1SP93

`dryad.ttdz08kxq` is a 2021 Alzheimer's consensus-NMF deposit behind a PLOS ONE paper, and it
is here because it carries `methods`, `usageNotes` and a typed `primary_article` link at once.
The other three are counter-examples: `D1KS3N` is a `10.7280` prefix with an institutional
author and a spatial box, `sj3tx964z` has three published versions, and `D1SP93` has 40 files
and 33.7 GB behind a default page size of 20. Nothing is downloaded — the largest request is
one 100-row file listing.

```python
import json, time, urllib.error, urllib.parse, urllib.request

API = "https://datadryad.org/api/v2"
ENC = lambda doi: urllib.parse.quote(doi, safe="")


def raw(path, **params):
    """Status and body, retrying only the rate limit. 30 anonymous requests a minute."""
    url = f"{API}{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    for _ in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            body = e.read()
            if e.code != 429:
                return e.code, body
            time.sleep(max(2, int(e.headers.get("ratelimit-reset") or 0) - int(time.time()) + 2))
    raise RuntimeError("still rate-limited")


def get(path, **params):
    status, body = raw(path, **params)
    assert status == 200, f"{path} -> {status} {body[:80]}"
    return json.loads(body)


AD = "doi:10.5061/dryad.ttdz08kxq"     # 2021, PLOS ONE, methods + usageNotes + article
BIRDS = "doi:10.7280/D1KS3N"           # 10.7280 prefix, spatial box, institutional author
PLANTS = "doi:10.5061/dryad.sj3tx964z" # three published versions
EM = "doi:10.7941/D1SP93"              # 40 files, 33.7 GB

# 1. THE ENCODING TRAP. The slash is what matters, and a mis-encoded path 404s with an
#    EMPTY body while a DOI that simply is not in Dryad 404s with {"error":"not-found"}.
#    Same status, different meanings — do not collapse them.
assert raw(f"/datasets/{ENC(AD)}")[0] == 200
assert raw("/datasets/doi%3A10.5061/dryad.ttdz08kxq") == (404, b"")
assert raw(f"/datasets/{ENC('doi:10.5061/dryad.zzzzzzzzz')}") == (404, b'{"error":"not-found"}')
# The doi: prefix is optional; the %2F is not.
assert raw(f"/datasets/{ENC('10.5061/dryad.ttdz08kxq')}")[0] == 200

records = {d: get(f"/datasets/{ENC(d)}") for d in (AD, BIRDS, PLANTS, EM)}

# 2. INVARIANT — Dryad's terms make CC0 a condition of deposit, so every record carries it.
for doi, ds in records.items():
    assert ds["license"] == "https://spdx.org/licenses/CC0-1.0.html", (doi, ds["license"])
    assert ds["identifier"] == doi and ds["visibility"] == "public"

# 3. INVARIANT — provenance fields are OMITTED when empty, never null. Indexing throws.
ad = records[AD]
assert "funders" not in ad and "locations" not in ad and "hsiStatement" not in ad
assert "usageNotes" not in records[BIRDS] and "locations" in records[BIRDS]
assert ad.get("methods", "").lstrip().startswith("<"), "methods is HTML, not plain text"

# 4. INVARIANT — the latest published version is the LAST entry, and _links.stash:version
#    is the one-hop shortcut to it. Taking [0] gives you an older version silently.
vs = get(f"/datasets/{ENC(PLANTS)}/versions")["_embedded"]["stash:versions"]
assert [v["publicationDate"] for v in vs] == sorted(v["publicationDate"] for v in vs)
assert vs[-1]["_links"]["self"]["href"] == records[PLANTS]["_links"]["stash:version"]["href"]
assert vs[0]["_links"]["self"]["href"] != records[PLANTS]["_links"]["stash:version"]["href"]

# 5. INVARIANT — storageSize is the sum of the latest version's file sizes, and the file
#    list truncates at per_page=20 while still returning 200 and a full `total`.
vh = records[EM]["_links"]["stash:version"]["href"].replace("/api/v2", "")
short = get(f"{vh}/files")
full = get(f"{vh}/files", per_page=100)
assert short["count"] == 20 < short["total"] == full["count"], (short["count"], short["total"])
assert sum(f["size"] for f in full["_embedded"]["stash:files"]) == records[EM]["storageSize"]

# 6. THE SILENT-FILTER TRAP. /datasets takes six parameters and drops the rest without a
#    word, so an unsupported filter returns the whole repository looking like a result.
everything = get("/datasets", per_page=1)["total"]
assert get("/datasets", q="alzheimer", per_page=1)["total"] == everything
assert get("/search", q="alzheimer", per_page=1)["total"] < everything

# 7. PAPER -> DEPOSIT. relatedId takes the bare DOI. relatedWorkIdentifier is an exact
#    match on a value stored as a full URL, and handing it that URL is a 500.
PAPER = "10.1371/journal.pone.0250278"
hit = get("/search", relatedId=PAPER)
assert hit["total"] == 1
assert hit["_embedded"]["stash:datasets"][0]["identifier"] == AD
assert get("/search", relatedWorkIdentifier=PAPER)["total"] == 0
assert raw("/search", relatedWorkIdentifier=f"https://doi.org/{PAPER}")[0] == 500

# 8. Bytes need an account. Metadata above needed none; this is the line.
fid = full["_embedded"]["stash:files"][0]["_links"]["self"]["href"].rsplit("/", 1)[-1]
assert raw(f"/files/{fid}/download")[0] == 401

print("invariants hold\n")
print(f"{'dataset':<28} {'published':<11} {'ver':>3} {'files':>6} {'bytes':>16}  provenance")
for doi, ds in records.items():
    vhref = ds["_links"]["stash:version"]["href"].replace("/api/v2", "")
    n = get(f"{vhref}/files", per_page=100)["total"]
    have = [k for k in ("methods", "usageNotes", "funders", "locations",
                        "hsiStatement", "relatedWorks") if ds.get(k)]
    print(f"{doi:<28} {ds['publicationDate']:<11} {ds['versionNumber']:>3} {n:>6} "
          f"{ds['storageSize']:>16,}  {', '.join(have) or '-'}")
print()
print("observed 2026-08-27")
print(f"  datasets in Dryad            {everything:,}")
print(f"  q=alzheimer via /search      {get('/search', q='alzheimer', per_page=1)['total']}")
print(f"  published versions of PLANTS {[v['versionNumber'] for v in vs]}")
```

**Expect.** The assertions are invariants — a failure means this page is wrong, not that
upstream moved. CC0 on every record, provenance fields absent rather than null, the latest
version last, `storageSize` equal to the summed file sizes, the default page short of `total`,
`/datasets` ignoring unsupported filters, `relatedId` resolving a paper to its deposit, and a
`401` on the byte route.

The last of those is the one to read carefully if it ever fails. A `200` there would not be a
bug in this page's mechanics — it would mean Dryad reopened anonymous downloads, and the
account requirement stated above and in `access:` has to come back out.

The printed figures are **observed values, dated 2026-08-27 against API v2.1.0**. They move
when Dryad ingests, and a mismatch is drift to investigate rather than a break — the repository
total and the `alzheimer` hit count grow, and `ver`, `files` and `bytes` change if a depositor
publishes a new version.

```
invariants hold

dataset                      published   ver  files            bytes  provenance
doi:10.5061/dryad.ttdz08kxq  2021-04-22    9      3       10,047,907  methods, usageNotes, relatedWorks
doi:10.7280/D1KS3N           2015-04-15    1      1              526  methods, funders, locations, relatedWorks
doi:10.5061/dryad.sj3tx964z  2022-11-23    4      1      137,594,242  methods, usageNotes, funders, relatedWorks
doi:10.7941/D1SP93           2023-07-31    5     40   33,690,074,287  methods, usageNotes, funders, relatedWorks

observed 2026-08-27
  datasets in Dryad            72,079
  q=alzheimer via /search      220
  published versions of PLANTS [2, 3, 4]
```

## Sources

- Dryad API, `https://datadryad.org/api` — the OpenAPI document at
  `https://datadryad.org/openapi.yml` is the authoritative parameter list, and it is where the
  six-parameter `/datasets` surface and the `bearerAuth` requirement on all three download
  routes are stated.
- Dryad Terms of Service, `https://datadryad.org/terms` — the CC0 deposit condition.
- Dryad help, `https://datadryad.org/help/account/management` — API accounts, tokens and the
  account rate multiplier.
- API and account documentation in the `datadryad/dryad-app` repository under
  `documentation/apis/`.

All figures on this page were measured live on 2026-08-27 against API v2.1.0.
