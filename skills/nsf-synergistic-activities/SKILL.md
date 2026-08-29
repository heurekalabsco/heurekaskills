---
name: nsf-synergistic-activities
description: Draft the one-page NSF Synergistic Activities document — five distinct examples chosen and compressed from a CV and NSF's own award record, rendered to a PDF whose page count, typeface, leading and margins are read back out of the file, with a separate summary naming what was selected, what was cut and why, and what only the senior person can supply.
category: grants
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [nsf, grants, compliance, submission]
covers: [synergistic activities, nsf, pappg, broader impacts, senior personnel documents, research.gov, grants.gov, one page, five examples, biographical sketch, biosketch, sciencv, nsf award search, broadening participation, mentoring, teaching, curriculum development, outreach, editorial service, standards development, research tools, database development, proposal preparation, page limit, pdf, reportlab, pandoc, ii.d.2.h(iv)]
papers: []
access: [open]
datasets: [https://api.nsf.gov/services/v1/awards.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: PAPPG 24-1 II.D.2.h(iv) and II.C.2 read live 2026-08-28 / NSF senior-personnel-documents page last updated 2026-04-13 / policy notices NSF 26-200 and NSF 26-202 / NSF Award Search API v1 / Python 3.12.8 / reportlab 5.0.1 / pypdf 6.16.2 / requests 2.34.2 / pandoc 3.x with XeLaTeX
  executed: 15
  unverified: 0
---
# NSF Synergistic Activities

One page. Up to five distinct examples. No citations, no template, and — unlike the
biographical sketch and current and pending support — **not prepared in SciENcv**. You
write it, save it as a PDF, and upload it yourself.

It is a young requirement and it is easy to look for in the wrong place. Until
2024-05-20 synergistic activities were a section of the NSF biographical sketch. PAPPG
24-1 pulled them out into a separate attachment of their own, so a researcher whose last
NSF proposal predates that change will go looking for the field in SciENcv and not find
it, and guidance still in circulation on university research-administration pages still
describes the old arrangement.

**This is not the COA.** `nsf-coa` fills NSF's Collaborators and Other Affiliations
template — a conflict-of-interest disclosure, on NSF's own `.xlsx`, used for one purpose,
keeping conflicted people out of the reviewer pool. It is exhaustive by design and nobody
reads it as prose. Synergistic Activities is the opposite document in every respect: no
template, a hard length limit, reviewed as evidence of broader impact, and scored on what
you leave out. Both are required, both are per senior person, and they overlap nowhere.

**And it is not the biographical sketch.** The test for every line is whether the entry is
*a scientific result* or *something you did for the community around the science*. NSF
already has the results. A CV read naively yields five research summaries, which is the
single most common way this document is got wrong.

## What NSF requires, and when it was checked

Checked **2026-08-28**. **PAPPG 24-1** (applies to proposals submitted or due on or after
2024-05-20) is the current version. Two policy notices supplement it — **NSF 26-200**
(issued and effective 2025-12-08) and **NSF 26-202** (issued and effective 2026-01-22) —
and both apply "for all financial assistance awarded on or after" their dates. **Neither
one touches II.D.2.h(iv).** NSF has deferred the planned NSF 26-1 PAPPG and is drafting a
replacement called *Guidance on Financial Assistance*; public comment on the draft closed
2026-08-24.

The requirement, at **PAPPG II.D.2.h(iv)**, is one sentence and a list:

> Each individual identified as a senior/key person must provide a document of up to
> one-page that includes a list of up to five distinct examples that demonstrates the
> broader impact of the individual's professional and scholarly activities that focus on
> the integration and transfer of knowledge as well as its creation.

NSF's senior-personnel-documents page (last updated 2026-04-13) adds only the submission
route: "save it as a PDF and submit it as part of your proposal via Research.gov or
Grants.gov."

That is the entire specification. There is no template to download, no form to fill, and
**no automated check that catches an overflowing page** — NSF's published automated
compliance checks are dated 2023-01-30, predate this document, and name Project Summary,
Biographical Sketch, Postdoctoral Mentoring Plan and the Data Management and Sharing Plan
but not Synergistic Activities. A second page will reach a program officer.

## The nine kinds, and why five must be five different ones

PAPPG names nine kinds of example, "among others" — so the list is open, but it is also
the only statement NSF makes about what belongs here:

| # | kind |
|---|---|
| 1 | innovations in teaching and training |
| 2 | contributions to the science of learning |
| 3 | development and/or refinement of research tools |
| 4 | computation methodologies and algorithms for problem-solving |
| 5 | development of databases to support research and education |
| 6 | broadening the participation of groups underrepresented in STEM |
| 7 | participation in international research collaborations |
| 8 | participation in national and/or international standards development efforts |
| 9 | service to the scientific and engineering community outside of the individual's immediate organization |

**Distinct** is a stated requirement, not a matter of style, and it is the constraint the
whole pipeline below is built around: **at most one example per kind.** Five slots against
nine kinds turns "which five" from a ranking into an assignment, and an assignment is the
thing that stops a document being five flavours of one activity. Where fewer than five
kinds have evidence behind them, the right answer is fewer examples — NSF says *up to*
five, and four strong ones beat five where the fifth is filler.

## Where it goes wrong

Four failure modes, all of which the code below actively resists.

1. **Promotional inflation.** "Groundbreaking", "world-class", "pioneering". Reviewers
   discount it and it spends the page budget on nothing. Plain declarative sentences with
   numbers in them do more work in less space. `syn_check.py` fails the document if one
   survives.
2. **Five examples that are one example.** A PI with four consecutive curriculum renewals
   has one activity, not four. `syn_candidates.py` folds a run of awards on the same
   subject into a single activity before anything is chosen.
3. **Losing the countable detail.** "Extensive mentoring experience" costs the same as
   "10 postdoctoral fellows, 7 doctoral students, 3 master's students and 19
   undergraduates" and says nothing. Every entry is required to carry a number.
4. **Silent overflow.** One page is a hard limit, a word processor will not warn you, and
   nothing at submission checks it. `syn_render.py` measures the flowed text against the
   page before it writes the file, and `syn_check.py` reads the page count back out of
   the finished PDF.

## Format rules that decide whether it is accepted

PAPPG sets no typeface for this document specifically, so the general proposal-preparation
rules at **II.C.2** govern, and they apply "to all uploaded sections of a proposal,
including supplementary documentation":

- **Arial (not Arial Narrow), Courier New or Palatino Linotype at 10pt or larger; Times
  New Roman at 11pt or larger; Computer Modern at 11pt or larger.** Footnote 7 adds
  Helvetica and Palatino **for Macintosh users only** — a PDF carries no record of the
  machine that made it, so this page stays inside the unconditional set and renders in
  **Times New Roman 11pt**.
- **No more than six lines of text within a vertical space of one inch**, which is a floor
  of 12pt leading and the reason the compression ladder below stops where it does.
- **Margins at least one inch in all directions**, and no proposer-supplied information in
  them.
- **Paper no larger than letter** (8½ × 11 or 11 × 8½).
- **Leave out page numbering** — Research.gov paginates the assembled proposal itself.
- A standard **single-column** layout is strongly encouraged.

One document per senior/key person, and every senior person on the proposal needs one —
including at every non-lead organisation of a collaborative proposal.

## What you need

Python 3.9+, `reportlab` and `pypdf` for the PDF, `requests` for the two NSF sources.
**No API key and no account.** Nothing here is vendored: NSF's wording is read live every
run, because a stale copy of a compliance requirement is worse than none.

| source | what it gives | licence |
|---|---|---|
| [PAPPG 24-1 Chapter II](https://www.nsf.gov/policies/pappg/24-1/ch-2-proposal-preparation) | the requirement and the format rules, machine-readable | US Government work, not subject to domestic copyright |
| [Senior personnel documents](https://www.nsf.gov/funding/senior-personnel-documents) | the submission route | US Government work |
| [NSF Award Search API](https://api.nsf.gov/services/v1/awards.json) | your award record — titles, programs, dates, roles, amounts | US Government work |

The Python path is permissive throughout — `reportlab` and `pypdf` are BSD-3-Clause,
`requests` is Apache-2.0 — and nothing here redistributes any of them. The optional pandoc
route at the end uses pandoc (GPL-2.0-or-later) and XeLaTeX (LPPL); both restrict
redistribution rather than use, and neither is shipped or wrapped by this page.

**ORCID's API is deliberately not used**, here or anywhere in this family of skills.
ORCID's Public APIs Terms of Service grant only "a limited royalty-free license to make
non-commercial use of the Public APIs" and state that you "may not make use of the public
APIs in connection with any revenue-generating product or service", so a researcher whose
work is commercial has no lawful route through it. Checked 2026-08-28. Nothing on this
page needs a bibliographic source at all: publications are the biographical sketch's
business, not this document's.

```bash
python3 -m venv .venv
.venv/bin/pip install reportlab pypdf requests
```

Save each block below as the file named in its first line and run them in the order they
appear. Set the subject once, in the shell you run them from:

```bash
export SYN_PI="Mark Guzdial"                  # the name NSF holds on your awards
export SYN_NAME="Mark Guzdial"                # how you want it to read on the document
export SYN_ORG="University of Michigan"
# export SYN_EMAIL="mjguz@umich.edu"           # only if your name is not unique in NSF's record
# export SYN_CV="cv.txt"                      # your CV as plain text; optional but see below
```

## Read the requirement out of NSF's own page

There is no template to parse, so the contract is read out of the prose NSF publishes —
the requirement sentence, the nine example kinds, and the four format rules. This is the
block that fails loudly the day NSF changes any of them, including the day it moves this
document into SciENcv.

```python
# syn_rules.py -- read the requirement out of NSF's own pages, not out of a guide.
import html, json, re, sys, requests

UA = {"User-Agent": "nsf-synergistic-activities/1.0"}
PAGES = {
    "pappg_ch2": "https://www.nsf.gov/policies/pappg/24-1/ch-2-proposal-preparation",
    "senior_personnel": "https://www.nsf.gov/funding/senior-personnel-documents",
}

def text_of(url):
    r = requests.get(url, headers=UA, timeout=90)
    r.raise_for_status()
    s = r.text
    s = re.sub(r"(?is)<(script|style|svg)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?is)<br[^>]*>", "\n", s)
    s = re.sub(r"(?is)</(p|div|li|h[1-6]|tr|td)>", "\n", s)
    s = html.unescape(re.sub(r"(?s)<[^>]+>", " ", s))
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return [re.sub(r"\s+", " ", ln).strip() for ln in s.split("\n") if ln.strip()]

def one(lines, *needles):
    hits = [ln for ln in lines if all(n in ln for n in needles)]
    if not hits:
        sys.exit(f"NSF's page no longer contains {needles!r} -- re-read it before trusting this skill")
    return min(hits, key=len)

ch2 = text_of(PAGES["pappg_ch2"])
sp  = text_of(PAGES["senior_personnel"])

req = one(ch2, "up to five distinct examples", "Examples may include")
# The nine named examples are one semicolon-delimited run after "Examples may include".
tail = req.split("Examples may include, among others:", 1)[1]
cats = [c.strip(" .") for c in tail.split(";") if c.strip(" .")]
cats[-1] = re.sub(r"^and ", "", cats[-1])

fmt = {
    "fonts":   one(ch2, "Times New Roman at a font size of"),
    "arial":   one(ch2, "Arial"),
    "leading": one(ch2, "No more than six lines of text"),
    "margins": one(ch2, "Margins, in all directions"),
    "paper":   one(ch2, "Paper size must be no larger"),
    "pageno":  one(ch2, "should leave out page numbering"),
}

# One key per example kind NSF names, in NSF's order, and the words that identify each
# in an award title, an NSF program name or a CV heading. Everything downstream reads
# this table from the JSON, so the mapping onto NSF's list lives in one place.
KEYS = ["teaching", "learning", "tools", "methods", "databases",
        "participation", "international", "standards", "service"]
SIGNALS = {
 "teaching":      (r"IUSE|CCLI|TUES|\bATE\b|Advanced Tech Education|CURRIC|Curricul|Course|"
                   r"Teacher|Classroom|Undergraduate Education|CSforAll|\bRET\b|Instructional|"
                   r"Pedagog|Training|Textbook|Faculty Development|Mentor|Advis(ed|ing)"),
 "learning":      (r"Science of Learning|DRK-12|Cyberlearning|REESE|Education Research|"
                   r"Computing Ed|Learning Sciences|Student Learning|Assessment|How People Learn"),
 "tools":         (r"Instrumentation|\bMRI\b|Instrument|Infrastructure|\bCRI\b|CCRI|Testbed|"
                   r"Software|Toolkit|Open-Source|Open Source|Platform|Simulator|Package"),
 "methods":       r"Algorithmic Foundations|Algorithm|Computational Method|Numerical Method|Statistical Method",
 "databases":     (r"Database|Data Infrastructure|CSSI|\bSI2\b|Repository|Data Resource|"
                   r"Cyberinfrastructure|Corpus|Archive|\bebook|Data Set|Dataset|Atlas"),
 "participation": (r"BROADENING PARTIC|\bBPC\b|LSAMP|AGEP|ADVANCE|S-STEM|INCLUDES|\bHSI\b|TCUP|"
                   r"Broaden|Underrepresent|Diversity|Women in|Minority|Access and Inclusion|"
                   r"First-generation|Outreach"),
 "international": r"\bOISE\b|\bPIRE\b|\bIRES\b|International Collaborat|International Partner|International Research",
 "standards":     r"Standards Develop|Standards Committee|Interoperab|Reference Implementation|Benchmark Suite|Nomenclature",
 "service":       (r"Workshop|Conference|Symposium|Travel|Community Building|Meeting|Societ|"
                   r"Summit|Editor|Advisory|Panel|Alliance|Consorti|Review Panel|Study Section"),
}

rules = {
    "checked": "2026-08-28",
    "keys": KEYS, "signals": SIGNALS,
    "pappg": "24-1", "section": "II.D.2.h(iv)",
    "max_pages": 1, "max_examples": 5,
    "requirement": req.split("Examples may include")[0].strip(),
    "categories": cats,
    "format": fmt,
    "sciencv": "SciENcv" in " ".join(sp),
    "submit": one(sp, "save it as a PDF"),
}
json.dump(rules, open("syn_rules.json", "w"), indent=1)

print(f"PAPPG {rules['pappg']} {rules['section']}   one page, up to {rules['max_examples']} distinct examples")
print(f"NSF names {len(cats)} example kinds:")
for i, c in enumerate(cats, 1):
    print(f"  {i}. {c}")
print(f"\nformat  {fmt['leading']}")
print(f"format  {fmt['margins']}")
print(f"submit  {rules['submit']}")
assert "one-page" in req or "one page" in req
assert rules["max_examples"] == 5 and len(cats) == len(KEYS) == 9, \
    f"NSF now names {len(cats)} example kinds, not 9 -- re-map the signal table"
assert "SciENcv" not in rules["submit"], "NSF now routes this document through SciENcv -- rewrite this skill"
```

## The award record

NSF's own record of what it funded you to do is the only public evidence of your
non-research contributions that carries dates, dollar figures and a verifiable award
number. Four things about this API are not what they look like, and each one silently
changes the answer.

- **`offset` is 0-based**, though NSF's parameter documentation describes 1 as the
  starting record. Paging from 1 drops exactly one award — the most recent, which is the
  one most likely to matter — and the loop below still looks correct. The
  `len(awards) == totalCount` assertion is there to catch it.
- **`printFields` is ignored.** Every request returns all sixty-odd fields, abstracts
  included, whatever you ask for.
- **`pdPIName` matches co-PIs and former PIs too, but `piFirstName`, `piLastName` and
  `piEmail` describe only the current PD/PI.** Filtering results on `piLastName` throws
  away every award you are on but do not lead.
- **`piId` is not the id of the person you searched for.** On NSF 0920655 the current
  PD/PI is Tucker Balch and `piId` is `000228270`, which is Mark Guzdial's — he was the
  original PI and the id never moved. It is stable, and it is stable for the wrong person,
  so it cannot anchor a disambiguation.

The fields that do name everyone are `pi` and `coPDPI`, each an array of
`Given Family[ (Former)] email@host`.

```python
# syn_awards.py -- the subject's award record, from NSF's own public award data.
import json, os, re, sys, time, unicodedata, requests

API = "https://api.nsf.gov/services/v1/awards.json"
UA  = {"User-Agent": "nsf-synergistic-activities/1.0"}
PI    = os.environ["SYN_PI"]
EMAIL = os.environ.get("SYN_EMAIL", "").lower()

def fold(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))

def page(offset, name):
    for attempt in range(5):
        r = requests.get(API, params={"pdPIName": name, "rpp": 25, "offset": offset},
                         headers=UA, timeout=90)
        if r.ok and "json" in (r.headers.get("content-type") or ""):
            return r.json()["response"]
        time.sleep(2 * (attempt + 1))
    sys.exit(f"NSF Award Search did not return JSON after 5 tries: {r.status_code}")

# NSF stores PI names unaccented. Searching 'José Zayas-Castro' returns nothing at all
# and searching 'Jose Zayas-Castro' returns his three awards, with no hint that the first
# query was answered rather than empty. Fold and retry before believing a zero.
QUERY = PI
if int(page(0, QUERY)["metadata"]["totalCount"]) == 0 and fold(PI) != PI:
    QUERY = fold(PI)
    print(f"no awards under {PI!r}; NSF holds names unaccented, retrying as {QUERY!r}")

# offset is 0-based. Starting at 1 -- which NSF's own parameter table describes as the
# default -- silently drops the single most recent award, which is the one most likely to
# matter. Page until a short page, then check the count against the API's own total.
awards, offset = [], 0
while True:
    resp = page(offset, QUERY)
    got = resp.get("award", [])
    awards += got
    total = int(resp["metadata"]["totalCount"])
    if len(got) < 25:
        break
    offset += 25
assert len({a["id"] for a in awards}) == len(awards) == total, \
    f"paged {len(awards)} awards but NSF reports {total} -- check the offset base"

def people(a, key):
    """`pi` and `coPDPI` are the only fields naming everyone. Each entry is
    'Given Family[ (Former)] email@host'."""
    out = []
    for raw in a.get(key) or []:
        m = re.match(r"^(.*?)\s*(\(Former\))?\s*(\S+@\S+)?$", raw.strip())
        out.append({"name": re.sub(r"\s+", " ", m.group(1)).strip(),
                    "former": bool(m.group(2)),
                    "email": (m.group(3) or "").lower()})
    return out

want = [fold(t).lower() for t in PI.split()]
def is_subject(p):
    toks = [fold(t).lower().strip(".") for t in p["name"].split()]
    if not (want[0] in toks and want[-1] in toks):
        return False
    return EMAIL in ("", "any") or p["email"] == EMAIL

rows, emails, skipped = [], {}, []
for a in awards:
    matched = [(k, p) for k in ("pi", "coPDPI") for p in people(a, k) if is_subject(p)]
    if not matched:
        skipped.append(a["id"])
        continue
    key, p = matched[0]
    emails.setdefault(p["email"], []).append(a["id"])
    # `pi` holds everyone who has ever been PD/PI on the award, current one first;
    # `pdPIName` is only the current one. Being in `pi` is not the same as being the PI.
    lead = (a.get("pdPIName") or "").strip().lower() == p["name"].lower()
    role = ("PI" if lead else "former PI") if key == "pi" else "co-PI"
    rows.append({
        "id": a["id"], "title": (a.get("title") or "").strip(),
        "role": role, "former": p["former"] or (key == "pi" and not lead),
        "start": a.get("startDate", ""), "end": a.get("expDate", ""),
        "awarded": a.get("date", ""),
        "org": (a.get("awardeeName") or "").strip(),
        "program": (a.get("fundProgramName") or "").strip(),
        "amount": int(a.get("estimatedTotalAmt") or 0),
        "lead_pi": f"{a.get('piFirstName','')} {a.get('piLastName','')}".strip(),
        "piId": a.get("piId", ""),
        "abstract": re.sub(r"\s+", " ", a.get("abstractText") or "").strip(),
    })

# NSF's PI name search is loose -- 'Maria Garcia' returns 'MARIA J GARCIA-GARCIA' -- so
# the awards NSF returns are not all yours, and the ones NSF returns for a common name are
# several people's. The e-mail NSF published on each award is the only public evidence that
# separates them. More than one, and this refuses rather than drafting a compliance document
# out of a merged record: a page of somebody else's broader impacts is worse than no page.
if len(emails) > 1 and EMAIL not in ("any",):
    print(f"{PI}: {len(emails)} different e-mail addresses carry this name across "
          f"{len(rows)} awards, so this is more than one person.\n")
    for e, ids in sorted(emails.items(), key=lambda kv: -len(kv[1])):
        orgs = sorted({r["org"] for r in rows if r["id"] in ids})
        print(f"  {e or '(no address on record)':<34} {len(ids):>3} award(s)  {'; '.join(orgs)[:78]}")
    sys.exit("\nRe-run with SYN_EMAIL set to yours, or SYN_EMAIL=any if every address above "
             "is you (an institutional move puts one person under two).")

json.dump({"pi": PI, "email": EMAIL, "emails": {k: len(v) for k, v in emails.items()},
           "n_total": total, "skipped": skipped, "awards": rows},
          open("syn_awards.json", "w"), indent=1)

if not rows:
    print(f"{PI}: NSF returned {total} award(s) and none carries this name in its own PI or "
          f"co-PI list. NSF stores the formal given name -- 'Katie Bouman' returns nothing "
          f"and 'Katherine Bouman' returns her award -- so try the surname alone and pick "
          f"yourself from the addresses it lists.")
print(f"{PI}   {len(rows)} of {total} awards matched by name")
for role in ("PI", "former PI", "co-PI"):
    print(f"  as {role:<10} {sum(1 for r in rows if r['role']==role)}")
print(f"  NSF returned {len(skipped)} award(s) under a different name and they were dropped"
      + (f": {', '.join(skipped[:4])}" if skipped else ""))
print(f"  distinct e-mail addresses carrying this name: {len(emails)}  "
      + ", ".join(f"{e or '(none)'}×{n}" for e, n in
                  sorted(((e, len(v)) for e, v in emails.items()), key=lambda x: -x[1])))
wrong = [r for r in rows if r["lead_pi"] and r["lead_pi"].lower() != PI.lower()]
print(f"  awards whose lead PD/PI is somebody else: {len(wrong)}"
      + (f"  e.g. {wrong[0]['id']} led by {wrong[0]['lead_pi']}" if wrong else ""))
ids = {r["piId"] for r in rows if r["piId"]}
print(f"  distinct piId values across those awards: {len(ids)}  {sorted(ids)}")
```

## Your CV is the other half

An award record can only see funded work. Everything that makes a strong Synergistic
Activities page — students and postdocs mentored, courses built, editorial and review
service, standards committees, an open-source package you maintain unfunded, outreach that
never had a grant — exists only in your CV. In the sweep below the award record alone
filled at most five of NSF's nine kinds and usually two to four, and the empty ones are
named in the summary rather than quietly dropped.

Give it plain text. The parser wants headings and bullets, which is what a CV already is:

```text
Teaching and curriculum development
- Designed and taught an introductory data science course adopted by 4 departments; 612 students enrolled since 2019.

Mentoring and training
- Advised 10 postdoctoral fellows, 7 doctoral students, 3 master's students and 19 undergraduates since 2011.
```

Two judgements it makes, both of which the summary reports so you can overrule them. A
line that reads as a research result — a citation, a DOI, "we showed that" — is set aside,
because that is biographical-sketch material. And a line with no date, or dated "since
2019" or "2020-present", is treated as current: reading a lone year as a one-day activity
made every ongoing CV entry score as neither sustained nor recent, and the award record
then won every slot.

```python
# syn_cv.py -- pull candidate activities out of a plain-text CV.
import json, os, re, sys

SRC = os.environ.get("SYN_CV", "cv.txt")
OUT = os.environ.get("SYN_CV_JSON", "syn_cv.json")
SIG = json.load(open("syn_rules.json"))["signals"]

if not os.path.exists(SRC):
    # Not an error. The pipeline is designed to run without a CV; the summary says so.
    print(f"no {SRC} -- the award record alone will drive the document, and the "
          f"summary will name every kind of example that leaves unfilled")
    raise SystemExit(0)

# A CV entry is a research result or a community contribution, and only the second kind
# belongs here. NSF already has the first in the biographical sketch. These are the shapes
# a result takes in a CV: a citation, a finding, a preprint, a patent.
RESULT = re.compile(r"\b(19|20)\d\d\b.{0,40}\b(\d+)\s*[:(]|doi[:.]|arXiv|bioRxiv|"
                    r"\bet al\b|\bpp\.|\bvol\.|\bwe (show|demonstrat|report|find|found|establish)\w*\b|"
                    r"\bpatent\b|\bin press\b|\bsubmitted\b", re.I)
NOW = 2026
HEADING = re.compile(r"^\s*([A-Z][^.;]{2,60})\s*:?\s*$")
BULLET  = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$")

def vector(text, heading):
    v = {}
    for k, pat in SIG.items():
        rx = re.compile(pat, re.I)
        s = 3 * bool(rx.search(text)) + 2 * bool(rx.search(heading))
        if s: v[k] = s
    return v

lines = open(SRC, encoding="utf-8").read().split("\n")
heading, cands, dropped = "", [], []
for i, raw in enumerate(lines):
    ln = raw.rstrip()
    if not ln.strip():
        continue
    m = BULLET.match(ln)
    if not m:
        h = HEADING.match(ln)
        if h and len(ln.split()) <= 8:
            heading = h.group(1).strip()
        continue
    body = re.sub(r"\s+", " ", m.group(1)).strip()
    if RESULT.search(body):
        dropped.append((body, "reads as a research result -- that belongs in the biographical sketch"))
        continue
    v = vector(body, heading)
    if not v:
        dropped.append((body, "matches none of NSF's example kinds"))
        continue
    # "since 2011", "2020-present" and an undated line all mean current. Reading a lone
    # year as a one-day activity made every ongoing CV entry score as neither sustained
    # nor recent, and the award record then won every slot -- which is how mentoring,
    # editorial service and open-source maintenance vanished from the document.
    yrs = sorted(int(y) for y in re.findall(r"\b(19\d\d|20\d\d)\b", body))
    ongoing = bool(re.search(r"\b(since|present|ongoing|current|to date)\b", body, re.I)) or not yrs
    lo = yrs[0] if yrs else NOW
    hi = NOW if ongoing else yrs[-1]
    counts = re.findall(r"(\d[\d,]*)\s+([a-z][a-z-]{3,})", body, re.I)
    cands.append({"src": "cv", "ref": f"CV line {i+1}", "role": "CV", "former": False,
                  "title": body, "program": heading, "org": "",
                  "from": str(lo), "to": str(hi), "ongoing": ongoing,
                  "amount": 0, "counts": counts, "v": v})

json.dump({"source": SRC, "candidates": cands, "dropped": dropped}, open(OUT, "w"), indent=1)
print(f"{SRC}: {len(cands)} candidate activities, {len(dropped)} lines set aside")
for c in cands:
    n = ", ".join(f"{a} {b}" for a, b in c["counts"][:3]) or "no countable fact"
    print(f"  [{'/'.join(sorted(c['v'], key=lambda k: -c['v'][k])[:2]):<22}] {c['title'][:58]}")
    print(f"   {'':24} under {c['program']!r}; numbers: {n}")
for body, why in dropped[:4]:
    print(f"  set aside: {body[:52]:<54} {why[:46]}")
if len(dropped) > 4: print(f"  ... and {len(dropped)-4} more, all listed in the summary")
```

Run it against your own CV, and it feeds the rest of the pipeline. Run it against the
sample below to watch it work first — this writes to a different file, so it does not
enter the document:

```bash
cat > cv_example.txt <<'EOF'
Teaching and curriculum development
- Designed and taught an introductory data science course adopted by 4 departments; 612 students enrolled since 2019.
- Rewrote the graduate statistics sequence and released the course notes under CC-BY-4.0.

Mentoring and training
- Advised 10 postdoctoral fellows, 7 doctoral students, 3 master's students and 19 undergraduates since 2011.
- Ran a summer research training program for 24 community-college transfer students, 2021-2025.

Software and shared resources
- Maintain an open-source package for spectral deconvolution, 41 releases and 900 dependent repositories.

Community service
- Program chair, 2024 international meeting on measurement standards; 380 attendees from 22 countries.
- Member, national standards committee on reference materials, 2020-present.

Selected publications
- Smith A, Jones B, et al. Reference-free deconvolution. Nature Methods 21:1004-1012 (2024). doi:10.1038/s41592-024-00000-0
- We showed that the method recovers 94% of known components in benchmark mixtures.

EOF
SYN_CV=cv_example.txt SYN_CV_JSON=syn_cv_example.json .venv/bin/python syn_cv.py
```

## Candidates, and folding the renewals

Two steps, and the second is the one that keeps the five examples distinct. Each item is
scored against all nine kinds — the award **title** outweighs the **program** line, which
outweighs the abstract, because a program name says which pot of money paid for it while
the title says what it is. Then a run of items on the same subject is folded into one
activity, so a renewal cannot occupy a second slot.

```python
# syn_candidates.py -- award record (+ CV, if you ran syn_cv.py) -> candidate activities.
import json, os, re

R = json.load(open("syn_rules.json"))
A = json.load(open("syn_awards.json"))

KEYS, SIGNALS = R["keys"], R["signals"]

def year(d): return d.split("/")[-1] if d else ""

def vector(title, abstract, program):
    """Score every category. Title outweighs program: a program line says which pot of
    money paid for it, the title says what it is. 'Supporting a Community Building
    Meeting' funded out of the REU line is service, not undergraduate training, and
    weighting the program above the title got that one backwards."""
    v = {}
    for k, pat in SIGNALS.items():
        rx = re.compile(pat, re.I)
        s = 3 * bool(rx.search(title)) + 2 * bool(rx.search(program)) + bool(rx.search(abstract))
        if s: v[k] = s
    return v

cands = []
for a in A["awards"]:
    v = vector(a["title"], a["abstract"], a["program"])
    if not v: continue
    cands.append({"src": "award", "ref": a["id"], "role": a["role"], "former": a["former"],
                  "title": a["title"], "program": a["program"], "org": a["org"],
                  "from": year(a["start"]), "to": year(a["end"]),
                  "amount": a["amount"], "v": v})
if os.path.exists("syn_cv.json"):
    cands += json.load(open("syn_cv.json"))["candidates"]

# Collapse a run of awards that are one activity. NSF wants five DISTINCT examples, and a
# PI with four consecutive curriculum grants has one activity, not four. Group on the
# title's content words with NSF's own boilerplate stripped -- and group across categories,
# not within one, or a renewal that drifted into a different programme never merges.
# Compare against the group's SEED only, and on the proportion shared rather than a raw
# count. Both halves were found by running it: growing the group's vocabulary as members
# join makes merging transitive, and a bare "two words in common" merges anyone whose
# whole career is one subject. Together they collapsed nine of twelve activities -- an
# NSF-funded conference series, a state-wide alliance and a curriculum project -- into a
# single $5.1M blob that would have shipped as one example.
STOP = re.compile(r"^(collaborative|research|type|the|and|using|toward|towards|phase|from|with|"
                  r"cise|nsf|project|projects|new|special|based|into|through|their|that|this)$", re.I)
def stem(t):
    t = re.sub(r"^(collaborative research|type \w+|[A-Z]{2,}-?[A-Z]*)\s*:\s*", "", t, flags=re.I)
    return frozenset(w.lower() for w in re.findall(r"[A-Za-z]{4,}", t) if not STOP.match(w))

groups = []
for c in sorted(cands, key=lambda c: (-int(c.get("to") or 0), c["ref"])):
    s = stem(c["title"])
    for g in groups:
        ov = len(s & g["stem"])
        if ov >= 2 and ov / min(len(s), len(g["stem"])) >= 0.4:
            g["members"].append(c); break
    else:
        groups.append({"stem": s, "members": [c]})

# Four properties a reviewer can check, computed the same way whether the evidence is an
# NSF award or a CV line. Money is deliberately not one of them: a $27,500 award that put
# a conference within reach of students is not a smaller broader impact than a $4M centre,
# and ranking on dollars means the award record silently outbids every CV line.
REACH = re.compile(r"national|international|statewide|state-wide|nationwide|alliance|"
                   r"consorti|societ|community|multi-institution|countries|k-12|"
                   r"across .{0,20}(universit|colleg|school|state)", re.I)
LED   = re.compile(r"\b(chair|chaired|director|founder|founded|lead|leads|led|organi[sz]ed?|"
                   r"principal|maintain|maintains|convener|editor-in-chief|advised|mentored)\b", re.I)
NOW = 2026

acts = []
for i, g in enumerate(groups):
    m = g["members"]
    v = {}
    for c in m:
        for k, s in c["v"].items(): v[k] = v.get(k, 0) + s
    yrs = [int(x[f]) for x in m for f in ("from", "to") if x[f].isdigit()]
    span = [min(yrs), max(yrs)] if yrs else None
    blob = " ".join(x["title"] + " " + x["program"] for x in m)
    acts.append({"i": i, "lead": m[0], "refs": [x["ref"] for x in m], "n": len(m),
                 "span": span, "amount": sum(x["amount"] for x in m),
                 "roles": sorted({x["role"] for x in m}),
                 "srcs": sorted({x["src"] for x in m}),
                 "sustained": (len(m) >= 2 or bool(span and span[1] - span[0] >= 3)
                               or any(int(n.replace(",", "")) >= 3
                                      for x in m for n, _ in x.get("counts", []))),
                 "specific": any(x["amount"] for x in m) or bool(re.search(r"\d", blob)),
                 "recent":   bool(span and span[1] >= NOW - 10),
                 "reach":    bool(REACH.search(blob)) or len({x["org"] for x in m if x["org"]}) > 1,
                 "led":      "PI" in {x["role"] for x in m} or bool(LED.search(blob)),
                 "v": v, "top": sorted(v, key=lambda k: (-v[k], KEYS.index(k)))})
json.dump({"keys": KEYS, "labels": R["categories"], "signals": SIGNALS, "activities": acts},
          open("syn_candidates.json", "w"), indent=1)

print(f"{len(cands)} candidate items -> {len(acts)} distinct activities "
      f"({len(cands) - len(acts)} folded into an earlier one)")
spread = {}
for a in acts: spread[a["top"][0]] = spread.get(a["top"][0], 0) + 1
print("first-choice category spread: " + "  ".join(f"{k}×{n}" for k, n in sorted(spread.items())))
print(f"\n{'top choices':<28}{'n':>3}  {'span':<11}{'total':>12}  lead item")
for a in sorted(acts, key=lambda a: (-a["v"][a["top"][0]], a["lead"]["ref"])):
    sp = f"{a['span'][0]}-{a['span'][1]}" if a["span"] else ""
    print(f"{'/'.join(a['top'][:3]):<28}{a['n']:>3}  {sp:<11}{a['amount']:>12,}  {a['lead']['title'][:52]}")
if not os.path.exists("syn_cv.json"):
    print("\nNo syn_cv.json -- every candidate here comes from NSF's award record alone.")
```

## Choosing five

The selection is an assignment, not a ranking: at most one activity per kind, at most
five in total, maximising the total over every legal assignment. Written as a ranking it
degenerates immediately — a researcher whose whole career is one subject scores every
activity into the same kind, and the top five are then five versions of the same example.

The value of an activity in a kind is its fit plus five properties a reviewer can check:
sustained, carries a number, recent, reached past your own institution, and you led it.
**Dollar value is deliberately not one of them.** A $27,500 award that put a conference
within reach of students is not a smaller broader impact than a $4M centre, and ranking on
money means the award record outbids every line of the CV — which is how mentoring,
editorial service and unfunded software vanished from the document on the first run.

```python
# syn_select.py -- which five, and why not the others.
import json

C = json.load(open("syn_candidates.json"))
R = json.load(open("syn_rules.json"))
KEYS, ACTS, MAX = C["keys"], C["activities"], R["max_examples"]

def value(a, k):
    """Fit to NSF's own wording, plus five properties a reviewer can check. No term
    rewards how impressive it sounds, and none rewards how much it cost -- ranking on
    dollars lets the award record outbid every line of the CV, and the mentoring,
    editorial and open-source work that only the CV knows about never gets picked."""
    v = a["v"].get(k, 0)
    # A hit in the abstract alone (weight 1) is not evidence of what an activity IS --
    # award abstracts mention everything a project touches. Without this floor the
    # assignment fills a spare slot with whatever grazed it, and the document claims a
    # kind of broader impact the entry does not demonstrate.
    if v < 2: return 0
    return v + 3 * a["sustained"] + 2 * a["specific"] + 2 * a["recent"] \
             + 2 * a["reach"] + 1 * a["led"]

# At most one activity per category, at most five in total. Exact, over 2^9 category
# subsets -- distinctness is a stated NSF requirement, so it is a constraint on the
# assignment rather than a tie-breaker applied afterwards.
best = {(0, 0): (0, [])}
for a in ACTS:
    nxt = dict(best)
    for (mask, used), (score, picks) in best.items():
        if used >= MAX: continue
        for k in a["top"]:
            bit = 1 << KEYS.index(k)
            if mask & bit: continue
            s = score + value(a, k)
            key = (mask | bit, used + 1)
            if s > nxt.get(key, (-1, None))[0]:
                nxt[key] = (s, picks + [(a["i"], k)])
    best = nxt
score, picks = max(best.values(), key=lambda x: (x[0], -len(x[1])))
by_i = {a["i"]: a for a in ACTS}
chosen = [{"cat": k, "act": by_i[i], "value": value(by_i[i], k)} for i, k in picks]
chosen.sort(key=lambda c: -c["value"])

taken = {c["cat"] for c in chosen}
kept  = {c["act"]["i"] for c in chosen}
cut = []
for a in ACTS:
    if a["i"] in kept: continue
    free = [k for k in a["top"] if k not in taken]
    cut.append({"act": a, "best": a["top"][0], "value": max(value(a, k) for k in a["top"]),
                "why": ("every category it fits is already used by a stronger example"
                        if not free else
                        f"a weaker fit than the five kept; its strongest free framing was {free[0]}")})
cut.sort(key=lambda c: -c["value"])

json.dump({"chosen": chosen, "cut": cut, "score": score,
           "unused_categories": [k for k in KEYS if k not in taken]},
          open("syn_selected.json", "w"), indent=1)

print(f"{len(chosen)} of {MAX} slots filled, {len(cut)} candidates cut\n")
print(f"{'#':<3}{'category':<15}{'val':>4}  {'span':<11}{'awards':>7}{'total':>12}  lead item")
for n, c in enumerate(chosen, 1):
    a, sp = c["act"], c["act"]["span"]
    print(f"{n:<3}{c['cat']:<15}{c['value']:>4}  "
          f"{f'{sp[0]}-{sp[1]}' if sp else '':<11}{a['n']:>7}{a['amount']:>12,}  {a['lead']['title'][:44]}")
print("\ncut, strongest first:")
for c in cut[:6]:
    print(f"  [{c['best']:<13}] {c['act']['lead']['title'][:48]:<50} {c['why'][:44]}")
if len(cut) > 6: print(f"  ... and {len(cut)-6} more, all listed in the summary")
print(f"\ncategories nothing was assigned to: {', '.join(json.load(open('syn_selected.json'))['unused_categories'])}")
```

## The document

Markdown, so you can edit it and re-render. Every word of substance in it is either an NSF
award title, an NSF program name, a figure from the award record, or a line of your own
CV. Nothing is paraphrased and nothing is invented, which is a deliberate limit and not a
stylistic one: this is a compliance document, and a draft that writes claims for you is a
draft you have to fact-check line by line.

The prose is flat as a result. Rewrite it in your own voice before you submit — and keep
the numbers, which are the part doing the work.

```python
# syn_write.py -- the deliverable. Markdown, so you can edit it and re-render.
import json, os, re

R = json.load(open("syn_rules.json"))
S = json.load(open("syn_selected.json"))
C = json.load(open("syn_candidates.json"))
NAME = os.environ["SYN_NAME"]
ORG  = os.environ.get("SYN_ORG", "")
NUM  = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven"}

def short(t, n=88):
    """A name for the activity, taken from NSF's own award title. NSF titles carry
    stacked submission labels -- 'Collaborative Research:  Special Projects (CNS):
    BPC-A:' -- so strip leading label segments while they stay short, then cut on a
    clause boundary rather than mid-phrase. Nothing is added; every word was already
    in the award record."""
    t = re.sub(r"\s+", " ", t).strip()
    while ":" in t[:46]:
        head, rest = t.split(":", 1)
        # Stop before the strip leaves a fragment. 'Exploiting Parallelism: ...' became
        # the single word "Exploiting", which names nothing.
        if len(head.split()) > 6 or len(rest.split()) < 4: break
        t = rest.strip()
    t = re.split(r"\s+[-–—]\s+", t)[0].strip(" .,;")
    if len(t) > n:
        cut = re.split(r",|\bfor\b|\bthrough\b|\busing\b", t)[0].strip(" .,;")
        if len(cut.split()) >= 4: t = cut
    if len(t) > n:
        t = t[:n].rsplit(" ", 1)[0].rstrip(" .,;:")
    return (t[0].upper() + t[1:]) if t else t

def program(a, cat):
    """`fundProgramName` is several program names joined with commas, not one. Show the
    one matching the category this example was chosen for -- and show nothing at all
    where NSF's string is an internal all-caps abbreviation ("BROADENING PARTIC IN
    COMPUTING"). Expanding it would be writing text NSF's record does not contain."""
    names = [re.sub(r"\s+Progs?$", "", p.strip()) for p in (a["lead"]["program"] or "").split(",")]
    names = [p for p in names if p and not (" " in p and p.upper() == p)]
    rx = re.compile(C["signals"][cat], re.I)
    return next((p for p in names if rx.search(p)), names[0] if names else "")

ROLE = {"PI": "Principal investigator", "former PI": "Founding principal investigator",
        "co-PI": "Co-principal investigator"}

def split_cv(line):
    """A CV line is already the claim, in the researcher's own words -- reproduce it, do
    not paraphrase, because paraphrasing a compliance document invents facts. Break it
    once so the lead-in and the detail do not repeat each other: at a semicolon, or at
    the comma where the countable facts start."""
    line = line.strip().rstrip(".")
    m = re.search(r";\s*", line) or re.search(r",\s+(?=\d)", line)
    if m and len(line[:m.start()].split()) >= 3 and len(line[m.end():].split()) >= 2:
        head, tail = line[:m.start()], line[m.end():]
        return head.rstrip(" ,;") + ".", tail[0].upper() + tail[1:] + "."
    return line + ".", ""

def sentence(c):
    a, sp = c["act"], c["act"]["span"]
    if a["srcs"] == ["cv"]:
        return split_cv(a["lead"]["title"])[1]
    r = min(a["roles"], key=lambda x: ["PI", "former PI", "co-PI", "CV"].index(x))
    s = (f"{ROLE.get(r, 'Contributor')} on {NUM.get(a['n'], a['n'])} NSF "
         f"award{'s' if a['n'] > 1 else ''}")
    if a["lead"]["org"]: s += f" at {a['lead']['org']}"
    if sp: s += f", {sp[0]}–{sp[1]}" if sp[0] != sp[1] else f", {sp[0]}"
    if a["amount"]: s += f", ${a['amount']:,} awarded"
    p = program(a, c["cat"])
    if p: s += f", under NSF's {p} program"
    return s + f" (NSF {', '.join(a['refs'])})."

lines = [f"# Synergistic Activities — {NAME}"]
if ORG: lines.append(ORG)
lines.append("")
for i, c in enumerate(S["chosen"], 1):
    a = c["act"]
    lead = split_cv(a["lead"]["title"])[0] if a["srcs"] == ["cv"] \
        else short(a["lead"]["title"]) + "."
    lines.append(f"{i}. **{lead}** {sentence(c)}".rstrip())
    lines.append("")
md = "\n".join(lines).rstrip() + "\n"
open("synergistic_activities.md", "w").write(md)
print(md)
print(f"--- {len(S['chosen'])} entries, {len(md.split())} words")
```

## Render it, and measure the page

The one-page limit is the whole difficulty of the document, and it is not enforced
anywhere else in the process. So the flowed text is measured against the frame **before**
the file is written, and compressed in the order that costs a reader least: the space
between entries, then the leading down to NSF's own floor of six lines per inch, then —
last — dropping the lowest-ranked example, which is legitimate because NSF says *up to*
five. Dropping one restores the others' spacing. Font size, leading floor and margins are
never traded, because those are the rules.

One thing about `reportlab` that is invisible and would ship: without `initialFontName`
every canvas opens in Helvetica, and the finished PDF declares and selects a typeface NSF
allows only to Macintosh users, even though nothing is drawn in it.

```python
# syn_render.py -- Markdown -> the PDF NSF receives, measured against the one-page limit.
import json, re, sys
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from pypdf import PdfReader

R = json.load(open("syn_rules.json"))
S = json.load(open("syn_selected.json"))

# PAPPG II.C.2, read out of NSF's page by syn_rules.py. These are floors, not defaults:
# Times New Roman at 11pt or larger; no more than six lines of text per vertical inch,
# so leading may never go below 12pt; margins at least an inch in all directions; paper
# no larger than letter. Nothing below compresses past any of them.
FONT, SIZE, MARGIN = "Times-Roman", 11, 1 * inch
LEAD_MAX, LEAD_MIN = 13.2, 12.0
FRAME_H = LETTER[1] - 2 * MARGIN
FRAME_W = LETTER[0] - 2 * MARGIN

def esc(s):
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)

def parse(path):
    head, entries = [], []
    for ln in open(path).read().split("\n"):
        ln = ln.rstrip()
        if not ln: continue
        m = re.match(r"^(\d+)\.\s+(.*)$", ln)
        if m: entries.append(m.group(2))
        elif ln.startswith("# "): head.append(("title", ln[2:]))
        elif not entries: head.append(("org", ln))
    return head, entries

def flow(head, entries, lead, gap):
    st_t = ParagraphStyle("t", fontName="Times-Bold", fontSize=SIZE + 1, leading=lead)
    st_o = ParagraphStyle("o", fontName=FONT, fontSize=SIZE, leading=lead)
    st_e = ParagraphStyle("e", fontName=FONT, fontSize=SIZE, leading=lead,
                          leftIndent=18, firstLineIndent=-18)
    out = []
    for kind, txt in head:
        out.append(Paragraph(esc(txt), st_t if kind == "title" else st_o))
    out.append(Spacer(1, gap * 2))
    for i, e in enumerate(entries, 1):
        out.append(Paragraph(f"{i}. {esc(e)}", st_e))
        out.append(Spacer(1, gap))
    return out[:-1]

def height(story):
    h = 0
    for f in story:
        h += f.wrap(FRAME_W, FRAME_H)[1] if isinstance(f, Paragraph) else f.height
    return h

head, entries = parse("synergistic_activities.md")
assert len(entries) <= R["max_examples"], f"{len(entries)} entries, NSF allows {R['max_examples']}"
# A Synergistic Activities document with no examples is not a compliant short document,
# it is an empty required attachment. Three names in the sweep produced one -- a header
# and nothing else -- and every check downstream passed it, because a rule written as
# "at most five" is satisfied by zero.
if not entries:
    sys.exit("no examples to render. NSF's award record holds nothing for this name that "
             "matches any of its nine example kinds -- run syn_cv.py against a CV and "
             "re-run, or write the five examples by hand.")

# Compress in the order that costs a reader least, and stop at the first fit. Dropping an
# example is last, and it is legitimate: NSF says "up to five", so four distinct examples
# on one page is compliant and five that overflow is not.
log, lead, gap = [], LEAD_MAX, 6
while True:
    story = flow(head, entries, lead, gap)
    if height(story) <= FRAME_H: break
    if gap > 0:
        gap = max(0, gap - 3); log.append(f"space between entries -> {gap}pt")
    elif lead > LEAD_MIN:
        lead = LEAD_MIN; log.append(f"leading -> {lead}pt (6 lines/inch, NSF's floor)")
    elif len(entries) > 1:
        log.append(f"dropped example {len(entries)}, the lowest ranked")
        entries.pop()
        lead, gap = LEAD_MAX, 6      # a dropped example buys the rest their spacing back
    else:
        sys.exit("a single example will not fit one page at NSF's minimum font -- cut it by hand")

# initialFontName is not cosmetic. Without it reportlab opens every canvas in
# Helvetica, and the finished PDF declares and selects a typeface PAPPG allows only
# to Macintosh users -- invisibly, because nothing is drawn in it. syn_check.py reads
# the font list back out of the file rather than trusting this line.
SimpleDocTemplate("synergistic_activities.pdf", pagesize=LETTER,
                  topMargin=MARGIN, bottomMargin=MARGIN,
                  leftMargin=MARGIN, rightMargin=MARGIN,
                  initialFontName=FONT, initialFontSize=SIZE,
                  title="Synergistic Activities", author="", subject="", creator="",
                  ).build(flow(head, entries, lead, gap))
if log:  # the .md and the .pdf must not disagree about what was submitted
    open("synergistic_activities.md", "w").write(
        "\n".join([f"# {head[0][1]}"] + [t for k, t in head[1:]] + [""]
                  + [f"{i}. {e}\n" for i, e in enumerate(entries, 1)]).rstrip() + "\n")

pdf = PdfReader("synergistic_activities.pdf")
box = pdf.pages[0].mediabox
used = height(flow(head, entries, lead, gap))
json.dump({"pages": len(pdf.pages), "entries": len(entries), "lead": lead, "gap": gap,
           "used_in": round(used / 72, 2), "trims": log},
          open("syn_render.json", "w"), indent=1)
print(f"synergistic_activities.pdf   {len(pdf.pages)} page(s), "
      f"{float(box.width)/72:.1f}x{float(box.height)/72:.1f} in, {len(entries)} examples")
print(f"  {FONT} {SIZE}pt, {lead}pt leading = {72/lead:.2f} lines/inch (NSF's ceiling is 6)")
print(f"  text block {used/72:.2f} of {FRAME_H/72:.2f} available inches "
      f"({used/FRAME_H*100:.0f}% of the page)")
for t in log: print(f"  compressed: {t}")
if not log: print("  compressed: nothing -- it fit at first pass")
```

## Check it before you upload

Read the finished file, do not trust the code that wrote it. Page count, paper size,
typefaces and point sizes all come back out of the PDF; the margin check adds the text
matrix to the CTM, because `pypdf` reports them separately and a check built on the text
matrix alone reads `0.00` for text sitting an inch and a half in and passes anything.

```python
# syn_check.py -- prove the PDF, do not trust the renderer that wrote it.
import json, re, sys
from pypdf import PdfReader
from reportlab.pdfbase.pdfmetrics import stringWidth

R = json.load(open("syn_rules.json"))
S = json.load(open("syn_selected.json"))
D = json.load(open("syn_render.json"))
MD = open("synergistic_activities.md").read()

# PAPPG II.C.2. Helvetica and Palatino are on the list for Macintosh users only
# (footnote 7); a PDF carries no record of the machine that made it, so this skill
# stays inside the unconditional set.
OK_FONTS = {"Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
            "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"}
MIN_PT   = {"Times": 11, "Courier": 10}
PROMO = re.compile(r"\b(groundbreaking|ground-breaking|world[- ]class|world[- ]renowned|"
                   r"pioneering|cutting[- ]edge|seminal|renowned|prestigious|unparalleled|"
                   r"unprecedented|revolutionary|first[- ]ever|state[- ]of[- ]the[- ]art|"
                   r"transformative|tireless|passionate|exceptional|outstanding|"
                   r"internationally[- ]recogni[sz]ed|leading expert)\b", re.I)
VAGUE = re.compile(r"\b(extensive|numerous|many|several|various|significant|substantial|"
                   r"a number of|countless|widely)\b", re.I)
PLACE = re.compile(r"\bTBD\b|\bTODO\b|\bN/?A\b|\bXXX+\b|\[\s*(fill|insert|your|name|add)\b|"
                   r"<[^>]*(name|insert|your)[^>]*>|Lorem ipsum", re.I)

pdf  = PdfReader("synergistic_activities.pdf")
page = pdf.pages[0]
W, H = float(page.mediabox.width), float(page.mediabox.height)
text = "\n".join(p.extract_text() for p in pdf.pages)

# The visitor hands back the text matrix and the CTM separately, and reportlab puts the
# page translation in the CTM -- so tm[4] alone reads 0.00 for text sitting an inch and a
# half in, and a margin check built on it passes whatever the file contains. Add them.
runs = []
def visit(t, cm, tm, fd, size):
    if t.strip():
        runs.append({"t": t, "x": cm[4] + tm[4], "y": cm[5] + tm[5], "size": size})
page.extract_text(visitor_text=visit)

fonts = {v.get_object().get("/BaseFont", "").lstrip("/")
         for v in (page.get("/Resources", {}).get("/Font", {}) or {}).values()}
sizes = {round(r["size"], 1) for r in runs}
# Horizontal fit is checked at the source rather than in the PDF: the visitor reports
# every fragment of a wrapped line at the same origin, so a right-hand edge measured
# from it is fiction. What can actually run past the right margin is a single token too
# wide to break -- a long URL, a run-on award title -- so measure the widest token.
FRAME_W = W - 144
widest = max(((stringWidth(w, "Times-Roman", 11), w) for w in MD.split()), default=(0, ""))
entries = re.findall(r"^\s*(\d+)\.\s", MD, re.M)
cats = [c["cat"] for c in S["chosen"]]

checks = [
 ("exactly one page",                     len(pdf.pages) == 1),
 ("letter paper or smaller",              W <= 612.1 and H <= 792.1),
 (f"between one and {R['max_examples']} examples",
                                          1 <= len(entries) <= R["max_examples"]),
 ("every example is a distinct kind",     len(set(cats)) == len(cats)),
 ("only PAPPG-approved typefaces",        fonts and fonts <= OK_FONTS),
 ("no font below NSF's minimum",          all(s >= MIN_PT["Times"] for s in sizes)),
 ("at most six lines per vertical inch",  72 / D["lead"] <= 6.0001),
 ("nothing drawn inside the left or top/bottom margin",
                                          all(r["x"] >= 71.99 and r["y"] >= 71.99 and
                                              r["y"] + r["size"] <= H - 71.99 for r in runs)),
 ("no token too wide to stay inside the right margin", widest[0] <= FRAME_W),
 ("no page number",                       not re.search(r"^\s*\d+\s*$", text, re.M)),
 ("no placeholder text",                  not PLACE.search(text)),
 ("no promotional adjectives",            not PROMO.search(text)),
 ("every example carries a number",       all(re.search(r"\d", e) for e in
                                              re.findall(r"^\s*\d+\.\s+(.*)$", MD, re.M))),
 ("the .md and the .pdf agree",           len(entries) == D["entries"]),
]
print(f"synergistic_activities.pdf   {len(pdf.pages)} page, {W/72:.1f}x{H/72:.1f} in, "
      f"{len(entries)} examples, fonts {sorted(fonts)}, sizes {sorted(sizes)}pt")
# A vague quantifier the skill wrote is padding; the same word inside an NSF award title
# is NSF's wording, and failing on it would refuse a document that quotes the record
# faithfully. So it is reported, with the word, rather than treated as a defect.
vague = sorted({m.group(0) for m in VAGUE.finditer(text)}, key=str.lower)
bad = 0
for label, ok in checks:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    bad += not ok
if bad:
    sys.exit(f"{bad} check(s) failed -- do not upload this file")
if vague:
    print(f"\n  NOTE  vague quantifier(s) carried over from the source text: "
          f"{', '.join(vague)} — replace each with the number it stands for, or cut it.")
print(f"\ntightest measured margin {min(min(r['x'], r['y'], H - r['y'] - r['size']) for r in runs)/72:.2f} in "
      f"(floor 1.00)   widest single token {widest[0]/72:.2f} in of {FRAME_W/72:.2f} — {widest[1][:28]!r}")
```

## Write the summary

The PDF carries no notes, no placeholders and no instructions — a field this cannot answer
is left genuinely empty, and every empty one is named here instead. This file is where you
correct what it misread, which is what turns one shot you have to clean up into an exchange
you can steer.

```python
# syn_summary.py -- the summary lives beside the PDF, never inside it.
import datetime as dt, json, os

R = json.load(open("syn_rules.json"))
A = json.load(open("syn_awards.json"))
C = json.load(open("syn_candidates.json"))
S = json.load(open("syn_selected.json"))
D = json.load(open("syn_render.json"))
V = json.load(open("syn_cv.json")) if os.path.exists("syn_cv.json") else None
LBL = dict(zip(C["keys"], C["labels"]))
NAME = os.environ["SYN_NAME"]

def src(a): return "your CV" if a["srcs"] == ["cv"] else f"NSF {', '.join(a['refs'])}"

L = [f"# Synergistic Activities draft for {NAME} — what to check before you submit", "",
     f"Built {dt.date.today()} against PAPPG {R['pappg']} {R['section']}, read from NSF's own "
     f"page the same day. One page, up to {R['max_examples']} distinct examples, prepared "
     f"outside SciENcv and uploaded as its own PDF.", "",
     "**This is a draft. NSF holds you, not this file, responsible for what it says.**", "",
     "## Proposed", "",
     f"{len(S['chosen'])} example(s), each covering a different one of the nine kinds NSF names, "
     f"strongest first:", ""]
for i, c in enumerate(S["chosen"], 1):
    a = c["act"]
    L.append(f"{i}. *{LBL[c['cat']]}* — from {src(a)}"
             + (f", {a['span'][0]}–{a['span'][1]}" if a["span"] else "")
             + (f", ${a['amount']:,}" if a["amount"] else "") + ".")
L += ["", "## Inferred", "",
      f"- Award evidence: NSF's public award record for the name {A['pi']!r} — "
      f"{len(A['awards'])} of {A['n_total']} awards NSF returned carried that name in the "
      f"award's own PI or co-PI list"
      + (f"; {len(A['skipped'])} came back under a different name and were dropped." if A["skipped"]
         else ". NSF's name search is loose, so that filter is doing real work on common names."),
      f"- Roles: read from the award's `pi` and `coPDPI` lists, not from `piLastName`. "
      f"{sum(1 for r in A['awards'] if r['role']!='PI')} of them are yours as a co-PI or as an "
      f"earlier PD/PI, and would have been missed by matching the lead investigator's name.",
      f"- Which NSF example kind each activity demonstrates: matched on the words NSF puts in "
      f"its own program names and award titles. The award title outweighs the program line.",
      f"- {len(C['activities'])} distinct activities from "
      f"{len(C['activities']) + sum(len(a['refs']) - 1 for a in C['activities'])} items: a run of "
      f"awards sharing a subject was folded into one activity, because a renewal is the same "
      f"activity continued, not a second example.",
      (f"- CV: {len(V['candidates'])} candidate lines read from {V['source']!r}; "
       f"{len(V['dropped'])} set aside." if V else
       "- No CV was supplied, so every example here comes from NSF's award record alone."),
      "", "## Decided on your behalf", "",
      f"- **One example per kind.** NSF requires the examples to be distinct, so the five slots "
      f"are assigned to five different kinds from NSF's own list. A stronger candidate was "
      f"passed over wherever its only framing was already taken.",
      f"- **Ranked on what a reviewer can check** — whether the activity was sustained, whether "
      f"it carries a number, whether it is recent, whether it reached past your own institution, "
      f"and whether you led it. Not on the dollar value: ranking on money lets the award record "
      f"outbid every line of a CV.",
      f"- **Format.** PAPPG does not set a typeface for this document specifically, so the "
      f"general proposal rules apply: Times New Roman 11pt, {D['lead']}pt leading "
      f"({72/D['lead']:.2f} lines per inch against NSF's ceiling of six), one-inch margins, "
      f"letter paper, no page number. Arial, Courier New and Palatino Linotype at 10pt are "
      f"equally compliant; Helvetica and Palatino are on NSF's list for Macintosh users only, "
      f"and a PDF does not record which machine made it, so neither is used here.",
      f"- **Name and organisation at the top.** PAPPG specifies no header for this document. "
      f"A reader who receives it detached from the proposal needs to know whose it is.",
      f"- **NSF's abbreviated program strings are omitted rather than expanded.** "
      f"\"BROADENING PARTIC IN COMPUTING\" is how NSF stores it; writing it out would be adding "
      f"text the record does not contain.",
      "", "## Left blank, deliberately", ""]
L += [f"- **{LBL[k]}** — nothing in the evidence matched it." for k in S["unused_categories"]]
if not V:
    L.append("- **Everything a CV knows and an award record does not**: students and postdocs "
             "mentored, courses built, editorial and review service, standards committees, "
             "software you maintain unfunded, outreach that never had a grant. Run `syn_cv.py` "
             "against your CV and re-run; those are usually the strongest examples on the page.")
if D["trims"]:
    L += ["", "## Compressed to fit one page", ""] + [f"- {t}" for t in D["trims"]]
L += ["", "## Outstanding — your call", ""]
weak = S["chosen"][-1]
L += [f"- **Example {len(S['chosen'])} is the weakest kept**, covering *{LBL[weak['cat']]}*. "
      f"It scored {weak['value']} against {S['chosen'][0]['value']} for the first. NSF says *up to* "
      f"five — four strong examples beat five where one is filler."]
L += [f"- **{len(S['cut'])} candidates were cut.** The strongest, and why:"]
for c in S["cut"][:5]:
    L.append(f"  - {c['act']['lead']['title'][:76]} — {c['why']}.")
L += [f"- **Only NSF-funded activity is visible here.** DOE, NIH, foundation, institutional and "
      f"unfunded work is equally eligible and is in no NSF record.",
      f"- **NSF's award search matches a name, not a person.** "
      + (f"{len(A['emails'])} distinct e-mail addresses carry this name in the record"
         f" ({', '.join(A['emails'])}), so more than one person may be mixed in here — set "
         f"`SYN_EMAIL` and re-run." if len(A["emails"]) > 1 else
         "One e-mail address carries this name across every award matched, which is the "
         "strongest evidence available that they are all yours."),
      f"- **The wording is deliberately flat.** Every sentence is assembled from NSF's own award "
      f"record or your own CV line, so nothing here is a claim this draft invented. Rewrite it in "
      f"your voice before you submit — and keep the numbers, which are the part that does the work.",
      f"- **The biographical sketch is a different document.** Anything that is a scientific "
      f"result belongs there, not here. This draft drops CV lines that read as findings; check "
      f"that it did not drop one you meant to keep.", "",
      "## Before you upload", "",
      f"- {R['submit']}",
      f"- One Synergistic Activities document per senior/key person. This is one, for {NAME}.",
      f"- It is prepared outside SciENcv. Only the biographical sketch and current and pending "
      f"(other) support go through SciENcv; this one does not, and there is no certification "
      f"step on it.",
      f"- NSF's published automated compliance checks predate this document and do not test its "
      f"page count. Nothing at submission will stop an overflowing file — which is why "
      f"`syn_check.py` reads the page count out of the finished PDF.", ""]
open("synergistic-activities-summary.md", "w").write("\n".join(L))
print(f"synergistic_activities.pdf         {D['pages']} page, {D['entries']} examples")
print(f"synergistic_activities.md          editable source, re-render with syn_render.py")
print(f"synergistic-activities-summary.md  {len(L)} lines, "
      f"{sum(1 for l in L if l.startswith('## '))} sections")
```

## Run the whole thing

```bash
for s in syn_rules syn_awards syn_cv syn_candidates syn_select syn_write syn_render syn_check syn_summary; do
  .venv/bin/python $s.py || exit 1
done
```

You get three files: `synergistic_activities.pdf` to upload,
`synergistic_activities.md` to edit and re-render, and
`synergistic-activities-summary.md` to read first.

## Rendering with pandoc instead

If you would rather edit the Markdown and render it with pandoc and XeLaTeX, this
produces a compliant page from the same source. It needs pandoc and a TeX distribution
installed, and a real Times New Roman on the system.

```bash
pandoc synergistic_activities.md -o synergistic_activities.pdf \
  --pdf-engine=xelatex -V geometry:margin=1in \
  -V mainfont="Times New Roman" -V fontsize=11pt -V pagestyle=empty
pdfinfo synergistic_activities.pdf | grep -E '^Pages|^Page size'
pdftotext synergistic_activities.pdf - | grep -nE '^\s*[0-9]+\s*$' && echo "PAGE NUMBER PRESENT" || echo "no page number"
```

Two traps in that command line. `-V pagestyle=empty` is required — the default article
class prints a page number, and PAPPG says to leave it out. And **do not add
`-V numbersections=false`**: pandoc treats any non-empty value as true, so that flag turns
numbering *on* and puts a stray "1" in front of your name. Omit the variable entirely.
`pdfinfo` reports the page count; if it says 2, cut an example rather than shrinking the
type.

## How this behaves on other names

Measured 2026-08-28 across seventeen runs on fourteen real NSF investigators, spanning career
stages, common and rare surnames, hyphenated surnames, diacritics and name variants. Every
document produced was one page and passed every check; what varies is how many of NSF's
nine kinds the award record can fill, and whether the record can be attributed to one
person at all.

| subject | awards | kinds filled | note |
|---|---|---|---|
| Mark Guzdial | 23 | 5 | 23 awards fold to 18 activities; fills five kinds |
| Juan Gilbert | 20 | 5 | five kinds from the award record alone |
| Carlos Castillo-Chavez | 21 | 5 | the only subject whose record filled *international* |
| Carl Wieman | 15 | 4 | **refused** until told the two addresses are one person |
| Ayanna Howard | 17 | 4 | common surname, single address, no ambiguity |
| Ran Libeskind-Hadas | 9 | 4 | hyphenated surname, matched whole |
| Wei Wang | 54 → 17 | 4 | **refused**; eight people hold awards under the name |
| David Lee | 36 | — | **refused**; twelve people hold awards under the name |
| Nergis Mavalvala | 9 | 2 | large-facility PI — the record is research awards |
| Tapan Parikh | 5 | 2 | mid-career |
| José Zayas-Castro | 3 | 2 | **zero** until the accent is folded away |
| Maria Garcia | 3 → 1 | 1 | two of NSF's three hits are a different person |
| Manu Prakash | 2 | 1 | one example is a compliant document and a thin one |
| Katherine Bouman | 1 | 0 | **refused** — one research award, nothing to draft |

Four behaviours worth knowing before you run it on your own name.

- **A shared name refuses rather than guesses.** Eight different people hold NSF awards
  under *Wei Wang* and twelve under *David Lee*. The e-mail address NSF published on each
  award is the only public evidence separating them, so more than one address means the
  run stops and prints the addresses with their institutions. Set `SYN_EMAIL` to yours, or
  `SYN_EMAIL=any` where an institutional move has put one person under two — which is what
  *Carl Wieman* is. A page of somebody else's broader impacts is worse than no page.
- **NSF's name search is loose and its records are unaccented.** Searching *Maria Garcia*
  returns *MARIA J GARCIA-GARCIA*, whose awards are dropped by the name filter. Searching
  *José Zayas-Castro* returns nothing at all while *Jose Zayas-Castro* returns his three
  awards, so the accent is folded away and retried before a zero is believed. And NSF
  holds the formal given name — *Katie Bouman* returns nothing, *Katherine Bouman* returns
  her award.
- **An empty result is a refusal, not an empty document.** Three names in the first sweep
  produced a one-page PDF containing a header and nothing else, and every check passed it,
  because "at most five examples" is satisfied by zero. It now stops and says so.
- **The award record is a floor, not the document.** Nine of the twelve subjects that
  produced a document filled
  four kinds or fewer from NSF's record alone. The gap is what the CV is for, and the
  summary lists every unfilled kind by NSF's own wording.

## What this cannot determine

State these to the senior person every time. They are why the output is a draft.

- **Anything not funded by NSF.** DOE, NIH, foundation, institutional and entirely unfunded
  activity is equally eligible and appears in no NSF record. Most people's strongest
  examples — mentoring, editorial service, standards work, open-source maintenance — are
  in this category.
- **Whether a namesake is you.** Where more than one address carries the name the run
  refuses, and the refusal is the answer.
- **Whether an example is at the right altitude.** NSF asks for the *broader impact* of an
  activity. This assembles the countable facts about it; whether the framing is the one a
  reviewer in your directorate will recognise is a judgement no record contains.
- **Whether a CV line is a result or a contribution.** The boundary against the
  biographical sketch is drawn on the shape of the sentence — a citation, a DOI, "we
  showed that". A finding written as a contribution will pass, and a contribution written
  as a finding will be set aside. The summary lists both, so check it.
- **What your reviewers already know.** An example that duplicates the project description
  or the biographical sketch spends a slot on nothing, and nothing here can see either
  document.
- **The right voice.** Every sentence is assembled from records rather than written, which
  is what makes it safe and what makes it flat.

## Try it

**Data.** Two public NSF sources, no account and no key:

- [PAPPG 24-1 Chapter II](https://www.nsf.gov/policies/pappg/24-1/ch-2-proposal-preparation),
  where the requirement and the format rules live. A US Government work, not subject to
  domestic copyright. Confirmed reachable 2026-08-28.
- The [NSF Award Search API](https://api.nsf.gov/services/v1/awards.json) record for
  **Mark Guzdial**, University of Michigan — 23 awards spanning 1995 to 2029, a career
  built almost entirely out of the kinds of activity this document asks for, and three
  awards that are one state-wide alliance renewed twice. Confirmed reachable 2026-08-28.

**Run** — cold, in an empty directory:

```bash
python3 -m venv .venv
.venv/bin/pip -q --disable-pip-version-check install reportlab pypdf requests
.venv/bin/python - <<'PY'
import html, json, re, sys, time, requests
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from pypdf import PdfReader
UA = {"User-Agent": "nsf-synergistic-activities/1.0 (https://heurekaskills.com)"}

def get(url, **params):
    for attempt in range(5):
        r = requests.get(url, params=params or None, headers=UA, timeout=90)
        if r.ok: return r
        time.sleep(2 * (attempt + 1))
    sys.exit(f"{url} failed after 5 tries: {r.status_code}")

# 1. The requirement, read out of NSF's own page rather than out of a guide.
s = get("https://www.nsf.gov/policies/pappg/24-1/ch-2-proposal-preparation").text
s = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", s)
s = html.unescape(re.sub(r"(?s)<[^>]+>", " ", re.sub(r"(?is)</(p|div|li|h[1-6])>", "\n", s)))
lines = [re.sub(r"\s+", " ", l).strip() for l in s.replace("’", "'").split("\n") if l.strip()]
req = min((l for l in lines if "up to five distinct examples" in l and "Examples may include" in l), key=len)
kinds = [k.strip(" .") for k in req.split("Examples may include, among others:")[1].split(";")]
fmt = {k: min((l for l in lines if k in l), key=len) for k in
       ("Times New Roman at a font size of", "No more than six lines of text", "Margins, in all directions")}
print(f"PAPPG 24-1 II.D.2.h(iv)   {len(kinds)} example kinds named, up to five may be used")
print(f"  {req.split('Examples may include')[0].strip()[:96]}...")
for k in fmt.values(): print(f"  format: {k[:88]}")
assert len(kinds) == 9 and ("one-page" in req or "one page" in req)
assert "SciENcv" not in req, "NSF has moved this document into SciENcv -- this page is out of date"

# 2. A real, named, public award record: Mark Guzdial, University of Michigan.
API = "https://api.nsf.gov/services/v1/awards.json"
first = {off: [a["id"] for a in get(API, pdPIName="Mark Guzdial", rpp=3, offset=off).json()
               ["response"]["award"]] for off in (0, 1)}
print(f"\nNSF Award Search   offset=0 {first[0]}   offset=1 {first[1]}")
assert first[0][1:] == first[1][:2] and first[0][0] not in first[1], \
    "offset is no longer 0-based -- re-check the paging in this skill"
awards, off = [], 0
while True:
    resp = get(API, pdPIName="Mark Guzdial", rpp=25, offset=off).json()["response"]
    awards += resp["award"]
    if len(resp["award"]) < 25: break
    off += 25
total = int(resp["metadata"]["totalCount"])
assert len(awards) == total, f"paged {len(awards)} of {total} -- the off-by-one is back"

def named(a, key):
    for raw in a.get(key) or []:
        m = re.match(r"^(.*?)\s*(\(Former\))?\s*(\S+@\S+)?$", raw.strip())
        yield re.sub(r"\s+", " ", m.group(1)).strip(), bool(m.group(2)), (m.group(3) or "").lower()
mine = [a for a in awards if any(n.lower().startswith("mark") and n.lower().endswith("guzdial")
                                 for k in ("pi", "coPDPI") for n, _, _ in named(a, k))]
emails = {e for a in mine for k in ("pi", "coPDPI") for n, _, e in named(a, k) if "guzdial" in n.lower()}
shared = [a for a in mine if (a.get("pdPIName") or "").lower() != "mark guzdial"]
print(f"  {len(mine)} of {total} awards carry the name in the award's own PI/co-PI list")
print(f"  e-mail addresses carrying it: {sorted(emails)}")
print(f"  awards whose current PD/PI is somebody else: {[a['id'] for a in shared]}")
one = [a for a in awards if a["id"] == "0920655"][0]
print(f"  award 0920655   pdPIName {one['pdPIName']!r}   piId {one['piId']!r}   pi {one['pi']}")
assert shared, "matching only piLastName would have dropped these"
assert one["piId"] == [a for a in awards if a["id"] == "2615528"][0]["piId"], \
    "piId no longer names the original PI rather than the current one"

# 3. Five distinct examples, one per kind NSF names, from that record alone.
SIG = {"teaching": r"IUSE|CCLI|Curricul|Teacher|Classroom|Instructional|Pedagog|Faculty Development",
       "learning": r"Computing Ed|Education Research|Student Learning|Assessment|Cyberlearning",
       "tools": r"Infrastructure|Software|Toolkit|Open-Source|Testbed|Platform",
       "participation": r"BROADENING PARTIC|\bBPC\b|Broaden|Underrepresent|Diversity|Outreach",
       "service": r"Workshop|Conference|Symposium|Community Building|Societ|Alliance|Consorti"}
cands = []
for a in mine:
    v = {k: 3 * bool(re.search(p, a["title"], re.I)) + 2 * bool(re.search(p, a.get("fundProgramName") or "", re.I))
         for k, p in SIG.items()}
    v = {k: s for k, s in v.items() if s >= 2}
    if v: cands.append({"id": a["id"], "title": re.sub(r"\s+", " ", a["title"]), "v": v,
                        "yr": int((a.get("expDate") or "//0").split("/")[-1]),
                        "amt": int(a.get("estimatedTotalAmt") or 0),
                        "lead": (a.get("pdPIName") or "").lower() == "mark guzdial"})

# Fold a run of awards that is one activity. Three of these awards are the same
# state-wide alliance renewed twice; without this they take three of the five slots
# under three different kinds, and the document breaks NSF's distinctness rule while
# passing every count. Compare each award against a group's SEED, on the proportion of
# content words shared -- an accumulating vocabulary makes merging transitive, and a bare
# two-words-in-common merges everything a one-subject career ever produced.
STOP = re.compile(r"^(collaborative|research|type|special|projects?|the|and|with|for|from|into|new)$", re.I)
def stem(t):
    t = re.sub(r"^([A-Za-z][\w-]*|Collaborative Research)\s*:\s*", "", t)
    return frozenset(w.lower() for w in re.findall(r"[A-Za-z]{4,}", t) if not STOP.match(w))
groups = []
for c in sorted(cands, key=lambda c: -c["yr"]):
    s = stem(c["title"])
    for g in groups:
        ov = len(s & g["stem"])
        if ov >= 2 and ov / min(len(s), len(g["stem"])) >= 0.4:
            g["ids"].append(c["id"]); break
    else:
        groups.append({"stem": s, "ids": [c["id"]], **c})
picked, used = [], set()
for a in sorted(groups, key=lambda a: (-max(a["v"].values()), -len(a["ids"]), -a["yr"])):
    k = next((k for k in sorted(a["v"], key=lambda k: -a["v"][k]) if k not in used), None)
    if k and len(picked) < 5: used.add(k); picked.append((k, a))
folded = {i for g in groups if len(g["ids"]) > 1 for i in g["ids"]}
print(f"\n{len(cands)} candidate awards -> {len(groups)} distinct activities "
      f"({len(folded) - sum(1 for g in groups if len(g['ids']) > 1)} folded into an earlier one)")
for g in groups:
    if len(g["ids"]) > 1: print(f"  one activity, {len(g['ids'])} awards: NSF {', '.join(g['ids'])}")
print(f"{len(picked)} examples, one per kind:")
for i, (k, a) in enumerate(picked, 1):
    print(f"  {i}. [{k:<13}] NSF {', '.join(a['ids']):<26} {a['title'][:44]}")
assert len(picked) == len(used) == 5, "five examples must cover five different kinds"
assert len({tuple(a["ids"]) for _, a in picked}) == 5, "five examples must be five activities"
assert any(len(a["ids"]) > 1 for _, a in picked), "the renewal fold is no longer doing anything"

md = ["# Synergistic Activities — Mark Guzdial", "University of Michigan", ""]
for i, (k, a) in enumerate(picked, 1):
    t = re.sub(r"^(Collaborative Research|Type \w+|[A-Z][\w-]*)\s*:\s*", "", a["title"]).strip()
    md.append(f"{i}. **{t[:78]}.** "
              + ("Principal investigator" if a["lead"] else "Founding principal investigator")
              + f" on {len(a['ids'])} NSF award{'s' if len(a['ids']) > 1 else ''} "
              + f"(NSF {', '.join(a['ids'])})"
              + (f", ${a['amt']:,} awarded" if a["amt"] else "") + ".")
    md.append("")
open("synergistic_activities.md", "w").write("\n".join(md).rstrip() + "\n")

# 4. Render at PAPPG's format floors and prove the result, do not trust the renderer.
FONT, SIZE, LEAD, M = "Times-Roman", 11, 13.2, inch
st = ParagraphStyle("e", fontName=FONT, fontSize=SIZE, leading=LEAD, leftIndent=18, firstLineIndent=-18)
story = [Paragraph("<b>Synergistic Activities — Mark Guzdial</b>", ParagraphStyle("t", fontName="Times-Bold", fontSize=12, leading=LEAD)),
         Paragraph("University of Michigan", ParagraphStyle("o", fontName=FONT, fontSize=SIZE, leading=LEAD)), Spacer(1, 12)]
for ln in md:
    if re.match(r"^\d+\. ", ln):
        story += [Paragraph(re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", ln), st), Spacer(1, 6)]
SimpleDocTemplate("synergistic_activities.pdf", pagesize=LETTER, topMargin=M, bottomMargin=M,
                  leftMargin=M, rightMargin=M, initialFontName=FONT, initialFontSize=SIZE,
                  title="Synergistic Activities", author="", subject="", creator="").build(story)

pdf = PdfReader("synergistic_activities.pdf"); page = pdf.pages[0]
W, H = float(page.mediabox.width), float(page.mediabox.height)
fonts = sorted(f.get_object()["/BaseFont"].lstrip("/") for f in page["/Resources"]["/Font"].values())
runs = []
page.extract_text(visitor_text=lambda t, cm, tm, fd, sz: t.strip() and runs.append((cm[4] + tm[4], cm[5] + tm[5], sz)))
text = page.extract_text()
print(f"\nsynergistic_activities.pdf   {len(pdf.pages)} page, {W/72:.1f}x{H/72:.1f} in, fonts {fonts}")
for label, ok in [
  ("exactly one page",                     len(pdf.pages) == 1),
  ("letter paper",                         (W, H) == (612, 792)),
  ("five examples",                        len(re.findall(r"^\s*\d+\.\s", "\n".join(md), re.M)) == 5),
  ("only PAPPG-approved typefaces",        set(fonts) <= {"Times-Roman", "Times-Bold"}),
  ("no font below 11pt",                   min(s for _, _, s in runs) >= 11),
  ("at most six lines per vertical inch",  72 / LEAD <= 6.0001),
  ("nothing inside the one-inch margin",   all(x >= 71.99 and y >= 71.99 and y + s <= H - 71.99 for x, y, s in runs)),
  ("no page number",                       not re.search(r"^\s*\d+\s*$", text, re.M)),
  ("no placeholder text",                  not re.search(r"\bTBD\b|\bTODO\b|\[\s*(fill|insert|your)\b", text)),
  ("no promotional adjective",             not re.search(r"groundbreaking|world-class|pioneering|cutting-edge|seminal", text, re.I)),
]:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    assert ok, label
print("\nFour of NSF's nine kinds are unfilled here, on purpose. An award record cannot see")
print("students mentored, courses built, editorial service or software you maintain unfunded.")
print("Those come from your CV, and they are usually the strongest examples on the page.")
PY
```

**Expect.**

Invariants — true regardless of what NSF returns, so a failure means this page is wrong:

- PAPPG still names **nine** kinds of example and still says **one page**, **five distinct
  examples**, **Times New Roman at 11pt or larger**, **no more than six lines per vertical
  inch** and **margins of at least an inch** — and still does not say SciENcv.
- `offset=0` and `offset=1` return **overlapping but different** pages. Paging from 1 loses
  the newest award, and the full page count would come up one short of `totalCount`.
- NSF **0920655** carries `pdPIName` Tucker Balch and `piId` `000228270`, which is
  Guzdial's — the same value as on his own newest award. The id is stable and it names the
  original PI, not the current one.
- Three of the awards **fold into one activity**, so five examples are five activities
  covering five different kinds.
- The finished PDF is **one page**, letter, **Times only**, nothing below 11pt, nothing
  inside the one-inch margin, no page number, no placeholder and no promotional adjective.

Observed 2026-08-28 — these move when NSF makes Guzdial another award, so a mismatch is
drift to investigate rather than a bug:

```
PAPPG 24-1 II.D.2.h(iv)   9 example kinds named, up to five may be used
  Each individual identified as a senior/key person must provide a document of up to one-page that...
  format: Times New Roman at a font size of 11 points or larger; or
  format: No more than six lines of text within a vertical space of one inch.
  format: Margins, in all directions, must be at least an inch. No proposer-supplied information m

NSF Award Search   offset=0 ['2615528', '2141819', '2030919']   offset=1 ['2141819', '2030919', '1432382']
  23 of 23 awards carry the name in the award's own PI/co-PI list
  e-mail addresses carrying it: ['mjguz@umich.edu']
  awards whose current PD/PI is somebody else: ['0920655', '9988235']
  award 0920655   pdPIName 'Tucker Balch'   piId '000228270'   pi ['Tucker Balch tucker@cc.gatech.edu', 'Mark Guzdial (Former) mjguz@umich.edu']

20 candidate awards -> 15 distinct activities (5 folded into an earlier one)
  one activity, 2 awards: NSF 1432382, 0512213
  one activity, 3 awards: NSF 1228352, 0940394, 0634629
  one activity, 2 awards: NSF 0618674, 0231176
  one activity, 2 awards: NSF 0808078, 0531770
5 examples, one per kind:
  1. [learning     ] NSF 1228352, 0940394, 0634629  Collaborative Research: Special Projects (CN
  2. [teaching     ] NSF 0618674, 0231176           CCLI: Using Media Computation to Attract and
  3. [tools        ] NSF 9988235                    Ectropic Design: Intelligent Collaboration S
  4. [service      ] NSF 1432382, 0512213           Collaborative Research: A New Computer Scien
  5. [participation] NSF 0849355                    Supporting a Community Building Meeting with

synergistic_activities.pdf   1 page, 8.5x11.0 in, fonts ['Times-Bold', 'Times-Roman']
  PASS  exactly one page
  PASS  letter paper
  PASS  five examples
  PASS  only PAPPG-approved typefaces
  PASS  no font below 11pt
  PASS  at most six lines per vertical inch
  PASS  nothing inside the one-inch margin
  PASS  no page number
  PASS  no placeholder text
  PASS  no promotional adjective

Four of NSF's nine kinds are unfilled here, on purpose. An award record cannot see
students mentored, courses built, editorial service or software you maintain unfunded.
Those come from your CV, and they are usually the strongest examples on the page.
```

The `## Try it` selector is deliberately simpler than `syn_select.py` — it takes the
first free kind rather than solving the assignment — which is why its five differ from the
five the full pipeline chooses for the same person. It carries the fold, because without
it the three Georgia Computes! awards take three of the five slots under three different
kinds and the document breaks NSF's distinctness rule while passing every count.

## Where this ages

- **On NSF's schedule, not ours.** `syn_rules.py` exists so that re-checking the
  requirement, the nine kinds and the four format rules is one command. Run it before
  trusting anything on this page.
- **PAPPG 24-1 will be superseded.** NSF deferred the planned NSF 26-1 and is drafting
  *Guidance on Financial Assistance*; comment on the draft closed 2026-08-24. When it
  lands, every date here needs re-checking, and the first thing to re-check is whether
  this document has moved into SciENcv — `syn_rules.py` asserts that it has not.
- **The signal table is a heuristic over NSF's program names.** Programs are renamed and
  retired. An activity that matches nothing is dropped silently by the classifier, which
  is the failure mode to watch for: if `syn_candidates.py` returns far fewer activities
  than you have awards, the table has drifted, not your career.
- **NSF's automated compliance checks are dated 2023-01-30.** If NSF republishes them and
  Synergistic Activities appears, the page-count check below becomes a second opinion
  rather than the only one.

## Sources

Read 2026-08-28.

- [PAPPG 24-1 Chapter II](https://www.nsf.gov/policies/pappg/24-1/ch-2-proposal-preparation)
  — II.D.2.h(iv) is the requirement and the nine example kinds; II.C.2 is the font,
  spacing and margin rules; II.C.1 is the pagination instruction; footnote 7 is the
  Macintosh carve-out for Helvetica and Palatino.
- [Documents Required for Senior/Key Personnel](https://www.nsf.gov/funding/senior-personnel-documents)
  — last updated 2026-04-13. Source of the submission route, and of the statement that
  biographical sketches "should no longer include information on synergistic activities"
  as of 2024-05-20.
- [PAPPG policy page](https://www.nsf.gov/policies/pappg) — last updated 2026-08-03.
  Confirms 24-1 current, names both supplements, and carries the *Guidance on Financial
  Assistance* draft notice.
- [PAPPG 24-1 Supplement 1, NSF 26-200](https://www.nsf.gov/policies/document/pappg24-1-supplement-1)
  and [Supplement 2, NSF 26-202](https://www.nsf.gov/policies/document/pappg24-1-supplement-2)
  — checked line by line; neither revises II.D.2.h.
- [Automated Compliance Checking of NSF Proposals](https://www.nsf.gov/funding/proposal-compliance-checking)
  — the Research.gov check list is dated 2023-01-30 and contains no Synergistic Activities
  entry.
- [NSF Award Search API](https://api.nsf.gov/services/v1/awards.json) — public award
  records, no key.
- [ORCID Public APIs Terms of Service](https://info.orcid.org/public-client-terms-of-service/)
  — the non-commercial licence grant that keeps ORCID's API off this page.

NSF's guidance and its award record are US Government works and not subject to domestic
copyright. Short phrases are quoted where the exact wording is the requirement; the rest
of this page is original.
