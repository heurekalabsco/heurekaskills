---
name: journal-editor-finder
description: Find which of a journal's handling editors have recently handled papers closest to a manuscript, using only the published record — ranks named editors by the papers they actually took through review at that journal, excludes co-authors, flags institutional overlap, and reports plainly when a journal names no handling editor anywhere public.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [publishing, manuscript, peer-review, bibliometrics]
covers: [handling editor, academic editor, associate editor, reviewing editor, editorial board, editor matching, preferred editor, cover letter, manuscript submission, conflict of interest, coi, crossref, europe pmc, jats, editor assignment, peer review]
datasets: [https://api.crossref.org/journals?query=PLOS+Biology&rows=3, https://api.crossref.org/works/10.1371/journal.pbio.3003843, https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=JOURNAL%3A%22eLife%22&format=json&pageSize=1]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: Crossref REST API and Europe PMC RESTful Web Service as of 2026-08-27 / Python 3.12 / standard library only
  executed: 10
  unverified: 0
---
# Finding a journal's handling editor for a manuscript

Many journals let a submitting author name a preferred handling editor, and every author
wants to know who at a journal actually reads work like theirs. This skill answers that from
the published record: it takes the journal's own recent papers that are closest to the
manuscript, reads off **who handled each one**, and ranks those editors by how close their
recent load sits to the manuscript.

It never reads an editorial-board web page. Boards are published as rendered HTML in a
different layout per publisher, often per journal, and several publishers' terms restrict
automated access to their sites. Everything below comes from two documented public APIs that
exist to be queried — the **Crossref REST API**, whose deposits carry an `editor` field, and
the **Europe PMC RESTful Web Service**, whose open-access full text names the handling editor
in the article's JATS front matter.

That choice has a consequence worth stating before anything else: **a masthead lists everyone
on the board; this lists only editors who have handled a paper.** A new board member, or one
who handles work outside the open-access record, will not appear. What does appear is
evidenced by a specific paper you can read.

## How this differs from the two neighbouring skills

Three skills sit on the same submission workflow and they are not interchangeable.

| | asks | data |
|---|---|---|
| `journal-selection` | which journals publish work like this? | OpenAlex topics and journal statistics |
| `reviewer-scouting` | who could referee this, and who must be excluded? | OpenAlex authors, topics and institutions |
| this skill | who at *this* journal has handled work like this? | Crossref `editor` deposits, Europe PMC JATS |

The order they run in is venue, then editor, then reviewers. `journal-selection` produces the
journal this skill takes as input.

The data is different because it has to be. OpenAlex indexes works, sources, authors and
institutions and carries **no editorial-board field of any kind**, so nothing in the venue and
reviewer skills could be reused for the acquisition half. It is also different in kind: the
neighbouring skills vote over an assigned topic taxonomy, and this one matches manuscript text
against the journal's own papers through Crossref's relevance index, because the pool being
searched is one journal rather than the whole literature.

Two consequences of not using OpenAlex, both in this skill's favour: **no API key is needed at
all**, and the daily budget that limits the neighbouring skills does not apply here.

## What this can and cannot be used for

The output is a list of **named real people**, proposed for a specific manuscript. That puts
obligations on it that a list of journals does not carry.

- **The inference is probabilistic and it is often wrong.** "This editor handled four papers
  near yours" is a fact about the record. "This editor is the right person for your paper" is
  a guess, and journals assign on workload, availability, board rotation, conflicts you cannot
  see, and an editor-in-chief's judgement — none of which is in any public dataset. Naming
  someone here is not a claim about them, their interests, or their willingness.
- **Never contact an editor directly about a manuscript.** A preferred-editor request belongs
  in the journal's own submission system — the cover letter field, or a "preferred editor" box
  where the journal offers one. An unsolicited email to an editor about an unsubmitted or
  under-review manuscript is an attempt to influence handling outside the process, and editors
  and publishers treat it that way. This skill deliberately collects **no contact details**:
  affiliation strings are stripped of email addresses and phone numbers before anything is
  printed, and there is no lookup that would recover one.
- **Only what the journal and the literature already publish.** Crossref metadata and Europe
  PMC open-access full text are the entire input. No publisher website is fetched, nothing
  behind a login is touched, and no personal detail beyond what a journal itself printed on an
  article is assembled.
- **Exclusion is the half that carries the most weight.** An editor who recently co-published
  with an author, or who sits in the same institution, is a conflict the journal will act on —
  and one an author can name in a cover letter before the journal has to. The screen below
  exists to remove those names, and removing a name is a more reliable act than proposing one.

Where an author is uneasy about naming anyone, the correct answer is to name nobody. A blank
preferred-editor field costs nothing.

## Setup

Standard library only, and no account, key or registration anywhere in this skill.

```bash
mkdir -p editor-finder && cd editor-finder
python3 -m venv .venv && . .venv/bin/activate
python3 -c "import urllib.request, xml.etree.ElementTree; print('nothing to install')"
```

**Put a real contact address in the User-Agent before the first call.** Crossref runs a
"polite pool" for requests that identify themselves, and the response header `x-api-pool`
tells you which pool you landed in — `polite-single` with a `mailto`, `public` without. The
observed limit on the polite pool is 10 requests per second (`x-rate-limit-limit: 10`,
`x-rate-limit-interval: 1s`). It is not a key and it is not verified; it is a courtesy the
service asks for, and a full run below costs about forty requests.

```python
import html, json, re, time, collections, unicodedata
import urllib.request, urllib.parse, urllib.error
import xml.etree.ElementTree as ET

MAILTO = "you@example.org"          # your own address; Crossref asks for one
UA = {"User-Agent": f"journal-editor-finder/1.0 (mailto:{MAILTO})"}
_last = [0.0]

def _open(url, timeout=120):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)

def _throttle(gap=0.15):
    d = time.time() - _last[0]
    if d < gap:
        time.sleep(gap - d)
    _last[0] = time.time()

def cr(path, **params):
    _throttle()
    url = "https://api.crossref.org/" + path + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            return json.load(_open(url))["message"]
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(2 ** attempt + 1)
                continue
            raise

def ep(path, **params):
    _throttle()
    url = ("https://www.ebi.ac.uk/europepmc/webservices/rest/" + path
           + "?" + urllib.parse.urlencode(params))
    return json.load(_open(url))

def fold(name):
    """Normalise a personal name so punctuation, accents and degrees stop mattering."""
    t = "".join(c for c in unicodedata.normalize("NFKD", name or "")
                if not unicodedata.combining(c))
    t = re.sub(r"[‐-―−-]", " ", t).replace(".", "")
    t = re.sub(r"\b(phd|md|dphil|dvm|msc|bsc|dr|prof)\b", "", t, flags=re.I)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", t.lower())).strip()

STOP = set("""a an and are as at be by for from how in into is it its of on or that the to we our
this these those with which was were been has have had can could may using via novel here show
shows showed reveal reveals identify identified results result study studies data analysis
approach method methods new both between during within across after before also however therefore
thus while whereas report demonstrate demonstrates suggest suggests remains role effects
effect""".split())

def clean(text):
    """Europe PMC returns titles with entity-escaped markup — `&lt;i&gt;Escherichia`."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html.unescape(text or ""))).strip()

def terms(text, k):
    """The k most repeated content words, in order of first appearance."""
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z0-9-]{2,}", text.lower()) if w not in STOP]
    freq, seen = collections.Counter(words), []
    for w in words:
        if w not in seen:
            seen.append(w)
    seen.sort(key=lambda w: -freq[w])
    return seen[:k]
```

## Step 1 — resolve the journal, and prove the ISSN works

Do not take the first result and do not take the first ISSN. Both are wrong often enough that
an unchecked lookup is the most likely way this skill returns a confidently empty answer.

```python
def find_journal(name, since, rows=5, sample=200):
    """Candidate journals, each ISSN probed for what it actually returns.

    Two failures make an unprobed lookup unsafe, and both are silent:

      * `/journals?query=` is a relevance search over titles. `Nature` returns
        *Naturen*, `The Lancet` returns *The Lancet Medical Imaging*, and
        `Journal of Neuroscience` returns *Journal of Pediatric Neurosciences* —
        in each case the journal you asked for is absent from the top three.
      * A journal's ISSNs are not interchangeable in the `issn:` filter. PLOS
        Biology returns 0 articles under 1544-9173 and 2,667 under 1545-7885;
        the Journal of Clinical Investigation returns 1 and 2,450; Bioinformatics
        returns 1,008 under one and 2,093 under the other. Taking the first ISSN
        reports an empty journal for a journal that is not empty, or half of one.
    """
    out = []
    for j in cr("journals", query=name, rows=rows)["items"]:
        issns = []
        for issn in (j.get("ISSN") or []):
            d = cr("works", rows=sample, select="DOI,editor",
                   filter=f"issn:{issn},from-pub-date:{since},type:journal-article")
            items = d["items"]
            issns.append({"issn": issn, "articles": d["total-results"],
                          "sampled": len(items),
                          "with_editor": sum(1 for w in items if w.get("editor"))})
        issns.sort(key=lambda r: -r["articles"])
        out.append({"title": j["title"], "publisher": j["publisher"],
                    "total_dois": (j.get("counts") or {}).get("total-dois"),
                    "issns": issns,
                    "best": issns[0] if issns else None})
    return out

def show_journals(cands):
    for c in cands:
        b = c["best"] or {}
        cov = (f'{b.get("with_editor", 0)}/{b.get("sampled", 0)} carry an editor'
               if b.get("sampled") else "no articles in window")
        print(f'{c["title"][:44]:44s} {c["publisher"][:22]:22s} '
              f'{b.get("issn", "-"):9s} {b.get("articles", 0):6d} articles, {cov}')
```

`show_journals` prints the evidence for the choice: the title, the publisher, the ISSN that
actually returns articles, and how many of a 200-article sample name an editor. Read it before
going on. If the journal you meant is not in the list, search a more distinctive part of its
title; if none of its ISSNs returns a plausible article count, the journal's Crossref record
does not support this skill and you should stop rather than proceed on the wrong ISSN.

The `with_editor` column is also the routing decision: a healthy count means step 3a will
work, and a zero means the journal deposits no editor and you need step 3b or nothing.

## Step 2 — the journal's own papers closest to the manuscript

```python
MAX_EDITORS_PER_PAPER = 2      # a handling editor is one person, occasionally two

def _editors_from_crossref(work):
    eds = [{"name": " ".join(x for x in [e.get("given"), e.get("family")] if x),
            "role": None,
            "affiliation": "; ".join(a.get("name", "") for a in (e.get("affiliation") or []))
                           or None}
           for e in (work.get("editor") or []) if e.get("family")]
    # A long editor list is a masthead, not a handling editor. The New England Journal of
    # Medicine deposits 8 or 9 editors on every Case Record — the same names each time, one
    # of them Richard C. Cabot, who died in 1939. The field is populated, well-formed, and
    # not what it looks like. Every journal that really names a handling editor deposits
    # 1 or 2: measured over 200 recent articles each, PLOS Biology 1, Genetics 1,
    # Bioinformatics 1, Molecular Biology and Evolution 1, mBio 1 or 2.
    return [] if len(eds) > MAX_EDITORS_PER_PAPER else eds

SKIP_TITLE = re.compile(r"^(correction|corrigendum|erratum|retraction|editorial|"
                        r"expression of concern)\b", re.I)

def similar_papers(issn, title, abstract, since, rows=100, widths=(4, 6, 8, 10, 12), cap=4000):
    """The journal's own recent papers most like this manuscript, each with its editor.

    `query.bibliographic` is a minimum-should-match query, not a re-ranking of the
    filtered set. Pool size is therefore NOT monotone in query length — on the
    manuscript in *Try it* it runs 21, 21, 48, 59, 264, 16 as the term count grows
    from 3 to 10 — and pasting a whole abstract collapses it to the paper itself.
    So several widths are probed and the widest pool under `cap` wins.
    """
    text = f"{title} {title} {abstract}"
    best, widest = None, None
    for k in widths:
        q = " ".join(terms(text, k))
        if len(q.split()) < 2:
            continue
        n = cr("works", rows=0, select="DOI",
               **{"query.bibliographic": q,
                  "filter": f"issn:{issn},from-pub-date:{since},type:journal-article"}
               )["total-results"]
        if not n:
            continue
        if widest is None or n < widest[0]:
            widest = (n, k, q)             # smallest pool, for a journal too big to narrow
        if n <= cap and (best is None or n > best[0]):
            best = (n, k, q)
    # A megajournal can exceed `cap` at every width. Taking the narrowest pool is worse
    # than taking none only if you do not say so — Scientific Reports and Cell Reports
    # both land here, and returning an empty result for them reads as "no editors".
    best = best or widest
    if best is None:
        return {"pool": 0, "width": None, "query": None, "papers": [], "over_cap": False}
    n, k, q = best
    d = cr("works", rows=min(rows, n), sort="score", order="desc",
           select="DOI,editor,title,score,issued",
           **{"query.bibliographic": q,
              "filter": f"issn:{issn},from-pub-date:{since},type:journal-article"})
    papers = []
    for w in d["items"]:
        t = (w.get("title") or [""])[0]
        if not t or SKIP_TITLE.match(t):
            continue
        papers.append({"doi": w["DOI"].lower(), "title": t, "score": w["score"],
                       "year": (w.get("issued") or {}).get("date-parts", [[None]])[0][0],
                       "editors": _editors_from_crossref(w)})
    return {"pool": n, "width": k, "query": q, "papers": papers, "over_cap": n > cap}
```

Two things about this that are easy to get wrong.

**Do not paste the abstract in as the query.** It is the obvious move and it silently destroys
the result. Passing the *Try it* manuscript's title and abstract as one string narrowed PLOS
Biology's 2,667 recent articles to exactly **one** — the paper itself — and every editor
ranking downstream would then have been computed from a single row.

**`over_cap` is a real caveat, not a debug flag.** When it is true the pool never came under
`cap` at any width, so the papers you are looking at are the narrowest slice of a very large
journal rather than a well-matched neighbourhood. Say so in the summary.

## Step 3a — Crossref's editor field

For journals whose publisher deposits it, `similar_papers` has already returned the editor on
each paper and there is nothing more to fetch. What Crossref carries is the *academic* editor:
on PLOS Biology it returns the external Academic Editor rather than the in-house Senior Editor,
which is the one that matters, because a staff editor handles across every subject and would
top any ranking regardless of the manuscript.

Crossref flattens the role to the bare word `editor`, so "Associate Editor", "Academic Editor"
and "Reviewing Editor" all arrive indistinguishable. Step 3b keeps the role.

## Step 3b — the handling editor in JATS full text

Journals that print an editor but deposit none to Crossref still put it in the full text they
send to PMC, and Europe PMC serves that as JATS XML over an open endpoint. This route also
recovers the **role**, and the affiliation the journal itself printed.

```python
EDITORISH = re.compile(r"\beditor\b", re.I)
CHIEF = re.compile(r"editor[- ]in[- ]chief|chief editor", re.I)
# An affiliation string routinely carries a personal email. Editors are never contacted
# directly, so an address is not a field this skill has any business collecting.
CONTACT = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+|electronic address\s*:.*$|tel[:.].*$", re.I)

def jats_editors(pmcid):
    """Handling editors named in an article's JATS front matter.

    Four shapes occur and only the first is the obvious one:
      contrib/@contrib-type="editor"                     PLOS, Molecular Biology and Evolution
      contrib-group/@content-type="editor"               PeerJ — the contrib carries no type
      contrib/role matching "editor", type absent        eLife, in the article body
      contrib/@contrib-type="author" with an editor role eLife and PLOS decision letters
    Keying on `contrib-type` alone silently returns nothing for two of the four, and
    accepting any contrib whose type is merely absent sweeps in every author.
    """
    root = ET.parse(_open("https://www.ebi.ac.uk/europepmc/webservices/rest/"
                          + pmcid + "/fullTextXML")).getroot()
    affs = {a.get("id"): " ".join(" ".join(a.itertext()).split())
            for a in root.iter("aff") if a.get("id")}
    found, seen = [], set()
    for group in root.iter("contrib-group"):
        group_is_editor = (group.get("content-type") or "") == "editor"
        for c in group.findall("contrib"):
            roles = [" ".join("".join(r.itertext()).split()) for r in c.findall("role")]
            role = roles[0] if roles else None
            editorish = bool(role and EDITORISH.search(role))
            if not (c.get("contrib-type") == "editor" or group_is_editor or editorish):
                continue
            if c.get("contrib-type") == "author" and not editorish:
                continue
            if role and CHIEF.search(role):
                continue
            nm = c.find("name")
            name = (" ".join(x for x in [nm.findtext("given-names"), nm.findtext("surname")] if x)
                    if nm is not None else " ".join("".join(c.itertext()).split())[:60])
            aff, inline = None, c.find("aff")
            if inline is not None:
                aff = " ".join(" ".join(t for t in inline.itertext()
                                        if not str(t).startswith("https://ror")).split())
            else:
                for x in c.findall("xref"):
                    if x.get("ref-type") == "aff" and affs.get(x.get("rid")):
                        aff = affs[x.get("rid")]
                        break
            key = (fold(name), role)
            if not key[0] or key in seen:
                continue
            seen.add(key)
            if aff:
                # The JATS `aff` carries the article's own label — "3 University of…".
                aff = re.sub(r"^\d+\s*", "", CONTACT.sub("", aff)).strip(" .,;")
            found.append({"name": name.strip(), "role": role, "affiliation": aff or None})
    return found

def similar_papers_fulltext(journal_title, title, abstract, since_year,
                            rows=40, widths=(6, 8, 10)):
    """Fallback for journals that print a handling editor but deposit none to Crossref.

    Europe PMC exposes no relevance score, so rank position stands in for one. The
    weights that follow are therefore comparable within a run and not across routes.
    """
    text = f"{title} {title} {abstract}"
    best = None
    for k in widths:
        q = (f'JOURNAL:"{journal_title}" AND OPEN_ACCESS:Y AND HAS_FT:Y '
             f'AND FIRST_PDATE:[{since_year}-01-01 TO 2099-12-31] '
             f'AND ({" OR ".join(terms(text, k))})')
        n = ep("search", query=q, format="json", pageSize=1, resultType="lite")["hitCount"]
        if n and (best is None or n > best[0]):
            best = (n, k, q)
    if best is None:
        return {"pool": 0, "width": None, "query": None, "papers": []}
    n, k, q = best
    d = ep("search", query=q, format="json", pageSize=rows, resultType="lite")
    papers = []
    for i, it in enumerate(d["resultList"]["result"]):
        if not it.get("pmcid") or SKIP_TITLE.match(clean(it.get("title", "")) or "x"):
            continue
        try:
            eds = jats_editors(it["pmcid"])
        except Exception:
            eds = []                       # one unparseable article must not end the run
        papers.append({"doi": (it.get("doi") or it["pmcid"]).lower(),
                       "title": clean(it.get("title", "")), "year": it.get("pubYear"),
                       "score": round(10.0 / (1 + i), 3),
                       "editors": eds if len(eds) <= MAX_EDITORS_PER_PAPER else []})
    return {"pool": n, "width": k, "query": q, "papers": papers}
```

This route costs one full-text fetch per paper, so keep `rows` modest — 25 is enough to rank,
and each article is a few hundred kilobytes.

`EDITOR:` is also a searchable field in Europe PMC, so once you have a name you can count that
person's whole handled record: `EDITOR:"Kohn Adam" AND JOURNAL:"PLoS biology"`. It does filter
— a nonsense name returns zero rather than everything.

## Step 4 — rank the editors

```python
def rank_editors(papers, exclude_dois=(), min_share=0.15, keep_papers=3):
    """Editors of the retrieved papers, weighted by how similar each paper was.

    Weighting by score rather than counting matters. On the *Try it* manuscript a plain
    count ties the true handling editor with two other people at three papers each; the
    score-weighted sum separates them and puts the true one first.

    Names are folded but never merged across different name strings. Crossref carries the
    same PLOS Biology editor as both `Raphael Kaplan` and `Raphael Samuel Matthew Kaplan`,
    and those stay two rows. A surname-based merge would join them — and would just as
    happily join two different people, which for a list of named individuals is the worse
    error. The duplicate is reported in the summary instead.
    """
    skip = {d.lower() for d in exclude_dois}
    agg = collections.defaultdict(lambda: {"weight": 0.0, "handled": 0, "best": 0.0,
                                           "names": set(), "roles": set(),
                                           "affiliations": set(), "papers": []})
    scored = 0
    for p in papers:
        if p["doi"] in skip or not p["editors"]:
            continue
        scored += 1
        for e in p["editors"]:
            key = fold(e["name"])
            if not key:
                continue
            r = agg[key]
            r["weight"] += p["score"]
            r["handled"] += 1
            r["best"] = max(r["best"], p["score"])
            r["names"].add(e["name"])
            if e.get("role"):
                r["roles"].add(e["role"])
            if e.get("affiliation"):
                r["affiliations"].add(e["affiliation"])
            r["papers"].append({"score": round(p["score"], 2), "year": p["year"],
                                "title": p["title"], "doi": p["doi"]})
    rows = []
    for key, r in agg.items():
        r["papers"].sort(key=lambda x: -x["score"])
        rows.append({"key": key, "name": max(r["names"], key=len),
                     "name_variants": sorted(r["names"]),
                     "weight": round(r["weight"], 2), "handled": r["handled"],
                     "best_match": round(r["best"], 2),
                     "roles": sorted(r["roles"]),
                     "printed_affiliations": sorted(r["affiliations"]),
                     "handled_papers": r["papers"][:keep_papers],
                     "institution": None, "institution_source": None,
                     "conflict": None, "flags": []})
    rows.sort(key=lambda r: -r["weight"])
    if rows:
        floor = rows[0]["weight"] * min_share
        for r in rows:
            if r["weight"] < floor:
                r["flags"].append("below the presentation floor")
    return {"editors": rows, "papers_scored": scored,
            "papers_without_editor": len(papers) - scored
                                     - len(skip & {p["doi"] for p in papers})}
```

The relevance tail is long, which is why `min_share` exists. Without it a run on a
neuroscience manuscript put an editor whose entire handled load was bacterial population
biology into the eighth row, on the strength of two weakly-matching papers.

## Step 5 — the conflict screen

Two exclusions, and they do not carry the same confidence. Co-authorship is checkable from the
record and is applied as a hard exclusion. Institution is not, and is applied as a flag.

```python
GENERIC = set("""department departments university universite universidad institute institut
institution centre center hospital college school faculty division laboratory laboratories unit
research national international state federal medical science sciences health clinical
biology biological chemistry physics engineering technology graduate program programme academy
usa china japan germany france india italy spain brazil canada australia korea netherlands
united kingdom states america and for the of""".split())

def _place(affiliation):
    """The distinctive words of an affiliation — the ones that name a particular place."""
    w = re.findall(r"[a-z][a-z-]{3,}", (affiliation or "").lower())
    return {x for x in w if x not in GENERIC}

def _clusters(affiliations):
    """Group affiliations sharing a distinctive word. Two groups is a dual appointment;
    several is several people who happen to share a name."""
    groups = []
    for a in affiliations:
        p = _place(a)
        hit = next((g for g in groups if g["words"] & p), None)
        if hit:
            hit["words"] |= p
            hit["affiliations"].append(a)
        else:
            groups.append({"words": set(p), "affiliations": [a]})
    return groups

def published_affiliations(name, tries=8, max_orgs=2):
    """Where this person publishes from, or a blank plus the reason it is blank.

    Matching is by name and nothing else, so a common name collapses several people.
    `Huan Luo` returns a chemist in Shantou, a plant scientist in Lanzhou and a chemist in
    Hong Kong — none of them the PLOS Biology editor of that name. When the matched records
    cluster into more than `max_orgs` unrelated affiliations the field is left genuinely
    empty and the reason travels with it, because a wrong institution is worse than none.
    """
    target = fold(name)
    if len([t for t in target.split() if len(t) > 1]) < 2:
        return {"institutions": [], "status": "initials only — not resolvable to a person"}
    r = ep("search", query=f'AUTH:"{name}"', format="json", pageSize=tries, resultType="core")
    seen = set()
    for rec in r["resultList"]["result"]:
        for a in (rec.get("authorList") or {}).get("author", []):
            full = " ".join(x for x in [a.get("firstName"), a.get("lastName")] if x)
            if fold(full) != target:
                continue
            for d in (a.get("authorAffiliationDetailsList") or {}).get("authorAffiliation", []):
                s = CONTACT.sub("", d.get("affiliation", "")).strip(" .,;")
                if s:
                    seen.add(s)
    if not seen:
        return {"institutions": [], "status": "no matching published record"}
    groups = _clusters(sorted(seen))
    if len(groups) > max_orgs:
        return {"institutions": [], "status": f"ambiguous — {len(groups)} unrelated "
                f"affiliations under this name, so it matches more than one person"}
    return {"institutions": sorted({a for g in groups for a in g["affiliations"]}),
            "status": "matched by name only"}

def coauthor_names(author_names, since, per_author=200, max_authors=30):
    """Folded names of everyone the manuscript's authors recently published with.

    `query.author` is a relevance query, not a filter. Asked for
    `Matthew F. S. Rushworth` it claims 96,900 results and returns a page holding 13 of
    his papers and 87 other people's, one of them Jennifer Rushworth writing on Proust.
    Every item is re-checked against the requested name before it counts. Skipping that
    check builds a conflict set mostly out of strangers, which excludes real candidates
    and misses real conflicts at the same time.
    """
    names, stats = set(), {"returned": 0, "kept": 0, "consortium_skipped": 0}
    for who in author_names:
        target = fold(who)
        d = cr("works", rows=per_author, select="DOI,author",
               **{"query.author": who, "filter": f"from-pub-date:{since},type:journal-article"})
        for w in d["items"]:
            stats["returned"] += 1
            authors = [" ".join(x for x in [a.get("given"), a.get("family")] if x)
                       for a in (w.get("author") or [])]
            if not any(fold(a) == target for a in authors):
                continue                      # not this person's paper at all
            if len(authors) > max_authors:
                stats["consortium_skipped"] += 1
                continue                      # a 400-author consortium is not a collaboration
            stats["kept"] += 1
            names.update(fold(a) for a in authors)
    names.discard("")
    return names, stats

def screen(ranked, manuscript_authors, coauthors, own_institutions, resolve_top=8):
    own = {o.lower() for o in own_institutions}
    mine = {fold(a) for a in manuscript_authors}
    for i, e in enumerate(ranked["editors"]):
        if e["printed_affiliations"]:
            e["institution"] = sorted(e["printed_affiliations"])
            e["institution_source"] = "printed by the journal on the article"
        elif i < resolve_top:
            r = published_affiliations(e["name"])
            e["institution"] = r["institutions"]
            e["institution_source"] = r["status"]
        reasons = []
        if e["key"] in mine:
            reasons.append("is an author of the manuscript")
        elif e["key"] in coauthors:
            reasons.append("recently co-published with an author")
        e["conflict"] = "; ".join(reasons) or None
        shared = set()
        if own:
            mineplaces = set().union(*[_place(o) for o in own])
            for inst in (e["institution"] or []):
                shared |= _place(inst) & mineplaces
        if shared:
            e["flags"].append("shares an institution with an author — "
                              + ", ".join(sorted(shared)))
    return ranked
```

**Name-based exclusion over-excludes, and that is the direction to err in.** A namesake of a
co-author will be dropped from the list. Losing a candidate costs an author nothing they can
see; naming a conflicted editor in a cover letter costs them credibility with the journal.

**Institution is a flag rather than an exclusion for a specific reason.** Where the journal
printed the affiliation on the article (step 3b) it is reliable. Where it had to be recovered
by name from the published record, it is only as good as the name, and `published_affiliations`
refuses to answer rather than guess when the name matches more than one person. A flag says
*check this*; an exclusion computed from a name-matched affiliation would silently remove the
right editor about as often as the wrong one.

**None of this clears anyone.** Shared grants, co-supervision, advisory roles, editorial
relationships and personal ties leave no trace in any of this data.

## What to hand back

```python
def report(journal_title, ranked, since, route, top=5):
    """The deliverable: who the record says handles work like this, and the evidence."""
    shown = [e for e in ranked["editors"]
             if not e["conflict"]
             and "below the presentation floor" not in e["flags"]][:top]
    print(f"Handling editors at {journal_title} whose recent record matches this manuscript")
    print(f"  {ranked['papers_scored']} of the journal's most similar papers since {since} "
          f"named an editor ({ranked['papers_without_editor']} named none); source: {route}\n")
    for e in shown:
        role = f'  [{", ".join(e["roles"])}]' if e["roles"] else ""
        print(f'{e["name"]}{role}')
        print(f'  {e["institution"][0] if e["institution"] else ""}')
        print(f'  handled {e["handled"]} of them; closest match scored '
              f'{e["best_match"]} against your abstract')
        for p in e["handled_papers"][:2]:
            print(f'    {p["year"]}  {p["title"][:66]}')
        for f in e["flags"]:
            print(f'  CHECK — {f}')
        print()
    excluded = [e for e in ranked["editors"] if e["conflict"]]
    if excluded:
        print("Excluded on the published record:")
        for e in excluded:
            print(f'  {e["name"]} — {e["conflict"]}')

def summary(journal, ranked, coi_stats, route, since, shown=5):
    blanks = [e["name"] for e in ranked["editors"][:shown] if not e["institution"]]
    variants = [e for e in ranked["editors"] if len(e["name_variants"]) > 1]
    print("\nSummary")
    print(f"  Proposed — the {shown} editors whose recently handled papers at {journal} sit "
          f"closest to your abstract, weighted by how close each paper was. This ranks the "
          f"published record; it is not a statement about any of them.")
    print(f"  Inferred — subject terms taken from your title and abstract, matched against "
          f"the journal's own papers since {since} via {route}.")
    print(f"  Decided — papers listing more than {MAX_EDITORS_PER_PAPER} editors were dropped "
          f"as a masthead rather than a handling editor; corrections and editorials dropped; "
          f"conflicts screened on {coi_stats['kept']} of the {coi_stats['returned']} works "
          f"returned for your authors, {coi_stats['consortium_skipped']} large-author papers "
          f"set aside.")
    out = []
    if blanks:
        out.append("no institution shown for " + ", ".join(blanks)
                   + " — the name matched more than one person, or no published record")
    if variants:
        out.append("the same person may appear twice under different name strings ("
                   + "; ".join(", ".join(e["name_variants"]) for e in variants) + ")")
    out.append("editorial boards rotate and a journal may reassign at will; nothing here "
               "reflects availability, workload, or whether an editor is still in post")
    print("  Outstanding — " + "; ".join(out) + ".")
```

The report is the artefact and the summary is where the author corrects it. A field the skill
cannot answer stays empty and is named in the summary — never filled with a placeholder, and
never guessed.

**Let the papers be the justification.** "Handled three of the journal's papers closest to
yours, the nearest being *Dynamic changes in brain lateralization…* (2022)" is checkable by
the author and by the journal. "A leading authority on cognitive control" is not, and is
exactly the sentence a language model will supply unprompted.

**Where the request goes.** Into the journal's own submission form. Most systems that accept
a preferred editor offer a field for it; where none exists, one sentence in the cover letter
naming the editor and the reason is the whole of it. Never an email to the editor.

## A worked run

```python
JOURNAL, ISSN = "PLOS Biology", "1545-7885"
SINCE = "2021-01-01"
TITLE = ("The human claustrum supports cognitive networks for externally and internally "
         "driven task demands")
ABSTRACT = ("The claustrum is a thin sheet of neurons with widespread cortical connectivity "
            "but its function in humans remains debated. Using functional MRI during "
            "externally and internally driven cognitive tasks we show that claustrum activity "
            "tracks task demand and covaries with cingulo-opercular network engagement "
            "supporting a role in cognitive control rather than sensory processing.")
AUTHORS = ["Matthew F. S. Rushworth"]      # your own author list
INSTITUTIONS = ["University of Oxford"]    # your own affiliations

found = similar_papers(ISSN, TITLE, ABSTRACT, SINCE)
ranked = rank_editors(found["papers"])
coauthors, coi_stats = coauthor_names(AUTHORS, "2022-01-01")
ranked = screen(ranked, AUTHORS, coauthors, INSTITUTIONS)
report(JOURNAL, ranked, SINCE, "Crossref editor field", top=3)
summary(JOURNAL, ranked, coi_stats, "Crossref editor field", SINCE, shown=3)
```

For a journal whose `with_editor` count in step 1 was zero, swap the first two lines for
`similar_papers_fulltext(JOURNAL, TITLE, ABSTRACT, 2021, rows=25)` and pass
`"Europe PMC JATS full text"` as the route.

## Which journals this works for

Measured on 2026-08-27 across fifteen journals spanning six publishers, two megajournals and a
society press, using a manuscript title and abstract appropriate to each.

| route | journals |
|---|---|
| Crossref `editor` | PLOS Biology, PLOS Computational Biology, mBio, Genetics, Bioinformatics, Molecular Biology and Evolution |
| Europe PMC JATS | eLife (with roles), PeerJ, Molecular Biology and Evolution |
| **neither** | Nucleic Acids Research, PNAS, Frontiers in Immunology, Scientific Reports, Cell Reports, BMC Biology, GigaScience, Nature |
| **field present but not a handling editor** | New England Journal of Medicine |

Nine of fifteen are reachable and six are not, and the six are not a gap to be closed by
trying harder: those publishers do not put a handling editor into any machine-readable public
record. **Return nothing for them.** A guess assembled from a board page is worse than an
honest blank, and it is the failure this skill was scoped to avoid.

The NEJM row is the one to remember. Its `editor` field is populated on hundreds of articles
and none of it is a handling editor — it is the standing masthead of the *Case Records of the
Massachusetts General Hospital*, carrying the same eight or nine names on every case, one of
whom died in 1939. A field that exists, parses, and means something else is the failure mode
that looks most like success.

## Limits

- **A handled paper is a fact; a match is an inference.** Every ranking here is a similarity
  score over titles and abstracts, and similarity is not fit.
- **This finds editors who have handled papers, not editorial boards.** A newly appointed
  editor has no record and will not appear, and a board member who handles only subscription
  content is invisible on both routes.
- **Crossref's relevance score is not comparable across journals**, and Europe PMC exposes no
  score at all, so the rank-position weight used in step 3b is comparable only within one run.
- **Both routes see only what a publisher chose to deposit.** Where a journal deposits an
  editor on some articles and not others, coverage is uneven inside a single journal — PLOS
  Biology named an editor on 70 of 94 retrieved papers in the run below.
- **Initials are not names.** Genetics deposits its editors as `G Coop`, `N Barton`,
  `D Andrew`. Those are printable but not resolvable: `published_affiliations` refuses them,
  so no institution and no conflict check is possible for that journal.
- **One person can appear twice.** Crossref carries `Raphael Kaplan` and `Raphael Samuel
  Matthew Kaplan` as separate strings for the same PLOS Biology editor. They are reported
  separately on purpose; merging on surname would collapse genuinely different people.
- **The conflict screen looks back over one window** and only at publications. It cannot see
  grants, supervision, advisory boards, or anything not published.

## Try it

A cold check that this skill still works. Runs in an empty directory, needs no account or key,
and asserts against a real journal and a real published manuscript.

**Data.** Three public endpoints, none of them gated:

    https://api.crossref.org/journals?query=PLOS+Biology&rows=3
    https://api.crossref.org/works/10.1371/journal.pbio.3003843
    https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=JOURNAL:"eLife"&format=json&pageSize=1

The Crossref REST API is free, needs no registration, and asks only that requests identify
themselves with a contact address for the polite pool. The Europe PMC RESTful Web Service is
free and needs no key. Both confirmed reachable 2026-08-27.

The manuscript is a **real published paper**, `doi:10.1371/journal.pbio.3003843` — *The human
claustrum supports cognitive networks for externally and internally driven task demands*, PLOS
Biology (2026), CC-BY-4.0. Using a published paper is what makes the test checkable: the
journal recorded who handled it, so the right answer is known in advance. The paper is
**excluded from its own ranking**, so the pipeline has to recover its editor from the other
papers that editor handled — a held-out test, not a lookup. In real use the manuscript is
unpublished and its title and abstract are pasted straight in.

**Run.**

```python
import json, re, time, collections, unicodedata
import urllib.request, urllib.parse, urllib.error

UA = {"User-Agent": "journal-editor-finder-tryit/1.0 (mailto:you@example.org)"}

def get(url, timeout=120):
    time.sleep(0.15)
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)

def cr(path, **params):
    url = "https://api.crossref.org/" + path + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            return json.load(get(url))["message"]
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(2 ** attempt + 1)
                continue
            raise

def fold(n):
    t = "".join(c for c in unicodedata.normalize("NFKD", n or "")
                if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", t.lower())).strip()

STOP = set("a an and are as at be by for from in into is it its of on or that the to we our "
           "this with which was were using show shows reveal reveals role effects".split())

def terms(text, k):
    w = [x for x in re.findall(r"[A-Za-z][A-Za-z0-9-]{2,}", text.lower()) if x not in STOP]
    freq, seen = collections.Counter(w), []
    for x in w:
        if x not in seen:
            seen.append(x)
    seen.sort(key=lambda x: -freq[x])
    return seen[:k]

HELD = "10.1371/journal.pbio.3003843"
TITLE = ("The human claustrum supports cognitive networks for externally and internally "
         "driven task demands")
ABSTRACT = ("The claustrum is a thin sheet of neurons with widespread cortical connectivity "
            "but its function in humans remains debated. Using functional MRI during "
            "externally and internally driven cognitive tasks we show that claustrum activity "
            "tracks task demand and covaries with cingulo-opercular network engagement "
            "supporting a role in cognitive control rather than sensory processing.")
SINCE = "2021-01-01"

def count(issn, q=None):
    p = {"rows": 0, "select": "DOI",
         "filter": f"issn:{issn},from-pub-date:{SINCE},type:journal-article"}
    if q:
        p["query.bibliographic"] = q
    return cr("works", **p)["total-results"]

# --- trap 1: the journal search does not return the journal you asked for -------------
names = [j["title"] for j in cr("journals", query="Nature", rows=3)["items"]]
print("journals matching 'Nature':", "; ".join(names))

# --- trap 2: a journal's two ISSNs are not interchangeable ----------------------------
print(f"PLOS Biology under 1544-9173: {count('1544-9173')} articles")
print(f"PLOS Biology under 1545-7885: {count('1545-7885')} articles")

# --- trap 3: query.bibliographic filters, so the whole abstract is self-defeating -----
print(f"pool from the whole abstract : {count('1545-7885', TITLE + ' ' + ABSTRACT)}")
widths = {k: count("1545-7885", " ".join(terms(f"{TITLE} {TITLE} {ABSTRACT}", k)))
          for k in (4, 6, 8, 10)}
print(f"pool by query width         : {widths}")

# --- trap 4: a populated editor field that is a masthead, not a handling editor -------
nejm = cr("works", rows=200, select="DOI,editor",
          filter=f"issn:0028-4793,from-pub-date:{SINCE},type:journal-article")
sizes = collections.Counter(len(w["editor"]) for w in nejm["items"] if w.get("editor"))
print(f"NEJM editors per article    : {dict(sorted(sizes.items()))}")

# --- the held-out ranking ------------------------------------------------------------
best = max(widths.items(), key=lambda kv: kv[1])
q = " ".join(terms(f"{TITLE} {TITLE} {ABSTRACT}", best[0]))
d = cr("works", rows=100, sort="score", order="desc", select="DOI,editor,title,score,issued",
       **{"query.bibliographic": q,
          "filter": f"issn:1545-7885,from-pub-date:{SINCE},type:journal-article"})

agg = collections.defaultdict(lambda: {"w": 0.0, "n": 0, "name": ""})
held_seen, no_editor = False, 0
for w in d["items"]:
    doi = w["DOI"].lower()
    if doi == HELD:
        held_seen = True
        continue                                  # held out of its own ranking
    eds = [e for e in (w.get("editor") or []) if e.get("family")]
    if not eds or len(eds) > 2:                   # >2 is a masthead, not a handling editor
        no_editor += 1
        continue
    for e in eds:
        name = " ".join(x for x in [e.get("given"), e.get("family")] if x)
        r = agg[fold(name)]
        r["w"] += w["score"]
        r["n"] += 1
        r["name"] = name
rows = sorted(agg.values(), key=lambda r: -r["w"])
print(f"\nretrieved {len(d['items'])} papers, {no_editor} without a usable editor, "
      f"{len(rows)} editors ranked")
for r in rows[:3]:
    print(f'  {r["w"]:6.1f}  handled {r["n"]}  {r["name"]}')

truth = cr("works/" + HELD)["editor"]
actual = " ".join(x for x in [truth[0].get("given"), truth[0].get("family")] if x)
print(f"actual handling editor      : {actual}  ->  ranked #"
      f"{[fold(r['name']) for r in rows].index(fold(actual)) + 1}")

# --- invariants: a failure here means the skill is wrong ------------------------------
assert "Nature" not in names, "the journal search now returns Nature - relax the warning"
assert count("1544-9173") == 0 < count("1545-7885"), "the ISSN trap has changed shape"
assert count("1545-7885", TITLE + " " + ABSTRACT) < min(widths.values()), \
    "the whole abstract is no longer self-defeating - re-check the query advice"
assert max(sizes) >= 8, "NEJM stopped depositing a masthead - re-check the guard"
assert sum(v for k, v in sizes.items() if k > 2) > 0
assert held_seen, "the held-out paper was not retrieved, so nothing was held out"
assert rows and fold(rows[0]["name"]) == fold(actual), \
    "the paper's real handling editor is no longer ranked first from the other papers"
assert rows[0]["n"] >= 2, "top editor rests on a single paper - the ranking is not evidenced"
# Nothing that could be used to contact anyone may reach the output.
assert not any("@" in r["name"] for r in rows)
# Names are never merged across strings, so a variant stays its own row.
assert len({r["name"] for r in rows}) == len(rows)
print("\nall assertions passed")
```

**Expect.**

*Invariants* — asserted above and true whenever you run it. Searching Crossref for `Nature`
does not return *Nature*. PLOS Biology's two ISSNs are not interchangeable: one returns
nothing and the other returns the journal. Passing the whole abstract to `query.bibliographic`
returns a smaller pool than any short term query, so it must never be used as the query. The New England
Journal of Medicine still deposits articles carrying eight or more editors, which the masthead
guard removes. The held-out paper is retrieved and then excluded, and
**its real handling editor is still ranked first from the other papers that editor handled**,
resting on more than one paper. No output field contains an `@`, and no two rows share a
display name.

*Observed 2026-08-27* — these move as Crossref reindexes, so a mismatch is drift to
investigate rather than a bug.

```
journals matching 'Nature': NatureJobs; Naturen; Natures Sciences Sociétés
PLOS Biology under 1544-9173: 0 articles
PLOS Biology under 1545-7885: 2667 articles
pool from the whole abstract : 1
pool by query width         : {4: 21, 6: 59, 8: 264, 10: 16}
NEJM editors per article    : {1: 6, 4: 2, 8: 3, 9: 9}

retrieved 100 papers, 29 without a usable editor, 57 editors ranked
    19.4  handled 3  Matthew F. S. Rushworth
    17.3  handled 2  Huan Luo
    15.5  handled 1  Claus C. Hilgetag
actual handling editor      : Matthew F. S. Rushworth  ->  ranked #1

all assertions passed
```

A full run takes about 25 seconds.

**Where it breaks.** The fifteen-journal sweep in *Which journals this works for* is the
generalisation test, and its failures are the informative part. Six journals — Nucleic Acids
Research, PNAS, Frontiers in Immunology, Scientific Reports, Cell Reports, BMC Biology,
GigaScience and Nature — return no editor on either route, and the skill's correct output for
them is nothing. Beyond that:

- **Megajournals never narrow.** Scientific Reports and Cell Reports exceed the pool cap at
  every query width, so `over_cap` comes back true and the retrieved papers are a slice rather
  than a neighbourhood. They also deposit no editor, so it does not matter here — but on a
  journal that did, the caveat would need saying.
- **Initials-only editors cannot be screened.** Genetics deposits `G Coop` and `N Barton`.
  They rank, they print, and no institution or conflict check is possible for any of them.
- **PeerJ's JATS carries no role.** The editor is in a `contrib-group` marked `editor` with no
  `contrib-type` and no `<role>`, so the name is recoverable and the role is not.
- **eLife lists two editors per paper** — a Reviewing Editor and a Senior Editor — and both
  count. On one 2026 article the same person appeared in both roles; that is the record, not a
  parsing error.
- **The relevance tail pulls in the wrong field.** Below about 15% of the top editor's weight
  the rows stop being about the manuscript, which is what `min_share` is set for.

## Sources

- Crossref REST API — <https://www.crossref.org/documentation/retrieve-metadata/rest-api/>.
  Free, no key; the polite pool and its rate limits are described at
  <https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/>.
- Europe PMC RESTful Web Service — <https://europepmc.org/RestfulWebService>. Free, no key.
  The open-access subset and its per-article licences are at
  <https://europepmc.org/downloads/openaccess>.
- JATS `contrib` and `contrib-group` — <https://jats.nlm.nih.gov/archiving/tag-library/1.3/element/contrib.html>.
