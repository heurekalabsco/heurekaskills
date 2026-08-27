---
name: zenodo
description: Retrieve data deposited alongside a paper on Zenodo — resolve a DOI or record id, read the record's licence and access status before any bytes move, refuse non-commercial or unstated terms rather than warn, pin a concept DOI to the version the paper actually used, and download selectively against a size budget.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [zenodo, public-data, data-sharing, licensing]
covers: [zenodo, doi, concept doi, version doi, supplementary data, paper data, processed data, counts matrix, gut microbiome, metagenomics, rna-seq, pbmc, lung cancer, chest ct, prostate mri, cc-by, cc-by-nc, cc0, licence, license, invenio, inveniordm, data availability, restricted, embargoed, md5, checksum, file manifest, research data, human]
papers: [PMID:29209090, PMID:37046093, doi:10.5281/zenodo.10000430, doi:10.5281/zenodo.1146764, doi:10.5281/zenodo.10932811]
access: [open, controlled]
platform: inveniordm
datasets: [https://zenodo.org/api/records/10000430, https://zenodo.org/api/records/1146764, https://zenodo.org/api/records/10932811, https://zenodo.org/api/records/6406114, https://zenodo.org/api/records/10000430/files/README.md/content]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: Zenodo REST API / InvenioRDM serialization vnd.inveniordm.v1+json / Python 3.12.8 stdlib only / curl 8.7.1
  executed: 8
  unverified: 0
  records: 10 records through the gate, plus a 71-record sweep across datasets, software, articles, restricted, embargoed and unlicensed deposits
---
# Zenodo — the data that was deposited with the paper

When a methods section says "processed data are available at
`https://doi.org/10.5281/zenodo.…`", this is the endpoint that resolves it. Zenodo is
where the *analysis-ready* table usually lands — the counts matrix, the annotated sample
sheet, the derived feature file — because that artefact has no domain archive to go to. It
is a general repository, so its holdings are whatever people deposited, and the manifest
has to be read rather than assumed.

Everything below runs anonymously over HTTPS. **No account, no API token, no click-through**
— a token is for depositing, and this skill does not deposit. The only retrieval limits a
token moves are the search page size (25 anonymous, 100 authenticated) and the per-IP rate
limit, measured at 133 requests per minute on 2026-08-27.

**The thing that makes Zenodo different from GEO or ArrayExpress is that the terms change
per record, and the record tells you what they are.** Of 683,302 dataset records on
2026-08-27, 34,584 are restricted and 3,926 embargoed; of the 644,792 open ones, 17,712
carry a non-commercial licence, 2,317 carry a licence written as free text that no vocabulary
covers, and 6,141 state no licence at all. That is 26,170 open, downloadable records — one in
25 — that "it is on Zenodo, so it is open" gets wrong.

So the order is not optional. **Read the licence, decide, and only then transfer.** And make
the decision a refusal rather than a warning: an agent that prints "note — this is CC-BY-NC"
and downloads anyway has still downloaded it, and *the data was publicly available* and *the
licence permitted my use* are different claims.

## Two serializations, and only one of them carries the licence

One URL, two answers, depending on the `Accept` header. The default is Zenodo's
pre-2023 shape; the other is InvenioRDM's, which is what Zenodo actually stores.

```sh
# Anonymous. No token, no account, no click-through. The limit is per IP.
curl -s -D - -o /dev/null "https://zenodo.org/api/records/10000430" | grep -i '^x-ratelimit-limit'

# The default serialization of a record. This is what `metadata.license` carries.
curl -s "https://zenodo.org/api/records/10932811" | python3 -c '
import json, sys
print("default  metadata.license ->", repr(json.load(sys.stdin)["metadata"].get("license")))'

# The same record at the same URL, InvenioRDM serialization. The licence is here.
curl -s -H "Accept: application/vnd.inveniordm.v1+json" \
     "https://zenodo.org/api/records/10932811" | python3 -c '
import json, sys
r = json.load(sys.stdin)["metadata"]["rights"][0]
print("inveniordm metadata.rights ->", r["title"]["en"])
print("                            ", r["description"]["en"].split("\n")[0])'
```

Printed 2026-08-27:

```
x-ratelimit-limit: 133
default  metadata.license -> None
inveniordm metadata.rights -> Academic-Use Only Data Licence
                             This dataset is available through Zenodo for academic non-commercial use only.
```

Record `10932811` is the TRACERx lung cancer and metastasis deposit. It is open access,
767 MB, downloadable by anyone — and **academic-use-only**. The default serialization
does not say so. It does not say anything: `metadata.license` is absent, which is
indistinguishable from a record that genuinely carries no licence.

That is not an edge case. 21,075 records carry a free-text licence with no vocabulary id,
and every one of them reads as unlicensed through `metadata.license`.

| what you want | default serialization | `Accept: application/vnd.inveniordm.v1+json` |
|---|---|---|
| licence | `metadata.license` — `{"id": "cc-by-4.0"}`, **absent for a free-text licence** | `metadata.rights` — a **list** of `{id, title, description, props.url}` |
| access tier | `metadata.access_right` — a string | `access.status`, plus `access.embargo.until` |
| files | `files` — a **list**, and `[]` for a restricted record | `files.entries` — a **dict keyed by filename**, plus `count` and `total_bytes` |
| version DOI | `doi` | `pids.doi.identifier` |
| concept DOI | `conceptdoi` | `parent.pids.doi.identifier` |
| version position | `metadata.relations.version[0].index` — **0-based** | `versions.index` — **1-based**, plus `versions.is_latest` |

Use the InvenioRDM serialization for everything. It is strictly more complete, and the
licence question has no answer in the other one.

Two places where reading the wrong one is worse than reading neither. **The version index is
0-based in the default shape and 1-based in the InvenioRDM one** — the first version of
`10000430` is `index 0` in one and `index 1` in the other, and MicrobiomeHD's third is `2`
against `3`, so a manifest that records "version 2" is ambiguous unless it also records which
field it came from. And **the two disagree on licence ids**: CC0 is `cc-zero` in the default
shape and `cc0-1.0` in the InvenioRDM one, the same licence under two spellings. An allowlist
copied from one and applied to the other matches nothing and refuses everything, which looks
like caution and is a bug.

## Resolving a reference to exactly one record

A paper gives you a DOI, a URL, or a bare number. Every form below reaches the same API.

```python
import json, re, urllib.error, urllib.parse, urllib.request

API = "https://zenodo.org/api/records"
# Ask for this on EVERY request. The default serialization drops any licence
# Zenodo has no vocabulary id for, and puts nothing in its place.
RDM = {"Accept": "application/vnd.inveniordm.v1+json"}


def fetch(ref, timeout=60):
    """One record from a record id, a Zenodo DOI, a doi.org URL or a record URL.

    Falls back to a search for a DOI minted somewhere else — 86,882 open dataset
    records carry one, and those have no `zenodo.N` suffix to parse out.
    """
    s = str(ref).strip().rstrip("/")
    m = re.search(r"zenodo\.(\d+)$|/records?/(\d+)$|^(\d+)$", s)
    if m:
        rid = next(g for g in m.groups() if g)
        try:
            req = urllib.request.Request(f"{API}/{rid}", headers=RDM)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read()), r.url
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise LookupError(f"{ref}: no such record") from None
            raise
    q = urllib.parse.urlencode({"q": f'doi:"{s}"', "size": 1})
    req = urllib.request.Request(f"{API}?{q}", headers=RDM)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        hits = json.loads(r.read())["hits"]["hits"]
    if not hits:
        raise LookupError(f"{ref}: no Zenodo record carries this DOI")
    return hits[0], f"{API}/{hits[0]['id']}"


def doi_of(rec):
    """Not every record has one — records 9 and 26, among the oldest, carry none."""
    return (rec.get("pids") or {}).get("doi", {}).get("identifier")


for ref in ("10000430",
            "10.5281/zenodo.1146764",
            "https://zenodo.org/records/10932811",
            "10.5281/zenodo.797943",          # a CONCEPT DOI — see below
            "10.123/GTNdenovoRNAseq",         # minted outside Zenodo
            "9"):                             # no DOI at all
    rec, url = fetch(ref)
    print(f"{ref:<38} -> {str(rec['id']):<9} {str(doi_of(rec)):<26} "
          f"{rec['metadata']['title'][:32]}")
```

Printed 2026-08-27:

```
10000430                               -> 10000430  10.5281/zenodo.10000430    RNAseq of PBMC and sorted subpop
10.5281/zenodo.1146764                 -> 1146764   10.5281/zenodo.1146764     MicrobiomeHD: the human gut micr
https://zenodo.org/records/10932811    -> 10932811  10.5281/zenodo.10932811    Data and code for "Genomic–trans
10.5281/zenodo.797943                  -> 1146764   10.5281/zenodo.1146764     MicrobiomeHD: the human gut micr
10.123/GTNdenovoRNAseq                 -> 583140    10.123/GTNdenovoRNAseq     Training data for de novo transc
9                                      -> 9         None                       Knowledge grows when shared: The
```

Read line four. **The DOI that came back is not the DOI that was asked for**, and nothing
raised. That is the concept DOI, and the next section is about it.

Four failure shapes worth knowing. A record id that does not exist is a clean `404` with
`{"status": 404, "message": "The persistent identifier does not exist."}`. A non-Zenodo DOI —
86,882 open dataset records carry one, minted by a journal, OSF or an institution — has no
`zenodo.N` to parse and needs the search fallback. `pids.doi` is genuinely absent on a
handful of the oldest records, so index it and a sweep dies on record 9. And Zenodo returns a
transient `504` often enough to see one in an afternoon, so anything looping over accessions
wants a retry on `5xx` that does not retry a `404`.

## Concept DOI versus version DOI

Every Zenodo deposit has two DOIs. The **version DOI** points at one immutable snapshot.
The **concept DOI** points at whichever version is newest *today*. Papers cite both, often
without saying which, and a concept DOI cited in 2017 does not resolve to the 2017 files.

```python
import json, urllib.request

API = "https://zenodo.org/api/records"
RDM = {"Accept": "application/vnd.inveniordm.v1+json"}


def get(url, timeout=60):
    """(payload, final url). urllib follows the redirect without saying so, and
    the final URL is the only place a concept lookup admits that it moved."""
    with urllib.request.urlopen(urllib.request.Request(url, headers=RDM),
                                timeout=timeout) as r:
        return json.loads(r.read()), r.url


asked = "797943"                      # the concept id, as a paper would cite it
rec, final = get(f"{API}/{asked}")
served = str(rec["id"])
print(f"asked for  {asked}")
print(f"served     {served}   redirected={served != asked}")
print(f"final url  {final}")
print(f"version DOI  {rec['pids']['doi']['identifier']}")
print(f"concept DOI  {(rec['parent'].get('pids') or {}).get('doi', {}).get('identifier')}")
print(f"version      index {rec['versions']['index']}  is_latest={rec['versions']['is_latest']}")
print()

vers, _ = get(f"{API}/{served}/versions?size=25&sort=version")
print(f"{vers['hits']['total']} versions under this concept")
for v in vers["hits"]["hits"]:
    print(f"  v{v['versions']['index']}  {str(v['id']):<8} "
          f"{v['pids']['doi']['identifier']:<24} {v['metadata']['publication_date']}  "
          f"{v['files']['count']:>2} files  {v['files']['total_bytes']:>12,} B")
```

Printed 2026-08-27:

```
asked for  797943
served     1146764   redirected=True
final url  https://zenodo.org/api/records/1146764
version DOI  10.5281/zenodo.1146764
concept DOI  10.5281/zenodo.797943
version      index 3  is_latest=True

3 versions under this concept
  v3  1146764  10.5281/zenodo.1146764   2017-08-08  35 files   165,142,922 B
  v2  840333   10.5281/zenodo.840333    2017-08-08  33 files   143,734,475 B
  v1  569601   10.5281/zenodo.569601    2017-05-05  29 files   143,145,893 B
```

MicrobiomeHD's concept DOI hands you 35 files. Its first version had 29. Anyone who cited
the concept DOI and re-fetched it later got a different dataset than they analysed, and the
HTTP 302 is the only trace.

- **Compare the requested id against `rec["id"]`.** They differ exactly when a concept id
  was resolved. Record the version DOI in your manifest, never the concept DOI alone.
- `/versions` only answers on a **version** id. `…/records/797943/versions` — the concept
  id — is a `404`, even though `…/records/797943` is a 302 to the latest version.
- `parent.pids` is `{}` for records with an externally minted DOI, so there is no concept
  DOI at all for those. `.get()` it.
- `versions.is_latest` is the direct answer to "am I looking at the current version", and
  `versions.index` counts from 1.

## The gate — refuse before anything transfers

This is the skill. Everything else is plumbing around it.

```python
import json, re, urllib.error, urllib.parse, urllib.request

API = "https://zenodo.org/api/records"
RDM = {"Accept": "application/vnd.inveniordm.v1+json"}

# SPDX ids you are willing to act under. Everything else is refused — including a
# licence Zenodo has no id for, and a record that states none. Note `cc0-1.0`: the
# default serialization spells that same licence `cc-zero`, so an allowlist copied
# from there matches nothing here.
ALLOW = {"cc-by-4.0", "cc-by-3.0", "cc-by-sa-4.0", "cc0-1.0",
         "mit", "apache-2.0", "bsd-3-clause", "gpl-3.0-or-later"}


class Refused(Exception):
    """Raise it. A printed warning does not stop an agent from downloading."""


def fetch(ref, timeout=60):
    m = re.search(r"zenodo\.(\d+)$|/records?/(\d+)$|^(\d+)$", str(ref).strip().rstrip("/"))
    if not m:
        q = urllib.parse.urlencode({"q": f'doi:"{ref}"', "size": 1})
        with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=RDM),
                                    timeout=timeout) as r:
            hits = json.loads(r.read())["hits"]["hits"]
        if not hits:
            raise LookupError(f"{ref}: no Zenodo record carries this DOI")
        return hits[0]
    rid = next(g for g in m.groups() if g)
    try:
        with urllib.request.urlopen(urllib.request.Request(f"{API}/{rid}", headers=RDM),
                                    timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise LookupError(f"{ref}: no such record") from None
        raise


def gate(rec, allow=ALLOW):
    """The licence ids this record grants under, or Refused. Call it before any
    byte moves — there is no second chance to un-download something."""
    status = rec["access"]["status"]
    if status != "open":
        emb = rec["access"].get("embargo") or {}
        when = f", lifting {emb['until']}" if emb.get("active") else ""
        raise Refused(f"access is {status}{when} — the files are not yours to fetch")
    rights = rec["metadata"].get("rights") or []
    if not rights:
        raise Refused("no licence stated — silence grants nothing")
    for r in rights:                       # a record may carry more than one
        label = (r.get("title") or {}).get("en", "").strip()
        if not r.get("id"):
            raise Refused(f"free-text licence, no machine-readable id — "
                          f"a human must read it: {label!r}")
        if r["id"] not in allow:
            raise Refused(f"licence {r['id']} is not on the allowlist ({label})")
    return [r["id"] for r in rights]


CASES = [("10000430", "RNAseq of PBMC subpopulations"),
         ("1146764", "MicrobiomeHD"),
         ("10932811", "TRACERx lung cancer and metastasis"),
         ("6624726", "PI-CAI Challenge"),
         ("6406114", "RAD-ChestCT"),
         ("17977149", "Tumour-infiltrating lymphocytes"),
         ("6481141", "Prostate158 training data"),
         ("20051562", "EXIOBASE 3"),
         ("18149369", "DAO Analyzer dataset"),
         ("583140", "de novo transcriptome training data")]

for rid, name in CASES:
    rec = fetch(rid)
    try:
        ids = gate(rec)
    except Refused as why:
        print(f"REFUSE {rid:<9} {'':>10}     {name}")
        print(f"         {why}")
        continue
    mb = rec["files"].get("total_bytes", 0) / 1e6
    print(f"ALLOW  {rid:<9} {mb:>9,.1f} MB  {name}  [{','.join(ids)}]")
```

Printed 2026-08-27:

```
ALLOW  10000430      214.9 MB  RNAseq of PBMC subpopulations  [cc-by-4.0]
REFUSE 1146764                  MicrobiomeHD
         licence cc-by-nc-4.0 is not on the allowlist (Creative Commons Attribution Non Commercial 4.0 International)
REFUSE 10932811                 TRACERx lung cancer and metastasis
         free-text licence, no machine-readable id — a human must read it: 'Academic-Use Only Data Licence'
REFUSE 6624726                  PI-CAI Challenge
         licence cc-by-nc-4.0 is not on the allowlist (Creative Commons Attribution Non Commercial 4.0 International)
REFUSE 6406114                  RAD-ChestCT
         access is restricted — the files are not yours to fetch
REFUSE 17977149                 Tumour-infiltrating lymphocytes
         access is embargoed, lifting 2026-12-11 — the files are not yours to fetch
REFUSE 6481141                  Prostate158 training data
         no licence stated — silence grants nothing
REFUSE 20051562                 EXIOBASE 3
         free-text licence, no machine-readable id — a human must read it: 'EXIOBASE licence'
ALLOW  18149369       25.0 MB  DAO Analyzer dataset  [cc0-1.0]
ALLOW  583140      1,731.6 MB  de novo transcriptome training data  [cc-by-4.0]
```

Seven of those ten are refusals, across five distinct failures:

- **`cc-by-nc-4.0`** — MicrobiomeHD and PI-CAI are widely reused biomedical datasets under a
  licence that forbids commercial use. Nothing about fetching them fails. The terms are the
  only thing standing in the way, and they are two API fields deep.
- **A free-text licence** — TRACERx and EXIOBASE state real, restrictive terms that no
  vocabulary id covers. `id` is `None` and `title`/`description` carry prose. This is the
  one case an allowlist cannot decide, and the correct behaviour is to stop and surface the
  text rather than guess. Do not treat "no id" as "no restriction".
- **`restricted`** — the record is public, the files are not. `access.files` is
  `"restricted"` while `access.record` is `"public"`.
- **`embargoed`** — same shape, plus `access.embargo.until`, which is a date to come back on
  rather than a door to knock at.
- **No licence at all** — 6,141 open dataset records. Nothing has been granted, which makes
  silence *stricter* than CC-BY-NC rather than looser. Do not read a missing licence as
  permission, and do not let `rights` being absent take the same code path as `rights` being
  present and restrictive.

Three implementation points that decide whether the gate holds:

- **Raise, do not return a flag.** `if not ok: print(...)` followed by the download is the
  failure mode this section exists to prevent, and it reads as compliant.
- **`rights` is a list.** Require *every* entry to be on the allowlist, not the first.
- **Call it on the record you are about to download from**, after any concept-id redirect
  has resolved. A licence can change between versions of the same concept.

The allowlist above is an example, not a recommendation. `gpl-3.0-or-later` on a *dataset*
means something different from the same string on software, and `cc-by-sa-4.0` obliges you
to share derivatives alike. Set it from what the work actually permits.

## The manifest, and the size budget

A record's files are declared with sizes and checksums before you fetch anything, so the
transfer can be decided rather than discovered.

```python
import json, urllib.request

API = "https://zenodo.org/api/records"
RDM = {"Accept": "application/vnd.inveniordm.v1+json"}


def fetch(rid, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(f"{API}/{rid}", headers=RDM),
                                timeout=timeout) as r:
        return json.loads(r.read())


print("`files` has three shapes, and two of them have no entries at all")
for rid, what in (("10000430", "open, 6 files"),
                  ("5337087", "open, nothing deposited"),
                  ("6406114", "restricted")):
    f = fetch(rid)["files"]
    print(f"  {rid:<9} {what:<26} count={f.get('count')!s:<5} "
          f"total_bytes={f.get('total_bytes')!s:<10} entries={len(f.get('entries', {}))}")
print()

rec = fetch("10000430")
# `entries` is a dict keyed by filename, not a list, and its order means nothing.
files = sorted(rec["files"]["entries"].values(), key=lambda e: -e["size"])
total = rec["files"]["total_bytes"]
print(f"{rec['metadata']['title'][:60]}")
print(f"{rec['files']['count']} files, {total:,} B ({total / 1e6:.1f} MB)")
for e in files:
    print(f"  {e['size']:>12,} B  {e['ext']:<4} {e['checksum']:<38} {e['key']}")

BUDGET = 5_000_000
take = [e for e in files if e["size"] <= BUDGET]
drop = [e for e in files if e["size"] > BUDGET]
print(f"\nunder {BUDGET:,} B per file — take {len(take)}, "
      f"{sum(e['size'] for e in take):,} B")
print(f"leave {len(drop)}, {sum(e['size'] for e in drop):,} B "
      f"({sum(e['size'] for e in drop) / total:.0%} of the record)")
```

Printed 2026-08-27:

```
`files` has three shapes, and two of them have no entries at all
  10000430  open, 6 files              count=6     total_bytes=214930159  entries=6
  5337087   open, nothing deposited    count=0     total_bytes=0          entries=0
  6406114   restricted                 count=None  total_bytes=None       entries=0

RNAseq of PBMC and sorted subpopulations (CD4, CD8, CD14, CD
6 files, 214,930,159 B (214.9 MB)
   106,319,390 B  csv  md5:0ba1478830d1578254db0ad57bc7d0c3   BatchCorrectedReadCounts_Zenodo.csv
   106,282,629 B  csv  md5:f6f2b0188cb7ff8f35b0669e4d0f94b6   RawReadCounts_Zenodo.csv
     2,286,119 B  csv  md5:b557ab1a8c4754ade7c1e1c603c671f4   GeneMetaInfo_Zenodo.csv
        24,121 B  csv  md5:b70eeb1545b9e5192766b0975ef40ebf   Sample_annotated_Zenodo.csv
        13,001 B  csv  md5:3107cf3bd9a2f1c44117af2db7e5ea95   FlowSorterFraction_Zenodo.csv
         4,899 B  md   md5:034c030954867746a022429abb58a008   README.md

under 5,000,000 B per file — take 4, 2,328,140 B
leave 2, 212,602,019 B (99% of the record)
```

**A restricted record's `files` is not an error and not an empty list — it is a dict with
`enabled` and nothing else**, so `count` and `total_bytes` are `None` and `entries` is
missing. In the default serialization the same record's `files` is `[]`, which is byte-identical
to an open record that holds nothing. Distinguish them on `access.status`, never on the file
count, or an embargoed deposit gets reported as a study with no data.

Other things the manifest settles before a transfer starts:

- `checksum` is `"md5:<hex>"` — algorithm-prefixed, so split on the colon rather than
  assuming MD5 forever.
- `links.content` is the byte stream for one file; `links.self` is that file's metadata.
  Requesting `self` and writing it to disk gives you a JSON document named `counts.csv`.
- The `files-archive` link is a **streamed** zip of the whole record with no
  `Content-Length`, so its size is unknowable mid-download. `files.total_bytes` is the
  number to check first — that record is 214.9 MB, of which 99% is two files.
- `Range` requests work on `links.content` (HTTP 206), which is how you inspect a header
  row without pulling gigabytes.
- **A file `key` can contain `/`.** 22 of 100 records sampled on 2026-08-27 had one —
  GitHub release archives deposited as `org/repo-vX.Y.zip`. The `links.content` URL keeps
  the slash unencoded and works as given; what breaks is the local path. Recreate the
  directories rather than flattening, and drop any `..` component before joining.

## Finding records

Zenodo's search is InvenioRDM's, and the query fields are its internal names — not the
ones in the response you just read.

```python
import json, urllib.error, urllib.parse, urllib.request

API = "https://zenodo.org/api/records"
RDM = {"Accept": "application/vnd.inveniordm.v1+json"}


def search(q, size=10, **params):
    """`size` caps at 25 anonymously (100 with a token), and page*size at 10,000.
    Exceeding either is HTTP 400, not a short page."""
    url = f"{API}?{urllib.parse.urlencode({'q': q, 'size': size, **params})}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=RDM),
                                    timeout=90) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = json.loads(e.read())
        raise RuntimeError(f"HTTP {e.code} — "
                           f"{body.get('errors') or body.get('message')}") from None


print("a space is OR, and relevance ranking hides it")
for q in ("gut microbiome", "gut OR microbiome", "gut AND microbiome", '"gut microbiome"'):
    print(f"  {search(q, size=1)['hits']['total']:>9,}  {q}")

print("\nfield names are InvenioRDM's, and a wrong one is a silent zero")
for q in ('metadata.resource_type.id:dataset AND "gut microbiome"',
          'resource_type.id:dataset AND "gut microbiome"',
          'doi:"10.5281/zenodo.1146764"',
          'metadata.doi:"10.5281/zenodo.1146764"',
          'conceptdoi:"10.5281/zenodo.797943"'):
    print(f"  {search(q, size=1)['hits']['total']:>9,}  {q}")

print("\nput the licence in the query, not in a filter after the fact")
q = ('"gut microbiome" AND metadata.resource_type.id:dataset '
     'AND access.status:open AND metadata.rights.id:(cc-by-4.0 OR cc0-1.0)')
d = search(q, size=5, sort="mostviewed")
print(f"  {d['hits']['total']:,} of those 448 are open AND carry a licence on the allowlist")
for h in d["hits"]["hits"]:
    print(f"    {h['id']:<9} {h['metadata']['rights'][0]['id']:<10} "
          f"{h['files']['total_bytes']:>13,} B  {h['metadata']['title'][:42]}")

print("\nthe caps, and what exceeding them looks like")
for kw in ({"size": 25}, {"size": 26}, {"size": 25, "page": 400}, {"size": 25, "page": 401}):
    try:
        n = len(search("metadata.resource_type.id:dataset", **kw)["hits"]["hits"])
        print(f"  {str(kw):<28} {n} returned")
    except RuntimeError as e:
        print(f"  {str(kw):<28} {e}")
```

Printed 2026-08-27:

```
a space is OR, and relevance ranking hides it
     19,336  gut microbiome
     19,343  gut OR microbiome
      2,561  gut AND microbiome
      1,745  "gut microbiome"

field names are InvenioRDM's, and a wrong one is a silent zero
        448  metadata.resource_type.id:dataset AND "gut microbiome"
          0  resource_type.id:dataset AND "gut microbiome"
          1  doi:"10.5281/zenodo.1146764"
          0  metadata.doi:"10.5281/zenodo.1146764"
          1  conceptdoi:"10.5281/zenodo.797943"

put the licence in the query, not in a filter after the fact
  393 of those 448 are open AND carry a licence on the allowlist
    22035984  cc-by-4.0    775,126,360 B  Human Microbiome Compendium dataset
    7246185   cc-by-4.0     52,679,509 B  Metagenomics of Parkinson's disease implic
    6242715   cc-by-4.0    525,267,961 B  Data analysis pipeline for investigating d
    13989345  cc-by-4.0  49,872,580,902 B  The Metagenome-Assembled Genome Inventory 
    7412085   cc-by-4.0  6,923,237,585 B  The rumen virome database (RVD)

the caps, and what exceeding them looks like
  {'size': 25}                 25 returned
  {'size': 26}                 HTTP 400 — [{'field': 'size', 'messages': ['Page size cannot be greater than 25. Please use authenticated requests to increase the limit to 100.']}]
  {'size': 25, 'page': 400}    25 returned
  {'size': 25, 'page': 401}    HTTP 400 — Invalid querystring parameters.
```

Five things that decide whether a search is usable:

- **A space is OR.** `gut microbiome` returns 19,336 and `gut OR microbiome` returns 19,343;
  `gut AND microbiome` is 2,561 and the quoted phrase is 1,745. Ranking floats the
  both-terms records to the top, so page one looks like AND and the count is an order of
  magnitude out. Write `AND`, or quote the phrase.
- **A misspelled field is zero hits, not an error.** `resource_type.id:dataset` returns 0 and
  `metadata.resource_type.id:dataset` returns 683,302. `metadata.doi` returns 0 where `doi`
  returns 1. There is no warning, so any field-scoped pipeline needs a positive control.
- **Filter on the licence in the query.** `metadata.rights.id:(cc-by-4.0 OR cc0-1.0)` plus
  `access.status:open` narrows 448 dataset hits to 393 before anything is fetched. Screening
  after the fact works too, but this is one request instead of 448.
- **`size` caps at 25 anonymously**, and Zenodo says so in the error body: *"Page size cannot
  be greater than 25. Please use authenticated requests to increase the limit to 100."*
- **The result window is 10,000.** `size=25&page=400` is the last page that answers;
  `page=401` is `HTTP 400 — Invalid querystring parameters`. Narrow the query rather than
  paging past it.

Fields confirmed working on 2026-08-27: `metadata.resource_type.id` (`dataset`, `software`,
`publication-article`), `metadata.rights.id`, `access.status` (`open`, `restricted`,
`embargoed`), `doi`, `conceptdoi`, `pids.doi.identifier`, `_exists_:<field>`, `NOT`, `AND`,
`OR`, quoted phrases and parenthesised value lists. `sort` accepts `bestmatch`, `mostrecent`,
`newest`, `oldest`, `version`, `mostviewed`, `mostdownloaded`. `all_versions=true` returns
every version rather than only the latest. `size=0` is a validation error, not an empty page.

## Get the files

The end state is files on disk plus a manifest recording the **version** DOI, the licence
that permitted the fetch, and what was deliberately left behind — because a bare directory
of CSVs cannot be compared against a later fetch, and cannot answer "under what terms".

```python
import hashlib, json, os, re, urllib.error, urllib.parse, urllib.request

API = "https://zenodo.org/api/records"
RDM = {"Accept": "application/vnd.inveniordm.v1+json"}
ALLOW = {"cc-by-4.0", "cc-by-3.0", "cc-by-sa-4.0", "cc0-1.0",
         "mit", "apache-2.0", "bsd-3-clause"}
MAX_PER_FILE = 50_000        # raise deliberately; this record holds two 106 MB CSVs


class Refused(Exception):
    pass


def fetch(ref, timeout=60):
    m = re.search(r"zenodo\.(\d+)$|/records?/(\d+)$|^(\d+)$", str(ref).strip().rstrip("/"))
    if not m:
        q = urllib.parse.urlencode({"q": f'doi:"{ref}"', "size": 1})
        with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=RDM),
                                    timeout=timeout) as r:
            hits = json.loads(r.read())["hits"]["hits"]
        if not hits:
            raise LookupError(f"{ref}: no Zenodo record carries this DOI")
        return hits[0]
    with urllib.request.urlopen(
            urllib.request.Request(f"{API}/{next(g for g in m.groups() if g)}", headers=RDM),
            timeout=timeout) as r:
        return json.loads(r.read())


def gate(rec, allow=ALLOW):
    status = rec["access"]["status"]
    if status != "open":
        emb = rec["access"].get("embargo") or {}
        when = f", lifting {emb['until']}" if emb.get("active") else ""
        raise Refused(f"access is {status}{when}")
    rights = rec["metadata"].get("rights") or []
    if not rights:
        raise Refused("no licence stated")
    ids = []
    for r in rights:
        if not r.get("id"):
            raise Refused(f"free-text licence: {(r.get('title') or {}).get('en')!r}")
        if r["id"] not in allow:
            raise Refused(f"licence {r['id']} is not on the allowlist")
        ids.append(r["id"])
    return ids


def download(rec, out, max_bytes=MAX_PER_FILE):
    """Gate first. Nothing below this line runs for a record the gate refused."""
    ids = gate(rec)
    os.makedirs(out, exist_ok=True)
    got, skipped = [], []
    for e in sorted(rec["files"]["entries"].values(), key=lambda x: x["key"]):
        if e["size"] > max_bytes:
            skipped.append({"key": e["key"], "size": e["size"], "why": "over max_bytes"})
            continue
        # A key can contain `/` — 22 of 100 sampled records had one. Keep the
        # structure, and drop any component that would climb out of `out`.
        parts = [p for p in e["key"].split("/") if p not in ("", ".", "..")]
        dest = os.path.join(out, *parts)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        urllib.request.urlretrieve(e["links"]["content"], dest)
        algo, digest = e["checksum"].split(":", 1)
        local = hashlib.new(algo, open(dest, "rb").read()).hexdigest()
        got.append({"key": e["key"], "bytes": os.path.getsize(dest),
                    "declared": e["size"], "checksum": e["checksum"],
                    "checksum_ok": local == digest})
    meta = {"record": rec["id"],
            "version_doi": (rec.get("pids") or {}).get("doi", {}).get("identifier"),
            "concept_doi": (rec["parent"].get("pids") or {}).get("doi", {}).get("identifier"),
            "version_index": rec["versions"]["index"],
            "is_latest": rec["versions"]["is_latest"],
            "title": rec["metadata"]["title"],
            "licence": ids,
            "access": rec["access"]["status"],
            "files_in_record": rec["files"]["count"],
            "downloaded": got, "skipped": skipped}
    with open(os.path.join(out, "manifest.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    return meta


for ref in ("10.5281/zenodo.10000430", "10.5281/zenodo.1146764"):
    rec = fetch(ref)
    try:
        meta = download(rec, f"Data/zenodo/{rec['id']}")
    except Refused as e:
        print(f"REFUSED {ref}\n  {e}\n  nothing downloaded\n")
        continue
    print(f"OK      {ref}  licence {','.join(meta['licence'])}  "
          f"v{meta['version_index']} (latest={meta['is_latest']})")
    for f in meta["downloaded"]:
        print(f"  {f['bytes']:>8,} B  md5 ok={f['checksum_ok']}  {f['key']}")
    print(f"  skipped {len(meta['skipped'])} of {meta['files_in_record']}, "
          f"{sum(s['size'] for s in meta['skipped']):,} B not transferred")
    print(f"  manifest Data/zenodo/{meta['record']}/manifest.json\n")
```

Printed 2026-08-27:

```
OK      10.5281/zenodo.10000430  licence cc-by-4.0  v1 (latest=True)
    13,001 B  md5 ok=True  FlowSorterFraction_Zenodo.csv
     4,899 B  md5 ok=True  README.md
    24,121 B  md5 ok=True  Sample_annotated_Zenodo.csv
  skipped 3 of 6, 214,888,138 B not transferred
  manifest Data/zenodo/10000430/manifest.json

REFUSED 10.5281/zenodo.1146764
  licence cc-by-nc-4.0 is not on the allowlist
  nothing downloaded
```

`MAX_PER_FILE` is set low here so the example moves 42 KB rather than 215 MB. Raise it for
real work, and raise it knowing the number — the two files left behind are 106 MB each.

What ends up on disk: the three files, plus `manifest.json` carrying
`version_doi: 10.5281/zenodo.10000430`, `concept_doi: 10.5281/zenodo.10000429`,
`licence: ["cc-by-4.0"]`, `access: open`, `files_in_record: 6`, and the `skipped` list with
each file's size and why it was left. That is what makes a later re-fetch comparable and
makes the terms auditable without going back to the API.

The checksum comparison is not decoration. `urlretrieve` writes whatever arrives, and a
truncated transfer produces a short file and no exception.

## Requesting access

A `restricted` record is public metadata over private files. There is no committee and no
data-use certificate — **the depositor decides, one person, by email or through the form on
the record page** at `https://zenodo.org/records/<id>`. The API exposes the endpoint at
`links.access_request`, but it is POST-only and answers `405` to a read, so this is a human
step, not one an agent completes.

What that means in practice:

- **This skill cannot obtain access and does not promise it.** It reports the tier, the
  embargo date if there is one, and stops.
- **An `embargoed` record is a date, not a request.** `access.embargo.until` is when the
  files open by themselves, and `access.embargo.reason` is often the submitter saying why —
  `17977149` reads *"Finalizing and publishing data"*, lifting 2026-12-11. Asking early
  usually gains nothing.
- **Access granted is not a licence granted.** A depositor who sends you the files has said
  nothing about what you may do with them, and a restricted record usually carries no
  `rights` at all. Ask for the terms in the same message, in writing.
- **Some restricted records are restricted because they should be.** Individual-level
  clinical and imaging data ends up on Zenodo, and consent, not the download link, is the
  binding constraint. If the deposit's description does not say what the data may be used
  for, that question comes before the request.

Where a paper's data is restricted here, the same work is often deposited openly elsewhere —
worth one search of the domain archive before writing to anyone.

## When Zenodo is not the answer

Zenodo holds what someone chose to deposit, so it is the wrong first stop for anything with
a domain archive. Raw sequencing reads belong in SRA or ENA and are almost never here.
Expression series are usually in GEO or ArrayExpress with structured sample metadata that
Zenodo has no field for. Structures are in the PDB. What Zenodo has that those do not is the
*processed* artefact an analysis actually starts from, and code and notebooks alongside it.

There is also no sample-level schema. A Zenodo record's metadata describes the deposit, not
the samples in it, so the mapping from a file to an experimental group lives inside the files
themselves, in whatever form the depositor chose. Read the README before the data.

## Try it

**Data.** Four public Zenodo records, no account and no token. `10000430` is CC-BY-4.0 RNA-seq
of sorted PBMC subpopulations. `1146764` is MicrobiomeHD, CC-BY-NC-4.0. `10932811` is the
TRACERx lung cancer deposit under an academic-use-only licence with no vocabulary id.
`6406114` is RAD-ChestCT, restricted. Together they exercise four of the gate's five
branches — the fifth, a record stating no licence at all, is `6481141` in the body above.

**Run.** In an empty directory:

```sh
cat > zenodo_gate.py <<'PY'
import hashlib, json, os, urllib.request

API = "https://zenodo.org/api/records"
RDM = {"Accept": "application/vnd.inveniordm.v1+json"}
ALLOW = {"cc-by-4.0", "cc-by-3.0", "cc-by-sa-4.0", "cc0-1.0", "mit", "apache-2.0"}


def fetch(rid):
    req = urllib.request.Request(f"{API}/{rid}", headers=RDM)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def gate(rec):
    """(licence ids, None) if this record may be used, else (None, the reason)."""
    status = rec["access"]["status"]
    if status != "open":
        emb = rec["access"].get("embargo") or {}
        return None, f"access is {status}" + (f", lifting {emb['until']}"
                                              if emb.get("active") else "")
    rights = rec["metadata"].get("rights") or []
    if not rights:
        return None, "no licence stated"
    for r in rights:
        if not r.get("id"):
            return None, f"free-text licence {(r.get('title') or {}).get('en')!r}"
        if r["id"] not in ALLOW:
            return None, f"licence {r['id']} is not on the allowlist"
    return [r["id"] for r in rights], None


for rid in ("10000430", "1146764", "10932811", "6406114"):
    rec = fetch(rid)
    ids, why = gate(rec)
    doi = (rec.get("pids") or {}).get("doi", {}).get("identifier")
    if why:
        print(f"REFUSE {rid:<9} {doi:<26} {why}")
        continue
    v, f = rec["versions"], rec["files"]
    print(f"ALLOW  {rid:<9} {doi:<26} {','.join(ids)}  v{v['index']} "
          f"latest={v['is_latest']}  {f['count']} files  {f['total_bytes']:,} B")

# Only because the gate allowed it, fetch the smallest file of that one record.
rec = fetch("10000430")
e = min(rec["files"]["entries"].values(), key=lambda x: x["size"])
urllib.request.urlretrieve(e["links"]["content"], e["key"])
algo, digest = e["checksum"].split(":", 1)
local = hashlib.new(algo, open(e["key"], "rb").read()).hexdigest()
print(f"\nfetched {e['key']}  {os.path.getsize(e['key']):,} B "
      f"(declared {e['size']:,})  {algo} matches {local == digest}")
PY
python3 zenodo_gate.py
```

**Expect.** Run cold in an empty directory on 2026-08-27, this printed exactly:

```
ALLOW  10000430  10.5281/zenodo.10000430    cc-by-4.0  v1 latest=True  6 files  214,930,159 B
REFUSE 1146764   10.5281/zenodo.1146764     licence cc-by-nc-4.0 is not on the allowlist
REFUSE 10932811  10.5281/zenodo.10932811    free-text licence 'Academic-Use Only Data Licence'
REFUSE 6406114   10.5281/zenodo.6406114     access is restricted

fetched README.md  4,899 B (declared 4,899)  md5 matches True
```

*Invariants* — true regardless of what Zenodo ships next, so a failure here means this skill
is wrong. Exactly one of the four records passes the gate, and each of the other three fails
for a different reason. Nothing is written to disk for a refused record. The downloaded file's
size on disk equals the `size` the manifest declared, and its MD5 equals the declared
`checksum`. Every record resolves anonymously, with no token.

*Observed values, 2026-08-27* — a mismatch is drift to investigate, not a bug. Record
`10000430` holds 6 files totalling 214,930,159 B and its smallest is `README.md` at 4,899 B.
`1146764` is `cc-by-nc-4.0`. `10932811` carries the free-text *Academic-Use Only Data Licence*.
`6406114` is restricted. A licence changing here is the single most consequential drift this
skill can suffer, which is why all four are checked rather than the one that works.

## Sources

- Zenodo REST API — <https://developers.zenodo.org/>
- InvenioRDM records API, whose serialization the `Accept` header selects —
  <https://inveniordm.docs.cern.ch/reference/rest_api_index/>
- Zenodo licence vocabulary, resolvable per id at
  `https://zenodo.org/api/vocabularies/licenses/<id>` — <https://zenodo.org/api/vocabularies/licenses>
- Zenodo general policies and terms of use — <https://about.zenodo.org/policies/>
