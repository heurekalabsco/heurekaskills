---
name: journal-selection
description: Build a shortlist of candidate journals for a finished manuscript, grouped by the angle the author chooses to lead with — the subject framing and the methods framing are found separately, and each angle gets its own specialist and broad-scope options with the evidence behind them.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [publishing, manuscript, openalex, bibliometrics]
covers: [journal selection, where to submit, target journal, venue, publishing, scope match, journal scope, cover letter, open access, article processing charge, apc, impact, citedness, openalex, bibliometrics, manuscript submission]
datasets: [https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=41350470&retmode=xml, https://api.openalex.org/works/doi:10.1038/s42255-025-01410-x]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-24
  against: OpenAlex API works/sources endpoints and NCBI E-utilities as of 2026-08-24 / Python 3.12.8 / standard library only
  executed: 6
  unverified: 0
---
# Choosing candidate journals for a manuscript

An author with a finished manuscript and no target journal needs a shortlist: places that
publish work like theirs, that they can then read properly and choose between. This skill
builds that shortlist from the manuscript's own title and abstract, using OpenAlex.

It answers **which journals publish work like this**. It does not predict acceptance, and
nothing here is a substitute for reading a journal's aims and scope before submitting.

Two things make this harder than it looks, and both are handled below:

- **Keyword search returns megajournals.** Search the phrase your paper is about and tally
  the venues, and you get *International Journal of Molecular Sciences*, *Scientific Reports*
  and the Frontiers family — because they publish tens of thousands of papers a year, so they
  publish more of everything. Raw counts measure journal size, not fit.
- **Correcting for size buries the selective journals.** Once you rank by the *share* of a
  journal's output on your topic, broad-scope journals disappear, because their output is
  spread across the whole taxonomy by design. *Nature Metabolism* published 827 research
  articles in the window tested below, spread across **190 distinct topics**, with at most 87
  in any one of them. No concentration measure will ever rank it highly, and for many papers
  it is exactly the right journal.

So the skill reports **two lenses** rather than one ranking. They answer different questions
and they are meant to be read side by side.

## Setup

OpenAlex data is CC0 and everything below uses the Python standard library only.

**Get a free API key first.** OpenAlex retired its old "polite pool" in **February 2026**: the
`mailto` parameter still parses but is now **ignored**, and a key is the only thing that raises
your limits. Without one you are on the keyless budget — **1,000 requests a day, shared across
everyone on your IP**, since the website's anonymous browsing draws on the same pool. A free
account raises that **10x**, takes about thirty seconds at [openalex.org](https://openalex.org),
and the key is at Settings -> API key.

The budget resets at **midnight UTC**, not on a rolling window, so exhausting it can cost you
the rest of the day. Writing this skill exhausted the keyless budget once.

Put the key in the environment and let the helper pick it up:

```bash
export OPENALEX_API_KEY="your-key"
```

**Never write a key into a script, a notebook, or a skill file.** If one leaks, rotate it at
Settings -> API key and choose *Immediately* — note that on a personal account the key is also
your sign-in credential, so rotating signs you out everywhere.

A full run costs roughly a hundred requests, most of it paging the candidate list in step 2.

```python
import json, os, urllib.request, urllib.parse, urllib.error, collections, time

API_KEY = os.environ.get("OPENALEX_API_KEY")   # from the environment; never hard-code it
API = "https://api.openalex.org"

def oa(path, **params):
    if API_KEY:
        params["api_key"] = API_KEY
    url = f"{API}/{path}?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                # Budget gone, or over 100 req/s. Do not retry: the reset is hours away.
                raise RuntimeError(
                    "OpenAlex returned 429 — daily budget exhausted (resets midnight UTC) "
                    f"or rate limited. Retry-After={e.headers.get('Retry-After')}s") from e
            if e.code in (500, 502, 503, 504) and attempt < 4:
                time.sleep(2 ** attempt)       # OpenAlex 5xx-es intermittently; worth a retry
                continue
            raise
```

Fail loudly on `429` rather than retrying it. A budget-exhausted 429 will not clear within any
backoff a script can sensibly wait out, and a retry loop turns it into a hang.

## Step 1 — find the paper's angles

A manuscript is rarely about one thing. This one is an AML paper, a cancer-metabolism paper,
a mitochondrial paper and a computational-methods paper, and those four framings point at four
different sets of journals. **The angles are what the output is organised around**, so getting
them right matters more than anything downstream.

Angles come from how OpenAlex labels the manuscript's nearest neighbours — the same
`primary_topic` field the journal statistics are computed from.

**Two probes, because a title carries two framings.** Papers typically open with the method and
close with the subject. Searching the whole title is too specific to vote on — the title below
matches exactly **one** work, itself — so the subject probe trims the leading clause away. That
discarded clause is not noise: it is the methods framing, and run as its own probe it finds
angles the subject probe cannot see. On the *Try it* paper the subject probe returns AML and
cancer metabolism; `pathway coessentiality mapping` returns *Bioinformatics and Genomic
Networks*. Drop it and the computational angle is structurally invisible.

**No absolute floor — the paper decides how many angles it has.** Within each probe, keep every
topic that stays comparable to that probe's leader. A narrow paper has one dominant topic and
yields one angle; a broad paper yields several. A fixed threshold cannot do this: tuned for the
broad paper it invents angles for the narrow one, and tuned for the narrow one it throws away
real angles on the broad one.

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
    # A short title makes these the same string. Running it twice would mark an angle as
    # confirmed by both probes when only one ran, so the methods probe is dropped instead.
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
        if not c:               # matches counted, but none carried a usable topic
            continue
        evidence[kind]["contributed"] = True
        total = sum(c.values())
        lead = c.most_common(1)[0][1] / total
        for key, n in c.items():
            share = n / total
            if share >= rel * lead:                 # comparable to THIS probe's leader
                merged[key] = max(merged.get(key, 0), round(share, 3))
                provenance.setdefault(key, set()).add(kind)
    ranked = sorted(merged.items(), key=lambda kv: -kv[1])[:cap]
    angles = [{"id": k[0], "name": k[1], "share": v, "from": sorted(provenance[k])}
              for k, v in ranked]
    # "Placed" is a property of the ANGLES THAT SURVIVED, not of the probe. A subject topic
    # can be produced and then ranked out by `cap` behind higher-share methods topics, and
    # the shortlist that follows would then describe the technique while the flag claimed
    # the subject was placed. Deriving it from the output closes that.
    subject_placed = any("subject" in a["from"] for a in angles)
    return {"angles": angles, "probes": evidence, "subject_placed": subject_placed}
```

**Read the angles before reading any journal.** They are the one assumption everything else
rests on, and the easiest thing for an author to see is wrong. Two signals are worth knowing:

- **Both probes agreeing** (`from` contains `subject` and `methods`) means the paper is coherent
  and narrow — the two narrow papers tested this way returned a single angle at 0.87 and 0.70,
  found by both probes.
- **An angle from `methods` only** is the computational or technical framing. It is real, and it
  is usually the one an author has not considered submitting to.

**`subject_placed` reports the output, not the probe.** It is true when a surviving angle came
from the subject probe. A subject topic can be produced and then ranked out by `cap` behind
higher-share methods topics — a flag derived from the probe would call that placed while every
angle in the shortlist described the technique.

**`subject_placed` is the flag that matters, not the angle count.** A generic methods clause
matches enormous numbers of papers — `cryo-em structure human` matches over 47,000 — so the
methods probe can succeed while the subject probe finds nothing. That combination produces four
confident-looking angles that describe *the technique* rather than this paper, and a shortlist
built on them recommends the same methods journals to every cryo-EM paper regardless of its
biology.

So when `subject_placed` is `False`, say so plainly and do not present the angles as the paper's
subject. The honest report is: the technique was recognised, the subject was not, give me a title
that names what the paper is about. If no probe clears `min_matches` at all, stop entirely.

## Step 2 — Lens A, specialist homes

Journals whose **recent output concentrates** in the manuscript's topics. This is the lens
that answers *who publishes a lot of exactly this*.

Concentration is `on-topic articles / all articles`, both over the same recent window, which
is what removes the size advantage. Two guards matter. Restricting to
`primary_location.source.type:journal` drops Figshare, Zenodo and PubMed, which otherwise
appear as top "venues". And the `min_recent` floor drops journals too small for a ratio to
mean anything — without it, a journal with four recent articles and two on topic scores 50%.

**Page the candidate list, do not take the first response.** `group_by` returns at most 200
groups per request and OpenAlex pages it with a cursor. Take only the first page and the
candidate list stops at whatever count happens to be 200th — on the topic in *Try it* that
cut-off was **8 on-topic papers**, and cursor-paging the same query returns **1,737** journals
instead of 200.

That truncation defeats the whole measure. Concentration exists to surface a small journal
publishing 7 relevant papers out of 20, which scores 35% and beats every megajournal; taking
one page throws that journal away before it is ever scored. An earlier version also pre-filtered
candidates by raw count, which is the same mistake one layer up — it is how this skill first
lost *Nature Metabolism* entirely.

**The trap: cursor pages are not ordered by count.** A single `group_by` response comes back
count-descending, so it is natural to stop paging once counts fall below a floor. Add a cursor
and that ordering disappears — the first cursor page of the *Try it* topic starts `2, 3, 1, 3,
1`, against `244, 177, 154` without one. Stopping early on a cursor page therefore discards an
arbitrary slice of the candidate list, and it silently dropped the known venue when this skill
was written that way. **Page a cursor query to exhaustion, or not at all.**

```python
def _chunks(xs, n=100):        # 100 is the documented ceiling for OR values per filter
    for i in range(0, len(xs), n):
        yield xs[i:i + n]

def specialist_homes(topic_ids, since, min_on_topic=10, min_recent=120, max_pages=25):
    tally, names, truncated = collections.Counter(), {}, []
    for tid in topic_ids:
        cursor = "*"
        for _ in range(max_pages):
            g = oa("works",
                   filter=f"primary_topic.id:{tid},from_publication_date:{since},"
                          f"type:article,primary_location.source.type:journal",
                   group_by="primary_location.source.id", per_page=200, cursor=cursor)
            groups = g["group_by"]
            if not groups:
                break
            for x in groups:
                sid = x["key"].rsplit("/", 1)[-1]
                tally[sid] += x["count"]
                names[sid] = x["key_display_name"]
            cursor = g["meta"].get("next_cursor")
            # No early exit on count: cursor pages are NOT ordered by count (see below).
            if not cursor:
                break
        else:
            truncated.append(tid)

    cand = [s for s, n in tally.items() if n >= min_on_topic]

    # Batched: an OR filter takes 100 ids, so a thousand candidates cost ten calls, not a thousand.
    totals = {}
    for ch in _chunks(cand):
        g = oa("works",
               filter=f"primary_location.source.id:{'|'.join(ch)},"
                      f"from_publication_date:{since},type:article",
               group_by="primary_location.source.id", per_page=200)
        for x in g["group_by"]:
            totals[x["key"].rsplit("/", 1)[-1]] = x["count"]
    meta = {}
    for ch in _chunks(cand):
        for x in oa("sources", filter=f"ids.openalex:{'|'.join(ch)}", per_page=200)["results"]:
            meta[x["id"].rsplit("/", 1)[-1]] = x

    out = []
    for sid in cand:
        total = totals.get(sid, 0)
        if total < min_recent:
            continue
        m = meta.get(sid, {})
        ss = m.get("summary_stats") or {}
        out.append({"lens": "specialist", "id": sid,
                    "journal": m.get("display_name", names[sid]),
                    "on_topic": tally[sid], "recent_total": total,
                    "concentration": round(100 * tally[sid] / total, 2),
                    "citedness_2y": round(ss.get("2yr_mean_citedness") or 0, 2),
                    "is_oa": m.get("is_oa"), "apc_usd": m.get("apc_usd"),
                    "issn_l": m.get("issn_l")})
    out.sort(key=lambda r: -r["concentration"])
    # Returned as a pair, not as a flag on the rows: when truncation leaves nothing above
    # the floors, a marker attached to rows disappears with them and an incomplete ranking
    # becomes indistinguishable from an empty one.
    return out, bool(truncated)
```

## Step 3 — Lens B, reach homes

Journals that list one of the manuscript's topics among their **top 25 subject areas**, ranked
by recent citedness. This is a membership test rather than a share, so a journal qualifies by
publishing the topic *seriously* even when it publishes much else besides — which is exactly
the case Lens A cannot represent.

`works_count` filters out journals too small to have a stable citedness figure. Sorting by
`summary_stats.2yr_mean_citedness` rather than lifetime `cited_by_count` matters: lifetime
counts rank by age and volume, and put century-old society journals above every journal
founded this decade.

```python
def reach_homes(topic_ids, per_topic=25, min_works=200):
    seen, out = set(), []
    for tid in topic_ids:
        s = oa("sources", filter=f"topics.id:{tid},type:journal,works_count:>{min_works}",
               sort="summary_stats.2yr_mean_citedness:desc", per_page=per_topic)
        for x in s["results"]:
            sid = x["id"].rsplit("/", 1)[-1]
            if sid in seen:
                continue
            seen.add(sid)
            ss = x.get("summary_stats") or {}
            out.append({"lens": "reach", "id": sid, "journal": x["display_name"],
                        "citedness_2y": round(ss.get("2yr_mean_citedness") or 0, 2),
                        "is_oa": x.get("is_oa"), "apc_usd": x.get("apc_usd"),
                        "issn_l": x.get("issn_l")})
    out.sort(key=lambda r: -r["citedness_2y"])
    return out
```

## Step 4 — assemble the shortlist, one block per angle

Rank **per angle**, never pooled. Pooling is what produced a flat list of 1,607 journals in
which no row meant anything; the same data grouped by angle is four blocks of six.

```python
def shortlist(angles, since, per_angle=3):
    blocks = []
    for a in angles:
        A, incomplete = specialist_homes([a["id"]], since)
        B = reach_homes([a["id"]])
        blocks.append({"angle": a["name"], "id": a["id"], "share": a["share"],
                       "from": a["from"], "ranking_incomplete": incomplete,
                       "specialist": A[:per_angle], "reach": B[:per_angle],
                       "all_specialist": A, "all_reach": B,   # keep the rest
                       "n_specialist": len(A), "n_reach": len(B),
                       "empty": not A and not B})
    return blocks

def other_journals(blocks, angle_id, lens="all_specialist", limit=15):
    """Everything else that ranked under one angle, in order, shortlist first."""
    blk = next((b for b in blocks if b["id"] == angle_id), None)
    if blk is None:
        raise KeyError(f"no angle {angle_id!r}; have {[b['id'] for b in blocks]}")
    for r in blk[lens][:limit]:
        extra = (f'{r["concentration"]:5.1f}%  {r["on_topic"]}/{r["recent_total"]}'
                 if lens == "all_specialist" else f'2yMC={r["citedness_2y"]:5.1f}')
        print(f'   {r["journal"][:44]:44s} {extra}')
    return blk[lens]
```

Three per lens per angle is the useful size. The author is choosing a framing first and a
journal second, and six options inside a framing is a decision; twenty is a list.

**Present a slice, keep the whole ranking.** `specialist` and `reach` are what you show;
`all_specialist` and `all_reach` are the full ranked lists behind them. *What else was under
the AML angle?* is the commonest follow-up an author has, and it should not cost a rerun —
`other_journals(blocks, "T10309")` answers it from data already in hand.

**Report an empty angle rather than dropping it.** If a real angle produces no journals it means
the corpus does not support that framing, and that is worth knowing before it goes in a cover
letter.

**Raise the quality bar for per-angle display.** Buried at rank 400 of a pooled list, a journal
with 5 on-topic papers out of 70 was harmless noise. Shown as one of three recommendations it is
not: an early version surfaced *Journal of Kidney Cancer and VHL* (8/86) and *Egyptian Journal of
Pathology* (5/70) against a cancer-metabolism angle. `min_on_topic` and `min_recent` are set for
that, and they are the numbers to raise if a shortlist looks thin on credibility.

## What the numbers do and do not mean

`2yr_mean_citedness` is OpenAlex's own two-year mean citation count. It is **not** the Journal
Impact Factor, it is not computed on the same denominator, and it should not be presented as
one. Treat it as a rough tier marker.

It also has bad values, and they run in both directions. *Cancer Research* and *Diabetes*
both read 0.55 — implausibly low, an artefact of how non-article content is counted. In the
*Try it* run, *Iranian Journal of Cancer Prevention* reads **53.00**, placing it above *Cell*
and every *Nature* title in lens B. **A citedness figure that would be remarkable if true is
a data defect, not a finding.** Check any number before it reaches an author, and do not let
an unfamiliar journal at the top of lens B go unexamined.

`apc_usd` is a list price. It is blank for subscription journals, ignores waivers,
society-member rates and transformative agreements, and is often the single most decision-
relevant field on the row. Report it, and say where it came from.

## What to hand back

**One block per angle, not a ranked table.** Each block names the angle, says which probe found
it, and lists its specialist and broad-scope options with the evidence on each row:

```
AML / leukaemia            (T10309, share 0.21, from subject)
  specialist   Leukemia                     25.6%   310/1212 recent articles
               Blood Cancer Discovery       22.7%    49/216
  reach        Cancer Cell                  2y mean citedness 32.8
               J Hematology & Oncology      33.0

Computational / networks   (T10887, share 0.13, from methods)
  specialist   Bioinformatics                8.4%   227/2713
  reach        Nature Methods               21.6
```

Then a short summary. The blocks are the deliverable; the summary is where the author corrects
what the skill misread.

The summary states, in prose:

- **Proposed** — the shortlist, and that it ranks on where comparable work has recently
  appeared, nothing more.
- **Inferred** — the topics the classifier assigned and their scores. This is the assumption
  everything else rests on, and it is the thing an author can most easily see is wrong.
- **Decided** — the window, the on-topic and minimum-output floors, and that Lens A
  cannot rank broad-scope journals.
- **Outstanding** — what was not checked. Scope statements, whether the journal takes this
  article type, format limits, society affiliation, and every editorial consideration that is
  not bibliometric.

Leave a field genuinely blank when the data is missing — an empty APC cell for a subscription
journal — and name it in the summary. Do not write `[check this]` into the table.

## Limits

- **This is a bibliometric neighbourhood, not editorial judgement.** Novelty, timeliness and
  fit with what an editor is currently commissioning decide real outcomes, and none of them
  is in this data.
- **It will not pick the journal a given paper landed in, and is not meant to.** On the
  *Try it* paper the method ranks the journal that actually published it around the middle of
  both lenses. Nothing is wrong: fifteen journals score above it in lens B and most of them —
  *Cell*, *Cancer Cell*, *Nature Medicine*, *Cell Metabolism* — really are more central to
  that subject. A shortlist is where comparable work appears, not a prediction of where one
  manuscript will be accepted.
- **Lens A cannot rank selective broad-scope journals.** Structural, quantified above, and the
  reason Lens B exists. If the author is aiming at a *Nature* or *Cell* title, Lens A will not
  confirm the choice and its silence is not evidence against it.
- **OpenAlex topic assignment is imperfect.** *Pancreatic function and diabetes* sits under the
  subfield *Surgery*, which is defensible and still surprising. Read the topic names before
  trusting the shortlist.
- **Roughly half of manuscripts may not be placeable.** Three of the six sampled above could
  not be. The method needs a dense, well-populated neighbourhood, and an unusual or highly
  specific manuscript does not have one.
- **Predatory and low-quality journals are in the index.** Concentration does not distinguish
  them, and a journal publishing almost nothing but your topic may be concentrated for bad
  reasons. Check anything unfamiliar against DOAJ or a librarian before submitting.
- **No preprint servers, no conference proceedings.** The `type:journal` filter excludes them
  deliberately.

## Try it

A self-contained check that this skill still works. Public data. Runs without a key, though see *Setup* — a free key is worth having before you run this more than once.

**Data** — two inputs, and they play different roles.

The manuscript text comes from PubMed, `PMID 41350470`:

    https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=41350470&retmode=xml

That is Stewart, Zachman, Castellano-Escuder et al., *Pathway coessentiality mapping reveals
complex II is required for de novo purine biosynthesis in acute myeloid leukaemia*, Nature
Metabolism 7:2474-2488 (2025), `doi:10.1038/s42255-025-01410-x`. E-utilities needs no account
and no key. Fetching the abstract rather than pasting it keeps the run reproducible and keeps
a transcription error out of the test. Last confirmed reachable 2026-08-23.

The second input is the same paper's OpenAlex record:

    https://api.openalex.org/works/doi:10.1038/s42255-025-01410-x

which is used **only to check the answer** — it is where the paper actually appeared. OpenAlex
is CC0.

A published paper is the test case because it is the only way to have an answer to check
against. It is not the real input: in normal use the manuscript is unpublished, has no PMID,
and the author pastes their own title and abstract into `TITLE` and `ABSTRACT` below.

**Run.** With the functions above defined:

```python
import xml.etree.ElementTree as ET

def pubmed_manuscript(pmid):
    url = ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
           f"?db=pubmed&id={pmid}&retmode=xml")
    with urllib.request.urlopen(url, timeout=60) as r:
        art = ET.parse(r).getroot().find(".//Article")
    return ("".join(art.find("ArticleTitle").itertext()),
            " ".join("".join(x.itertext()) for x in art.findall("Abstract/AbstractText")))

TITLE, ABSTRACT = pubmed_manuscript("41350470")
assert TITLE.startswith("Pathway coessentiality mapping")
assert "complex II" in ABSTRACT and len(ABSTRACT) > 1000
# The angles run on the TITLE. Searching the abstract too makes the query so specific it
# matches only the paper itself, which is not a neighbourhood to vote over.

SINCE = "2023-01-01"
ACTUAL = "S4210232714"                      # Nature Metabolism, where this paper ran

found = paper_angles(TITLE)
angles = found["angles"]
for a in angles:
    print(f'{a["share"]:.2f}  {a["id"]}  {a["name"][:42]:42s} from={a["from"]}')

blocks = shortlist(angles, SINCE)
for blk in blocks:
    print(f'\n{blk["angle"][:40]}  ({blk["id"]}, {blk["from"]})')
    for r in blk["specialist"]:
        print(f'   specialist {r["journal"][:38]:38s} {r["concentration"]:5.1f}%  '
              f'{r["on_topic"]}/{r["recent_total"]}')
    for r in blk["reach"]:
        print(f'   reach      {r["journal"][:38]:38s} 2yMC={r["citedness_2y"]:5.1f}')

# --- invariants: a failure here means the skill is wrong ---
# This paper is genuinely multi-angle; a narrow paper would correctly return one.
assert 2 <= len(angles) <= 4
ids = {a["id"] for a in angles}
assert "T10309" in ids, "the AML subject angle is missing"
# The methods probe must contribute something the subject probe cannot see. This is the
# whole reason for probing twice, and it is the angle authors most often have not considered.
assert any("methods" in a["from"] and "subject" not in a["from"] for a in angles), \
    "the methods probe found nothing the subject probe missed - it has stopped earning its call"

for blk in blocks:
    for r in blk["specialist"]:
        assert r["concentration"] == round(100 * r["on_topic"] / r["recent_total"], 2)
        assert r["on_topic"] >= 10 and r["recent_total"] >= 120   # per-angle credibility floor
    assert len(blk["specialist"]) <= 3 and len(blk["reach"]) <= 3
    # the presented rows are a prefix of the retained ranking, which is kept whole
    assert blk["specialist"] == blk["all_specialist"][:len(blk["specialist"])]
    assert blk["reach"] == blk["all_reach"][:len(blk["reach"])]
    # An incomplete ranking must be reported even when it leaves nothing above the floors.
    assert blk["ranking_incomplete"] is False
    if blk["empty"]:
        print(f'NOTE: angle {blk["angle"]!r} produced no journals - reported, not dropped')

# --- the follow-up an author actually asks: what else was under this angle? ---
aml = next(b for b in blocks if b["id"] == "T10309")
print(f'\nfollow-up - {aml["angle"]}: {aml["n_specialist"]} specialist journals ranked')
rest = other_journals(blocks, "T10309", limit=6)
assert len(rest) == aml["n_specialist"] > len(aml["specialist"]), \
    "the ranking beyond the presented rows is being discarded"

# --- the counter-example the two-lens design exists for ---
# A broad-scope journal spreads its output across the taxonomy, so concentration pushes it
# far down. Lens B must surface it into a list a person would actually read.
pooled_A, pooled_incomplete = specialist_homes([a["id"] for a in angles], SINCE)
pooled_B = reach_homes([a["id"] for a in angles])
rank_a = next((i for i, r in enumerate(pooled_A, 1) if r["id"] == ACTUAL), None)
rank_b = next((i for i, r in enumerate(pooled_B, 1) if r["id"] == ACTUAL), None)
print(f"\nNature Metabolism - pooled lens A {rank_a}/{len(pooled_A)}, "
      f"lens B {rank_b}/{len(pooled_B)}")
assert rank_a and rank_b, "the known venue fell out of a lens entirely"
assert rank_b < rank_a, "lens B is not recovering what concentration buries"
assert len(pooled_B) < len(pooled_A), "lens B is meant to be the short, readable list"

# --- the guard must fire on a manuscript the index cannot place ---
thin = paper_angles("Cryo-EM structure of the human mitochondrial calcium uniporter "
                    "holocomplex bound to a novel allosteric inhibitor at 2.1 angstrom")
print(f'thin case: subject_placed={thin["subject_placed"]}, '
      f'{len(thin["angles"])} angle(s), subject probe matched '
      f'{thin["probes"]["subject"]["matched"]}')
# The subject probe must fail here and the failure must be visible. The methods probe still
# succeeds on a generic clause, which is exactly why angle count alone is not the guard.
assert not thin["subject_placed"], "the subject guard no longer fires on an unplaceable title"
assert thin["probes"]["subject"]["matched"] < 40
assert found["subject_placed"], "the Try it paper's subject should place cleanly"
# --- degenerate titles must not crash, and must not fake a two-probe confirmation ---
short = paper_angles("Alpha beta gamma")
assert "methods" not in short["probes"], "a short title ran the same query twice"
assert all("methods" not in a["from"] for a in short["angles"])
tiny = paper_angles("Cancer")
assert tiny["probes"]["subject"]["ran"] is False and not tiny["subject_placed"]
# The probe must have produced a topic at all...
assert found["probes"]["subject"]["contributed"] is True
# The flag must track the surviving angles, not merely the probe's contribution.
assert found["subject_placed"] == any("subject" in a["from"] for a in angles)
assert any("subject" in a["from"] for a in angles), "no subject angle survived the cap"
assert not thin["probes"]["subject"]["contributed"] and not thin["subject_placed"]

try:
    other_journals(blocks, "T00000")
except KeyError:
    pass
else:
    raise AssertionError("an unknown angle id should raise KeyError, not StopIteration")

```

**Expect.**

*Invariants* — asserted in the block above, and true regardless of when you run it. The paper
returns between two and four angles; the AML subject angle is among them; and **the methods
probe contributes at least one angle the subject probe cannot see** — the reason for probing
twice at all. Every specialist row's concentration is its own ratio and clears the per-angle
floors; no block exceeds three rows per lens, and the rows presented are a prefix of the full
ranking retained behind them. The known venue stays inside both pooled lenses,
ranked higher in the shorter lens B than in lens A. And on a title whose subject cannot be
placed, `subject_placed` comes back `False` even though the generic methods clause still
produces angles. Degenerate titles are asserted too: a three-word title must not run the same
query as both probes, a one-word title places nothing and still returns a well-formed
`probes["subject"]`, and an unknown angle id raises `KeyError` rather than `StopIteration`.
`subject_placed` tracks the angles that survived the cap, not the probe: a subject topic that
is produced and then ranked out behind higher-share methods topics does not count as placed,
because the shortlist built from what remains would describe the technique.

*Observed 2026-08-24* — these move when OpenAlex rebuilds, so a mismatch is drift to check,
not a bug.

- **4 angles.** `T10309` *Acute Myeloid Leukemia Research* (0.21, subject), `T10631` *Cancer,
  Hypoxia, and Metabolism* (0.19, subject), `T10887` *Bioinformatics and Genomic Networks*
  (0.13, **methods**), `T10301` *Mitochondrial Function and Pathology* (0.09, **methods**).
- Representative blocks: AML → *Leukemia* 25.6% (310/1212), *Blood Cancer Discovery* 22.7%
  (49/216), reach *Cancer Cell* (32.8). Computational → *Bioinformatics* 8.4% (227/2713),
  reach *Nature Methods* (21.6). Mitochondrial → *Mitochondrion* 41.1% (125/304), reach
  *Cell Metabolism* (28.9).
- The full rankings are retained behind each block, so *what else was under the AML angle*
  answers from **175** ranked specialist journals — *Leukemia Research Reports* 27.7%,
  *Leukemia* 25.6%, *Blood Cancer Discovery* 22.7%, *Blood Neoplasia* 21.1%, *Leukemia
  Research* 18.9% — without rerunning anything.
- Pooled across all four angles: lens A **667** journals, lens B **87**. *Nature Metabolism*
  lens A **57/667**, lens B **20/87**.
- Thin case: subject probe matched **2** works, `subject_placed=False`.
- A full run takes about **90 seconds**.

**Where it breaks.** The method was run across six further manuscripts — a clinical trial, a
bioinformatics tool paper, a plant study, a microbiome study, a 2008 cancer paper and a cryo-EM
structure. Three could not be placed — their subject probe fell short, so `subject_placed`
came back `False` — and the other three produced
usable shortlists. Two failure modes are worth naming, and neither is visible from a single
successful run:

- **A very short title collapses the two probes into one.** At three content words or fewer the
  subject probe and the methods probe are the same string, so the methods probe is dropped
  rather than run twice — otherwise an angle appears confirmed by two probes when only one ran.
  Between four and seven content words both probes run, but the subject probe is the untrimmed
  title and so is narrower than usual. Fewer than two content words places nothing at all.
- **A generic methods clause places the technique, not the paper.** `subject_placed` is the
  guard; angle count is not, because the methods probe can return four confident angles about
  cryo-EM in general while the subject probe matched two works.
- **Topic assignment misfires survive the floors.** *Anästhesie Nachrichten* appears third under
  the cancer-metabolism angle at 5.2% (13/249). It clears both floors and is still obviously
  wrong. The evidence columns exist so a reader can see this; no floor setting removed it
  without also removing legitimate small journals.
- Clinical topics pull in case-report venues — *Cureus* and *Reactions Weekly* both rank high
  on raw counts in an endocrinology run. Concentration demotes them; the `min_recent` floor
  does not.

## Sources

- OpenAlex API — <https://docs.openalex.org>. Data CC0; the API is free and a key is free.
- Polite-pool retirement and the `mailto` deprecation — <https://help.openalex.org/api/deprecations>.
- Topic taxonomy and the `text/topics` classifier — <https://docs.openalex.org/api-entities/topics>.
