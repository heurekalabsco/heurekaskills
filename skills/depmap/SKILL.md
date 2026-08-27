---
name: depmap
description: Retrieve DepMap cancer dependency data pinned to a named quarterly release — CRISPR gene effect (Chronos), expression, copy number, mutations, drug sensitivity and cell-line annotation across ~1,178 models. Resolves a release name to a citable, versioned figshare record, because gene effect scores move between quarters and an unpinned analysis is not reproducible.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [depmap, crispr, cancer, multi-omics, public-data]
covers: [depmap, achilles, ccle, crispr knockout screen, chronos, gene effect, gene dependency, common essential, synthetic lethality, cancer cell line, cell line encyclopedia, oncotree, lung, breast, bowel, colorectal, ovary, skin, melanoma, lymphoid, leukemia, brain, pancreas, prostate, kidney, copy number, somatic mutation, gene expression, drug sensitivity, human]
papers: [PMID:28753430, PMID:29083409, PMID:34930405, PMID:32613204, PMID:31068700, PMID:30971826, doi:10.1186/s13059-024-03336-1]
access: [open]
datasets: [https://ndownloader.figshare.com/files/51065795, https://ndownloader.figshare.com/files/51065297, https://ndownloader.figshare.com/files/51064667, https://ndownloader.figshare.com/files/51063560, https://ndownloader.figshare.com/files/51063566, https://ndownloader.figshare.com/files/43346895, https://ndownloader.figshare.com/files/43746708, https://ndownloader.figshare.com/files/38357390, https://ndownloader.figshare.com/files/46630984]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: DepMap 24Q4 Public (figshare article 27993248 v1, doi 10.25452/figshare.plus.27993248.v1) plus 24Q2, 23Q4, 23Q2 and 22Q4 / figshare API v2 / PRISM Repurposing Public 24Q2 (article 25917643 v1) / Python 3.12.8 standard library only / curl 8.7.1
  executed: 12
  unverified: 0
---
# DepMap — the Cancer Dependency Map

DepMap is the answer to *which genes does this cancer cell line need to survive*. It is a
genome-wide CRISPR knockout screen across ~1,178 cell lines, published as a named quarterly
snapshot and shipped alongside the expression, copy number and mutation data for the same
lines, so that a dependency can be tied to a genotype.

Two things decide whether work built on it is reproducible, and both are covered below before
anything else:

1. **The portal's download API is not a data route for an agent.** It answers `200` with an
   HTML human-verification page, so `raise_for_status()` passes and the parse fails somewhere
   downstream — or does not fail, and yields nonsense.
2. **A release is not "DepMap".** Scores are recomputed every quarter and they move. An
   analysis that names no release cannot be repeated, and — as *Same name, different data*
   below shows with 257 vanished cell lines — even naming the release is not always enough.

Everything here is `https` with no account, no key and no click-through, and every block is
Python standard library only.

## The portal answers 200 with a verification page

```bash
curl -s -o depmap_api_probe.html \
  -w 'HTTP %{http_code}  content-type %{content_type}  bytes %{size_download}\n' \
  https://depmap.org/portal/api/download/files

grep -o '<title>[^<]*</title>' depmap_api_probe.html
grep -o 'data-sitekey="[^"]*"' depmap_api_probe.html
```

```
HTTP 200  content-type text/html; charset=utf-8  bytes 5175
<title>DepMap — Verification</title>
data-sitekey="0x4AAAAAADUm6LZT0GHl88BI"
```

That is a Cloudflare Turnstile challenge, and the page says in as many words:

> Need DepMap data in bulk? You're always welcome to grab everything from the downloads
> section — please don't scrape the portal.

So do not build against `depmap.org/portal/...`, do not try to pass the challenge, and do not
treat a `200` from that host as success. **Check `content-type`, not the status code**, on any
DepMap host — the same failure shape appears on `/portal/data_page/` and `/portal/download/all/`,
both of which also return `200 text/html` with that title.

The route this skill uses instead is DepMap's own figshare deposit — the records authored by
*DepMap, Broad*, whose DOIs resolve to `plus.figshare.com`. It is a plain JSON API, each
release is a separate citable record with its own DOI, and the licence is stated in
machine-readable metadata rather than inferred from a page nobody can fetch.

## Releases are figshare records, and the search is the index

Every quarterly release is one figshare article authored by *DepMap, Broad*. Resolve the
release **name** to an article rather than hardcoding an id, and refuse to guess when the match
is not exact:

```python
import json, re, urllib.request

SEARCH = "https://api.figshare.com/v2/articles/search"
API = "https://api.figshare.com/v2/articles"

# The two title forms DepMap has used. Everything else the search returns is a
# third-party paper that merely mentions the release, and must be discarded.
TITLE = re.compile(r"^DepMap (?:Achilles )?(\d\dQ\d) Public$", re.I)


def post(url, body):
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(),
        headers={"User-Agent": "depmap-skill", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as fh:
        return json.load(fh)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "depmap-skill"})
    with urllib.request.urlopen(req, timeout=90) as fh:
        return json.load(fh)


def releases_on_figshare():
    """{release name: article id} for every quarterly DepMap deposit."""
    hits = post(SEARCH, {"search_for": ":title: DepMap AND :title: Public",
                         "page_size": 100})
    found = {}
    for h in hits:
        m = TITLE.match(h["title"].strip())
        if m:
            found[m.group(1).upper()] = h["id"]
    return found


def find_release(release):
    """'24Q4' -> the article id for that release. Raises rather than guessing.

    The title filter is doing the real work, not the query: a bare search for
    '23Q4' also returns two figures from an unrelated paper."""
    hits = post(SEARCH, {"search_for": f":title: DepMap AND :title: {release}",
                         "page_size": 50})
    exact = [h for h in hits
             if (m := TITLE.match(h["title"].strip()))
             and m.group(1).upper() == release.upper()]
    if len(exact) != 1:
        raise LookupError(
            f"{release}: {len(exact)} release titles among {len(hits)} search hits "
            f"-- {[h['title'] for h in hits][:4]}")
    return exact[0]["id"]


found = releases_on_figshare()
print(f"{len(found)} quarterly releases on figshare, newest {max(found)}\n")
print(f"{'release':28} {'article':>9} {'ver':>4} {'published':11} {'licence':10} files")
for name in sorted(found, reverse=True)[:6]:
    a = get(f"{API}/{found[name]}")
    print(f"{a['title']:28} {a['id']:>9} {a['version']:>4} "
          f"{a['published_date'][:10]:11} {a['license']['name']:10} {len(a['files'])}")

print("\nfind_release('24Q4') ->", find_release("24Q4"))
print("citation:", get(f"{API}/{find_release('24Q4')}")["citation"])
try:
    find_release("25Q2")
except LookupError as e:
    print("\nfind_release('25Q2') ->", e)
```

```
20 quarterly releases on figshare, newest 24Q4

release                        article  ver published   licence    files
DepMap 24Q4 Public            27993248    1 2024-12-10  CC BY 4.0  73
DepMap 24Q2 Public            25880521    1 2024-05-23  CC BY 4.0  66
DepMap 23Q4 Public            24667905    2 2023-12-19  CC BY 4.0  56
DepMap 23Q2 Public            22765112    4 2023-06-02  CC BY 4.0  52
DepMap 22Q4 Public            21637199    2 2022-12-07  CC BY 4.0  47
DepMap 22Q2 Public            19700056    2 2022-05-05  CC BY 4.0  42

find_release('24Q4') -> 27993248
citation: DepMap, Broad (2024). DepMap 24Q4 Public. Figshare+. Dataset. https://doi.org/10.25452/figshare.plus.27993248.v1

find_release('25Q2') -> 25Q2: 0 release titles among 0 search hits -- []
```

Five things that fall out of that listing:

- **Every one of the 20 quarterly records is CC BY 4.0**, stated in figshare's own metadata
  under `license`. The `README.txt` inside a release states no licence at all, so the article
  metadata is the authority — read it, don't assume it.
- **`published_date` is not release order.** 21Q3 (article `15160110`) was published
  2021-12-16, six weeks *after* 21Q4 (`16924132`, 2021-11-03). Sorting a release list by date
  puts them in the wrong order and a "latest" picked that way is wrong. Sort on the release
  name.
- **The newest release on figshare is 24Q4 Public, deposited 2024-12-10.** Confirmed
  2026-08-27 by three independent query forms — exact title, `:author: "Broad DepMap"`, and
  free text — all of which stop there. Later quarters are portal-only, and the portal is the
  interstitial above. If your question needs a release newer than 24Q4, a person has to fetch
  it through a browser; this skill cannot, and neither can an agent following it.
- Free-text search is noisy: `{"search_for": "DepMap Public"}` returns figures from unrelated
  papers ahead of any release, and `:title: DepMap AND :title: 23Q4` returns two figure
  captions alongside the release. The `:title:` operator plus the title regex is what makes
  the lookup safe.
- **Quoting a single token inside `:title:` silently returns nothing.**
  `:title: "24Q4"` matches zero articles; `:title: 24Q4` matches one. A quoted *phrase* —
  `:title: "DepMap 24Q4 Public"` — does work. An empty result from this API is not evidence
  that a release is absent until you have tried the unquoted form.

`find_release` was checked against all 20 titles the regex matches and resolves every one,
18Q3 through 24Q4. Two things it does not cover, both of which turn a real release into a
`LookupError`. **20Q3 is deposited as `public_20q3`** — article `12931238`, CC BY 4.0, 26 files
— which neither the regex nor the title search finds, because figshare does not tokenise
`public_20q3` into `20q3` either. And **there is no public release every quarter**: nothing is
deposited for 22Q3, 23Q1, 23Q3, 24Q1 or 24Q3, so code that increments a quarter to reach "the
next release" walks off the end. Treat a `LookupError` as *go and look*, never as *this
release does not exist*.

## Same name, different data — pin the version, not just the quarter

A figshare article id resolves to its **latest** version, silently. `DepMap 23Q4 Public` has two
of them, and they are not the same dataset:

```python
import csv, io, json, time, urllib.error, urllib.request

API = "https://api.figshare.com/v2/articles"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "depmap-skill"})
    with urllib.request.urlopen(req, timeout=90) as fh:
        return json.load(fh)


def fetch_csv(file_id, tries=4):
    """figshare file ids are per-version. The same NAME in two versions of the
    same article is two different files with two different ids.

    Retries a 403 -- see the note below Trap 5; the download redirect is signed
    with a ten-second expiry and a slow hop lands after it."""
    url = f"https://ndownloader.figshare.com/files/{file_id}"
    for attempt in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": "depmap-skill"})
        try:
            with urllib.request.urlopen(req, timeout=300) as fh:
                return list(csv.DictReader(io.StringIO(fh.read().decode("utf-8"))))
        except urllib.error.HTTPError as e:
            if e.code != 403 or attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


ARTICLE = 24667905                     # DepMap 23Q4 Public
versions = get(f"{API}/{ARTICLE}/versions")
print("versions of 23Q4:", [v["version"] for v in versions])
print("bare article id resolves to version:", get(f"{API}/{ARTICLE}")["version"])

snap = {}
for v in versions:
    a = get(f"{API}/{ARTICLE}/versions/{v['version']}")
    m = next(f for f in a["files"] if f["name"] == "Model.csv")
    snap[v["version"]] = m
    print(f"  v{v['version']}  {a['published_date'][:10]}  doi {a['doi']}  "
          f"Model.csv id={m['id']} {m['size']:,} B  md5 {m['computed_md5'][:12]}")

v1 = {r["ModelID"]: r for r in fetch_csv(snap[1]["id"])}
v2 = {r["ModelID"]: r for r in fetch_csv(snap[2]["id"])}
gone = set(v1) - set(v2)
print(f"\nModel.csv  v1 {len(v1)} rows -> v2 {len(v2)} rows")
print(f"  cell lines dropped in v2 : {len(gone)}  e.g. {sorted(gone)[:3]}")
print(f"  cell lines added in v2   : {len(set(v2) - set(v1))}")
changed = [k for k in v1["ACH-000001"] if v1["ACH-000001"][k] != v2["ACH-000001"][k]]
print(f"  fields changed on ACH-000001: {changed} "
      f"{[(v1['ACH-000001'][k], v2['ACH-000001'][k]) for k in changed]}")
```

```
versions of 23Q4: [1, 2]
bare article id resolves to version: 2
  v1  2023-12-01  doi 10.25452/figshare.plus.24667905.v1  Model.csv id=43346895 582,229 B  md5 c14f90f02609
  v2  2023-12-19  doi 10.25452/figshare.plus.24667905.v2  Model.csv id=43746708 530,469 B  md5 74ca5c14f118

Model.csv  v1 2178 rows -> v2 1921 rows
  cell lines dropped in v2 : 257  e.g. ['ACH-001281', 'ACH-001293', 'ACH-001349']
  cell lines added in v2   : 0
  fields changed on ACH-000001: ['SourceDetail'] [(' ', 'ATCC')]
```

Two people who both say they used "DepMap 23Q4" can be working from cell-line tables that
differ by 257 rows. 23Q2 is worse: four versions, growing from 48 to 52 files —
`CRISPRGeneEffectUncorrected.csv`, `CRISPRInferredLibraryEffect.csv`, `CRISPRInitialOffset.csv`
and `Media.csv` all appear after v1, so code written against v4 fails on a v1 checkout with a
missing file rather than a wrong number.

**So the unit of pinning is `(article id, version)`, and what you record is the versioned
DOI** — `10.25452/figshare.plus.24667905.v2`, never `…/24667905`. Fetch through
`/articles/{id}/versions/{n}`, and take file ids from that response: file ids are per-version,
so a hardcoded id from a previous version keeps working and quietly serves the old file.

## Pin a release and write the manifest

This is the first thing to run in any DepMap analysis, and its output is what goes next to the
results:

```python
import datetime, json, urllib.request

API = "https://api.figshare.com/v2/articles"
RELEASE, ARTICLE, VERSION = "24Q4", 27993248, 1


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "depmap-skill"})
    with urllib.request.urlopen(req, timeout=90) as fh:
        return json.load(fh)


def pin(article, version):
    """Freeze a release: article, version, DOI, licence, and every file's id,
    size and md5. Everything downstream indexes into this, never into a search."""
    a = get(f"{API}/{article}/versions/{version}")
    if a["version"] != version:
        raise RuntimeError(f"asked for v{version}, got v{a['version']}")
    if a["license"]["name"] != "CC BY 4.0":
        raise RuntimeError(f"licence is {a['license']['name']}, not CC BY 4.0")
    return {
        "pinned_on": datetime.date.today().isoformat(),
        "title": a["title"],
        "article_id": article,
        "version": version,
        "doi": a["doi"],
        "published": a["published_date"][:10],
        "license": a["license"]["name"],
        "license_url": a["license"]["url"],
        "citation": a["citation"],
        "files": {f["name"]: {"id": f["id"], "bytes": f["size"],
                              "md5": f["computed_md5"],
                              "url": f"https://ndownloader.figshare.com/files/{f['id']}"}
                  for f in a["files"]},
    }


manifest = pin(ARTICLE, VERSION)
with open(f"depmap_{RELEASE}_manifest.json", "w") as fh:
    json.dump(manifest, fh, indent=2, sort_keys=True)

print(manifest["title"], "|", manifest["doi"], "|", manifest["license"])
print(f"{len(manifest['files'])} files, "
      f"{sum(f['bytes'] for f in manifest['files'].values()) / 1e9:.1f} GB total\n")
for name in ("Model.csv", "CRISPRGeneEffect.csv", "CRISPRGeneDependency.csv",
             "OmicsExpressionProteinCodingGenesTPMLogp1.csv", "OmicsSomaticMutations.csv"):
    f = manifest["files"][name]
    print(f"  {f['bytes']:>13,} B  {f['md5']}  {name}")
```

```
DepMap 24Q4 Public | 10.25452/figshare.plus.27993248.v1 | CC BY 4.0
73 files, 30.8 GB total

        645,696 B  675210d17675f3517b0ce39a3c274f16  Model.csv
    428,678,699 B  6edf7ade09b9b34199210b559d4745d3  CRISPRGeneEffect.csv
    421,115,594 B  0d3bdadf0c59264e39f7fbadf232ccdb  CRISPRGeneDependency.csv
    506,628,654 B  71794802b750ce77c422dad0720a40af  OmicsExpressionProteinCodingGenesTPMLogp1.csv
    338,945,382 B  7bdba347a1602fe96d5654a74d6e52f1  OmicsSomaticMutations.csv
```

A release is ~31 GB in total. Nobody wants all of it — the next section is about taking the
three or four files that answer the question.

## Which file answers which question

**The file names changed at 22Q4.** The gene effect matrix has been `gene_effect.csv` (18Q3),
`Achilles_gene_effect.csv` (19Q2 through 22Q2), `CRISPR_gene_effect.csv` (21Q1 through 22Q2,
alongside the Achilles one) and `CRISPRGeneEffect.csv` from 22Q4; the cell-line table was
`sample_info.csv` up to 22Q2 and `Model.csv` from 22Q4. Anything written against the old names
fails on a modern release, and — worse — a script that falls back between them can silently
read the Achilles-only `Achilles_gene_effect.csv` where it meant the integrated matrix.

**Worse still, one filename changed its meaning without changing its name.** DepMap moved from
CERES to Chronos across 21Q2 and 21Q3, and it did so by swapping which scoring the default file
held:

| release | `CRISPR_gene_effect.csv` holds | the other scoring ships as |
|---|---|---|
| 21Q1 — its first appearance | CERES | — |
| 21Q2 | **CERES** | `CRISPR_gene_effect_Chronos.csv` |
| 21Q3 | **Chronos** | `CRISPR_gene_effect_CERES.csv` |
| 21Q4 through 22Q2 | Chronos | — |

Same filename, two different algorithms, one quarter apart, and both files parse identically.
This is the single strongest argument for pinning: a cached "CRISPR_gene_effect.csv" with no
release stamped on it cannot be interpreted at all.

| Question | File (22Q4 and later) | Shape |
|---|---|---|
| How much does this line need this gene? | `CRISPRGeneEffect.csv` | model x gene, Chronos score |
| Is that a real dependency, as a probability? | `CRISPRGeneDependency.csv` | model x gene, 0–1 |
| Which genes are essential everywhere? | `CRISPRInferredCommonEssentials.csv` | one column of gene labels |
| What is this cell line? | `Model.csv` | one row per model, 47 columns, 2,105 rows |
| How much is this gene expressed? | `OmicsExpressionProteinCodingGenesTPMLogp1.csv` | model x gene, log2(TPM+1) |
| Is this gene mutated, and how? | `OmicsSomaticMutations.csv` | long, one row per variant |
| Is it amplified or deleted? | `OmicsCNGene.csv` | model x gene, relative copy number |
| Which lines were actually screened? | `CRISPRInferredModelEfficacy.csv` | one row per screened model |
| Symbol, Entrez, Ensembl, previous symbols | `Gene.csv` | HGNC dump, the join table |
| Does a drug kill this line? | *separate article* — `Repurposing Public 24Q2` | compound x model |

Two things about that table that catch people out.

**`Model.csv` is the portal's whole model catalogue, not the screened set.** 24Q4 lists 2,105
models; only 1,178 of them have a row in `CRISPRGeneEffect.csv`. Compute "fraction of cell
lines dependent on X" against `Model.csv` and the denominator is nearly double what it should
be. `CRISPRInferredModelEfficacy.csv` is the list of models the CRISPR pipeline actually
produced, and is 41 kB. `Model.csv` also carries the cross-reference keys — `RRID`
(Cellosaurus, e.g. `CVCL_0465`), `SangerModelID`, `COSMICID` and `CCLEName` — which is how a
DepMap `ACH-` id joins to anything outside DepMap.

**Drug sensitivity is not in the quarterly release.** PRISM Repurposing is its own figshare
record — `Repurposing Public 24Q2`, article `25917643` v1,
`doi:10.6084/m9.figshare.25917643.v1`, also CC BY 4.0 — and it is pinned exactly the same way.
`PortalCompounds.csv` inside the quarterly release is a compound *dictionary*
(`CompoundID`, `CompoundName`, `GeneSymbolOfTargets`, `ChEMBLID`, `PubChemCID`), not
sensitivity data.

## Reading the matrices: five traps, all silent

Every one of these produces a plausible wrong answer rather than an exception.

```python
import time, urllib.error, urllib.request

FILES = {                              # 24Q4 Public, article 27993248 v1
    "CRISPRGeneEffect.csv": 51064667,
    "CRISPRGeneDependency.csv": 51064631,
    "OmicsExpressionProteinCodingGenesTPMLogp1.csv": 51065489,
    "OmicsExpressionAllGenesTPMLogp1StrandedProfile.csv": 51065378,
    "OmicsCNGene.csv": 51065324,
    "OmicsSomaticMutations.csv": 51065732,
}
REP_MATRIX = 46630984                  # Repurposing Public 24Q2, extended primary matrix


def ranged(file_id, n, tries=4):
    """First n bytes of a figshare file, as bytes.

    HEAD is not an option here: ndownloader redirects to an S3 URL presigned for
    GET, so a HEAD gets 403. That signature also carries `X-Amz-Expires=10`, so a
    slow hop past the redirect returns a 403 too -- retry it rather than treating
    Forbidden as a permission problem. This bit me on the fourth of five sequential
    releases while writing this page."""
    url = f"https://ndownloader.figshare.com/files/{file_id}"
    for attempt in range(tries):
        req = urllib.request.Request(
            url, headers={"User-Agent": "depmap-skill", "Range": f"bytes=0-{n - 1}"})
        try:
            with urllib.request.urlopen(req, timeout=300) as fh:
                return fh.status, fh.read()
        except urllib.error.HTTPError as e:
            if e.code != 403 or attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


def peek(file_id, window=400_000, cap=8_000_000):
    """Header plus whatever follows, refusing to return a TRUNCATED header.

    This guard is the whole point. A DepMap header is not small -- 254,612 B for
    CRISPRGeneEffect and 1,325,882 B for the all-genes expression matrix -- so a
    window that cuts through it still splits cleanly on ',' and yields a plausible
    column count that is simply wrong. Grow the window until a newline appears."""
    while window <= cap:
        status, raw = ranged(file_id, window)
        if b"\n" in raw:
            head, _, rest = raw.partition(b"\n")
            return (status, window, head.decode("utf-8").split(","),
                    rest.decode("utf-8", "ignore"))
        window *= 4
    raise RuntimeError(f"file {file_id}: header longer than {cap} bytes")


for name, fid in FILES.items():
    status, window, hdr, rest = peek(fid)
    key = rest.split(",", 1)[0] if "," in rest else "(row key beyond window)"
    print(f"{name}\n   HTTP {status}  header took {window:,} B  "
          f"{len(hdr) - 1} columns after the index  header[0]={hdr[0]!r}\n"
          f"   labels {hdr[1:4]}\n   first row key {key!r}")

status, window, hdr, rest = peek(REP_MATRIX, 40_000)
print(f"\nRepurposing_Public_24Q2_Extended_Primary_Data_Matrix.csv\n"
      f"   {len(hdr) - 1} columns after the index  header[0]={hdr[0]!r}\n"
      f"   labels {hdr[1:4]}\n   first row key {rest.split(',', 1)[0]!r}")
```

```
CRISPRGeneEffect.csv
   HTTP 206  header took 400,000 B  17916 columns after the index  header[0]=''
   labels ['A1BG (1)', 'A1CF (29974)', 'A2M (2)']
   first row key 'ACH-000001'
CRISPRGeneDependency.csv
   HTTP 206  header took 400,000 B  17916 columns after the index  header[0]=''
   labels ['A1BG (1)', 'A1CF (29974)', 'A2M (2)']
   first row key 'ACH-000001'
OmicsExpressionProteinCodingGenesTPMLogp1.csv
   HTTP 206  header took 400,000 B  19193 columns after the index  header[0]=''
   labels ['TSPAN6 (7105)', 'TNMD (64102)', 'DPM1 (8813)']
   first row key 'ACH-001113'
OmicsExpressionAllGenesTPMLogp1StrandedProfile.csv
   HTTP 206  header took 1,600,000 B  49834 columns after the index  header[0]=''
   labels ['TSPAN6 (ENSG00000000003)', 'TNMD (ENSG00000000005)', 'DPM1 (ENSG00000000419)']
   first row key 'PR-AdBjpG'
OmicsCNGene.csv
   HTTP 206  header took 1,600,000 B  38590 columns after the index  header[0]=''
   labels ['RHEB (6009)', 'TIPIN (54962)', 'OR4A47 (403253)']
   first row key 'ACH-000628'
OmicsSomaticMutations.csv
   HTTP 206  header took 400,000 B  69 columns after the index  header[0]='Chrom'
   labels ['Pos', 'Ref', 'Alt']
   first row key 'chr1'

Repurposing_Public_24Q2_Extended_Primary_Data_Matrix.csv
   919 columns after the index  header[0]=''
   labels ['ACH-000001', 'ACH-000002', 'ACH-000004']
   first row key 'BRD:BRD-A00047421-001-01-7'
```

**Trap 1 — the index column has no name, and it has had four different ones.** `header[0]` is
the empty string in every 24Q4 matrix above, so `pd.read_csv(...)` yields a column called
`Unnamed: 0` and `df.columns[0]` is not `"ModelID"`. Always `index_col=0`. And do not code
against the empty name either — across the gene effect matrix alone it has been:

| release | index header | first row |
|---|---|---|
| 18Q3 (`gene_effect.csv`) | `Broad_ID` | `ACH-000007` |
| 20Q2–22Q2 (`Achilles_`/`CRISPR_gene_effect.csv`) | `DepMap_ID` | `ACH-000004` / `ACH-000001` |
| 22Q4, 23Q4, 24Q2, 24Q4 | *(empty)* | `ACH-000001` |
| 23Q2 | `ModelID` | `ACH-000001` |

Read column 0 positionally and never by name. The gene labels, by contrast, have been
`SYMBOL (entrez_id)` continuously since 18Q3.

**Trap 2 — a ranged read can truncate the header, and nothing says so.** This is why `peek`
grows its window. The header of `OmicsExpressionAllGenesTPMLogp1StrandedProfile.csv` is
**1,325,882 bytes** long; read 900 kB of it and split on `,` and you get 34,737 columns
instead of 49,834. No exception, no short-read warning — just a column count 30% too low and a
gene lookup that misses everything past the cut. The rule is to require the newline, not to
pick a bigger constant.

**Trap 3 — the matrices are not all oriented the same way.** CRISPR and Omics matrices are
model x feature. PRISM's is **feature x model** — compounds down the rows, `ACH-` ids across
the columns. Transposing on the assumption that DepMap is consistent gets you a matrix of
plausible shape and inverted meaning. Check whether `header[1]` looks like an `ACH-` id before
you decide.

**Trap 4 — the parenthetical suffix is not always an Entrez id.** `CRISPRGeneEffect.csv` uses
`A1BG (1)`; `OmicsExpressionAllGenesTPMLogp1StrandedProfile.csv`, in the same release, uses
`TSPAN6 (ENSG00000000003)`. A regex of `\((\d+)\)` returns nothing on the second, and a
`.split(" (")[0]` symbol-only key throws away the identifier that survives renaming. Parse the
suffix, keep it, and branch on whether it starts with `ENSG`.

**Trap 5 — files ending in `Profile` are keyed by `ProfileID`, not `ModelID`.** Look at the
first row keys above: the one `…Profile.csv` in that list answers `PR-AdBjpG` and every other
file answers an `ACH-` id. Join a profile-keyed file to `CRISPRGeneEffect.csv` directly and you
get an empty intersection with no error at all. `OmicsProfiles.csv` — 254 kB — carries `ProfileID,ModelCondition,ModelID,Datatype,…`
and is the map. The rule is in the filename:
`OmicsExpressionProteinCodingGenesTPMLogp1.csv` is model-keyed;
`OmicsExpressionAllGenesTPMLogp1StrandedProfile.csv` is profile-keyed — and it is also a
different gene set, 49,834 columns against 19,193, because "all genes" includes non-coding.

Two more that are not silent — they raise — but that will still stop a pipeline if nobody
planned for them.

**Rows are not sorted the same way in every file.** `CRISPRGeneEffect.csv` starts at
`ACH-000001`, `OmicsExpressionProteinCodingGenesTPMLogp1.csv` at `ACH-001113`,
`OmicsCNGene.csv` at `ACH-000628`. Never align two matrices by position.

**A `403 Forbidden` from `ndownloader.figshare.com` usually means retry, not denied.**
`ndownloader` answers `302` with an S3 URL presigned for GET and stamped
`X-Amz-Expires=10`; a hop that takes longer than that window arrives after the signature has
expired and S3 answers `403`. Nothing about the file's permissions has changed. This is why
every fetch helper here retries a 403 with backoff — it bit the loop above on the fourth of
five sequential releases while this page was being written, on a URL that had worked a minute
earlier and worked again on the retry. The same mechanism is why `HEAD` never works: a
signature issued for `GET` is not valid for `HEAD`.

## The gene set moves, and symbols move under it

The column labels are the join key for everything, so it matters that they are two identifiers
glued together and only one of them is stable. Reading just the header of five releases costs a
few hundred kilobytes each and settles which half to key on:

```python
import time, urllib.error, urllib.request

RELEASES = {"22Q4": 38357390, "23Q2": 40448555, "23Q4": 43346616,
            "24Q2": 46489063, "24Q4": 51064667}   # CRISPRGeneEffect.csv per release


def ranged(file_id, n, tries=4):
    """First n bytes, retrying the expired-signature 403 -- see the note below Trap 5."""
    url = f"https://ndownloader.figshare.com/files/{file_id}"
    for attempt in range(tries):
        req = urllib.request.Request(
            url, headers={"User-Agent": "depmap-skill", "Range": f"bytes=0-{n - 1}"})
        try:
            with urllib.request.urlopen(req, timeout=300) as fh:
                return fh.read()
        except urllib.error.HTTPError as e:
            if e.code != 403 or attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


def header(file_id, window=400_000, cap=8_000_000):
    """Header row only, and never a truncated one -- see Trap 2 above."""
    while window <= cap:
        raw = ranged(file_id, window)
        if b"\n" in raw:
            return raw.partition(b"\n")[0].decode("utf-8").split(",")
        window *= 4
    raise RuntimeError(f"file {file_id}: header longer than {cap} bytes")


def by_identifier(hdr):
    """{identifier: symbol} from 'SYMBOL (identifier)' labels. The identifier is
    what is stable across releases; the symbol is not."""
    out = {}
    for label in hdr[1:]:
        symbol, _, ident = label.rpartition(" (")
        if not ident.endswith(")"):
            raise ValueError(f"unparseable gene label {label!r}")
        out[ident[:-1]] = symbol
    return out


maps = {}
for rel, fid in RELEASES.items():
    hdr = header(fid)
    maps[rel] = by_identifier(hdr)
    print(f"{rel}: {len(hdr) - 1} gene columns, header[0]={hdr[0]!r}, "
          f"all labels parsed = {len(maps[rel]) == len(hdr) - 1}")

a, b = maps["23Q4"], maps["24Q4"]
renamed = {i: (a[i], b[i]) for i in set(a) & set(b) if a[i] != b[i]}
print(f"\n23Q4 -> 24Q4: {len(set(a) - set(b))} genes dropped, "
      f"{len(set(b) - set(a))} added, {len(renamed)} renamed under a stable id")
for i, (x, y) in sorted(renamed.items())[:4]:
    print(f"  entrez {i:>9}  {x} -> {y}")
sym_a, sym_b = set(a.values()), set(b.values())
print(f"\njoin on SYMBOL : {len(sym_a & sym_b)} genes shared")
print(f"join on ENTREZ : {len(set(a) & set(b))} genes shared "
      f"({len(set(a) & set(b)) - len(sym_a & sym_b)} more)")
```

```
22Q4: 17453 gene columns, header[0]='', all labels parsed = True
23Q2: 17931 gene columns, header[0]='ModelID', all labels parsed = True
23Q4: 18443 gene columns, header[0]='', all labels parsed = True
24Q2: 18443 gene columns, header[0]='', all labels parsed = True
24Q4: 17916 gene columns, header[0]='', all labels parsed = True

23Q4 -> 24Q4: 527 genes dropped, 0 added, 71 renamed under a stable id
  entrez 100129271  C1orf68 -> KPLCE
  entrez 100130988  SPATA48 -> SPMIP7
  entrez 100506564  THEGL -> SPMAP2L
  entrez    113746  ODF3 -> CIMAP1A

join on SYMBOL : 17845 genes shared
join on ENTREZ : 17916 genes shared (71 more)
```

The gene set is not monotone — 24Q4 has **527 fewer** genes than 24Q2, not more, and they are
ordinary genes rather than obscure ones: `ACTN3 (89)`, `ADH1C (126)` and `ALDH3B1 (221)` are
all scored in 23Q4 and absent from 24Q4. A fixed gene list carried between releases silently
loses rows, and a symbol-keyed join loses another 71 on top of that because HGNC renamed them
(`SOGA1` became `MTCL2`, `ODF3` became `CIMAP1A`) while the Entrez id stayed put.
**Key on the parenthetical identifier, carry the symbol as a label.**
`Gene.csv` in the release maps `hgnc_id, symbol, entrez_id, ensembl_gene_id, prev_symbol`
if you need to go the other way.

## What actually breaks if you do not pin

Same cell line, same gene, five releases. This is a ranged read of the header plus the first
few rows, so it costs a few MB rather than 2 GB:

```python
import time, urllib.error, urllib.request

RELEASES = {"22Q4": 38357390, "23Q2": 40448555, "23Q4": 43346616,
            "24Q2": 46489063, "24Q4": 51064667}
GENES = ["KRAS", "WRN", "BRAF", "MYC", "RPL23A"]
MODEL = "ACH-000001"                    # NIH:OVCAR-3, ovarian


def ranged(file_id, n, tries=4):
    """First n bytes, retrying the expired-signature 403 -- see the note below Trap 5."""
    url = f"https://ndownloader.figshare.com/files/{file_id}"
    for attempt in range(tries):
        req = urllib.request.Request(
            url, headers={"User-Agent": "depmap-skill", "Range": f"bytes=0-{n - 1}"})
        try:
            with urllib.request.urlopen(req, timeout=300) as fh:
                return fh.read()
        except urllib.error.HTTPError as e:
            if e.code != 403 or attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


def head_rows(file_id, n=1_800_000):
    """Header plus whatever complete rows fit in n bytes. Rows in
    CRISPRGeneEffect are ~380 kB each, so this is the first three or four."""
    lines = ranged(file_id, n).decode("utf-8").split("\n")
    hdr = lines[0].split(",")
    rows = {}
    for line in lines[1:]:
        fields = line.split(",")
        if len(fields) == len(hdr):     # drop the truncated tail row
            rows[fields[0]] = fields
    if not rows:
        # Either the window cut the header (Trap 2) or one row is bigger than it.
        raise RuntimeError(f"file {file_id}: no complete row within {n} bytes")
    return hdr, rows


print(f"{'release':8} {'models in row window':22} " + " ".join(f"{g:>8}" for g in GENES))
for rel, fid in RELEASES.items():
    hdr, rows = head_rows(fid)
    col = {label.rpartition(" (")[0]: i for i, label in enumerate(hdr)}
    row = rows.get(MODEL)
    cells = []
    for g in GENES:
        cells.append("absent" if row is None or g not in col
                     else f"{float(row[col[g]]):8.4f}")
    print(f"{rel:8} {', '.join(list(rows)[:2]) + ', …':22} " +
          " ".join(f"{c:>8}" for c in cells))
```

```
release  models in row window       KRAS      WRN     BRAF      MYC   RPL23A
22Q4     ACH-000004, ACH-000005, …   absent   absent   absent   absent   absent
23Q2     ACH-000001, ACH-000004, …  -0.3293  -0.0854  -0.3571  -0.6939  -1.8544
23Q4     ACH-000001, ACH-000004, …  -0.5009  -0.2192  -0.3866  -0.7102  -2.0001
24Q2     ACH-000001, ACH-000004, …  -0.3434  -0.0664  -0.4217  -0.7170  -1.9731
24Q4     ACH-000001, ACH-000004, …  -0.3120  -0.0649  -0.2782  -0.6735  -2.0588
```

Read that row by row. `KRAS` in NIH:OVCAR-3 goes -0.33 → **-0.50** → -0.34 → -0.31; `WRN` goes
-0.085 → **-0.219** → -0.066 → -0.065. On the Chronos scale a shift of 0.17 is a sixth of the
distance from *no effect* to *median common essential*, and 23Q4 is an outlier in both. Nothing
is broken — the 23Q4 pipeline integrated screens differently — but a threshold like
"gene effect < -0.5 is a dependency" flips `KRAS` in this line between 23Q4 and every
neighbouring quarter.

And `ACH-000001` is **absent from 22Q4's matrix altogether**, though it is listed in that
release's `CRISPRInferredModelEfficacy.csv` with a `Project-Score-KY` efficacy and no
`Achilles-Avana-2D` one: it was screened that quarter with Sanger's KY library only, and 22Q4's
`CRISPRGeneEffect.csv` — which that release's README says was integrated with Harmonia, where
24Q4's says Chronos's own batch correction — starts at `ACH-000004`. So *the release lists the
cell line* and *the matrix scores
it* are two different questions, and `CRISPRInferredModelEfficacy.csv` answers only the first.
Cell lines also leave as well as arrive: that file lists 1078 models in 22Q4, then 1095, 1100,
1150 and 1178 in 24Q4, with 3, 7, 2 and 2 models *removed* at each step.

So: state the release and the figshare version next to every dependency number, and never
compare a score computed under one release against a threshold calibrated under another.

## Gene effect is Chronos-normalised: -1 is essential, 0 is nothing

This is the interpretation error that produces a wrong biological claim rather than a crash.
The score is not a log fold change and not a p-value. Chronos scales each release so that the
median **common essential** gene sits near -1 and the median **nonessential** gene near 0, and
the release ships both control lists so you can check it:

```python
import statistics, time, urllib.error, urllib.request

CTRL_ESSENTIAL = 51063560       # AchillesCommonEssentialControls.csv, 24Q4
CTRL_NONESSENTIAL = 51063566    # AchillesNonessentialControls.csv, 24Q4
GENE_EFFECT = 51064667          # CRISPRGeneEffect.csv, 24Q4


def fetch(file_id, n=None, tries=4):
    """Whole file, or its first n bytes. Retries the expired-signature 403."""
    headers = {"User-Agent": "depmap-skill"}
    if n:
        headers["Range"] = f"bytes=0-{n - 1}"
    url = f"https://ndownloader.figshare.com/files/{file_id}"
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(
                    urllib.request.Request(url, headers=headers), timeout=300) as fh:
                return fh.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code != 403 or attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


essential = set(fetch(CTRL_ESSENTIAL).splitlines()[1:])
nonessential = set(fetch(CTRL_NONESSENTIAL).splitlines()[1:])

lines = fetch(GENE_EFFECT, 1_200_000).split("\n")
hdr = lines[0].split(",")
row = lines[1].split(",")
columns = set(hdr[1:])
scores = {hdr[i]: float(row[i]) for i in range(1, len(hdr)) if row[i] not in ("", "NA")}

# Three counts, not one. A control gene can be absent from the matrix entirely, or
# present as a column and NA for this model, and those thin the list differently.
print(f"model {row[0]}  {len(hdr) - 1} gene columns, {len(hdr) - 1 - len(scores)} NA")
for name, ctrl in (("common essentials", essential), ("nonessentials", nonessential)):
    vals = [v for label, v in scores.items() if label in ctrl]
    print(f"  {name:18}: {len(ctrl):>5} listed, {len(ctrl & columns):>5} with a column, "
          f"{len(vals):>5} scored, median {statistics.median(vals):+.4f}")
print(f"  {'all genes':18}: {len(hdr) - 1:>5} listed, {len(columns):>5} with a column, "
      f"{len(scores):>5} scored, median {statistics.median(scores.values()):+.4f}")
```

```
model ACH-000001  17916 gene columns, 582 NA
  common essentials :  1247 listed,  1242 with a column,  1238 scored, median -0.9347
  nonessentials     :   781 listed,   726 with a column,   619 scored, median +0.0120
  all genes         : 17916 listed, 17916 with a column, 17334 scored, median -0.0400
```

How to read a score:

- **≈ 0** — knocking the gene out did nothing measurable in this line.
- **≈ -1** — as damaging as the median gene every cell needs. The usual working threshold for
  "this line depends on this gene" is **-0.5**, and it is a convention, not a property of the
  data.
- **< -1** — stronger than a median essential. `RPL23A` at -2.06 above is a ribosomal protein.
- **> 0** — knockout made the line grow faster. Real, but small positive values are noise.

Three cautions the numbers above make concrete:

- **-0.93 and +0.012, not exactly -1 and 0.** Scaling is fitted across the release and then
  screen-quality corrected per model, so per-model medians land near the targets rather than on
  them. Do not assert equality; assert the sign and the rough magnitude.
- **`NA` is common and it is not zero.** 582 of 17,916 genes are blank for this model.
  `float("")` raises, `pandas` gives `NaN`, and a `fillna(0)` here converts "not measured" into
  "no effect", which is a specific, wrong biological claim.
- **The control lists are not a subset of the matrix, and two different things thin them.**
  Of the 781 nonessential controls, **726 have a column** in 24Q4 at all — 55 are simply not in
  the matrix — and of those 726 only **619 carry a non-`NA` value in this model**. The
  essential list holds up far better, 1,242 columns and 1,238 scored of 1,247. So intersect
  twice: once against the header, once against the values you actually got. Reporting "n=781
  nonessential controls" when 162 of them contributed nothing is the quiet version of this
  mistake.

For "is this a dependency" as a probability rather than a score, use `CRISPRGeneDependency.csv`
— same shape, same labels, values in 0–1 — and `CRISPRInferredCommonEssentials.csv` for the
release's own pan-essential list, which is what you subtract when hunting for a *selective*
dependency.

## Get the files

Three things land on disk: the manifest that says which release this is, the small annotation
tables, and a gene-by-gene slice of the matrix that is small enough to keep next to a
notebook.

**Step 1 — the manifest and the small files.** This reads `depmap_24Q4_manifest.json` from
*Pin a release and write the manifest* above; run that block first. All seven files are under
a megabyte:

```python
import hashlib, json, os, time, urllib.error, urllib.request

OUT = "Data/depmap/24Q4"
os.makedirs(OUT, exist_ok=True)
manifest = json.load(open("depmap_24Q4_manifest.json"))

WANTED = ["README.txt", "Model.csv", "CRISPRInferredModelEfficacy.csv",
          "CRISPRInferredCommonEssentials.csv", "AchillesCommonEssentialControls.csv",
          "AchillesNonessentialControls.csv", "OmicsProfiles.csv"]


def download(name, dest_dir, tries=4):
    """Fetch one file and verify it against the md5 recorded in the manifest.
    An unverified download is not a pinned release, it is a hopeful one.
    Retries a 403, which here means an expired redirect signature, not a refusal."""
    spec = manifest["files"][name]
    dest = os.path.join(dest_dir, name)
    for attempt in range(tries):
        req = urllib.request.Request(spec["url"], headers={"User-Agent": "depmap-skill"})
        digest = hashlib.md5()
        try:
            with urllib.request.urlopen(req, timeout=600) as fh, open(dest, "wb") as out:
                for chunk in iter(lambda: fh.read(1 << 20), b""):
                    digest.update(chunk)
                    out.write(chunk)
        except urllib.error.HTTPError as e:
            if e.code != 403 or attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)
            continue
        break
    if digest.hexdigest() != spec["md5"]:
        os.remove(dest)
        raise RuntimeError(f"{name}: md5 {digest.hexdigest()} != {spec['md5']}")
    return dest, os.path.getsize(dest)


for name in WANTED:
    dest, size = download(name, OUT)
    print(f"  {size:>9,} B  md5 ok  {dest}")

with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=2, sort_keys=True)
print(f"\npinned: {manifest['title']} v{manifest['version']}  {manifest['doi']}")
```

```
     43,103 B  md5 ok  Data/depmap/24Q4/README.txt
    645,696 B  md5 ok  Data/depmap/24Q4/Model.csv
     41,488 B  md5 ok  Data/depmap/24Q4/CRISPRInferredModelEfficacy.csv
     20,795 B  md5 ok  Data/depmap/24Q4/CRISPRInferredCommonEssentials.csv
     17,015 B  md5 ok  Data/depmap/24Q4/AchillesCommonEssentialControls.csv
     11,490 B  md5 ok  Data/depmap/24Q4/AchillesNonessentialControls.csv
    254,733 B  md5 ok  Data/depmap/24Q4/OmicsProfiles.csv

pinned: DepMap 24Q4 Public v1  10.25452/figshare.plus.27993248.v1
```

**Step 2 — the gene effect matrix, once.** 428 MB, so fetch it with `curl` where it can be
resumed, and verify the md5 from the manifest before using it:

```bash
mkdir -p Data/depmap/24Q4
curl -sSL -C - --retry 3 -o Data/depmap/24Q4/CRISPRGeneEffect.csv \
  https://ndownloader.figshare.com/files/51064667

wc -c < Data/depmap/24Q4/CRISPRGeneEffect.csv
python3 -c "
import hashlib, sys
h = hashlib.md5()
for chunk in iter(lambda: sys.stdin.buffer.read(1 << 20), b''):
    h.update(chunk)
print(h.hexdigest())
" < Data/depmap/24Q4/CRISPRGeneEffect.csv
```

```
 428678699
6edf7ade09b9b34199210b559d4745d3
```

**Step 3 — slice it without loading it.** The matrix is model x gene, so pulling a handful of
genes for every model is a single streaming pass with the row held one at a time. This never
allocates more than one row, which is what makes it work on a laptop:

```python
import csv, json, os, statistics

OUT = "Data/depmap/24Q4"
GENES = ["KRAS", "WRN", "BRAF", "MYC", "RPL23A", "SOX10", "EGFR"]

models = {r["ModelID"]: r for r in csv.DictReader(open(f"{OUT}/Model.csv"))}
common_essential = {ln.strip() for ln in
                    open(f"{OUT}/CRISPRInferredCommonEssentials.csv").readlines()[1:]}

with open(f"{OUT}/CRISPRGeneEffect.csv", newline="") as fh:
    reader = csv.reader(fh)
    header = next(reader)
    # Symbol -> column index, keeping the identifier so the slice records what it keyed on.
    label_of = {}
    for i, label in enumerate(header[1:], start=1):
        symbol, sep, ident = label.rpartition(" (")
        if not sep or not ident.endswith(")"):
            raise ValueError(f"unparseable gene label {label!r}")
        if symbol in GENES:
            label_of[symbol] = (i, ident[:-1])
    missing = [g for g in GENES if g not in label_of]
    if missing:
        raise LookupError(f"not in this release: {missing}")

    dest = f"{OUT}/gene_effect_slice.tsv"
    n_rows = 0
    with open(dest, "w", newline="") as out:
        w = csv.writer(out, delimiter="\t")
        w.writerow(["ModelID", "CellLineName", "OncotreeLineage", "OncotreePrimaryDisease",
                    "Gene", "EntrezID", "GeneEffect", "CommonEssential"])
        for row in reader:
            model = models.get(row[0], {})
            n_rows += 1
            for symbol, (i, ident) in label_of.items():
                w.writerow([row[0], model.get("CellLineName", ""),
                            model.get("OncotreeLineage", ""),
                            model.get("OncotreePrimaryDisease", ""),
                            symbol, ident, row[i],
                            f"{symbol} ({ident})" in common_essential])

print(f"matrix   : {n_rows} models x {len(header) - 1} genes")
print(f"slice    : {os.path.getsize(dest):,} B  {dest}")

# Read it back and rank lineages by KRAS dependency -- the sanity check that the
# slice is joined correctly, not just written.
rows = [r for r in csv.DictReader(open(dest), delimiter="\t")
        if r["Gene"] == "KRAS" and r["GeneEffect"] not in ("", "NA")]
by_lineage = {}
for r in rows:
    by_lineage.setdefault(r["OncotreeLineage"], []).append(float(r["GeneEffect"]))
ranked = sorted(((statistics.median(v), k, len(v))
                 for k, v in by_lineage.items() if len(v) >= 20))
print(f"\nKRAS gene effect, median by lineage (n>=20), {len(rows)} models scored")
for med, lineage, n in ranked[:4]:
    print(f"  {lineage:24} n={n:>4}  median {med:+.4f}")
print("  ...")
for med, lineage, n in ranked[-2:]:
    print(f"  {lineage:24} n={n:>4}  median {med:+.4f}")

with open(f"{OUT}/slice_provenance.json", "w") as fh:
    json.dump({"release": "DepMap 24Q4 Public", "article_id": 27993248, "version": 1,
               "doi": "10.25452/figshare.plus.27993248.v1", "license": "CC BY 4.0",
               "source_file": "CRISPRGeneEffect.csv",
               "genes": {g: label_of[g][1] for g in GENES},
               "models": n_rows, "score": "Chronos gene effect"}, fh, indent=2)
```

```
matrix   : 1178 models x 17916 genes
slice    : 732,488 B  Data/depmap/24Q4/gene_effect_slice.tsv

KRAS gene effect, median by lineage (n>=20), 1178 models scored
  Pancreas                 n=  47  median -1.7580
  Bowel                    n=  63  median -1.0111
  Biliary Tract            n=  35  median -0.5245
  Lung                     n= 126  median -0.4992
  ...
  Ovary/Fallopian Tube     n=  59  median -0.2858
  Kidney                   n=  34  median -0.2318
```

That ordering is the check. Pancreas at **-1.76** is stronger than a median common essential,
bowel at **-1.01** sits right on it, and both are the lineages where `KRAS` is recurrently
mutated — so a join that had silently misaligned models against genes would not produce this.
Run the same slice with a lineage ranking whenever you extract a gene you know something about;
it costs nothing and it catches the class of error that no assertion in the loop can see.

`slice_provenance.json` is the other half of the exercise: the TSV alone is a table of numbers
that cannot be reproduced, and the same seven genes pulled from 23Q4 would give different ones.

## Try it

A cold check that this skill still holds. Public data, no account, no key, Python standard
library only. It runs in an empty directory and finishes in under a minute.

**Data** — DepMap 24Q4 Public, figshare article `27993248` version 1,
`doi:10.25452/figshare.plus.27993248.v1`, CC BY 4.0 as stated in figshare's own article
metadata. Three files are fetched, by ranged or whole-file GET, alongside the article records
for 24Q4 and both versions of 23Q4:

    https://ndownloader.figshare.com/files/51064667   CRISPRGeneEffect.csv, first 900 kB of 428,678,699 B
    https://ndownloader.figshare.com/files/51063560   AchillesCommonEssentialControls.csv, 17,015 B
    https://ndownloader.figshare.com/files/43346895   Model.csv from 23Q4 **v1**, 582,229 B

23Q4 v1 is in there deliberately: it is the version trap, and a check that only ever reads the
current version of one release would never see it. The `depmap.org` probe is a **negative
control** rather than a dataset — it is expected to return HTML, so it is deliberately not
declared in `datasets:`, where a checker would read a live interstitial as a healthy fetch and
a fixed portal as a dead one. `api.figshare.com` is left out for a mechanical reason: it
answers `HEAD` with `400` and the same URL with `200` under `GET`, so a HEAD-first probe reads
a healthy endpoint as dead.

Last confirmed reachable 2026-08-27.

```python
import json, re, time, urllib.error, urllib.request

API = "https://api.figshare.com/v2/articles"
DL = "https://ndownloader.figshare.com/files"
UA = {"User-Agent": "depmap-skill"}


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as fh:
        return json.load(fh)


def get_bytes(url, n=None, tries=4):
    """A 403 from ndownloader means the presigned redirect expired, not denied."""
    headers = dict(UA)
    if n:
        headers["Range"] = f"bytes=0-{n - 1}"
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers),
                                        timeout=180) as fh:
                return fh.status, fh.headers.get("Content-Type", ""), fh.read()
        except urllib.error.HTTPError as e:
            if e.code != 403 or attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


# 1. INVARIANT. The portal API answers 200 with HTML, so the status code is not the
#    signal. Anything routing DepMap through depmap.org is reading a challenge page.
status, ctype, body = get_bytes("https://depmap.org/portal/api/download/files")
assert status == 200, status
assert ctype.startswith("text/html"), ctype
assert b"<title>DepMap" in body, body[:120]
print(f"portal API           : HTTP {status}, {ctype.split(';')[0]} -- not a data route")

# 2. INVARIANT. A pinned version answers with that version, under a versioned DOI,
#    and states its licence in metadata. All three, or the pin means nothing.
a = get_json(f"{API}/27993248/versions/1")
assert a["version"] == 1, a["version"]
assert a["doi"].endswith(".v1"), a["doi"]
assert a["license"]["name"] == "CC BY 4.0", a["license"]
assert a["title"] == "DepMap 24Q4 Public", a["title"]
files = {f["name"]: f for f in a["files"]}
assert {"Model.csv", "CRISPRGeneEffect.csv", "README.txt"} <= set(files), sorted(files)[:5]
print(f"pinned release       : {a['title']} v{a['version']}, {a['license']['name']}, "
      f"{len(files)} files")
print(f"                       {a['doi']}")

# 3. INVARIANT. Bare article id resolves to the LATEST version, silently. For an
#    article with one version those agree; the assertion is that the API reports a
#    version at all, so a future v2 is visible rather than assumed away.
bare = get_json(f"{API}/27993248")
print(f"bare id resolves to  : v{bare['version']} "
      f"({'same' if bare['version'] == 1 else 'DIFFERENT -- repin'} as the pin above)")

# 4. INVARIANT. Gene labels carry an identifier in parentheses, and the index column
#    is read positionally because its header is blank in most releases and 'ModelID'
#    in 23Q2. First row key is an ACH- model id: the matrix is model x gene.
_, _, raw = get_bytes(f"{DL}/{files['CRISPRGeneEffect.csv']['id']}", 900_000)
lines = raw.decode("utf-8").split("\n")
header, first = lines[0].split(","), lines[1].split(",")
# A short window cuts the header mid-row and everything below still "works".
assert len(first) == len(header), (len(first), len(header))
assert header[0] in ("", "ModelID"), repr(header[0])
assert re.fullmatch(r"ACH-\d{6}", first[0]), first[0]
labelled = [g for g in header[1:] if re.fullmatch(r".+ \((\d+|ENSG\d+)\)", g)]
assert len(labelled) == len(header) - 1, len(header) - 1 - len(labelled)
print(f"gene effect matrix   : {len(header) - 1} gene columns, index header "
      f"{header[0]!r}, first row {first[0]}")
print(f"                       labels e.g. {header[1]!r}, {header[2]!r}")

# 5. OBSERVED, 24Q4 v1. Chronos scaling: common essentials near -1, nonessentials
#    near 0. The SIGN and rough magnitude are the invariant; the exact figures move.
ess = get_bytes(f"{DL}/{files['AchillesCommonEssentialControls.csv']['id']}")[2]
ess = set(ess.decode("utf-8").splitlines()[1:])
scored = {header[i]: float(first[i]) for i in range(1, len(header))
          if first[i] not in ("", "NA")}
hits = sorted(v for label, v in scored.items() if label in ess)
median = hits[len(hits) // 2]
assert -1.3 < median < -0.6, median
assert len(scored) < len(header) - 1, "no NA at all -- unexpected"
print(f"chronos scale        : {first[0]} median over {len(hits)} common essentials "
      f"= {median:+.4f}, {len(header) - 1 - len(scored)} NA")

# 6. INVARIANT. A release name is not a pin: 23Q4 has two versions whose Model.csv
#    differ. If this ever stops holding, the version trap has been fixed upstream.
v1 = get_json(f"{API}/24667905/versions/1")
v2 = get_json(f"{API}/24667905/versions/2")
m1 = next(f for f in v1["files"] if f["name"] == "Model.csv")
m2 = next(f for f in v2["files"] if f["name"] == "Model.csv")
assert m1["computed_md5"] != m2["computed_md5"], "23Q4 v1 and v2 Model.csv now agree"
rows1 = get_bytes(f"{DL}/{m1['id']}")[2].decode("utf-8").splitlines()
print(f"23Q4 same name       : v1 Model.csv {m1['size']:,} B / {len(rows1) - 1} rows, "
      f"v2 {m2['size']:,} B -- {m2['size'] - m1['size']:+,} B")
```

**Expect.** Invariants first — a failure in any of these means the skill is wrong, not that
upstream moved:

- The portal API returns **HTTP 200 with `text/html`** and a `<title>DepMap …` page. If this
  ever returns JSON, the interstitial is gone and the skill's opening claim needs rewriting;
  it is still not a reason to route through it.
- `/articles/27993248/versions/1` returns `version: 1` and a DOI ending `.v1`. A pin that
  answers with a different version is not a pin.
- The licence in article metadata is **CC BY 4.0**. This gates redistribution, so it is
  asserted rather than assumed.
- Every gene column matches `SYMBOL (identifier)` where the identifier is all digits or an
  `ENSG…` accession — 17,916 of 17,916 in 24Q4. The index header is `''` or `ModelID` and the
  first row key matches `ACH-\d{6}`.
- 23Q4 v1 and v2 `Model.csv` have **different md5s**. That is the version trap; if it stops
  holding, this section's premise has changed.

Observed values, DepMap 24Q4 Public v1, read 2026-08-27 — a mismatch here is drift to
investigate, not a bug:

```
portal API           : HTTP 200, text/html -- not a data route
pinned release       : DepMap 24Q4 Public v1, CC BY 4.0, 73 files
                       10.25452/figshare.plus.27993248.v1
bare id resolves to  : v1 (same as the pin above)
gene effect matrix   : 17916 gene columns, index header '', first row ACH-000001
                       labels e.g. 'A1BG (1)', 'A1CF (29974)'
chronos scale        : ACH-000001 median over 1238 common essentials = -0.9335, 582 NA
23Q4 same name       : v1 Model.csv 582,229 B / 2178 rows, v2 530,469 B -- -51,760 B
```

## Citing it

A DepMap number in a figure needs three things beside it, and a bare release name is none of
them: the **release title**, the **versioned DOI**, and the **file it came from**. figshare
composes the first two — `get_json(f"{API}/27993248/versions/1")["citation"]` returns
*DepMap, Broad (2024). DepMap 24Q4 Public. Figshare+. Dataset.
https://doi.org/10.25452/figshare.plus.27993248.v1* — and the manifest written above carries
the third, with the md5 that proves which bytes were read.

Cite the method behind the score too, and pick it by release rather than by habit: **Chronos**
for 21Q3 onward, **CERES** for 21Q1 and earlier, and for 21Q2 whichever of the two files you
actually opened.
