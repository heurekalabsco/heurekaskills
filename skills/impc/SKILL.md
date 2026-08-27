---
name: impc
description: Query IMPC / KOMP2 mouse knockout phenotypes over the EBI Solr API — Mammalian Phenotype calls for ~8,000 knocked-out genes with p-values, effect sizes, zygosity, sex and phenotyping centre, plus the separate viability and fertility screens that say whether the homozygote survives. Resolves a human gene to its mouse ortholog, and distinguishes never tested from tested and normal.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [impc, mouse, knockout, phenotyping, public-data]
covers: [impc, komp, komp2, mouse, mus musculus, knockout mouse, null allele, loss of function, gene function, essential genes, embryonic lethality, preweaning lethality, viability, fertility, infertility, mammalian phenotype ontology, deafness, hearing, obesity, body fat, bone mineral density, glucose tolerance, retina, behaviour, grip strength, clinical chemistry, haematology, dysmorphology, ortholog, sexual dimorphism]
papers: [PMID:27626380, PMID:36305825, PMID:41231752, PMID:35944064, PMID:33378393, PMID:31591642]
access: [open]
datasets: [https://www.ebi.ac.uk/mi/impc/solr/genotype-phenotype/select?q=marker_symbol:Arid1b&rows=200&wt=json, https://www.ebi.ac.uk/mi/impc/solr/statistical-result/select?q=marker_symbol:A4galt&fq=status:Successful&rows=0&wt=json, https://www.ebi.ac.uk/mi/impc/solr/gene/select?q=human_gene_symbol:ARID1B&rows=5&wt=json, https://www.ebi.ac.uk/mi/impc/solr/experiment/select?q=parameter_stable_id:IMPC_VIA_067_001&rows=0&wt=json, https://ftp.ebi.ac.uk/pub/databases/impc/all-data-releases/latest/README.md, https://ftp.ebi.ac.uk/pub/databases/impc/all-data-releases/latest/results/viability.csv.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: IMPC data release 24.0 (16 March 2026, GRCm39, OpenStats 1.20.0) / Solr cores read live at www.ebi.ac.uk/mi/impc/solr / release reports read from the EBI FTP / Python 3.12.8 standard library only / impc-api 1.0.7 / curl 8.7.1
  executed: 11
  unverified: 0
---
# IMPC — genome-wide mouse knockout phenotypes

The International Mouse Phenotyping Consortium is building a null allele for every
protein-coding mouse gene and running each one through the same standardised battery —
body composition, clinical chemistry, haematology, hearing, vision, behaviour,
dysmorphology, cardiovascular, metabolism. It is the systematic answer to *what
happens when you delete this gene*, and there is nothing else like it at genome scale.

**All of it is open.** IMPC publishes under CC-BY 4.0, explicitly for any purpose
including commercial. No account, no key, no click-through, no data use agreement. The
only thing you owe is a citation.

Two things about this resource decide whether an agent reasoning over it says something
true or something confidently wrong, and both are upstream of any query syntax:

- **A phenotype call is a statistical result, not an observation.** It carries a
  p-value against a control cohort, a zygosity, and usually a sex. Strip those and you
  have turned a hypothesis into a fact.
- **A gene with no phenotype listed has not been shown to be normal.** Most often it has
  not been tested. Separating those is the single most common failure, and it has its
  own section below.

## What a phenotype call actually is

A call is emitted when a mutant cohort differs from its controls at **p < 1e-04** on one
standardised parameter, and IMPReSS then maps that parameter and the direction of effect
onto a Mammalian Phenotype ontology term. Since data release 12 the analysis is
[OpenStats](https://bioconductor.org/packages/OpenStats/): Fisher's exact test for
categorical data, a linear mixed model for continuous data, and a reference-range-plus
model where the mixed model fails.

Everything in that sentence has to travel with the call:

| Qualifier | Field | Why it changes the meaning |
|---|---|---|
| Zygosity | `zygosity` | `homozygote`, `heterozygote` or `hemizygote`. Different genotypes, different biology, and lethal homozygotes are only ever phenotyped as heterozygotes |
| Sex | `sex` | `male`, `female` or `not_considered` — the last means the call came from the combined model, not that it holds in both sexes |
| Life stage | `life_stage_name` | `Early adult` for most of the pipeline, `Late adult`, or embryonic stages |
| Significance | `p_value` | Against the 1e-04 threshold. Effect direction is in `effect_size` and `percentage_change` |
| Centre | `phenotyping_center` | Twelve centres run overlapping pipelines; two centres can disagree about the same gene |
| Allele | `allele_symbol` | `tm1b` knockout-first, `em1` CRISPR, and others. A gene often has more than one, phenotyped at different centres |
| Resource | `resource_name` | `IMPC`, or the legacy `EuroPhenome`, `MGP`, `3i`, `pwg` collections served from the same core |

**Cohorts are small.** Across every significant result in release 24.0 the median mutant
cohort is 8 females and 7 males, against control cohorts in the hundreds to low
thousands. That is a design decision — breadth over depth — and it means effect sizes
here are estimates from single-digit n. Treat a call as a well-powered screen hit, not as
a characterised phenotype.

**A p-value of exactly 0.0 is real.** Viability and other line-level calls come through
`statistical_method: "Supplied as data"` with `p_value` 0.0; they are not model output
and the 1e-04 threshold does not apply to them.

## The interface is Solr, and it is not REST

One endpoint per core, `/{core}/select`, taking Lucene query syntax. Nothing about it
behaves the way a REST API does.

```bash
SOLR=https://www.ebi.ac.uk/mi/impc/solr

# Every core answers the same /select endpoint. rows=0 asks for the count only.
for core in genotype-phenotype statistical-result experiment gene allele \
            impc_images phenodigm mp product pipeline; do
  n=$(curl -s "$SOLR/$core/select?q=*:*&rows=0&wt=json" \
      | python3 -c "import json,sys; print(json.load(sys.stdin)['response']['numFound'])")
  printf '%-18s %12s\n' "$core" "$n"
done
```

```
genotype-phenotype        67350
statistical-result      4471298
experiment            104616842
gene                      25017
allele                    22973
impc_images              916373
phenodigm              19525860
mp                         1857
product                  445841
pipeline                 130201
```

| Core | Holds | Reach for it when |
|---|---|---|
| `genotype-phenotype` | One row per significant phenotype call | You want *what is wrong with this knockout* |
| `statistical-result` | One row per analysis, significant or not, with the full model output | You need the evidence behind a call, per-sex p-values, cohort sizes, or proof a gene was tested |
| `experiment` | Raw per-specimen measurements and categorical observations | You need viability, individual data points, or metadata |
| `gene` | One row per mouse gene IMPC tracks, with human orthologs and production status | Resolving identifiers |
| `allele` | Alleles and their design | You care which mutation was made |
| `phenodigm` | Mouse-model-to-human-disease similarity scores | Disease-model search |
| `mp` | The Mammalian Phenotype ontology as IMPC serves it | Resolving or browsing MP terms |
| `impc_images`, `product`, `pipeline` | Images, orderable mouse products, IMPReSS pipeline definitions | Ordering a line, or reading a protocol |

Five behaviours cause almost every wrong IMPC result. All five are demonstrated in the
next block.

```python
import json
import urllib.error
import urllib.parse
import urllib.request

SOLR = "https://www.ebi.ac.uk/mi/impc/solr"


def solr(core, q, rows=0, **params):
    """One /select call. `q` is a Solr query string, not a dict of filters.

    rows defaults to 0 here on purpose -- the server's own default is 10, and a
    silent 10 is the single most common way an IMPC query goes wrong.
    """
    url = f"{SOLR}/{core}/select?" + urllib.parse.urlencode(
        {"q": q, "rows": rows, "wt": "json", **params}, doseq=True)
    with urllib.request.urlopen(url, timeout=120) as fh:
        body = json.loads(fh.read())
    return body["response"]["numFound"], body["response"]["docs"]


def facet(core, q, field, limit=25, **params):
    """Value counts for one field. Solr returns [v1, n1, v2, n2, ...]."""
    url = f"{SOLR}/{core}/select?" + urllib.parse.urlencode(
        {"q": q, "rows": 0, "wt": "json", "facet": "true",
         "facet.field": field, "facet.limit": limit,
         "facet.mincount": 1, **params}, doseq=True)
    with urllib.request.urlopen(url, timeout=120) as fh:
        body = json.loads(fh.read())
    flat = body["facet_counts"]["facet_fields"][field]
    return list(zip(flat[::2], flat[1::2]))


# 1. rows defaults to 10, and the truncation is invisible in the rows themselves.
url = f"{SOLR}/genotype-phenotype/select?q=marker_symbol:Bbs5&wt=json"
with urllib.request.urlopen(url, timeout=120) as fh:
    body = json.loads(fh.read())
print("no rows= given      :", len(body["response"]["docs"]),
      "of", body["response"]["numFound"], "returned")

# 2. Identifier fields are strings, matched byte for byte. Case is not folded.
for value in ("Bbs5", "bbs5", "BBS5"):
    n, _ = solr("genotype-phenotype", f"marker_symbol:{value}")
    print(f"marker_symbol:{value:5}  :", n)

# 3. A space or a colon inside an unquoted value is a 400, not an empty result.
for q in ('phenotyping_center:MRC Harwell', 'phenotyping_center:"MRC Harwell"',
          "mp_term_id:MP:0001262", 'mp_term_id:"MP:0001262"'):
    try:
        n, _ = solr("genotype-phenotype", q)
        print(f"{q:36} -> {n}")
    except urllib.error.HTTPError as exc:
        print(f"{q:36} -> HTTP {exc.code}")

# 4. mp_term_name is a string field too, so it holds whole ontology labels.
#    Substring intent silently returns nothing; facet the field to find the label.
n, _ = solr("genotype-phenotype", "mp_term_name:obesity")
print("mp_term_name:obesity:", n)
print("labels holding 'body fat':",
      [v for v, _ in facet("genotype-phenotype", "*:*", "mp_term_name", limit=400)
       if "body fat" in v])
```

```
no rows= given      : 10 of 48 returned
marker_symbol:Bbs5   : 48
marker_symbol:bbs5   : 0
marker_symbol:BBS5   : 0
phenotyping_center:MRC Harwell       -> HTTP 400
phenotyping_center:"MRC Harwell"     -> 6031
mp_term_id:MP:0001262                -> HTTP 400
mp_term_id:"MP:0001262"              -> 425
mp_term_name:obesity: 0
labels holding 'body fat': ['increased total body fat amount', 'decreased total body fat amount']
```

1. **`rows` defaults to 10.** Not to everything, and not to an error. `numFound` in the
   response is the real total; compare it against `len(docs)` every time, or pass `rows`
   explicitly. This is why the helper above defaults to `rows=0`.
2. **Identifier and label fields are exact strings.** `marker_symbol`, `mp_term_name`,
   `mp_term_id`, `human_gene_symbol`, `phenotyping_center` are all matched byte for byte
   with no case folding and no stemming. `bbs5` and `BBS5` are not `Bbs5`, and
   `mp_term_name:obesity` finds nothing at all — the ontology label is *increased total
   body fat amount*. Facet the field to discover the vocabulary before filtering on it.
3. **Quote anything containing a space or a colon.** `mp_term_id:MP:0001262` and
   `phenotyping_center:MRC Harwell` are HTTP 400, not empty results. `"MP:0001262"` and
   `"MRC Harwell"` work.
4. **`q` versus `fq`.** Both filter. `fq` is a filter query — not scored, separately
   cached, and repeatable, so it is the right place for the conditions you reuse
   (`fq=status:Successful`, `fq=resource_name:IMPC`). Pass a list to repeat it; every
   `fq` is ANDed.
5. **Paging is `start` plus `rows`, and works to the end of a core.** For the large cores
   use `cursorMark=*` with an explicit `sort` on a unique field. Long queries — a list of
   several hundred genes — can be sent as a form-encoded `POST` to the same
   `/select` path, which sidesteps URL length limits.

Two smaller things worth knowing. `wt` currently defaults to `json` on this deployment,
but Solr's own default is XML — pass `wt=json` explicitly rather than relying on a
deployment default. And `wt=csv` joins multi-valued fields with a comma inside a quoted
cell, which quietly corrupts naive CSV parsing of `top_level_mp_term_name`; prefer JSON.
The admin, schema and Luke handlers are not exposed, so you cannot introspect field types
— read one document with `fl=*` instead.

## Three states hide behind "no phenotype"

This is the misreading that produces confident wrong statements about gene function, and
it needs two cores to resolve, because the phenotype core only ever holds *hits*.

| State | `genotype-phenotype` | `statistical-result`, `status:Successful` | What you may say |
|---|---|---|---|
| Called | rows | rows, some `significant:true` | This knockout has these phenotypes |
| Tested, nothing significant | **no rows** | rows, none significant | Unremarkable on the parameters IMPC ran |
| Never tested | **no rows** | **no rows** | Nothing. IMPC has no evidence either way |

`A4galt` is the worked case for the middle row: zero phenotype calls, 133 successful
analyses, none significant. `Ndufs4` is the bottom row: zero calls, zero analyses,
because its production was withdrawn. Reporting both as "no IMPC phenotype" is wrong
about one of them. The block below reuses the `solr` helper defined above.

```python
def state(gene):
    called, _ = solr("genotype-phenotype", f"marker_symbol:{gene}",
                     fq="resource_name:IMPC")
    tested, _ = solr("statistical-result", f"marker_symbol:{gene}",
                     fq=["resource_name:IMPC", "status:Successful"])
    if tested == 0:
        verdict = "NEVER TESTED — no successful IMPC analysis exists"
    elif called == 0:
        verdict = f"TESTED, NO CALL — {tested} analyses, none reached 1e-04"
    else:
        verdict = f"CALLED — {called} calls out of {tested} analyses"
    print(f"{gene:9} calls={called:3} analyses={tested:5}  {verdict}")


for gene in ("Bbs5", "Arid1b", "A4galt", "Ndufs4"):
    state(gene)

# The same question at genome scale, counting distinct genes rather than rows.
genes = {}
for core, fq in (("genotype-phenotype", ["resource_name:IMPC"]),
                 ("statistical-result", ["resource_name:IMPC", "status:Successful"])):
    url = f"{SOLR}/{core}/select?" + urllib.parse.urlencode(
        {"q": "*:*", "fq": fq, "rows": 0, "wt": "json",
         "json.facet": json.dumps({"genes": "unique(marker_symbol)"})}, doseq=True)
    with urllib.request.urlopen(url, timeout=300) as fh:
        genes[core] = json.loads(fh.read())["facets"]["genes"]
print()
print("genes in the IMPC catalogue          :", solr("gene", "*:*")[0])
print("genes with >=1 successful analysis   :", genes["statistical-result"])
print("genes with >=1 phenotype call        :", genes["genotype-phenotype"])
print("tested with nothing significant      :",
      genes["statistical-result"] - genes["genotype-phenotype"])
```

```
Bbs5      calls= 48 analyses=  205  CALLED — 48 calls out of 205 analyses
Arid1b    calls= 22 analyses=  466  CALLED — 22 calls out of 466 analyses
A4galt    calls=  0 analyses=  133  TESTED, NO CALL — 133 analyses, none reached 1e-04
Ndufs4    calls=  0 analyses=    0  NEVER TESTED — no successful IMPC analysis exists

genes in the IMPC catalogue          : 25017
genes with >=1 successful analysis   : 9468
genes with >=1 phenotype call        : 8024
tested with nothing significant      : 1444
```

So about 1,444 genes sit in the middle row, and they are indistinguishable from the
~15,500 never phenotyped if you only ask the phenotype core. Note also that calls and
analyses are not one to one in either direction — one analysis can emit a male call, a
female call and a combined call, so `Bbs5`'s 48 calls come from fewer than 48 significant
analyses out of the 205 that ran.

Do **not** use the `gene` core's `phenotype_status` as the gate. It tracks portal display
state rather than data presence — `Arid1b` reads `Phenotyping finished` and still has 22
phenotype calls behind 466 successful IMPC analyses. Ask the data cores.

## Resolving a human gene to the mouse knockout

The `gene` core carries IMPC's own ortholog assignment in `human_gene_symbol`. It is a
string field like every other, so it wants the **HGNC spelling exactly** — `C9orf72`, not
`C9ORF72`.

```python
FIELDS = "marker_symbol,mgi_accession_id,human_gene_symbol,phenotype_status"

for human in ("BBS5", "ARID1B", "C4A", "FCGR3A", "HBB", "NDUFS4", "PRNP"):
    n, docs = solr("gene", f"human_gene_symbol:{human}", rows=5, fl=FIELDS)
    if not n:
        print(f"{human:8} -> no mouse gene in the IMPC catalogue")
        continue
    for d in sorted(docs, key=lambda x: x["marker_symbol"]):
        print(f"{human:8} -> {d['marker_symbol']:8} {d['mgi_accession_id']:12} "
              f"{d.get('phenotype_status', 'no phenotyping data')}")

# Case is not folded here either, and IMPC stores the HGNC spelling.
for spelling in ("C9orf72", "C9ORF72"):
    n, _ = solr("gene", f"human_gene_symbol:{spelling}")
    print(f"human_gene_symbol:{spelling:9} -> {n}")

print("catalogue size / with phenotype data:",
      solr("gene", "*:*")[0], "/", dict(facet("gene", "*:*", "phenotype_status")))
```

```
BBS5     -> Bbs5     MGI:1919819  Phenotyping data available
ARID1B   -> Arid1b   MGI:1926129  Phenotyping finished
C4A      -> C4b      MGI:88228    Phenotyping data available
FCGR3A   -> Fcgr4    MGI:2179523  no phenotyping data
HBB      -> Hbb-bs   MGI:5474852  no phenotyping data
HBB      -> Hbb-bt   MGI:5474850  Phenotyping data available
NDUFS4   -> Ndufs4   MGI:1343135  no phenotyping data
PRNP     -> Prnp     MGI:97769    no phenotyping data
human_gene_symbol:C9orf72   -> 1
human_gene_symbol:C9ORF72   -> 0
catalogue size / with phenotype data: 25017 / {'Phenotyping data available': 8469, 'Phenotyping finished': 1449, 'Phenotype attempt registered': 127, 'Phenotyping started': 93}
```

Three things this shows, and one it does not.

- **The mouse symbol is often not the human symbol lowercased.** `C4A` is `C4b`,
  `FCGR3A` is `Fcgr4`. Title-casing the human symbol works far more often than it should,
  which is exactly what makes it dangerous.
- **Orthology is one-to-many.** `HBB` maps to both `Hbb-bs` and `Hbb-bt`, and only one of
  them has been phenotyped. Take `docs[0]` and you have a coin flip.
- **Absence from this core is not absence of an ortholog.** It is absence from IMPC's
  catalogue of 25,017 mouse genes.

What it does *not* give you is authoritative orthology. This is IMPC's own mapping,
suitable for finding the knockout; for orthology as a claim in its own right, go to MGI
or HGNC HCOP. Where a human symbol resolves to more than one mouse gene, carry all of
them forward rather than picking one.

## Zygosity decides the answer

`Arid1b` is the case that makes this concrete. Human *ARID1B* haploinsufficiency causes
Coffin–Siris syndrome — a neurodevelopmental disorder — so the disease-relevant mouse
genotype is the **heterozygote**, and the homozygote is a different experiment entirely.

```python
GENE = "Arid1b"   # human ARID1B haploinsufficiency causes Coffin-Siris syndrome
CALL_FIELDS = ("mp_term_name,mp_term_id,zygosity,sex,p_value,life_stage_name,"
               "phenotyping_center,allele_symbol,top_level_mp_term_name")

n, calls = solr("genotype-phenotype", f"marker_symbol:{GENE}",
                rows=200, fl=CALL_FIELDS)
print(f"{GENE}: {n} calls  {dict(facet('genotype-phenotype', f'marker_symbol:{GENE}', 'zygosity'))}")
print()
for zyg in ("homozygote", "heterozygote"):
    rows = sorted((c for c in calls if c["zygosity"] == zyg),
                  key=lambda c: (c["p_value"], c["mp_term_name"]))
    print(f"-- {zyg} ({len(rows)})")
    for c in rows:
        print(f"   {c['sex']:14} {c['mp_term_name'][:44]:44} "
              f"p={c['p_value']:9.2e}  {c['phenotyping_center']}")
    print()

# Sex is a property of the call, not of the gene. Count each way.
print("by sex     :", dict(facet("genotype-phenotype", f"marker_symbol:{GENE}", "sex")))
print("by allele  :", dict(facet("genotype-phenotype", f"marker_symbol:{GENE}", "allele_symbol")))
```

```
Arid1b: 22 calls  {'heterozygote': 15, 'homozygote': 7}

-- homozygote (7)
   male           edema                                        p= 0.00e+00  TCP
   female         edema                                        p= 0.00e+00  TCP
   male           male infertility                             p= 0.00e+00  WTSI
   not_considered preweaning lethality, complete penetrance    p= 0.00e+00  TCP
   female         preweaning lethality, complete penetrance    p= 0.00e+00  TCP
   male           preweaning lethality, complete penetrance    p= 0.00e+00  TCP
   not_considered preweaning lethality, incomplete penetrance  p= 0.00e+00  WTSI

-- heterozygote (15)
   male           abnormal spleen morphology                   p= 0.00e+00  TCP
   female         decreased prepulse inhibition                p= 2.25e-11  TCP
   female         decreased prepulse inhibition                p= 1.35e-08  TCP
   female         decreased locomotor activity                 p= 2.18e-07  TCP
   female         decreased locomotor activity                 p= 6.98e-07  TCP
   female         decreased prepulse inhibition                p= 2.75e-06  TCP
   female         increased freezing behavior                  p= 4.02e-06  TCP
   female         decreased locomotor activity                 p= 4.73e-06  TCP
   female         decreased exploration in new environment     p= 7.02e-06  TCP
   female         abnormal freezing behavior                   p= 1.02e-05  TCP
   male           decreased fasting circulating glucose level  p= 1.27e-05  TCP
   female         increased freezing behavior                  p= 1.80e-05  TCP
   female         impaired cued conditioning behavior          p= 3.27e-05  TCP
   not_considered decreased locomotor activity                 p= 7.35e-05  TCP
   female         increased circulating creatinine level       p= 9.37e-05  TCP

by sex     : {'female': 14, 'male': 5, 'not_considered': 3}
by allele  : {'Arid1b<em1(IMPC)Tcp>': 20, 'Arid1b<tm1b(EUCOMM)Hmgu>': 2}
```

The default assumption — *a knockout means the homozygote* — returns lethality, edema and
male infertility here, and loses the entire neurobehavioural phenotype that actually
matches the human disease. The two zygosities are not two views of one result; they are
two experiments, run on different animals.

Three more things visible in that output:

- **The same MP term appears more than once** because a term can be called from several
  parameters within a procedure. Deduplicate on `(mp_term_id, zygosity, sex)` before
  counting phenotypes, or you will overstate breadth.
- **Two alleles, two centres.** Twenty calls come from a CRISPR allele at TCP and two from
  a knockout-first allele at HMGU. Aggregating across alleles is usually what you want;
  saying so is mandatory.
- **Fourteen of 22 calls are female.** That is a claim about the female cohort, and the
  next section is about what it does and does not mean.

## Sex, and what a female-only call is telling you

The mixed model fits males and females together, estimates a genotype effect in each, and
tests a sex-by-genotype interaction. `sex` on a call says which of those estimates
cleared 1e-04. `not_considered` means the call came from the combined model.

The `statistical-result` core carries the whole model output behind any call.

```python
DETAIL = ("parameter_name,parameter_stable_id,procedure_name,statistical_method,"
          "p_value,genotype_effect_p_value,effect_size,classification_tag,"
          "female_mutant_count,male_mutant_count,female_control_count,"
          "male_control_count,female_ko_effect_p_value,male_ko_effect_p_value,"
          "interaction_effect_p_value,interaction_significant,sex,phenotype_sex,"
          "mp_term_name,significant,status,data_type")

n, rows = solr("statistical-result",
               'marker_symbol:Arid1b AND mp_term_name:"decreased prepulse inhibition"',
               rows=10, fl=DETAIL, fq="significant:true")
r = min(rows, key=lambda x: x["p_value"])
print(f"{n} significant prepulse-inhibition results; strongest:")
for k in ("parameter_name", "procedure_name", "statistical_method", "data_type",
          "mp_term_name", "sex", "phenotype_sex", "p_value",
          "genotype_effect_p_value", "female_ko_effect_p_value",
          "male_ko_effect_p_value", "interaction_effect_p_value",
          "interaction_significant", "effect_size", "female_mutant_count",
          "male_mutant_count", "female_control_count", "male_control_count",
          "classification_tag"):
    print(f"  {k:26} {r.get(k)}")

# How big is a knockout cohort, across every significant result in the release?
url = f"{SOLR}/statistical-result/select?" + urllib.parse.urlencode(
    {"q": "significant:true", "rows": 0, "wt": "json",
     "json.facet": json.dumps({"f": "percentile(female_mutant_count,25,50,75)",
                               "m": "percentile(male_mutant_count,25,50,75)"})})
with urllib.request.urlopen(url, timeout=180) as fh:
    pct = json.loads(fh.read())["facets"]
print()
# Round -- Solr's percentile is an estimate and its float tail jitters between calls.
print("mutant cohort size, 25th/50th/75th percentile — female:",
      [round(v, 1) for v in pct["f"]], " male:", [round(v, 1) for v in pct["m"]])
print("significance vocabulary:")
for tag, count in facet("statistical-result", "significant:true",
                        "classification_tag", limit=8):
    print(f"  {count:6}  {tag[:96]}")
```

```
3 significant prepulse-inhibition results; strongest:
  parameter_name             % Pre-pulse inhibition - PPI3
  procedure_name             Acoustic Startle and Pre-pulse Inhibition (PPI)
  statistical_method         Linear Mixed Model framework, LME, including Weight
  data_type                  unidimensional
  mp_term_name               decreased prepulse inhibition
  sex                        female
  phenotype_sex              ['male', 'female']
  p_value                    2.25169882739351e-11
  genotype_effect_p_value    2.25169882739351e-11
  female_ko_effect_p_value   2.25170082046368e-11
  male_ko_effect_p_value     0.00100644225963713
  interaction_effect_p_value 0.0177891726540652
  interaction_significant    True
  effect_size                -1.83404958945701
  female_mutant_count        8
  male_mutant_count          8
  female_control_count       849
  male_control_count         807
  classification_tag         Overally significant [level =  1e-04 , pvalue =  2.25169882739351e-11 ]; and with phenotype threshold value 1e-04 - different size as females greater

mutant cohort size, 25th/50th/75th percentile — female: [6.0, 8.0, 8.0]  male: [6.0, 7.0, 8.0]
significance vocabulary:
   10067  With phenotype threshold value 1e-04 - both sexes equally
    2035  With phenotype threshold value 1e-04 - Significant for males only
    1624  With phenotype threshold value 1e-04 - significant in males and in combined dataset
    1525  With phenotype threshold value 1e-04 - significant in combined dataset only
    1523  With phenotype threshold value 1e-04 - significant in males, females and in combined dataset
    1409  With phenotype threshold value 1e-04 - significant in females and in combined dataset
    1210  With phenotype threshold value 1e-04 - a significant change for the one sex (male) tested
    1167  With phenotype threshold value 1e-04 - a significant change for the one sex (female) tested
```

Read that record carefully, because a summary of it would be wrong three different ways.

- The call is filed under `sex: female`, but the effect is **not absent in males** —
  `male_ko_effect_p_value` is 1.0e-03, which misses the 1e-04 threshold and would be
  significant almost anywhere else. IMPC's own `classification_tag` says *different size
  as females greater*, which is the honest reading: a difference of magnitude, not a
  sex-limited phenotype.
- The sex-by-genotype interaction is p = 0.018. That is suggestive on **8 mutants per
  sex** and nothing more. Reporting "female-specific" from this record overstates it.
- **`interaction_significant` is not a dimorphism filter.** It is `true` on all 204,571
  records that carry it and `false` on none, including records whose
  `interaction_effect_p_value` is 1.0. Filter on `interaction_effect_p_value`, or read
  `classification_tag`, and never on that boolean.

For the sexual-dimorphism question generally, `classification_tag` is the field IMPC
computes for exactly this purpose. Its vocabulary distinguishes *both sexes equally*,
*significant for males only*, *a significant change for the one sex tested* — which means
the model had only that sex's cohort, and on the 1,361 records carrying it
`female_mutant_count` is usually absent altogether — and *different size as females
greater*. Those four are different claims and only the second and fourth are about
dimorphism at all. `phenotype_sex` carries the same information as a list: `['male']`
where one sex was modelled, `['male', 'female']` where both were.

## Viability and fertility are not phenotype calls

Whether the homozygote survives is decided by the centre from the genotype ratios of
weaned pups, not by the statistical pipeline, and it is the highest-value single fact
IMPC produces — 2,139 of the lines tested so far are homozygous lethal.

Getting it out is the sharpest trap in this resource. **Three parameters carry a viability
verdict, spread over two procedures, and they store it in two different fields.**

```python
# Three parameters carry a viability verdict, across two procedures, and the
# verdict lives in a different field depending on how the record was recorded.
# Parameter numbering does not track procedure numbering -- IMPC_VIA_002_001 is a
# parameter of procedure IMPC_VIA_001, while procedure IMPC_VIA_002 holds
# IMPC_VIA_063_001 through IMPC_VIA_067_001.
VIABILITY = {
    "IMPC_VIA_001_001": ("category",   "Viability Outcome (procedure IMPC_VIA_001)"),
    "IMPC_VIA_067_001": ("text_value", "Homozygous animals viability (IMPC_VIA_002)"),
    "IMPC_VIA_065_001": ("text_value", "Hemizygous males viability (IMPC_VIA_002)"),
}
# Values that are not a verdict. Filter them out or they inflate every count.
NOT_A_CALL = {"Cannot be calculated", "Insufficient numbers to make a call"}

total = 0
for pid, (field, label) in VIABILITY.items():
    counts = {v: n for v, n in facet("experiment", f"parameter_stable_id:{pid}", field)
              if v not in NOT_A_CALL}
    total += sum(counts.values())
    print(f"{pid}  {field:10}  {label}")
    print(f"    {counts}")
print("verdicts across all three:", total)

# Reading one gene's viability means reading whichever field its record used.
FL = ("gene_symbol,parameter_stable_id,category,text_value,zygosity,"
      "phenotyping_center,colony_id")
q = " OR ".join(f"parameter_stable_id:{p}" for p in VIABILITY)
for gene in ("Arid1b", "Cad", "Bbs5", "A4galt"):
    _, docs = solr("experiment", f"gene_symbol:{gene}", rows=20, fl=FL, fq=q)
    for d in sorted(docs, key=lambda x: x["parameter_stable_id"]):
        verdict = d.get("category") or d.get("text_value")
        if verdict in NOT_A_CALL:
            continue
        print(f"{gene:8} {d['parameter_stable_id']} {d['phenotyping_center']:12} "
              f"{d['colony_id']:22} {verdict}")
```

```
IMPC_VIA_001_001  category    Viability Outcome (procedure IMPC_VIA_001)
    {'Homozygous - Viable': 3186, 'Homozygous - Lethal': 1178, 'Homozygous - Subviable': 373, 'Hemizygous - Viable': 9, 'Hemizygous - Lethal': 3}
IMPC_VIA_067_001  text_value  Homozygous animals viability (IMPC_VIA_002)
    {'Homozygous - Viable': 2952, 'Homozygous - Lethal': 958, 'Homozygous - Subviable': 364}
IMPC_VIA_065_001  text_value  Hemizygous males viability (IMPC_VIA_002)
    {'Hemizygous - Viable': 138, 'Hemizygous - Subviable': 1}
verdicts across all three: 9162
Arid1b   IMPC_VIA_001_001 WTSI         PMAX                   Homozygous - Subviable
Arid1b   IMPC_VIA_067_001 TCP          TCPR0317_ABZG          Homozygous - Lethal
Cad      IMPC_VIA_067_001 UC Davis     CR10173                Homozygous - Lethal
Bbs5     IMPC_VIA_001_001 MRC Harwell  H-BBS5-C06-TM1B-2      Homozygous - Viable
A4galt   IMPC_VIA_001_001 MRC Harwell  H-A4GALT-D11-TM1B      Homozygous - Viable
```

Query only `IMPC_VIA_001_001` and you get 4,749 of 9,162 verdicts. The 4,413 you lose are
the ones recorded under the newer procedure, which is where UC Davis, BCM, TCP and
CCP-IMG report — so the omission is not random across the consortium, it drops whole
centres. There is no error and nothing looks truncated. That is the shape of failure this
resource specialises in.

Two more things in that output:

- **`observation_type` decides the field.** The older procedure records a
  `categorical` observation with the answer in `category`; the newer one records a `text`
  observation with the answer in `text_value`. Read `d.get("category") or
  d.get("text_value")`.
- **Centres disagree.** `Arid1b` is *Homozygous - Lethal* at TCP on a CRISPR allele and
  *Homozygous - Subviable* at WTSI on a knockout-first allele. Both are correct
  observations of different colonies. Report the allele and centre, not a single verdict.

Fertility is separate again, under procedure group `IMPC_FER`, recorded as male and
female screens with mating, litter and pup counts. Complete infertility surfaces in
`genotype-phenotype` as `male infertility` or `female infertility` — as it does for
`Arid1b` above.

## Get the files

Two routes, and the choice is between one gene and the genome.

**Route A — Solr, for a set of genes.** Phenotype calls, the full statistical evidence
behind them including the analyses that found nothing, and the viability verdicts,
written as TSVs beside a manifest stamped with the data release. Calls are recomputed
every release; an extract without a release stamp cannot be compared against a later one.

```python
import csv
import datetime
import json
import os
import re
import urllib.parse
import urllib.request

SOLR = "https://www.ebi.ac.uk/mi/impc/solr"
FTP = "https://ftp.ebi.ac.uk/pub/databases/impc/all-data-releases"
GENES = ["Arid1b", "Bbs5", "Cib2"]
OUT = "Data/impc"
VIA = "IMPC_VIA_001_001 OR IMPC_VIA_067_001 OR IMPC_VIA_065_001"


def release():
    """Which data release the Solr cores are serving. Stamp every extract with it."""
    with urllib.request.urlopen(f"{FTP}/latest/README.md", timeout=60) as fh:
        return re.search(r"data release (\d+\.\d+)", fh.read().decode()).group(1)


def fetch(core, q, fl, page=5000, **params):
    """Every row for one query, paged. Solr will hand back millions if asked."""
    rows, start = [], 0
    while True:
        url = f"{SOLR}/{core}/select?" + urllib.parse.urlencode(
            {"q": q, "fl": fl, "rows": page, "start": start, "wt": "json",
             **params}, doseq=True)
        with urllib.request.urlopen(url, timeout=180) as fh:
            body = json.loads(fh.read())
        rows += body["response"]["docs"]
        total = body["response"]["numFound"]
        start += page
        if start >= total:
            break
    assert len(rows) == total, f"{core}: got {len(rows)} of {total}"
    return rows, total


def write_tsv(path, rows, cols):
    """Multi-valued Solr fields come back as lists -- join, never str() them."""
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh, delimiter="\t", lineterminator="\n")
        w.writerow(cols)
        for r in rows:
            w.writerow(["|".join(map(str, r[c])) if isinstance(r.get(c), list)
                        else r.get(c, "") for c in cols])
    return {"path": path, "rows": len(rows), "bytes": os.path.getsize(path)}


CALL_COLS = ["marker_symbol", "marker_accession_id", "allele_symbol",
             "allele_accession_id", "zygosity", "sex", "life_stage_name",
             "mp_term_id", "mp_term_name", "top_level_mp_term_name",
             "parameter_stable_id", "parameter_name", "procedure_name",
             "p_value", "effect_size", "percentage_change",
             "statistical_method", "phenotyping_center", "strain_name",
             "colony_id", "resource_name"]

STAT_COLS = ["marker_symbol", "allele_symbol", "zygosity", "sex",
             "parameter_stable_id", "parameter_name", "data_type",
             "statistical_method", "status", "significant", "p_value",
             "genotype_effect_p_value", "female_ko_effect_p_value",
             "male_ko_effect_p_value", "interaction_effect_p_value",
             "effect_size", "female_mutant_count", "male_mutant_count",
             "female_control_count", "male_control_count",
             "classification_tag", "mp_term_id", "mp_term_name",
             "phenotyping_center"]

VIA_COLS = ["gene_symbol", "gene_accession_id", "allele_symbol", "zygosity",
            "parameter_stable_id", "parameter_name", "outcome",
            "phenotyping_center", "colony_id", "metadata"]

os.makedirs(OUT, exist_ok=True)
gene_q = " OR ".join(GENES)
manifest = {"data_release": release(), "retrieved": datetime.date.today().isoformat(),
            "source": SOLR, "genes": GENES, "files": [], "counts": {}}

calls, n = fetch("genotype-phenotype", f"marker_symbol:({gene_q})",
                 ",".join(CALL_COLS))
manifest["files"].append(write_tsv(f"{OUT}/phenotype_calls.tsv", calls, CALL_COLS))
manifest["counts"]["phenotype_calls"] = n

# Every analysis, not only the ones that cleared 1e-04 -- that is what makes an
# absent phenotype readable as "tested and unremarkable" rather than "unknown".
stats, n = fetch("statistical-result", f"marker_symbol:({gene_q})",
                 ",".join(STAT_COLS), fq="status:Successful")
manifest["files"].append(write_tsv(f"{OUT}/statistical_results.tsv", stats, STAT_COLS))
manifest["counts"]["successful_analyses"] = n
manifest["counts"]["significant_analyses"] = sum(1 for s in stats if s.get("significant"))

# The verdict is in `category` or in `text_value` depending on the procedure, and
# the placeholders below are not verdicts -- keep them out of the file.
via, _ = fetch("experiment", f"gene_symbol:({gene_q})",
               ",".join(c for c in VIA_COLS if c != "outcome") + ",category,text_value",
               fq=f"parameter_stable_id:({VIA})")
for v in via:
    v["outcome"] = v.get("category") or v.get("text_value")
via = [v for v in via if v["outcome"] not in
       ("Cannot be calculated", "Insufficient numbers to make a call")]
manifest["files"].append(write_tsv(f"{OUT}/viability.tsv", via, VIA_COLS))
manifest["counts"]["viability_verdicts"] = len(via)

with open(f"{OUT}/manifest.json", "w") as fh:
    json.dump(manifest, fh, indent=2)

for f in manifest["files"]:
    print(f"{f['path']:34} {f['rows']:5} rows  {f['bytes']:8} bytes")
print("release", manifest["data_release"], "|", manifest["counts"])
```

```
Data/impc/phenotype_calls.tsv         97 rows     35753 bytes
Data/impc/statistical_results.tsv   1131 rows    294386 bytes
Data/impc/viability.tsv                4 rows      1169 bytes
release 24.0 | {'phenotype_calls': 97, 'successful_analyses': 1131, 'significant_analyses': 73, 'viability_verdicts': 4}
```

**Route B — the release reports, for anything genome-wide.** Each release publishes
pre-computed CSVs on the EBI FTP. They are the reproducible artefact: fixed at release
time, citable by release number, and normalised across the procedure differences that
make the API awkward. For viability in particular the report is the better answer,
because it folds both procedures and the hemizygous lines into one
`Viability Phenotype HOMs/HEMIs` column.

```bash
FTP=https://ftp.ebi.ac.uk/pub/databases/impc/all-data-releases
REL=$(curl -s "$FTP/latest/README.md" | sed -n 's/.*data release \([0-9.]*[0-9]\).*/\1/p' | head -1)
mkdir -p "Data/impc-release-$REL"
echo "data release $REL"

# Pin the release rather than following `latest` -- `latest` moves under you, and
# every number in these files is recomputed at each release.
for f in genotype-phenotype-assertions-IMPC.csv.gz viability.csv.gz \
         fertility-3-detailed.csv.gz phenotypeHitsPerGene.csv.gz; do
  curl -sS -o "Data/impc-release-$REL/$f" "$FTP/release-$REL/results/$f"
  printf '%-42s %9s bytes  %8s data rows\n' "$f" \
    "$(wc -c < "Data/impc-release-$REL/$f" | tr -d ' ')" \
    "$(( $(gzip -dc "Data/impc-release-$REL/$f" | wc -l) - 1 ))"
done

gzip -dc "Data/impc-release-$REL/genotype-phenotype-assertions-IMPC.csv.gz" | head -1 | tr ',' ' '
```

```
data release 24.0
genotype-phenotype-assertions-IMPC.csv.gz    4458965 bytes     62463 data rows
viability.csv.gz                              479554 bytes      9162 data rows
fertility-3-detailed.csv.gz                   173406 bytes     11848 data rows
phenotypeHitsPerGene.csv.gz                   236375 bytes      9662 data rows
marker_accession_id marker_symbol phenotyping_center colony_id sex zygosity allele_accession_id allele_symbol allele_name strain_accession_id strain_name project_name pipeline_name pipeline_stable_id procedure_stable_id procedure_name parameter_stable_id parameter_name top_level_mp_term_id top_level_mp_term_name mp_term_id mp_term_name p_value percentage_change effect_size statistical_method resource_name
```

The IMPC assertions file holds exactly the 62,463 rows the API returns for
`resource_name:IMPC`, with the same column names as the Solr fields, which is what makes
the two routes interchangeable for phenotype calls. Other reports in the same directory
worth knowing: `statistical-results-ALL.csv.gz` (every analysis, ~564 MB compressed),
`procedureCompletenessAndPhenotypeHits.csv.gz` (which procedures each line completed —
the direct answer to *was this even tested*), `fertility-1-summary.csv.gz`,
`laczExpression.csv.gz`, and `data-overview-*` roll-ups. Bulk JSON prepared for
per-gene retrieval sits under `impc-bulk-api/gene_bundles_json/` in the same release
directory.

## An optional Python client

IMPC publishes a thin wrapper over the same Solr endpoints, Apache-2.0 licensed, which
returns a pandas DataFrame and adds field-name validation.

```bash
python3 -m venv .venv-impc
.venv-impc/bin/pip install --quiet --disable-pip-version-check impc-api
.venv-impc/bin/python - <<'PY'
from impc_api import solr_request

found, df = solr_request(core="genotype-phenotype", params={
    "q": "marker_symbol:Bbs5",
    "rows": 5,
    "fl": "marker_symbol,mp_term_name,zygosity,sex,p_value",
})
print("type   :", type(df).__name__)
print("found  :", found, "| rows returned:", len(df))
PY
```

```

Your request:
https://www.ebi.ac.uk/mi/impc/solr/genotype-phenotype/select?q=marker_symbol%3ABbs5&rows=5&fl=marker_symbol%2Cmp_term_name%2Czygosity%2Csex%2Cp_value

Number of found documents: 48

  marker_symbol                                       mp_term_name  \
0          Bbs5                     increased monocyte cell number   
1          Bbs5   increased circulating alanine transaminase level   
2          Bbs5                            abnormal bone structure   
3          Bbs5                               increased hematocrit   
4          Bbs5  increased circulating aspartate transaminase l...   

        p_value     sex    zygosity  
0  6.745574e-13    male  homozygote  
1  2.093149e-11  female  homozygote  
2  1.833341e-37  female  homozygote  
3  1.659914e-07  female  homozygote  
4  8.477182e-11    male  homozygote  
type   : DataFrame
found  : 48 | rows returned: 5
```

It works, and it is a reasonable choice in a notebook. Note that everything above the two
`print` lines in that output is the package talking, not the script: `solr_request` writes
the request URL, the document count and a DataFrame preview to stdout on **every** call,
with no argument to suppress it. That is the first of two reasons everything else in this
skill uses `urllib` instead — it makes the client awkward inside a pipeline. The second is
that it wraps the same `/select` calls documented here, so the dependency buys an agent
nothing it does not already have. The traps in this document are properties of the Solr
schema and apply identically through either route — the package will not save you from
`rows`, from case sensitivity, or from querying one viability parameter.

## Try it

A self-contained check that this skill still holds. Public data, no account, no key, no
install — Python 3 standard library only. Runs in about 25 seconds.

**Data** — four IMPC Solr cores, the release README, and one release report, all open
under CC-BY 4.0 with no account required:

    https://www.ebi.ac.uk/mi/impc/solr/genotype-phenotype/select?q=marker_symbol:Arid1b&rows=200&wt=json
    https://www.ebi.ac.uk/mi/impc/solr/statistical-result/select?q=marker_symbol:A4galt&fq=status:Successful&rows=0&wt=json
    https://www.ebi.ac.uk/mi/impc/solr/gene/select?q=human_gene_symbol:ARID1B&rows=5&wt=json
    https://www.ebi.ac.uk/mi/impc/solr/experiment/select?q=parameter_stable_id:IMPC_VIA_067_001&rows=0&wt=json
    https://ftp.ebi.ac.uk/pub/databases/impc/all-data-releases/latest/README.md
    https://ftp.ebi.ac.uk/pub/databases/impc/all-data-releases/latest/results/viability.csv.gz

`Arid1b` is the probe because its homozygote is lethal and its heterozygote carries the
disease-relevant phenotype, so a query that assumes homozygosity fails on it visibly.
`Bbs5` (48 calls), `A4galt` (tested, nothing significant) and `Ndufs4` (never tested) are
the three states of "no phenotype". `HBB` and `C9orf72` are the ortholog counter-examples.
The viability check reconciles the API against the release report because a single-parameter
query passes every internal consistency check while losing half the answer. Last confirmed
reachable 2026-08-27.

```python
import csv
import gzip
import io
import json
import re
import urllib.error
import urllib.parse
import urllib.request

SOLR = "https://www.ebi.ac.uk/mi/impc/solr"
FTP = "https://ftp.ebi.ac.uk/pub/databases/impc/all-data-releases"


def get(core, q, rows=0, **params):
    url = f"{SOLR}/{core}/select?" + urllib.parse.urlencode(
        {"q": q, "rows": rows, "wt": "json", **params}, doseq=True)
    with urllib.request.urlopen(url, timeout=180) as fh:
        body = json.loads(fh.read())
    return body["response"]["numFound"], body["response"]["docs"]


def facet(core, q, field, limit=400, **params):
    url = f"{SOLR}/{core}/select?" + urllib.parse.urlencode(
        {"q": q, "rows": 0, "wt": "json", "facet": "true", "facet.field": field,
         "facet.limit": limit, "facet.mincount": 1, **params}, doseq=True)
    with urllib.request.urlopen(url, timeout=180) as fh:
        flat = json.loads(fh.read())["facet_counts"]["facet_fields"][field]
    return dict(zip(flat[::2], flat[1::2]))


# 0. Which release the cores are serving. Every number below is release-specific.
with urllib.request.urlopen(f"{FTP}/latest/README.md", timeout=60) as fh:
    REL = re.search(r"data release (\d+\.\d+)", fh.read().decode()).group(1)
print("data release           :", REL)

# 1. rows defaults to 10. Nothing in the payload says the answer was cut.
url = f"{SOLR}/genotype-phenotype/select?q=marker_symbol:Bbs5&wt=json"
with urllib.request.urlopen(url, timeout=120) as fh:
    body = json.loads(fh.read())
n_bbs5 = body["response"]["numFound"]
assert len(body["response"]["docs"]) == 10 < n_bbs5, body["response"]["numFound"]
print(f"Bbs5 default page      : {len(body['response']['docs'])} of {n_bbs5} calls")

# 2. Identifier fields are strings. Case is not folded, and a wrong case is 0,
#    not an error. Same for a colon or a space inside an unquoted value -- 400.
assert get("genotype-phenotype", "marker_symbol:bbs5")[0] == 0
assert get("genotype-phenotype", "marker_symbol:Bbs5")[0] == n_bbs5
for bad in ("mp_term_id:MP:0001262", "phenotyping_center:MRC Harwell"):
    try:
        get("genotype-phenotype", bad)
        raise AssertionError(f"{bad} should have been rejected")
    except urllib.error.HTTPError as exc:
        assert exc.code == 400, exc.code
print("bbs5 / Bbs5            :", get("genotype-phenotype", "marker_symbol:bbs5")[0],
      "/", n_bbs5, "| unquoted colon and space both HTTP 400")

# 3. Human symbol -> mouse gene, exact case, and one-to-many.
FL = "marker_symbol,mgi_accession_id"
_, arid = get("gene", "human_gene_symbol:ARID1B", rows=5, fl=FL)
assert [d["marker_symbol"] for d in arid] == ["Arid1b"], arid
n_hbb, hbb = get("gene", "human_gene_symbol:HBB", rows=5, fl=FL)
assert n_hbb == 2, hbb
assert get("gene", "human_gene_symbol:C9ORF72")[0] == 0
assert get("gene", "human_gene_symbol:C9orf72")[0] == 1
print("ARID1B / HBB / C9orf72 :", arid[0]["marker_symbol"], "/",
      sorted(d["marker_symbol"] for d in hbb), "/ HGNC case required")

# 4. Zygosity decides the answer. Arid1b homozygotes die; the heterozygote is
#    the genotype that models human ARID1B haploinsufficiency.
CALLS = "mp_term_name,zygosity,sex,p_value,phenotyping_center,procedure_name"
n_arid, calls = get("genotype-phenotype", "marker_symbol:Arid1b", rows=200, fl=CALLS)
hom = [c for c in calls if c["zygosity"] == "homozygote"]
het = [c for c in calls if c["zygosity"] == "heterozygote"]
assert len(hom) + len(het) == n_arid == len(calls)
assert any("lethality" in c["mp_term_name"] for c in hom), hom
assert het and not any("lethality" in c["mp_term_name"] for c in het)
behav = sorted({c["mp_term_name"] for c in het
                if c["mp_term_name"].split()[-1] in ("inhibition", "activity", "behavior")})
assert behav, het
print(f"Arid1b calls           : {n_arid} total, {len(hom)} homozygote, {len(het)} heterozygote")
print(f"  heterozygote only    : {', '.join(behav)}")
print(f"  by sex               : {facet('genotype-phenotype', 'marker_symbol:Arid1b', 'sex')}")

# 5. The threshold is p < 1e-04, and the exceptions are all the viability screen,
#    which is a line-level call made by the centre rather than by the pipeline.
n_loose, loose = get("genotype-phenotype", "resource_name:IMPC", rows=200,
                     fq="p_value:{0.0001 TO *]", fl="procedure_name,p_value")
assert {d["procedure_name"] for d in loose} == {"Viability Primary Screen"}, loose[:3]
assert all(c["p_value"] < 1e-4 for c in calls
           if c["procedure_name"] != "Viability Primary Screen")
print(f"IMPC calls over 1e-04  : {n_loose}, all from "
      f"{sorted({d['procedure_name'] for d in loose})[0]}")

# 6. Three different states hide behind "no phenotype", and only one of them
#    means the knockout was normal.
for gene in ("Bbs5", "A4galt", "Ndufs4"):
    called, _ = get("genotype-phenotype", f"marker_symbol:{gene}")
    tested, _ = get("statistical-result", f"marker_symbol:{gene}", fq="status:Successful")
    print(f"{gene:9} calls={called:3} successful analyses={tested:4}")
assert get("genotype-phenotype", "marker_symbol:A4galt")[0] == 0
assert get("statistical-result", "marker_symbol:A4galt", fq="status:Successful")[0] > 0
assert get("statistical-result", "marker_symbol:Ndufs4")[0] == 0

# 7. Cohorts are small, and `interaction_significant` is not a dimorphism filter.
STAT = ("female_mutant_count,male_mutant_count,female_control_count,"
        "male_control_count,female_ko_effect_p_value,male_ko_effect_p_value,"
        "interaction_effect_p_value,classification_tag,p_value")
_, top = get("statistical-result",
             'marker_symbol:Arid1b AND mp_term_name:"decreased prepulse inhibition"',
             rows=10, fq="significant:true", fl=STAT)
r = min(top, key=lambda x: x["p_value"])
assert r["female_mutant_count"] < 20 and r["male_mutant_count"] < 20, r
assert r["female_ko_effect_p_value"] < 1e-4 <= r["male_ko_effect_p_value"], r
assert facet("statistical-result", "*:*", "interaction_significant") \
    .keys() == {"true"}, "interaction_significant now has a false value"
print(f"Arid1b PPI3 cohort     : {r['female_mutant_count']}F/{r['male_mutant_count']}M "
      f"mutant vs {r['female_control_count']}F/{r['male_control_count']}M control")
print(f"  per-sex p            : female {r['female_ko_effect_p_value']:.2e}, "
      f"male {r['male_ko_effect_p_value']:.2e}, "
      f"sex-by-genotype {r['interaction_effect_p_value']:.3f}")

# 8. Viability is three parameters over two procedures, in two different fields.
#    Query one and you lose between a third and a half of the genome-wide answer.
VIABILITY = {"IMPC_VIA_001_001": "category", "IMPC_VIA_067_001": "text_value",
             "IMPC_VIA_065_001": "text_value"}
NOT_A_CALL = {"Cannot be calculated", "Insufficient numbers to make a call"}
verdicts = {}
for pid, field in VIABILITY.items():
    verdicts[pid] = {v: n for v, n in
                     facet("experiment", f"parameter_stable_id:{pid}", field).items()
                     if v not in NOT_A_CALL}
api_total = sum(sum(v.values()) for v in verdicts.values())
by_call = {}
for counts in verdicts.values():
    for label, n in counts.items():
        by_call[label.split(" - ")[1].lower()] = by_call.get(label.split(" - ")[1].lower(), 0) + n

with urllib.request.urlopen(f"{FTP}/release-{REL}/results/viability.csv.gz",
                            timeout=300) as fh:
    report = list(csv.DictReader(io.TextIOWrapper(
        gzip.GzipFile(fileobj=io.BytesIO(fh.read())), encoding="utf-8")))
rep_call = {}
for row in report:
    rep_call[row["Viability Phenotype HOMs/HEMIs"]] = \
        rep_call.get(row["Viability Phenotype HOMs/HEMIs"], 0) + 1

assert api_total == len(report), (api_total, len(report))
assert by_call["lethal"] == rep_call["lethal"], (by_call, rep_call)
print(f"viability, API / release {REL} report : {api_total} / {len(report)} lines")
print("  API    :", dict(sorted(by_call.items())))
print("  report :", dict(sorted(rep_call.items())))
print("  single-parameter view  :",
      {pid: sum(v.values()) for pid, v in verdicts.items()})
```

**Expect**

Invariants — these hold regardless of release, and a failure means this skill is wrong:

- **A request with no `rows` returns exactly 10 documents while `numFound` is larger.**
  This is the assertion the whole first section exists for.
- **`marker_symbol:bbs5` returns 0 and `marker_symbol:Bbs5` returns the full count.**
  If lowercase ever starts matching, the fields have been re-analysed and every query in
  this skill needs re-checking.
- **An unquoted colon or space is HTTP 400, not an empty result set.** Both
  `mp_term_id:MP:0001262` and `phenotyping_center:MRC Harwell` must raise.
- **`human_gene_symbol` is case-exact and one-to-many.** `C9ORF72` returns 0 while
  `C9orf72` returns 1; `HBB` returns two mouse genes. Taking `docs[0]` on `HBB` is a coin
  flip, which is the point.
- **`Arid1b` has both homozygote and heterozygote calls, lethality appears only in the
  homozygote, and behavioural calls appear only in the heterozygote.** A filter on
  `zygosity:homozygote` therefore loses the phenotype that matches the human disease.
- **Every IMPC call above p = 1e-04 comes from the Viability Primary Screen.** That is
  what makes 1e-04 a real threshold for the statistical pipeline and not for line-level
  calls. If a non-viability procedure ever appears in that set, the threshold has moved.
- **`A4galt` has zero phenotype calls and a non-zero count of successful analyses;
  `Ndufs4` has zero of both.** These are different states and must not be summarised the
  same way.
- **Mutant cohorts are single-digit and controls are in the hundreds**, and on the
  `Arid1b` prepulse-inhibition record the female per-sex p-value clears 1e-04 while the
  male one does not. The sex-specific label is a threshold crossing, not an absence of
  effect in males.
- **`interaction_significant` has no `false` value anywhere in the core.** It is not a
  sexual-dimorphism filter, and asserting this is what stops anyone using it as one.
- **The three viability parameters together reconcile with the release report row for
  row**, and the `lethal` counts agree exactly. A single-parameter query does not.

Observed 2026-08-27 against **IMPC data release 24.0** (16 March 2026, GRCm39, OpenStats
1.20.0) — these move when IMPC releases, so treat a mismatch as drift to investigate
rather than as a failure:

```
data release           : 24.0
Bbs5 default page      : 10 of 48 calls
bbs5 / Bbs5            : 0 / 48 | unquoted colon and space both HTTP 400
ARID1B / HBB / C9orf72 : Arid1b / ['Hbb-bs', 'Hbb-bt'] / HGNC case required
Arid1b calls           : 22 total, 7 homozygote, 15 heterozygote
  heterozygote only    : abnormal freezing behavior, decreased locomotor activity, decreased prepulse inhibition, impaired cued conditioning behavior, increased freezing behavior
  by sex               : {'female': 14, 'male': 5, 'not_considered': 3}
IMPC calls over 1e-04  : 77, all from Viability Primary Screen
Bbs5      calls= 48 successful analyses= 205
A4galt    calls=  0 successful analyses= 133
Ndufs4    calls=  0 successful analyses=   0
Arid1b PPI3 cohort     : 8F/8M mutant vs 849F/807M control
  per-sex p            : female 2.25e-11, male 1.01e-03, sex-by-genotype 0.018
viability, API / release 24.0 report : 9162 / 9162 lines
  API    : {'lethal': 2139, 'subviable': 738, 'viable': 6285}
  report : {'lethal': 2139, 'subviable': 739, 'viable': 6284}
  single-parameter view  : {'IMPC_VIA_001_001': 4749, 'IMPC_VIA_067_001': 4274, 'IMPC_VIA_065_001': 139}
```

The API and the report disagree on exactly one of 9,162 lines, and the cause is known
rather than mysterious: colony `IP00005474a` (*Cntnap1*) is `Homozygous - Viable` on
`IMPC_VIA_001_001` and `subviable` in the report, because the report also folds in the
`Additional Outcome` parameter `IMPC_VIA_002_001`, which records `Homozygous - Reduced
Life Span` for that line and five others. The assertion is therefore on the totals and on
`lethal`, which is the count anyone actually uses, rather than on a three-way match that
would fail for a reason that is not a bug.

## Limits worth stating in a write-up

- **Release, always.** Calls are recomputed each release with the pipeline of the day.
  Release 24.0 added roughly 4.5 million data points and still holds *fewer* phenotype
  calls than 23.0, because it dropped duplicated Histopathology and Gross Pathology
  calls. A phenotype claim without a release number is not reproducible.
- **Genetic background.** Almost everything is C57BL/6N — `C57BL/6NTac`, `C57BL/6NCrl`,
  `C57BL/6NJ`. Strain background modifies phenotype, and this one is not the C57BL/6J
  most labs use.
- **Screen, not a study.** The pipeline measures what the pipeline measures. A gene with
  no cardiac phenotype may simply never have reached the cardiac procedure; check
  `procedureCompletenessAndPhenotypeHits.csv.gz` or the `statistical-result` core rather
  than assuming.
- **Legacy resources share the core.** `resource_name` separates `IMPC` from
  `EuroPhenome`, `MGP`, `3i` and `pwg`, which used different pipelines and thresholds.
  Filter unless you mean to pool them.
- **No multiple-testing correction across parameters.** 1e-04 is a fixed per-parameter
  threshold, not an FDR over the hundreds of analyses a fully-phenotyped line
  receives — 466 for `Arid1b`, 205 for `Bbs5`.
- **Mouse is not human.** A knockout phenotype is evidence about gene function, mapped to
  human biology through orthology and phenotype similarity, both of which fail
  gene by gene.

## Sources

- IMPC portal — https://www.mousephenotype.org/
- Programmatic access documentation — https://www.mousephenotype.org/help/programmatic-data-access/
- Licence — https://www.mousephenotype.org/help/faqs/is-impc-data-freely-available/
- Release notes, currently 24.0 — https://www.mousephenotype.org/data/release/
- Release reports over HTTPS — https://ftp.ebi.ac.uk/pub/databases/impc/all-data-releases/
- IMPReSS, the pipeline, procedure and parameter definitions — https://www.mousephenotype.org/impress/
- Mammalian Phenotype ontology — https://www.informatics.jax.org/vocab/mp_ontology
- Dickinson et al. (2016) *Nature* 537, 508-514 — https://doi.org/10.1038/nature19356
- Groza et al. (2023) *Nucleic Acids Research* 51, D1038-D1045 — https://doi.org/10.1093/nar/gkac972
- Wilson et al. (2026) *Nucleic Acids Research* 54, D1133-D1142 — https://doi.org/10.1093/nar/gkaf1148
- Haselimashhadi et al. (2020) *PLoS ONE* 15, e0242933, the OpenStats package — https://doi.org/10.1371/journal.pone.0242933
- Haselimashhadi et al. (2020) *Bioinformatics* 36, 1492-1500, soft windowing — https://doi.org/10.1093/bioinformatics/btz744

IMPC data is published under CC-BY 4.0 — free to share and adapt for any purpose,
including commercially, with attribution. Cite the portal and Dickinson et al. (2016) as
IMPC asks, and state the data release with every number you report.
