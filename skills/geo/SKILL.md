---
name: geo
description: Find, triage and download public gene expression datasets from NCBI GEO — search series by tissue, disease, organism, assay and supplementary file type through E-utilities, read the esummary triage fields before transferring anything, then pull the counts matrices and processed files onto disk over HTTPS.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [geo, rna-seq, transcriptomics, public-data, entrez]
covers: [geo, gse, gsm, gds, rna-seq, microarray, scRNA-seq, single-nucleus, spatial transcriptomics, expression, transcriptomics, counts matrix, aging, senescence, sarcopenia, skeletal muscle, liver, brain, heart, kidney, blood, pbmc, lung, diabetes, cancer, fibrosis, human, mouse, affymetrix, e-utilities]
papers: [PMID:11752295, PMID:23193258, PMID:27008011, PMID:17496320, PMID:36516485, PMID:31862890]
access: [open]
datasets: [https://ftp.ncbi.nlm.nih.gov/geo/series/GSE263nnn/GSE263566/suppl/GSE263566_ageingRNAcounts.csv.gz, https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE263566&targ=self&form=text&view=brief]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-17
  against: NCBI E-utilities JSON 0.3 / db=gds build 2026-08-16 / Python 3.12.8 / pandas 2.3.2 / curl 8.7.1
  executed: 13
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

### Two more fields that lie if you read them carelessly

**`n_samples` means something different per `entrytype`.** On a GSE it is the sample count; on a
GPL it is *how many samples in all of GEO used that platform* — `GPL24676` reports 1,146,310.
Mixing entry types into one triage table and sorting by `n_samples` puts platforms at the top.

**`suppfile` is empty for a SuperSeries, which does have data.** `GSE111017` reports
`n_samples: 119` and `suppfile: ""`, because its files live on its three SubSeries. Rejecting on
"no supplementary files" throws away the whole study. Catch it from the record's relations —
`SuperSeries of: GSE111006` — and recurse into the children.

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

**The listing.** Do not scrape the directory index. The authoritative per-series file list is
the record's own SOFT metadata, in brief form, which gives exact URLs and works for every
storage layout:

```python
import urllib.parse, urllib.request

ACC_CGI = "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi"


def soft(acc, targ="self", timeout=90):
    """A record's own SOFT metadata as text. targ='self' is the series itself,
    'gsm' adds every sample. Do NOT use 'gpl' or 'all' casually — see below."""
    url = f"{ACC_CGI}?" + urllib.parse.urlencode(
        {"acc": acc, "targ": targ, "form": "text", "view": "brief"})
    with urllib.request.urlopen(url, timeout=timeout) as r:
        text = r.read().decode("utf-8", "replace")
    fields = {}
    for line in text.splitlines():
        if line.startswith("!") and " = " in line:
            k, v = line[1:].split(" = ", 1)
            fields.setdefault(k, []).append(v)
    if not fields:
        raise LookupError(f"{acc}: no SOFT fields returned — check the accession")
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

### Two storage layouts, and code must handle both

- **Loose files.** `GSE263566` exposes one `.csv.gz`; `GSE276743` exposes three
  (`GSE276743_counts_1st.csv.gz`, `..._counts_2nd.csv.gz`, `..._filtered_variant.vcf.gz`). Each
  is individually addressable, so fetch only what you need.
- **A single archive.** `GSE285014` exposes `GSE285014_RAW.tar` — 224,337,920 bytes, with a
  `barcodes.tsv.gz` / `features.tsv.gz` / `matrix.mtx.gz` triple per sample inside, each member
  prefixed with its GSM accession. There is no way to fetch one sample without the whole tar.

`suppl/filelist.txt` describes the contents of the archive layout and **exists only for it**.
Verified 2026-08-17: present for `GSE271676` (13,799 B) and `GSE285014` (721 B), honest **404**
for `GSE263566` and `GSE276743`. Treat that 404 as the normal loose-file case, not an error.

It is worth reading before you commit to a download, because it is a tab-separated table with
per-member sizes — `#Archive/File · Name · Time · Size · Type`, one `Archive` row for the tar
and one `File` row per member. That tells you the modality and the scale of what is inside
without the transfer, which is the same triage decision `suppfile` supports at the search stage.

Do not build the directory URL from the accession by hand. The `GSEnnn` bucket rule
(`GSE263566` → `GSE263nnn`) is "drop the last three digits", which produces a wrong path for
short accessions and is unnecessary anyway — the SOFT record already contains the full URL.

## Get the files

The point of all of the above is a directory on disk with a manifest beside it saying what came
from where. This handles both layouts, refuses a SuperSeries with a message naming its
children, and writes provenance:

```python
import json, os, tarfile, urllib.error, urllib.parse, urllib.request


def fetch_series(acc, outdir="Data/geo", extract=True):
    f = soft(acc)
    urls = [as_https(u) for u in f.get("Series_supplementary_file", [])]
    subs = [r.split(": ", 1)[1] for r in f.get("Series_relation", [])
            if r.startswith("SuperSeries of")]
    if not urls:
        if subs:
            raise LookupError(f"{acc} is a SuperSeries with no files of its own — "
                              f"fetch its SubSeries instead: {', '.join(subs)}")
        raise LookupError(f"{acc} publishes no series-level supplementary files; "
                          f"look at the per-sample files or at SRA")

    dest_dir = os.path.join(outdir, acc)
    os.makedirs(dest_dir, exist_ok=True)
    manifest = {"accession": acc,
                "title": f.get("Series_title", [""])[0],
                "type": f.get("Series_type", []),
                "platform": f.get("Series_platform_id", []),
                "n_samples": len(f.get("Series_sample_id", [])),
                "relations": f.get("Series_relation", []),
                "files": []}

    for url in urls:
        dest = os.path.join(dest_dir, url.rsplit("/", 1)[1])
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
        print("  no filelist.txt — loose-file layout, this is normal")

    with open(os.path.join(dest_dir, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
    return manifest


m1 = fetch_series("GSE263566")
m2 = fetch_series("GSE96750")
try:
    fetch_series("GSE111017")
except LookupError as e:
    print("  LookupError:", e)
```

```
         661,855 B  Data/geo/GSE263566/GSE263566_ageingRNAcounts.csv.gz
  no filelist.txt — loose-file layout, this is normal
      18,841,600 B  Data/geo/GSE96750/GSE96750_RAW.tar  [57 members]
  filelist.txt present (archive layout)
  LookupError: GSE111017 is a SuperSeries with no files of its own — fetch its SubSeries instead: GSE111006, GSE111010, GSE111016
```

`tf.extract(..., filter="data")` is what keeps a hostile or merely sloppy tar from writing
outside the destination. The `filter` argument arrived in Python 3.12 and becomes the default in
3.14, so on older interpreters check the member paths yourself rather than dropping the
argument. Setting `m.name` to the basename first also flattens the per-sample directory
prefixes some GEO archives carry.

**Check the size before you commit to it.** A `HEAD` on the URL returns `Content-Length`, and
supplementary files range over six orders of magnitude — `GSE263566` is 662 KB; `GSE281772`'s
`atac_fragments.tsv.gz` is **3.79 GB**. Both are one line of code away, and only one of them
belongs in an unattended loop.

### Then read it, because nothing about the format is guaranteed

```python
import pandas as pd

counts = pd.read_csv(m1["files"][0]["path"], index_col=0)
print(f"{m1['accession']}: {counts.shape[0]} rows x {counts.shape[1]} columns")
print("  columns:", list(counts.columns))
print("  index looks like:", list(counts.index[:3]), "->",
      "Entrez gene IDs" if str(counts.index[0]).isdigit() else "symbols")
```

```
GSE263566: 28395 rows x 16 columns
  columns: ['old10', 'old11', 'old13', 'old4', 'old6', 'old7', 'old8', 'old9', 'young10', 'young11', 'young3', 'young4', 'young5', 'young7', 'young8', 'young9']
  index looks like: [100287102, 653635, 102466751] -> Entrez gene IDs
```

Supplementary files are whatever the submitting lab produced. GEO validates the *metadata*, not
these. Expect to discover per series: the identifier namespace (Entrez IDs here, Ensembl or
symbols elsewhere), whether values are raw counts or already normalised, the separator, and
whether the column names carry GSM accessions at all — `old10` and `young3` above do not, which
is the next section.

### Recover the GSM-to-column mapping before comparing anything

This is the join that most often goes wrong, and column order is where it goes wrong silently.
`targ="gsm"` returns the full per-sample block for every sample in the series — 66 KB and 16
blocks for `GSE263566` — each delimited by a `^SAMPLE = GSM…` line and carrying
`!Sample_title`, `!Sample_source_name_ch1` and `!Sample_characteristics_ch1`:

```python
def sample_table(acc):
    """One row per GSM, with characteristics split into their own columns."""
    text_url = f"{ACC_CGI}?" + urllib.parse.urlencode(
        {"acc": acc, "targ": "gsm", "form": "text", "view": "brief"})
    with urllib.request.urlopen(text_url, timeout=120) as r:
        text = r.read().decode("utf-8", "replace")
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
    return pd.DataFrame(rows)


meta = sample_table("GSE263566")
print(meta.head(4).to_string(index=False))

norm = lambda s: s.replace("_", "").replace("-", "").lower()
mapping = {norm(t): g for t, g in zip(meta["title"], meta["gsm"])}
matched = {c: mapping.get(norm(c)) for c in counts.columns}
print("\nmatrix columns matched to GSMs:",
      sum(v is not None for v in matched.values()), "/", len(matched))
print("example:", list(matched.items())[:3])
```

```
       gsm    title                      source                      tissue
GSM8194548  young_4 Left ventricular myocardium Left ventricular myocardium
GSM8194549 young_10 Left ventricular myocardium Left ventricular myocardium
GSM8194550  young_9 Left ventricular myocardium Left ventricular myocardium
GSM8194551  young_7 Left ventricular myocardium Left ventricular myocardium

matrix columns matched to GSMs: 16 / 16
example: [('old10', 'GSM8194562'), ('old11', 'GSM8194560'), ('old13', 'GSM8194556')]
```

Two things that block joins here and generalise. The titles are `young_4` while the matrix
columns are `young4`, so the match needs normalising — an exact `==` matches nothing and looks
like a metadata problem. And the SOFT sample order (`young_4`, `young_10`, `young_9`, …) is not
the matrix column order (`old10`, `old11`, …), so zipping the two lists positionally would
mislabel every sample while producing a table that looks perfectly reasonable. Match on a key,
assert the count, and never assume the order.

`!Sample_characteristics_ch1` is free text with submitter-chosen keys, so the `k: value` split
above is a convention rather than a schema. Print the resulting columns and look at them before
you build a design matrix on top.

## Raw reads are in SRA, not GEO

GEO holds processed data and metadata. For a sequencing series, the FASTQ or BAM lives in the
Sequence Read Archive, and GEO points at it rather than serving it. When a sample's
`!Sample_supplementary_file_1` reads `NONE`, that is what it means.

```bash
E=https://eutils.ncbi.nlm.nih.gov/entrez/eutils
# the series' own record names its SRA and BioProject study up front
curl -s "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE163821&targ=self&form=text&view=brief" \
| grep '^!Series_relation'
sleep 0.4
# and elink walks GEO -> SRA UIDs, one per sequenced sample in this series
curl -s "$E/elink.fcgi?dbfrom=gds&db=sra&retmode=json&id=200163821" \
| python3 -c 'import json,sys; s=json.load(sys.stdin)["linksets"][0]["linksetdbs"][0]; print(s["linkname"], len(s["links"]), "SRA uids, e.g.", s["links"][:3])'
```

```
!Series_relation = SubSeries of: GSE163823
!Series_relation = BioProject: https://www.ncbi.nlm.nih.gov/bioproject/PRJNA687688
!Series_relation = SRA: https://www.ncbi.nlm.nih.gov/sra?term=SRP299264
gds_sra 20 SRA uids, e.g. ['12725674', '12725673', '12725672']
```

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
- **A stable record.** Series get updated, corrected and occasionally withdrawn. Record the
  accession *and* the retrieval date in your manifest, which is what `fetch_series` above is
  for.
- **Curated value matrices, in general.** That was GDS, it covers 4,348 series out of 293,451,
  and it stopped. Do not build a pipeline that depends on a GDS existing.

## Try it

A self-contained check that this skill still works, exercising every step in order — search,
triage, enumerate, download — and asserting the response *shape* rather than only reachability.
Public data, no account, no key. Downloads 662 KB.

**Data** — `GSE263566`, *The Human Cardiac "Age-OME" — age-specific changes in myocardial
molecular expression*, human heart RNA-seq, 16 samples, one gzipped counts matrix:

    https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE263566&targ=self&form=text&view=brief
    https://ftp.ncbi.nlm.nih.gov/geo/series/GSE263nnn/GSE263566/suppl/GSE263566_ageingRNAcounts.csv.gz

GEO is a US Government work in the public domain — no account, no key, no licence acceptance.
This series is used because it is small, published (2025), loose-file rather than archived, and
carries exactly one supplementary file, so a change in any of those is visible immediately.
Last confirmed reachable 2026-08-17.

```python
import json, os, re, time, urllib.parse, urllib.request

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
ACC = "GSE263566"


def eutils(endpoint, **params):
    params.update(retmode="json", tool="geo-skill-tryit")
    if os.environ.get("NCBI_EMAIL"):
        params["email"] = os.environ["NCBI_EMAIL"]
    url = f"{EUTILS}/{endpoint}.fcgi?" + urllib.parse.urlencode(params)
    time.sleep(0.34)                                  # 3 req/s unkeyed
    with urllib.request.urlopen(url, timeout=90) as r:
        body = json.loads(r.read())
    assert "eutilsresult" not in body, body.get("eutilsresult")   # 200 can carry an error
    return body


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
soft_url = "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?" + urllib.parse.urlencode(
    {"acc": ACC, "targ": "self", "form": "text", "view": "brief"})
with urllib.request.urlopen(soft_url, timeout=90) as r:
    soft = r.read().decode("utf-8", "replace")
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

import gzip
with gzip.open(dest, "rt") as fh:
    header = fh.readline().rstrip("\n").split(",")
    nrow = sum(1 for _ in fh)
assert len(header) - 1 == d["n_samples"], (len(header) - 1, d["n_samples"])
print("matrix          :", nrow, "rows x", len(header) - 1, "sample columns")
print("columns         :", header[1:5], "...")
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
  non-empty for this series.
- `ftplink` still begins `ftp://` — this is deliberately asserted, because the whole reason the
  skill rewrites the scheme is that GEO advertises it this way.
- `n_samples` from `esummary` equals the number of `!Series_sample_id` lines in the SOFT
  record. Two independent surfaces agreeing is what confirms the SOFT parse is right.
- Every supplementary URL, after the scheme swap, is under
  `https://ftp.ncbi.nlm.nih.gov/geo/series/`, and the file downloads and gunzips.
- The matrix's sample-column count equals `n_samples` (16).

Observed 2026-08-17 against the **db=gds build of 2026-08-16**, E-utilities JSON 0.3 — these
move as GEO grows and as this series is revised, so treat a mismatch as drift to investigate:

- uid `200263566` · accession `GSE263566` · taxon *Homo sapiens* · `n_samples` 16 ·
  `suppfile` `['CSV']` · 1 supplementary file · 661,855 bytes · matrix 28,395 rows × 16 columns
  · first columns `['old10', 'old11', 'old13', 'old4']`
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
