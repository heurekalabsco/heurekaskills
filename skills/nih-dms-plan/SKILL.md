---
name: nih-dms-plan
description: Draft an NIH Data Management and Sharing plan from a project's aims, in the 2026 structured format required for applications since May 2026 and for all awards from FY2027. Produces a clean plan plus a separate summary of what was proposed, inferred, and left for the PI. Covers repository choice, the word limits, the genomic data sharing elements, and the Just-in-Time and RPPR transition paths.
category: grants
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [nih, grants, data-sharing, compliance]
covers: [dms plan, data management and sharing, data sharing plan, nih, grant application, just-in-time, rppr, progress report, genomic data sharing, gds, dbgap, repository selection, specific aims, period of performance, no-cost extension, institutional certification, scientific data, controlled access, human subjects]
papers: []
access: [open]
datasets: [https://reporter.nih.gov/exporter/projects/download/2025]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-19
  against: NIH DMS Plan format page 2026 (dms-blank-format-page-2026.docx, page updated 2026-04-15) / NOT-OD-26-046 / NOT-OD-26-100 / RePORTER API v2 / Python 3.11.15
  executed: 4
  unverified: 0
---
# NIH Data Management and Sharing plan

NIH requires a DMS Plan for any funded research generating scientific data. In 2026 the
plan changed shape: the six-element narrative was replaced by a short structured format of
seven elements, most of them yes/no.

This skill drafts one from a project's aims and hands back two files — the plan, and a
summary of how it got there.

## Which version applies to you

The format is not optional and it is not only for new applications
([NOT-OD-26-100](https://grants.nih.gov/grants/guide/notice-files/NOT-OD-26-100.html)):

| your situation | when the 2026 format is due |
|---|---|
| competing application submitted **on or after 2026-05-25** | with the application |
| submitted before that date, **not yet awarded** | at **Just-in-Time** |
| submitted before that date, **already awarded** | next **RPPR** |
| any active award generating scientific data | **FY2027 RPPR** |

Two related changes. **Prior approval to modify an approved plan is retired** — NIH is
removing the DMS Prior Approval Request from the eRA Commons Prior Approval Module. And
from **2026-10-01**, changes to an approved plan — a different repository, a changed
timeline, a shift in scientific direction — are reported in **RPPR Section C.5.c** rather
than requested in advance.

So a plan that is out of date is no longer a problem to be approved away. It is something
you report at the next progress report.

## The seven elements

Quoted from the format page because the wording is the requirement. Everything else on
this page is ours.

1. Will there be **maximum appropriate sharing** of scientific data underlying
   peer-reviewed publications and other findings resulting from this award, including
   preprints, refereed papers reported at conferences, and other findings? — `Yes / No`
2. Will that data be shared **by the time of publication**, or for other findings, **by
   the end of the period of performance, which includes no-cost extensions**? — `Yes / No`
3. Will shared data be available **at least as long as required** by applicable data
   repository policies and/or journal policies? — `Yes / No`
4. If you answered **no** to 1, 2 or 3, **or if you anticipate that sharing will be
   limited in some other way**, describe those limitations and the ethical, legal or
   technical factors behind them. Your response **should specify a particular reason**.
   **300 words maximum.**
5. If scientific data derived from **human research participants** will be shared, will
   privacy, rights and confidentiality be protected as outlined in
   [NOT-OD-22-213](https://grants.nih.gov/grants/guide/notice-files/NOT-OD-22-213.html)?
   — `Yes / No / Not Applicable`
6. A **table** of the key data types the project expects to generate — including species
   and modality — against the repository, or an example repository, where each may be
   shared. **100 words maximum.**
7. For studies subject to the **Genomic Data Sharing Policy** —
   **7a.** Will you share all large-scale human genomic and associated data in an
   NIH-designated repository on the accelerated GDS timelines?
   **7b.** Do you anticipate meeting the expectations of the **Institutional
   Certification**?
   Both `Yes / No / Not Applicable`; either **no** must be explained in element 4.

Element 4 is the only place free text is expected, and it is capped. NIH restructured the
plan because it had evaluated over 1,100 of them and found many "included extraneous
details and exceeded the recommended DMS Plan length". Length is not diligence here.

## What this skill needs from you

Any of: a Specific Aims page, a Research Strategy, or a plain description of the work. More
detail narrows what has to be guessed, but the skill states what it inferred and from
where, and asks rather than inventing.

What it needs to determine, and what each drives:

| question | drives |
|---|---|
| what data types will be generated, with species and modality | element 6 |
| whether human participants are involved | element 5 |
| whether large-scale human genomic data is generated | element 7 |
| whether anything restricts sharing — consent, an MTA, an embargo, identifiability | element 4 |
| which repositories the field actually uses for those data types | element 6 |

**It will not invent a repository.** If the right one is not obvious for a data type, the
draft names an established example — which is what element 6 asks for — and the summary
says so.

## What you get back

Two files, and the split is the point.

| file | what is in it |
|---|---|
| `dms-plan.md` | The plan. Boxes ticked where the skill can answer, element 4 written, element 6 filled. Nothing addressed to you, nothing to delete. |
| `dms-plan-summary.md` | **Proposed** — each answer and its basis. **Inferred** — what was read out of your aims, and from which sentence. **Decided** — choices made on your behalf. **Outstanding** — what was deliberately left blank, and why. |

Read the summary first. It is the tl;dr, and it is where you correct anything misread
before the plan goes anywhere.

## Two answers this skill will not give you

**Element 5, when human data is involved.** The question asks you to affirm that privacy,
rights and confidentiality *are* protected as NOT-OD-22-213 sets out. That is a claim about
your consent forms, your IRB determinations and your data security arrangements — published
under your name. The draft leaves it blank and the summary says what it turns on.

**Element 7b, always.** The Institutional Certification is signed by your institutional
signing official, who decides whether the consents permit the intended sharing. Not the PI's
call, and certainly not an agent's.

**But `Not Applicable` is different.** On a project with no human participants, element 5 is
`Not Applicable` — a factual finding from the aims, not an attestation. Same for element 7 on
a project generating no large-scale human genomic data. The skill answers those, and the
summary records the basis. What it refuses is `Yes`/`No`, which asserts a state of affairs.

## Traps

**`grants.nih.gov` is behind a Cloudflare challenge.** Verified 2026-08-19: a plain HTTP
client gets `403` and a `Just a moment...` page from the notices, the policy site, and the
template. (The challenge page is a few kilobytes and its exact size varies between fetches,
so check the type rather than the length.) Do not build a step that fetches them — that is why the format is written out
above rather than downloaded.

The worst shape is the template itself:

```bash
curl -sL -o plan.docx https://grants.nih.gov/sites/default/files/dms-blank-format-page-2026.docx
file plan.docx
# plan.docx: HTML document text        <- a challenge page, ~6 KB, named .docx
```

A pipeline that trusts the filename ships a corrupt attachment. Check the type, not the
extension.

**The template and the notice disagree, and the template wins.** NOT-OD-26-046 gives
element 5 as `[YES/NO]`; the format page offers `Yes / No / Not Applicable`, and drops the
notice's trailing clause about access controls. Follow the template — it is what gets
submitted — and note the date you checked, because this is a pilot NIH said it would
evaluate over the following year.

**The template carries its own instructions.** It says, in italics, to delete the italics.
Anything a reader copies out of it — "delete the text in italics", "There is no 'form page'"
— must not survive into the plan. The check below fails on those strings for that reason.

**"No data" is not an exemption.** Whether the policy applies is decided by the activity
code and whether the project generates scientific data, not by whether you think your data
is worth sharing.

**Element 4 is not optional for controlled-access studies.** Controlled access *is* a
limitation on sharing — it restricts who may obtain the data — so a human genomic study
with an empty element 4 is a common reason plans come back for revision.

## Reading a grant, and why not to grep it

Elements 5 and 7 turn on two factual questions: are there human participants, and is there
large-scale human genomic data. Both look like they could be answered by searching for
keywords. They cannot. From four real NIH awards:

- a mouse olfactory-bulb study whose abstract says the system matters "in mammals,
  **including humans**" — matches, and has no human participants;
- a randomised trial in **adolescents with concussion** — the word "human" never appears;
- a **human MRI cohort** whose only occurrence of "human" is "**human error**" — the right
  answer for a reason that has nothing to do with the study.

The third is the dangerous one: a keyword rule scores it correct, so nothing signals that
the rule is unsound. Read the aims.

## Fetching a grant to draft from

Public NIH awards are available through RePORTER, which — unlike the rest of NIH's web
estate — answers a plain client:

```python
import json, urllib.request

req = urllib.request.Request(
    "https://api.reporter.nih.gov/v2/projects/search",
    data=json.dumps({"criteria": {"project_nums": ["5R01AG083865-02"]},
                     "include_fields": ["ApplId", "ProjectNum", "ProjectTitle",
                                        "AbstractText", "AgencyIcAdmin"],
                     "limit": 1}).encode(),
    headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=90) as fh:
    rec = json.load(fh)["results"][0]

print(rec["project_num"], "|", rec["project_title"])
print(len(rec["abstract_text"]), "characters of abstract")
```

Two notes. The search endpoint is **POST only** — a `GET` returns `405`, so a link-checker
pointed at it will report an outage that is not one. And an abstract is thinner than a
Research Strategy: it is enough to identify data types and whether human participants are
involved, rarely enough to know consent terms or embargoes. The summary should say which
of those it could not establish.

## Checking a draft before it goes anywhere

The limits are countable and the refusals are checkable, so check them:

```python
"""Check a drafted DMS plan against the 2026 NIH format before it is submitted."""
import re, sys

ELEMENTS = 7
# Phrases NIH ships inside its own template. Any of them in a draft means the
# template was copied rather than filled in.
NIH_GUIDANCE = [
    "delete the text in italics", "There is no", "form page",
    "NIH recognizes that not all", "Refer to guidance on Writing",
]
# Markers that mean the draft is a worksheet: notes to the reader, or gaps
# dressed up as content.
WORKSHEET = [
    r"\bTODO\b", r"\bTBD\b", r"\bPROPOSED:", r"⚠", r"\[fill", r"\[insert",
    r"\[your\b", r"<[a-z_ ]{3,}>", r"\bXXX\b", r"_{4,}",
]


def words(s):
    return len(re.findall(r"\S+", s))


def section(plan, n):
    """Body of element n — from its heading to the next element heading."""
    m = re.search(rf"^##\s*{n}\.\s.*$", plan, re.M)
    if not m:
        return None
    rest = plan[m.end():]
    nxt = re.search(r"^##\s*\d+\.\s", rest, re.M)
    return rest[: nxt.start()] if nxt else rest


def sub7(body, which):
    """Element 7 holds 7a and 7b. 7a is the PI's to answer and often should be;
    7b is the institution's. Checking the whole element flags a correct 7a."""
    m = re.search(rf"\*\*{which}\.?\*\*", body)
    if not m:
        return None
    rest = body[m.end():]
    nxt = re.search(r"\*\*7[ab]\.?\*\*", rest)
    return rest[: nxt.start()] if nxt else rest


def ticked(body):
    """Which boxes are marked.

    Two forms in the wild: NIH's DOCX writes the label then the box (`Yes☐`), a
    markdown draft writes the box then the label (`[x] Yes`). Both are read.

    Order matters twice over. `Not Applicable` must be tried before `No`, or the
    alternation matches its first two letters; and the label-then-box form must not
    reach across into the NEXT option's box, which is how `[ ] No  [x] Not Applicable`
    once reported `No` as ticked.
    """
    LABELS = r"Not Applicable|Yes|No"
    marks = {}
    for m in re.finditer(rf"\[([ xX])\]\s*({LABELS})", body):        # [x] Label
        marks.setdefault(m.group(2), m.group(1).lower() == "x")
    for m in re.finditer(rf"({LABELS})\s*([☐☒])", body):   # Label ☒
        marks.setdefault(m.group(1), m.group(2) == "☒")
    return [k for k, v in marks.items() if v]


def check(plan, summary):
    fail = []
    bodies = {n: section(plan, n) for n in range(1, ELEMENTS + 1)}

    missing = [n for n, b in bodies.items() if b is None]
    if missing:
        fail.append(f"missing element(s): {missing}")

    if bodies.get(4) and words(bodies[4]) > 300:
        fail.append(f"element 4 is {words(bodies[4])} words, limit 300")
    if bodies.get(6) and words(bodies[6]) > 100:
        fail.append(f"element 6 is {words(bodies[6])} words, limit 100")

    # `Not Applicable` is a factual finding — no human participants, no genomic data —
    # and the skill may make it. `Yes`/`No` asserts that protections are or are not in
    # place, which is a claim under the PI's name. Only the second is refused.
    b5 = bodies.get(5)
    claimed5 = [t for t in ticked(b5 or "") if t != "Not Applicable"]
    if claimed5:
        fail.append(f"element 5 answered {claimed5} — whether participant protections meet "
                    "NOT-OD-22-213 is the PI's claim, not the skill's")

    b7 = bodies.get(7)
    b7b = sub7(b7, "7b") if b7 else None
    if b7 and b7b is None:
        fail.append("element 7 present but 7b not found — label the sub-elements **7a.** and **7b.**")
    claimed7b = [t for t in ticked(b7b or "") if t != "Not Applicable"]
    if claimed7b:
        fail.append(f"element 7b answered {claimed7b} — the Institutional Certification is "
                    "the institutional signing official's call")

    for g in NIH_GUIDANCE:
        if g.lower() in plan.lower():
            fail.append(f"NIH template guidance left in the draft: {g!r}")
    for pat in WORKSHEET:
        m = re.search(pat, plan, re.I)
        if m:
            fail.append(f"worksheet marker in the draft: {m.group(0)!r}")

    # A blank the summary does not mention is a gap the reader will not notice.
    unanswered = []
    if b5 is not None and not ticked(b5):
        unanswered.append("5")
    if b7b is not None and not ticked(b7b):
        unanswered.append("7b")
    for n in unanswered:
        if not re.search(rf"element\s*{re.escape(n)}\b", summary, re.I):
            fail.append(f"element {n} is blank in the draft and unexplained in the summary")
    if b5 is not None and ticked(b5) == ["Not Applicable"] and not re.search(r"element\s*5\b", summary, re.I):
        fail.append("element 5 answered Not Applicable but the summary does not say why")
    return fail, unanswered


if __name__ == "__main__":
    plan = open(sys.argv[1]).read()
    summary = open(sys.argv[2]).read() if len(sys.argv) > 2 else ""
    fail, unanswered = check(plan, summary)
    print(f"elements 1-7 present   : {all(section(plan, n) for n in range(1, 8))}")
    print(f"element 4 words / 300  : {words(section(plan, 4) or '')}")
    print(f"element 6 words / 100  : {words(section(plan, 6) or '')}")
    print(f"left blank for the PI  : {unanswered}")
    print(f"problems               : {len(fail)}")
    for f in fail:
        print(f"  ✗ {f}")
    sys.exit(1 if fail else 0)
```

Run it as `python3 check_plan.py dms-plan.md dms-plan-summary.md`. It exits non-zero on any
problem, so it drops into a pre-submission hook.

Worked examples of both files — one human genomic study exercising all seven elements, one
animal study where 5 and 7 are `Not Applicable` — are in
[`references/worked-examples.md`](references/worked-examples.md).

## Try it

**Data.** Four real NIH awards, public in RePORTER, chosen because they differ on exactly
what decides elements 5 and 7: `11016811` human genomic (P01), `11128776` mouse circuits
(R01), `11193483` human imaging (R01), `11160999` a randomised trial in adolescents (R21).
Public domain as US Government works. Last confirmed reachable 2026-08-19.

The block reads them from the search API, but `datasets:` declares the **ExPORTER bulk file**
for FY2025 instead, and the difference is worth knowing if you build any monitoring of your
own. The search endpoint is `POST`-only, so a `GET` liveness probe gets `405`; the
`project-details` pages are HTML, which a probe should treat as a source that has been put
behind a page. ExPORTER publishes the same project records as a GET-able zip, so it is the
one URL that fails when RePORTER genuinely fails and not before. FY2025 is a closed fiscal
year, so that file no longer changes.

**Run.**

```python
import json, re, urllib.request

API = "https://api.reporter.nih.gov/v2/projects/search"
GRANTS = {11016811: "human genomic  (P01)", 11128776: "mouse circuits (R01)",
          11193483: "human imaging  (R01)", 11160999: "clinical trial (R21)"}
TRUTH  = {11016811: True, 11128776: False, 11193483: True, 11160999: True}  # human participants?

req = urllib.request.Request(
    API, data=json.dumps({"criteria": {"appl_ids": list(GRANTS)},
                          "include_fields": ["ApplId", "ProjectNum", "AbstractText"],
                          "limit": 10}).encode(),
    headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=90) as fh:
    recs = {r["appl_id"]: r for r in json.load(fh)["results"]}
assert len(recs) == len(GRANTS), f"RePORTER returned {len(recs)} of {len(GRANTS)}"

naive = re.compile(r"\bhumans?\b", re.I)          # the obvious approach
print(f"{'appl_id':>9}  {'kind':<20} {'grep human':>10} {'truth':>6}   verdict")
wrong = []
for aid, kind in GRANTS.items():
    ab = recs[aid].get("abstract_text") or ""
    guess = bool(naive.search(ab))
    ok = guess == TRUTH[aid]
    if not ok:
        wrong.append(aid)
    print(f"{aid:>9}  {kind:<20} {str(guess):>10} {str(TRUTH[aid]):>6}   {'ok' if ok else 'WRONG'}")

# The point of the block: keyword matching decides element 5 wrongly in BOTH
# directions on real grants, so the agent must read the aims rather than grep them.
assert 11128776 in wrong, "the mouse grant no longer trips a naive human match"
assert 11160999 in wrong, "the clinical trial no longer defeats a naive human match"

mouse, imaging, trial = (recs[i]["abstract_text"] for i in (11128776, 11193483, 11160999))
assert "including humans" in mouse           # false positive: mouse study, says humans
assert not re.search(r"\bhumans?\b", trial)  # false negative: trial on adolescents, never says human
assert "human error" in imaging and not re.search(r"\bhuman (?:subject|participant)", imaging)

print(f"\nnaive keyword match is wrong on {len(wrong)} of {len(GRANTS)}, in both directions:")
print("  11128776  mouse olfactory bulb — 'survival in mammals, including humans'")
print("            -> FALSE POSITIVE: element 5 marked the PI's when it is Not Applicable")
print("  11160999  concussion RCT in adolescents — the word 'human' never appears")
print("            -> FALSE NEGATIVE: element 5 marked Not Applicable on a clinical trial")
print("  11193483  human MRI cohort — matches, but its only 'human' is 'human error'")
print("            -> RIGHT ANSWER, WRONG REASON, which is the one you never catch by eye")
print("\nElement 5 is decided by reading the aims, never by matching a word.")
```

**Expect.**

Invariants — these hold regardless of what RePORTER returns, and a failure means this page
is wrong:

- All four awards resolve. RePORTER answers a plain client with **no challenge page**,
  which is what makes it usable where `grants.nih.gov` is not.
- A naive `\bhumans?\b` match is **wrong on at least two of the four, in both directions** —
  it is not a conservative approximation, it fails either way.
- `11128776` contains the string `including humans` and has no human participants.
- `11160999` never contains `human` and is a randomised trial in adolescents.
- `11193483` matches only through `human error`, so a keyword rule is right about it for a
  reason unrelated to the study.

Observed 2026-08-19 — these move if NIH revises an abstract, so treat a mismatch as drift
to investigate:

```
  appl_id  kind                 grep human  truth   verdict
 11016811  human genomic  (P01)       True   True   ok
 11128776  mouse circuits (R01)       True  False   WRONG
 11193483  human imaging  (R01)       True   True   ok
 11160999  clinical trial (R21)      False   True   WRONG

naive keyword match is wrong on 2 of 4, in both directions
```

And the checker, against the two worked examples and a deliberately broken draft:

```
dms-plan.md   (human genomic)  element 4: 215/300   element 6: 64/100   blank: ['5', '7b']   problems: 0
mouse-plan.md (animal only)    element 4:  45/300   element 6: 49/100   blank: []            problems: 0
bad-plan.md   (5 defects)      problems: 5
  ✗ element 4 is 415 words, limit 300
  ✗ element 7b answered ['Yes'] — the Institutional Certification is the institutional signing official's call
  ✗ NIH template guidance left in the draft: 'delete the text in italics'
  ✗ worksheet marker in the draft: '⚠'
  ✗ element 5 is blank in the draft and unexplained in the summary
```

## Sources

All three need a real browser — a plain client gets a Cloudflare challenge. Read
2026-08-19.

- [NOT-OD-26-046](https://grants.nih.gov/grants/guide/notice-files/NOT-OD-26-046.html) —
  Updated Elements of an NIH Data Management and Sharing Plan, released 2026-02-25.
  Supersedes NOT-OD-21-014.
- [NOT-OD-26-100](https://grants.nih.gov/grants/guide/notice-files/NOT-OD-26-100.html) —
  Implementation Update, released 2026-07-29. The transition table and the RPPR §C.5.c
  reporting change.
- [DMS Plan Format Page](https://grants.nih.gov/grants-process/write-application/forms-directory/data-management-and-sharing-plan-format-page)
  — the current template, page updated 2026-04-15. Where the notice and the template
  disagree, the template is what gets submitted.
- [NIH RePORTER API](https://api.reporter.nih.gov/) — public award records, used above.

NIH policy notices and the format page are US Government works and not subject to domestic
copyright. The element wording is quoted because it is the requirement; the rest of this
page is original.
