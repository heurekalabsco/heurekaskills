---
name: intact
description: Query IntAct curated molecular interaction evidence — resolve accessions rather than gene labels, read detection method, interaction type and MI score per evidence row, and drop the negative records the REST API mixes into real interactions.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, protein-interaction, ppi, proteomics]
covers: [intact, imex, molecular interaction, protein-protein interaction, protein interaction, ppi, interactome, binary interaction, curated interaction, experimental evidence, detection method, two hybrid, pull down, coimmunoprecipitation, crosslink, tandem affinity purification, proximity labelling, mi score, psi-mitab, mitab, psicquic, interaction type, phosphorylation, negative interaction, mutation effect, small molecule, mirna, mouse, yeast, uniprot accession]
papers: [PMID:34761267, PMID:24234451]
access: [open]
datasets: ["https://www.ebi.ac.uk/intact/ws/interaction/findInteractions/P04637", "https://ftp.ebi.ac.uk/pub/databases/intact/current/psimitab/intact_negative.txt"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-19
  against: IntAct release 2026-10-17 (psimitab files stamped 2026-10-24) / Python 3.11 standard library only
  executed: 7
  unverified: 0
---

# IntAct molecular interactions

IntAct is EMBL-EBI's curated database of experimentally determined molecular
interactions. Every row it returns is one piece of evidence from one publication,
annotated with the method that produced it. That is the difference that matters when
choosing a source: association networks such as STRING (the `string` skill) blend curated
experiments with predictions and text mining into a single score, so a high-scoring edge
there may rest on no experiment at all. IntAct carries only curated experimental records,
and tells you which experiment each one came from.

**Nothing to obtain.** The REST service and the bulk files are open — no key, no account,
no registration, no click-through. IntAct's
[licence page](https://github.com/Intact-Portal/intact-portal-documentation/blob/master/about/license-privacy.md)
puts all IntAct data — the PSI-MI XML, MI-JSON and MITAB files, and data accessed through
its web pages and services — under CC BY 4.0, so cite it (PMID 34761267) when you
redistribute figures or derived tables. The same page puts the software, and the SQL and
graph database dumps, under Apache 2.0.

Base URL for the web services:

```
https://www.ebi.ac.uk/intact/ws
```

All examples below use the Python standard library, so they need no installation.

## Resolve the molecule, not its name

The `query` path segment is a free-text search across names, aliases and accessions. It
matches substrings, so a gene label pulls in every molecule whose name contains it:

```python
import json, urllib.parse, urllib.request

WS = "https://www.ebi.ac.uk/intact/ws"

def ws(path, form=None, **params):
    """GET with query parameters, or POST a form when `form` is given."""
    url = f"{WS}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = urllib.parse.urlencode(form).encode() if form is not None else None
    with urllib.request.urlopen(url, data=data, timeout=300) as r:
        body = r.read().decode()
    return json.loads(body) if body.startswith(("{", "[")) else body

# A free-text label matches anything the token appears in.
page = ws("interaction/findInteractions/CDK1", page=0, pageSize=50)
off = [r for r in page["content"]
       if not (r["uniqueIdA"].startswith("P06493") or r["uniqueIdB"].startswith("P06493"))]
print(f"query 'CDK1'    -> {page['totalElements']} rows; "
      f"{len(off)}/50 sampled involve no CDK1 at all")
print("  e.g.", [(r["moleculeA"], r["moleculeB"]) for r in off[:3]])

# An accession is far more specific, but it is still a text search.
page = ws("interaction/findInteractions/P06493", page=0, pageSize=1)
print(f"query 'P06493'  -> {page['totalElements']} rows")
```

On the 2026-10-17 release this printed 3007 rows for `CDK1` against 479 for `P06493`,
and 43 of the 50 sampled `CDK1` rows involved no CDK1 at all: they were interactions
among the CDK family paralogues whose names contain the string, CDK10 through CDK19,
plus non-human orthologues curated under lower-case labels such as `cdk1-a` in *Xenopus*
and `cdk1_margl` in starfish. Always query the accession.

The accession query is not exact either. Its 479 rows were 472 on the canonical CDK1
interactor, 3 on the isoforms `P06493-1` and `P06493-2`, and 4 on the CDK1-203 mRNA
(`ENST00000395284`), which pairs with miRNAs and has no CDK1 protein on either side. Those
4 rows match because the transcript interactor lists `P06493 (uniprotkb)` among its
cross-references (`xrefsA` / `xrefsB`).
To keep only the protein you asked about, filter the rows on its IntAct interactor
accession (`acA` / `acB`) or on an exact `uniqueIdA` / `uniqueIdB` match — never on
`startswith`, which keeps the isoforms.

The `ws()` helper defined above is reused by the other examples in this page; the
`## Try it` block at the end repeats it so that it runs on its own.

Each row carries two kinds of identifier per side, and only one of them is safe to join
on. `idA` and `idB` are display strings with the source database appended
(`"P06493 (uniprotkb)"`); `uniqueIdA` and `uniqueIdB` are the bare accessions. Join on
`uniqueIdA` / `uniqueIdB`, and remember that **the molecule you asked about can be on
either side** — the same pair appears in both orders across evidence rows.

`GET interactor/findInteractor/{query}` resolves an accession to IntAct interactors
directly, with each one's interaction count. Isoforms and transcripts come back as
separate interactors with their own IntAct accessions, so an exact match on the
canonical accession silently drops isoform-level evidence — this endpoint shows you what
you would be dropping:

```python
ACC = "P06493"

found = ws(f"interactor/findInteractor/{ACC}", page=0, pageSize=100)
print(f"{ACC}: {found['totalElements']} interactors")
for c in found["content"]:
    print(f"  {c['interactorAc']:<13} {c['interactorPreferredIdentifier']:<16} "
          f"{c['interactorType']:<8} {c['interactionCount']}")

# The canonical interactor is the one whose preferred identifier is the accession itself.
AC = next(c["interactorAc"] for c in found["content"]
          if c["interactorPreferredIdentifier"] == ACC)
print(f"{ACC} -> interactor {AC}; interaction counts sum to",
      sum(c["interactionCount"] for c in found["content"]))
```

This returned 4 interactors: `EBI-444308` for `P06493` with 472 interactions,
`EBI-11614201` for `P06493-1` with 2, `EBI-16421612` for `P06493-2` with 1, and
`EBI-54408704`, the `ENST00000395284` mRNA, with 4. They sum to 479, the
`findInteractions` total. `findInteractor` is a text search too — `CDK1` returns 78
interactors across species — and it pages at 10 by default (TP53 has 11 interactors), so
pass `pageSize` and pick the interactor by exact `interactorPreferredIdentifier`, not by
position: the order is not by interaction count. Its `interactionCount` includes negative
records (TP53's canonical interactor reports 2209, the positive plus negative count).

## Negative records are mixed into the results

**This is the trap worth knowing before anything else.** IntAct curates *reported
non-interactions* — pairs that were tested and found not to interact — and flags them
with `negative: true`. They are real curation output and scientifically valuable, but
they are the opposite of what a list of interactions should contain.

`GET findInteractions` has no filter parameter and returns them mixed in with everything
else. `countInteractionResult` and `POST findInteractionWithFacet` both take a
`negativeFilter` and both default to excluding them. So the endpoints disagree unless you
handle it yourself.

Two more things before you page anything:

- **`findInteractions` caps `pageSize` at 2000, silently.** `pageSize=3000` for TP53
  returned 2000 rows of `totalElements: 2257`, with nothing in the response saying the
  request was cut. A loop that steps `page` by a `pageSize` above 2000 skips rows. Keep
  pages at or below 2000 and stop when `page * pageSize >= totalElements`; a page past the
  end is a 200 with empty `content`, so it will not stop you.
- **`findInteractions` rows are heavy.** Each one embeds full PSI-MI XML 2.5 and 3.0 and
  MITAB serialisations of itself; the 479 CDK1 rows were 87 MB, and TP53's first
  2000-row page was still downloading at 495 MB when a ten-minute timeout cut it off. `POST findInteractionWithFacet` returns the same fields with those serialisation
  fields null — for CDK1 the same 479 `binaryInteractionId`s, with identical identifiers,
  type, method, score, negative flag and taxa — in 6.4 MB rather than 87 MB. Use it for
  anything you page in full, and pass `negativeFilter` explicitly.

```python
def page_all(fetch, page_size=1000):
    """Collect every page; refuse a short read rather than return part of a result."""
    rows, page = [], 0
    while True:
        d = fetch(page, page_size)
        rows += d["content"]
        page += 1
        if page * page_size >= d["totalElements"]:
            break
    if len(rows) != d["totalElements"]:
        raise RuntimeError(f"paged {len(rows)} of {d['totalElements']} rows")
    return rows

def find_all(query):
    """GET findInteractions, every page. Keep page_size <= 2000: larger is capped silently."""
    return page_all(lambda p, n: ws(f"interaction/findInteractions/{query}",
                                    page=p, pageSize=n))

def facet_all(query, negative="POSITIVE_AND_NEGATIVE"):
    """POST findInteractionWithFacet, every page: the same rows, far fewer bytes."""
    return page_all(lambda p, n: ws("interaction/findInteractionWithFacet",
                                    form={"query": query, "page": p, "pageSize": n,
                                          "negativeFilter": negative})["data"])

ACC, AC = "P04637", "EBI-366083"   # TP53

total = ws(f"interaction/findInteractions/{ACC}", page=0, pageSize=1)["totalElements"]
rows = facet_all(ACC)
neg = [r for r in rows if r["negative"]]
print(f"GET findInteractions totalElements : {total}")
print(f"complete pages                     : {len(rows)} rows, {len(neg)} negative")

mine = [r for r in rows if AC in (r["acA"], r["acB"])]
print(f"on interactor {AC}          : {sum(not r['negative'] for r in mine)} positive, "
      f"{sum(r['negative'] for r in mine)} negative")

# The count endpoint takes a filter and defaults to positives only.
for f in ("POSITIVE_ONLY", "NEGATIVE_ONLY", "POSITIVE_AND_NEGATIVE"):
    n = ws("interaction/countInteractionResult", query=ACC, interactorAc=AC, negativeFilter=f)
    print(f"  countInteractionResult {f:<22} {n}")
print("  countInteractionResult (no filter)        ",
      ws("interaction/countInteractionResult", query=ACC, interactorAc=AC))

for r in neg[:2]:
    print(f"  negative: {r['moleculeA']} / {r['moleculeB']} — "
          f"{r['detectionMethod']}, PMID {r['publicationPubmedIdentifier']}")
```

For TP53 the complete pages held all 2257 rows `findInteractions` reports, 9 of them
negative. The 2209 rows on the canonical interactor split 2204 positive and 5 negative,
exactly the `POSITIVE_ONLY` and `NEGATIVE_ONLY` counts; the unfiltered count was 2204,
confirming the default is `POSITIVE_ONLY`. The other 4 negatives sit on TP53 isoform and
transcript interactors. **Filter on `negative` yourself whenever you use
`findInteractions`, over every page.** A pipeline that skips this reports pairs as
interacting on the strength of a publication that concluded they do not; one that checks
only the first page misses negatives that sort later.

`negativeFilter` accepts exactly `POSITIVE_ONLY`, `NEGATIVE_ONLY` or
`POSITIVE_AND_NEGATIVE`; anything else is a 400 with a Java enum-conversion message.

## Read an evidence row

A row is one experiment, not one interaction — several rows commonly describe the same
pair from different publications and methods. This pulls every CDK1 row with the `GET`
pager (about 87 MB; `facet_all` returns the same rows faster):

```python
import collections

AC = "EBI-444308"                    # canonical CDK1, from findInteractor above

every = find_all("P06493")
rows = [r for r in every if not r["negative"] and AC in (r["acA"], r["acB"])]

# Every row is one piece of evidence from one publication, not one interaction.
print("rows returned:", len(every), "| on the canonical interactor:", len(rows),
      "| distinct partner pairs:", len({frozenset((r["acA"], r["acB"])) for r in rows}))

print("interaction types:", collections.Counter(r["type"] for r in rows).most_common(4))
print("detection methods:", collections.Counter(r["detectionMethod"] for r in rows).most_common(3))

# The MI score is carried twice; it must agree.
bad = [r["ac"] for r in rows
       if f"intact-miscore:{r['intactMiscore']}" not in r["confidenceValues"]]
print("rows where intactMiscore disagrees with confidenceValues:", len(bad))
print("MI score range:",
      min(r["intactMiscore"] for r in rows), "-", max(r["intactMiscore"] for r in rows))

# Interactors are not all proteins.
print("interactor types:", collections.Counter(
    [r["typeA"] for r in rows] + [r["typeB"] for r in rows]).most_common(4))

# How many 'association' rows are binary pairs inferred from an n-ary experiment?
assoc = [r for r in rows if r["type"] == "association"]
print(f"association rows: {len(assoc)}, of which spoke-expanded:",
      sum(1 for r in assoc if r["expansionMethod"] == "spoke expansion"))
```

The 472 positive evidence rows on canonical CDK1 collapsed to 259 distinct partner pairs.
That count keys pairs on the IntAct interactor accession, so a partner's isoform (say
`Q9XTF3-2`) counts as a partner separate from its canonical form; keying on `uniqueIdA` /
`uniqueIdB` does the same. Map isoforms to their canonical accession first if you want
gene-level partners. The fields that carry the meaning:

| field | what it holds |
|---|---|
| `type` | the interaction type — `association`, `physical association`, `direct interaction`, `phosphorylation`, `proximity` |
| `detectionMethod` | the assay — `anti tag coip`, `pull down`, `crosslink`, `tap`, `protein kinase assay` |
| `intactMiscore` | MI score, 0 to 1, a weighted count of independent evidence |
| `negative` | true when the publication reported no interaction |
| `publicationPubmedIdentifier` | the PMID behind this row |
| `sourceDatabase` | the curating database — IntAct, or an IMEx partner such as MINT or DIP |
| `typeA` / `typeB` | interactor type — `protein`, `small molecule`, `mrna`, `mirna` |
| `mutationA` / `mutationB` | whether a mutation annotation affects this participant |
| `expansionMethod` | `spoke expansion` when this binary row was inferred from an n-ary experiment, otherwise null |

Read `type` before you treat an edge as binding. The PSI-MI vocabulary grades it in
three steps, and they are not interchangeable:

- `direct interaction` (MI:0407) — the molecules are in contact.
- `physical association` (MI:0915) — same physical complex, not necessarily touching.
- `association` (MI:0914) — co-purified in one pull-down or co-immunoprecipitation, and
  they may belong to *different* complexes that happen to share a bait.

`association` was the commonest value by a wide margin and the weakest claim, so
treating it as binding is the easiest way to overstate what the experiment showed. For
canonical CDK1, all 326 `association` rows carried `expansionMethod: spoke expansion`,
meaning the pair was never observed as a pair: a bait pulled down several molecules and
the n-ary result was expanded into binary rows around that bait. Check `expansionMethod`
whenever a row matters, and prefer `direct interaction` or an unexpanded `physical
association` when you need evidence of contact.

Treat the MI score as confidence, not affinity — it rises with the number of independent
experiments reporting a pair, so a single excellent structure can score below a pair seen
weakly many times. The score appears twice per row, as `intactMiscore` and inside
`confidenceValues`; across the 472 rows those agreed everywhere, and a disagreement would
mean the record is malformed rather than that the pair is unusual.

Not every interactor is a protein — the canonical CDK1 rows included 10 small-molecule
participants carrying ChEBI identifiers, and the transcript rows dropped above were mRNA
and miRNA. Check `typeA` / `typeB` before mapping a `uniqueId` to a protein accession.

## Count and filter

`countInteractionResult` is the cheap way to size a query before paging it. It requires
both `query` and `interactorAc`, and returns a bare integer; omitting `interactorAc` is a
400. Scoping to the interactor accession is stricter than the free-text query — for CDK1
the query matched 479 rows while the interactor-scoped count was 472, the gap being the
isoform and transcript rows described above.

Verified filters, against TP53 and CDK1:

- `minMIScore` / `maxMIScore` — floats. `minMIScore=0.6` cut CDK1 from 472 to 128.
- `mutationFilter` — boolean. `true` cut CDK1 to 30 rows carrying mutation annotations.
- `negativeFilter` — the three enum values above.
- `interactorSpeciesFilter` — a species name or taxid. It keeps rows in which **any**
  participant is of that species, not rows in which the queried molecule is. For TP53
  (`EBI-366083`), `9606` and `Homo sapiens` both left the count at 2204 — TP53 itself is
  human, so every row qualifies — while `Mus musculus` gave 50 and `Simian virus 40` gave
  25, the rows with a mouse or SV40 partner. For CDK1, `Xenopus laevis` gave 0. A
  field-prefixed value such as `taxidA:9606` returns 0. To restrict both sides, or the
  partner side only, filter on `taxIdA` / `taxIdB` client-side.

For paging and faceting together, `POST findInteractionWithFacet` accepts the same
filters plus `page` and `pageSize`, as a form body. Note the different envelope: it
returns `{"recordsFiltered": N, "data": {...page...}}` rather than the page directly, so
code written against `findInteractions` will not read its response. `POST list` is the
same query with a required `draw` integer and the rows under `data` as a plain array.

`GET interaction/countTotal` returned 1,814,918 on this release. That is a count of
binary evidence rows — the same number `findInteractions/*` reports as `totalElements` —
not of interactions or pairs: one spoke-expanded experiment contributes a row per
partner, so CDK1's 479 rows carry 342 distinct interaction accessions (`ac`).

## Get the files

Whole-database dumps are PSI-MITAB 2.7, 42 tab-separated columns, under:

```
https://ftp.ebi.ac.uk/pub/databases/intact/current/psimitab/
```

| file | size on the 2026-10-17 release | contents |
|---|---|---|
| `intact.txt` | 11 GB | every evidence row |
| `intact.zip` | 1.3 GB | the same, zipped |
| `intact-micluster.txt` | 6.3 GB | clustered to one row per unique pair, with the MI score |
| `intact_negative.txt` | 5.1 MB | negative evidence only |
| `intact-micluster_negative.txt` | 4.4 MB | negative evidence, clustered |
| `pmidMITAB27.zip` | 1.3 GB | split per publication |

Note that the bulk download **separates** negative evidence into its own file, the
opposite of the REST service's behaviour. If you work from `intact.txt` you get positives
only; if you work from `findInteractions` you must filter.

The negative file is small enough to take whole, and the large ones accept HTTP range
requests so you can read a header without pulling gigabytes:

```python
import collections, time, urllib.error, urllib.request

FTP = "https://ftp.ebi.ac.uk/pub/databases/intact/current/psimitab"

def fetch(url, headers=None, timeout=300, attempts=4):
    """Large FTP-over-HTTPS reads get reset now and then; retry before giving up."""
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if i == attempts - 1:
                raise
            print(f"  retrying after {type(e).__name__}")
            time.sleep(2 * (i + 1))

# The negative evidence ships as its own file, and it is small.
data = fetch(f"{FTP}/intact_negative.txt").decode("utf-8", "replace")
lines = data.rstrip("\n").split("\n")
header = lines[0].split("\t")
print(f"intact_negative.txt: {len(lines) - 1} evidence rows, {len(header)} MITAB columns")

# Column 7 is the detection method, 13 the source database (1-based MITAB27).
methods = collections.Counter(l.split("\t")[6] for l in lines[1:])
print("top detection methods:")
for m, n in methods.most_common(3):
    print(f"  {n:>5}  {m}")

# The large files support range requests, so you can inspect a header
# without pulling 11 GB.
first = fetch(f"{FTP}/intact.txt", headers={"Range": "bytes=0-2000"},
              timeout=120).decode("utf-8", "replace").split("\n")[0]
print("intact.txt column count:", len(first.split("\t")))
```

This read 985 negative evidence rows over 42 columns, 763 of them from two-hybrid array
screens. MITAB values are prefixed with their vocabulary — `uniprotkb:Q9NP97`,
`psi-mi:"MI:0018"(two hybrid)` — so split on the first colon rather than assuming a bare
accession. `current/` is a moving link; pin a dated release directory when a result has
to stay reproducible. This release is
`https://ftp.ebi.ac.uk/pub/databases/intact/2026-10-17/` — its `psimitab/` files are
stamped 2026-10-24, the same as `current/`'s, but there is no `2026-10-24/` directory
(404), and the newest `releaseDate` on REST rows is 2026-10-17. Name the directory, not
the file timestamp.

## PSICQUIC

IntAct also runs a [PSICQUIC](https://psicquic.github.io/) service, the standard query
interface shared by many interaction databases. It takes MIQL queries and returns MITAB,
which makes it the light way to pull rows — 5 MB for CDK1 against 87 MB from
`findInteractions`. **It does not return what the REST service returns**:

```python
import collections, urllib.parse, urllib.request

PSQ = ("https://www.ebi.ac.uk/Tools/webservices/psicquic/intact/webservices/current"
       "/search/query")

def psq(query, **params):
    url = f"{PSQ}/{urllib.parse.quote(query)}?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read().decode()

print("PSICQUIC count for P06493:", psq("P06493", format="count").strip())
mitab = [l.split("\t") for l in
         psq("P06493", format="tab27", firstResult=0, maxResults=1000).rstrip("\n").split("\n")]
print("MITAB rows:", len(mitab), "| columns:", {len(c) for c in mitab})
print("source database (col 13):", collections.Counter(c[12] for c in mitab).most_common())
print("negative flag (col 36):", collections.Counter(c[35] for c in mitab).most_common())

rest = facet_all("P06493")
print("REST rows:", len(rest), "| by sourceDatabase:",
      collections.Counter(r["sourceDatabase"] for r in rest).most_common())
```

For `P06493` PSICQUIC counted 374 rows against the REST service's 479. Every PSICQUIC row
had IntAct as its source database. The REST rows were 380 IntAct-sourced plus 99 curated
by other IMEx and partner databases — MINT 49, UniProt 27, DIP 19, HPIDb 2, matrixdb 1,
bhf-ucl 1 — and none of those 99 interactions appears in the PSICQUIC result. MINT,
UniProt and DIP run their own PSICQUIC services in the same registry. The remaining 6-row
gap, 380 against 374, sits in spoke-expanded interactions for which PSICQUIC returned
fewer binary rows than REST (interaction `EBI-2476819`: 3 rows on REST, 1 on PSICQUIC);
why is not established. For TP53 the gap is wider, 1086 against 2257. Treat the two as
different populations: use the REST service when you want everything IntAct's portal
holds, and PSICQUIC when you want IntAct's own curation or a query that federates across
databases.

## Try it

**Data.** TP53 interaction evidence from the IntAct REST service, interactor
`EBI-366083`, accession `P04637`. Open, CC BY 4.0, confirmed reachable 2026-11-19. The
complete pull is about 45 MB.

**Run.**

```python
import json, urllib.parse, urllib.request

WS = "https://www.ebi.ac.uk/intact/ws"

def ws(path, form=None, **params):
    url = f"{WS}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = urllib.parse.urlencode(form).encode() if form is not None else None
    with urllib.request.urlopen(url, data=data, timeout=300) as r:
        body = r.read().decode()
    return json.loads(body) if body.startswith(("{", "[")) else body

def facet_all(query, negative="POSITIVE_AND_NEGATIVE", page_size=1000):
    rows, page = [], 0
    while True:
        d = ws("interaction/findInteractionWithFacet",
               form={"query": query, "page": page, "pageSize": page_size,
                     "negativeFilter": negative})["data"]
        rows += d["content"]
        page += 1
        if page * page_size >= d["totalElements"]:
            break
    assert len(rows) == d["totalElements"], f"paged {len(rows)} of {d['totalElements']}"
    return rows

ACC, AC = "P04637", "EBI-366083"          # TP53, and its IntAct interactor accession

get_total = ws(f"interaction/findInteractions/{ACC}", page=0, pageSize=1)["totalElements"]
rows = facet_all(ACC)
mine = [r for r in rows if AC in (r["acA"], r["acB"])]

count = lambda **f: int(ws("interaction/countInteractionResult", query=ACC, interactorAc=AC, **f))
pos_only = count(negativeFilter="POSITIVE_ONLY")
neg_only = count(negativeFilter="NEGATIVE_ONLY")
both = count(negativeFilter="POSITIVE_AND_NEGATIVE")
default = count()

print(f"TP53 evidence rows from findInteractions : {get_total}")
print(f"complete pages                           : {len(rows)} rows, "
      f"{sum(r['negative'] for r in rows)} negative")
print(f"on {AC}                          : {sum(not r['negative'] for r in mine)} positive, "
      f"{sum(r['negative'] for r in mine)} negative")
print(f"counts  positive={pos_only}  negative={neg_only}  both={both}  default={default}")

assert get_total == len(rows), "GET findInteractions should count negatives with positives"
assert both - pos_only > 0, "TP53 should carry negative evidence"
assert pos_only + neg_only == both, "positive + negative must equal both"
assert default == pos_only, "the count endpoint should default to positives only"
assert sum(r["negative"] for r in mine) == neg_only, "scoped negatives should match the count"
assert sum(not r["negative"] for r in mine) == pos_only, "scoped positives should match the count"
assert all(0.0 <= r["intactMiscore"] <= 1.0 for r in rows), "MI score out of range"
assert all(f"intact-miscore:{r['intactMiscore']}" in r["confidenceValues"] for r in rows)
print("OK: negatives counted in GET, absent from the count default, MI scores in range")
```

**Expect.**

*Invariants* — a failure here means this page is wrong, not that upstream moved:

- The complete pages hold exactly `findInteractions`'s `totalElements`, so `GET
  findInteractions` counts negative records alongside positives.
- `POSITIVE_AND_NEGATIVE - POSITIVE_ONLY > 0` for TP53, and the count endpoint's
  unfiltered value equals its `POSITIVE_ONLY` value.
- `POSITIVE_ONLY + NEGATIVE_ONLY == POSITIVE_AND_NEGATIVE`.
- The rows on interactor `EBI-366083` split into exactly the `POSITIVE_ONLY` and
  `NEGATIVE_ONLY` counts.
- Every `intactMiscore` lies in 0 to 1 and matches the `intact-miscore:` entry in that
  row's `confidenceValues`.
- The final line prints `OK: …`.

*Observed on 2026-11-19, release 2026-10-17* — a change here is drift to look at, not a
failure:

```
TP53 evidence rows from findInteractions : 2257
complete pages                           : 2257 rows, 9 negative
on EBI-366083                          : 2204 positive, 5 negative
counts  positive=2204  negative=5  both=2209  default=2204
```

Counts rise as curation continues.

## What does not work

- `findInteractions` silently caps `pageSize` at 2000 (above). Page at 2000 or less and
  check the row total against `totalElements`.
- `POST interaction/interactors/list` returns 415 for every content type tried, and 405
  on GET. Use `GET interactor/findInteractor/{accession}` instead, as shown above.
- An accession that does not exist is **not** an error: `findInteractions` and
  `findInteractor` answer 200 with `totalElements: 0`. A typo looks exactly like a
  molecule with no curated interactions, so check `totalElements` against a known-good
  accession before concluding a protein has no partners.
- A page number past the end is also a 200 with an empty `content` and the true
  `totalElements`, and a negative `pageSize` is accepted silently.
- There is no eQTL-style bulk JSON endpoint and no SPARQL service; large analyses belong
  on the MITAB files.
