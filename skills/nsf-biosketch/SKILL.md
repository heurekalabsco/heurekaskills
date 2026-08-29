---
name: nsf-biosketch
description: Stage NSF's Biographical Sketch Common Form for one senior person in SciENcv's own entry order and audit the open record behind their ORCID iD — products deduplicated across Crossref and DataCite so software and datasets are counted, ranked against the proposed project, plus a summary naming every field only the researcher can supply. SciENcv generates the PDF; this does not.
category: grants
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [nsf, grants, compliance, bibliometrics]
covers: [biosketch, biographical sketch, sciencv, nsf, common form, nstc, senior personnel documents, pappg, professional preparation, appointments and positions, products, orcid, crossref, datacite, zenodo, figshare, software citation, dataset citation, preprint, research.gov, grants.gov, certification, malign foreign talent recruitment program, proposal submission]
papers: []
access: [open]
datasets: [https://api.crossref.org/works/10.1093/gigascience/giy158, https://api.datacite.org/dois/10.5281/zenodo.595354, https://api.nsf.gov/services/v1/awards/2018911.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: PAPPG 24-1 II.D.2.h(i) effective 2024-05-20 with supplements NSF 26-200 and NSF 26-202 / NSF senior personnel documents page updated 2026-04-13 / Crossref REST API / DataCite REST API / NSF Award Search API v1 / Python 3.12.8 / requests 2.34.2
  executed: 10
  unverified: 0
---
# NSF Biographical Sketch

Every senior person on an NSF proposal files one, and **NSF accepts exactly one artefact —
the PDF that SciENcv generates.** There is no template to fill in and no file to upload.
SciENcv has an XML ingest path, and it covers Current and Pending (Other) Support only; the
biographical sketch has none. So no skill can hand you a finished biographical sketch, and
this page does not pretend otherwise.

What it can do is everything upstream of the portal, which is where the work actually is.
SciENcv's one machine input for this document is a linked ORCID record, almost nobody's
record is in a state where that import lands clean, and a correction made inside SciENcv is
spent on one document while the same correction made in ORCID persists into every future one.
So this page audits the open record behind your ORCID iD, assembles the products list —
the section people get most wrong — and stages every section in the order SciENcv asks for
them, so the portal session is transcription rather than authoring.

Two outputs, and the split between them matters. `NSF-biosketch-sections.md` is the sections
and nothing else — no placeholders, no notes, and a field it cannot answer is genuinely
empty. `NSF-biosketch-summary.md` is everything you need to know *about* them, including
every blank and why it is blank. **You certify the sketch, always.** The certification is a
legal statement under your name and it is made inside SciENcv.

## What NSF requires, and when it was checked

Checked 2026-08-28. **PAPPG 24-1** (effective 2024-05-20) is in force, supplemented by
**NSF 26-200** (effective 2025-12-08) and **NSF 26-202** (effective 2026-01-22). The
biographical sketch sits at **PAPPG II.D.2.h(i)**, and NSF describes those instructions as
"NSF's implementation of the Biographical Sketch Common Form developed by the National
Science and Technology Council's Research Security Subcommittee". NSF's
senior-personnel-documents page was last updated 2026-04-13. NSF is consulting on a
replacement called *Guidance on Financial Assistance*; when it lands, re-check every date
here.

Two things about the current text that most secondary guidance still gets wrong:

- **There is no page limit.** PAPPG says "Except where noted below, there is no page or
  character limit to this section of the proposal". The old three-page biographical sketch
  is gone, and so is the two-page one before it. What *is* limited is the product list.
- **Synergistic activities are not in the biographical sketch.** NSF removed them on
  2024-05-20. They are now a separate one-page document of up to five distinct examples,
  submitted as a PDF through Research.gov or Grants.gov, and they are not produced here. A
  proposer whose last submission predates that date will look for them in this document and
  will not find them.

## The six blocks, in SciENcv's order

| # | Block | What it holds |
|---|---|---|
| 1 | Identifying Information | name, ORCID iD (optional), position title |
| 2 | Organization and Location | primary organization; City, State/Province, Country |
| 3 | Professional Preparation | education and training, reverse chronological **by start date** |
| 4 | Appointments and Positions | reverse chronological by start date, current first |
| 5 | Products | up to five related to the proposal, up to five other significant |
| 6 | Certification | two statements, a signature, and a date |

Everything except the ORCID iD is required.

**Section 3 wants more than degrees.** All postdoctoral and fellowship training, listed
separately, plus the baccalaureate or other initial professional education. Each entry
carries the organization, its City / State/Province / Country, the degree if there is one,
the **start date** of the degree or fellowship, the month and year it was received or is
expected, and the field of study.

**Section 4 is broader than employment, and narrower in time than people expect.** It covers
"any titled academic, professional, or institutional position whether or not remuneration is
received, and whether full-time, part-time, or voluntary (including adjunct, visiting, or
honorary)" — the unpaid affiliations and the position at the company you founded belong here
for the same reason they belong on a conflicts disclosure. But senior personnel "must only
identify all domestic and foreign professional appointments and positions outside of the
primary organization for a period of up to three years from the date the proposer submits the
proposal". Dates are years, `YYYY` to `YYYY`, not months.

**Section 5 is the one to get right.**

- Five products "most closely related to the proposed project", then up to five "other
  significant products, whether or not related". **"Only the list of ten will be used in the
  review of the proposal."** An eleventh is invisible.
- The selection rule for the first five is **relevance to the proposed work**, not recency
  and not impact.
- **Products are not publications.** NSF's own list runs to websites, technologies or
  techniques, inventions, patents, patent applications and licenses, data, databases,
  datasets, physical collections, audio or video products, software, models, educational aids
  or curricula, instruments or equipment, research material, interventions, and new business
  creation. The under-reporting here is systematic, because the nearest thing to hand is a
  CV's publication list and a CV has none of those.
- Every product must be **citable and accessible**, with full citation information — authors,
  title, date of publication or release, website URL, other persistent identifier if there is
  one, and other relevant citation information. Long bylines may list one or more authors
  followed by "et al".
- **"If any of the items specified above is not applicable, enter `N/A`."** That is NSF asking
  for a specific value in a field that does not apply, and it is not the same thing as a field
  nobody knows the answer to. The code below writes `N/A` only in the first case.

**Section 6 is yours alone.** Two certifications — that the information is current, accurate
and complete, and that at the time of submission you are not a party in a malign foreign
talent recruitment program — then a signature and a date, and the date must be **within the
past 12 months** of submission. Nothing on this page ticks either box.

Two smaller rules that catch people: NSF asks that **no personal information** appear in the
sketch — home address, home phone, marital status, hobbies — and biographical information for
*other* personnel (postdocs, other professionals, students) is freeform, uploaded separately
as Other Supplementary Documents rather than through SciENcv.

## Why ORCID's own API is not used here

The audit this page performs is an audit of the record behind your ORCID iD, and it does it
without calling ORCID.

ORCID's Public APIs Terms of Service (last updated 23 October 2024) grant "a limited
royalty-free license to make **non-commercial** use of the Public APIs", and define
non-commercial to exclude use "in connection with any revenue-generating product or service".
A researcher at a company, or anyone whose work is commercial, has no lawful route through
that door, and causing an agent to call an API is the whole function of a skill. So this page
does not send anyone down it.

What is used instead, and what each can and cannot answer:

- **The ORCID iD itself** is an identifier, and using it as a query value carries none of
  those terms. It is what Crossref and DataCite are filtered on below, and NSF's own form has
  a field for it.
- **Crossref and DataCite** hold the *publisher and repository* side of your record — what
  was deposited about your work, and whether your iD was deposited with it. That is enough to
  find duplicate products, preprint-and-published pairs, version chains, products with no
  persistent identifier, and the software and data a publication list omits.
- **Your own ORCID record** holds the parts no third party deposits — employment entries,
  their end dates and organization identifiers, education, and works you claimed by hand. None
  of that is visible from outside, and this page does not guess at it. If you want to read it
  yourself, ORCID's account settings have an *Account actions → Download all my data* button
  that returns a ZIP of XML per record section. That is your own data through your own login,
  and it is the only complete answer to "what will SciENcv import".

So the honest statement of scope: this audits **what the open record will hand SciENcv about
your products**, and it reports **what only your ORCID record can answer**. It does not open
SciENcv, and SciENcv's importer sits behind a login, so no claim here about what that importer
does on a given entry has been tested against it.

## What you need

Python 3.9+ and `requests`. **No API key and no account for any of the three sources**, and
nothing here needs your ORCID password. You do need your **ORCID iD** — the code refuses to
run without one, because a name alone cannot tell your products from a namesake's.

| source | what it gives | licence |
|---|---|---|
| [Crossref REST API](https://api.crossref.org) | articles, conference papers, preprints, with `given` and `family` kept apart | "almost none of the metadata is subject to copyright, and you may use it for any purpose"; no sign-up |
| [DataCite REST API](https://api.datacite.org) | software, datasets, posters, images — the products a publication list omits | metadata waived to the public domain under CC0 |
| [NSF Award Search](https://api.nsf.gov/services/v1/awards/2018911.json) | a public project description, used below as a stand-in for your own | US Government work, not subject to domestic copyright |

```bash
python3 -m venv .venv
.venv/bin/pip install requests
```

Save each block below as the file named in its first line and run them in order. Set the
subject once — the given name should be spelled the way your papers are bylined, not
necessarily the way your passport is:

```bash
export BIO_ORCID="0000-0001-6001-2677" BIO_FAMILY="Brown" BIO_GIVEN="C. Titus"
export BIO_ASOF="2026-08-28"        # omit to use today
```

One optional input, and it decides whether section 5(i) fills in at all — put the proposal's
Project Summary, or its specific aims, in a plain-text file called `bio_aims.txt` beside the
scripts. Without it the five "most closely related" slots stay empty, because relevance to the
proposed work is the rule NSF states and no publication record knows what you are proposing.

## Harvest the products

Three things here are not what they look like, and each one was found by comparing what the
services returned against what their documentation implies.

- **DataCite stores an ORCID iD in two different forms.** `https://orcid.org/0000-…` and the
  bare `0000-…`, and an exact-phrase query on one silently misses the other. On the worked
  example the URL form returns **139** records and the bare form **38**, with no overlap. The
  wildcard returns their union. The record the URL-form query misses includes the Zenodo
  concept DOI for the subject's main piece of software, which is exactly the DOI a
  biographical sketch should cite.
- **A person is sometimes a contributor rather than a creator** — a curated dataset, a
  supervised deposit. Two more records on the worked example, and NSF counts them.
- **`authenticated-orcid` is usually false.** Crossref carries a flag saying whether ORCID
  itself vouched for the iD on a deposit. It is `true` on 5 of the subject's 60 works; on the
  other 55 a publisher typed the iD into the metadata and nobody verified it. It is still the
  identifier that found the work — but it is not evidence that ORCID knows about the work.

```python
# bio_harvest.py -- every citable product the open record knows about, in one file.
import json, os, re, sys, time, unicodedata, requests

ORCID = os.environ.get("BIO_ORCID", "").strip()
FAMILY = os.environ.get("BIO_FAMILY", "").strip()
GIVEN  = os.environ.get("BIO_GIVEN", "").strip()
MAX_SCAN = int(os.environ.get("BIO_MAX_SCAN", 4000))
MAILTO = os.environ.get("BIO_MAILTO", "")

if not re.fullmatch(r"\d{4}-\d{4}-\d{4}-\d{3}[\dX]", ORCID):
    sys.exit("BIO_ORCID must be a bare 16-digit ORCID iD, e.g. 0000-0001-6001-2677. "
             "SciENcv's only machine import for the biographical sketch is ORCID, and "
             "without the iD there is no way to tell your products from a namesake's.")

S = requests.Session()
S.headers["User-Agent"] = f"nsf-biosketch/1.0 (https://heurekaskills.com{'; mailto:' + MAILTO if MAILTO else ''})"

def get(url, **params):
    for attempt in range(5):          # both services intermittently serve an HTML error page
        r = S.get(url, params=params or None, timeout=90)
        if r.ok and "json" in (r.headers.get("content-type") or ""):
            return r.json()
        time.sleep(2 * (attempt + 1))
    sys.exit(f"{url} did not return JSON after 5 tries: {r.status_code} {r.text[:120]}")

def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^a-z]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())

# ---- Crossref: journal articles, conference papers, preprints, book chapters ---------------
cross, cur = {}, "*"
while cur:
    m = get("https://api.crossref.org/works", filter=f"orcid:{ORCID}", rows=200, cursor=cur)["message"]
    for it in m["items"]:
        cross[it["DOI"].lower()] = it
    cur = m.get("next-cursor") if m["items"] else None

# 'authenticated-orcid' says ORCID itself vouched for the iD in this deposit. It is usually
# false: the publisher typed the iD into the metadata and nobody verified it.
authed = sum(1 for it in cross.values() for a in (it.get("author") or [])
             if ORCID in (a.get("ORCID") or "") and a.get("authenticated-orcid") is True)

# ---- DataCite: software, datasets, and everything a publication list omits -----------------
# DataCite stores an ORCID iD in two forms -- 'https://orcid.org/0000-...' and the bare iD --
# and an exact-phrase query on one of them silently misses the other. On the worked example
# the URL form returns 139 records and the bare form 38, with no overlap; the wildcard
# returns their union. A person is also sometimes a contributor rather than a creator.
data = {}
for field in ("creators", "contributors"):
    page = 1
    while True:
        j = get("https://api.datacite.org/dois",
                **{"query": f"{field}.nameIdentifiers.nameIdentifier:*{ORCID}*",
                   "page[size]": 200, "page[number]": page})
        for x in j["data"]:
            data.setdefault(x["id"].lower(), x["attributes"])
        if page >= j["meta"]["totalPages"] or page >= 20: break
        page += 1

# ---- How much of the open record is NOT linked to the iD ----------------------------------
# A measurement, not a source of products: nothing found this way is added to the list. It
# answers one question -- how much hand-claiming your ORCID record still needs.
def gtoks(s): return [t for t in re.split(r"[\s.\-]+", fold(s)) if t]

def same_person(given):
    """Token-compatible AND sharing one spelled-out token. 'C. Titus' matches 'C Titus'
    and 'C. T.'; it does not match 'Thomas', and 'T.' alone is not evidence."""
    a, me = gtoks(given), gtoks(GIVEN)
    if not a or not me: return False
    for i in range(min(len(a), len(me))):
        if not (a[i].startswith(me[i]) or me[i].startswith(a[i])): return False
    return any(len(t) > 1 and t in me for t in a)

# Ask how big the answer is before paging through it. A scan that cannot complete produces
# a floor of unknown depth, which is not reported -- so deep-paging 475,000 'Brown' records
# to throw the number away costs twenty minutes and buys nothing.
scanned = total = 0; unlinked = []
if FAMILY and GIVEN:
    total = get("https://api.crossref.org/works", **{"query.author": FAMILY, "rows": 0})["message"]["total-results"]
if FAMILY and GIVEN and total <= MAX_SCAN:
    cur = "*"
    while cur:
        m = get("https://api.crossref.org/works", **{"query.author": FAMILY, "rows": 200, "cursor": cur})["message"]
        if not m["items"]: break
        for it in m["items"]:
            if it["DOI"].lower() in cross: continue
            for a in it.get("author") or []:
                if fold(a.get("family")) == fold(FAMILY) and same_person(a.get("given")):
                    unlinked.append({"doi": it["DOI"].lower(), "type": it.get("type"),
                                     "title": (it.get("title") or [""])[0][:120],
                                     "given": a.get("given")})
                    break
        scanned += len(m["items"]); cur = m.get("next-cursor")
        if not cur or scanned >= MAX_SCAN: break
overflow = scanned < total
if overflow: unlinked = []      # the count would be a floor of unknown depth. Say so instead.

json.dump({"orcid": ORCID, "family": FAMILY, "given": GIVEN,
           "crossref": cross, "datacite": data,
           "authenticated": authed, "unlinked": unlinked,
           "scan": {"scanned": scanned, "total": total, "overflow": overflow}},
          open("bio_works.json", "w"), ensure_ascii=False)

print(f"ORCID iD             {ORCID}")
print(f"Crossref works       {len(cross)}   carrying the iD; {authed} of them authenticated by ORCID")
print(f"DataCite records     {len(data)}")
print(f"surname scan         {scanned} of {total} works matching {FAMILY!r}")
if overflow:
    print(f"  {FAMILY!r} is too common to enumerate, so the unlinked count is not reported.")
    print(f"  Read it off your own ORCID record instead -- it is the only complete source.")
else:
    print(f"  in the open record, not linked to your iD   {len(unlinked)}")
```

The surname scan is a measurement and nothing else, and the code asks how big the answer is
before paging through it. For a rare surname it completes and the number is worth having:
*Martonosi* returns 533 works, 264 of them hers, and **16 carry her ORCID iD**. Everything
else reaches SciENcv only if her ORCID record claims it by hand. For *Brown*, which matches
475,123 works, the scan could never complete, so it is not started and no number is reported —
deep-paging a quarter of a million records to throw the result away costs twenty minutes and
buys nothing.

## Audit the record

This is the part that saves the SciENcv session. Every finding below becomes a hand
correction inside the portal if it is not fixed in ORCID first.

**Duplicates arrive from three directions**, and they are different problems:

- A repository mints one DOI per release **plus** a concept DOI for the software as a whole.
  The releases carry `IsVersionOf` pointing at the concept DOI and the concept DOI carries
  `HasVersion`. On the worked example, 15 products account for 72 DOIs.
- The same deposit is cross-posted to two repositories and marked `IsIdenticalTo`. 30 pairs
  on the worked example.
- The same title is deposited twice with no relation between them at all.

**A preprint and its published version need two detectors, and neither is sufficient alone.**
Crossref's `relation` field carries `has-preprint` and `is-preprint-of`; matching normalised
titles catches pairs where no relation was deposited. On the worked example the relation
field found 7 pairs, titles found 6, and only 5 were found by both — one pair had been
retitled between preprint and publication, and one had no relation deposited. Worse, **the
link lives on the article, not on the preprint**: both bioRxiv preprints staged in the
worked example carry an empty `relation` object, so a preprint whose published version is
outside your linked record is indistinguishable from a preprint that was never published.

```python
# bio_audit.py -- what the open record will hand SciENcv, and what it will not.
import json, re, unicodedata, collections

W = json.load(open("bio_works.json"))
CR, DC = W["crossref"], W["datacite"]

def norm(t):
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", t.lower())

def cr_title(i): return (i.get("title") or [""])[0]
def dc_title(a): return ((a.get("titles") or [{}])[0] or {}).get("title", "")

def cr_date(i):
    """NSF wants the date of publication or release. 'published' is that date. 'created' is
    the first deposit and 'indexed' is when Crossref last touched the record; both move."""
    dp = ((i.get("published") or {}).get("date-parts") or [[]])[0]
    return "-".join(f"{p:02d}" if n else str(p) for n, p in enumerate(dp)) if dp else ""

def dc_date(a):
    for d in a.get("dates") or []:
        if d.get("dateType") == "Issued": return str(d.get("date"))
    return str(a.get("publicationYear") or "")

# ---- 1. duplicates ------------------------------------------------------------------------
# DataCite deposits one DOI per release plus a concept DOI for the software as a whole. The
# concept DOI carries 'HasVersion'; each release carries 'IsVersionOf' pointing back at it.
concept, versions = {}, collections.defaultdict(list)
for doi, a in DC.items():
    for r in a.get("relatedIdentifiers") or []:
        rid = (r.get("relatedIdentifier") or "").lower().replace("https://doi.org/", "")
        if r.get("relationType") == "IsVersionOf" and rid:
            versions[rid].append(doi); concept[doi] = rid
        elif r.get("relationType") == "HasVersion" and rid:
            versions[doi].append(rid)
chains = {c: sorted({v for v in vs if v in DC}) for c, vs in versions.items()}
chains = {c: v for c, v in chains.items() if len(v) > 1 or (c in DC and v)}

identical = collections.defaultdict(set)
for doi, a in DC.items():
    for r in a.get("relatedIdentifiers") or []:
        if r.get("relationType") == "IsIdenticalTo":
            rid = (r.get("relatedIdentifier") or "").lower().replace("https://doi.org/", "")
            if rid in DC: identical[min(doi, rid)].add(max(doi, rid))

titles = collections.defaultdict(list)
for doi, i in CR.items(): titles[norm(cr_title(i))].append(("crossref", doi, i.get("type")))
for doi, a in DC.items():
    titles[norm(dc_title(a))].append(("datacite", doi, (a.get("types") or {}).get("resourceTypeGeneral")))
title_dupes = {k: v for k, v in titles.items() if k and len(v) > 1}

# ---- 2. preprint and published, arriving as two products ----------------------------------
by_relation, by_title = set(), set()
for doi, i in CR.items():
    for rel, vs in (i.get("relation") or {}).items():
        if rel not in ("has-preprint", "is-preprint-of"): continue
        for v in vs:
            other = (v.get("id") or "").lower().replace("https://doi.org/", "")
            if other in CR:
                pub, pre = (doi, other) if rel == "has-preprint" else (other, doi)
                by_relation.add((pub, pre))
for k, v in title_dupes.items():
    pre = [d for s, d, t in v if t in ("posted-content", "Preprint")]
    pub = [d for s, d, t in v if t in ("journal-article", "proceedings-article", "JournalArticle")]
    for a in pub:
        for b in pre: by_title.add((a, b))
pairs = by_relation | by_title

# ---- 3. citable and accessible ------------------------------------------------------------
no_url = [d for d, i in CR.items() if not i.get("URL")] + [d for d, a in DC.items() if not a.get("url")]
no_container = [d for d, i in CR.items()
                if i.get("type") in ("journal-article", "proceedings-article")
                and not (i.get("container-title") or [""])[0]]
no_authors = ([d for d, i in CR.items() if not (i.get("author") or [])]
              + [d for d, a in DC.items() if not (a.get("creators") or [])])
no_date = [d for d, i in CR.items() if not cr_date(i)] + [d for d, a in DC.items() if not dc_date(a)]

# 'Issued' is the release date and 'registered' is when the DOI was minted. They are years
# apart whenever a repository re-archives an old release, so the record's own age says nothing
# about the product's age -- and a naive newest-first sort on 'registered' reorders history.
late = [(d, dc_date(a), (a.get("registered") or "")[:10]) for d, a in DC.items()
        if dc_date(a)[:4].isdigit() and (a.get("registered") or "")[:4].isdigit()
        and int(a["registered"][:4]) - int(dc_date(a)[:4]) >= 1]

# ---- 4. what a publication list would have missed ------------------------------------------
cr_types = collections.Counter(i.get("type") for i in CR.values())
dc_types = collections.Counter((a.get("types") or {}).get("resourceTypeGeneral") for a in DC.values())
PAPERISH = {"journal-article", "proceedings-article", "book-chapter", "JournalArticle",
            "ConferencePaper", "BookChapter", "Book", "Text"}
nonpaper = sum(n for t, n in dc_types.items() if t not in PAPERISH)

out = {"chains": chains, "identical": {k: sorted(v) for k, v in identical.items()},
       "title_dupes": {k: v for k, v in title_dupes.items()},
       "pairs_relation": sorted(by_relation), "pairs_title": sorted(by_title),
       "pairs": sorted(pairs), "no_url": no_url, "no_container": no_container,
       "no_authors": no_authors, "no_date": no_date, "late_register": late,
       "cr_types": dict(cr_types), "dc_types": dict(dc_types), "nonpaper": nonpaper}
json.dump(out, open("bio_audit.json", "w"), ensure_ascii=False)

print(f"records in            Crossref {len(CR)}   DataCite {len(DC)}")
print(f"ORCID iD authenticated by ORCID on {W['authenticated']} of {len(CR)} Crossref deposits;"
      f" on the rest a publisher typed it in")
if W["scan"]["overflow"]:
    print(f"open-record gap       not measurable -- {W['family']!r} matches {W['scan']['total']} works")
else:
    print(f"open-record gap       {len(W['unlinked'])} work(s) look like yours and do not carry your iD")
print()
print(f"version chains        {len(chains)} product(s) deposited as {sum(len(v) for v in chains.values())} DOIs")
print(f"cross-posted copies   {len(identical)} pair(s) marked IsIdenticalTo")
print(f"same title, 2+ DOIs   {len(title_dupes)}")
print(f"preprint/published    {len(pairs)} pair(s): {len(by_relation)} found by Crossref's relation "
      f"field, {len(by_title)} by matching titles, {len(by_relation & by_title)} by both")
print()
print(f"products missing a URL          {len(no_url)}")
print(f"articles missing a journal name {len(no_container)}")
print(f"records missing an author list  {len(no_authors)}")
print(f"records missing a date          {len(no_date)}")
print(f"DOI minted a year or more after the release it describes  {len(late)}")
print()
print(f"Crossref types  {dict(cr_types)}")
print(f"DataCite types  {dict(dc_types)}")
print(f"{nonpaper} of {len(DC)} DataCite records are not papers -- software, data, images, "
      f"collections. A CV's publication list has none of them.")
```

## One row per product

Merging is where a products list goes wrong in both directions. Under-merge and one piece of
software fills the list on its own — *sourmash* is 57 DOIs on the worked example; over-merge
and you lose a paper you were entitled to list.

The rule that matters most is the second one. On the worked example, a naive union over
matching titles collapsed **two separate peer-reviewed papers** — one announcing a tool in
2016 and one announcing its next major version in 2024 — into a single product, because the
release DOIs between them share a title with each. So nothing here merges two articles on a
title match; only an explicit `IsIdenticalTo` or a preprint relation can do that.

The other judgement worth stating: **a dataset or a piece of software deposited alongside a
paper stays a separate product.** NSF lists both in their own right, and folding them into
the article is exactly the under-reporting this section exists to prevent.

```python
# bio_select.py -- one row per product, then the ten NSF will read.
import html, json, math, os, re, unicodedata, collections

W  = json.load(open("bio_works.json"))
AU = json.load(open("bio_audit.json"))
CR, DC = W["crossref"], W["datacite"]
AIMS = open("bio_aims.txt").read() if os.path.exists("bio_aims.txt") else ""

def tidy(s):
    """Crossref deposits JATS markup inside titles and abstracts, and publishers deposit
    non-breaking and thin spaces inside names. Neither belongs in a federal document."""
    s = html.unescape(re.sub(r"<[^>]{0,80}>", "", str(s or "")))
    s = unicodedata.normalize("NFC", s).replace("\u00a0", " ").replace("\u2009", " ").replace("\u202f", " ")
    return re.sub(r"\s+", " ", s).strip(" ,;")
def norm(t):
    t = unicodedata.normalize("NFKD", t or "")
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in t if not unicodedata.combining(c)).lower())

# NSF: "names of authors; product title; date of publication or release; website URL; other
# persistent identifier (if available); and other relevant citation information".
def cr_person(a):
    if a.get("name") and not a.get("family"): return tidy(a["name"])      # a consortium
    return tidy(f'{tidy(a.get("family"))}, {tidy(a.get("given"))}').strip(", ")
def dc_person(c):
    n = tidy(c.get("familyName")) and f'{tidy(c.get("familyName"))}, {tidy(c.get("givenName"))}'
    return (n or tidy(c.get("name"))).strip(", ")

def cr_date(i):
    dp = ((i.get("published") or {}).get("date-parts") or [[]])[0]
    return "-".join([str(dp[0])] + [f"{p:02d}" for p in dp[1:]]) if dp else ""
def dc_date(a):
    for d in a.get("dates") or []:
        if d.get("dateType") == "Issued": return str(d.get("date"))
    return str(a.get("publicationYear") or "")

prod = {}
for d, i in CR.items():
    prod[d] = {"doi": d, "src": "crossref", "kind": i.get("type"),
               "title": tidy((i.get("title") or [""])[0]),
               "authors": [cr_person(a) for a in (i.get("author") or [])],
               "date": cr_date(i), "url": i.get("URL") or f"https://doi.org/{d}",
               "container": tidy((i.get("container-title") or [""])[0]),
               "vol": tidy(i.get("volume")), "issue": tidy(i.get("issue")),
               "pages": tidy(i.get("page")), "publisher": tidy(i.get("publisher")),
               "version": "", "abstract": re.sub(r"<[^>]+>", " ", i.get("abstract") or "")}
for d, a in DC.items():
    prod[d] = {"doi": d, "src": "datacite",
               "kind": (a.get("types") or {}).get("resourceTypeGeneral"),
               "title": tidy(((a.get("titles") or [{}])[0] or {}).get("title")),
               "authors": [dc_person(c) for c in (a.get("creators") or [])],
               "date": dc_date(a), "url": a.get("url") or f"https://doi.org/{d}",
               "container": tidy(a.get("publisher") if isinstance(a.get("publisher"), str)
                                 else (a.get("publisher") or {}).get("name")),
               "vol": "", "issue": "", "pages": "", "publisher": "",
               "version": tidy(a.get("version")),
               "abstract": " ".join(tidy(x.get("description")) for x in (a.get("descriptions") or [])
                                    if x.get("descriptionType") == "Abstract")}

# ---- collapse to one row per product ------------------------------------------------------
# Four merges, in decreasing order of how much the record actually asserts. Nothing merges two
# peer-reviewed articles on a title match: an early paper announcing a tool and a later one
# announcing its next major version share a title through the release DOIs in between, and
# collapsing them costs the reader a product they are entitled to list.
ARTICLE = {"journal-article", "proceedings-article", "JournalArticle", "ConferencePaper"}
COPY    = {"Text", "Preprint", "posted-content", "Report", "Other"}
PREPRINT = {"Preprint", "posted-content"}

parent = {d: d for d in prod}
def find(x):
    while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
    return x
def articles(root): return {d for d in prod if find(d) == root and prod[d]["kind"] in ARTICLE}
def union(a, b, guard=True):
    if a not in parent or b not in parent: return
    ra, rb = find(a), find(b)
    if ra == rb: return
    # Two distinct articles in one group means the merge went too far.
    if guard and len({prod[d]["title"].lower() for d in articles(ra) | articles(rb)}) > 1: return
    parent[ra] = rb

# 1. a repository's own version chain: many release DOIs, one product.
for concept, versions in AU["chains"].items():
    for v in versions: union(v, concept, guard=False)
# 2. the same deposit under two DOIs, asserted by the depositor.
for a, bs in AU["identical"].items():
    for b in bs: union(a, b, guard=False)
# 3. figshare and Zenodo mint '10.x/y.v2' beside '10.x/y'. Same product, two identifiers.
stem = collections.defaultdict(list)
for d in prod: stem[re.sub(r"\.v\d+$", "", d)].append(d)
for members in stem.values():
    for m in members[1:]: union(m, members[0], guard=False)
# 4. preprint and published version, and mirror copies of an article. A dataset or a piece of
#    software deposited alongside a paper is NOT merged into it -- NSF counts those separately.
for pub, pre in AU["pairs"]: union(pre, pub)
for group in AU["title_dupes"].values():
    art = [d for _, d, k in group if k in ARTICLE]
    if len(art) != 1: continue
    for _, d, k in group:
        if k in COPY or k in PREPRINT: union(d, art[0])

# The row that survives is the version of record: the published article over its preprint, the
# concept DOI over a single release, and the fullest metadata over the sparsest.
RANK = {"journal-article": 0, "proceedings-article": 1, "JournalArticle": 1, "ConferencePaper": 1,
        "book-chapter": 2, "Book": 2, "BookChapter": 2, "Software": 3, "Dataset": 3,
        "Collection": 4, "Image": 4, "InteractiveResource": 4, "Audiovisual": 4,
        "Poster": 5, "Presentation": 5, "Report": 5, "Dissertation": 5, "Text": 6,
        "Preprint": 8, "posted-content": 9}
def quality(d):
    p = prod[d]
    return (RANK.get(p["kind"], 7),                 # the article outranks its preprint
            0 if d in AU["chains"] else 1,          # the concept DOI outranks its releases
            -len(p["authors"]), -len(p["title"]), p["doi"])

groups = collections.defaultdict(list)
for d in prod: groups[find(d)].append(d)
rows = []
for g, members in groups.items():
    # '10.x/y.v2' is a snapshot of '10.x/y'. Where both are here the unversioned DOI is the
    # citable one, and the versioned record's own type metadata is not always the same.
    ms = set(members)
    cand = [d for d in members if not (re.search(r"\.v\d+$", d) and re.sub(r"\.v\d+$", "", d) in ms)]
    keep = sorted(cand or members, key=quality)[0]
    r = dict(prod[keep]); r["merged"] = sorted(set(members) - {keep})
    rows.append(r)
rows.sort(key=lambda r: (r["date"] or "0000"), reverse=True)

# ---- rank against the proposed project, if the reader supplied it -------------------------
# A relevance proposal, not a decision. It is a bag-of-words overlap with the reader's own
# project description, deliberately simple so the reader can see why a product scored.
STOP = set("""about above after again against all also although always among another any are
because been before being below best better between both but came can cannot come common
could current currently described despite did different does done down due during each
either else enough especially etc even every example examples existing first following found
from further generally get given gives goal goals had has have having here high higher how
however important include included includes including into its itself just key large larger
likely made main make makes many may more moreover most much must need needed needs new next
non not novel now number often once one only other others our out over own particular
particularly per perhaps possible potential provide provides rather really recent recently
result results same second see seen several should shown similar since some specific still
such take taken than that the their them then there therefore these they this those three
through thus time two under until upon use used useful uses using usually various very via
was way well were what when where whether which while who whom whose why will with within
without work works would yet approach approaches based method methods study studies research
project proposed propose support submitted called ability able""".split())
def toks(s): return [t for t in re.findall(r"[a-z][a-z-]{3,}", (s or "").lower()) if t not in STOP]

ranked, scored = [], False
if AIMS.strip():
    scored = True
    docs = {r["doi"]: collections.Counter(toks(r["title"] + " " + r["abstract"] + " " + r["container"]))
            for r in rows}
    df = collections.Counter(t for c in docs.values() for t in c)
    N = max(len(docs), 1)
    aim = collections.Counter(t for t in toks(AIMS) if df[t] <= 0.3 * N)
    for r in rows:
        c = docs[r["doi"]]
        s = sum(math.log(1 + N / (1 + df[t])) * min(aim[t], 3) for t in c if t in aim)
        r["score"] = round(s / math.sqrt(sum(c.values()) or 1), 3)
        # Rarest shared terms first, ties broken alphabetically so the same run twice
        # prints the same line -- set iteration order is not stable between processes.
        r["hits"] = sorted({t for t in c if t in aim}, key=lambda t: (df[t], t))[:6]
    ranked = sorted(rows, key=lambda r: -r["score"])

related = [r["doi"] for r in ranked[:5]] if scored else []
# "Up to five other significant products, whether or not related to the proposed project."
# Significance is the reader's judgement, so this proposes nothing and leaves the slot empty.
other = []

json.dump({"rows": rows, "related": related, "other": other, "scored": scored,
           "aims_chars": len(AIMS.strip())}, open("bio_selected.json", "w"), ensure_ascii=False)

print(f"records harvested     {len(prod)}")
print(f"distinct products     {len(rows)}   ({len(prod) - len(rows)} rows collapsed)")
by = collections.Counter(r["kind"] for r in rows)
print(f"by kind               {dict(by.most_common())}")
if scored:
    print(f"\nranked against bio_aims.txt ({len(AIMS.strip())} characters). Top 8:")
    for r in ranked[:8]:
        print(f"  {r['score']:6.3f}  {r['date'][:10]:<10} {r['kind']:<16} {r['title'][:62]}")
        print(f"          {r['doi']}   terms: {', '.join(r['hits'])}")
else:
    print("\nNo bio_aims.txt, so the five 'most closely related' products are left unselected.")
    print("Relevance to the proposed project is the selection rule NSF states, and nothing in")
    print("a publication record knows what you are proposing.")
```

**Section 5(i) is ranked against your own project description**, which you put in
`bio_aims.txt` — the Project Summary or the aims of the proposal, plain text. Without that
file the five slots stay empty, because relevance to the proposed work is the rule NSF states
and nothing in a publication record knows what you are proposing. Section 5(ii) — "other
significant products, whether or not related" — stays empty either way: significance across
your own career is a judgement, and a ranking cannot make it.

## Identifying information, organization, appointments

```python
# bio_positions.py -- identifying information, organization, and appointments.
import html, json, os, re, unicodedata, collections, datetime as dt

W = json.load(open("bio_works.json"))
ORCID, FAMILY, GIVEN = W["orcid"], W["family"], W["given"]
ASOF = dt.date.fromisoformat(os.environ.get("BIO_ASOF", dt.date.today().isoformat()))

def tidy(s):
    s = html.unescape(re.sub(r"<[^>]{0,80}>", "", str(s or "")))
    s = unicodedata.normalize("NFC", s).replace(" ", " ").replace(" ", " ").replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip(" ,;")
def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^a-z]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())

# ---- 1. the name, as the deposits spell it ------------------------------------------------
# Publishers split a name into 'given' and 'family' by guessing, and they guess differently.
# The same person appears as given 'C. Titus' / family 'Brown' and as given 'C.' / family
# 'Titus Brown'. Re-split against the surname the reader supplied rather than trusting either.
spell = collections.Counter()
for i in W["crossref"].values():
    for a in i.get("author") or []:
        if ORCID in (a.get("ORCID") or ""):
            spell[(tidy(a.get("given")), tidy(a.get("family")))] += 1
for a in W["datacite"].values():
    for c in (a.get("creators") or []) + (a.get("contributors") or []):
        if any(ORCID in (n.get("nameIdentifier") or "") for n in c.get("nameIdentifiers") or []):
            if c.get("familyName") or c.get("givenName"):
                spell[(tidy(c.get("givenName")), tidy(c.get("familyName")))] += 1

def resplit(given, family):
    toks = [t for t in f"{given} {family}".split() if t]
    if not FAMILY: return given, family
    for n in range(len(toks), 0, -1):                     # longest surname match wins
        if fold(" ".join(toks[-n:])) == fold(FAMILY): return " ".join(toks[:-n]), " ".join(toks[-n:])
    return given, family

fixed = collections.Counter()
for (g, f), n in spell.items(): fixed[resplit(g, f)] += n
# The commonest spelling, not the longest. NSF asks for the legal name and no deposit knows
# it; picking the longest given name promotes whichever publisher expanded it once.
best = max(fixed.items(), key=lambda kv: (kv[1], len(kv[0][0])))[0] if fixed else ("", "")
gtoks = [t for t in best[0].split() if t]
name = {"last": best[1] or FAMILY, "first": gtoks[0] if gtoks else "",
        "middle": " ".join(gtoks[1:]), "suffix": ""}

# ---- 2. organizations, and when the record last placed you there ---------------------------
US = re.compile(r",\s*([A-Za-z .'\-]+),\s*([A-Z]{2})\b(?:\s*\d{5}(?:-\d{4})?)?\s*(?:,\s*(USA|United States[A-Za-z ]*))?\s*$")
# An employer, not a unit inside one. 'Genome Center, University of California Davis' names
# one appointment, and taking the first matching segment turns it into two.
EMPLOYER = re.compile(r"universit|instit|college|academy|corporation|company|\binc\b|\bllc\b|"
                      r"\bltd\b|\bgmbh\b|hospital|foundation|museum|observator|"
                      r"national laborator|\bnih\b|\bnasa\b|\bcnrs\b|\bmax planck\b", re.I)
UNIT = re.compile(r"laborator|school|college|center|centre|department|division|program|group|"
                  r"institute of|graduate", re.I)
COUNTRY = re.compile(r"\b(USA|United States|UK|United Kingdom|Canada|Germany|France|Japan|China|"
                     r"Australia|Netherlands|Sweden|Switzerland|Spain|Italy|Brazil|India|Israel|"
                     r"Denmark|Norway|Finland|Belgium|Austria|Poland|Mexico|Korea|Singapore)\b", re.I)

def places(raw):
    """A deposit may put several affiliations in one string, separated by semicolons --
    'University of Cambridge; The Alan Turing Institute; UCLA' is three appointments, and
    splitting on commas alone turns it into one organisation that does not exist. A spaced
    slash is used the same way -- 'University of Manchester / ELIXIR UK'."""
    return [p for p in (place(x) for x in re.split(r"\s*[;|]\s*|\s+/\s+", tidy(raw))) if p]

def place(raw):
    """Organisation, then City / State / Country only where the string actually says so."""
    s = tidy(raw)
    if not s: return None
    parts = [p for p in (tidy(x) for x in s.split(",")) if p]
    org = next((p for p in parts if EMPLOYER.search(p)),
               next((p for p in parts if not UNIT.search(p) and len(p) > 3), parts[0] if parts else ""))
    org = re.sub(r"^(the|at)\s+", "", org, flags=re.I)
    org = re.sub(r"\bU\.?C\.?\s+(?=[A-Z])", "University of California ", org)
    org = re.sub(r"\s*[-\u2013\u2014]\s*", " ", org)
    org = re.sub(r"[.,]?\s*\d{1,6}\s+[\w.]+(\s+\w+)?\s*(street|st|ave|avenue|road|rd|drive|dr|"
                 r"blvd|boulevard|way|lane|ln|court|ct|place|pl)?\.?\s*$", "", org, flags=re.I).strip(" .,")
    city = state = country = ""
    m = US.search(s)
    if m:
        city, state = tidy(m.group(1)), m.group(2)
        country = "USA" if (m.group(3) or "USA") else ""
    else:
        c = COUNTRY.search(s)
        if c:
            country = c.group(0)
            idx = [i for i, p in enumerate(parts) if COUNTRY.search(p)]
            if idx and idx[0] > 0 and not EMPLOYER.search(parts[idx[0] - 1]): city = parts[idx[0] - 1]
    return {"org": org, "city": city, "state": state, "country": country, "raw": s}

seen = {}
for doi, i in W["crossref"].items():
    dp = ((i.get("published") or {}).get("date-parts") or [[]])[0]
    year = dp[0] if dp else None
    for a in i.get("author") or []:
        if ORCID not in (a.get("ORCID") or ""): continue
        for af in a.get("affiliation") or []:
            for p in places(af.get("name")):
                if not year: continue
                k = fold(p["org"])
                r = seen.setdefault(k, {**p, "first": year, "last": year, "n": 0})
                r["n"] += 1; r["first"] = min(r["first"], year); r["last"] = max(r["last"], year)
                if len(p["raw"]) > len(r["raw"]) and p["city"]:
                    r.update({k2: p[k2] for k2 in ("city", "state", "country")})
for doi, a in W["datacite"].items():
    y = a.get("publicationYear")
    for c in (a.get("creators") or []) + (a.get("contributors") or []):
        if not any(ORCID in (n.get("nameIdentifier") or "") for n in c.get("nameIdentifiers") or []): continue
        for af in c.get("affiliation") or []:
            for p in places(af if isinstance(af, str) else af.get("name")):
                if not y: continue
                k = fold(p["org"])
                r = seen.setdefault(k, {**p, "first": y, "last": y, "n": 0})
                r["n"] += 1; r["first"] = min(r["first"], y); r["last"] = max(r["last"], y)

# 'University of California', 'University of California Davis Genome Center' and 'UC Davis'
# are one employer written three ways. Greedily fold each name into the commonest one it
# shares a prefix with, unless the record places the two in different cities.
def compatible(a, b):
    return not (seen[a]["city"] and seen[b]["city"] and seen[a]["city"] != seen[b]["city"])
while True:
    order = sorted(seen, key=lambda k: (-seen[k]["n"], k))
    for hub in order:
        kin = [k for k in seen if k != hub and (k.startswith(hub) or hub.startswith(k))
               and compatible(hub, k)]
        if not kin: continue
        for k in kin:
            seen[hub]["n"] += seen[k]["n"]
            seen[hub]["first"] = min(seen[hub]["first"], seen[k]["first"])
            seen[hub]["last"] = max(seen[hub]["last"], seen[k]["last"])
            if len(seen[k]["org"]) > len(seen[hub]["org"]) and not UNIT.search(seen[k]["org"]):
                seen[hub]["org"] = seen[k]["org"]
            for f in ("city", "state", "country"):
                seen[hub][f] = seen[hub][f] or seen[k][f]
            seen.pop(k)
        break
    else:
        break

orgs = sorted(seen.values(), key=lambda r: (-r["last"], -r["n"]))
primary = orgs[0] if orgs else None

# NSF: appointments and positions outside the primary organization, for up to three years
# from the date of submission. Everything else here is a prior appointment the reader may
# still want, so it is listed separately rather than dropped.
WINDOW = ASOF.year - 3
outside = [o for o in orgs if primary and fold(o["org"]) != fold(primary["org"]) and o["last"] >= WINDOW]
earlier = [o for o in orgs if primary and fold(o["org"]) != fold(primary["org"]) and o["last"] < WINDOW]

json.dump({"name": name, "spellings": sorted(f"{g} {f}".strip() for g, f in spell),
           "primary": primary, "outside": outside, "earlier": earlier,
           "window_from": WINDOW, "asof": ASOF.isoformat()},
          open("bio_positions.json", "w"), ensure_ascii=False)

print(f"name spellings in the record   {len(spell)}  ->  {len(fixed)} after re-splitting on {FAMILY!r}")
for (g, f), n in spell.most_common(): print(f"   {n:>3}x  given {g!r}  family {f!r}")
print(f"\nproposed name   Last {name['last']!r}  First {name['first']!r}  Middle {name['middle']!r}")
print(f"\norganizations found in your own deposits   {len(orgs)}")
for o in orgs:
    loc = ", ".join(x for x in (o["city"], o["state"], o["country"]) if x) or "(location not in the record)"
    print(f"   {o['first']}-{o['last']}  {o['n']:>3} deposit(s)  {o['org'][:52]:<52} {loc}")
print(f"\nprimary organization        {primary['org'] if primary else '(none found)'}")
print(f"outside, within 3 years     {len(outside)}   (NSF's reporting window, {WINDOW} onward)")
print(f"outside, before {WINDOW}        {len(earlier)}   (not required by the three-year rule)")
```

**This proposes section 2 and deliberately does not propose section 4.** What a publication
record holds is where a publisher printed you when a paper was accepted, which is a department
string, lags a move by a year or more, and says nothing about a title. NSF's section 4 is about
*titled positions, paid or unpaid*. The organisations found here go into the summary as
evidence for you to work from; the section itself ships empty.

## Stage the sections and write the summary

```python
# bio_stage.py -- the sections, in the order SciENcv asks for them.
import json, os, re, requests, datetime as dt

W  = json.load(open("bio_works.json"))
S  = json.load(open("bio_selected.json"))
P  = json.load(open("bio_positions.json"))
ROW = {r["doi"]: r for r in S["rows"]}
ET_AL = int(os.environ.get("BIO_ET_AL", 3))     # PAPPG allows one or more authors then 'et al'

def authors(r):
    """'Last, First' per person, separated by semicolons -- a comma-joined list of names that
    are themselves comma-separated cannot be read back. A deposit may also carry an
    organisation or a mononym as an author, with nothing to split; write it as deposited.
    PAPPG allows listing one or more authors and then 'et al' in place of a full byline."""
    out = []
    for x in r["authors"]:
        if not x: continue
        if ", " in x:
            fam, giv = x.split(", ", 1)
            giv = re.sub(r",\s*", " ", giv).strip()
            out.append(f"{fam}, {giv}" if giv else fam)
        else:
            out.append(x)
    if not out: return ""
    return "; ".join(out) if len(out) <= ET_AL + 1 else "; ".join(out[:ET_AL]) + "; et al"

def enclosing(r):
    """'other relevant citation information (e.g., in the case of publications, title of
    enclosing work such as journal or book, volume, issue, pages)'. NSF asks for N/A where an
    item does not apply -- which is not the same as an item nobody knows."""
    if r["kind"] in ("journal-article", "proceedings-article", "JournalArticle",
                     "ConferencePaper", "book-chapter", "BookChapter"):
        bits = [r["container"]] + [x for x in (r["vol"] and f'vol. {r["vol"]}',
                                               r["issue"] and f'no. {r["issue"]}',
                                               r["pages"] and f'pp. {r["pages"]}') if x]
        return ", ".join(b for b in bits if b)
    if r["kind"] in ("posted-content", "Preprint"):
        return f'preprint, {r["container"]}' if r["container"] else "preprint"
    label = {"Software": "software", "Dataset": "dataset", "Collection": "collection",
             "Image": "image", "Audiovisual": "audiovisual", "InteractiveResource":
             "interactive resource", "Poster": "poster", "Presentation": "presentation",
             "Report": "report", "Text": "text", "Dissertation": "dissertation"}.get(r["kind"], "")
    parts = [x for x in (label, r["container"], r["version"] and f'version {r["version"]}') if x]
    return ", ".join(parts) + (", N/A" if not r["container"] else "")

# NSF: products must be "citable and accessible". Ask the DOI resolver, and stop there.
# Following the redirect to the publisher answers a different question -- Oxford Academic
# returns 403 and bioRxiv 429 to an automated request for articles that are perfectly
# accessible to a person, and reporting that as a broken product would be wrong.
sess = requests.Session(); sess.headers["User-Agent"] = "nsf-biosketch/1.0 (https://heurekaskills.com)"
def reachable(doi):
    try:
        r = sess.head(f"https://doi.org/{doi}", allow_redirects=False, timeout=30)
        return r.status_code, re.sub(r"^https?://(www\.)?([^/]+).*", r"\2", r.headers.get("location", ""))
    except requests.RequestException as e:
        return None, str(e)[:60]

checked = {}
for d in S["related"] + S["other"]:
    checked[d] = reachable(d)

def product_block(n, d):
    r = ROW[d]; code, url = checked.get(d, (None, ""))
    return [f"{n}. {authors(r)}. {r['title']}. {r['date'] or ''}.",
            f"   URL: {r['url']}",
            f"   Persistent identifier: https://doi.org/{r['doi']}",
            f"   {enclosing(r)}" if enclosing(r) else "   N/A"]

nm = P["name"]; pr = P["primary"] or {}
L = ["# Biographical Sketch — " + ", ".join(x for x in (nm["last"], nm["first"]) if x), "",
     "## 1. Identifying Information", "",
     "| Field | Entry |", "|---|---|",
     f"| Last name | {nm['last']} |", f"| First name | {nm['first']} |",
     f"| Middle name | {nm['middle']} |", f"| Suffix | {nm['suffix']} |",
     f"| ORCID iD | {W['orcid']} |", "| Position title |  |", "",
     "## 2. Organization and Location", "",
     "| Field | Entry |", "|---|---|",
     f"| Name | {pr.get('org','')} |", f"| City | {pr.get('city','')} |",
     f"| State/Province | {pr.get('state','')} |", f"| Country | {pr.get('country','')} |", "",
     "## 3. Professional Preparation", "",
     "Reverse chronological order by start date. All postdoctoral and fellowship training",
     "listed separately, and the baccalaureate or other initial professional education included.", "",
     "| Organization | City | State/Province | Country | Degree | Start date | Month and year received | Field of study |",
     "|---|---|---|---|---|---|---|---|",
     "|  |  |  |  |  |  |  |  |", "|  |  |  |  |  |  |  |  |", "|  |  |  |  |  |  |  |  |", "",
     "## 4. Appointments and Positions", "",
     "Reverse chronological order by start date, beginning with the current appointment.",
     "All domestic and foreign appointments and positions outside the primary organization",
     f"held at any point from {P['window_from']} onward.", "",
     "| Start (YYYY) | End (YYYY) | Appointment or position title | Organization | Department | City | State/Province | Country |",
     "|---|---|---|---|---|---|---|---|",
     "|  |  |  |  |  |  |  |  |", "|  |  |  |  |  |  |  |  |", "|  |  |  |  |  |  |  |  |", "",
     "## 5. Products", "",
     "### (i) Up to five products most closely related to the proposed project", ""]
if S["related"]:
    for n, d in enumerate(S["related"], 1): L += product_block(n, d) + [""]
else:
    L += ["", ""]
L += ["### (ii) Up to five other significant products, whether or not related to the proposed project", ""]
if S["other"]:
    for n, d in enumerate(S["other"], 1): L += product_block(n, d) + [""]
else:
    L += ["", ""]
L += ["## 6. Certification", "",
      "- [ ] I certify that the information provided is current, accurate, and complete. This",
      "      includes but is not limited to information related to domestic and foreign",
      "      appointments and positions.",
      "- [ ] I also certify that, at the time of submission, I am not a party in a malign",
      "      foreign talent recruitment program.", "",
      "| Field | Entry |", "|---|---|", "| Signature |  |", "| Date |  |", ""]
open("NSF-biosketch-sections.md", "w").write("\n".join(L))

json.dump({"checked": checked, "n_related": len(S["related"]), "n_other": len(S["other"])},
          open("bio_staged.json", "w"), ensure_ascii=False)
print(f"NSF-biosketch-sections.md   {len(L)} lines, 6 sections")
print(f"section 5(i) products       {len(S['related'])} of 5")
print(f"section 5(ii) products      {len(S['other'])} of 5")
print(f"sections left blank         3 (professional preparation), 4 (appointments and positions),")
print(f"                            position title, signature, date")
ok = sum(1 for c, _ in checked.values() if c in (301, 302, 303, 307, 308))
print(f"registered DOIs            {ok} of {len(checked)} resolve at doi.org")
for d, (code, host) in sorted(checked.items()):
    print(f"  {str(code):<4} {d:<34} -> {host}")
```

The sections file carries data and nothing else. Everything you need to know about it — every
blank, every merge, every judgement made on your behalf — goes in a file beside it.

```python
# bio_summary.py -- everything about the sections that does not belong inside them.
import json, collections, datetime as dt

W = json.load(open("bio_works.json")); A = json.load(open("bio_audit.json"))
S = json.load(open("bio_selected.json")); P = json.load(open("bio_positions.json"))
G = json.load(open("bio_staged.json"))
ROW = {r["doi"]: r for r in S["rows"]}
nm = P["name"]; pr = P["primary"] or {}
kinds = collections.Counter(r["kind"] for r in S["rows"])
PAPER = {"journal-article", "proceedings-article", "JournalArticle", "ConferencePaper",
         "book-chapter", "BookChapter", "Book"}
nonpaper = sum(n for k, n in kinds.items() if k not in PAPER)
pre_sel = [d for d in S["related"] + S["other"] if ROW[d]["kind"] in ("posted-content", "Preprint")]

L = [f"# Biographical sketch sections for {nm['last']}, {nm['first']} — read this first", "",
     f"Staged {dt.date.today()} against NSF's Biographical Sketch Common Form as implemented in",
     "PAPPG 24-1 II.D.2.h(i). The sections are in `NSF-biosketch-sections.md`, in the order",
     "SciENcv asks for them.", "",
     "**This is not a biographical sketch.** NSF accepts only the PDF SciENcv generates, and",
     "SciENcv has no upload path for this document — only Current and Pending (Other) Support",
     "has one. What is here is transcription material and an audit of the open record behind",
     "your ORCID iD. You certify the result; nothing here certifies anything.", "",
     "## Proposed", ""]
full = " ".join(x for x in (nm["first"], nm["middle"]) if x)
L += [f"- **Identifying information** — name `{nm['last']}, {full}` and ORCID iD {W['orcid']}.",
      f"- **Organization and location** — {pr.get('org','(none found)')}"
      + (f", {pr.get('city')}, {pr.get('state')}, {pr.get('country')}" if pr.get("city") else "")
      + f", from {pr.get('n',0)} of your own deposits between {pr.get('first','?')} and {pr.get('last','?')}.",
      f"- **Products** — {len(S['rows'])} distinct products from {len(W['crossref'])} Crossref works and"
      f" {len(W['datacite'])} DataCite records, of which {len(S['related'])} are staged in section 5(i)."]
if S["scored"]:
    L += [f"  Ranked by word overlap with the {S['aims_chars']}-character project description you"
          f"  supplied in `bio_aims.txt`. That is a shortlist, not a decision."]
L += ["", "## Inferred", "",
      f"- **{len(S['rows'])} products out of {len(W['crossref']) + len(W['datacite'])} records.**"
      f" {sum(len(r['merged']) for r in S['rows'])} rows were folded into another:"
      f" {len(A['chains'])} repository version chains covering"
      f" {sum(len(v) for v in A['chains'].values())} DOIs, {len(A['identical'])} deposits marked"
      f" identical to another, and {len(A['pairs'])} preprint-and-published pairs.",
      f"- **Preprint pairs need two detectors.** Crossref's `relation` field found"
      f" {len(A['pairs_relation'])} and matching titles found {len(A['pairs_title'])};"
      f" {len(set(map(tuple, A['pairs_relation'])) & set(map(tuple, A['pairs_title'])))} were found by both."
      f" Either one alone would have left duplicates in the list.",
      f"- **{nonpaper} of your {len(S['rows'])} products are not papers** — software, data,"
      f" collections, images, presentations. A publication list from a CV carries none of them,"
      f" and NSF counts every one as a product.",
      f"- **Your ORCID iD is on {len(W['crossref'])} Crossref deposits and ORCID authenticated it on"
      f" {W['authenticated']} of them.** On the rest a publisher typed the iD into the metadata"
      f" and nobody verified it. It is still the identifier that found the work."]
if W["scan"]["overflow"]:
    L += [f"- **How much of the open record is missing from your ORCID iD could not be measured.**"
          f" {W['family']!r} matches {W['scan']['total']} works in Crossref, too many to enumerate."
          f" Your own ORCID record is the only complete answer."]
elif W["unlinked"]:
    L += [f"- **{len(W['unlinked'])} work(s) in the open record carry your name and not your iD.**"
          f" SciENcv will import them only if your ORCID record already claims them."]
L += ["", "## Decided on your behalf", "",
      f"- **The version of record survives a merge.** A published article outranks its preprint,"
      f" a repository's concept DOI outranks the release DOIs beneath it, and `10.x/y` outranks"
      f" `10.x/y.v2`.",
      f"- **Two peer-reviewed articles are never merged on a title match.** A paper announcing a"
      f" tool and a later paper announcing its next major version share a title through the"
      f" release DOIs between them, and collapsing them would cost you a product.",
      f"- **A dataset or a piece of software deposited alongside a paper stays a separate"
      f" product.** NSF lists data and software as products in their own right.",
      f"- **Authors are written `Last, First`, separated by semicolons**, with the first three"
      f" named and `et al` after that on bylines longer than four, which PAPPG permits.",
      f"- **`N/A` appears only where NSF asks for it** — an item that does not apply to a kind of"
      f" product, such as a journal volume for a piece of software. A field nobody knows is left"
      f" empty instead, and is listed below.",
      f"- **{len(set(P['spellings']))} spellings of your name in the record were resolved to one** by"
      f" re-splitting each byline against the surname you supplied. Publishers disagree about"
      f" where your given name ends: {'; '.join(sorted(set(P['spellings']))[:6])}."]
L += ["", "## Left blank, deliberately", "",
      "- **Position title.** Not in any bibliographic or repository record.",
      "- **Professional preparation (section 3).** Degrees, fields of study, start dates and"
      " award dates are in no public bibliographic source. Every row is empty. NSF requires this"
      " section, including all postdoctoral and fellowship training listed separately and the"
      " baccalaureate or other initial professional education.",
      "- **Appointments and positions (section 4).** Empty, and not because there is nothing to"
      " say. NSF's definition covers any titled academic, professional or institutional position"
      " whether or not it is paid, including adjunct, visiting and honorary appointments and"
      " positions at a company you founded. A publication record shows none of that. What it does"
      " show is where you were when a paper was accepted:"]
for o in [pr] + P["outside"] + P["earlier"]:
    if not o: continue
    loc = ", ".join(x for x in (o.get("city"), o.get("state"), o.get("country")) if x)
    L += [f"  - {o['first']}–{o['last']} — {o['org']}" + (f" ({loc})" if loc else "")
          + f" — {o['n']} deposit(s)"]
L += ["  Those are years a deposit named the organisation, not the years of an appointment, and"
      " a publication lags a move by a year or more. NSF asks for appointments outside your"
      f" primary organization held at any point from {P['window_from']} onward.",
      "- **Signature and date.** The certification is a personal attestation, and the second"
      " statement — that you are not a party in a malign foreign talent recruitment program — is"
      " a legal claim published under your name. NSF also requires the signature date to be"
      " within 12 months of submission. Only you can make it, and only inside SciENcv.",
      "", "## Outstanding — your call", ""]
L += [f"- **Section 5(ii), up to five other significant products, is empty.** NSF's rule for it is"
      f" that they demonstrate your qualifications whether or not they relate to the proposal."
      f" That is a judgement about your own career, and ranking cannot make it. There are"
      f" {len(S['rows']) - len(S['related'])} other products in `bio_selected.json` to choose from."]
if not S["scored"]:
    L += ["- **Section 5(i) is empty too.** NSF selects those five by relevance to the proposed"
          " project. Put your project summary in `bio_aims.txt` and re-run, or choose by hand."]
if pre_sel:
    L += [f"- **{len(pre_sel)} of the staged products are preprints.** Where a published version"
          f" exists it is the better citation, and it will not be found here unless the publisher"
          f" deposited your ORCID iD on it or linked it to the preprint. Crossref carries the"
          f" preprint-to-article link on the article, not on the preprint, so a preprint whose"
          f" article is outside your linked record looks preprint-only: "
          + "; ".join(pre_sel) + "."]
L += [f"- **Only the ten products in section 5 are read.** PAPPG says so outright. Products"
      f" beyond the ten do not add anything to the review.",
      f"- **The record is what publishers and repositories deposited, not what you did.** Work"
      f" published under a different name, deposited without your iD, or not deposited at all is"
      f" invisible here. Products with no DOI — a website, a curriculum, an instrument — are"
      f" acceptable to NSF and are not in any of this.",
      f"- **{len(A['late_register'])} DataCite records were minted a year or more after the date"
      f" they carry.** Repositories re-archive old releases, so the age of a record says nothing"
      f" about the age of the product. The dates staged above are the release dates, not the"
      f" deposit dates.", "",
      "## Before you open SciENcv", "",
      "- Fix anything wrong in ORCID first, not in SciENcv. A correction made in ORCID persists"
      " and every future SciENcv document inherits it; a correction made inside SciENcv is spent"
      " on one document.",
      "- Synergistic activities are not part of the biographical sketch. NSF removed them on"
      " 2024-05-20 and they are now a separate one-page document, submitted as a PDF.",
      "- SciENcv produces the PDF and NSF accepts no other format for this document.", ""]
open("NSF-biosketch-summary.md", "w").write("\n".join(L))
print(f"NSF-biosketch-summary.md   {len(L)} lines, {sum(1 for l in L if l.startswith('## '))} sections")
print(f"products staged            {G['n_related']} related, {G['n_other']} other significant")
print(f"blank on purpose           position title, section 3, section 4, signature, date")
```

Run the whole thing:

```bash
for s in bio_harvest bio_audit bio_select bio_positions bio_stage bio_summary; do
  .venv/bin/python $s.py || exit 1
done
```

## What this cannot determine

State these to the senior person every time. They are why the sections file has blanks in it
and why the summary is longer than the sections.

- **Professional preparation, in full.** Degrees, fields of study, start dates and award dates
  are in no public bibliographic source. Section 3 ships empty.
- **Appointments and positions, in full.** NSF's definition is about titles, paid or unpaid,
  including adjunct, visiting and honorary appointments and roles at a company the person
  founded. A publication record shows an employer's name in a byline, on the date a publisher
  accepted a paper. That is evidence for the summary, not an entry for the section.
- **Position title, legal name, signature and date.** The first two are not in the record; the
  last two are a personal attestation NSF requires to be dated within 12 months of submission.
- **Which five products are most closely related.** The ranking is a bag-of-words overlap with
  the reader's own project description. It is a shortlist. Relevance to a proposal is an
  argument, and the argument is the senior person's.
- **Which five products are "other significant".** Deliberately not attempted.
- **Anything not deposited.** A website, a curriculum, an instrument, a physical collection, a
  patent application, a new business — all products NSF names, none with a DOI, none visible
  here. Work published under a former name, or deposited without the iD, is equally invisible.
- **Whether a preprint has a published version.** Crossref carries the preprint-to-article
  relation on the *article*, and 4 of the 8 pairs on the worked example have a preprint side
  carrying no relation at all. If the article is outside the linked record, the preprint looks
  preprint-only.
- **What SciENcv's importer will actually do with a given entry.** SciENcv is behind a login,
  no automated route to it exists, and nothing here has been tested against it. What is tested
  is the state of the open record that the importer reads.
- **The ORCID record itself.** Employment entries with no end date or no organization
  identifier, education entries, and works claimed by hand are all in ORCID and none of them
  are in any third-party deposit. ORCID's Public APIs are licensed for non-commercial use only,
  so this page does not read them; ORCID's own *Download all my data* button gives you the
  full record, and it is the only complete answer.

## How this behaves on your record

Measured 2026-08-28 across twelve researchers spanning career stage, surname frequency, name
form, discipline and record size. What changes between them is not how well known someone is —
it is how much of their work sits outside a journal.

| researcher | Crossref | DataCite | records | products | 5(i) | primary organization |
|---|---|---|---|---|---|---|
| Brown, C. Titus — UC Davis, the worked example | 60 | 179 | 239 | 101 | 5 | University of California Davis |
| Martonosi, Margaret — rare surname | 16 | 4 | 20 | 18 | 5 | Princeton University |
| Katz, Daniel S. — largest record tried | 301 | 649 | 950 | 579 | 5 | University of Illinois Urbana‐Champaign Urbana and Champaign Illinois USA |
| Greene, Casey S. | 283 | 119 | 402 | 257 | 5 | University of Colorado Anschutz Medical Campus |
| Goble, Carole — data-heavy, non-US | 32 | 365 | 397 | 189 | 5 | University of Manchester 5 |
| Tardos, Éva — diacritic in the given name | 14 | 1 | 15 | 15 | 5 | Cornell University |
| van der Schaar, Mihaela — particle surname | 18 | 2 | 20 | 19 | 5 | University of Cambridge |
| Orenes-Vera, Marcelo — early career, sparse | 2 | 0 | 2 | 2 | **2** | Princeton University |
| Aragón, Juan Luis — accented surname | 8 | 4 | 12 | 10 | 5 | University of Murcia |
| Bengio, Yoshua — hyperauthorship | 33 | 21 | 54 | 43 | 5 | Université de Montréal |
| Wang, Wei — commonest surname tried | 20 | 2 | 22 | 21 | 5 | School of Mathematical Sciences Xiamen University Xiamen China |
| Doudna, Jennifer A. | 178 | 58 | 236 | 162 | 5 | University of California |

All twelve completed. The same project description was used for every ranking, so the `5(i)`
column measures only that the selection runs and fills what it can — Orenes-Vera has two
products in total, so two is the correct answer there rather than a failure.

Three regimes, decided by the surname rather than by the person:

- **A rare surname.** The unlinked-work measurement completes and means something.
- **A shared surname.** It completes but returns a mixture, so a match requires a spelled-out
  given-name token rather than an initial.
- **A surname too common to enumerate.** *Brown* matches 475,123 works in Crossref. The scan
  stops and the count is **not reported** — a floor of unknown depth is not a finding. The
  products list is unaffected, because it is built from the iD and never from the surname.

Four things the sweep broke, all fixed in the code above:

1. **A consortium deposited as an author crashed the writer.** `Digital Science` appears as an
   author on a real figshare record with no given/family split, and splitting every byline on
   `", "` raised `IndexError` on the third researcher tried. Organisation names and mononyms
   are now written as deposited.
2. **Several affiliations in one string became one organisation that does not exist.** A
   Crossref deposit put `University of Cambridge; The Alan Turing Institute; University of
   California Los Angeles` in a single affiliation field, and another used ` / ` as the
   separator. Splitting on commas alone produced exactly those strings as a primary
   organization. Splitting on semicolons and spaced slashes first recovers the real
   institutions and the right primary.
3. **HTML entities survived into the sections.** `Department of Applied Mathematics &amp` came
   through a Crossref affiliation. Stripping tags is not enough; entities need unescaping too.
4. **Department names outranked employers.** `Genome Center, University of California Davis`
   was read as an organisation called "Genome Center", splitting one appointment into several
   and fragmenting the evidence list. Employer-shaped segments now win over unit-shaped ones,
   and near-duplicate employer names are folded together unless the record puts them in
   different cities.

Two limits the sweep confirmed rather than fixed, and both are why section 2 is a **proposal**
and section 4 ships **empty**:

- **Three of the twelve primary organizations carry deposit noise.** `University of Manchester
  5` is literally what a Crossref affiliation says; Katz's and Wang's deposits are written with
  no punctuation at all, so a department name and a city ride along with the institution. An
  attempt to cut those back to the institution by pattern was tried and reverted — it fixed two
  rows and corrupted the worked example's, which is the wrong trade in a compliance document.
  Confirm the organization name; the summary shows every string the answer came from.
- **The product count is not a measure of a career.** 950 records collapse to 579 products for
  one researcher here and 2 records to 2 products for another, and both files are correct.
  Only ten products are ever read.

## Try it

**Data.** Three public sources, no account and no key:

- **NSF award 2018911**, a real, current, public NSF award record —
  `https://api.nsf.gov/services/v1/awards/2018911.json`. Its abstract stands in for the
  project description that section 5(i) is ranked against. A US Government work, not subject
  to domestic copyright. Confirmed reachable 2026-08-28.
- **Crossref**, filtered on the ORCID iD of **C. Titus Brown** (UC Davis, `0000-0001-6001-2677`),
  a real, named, public researcher who is the PI on that award. Crossref states that "almost
  none of the metadata is subject to copyright, and you may use it for any purpose".
- **DataCite**, the same iD, plus the Zenodo concept DOI `10.5281/zenodo.595354` for
  *sourmash* — a piece of software with more than a hundred release DOIs beneath it. DataCite
  metadata is waived to the public domain under CC0.

The example is routed through every trap on this page rather than around them.

**Run** — cold, in an empty directory:

```bash
python3 -m venv .venv
.venv/bin/pip -q --disable-pip-version-check install requests
.venv/bin/python - <<'PY'
import collections, re, sys, time, unicodedata, requests
UA = {"User-Agent": "nsf-biosketch/1.0 (https://heurekaskills.com)"}
ORCID = "0000-0001-6001-2677"          # C. Titus Brown, UC Davis

def get(url, **p):                     # both services intermittently serve an HTML error page
    for attempt in range(5):
        r = requests.get(url, params=p or None, headers=UA, timeout=90)
        if r.ok and "json" in (r.headers.get("content-type") or ""):
            return r.json()
        time.sleep(2 * (attempt + 1))
    sys.exit(f"{url} did not return JSON after 5 tries: {r.status_code}")

# 1. A real, public NSF project description -- the text section 5(i) is ranked against.
aw = get("https://api.nsf.gov/services/v1/awards/2018911.json")["response"]["award"][0]
print(f"nsf award  2018911  PI {aw['piFirstName']} {aw['piLastName']}, {aw['awardeeName']}")
print(f"  {aw['title'][:72]}")
print(f"  abstract {len(aw['abstractText'])} characters")
assert aw["piLastName"] == "Brown", "NSF no longer records this award under this PI"

# 2. DataCite stores an ORCID iD in two forms and an exact-phrase query finds only one.
F = "creators.nameIdentifiers.nameIdentifier"
url_form  = get("https://api.datacite.org/dois", query=f'{F}:"https://orcid.org/{ORCID}"', **{"page[size]": 1})["meta"]["total"]
bare_form = get("https://api.datacite.org/dois", query=f'{F}:"{ORCID}"', **{"page[size]": 1})["meta"]["total"]
wildcard  = get("https://api.datacite.org/dois", query=f"{F}:*{ORCID}*", **{"page[size]": 1})["meta"]["total"]
print(f"\ndatacite   url-form query {url_form}   bare-iD query {bare_form}   wildcard {wildcard}")
assert wildcard == url_form + bare_form, "the two stored forms are no longer disjoint"
assert bare_form > 0, "the bare-iD form no longer occurs -- the wildcard is now unnecessary"

# 3. A repository mints one DOI per release plus a concept DOI, and the concept DOI's own
#    metadata tracks the newest release. It is the citable identifier; it is not a snapshot.
c = get("https://api.datacite.org/dois/10.5281/zenodo.595354")["data"]["attributes"]
vers = [r["relatedIdentifier"] for r in c["relatedIdentifiers"] if r["relationType"] == "HasVersion"]
print(f"\nconcept doi 10.5281/zenodo.595354  {c['titles'][0]['title']}")
print(f"  type {c['types']['resourceTypeGeneral']}  version {c['version']}  "
      f"publicationYear {c['publicationYear']}  issued {c['dates'][0]['date']}")
print(f"  releases beneath it {len(vers)}   registered {c['registered'][:10]}")
assert c["types"]["resourceTypeGeneral"] == "Software" and len(vers) > 10
assert int(c["publicationYear"]) > int(c["registered"][:4]), \
    "the concept DOI no longer reports the newest release as its publication year"

# 4. Crossref, filtered on the same iD. 'authenticated-orcid' says whether ORCID itself
#    vouched for the iD on that deposit; it is usually false.
items, cur = {}, "*"
while cur:
    m = get("https://api.crossref.org/works", filter=f"orcid:{ORCID}", rows=200, cursor=cur)["message"]
    for it in m["items"]: items[it["DOI"].lower()] = it
    cur = m.get("next-cursor") if m["items"] else None
authed = sum(1 for it in items.values() for a in it.get("author") or []
             if ORCID in (a.get("ORCID") or "") and a.get("authenticated-orcid") is True)
types = collections.Counter(it.get("type") for it in items.values())
print(f"\ncrossref   {len(items)} works carrying the iD, {authed} authenticated by ORCID")
print(f"  types {dict(types.most_common())}")
assert authed < len(items), "every deposit is now ORCID-authenticated"

# 5. Preprint and published arrive as two products, and neither detector finds them all.
def norm(t):
    t = unicodedata.normalize("NFKD", t or "")
    return re.sub(r"[^a-z0-9]", "", "".join(x for x in t if not unicodedata.combining(x)).lower())
by_rel = {(d, (v.get("id") or "").lower().replace("https://doi.org/", ""))
          for d, it in items.items() for k, vs in (it.get("relation") or {}).items()
          if k == "has-preprint" for v in vs
          if (v.get("id") or "").lower().replace("https://doi.org/", "") in items}
titles = collections.defaultdict(list)
for d, it in items.items(): titles[norm((it.get("title") or [""])[0])].append(d)
by_ttl = {(a, b) for g in titles.values() if len(g) > 1
          for a in g if items[a].get("type") == "journal-article"
          for b in g if items[b].get("type") == "posted-content"}
print(f"\npreprint pairs  by Crossref relation {len(by_rel)}   by matching title {len(by_ttl)}   "
      f"by both {len(by_rel & by_ttl)}   union {len(by_rel | by_ttl)}")
assert by_rel - by_ttl and by_ttl - by_rel, "one detector now finds every pair"
# The link sits on the article, not on the preprint, so a preprint alone tells you nothing.
lone = [b for _, b in sorted(by_rel | by_ttl) if not items[b].get("relation")]
print(f"  preprints in those pairs carrying no relation of their own  {len(lone)} of {len(by_rel | by_ttl)}")

# 6. NSF wants the date of publication or release. Three date fields, three meanings.
w = get("https://api.crossref.org/works/10.1093/gigascience/giy158")["message"]
def dp(k): return ((w.get(k) or {}).get("date-parts") or [[]])[0]
print(f"\ndates on 10.1093/gigascience/giy158   published {dp('published')}  "
      f"created {dp('created')}  indexed {dp('indexed')}")
assert dp("published") != dp("indexed"), "indexed has collapsed onto published"

# 7. Citable and accessible: ask the DOI resolver, not the publisher.
r = requests.head("https://doi.org/10.5281/zenodo.595354", allow_redirects=False, headers=UA, timeout=30)
print(f"\ndoi.org    {r.status_code} -> {r.headers.get('location','')}")
assert r.status_code in (301, 302, 303, 307, 308)
pub = requests.head("https://doi.org/10.1093/gigascience/giy158", allow_redirects=True, headers=UA, timeout=30)
print(f"publisher  {pub.status_code} at {pub.url.split('/')[2]}  <- why the check stops at doi.org")

print("\nSections 3 and 4 stay empty. Degrees, fields of study and titled appointments -- paid")
print("or unpaid -- are in no bibliographic source, and a guess in a certified federal")
print("document is worse than a blank.")
PY
```

**Expect.**

Invariants — asserted in the block, and a failure means this page is wrong rather than stale:

- NSF award 2018911 is recorded under PI surname **Brown**. The award is public and the
  abstract is fetchable without a key.
- DataCite's two stored forms of an ORCID iD are **disjoint**, and the wildcard query returns
  exactly their sum. Both forms occur. An exact-phrase query on either one alone is incomplete.
- The Zenodo **concept DOI is Software, carries more than ten `HasVersion` releases, and
  reports a `publicationYear` later than the year it was registered** — its metadata tracks the
  newest release, so it is a stable identifier with unstable metadata.
- **Not every Crossref deposit carrying the iD is ORCID-authenticated.**
- **Neither preprint detector is a superset of the other.** The relation field finds pairs the
  titles miss and the titles find pairs the relation misses.
- **`published` and `indexed` are different dates.** Only `published` answers NSF's question.
- `doi.org` returns a **redirect** for a registered DOI.

Observed 2026-08-28 — these move when Crossref, DataCite or a repository reindexes, so a
mismatch is drift to investigate, not a bug. The publisher status on the last line is the most
volatile of all, and its volatility is the point:

```
nsf award  2018911  PI Charles Brown, University of California-Davis
  BBSRC-NSF/BIO:Collaborative Research: genomeRxiv: a microbial whole-geno
  abstract 3615 characters

datacite   url-form query 139   bare-iD query 38   wildcard 177

concept doi 10.5281/zenodo.595354  sourmash-bio/sourmash: v4.9.4
  type Software  version v4.9.4  publicationYear 2025  issued 2025-08-07
  releases beneath it 120   registered 2017-05-30

crossref   60 works carrying the iD, 5 authenticated by ORCID
  types {'journal-article': 36, 'posted-content': 24}

preprint pairs  by Crossref relation 7   by matching title 6   by both 5   union 8
  preprints in those pairs carrying no relation of their own  4 of 8

dates on 10.1093/gigascience/giy158   published [2018, 12, 13]  created [2018, 12, 12]  indexed [2026, 7, 1]

doi.org    302 -> https://zenodo.org/doi/10.5281/zenodo.595354
publisher  403 at academic.oup.com  <- why the check stops at doi.org

Sections 3 and 4 stay empty. Degrees, fields of study and titled appointments -- paid
or unpaid -- are in no bibliographic source, and a guess in a certified federal
document is worse than a blank.
```

The NSF record names the PI **Charles Brown** while every publication in the same run is
bylined **C. Titus Brown**. The name on an agency's record is not always the name on the work,
which is worth knowing before typing a legal name into a certified document.

## Where this ages

- **NSF's schedule, not ours.** PAPPG 24-1 is in force and NSF is consulting on a replacement
  called *Guidance on Financial Assistance*. Re-read II.D.2.h(i) and the senior-personnel
  documents page before trusting the section list, the three-year appointments window or the
  ten-product limit.
- **SciENcv gains ingest paths one document at a time.** XML upload exists for Current and
  Pending (Other) Support and not for this document. If that changes, this page becomes the
  wrong shape and should be rewritten rather than patched.
- **ORCID's API terms could change.** The non-commercial licence grant is what keeps the API
  out of this page. If ORCID ever grants a licence a commercial reader can meet, the audit
  gets much better, because the employment and education sections become readable.
- **Crossref and DataCite metadata improve.** More authenticated iDs, more affiliations, more
  preprint relations. Nothing here breaks; the summary gets shorter.

## Sources

Read 2026-08-28.

- [PAPPG 24-1 Chapter II](https://www.nsf.gov/policies/pappg/24-1/ch-2-proposal-preparation) —
  II.D.2.h(i) is the biographical sketch. Source of the six blocks, the "no page or character
  limit" statement, the three-year window on outside appointments, the ten-product limit, the
  citation fields, and the certification text. Footnote 30 carries the 12-month signature rule.
- [PAPPG policy page](https://www.nsf.gov/policies/pappg) — confirms PAPPG 24-1 in force with
  supplements NSF 26-200 (2025-12-08) and NSF 26-202 (2026-01-22), and announces the draft
  *Guidance on Financial Assistance* that will replace it.
- [Senior personnel documents](https://www.nsf.gov/funding/senior-personnel-documents) — NSF's
  guidance page, last updated 2026-04-13. Source of the SciENcv requirement and of the
  2024-05-20 removal of synergistic activities from the biographical sketch.
- [Using SciENcv FAQ](https://www.nsf.gov/policies/document/faq-using-sciencv) — NSF's own FAQ,
  published 2024-08-01 and last updated 2026-03-30. Confirms that a delegate cannot certify on
  the delegator's behalf.
- [SciENcv help](https://www.ncbi.nlm.nih.gov/books/NBK154494/) — NCBI's documentation. Lists
  XML upload as a creation method for Current and Pending (Other) Support and for no other
  document.
- [Crossref REST API](https://api.crossref.org) — no sign-up, and Crossref states that "almost
  none of the metadata is subject to copyright, and you may use it for any purpose".
- [DataCite REST API](https://api.datacite.org) — no sign-up; DataCite waives its metadata to
  the public domain under CC0.
- [NSF Award Search API](https://api.nsf.gov/services/v1/awards/2018911.json) — public award
  records. Note that the `id` parameter is exact while `pdPIName` is a loose token match that
  both over- and under-returns.
- [ORCID Public APIs Terms of Service](https://info.orcid.org/public-client-terms-of-service/)
  — last updated 23 October 2024. The non-commercial licence grant that keeps ORCID's API out
  of this page.
- [Download all your data](https://support.orcid.org/hc/en-us/articles/360006897634-Download-all-your-data)
  — ORCID's own route for a record holder to export their full record as XML from account
  settings.

NSF's policy guide, its FAQ and its award records are US Government works and not subject to
domestic copyright. Short phrases are quoted where the exact wording is the requirement; the
rest of this page is original.
