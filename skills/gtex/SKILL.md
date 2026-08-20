---
name: gtex
description: Query GTEx human tissue expression and eQTLs through the GTEx Portal API — median TPM across 54 tissues including heart left ventricle, atrial appendage and skeletal muscle, per-sample values by donor age bracket, and significant cis-eQTLs by gene and tissue. Resolves gene symbols to the versioned GENCODE ids GTEx requires, and says which data is open and which is dbGaP-controlled.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.1.0
tags: [gtex, transcriptomics, eqtl, rna-seq, public-data]
covers: [heart, left ventricle, atrial appendage, skeletal muscle, brain cortex, cerebellum, liver, lung, whole blood, skin, thyroid, testis, pancreas, kidney cortex, adipose, esophagus, artery, nerve, eqtl, egene, sqtl, gene expression, median tpm, transcriptomics, bulk rna-seq, human, aging, gencode, dbgap, genotype-tissue expression]
papers: [PMID:23715323, PMID:25954001, PMID:29022597, PMID:32913098]
access: [open, controlled]
datasets: [https://gtexportal.org/api/v2/reference/gene?geneId=TP53&gencodeVersion=v39, https://gtexportal.org/api/v2/expression/medianGeneExpression?gencodeId=ENSG00000141510.18&datasetId=gtex_v10, https://gtexportal.org/api/v2/dataset/tissueSiteDetail?datasetId=gtex_v10&itemsPerPage=300, https://gtexportal.org/api/v2/expression/geneExpression?gencodeId=ENSG00000141510.18&datasetId=gtex_v10&tissueSiteDetailId=Kidney_Medulla&attributeSubset=ageBracket, https://gtexportal.org/api/v2/association/egene?tissueSiteDetailId=Testis&datasetId=gtex_v10&itemsPerPage=1, https://storage.googleapis.com/adult-gtex/bulk-gex/v10/rna-seq/GTEx_Analysis_v10_RNASeQCv2.4.2_gene_median_tpm.gct.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-18
  against: GTEx Portal API v2.0.0 / gtex_v10 (GENCODE v39, GRCh38) / bulk store v10 and v11 / Python 3.12.8 stdlib only / curl 8.7.1
  executed: 13
  unverified: 0
---
# GTEx — Genotype-Tissue Expression

GTEx measured RNA in dozens of tissues from the same ~950 post-mortem donors, which
makes it the reference answer to *where in the body is this gene expressed, and how
much*. This skill is about getting that answer out of the open tier and onto disk.

**Almost nobody needs the controlled tier for that question.** Median expression per
tissue, per-sample expression grouped by donor sex or age bracket, significant
cis-eQTLs, eGene statistics and the full sample and subject metadata are all open —
no account, no key, no click-through. What sits behind an application is
individual-level genotype and the raw per-sample sequence reads. Read *Which tier your
question is in* before you plan around an application you probably do not need.

Three mechanical traps cause almost every failed GTEx query, and all three fail by
returning an empty, partial or wrong result instead of an error. They are the next
three sections.

## Which tier your question is in

| Question | Tier |
|---|---|
| Median TPM for a gene in each tissue | open |
| Which tissues express it most, and its rank | open |
| Per-sample TPM distributions grouped by age bracket or sex | open |
| Significant cis-eQTLs for a gene, with p-value and effect size | open |
| Is this gene an eGene in this tissue, with q-value | open |
| Sample metadata — tissue, RIN, ischemic time, autolysis, pathology notes | open |
| Subject metadata — sex, **10-year age bracket**, Hardy death classification | open |
| Full gene x sample expression matrices, per tissue | open (bulk files) |
| A donor's **genotype** at a variant | controlled |
| Raw RNA-seq reads, BAM or CRAM, for a sample | controlled |
| **Exact** donor age rather than a bracket, or other finer phenotypes | controlled |
| Running your own QTL scan on individual genotypes | controlled |

The line is not "summary versus raw". Whole open expression matrices with one column
per sample are published, including the sample identifiers that link them to the open
covariate tables. What is withheld is **genotype and sequence**, plus phenotype detail
fine enough to re-identify a donor. If your analysis is expression-versus-covariate,
you are on the open side even at sample level. If it needs a donor's alleles, you are
not.

## Trap 1 — GTEx keys on versioned GENCODE ids, and the version moves

Every expression and association endpoint takes `gencodeId`, and it wants the
identifier **with its version suffix**. Not the gene symbol. Not the bare Ensembl id.
And not the suffix from a different GTEx release — the suffix is part of the key.

| GTEx release | `datasetId` | GENCODE | TP53 is |
|---|---|---|---|
| v8 | `gtex_v8` | v26 | `ENSG00000141510.16` |
| v10 | `gtex_v10` | v39 | `ENSG00000141510.18` |
| v11 (bulk files only) | not in the API | — | `ENSG00000141510.19` |

Resolve the symbol first, against the GENCODE build of the release you are about to
query:

```bash
BASE=https://gtexportal.org/api/v2

# v39 is the GENCODE build behind gtex_v10, the default dataset for every
# expression and association endpoint. Ask for the build you will query against.
curl -s "$BASE/reference/gene?geneId=TP53&gencodeVersion=v39" \
| python3 -c "import json,sys
for r in json.load(sys.stdin)['data']:
    print(r['geneSymbol'], r['gencodeId'], r['gencodeVersion'], r['chromosome'], r['entrezGeneId'])"
```

```
TP53 ENSG00000141510.18 v39 chr17 7157
```

**The two endpoints do not share a default, and that is the whole trap.**
`/reference/gene` defaults to `gencodeVersion=v26`; the expression endpoints default
to `datasetId=gtex_v10`, which is GENCODE v39. Call both with their defaults, pass the
id you got straight into the query you meant, and GTEx answers **HTTP 200 with
`data: []`** — the same shape as a real answer with nothing in it. Nothing raises,
nothing warns, and a pipeline reports "not expressed".

```python
import json, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"
# The two defaults do not agree: /reference/gene defaults to GENCODE v26,
# every expression endpoint defaults to dataset gtex_v10 (GENCODE v39).
GENCODE_FOR = {"gtex_v8": "v26", "gtex_v10": "v39"}


def get(path, params):
    """One GET. Params may repeat -- doseq encodes lists as repeated keys."""
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=60) as fh:
        return json.loads(fh.read())


def resolve_gene(query, dataset="gtex_v10"):
    """Symbol OR bare Ensembl id -> versioned GENCODE id valid for `dataset`.

    /reference/gene matches either, so this is also the migration route: hand
    it ENSG00000141510 and the build you want. Raises rather than guessing."""
    if dataset not in GENCODE_FOR:
        raise ValueError(f"unknown dataset {dataset}")
    hits = get("reference/gene", {"geneId": query,
                                  "gencodeVersion": GENCODE_FOR[dataset]})["data"]
    q = query.upper()
    exact = [h for h in hits if h["geneSymbolUpper"] == q
             or h["gencodeId"].split(".")[0] == q]
    # A pseudoautosomal gene has a second chrY entry under the same symbol,
    # suffixed _PAR_Y, whose median is 0 in every tissue. Never return it.
    real = [h for h in exact if not h["gencodeId"].endswith("_PAR_Y")]
    if not real:
        raise LookupError(f"{query}: no gene in GENCODE {GENCODE_FOR[dataset]} "
                          f"(HTTP 200 with an empty list, not an error)")
    if len(real) > 1:
        raise LookupError(f"{query}: {len(real)} entries -- "
                          f"{[h['gencodeId'] for h in real]}")
    return real[0]["gencodeId"]


def median_expression(gencode_ids, tissues=None, dataset="gtex_v10"):
    """Median TPM rows, and never a silently truncated page -- see Trap 3."""
    ids = [gencode_ids] if isinstance(gencode_ids, str) else list(gencode_ids)
    p = {"gencodeId": ids, "datasetId": dataset, "itemsPerPage": 100000}
    if tissues:
        p["tissueSiteDetailId"] = list(tissues)
    body = get("expression/medianGeneExpression", p)
    rows, total = body["data"], body["paging_info"]["totalNumberOfItems"]
    assert len(rows) == total, f"page held {len(rows)} of {total} rows"
    return rows


gid = resolve_gene("TP53")
print("resolved      :", gid)
print("from bare id  :", resolve_gene("ENSG00000141510"))
print("v10 rows      :", len(median_expression(gid, ["Heart_Left_Ventricle"])))

# The three ways this silently fails. All are HTTP 200 with data == [].
for bad in ["TP53", "ENSG00000141510", resolve_gene("TP53", "gtex_v8")]:
    rows = median_expression(bad, ["Heart_Left_Ventricle"])
    print(f"{bad:22} -> {len(rows)} rows")

# A pseudoautosomal gene: two exact symbol matches, one of them all zeros.
par = get("reference/gene", {"geneId": "SLC25A6", "gencodeVersion": "v39"})["data"]
print("SLC25A6 entries:", [h["gencodeId"] for h in par])
for h in par:
    med = median_expression(h["gencodeId"])
    print(f"{h['gencodeId']:26} {len(med)} tissues, "
          f"{sum(1 for r in med if r['median'] > 0)} above zero")
```

```
resolved      : ENSG00000141510.18
from bare id  : ENSG00000141510.18
v10 rows      : 1
TP53                   -> 0 rows
ENSG00000141510        -> 0 rows
ENSG00000141510.16     -> 0 rows
SLC25A6 entries: ['ENSG00000169100.14', 'ENSG00000169100.14_PAR_Y']
ENSG00000169100.14         54 tissues, 54 above zero
ENSG00000169100.14_PAR_Y   54 tissues, 0 above zero
```

Consequences worth building around:

- **Never hardcode a versioned id.** `.16` was right for v8, `.18` for v10, `.19` in
  the v11 bulk files. Resolve at run time and record what you resolved.
- **Never cache a resolution across datasets.** Keyed by symbol alone it is wrong for
  one of them.
- **Treat an empty `data` on a gene you believe exists as a resolution bug**, not as
  absence of expression. That is the single highest-value assertion in a GTEx client.
- **A pseudoautosomal gene resolves to two ids and one of them is all zeros.** The 45
  PAR genes — `SLC25A6`, `CD99`, `PLCXD1`, `CSF2RA`, `IL3RA`, `SHOX` and the rest —
  appear in GENCODE twice under the same symbol, as `ENSG00000169100.14` on chrX and
  `ENSG00000169100.14_PAR_Y` on chrY. GTEx assigns every read to the chrX copy, so the
  `_PAR_Y` twin returns **54 rows, one per tissue, unit TPM, every median 0.0**. That
  is a complete, correctly shaped, entirely wrong answer, and the row-count assertion
  in Trap 2 passes on it. Filter `_PAR_Y` out at resolution time, as above. Verified
  against the bulk median file: all 45 `_PAR_Y` rows are zero in all 68 columns.
- **Prefer the Ensembl id over the symbol when migrating between releases.**
  `/reference/gene` accepts a bare `ENSG…` in `geneId` and returns it stamped with the
  build you asked for, which is the clean v8 → v10 route. A *versioned* id from the
  wrong build (`geneId=ENSG00000141510.16&gencodeVersion=v39`) returns `[]` at HTTP 200
  — strip the suffix before you ask.
- Symbol lookup is case-insensitive — `tp53` resolves — but it does **not** resolve
  deprecated aliases, and symbols move between GENCODE builds. `MLL` returns nothing;
  the current symbol `KMT2A` returns `ENSG00000118058.24`. `MARCH1` and `SEPT7` resolve
  in v26 and return nothing in v39, where they are `MARCHF1` and `SEPTIN7` — so a
  symbol-keyed table built against gtex_v8 goes quietly empty against gtex_v10 for
  every gene the HGNC renamed. Normalise symbols upstream, or key on the Ensembl id.
- `/reference/geneSearch` is a prefix search, not an alias resolver. `MLL` returns
  `MLLT1`, `MLLT3`, `MLLT10`, `MLLT11` and friends — never `KMT2A`. Taking `data[0]`
  from it hands you a different gene with no error at all. Use `/reference/gene` and
  match `geneSymbolUpper` exactly, as above.

## Trap 2 — bad values shout, bad parameter names whisper

The API validates enum *values* strictly and ignores unrecognised parameter *names*
entirely. So a mistyped tissue fails loudly and safely, while a mistyped filter name
returns a complete, plausible, wrong answer.

```bash
Q=https://gtexportal.org/api/v2/expression/medianGeneExpression
G=ENSG00000141510.18

# An unknown ENUM VALUE fails loudly -- 422, and the error lists the whole vocabulary.
curl -s -o /dev/null -w "bad tissue value   HTTP %{http_code}\n" \
  "$Q?gencodeId=$G&tissueSiteDetailId=Heart%20-%20Left%20Ventricle"

# An unknown PARAMETER NAME is dropped in silence -- note the plural typo.
curl -s "$Q?gencodeId=$G&tissueSiteDetailIds=Heart_Left_Ventricle" \
| python3 -c "import json,sys; print('typo param name    HTTP 200,', json.load(sys.stdin)['paging_info']['totalNumberOfItems'], 'rows (asked for 1 tissue)')"

# The spelling that works.
curl -s "$Q?gencodeId=$G&tissueSiteDetailId=Heart_Left_Ventricle" \
| python3 -c "import json,sys; print('correct            HTTP 200,', json.load(sys.stdin)['paging_info']['totalNumberOfItems'], 'rows')"
```

```
bad tissue value   HTTP 422
typo param name    HTTP 200, 54 rows (asked for 1 tissue)
correct            HTTP 200, 1 rows
```

Assert on the row count you expected, every time. `54` where you asked for `1` is what
a dropped filter looks like, and it is indistinguishable from a real answer by shape.

## Trap 3 — a complete-looking page can be a partial one

Every endpoint pages, the default page is **250 rows**, and a truncated page is
byte-for-byte a valid answer: `data` is a list, `unit` is `TPM`, nothing is flagged.
The only evidence is `paging_info`, and you have to look.

This is invisible on a single-gene query, because 54 tissues fit in one page. It bites
the moment you ask for more than one gene — and `gencodeId` repeats, so asking for more
than one gene is the obvious thing to do. The cut lands **inside** a gene, not between
two of them, so the casualty is a per-tissue vector that is short by twenty tissues:

```python
import json, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"


def get(path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=120) as fh:
        return json.loads(fh.read())


def get_all(path, params, per_page=25000, cap=200_000):
    """Follow paging_info to exhaustion, then prove nothing was left behind."""
    params = dict(params, itemsPerPage=per_page, page=0)
    first = get(path, params)
    info = first["paging_info"]
    if info["totalNumberOfItems"] > cap:
        raise RuntimeError(f"{info['totalNumberOfItems']} rows exceeds cap {cap}")
    out = list(first["data"])
    for p in range(1, info["numberOfPages"]):
        out += get(path, dict(params, page=p))["data"]
    assert len(out) == info["totalNumberOfItems"], \
        f"collected {len(out)} of {info['totalNumberOfItems']}"
    return out


# Five genes x 54 tissues = 270 rows. The default page is 250.
FIVE = ["ENSG00000141510.18", "ENSG00000164308.17", "ENSG00000229807.13",
        "ENSG00000129824.16", "ENSG00000067048.17"]
naive = get("expression/medianGeneExpression",
            {"gencodeId": FIVE, "datasetId": "gtex_v10"})
per_gene = {g: sum(r["gencodeId"] == g for r in naive["data"]) for g in FIVE}
print("default page :", len(naive["data"]), "rows;", naive["paging_info"])
print("per gene     :", per_gene)

full = get_all("expression/medianGeneExpression",
               {"gencodeId": FIVE, "datasetId": "gtex_v10"})
print("get_all      :", len(full), "rows;",
      {g: sum(r["gencodeId"] == g for r in full) for g in FIVE})
```

```
default page : 250 rows; {'numberOfPages': 2, 'page': 0, 'maxItemsPerPage': 250, 'totalNumberOfItems': 270}
per gene     : {'ENSG00000141510.18': 54, 'ENSG00000164308.17': 54, 'ENSG00000229807.13': 54, 'ENSG00000129824.16': 54, 'ENSG00000067048.17': 34}
get_all      : 270 rows; {'ENSG00000141510.18': 54, 'ENSG00000164308.17': 54, 'ENSG00000229807.13': 54, 'ENSG00000129824.16': 54, 'ENSG00000067048.17': 54}
```

DDX3Y came back with **34 of its 54 tissues** and nothing said so. Rules that fall out
of this, all of them cheap:

- **Never read `data` without reading `paging_info` in the same breath.** `len(data) ==
  totalNumberOfItems` is the assertion; `numberOfPages > 1` is the alarm.
- **A fixed `itemsPerPage` is a guess, and guesses expire.** `itemsPerPage=20000` looks
  generous against the 11,070 eGenes of left ventricle and silently loses 2,694 genes
  against the 22,694 of testis. Page, or assert against the source's own count.
- `itemsPerPage` is honoured up to at least `100000`, so most single-gene work is one
  request — write the loop anyway, because the query that outgrows it is one gene away.
- The one endpoint where `len(data) == totalNumberOfItems` does **not** hold is
  `/expression/geneExpression` under `attributeSubset`, which counts gene x tissue while
  returning one row per subset group. See *Per-sample values and donor age*.

## The tissue vocabulary is a controlled list

`tissueSiteDetailId` is an enum, not free text, and the values are underscore-joined —
`Heart_Left_Ventricle`, not `Heart - Left Ventricle` and not `heart`. The display name
with spaces and a hyphen is a *different field*, `tissueSiteDetail`, and passing it
gets you the 422 above. Enumerate the list rather than typing it:

```python
import json, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"


def get(path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=60) as fh:
        return json.loads(fh.read())


rows = get("dataset/tissueSiteDetail",
           {"datasetId": "gtex_v10", "itemsPerPage": 300})["data"]

print(f"{len(rows)} tissues in gtex_v10\n")
print(f"{'tissueSiteDetailId':38} {'display name':38} {'RNA-seq':>7} {'eQTL':>6}  ontology")
for r in sorted(rows, key=lambda r: r["tissueSiteDetailId"]):
    if not r["tissueSiteDetailId"].startswith(("Heart", "Muscle", "Liver", "Brain_Cortex")):
        continue
    print(f"{r['tissueSiteDetailId']:38} {r['tissueSiteDetail']:38} "
          f"{r['rnaSeqSampleSummary']['totalCount']:>7} "
          f"{r['eqtlSampleSummary']['totalCount']:>6}  {r['ontologyId']}")

# Display name -> id, so you never hand-type an id.
by_name = {r["tissueSiteDetail"]: r["tissueSiteDetailId"] for r in rows}
print("\nlookup:", by_name["Heart - Atrial Appendage"], "|", by_name["Heart - Left Ventricle"])
```

```
54 tissues in gtex_v10

tissueSiteDetailId                     display name                           RNA-seq   eQTL  ontology
Brain_Cortex                           Brain - Cortex                             270    268  UBERON:0001870
Heart_Atrial_Appendage                 Heart - Atrial Appendage                   461    460  UBERON:0006631
Heart_Left_Ventricle                   Heart - Left Ventricle                     452    450  UBERON:0006566
Liver                                  Liver                                      262    261  UBERON:0001114
Muscle_Skeletal                        Muscle - Skeletal                          818    816  UBERON:0011907

lookup: Heart_Atrial_Appendage | Heart_Left_Ventricle
```

Points that matter:

- **The two cardiac identifiers are `Heart_Atrial_Appendage` and
  `Heart_Left_Ventricle`.** GTEx has no single "heart" tissue — a whole-organ question
  has to be asked twice and reported per chamber, because they are not
  interchangeable. For TP53 the atrial appendage median is 1.6x the left ventricle's.
- **The schema enum is wider than any release, so a value can validate and still
  return nothing.** `TissueSiteDetailId` publishes **55** values; `/dataset/tissueSiteDetail`
  returns **54** for `gtex_v8` and the same 54 for `gtex_v10`. The odd one out is
  `Cells_Transformed_fibroblasts`, an older label for the site both current releases call
  `Cells_Cultured_fibroblasts`: it passes enum validation and returns HTTP 200 with
  `data: []` from *either* dataset. Query the tissue list with the same `datasetId` you
  will use for expression and intersect against it, rather than trusting the enum.
  The sample counts behind those 54 ids do move between releases — Bladder goes 21 → 77,
  Kidney_Medulla 4 → 11 — so a per-tissue N read off v8 is wrong for v10.
- **UBERON ontology ids work in place of the GTEx id.** `tissueSiteDetailId=UBERON:0006566`
  returns the same left-ventricle row, which is the cleaner join key when you are
  crossing GTEx with another ontology-annotated resource.
- Sample counts live here too — `rnaSeqSampleSummary` and `eqtlSampleSummary`, each
  with per-sex counts and age range. Use them to sanity-check any sample-level pull.

## Median expression by tissue

The workhorse query. One gene, every tissue, ranked:

```python
import json, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"


def get(path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=60) as fh:
        return json.loads(fh.read())


def median_rows(gencode_ids, dataset="gtex_v10"):
    """Every tissue for every id, or an exception -- never a short answer."""
    ids = [gencode_ids] if isinstance(gencode_ids, str) else list(gencode_ids)
    body = get("expression/medianGeneExpression",
               {"gencodeId": ids, "datasetId": dataset, "itemsPerPage": 100000})
    rows, total = body["data"], body["paging_info"]["totalNumberOfItems"]
    assert len(rows) == total, f"page held {len(rows)} of {total} rows"
    n_tissues = len(get("dataset/tissueSiteDetail",
                        {"datasetId": dataset, "itemsPerPage": 300})["data"])
    per_gene = {g: sum(r["gencodeId"] == g for r in rows) for g in ids}
    short = {g: n for g, n in per_gene.items() if n != n_tissues}
    assert not short, f"{short} != {n_tissues} tissues each"
    return rows


GID = "ENSG00000141510.18"          # TP53, GENCODE v39 / gtex_v10
rows = median_rows(GID)

rows.sort(key=lambda r: r["median"], reverse=True)
print(f"{len(rows)} tissues, unit {rows[0]['unit']}\n")
for r in rows[:5]:
    print(f"  {r['tissueSiteDetailId']:40} {r['median']:9.4f}")
print("  ...")
for r in rows[-3:]:
    print(f"  {r['tissueSiteDetailId']:40} {r['median']:9.4f}")

rank = {r["tissueSiteDetailId"]: i + 1 for i, r in enumerate(rows)}
for t in ("Heart_Atrial_Appendage", "Heart_Left_Ventricle"):
    m = next(r["median"] for r in rows if r["tissueSiteDetailId"] == t)
    print(f"\n{t:24} {m:8.4f} TPM   rank {rank[t]}/{len(rows)}")
```

```
54 tissues, unit TPM

  Cells_EBV-transformed_lymphocytes          77.4845
  Skin_Sun_Exposed_Lower_leg                 37.4491
  Skin_Not_Sun_Exposed_Suprapubic            35.3415
  Cells_Cultured_fibroblasts                 33.3962
  Ovary                                      33.0791
  ...
  Brain_Hippocampus                           2.8814
  Brain_Cerebellum                            2.4878
  Brain_Cerebellar_Hemisphere                 2.0405

Heart_Atrial_Appendage     5.9431 TPM   rank 39/54
Heart_Left_Ventricle       3.7304 TPM   rank 46/54
```

Read the `unit` field rather than assuming it. v8 and v10 report TPM; the v6 and
earlier files are RPKM, and a plot mixing them is wrong without saying so.

**Zeros are returned, not dropped** — this endpoint gives you the whole release's tissue
list every time. `DEFB126` comes back as 54 rows of which 53 are `0.0`, `SRY` as 54 with
51 zeros, `PRM1` as 54 with 13. So a vector shorter than the tissue table is never
"the gene is off there"; it is a truncated page or a resolution miss. `median_rows`
above turns that into an exception rather than a silent gap.

Two interpretation cautions:

- **Two of the top four "tissues" are cell lines.** `Cells_EBV-transformed_lymphocytes`
  and `Cells_Cultured_fibroblasts` are cultured, not post-mortem tissue, and they
  routinely top proliferation-linked genes. Exclude them before claiming a tissue with
  the highest expression.
- **A tissue median is a median across donors, not a per-donor value**, and TPM is
  within-sample normalised. Ranking tissues for one gene is sound; comparing two genes'
  absolute TPM across tissues with very different composition is much weaker, because
  the denominator is the tissue's own transcriptome.

## Per-sample values and donor age

`/expression/geneExpression` returns the individual sample TPMs, not just the median,
and `attributeSubset` splits them by a donor attribute. Only two values are accepted —
`sex` and `ageBracket`.

```python
import json, statistics, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"
GID = "ENSG00000141510.18"                       # TP53 in GENCODE v39
TISSUES = ["Heart_Left_Ventricle", "Kidney_Medulla"]


def get(path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=90) as fh:
        return json.loads(fh.read())


rows = get("expression/geneExpression",
           {"gencodeId": GID, "datasetId": "gtex_v10",
            "tissueSiteDetailId": TISSUES, "attributeSubset": "ageBracket"})["data"]

# One row per (tissue, bracket); row["data"] is the per-sample TPM vector.
# A bracket with no donors is returned with an EMPTY vector, not dropped --
# statistics.median raises on it and quantiles needs two points.
for tissue in TISSUES:
    groups = sorted((r for r in rows if r["tissueSiteDetailId"] == tissue),
                    key=lambda r: r["subsetGroup"])
    n = sum(len(g["data"]) for g in groups)
    print(f"\n{tissue}  n={n} samples over {len(groups)} brackets")
    for g in groups:
        v = g["data"]
        if len(v) < 2:
            print(f"  {g['subsetGroup']:6} n={len(v):4}  "
                  f"{'no donors' if not v else f'single donor {v[0]:.3f}'}")
            continue
        q = statistics.quantiles(v, n=4)
        print(f"  {g['subsetGroup']:6} n={len(v):4}  median {statistics.median(v):7.3f} "
              f"IQR {q[0]:6.3f}-{q[2]:6.3f}")

# Cross-check the sample counts against the tissue table -- if these disagree,
# the subset call dropped samples and any age trend you fit is on partial data.
meta = {r["tissueSiteDetailId"]: r["rnaSeqSampleSummary"]["totalCount"]
        for r in get("dataset/tissueSiteDetail",
                     {"datasetId": "gtex_v10", "itemsPerPage": 300})["data"]}
print()
for tissue in TISSUES:
    got = sum(len(r["data"]) for r in rows if r["tissueSiteDetailId"] == tissue)
    print(f"{tissue:24} subset sum {got:4} vs tissue table {meta[tissue]:4} "
          f"{'OK' if got == meta[tissue] else 'MISMATCH'}")
```

```
Heart_Left_Ventricle  n=452 samples over 6 brackets
  20-29  n=  20  median   5.480 IQR  3.540- 6.370
  30-39  n=  25  median   3.551 IQR  3.065- 4.152
  40-49  n=  67  median   4.391 IQR  2.981- 5.593
  50-59  n= 159  median   3.778 IQR  2.859- 4.916
  60-69  n= 167  median   3.497 IQR  2.489- 4.635
  70-79  n=  14  median   3.162 IQR  2.050- 5.980

Kidney_Medulla  n=11 samples over 6 brackets
  20-29  n=   3  median  15.938 IQR 13.222-17.807
  30-39  n=   2  median  11.617 IQR 10.358-12.875
  40-49  n=   0  no donors
  50-59  n=   4  median  11.312 IQR  9.924-12.931
  60-69  n=   2  median   5.776 IQR  2.914- 8.638
  70-79  n=   0  no donors

Heart_Left_Ventricle     subset sum  452 vs tissue table  452 OK
Kidney_Medulla           subset sum   11 vs tissue table   11 OK
```

Five things to know before you model an age effect on this:

- **`paging_info` lies under `attributeSubset`.** That call reports
  `totalNumberOfItems: 2` — one per gene x tissue — while `data` holds 12 rows, one
  per bracket. Code asserting `len(data) == totalNumberOfItems` breaks here and only
  here; assert on `numberOfPages` instead.
- **Empty subset groups are returned, not omitted, and they will crash a naive loop.**
  `statistics.median([])` raises, and `statistics.quantiles` needs two points. Four of
  the 54 tissues have at least one empty age bracket — Kidney_Medulla is missing 40-49
  and 70-79, Cervix_Ectocervix, Cervix_Endocervix and Fallopian_Tube are missing 70-79
  — and under `attributeSubset=sex` **eight** tissues return one group with `n=0`,
  because Uterus, Ovary, Vagina, Fallopian_Tube and both cervix sites have no male
  donors and Prostate and Testis have no female ones. Guard on `len(v)` before you
  summarise, as above. The empty group is honest bookkeeping, not a fault — the sums
  still reconcile with `rnaSeqSampleSummary.totalCount`.
- **The vectors are unlabelled.** There is no sample or donor id alongside the TPM
  values, so this endpoint cannot support a regression with covariates beyond the one
  you subset on, and it cannot pair a donor's two heart samples. For that, take the
  per-tissue matrices and the sample table — see *Get the files*.
- **Age is a 10-year bracket, and that is a design property, not a limitation of the
  API.** Exact ages are protected. Bracketed age is usable as an ordinal covariate or
  a bracket midpoint; it is not usable for anything needing age resolution finer than
  a decade, and the brackets are badly unbalanced — of the 913 samples across the two
  heart tissues, 673 sit in 50-69, 77 in 20-39 and 33 in 70-79.
- **The tail brackets are thin and the cohort is post-mortem.** Donors died; cause of
  death is captured as the Hardy scale and it correlates with both age and RNA
  quality. Any age model that omits Hardy scale, ischemic time and RIN is fitting
  agonal state as much as ageing.

## eQTLs, eGenes, and paging

`/association/singleTissueEqtl` returns the **significant** cis-eQTLs for a gene in a
tissue — not all tested variants — with `pValue` and `nes`, the normalised effect size
of the alternate allele. Result sets routinely exceed one page, and a page never
announces itself as partial:

```python
import json, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"


def get(path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=90) as fh:
        return json.loads(fh.read())


def get_all(path, params, per_page=1000, cap=100_000):
    """Follow paging_info to exhaustion. Refuses to guess -- if the server
    reports more pages than `cap` allows, it raises instead of truncating."""
    params = dict(params, itemsPerPage=per_page, page=0)
    first = get(path, params)
    info = first["paging_info"]
    total, pages = info["totalNumberOfItems"], info["numberOfPages"]
    if total > cap:
        raise RuntimeError(f"{total} rows exceeds cap {cap} -- narrow the query")
    out = list(first["data"])
    for p in range(1, pages):
        out += get(path, dict(params, page=p))["data"]
    assert len(out) == total, f"collected {len(out)} of {total}"
    return out, info


ERAP2 = "ENSG00000164308.17"          # strong, well-known eQTL gene
one = get("association/singleTissueEqtl",
          {"gencodeId": ERAP2, "tissueSiteDetailId": "Heart_Left_Ventricle",
           "datasetId": "gtex_v10"})
print("default page  :", len(one["data"]), "rows;", one["paging_info"])

rows, info = get_all("association/singleTissueEqtl",
                     {"gencodeId": ERAP2,
                      "tissueSiteDetailId": "Heart_Left_Ventricle",
                      "datasetId": "gtex_v10"})
print("all pages     :", len(rows), "rows")

rows.sort(key=lambda r: r["pValue"])
print(f"\n{'variantId':28} {'rsId':14} {'pValue':>11} {'NES':>7}")
for r in rows[:3]:
    print(f"{r['variantId']:28} {r['snpId']:14} {r['pValue']:11.3e} {r['nes']:7.3f}")
```

```
default page  : 250 rows; {'numberOfPages': 4, 'page': 0, 'maxItemsPerPage': 250, 'totalNumberOfItems': 751}
all pages     : 751 rows

variantId                    rsId                pValue     NES
chr5_96916728_G_A_b38        rs2927608       1.341e-158   1.077
chr5_96916885_T_C_b38        rs2910686       1.342e-158   1.077
chr5_96936716_T_G_b38        rs2548224       7.727e-144   1.065
```

`paging_info` carries `page`, `numberOfPages`, `maxItemsPerPage` and
`totalNumberOfItems`. `itemsPerPage` accepts up to 100000, so most single-gene queries
fit in one request — but write the loop anyway, because the same code hits
31,337 rows the moment you drop the tissue filter on this gene.

**`/association/egene` silently ignores `gencodeId`.** It accepts only
`tissueSiteDetailId`, `datasetId`, `page` and `itemsPerPage`, so a gene filter is
dropped by the Trap 2 mechanism and you get every eGene in the tissue with a
completely unrelated gene sitting at `data[0]`. Pull the tissue and filter locally:

```python
import json, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"


def get(path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=120) as fh:
        return json.loads(fh.read())


def get_all(path, params, per_page=25000):
    """Follow paging_info to exhaustion, then prove nothing was left behind."""
    params = dict(params, itemsPerPage=per_page, page=0)
    first = get(path, params)
    info = first["paging_info"]
    out = list(first["data"])
    for p in range(1, info["numberOfPages"]):
        out += get(path, dict(params, page=p))["data"]
    assert len(out) == info["totalNumberOfItems"], \
        f"collected {len(out)} of {info['totalNumberOfItems']}"
    return out


ERAP2 = "ENSG00000164308.17"

# /association/egene takes tissueSiteDetailId and datasetId ONLY. A gencodeId
# here is silently dropped and you get every eGene in the tissue.
naive = get("association/egene", {"gencodeId": ERAP2,
                                  "tissueSiteDetailId": "Heart_Left_Ventricle",
                                  "datasetId": "gtex_v10", "itemsPerPage": 1})
print("gencodeId 'filter' :", naive["paging_info"]["totalNumberOfItems"], "rows;",
      "first row is", naive["data"][0]["geneSymbol"])

# Pull each tissue's eGene table in full and filter locally, checking the row
# count against eGeneCount from the tissue table.
tissues = {r["tissueSiteDetailId"]: r["eGeneCount"]
           for r in get("dataset/tissueSiteDetail",
                        {"datasetId": "gtex_v10", "itemsPerPage": 300})["data"]}
for tissue in ("Heart_Left_Ventricle", "Testis"):
    egenes = get_all("association/egene",
                     {"tissueSiteDetailId": tissue, "datasetId": "gtex_v10"})
    assert len(egenes) == tissues[tissue], (len(egenes), tissues[tissue])
    hit = next((e for e in egenes if e["gencodeId"] == ERAP2), None)
    print(f"\n{tissue}")
    print(f"  eGenes in tissue : {len(egenes)} (table says {tissues[tissue]})")
    print(f"  ERAP2 is an eGene: {hit is not None}")
    if hit:
        print(f"    qValue {hit['qValue']:.3e}  empiricalP {hit['empiricalPValue']:.3e} "
              f"log2 aFC {hit['log2AllelicFoldChange']:.3f} "
              f"threshold {hit['pValueThreshold']:.3e}")

# The counter-example: one request with a fixed cap under the true total.
short = get("association/egene", {"tissueSiteDetailId": "Testis",
                                  "datasetId": "gtex_v10", "itemsPerPage": 20000})
print(f"\nTestis at itemsPerPage=20000: {len(short['data'])} rows of "
      f"{short['paging_info']['totalNumberOfItems']}, "
      f"{short['paging_info']['numberOfPages']} pages")
```

```
gencodeId 'filter' : 11070 rows; first row is WASH7P

Heart_Left_Ventricle
  eGenes in tissue : 11070 (table says 11070)
  ERAP2 is an eGene: True
    qValue 8.312e-137  empiricalP 4.575e-140 log2 aFC 3.198 threshold 1.540e-04

Testis
  eGenes in tissue : 22694 (table says 22694)
  ERAP2 is an eGene: True
    qValue 1.294e-103  empiricalP 7.219e-106 log2 aFC 1.888 threshold 2.226e-04

Testis at itemsPerPage=20000: 20000 rows of 22694, 2 pages
```

The unfiltered count matches `eGeneCount` in the tissue table exactly, which is how you
prove the filter was dropped rather than merely unhelpful. Sanity-check any per-gene
association result against that field — and note the last line, which is Trap 3 in this
endpoint: a single request capped at 20,000 covers left ventricle's 11,070 eGenes and
loses 2,694 of testis's 22,694. The table comes back in genomic order, so the cut
discards the tail of the genome — everything past chr19:37.9 Mb, `A1BG` and `ABCB7`
included — and "is my gene an eGene here" then answers `False` for genes that are.
Four tissues — Kidney_Medulla, Cervix_Ectocervix, Cervix_Endocervix, Fallopian_Tube —
have no eQTL analysis at all, and report `eGeneCount: null`, `hasEGenes: false` and zero
rows from both association endpoints; that is *not tested*, not *not significant*.

Interpreting the numbers: `nes` on `singleTissueEqtl` is the effect of the alternate
allele on normalised expression, signed, and only comparable within a tissue.
`pValueThreshold` on the eGene record is the gene-level permutation threshold — a
variant's nominal p-value below it is what made the gene an eGene. An eQTL is a
statistical association in a cis window; it is not evidence that the variant causes
the expression change, and colocalisation is a separate analysis.

## Get the files

Everything above prints. This writes, because a target dossier, a figure or a model
needs files.

**Route A — the API, for one gene.** Median TPM in every tissue, per-sample values
grouped by age bracket, and the significant eQTLs, plus a manifest recording the
release and GENCODE build the numbers came from. Medians move between releases; a
directory of TSVs with no version stamp cannot be compared against a later pull.

```python
import csv, datetime, json, os, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"
GENCODE_FOR = {"gtex_v8": "v26", "gtex_v10": "v39"}

SYMBOL = "TP53"
DATASET = "gtex_v10"
TISSUES = ["Heart_Atrial_Appendage", "Heart_Left_Ventricle"]
OUT = "Data/gtex"


def get(path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=120) as fh:
        return url, json.loads(fh.read())


def get_all(path, params, per_page=2000):
    params = dict(params, itemsPerPage=per_page, page=0)
    url, first = get(path, params)
    total, pages = (first["paging_info"]["totalNumberOfItems"],
                    first["paging_info"]["numberOfPages"])
    rows = list(first["data"])
    for p in range(1, pages):
        rows += get(path, dict(params, page=p))[1]["data"]
    assert len(rows) == total, f"{path}: collected {len(rows)} of {total}"
    return url, rows


def write_tsv(path, rows, cols):
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, delimiter="\t",
                           extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return {"path": path, "rows": len(rows), "bytes": os.path.getsize(path)}


os.makedirs(OUT, exist_ok=True)
files, sources = [], {}

# 1. Resolve the symbol against the GENCODE build this dataset uses, dropping
#    the all-zero chrY copy that pseudoautosomal genes carry.
url, res = get("reference/gene", {"geneId": SYMBOL,
                                  "gencodeVersion": GENCODE_FOR[DATASET]})
exact = [g for g in res["data"] if g["geneSymbolUpper"] == SYMBOL.upper()
         and not g["gencodeId"].endswith("_PAR_Y")]
if len(exact) != 1:
    raise LookupError(f"{SYMBOL}: {len(exact)} exact hits in "
                      f"GENCODE {GENCODE_FOR[DATASET]}")
gene = exact[0]
sources["reference/gene"] = url
print("gencodeId:", gene["gencodeId"])

# 2. Median TPM in every tissue.
url, med = get_all("expression/medianGeneExpression",
                   {"gencodeId": gene["gencodeId"], "datasetId": DATASET})
sources["expression/medianGeneExpression"] = url
files.append(write_tsv(f"{OUT}/{SYMBOL}_median_tpm_by_tissue.tsv",
                       sorted(med, key=lambda r: -r["median"]),
                       ["gencodeId", "geneSymbol", "tissueSiteDetailId",
                        "ontologyId", "median", "unit", "datasetId"]))

# 3. Per-sample TPM grouped by donor age bracket, for the chosen tissues.
url, expr = get("expression/geneExpression",
                {"gencodeId": gene["gencodeId"], "datasetId": DATASET,
                 "tissueSiteDetailId": TISSUES, "attributeSubset": "ageBracket"})
sources["expression/geneExpression"] = url
long_rows = [{"gencodeId": gene["gencodeId"], "geneSymbol": SYMBOL,
              "tissueSiteDetailId": g["tissueSiteDetailId"],
              "ageBracket": g["subsetGroup"], "sampleIndex": i,
              "tpm": v, "unit": g["unit"], "datasetId": g["datasetId"]}
             for g in expr["data"] for i, v in enumerate(g["data"])]
files.append(write_tsv(f"{OUT}/{SYMBOL}_sample_tpm_by_age_bracket.tsv", long_rows,
                       ["gencodeId", "geneSymbol", "tissueSiteDetailId",
                        "ageBracket", "sampleIndex", "tpm", "unit", "datasetId"]))

# 4. Significant cis-eQTLs in the chosen tissues.
url, eqtl = get_all("association/singleTissueEqtl",
                    {"gencodeId": gene["gencodeId"], "datasetId": DATASET,
                     "tissueSiteDetailId": TISSUES})
sources["association/singleTissueEqtl"] = url
files.append(write_tsv(f"{OUT}/{SYMBOL}_single_tissue_eqtl.tsv",
                       sorted(eqtl, key=lambda r: r["pValue"]),
                       ["gencodeId", "geneSymbol", "tissueSiteDetailId",
                        "variantId", "snpId", "chromosome", "pos",
                        "pValue", "nes", "datasetId"]))

# 5. Stamp what the numbers came from.
manifest = {
    "retrieved": datetime.date.today().isoformat(),
    "api": BASE,
    "datasetId": DATASET,
    "gencodeVersion": GENCODE_FOR[DATASET],
    "geneSymbol": SYMBOL,
    "gencodeId": gene["gencodeId"],
    "genomeBuild": gene["genomeBuild"],
    "tissueSiteDetailId": TISSUES,
    "sources": sources,
    "files": files,
}
mpath = f"{OUT}/{SYMBOL}_manifest.json"
with open(mpath, "w") as fh:
    json.dump(manifest, fh, indent=2)

for f in files:
    print(f"  {f['rows']:>6} rows  {f['bytes']:>9,} B  {f['path']}")
print(f"  {'':>6}        {os.path.getsize(mpath):>9,} B  {mpath}")
```

```
gencodeId: ENSG00000141510.18
      54 rows      4,341 B  Data/gtex/TP53_median_tpm_by_tissue.tsv
     913 rows     70,451 B  Data/gtex/TP53_sample_tpm_by_age_bracket.tsv
       9 rows      1,405 B  Data/gtex/TP53_single_tissue_eqtl.tsv
                    1,452 B  Data/gtex/TP53_manifest.json
```

**Route B — the sample-level design matrix.** When you need a real model rather than
bracket summaries, `/dataset/sample` gives an open covariate row per sample, and the
per-tissue bulk matrices are keyed by the same `sampleId`. This lands the covariates
and proves the join before anyone downloads 50 MB:

```python
import csv, gzip, io, json, os, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"
BUCKET = "https://storage.googleapis.com/adult-gtex"
TISSUES = {"Heart_Atrial_Appendage": "heart_atrial_appendage",
           "Heart_Left_Ventricle": "heart_left_ventricle"}
OUT = "Data/gtex"
os.makedirs(OUT, exist_ok=True)

COLS = ["sampleId", "subjectId", "tissueSiteDetailId", "dataType", "sex",
        "ageBracket", "hardyScale", "rin", "ischemicTime", "autolysisScore"]


def get_all(path, params, per_page=2000):
    params = dict(params, itemsPerPage=per_page, page=0)
    rows, pages = [], 1
    p = 0
    while p < pages:
        url = f"{BASE}/{path}?" + urllib.parse.urlencode(dict(params, page=p), doseq=True)
        with urllib.request.urlopen(url, timeout=120) as fh:
            body = json.loads(fh.read())
        pages = body["paging_info"]["numberOfPages"]
        rows += body["data"]
        p += 1
    assert len(rows) == body["paging_info"]["totalNumberOfItems"]
    return rows


# /dataset/sample lists EVERY aliquot, genotyping included. Keep RNASEQ only or
# the covariate table has more rows than the expression matrix has columns.
samples = get_all("dataset/sample", {"datasetId": "gtex_v10",
                                     "tissueSiteDetailId": list(TISSUES)})
rna = [s for s in samples if s["dataType"] == "RNASEQ"]
print(f"aliquots {len(samples)} -> RNASEQ {len(rna)}")

dest = f"{OUT}/heart_rnaseq_sample_covariates.tsv"
with open(dest, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=COLS, delimiter="\t", extrasaction="ignore")
    w.writeheader()
    w.writerows(sorted(rna, key=lambda s: (s["tissueSiteDetailId"], s["sampleId"])))
print(f"{len(rna)} rows  {os.path.getsize(dest):,} B  {dest}")

# The per-tissue TPM matrix is keyed by these same sampleIds. Read only its
# header -- streaming the gzip stops after a few KB of a 50 MB file.
for tid, slug in TISSUES.items():
    url = f"{BUCKET}/bulk-gex/v10/rna-seq/tpms-by-tissue/gene_tpm_v10_{slug}.gct.gz"
    req = urllib.request.Request(url, headers={"Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        txt = io.TextIOWrapper(gzip.GzipFile(fileobj=resp), encoding="utf-8")
        txt.readline()
        n_genes, n_cols = (int(x) for x in txt.readline().split())
        cols = txt.readline().rstrip("\n").split("\t")[2:]
    want = {s["sampleId"] for s in rna if s["tissueSiteDetailId"] == tid}
    print(f"{tid:23} matrix {n_genes:,} x {n_cols}  covariates {len(want)}  "
          f"unmatched {len(want - set(cols))}")
```

```
aliquots 1970 -> RNASEQ 913
913 rows  100,135 B  Data/gtex/heart_rnaseq_sample_covariates.tsv
Heart_Atrial_Appendage  matrix 59,033 x 461  covariates 461  unmatched 0
Heart_Left_Ventricle    matrix 59,033 x 452  covariates 452  unmatched 0
```

Drop the `Accept-Encoding` header and the streaming trick and you have the full
matrix — `gene_tpm_v10_heart_left_ventricle.gct.gz` is 51 MB, its atrial counterpart
55 MB. **Two counts to get right before modelling:** those 913 samples come from 573
distinct donors, 340 of whom gave both chambers, so chamber is a within-donor factor
for most of the cohort and samples are not independent. And `/dataset/sample` returned
1,970 aliquots for the same two tissues because it lists every aliquot of every assay —
`RNASEQ`, `SMLRNA`, `WGS`, `DEEPWGS`, `WES`, `OMNI` and `EXCLUDE` for the ones that
failed QC. Filtering on `dataType == "RNASEQ"` is what makes the row count match the
matrix, and it holds across tissues: checked against `rnaSeqSampleSummary.totalCount`
for eight of them, from Kidney_Medulla's 11 to Muscle_Skeletal's 818, it matched every
time. The bulk filename is the `tissueSiteDetailId` lower-cased, for all 54.

**Route C — the bulk store, for whole matrices.** Everything on the portal's download
page lives in a public Google Cloud bucket readable over plain HTTPS at
`https://storage.googleapis.com/adult-gtex/…`; `/api/v2/dataset/openAccessFilesMetadata?project_id=adult-gtex`
returns the tree of `gs://` paths, which map to that prefix one-for-one. No client
library and no credentials.

```python
import collections, gzip, hashlib, json, os, urllib.request

BUCKET = "https://storage.googleapis.com/adult-gtex"
WANT = {
    "median TPM, every gene x every tissue":
        f"{BUCKET}/bulk-gex/v10/rna-seq/GTEx_Analysis_v10_RNASeQCv2.4.2_gene_median_tpm.gct.gz",
    "subject phenotypes -- open tier: sex, age BRACKET, Hardy scale":
        f"{BUCKET}/annotations/v10/metadata-files/GTEx_Analysis_v10_Annotations_SubjectPhenotypesDS.txt",
}
OUT = "Data/gtex/bulk"
os.makedirs(OUT, exist_ok=True)

manifest = []
for label, url in WANT.items():
    dest = os.path.join(OUT, url.rsplit("/", 1)[1])
    urllib.request.urlretrieve(url, dest)
    with open(dest, "rb") as fh:
        md5 = hashlib.md5(fh.read()).hexdigest()
    manifest.append({"label": label, "url": url, "path": dest,
                     "bytes": os.path.getsize(dest), "md5": md5})
    print(f"{os.path.getsize(dest):>12,} B  md5 {md5[:12]}  {dest}")
with open(f"{OUT}/manifest.json", "w") as fh:
    json.dump(manifest, fh, indent=2)

# GCT layout: line 1 is the format version, line 2 is "<n_genes>\t<n_data_columns>"
# and counts DATA columns only, then the real header. Two id columns precede the
# data, so header length is n_data_columns + 2 -- assuming 3 (the GCT spec allows
# an extra id column) shifts every tissue by one.
#
# Key on Name (the versioned GENCODE id), not Description: Name is unique but
# 96 symbols occupy two rows, every pseudoautosomal gene among them.
WANT_IDS = {"ENSG00000141510.18": "TP53",
            "ENSG00000169100.14": "SLC25A6",
            "ENSG00000169100.14_PAR_Y": "SLC25A6 chrY copy"}
SHOW = ("Heart_Atrial_Appendage", "Heart_Left_Ventricle")

gct = manifest[0]["path"]
with gzip.open(gct, "rt") as fh:
    fh.readline()
    n_genes, n_cols = (int(x) for x in fh.readline().split())
    header = fh.readline().rstrip("\n").split("\t")
    assert len(header) == n_cols + 2, (len(header), n_cols)
    tissues = header[2:]
    per_symbol, hits = collections.Counter(), {}
    for line in fh:
        f = line.rstrip("\n").split("\t")
        per_symbol[f[1]] += 1
        if f[0] in WANT_IDS:
            hits[f[0]] = dict(zip(tissues, (float(v) for v in f[2:])))
assert sum(per_symbol.values()) == n_genes, (sum(per_symbol.values()), n_genes)
assert set(hits) == set(WANT_IDS), sorted(set(WANT_IDS) - set(hits))

print(f"\n{n_genes:,} genes x {len(tissues)} columns; id cols {header[:2]}")
print("symbols on two or more rows:", sum(1 for v in per_symbol.values() if v > 1))
for gid, label in WANT_IDS.items():
    print(f"  {label:18} {gid:26} " +
          "  ".join(f"{t} {hits[gid][t]}" for t in SHOW))
```

```
   8,846,936 B  md5 13dfdd0cb73c  Data/gtex/bulk/GTEx_Analysis_v10_RNASeQCv2.4.2_gene_median_tpm.gct.gz
      20,292 B  md5 ffa15a680855  Data/gtex/bulk/GTEx_Analysis_v10_Annotations_SubjectPhenotypesDS.txt

59,033 genes x 68 columns; id cols ['Name', 'Description']
symbols on two or more rows: 96
  TP53               ENSG00000141510.18         Heart_Atrial_Appendage 5.94307  Heart_Left_Ventricle 3.73045
  SLC25A6            ENSG00000169100.14         Heart_Atrial_Appendage 246.698  Heart_Left_Ventricle 159.697
  SLC25A6 chrY copy  ENSG00000169100.14_PAR_Y   Heart_Atrial_Appendage 0.0  Heart_Left_Ventricle 0.0
```

The GCT medians match the API to the last digit, which is the cross-check that the two
routes are the same numbers. Two differences to expect between them:

- **68 columns, not 54.** The bulk median file adds 14 histology-subdissected sites
  the API's tissue enum has no value for — `Liver_Hepatocyte`, `Liver_Portal_Tract`,
  `Pancreas_Islets`, `Pancreas_Acini`, `Stomach_Mucosa`, `Stomach_Muscularis`,
  `Colon_Transverse_Muscularis` and similar. Only reachable through the files.
- **The bucket is ahead of the API.** A **v11** release is already published there
  (`GTEx_Analysis_2025-08-22_v11_RNASeQCv2.4.3_gene_median_tpm.gct.gz`, 74,628 genes in
  the same 68 columns, TP53 as `ENSG00000141510.19`) while the API's `datasetId` enum
  still holds only `gtex_v8`, `gtex_v10` and `gtex_snrnaseq_pilot`. Re-resolve every
  identifier for that build, and expect the numbers to move: TP53's left-ventricle
  median is 3.67865 TPM in v8, 3.73045 in v10 and 2.69388 in the v11 file. The v11
  directory also carries a second, later drop stamped `2026-05-19` alongside the
  original — read the date in the filename rather than assuming one v11.

## Requesting access

**Read this section for triage, then most likely stop.** The controlled tier is
individual-level **genotype and sequence** — WGS, WES, genotyping arrays, per-sample
RNA-seq reads — plus phenotype detail finer than the open tables carry. Everything in
this skill above runs without it. If your question is expression versus tissue, sex,
or age bracket, applying would cost months and change nothing.

Where it is genuinely required: you need a donor's alleles. Running your own QTL scan,
allele-specific expression, a colocalisation using individual genotypes, a
transcriptome-imputation model trained on GTEx, or re-quantifying reads with a
different pipeline. Two things to check before applying:

- **The consent, not the paperwork, is the real constraint** — and here it is unusually
  permissive. The dbGaP study record states that GTEx releases from version 5 onward
  follow the NIH Genomic Data Sharing Policy, "whereby there are no restrictions on use
  or publication after release". So a disease-specific consent limit is not what will
  stop you. Verify the current data use limitation on the study page yourself, because
  it is the authoritative statement and it can change.
- **Check that the assay exists.** GTEx is bulk RNA-seq plus genotype on post-mortem
  tissue. It is not a single-cell atlas at scale, not longitudinal, and not disease
  cohorts. No approval creates data that was never generated.

The study is **`phs000424`** in dbGaP — `phs000424.v11.p2` with 983 consented subjects
as of 2026-08-17 — and is also made available for cloud analysis through the NIH AnVIL
platform. Applying, in outline:

1. The applicant is a **PI or equivalent investigator at a research institution**, with
   an eRA Commons or equivalent NIH login. Students and postdocs are named on a PI's
   request rather than filing their own.
2. The request is **institutional**. It must be co-signed by your Institutional Signing
   Official, who commits the institution to the Data Use Certification. Collaborators
   at other institutions file their own requests referencing the same project title,
   and a company under contract counts as a separate institution.
3. The request itself asks for a project title, a **Research Use Statement** describing
   what you will do with the data, a **Cloud Use Statement** if you will analyse it in
   a cloud environment, the named investigators and IT staff at your institution who
   will have access, and agreement to the study's Data Use Certification.
4. The study's **NIH Data Access Committee** decides. Plan in weeks, not days, with
   institutional signature usually the slow step.
5. Approval is **time-limited** and expires unless renewed, with a closeout obligation
   at the end. The exact term and the renewal mechanics are stated in the Data Use
   Certification and on the study page — read them there rather than assuming.

**This skill cannot obtain access and does not promise it.** No code here reaches the
controlled tier, and there is no route through the open API to individual-level data.

What an agent may usefully do: assemble the checklist, draft and redraft the Research
Use Statement, explain what an Institutional Signing Official is and why the request
cannot proceed without one, and verify — using the open endpoints above — that GTEx
actually contains the tissue, assay and sample size the project needs, before anyone
starts the paperwork.

What an agent must not do: **fill in the attestations.** IRB determinations, data
security assurances, and non-re-identification commitments are legal claims published
under a named person's name and their institution's. They are for the applicant and the
Signing Official to make. Draft the science; leave the attestations blank.

## Limits worth stating in a write-up

- **Bulk tissue, so composition confounds everything.** A tissue-level TPM difference
  can be a cell-type proportion difference. Left ventricle and atrial appendage differ
  in cardiomyocyte, fibroblast and adipocyte content before any gene is considered.
- **Post-mortem, with agonal state baked in.** Hardy scale, ischemic time, RIN and
  autolysis score are published precisely because they matter. They correlate with age
  and with each other.
- **Cross-sectional.** No individual is sampled twice in time, so age effects are
  between-donor comparisons and cohort effects cannot be separated from ageing.
- **Adults only, and unbalanced.** The design is adult donors; ages 20-79 with the
  extremes thin. Developmental GTEx is a separate programme with its own data.
- **The donor population is not demographically representative**, and expression
  differences between groups in a convenience post-mortem cohort should not be reported
  as population differences.
- **The cell-line entries are cell lines.** `Cells_Cultured_fibroblasts` and
  `Cells_EBV-transformed_lymphocytes` sit in the same tissue list as real tissue and
  behave nothing like it.
- **`singleTissueEqtl` returns only significant associations.** Absence of a row means
  "not significant in this tissue at this sample size", not "no effect" — and power
  tracks the tissue's sample count, which in `gtex_v10` runs from 11 (Kidney_Medulla)
  to 818 (Muscle_Skeletal). Four tissues were not QTL-mapped at all, so for those it
  does not even mean "not significant"; check `hasEGenes` before you interpret a zero.
- **Version everything you report.** Release, GENCODE build, genome build, unit. TP53's
  median in left ventricle is 3.67865 TPM in v8 and 3.73045 in v10; unlabelled, those
  read as a finding.

## Try it

A self-contained check that this skill still works. Public data, no account, no key,
Python standard library only.

**Data** — the GTEx Portal v2 API, `gtex_v10` release, reached through five endpoints:

    https://gtexportal.org/api/v2/reference/gene?geneId=TP53&gencodeVersion=v39
    https://gtexportal.org/api/v2/expression/medianGeneExpression?gencodeId=ENSG00000141510.18&datasetId=gtex_v10
    https://gtexportal.org/api/v2/dataset/tissueSiteDetail?datasetId=gtex_v10&itemsPerPage=300
    https://gtexportal.org/api/v2/expression/geneExpression?gencodeId=ENSG00000141510.18&datasetId=gtex_v10&tissueSiteDetailId=Kidney_Medulla&attributeSubset=ageBracket
    https://gtexportal.org/api/v2/association/egene?tissueSiteDetailId=Testis&datasetId=gtex_v10&itemsPerPage=20000

GTEx open-access data needs no account or licence acceptance, and the dbGaP study record
states that releases from v5 onward carry no restrictions on use or publication. TP53 is
used because it is expressed in every tissue and its GENCODE version suffix has moved in
each of the last three releases, which is what makes it a good probe for the trap. ERAP2
(`ENSG00000164308.17`) is used for paging because it has 751 significant eQTLs in one
tissue. The other four probes are the counter-examples that a single-gene, single-tissue
test misses: **SLC25A6** for the pseudoautosomal twin that answers with 54 zeros,
**DDX3Y** for the multi-gene page that cuts inside a gene, **Kidney_Medulla** and
**Uterus** for the empty subset group, and **Testis** for the eGene table that outgrows a
fixed `itemsPerPage`. Last confirmed reachable 2026-08-18.

```python
import json, statistics, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"
GENCODE_FOR = {"gtex_v8": "v26", "gtex_v10": "v39"}
DATASET, SYMBOL = "gtex_v10", "TP53"
HEART = ["Heart_Atrial_Appendage", "Heart_Left_Ventricle"]


def raw(path, **params):
    """One GET, no assertions -- for the calls that are meant to be partial."""
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=120) as fh:
        return json.loads(fh.read())


def get(path, **params):
    """Returns (rows, paging_info) and refuses to hand back a truncated page."""
    body = raw(path, **params)
    assert set(body) == {"data", "paging_info"}, sorted(body)
    assert body["paging_info"]["numberOfPages"] <= 1, f"{path}: {body['paging_info']}"
    assert len(body["data"]) >= body["paging_info"]["totalNumberOfItems"], \
        f"{path}: {len(body['data'])} rows of {body['paging_info']}"
    return body["data"], body["paging_info"]


# 1. Symbol -> versioned GENCODE id, for the build this dataset was built on.
rows, _ = get("reference/gene", geneId=SYMBOL, gencodeVersion=GENCODE_FOR[DATASET])
hits = [g for g in rows if g["geneSymbolUpper"] == SYMBOL.upper()]
assert len(hits) == 1, [h["gencodeId"] for h in hits]
gid = hits[0]["gencodeId"]
assert "." in gid, f"{gid} carries no version suffix"
# The same endpoint migrates a bare Ensembl id onto the build you ask for.
byid, _ = get("reference/gene", geneId=gid.split(".")[0],
              gencodeVersion=GENCODE_FOR[DATASET])
assert [g["gencodeId"] for g in byid] == [gid], byid
print("gencodeId              :", gid, f"(GENCODE {GENCODE_FOR[DATASET]})")

# 2. The trap. Every one of these is HTTP 200 with an empty list, not an error.
v8rows, _ = get("reference/gene", geneId=SYMBOL,
                gencodeVersion=GENCODE_FOR["gtex_v8"])
v8 = next(g["gencodeId"] for g in v8rows if g["geneSymbolUpper"] == SYMBOL.upper())
for bad in (SYMBOL, gid.split(".")[0], v8):
    empty, _ = get("expression/medianGeneExpression", gencodeId=bad,
                   datasetId=DATASET, tissueSiteDetailId="Heart_Left_Ventricle")
    assert empty == [], (bad, len(empty))
print("silently empty for     :", SYMBOL, "|", gid.split(".")[0], "|", v8)

# 3. Median TPM in every tissue of the release.
med, med_info = get("expression/medianGeneExpression", gencodeId=gid,
                    datasetId=DATASET, itemsPerPage=300)
tis, _ = get("dataset/tissueSiteDetail", datasetId=DATASET, itemsPerPage=300)
assert len(med) == med_info["totalNumberOfItems"]
assert {r["tissueSiteDetailId"] for r in med} == {r["tissueSiteDetailId"] for r in tis}
assert {r["unit"] for r in med} == {"TPM"}
top = max(med, key=lambda r: r["median"])
print(f"tissues / unit         : {len(med)} / TPM")
print(f"highest median         : {top['tissueSiteDetailId']} {top['median']}")

# 3b. COUNTER-EXAMPLE, pseudoautosomal gene. Two exact symbol matches, and the
# _PAR_Y twin answers with a full-length, correctly-shaped, all-zero vector.
par, _ = get("reference/gene", geneId="SLC25A6", gencodeVersion="v39")
par_ids = [g["gencodeId"] for g in par if g["geneSymbolUpper"] == "SLC25A6"]
assert len(par_ids) == 2 and par_ids[1].endswith("_PAR_Y"), par_ids
zero, _ = get("expression/medianGeneExpression", gencodeId=par_ids[1],
              datasetId=DATASET, itemsPerPage=300)
assert len(zero) == len(tis) and {r["median"] for r in zero} == {0.0}
print(f"SLC25A6 _PAR_Y twin    : {len(zero)} tissues, every median 0.0")

# 3c. COUNTER-EXAMPLE, more than one gene. 5 x 54 = 270 rows, default page 250,
# and the cut lands INSIDE the fifth gene rather than between two genes.
FIVE = [gid, "ENSG00000164308.17", "ENSG00000229807.13",
        "ENSG00000129824.16", "ENSG00000067048.17"]
part = raw("expression/medianGeneExpression", gencodeId=FIVE, datasetId=DATASET)
counts = sorted(sum(r["gencodeId"] == g for r in part["data"]) for g in FIVE)
assert len(part["data"]) < part["paging_info"]["totalNumberOfItems"]
# The stated claim is that the cut lands INSIDE one gene — four full, one short.
# `counts[0] < len(tis)` alone would also pass if paging went tissue-major and cut
# every gene evenly, which is the case the Expect bullet says is disproved.
assert counts.count(len(tis)) == len(FIVE) - 1, counts
assert counts[0] < len(tis), counts
full, full_info = get("expression/medianGeneExpression", gencodeId=FIVE,
                      datasetId=DATASET, itemsPerPage=100000)
assert len(full) == full_info["totalNumberOfItems"] == len(FIVE) * len(tis)
print(f"5 genes unpaged / full : {len(part['data'])} rows (per gene {counts}) "
      f"/ {len(full)} rows")

# 4. Per-sample TPM by donor age bracket, for the two heart tissues.
expr, expr_info = get("expression/geneExpression", gencodeId=gid, datasetId=DATASET,
                      tissueSiteDetailId=HEART, attributeSubset="ageBracket")
n_rna = {r["tissueSiteDetailId"]: r["rnaSeqSampleSummary"]["totalCount"] for r in tis}
for t in HEART:
    groups = [r for r in expr if r["tissueSiteDetailId"] == t]
    vals = [v for g in groups for v in g["data"]]
    assert len(vals) == n_rna[t], (t, len(vals), n_rna[t])
    api_med = next(r["median"] for r in med if r["tissueSiteDetailId"] == t)
    print(f"{t:23}: n={len(vals)} in {len(groups)} brackets, "
          f"median {statistics.median(vals):.4f} vs API {api_med}")
# Under attributeSubset, totalNumberOfItems counts gene x tissue, not returned rows.
print(f"subset rows / reported : {len(expr)} / {expr_info['totalNumberOfItems']}")

# 4b. COUNTER-EXAMPLE, empty subset groups. A bracket or a sex with no donors
# comes back with an EMPTY vector rather than being dropped, so any loop that
# calls statistics.median on every group dies on 9 of the 54 tissues.
thin, _ = get("expression/geneExpression", gencodeId=gid, datasetId=DATASET,
              tissueSiteDetailId="Kidney_Medulla", attributeSubset="ageBracket")
empty_brackets = [g["subsetGroup"] for g in thin if not g["data"]]
assert empty_brackets, thin
one_sex, _ = get("expression/geneExpression", gencodeId=gid, datasetId=DATASET,
                 tissueSiteDetailId="Uterus", attributeSubset="sex")
# The invariant is that the empty group is PRESENT, not how many donors the other
# group has — 153 is a v10 number, and asserting it turns a GTEx rebuild into a
# hard failure instead of the drift report it should be.
sexes = sorted((g["subsetGroup"], len(g["data"])) for g in one_sex)
assert [g for g, _ in sexes] == ["female", "male"], sexes
assert dict(sexes)["male"] == 0 and dict(sexes)["female"] > 0, sexes
print(f"empty subset groups    : Kidney_Medulla {empty_brackets}, Uterus male n=0")

# 5. Paging. The default page holds 250 rows and never claims to be everything.
page0 = raw("association/singleTissueEqtl", gencodeId="ENSG00000164308.17",
            datasetId=DATASET, tissueSiteDetailId="Heart_Left_Ventricle")
info = page0["paging_info"]
assert len(page0["data"]) == info["maxItemsPerPage"] < info["totalNumberOfItems"]
print(f"ERAP2 eQTL paging      : page 0 holds {len(page0['data'])} of "
      f"{info['totalNumberOfItems']} across {info['numberOfPages']} pages")

# 5b. COUNTER-EXAMPLE, eGene tables. Testis holds more eGenes than any single
# fixed-size request you would think to write, so page it or assert on the count.
n_egene = {r["tissueSiteDetailId"]: r["eGeneCount"] for r in tis}
cut = raw("association/egene", tissueSiteDetailId="Testis",
          datasetId=DATASET, itemsPerPage=20000)
assert len(cut["data"]) == 20000 < cut["paging_info"]["totalNumberOfItems"]
assert cut["paging_info"]["totalNumberOfItems"] == n_egene["Testis"]
print(f"Testis eGenes          : {n_egene['Testis']}, a 20000-row request holds "
      f"{len(cut['data'])} across {cut['paging_info']['numberOfPages']} pages")
```

**Expect**

Invariants — these hold regardless of release, and a failure means the skill is wrong:

- Every response is exactly `{data, paging_info}`, and `paging_info` carries `page`,
  `numberOfPages`, `maxItemsPerPage`, `totalNumberOfItems`.
- The resolved `gencodeId` **carries a version suffix**. The assertion on `"."` is the
  point of the whole test.
- The gene symbol, the bare Ensembl id, and the *other* release's versioned id all
  return `data: []` at **HTTP 200** from the expression endpoints. If any of them ever
  returns rows, the keying changed and the skill needs rewriting. The bare Ensembl id
  does resolve at `/reference/gene` — that is the migration route, not a contradiction.
- The tissue set from `medianGeneExpression` equals the tissue set from
  `tissueSiteDetail` for the same `datasetId`, and every `unit` is `TPM`.
- **`SLC25A6` returns two exact symbol matches and the `_PAR_Y` one is 54 tissues of
  `0.0`.** If that ever holds fewer than the full tissue count, or a non-zero value,
  the PAR handling in `resolve_gene` needs revisiting. This is the counter-example that
  passes every row-count check while being entirely wrong.
- **A default page cuts inside a gene, not between two.** The per-gene counts come back
  with all but one at the full tissue count and one short — never a clean even split.
  That is what proves the truncation is invisible from the rows themselves, and it is why
  every call in this skill either passes `itemsPerPage` or pages. The specific arithmetic
  (five genes, 250 of 270, one gene at 34) is a v10 observation and sits below, because it
  depends on the release having 54 tissues and the server defaulting to 250 rows.
- Per-sample vectors from `attributeSubset=ageBracket` sum to the tissue's
  `rnaSeqSampleSummary.totalCount`, and their **recomputed median matches the published
  median** from `medianGeneExpression`. That is what proves the two endpoints describe
  the same samples.
- **Empty subset groups are present, not omitted.** Kidney_Medulla has no 40-49 and no
  70-79 donors and Uterus has no male ones, and all three come back as rows with
  `data: []`. Anything that maps `statistics.median` over the groups dies here.
- `subset rows / reported` disagree, because `totalNumberOfItems` counts gene x tissue
  under `attributeSubset` — printed rather than asserted, since a fix upstream would be
  an improvement, not a break.
- A default page of a multi-page result holds exactly `maxItemsPerPage` rows, strictly
  fewer than `totalNumberOfItems`. Any client that ignores `numberOfPages` is silently
  truncating.
- **A fixed `itemsPerPage` is not a substitute for the source's own count.** At least one
  tissue always outgrows any hardcoded cap; assert against `eGeneCount`. In `gtex_v10` that
  is Testis (22,694) and Nerve_Tibial (20,101) against a 20,000-row request — the request that
  loses 2,694 of them looks exactly like the one that returns all 11,070 of left
  ventricle's. Assert against `eGeneCount` from the tissue table.

Observed 2026-08-18 against **`gtex_v10`** (GENCODE v39, GRCh38, API 2.0.0) — these move
when GTEx releases, so treat a mismatch as drift to investigate, not as a failure:

```
gencodeId              : ENSG00000141510.18 (GENCODE v39)
silently empty for     : TP53 | ENSG00000141510 | ENSG00000141510.16
tissues / unit         : 54 / TPM
highest median         : Cells_EBV-transformed_lymphocytes 77.4845
SLC25A6 _PAR_Y twin    : 54 tissues, every median 0.0
5 genes unpaged / full : 250 rows (per gene [34, 54, 54, 54, 54]) / 270 rows
Heart_Atrial_Appendage : n=461 in 6 brackets, median 5.9431 vs API 5.94307
Heart_Left_Ventricle   : n=452 in 6 brackets, median 3.7305 vs API 3.73045
subset rows / reported : 12 / 2
empty subset groups    : Kidney_Medulla ['40-49', '70-79'], Uterus male n=0
ERAP2 eQTL paging      : page 0 holds 250 of 751 across 4 pages
Testis eGenes          : 22694, a 20000-row request holds 20000 across 2 pages
```

## Sources

- GTEx Portal — https://gtexportal.org/
- API reference — https://gtexportal.org/api/v2/redoc
- Machine-readable schema, including every enum value — https://gtexportal.org/api/v2/openapi.json
- Bulk files, public over HTTPS — https://storage.googleapis.com/adult-gtex/
- dbGaP study `phs000424` — https://www.ncbi.nlm.nih.gov/projects/gap/cgi-bin/study.cgi?study_id=phs000424
- GTEx Consortium (2013) *Nature Genetics* 45, 580-585 — https://doi.org/10.1038/ng.2653
- GTEx Consortium (2015) *Science* 348, 648-660 — https://doi.org/10.1126/science.1262110
- GTEx Consortium (2017) *Nature* 550, 204-213 — https://doi.org/10.1038/nature24277
- GTEx Consortium (2020) *Science* 369, 1318-1330 — https://doi.org/10.1126/science.aaz1776

GTEx is an NIH Common Fund programme. Open-access data carries no use restrictions
under the NIH Genomic Data Sharing Policy; cite the consortium papers above, and state
the release and GENCODE build with any number you report.
