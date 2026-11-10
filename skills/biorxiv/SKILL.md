---
name: biorxiv
description: Harvest bioRxiv and medRxiv preprint metadata through the open api.biorxiv.org — by DOI, date window, subject category or funder — follow each preprint to its journal version, read the per-preprint licence before reusing text, and get full text through the routes that are actually open (Europe PMC, the requester-pays MECA bucket).
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [preprint, literature-mining, bibliometrics, public-data, publishing]
covers: [biorxiv, medrxiv, preprints, preprint server, cold spring harbor laboratory, literature, abstracts, full text, jats xml, meca, text mining, tdm, published version, journal publication, peer review, withdrawn preprints, subject category, neuroscience, microbiology, genomics, bioinformatics, epidemiology, infectious diseases, covid-19, creative commons, europe pmc, funder, ror]
papers: [PMID:31017570, doi:10.1101/833400, PMID:33798194]
access: [open]
datasets: [https://api.biorxiv.org/details/biorxiv/10.1101/2024.02.07.579372, https://api.biorxiv.org/details/biorxiv/2025-01-01/2025-01-02/0, https://api.biorxiv.org/pubs/biorxiv/10.1101/000026, https://api.biorxiv.org/details/medrxiv/2025-03-03/2025-03-04/0, https://www.ebi.ac.uk/europepmc/webservices/rest/PPR1260519/fullTextXML]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: api.biorxiv.org details/pubs/funder 2026-11-06 / Europe PMC REST 2026-11-06 / biorxiv-src-monthly bucket listing 2026-11-06 / Python 3.9.6 and 3.12.2 stdlib / curl 8.7.1 / aws-cli 2.24.15
  executed: 9
  unverified: 0
---
# bioRxiv and medRxiv

bioRxiv (biology, since November 2013) and medRxiv (health sciences, since June 2019) are
the two preprint servers run by Cold Spring Harbor Laboratory. Both are served by one
metadata API at `https://api.biorxiv.org`, which needs no account and no key and returns
JSON. This skill covers three jobs:

1. **Harvest metadata** — one preprint by DOI, or every preprint posted in a window,
   optionally narrowed to a subject category or a funder.
2. **Link preprints to journal articles** — which preprint became which paper, and back.
3. **Get the text** — and decide, per preprint, whether you may reuse what you got.

What it does not do is search. There is no keyword or author query on this API. To find
preprints *about* something, either harvest the window and filter locally, or search Europe
PMC (which indexes both servers as source `PPR`) and come back here with the DOIs.

## Identifiers — three things that break naive code

- **The DOI prefix changed.** New preprints posted from early December 2025 get
  `10.64898/…`; everything before has `10.1101/…`. New *versions* of an older preprint keep
  `10.1101`. On 2025-12-01 every new bioRxiv preprint was `10.1101`; on 2025-12-08 every new one
  was `10.64898`. Never hard-code the prefix, and never validate DOIs with a `10.1101` regex.
- **The DOI is version-free; the record is not.** `10.1101/2024.02.07.579372` has two
  versions, and the API returns one record per version. The version is a separate field
  (`"version": "2"`, a string). Web URLs append it: `…579372v2`.
- **The server is part of the address.** Asking `details/biorxiv/` for a medRxiv DOI returns
  `no posts found`, the same message as a DOI that does not exist. If you don't know the
  server, try both before concluding a DOI is wrong.

The full DOI, prefix included, goes in the path. `details/biorxiv/2024.02.07.579372` answers
`non-numeric value supplied`.

## The API

| endpoint | returns | page size |
|---|---|---|
| `details/{server}/{doi}` | every version of one preprint | — |
| `details/{server}/{from}/{to}/{cursor}` | every version **posted** in the window | **30** |
| `pubs/{server}/{doi}` | preprint → journal link, by preprint DOI *or* journal DOI | — |
| `pubs/{server}/{from}/{to}/{cursor}` | links whose **journal** publication date is in the window | **100** |
| `funder/{server}/{from}/{to}/{ror}/{cursor}` | preprints declaring a funder (ROR suffix, e.g. `00k4n6c32`) | 100 |

`server` is `biorxiv` or `medrxiv`. Dates are `YYYY-MM-DD`, inclusive at both ends. The
`details` window takes `?category=` — spaces as `%20` or `_`, case ignored.

```bash
curl -s "https://api.biorxiv.org/details/biorxiv/10.1101/2024.02.07.579372" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['messages']); [print(r['version'], r['date'], r['license'], r['published']) for r in d['collection']]"
```

**Failures come back as HTTP 200.** The status is the text in `messages[0]["status"]`: `ok`,
`no posts found`, `Both dates must be in yyyy-mm-dd format`, `non-numeric value supplied`,
`no articles found for published version of …`. Checking the HTTP code tells you nothing.

**An unknown category is silently ignored.** `?category=nonsense` returns the whole
unfiltered window with `"category": "all"` in the message. Always check that the echoed
category is the one you sent; otherwise a typo quietly turns a 6-record query into a
272-record one.

**Avoid the shortcut intervals.** The docs also allow `details/biorxiv/30` (the 30 most
recent) and `details/biorxiv/2d` (the last two days). They return everything in one response
with no `total` and no paging — `2d/0` is rejected as a bad date — and on 2026-11-06 both
included three August records whose dates were not zero-padded (`2026-8-17`), apparently
ranked by string order. Use an explicit date window.

### A harvester

```python
import json, time, urllib.parse, urllib.request

API = "https://api.biorxiv.org"

def api(path, retries=3):
    """GET one API path. Returns (status_message, messages[0], collection)."""
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(f"{API}/{path}", timeout=60) as r:
                d = json.load(r)
            m = d["messages"][0]
            return m["status"], m, d.get("collection", [])
        except (OSError, ValueError):
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))

def harvest(server, start, end, category=None):
    """Every version posted on `server` between `start` and `end` (inclusive)."""
    q = "?" + urllib.parse.urlencode({"category": category}) if category else ""
    out, cursor = [], 0
    while True:
        status, m, col = api(f"details/{server}/{start}/{end}/{cursor}{q}")
        if status == "no posts found":
            return out
        if status != "ok":
            raise ValueError(f"{server} {start}..{end}: {status}")
        if category and m["category"].lower() != category.replace("_", " ").lower():
            raise ValueError(f"category {category!r} not recognised; API fell back to {m['category']!r}")
        out += col
        cursor += len(col)
        if not col or cursor >= int(m["total"]):
            break
        time.sleep(0.5)
    if len(out) != int(m["total"]):
        raise RuntimeError(f"got {len(out)} records, API reported {m['total']}")
    return out

recs = harvest("biorxiv", "2025-01-01", "2025-01-02")
print(len(recs), "version records,", len({r["doi"] for r in recs}), "distinct DOIs")
print(len(harvest("biorxiv", "2025-01-01", "2025-01-02", category="cell_biology")), "in cell biology")
try:
    harvest("biorxiv", "2025-01-01", "2025-01-02", category="cell biolgy")
except ValueError as e:
    print("refused:", e)
try:
    harvest("biorxiv", "2025-13-01", "2025-01-02")
except ValueError as e:
    print("refused:", e)
```

The window counts **versions**, not papers. `total` is version records (272 for the first
two days of 2025), `count_new_papers` is version-1 records (198), and the distinct DOIs (265)
are neither. A paper that posted v1 and v2 in the same window appears twice. Decide which
count you mean before reporting one.

### Fields, and the inconsistencies to normalise

Each record carries `doi`, `version`, `date`, `title`, `authors` (one `;`-separated string),
`author_corresponding`, `author_corresponding_institution`, `type`, `category`, `license`,
`abstract`, `published`, `jatsxml` and `server`.

| field | what varies | do this |
|---|---|---|
| `category` | `Genetics ` (capitalised, trailing space) on 2013 records; lower case since | `.strip().lower()` |
| `type` | `New Results`, `new results`, `confirmatory results`; medRxiv uses `PUBLISHAHEADOFPRINT` and `WITHDRAWN` | lower-case; treat `withdrawn` as a flag, not a paper |
| `date` | normally `YYYY-MM-DD`; a few 2026 records read `2026-8-17` | re-pad before sorting or comparing |
| `published` | journal DOI, or the string `NA` | `NA` means *not linked yet*, not *never published* |
| `abstract` | leading newline and indentation on recent records | `.strip()` |
| `jatsxml` | malformed on the unpadded-date records (`/2026/8-/7/`), 404 there | don't build URLs from it blindly |

```python
def normalise(r):
    y, m, d = r["date"].split("-")
    return {
        "doi": r["doi"], "version": int(r["version"]), "server": r["server"],
        "date": f"{int(y):04d}-{int(m):02d}-{int(d):02d}",
        "title": r["title"].strip(), "authors": [a.strip() for a in r["authors"].split(";") if a.strip()],
        "category": r["category"].strip().lower(), "type": r["type"].strip().lower(),
        "withdrawn": r["type"].strip().lower() == "withdrawn",
        "license": r["license"], "abstract": r["abstract"].strip(),
        "published_doi": None if r["published"] in ("NA", "") else r["published"],
        "jatsxml": r["jatsxml"],
    }

for doi in ["10.1101/000026", "10.64898/2026.08.12.744382"]:
    _, _, col = api(f"details/biorxiv/{doi}")
    for r in col:
        n = normalise(r)
        print(n["doi"], "v%d" % n["version"], n["date"], repr(r["category"]), "->", n["category"], n["published_doi"])
```

**A window harvest is not guaranteed complete.** The three unpadded-date records above
(`10.64898/2026.08.11.744243`, `…08.14.744888`, `…08.12.744382`) are returned by their DOI but
are absent from a harvest of the day they claim — 2026-08-19 returned 372 records, none of
them. For a corpus that must be complete, cross-check the window against Europe PMC's `PPR`
records for the same dates and fetch any missing DOI individually.

## Preprint to journal article

The `published` field on a details record and the `pubs` endpoint carry the same link; `pubs`
adds the journal name and date. `pubs` accepts either side of the link:

```python
for server, doi in [("biorxiv", "10.1101/2024.02.07.579372"),   # preprint DOI
                    ("biorxiv", "10.7554/elife.97017.3"),         # journal DOI, reverse lookup
                    ("medrxiv", "10.1101/2021.04.29.21256344"),
                    ("biorxiv", "10.1101/339747")]:              # never linked
    status, _, col = api(f"pubs/{server}/{doi}")
    if status != "ok":
        print(doi, "->", status)
        continue
    for p in col:
        print(p["preprint_doi"], "->", p["published_doi"], "|", p["published_journal"], p["published_date"])

status, m, col = api("pubs/biorxiv/2025-01-01/2025-01-10/0")
print(m["total"], "links with a journal date in 2025-01-01..10; first page", len(col))
```

The `pubs` window is keyed on the **journal** date, not the preprint date — the first link
above was posted as a preprint in February 2024 and appears under 2025-01-02. Pages are 100,
not 30. The link is made by matching, after the fact; a preprint with no link may simply not
have been matched yet, so absence is weak evidence of non-publication.

## Licences — read them per preprint

Every preprint carries its own licence, chosen by its authors. The `license` code in the
metadata maps to the statement inside the JATS:

| code | means | you may redistribute text / figures |
|---|---|---|
| `cc_by` | CC BY 4.0 | yes, with attribution |
| `cc_by_nd` | CC BY-ND 4.0 | verbatim only, with attribution; no adapted versions |
| `cc_by_nc` | CC BY-NC 4.0 | non-commercial only |
| `cc_by_nc_nd` | CC BY-NC-ND 4.0 | non-commercial, verbatim only |
| `cc0`, `cc0_ng` | CC0 1.0 — the JATS says "placed … in the Public Domain" | yes |
| `cc_no` | "All rights reserved. The material may not be redistributed, re-used or adapted without the author's permission." | **no** |

In the first two days of 2025, 69 of 272 bioRxiv records were `cc_no` and another 104 were
`cc_by_nc_nd`. Reading and mining a preprint for your own analysis is one thing; republishing
its text, figures or abstract in a dataset, a training corpus or a commercial product is
governed by this field. Carry `license` alongside every record you save, and filter on it
before anything leaves your machine.

## Full text

Three routes, in the order to try them.

**1. Europe PMC — open, but for a subset.** Europe PMC indexes bioRxiv and medRxiv preprints
as `PPR` records (358,667 bioRxiv on 2026-11-06), and holds the full JATS for those
with `inEPMC: Y` — about 20,000 bioRxiv and 22,000 medRxiv, mostly preprints supported by
Europe PMC funders. For the rest, `fullTextXML` answers **500**, not 404.

```python
import urllib.error

EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"

def epmc_record(doi):
    q = urllib.parse.urlencode({"query": f'DOI:"{doi}" AND SRC:PPR', "format": "json", "resultType": "core"})
    with urllib.request.urlopen(f"{EPMC}/search?{q}", timeout=60) as r:
        hits = json.load(r)["resultList"]["result"]
    return hits[0] if hits else None

def epmc_fulltext(doi):
    rec = epmc_record(doi)
    if rec is None or rec.get("inEPMC") != "Y":
        return None
    try:
        with urllib.request.urlopen(f"{EPMC}/{rec['id']}/fullTextXML", timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code in (404, 500):
            return None
        raise

for doi in ["10.64898/2026.06.20.732459", "10.1101/2024.02.07.579372"]:
    rec, xml = epmc_record(doi), epmc_fulltext(doi)
    print(doi, rec["id"], "inEPMC", rec["inEPMC"], "->", f"{len(xml)} bytes of JATS" if xml else "no full text")
```

Check `inEPMC` first; don't treat a 500 as a server fault worth retrying.

**2. The `jatsxml` link.** Each API record points at its JATS on www.biorxiv.org /
www.medrxiv.org. The URL answers 301 to a `/content/{server}/early/…` path, which then serves
`application/xml`. The sites sit behind Cloudflare bot protection, and whether a script gets
through depends on the client: on 2026-11-06 `curl` received the XML from both sites while
Python's `urllib` received 403 for the same URLs, and medRxiv's article pages and PDFs
answered 403 to `curl` too. **A 403 here is the site declining automated access — do not
disguise the client to get past it.** Use route 1 or 3.

```bash
curl -sL -o 579372v1.xml -w "%{http_code} %{content_type}\n" \
  "https://www.biorxiv.org/content/early/2024/02/08/2024.02.07.579372.source.xml"
head -c 120 579372v1.xml; echo; rm -f 579372v1.xml
```

**3. The text-and-data-mining buckets — the sanctioned bulk route.** The full content of
both servers is in Amazon S3 as **requester-pays** buckets, `biorxiv-src-monthly` and
`medrxiv-src-monthly` (us-east-1). An anonymous request is refused (`Anonymous users cannot
invoke requests against Requester Pays buckets`), so you need an AWS account, and **your
account pays** for every request and every byte transferred out. Layout:

- `Current_Content/{Month}_{Year}/` — one folder per month, from December 2018.
- `Back_Content/Batch_01/` … `Batch_24/` — the earlier material.
- Each preprint version is one `.meca` file — a zip holding `content/{id}.xml` (JATS),
  `content/{id}.pdf`, the figures and tables as image files, `manifest.xml` and `directives.xml`. Files are named by
  **UUID, not DOI**; the DOI is only inside the XML.

Look before you pull. Listing a prefix and reading the end of one archive costs a fraction of
a cent; syncing a month costs real money:

```bash
aws s3api list-objects-v2 --bucket biorxiv-src-monthly --request-payer requester \
  --prefix Current_Content/October_2026/ --max-keys 3 \
  --query 'Contents[].[Key,Size]' --output text
# the zip's central directory is at the end — 64 KB lists the members without the figures
aws s3api get-object --bucket biorxiv-src-monthly --request-payer requester \
  --key Current_Content/October_2026/000f6c5a-70cb-1014-9869-b223d50eb86e.meca \
  --range bytes=-65536 meca-tail.bin > /dev/null
python3 -c "import re; b=open('meca-tail.bin','rb').read(); print(sorted({m.decode() for m in re.findall(rb'PK\x01\x02.{42}([\w./-]+\.(?:xml|tif|gif|jpg|pdf))', b, re.S)})[:4])"
rm -f meca-tail.bin
```

The bucket gives you the content; the per-preprint licence above still governs what you may
redistribute from it.

## Get the files

This writes a window's metadata to disk as JSON Lines (one normalised record per version), a
CSV of preprint-to-journal links, and full-text JATS for every preprint in the window that
Europe PMC holds **and** whose licence allows redistribution — plus a manifest saying what
was fetched, what was skipped and why.

```python
import csv, json, os

def get_files(server, start, end, outdir, category=None, reuse_ok=("cc_by", "cc0", "cc0_ng")):
    os.makedirs(os.path.join(outdir, "jats"), exist_ok=True)
    recs = [normalise(r) for r in harvest(server, start, end, category)]
    with open(os.path.join(outdir, "preprints.jsonl"), "w") as f:
        for n in recs:
            f.write(json.dumps(n, ensure_ascii=False) + "\n")

    with open(os.path.join(outdir, "published.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["preprint_doi", "version", "published_doi"])
        for n in recs:
            if n["published_doi"]:
                w.writerow([n["doi"], n["version"], n["published_doi"]])

    latest = {}
    for n in recs:                       # one full text per DOI: its newest version in the window
        if n["doi"] not in latest or n["version"] > latest[n["doi"]]["version"]:
            latest[n["doi"]] = n
    fetched, skipped = [], {}
    for doi, n in latest.items():
        if n["withdrawn"]:
            skipped[doi] = "withdrawn"
        elif n["license"] not in reuse_ok:
            skipped[doi] = f"licence {n['license']}"
        else:
            xml = epmc_fulltext(doi)
            if xml is None:
                skipped[doi] = "not in Europe PMC full text"
            else:
                path = os.path.join(outdir, "jats", doi.replace("/", "_") + ".xml")
                with open(path, "wb") as f:
                    f.write(xml)
                fetched.append(doi)
            time.sleep(0.2)
    manifest = {"server": server, "window": [start, end], "category": category or "all",
                "version_records": len(recs), "distinct_dois": len(latest),
                "fulltext_fetched": fetched, "fulltext_skipped": skipped}
    with open(os.path.join(outdir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    return manifest

m = get_files("biorxiv", "2026-06-25", "2026-06-25", "biorxiv_neuro_2026-06-25", category="neuroscience")
reasons = {}
for why in m["fulltext_skipped"].values():
    reasons[why] = reasons.get(why, 0) + 1
print(m["version_records"], "records,", m["distinct_dois"], "DOIs,", len(m["fulltext_fetched"]), "full texts")
print("skipped:", reasons)
print(sorted(os.listdir("biorxiv_neuro_2026-06-25")), os.listdir("biorxiv_neuro_2026-06-25/jats")[:3])
```

`reuse_ok` is the redistribution policy; it defaults to the licences that allow any reuse. If
the JATS will only ever be read locally for your own analysis, widen it deliberately and
record that you did. Expect most of a window to land in `fulltext_skipped` — that is the
coverage of the open routes, stated rather than hidden. For complete coverage, use the S3
buckets.

## Try it

**Data.** bioRxiv's own API and Europe PMC, both open with no account. The records are the
first two days of 2025 on bioRxiv, two days of March 2025 on medRxiv, the 2013 preprint
`10.1101/000026` (one of the first deposits), the two-version preprint
`10.1101/2024.02.07.579372`, and the CC BY preprint `10.64898/2026.06.20.732459` whose full text
Europe PMC holds. Preprint metadata and abstracts are served openly; reuse of each preprint's
text follows its own licence. Confirmed reachable 2026-11-06.

**Run.** Self-contained — paste into a file and run with `python3`:

```python
import json, time, urllib.parse, urllib.request, urllib.error

def get(url):
    with urllib.request.urlopen(url, timeout=90) as r:
        return json.load(r)

def window(server, a, b, q=""):
    out, c = [], 0
    while True:
        d = get(f"https://api.biorxiv.org/details/{server}/{a}/{b}/{c}{q}")
        m = d["messages"][0]
        out += d["collection"]; c += len(d["collection"])
        if not d["collection"] or c >= int(m["total"]):
            return out, m
        time.sleep(0.3)

# --- paging: 30 per page, and the window counts versions ---
first = get("https://api.biorxiv.org/details/biorxiv/2025-01-01/2025-01-02/0")
recs, m = window("biorxiv", "2025-01-01", "2025-01-02")
assert len(first["collection"]) == 30
assert len(recs) == int(m["total"])
assert len({(r["doi"], r["version"]) for r in recs}) == len(recs)          # no page overlap
assert sum(r["version"] == "1" for r in recs) == int(m["count_new_papers"])
print("bioRxiv 2025-01-01..02:", m["total"], "records,", m["count_new_papers"], "new,",
      len({r["doi"] for r in recs}), "DOIs")

# --- an unknown category is ignored, not refused ---
bad = get("https://api.biorxiv.org/details/biorxiv/2025-01-01/2025-01-02/0?category=nonsense")["messages"][0]
good = get("https://api.biorxiv.org/details/biorxiv/2025-01-01/2025-01-02/0?category=cell_biology")["messages"][0]
assert bad["category"] == "all" and bad["total"] == m["total"]
assert good["category"] == "cell biology"
print("category=nonsense ->", bad["category"], bad["total"], "| cell_biology ->", good["total"])

# --- errors are HTTP 200 with a status string ---
for path in ["details/biorxiv/2025-13-01/2025-01-02/0", "details/biorxiv/2024.02.07.579372",
             "details/biorxiv/10.1101/2021.04.29.21256344"]:
    s = get("https://api.biorxiv.org/" + path)["messages"][0]["status"]
    assert s != "ok"
    print(path, "->", s)

# --- versions, eras, servers ---
two = get("https://api.biorxiv.org/details/biorxiv/10.1101/2024.02.07.579372")["collection"]
assert [r["version"] for r in two] == ["1", "2"]
old = get("https://api.biorxiv.org/details/biorxiv/10.1101/000026")["collection"]
assert old[0]["date"] == "2013-11-07" and old[0]["category"].strip().lower() == "genetics"
med, mm = window("medrxiv", "2025-03-03", "2025-03-04")
assert {r["server"] for r in med} == {"medRxiv"}
print("medRxiv 2025-03-03..04:", mm["total"], "records; types", sorted({r["type"] for r in med}))

# --- preprint <-> journal, both directions ---
fwd = get("https://api.biorxiv.org/pubs/biorxiv/10.1101/000026")["collection"][0]
rev = get("https://api.biorxiv.org/pubs/biorxiv/10.7554/elife.97017.3")["collection"][0]
assert fwd["published_doi"] == old[0]["published"]
assert rev["preprint_doi"] == "10.1101/2024.02.07.579372"
print("000026 ->", fwd["published_journal"], "| elife.97017.3 <-", rev["preprint_doi"])

# --- full text through Europe PMC, and what a non-held preprint returns ---
B = "https://www.ebi.ac.uk/europepmc/webservices/rest"
with urllib.request.urlopen(f"{B}/PPR1260519/fullTextXML", timeout=120) as r:
    xml = r.read()
assert b"10.64898/2026.06.20.732459" in xml and b'article-type="preprint"' in xml
try:
    urllib.request.urlopen(f"{B}/PPR803623/fullTextXML", timeout=60)
    code = 200
except urllib.error.HTTPError as e:
    code = e.code
assert code == 500, f"PPR803623 answered {code}"
print("Europe PMC: PPR1260519", len(xml), "bytes of JATS; PPR803623 ->", code)

# --- licence mix in the window ---
lic = {}
for r in recs:
    lic[r["license"]] = lic.get(r["license"], 0) + 1
print("licences:", dict(sorted(lic.items(), key=lambda kv: -kv[1])))
```

**Expect.**

Invariants — a failure means the skill is wrong:

- The first page of a window holds 30 records, the harvested count equals `total`, no
  `(doi, version)` repeats across pages, and version-1 records equal `count_new_papers`.
- `?category=nonsense` echoes `category: all` with the unfiltered total; `cell_biology` echoes
  `cell biology`.
- A bad date, a prefix-less DOI and a medRxiv DOI on the bioRxiv path each return HTTP 200 with
  a status other than `ok`.
- `10.1101/2024.02.07.579372` returns versions `1` and `2`; `10.1101/000026` dates from
  2013-11-07 and normalises to `genetics`.
- `pubs` resolves `10.1101/000026` to the same journal DOI as its `published` field, and
  resolves the eLife DOI back to its preprint.
- Europe PMC returns preprint JATS for `PPR1260519` and **500** for `PPR803623` (`inEPMC: N`).

Observed 2026-11-06 — these move as the servers re-match, withdraw and revise, so a mismatch
is drift to investigate, not a failure:

```
bioRxiv 2025-01-01..02: 272 records, 198 new, 265 DOIs
category=nonsense -> all 272 | cell_biology -> 22
details/biorxiv/2025-13-01/2025-01-02/0 -> Both dates must be in yyyy-mm-dd format
details/biorxiv/2024.02.07.579372 -> non-numeric value supplied
details/biorxiv/10.1101/2021.04.29.21256344 -> no posts found
medRxiv 2025-03-03..04: 136 records; types ['PUBLISHAHEADOFPRINT', 'WITHDRAWN']
000026 -> PLOS Genetics | elife.97017.3 <- 10.1101/2024.02.07.579372
Europe PMC: PPR1260519 185484 bytes of JATS; PPR803623 -> 500
licences: {'cc_by_nc_nd': 104, 'cc_no': 69, 'cc_by': 58, 'cc_by_nd': 20, 'cc_by_nc': 17, 'cc0': 3, 'cc0_ng': 1}
```

## Sources

- bioRxiv API documentation — https://api.biorxiv.org/
- `pubs` and `funder` help — https://api.biorxiv.org/pubs/help, https://api.biorxiv.org/funder/help
- Europe PMC REST API — https://europepmc.org/RestfulWebService
- Abdill & Blekhman (2019) Tracking the popularity and outcomes of all bioRxiv preprints.
  *eLife* 8, e45133 — https://doi.org/10.7554/eLife.45133
- Sever et al. (2019) bioRxiv: the preprint server for biology. *bioRxiv* 833400 —
  https://doi.org/10.1101/833400
- Fraser et al. (2021) The evolving role of preprints in the dissemination of COVID-19
  research and their impact on the science communication landscape. *PLOS Biology* 19,
  e3000959 — https://doi.org/10.1371/journal.pbio.3000959
