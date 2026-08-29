---
name: nsf-current-and-pending
description: Build the SciENcv Current and Pending (Other) Support upload file for one senior person on an NSF proposal — current NSF awards read out of NSF's own record as PI and as co-PI, written in SciENcv's XML element order, with person-month years placed and effort, overlap statements and every non-NSF source left genuinely blank and named in a separate summary.
category: grants
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [nsf, grants, compliance]
covers: [current and pending, current and pending other support, cpos, other support, sciencv, common form, person-months, effort, overlap statement, conflict of commitment, duplicate funding, foreign support, in-kind contributions, start-up package, consulting disclosure, research security, nspm-33, nsf award search, pappg, research.gov, grants.gov, senior key personnel, xml upload, co-pi, important notice 149]
papers: []
access: [open]
datasets: [https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/sample-blank.xml, https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/SampleXMLUpdated2026.xml, https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/sample_multiple_items.xml, https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/sample_inkind.xml, https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/sample_partial.xml, https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/sample_invalid.xml, https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/random-error.xml, https://api.nsf.gov/services/v1/awards.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: SciENcv CPOS XML templates fetched 2026-08-28 / PAPPG 24-1 II.D.2.h(ii) with supplements NSF 26-200 and NSF 26-202 / NSF Important Notice No. 149 / NSF Award Search API v1 / Python 3.12.8 / requests 2.34.2
  executed: 11
  unverified: 0
---
# NSF Current and Pending (Other) Support

Every senior/key person on an NSF proposal files one. It is the disclosure NSF uses to find
duplicate funding, undisclosed foreign support and conflicts of commitment, and PAPPG says
so directly: the information "is used to assess the capacity or any conflicts of commitment
that may impact the ability of the individual to carry out the research effort as proposed"
and "helps assess any potential scientific and budgetary overlap/duplication with the project
being proposed."

That makes an omission here different in kind from a formatting mistake. The certification
the senior person signs is quoted in full below, and it names the statutes.

**What this page produces is an upload file, not a submission.** Two things follow from that,
and both are load-bearing:

- **NSF will not accept a document that did not come out of SciENcv.** Its own FAQ: "Current
  and pending (other) support documents not prepared in SciENcv using the proper version will
  trigger a compliance error message that will prevent document upload in Research.gov and
  Grants.gov." So this file is an *input to SciENcv*. The senior person uploads it, completes
  what is blank on screen, certifies, and submits the PDF SciENcv generates.
- **NSF Award Search holds NSF awards and nothing else.** NIH, DOE, foundations, industry,
  institutional start-up, consulting, foreign support and in-kind contributions are all
  reportable and none of them is visible to any code on this page. A file assembled only from
  what a public API can see looks finished and is not, which is why the summary leads with
  what is missing rather than mentioning it at the end.

## What NSF requires, and when it was checked

Checked 2026-08-28. **PAPPG 24-1** (proposals submitted or due on or after 2024-05-20) is in
force, supplemented by **NSF 26-200** (2025-12-08) and **NSF 26-202** (2026-01-22). Current
and Pending (Other) Support sits at **PAPPG II.D.2.h(ii)**, and those instructions "serve as
NSF's implementation of the Current and Pending (Other) Support Common Form developed by the
National Science and Technology Council's Research Security Subcommittee."

**The transition date is 2025-12-02**, set by NSF **Important Notice No. 149**, with a grace
period that ended 2025-12-31: "NSF is providing a grace period for research proposals
submitted between Dec. 2, 2025, and Dec. 31, 2025. During this period, proposals may be
submitted using the old Biographical Sketch and Current and Pending (Other) Support forms.
After Dec. 31, 2025, all proposals must be fully compliant with NSF IN-149." A 2026-05-08
date circulates on university research-administration pages for the same document; that is
**NIH's** enforcement date, from NOT-OD-26-079, and it does not apply to NSF.

The PDF version NSF requires is **v.2024-1**.

## What has to be disclosed

PAPPG's definitions, which are broader than most people assume:

> **Current** – all active projects, or projects with ongoing obligations, from whatever
> source irrespective of whether such support is provided through the proposing organization
> or is provided directly to the individual.
>
> **Pending** – any proposal that is being considered for funding from a potential funding
> organization (including this proposal) irrespective of whether such support is provided
> through the proposing organization or is provided directly to the individual.

Read the qualifiers rather than the headline. *From whatever source* covers every funder on
earth. *Provided directly to the individual* covers money that never touches the university.
*Including this proposal* means the proposal being submitted is itself a pending entry, which
is the single most commonly omitted row in the document.

Four categories that are in scope and that people leave out:

- **Foreign support of every kind.** Contracts with foreign governments, instrumentalities or
  entities; foreign government-sponsored talent recruitment programs; support funded by such
  a program "even where the support is provided through an intermediary"; and "other foreign
  government-sponsored or affiliated activities."
- **Consulting**, in three specific situations: the activity requires the person to perform
  research; it does not involve research but relates to their research portfolio in a way
  that "may have the ability to impact funding, alter time or effort commitments, or
  otherwise impact scientific integrity"; or the consulting contract requires them "to
  conceal or withhold confidential financial or other ties."
- **In-kind contributions** — "real property; laboratory space; equipment; data or data sets;
  supplies; other expendable property; goods and services; employee or student resources" —
  at an estimated value of **$5,000 or more** *and* requiring a commitment of the person's
  time. Below $5,000, or with no time commitment, they "need not be reported."
- **Start-up packages and internal funds** allocated toward specific projects. PAPPG's source
  list names "internal funds allocated toward specific projects" alongside federal, state,
  tribal, foreign, foundation and commercial sources.

And one thing that must **not** go in: PAPPG (f) forbids personal information — home address,
personal telephone or email, driver's licence number, marital status. NSF publishes co-PI
email addresses on its own award records, so a script that copies an award record forward can
put one in the document without anyone noticing. The writer below does not.

## The certification

Quoted because its wording is the reason the blanks in this file stay blank:

> I certify that the information provided is current, accurate, and complete. This includes,
> but is not limited to, information related to current, pending, and other support (both
> foreign and domestic) as defined in 42 U.S.C. § 6605. I also certify that, at the time of
> submission, I am not a party in a malign foreign talent recruitment program.
> Misrepresentations and/or omissions may be subject to prosecution and liability pursuant
> to, but not limited to, 18 U.S.C. §§ 287, 1001, 1031 and 31 U.S.C. §§ 3729-3733 and 3802.

The certification is personal and it stays with the person. Nothing here signs anything.

## The two fields people get wrong

**Person-months.** Effort is reported as person-months, and only as person-months — not as
percent effort, not as calendar/academic/summer rows. PAPPG: "Enter the number of
person-months (even if unsalaried) for the current budget period and enter the proposed
person-months for each subsequent budget period. If the time commitment is not readily
ascertainable, a reasonable estimate should be provided." Four rules that decide whether the
entry is right:

1. **Convert from the appointment, not from the number.** Ten percent effort on a nine-month
   academic appointment is 0.9 person-months. One summer month at full effort is 1.0. Ten
   percent of a twelve-month calendar appointment is 1.2. The three are different numbers and
   the form takes their sum.
2. **Person-months run 0 to 12 with up to two decimal places** (NLM's SciENcv documentation).
3. **NSF does not accept a zero, and NIH now does.** NSF's FAQ, updated 2026-03-30: asked
   what to do when "0" will not go into the Person-Months Committed field, it answers
   "Individuals should only include projects to which they are committing time/person months.
   Please remove this entry." Its Current and Pending FAQ adds: "In instances when senior
   personnel are not actively working on a project during each year, only years in which they
   are committing time should be listed." NIH's Common Form began accepting zero effort on
   2026-04-22 (NOT-OD-26-079). Do not carry that habit across.
4. **A fiscal year is filed under its later calendar year.** NSF: "Proposers should enter the
   later of the two years in the 'Year' field" — a September 2023 to August 2024 fiscal year
   is entered as 2024.

**The statement of potential overlap.** Required on every entry, and required to say the word
"none" when there is none: "Enter a description of the potential overlap with any pending
proposal or active foreign or domestic project and this proposal in terms of scope, budget,
or person-months planned or devoted to the project by the individual. If there is no
potential overlap, enter 'none' in this field."

That is a judgement about the relationship between two funded projects, and it is an
assertion the senior person certifies. **Nothing here writes one.** What the code below does
instead is find the pairs that need one — shared programme, shared co-PIs, concurrent
periods, overlapping subject matter — and rank them, so the sentence gets written where it
matters rather than boilerplated across every row.

## What you need

Python 3.9+ and `requests`. **No API key and no account for either source.** Uploading and
certifying needs the senior person's own SciENcv login, which is free and which they must
use themselves.

| source | what it gives | licence |
|---|---|---|
| [SciENcv CPOS XML templates](https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/) | the element set and the element order, machine-readable | NLM/NCBI, US Government work |
| [NSF Award Search API](https://api.nsf.gov/services/v1/awards.json) | NSF awards, their periods, amounts and personnel | US Government work |

The templates are **not** vendored here. They move on NLM's schedule and a stale copy of a
compliance form is worse than none, so the code fetches them on every run.

```bash
python3 -m venv .venv
.venv/bin/pip install requests
```

Save each block below as the file named in its first line and run them in order. Set the
subject once:

```bash
export CPS_FAMILY="Martonosi" CPS_GIVEN="Margaret"
export CPS_ASOF="2026-08-28"       # omit to use today
export CPS_PROPOSAL_TITLE="Compiler support for erasure-qubit quantum architectures and dynamic circuits"
```

## Read the contract out of NLM's own files

Two files, because neither is sufficient alone. `sample-blank.xml` ships `<identification/>`
and `<employment/>` **empty**, so the populated sample is the only place their internal order
is written down — and order is the contract. SciENcv's first documented upload failure is
`Incorrect Element Order`, alongside `Missing Contribution Type`, `Unsupported Special
Characters` and `Invalid XML File`.

```python
# cps_spec.py -- read the upload contract out of NLM's own files, not out of a guide.
import json, requests, xml.etree.ElementTree as ET

BASE  = "https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/"
UA    = {"User-Agent": "nsf-current-and-pending/1.0 (https://heurekaskills.com)"}

def fetch(name, path):
    r = requests.get(BASE + name, headers=UA, timeout=60); r.raise_for_status()
    open(path, "wb").write(r.content)
    return ET.fromstring(r.content)

def order(elem, path=""):
    """Child order under every distinct element path."""
    here, out = f"{path}/{elem.tag}", {}
    if len(elem): out[here] = [c.tag for c in elem]
    for c in elem: out.update(order(c, here))
    return out

blank = fetch("sample-blank.xml", "sciencv_blank.xml")
full  = fetch("SampleXMLUpdated2026.xml", "sciencv_sample.xml")
spec = {"support_order": order(blank)["/profile/funding/support"],
        "profile_order": [c.tag for c in blank],
        "identification_order": [c.tag for c in full.find("identification")],
        "position_order": [c.tag for c in full.find("employment/position")],
        "organization_order": [c.tag for c in full.find("employment/position/organization")],
        "id_types": [e.get("idtype") for e in full.findall("identification/id")],
        "account_types": [e.get("accounttype") for e in full.findall("identification/account")],
        "contributiontypes": sorted({s.findtext("contributiontype") for s in full.iter("support")}),
        "supporttypes": sorted({s.findtext("supporttype") for s in full.iter("support")})}
json.dump(spec, open("cps_spec.json", "w"), indent=1)

print(f"blank root {blank.tag!r} -> {spec['profile_order']}")
print(f"support element order ({len(spec['support_order'])}):")
for i, t in enumerate(spec["support_order"], 1): print(f"  {i:>2}. {t}")
print(f"identification  {spec['identification_order']}  idtypes {spec['id_types']} "
      f"accounts {spec['account_types']}")
print(f"employment/position  {spec['position_order']}")
print(f"  organization       {spec['organization_order']}")
print(f"contributiontype {spec['contributiontypes']}   supporttype {spec['supporttypes']}")

# Two date shapes in one file, and a file that mixes them still parses.
print(f"\nsupport dates are flat ISO   startdate="
      f"{full.findtext('funding/support/startdate')!r}")
print(f"employment dates nest <year>  startdate/year="
      f"{full.findtext('employment/position/startdate/year')!r}")
inkind = [s for s in full.iter("support") if s.findtext("contributiontype") == "inkind"]
print(f"in-kind entries in the sample: {len(inkind)}; they omit <enddate> entirely: "
      f"{all(s.find('enddate') is None for s in inkind)}")
```

Observed 2026-08-28. A change here means NLM revised the template, which is drift to
investigate before anything else on this page is trusted:

```
blank root 'profile' -> ['identification', 'employment', 'funding']
support element order (13):
   1. projecttitle
   2. awardnumber
   3. supportsource
   4. location
   5. contributiontype
   6. awardamount
   7. inkinddescription
   8. overallobjectives
   9. potentialoverlap
  10. startdate
  11. enddate
  12. supporttype
  13. commitment
identification  ['id', 'id', 'account', 'name']  idtypes ['orcid', 'national_science_foundation'] accounts ['eRA-Commons']
employment/position  ['positiontitle', 'organization', 'startdate', 'enddate']
  organization       ['orgname', 'city', 'stateorprovince', 'country']
contributiontype ['award', 'inkind']   supporttype ['current', 'pending']

support dates are flat ISO   startdate='2025-12-01'
employment dates nest <year>  startdate/year='2015'
in-kind entries in the sample: 2; they omit <enddate> entirely: True
```

Four rules the files state that a schema-free implementation gets wrong:

- **`contributiontype` is the only element that must carry a value.** NLM: "A valid file for
  upload can have missing element values, except for the contributiontype element, which must
  have a value entered." That is what makes a deliberately partial file a legitimate
  deliverable rather than a failure — and it is what lets every judgement call stay blank.
- **`contributiontype` switches which siblings matter.** `award` fills the project fields;
  `inkind` leaves `projecttitle` and `awardnumber` empty, carries `inkinddescription`, and —
  in NLM's own samples — **omits `<enddate>` entirely** rather than emptying it. An in-kind
  contribution has a receipt date, not a period of performance.
- **Two date shapes in one file.** `<support>` uses flat `YYYY-MM-DD`; `<employment>` nests
  `<year>`. Mix them and the file still parses.
- **The `year` attribute places the entry; the value is optional.** NLM: "If the person-months
  field is left blank, effort will not be shown for that entry. However, the year must still
  be entered. This ensures the system places the project in the correct time period, even if
  the effort isn't provided yet." That sentence is the reason this skill can produce something
  useful without inventing effort.

## The NSF half, from NSF's own award record

Four things about NSF Award Search are not what they look like, and each one was confirmed
against the live service rather than the documentation.

- **`offset` is 0-based**, although NSF documents its default as `1`. A loop starting at
  `offset=1` silently drops the first award, and the first award is the newest one.
- **`pdPIName` matches the PI role only.** On a twelve-award probe, **zero** awards where the
  person was a published co-PI came back from `pdPIName`. Co-PI awards need the separate
  `coPDPI` parameter, which matches as a substring and so also returns strangers. On the
  worked example below, **two of three current awards are co-PI awards** that a `pdPIName`
  query never sees.
- **`piId` is not a person.** It looks like NSF's identifier for the PI and it is not: one
  value, `000236249`, sits on awards whose named PIs are three different Princeton
  investigators. What *is* reliable is the **`pi` array**, which lists every person who has
  held the PI role on that award — current and former — each with the address NSF published
  for them. That array is present on every award record checked and is the identity key used
  below.
- **`activeAwd` is `expDate >= today` and nothing more.** Across 2,699 sampled awards its
  true/false split matched that computation exactly: the latest end date on an inactive award
  was 2026-07-31 and the earliest on an active one 2026-08-31, three days after the sample was
  taken. So it says nothing about whether the project has *started* — in a 969-award subset,
  452 had a future start date and every one was flagged active — and nothing about obligations
  that outlive the end date. Currency is computed here instead, and the flag is checked against
  the computation, so a change in NSF's behaviour surfaces as a disagreement rather than as
  silence.

One more, about money. **`estimatedTotalAmt` and `fundsObligatedAmt` disagree often and in
both directions.** PAPPG wants "the total award amount for the entire period of performance,
inclusive of indirect costs." On a continuing grant the obligated figure covers only the
years funded so far and is an under-statement; on some older records the estimate is `0` while
half a million sits in obligations. The larger of the two is used and every disagreement is
named in the summary.

```python
# cps_awards.py -- the NSF half of the disclosure, from NSF's own award record.
import json, os, re, sys, time, collections, datetime as dt, requests

FAMILY = os.environ.get("CPS_FAMILY", "Martonosi")
GIVEN  = os.environ.get("CPS_GIVEN",  "Margaret")
PICK   = {e.strip().lower() for e in os.environ.get("CPS_PIEMAIL", "").split(",") if e.strip()}
ASOF   = dt.date.fromisoformat(os.environ.get("CPS_ASOF", dt.date.today().isoformat()))
API    = "https://api.nsf.gov/services/v1/awards.json"
S = requests.Session(); S.headers["User-Agent"] = "nsf-current-and-pending/1.0 (https://heurekaskills.com)"

def page(param, value):
    """offset is 0-BASED, although NSF documents its default as 1. Starting at 1 silently
    drops the first award, and a dropped award is an undisclosed one."""
    out, offset = [], 0
    while True:
        for attempt in range(4):
            try:
                got = S.get(API, params={param: value, "rpp": 25, "offset": offset}, timeout=60) \
                       .json().get("response", {}).get("award", []); break
            except Exception:
                if attempt == 3: sys.exit(f"NSF Award Search did not respond for {param}={value!r}")
                time.sleep(2 * (attempt + 1))
        out += got
        if len(got) < 25: return out
        offset += 25

def mdy(s):
    try: return dt.datetime.strptime(s, "%m/%d/%Y").date()
    except (TypeError, ValueError): return None

def fold(s): return re.sub(r"[^a-z]", "", (s or "").lower())

# Two queries, because one is not enough. `pdPIName` matches the PI role and finds nothing
# where the person is a co-PI -- zero of twelve on a probe. `coPDPI` matches the co-PI list
# as a substring, so it also returns other people's awards and has to be filtered back down.
pi_q = page("pdPIName", f"{GIVEN} {FAMILY}")
co_q = page("coPDPI",   f"{GIVEN} {FAMILY}")
awards = list({a["id"]: a for a in pi_q + co_q}.values())

if not awards:
    others = page("pdPIName", FAMILY)
    print(f"No NSF award names {GIVEN} {FAMILY}.")
    if others:
        forms = sorted({f"{a.get('piFirstName')} {a.get('piLastName')}" for a in others})
        print(f"NSF does hold {len(others)} award(s) under the surname {FAMILY!r}, filed as "
              f"{', '.join(forms[:12])}. NSF matches the name it has on record and not a "
              f"normalised form, so re-run with that form if one of them is you.")
    else:
        print(f"NSF holds nothing under the surname {FAMILY!r} either. That is not the same as "
              f"having no support -- it means this source has nothing to contribute, and the "
              f"whole document has to come from cps_manual.json.")
    sys.exit(2)

# Every award carries a `pi` array listing each person who has held the PI role, current and
# former, with the address NSF published for them. That array -- not piFirstName, and
# emphatically not piId -- is what says whether this person is on this award and in what role.
def roles(a):
    out = []
    for entry in (a.get("pi") or []):
        if fold(FAMILY) in fold(entry): out.append(("PI", entry))
    for entry in (a.get("coPDPI") or []):
        if fold(FAMILY) in fold(entry): out.append(("co-PI", entry))
    return out

def email(entry): return next((t.lower() for t in entry.split() if "@" in t), "")

seen = collections.defaultdict(list)
for a in awards:
    for role, entry in roles(a):
        seen[email(entry) or "(no address published)"].append((a, role, entry))

known = {e: v for e, v in seen.items() if "@" in e}
if PICK:
    unknown = PICK - set(known)
    if unknown: sys.exit(f"CPS_PIEMAIL {sorted(unknown)} matches none of {sorted(known)}")
    known = {e: v for e, v in known.items() if e in PICK}
elif len(known) > 1:
    print(f"{len(awards)} awards carry the surname {FAMILY!r}, and NSF published "
          f"{len(known)} different addresses for them:\n")
    for e, v in sorted(known.items(), key=lambda kv: -len(kv[1])):
        orgs = sorted({a.get("awardeeName") or "?" for a, _, _ in v})
        yrs  = sorted((mdy(a.get("startDate")) or dt.date(1, 1, 1)).year for a, _, _ in v)
        print(f"  CPS_PIEMAIL={e:<32} {len(v):>3} award(s)  {yrs[0]}-{yrs[-1]}  "
              f"{'; '.join(orgs)[:70]}")
    sys.exit("\nSet CPS_PIEMAIL to the one that is you -- comma-separated if you have moved and "
             "hold awards under more than one -- and run again. Guessing here would put somebody "
             "else's funding into a document you certify under 18 U.S.C. 1001.")

mine  = {a["id"]: (a, role, entry) for v in known.values() for a, role, entry in v}
noadd = [a["id"] for a, _, _ in seen.get("(no address published)", []) if a["id"] not in mine]
if len(known) == 1:                    # one identity, so an unaddressed entry is also theirs
    for a, role, entry in seen.get("(no address published)", []):
        mine.setdefault(a["id"], (a, role, entry))
    noadd = []

BOILER = re.compile(r"This award reflects NSF'?s statutory mission", re.I)
def objectives(a, limit=1500):
    """Extractive, from NSF's published abstract for the person's own award. Nothing is
    invented: NSF's standard closing paragraph is dropped and the text is cut at a sentence
    boundary inside PAPPG's 1,500-character limit."""
    paras = [re.sub(r"\s+", " ", p).strip()
             for p in re.split(r"[\r\n]{2,}", re.sub(r"<[^>]+>", " ", a.get("abstractText") or ""))]
    paras = [p for p in paras if p and not BOILER.search(p)]
    if not paras: return ""
    out = paras[0]
    for p in paras[1:]:
        if len(out) >= 400: break
        out = f"{out} {p}"
    if len(out) <= limit: return out
    stop = max(out[:limit].rfind(". "), out[:limit].rfind("? "), out[:limit].rfind("! "))
    return (out[:stop + 1] if stop > limit * 0.5 else out[:limit]).strip()

def place(a):
    parts = [(a.get("perfCity") or "").title(), a.get("perfStateCode") or "",
             "United States" if a.get("perfCountryCode") == "US" else a.get("perfCountryCode") or ""]
    return ", ".join(p.strip() for p in parts if p.strip())

def amount(a):
    """PAPPG wants the total for the entire period of performance, inclusive of indirect costs.
    NSF publishes an estimate and an obligated figure and either can be the larger: one award
    carries an estimate of 0 against half a million obligated, and on a continuing grant the
    obligated figure covers only the years funded so far."""
    est = int(re.sub(r"\D", "", a.get("estimatedTotalAmt") or "0") or 0)
    obl = int(re.sub(r"\D", "", a.get("fundsObligatedAmt") or "0") or 0)
    return max(est, obl), est, obl

rows, former, handed, discrepancies, disagrees = [], [], [], [], []
for aid, (a, role, entry) in sorted(mine.items()):
    start, end = mdy(a.get("startDate")), mdy(a.get("expDate"))
    # "Current" is computed here, not read off activeAwd. That flag turns out to be exactly
    # `expDate >= today`: it ignores whether the project has started, and knows nothing about
    # obligations that outlive the end date.
    current = bool(end) and end >= ASOF
    if (a.get("activeAwd") == "true") != current: disagrees.append(aid)
    amt, est, obl = amount(a)
    if est != obl: discrepancies.append((aid, est, obl))
    if "(Former)" in entry:
        # NSF marks a role the person has handed over. A former PI has no ongoing commitment,
        # so the award is not their current support -- but the marker can lag, so a handed-over
        # role on an award that is still running is named in the summary rather than dropped.
        handed.append(aid)
        if current: former.append((aid, role, a.get("title") or ""))
        continue
    # PAPPG asks for "the current budget period" and "each subsequent budget period", so years
    # already past are not requested; an award that has not started begins at its own start.
    y0 = max(start.year if start else ASOF.year, ASOF.year)
    rows.append({
        "id": aid, "role": role,
        "projecttitle": re.sub(r"\s+", " ", a.get("title") or "").strip(),
        "awardnumber": aid, "supportsource": "National Science Foundation",
        "location": place(a), "contributiontype": "award", "awardamount": str(amt),
        "overallobjectives": objectives(a),
        "startdate": start.isoformat() if start else "", "enddate": end.isoformat() if end else "",
        "supporttype": "current" if current else "", "current": current,
        "years": list(range(y0, (end.year if end else y0) + 1)) if current else [],
        "estimated": est, "obligated": obl, "awardee": a.get("awardeeName") or "",
        "program": a.get("fundProgramName") or "", "directorate": a.get("dirAbbr") or "",
        "copis": list(a.get("coPDPI") or [])})

cur     = [r for r in rows if r["current"]]
as_copi = [r for r in cur if r["role"] == "co-PI"]
json.dump({"family": FAMILY, "given": GIVEN, "address": sorted(known), "asof": ASOF.isoformat(),
           "rows": rows, "former_current": former, "handed_over": handed,
           "unresolved": noadd,
           "found_by_copdpi_only": sorted({a["id"] for a in co_q} - {a["id"] for a in pi_q}),
           "amount_discrepancies": discrepancies, "activeaward_disagrees": disagrees},
          open("cps_awards.json", "w"), ensure_ascii=False)

print(f"subject                     {FAMILY}, {GIVEN}   "
      f"{', '.join(sorted(known)) or '(no address published)'}")
print(f"awards from pdPIName        {len(pi_q)}")
print(f"awards from coPDPI          {len(co_q)}   "
      f"({len({a['id'] for a in co_q} - {a['id'] for a in pi_q})} of them under no other query)")
print(f"awards that are this person {len(mine)}   ({len(rows)} live roles, "
      f"{len(handed)} handed over of which {len(former)} still running)")
print(f"CURRENT support (end date on or after {ASOF})  {len(cur)}   ({len(as_copi)} as co-PI)")
for r in cur:
    print(f"   {r['id']}  {r['startdate']} -> {r['enddate']}  ${int(r['awardamount']):>10,}  "
          f"{r['role']:<5} {r['projecttitle'][:50]}")
if not cur:
    print("   none. This person holds no current NSF award, so the NSF half of this disclosure")
    print("   is genuinely empty and every entry has to come from cps_manual.json.")
if former:
    print(f"excluded, role marked (Former) on a current award  {len(former)}  "
          f"{[f for f, _, _ in former]}")
if noadd:
    print(f"could not be attributed -- NSF published no address on the entry  {len(noadd)}  {noadd}")
print(f"activeAwd disagreed with the computed end date on  {len(disagrees)} award(s)")
print(f"awards where estimatedTotalAmt != fundsObligatedAmt  {len(discrepancies)}")
for i, e, o in discrepancies[:5]:
    print(f"   {i}  estimated ${e:,}  obligated ${o:,}  -> using ${max(e,o):,}")
```

Two behaviours worth understanding before running it on somebody's name.

**It refuses on a shared name rather than guessing.** When NSF published more than one address
for people with that surname, the script prints each identity with its organisations and date
range and stops. On *Wei Wang* that is seventeen different addresses across seventy awards, at
eleven institutions. A Current and Pending assembled from several of them would be a false
statement, so the refusal is the correct output; `CPS_PIEMAIL` selects one, and accepts a
comma-separated list for someone who has moved.

**A `(Former)` role is excluded, and said out loud.** NSF marks people who have handed a role
over — `Margaret Martonosi (Former) martonosi@princeton.edu`. A former PI has no ongoing
commitment, so the award is not their current support. The marker can lag reality, so every
excluded current award is listed in the summary for confirmation.

## Person-months

Effort is not public information. This block exists to convert the numbers a senior person
already has — percent effort against an appointment — into the person-months the form wants,
and to apply NSF's rules about years. Without `cps_effort.json` it places the years and leaves
every value empty, which is the documented way to reserve the right time period.

```json
{"2620655": {"2026": {"academic_pct": 8, "summer_months": 0.5, "summer_pct": 100},
             "2027": {"person_months": 1.2},
             "2028": {"academic_pct": 0}},
 "2547175": {"2026": {"summer_person_months": 1}}}
```

```python
# cps_effort.py -- person-months per year, the field NSF rejects most often.
import json, os

A = json.load(open("cps_awards.json"))
SPEC = json.load(open("cps_effort.json")) if os.path.exists("cps_effort.json") else {}
DEFAULT_ACADEMIC, DEFAULT_SUMMER = 9.0, 3.0     # a standard US academic appointment

def person_months(e):
    """NSF budgets effort in three appointment categories and the form wants their sum, in
    person-months. Percent effort is the usual input and the usual mistake: 10% of a 9-month
    academic year is 0.9 person-months, not 1.2 and not 10."""
    if "person_months" in e: return round(float(e["person_months"]), 2)
    am = float(e.get("academic_months", DEFAULT_ACADEMIC))
    sm = float(e.get("summer_months",  DEFAULT_SUMMER))
    return round(am * float(e.get("academic_pct", 0)) / 100.0
                 + sm * float(e.get("summer_pct", 0)) / 100.0
                 + 12.0 * float(e.get("calendar_pct", 0)) / 100.0
                 + float(e.get("academic_person_months", 0))
                 + float(e.get("summer_person_months", 0))
                 + float(e.get("calendar_person_months", 0)), 2)

commit, dropped, blank = {}, [], []
for r in A["rows"]:
    if not r["current"]: continue
    per_year, out = SPEC.get(r["id"], {}), []
    for y in r["years"]:
        e = per_year.get(str(y))
        if e is None:
            out.append((y, ""))          # year placed, effort left for the senior person
            blank.append((r["id"], y)); continue
        pm = person_months(e)
        if pm <= 0:
            # NSF: "Individuals should only include projects to which they are committing
            # time/person months." A zero is not an entry NSF accepts -- the year comes out.
            dropped.append((r["id"], y)); continue
        out.append((y, f"{min(pm, 12.0):g}"))   # a year holds twelve person-months and no more
    commit[r["id"]] = out

json.dump({"commitment": commit, "dropped_zero": dropped, "blank": blank},
          open("cps_commitments.json", "w"))
print(f"current awards with a commitment block   {len(commit)}")
for aid, ys in commit.items():
    print(f"   {aid}  " + "  ".join(f"{y}={v or '(blank)'}" for y, v in ys))
print(f"year rows left blank for you to complete {len(blank)}")
print(f"year rows dropped because effort was 0   {len(dropped)}  {dropped if dropped else ''}")
```

## Everything NSF cannot see

This file is the other half of the document, and for most senior people it is the larger half.
`cps_manual.json` is merged by the writer; omit a key and nothing is written for it. Support
entries take the XML element names directly, plus a `commitment` map of year to person-months.

```json
{
  "identification": {"orcid": "0000-0002-1825-0097", "nsf_id": "", "era_commons": "",
                     "firstname": "", "middlename": "", "lastname": ""},
  "employment": {"positiontitle": "Professor of Chemistry", "orgname": "State University",
                 "city": "Columbus", "stateorprovince": "Ohio", "country": "United States",
                 "startyear": "2014", "endyear": ""},
  "support": [
    {"projecttitle": "Mechanisms of ribosome quality control in neurons",
     "awardnumber": "R01GM000000", "supportsource": "National Institutes of Health",
     "location": "Columbus, OH, United States", "contributiontype": "award",
     "awardamount": "1875000",
     "overallobjectives": "Determine how ribosome collision sensing is coupled to local translation in dendrites, and test whether that coupling is lost in models of neurodegeneration.",
     "potentialoverlap": "", "startdate": "2024-09-01", "enddate": "2029-08-31",
     "supporttype": "current",
     "commitment": {"2026": "1.8", "2027": "1.8", "2028": "1.8", "2029": "1.2"}},
    {"projecttitle": "Single-molecule imaging of stalled ribosomes",
     "awardnumber": "", "supportsource": "Wellcome Trust",
     "location": "Cambridge, N/A, United Kingdom", "contributiontype": "award",
     "awardamount": "640000",
     "overallobjectives": "Build a single-molecule assay for collided ribosomes and apply it to human neuronal cultures.",
     "potentialoverlap": "", "startdate": "2027-01-01", "enddate": "2029-12-31",
     "supporttype": "pending", "commitment": {"2027": "0.5", "2028": "0.5", "2029": "0.5"}},
    {"projecttitle": "", "awardnumber": "", "supportsource": "State University",
     "location": "", "contributiontype": "inkind", "awardamount": "45000",
     "inkinddescription": "Dedicated allocation on the institutional GPU cluster",
     "overallobjectives": "Computing capacity for molecular dynamics of ribosome collision states.",
     "potentialoverlap": "", "startdate": "2026-01-01", "supporttype": "current",
     "commitment": {"2026": "0.25", "2027": "0.25"}}
  ]
}
```

Three things about that example are the rules rather than the decoration. A **foreign** source
is written exactly like a domestic one — the form has no separate section for it, and PAPPG's
`Location` instruction says to enter "N/A" where a state or province does not apply. An
**in-kind** entry leaves `projecttitle` and `awardnumber` empty, carries `inkinddescription`,
and has no `enddate`. And **the proposal being submitted belongs here**, as a `pending` entry,
because PAPPG's definition of pending includes "this proposal."

## Which pairs need an overlap statement

```python
# cps_overlap.py -- find the pairs that need an overlap statement. It never writes one.
import json, os, re, itertools

A = json.load(open("cps_awards.json"))
PROPOSAL  = os.environ.get("CPS_PROPOSAL_TITLE", "")
PROP_TEXT = open("cps_proposal.txt").read() if os.path.exists("cps_proposal.txt") else ""

STOP = set("""a an the and or of for to in on with from by is are be as at that this those these
into over under between within using use used toward towards new novel we our their its it will
can may project research study studies work approach approaches method methods based both also
such which what how than then them they he she who whom been being have has had do does did not
no nor but if while when where why all any each other more most some many much very well award
reflects nsf statutory mission deemed worthy support evaluation foundation intellectual merit
broader impacts review criteria program students student university science data results""".split())

def terms(s):
    return {w for w in re.findall(r"[a-z][a-z-]{3,}", (s or "").lower()) if w not in STOP}

def containment(a, b):
    """Not Jaccard. The comparison that matters most is a one-line proposal title against a
    900-word award abstract, and Jaccard scores that pair near zero purely because the sets
    are different sizes -- it scored 0.03 on a genuine match. Containment asks how much of
    the smaller description the larger one already covers, which is the actual question."""
    return len(a & b) / min(len(a), len(b)) if a and b else 0.0

def copis(r):
    """NSF publishes each co-PI as "Given Middle Family address". The address is the reliable
    key; the name is what belongs in a note a person reads."""
    out = {}
    for c in r.get("copis") or []:
        toks = [t for t in c.split() if t]
        out[next((t.lower() for t in toks if "@" in t), c.lower())] = \
            " ".join(t for t in toks if "@" not in t)
    return out

disclosed = [r for r in A["rows"] if r["current"]]
if PROPOSAL or PROP_TEXT:
    disclosed.append({"id": "THIS-PROPOSAL", "projecttitle": PROPOSAL, "overallobjectives": PROP_TEXT,
                      "program": "", "directorate": "", "copis": [], "startdate": "", "enddate": ""})

pairs = []
for x, y in itertools.combinations(disclosed, 2):
    tx = terms(f"{x['projecttitle']} {x['overallobjectives']}")
    ty = terms(f"{y['projecttitle']} {y['overallobjectives']}")
    sim, ev, score = containment(tx, ty), [], 0.0
    if min(len(tx), len(ty)) >= 4 and sim >= 0.30:
        ev.append(f"{sim:.0%} of the shorter description's substantive terms appear in the "
                  f"other — {', '.join(sorted(tx & ty)[:8])}"); score += sim * 3
    cx, cy = copis(x), copis(y)
    if set(cx) & set(cy):
        ev.append(f"{len(set(cx) & set(cy))} co-PI(s) in common — "
                  f"{', '.join(sorted(cx[k] for k in set(cx) & set(cy)))}")
        score += 0.5 * len(set(cx) & set(cy))
    px = {p.strip() for p in (x["program"] or "").split(",") if p.strip()}
    py = {p.strip() for p in (y["program"] or "").split(",") if p.strip()}
    if px & py:
        ev.append(f"same NSF funding program — {'; '.join(sorted(px & py))}"); score += 0.4
    if x["directorate"] and x["directorate"] == y["directorate"]:
        ev.append(f"same NSF directorate ({x['directorate']})"); score += 0.1
    if x["startdate"] and y["startdate"] and \
       x["startdate"] <= (y["enddate"] or "9999") and y["startdate"] <= (x["enddate"] or "9999"):
        ev.append("the periods of performance run concurrently"); score += 0.2
    if ev:
        pairs.append({"a": x["id"], "a_title": x["projecttitle"][:70], "b": y["id"],
                      "b_title": y["projecttitle"][:70], "score": round(score, 3),
                      "similarity": round(sim, 3), "evidence": ev})
pairs.sort(key=lambda p: -p["score"])
json.dump({"pairs": pairs, "n_disclosed": len(disclosed), "proposal": PROPOSAL},
          open("cps_overlap.json", "w"), ensure_ascii=False)

print(f"entries compared        {len(disclosed)}"
      + ("  (including the proposal being prepared)" if PROPOSAL or PROP_TEXT else ""))
print(f"pairs with any evidence {len(pairs)} of {len(disclosed)*(len(disclosed)-1)//2}")
for p in pairs:
    print(f"\n  {p['a']}  x  {p['b']}   score {p['score']}")
    print(f"    {p['a_title']}")
    print(f"    {p['b_title']}")
    for e in p["evidence"]: print(f"      - {e}")
print("\nEvidence of overlap is not an overlap statement, and its absence is not \"none\".")
print("NSF wants a sentence per entry, and only the senior person can write it.")
```

The measure matters more than it looks. NSF's own award abstracts run to several hundred
words and a proposal title runs to ten, so Jaccard similarity scores a real match at 0.03
purely on set sizes — it missed the proposal-to-award comparison entirely, which is the one
NSF actually asks about. Containment over the smaller set finds it at 0.50 while leaving an
unrelated pair at 0.15.

## Write the file

```python
# cps_write.py -- write the SciENcv Current & Pending (Other) Support upload file.
import json, os, re, unicodedata
import xml.etree.ElementTree as ET

SPEC = json.load(open("cps_spec.json"))
A    = json.load(open("cps_awards.json"))
C    = json.load(open("cps_commitments.json"))
M    = json.load(open("cps_manual.json")) if os.path.exists("cps_manual.json") else {}

# SciENcv rejects a file for "Unsupported Special Characters". Fold the typography a word
# processor inserts down to ASCII, drop the invisible spaces PDFs and publishers leave
# behind, and drop anything XML 1.0 does not permit in character data.
FOLD = {0x2018: "'", 0x2019: "'", 0x201A: "'", 0x2032: "'",
        0x201C: '"', 0x201D: '"', 0x201E: '"', 0x2033: '"',
        0x2013: "-", 0x2014: "--", 0x2212: "-", 0x2026: "...",
        0x00A0: " ", 0x2009: " ", 0x202F: " ", 0x200B: "", 0xFEFF: ""}

def legal(o):
    """XML 1.0 section 2.2: tab, newline, carriage return, and the printable planes."""
    return (o in (0x09, 0x0A, 0x0D) or 0x20 <= o <= 0xD7FF
            or 0xE000 <= o <= 0xFFFD or 0x10000 <= o <= 0x10FFFF)

def clean(v):
    s = unicodedata.normalize("NFC", str(v or "")).translate(FOLD)
    return re.sub(r"\s+", " ", "".join(c for c in s if legal(ord(c)))).strip()

def sub(parent, tag, text=""):
    e = ET.SubElement(parent, tag)
    if clean(text): e.text = clean(text)
    return e

def support_block(funding, row, commitment):
    """Element ORDER is the contract -- SciENcv's first upload error is 'Incorrect Element
    Order'. Iterate the order read out of NLM's blank file rather than writing tags by hand."""
    s = ET.SubElement(funding, "support")
    inkind = row.get("contributiontype") == "inkind"
    for tag in SPEC["support_order"]:
        if tag == "commitment":
            c = ET.SubElement(s, "commitment")
            for year, months in commitment:
                pm = ET.SubElement(c, "personmonth"); pm.set("year", str(year))
                if str(months): pm.text = str(months)
            continue
        if tag == "enddate" and inkind:
            continue          # NLM's own in-kind samples omit <enddate>: an in-kind receipt
        if tag == "awardamount":                       # has a date, not a period of performance
            sub(s, tag, re.sub(r"\D", "", str(row.get("awardamount") or "")))
            continue          # bare integer -- no currency symbol, no separators
        sub(s, tag, row.get(tag, ""))
    return s

root  = ET.Element("profile")
ident = ET.SubElement(root, "identification")
I = M.get("identification", {})
for idtype, key in (("orcid", "orcid"), ("national_science_foundation", "nsf_id")):
    e = ET.SubElement(ident, "id"); e.set("idtype", idtype)
    if clean(I.get(key)): e.text = clean(I.get(key))
acct = ET.SubElement(ident, "account"); acct.set("accounttype", "eRA-Commons")
if clean(I.get("era_commons")): acct.text = clean(I.get("era_commons"))
nm = ET.SubElement(ident, "name")
sub(nm, "firstname",  I.get("firstname",  A["given"]))
sub(nm, "middlename", I.get("middlename", ""))
sub(nm, "lastname",   I.get("lastname",   A["family"]))

emp = ET.SubElement(root, "employment")
E   = M.get("employment", {})
pos = ET.SubElement(emp, "position")
sub(pos, "positiontitle", E.get("positiontitle", ""))
org = ET.SubElement(pos, "organization")
for tag in ("orgname", "city", "stateorprovince", "country"):
    sub(org, tag, E.get(tag, ""))
# Employment dates nest a <year>; support dates are flat ISO. Two shapes in one file, and a
# file that mixes them still parses -- which is why it has to be got right here.
for tag, key in (("startdate", "startyear"), ("enddate", "endyear")):
    sub(ET.SubElement(pos, tag), "year", E.get(key, ""))

funding = ET.SubElement(root, "funding")
written, nsf_ids = [], set()
for r in A["rows"]:
    if not r["current"]: continue
    support_block(funding, r, C["commitment"].get(r["id"], []))
    written.append((r["id"], r["supporttype"], r["role"])); nsf_ids.add(r["id"])
for r in M.get("support", []):
    support_block(funding, r, sorted((y, v) for y, v in (r.get("commitment") or {}).items()))
    written.append((r.get("awardnumber") or r.get("supportsource", "?"),
                    r.get("supporttype", ""), "manual"))

ET.indent(root, space="    ")
ET.ElementTree(root).write("current-and-pending.xml", encoding="UTF-8", xml_declaration=True)

kinds = [s.findtext("contributiontype") for s in root.iter("support")]
print(f"current-and-pending.xml written   {len(written)} <support> entries "
      f"({kinds.count('award')} award, {kinds.count('inkind')} in-kind)")
for aid, st, role in written:
    print(f"   {aid:<30} supporttype={st or '(blank)':<8} {role}")
print(f"from NSF Award Search  {len(nsf_ids)}")
print(f"from cps_manual.json   {len(written) - len(nsf_ids)}"
      + ("   <-- every non-NSF source must come from here"
         if len(written) == len(nsf_ids) else ""))
```

## Check it before uploading

Run this every time. It enforces the four things SciENcv rejects a file for, and the things
PAPPG says about what may and may not be in it.

```python
# cps_check.py -- prove the file will upload, and that what it says is disclosable.
import json, re, sys
import xml.etree.ElementTree as ET

SPEC  = json.load(open("cps_spec.json"))
ORDER = SPEC["support_order"]
raw   = open("current-and-pending.xml", encoding="utf-8").read()

def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    return ok

def warn(label, ok, detail=""):
    """PAPPG says some things "need not be reported". Over-disclosing is permitted and is the
    safe direction, so these are reported and deliberately do not fail the file."""
    print(f"{'PASS' if ok else 'WARN'}  {label}{'  ' + detail if detail else ''}")

try:
    root = ET.fromstring(raw)
except ET.ParseError as e:
    sys.exit(f"FAIL  the file is not well-formed XML: {e}")

def subsequence(kids, order):
    """SciENcv's first upload error is 'Incorrect Element Order'. Omitting an element is
    allowed -- NLM's own in-kind samples omit <enddate> -- so what has to hold is that the
    elements present appear in the template's relative order."""
    i = 0
    for k in kids:
        while i < len(order) and order[i] != k: i += 1
        if i == len(order): return False
        i += 1
    return True

PLACEHOLDER = re.compile(r"\bTBD\b|\bTODO\b|\bFIXME\b|\[\s*(fill|insert|enter|your)\b"
                         r"|Sample Laboratories|NCBI User|Sample Support|Sampledata"
                         r"|Test Objectives|Testoverlap|My University|The State University", re.I)
EMAIL   = re.compile(r"[\w.+-]+@[\w-]+\.[\w-]+\.?\w*")
BADCHAR = [c for c in raw if not (c in "\t\n\r" or 0x20 <= ord(c) <= 0xD7FF
                                  or 0xE000 <= ord(c) <= 0xFFFD or ord(c) >= 0x10000)]

good = check("well-formed XML", True, f"root <{root.tag}>")
good &= check("root is one SciENcv accepts", root.tag in ("profile", "funding"))
if root.tag == "profile":
    good &= check("top-level element order matches the blank template",
                  [c.tag for c in root] == SPEC["profile_order"], str([c.tag for c in root]))
sups = list(root.iter("support"))
good &= check("at least one <support> entry", bool(sups),
              f"{len(sups)} entries" if sups else
              "an empty document is not submittable -- and if you have no NSF award at all, "
              "every entry still has to come from cps_manual.json")
good &= check("no character XML 1.0 forbids", not BADCHAR,
              f"{len(BADCHAR)} bad character(s)" if BADCHAR else "")
good &= check("no placeholder text anywhere in the file", not PLACEHOLDER.search(raw))
# PAPPG II.D.2.h(ii)(f): no personal information in this document. Scoped to <funding>,
# because an NSF account identifier legitimately looks like an address -- NLM's own sample
# carries <id idtype="national_science_foundation">123456@nsf.gov</id>.
fundtext = ET.tostring(root.find("funding") if root.find("funding") is not None else root,
                       encoding="unicode")
good &= check("no email address among the funding entries", not EMAIL.search(fundtext))

for n, s in enumerate(sups, 1):
    kids = [c.tag for c in s]
    good &= check(f"entry {n}: element order", subsequence(kids, ORDER), ",".join(kids))
    ctype = (s.findtext("contributiontype") or "").strip()
    good &= check(f"entry {n}: contributiontype carries a value", ctype in ("award", "inkind"),
                  repr(ctype))
    stype = (s.findtext("supporttype") or "").strip()
    good &= check(f"entry {n}: supporttype", stype in ("current", "pending", ""), repr(stype))
    amt = (s.findtext("awardamount") or "").strip()
    good &= check(f"entry {n}: awardamount is a bare integer", bool(re.fullmatch(r"\d*", amt)),
                  repr(amt))
    for tag in ("startdate", "enddate"):
        v = (s.findtext(tag) or "").strip()
        good &= check(f"entry {n}: {tag} is ISO or empty",
                      bool(re.fullmatch(r"(\d{4}-\d{2}-\d{2})?", v)), repr(v))
    obj = s.findtext("overallobjectives") or ""
    good &= check(f"entry {n}: overallobjectives within PAPPG's 1500 characters",
                  len(obj) <= 1500, f"{len(obj)} chars")
    months = s.findall("commitment/personmonth")
    good &= check(f"entry {n}: every personmonth carries a four-digit year",
                  all(re.fullmatch(r"\d{4}", m.get("year") or "") for m in months),
                  f"{len(months)} year row(s)")
    vals = [(m.get("year"), (m.text or "").strip()) for m in months if (m.text or "").strip()]
    # NSF: "Individuals should only include projects to which they are committing time/person
    # months." A zero is not an entry NSF accepts -- the entry comes out instead.
    good &= check(f"entry {n}: person-months are 0 < n <= 12 with at most two decimals",
                  all(re.fullmatch(r"\d{1,2}(\.\d{1,2})?", v) and 0 < float(v) <= 12
                      for _, v in vals),
                  ", ".join(f"{y}={v}" for y, v in vals) or "all blank")
    if ctype == "inkind":
        # PAPPG: an in-kind contribution below $5000, or with no time commitment, "need not be
        # reported". Reporting one anyway is permitted, so neither of these fails the file.
        warn(f"entry {n}: in-kind is $5000 or more", int(amt or 0) >= 5000, f"${amt or 0}")
        warn(f"entry {n}: in-kind carries a time commitment", bool(months))
        good &= check(f"entry {n}: in-kind carries a summary of the contribution",
                      bool((s.findtext("inkinddescription") or "").strip()))

# PAPPG defines pending as "any proposal that is being considered for funding ... (including
# this proposal)", so a document with nothing pending is missing at least the proposal it
# accompanies. Not always wrong -- an award-stage update may have nothing pending -- so a WARN.
warn("at least one pending entry (PAPPG counts this proposal as pending)",
     any((s.findtext("supporttype") or "") == "pending" for s in sups))

no_overlap = sum(1 for s in sups if not (s.findtext("potentialoverlap") or "").strip())
no_effort  = sum(1 for s in sups if not any((m.text or "").strip()
                                            for m in s.findall("commitment/personmonth")))
print(f"\nentries with no overlap statement   {no_overlap} of {len(sups)}")
print(f"entries with no person-months       {no_effort} of {len(sups)}")
print("Both are legitimate in an upload file and neither is legitimate in a certified one.")
print("SciENcv flags each one on screen until it is completed.")
sys.exit(0 if good else 1)
```

## Write the summary

The XML carries data and nothing else. Everything the senior person needs to know *about* it —
what was proposed, what was inferred and from where, what was decided for them, and what was
left open and why — goes in a file beside it. That is what turns one shot they have to clean
up into an exchange they can steer, and in this document it is also the safety mechanism: the
summary is where the gap between "what NSF's API knows" and "what you must disclose" is
stated in full.

```python
# cps_summary.py -- everything the senior person needs to know ABOUT the file, beside it.
import json, os, datetime as dt
import xml.etree.ElementTree as ET

A = json.load(open("cps_awards.json"))
C = json.load(open("cps_commitments.json"))
O = json.load(open("cps_overlap.json")) if os.path.exists("cps_overlap.json") else {"pairs": []}
M = json.load(open("cps_manual.json")) if os.path.exists("cps_manual.json") else {}
sups = list(ET.parse("current-and-pending.xml").getroot().iter("support"))

cur      = [r for r in A["rows"] if r["current"]]
copi     = [r for r in cur if r["role"] == "co-PI"]
manual   = M.get("support", [])
amt_diff = {i: (e, o) for i, e, o in A["amount_discrepancies"]}
ident, emp = M.get("identification", {}), M.get("employment", {})

L = [f"# Current and Pending (Other) Support — {A['family']}, {A['given']}", "",
     "`current-and-pending.xml` is an **upload file for SciENcv**, not a submission. NSF will "
     "not accept a current and pending document that did not come out of SciENcv: \"Current "
     "and pending (other) support documents not prepared in SciENcv using the proper version "
     "will trigger a compliance error message that will prevent document upload in "
     "Research.gov and Grants.gov.\" Upload this file, complete what is blank on screen, "
     "certify, download the v.2024-1 PDF, and submit that.", "",
     f"Built {dt.date.today()} against NSF Award Search as of {A['asof']} and the SciENcv XML "
     f"templates downloaded the same day. {len(sups)} entries: {len(cur)} from NSF's award "
     f"record, {len(manual)} from `cps_manual.json`.", "",
     "## What it cannot see, and this is the important part", "",
     "**NSF Award Search returns NSF awards. Nothing else in this disclosure is visible to it.**",
     "Every one of the following is reportable, and none of it is in this file unless you put "
     "it in `cps_manual.json` yourself:", "",
     "- NIH, DOE, DOD, NASA, USDA, NIST and every other federal agency",
     "- private foundations, non-profits, industry contracts, and gifts allocated to a project",
     "- **any foreign source** — government, university, company or institute, including "
     "support paid directly to you rather than through your organization",
     "- your institutional start-up package, and internal funds allocated to specific projects",
     "- **consulting**, where it involves research, relates to your research portfolio in a way "
     "that could affect funding or effort, or comes with a confidentiality clause over the "
     "financial relationship",
     "- **in-kind contributions** of $5,000 or more that commit your time — lab or office "
     "space, equipment, data sets, personnel, computing, materials",
     "- **every pending proposal, including the one you are submitting now**",
     "- NSF proposals under review — the award record holds awards, never proposals", ""]
if not manual:
    L += ["**`cps_manual.json` was absent or empty, so this file contains NSF awards and "
          "nothing else.** For almost every senior person that is an incomplete disclosure, "
          "and completeness is what the certification asserts.", ""]

L += ["## Proposed", "",
      f"- **{len(cur)} current NSF award(s)**, each written as `contributiontype` award, "
      f"`supporttype` current, with NSF's own title, award number, period of performance and "
      f"primary place of performance."]
L += [f"  - `{r['id']}` {r['startdate']} to {r['enddate']} — {r['projecttitle'][:80]} "
      f"(you are **{r['role']}**)" for r in cur]
L += ["- **Overall objectives** are extracted from NSF's published abstract for each award — "
      "your own project text, cut at a sentence boundary inside PAPPG's 1,500-character limit. "
      "Nothing was written for you. Read each one: an abstract is written to describe a "
      "project to the public, and PAPPG asks for its objectives.", "",
      "## Inferred", "",
      f"- **Which awards are yours.** `pdPIName` matches the PI role only; the separate "
      f"`coPDPI` query turned up {len(A['found_by_copdpi_only'])} award(s) that appear under "
      f"no other query. "
      + (f"**{len(copi)} of your {len(cur)} current award(s) are co-PI awards** and would have "
         f"been missing from a document built the obvious way."
         if copi else "None of your current awards are co-PI awards, but the query runs both ways."),
      f"- **Which of them are you.** Not from `piId`, which is not a person — one value sits on "
      f"three different investigators' awards. Each award carries a `pi` array naming everyone "
      f"who has held the PI role, with the address NSF published for them, and that address is "
      f"the identity key"
      + (f" — {', '.join(A['address'])}." if A["address"] else "."),
      f"- **Which are current.** Computed as an end date on or after {A['asof']}, not read off "
      f"NSF's `activeAwd` flag. The two agreed on all {len(A['rows'])} of your awards"
      + ("." if not A["activeaward_disagrees"] else
         f" except {', '.join(A['activeaward_disagrees'])}, which is drift worth a look."),
      f"- **Total award amount.** NSF publishes an estimated total and an obligated total and "
      f"they disagree on {len(amt_diff)} of your awards; the larger is used, because PAPPG asks "
      f"for the total for the entire period of performance."]
L += [f"  - `{i}` estimated ${e:,}, obligated ${o:,} — written as ${max(e, o):,}. On a "
      f"continuing grant the obligated figure covers only the years funded so far."
      for i, (e, o) in amt_diff.items() if any(r["id"] == i for r in cur)]
L += ["- **Primary place of performance** is the site NSF published for the award, which on an "
      "award led elsewhere is the lead institution and not yours. Change it where your portion "
      "of the work happens somewhere else.", "",
      "## Decided on your behalf", "",
      "- **Person-month years are placed; the numbers are not.** Each `<personmonth>` carries a "
      "year attribute and an empty value, which NLM documents as the way to reserve the right "
      "time period — \"If the person-months field is left blank, effort will not be shown for "
      "that entry. However, the year must still be entered.\"",
      f"- **Years run from {A['asof'][:4]} to the end of each project**, because PAPPG asks for "
      f"\"the current budget period\" and \"each subsequent budget period\" and not for years "
      f"already past.",
      "- **A year with no effort is deleted, not zeroed.** NSF does not accept a zero: "
      "\"Individuals should only include projects to which they are committing time/person "
      "months.\" NIH's Common Form began accepting zero on 2026-04-22; NSF's document did not "
      "follow, so do not carry that habit across."]
if C["dropped_zero"]:
    L.append("  - dropped for zero effort: "
             + ", ".join(f"`{a}` {y}" for a, y in C["dropped_zero"]))
L += ["- **Every `potentialoverlap` is empty**, and that is not an oversight — see below.",
      "- **Element order follows NLM's blank template**, read out of the file at run time. "
      "SciENcv's first upload error is `Incorrect Element Order`.",
      "- **No email addresses reach the funding entries.** PAPPG forbids personal information "
      "in this document, and NSF publishes co-PI addresses on its award records.", "",
      "## Left blank, deliberately", ""]
blanks = [("`potentialoverlap`, on every entry",
           "PAPPG requires a statement per entry and requires the word \"none\" where there is "
           "none. That is a judgement about the relationship between two funded projects, and "
           "it is an assertion you certify. Writing it for you would be inventing the one field "
           "the document exists to test."),
          ("person-months, where no effort was supplied",
           f"{len(C['blank'])} year row(s) across {len(C['commitment'])} award(s). Effort is in "
           f"no public record.")]
if not ident.get("orcid"):  blanks.append(("`<id idtype=\"orcid\">`", "no ORCID iD was supplied."))
if not ident.get("nsf_id"): blanks.append(("`<id idtype=\"national_science_foundation\">`",
                                           "no NSF ID was supplied, and NSF's own identifier "
                                           "for you is the one that matters on an NSF proposal."))
if not emp.get("positiontitle"):
    blanks.append(("position title and employing organization",
                   "PAPPG requires both; neither is in the award record."))
L += [f"- **{what}** — {why}" for what, why in blanks]
L += ["", "Blank fields upload cleanly. SciENcv flags each one on screen and will not let you "
      "certify until it is filled, which is the intended division of labour: the file removes "
      "the transcription, you supply the judgement, and the certification stays yours.", "",
      "## Overlap — the pairs worth a sentence", ""]
if O["pairs"]:
    L += ["Evidence of relatedness, not a finding of overlap. Ranked; the top of this list is "
          "where a reviewer looks first.", ""]
    for p in O["pairs"]:
        L += [f"- **`{p['a']}` and `{p['b']}`** (score {p['score']})",
              f"  - {p['a_title']}", f"  - {p['b_title']}"] + [f"  - {e}" for e in p["evidence"]]
else:
    L.append("No pair of disclosed entries shows evidence of relatedness. That is not the same "
             "as \"none\", which is a statement you make about each entry individually.")
if not O.get("proposal"):
    L += ["", "**The proposal you are preparing was not supplied**, so nothing was compared "
          "against it — and that is the comparison NSF actually asks for. Set "
          "`CPS_PROPOSAL_TITLE`, or write its summary into `cps_proposal.txt`, and run the "
          "overlap step again."]
L.append("")
if A["former_current"]:
    L += ["## Excluded, and worth confirming", "",
          f"NSF records your role as **(Former)** on {len(A['former_current'])} current award(s) "
          f"— a role you handed over. A former PI has no ongoing commitment, so these are not "
          f"your current support and are not in the file. NSF's marker can lag reality; if you "
          f"are still committing time to any of them, add it back."]
    L += [f"- `{aid}` ({role}) — {title[:80]}" for aid, role, title in A["former_current"]]
    L.append("")
if A["unresolved"]:
    L += ["## Could not be attributed", "",
          f"NSF published no address beside your name on {len(A['unresolved'])} award(s), and "
          f"more than one person shares your surname in its record, so they were left out "
          f"rather than guessed at: " + ", ".join(f"`{i}`" for i in A["unresolved"]), ""]
L += ["## Before you certify", "",
      "1. Upload `current-and-pending.xml` to SciENcv, choosing the **NSF** Current and Pending "
      "(Other) Support format. NSF has published nothing about the XML path — it is NLM's "
      "feature — and what NSF receives is the PDF SciENcv generates.",
      "2. Add every non-NSF source listed at the top of this file.",
      "3. Add every pending proposal, **including this one**.",
      "4. Enter person-months for each year, and delete any year you commit none.",
      "5. Write an overlap statement for every entry, or the word \"none\".",
      "6. Certify. The certification is a personal attestation under 18 U.S.C. §§ 287, 1001, "
      "1031 and 31 U.S.C. §§ 3729-3733 and 3802, and no file and no tool can make it for you.",
      "7. Save the PDF, confirm it says **v.2024-1**, and submit it through Research.gov or "
      "Grants.gov.", ""]

open("current-and-pending-summary.md", "w").write("\n".join(L))
print(f"current-and-pending.xml          {len(sups)} support entries")
print(f"current-and-pending-summary.md   {len(L)} lines, "
      f"{sum(1 for x in L if x.startswith('## '))} sections")
print(f"  NSF awards written             {len(cur)}  ({len(copi)} of them co-PI awards)")
print(f"  non-NSF entries written        {len(manual)}")
print(f"  overlap pairs flagged          {len(O['pairs'])}")
print(f"  fields left blank and named    {len(blanks)}")
```

Run the whole thing:

```bash
for s in cps_spec cps_awards cps_effort cps_overlap cps_write cps_check cps_summary; do
  .venv/bin/python $s.py || exit 1
done
```

## How this behaves on a real name

Measured 2026-08-28 across fourteen researchers, as of that date. Which regime a person lands
in is decided by how NSF recorded their name and how much of their support is NSF's, not by
how senior they are.

**A co-PI role is where the support hides, and this is the finding that matters.** Eight of
the fourteen hold current NSF support — 18 current awards between them, and **11 of those 18
are invisible to a `pdPIName` query**. Per person: Jelena Vuckovic 3 of 4, Cynthia Rudin 2 of
3, David Awschalom 2 of 3, Margaret Martonosi 2 of 3, Klaus Lackner 1 of 1, Allison
Myers-Pigg 1 of 1. Lackner holds **no** NSF award as PI at all, so a `pdPIName`-only document
for him is empty and wrong rather than merely incomplete. Myers-Pigg's single current award
is a co-PI award that has not started yet — awarded, therefore current support, and
`activeAwd` agrees.

**A handed-over role is not current support.** Martonosi's 34 awards include 10 where NSF
records her as `(Former)`. All 10 have ended, so nothing changes here; on someone whose
handover happened during a running award, those entries are excluded from the file and listed
in the summary for confirmation.

**The name has to be the one NSF holds.** `Benjamin Shneiderman` returns nothing at all;
`Ben Shneiderman` returns 8 awards as PI and 17 once the co-PI query is included. Nothing
about the empty result says why, which is why the code probes the surname and prints the
forms NSF actually has on file before it exits.

**A shared name stops the run.** `Wei Wang` returns 70 awards under **17 different published
addresses**, from UCLA to Nebraska. There is no correct way to guess, and the refusal prints
each identity with its institutions and date range so one can be chosen. The surname match is
deliberately loose, so the list also picks up an Xiaoyin Wang and a Weimin — over-collecting
and asking is the safe direction; silently choosing is not.

**A senior person with no current NSF support is a normal case, not an error.** Eva Tardos,
Mihaela van der Schaar and Ben Shneiderman each hold NSF awards that have all ended. For them
the NSF half is genuinely empty and the entire document comes from `cps_manual.json` — which
is the honest answer, and the one the summary states first.

**Related awards are findable and unrelated ones stay quiet.** Jelena Vuckovic and Margaret
Martonosi each hold an NQVL Pilot and an NQVL Design award on the same project line. The
detector scores those pairs at 95% term containment with three shared co-PIs, the same NSF
programme and concurrent periods, while an unrelated pair in the same portfolio scores on
concurrency alone.

## What this cannot determine

State these to the senior person every time. They are the reason the output is an upload file
and not a document.

- **Every non-NSF source.** NIH, DOE, DOD, NASA, other federal agencies, foundations,
  industry, internal funds and start-up packages. None of it is in NSF's award record.
- **All foreign support.** Foreign government, university, company and institute funding, paid
  through the organization or directly, is squarely in scope and entirely invisible here. It
  is also the disclosure NSF's research-security policy exists to obtain.
- **Every pending proposal, including this one.** NSF's award record holds awards. A proposal
  under review at NSF is as invisible as one under review anywhere else.
- **Consulting arrangements and in-kind contributions.** Both are reportable at thresholds
  PAPPG states, and neither is public.
- **Person-months.** Effort is not published anywhere. The years are placed; the numbers are
  the senior person's to enter.
- **Whether two projects overlap.** The code ranks the pairs; the sentence is a judgement the
  senior person certifies.
- **Whether an expired award still has ongoing obligations.** PAPPG counts "projects with
  ongoing obligations" as current, and `expDate` does not know about a no-cost extension that
  has not been recorded or funds still to be spent.
- **Whether a `(Former)` marker is up to date.** NSF records role changes on its own schedule.

## Try it

**Data.** Three public sources, no account and no key:

- NLM's [SciENcv CPOS XML templates](https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/) — a
  blank, a populated 2026 sample, and four deliberately awkward samples NLM ships alongside
  them. NLM/NCBI, US Government work. Confirmed reachable 2026-08-28.
- The [NSF Award Search API](https://api.nsf.gov/services/v1/awards.json), a US Government
  work, queried for **Margaret Martonosi**, Princeton University — a real senior person with
  real public NSF awards, chosen because two of her three current awards are co-PI awards that
  the obvious query never returns.

**Run** — cold, in an empty directory:

```bash
python3 -m venv .venv
.venv/bin/pip -q --disable-pip-version-check install requests
.venv/bin/python - <<'PY'
import re, sys, json, datetime as dt, xml.etree.ElementTree as ET, requests

UA   = {"User-Agent": "nsf-current-and-pending/1.0 (https://heurekaskills.com)"}
FTP  = "https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/"
API  = "https://api.nsf.gov/services/v1/awards.json"
ASOF = dt.date(2026, 8, 28)          # pinned so the counts below are reproducible

def get(url, **params):
    r = requests.get(url, headers=UA, params=params or None, timeout=90); r.raise_for_status()
    return r

# 1. The contract is NLM's own file. The blank ships <identification/> empty, so the populated
#    sample is the only place the identification order is written down.
blank = ET.fromstring(get(FTP + "sample-blank.xml").content)
full  = ET.fromstring(get(FTP + "SampleXMLUpdated2026.xml").content)
ORDER = [c.tag for c in blank.find("funding/support")]
print(f"blank template  root <{blank.tag}>  {[c.tag for c in blank]}")
print(f"support element order ({len(ORDER)})  {' '.join(ORDER)}")
print(f"identification  {[c.tag for c in full.find('identification')]}"
      f"  idtypes {[e.get('idtype') for e in full.findall('identification/id')]}")
print(f"support dates are flat ISO {full.findtext('funding/support/startdate')!r}; "
      f"employment nests <year> {full.findtext('employment/position/startdate/year')!r}")
assert ORDER[4] == "contributiontype" and ORDER[-1] == "commitment"
assert {s.findtext("contributiontype") for s in full.iter("support")} == {"award", "inkind"}
assert all(s.find("enddate") is None for s in full.iter("support")
           if s.findtext("contributiontype") == "inkind"), "in-kind samples carry no <enddate>"

# 2. SciENcv checks format AND element order on upload. NLM ships the failure cases; run the
#    same rules over them and confirm each is caught for the reason NLM documents.
def subsequence(kids, order):
    i = 0
    for k in kids:
        while i < len(order) and order[i] != k: i += 1
        if i == len(order): return False
        i += 1
    return True

def verdict(name):
    try: r = ET.fromstring(get(FTP + name).content)
    except ET.ParseError: return "not well-formed XML"
    for s in r.iter("support"):
        if not subsequence([c.tag for c in s], ORDER): return "element out of order"
        if not (s.findtext("contributiontype") or "").strip(): return "contributiontype empty"
        for m in s.findall("commitment/personmonth"):
            if not re.fullmatch(r"\d{4}", m.get("year") or ""): return "personmonth year missing"
    return "accepted"

print()
for name, expected in [("sample_multiple_items.xml", "accepted"),
                       ("sample_inkind.xml",         "accepted"),
                       ("sample_partial.xml",        "personmonth year missing"),
                       ("sample_invalid.xml",        "element out of order"),
                       ("random-error.xml",          "not well-formed XML")]:
    got = verdict(name)
    print(f"  {name:<26} {got}")
    assert got == expected, f"{name}: expected {expected!r}, got {got!r}"

# 3. A real senior person. pdPIName finds awards where she is the PI and nothing where she is
#    a co-PI; coPDPI is a separate query, and it is where most of her current support lives.
def page(param, value):
    out, offset = [], 0                     # offset is 0-based, whatever the docs default to
    while True:
        got = get(API, **{param: value, "rpp": 25, "offset": offset}) \
              .json().get("response", {}).get("award", [])
        out += got
        if len(got) < 25: return out
        offset += 25

def mdy(s):
    try: return dt.datetime.strptime(s, "%m/%d/%Y").date()
    except (TypeError, ValueError): return None

first = get(API, pdPIName="Margaret Martonosi", rpp=25, offset=0).json()["response"]["award"]
one   = get(API, pdPIName="Margaret Martonosi", rpp=25, offset=1).json()["response"]["award"]
print(f"\noffset paging   offset=0 -> {len(first)} awards, offset=1 -> {len(one)}; "
      f"offset=1 drops {first[0]['id']}")
assert len(one) == len(first) - 1 and one[0]["id"] != first[0]["id"], "offset is not 0-based"

pi   = page("pdPIName", "Margaret Martonosi")
co   = [a for a in page("coPDPI", "Margaret Martonosi")
        if any("martonosi" in (c or "").lower() for c in (a.get("coPDPI") or []))]
ids  = {a["id"] for a in pi}
allw = pi + [a for a in co if a["id"] not in ids]
cur  = [a for a in allw if (mdy(a.get("expDate")) or dt.date(1900, 1, 1)) >= ASOF]
print(f"awards as PI    {len(pi)}")
print(f"awards as co-PI {len(co)}, of which {len([a for a in co if a['id'] not in ids])} "
      f"appear under no other query")
print(f"current as of {ASOF}   {len(cur)} of {len(allw)}   "
      f"{sum(1 for a in cur if a['id'] not in ids)} of them found ONLY via coPDPI")
assert any(a["id"] not in ids for a in cur), "the coPDPI query is load-bearing and returned nothing"

# `piId` is not a person: one value sits on awards whose named PIs are different people. The
# `pi` array is, and it marks a role that has been handed over.
byid = {}
for a in allw: byid.setdefault(a.get("piId"), set()).add(a.get("piLastName"))
shared = {k: v for k, v in byid.items() if len(v) > 1}
print(f"piId values covering more than one named PI   {len(shared)}  "
      f"{ {k: sorted(v) for k, v in shared.items()} }")
assert shared, "piId no longer conflates investigators -- re-read this section"

# activeAwd is not a status NSF maintains -- it is exactly expDate >= today, and it says
# nothing about whether the project has started or whether obligations outlive the end.
assert all((a.get("activeAwd") == "true") == ((mdy(a.get("expDate")) or dt.date(1900,1,1)) >= ASOF)
           for a in allw), "activeAwd no longer tracks expDate"
print(f"activeAwd == (expDate >= today) on all {len(allw)} awards")

# 4. Write the entries, in the template's order, and check what NSF and SciENcv each require.
root = ET.Element("profile")
ET.SubElement(ET.SubElement(root, "identification"), "name")
ET.SubElement(ET.SubElement(root, "employment"), "position")
funding = ET.SubElement(root, "funding")
for a in sorted(cur, key=lambda x: x["id"]):
    s = ET.SubElement(funding, "support")
    est = int(re.sub(r"\D", "", a.get("estimatedTotalAmt") or "0") or 0)
    obl = int(re.sub(r"\D", "", a.get("fundsObligatedAmt") or "0") or 0)
    start, end = mdy(a["startDate"]), mdy(a["expDate"])
    val = {"projecttitle": a["title"], "awardnumber": a["id"],
           "supportsource": "National Science Foundation",
           "location": f"{a.get('perfCity','').title()}, {a.get('perfStateCode','')}, United States",
           "contributiontype": "award", "awardamount": str(max(est, obl)),
           "startdate": start.isoformat(), "enddate": end.isoformat(), "supporttype": "current"}
    for tag in ORDER:
        if tag == "commitment":
            c = ET.SubElement(s, "commitment")
            for y in range(max(start.year, ASOF.year), end.year + 1):
                ET.SubElement(c, "personmonth").set("year", str(y))
            continue
        e = ET.SubElement(s, tag)
        if val.get(tag): e.text = val[tag]
ET.indent(root, space="    ")
ET.ElementTree(root).write("current-and-pending.xml", encoding="UTF-8", xml_declaration=True)
out  = ET.parse("current-and-pending.xml").getroot()
sups = list(out.iter("support"))
raw  = open("current-and-pending.xml", encoding="utf-8").read()

print(f"\ncurrent-and-pending.xml   {len(sups)} <support> entries")
for s in sups:
    yrs = [m.get("year") for m in s.findall("commitment/personmonth")]
    print(f"  {s.findtext('awardnumber')}  {s.findtext('startdate')} to {s.findtext('enddate')}  "
          f"${int(s.findtext('awardamount')):>9,}  years {','.join(yrs)}")
for label, ok in [
    ("element order matches the template",  all(subsequence([c.tag for c in s], ORDER) for s in sups)),
    ("contributiontype carries a value",    all(s.findtext("contributiontype") == "award" for s in sups)),
    ("awardamount is a bare integer",       all(re.fullmatch(r"\d+", s.findtext("awardamount")) for s in sups)),
    ("dates are ISO YYYY-MM-DD",            all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", s.findtext("startdate")) for s in sups)),
    ("every personmonth carries a year",    all(re.fullmatch(r"\d{4}", m.get("year"))
                                                for s in sups for m in s.findall("commitment/personmonth"))),
    ("every person-month value is empty",   all((m.text or "") == "" for s in sups
                                                for m in s.findall("commitment/personmonth"))),
    ("every potentialoverlap is empty",     all((s.findtext("potentialoverlap") or "") == "" for s in sups)),
    ("no placeholder text in the file",     not re.search(r"\bTBD\b|\bTODO\b|\[\s*fill", raw)),
]:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    assert ok, label

print("\nPerson-months and overlap statements are empty because neither is public information.")
print("Effort is yours to state and overlap is yours to judge; SciENcv flags both on screen.")
print("This file holds NSF awards only. NIH, DOE, foundations, start-up, consulting, foreign")
print("support and in-kind contributions are equally reportable and are not here.")
PY
```

**Expect.**

Invariants — true regardless of what NLM or NSF return, so a failure means this page is wrong:

- The blank template is `<profile>` over `identification`, `employment`, `funding`, and its
  `<support>` has **thirteen children** with `contributiontype` fifth and `commitment` last.
- The populated sample uses **both** `contributiontype` values, and its in-kind entries carry
  **no `<enddate>` element at all**.
- Support dates are flat `YYYY-MM-DD`; employment dates nest `<year>`.
- NLM's four awkward samples are each rejected for the documented reason, and its two valid
  ones are accepted.
- **`offset=1` returns one fewer award than `offset=0` and drops the first** — the paging base
  is 0 whatever the documentation says.
- **`piId` conflates people**, and **`activeAwd` is exactly `expDate >= today`**.
- At least one current award is reachable **only** through the `coPDPI` query.
- The written file keeps the template's element order, carries a value in every
  `contributiontype`, writes bare-integer amounts and ISO dates, gives every `<personmonth>` a
  four-digit year, and leaves every person-month value and every `potentialoverlap` empty.

Observed 2026-08-28 against NLM and NSF — these move as awards end and are made, so a mismatch
is drift to investigate, not a bug:

```
blank template  root <profile>  ['identification', 'employment', 'funding']
support element order (13)  projecttitle awardnumber supportsource location contributiontype awardamount inkinddescription overallobjectives potentialoverlap startdate enddate supporttype commitment
identification  ['id', 'id', 'account', 'name']  idtypes ['orcid', 'national_science_foundation']
support dates are flat ISO '2025-12-01'; employment nests <year> '2015'

  sample_multiple_items.xml  accepted
  sample_inkind.xml          accepted
  sample_partial.xml         personmonth year missing
  sample_invalid.xml         element out of order
  random-error.xml           not well-formed XML

offset paging   offset=0 -> 24 awards, offset=1 -> 23; offset=1 drops 2620655
awards as PI    24
awards as co-PI 11, of which 10 appear under no other query
current as of 2026-08-28   3 of 34   2 of them found ONLY via coPDPI
piId values covering more than one named PI   3  {'000236249': ['Houck', 'Martonosi', 'Tureci'], '000226974': ['Danyluk', 'Martonosi'], '000051618': ['Brodley', 'Clarke']}
activeAwd == (expDate >= today) on all 34 awards

current-and-pending.xml   3 <support> entries
  2435244  2024-12-15 to 2026-11-30  $1,000,000  years 2026
  2547175  2026-06-15 to 2028-05-31  $4,000,000  years 2026,2027,2028
  2620655  2026-08-01 to 2028-07-31  $  250,000  years 2026,2027,2028
  PASS  element order matches the template
  PASS  contributiontype carries a value
  PASS  awardamount is a bare integer
  PASS  dates are ISO YYYY-MM-DD
  PASS  every personmonth carries a year
  PASS  every person-month value is empty
  PASS  every potentialoverlap is empty
  PASS  no placeholder text in the file

Person-months and overlap statements are empty because neither is public information.
Effort is yours to state and overlap is yours to judge; SciENcv flags both on screen.
This file holds NSF awards only. NIH, DOE, foundations, start-up, consulting, foreign
support and in-kind contributions are equally reportable and are not here.
```

## Where this ages

- **NSF's schedule, not ours.** PAPPG 24-1, Important Notice No. 149 and the v.2024-1 form
  version all move on NSF's timetable. NSF has signalled that the PAPPG will be replaced by
  *Guidance on Financial Assistance*; when that lands, re-check every date here.
- **NLM revises the templates.** `cps_spec.py` exists so that check is one command: it reads
  the element order out of NLM's live files rather than trusting this page.
- **NSF and NLM are drifting on versions.** NSF pins the current and pending PDF at v.2024-1
  while NIH's Common Form has moved to 2025-1 and 2026-1, and the zero-person-month change of
  2026-04-22 landed on the NIH side only. Expect the two to keep diverging, and follow NSF's
  own pages for the NSF document.
- **NSF has published nothing about the XML upload.** It is NLM's feature, described
  agency-generically. If NSF ever documents it, that page becomes the authority over this one.

## Sources

Read 2026-08-28.

- [PAPPG 24-1 Chapter II](https://www.nsf.gov/policies/pappg/24-1/ch-2-proposal-preparation) —
  II.D.2.h(ii) is the requirement: the current and pending definitions, the field list, the
  1,500-character limit on Overall Objectives, the $5,000 in-kind threshold, the consulting
  and foreign-support rules, the personal-information prohibition, and the certification.
- [PAPPG policy page](https://www.nsf.gov/policies/pappg) — confirms 24-1 in force with
  supplements NSF 26-200 (2025-12-08) and NSF 26-202 (2026-01-22).
- [FAQ on Important Notice No. 149](https://www.nsf.gov/research-security/important-notice-no-149-implementation-faq)
  — the 2025-12-02 effective date and the grace period that ended 2025-12-31. Last updated
  2026-03-13.
- [FAQ — Using SciENcv](https://www.nsf.gov/policies/document/faq-using-sciencv) — the v.2024-1
  requirement, the Research.gov compliance error for documents not prepared in SciENcv, the
  refusal of zero person-months, and the fiscal-year rule. Last updated 2026-03-30.
- [FAQ — Current and Pending (Other) Support](https://www.nsf.gov/funding/senior-personnel-documents/faq/current-pending)
  — "only years in which they are committing time should be listed." Last updated 2026-02-05.
- [Senior personnel documents](https://www.nsf.gov/funding/senior-personnel-documents) — the
  SciENcv mandate and the submission route. Last updated 2026-04-13.
- [How do I structure a Current & Pending (Other) Support XML File for SciENcv?](https://support.nlm.nih.gov/kbArticle/?pn=KA-05499)
  — the `contributiontype` rule and the blank-person-month/required-year rule.
- [How do I fix an error message after uploading my XML file to SciENcv](https://support.nlm.nih.gov/kbArticle/?pn=KA-05498)
  — the four upload errors: Incorrect Element Order, Missing Contribution Type, Unsupported
  Special Characters, Invalid XML File.
- [SciENcv in My NCBI Help](https://www.ncbi.nlm.nih.gov/books/NBK154494/) — person-months
  range 0 to 12 with up to two decimal places, and the XML upload flow. Last updated
  2026-05-08.
- [SciENcv CPOS XML templates](https://ftp.ncbi.nlm.nih.gov/pub/sciencv/cposXML/) — the blank,
  the 2026 sample, and the edge-case samples this page tests against.
- [NSF Award Search API](https://api.nsf.gov/services/v1/awards.json) — public award records.

NSF's policy documents and NLM's templates are US Government works and not subject to domestic
copyright. Short phrases are quoted where the exact wording is the requirement; the rest of
this page is original.
