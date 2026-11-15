---
name: pubmed
description: Search PubMed's 41 million biomedical citations through NCBI E-utilities and save complete, checked result sets to disk — titles, structured abstracts, authors, MeSH, DOIs, PMC ids and retraction status — past the 9,999-record cap, then pull open-access full text with its licence from the PMC Open Access bucket.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [pubmed, entrez, literature-mining, bibliometrics, public-data]
covers: [pubmed, medline, pmc, pubmed central, pmid, pmcid, doi, mesh, abstracts, full text, open access, jats xml, citations, cited by, retractions, retracted publication, expression of concern, systematic review, literature search, literature review, bibliography, author search, journal articles, preprints, genereviews, e-utilities, esearch, efetch, id converter, text mining]
papers: [PMID:41385079, PMID:39526373]
access: [open]
datasets: ['https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=22745249%2C9500320%2C15016483%2C20301425%2C16060722%2C99999999&retmode=xml', https://pmc-oa-opendata.s3.amazonaws.com/metadata/PMC1182327.2.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: NCBI E-utilities (esearch JSON 0.3, PubMed build 2026.11.05, pubmed_250101 DTD) / PMC ID Converter API v1 / PMC Open Access S3 bucket pmc-oa-opendata / PubMed baseline pubmed26 / Python 3.12.9 stdlib / curl 8.7.1
  executed: 11
  unverified: 0
---
# PubMed

PubMed is NLM's index of the biomedical literature: **41,397,408 records** in build
`2026.11.05`, from MEDLINE-indexed journals, PubMed Central deposits, NCBI Bookshelf chapters
and preprints. Search, metadata and abstracts are free over HTTPS with no account. Open-access
full text sits next to it in PubMed Central (PMC).

Access is not the hard part. The hard part is that PubMed fails quietly. A misspelled field tag
searches every field instead. An unbalanced parenthesis is dropped. A PMID that does not exist
disappears from the batch. Paging stops at record 9,999 whatever the total. Each of these
returns HTTP 200 and a plausible-looking result. This skill is built around checks that turn
each one into an error:

**search (and check the translation) → slice past 9,999 → triage → fetch and parse → full text → files.**

## Before the first call — rate limits and identification

The limit is **3 requests per second per IP** without a key, and **10** with a free NCBI API key
(account settings at <https://www.ncbi.nlm.nih.gov/account/>). Going over it returns
`429` with `{"error":"API rate limit exceeded"}` and `Retry-After: 2`. Of eight parallel requests
sent without a key, four came back 429. The limit is per IP, so two scripts on one machine share
it.

The helper below spaces calls, retries on 429 and 5xx, and reads an optional key and contact
email from the environment (`NCBI_API_KEY`, `NCBI_EMAIL`). NCBI asks for `tool` and `email` so
it can contact you before blocking a misbehaving script. Every later block uses this helper.

```python
import json, os, re, time, urllib.error, urllib.parse, urllib.request

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
API_KEY = os.environ.get("NCBI_API_KEY")
IDENT = {"tool": "pubmed-skill", **({"email": os.environ["NCBI_EMAIL"]} if os.environ.get("NCBI_EMAIL") else {})}
_last_call = [0.0]

def eutils(tool, post=False, **params):
    """Call one E-utility and return raw bytes. POST for long id lists."""
    params = {**params, **IDENT, **({"api_key": API_KEY} if API_KEY else {})}
    gap = 0.11 if API_KEY else 0.35
    body = urllib.parse.urlencode(params)
    url = f"{EUTILS}{tool}.fcgi"
    for attempt in range(6):
        wait = _last_call[0] + gap - time.time()
        if wait > 0:
            time.sleep(wait)
        _last_call[0] = time.time()
        req = urllib.request.Request(url, data=body.encode()) if post else urllib.request.Request(f"{url}?{body}")
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(int(e.headers.get("Retry-After") or 2) * (attempt + 1))
                continue
            raise RuntimeError(f"{tool} HTTP {e.code}: {e.read()[:300]!r}") from None
    raise RuntimeError(f"{tool}: still failing after 6 attempts")

info = json.loads(eutils("einfo", db="pubmed", retmode="json"))["einforesult"]["dbinfo"][0]
print(info["count"], info["dbbuild"])
```

## Search — and check what PubMed actually searched

`esearch` returns a count, up to 9,999 PMIDs and a `querytranslation`: the query PubMed actually
ran after its automatic term mapping. Untagged words are expanded into MeSH terms plus
all-fields matches. `crispr` becomes `"clustered regularly interspaced short palindromic
repeats"[MeSH Terms] OR … OR "crispr"[All Fields]`. Tag a term when you mean something narrower.

| tag | field | example |
|---|---|---|
| `[tiab]` | title or abstract | `crispr[tiab]` |
| `[ti]` | title only | `retraction[ti]` |
| `[mh]` / `[majr]` | MeSH heading / as a major topic | `"Gene Editing"[mh]` |
| `[au]` | author; `Doudna JA[au]` matches both `doudna, ja` and `doudna ja` | `Doudna JA[au]` |
| `[ta]` | journal; `Science[ta]` also matches `science 1979` | `"Nat Methods"[ta]` |
| `[pt]` | publication type | `"retracted publication"[pt]`, `preprint[pt]`, `review[pt]` |
| `[dp]` | publication date, print **or** electronic | `2024[dp]`, `2023:2024[dp]` |
| `[edat]` | Entrez date, when the record entered PubMed (one per record) | `2025/01/01:2025/03/31[edat]` |
| `[filter]` / `[sb]` | subsets | `"pubmed pmc open access"[filter]`, `free full text[sb]` |

Five ways a query fails without an error, all observed 2026-11-06:

| query | what happened | count |
|---|---|---|
| `crispr[tiabb]` (typo in the tag) | tag silently dropped and searched as all fields; `fieldsnotfound` is **empty** | 72,438 instead of 66,375 |
| `crispr AND (` | the dangling `AND (` is ignored, reported only in `warninglist.outputmessages` | 72,438 |
| `crispr[tiab] OR zzqqxxyy[tiab]` | the unknown word is dropped, so the OR runs on one side | 66,375 |
| `"retraction of publication"[pt]` | not a publication type; `quotedphrasesnotfound`, no error | 0 |
| `"Database resources of the National Center for Biotechnology Information"[ti]` | a real title, but quoted phrases match only PubMed's phrase index | 0 |

`search()` checks all of them. It raises on anything in `errorlist`, on any warning other than an
honest "No items found.", and on a tagged word that turns up in the translation as
`[All Fields]`, which is the only sign of a misspelled tag. The real
"retraction notice" type is `"retraction notice"[pt]`.

```python
def search(term, **extra):
    """Return (count, translation). Raise when PubMed rewrote or ignored part of the query."""
    # strict=False: backend error messages carry raw newlines, which strict JSON rejects
    r = json.loads(eutils("esearch", db="pubmed", term=term, retmode="json", retmax=0, **extra), strict=False)
    r = r["esearchresult"]
    if "ERROR" in r:
        raise RuntimeError(r["ERROR"])
    tr = r.get("querytranslation", "")
    errors = {k: v for k, v in r.get("errorlist", {}).items() if v}
    warn = r.get("warninglist", {})
    notes = [m for m in warn.get("outputmessages", []) if m != "No items found."]
    if errors or notes or warn.get("quotedphrasesnotfound") or warn.get("phrasesignored"):
        raise ValueError(f"{term!r}: PubMed changed the query — errors={errors} "
                         f"warnings={warn} — it ran {tr!r}")
    for word, tag in re.findall(r'("[^"]+"|[^\s()"]+)\[([^\]]+)\]', term):
        if tag.lower() not in ("all", "all fields") and f'{word.strip(chr(34)).lower()}"[all fields]' in tr.lower():
            raise ValueError(f"[{tag}] was not recognised — {word} was searched in all fields: {tr!r}")
    return int(r["count"]), tr

print(search("crispr[tiab] AND 2025/01/01:2025/03/31[edat]"))
for bad in ["crispr[tiabb]", "crispr AND (", "crispr[tiab] OR zzqqxxyy[tiab]",
            '"retraction of publication"[pt]']:
    try:
        search(bad)
    except ValueError as e:
        print("refused:", str(e)[:110])
```

Errors from the backend, such as the paging limit below, also arrive as **HTTP 200**, with an
`ERROR` key in the JSON body or an `<ERROR>` element in XML. Checking the status code alone
misses them. The JSON error text also contains a raw newline, so a strict `json.loads` raises
`Invalid control character` before you get to read it. Parse with `strict=False`.

## More than 9,999 results — slice by Entrez date, not publication date

`esearch` stops at `retstart` 9,998 for PubMed. Asking for record 10,000 returns
`'retstart' cannot be larger than 9998` as HTTP 200 JSON. The history server (`usehistory=y`, then
`efetch` with `WebEnv`) hits the same wall and answers 400. The way past it is to split the query into
date windows that each hold fewer than 10,000 records.

**Slice on `edat`, not `[dp]`.** A record has one Entrez date but can carry two publication dates
(electronic and print), and `[dp]` matches either. Year slices of `crispr` summed to **79,248** on
`pdat` against a true total of **72,438**. On `edat` they summed to exactly 72,438. `pdat` slices
also mean de-duplicating afterwards, and an overlap at a boundary is hard to see.

```python
import datetime as dt

def all_pmids(term, start=dt.date(1800, 1, 1), end=None):
    """Every PMID for `term`, splitting the Entrez-date range until each window is under 10,000."""
    end = end or dt.date.today() + dt.timedelta(days=1)
    total, _ = search(term)
    out = []

    def window(a, b):
        fmt = {"datetype": "edat", "mindate": a.strftime("%Y/%m/%d"), "maxdate": b.strftime("%Y/%m/%d")}
        n, _ = search(term, **fmt)
        if n == 0:
            return
        if n < 10000:
            r = json.loads(eutils("esearch", db="pubmed", term=term, retmode="json", retmax=9999, **fmt))
            ids = r["esearchresult"]["idlist"]
            if len(ids) != n:
                raise RuntimeError(f"{a}..{b}: count {n} but {len(ids)} ids returned")
            out.extend(ids)
        elif a == b:
            raise RuntimeError(f"{n} records entered on {a} alone — use the baseline files")
        else:
            mid = a + (b - a) // 2
            window(a, mid)
            window(mid + dt.timedelta(days=1), b)

    window(start, end)
    if len(set(out)) != len(out):
        raise RuntimeError("a PMID fell in two windows — the slicing is wrong")
    if len(out) != total:
        print(f"note: {total} at start, {len(out)} collected — records were added or removed mid-run")
    return out

ids = all_pmids("crispr[tiab] AND 2023:2024[dp]")
print(len(ids), ids[:3])
```

For a result set in the hundreds of thousands, use the bulk files instead (see *Get the files*).

## Triage with esummary before fetching full records

`esummary` is the light read: about 1 kB per record against 5–30 kB of XML. It is enough to
decide what to keep. Use POST for long id lists and batches of up to 500. A PMID that does not exist
comes back as `{"uid": …, "error": "cannot get document summary"}` inside a 200 response.

| field | holds |
|---|---|
| `pubtype` | list — look for `Retracted Publication`, `Retraction Notice`, `Review`, `Preprint` |
| `articleids` | `idtype`/`value` pairs: `pubmed`, `doi`, `pmc`, `mid` (author manuscript), `pii` |
| `sortpubdate` | normalised `YYYY/MM/DD 00:00`; safer than `pubdate`, which is free text |
| `references` | **not the bibliography**: comment, erratum and retraction links (`reftype: "Retraction of"`) |
| `pmcrefcount` | citations from articles in PMC only; an empty string when there are none |
| `recordstatus` | `PubMed - indexed for MEDLINE` vs `PubMed` (no MeSH indexing yet, or never) |

```python
def summaries(pmids, batch=500):
    out, missing = {}, []
    for i in range(0, len(pmids), batch):
        chunk = pmids[i:i + batch]
        res = json.loads(eutils("esummary", post=True, db="pubmed", id=",".join(chunk), retmode="json"))["result"]
        for u in res["uids"]:
            (missing.append(u) if "error" in res[u] else out.__setitem__(u, res[u]))
    return out, missing

s, missing = summaries(["22745249", "9500320", "99999999"])
for u, d in s.items():
    ids = {a["idtype"]: a["value"] for a in d["articleids"]}
    print(u, d["sortpubdate"][:10], d["pubtype"], ids.get("doi"), ids.get("pmc"))
print("missing:", missing)
```

## Fetch and parse full records

`efetch` with `retmode=xml` returns the complete citation. Use POST in batches of 200. Four parsing
mistakes are easy to make, and each fails silently:

1. **Unanchored id lookups read the bibliography.** Every `ReferenceList/Reference` carries its
   own `ArticleIdList`, so building `{IdType: text}` over `iter("ArticleId")` lets the last
   *cited* paper overwrite the article's own ids. For PMID 22745249 that dict gives
   `pubmed: 21828278` and `pmc: PMC3176093`, both belonging to its 38th reference. In 200
   *Nature* papers from 2025, it gave the wrong DOI for 137 and the wrong PMCID for 126.
   Read only `PubmedData/ArticleIdList` (or `PubmedBookData/ArticleIdList`). Prefer it to
   `ELocationID`, which is often absent: the 1998 Wakefield paper has no `ELocationID` but does
   have a DOI in `ArticleIdList`.
2. **`.text` truncates at the first inline tag.** Abstracts and titles carry `<i>`, `<sup>`,
   `<sub>` and `<b>`. In 200 CRISPR records from 2025, **125** `AbstractText` elements gave a
   different string through `.text` than through `itertext()`. The GeneReviews chapter
   20301425 has an `ArticleTitle` that opens with `<i>`, so `.text` returns an empty string.
3. **Not every record is a `PubmedArticle`.** NCBI Bookshelf chapters come back as
   `PubmedBookArticle`, with `BookDocument` in place of `MedlineCitation`. Of the 500 newest
   `2001[dp]` hits, **208** were book records, so `findall("PubmedArticle")` would have dropped
   42% of them.
4. **Missing PMIDs are dropped, not reported.** Fetching `22745249,1,99999999` returns two records
   and no error. Compare what came back against what was asked for.

For a book record, `year` is the book's `PubDate`: 1993 for every GeneReviews chapter, the
year the series began. The chapter's own date is `BookDocument/ContributionDate`.

A structured abstract is several `AbstractText` elements, each with a `Label` (`BACKGROUND`,
`METHODS`, …). Many records have no abstract at all: 102 of 200 sampled from 1990 and 481 of
500 from 1965.

```python
import xml.etree.ElementTree as ET

def _t(el):
    return " ".join("".join(el.itertext()).split()) if el is not None else ""

def parse(node):
    book = node.tag == "PubmedBookArticle"
    cit = node.find("BookDocument" if book else "MedlineCitation")
    art = cit if book else cit.find("Article")
    ids = {a.get("IdType"): a.text for a in
           node.findall(("PubmedBookData" if book else "PubmedData") + "/ArticleIdList/ArticleId")}
    pubtypes = [p.text for p in art.findall("PublicationTypeList/PublicationType") + art.findall("PublicationType")]
    links = [(c.get("RefType"), c.findtext("PMID")) for c in cit.findall("CommentsCorrectionsList/CommentsCorrections")]
    date = art.find("Journal/JournalIssue/PubDate") if not book else cit.find("Book/PubDate")
    year = (date.findtext("Year") or (date.findtext("MedlineDate") or "")[:4]) if date is not None else ""
    authors = []
    for a in art.findall("AuthorList/Author"):
        authors.append(a.findtext("CollectiveName") or f"{a.findtext('LastName') or ''} {a.findtext('Initials') or ''}".strip())
    return {
        "pmid": cit.findtext("PMID"),
        "type": "book" if book else "article",
        "title": _t(art.find("ArticleTitle")) or _t(cit.find("Book/BookTitle")),
        "abstract": "\n".join((f"{a.get('Label')}: " if a.get("Label") else "") + _t(a)
                              for a in art.findall("Abstract/AbstractText")),
        "authors": authors,
        "journal": art.findtext("Journal/Title") or cit.findtext("Book/BookTitle") or "",
        "year": year,
        "doi": ids.get("doi"), "pmcid": ids.get("pmc"),
        "pubtypes": pubtypes,
        "mesh": [d.text for d in cit.findall("MeshHeadingList/MeshHeading/DescriptorName")],
        "retracted": "Retracted Publication" in pubtypes or any(t == "RetractionIn" for t, _ in links),
        "retraction_notice_for": [p for t, p in links if t == "RetractionOf"],
        "concern": [p for t, p in links if t == "ExpressionOfConcernIn"],
        "n_references": len(node.findall("PubmedData/ReferenceList/Reference")),
    }

def fetch(pmids, batch=200):
    recs = []
    for i in range(0, len(pmids), batch):
        root = ET.fromstring(eutils("efetch", post=True, db="pubmed", id=",".join(pmids[i:i + batch]), retmode="xml"))
        if root.tag == "eFetchResult":
            raise RuntimeError(root.findtext("ERROR"))
        recs += [parse(n) for n in root if n.tag in ("PubmedArticle", "PubmedBookArticle")]
    got = {r["pmid"] for r in recs}
    return recs, [p for p in pmids if p not in got]

recs, missing = fetch(["22745249", "9500320", "20301425", "99999999"])
for r in recs:
    print(r["pmid"], r["type"], r["year"], r["doi"], r["pmcid"], r["retracted"], r["title"][:50])
print("missing:", missing)
```

### Retractions and corrections

Retraction is recorded in two places, and a record can show either. The retracted article
gets the publication type `Retracted Publication` and a `CommentsCorrections` entry
`RefType="RetractionIn"` pointing at the notice. The notice is its own PMID, with type
`Retraction Notice` and a `RetractionOf` link back. PMID 9500320 has **two** `RetractionIn`
links (2004 and 2010) and an `ExpressionOfConcernIn`. Check `retracted` before an abstract goes
into a review. Searching `"retracted publication"[pt]` finds 35,526 of them, and `NOT` with that
filter drops them from a search.

### Citations

- **Cited by**: `elink` with `linkname=pubmed_pubmed_citedin` returns PMIDs of citing articles,
  but only those **in PMC**: 501 for PMID 9500320. That is a floor, not a citation count.
- **References**: `PubmedData/ReferenceList` is filled in only when the publisher or PMC supplied
  it (38 entries for 22745249, none for 9500320). An empty list does not mean the paper cites nothing.

```python
r = json.loads(eutils("elink", dbfrom="pubmed", db="pubmed", linkname="pubmed_pubmed_citedin",
                      id="9500320", retmode="json"))
sets = r["linksets"][0].get("linksetdbs", [])
print(sum(len(s["links"]) for s in sets), "citing articles held in PMC")
```

## Full text from PubMed Central

PubMed holds abstracts. Full text is in PMC, and only part of PMC may be redistributed. Getting from
a PMID to text you may lawfully keep takes three steps.

**1. PMID → PMCID** with the ID Converter. A PMID with no PMC copy comes back as
`"status": "error", "errmsg": "Identifier not found in PMC"` inside a 200. One request takes up
to **200 ids of a single type**. Mixing `PMC…` and PMIDs, or sending 201, returns 400.

```bash
curl -s "https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?ids=22745249,9500320,16060722&format=json&tool=pubmed-skill"
```

**2. Read the PMC Open Access bucket's metadata.** `s3://pmc-oa-opendata` is a public AWS Open
Data bucket, readable over plain HTTPS with no account and no requester-pays setting. Every
article has `metadata/PMC<id>.<version>.json` with its licence (`license_code`: `CC BY`,
`CC BY-NC`, `CC0`, … or `null`), `is_retracted`, `is_manuscript`, and links to `.xml` (JATS),
`.txt` and `.pdf`, each with an md5.

Two traps in reaching it:

- **The version is not always 1.** PMC1182327 exists only as `PMC1182327.2`, so a hard-coded
  `.1` returns `NoSuchKey`. List the versions and take the highest.
- **List with a trailing dot.** `prefix=metadata/PMC1182327` also matches `PMC11823271` through
  `PMC11823279`. `prefix=metadata/PMC1182327.` does not.

**Not in the bucket means not redistributable here.** PMC6286148, the author manuscript of PMID
22745249, has no keys in the bucket. The BioC full-text API says "No result can be found".
`efetch db=pmc` returns **HTTP 200 with 8 kB of front matter and no `<body>`**. The only
sign is an XML comment: "The publisher of this article does not allow downloading of the full
text in XML form." Check for `<body` before treating an `efetch db=pmc` response as full text.

```python
import hashlib

S3 = "https://pmc-oa-opendata.s3.amazonaws.com/"

def pmc_oa_meta(pmcid):
    """Latest-version metadata from the PMC OA bucket, or None if the article is not in it."""
    listing = urllib.request.urlopen(f"{S3}?list-type=2&prefix=metadata/{pmcid}.", timeout=60).read().decode()
    versions = [int(v) for p, v in re.findall(r"<Key>metadata/(PMC\d+)\.(\d+)\.json</Key>", listing) if p == pmcid]
    if not versions:
        return None
    return json.loads(urllib.request.urlopen(f"{S3}metadata/{pmcid}.{max(versions)}.json", timeout=60).read())

def pmc_download(meta, kind, dest):
    """kind is 'xml', 'text' or 'pdf'. Verifies the md5 the bucket publishes."""
    url, md5 = meta[f"{kind}_url"].replace("s3://pmc-oa-opendata/", S3).split("?md5=")
    data = urllib.request.urlopen(url, timeout=120).read()
    if hashlib.md5(data).hexdigest() != md5:
        raise IOError(f"{url}: md5 mismatch")
    with open(dest, "wb") as f:
        f.write(data)
    return len(data)

for pmcid in ["PMC1182327", "PMC3000000", "PMC6286148"]:
    m = pmc_oa_meta(pmcid)
    print(pmcid, "not in the OA bucket" if m is None else
          (m["version"], m["license_code"], m["is_retracted"], m["title"][:45]))
```

`license_code` is what governs reuse. `CC BY` and `CC0` allow text mining and redistribution
with attribution. `CC BY-NC` and `CC BY-NC-ND` forbid commercial reuse. `null` (PMC3000000 is
one) means PMC holds no machine-readable licence, so read the `<license>` element in the JATS
before redistributing. Record the licence beside every file you save.

## Get the files

This writes a self-describing result set to one directory:

- `query.json` — the term, PubMed's translation, the count, the PubMed build and the date.
- `pmids.txt` — every PMID, one per line.
- `records.jsonl` — one parsed record per line, from the `parse()` above.
- `fulltext/` — the JATS XML of every hit in the PMC Open Access bucket.
- `fulltext/manifest.tsv` — one row per PMID, with its licence, or the reason no full text was saved.

```python
import csv, pathlib

def save_pubmed(term, outdir, fulltext=True):
    out = pathlib.Path(outdir)
    (out / "fulltext").mkdir(parents=True, exist_ok=True)
    count, translation = search(term)
    pmids = all_pmids(term) if count >= 10000 else json.loads(
        eutils("esearch", db="pubmed", term=term, retmode="json", retmax=9999))["esearchresult"]["idlist"]
    recs, missing = fetch(pmids)
    (out / "pmids.txt").write_text("\n".join(pmids) + "\n")
    with open(out / "records.jsonl", "w") as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    build = json.loads(eutils("einfo", db="pubmed", retmode="json"))["einforesult"]["dbinfo"][0]["dbbuild"]
    (out / "query.json").write_text(json.dumps({
        "term": term, "translation": translation, "count": count, "fetched": len(recs),
        "missing": missing, "pubmed_build": build, "date": dt.date.today().isoformat()}, indent=1))
    if fulltext:
        with open(out / "fulltext" / "manifest.tsv", "w", newline="") as f:
            w = csv.writer(f, delimiter="\t")
            w.writerow(["pmid", "pmcid", "version", "license", "retracted", "file", "note"])
            for r in recs:
                if not r["pmcid"]:
                    w.writerow([r["pmid"], "", "", "", r["retracted"], "", "no PMC copy"])
                    continue
                m = pmc_oa_meta(r["pmcid"])
                if m is None:
                    w.writerow([r["pmid"], r["pmcid"], "", "", r["retracted"], "", "not in PMC OA bucket"])
                    continue
                name = f"{r['pmcid']}.{m['version']}.xml"
                pmc_download(m, "xml", out / "fulltext" / name)
                w.writerow([r["pmid"], r["pmcid"], m["version"], m["license_code"] or "",
                            r["retracted"] or m["is_retracted"], name, ""])
    return out, len(recs), missing

path, n, missing = save_pubmed('"Ioannidis JP"[au] AND "PLoS Med"[ta] AND 2005[dp]', "pubmed_ioannidis_2005")
print(path, n, "records; missing", missing)
print((path / "fulltext" / "manifest.tsv").read_text())
```

### Whole-corpus work: the baseline files

For the full corpus, or a result set too big to slice politely, NLM publishes the whole of
PubMed as gzipped XML once a year, with daily updates. Each file carries an `.md5` beside it.

- `https://ftp.ncbi.nlm.nih.gov/pubmed/baseline/` — `pubmed26n0001.xml.gz` to
  `pubmed26n1334.xml.gz`, released January 2026. The first file is 19.7 MB.
- `https://ftp.ncbi.nlm.nih.gov/pubmed/updatefiles/` — from `pubmed26n1335.xml.gz`, one or
  more per day (`pubmed26n1715.xml.gz` on 2026-11-05). These include revised records and
  `DeleteCitation` blocks, so replay them in order on top of the baseline.

Check a file's size and checksum before committing to a transfer:

```bash
curl -sI https://ftp.ncbi.nlm.nih.gov/pubmed/baseline/pubmed26n0001.xml.gz | grep -iE "content-length|last-modified"
curl -s https://ftp.ncbi.nlm.nih.gov/pubmed/baseline/pubmed26n0001.xml.gz.md5
```

The records use the same `PubmedArticle` / `PubmedBookArticle` schema, so `parse()` works on them
unchanged.

## What PubMed will not give you

- **Full text of most articles.** Only the PMC Open Access subset is redistributable. Author
  manuscripts and publisher-restricted PMC articles can be read on the website but not
  bulk-retrieved.
- **A citation count.** `pmcrefcount` and `pubmed_pubmed_citedin` count citations from PMC
  articles only.
- **Rights to the abstracts.** NLM provides the records free of charge, but abstracts can remain
  the publishers' copyright (GeneReviews records carry a `CopyrightInformation` line). NLM's terms
  are at <https://www.nlm.nih.gov/databases/download/terms_and_conditions.html>. Summarising and
  mining are routine; republishing abstracts wholesale is the publisher's call.
- **Stable result sets.** A search re-run tomorrow returns more records, and existing records are
  revised (`DateRevised` 2026-02-04 on a 2012 paper). Save the `query.json` with every result set.

## Try it

**Data.** Six PMIDs, each chosen to exercise one trap, plus two PMC Open Access records. All
are public, need no account, and were confirmed reachable on 2026-11-06.

| id | why it is here |
|---|---|
| 22745249 | Jinek et al. 2012, *Science* — its reference list overwrites unanchored ids, and its PMC author manuscript is **not** in the OA bucket |
| 9500320 | Wakefield et al. 1998, *Lancet* — retracted twice, no `ELocationID` |
| 15016483 | the 2004 retraction notice for 9500320 |
| 20301425 | GeneReviews BRCA1/2 chapter — a `PubmedBookArticle` whose title starts with `<i>` |
| 16060722 | Ioannidis 2005, *PLoS Med* — CC BY, OA version 2 only (PMC1182327) |
| 99999999 | does not exist |

**Run.** Self-contained: standard library only, no key, about 45 requests, taking under a minute.

```python
import json, re, time, urllib.request, urllib.parse, urllib.error, xml.etree.ElementTree as ET

def get(url, data=None):
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=120) as r:
                time.sleep(0.4)
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(2 * (attempt + 1))

EU = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
want = ["22745249", "9500320", "15016483", "20301425", "16060722", "99999999"]
root = ET.fromstring(get(EU + "efetch.fcgi", urllib.parse.urlencode(
    {"db": "pubmed", "id": ",".join(want), "retmode": "xml"}).encode()))
nodes = {n.find("*/PMID").text: n for n in root}
tx = lambda e: " ".join("".join(e.itertext()).split())

missing = [p for p in want if p not in nodes]
print("returned", len(nodes), "of", len(want), "- missing", missing)
assert missing == ["99999999"]

jinek = nodes["22745249"]
anchored = {a.get("IdType"): a.text for a in jinek.findall("PubmedData/ArticleIdList/ArticleId")}
naive = {a.get("IdType"): a.text for a in jinek.iter("ArticleId")}
print("Jinek anchored", anchored["pubmed"], anchored["pmc"], "| naive", naive["pubmed"], naive["pmc"],
      "| references:", len(jinek.findall("PubmedData/ReferenceList/Reference")))
assert anchored["pubmed"] == "22745249" and anchored["pmc"] == "PMC6286148"
assert naive["pubmed"] != "22745249" and naive["pmc"] != "PMC6286148"

wake = nodes["9500320"]
pts = [p.text for p in wake.iter("PublicationType")]
rin = [c.findtext("PMID") for c in wake.iter("CommentsCorrections") if c.get("RefType") == "RetractionIn"]
print("Wakefield", pts, "RetractionIn", rin, "ELocationID", wake.find(".//ELocationID"))
assert "Retracted Publication" in pts and "15016483" in rin
assert wake.find(".//ELocationID") is None
assert wake.find("PubmedData/ArticleIdList/ArticleId[@IdType='doi']") is not None

notice = [p.text for p in nodes["15016483"].iter("PublicationType")]
assert "Retraction Notice" in notice

book = nodes["20301425"]
assert book.tag == "PubmedBookArticle"
title = book.find("BookDocument/ArticleTitle")
print("GeneReviews .text =", repr(title.text), "| itertext =", tx(title)[:60])
assert not (title.text or "").strip() and tx(title).startswith("BRCA1")

# search: a tag typo is silently widened, and slicing must use edat
def es(term, **kw):
    q = urllib.parse.urlencode({"db": "pubmed", "term": term, "retmode": "json", "retmax": 0, **kw})
    return json.loads(get(EU + "esearch.fcgi?" + q), strict=False)["esearchresult"]
good, typo = es("crispr[tiab]"), es("crispr[tiabb]")
print("crispr[tiab]", good["count"], "| crispr[tiabb]", typo["count"], "fieldsnotfound", typo["errorlist"]["fieldsnotfound"])
assert int(typo["count"]) > int(good["count"]) and '"crispr"[All Fields]' in typo["querytranslation"]
cap = es("crispr", retstart=10000)
assert "9998" in cap["ERROR"]

term = "crispr[tiab] AND 2016:2018[dp]"
total = int(es(term)["count"])
yrs = range(2010, 2028)
by_edat = sum(int(es(term, datetype="edat", mindate=f"{y}/01/01", maxdate=f"{y}/12/31")["count"]) for y in yrs)
by_pdat = sum(int(es(term, datetype="pdat", mindate=f"{y}/01/01", maxdate=f"{y}/12/31")["count"]) for y in yrs)
print("total", total, "| edat slices", by_edat, "| pdat slices", by_pdat)
assert by_edat == total and by_pdat > total

# PMC OA: version 2 only, and a trailing dot on the prefix
S3 = "https://pmc-oa-opendata.s3.amazonaws.com/"
loose = re.findall(r"<Key>([^<]+)</Key>", get(S3 + "?list-type=2&prefix=metadata/PMC1182327").decode())
tight = re.findall(r"<Key>([^<]+)</Key>", get(S3 + "?list-type=2&prefix=metadata/PMC1182327.").decode())
meta = json.loads(get(S3 + tight[-1]))
print("PMC1182327 keys:", len(loose), "loose /", tight, "| licence", meta["license_code"], "| pmid", meta["pmid"])
assert tight == ["metadata/PMC1182327.2.json"] and len(loose) > 1
assert meta["pmid"] == 16060722 and meta["license_code"] == "CC BY"
manuscript = get(S3 + "?list-type=2&prefix=metadata/PMC6286148.").decode()
assert "<KeyCount>0</KeyCount>" in manuscript
pmc = get(EU + "efetch.fcgi?db=pmc&id=PMC6286148").decode()
print("PMC6286148 efetch:", len(pmc), "bytes, has <body>:", "<body" in pmc)
assert "<body" not in pmc and "does not allow downloading" in pmc
```

**Expect.**

Invariants. These hold whatever the build, so a failure means the skill is wrong:

- A non-existent PMID is dropped from `efetch` without an error, so missing ids must be
  computed.
- For 22745249, the anchored `PubmedData/ArticleIdList` gives its own PMID and PMCID. A dict
  over every `ArticleId` gives a cited paper's ids instead.
- 9500320 is `Retracted Publication` with a `RetractionIn` to 15016483, has no `ELocationID`,
  and has a DOI in `ArticleIdList`. 15016483 is a `Retraction Notice`.
- 20301425 is a `PubmedBookArticle`. Its title's `.text` is empty and `itertext()` is not.
- A typo in a field tag widens the search to all fields and leaves `fieldsnotfound` empty.
- `retstart=10000` is refused with an `ERROR` in a 200 response.
- Entrez-date slices sum to the total, and publication-date slices exceed it.
- PMC1182327 has only version 2, and the unanchored prefix matches other articles.
- PMC6286148 is absent from the OA bucket, and `efetch db=pmc` returns it without a `<body>`.

Observed 2026-11-06 (PubMed build 2026.11.05). These move as PubMed grows, so a mismatch is drift
to investigate, not a failure:

```
returned 5 of 6 - missing ['99999999']
Jinek anchored 22745249 PMC6286148 | naive 21828278 PMC3176093 | references: 38
Wakefield ['Journal Article', "Research Support, Non-U.S. Gov't", 'Retracted Publication'] RetractionIn ['15016483', '20137807'] ELocationID None
GeneReviews .text = None | itertext = BRCA1- and BRCA2-Associated Hereditary Breast and Ovarian Ca
crispr[tiab] 66375 | crispr[tiabb] 72438 fieldsnotfound []
total 8864 | edat slices 8864 | pdat slices 10128
PMC1182327 keys: 10 loose / ['metadata/PMC1182327.2.json'] | licence CC BY | pmid 16060722
PMC6286148 efetch: 8364 bytes, has <body>: False
```

The method was also run on a 1965, a 1975, a 1990 and a 2001 year sample (500 records each
where available), on 200 CRISPR papers from 2025, and on PMC3000000 (licence `null`) and
PMC10000000 (an 1867 historical OCR scan, `CC0`). Those runs are where the abstract, book-record
and licence findings above come from.

## Sources

- E-utilities documentation — https://www.ncbi.nlm.nih.gov/books/NBK25501/
- PubMed search field tags — https://pubmed.ncbi.nlm.nih.gov/help/#search-tags
- PMC ID Converter API — https://pmc.ncbi.nlm.nih.gov/tools/id-converter-api/
- PMC Article Datasets on AWS — https://registry.opendata.aws/ncbi-pmc/
- PubMed baseline and update files — https://ftp.ncbi.nlm.nih.gov/pubmed/baseline/README.txt
- NLM data terms — https://www.nlm.nih.gov/databases/download/terms_and_conditions.html
- Sayers et al. (2026) Database resources of the NCBI in 2026. *Nucleic Acids Research* — PMID 41385079
