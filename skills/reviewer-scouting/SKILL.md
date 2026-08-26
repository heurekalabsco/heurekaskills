---
name: reviewer-scouting
description: Propose suggested reviewers for a manuscript submission, grouped so they cover every angle of the paper — find researchers who both publish on an angle and have recently published in the target journal, screen them against the author list for conflicts, and recover each one's published email address.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [publishing, peer-review, openalex, bibliometrics]
covers: [suggested reviewers, reviewer selection, peer review, referee, conflict of interest, coi, cover letter, manuscript submission, editorial, expertise matching, coauthor screen, openalex, bibliometrics]
datasets: [https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=41350470&retmode=xml, https://api.openalex.org/works/doi:10.1038/s42255-025-01410-x]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-25
  against: OpenAlex API works/sources/authors endpoints and NCBI E-utilities as of 2026-08-25 / Python 3.12.8 / standard library only
  executed: 9
  unverified: 0
---
# Proposing suggested reviewers

Most journals ask the submitting author to name three suggested reviewers. A good suggestion
is someone who works on the manuscript's subject, who the editor will recognise as a plausible
referee for *this* journal, and who has no conflict with the authors.

This skill builds that list from two conditions held at once:

- **Expertise** — they publish on the manuscript's topic, measured by recent output.
- **Standing with the journal** — they have recently published in the target journal itself.

The second condition is what makes the list usable. An editor invites people who are already
in the journal's orbit, and a suggestion drawn from the topic alone will often propose
researchers the journal has never published.

The intersection is then screened for conflicts. **The screen is the part that has to be
right** — a suggested reviewer who turns out to be a recent co-author damages the submission
more than a mediocre suggestion does.

If there is no target journal yet, the `journal-selection` skill produces the shortlist this
one takes as input.

## What this skill cannot give you

**A guaranteed email address.** OpenAlex carries none. Step 6 recovers them from published
PubMed affiliations, which works for most but not all reviewers, and an address in the record
can be out of date. What the skill will never do is *construct* one from an institutional
pattern. Blank is the correct answer when the record has nothing.

It also cannot tell you whether someone is retired, on leave, deceased, already reviewing for
this journal, or on its editorial board. Check a proposed name against the journal's masthead
by hand.

## Setup

OpenAlex retired its "polite pool" in **February 2026** — the `mailto` parameter still
parses but is now **ignored**, so only an API key raises your limits.

**Get a free API key before you run this twice.** Without one you are on the keyless budget,
which is **1,000 requests a day, shared across everyone on your IP** — the website's anonymous
browsing draws on it too. A free account raises that **10x**, takes about thirty seconds at
[openalex.org](https://openalex.org), and the key is at Settings -> API key. The budget resets
at **midnight UTC**, not on a rolling window, so exhausting it can cost you the rest of the day.
Writing this skill exhausted the keyless budget once.

Put the key in the environment and let the helper pick it up:

```bash
export OPENALEX_API_KEY="your-key"
```

**Never write a key into a script, a notebook, or a skill file.** If one leaks, rotate it at
Settings -> API key and choose *Immediately* — note that on a personal account the key is also
your sign-in credential, so rotating signs you out everywhere.

A `429` means one of two things: the daily budget is gone, or you exceeded 100 requests per
second. Only the first is worth waiting for. Every response carries `X-RateLimit-Remaining`,
so you can see where you stand before starting a long pull.

This is the request-hungry pipeline of the two. The conflict screen below batches its
lookups precisely because the naive version — one query per author, per page — will
exhaust even a keyed budget on a large collaboration.

```python
import json, os, urllib.request, urllib.parse, urllib.error, collections, time

API_KEY = os.environ.get("OPENALEX_API_KEY")   # from the environment; never hard-code it
API = "https://api.openalex.org"
_last = [0.0]

def oa(path, **params):
    gap = time.time() - _last[0]
    if gap < 0.12:                       # ~10 requests/second is the documented ceiling
        time.sleep(0.12 - gap)
    _last[0] = time.time()
    if API_KEY:
        params["api_key"] = API_KEY
    url = f"{API}/{path}?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                raise RuntimeError(
                    f"OpenAlex quota exhausted; Retry-After "
                    f"{e.headers.get('Retry-After')}s") from e
            if e.code in (500, 502, 503, 504) and attempt < 4:
                time.sleep(2 ** attempt)
                continue
            raise


def _fold(s):
    """Normalise a personal name for comparison.

    Accents, case, dashes and initial-dots all vary between OpenAlex display names and
    PubMed author records for the same human. Folding them away recovers real matches
    (Kris C. Wood / Kris C Wood, Qun-Ying Lei with a Unicode hyphen) without merging
    genuinely different names.
    """
    import unicodedata
    t = "".join(c for c in unicodedata.normalize("NFKD", s or "")
                if not unicodedata.combining(c))
    t = re.sub(r"[\u2010-\u2015\u2212-]", " ", t).replace(".", "")
    return re.sub(r"\s+", " ", t).lower().strip()

def _has_given_name(folded):
    """True when a folded name carries a real token, not just initials."""
    return any(len(tok) > 1 for tok in folded.split())
```

Fail loudly on `429` rather than retrying it. The wait is hours, not seconds, and a silent
retry loop turns an exhausted budget into a hung script.

## Step 1 — find the paper's angles

An editor wants suggestions that cover the whole paper. This one is an AML paper, a
cancer-metabolism paper, a mitochondrial paper and a computational-methods paper, and no single
reviewer covers all four. **The angles are what makes the list comprehensive**, so they are
found first and the reviewers are grouped under them.

Angles come from how OpenAlex labels the manuscript's nearest neighbours, using the same
`primary_topic` field the expertise pool is built from.

**Two probes.** Titles open with the method and close with the subject. Searching the whole
title is too specific to vote on, so the subject probe trims the leading clause; that clause is
the methods framing and runs as its own probe. On the *Try it* paper the subject probe finds AML
and cancer metabolism, and `pathway coessentiality mapping` finds *Bioinformatics and Genomic
Networks* — the computational angle, and the one whose reviewers an author is most likely to
have overlooked.

**No absolute floor.** Within each probe, keep topics comparable to that probe's leader. A narrow
paper yields one angle, a broad one up to `cap`.

```python
import re

STOP = set("a an and are as at be by for from how in into is it its of on or that the to "
           "we our this these those with which was were been has have had can could may "
           "reveals reveal shows show demonstrates identify identifies using via novel".split())

def _content_words(text):
    return [w for w in re.findall(r"[A-Za-z][A-Za-z0-9-]+", text.lower()) if w not in STOP]

def paper_angles(title, rel=0.5, cap=4, min_matches=40, sample=100):
    words = _content_words(title)
    subject = " ".join(words[3:]) if len(words) > 7 else " ".join(words)
    methods = " ".join(words[:3])
    # A short title makes these identical; running it twice would mark an angle as confirmed
    # by both probes when only one ran.
    probes = {"subject": subject}
    if methods and methods != subject:
        probes["methods"] = methods

    merged, provenance = {}, {}
    evidence = {"subject": {"query": subject, "matched": 0,
                            "ran": False, "contributed": False}}
    for kind, q in probes.items():
        evidence.setdefault(kind, {"query": q, "matched": 0,
                                   "ran": False, "contributed": False})
        if len(q.split()) < 2:
            continue
        d = oa("works", search=q, filter="type:article,from_publication_date:2019-01-01",
               per_page=sample, select="id,primary_topic")
        evidence[kind] = {"query": q, "matched": d["meta"]["count"],
                          "ran": True, "contributed": False}
        if d["meta"]["count"] < min_matches:
            continue
        c = collections.Counter()
        for w in d["results"]:
            pt = w.get("primary_topic")
            if pt:
                c[(pt["id"].rsplit("/", 1)[-1], pt["display_name"])] += 1
        if not c:
            continue
        evidence[kind]["contributed"] = True
        total = sum(c.values())
        lead = c.most_common(1)[0][1] / total
        for key, n in c.items():
            share = n / total
            if share >= rel * lead:
                merged[key] = max(merged.get(key, 0), round(share, 3))
                provenance.setdefault(key, set()).add(kind)
    ranked = sorted(merged.items(), key=lambda kv: -kv[1])[:cap]
    angles = [{"id": k[0], "name": k[1], "share": v, "from": sorted(provenance[k])}
              for k, v in ranked]
    # "Placed" is a property of the angles that SURVIVED the cap, not of the probe. A subject
    # topic can be produced and then ranked out behind higher-share methods topics, and the
    # panel that follows would then be built entirely on the technique.
    return {"angles": angles, "probes": evidence,
            "subject_placed": any("subject" in a["from"] for a in angles)}
```

**If `subject_placed` is `False`, stop.** A generic methods clause matches enormous numbers of
papers, so the methods probe can succeed while the subject probe finds nothing — producing
confident angles that describe the technique rather than this paper. Reviewers proposed on that
basis are experts in the method and strangers to the science, which is exactly the suggestion an
editor discards.

## Step 2 — the expertise pool

Authors ranked by **recent output on the topic**, not by lifetime citations.

This distinction decides whether the list is usable. Ranking the same topic by career
citations returns the field's founders — the people with 200,000 citations who chair
departments, sit on the journal's board already, and decline. Recent output returns the
people currently doing the work, which is who actually reviews.

`group_by` returns at most 200 groups per call, so **the pool is capped at 200 authors per
topic** — this is a ceiling on who can be proposed, not a complete census of the field.
Passing all three topics is what makes it large enough to intersect. Cursor-paging would
lift the cap but the pages come back unordered by count, so the top-200-by-output property
that makes this a useful ranking would be lost.

```python
def topic_experts(topic_ids, since):
    experts, names = collections.Counter(), {}
    for tid in topic_ids:
        g = oa("works",
               filter=f"primary_topic.id:{tid},from_publication_date:{since},type:article",
               group_by="authorships.author.id", per_page=200)
        for x in g["group_by"]:
            aid = x["key"].rsplit("/", 1)[-1]
            experts[aid] += x["count"]
            names[aid] = x["key_display_name"]
    return experts, names
```

## Step 3 — the journal pool

First and last authors of recent research articles in the target journal. Middle authors are
dropped: on a twenty-author paper they are not the people an editor would invite, and
including them floods the pool with names that have no independent standing in the journal.

```python
def journal_authors(source_id, since, max_pages=40):
    pool, cursor, truncated = {}, "*", False
    for _ in range(max_pages):
        d = oa("works",
               filter=f"primary_location.source.id:{source_id},"
                      f"from_publication_date:{since},type:article",
               per_page=100, cursor=cursor, sort="publication_date:desc",
               select="id,display_name,authorships")
        if not d["results"]:
            break
        for w in d["results"]:
            for a in w.get("authorships", []):
                if a.get("author_position") == "middle":
                    continue
                au = a.get("author") or {}
                aid = (au.get("id") or "").rsplit("/", 1)[-1]
                if not aid:
                    continue
                r = pool.setdefault(aid, {"name": au.get("display_name"),
                                          "orcid": au.get("orcid"), "n": 0,
                                          "inst_ids": set(), "inst_names": set(),
                                          "titles": []})
                r["n"] += 1
                for i in (a.get("institutions") or []):
                    if i.get("id"):
                        r["inst_ids"].add(i["id"].rsplit("/", 1)[-1])
                    if i.get("display_name"):
                        r["inst_names"].add(i["display_name"])
                if len(r["titles"]) < 2:
                    r["titles"].append(w["display_name"])
        cursor = d["meta"].get("next_cursor")
        if not cursor:
            break
    else:
        truncated = True
        print(f"WARNING: journal pool hit max_pages - only part of the journal was read")
    return pool, truncated
```

## Step 4 — the conflict screen

Two exclusions, and each has a trap that makes a naive version useless.

**Co-authors.** Everyone who has published with any manuscript author in the window. The trap
is consortium papers: a single 400-author collaboration makes four hundred people your
co-authors, and a manuscript with a few consortium members on it will exclude most of its own
field. Papers above an author threshold are skipped, which is the convention journals
themselves use.

But that threshold is a **false-negative path**, not just noise reduction: a genuine
collaborator whose only recent overlap is a 31-author paper would sail straight through. So
those people are not discarded — they come back as `soft`, and any pick sharing only a
large-author paper is marked `shared_consortium_paper`. The author decides; the screen does
not decide for them. The flag is checked by folded name as well as by id, because the
fragmentation problem below applies to the soft path exactly as it does to the hard one.

**Page the co-author query to exhaustion.** An earlier version read six pages per chunk, which
on the *Try it* manuscript covered **600 of 1,191 works** — the screen was judging on half the
evidence and said nothing about it. It now pages until the cursor runs out, and warns loudly
if it ever stops early.

**Institutions.** Take these from the **manuscript itself**, not from everywhere the authors
have ever published. This is the failure that matters most: collecting institutions across all
of the authors' recent papers produced 1,871 institutions for one 23-author manuscript, and
screening against that set cut a screened pool of twelve candidates down to one. The manuscript's
own affiliations were nineteen.

Match on the canonical institution **id**, never the display name. OpenAlex gives every
affiliation an id and a ROR (`I170897317`, `ror.org/00py81415`), while the display strings vary
by spelling, abbreviation, language and campus. A missed overlap here is a same-institution
reviewer proposed as independent.

The lookup is batched — one OR-filtered query per 25 authors, rather than one per author.

```python
def conflicts(manuscript_work, since, max_authors=30, max_pages=60):
    """Returns (excluded_ids, own_institution_ids, soft_ids, stats).

    excluded_ids — hard conflicts: co-authors on normal-sized papers.
    soft_ids     — share ONLY a large-author paper. Not excluded, but flagged for the author.
    """
    ships = manuscript_work["authorships"]
    author_ids = [a["author"]["id"].rsplit("/", 1)[-1] for a in ships]
    # Canonical institution IDs, not display names: one body has many spellings.
    own_institutions = {i["id"].rsplit("/", 1)[-1] for a in ships
                        for i in (a.get("institutions") or []) if i.get("id")}

    excluded, soft, soft_names = set(author_ids), set(), set()
    # OpenAlex splits one human across several author ids, and an id-only screen lets the
    # other fragment through. Folded display names are a coarse second key: they over-exclude
    # genuine namesakes, which is the safe direction for a conflict screen.
    excluded_names = {_fold(a["author"].get("display_name")) for a in ships
                      if a["author"].get("display_name")}
    scanned, skipped, truncated = 0, 0, []
    for i in range(0, len(author_ids), 25):
        chunk = author_ids[i:i + 25]
        cursor = "*"
        for _ in range(max_pages):
            d = oa("works",
                   filter=f"authorships.author.id:{'|'.join(chunk)},"
                          f"from_publication_date:{since}",
                   per_page=100, cursor=cursor, select="id,authorships")
            rows = d["results"]
            if not rows:
                break
            scanned += len(rows)
            for w in rows:
                ships_w = w.get("authorships", [])
                ids_w = [x.rsplit("/", 1)[-1] for x in
                         ((a.get("author") or {}).get("id") for a in ships_w) if x]
                names_w = {_fold((a.get("author") or {}).get("display_name"))
                           for a in ships_w if (a.get("author") or {}).get("display_name")}
                if len(ships_w) > max_authors:    # consortium paper: flag, do not exclude
                    skipped += 1
                    soft.update(ids_w)
                    soft_names.update(names_w)   # names too, or a fragment escapes the flag
                    continue
                excluded.update(ids_w)
                excluded_names.update(names_w)
            cursor = d["meta"].get("next_cursor")
            if not cursor:
                break
        else:
            truncated.append(chunk[0])

    soft -= excluded
    soft_names -= excluded_names
    excluded_names.discard("")
    soft_names.discard("")
    if truncated:
        print(f"WARNING: conflict scan hit max_pages - screen INCOMPLETE for {truncated}")
    return excluded, own_institutions, soft, {
        "works_scanned": scanned, "consortium_papers_skipped": skipped,
        "truncated_chunks": truncated, "excluded_names": excluded_names,
        "soft_names": soft_names}
```

For an unpublished manuscript there is no OpenAlex record to pass in. Resolve each author by
name instead — and read *Author disambiguation* below before trusting the result.

## Step 5 — one panel per angle

Rank **per angle**, not pooled. Pooling produces three reviewers who all cover whichever angle
happens to be largest, which is the opposite of what an editor asked for.

```python
def panel(angles, source_id, excluded, own_institutions, soft, stats,
          since_topic, since_journal, per_angle=2):
    # An incomplete conflict scan means unknown collaborators are missing from `excluded`.
    # Proposing reviewers on that basis is the failure this skill exists to prevent.
    if stats["truncated_chunks"]:
        raise RuntimeError(
            "conflict scan was truncated for "
            f"{stats['truncated_chunks']} - refusing to propose reviewers on a partial screen")
    pool, pool_truncated = journal_authors(source_id, since_journal)
    blocks = []
    for a in angles:
        experts, _ = topic_experts([a["id"]], since_topic)
        picks = []
        for aid in set(experts) & set(pool):
            if aid in excluded:
                continue
            r = pool[aid]
            if _fold(r["name"]) in stats["excluded_names"]:
                continue                      # same human under a different OpenAlex id
            if r["inst_ids"] & own_institutions:
                continue
            picks.append({"id": aid, "name": r["name"], "orcid": r["orcid"],
                          "institutions": sorted(r["inst_names"]),
                          "institution_ids": sorted(r["inst_ids"]),
                          "topic_papers": experts[aid], "journal_papers": r["n"],
                          "recent_in_journal": r["titles"],
                          # Checked by name too, so a fragmented id still carries the flag.
                          "shared_consortium_paper": (
                              aid in soft or _fold(r["name"]) in stats["soft_names"]),
                          "email": None})          # filled in below; never guessed
        picks.sort(key=lambda c: (-c["topic_papers"], -c["journal_papers"]))
        blocks.append({"angle": a["name"], "id": a["id"], "from": a["from"],
                       "shortlist": picks[:per_angle],   # what you present
                       "candidates": picks,              # everyone who survived screening
                       "n_candidates": len(picks)})
    return blocks, pool_truncated
```

Two per angle, so a four-angle paper yields six to eight names — enough to cover the paper,
few enough that an editor reads them.

**Keep the whole screened list, present a slice of it.** `shortlist` is what goes in the letter;
`candidates` is everyone who passed both conditions and the conflict screen, in rank order. An
author who does not like the two proposed for an angle — they know one is unresponsive, or on a
competing preprint, or simply prefers someone else — can ask for the rest without the pipeline
being run again. Throwing the remainder away forces a rerun to answer *who else was there*,
which is the most common follow-up an author has.

Emails are filled for the names you present, not for every candidate, because each lookup costs
two PubMed requests. When an author picks a different candidate, call `published_email()` on that
one then.

**An empty block is a finding, not a gap to hide.** On the *Try it* paper the AML angle returns
**zero** reviewers: *Nature Metabolism* barely publishes AML, so nobody satisfies both
conditions. Report it. It tells the author that this journal's author pool cannot cover that
aspect of the paper — either the angle is wrong for this venue, or the widening ladder below is
needed, or that angle's reviewer has to come from outside the journal and be justified
differently.

## Step 6 — email addresses

Journals ask for an email with every suggested reviewer, and OpenAlex has none. They can be
recovered from the **published record**: PubMed keeps author affiliation strings, and a
corresponding author's address is usually in them.

```python
import urllib.request, urllib.parse, json
import xml.etree.ElementTree as ET

def published_email(full_name, tries=6):
    """The address from this person's own published affiliations, or None."""
    parts = full_name.split()
    if len(parts) < 2:
        return None
    whole = _fold(full_name)
    last, first = _fold(parts[-1]), _fold(parts[0])
    try:
        u = ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
             f"?db=pubmed&retmode=json&retmax={tries}&term="
             + urllib.parse.quote(f"{full_name}[au]"))
        with urllib.request.urlopen(u, timeout=45) as r:
            ids = json.load(r)["esearchresult"]["idlist"]
        if not ids:
            return None
        u = ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
             "?db=pubmed&retmode=xml&id=" + ",".join(ids))
        with urllib.request.urlopen(u, timeout=60) as r:
            root = ET.parse(r).getroot()
        for a in root.findall(".//Author"):
            ln, fn = _fold(a.findtext("LastName")), _fold(a.findtext("ForeName"))
            # Compare the whole name. Reducing to first-plus-last token accepts "Juan Cruz"
            # for a query about "Juan Carlos de la Cruz" — wrong human, real address.
            #
            # And an initials-only name identifies nobody: "Smith, J" is John and Jane
            # alike, and folding dots and dashes makes "J.-P. Morgan" and "J P Morgan" one
            # string. Both sides must carry a real given name or this returns nothing. A
            # blank is recoverable by hand; a stranger's address in a cover letter is not.
            if not (_has_given_name(fn) and _has_given_name(first)):
                continue
            if f"{fn} {ln}".strip() != whole:
                continue
            for aff in a.findall("AffiliationInfo/Affiliation"):
                found = re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", aff.text or "")
                if found:
                    return found[0].rstrip(".")
    except (urllib.error.URLError, urllib.error.HTTPError, ET.ParseError,
            ValueError, KeyError):
        return None                    # transport or parse failure: no address, not a crash
    return None
```

**Match whole names, and refuse initials.** `LastName == "Smith"` plus an initial `J` accepts
*Jane Smith* for a query about *John Smith* and hands an editor a stranger's address under a
real reviewer's name. Reducing to first-and-last token is no better: it accepts *Juan Cruz*
for *Juan Carlos de la Cruz*. So the whole name must match — and if either side is
initials-only, the lookup returns nothing at all, because *Smith, J* identifies nobody and
folding punctuation makes *J.-P. Morgan* and *J P Morgan* the same string.

Names are compared accent- and punctuation-folded, so *Garcia-Lopez* matches *García-López*
and *Kris C Wood* matches *Kris C. Wood*. Without that, every author with a diacritic or a
middle initial silently returns blank.

**The result is not deterministic, and that is inherent.** The lookup reads only the first
`tries` papers PubMed returns for a name, and that set changes as records are added and
relevance is recomputed. Two runs on the same day recovered 5 of 6 addresses and then 4 of 6 —
the same person surfaced an address in one and not the other. Do not treat a blank as proof
there is no address, and do not treat a hit as stable. Raising `tries` improves recall at the
cost of a larger fetch per name.

**Expect it to miss.** The address only exists if the person was corresponding author on an
indexed paper — one reviewer in four came back empty in testing. It can also be stale, because
people move and the record does not follow them. Two of six were blank on the *Try it* paper.

**Never construct one.** Do not infer `first.last@institution.edu` from a pattern, however
obvious it looks. A wrong address an editor can see came from the paper is a small problem; an
invented one that reaches a stranger is a different kind of problem. Blank is the correct answer
when the record has nothing, and the summary says which names are blank.

## When the intersection is thin

Expect it to be. Requiring both conditions on a single journal and a narrow window is
restrictive by design, and a first pass often returns fewer than three usable names. One test
run against a specialist journal returned exactly three candidates from pools of 200 and 568.

Widen in this order, and say in the summary which rungs you used — each one weakens a claim
the list is making:

1. **Lengthen the journal window.** Cheapest, costs the least. "Recently published here"
   becomes five years rather than three.
2. **Lengthen the topic window.** Weakens "currently active" slightly.
3. **Add the manuscript's remaining topics**, or the parent subfield. Broadens what "expertise"
   means.
4. **Page deeper into the journal.** More of its authors, further back.
5. **Allow middle authors.** Do this last. It admits people with no first- or last-author
   standing in the journal, which is most of what the condition was for.

Do not relax the conflict screen to reach three. Two screened suggestions and a stated shortfall
beat three with a co-author among them.

## Author disambiguation

OpenAlex author records are algorithmic and they fragment. Searching *Matthew Hirschey*
returns three separate author IDs — one with 152 works, one with 3, one with 1 — all the same
person. Taking `results[0]` silently misses the fragments, which matters most in the conflict
screen, where a missed fragment is a missed conflict.

When resolving manuscript authors by name:

- Prefer ORCID when the author gives you one — `filter=orcid:0000-...` is exact.
- Otherwise search and **keep every plausible match**, not the first. Over-excluding a
  non-conflicted reviewer is a recoverable error; missing a real co-author is not.
- Check `last_known_institutions` and `works_count` against what you know of the author.

## What to hand back

The output goes straight into a cover letter, so give the four fields editors ask for —
**name, expertise, email, and why they are appropriate** — grouped by angle:

```
Cancer metabolism
  Zhimin Lu, Zhejiang University                          zhiminlu@zju.edu.cn
    27 papers on cancer metabolism since 2021; 2 in Nature Metabolism.
  Alpaslan Tasdogan, Essen University Hospital            alpaslan.tasdogan@uk-essen.de
    11 papers on cancer metabolism since 2021; 1 in Nature Metabolism.

Computational / genomic networks
  Joseph Loscalzo, Brigham and Women's Hospital           jloscalzo@bwh.harvard.edu
    10 papers on network biology since 2021; 1 in Nature Metabolism.
  Adil Mardinoglu, KTH / King's College London            [no published address found]
    9 papers on network biology since 2021; 1 in Nature Metabolism.
```

**Let the counts be the justification.** "27 papers on cancer metabolism since 2021, 2 of them
in this journal" is checkable by the editor and by the author. "A world-leading authority on
tumour metabolism" is not, and it is precisely the sentence a language model will produce
unprompted. Every claim in the *why* line should trace to a number the pipeline computed.

Then a separate summary, which is where the author corrects what the skill misread:

- **Proposed** — the names and the two conditions each satisfies, with both windows given.
- **Inferred** — the angles, their shares, and which probe found each. An angle found only by
  the methods probe should be called out, because it is the one the author may not have
  intended to lead with.
- **Decided** — the windows, the consortium threshold, whether any widening rung was used, and
  which angles came back empty.
- **Outstanding** — every blank email, by name. Plus editorial-board membership, availability,
  retirement, and conflicts that leave no publication trace: shared funding, advisory roles,
  supervision, personal relationships. **Only the authors know those.**

Blank fields stay genuinely blank and are named in the summary. Never write `[look up]` into a
table an author is about to paste into a letter.

### Answering "who else was there?"

The two names under an angle are a view of that angle's `candidates`, not the whole of it. An
author who does not want one of them — they know the person is unresponsive, or sitting on a
competing preprint, or they simply prefer someone else — should get the rest immediately:

```python
def other_candidates(blocks, angle_id):
    """Everyone who survived screening for one angle, in rank order, shortlist first."""
    blk = next((b for b in blocks if b["id"] == angle_id), None)
    if blk is None:
        raise KeyError(f"no angle {angle_id!r}; have {[b['id'] for b in blocks]}")
    for r in blk["candidates"]:
        print(f'   {r["name"]:26s} {r["topic_papers"]:3d} on angle, '
              f'{r["journal_papers"]} in journal, {"; ".join(r["institutions"])[:34]}')
    return blk["candidates"]
```

Then call `published_email()` on whichever ones they choose. Everyone in `candidates` has already
passed both conditions and the full conflict screen, so swapping a name in costs nothing and
loses no guarantee. What it does *not* do is lower the bar: a name that is not in `candidates`
was excluded for a reason, and adding it by hand puts a conflict back into the letter.

## Limits

- **Publication records are not the whole of a conflict.** Co-supervision, grant
  co-investigators, editorial relationships and personal ties leave no trace here. The screen
  narrows the list; it does not clear anyone.
- **Recent output is a proxy for expertise**, and it favours large productive groups over
  excellent small ones.
- **Institution matching is only as good as OpenAlex's affiliation parsing.** Canonical ids
  remove the spelling problem, but an affiliation the parser never resolved carries no id to
  match on. Read the affiliations rather than trusting the filter.
- **Author records fragment, and that defeats the screen itself.** One real name returns three
  OpenAlex ids for the same person — 152 works, 3, and 1. The screen compares ids literally, so
  a reviewer whose conflicting paper sits under one fragment can appear in the pool under
  another and survive. This is not only an input problem; it is a standing limitation, and it
  is why the output is a shortlist for a human to check rather than a clearance.
- **Nothing here checks quality.** An author publishing heavily in a weak venue scores the
  same as one publishing carefully.
- **The journal condition encodes the journal's existing biases** — geographic, institutional,
  demographic. A list built from who a journal already publishes will reproduce that. Widen
  deliberately if the field is broader than the journal's record suggests.

## Try it

A self-contained check that this skill still works. Public data. Runs without a key, though see *Setup* — a free key is worth having before you run this more than once.

**Data** — the same two inputs, playing different roles.

The manuscript text, from PubMed `PMID 41350470`:

    https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=41350470&retmode=xml

Stewart, Zachman, Castellano-Escuder et al., *Pathway coessentiality mapping reveals complex II
is required for de novo purine biosynthesis in acute myeloid leukaemia*, Nature Metabolism
7:2474-2488 (2025), `doi:10.1038/s42255-025-01410-x`. E-utilities needs no account or key. Last
confirmed reachable 2026-08-23.

The paper's OpenAlex record, which supplies **the 19 authorships the conflict screen runs
against**:

    https://api.openalex.org/works/doi:10.1038/s42255-025-01410-x

OpenAlex is CC0. Using a published paper is what makes the test checkable: the correct
behaviour is knowable in advance, because a paper's own authors must never be proposed as its
reviewers. In normal use the manuscript is unpublished and the author supplies their own names,
resolved as described under *Author disambiguation*.

The target journal is Nature Metabolism, `S4210232714` — the journal this paper appeared in,
which is also a realistic target for work of this kind.

**Run.**

```python
def pubmed_manuscript(pmid):
    url = ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
           f"?db=pubmed&id={pmid}&retmode=xml")
    with urllib.request.urlopen(url, timeout=60) as r:
        art = ET.parse(r).getroot().find(".//Article")
    return ("".join(art.find("ArticleTitle").itertext()),
            " ".join("".join(x.itertext()) for x in art.findall("Abstract/AbstractText")))

TITLE, ABSTRACT = pubmed_manuscript("41350470")
assert TITLE.startswith("Pathway coessentiality mapping")

JOURNAL = "S4210232714"                       # Nature Metabolism
work = oa("works/doi:10.1038/s42255-025-01410-x")
author_ids = {a["author"]["id"].rsplit("/", 1)[-1] for a in work["authorships"]}

found = paper_angles(TITLE)
assert found["subject_placed"], "subject unplaceable - do not propose reviewers"
angles = found["angles"]

excluded, own_institutions, soft, stats = conflicts(work, "2020-01-01")
blocks, pool_truncated = panel(angles, JOURNAL, excluded, own_institutions, soft, stats,
                               since_topic="2021-01-01", since_journal="2023-01-01")
for blk in blocks:
    for r in blk["shortlist"]:
        r["email"] = published_email(r["name"])

print(f"authors on the manuscript : {len(author_ids)}")
print(f"conflict scan             : {stats['works_scanned']} works, "
      f"{stats['consortium_papers_skipped']} consortium papers flagged")
print(f"excluded                  : {len(excluded)} people, "
      f"{len(own_institutions)} institutions; {len(soft)} soft-flagged")
for blk in blocks:
    print(f'\n{blk["angle"][:44]}  ({blk["id"]}, {blk["from"]}, '
          f'{blk["n_candidates"]} candidates)')
    for r in blk["shortlist"]:
        flag = "  [shares a large-author paper with the authors]" if r["shared_consortium_paper"] else ""
        print(f'   {r["name"]}, {"; ".join(r["institutions"])[:44]}{flag}')
        print(f'     {r["email"] or "[no published address found]"}  |  '
              f'{r["topic_papers"]} on angle, {r["journal_papers"]} in journal')
    if not blk["shortlist"]:
        print("   none - this journal's author pool does not cover this angle")

picks = [r for blk in blocks for r in blk["shortlist"]]

# --- invariants: a failure here means the skill is wrong ---
assert author_ids <= excluded, "a manuscript author escaped its own conflict screen"
assert not any(r["id"] in author_ids for r in picks)
assert not any(set(r["institution_ids"]) & own_institutions for r in picks), \
    "a reviewer shares an institution with the manuscript"
assert all(r["topic_papers"] >= 1 and r["journal_papers"] >= 1 for r in picks)
assert all(len(blk["shortlist"]) <= 2 for blk in blocks)
assert len(blocks) == len(angles), "every angle must be reported, including empty ones"
# The full screened list survives, so "who else was there?" needs no rerun.
assert all(len(blk["candidates"]) == blk["n_candidates"] for blk in blocks)
assert all(blk["shortlist"] == blk["candidates"][:len(blk["shortlist"])] for blk in blocks)
assert any(blk["n_candidates"] > len(blk["shortlist"]) for blk in blocks), \
    "no angle kept more candidates than it presented - the remainder is being discarded"

# A truncated conflict scan must stop the run, not merely print.
try:
    panel(angles, JOURNAL, excluded, own_institutions, soft,
          {"truncated_chunks": ["A123"]}, "2021-01-01", "2023-01-01")
except RuntimeError:
    pass
else:
    raise AssertionError("panel ran on a truncated conflict screen")

# Degenerate titles must not crash or fake a two-probe confirmation.
short = paper_angles("Alpha beta gamma")
assert "methods" not in short["probes"], "a short title ran the same query twice"
tiny = paper_angles("Cancer")
assert tiny["probes"]["subject"]["ran"] is False and not tiny["subject_placed"]

# An initials-only name identifies nobody, so the lookup must decline rather than guess.
assert published_email("Zzzq Nonexistentsurname") is None
assert not _has_given_name("j p") and _has_given_name("juan carlos")
assert _fold("Kris C. Wood") == _fold("Kris C Wood")          # punctuation folds away
assert _fold("Qun\u2010Ying Lei") == _fold("Qun-Ying Lei")     # unicode hyphen too

# The fragmentation backstop must be populated on BOTH paths - hard and soft. A collaborator
# whose only overlap is a large-author paper is flagged, not silently cleared.
assert stats["excluded_names"] and stats["soft_names"]
assert not (stats["soft_names"] & stats["excluded_names"]), "a name is both hard and soft"
assert all(_fold(r["name"]) not in stats["excluded_names"] for r in picks), \
    "a candidate matches an excluded name - fragmentation slipped through"

# The conflict screen must have read the whole record, not a truncated slice.
assert not stats["truncated_chunks"], "conflict scan truncated - the screen is incomplete"
assert stats["works_scanned"] >= 1000
assert len(own_institutions) < 100, "institution set has blown up - check the source"

# Emails come from the published record or stay empty. Never constructed.
assert all(r["email"] is None or "@" in r["email"] for r in picks)
# Deliberately weak: recovery is non-deterministic, so asserting a count would fail on drift.
# What must hold is that the mechanism works at all - a silent PubMed outage would return
# all-blank and look identical to "nobody published an address".
assert any(r["email"] for r in picks), "no address recovered at all - check PubMed access"

# --- the follow-up an author actually asks: who else was under this angle? ---
metabolism = next((b for b in blocks if b["id"] == "T10631"), None)
assert metabolism, "the cancer-metabolism angle drifted out - re-record observed values"
print(f'\nfollow-up - {metabolism["angle"]}: {metabolism["n_candidates"]} candidates')
rest = other_candidates(blocks, "T10631")
assert len(rest) == metabolism["n_candidates"] > len(metabolism["shortlist"])
assert all(r["id"] not in author_ids and r["journal_papers"] >= 1 for r in rest), \
    "candidates beyond the shortlist must carry the same guarantees as the shortlist"
```

**Expect.**

*Invariants* — asserted above and true whenever you run it. **No author of the manuscript
survives its own conflict screen**, and none shares an institution with it. Every angle is
reported, including empty ones. Every proposed reviewer satisfies both conditions, not one.
Every email is either absent or contains an `@` — never constructed — and at least one is
recovered, so a silent PubMed outage cannot pass as "nobody has an address". An initials-only
name returns nothing rather than guessing, punctuation and accents fold away so real variants
still match, and the fragmentation backstop is asserted to be populated on both the hard and
the soft path with no name on both at once. **A truncated
conflict scan halts the run** rather than producing reviewers from a partial screen, no
reviewer shares a canonical institution id with the manuscript, and a degenerate title neither
crashes nor reports a two-probe confirmation it did not earn. The presented
shortlist is a prefix of that angle's full candidate list, at least one angle keeps more
candidates than it presents, and every retained candidate carries the same guarantees as a
presented one. The conflict scan
is asserted not to have truncated, and the manuscript's institution set to have stayed small.

*Observed 2026-08-25* — these move when OpenAlex rebuilds, so a mismatch is drift to check,
not a bug.

- **4 angles**, two from the subject probe and two from the methods probe.
- Conflict scan read **1,191** works, flagged **188** consortium papers, excluded **3,234**
  author ids across **8** institutions, and soft-flagged **1,389**. As a fragmentation
  backstop it also carried **3,155** folded names hard-excluded and **1,404** soft-flagged.
- Panels: *Acute Myeloid Leukemia Research* → **0 candidates** (reported, not dropped);
  *Cancer, Hypoxia and Metabolism* → 6 candidates; *Bioinformatics and Genomic Networks*
  → 4; *Mitochondrial Function and Pathology* → 13.
- **6 reviewers proposed across 3 covered angles.** Email recovery returned **5, then 4, then
  3 of 6** across runs — see *the result is not deterministic* above. The
  lookup samples a handful of each person's papers and that sample moves, and requiring the
  whole given name costs some recall on top of that. Both are deliberate: a blank is
  recoverable by hand, a stranger's address in a cover letter is not.
- The full screened lists are retained, so the cancer-metabolism angle answers *who else was
  there* with all **6** of its candidates — Lu, Tasdogan, Meng, Mazzone, Lei, Vandekeere —
  without rerunning anything.
- A full run takes about **60-90 seconds**.

Two numbers are the ones to watch. **Eight** is the manuscript's own affiliations — an earlier
version gathered them from every paper the authors had co-written, reached 1,871, and screened
a screened pool down to one candidate. **1,191** is the whole co-author record: an earlier version
stopped at 600 and missed 352 conflicted people without saying so.

**Where it breaks.** An angle can come back empty, and on this paper one did: *Nature
Metabolism* publishes almost no AML, so no one satisfied both conditions for that angle. That
is the expected case, not a bug — the intersection is restrictive by construction. Widen
deliberately, say which rungs you used, and never relax the conflict screen to fill a panel.

Email recovery misses too — one of six here, because the address only exists if the person was
corresponding author on an indexed paper. Requiring the whole given name costs a few matches
where PubMed records only an initial, and that is the right trade: the alternative attaches a
same-surname colleague's address to a real reviewer's name.

## Sources

- OpenAlex API — <https://docs.openalex.org>. Data CC0; free, no key, asks for a `mailto`.
- Topic taxonomy and the `text/topics` classifier — <https://docs.openalex.org/api-entities/topics>.
