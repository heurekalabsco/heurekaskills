---
name: all-of-us
description: Browse the All of Us public Data Browser API anonymously — OMOP domains, concept and participant counts, survey modules and questions, and aggregate genomic allele frequencies — and report what Researcher Workbench access requires. Delivers a catalogue of what is measured, never participant data, which never leaves the Workbench.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.1
tags: [all-of-us, cohort, epidemiology, controlled-access, public-data]
covers: [all of us, allofus, precision medicine initiative, researcher workbench, data browser, curated data repository, omop cdm, athena concept id, snomed, loinc, rxnorm, icd10, cpt4, electronic health records, drug exposures, labs and measurements, procedures, physical measurements, fitbit, wearables, surveys, social determinants of health, whole genome sequencing, genotyping array, allele frequency, structural variants, hemoglobin a1c, hypertension, type 2 diabetes, echo cohort]
papers: [PMID:31412182, PMID:38374255, PMID:36033590, PMID:39241756, PMID:42045581]
access: [open, controlled]
datasets: [https://public.api.researchallofus.org/v1/cdrVersions]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: All of Us public Data Browser API at public.api.researchallofus.org, CDR version id 10 "v0-6-rc5 Release version of 2025q4r5_combined" (747,040 participants) / 32 distinct v1 routes enumerated from the live Data Browser client bundle and each probed anonymously — 31 answered, only sub-questions could not be called successfully / count semantics checked on 24 concepts across Condition, Drug, Measurement and Procedure, rounding on 1,800 concept counts over 6 queries, prevalence on a further 953 concepts over 10 queries / Data User Code of Conduct RT_CT_DUCC_V6, Participant Privacy Protections, Data Access Framework and the ECHO availability article read 2026-08-27 / Python 3.12.8, standard library only / curl 8.7.1
  executed: 13
  unverified: 0
---
# All of Us — the public catalogue, and what the Workbench requires

The release the All of Us public Data Browser currently serves covers 747,040 participants,
combining electronic health records, surveys, physical measurements, wearables and genomes.
The data model is **OMOP CDM**, so the concept ids you see here are the ordinary Athena
vocabulary ids — SNOMED, LOINC, RxNorm, CPT4 — and not anything bespoke.

**This skill reads the public tier and nothing else.** Every request below runs anonymously:
no account, no key, no login. What comes back is aggregate — how many participants have a
concept, how those counts split by sex at birth, age decile and US state, how many answered
each survey, and aggregate allele counts for sequenced variants. That is enough to answer the
question people ask *before* applying: **is what I need in there, on how many people, under
which concept ids?**

**It cannot get you participant data and does not promise it.** Individual-level data lives
in the Researcher Workbench behind an institutional agreement, identity verification and
training, and — this is the part that surprises people — **it never leaves**. Analysis happens
inside the Workbench; there is no download. See *Requesting access*.

## The boundary — document the platform, never operate inside it

This skill stops at the public API. It must never be extended to drive an agent inside the
Researcher Workbench, and the reason is the Workbench's own terms rather than caution.

The Data User Code of Conduct (RT_CT_DUCC_V6, read 2026-08-27) commits every signatory:

> I will NOT use or provision research resource access, including access to any All of Us
> analytical platform, to any Artificial Intelligence (AI), AI-enabled, or other type of
> tool that could result in the export of participant-level data or other violations of the
> terms of this Code of Conduct.

and, separately:

> I will take full responsibility for any external data, files, software, or other tools
> that I use in or in conjunction with my Workspace(s) and the consequences thereof.

A skill is an AI-enabled tool, and the liability under that second clause is personal to the
signatory — the reader, not whoever wrote the skill. So the split is:

- **In scope.** The public API, the catalogue it yields, and an accurate account of what
  access requires.
- **Out of scope, permanently.** Anything that authenticates to, runs in, or moves data out
  of the Workbench. Do not add it later.

Two more DUCC clauses shape what is even possible in there, and they are easy to discover too
late:

> I will NOT take screenshots of or attempt in any way to copy, download, or otherwise remove
> any participant-level data, including synthetic data generated using participant data, from
> any All of Us analytical platform.

> I will NOT download, distribute, or publish any available data or data or statistics derived
> therefrom with the intent of reproducing—in part, in full, or in combination—any of the
> available dataset(s) unless expressly permitted under the terms of the Data and Statistics
> Dissemination Policy. […] This includes synthetic data I may generate using one or more
> available dataset(s).

Synthetic data generated *from* participant data cannot be taken out. Code written *outside*
against the open OMOP schema and carried in is a different act and an ordinary one — nothing
is derived from participant data and nothing is exported. If you do that, generate to the OMOP
standard with plausible distributions and do **not** tune a generator to reproduce the
marginals published here: matching real frequencies buys nothing for debugging a join and
edges toward the reproduction clause above. And be clear about what such a rehearsal proves —
the public tier publishes marginals, not covariances, so a synthetic pass validates that your
code runs, that concept ids resolve and that joins hold. It says nothing about whether the
answer is right.

## The public API

One host, no authentication:

```
https://public.api.researchallofus.org
```

Everything the Data Browser website shows is served from `/v1`. The routes that answer
anonymously, all verified 2026-08-27:

| route | method | gives you |
|---|---|---|
| `/v1/cdrVersions` | GET | every published release and its participant count |
| `/v1/databrowser/cdrversion-used` | GET | the release the Data Browser is currently serving |
| `/v1/databrowser/participant-count` | GET | headline participant count |
| `/v1/databrowser/domain-totals` | GET | per-domain concept and participant counts, plus survey modules |
| `/v1/databrowser/searchConcepts` | POST | free-text concept search with participant counts |
| `/v1/databrowser/concept-analysis-results` | GET | per-concept demographics, location, measurement value distributions |
| `/v1/databrowser/getCriteriaRolledCounts` | GET | a concept's node in the criteria tree, with its rolled-up count |
| `/v1/databrowser/getCriteriaChildren` | GET | children of a criteria-tree node |
| `/v1/databrowser/source-concepts` | GET | the source codes mapping into a standard concept |
| `/v1/databrowser/count-analysis` | GET | domain-level counts by sex and age |
| `/v1/databrowser/gender-count` | GET | sex-at-birth totals across the cohort |
| `/v1/databrowser/survey-questions` | GET | the questions in a survey module |
| `/v1/databrowser/survey-question-counts` | GET | answer counts for one question |
| `/v1/databrowser/survey-version-counts` | GET | per-version response counts for a survey |
| `/v1/databrowser/fitbit-analysis-results` | GET | Fitbit measurement distributions |
| `/v1/genomics/search-variants` | POST | short variants by gene, region or variant id |
| `/v1/genomics/variant-details/{variantId}` | GET | allele counts per genetic-ancestry group |
| `/v1/genomics/search-sv-variants` | POST | structural variants |
| `/v1/genomics/sv-variant-details/{variantId}` | GET | one structural variant |
| `/v1/genomics/genomic-filter-options` | GET | the filter values a variant search accepts |
| `/v1/genomics/participant-counts` | GET | how many participants each genomic dataset covers |

Start with a liveness check, because everything below depends on which release is being
served and that number moves:

```bash
curl -sS https://public.api.researchallofus.org/v1/databrowser/cdrversion-used \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["cdrVersionId"], d["name"], d["numParticipants"])'
```

On 2026-08-27 that printed:

```
10 v0-6-rc5 Release version of 2025q4r5_combined 747040
```

**Do not equate this with the Workbench CDR version.** The Workbench publishes its own
Curated Data Repository releases (v8, v9); the Data Browser's `cdrVersionId` is a separate
counter over a separate snapshot. A number matched across the two means nothing.

There is also no single headline participant count. `cdrversion-used` and `cdrVersions` both
report **747,040**, while `/v1/databrowser/participant-count` reports **747,080** for the same
release — 40 apart, one rounding step, and neither is wrong. Pick one and label which you
used; do not present either as exact.

### Every failure is HTTP 500, and the message is always the same

This is the first thing to internalise, because it makes every other mistake look identical.
A route that does not exist, and a route called with a mistyped parameter, both return
**HTTP 500** with a body that names nothing:

```bash
BASE=https://public.api.researchallofus.org
for u in "/v1/nonexistent" "/v1/databrowser/domain-totals" "/v1/databrowser/survey-questions?surveyConceptId=1586134"; do
  printf '%-62s ' "$u"
  printf 'HTTP %s  ' "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$u")"
  curl -sS "$BASE$u" | head -c 60; echo
done
```

```
/v1/nonexistent                                                HTTP 500  {"message":"unknown error","statusCode":500,"errorClassName"
/v1/databrowser/domain-totals                                  HTTP 500  {"message":"unknown error","statusCode":500,"errorClassName"
/v1/databrowser/survey-questions?surveyConceptId=1586134       HTTP 500  {"message":"unknown error","statusCode":500,"errorClassName"
```

The third one is a real route with a real concept id. It fails because the parameter is
spelled `survey_concept_id` on the wire. **Treat a 500 as "you got the call wrong", not as
"the service is down"** — and never write a retry loop around one, because it will retry
forever.

### The parameter names are not consistent, and there is no spec to read

Three conventions are in use, sometimes within a single endpoint. There is no published
OpenAPI document at this host; these were read off the live Data Browser client and each one
confirmed against the API:

| endpoint | parameters, exactly as they must appear |
|---|---|
| `domain-totals` | `searchWord`, `testFilter`, `orderFilter` |
| `searchConcepts` | JSON body — `query`, `domain`, `standardConceptFilter`, `maxResults` |
| `concept-analysis-results` | `concept-ids` (comma-separated), `domain-id` |
| `count-analysis` | `domain-id`, `domain-desc` |
| `source-concepts` | `concept_id`, `minCount` |
| `survey-questions` | `survey_concept_id`, `search_word` |
| `survey-question-counts` | `questionConceptId`, `questionPath` |
| `survey-question-results` | `survey_concept_id`, `question_concept_id`, `question_path` |
| `survey-version-counts` | `survey_concept_id` |
| `getCriteriaRolledCounts` | `conceptId`, `domain` |
| `getCriteriaChildren` | `parentId` |
| `fitbit-analysis-results` | `concept-names` |
| `genomic-filter-options`, `sv-genomic-filter-options` | `variant-search-term` |

`source-concepts` takes `concept_id` and `minCount` — snake and camel in the same query
string. Response fields, meanwhile, are camelCase throughout. Copy the table rather than
guessing from the JSON you get back.

A small helper keeps the rest of this readable. Write it once:

```python
# aou.py — minimal client for the All of Us public Data Browser API.
# Standard library only; no account, no key.
import json
import urllib.parse
import urllib.request

BASE = "https://public.api.researchallofus.org"


class AouError(RuntimeError):
    """The API answers 500 for a bad route AND for a mistyped parameter."""


def get(path, **params):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 500:
            raise AouError(
                f"HTTP 500 on {path} — the route or a parameter name is wrong, "
                f"not a server outage. Check the parameter table."
            ) from None
        raise


def post(path, body):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


if __name__ == "__main__":
    v = get("/v1/databrowser/cdrversion-used")
    print(f"CDR {v['cdrVersionId']}: {v['name']} — {v['numParticipants']:,} participants")
```

```
CDR 10: v0-6-rc5 Release version of 2025q4r5_combined — 747,040 participants
```

## Domains and surveys — and the two filters that decide whether labs exist

`domain-totals` is the top of the catalogue. It takes three parameters that the client marks
optional and the server treats as required, and two of them silently change the answer.

`testFilter` and `orderFilter` select whether lab **tests** and lab **orders** are counted in
the Measurement domain. They affect nothing else. Omit them and the largest concept domain in
the program reports **zero concepts** — a plausible-looking number that is simply wrong:

```python
from aou import get

print(f"{'testFilter':>10} {'orderFilter':>11} {'Measurement standardConceptCount':>34}")
for tf in (0, 1):
    for of in (0, 1):
        d = get("/v1/databrowser/domain-totals", searchWord="", testFilter=tf, orderFilter=of)
        m = next(x for x in d["domainInfos"] if x["domain"] == "MEASUREMENT")
        print(f"{tf:>10} {of:>11} {m['standardConceptCount']:>34,}")
```

```
testFilter orderFilter   Measurement standardConceptCount
         0           0                                  0
         0           1                              7,450
         1           0                             20,385
         1           1                             27,835
```

7,450 + 20,385 = 27,835, and 27,835 is what the Data Browser website displays. **Always pass
`testFilter=1&orderFilter=1`** unless you specifically want one half.

With them set, the domain table is the whole EHR catalogue:

```python
from aou import get

d = get("/v1/databrowser/domain-totals", searchWord="", testFilter=1, orderFilter=1)

print(f"{'domain':<22} {'conceptId':>9} {'standard':>9} {'all':>9} {'participants':>13}")
for x in d["domainInfos"]:
    print(f"{x['name']:<22} {x['domainConceptId']:>9} {x['standardConceptCount']:>9,} "
          f"{x['allConceptCount']:>9,} {x['participantCount']:>13,}")

print()
print(f"{'survey module':<42} {'conceptId':>9} {'questions':>9} {'participants':>13}")
for s in d["surveyModules"]:
    print(f"{s['name']:<42} {s['conceptId']:>9} {s['questionCount']:>9} {s['participantCount']:>13,}")
```

```
domain                 conceptId  standard       all  participants
Conditions                    19    37,247    99,005       436,280
Drug Exposures                13    35,639   114,009       418,260
Labs & Measurements           21    27,835         0       439,060
Procedures                    10    40,970    45,315       415,260
Physical Measurements          0         8         8       600,840
Fitbit                         0        10        10        68,840

survey module                              conceptId questions  participants
The Basics                                   1586134        25       747,040
Overall Health                               1585710        21       680,140
Lifestyle                                    1585855        26       674,100
Health Care Access and Utilization          43528895        57       368,580
Personal and Family Health History          43529712       604       354,760
Social Factors of Health                    40192389        80       314,560
Emotional Health History and Well-Being      1703970        92       137,960
Behavioral Health and Personality            1703870        46       139,640
```

Three things in that output that will bite a script:

- **`allConceptCount` is 0 for Labs & Measurements in every filter combination.** It is not a
  count of anything; do not divide by it or compare it across domains.
- **`domain` is `null` and `domainConceptId` is 0 for Physical Measurements and Fitbit.** They
  are not OMOP domains. Key on `name`, not on `domain`, or those two rows vanish.
- The other four `domainConceptId` values *are* OMOP's — 19 Condition, 13 Drug, 21 Measurement,
  10 Procedure.

## Searching the concept catalogue

`searchConcepts` is a POST with a JSON body. It is the one call that answers "what is this
called and how many people have it":

```python
from aou import post

r = post("/v1/databrowser/searchConcepts", {
    "query": "hemoglobin A1c",
    "domain": "MEASUREMENT",
    "standardConceptFilter": "STANDARD_CONCEPTS",
    "maxResults": 5,
})

print(f"{'conceptId':>9} {'vocab':<8} {'code':<12} {'std':<4} {'participants':>12}  name")
for c in r["items"]:
    print(f"{c['conceptId']:>9} {c['vocabularyId']:<8} {c['conceptCode']:<12} "
          f"{c['standardConcept'] or '-':<4} {c['countValue']:>12,}  {c['conceptName'][:44]}")
```

```
conceptId vocab    code         std  participants  name
  3004410 LOINC    4548-4       S         212,720  Hemoglobin A1c/Hemoglobin.total in Blood
  4184637 SNOMED   43396009     S          75,380  Hemoglobin A1c measurement
  3005673 LOINC    17856-6      S          65,120  Hemoglobin A1c/Hemoglobin.total in Blood by 
  3034639 LOINC    41995-2      S           8,280  Hemoglobin A1c [Mass/volume] in Blood
  4036846 SNOMED   117346004    S           7,080  Glucose measurement estimated from glycated 
```

`domain` accepts `CONDITION`, `DRUG`, `MEASUREMENT`, `PROCEDURE`, or may be omitted to search
everything. `standardConceptFilter` accepts `STANDARD_CONCEPTS`, `NON_STANDARD_CONCEPTS` and
`ALL_CONCEPTS`.

**An unrecognised `standardConceptFilter` is silently accepted.** Sending `"BANANA"` returns
50 rows, every one of them standard — identical to `STANDARD_CONCEPTS`, with no error and no
warning. A typo here does not fail; it quietly changes what you are counting. Assert on
`standardConcept` in the rows rather than trusting the request.

**`prevalence` is 1.0 on every row.** Checked across 953 concepts from 10 queries spanning all
four domains: every single one carried `prevalence: 1.0`. It is not a rate, and dividing by it
or plotting it produces a flat line that looks like a finding. Compute prevalence yourself
from `countValue` and the release's participant count if you need it.

`sourceCountValue` is the count for records that arrived coded as this concept, before mapping
to the standard vocabulary; `countValue` is what you almost always want.

## The three participant counts for one concept, and which one to use

This is the trap that produces confidently wrong numbers, and it does not announce itself.
A concept can have three different published counts:

- `searchConcepts` → `countValue`, which **rolls up descendants** in the vocabulary hierarchy
- `getCriteriaRolledCounts` → `parent.count`, the criteria tree's own rolled-up count
- `concept-analysis-results` → `countAnalysis`, the count for **that code alone**

```python
from aou import get, post

for cid, dom in [(3004410, "Measurement"), (317009, "Condition"),
                 (4152280, "Condition"), (4324693, "Procedure")]:
    node = get("/v1/databrowser/getCriteriaRolledCounts", conceptId=cid, domain=dom.upper())["parent"]
    hit = next(c for c in post("/v1/databrowser/searchConcepts",
                               {"query": str(cid), "maxResults": 5,
                                "standardConceptFilter": "ALL_CONCEPTS"})["items"]
               if c["conceptId"] == cid)
    item = get("/v1/databrowser/concept-analysis-results", **{"concept-ids": cid, "domain-id": dom})["items"][0]
    own = item["countAnalysis"]["results"][0]["countValue"] if item["countAnalysis"] else None
    print(f"{cid:>8} group={str(node['group']):<5} search={hit['countValue']:>8,} "
          f"rolled={node['count']:>8,} countAnalysis={own:>8,}  {node['name'][:34]}")
```

```
 3004410 group=False search= 212,720 rolled= 212,720 countAnalysis= 212,720  Hemoglobin A1c/Hemoglobin.total in
  317009 group=True  search=  84,840 rolled=  84,840 countAnalysis=  46,840  Asthma
 4152280 group=True  search= 111,380 rolled= 111,380 countAnalysis=   2,720  Major depressive disorder
 4324693 group=True  search=  52,620 rolled=  52,620 countAnalysis=  21,500  Mammography
```

`searchConcepts` and `getCriteriaRolledCounts` agreed exactly on every concept where the
criteria tree carries the node. `countAnalysis` is a different, smaller quantity whenever
`group` is true — for *Major depressive disorder* it is **41× smaller**, because most of those
participants are recorded under a child code.

**Use `countValue` from `searchConcepts` for "how many participants have this".** Read
`countAnalysis` as "how many carry this exact code", which is a question about coding practice,
not about disease.

Two limits on the tree that matter when scripting it, and the first is the dangerous one:

- **A missing node is `{"parent": null}` with HTTP 200 — and so is a wrong `domain`, and so is
  a concept id that does not exist.** All three are indistinguishable. RxNorm drug concepts
  have no node at all: metformin and atorvastatin at three strengths each return `null`.
  Mammography (4324693) returns its node under `domain=PROCEDURE` and `null` under
  `domain=MEASUREMENT`, with no complaint. Code that does `["parent"]["count"]` raises a
  `TypeError` on a perfectly successful call, and code that uses `.get()` chains reads a
  silent `None` as "no participants". Check `parent is None` explicitly and fall back to the
  search count.
- **For CPT4 procedure codes the tree count is *lower* than the search count** — 67,340 from
  `searchConcepts` against 60,380 from the tree for *Colonoscopy, flexible; with biopsy*. The
  two are counting different record sets. Pick one source and stay in it; do not mix them in a
  single table.

## Demographics for a concept — and why the strata do not sum

`concept-analysis-results` returns, for one concept, its breakdown by sex at birth, age decile,
US state, a combined age × sex table, and — for measurements — value distributions.

```python
from aou import get

item = get("/v1/databrowser/concept-analysis-results",
           **{"concept-ids": 3004410, "domain-id": "Measurement"})["items"][0]

total = item["countAnalysis"]["results"][0]["countValue"]
print(f"countAnalysis total: {total:,}\n")

for key in ("genderAnalysis", "ageAnalysis", "combinedAgeGenderAnalysis", "locationAnalysis"):
    a = item[key]
    vals = [x["countValue"] for x in a["results"]]
    print(f"{a['analysisName']:<20} cells={len(vals):>3} sum={sum(vals):>9,} "
          f"({sum(vals) - total:+,} vs total)  min={min(vals):,}  all multiples of 20: {all(v % 20 == 0 for v in vals)}")

print()
for x in sorted(item["genderAnalysis"]["results"], key=lambda r: -r["countValue"]):
    print(f"  {x['analysisStratumName']:<8} {x['countValue']:>9,}")
```

```
countAnalysis total: 212,720

Biological Sex       cells=  3 sum=  212,760 (+40 vs total)  min=2,080  all multiples of 20: True
Age at Occurrence    cells=  8 sum=  211,800 (-920 vs total)  min=440  all multiples of 20: True
Combined age/sex     cells= 27 sum=  314,960 (+102,240 vs total)  min=20  all multiples of 20: True
Location             cells= 59 sum=  213,220 (+500 vs total)  min=20  all multiples of 20: True

  Female     126,440
  Male        84,240
  Other        2,080
```

**No stratification here is a partition of participants.** Sex at birth overshoots the total
by 40 and location by 500 — each cell is rounded independently, so small discrepancies are
unavoidable and expected. The combined age × sex table overshoots by **+102,240**, half again
the total, and it exceeds the plain `ageAnalysis` in every decile. Two published breakdowns
of the same concept therefore disagree by far more than rounding explains. All of Us does not
document what distinguishes them, and this skill does not guess; what matters is the rule that
follows either way.

So: take totals from `countValue`, take shares from within a single stratification, and never
sum a stratification to recover a headcount or reconcile one analysis against another.

`locationAnalysis` covers US states plus territories (59 cells here, including Guam and Puerto
Rico), generalised to state — never finer. For measurement concepts, `measurementDistributionAnalysis`
and `measurementValueGenderAnalysis` carry binned value distributions; `measurementValueAgeAnalysis`,
`ehrCountAnalysis` and `participantCountAnalysis` were `null` on every concept tested, and for
non-measurement concepts all six measurement keys are `null`. Check for `None` before indexing.

## What the counts mean — rounding, and the floor of 20

The Data Browser states its own disclosure control on its front page:

> To protect participant privacy, we have removed personal identifiers, rounded aggregate
> data to counts of 20, and only included summary demographic information. Individual-level
> data are available for analysis in the Researcher Workbench.

That matches the policy the Data Access Framework sets for the whole program — data may leave
the Workbench only as "research analyses with aggregate statistics in buckets of 20 or more
individuals" — and the DUCC binds every authorised user to the same line:

> I will NOT publish or otherwise distribute any data or aggregate statistics corresponding
> to fewer than 20 participants unless expressly permitted under the terms of the All of Us
> Data and Statistics Dissemination Policy.

Confirmed against the API rather than taken on trust, across all four EHR domains:

```python
from aou import post

counts, small = [], []
for q, dom in [("diabetes", "CONDITION"), ("aspirin", "DRUG"), ("hemoglobin", "MEASUREMENT"),
               ("biopsy", "PROCEDURE"), ("deficiency", None), ("neoplasm", None)]:
    body = {"query": q, "maxResults": 300, "standardConceptFilter": "ALL_CONCEPTS"}
    if dom:
        body["domain"] = dom
    for c in post("/v1/databrowser/searchConcepts", body)["items"]:
        counts.append(c["countValue"])
        if c["countValue"] <= 40:
            small.append(c["conceptName"][:40])

print(f"concepts examined:      {len(counts):,}")
print(f"all multiples of 20:    {all(v % 20 == 0 for v in counts)}")
print(f"none below 20:          {min(counts) >= 20}")
print(f"any zero counts:        {any(v == 0 for v in counts)}")
print(f"smallest count seen:    {min(counts)}")
print(f"concepts at 20 or 40:   {len(small)}")
```

```
concepts examined:      1,800
all multiples of 20:    True
none below 20:          True
any zero counts:        False
smallest count seen:    20
concepts at 20 or 40:   304
```

The first three lines are the claim; the last two are what this particular release and these
particular queries happened to show. A narrower search may never return a concept at the floor
at all, which is why "smallest count seen" is an observation and "none below 20" is the
assertion.

Three consequences for anyone planning a study on these numbers:

- **A published 20 is not 20 people.** It is the smallest reportable value, and a true count
  anywhere between roughly 10 and 30 lands there. Rare-disease feasibility cannot be settled
  from the public tier; it can only be shown to be small.
- **Absence is not zero.** A concept that never appears in results may have too few
  participants to report rather than none. The public tier cannot distinguish those.
- **Rounding error compounds when you divide.** A ratio of two counts near 20 carries ±50%
  before anything else has gone wrong. Do not compute rates on small cells.

The Registered and Controlled Tiers apply *different* transformations to the same underlying
records, so counts differ across tiers by design. All of Us says so directly: participants
aged 89 or over are suppressed in the Registered Tier and present in the Controlled Tier, so a
Registered-Tier count of an ageing cohort will be lower than the Controlled-Tier count of the
same cohort. Neither is the public number either. **Never carry a public-tier count into a
Workbench analysis as a denominator.**

## Surveys

`survey-questions` lists a module's questions. It has a trap of its own and it is the noisy
kind — a plausible zero rather than an error:

```python
from aou import get

d = get("/v1/databrowser/survey-questions", survey_concept_id=1585855)
items = d["questions"]["items"]

print(f"module: {d['survey']['name']} — questionCount says {d['survey']['questionCount']}, "
      f"top-level items returned: {len(items)}")
print(f"countValue is 0 on all of them: {all(q['countValue'] == 0 for q in items)}")
print(f"countAnalysis present on any:   {any(q['countAnalysis'] for q in items)}\n")

for q in items:
    print(f"  {q['conceptId']:>9} {q['conceptCode']:<44} {q['conceptName'][:52]}")
```

```
module: Lifestyle — questionCount says 26, top-level items returned: 7
countValue is 0 on all of them: True
countAnalysis present on any:   False

    1585857 Smoking_100CigsLifetime                      Have you smoked at least 100 cigarettes in your enti
    1586166 ElectronicSmoking_ElectricSmokeParticipant   Have you ever used an electronic nicotine product, e
    1586174 CigarSmoking_CigarSmokeParticipant           Have you ever smoked a traditional cigar, cigarillo,
    1586182 HookahSmoking_HookahSmokeParticipant         Have you ever smoked tobacco in a hookah, even one o
    1586190 SmokelessTobacco_SmokelessTobaccoParticipant Have you ever used smokeless tobacco products, even 
    1586198 Alcohol_AlcoholParticipant                   In your entire life, have you had at least 1 drink o
    1585636 RecreationalDrugUse_WhichDrugsUsed           In your LIFETIME, which of the following substances 
```

Both surprises are real, both are silent, and both were checked across all eight modules:

- **`countValue` is 0 on every question and `countAnalysis` is `null`** — on all 413 questions
  the eight modules return, not just this one. The per-question numbers are not in this
  response. Fetch them from `survey-question-counts`, which takes **camelCase**
  `questionConceptId` and `questionPath`, and `questionPath` must be the question's own `path`
  field from this listing rather than a guess. An empty `questionPath` returns `{"items": []}`
  with HTTP 200 — which reads as "no data" and means "wrong argument".
- **The listing returns fewer questions than the module declares, in every module.** 413 of
  951 across the eight, and the gap is not proportional: *Social Factors of Health* returns 79
  of 80, *Lifestyle* 7 of 26, *Personal and Family Health History* 160 of 604. The `sub` array
  is empty on all 413, so the remainder is not reachable from this response at all. Never treat
  `len(items)` as the survey's question count — take that from `domain-totals` →
  `surveyModules` → `questionCount`, which is also where the module concept ids come from.

## Aggregate genomics is *not* rounded — and that is deliberate

The rounding rule is about participant counts. The variant endpoints publish **exact allele
counts**, down to a single observed allele, broken out by genetic-ancestry group. Do not
carry the "everything is a multiple of 20" assumption across:

```python
from aou import get, post

r = post("/v1/genomics/search-variants",
         {"query": "BRCA2", "pageNumber": 1, "rowCount": 5,
          "filterMetadata": None, "sortMetadata": None})

print(f"{'variantId':<22} {'consequence':<20} {'AC':>6} {'AN':>10} {'AF':>10}")
for v in r["items"]:
    print(f"{v['variantId']:<22} {str(v['consequence'])[:20]:<20} {v['alleleCount']:>6} "
          f"{v['alleleNumber']:>10,} {v['alleleFrequency']:>10.2e}")

d = get(f"/v1/genomics/variant-details/{r['items'][0]['variantId']}")
print(f"\n{d['variantId']} — {d['dnaChange']}")
for pop in ("afr", "amr", "eas", "eur", "mid", "sas", "oth", "total"):
    print(f"  {pop:<6} AC={d[pop + 'AlleleCount']:>6}  AN={d[pop + 'AlleleNumber']:>10,}  "
          f"hom={d[pop + 'HomozygoteCount']:>4}")
```

```
variantId              consequence              AC         AN         AF
13-32310475-A-G        intron_variant            2  1,071,286   2.00e-06
13-32310484-C-T        intron_variant            1  1,071,282   1.00e-06
13-32310489-A-G        intron_variant            2  1,071,198   2.00e-06
13-32310489-A-T        intron_variant            1  1,071,198   1.00e-06
13-32310491-T-A        intron_variant            2  1,071,208   2.00e-06

13-32310475-A-G — ENST00000533490.6:c.747+164T>C
  afr    AC=     0  AN=   189,220  hom=   0
  amr    AC=     0  AN=   194,854  hom=   0
  eas    AC=     1  AN=    25,962  hom=   0
  eur    AC=     1  AN=   569,482  hom=   0
  mid    AC=     0  AN=     2,582  hom=   0
  sas    AC=     0  AN=    11,254  hom=   0
  oth    AC=     0  AN=    77,932  hom=   0
  total  AC=     2  AN= 1,071,286  hom=   0
```

`AC = 1` is a real singleton. These are aggregate allele frequencies of the kind gnomAD
publishes, not participant counts, which is why the 20-participant floor does not apply to
them. **Individual-level genomic data is Controlled Tier only** — All of Us lists genomic data
as *suppressed* in the Registered Tier and *included* in the Controlled Tier — so a genotype,
a sample, or a per-participant call is not obtainable here under any query.

**Three genomics endpoints declare `Content-Type: application/json` and return a body that is
not JSON.** `search-term-type` answers four bytes reading `gene` — not `"gene"`.
`variant-search-result-size` and `sv-variant-search-result-size` answer a bare integer.
`json.loads` raises on all three, and a wrapper that parses by content-type will crash on a
successful call. Read them as raw bytes. `search-term-type` has a second problem: it answers
`gene` for input that matches nothing at all, so it never tells you a term is unrecognised.

## Get the files

What this section delivers is a **catalogue** — what All of Us measures, under which concept
ids, on how many people. It is not participant data and cannot be: participant-level data
never leaves the Workbench. Everything written here is public aggregate output that anyone can
regenerate anonymously. All of Us states no reuse licence over these aggregates, so keep the
files as working notes and cite the program rather than redistributing them as a dataset.

This writes four files and prints a summary of what it decided on your behalf.

```python
# build_catalogue.py — write the All of Us public catalogue to disk.
import csv
import json
import time

from aou import get, post

DOMAINS = ["CONDITION", "DRUG", "MEASUREMENT", "PROCEDURE"]

release = get("/v1/databrowser/cdrversion-used")
totals = get("/v1/databrowser/domain-totals", searchWord="", testFilter=1, orderFilter=1)

# 1. domains and survey modules
with open("aou_domains.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["kind", "name", "concept_id", "standard_concepts", "questions", "participants"])
    for d in totals["domainInfos"]:
        w.writerow(["domain", d["name"], d["domainConceptId"], d["standardConceptCount"], "", d["participantCount"]])
    for s in totals["surveyModules"]:
        w.writerow(["survey", s["name"], s["conceptId"], "", s["questionCount"], s["participantCount"]])

# 2. survey questions, top-level, for every module
with open("aou_survey_questions.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["survey", "survey_concept_id", "question_concept_id", "concept_code", "path", "question"])
    for s in totals["surveyModules"]:
        qs = get("/v1/databrowser/survey-questions", survey_concept_id=s["conceptId"])["questions"]["items"]
        for q in qs:
            w.writerow([s["name"], s["conceptId"], q["conceptId"], q["conceptCode"], q["path"], q["conceptName"]])
        time.sleep(0.2)

# 3. concepts matching a shortlist of terms, with rolled-up participant counts
TERMS = ["type 2 diabetes", "hypertension", "hemoglobin A1c", "metformin", "colonoscopy"]
rows = []
for term in TERMS:
    for dom in DOMAINS:
        for c in post("/v1/databrowser/searchConcepts",
                      {"query": term, "domain": dom, "maxResults": 25,
                       "standardConceptFilter": "STANDARD_CONCEPTS"})["items"]:
            rows.append({
                "search_term": term, "domain": c["domainId"], "concept_id": c["conceptId"],
                "concept_name": c["conceptName"], "vocabulary": c["vocabularyId"],
                "concept_code": c["conceptCode"], "concept_class": c["conceptClassId"],
                "participants": c["countValue"], "source_records": c["sourceCountValue"],
            })
        time.sleep(0.2)

with open("aou_concepts.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

# 4. provenance — what the numbers are, and what they are not
meta = {
    "source": "All of Us public Data Browser API, https://public.api.researchallofus.org",
    "cdr_version_id": release["cdrVersionId"],
    "cdr_name": release["name"],
    "cdr_participants": release["numParticipants"],
    "retrieved_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "tier": "public",
    "disclosure_control": "counts rounded to the nearest 20; 20 is the smallest reportable value",
    "participant_data_included": False,
    "search_terms": TERMS,
    "count_semantics": "participants = searchConcepts countValue, which rolls up descendant concepts",
}
with open("aou_catalogue_meta.json", "w") as fh:
    json.dump(meta, fh, indent=2)

print(f"release          {meta['cdr_name']} ({meta['cdr_participants']:,} participants)")
print(f"domains+surveys  aou_domains.csv          {len(totals['domainInfos'])} domains, "
      f"{len(totals['surveyModules'])} survey modules")
print(f"survey questions aou_survey_questions.csv {sum(1 for _ in open('aou_survey_questions.csv')) - 1} rows")
print(f"concepts         aou_concepts.csv         {len(rows)} rows for {len(TERMS)} terms")
print(f"provenance       aou_catalogue_meta.json")
print()
print("Decided for you: testFilter=1 and orderFilter=1 (without both, Labs & Measurements")
print("reports 0 concepts); STANDARD_CONCEPTS only; 25 concepts per term per domain.")
print("Counts roll up descendants and are rounded to 20 — a 20 means 'fewer than ~30', not 20.")
print("Not included: participant-level data, which never leaves the Researcher Workbench.")
```

```
release          v0-6-rc5 Release version of 2025q4r5_combined (747,040 participants)
domains+surveys  aou_domains.csv          6 domains, 8 survey modules
survey questions aou_survey_questions.csv 413 rows
concepts         aou_concepts.csv         138 rows for 5 terms
provenance       aou_catalogue_meta.json

Decided for you: testFilter=1 and orderFilter=1 (without both, Labs & Measurements
reports 0 concepts); STANDARD_CONCEPTS only; 25 concepts per term per domain.
Counts roll up descendants and are rounded to 20 — a 20 means 'fewer than ~30', not 20.
Not included: participant-level data, which never leaves the Researcher Workbench.
```

A summary of what that run assumed, so you can correct it rather than discover it later:

- **Proposed** — a concept shortlist for five example terms across four OMOP domains, with
  rolled-up participant counts. Replace `TERMS` with your own.
- **Inferred** — the release identity from `cdrversion-used`, so the CSVs are dated to a
  snapshot rather than to "today".
- **Decided** — `testFilter=1&orderFilter=1`, standard concepts only, 25 results per term per
  domain, and `countValue` (rolled up) as *the* participant count. Each of those changes the
  numbers.
- **Outstanding** — per-question answer distributions are not written; they need a
  `survey-question-counts` call per question with that question's `path`, and the strata that
  come back are unlabelled. And the question file holds the 413 questions the listing returns,
  not the 951 the modules declare: the rest are not reachable from that endpoint.

## Requesting access

**This skill cannot obtain Workbench access and nothing here should be read as a promise of
one.** It describes the published route so you can decide whether to start it. The
authoritative sources are the All of Us Research Hub and its User Support policy articles,
linked under *Sources*; where they and this disagree, they are right and this is stale.

**Understand the shape before the paperwork.** This is not a repository that sends you files.
Approved researchers work *inside* the Researcher Workbench, a cloud environment where the
analysis runs next to the data. Nothing participant-level comes out — not a file, not a
screenshot, not synthetic data derived from it. What may leave is aggregate results in buckets
of 20 or more. Plan the compute, the collaboration and the publication figures around that
before applying, because it changes how a project is built, not just how it starts.

**Consent is broad, and that is the unusual part.** On most controlled human cohorts the
binding constraint is what subjects consented to, and a study consented for one disease cannot
answer a question about another even after access is granted. Not here — the Data Access
Framework states:

> All of Us participants consent to the use of their samples and data for general secondary
> research use without specific data use restrictions. This allows access to All of Us data
> resources to be user-based, rather than project-based.

So the usual "is my question even eligible" triage does not apply. What binds instead is that
use must be **biomedical or health research**, must not be discriminatory or stigmatising, and
must match the Workspace description you publish. Your name, affiliation and research
description are made public. Commercial use is not excluded — the same framework states that
"no restrictions are placed on the use of All of Us resources to develop commercial products
and tests to meet public health needs", and that the program claims no intellectual property
rights in them.

**Who may apply.** Researchers affiliated with an institution — academic, healthcare,
not-for-profit, government or industry — that has a **Data Use and Registration Agreement
(DURA)** with the program, using an institutional email address. The framework's stated
principle is broader than that:

> Data should be available to not only researchers at academic medical centers, but also to
> users affiliated with industry and citizen and community scientists with no institutional
> affiliation.

and it says access should reach users internationally. The institutional agreement is the
practical gate today, and that framework document is two years old, so confirm the current
route rather than planning around the aspiration. If your institution has no DURA, the access
team (`aoudurasupport@vumc.org`) works with a signing official to put one in place — an
institution-level negotiation and the long pole in any timeline.

**The steps, with the program's own published timings.** Once your institution's DURA is in
place, the individual steps are:

| step | what it is | time |
|---|---|---|
| Google 2-step verification | on the account used for the Workbench | 5–10 min |
| Identity verification | Login.gov or ID.me, to NIST IAL2; pseudonyms are not allowed | 10–20 min |
| Responsible Conduct of Research training | program modules including data security and participant privacy, with an evaluation | 30–90 min |
| Data User Code of Conduct | read and sign | 5–10 min |

Access requests are reviewed after submission; the program's own guidance says its team
"will reach out within two weeks". Authorisation is **user-based, not project-based** — you
receive a "data passport", then create Workspaces under it.

**Registered versus Controlled Tier.** Both hold participant-level data; they differ in how
much has been transformed to protect privacy. The Controlled Tier requires approval that
builds on the Registered Tier's, and is the only tier with genomic data. The differences that
most often decide which tier a project needs:

| data element | Registered Tier | Controlled Tier |
|---|---|---|
| Genomic data (program-generated WGS and array) | Suppressed | Included |
| Dates of events, birth, death | Shifted back by a random 1–365 days, constant per participant | Included (date of birth generalised to year) |
| Participants aged over 89 | Suppressed | Included |
| Geolocation | Generalised to US state | Generalised to 3-digit ZIP |
| Race and ethnicity subcategories | Suppressed | Included |
| Sex at birth, gender identity, sexual orientation | Generalised | Included |
| Race, ethnicity, sex and gender from EHR | Suppressed | Included |
| Death cause from EHR | Suppressed | Included |
| Active duty military status | Suppressed | Included |
| Explicit identifiers, free text, motor-vehicle-accident codes | Suppressed | Suppressed |

Because the transformations differ, **counts differ between tiers**, and neither matches the
public number. That is expected and is not an error to reconcile.

**Terms that change how a project is planned, not just how it is approved.** Three DUCC
clauses are routinely discovered too late:

- **No participant-level linking without documented permission** — not to another available
  dataset that is not already linked, and not to outside data. Permission comes from the
  Resource Access Board, applied for separately. A design that assumes linkage should confirm
  it first.
- **Minimum necessary** — "I will request, query, import, or otherwise use the minimum
  necessary data, data types, and/or datasets to accomplish my research objective." Pulling
  the whole CDR because it is easier is a term violation, not a style preference.
- **One tier at a time** — "I will NOT attempt to access, either directly or indirectly, more
  than one data tier simultaneously."

**Annual renewal is a requirement, not a reminder.** Access lapses without it:

> I will renew my Authorized Data User account on at least an annual basis to maintain my
> access. Renewal may include and is not necessarily limited to: Retaking the Responsible
> Conduct of Research Training(s) and passing the evaluation(s); Reading and signing the Data
> User Code of Conduct; and Ensuring the accuracy of my Workspace Description(s), as
> appropriate.

The Code of Conduct itself is revised — the current version is RT_CT_DUCC_V6, dated August
2026 — and a revision requires signing again. Anyone registered before it must log in and
re-sign; the ECHO documentation says so explicitly for its own dataset.

**Other datasets under the same terms.** The Workbench hosts datasets beyond All of Us on the
same agreement. The **ECHO** cohort (Environmental influences on Child Health Outcomes) is
there now — 89,529 participants across 46,403 pregnancies, 42,224 children and 902 partners,
from 69 pediatric cohorts, as "ECHO Cohort - Registered Tier" and "ECHO Cohort - Controlled
Tier" collections. Access needs a DURA that *specifically allows ECHO*, which is a separate
institutional permission from the base one. ECHO and All of Us are enrolled separately and
their records are **not linked** at the participant level.

**What this skill will and will not do.** It will assemble the concept shortlist and
participant counts that make the case for feasibility, checklist what registration asks for,
and explain what an institutional signing official is and why one is needed. It will **not**
draft or complete any attestation — identity, institutional status, data security, the
Workspace description you publish under your own name, or the Code of Conduct signature.
Those are statements a named person makes and is personally accountable for.

## Try it

A cold check that the public API is reachable and still behaves the way this skill describes.
No account, no key, standard library only.

**Data** — the All of Us public Data Browser API:

    https://public.api.researchallofus.org/v1/cdrVersions
    https://public.api.researchallofus.org/v1/databrowser/domain-totals?testFilter=1&orderFilter=1

Aggregate-only, published openly by the program for anyone to browse without logging in; the
Data Browser front page states that counts are rounded to 20 and that individual-level data
stays in the Researcher Workbench. No participant data is fetched here. **All of Us attaches
no explicit reuse licence to these aggregates** — there is no terms-of-use or licence
statement on the Data Browser or the Research Hub covering them, and no click-through — so
treat what you retrieve as reference material for your own planning, cite the program, and do
not republish it as a dataset. Both URLs confirmed reachable 2026-08-27.

The block deliberately routes through the traps rather than around them: it makes the
camelCase call that returns HTTP 500, calls `domain-totals` with the filters both off and both
on, and compares a group concept's rolled-up count against its own-code count. If those still
behave as described, the rest of the skill is very likely still true.

```python
import json
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://public.api.researchallofus.org"


def get(path, **params):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.load(r)


def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


# 1. invariant: a bad parameter name is HTTP 500, not 400 or 404
try:
    get("/v1/databrowser/survey-questions", surveyConceptId=1586134)
    bad_param = "no error"
except urllib.error.HTTPError as e:
    bad_param = f"HTTP {e.code}"
print(f"camelCase survey param    -> {bad_param}")

# 2. invariant: testFilter/orderFilter gate the Measurement concept count
counts = {}
for tf in (0, 1):
    for of in (0, 1):
        d = get("/v1/databrowser/domain-totals", searchWord="", testFilter=tf, orderFilter=of)
        m = next(x for x in d["domainInfos"] if x["domain"] == "MEASUREMENT")
        counts[(tf, of)] = m["standardConceptCount"]
print(f"Measurement concepts 0,0  -> {counts[(0, 0)]}")
print(f"Measurement concepts 1,1  -> {counts[(1, 1)]:,}")
print(f"tests + orders == both    -> {counts[(1, 0)] + counts[(0, 1)] == counts[(1, 1)]}")

# 3. invariant: every published count is a multiple of 20, and none is below 20
vals = [c["countValue"] for c in post("/v1/databrowser/searchConcepts",
        {"query": "deficiency", "maxResults": 300,
         "standardConceptFilter": "ALL_CONCEPTS"})["items"]]
print(f"counts checked            -> {len(vals)}")
print(f"all multiples of 20       -> {all(v % 20 == 0 for v in vals)}")
print(f"none below 20             -> {min(vals) >= 20}")
print(f"smallest count seen       -> {min(vals)}")

# 4. invariant: on a group concept, the rolled-up count exceeds the own-code count
CID, DOM = 4152280, "Condition"          # Major depressive disorder, a SNOMED parent
node = get("/v1/databrowser/getCriteriaRolledCounts", conceptId=CID, domain=DOM.upper())["parent"]
item = get("/v1/databrowser/concept-analysis-results",
           **{"concept-ids": CID, "domain-id": DOM})["items"][0]
own = item["countAnalysis"]["results"][0]["countValue"]
print(f"{node['name']} group      -> {node['group']}")
print(f"rolled-up count           -> {node['count']:,}")
print(f"own-code count            -> {own:,}")
print(f"rolled > own              -> {node['count'] > own}")

# 5. observed, dated: the release the Data Browser is serving (2026-08-27)
rel = get("/v1/databrowser/cdrversion-used")
print(f"CDR served                -> {rel['cdrVersionId']} {rel['name']}")
print(f"participants              -> {rel['numParticipants']:,}")
```

**Expect** — invariants first, and a failure in any of them means this skill is wrong rather
than that upstream moved:

```
camelCase survey param    -> HTTP 500
Measurement concepts 0,0  -> 0
Measurement concepts 1,1  -> 27,835
tests + orders == both    -> True
counts checked            -> 300
all multiples of 20       -> True
none below 20             -> True
smallest count seen       -> 20
Major depressive disorder group      -> True
rolled-up count           -> 111,380
own-code count            -> 2,720
rolled > own              -> True
CDR served                -> 10 v0-6-rc5 Release version of 2025q4r5_combined
participants              -> 747,040
```

Observed and dated to 2026-08-27, against CDR version id 10: `27,835`, `20`, `111,380`,
`2,720`, `747,040`, and the release name. Those move when All of Us publishes a new release —
a mismatch there is drift to re-verify, not a fault. The lines that must hold regardless of
release are the HTTP 500 on a camelCase parameter, the `0` when both filters are off, the
tests-plus-orders identity, every count being a multiple of 20 with none below it, and
rolled-up exceeding own-code on a group concept.

## Sources

- All of Us public Data Browser — <https://databrowser.researchallofus.org/>
- Public Data Browser API — <https://public.api.researchallofus.org/v1/cdrVersions>
- All of Us Research Hub — <https://www.researchallofus.org/>
- Register as a researcher — <https://www.researchallofus.org/register/>
- Data Access Tiers — <https://www.researchallofus.org/data-tools/data-access/>
- Data User Code of Conduct (RT_CT_DUCC_V6) — <https://support.researchallofus.org/hc/en-us/articles/22346176432532-Data-User-Code-of-Conduct>
- Data Access Framework — <https://support.researchallofus.org/hc/en-us/articles/22346942074132-Data-Access-Framework>
- Participant Privacy Protections — <https://support.researchallofus.org/hc/en-us/articles/4552681983764-Participant-Privacy-Protections>
- ECHO Program data availability and use — <https://support.researchallofus.org/hc/en-us/articles/52141157141396-Environmental-Influences-on-Child-Health-Outcomes-ECHO-Program-Data-Availability-and-Use>
- OHDSI OMOP Common Data Model — <https://ohdsi.github.io/CommonDataModel/>
