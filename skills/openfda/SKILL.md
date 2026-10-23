---
name: openfda
description: Query openFDA for FAERS adverse-event reports, drug labels and drug recalls — counts, date ranges, finding a drug across name fields, the skip ceiling, 404 as empty, and why report counts are not incidence.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, drug-discovery, epidemiology, pharmacovigilance]
covers: [openfda, fda, faers, adverse event, adverse drug reaction, side effect, pharmacovigilance, drug safety, safety signal, disproportionality, proportional reporting ratio, prr, meddra, drug label, package insert, structured product labeling, spl, boxed warning, indications, contraindications, recall, enforcement report, drug recall, class i recall, ndma, semaglutide, pretomanid, sotatercept, metformin, postmarketing]
papers: [PMID:26644398, PMID:11828828]
access: [open]
datasets: ["https://api.fda.gov/drug/event.json?limit=1", "https://api.fda.gov/drug/label.json?limit=1", "https://api.fda.gov/drug/enforcement.json?limit=1", "https://api.fda.gov/drug/event.json?search=patient.drug.activesubstance.activesubstancename:%22pretomanid%22&limit=1", "https://api.fda.gov/download.json"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-22
  against: openFDA API drug/event last_updated 2026-07-30, drug/label 2026-10-21 then 2026-10-22, drug/enforcement 2026-10-14, bulk manifest exported 2026-10-21 / Python 3.12.8 standard library only / curl 8.15.0 / macOS arm64, no API key
  executed: 13
  unverified: 0
---

# openFDA — adverse events, drug labels and recalls

openFDA is the US Food and Drug Administration's public API over several of its own
databases. This skill covers the three drug endpoints most used in research:

| endpoint | source | what one record is | refreshed |
|---|---|---|---|
| `drug/event` | FDA Adverse Event Reporting System (FAERS) | one safety report: a patient, the drugs they took, the reactions reported | quarterly, lagging three months or more |
| `drug/label` | Structured Product Labeling (SPL) submissions | one version of one product label, split into sections | weekly |
| `drug/enforcement` | Recall Enterprise System (RES) | one recalled product within a recall event | weekly |

The API is easy to call and easy to misread. A misspelled field returns the same answer as
a drug with no reports. The harmonised drug names miss newer drugs entirely. A search for "a
report where drug X is the suspect" cannot be expressed. A count of reports is not a rate.
This skill covers each of those, and ends in files on disk with a provenance record beside
them.

**What you need: nothing, at low volume.** No key, account or click-through is needed to
query. A free API key raises the daily ceiling. Without one, `drug/event` also refuses a
page of 1,000 records, though 999 works (see below). If you have one, put it in the
environment as `OPENFDA_API_KEY`. The code here reads it from there, sends it only to
`api.fda.gov`, and never prints it. Never write a key into a script or a notebook.

## Licence, terms, and what the data cannot tell you

Checked at source on 2026-10-22.

**The data is CC0.** The licence page (<https://open.fda.gov/license/>) and the terms of
service (<https://open.fda.gov/terms/>) both state that, unless otherwise noted, the
content, data, documentation and code on openFDA are public domain under a Creative Commons
CC0 1.0 Universal dedication. Copying, modifying and redistributing, commercially or not,
needs no permission. Every API response repeats both URLs in its `meta` block.

The same pages state limits that belong in anything you build on it:

- **Not everything is CC0.** The terms say some data may be copies of copyrightable works
  that private entities gave to FDA, and that such works are marked as not public domain in
  the relevant documentation. Label text is written by manufacturers. Check before you
  republish label text wholesale.
- **No endorsement.** In the licence page's words, "When using or citing the work, you
  should not imply endorsement by the author or the affirmer", here FDA.
- **Attribution is requested, not required.** The terms suggest the credit line
  `Data provided by the U.S. Food and Drug Administration (https://open.fda.gov)`. The
  export scripts below write it into their provenance files.
- **No warranty.** FDA disclaims warranties, says the data may contain errors, and every
  response carries a disclaimer to assume results are unvalidated and not to rely on them
  for medical decisions.
- **The service may be limited.** FDA reserves the right to restrict access for anyone who
  tries to exceed or get around the rate limits.
- **GMDN content** on the device endpoints needs a separate licence for commercial or
  AI-training reuse. None of the drug endpoints in this skill carry it.

Each endpoint's documentation adds its own caveats. They are limits on interpretation, and
a write-up that skips them misreports the data:

- **FAERS reports do not establish causation.** A report lists drugs and reactions with no
  link between any particular drug and any particular reaction. Reporters are voluntary
  (manufacturers are obliged to forward what they receive), the reports are not verified,
  and the FAERS page says the information "cannot be used to estimate the incidence of these
  events". Report volume follows how many people take a drug, how long it has been
  marketed, and publicity, as well as harm. FDA also notes that rising totals over time
  likely reflect better reporting.
- **Label text is as submitted.** The label page says the text has been reformatted but
  neither altered nor verified by FDA, and may not match the label on products currently
  distributed or the approved label. Most OTC products are not FDA-approved.
- **Recall records are not a live recall tracker.** The enforcement page says the data
  should not be used to issue public alerts or to track a recall's lifecycle, and that a
  recall's status is not updated after it is classified and published. The data only partly
  bears that last point out — see **Recalls** for what it does and does not refresh.

This page is original text, CC-BY-4.0, by Heureka Labs. It republishes no openFDA records
beyond counts quoted as observations.

## Which snapshot you are reading

Every response has `meta.last_updated`. The endpoints refresh on different schedules, so
record it with every pull:

```bash
for ep in drug/event drug/label drug/enforcement; do
  curl -fsS "https://api.fda.gov/$ep.json?limit=1" |
    python3 -c "import json,sys; m=json.load(sys.stdin)['meta']; print('$ep', m['last_updated'], m['results']['total'])"
done
```

On 2026-10-22 this printed:

```
drug/event 2026-07-30 20692690
drug/label 2026-10-22 262900
drug/enforcement 2026-10-14 18043
```

FAERS had last been refreshed on 2026-07-30, nearly three months earlier. The label endpoint
was refreshed during the day these runs were made, moving from 2026-10-21 to 2026-10-22. The bulk-download
manifest (see **Get the files**) carries its own `export_date` per endpoint, which can be
newer than the API's `last_updated`.

## How the API behaves

Base `https://api.fda.gov/<endpoint>.json`, with five parameters: `search`, `count`,
`limit`, `skip` and `sort`. Each row below was confirmed live on 2026-10-22, without a key:

| behaviour | consequence |
|---|---|
| A search with no hits returns **HTTP 404** with `{"error": {"code": "NOT_FOUND", "message": "No matches found!"}}` | treat it as zero results, not a failure |
| A **misspelled field** also returns that 404 | an empty answer is ambiguous; check the field with `_exists_:` |
| `limit` above 1000 returns HTTP 400 on `drug/label` and `drug/enforcement` | page instead |
| On `drug/event`, without a key, `limit=1000` (search or count) returns **HTTP 403 `API_KEY_MISSING`**; 999 works | use at most 999 there unless you have a key |
| `skip` above 25,000 returns HTTP 400 `Skip value must 25000 or less.` | skip and limit reach at most 25,999 records |
| With no `skip`, the response carries a `Link: <…search_after=…>; rel="next"` header | follow it to page past the skip ceiling |
| With a `skip`, the `Link` header is skip-based again | never mix `skip` and `search_after` |
| `count` with no `limit` returns **100** values, not the 1000 the query-parameters page states | ask for up to 1000 (999 on `drug/event` without a key) |
| `count` on an analysed text field returns **HTTP 500** (`Text fields are not optimised for operations that require per-document field data…`), though the query-syntax page says it counts single words | count the `.exact` variant, e.g. `reactionmeddrapt.exact`; the helper refuses at once rather than retrying |
| `count` on a date field returns `{"time": "YYYYMMDD", "count": n}` per day; others return `{"term": …}` | aggregate days yourself |
| FAERS records are large: 500 bedaquiline reports were a 21.8 MB response, which broke off mid-transfer | keep pages at about 100; the helper retries a broken transfer |
| No rate-limit headers are sent | pace yourself to the published limits |

The published limits (<https://open.fda.gov/apis/authentication/>): **240 requests per
minute and 1,000 per day per IP address without a key; 240 per minute and 120,000 per day
per key with one.** That page opens with "An API key is required", then lists the keyless
limits, and the adverse-event how-to page says a key is not needed to try or use the API.
The keyless route worked throughout. The 1,000-a-day ceiling is per IP address, so it is
shared by every script and colleague behind the same address.

This helper paces requests to the per-minute limit, backs off on HTTP 429 (honouring `Retry-
After` if one is sent) and on server errors, turns the 404 into an empty result, checks
field names when a search comes back empty, and pages by the `Link` header. It stops a run
after 500 requests (`OPENFDA_MAX_CALLS` raises that), so one script cannot spend a whole
keyless day. The later blocks import it, so run them from the same directory:

```bash
cat > openfda_api.py <<'PY'
"""A small openFDA client: optional key from the environment, pacing, 429 backoff,
404 "No matches found!" as an empty result, and paging by the Link header."""
import http.client
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.fda.gov"
KEY = os.environ.get("OPENFDA_API_KEY") or None   # never write a key into code
PER_MINUTE = 240                                  # published limit, with or without a key
PER_DAY = 120_000 if KEY else 1_000               # per key, or per IP address without one
MAX_PAGE = 1000 if KEY else 999                   # drug/event refuses limit=1000 without a key
SKIP_MAX = 25_000                                 # the server rejects a larger skip
MAX_CALLS = int(os.environ.get("OPENFDA_MAX_CALLS", 500 if not KEY else 20_000))
_state = {"calls": 0, "last": 0.0}


class OpenFDAError(RuntimeError):
    pass


def _with_key(url):
    """Put our key (or none) on a URL, replacing any key already in it."""
    parts = urllib.parse.urlsplit(url)
    query = [(k, v) for k, v in urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
             if k != "api_key"]
    if KEY:
        query.insert(0, ("api_key", KEY))
    return urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(query)))


def _label(url):
    """The URL without the key, safe to print."""
    parts = urllib.parse.urlsplit(url)
    query = [(k, v) for k, v in urllib.parse.parse_qsl(parts.query) if k != "api_key"]
    return parts.path + "?" + urllib.parse.unquote(urllib.parse.urlencode(query))


def get(url, tries=6):
    """One request. Returns (json, next_url). A 404 NOT_FOUND comes back as zero results."""
    url = _with_key(url)
    for attempt in range(tries):
        if _state["calls"] >= MAX_CALLS:
            raise OpenFDAError(f"refusing: {MAX_CALLS} requests already made in this run "
                               f"(daily cap {PER_DAY:,}); raise OPENFDA_MAX_CALLS deliberately")
        gap = 60 / PER_MINUTE - (time.monotonic() - _state["last"])
        if gap > 0:
            time.sleep(gap)
        _state["calls"] += 1
        _state["last"] = time.monotonic()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "openfda-skill/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                link = r.headers.get("Link") or ""
                m = re.search(r'<([^>]+)>;\s*rel="next"', link)
                return json.load(r), (m.group(1) if m else None)
        except urllib.error.HTTPError as e:
            try:
                err = json.load(e).get("error", {})
            except Exception:
                err = {}
            code, msg = err.get("code", ""), err.get("message", "")
            if e.code == 404 and code == "NOT_FOUND":
                return {"meta": None, "results": []}, None
            if "illegal_argument" in err.get("details", ""):   # a 500 that retrying cannot fix
                raise OpenFDAError(f"HTTP {e.code}: {err['details'][:110]}... Count or sort "
                                   f"the .exact variant of a text field [{_label(url)}]") from None
            if (e.code == 429 or e.code >= 500) and attempt < tries - 1:
                after = e.headers.get("Retry-After", "")      # seconds, or an HTTP date
                time.sleep(min(float(after), 300) if after.isdigit() else min(60, 2 ** attempt))
                continue
            hint = ""
            if code == "API_KEY_MISSING" and not KEY:
                hint = f" (without a key, drug/event refuses limit above {MAX_PAGE})"
            raise OpenFDAError(f"HTTP {e.code} {code}: {msg}{hint} [{_label(url)}]") from None
        except (urllib.error.URLError, http.client.HTTPException, TimeoutError, ConnectionError) as e:
            if attempt == tries - 1:
                raise OpenFDAError(f"network error {e} [{_label(url)}]") from None
            time.sleep(min(60, 2 ** attempt))
    raise OpenFDAError(f"gave up after {tries} tries [{_label(url)}]")


def url_for(endpoint, **params):
    """endpoint like 'drug/event'; params are search=, count=, limit=, sort=."""
    params = {k: v for k, v in params.items() if v is not None}
    return f"{BASE}/{endpoint}.json?" + urllib.parse.urlencode(params)


def fields_in(search):
    """Field names used in a search string (quoted terms removed first)."""
    bare = re.sub(r'"[^"]*"', '""', search)
    names = re.findall(r"([A-Za-z_][\w.]*):", bare)
    names += re.findall(r"_exists_:([\w.]+)", bare)
    return sorted({n for n in names if n != "_exists_"})


def check_fields(endpoint, search):
    """An unknown field gives the same 404 as a real empty result. Ask whether each
    field exists anywhere in the endpoint, and refuse if one never does."""
    for f in fields_in(search):
        data, _ = get(url_for(endpoint, search=f"_exists_:{f}", limit=1))
        if not data["results"]:
            raise OpenFDAError(f"field '{f}' matches no record in {endpoint}: "
                               "misspelled, or not a searchable field of this endpoint")


def total(endpoint, search=None):
    """How many records match; 0 when the server says No matches found."""
    data, _ = get(url_for(endpoint, search=search, limit=1))
    if data["meta"] is None:
        if search:
            check_fields(endpoint, search)
        return 0, None
    return data["meta"]["results"]["total"], data["meta"]["last_updated"]


def fetch_all(endpoint, search, max_records=5_000, page=100):
    """Every record a search matches, following the Link header (search_after), which
    is not bound by the skip ceiling. Refuses before paging if the match is too large."""
    if not 1 <= page <= MAX_PAGE:
        raise OpenFDAError(f"page must be 1..{MAX_PAGE}")
    data, nxt = get(url_for(endpoint, search=search, limit=page))   # no skip: Link uses search_after
    if data["meta"] is None:
        check_fields(endpoint, search)
        return [], {"total": 0, "last_updated": None}
    n, updated = data["meta"]["results"]["total"], data["meta"]["last_updated"]
    if n > max_records:
        raise OpenFDAError(f"refusing: {n:,} records match, over max_records {max_records:,}. "
                           "Narrow the search, use count=, or use the bulk download.")
    rows = list(data["results"])
    while nxt and len(rows) < n:
        data, nxt = get(nxt)
        if data["meta"] and data["meta"]["last_updated"] != updated:
            raise OpenFDAError("the endpoint was refreshed while paging; run again")
        rows += data["results"]
    if len(rows) != n:
        raise OpenFDAError(f"received {len(rows)} records, server reported {n}")
    return rows, {"total": n, "last_updated": updated}


def count(endpoint, field, search=None, limit=1000):
    """Top values of a field among matching records, as (term, count) pairs. The server
    returns 100 when no limit is given. Use a .exact field for whole phrases."""
    data, _ = get(url_for(endpoint, search=search, count=field, limit=min(limit, MAX_PAGE)))
    if data["meta"] is None:                        # also a 404: check the names
        check_fields(endpoint, f"{search or ''} _exists_:{field}")
    return [(r.get("term", r.get("time")), r["count"]) for r in data["results"]]
PY
python3 -c "import openfda_api as o; print('key' if o.KEY else 'no key', o.total('drug/enforcement'))"
```

Printed, without a key:

```
no key (18043, '2026-10-14')
```

The empty-result and refusal paths, in one go:

```python
import openfda_api as o

E = "drug/event"
print(o.total(E, 'patient.drug.activesubstance.activesubstancename:"notadrugname"'))
for label, call in [
    ("misspelled field", lambda: o.total(E, 'patient.drug.activesubstance.activesubstancenam:"pretomanid"')),
    ("skip past the ceiling", lambda: o.get(o.url_for(E, search="receivedate:[20200101 TO 20201231]",
                                                      limit=1, skip=25001))),
    ("limit 1000 on drug/event", lambda: o.get(o.url_for(E, limit=1000))),
]:
    try:
        call()
        print(label, "-> accepted")
    except o.OpenFDAError as e:
        print(label, "-> refused:", e)
```

On 2026-10-22 this printed:

```
(0, None)
misspelled field -> refused: field 'patient.drug.activesubstance.activesubstancenam' matches no record in drug/event: misspelled, or not a searchable field of this endpoint
skip past the ceiling -> refused: HTTP 400 BAD_REQUEST: Skip value must 25000 or less. [/drug/event.json?search=receivedate:[20200101+TO+20201231]&limit=1&skip=25001]
limit 1000 on drug/event -> refused: HTTP 403 API_KEY_MISSING: No api_key was supplied. Get one at https://api.fda.gov:443 (without a key, drug/event refuses limit above 999) [/drug/event.json?limit=1000]
```

The first line is a real zero: the field exists, nothing matched. The second is a typo that
the server answered with the same 404, caught because `_exists_:` on that field matches no
record anywhere. With a key the last call is accepted.

## The query grammar

- `search=field:term`. Without a field, every field is searched.
- Quote phrases: `field:"heart failure"`. Unquoted words are matched one by one.
- `AND` and `OR` combine terms; parentheses group them. In a URL the space is `+`; the
  helper encodes it for you. A bare space between two terms means OR.
- Ranges: `receivedate:[20240101 TO 20241231]`. Dates are `YYYYMMDD` strings; the dashed
  form `2024-01-01` was also accepted.
- `_exists_:field` matches records where the field is present.
- `count=field` returns the top values among matching records, each with the number of
  records that hold it.
- `sort=receivedate:desc` orders records.

Text fields are analysed: matching is case-insensitive and by word, so
`generic_name:"semaglutide"` also matches the value `ORAL SEMAGLUTIDE`. The `.exact`
variants match the whole stored value, case included.

## Adverse events (FAERS)

### Finding a drug: four name fields, none complete

A FAERS drug entry carries the name as reported (`medicinalproduct`, free text, often a
brand), an FDA-coded active ingredient (`activesubstance.activesubstancename`), and an
`openfda` block that openFDA adds by matching the entry to a product label
(`openfda.generic_name`, `brand_name`, and others). The match fails for many entries,
and for some drugs entirely:

```python
import openfda_api as o

E = "drug/event"
for name, brand in [("sotatercept", "WINREVAIR"), ("fezolinetant", "VEOZAH"), ("pretomanid", "PRETOMANID")]:
    fields = {
        "openfda.generic_name": f'patient.drug.openfda.generic_name:"{name}"',
        "medicinalproduct=name": f'patient.drug.medicinalproduct:"{name}"',
        "medicinalproduct=brand": f'patient.drug.medicinalproduct:"{brand}"',
        "activesubstancename": f'patient.drug.activesubstance.activesubstancename:"{name}"',
    }
    counts = {k: o.total(E, s)[0] for k, s in fields.items()}
    counts["any of them"] = o.total(E, "(" + " OR ".join(fields.values()) + ")")[0]
    print(name, counts)
```

On 2026-10-22 this printed:

```
sotatercept {'openfda.generic_name': 0, 'medicinalproduct=name': 3024, 'medicinalproduct=brand': 5026, 'activesubstancename': 7915, 'any of them': 7986}
fezolinetant {'openfda.generic_name': 2122, 'medicinalproduct=name': 274, 'medicinalproduct=brand': 1855, 'activesubstancename': 2122, 'any of them': 2125}
pretomanid {'openfda.generic_name': 727, 'medicinalproduct=name': 727, 'medicinalproduct=brand': 727, 'activesubstancename': 734, 'any of them': 734}
```

Sotatercept, approved in 2024, has no harmonised generic name at all, so a search on
`openfda.generic_name` reports zero. Fezolinetant is harmonised, but its product-name field
mostly holds the brand. For both, no single field caught every report. **Search the OR of the
active-substance name, the generic name, and the product name with each brand**, and record
which fields you used. The harmonised block can also mislead: every one of the 73,001 reports
matched by `openfda.generic_name:"semaglutide"` on 2026-10-22 carried the generic name `ORAL
SEMAGLUTIDE`, injectable products included. A semaglutide label that lists both OZEMPIC and
RYBELSUS with an oral route (see **Drug labels**) is the likely source.

### A search cannot say "where this drug is the suspect"

Each drug entry has `drugcharacterization`: 1 suspect, 2 concomitant, 3 interacting, as the
reporter said, unvalidated. A search such as
`activesubstancename:"pretomanid" AND drugcharacterization:1` does **not** require that
the pretomanid entry is the suspect one. The server matches each condition against any
entry in the report, so the result includes reports where pretomanid was concomitant and
another drug was suspect. Fetch the records and check the role on the matching entry
yourself. The export script under **Get the files** does that, and `## Try it` measures the
gap.

### What a count is

`count=patient.reaction.reactionmeddrapt.exact` returns, per MedDRA preferred term, the
number of **reports** that list it. That number is the same as the total of a search for
that term:

```python
from collections import Counter
import openfda_api as o

E = "drug/event"
DRUG = 'patient.drug.activesubstance.activesubstancename:"pretomanid"'
n_drug, updated = o.total(E, DRUG)
top = o.count(E, "patient.reaction.reactionmeddrapt.exact", DRUG, limit=10)
for term, n in top[:5]:
    print(f"{n:>5}  {term}")
term, n = top[0]
same = o.total(E, f'{DRUG} AND patient.reaction.reactionmeddrapt.exact:"{term}"')[0]
print("count equals search total:", n == same)
try:
    o.count(E, "patient.reaction.reactionmeddrapt", DRUG, limit=5)
except o.OpenFDAError as e:
    print("without .exact:", str(e)[:60], "...")
by_year = Counter()
for day, k in o.count(E, "receivedate", DRUG):
    by_year[day[:4]] += k
print(dict(sorted(by_year.items())), "sum", sum(by_year.values()), "of", n_drug, "| FAERS", updated)
```

On 2026-10-22 this printed:

```
  121  DEATH
   80  ANAEMIA
   78  NEUROPATHY PERIPHERAL
   63  OFF LABEL USE
   51  ELECTROCARDIOGRAM QT PROLONGED
count equals search total: True
without .exact: HTTP 500: [illegal_argument_exception] Text fields are not o ...
{'2015': 7, '2016': 3, '2018': 4, '2019': 13, '2020': 9, '2021': 6, '2022': 69, '2023': 126, '2024': 173, '2025': 192, '2026': 132} sum 734 of 734 | FAERS 2026-07-30
```

Things to carry into any write-up:

- **A report is not a patient and not an event rate.** There is no denominator of exposed
  patients. Reaction terms are MedDRA preferred terms, in British spelling (`DIARRHOEA`).
- **Dates.** `receivedate` is when FDA first received the case; `receiptdate` is when the
  latest version arrived. openFDA shows only the latest version of a case, and its
  `duplicate` field is 1 when earlier versions existed. The same event can still arrive as
  separate cases from different reporters, and openFDA does not merge them.
- **Seriousness.** `serious` is `1` (death, life-threatening, hospitalisation, disability,
  congenital anomaly, or other serious) or `2`, and can be missing. The field definitions say
  `seriousnessdeath` and its siblings are `1` or absent, but `2` is common in the data.
  `count=seriousnessdeath` over the 734 pretomanid reports found by the OR of the name
  fields returned `1` 289 times and `2` 408 times, leaving 37 reports with no value at all.
  Treat only `1` as yes, and never read "absent" as "no".
- **Coded fields.** `patientsex` 0 unknown, 1 male, 2 female. `patientonsetage` is in the
  unit `patientonsetageunit` names: 800 decade, 801 year, 802 month, 803 week, 804 day,
  805 hour. `primarysource.qualification` 1 physician, 2 pharmacist, 3 other health
  professional, 4 lawyer, 5 consumer. `primarysource` itself can be missing.

### A disproportionality screen, and its limits

What FAERS supports is a comparison of *reporting*: is an event a larger share of one
drug's reports than of the reports you compare it against? The proportional reporting ratio
(PRR) is the simplest such measure. Evans and colleagues defined it over **reactions** in
the UK Yellow Card scheme; what follows is the usual FAERS adaptation, over **reports**,
with the drug in any role. Say which one you computed.

**The background decides the answer.** This block runs the same arithmetic twice: against
every other report, and against reports of the drug pretomanid is co-prescribed with. Both
drugs are searched with the OR of the name fields, as above — a single field would have
quietly moved real reports from one side of the table to the other.

```python
import math

import openfda_api as o

E = "drug/event"


def any_name(name, *brands):
    """The OR of the name fields, as everywhere else on this page."""
    terms = [f'patient.drug.activesubstance.activesubstancename:"{name}"',
             f'patient.drug.openfda.generic_name:"{name}"',
             f'patient.drug.medicinalproduct:"{name}"']
    terms += [f'patient.drug.medicinalproduct:"{b}"' for b in brands]
    return "(" + " OR ".join(terms) + ")"


DRUG = any_name("pretomanid")
CO = any_name("linezolid", "zyvox")               # the drug it is always given with
EVENT = 'patient.reaction.reactionmeddrapt.exact:"OPTIC NEURITIS"'


def prr(drug, background, event):
    """PRR of `event` in `drug`'s reports against `background`'s, with a 2x2 table."""
    cells = [o.total(E, s) for s in (f"{drug} AND {event}", drug,
                                     f"{background} AND {event}", background)]
    if len({updated for _, updated in cells if updated}) != 1:   # an empty cell carries no meta
        raise SystemExit("the endpoint refreshed during the run; run again")
    a, n_drug, c, n_bg = (n for n, _ in cells)
    b, d = n_drug - a, n_bg - c
    if min(a, b, c, d) == 0:
        raise SystemExit(f"a={a} b={b} c={c} d={d}: an empty cell, so there is no ratio")
    if a < 3:
        raise SystemExit(f"only {a} reports list both; too few for a PRR")
    ratio = (a / (a + b)) / (c / (c + d))
    se = math.sqrt(1 / a - 1 / (a + b) + 1 / c - 1 / (c + d))
    n = a + b + c + d
    chi2 = n * (abs(a * d - b * c) - n / 2) ** 2 / ((a + b) * (c + d) * (a + c) * (b + d))
    return a, b, c, d, ratio, ratio * math.exp(-1.96 * se), ratio * math.exp(1.96 * se), chi2


for label, background in [("every other report", f"NOT {DRUG}"),
                          ("linezolid without pretomanid", f"{CO} AND NOT {DRUG}")]:
    a, b, c, d, ratio, lo, hi, chi2 = prr(DRUG, background, EVENT)
    print(f"vs {label:<29} a={a} b={b} c={c} d={d}  "
          f"PRR={ratio:.1f} (95% CI {lo:.1f}-{hi:.1f})  chi2={chi2:.0f}")

with_co = o.total(E, f"{DRUG} AND {CO}")[0]
event_with_co = o.total(E, f"{DRUG} AND {EVENT} AND {CO}")[0]
print(f"of {o.total(E, DRUG)[0]} pretomanid reports, {with_co} also list linezolid; "
      f"of the {o.total(E, f'{DRUG} AND {EVENT}')[0]} with optic neuritis, {event_with_co} do")
```

On 2026-10-22 this printed:

```
vs every other report            a=16 b=718 c=8984 d=20682972  PRR=50.2 (95% CI 30.9-81.5)  chi2=722
vs linezolid without pretomanid  a=16 b=718 c=180 d=31201  PRR=3.8 (95% CI 2.3-6.3)  chi2=28
of 734 pretomanid reports, 650 also list linezolid; of the 16 with optic neuritis, 16 do
```

Evans and colleagues screened on a PRR of at least 2, a chi-squared of at least 4 and at
least three cases. Both comparisons clear that, and they differ by more than an order of
magnitude. The second one is the one to report.

**This is co-medication confounding, not confounding by indication.** The indication is not
what moves the number; the drug sitting beside pretomanid in every one of the 16 reports is.
Both labels say as much. Pretomanid is indicated "as part of a combination regimen with
bedaquiline and linezolid", and its warnings say "Peripheral neuropathy and optic
neuropathy were reported with the combination regimen of Pretomanid Tablets, bedaquiline,
and linezolid" (`drug/label` `set_id` `f1906fc9-cb3c-4e13-8a4a-da76100c1bf3`, effective
2024-11-15). The ZYVOX (linezolid) label warns of "Peripheral and Optic Neuropathy:
Reported primarily in patients treated for longer than 28 days" (`set_id`
`3e5e9975-6f36-42e4-ab46-0e75dda83592`, effective 2026-07-09). Against a linezolid-exposed
background the ratio falls from 50 to 3.8, and reporting the 50 alone would be an
order-of-magnitude overstatement that a reader would repeat.

**Read the 3.8 as more likely an overestimate than an underestimate of what pretomanid adds,
and not as a measurement of it.** The second comparison matches the two groups on linezolid
exposure and on nothing else, and duration is the unmatched term that matters most. The
ZYVOX label ties the neuropathy mainly to courses "longer than 28 days", while the same
pretomanid label prescribes linezolid at "600 mg orally once daily for 26 weeks" as part of
the regimen. The pretomanid reports therefore come from a prescribed course about six times
the duration the linezolid label associates with the event, and the background group is not
matched on it. That difference pushes the ratio up, so part of the 3.8 may be exposure
length rather than anything pretomanid contributes.

That is a direction, not a limit. The estimate carries its own sampling interval of 2.3 to
6.3, and other unmatched differences move it both ways: reporting stimulated by the
regimen's own labelled warning would inflate it, while the long linezolid courses sitting in
the background group — XDR-TB, osteomyelitis — damp the contrast.

Nor does duration demonstrably account for the gap. FAERS does carry `drugtreatmentduration`
and `drugstartdate` on each drug entry, so the question is answerable in principle, but the
fields are uneven and, like `drugcharacterization`, a search cannot bind them to the entry
you looked for: on the 2026-07-30 snapshot a duration appears on some entry of 67% of the
pretomanid reports and of 23% of the linezolid background. Matching on exposure therefore
means reading those fields off the right entry, report by report, which is case review and
not a count. Until someone does that, the honest claim is that 3.8 is what remains after
matching on linezolid alone.

Three limits hold whichever background you use. `a` counts reports listing the drug in
**any** role, because the search cannot bind the role (see above) — and the fix is not to
make `a` suspect-only on the client while `c` stays unfiltered, which would score the two
groups by different rules. A report is not a patient, so none of this is a rate. And a
signal is a reason to review cases, never evidence of risk: publish the 2x2 table, the
background and the snapshot date, so a reader can see which comparison produced the number.

## Drug labels

One record is one version of one SPL document. `set_id` identifies the document across
versions; `id` identifies this version; `effective_time` dates it. Each `set_id` appeared
once in every search run here, so the API holds one version per set. Several sets can cover
one molecule: one per manufacturer, repackager or product line. Sections such as
`indications_and_usage`, `boxed_warning`, `adverse_reactions` and `contraindications` are
**lists of strings**, and only the sections a label has are present. Tables come as lists of
HTML strings in `*_table` fields, which are not searchable:
`_exists_:adverse_reactions_table` matched nothing, though the semaglutide labels carry one.

```python
import openfda_api as o

L = "drug/label"
rows, meta = o.fetch_all(L, 'openfda.generic_name:"semaglutide"')
for r in sorted(rows, key=lambda r: r["effective_time"], reverse=True):
    f = r.get("openfda", {})
    print(r["set_id"][:8], r["effective_time"], "v" + r["version"], f.get("brand_name"),
          f.get("route"), "boxed" if "boxed_warning" in r else "")
for s in ['openfda.generic_name:"semaglutide"', 'spl_product_data_elements:"semaglutide"', "semaglutide"]:
    print(o.total(L, s)[0], s)
print(o.total(L, "_exists_:openfda.generic_name")[0], "of", o.total(L)[0], "labels have an openfda block")
```

On 2026-10-22 this printed:

```
42bdd912 20260730 v1 ['Ozempic'] ['SUBCUTANEOUS'] boxed
27f15fac 20260130 v14 ['OZEMPIC', 'RYBELSUS'] ['ORAL'] boxed
f5e548d0 20240423 v6 ['WEGOVY'] ['SUBCUTANEOUS'] boxed
979e4df4 20231122 v3 ['Ozempic'] ['SUBCUTANEOUS'] boxed
e6da837c 20231117 v6 ['OZEMPIC'] ['SUBCUTANEOUS'] boxed
5 openfda.generic_name:"semaglutide"
10 spl_product_data_elements:"semaglutide"
18 semaglutide
82899 of 262900 labels have an openfda block
```

Two things to take from that. The harmonised `openfda` block is present on about a third of
labels, so a search on `openfda.*` fields misses most of the rest.
`spl_product_data_elements` (the product's name and ingredients as listed in the SPL) finds
labels without it. An unfielded search found 18, because it looks in every section, so it
can also return labels that only mention the drug. And the harmonisation can merge products:
one set carries both `OZEMPIC` and `RYBELSUS` with an oral route. Use `set_id` and the
label's own text, not the `openfda` block, to say which product a label is for.

## Recalls (enforcement reports)

One record is one product in a recall. `recall_number` is per product; `event_id` groups
the products of one recall. `classification` is FDA's hazard class: Class I (reasonable
probability of serious harm or death), II, or III. Dates (`recall_initiation_date`,
`report_date`, `center_classification_date`, `termination_date`) are `YYYYMMDD`. They do not
share a floor: the oldest `report_date` is 2012-06-20, while `recall_initiation_date` goes
back to 2006-02-24.

```python
import openfda_api as o

R = "drug/enforcement"
print(o.count(R, "classification.exact"))
print(o.count(R, "status.exact"))
print(o.total(R, "_exists_:openfda.generic_name")[0], "of", o.total(R)[0], "records have an openfda block")
S = 'product_description:"metformin" AND reason_for_recall:"NDMA"'
print("NDMA metformin:", o.total(R, S)[0], "products in", len(o.count(R, "event_id", S)), "recall events;",
      o.total(R, 'openfda.generic_name:"metformin" AND reason_for_recall:"NDMA"')[0], "via openfda.generic_name")

# Does a status ever move? Ask the dates rather than the documentation.
for status in ("Terminated", "Ongoing"):
    q = f'status:"{status}"'
    dated = o.total(R, q + " AND _exists_:termination_date")[0]
    oldest = min(day for day, _ in o.count(R, "report_date", q))
    print(f"{status}: {o.total(R, q)[0]} records, {dated} with a termination_date, "
          f"oldest report_date {oldest}")
month, _ = o.fetch_all(R, 'status:"Terminated" AND report_date:[20240101 TO 20240131]')
later = sum(r.get("termination_date", "") > r["report_date"] for r in month)
print(f"of {len(month)} terminated recalls reported in January 2024, "
      f"{later} carry a termination_date later than the report")
```

On 2026-10-22 this printed:

```
[('Class II', 14572), ('Class I', 1750), ('Class III', 1719), ('Not Yet Classified', 2)]
[('Terminated', 14813), ('Ongoing', 2797), ('Completed', 433)]
3097 of 18043 records have an openfda block
NDMA metformin: 47 products in 27 recall events; 14 via openfda.generic_name
Terminated: 14813 records, 14812 with a termination_date, oldest report_date 20120620
Ongoing: 2797 records, 0 with a termination_date, oldest report_date 20121128
of 72 terminated recalls reported in January 2024, 72 carry a termination_date later than the report
```

Only about one recall record in six carries the harmonised `openfda` block, so search
`product_description` (and `reason_for_recall` for the cause). Count events, not records,
when the question is "how many recalls".

**What `status` does and does not record.** The enforcement page says FDA does not update a
recall's status after it is classified. The data only half agrees, and this is one more
case of the documentation and the live records disagreeing. Terminations *are* written back:
14,812 of the 14,813 `Terminated` records carry a `termination_date`, and all 72 of the
terminated recalls reported in January 2024 were terminated later than they were reported
(`D-0179-2024`, reported 2024-01-03, terminated 2024-09-29). The other side is what never
moves. No `Ongoing` record carries a `termination_date` at all, and 143 of them were
reported between 2012 and 2015 — the whole endpoint's report dates start on 2012-06-20, so
those are among the oldest records it has. Read `Ongoing` as "never recorded as finished"
rather than as running today, use `termination_date` for what actually happened, and date
any statement you make from this endpoint.

## Get the files

### Adverse-event reports for one drug and period, as a table

`faers_export.py` writes `faers_<drug>_<start>_<end>.csv`, one row per report, and a
`.provenance.json` beside it. The JSON is the summary: the query exactly as sent, the FAERS
`last_updated`, the counts, how many reports had the drug as suspect, the licence and the
caveats. The CSV holds only data.

It searches the OR of the active-substance, generic and product-name fields (plus any brand
names you pass), within a `receivedate` range. For each report it finds the drug entries that
name the drug and records the strongest role among them (suspect, then interacting, then
concomitant), so the suspect-only subset is a filter on a column rather than a query the
server cannot answer. If the server matched a report but no entry names the drug, the role is
left empty and the provenance counts those reports. If nothing matches, it still writes the
provenance file, removes any stale CSV, and exits saying so. A misspelled field is refused by
the helper before that point.

```bash
cat > faers_export.py <<'PY'
"""One row per FAERS report for a drug and a receivedate range, plus a provenance file."""
import csv
import json
import os
import sys
from collections import Counter

import openfda_api as o

NAME = sys.argv[1].lower()                       # active ingredient, e.g. pretomanid
START, END = sys.argv[2], sys.argv[3]            # YYYYMMDD, inclusive
BRANDS = [b.upper() for b in sys.argv[4:]]       # optional brand names
MAX_RECORDS = 5_000                              # refuse larger pulls; narrow the dates instead
ROLE = {"1": "suspect", "3": "interacting", "2": "concomitant"}
RANK = ["1", "3", "2"]

terms = [f'patient.drug.activesubstance.activesubstancename:"{NAME}"',
         f'patient.drug.openfda.generic_name:"{NAME}"',
         f'patient.drug.medicinalproduct:"{NAME}"']
terms += [f'patient.drug.medicinalproduct:"{b}"' for b in BRANDS]
query = f"({' OR '.join(terms)}) AND receivedate:[{START} TO {END}]"
stem = f"faers_{NAME.replace(' ', '_')}_{START}_{END}"


def names_drug(d):
    names = [d.get("medicinalproduct") or ""]
    names += [(d.get("activesubstance") or {}).get("activesubstancename") or ""]
    names += (d.get("openfda") or {}).get("generic_name", [])
    names = [n.upper() for n in names]
    return any(NAME.upper() in n for n in names) or any(b in n for b in BRANDS for n in names)


rows, meta = o.fetch_all("drug/event", query, max_records=MAX_RECORDS)
if meta["last_updated"] is None:                 # nothing matched: date the snapshot anyway
    meta["last_updated"] = o.total("drug/event")[1]
out, roles = [], Counter()
for r in rows:
    p = r.get("patient") or {}
    drugs = p.get("drug") or []
    mine = [d.get("drugcharacterization") for d in drugs if names_drug(d)]
    role = next((ROLE[c] for c in RANK if c in mine), "")
    roles[role or "no entry names the drug"] += 1
    out.append({
        "safetyreportid": r["safetyreportid"],
        "receivedate": r.get("receivedate", ""),
        "receiptdate": r.get("receiptdate", ""),
        "role_of_drug": role,
        "serious": r.get("serious", ""),
        "death": "1" if r.get("seriousnessdeath") == "1" else "",   # also seen as "2"
        "hospitalisation": "1" if r.get("seriousnesshospitalization") == "1" else "",
        "country": r.get("occurcountry", ""),
        "reporter_qualification": (r.get("primarysource") or {}).get("qualification", ""),
        "sex": p.get("patientsex", ""),
        "onset_age": p.get("patientonsetage", ""),
        "onset_age_unit": p.get("patientonsetageunit", ""),
        "n_drugs": len(drugs),
        "suspect_drugs": "; ".join(sorted({d.get("medicinalproduct") or "" for d in drugs
                                           if d.get("drugcharacterization") == "1"})),
        "reactions": "; ".join(x.get("reactionmeddrapt", "") for x in p.get("reaction") or []),
    })

prov = {
    "source": "openFDA drug/event (FAERS)",
    "faers_last_updated": meta["last_updated"],
    "query": query,
    "reports": len(out),
    "role_of_drug": dict(roles.most_common()),
    "csv": f"{stem}.csv" if out else None,
    "columns_coded": {"serious": "1 serious, 2 not", "death/hospitalisation": "1 if flagged, else empty (source also uses 2 or omits it)",
                      "sex": "0 unknown, 1 male, 2 female",
                      "onset_age_unit": "800 decade, 801 year, 802 month, 803 week, 804 day, 805 hour",
                      "reporter_qualification": "1 physician, 2 pharmacist, 3 other HCP, 4 lawyer, 5 consumer"},
    "caveats": ["Spontaneous reports: no denominator, so counts are not incidence.",
                "A report does not establish that any drug caused any reaction.",
                "role_of_drug is the reporter's attribution and is not validated by FDA."],
    "licence": "CC0 1.0, https://open.fda.gov/license/ ; terms https://open.fda.gov/terms/",
    "attribution": "Data provided by the U.S. Food and Drug Administration (https://open.fda.gov)",
    "requests_made": o._state["calls"],
}
with open(f"{stem}.provenance.json", "w") as fh:
    json.dump(prov, fh, indent=2)
if not out:
    if os.path.exists(f"{stem}.csv"):            # a CSV from an earlier run would contradict "csv": null
        os.remove(f"{stem}.csv")
    raise SystemExit(f"no FAERS reports for {NAME} received {START}-{END} "
                     f"(FAERS last_updated {meta['last_updated']}); wrote {stem}.provenance.json only")
with open(f"{stem}.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(out[0]))
    w.writeheader()
    w.writerows(out)
print(f"{len(out)} reports -> {stem}.csv; role of {NAME}: {dict(roles.most_common())}; "
      f"FAERS {meta['last_updated']}; {o._state['calls']} requests")
PY
python3 faers_export.py pretomanid 20240101 20241231
python3 faers_export.py pretomanid 20000101 20031231
```

On 2026-10-22 this printed:

```
173 reports -> faers_pretomanid_20240101_20241231.csv; role of pretomanid: {'suspect': 163, 'concomitant': 10}; FAERS 2026-07-30; 2 requests
no FAERS reports for pretomanid received 20000101-20031231 (FAERS last_updated 2026-07-30); wrote faers_pretomanid_20000101_20031231.provenance.json only
```

The second run is the empty path. FAERS in openFDA starts in 2004, and pretomanid's
earliest report was received in 2015, so nothing matched and the script wrote only the
provenance file, still dated with the FAERS snapshot. Of the 173 reports received in 2024,
pretomanid was the suspect drug in 163 and only concomitant in 10.
For a drug with more than 5,000 reports in the range, narrow the dates and run it per year,
or use the bulk files below.

### Label sections for one drug

```bash
cat > label_export.py <<'PY'
"""Selected sections of every label matching a drug, as JSON, plus a provenance file."""
import json
import os
import sys

import openfda_api as o

NAME = sys.argv[1].lower()
SECTIONS = ["indications_and_usage", "boxed_warning", "contraindications",
            "warnings_and_cautions", "adverse_reactions", "drug_interactions"]
query = f'openfda.generic_name:"{NAME}" OR spl_product_data_elements:"{NAME}"'
rows, meta = o.fetch_all("drug/label", query, max_records=500)
labels = [{
    "set_id": r["set_id"], "id": r["id"], "version": r.get("version"),
    "effective_time": r.get("effective_time"),
    "brand_name": (r.get("openfda") or {}).get("brand_name", []),
    "manufacturer_name": (r.get("openfda") or {}).get("manufacturer_name", []),
    "sections": {s: r[s] for s in SECTIONS if s in r},
} for r in sorted(rows, key=lambda r: r.get("effective_time", ""), reverse=True)]
stem = f"labels_{NAME.replace(' ', '_')}"
with open(f"{stem}.provenance.json", "w") as fh:
    json.dump({"source": "openFDA drug/label (SPL)", "label_last_updated": meta["last_updated"],
               "query": query, "labels": len(labels), "sections_requested": SECTIONS,
               "json": f"{stem}.json" if labels else None,
               "caveat": "Text as submitted by the labeler; reformatted, not altered or verified by FDA; "
                         "may differ from the label on distributed products.",
               "licence": "CC0 1.0 unless marked otherwise, https://open.fda.gov/license/"}, fh, indent=2)
if not labels:
    if os.path.exists(f"{stem}.json"):
        os.remove(f"{stem}.json")
    raise SystemExit(f"no labels match {NAME}; wrote {stem}.provenance.json only")
with open(f"{stem}.json", "w") as fh:
    json.dump(labels, fh, indent=1)
print(len(labels), "labels ->", f"{stem}.json;",
      sum("boxed_warning" in x["sections"] for x in labels), "with a boxed warning")
PY
python3 label_export.py semaglutide
```

On 2026-10-22 this printed:

```
10 labels -> labels_semaglutide.json; 10 with a boxed warning
```

### Recall records for a search

```bash
cat > recall_export.py <<'PY'
"""Drug enforcement (recall) records for a search, as CSV, plus a provenance file."""
import csv
import json
import os
import sys

import openfda_api as o

QUERY = sys.argv[1]          # e.g. 'product_description:"metformin" AND reason_for_recall:"NDMA"'
STEM = sys.argv[2]
COLS = ["recall_number", "event_id", "classification", "status", "recall_initiation_date",
        "center_classification_date", "report_date", "termination_date", "recalling_firm",
        "voluntary_mandated", "distribution_pattern", "product_description", "reason_for_recall",
        "code_info"]
rows, meta = o.fetch_all("drug/enforcement", QUERY, max_records=5_000)
with open(f"{STEM}.provenance.json", "w") as fh:
    json.dump({"source": "openFDA drug/enforcement (RES)", "last_updated": meta["last_updated"],
               "query": QUERY, "records": len(rows), "events": len({r["event_id"] for r in rows}),
               "csv": f"{STEM}.csv" if rows else None,
               "caveat": "status is not updated after publication; not for public alerts or lifecycle tracking.",
               "licence": "CC0 1.0, https://open.fda.gov/license/"}, fh, indent=2)
if not rows:
    if os.path.exists(f"{STEM}.csv"):
        os.remove(f"{STEM}.csv")
    raise SystemExit(f"no recall records match; wrote {STEM}.provenance.json only")
with open(f"{STEM}.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=COLS, extrasaction="ignore")
    w.writeheader()
    w.writerows(sorted(rows, key=lambda r: r.get("report_date", "")))
print(len(rows), "records in", len({r["event_id"] for r in rows}), "events ->", f"{STEM}.csv")
PY
python3 recall_export.py 'product_description:"metformin" AND reason_for_recall:"NDMA"' recalls_metformin_ndma
```

On 2026-10-22 this printed:

```
47 records in 27 events -> recalls_metformin_ndma.csv
```

### Bulk downloads

When a question spans more than a few thousand records, or the 1,000-request day is not
enough, use the bulk files. `https://api.fda.gov/download.json` lists every file with its
size in MiB (compressed) and record count. Measured on 2026-10-22:

| endpoint | files | compressed | records | export date |
|---|---|---|---|---|
| `drug/event` | 1,767, by received quarter | 108,155 MiB (about 113 GB) | 20,692,690 | 2026-10-21 |
| `drug/label` | 14 | 1,773 MiB | 262,900 | 2026-10-22 |
| `drug/enforcement` | 1 | 3.8 MiB | 18,043 | 2026-10-21 |

Each file is a zip holding one JSON document with the same `meta` and `results` as the API.
The manifest's `size_mb` agreed with `Content-Length` to its two decimals for the three
files checked (4,001,641 B is 3.82 MiB). No checksums are published, so the block checks the record
count instead. One FAERS quarter at a time, with a free-space check first:

```bash
QUARTER=2004q1            # a folder name from the manifest, e.g. 2024q3
python3 - "$QUARTER" <<'PY'
import json, os, shutil, sys, urllib.request, zipfile
quarter = sys.argv[1]
man = json.load(urllib.request.urlopen("https://api.fda.gov/download.json", timeout=120))
parts = [p for p in man["results"]["drug"]["event"]["partitions"] if f"/{quarter}/" in p["file"]]
if not parts:
    raise SystemExit(f"no FAERS partitions for {quarter}")
need = sum(float(p["size_mb"]) for p in parts) * 1024 * 1024 * 1.1  # zips are kept; nothing is unpacked
free = shutil.disk_usage(".").free
if free < need:
    raise SystemExit(f"refusing: {free / 1e9:.1f} GB free, about {need / 1e9:.1f} GB needed")
os.makedirs(f"faers_{quarter}", exist_ok=True)
total = 0
for p in parts:
    dest = os.path.join(f"faers_{quarter}", p["file"].rsplit("/", 1)[1])
    urllib.request.urlretrieve(p["file"], dest)
    with zipfile.ZipFile(dest) as z:
        (inner,) = z.namelist()
        n = len(json.load(z.open(inner))["results"])
    if n != p["records"]:
        raise SystemExit(f"{dest}: {n} records, manifest says {p['records']}")
    total += n
print(f"{quarter}: {len(parts)} files, {total} records, export {man['results']['drug']['event']['export_date']}")
PY
```

On 2026-10-22 this downloaded 236,902,945 B and printed:

```
2004q1: 5 files, 51941 records, export 2026-10-21
```

The 2004q1 quarter is 226 MiB in five files. Recent quarters are much larger: 2026q2 was
36 files and 3,280 MiB. `json.load` reads a whole file into memory, so process one file at a
time.

## Try it

**Data.** The live openFDA API: `drug/event` (FAERS), `drug/label` and `drug/enforcement`.
No key, no account. The data is CC0. The block makes 25 requests on a clean run, 8 of them
paging, which is well inside the keyless 1,000 a day. It writes nothing to disk but the
script itself, and needs only `python3`. Its main subject is
pretomanid, a tuberculosis drug approved in 2019 with about 730 reports, small enough to fetch
in full. Confirmed reachable on 2026-10-22.

**Run.** In an empty directory:

```bash
cat > openfda_check.py <<'PY'
import json, os, re, time, urllib.error, urllib.parse, urllib.request
from collections import Counter

BASE = "https://api.fda.gov"
KEY = os.environ.get("OPENFDA_API_KEY")        # optional; never hard-code one
E, L, R = "drug/event", "drug/label", "drug/enforcement"
NAME = "pretomanid"


def check(ok, what):
    if not ok:
        raise SystemExit(f"FAILED: {what}")


def get(endpoint=None, url=None, **params):
    """(json, next_url, http_status). 404 NOT_FOUND -> empty; 429 and 5xx -> back off."""
    if url is None:
        params = ({"api_key": KEY} if KEY else {}) | params
        url = f"{BASE}/{endpoint}.json?" + urllib.parse.urlencode(params)
    elif KEY and "api_key=" not in url:            # a Link URL: add the key if it lacks one
        url += "&api_key=" + urllib.parse.quote(KEY)
    for i in range(6):
        time.sleep(0.25)                            # 240 requests a minute
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                m = re.search(r'<([^>]+)>;\s*rel="next"', r.headers.get("Link") or "")
                return json.load(r), (m.group(1) if m else None), 200
        except urllib.error.HTTPError as e:
            body = json.load(e) if e.headers.get_content_type() == "application/json" else {}
            code = body.get("error", {}).get("code")
            if e.code == 404 and code == "NOT_FOUND":
                return {"meta": None, "results": []}, None, 404
            if e.code in (429, 500, 502, 503, 504) and i < 5:
                after = e.headers.get("Retry-After", "")     # seconds, or an HTTP date
                time.sleep(min(float(after), 300) if after.isdigit() else 2 ** i)
                continue
            return body, None, e.code
        except Exception:
            if i == 5:
                raise
            time.sleep(2 ** i)


def total(endpoint, search=None):
    d, _, status = get(endpoint, search=search, limit=1) if search else get(endpoint, limit=1)
    check(status in (200, 404), f"HTTP {status} for {search}")
    return d["meta"]["results"]["total"] if d["meta"] else 0


def count(endpoint, field, search, limit=100):
    d, _, status = get(endpoint, search=search, count=field, limit=limit)
    check(status == 200, f"HTTP {status} counting {field}")
    return [(x.get("term", x.get("time")), x["count"]) for x in d["results"]]


# 1. Snapshot and licence on every endpoint.
meta = {}
for ep in (E, L, R):
    d, _, status = get(ep, limit=1)
    check(status == 200, f"{ep} reachable")
    meta[ep] = d["meta"]
    check(re.fullmatch(r"\d{4}-\d{2}-\d{2}", d["meta"]["last_updated"]) is not None, f"{ep} last_updated")
    check(d["meta"]["license"] == "https://open.fda.gov/license/", f"{ep} licence URL")

# 2. 404 means "no matches" for a real field and for a misspelled one alike.
real = f'patient.drug.activesubstance.activesubstancename:"{NAME}"'
check(total(E, 'patient.drug.activesubstance.activesubstancename:"notadrugname"') == 0, "empty is 0")
check(total(E, f'patient.drug.activesubstance.activesubstancenam:"{NAME}"') == 0, "typo is also 0")
check(total(E, "_exists_:patient.drug.activesubstance.activesubstancenam") == 0, "typo field never exists")
check(total(E, "_exists_:patient.drug.activesubstance.activesubstancename") > 0, "real field exists")

# 3. The skip ceiling.
_, _, status = get(E, search="receivedate:[20200101 TO 20201231]", limit=1, skip=25001)
check(status == 400, "skip 25001 is refused")

# 4. A count is a number of reports: it equals the total of the matching search.
term, n_term = count(E, "patient.reaction.reactionmeddrapt.exact", real)[0]
check(n_term == total(E, f'{real} AND patient.reaction.reactionmeddrapt.exact:"{term}"'), "count == search")

# 5. No single name field is complete; the OR is a superset of each.
fields = [real, f'patient.drug.openfda.generic_name:"{NAME}"', f'patient.drug.medicinalproduct:"{NAME}"']
per_field = [total(E, f) for f in fields]
union = "(" + " OR ".join(fields) + ")"
n_union = total(E, union)
check(n_union >= max(per_field), "OR covers every field")

# 6. Page the whole set by the Link header (no skip), then check it.
d, nxt, _ = get(E, search=union, limit=100)
reports = list(d["results"])
while nxt:
    d, nxt, status = get(url=nxt)
    check(status == 200, "next page")
    reports += d["results"]
ids = [r["safetyreportid"] for r in reports]
check(len(ids) == len(set(ids)) == n_union, "paging returns every report once")

# 7. "drug AND drugcharacterization:1" does not bind the role to the drug.
def mine(d):
    names = [d.get("medicinalproduct") or "", (d.get("activesubstance") or {}).get("activesubstancename") or ""]
    names += (d.get("openfda") or {}).get("generic_name", [])
    return any(NAME.upper() in x.upper() for x in names)

server_suspect = total(E, f"{union} AND patient.drug.drugcharacterization:1")
client_suspect = sum(any(mine(x) and x.get("drugcharacterization") == "1" for x in r["patient"]["drug"])
                     for r in reports)
check(all(any(mine(x) for x in r["patient"]["drug"]) for r in reports), "every report names the drug")
check(client_suspect <= server_suspect <= n_union, "client-side suspect count within the server's")
deaths = Counter(r.get("seriousnessdeath") for r in reports)
check(set(deaths) <= {None, "1", "2"}, f"death flag values {deaths}")

# 8. Labels: sections are lists of strings; set_id and effective_time present.
d, _, status = get(L, search='openfda.generic_name:"semaglutide"', limit=100)
check(status == 200 and d["results"], "semaglutide labels")
for lab in d["results"]:
    check(re.fullmatch(r"\d{8}", lab["effective_time"]) is not None and lab["set_id"], "label ids")
    check(all(isinstance(s, str) for s in lab["indications_and_usage"]), "sections are lists of strings")
n_labels = len(d["results"])

# 9. Recalls: the hazard classes are the documented ones.
classes = dict(count(R, "classification.exact", "_exists_:classification"))
check(set(classes) <= {"Class I", "Class II", "Class III", "Not Yet Classified"}, f"classes {classes}")

print("last_updated:", {ep: m["last_updated"] for ep, m in meta.items()})
print("totals:", {ep: m["results"]["total"] for ep, m in meta.items()})
print(f"{NAME}: per field {dict(zip(['activesubstance', 'generic_name', 'medicinalproduct'], per_field))}, "
      f"OR {n_union}")
print(f"top reaction {term!r} in {n_term} reports")
print(f"suspect: server {server_suspect}, client-side {client_suspect}, of {n_union}")
print(f"seriousnessdeath values: {dict(deaths)}")
print(f"semaglutide labels {n_labels}; recall classes {classes}")
print("all checks passed")
PY
python3 openfda_check.py
```

**Expect.** Run cold in a fresh empty directory on 2026-10-22, with no key, this printed:

```
last_updated: {'drug/event': '2026-07-30', 'drug/label': '2026-10-22', 'drug/enforcement': '2026-10-14'}
totals: {'drug/event': 20692690, 'drug/label': 262900, 'drug/enforcement': 18043}
pretomanid: per field {'activesubstance': 734, 'generic_name': 727, 'medicinalproduct': 727}, OR 734
top reaction 'DEATH' in 121 reports
suspect: server 731, client-side 643, of 734
seriousnessdeath values: {None: 37, '1': 289, '2': 408}
semaglutide labels 5; recall classes {'Class II': 14572, 'Class I': 1750, 'Class III': 1719, 'Not Yet Classified': 2}
all checks passed
```

*Invariants*, checked by the script, so a failure means the skill is wrong:

- Every endpoint answers with a `YYYY-MM-DD` `last_updated` and the licence URL
  `https://open.fda.gov/license/`.
- A search for a nonexistent name returns zero, and so does the same search with a
  misspelled field name; only `_exists_:` on the field tells them apart, matching nothing
  for the typo and something for the real field.
- `skip=25001` is refused with HTTP 400.
- The `count` of the top reaction equals the total of a search for that reaction.
- The OR of the three name fields matches at least as many reports as any one of them.
- Paging by the `Link` header returns every report exactly once, as many as the server's
  total.
- Every fetched report has a drug entry naming pretomanid.
- The number of reports where pretomanid itself is the suspect, checked on the records, is
  no more than what the server returns for `… AND drugcharacterization:1`.
- `seriousnessdeath` takes only the values `1`, `2` or absent.
- Every semaglutide label has a `set_id`, an eight-digit `effective_time`, and an
  `indications_and_usage` section that is a list of strings.
- Recall classes are drawn from Class I, II, III and Not Yet Classified.

*Observed values, 2026-10-22, FAERS `last_updated` 2026-07-30, labels 2026-10-22,
enforcement 2026-10-14.* FAERS changes with each quarterly refresh and the other two weekly,
so a mismatch here means drift to investigate:

- Totals: 20,692,690 FAERS reports, 262,900 labels, 18,043 recall records.
- Pretomanid: 734 reports by active substance, 727 by generic name and by product name,
  734 for the OR.
- The top reaction is `DEATH`, in 121 reports. These are patients with drug-resistant
  tuberculosis on multi-drug regimens, and FAERS cannot say what the deaths are owed to.
- Suspect role: 731 reports by the server's unbound search, 643 when the role is checked
  on the pretomanid entry. The 88-report gap is what the server-side filter gets wrong.
- `seriousnessdeath`: 289 `1`, 408 `2`, 37 absent.
- 5 semaglutide labels by `openfda.generic_name`; recall classes 14,572 Class II, 1,750
  Class I, 1,719 Class III, 2 Not Yet Classified.
- The run takes between about two and a half and twelve minutes, most of it the eight pages
  of reports. It is bounded by the link to `api.fda.gov`, not by the work.

## Limits worth stating in a write-up

- FAERS counts are counts of spontaneous reports. They are not incidence, prevalence or
  risk, and a drug with more reports is not thereby a more dangerous drug.
- No report establishes that a drug caused a reaction, and the suspect role is the
  reporter's opinion.
- Name the snapshot (`meta.last_updated`), the fields searched, and whether the
  suspect-only filter was applied client-side.
- Label text is the labeler's, as submitted. A recall's `Ongoing` status is never
  refreshed, so report `termination_date` rather than the status word.
- Do not imply FDA endorsement of the analysis.

## Sources

- openFDA API documentation — <https://open.fda.gov/apis/>
- Query parameters, syntax and paging — <https://open.fda.gov/apis/query-parameters/>, <https://open.fda.gov/apis/query-syntax/>, <https://open.fda.gov/apis/paging/>
- Authentication and rate limits — <https://open.fda.gov/apis/authentication/>
- Drug adverse events (FAERS), labeling and enforcement pages — <https://open.fda.gov/apis/drug/event/>, <https://open.fda.gov/apis/drug/label/>, <https://open.fda.gov/apis/drug/enforcement/>
- Searchable field definitions — <https://open.fda.gov/fields/drugevent.yaml>, <https://open.fda.gov/fields/druglabel.yaml>, <https://open.fda.gov/fields/drugenforcement.yaml>
- Licence and terms of service — <https://open.fda.gov/license/>, <https://open.fda.gov/terms/>
- Bulk download manifest — <https://api.fda.gov/download.json>
- Kass-Hout TA, et al. OpenFDA: an innovative platform providing access to a wealth of FDA's publicly available data. *J Am Med Inform Assoc.* 2016;23(3):596–600. doi:10.1093/jamia/ocv153
- Evans SJW, Waller PC, Davis S. Use of proportional reporting ratios (PRRs) for signal generation from spontaneous adverse drug reaction reports. *Pharmacoepidemiol Drug Saf.* 2001;10(6):483–486. doi:10.1002/pds.677
