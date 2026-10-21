---
name: mavedb
description: Retrieve variant-effect score sets from MaveDB — deep mutational scans and other MAVEs — by URN or gene, with each set's own licence and usage policy, and save scores, counts and a licence manifest to disk. Open API, no account.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, deep-mutational-scanning, variant-effect, licensing, human-genetics]
covers: [mavedb, multiplexed assay of variant effect, mave, deep mutational scanning, dms, saturation genome editing, sge, vamp-seq, variant effect, missense, functional score, fitness, abundance, protein stability, binding, hgvs, clinvar, acmg, calibration, score set, read counts, brca1, tp53, pten, kras, human, yeast, sars-cov-2, cc0, data licence]
papers: [PMID:31679514, PMID:39838450, PMID:29269382]
access: [open]
datasets: ["https://api.mavedb.org/api/v1/score-sets/urn:mavedb:00000001-a-1", "https://api.mavedb.org/api/v1/score-sets/urn:mavedb:00000001-a-1/scores?start=0&limit=1000", "https://api.mavedb.org/api/v1/score-sets/urn:mavedb:00000107-a-1", "https://api.mavedb.org/api/v1/score-sets/urn:mavedb:00000044-a-1", "https://api.mavedb.org/api/v1/experiments/urn:mavedb:00000097-0/score-sets", "https://api.mavedb.org/api/v1/licenses/"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: MaveDB API 2026.3.1 (2938 published score sets reported by search) / Python 3.12.8 and 3.9.6, standard library only / curl 8.7.1
  executed: 9
  unverified: 0
  records: every published score set's full record read in batches of 100 (2933 distinct) for the licence and policy census; scores fetched in slices for sets of 200 to 648,022 variants
---
# MaveDB

MaveDB is the community repository for **multiplexed assays of variant effect** — deep
mutational scans, saturation genome editing, VAMP-seq and their relatives, where thousands of
variants of one target are measured in a single experiment. Each deposit is a **score set**: a
table with one row per variant, its HGVS description, a `score` column, and whatever other
columns the depositors chose to keep. Some also carry a **counts** table of the raw reads.

This skill finds score sets, reads **each one's reuse terms**, and writes the tables to disk
with a manifest that records those terms beside the data.

**Nothing to obtain first.** Every published record and table reads anonymously over HTTPS
from `https://api.mavedb.org/api/v1`. An account (ORCID sign-in) is needed only to deposit or
to see unpublished records. The server software is AGPL-3.0, and so is the `mavedb` package on
PyPI, which is the server's own codebase; nothing here imports it. The blocks below use the
Python standard library and plain HTTP, which leaves the reader's own code under whatever terms
they choose.

## The licence is per score set — read it every time

There is no MaveDB-wide data licence. Each score set carries its own, chosen by its
depositors, in the record's `license` object. A census of every published score set on
2026-10-20 (2933 distinct records) found the counts below. They are an observed snapshot, not
fixed values: the CC0 count and the total grow as sets are deposited.

| `license.shortName` | score sets | what it asks of a reuser |
|---|---|---|
| `CC0` | 2855 | nothing |
| `CC BY 4.0` | 60 | attribution |
| `CC BY-SA 4.0` | 11 | attribution, and derived data under the same terms |
| `CC BY-NC-SA 4.0` | 7 | **no commercial use**, attribution, share-alike |

`/licenses/` lists a fifth value, `Other - See Data Usage Guidelines`, with no link; no
published set carries it today, but code that meets it should stop and read rather than guess.
`CC BY-NC-SA 4.0` is marked `active: false` and is missing from `/licenses/active`, the list
offered to new deposits, but the seven sets that already carry it still do. Most of the
database is CC0, which is exactly why a bulk pull that assumes CC0 is wrong in a way nobody
notices. The seven non-commercial sets are the ones a commercial reader cannot use, and they
look like any other set until the licence is read.

**The licence field is not the whole story.** A free-text `dataUsagePolicy` sits beside it on
37 records, and every one of them is labelled `CC0`:

- 28 carry a **Fort Lauderdale** statement asking that the producers publish the first global
  analysis before anyone else does (e.g. `urn:mavedb:00000014-a-1`).
- `urn:mavedb:00000044-a-1`, `-a-2`, `-b-1`, `-b-2` (SARS-CoV-2 RBD) point at a **BSD-3-Clause**
  licence on the depositors' GitHub repository.
- `urn:mavedb:00001255-a-1` and `-a-2` say the data "must be pre-printed prior to usage".
- The rest are a citation request or a description of the study.

A CC0 waiver and a request in the policy text pull in different directions. This skill does not
settle which one binds. It surfaces both, and the reader decides. **The key is missing, not
`null`, when no policy was set** — so read it with `.get("dataUsagePolicy")`.

Three more places the terms vary:

- **Within one study.** Score sets in one experiment set can carry different licences.
  `urn:mavedb:00000658-0-1` is a CC BY 4.0 meta-analysis whose 17 input sets are CC0.
- **Calibration columns.** A score set's ACMG-style calibrations come with their own
  `researchUseOnly` flag; see *Annotation columns*.
- **Annotation joined from elsewhere.** ClinVar, gnomAD and VEP columns are added by MaveDB
  from those resources, which have their own terms.

## Score set URNs

`urn:mavedb:00000001-a-1` reads as experiment set `00000001`, experiment `a`, score set `1`. A
variant inside it is `urn:mavedb:00000001-a-1#17`, and that is the `accession` column of every
table. An experiment letter of **`0`** marks a meta-analysis — a score set computed from other
score sets, which `metaAnalyzesScoreSetUrns` lists. All 608 meta-analyses use `-0-`, and every
`-0-` set is a meta-analysis. Unpublished records use `tmp:` URNs and need the owner's
credentials.

Three ways a URN goes wrong, and all three answer **HTTP 404 with the same message**:

```bash
API=https://api.mavedb.org/api/v1
curl -s "$API/api/version"; echo
curl -s "$API/score-sets/urn:mavedb:00000001-a-1" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["urn"], "|", d["title"], "|", d["numVariants"], "variants |", d["license"]["shortName"], "| policy:", d.get("dataUsagePolicy"))'
curl -s "$API/score-sets/urn:mavedb:00000001-a-1/scores?start=0&limit=2"
# the three ways a URN goes wrong all answer 404 with the same body shape
for u in 00000001-a-1 urn:mavedb:00000097-0-1 urn:mavedb:99999999-a-1; do
  curl -s -w "  -> HTTP %{http_code}\n" "$API/score-sets/$u"
done
```

```
{"name":"mavedb-api","version":"2026.3.1"}
urn:mavedb:00000001-a-1 | UBE2I imputed & refined | 3180 variants | CC0 | policy: None
accession,hgvs_nt,hgvs_splice,hgvs_pro,score,sd,se,exp.score,exp.sd,df,pred.score
urn:mavedb:00000001-a-1#1,NA,NA,p.Pro73Gln,-0.0261761998757174,0.0996920531493698,0.0315253952570571,-0.0275390812623933,0.0604559198058803,10.0,-0.000883848618908769
urn:mavedb:00000001-a-1#2,NA,NA,p.Tyr137Val,-0.115652153987545,0.13654358816749,0.0682717940837452,-0.129010975281876,0.0743459606942885,4.0,0.011848007709363
{"detail":"score set with URN '00000001-a-1' not found"}  -> HTTP 404
{"detail":"score set with URN 'urn:mavedb:00000097-0-1' not found"}  -> HTTP 404
{"detail":"score set with URN 'urn:mavedb:99999999-a-1' not found"}  -> HTTP 404
```

- **No `urn:mavedb:` prefix.** Papers and spreadsheets often drop it. The API does not add it.
- **Superseded.** When depositors replace a score set, the old URN stops resolving at all.
  `urn:mavedb:00000097-0-1` (BRCA1 saturation genome editing) is cited in older material and
  now 404s; `-0-2` replaced it. 55 published sets replace an earlier one. The new record names
  its predecessor in `supersededScoreSet`, and nothing points forward from the old URN, so the
  only route is to list the experiment's score sets and follow that link.
- **Never existed**, or unpublished.

The helper below handles the first two and raises on the third. The blocks after it reuse
`call` and `score_set`, so run them in one session.

```python
import json, time, urllib.error, urllib.parse, urllib.request

API = "https://api.mavedb.org/api/v1"


def call(path, params=None, body=None, timeout=120, tries=4):
    """GET (or POST when body is given) against the MaveDB API.

    Retries 502/503/504 with backoff -- the gateway times out under load and on
    large CSVs. Every other error is raised as it came.
    """
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    for attempt in range(tries):
        req = urllib.request.Request(url, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                ctype = r.headers.get("Content-Type", "")
            return json.loads(raw) if "json" in ctype else raw.decode()
        except urllib.error.HTTPError as e:
            if e.code in (502, 503, 504) and attempt < tries - 1:
                time.sleep(10 * (attempt + 1))
                continue
            raise


def full_urn(urn):
    """MaveDB answers 404 to '00000001-a-1'; it wants 'urn:mavedb:00000001-a-1'."""
    return urn if urn.startswith(("urn:mavedb:", "tmp:")) else "urn:mavedb:" + urn


def score_set(urn):
    """Fetch a score set's full record, following supersession.

    A superseded score set is not served under its old URN -- it answers 404
    exactly like a URN that never existed. The replacement lives in the same
    experiment and names its predecessor in `supersededScoreSet`, so on 404 we
    list the experiment's score sets and follow that chain forward.
    """
    urn = full_urn(urn)
    try:
        return call(f"/score-sets/{urn}")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    experiment = urn.rsplit("-", 1)[0]
    try:
        siblings = call(f"/experiments/{experiment}/score-sets")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise LookupError(f"{urn}: no such score set, and no experiment {experiment}")
        raise
    current, hops = urn, []
    while True:
        nxt = next((s for s in siblings
                    if (s.get("supersededScoreSet") or {}).get("urn") == current), None)
        if nxt is None:
            break
        current = nxt["urn"]
        hops.append(current)
    if not hops:
        raise LookupError(f"{urn}: not found, and nothing in {experiment} supersedes it")
    print(f"{urn} is superseded -> {' -> '.join(hops)}")
    return call(f"/score-sets/{current}")
```

```python
rec = score_set("00000001-a-1")                  # bare form: prefixed for you
print(rec["urn"], rec["numVariants"])

rec = score_set("urn:mavedb:00000097-0-1")       # cited in older material; superseded
print(rec["urn"], "replaces", rec["supersededScoreSet"]["urn"])

for bad in ["urn:mavedb:00000001-a-99", "urn:mavedb:99999999-a-1"]:
    try:
        score_set(bad)
    except LookupError as e:
        print("LookupError:", e)
```

```
urn:mavedb:00000001-a-1 3180
urn:mavedb:00000097-0-1 is superseded -> urn:mavedb:00000097-0-2
urn:mavedb:00000097-0-2 replaces urn:mavedb:00000097-0-1
LookupError: urn:mavedb:00000001-a-99: not found, and nothing in urn:mavedb:00000001-a supersedes it
LookupError: urn:mavedb:99999999-a-1: no such score set, and no experiment urn:mavedb:99999999-a
```

When a superseded URN resolves, record **both** URNs. The replacement may differ from what the
citing paper analysed.

## Reading a score set's terms

The licence terms are read from `license.link`, the Creative Commons URL, rather than from
`shortName`. The URL path names the licence elements (`by-nc-sa`), so a relabelled short name
such as a later `CC BY-NC 4.0` still reads correctly.

```python
import re

CC_LINK = re.compile(r"https?://creativecommons\.org/(licenses|publicdomain)/([a-z-]+)/")


def terms(rec):
    """The reuse terms of one score set: its licence, any free-text policy, and flags.

    The flags name what a person must look at before the data is reused. They do
    not decide whether the licence or the policy text binds; both are reported.
    """
    lic = rec["license"]
    m = CC_LINK.match(lic.get("link") or "")
    known = m is not None                     # "Other - See Data Usage Guidelines" has no link
    elements = set(m.group(2).split("-")) if known else set()   # by-nc-sa -> by, nc, sa; zero
    policy = rec.get("dataUsagePolicy")       # key is absent when unset
    non_commercial = ("nc" in elements) if known else None      # None = unknown, read it
    flags = []
    if non_commercial:
        flags.append("NON-COMMERCIAL")
    if not known:
        flags.append("LICENCE NOT CREATIVE COMMONS")
    if policy:
        flags.append("DATA USAGE POLICY")
    return {
        "urn": rec["urn"],
        "licence": lic["shortName"],
        "licence_url": lic.get("link"),
        "licence_active": lic.get("active"),
        "data_usage_policy": policy,
        "non_commercial": non_commercial,
        "share_alike": ("sa" in elements) if known else None,
        "attribution_required": ("by" in elements) if known else None,
        "flags": flags,
        "needs_reading": bool(flags),
    }


for urn in ["urn:mavedb:00000001-a-1",      # CC0, nothing else
            "urn:mavedb:00000107-a-1",      # CC BY-NC-SA 4.0
            "urn:mavedb:00001256-a-1",      # CC BY-SA 4.0
            "urn:mavedb:00000044-a-1",      # CC0 in the licence field, BSD-3 text in the policy
            "urn:mavedb:00000014-a-1"]:     # CC0 plus a Fort Lauderdale publication embargo
    t = terms(score_set(urn))
    policy = " ".join((t["data_usage_policy"] or "").split())
    print(f'{t["urn"]:26} {t["licence"]:16} NC={t["non_commercial"]!s:5} '
          f'SA={t["share_alike"]!s:5} flags={",".join(t["flags"]) or "-"}')
    if policy:
        print(f'{"":26} policy: {policy[:60]}')
```

```
urn:mavedb:00000001-a-1    CC0              NC=False SA=False flags=-
urn:mavedb:00000107-a-1    CC BY-NC-SA 4.0  NC=True  SA=True  flags=NON-COMMERCIAL
urn:mavedb:00001256-a-1    CC BY-SA 4.0     NC=False SA=True  flags=-
urn:mavedb:00000044-a-1    CC0              NC=False SA=False flags=DATA USAGE POLICY
                           policy: See licence from GitHub: https://github.com/jbloomlab/SARS-C
urn:mavedb:00000014-a-1    CC0              NC=False SA=False flags=DATA USAGE POLICY
                           policy: We are making our data available prior to publication in lin
```

`flags` names each thing a person has to look at before the data is reused: a non-commercial
licence, a licence that is not Creative Commons, or a policy text. `needs_reading` is true when
any flag is set. A set can carry more than one. `None` in a field means "unknown", not "no".

## Finding score sets

Search is `POST /score-sets/search` with a JSON body. Fields that matter:

| field | matches |
|---|---|
| `text` | free text across titles, descriptions, methods and target names |
| `targets` | the target's **name, exactly** as deposited |
| `targetAccessions` | a transcript or genomic accession the target is defined on (`NM_007294.3`) |
| `targetOrganismNames`, `targetTypes` | e.g. `Homo sapiens`; `protein_coding`, `regulatory`, `other_noncoding` |
| `authors`, `journals`, `databases`, `publicationIdentifiers` | publication metadata |
| `keywords` | controlled keywords, as `{"key": …, "value": …}` objects |
| `offset`, `limit` | paging; `limit` above **100** is refused with 422 |

`POST /score-sets/search/filter-options` takes the same body and returns the exact values each
field accepts, with counts. Read it before guessing a target name.

Three traps, all answering HTTP 200:

1. **A misspelled field is dropped in silence.** `{"target": ["BRCA1"]}` (singular) returns
   all 2938 score sets.
2. **`targets` is an exact name match, and targets are not named consistently.** A gene's
   score sets may be named `BRCA1`, `BRCA1 RING domain`, or the transcript accession
   `NM_007294.3`. In that last case the gene symbol appears only in the record's
   `targetAccession.gene`. Searching `targets: ["BRCA1"]` finds 7 of BRCA1's 38 score sets.
3. **Offset paging is lossy past one page.** Results are sorted on a key with ties, and each
   page breaks the ties differently. Paging all 2938 records on 2026-10-20 returned five
   records twice and **never returned five others**; listing every experiment's score sets
   found the missing five and brought the total back to 2938. A query that
   fits in one page of 100 is exact. A bigger one needs de-duplication and a count check, and
   if the count is short, narrower filters.

```python
SEARCH_KEYS = {"text", "targets", "targetOrganismNames", "targetTypes", "targetAccessions",
               "authors", "databases", "journals", "publicationIdentifiers", "keywords",
               "published", "offset", "limit"}


def search(**filters):
    """POST /score-sets/search, every page, de-duplicated.

    Two things the endpoint will not tell you: a misspelled filter is ignored
    (you get the whole database back, HTTP 200), and offset paging over a
    result larger than one page repeats some records and skips others, because
    the sort order is not total. So reject unknown keys up front, and compare
    what came back with numScoreSets rather than trusting the loop.
    """
    unknown = set(filters) - SEARCH_KEYS
    if unknown:
        raise ValueError(f"not a MaveDB search filter: {sorted(unknown)}")
    seen, offset = {}, 0
    while True:
        page = call("/score-sets/search", body={**filters, "offset": offset, "limit": 100})
        for s in page["scoreSets"]:
            seen.setdefault(s["urn"], s)
        offset += 100
        if offset >= page["numScoreSets"] or not page["scoreSets"]:
            break
    total = page["numScoreSets"]
    if len(seen) != total:
        print(f"warning: server reports {total} score sets, paging returned {len(seen)} "
              f"distinct -- narrow the filters until the result fits in one page of 100")
    return list(seen.values())


def target_genes(t):
    """Every name a target goes by. Accession-defined targets are *named* by their
    transcript (NM_007294.3) and carry the symbol only in targetAccession.gene."""
    acc = t.get("targetAccession") or {}
    return {x.upper() for x in (t["name"], t.get("mappedHgncName"), acc.get("gene")) if x}


def for_gene(symbol):
    """Score sets whose target is this gene, however the depositor named it."""
    sym = symbol.upper()
    return [s for s in search(text=symbol)
            if any(n == sym or n.startswith(sym + " ")
                   for t in s["targetGenes"] for n in target_genes(t))]


exact = search(targets=["BRCA1"])              # matches the target *name* exactly
gene = for_gene("BRCA1")                       # free text, then filtered on the target
print(f"targets=['BRCA1']: {len(exact)}   for_gene('BRCA1'): {len(gene)}")
print(sum(1 for s in gene if s["targetGenes"][0]["name"].startswith(("NM_", "ENST"))),
      "of them name their target by transcript accession, not by gene")
for s in sorted(gene, key=lambda s: s["urn"])[:6]:
    t = s["targetGenes"][0]
    print(f'  {s["urn"]:26} {s["license"]["shortName"]:10} {s["numVariants"]:>6}  '
          f'target name: {t["name"]}')

kras = for_gene("KRAS")                        # free text matches >100 sets: pages
print("KRAS score sets:", len(kras))

try:
    search(target=["BRCA1"])                   # singular -- would return everything
except ValueError as e:
    print("ValueError:", e)
```

```
targets=['BRCA1']: 7   for_gene('BRCA1'): 38
26 of them name their target by transcript accession, not by gene
  urn:mavedb:00000003-a-1    CC0         20724  target name: BRCA1 RING domain
  urn:mavedb:00000003-a-2    CC0         12316  target name: BRCA1 RING domain
  urn:mavedb:00000003-b-1    CC0         20724  target name: BRCA1 RING domain
  urn:mavedb:00000003-b-2    CC0         12316  target name: BRCA1 RING domain
  urn:mavedb:00000081-a-1    CC0          1061  target name: BRCA1
  urn:mavedb:00000081-a-2    CC0          2820  target name: BRCA1
KRAS score sets: 43
ValueError: not a MaveDB search filter: ['target']
```

`for_gene` checked against the full catalogue on 2026-10-20 for BRCA1, TP53, PTEN, KRAS and
MSH2: it found every score set whose target resolves to that gene, by any of the three names.
It also drops free-text hits whose target is another gene: 62 text hits for BRCA1 include
BARD1, BAP1 and others that only *mention* BRCA1.

Search results are summaries. They carry `license` but **not** `dataUsagePolicy` or
`datasetColumns`, so fetch the full record before deciding anything about reuse.
`GET /score-sets/?urns=<urn>,<urn>,…` returns full records for a comma-separated list in one
call; batches of 100 worked.

Other entry points: `GET /experiments/{urn}/score-sets` lists an experiment's current score
sets, `GET /experiment-sets/{urn}` lists its experiments, and
`GET /score-sets/recently-published?limit=N` (at most 20) shows what just landed.

## The tables

`GET /score-sets/{urn}/scores` returns CSV: `accession`, then `hgvs_nt`, `hgvs_splice`,
`hgvs_pro`, then `score` and the depositors' other columns, listed in
`datasetColumns.scoreColumns`. `GET /score-sets/{urn}/counts` is the same shape for
`datasetColumns.countColumns`. When that list is empty, `/counts` still answers 200 with the
accession and HGVS columns and nothing else. Missing values are the string `NA`.
`drop_unused_hgvs_columns=true` removes the HGVS columns a set does not use. Its older
spelling `drop_na_columns` is deprecated, and it never dropped every NA column.

What `score` means — fitness, abundance, a log ratio, a ΔG, which direction is "functional" —
is set by the depositors and described in the record's `methodText`. Two score sets on the
same gene are not on the same scale unless a calibration or meta-analysis says so.

**Fetch large sets in slices.** The tables take `start` and `limit`. One unsliced request for
`urn:mavedb:00000053-a-1` (648,022 variants) answered **504 after 60 s** on 2026-10-20. Sliced
with `table()` below, the same set came down whole: 65 slices of 10,000, 648,022 distinct
rows, about 20 minutes on a busy afternoon. A single 10,000-row slice took about 5 s when the
server was quiet. Seven sets in the database exceed 100,000 variants.

```python
import csv, io


def table(rec, kind="scores", chunk=10_000):
    """All rows of a score set's scores (or counts) CSV, fetched in slices.

    One unpaged request for a large set runs past the gateway's 60-second limit
    and comes back 504; 10,000 rows per slice answers in seconds. Each slice
    repeats the header, so keep the first and check the rest match it.
    """
    urn, n = rec["urn"], rec["numVariants"]
    header, rows = None, []
    for start in range(0, n, chunk):
        text = call(f"/score-sets/{urn}/{kind}", {"start": start, "limit": chunk})
        r = csv.reader(io.StringIO(text))
        h = next(r)
        if header is None:
            header = h
        elif h != header:
            raise RuntimeError(f"{urn}: header changed between slices")
        rows.extend(r)
    ids = [row[0] for row in rows]
    if len(rows) != n or len(set(ids)) != n:
        raise RuntimeError(f"{urn}: expected {n} rows, got {len(rows)} ({len(set(ids))} distinct)")
    return header, rows


rec = score_set("urn:mavedb:00000001-a-1")
header, rows = table(rec, chunk=1000)              # small slices, to exercise the stitching
print(header)
print(len(rows), "rows; first:", rows[0][:5])
print("score columns declared:", rec["datasetColumns"]["scoreColumns"])
print("missing scores:", sum(1 for row in rows if row[header.index("score")] == "NA"))
```

```
['accession', 'hgvs_nt', 'hgvs_splice', 'hgvs_pro', 'score', 'sd', 'se', 'exp.score', 'exp.sd', 'df', 'pred.score']
3180 rows; first: ['urn:mavedb:00000001-a-1#1', 'NA', 'NA', 'p.Pro73Gln', '-0.0261761998757174']
score columns declared: ['score', 'sd', 'se', 'exp.score', 'exp.sd', 'df', 'pred.score']
missing scores: 0
```

### Annotation columns

`GET /score-sets/{urn}/variants/data` returns the same rows joined to columns MaveDB computes:
genomic HGVS after mapping to a reference (`mavedb`), VEP consequence, gnomAD frequency,
ClinGen allele IDs, a chosen ClinVar release, and score calibrations. Ask for groups with
repeated `namespaces=` parameters. **Naming any group replaces the default**, and with none
named the endpoint returned only the `scores` group. `GET /score-sets/{urn}/csv-namespaces`
lists what a set offers.

```python
urn = "urn:mavedb:00000097-0-2"                      # BRCA1 SGE, 3893 variants
groups = call(f"/score-sets/{urn}/csv-namespaces")
for g in groups:
    flag = "  RESEARCH USE ONLY" if g["researchUseOnly"] else ""
    print(f'{g["namespace"][:60]:62} {g["group"]:11} default={g["selectedByDefault"]!s:5}{flag}')

# Naming any namespace replaces the default set -- list every group you want.
text = call(f"/score-sets/{urn}/variants/data",
            {"namespaces": ["scores", "mavedb", "clinvar.2026_01"], "start": 0, "limit": 3})
print(text)
```

```
scores                                                         data        default=True 
…
clinvar.2026_01                                                annotation  default=True 
clinvar.2025_01                                                annotation  default=False
…
calibration.urn:mavedb:calibration-ed736607-b47d-4162-a045-5   calibration default=False  RESEARCH USE ONLY
calibration.urn:mavedb:calibration-20d045a4-8573-4358-9963-7   calibration default=False  RESEARCH USE ONLY
calibration.urn:mavedb:calibration-53755a6c-426b-42f4-b771-8   calibration default=True 
…
accession,hgvs_nt,hgvs_splice,hgvs_pro,scores.score,mavedb.post_mapped_hgvs_g,mavedb.post_mapped_hgvs_p,mavedb.post_mapped_hgvs_c,mavedb.post_mapped_hgvs_at_assay_level,mavedb.post_mapped_vrs_id,clinvar.2026_01.clinical_significance,clinvar.2026_01.clinical_review_status
urn:mavedb:00000097-0-2#1,NM_007294.3:c.5565A>T,NA,NA,-0.0153221623501722,NA,NA,NA,NA,NA,NA,NA
```

The `selectedByDefault` flag describes the website's download dialog; it is not what the API
returns when no namespace is named. A calibration flagged `researchUseOnly` carries that flag
into its own column (`…research_use_only`, `True`), so keep the column when you keep the
classification. Clinical-looking calibration output such as `BS3` or `BENIGN` is evidence
for a variant curator, not a classification of a patient's variant.

## Get the files

This writes, for each requested score set, `scores.csv`, `counts.csv` when the set declares
count columns, and the full `record.json`. Beside them go `manifest.json`, with the API version,
the date and each set's terms, and `licences.tsv`, one row per set, readable without code.
Every set prints its flags as it downloads.

**By default, non-commercial sets are skipped**, and so is any set whose licence is not
Creative Commons, since its terms are unknown. A skipped set downloads no files, but it still
appears in the manifest and in `licences.tsv` with `skipped` and `skip_reason`, and it is
reported, so nothing is left out silently. Sets that carry a policy text, such as the Fort
Lauderdale statements, are flagged, not skipped.

**Opting in is the reader's call, made after establishing the intended use.** If the reader
confirms their use is non-commercial (academic research, for example), set
`SKIP_NON_COMMERCIAL = False`. Non-commercial sets then download, and each is marked
`** NON-COMMERCIAL **` on screen as well as in both files. So do sets whose licence terms
are unknown, marked `** LICENCE NOT CREATIVE COMMONS **`; read those before using them.
Do not opt in on the reader's
behalf, and do not opt in when the use is commercial or has not been stated. Uses `call`,
`score_set`, `terms` and `table` from above.

```python
import csv, datetime, json, os

OUT = "Data/mavedb"
URNS = ["urn:mavedb:00000001-a-1",        # UBE2I, CC0
        "urn:mavedb:00000107-a-1",        # PSAT1, CC BY-NC-SA 4.0
        "urn:mavedb:00000044-a-1",        # SARS-CoV-2 RBD, CC0 + a BSD-3 policy text
        "urn:mavedb:00000003-a-1"]        # BRCA1 RING, CC0, has a counts table
SKIP_NON_COMMERCIAL = True                # False only once the reader's use is non-commercial

os.makedirs(OUT, exist_ok=True)
version = call("/api/version")["version"]
manifest = []
for asked in URNS:
    rec = score_set(asked)
    t = terms(rec)
    if SKIP_NON_COMMERCIAL and t["non_commercial"] is not False:
        reason = ("non-commercial licence" if t["non_commercial"]
                  else "licence terms unknown")
        print(f'{rec["urn"]:26} {t["licence"]:16} skipped -- {reason}')
        manifest.append({**t, "asked_for": asked, "files": [],
                         "skipped": True, "skip_reason": reason})
        continue
    d = os.path.join(OUT, rec["urn"].replace(":", "_"))
    os.makedirs(d, exist_ok=True)
    files = []
    kinds = ["scores"] + (["counts"] if rec["datasetColumns"].get("countColumns") else [])
    for kind in kinds:
        header, rows = table(rec, kind)
        path = os.path.join(d, f"{kind}.csv")
        with open(path, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(header)
            w.writerows(rows)
        files.append({"kind": kind, "path": path, "rows": len(rows),
                      "bytes": os.path.getsize(path)})
    with open(os.path.join(d, "record.json"), "w") as fh:
        json.dump(rec, fh, indent=2)
    manifest.append({**t, "asked_for": asked, "title": rec["title"],
                     "targets": [t_["name"] for t_ in rec["targetGenes"]],
                     "publications": [f'{p["dbName"]}:{p["identifier"]}'
                                      for p in rec.get("primaryPublicationIdentifiers", [])],
                     "files": files, "skipped": False, "skip_reason": None})
    print(f'{rec["urn"]:26} {t["licence"]:16} ' +
          ", ".join(f'{f["kind"]} {f["rows"]} rows' for f in files) +
          "".join(f"  ** {flag} **" for flag in t["flags"]))

with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump({"source": API, "api_version": version,
               "retrieved": datetime.date.today().isoformat(),
               "score_sets": manifest}, fh, indent=2)
with open(os.path.join(OUT, "licences.tsv"), "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["urn", "licence", "licence_url", "non_commercial", "share_alike",
                "attribution_required", "flags", "skipped", "skip_reason",
                "data_usage_policy"])
    for m in manifest:
        w.writerow([m["urn"], m["licence"], m["licence_url"] or "", m["non_commercial"],
                    m["share_alike"], m["attribution_required"], ";".join(m["flags"]),
                    m["skipped"], m["skip_reason"] or "",
                    " ".join((m["data_usage_policy"] or "").split())])
print(f"\nmanifest.json and licences.tsv written to {OUT} (API {version})")
```

Run 2026-10-21 against API 2026.3.1, with the default `SKIP_NON_COMMERCIAL = True`:

```
urn:mavedb:00000001-a-1    CC0              scores 3180 rows
urn:mavedb:00000107-a-1    CC BY-NC-SA 4.0  skipped -- non-commercial licence
urn:mavedb:00000044-a-1    CC0              scores 8040 rows  ** DATA USAGE POLICY **
urn:mavedb:00000003-a-1    CC0              scores 20724 rows, counts 20724 rows

manifest.json and licences.tsv written to Data/mavedb (API 2026.3.1)
```

No files are written for `00000107-a-1`. Its manifest entry has `"files": []`, and its
`licences.tsv` row reads `non_commercial` `True`, `flags` `NON-COMMERCIAL`, `skipped` `True`,
`skip_reason` `non-commercial licence`. With `SKIP_NON_COMMERCIAL = False`, the same run
downloads it and prints
`urn:mavedb:00000107-a-1    CC BY-NC-SA 4.0  scores 200 rows  ** NON-COMMERCIAL **`, and its
row reads `skipped` `False`.

Sizes on disk: 497 KB, 15 KB (`00000107-a-1`, opt-in only), 503 KB, and 6.0 MB + 8.3 MB for
the BRCA1 RING scores and counts. To pull a gene, pass `[s["urn"] for s in for_gene("BRCA1")]`
as `URNS`.

When reporting what was retrieved, sort the sets into these groups, and name the sets in each:

- **CC0 with no policy text.**
- **Attribution or share-alike terms** (`CC BY`, `CC BY-SA`) and no other flag.
- **Non-commercial, downloaded after opting in** (`non_commercial` true, flag
  `NON-COMMERCIAL`, `skipped` false). Report these as their own group, never folded into the
  attribution group, and say that the reader opted in on the basis of a non-commercial use.
- **A policy text that needs a person to read it** (flag `DATA USAGE POLICY`), quoted or
  summarised, beside the licence it accompanies. Say that the two may conflict, and leave the
  reader to decide which applies.
- **Licence not Creative Commons**, if any appear.
- **Skipped, and why** (`skipped`, `skip_reason`). Under the default this is where
  non-commercial and unknown-licence sets land. Name each one, so the reader can opt in if
  their use allows it.

A set with two flags goes in both groups. `licences.tsv` carries every column these groups
need, skipped sets included.

## What MaveDB will not give you

- **Raw reads.** MaveDB holds scores and, sometimes, counts. Some experiments name their
  sequencing runs in `rawReadIdentifiers` on `GET /experiments/{urn}` (`SRP109101` for
  `urn:mavedb:00000001-a`); fetch those through the `ena` skill.
- **A licence for the whole database**, or a bulk export with per-set terms attached. Build
  that from the records, as above.
- **Clinical classifications.** Calibrations map scores to ACMG evidence strengths. Applying
  them to a patient's variant is a curation decision.
- **Structure.** Targets with a UniProt cross-reference can be passed to the `alphafold` skill
  for a predicted structure to map scores onto.
- **Your own experiment.** Scoring one's own selection experiment is a job for the `enrich2`
  skill, and calling variants from a sequenced plate-format screen is a job for the `levseq`
  skill.

## Try it

A self-contained check, runnable cold. Public data, no account, standard library only.

**Data** — `urn:mavedb:00000001-a-1`, UBE2I imputed and refined scores from Weile et al. 2017
(PMID 29269382), 3180 variants, CC0. Then three records chosen because they break simplified
code: `urn:mavedb:00000107-a-1` (CC BY-NC-SA 4.0), `urn:mavedb:00000044-a-1` (CC0 with a
BSD-3 policy text), and the superseded `urn:mavedb:00000097-0-1`. Last confirmed reachable
2026-10-21.

```python
import csv, io, json, re, time, urllib.error, urllib.request

API = "https://api.mavedb.org/api/v1"


def get(path, body=None, tries=4):
    data = json.dumps(body).encode() if body is not None else None
    for i in range(tries):
        req = urllib.request.Request(API + path, data=data,
                                     headers={"Content-Type": "application/json"} if data else {})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw, ctype = r.read(), r.headers.get("Content-Type", "")
            return 200, (json.loads(raw) if "json" in ctype else raw.decode())
        except urllib.error.HTTPError as e:
            if e.code in (502, 503, 504) and i < tries - 1:
                time.sleep(10 * (i + 1))
                continue
            return e.code, json.loads(e.read() or b"{}")


print("API version    :", get("/api/version")[1]["version"])

# --- one score set, end to end: record, licence, every row ---------------------------
URN = "urn:mavedb:00000001-a-1"
code, rec = get(f"/score-sets/{URN}")
n = rec["numVariants"]
rows = []
for start in range(0, n, 1000):                       # sliced, as large sets require
    part = list(csv.reader(io.StringIO(get(f"/score-sets/{URN}/scores?start={start}&limit=1000")[1])))
    header, rows = part[0], rows + part[1:]
whole = list(csv.reader(io.StringIO(get(f"/score-sets/{URN}/scores")[1])))
print("record         :", rec["urn"], "|", rec["title"], "|", rec["targetGenes"][0]["name"])
print("licence        :", rec["license"]["shortName"], "| policy:", rec.get("dataUsagePolicy"))
print("rows           :", len(rows), "of numVariants", n, "| header:", header[:5])

assert code == 200 and rec["urn"] == URN
assert header[0] == "accession" and "score" in header
assert len(rows) == n == len({r[0] for r in rows})               # one row per variant
assert all(r[0].startswith(URN + "#") for r in rows)
assert [header] + rows == whole                                   # slicing loses nothing
assert set(rec["datasetColumns"]["scoreColumns"]) <= set(header)

# --- the licence is per score set, and the licence field is not the whole story ------
def elements(lic):                                    # read NC/SA/BY from the CC link
    m = re.match(r"https?://creativecommons\.org/(?:licenses|publicdomain)/([a-z-]+)/",
                 lic.get("link") or "")
    return set(m.group(1).split("-")) if m else None


nc = get("/score-sets/urn:mavedb:00000107-a-1")[1]
bsd = get("/score-sets/urn:mavedb:00000044-a-1")[1]
print("00000107-a-1   :", nc["license"]["shortName"], "| non-commercial:",
      "nc" in elements(nc["license"]))
print("00000044-a-1   :", bsd["license"]["shortName"], "| policy:",
      " ".join(bsd["dataUsagePolicy"].split())[:70])
assert all("shortName" in x["license"] for x in (rec, nc, bsd))
assert "dataUsagePolicy" not in rec                              # absent, not null, when unset
for lic in get("/licenses/")[1]:                                  # the link encodes NC exactly
    el = elements(lic)                                            # when the long name says so
    says_nc = "noncommercial" in lic["longName"].replace("-", "").replace(" ", "").lower()
    assert el is None or ("nc" in el) == says_nc, lic

# --- three URNs that 404, for three different reasons --------------------------------
assert get("/score-sets/00000001-a-1")[0] == 404                 # missing urn:mavedb: prefix
assert get("/score-sets/urn:mavedb:99999999-a-1")[0] == 404      # never existed
assert get("/score-sets/urn:mavedb:00000097-0-1")[0] == 404      # superseded
sib = get("/experiments/urn:mavedb:00000097-0/score-sets")[1]
new = next(s for s in sib if (s.get("supersededScoreSet") or {}).get("urn") == "urn:mavedb:00000097-0-1")
print("00000097-0-1   : 404; superseded by", new["urn"])

# --- search: a page is at most 100, and an unknown filter is silently dropped --------
code, body = get("/score-sets/search", {"limit": 101})
assert code == 422, code
everything = get("/score-sets/search", {"limit": 1})[1]["numScoreSets"]
misspelt = get("/score-sets/search", {"target": ["BRCA1"], "limit": 1})[1]["numScoreSets"]
exact = get("/score-sets/search", {"targets": ["BRCA1"], "limit": 100})[1]
loose = get("/score-sets/search", {"text": "BRCA1", "limit": 100})[1]
gene = [s for s in loose["scoreSets"]
        if any("BRCA1" in {t["name"].split()[0].upper(), (t.get("mappedHgncName") or "").upper(),
                           ((t.get("targetAccession") or {}).get("gene") or "").upper()}
               for t in s["targetGenes"])]
print("search         : all", everything, "| misspelt filter", misspelt,
      "| targets=BRCA1", exact["numScoreSets"], "| text BRCA1", loose["numScoreSets"],
      "| text+target filter", len(gene))
assert misspelt == everything                                     # the typo returned it all
if loose["numScoreSets"] <= 100 and exact["numScoreSets"] <= 100:  # both fit in one page
    assert {s["urn"] for s in exact["scoreSets"]} <= {s["urn"] for s in gene}
    print("subset check   : exact-name hits all inside the text+target result")
else:
    print("subset check   : skipped -- a result exceeds one page of 100, so it is not exact")
```

**Expect**

Invariants — a failure means the skill is wrong:

- Slicing loses nothing. The 1000-row slices, stitched, equal the single unsliced table,
  header included, with exactly `numVariants` distinct accessions, each `URN#n`.
- Every declared score column is in the CSV header.
- Every record carries `license.shortName`. `dataUsagePolicy` is **absent** when unset, so
  `rec["dataUsagePolicy"]` raises `KeyError`.
- A bare URN, an unknown URN and a superseded URN all answer 404. The superseded one is
  found through its experiment's `supersededScoreSet` link.
- `limit` above 100 answers 422. A misspelled search field returns the whole database.
- Every licence in `/licenses/` that has a Creative Commons link carries `nc` in that link
  exactly when its long name says non-commercial, so reading NC from the link is sound.
- While both BRCA1 searches fit in one page, every `targets: ["BRCA1"]` hit is inside the
  text-plus-target-filter result. When either grows past 100, the block says it skipped this
  check rather than failing.

Observed 2026-10-21 against API 2026.3.1. These move as depositors add or revise records, so
a mismatch is drift to investigate:

```
API version    : 2026.3.1
record         : urn:mavedb:00000001-a-1 | UBE2I imputed & refined | UBE2I
licence        : CC0 | policy: None
rows           : 3180 of numVariants 3180 | header: ['accession', 'hgvs_nt', 'hgvs_splice', 'hgvs_pro', 'score']
00000107-a-1   : CC BY-NC-SA 4.0 | non-commercial: True
00000044-a-1   : CC0 | policy: See licence from GitHub: https://github.com/jbloomlab/SARS-CoV-2-RBD_D
00000097-0-1   : 404; superseded by urn:mavedb:00000097-0-2
search         : all 2938 | misspelt filter 2938 | targets=BRCA1 7 | text BRCA1 62 | text+target filter 38
subset check   : exact-name hits all inside the text+target result
```

The licence of `00000107-a-1` and the policy on `00000044-a-1` are depositor-set, so they are
observed values too. If either changes, update the example rather than the assertion that the
terms are read per set. The search counts depend on the catalogue and on how depositors name
their targets: that free-text BRCA1 fits in one page, and that the exact-name search finds
fewer sets than the filtered one, are observations, not invariants.

## Sources

- MaveDB — https://mavedb.org · API reference (OpenAPI 3.1) — https://api.mavedb.org/docs
- Server source, AGPL-3.0 — https://github.com/VariantEffect/mavedb-api (the older
  `VariantEffect/MaveDB` repository is archived)
- Esposito et al. (2019) *Genome Biology* 20, 223 — https://doi.org/10.1186/s13059-019-1845-6
- Rubin et al. (2025) *Genome Biology* 26, 13 — https://doi.org/10.1186/s13059-025-03476-y
- Weile et al. (2017) *Molecular Systems Biology* 13, 957 — https://doi.org/10.15252/msb.20177908

Cite the publication attached to each score set (`primaryPublicationIdentifiers`) as well as
MaveDB, and follow each set's own licence and policy.
