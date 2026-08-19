---
name: pride
description: Search the PRIDE Archive at EMBL-EBI for public mass-spectrometry proteomics datasets by keyword, organism, tissue, disease, instrument or software — read the free-text sample and data processing protocols, tell COMPLETE from PARTIAL submissions, and download raw, mzML, mzIdentML and search-engine output with checksums.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.1.0
tags: [proteomics, mass-spectrometry, pride, public-data, multi-omics]
covers: [proteomics, proteome, mass spectrometry, phosphoproteomics, lipidomics, immunopeptidomics, LC-MS/MS, shotgun proteomics, data-independent acquisition, TMT, SILAC, label-free, mzML, mzIdentML, mzTab, Orbitrap, timsTOF, MaxQuant, DIA-NN, PXD, ProteomeXchange, liver, heart, blood plasma, kidney, brain, human, mouse, hepatocellular carcinoma, aging]
papers: [PMID:39494541, PMID:34723319, PMID:36370099, PMID:20716697, PMID:40915658]
access: [open]
datasets: [https://www.ebi.ac.uk/pride/ws/archive/v3/search/projects?keyword=liver&pageSize=1, https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD050610, https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD074038, https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD000001/files/all, https://www.ebi.ac.uk/pride/ws/archive/v3/files/checksum/PXD000001, https://ftp.pride.ebi.ac.uk/pride/data/archive/2026/05/PXD074038/GSTM3_SDRF.sdrf.tsv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-18
  against: PRIDE Archive REST API v3 (api-docs info.version 3.0, OpenAPI 3.0.1) / ProteomeCentral PROXI v0.1 / Python 3.12.8 standard library only
  executed: 11
  unverified: 0
---
# PRIDE Archive

PRIDE (EMBL-EBI) is the largest public repository of mass-spectrometry proteomics
data and the founding member of ProteomeXchange. On 2026-08-18 it held **40,770
projects and 3,504,583 files across 4,743 organisms** — raw spectra, processed
identifications, and the methods text that came with them.

No account, no API key, no licence click-through. Everything below reads a public
endpoint.

The skill is about four decisions, in this order, because getting them wrong in
order wastes the most time:

1. **Is the accession even in PRIDE — and released?** Roughly half of current
   ProteomeXchange accessions are held elsewhere, and PRIDE returns the same 404 for
   a wrong repository, an embargoed dataset and an accession that never existed.
2. **Is the dataset comparable to your experiment?** That lives in two free-text
   protocol fields, not in the structured metadata.
3. **Does it contain processed identifications, or only raw spectra?** That is
   `submissionType`, and it decides whether you can use the data this week or need
   to re-search it from scratch.
4. **Did you get all the files?** The file index is not the same thing as the
   project directory, and only the checksum manifest tells you the difference.

## First — check PRIDE actually holds the accession

A `PXD` accession in a paper does **not** mean the data is in PRIDE. ProteomeXchange
mints `PXD` accessions for all its partner repositories, and PRIDE's API returns a
flat 404 for the ones it does not host — with the message *"The project accession is
not in the database"*, which reads like a bad accession rather than a wrong
repository.

Of the **400 most recently announced ProteomeXchange datasets on 2026-08-17, only 201
were PRIDE-held.** The rest were iProX (140), MassIVE (33), jPOST (23) and
PanoramaPublic (3); six drawn from that group were checked individually and all six
404 in the PRIDE v3 API.

**PRIDE's 404 has three different meanings and does not distinguish them.** Wrong
repository, embargoed-in-PRIDE, and never-issued all return HTTP 404 with the same
body. Verified 2026-08-18: `PXD082740` (a PRIDE submission still under embargo),
`PXD082693` (iProX-held and public) and `PXD999999999` (never issued) are
indistinguishable from `/projects/{accession}` alone. Treating that 404 as "bad
accession" tells an author their own valid accession is wrong.

Two endpoints resolve it. ProteomeCentral's PROXI 404 **body** carries an
`error_code` and a `repository`, and PRIDE's `/status/{accession}` answers `PRIVATE`
for a PRIDE-held embargoed accession. Resolve first, then decide where to go:

```python
import json, urllib.error, urllib.request

V3 = "https://www.ebi.ac.uk/pride/ws/archive/v3"
PROXI = "https://proteomecentral.proteomexchange.org/api/proxi/v0.1/datasets"

def where_is(accession):
    """Resolve an accession to (repository, state, note).

    Four states, not two. PRIDE's 404 is identical for an embargoed dataset and for
    an accession that was never issued — but ProteomeCentral's 404 BODY tells them
    apart, and PRIDE's own /status confirms the PRIDE-held ones.
    """
    try:
        with urllib.request.urlopen(f"{V3}/projects/{accession}", timeout=60) as r:
            return "PRIDE", "public", json.loads(r.read())["title"][:60]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise

    try:
        with urllib.request.urlopen(f"{PROXI}/{accession}", timeout=90) as r:
            px = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read())        # the 404 BODY is the answer, not the code
        except ValueError:
            body = {}
        if body.get("error_code") == "DatasetNotYetReleased":
            repo = body.get("repository") or "?"
            note = "accession is valid — data embargoed, not yet released"
            if repo == "PRIDE":     # only PRIDE-held accessions answer /status quickly
                try:
                    with urllib.request.urlopen(f"{V3}/status/{accession}", timeout=15) as r:
                        note = f"/status={r.read().decode().strip()} — " + note
                except Exception:
                    pass
            return repo, "embargoed", note
        return "none", "never issued", (body.get("description") or "no record")[:70]

    repo = (px.get("datasetSummary") or {}).get("hostingRepository") or "?"
    link = next((l["value"] for l in (px.get("fullDatasetLinks") or [])
                 if "URI" in (l.get("name") or "")), "")
    return repo, "public", (px.get("title") or "")[:34] + ("  " + link if link else "")

for acc in ["PXD050610", "PXD074038", "PAD000052", "PXD082693", "PXD073836",
            "PXD067722", "PXD082740", "PXD082748", "PXD999999999"]:
    repo, state, note = where_is(acc)
    print(f"  {acc:<14} {repo:<9} {state:<12} {note[:78]}")
```

```
  PXD050610      PRIDE     public       The Human Cardiac “Age-OME”: Age-specific changes in myocard
  PXD074038      PRIDE     public       Mass Spectrometric Profiling of hepatic GSTM3 - co-immunopre
  PAD000052      PRIDE     public       Plasma proteomics defines two reproducible subphenotypes of
  PXD082693      iProX     public       Tracing the evolutionary trajector  http://www.iprox.org/page/project.html?id=
  PXD073836      MassIVE   public       A multi-omics approach reveals spe  http://massive.ucsd.edu/ProteoSAFe/dataset
  PXD067722      jPOST     public       Nectin-4 is an entry receptor for   https://repository.jpostdb.org/entry/JPST0
  PXD082740      PRIDE     embargoed    /status=PRIVATE — accession is valid — data embargoed, not yet released
  PXD082748      jPOST     embargoed    accession is valid — data embargoed, not yet released
  PXD999999999   none      never issued Identifier PXD999999999 has not yet been reserved for use by any repos
```

The two embargoed rows are the ones worth having. `PXD082740` and `PXD082748` are
real reserved accessions whose data has not been released; a resolver that reports
them as "no such accession" sends the reader to correct something that is already
correct. They will flip to `public` when their submitters release them — that is the
point of the state, not a defect in the example. Of the 47 accessions
`PXD082700`–`PXD082746` on 2026-08-18, **45 were embargoed** (31 at PRIDE, 9 iProX,
5 MassIVE) and none were unissued, so the band immediately below the newest public
accession is almost entirely embargoed rather than empty.

`MSV…` (MassIVE), `JPST…` (jPOST) and `IPX…` (iProX) native accessions are never in
PRIDE, and PROXI does not index them either — `MSV000078568` returns
`NoSuchIdentifier`, so a native accession reads as "never issued" here. Convert it at
its own repository first. `PAD…` (affinity) and `PRD…` (legacy PRIDE) accessions
*are* PRIDE-held and resolve normally, even though they are not `PXD…`.

The search below only ever sees PRIDE-held, released projects, so a literature survey
built on PRIDE search alone systematically misses half the field.

## Searching

One endpoint. `keyword` is the free-text term, `filter` narrows on controlled fields.

```bash
curl -s -D - -o /dev/null \
  "https://www.ebi.ac.uk/pride/ws/archive/v3/search/projects?keyword=liver&pageSize=1" \
  | grep -i total_records
# total_records: 2194
```

That `grep` is not decoration. **The body is a bare JSON list with no hit count, no
page count and no next link in it — the total is only in the `total_records` response
header.** Code that reads the body alone cannot tell 100 results from 40,000, and
`len(response)` is the page size, never the answer.

```python
import json, urllib.parse, urllib.request

V3 = "https://www.ebi.ac.uk/pride/ws/archive/v3"

def search(keyword="", filters=(), page=0, page_size=25,
           sort_field="submissionDate", direction="DESC"):
    """Search PRIDE projects. Returns (records, total_hits).

    total_hits comes from the `total_records` RESPONSE HEADER — the body is a
    bare JSON list with no count and no next-page link in it.
    """
    q = urllib.parse.urlencode({
        "keyword": keyword,
        "filter": ",".join(filters),
        "pageSize": min(page_size, 100),          # 100 is the server's ceiling
        "page": page,                             # 0-indexed
        "sortFields": sort_field,
        "sortDirection": direction,
    })
    with urllib.request.urlopen(f"{V3}/search/projects?{q}", timeout=60) as r:
        return json.loads(r.read()), int(r.headers.get("total_records", 0))

hits, total = search("liver", ["organisms==Homo sapiens (human)",
                               "submissionType==COMPLETE"], page_size=5)
print(f"{total} matching projects; showing {len(hits)}")
for h in hits:
    print(f"  {h['accession']}  {h['submissionType']:<8} {h['publicationDate']}  "
          f"{h['title'][:58]}")

# The trap: a misspelled filter FIELD is silently ignored, not rejected.
for f in ["organisms==Homo sapiens (human)", "organism==Homo sapiens (human)"]:
    _, n = search("liver", [f], page_size=1)
    print(f"  filter {f!r:<38} -> {n} hits")
```

```
149 matching projects; showing 5
  PXD073804  COMPLETE 2026-08-13  RhoBTB1 Binding Proteins in Placenta Detected by APEX2
  PXD069194  COMPLETE 2026-03-16  Uncoupling TGFβ1 signalling from collagen protein synthesi
  PXD063438  COMPLETE 2026-01-16  Dynamic Proteomic Analysis of Human Liver Organoids: Optim
  PXD061806  COMPLETE 2025-10-01  SICyLIA-cTMT enables dissecting redox proteome dynamics wi
  PXD061593  COMPLETE 2025-11-30  Plasma EV proteome in Rugby players
  filter 'organisms==Homo sapiens (human)'      -> 932 hits
  filter 'organism==Homo sapiens (human)'       -> 2193 hits
```

Three behaviours that will bite:

- **A wrong filter field name is silently ignored.** `organism==` (singular) returns
  2193 — the *unfiltered* count — where `organisms==` returns 932. No 400, no warning,
  no error key. You get every project in the keyword result and believe you filtered
  to human. Assert that a filter reduced the count before trusting it.
- **`pageSize` is capped at 100 server-side.** Asking for 1000 returns 100, again with
  no indication that it truncated. Page with `page=0,1,2,…` until you have
  `total_records` rows.
- **`page` is 0-indexed**, and a page past the end returns `[]` with HTTP 200.

### `keyword` searches the protocols, which is the point

`keyword` is matched across the accession, the title, the people **and both free-text
protocol fields** — and every record carries a `highlights` object naming the field
that matched, with the matching snippet in `<em>` tags. Observed 2026-08-18:

| keyword | hits | `highlights` key on the top hit |
|---|---|---|
| `PXD050610` | 1 | `accession` — exact match |
| `Age-OME` | 1 | `title`, `references` |
| `QSonica` | 149 | `sampleProcessingProtocol` — a sonicator brand |
| `deoxycholate` | 2258 | `sampleProcessingProtocol` — a lysis detergent |
| `ThermoRawFileParser` | 65 | `dataProcessingProtocol` — a conversion tool |
| `Malecki` | 5 | `labPIs` |
| `GSE263566` | 0 | none — linked accessions are **not** indexed |

The `highlights` value for `keyword=QSonica` on its top hit, verbatim:

    {"sampleProcessingProtocol": ["Samples were homogenized in 250 µL of 5% SDS,
      100 mM TEAB and sonicated (<em>QSonica</em>, Newtown, CT, USA) for 5 cycles
      with 1 min incubation on ice after each cycle."]}

So you can search on method — a lysis buffer, an enzyme, a search-engine version, an
instrument brand — which no structured field exposes, and `highlights` tells you
whether the hit came from the methods or merely from a title. That is the most useful
thing this endpoint does and it is invisible from the field list.

**Do not stack words into `keyword`.** Multi-word behaviour is unstable to the point
of being unusable: `liver phosphoproteomics` returns 5 hits and
`phosphoproteomics liver` returns 2, where each word alone returns thousands. Word
order changing the count is proof this is not a boolean AND. Put one term in
`keyword` and express everything else as a `filter` — `keyword=liver` with
`filter=keywords==Phosphoproteomics` returns 44, and `keyword=phosphoproteomics` with
`filter=organismsPart==Liver` returns 58.

### Get the filter vocabulary from the facets, never from memory

Filter values must match the indexed term. They are matched case-insensitively but
they are **not substrings** — `organisms==Homo sapiens` matches exactly one project,
the one whose organism string is literally that, not the 932 labelled
`Homo sapiens (human)`. Read the vocabulary off `/facet/projects`, which also gives
you the size of each slice before you commit to it:

```python
import json, urllib.parse, urllib.request

V3 = "https://www.ebi.ac.uk/pride/ws/archive/v3"

def facets(keyword="", filters=(), n=10):
    q = urllib.parse.urlencode({"keyword": keyword, "filter": ",".join(filters),
                                "facetPageSize": n})
    with urllib.request.urlopen(f"{V3}/facet/projects?{q}", timeout=90) as r:
        return json.loads(r.read())

f = facets("phosphoproteomics", n=6)
print("facet dimensions:", ", ".join(sorted(f)))
print()
for dim in ("submissionType", "organisms", "instruments", "experimentTypes",
            "otherOmicsLinks", "diseases"):
    items = sorted(f.get(dim, {}).items(), key=lambda kv: -kv[1])[:6]
    print(f"{dim}:")
    for name, count in items:
        print(f"    {count:>6}  {name}")
```

Observed 2026-08-18 for `keyword=phosphoproteomics`:

```
facet dimensions: additionalAttributes, allCountries, diseases, experimentTypes,
experimentalFactors, instruments, keywords, organisms, organismsPart,
otherOmicsLinks, projectTags, publicationDate, quantificationMethods, softwares,
submissionDate, submissionType, updatedDate

submissionType:   PARTIAL 1357 · COMPLETE 291 · PRIDE 9
organisms:        Homo sapiens (human) 913 · Mus musculus (mouse) 370 · S. cerevisiae 61
instruments:      Q Exactive 439 · Orbitrap Fusion Lumos 257 · Q Exactive HF 217
experimentTypes:  Shotgun proteomics 1091 · Bottom-up proteomics 309 · DDA 180
otherOmicsLinks:  NONE 1197 · PRIDE 380 · GEO 65 · BioProject 26 · ArrayExpress 9
diseases:         Breast cancer 61 · Acute leukemia 53 · Disease free 43
```

Every dimension in that list is a valid `filter` field except the two date facets,
which take a year. `otherOmicsLinks==GEO` is how you find the datasets with a paired
transcriptomics series — you cannot get there by searching for the GSE accession.

## Triage before you download anything

Both of the fields that decide whether a dataset is usable are easy to skip. Read
them together, per project, before a single byte moves.

**`submissionType` decides whether processed results exist.** PRIDE distinguishes:

| value | accession prefix | what the submitter deposited | what you can do with it |
|---|---|---|---|
| `COMPLETE` | `PXD` | raw + peak lists + identifications in a result format | load the identifications directly |
| `PARTIAL` | `PXD` | raw + whatever the search engine emitted | re-search from raw, or reverse-engineer one vendor file |
| `PRIDE` | `PRD` | legacy pre-2012 PRIDE XML submissions | historical; expect no modern format |
| `AFFINITY` | `PAD` | affinity proteomics (Olink, SomaScan), not mass spectrometry | different assay entirely |

**Not every PRIDE accession starts with `PXD`.** The legacy and affinity tiers use
their own prefixes — `PRD000749` and `PAD000052` are both PRIDE-held and resolve
through every endpoint below, but neither is registered with ProteomeXchange, so
PROXI returns `NoSuchIdentifier` for them. There were 524 `PRIDE`-type and 30
`AFFINITY` projects on 2026-08-18. Regex-validating input as `^PXD\d+$` silently
rejects both.

**`PARTIAL` is the common case, by a wide margin.** For `keyword=liver` on
2026-08-18: PARTIAL 1792, COMPLETE 385, PRIDE 15, AFFINITY 1. A pipeline that assumes
processed results exist will fail on four datasets in five, so filter for
`submissionType==COMPLETE` up front unless you are prepared to re-search raw files.

**The two protocol fields are the methods section**, and they carry detail the
structured metadata does not. For the dataset below, the CV-declared software is
`DIA-NN` while the protocol says `DIA-NN(version 1.7)` — the version, the FDR
threshold, the FASTA and its download date exist only in the free text. Whether a
dataset is comparable to yours is almost always a question about that text.

```python
import json, textwrap, urllib.request

V3 = "https://www.ebi.ac.uk/pride/ws/archive/v3"

# Terms worth pulling out of the free-text protocols, because they decide
# comparability. Extend these lists for your own field.
PROBES = {
    "enzyme":     ["trypsin", "lys-c", "lysc", "chymotrypsin", "glu-c", "asp-n",
                   "elastase", "pepsin", "no enzyme", "non-specific"],
    "labelling":  ["tmt", "itraq", "silac", "dimethyl", "label-free", "label free",
                   "spike-in", "iodotmt", "tmtpro"],
    "acquisition": ["dia", "data-independent", "dda", "data-dependent", "prm",
                    "srm", "mrm", "swath", "parallel reaction monitoring"],
    "engine":     ["maxquant", "dia-nn", "diann", "spectronaut", "proteome discoverer",
                   "fragpipe", "msfragger", "comet", "mascot", "sequest", "andromeda",
                   "peaks", "skyline", "msgf", "openms", "alphapept"],
    "enrichment": ["phospho", "tio2", "immobilized metal", "imac", "acetyl",
                   "ubiquitin", "diglycine", "glyco", "lectin", "exosome",
                   "immunoprecipit", "biotin", "apex", "turboid"],
}

def project(accession):
    with urllib.request.urlopen(f"{V3}/projects/{accession}", timeout=60) as r:
        return json.loads(r.read())

def cv_names(field):
    """/projects/{acc} returns CvParam objects where /search/projects returns strings."""
    if not field:
        return []
    return [x["name"] if isinstance(x, dict) else str(x) for x in field]

def scan(text):
    low = (text or "").lower()
    return {k: sorted({t for t in terms if t in low}) for k, terms in PROBES.items()}

def triage(accession):
    p = project(accession)
    sample, data = p.get("sampleProcessingProtocol", ""), p.get("dataProcessingProtocol", "")
    found = scan(sample + " \n " + data)

    # The publication is in references[], NOT in the top-level `doi`.
    pubs = []
    for ref in p.get("references") or []:
        pmid = ref.get("pubmedID") or 0            # 0 means "none recorded"
        pubs.append((f"PMID:{pmid}" if pmid else "PMID:-", ref.get("doi") or "-"))

    print(f"{p['accession']}  [{p['submissionType']}]  published {p['publicationDate']}")
    print(f"  title      : {p['title'][:88]}")
    print(f"  organism   : {', '.join(cv_names(p.get('organisms')))}")
    print(f"  part       : {', '.join(cv_names(p.get('organismParts')))}")
    print(f"  disease    : {', '.join(cv_names(p.get('diseases'))) or '(none declared)'}")
    print(f"  instrument : {', '.join(cv_names(p.get('instruments')))}")
    print(f"  software   : {', '.join(cv_names(p.get('softwares'))) or '(none declared)'}")
    print(f"  PTMs       : {', '.join(cv_names(p.get('identifiedPTMStrings'))) or '(none)'}")
    print(f"  dataset DOI: {p.get('doi') or '(none minted)'}")
    print(f"  paper      : {'; '.join(f'{a} {b}' for a, b in pubs) or '(none linked)'}")
    print(f"  other omics: {', '.join(p.get('otherOmicsLinks') or []) or '(none)'}")
    print("  from the protocols:")
    for k, v in found.items():
        print(f"    {k:<12} {', '.join(v) or '-'}")
    print("  sample processing (first 300 chars):")
    print(textwrap.fill(sample[:300], 92, initial_indent="    ", subsequent_indent="    "))
    print("  data processing (first 300 chars):")
    print(textwrap.fill(data[:300], 92, initial_indent="    ", subsequent_indent="    "))
    return p

triage("PXD050610")
```

```
PXD050610  [PARTIAL]  published 2025-11-17
  title      : The Human Cardiac “Age-OME”: Age-specific changes in myocardial molecular
  organism   : Homo sapiens (human)
  part       : Heart
  disease    : (none declared)
  instrument : Orbitrap Fusion Lumos
  software   : DIA-NN
  PTMs       : monohydroxylated residue, deamidated residue, iodoacetamide derivatized residue
  dataset DOI: (none minted)
  paper      : PMID:40915658 10.1111/acel.70219
  other omics: geo:GSE263566
  from the protocols:
    enzyme       trypsin
    labelling    label-free
    acquisition  data-independent, dia
    engine       dia-nn
    enrichment   -
  sample processing (first 300 chars):
    Frozen heart tissue was powdered in liquid nitrogen and approximately 10mg was weighed
    and homogenized in 4% sodium deoxycholate and 100mM Tris-HCl pH 7.5. Samples were heated
    to 95oC and then sonicated at 70% amplitude using QSonica R2 (Q Sonica). Samples were
    then centrifuged at 18,000 x g and the
  data processing (first 300 chars):
    RAW data files including the high pH fractions were analysed using the integrated
    quantitative proteomics software DIA-NN(version 1.7). The database provided to the
    search engine for identification contained the human database downloaded on the 5th of
    May 2020. FDR was set to 1% of precursor ions to
```

The keyword scan is a triage aid, not an extraction method. It says *this protocol
mentions trypsin and DIA-NN*, which is enough to sort fifty candidates into a
shortlist. Read the full text of the ones that survive — negation, "except for
sample 3", and a second enzyme in a second batch all defeat a substring match.

### The same field has two shapes on two endpoints

`/search/projects` returns `organisms`, `instruments`, `diseases` and friends as
**plain strings**. `/projects/{accession}` returns the same fields as **CvParam
objects** with `cvLabel`, `accession` and `name`. That is why `cv_names()` above
handles both. Code that reads `rec["organisms"][0]` works on one endpoint and
returns a dict on the other.

`/projects/{accession}` also carries fields search does not: `license`,
`identifiedPTMStrings`, `references`, `otherOmicsLinks`, `organismParts` (note the
singular `Part` becomes plural `Parts` here — `organismsPart` on search,
`organismParts` on the project record, and `organismsPart` as the filter name).

### The `doi` field is not the paper

This one is worth stating flatly because the field name invites the wrong reading.
**The top-level `doi` is PRIDE's own dataset DOI, and it never points to the
publication.** Two verified cases:

| | `doi` | `references[0]` |
|---|---|---|
| PXD050610 | `""` — none minted | `pubmedID` 40915658, `doi` 10.1111/acel.70219 |
| PXD074038 | `10.6019/PXD074038` | `pubmedID` **0**, `doi` 10.1016/J.ATHEROSCLEROSIS.2026.120764 |

So: read `references[]` for the paper, and treat `pubmedID: 0` as *no PMID recorded*
rather than as an identifier. A dataset can have a DOI and no paper, a paper and no
DOI, both, or neither — cite the DOI when it exists, because it resolves whether or
not the manuscript ever appeared.

`otherOmicsLinks` is the other cross-reference, and it is `["geo:GSE263566"]` for
PXD050610 — the paired transcriptomics for the same hearts. **The key is usually
absent entirely** rather than `null` or `[]` — PXD074038, PXD000001, PXD000561,
PRD000749 and PAD000052 all lack it — so `p.get("otherOmicsLinks") or []`, never
`p["otherOmicsLinks"]`.

Its values are prefixed and **not deduplicated across prefixes**. PXD055605 returns
`['px:PXD051747', 'px:PXD055141', 'pride.project:PXD055192', 'pride.project:PXD055141']`
— four entries naming three projects, with `PXD055141` appearing under both `px:` and
`pride.project:`. Strip the prefix before counting related datasets, or you will
report one more than exists. PXD010154 uses a third namespace,
`['arrayexpress:E-MTAB-2836']`.

## What files a submission actually contains

`/projects/{acc}/files/all` is unpaginated; `/projects/{acc}/files` caps at 100 like
search — and, unlike search, it *does* put the true count in the `total_records`
header, so a paging loop there is at least self-checking.
`/files/getCountOfFilesByType/{acc}` gives just the category counts, which is usually
all you need to make the go/no-go call. `/projects/{acc}/files/count` gives the bare
integer.

Verified against `/files/count` on projects of 8, 26, 27, 1026, 1938, 2384, 8240 and
8741 files: **`/files/all` really is unpaginated** — it returned every indexed file
each time, and it ignores `pageSize` if you pass one. The default 100 on the paginated
`/files` sibling is the trap; `/files/all` is not.

```python
import json, urllib.parse, urllib.request
from collections import defaultdict

V3 = "https://www.ebi.ac.uk/pride/ws/archive/v3"

def list_files(accession, name_filter=None):
    """Every file the API INDEXES. /files/all is unpaginated — /files caps at 100.

    Not necessarily every file in the project directory — see audit_listing below.
    filenameFilter is a case-insensitive substring match.
    """
    q = f"?filenameFilter={urllib.parse.quote(name_filter)}" if name_filter else ""
    with urllib.request.urlopen(f"{V3}/projects/{accession}/files/all{q}", timeout=300) as r:
        return json.loads(r.read())

def http_url(rec):
    """publicFileLocations offers only ftp:// and Aspera. Same host serves HTTPS."""
    ftp = next(v["value"] for v in rec["publicFileLocations"]
               if v["name"] == "FTP Protocol")
    return ftp.replace("ftp://ftp.pride.ebi.ac.uk/", "https://ftp.pride.ebi.ac.uk/")

def inventory(accession):
    files = list_files(accession)
    by_cat = defaultdict(list)
    for f in files:
        by_cat[f["fileCategory"]["value"]].append(f)
    print(f"{accession}: {len(files)} files")
    for cat in sorted(by_cat):
        group = by_cat[cat]
        tot = sum(f["fileSizeBytes"] for f in group)
        exts = sorted({f["fileName"].lower().rsplit(".", 1)[-1] for f in group})
        print(f"  {cat:<20} {len(group):>4} files  {tot/1e6:>10.1f} MB  .{' .'.join(exts)}")
    return by_cat

for acc in ("PXD050610", "PXD074038"):
    cats = inventory(acc)
    print(f"  -> processed identifications present: "
          f"{'yes (RESULT)' if 'RESULT' in cats else 'NO — reanalysis required'}")
    print()

# one URL, ready to fetch
f = [x for x in list_files("PXD074038") if x["fileName"].endswith(".sdrf.tsv")][0]
print("example URL:", http_url(f))
```

```
PXD050610: 26 files
  RAW                    25 files     66464.1 MB  .raw
  SEARCH                  1 files        51.4 MB  .xlsx
  -> processed identifications present: NO — reanalysis required

PXD074038: 27 files
  EXPERIMENTAL DESIGN     1 files         0.0 MB  .tsv
  OTHER                   6 files         1.4 MB  .txt .xlsx
  PEAK                    5 files        43.3 MB  .mgf
  RAW                     5 files       349.8 MB  .raw
  RESULT                  5 files       203.7 MB  .mzid
  SEARCH                  5 files        90.0 MB  .msf
  -> processed identifications present: yes (RESULT)

example URL: https://ftp.pride.ebi.ac.uk/pride/data/archive/2026/05/PXD074038/GSTM3_SDRF.sdrf.tsv
```

That contrast is `submissionType` made concrete. PXD050610 is PARTIAL: 66 GB of
vendor `.raw` and one 51 MB spreadsheet. PXD074038 is COMPLETE: five `.mzid` files
you can parse today.

### The file index is not the project directory — check it

This is the one that costs you data, and it is invisible from the listing's own
output. `/files/all` returns everything the API has **indexed**, and
`/projects/{acc}/files/count` agrees with it — because both read the same index. The
archive directory on the FTP server can hold more.

`/files/checksum/{accession}` is generated from the directory itself, so it is the
independent count. Diff the two:

```python
import json, urllib.parse, urllib.request

V3 = "https://www.ebi.ac.uk/pride/ws/archive/v3"
# Excluded from the gap count because their absence is not a data loss. Only
# `submission.px` is reliably unindexed — `checksum.txt` IS in `/files/all` on modern
# projects, so a manifest count printed against this set can run one low.
HOUSEKEEPING = {"submission.px", "README.txt", "checksum.txt"}

def list_files(accession, name_filter=None):
    q = f"?filenameFilter={urllib.parse.quote(name_filter)}" if name_filter else ""
    with urllib.request.urlopen(f"{V3}/projects/{accession}/files/all{q}", timeout=300) as r:
        return json.loads(r.read())

def manifest(accession):
    """The archive's own manifest: fileName -> (md5, bytes). This is what is on disk."""
    with urllib.request.urlopen(f"{V3}/files/checksum/{accession}", timeout=300) as r:
        rows = r.read().decode().splitlines()
    out = {}
    for line in rows[1:]:                      # row 0 is the header
        c = line.split("\t")
        if len(c) >= 3:
            out[c[0]] = (c[1], int(c[2]))
    return out

def audit_listing(accession):
    """Does the file index cover the project directory? Sometimes it does not.

    Refuses an accession with no project, because `/files/all` answers 200 with `[]`
    for one and `/files/checksum/` answers 200 with an empty body — so without this
    guard the function reports `index and manifest agree` for a typo, which is the
    same shape of wrong answer it exists to catch.
    """
    listed = {f["fileName"] for f in list_files(accession)}
    disk = manifest(accession)
    with urllib.request.urlopen(f"{V3}/projects/{accession}/files/count", timeout=120) as r:
        declared = int(r.read())
    if not listed and not disk:
        raise LookupError(f"{accession}: no indexed files and no manifest — check the "
                          f"accession with where_is() before trusting an empty result")
    unlisted = sorted((set(disk) - listed) - HOUSEKEEPING)   # on disk, not in the index
    no_md5 = sorted(listed - set(disk))                      # indexed, unverifiable
    assert len(listed) == declared, (len(listed), declared)
    print(f"{accession}: indexed {len(listed)} (= /files/count {declared}) · "
          f"manifest {len(set(disk) - HOUSEKEEPING)} (housekeeping excluded)")
    if unlisted:
        extra = sum(disk[n][1] for n in unlisted)
        print(f"  ON DISK, NOT INDEXED : {len(unlisted)} files, {extra/1e6:.1f} MB  {unlisted[:3]}")
    if no_md5:
        print(f"  INDEXED, NO MD5      : {len(no_md5)} files  {no_md5[:3]}")
    if not unlisted and not no_md5:
        print("  index and manifest agree")
    return listed, disk, unlisted, no_md5

for acc in ("PXD074038", "PXD055605", "PXD000561",
            "PXD000001", "PXD000004", "PXD010154"):
    audit_listing(acc)
```

```
PXD074038: indexed 27 (= /files/count 27) · manifest 26 (housekeeping excluded)
  index and manifest agree
PXD055605: indexed 8741 (= /files/count 8741) · manifest 8740 (housekeeping excluded)
  index and manifest agree
PXD000561: indexed 2384 (= /files/count 2384) · manifest 2384 (housekeeping excluded)
  index and manifest agree
PXD000001: indexed 8 (= /files/count 8) · manifest 10 (housekeeping excluded)
  ON DISK, NOT INDEXED : 4 files, 933.1 MB  ['PRIDE_Exp_mzData_Ac_22134.xml.gz', 'PXD000001_mztab.txt', 'TMT_Erwinia_1uLSike_Top10HCD_isol2_45stepped_60min_01-20141210.mzML']
  INDEXED, NO MD5      : 2 files  ['PRIDE_Exp_Complete_Ac_22134.pride.mgf.gz', 'PRIDE_Exp_Complete_Ac_22134.pride.mztab.gz']
PXD000004: indexed 30 (= /files/count 30) · manifest 25 (housekeeping excluded)
  ON DISK, NOT INDEXED : 5 files, 1063.0 MB  ['PRIDE_Exp_mzData_Ac_26881.xml.gz', 'PRIDE_Exp_mzData_Ac_26882.xml.gz', 'PRIDE_Exp_mzData_Ac_26883.xml.gz']
  INDEXED, NO MD5      : 10 files  ['PRIDE_Exp_Complete_Ac_26881.pride.mgf.gz', 'PRIDE_Exp_Complete_Ac_26881.pride.mztab.gz', 'PRIDE_Exp_Complete_Ac_26882.pride.mgf.gz']
PXD010154: indexed 1938 (= /files/count 1938) · manifest 1941 (housekeeping excluded)
  ON DISK, NOT INDEXED : 3 files, 125.7 MB  ['Synthetic_pepitdes.xlsx', 'Tissues_Rawfilie_list.xlsx', 'spectra_comparison_table_and_plots.zip']
```

Read `PXD000001` carefully, because it is the archive's first dataset and still the
one most often used as a worked example. `/files/all` lists **8 files**. The project
directory at
`https://ftp.pride.ebi.ac.uk/pride/data/archive/2012/03/PXD000001/` holds **11**,
plus 2 more under `generated/` — **13 in total**. The four data files it does not
index are `PRIDE_Exp_mzData_Ac_22134.xml.gz`, `PXD000001_mztab.txt` — **an mzTab
identifications file, exactly the processed result this skill tells you to look
for** — and the `.mzML` / `.mzXML` pair added after publication. That is 933 MB the
index does not mention, and the record's own `dataProcessingProtocol` announces two
of them in prose: *"Two extra files have been added post-publication"*. The listing
and the description of the same record disagree, and nothing in the listing's output
says so.

`PXD010154` shows this is not only a 2012 problem: a 2019 submission whose directory
holds a 125 MB `spectra_comparison_table_and_plots.zip` and two `.xlsx` sample tables
that `/files/all` never returns.

The reverse gap matters for a different reason. Files PRIDE **generated** from a
submission — the `.pride.mgf.gz` and `.pride.mztab.gz` conversions that live in a
`generated/` subdirectory — are indexed but are *not* in the checksum manifest, so
they have no published MD5. They are intact; they are simply unverifiable. Ten of
`PXD000004`'s thirty indexed files are in that state.

So: `/files/all` is the right listing to page from, but it is a floor, not a total.
Run `audit_listing` once per project and fetch anything it reports by name under the
FTP root.

### Which categories to expect, per submission type

Sampled over the 30 most recently published projects of each type, 2026-08-17:

| category | in COMPLETE | in PARTIAL | typical extensions |
|---|---|---|---|
| `RAW` | 30/30 | 30/30 | `.raw` (Thermo), `.d.zip` (Bruker), `.wiff` (Sciex), `.tdf` |
| `RESULT` | **30/30** | **0/30** | PRIDE XML `.xml.gz`, `.mzid`, `.mzTab` — see below |
| `PEAK` | 21/30 | 3/30 | `.mzML`, `.mgf`, `.mzXML`, `.dta`, `.apl` |
| `SEARCH` | 8/30 | **30/30** | `.dat`, `.msf`, `.pdresult`, `.txt`, `.tsv`, `.xlsx` |
| `FASTA` | 6/30 | 5/30 | `.fasta`, `.faa` |
| `EXPERIMENTAL DESIGN` | 3/30 | 3/30 | `.sdrf.tsv` |
| `OTHER` | 30/30 | 30/30 | `checksum.txt`, `mqpar.xml`, spreadsheets |
| `QUANTIFICATION`, `SPECTRUM LIBRARY` | rare | rare | `.xlsx`, `.speclib` |

Read that table as one rule: **`RESULT` is the marker of a COMPLETE submission and it
never appears in a PARTIAL one.** That row was re-tested at scale on 2026-08-18 over
**360 projects** — the 100 newest and 100 oldest `PARTIAL`, the 100 newest and 100
oldest `COMPLETE`, plus `PRIDE` and `AFFINITY` samples — with **zero violations**: no
`PARTIAL` carried a `RESULT`, and no `COMPLETE` lacked one. It is a rule, not a
tendency.

`SEARCH`, by contrast, means whatever the search engine wrote, and you cannot parse
it without knowing which engine produced it: a Mascot `.dat`, a Proteome Discoverer
`.msf` SQLite database and a bare `.xlsx` all arrive under the same label. Checking
for `SEARCH` and assuming it is machine-readable is the mistake this table exists to
prevent.

**But `RESULT` does not mean mzIdentML or mzTab.** It means *the submitter supplied a
format PRIDE recognises as a result*, and which format that is depends on when and how
the data was deposited. Every `RESULT` file across the 80 newest and 80 oldest
projects of each submission type, tallied by extension — the sample is deliberately
weighted to both ends of the archive, so read it as a range of what exists, not as an
archive-wide frequency:

| `submissionType` | PRIDE XML | `.mzid` | `.mzTab` | other |
|---|---|---|---|---|
| `COMPLETE` | 950 | 412 | 42 | `.psdb` 2, `.xml` 1 |
| `PRIDE` | 5465 | 0 | 0 | — |
| `AFFINITY` | 0 | 0 | 0 | `.csv` 42, `.parquet` 8, `.tsv` 2, `.adat` 2 |

Legacy PRIDE XML (`PRIDE_Exp_Complete_Ac_*.xml.gz`) is the *only* format in
`PRIDE`-type submissions and is common in older `COMPLETE` ones; `AFFINITY`
submissions contain no PSI format at all; and `.psdb` (PeptideShaker) and `.adat`
(SomaScan) turn up as well. Named cases:

| project | `submissionType` | what `RESULT` actually is |
|---|---|---|
| PXD074038 | COMPLETE | 5 × `.mzid` — mzIdentML, as expected |
| PXD000001 | COMPLETE (2012) | 1 × `PRIDE_Exp_Complete_Ac_22134.xml.gz` — **PRIDE XML** |
| PRD000749 | PRIDE | 36 × `PRIDE_Exp_Complete_*.xml.gz` — PRIDE XML again |
| PXD055210 | COMPLETE | 1 × `.gz` covering 96 raw files — one bundle, not one per run |
| PAD000052 | AFFINITY | 1 × `.npx.csv` — an Olink NPX table; no spectra exist at all |

`if "RESULT" in categories: parse_mzid(...)` is therefore wrong on four of those five
rows. Branch on the filename. PRIDE XML is readable, but it needs a PRIDE XML parser,
not an mzIdentML one, and an `AFFINITY` `RESULT` needs neither.

`EXPERIMENTAL DESIGN` is an SDRF-Proteomics file mapping each raw file to its sample,
condition and replicate. It appears on only about 10% of submissions but it is the
difference between a usable design matrix and guessing from filenames — always take
it when it is there. `/files/sdrf/{accession}` returns just its URL.

## Get the files

Four things about the file records will cost you if you take them at face value.

**`publicFileLocations` offers `ftp://` and Aspera only — never HTTPS.** The same host
serves HTTPS on the identical path, and swapping the scheme is verified to return
byte-identical content. Do that rather than adding an FTP client.

**The `checksum` field on the file record is almost always an empty string**, and the
MD5s live at `/files/checksum/{accession}` instead, as a three-column TSV. Fetch it
once per project and verify, because a truncated multi-gigabyte raw file fails deep
inside a search engine hours later.

"Almost always" is not "always", and **when the field is populated it is a SHA-1, not
an MD5.** Legacy `PRIDE`-type submissions carry it: all 36 file records in `PRD000749`,
all 12 in `PRD000567` and all 279 in `PRD000580` hold a **40-character** hex digest,
while `PRD000001` holds `""` on all 15. Verified byte-for-byte against
`PRIDE_Exp_Complete_Ac_19313.pride.mztab.gz` — `sha1` of the download equals the
record's `checksum`; the `md5` does not. Length is the discriminator: 32 hex means the
TSV's MD5, 40 hex means the record's SHA-1. Feeding a 40-character value to an MD5
comparison reports corruption on every file in the project.

That SHA-1 is worth having for a second reason: it covers files the MD5 TSV omits.
`PRIDE_Exp_Complete_Ac_19313.pride.mztab.gz` is a `generated/` derivative with no
entry in `/files/checksum/PRD000567` at all, and its record SHA-1 is the only
published digest for it.

**A missing MD5 is not a failed MD5.** The TSV covers the submitted files; it does not
cover the derivatives PRIDE generated under `generated/`, which the file index *does*
list (see `audit_listing` above). `md5s.get(name, "")` turns "no published checksum"
into an empty expected value that never matches, so a naive equality assert reports
`MD5 MISMATCH want= got=<hash>` on a perfectly intact download. That is a false
corruption alarm, and it aborts the loop. Distinguish the two cases explicitly.

**`fileSizeBytes` is not always the size on disk.** For `PXD000001` the record claims
497,985 bytes for `PRIDE_Exp_Complete_Ac_22134.pride.mztab.gz` where the server sends
103,845, and 10,677,205 for the `RESULT` file where the server sends 10,668,000. The
`File-Size` column of the checksum TSV matched the server both times. Use
`fileSizeBytes` to plan a transfer, not to validate one.

```python
import hashlib, json, os, urllib.request
from collections import defaultdict

V3 = "https://www.ebi.ac.uk/pride/ws/archive/v3"
ACC = "PXD074038"                       # COMPLETE submission, 27 files, ~688 MB total
OUT = "Data/pride/" + ACC
WANT = {"EXPERIMENTAL DESIGN", "RESULT", "PEAK"}   # RAW is deliberately excluded
PER_CATEGORY = 1                        # smallest N per category; raise for the full set
HOUSEKEEPING = {"submission.px", "README.txt", "checksum.txt"}

def api(path):
    with urllib.request.urlopen(V3 + path, timeout=300) as r:
        return json.loads(r.read())

def https(rec):
    ftp = next(v["value"] for v in rec["publicFileLocations"]
               if v["name"] == "FTP Protocol")
    return ftp.replace("ftp://ftp.pride.ebi.ac.uk/", "https://ftp.pride.ebi.ac.uk/")

os.makedirs(OUT, exist_ok=True)
project = api(f"/projects/{ACC}")
files = api(f"/projects/{ACC}/files/all")

# MD5s are not on the file records for a modern submission; they are here, as TSV.
with urllib.request.urlopen(f"{V3}/files/checksum/{ACC}", timeout=300) as r:
    lines = r.read().decode().splitlines()
md5s = {c[0]: c[1] for c in (l.split("\t") for l in lines[1:]) if len(c) >= 2}

# The manifest is the directory; the index is not. Say so before anything moves.
unindexed = sorted((set(md5s) - {f["fileName"] for f in files}) - HOUSEKEEPING)
if unindexed:
    print(f"  !! {len(unindexed)} file(s) in the project directory are NOT in the file index:")
    for n in unindexed:
        print(f"     {n}   (fetch by name under the FTP root)")

by_cat = defaultdict(list)
for f in files:
    by_cat[f["fileCategory"]["value"]].append(f)

manifest, total, unverified = [], 0, 0
for cat in sorted(WANT & set(by_cat)):
    for f in sorted(by_cat[cat], key=lambda x: x["fileSizeBytes"])[:PER_CATEGORY]:
        dest = os.path.join(OUT, f["fileName"])
        urllib.request.urlretrieve(https(f), dest)
        got = hashlib.md5(open(dest, "rb").read()).hexdigest()
        want = md5s.get(f["fileName"])          # None, not "" — absent is not mismatch
        if want is None:
            unverified += 1
            ok = "NO PUBLISHED MD5 — unverifiable"
        elif got == want:
            ok = "md5 OK"
        else:
            raise AssertionError(f"MD5 MISMATCH {f['fileName']} want={want} got={got}")
        size = os.path.getsize(dest)
        if want is not None and size != f["fileSizeBytes"]:
            print(f"     note: fileSizeBytes {f['fileSizeBytes']:,} != {size:,} on disk")
        total += size
        manifest.append({"category": cat, "fileName": f["fileName"], "md5": got,
                         "md5Verified": want is not None, "bytes": size, "url": https(f)})
        print(f"  {cat:<20} {size:>12,} B  {ok}  {f['fileName']}")

for cat in sorted(set(by_cat) - WANT):
    n = len(by_cat[cat])
    mb = sum(x["fileSizeBytes"] for x in by_cat[cat]) / 1e6
    print(f"  {cat:<20} {n:>4} files, {mb:,.0f} MB  — not requested")

with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump({"accession": ACC,
               "submissionType": project["submissionType"],
               "datasetDoi": project.get("doi") or None,
               "publications": project.get("references") or [],
               "license": project.get("license"),
               "otherOmicsLinks": project.get("otherOmicsLinks") or [],
               "ftpRoot": api(f"/projects/files-path/{ACC}")["ftp"],
               "notIndexed": unindexed,
               "files": manifest}, fh, indent=2)

print(f"\n{len(manifest)} files, {total/1e6:.1f} MB -> {OUT}"
      + (f"  ({unverified} without a published MD5)" if unverified else ""))
print("manifest records submissionType:", project["submissionType"],
      "| licence:", project.get("license"))
```

Run 2026-08-18:

```
  EXPERIMENTAL DESIGN         2,833 B  md5 OK  GSTM3_SDRF.sdrf.tsv
  PEAK                    5,922,524 B  md5 OK  H3_30.mgf
  RESULT                 38,242,131 B  md5 OK  H3_30.mzid
  OTHER                   6 files, 1 MB  — not requested
  RAW                     5 files, 350 MB  — not requested
  SEARCH                  5 files, 90 MB  — not requested

3 files, 44.2 MB -> Data/pride/PXD074038
manifest records submissionType: COMPLETE | licence: Creative Commons Public Domain (CC0)
```

Change `ACC` to `PXD000001` and the same block reports what the previous paragraphs
warned about, rather than crashing on it:

```
  !! 4 file(s) in the project directory are NOT in the file index:
     PRIDE_Exp_mzData_Ac_22134.xml.gz   (fetch by name under the FTP root)
     PXD000001_mztab.txt   (fetch by name under the FTP root)
     TMT_Erwinia_1uLSike_Top10HCD_isol2_45stepped_60min_01-20141210.mzML   (fetch by name under the FTP root)
     TMT_Erwinia_1uLSike_Top10HCD_isol2_45stepped_60min_01-20141210.mzXML   (fetch by name under the FTP root)
  PEAK                    5,984,662 B  NO PUBLISHED MD5 — unverifiable  PRIDE_Exp_Complete_Ac_22134.pride.mgf.gz
     note: fileSizeBytes 10,677,205 != 10,668,000 on disk
  RESULT                 10,668,000 B  md5 OK  PRIDE_Exp_Complete_Ac_22134.xml.gz
  OTHER                   3 files, 2 MB  — not requested
  RAW                     1 files, 220 MB  — not requested
  SEARCH                  1 files, 21 MB  — not requested

2 files, 16.7 MB -> Data/pride/PXD000001  (1 without a published MD5)
manifest records submissionType: COMPLETE | licence: EBI terms of use
```

With `md5s.get(name, "")` and a bare `assert got == want`, that run dies at the first
file — `AssertionError: MD5 MISMATCH want= got=5f5393bc3d6cc2a2fd9ba7831e8cc861` — on
a download that is byte-perfect. Note also the licence: `EBI terms of use`, not CC0.
Per-project licences vary, which is why the manifest records the one it saw.

Raise `PER_CATEGORY` for the full set and add `"RAW"` to `WANT` only when you mean it.

**Write the manifest.** It records `submissionType`, the dataset DOI, the paper, the
licence and the per-file MD5 — everything a methods section needs and everything a
directory of `.mzid` files cannot tell you six months later. The licence in
particular is per-project (`Creative Commons Public Domain (CC0)` here) and is worth
capturing at download time rather than re-deriving.

### When the whole project is the point

For a 66 GB PARTIAL submission, a per-file HTTPS loop is the wrong tool. Get the
transfer roots from the API and hand them to something built for it:

```python
import json, urllib.request

V3 = "https://www.ebi.ac.uk/pride/ws/archive/v3"
ACC = "PXD050610"

def api(path):
    with urllib.request.urlopen(V3 + path, timeout=120) as r:
        return json.loads(r.read())

roots = api(f"/projects/files-path/{ACC}")
files = api(f"/projects/{ACC}/files/all")
total = sum(f["fileSizeBytes"] for f in files)
raw = [f for f in files if f["fileCategory"]["value"] == "RAW"]

print(f"{ACC}: {len(files)} files, {total/1e9:.1f} GB "
      f"({len(raw)} RAW files at {sum(f['fileSizeBytes'] for f in raw)/1e9:.1f} GB)")
print(f"FTP root   : {roots['ftp']}")
print(f"Globus     : {roots['globus'][:78]}...")
print()
print("# whole project over HTTPS, resumable, one connection:")
print(f"wget -c -r -nH --cut-dirs=6 --no-parent "
      f"{roots['ftp'].replace('ftp://ftp.pride.ebi.ac.uk/', 'https://ftp.pride.ebi.ac.uk/')}/")
print()
print("# one file, then verify it against the repository's own MD5:")
one = min(files, key=lambda f: f["fileSizeBytes"])
url = next(v["value"] for v in one["publicFileLocations"] if v["name"] == "FTP Protocol")
print(f"curl -C - -O {url.replace('ftp://ftp.pride.ebi.ac.uk/', 'https://ftp.pride.ebi.ac.uk/')}")
print(f"curl -s {V3}/files/checksum/{ACC} | grep {one['fileName']}")
print()
print("# Aspera, when the transfer is large enough to be worth the client:")
asp = next(v["value"] for v in one["publicFileLocations"] if v["name"] == "Aspera Protocol")
print(f"ascp -QT -l 300m -P33001 -i <aspera-key> {asp.rsplit('/', 1)[0]}/ ./{ACC}/")
```

```
PXD050610: 26 files, 66.5 GB (25 RAW files at 66.5 GB)
FTP root   : ftp://ftp.pride.ebi.ac.uk/pride/data/archive/2025/11/PXD050610
Globus     : https://app.globus.org/file-manager?origin_id=47772002-3e5b-4fd3-b97c-18cee38d...
```

It prints the commands rather than running them, which is the right default at this
size. Globus is the sane route for a whole large project onto a cluster; the Aspera
endpoint needs the public EBI key file, so plain HTTPS with `-c` is usually less
trouble.

Vendor raw formats need a converter before most open tooling will read them —
`.raw`, `.d`, `.wiff` and `.tdf` are all proprietary containers. That conversion step
is the real cost of a PARTIAL submission, and it is why the COMPLETE filter is worth
applying first.

## Going the other way — from a protein to datasets

`/proteins/{uniprot_accession}` lists the PRIDE projects whose identifications
include a given protein. It is the only reverse index the API exposes and it is
genuinely useful for *has anyone seen this protein, and where*.

```python
import json, urllib.error, urllib.request

V3 = "https://www.ebi.ac.uk/pride/ws/archive/v3"

def projects_reporting(uniprot_accession):
    """PRIDE projects whose identifications include this protein.

    404 means 'not in the protein index', NOT 'never observed'. The index covers a
    subset of submissions, so absence is not evidence.
    """
    try:
        with urllib.request.urlopen(f"{V3}/proteins/{uniprot_accession}", timeout=90) as r:
            return json.loads(r.read())["projects"]
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

for prot in ("P04637", "P00533", "P68871", "P02768", "Q9BYF1"):
    hits = projects_reporting(prot)
    if hits is None:
        print(f"  {prot}: not in the protein index (says nothing about the archive)")
        continue
    print(f"  {prot}: {len(hits)} projects, e.g. {', '.join(hits[:4])}")
    with urllib.request.urlopen(f"{V3}/projects/{hits[0]}", timeout=60) as r:
        p = json.loads(r.read())
    print(f"          {hits[0]} [{p['submissionType']}] {p['title'][:56]}")
```

```
  P04637: 131 projects, e.g. PXD041817, PXD029496, PXD031975, PXD033910
          PXD041817 [PARTIAL] IRF2BP2 counteracts the ATF7/JDP2 heterodimer to prevent
  P00533: not in the protein index (says nothing about the archive)
  P68871: 346 projects, e.g. PXD033513, PXD055781, PXD029496, PXD030480
          PXD033513 [PARTIAL] : Interacting partners of Trypanosoma brucei CPSF73 in t
  P02768: 409 projects, e.g. PXD041817, PXD025214, PXD046028, PXD050767
          PXD041817 [PARTIAL] IRF2BP2 counteracts the ATF7/JDP2 heterodimer to prevent
  Q9BYF1: not in the protein index (says nothing about the archive)
```

**The index is sparse, and its gaps are not where you would guess.** P04637 (TP53),
P68871 (haemoglobin beta) and P02768 (serum albumin) resolve; P00533 (EGFR) and
Q9BYF1 (ACE2) 404, despite both appearing in a great deal of published proteomics.
So a hit is evidence and a miss is nothing at all. Never report "not detected in
PRIDE" from this endpoint — say "not in PRIDE's protein index", which is a statement
about the index.

## Which API version, and what the version prefix does not do

The current base is `https://www.ebi.ac.uk/pride/ws/archive/v3`, tested here on
2026-08-18. Its own OpenAPI document lives at `/v3/v3/api-docs` — the doubled `v3` is
correct, not a typo, and there is no `/api-docs` at the base.

The trap is subtle and worth knowing before you debug something that looks like data
corruption. **`v1`, `v2`, `v3` and the unversioned path all return byte-identical
responses.** Requesting `/pride/ws/archive/v2/projects/PXD050610`,
`/v1/projects/PXD050610` and `/projects/PXD050610` produced the same MD5 as the v3
path; only a nonsense version like `/v9/` 404s. So the version prefix is accepted and
then ignored — everything is served by the v3 implementation.

The consequence: code written against v1 or v2 does not fail with a 404 telling you
to migrate. It gets HTTP 200 and the v3 body shape, which is different — v2 wrapped
results in a HAL envelope with `_embedded` and `page`, while v3 returns a bare list
and puts the count in a header. The failure surfaces as a `KeyError` or, worse, as an
empty result treated as no data. Pin `v3` explicitly in new code so the URL states
the shape you parse, and treat any surviving v1/v2 URL as already migrated.

## Other endpoints worth knowing

- `/status/{accession}` returns bare text, and it is the **only** PRIDE endpoint that
  distinguishes an embargoed submission from a nonexistent one. Three outcomes, all
  verified 2026-08-18:
  - `PUBLIC` in under a second — PRIDE-held and released (`PXD050610`, `PAD000052`,
    `PXD055605`, and the legacy `PRD000001`).
  - `PRIVATE` in under a second — **PRIDE-held and embargoed.** `PXD082700`,
    `PXD082701`, `PXD082706`–`PXD082710`, `PXD082740` and `PXD082746` each returned
    `PRIVATE` in 0.7 s while `/projects/{accession}` returned 404 for every one of
    them. ProteomeCentral independently reports all nine as
    `DatasetNotYetReleased` / `repository: PRIDE`.
  - **hangs** — not PRIDE's accession at all. `PXD082693` (iProX), `PXD073836`
    (MassIVE), `PXD082702` (iProX, embargoed), `PXD082711` (MassIVE, embargoed) and
    the nonexistent `PXD999999999` all time out with no status code and no body.

  So it is a good repository-and-release check and a poor existence check: only the
  hang is ambiguous, and it costs you the full timeout. Always pass one — 30 s is
  enough, since every real answer arrived in under a second on a warm index (a cold
  one took 21 s). Reach for it *after* `/projects/{accession}` has 404'd, to find out
  which kind of 404 you have.
- `/projects/{accession}/similarProjects` returns full project records for related
  submissions, which is a better neighbourhood search than repeating your keyword.
- `/projects/reanalysis/{accession}` flags whether a reanalysis of the project exists.
  Despite the name it returns `{"scanAvailable": true}` rather than a list — verified
  for `PXD000561` (the draft human proteome) — and returns **404 with the message
  "The project accession is not in the database"** for a project with no reanalysis,
  including `PXD074038` and `PXD000001`, which plainly are in the database. Read that
  404 as "none", not as a bad accession.
- `/projects/count`, `/files/count`, `/findAllOrganismsCount`, `/stats/submitted-data`
  give archive-scale numbers for a methods paragraph.
- `/search/autocomplete?keyword=` returns title prefixes, useful for resolving a
  half-remembered dataset title.

## Limits worth stating in a write-up

- **PRIDE is half the field.** Say which repositories your survey covered. A PRIDE-only
  search silently excludes iProX, MassIVE, jPOST and PanoramaPublic, and iProX is
  currently the most active of them.
- **`total_records` wobbles by ±1 between identical calls.** Repeated identical
  requests returned 931 and 932 for the same filter within seconds. Do not build an
  equality assertion on a hit count; assert direction and magnitude.
- **`submissionType` describes the deposit, not the quality.** COMPLETE means a
  standard format was supplied, not that the FDR was sensible, the FASTA was right,
  or the quantification is comparable to yours. That judgement is in the protocol
  text.
- **Structured metadata is submitter-declared and often thin.** `diseases`,
  `softwares` and `quantificationMethods` are frequently empty on datasets that
  clearly have all three — PXD050610 declares no disease at all. Absence of a facet
  value is not absence of the thing.
- **`identifiedPTMStrings` reflects what was searched, not what is biologically
  present.** PXD050610 lists iodoacetamide derivatisation, which is the alkylation
  reagent, alongside real modifications.
- **Withdrawn and superseded datasets exist.** ProteomeXchange keeps a version
  number per accession; a reanalysis of "the" dataset may not be the version the
  paper used.
- **The file index can under-report the project directory.** `/files/all` and
  `/projects/{acc}/files/count` read the same index, so they always agree with each
  other and never reveal the gap. State the count you enumerated *and* say you
  reconciled it against `/files/checksum/{accession}`; on `PXD000001` that is the
  difference between 8 files and 12.
- **"Not in PRIDE" is three claims, not one.** Wrong repository, embargoed, and never
  issued all look identical from `/projects/{accession}`. Do not write "the accession
  is invalid" on the strength of a 404.

## Try it

A self-contained check that this skill still works. Public data, no account, no key,
nothing downloaded — this is a shape assertion against the live API, which is the
failure mode a URL check cannot see.

**Data** — live PRIDE v3 endpoints, ProteomeCentral's PROXI resolver, and six named
public datasets:

    https://www.ebi.ac.uk/pride/ws/archive/v3/search/projects?keyword=liver&pageSize=1
    https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD050610
    https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD074038
    https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD000001/files/all
    https://www.ebi.ac.uk/pride/ws/archive/v3/files/checksum/PXD000001

`PXD050610` is a human cardiac aging study (heart, Orbitrap Fusion Lumos, DIA), a
**PARTIAL** submission paired with GEO series GSE263566. `PXD074038` is a hepatic
GSTM3 co-immunoprecipitation study, a **COMPLETE** submission with mzIdentML results.
The other four are the counter-examples this skill was corrected against:

- `PXD055605` — 8,741 files, to prove `/files/all` is genuinely unpaginated.
- `PXD000001` — the archive's first dataset, where the file index lists 8 of the 13
  files in the project directory, and 2 of the 8 it does list have no published MD5.
- `PRD000749` — a legacy `PRIDE`-type submission whose file records carry a
  **40-character SHA-1** where every modern record carries `""`.
- `PAD000052` — an `AFFINITY` submission on a `PAD` accession whose `RESULT` is an
  Olink `.csv`, not a PSI format.

The embargo check resolves its own accession at run time from the band below the
newest public submission, because any specific embargoed accession becomes public
eventually. All datasets are public and need no account or licence acceptance. Last
confirmed reachable 2026-08-18.

```python
import json, urllib.error, urllib.parse, urllib.request

V3 = "https://www.ebi.ac.uk/pride/ws/archive/v3"
PROXI = "https://proteomecentral.proteomexchange.org/api/proxi/v0.1/datasets"

def api(path, timeout=300):
    with urllib.request.urlopen(V3 + path, timeout=timeout) as r:
        return json.loads(r.read()), dict(r.headers)

def text(path, timeout=300):
    with urllib.request.urlopen(V3 + path, timeout=timeout) as r:
        return r.read().decode()

def code(url, timeout=90):
    """(http_status, parsed_body_or_None) — the 404 BODY is where the answer lives."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except ValueError:
            return e.code, None

# --- 1. the search response is a bare LIST and the hit count is a HEADER ---
hits, hdr = api("/search/projects?" + urllib.parse.urlencode(
    {"keyword": "liver", "pageSize": 1}))
assert isinstance(hits, list), type(hits)
total = int(hdr["total_records"])
assert total > 1000, total

SEARCH_FIELDS = ["accession", "title", "projectDescription", "dataProcessingProtocol",
                 "sampleProcessingProtocol", "projectTags", "keywords", "doi",
                 "submissionType", "publicationDate", "updatedDate", "submissionDate"]
missing = [f for f in SEARCH_FIELDS if f not in hits[0]]
assert not missing, f"search record lost fields: {missing}"

# --- 2. pageSize is capped server-side; asking for more is silently truncated ---
big, _ = api("/search/projects?keyword=liver&pageSize=1000")
assert len(big) == 100, len(big)

# --- 3. an unknown filter FIELD is ignored, not rejected: same count as no filter ---
_, h_ok = api("/search/projects?" + urllib.parse.urlencode(
    {"keyword": "liver", "filter": "organisms==Homo sapiens (human)", "pageSize": 1}))
_, h_typo = api("/search/projects?" + urllib.parse.urlencode(
    {"keyword": "liver", "filter": "organism==Homo sapiens (human)", "pageSize": 1}))
narrowed, ignored = int(h_ok["total_records"]), int(h_typo["total_records"])
assert narrowed < ignored, (narrowed, ignored)
assert abs(ignored - total) <= 2, (ignored, total)

# --- 4. submissionType vocabulary, and PARTIAL outnumbering COMPLETE ---
fac, _ = api("/facet/projects?keyword=liver&facetPageSize=10")
st = fac["submissionType"]
assert {"COMPLETE", "PARTIAL"} <= set(st), st
assert st["PARTIAL"] > st["COMPLETE"], st

# --- 5. /projects/{acc} returns CvParam OBJECTS where search returned strings ---
partial, _ = api("/projects/PXD050610")
complete, _ = api("/projects/PXD074038")
assert isinstance(hits[0]["organisms"][0], str), "search organisms should be strings"
assert partial["organisms"][0]["name"] == "Homo sapiens (human)", partial["organisms"]
assert partial["submissionType"] == "PARTIAL", partial["submissionType"]
assert complete["submissionType"] == "COMPLETE", complete["submissionType"]

# --- 6. the top-level `doi` is PRIDE's dataset DOI, never the paper's ---
assert partial["doi"] == "", repr(partial["doi"])
assert complete["doi"] == "10.6019/PXD074038", complete["doi"]
paper = partial["references"][0]
assert paper["pubmedID"] == 40915658 and paper["doi"] == "10.1111/acel.70219", paper
assert complete["references"][0]["pubmedID"] == 0, complete["references"]

# --- 7. RESULT is the marker of processed identifications; PARTIAL has none ---
p_types, _ = api("/files/getCountOfFilesByType/PXD050610")
c_types, _ = api("/files/getCountOfFilesByType/PXD074038")
assert "RESULT" not in p_types and "SEARCH" in p_types, p_types
assert "RESULT" in c_types, c_types

# --- 8. file locations are ftp:// and Aspera only; MD5s live elsewhere ---
files, _ = api("/projects/PXD074038/files/all")
sdrf = next(f for f in files if f["fileName"].endswith(".sdrf.tsv"))
protos = {v["name"] for v in sdrf["publicFileLocations"]}
assert protos == {"FTP Protocol", "Aspera Protocol"}, protos
assert sdrf["checksum"] == "", repr(sdrf["checksum"])
cols = text("/files/checksum/PXD074038").splitlines()[1].split("\t")
assert len(cols) == 3 and len(cols[1]) == 32, cols

# --- 9. /files/all really is unpaginated, on a project of 8,741 files ---
big_files, _ = api("/projects/PXD055605/files/all")
big_declared = int(text("/projects/PXD055605/files/count"))
assert len(big_files) == big_declared == 8741, (len(big_files), big_declared)
assert len(api("/projects/PXD055605/files?pageSize=1000")[0]) == 100, "paginated sibling caps at 100"

# --- 10. THE FILE INDEX IS NOT THE DIRECTORY. PXD000001: 8 indexed, 12 on disk. ---
HOUSEKEEPING = {"submission.px", "README.txt", "checksum.txt"}
one_files, _ = api("/projects/PXD000001/files/all")
one_names = {f["fileName"] for f in one_files}
one_manifest = {l.split("\t")[0] for l in text("/files/checksum/PXD000001").splitlines()[1:] if l.strip()}
assert len(one_names) == int(text("/projects/PXD000001/files/count")) == 8, len(one_names)
unlisted = (one_manifest - one_names) - HOUSEKEEPING
assert len(unlisted) == 4, sorted(unlisted)
assert "PXD000001_mztab.txt" in unlisted, "an mzTab result file is missing from the index"

# --- 11. ...and files the index DOES list can have no published MD5 at all ---
md5s = {c[0]: c[1] for c in (l.split("\t") for l in
        text("/files/checksum/PXD000001").splitlines()[1:]) if len(c) >= 2}
generated = sorted(one_names - set(md5s))
assert len(generated) == 2 and all(g.startswith("PRIDE_Exp_Complete_Ac_22134.pride") for g in generated), generated
assert md5s.get(generated[0]) is None and md5s.get(generated[0], "") == "", \
    "absent MD5 must not be read as an empty expected value"

# --- 12. the record's `checksum` is not always empty, and when set it is SHA-1 not MD5 ---
legacy, _ = api("/projects/PRD000749")
assert legacy["submissionType"] == "PRIDE", legacy["submissionType"]
legacy_files, _ = api("/projects/PRD000749/files/all")
digests = {len(f["checksum"]) for f in legacy_files}
assert digests == {40}, f"legacy record checksums are 40-char SHA-1, got lengths {digests}"
assert all(f["fileName"].endswith(".xml.gz") for f in legacy_files
           if f["fileCategory"]["value"] == "RESULT"), "legacy RESULT is PRIDE XML, not mzIdentML"

# --- 13. AFFINITY is a PAD accession whose RESULT is not a PSI format ---
aff, _ = api("/projects/PAD000052")
assert aff["submissionType"] == "AFFINITY", aff["submissionType"]
aff_files, _ = api("/projects/PAD000052/files/all")
aff_result = [f["fileName"] for f in aff_files if f["fileCategory"]["value"] == "RESULT"]
assert aff_result and aff_result[0].endswith(".csv"), aff_result
assert code(f"{PROXI}/PAD000052")[1]["error_code"] == "NoSuchIdentifier", "PAD is not a PX accession"

# --- 14. EMBARGOED != NONEXISTENT, and PRIDE's own 404 cannot tell them apart ---
newest = next(r["accession"] for r in api(
    "/search/projects?pageSize=20&sortFields=submissionDate&sortDirection=DESC")[0]
    if r["accession"].startswith("PXD"))
held = None
for n in range(int(newest[3:]) - 1, int(newest[3:]) - 25, -1):
    acc = f"PXD{n:06d}"
    body = code(f"{PROXI}/{acc}")[1] or {}
    if body.get("error_code") == "DatasetNotYetReleased" and body.get("repository") == "PRIDE":
        held = acc
        break
assert held, "no PRIDE-embargoed accession in the 24 below the newest public one"
assert code(f"{V3}/projects/{held}")[0] == 404, "an embargoed project 404s like a bad accession"
assert code(f"{V3}/projects/PXD999999999")[0] == 404, "so does one that was never issued"
assert text(f"/status/{held}", timeout=30).strip() == "PRIVATE", "/status is the discriminator"
assert code(f"{PROXI}/PXD999999999")[1]["error_code"] == "NoSuchIdentifier", "never issued"

print("search        : list of", len(hits), "| total_records header:", total)
print("pageSize 1000 : server returned", len(big))
print("filter        : organisms== ->", narrowed, "| typo organism== ->", ignored)
print("submissionType:", json.dumps(st))
print("PXD050610     :", partial["submissionType"], "| file types", json.dumps(p_types))
print("              : doi", repr(partial["doi"]), "| paper PMID",
      paper["pubmedID"], paper["doi"], "| otherOmicsLinks", partial["otherOmicsLinks"])
print("PXD074038     :", complete["submissionType"], "| file types", json.dumps(c_types))
print("file locations:", sorted(protos), "| record checksum", repr(sdrf["checksum"]))
print("checksum TSV  :", cols)
print("PXD055605     : /files/all returned", len(big_files), "= /files/count", big_declared)
print("PXD000001     : index", len(one_names), "files | directory", len(one_manifest),
      "| NOT INDEXED:", sorted(unlisted))
print("              : indexed with no published MD5:", generated)
print("PRD000749     :", legacy["submissionType"], "| record checksum lengths:", digests,
      "(SHA-1, not the TSV's 32-char MD5)")
print("PAD000052     :", aff["submissionType"], "| RESULT", aff_result)
print("embargoed     :", held, "-> /projects 404, /status PRIVATE, PROXI DatasetNotYetReleased/PRIDE")
print("never issued  : PXD999999999 -> /projects 404, PROXI NoSuchIdentifier")
print("all shape assertions passed")
```

**Expect**

Invariants — these are the response *shape*, so a failure means the skill is wrong,
not that the archive grew:

- `/search/projects` returns a **bare JSON list**, and the hit count is only in the
  `total_records` **header**. Both halves of that are load-bearing; a HAL envelope
  reappearing, or the count moving into the body, breaks every paging loop written
  against this skill.
- All twelve named fields are present on a search record, including both protocol
  fields. A rename here silently empties the triage step.
- `pageSize=1000` returns exactly **100** rows on `/search/projects` and on
  `/projects/{acc}/files`. `/projects/{acc}/files/all` ignores `pageSize` and returns
  everything — 8,741 rows for PXD055605, equal to `/files/count`.
- A **misspelled filter field is ignored, not rejected** — `organism==` returns the
  unfiltered total while `organisms==` narrows it. If those two ever agree, either
  the server started validating field names or the plural stopped working, and both
  change how you must write filters.
- `submissionType` includes `COMPLETE` and `PARTIAL`, and **PARTIAL outnumbers
  COMPLETE**.
- The **same field has two shapes on two endpoints** — `organisms` is a list of
  strings from search and a list of CvParam objects from `/projects/{acc}`.
- **The top-level `doi` is never the publication.** PXD050610 has `doi: ""` with the
  paper in `references[0]`; PXD074038 has the PRIDE dataset DOI `10.6019/PXD074038`
  with `pubmedID: 0`. If `doi` ever equals a journal DOI, the field changed meaning.
- **`RESULT` appears for the COMPLETE project and not for the PARTIAL one**, and the
  PARTIAL one has `SEARCH`. This is the whole go/no-go rule as an assertion.
- `publicFileLocations` offers exactly `{FTP Protocol, Aspera Protocol}` — **no
  HTTPS** — and the MD5 is a 32-character hex string in the second column of the
  checksum TSV.
- **The file index is not the project directory.** PXD000001 indexes 8 files while
  its checksum manifest lists 11; the four data files the index omits include
  `PXD000001_mztab.txt`. If that assertion ever fails because the gap closed, good —
  but check it, do not assume it.
- **An indexed file can have no published MD5.** PXD000001's two `generated/`
  derivatives are absent from the manifest, so `md5s.get(name, "")` yields `""` and a
  naive equality check reports corruption on an intact file. The assertion pins the
  distinction between *absent* and *mismatched*.
- **A populated record `checksum` is 40 hex characters, not 32** — SHA-1, on legacy
  `PRIDE`-type submissions. Every `PRD000749` record has one; every modern record has
  `""`.
- **`AFFINITY` lives on `PAD` accessions and its `RESULT` is not a PSI format**, and
  ProteomeCentral does not know `PAD` accessions at all.
- **Embargoed and never-issued are different states behind the same 404.** A live
  PRIDE-held embargoed accession returns 404 from `/projects/`, `PRIVATE` from
  `/status/`, and `DatasetNotYetReleased` from PROXI; `PXD999999999` returns 404 and
  `NoSuchIdentifier`. If `/status` ever stops answering `PRIVATE`, the only
  discriminator in the API is gone and the resolver must say so rather than guess.

Observed 2026-08-18 against API `info.version` **3.0** — these move as the archive
grows, so treat a mismatch as drift to investigate rather than a failure:

- `keyword=liver` → 2194 hits · `organisms==Homo sapiens (human)` → 931 ·
  submissionType facet `COMPLETE 385, PRIDE 15, AFFINITY 1, PARTIAL 1793`
- PXD050610 → `{"SEARCH": 1, "RAW": 25}`, 26 files, 66.5 GB, `otherOmicsLinks
  ['geo:GSE263566']`
- PXD074038 → `{"OTHER": 6, "SEARCH": 5, "EXPERIMENTAL DESIGN": 1, "RAW": 5,
  "PEAK": 5, "RESULT": 5}`, 27 files, ~688 MB
- PXD000001 → index 8 · manifest 11 · not indexed
  `['PRIDE_Exp_mzData_Ac_22134.xml.gz', 'PXD000001_mztab.txt', two 20141210 files]`
- The embargo check resolved `PXD082746` on the day of writing; it will resolve a
  different accession on yours, and that is the assertion working
- Archive scale: 40,770 projects · 3,504,583 files · 4,743 organisms
- The ±1 wobble described above means the 931 may read 932 on a repeat call; the
  assertion allows a tolerance of 2 for exactly this reason


## Sources

- PRIDE Archive — https://www.ebi.ac.uk/pride/
- v3 REST API and its OpenAPI document —
  https://www.ebi.ac.uk/pride/ws/archive/v3/ and
  https://www.ebi.ac.uk/pride/ws/archive/v3/v3/api-docs
- ProteomeXchange, for accessions PRIDE does not hold —
  https://proteomecentral.proteomexchange.org/
- PSI standard formats, mzML and mzIdentML — https://www.psidev.info/
- SDRF-Proteomics, the experimental design format —
  https://github.com/bigbio/proteomics-sample-metadata
- Perez-Riverol et al. (2025) *Nucleic Acids Research* 53, D543-D553 —
  https://doi.org/10.1093/nar/gkae1011
- Deutsch et al. (2023) *Nucleic Acids Research* 51, D1539-D1548 —
  https://doi.org/10.1093/nar/gkac1040

PRIDE submissions are public and most carry an explicit CC0 dedication, which the
per-project `license` field states. Cite the PRIDE resource paper and the original
submitters' publication — the one in `references[]`, not the dataset DOI alone —
when you reuse a dataset.
