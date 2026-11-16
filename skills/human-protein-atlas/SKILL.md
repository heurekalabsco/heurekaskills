---
name: human-protein-atlas
description: Fetch Human Protein Atlas data by Ensembl gene id, pinned to a release — normal-tissue IHC with reliability scores, RNA tissue and single-cell consensus, subcellular location, cancer IHC — from per-gene JSON, the search API or bulk TSVs.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [proteomics, transcriptomics, antibody, single-cell, public-data]
covers: [human protein atlas, hpa, proteinatlas, immunohistochemistry, ihc, antibody staining, protein expression, tissue atlas, normal tissue, reliability score, enhanced validation, subcellular location, cell atlas, immunofluorescence, rna tissue consensus, ntpm, single cell type, ncpm, pathology atlas, cancer, tissue specificity, secretome, ensembl gene id, liver, kidney, brain, testis, skin, stomach, human]
papers: [PMID:25613900, PMID:28495876, PMID:28818916, PMID:34321199, PMID:32139519]
access: [open]
datasets: [https://v25.proteinatlas.org/ENSG00000141510.json, https://v25.proteinatlas.org/ENSG00000141510.xml, https://v25.proteinatlas.org/download/tsv/normal_ihc_data.tsv.zip, https://v25.proteinatlas.org/download/tsv/rna_tissue_consensus.tsv.zip, https://v25.proteinatlas.org/download/tsv/rna_single_cell_type.tsv.zip, https://v25.proteinatlas.org/download/tsv/subcellular_location.tsv.zip, https://v25.proteinatlas.org/download/tsv/cancer_data.tsv.zip]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-15
  against: Human Protein Atlas v26.0 (released 2026-11-11, live at www) and the frozen v25 (serves 25.1), v24 and v23 archives / Ensembl 109 gene ids / Python 3.12 standard library only / curl 8.7.1
  executed: 7
  unverified: 0
---
# Human Protein Atlas

The Human Protein Atlas (HPA) is the answer to *where in the human body, and where in the cell,
is this protein* — antibody staining across ~45 normal tissues and ~20 cancers, an
immunofluorescence map of subcellular location, and RNA expression (bulk tissue consensus and
single-cell type) for the same ~20,000 protein-coding genes, all keyed on the Ensembl gene id.

Three things decide whether work built on it is right, and each has its own section below:

1. **A release is not "the HPA".** The live site moved from v25 to v26 on 2026-11-11, and on
   that day 2,730 genes changed their tissue-staining reliability call: 2,050 lost their IHC
   tissue data altogether, 15 gained it, and 665 moved between two scores. Pin a numbered
   archive, and record which one you used.
2. **An IHC level is an antibody-staining call, not an abundance.** `High` means an annotator
   scored strong staining in that cell type with that antibody. How much to believe it is
   what the reliability score is for, and the gap between `Enhanced` and `Uncertain` is
   measurable (below).
3. **Key on the Ensembl gene id, never the symbol.** One old symbol resolves to two current
   genes, and ten current symbols each name two different Ensembl genes in the v26 atlas.

Everything here is `https`, no account, no key. Every block is Python standard library only.

## Licence — it changed between releases

The licence page is versioned with the data, so the release you pin decides the terms you
inherit. Read 2026-11-15:

| release | licence for HPA's own content | source |
|---|---|---|
| v25 and v26 (current) | CC BY 4.0 | https://www.proteinatlas.org/about/licence , https://v25.proteinatlas.org/about/licence |
| v24 | CC BY-SA 4.0 | https://v24.proteinatlas.org/about/licence |
| v23 and older | CC BY-SA 3.0 | https://v23.proteinatlas.org/about/licence |

The current page's operative sentence:

> The Human Protein Atlas is licensed under the Creative Commons Attribution 4.0 International
> License for all copyrightable parts of our database.

and it adds that the HPA encourages use "for your research and commercial purposes". Older
pages say Attribution-ShareAlike and restrict it to the parts marked `source="HPA"` in the XML.

**What share-alike means for you, if you pin v24 or older.** Using the data, analysing it and
publishing findings in your own words triggers nothing beyond attribution. Share-alike bites
when you *redistribute an adaptation* — a filtered or merged table built from the files, a
re-hosted subset, a database that incorporates them. That adaptation has to go out under the
same licence (BY-SA, the same or a compatible later version), with attribution and a note of
what you changed, and you may not add terms that stop others re-using it. In practice: a
supplementary table derived from v24 IHC calls is a BY-SA table, and cannot be dropped into a
CC BY or proprietary resource. From v25 on, attribution alone is required. This page describes
the licences' mechanism; it is not legal advice.

**Attribution the HPA asks for**: cite a primary HPA paper (the tissue atlas paper is
PMID:25613900; subcellular PMID:28495876; pathology PMID:28818916; single cell type
PMID:34321199; brain PMID:32139519), cite the site, and for a specific gene or image give a URL
on the **versioned** host — `v25.proteinatlas.org/...` — which is the same pinning this skill
does for reproducibility.

**Third-party data inside the HPA keeps its own terms.** The licence page lists them; among
those relevant here, GTEx (part of the RNA tissue consensus) is under its own user terms,
Metabolic Atlas and IUPHAR are BY-SA 4.0, and AlphaFold 3 structures shown on the site are
BY-NC-SA 4.0. The tables this skill fetches are HPA-generated, but if you go beyond them, check
that list. The skill page itself is CC-BY-4.0 because it is our own text.

## Versions and pinning

Every past release lives on its own subdomain, and the subdomain serves **that release's data**,
not a copy of the current one. The release number is stamped into every per-gene XML record,
which is the only machine-readable version marker the site exposes — read it rather than
trusting the hostname:

```python
import gzip, io, json, re, urllib.error, urllib.parse, urllib.request

UA = {"User-Agent": "hpa-skill"}


def host(version=None):
    """None -> the live site; 25 -> the frozen v25 archive."""
    return "https://www.proteinatlas.org" if version is None \
        else f"https://v{int(version)}.proteinatlas.org"


def open_url(url, timeout=120):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)


def served_version(version=None):
    """The HPA major version a host is actually serving, read from the
    schemaLocation stamped into every per-gene XML record."""
    with open_url(f"{host(version)}/ENSG00000141510.xml") as r:
        head = r.read(600).decode()
    m = re.search(r"//v(\d+)\.proteinatlas\.org/download/proteinatlas\.xsd", head)
    if not m:
        raise RuntimeError(f"no version stamp in {host(version)} XML head")
    return int(m.group(1))


for v in (None, 25, 24, 23):
    print(f"{host(v):34} serves v{served_version(v)}")

# The current release has no frozen subdomain of its own yet: it redirects to www.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None
try:
    urllib.request.build_opener(NoRedirect).open(
        urllib.request.Request("https://v26.proteinatlas.org/", headers=UA), timeout=60)
except urllib.error.HTTPError as e:
    print("v26.proteinatlas.org ->", e.code, e.headers["Location"])
```

```
https://www.proteinatlas.org       serves v26
https://v25.proteinatlas.org       serves v25
https://v24.proteinatlas.org       serves v24
https://v23.proteinatlas.org       serves v23
v26.proteinatlas.org -> 302 https://www.proteinatlas.org/
```

What follows from that:

- **The current release cannot be pinned by URL.** `www` is v26 today and will be v27 the day
  it ships, at the same addresses. `v26.proteinatlas.org` currently redirects to `www`; whether
  it starts serving frozen v26 once v27 is out has not been observed, so check with
  `served_version(26)` rather than assuming. For anything you will publish, pin the newest
  frozen archive (v25 on 2026-11-15) — or use `www`, record `served_version()` and the files'
  `Last-Modified` dates, and accept that nobody can re-fetch exactly what you had.
- **A subdomain holds the last point release of its major version.** `v25` serves 25.1
  (released 2026-05-25); 25.0 is not separately retrievable.
- **The gene universe is Ensembl 109 in every release from v23 to v26.** Same 20,162 genes in
  the search API at v23, v24, v25 and v26; what moves between releases is the annotation.
- **How much moves.** Between v25 and v26, 2,730 genes changed `Reliability (IH)`. Of those,
  2,065 moved to or from no data — 2,050 lost their IHC tissue calls (e.g. AAR2, `Uncertain`
  in v25, absent in v26) and 15 gained them — and 665 moved between two scores. The number of
  genes with no IHC tissue data rose from 4,850 to 6,885, a net change of 2,035. The v26
  release notes give the same figures: a quality control comparing IHC with RNA and MS data
  "resulted in the removal of antibody data for 2,050 genes and a change in reliability score
  for 665 genes", and "Antibody-based protein data for 15 new genes was added"
  (https://www.proteinatlas.org/about/releases, read 2026-11-15). Not a bug; a release.

The release dates and Ensembl version are listed at https://www.proteinatlas.org/about/releases.

## Symbol to Ensembl id

The search API resolves symbols, but a bare search is free text and a `gene_name:` search
matches **synonyms as well as current symbols** — so more than one hit is normal, and taking
the first row is how a join goes wrong silently.

```python
API = "/api/search_download.php"


def search(query, columns, version=None):
    """Rows for a search, as dicts. Always JSON, always uncompressed.

    Returns (rows, total) where total is the server's X-Total-Results."""
    qs = urllib.parse.urlencode({"search": query, "format": "json",
                                 "columns": ",".join(columns), "compress": "no"})
    with open_url(f"{host(version)}{API}?{qs}") as r:
        ctype = r.headers.get("Content-Type", "")
        body = r.read()
        total = int(r.headers.get("X-Total-Results", -1))
    if body[:2] == b"\x1f\x8b":            # gzip even though we asked for none
        body = gzip.decompress(body)
    if "json" not in ctype and not body.lstrip().startswith(b"["):
        raise RuntimeError(f"not JSON ({ctype}) for {query!r}")
    return json.loads(body), total


def resolve(symbol, version=None):
    """Symbol -> list of (current symbol, Ensembl gene id).

    gene_name: matches the current symbol AND every synonym, so more than one
    hit is normal. Never take rows[0]."""
    rows, _ = search(f"gene_name:{symbol}", ["g", "eg", "gs"], version)
    return [(r["Gene"], r["Ensembl"]) for r in rows]


rows, total = search("TP53", ["g", "eg"])
print(f"free text 'TP53'      : {total} genes, first five {[r['Gene'] for r in rows[:5]]}")
for s in ["TP53", "C10orf2", "MLL2", "AIM1", "MATR3", "LINC00473"]:
    print(f"gene_name:{s:10}: {resolve(s)}")
```

```
free text 'TP53'      : 45 genes, first five ['TP53', 'TP53INP1', 'TP53TG3', 'TP53RK', 'TP53TG3B']
gene_name:TP53      : [('TP53', 'ENSG00000141510')]
gene_name:C10orf2   : [('TWNK', 'ENSG00000107815')]
gene_name:MLL2      : [('KMT2B', 'ENSG00000272333'), ('KMT2D', 'ENSG00000167548')]
gene_name:AIM1      : [('AURKB', 'ENSG00000178999'), ('CRYBG1', 'ENSG00000112297'), ('SLC45A2', 'ENSG00000164175')]
gene_name:MATR3     : [('MATR3', 'ENSG00000015479'), ('MATR3', 'ENSG00000280987')]
gene_name:LINC00473 : []
```

Read those rows as the reasons to join on ids:

- **`MLL2` is two different genes.** It is a former name of both KMT2B and KMT2D. A gene list
  from an older paper that says `MLL2` cannot be resolved by the atlas alone — go back to the
  source's own id, or to its coordinates.
- **`AIM1` hits three genes**, none of them named AIM1 today. A label join would attach
  whichever came first.
- **`MATR3` is one symbol on two Ensembl genes** — and both carry identical HPA annotation,
  because the same antibodies map to both. Ten current symbols do this across the atlas in
  v26 (`HERC3`, `MATR3`, `MKKS`, `NOX5`, `NPIPA9`, `PINX1`, `POLR2J3`, `PRODH`, `TBCE`,
  `TMSB15B`). A dict keyed on `Gene name` keeps one and drops the other without a sound.
- **Non-coding genes return nothing.** The atlas covers protein-coding genes; an empty list
  for `LINC00473` is "not in scope", not "no expression".

When the symbols come from another source, map them to Ensembl ids there — `ensembl` and
`uniprot` both do this with release-stamped mappings — and pass ids to the HPA.

## One gene: `/ENSG….json`, `.tsv`, `.xml`

Append a format to the Ensembl id. JSON and TSV carry the same summary fields; XML is the full
record (per-tissue, per-cell-type IHC calls with antibody ids, ~1.8 MB for TP53) and the only
format with the release stamp.

```python
ENSG = re.compile(r"^ENSG\d{11}$")


def gene(ensg, version=None):
    """One gene's summary record as a dict, or None if HPA does not carry it."""
    ensg = ensg.split(".")[0].upper()     # a versioned id redirects to an HTML page
    if not ENSG.match(ensg):
        raise ValueError(f"{ensg!r} is not an Ensembl gene id -- resolve symbols first")
    try:
        with open_url(f"{host(version)}/{ensg}.json") as r:
            if "json" not in r.headers.get("Content-Type", ""):
                raise RuntimeError(f"{ensg}: {r.headers.get('Content-Type')} instead of JSON")
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:                 # body is the text 'Unknown gene ENSG...'
            return None
        raise


rec = gene("ENSG00000141510")
print(len(rec), "fields; v25 had", len(gene("ENSG00000141510", 25)))
for k in ["Gene", "Ensembl", "Uniprot", "Evidence", "Reliability (IH)", "Reliability (IF)",
          "Subcellular main location", "RNA tissue specificity", "Protein tissue specificity",
          "Antibody"]:
    print(f"  {k:28} {rec[k]}")
print("MALAT1 (non-coding)  ->", gene("ENSG00000251562"))
print("ENSG00000141510.18   ->", gene("ENSG00000141510.18")["Gene"])
for v in (None, 25):
    r = gene("ENSG00000131043", v)
    print(f"AAR2 Reliability (IH) at {'www' if v is None else 'v25'}: {r['Reliability (IH)']}")
```

```
136 fields; v25 had 119
  Gene                         TP53
  Ensembl                      ENSG00000141510
  Uniprot                      ['P04637']
  Evidence                     Evidence at protein level
  Reliability (IH)             Enhanced
  Reliability (IF)             Enhanced
  Subcellular main location    ['Nucleoplasm']
  RNA tissue specificity       Low tissue specificity
  Protein tissue specificity   Not detected
  Antibody                     ['CAB002973', 'CAB039238', 'CAB039239', 'HPA051244', 'HPA063532', 'CAB072876']
MALAT1 (non-coding)  -> None
ENSG00000141510.18   -> TP53
AAR2 Reliability (IH) at www: None
AAR2 Reliability (IH) at v25: Uncertain
```

Things that record shows:

- **The field set changes between releases** — 136 keys in v26, 119 in v25, 89 in v23, and
  over 300 in v21 when per-tissue values were still inlined. Read fields by name; never by
  position, and never assume a key exists in an older release.
- **`Protein tissue specificity` is mass spectrometry, not IHC.** TP53 is `Not detected` there
  and `Enhanced` by IHC in the same record. The `Protein …` fields come from the MS tissue
  dataset; the IHC reliability is `Reliability (IH)`. Do not read one as the other.
- **`Reliability (IH)` and `Reliability (IF)` are separate scores** for the tissue (IHC) and
  subcellular (immunofluorescence) atlases, and they disagree often — MATR3 is `Supported` and
  `Approved`. `None` means that atlas has no data for the gene.
- **The per-gene JSON carries no per-tissue IHC levels.** Those are in the XML record or the
  bulk IHC table (*Get the files*).

## Many genes: `api/search_download.php`

For more than a handful of genes, do not loop over `/ENSG….json` — pull the columns you need
for the whole atlas in one call and filter by Ensembl id locally. `search=` with an empty
string returns all 20,162 genes (~2 MB of JSON, 15–40 s).

| parameter | values | notes |
|---|---|---|
| `search` | search string | empty = every gene; `gene_name:X` = symbol or synonym match. Only `AND` and `NOT` exist — there is no `OR`, so a list of ids cannot be fetched in one query |
| `format` | `json`, `tsv` | `xml` is refused with a 400 here (it works on the per-gene URL) |
| `columns` | comma-separated codes | **required** — omitting it gives a 400 HTML page; an **unknown code is silently dropped** |
| `compress` | `yes`, `no` | **default is gzip**: leave it out and you get `application/gzip` |

HPA serves GitHub Actions runners an HTML page for this endpoint where a laptop gets JSON (the
per-gene and bulk-file URLs are unaffected), so the search API is documented here but not
declared in this page's `datasets:` list. Code that runs it in CI must check the content type,
as `search()` does.

The count is in the `X-Total-Results` response header, and a `HEAD` request returns it without
the body (its `Content-Type` reads `text/html` even when the `GET` would be JSON). TSV column order is fixed by the server, not by the order you asked for. Column codes
for the fields most analyses need (the full table of ~100 codes, plus one per TCGA cancer for
prognostics, is at https://www.proteinatlas.org/about/help/dataaccess):

| code | field | code | field |
|---|---|---|---|
| `g` | Gene (symbol) | `relih` | Reliability (IH) — tissue IHC |
| `gs` | Gene synonym | `relce` | Reliability (IF) — subcellular |
| `eg` | Ensembl | `relmb` | Reliability (Mouse Brain) |
| `up` | Uniprot | `scl` / `scml` / `scal` | Subcellular location / main / additional |
| `gd` | Gene description | `secl` | Secretome location **and** function (one code returns both) |
| `chr`, `chrp` | Chromosome, position | `rnats` / `rnatd` | RNA tissue specificity / distribution |
| `pc` | Protein class | `rnatsm` | RNA tissue specific nTPM |
| `pe` | Evidence (protein existence) | `rnascs` / `rnascsm` | RNA single cell type specificity / specific nCPM |
| `di` | Disease involvement | `prts` | Protein tissue specificity (MS) |
| `ab` / `abrr` | Antibody ids / RRIDs | `ectissue` | Tissue expression cluster |

```python
import collections, csv

COLS = {"g": "Gene", "eg": "Ensembl", "up": "Uniprot", "relih": "Reliability (IH)",
        "relce": "Reliability (IF)", "scml": "Subcellular main location",
        "rnats": "RNA tissue specificity", "pe": "Evidence"}


def check_columns(columns, version=None):
    """Probe on one gene: an unknown code is dropped without an error."""
    rows, _ = search("gene_name:TP53", list(columns), version)
    missing = set(columns.values()) - set(rows[0])
    if missing:
        raise KeyError(f"server returned no column for {sorted(missing)}")


def atlas_table(columns, version=None):
    """Every gene in one call (search='')."""
    check_columns(columns, version)
    rows, total = search("", list(columns), version)
    assert len(rows) == total, (len(rows), total)
    return rows


V = 25
rows = atlas_table(COLS, V)
print(len(rows), "genes in v%d" % V)
print(collections.Counter(r["Reliability (IH)"] for r in rows).most_common())

with open(f"hpa_v{V}_genes.tsv", "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t", lineterminator="\n")
    w.writerow(COLS.values())
    for r in rows:
        w.writerow([";".join(v) if isinstance(v, list) else ("" if v is None else v)
                    for v in (r[c] for c in COLS.values())])

try:
    check_columns({"g": "Gene", "zzz": "Made up"})
except KeyError as e:
    print("bad code ->", e)
```

```
20162 genes in v25
[('Approved', 5555), (None, 4850), ('Uncertain', 4157), ('Enhanced', 3937), ('Supported', 1663)]
bad code -> "server returned no column for ['Made up']"
```

**Rate limits.** None are published: the data-access page states none, `robots.txt` disallows
only the staining images, and responses carry no rate-limit headers. Forty serial per-gene
requests on 2026-11-15 all returned `200` at ~0.6 s each. The service is a single Apache host
that already drops long downloads (below), so stay serial, and use the whole-atlas call or the
bulk files rather than thousands of per-gene requests.

## Get the files

The bulk tables are zipped TSVs, one file per zip. Fetch them from a **numbered** host, never
`www`. The names and paths changed across releases, which is the first thing that breaks a
script written against an old release:

| table | v24 and later, under `/download/tsv/` | v23 and older, under `/download/` |
|---|---|---|
| normal tissue IHC | `normal_ihc_data.tsv.zip` | `normal_tissue.tsv.zip` |
| RNA tissue consensus | `rna_tissue_consensus.tsv.zip` | same name |
| RNA single cell type | `rna_single_cell_type.tsv.zip` | same name |
| subcellular location | `subcellular_location.tsv.zip` | same name |
| cancer IHC (pathology) | `cancer_data.tsv.zip` | `pathology.tsv.zip` |

v24 carries both IHC names; v25 and v26 only `normal_ihc_data`. The old `/download/X.tsv.zip`
path is a `404` on v24 and later, and the new path is a `403` on v23. The full list for the
current release is on each resource's data page, e.g.
https://www.proteinatlas.org/humanproteome/tissue/data. No checksums are published, so the
block records a SHA-256 and the server's `Last-Modified` for each file.

The server **drops the connection partway through the larger files** — a plain download of
the 16 MB single-cell table failed at 12 MB on 2026-11-15. It honours `Range`, so this resumes.
On Python 3.12 a dropped connection usually surfaces as a short read rather than an
exception: the chunk loop simply ends early, and it is the size check against
`Content-Length` that notices and asks for the rest.
Throughput is low (the five v25 tables took 8.5 minutes); run it in the background:

```python
import hashlib, http.client, json, pathlib, urllib.error, urllib.request, zipfile

UA = {"User-Agent": "hpa-skill"}

# The same table has had different file names and paths across releases.
NAMES = {  # what -> (name in v24+ under /download/tsv/, name in v23 and older under /download/)
    "normal_tissue_ihc":   ("normal_ihc_data",      "normal_tissue"),
    "rna_tissue_consensus": ("rna_tissue_consensus", "rna_tissue_consensus"),
    "rna_single_cell_type": ("rna_single_cell_type", "rna_single_cell_type"),
    "subcellular_location": ("subcellular_location", "subcellular_location"),
    "cancer_ihc":           ("cancer_data",          "pathology"),
}


def file_url(what, version):
    """version is an int. The live site is never used here: a file fetched from
    www changes meaning the day the next release lands."""
    new, old = NAMES[what]
    base = f"https://v{version}.proteinatlas.org/download"
    return f"{base}/tsv/{new}.tsv.zip" if version >= 24 else f"{base}/{old}.tsv.zip"


def fetch(what, version, outdir, tries=8):
    """Stream to disk, resuming with a Range request when the file comes up
    short -- the server drops the connection mid-file on the larger tables."""
    url = file_url(what, version)
    out = pathlib.Path(outdir) / f"hpa_v{version}_{url.rsplit('/', 1)[1]}"
    part = out.with_suffix(".part")
    part.unlink(missing_ok=True)
    total = modified = None
    for attempt in range(tries):
        have = part.stat().st_size if part.exists() else 0
        headers = dict(UA, **({"Range": f"bytes={have}-"} if have else {}))
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers),
                                        timeout=300) as r:
                if r.headers.get("Content-Type", "").startswith("text/html"):
                    raise RuntimeError(f"{url}: HTML instead of a zip")
                if have and r.status != 206:
                    raise RuntimeError(f"{url}: server ignored Range ({r.status})")
                if have and not r.headers.get("Content-Range", "").startswith(f"bytes {have}-"):
                    raise RuntimeError(f"{url}: resumed at the wrong offset "
                                       f"({r.headers.get('Content-Range')!r}, hold {have})")
                if total is None:
                    total = int(r.headers["Content-Length"]) + have
                    modified = r.headers.get("Last-Modified")
                with open(part, "ab") as fh:
                    while chunk := r.read(1 << 20):
                        fh.write(chunk)
        except (http.client.IncompleteRead, urllib.error.URLError, ConnectionError, TimeoutError) as e:
            held = part.stat().st_size if part.exists() else 0   # may fail before the first byte
            print(f"  {out.name}: {type(e).__name__} with {held} bytes held, retrying")
            continue
        held = part.stat().st_size if part.exists() else 0
        if held == total:
            break
        print(f"  {out.name}: short read, {held} of {total} bytes, resuming")
    else:
        raise IOError(f"{url}: incomplete after {tries} attempts")
    part.rename(out)
    data = out.read_bytes()
    with zipfile.ZipFile(out) as z:
        (member,) = z.infolist()          # each zip holds exactly one TSV
        with z.open(member) as fh:
            header = fh.readline().decode().rstrip("\n").split("\t")
    return {"what": what, "version": version, "url": url, "file": out.name,
            "bytes": total, "last_modified": modified,
            "sha256": hashlib.sha256(data).hexdigest(),
            "member": member.filename, "member_bytes": member.file_size, "header": header}


VERSION = 25
outdir = pathlib.Path(f"hpa_v{VERSION}")
outdir.mkdir(exist_ok=True)
manifest = [fetch(w, VERSION, outdir) for w in NAMES]
(outdir / "MANIFEST.json").write_text(json.dumps(manifest, indent=1))
for m in manifest:
    print(f"{m['file']:42} {m['bytes']/1e6:6.1f} MB zip  {m['member_bytes']/1e6:6.1f} MB tsv  {m['header']}")
```

```
hpa_v25_normal_ihc_data.tsv.zip               5.7 MB zip    94.8 MB tsv  ['Gene', 'Gene name', 'Tissue', 'IHC tissue name', 'Cell type', 'Level', 'Reliability']
hpa_v25_rna_tissue_consensus.tsv.zip          5.3 MB zip    39.0 MB tsv  ['Gene', 'Gene name', 'Tissue', 'nTPM']
hpa_v25_rna_single_cell_type.tsv.zip         16.3 MB zip   148.8 MB tsv  ['Gene', 'Gene name', 'Cell type', 'nCPM']
hpa_v25_subcellular_location.tsv.zip          0.3 MB zip     2.0 MB tsv  ['Gene', 'Gene name', 'Reliability', 'Main location', 'Additional location', 'Extracellular location', 'Enhanced', 'Supported', 'Approved', 'Uncertain', 'Single-cell variation intensity', 'Single-cell variation spatial', 'Cell cycle dependency', 'GO id']
hpa_v25_cancer_data.tsv.zip                   1.7 MB zip    13.8 MB tsv  ['Gene', 'Gene name', 'Cancer', 'High', 'Medium', 'Low', 'Not detected']
```

Sizes for the same tables on the other hosts, from `Content-Length` on 2026-11-15:

| table | v23 | v24 | v25 | v26 (www) |
|---|---|---|---|---|
| normal tissue IHC | 5.6 MB | 5.6 / 5.7 MB (both names) | 5.7 MB | 5.6 MB |
| RNA tissue consensus | 5.2 MB | 5.2 MB | 5.3 MB | 5.3 MB |
| RNA single cell type | 8.5 MB | 8.5 MB | 16.3 MB | 16.4 MB |
| subcellular location | 0.2 MB | 0.5 MB | 0.25 MB | 0.26 MB |
| cancer IHC | 3.6 MB (`pathology`) | 1.7 MB | 1.7 MB | 1.5 MB |

The whole-atlas files are also offered — `proteinatlas.tsv.zip` (7 MB, the per-gene summary
fields for every gene), `proteinatlas.json.gz` and `proteinatlas.xml.gz` (the full record) —
under `/download/` (the TSV checked on `www`, v25, v24 and v23).

What is in each table, as of v25/v26:

- **`normal_ihc_data`** — `Gene, Gene name, Tissue, IHC tissue name, Cell type, Level,
  Reliability`. One row per gene × tissue sample × cell type. `IHC tissue name` splits tissues
  sampled twice (`Skin 1`, `Skin 2`, `Stomach 1`, `Stomach 2`, …); `Tissue` merges them, so
  the unique key is (`Gene`, `IHC tissue name`, `Cell type`). v24's `normal_tissue` lacks the
  `IHC tissue name` column and uses lower-case tissue names.
- **`rna_tissue_consensus`** — `Gene, Gene name, Tissue, nTPM` across 51 tissues, HPA and
  GTEx bulk RNA-seq normalised together. For GTEx on its own, with donors and eQTLs, use `gtex`.
- **`rna_single_cell_type`** — `Gene, Gene name, Cell type, nCPM`, pseudobulk per cell type
  from the HPA's single-cell compilation. For cell-level data, use `cellxgene-census`.
- **`subcellular_location`** — `Gene, Gene name, Reliability, Main location, Additional
  location, …, GO id`. Locations come with GO cellular-component ids — join on those, not on
  the location text.
- **`cancer_data`** — `Gene, Gene name, Cancer, High, Medium, Low, Not detected`: counts of
  patients at each staining level per cancer. v23's `pathology` also carried prognostic
  p-values; from v24 those are in `cancer_prognostic_data`.

## Reading an IHC call

A `Level` (`High`, `Medium`, `Low`, `Not detected`) is an annotator's call for one cell type in
one tissue, combining staining intensity with the fraction of cells stained, made by looking at
the images. The HPA's help pages describe it as a knowledge-based best estimate — an image can
show brown staining and still be scored `Not detected` when the annotator judged it
non-specific. Consequences:

- It is **ordinal and per antibody**. `High` for one gene and `High` for another are not
  comparable amounts; two tissues for the same gene are comparable only roughly.
- It is **not abundance**. For a protein quantity, use MS-based proteomics — `pride` for the
  raw data — and treat the IHC call as localisation evidence.
- Rare values `N/A`, `Not representative`, `Ascending` and `Descending` occur (under 0.2% of
  rows); filter to the four levels unless you have read the gene page.

`Reliability` is a **gene-level** score repeated on every row, and the same value as the
search API's `Reliability (IH)` for that gene — checked for all 13,277 genes in v26 and all
15,312 in v25. It grades how far the staining is corroborated, not how strong it is:

HPA's tissue method page (<https://www.proteinatlas.org/humanproteome/tissue/method>, read
2026-11-15) publishes a definition for `Enhanced` only: "at least one antibody has been
validated using orthogonal or independent enhanced validation methods". The other three
rows below are our summary of the ordering, not HPA's wording. Check them against HPA's
current help pages before quoting them as definitions. The measured gap after the table
stands on its own.

| score | meaning, in short |
|---|---|
| `Enhanced` | at least one antibody passed an enhanced validation test — genetic knockdown, an orthogonal method such as RNA or MS agreeing across tissues, independent antibodies to different epitopes, or a recombinant-expression or capture-MS test |
| `Supported` | staining consistent with RNA expression and with what is known about the protein, and with other antibodies where there are any |
| `Approved` | consistent with one of RNA or the existing literature, but not both |
| `Uncertain` | inconsistent with RNA and/or the literature, or independent antibodies disagree — the staining may not be the target |

That is a measurable difference. Joining each `High` call to the RNA consensus for the same gene
and tissue:

```python
import collections, csv, io, pathlib, zipfile


def rows(zpath):
    with zipfile.ZipFile(zpath) as z:
        (m,) = z.namelist()
        with z.open(m) as fh:
            yield from csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8"), delimiter="\t")


d = pathlib.Path("hpa_v25")
ihc = list(rows(d / "hpa_v25_normal_ihc_data.tsv.zip"))
print(len(ihc), "rows,", len({r["Gene"] for r in ihc}), "genes")
print("Level      :", collections.Counter(r["Level"] for r in ihc).most_common())

# One reliability per gene, repeated on every row -- it is a gene-level call.
per_gene = collections.defaultdict(set)
for r in ihc:
    per_gene[r["Gene"]].add(r["Reliability"])
assert all(len(s) == 1 for s in per_gene.values())
print("Reliability:", collections.Counter(next(iter(s)) for s in per_gene.values()).most_common())

# Key on the Ensembl id. A symbol-keyed dict silently merges these:
by_symbol = collections.defaultdict(set)
for r in ihc:
    by_symbol[r["Gene name"]].add(r["Gene"])
print("symbols on two ids:", {s: sorted(v) for s, v in by_symbol.items() if len(v) > 1})

# What a 'High' call is worth: how often the tissue's RNA says the gene is barely there.
rna = {(r["Gene"], r["Tissue"]): float(r["nTPM"])
       for r in rows(d / "hpa_v25_rna_tissue_consensus.tsv.zip")}
rna_tissues = {t for _, t in rna}
ihc_tissues = {r["Tissue"] for r in ihc}
# Two different reasons a row fails to join -- keep them apart:
no_name = sorted(t for t in ihc_tissues if t.lower() not in rna_tissues)   # tissue name absent
no_row = collections.Counter()      # tissue present in RNA, this gene has no row there
high = collections.Counter()
low_rna = collections.Counter()
dropped = collections.Counter()
for r in ihc:
    if r["Level"] != "High":
        continue
    rel = r["Reliability"]
    n = rna.get((r["Gene"], r["Tissue"].lower()))   # same tissue, different case
    if n is None:
        dropped[rel] += 1
        if r["Tissue"] not in no_name:
            no_row[r["Tissue"]] += 1
        continue
    high[rel] += 1
    low_rna[rel] += n < 1
for rel in ("Enhanced", "Supported", "Approved", "Uncertain"):
    n_all = high[rel] + dropped[rel]
    print(f"  {rel:9} 'High' rows with nTPM < 1: {low_rna[rel]:5} of {high[rel]:6} "
          f"({low_rna[rel]/high[rel]:.1%}) | not joined {dropped[rel]:5} of {n_all:6} "
          f"({dropped[rel]/n_all:.1%})")
n_drop, n_all = sum(dropped.values()), sum(high.values()) + sum(dropped.values())
print(f"'High' rows not joined: {n_drop} of {n_all} ({n_drop/n_all:.1%})")
print(f"IHC tissue names with no RNA tissue: {len(no_name)} of {len(ihc_tissues)} {no_name}")
print("tissue in RNA, gene row missing ('High' rows):", dict(no_row))
```

```
1199675 rows, 15312 genes
Level      : [('Not detected', 569065), ('Medium', 303452), ('Low', 184160), ('High', 140875), ('N/A', 1834), ('Ascending', 188), ('Descending', 90), ('Not representative', 11)]
Reliability: [('Approved', 5555), ('Uncertain', 4157), ('Enhanced', 3937), ('Supported', 1663)]
symbols on two ids: {'MATR3': ['ENSG00000015479', 'ENSG00000280987'], 'PRODH': ['ENSG00000100033', 'ENSG00000277196'], 'HERC3': ['ENSG00000138641', 'ENSG00000287542'], 'NPIPA9': ['ENSG00000183889', 'ENSG00000233024'], 'PINX1': ['ENSG00000254093', 'ENSG00000258724'], 'TBCE': ['ENSG00000284770', 'ENSG00000285053']}
  Enhanced  'High' rows with nTPM < 1:   431 of  29341 (1.5%) | not joined  2857 of  32198 (8.9%)
  Supported 'High' rows with nTPM < 1:  1374 of  33663 (4.1%) | not joined  3856 of  37519 (10.3%)
  Approved  'High' rows with nTPM < 1:  2594 of  48330 (5.4%) | not joined  6272 of  54602 (11.5%)
  Uncertain 'High' rows with nTPM < 1:  1392 of  14797 (9.4%) | not joined  1759 of  16556 (10.6%)
'High' rows not joined: 14744 of 140875 (10.5%)
IHC tissue names with no RNA tissue: 16 of 60 ['Bronchus', 'Brown adipose tissue', 'Cartilage', 'Caudate', 'Dorsal raphe', 'Efferent ducts', 'Eye', 'Hair', 'Hippocampus', 'Lactating breast', 'N/A', 'Nasopharynx', 'Oral mucosa', 'Soft tissue', 'Sole of foot', 'Substantia nigra']
tissue in RNA, gene row missing ('High' rows): {'Cerebellum': 11, 'Vagina': 1}
```

An `Uncertain` `High` sits in a tissue with essentially no transcript about six times as often
as an `Enhanced` one (9.4% against 1.5% in v25; 9.3% against 1.4% in v26). Filter on reliability
before treating a staining call as a finding, and say in the write-up which levels you kept.

Two things about what those percentages count:

- **The unit is a row of the IHC table — one cell type in one tissue sample — not a gene–tissue
  pair.** A gene scored `High` in four cell types of one tissue contributes four rows, and all
  four meet the same nTPM. Genes with many annotated cell types weigh more. Collapse to
  (`Gene`, `Tissue`) first if the question is about gene–tissue pairs.
- **About a tenth of the `High` rows never reach the comparison.** In v25, 14,744 of 140,875
  `High` rows (10.5%) find no RNA value: 8.9% of `Enhanced`, 10.3% of `Supported`, 11.5% of
  `Approved`, 10.6% of `Uncertain`. The dropped share is similar across scores, so it does not
  manufacture the gap, but the percentages are over the rows that joined, not over all calls.

**The tissue join in that block is a label join, and it is the only one available.** The HPA
files carry no tissue or cell-type ontology ids. IHC tissue names are capitalised and RNA ones
are lower case. A row fails to join for one of two reasons, and the block counts them apart:

- **The tissue name is not in the RNA table** — 16 of the 60 tissue names in the v25 IHC table,
  one of which is the placeholder `N/A`: `Hippocampus` against `hippocampal formation`,
  `Bronchus`, `Soft tissue`, `Eye`, … These account for 14,732 of the dropped `High` rows.
- **The tissue is there but this gene has no row in it** — v25's RNA consensus has `cerebellum`
  for 19,965 of its 20,162 genes, so 11 `Cerebellum` rows drop, and 1 `Vagina` row. Counting
  that as a missing tissue would wrongly report `Cerebellum` as absent from v25.

Match exactly after lower-casing, report both kinds of miss, and never fuzzy-match tissue names.
The gene side of the join is on the Ensembl id.

## What does not work

- **`www` as a pin.** It is the current release and changes underneath you; v26 replaced v25
  there on 2026-11-11 with no change of URL.
- **`v26.proteinatlas.org` (the current release's own subdomain)** → `302` to `www`.
- **`v18.proteinatlas.org` and older per-gene JSON** → `400`. v19 is the oldest release whose
  `/ENSG….json` answered.
- **A symbol in the per-gene URL** — `/TP53.json` → `404` with a full HTML page.
- **A versioned Ensembl id** — `/ENSG00000141510.18.json` → `301` to the gene's HTML page,
  which then answers `200 text/html`. `urllib` follows it, so the status check passes and the
  JSON parse fails. Strip the version suffix first (the `gene()` helper does).
- **A non-coding Ensembl id** → `404` whose body is the plain text `Unknown gene ENSG…` under a
  `text/html` content type.
- **`search_download.php` without `columns`, or with `format=xml`** → `400` with the site's
  HTML page as the body.
- **An unknown column code** → silently dropped, `200`. Probe with `check_columns()`.
- **Omitting `compress`** → the response is gzip (`application/gzip`), not JSON.
- **`OR` in a search, or a space- or comma-separated id list** → `200` with zero rows. Fetch the
  whole atlas and filter locally instead.
- **Old download names on new hosts** — `normal_tissue.tsv.zip` and `pathology.tsv.zip` are
  `404` on v25 and v26; `/download/<file>` without `tsv/` is `404` from v24 on, and
  `/download/tsv/<file>` is `403` on v23.
- **A single unresumed download of the larger tables** — dropped mid-file; use `Range`.

## Try it

A self-contained check that this skill still works. Public data, no account, no key.

**Data** — the frozen **v25** archive (serves 25.1, released 2026-05-25), CC BY 4.0 per
https://v25.proteinatlas.org/about/licence:

- `https://v25.proteinatlas.org/ENSG00000141510.xml` and `.json` — TP53
- `https://v25.proteinatlas.org/api/search_download.php?search=gene_name:MLL2&format=json&columns=g,eg&compress=no`
- `https://v25.proteinatlas.org/download/tsv/normal_ihc_data.tsv.zip` — 5.7 MB. The server is
  slow (~10–200 kB/s observed); the whole block took 8.5 minutes on 2026-11-15

Pinned to v25 rather than `www` so that the observed values below stay put after the next
release. TP53 is the happy path; `MLL2`, `MATR3` and the non-coding MALAT1 are the
counter-examples that a symbol-keyed or status-only implementation gets wrong, asserted so
nobody puts the simplification back. Last confirmed reachable 2026-11-15.

```python
import collections, csv, gzip, http.client, io, json, re, urllib.error, urllib.parse, urllib.request, zipfile

V = 25                                   # pinned: a frozen archive, not www
BASE = f"https://v{V}.proteinatlas.org"
UA = {"User-Agent": "hpa-skill-tryit"}


def get(url, timeout=300, tries=4):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA),
                                        timeout=timeout) as r:
                return r.status, r.headers.get("Content-Type", ""), r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("Content-Type", ""), e.read()
        except http.client.IncompleteRead:          # the server drops long transfers
            if attempt == tries - 1:
                raise


# 1. the host serves the version we pinned
_, _, xml = get(f"{BASE}/ENSG00000141510.xml")
served = int(re.search(rb"//v(\d+)\.proteinatlas\.org/download/proteinatlas\.xsd", xml[:600]).group(1))
assert served == V, served

# 2. symbol -> Ensembl id; a symbol is not an identifier
def resolve(sym):
    qs = urllib.parse.urlencode({"search": f"gene_name:{sym}", "format": "json",
                                 "columns": "g,eg", "compress": "no"})
    code, ctype, body = get(f"{BASE}/api/search_download.php?{qs}")
    body = gzip.decompress(body) if body[:2] == b"\x1f\x8b" else body   # gzip despite compress=no
    assert code == 200 and ("json" in ctype or "gzip" in ctype), (code, ctype)
    return sorted((r["Gene"], r["Ensembl"]) for r in json.loads(body))

tp53 = resolve("TP53")
mll2 = resolve("MLL2")
assert tp53 == [("TP53", "ENSG00000141510")], tp53
assert {e for _, e in mll2} == {"ENSG00000272333", "ENSG00000167548"}, mll2   # KMT2B and KMT2D
ENSG = tp53[0][1]

# 3. the per-gene record, keyed on the id
code, ctype, body = get(f"{BASE}/{ENSG}.json")
assert code == 200 and ctype.startswith("application/json")
rec = json.loads(body)
assert rec["Ensembl"] == ENSG and rec["Uniprot"] == ["P04637"]
api_rel = rec["Reliability (IH)"]
code, ctype, _ = get(f"{BASE}/ENSG00000251562.json")           # MALAT1, non-coding
assert code == 404 and ctype.startswith("text/html")

# 4. the bulk IHC table for the same version
code, ctype, blob = get(f"{BASE}/download/tsv/normal_ihc_data.tsv.zip", timeout=600)
assert code == 200 and not ctype.startswith("text/html")
with zipfile.ZipFile(io.BytesIO(blob)) as z:
    (member,) = z.namelist()
    ihc = list(csv.DictReader(io.TextIOWrapper(z.open(member), encoding="utf-8"), delimiter="\t"))
assert list(ihc[0]) == ["Gene", "Gene name", "Tissue", "IHC tissue name", "Cell type",
                        "Level", "Reliability"]
keys = collections.Counter((r["Gene"], r["IHC tissue name"], r["Cell type"]) for r in ihc)
assert max(keys.values()) == 1                                   # one call per cell type
mine = [r for r in ihc if r["Gene"] == ENSG]
assert {r["Reliability"] for r in mine} == {api_rel}              # file agrees with API
assert {r["Level"] for r in ihc} <= {"High", "Medium", "Low", "Not detected", "N/A",
                                     "Ascending", "Descending", "Not representative"}
by_sym = collections.defaultdict(set)
for r in ihc:
    by_sym[r["Gene name"]].add(r["Gene"])
assert by_sym["MATR3"] == {"ENSG00000015479", "ENSG00000280987"}  # one symbol, two genes

print(f"served          : v{served}")
print(f"TP53 -> {ENSG} | MLL2 -> {mll2}")
print(f"record fields   : {len(rec)} | Reliability (IH) {api_rel} | IF {rec['Reliability (IF)']}")
print(f"IHC table       : {member}, {len(ihc)} rows, {len({r['Gene'] for r in ihc})} genes")
print(f"TP53 IHC rows   : {len(mine)} | levels {dict(collections.Counter(r['Level'] for r in mine))}")
print(f"symbols on >1 id: {sorted(s for s, v in by_sym.items() if len(v) > 1)}")
```

**Expect**

Invariants — these hold for any release, and a failure means the skill is wrong:

- The host serves the release it is named for (the XML stamp reads `v25`).
- `gene_name:MLL2` returns **two** Ensembl genes (KMT2B, KMT2D). A resolver that returns one
  row has thrown information away.
- The per-gene record is keyed on the Ensembl id and carries UniProt `P04637`.
- A non-coding id answers `404` with an HTML content type — status *and* content type are
  checked, never status alone.
- In the IHC table, (`Gene`, `IHC tissue name`, `Cell type`) is unique, every gene has exactly
  one `Reliability`, and that value equals the API's `Reliability (IH)`.
- `MATR3` names two Ensembl genes in the IHC table.

Observed 2026-11-15 against **v25** — these move only if the archive is rebuilt, so treat a
mismatch as drift to investigate:

```
served          : v25
TP53 -> ENSG00000141510 | MLL2 -> [('KMT2B', 'ENSG00000272333'), ('KMT2D', 'ENSG00000167548')]
record fields   : 119 | Reliability (IH) Enhanced | IF Enhanced
IHC table       : normal_ihc_data.tsv, 1199675 rows, 15312 genes
TP53 IHC rows   : 116 | levels {'Not detected': 99, 'Low': 8, 'Medium': 9}
symbols on >1 id: ['HERC3', 'MATR3', 'NPIPA9', 'PINX1', 'PRODH', 'TBCE']
```

## Neighbours

- `gtex` — the GTEx tissue RNA-seq that feeds half of the HPA consensus, with donors, samples
  and eQTLs the HPA does not carry.
- `uniprot` — the protein record behind the `Uniprot` field, and symbol-to-accession mapping.
- `ensembl` — Ensembl gene ids, symbols and their history, for resolving a gene list before it
  reaches the HPA.
- `cellxgene-census` — cell-level single-cell data, where the HPA gives only per-cell-type
  pseudobulk.
- `pride` — mass-spectrometry proteomics, when the question is protein amount rather than
  where an antibody stains.

## Sources

- Human Protein Atlas — https://www.proteinatlas.org/
- Licence and citation — https://www.proteinatlas.org/about/licence
- Programmatic access and column codes — https://www.proteinatlas.org/about/help/dataaccess
- Downloadable data — https://www.proteinatlas.org/about/download
- Release history — https://www.proteinatlas.org/about/releases
