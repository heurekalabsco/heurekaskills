---
name: geo
description: Find, triage and download public gene expression datasets from NCBI GEO — search series by tissue, disease, organism, assay and file type through E-utilities, read the esummary triage fields before transferring anything, then pull the counts matrices from all three places GEO keeps them — suppl/, the per-platform series matrix, and the per-sample directories.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [geo, rna-seq, transcriptomics, public-data, entrez]
covers: [geo, gse, gsm, gds, gpl, rna-seq, microarray, scRNA-seq, spatial transcriptomics, expression, transcriptomics, counts matrix, series matrix, superseries, multi-platform, soft, aging, senescence, skeletal muscle, liver, brain, heart, kidney, blood, pbmc, lung, cancer, human, mouse, e-utilities]
papers: [PMID:11752295, PMID:23193258, PMID:27008011, PMID:17496320, PMID:36516485, PMID:31862890]
access: [open]
datasets: [https://ftp.ncbi.nlm.nih.gov/geo/series/GSE263nnn/GSE263566/suppl/GSE263566_ageingRNAcounts.csv.gz, https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE263566&targ=self&form=text&view=brief, https://ftp.ncbi.nlm.nih.gov/geo/series/GSEnnn/GSE935/matrix/GSE935_series_matrix.txt.gz, https://ftp.ncbi.nlm.nih.gov/geo/series/GSE3nnn/GSE3353/matrix/GSE3353-GPL180_series_matrix.txt.gz, https://ftp.ncbi.nlm.nih.gov/geo/series/GSE276nnn/GSE276743/suppl/GSE276743_counts_1st.csv.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-18
  against: NCBI E-utilities JSON 0.3 / db=gds build 2026-08-16 / acc.cgi + ftp.ncbi.nlm.nih.gov 2026-08-18 / Python 3.12.8 / pandas 2.3.2 / curl 8.7.1
  executed: 15
  unverified: 0
---
# NCBI Gene Expression Omnibus

GEO is the default answer to *is there public expression data for this question*. It holds
**293,451 series** across **8,675,904 samples** (counted 2026-08-17), from the earliest
two-colour arrays to last month's spatial transcriptomics, and nearly all of it is one HTTPS
request away with no account, no key and no licence to accept — it is a US Government work in
the public domain.

The hard part is not access. It is that a naive query returns twenty records out of four hundred
thousand and looks like it worked, and that the identifier the search hands back is not the
identifier the download needs. This skill is organised around the order that avoids both:

**find → triage → enumerate → download.** The triage step does real work. `esummary` tells you
how many samples a series has, in which organism, and *what file types it carries* — so the
series whose only deposit is a 3.8 GB fragments file, or a 224 MB tar you cannot see inside, is
rejected before a byte of it moves.

## The four record types, and which one you want

| type | is | typical count |
|---|---|---|
| **GSE** — Series | one submission — the experiment, its samples, its processed files | 293,451 |
| **GSM** — Sample | one assayed sample inside a series | 8,675,904 |
| **GPL** — Platform | the array or sequencer definition | 28,794 |
| **GDS** — DataSet | a legacy *curated* re-packaging of one series, value-normalised | 4,348 |

Counts from `esearch` on 2026-08-17. **You almost always want GSE.** GDS curation has stopped:
4,346 of the 4,348 GDS records are `Expression profiling by array`, none is high-throughput
sequencing, and only **two** carry a publication date after 2016. The next section shows the
other reason to care, which is that GDS identifiers behave differently in a way that breaks code
written against GSE alone.

All four live in one Entrez database, `db=gds`, which is the naming trap you meet first: the
database is called `gds` and mostly contains GSE records.

## Before the first loop — rate limits

NCBI allows **3 requests per second** from an unkeyed client and **10** with a free API key
(obtainable from an NCBI account, in the account settings). This is not advisory. Twelve
concurrent unkeyed `esearch` calls, fired 2026-08-17, returned **HTTP 429 for seven of them**,
each carrying `Retry-After: 2`.

An agent that loops over a hundred accessions without a throttle will get most of them
rejected, and if it retries blindly it will make that worse. Put the interval and the
`Retry-After` handling in the client before writing the loop, not after the first failure.

Set `NCBI_API_KEY` in the environment if you have one; everything below works without it, just
three times slower. Set `NCBI_EMAIL` too — NCBI asks callers to identify themselves so it can
contact you before throttling rather than after, and the client below sends it when present.

## Find

One `esearch` call. **It returns UIDs, not accessions.**

```bash
curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gds&term=GSE263566%5BACCN%5D+AND+gse%5BETYP%5D&retmode=json&retmax=20"
```

The response is one line of JSON; the three fields that matter:

```
"count": "1"
"idlist": ["200263566"]
"querytranslation": "GSE263566[ACCN] AND gse[ETYP]"
```

`200263566` is the UID. The accession is `GSE263566`. Nothing downstream of the search accepts
the UID, and nothing in GEO's file tree is named after it.

Three things in that one-line query are load-bearing.

**`retmax` defaults to 20.** `cancer[DESC] AND gsm[ETYP]` reports a `count` of **456,843** and
returns **20** IDs when `retmax` is left off, and the response looks completely successful.
Always set it, and assert `len(idlist) == int(count)` when you believe you got everything.

**`gse[ETYP]` is not optional when you search by accession.** `GSE263566[ACCN]` on its own
matches **18** records — the series plus its 16 samples plus its platform, because every child
record carries the parent accession in its indexed fields. Eleven accessions searched together
without the filter returned **605** hits; with `AND gse[ETYP]` they returned **11**.

**An unknown field tag is silently dropped, not rejected.** This is the worst of the three
because nothing anywhere reports it:

```bash
E=https://eutils.ncbi.nlm.nih.gov/entrez/eutils
for TAG in TITL BOGUS; do
  curl -s "$E/esearch.fcgi?db=gds&retmode=json&term=aging%5B$TAG%5D+AND+gse%5BETYP%5D" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["esearchresult"]; print(r["count"], "hits |", r["querytranslation"])'
  sleep 0.4
done
```

```
1883 hits | aging[TITL] AND gse[ETYP]
8511 hits | ("aging"[MeSH Terms] OR aging[All Fields]) AND gse[ETYP]
```

`[BOGUS]` did not error. Entrez discarded the tag, expanded the bare word across every field,
and returned a **4.5× broader** result set with an empty `errorlist`. The defence is to read
`querytranslation` back and assert your tags survived it. A real tag with a value that matches
nothing behaves differently and more honestly — `aging[Organism]` returns count 0 with
`errorlist.phrasesnotfound: ["aging[Organism]"]`, so check that key too before concluding the
data does not exist.

### The field tags worth knowing

Read off `einfo.fcgi?db=gds` — that is the authoritative list, and it is short enough to keep
here:

| tag | field | use it for |
|---|---|---|
| `[ACCN]` | GEO Accession | a known GSE/GSM/GPL/GDS |
| `[TITL]` | Title | words in the series title — the tightest filter there is |
| `[DESC]` | Description | title plus summary plus similar free text |
| `[ORGN]` | Organism | `"Homo sapiens"[ORGN]`, exploded through the taxonomy |
| `[ETYP]` | Entry Type | `gse`, `gsm`, `gpl`, `gds` |
| `[GTYP]` | DataSet Type | `"expression profiling by high throughput sequencing"[GTYP]` |
| `[PTYP]` | Platform Technology Type | the platform's technology class — 17 values exist |
| `[SFIL]` | Supplementary Files | **the file type**, e.g. `mtx[SFIL]` |
| `[NSAM]` | Number of Samples | ranges — `20:200[NSAM]` |
| `[SRC]` | Sample Source | the tissue as the submitter wrote it |
| `[ATTR]` / `[ATNM]` | Attribute / Attribute Name | sample attribute values and their keys, as submitted |
| `[AUTH]` | Author | a lab's submissions |
| `[PDAT]` / `[UDAT]` | Publication / Update Date | `2018/01/01:2026/12/31[PDAT]` |

`[SFIL]` is the one people miss. It pushes modality filtering into the query rather than into a
triage loop. Counted against `gse[ETYP]` on 2026-08-17: `cel[SFIL]` 36,965 series with raw
Affymetrix, `bw[SFIL]` 19,680 with coverage tracks, `mtx[SFIL]` 13,542 with 10x-style sparse
matrices, `h5[SFIL]` 4,702, `narrowpeak[SFIL]` 4,673. The vocabulary is the same uppercase
tokens `esummary` reports in `suppfile`.

### A throttled client

Every block below uses this. It handles the interval, the `Retry-After`, and one more thing —
an E-utilities error can arrive as **HTTP 200 with a differently shaped envelope**:

```python
import json, os, time, urllib.error, urllib.parse, urllib.request

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
API_KEY = os.environ.get("NCBI_API_KEY")          # optional; raises 3/s to 10/s
EMAIL = os.environ.get("NCBI_EMAIL")              # NCBI asks for a contact address
MIN_INTERVAL = 0.11 if API_KEY else 0.34          # seconds between requests
_last = [0.0]


def eutils(endpoint, **params):
    """One E-utilities call, throttled, with Retry-After honoured on 429."""
    params.setdefault("retmode", "json")
    params.setdefault("tool", "geo-skill")
    if EMAIL:
        params.setdefault("email", EMAIL)
    if API_KEY:
        params["api_key"] = API_KEY
    url = f"{EUTILS}/{endpoint}.fcgi?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        wait = MIN_INTERVAL - (time.monotonic() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                body = json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503):
                time.sleep(float(e.headers.get("Retry-After") or 2 ** attempt))
                continue
            raise
        # A 200 can still carry an error, in a DIFFERENTLY SHAPED envelope.
        if "eutilsresult" in body:
            raise RuntimeError(body["eutilsresult"].get("ERROR", body["eutilsresult"]))
        return body
    raise RuntimeError(f"{endpoint} still failing after 5 attempts")


print(eutils("einfo", db="gds")["einforesult"]["dbinfo"][0]["count"], "records in db=gds")
```

```
9002767 records in db=gds
```

That `eutilsresult` branch is a real response, not defensive padding. `"Homo sapiens"[ORGN]`
matches 4,690,944 records; asking for them with `retmax=99999999` returns **HTTP 200** and this
body, wrapped here:

```
{ "header":{"type":"eutils", "version" : "0.3"}, "eutilsresult" : {"ERROR":
"Input XML size is 93810383 bytes, and cannot be transformed to JSON. the max size is 10MB"} }
```

Code reaching straight for `["esearchresult"]` raises `KeyError`; code using `.get()` reads zero
results and reports that nothing matched — a silent empty answer to a query with four million
hits. The same query at `retmax=100000` succeeds and returns 100,000 IDs, so the ceiling is the
JSON envelope rather than `retmax` itself. Above that, page with `retstart` or use the history
server described below.

Now the search itself, with the translation checked:

```python
QUERY = ('("skeletal muscle"[SRC] OR muscle[TITL]) AND (aging[TITL] OR ageing[TITL]) '
         'AND "Homo sapiens"[ORGN] AND gse[ETYP] '
         'AND "expression profiling by high throughput sequencing"[GTYP] '
         'AND 2018/01/01:2026/12/31[PDAT]')

res = eutils("esearch", db="gds", term=QUERY, retmax=500)["esearchresult"]
ids = res["idlist"]

# An unknown field tag is DROPPED, not rejected. Read the translation back.
for tag in ("[SRC]", "[TITL]", "[ORGN]", "[ETYP]", "[GTYP]", "[PDAT]"):
    assert tag in res["querytranslation"], f"{tag} was rewritten: {res['querytranslation']}"
assert int(res["count"]) == len(ids), f"truncated: {res['count']} hits, {len(ids)} ids"
print(f"{res['count']} hits, {len(ids)} ids, first: {ids[:3]}")
```

```
19 hits, 19 ids, first: ['200330697', '200277861', '200268953']
```

Spelling matters more than it should. `aging[TITL]` and `ageing[TITL]` are different terms and
GEO submitters use both, so the `OR` is not decoration. The same goes for `scRNA-seq` /
`single cell` / `single-cell`, and for tissue names that submitters type freely into `[SRC]`.
Search broadly on synonyms, then narrow in triage where the metadata is structured.

## Triage — this is where the decision gets made

`esummary` on the UIDs returns everything needed to accept or reject a series without touching
its data. The fields that matter:

| field | is |
|---|---|
| `accession` | **the real accession** — read it, never compute it |
| `entrytype` | `GSE` / `GSM` / `GPL` / `GDS` |
| `gse` | the series number this record belongs to — the key to deduplicate on |
| `taxon` | organism, as a string, sometimes several separated by `; ` |
| `n_samples` | sample count — but see the warning below |
| `suppfile` | **the file TYPES this record carries**, comma-separated |
| `gdstype` | assay description, e.g. `Expression profiling by high throughput sequencing` |
| `pdat` / `gpl` | publication date, platform number |
| `pubmedids` | the papers, when the submitter linked them |
| `ftplink` | the record's FTP directory — `ftp://`, which you should not use as given |
| `samples` | the full per-sample list; large, and usually not what you want here |

`suppfile` is the field that makes this a discovery step rather than a fetch wrapper. `CSV` and
`TSV` mean somebody deposited a gene-by-sample matrix you can open immediately. `MTX` means a
sparse single-cell triple. `CEL` means raw Affymetrix needing normalisation. `TAR` on its own
means the contents are opaque until you look inside. `H5, JSON, TIFF` means imaging or spatial
output. Filter on it and you stop downloading the wrong modality.

### Never derive the accession by arithmetic

For GSE records the UID happens to be `200000000 + n`, and that regularity is a trap. **GDS
records break it.** From a live `esummary` on two UIDs:

```bash
curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gds&id=200263566,5435&retmode=json" \
| python3 -c '
import json,sys
r=json.load(sys.stdin)["result"]
for u in r["uids"]:
    d=r[u]
    print(u, d["accession"], d["entrytype"], "gse="+d["gse"],
          "n="+str(d["n_samples"]), "suppfile="+repr(d["suppfile"]))
'
```

```
200263566 GSE263566 GSE gse=263566 n=16 suppfile='CSV'
5435 GDS5435 GDS gse=54723 n=14 suppfile=''
```

Curated GDS records have **short UIDs** — `5435` is `GDS5435`, and `5435 - 200000000` is a
negative number. Worse, a GDS record's `gse` field points at a **different** accession:
`GDS5435` is a curation of `GSE54723`, not of anything numbered 5435. And two GDS records can
curate one series — UIDs `5020` and `5019` are both `gse` `46600`, i.e. both derived from
GSE46600. So read `accession` from `esummary`, and deduplicate on `gse` whenever a query might
mix entry types.

A GDS accession also does not survive the *next* step. `acc.cgi` — the SOFT endpoint everything
below is built on — redirects every GDS to the interactive GDS browser and returns no SOFT at
all, so `soft("GDS5435")` fails on a perfectly valid accession. GDS records are served from a
different tree: `https://ftp.ncbi.nlm.nih.gov/geo/datasets/GDS5nnn/GDS5435/soft/GDS5435_full.soft.gz`,
whose `!dataset_sample_count = 14` agrees with the `n_samples` above. Either follow the `gse`
field to the underlying series, which is usually what you want, or fetch that file directly.

### Two more fields that lie if you read them carelessly

**`n_samples` means something different per `entrytype`.** On a GSE it is the sample count; on a
GPL it is *how many samples in all of GEO used that platform* — `GPL24676` reports 1,146,310.
Mixing entry types into one triage table and sorting by `n_samples` puts platforms at the top.

**An empty `suppfile` does not mean the series has no data — and it does not even mean the
series has no supplementary files.** Three different situations produce `suppfile: ""`, and only
one of them is "nothing here":

- **A SuperSeries.** `GSE111017` reports `n_samples: 119` and `suppfile: ""` because its files
  live on its three SubSeries. Catch it from the record's relations — `SuperSeries of:
  GSE111006` — and recurse into the children. Its declared 119 *is* the union of the children's
  40 + 39 + 40; the same held for every SuperSeries tested, up to `GSE241776`'s 7,968 = 7,899 +
  69.
- **An array series whose values are in the series matrix.** `GSE935` reports `suppfile: ""` and
  is not a SuperSeries, and its 12,557 × 63 value matrix is sitting in `matrix/`.
  **How common depends entirely on age, and that is the useful fact.** Sampling
  `"expression profiling by array"[GTYP] AND gse[ETYP]` (69,850 series) on 2026-08-19: a
  uniform random 400 gave 27 empty `suppfile` (**6.8%**), but the same query's *oldest* 200
  UIDs gave **189 of 200 (94.5%)** and its newest 200 gave 3 (1.5%). Do not sample
  `esearch`'s idlist head or tail and call it a rate — it is returned UID-descending, which
  is how an earlier draft of this page reported 24.5%. Nearly every empty-`suppfile` series
  has a matrix; `GSE25410` is the exception I found, and it is a SuperSeries whose `matrix/`
  answers 200 with nothing in it. See "Three storage layouts" below.
- **A series that does have `suppl/` files anyway.** `GSE60789` and `GSE57958` both report
  `suppfile: ""` and both publish a `GSE…_RAW.tar`, and so do a minority of empty-`suppfile` series generally. `suppfile` is
  a triage hint, not an inventory — the SOFT record's `!Series_supplementary_file` lines are the
  authority.

Rejecting on "no supplementary files" therefore throws away whole studies. The filter in the
triage block above is a *shortlist* heuristic; before concluding a series has no usable data,
read its SOFT record and list its `matrix/` directory.

```python
TRIAGE = ("accession", "entrytype", "taxon", "n_samples", "suppfile", "gdstype", "pdat")


def triage(uids, chunk=200):
    rows = []
    for i in range(0, len(uids), chunk):
        result = eutils("esummary", db="gds", id=",".join(uids[i:i + chunk]))["result"]
        for u in result["uids"]:
            d = result[u]
            row = {k: d.get(k) for k in TRIAGE}
            row["uid"] = u
            row["gse"] = d.get("gse")             # GDS records point at a DIFFERENT series
            row["title"] = d.get("title", "")
            row["pubmedids"] = d.get("pubmedids", [])
            row["files"] = [s.strip() for s in (d.get("suppfile") or "").split(",") if s.strip()]
            rows.append(row)
    return rows


rows = triage(ids)
seen, uniq = set(), []
for r in sorted(rows, key=lambda r: r["pdat"], reverse=True):
    if r["gse"] in seen:                          # two GDS can share one series
        continue
    seen.add(r["gse"])
    uniq.append(r)

wanted = {"CSV", "TSV", "TXT", "MTX", "H5"}
keep = [r for r in uniq if wanted & set(r["files"]) and (r["n_samples"] or 0) >= 10]
print(f"{len(rows)} records -> {len(uniq)} distinct series -> {len(keep)} with a usable matrix")
for r in keep[:12]:
    print(f"  {r['accession']:<11} {r['n_samples']:>4}  {','.join(r['files']):<18} "
          f"{r['pdat']}  {r['title'][:52]}")
```

```
19 records -> 19 distinct series -> 16 with a usable matrix
  GSE330697     93  TSV                2026/06/16  Delayed molecular aging, preservation of energy meta
  GSE277861     68  CSV                2025/07/25  Enalapril mitigates senescence and aging-related phe
  GSE268953     20  MTX,TSV            2025/05/09  Cellular senescence in skeletal muscle aging: new me
  GSE257558     11  CSV                2024/10/09  Healthy aging of skeletal muscle: Insights from a co
  GSE174106     72  TXT                2024/05/02  Biological Aging of Human Skeletal Muscle
  GSE249561     20  TXT                2024/05/01  Histone Lactylation Antagonizes Senescence and Skele
  GSE226008     72  BW,MTX,NARROWPEAK,TSV,TXT 2024/05/01  Histone Lactylation Antagonizes Senescence and Skele
  GSE226005     12  TXT                2024/05/01  Histone Lactylation Antagonizes Senescence and Skele
  GSE242202     59  TXT                2024/01/29  Age-related changes in human skeletal muscle transcr
  GSE196554     12  MTX,TSV            2023/05/24  Single cell RNA sequencing of human muscle stem cell
  GSE175495     46  TXT,XLSX           2021/05/26  Divergent immunometabolic changes in adipose tissue 
  GSE152558     10  CSV                2021/03/08  Ribosome profiling analysis of aging human skeletal 
```

That is one search and one summary call — two HTTP requests — producing a shortlist with sample
counts, modalities and dates. Do this before any download, every time.

Note `GSE226005`, `GSE226008` and `GSE249561` sharing a title: one study split across
SubSeries. Titles repeat, and near-duplicate rows in a shortlist usually mean a SuperSeries
family rather than three independent studies.

## Result sets too large to page by hand

Above a few thousand hits, stop passing ID lists around. `usehistory=y` parks the result on
NCBI's server and hands back a `WebEnv` and a `query_key` that `esummary` reads directly:

```python
h = eutils("esearch", db="gds", term='aging[TITL] AND gse[ETYP]',
           usehistory="y", retmax=0)["esearchresult"]
print("count", h["count"], "| query_key", h["querykey"])
page = eutils("esummary", db="gds", WebEnv=h["webenv"], query_key=h["querykey"],
              retstart=100, retmax=5)["result"]
print("records 101-105:", [page[u]["accession"] for u in page["uids"]])
```

```
count 1883 | query_key 1
records 101-105: ['GSE290999', 'GSE273166', 'GSE318189', 'GSE315907', 'GSE314411']
```

Note the capitalisation: `WebEnv` and `query_key` going in, `webenv` and `querykey` coming
back in the JSON. A history token is short-lived, so page through it promptly rather than
storing it.

## Enumerate the files

The advertised path is `ftplink`, and there are two reasons not to use it as handed to you.

**The scheme.** `ftplink` is `ftp://ftp.ncbi.nlm.nih.gov/geo/series/GSE263nnn/GSE263566/`. Many
corporate and campus networks block FTP outright and several HTTP clients never implemented the
scheme, so a working script fails on somebody else's laptop for reasons unrelated to GEO. The
identical tree is served over HTTPS — swap `ftp://ftp.ncbi.nlm.nih.gov/` for
`https://ftp.ncbi.nlm.nih.gov/` and everything below works unchanged.

**The listing.** For `suppl/`, do not scrape the directory index — the record's own SOFT
metadata is authoritative, gives exact URLs and works for every storage layout. (`matrix/` is
the one exception, because no SOFT record points at it; that is the next section.)

**And read the body before trusting it.** `acc.cgi` answers **HTTP 200 with an HTML page** on
every failure, silently ignoring `form=text`. Three distinct failures arrive that way and they
mean different things:

| body contains | means |
|---|---|
| `Could not find a public or private accession "…"` | no such accession — **or** it exists and is still private. GEO gives one message for both |
| `Accession "…" was deleted by the GEO staff on <date>` | **withdrawn.** The record existed, was public, and was retracted |
| a redirect to `GDSbrowser` | a valid GDS accession that this endpoint does not serve |

A withdrawn accession is not a typo, and code that reports "check the accession" for
`GSE100030` — deleted 16 Feb 2018 — hides the one fact the reader needs. Entrez cannot tell you
either: `GSE100030[ACCN]` returns `count: 0` with `phrasesnotfound`, exactly as a nonexistent
accession does.

```python
import re, urllib.parse, urllib.request

ACC_CGI = "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi"
FTP = "https://ftp.ncbi.nlm.nih.gov/geo"


def geo_dir(acc):
    """The FTP directory for any accession. The bucket is the accession with its last
    three digits replaced by 'nnn' — for three digits or fewer that leaves 'GSEnnn',
    which is where GSE1 actually lives."""
    kind, n = acc[:3], acc[3:]
    tree = {"GSE": "series", "GSM": "samples", "GPL": "platforms", "GDS": "datasets"}[kind]
    return f"{FTP}/{tree}/{kind}{n[:-3]}nnn/{acc}"


def soft_text(acc, targ="self", timeout=180):
    """A record's SOFT metadata as text. targ='self' is the record itself, 'gsm' adds
    every sample. Do NOT use 'gpl' or 'all' casually — see below."""
    url = f"{ACC_CGI}?" + urllib.parse.urlencode(
        {"acc": acc, "targ": targ, "form": "text", "view": "brief"})
    with urllib.request.urlopen(url, timeout=timeout) as r:
        text = r.read().decode("utf-8", "replace")
    if text.lstrip().startswith("^"):
        return text
    flat = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text))    # HTTP 200 + HTML = error
    gone = re.search(r'Accession "[^"]+" was deleted by the GEO staff on [^.]*\.', flat)
    if gone:
        raise LookupError(f"{acc} WITHDRAWN — {gone.group(0)}")
    if "GDSbrowser" in text:
        raise LookupError(f"{acc}: acc.cgi does not serve GDS records. "
                          f"Use {geo_dir(acc)}/soft/{acc}_full.soft.gz")
    if "Could not find a public or private accession" in flat:
        raise LookupError(f"{acc}: no such accession — it does not exist, or it is "
                          f"still private (GEO gives one message for both)")
    raise LookupError(f"{acc}: acc.cgi returned HTML, not SOFT — {flat[-160:]}")


def soft(acc, targ="self", timeout=180):
    """SOFT fields as {key: [values]}."""
    fields = {}
    for line in soft_text(acc, targ, timeout).splitlines():
        if line.startswith("!") and " = " in line:
            k, v = line[1:].split(" = ", 1)
            fields.setdefault(k, []).append(v)
    if not fields:
        raise LookupError(f"{acc}: SOFT record carried no ! fields")
    return fields


def as_https(url):
    """GEO advertises ftp:// URLs. The identical tree is served over HTTPS, which
    works on networks that block FTP and in clients that never implemented it."""
    return url.replace("ftp://ftp.ncbi.nlm.nih.gov/", "https://ftp.ncbi.nlm.nih.gov/", 1)


for acc in ("GSE263566", "GSE285014", "GSE111017"):
    f = soft(acc)
    files = [as_https(u) for u in f.get("Series_supplementary_file", [])]
    supers = [r.split(": ", 1)[1] for r in f.get("Series_relation", [])
              if r.startswith("SuperSeries of")]
    print(f"{acc}  samples={len(f.get('Series_sample_id', []))}  files={len(files)}"
          f"{'  SuperSeries of ' + ', '.join(supers) if supers else ''}")
    for u in files:
        print("   ", u)
```

```
GSE263566  samples=16  files=1
    https://ftp.ncbi.nlm.nih.gov/geo/series/GSE263nnn/GSE263566/suppl/GSE263566_ageingRNAcounts.csv.gz
GSE285014  samples=3  files=1
    https://ftp.ncbi.nlm.nih.gov/geo/series/GSE285nnn/GSE285014/suppl/GSE285014_RAW.tar
GSE111017  samples=119  files=0  SuperSeries of GSE111006, GSE111010, GSE111016
```

The SOFT record is also where the useful relations live — `SuperSeries of`, `SubSeries of`,
`BioProject`, `SRA` — and where the platform ID and series type are stated unambiguously.

**`targ` decides how much you are asking for, and two of its values are traps.** Measured on
`GSE263566`, 2026-08-17: `targ=self` returned 3,729 bytes in 1 second, `targ=gsm` 66,229 bytes
in 3 seconds, and **`targ=gpl` 39,899,668 bytes in 92 seconds** — because it appends the whole
probe/annotation table of the platform, here `GPL24676`. `targ=all` is `gpl` plus everything
else and did not finish within five minutes. Use `self` for triage and `gsm` for sample
metadata; reach for the platform table deliberately, with a long timeout, and never inside a
loop over accessions.

### Three storage layouts, and code must handle all three

- **Loose files in `suppl/`.** `GSE263566` exposes one `.csv.gz`; `GSE276743` exposes three
  (`GSE276743_counts_1st.csv.gz`, `..._counts_2nd.csv.gz`, `..._filtered_variant.vcf.gz`). Each
  is individually addressable, so fetch only what you need — but fetch **all** of them, because
  a series' matrix is routinely split across several.
- **A single archive in `suppl/`.** `GSE285014` exposes `GSE285014_RAW.tar` — 224,337,920 bytes,
  with a `barcodes.tsv.gz` / `features.tsv.gz` / `matrix.mtx.gz` triple per sample inside, each
  member prefixed with its GSM accession. You do **not** have to take the whole tar to get one
  sample: every member is also published under the sample's own directory, and the GSM's SOFT
  record names it — `!Sample_supplementary_file_3 = ftp://ftp.ncbi.nlm.nih.gov/geo/samples/
  GSM8695nnn/GSM8695035/suppl/GSM8695035_SD-4_matrix.mtx.gz`, 71,431,236 bytes, HTTP 200. For a
  three-sample series that is a third of the transfer; for a 500-sample tar it is the difference
  between usable and not.
- **`matrix/`, which is where array values actually live.** This is the layout the other two
  hide. See below — it is the single most common way to conclude, wrongly, that a series has no
  data.

`suppl/filelist.txt` describes the contents of the archive layout and **exists only for it**.
Verified 2026-08-17: present for `GSE271676` (13,799 B) and `GSE285014` (721 B), honest **404**
for `GSE263566` and `GSE276743`. Treat that 404 as the normal loose-file case, not an error.

It is worth reading before you commit to a download, because it is a tab-separated table with
per-member sizes — `#Archive/File · Name · Time · Size · Type`, one `Archive` row for the tar
and one `File` row per member. That tells you the modality and the scale of what is inside
without the transfer, which is the same triage decision `suppfile` supports at the search stage.

Do not build the `suppl/` URL from the accession by hand — the SOFT record already contains the
full URL. The bucket rule you *do* need is for `matrix/`, which no SOFT record points at, and it
is stated exactly once, in `geo_dir` above: replace the last three digits with `nnn`, which for
an accession of three digits or fewer leaves the literal `GSEnnn`. That is why `GSE1` lives at
`geo/series/GSEnnn/GSE1/`. The same rule places `GDS5435` under `geo/datasets/GDS5nnn/`,
`GSM8695035` under `geo/samples/GSM8695nnn/` and `GPL24676` under `geo/platforms/GPL24nnn/`.

### The series matrix — where array values actually are

For an expression-array series, the deposit in `suppl/` is often raw `.CEL` files, or nothing at
all. The value matrix GEO built from the sample records is in a **separate directory the SOFT
record never mentions**: `matrix/`. Missing it is the most expensive mistake in this skill,
because the failure looks like an absence of data rather than a bug.

Two rules, and both have to hold or you silently lose samples:

**A series matrix exists for essentially every series — the question is whether its table is
empty.** For arrays, it carries the values. For high-throughput sequencing, GEO has nothing to
build the table from, so the file is present, carries the full sample metadata and column
headers, and has **zero data rows** — `GSE263566`'s own is 4,043 bytes, 16 sample columns, 0
rows. Presence of the file is not presence of values; count the rows.

**A multi-platform series splits the matrix one file per platform**, named
`GSE<n>-GPL<n>_series_matrix.txt.gz` rather than `GSE<n>_series_matrix.txt.gz`. Reading "the"
matrix means reading one platform's samples and silently discarding the rest. `GSE60789` declares
110 samples and ships two parts of 55; `GSE1427` declares 198 and ships 99 + 99; `GSE3353`
declares 24 across **eight** platforms and ships 14 + 2 + 3 + 1 + 1 + 1 + 1 + 1. Multi-platform
is not rare — 28 of a random 200 GSE records carry more than one GPL, and `esummary`'s `gpl`
field shows it as `11154;10558` before you fetch anything.

```python
import gzip, io, urllib.error
import pandas as pd


def ftp_open(url, timeout=60, tries=4):
    """urlopen with backoff on the transient 5xx that ftp.ncbi.nlm.nih.gov returns under
    load. Everything below now lists matrix/ for EVERY series, so a burst of requests is
    the normal case rather than the exception — and a 503 on an unrelated directory
    should not end a harvest that suppl/ would have satisfied. 404 is passed through
    untouched: it is an answer, not a failure."""
    for attempt in range(tries):
        try:
            return urllib.request.urlopen(url, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code == 404 or e.code < 500 or attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)
        except urllib.error.URLError:
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


def listdir(url, suffix=""):
    """Filenames in a GEO FTP directory index. Used ONLY for matrix/, which no SOFT
    record points at — suppl/ URLs come from the SOFT record instead."""
    try:
        with ftp_open(url) as r:
            html = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise
    return sorted({m for m in re.findall(r'href="([^"/]+)"', html) if m.endswith(suffix)})


def series_matrix_urls(acc):
    base = geo_dir(acc) + "/matrix/"
    return [base + f for f in listdir(base, "_series_matrix.txt.gz")]


def read_series_matrix(url):
    """(GSM accessions, header fields, value table) for ONE part."""
    with ftp_open(url, timeout=300) as r:
        text = gzip.decompress(r.read()).decode("utf-8", "replace")
    head, body, inside = {}, [], False
    for line in text.splitlines():
        if line.startswith("!series_matrix_table_begin"):
            inside = True
        elif line.startswith("!series_matrix_table_end"):
            inside = False
        elif inside:
            body.append(line)
        elif line.startswith("!"):
            k, _, v = line[1:].partition("\t")
            head.setdefault(k, []).extend(x.strip('"') for x in v.split("\t"))
    gsms = head.get("Sample_geo_accession", [])
    df = (pd.read_csv(io.StringIO("\n".join(body)), sep="\t", index_col=0)
          if len(body) > 1 else pd.DataFrame(columns=gsms))
    return gsms, head, df


def series_matrix(acc, declared=None):
    """Every part, with the sample count checked against what the series declares."""
    if declared is None:
        declared = len(soft(acc).get("Series_sample_id", []))
    frames, gsms = [], []
    for u in series_matrix_urls(acc):
        g, _, df = read_series_matrix(u)
        gsms += g
        frames.append(df)
        print(f"  {u.rsplit('/', 1)[1]:<42} {len(g):>4} GSMs  {df.shape[0]:>6} rows")
    assert len(set(gsms)) == declared, f"{acc}: parts cover {len(set(gsms))} of {declared}"
    return gsms, (pd.concat(frames, axis=1) if frames else pd.DataFrame())


for acc, declared in [("GSE935", 63), ("GSE60789", 110), ("GSE3353", 24), ("GSE263566", 16)]:
    g, v = series_matrix(acc, declared)
    print(f"{acc}: {len(set(g))}/{declared} samples, values {v.shape}\n")
```

```
  GSE935_series_matrix.txt.gz                  63 GSMs   12557 rows
GSE935: 63/63 samples, values (12557, 63)

  GSE60789-GPL10558_series_matrix.txt.gz       55 GSMs   45538 rows
  GSE60789-GPL11154_series_matrix.txt.gz       55 GSMs       0 rows
GSE60789: 110/110 samples, values (45538, 110)

  GSE3353-GPL180_series_matrix.txt.gz          14 GSMs    9216 rows
  GSE3353-GPL2670_series_matrix.txt.gz          2 GSMs   41088 rows
  GSE3353-GPL2671_series_matrix.txt.gz          3 GSMs   24192 rows
  GSE3353-GPL2776_series_matrix.txt.gz          1 GSMs    9216 rows
  GSE3353-GPL2777_series_matrix.txt.gz          1 GSMs    9216 rows
  GSE3353-GPL2778_series_matrix.txt.gz          1 GSMs   24192 rows
  GSE3353-GPL2867_series_matrix.txt.gz          1 GSMs   39168 rows
  GSE3353-GPL2868_series_matrix.txt.gz          1 GSMs   24192 rows
GSE3353: 24/24 samples, values (41456, 24)

  GSE263566_series_matrix.txt.gz               16 GSMs       0 rows
GSE263566: 16/16 samples, values (0, 16)
```

`GSE60789` is the shape to remember: half its samples were assayed on an array and half were
sequenced, so one part carries 45,538 rows of values and the other carries none — and both
declare 55 columns. The `assert` is what makes that visible; without it the second part looks
like an empty file you can skip.

The `concat` is deliberately naive, and the `(41456, 24)` above shows why: eight platforms have
eight different feature spaces, so the combined frame is mostly NaN. Concatenating parts is
right for counting samples and wrong for analysis — align on a shared identifier per platform,
or treat each platform as its own dataset.

## Get the files

The point of all of the above is a directory on disk with a manifest beside it saying what came
from where. This handles all three layouts, falls back from `suppl/` to `matrix/` when the
series publishes no supplementary files, refuses a SuperSeries with a message naming its
children, and writes provenance:

```python
import gzip, json, os, tarfile, urllib.error, urllib.parse, urllib.request


def matrix_rows(path):
    """Data rows in a downloaded series-matrix part, without going through pandas."""
    n, inside = 0, False
    with gzip.open(path, "rt", errors="replace") as fh:
        for line in fh:
            if line.startswith("!series_matrix_table_begin"):
                inside = True
            elif line.startswith("!series_matrix_table_end"):
                break
            elif inside:
                n += 1
    return max(0, n - 1)                          # the first row is the column header


def fetch_series(acc, outdir="Data/geo", extract=True):
    f = soft(acc)
    declared = len(f.get("Series_sample_id", []))
    urls = [as_https(u) for u in f.get("Series_supplementary_file", [])]
    subs = [r.split(": ", 1)[1] for r in f.get("Series_relation", [])
            if r.startswith("SuperSeries of")]
    matrix = series_matrix_urls(acc)
    dest_dir, on_disk = os.path.join(outdir, acc), set()

    if not urls:
        # An empty suppl/ is NOT an absence of data: array values live in matrix/, one
        # part per platform. The part exists for sequencing series too, with NO rows.
        os.makedirs(dest_dir, exist_ok=True)
        kept, empty = [], []
        for url in matrix:
            dest = os.path.join(dest_dir, url.rsplit("/", 1)[1])
            urllib.request.urlretrieve(url, dest)
            (kept if matrix_rows(dest) else empty).append((url, dest))
        if kept:
            urls, on_disk = [u for u, _ in kept], {d for _, d in kept}
        for _, dest in empty:
            os.remove(dest)
    if not urls:
        raise LookupError(
            f"{acc}: no series supplementary files, and its {len(matrix)} series-matrix "
            f"part(s) carry metadata for {declared} samples but no values."
            + (f" It is a SuperSeries — fetch its SubSeries: {', '.join(subs)}." if subs else
               f" Try sample_files({acc!r}) for per-sample deposits, then SRA."))

    os.makedirs(dest_dir, exist_ok=True)
    manifest = {"accession": acc,
                "title": f.get("Series_title", [""])[0],
                "type": f.get("Series_type", []),
                "platform": f.get("Series_platform_id", []),
                "n_samples": declared,
                "relations": f.get("Series_relation", []),
                "series_matrix": matrix,
                "files": []}

    for url in urls:
        dest = os.path.join(dest_dir, url.rsplit("/", 1)[1])
        if dest not in on_disk:
            urllib.request.urlretrieve(url, dest)
        size = os.path.getsize(dest)
        entry = {"url": url, "path": dest, "bytes": size}
        if dest.endswith(".tar"):
            with tarfile.open(dest) as tf:
                members = [m for m in tf.getmembers() if m.isfile()]
                entry["members"] = [m.name for m in members]
                if extract:
                    inner = os.path.join(dest_dir, "extracted")
                    os.makedirs(inner, exist_ok=True)
                    for m in members:                       # flatten, refuse escapes
                        m.name = os.path.basename(m.name)
                        tf.extract(m, inner, filter="data")
                    entry["extracted_to"] = inner
        manifest["files"].append(entry)
        print(f"  {size:>14,} B  {dest}"
              + (f"  [{len(entry['members'])} members]" if "members" in entry else ""))

    # filelist.txt exists ONLY for the archive layout; its absence is normal.
    base = urls[0].rsplit("/", 1)[0] + "/filelist.txt"
    try:
        with urllib.request.urlopen(base, timeout=60) as r:
            open(os.path.join(dest_dir, "filelist.txt"), "wb").write(r.read())
        manifest["filelist"] = base
        print(f"  filelist.txt present (archive layout)")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        print("  no filelist.txt — loose-file or matrix layout, this is normal")

    with open(os.path.join(dest_dir, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
    return manifest


m1 = fetch_series("GSE263566")               # loose file in suppl/
m2 = fetch_series("GSE96750")                # single archive in suppl/
m3 = fetch_series("GSE935", extract=False)   # NOTHING in suppl/ — values in matrix/
try:
    fetch_series("GSE111017")                # SuperSeries: no files, empty matrix
except LookupError as e:
    print("  LookupError:", e)
```

```
         661,855 B  Data/geo/GSE263566/GSE263566_ageingRNAcounts.csv.gz
  no filelist.txt — loose-file or matrix layout, this is normal
      18,841,600 B  Data/geo/GSE96750/GSE96750_RAW.tar  [57 members]
  filelist.txt present (archive layout)
       3,056,265 B  Data/geo/GSE935/GSE935_series_matrix.txt.gz
  no filelist.txt — loose-file or matrix layout, this is normal
  LookupError: GSE111017: no series supplementary files, and its 1 series-matrix part(s) carry metadata for 119 samples but no values. It is a SuperSeries — fetch its SubSeries: GSE111006, GSE111010, GSE111016.
```

`GSE935` is the case the earlier version of this function got wrong: a 2003 Affymetrix series
with no `suppl/` deposit at all, which it refused with *"look at the per-sample files or at
SRA"*. Both of those were dead ends — every one of its 63 samples reports
`!Sample_supplementary_file = NONE`, and a 2003 array series predates SRA by years. The 12,557 ×
63 matrix was in `matrix/` the whole time.

`tf.extract(..., filter="data")` is what keeps a hostile or merely sloppy tar from writing
outside the destination. The `filter` argument arrived in Python 3.12 and becomes the default in
3.14, so on older interpreters check the member paths yourself rather than dropping the
argument. Setting `m.name` to the basename first also flattens the per-sample directory
prefixes some GEO archives carry — check for basename collisions if you do that, since two
members in different directories can share a name.

### Per-sample files, when the series has none

A series with nothing at series level may still have a file on every sample, and every member of
a `_RAW.tar` is published per-sample too. Enumerating those is one `targ="gsm"` call:

```python
def sample_files(acc):
    """(GSM, url) for every per-sample supplementary file. NONE means the sample has
    none — for a sequencing series that usually means the reads are in SRA."""
    rows, gsm = [], None
    for line in soft_text(acc, targ="gsm", timeout=300).splitlines():
        if line.startswith("^SAMPLE = "):
            gsm = line.split(" = ", 1)[1]
        elif line.startswith("!Sample_supplementary_file") and " = " in line:
            v = line.split(" = ", 1)[1]
            if v != "NONE":
                rows.append((gsm, as_https(v)))
    return rows


for acc in ("GSE285014", "GSE96750", "GSE935"):
    sf = sample_files(acc)
    print(f"{acc}: {len(sf)} per-sample files"
          + (f" — first {sf[0][0]} {sf[0][1].rsplit('/', 1)[1]}" if sf else ""))
```

```
GSE285014: 9 per-sample files — first GSM8695035 GSM8695035_SD-4_barcodes.tsv.gz
GSE96750: 57 per-sample files — first GSM2539470 GSM2539470_221519.txt.gz
GSE935: 0 per-sample files
```

`GSE96750`'s 57 per-sample files are exactly the 57 members of its 18.8 MB `_RAW.tar`, reachable
one at a time. `GSE935`'s zero is the honest answer that sends you to `matrix/`.

**Check the size before you commit to it.** A `HEAD` on the URL returns `Content-Length`, and
supplementary files range over six orders of magnitude — `GSE263566` is 662 KB; `GSE281772`'s
`atac_fragments.tsv.gz` is **3.79 GB**. Both are one line of code away, and only one of them
belongs in an unattended loop.

### Then read it — every file, and count the columns

Two things go wrong here and neither raises. **The separator is not the extension**, and
`pd.read_csv` on a tab-separated `.csv` returns a frame with the right number of rows and **zero
columns** rather than an error. And **one file is not the dataset** — `m["files"][0]` is the
first of however many the series deposited.

```python
import pandas as pd


def read_counts(path):
    """Sniff the separator. GEO validates the metadata, not these files."""
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt") as fh:
        header = fh.readline()
    sep = "\t" if header.count("\t") > header.count(",") else ","
    df = pd.read_csv(path, sep=sep, index_col=0)
    return df.loc[:, [c for c in df.columns if not str(c).startswith("Unnamed")]]


def read_all(manifest, suffixes=(".csv.gz", ".tsv.gz", ".txt.gz")):
    """Every tabular file in the manifest, and the total sample columns against the
    series' own declared sample count. Less is a fact about the deposit, not a bug.

    Series matrices are skipped: fetch_series writes them into the same manifest, but a
    series matrix carries 60+ `!Series_*` header lines before its table, so read_counts
    sniffs the separator off the wrong line and pandas raises. Use read_series_matrix.
    """
    frames = {}
    for entry in manifest["files"]:
        if entry["path"].endswith("_series_matrix.txt.gz"):
            continue
        if entry["path"].endswith(suffixes):
            df = read_counts(entry["path"])
            frames[os.path.basename(entry["path"])] = df
            print(f"  {os.path.basename(entry['path']):<34} "
                  f"{df.shape[0]:>6} rows x {df.shape[1]:>3} columns")
    total = sum(df.shape[1] for df in frames.values())
    print(f"{manifest['accession']}: {total} sample columns over {len(frames)} file(s), "
          f"series declares {manifest['n_samples']}"
          + ("" if total == manifest["n_samples"] else "  <-- MISMATCH"))
    return frames


f1 = read_all(m1)
print("  index looks like:", list(list(f1.values())[0].index[:3]), "->",
      "Entrez gene IDs" if str(list(f1.values())[0].index[0]).isdigit() else "symbols")

m4 = fetch_series("GSE276743")
f4 = read_all(m4)
```

```
  GSE263566_ageingRNAcounts.csv.gz    28395 rows x  16 columns
GSE263566: 16 sample columns over 1 file(s), series declares 16
  index looks like: [100287102, 653635, 102466751] -> Entrez gene IDs
         713,887 B  Data/geo/GSE276743/GSE276743_counts_1st.csv.gz
         868,116 B  Data/geo/GSE276743/GSE276743_counts_2nd.csv.gz
      13,533,705 B  Data/geo/GSE276743/GSE276743_filtered_variant.vcf.gz
  no filelist.txt — loose-file or matrix layout, this is normal
  GSE276743_counts_1st.csv.gz         67013 rows x   4 columns
  GSE276743_counts_2nd.csv.gz         67013 rows x   8 columns
GSE276743: 12 sample columns over 2 file(s), series declares 20  <-- MISMATCH
```

`GSE276743` is why the count is asserted rather than admired. It declares **20** samples and
deposits two counts files covering **12** of them — batch 3's eight samples have no processed
data anywhere in the series, and all 20 report `!Sample_supplementary_file_1 = NONE`. Following
the naive version of this section — `pd.read_csv(m["files"][0]["path"], index_col=0)` — returns
a `67013 × 0` frame, no exception, no warning: the first file is tab-separated despite its
`.csv` name, and it was never more than 4 of the 20 samples anyway.

A mismatch is not always a bug in your code. It is sometimes the honest state of the deposit,
and the only wrong move is not knowing which. When the columns fall short, check the other
supplementary files, then `matrix/`, then `sample_files()`, then SRA — in that order.

Beyond the separator, expect to discover per series: the identifier namespace (Entrez IDs here,
Ensembl or symbols elsewhere), whether values are raw counts or already normalised, and whether
the column names carry GSM accessions at all — `old10` and `young3` above do not, which is the
next section.

### Recover the GSM-to-column mapping before comparing anything

This is the join that most often goes wrong, and column order is where it goes wrong silently.
`targ="gsm"` returns the full per-sample block for every sample in the series — 66 KB and 16
blocks for `GSE263566` — each delimited by a `^SAMPLE = GSM…` line and carrying
`!Sample_title`, `!Sample_source_name_ch1` and `!Sample_characteristics_ch1`:

```python
def family_soft(acc, timeout=300):
    """The whole series' SOFT in one gzipped file. Above a couple of thousand samples
    this is the only reliable route — see the note below."""
    with urllib.request.urlopen(f"{geo_dir(acc)}/soft/{acc}_family.soft.gz",
                                timeout=timeout) as r:
        return gzip.decompress(r.read()).decode("utf-8", "replace")


def sample_table(acc, declared=None):
    """One row per GSM, with characteristics split into their own columns, and the row
    count asserted against the number of samples the series declares."""
    if declared is None:
        declared = len(soft(acc).get("Series_sample_id", []))
    text = family_soft(acc) if declared > 2000 else soft_text(acc, targ="gsm", timeout=300)
    rows, cur = [], None
    for line in text.splitlines():
        if line.startswith("^SAMPLE = "):          # blocks are delimited by ^SAMPLE
            cur = {"gsm": line.split(" = ", 1)[1]}
            rows.append(cur)
        elif cur is None or " = " not in line:
            continue
        elif line.startswith("!Sample_title"):
            cur["title"] = line.split(" = ", 1)[1]
        elif line.startswith("!Sample_source_name_ch1"):
            cur["source"] = line.split(" = ", 1)[1]
        elif line.startswith("!Sample_characteristics_ch1"):
            v = line.split(" = ", 1)[1]
            k, _, val = v.partition(": ")          # "tissue: Left ventricular myocardium"
            cur[k.strip() if val else "characteristic"] = (val or v).strip()
    assert len(rows) == declared, f"{acc}: parsed {len(rows)}, series declares {declared}"
    return pd.DataFrame(rows)


norm = lambda s: s.replace("_", "").replace("-", "").lower()


def match_columns(meta, columns):
    mapping = {norm(t): g for t, g in zip(meta["title"], meta["gsm"])}
    return {c: mapping.get(norm(str(c))) for c in columns}


meta = sample_table("GSE263566")
print(meta.head(4).to_string(index=False))
matched = match_columns(meta, list(f1.values())[0].columns)
print("\nmatrix columns matched to GSMs:",
      sum(v is not None for v in matched.values()), "/", len(matched))
print("example:", list(matched.items())[:3])

m743 = match_columns(sample_table("GSE276743"), f4["GSE276743_counts_2nd.csv.gz"].columns)
print("\nGSE276743 second file matched:",
      sum(v is not None for v in m743.values()), "/", len(m743))
# The depositor's own absolute BAM path is the evidence — the username is not.
col = re.sub(r"^/(?:home|Users)/[^/]+/", "/<home>/", list(m743)[0])
print("its column names:", col)
```

```
       gsm    title                      source                      tissue
GSM8194548  young_4 Left ventricular myocardium Left ventricular myocardium
GSM8194549 young_10 Left ventricular myocardium Left ventricular myocardium
GSM8194550  young_9 Left ventricular myocardium Left ventricular myocardium
GSM8194551  young_7 Left ventricular myocardium Left ventricular myocardium

matrix columns matched to GSMs: 16 / 16
example: [('old10', 'GSM8194562'), ('old11', 'GSM8194560'), ('old13', 'GSM8194556')]

GSE276743 second file matched: 0 / 8
its column names: /<home>/root_project/BPR/BPR_bulk_2nd/3a-1_star_alignment/BPR_3/Aligned.sortedByCoord.out.bam
```

Two things that block joins here and generalise. The titles are `young_4` while the matrix
columns are `young4`, so the match needs normalising — an exact `==` matches nothing and looks
like a metadata problem. And the SOFT sample order (`young_4`, `young_10`, `young_9`, …) is not
the matrix column order (`old10`, `old11`, …), so zipping the two lists positionally would
mislabel every sample while producing a table that looks perfectly reasonable. Match on a key,
assert the count, and never assume the order.

**16 / 16 is not the normal outcome.** `GSE276743`'s second counts file matches **0 of 8**,
because its column headers are absolute paths to BAM files on the submitter's machine. There is
no normalisation that fixes that and no rule that recovers the mapping; sample titles are
`PBMC, Post-NR1, Batch1` and the columns are `.../BPR_3/Aligned.sortedByCoord.out.bam`. When
the match rate is 0, or anything short of every column, stop and read the series' own
description — do not zip the lists and carry on. The whole point of computing the rate is to
have a number that can be zero.

`!Sample_characteristics_ch1` is free text with submitter-chosen keys, so the `k: value` split
above is a convention rather than a schema. Print the resulting columns and look at them before
you build a design matrix on top. Two characteristics with the same key on one sample overwrite
each other in the dict above, which is fine for triage and not fine for a design matrix.

**`sample_table` does not scale through `acc.cgi`, and that is why `family_soft` is there.**
Measured 2026-08-18: 314 samples in 10 s, 874 in 31 s, 1,443 in 51 s, 2,641 in 90 s, and
`GSE275126`'s 5,086 in 110–161 s across three successful runs plus **one that died with
`http.client.IncompleteRead(9875137 bytes read)` after 131 s**. `GSE241770`'s 7,899 took 275 s
and 289 s. The same 5,086 samples come out of `GSE275126_family.soft.gz` — 23,088,554 bytes
gzipped — complete, in **7.9 seconds**. No silent truncation was ever observed, at any size: when
`acc.cgi` finished, the block count was right. It is the finishing that is unreliable. The
trade-off is that the family file is the *full* SOFT, including the platform's probe table, so
`GSE935_family.soft.gz` is 11 MB compressed and 48 MB in memory for 63 samples — use it above a
couple of thousand samples, or after `acc.cgi` fails, not by default.

## Raw reads are in SRA, not GEO

GEO holds processed data and metadata. For a sequencing series, the FASTQ or BAM lives in the
Sequence Read Archive, and GEO points at it rather than serving it. When a sample's
`!Sample_supplementary_file_1` reads `NONE`, that is what it means.

The series' own record names its SRA and BioProject study up front, and `elink` walks GEO → SRA
UIDs. **`elink` returns nothing for a SuperSeries** — HTTP 200, and a linkset with no
`linksetdbs` key at all, so `["linksets"][0]["linksetdbs"][0]` raises `KeyError` and a `.get()`
reports "no SRA data" for a study whose every sample is in SRA. Recurse into the SubSeries:

```python
def sra_uids(acc):
    """SRA UIDs for a series, following SuperSeries -> SubSeries when the parent links
    to nothing. Look the UID up; never compute it from the accession."""
    hits = eutils("esearch", db="gds", term=f"{acc}[ACCN] AND gse[ETYP]",
                  retmax=5)["esearchresult"]["idlist"]
    sets = eutils("elink", dbfrom="gds", db="sra", id=hits[0])["linksets"][0]
    links = [l for db in sets.get("linksetdbs", []) for l in db["links"]]
    if links:
        return links
    subs = [r.split(": ", 1)[1] for r in soft(acc).get("Series_relation", [])
            if r.startswith("SuperSeries of")]
    return [l for s in subs for l in sra_uids(s)]


print(soft("GSE163821")["Series_relation"])
for acc, declared in [("GSE163821", 20), ("GSE111017", 119), ("GSE298085", 1443)]:
    u = sra_uids(acc)
    print(f"{acc}: {len(u)} SRA uids, series declares {declared} samples, "
          f"equal={len(u) == declared}")
```

```
['SubSeries of: GSE163823', 'BioProject: https://www.ncbi.nlm.nih.gov/bioproject/PRJNA687688', 'SRA: https://www.ncbi.nlm.nih.gov/sra?term=SRP299264']
GSE163821: 20 SRA uids, series declares 20 samples, equal=True
GSE111017: 119 SRA uids, series declares 119 samples, equal=True
GSE298085: 1443 SRA uids, series declares 1443 samples, equal=True
```

One UID per sequenced sample, and the count is worth checking against `n_samples` for the same
reason every other count here is. `GSE111017` and `GSE298085` are the two that return zero links
directly; both come back complete through their children.

Per-sample records carry the same pointer individually — `!Sample_relation = SRA:
https://www.ncbi.nlm.nih.gov/sra?term=SRX26026361` and a `BioSample: SAMN…` beside it.
Downloading from there is a separate job with its own tooling and its own scale: NCBI's SRA
Toolkit (`prefetch` then `fasterq-dump`) or the ENA mirror, which serves plain FASTQ over HTTPS.
Budget for tens to hundreds of gigabytes and for realignment. Reach for it only when the
processed matrices genuinely cannot answer the question — a different aligner, a different
reference build, transcript-level or allele-level analysis, or variant calling.

## What GEO will not give you

- **Harmonised anything.** Two series on the same tissue may use different platforms,
  identifiers, normalisations and units. Cross-series comparison is a project, not a merge.
- **Reliable clinical or demographic metadata.** Age, sex and treatment arrive as free text in
  `!Sample_characteristics_ch1`, with per-submission keys. There is no schema.
- **Individual-level human data under controlled access.** Sequence data from human subjects
  requiring consent-based approval is in dbGaP; GEO holds the summary side. A GEO series
  pointing at a dbGaP study means the raw data is gated even though the series is not.
- **A stable record.** Series get updated, corrected and occasionally withdrawn. `GSE100030`,
  `GSE100031` and `GSE100032` were all deleted by GEO staff on 16 February 2018; they now answer
  HTTP 200 with an HTML page saying so, and Entrez reports them as `count: 0` exactly as it
  reports an accession that never existed. Record the accession *and* the retrieval date in your
  manifest, which is what `fetch_series` above is for, and treat a previously-working accession
  that stops resolving as a fact about the record rather than a bug in your loop.
- **Curated value matrices, in general.** That was GDS, it covers 4,348 series out of 293,451,
  and it stopped. Do not build a pipeline that depends on a GDS existing.

## Try it

A self-contained check that this skill still works, exercising every step in order — search,
triage, enumerate, download — and asserting the response *shape* rather than only reachability.
It then runs six **counter-examples**, each one a series that breaks a rule the primary series
obeys, with the assertion set to the count the series itself declares. Public data, no account,
no key. Transfers about 6.6 MB.

**Data** — `GSE263566`, *The Human Cardiac "Age-OME" — age-specific changes in myocardial
molecular expression*, human heart RNA-seq, 16 samples, one gzipped counts matrix:

    https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE263566&targ=self&form=text&view=brief
    https://ftp.ncbi.nlm.nih.gov/geo/series/GSE263nnn/GSE263566/suppl/GSE263566_ageingRNAcounts.csv.gz

GEO is a US Government work in the public domain — no account, no key, no licence acceptance.
This series is used because it is small, published (2025), loose-file rather than archived, and
carries exactly one supplementary file, so a change in any of those is visible immediately.
The counter-example series are `GSE935` (2003 array, nothing in `suppl/`), `GSE3353` (24 samples
over eight platforms), `GSE276743` (tab-separated `.csv`, 12 of 20 samples), `GSE111017`
(SuperSeries) and `GSE100030` (withdrawn 2018). Last confirmed reachable 2026-08-18.

```python
import gzip, json, os, re, time, urllib.error, urllib.parse, urllib.request

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
ACC_CGI = "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi"
FTP = "https://ftp.ncbi.nlm.nih.gov/geo"
ACC = "GSE263566"


def eutils(endpoint, **params):
    """Throttled AND retried. This block makes ~20 calls in a burst, and under load NCBI
    answers with a truncated chunked body — urlopen succeeds and `r.read()` raises
    IncompleteRead, which is not an HTTPError and so survives any `except HTTPError`.
    Retrying the request is the only fix; the same reasoning as soft_text below."""
    params.update(retmode="json", tool="geo-skill-tryit")
    if os.environ.get("NCBI_EMAIL"):
        params["email"] = os.environ["NCBI_EMAIL"]
    url = f"{EUTILS}/{endpoint}.fcgi?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        time.sleep(0.34)                              # 3 req/s unkeyed
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                body = json.loads(r.read())
            break
        except (http.client.IncompleteRead, urllib.error.URLError, json.JSONDecodeError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 3:
                raise
            time.sleep(2 ** attempt)
    assert "eutilsresult" not in body, body.get("eutilsresult")   # 200 can carry an error
    return body


def soft_text(acc, targ="self"):
    """acc.cgi answers HTTP 200 with an HTML page on EVERY failure, ignoring form=text.
    Throttled and retried: this block calls it eight times, and NCBI answers a burst
    with 429 or an occasional 502."""
    url = f"{ACC_CGI}?" + urllib.parse.urlencode(
        {"acc": acc, "targ": targ, "form": "text", "view": "brief"})
    for attempt in range(4):
        time.sleep(0.34)                              # 3 req/s unkeyed, here too
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                text = r.read().decode("utf-8", "replace")
            break
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503) or attempt == 3:
                raise
            time.sleep(float(e.headers.get("Retry-After") or 2 ** attempt))
    if text.lstrip().startswith("^"):
        return text
    flat = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text))
    gone = re.search(r'Accession "[^"]+" was deleted by the GEO staff on [^.]*\.', flat)
    raise LookupError(f"{acc} WITHDRAWN — {gone.group(0)}" if gone else f"{acc}: not SOFT")


def geo_dir(acc):
    kind, n = acc[:3], acc[3:]
    tree = {"GSE": "series", "GSM": "samples", "GPL": "platforms", "GDS": "datasets"}[kind]
    return f"{FTP}/{tree}/{kind}{n[:-3]}nnn/{acc}"


def declared_samples(acc):
    return sum(1 for l in soft_text(acc).splitlines() if l.startswith("!Series_sample_id"))


def matrix_parts(acc):
    base = geo_dir(acc) + "/matrix/"
    with urllib.request.urlopen(base, timeout=60) as r:
        idx = r.read().decode("utf-8", "replace")
    return [base + f for f in
            sorted(set(re.findall(r'href="([^"/]+_series_matrix\.txt\.gz)"', idx)))]


def ftp_open(url, timeout=60, tries=4):
    """Backoff on the transient 5xx ftp.ncbi.nlm.nih.gov returns under load. This block
    lists matrix/ for several series in a burst; a 503 on one should not end the run."""
    for attempt in range(tries):
        try:
            return urllib.request.urlopen(url, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code == 404 or e.code < 500 or attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)
        except urllib.error.URLError:
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)


def matrix_gsms_and_rows(url):
    with ftp_open(url, timeout=300) as r:
        lines = gzip.decompress(r.read()).decode("utf-8", "replace").splitlines()
    gsms, rows, inside = [], 0, False
    for l in lines:
        if l.startswith("!series_matrix_table_begin"):
            inside = True
        elif l.startswith("!series_matrix_table_end"):
            break
        elif inside:
            rows += 1
        elif l.startswith("!Sample_geo_accession"):
            gsms = [x.strip('"') for x in l.split("\t")[1:]]
    return gsms, max(0, rows - 1)


# 1. SEARCH — returns UIDs, never accessions. retmax must be set or you get 20.
res = eutils("esearch", db="gds", term=f"{ACC}[ACCN] AND gse[ETYP]", retmax=50)["esearchresult"]
ids = res["idlist"]
assert isinstance(ids, list) and ids, res
assert all(i.isdigit() for i in ids), ids                # UIDs, not "GSE..."
assert "[ACCN]" in res["querytranslation"], res["querytranslation"]   # tag survived

# 2. TRIAGE — esummary carries the fields the decision is made on.
rec = eutils("esummary", db="gds", id=",".join(ids))["result"]
d = rec[rec["uids"][0]]
assert re.fullmatch(r"GSE\d+", d["accession"]), d["accession"]
assert d["entrytype"] == "GSE" and d["gse"] == d["accession"][3:]
suppfile = [s.strip() for s in d["suppfile"].split(",") if s.strip()]
assert suppfile and all(re.fullmatch(r"[A-Z0-9]+", s) for s in suppfile), d["suppfile"]
assert d["ftplink"].startswith("ftp://")                 # advertised as ftp, deliberately

# 3. ENUMERATE — the SOFT brief record, not directory scraping.
soft = soft_text(ACC)
urls = [l.split(" = ", 1)[1].replace("ftp://ftp.ncbi.nlm.nih.gov/",
                                     "https://ftp.ncbi.nlm.nih.gov/", 1)
        for l in soft.splitlines() if l.startswith("!Series_supplementary_file")]
assert urls and all(u.startswith("https://ftp.ncbi.nlm.nih.gov/geo/series/") for u in urls)

# 4. GET THE FILES — over HTTPS, into a directory.
os.makedirs("Data/geo", exist_ok=True)
dest = os.path.join("Data/geo", urls[0].rsplit("/", 1)[1])
urllib.request.urlretrieve(urls[0], dest)

print("uids            :", ids)
print("accession       :", d["accession"], "| entrytype", d["entrytype"],
      "| taxon", d["taxon"])
print("n_samples       :", d["n_samples"],
      "| SOFT sample_id lines:", sum(1 for l in soft.splitlines()
                                     if l.startswith("!Series_sample_id")))
print("suppfile parsed :", suppfile)
print("files           :", len(urls))
print("downloaded      :", dest, f"{os.path.getsize(dest):,} bytes")

with gzip.open(dest, "rt") as fh:
    header = fh.readline().rstrip("\n").split(",")
    nrow = sum(1 for _ in fh)
assert len(header) - 1 == d["n_samples"], (len(header) - 1, d["n_samples"])
print("matrix          :", nrow, "rows x", len(header) - 1, "sample columns")
print("columns         :", header[1:5], "...")

# 5. THE COUNTER-EXAMPLES — one example is not a test. Each of these breaks a rule that
#    holds for GSE263566, and each assertion is the count the series itself declares.

# (a) A series with NO supplementary files still has data — in matrix/, not suppl/.
n935 = declared_samples("GSE935")
assert not [l for l in soft_text("GSE935").splitlines()
            if l.startswith("!Series_supplementary_file")]
parts = matrix_parts("GSE935")
g935, r935 = matrix_gsms_and_rows(parts[0])
assert len(parts) == 1 and len(g935) == n935 and r935 > 0
print(f"\nGSE935          : 0 suppl files, {len(parts)} matrix part, "
      f"{r935} rows x {len(g935)}/{n935} samples")

# (b) A MULTI-PLATFORM series splits that matrix ONE FILE PER PLATFORM. Reading the
#     first part alone would return 14 of 24 samples, with no error.
n3353 = declared_samples("GSE3353")
parts = matrix_parts("GSE3353")
per = [matrix_gsms_and_rows(u) for u in parts]
assert len(parts) == 8, parts
assert len(per[0][0]) < n3353                            # the first part is NOT the series
assert sum(len(g) for g, _ in per) == n3353              # all eight parts are
assert all(re.search(r"-GPL\d+_series_matrix", u) for u in parts)   # name carries the GPL
print(f"GSE3353         : {len(parts)} matrix parts, "
      f"{[len(g) for g, _ in per]} samples -> {n3353}/{n3353}")

# (c) A sequencing series' matrix part exists but its TABLE IS EMPTY — presence of the
#     file is not presence of values. GSE263566's own matrix proves it.
gsub, rsub = matrix_gsms_and_rows(matrix_parts(ACC)[0])
assert len(gsub) == d["n_samples"] and rsub == 0
print(f"{ACC}       : matrix part present, {len(gsub)} sample columns, {rsub} data rows")

# (d) Supplementary files are whatever the lab produced. This '.csv' is TAB-separated,
#     and the two counts files together cover 12 of the series' 20 samples.
n743 = declared_samples("GSE276743")
cols = []
for u in [l.split(" = ", 1)[1].replace("ftp://ftp.ncbi.nlm.nih.gov/",
                                       "https://ftp.ncbi.nlm.nih.gov/", 1)
          for l in soft_text("GSE276743").splitlines()
          if l.startswith("!Series_supplementary_file")]:
    if not u.endswith((".csv.gz", ".tsv.gz", ".txt.gz")):
        continue
    p = os.path.join("Data/geo", u.rsplit("/", 1)[1])
    urllib.request.urlretrieve(u, p)
    with gzip.open(p, "rt") as fh:
        head = fh.readline().rstrip("\n")
    assert head.count("\t") > head.count(","), "a .csv that is really comma-separated"
    cols += [c for c in head.split("\t") if c]
assert len(cols) == 12 and len(cols) < n743, (len(cols), n743)
print(f"GSE276743       : declared {n743} samples, tab-separated '.csv', "
      f"{len(cols)} sample columns across 2 files")

# (e) A SuperSeries has no files of its own and its matrix has no values; the data is on
#     the SubSeries, and its declared count is the union of theirs.
sup = soft_text("GSE111017")
subs = [l.split(": ", 1)[1] for l in sup.splitlines()
        if l.startswith("!Series_relation") and "SuperSeries of" in l]
nsup = sum(1 for l in sup.splitlines() if l.startswith("!Series_sample_id"))
assert len(subs) == 3 and sum(declared_samples(s) for s in subs) == nsup
gsup, rsup = matrix_gsms_and_rows(matrix_parts("GSE111017")[0])
assert rsup == 0 and len(gsup) == nsup
print(f"GSE111017       : SuperSeries of {len(subs)}, {nsup} samples = union of children, "
      f"matrix rows {rsup}")

# (f) A WITHDRAWN accession answers HTTP 200 with an HTML page saying so. It is not the
#     same failure as a nonexistent one, and neither one is an HTTP error.
try:
    soft_text("GSE100030")
    raise AssertionError("GSE100030 should be withdrawn")
except LookupError as e:
    assert "WITHDRAWN" in str(e) and "deleted by the GEO staff" in str(e), e
    print("GSE100030       :", e)
```

**Expect**

Invariants — these hold regardless of GEO's build date, and a failure means the skill is
wrong, not that upstream moved:

- `esearchresult.idlist` is a **list of digit strings**. Every element is a UID; none is an
  accession. Code that treats an element as `GSE…` is broken, and this assertion is what
  catches a future change to that contract.
- `esummary` returns `accession` matching `^GSE\d+$`, and it is **not** derivable from the UID
  in general — the `entrytype == "GSE"` and `gse == accession[3:]` assertions hold *only*
  because the entry-type filter kept GDS records out. Drop `gse[ETYP]` from the query and both
  break.
- `suppfile` parses as a comma-separated list of uppercase alphanumeric type tokens, and is
  non-empty for this series. It is **empty** for `GSE935`, `GSE111017` and `GSE60789`, none of
  which is short of data.
- `ftplink` still begins `ftp://` — this is deliberately asserted, because the whole reason the
  skill rewrites the scheme is that GEO advertises it this way.
- `n_samples` from `esummary` equals the number of `!Series_sample_id` lines in the SOFT
  record. Two independent surfaces agreeing is what confirms the SOFT parse is right.
- Every supplementary URL, after the scheme swap, is under
  `https://ftp.ncbi.nlm.nih.gov/geo/series/`, and the file downloads and gunzips.
- The matrix's sample-column count equals `n_samples` (16).
- **`GSE935` publishes zero supplementary files and a complete 12,557 × 63 value matrix under
  `matrix/`.** An "absence of data" conclusion drawn from `suppl/` alone is wrong here.
- **`GSE3353`'s matrix is eight files, one per platform, and its first part holds 14 of 24
  samples.** The parts sum to the declared count; any single part does not.
- **`GSE263566`'s own matrix part has 16 sample columns and 0 data rows** — the file exists for
  sequencing series and carries no values.
- **`GSE276743` declares 20 samples and its counts files carry 12**, in a `.csv` that is
  tab-separated. Both numbers are properties of the deposit, not of the reader's code.
- **`GSE111017`'s 119 samples are exactly the union of its three SubSeries**, and its own
  matrix part has 0 rows.
- **`GSE100030` raises a withdrawal error, not a not-found error** — HTTP 200 with HTML either
  way, so the body has to be classified.

Observed 2026-08-18 against the **db=gds build of 2026-08-16**, E-utilities JSON 0.3 — these
move as GEO grows and as these series are revised, so treat a mismatch as drift to investigate:

- uid `200263566` · accession `GSE263566` · taxon *Homo sapiens* · `n_samples` 16 ·
  `suppfile` `['CSV']` · 1 supplementary file · 661,855 bytes · matrix 28,395 rows × 16 columns
  · first columns `['old10', 'old11', 'old13', 'old4']`
- `GSE935` 12,557 × 63 · `GSE3353` 8 parts, `[14, 2, 3, 1, 1, 1, 1, 1]` = 24 ·
  `GSE276743` 4 + 8 = 12 of 20 · `GSE111017` 40 + 39 + 40 = 119 ·
  `GSE100030` deleted by GEO staff on Feb 16, 2018
- Whole-database sizes on the same date — `gse[ETYP]` 293,451 · `gsm[ETYP]` 8,675,904 ·
  `gpl[ETYP]` 28,794 · `gds[ETYP]` 4,348 · `einfo` total 9,002,767
- `aging[TITL] AND gse[ETYP]` 1,883 hits against `aging[BOGUS] AND gse[ETYP]` 8,511 — the
  dropped-tag trap. The *ratio* is the signal; both numbers grow over time


## Sources

- GEO — https://www.ncbi.nlm.nih.gov/geo/
- Programmatic access and file layout — https://www.ncbi.nlm.nih.gov/geo/info/download.html
- Query fields and GEO DataSets search — https://www.ncbi.nlm.nih.gov/geo/info/qqtutorial.html
- E-utilities reference — https://www.ncbi.nlm.nih.gov/books/NBK25501/
- API keys and usage limits — https://www.ncbi.nlm.nih.gov/books/NBK25497/
- SOFT format — https://www.ncbi.nlm.nih.gov/geo/info/soft.html
- Edgar et al. (2002) *Nucleic Acids Research* 30, 207-210 — https://doi.org/10.1093/nar/30.1.207
- Barrett et al. (2013) *Nucleic Acids Research* 41, D991-D995 — https://doi.org/10.1093/nar/gks1193

GEO data is produced by the US National Center for Biotechnology Information and is in the
public domain. Individual submissions may carry their own citation request — the `pubmedids`
field in `esummary` is where the submitter's paper is recorded, and it is what to cite when you
reuse a series.
