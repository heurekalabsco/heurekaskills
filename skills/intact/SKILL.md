---
name: intact
description: Query IntAct curated molecular interaction evidence — resolve accessions rather than gene labels, read detection method, interaction type and MI score per evidence row, and drop the negative records the REST API mixes into real interactions.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, protein-interaction, ppi, proteomics]
covers: [intact, imex, molecular interaction, protein-protein interaction, protein interaction, ppi, interactome, binary interaction, curated interaction, experimental evidence, detection method, two hybrid, pull down, coimmunoprecipitation, crosslink, tandem affinity purification, proximity labelling, mi score, psi-mitab, mitab, interaction type, phosphorylation, negative interaction, mutation effect, small molecule, mirna, human, mouse, yeast, uniprot accession]
papers: [PMID:34761267, PMID:24234451]
access: [open]
datasets: ["https://www.ebi.ac.uk/intact/ws/interaction/findInteractions/P04637", "https://ftp.ebi.ac.uk/pub/databases/intact/current/psimitab/intact_negative.txt"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-17
  against: IntAct release dated 2026-10-24 / Python 3.11 standard library only
  executed: 3
  unverified: 0
---

# IntAct molecular interactions

IntAct is EMBL-EBI's curated database of experimentally determined molecular
interactions. Every row it returns is one piece of evidence from one publication,
annotated with the method that produced it. That is the difference that matters when
choosing a source: association networks such as STRING blend curated experiments with
predictions and text mining into a single score, so a high-scoring edge there may rest
on no experiment at all. IntAct carries only curated experimental records, and tells you
which experiment each one came from.

**Nothing to obtain.** The REST service and the bulk files are open — no key, no account,
no registration, no click-through. IntAct data is published under CC BY 4.0, so cite it
(PMID 34761267) when you redistribute figures or derived tables.

Base URL for the search service:

```
https://www.ebi.ac.uk/intact/ws/interaction
```

All examples below use the Python standard library, so they need no installation.

## Resolve the molecule, not its name

The `query` path segment is a free-text search across names, aliases and accessions. It
matches substrings, so a gene label pulls in every molecule whose name contains it:

```python
import json, urllib.parse, urllib.request

WS = "https://www.ebi.ac.uk/intact/ws/interaction"

def get(path, **params):
    url = f"{WS}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as r:
        body = r.read().decode()
    return json.loads(body) if body.startswith(("{", "[")) else body

# A free-text label matches anything the token appears in.
page = get("findInteractions/CDK1", page=0, pageSize=50)
off = [r for r in page["content"]
       if not (r["uniqueIdA"].startswith("P06493") or r["uniqueIdB"].startswith("P06493"))]
print(f"query 'CDK1'    -> {page['totalElements']} rows; "
      f"{len(off)}/50 sampled involve no CDK1 at all")
print("  e.g.", [(r["moleculeA"], r["moleculeB"]) for r in off[:3]])

# An accession is specific.
page = get("findInteractions/P06493", page=0, pageSize=1)
print(f"query 'P06493'  -> {page['totalElements']} rows")
```

On the 2026-10-24 release this printed 3007 rows for `CDK1` against 479 for `P06493`,
and 43 of the 50 sampled `CDK1` rows involved no CDK1 at all: they were interactions
among the CDK family paralogues whose names contain the string, CDK10 through CDK19,
plus non-human orthologues curated under lower-case labels such as `cdk1-a` in *Xenopus*
and `cdk1_margl` in starfish. Always query the accession.

The `get()` helper defined above is reused by the other examples in this page; the
`## Try it` block at the end repeats it so that it runs on its own.

Each row carries two kinds of identifier per side, and only one of them is safe to join
on. `idA` and `idB` are display strings with the source database appended
(`"P06493 (uniprotkb)"`); `uniqueIdA` and `uniqueIdB` are the bare accessions. Join on
`uniqueIdA` / `uniqueIdB`, and remember that **the molecule you asked about can be on
either side** — the same pair appears in both orders across evidence rows.

Isoforms are separate interactors with their own IntAct accessions, so an exact match on
the canonical accession silently drops isoform-level evidence:

```python
ACC = "P06493"

# Resolve the canonical interactor accession: take it from a row where the
# query accession sits on a side *exactly*, not from the first row returned.
ac = None
for r in get(f"findInteractions/{ACC}", page=0, pageSize=100)["content"]:
    if r["uniqueIdA"] == ACC:
        ac = r["acA"]; break
    if r["uniqueIdB"] == ACC:
        ac = r["acB"]; break
print(f"{ACC} -> interactor {ac}")

# Isoform forms are distinct interactors and carry their own accessions.
forms = {}
for r in get(f"findInteractions/{ACC}", page=0, pageSize=200)["content"]:
    for side in ("A", "B"):
        uid = r[f"uniqueId{side}"]
        if uid.startswith(ACC):
            forms[uid] = r[f"ac{side}"]
for uid in sorted(forms):
    print(f"  form {uid:<10} interactor {forms[uid]}")
```

This resolved `P06493` to interactor `EBI-444308`, and found `P06493-1` and `P06493-2`
carrying `EBI-11614201` and `EBI-16421612`. Taking the accession off whichever row comes
back first is how you end up scoped to an isoform: that happens to return 1 evidence row
rather than the 472 the canonical interactor has.

## Negative records are mixed into the results

**This is the trap worth knowing before anything else.** IntAct curates *reported
non-interactions* — pairs that were tested and found not to interact — and flags them
with `negative: true`. They are real curation output and scientifically valuable, but
they are the opposite of what a list of interactions should contain.

`GET findInteractions` has no filter parameter and returns them mixed in with everything
else. The count endpoint does take a filter, and defaults to excluding them. So the two
endpoints disagree unless you handle it yourself:

```python
ACC, AC = "P04637", "EBI-366083"   # TP53

page = get(f"findInteractions/{ACC}", page=0, pageSize=500)
neg = [r for r in page["content"] if r["negative"]]
print(f"GET findInteractions   : {page['totalElements']} rows, "
      f"{len(neg)} of the first {len(page['content'])} are negative records")

# The count endpoint takes a filter and defaults to positives only.
for f in ("POSITIVE_ONLY", "NEGATIVE_ONLY", "POSITIVE_AND_NEGATIVE"):
    n = get("countInteractionResult", query=ACC, interactorAc=AC, negativeFilter=f)
    print(f"  countInteractionResult {f:<22} {n}")
print("  countInteractionResult (no filter)        ",
      get("countInteractionResult", query=ACC, interactorAc=AC))

for r in neg[:2]:
    print(f"  negative: {r['moleculeA']} / {r['moleculeB']} — "
          f"{r['detectionMethod']}, PMID {r['publicationPubmedIdentifier']}")
```

For TP53 this gave 2204 positive, 5 negative, 2209 together, and 2204 for the unfiltered
call — confirming the count default is `POSITIVE_ONLY`, while the 500-row page from
`findInteractions` contained 4 negative records. **Filter on `negative` yourself whenever
you use `findInteractions`.** A pipeline that skips this reports pairs as interacting on
the strength of a publication that concluded they do not.

`negativeFilter` accepts exactly `POSITIVE_ONLY`, `NEGATIVE_ONLY` or
`POSITIVE_AND_NEGATIVE`; anything else is a 400 with a Java enum-conversion message.

## Read an evidence row

A row is one experiment, not one interaction — several rows commonly describe the same
pair from different publications and methods:

```python
import collections

rows = get("findInteractions/P06493", page=0, pageSize=200)["content"]
rows = [r for r in rows if not r["negative"]]

# Every row is one piece of evidence from one publication, not one interaction.
print("evidence rows:", len(rows),
      "| distinct partner pairs:",
      len({frozenset((r["uniqueIdA"], r["uniqueIdB"])) for r in rows}))

print("interaction types:", collections.Counter(r["type"] for r in rows).most_common(4))
print("detection methods:", collections.Counter(r["detectionMethod"] for r in rows).most_common(3))

# The MI score is carried twice; it must agree.
bad = [r["ac"] for r in rows
       if f"intact-miscore:{r['intactMiscore']}" not in r["confidenceValues"]]
print("rows where intactMiscore disagrees with confidenceValues:", len(bad))
print("MI score range in this page:",
      min(r["intactMiscore"] for r in rows), "-", max(r["intactMiscore"] for r in rows))

# Interactors are not all proteins.
print("interactor types:", collections.Counter(
    [r["typeA"] for r in rows] + [r["typeB"] for r in rows]).most_common(4))

# How many 'association' rows are binary pairs inferred from an n-ary experiment?
assoc = [r for r in rows if r["type"] == "association"]
print(f"association rows: {len(assoc)}, of which spoke-expanded:",
      sum(1 for r in assoc if r["expansionMethod"] == "spoke expansion"))
```

200 evidence rows collapsed to 139 distinct pairs. The fields that carry the meaning:

| field | what it holds |
|---|---|
| `type` | the interaction type — `association`, `physical association`, `direct interaction`, `phosphorylation`, `proximity` |
| `detectionMethod` | the assay — `anti tag coip`, `pull down`, `crosslink`, `tap`, `protein kinase assay` |
| `intactMiscore` | MI score, 0 to 1, a weighted count of independent evidence |
| `negative` | true when the publication reported no interaction |
| `publicationPubmedIdentifier` | the PMID behind this row |
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
treating it as binding is the easiest way to overstate what the experiment showed. In the
CDK1 page above, all 141 `association` rows carried `expansionMethod: spoke expansion`,
meaning the pair was never observed as a pair: a bait pulled down several molecules and
the n-ary result was expanded into binary rows around that bait. Check `expansionMethod`
whenever a row matters, and prefer `direct interaction` or an unexpanded `physical
association` when you need evidence of contact.

Treat the MI score as confidence, not affinity — it rises with the number of independent
experiments reporting a pair, so a single excellent structure can score below a pair seen
weakly many times. The score appears twice per row, as `intactMiscore` and inside
`confidenceValues`; across 200 rows those agreed everywhere, and a disagreement would
mean the record is malformed rather than that the pair is unusual.

Not every interactor is a protein — this page included small molecules carrying ChEBI
identifiers, mRNAs and miRNAs. Check `typeA` / `typeB` before mapping a `uniqueId` to a
protein accession.

## Count and filter

`countInteractionResult` is the cheap way to size a query before paging it. It requires
both `query` and `interactorAc`, and returns a bare integer; omitting `interactorAc` is a
400. Scoping to the interactor accession is also stricter than the free-text query — for
CDK1 the query matched 479 rows while the interactor-scoped count was 472.

Verified filters, against TP53 and CDK1:

- `minMIScore` / `maxMIScore` — floats. `minMIScore=0.6` cut CDK1 from 472 to 128.
- `mutationFilter` — boolean. `true` cut CDK1 to 30 rows carrying mutation annotations.
- `negativeFilter` — the three enum values above.

`interactorSpeciesFilter` does **not** work as its name suggests and should not be used:
passing `9606` or `Homo sapiens` left the CDK1 count unchanged at 472 while
`taxidA:9606` returned 0, so it silently fails open or closed rather than filtering.
Filter on the `taxIdA` / `taxIdB` fields client-side instead.

For paging and faceting together, `POST findInteractionWithFacet` accepts the same
filters plus `page` and `pageSize`. Note the different envelope: it returns
`{"recordsFiltered": N, "data": {...page...}}` rather than the page directly, so code
written against `findInteractions` will not read its response. `POST list` is the same
query with a required `draw` integer and the rows under `data` as a plain array.

## Get the files

Whole-database dumps are PSI-MITAB 2.7, 42 tab-separated columns, under:

```
https://ftp.ebi.ac.uk/pub/databases/intact/current/psimitab/
```

| file | size on the 2026-10-24 release | contents |
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
accession. `current/` is a moving symlink; pin a dated release directory under
`https://ftp.ebi.ac.uk/pub/databases/intact/` when a result has to stay reproducible.

## Try it

**Data.** TP53 interaction evidence from the IntAct REST service, interactor
`EBI-366083`, accession `P04637`. Open, CC BY 4.0, confirmed reachable 2026-11-17.

**Run.**

```python
import json, urllib.parse, urllib.request

WS = "https://www.ebi.ac.uk/intact/ws/interaction"

def get(path, **params):
    url = f"{WS}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120) as r:
        body = r.read().decode()
    return json.loads(body) if body.startswith(("{", "[")) else body

ACC, AC = "P04637", "EBI-366083"          # TP53, and its IntAct interactor accession

page = get(f"findInteractions/{ACC}", page=0, pageSize=500)
rows = page["content"]
neg = [r for r in rows if r["negative"]]

pos_only = int(get("countInteractionResult", query=ACC, interactorAc=AC,
                   negativeFilter="POSITIVE_ONLY"))
neg_only = int(get("countInteractionResult", query=ACC, interactorAc=AC,
                   negativeFilter="NEGATIVE_ONLY"))
both = int(get("countInteractionResult", query=ACC, interactorAc=AC,
               negativeFilter="POSITIVE_AND_NEGATIVE"))
default = int(get("countInteractionResult", query=ACC, interactorAc=AC))

print(f"TP53 evidence rows from findInteractions : {page['totalElements']}")
print(f"negative rows in the first {len(rows)}          : {len(neg)}")
print(f"counts  positive={pos_only}  negative={neg_only}  both={both}  default={default}")

assert len(neg) > 0, "GET findInteractions should return negative records"
assert pos_only + neg_only == both, "positive + negative must equal both"
assert default == pos_only, "the count endpoint should default to positives only"
assert all(0.0 <= r["intactMiscore"] <= 1.0 for r in rows), "MI score out of range"
assert all(f"intact-miscore:{r['intactMiscore']}" in r["confidenceValues"] for r in rows)
print("OK: negatives present in GET, absent from the count default, MI scores in range")
```

**Expect.**

*Invariants* — a failure here means this page is wrong, not that upstream moved:

- `findInteractions` returns at least one record with `negative: true` in the first 500
  rows for TP53, and the count endpoint's unfiltered value equals its `POSITIVE_ONLY`
  value.
- `POSITIVE_ONLY + NEGATIVE_ONLY == POSITIVE_AND_NEGATIVE`.
- Every `intactMiscore` lies in 0 to 1 and matches the `intact-miscore:` entry in that
  row's `confidenceValues`.
- The final line prints `OK: …`.

*Observed on 2026-11-17, release dated 2026-10-24* — a change here is drift to look at,
not a failure:

```
TP53 evidence rows from findInteractions : 2257
negative rows in the first 500          : 4
counts  positive=2204  negative=5  both=2209  default=2204
```

Counts rise as curation continues, and the number of negative rows falling inside the
first 500 depends on result ordering. The whole database held 1,814,918 interactions on
this release, from `countInteractionResult`'s sibling endpoint `countTotal`.

## What does not work

- `interactorSpeciesFilter` silently fails rather than filtering (above). Filter on
  `taxIdA` / `taxIdB` yourself.
- `POST interactors/list` returns 415 for every content type tried, and 405 on GET, so
  there is no working interactor-lookup endpoint. Resolve an interactor accession from an
  evidence row instead, as shown above.
- An accession that does not exist is **not** an error: `findInteractions` answers 200
  with `totalElements: 0`. A typo looks exactly like a molecule with no curated
  interactions, so check `totalElements` against a known-good accession before concluding
  a protein has no partners.
- A page number past the end is also a 200 with an empty `content` and the true
  `totalElements`, and a negative `pageSize` is accepted silently.
- There is no eQTL-style bulk JSON endpoint and no SPARQL service; large analyses belong
  on the MITAB files.
