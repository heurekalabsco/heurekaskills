---
name: clinicaltrials-gov
description: Search ClinicalTrials.gov through its v2 API by condition, intervention, phase or status and save tidy trial tables and full records — paging, NCT aliases, partial dates, estimated enrollment, and why COMPLETED is not results.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [clinical-trials, public-data, drug-discovery, epidemiology]
covers: [clinicaltrials.gov, clinical trial, clinical trials, trial registry, nct number, nct id, ctgov, nlm, fdaaa 801, results database, posted results, adverse events, primary outcome, randomized controlled trial, phase 1, phase 2, phase 3, phase 4, enrollment, sponsor, intervention, drug, device, condition, cancer, oncology, pembrolizumab, mesothelioma, essie, eudract]
papers: [PMID:21366476, PMID:27635471, PMID:29802130]
access: [open]
datasets: ["https://clinicaltrials.gov/api/v2/version", "https://clinicaltrials.gov/api/v2/studies?query.intr=pembrolizumab&query.cond=mesothelioma&pageSize=10&countTotal=true&fields=NCTId", "https://clinicaltrials.gov/api/v2/studies/NCT00080912", "https://clinicaltrials.gov/api/v2/studies/NCT02991482"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: ClinicalTrials.gov API 2.0.5, dataTimestamp 2026-10-21T09:00:05, 607992 studies / Python 3.12.8 standard library only / curl 8.15.0 on macOS arm64
  executed: 8
  unverified: 1
  unverified_reason: The bulk JSON archive block has never completed a download from this host. On 2026-10-21 the shipped form ran verbatim once. Its disk check passed, then curl failed with exit 92 after 39 minutes and 2181268195 bytes, and set -e stopped the block with that code, so it fails closed as intended. Three earlier runs of a plainer curl -s form also truncated. The archive streams at about 1 MB per second with no Content-Length and no Range support. Re-run on a faster or more stable link and record the full archive size.
---

# ClinicalTrials.gov — the US trial registry and results database

ClinicalTrials.gov is run by the US National Library of Medicine (NLM). It holds a
registration record for each study a sponsor or investigator has listed, from any country.
A subset of those records also carries a posted results section with participant flow,
baseline characteristics, outcome measures and adverse events. On the 2026-10-21 snapshot
it held **607,992 studies**.

This skill retrieves those records through the modern REST API (v2) and turns them into
tables that hold up under analysis. The API itself is simple. The mistakes come from the
data model: COMPLETED studies without results, phases that are lists, enrollment counts that
are still forecasts, dates without a day, and identifiers that redirect. Each one gives a
plausible table that is wrong.

**Nothing to obtain.** No account, no API key, no licence to accept beyond the terms below.

## Terms of use, and what a record is

Read these before the first call. They are short, and they come from NLM's own pages
(Terms and Conditions, last updated 2023-01-31; Disclaimer, last updated 2023-08-03).

- **Downloading the data means accepting NLM's Terms and Conditions.** They apply whatever
  the format or route, including this API, and they stay in force while you keep the data.
- **Anyone may use the data, at no charge**, inside or outside the US.
- **Whenever you publish or distribute the data, the terms say you should**:
  1. attribute the source as ClinicalTrials.gov,
  2. keep the data current,
  3. clearly display the date ClinicalTrials.gov processed the data, which is
     `dataTimestamp` from `/api/v2/version`,
  4. state any modifications you made, with a complete description.
- You may not claim proprietary rights to any part of the database, or represent it as
  anything "other than a United States Government database". You may not use email addresses
  extracted from it for marketing or promotion.
- **Don't describe it as public domain or freely relicensable.** The terms keep it labelled as
  a US Government database, and they assert copyright outside the US: "The ClinicalTrials.gov
  data carry an international copyright outside the United States and its Territories or
  Possessions." They add that some content "may be subject to the copyright of third parties;
  you should consult these entities for any additional terms of use". The terms bind you for
  as long as you keep the data. Neither page uses the phrase "public domain".
- **No warranty.** The US Government, HHS, NIH and NLM make no warranties about the data and
  accept no liability for its use.
- **Sponsors and investigators write the records.** In the Disclaimer's words, "The U.S.
  government does not review or approve the safety and science of all studies listed on this
  website." The sponsor or investigator submits the information and is responsible for its
  accuracy, and "NLM staff only reviews study information for apparent errors, deficiencies,
  or inconsistencies." Treat every field as self-reported.
- **Rate limits: none published.** Neither the terms nor the API pages state a request
  limit (checked 2026-10-21). Sixty back-to-back requests all returned 200, with no
  rate-limit headers. Third-party guides quote different figures that NLM does not publish,
  so don't rely on them. Pace bulk work, retry with backoff on 429 or 5xx, and see *Get the
  files* for whole-registry routes.

The `manifest.json` written under *Get the files* records the timestamp and a
modifications line, which covers items 3 and 4 for files you pass on.

## Start here: v1 is gone, and the data refreshes daily

```bash
curl -s https://clinicaltrials.gov/api/v2/version
# {"apiVersion" : "2.0.5", "dataTimestamp" : "2026-10-21T09:00:05"}
```

- **The classic API is retired.** Paths under `/api/query/` and `/api/info/` (for example
  `/api/query/full_studies`) now return 404, and `classic.clinicaltrials.gov` redirects
  into them. Code or tutorials using `expr=`, `min_rnk`/`max_rnk` or `fmt=json` are the
  classic API.
- **XML-only compatibility endpoints remain** under `/api/legacy/` (`study-fields`,
  `full-studies`, `public-xml`), reporting their own version (1.2.0). NLM documents them as a
  migration aid, and with a search expression they stop at 10,000 studies. Don't build on
  them. Use `/api/v2/`.
- **The data changes under you.** NLM refreshes Monday to Friday, usually by 14:00 UTC. A
  pull that crosses a refresh mixes two snapshots, so read `dataTimestamp` before and after
  a long pull and compare.

## The query grammar

One search endpoint, `GET /api/v2/studies`, takes three kinds of parameter:

| family | examples | what it does |
|---|---|---|
| `query.*` | `query.cond`, `query.intr`, `query.term`, `query.spons`, `query.lead`, `query.titles`, `query.outc`, `query.locn`, `query.id` | Search one **search area** in Essie syntax. Synonym-expanded and relevance-weighted |
| `filter.*` | `filter.overallStatus`, `filter.ids`, `filter.advanced`, `filter.geo` | Restrict the set, with no effect on ranking. `filter.advanced` takes a full Essie expression |
| shaping | `fields`, `pageSize`, `pageToken`, `countTotal`, `sort`, `format` | What comes back, and how much |

```bash
curl -s "https://clinicaltrials.gov/api/v2/studies?query.intr=pembrolizumab&query.cond=mesothelioma&filter.overallStatus=COMPLETED|TERMINATED&countTotal=true&pageSize=3&fields=NCTId|OverallStatus|HasResults"
```

**Mistakes fail loudly.** That is unusual among biomedical APIs, so rely on it. An unknown
parameter returns `400` (`query.condition` gives `` `query.condition` is unknown
parameter``), as do a bad enum value, an unknown field in `fields`, and a malformed
`pageToken`. Raise on 400. Never retry it.

### `query.intr` and `query.cond` are recall searches, not exact matches

Each `query.*` parameter searches a weighted bundle of fields, and terms are expanded through
a synonym list. `query.intr` covers intervention names, other names, arm labels and
descriptions, MeSH terms and titles. `query.cond` covers conditions, titles, condition MeSH
terms and keywords. You can list the bundles at `/api/v2/studies/search-areas`. Measured on
2026-10-21:

| query | studies |
|---|---|
| `query.intr=pembrolizumab` | 2,987 |
| `query.intr=keytruda` | 2,987 (brand name, same set) |
| `query.intr=EXPANSION[None]keytruda` | 17 (synonyms switched off) |
| `filter.advanced=AREA[InterventionName]pembrolizumab` | 2,578 |
| `query.cond=pleural mesothelioma` | 398 |
| `query.cond="pleural mesothelioma"` | 281 (quoted phrase) |

So `query.intr=pembrolizumab&query.cond=mesothelioma` returns 45 studies, and **4 of them
do not name pembrolizumab among their interventions**:

- `NCT04056026` is a faecal microbiota transplant study whose title says "as an adjunct to
  Keytruda".
- `NCT04631731` studies risk factors for checkpoint-inhibitor toxicity. Its listed
  interventions are blood and tissue screening.
- `NCT05627960` is an antibody trial that mentions pembrolizumab only as a prior therapy in
  its eligibility criteria.
- `NCT03393858` does give pembrolizumab, but its intervention is named "Anti-PD-1 antibody".
  The drug appears only in the intervention's description.

Keep the broad search for recall, then decide relevance from the structured fields, as the
tidy-table code below does with an explicit column. The last case shows why the column flags
rather than drops. A name-based test has false negatives as well as false positives, so read
the flagged rows before excluding any.

### Essie in `filter.advanced`

The operators that matter in practice. Each was run against the live API.

| expression | meaning |
|---|---|
| `AREA[Phase]PHASE2` | phase list **contains** PHASE2 (includes PHASE1/PHASE2 and PHASE2/PHASE3) |
| `AREA[StartDate]RANGE[2020-01-01,2020-12-31]` | date range; `MIN` and `MAX` are open ends |
| `AREA[EnrollmentCount]RANGE[1000,MAX] AND AREA[EnrollmentType]ACTUAL` | at least 1,000 people actually enrolled |
| `AREA[HasResults]true` | results posted |
| `AREA[StartDateType]MISSING` | field absent; `NOT ... MISSING` for present |
| `AREA[NCTIdAlias]NOT MISSING` | records that absorbed another NCT ID |
| `a AND b`, `a OR b`, `NOT a`, `( )`, `"exact phrase"` | boolean logic and phrases |

NLM notes that the `COVERAGE` and `EXPANSION` operators are "not fully implemented" on the
modern site. `EXPANSION[None]` did turn synonym expansion off in the test above, but check
your counts if you depend on it.

### `fields` trims payloads, and drops `hasResults` unless you ask for it

A full record averages about 17 KB, and the 99th percentile is 150 KB (`/api/v2/stats/size`).
Always pass `fields` for searches. It accepts piece names (`NCTId`, `OverallStatus`,
`EnrollmentInfo`, `StartDateStruct`), module names (`IdentificationModule`) or JSON paths
(`protocolSection.identificationModule.nctId`). It rejects a mix such as
`StatusModule.OverallStatus`. `/api/v2/studies/metadata` lists every piece.

**`hasResults` is a field like any other.** Leave `HasResults` out of `fields` and the key
is absent, so `s.get("hasResults")` returns `None`, which reads as "no results" for every
study. Request it explicitly. Code that indexes `s["hasResults"]` fails loudly instead.

The response mirrors the full record's nesting even when trimmed:
`study["protocolSection"]["statusModule"]["overallStatus"]`. Absent values are absent keys,
not nulls, so use `.get()` with a default for every optional module.

### Paging: `pageSize` caps silently, and the token is bound to its query

- `pageSize` defaults to **10**. Values over **1,000 are reduced to 1,000 without an
  error**: ask for 5,000 and you get 1,000 plus a `nextPageToken`.
- Follow `nextPageToken` until it is absent. A page can have an empty `studies` array, so
  stop only when the token is missing.
- `countTotal=true` adds `totalCount` to the **first page only**.
- **Send the same query on every page.** The spec allows only `pageSize`, `countTotal` and
  `pageToken` to change between pages, and a different `pageSize` with the same token works.
  A token is a position, not a bookmark tied to its query. Taken from page 2 of an asthma
  search and sent with `query.cond=diabetes`, it returned `200` with diabetes studies 111 to
  120, so rows are silently skipped or repeated. Keep the query in one dict and add only the
  token.
- Results are **unsorted** by default. `sort` takes date or numeric fields only (`sort=LastUpdatePostDate:desc`). A text field returns `400 Unsupported sort field type`.

`format=csv` returns the same pages as CSV with flatter column names (`NCT Number`,
`Study Status`). The total and the next token come back as `x-total-count` and
`x-next-page-token` headers. The CSV `Enrollment` column is the count alone, with no
ACTUAL/ESTIMATED type, so use JSON when enrollment matters.

### A client to build on

Every Python block below imports this. Save it as `ctg.py`. It uses the standard library
only.

```python
"""Minimal ClinicalTrials.gov API v2 client: standard library only."""
import json, re, time, urllib.error, urllib.parse, urllib.request

BASE = "https://clinicaltrials.gov/api/v2"
NCT = re.compile(r"^NCT\d{8}$")


class CtgError(Exception):
    pass


def get(path, params=None, tries=5):
    """GET one endpoint and return parsed JSON. 400 raises with the server's message."""
    url = f"{BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")[:300]
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(2 ** i)              # back off; no published rate limit
                continue
            raise CtgError(f"HTTP {e.code} for {url}: {body}") from None
        except urllib.error.URLError:
            if i == tries - 1:
                raise
            time.sleep(2 ** i)


def pages(params, page_size=100):
    """Yield every study for one query, following nextPageToken.

    A token is a position, and the API accepts it with any query, so this reuses one
    frozen dict: a later page cannot drift onto a different query.
    """
    frozen = dict(params)
    if "pageToken" in frozen:
        raise CtgError("do not pass pageToken yourself")
    token = None
    while True:
        q = dict(frozen, pageSize=page_size)
        if token:
            q["pageToken"] = token
        d = get("/studies", q)
        yield from d["studies"]
        token = d.get("nextPageToken")
        if not token:
            return


def count(params):
    """Total matches for a query, without fetching them."""
    q = dict(params, countTotal="true", pageSize=1, fields="NCTId")
    return get("/studies", q)["totalCount"]


def normalise_nct(raw):
    """'nct80912' -> 'NCT00080912'. Raises on anything that is not an NCT number."""
    m = re.fullmatch(r"\s*[Nn][Cc][Tt]0*([1-9]\d{0,7})\s*", raw)
    if not m:
        raise ValueError(f"not an NCT number: {raw!r}")
    return f"NCT{int(m.group(1)):08d}"


def study(nct_id, fields=None):
    """One study. An alias 301-redirects to the current record, and the redirect
    drops the query string, so `fields` is lost: the full record comes back."""
    want = normalise_nct(nct_id)
    d = get(f"/studies/{want}", {"fields": "|".join(fields)} if fields else None)
    got = d["protocolSection"]["identificationModule"]["nctId"]
    if got != want:
        print(f"{want} is an alias of {got}; returning {got}")
    return d
```

## NCT IDs, aliases and secondary IDs

The canonical form is `NCT` plus **eight digits**, `^NCT\d{8}$`. Every `nctId` the API
returned in testing matched it. The API is more lenient on input: `nct00080912` and
`NCT80912` both resolve to `NCT00080912`. Normalise before you join, because two tables
keyed on different spellings of the same ID will not match.

```python
from ctg import normalise_nct, study, CtgError

print(normalise_nct("nct80912"))                 # NCT00080912
rec = study("NCT00797173", ["NCTId"])            # alias -> NCT00080912, full record
print(rec["protocolSection"]["identificationModule"]["nctIdAliases"])
for bad in ("NCT99999999", "NCT1234567890"):
    try:
        study(bad)
    except (CtgError, ValueError) as e:
        print(bad, "->", e)
```

- **Aliases.** When duplicate registrations are merged, the retired number is kept as an
  alias. On the 2026-10-21 snapshot 3,167 records carry one. `/studies/NCT00797173` answers
  `301` to `/studies/NCT00080912`. **The redirect drops the query string**, so the `fields`
  you asked for are lost and the full record comes back under a different ID than you
  requested. `filter.ids` and `query.id` search aliases too, and return the current ID. A
  list of NCT IDs from a paper can come back with fewer distinct IDs than you sent, so map
  the alias explicitly. Don't treat the shortfall as missing data.
- **404 against 400.** `404 NCT number NCT99999999 not found` means well formed but
  absent. `400 Parameter nctId has incorrect format` means it is not an NCT number.
- **Secondary IDs are free text with an optional type.** `secondaryIdInfos` carries EudraCT
  numbers, NIH grant numbers, other-registry IDs and sponsor protocol codes. In a sample of
  pre-2009 records, 411 of 776 secondary IDs had **no `type` at all**. Typed ones are not
  clean either: `NCT02903914` lists an `NIH`-typed secondary ID of just `2017`. Match on a
  pattern you trust, such as EudraCT `\d{4}-\d{6}-\d{2}`. Never treat the type label as
  validation.

## Status, and why COMPLETED is not "results available"

`overallStatus` takes 14 values. Most are recruitment states. Four belong to expanded access
records (`AVAILABLE`, `NO_LONGER_AVAILABLE`, `TEMPORARILY_NOT_AVAILABLE`,
`APPROVED_FOR_MARKETING`). Two need care:

- **`UNKNOWN`** means the last known status was recruiting, not yet recruiting or active,
  the completion date has passed, and the record has not been verified in the past two
  years. The last state the sponsor reported is in `lastKnownStatus`. `NCT02758587` is
  `UNKNOWN` and was last `RECRUITING`, verified 2018-03, with an `ESTIMATED` primary
  completion of 2019-05 that nobody ever updated. There were 97,807 such records on
  2026-10-21.
- **`WITHHELD`** (984 records) marks trials of devices not approved or cleared by the FDA.
  The title is the placeholder `[Trial of device that is not approved or cleared by the U.S.
  FDA]`, and dates and study type are absent.

Results are a separate thing from status. Posted results per status, on 2026-10-21:

| overallStatus | studies | `hasResults: true` | share |
|---|---|---|---|
| COMPLETED | 332,549 | 67,261 | 20.2% |
| TERMINATED | 34,546 | 11,986 | 34.7% |
| ACTIVE_NOT_RECRUITING | 22,167 | 1,244 | 5.6% |
| RECRUITING | 64,870 | 9 | 0.0% |
| UNKNOWN | 97,807 | 119 | 0.1% |
| WITHDRAWN | 16,909 | 0 | 0 |

So four out of five COMPLETED studies have no posted results. Results can also appear
before completion, once the *primary* completion date has passed (`NCT03126630` is
`ACTIVE_NOT_RECRUITING` with results). Posting is legally required only for some trials
(applicable clinical trials under FDAAA 801 and its Final Rule), and those can sometimes be
delayed. A record without results is not, by itself, evidence of non-compliance or of a
negative trial.

**Registered against results-posted.** `hasResults: true` means a `resultsSection` exists,
with `participantFlowModule`, `baselineCharacteristicsModule`, `outcomeMeasuresModule`,
`adverseEventsModule` and `moreInfoModule`. The first-posted date is
`statusModule.resultsFirstPostDateStruct`. Filter with `AREA[HasResults]true`. Don't infer
results from status.

```python
from ctg import count

for st in ("COMPLETED", "TERMINATED", "ACTIVE_NOT_RECRUITING", "RECRUITING", "UNKNOWN"):
    n = count({"filter.overallStatus": st})
    r = count({"filter.overallStatus": st, "filter.advanced": "AREA[HasResults]true"})
    print(f"{st:22} {n:>8,} {r:>7,} {r / n:6.1%}")
```

## Phases are lists

`designModule.phases` is an **array**: `["PHASE1", "PHASE2"]` is one phase 1/2 trial, not
two trials. Values are `NA`, `EARLY_PHASE1` (the former "Phase 0"), `PHASE1` to `PHASE4`.
Records with **no `phases` key** (144,187, of which 142,003 are observational) are different
from `NA` (239,338 interventional trials without FDA-defined phases, such as device and
behavioural trials).

| filter | studies, 2026-10-21 |
|---|---|
| `AREA[Phase]PHASE2` | 90,654 |
| `AREA[Phase]PHASE2 AND AREA[Phase]PHASE1` | 17,153 |
| `AREA[Phase]PHASE2 AND AREA[Phase]PHASE3` | 7,629 |
| `PHASE2` alone (neither 1 nor 3) | 65,872 |

Store the joined value (`PHASE1|PHASE2`) and decide explicitly how to bin it. Counting a
phase 1/2 trial in both bins inflates totals, and counting it in neither loses it. Taking
`phases[0]` labels every phase 2/3 trial as phase 2.

## Enrollment: a count with a type

`designModule.enrollmentInfo` is `{"count": 160, "type": "ESTIMATED"}`. `ESTIMATED` is the
target number (the legacy XML labels it `Anticipated`). `ACTUAL` is people enrolled.
The same field flips from one to the other when a trial closes, so summing `count` across
a mixed set adds forecasts to head counts. In the pembrolizumab/mesothelioma set, 14 of 45
are still `ESTIMATED`, including one with a target of 1,609. `WITHDRAWN` means
nobody was enrolled, yet 204 of 16,909 withdrawn records still carry a non-zero count, 178 of
them a leftover `ESTIMATED` target. 17,136 records have no enrollment type at all. Filter on type
or report both columns.

## Dates are partial structs

Dates under `statusModule` (`startDateStruct`, `primaryCompletionDateStruct`,
`completionDateStruct`) are `{"date": ..., "type": ...}`:

- `date` is `YYYY-MM-DD` **or** `YYYY-MM`. Of 1,000 records first posted before 2009, 881
  start dates were month-only.
- `type` is `ACTUAL` or `ESTIMATED` (a plan), and is **often absent**: 186,168 records have
  no `StartDateType`. Absent is not ACTUAL.
- The struct itself can be absent: 5,368 records have no start date, including every
  `WITHHELD` one.

Keep the string as given, plus a precision column. Don't pad `2017-01` to `2017-01-01`. That
invents a day, and duration calculations then look more exact than they are. Filter
date-precision-sensitive analyses on the precision column.

## A tidy table for one intervention and condition

Pembrolizumab in mesothelioma: 45 studies, small enough to read, and it hits every trap
above. The table keeps every row the search returned and adds
`drug_named_in_interventions`, so the relevance decision is visible and reversible.

```python
import csv
from ctg import get, pages

DRUG, DISEASE = "pembrolizumab", "mesothelioma"
ALSO = {"pembrolizumab", "keytruda", "mk-3475", "mk3475"}   # names you accept as "the drug"

FIELDS = ["NCTId", "BriefTitle", "OverallStatus", "LastKnownStatus", "HasResults",
          "ResultsFirstPostDate", "StudyType", "Phase", "EnrollmentInfo",
          "StartDateStruct", "PrimaryCompletionDateStruct", "LeadSponsor",
          "InterventionName", "InterventionOtherName", "InterventionMeshTerm",
          "Condition", "SecondaryIdInfo"]


def pdate(struct):
    """A partial-date struct -> (date as given, precision, ACTUAL/ESTIMATED or '')."""
    if not struct:
        return "", "", ""
    d = struct["date"]
    precision = {10: "day", 7: "month", 4: "year"}[len(d)]
    return d, precision, struct.get("type", "")


def row(s):
    p, d = s["protocolSection"], s.get("derivedSection", {})
    st, de = p["statusModule"], p.get("designModule", {})
    ivs = p.get("armsInterventionsModule", {}).get("interventions", [])
    names = [i["name"] for i in ivs] + [o for i in ivs for o in i.get("otherNames", [])]
    mesh = [m["term"] for m in d.get("interventionBrowseModule", {}).get("meshes", [])]
    named = any(a in x.lower() for x in names + mesh for a in ALSO)
    enr = de.get("enrollmentInfo", {})
    sd, sp, stype = pdate(st.get("startDateStruct"))
    pcd, pcp, pctype = pdate(st.get("primaryCompletionDateStruct"))
    sids = p["identificationModule"].get("secondaryIdInfos", [])
    return {
        "nct_id": p["identificationModule"]["nctId"],
        "title": p["identificationModule"].get("briefTitle", ""),
        "overall_status": st["overallStatus"],
        "last_known_status": st.get("lastKnownStatus", ""),
        "has_results": s["hasResults"],          # KeyError if HasResults was not requested
        "results_first_posted": st.get("resultsFirstPostDateStruct", {}).get("date", ""),
        "study_type": de.get("studyType", ""),
        "phases": "|".join(de.get("phases", [])),
        "enrollment": enr.get("count", ""),
        "enrollment_type": enr.get("type", ""),
        "start": sd, "start_precision": sp, "start_type": stype,
        "primary_completion": pcd, "primary_completion_precision": pcp,
        "primary_completion_type": pctype,
        "lead_sponsor": p["sponsorCollaboratorsModule"]["leadSponsor"]["name"],
        "sponsor_class": p["sponsorCollaboratorsModule"]["leadSponsor"].get("class", ""),
        "interventions": "; ".join(i["name"] for i in ivs),
        "drug_named_in_interventions": named,
        "conditions": "; ".join(p.get("conditionsModule", {}).get("conditions", [])),
        "secondary_ids": "; ".join(f"{x.get('type', 'UNTYPED')}:{x['id']}" for x in sids),
    }


query = {"query.intr": DRUG, "query.cond": DISEASE, "fields": "|".join(FIELDS)}
rows = [row(s) for s in pages(query, page_size=100)]
stamp = get("/version")

with open(f"{DRUG}_{DISEASE}_trials.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

named = [r for r in rows if r["drug_named_in_interventions"]]
print(f"{len(rows)} studies matched; {len(named)} list {DRUG} as an intervention")
print(f"with posted results: {sum(r['has_results'] for r in rows)}; "
      f"COMPLETED without results: "
      f"{sum(r['overall_status'] == 'COMPLETED' and not r['has_results'] for r in rows)}")
print(f"enrollment ESTIMATED (not yet a head count): "
      f"{sum(r['enrollment_type'] == 'ESTIMATED' for r in rows)}")
print(f"month-only start dates: {sum(r['start_precision'] == 'month' for r in rows)}")
print(f"data timestamp {stamp['dataTimestamp']}, API {stamp['apiVersion']}")
```

Run 2026-10-21 (dataTimestamp 2026-10-21T09:00:05):

```
45 studies matched; 41 list pembrolizumab as an intervention
with posted results: 18; COMPLETED without results: 2
enrollment ESTIMATED (not yet a head count): 14
month-only start dates: 4
data timestamp 2026-10-21T09:00:05, API 2.0.5
```

`pdate` raises `KeyError` on a date string that is not 4, 7 or 10 characters. That is
deliberate: a new date shape should stop the table rather than land in it unlabelled. The
row function also ran without error over 1,000-record samples of the oldest records,
expanded access, withdrawn, recent observational, recently results-posted and `WITHHELD`
studies.

The table does not decide whether a study is evidence about the drug. A single-arm phase 1
basket trial with three mesothelioma patients and a randomised phase 3 both appear. If you
need target-level or drug-level context across many trials, the `open-targets` skill rolls
clinical precedence up per target and drug. ClinicalTrials.gov stays the place to read what
a specific trial registered and reported.

## Get the files

The table above is a summary. This writes the full records, results sections included, to
disk with a manifest. The manifest records the data timestamp and a modifications line, two
of the four things the terms ask you to show when you pass the data on. It also checks the
timestamp again at the end, so a pull that straddles the daily refresh fails rather than
mixing snapshots.

```python
import json, os
from ctg import get, pages

OUT = "Data/clinicaltrials_gov"
query = {"query.intr": "pembrolizumab", "query.cond": "mesothelioma"}
os.makedirs(f"{OUT}/studies", exist_ok=True)

stamp = get("/version")                       # read once, before the pull
ids = [s["protocolSection"]["identificationModule"]["nctId"]
       for s in pages(dict(query, fields="NCTId"), page_size=100)]

files = []
for nct in ids:
    rec = get(f"/studies/{nct}")              # full record, results included if posted
    path = f"{OUT}/studies/{nct}.json"
    with open(path, "w") as fh:
        json.dump(rec, fh)
    files.append({"nctId": nct, "hasResults": rec["hasResults"],
                  "path": path, "bytes": os.path.getsize(path)})

after = get("/version")
if after["dataTimestamp"] != stamp["dataTimestamp"]:
    raise SystemExit("the daily refresh landed mid-pull; re-run so every file is from one snapshot")

with open(f"{OUT}/manifest.json", "w") as fh:
    json.dump({
        "source": "ClinicalTrials.gov",
        "endpoint": "https://clinicaltrials.gov/api/v2/studies",
        "query": query,
        "apiVersion": stamp["apiVersion"],
        "dataTimestamp": stamp["dataTimestamp"],
        "modifications": "none; records saved as returned by /studies/{nctId}",
        "files": files,
    }, fh, indent=2)

print(f"{len(files)} records, {sum(f['hasResults'] for f in files)} with results, "
      f"{sum(f['bytes'] for f in files):,} bytes; data timestamp {stamp['dataTimestamp']}")
```

Run 2026-10-21: `45 records, 18 with results, 3,202,762 bytes`, in about 22 seconds. If you
derive anything from these files and pass it on, replace the `modifications` line with what
you changed.

The loop makes one request per study, which is fine for tens of records. For thousands, call
`pages(query)` without `fields` instead. Each page then carries full records, results
included, at 100 studies per request.

### The whole registry

For the whole registry there are two routes. You can page through everything with the
client above, which takes about 600 requests at 1,000 studies per page (around 17 MB each with
all fields). There is no deep-paging cap: on 2026-10-21, paging the whole registry with
`fields=NCTId` returned 607,992 unique IDs, exactly `totalCount`, in about 7 minutes. Or you
can download a bulk archive.

| archive | URL | size, 2026-10-21 | resumable |
|---|---|---|---|
| modern JSON, one file per study, same shape as `/studies/{nctId}` | `https://clinicaltrials.gov/api/v2/studies/download?format=json.zip` | not measured; see below | no |
| legacy public XML (`AllPublicXML.zip` redirects here) | `https://clinicaltrials.gov/api/legacy/public-xml?format=zip` | not measured | no |
| legacy API XML (`AllAPIXML.zip` redirects here) | `https://clinicaltrials.gov/api/legacy/api-xml?format=zip` | 3,242,008,931 bytes (its Content-Length) | yes |

**Ask the user before starting either JSON or XML bulk download.** It is gigabytes on disk
and can take an hour or more. For scale, `/api/v2/stats/size` reports 607,992 studies averaging
17,309 bytes. That is about 10.5 GB of JSON once unpacked, a figure derived from those stats
rather than measured.

**The JSON and public-XML archives are generated as they stream.** They send no
Content-Length and answer a `Range` request with a plain `200`, so a broken transfer cannot be
resumed. Here they arrived at about 0.5 to 1 MB/s.

**A cut-off transfer can look like a success.** Four full attempts at the JSON archive on
2026-10-21 all started with HTTP 200 and all ended early: after 26, 38, 39 and 60 minutes, at
between 937,855,290 and 2,181,268,195 bytes. Each file was a truncated zip with no central
directory. The largest held roughly the first 486,000 of the 607,992 records. Wherever its
exit status was captured, curl returned 92: `HTTP/2 stream 1 was not closed cleanly:
INTERNAL_ERROR`. Run with `-s` and nothing checking that status, the transfer looks
finished.
So the complete size of the JSON archive was not measured from this host, and a size quoted
from elsewhere is no substitute for testing your own copy.

**The legacy API-XML archive is the exception.** It is a static file with a Content-Length.
A `Range` request returns `206` with `content-range: bytes 0-99/3242008931`, so
`curl -L -C - -o ctg-api-xml.zip "https://clinicaltrials.gov/api/legacy/api-xml?format=zip"`
resumes an interrupted transfer. That was tested on 2026-10-21: the resumed bytes matched a
fresh range request byte for byte. It is XML in the legacy API schema, not the v2 JSON model
this skill describes, but it is the one bulk route whose size you can check up front.

Paging the API (above) fails loudly where the streamed archives do not, so prefer it unless you
need every record in one snapshot file. If you do take the JSON archive, run the block below
from the project root. The subshell keeps its `cd` and `set -e` from leaking into your
session. It refuses to start without twice the derived unpacked size free on disk, stops on
any curl error, and treats only a clean `unzip -t` as success.

```bash
(
set -euo pipefail
mkdir -p Data/clinicaltrials_gov/bulk && cd Data/clinicaltrials_gov/bulk
need=$(curl -sS https://clinicaltrials.gov/api/v2/stats/size | python3 -c \
  'import json, sys; d = json.load(sys.stdin); print(d["totalStudies"] * d["averageSizeBytes"] * 2)')
free=$(df -Pk . | awk 'NR == 2 {print $4 * 1024}')
if ! [ "$free" -ge "$need" ] 2>/dev/null; then   # also refuses if $free is not a number
  echo "refusing: free space '$free' bytes, want at least $need bytes" >&2
  exit 1
fi
curl -sS https://clinicaltrials.gov/api/v2/version > version.json
curl -sS --fail -o ctg-studies.json.zip -w "%{http_code} %{size_download} bytes\n" \
  "https://clinicaltrials.gov/api/v2/studies/download?format=json.zip"
unzip -tq ctg-studies.json.zip
echo "complete: $(cat version.json | tr -d '\n ')"
)
```

## Limits worth stating in a write-up

- **Self-reported.** Sponsors and investigators write every field, and NLM checks only for
  apparent errors. Conditions, interventions, enrollment and dates are what the sponsor
  entered.
- **Registered is not run, and run is not reported.** A record exists from registration.
  Results exist for about one in five COMPLETED studies. Absence of results is not a
  negative result.
- **ESTIMATED values are plans.** Enrollment targets and projected dates are overwritten
  when the trial closes, and stale for `UNKNOWN` records.
- **One registry.** Trials registered only in EU CTIS/EudraCT, ISRCTN, ChiCTR or other WHO
  primary registries are missing. Secondary IDs link some of them.
- **The search is recall-oriented.** Synonym expansion and title matching pull in studies
  that do not test the intervention. Decide relevance from structured fields and say how.
- **A snapshot.** Cite the `dataTimestamp`. The terms ask for it, and the record set moves
  daily.

## Try it

**Data.** The live ClinicalTrials.gov API v2: one small search (pembrolizumab in
mesothelioma), the alias pair `NCT00797173` → `NCT00080912`, and registry-wide counts. No
account or key is needed. Use is under NLM's Terms and Conditions (above). Last confirmed
reachable 2026-10-21. The block needs only Python 3 and its standard library.

**Run.** In an empty directory:

```bash
cat > ctgov_check.py <<'PY'
import json, re, time, urllib.error, urllib.parse, urllib.request

BASE = "https://clinicaltrials.gov/api/v2"


def call(path, params=None):
    url = f"{BASE}{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    for i in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and i < 4:
                time.sleep(2 ** i)
                continue
            return e.code, e.read().decode(errors="replace")


code, ver = call("/version")
print("api", ver["apiVersion"], "| data", ver["dataTimestamp"])

# 1. Page through one small query with a deliberately small pageSize.
q = {"query.intr": "pembrolizumab", "query.cond": "mesothelioma",
     "fields": "NCTId|OverallStatus|HasResults|Phase|EnrollmentInfo|StartDateStruct"}
studies, token, total, n_pages = [], None, None, 0
while True:
    p = dict(q, pageSize=10)
    if token:
        p["pageToken"] = token
    else:
        p["countTotal"] = "true"
    code, d = call("/studies", p)
    assert code == 200, (code, d)
    total = d.get("totalCount", total)
    studies += d["studies"]
    n_pages += 1
    token = d.get("nextPageToken")
    if not token:
        break

ids = [s["protocolSection"]["identificationModule"]["nctId"] for s in studies]
assert all(re.fullmatch(r"NCT\d{8}", i) for i in ids), ids
assert len(ids) == len(set(ids)), "pageToken paging returned a duplicate"
assert len(ids) == total, (len(ids), total)
print(f"paging: {total} studies in {n_pages} pages of <=10, no duplicates")

# 2. hasResults and resultsSection agree, both ways, on full records.
with_res = [s for s in studies if s["hasResults"]]
without = [s for s in studies if not s["hasResults"]]
assert with_res and without
for s in with_res[:3] + without[:3]:
    nct = s["protocolSection"]["identificationModule"]["nctId"]
    code, full = call(f"/studies/{nct}")
    assert code == 200
    assert ("resultsSection" in full) == full["hasResults"], nct
done_no_res = [s for s in without
               if s["protocolSection"]["statusModule"]["overallStatus"] == "COMPLETED"]
print(f"results posted: {len(with_res)}; COMPLETED without results: {len(done_no_res)}")

# 3. Phase is a list; enrollment carries its own ACTUAL/ESTIMATED type; dates may be partial.
for s in studies:
    de = s["protocolSection"].get("designModule", {})
    assert isinstance(de.get("phases", []), list)
    assert de.get("enrollmentInfo", {}).get("type", "ACTUAL") in ("ACTUAL", "ESTIMATED")
    sd = s["protocolSection"]["statusModule"].get("startDateStruct")
    if sd:
        assert re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", sd["date"]), sd
multi = sorted({"|".join(s["protocolSection"]["designModule"]["phases"]) for s in studies
                if len(s["protocolSection"].get("designModule", {}).get("phases", [])) > 1})
print("multi-phase values:", multi)

# 4. An alias NCT ID redirects to the current record.
code, rec = call("/studies/NCT00797173", {"fields": "NCTId"})
assert code == 200
assert rec["protocolSection"]["identificationModule"]["nctId"] == "NCT00080912"
assert "NCT00797173" in rec["protocolSection"]["identificationModule"]["nctIdAliases"]
print("alias NCT00797173 -> NCT00080912; fields dropped by the redirect:",
      "statusModule" in rec["protocolSection"])

# 5. Misspelt parameters fail loudly instead of being ignored.
code, body = call("/studies", {"query.condition": "mesothelioma"})
assert code == 400, code
print("query.condition ->", code, body.strip())

# 6. COMPLETED is not "results available", registry-wide.
def count(adv=None, status=None):
    p = {"countTotal": "true", "pageSize": 1, "fields": "NCTId"}
    if adv:
        p["filter.advanced"] = adv
    if status:
        p["filter.overallStatus"] = status
    return call("/studies", p)[1]["totalCount"]

c_all, c_res = count(status="COMPLETED"), count("AREA[HasResults]true", "COMPLETED")
assert 0 < c_res < c_all
p2_any, p2_only = count("AREA[Phase]PHASE2"), count(
    "AREA[Phase]PHASE2 AND NOT AREA[Phase]PHASE1 AND NOT AREA[Phase]PHASE3")
assert p2_any > p2_only
print(f"COMPLETED: {c_all}, with results: {c_res} ({c_res / c_all:.1%})")
print(f"AREA[Phase]PHASE2: {p2_any}; PHASE2 alone: {p2_only}")
PY
python3 ctgov_check.py
```

**Expect**

Invariants hold regardless of the daily refresh. A failure means the skill is wrong:

- Every returned `nctId` matches `^NCT\d{8}$`.
- Paging by `nextPageToken` with `pageSize=10` returns no duplicate IDs, and the number
  collected equals `totalCount` from the first page.
- On full records, `resultsSection` is present exactly when `hasResults` is true.
- `phases` is a list, `enrollmentInfo.type` is `ACTUAL` or `ESTIMATED` where present, and
  start dates are `YYYY-MM` or `YYYY-MM-DD`.
- `NCT00797173` resolves to `NCT00080912`, which lists it under `nctIdAliases`, and the
  redirect returns the full record despite `fields=NCTId`.
- An unknown parameter returns `400`.
- Registry-wide, COMPLETED studies with results are a strict subset of COMPLETED studies,
  and `AREA[Phase]PHASE2` matches more studies than PHASE2-only.

Observed 2026-10-21 against API 2.0.5, dataTimestamp 2026-10-21T09:00:05. These move daily,
so a mismatch is drift to investigate, not a failure:

```
api 2.0.5 | data 2026-10-21T09:00:05
paging: 45 studies in 5 pages of <=10, no duplicates
results posted: 18; COMPLETED without results: 2
multi-phase values: ['PHASE1|PHASE2', 'PHASE2|PHASE3']
alias NCT00797173 -> NCT00080912; fields dropped by the redirect: True
query.condition -> 400 `query.condition` is unknown parameter
COMPLETED: 332549, with results: 67261 (20.2%)
AREA[Phase]PHASE2: 90654; PHASE2 alone: 65872
```

## Sources

- ClinicalTrials.gov API (OpenAPI 3.0 spec at `/api/oas/v2`) — https://clinicaltrials.gov/data-api/api
- API Migration Guide (classic, legacy and v2 paths; bulk archives) — https://clinicaltrials.gov/data-api/about-api/api-migration
- Terms and Conditions — https://clinicaltrials.gov/about-site/terms-conditions
- Disclaimer — https://clinicaltrials.gov/about-site/disclaimer
- Zarin DA et al. (2011) The ClinicalTrials.gov results database — update and key issues. *N Engl J Med* 364, 852-860. PMID 21366476
- Zarin DA et al. (2016) Trial reporting in ClinicalTrials.gov — the Final Rule. *N Engl J Med* 375, 1998-2004. PMID 27635471
- Tse T et al. (2018) How to avoid common problems when using ClinicalTrials.gov in research: 10 issues to consider. *BMJ* 361, k1452. PMID 29802130

Data: ClinicalTrials.gov, US National Library of Medicine. Cite the `dataTimestamp` of the
snapshot you used.
