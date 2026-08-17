---
name: gtex
description: Query GTEx human tissue expression and eQTLs through the GTEx Portal API — median TPM across 54 tissues including heart left ventricle, atrial appendage and skeletal muscle, per-sample values by donor age bracket, and significant cis-eQTLs by gene and tissue. Resolves gene symbols to the versioned GENCODE ids GTEx requires, and says which data is open and which is dbGaP-controlled.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [gtex, transcriptomics, eqtl, rna-seq, public-data]
covers: [heart, left ventricle, atrial appendage, skeletal muscle, brain cortex, cerebellum, liver, lung, whole blood, skin, thyroid, testis, pancreas, kidney cortex, adipose, esophagus, artery, nerve, eqtl, egene, sqtl, gene expression, median tpm, transcriptomics, bulk rna-seq, human, aging, gencode, dbgap, genotype-tissue expression]
papers: [PMID:23715323, PMID:25954001, PMID:29022597, PMID:32913098]
access: [open, controlled]
datasets: [https://gtexportal.org/api/v2/reference/gene?geneId=TP53&gencodeVersion=v39, https://gtexportal.org/api/v2/expression/medianGeneExpression?gencodeId=ENSG00000141510.18&datasetId=gtex_v10, https://gtexportal.org/api/v2/dataset/tissueSiteDetail?datasetId=gtex_v10&itemsPerPage=300, https://storage.googleapis.com/adult-gtex/bulk-gex/v10/rna-seq/GTEx_Analysis_v10_RNASeQCv2.4.2_gene_median_tpm.gct.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-17
  against: GTEx Portal API v2.0.0 / gtex_v10 (GENCODE v39, GRCh38) / bulk store v10 and v11 / Python 3.12.8 stdlib only / curl 8.7.1
  executed: 12
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

Two mechanical traps cause almost every failed GTEx query, and both fail by returning
an empty or wrong result instead of an error. They are the next two sections.

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


def resolve_gene(symbol, dataset="gtex_v10"):
    """Symbol -> versioned GENCODE id valid for `dataset`. Raises on no hit."""
    if dataset not in GENCODE_FOR:
        raise ValueError(f"unknown dataset {dataset}")
    hits = get("reference/gene", {"geneId": symbol,
                                  "gencodeVersion": GENCODE_FOR[dataset]})["data"]
    exact = [h for h in hits if h["geneSymbolUpper"] == symbol.upper()]
    if not exact:
        raise LookupError(f"{symbol}: no gene in GENCODE {GENCODE_FOR[dataset]} "
                          f"(HTTP 200 with an empty list, not an error)")
    if len(exact) > 1:
        raise LookupError(f"{symbol}: {len(exact)} entries -- "
                          f"{[h['gencodeId'] for h in exact]}")
    return exact[0]["gencodeId"]


def median_expression(gencode_id, tissues=None, dataset="gtex_v10"):
    p = {"gencodeId": gencode_id, "datasetId": dataset}
    if tissues:
        p["tissueSiteDetailId"] = list(tissues)
    return get("expression/medianGeneExpression", p)["data"]


gid = resolve_gene("TP53")
print("resolved      :", gid)
print("v10 rows      :", len(median_expression(gid, ["Heart_Left_Ventricle"])))

# The three ways this silently fails. All are HTTP 200 with data == [].
for bad in ["TP53", "ENSG00000141510", resolve_gene("TP53", "gtex_v8")]:
    rows = median_expression(bad, ["Heart_Left_Ventricle"])
    print(f"{bad:22} -> {len(rows)} rows")
```

```
resolved      : ENSG00000141510.18
v10 rows      : 1
TP53                   -> 0 rows
ENSG00000141510        -> 0 rows
ENSG00000141510.16     -> 0 rows
```

Consequences worth building around:

- **Never hardcode a versioned id.** `.16` was right for v8, `.18` for v10, `.19` in
  the v11 bulk files. Resolve at run time and record what you resolved.
- **Never cache a resolution across datasets.** Keyed by symbol alone it is wrong for
  one of them.
- **Treat an empty `data` on a gene you believe exists as a resolution bug**, not as
  absence of expression. That is the single highest-value assertion in a GTEx client.
- Symbol lookup is case-insensitive — `tp53` resolves — but it does **not** resolve
  deprecated aliases. `MLL` returns nothing; the current symbol `KMT2A` returns
  `ENSG00000118058.24`. Normalise symbols upstream.
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
- **The list is per-release.** Query it with the same `datasetId` you will use for
  expression. v8 and v10 both have 54 entries but not the same 54 — v8 has
  `Cells_Transformed_fibroblasts` where v10 has `Cells_Cultured_fibroblasts`, and the
  enum published in the schema is the union across releases, so a value can validate
  and still return nothing.
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


GID = "ENSG00000141510.18"          # TP53, GENCODE v39 / gtex_v10
rows = get("expression/medianGeneExpression",
           {"gencodeId": GID, "datasetId": "gtex_v10", "itemsPerPage": 300})["data"]

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
HEART = ["Heart_Atrial_Appendage", "Heart_Left_Ventricle"]


def get(path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=90) as fh:
        return json.loads(fh.read())


rows = get("expression/geneExpression",
           {"gencodeId": GID, "datasetId": "gtex_v10",
            "tissueSiteDetailId": HEART, "attributeSubset": "ageBracket"})["data"]

# One row per (tissue, bracket); row["data"] is the per-sample TPM vector.
for tissue in HEART:
    groups = sorted((r for r in rows if r["tissueSiteDetailId"] == tissue),
                    key=lambda r: r["subsetGroup"])
    n = sum(len(g["data"]) for g in groups)
    print(f"\n{tissue}  n={n} samples over {len(groups)} brackets")
    for g in groups:
        v = g["data"]
        print(f"  {g['subsetGroup']:6} n={len(v):4}  median {statistics.median(v):7.3f} "
              f"IQR {statistics.quantiles(v, n=4)[0]:6.3f}-{statistics.quantiles(v, n=4)[2]:6.3f}")

# Cross-check the sample counts against the tissue table -- if these disagree,
# the subset call dropped samples and any age trend you fit is on partial data.
meta = {r["tissueSiteDetailId"]: r["rnaSeqSampleSummary"]["totalCount"]
        for r in get("dataset/tissueSiteDetail",
                     {"datasetId": "gtex_v10", "itemsPerPage": 300})["data"]}
print()
for tissue in HEART:
    got = sum(len(r["data"]) for r in rows if r["tissueSiteDetailId"] == tissue)
    print(f"{tissue:24} subset sum {got:4} vs tissue table {meta[tissue]:4} "
          f"{'OK' if got == meta[tissue] else 'MISMATCH'}")
```

```
Heart_Atrial_Appendage  n=461 samples over 6 brackets
  20-29  n=  15  median   6.235 IQR  4.390- 7.176
  30-39  n=  17  median   5.364 IQR  4.005- 6.282
  40-49  n=  63  median   6.038 IQR  4.471- 7.654
  50-59  n= 166  median   5.759 IQR  4.492- 7.485
  60-69  n= 181  median   6.035 IQR  4.477- 7.476
  70-79  n=  19  median   5.437 IQR  3.742- 8.628

Heart_Left_Ventricle  n=452 samples over 6 brackets
  20-29  n=  20  median   5.480 IQR  3.540- 6.370
  30-39  n=  25  median   3.551 IQR  3.065- 4.152
  40-49  n=  67  median   4.391 IQR  2.981- 5.593
  50-59  n= 159  median   3.778 IQR  2.859- 4.916
  60-69  n= 167  median   3.497 IQR  2.489- 4.635
  70-79  n=  14  median   3.162 IQR  2.050- 5.980

Heart_Atrial_Appendage   subset sum  461 vs tissue table  461 OK
Heart_Left_Ventricle     subset sum  452 vs tissue table  452 OK
```

Four things to know before you model an age effect on this:

- **`paging_info` lies under `attributeSubset`.** That call reports
  `totalNumberOfItems: 2` — one per gene x tissue — while `data` holds 12 rows, one
  per bracket. Code asserting `len(data) == totalNumberOfItems` breaks here and only
  here; assert on `numberOfPages` instead.
- **The vectors are unlabelled.** There is no sample or donor id alongside the TPM
  values, so this endpoint cannot support a regression with covariates beyond the one
  you subset on, and it cannot pair a donor's two heart samples. For that, take the
  per-tissue matrices and the sample table — see *Get the files*.
- **Age is a 10-year bracket, and that is a design property, not a limitation of the
  API.** Exact ages are protected. Bracketed age is usable as an ordinal covariate or
  a bracket midpoint; it is not usable for anything needing age resolution finer than
  a decade, and the brackets are badly unbalanced — 347 of the 913 heart samples sit
  in 50-69 while 33 sit in 70-79.
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
default page  : 250 rows; {'numberOfPages': 4, 'page': 0, 'maxItemsPerPage': 250, 'totalNumberOfItems': 4}
all pages     : 751 rows

variantId                    rsId                pValue     NES
chr5_96916728_G_A_b38        rs2927608       1.341e-158   1.077
chr5_96916885_T_C_b38        rs2910686       1.342e-158   1.077
chx5_96936716_T_G_b38        rs2548224       7.727e-144   1.065
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


ERAP2, TISSUE = "ENSG00000164308.17", "Heart_Left_Ventricle"

# /association/egene takes tissueSiteDetailId and datasetId ONLY. A gencodeId
# here is silently dropped and you get every eGene in the tissue.
naive = get("association/egene", {"gencodeId": ERAP2,
                                  "tissueSiteDetailId": TISSUE,
                                  "datasetId": "gtex_v10", "itemsPerPage": 1})
print("gencodeId 'filter' :", naive["paging_info"]["totalNumberOfItems"], "rows;",
      "first row is", naive["data"][0]["geneSymbol"])

# Pull the tissue's eGene table and filter locally.
res = get("association/egene", {"tissueSiteDetailId": TISSUE,
                                "datasetId": "gtex_v10", "itemsPerPage": 20000})
egenes = res["data"]
assert len(egenes) == res["paging_info"]["totalNumberOfItems"]
hit = next((e for e in egenes if e["gencodeId"] == ERAP2), None)
print("eGenes in tissue   :", len(egenes))
print("ERAP2 is an eGene  :", hit is not None)
if hit:
    print(f"  qValue {hit['qValue']:.3e}  empiricalP {hit['empiricalPValue']:.3e} "
          f"log2 aFC {hit['log2AllelicFoldChange']:.3f} "
          f"threshold {hit['pValueThreshold']:.3e}")
```

```
gencodeId 'filter' : 11070 rows; first row is WASH7P
eGenes in tissue   : 11070
ERAP2 is an eGene  : True
  qValue 8.312e-137  empiricalP 4.575e-140 log2 aFC 3.198 threshold 1.540e-04
```

The unfiltered count matches `eGeneCount` in the tissue table exactly, which is how you
prove the filter was dropped rather than merely unhelpful. Sanity-check any per-gene
association result against that field.

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

# 1. Resolve the symbol against the GENCODE build this dataset uses.
url, res = get("reference/gene", {"geneId": SYMBOL,
                                  "gencodeVersion": GENCODE_FOR[DATASET]})
exact = [g for g in res["data"] if g["geneSymbolUpper"] == SYMBOL.upper()]
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
1,970 aliquots for the same two tissues because it lists genotyping aliquots too —
filtering on `dataType == "RNASEQ"` is what makes the row count match the matrix.

**Route C — the bulk store, for whole matrices.** Everything on the portal's download
page lives in a public Google Cloud bucket readable over plain HTTPS at
`https://storage.googleapis.com/adult-gtex/…`; `/api/v2/dataset/openAccessFilesMetadata?project_id=adult-gtex`
returns the tree of `gs://` paths, which map to that prefix one-for-one. No client
library and no credentials.

```python
import gzip, hashlib, json, os, urllib.request

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
gct = manifest[0]["path"]
with gzip.open(gct, "rt") as fh:
    fh.readline()
    n_genes, n_cols = (int(x) for x in fh.readline().split())
    header = fh.readline().rstrip("\n").split("\t")
    assert len(header) == n_cols + 2, (len(header), n_cols)
    tissues = header[2:]
    row = next(f for f in (l.rstrip("\n").split("\t") for l in fh) if f[1] == "TP53")

print(f"\n{n_genes:,} genes x {len(tissues)} columns; id cols {header[:2]}")
tpm = dict(zip(tissues, (float(v) for v in row[2:])))
print("TP53 row id:", row[0])
for t in ("Heart_Atrial_Appendage", "Heart_Left_Ventricle"):
    print(f"  {t:24} {tpm[t]}")
```

```
   8,846,936 B  md5 13dfdd0cb73c  Data/gtex/bulk/GTEx_Analysis_v10_RNASeQCv2.4.2_gene_median_tpm.gct.gz
      20,292 B  md5 ffa15a680855  Data/gtex/bulk/GTEx_Analysis_v10_Annotations_SubjectPhenotypesDS.txt

59,033 genes x 68 columns; id cols ['Name', 'Description']
TP53 row id: ENSG00000141510.18
  Heart_Atrial_Appendage   5.94307
  Heart_Left_Ventricle     3.73045
```

The GCT medians match the API to the last digit, which is the cross-check that the two
routes are the same numbers. Two differences to expect between them:

- **68 columns, not 54.** The bulk median file adds 14 histology-subdissected sites
  the API's tissue enum has no value for — `Liver_Hepatocyte`, `Liver_Portal_Tract`,
  `Pancreas_Islets`, `Pancreas_Acini`, `Stomach_Mucosa`, `Stomach_Muscularis`,
  `Colon_Transverse_Muscularis` and similar. Only reachable through the files.
- **The bucket is ahead of the API.** A **v11** release is already published there
  (`GTEx_Analysis_2025-08-22_v11_…`, 74,628 genes, TP53 as `ENSG00000141510.19`) while
  the API's `datasetId` enum still stops at `gtex_v10`. If you need the newest numbers
  you need the files, and you need to re-resolve every identifier for that build.

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
  tracks the tissue's sample count, which ranges from 4 to over 800.
- **Version everything you report.** Release, GENCODE build, genome build, unit. TP53's
  median in left ventricle is 3.67865 TPM in v8 and 3.73045 in v10; unlabelled, those
  read as a finding.

## Try it

A self-contained check that this skill still works. Public data, no account, no key,
Python standard library only.

**Data** — the GTEx Portal v2 API, `gtex_v10` release, reached through three endpoints:

    https://gtexportal.org/api/v2/reference/gene?geneId=TP53&gencodeVersion=v39
    https://gtexportal.org/api/v2/expression/medianGeneExpression?gencodeId=ENSG00000141510.18&datasetId=gtex_v10
    https://gtexportal.org/api/v2/dataset/tissueSiteDetail?datasetId=gtex_v10&itemsPerPage=300

GTEx open-access data needs no account or licence acceptance, and the dbGaP study record
states that releases from v5 onward carry no restrictions on use or publication. TP53 is
used because it is expressed in every tissue and its GENCODE version suffix has moved in
each of the last three releases, which is what makes it a good probe for the trap. ERAP2
(`ENSG00000164308.17`) is used for paging because it has 751 significant eQTLs in one
tissue. Last confirmed reachable 2026-08-17.

```python
import json, statistics, urllib.parse, urllib.request

BASE = "https://gtexportal.org/api/v2"
GENCODE_FOR = {"gtex_v8": "v26", "gtex_v10": "v39"}
DATASET, SYMBOL = "gtex_v10", "TP53"
HEART = ["Heart_Atrial_Appendage", "Heart_Left_Ventricle"]


def get(path, **params):
    """Returns (rows, paging_info) and refuses to hand back a truncated page."""
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=90) as fh:
        body = json.loads(fh.read())
    assert set(body) == {"data", "paging_info"}, sorted(body)
    assert body["paging_info"]["numberOfPages"] <= 1, f"{path}: {body['paging_info']}"
    return body["data"], body["paging_info"]


# 1. Symbol -> versioned GENCODE id, for the build this dataset was built on.
rows, _ = get("reference/gene", geneId=SYMBOL, gencodeVersion=GENCODE_FOR[DATASET])
hits = [g for g in rows if g["geneSymbolUpper"] == SYMBOL.upper()]
assert len(hits) == 1, [h["gencodeId"] for h in hits]
gid = hits[0]["gencodeId"]
assert "." in gid, f"{gid} carries no version suffix"
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

# 5. Paging. The default page holds 250 rows and never claims to be everything.
url = f"{BASE}/association/singleTissueEqtl?" + urllib.parse.urlencode(
    {"gencodeId": "ENSG00000164308.17", "datasetId": DATASET,
     "tissueSiteDetailId": "Heart_Left_Ventricle"})
with urllib.request.urlopen(url, timeout=90) as fh:
    page0 = json.loads(fh.read())
info = page0["paging_info"]
assert len(page0["data"]) == info["maxItemsPerPage"] < info["totalNumberOfItems"]
print(f"ERAP2 eQTL paging      : page 0 holds {len(page0['data'])} of "
      f"{info['totalNumberOfItems']} across {info['numberOfPages']} pages")
```

**Expect**

Invariants — these hold regardless of release, and a failure means the skill is wrong:

- Every response is exactly `{data, paging_info}`, and `paging_info` carries `page`,
  `numberOfPages`, `maxItemsPerPage`, `totalNumberOfItems`.
- The resolved `gencodeId` **carries a version suffix**. The assertion on `"."` is the
  point of the whole test.
- The gene symbol, the bare Ensembl id, and the *other* release's versioned id all
  return `data: []` at **HTTP 200**. If any of them ever returns rows, the keying
  changed and the skill needs rewriting.
- The tissue set from `medianGeneExpression` equals the tissue set from
  `tissueSiteDetail` for the same `datasetId`, and every `unit` is `TPM`.
- Per-sample vectors from `attributeSubset=ageBracket` sum to the tissue's
  `rnaSeqSampleSummary.totalCount`, and their **recomputed median matches the published
  median** from `medianGeneExpression`. That is what proves the two endpoints describe
  the same samples.
- `subset rows / reported` disagree, because `totalNumberOfItems` counts gene x tissue
  under `attributeSubset` — printed rather than asserted, since a fix upstream would be
  an improvement, not a break.
- A default page of a multi-page result holds exactly `maxItemsPerPage` rows, strictly
  fewer than `totalNumberOfItems`. Any client that ignores `numberOfPages` is silently
  truncating.

Observed 2026-08-17 against **`gtex_v10`** (GENCODE v39, GRCh38, API 2.0.0) — these move
when GTEx releases, so treat a mismatch as drift to investigate, not as a failure:

```
gencodeId              : ENSG00000141510.18 (GENCODE v39)
silently empty for     : TP53 | ENSG00000141510 | ENSG00000141510.16
tissues / unit         : 54 / TPM
highest median         : Cells_EBV-transformed_lymphocytes 77.4845
Heart_Atrial_Appendage : n=461 in 6 brackets, median 5.9431 vs API 5.94307
Heart_Left_Ventricle   : n=452 in 6 brackets, median 3.7305 vs API 3.73045
subset rows / reported : 12 / 2
ERAP2 eQTL paging      : page 0 holds 250 of 751 across 4 pages
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
