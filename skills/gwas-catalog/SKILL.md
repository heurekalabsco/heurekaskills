---
name: gwas-catalog
description: Retrieve variant-trait associations from the NHGRI-EBI GWAS Catalog REST API — by trait, study accession, variant or gene — together with the discovery and replication cohort ancestry, sample sizes and effect estimates that decide whether an association transfers to anyone else. Handles the HAL response shape, the 20-row default page, and p-values that underflow a float to 0.0.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [gwas, human-genetics, epidemiology, cohort, public-data]
covers: [gwas, genome-wide association study, snp, rsid, variant, risk allele, trait association, efo, mondo, ontology, p-value, odds ratio, effect size, beta, ancestry, european ancestry, east asian ancestry, african ancestry, summary statistics, type 2 diabetes, coronary artery disease, schizophrenia, body mass index, height, eye color, replication, gcst accession, nhgri, human genetics]
papers: [PMID:19474294, PMID:24316577, PMID:30445434, PMID:36350656, PMID:39530240, PMID:33692100]
access: [open]
datasets: [https://www.ebi.ac.uk/gwas/rest/api/studies?size=1, https://www.ebi.ac.uk/gwas/rest/api/studies/GCST012219, https://www.ebi.ac.uk/gwas/rest/api/studies/GCST012219/associations, https://www.ebi.ac.uk/gwas/rest/api/studies/GCST000071/associations, https://www.ebi.ac.uk/gwas/rest/api/studies/GCST006494/associations, https://www.ebi.ac.uk/gwas/rest/api/studies/search/findByAccessionId?accessionId=GCST012219, https://www.ebi.ac.uk/gwas/rest/api/studies/search/findByEfoTrait?efoTrait=eye%20color&size=5, https://www.ebi.ac.uk/gwas/rest/api/efoTraits/search/findByEfoTrait?trait=type%202%20diabetes%20mellitus, https://www.ebi.ac.uk/gwas/rest/api/efoTraits/search/findByShortForm?shortForm=EFO_0003949, https://ftp.ebi.ac.uk/pub/databases/gwas/releases/latest/gwas-catalog-ancestry.tsv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: GWAS Catalog REST API at https://www.ebi.ac.uk/gwas/rest/api (229,952 studies / 1,191,948 associations / 24,618 trait terms on 2026-08-27) / FTP release dated 2026-08-24 / Python 3.12.8 standard library only, no third-party packages / curl 8.7.1 / macOS 15
  executed: 12
  unverified: 0
---
# GWAS Catalog — variant-trait associations with study context

The NHGRI-EBI GWAS Catalog is the curated record of what published genome-wide
association studies actually reported: on 2026-08-27, **229,952 studies** and
**1,191,948 variant-trait associations**, each carrying the paper it came from, the
cohort it was measured in, and the ontology term a curator assigned to the trait.

This skill is about getting associations out of the REST API and onto disk **with the
study record attached**, because an association without its cohort is not a result. It
is a number estimated in some particular set of people, at a threshold the Catalog sets
lower than genome-wide significance, and both of those facts live in the study record
rather than in the association.

**Nothing here needs an account, a key or a click-through.** The REST API and the FTP
release files are open over HTTPS. EMBL-EBI's Terms of Use state that it "places no
additional restrictions on the use or redistribution of the data available via its Data
Resources and Tools other than those provided by the original data owners", and the
Catalog's own summary-statistics page says "The majority of data are made available
either through 'CC0' or 'EMBL-EBI's standard terms of use' with a small number of
exceptions" — those exceptions are per-study, flagged as a Usage License on the
download tables, and matter when you redistribute a study's summary statistics rather
than when you query the catalogue. Cite the Catalog papers under *Sources*.

Four mechanical traps cause most wrong GWAS Catalog results, and **all four return a
well-formed HTTP 200** rather than an error. They are the next four sections; two more —
what counts as *one* association, and what a "mapped gene" actually is — follow after
them.

## Trap 1 — this is HAL, and there are three different response shapes

Every response is `application/hal+json`. Records are never at the top level; they are
nested under `_embedded.<collectionName>`, and the collection name is the plural
resource name, not `results` or `data`. Code written against a plain JSON list finds
nothing, raises nothing, and reports no hits.

The part that is easy to miss is that **the same API answers in three shapes**, and a
single unwrap helper written against the first one breaks on the other two:

| Shape | Looks like | Returned by |
|---|---|---|
| **Paged collection** | `_embedded` + `_links` + **`page`** | `/studies`, `/associations`, `/efoTraits`, and the searches whose URI template lists `{?…,page,size,…}` |
| **Unpaged collection** | `_embedded` + `_links`, and **no `page` key at all** | `/studies/{acc}/associations`, `/efoTraits/{id}/studies`, and the searches whose template lists only `{?…,projection}` |
| **Single resource** | a bare object with `_links`, and **no `_embedded`** | `/studies/{acc}`, `/singleNucleotidePolymorphisms/{rsId}`, and `findByAccessionId` |

```bash
curl -s "https://www.ebi.ac.uk/gwas/rest/api/studies?size=1" \
| python3 -c "import json,sys
d = json.load(sys.stdin)
print('top-level keys :', sorted(d))
print('collection name:', list(d['_embedded']))
print('page           :', d['page'])
print('link rels      :', sorted(d['_links']))"
```

```
top-level keys : ['_embedded', '_links', 'page']
collection name: ['studies']
page           : {'size': 1, 'totalElements': 229952, 'totalPages': 229952, 'number': 0}
link rels      : ['first', 'last', 'next', 'profile', 'search', 'self']
```

`profile` and `search` are always there; `first`, `last`, `next` and `prev` appear only
as the position in the result set allows, which is what makes `next` a usable
end-of-pages signal.

Write one reader that copes with all three, and make it say which shape it got rather
than guessing:

```python
import json, urllib.error, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api"


def fetch(path, **params):
    """One GET against the API. Returns the parsed HAL document."""
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=300) as fh:
        return json.loads(fh.read())


def shape(doc):
    """Which of the three shapes came back."""
    if "_embedded" not in doc:
        return "single"
    return "paged" if "page" in doc else "unpaged"


def records(doc, name):
    """Rows out of a collection document, or an exception naming what arrived.

    An empty result still carries `_embedded`, so a missing key means the shape
    is wrong -- usually a single resource where a collection was expected."""
    if "_embedded" not in doc:
        raise TypeError(f"single resource, not a {name} collection: {sorted(doc)}")
    if name not in doc["_embedded"]:
        raise KeyError(f"no '{name}' in _embedded: {list(doc['_embedded'])}")
    return doc["_embedded"][name]


# 1. Paged collection.
d = fetch("studies", size=1)
print(f"{'/studies':52} {shape(d):8} {len(records(d, 'studies'))} row(s), "
      f"{d['page']['totalElements']} total")

# 2. Unpaged collection -- no `page`, so `d['page']` is a KeyError, and any
#    loop keyed on totalElements never runs.
d = fetch("studies/GCST012219/associations")
print(f"{'/studies/GCST012219/associations':52} {shape(d):8} "
      f"{len(records(d, 'associations'))} row(s), page key present: {'page' in d}")

# 3. Single resource -- no `_embedded` at all. This is the one that silently
#    returns zero rows if you reach for _embedded with .get().
d = fetch("studies/search/findByAccessionId", accessionId="GCST012219")
print(f"{'findByAccessionId':52} {shape(d):8} accessionId={d['accessionId']}")
try:
    records(d, "studies")
except TypeError as e:
    print("   reaching for a collection here:", e)
```

```
/studies                                             paged    1 row(s), 229952 total
/studies/GCST012219/associations                     unpaged  26 row(s), page key present: False
findByAccessionId                                    single   accessionId=GCST012219
   reaching for a collection here: single resource, not a studies collection: ['_links', 'accessionId', 'ancestries', 'diseaseTrait', 'fullPvalueSet', 'genotypingTechnologies', 'gxe', 'gxg', 'imputed', 'initialSampleSize', 'platforms', 'pooled', 'publicationInfo', 'qualifier', 'replicationSampleSize', 'snpCount', 'studyDesignComment', 'userRequested']
```

**Read the URI template on `/{resource}/search` before writing a query.** The root
document and each `/search` document advertise exactly which parameters an endpoint
takes, and whether `page,size` is among them. That is the difference between shape one
and shape two, and it is the only reliable way to know:

```bash
curl -s "https://www.ebi.ac.uk/gwas/rest/api/studies/search" \
| python3 -c "import json,sys
for rel, link in sorted(json.load(sys.stdin)['_links'].items()):
    print(f\"{rel:30} {link['href'].split('/')[-1]}\")"
```

```
findByAccessionId              findByAccessionId{?accessionId,projection}
findByDiseaseTrait             findByDiseaseTrait{?diseaseTrait,page,size,sort,projection}
findByEfoTrait                 findByEfoTrait{?efoTrait,page,size,sort,projection}
findByEfoUri                   findByEfoUri{?uri,page,size,sort,projection}
findByFullPvalueSet            findByFullPvalueSet{?fullPvalueSet,page,size,sort,projection}
findByPublicationIdPubmedId    findByPublicationIdPubmedId{?pubmedId,page,size,sort,projection}
findByUserRequested            findByUserRequested{?userRequested,page,size,sort,projection}
self                           search
```

## Trap 2 — the default page is 20 rows, and elsewhere `size` does nothing at all

Two opposite failures, and which one you get depends on the endpoint you happened to
pick.

**On a paged endpoint the default is 20 and there is no warning.** Ask for the studies
of a common trait and you get twenty of them, in a complete-looking document, with the
evidence of truncation only in `page.totalElements` and in whether `_links` carries a
`next`.

**On an unpaged endpoint `size` is accepted and ignored** — the whole result set comes
back regardless. Probing such an endpoint with `size=1` to "look at one record" fetches
everything; `associations/search/findByRsId?rsId=rs7412&size=1` returned all **1,182**
associations for APOE, and took minutes.

And `size` on a paged endpoint is **capped at 1000**: `?size=5000` answers HTTP 200 with
`page.size` quietly rewritten to 1000, and `page.totalPages` recomputed to match. Code
that asks for 5000 and then loops `total // 5000` times gets 1000 rows a page and stops
after a fifth of them — with no error, and with every row it did read being correct.

```python
import json, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api"


def fetch_url(url):
    with urllib.request.urlopen(url, timeout=300) as fh:
        return json.loads(fh.read())


def fetch(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    return fetch_url(url)


def walk(path, name, per_page=100, cap=100_000, **params):
    """Follow _links.next to exhaustion, then prove nothing was left behind.

    Paging is driven by the `next` link, not by incrementing an offset: the
    server owns the page size and rewrites it if you ask for too much. On the
    last page `next` is simply absent, which is what ends the loop."""
    doc = fetch(path, size=per_page, **params)
    if "page" not in doc:
        return doc["_embedded"][name]          # unpaged endpoint: this is all of it
    total = doc["page"]["totalElements"]
    if total > cap:
        raise RuntimeError(f"{path}: {total} rows exceeds cap {cap}")
    rows = list(doc["_embedded"][name])
    while "next" in doc["_links"]:
        doc = fetch_url(doc["_links"]["next"]["href"])
        rows += doc["_embedded"][name]
    assert len(rows) == total, f"{path}: collected {len(rows)} of {total}"
    return rows


# a. The 20-row default, on a trait with far more than 20 studies.
d = fetch("studies/search/findByEfoTrait", efoTrait="type 2 diabetes mellitus")
print(f"default page   : {len(d['_embedded']['studies'])} studies returned, "
      f"{d['page']['totalElements']} exist, next link: {'next' in d['_links']}")

# b. `size` is honoured up to 1000 and silently rewritten above it.
for asked in (100, 1000, 5000):
    p = fetch("efoTraits", size=asked)["page"]
    print(f"asked size={asked:<5} -> page.size={p['size']:<5} "
          f"totalPages={p['totalPages']}")

# c. Following `next` collects the lot. Small trait, so this is four quick pages.
rows = walk("studies/search/findByEfoTrait", "studies", per_page=5,
            efoTrait="eye color")
print(f"walked         : {len(rows)} eye-colour studies, "
      f"{len({r['accessionId'] for r in rows})} distinct accessions")

# d. An unpaged endpoint ignores `size` completely -- both calls cost the same.
one = fetch("studies/GCST012219/associations", size=1)["_embedded"]["associations"]
all_ = fetch("studies/GCST012219/associations")["_embedded"]["associations"]
print(f"size=1 ignored : {len(one)} rows with size=1, {len(all_)} rows without")
```

```
default page   : 20 studies returned, 343 exist, next link: True
asked size=100   -> page.size=100   totalPages=247
asked size=1000  -> page.size=1000  totalPages=25
asked size=5000  -> page.size=1000  totalPages=25
walked         : 16 eye-colour studies, 16 distinct accessions
size=1 ignored : 26 rows with size=1, 26 rows without
```

Rules that fall out of this:

- **Never read `_embedded` without reading `page` in the same breath.** `len(rows) ==
  page.totalElements` is the assertion; a `next` link is the alarm.
- **Page by following `_links.next`**, not by incrementing your own offset. The server
  decides the page size, and it will rewrite yours without saying so.
- **Do not probe an unpaged endpoint with a small `size`.** It costs the full result
  set. Check the URI template first, or expect the whole thing.
- The API is not fast: the global `/studies` collection returns roughly 100 study
  records per 40 seconds, so a 343-study trait is about three minutes and the full
  229,952 studies is not a REST job at all. See *Get the files* for the bulk route.

## Trap 3 — p-values are a mantissa and an exponent, and the float underflows to zero

Every association carries three p-value fields, and they do not agree at the extremes:

| Field | Type | At `p = 2e-28539` |
|---|---|---|
| `pvalueMantissa` | integer, 1-9 | `2` |
| `pvalueExponent` | negative integer | `-28539` |
| `pvalue` | IEEE-754 double | **`0.0`** |

(The same association: `rs1129038-T` in GCST012219.)

An IEEE-754 double cannot represent anything below about `5e-324`, and the Catalog's
strongest associations are far below that — meta-analyses of hundreds of thousands of
people routinely report exponents in the hundreds or thousands. So `pvalue` is a
convenience field that **silently becomes `0.0`** exactly for the associations you most
wanted to find.

The damage is rarely a crash. `0.0 < 5e-8` is `True`, so a significance filter still
passes. What breaks is everything that treats zero as a value: `-log10(pvalue)` raises,
ranking ties every strong hit at the same place, and a "drop rows with no p-value" step
keyed on falsiness throws away the top of the table.

**Reconstruct from the mantissa and exponent, and keep them as the sort key.**

```python
import json, math, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api"


def fetch(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=300) as fh:
        return json.loads(fh.read())


def pkey(assoc):
    """Sortable, printable p-value that survives underflow.

    Returns (exponent, mantissa) -- ascending puts the strongest first, and it
    is exact, because both fields are integers. Never round-trip through the
    `pvalue` double to compare two associations."""
    return (assoc["pvalueExponent"], assoc["pvalueMantissa"])


def neglog10p(assoc):
    """-log10(p) from the integer fields. math.log10(assoc['pvalue']) raises
    ValueError on exactly the rows this exists for."""
    return -(math.log10(assoc["pvalueMantissa"]) + assoc["pvalueExponent"])


rows = fetch("studies/GCST012219/associations")["_embedded"]["associations"]
rows.sort(key=pkey)

underflowed = [a for a in rows if a["pvalue"] == 0.0]
print(f"GCST012219 (eye colour, Simcoe 2021): {len(rows)} associations, "
      f"{len(underflowed)} with pvalue == 0.0")
print(f"{'risk allele':22} {'mantissa':>9} {'exponent':>9} "
      f"{'pvalue (double)':>16} {'-log10(p)':>10}")
for a in rows[:3] + rows[-2:]:
    allele = a["loci"][0]["strongestRiskAlleles"][0]["riskAlleleName"]
    print(f"{allele:22} {a['pvalueMantissa']:>9} {a['pvalueExponent']:>9} "
          f"{a['pvalue']:>16} {neglog10p(a):>10.1f}")

try:
    math.log10(rows[0]["pvalue"])
except ValueError as e:
    print("\nmath.log10(pvalue) on the strongest association:", e)
```

```
GCST012219 (eye colour, Simcoe 2021): 26 associations, 2 with pvalue == 0.0
risk allele             mantissa  exponent  pvalue (double)  -log10(p)
rs1129038-T                    2    -28539              0.0    28538.7
rs4778218-G                    1      -582              0.0      582.0
rs12203592-T                   2      -321       1.996e-321      320.7
rs2351061-A                    4        -8            4e-08        7.4
rs80308281-T                   5        -8            5e-08        7.3

math.log10(pvalue) on the strongest association: math domain error
```

Note the third row. `2e-321` is *representable*, but only as a subnormal double, so
`pvalue` comes back as `1.996e-321` — the nearest double, three significant figures
short. Between roughly `1e-308` and `5e-324` the float is present and lossy rather than
absent, which is worse than zero because nothing about it looks wrong.

**Sorting `/associations` server-side is fragile — sort locally instead.** Two separate
failures, both reproduced on 2026-08-27:

- **`sort=…,desc` on a p-value field returns HTTP 500.** `/associations?sort=pvalue,desc`,
  `sort=pvalueExponent,desc` and `sort=pvalueMantissa,desc` all fail with a server error.
  The same fields ascending are fine, as is `desc` on other fields (`snpType`,
  `standardError`) and on `/studies` and `/efoTraits`.
- **A sorted page can arrive truncated, at HTTP 200.** The last page of `/associations`
  under `sort=pvalueExponent,asc` came back as a `200` with the body cut off mid-record
  and unparseable — three times out of three at `size=100&page=11919`, and twice out of
  twice at `size=1000&page=1191`. The *same* page without `sort` parsed cleanly, 48 rows.
  So the status code is not the check: **`json.loads` raising is the only signal**, and
  a client that swallows it loses the tail of the collection silently.

Sort the rows you have in hand instead — `pkey` above is exact and costs nothing.

**Effect sizes come in two mutually exclusive forms, and both can be null at once.**
`orPerCopyNum` is an odds ratio, for case-control traits; `betaNum` with `betaUnit` and
`betaDirection` is a linear effect, for quantitative traits, and the direction is a word
(`"increase"` / `"decrease"`) rather than a sign, so a beta is unsigned until you read
two fields. `range` is the reported confidence interval as a string, `standardError` the
SE. Never coerce a beta into an OR — and do not assume every row has either: GCST012219
carries a beta on 24 of its 26 associations and neither an OR nor a beta on the other
two, because the paper did not report one.

## Trap 4 — traits are ontology terms, matched exactly, and they are not all EFO

The trait endpoints are named `efoTraits`, and the name is now the smaller half of the
story. Counting the distinct terms in `gwas-efo-trait-mappings.tsv` from the 2026-08-24
release — 20,047 of them, over 110,338 curated trait strings — gives:

| Prefix | Distinct terms | Ontology |
|---|---|---|
| `OBA` | 10,027 | Ontology of Biological Attributes — measurements |
| `EFO` | 9,032 | Experimental Factor Ontology |
| `MONDO` | 491 | Mondo Disease Ontology |
| `HP` | 397 | Human Phenotype Ontology |
| `GO`, `Orphanet`, `PATO`, `NCIT`, `UBERON`, `GSSO`, `MP`, `HANCESTRO` | 100 between them | — |

**Most terms are no longer EFO**, and the `uri` switches namespace with the prefix:
`http://www.ebi.ac.uk/efo/EFO_0003949`,
`http://purl.obolibrary.org/obo/MONDO_0005148`,
`http://www.orpha.net/ORDO/Orphanet_654`. Three namespaces, twelve prefixes. Any code
that recovers an id by stripping `http://www.ebi.ac.uk/efo/` hands back a full URI for
roughly a third of the mappings and every one of the 10,027 `OBA` terms.

The label search is an **exact match on the whole string** — case is ignored, and
nothing else is. Not a prefix, not a substring, no synonyms, no spelling variants, and a
trailing space is fatal. And the two "not found" answers differ: `findByEfoTrait`
returns HTTP 200 with an empty list, `findByShortForm` returns HTTP 404.

```python
import json, urllib.error, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api"


def fetch(path, **params):
    """Returns (status, document). 404 is a real answer here, not a failure."""
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    try:
        with urllib.request.urlopen(url, timeout=300) as fh:
            return fh.status, json.loads(fh.read())
    except urllib.error.HTTPError as e:
        return e.code, None


def resolve_trait(label):
    """Exact trait label -> (shortForm, uri). Raises rather than guessing."""
    status, doc = fetch("efoTraits/search/findByEfoTrait", trait=label)
    hits = doc["_embedded"]["efoTraits"] if doc else []
    if not hits:
        raise LookupError(f"{label!r}: no trait with that exact label "
                          f"(HTTP {status} with an empty list, not an error)")
    if len(hits) > 1:
        raise LookupError(f"{label!r}: {[h['shortForm'] for h in hits]}")
    return hits[0]["shortForm"], hits[0]["uri"]


for label in ("type 2 diabetes",              # a substring is not a match
              "type II diabetes mellitus",    # the wording of the retired EFO term
              "eye colour",                   # British spelling
              "type 2 diabetes mellitus ",    # one trailing space
              "TYPE 2 DIABETES MELLITUS",     # case, and only case, is ignored
              "type 2 diabetes mellitus",
              "body mass index",
              "eye color"):
    try:
        sf, uri = resolve_trait(label)
        print(f"{label!r:29} -> {sf:16} {uri}")
    except LookupError:
        print(f"{label!r:29} -> no match (HTTP 200, empty list)")

# The retired EFO id for type 2 diabetes 404s; the live term is MONDO.
for sf in ("EFO_0001360", "MONDO_0005148", "EFO_0003949"):
    status, doc = fetch("efoTraits/search/findByShortForm", shortForm=sf)
    label = doc["trait"] if doc else "-"
    print(f"shortForm {sf:16} HTTP {status}  {label}")
```

```
'type 2 diabetes'             -> no match (HTTP 200, empty list)
'type II diabetes mellitus'   -> no match (HTTP 200, empty list)
'eye colour'                  -> no match (HTTP 200, empty list)
'type 2 diabetes mellitus '   -> no match (HTTP 200, empty list)
'TYPE 2 DIABETES MELLITUS'    -> MONDO_0005148    http://purl.obolibrary.org/obo/MONDO_0005148
'type 2 diabetes mellitus'    -> MONDO_0005148    http://purl.obolibrary.org/obo/MONDO_0005148
'body mass index'             -> EFO_0004340      http://www.ebi.ac.uk/efo/EFO_0004340
'eye color'                   -> EFO_0003949      http://www.ebi.ac.uk/efo/EFO_0003949
```

```
shortForm EFO_0001360      HTTP 404  -
shortForm MONDO_0005148    HTTP 200  type 2 diabetes mellitus
shortForm EFO_0003949      HTTP 200  eye color
```

`EFO_0001360` — the id every pre-2023 pipeline used for type 2 diabetes — is gone. So:

- **Resolve the label to a short form once, then key on the short form**, and record
  which one you resolved alongside the results. A hardcoded ontology id has a shelf
  life.
- **There is no fuzzy trait search in this API.** When you do not already know the exact
  label, get the vocabulary rather than guessing at it — page `/efoTraits` (24,618
  terms, ~1.3 s per 100-row page) and match locally, or read
  `gwas-efo-trait-mappings.tsv` from the release, below.
- **Do not construct short forms by string-surgery on `uri`.** Read the `shortForm`
  field, which the API supplies for both namespaces.
- The Catalog also keeps a curator-written free-text trait on the *study*
  (`diseaseTrait.trait`, e.g. `"Eye color"`, capitalised) distinct from the ontology
  term on the association (`"eye color"`). They are different fields with different
  vocabularies; the file `gwas-efo-trait-mappings.tsv` in each release maps one to the
  other offline, for all 110,338 curated trait strings.
- `findByDiseaseTrait` searches that free-text study trait, `findByEfoTrait` the
  ontology label. Picking the wrong one is a silent empty result.

## An association is not a result

Everything above is plumbing. This is the part that decides whether the number you
return means anything, and it is why the study record has to travel with the
association rather than being fetched only when someone asks.

**Three facts change the interpretation, and all three are in the study record:**

1. **The Catalog's curation threshold is 1×10⁻⁵, not genome-wide significance.**
   Associations weaker than 5×10⁻⁸ are in the table by design — the weakest association
   in the whole catalogue is exactly `1×10⁻⁵`, and nothing beyond it is curated.
   Filtering at 5×10⁻⁸ is the reader's job, and the Catalog does not do it.
2. **Ancestry of the discovery cohort.** `ancestries` is a list with `type` of
   `"initial"` (discovery) or `"replication"`, each with `numberOfIndividuals`,
   `ancestralGroups` and `countryOfRecruitment`. An effect estimated in Europeans has
   no guaranteed transfer — allele frequency, LD structure and effect size all differ —
   and the great majority of the Catalog is European.
3. **Whether anything replicated.** A study with no `"replication"` ancestry entry and
   `replicationSampleSize` of `NA` reported a discovery result and stopped there.

`projection=associationByStudy` and `projection=associationByEfoTrait` inline the whole
study record — ancestries included — into each association, which turns *N+1* requests
into one:

```python
import json, urllib.parse, urllib.request
from collections import Counter

BASE = "https://www.ebi.ac.uk/gwas/rest/api"
GWAS_SIG = 5e-8


def fetch(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=300) as fh:
        return json.loads(fh.read())


def p_of(a):
    """Exact p-value as a float where representable, else the true magnitude
    as a (mantissa, exponent) pair. Only ever used for a threshold test."""
    return a["pvalueMantissa"] * 10.0 ** a["pvalueExponent"]


def cohort(study, stage):
    """(individuals, ancestral groups) for one stage of a study."""
    entries = [a for a in study["ancestries"] if a["type"] == stage]
    n = sum(a["numberOfIndividuals"] or 0 for a in entries)
    groups = {g["ancestralGroup"] for a in entries for g in a["ancestralGroups"]}
    return n, groups


# One request: every association for the trait, each with its study inlined.
rows = fetch("efoTraits/EFO_0003949/associations",
             projection="associationByEfoTrait")["_embedded"]["associations"]
studies = {a["study"]["accessionId"]: a["study"] for a in rows}
print(f"eye color (EFO_0003949): {len(rows)} associations across "
      f"{len(studies)} studies, in ONE request")

weak = [a for a in rows if p_of(a) > GWAS_SIG]
print(f"weaker than 5e-8       : {len(weak)} of {len(rows)} "
      f"({100 * len(weak) / len(rows):.0f}%) -- curated at p < 1e-5, not 5e-8")

disc = Counter()
for s in studies.values():
    n, groups = cohort(s, "initial")
    for g in groups:
        disc[g] += n
total = sum(disc.values())
print("\ndiscovery individuals by ancestral group")
for g, n in disc.most_common():
    print(f"  {g:24} {n:>9,}  {100 * n / total:5.1f}%")

no_rep = [acc for acc, s in sorted(studies.items()) if not cohort(s, "replication")[0]]
print(f"\nstudies with no replication stage: {len(no_rep)} of {len(studies)}")
print("  " + ", ".join(no_rep))

# The sub-phenotype hides in a free-text field on the ASSOCIATION, not the trait.
descs = Counter(repr(a["pvalueDescription"]) for a in rows)
print("\npvalueDescription, top 6 of "
      f"{len(descs)} distinct values on one ontology trait")
for d, n in descs.most_common(6):
    print(f"  {d:36} {n:>4}")
```

```
eye color (EFO_0003949): 201 associations across 16 studies, in ONE request
weaker than 5e-8       : 41 of 201 (20%) -- curated at p < 1e-5, not 5e-8

discovery individuals by ancestral group
  European                   199,091   98.7%
  East Asian                   2,616    1.3%

studies with no replication stage: 8 of 16
  GCST000710, GCST005093, GCST005094, GCST005095, GCST005096, GCST007489, GCST90026489, GCST90255684

pvalueDescription, top 6 of 13 distinct values on one ontology trait
  None                                  138
  '(EA)'                                 22
  '(Eye color)'                           8
  ' '                                     6
  '(eye color)'                           5
  '(Eye color phototype score)'           5
```

What that output is actually telling you, and what to carry into a write-up:

- **A fifth of the rows are below genome-wide significance.** Report the threshold you
  applied, every time. `p_of()` above is the only safe way to test it, because
  `a["pvalue"]` is 0.0 for the strongest rows.
- **98.7% of the discovery sample is European**, and the entire non-European remainder
  is one East Asian cohort. Any statement of the form "variant X raises risk of Y"
  inherits that, and a polygenic score built on it is known to lose accuracy out of
  ancestry. Where an `ancestralGroup` is `"NR"` it means not reported — treat it as
  missing, not as a category, and do not let it dilute a percentage silently.
- **Eight of sixteen studies have no replication stage.** That is not a defect; it is
  what a discovery paper looks like. It is a defect to report it as though it had one.
- **One ontology trait is several phenotypes.** `pvalueDescription` is free text on the
  association, and thirteen distinct values sit under the single term "eye color" —
  `'(EA)'`, `'(Eye color phototype score)'`, and elsewhere in the same 201 rows
  `'(Blue eye color)'`, `'(Brown eye color)'` and `'(Intermediate/Green eye color)'`,
  which take opposite effect directions at the same locus. It is inconsistently cased
  (`'(Eye color)'` and `'(eye color)'` are both present), `None` on 138 rows, and on six
  rows it is a single space rather than empty. Strip it, read it, and never pool effect
  sizes across distinct values.

Two further study-record fields worth carrying: `fullPvalueSet` (whether full summary
statistics were deposited, which decides if fine-mapping or Mendelian randomisation is
even possible) and `snpCount` with `imputed` (how many variants were tested, which sets
the real multiple-testing burden).

## Variants, mapped genes and genomic context

`/singleNucleotidePolymorphisms/{rsId}` gives the variant's mapped position, cytogenetic
region, functional class and the genes around it. Two things about `genomicContexts` are
easy to get wrong:

- It is mapped **twice**, once from Ensembl and once from NCBI, so every gene appears
  more than once and the two sources disagree on distances. Counting rows counts
  sources.
- **`isClosestGene` is not unique, and it is not the gene the variant is in.** It is
  flagged per source *and* per direction — nearest upstream and nearest downstream both
  get it — so a single variant can have four rows marked closest. The gene the variant
  actually sits inside is the one with `isIntergenic: false`, and it is flagged
  `isClosestGene: false`.

```python
import json, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api"


def fetch(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=300) as fh:
        return json.loads(fh.read())


snp = fetch("singleNucleotidePolymorphisms/rs1129038")
loc = snp["locations"][0]
print(f"{snp['rsId']}  chr{loc['chromosomeName']}:{loc['chromosomePosition']}  "
      f"{loc['region']['name']}  {snp['functionalClass']}  merged={snp['merged']}")

ctx = snp["genomicContexts"]
print(f"\n{len(ctx)} genomicContexts rows, "
      f"{len({c['gene']['geneName'] for c in ctx})} distinct genes, "
      f"sources {sorted({c['source'] for c in ctx})}")
print(f"{'gene':10} {'source':9} {'distance':>9} {'intergenic':>11} "
      f"{'upstream':>9} {'closest':>8}")
for c in sorted(ctx, key=lambda c: (c["gene"]["geneName"], c["source"])):
    print(f"{c['gene']['geneName']:10} {c['source']:9} {c['distance']:>9} "
          f"{str(c['isIntergenic']):>11} {str(c['isUpstream']):>9} "
          f"{str(c['isClosestGene']):>8}")

# Genes the variant is actually inside, deduplicated across the two sources.
inside = sorted({c["gene"]["geneName"] for c in ctx if not c["isIntergenic"]})
closest = sorted({c["gene"]["geneName"] for c in ctx if c["isClosestGene"]})
print(f"\nvariant lies within : {inside}")
print(f"flagged closest     : {closest}")
```

```
rs1129038  chr15:28111713  15q13.1  3_prime_UTR_variant  merged=0

6 genomicContexts rows, 3 distinct genes, sources ['Ensembl', 'NCBI']
gene       source     distance  intergenic  upstream  closest
HERC2      Ensembl           0       False     False    False
HERC2      NCBI              0       False     False    False
OCA2       Ensembl       12049        True      True     True
OCA2       NCBI          12398        True      True     True
RPL41P2    Ensembl      203938        True     False     True
RPL41P2    NCBI         203940        True     False     True
```

```
variant lies within : ['HERC2']
flagged closest     : ['OCA2', 'RPL41P2']
```

That is the textbook eye-colour locus, and every part of the trap is visible in six
rows. The variant is in the 3′ UTR of *HERC2*; the gene it regulates is *OCA2*, about
12 kb upstream; and *RPL41P2* — a ribosomal protein pseudogene 204 kb downstream — is
flagged `isClosestGene` just as *OCA2* is, because each direction gets its own nearest
gene. Ensembl and NCBI put *OCA2* at 12,049 and 12,398 bp respectively, so even the
distance depends on which row you read. Taking `genomicContexts[0]`, or filtering on
`isClosestGene` alone, returns a pseudogene as the answer to "which gene is this?"

Lookups by variant, gene and region all hang off the same resource, and they split
across both collection shapes — which is why the template, not the name, tells you what
you are getting. On `/singleNucleotidePolymorphisms/search`, `findByRsId`,
`findByBpLocation`, `findByEfoTrait` and `findByDiseaseTrait` are **unpaged** and return
the whole result set; `findByGene`, `findByChromBpLocationRange`,
`findIdsByLocations…` and `findByPubmedId` are **paged** and default to 20.

And the two "not found" answers differ again: an rsID the Catalog does not hold gives
HTTP 200 with an empty list from `associations/search/findByRsId?rsId=…`, but **404**
from `/singleNucleotidePolymorphisms/{rsId}`. Same fact, two signals, and only one of
them raises.

## Not every association is one variant

`loci[0]["strongestRiskAlleles"][0]` is the obvious way to read a risk allele, and it is
right for almost every row and silently wrong for two whole classes of them. They are
rare — of 1,000 consecutive `/associations` rows sampled on 2026-08-27, 999 were single
variants and one was a 3-SNP haplotype — which is exactly why nobody writes the code
that handles them, and why the error survives review. The Catalog records three forms,
distinguished by two booleans on the association:

| Form | `multiSnpHaplotype` | `snpInteraction` | Shape |
|---|---|---|---|
| Single variant | `false` | `false` | one locus, one risk allele |
| Haplotype | **`true`** | `false` | **one locus, *N* risk alleles**, `haplotypeSnpCount` = *N* |
| SNP × SNP interaction | `false` | **`true`** | ***N* loci**, one risk allele each |

So the two failure modes point in opposite directions: the haplotype hides its extra
variants *inside* `loci[0]`, and the interaction hides them in the loci you never
looked at. Both come back as a perfectly ordinary association row.

```python
import json, textwrap, urllib.parse, urllib.request
from collections import Counter

BASE = "https://www.ebi.ac.uk/gwas/rest/api"


def fetch(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=300) as fh:
        return json.loads(fh.read())


def risk_alleles(assoc):
    """Every risk allele in an association, flattened across loci, in order."""
    return [a["riskAlleleName"] for locus in assoc["loci"]
            for a in locus["strongestRiskAlleles"]]


def form(assoc):
    if assoc["snpInteraction"]:
        return "interaction"
    return "haplotype" if assoc["multiSnpHaplotype"] else "single"


for acc in ("GCST012219", "GCST000071", "GCST006494"):
    rows = fetch(f"studies/{acc}/associations")["_embedded"]["associations"]
    counts = Counter(form(r) for r in rows)
    # Ties broken on the allele list itself, so this picks the same row every
    # run -- the API does not promise an order and max() keeps the first max.
    widest = max(rows, key=lambda r: (len(risk_alleles(r)), risk_alleles(r)))
    alleles = risk_alleles(widest)
    locus = widest["loci"][0]
    print(f"{acc}: {len(rows)} associations {dict(counts)}")
    print(f"  widest row      : {len(widest['loci'])} loci, {len(alleles)} risk "
          f"alleles, description {locus['description']!r}, "
          f"haplotypeSnpCount {locus['haplotypeSnpCount']}")
    print(f"  the naive read  : {alleles[0]}")
    print("  what is there   :")
    print(textwrap.fill(", ".join(alleles), width=70,
                        initial_indent="    ", subsequent_indent="    "))
```

```
GCST012219: 26 associations {'single': 26}
  widest row      : 1 loci, 1 risk alleles, description 'Single variant', haplotypeSnpCount None
  the naive read  : rs9971729-C
  what is there   :
    rs9971729-C
GCST000071: 3 associations {'haplotype': 2, 'single': 1}
  widest row      : 1 loci, 16 risk alleles, description '17 marker haplotype-1', haplotypeSnpCount 16
  the naive read  : rs11209003-?
  what is there   :
    rs11209003-?, rs11209002-?, rs2064689-?, rs1004819-?, rs2902440-?,
    rs11465802-?, rs2201841-?, rs11465804-?, rs11209026-?,
    rs1343151-?, rs10889676-?, rs10889677-?, rs9988642-?,
    rs12567232-?, rs6669582-?, rs10789230-?
GCST006494: 7 associations {'interaction': 7}
  widest row      : 2 loci, 2 risk alleles, description 'SNP x SNP interaction', haplotypeSnpCount None
  the naive read  : rs10830963-G
  what is there   :
    rs10830963-G, rs73659517-G
```

Reporting `rs11209003-?` as *the* variant for that row turns a 16-marker haplotype into
a single-SNP claim, and reporting `rs10830963-G` alone turns an interaction into a main
effect. Three further details visible in that output:

- **`-?` means the risk allele was not reported.** The suffix on `riskAlleleName` is
  the allele, and `?` is a real value in the data — do not parse it as a base.
- **`description` and `haplotypeSnpCount` can disagree.** That row is labelled
  `'17 marker haplotype-1'` and carries 16 alleles with `haplotypeSnpCount: 16`. Trust
  the array you can count, not the curator's free-text label.
- **`authorReportedGenes` lives on the locus, not the association**, so an interaction
  has one gene list per locus. Flatten across loci, as `risk_alleles` does above.

## Get the files

Everything above prints. This writes, because a target dossier, a figure or a
meta-analysis needs files — and because the catalogue grows every fortnight, so a
directory of TSVs with no release stamp cannot be compared against a later pull.

**Route A — the REST API, for one trait.** One request for the associations with the
study record inlined, then flatten to two TSVs plus a manifest recording what was
resolved and when.

```python
import csv, datetime, json, os, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api"
TRAIT_LABEL = "eye color"
OUT = "Data/gwas-catalog"
GWAS_SIG = 5e-8


def fetch(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=300) as fh:
        return url, json.loads(fh.read())


def write_tsv(path, rows, cols):
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, delimiter="\t",
                           extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return {"path": path, "rows": len(rows), "bytes": os.path.getsize(path)}


os.makedirs(OUT, exist_ok=True)
sources, files = {}, []

# 1. Exact label -> ontology short form. Never hardcode the id.
url, doc = fetch("efoTraits/search/findByEfoTrait", trait=TRAIT_LABEL)
hits = doc["_embedded"]["efoTraits"]
if len(hits) != 1:
    raise LookupError(f"{TRAIT_LABEL!r}: {[h['shortForm'] for h in hits]}")
trait = hits[0]
sources["trait"] = url
print("resolved:", trait["shortForm"], "|", trait["uri"])

# 2. One request for every association, study record inlined.
url, doc = fetch(f"efoTraits/{trait['shortForm']}/associations",
                 projection="associationByEfoTrait")
assocs = doc["_embedded"]["associations"]
sources["associations"] = url

# 3. Associations, flat. Mantissa and exponent are the p-value of record; the
#    double is carried too, so a reader can see where it underflowed.
arows = []
for a in assocs:
    # Flatten across every locus: a haplotype is one locus with N alleles, an
    # interaction is N loci with one each, and taking loci[0][0] loses both.
    alleles = [al["riskAlleleName"] for L in a["loci"]
               for al in L["strongestRiskAlleles"]]
    genes = sorted({g["geneName"] for L in a["loci"]
                    for g in L["authorReportedGenes"]})
    p = a["pvalueMantissa"] * 10.0 ** a["pvalueExponent"]
    arows.append({
        "studyAccession": a["study"]["accessionId"],
        "associationForm": ("interaction" if a["snpInteraction"] else
                            "haplotype" if a["multiSnpHaplotype"] else "single"),
        "lociCount": len(a["loci"]),
        "riskAlleleCount": len(alleles),
        "riskAlleles": ";".join(alleles),
        "riskFrequency": a["riskFrequency"],
        "authorReportedGenes": ",".join(genes),
        "pvalueMantissa": a["pvalueMantissa"],
        "pvalueExponent": a["pvalueExponent"],
        "pvalueDouble": a["pvalue"],
        "genomeWideSignificant": p <= GWAS_SIG,
        "pvalueDescription": (a["pvalueDescription"] or "").strip(),
        "orPerCopyNum": a["orPerCopyNum"],
        "betaNum": a["betaNum"],
        "betaUnit": a["betaUnit"],
        "betaDirection": a["betaDirection"],
        "standardError": a["standardError"],
        "range": a["range"],
        "snpType": a["snpType"],
    })
arows.sort(key=lambda r: (r["pvalueExponent"], r["pvalueMantissa"]))
files.append(write_tsv(f"{OUT}/{trait['shortForm']}_associations.tsv", arows,
                       list(arows[0])))

# 4. Studies, one row each, with the cohort that decides interpretation.
srows = []
for acc, s in sorted({a["study"]["accessionId"]: a["study"]
                      for a in assocs}.items()):
    stage = {}
    for st in ("initial", "replication"):
        e = [x for x in s["ancestries"] if x["type"] == st]
        stage[st] = (sum(x["numberOfIndividuals"] or 0 for x in e),
                     sorted({g["ancestralGroup"] for x in e
                             for g in x["ancestralGroups"]}))
    srows.append({
        "studyAccession": acc,
        "pubmedId": s["publicationInfo"]["pubmedId"],
        "firstAuthor": s["publicationInfo"]["author"]["fullname"],
        "publicationDate": s["publicationInfo"]["publicationDate"],
        "journal": s["publicationInfo"]["publication"],
        "diseaseTrait": s["diseaseTrait"]["trait"],
        "discoveryN": stage["initial"][0],
        "discoveryAncestry": "|".join(stage["initial"][1]),
        "replicationN": stage["replication"][0],
        "replicationAncestry": "|".join(stage["replication"][1]),
        "initialSampleSize": s["initialSampleSize"],
        "replicationSampleSize": s["replicationSampleSize"],
        "snpCount": s["snpCount"],
        "imputed": s["imputed"],
        "fullPvalueSet": s["fullPvalueSet"],
        "genotypingTechnology": "|".join(
            t["genotypingTechnology"] for t in s["genotypingTechnologies"]),
    })
files.append(write_tsv(f"{OUT}/{trait['shortForm']}_studies.tsv", srows,
                       list(srows[0])))

# 5. The manifest. Without it these numbers cannot be compared to a later pull.
_, root = fetch("studies", size=1)
manifest = {
    "retrieved": datetime.date.today().isoformat(),
    "traitLabel": TRAIT_LABEL,
    "traitShortForm": trait["shortForm"],
    "traitUri": trait["uri"],
    "catalogueStudiesTotal": root["page"]["totalElements"],
    "significanceThreshold": GWAS_SIG,
    "associationsRetrieved": len(arows),
    "associationsAtThreshold": sum(r["genomeWideSignificant"] for r in arows),
    "studiesRetrieved": len(srows),
    "sources": sources,
    "files": files,
}
with open(f"{OUT}/manifest.json", "w") as fh:
    json.dump(manifest, fh, indent=2)

for f in files:
    print(f"{f['path']:52} {f['rows']:>4} rows  {f['bytes']:>7,} bytes")
print(f"{OUT + '/manifest.json':52} "
      f"{manifest['associationsAtThreshold']} of "
      f"{manifest['associationsRetrieved']} at p <= 5e-8")
```

```
resolved: EFO_0003949 | http://www.ebi.ac.uk/efo/EFO_0003949
Data/gwas-catalog/EFO_0003949_associations.tsv        201 rows   24,094 bytes
Data/gwas-catalog/EFO_0003949_studies.tsv              16 rows    3,492 bytes
Data/gwas-catalog/manifest.json                      160 of 201 at p <= 5e-8
```

**Route B — the release files, for anything catalogue-wide.** At roughly half a second
per study record the REST API cannot answer questions about all 229,952 studies. Each
fortnightly release publishes the whole catalogue as flat files over anonymous HTTPS at
`https://ftp.ebi.ac.uk/pub/databases/gwas/releases/latest/`:

| File | Size | What it carries |
|---|---|---|
| `gwas-catalog-download-studies-v1.0.3.1.txt` | 123 MB | every study, with `STUDY ACCESSION`, `MAPPED_TRAIT_URI`, `COHORT`, `FULL SUMMARY STATISTICS`, `SUMMARY STATS LOCATION` |
| `gwas-catalog-ancestry.tsv` | 49 MB | one row per study **per ancestry stage** — the cohort table |
| `gwas-catalog-associations_ontology-annotated-full.zip` | 70 MB | every association, ontology-annotated |
| `gwas-efo-trait-mappings.tsv` | 19 MB | free-text study trait → ontology term and parent |

Stream it rather than loading it, and join on the accessions Route A already collected.
This block downloads about 49 MB and takes a few minutes on a slow link:

```python
import csv, io, json, os, urllib.request
from collections import Counter

FTP = "https://ftp.ebi.ac.uk/pub/databases/gwas/releases/latest"
OUT = "Data/gwas-catalog"

wanted = {r["studyAccession"] for r in
          csv.DictReader(open(f"{OUT}/EFO_0003949_studies.tsv"), delimiter="\t")}
print(f"{len(wanted)} accessions from Route A")

# The header is misspelled upstream -- NUMBER OF INDIVDUALS, ADDITONAL ANCESTRY
# DESCRIPTION. Read the header row; never hand-type these names.
url = f"{FTP}/gwas-catalog-ancestry.tsv"
rows, seen, stages = [], 0, Counter()
with urllib.request.urlopen(url, timeout=600) as fh:
    reader = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8"), delimiter="\t")
    header = reader.fieldnames
    for rec in reader:
        seen += 1
        stages[rec["STAGE"]] += 1
        if rec["STUDY ACCESSION"] in wanted:
            rows.append(rec)

print(f"streamed {seen:,} ancestry rows for the whole catalogue")
print(f"stages: {dict(stages.most_common())}")
print(f"kept {len(rows)} rows for {len({r['STUDY ACCESSION'] for r in rows})} studies")

with open(f"{OUT}/EFO_0003949_ancestry.tsv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=header, delimiter="\t")
    w.writeheader()
    w.writerows(sorted(rows, key=lambda r: (r["STUDY ACCESSION"], r["STAGE"])))

with open(f"{OUT}/manifest.json") as fh:
    manifest = json.load(fh)
manifest["bulkRelease"] = {"url": url, "ancestryRowsInRelease": seen,
                           "ancestryRowsKept": len(rows), "columns": header}
with open(f"{OUT}/manifest.json", "w") as fh:
    json.dump(manifest, fh, indent=2)

path = f"{OUT}/EFO_0003949_ancestry.tsv"
print(f"{path:52} {len(rows):>4} rows  {os.path.getsize(path):>7,} bytes")
```

```
16 accessions from Route A
streamed 298,269 ancestry rows for the whole catalogue
stages: {'initial': 260878, 'replication': 37391}
kept 26 rows for 16 studies
Data/gwas-catalog/EFO_0003949_ancestry.tsv             26 rows    4,452 bytes
```

That output settles something the per-trait view only hints at. Across all 229,952
studies the release carries **260,878 `initial` rows and 37,391 `replication` rows** —
and since a study with a replication stage contributes at least one row, **at most one
study in six replicated anything at all**. The eight-of-sixteen seen above for eye
colour is the ordinary case, not an unlucky draw, and "was it replicated?" is a question
worth asking of every association you plan to report.

**Full summary statistics, when a study deposited them.** Studies with
`fullPvalueSet: true` have a directory under
`https://ftp.ebi.ac.uk/pub/databases/gwas/summary_statistics/`, bucketed a thousand
accessions at a time — `GCST012001-GCST013000/GCST012219/`. Do not build the filename
from the accession: submissions since the GWAS-SSF standard are `{ACCESSION}.tsv.gz`
with a `-meta.yaml` beside them, but legacy studies are not
(`GCST000028/Saxena-17463246.txt`, and `GCST000510` holds fifteen separate `.assoc.gz`
files, one per blood trait). **List the directory, read the `-meta.yaml` for the genome
assembly and imputation panel, and check `md5sum.txt`.** A study with
`fullPvalueSet: false` has no directory at all, and the URL 404s.

## Try it

A self-contained check that this skill still holds. Public data, no account, no key,
Python standard library only — no `pip install` step, and nothing written to disk.

**Data** — the GWAS Catalog REST API, reached through nine endpoints:

    https://www.ebi.ac.uk/gwas/rest/api/studies?size=1
    https://www.ebi.ac.uk/gwas/rest/api/studies/search/findByAccessionId?accessionId=GCST012219
    https://www.ebi.ac.uk/gwas/rest/api/studies/GCST012219/associations
    https://www.ebi.ac.uk/gwas/rest/api/studies/GCST000071/associations
    https://www.ebi.ac.uk/gwas/rest/api/studies/GCST006494/associations
    https://www.ebi.ac.uk/gwas/rest/api/studies/search/findByEfoTrait?efoTrait=eye%20color&size=5
    https://www.ebi.ac.uk/gwas/rest/api/efoTraits/search/findByEfoTrait?trait=type%202%20diabetes%20mellitus
    https://www.ebi.ac.uk/gwas/rest/api/efoTraits/search/findByShortForm?shortForm=EFO_0001360
    https://www.ebi.ac.uk/gwas/rest/api/efoTraits/EFO_0003949/associations?projection=associationByEfoTrait

The Catalog is open EMBL-EBI infrastructure; no account or licence acceptance is needed
to read it. Each probe is chosen for a trap rather than for being typical.
**GCST012219** (Simcoe *et al.* 2021, PMID 33692100, eye colour in 192,986 people)
exercises three at once: it is reached through an *unpaged* sub-resource, its strongest
association is `2×10⁻²⁸⁵³⁹` and therefore underflows the `pvalue` double to `0.0`, and
it has no replication stage. `EFO_0003949` and `MONDO_0005148` probe the trait
vocabulary, `EFO_0001360` is the retired id that now 404s, and **GCST000071** (a
16-marker haplotype) and **GCST006494** (SNP × SNP interactions) are the two
association shapes that are not one variant. Last confirmed reachable 2026-08-27.

Budget about **two minutes**. Most calls answer in a second or two; the last one — every
association for a trait, with the study record inlined — took roughly 70 seconds, which
is the price of the one request that replaces seventeen.

**Run** — this block asserts the *shape* of the API, not only its values, so a renamed
field or restructured pagination fails it loudly:

```python
import json, math, urllib.error, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api"
GWAS_SIG = 5e-8
DOUBLE_FLOOR = -324           # below this an IEEE-754 double is exactly 0.0


def fetch(url):
    """Returns (status, document). 404 is an answer here, not a failure."""
    try:
        with urllib.request.urlopen(url, timeout=300) as fh:
            return fh.status, json.loads(fh.read())
    except urllib.error.HTTPError as e:
        return e.code, None


def get(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    return fetch(url)


# 1. SHAPE: a paged collection is _embedded + _links + page, and nothing else.
status, doc = get("studies", size=1)
assert status == 200, status
assert sorted(doc) == ["_embedded", "_links", "page"], sorted(doc)
assert list(doc["_embedded"]) == ["studies"], list(doc["_embedded"])
assert sorted(doc["page"]) == ["number", "size", "totalElements", "totalPages"], \
    sorted(doc["page"])
assert doc["page"]["size"] == 1 and doc["page"]["number"] == 0, doc["page"]
assert "next" in doc["_links"], sorted(doc["_links"])
n_studies = doc["page"]["totalElements"]
print(f"1 paged shape      : _embedded.studies + page, {n_studies:,} studies")

# 2. SHAPE: findByAccessionId is a SINGLE resource -- no _embedded at all.
status, doc = get("studies/search/findByAccessionId", accessionId="GCST012219")
assert status == 200 and "_embedded" not in doc, sorted(doc)
assert doc["accessionId"] == "GCST012219", doc["accessionId"]
assert doc["fullPvalueSet"] is False and doc["imputed"] is True
print(f"2 single resource  : GCST012219, {doc['snpCount']:,} variants tested, "
      f"fullPvalueSet={doc['fullPvalueSet']}")

# 3. SHAPE: a sub-resource is UNPAGED -- no `page` key, and `size` is ignored.
status, one = get("studies/GCST012219/associations", size=1)
status2, all_ = get("studies/GCST012219/associations")
assert status == status2 == 200
assert "page" not in one and "page" not in all_, "sub-resource grew a page key"
rows = all_["_embedded"]["associations"]
assert len(one["_embedded"]["associations"]) == len(rows), "size is now honoured"
print(f"3 unpaged shape    : size=1 returned all {len(rows)} associations")

# 4. INVARIANT: mantissa x 10^exponent is the p-value of record, and the
#    `pvalue` double is exactly 0.0 for everything below the double floor.
for a in rows:
    assert 1 <= a["pvalueMantissa"] <= 9, a["pvalueMantissa"]
    assert a["pvalueExponent"] < 0, a["pvalueExponent"]
    if a["pvalueExponent"] <= DOUBLE_FLOOR:
        assert a["pvalue"] == 0.0, (a["pvalueMantissa"], a["pvalueExponent"])
    else:
        assert math.isclose(a["pvalue"],
                            a["pvalueMantissa"] * 10.0 ** a["pvalueExponent"],
                            rel_tol=1e-9), a["pvalue"]
best = min(rows, key=lambda a: (a["pvalueExponent"], a["pvalueMantissa"]))
under = [a for a in rows if a["pvalue"] == 0.0]
assert best["pvalue"] == 0.0 and best in under
print(f"4 p-value underflow: strongest {best['pvalueMantissa']}e"
      f"{best['pvalueExponent']} -> pvalue {best['pvalue']}, "
      f"{len(under)} of {len(rows)} underflowed")

# 5. INVARIANT: paging is driven by _links.next, and the walk is exhaustive.
status, doc = get("studies/search/findByEfoTrait", efoTrait="eye color", size=5)
total, seen, pages = doc["page"]["totalElements"], [], 0
while True:
    pages += 1
    seen += doc["_embedded"]["studies"]
    if "next" not in doc["_links"]:
        break
    status, doc = fetch(doc["_links"]["next"]["href"])
    assert status == 200, status
assert len(seen) == total, f"collected {len(seen)} of {total}"
assert pages == math.ceil(total / 5), pages
print(f"5 next-link paging : {pages} pages of 5 -> {len(seen)} of {total} studies")

# 6. INVARIANT: the trait label search is exact, and the two misses differ.
status, doc = get("efoTraits/search/findByEfoTrait", trait="type 2 diabetes")
assert status == 200 and doc["_embedded"]["efoTraits"] == [], "prefix match now?"
status, doc = get("efoTraits/search/findByEfoTrait",
                  trait="type 2 diabetes mellitus")
hit = doc["_embedded"]["efoTraits"][0]
assert hit["shortForm"] == "MONDO_0005148", hit["shortForm"]
assert hit["uri"].endswith("MONDO_0005148") and "purl.obolibrary.org" in hit["uri"]
retired, _ = get("efoTraits/search/findByShortForm", shortForm="EFO_0001360")
live, _ = get("efoTraits/search/findByShortForm", shortForm="EFO_0003949")
assert (retired, live) == (404, 200), (retired, live)
print(f"6 trait vocabulary : 'type 2 diabetes' -> 0 hits; exact label -> "
      f"{hit['shortForm']}; EFO_0001360 -> HTTP {retired}")

# 7. INVARIANT: the projection inlines the study, so ancestry travels with the
#    association -- and the Catalog curates below genome-wide significance.
status, doc = get("efoTraits/EFO_0003949/associations",
                  projection="associationByEfoTrait")
assoc = doc["_embedded"]["associations"]
assert all("study" in a and "ancestries" in a["study"] for a in assoc)
studies = {a["study"]["accessionId"]: a["study"] for a in assoc}
weak = [a for a in assoc
        if a["pvalueMantissa"] * 10.0 ** a["pvalueExponent"] > GWAS_SIG]
assert weak, "no sub-threshold associations -- curation threshold changed?"
euro = sum(x["numberOfIndividuals"] or 0
           for s in studies.values() for x in s["ancestries"]
           if x["type"] == "initial"
           and any(g["ancestralGroup"] == "European" for g in x["ancestralGroups"]))
disc = sum(x["numberOfIndividuals"] or 0
           for s in studies.values() for x in s["ancestries"]
           if x["type"] == "initial")
print(f"7 study context    : {len(assoc)} associations / {len(studies)} studies, "
      f"{len(weak)} weaker than 5e-8, {100 * euro / disc:.0f}% European discovery")

# 8. INVARIANT: an association is not always one variant, and the two
#    multi-variant forms hide their extra alleles in different places.
status, doc = get("studies/GCST000071/associations")
hap = [a for a in doc["_embedded"]["associations"] if a["multiSnpHaplotype"]]
assert hap, "GCST000071 no longer carries a haplotype association"
wide = max(hap, key=lambda a: len(a["loci"][0]["strongestRiskAlleles"]))
n_alleles = len(wide["loci"][0]["strongestRiskAlleles"])
assert len(wide["loci"]) == 1 and n_alleles > 1, (len(wide["loci"]), n_alleles)
assert wide["loci"][0]["haplotypeSnpCount"] == n_alleles, wide["loci"][0]
status, doc = get("studies/GCST006494/associations")
inter = [a for a in doc["_embedded"]["associations"] if a["snpInteraction"]]
assert inter, "GCST006494 no longer carries an interaction association"
assert all(len(a["loci"]) > 1 for a in inter), "interaction is no longer multi-locus"
assert all(len(L["strongestRiskAlleles"]) == 1
           for a in inter for L in a["loci"]), "interaction locus grew alleles"
print(f"8 multi-variant    : haplotype = 1 locus x {n_alleles} alleles; "
      f"interaction = {len(inter[0]['loci'])} loci x 1 allele")
```

**Expect** — two kinds of line, and they fail for different reasons.

**Invariants.** These hold whatever the release, so a failure means the skill is
*wrong*, not stale: three response shapes distinguished by the presence of `page` and
`_embedded`; `page` carrying exactly `number`, `size`, `totalElements`, `totalPages`;
`size` ignored on a sub-resource; `pvalueMantissa` in 1–9 with a negative exponent;
`pvalue` exactly `0.0` at or below exponent −324 and matching the reconstruction above
it; a `_links.next` walk collecting exactly `totalElements`; exact-match trait labels;
HTTP 404 from `findByShortForm` versus HTTP 200 with an empty list from
`findByEfoTrait`; `EFO_0001360` retired and type 2 diabetes living at
`MONDO_0005148`; every `associationByEfoTrait` row carrying an inlined `study` with
`ancestries`; at least one association weaker than 5×10⁻⁸; and a haplotype association
being one locus with many risk alleles while an interaction is many loci with one each.

**Observed values, 2026-08-27.** These move as the Catalog grows — a mismatch is drift
to investigate, not a bug. Study and association counts rise every fortnight; the eye
colour trait had 201 associations across 16 studies; GCST012219 had 26 associations,
2 of them underflowed; the widest haplotype in GCST000071 carried 16 risk alleles.

```
1 paged shape      : _embedded.studies + page, 229,952 studies
2 single resource  : GCST012219, 11,532,091 variants tested, fullPvalueSet=False
3 unpaged shape    : size=1 returned all 26 associations
4 p-value underflow: strongest 2e-28539 -> pvalue 0.0, 2 of 26 underflowed
5 next-link paging : 4 pages of 5 -> 16 of 16 studies
6 trait vocabulary : 'type 2 diabetes' -> 0 hits; exact label -> MONDO_0005148; EFO_0001360 -> HTTP 404
7 study context    : 201 associations / 16 studies, 41 weaker than 5e-8, 99% European discovery
8 multi-variant    : haplotype = 1 locus x 16 alleles; interaction = 2 loci x 1 allele
```

## Limits worth stating in a write-up

- **The Catalog records what was published, not what is true.** It is a curated
  literature index. An association appears because a paper reported it at 1×10⁻⁵ or
  stronger, not because anyone re-analysed the data.
- **It is overwhelmingly European.** Say so with a number from the study records you
  actually retrieved, not as a generic caveat.
- **Curated associations are the reported lead variant, not a fine-mapped causal one.**
  The risk allele is in linkage disequilibrium with whatever is causal, and
  `authorReportedGenes` and `genomicContexts` are proximity, not mechanism.
- **Effect sizes are not comparable across studies without care** — different
  covariates, different phenotype definitions, different reference alleles, and
  `pvalueDescription` sub-phenotypes pooled under one ontology term.
- **Sample sizes overlap.** Many studies draw on the same biobanks, so summing
  `numberOfIndividuals` across studies of a trait counts people more than once. The
  99% figure above is a composition estimate, not a headcount.
- **State the release.** A new release lands roughly every fortnight and the totals move
  with it — 229,952 studies and 1,191,948 associations on 2026-08-27, against a release
  dated 2026-08-24. Any count you report is a dated observation, not a constant, which
  is what the manifest in *Get the files* exists to record.

## Sources

- GWAS Catalog — https://www.ebi.ac.uk/gwas/
- REST API root, self-describing — https://www.ebi.ac.uk/gwas/rest/api/
- API documentation — https://www.ebi.ac.uk/gwas/rest/docs/api
- Release files over HTTPS — https://ftp.ebi.ac.uk/pub/databases/gwas/releases/latest/
- Summary statistics, and the per-study Usage License column — https://www.ebi.ac.uk/gwas/downloads/summary-statistics
- EMBL-EBI Terms of Use — https://www.ebi.ac.uk/about/terms-of-use
- Hindorff *et al.* (2009) *PNAS* 106, 9362-9367 — https://doi.org/10.1073/pnas.0903103106
- Welter *et al.* (2014) *Nucleic Acids Res* 42, D1001-D1006 — https://doi.org/10.1093/nar/gkt1229
- Buniello *et al.* (2019) *Nucleic Acids Res* 47, D1005-D1012 — https://doi.org/10.1093/nar/gky1120
- Sollis *et al.* (2023) *Nucleic Acids Res* 51, D977-D985 — https://doi.org/10.1093/nar/gkac1010
- Cerezo *et al.* (2025) *Nucleic Acids Res* 53, D998-D1005 — https://doi.org/10.1093/nar/gkae1070

The GWAS Catalog is a collaboration between the National Human Genome Research
Institute and EMBL-EBI. Cite Cerezo *et al.* (2025) for the resource, and cite the
original study behind any association you report — the PubMed id travels with every
study record for exactly that reason.
