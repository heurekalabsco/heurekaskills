---
name: nsf-coa
description: Fill NSF's Collaborators and Other Affiliations template for one senior person — the 48-month co-author list from Crossref, project collaborators from NSF's own award record, written into the .xlsx Research.gov accepts, plus a separate summary of what was inferred, what was decided, and what was deliberately left blank for the PI to complete.
category: grants
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [nsf, grants, compliance, bibliometrics]
covers: [coa, collaborators and other affiliations, nsf, conflict of interest, coi, reviewer conflicts, senior personnel documents, research.gov, grants.gov, pappg, coa template, table 4, co-authors, phd advisor, thesis advisee, editorial board, crossref, orcid, nsf award search, proposal submission, single copy document]
papers: []
access: [open]
datasets: [https://www.nsf.gov/bfa/dias/policy/coa/coa_template.xlsx, https://api.crossref.org/works/10.1103/physrevlett.116.061102, https://api.nsf.gov/services/v1/awards.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: NSF COA template downloaded 2026-08-27 / PAPPG 24-1 II.D.2.h(iii) and Exhibit II-2 with supplements NSF 26-200 and NSF 26-202 / Crossref REST API / NSF Award Search API v1 / Python 3.12.8 / openpyxl 3.1.5 / requests 2.34.2
  executed: 11
  unverified: 0
---
# NSF Collaborators and Other Affiliations

Every senior person on an NSF proposal files a COA. It is not a CV and not a credit list.
It is a conflict-of-interest disclosure, and NSF uses it for exactly one purpose — keeping
conflicted people out of the reviewer pool for that proposal. PAPPG Exhibit II-2 is where
the purpose is written down, and it is what settles every judgement call below. Getting the
framing backwards produces a document that looks impressive and is wrong.

The work is mechanical and miserable. A mid-career PI has a hundred co-authors inside the
48-month window, and NSF wants each one as `Last, First, Middle Initial` with a current
organizational affiliation. A CV carries neither, because CVs print authors as initials.
Doing it by hand means opening every paper from the last four years and typing out the
author block.

**What this skill produces is a draft.** A publication record gives you co-authors. It does
not give you a spouse, a Ph.D. advisee, an editorial board seat, or a collaboration that has
not been published yet — and all four are on the form. The workbook it writes contains no
placeholders: a field it cannot answer is left genuinely empty, and every empty field is
named in a separate summary. NSF holds the senior person responsible for the file, not this
page.

## What NSF requires, and when it was checked

Checked 2026-08-27. **PAPPG 24-1** (effective 2024-05-20) is in force, supplemented by
**NSF 26-200** (effective 2025-12-08) and **NSF 26-202** (effective 2026-01-22). COA sits at
**PAPPG II.D.2.h(iii)**, and the conflict definitions it points to sit at **Exhibit II-2**.
NSF's senior-personnel-documents page was last updated 2026-04-13. NSF has signalled that the
PAPPG will eventually be replaced by *Guidance on Financial Assistance*; when that lands,
re-check every date on this page.

**Where the template and the policy disagree, follow the template.** It is the thing that
gets submitted. Two live examples, both small and both real:

- PAPPG footnote 35 excludes "Editorial Advisory Board, Scientific Editorial Board, or any
  other subcategory". The template's instruction rows add **International Advisory Board** to
  that list. Use the template's longer exclusion.
- The template's instruction rows require `mm/dd/yyyy` or `m/d/yyyy` dates. The template's
  own example date cells carry the number format `mm-dd-yy`. Follow the instruction.

So the first thing the code below does is read the contract out of the file NSF ships, rather
than trusting any secondary description of it — including this one.

## The five tables

| Table | Codes | Contents | Window |
|---|---|---|---|
| 1 | — | The senior person's own organizational affiliations | last 12 months |
| 2 | `R:` | Personal, family or business relationships that would preclude someone serving as a reviewer | none stated |
| 3 | `G:` `T:` | `G:` Ph.D. advisors, `T:` all Ph.D. thesis advisees | lifetime |
| 4 | `A:` `C:` | `A:` co-authors on any book, article, report, abstract or paper; `C:` collaborators on projects, funded awards, graduate research | 48 months |
| 5 | `B:` `E:` | `B:` editorial board and editor-in-chief with journal, `E:` other co-editors directly interacted with | 24 months |

An editor-in-chief must list the **entire** editorial board.

## Four things older guides get wrong

All four are stated in the template's own instruction rows, and all four contradict guidance
that is still in circulation on university research-administration pages.

1. **Postdoctoral sponsors are no longer reported.** The template says prior-PAPPG
   information is no longer requested and gives this as its worked example — a postdoc
   sponsor appears only "if the individual collaborated on research with their postdoctoral
   scholar sponsor", in which case they are a Table 4 collaborator, not a Table 3 entry.
   Over-reporting here is the most common legacy error. The template still ships one orphan
   dropdown offering a `P:` code at cell `A33`, outside every table; it is a leftover, and
   the writer below drops it rather than carrying a retired code into a live document.
2. **Table 3 wants Ph.D. thesis advisees, not all trainees.** Master's students and
   undergraduates do not belong there.
3. **Editorial Board has a narrow definition** — people who "perform editing duties or manage
   the editing process". Most named board seats on a CV do not qualify. NSF's guidance page
   adds a rule the template does not: do not list editors or reviewers you interacted with
   because you submitted a paper to them.
4. **Sorting is not required.** The instructions say so outright — "not required to be
   sorted, alphabetically or otherwise". Do not spend effort on it and do not imply it
   matters.

## Format rules that decide whether it is accepted

- **Research.gov: upload the `.xlsx` directly**, as a Collaborators and Other Affiliations
  Single Copy Document. NSF converts it. Never a PDF — uploading any other format "may delay
  the timely processing and review of your proposal".
- **Grants.gov: the template is uploaded as a PDF attachment, for the PD/PI only.** Additional
  senior personnel still need their `.xlsx` in Research.gov after the Grants.gov submission.
- Complete it in Excel. **Google Sheets is explicitly unsupported.**
- Content and format "must not be altered". Specifically: **do not change the column widths or
  the font type.** Rows **may** be inserted, and the instruction rows at the top **may** be
  deleted — PAPPG says both.
- Names as `Last Name, First Name, Middle Initial`.
- Organizational Affiliation may include a location, must not include a street address, and is
  capped at **255 characters**.
- `Last Active Date` / `Last Active` in `mm/dd/yyyy` or `m/d/yyyy`. Optional. **Blank means
  ongoing or current** — it is not a gap.
- Font at 10pt or smaller where a cell needs to fit; PAPPG allows reducing the font size to fit
  a long name.
- One COA per senior person. This produces one.

## What you need

Python 3.9+, `openpyxl` and `requests`. **No API key and no account, for any of the three
sources.** The senior person's **ORCID iD** is optional but close to essential — see
*the common-surname wall* below.

| source | what it gives | licence |
|---|---|---|
| [NSF COA template](https://www.nsf.gov/bfa/dias/policy/coa/coa_template.xlsx) | the specification, machine-readable | US Government work, not subject to domestic copyright |
| [Crossref REST API](https://api.crossref.org) | works and author blocks, with `given` and `family` kept apart | "almost none of the metadata is subject to copyright, and you may use it for any purpose" |
| [NSF Award Search API](https://api.nsf.gov/services/v1/awards.json) | co-PIs on NSF awards | US Government work |

**ORCID's own API is deliberately not used here.** ORCID's annual Public Data File is CC0, but
its Public APIs Terms of Service grant only "a limited royalty-free license to make
non-commercial use of the Public APIs", and spell out that you "may not make use of the public
APIs in connection with any revenue-generating product or service". A researcher at a company,
or anyone whose work is commercial, cannot lawfully take that route, so this page does not
send them down it. The ORCID **identifier** is used throughout — as a Crossref filter value and
as the field Crossref carries on each author — and nothing about that touches ORCID's terms.
Checked 2026-08-27.

Crossref is the only bibliographic source, and adding a `mailto=` to any request puts you in
its polite pool. No key, no sign-up.

The template is **not** vendored here. It changes on NSF's schedule, and a stale copy of a
compliance form is worse than none — the code downloads it fresh every run.

```bash
python3 -m venv .venv
.venv/bin/pip install openpyxl requests
```

Save each block below as the file named in its first line, then run them in the order they
appear. Set the subject once:

```bash
export COA_FAMILY="Martonosi" COA_GIVEN="Margaret" COA_ORCID="0000-0001-9683-8032"
export COA_ASOF="2026-08-27"        # omit to use today
```

## Read the contract out of NSF's own template

The five tables are not in the order the file stores them, and their internal names are
`TableA`, `TableD23`, `TableC`, `TableD` and `TableD5` — which map to displayed tables 1, 2,
3, 4 and 5 respectively. Keying on the name, or on the order `openpyxl` yields, silently puts
co-authors in the advisee table. Key on the number NSF prints in each table's own first header
cell.

```python
# coa_spec.py -- read the COA contract out of NSF's own template.
import json, re, warnings, requests, openpyxl
warnings.filterwarnings("ignore", message="Unknown extension is not supported")

TEMPLATE_URL = "https://www.nsf.gov/bfa/dias/policy/coa/coa_template.xlsx"

def fetch(path="coa_template.xlsx"):
    r = requests.get(TEMPLATE_URL, timeout=60, headers={"User-Agent": "nsf-coa/1.0"})
    r.raise_for_status()
    open(path, "wb").write(r.content)
    return path

def read_spec(path="coa_template.xlsx"):
    ws = openpyxl.load_workbook(path).active
    title = re.compile(r"^Table\s+([1-5])\s*:")
    first = min(c.row for c in ws["A"] if isinstance(c.value, str) and title.match(c.value))
    spec = {"sheet": ws.title,
            "instructions": [c.value for c in ws["A"]
                             if c.row < first and isinstance(c.value, str) and c.value.strip()],
            "tables": {}}
    for t in ws.tables.values():
        hdr = int(t.ref.split(":")[0][1:])
        last = int(t.ref.split(":")[1][1:])
        spec["tables"][str(ws.cell(hdr, 1).value).strip()] = {
            "internal_name": t.name, "ref": t.ref, "header_row": hdr, "last_row": last,
            "blank_rows": last - hdr, "n_cols": len(t.tableColumns),
            "columns": [c.name for c in t.tableColumns]}
    spec["codes"] = {str(dv.sqref): dv.formula1[0] if isinstance(dv.formula1, list) else dv.formula1
                     for dv in ws.data_validations.dataValidation if dv.type == "list"}
    return spec

if __name__ == "__main__":
    spec = read_spec(fetch())
    json.dump(spec, open("coa_spec.json", "w"), ensure_ascii=False, indent=1)
    print(f"sheet             {spec['sheet']!r}")
    print(f"instruction rows  {len(spec['instructions'])}")
    print(f"tables            {len(spec['tables'])}")
    for n in sorted(spec["tables"]):
        t = spec["tables"][n]
        print(f"  Table {n}  rows {t['header_row']:>2}-{t['last_row']:<2} "
              f"{t['blank_rows']} blank  {t['n_cols']} cols  internal name {t['internal_name']!r}")
    print("row-code dropdowns the template ships:")
    for sq, f in sorted(spec["codes"].items()):
        print(f"  {sq:<10} {f}")
```

Observed 2026-08-27 — a change here means NSF revised the template, which is drift to
investigate before anything else on this page is trusted:

```
sheet             'NSF COA Template'
instruction rows  13
tables            5
  Table 1  rows 16-21 5 blank  4 cols  internal name 'TableA'
  Table 2  rows 27-32 5 blank  5 cols  internal name 'TableD23'
  Table 3  rows 37-44 7 blank  4 cols  internal name 'TableC'
  Table 4  rows 51-56 5 blank  5 cols  internal name 'TableD'
  Table 5  rows 63-68 5 blank  5 cols  internal name 'TableD5'
row-code dropdowns the template ships:
  A28:A32    "R:"
  A33        "G:,T:,P:"
  A38:A44    "G:,T:"
  A52:A56    "A:,C:"
  A64:A68    "B:,E:"
```

Table 3 ships seven blank rows and four columns; the others ship five rows, and only Tables
2, 4 and 5 have a fifth column. The `A33` dropdown offering `P:` sits below Table 2's range
and belongs to no table.

## Find the works in the 48-month window

Crossref is the source, for two reasons. It keeps `given` and `family` in separate fields, so
`Last, First, Middle Initial` is read rather than guessed from a byline. And it needs no key
and no budget, which matters because a COA run for one person is a few hundred lookups.

Three things are not what they look like:

- **Search on the surname alone.** `query.author=Margaret Martonosi` is an OR over tokens and
  returned 41,967 works ranked by relevance, led by papers about drug policy. `query.author=Martonosi`
  returned 39, all of them genuinely by someone of that name.
- **`published` is the publication date.** `created` is the first deposit and can fall either
  side of it — on `10.1145/3776585`, published 2025-12-13, created 2025-11-12. `indexed` is
  when Crossref last touched the record and was 2026-07-11 for the same work. Only `published`
  answers the 48-month question.
- **Filtering on the ORCID iD alone badly under-retrieves.** Crossref's `filter=orcid:` only
  finds works whose depositor put the iD in the metadata: 10 works for Margaret Martonosi,
  against 39 the surname search found. It is precise, not complete — so it anchors the
  identity rather than defining the list, and it is the only evidence that survives the
  overflow case below.

**The common-surname wall.** The surname scan is bounded by how many people share the
surname, and for some names it cannot be run at all. Over a four-year window the surname query
reports 140,020 matches for *González* and 2,373,908 for *Wang*. When the scan overflows,
name evidence stops meaning anything, so this code switches it off and attributes only what an
identifier vouches for — and refuses outright if no ORCID iD was supplied. That refusal is the
correct output. A confidently wrong Table 4 is worse than none.

```python
# coa_harvest.py -- find the senior person's works in the Table 4 window.
import json, os, re, sys, time, unicodedata, datetime as dt, requests

FAMILY = os.environ.get("COA_FAMILY", "Martonosi")
GIVEN  = os.environ.get("COA_GIVEN",  "Margaret")
ORCID  = os.environ.get("COA_ORCID",  "")            # bare iD, e.g. 0000-0001-9683-8032
ASOF   = dt.date.fromisoformat(os.environ.get("COA_ASOF", dt.date.today().isoformat()))
WINDOW, GRACE = 48, 120        # Table 4 lookback in months; days shown either side
MAX_SCAN = int(os.environ.get("COA_MAX_SCAN", 6000))

UA = {"User-Agent": "nsf-coa/1.0 (https://heurekaskills.com)"}
S  = requests.Session(); S.headers.update(UA)

def months_before(d, n):
    y, m = d.year, d.month - n
    while m <= 0: m += 12; y -= 1
    last = [31, 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28,
            31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return dt.date(y, m, min(d.day, last))

CUTOFF = months_before(ASOF, WINDOW)
EARLY  = CUTOFF - dt.timedelta(days=GRACE)

def fold(s):
    """Compare names without accents, case or punctuation. Aragón == Aragon."""
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^a-z]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())

def crossref(**p):
    for attempt in range(5):            # Crossref intermittently serves an HTML error page
        r = S.get("https://api.crossref.org/works", params=p, timeout=60)
        if r.ok and "json" in (r.headers.get("content-type") or ""):
            return r.json()["message"]
        time.sleep(2 * (attempt + 1))
    sys.exit(f"Crossref did not return JSON after 5 tries: {r.status_code} {r.text[:120]}")

def pubdate(item):
    dp = ((item.get("published") or {}).get("date-parts") or [[]])[0]
    if not dp: return None
    y = dp[0]; m = dp[1] if len(dp) > 1 else 12; d = dp[2] if len(dp) > 2 else 28
    try: return dt.date(y, m, d).isoformat()
    except ValueError: return dt.date(y, m, 1).isoformat()

# Crossref tokenises the query, so a compound surname searches for each part separately:
# 'Orenes-Vera' returns 50,503 works because Vera is common, and 'van der Schaar' returns
# 355,714. Probe each non-particle token and search on whichever is rarest -- Orenes returns
# 134, Schaar 326 -- then filter on the whole surname.
PARTICLES = {"van", "von", "de", "del", "della", "der", "den", "di", "da", "dos", "du",
             "la", "le", "ter", "bin", "al", "of", "y"}
cands = [t for t in re.split(r"[\s\-']+", FAMILY) if t and t.lower() not in PARTICLES] or [FAMILY]
if len(cands) > 1:
    cands.sort(key=lambda t: crossref(**{"query.author": t, "rows": 0,
                                         "filter": f"from-pub-date:{EARLY},until-pub-date:{ASOF}"}
                                      )["total-results"])
QUERY = cands[0]

# A depositor may file 'van der Schaar' whole or leave the particles in the given name, so
# accept the surname with its particles stripped as well.
SURNAMES = {fold(FAMILY), fold(" ".join(cands))}

hits, cursor, scanned, total = {}, "*", 0, 0
while True:
    m = crossref(**{"query.author": QUERY, "rows": 200, "cursor": cursor,
                    "filter": f"from-pub-date:{EARLY},until-pub-date:{ASOF}"})
    total = m["total-results"]
    if not m["items"]: break
    for it in m["items"]:
        if any(fold(a.get("family")) in SURNAMES for a in (it.get("author") or [])):
            hits[it["DOI"].lower()] = it
    scanned += len(m["items"]); cursor = m.get("next-cursor")
    if not cursor or scanned >= MAX_SCAN: break
overflow = scanned >= MAX_SCAN and scanned < total

# The surname scan is the only route that finds work the person never claimed, and it is
# also the one that fails on a common surname. Anchor on the ORCID as well, always: it
# costs one call and it is the only evidence that survives an overflow.
if ORCID:
    cur = "*"
    while cur:
        m = crossref(filter=f"orcid:{ORCID},from-pub-date:{EARLY},until-pub-date:{ASOF}",
                     rows=200, cursor=cur)
        for it in m["items"]: hits.setdefault(it["DOI"].lower(), it)
        cur = m.get("next-cursor") if m["items"] else None

def mine(item):
    return [a for a in (item.get("author") or []) if fold(a.get("family")) in SURNAMES]

def gtoks(s): return [t for t in re.split(r"[\s.\-]+", fold(s)) if t]

def given_ok(a):
    """Initial-compatible: 'M.' matches 'Margaret'. Weak evidence on its own."""
    g, me = fold(a.get("given")), fold(GIVEN)
    return bool(g) and bool(me) and g[0] == me[0]

def given_spelled(a):
    """First given name spelled out on both sides and equal, later tokens compatible.
    'Juan L.' and 'Juan Luis' are one person; 'W.' and 'Wei' are not evidence."""
    a_t, me_t = gtoks(a.get("given")), gtoks(GIVEN)
    if not a_t or not me_t or len(a_t[0]) < 2 or len(me_t[0]) < 2 or a_t[0] != me_t[0]:
        return False
    return all(a_t[i].startswith(me_t[i]) or me_t[i].startswith(a_t[i])
               for i in range(1, min(len(a_t), len(me_t))))

def cokey(a): return (fold(a.get("family")), fold(a.get("given"))[:1])

certain, byname, maybe, other = {}, {}, {}, {}
for doi, it in hits.items():
    ms = mine(it)
    if ORCID and any(ORCID in (a.get("ORCID") or "") for a in ms):
        certain[doi] = it                       # identifier evidence
    elif any(given_spelled(a) for a in ms) and not overflow:
        byname[doi] = it                        # full given name, spelled out and equal
    elif any(given_spelled(a) or given_ok(a) for a in ms):
        maybe[doi] = it                         # initial-compatible only
    else:
        other[doi] = it                         # a different person with this surname

# Grow outward from the confirmed set: a surname-and-initial match that shares a co-author
# with a confirmed work is the same person often enough to accept. Only through papers small
# enough for co-authorship to mean something -- sharing one name with a 1000-author
# collaboration is not evidence, and letting it count attributed a 1006-author paper to the
# wrong Patel.
certain.update(byname)
SMALL = 25
network = {cokey(a) for it in certain.values() if len(it.get("author") or []) <= SMALL
           for a in it["author"]}
for _ in range(2 if not overflow else 0):
    for doi in list(maybe):
        au = maybe[doi].get("author") or []
        if len(au) > SMALL: continue
        if network & {cokey(a) for a in au} - {(fold(FAMILY), fold(GIVEN)[:1])}:
            certain[doi] = maybe.pop(doi)
            network |= {cokey(a) for a in certain[doi]["author"]}

# If the scan completed and turned up nobody else with this surname, then within this
# window the surname identifies one person and an initial is enough. Rare surnames --
# Mavalvala, Martonosi -- otherwise lose every work bylined 'N. Mavalvala', and losing
# work under-reports conflicts, which is the failure that matters.
sole = (not overflow) and not other
if sole:
    certain.update(maybe); maybe = {}

accepted = {d: i for d, i in certain.items() if (pubdate(i) or "") >= CUTOFF.isoformat()}
edge     = {d: i for d, i in certain.items() if d not in accepted}
others   = sorted({(a.get("given") or "?") for it in other.values() for a in mine(it)})

print(f"subject            {FAMILY}, {GIVEN}" + (f"  (ORCID {ORCID})" if ORCID else "  (no ORCID iD given)"))
print(f"Table 4 window     {CUTOFF} to {ASOF}   ({WINDOW} months)")
print(f"Crossref query     {QUERY!r}" + ("" if QUERY == FAMILY else f"  (rarest token of {FAMILY!r})"))
print(f"Crossref scanned   {scanned} of {total} works, {len(hits)} carry the surname {FAMILY!r}")
if overflow:
    print(f"!! {QUERY!r} is too common to enumerate: stopped at {MAX_SCAN} of {total}.")
    print(f"!! Name evidence is switched off; only ORCID-anchored works are attributed.")
    if not ORCID:
        sys.exit(f"!! No ORCID iD given, so nothing can be attributed to this person with "
                 f"confidence. Supply COA_ORCID, or build Table 4 from your CV.")
print(f"attributed         {len(certain)}  ({len(accepted)} inside the window,"
      f" {len(edge)} in the {GRACE}-day grace band)")
print(f"  on the spelled-out given name alone  {len(byname)}   -> check these")
if sole:
    print(f"  no other {FAMILY!r} publishes in this window, so initial-only bylines were accepted")
print(f"same surname, initial only, unresolved  {len(maybe)}   -> listed, not counted")
print(f"same surname, other people in this window  {len(other)} works by {others[:12]}")

json.dump({"family": FAMILY, "given": GIVEN, "orcid": ORCID, "surnames": sorted(SURNAMES),
           "asof": ASOF.isoformat(), "cutoff": CUTOFF.isoformat(), "early": EARLY.isoformat(),
           "overflow": overflow, "scanned_total": total, "scanned": scanned,
           "accepted": {d: {"date": pubdate(i), "title": (i.get("title") or [""])[0],
                            "type": i.get("type"), "author": i.get("author") or []}
                        for d, i in accepted.items()},
           "edge": {d: {"date": pubdate(i), "title": (i.get("title") or [""])[0]}
                    for d, i in edge.items()},
           "byname_only": sorted(byname), "other_people": others, "sole_bearer": sole,
           "unresolved": {d: {"date": pubdate(i), "title": (i.get("title") or [""])[0]}
                          for d, i in maybe.items()}},
          open("coa_works.json", "w"), ensure_ascii=False)
```

## Build the Table 4 co-author rows

```python
# coa_rows.py -- accepted works -> Table 4 'A:' rows, in Last, First, Middle Initial form.
import json, re, unicodedata, datetime as dt

W = json.load(open("coa_works.json"))
ME = (W["family"], W["given"])

def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^a-z]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())

def tidy(s):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", s or "")).strip(" ,;")

STREET = re.compile(r"\b\d{1,6}\s+\w+\s+(street|st|avenue|ave|road|rd|drive|dr|boulevard|"
                    r"blvd|lane|ln|way|court|ct)\b|\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b"
                    r"|\b\d{5}(-\d{4})?\b", re.I)

def affiliation(raw):
    """NSF: may include a location, must not include a street address, 255 characters."""
    parts = [p for p in (tidy(x) for x in re.split(r"\s*[;|]\s*|,(?=\s*[A-Z])", raw or "")) if p]
    parts = [p for p in parts if not STREET.search(p)]
    return tidy(", ".join(dict.fromkeys(parts)))[:255]

def coa_name(a):
    fam, giv = tidy(a.get("family")), tidy(a.get("given"))
    giv = re.sub(r"\.(?=[^\s.])", ". ", giv)                 # 'S.E.' -> 'S. E.'
    toks = [t for t in re.split(r"\s+", giv) if t]
    first = toks[0] if toks else ""
    mid = " ".join(t if t.endswith(".") else t[0] + "." for t in toks[1:])
    sfx = tidy(a.get("suffix"))
    fam = f"{fam} {sfx}" if sfx else fam
    return tidy(f"{fam}, {first} {mid}") if first else fam

def fullness(given, family):
    g, f = tidy(given), tidy(family)
    return (len(g), sum(1 for c in g + f if ord(c) > 127))

def gtoks(s): return [t for t in re.split(r"[\s.\-]+", fold(s)) if t]
def first_len(s): t = gtoks(s); return len(t[0]) if t else 0
def compatible(x, y):
    a, b = gtoks(x), gtoks(y)
    if not a or not b: return False
    for i in range(min(len(a), len(b))):
        if not (a[i].startswith(b[i]) or b[i].startswith(a[i])): return False
    return True

# The senior person is filed under more spellings than the one you typed: Crossref carries
# 'van der Schaar, M.' and 'Schaar, Mihaela v. d.' for the same author. Recognising only the
# exact form puts the subject into their own Table 4 as their own conflict.
SUR = set(W["surnames"])
def is_subject(a):
    return fold(a.get("family")) in SUR and compatible(a.get("given"), ME[1])

people, groups, selves = {}, {}, set()
for doi, w in W["accepted"].items():
    for a in w["author"]:
        if a.get("name") and not a.get("family"):            # a consortium, not a person
            groups.setdefault(tidy(a["name"]), []).append(doi); continue
        if is_subject(a):
            selves.add(coa_name(a)); continue                 # the senior person themself
        orc = (a.get("ORCID") or "").rsplit("/", 1)[-1]
        key = orc or (fold(a.get("family")), fold(a.get("given")))
        p = people.setdefault(key, {"name": coa_name(a), "orcid": orc, "aff": "", "last": "",
                                    "aff_date": "", "n": 0, "given_raw": tidy(a.get("given"))})
        p["n"] += 1
        if w["date"] and w["date"] > p["last"]:
            p["last"] = w["date"]                             # Last Active: newest joint work
        aff = affiliation((a.get("affiliation") or [{}])[0].get("name", ""))
        # Take the newest affiliation that exists. Overwriting a known affiliation with the
        # blank a later publisher deposited loses the only answer there was.
        if aff and w["date"] >= p["aff_date"]:
            p["aff"], p["aff_date"] = aff, w["date"]
        # Prefer the fullest spelling, and among equals the one that kept its diacritics:
        # 'Aragón' and 'Aragon' are one deposit spelled two ways.
        if fullness(a.get("given"), a.get("family")) > fullness(p["given_raw"], p["name"]):
            p["name"], p["given_raw"] = coa_name(a), tidy(a.get("given"))

# One person still splits into several rows: an ORCID on one deposit and none on the next,
# 'Aragón' against 'Aragon', 'Juan L.' against 'Juan Luis'. Merge inside a surname only when
# the given names are compatible token by token, and never merge two different ORCIDs --
# those are, by assertion, two people.
merged = 0
for fam in {fold(p["name"].split(",")[0]) for p in people.values()}:
    grp = sorted([k for k, p in people.items() if fold(p["name"].split(",")[0]) == fam],
                 key=lambda k: (not people[k]["orcid"], -len(people[k]["given_raw"])))
    for k in list(grp):
        if k not in people: continue
        for j in list(grp):
            if j == k or j not in people or k not in people: continue
            a, b = people[k], people[j]
            if a["orcid"] and b["orcid"] and a["orcid"] != b["orcid"]: continue
            if not compatible(a["given_raw"], b["given_raw"]): continue
            # 'Abbott, B.' and 'Abbott, B. P.' are compatible and may be two people. Merge on
            # initials alone only when an ORCID vouches for one side.
            initials_only = min(first_len(a["given_raw"]), first_len(b["given_raw"])) < 2
            if initials_only and not (a["orcid"] or b["orcid"]): continue
            a["n"] += b["n"]; a["orcid"] = a["orcid"] or b["orcid"]
            if b["last"] > a["last"]: a["last"] = b["last"]
            if b["aff"] and b["aff_date"] > a["aff_date"]: a["aff"], a["aff_date"] = b["aff"], b["aff_date"]
            if not a["aff"] and b["aff"]: a["aff"], a["aff_date"] = b["aff"], b["aff_date"]
            people.pop(j); merged += 1

rows, notes = [], []
for k, p in sorted(people.items(), key=lambda kv: fold(kv[1]["name"])):
    first = p["name"].split(", ")[-1].split(" ")[0] if ", " in p["name"] else ""
    if not first:
        notes.append((p["name"], "no given name in the publisher's deposit"))
    elif len(first.rstrip(".")) == 1:
        notes.append((p["name"], "given name deposited as an initial only"))
    if not p["aff"]:
        notes.append((p["name"], "no organizational affiliation in any deposit"))
    if not p["orcid"]:
        notes.append((p["name"], "no ORCID -- matched on name, may be two people or one"))
    rows.append({"code": "A:", "name": p["name"], "aff": p["aff"], "optional": "",
                 "last": dt.date.fromisoformat(p["last"]).strftime("%m/%d/%Y") if p["last"] else "",
                 "n_works": p["n"]})

# Table 1 is the senior person's own affiliations in the last 12 months. The only thing a
# publication record can offer is the affiliation they printed on recent work, which lags a
# move by a year or more -- so it is a proposal, not an answer.
def a_year_before(d):
    try: return d.replace(year=d.year - 1)
    except ValueError: return d.replace(year=d.year - 1, day=28)   # 29 February

asof = dt.date.fromisoformat(W["asof"])
twelve = a_year_before(asof).isoformat()
own = {}
for doi, w in W["accepted"].items():
    if not w["date"] or w["date"] < twelve: continue
    for a in w["author"]:
        if is_subject(a):
            aff = affiliation((a.get("affiliation") or [{}])[0].get("name", ""))
            if aff:
                # 'Department of Computer Science, Princeton University, Princeton, NJ' and
                # 'Princeton University' are one affiliation. Key on the segment naming the
                # organisation; keep the fullest spelling.
                org = next((p for p in aff.split(", ") if re.search(
                    r"universit|institut|college|laborator|academy|hospital|school|"
                    r"foundation|center|centre|corporation|company|inc\b|llc\b", p, re.I)), aff)
                cur = own.get(fold(org))
                if not cur or len(aff) > len(cur[0]):
                    own[fold(org)] = (aff, max(w["date"], cur[1] if cur else ""))
table1 = [{"name": f"{tidy(ME[0])}, {tidy(ME[1])}" if i == 0 else "", "aff": aff, "last": ""}
          for i, (aff, d) in enumerate(sorted(own.values(), key=lambda v: v[1], reverse=True))]
# Table 1 always carries the senior person's name, even when no recent deposit says where
# they are. A blank affiliation is a compliant answer; a Table 1 with no name is not.
if not table1:
    table1 = [{"name": f"{tidy(ME[0])}, {tidy(ME[1])}", "aff": "", "last": ""}]

sizes = sorted(((len(w["author"]), d) for d, w in W["accepted"].items()), reverse=True)
json.dump({"rows": rows, "notes": notes, "consortia": groups, "table1": table1,
           "self_spellings": sorted(selves),
           "largest_works": [{"doi": d, "n_authors": n, "title": W["accepted"][d]["title"][:90]}
                             for n, d in sizes[:5]]},
          open("coa_table4a.json", "w"), ensure_ascii=False)
print(f"accepted works                {len(W['accepted'])}")
print(f"rows merged as one person     {merged}")
print(f"Table 4 'A:' rows             {len(rows)}")
print(f"  carrying an ORCID           {sum(1 for p in people.values() if p['orcid'])}")
print(f"  with no affiliation         {sum(1 for r in rows if not r['aff'])}")
print(f"consortium author entries     {len(groups)}")
print(f"name spellings treated as you {len(selves)}  {sorted(selves)}")
print(f"Table 1 affiliations, last 12 months  {len(table1)}")
for n, d in sizes[:3]:
    print(f"  largest single contributor: {n:>4} authors  {d}")
```

Four things this had to be taught, each of which produced a wrong file first:

- **Do not overwrite a known affiliation with a later blank.** Publishers differ: on
  `10.1145/3674151` all 33 authors carry an affiliation, and on `10.1016/j.future.2024.04.060`
  none of the 128 do. Taking "the affiliation on the newest paper" loses everything the
  earlier deposits knew.
- **De-duplicate on the identifier first, then on compatible names, never on initials alone.**
  Keying only on the ORCID left thirteen duplicate rows on one real record, because a person
  with an iD on one deposit and none on the next becomes two people. Merging
  `Abbott, B.` into `Abbott, B. P.` when neither carries an ORCID would collapse people who
  may be two. Splitting a person over-reports a conflict, which costs nothing; merging two
  people under-reports one, which is the actual compliance risk. When in doubt, split.
- **Prefer the accented spelling.** `Aragón` and `Aragon` are the same deposit spelled two
  ways, and the accented one is the person's name.
- **A `family` with no `given` is a name, not a defect.** Mononyms and deposits that put the
  whole name in `family` produce a one-part row. Write it as deposited and flag it; there is
  nothing to invent.

## Table 4 `C:` — project collaborators, from NSF's own award record

`A:` is co-authorship. `C:` is collaboration on projects — funded awards, graduate research —
and no bibliographic source has it. NSF's own award API does, for the NSF half of it.

Two traps, both confirmed against the live service:

- **`offset` is 0-based**, although NSF documents its default as `1`. Starting a paging loop
  at `offset=1`, which the documentation invites, silently drops the first award. It cost one
  award and one collaborator on the worked example here.
- **`printFields` is accepted and ignored.** The service returns its full record whatever you
  ask for.

`pdPIName` matches the person in either role, so this finds awards where they are the PI and
awards where they are a co-PI on someone else's.

```python
# coa_awards.py -- Table 4 'C:' rows from NSF's award record.
import json, re, datetime as dt, requests

W = json.load(open("coa_works.json"))
FAMILY, GIVEN = W["family"], W["given"]
ASOF   = dt.date.fromisoformat(W["asof"]); CUTOFF = dt.date.fromisoformat(W["cutoff"])
S = requests.Session(); S.headers["User-Agent"] = "nsf-coa/1.0 (https://heurekaskills.com)"

def mdy(s):
    try: return dt.datetime.strptime(s, "%m/%d/%Y").date()
    except (TypeError, ValueError): return None

def a_year_before(d):
    try: return d.replace(year=d.year - 1)
    except ValueError: return d.replace(year=d.year - 1, day=28)   # 29 February

awards, offset = [], 0
while True:
    page = S.get("https://api.nsf.gov/services/v1/awards.json",
                 params={"pdPIName": f"{GIVEN} {FAMILY}", "rpp": 25, "offset": offset},
                 timeout=60).json().get("response", {}).get("award", [])
    awards += page
    if len(page) < 25: break
    offset += 25

def person(s):
    """'Julia B Hirschberg (Former) julia@cs.columbia.edu' -> ('Hirschberg, Julia B.', email)"""
    s = re.sub(r"\((?:Former|Principal Investigator)\)", " ", s or "")
    toks = [t for t in s.split() if t]
    email = next((t for t in toks if "@" in t), "")
    toks = [t for t in toks if "@" not in t]
    if not toks: return None, ""
    fam, giv = toks[-1], toks[:-1]
    first = giv[0] if giv else ""
    mid = " ".join(t if t.endswith(".") else t[0] + "." for t in giv[1:])
    return re.sub(r"\s+", " ", f"{fam}, {first} {mid}").strip(" ,"), email

live, seen = 0, {}
for a in awards:
    start, exp = mdy(a.get("startDate")), mdy(a.get("expDate"))
    if exp and exp < CUTOFF: continue                 # the project ended before the window
    if start and start > ASOF: continue
    live += 1
    names = list(a.get("coPDPI") or [])
    if f"{a.get('piLastName','')}".lower() != FAMILY.lower():
        names.append(" ".join(x for x in [a.get("piFirstName"), a.get("piLastName"),
                                          a.get("piEmail")] if x))
    for n in names:
        name, email = person(n)
        if not name or name.split(",")[0].lower() == FAMILY.lower(): continue
        r = seen.setdefault(name, {"code": "C:", "name": name, "aff": "", "optional": email,
                                   "last": "", "awards": []})
        r["awards"].append(a.get("id"))
        if not r["aff"]: r["aff"] = (a.get("awardeeName") or "")[:255]
        end = exp.strftime("%m/%d/%Y") if exp and exp < ASOF else ""   # blank means ongoing
        if end > r["last"]: r["last"] = end

rows = sorted(seen.values(), key=lambda r: r["name"].lower())
own_org = sorted({(a.get("awardeeName") or "") for a in awards
                  if (mdy(a.get("expDate")) or ASOF) >= a_year_before(ASOF)} - {""})
json.dump({"rows": rows, "n_awards": len(awards), "n_live": live, "own_org": own_org},
          open("coa_table4c.json", "w"), ensure_ascii=False)

print(f"NSF awards naming {GIVEN} {FAMILY}   {len(awards)}   ({live} overlapping the window)")
print(f"Table 4 'C:' rows                 {len(rows)}")
print(f"awardee organizations, last 12 months  {own_org}")
```

Column D is the template's optional email-and-department field, for disambiguating common
names. The `C:` rows carry the address NSF itself published on the award. The `A:` rows leave
it blank — a publisher deposit has no reliable current email, and a stale one in a
conflict-of-interest document is worse than an empty cell.

This covers **NSF** awards only. Collaboration on a DOE, NIH, foundation or internal project
is equally reportable and equally invisible here.

## Tables 1, 2, 3 and 5 — what only the senior person can supply

Nothing in any bibliographic or award source identifies a spouse, a Ph.D. thesis advisee or an
editorial board seat. Left alone, those three tables ship empty — which is honest, and which
the summary says out loud. To complete them, write `coa_manual.json` beside the scripts; the
writer merges it. Omit a key and that table stays empty.

```json
{
  "table1": [{"name": "Martonosi, Margaret", "aff": "Princeton University, Princeton, NJ", "last": ""}],
  "table2": [{"code": "R:", "name": "Surname, Given M.", "relationship": "Spouse", "optional": "", "last": ""}],
  "table3": [{"code": "G:", "name": "Surname, Given M.", "aff": "University of Somewhere", "optional": ""},
             {"code": "T:", "name": "Surname, Given M.", "aff": "", "optional": ""}],
  "table5": [{"code": "B:", "name": "Surname, Given M.", "aff": "Some University", "journal": "Journal Name", "last": ""}]
}
```

A `T:` row with an empty affiliation is correct where a former student's current employer is
genuinely unknown — NSF asks for it "if known". The summary names every blank so none of them
reaches a submission unnoticed.

## Write the workbook

Three things `openpyxl` will not do for you, and each one fails silently:

- **`insert_rows` moves neither the table ranges nor the data validations.** Insert 200 rows
  into Table 4 and the table still claims `A51:E56`, the `A:`/`C:` dropdown still covers five
  cells, and every date validation still points at the old block. Rebuild both from the final
  geometry.
- **Inserted rows carry no formatting.** Copy the style cell by cell from the last original
  data row, or the new rows arrive without the template's borders.
- **Clearing a cell's value leaves its hyperlink.** The template's Table 3 example carries a
  live `mailto:example@example.com`. Clear `cell.hyperlink` too, or that link ships to a
  federal agency inside your document.

Insert bottom-up. Rows added below a table never move the tables above it, so every header row
computed from the untouched file stays valid until its own turn.

```python
# coa_write.py -- write the filled COA workbook.
import json, os, re, warnings, datetime as dt
from copy import copy
import openpyxl
from openpyxl.worksheet.datavalidation import DataValidation
warnings.filterwarnings("ignore", message="Unknown extension is not supported")

A4 = json.load(open("coa_table4a.json"))
C4 = json.load(open("coa_table4c.json"))
MANUAL = json.load(open("coa_manual.json")) if os.path.exists("coa_manual.json") else {}

# A person who is both a co-author and a co-PI is one row. Co-authorship is the harder
# evidence, so it keeps the row and 'A:' keeps the code.
seen = {r["name"].lower() for r in A4["rows"]}
both = [r["name"] for r in C4["rows"] if r["name"].lower() in seen]
t4 = A4["rows"] + [r for r in C4["rows"] if r["name"].lower() not in seen]

t1 = MANUAL.get("table1") or (A4["table1"] +
     [{"name": "", "aff": o, "last": ""} for o in C4["own_org"]
      if not any(o.lower() in r["aff"].lower() for r in A4["table1"])])
rows = {"1": t1, "2": MANUAL.get("table2", []), "3": MANUAL.get("table3", []),
        "4": t4, "5": MANUAL.get("table5", [])}

FIELDS = {"1": ["", "name", "aff", "last"],
          "2": ["code", "name", "relationship", "optional", "last"],
          "3": ["code", "name", "aff", "optional"],
          "4": ["code", "name", "aff", "optional", "last"],
          "5": ["code", "name", "aff", "journal", "last"]}
DATE_COL = {"1": 4, "2": 5, "4": 5, "5": 5}

wb = openpyxl.load_workbook("coa_template.xlsx")
ws = wb.active
tbl = {str(ws.cell(int(t.ref.split(":")[0][1:]), 1).value).strip(): t for t in ws.tables.values()}
geom = {n: (int(t.ref.split(":")[0][1:]), int(t.ref.split(":")[1][1:]),
            ord(t.ref.split(":")[1][0]) - 64) for n, t in tbl.items()}

links = 0
for n, (hdr, last, ncol) in geom.items():
    for r in range(hdr + 1, last + 1):
        for c in range(1, ncol + 1):
            cell = ws.cell(r, c)
            if cell.hyperlink is not None:
                cell.hyperlink = None; links += 1
            cell.value = None

extra = {n: max(0, len(rows[n]) - (geom[n][1] - geom[n][0])) for n in geom}
for n in sorted(geom, reverse=True):
    if not extra[n]: continue
    hdr, last, ncol = geom[n]
    ws.insert_rows(last + 1, extra[n])
    for r in range(last + 1, last + 1 + extra[n]):
        ws.row_dimensions[r].height = ws.row_dimensions[last].height
        for c in range(1, ncol + 1):
            ws.cell(r, c)._style = copy(ws.cell(last, c)._style)

shift = {n: sum(extra[m] for m in geom if geom[m][0] < geom[n][0]) for n in geom}
final = {n: (geom[n][0] + shift[n], geom[n][1] + shift[n] + extra[n], geom[n][2]) for n in geom}

# Rebuild every range and validation from the final geometry. The orphan dropdown at A33 is
# dropped: it offers 'P:' for postdoctoral sponsors, which the template's own instructions
# retire, it belongs to no table, and after insertion it would land inside Table 2.
CODES = {"2": '"R:"', "3": '"G:,T:"', "4": '"A:,C:"', "5": '"B:,E:"'}
ws.data_validations.dataValidation = []
date_sq = []
for n, (hdr, last, ncol) in final.items():
    t = tbl[n]
    t.ref = f"A{hdr}:{chr(64+ncol)}{last}"
    if t.autoFilter is not None: t.autoFilter.ref = t.ref
    if n in CODES:
        dv = DataValidation(type="list", formula1=CODES[n], allowBlank=True)
        dv.add(f"A{hdr+1}:A{last}"); ws.add_data_validation(dv)
    if n in DATE_COL:
        date_sq.append(f"{chr(64+DATE_COL[n])}{hdr+1}:{chr(64+DATE_COL[n])}{last}")
dv = DataValidation(type="date", operator="between", formula1=1, formula2=402133, allowBlank=True,
                    errorTitle="Invalid Date Format",
                    error="The date entered is invalid. Please enter a date using the "
                          "following format mm/dd/yyyy or m/d/yyyy.")
for sq in date_sq: dv.add(sq)
ws.add_data_validation(dv)

written = 0
for n, (hdr, last, ncol) in final.items():
    for i, row in enumerate(rows[n]):
        r = hdr + 1 + i
        for c, field in enumerate(FIELDS[n][:ncol], start=1):
            v = row.get(field, "") if field else ""
            if not v: continue
            cell = ws.cell(r, c)
            if c == DATE_COL.get(n) and re.fullmatch(r"\d{2}/\d{2}/\d{4}", str(v)):
                cell.value = dt.datetime.strptime(v, "%m/%d/%Y").date()
                # The instruction rows require mm/dd/yyyy; the shipped example cells render
                # mm-dd-yy. Follow the instruction, which is the requirement.
                cell.number_format = "mm/dd/yyyy"
            else:
                cell.value = str(v)[:255]
            if cell.font.sz and cell.font.sz > 10:          # NSF: 10pt or smaller
                f = copy(cell.font); f.sz = 10; cell.font = f
            written += 1

wb.save("COA.xlsx")
print(f"example rows cleared, live hyperlinks removed  {links}")
print("rows inserted   " + "  ".join(f"T{n}+{extra[n]}" for n in sorted(extra) if extra[n]))
print("final ranges    " + "  ".join(f"T{n} {tbl[n].ref}" for n in sorted(final)))
print(f"cells written   {written}")
print("table rows      " + "  ".join(f"T{n}={len(rows[n])}" for n in sorted(rows)))
print(f"co-author and co-PI merged into one row  {len(both)}  {both}")
json.dump({"table_rows": {n: len(rows[n]) for n in rows}, "both": both,
           "final_ranges": {n: tbl[n].ref for n in final}, "hyperlinks_removed": links},
          open("coa_written.json", "w"), ensure_ascii=False)
```

## Check it before uploading

Run this every time. It is the difference between a file that looks right and one that is.

```python
# coa_check.py -- prove the workbook is submittable.
import re, sys, zipfile, warnings, openpyxl
warnings.filterwarnings("ignore", message="Unknown extension is not supported")

z = zipfile.ZipFile("COA.xlsx")
blob = b"".join(z.read(n) for n in z.namelist())
ws = openpyxl.load_workbook("COA.xlsx").active
tbl = {str(ws.cell(int(t.ref.split(":")[0][1:]), 1).value).strip(): t for t in ws.tables.values()}
span = {n: tuple(int(x[1:]) for x in t.ref.split(":")) for n, t in tbl.items()}

def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    return ok

# 'TODO' as a word, not as a substring: Synge Todo is a real co-author on a real record, and
# a case-insensitive search for 'todo' flags him as a placeholder.
PLACEHOLDER = re.compile(rb"\bTBD\b|\bTODO\b|\bFIXME\b|\[\s*(fill|insert|enter|your|name)\b"
                         rb"|Surname, Given|Organization, City, ST|Journal Name")

good = True
good &= check("five tables present", len(tbl) == 5,
              " ".join(f"T{n} {tbl[n].ref}" for n in sorted(tbl)))
good &= check("no Alphaman example rows", b"Alphaman" not in blob and b"Samplename" not in blob)
good &= check("no example mailto: relationship", b"mailto:" not in blob)
good &= check("no placeholder text anywhere in the file", not PLACEHOLDER.search(blob))
for n in sorted(tbl):
    if n == "1": continue
    hdr, last = span[n]
    dv = [d for d in ws.data_validations.dataValidation
          if d.type == "list" and str(d.sqref) == f"A{hdr+1}:A{last}"]
    good &= check(f"Table {n} row-code dropdown covers every data row", bool(dv),
                  str(dv[0].sqref) if dv else "missing")
hdr, last = span["4"]
names = [(c.row, c.value) for c in ws["B"][hdr:last] if c.value]
good &= check("Table 4 has rows", bool(names), f"{len(names)} rows")
if names:
    good &= check("Table 4 filled rows all sit inside its range",
                  max(r for r, _ in names) <= last, f"last row {max(r for r, _ in names)}")
    mono = [v for _, v in names if ", " not in v]
    good &= check("every Table 4 name is Last, First or a deposited mononym",
                  all(v.strip() for _, v in names), f"{len(mono)} one-part name(s)")
    good &= check("every Table 4 row carries a code",
                  all(ws.cell(r, 1).value in ("A:", "C:") for r, _ in names))
    dates = [ws.cell(r, 5).value for r, _ in names if ws.cell(r, 5).value]
    good &= check("Last Active cells are real dates formatted mm/dd/yyyy",
                  all(hasattr(d, "year") for d in dates)
                  and all(ws.cell(r, 5).number_format == "mm/dd/yyyy"
                          for r, _ in names if ws.cell(r, 5).value),
                  f"{len(dates)} dated, {len(names) - len(dates)} blank")
    good &= check("inserted rows kept the template border style",
                  ws.cell(last, 2).border.left.style is not None)
sys.exit(0 if good else 1)
```

## Write the summary

The workbook is the deliverable and carries nothing but data. Everything the senior person
needs to know *about* it goes in a file beside it — what was proposed, what was inferred and
from where, what was decided for them, and what was left open and why. That is what turns one
shot they have to clean up into an exchange they can steer.

```python
# coa_summary.py -- the summary lives beside the workbook, never inside it.
import json, collections, datetime as dt

W  = json.load(open("coa_works.json"))
A4 = json.load(open("coa_table4a.json"))
C4 = json.load(open("coa_table4c.json"))
OUT = json.load(open("coa_written.json"))
by = collections.Counter(n for _, n in A4["notes"])

L = [f"# COA draft for {W['family']}, {W['given']} — what to check before you submit", "",
     f"Built {dt.date.today()} against the NSF COA template downloaded the same day. "
     f"Table 4 window: {W['cutoff']} to {W['asof']} (48 months).",
     "", "**This is a draft. NSF holds you, not this file, responsible for it.**", "",
     "## Proposed", ""]
L += [f"- Table 1 — {OUT['table_rows']['1']} affiliation row(s), read off your own publications "
      f"in the last 12 months and your NSF awardee organization.",
      f"- Table 4 — {OUT['table_rows']['4']} rows: {len(A4['rows'])} co-authors (`A:`) from "
      f"{len(W['accepted'])} works, {OUT['table_rows']['4'] - len(A4['rows'])} project collaborators "
      f"(`C:`) from {C4['n_live']} NSF awards overlapping the window.",
      "", "## Inferred", "",
      f"- Works: Crossref, searching the surname {W['family']!r} and the ORCID iD, and keeping "
      f"the {len(W['accepted']) + len(W['edge'])} that are yours.",
      f"- Attribution: {len(W['accepted']) + len(W['edge']) - len(W['byname_only'])} works matched "
      f"on an identifier; {len(W['byname_only'])} on your spelled-out given name alone."
      + (" Nobody else publishes under this surname in this window, so bylines carrying only "
         "your initial were accepted as well." if W.get("sole_bearer") else ""),
      f"- Names come from the publisher's deposit, which keeps given and family apart, so "
      f"Last, First, Middle Initial is read, not guessed.",
      f"- Affiliations are the newest one a publisher deposited for that person.", "",
      "## Decided on your behalf", ""]
L += [f"- One row per person. Two records were merged only when the given names were compatible "
      f"and no two different ORCIDs were involved.",
      f"- A co-author who is also an NSF co-PI gets one row coded `A:`"
      + (f" — {'; '.join(OUT['both'])}." if OUT["both"] else "."),
      (f"- {len(A4['self_spellings'])} spellings of your own name were recognised as you and "
       if len(A4['self_spellings']) != 1 else "- One spelling of your own name was recognised "
       "as you and ")
      + f"kept out of Table 4: {'; '.join(A4['self_spellings'])}. Confirm each one is really "
      f"you and not a namesake.",
      f"- `Last Active` is the date of your most recent joint work; blank means ongoing.",
      f"- Dates are written mm/dd/yyyy, which the template's instruction rows require. The "
      f"template's own example cells display mm-dd-yy; the instruction wins.",
      f"- The template's example rows were cleared, including the live `mailto:` link behind "
      f"one of them, and its orphan `P:` dropdown was dropped.", "",
      "## Left blank, deliberately", ""]
L += [f"- **Table 2** (relationships precluding review) — nothing in a publication record "
      f"identifies a spouse, relative or business partner. Only you can fill this.",
      f"- **Table 3** (Ph.D. advisors and all Ph.D. thesis advisees) — lifetime scope, in no "
      f"bibliographic source. A blank Table 3 is almost certainly wrong for you. Master's and "
      f"undergraduate students do not belong here; postdoctoral sponsors are no longer reported.",
      f"- **Table 5** (editorial boards and co-editors, 24 months) — in no bibliographic source. "
      f"The template's definition is narrow: editors-in-chief and people who perform or manage "
      f"editing, not Editorial Advisory, International Advisory or Scientific Editorial Boards. "
      f"NSF also says not to list editors you met by submitting a paper to them.",
      f"- **Optional column D** on the `A:` rows — publisher deposits carry no reliable current "
      f"email. The `C:` rows carry the email NSF published on the award.",
      f"- {by['no organizational affiliation in any deposit']} of {len(A4['rows'])} co-author rows "
      f"have no affiliation. NSF asks for it \"if known\"; blank is compliant and a guess is not.",
      *([] if A4["table1"][0]["aff"] else
        ["- **Your own Table 1 affiliation** — no publication in the last 12 months and no "
         "current NSF award carried one. Your name is there; fill the organization in."]), ""]
L += ["## Outstanding — your call", ""]
if W.get("overflow"):
    L += [f"- **The surname search did not complete.** Crossref holds {W['scanned_total']} works "
          f"in this window matching {W['family']!r} and the scan stopped early. Only works "
          f"carrying your ORCID iD were attributed. Table 4 is incomplete; finish it from "
          f"your CV."]
if W["edge"]:
    L += [f"- **{len(W['edge'])} work(s) just outside the 48-month boundary.** The template counts "
          f"collaboration, not publication, and says the publication date may be later. Add them "
          f"if the work happened inside the window:"]
    L += [f"  - {d} — {v['date']} — {v['title'][:80]}" for d, v in sorted(W["edge"].items())]
if A4["largest_works"] and A4["largest_works"][0]["n_authors"] >= 50:
    b = A4["largest_works"][0]
    L += [f"- **Hyperauthorship.** {b['n_authors']} of your co-author rows come from one work "
          f"({b['doi']}). NSF asks for co-authors \"with collaboration\"; whether every author of "
          f"a large multi-institution paper collaborated with you is your judgement. "
          f"Over-reporting costs nothing; under-reporting is the compliance risk."]
if W["unresolved"]:
    L += [f"- **{len(W['unresolved'])} work(s) with your surname and a compatible initial that "
          f"could not be tied to you.** Not counted. Review:"]
    L += [f"  - {d} — {v['title'][:80]}" for d, v in sorted(W["unresolved"].items())]
if W["other_people"]:
    L += [f"- Other people publishing under {W['family']!r} in this window were excluded on their "
          f"given name: {', '.join(W['other_people'][:20])}."]
L += [f"- **Preprint-only collaborations are not covered.** arXiv and Zenodo DOIs are registered "
      f"with DataCite, which Crossref does not index. Where a preprint has a published version "
      f"the co-authors are the same; where it does not, add them by hand.",
      f"- **Non-NSF funded collaboration is not covered.** DOE, NIH, foundation and internal "
      f"projects are equally reportable and are not in NSF's award record.",
      f"- **Thesis and preliminary-exam committee service** is real academic contact that none of "
      f"the five tables names. Defensible either way; the template does not settle it.",
      f"- **Unpublished and in-progress collaboration** is invisible to any bibliographic source, "
      f"and it is squarely inside NSF's 48-month window. Check it against your own records.", ""]
if by:
    L += ["## Per-row caveats", ""] + [f"- {n}: {c} row(s)" for n, c in by.most_common()] + [""]
L += ["## Before you upload", "",
      "- Upload the `.xlsx` to Research.gov as a Collaborators and Other Affiliations Single Copy "
      "Document. Never a PDF — that path is Grants.gov, for the PD/PI only, and additional senior "
      "personnel still need the `.xlsx` in Research.gov afterwards.",
      "- One COA per senior person. This file covers one.",
      "- Do not change column widths or the font type. Rows may be inserted; the instruction rows "
      "at the top may be deleted.", ""]
open("COA-summary.md", "w").write("\n".join(L))
print(f"COA.xlsx          {OUT['table_rows']}")
print(f"COA-summary.md    {len(L)} lines, {sum(1 for l in L if l.startswith('## '))} sections")
```

Run the whole thing:

```bash
for s in coa_spec coa_harvest coa_rows coa_awards coa_write coa_check coa_summary; do
  .venv/bin/python $s.py || exit 1
done
```

## How this behaves on your name

Measured 2026-08-27 across twelve researchers, over a 2022-08-27 to 2026-08-27 window. Which
of three regimes you land in is decided by how many people share your surname, not by how well
known you are:

- **Rare surname, nobody else publishing in the window.** *Martonosi* returns 39 surname hits,
  *Mavalvala* 65, and in both cases every hit is the same person. Bylines carrying only an
  initial are accepted, and Table 4 is as complete as Crossref is.
- **Shared surname, scan completes.** *Tardos* returns 75 hits and one other person;
  *Aragón* returns 3,336 and many. Works carrying your spelled-out given name are attributed,
  works carrying only an initial are listed for review rather than counted, and you should
  expect to add some by hand.
- **Surname too common to enumerate.** The surname query reports 122,538 matches for *Patel*
  in this window, 140,020 for *González*, 2,373,908 for *Wang*, and the scan stops at 6,000.
  Name evidence is switched off and only ORCID-anchored works are
  attributed; with no ORCID iD the run refuses outright. Both are the correct output — a
  Table 4 assembled from namesakes is confidently wrong, which is worse than absent.

**A compound surname is searched on its rarest part.** Crossref tokenises the query, so
`Orenes-Vera` matches 50,503 works because *Vera* is common, and `van der Schaar` matches
355,714. Searching *Orenes* returns 134 and *Schaar* 326, and filtering those on the whole
surname finds the person. Without that step both of these early- and mid-career researchers
would hit the overflow refusal and get nothing.

Hyperauthorship is a separate axis, and it is where the row count gets large. The same run
gives Martonosi 208 Table 4 rows and Mavalvala 3,637, because 2,207 of hers come from one
gravitational-wave paper. The workbook is written correctly either way; whether all 2,207 are
collaborators is a question the summary puts to the senior person rather than answering.

## What this cannot determine

State these to the senior person every time; they are the reason the output is a draft.

- **Tables 2, 3 and 5 in full.** Family, personal and business relationships; Ph.D. advisors
  and thesis advisees; editorial board and co-editor service. None is in any bibliographic
  source and none can be inferred.
- **Unpublished collaboration.** The window is 48 months and manuscripts take longer than
  that. Work in progress, work in revision and work that never published are all reportable
  and all invisible here.
- **Preprint-only collaborations.** arXiv and Zenodo DOIs are DataCite registrations, and
  Crossref does not index them. On the worked example, checked against a preprint-aware index,
  13 in-window arXiv preprints carried co-authors who appear on no Crossref-registered work in
  the window. Where a preprint has a published version the co-authors are the same; where it
  does not, they have to be added by hand.
- **Non-NSF project collaboration.** `C:` here covers NSF awards only.
- **Whether a namesake is you.** Where the surname is common the code refuses rather than
  guesses, and the refusal is the answer.
- **Current affiliations.** What a publisher deposited is where the person was when the paper
  was accepted, not where they are now.
- **Whether a 128-author paper is a collaboration.** NSF's wording is co-authors "with
  collaboration". The skill counts them all and says so; the senior person decides.

## Try it

**Data.** Two public sources, no account and no key:

- NSF's [COA template](https://www.nsf.gov/bfa/dias/policy/coa/coa_template.xlsx), a US
  Government work not subject to domestic copyright. Confirmed reachable 2026-08-27.
- The Crossref record for **GW150914** — Abbott et al., *Observation of Gravitational Waves
  from a Binary Black Hole Merger*, Phys. Rev. Lett. 116, 061102 (2016),
  `10.1103/physrevlett.116.061102`. The paper NSF's LIGO was built to write, and the messiest
  real author block in the literature: 1012 authors, most of them bylined as initials, and
  hundreds carrying an invisible U+2009 thin space inside the name. Crossref metadata is
  distributed under CC0.

**Run** — cold, in an empty directory:

```bash
python3 -m venv .venv
.venv/bin/pip -q --disable-pip-version-check install openpyxl requests
.venv/bin/python - <<'PY'
import re, sys, time, zipfile, unicodedata, warnings, datetime as dt
from copy import copy
import requests, openpyxl
from openpyxl.worksheet.datavalidation import DataValidation
warnings.filterwarnings("ignore", message="Unknown extension is not supported")
UA = {"User-Agent": "nsf-coa/1.0 (https://heurekaskills.com)"}

def get_json(url):                  # Crossref intermittently serves an HTML error page
    for attempt in range(5):
        r = requests.get(url, headers=UA, timeout=90)
        if r.ok and "json" in (r.headers.get("content-type") or ""):
            return r.json()
        time.sleep(2 * (attempt + 1))
    sys.exit(f"{url} did not return JSON after 5 tries: {r.status_code}")

# 1. NSF's template is the specification. Read it out of the file, not out of a guide.
open("coa_template.xlsx", "wb").write(requests.get(
    "https://www.nsf.gov/bfa/dias/policy/coa/coa_template.xlsx", headers=UA, timeout=60).content)
wb = openpyxl.load_workbook("coa_template.xlsx"); ws = wb.active
tbl = {str(ws.cell(int(t.ref.split(":")[0][1:]), 1).value).strip(): t for t in ws.tables.values()}
instr = [c.value for c in ws["A"] if c.row < 15 and isinstance(c.value, str) and c.value.strip()]
print(f"template   {len(tbl)} tables, {len(instr)} instruction rows, sheet {ws.title!r}")
for n in sorted(tbl):
    print(f"  Table {n}  {tbl[n].ref:<9} internal name {tbl[n].name!r}")
assert len(tbl) == 5 and sorted(tbl) == list("12345"), "the template no longer ships five numbered tables"
assert any("no longer required to be reported" in i for i in instr)
assert any("48 months" in i for i in instr) and any("last 12 months" in i for i in instr)

# 2. A real, named, public author block: GW150914, Abbott et al., PRL 116, 061102 (2016).
DOI = "10.1103/physrevlett.116.061102"
m = get_json(f"https://api.crossref.org/works/{DOI}")["message"]
au = m["author"]
thin = [a for a in au if "\u2009" in (a.get("given") or "") + (a.get("family") or "")]
print(f"\ncrossref   {DOI}")
print(f"  authors {len(au)}   initials-only given name "
      f"{sum(1 for a in au if len((a.get('given') or '').rstrip('.')) <= 2)}")
print(f"  non-ASCII author entries {sum(1 for a in au if not (str(a.get('family')) + str(a.get('given'))).isascii())}"
      f", of which {len(thin)} only because a U+2009 THIN SPACE sits inside the name, e.g. {thin[0]['given']!r}")

def tidy(s): return re.sub(r"\s+", " ", unicodedata.normalize("NFC", s or "")).strip(" ,;")
def coa_name(a):
    fam, giv = tidy(a.get("family")), re.sub(r"\.(?=[^\s.])", ". ", tidy(a.get("given")))
    t = [x for x in giv.split() if x]
    mid = " ".join(x if x.endswith(".") else x[0] + "." for x in t[1:])
    return tidy(f"{fam}, {t[0]} {mid}") if t else fam

rows = []
for a in au:
    if not a.get("family"): continue                 # a consortium line, not a person
    aff = tidy((a.get("affiliation") or [{}])[0].get("name", ""))[:255]
    rows.append({"code": "A:", "name": coa_name(a), "aff": aff, "last": "02/11/2016"})
assert not any(re.search("[\u00a0\u2009\u202f]", r["name"]) for r in rows), "invisible space survived"
assert all(re.match(r"^[^,]+(, \S.*)?$", r["name"]) for r in rows)
print(f"  Table 4 rows built {len(rows)}   first {rows[0]['name']!r}   accented {sum(1 for r in rows if not r['name'].isascii())}")

# 3. Write it. Clear every shipped example row and its hyperlink, insert bottom-up, then
#    rebuild the table ranges and the dropdowns -- openpyxl moves neither.
need = {"1": 0, "2": 0, "3": 0, "4": len(rows), "5": 0}
geom = {n: (int(t.ref.split(":")[0][1:]), int(t.ref.split(":")[1][1:]),
            ord(t.ref.split(":")[1][0]) - 64) for n, t in tbl.items()}
links = 0
for n, (h, l, c) in geom.items():
    for r in range(h + 1, l + 1):
        for col in range(1, c + 1):
            if ws.cell(r, col).hyperlink is not None: ws.cell(r, col).hyperlink = None; links += 1
            ws.cell(r, col).value = None
extra = {n: max(0, need[n] - (geom[n][1] - geom[n][0])) for n in geom}
for n in sorted(geom, reverse=True):
    if not extra[n]: continue
    h, l, c = geom[n]
    ws.insert_rows(l + 1, extra[n])
    for r in range(l + 1, l + 1 + extra[n]):
        for col in range(1, c + 1): ws.cell(r, col)._style = copy(ws.cell(l, col)._style)
shift = {n: sum(extra[m] for m in geom if geom[m][0] < geom[n][0]) for n in geom}
final = {n: (geom[n][0] + shift[n], geom[n][1] + shift[n] + extra[n], geom[n][2]) for n in geom}
ws.data_validations.dataValidation = []
for n, (h, l, c) in final.items():
    tbl[n].ref = f"A{h}:{chr(64+c)}{l}"
    if tbl[n].autoFilter is not None: tbl[n].autoFilter.ref = tbl[n].ref
    if n != "1":
        dv = DataValidation(type="list", allowBlank=True,
                            formula1={"2": '"R:"', "3": '"G:,T:"', "4": '"A:,C:"', "5": '"B:,E:"'}[n])
        dv.add(f"A{h+1}:A{l}"); ws.add_data_validation(dv)
h = final["4"][0]
for i, r in enumerate(rows):
    ws.cell(h + 1 + i, 1).value = r["code"]; ws.cell(h + 1 + i, 2).value = r["name"]
    ws.cell(h + 1 + i, 3).value = r["aff"]
    ws.cell(h + 1 + i, 5).value = dt.date(2016, 2, 11)
    ws.cell(h + 1 + i, 5).number_format = "mm/dd/yyyy"
wb.save("COA.xlsx")

blob = b"".join(zipfile.ZipFile("COA.xlsx").read(f) for f in zipfile.ZipFile("COA.xlsx").namelist())
out = openpyxl.load_workbook("COA.xlsx").active
t4 = {str(out.cell(int(t.ref.split(":")[0][1:]), 1).value).strip(): t.ref for t in out.tables.values()}["4"]
lastrow = int(t4.split(":")[1][1:])
dv4 = [d for d in out.data_validations.dataValidation if str(d.sqref) == f"A{h+1}:A{lastrow}"]
print(f"\nworkbook   Table 4 {t4}   {len(rows)} rows written, {links} live hyperlink(s) removed")
for label, ok in [
    ("no Alphaman example rows",            b"Alphaman" not in blob and b"Samplename" not in blob),
    ("no example mailto: relationship",     b"mailto:" not in blob),
    ("no placeholder text",                 not re.search(rb"\bTBD\b|\bTODO\b|\[\s*(fill|insert|your)\b", blob)),
    ("dropdown covers the last data row",   bool(dv4)),
    ("last row is inside the table range",  out.cell(lastrow, 2).value == rows[-1]["name"]),
    ("inserted rows kept the border style", out.cell(lastrow, 2).border.left.style is not None),
    ("accents survived the round trip",     out.cell(h + 1 + rows.index(next(r for r in rows if not r["name"].isascii())), 2).value.isascii() is False),
]:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    assert ok, label
print("\nTables 2, 3 and 5 are empty on purpose. No publication record names a spouse, a")
print("Ph.D. advisee or an editorial board, and a guess in a compliance document is worse")
print("than a blank. They are yours to fill.")
PY
```

**Expect.**

Invariants — true regardless of what NSF or Crossref return, so a failure means this page is
wrong:

- The template ships **five numbered tables** and its instruction rows still say postdoctoral
  and graduate advisors are no longer reported, that Table 4 is 48 months, and that Table 1 is
  12 months.
- Table 4's internal name is `TableD` and Table 3's is `TableC` — the internal names are not
  in table order, so keying on them puts co-authors in the advisee table.
- **No U+00A0, U+2009 or U+202F survives into a name.** Publisher deposits carry them, and a
  federal submission must not.
- After writing, the file contains **no `Alphaman`, no `mailto:` and no placeholder token**,
  the `A:`/`C:` dropdown covers every inserted row, the last written row sits inside the
  table range, inserted rows carry the template's borders, and accented names round-trip.

Observed 2026-08-27 against Crossref and NSF — these move if either reindexes, so a mismatch
is drift to investigate, not a bug:

```
template   5 tables, 13 instruction rows, sheet 'NSF COA Template'
  Table 1  A16:D21   internal name 'TableA'
  Table 2  A27:E32   internal name 'TableD23'
  Table 3  A37:D44   internal name 'TableC'
  Table 4  A51:E56   internal name 'TableD'
  Table 5  A63:E68   internal name 'TableD5'

crossref   10.1103/physrevlett.116.061102
  authors 1012   initials-only given name 680
  non-ASCII author entries 337, of which 311 only because a U+2009 THIN SPACE sits inside the name, e.g. 'B.\u2009P.'
  Table 4 rows built 1011   first 'Abbott, B. P.'   accented 27

workbook   Table 4 A51:E1062   1011 rows written, 1 live hyperlink(s) removed
  PASS  no Alphaman example rows
  PASS  no example mailto: relationship
  PASS  no placeholder text
  PASS  dropdown covers the last data row
  PASS  last row is inside the table range
  PASS  inserted rows kept the border style
  PASS  accents survived the round trip

Tables 2, 3 and 5 are empty on purpose. No publication record names a spouse, a
Ph.D. advisee or an editorial board, and a guess in a compliance document is worse
than a blank. They are yours to fill.
```

The 1012th author entry is the LIGO Scientific Collaboration itself, deposited with a `name`
and no `family`. It is not a person and does not belong in a COA, which is why the row count
is 1011.

## Where this ages

- **NSF's schedule, not ours.** Re-read the template and the senior-personnel-documents page
  before trusting the table layout, the windows or the upload route. `coa_spec.py` exists so
  that check is one command.
- **PAPPG 24-1 will be superseded.** NSF has signalled a replacement called *Guidance on
  Financial Assistance*. When it arrives, every date on this page needs re-checking.
- **Crossref's author metadata improves.** More ORCIDs and more affiliations mean fewer blank
  cells and fewer name-only attributions. Nothing here breaks; the summary just gets shorter.

## Sources

Read 2026-08-27.

- [NSF COA template](https://www.nsf.gov/bfa/dias/policy/coa/coa_template.xlsx) — the
  authoritative specification, served from NSF's file host. Where it and the PAPPG disagree,
  it wins, because it is what gets submitted.
- [Senior personnel documents](https://www.nsf.gov/funding/senior-personnel-documents) — NSF's
  guidance page, last updated 2026-04-13. Source of the Research.gov and Grants.gov upload
  rules and of the instruction not to list editors met through a paper submission.
- [PAPPG 24-1 Chapter II](https://www.nsf.gov/policies/pappg/24-1/ch-2-proposal-preparation) —
  II.D.2.h(iii) is the COA requirement; footnotes 35 and 36 carry the Editorial Board
  definition and the font-size allowance.
- [PAPPG 24-1 Exhibit II-2](https://www.nsf.gov/policies/pappg/24-1/ch-2-exhibit-2) —
  Potentially Disqualifying Conflicts of Interest. Names "current or former collaborator" and
  "former Ph.D. student/advisor" with no carve-out for large collaborations.
- [PAPPG policy page](https://www.nsf.gov/policies/pappg) — confirms PAPPG 24-1 in force with
  supplements NSF 26-200 (2025-12-08) and NSF 26-202 (2026-01-22).
- [Crossref REST API](https://api.crossref.org) — no sign-up, and Crossref states that
  "almost none of the metadata is subject to copyright, and you may use it for any purpose".
- [NSF Award Search API](https://api.nsf.gov/services/v1/awards.json) — public award records.
- [ORCID Public APIs Terms of Service](https://info.orcid.org/public-client-terms-of-service/)
  — the non-commercial licence grant that keeps ORCID's API out of this page.

NSF's template, its instructions and the PAPPG are US Government works and not subject to
domestic copyright. Short phrases are quoted where the exact wording is the requirement; the
rest of this page is original.
