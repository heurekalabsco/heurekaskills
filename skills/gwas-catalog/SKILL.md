---
name: gwas-catalog
description: Retrieve variant-trait associations from the NHGRI-EBI GWAS Catalog REST API v2 — by trait, accession, variant or gene — with the cohort ancestry and effect estimates that decide whether one transfers. v1 is retired; v2 fails silently at HTTP 200.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.1.0
tags: [gwas, human-genetics, epidemiology, cohort, public-data]
covers: [gwas, genome-wide association study, snp, rsid, variant, risk allele, trait association, efo, mondo, oba, ontology, p-value, odds ratio, effect size, beta, ancestry, european ancestry, east asian ancestry, african ancestry, summary statistics, type 2 diabetes, coronary artery disease, schizophrenia, body mass index, height, eye color, replication, gcst accession, nhgri, human genetics]
papers: [PMID:19474294, PMID:24316577, PMID:30445434, PMID:36350656, PMID:39530240, PMID:33692100]
access: [open]
datasets: [https://www.ebi.ac.uk/gwas/rest/api/v2/metadata, https://www.ebi.ac.uk/gwas/rest/api/v2/studies?size=1, https://www.ebi.ac.uk/gwas/rest/api/v2/studies/GCST012219, https://www.ebi.ac.uk/gwas/rest/api/v2/studies/GCST012219/ancestries, https://www.ebi.ac.uk/gwas/rest/api/v2/associations?accession_id=GCST012219&size=100, https://www.ebi.ac.uk/gwas/rest/api/v2/associations/6036/loci, https://www.ebi.ac.uk/gwas/rest/api/v2/associations/35123593/loci, https://www.ebi.ac.uk/gwas/rest/api/v2/efo-traits?efo_trait=eye%20color&size=20, https://www.ebi.ac.uk/gwas/rest/api/v2/efo-traits/EFO_0003949, https://www.ebi.ac.uk/gwas/rest/api/v2/single-nucleotide-polymorphisms/rs10830963, https://www.ebi.ac.uk/gwas/rest/api/v2/single-nucleotide-polymorphisms/rs10830963/genomic-contexts, https://ftp.ebi.ac.uk/pub/databases/gwas/releases/latest/gwas-catalog-ancestry.tsv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-07
  against: GWAS Catalog REST API v2.0 at https://www.ebi.ac.uk/gwas/rest/api/v2 (data release 2026-10-03, EFO v3.94.0, Ensembl 116, dbSNP 156; 231,865 studies / 1,198,394 associations / 23,541 trait terms) / FTP release read 2026-10-07 / Python 3.11 standard library only, no third-party packages / curl 8.5.0
  executed: 13
  unverified: 0
---

# GWAS Catalog — variant-trait associations with study context

The NHGRI-EBI GWAS Catalog is the curated record of what published genome-wide
association studies actually reported: on the 2026-10-03 release, **231,865 studies**
and **1,198,394 variant-trait associations**, each carrying the paper it came from, the
cohort it was measured in, and the ontology term a curator assigned to the trait.

This skill is about getting associations out of the REST API and onto disk **with the
study record attached**, because an association without its cohort is not a result. It
is a number estimated in some particular set of people, at a threshold the Catalog sets
lower than genome-wide significance, and both of those facts live in the study record
rather than in the association.

**Nothing here needs an account, a key or a click-through.** The REST API and the
release files are open over HTTPS. EMBL-EBI's Terms of Use state that it "places no
additional restrictions on the use or redistribution of the data available via its Data
Resources and Tools other than those provided by the original data owners", and the
Catalog's own summary-statistics page says "The majority of data are made available
either through 'CC0' or 'EMBL-EBI's standard terms of use' with a small number of
exceptions" — those exceptions are per-study, flagged as a Usage License on the download
tables, and matter when you redistribute a study's summary statistics rather than when
you query the catalogue. Cite the Catalog papers under *Sources*.

## Start here — v1 is gone, and the base path moved

**The v1 REST API was retired in August 2026. v2 is the only supported version.** Every
v1 path now answers **HTTP 410 Gone** with a plain-text pointer — not a 404, and not a
redirect, so a client that only branches on 404 will treat it as an unexpected failure
and a client that follows redirects will not be rescued.

```bash
# The v1 base path answers 410 Gone -- a deliberate retirement, not an outage.
curl -s -o /dev/null -w "v1 /studies      HTTP %{http_code}\n" \
  "https://www.ebi.ac.uk/gwas/rest/api/studies?size=1"
curl -s "https://www.ebi.ac.uk/gwas/rest/api/studies?size=1"
echo
curl -s -o /dev/null -w "v2 /v2/studies   HTTP %{http_code}\n" \
  "https://www.ebi.ac.uk/gwas/rest/api/v2/studies?size=1"
```

```
v1 /studies      HTTP 410
This legacy GWAS Catalog REST API is no longer available.
For general programmatic access, see: https://www.ebi.ac.uk/gwas/docs/programmatic-access/
For V2 migration, see: https://www.ebi.ac.uk/gwas/docs/news/rest-api-v2-migration-guide

v2 /v2/studies   HTTP 200
```

If you are porting code written against v1, these are the changes that break it:

| Area | v1 (retired, 410) | v2 |
|---|---|---|
| Base path | `/gwas/rest/api/…` | `/gwas/rest/api/v2/…` |
| Field names | camelCase — `accessionId`, `diseaseTrait` | snake_case — `accession_id`, `disease_trait` |
| Query model | `/studies/search/findByEfoTrait?efoTrait=…` | filters on the resource — `/studies?efo_trait=…` |
| A study's associations | `/studies/{acc}/associations` | **gone** — use `/associations?accession_id={acc}` |
| Study record on an association | a `projection` parameter | inlined on every association row by default |
| Variants | `/singleNucleotidePolymorphisms` | `/single-nucleotide-polymorphisms` |
| Trait id field | `shortForm` | `efo_id` |
| Effect size | `betaNum` + `betaUnit` + `betaDirection` | one `beta` string — `"0.385 unit decrease"` |
| Confidence interval | `range` string only | `range` string **plus** `ci_lower` / `ci_upper` numbers |
| Gene annotation | the extended Ensembl + RefSeq set | the narrow set, unless `extended_geneset=true` |
| Page size cap | 1000 | 2000 |
| Trait label search | exact match | **substring** on `/efo-traits`, still exact on `/studies` |

The last two rows are the ones that change results rather than raising errors. A
gene-based query that returned 945 associations under v1 returns 921 under v2 unless you
ask for `extended_geneset=true`, because v2 defaults to the narrow mapped-gene set and
v1 behaved like the extended one.

The whole endpoint surface, and the parameters each one accepts, is published as an
OpenAPI document at `https://www.ebi.ac.uk/gwas/rest/api/v2/reference/api-docs` — read it
rather than guessing a filter name, for the reason the next section gives.

Six mechanical traps cause most wrong GWAS Catalog results, and **all six return a
well-formed HTTP 200** rather than an error.

## Trap 1 — an unknown parameter is dropped in silence

v2 validates nothing about the parameters you send. A filter it does not recognise is
discarded, the request succeeds, and you get the **unfiltered** collection with a
perfectly well-formed `page` block. There is no warning anywhere in the response.

This matters more than it sounds, because the Catalog's own documentation disagrees with
the API about one parameter name. The REST API documentation page describes
`show_child_traits` (plural) for including child traits in an ontology search; the API
implements `show_child_trait` (singular). Follow the documentation and you get a
**narrower** result set, silently, with no indication that the flag did nothing.

```python
import json, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"
UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}


def total(path, **params):
    """page.totalElements for a filtered collection."""
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as fh:
        return json.loads(fh.read())["page"]["totalElements"]


print("asthma studies, by how the child-trait flag is spelled:")
print(f"  {'no flag (the default)':34} {total('studies', efo_trait='asthma', size=1)}")
print(f"  {'show_child_trait=true':34} "
      f"{total('studies', efo_trait='asthma', size=1, show_child_trait='true')}")
print(f"  {'show_child_trait=false':34} "
      f"{total('studies', efo_trait='asthma', size=1, show_child_trait='false')}")
print(f"  {'show_child_traits=true  <-- typo':34} "
      f"{total('studies', efo_trait='asthma', size=1, show_child_traits='true')}")

print("\nany unknown parameter is dropped in silence, at HTTP 200:")
print(f"  {'size=abc (not an integer)':34} {total('studies', efo_trait='asthma', size='abc')}")
print(f"  {'not_a_real_filter=1':34} "
      f"{total('studies', efo_trait='asthma', size=1, not_a_real_filter=1)}")
print(f"  {'efo_trait misspelled as efo_trai':34} "
      f"{total('studies', efo_trai='asthma', size=1)}")
```

```
asthma studies, by how the child-trait flag is spelled:
  no flag (the default)              287
  show_child_trait=true              348
  show_child_trait=false             287
  show_child_traits=true  <-- typo   287

any unknown parameter is dropped in silence, at HTTP 200:
  size=abc (not an integer)          287
  not_a_real_filter=1                287
  efo_trait misspelled as efo_trai   231865
```

Read the last line. Misspelling the *filter name* did not raise, did not warn, and did
not return zero — it returned **the entire catalogue**, 231,865 studies where the correct
query returns 287. A pipeline that logs "231865 studies for asthma" has not failed
loudly; it has produced a number eight hundred times too large that will be averaged,
plotted or filtered downstream.

Two defences, and you want both:

- **Copy filter names out of the OpenAPI document**, not out of prose. The documentation
  page and the implementation disagree on at least one.
- **Assert the shape of what came back.** A trait filter that returns `page.totalElements`
  equal to the whole-catalogue count did not filter. Compare against
  `/v2/studies?size=1` once and treat a match as a failure.

## Trap 2 — `sort` silently returns zero rows while still reporting the count

This is the worst of the six, because the response looks like an empty result and is not
one.

v2 accepts a `sort` parameter on its collections. For all but two fields on
`/associations`, and for **every** field tried on `/studies`, the server answers **HTTP
200**, keeps `page.totalElements` at the correct non-zero value, and **omits the rows
entirely**. Client code written as `doc.get("_embedded", {}).get("associations", [])` —
the defensive idiom — gets `[]` and reports "no associations found" for a study that has
twenty-six.

```python
import json, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"
UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}


def probe(**params):
    """(http status, rows actually returned, page.totalElements)."""
    url = f"{BASE}/associations?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as fh:
        status, doc = fh.status, json.loads(fh.read())
    rows = doc.get("_embedded", {}).get("associations", [])
    return status, len(rows), doc.get("page", {}).get("totalElements")


base = dict(accession_id="GCST012219", size=30)

print(f"{'request':44} {'HTTP':>4} {'rows':>5} {'page.totalElements':>19}")
for label, extra in [
    ("no sort",                        {}),
    ("sort=p_value",                   {"sort": "p_value"}),
    ("sort=risk_frequency",            {"sort": "risk_frequency"}),
    ("sort=pvalue_exponent",           {"sort": "pvalue_exponent"}),
    ("sort=association_id",            {"sort": "association_id"}),
    ("sort=pubmed_id",                 {"sort": "pubmed_id"}),
    ("sort=p_value,ASC (Spring style)", {"sort": "p_value,ASC"}),
]:
    status, rows, tot = probe(**base, **extra)
    flag = "  <-- every row gone" if rows == 0 else ""
    print(f"{label:44} {status:>4} {rows:>5} {tot:>19}{flag}")

print("\nthe same thing on /studies, where nothing sorts at all:")
for s in ("accession_id", "pubmed_id", "disease_trait"):
    url = f"{BASE}/studies?" + urllib.parse.urlencode(
        dict(efo_trait="eye color", size=5, sort=s))
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as fh:
        doc = json.loads(fh.read())
    rows = doc.get("_embedded", {}).get("studies", [])
    print(f"  sort={s:16} rows={len(rows)}  page.totalElements="
          f"{doc['page']['totalElements']}")
```

```
request                                      HTTP  rows  page.totalElements
no sort                                       200    26                  26
sort=p_value                                  200    26                  26
sort=risk_frequency                           200    26                  26
sort=pvalue_exponent                          200     0                  26  <-- every row gone
sort=association_id                           200     0                  26  <-- every row gone
sort=pubmed_id                                200     0                  26  <-- every row gone
sort=p_value,ASC (Spring style)               200     0                  26  <-- every row gone

the same thing on /studies, where nothing sorts at all:
  sort=accession_id     rows=0  page.totalElements=16
  sort=pubmed_id        rows=0  page.totalElements=16
  sort=disease_trait    rows=0  page.totalElements=16
```

Note that the Spring-style `sort=field,DIRECTION` spelling fails even on `p_value`, the
one field that works when passed bare. And `direction=ASC` and `direction=DESC` return
**identical** ordering on `sort=p_value`, weakest p-value first, so the parameter does
nothing and you cannot get strongest-first server-side anyway.

**So: never pass `sort`. Sort the rows you have in hand.** `pkey` below is exact, costs
nothing, and cannot silently drop a row. This is not a tolerable-with-care feature; there
is no server-side sort worth the risk of a zero-row 200.

## Trap 3 — three document shapes, and a missing `_embedded` means two different things

Records are never at the top level of a collection; they are nested under
`_embedded.<collection_name>`, where the name is the snake_case plural resource name.
Three shapes come back, and one unwrap helper written against the first breaks on the
others:

| Shape | Looks like | Returned by |
|---|---|---|
| **Paged collection** | `_embedded` + `_links` + **`page`** | `/studies`, `/associations`, `/efo-traits`, `/genes`, `/publications` |
| **Sub-resource** | `_embedded` **alone** — no `_links`, no `page` | `/studies/{acc}/ancestries`, `/associations/{id}/loci`, `/single-nucleotide-polymorphisms/{rs}/genomic-contexts` |
| **Single resource** | a bare object with `_links`, no `_embedded` | `/studies/{acc}`, `/efo-traits/{id}`, `/associations/{id}` |

The sub-resource shape is stricter than v1's was: it carries `_embedded` and *nothing
else*, so `doc["page"]` and `doc["_links"]` are both `KeyError`.

And the critical part: **`_embedded` is omitted entirely when a collection has no rows**,
so its absence does not tell you whether the query matched nothing or was refused.
`page.totalElements` does:

- absent `_embedded`, `totalElements == 0` → a genuine empty result
- absent `_embedded`, `totalElements > 0` → **the server refused the query** and kept the
  count. Almost always a `sort` from Trap 2. Never report this as zero.

```python
import json, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"
UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}


def fetch(path, **params):
    """One GET against v2. Returns the parsed document."""
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as fh:
        return json.loads(fh.read())


def shape(doc):
    """Which of the three shapes came back."""
    if "_embedded" in doc:
        return "paged" if "page" in doc else "sub-resource"
    return "empty-or-rejected" if "page" in doc else "single"


def records(doc, name):
    """Rows out of a collection document.

    `_embedded` is omitted entirely when a collection has no rows, so its
    absence alone does not tell you whether the query matched nothing or was
    refused. `page.totalElements` does:

      absent + totalElements == 0  -> a real empty result, return []
      absent + totalElements  > 0  -> the server refused the query and kept the
                                      count. Raise; never report this as zero.
    """
    if "_embedded" not in doc:
        total = doc.get("page", {}).get("totalElements")
        if total == 0:
            return []
        raise RuntimeError(
            f"{total} rows matched but none were returned -- the server refused "
            f"this query (almost always an unsupported `sort`)")
    if name not in doc["_embedded"]:
        raise KeyError(f"no '{name}' in _embedded: {list(doc['_embedded'])}")
    return doc["_embedded"][name]


# 1. Paged collection -- _embedded + _links + page.
d = fetch("studies", size=1)
print(f"{'/studies?size=1':46} {shape(d):17} "
      f"{len(records(d, 'studies'))} row(s) of {d['page']['totalElements']}")

# 2. Sub-resource -- _embedded ONLY. No `page`, and no `_links` either, so both
#    d['page'] and d['_links'] raise KeyError.
d = fetch("studies/GCST012219/ancestries")
print(f"{'/studies/GCST012219/ancestries':46} {shape(d):17} "
      f"{len(records(d, 'ancestries'))} row(s), keys={sorted(d)}")

# 3. Single resource -- a bare object, no _embedded and no page.
d = fetch("studies/GCST012219")
print(f"{'/studies/GCST012219':46} {shape(d):17} "
      f"{d['accession_id']}, {d['disease_trait']!r}")

# 4. A filter that matches nothing. Same missing _embedded, totalElements 0.
d = fetch("studies", efo_trait="eye colo", size=5)
print(f"{'/studies?efo_trait=eye colo':46} {shape(d):17} "
      f"{len(records(d, 'studies'))} row(s) of {d['page']['totalElements']} -- a real empty result")

# 5. A sort the server will not honour. Identical shape, non-zero count.
d = fetch("associations", accession_id="GCST012219", size=30, sort="pubmed_id")
print(f"{'/associations?...&sort=pubmed_id':46} {shape(d):17} "
      f"page.totalElements={d['page']['totalElements']}")
try:
    records(d, "associations")
except RuntimeError as e:
    print("   ->", e)
```

```
/studies?size=1                                paged             1 row(s) of 231865
/studies/GCST012219/ancestries                 sub-resource      4 row(s), keys=['_embedded']
/studies/GCST012219                            single            GCST012219, 'Eye color'
/studies?efo_trait=eye colo                    empty-or-rejected 0 row(s) of 0 -- a real empty result
/associations?...&sort=pubmed_id               empty-or-rejected page.totalElements=26
   -> 26 rows matched but none were returned -- the server refused this query (almost always an unsupported `sort`)
```

## Trap 4 — a field that has no value is absent, not null

v2 omits a key rather than sending `null`, and **which keys are omitted varies row to
row inside a single response**. So `record["field"]` is a latent `KeyError` whose
appearance depends on which rows your query happened to return: it passes in development
against one trait and raises in production against another.

Measured over one trait's rows on 2026-10-07 — 16 studies and 201 associations for
`EFO_0003949`:

| Resource | Always present | Sometimes absent (rows carrying it) |
|---|---|---|
| study | `accession_id`, `disease_trait`, `pubmed_id`, `initial_sample_size`, `replication_sample_size`, `discovery_ancestry`, `replication_ancestry`, `snp_count`, `imputed`, `platforms`, `genotyping_technologies`, `efo_traits`, `full_summary_stats_available`, `terms_of_license` | `cohort` (1 of 16), `qualifier` (5), `gxe` (15), `pooled` (15), `user_requested` (15) |
| association | `association_id`, `accession_id`, `pvalue_mantissa`, `pvalue_exponent`, `p_value`, `beta`, `range`, `risk_frequency`, `snp_allele`, `snp_effect_allele`, `locations`, `mapped_genes`, `efo_traits`, `reported_trait`, `pubmed_id`, `first_author`, `multi_snp_haplotype`, `snp_interaction` | `ci_lower` / `ci_upper` (178 of 201), `or_value` / `or_per_copy_num` (8) |

`cohort` present on **one study in sixteen** is the shape of this problem: a test against
the other fifteen passes.

Separately, where a value *is* always present it may be a **string sentinel** rather than
an empty one — `beta` and `range` are `"-"` when the paper reported nothing, and
`risk_frequency` is `"NR"`. Neither is falsy, so `if assoc["beta"]:` is true for an
association with no effect size, and `float(assoc["beta"].split()[0])` raises on `"-"`.

Use `.get()` for everything in the right-hand column, and test `"-"` and `"NR"`
explicitly.

## Trap 5 — p-values are a mantissa and an exponent, and the float underflows to zero

Every association carries three p-value fields, and they do not agree at the extremes:

| Field | Type | At `p = 2e-28539` |
|---|---|---|
| `pvalue_mantissa` | integer, 1-9 | `2` |
| `pvalue_exponent` | negative integer | `-28539` |
| `p_value` | IEEE-754 double | **`0.0`** |

(The same association: `rs1129038-T` in GCST012219.)

An IEEE-754 double cannot represent anything below about `5e-324`, and the Catalog's
strongest associations are far below that — meta-analyses of hundreds of thousands of
people routinely report exponents in the hundreds or thousands. So `p_value` is a
convenience field that **silently becomes `0.0`** exactly for the associations you most
wanted to find.

The damage is rarely a crash. `0.0 < 5e-8` is `True`, so a significance filter still
passes. What breaks is everything that treats zero as a value: `-log10(p_value)` raises,
ranking ties every strong hit at the same place, and a "drop rows with no p-value" step
keyed on falsiness throws away the top of the table.

**Reconstruct from the mantissa and exponent, and keep them as the sort key.**

```python
import json, math, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"
UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}


def fetch(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as fh:
        return json.loads(fh.read())


def pkey(assoc):
    """Exact, sortable p-value. Ascending puts the strongest association first.

    Both fields are integers, so this never rounds and never underflows. Do not
    compare two associations through `p_value`."""
    return (assoc["pvalue_exponent"], assoc["pvalue_mantissa"])


def neglog10p(assoc):
    """-log10(p) from the integer fields. math.log10(assoc['p_value']) raises
    ValueError on exactly the rows this exists for."""
    return -(math.log10(assoc["pvalue_mantissa"]) + assoc["pvalue_exponent"])


rows = fetch("associations", accession_id="GCST012219", size=100)["_embedded"]["associations"]
rows.sort(key=pkey)

underflowed = [a for a in rows if a["p_value"] == 0.0]
print(f"GCST012219 (eye colour, Simcoe 2021): {len(rows)} associations, "
      f"{len(underflowed)} with p_value == 0.0")
print(f"{'effect allele':20} {'mantissa':>8} {'exponent':>9} "
      f"{'p_value (double)':>17} {'-log10(p)':>10}")
for a in rows[:3] + rows[-2:]:
    print(f"{a['snp_effect_allele'][0]:20} {a['pvalue_mantissa']:>8} "
          f"{a['pvalue_exponent']:>9} {a['p_value']:>17} {neglog10p(a):>10.1f}")

try:
    math.log10(rows[0]["p_value"])
except ValueError as e:
    print("\nmath.log10(p_value) on the strongest association:", e)
```

```
GCST012219 (eye colour, Simcoe 2021): 26 associations, 2 with p_value == 0.0
effect allele        mantissa  exponent  p_value (double)  -log10(p)
rs1129038-T                 2    -28539               0.0    28538.7
rs4778218-G                 1      -582               0.0      582.0
rs12203592-T                2      -321        1.996e-321      320.7
rs115950244-T               4        -8             4e-08        7.4
rs80308281-T                5        -8             5e-08        7.3

math.log10(p_value) on the strongest association: math domain error
```

Note the third row. `2e-321` is *representable*, but only as a subnormal double, so
`p_value` comes back as `1.996e-321` — the nearest double, three significant figures
short. Between roughly `1e-308` and `5e-324` the float is present and lossy rather than
absent, which is worse than zero because nothing about it looks wrong.

### Effect sizes come in two mutually exclusive forms, and both can be absent

v2 collapsed v1's three beta fields into **one string**: `"0.385 unit decrease"`,
`"5.496 z score increase"`, or `"-"` when the paper reported none. The unit is free text
(`unit`, `z score`, and others), and the direction is a word rather than a sign, so a beta
is unsigned until you parse two of the three tokens. Odds ratios live in a separate
`or_value` field that is **missing** on quantitative-trait studies and can be present
but `None` on others. `ci_lower` / `ci_upper` are the parsed confidence bounds, and
`range` the string v1 shipped.

Never coerce a beta into an odds ratio, and do not assume a row has either.

```python
import json, re, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"
UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}
BETA = re.compile(r"^(-?[\d.]+)\s+(.*?)\s+(increase|decrease)$")


def fetch(path, **params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as fh:
        return json.loads(fh.read())


def effect(assoc):
    """(kind, signed value, unit) for one association, or ('none', None, None).

    `beta` is one string -- "0.385 unit decrease", "5.496 z score increase" --
    and the absent value is the string "-", not null. The direction is a word,
    so a beta is unsigned until it is parsed. `or_value` is a separate field
    that is missing on some studies and present-but-None on others, so it needs
    .get() AND a None check."""
    beta = assoc.get("beta")
    if beta and beta != "-":
        m = BETA.match(beta)
        if not m:
            raise ValueError(f"unparsed beta: {beta!r}")
        value, unit, direction = m.groups()
        sign = -1 if direction == "decrease" else 1
        return "beta", sign * float(value), unit
    odds = assoc.get("or_value")
    if odds is not None:
        return "odds ratio", float(odds), "per copy"
    return "none", None, None


for acc, note in (("GCST012219", "eye colour, a quantitative trait"),
                  ("GCST000071", "Crohn's disease, case-control")):
    rows = fetch("associations", accession_id=acc, size=100)["_embedded"]["associations"]
    kinds = {}
    for a in rows:
        kinds[effect(a)[0]] = kinds.get(effect(a)[0], 0) + 1
    print(f"{acc} ({note}): {len(rows)} associations, effect sizes {kinds}")
    print(f"  {'effect allele':18} {'kind':11} {'value':>10} {'unit':14} "
          f"{'CI':16} risk_freq")
    for a in rows[:3]:
        kind, value, unit = effect(a)
        ci = (f"{a.get('ci_lower')}-{a.get('ci_upper')}"
              if a.get("ci_lower") is not None else a.get("range"))
        shown = "-" if value is None else f"{value:.4g}"
        print(f"  {a['snp_effect_allele'][0]:18} {kind:11} {shown:>10} "
              f"{(unit or '-'):14} {str(ci):16} {a['risk_frequency']}")
    print(f"  or_value key present on any row: "
          f"{any('or_value' in a for a in rows)}; "
          f"non-null on {sum(1 for a in rows if a.get('or_value') is not None)} row(s)")
    print()
```

```
GCST012219 (eye colour, a quantitative trait): 26 associations, effect sizes {'none': 2, 'beta': 24}
  effect allele      kind             value unit           CI               risk_freq
  rs481767-G         none                 - -              -                NR
  rs1998948-T        none                 - -              -                NR
  rs1426654-G        beta             0.684 unit           0.56-0.81        0.102
  or_value key present on any row: False; non-null on 0 row(s)

GCST000071 (Crohn's disease, case-control): 3 associations, effect sizes {'none': 1, 'odds ratio': 2}
  effect allele      kind             value unit           CI               risk_freq
  rs5743289-?        none                 - -              -                NR
  rs1004819-?        odds ratio        2.56 per copy       1.75-3.7         0.97
  rs1004819-?        odds ratio        1.38 per copy       1.23-1.53        0.23
  or_value key present on any row: True; non-null on 2 row(s)

```

GCST012219 carries a beta on 24 of its 26 associations and neither an odds ratio nor a
beta on the other two, because the paper did not report one. The `or_value` key is absent
from every row of that study and present on every row of GCST000071 — the same field, two
studies, and only `.get()` survives both.

## Trap 6 — `efo_trait` means substring on one endpoint and exact match on another

The same parameter name behaves differently depending on which resource you hang it off,
and both behaviours return 200:

| Request | Matching |
|---|---|
| `/efo-traits?efo_trait=…` | **substring**, case-insensitive |
| `/studies?efo_trait=…` | **exact** whole label, case-insensitive |
| `/associations?efo_trait=…` | **exact** whole label, case-insensitive |
| `/studies?disease_trait=…` | **exact** whole label, case-insensitive |

Leading or trailing whitespace is fatal in every one of them. This is a change from v1,
where the trait search was exact everywhere — so a v1 pipeline that passed a known-good
label keeps working, while a new one written against the substring behaviour of
`/efo-traits` and then pointed at `/studies` silently returns nothing.

Trait terms are also **not all EFO**, despite the endpoint name. The Catalog annotates
with the Ontology of Biological Attributes (`OBA_…`, measurements), Mondo
(`MONDO_…`, diseases), the Human Phenotype Ontology (`HP_…`) and others alongside EFO,
and the `uri` switches namespace with the prefix — `http://www.ebi.ac.uk/efo/EFO_0003949`
versus `http://purl.obolibrary.org/obo/MONDO_0005148`. Any code that recovers an id by
stripping `http://www.ebi.ac.uk/efo/` hands back a full URI for a large fraction of
terms. Read `efo_id`; never do string surgery on `uri`.

The reliable pattern is two steps: substring-search the vocabulary, then filter on the
id you resolved.

```python
import json, urllib.error, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"
UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}


def fetch(path, **params):
    """Returns (status, document). 404 is a real answer here, not a failure."""
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=300) as fh:
            return fh.status, json.loads(fh.read())
    except urllib.error.HTTPError as e:
        return e.code, None


def rows(doc, name):
    """Rows, treating an omitted _embedded with a zero count as empty."""
    if "_embedded" not in doc:
        if doc.get("page", {}).get("totalElements") == 0:
            return []
        raise RuntimeError("rows matched but none returned -- query refused")
    return doc["_embedded"][name]


print("step 1 -- /efo-traits is a SUBSTRING search, so one query returns a menu:")
for text in ("eye color", "eye colour", "type 2 diabetes", "type II diabetes mellitus"):
    _, doc = fetch("efo-traits", efo_trait=text, size=20)
    hits = [(h["efo_id"], h["efo_trait"]) for h in rows(doc, "efo_traits")]
    shown = "; ".join(f"{i} ({lab})" for i, lab in hits[:3]) or "no match"
    print(f"  {text!r:28} {len(hits)} hit(s)  {shown}")

print("\nstep 2 -- on /studies the SAME parameter name is an EXACT match:")
for text in ("eye color", "eye colo", "type 2 diabetes", "type 2 diabetes mellitus"):
    _, doc = fetch("studies", efo_trait=text, size=1)
    print(f"  efo_trait={text!r:28} {doc['page']['totalElements']:>6} studies")

print("\nstep 3 -- so take the efo_id from step 1 and filter on that:")
for efo_id in ("EFO_0003949", "MONDO_0005148"):
    status, trait = fetch(f"efo-traits/{efo_id}")
    _, st = fetch("studies", efo_id=efo_id, size=1)
    _, asc = fetch("associations", efo_id=efo_id, size=1)
    print(f"  {efo_id:14} HTTP {status}  {trait['efo_trait']!r:26} "
          f"{st['page']['totalElements']:>4} studies, "
          f"{asc['page']['totalElements']:>5} associations")
    print(f"     uri={trait['uri']}")

status, _ = fetch("efo-traits/EFO_0001360")
print(f"\n  EFO_0001360, the id pre-2023 type 2 diabetes pipelines hardcoded: HTTP {status}")
```

```
step 1 -- /efo-traits is a SUBSTRING search, so one query returns a menu:
  'eye color'                  1 hit(s)  EFO_0003949 (eye color)
  'eye colour'                 1 hit(s)  EFO_0009764 (eye colour measurement)
  'type 2 diabetes'            3 hit(s)  OBA_2001013 (age of onset of type 2 diabetes mellitus); EFO_0004997 (type 2 diabetes nephropathy); MONDO_0005148 (type 2 diabetes mellitus)
  'type II diabetes mellitus'  0 hit(s)  no match

step 2 -- on /studies the SAME parameter name is an EXACT match:
  efo_trait='eye color'                      16 studies
  efo_trait='eye colo'                        0 studies
  efo_trait='type 2 diabetes'                 0 studies
  efo_trait='type 2 diabetes mellitus'      351 studies

step 3 -- so take the efo_id from step 1 and filter on that:
  EFO_0003949    HTTP 200  'eye color'                  16 studies,   201 associations
     uri=http://www.ebi.ac.uk/efo/EFO_0003949
  MONDO_0005148  HTTP 200  'type 2 diabetes mellitus'  351 studies,  8864 associations
     uri=http://purl.obolibrary.org/obo/MONDO_0005148

  EFO_0001360, the id pre-2023 type 2 diabetes pipelines hardcoded: HTTP 404
```

Three things to take from that output:

- **A British spelling does not fail, it matches something else.** `eye colour` returns
  `EFO_0009764` ("eye colour measurement"), a different trait from `EFO_0003949`
  ("eye color"). The search succeeded and the answer is wrong, which is the whole problem
  with substring matching as a resolution step. Resolve to exactly one id, or stop.
- **`type 2 diabetes` matches three traits** and filters zero studies. The term you want
  is `MONDO_0005148`, and the id every pre-2023 pipeline hardcoded (`EFO_0001360`) is a
  404. A hardcoded ontology id has a shelf life.
- `/efo-traits/{id}` **404s** on an unknown id, while a filtered collection returns 200
  with no rows. Two different "not found" answers in one API.

The Catalog also keeps a curator-written free-text trait on the *study* (`disease_trait`,
e.g. `"Eye color"`, capitalised) distinct from the ontology label on the association
(`"eye color"`). They are different fields with different vocabularies, and
`gwas-efo-trait-mappings.tsv` in each release maps one to the other offline. Picking the
wrong one is a silent empty result.

## Paging — the default is 20 rows, and the cap is 2000

A paged collection returns **20 rows** by default, in a complete-looking document whose
only evidence of truncation is `page.totalElements` and the presence of a `next` link.
`size` is honoured up to **2000** and silently rewritten above it, so a request for
`size=5000` returns 2000 rows and reports `page.size: 2000`.

Follow `_links.next` rather than computing page numbers: it is absent on the last page,
which is the one end-of-collection signal that does not depend on arithmetic.

```python
import json, urllib.parse, urllib.request

UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}
BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"


def walk(path, name, **params):
    """Every row of a paged collection, following _links.next.

    `next` is absent on the last page, which is the only end signal that does
    not depend on arithmetic over totalElements."""
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    pages = 0
    while url:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=300) as fh:
            doc = json.loads(fh.read())
        pages += 1
        if "_embedded" not in doc:
            if doc.get("page", {}).get("totalElements"):
                raise RuntimeError("rows matched but none returned -- query refused")
            break
        yield from doc["_embedded"][name]
        url = doc.get("_links", {}).get("next", {}).get("href")
    print(f"  ({pages} page(s) fetched)")


# The default page is 20 rows, in a document that looks complete.
req = urllib.request.Request(f"{BASE}/associations?efo_id=EFO_0003949", headers=UA)
with urllib.request.urlopen(req, timeout=300) as fh:
    doc = json.loads(fh.read())
print(f"no size given: {len(doc['_embedded']['associations'])} rows returned, "
      f"page.totalElements={doc['page']['totalElements']}, "
      f"next link present={'next' in doc['_links']}")

rows = list(walk("associations", "associations", efo_id="EFO_0003949", size=100))
print(f"following next: {len(rows)} associations for EFO_0003949")

# size is honoured up to 2000 and silently rewritten above it.
for n in (1000, 2000, 5000):
    req = urllib.request.Request(
        f"{BASE}/studies?efo_id=EFO_0003949&size={n}", headers=UA)
    with urllib.request.urlopen(req, timeout=300) as fh:
        p = json.loads(fh.read())["page"]
    print(f"  asked size={n:<5} got page.size={p['size']}")
```

```
no size given: 20 rows returned, page.totalElements=201, next link present=True
  (3 page(s) fetched)
following next: 201 associations for EFO_0003949
  asked size=1000  got page.size=1000
  asked size=2000  got page.size=2000
  asked size=5000  got page.size=2000
```

**Rate limits are published and enforced:** 100 requests per minute and 15 per second per
IP, with a `429` above either. Set a descriptive `User-Agent` if you will send many — the
Catalog asks for one — and for anything catalogue-wide use the release files rather than
crawling, as below. A large unfiltered page is also simply slow: `/studies?size=500` did
not return within 120 seconds on 2026-10-07, while `size=100` took about 16 seconds and
the same request filtered to one trait took under 4. Filter first, then page.

## Not every association is one variant

An association row is the unit the *paper* reported, which is not always a single SNP.
Two forms carry several variants, they are flagged by different booleans, and they put
their extra alleles in **different places** — so code that reads `snp_allele[0]` and moves
on silently drops the rest of a haplotype.

- `multi_snp_haplotype: true` — **one** locus record carrying every allele.
- `snp_interaction: true` — **several** locus records, one allele each.

And the row's two allele lists are **not index-aligned**. `snp_effect_allele`
(`"rs10830963-G"`) and `snp_allele` (`{"rs_id": …, "effect_allele": …}`) list the same
variants in different orders on most multi-variant rows, so zipping them by position pairs
the wrong allele with the wrong variant. Join on `rs_id`.

```python
import json, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"
UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}


def fetch(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as fh:
        return json.loads(fh.read())


def alleles(assoc):
    """rs_id -> effect allele, joined on rs_id rather than by position.

    `snp_effect_allele` ("rs10830963-G") and `snp_allele` ({"rs_id":...}) list
    the same variants in DIFFERENT orders on most multi-variant rows, so zipping
    them by index silently pairs the wrong allele with the wrong variant."""
    return {s["rs_id"]: s["effect_allele"] for s in assoc["snp_allele"]}


print("how often do the two allele lists disagree on order?")
aligned = differing = 0
for acc in ("GCST006494", "GCST000071", "GCST012219"):
    for a in fetch("associations", accession_id=acc, size=200)["_embedded"]["associations"]:
        if len(a["snp_effect_allele"]) < 2:
            continue
        by_effect = [x.rsplit("-", 1)[0] for x in a["snp_effect_allele"]]
        by_allele = [s["rs_id"] for s in a["snp_allele"]]
        if by_effect == by_allele:
            aligned += 1
        else:
            differing += 1
print(f"  multi-variant rows: {aligned} in the same order, {differing} in a different order\n")

for assoc_id, label in ((6036, "a 17-marker haplotype"),
                        (35123593, "a SNP x SNP interaction")):
    a = fetch(f"associations/{assoc_id}")
    loci = fetch(f"associations/{assoc_id}/loci")["_embedded"]["loci"]
    print(f"association {assoc_id} -- {label}")
    print(f"  multi_snp_haplotype={a['multi_snp_haplotype']}  "
          f"snp_interaction={a['snp_interaction']}  "
          f"{len(a['snp_effect_allele'])} alleles on the row")
    print(f"  /loci returns {len(loci)} locus record(s):")
    for L in loci:
        names = [r["risk_allele_name"] for r in L["strongest_risk_alleles"]]
        genes = [g["gene_name"] for g in L["author_reported_genes"]]
        print(f"    {L['description']!r}: {len(names)} risk allele(s) "
              f"{names[:3]}{' ...' if len(names) > 3 else ''}, genes {genes}")
    print(f"  joined on rs_id: {dict(list(alleles(a).items())[:3])}"
          f"{' ...' if len(alleles(a)) > 3 else ''}\n")
```

```
how often do the two allele lists disagree on order?
  multi-variant rows: 2 in the same order, 7 in a different order

association 6036 -- a 17-marker haplotype
  multi_snp_haplotype=True  snp_interaction=False  16 alleles on the row
  /loci returns 1 locus record(s):
    '17 marker haplotype-2': 16 risk allele(s) ['rs11209003-?', 'rs11209002-?', 'rs2064689-?'] ..., genes ['IL23R']
  joined on rs_id: {'rs11209003': '?', 'rs11209002': '?', 'rs2064689': '?'} ...

association 35123593 -- a SNP x SNP interaction
  multi_snp_haplotype=False  snp_interaction=True  2 alleles on the row
  /loci returns 2 locus record(s):
    'SNP x SNP interaction': 1 risk allele(s) ['rs10830963-G'], genes ['MTNR1B']
    'SNP x SNP interaction': 1 risk allele(s) ['rs4818032-C'], genes ['WRB']
  joined on rs_id: {'rs4818032': 'C', 'rs10830963': 'G'}

```

Seven of nine multi-variant rows ordered the two lists differently. Note also the `?`
effect allele on the haplotype — the Catalog records an unknown risk allele as `"?"`,
another string sentinel rather than a null.

## Variants, mapped genes and genomic context

"Mapped gene" means two different things in this API and they do not agree:

- `mapped_genes` on an association or SNP record — the **Ensembl pipeline's** assignment,
  the annotation the Catalog website shows.
- `author_reported_genes` on a locus record — what the **paper** said, which is often
  empty and occasionally contradicts the pipeline.

`/single-nucleotide-polymorphisms/{rs}/genomic-contexts` is the full picture, and it
carries rows from **two sources** (Ensembl and NCBI) so the same gene appears more than
once with slightly different distances. Deduplicate on gene name, and use the booleans
rather than `distance == 0` to decide containment.

```python
import json, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"
UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}


def fetch(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as fh:
        return json.loads(fh.read())


rs = "rs10830963"
snp = fetch(f"single-nucleotide-polymorphisms/{rs}")
loc = snp["locations"][0]
print(f"{rs}: {snp['functional_class']}, alleles {snp['alleles']}")
print(f"  {loc['chromosome_name']}:{loc['chromosome_position']} "
      f"({loc['region']['name']}), merged={snp['merged']}")
print(f"  mapped_genes on the SNP record: {snp['mapped_genes']}")

ctx = fetch(f"single-nucleotide-polymorphisms/{rs}/genomic-contexts")["_embedded"]["genomic_contexts"]
inside = [c["gene"]["gene_name"] for c in ctx if not c["is_intergenic"]]
closest = [c["gene"]["gene_name"] for c in ctx if c["is_closest_gene"]]
print(f"\n  /genomic-contexts: {len(ctx)} records, sources "
      f"{sorted({c['source'] for c in ctx})}")
print(f"  genes the variant is INSIDE (is_intergenic false): {sorted(set(inside))}")
print(f"  nearest flanking genes (is_closest_gene true):     {sorted(set(closest))}")
print(f"\n  {'gene':14} {'intergenic':>10} {'upstream':>8} {'distance':>9} closest")
for c in ctx[:5]:
    print(f"  {c['gene']['gene_name']:14} {str(c['is_intergenic']):>10} "
          f"{str(c['is_upstream']):>8} {c['distance']:>9} {c['is_closest_gene']}")

# "mapped gene" means two different things, and they do not agree.
assoc = fetch("associations", rs_id=rs, size=1)["_embedded"]["associations"][0]
loci = fetch(f"associations/{assoc['association_id']}/loci")["_embedded"]["loci"]
reported = [g["gene_name"] for L in loci for g in L["author_reported_genes"]]
print(f"\n  on association {assoc['association_id']} for {rs}:")
print(f"    mapped_genes (Ensembl pipeline): {assoc['mapped_genes']}")
print(f"    author_reported_genes (/loci):   {reported}")
```

```
rs10830963: intron_variant, alleles C/G/T (forward)
  11:92975544 (11q14.3), merged=0
  mapped_genes on the SNP record: ['MTNR1B']

  /genomic-contexts: 13 records, sources ['Ensembl', 'NCBI']
  genes the variant is INSIDE (is_intergenic false): ['MTNR1B']
  nearest flanking genes (is_closest_gene true):     ['LOC124902733', 'RPL26P31', 'SNRPGP16']

  gene           intergenic upstream  distance closest
  EEF1A1P49            True     True     58953 False
  FAT3                 True     True     79071 False
  MTNR1B              False    False         0 False
  LOC124902733         True     True      6629 True
  EEF1A1P49            True     True     58941 False

  on association 226286871 for rs10830963:
    mapped_genes (Ensembl pipeline): ['MTNR1B']
    author_reported_genes (/loci):   []
```

`EEF1A1P49` appears twice with distances 58,953 and 58,941 — the same gene from the two
sources. And `is_closest_gene` is `false` for `MTNR1B`, the gene the variant is actually
inside, because "closest" means closest *flanking* gene: containment and proximity are
separate questions and need separate booleans.

Note `extended_geneset`. The default is `false`, the narrow Ensembl mapped-gene set; `true`
gives the wider Ensembl-plus-RefSeq set that v1 used. On `/associations?mapped_gene=TCF7L2`
that is 921 associations against 945 — so a gene query ported from v1 loses rows unless you
ask for the extended set.

## An association is not a result

Everything above is plumbing. This is the part that decides whether the number you return
means anything, and it is why the study record has to travel with the association.

**Three facts change the interpretation, and all three are in the study record:**

1. **The Catalog's curation threshold is 1×10⁻⁵, not genome-wide significance.** Its
   inclusion criteria state that associations are included "only if the reported
   association has a p-value less than 1 x 10⁻⁵", so associations weaker than 5×10⁻⁸ are
   in the table by design. Filtering at 5×10⁻⁸ is the reader's job, and the Catalog does
   not do it for you. For `EFO_0003949`, 160 of 201 associations clear 5×10⁻⁸.
2. **Ancestry of the discovery cohort.** `/studies/{acc}/ancestries` returns rows with a
   `type` of `"initial"` (discovery) or `"replication"`, each with
   `number_of_individuals`, `ancestral_groups` and `country_of_recruitment`. An effect
   estimated in Europeans has no guaranteed transfer — allele frequency, LD structure and
   effect size all differ — and the great majority of the Catalog is European.
3. **Whether anything replicated.** A study with no `"replication"` ancestry row and an
   empty `replication_ancestry` list reported no replication stage. Across the whole
   2026-10-03 release that is the common case: 262,887 `initial` rows against 37,417
   `replication` rows, so **replication rows are 12.5% of the release** and at most one
   study in six replicated anything at all. "Was it replicated?" is worth asking of every
   association you plan to report.

Because v2 inlines the study fields on every association row, points 2 and 3 cost no extra
requests for the sample-size strings — only the per-stage ancestry breakdown needs the
sub-resource or the release file.

## Get the files

Everything above prints. This writes, because a target dossier, a figure or a
meta-analysis needs files — and because the catalogue grows every fortnight, so a
directory of TSVs with no release stamp cannot be compared against a later pull.
`/v2/metadata` exists for exactly that and should go into every manifest.

**Route A — the REST API, for one trait.** Resolve the trait, walk the two collections,
flatten to TSVs with a manifest. v2 inlines the study fields on every association row, so
this needs no per-study call and no `projection` parameter.

```python
import csv, datetime, json, os, re, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"
UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}
TRAIT_TEXT = "eye color"
OUT = "Data/gwas-catalog"
GWAS_SIG = 5e-8
BETA = re.compile(r"^(-?[\d.]+)\s+(.*?)\s+(increase|decrease)$")


def fetch(path, **params):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as fh:
        return url, json.loads(fh.read())


def rows_of(doc, name):
    if "_embedded" not in doc:
        if doc.get("page", {}).get("totalElements") == 0:
            return []
        raise RuntimeError("rows matched but none returned -- query refused")
    return doc["_embedded"][name]


def walk(path, name, **params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    out = []
    while url:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=300) as fh:
            doc = json.loads(fh.read())
        out.extend(rows_of(doc, name))
        url = doc.get("_links", {}).get("next", {}).get("href")
    return out


def write_tsv(path, rows, cols):
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, delimiter="\t", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return {"path": path, "rows": len(rows), "bytes": os.path.getsize(path)}


os.makedirs(OUT, exist_ok=True)
sources, files = {}, []

# 1. Substring search -> exactly one trait, or stop. Never hardcode an efo_id.
url, doc = fetch("efo-traits", efo_trait=TRAIT_TEXT, size=20)
hits = rows_of(doc, "efo_traits")
exact = [h for h in hits if h["efo_trait"].lower() == TRAIT_TEXT.lower()]
if len(exact) != 1:
    raise LookupError(f"{TRAIT_TEXT!r} -> {[h['efo_id'] for h in hits]}; pick one")
trait = exact[0]
sources["trait"] = url
print(f"resolved: {trait['efo_id']} | {trait['efo_trait']!r} | {trait['uri']}")

# 2. Associations, filtered on the id. The study fields travel on every row in
#    v2, so no second call per study and no projection parameter.
assocs = walk("associations", "associations", efo_id=trait["efo_id"], size=500)
sources["associations"] = f"{BASE}/associations?efo_id={trait['efo_id']}"
print(f"associations: {len(assocs)}")

# 3. Flatten. Mantissa and exponent are the p-value of record; p_value is kept
#    so a reader can see where the double underflowed.
arows = []
for a in assocs:
    beta_m = BETA.match(a.get("beta") or "")
    arows.append({
        "accession": a["accession_id"],
        "rsIds": "|".join(s["rs_id"] for s in a["snp_allele"]),
        "effectAlleles": "|".join(
            f"{s['rs_id']}-{s['effect_allele']}" for s in a["snp_allele"]),
        "mappedGenes": "|".join(a["mapped_genes"]),
        "locations": "|".join(a["locations"]),
        "pvalueMantissa": a["pvalue_mantissa"],
        "pvalueExponent": a["pvalue_exponent"],
        "pvalueDouble": a["p_value"],
        "pvalueUnderflowed": a["p_value"] == 0.0,
        "genomeWideSignificant": (a["pvalue_exponent"], a["pvalue_mantissa"]) <= (-8, 5),
        "betaValue": (-1 if beta_m and beta_m.group(3) == "decrease" else 1)
                     * float(beta_m.group(1)) if beta_m else "",
        "betaUnit": beta_m.group(2) if beta_m else "",
        "orValue": a.get("or_value") if a.get("or_value") is not None else "",
        "ciLower": a.get("ci_lower") if a.get("ci_lower") is not None else "",
        "ciUpper": a.get("ci_upper") if a.get("ci_upper") is not None else "",
        "riskFrequency": a["risk_frequency"],
        "multiSnpHaplotype": a["multi_snp_haplotype"],
        "snpInteraction": a["snp_interaction"],
        "reportedTrait": "|".join(a["reported_trait"]),
        "pubmedId": a["pubmed_id"],
        "firstAuthor": a["first_author"],
    })
arows.sort(key=lambda r: (r["pvalueExponent"], r["pvalueMantissa"]))
files.append(write_tsv(f"{OUT}/{trait['efo_id']}_associations.tsv", arows, list(arows[0])))

# 4. Studies, one row each, with the cohort that decides interpretation.
studies = walk("studies", "studies", efo_id=trait["efo_id"], size=500)
sources["studies"] = f"{BASE}/studies?efo_id={trait['efo_id']}"
srows = []
for s in studies:
    srows.append({
        "accession": s["accession_id"],
        "diseaseTrait": s["disease_trait"],
        "pubmedId": s["pubmed_id"],
        "initialSampleSize": s["initial_sample_size"],
        "replicationSampleSize": s["replication_sample_size"],
        "discoveryAncestry": "|".join(s["discovery_ancestry"]),
        "replicationAncestry": "|".join(s["replication_ancestry"]),
        "replicated": bool(s["replication_ancestry"]),
        "snpCount": s["snp_count"],
        "imputed": s["imputed"],
        "fullSummaryStatsAvailable": s["full_summary_stats_available"],
        # v2 OMITS a field rather than sending null, and which fields are
        # omitted varies row to row, so every optional read needs .get().
        "cohort": "|".join(s.get("cohort") or []),
        "gxe": s.get("gxe", ""),
        "qualifier": s.get("qualifier", ""),
        "genotypingTechnologies": "|".join(s["genotyping_technologies"]),
        "termsOfLicense": s["terms_of_license"],
    })
srows.sort(key=lambda r: r["accession"])
files.append(write_tsv(f"{OUT}/{trait['efo_id']}_studies.tsv", srows, list(srows[0])))

# 5. The manifest. Without it these numbers cannot be compared to a later pull.
_, meta = fetch("metadata")
manifest = {
    "retrieved": datetime.date.today().isoformat(),
    "apiVersion": meta["version"],
    "dataReleaseDate": meta["data_release_date"],
    "efoVersion": meta["efo_version"],
    "ensemblVersion": meta["ensembl_version"],
    "dbsnpBuild": meta["dbsnp_build"],
    "traitSearchText": TRAIT_TEXT,
    "efoId": trait["efo_id"],
    "efoLabel": trait["efo_trait"],
    "efoUri": trait["uri"],
    "significanceThreshold": GWAS_SIG,
    "associationsRetrieved": len(arows),
    "associationsAtThreshold": sum(r["genomeWideSignificant"] for r in arows),
    "associationsUnderflowed": sum(r["pvalueUnderflowed"] for r in arows),
    "studiesRetrieved": len(srows),
    "studiesReplicated": sum(r["replicated"] for r in srows),
    "sources": sources,
    "files": files,
}
with open(f"{OUT}/manifest.json", "w") as fh:
    json.dump(manifest, fh, indent=2)

for f in files:
    print(f"{f['path']:50} {f['rows']:>4} rows  {f['bytes']:>7,} bytes")
print(f"{OUT + '/manifest.json':50} "
      f"{manifest['associationsAtThreshold']} of {manifest['associationsRetrieved']} "
      f"at p <= 5e-8, data release {manifest['dataReleaseDate']}")
```

```
resolved: EFO_0003949 | 'eye color' | http://www.ebi.ac.uk/efo/EFO_0003949
associations: 201
Data/gwas-catalog/EFO_0003949_associations.tsv      201 rows   31,567 bytes
Data/gwas-catalog/EFO_0003949_studies.tsv            16 rows    4,303 bytes
Data/gwas-catalog/manifest.json                    160 of 201 at p <= 5e-8, data release 2026-10-03
```

**Route B — the release files, for anything catalogue-wide.** The REST API cannot answer
questions about all 231,865 studies at 100 requests a minute, and the Catalog asks you not
to try: "For bulk access, download the GWAS Catalog flat files instead of crawling the
API." Each fortnightly release publishes the whole catalogue over anonymous HTTPS at
`https://ftp.ebi.ac.uk/pub/databases/gwas/releases/latest/`:

| File | What it carries |
|---|---|
| `gwas-catalog-download-studies-v1.0.3.1.txt` | every study, with `STUDY ACCESSION`, `MAPPED_TRAIT_URI`, `COHORT`, `FULL SUMMARY STATISTICS`, `SUMMARY STATS LOCATION` |
| `gwas-catalog-ancestry.tsv` | one row per study **per ancestry stage** — the cohort table |
| `gwas-catalog-associations_ontology-annotated-full.zip` | every association, ontology-annotated |
| `gwas-efo-trait-mappings.tsv` | free-text study trait → ontology term and parent |

Stream it rather than loading it, and join on the accessions Route A already collected.
This block downloads about 50 MB and takes a few minutes on a slow link:

```python
import csv, io, json, os, urllib.request
from collections import Counter

FTP = "https://ftp.ebi.ac.uk/pub/databases/gwas/releases/latest"
OUT = "Data/gwas-catalog"
EFO_ID = "EFO_0003949"

wanted = {r["accession"] for r in
          csv.DictReader(open(f"{OUT}/{EFO_ID}_studies.tsv"), delimiter="\t")}
print(f"{len(wanted)} accessions from Route A")

# The header is misspelled upstream -- NUMBER OF INDIVDUALS, ADDITONAL ANCESTRY
# DESCRIPTION. Read the header row; never hand-type these names.
url = f"{FTP}/gwas-catalog-ancestry.tsv"
rows, seen, stages = [], 0, Counter()
with urllib.request.urlopen(url, timeout=900) as fh:
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

with open(f"{OUT}/{EFO_ID}_ancestry.tsv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=header, delimiter="\t")
    w.writeheader()
    w.writerows(sorted(rows, key=lambda r: (r["STUDY ACCESSION"], r["STAGE"])))

with open(f"{OUT}/manifest.json") as fh:
    manifest = json.load(fh)
manifest["bulkRelease"] = {"url": url, "ancestryRowsInRelease": seen,
                           "ancestryRowsKept": len(rows), "columns": header}
with open(f"{OUT}/manifest.json", "w") as fh:
    json.dump(manifest, fh, indent=2)

path = f"{OUT}/{EFO_ID}_ancestry.tsv"
print(f"{path:50} {len(rows):>4} rows  {os.path.getsize(path):>7,} bytes")
print(f"replication rows are {stages['replication'] / seen:.1%} of the release")
```

```
16 accessions from Route A
streamed 300,304 ancestry rows for the whole catalogue
stages: {'initial': 262887, 'replication': 37417}
kept 26 rows for 16 studies
Data/gwas-catalog/EFO_0003949_ancestry.tsv           26 rows    4,452 bytes
replication rows are 12.5% of the release
```

That output settles something the per-trait view only hints at: across the whole release
the Catalog carries 262,887 `initial` ancestry rows and 37,417 `replication` rows, so the
eight-of-sixteen replication rate seen for eye colour is the ordinary case rather than an
unlucky draw.

**Full summary statistics, when a study deposited them.** 181,535 of the 231,865 studies
report `full_summary_stats_available: true` and have a directory under
`https://ftp.ebi.ac.uk/pub/databases/gwas/summary_statistics/`, bucketed a thousand
accessions at a time — `GCST012001-GCST013000/GCST012219/`. Do not build the filename from
the accession: submissions since the GWAS-SSF standard are `{ACCESSION}.tsv.gz` with a
`-meta.yaml` beside them, but legacy studies are not (`GCST000028/Saxena-17463246.txt`, and
`GCST000510` holds fifteen separate `.assoc.gz` files, one per blood trait). **List the
directory, read the `-meta.yaml` for the genome assembly and imputation panel, and check
`md5sum.txt`.** A study with `full_summary_stats_available: false` has no directory and the
URL 404s. There is **no API for summary statistics** — the previous one was frozen in 2021
and retired in 2026, so the files are the only route.

## Try it

**Data.** The GWAS Catalog REST API v2, open over HTTPS with no key or account, plus one
study that exercises every trap: **GCST012219** (Simcoe *et al.* 2021, eye colour,
PMID:33692100), whose 26 associations include the `p = 2×10⁻²⁸⁵³⁹` row that underflows a
double. Association **6036** is a 17-marker haplotype and **35123593** a SNP × SNP
interaction. Licence: EMBL-EBI standard terms of use. All endpoints last confirmed
reachable 2026-10-07.

**Run.** Standard library only. Writes nothing, so it runs anywhere:

```python
"""GWAS Catalog REST API v2 -- self-check. Standard library only, no files needed."""
import json, math, urllib.error, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/gwas/rest/api/v2"
UA = {"User-Agent": "gwas-catalog-skill/1.0 (contact: your.email@example.org)"}
ok = []


def get(path, **params):
    """(status, document). Returns (code, None) on an HTTP error."""
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA),
                                    timeout=300) as fh:
            return fh.status, json.loads(fh.read())
    except urllib.error.HTTPError as e:
        return e.code, None


def check(label, got, want):
    ok.append(got == want)
    print(f"  [{'PASS' if got == want else 'FAIL'}] {label}: {got!r}"
          + ("" if got == want else f"  (expected {want!r})"))


meta = get("metadata")[1]
print(f"API v{meta['version']}, data release {meta['data_release_date']}, "
      f"EFO {meta['efo_version']}, Ensembl {meta['ensembl_version']}\n")

print("1. SHAPE -- v1 is retired, and says so with 410 rather than 404.")
try:
    urllib.request.urlopen(urllib.request.Request(
        "https://www.ebi.ac.uk/gwas/rest/api/studies?size=1", headers=UA), timeout=120)
    check("legacy /gwas/rest/api/studies", "200", "410")
except urllib.error.HTTPError as e:
    check("legacy /gwas/rest/api/studies", e.code, 410)

print("\n2. SHAPE -- three document shapes, told apart by _embedded and page.")
s, paged = get("studies", size=1)
check("/studies is _embedded + _links + page", sorted(paged), ["_embedded", "_links", "page"])
s, sub = get("studies/GCST012219/ancestries")
check("a sub-resource carries _embedded ALONE", sorted(sub), ["_embedded"])
s, single = get("studies/GCST012219")
check("a single resource has no _embedded", "_embedded" in single, False)

print("\n3. INVARIANT -- no _embedded means empty OR refused, and the count tells them apart.")
s, empty = get("studies", efo_trait="eye colo", size=5)
check("a filter matching nothing omits _embedded", "_embedded" in empty, False)
check("  ... with totalElements 0", empty["page"]["totalElements"], 0)
s, refused = get("associations", accession_id="GCST012219", size=30, sort="pubmed_id")
check("an unsupported sort also omits _embedded", "_embedded" in refused, False)
check("  ... but keeps a NON-ZERO count", refused["page"]["totalElements"], 26)
check("  ... at HTTP 200, not an error", s, 200)

print("\n4. INVARIANT -- an unknown parameter is dropped in silence.")
base = get("studies", efo_trait="asthma", size=1)[1]["page"]["totalElements"]
kids = get("studies", efo_trait="asthma", size=1,
           show_child_trait="true")[1]["page"]["totalElements"]
typo = get("studies", efo_trait="asthma", size=1,
           show_child_traits="true")[1]["page"]["totalElements"]
whole = get("studies", efo_trai="asthma", size=1)[1]["page"]["totalElements"]
check("show_child_trait=true widens the result", kids > base, True)
check("the plural spelling is ignored, not rejected", typo, base)
check("misspelling the FILTER returns the whole catalogue", whole > 100 * base, True)

print("\n5. INVARIANT -- mantissa and exponent are the p-value of record.")
rows = get("associations", accession_id="GCST012219", size=100)[1]["_embedded"]["associations"]
rows.sort(key=lambda a: (a["pvalue_exponent"], a["pvalue_mantissa"]))
top = rows[0]
check("strongest association is rs1129038-T", top["snp_effect_allele"][0], "rs1129038-T")
check("  its exponent", top["pvalue_exponent"], -28539)
check("  its p_value double has underflowed to 0.0", top["p_value"], 0.0)
check("  -log10(p) from the integers", round(-(math.log10(top["pvalue_mantissa"])
                                              + top["pvalue_exponent"]), 1), 28538.7)
try:
    math.log10(top["p_value"])
    check("math.log10(p_value) raises", False, True)
except ValueError:
    check("math.log10(p_value) raises ValueError", True, True)

print("\n6. INVARIANT -- substring on /efo-traits, exact match on /studies.")
hits = get("efo-traits", efo_trait="type 2 diabetes", size=20)[1]["_embedded"]["efo_traits"]
check("'type 2 diabetes' matches >1 trait label", len(hits) > 1, True)
check("  but filters no studies as a label",
      get("studies", efo_trait="type 2 diabetes", size=1)[1]["page"]["totalElements"], 0)
check("  while its resolved id does",
      get("studies", efo_id="MONDO_0005148", size=1)[1]["page"]["totalElements"] > 0, True)
check("EFO_0001360 (retired T2D id) is gone", get("efo-traits/EFO_0001360")[0], 404)

print("\n7. INVARIANT -- paging is driven by _links.next and the walk is exhaustive.")
url, seen, pages = f"{BASE}/associations?efo_id=EFO_0003949&size=50", 0, 0
total = None
while url:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as fh:
        doc = json.loads(fh.read())
    total = doc["page"]["totalElements"]
    seen += len(doc["_embedded"]["associations"])
    pages += 1
    url = doc.get("_links", {}).get("next", {}).get("href")
check("rows collected == page.totalElements", seen, total)
check("  and it took more than one page", pages > 1, True)
check("size above the cap is silently rewritten to 2000",
      get("studies", efo_id="EFO_0003949", size=5000)[1]["page"]["size"], 2000)

print("\n8. INVARIANT -- the two multi-variant forms differ in where the alleles sit.")
hap = get("associations/6036/loci")[1]["_embedded"]["loci"]
inter = get("associations/35123593/loci")[1]["_embedded"]["loci"]
check("a haplotype is ONE locus", len(hap), 1)
check("  carrying every allele", len(hap[0]["strongest_risk_alleles"]), 16)
check("an interaction is TWO loci", len(inter), 2)
check("  with one allele each", [len(L["strongest_risk_alleles"]) for L in inter], [1, 1])
a = get("associations/35123593")[1]
by_effect = [x.rsplit("-", 1)[0] for x in a["snp_effect_allele"]]
by_allele = [s["rs_id"] for s in a["snp_allele"]]
check("the two allele lists disagree on order, so join on rs_id",
      by_effect != by_allele, True)

print("\n9. OBSERVED on 2026-10-07 -- drift to investigate, not failure.")
for name, path in (("studies", "studies"), ("associations", "associations"),
                   ("trait terms", "efo-traits")):
    print(f"  {name:12} {get(path, size=1)[1]['page']['totalElements']:>9,}")
print(f"  eye colour (EFO_0003949): "
      f"{get('studies', efo_id='EFO_0003949', size=1)[1]['page']['totalElements']} studies, "
      f"{get('associations', efo_id='EFO_0003949', size=1)[1]['page']['totalElements']} associations")

print(f"\n{sum(ok)}/{len(ok)} checks passed")
raise SystemExit(0 if all(ok) else 1)
```

**Expect.** Eight groups of checks, then the counts. Groups 1-8 are **invariants** — a
failure there means the skill is wrong, or v2 has changed its contract. Group 9 is
**observed on 2026-10-07** and will drift as the Catalog grows; a changed number there is
something to investigate, not a failure. The script exits non-zero if any invariant fails.

```
API v2.0, data release 2026-10-03, EFO v3.94.0, Ensembl 116

1. SHAPE -- v1 is retired, and says so with 410 rather than 404.
  [PASS] legacy /gwas/rest/api/studies: 410

2. SHAPE -- three document shapes, told apart by _embedded and page.
  [PASS] /studies is _embedded + _links + page: ['_embedded', '_links', 'page']
  [PASS] a sub-resource carries _embedded ALONE: ['_embedded']
  [PASS] a single resource has no _embedded: False

3. INVARIANT -- no _embedded means empty OR refused, and the count tells them apart.
  [PASS] a filter matching nothing omits _embedded: False
  [PASS]   ... with totalElements 0: 0
  [PASS] an unsupported sort also omits _embedded: False
  [PASS]   ... but keeps a NON-ZERO count: 26
  [PASS]   ... at HTTP 200, not an error: 200

4. INVARIANT -- an unknown parameter is dropped in silence.
  [PASS] show_child_trait=true widens the result: True
  [PASS] the plural spelling is ignored, not rejected: 287
  [PASS] misspelling the FILTER returns the whole catalogue: True

5. INVARIANT -- mantissa and exponent are the p-value of record.
  [PASS] strongest association is rs1129038-T: 'rs1129038-T'
  [PASS]   its exponent: -28539
  [PASS]   its p_value double has underflowed to 0.0: 0.0
  [PASS]   -log10(p) from the integers: 28538.7
  [PASS] math.log10(p_value) raises ValueError: True

6. INVARIANT -- substring on /efo-traits, exact match on /studies.
  [PASS] 'type 2 diabetes' matches >1 trait label: True
  [PASS]   but filters no studies as a label: 0
  [PASS]   while its resolved id does: True
  [PASS] EFO_0001360 (retired T2D id) is gone: 404

7. INVARIANT -- paging is driven by _links.next and the walk is exhaustive.
  [PASS] rows collected == page.totalElements: 201
  [PASS]   and it took more than one page: True
  [PASS] size above the cap is silently rewritten to 2000: 2000

8. INVARIANT -- the two multi-variant forms differ in where the alleles sit.
  [PASS] a haplotype is ONE locus: 1
  [PASS]   carrying every allele: 16
  [PASS] an interaction is TWO loci: 2
  [PASS]   with one allele each: [1, 1]
  [PASS] the two allele lists disagree on order, so join on rs_id: True

9. OBSERVED on 2026-10-07 -- drift to investigate, not failure.
  studies        231,865
  associations 1,198,394
  trait terms     23,541
  eye colour (EFO_0003949): 16 studies, 201 associations

29/29 checks passed
```

## Limits worth stating in a write-up

- **The Catalog is the curated top of each paper, not its summary statistics.** It holds
  the associations an author reported above 1×10⁻⁵. Genome-wide results live in the
  summary-statistics files, for the 181,535 studies that deposited them, and have no API.
- **Ancestry is overwhelmingly European**, and effect sizes do not transfer across
  populations. Report the discovery cohort alongside every effect estimate.
- **Most studies have no replication stage** — replication rows are 12.5% of the release.
- **`mapped_genes` is a pipeline annotation, not a causal claim.** The nearest gene is
  frequently not the mediating one, and `is_closest_gene` is false for the gene a variant
  sits inside.
- **An ontology id can be retired** (`EFO_0001360`), and the trait vocabulary spans several
  ontologies. Record the id you resolved and the EFO version from `/v2/metadata`.
- **The API gives no provenance for a *negative* result.** No association for a trait can
  mean nobody studied it, nobody reported anything above 1×10⁻⁵, or your filter name was
  misspelled and silently dropped. Distinguish these before writing "no association".

## Sources

- GWAS Catalog REST API v2 reference — <https://www.ebi.ac.uk/gwas/rest/api/v2/reference>
  (OpenAPI document at `/v2/reference/api-docs`)
- Programmatic access and the v1 → v2 migration guide —
  <https://www.ebi.ac.uk/gwas/docs/programmatic-access/rest-api> and
  <https://www.ebi.ac.uk/gwas/docs/news/rest-api-v2-migration-guide>
- Inclusion criteria, including the 1×10⁻⁵ threshold —
  <https://www.ebi.ac.uk/gwas/docs/methods/criteria>
- Release files — <https://ftp.ebi.ac.uk/pub/databases/gwas/releases/latest/>
- EMBL-EBI Terms of Use — <https://www.ebi.ac.uk/about/terms-of-use/>
- Cite the Catalog: Sollis *et al.* 2023 (PMID:36350656), Cerezo *et al.* 2025
  (PMID:39530240), and the resource papers PMID:19474294, PMID:24316577, PMID:30445434.
  The worked example is Simcoe *et al.* 2021 (PMID:33692100).
