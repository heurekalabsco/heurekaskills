---
name: open-targets
description: Ask the Open Targets Platform what is already known about a target or a disease — scored target-disease associations, the individual evidence records behind each score with their source and publication, tractability, and clinical candidates — over a public GraphQL API with no account. Resolves gene symbols and disease names to the Ensembl and MONDO identifiers the API demands.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [open-targets, drug-discovery, human-genetics, gwas, public-data]
covers: [open targets, target identification, target validation, therapeutic target, druggability, tractability, gene disease association, target-disease association, association score, evidence, provenance, known drugs, clinical trial phase, chembl, gwas, somatic mutation, cancer driver, clinvar, orphanet, rare disease, mouse model, text mining, europe pmc, mondo, efo, disease ontology, graphql, tp53, egfr, breast carcinoma]
papers: [PMID:27899665, PMID:30462303, PMID:33196847, PMID:36399499, PMID:39657122]
access: [open]
platform: opentargets
datasets: [https://ftp.ebi.ac.uk/pub/databases/opentargets/platform/26.06/output/evidence_orphanet/part-00000-cd6a04cb-4416-4a3a-9177-34497cde762c-c000.snappy.parquet, https://ftp.ebi.ac.uk/pub/databases/opentargets/platform/26.06/output/association_overall_direct/part-00000-c3eaa79c-fb08-4d4a-9391-a4eceb74fa7a-c000.snappy.parquet, https://ftp.ebi.ac.uk/pub/databases/opentargets/platform/26.06/output/association_by_datatype_direct/part-00000-0ba2e2c3-b65d-4905-9f32-51500ca726ea-c000.snappy.parquet, https://ftp.ebi.ac.uk/pub/databases/opentargets/platform/26.06/output/target/part-00000-810593a9-06e5-4201-a034-4d82bcbe81e7-c000.snappy.parquet]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: Open Targets Platform GraphQL API 26.6.3 / data release 26.06 / FTP release 26.06 and latest / Python 3.12.8 standard library only, plus pyarrow 25.0.1 for the bulk parquet / curl 8.7.1
  executed: 14
  unverified: 0
---
# Open Targets Platform

Open Targets aggregates what many separate resources say about a **target-disease pair** —
rare-disease gene panels, ClinVar submissions, GWAS credible sets, somatic driver catalogues,
mouse knockouts, clinical trials, text mining — and reduces each pair to one number plus the
evidence that produced it. On the 26.06 release, TP53 has **5,638** directly associated
diseases and **17,613** once ontology descendants are folded in; breast carcinoma has
**17,963** associated targets.

That makes it the fastest available answer to *is this target already implicated in this
disease, and on what*. One POST, and you get a ranked list with ontology identifiers and a
per-source breakdown instead of twenty abstracts.

**No account, no API key, no click-through.** The Platform data is dedicated to the public
domain under [CC0 1.0](https://platform-docs.opentargets.org/licence) and the code that serves
it is Apache-2.0. Attribution is expected rather than required, and the licence page carries a
per-source table — a handful of contributing datasets (ChEMBL, Human Protein Atlas) are
CC BY-SA 3.0 upstream, and three more are marked "Commercial use for Open Targets". Open
Targets states that every listed source has agreed to unrestricted use *by Open Targets
users*; if you redistribute an individual source's records onward rather than the Platform's
aggregate, check that table for the source you took them from.

The API is at `https://api.platform.opentargets.org/api/v4/graphql`. Everything below was run
against it on 2026-08-27.

## Four things to get right before the first query

Each of these fails in a way that does not look like the mistake it is.

**1. It is POST-only, and the failure is a 500.** The same query as a GET query string returns
an HTML error page, not JSON and not a 405. A POST without a JSON content type returns 415.

**2. GraphQL errors arrive with HTTP 200.** An unknown *field* is a 400, but an invalid
*argument* — an oversized page, a malformed filter — comes back **200, with `data` present,
the entity set to `null`, and the real reason only in `errors`**. `raise_for_status()` passes
and the caller reads `data["target"]` as `None`.

**3. A wrong identifier is also `null`, with no `errors` at all.** So `null` is ambiguous
until you look: it means either "your query was rejected" or "no such entity in this release".
Check `errors` first, then check for `None`, and report the two differently.

**4. Direct and indirect associations are different answers, and the default flips depending
on which side you enter from.** This is the one that silently produces wrong numbers. See
*The flag that changes the answer* below.

Confirm the transport before writing any client:

```bash
API=https://api.platform.opentargets.org/api/v4/graphql
Q='{"query":"{ meta { apiVersion { x y z } dataVersion { year month } } }"}'

# GET with the query as a parameter -- an HTML 500, not a 405 and not JSON.
curl -s -o /dev/null -w 'GET  -> %{http_code}\n' -G "$API" \
  --data-urlencode 'query={ meta { name } }'

# POST without a JSON content type.
curl -s -o /dev/null -w 'form -> %{http_code}\n' -X POST "$API" \
  -d 'query={ meta { name } }'

# The one that works, and the release it answers for.
curl -s -o /dev/null -w 'POST -> %{http_code}\n' -X POST "$API" \
  -H 'Content-Type: application/json' -d "$Q"
curl -s -X POST "$API" -H 'Content-Type: application/json' -d "$Q"; echo
```

```text
GET  -> 500
form -> 415
POST -> 200
{"data":{"meta":{"apiVersion":{"x":"26","y":"6","z":"3"},"dataVersion":{"year":"26","month":"06"}}}}
```

Pin `dataVersion` in anything you write up. Scores move between releases; the identifiers and
the shape of the response do not.

## A client that fails honestly

Every later block imports this. It exists to collapse the three failure modes above into one
exception with a message that says which one happened.

```python
from pathlib import Path

Path("ot.py").write_text('''
import json, urllib.request, urllib.error

API = "https://api.platform.opentargets.org/api/v4/graphql"


class OpenTargetsError(RuntimeError):
    pass


def gql(query, **variables):
    """POST a query. Raise on a GraphQL error; return the `data` mapping."""
    payload = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(
        API, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as e:
        # Unknown field, or a response the server refuses to build. The body is
        # JSON here even though the status is 4xx -- read it before giving up.
        try:
            detail = json.loads(e.read().decode())["errors"][0]["message"]
        except Exception:
            detail = str(e.reason)
        raise OpenTargetsError(f"HTTP {e.code}: {detail.splitlines()[0]}") from None

    # The trap: an argument-validation failure is HTTP 200 with `data` present
    # and the entity nulled out. Nothing above this line would have noticed.
    if body.get("errors"):
        raise OpenTargetsError(body["errors"][0]["message"].split("\\n")[0])
    return body["data"]


def require(data, key, what):
    """`None` after a clean response means no such entity in this release."""
    if data.get(key) is None:
        raise OpenTargetsError(f"no {key} {what!r} in this Open Targets release")
    return data[key]


EVIDENCE = """
query($t:String!, $d:String!, $s:[String!], $n:Int!, $c:String) {
  target(ensemblId:$t) {
    evidences(efoIds:[$d], datasourceIds:$s, size:$n, cursor:$c) {
      count cursor rows { FIELDS }
    }
  }
}"""


def all_evidence(target, disease, fields, sources=None, size=1000):
    \'\'\'Every direct evidence record for one pair. Returns (rows, count).

    Two things this exists to get right. `size` silently truncates -- there is
    no warning, just a short list. And `count` is 0 on a terminating page that
    holds no rows, which happens whenever the total is an exact multiple of
    `size`, so the total has to be taken from the FIRST page.
    \'\'\'
    query = EVIDENCE.replace("FIELDS", " ".join(fields))
    rows, cursor, total = [], None, None
    while True:
        ev = gql(query, t=target, d=disease, s=sources, n=size, c=cursor)
        ev = require(ev, "target", target)["evidences"]
        if total is None:
            total = ev["count"]
        rows += ev["rows"]
        cursor = ev["cursor"]
        if cursor is None:
            break
    if len(rows) != total:
        raise OpenTargetsError(f"paged {len(rows)} of {total} evidence records")
    return rows, total
''')

import ot

print("api", ot.gql("{ meta { apiVersion { x y z } } }")["meta"]["apiVersion"])

# Both failure modes, told apart.
for label, query in [
    ("bad argument",
     '{ target(ensemblId:"ENSG00000141510"){ associatedDiseases(page:{index:0,size:5000}){ count } } }'),
    ("unknown field",
     '{ target(ensemblId:"ENSG00000141510"){ knownDrugs { count } } }'),
]:
    try:
        ot.gql(query)
    except ot.OpenTargetsError as e:
        print(f"{label}: {e}")

# And the clean-but-empty case, which raises nothing at all on its own.
data = ot.gql('{ target(ensemblId:"ENSG00000141510.18"){ approvedSymbol } }')
print("versioned id ->", data)
try:
    ot.require(data, "target", "ENSG00000141510.18")
except ot.OpenTargetsError as e:
    print("caught:", e)
```

```text
api {'x': '26', 'y': '6', 'z': '3'}
bad argument: Argument 'page' has invalid value: At path '': Error during input parameter check. Violations:
unknown field: HTTP 400: Cannot query field 'knownDrugs' on type 'Target'. (line 1, column 40):
versioned id -> {'target': None}
caught: no target 'ENSG00000141510.18' in this Open Targets release
```

`knownDrugs` is not a typo in that example — it was the field name in earlier releases and is
gone from 26.06, replaced by `drugAndClinicalCandidates`. Query-language examples published
against the Platform age badly; introspect rather than trusting a snippet.

## Names are not identifiers

`target(ensemblId:)` wants a bare `ENSG…`. `disease(efoId:)` wants whatever identifier the
current release uses for the concept — which, despite the argument's name, is usually **not**
an EFO one.

Across the first 3,000 diseases associated with TP53, the identifiers are
**2,478 `MONDO_`, 365 `Orphanet_`, 116 `EFO_`, 40 `HP_` and 1 `OTAR_`**. The argument accepts
all five. What it rejects — silently, with `null` — is a perfectly valid ontology term that is
not *this release's* identifier for the concept.

`mapIds` is the resolver. It takes a list of terms and returns a `hits` list per term.

```python
import ot

QUERY = '''
query($terms:[String!]!, $kinds:[String!]) {
  mapIds(queryTerms:$terms, entityNames:$kinds) {
    total
    mappings { term hits { id name entity } }
  }
}'''


def resolve(terms, kind):
    """Exact, case-insensitive name match within one entity kind. Never hits[0]."""
    out = {}
    data = ot.gql(QUERY, terms=list(terms), kinds=[kind])
    for m in data["mapIds"]["mappings"]:
        exact = [h for h in m["hits"] if h["name"].casefold() == m["term"].casefold()]
        out[m["term"]] = exact[0]["id"] if exact else None
    return out


print(resolve(["TP53", "EGFR", "NOD2", "CFTR"], "target"))
print(resolve(["Li-Fraumeni syndrome", "breast carcinoma", "cystic fibrosis"], "disease"))

# Why the exact match is not optional. Unrestricted first, then filtered by kind.
for terms, kinds in [(["MET", "CAT"], None),
                     (["MET", "CAT"], ["target"]),
                     (["inflammatory bowel disease"], ["disease"])]:
    raw = ot.gql(QUERY, terms=terms, kinds=kinds)["mapIds"]
    label = "any entity" if kinds is None else f"{kinds[0]}s only"
    for m in raw["mappings"]:
        print(f"{label:<14} {m['term']:<26} hits[0]={m['hits'][0]['name']!r}"
              f"  all={[h['name'] for h in m['hits']]}")

# `total` counts DISTINCT entities matched, not terms resolved and not hits.
dup = ot.gql(QUERY, terms=["TP53", "TP53", "tp53"], kinds=["target"])["mapIds"]
print("total", dup["total"], "over", len(dup["mappings"]), "mappings")
```

```text
{'TP53': 'ENSG00000141510', 'EGFR': 'ENSG00000146648', 'NOD2': 'ENSG00000167207', 'CFTR': 'ENSG00000001626'}
{'Li-Fraumeni syndrome': 'MONDO_0018875', 'breast carcinoma': 'MONDO_0004989', 'cystic fibrosis': 'MONDO_0009061'}
any entity     MET                        hits[0]='METRONIDAZOLE'  all=['METRONIDAZOLE', 'METFORMIN', 'METHADONE', 'METOPROLOL', 'MET', 'SLTM']
any entity     CAT                        hits[0]='CRAT'  all=['CRAT', 'GLYAT', 'CAT']
targets only   MET                        hits[0]='MET'  all=['MET', 'SLTM']
targets only   CAT                        hits[0]='CRAT'  all=['CRAT', 'GLYAT', 'CAT']
diseases only  inflammatory bowel disease hits[0]='Inflammation of the large intestine'  all=['Inflammation of the large intestine', 'inflammatory bowel disease']
total 1 over 3 mappings
```

Read that output carefully. Unrestricted, `MET` ranks four drugs above the gene, because
`METRONIDAZOLE` and `METFORMIN` are prefix matches too. Restricting to `entityNames:["target"]`
fixes `MET` and **does not fix `CAT`**, where `CRAT` still outranks the exact symbol. There is
no entity filter that makes `hits[0]` safe; only the exact name comparison does.

The disease side is fuzzy in exactly the same way, and worse, because it crosses ontologies:
`inflammatory bowel disease` restricted to diseases still returns an HPO *phenotype* term
ahead of the MONDO disease term anyone asking that question meant.

`total` is not a count of terms resolved either — it counts **distinct entities** matched
across the whole request, which is why three spellings of TP53 report `total 1`. To find out
which terms failed, look for an empty `hits` list per mapping, not at `total`.

### Identifiers that look right and return null

```python
import ot

for eid in ["ENSG00000141510", "ENSG00000141510.18", "ensg00000141510", "ENSG00000271043"]:
    t = ot.gql('query($i:String!){ target(ensemblId:$i){ approvedSymbol biotype } }', i=eid)["target"]
    print(f"{eid:24} -> {t}")

for did in ["MONDO_0018875", "EFO_0000305", "EFO_0000341", "EFO_0003767", "Orphanet_524",
            "Orphanet_145", "HP_0000822", "OTAR_0000003"]:
    d = ot.gql('query($i:String!){ disease(efoId:$i){ name } }', i=did)["disease"]
    print(f"{did:24} -> {d['name'] if d else None}")
```

```text
ENSG00000141510          -> {'approvedSymbol': 'TP53', 'biotype': 'protein_coding'}
ENSG00000141510.18       -> None
ensg00000141510          -> None
ENSG00000271043          -> None
MONDO_0018875            -> Li-Fraumeni syndrome
EFO_0000305              -> None
EFO_0000341              -> None
EFO_0003767              -> None
Orphanet_524             -> None
Orphanet_145             -> Hereditary breast and ovarian cancer syndrome
HP_0000822               -> Hypertension
OTAR_0000003             -> cyst
```

Four traps in one block:

- **A versioned Ensembl id is rejected.** `ENSG00000141510.18` is what a GTF, a GENCODE
  annotation and the GTEx Portal all use. Open Targets wants the bare accession. Strip the
  suffix on the way in.
- **Identifiers are case-sensitive.** Lowercase is `null`, not a normalised match.
- **`Orphanet_` identifiers work, but only the ones this release indexes.** `Orphanet_524` is
  the Orphanet code that appears *inside* Li-Fraumeni evidence records as
  `diseaseFromSourceId`, and it is not queryable as a disease; `Orphanet_145` is. A source's
  own identifier is not necessarily a Platform identifier.
- **`EFO_0003767` is the identifier in the Platform's own associations documentation** (its
  worked inflammatory-bowel-disease example) and it returns `null` against the 26.06 API,
  which now indexes that concept as `MONDO_0005265`. Resolve every name through `mapIds` at
  run time. Do not carry identifiers over from a paper, a docs page, or a previous release.

## The flag that changes the answer

A **direct** association counts only evidence annotated against that exact disease term. An
**indirect** association also counts evidence annotated against any of its ontology
descendants — so an association to *acute myeloid leukemia* absorbs everything said about its
subtypes.

Both are legitimate. The problem is that the four entry points do not agree on the default,
and one of them offers no choice at all.

| Entry point | `enableIndirect` | Default |
|---|---|---|
| `target.associatedDiseases` | accepted | **direct** |
| `disease.associatedTargets` | accepted | **indirect** |
| `disease.evidences` | accepted | **indirect** |
| `target.evidences` | **not in the schema** | **direct**, always |

```python
import ot

TP53, NOD2 = "ENSG00000141510", "ENSG00000167207"
IBD = "MONDO_0005265"

d = ot.gql('''
query($t:String!) {
  target(ensemblId:$t) {
    approvedSymbol
    direct:   associatedDiseases(enableIndirect:false, page:{index:0,size:3}) {
      count rows { score disease { name } } }
    default_: associatedDiseases(page:{index:0,size:3}) { count }
    indirect: associatedDiseases(enableIndirect:true, page:{index:0,size:3}) {
      count rows { score disease { name } } }
  }
}''', t=TP53)["target"]

for k in ("direct", "default_", "indirect"):
    print(f"TP53 associatedDiseases {k:9} count={d[k]['count']}")
for k in ("direct", "indirect"):
    print(f"  top {k}:", [(round(r['score'], 3), r['disease']['name']) for r in d[k]['rows']])

b = ot.gql('''
query($d:String!) {
  disease(efoId:$d) {
    name
    direct:   associatedTargets(enableIndirect:false, page:{index:0,size:1}) { count }
    default_: associatedTargets(page:{index:0,size:1}) { count }
  }
}''', d="MONDO_0004989")["disease"]
print(f"\n{b['name']} associatedTargets direct={b['direct']['count']} "
      f"default={b['default_']['count']}  <- disease side defaults the other way")

# Same pair, same question, two entry points, two answers.
a = ot.gql('query($t:String!,$d:String!){ target(ensemblId:$t){ evidences(efoIds:[$d], size:1){ count } } }',
           t=NOD2, d=IBD)["target"]["evidences"]["count"]
c = ot.gql('''query($t:String!,$d:String!){ disease(efoId:$d){
      dir: evidences(ensemblIds:[$t], enableIndirect:false, size:1){ count }
      def_:evidences(ensemblIds:[$t], size:1){ count } } }''', t=NOD2, d=IBD)["disease"]
print(f"\nNOD2 x inflammatory bowel disease evidence records")
print(f"  target.evidences (no flag exists) : {a}")
print(f"  disease.evidences enableIndirect:false: {c['dir']['count']}")
print(f"  disease.evidences default             : {c['def_']['count']}")
```

```text
TP53 associatedDiseases direct    count=5638
TP53 associatedDiseases default_  count=5638
TP53 associatedDiseases indirect  count=17613
  top direct: [(0.876, 'Li-Fraumeni syndrome'), (0.797, 'hepatocellular carcinoma'), (0.777, 'head and neck squamous cell carcinoma')]
  top indirect: [(0.948, 'acute myeloid leukemia'), (0.939, 'hypertrophic cardiomyopathy'), (0.936, 'myelodysplastic syndrome')]

breast carcinoma associatedTargets direct=15586 default=17963  <- disease side defaults the other way

NOD2 x inflammatory bowel disease evidence records
  target.evidences (no flag exists) : 995
  disease.evidences enableIndirect:false: 995
  disease.evidences default             : 4003
```

The ranking is not stable across the flag — it is a different question, not a longer answer.
TP53's top direct association is Li-Fraumeni syndrome at 0.876; its top indirect association
is acute myeloid leukemia at 0.948, and Li-Fraumeni is not in the indirect top three at all.

The consequence for evidence retrieval is sharper. **`target.evidences` cannot return indirect
evidence**, so a pipeline that reads associations from the disease side (indirect by default)
and then fetches evidence from the target side gets 995 records for a score computed over
4,003 of them, and nothing in either response says so. Enter from one side and stay there, or
pass `enableIndirect` explicitly everywhere and say in the write-up which you used.

RNA-expression evidence is the documented exception: Open Targets does not propagate it up the
ontology, to stop parent terms accumulating long tails of weak expression associations.

## What the score is, and what it is not

The association `score` is a **harmonic sum**, not a p-value, not a probability, and not
comparable across targets as a confidence. Open Targets says so itself:

> While scores are useful to rank lists of targets or diseases, **they should not be
> interpreted as a confidence score for the target-disease association**.

Under-studied diseases cannot produce high scores, because the score is driven by how much
evidence exists. TP53's top association scores 0.876; MIR21's best is 0.093 and OR4F5's is
0.118, and that spread is about literature volume at least as much as biology.

It is worth knowing the arithmetic, because it is fully reproducible from the API's own
output — which means you can check that you understand what you are reading:

1. **Per data source.** Sort that source's evidence scores descending, sum `score / rank²`,
   divide by a normalising constant.
2. **Overall.** Take the per-source scores, multiply each by its source weight, sort
   descending, and run the same harmonic sum over that vector.

Source weights are not uniform. Europe PMC, Expression Atlas and IMPC carry **0.2**; Cancer
Biomarkers and the CRISPR projects carry **0.5**; everything else 1. Query them rather than
hard-coding — `associatedDiseases.datasources` returns exactly the sources whose weight is not
the default.

```python
import ot

TP53, LFS = "ENSG00000141510", "MONDO_0018875"

# `Bs` restricts the association list to specific partner ids -- one pair, one row,
# no paging. It is the only way to ask for a single association directly.
pair = ot.gql('''
query($t:String!,$d:String!) {
  target(ensemblId:$t) {
    associatedDiseases(Bs:[$d]) {
      count
      datasources { id weight }
      rows { score novelty disease { id name } datasourceScores { id score } }
    }
  }
}''', t=TP53, d=LFS)["target"]["associatedDiseases"]

row = pair["rows"][0]
weights = {d["id"]: d["weight"] for d in pair["datasources"]}
print("rows:", pair["count"], "|", row["disease"]["name"],
      "overall", row["score"], "novelty", round(row["novelty"], 6))
print("non-default weights:", weights)

# The normaliser. The published description says a vector of 1,000 ones (~1.6439);
# the deployed pipeline uses 100,000 (1.6449240669), and the difference shows up in
# the 4th decimal. Derived by matching the API's own numbers, below.
NORM = sum(1 / k ** 2 for k in range(1, 100_001))


def harmonic(vec):
    return sum(s / (i + 1) ** 2 for i, s in enumerate(sorted(vec, reverse=True))) / NORM


print(f"\n{'source':<20}{'n':>6}  {'recomputed':>16}{'reported':>18}{'delta':>10}")
by_source = {}
for ds in row["datasourceScores"]:
    rows, n = ot.all_evidence(TP53, LFS, ["score"], sources=[ds["id"]])
    mine = harmonic(e["score"] for e in rows)
    by_source[ds["id"]] = ds["score"]
    print(f"{ds['id']:<20}{n:>6}  {mine:>16.12f}{ds['score']:>18.12f}"
          f"{abs(mine - ds['score']):>10.1e}")

overall = harmonic(s * weights.get(k, 1.0) for k, s in by_source.items())
print(f"\noverall  recomputed {overall:.12f}  reported {row['score']:.12f}  "
      f"delta {abs(overall - row['score']):.1e}")

# What a short page costs. `eva` has more records than one page holds, and the
# only symptom of taking the first page is a score that is nearly right.
short = ot.gql('query($t:String!,$d:String!){ target(ensemblId:$t){ evidences(efoIds:[$d],'
               ' datasourceIds:["eva"], size:3000){ count rows{ score } } } }',
               t=TP53, d=LFS)["target"]["evidences"]
print(f"\neva truncated to {len(short['rows'])} of {short['count']}: "
      f"{harmonic(e['score'] for e in short['rows']):.12f} "
      f"vs reported {by_source['eva']:.12f}")
```

```text
rows: 1 | Li-Fraumeni syndrome overall 0.8763216350824885 novelty 0.006874
non-default weights: {'europepmc': 0.2, 'expression_atlas': 0.2, 'impc': 0.2, 'cancer_biomarkers': 0.5, 'ot_crispr_validation': 0.5, 'ot_crispr': 0.5, 'encore': 0.5}

source                   n        recomputed          reported     delta
uniprot_variants        75    0.991954133441    0.991954133441   1.0e-14
eva                   3933    0.969236628394    0.969236628394   1.3e-14
genomics_england        14    0.958096407436    0.958096407436   9.3e-15
gene2phenotype           1    0.607930797612    0.607930797612   5.9e-15
orphanet                 1    0.607930797612    0.607930797612   5.9e-15
clingen                  1    0.607930797612    0.607930797612   5.9e-15
uniprot_literature       1    0.607930797612    0.607930797612   5.9e-15
eva_somatic              1    0.437710174280    0.437710174280   4.2e-15
impc                    41    0.637249773441    0.637249773441   6.4e-15
europepmc             1731    0.372399469305    0.372399469305   4.4e-15

overall  recomputed 0.876321635082  reported 0.876321635082  delta 8.5e-15

eva truncated to 3000 of 3933: 0.969235724059 vs reported 0.969236628394
```

Three things fall out of that table and are worth carrying:

- **A single piece of evidence scores 0.6079**, not 1.0, because of the normaliser. Four
  sources here contribute exactly one record each and land on the identical value. A source
  score near 0.61 usually means *one* record, not a moderate one — and the four `0.607930…`
  rows are the giveaway.
- **`europepmc` has 1,731 records and the second-lowest source score**, because text-mining
  evidence scores low individually and the harmonic sum discounts everything after the first
  few. Volume does not buy much.
- The 100,000-term normaliser is what actually reproduces the API. The documented figure
  (1,000 terms, 1.6439) would put every one of these numbers out in the fourth decimal.

`novelty` is a separate, much smaller number on the same row — how recently the association
emerged, not how strong it is. Do not read it as a second confidence.

## Paging

Four separate conventions live in this API, and mixing them up is the most common way to
silently truncate a result.

| | `associatedDiseases` / `associatedTargets` | `evidences` |
|---|---|---|
| argument | `page:{index, size}` | `size` + `cursor` |
| default page | **25 rows** | **25 rows** |
| maximum | `size` **3000** | `size` at least 5000 |
| `index` means | **page number**, not row offset | — |
| end of results | an empty `rows` list | `cursor` is `null` |
| total | `count`, stable | `count`, **0 on an empty final page** |

```python
import ot

TP53, LFS = "ENSG00000141510", "MONDO_0018875"
A = 'query($t:String!,$p:Pagination){ target(ensemblId:$t){ associatedDiseases(page:$p){ count rows{ disease{id} } } } }'

# 1. No page argument is not "everything" -- it is 25 of 5,638.
d = ot.gql('query($t:String!){ target(ensemblId:$t){ associatedDiseases{ count rows{ disease{id} } } } }',
           t=TP53)["target"]["associatedDiseases"]
print("no page argument ->", len(d["rows"]), "rows of", d["count"])

# 2. `index` is a page number. index 2 at size 3000 is rows 6000+, which is past the end.
for index, size in [(0, 3000), (1, 3000), (2, 3000), (100, 50)]:
    r = ot.gql(A, t=TP53, p={"index": index, "size": size})["target"]["associatedDiseases"]
    print(f"index={index:<4} size={size:<5} -> {len(r['rows']):>4} rows "
          f"(offset {index * size})")

# 3. Over the cap, the entity is nulled out and the reason is only in `errors`.
try:
    ot.gql(A, t=TP53, p={"index": 0, "size": 3001})
except ot.OpenTargetsError as e:
    print("size 3001 ->", str(e)[:60], "...")

# 4. Evidence pages by cursor, and the cursor -- not the row count -- ends the loop.
#    `count` is read from the FIRST page. Below is why.
E = '''query($t:String!,$d:String!,$n:Int!,$c:String){
  target(ensemblId:$t){ evidences(efoIds:[$d], datasourceIds:["orphanet","uniprot_variants","clingen"],
    size:$n, cursor:$c){ count cursor rows{ id } } } }'''
for size in (40, 11):
    cursor, seen, pages, total, last = None, set(), 0, None, None
    while True:
        ev = ot.gql(E, t=TP53, d=LFS, n=size, c=cursor)["target"]["evidences"]
        pages += 1
        total = ev["count"] if total is None else total
        last = ev["count"]
        seen.update(r["id"] for r in ev["rows"])
        cursor = ev["cursor"]
        if cursor is None:
            break
    print(f"size={size:<3} -> {pages} pages, {len(seen)} ids; count on first page "
          f"{total}, on last page {last}")

# 5. Paging associations right through, at two page sizes. The row count matches
#    `count` both times; the number of DISTINCT diseases does not, and the smaller
#    page loses more.
from collections import Counter


def page_all(size):
    ids, index, total = [], 0, None
    while True:
        a = ot.gql(A, t=TP53, p={"index": index, "size": size})["target"]["associatedDiseases"]
        total = a["count"] if total is None else total
        if not a["rows"]:
            return ids, total
        ids += [r["disease"]["id"] for r in a["rows"]]
        index += 1


for size in (3000, 500):
    ids, total = page_all(size)
    dupes = [k for k, v in Counter(ids).items() if v > 1]
    print(f"size={size:<5} rows={len(ids)} count={total} distinct={len(set(ids))} "
          f"duplicated={len(dupes)} {sorted(dupes)[:2]}")
```

```text
no page argument -> 25 rows of 5638
index=0    size=3000  -> 3000 rows (offset 0)
index=1    size=3000  -> 2638 rows (offset 3000)
index=2    size=3000  ->    0 rows (offset 6000)
index=100  size=50    ->   50 rows (offset 5000)
size 3001 -> Argument 'page' has invalid value: At path '': Error during  ...
size=40  -> 2 pages, 77 ids; count on first page 77, on last page 77
size=11  -> 8 pages, 77 ids; count on first page 77, on last page 0
size=3000  rows=5638 count=5638 distinct=5637 duplicated=1 ['Orphanet_2934']
size=500   rows=5638 count=5638 distinct=5577 duplicated=61 ['EFO_0005762', 'EFO_0006885']
```

Two things in that output are worth stopping on.

**`count` on a cursor loop's last page can be 0.** When the total divides evenly by `size`,
the loop makes one extra request that returns no rows, and that page reports `count: 0`. A
loop that reads `ev["count"]` *after* it finishes is correct at every page size but that one,
and silently wrong at that one. Take the total from the first page.

**Paging associations by page number loses rows at the boundaries.** The row count always
matches `count`, so the obvious check passes — but the *distinct* count does not. Association
rows are ordered by score, thousands of low-scoring rows tie on the same score, and the sort
is not stable across separate requests, so a tied row lands on both sides of a boundary while
another is never returned at all. It is deterministic and it scales with the number of
boundaries: at `size:3000` one of TP53's 5,638 diseases is duplicated and one is lost; at
`size:500` **61 are**. Use the largest page size the endpoint allows, accumulate into a dict
keyed on the partner id, and compare the distinct count against `count` rather than the row
count. Where you need every row exactly once, take the bulk parquet instead.

There is no Elasticsearch result window to fall off — paging the 17,963 targets associated
with breast carcinoma to offset 16,000 returns rows normally. What does bite is response
size: aliasing several 3,000-row association queries into one request, each also selecting
`datasourceScores` and `datatypeScores`, returns **HTTP 400, `"Query is too expensive. The
response size is likely to be too large."`** The gate is on the projected response, not on the
`gql-complexity` header the server returns — eight aliases of 3,000 rows with a small
selection passed at a reported complexity of 96,008. Page, do not alias.

For anything systematic across many targets at once, stop using the API and take the bulk
files — see *Get the files*.

## Drilling into the evidence

`evidences` returns the individual records the score was computed from. Two things about its
shape decide how you write the reader.

**`Evidence` is one flat type covering every data source** — 105 fields in 26.06, of which any
one record populates a handful. A null field almost always means *not applicable to this
source*, not *missing*, so select the small common core and branch on `datasourceId`:

```python
import ot

FIELDS = ("datasourceId score drug{name} variantRsId clinicalStage pValueMantissa "
          "targetFromSourceId literature mutatedSamples{numberSamplesTested} "
          "textMiningSentences{text}")

for source in ("clinical_precedence", "europepmc", "eva", "cancer_gene_census", "intogen"):
    ev = ot.gql('''query($t:String!,$d:String!,$s:String!){ target(ensemblId:$t){
          evidences(efoIds:[$d], datasourceIds:[$s], size:1){ count rows { %s } } } }''' % FIELDS,
        t="ENSG00000141510", d="MONDO_0010150", s=source)["target"]["evidences"]
    row = ev["rows"][0]
    populated = [k for k, v in row.items() if v not in (None, [], "")]
    print(f"{source:<20} n={ev['count']:<5} populated: {populated}")
```

```text
clinical_precedence  n=1     populated: ['datasourceId', 'score', 'drug', 'clinicalStage', 'targetFromSourceId']
europepmc            n=1896  populated: ['datasourceId', 'score', 'targetFromSourceId', 'literature', 'textMiningSentences']
eva                  n=64    populated: ['datasourceId', 'score', 'variantRsId', 'targetFromSourceId']
cancer_gene_census   n=1     populated: ['datasourceId', 'score', 'targetFromSourceId', 'literature', 'mutatedSamples']
intogen              n=6     populated: ['datasourceId', 'score', 'targetFromSourceId', 'literature', 'mutatedSamples']
```

Every one of those records is the same GraphQL type. `drug` is populated only on the clinical
source; `textMiningSentences` only on Europe PMC; `mutatedSamples` only on the somatic ones;
`variantRsId` only where a variant is the unit of evidence. `pValueMantissa` is null on all
five — it exists for GWAS and burden evidence, and selecting it elsewhere costs nothing and
returns nothing.

Two field names worth knowing because the near-miss is a 400: it is `clinicalStage`, not
`clinicalPhase`, and `drugAndClinicalCandidates`, not `knownDrugs`.

**Source identifiers are the source's own, and they are not one namespace.** Across the 5,799
records for a single pair, `targetFromSourceId` takes three forms — an Ensembl id, the UniProt
accession `P04637`, and the bare symbol `TP53` — and `diseaseFromSourceId` returns UMLS
concept ids, OMIM ids, Orphanet codes and `null`. The `targetId`/`diseaseId` pair is the
Platform's own mapping and is the only thing safe to join on; everything named `…FromSource…`
is what the contributor said *before* mapping, which is what you want for provenance and what
silently breaks a join.

```python
import ot
from collections import Counter

TP53, LFS = "ENSG00000141510", "MONDO_0018875"

rows, total = ot.all_evidence(TP53, LFS, [
    "id", "datasourceId", "datatypeId", "score", "literature",
    "diseaseFromSource", "diseaseFromSourceId", "targetFromSourceId", "variantRsId",
])

print("evidence records:", total, "| fetched:", len(rows))
print("by source:", dict(Counter(r["datasourceId"] for r in rows).most_common(5)))
print("source-side target ids:", dict(Counter(r["targetFromSourceId"] for r in rows)))
print("source-side disease ids:",
      dict(Counter(r["diseaseFromSourceId"] for r in rows).most_common(4)))

# `literature` is a list of PMIDs -- except when it is a list holding an empty string.
empty_list = sum(1 for r in rows if r["literature"] == [])
blank_pmid = sum(1 for r in rows if r["literature"] and "" in r["literature"])
usable = sum(1 for r in rows if r["literature"] and all(r["literature"]))
print(f"literature: {empty_list} empty lists, {blank_pmid} lists containing '', {usable} usable")
print("sources emitting a blank pmid:",
      dict(Counter(r["datasourceId"] for r in rows if r["literature"] and "" in r["literature"])))

pmids = sorted({p for r in rows for p in (r["literature"] or []) if p})
print("distinct pmids:", len(pmids), "| first:", pmids[:3])
```

```text
evidence records: 5799 | fetched: 5799
by source: {'eva': 3933, 'europepmc': 1731, 'uniprot_variants': 75, 'impc': 41, 'genomics_england': 14}
source-side target ids: {'ENSG00000141510': 5707, 'P04637': 76, 'TP53': 16}
source-side disease ids: {'C0085390': 2488, None: 1737, 'C1835398': 1446, 'OMIM:151623': 83}
literature: 3925 empty lists, 41 lists containing '', 1833 usable
sources emitting a blank pmid: {'uniprot_variants': 41}
distinct pmids: 2073 | first: ['10077642', '10206274', '10346812']
```

Note `41 lists containing ''` — all from `uniprot_variants`. A loop that builds
`https://pubmed.ncbi.nlm.nih.gov/{pmid}/` from that list produces 41 links to
`https://pubmed.ncbi.nlm.nih.gov//`, which answers **HTTP 200** with PubMed's front page and
so looks like a working citation in a report. Filter on truthiness, not on
`literature is not None`; the null case does not occur here at all.

That census is over all 5,799 records because the helper pages to exhaustion. Ask for
`size:3000` in one shot and you get 3,000 of them with no warning of any kind — a stable,
deterministic, arbitrary prefix that changes the source mix, the PMID list and any score you
recompute from it.

## What else hangs off a target

This skill is about associations, but two neighbouring fields come up immediately after them
and both have a shape worth stating.

```python
import ot
from collections import Counter

d = ot.gql('''
query($t:String!) {
  target(ensemblId:$t) {
    approvedSymbol approvedName
    tractability { label modality value }
    drugAndClinicalCandidates { count rows { maxClinicalStage drug { id name drugType } } }
  }
}''', t="ENSG00000146648")["target"]

tr = d["tractability"]
print(d["approvedSymbol"], "|", len(tr), "tractability entries,",
      len({t["label"] for t in tr}), "distinct labels,",
      "modalities", sorted({t["modality"] for t in tr}))
print("  keyed by label alone you would keep",
      len({t["label"]: t for t in tr}), "of", len(tr))
for mod in sorted({t["modality"] for t in tr}):
    hits = [t["label"] for t in tr if t["modality"] == mod and t["value"]]
    print(f"  {mod}: {hits}")

dc = d["drugAndClinicalCandidates"]
print(f"\n{dc['count']} drugs and clinical candidates; rows returned {len(dc['rows'])}")
print("  stages:", dict(Counter(r["maxClinicalStage"] for r in dc["rows"])))
print("  approved:", sorted({r["drug"]["name"] for r in dc["rows"]
                             if r["maxClinicalStage"] == "APPROVAL"})[:6])
```

```text
EGFR | 28 tractability entries, 19 distinct labels, modalities ['AB', 'OC', 'PR', 'SM']
  keyed by label alone you would keep 19 of 28
  AB: ['Approved Drug', 'UniProt loc high conf', 'GO CC high conf', 'UniProt loc med conf', 'UniProt SigP or TMHMM', 'Human Protein Atlas loc']
  OC: ['Advanced Clinical']
  PR: ['Literature', 'UniProt Ubiquitination', 'Database Ubiquitination', 'Half-life Data', 'Small Molecule Binder']
  SM: ['Approved Drug', 'Structure with Ligand', 'High-Quality Ligand', 'High-Quality Pocket', 'Druggable Family']

82 drugs and clinical candidates; rows returned 82
  stages: {'PHASE_3': 14, 'APPROVAL': 28, 'PHASE_1': 14, 'PHASE_2': 18, 'PHASE_2_3': 3, 'UNKNOWN': 1, 'PHASE_1_2': 4}
  approved: ['AFATINIB', 'AFATINIB DIMALEATE', 'AMIVANTAMAB', 'AUMOLERTINIB', 'BRIGATINIB', 'CETUXIMAB']
```

- **`tractability` is a flat list, and `label` is not unique** — the same label recurs across
  the four modalities (`SM` small molecule, `AB` antibody, `PR` PROTAC/degrader, `OC` other
  clinical). Keying a dict on `label` collapses 28 assessments into 19 and quietly reports
  antibody evidence as small-molecule tractability. Key on `(modality, label)`.
- **`maxClinicalStage` is an enum string, not a number.** The older integer
  `maximumClinicalTrialPhase` is gone from the schema, and the replacement vocabulary is not
  ordered by anything a comparison operator understands — `PHASE_1_2` and `PHASE_2_3` sit
  between the numbered stages, and `UNKNOWN` is a value. `max()` over the seven strings above
  returns `"UNKNOWN"`, and `APPROVAL` — the highest stage there is — sorts **lowest** of all
  seven. Map to an explicit ordering before comparing or sorting.
- `drugAndClinicalCandidates` takes no page argument and returned all 82 rows in one go, so
  compare `len(rows)` to `count` rather than assuming either way.

## Get the files

Two routes, and they answer different questions. The API is right for a handful of
targets or diseases; the release parquet is right for anything systematic, and Open Targets
says so — its own API documentation points systematic multi-target work at the downloads.

**Route 1 — a target's associations and their evidence, as TSV.** Stdlib only.

```python
import csv, json, sys, ot
from pathlib import Path

SYMBOL, TOP_N = "CFTR", 25
OUT = Path("opentargets_out")
OUT.mkdir(exist_ok=True)

release = ot.gql("{ meta { apiVersion{x y z} dataVersion{year month} } }")["meta"]
stamp = f"{release['dataVersion']['year']}.{release['dataVersion']['month']}"

ids = ot.gql('''query($q:[String!]!){ mapIds(queryTerms:$q, entityNames:["target"]){
        mappings { term hits { id name } } } }''', q=[SYMBOL])["mapIds"]["mappings"][0]
exact = [h for h in ids["hits"] if h["name"].casefold() == SYMBOL.casefold()]
if not exact:
    sys.exit(f"{SYMBOL} does not resolve to a target in release {stamp}")
ensembl = exact[0]["id"]

assoc = ot.require(ot.gql('''
query($t:String!,$n:Int!) {
  target(ensemblId:$t) {
    approvedSymbol approvedName biotype
    associatedDiseases(enableIndirect:false, page:{index:0,size:$n}) {
      count rows { score disease { id name } datatypeScores { id score } } } } }''',
    t=ensembl, n=TOP_N), "target", ensembl)
rows = assoc["associatedDiseases"]["rows"]

with (OUT / f"{SYMBOL}_associations.tsv").open("w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["ensemblId", "symbol", "diseaseId", "diseaseName",
                "overallScore", "topDatatype", "topDatatypeScore"])
    for r in rows:
        top = max(r["datatypeScores"], key=lambda x: x["score"])
        w.writerow([ensembl, assoc["approvedSymbol"], r["disease"]["id"],
                    r["disease"]["name"], f"{r['score']:.6f}", top["id"],
                    f"{top['score']:.6f}"])

# Evidence for the single best-scoring disease, paged to exhaustion by cursor.
best = rows[0]["disease"]
evidence, n_evidence = ot.all_evidence(ensembl, best["id"], [
    "id", "datasourceId", "datatypeId", "score", "literature",
    "diseaseFromSource", "targetFromSourceId",
])

with (OUT / f"{SYMBOL}_{best['id']}_evidence.tsv").open("w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["evidenceId", "datasourceId", "datatypeId", "score",
                "pmids", "diseaseFromSource", "targetFromSourceId"])
    for e in evidence:
        pmids = ";".join(p for p in (e["literature"] or []) if p)
        w.writerow([e["id"], e["datasourceId"], e["datatypeId"], f"{e['score']:.6f}",
                    pmids, e["diseaseFromSource"] or "", e["targetFromSourceId"] or ""])

(OUT / "provenance.json").write_text(json.dumps({
    "resource": "Open Targets Platform",
    "endpoint": ot.API,
    "apiVersion": f"{release['apiVersion']['x']}.{release['apiVersion']['y']}.{release['apiVersion']['z']}",
    "dataVersion": stamp,
    "licence": "CC0 1.0",
    "symbol": SYMBOL, "ensemblId": ensembl,
    "associationsWritten": len(rows), "associationsAvailable": assoc["associatedDiseases"]["count"],
    "associationType": "direct",
    "evidenceDisease": best, "evidenceRecords": n_evidence,
}, indent=2) + "\n")

for p in sorted(OUT.iterdir()):
    print(f"{p.stat().st_size:>9,}  {p}")
```

```text
1,889,545  opentargets_out/CFTR_MONDO_0009061_evidence.tsv
    2,524  opentargets_out/CFTR_associations.tsv
      447  opentargets_out/provenance.json
```

Write `dataVersion` next to the numbers every time. A score with no release stamp cannot be
reproduced, because it will have moved by the next quarterly build.

**Route 2 — the release parquet.** Every dataset behind the API is published as Spark parquet
at `https://ftp.ebi.ac.uk/pub/databases/opentargets/platform/<release>/output/`, with `latest/`
tracking the current one. `association_overall_direct/` is ~1.2 GB across 15 parts; the
per-source evidence tables are much smaller, and `evidence_orphanet/` is a single 742 KB file
— small enough to make the point without a large transfer.

Needs pyarrow:

```bash
python3 -m venv .venv && . .venv/bin/activate && pip install pyarrow
```

```python
import urllib.request
from pathlib import Path
import pyarrow.parquet as pq
import pyarrow.compute as pc

REL = "26.06"
BASE = f"https://ftp.ebi.ac.uk/pub/databases/opentargets/platform/{REL}/output"
PART = "part-00000-cd6a04cb-4416-4a3a-9177-34497cde762c-c000.snappy.parquet"

dest = Path("evidence_orphanet.parquet")
if not dest.exists():
    urllib.request.urlretrieve(f"{BASE}/evidence_orphanet/{PART}", dest)
print(f"{dest} {dest.stat().st_size:,} bytes")

t = pq.read_table(dest)
print(f"{t.num_rows:,} rows x {t.num_columns} columns")
print("columns:", [f.name for f in t.schema])

# The bulk evidence schema is PER SOURCE -- 20 columns here, not the 105-field
# union the GraphQL `Evidence` type presents. That is the reason to use it.
hit = t.filter(pc.and_(pc.equal(t["targetId"], "ENSG00000141510"),
                       pc.equal(t["diseaseId"], "MONDO_0018875")))
print(f"\nTP53 x Li-Fraumeni orphanet rows: {hit.num_rows}")
rec = hit.to_pylist()[0]
for k in ("id", "score", "diseaseFromSource", "diseaseFromSourceId", "literature"):
    print(f"  {k:<22} {rec[k]}")

# The join key. The evidence `id` is a content hash, and it is the SAME id the
# API hands back -- which is what lets an API result and a bulk analysis be
# reconciled without re-deriving anything.
import ot

live = ot.gql('{ target(ensemblId:"ENSG00000141510"){ evidences(efoIds:["MONDO_0018875"],'
              ' datasourceIds:["orphanet"], size:5){ count rows{ id score literature } } } }'
              )["target"]["evidences"]
assert live["count"] == hit.num_rows
assert live["rows"][0]["id"] == rec["id"]
assert live["rows"][0]["literature"] == rec["literature"]
print(f"\napi id == parquet id: {live['rows'][0]['id'] == rec['id']} "
      f"({live['count']} record(s) both sides)")
```

```text
evidence_orphanet.parquet 759,911 bytes
7,461 rows x 20 columns
columns: ['targetId', 'id', 'targetFromSourceId', 'diseaseFromSourceMappedId', 'datasourceId', 'datatypeId', 'alleleOrigins', 'confidence', 'diseaseFromSource', 'diseaseFromSourceId', 'literature', 'targetFromSource', 'variantFunctionalConsequenceId', 'qualityControls', 'diseaseId', 'publicationDate', 'evidenceDate', 'score', 'directionOnTrait', 'directionOnTarget']

TP53 x Li-Fraumeni orphanet rows: 1
  id                     02fa20c5617c0f5f55f41c7fb22dea28dfa786f5
  score                  1.0
  diseaseFromSource      Li-Fraumeni syndrome
  diseaseFromSourceId    Orphanet_524
  literature             ['20301488']

api id == parquet id: True (1 record(s) both sides)
```

The evidence `id` is a content hash and it is **the same identifier in both routes** — the
last two lines of that output are a live API call asserting it. That id is the join key
between an API result and a bulk analysis, and it is stable within a release.

Two cautions on the bulk route. The release directory is immutable, so a pinned `26.06` URL
keeps working while `latest/` moves under you — pin the release in anything reproducible.
And part filenames carry a per-release UUID, so list the directory rather than hard-coding a
part name across releases.

## Limits worth stating in a write-up

- **Absence of an association is not evidence of absence.** The Platform indexes what its
  contributing sources published. A target-disease pair with no association has no *indexed*
  evidence, which is a statement about coverage.
- **Never call a score significant.** It is a rank statistic over evidence volume and source
  weights. Report it as a score, with the release, and with which sources drove it.
- **Say direct or indirect.** The two differ by a factor of three on TP53's disease count and
  change the ranking outright. A number without the flag is not reproducible.
- **Text mining is in the score.** `europepmc` contributes to most well-studied pairs at
  weight 0.2. If a claim rests on a pair whose only non-literature source is expression,
  say so — `datasourceScores` is what shows it.
- **Weights are adjustable and defaults are a choice.** `datasources:` on the association
  query lets a caller reweight; two groups using different weights get different rankings
  from the same data.
- Scores are rebuilt each release. Anything quoted needs `dataVersion` beside it.

## Try it

**Data.** The Open Targets Platform GraphQL API, release 26.06 — public domain (CC0 1.0), no
account, no key. The frontmatter declares four files from that release's bulk parquet mirror
rather than the endpoint itself, because the endpoint is POST-only and answers a `HEAD` probe
with a 400. A pinned release directory is immutable, so those URLs stay live; the release the
skill was checked against is recorded in `verified.against` and printed by the first block.

**Run.** Stdlib only. Copy into an empty directory and run.

```python
import json, urllib.request, urllib.error

API = "https://api.platform.opentargets.org/api/v4/graphql"
TP53, NOD2 = "ENSG00000141510", "ENSG00000167207"
LFS, IBD = "MONDO_0018875", "MONDO_0005265"


def gql(query, **variables):
    req = urllib.request.Request(
        API, data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = json.load(r)
    except urllib.error.HTTPError as e:
        return {"_status": e.code, "_errors": json.loads(e.read().decode())["errors"]}
    if body.get("errors"):
        return {"_status": 200, "_errors": body["errors"], "data": body.get("data")}
    return body["data"]


meta = gql("{ meta { apiVersion{x y z} dataVersion{year month} } }")["meta"]
v, dv = meta["apiVersion"], meta["dataVersion"]
print(f"1. api {v['x']}.{v['y']}.{v['z']}  data {dv['year']}.{dv['month']}")

# 2. SHAPE. The fields this skill is written against must exist and be the right kind.
shape = gql('''{ target(ensemblId:"%s"){ approvedSymbol biotype
  associatedDiseases(page:{index:0,size:3}){ count
    rows{ score novelty disease{ id name } datatypeScores{ id score } datasourceScores{ id score } } } } }''' % TP53)
t = shape["target"]
a = t["associatedDiseases"]
r0 = a["rows"][0]
assert t["approvedSymbol"] == "TP53" and t["biotype"] == "protein_coding"
assert isinstance(a["count"], int) and len(a["rows"]) == 3
assert set(r0) == {"score", "novelty", "disease", "datatypeScores", "datasourceScores"}
assert set(r0["disease"]) == {"id", "name"}
assert all(set(x) == {"id", "score"} for x in r0["datatypeScores"] + r0["datasourceScores"])
assert 0.0 < r0["score"] <= 1.0 and r0["disease"]["id"].startswith(("MONDO_", "EFO_", "HP_", "Orphanet_", "OTAR_"))
assert [x["score"] for x in a["rows"]] == sorted((x["score"] for x in a["rows"]), reverse=True)
print(f"2. shape ok: {a['count']} direct associations, top "
      f"{r0['disease']['name']} {r0['disease']['id']} {r0['score']:.4f}")

# 3. TRAP -- GET is a 500, not a 405 and not JSON.
try:
    urllib.request.urlopen(API + "?query=" + urllib.parse.quote("{ meta { name } }"), timeout=60)
    print("3. GET unexpectedly succeeded")
except urllib.error.HTTPError as e:
    print(f"3. GET -> HTTP {e.code} (POST only)")

# 4. TRAP -- an oversized page is HTTP 200 with data.target = None and the reason in `errors`.
bad = gql('{ target(ensemblId:"%s"){ associatedDiseases(page:{index:0,size:3001}){ count } } }' % TP53)
assert bad["_status"] == 200 and bad["data"]["target"] is None
reason = next(l.strip() for l in bad["_errors"][0]["message"].splitlines() if "pagination" in l)
print(f"4. size 3001 -> HTTP 200, data.target=None, errors say: {reason}")

# 5. TRAP -- a wrong identifier is None with NO errors, so it is a different failure.
for bad_id in ("ENSG00000141510.18", "ensg00000141510"):
    out = gql('{ target(ensemblId:"%s"){ approvedSymbol } }' % bad_id)
    assert "_errors" not in out and out["target"] is None
print("5. versioned and lowercase Ensembl ids -> data.target=None, errors absent")

# 6. TRAP -- mapIds is fuzzy. hits[0] is not the exact symbol, even filtered to targets.
mm = gql('{ mapIds(queryTerms:["CAT","MET"], entityNames:["target"]){ mappings{ term hits{ id name } } } }')
by_term = {m["term"]: m["hits"] for m in mm["mapIds"]["mappings"]}
assert by_term["CAT"][0]["name"] != "CAT", "CAT no longer outranked -- re-read the resolver section"
exact = {term: next(h["id"] for h in hits if h["name"] == term) for term, hits in by_term.items()}
print(f"6. mapIds CAT hits[0]={by_term['CAT'][0]['name']!r} exact={exact['CAT']} ; "
      f"MET exact={exact['MET']}")

# 7. TRAP -- direct vs indirect is a different question, and the default flips by side.
tgt = gql('''{ target(ensemblId:"%s"){
    d: associatedDiseases(enableIndirect:false, page:{index:0,size:1}){ count rows{ disease{name} } }
    n: associatedDiseases(page:{index:0,size:1}){ count }
    i: associatedDiseases(enableIndirect:true, page:{index:0,size:1}){ count rows{ disease{name} } } } }''' % TP53)["target"]
dis = gql('''{ disease(efoId:"%s"){
    d: associatedTargets(enableIndirect:false, page:{index:0,size:1}){ count }
    n: associatedTargets(page:{index:0,size:1}){ count } } }''' % "MONDO_0004989")["disease"]
assert tgt["n"]["count"] == tgt["d"]["count"] < tgt["i"]["count"]
assert dis["n"]["count"] > dis["d"]["count"]
print(f"7. target side default==direct ({tgt['d']['count']} vs {tgt['i']['count']} indirect); "
      f"disease side default==indirect ({dis['n']['count']} vs {dis['d']['count']} direct)")
print(f"   top direct {tgt['d']['rows'][0]['disease']['name']!r} != "
      f"top indirect {tgt['i']['rows'][0]['disease']['name']!r}")

# 8. TRAP -- target.evidences has no enableIndirect, so one pair has two evidence counts.
et = gql('{ target(ensemblId:"%s"){ evidences(efoIds:["%s"], size:1){ count } } }' % (NOD2, IBD))
ed = gql('''{ disease(efoId:"%s"){
    d: evidences(ensemblIds:["%s"], enableIndirect:false, size:1){ count }
    n: evidences(ensemblIds:["%s"], size:1){ count } } }''' % (IBD, NOD2, NOD2))["disease"]
assert et["target"]["evidences"]["count"] == ed["d"]["count"] < ed["n"]["count"]
print(f"8. NOD2 x IBD evidence: target side {et['target']['evidences']['count']}, "
      f"disease side default {ed['n']['count']}")

# 9. INVARIANT -- the score is a harmonic sum, recomputable from the API's own evidence.
pair = gql('{ target(ensemblId:"%s"){ associatedDiseases(Bs:["%s"]){ count datasources{ id weight } '
           'rows{ score datasourceScores{ id score } } } } }' % (TP53, LFS))["target"]["associatedDiseases"]
assert pair["count"] == 1
row, weights = pair["rows"][0], {d["id"]: d["weight"] for d in pair["datasources"]}
NORM = sum(1 / k ** 2 for k in range(1, 100_001))
harmonic = lambda v: sum(s / (i + 1) ** 2 for i, s in enumerate(sorted(v, reverse=True))) / NORM

E = ('query($c:String){ target(ensemblId:"%s"){ evidences(efoIds:["%s"], datasourceIds:["%%s"],'
     ' size:1000, cursor:$c){ count cursor rows{ score } } } }' % (TP53, LFS))


def scores(source):
    """Cursor to exhaustion. `count` comes from the first page -- see below."""
    out, cursor, total = [], None, None
    while True:
        ev = gql(E % source, c=cursor)["target"]["evidences"]
        total = ev["count"] if total is None else total
        out += [r["score"] for r in ev["rows"]]
        cursor = ev["cursor"]
        if cursor is None:
            return out, total


worst, biggest = 0.0, None
for ds in row["datasourceScores"]:
    vec, n = scores(ds["id"])
    assert len(vec) == n, f"{ds['id']} paged {len(vec)} of {n}"
    worst = max(worst, abs(harmonic(vec) - ds["score"]))
    if biggest is None or n > biggest[1]:
        biggest = (ds["id"], n, ds["score"])
overall = harmonic(d["score"] * weights.get(d["id"], 1.0) for d in row["datasourceScores"])
assert worst < 1e-9 and abs(overall - row["score"]) < 1e-9
print(f"9. harmonic sum reproduces every datasource score (max delta {worst:.1e}) "
      f"and the overall score ({overall:.12f} vs {row['score']:.12f})")

# 9b. COUNTER-EXAMPLE -- the same computation off one un-paged request. It does not
#     error, it does not warn, it returns a score that is wrong in the 6th decimal.
src, n, reported = biggest
short = gql('{ target(ensemblId:"%s"){ evidences(efoIds:["%s"], datasourceIds:["%s"], size:3000){'
            ' count rows{ score } } } }' % (TP53, LFS, src))["target"]["evidences"]
assert len(short["rows"]) < short["count"] == n
naive = harmonic(r["score"] for r in short["rows"])
assert 1e-9 < abs(naive - reported) < 1e-3
print(f"9b. {src} truncated to {len(short['rows'])} of {n}: {naive:.12f} "
      f"vs {reported:.12f} — off by {abs(naive - reported):.1e}, no error raised")

# 10. INVARIANT -- paging. `index` is a page number and the default page is 25.
nopage = gql('{ target(ensemblId:"%s"){ associatedDiseases{ count rows{ disease{id} } } } }' % TP53)["target"]["associatedDiseases"]
p0 = gql('{ target(ensemblId:"%s"){ associatedDiseases(page:{index:0,size:3000}){ rows{ disease{id} } } } }' % TP53)["target"]["associatedDiseases"]["rows"]
p1 = gql('{ target(ensemblId:"%s"){ associatedDiseases(page:{index:1,size:3000}){ rows{ disease{id} } } } }' % TP53)["target"]["associatedDiseases"]["rows"]
ids0 = [r["disease"]["id"] for r in p0]
ids1 = [r["disease"]["id"] for r in p1]
assert len(nopage["rows"]) == 25
assert len(p0) == 3000 and len(ids0) + len(ids1) == nopage["count"]
print(f"10. default page 25; index is a page number — pages 0 and 1 at size 3000 "
      f"hold {len(ids0)}+{len(ids1)} = {nopage['count']} rows")

# 10b. COUNTER-EXAMPLE -- the row count matching `count` does not mean every row
#      came back. Low scores tie, the sort is unstable across requests, and a tied
#      row straddles the boundary while another is dropped. Smaller pages lose more.
lost = {}
for size in (3000, 500):
    ids, index = [], 0
    while True:
        a = gql('{ target(ensemblId:"%s"){ associatedDiseases(page:{index:%d,size:%d}){ count rows{ disease{id} } } } }'
                % (TP53, index, size))["target"]["associatedDiseases"]
        if not a["rows"]:
            break
        ids += [r["disease"]["id"] for r in a["rows"]]
        index += 1
    assert len(ids) == nopage["count"], "row count no longer matches count"
    lost[size] = nopage["count"] - len(set(ids))
assert 0 < lost[3000] < lost[500], f"tie-boundary loss not reproduced: {lost}"
print(f"10b. paged right through: {nopage['count']} rows both times, but "
      f"{lost[3000]} distinct disease(s) lost at size 3000 and {lost[500]} at size 500")

# 11. TRAP -- on a cursor loop whose total divides evenly by `size`, the terminating
#     page holds no rows and reports count 0. Read the total from the FIRST page.
C = ('query($n:Int!,$c:String){ target(ensemblId:"%s"){ evidences(efoIds:["%s"],'
     ' datasourceIds:["orphanet","uniprot_variants","clingen"], size:$n, cursor:$c){'
     ' count cursor rows{ id } } } }' % (TP53, LFS))
seen_counts = {}
for size in (40, 11):
    cursor, got, first, last = None, 0, None, None
    while True:
        ev = gql(C, n=size, c=cursor)["target"]["evidences"]
        first = ev["count"] if first is None else first
        last, got, cursor = ev["count"], got + len(ev["rows"]), ev["cursor"]
        if cursor is None:
            break
    seen_counts[size] = (got, first, last)
    assert got == first, f"size {size} paged {got} of {first}"
assert seen_counts[40][2] == seen_counts[40][1]      # partial final page: count intact
assert seen_counts[11][2] == 0                        # empty final page: count is 0
print(f"11. cursor totals: size 40 -> {seen_counts[40]}, size 11 -> {seen_counts[11]} "
      f"(got, count-on-first-page, count-on-last-page)")
```

**Expect.** Byte-for-byte stdout from a cold run on 2026-08-27.

```text
1. api 26.6.3  data 26.06
2. shape ok: 5638 direct associations, top Li-Fraumeni syndrome MONDO_0018875 0.8763
3. GET -> HTTP 500 (POST only)
4. size 3001 -> HTTP 200, data.target=None, errors say: There was a pagination error. You used size 3001 but the size must be between 0 and 3000 (line 1, column 64):
5. versioned and lowercase Ensembl ids -> data.target=None, errors absent
6. mapIds CAT hits[0]='CRAT' exact=ENSG00000121691 ; MET exact=ENSG00000105976
7. target side default==direct (5638 vs 17613 indirect); disease side default==indirect (17963 vs 15586 direct)
   top direct 'Li-Fraumeni syndrome' != top indirect 'acute myeloid leukemia'
8. NOD2 x IBD evidence: target side 995, disease side default 4003
9. harmonic sum reproduces every datasource score (max delta 1.3e-14) and the overall score (0.876321635082 vs 0.876321635082)
9b. eva truncated to 3000 of 3933: 0.969235724059 vs 0.969236628394 — off by 9.0e-07, no error raised
10. default page 25; index is a page number — pages 0 and 1 at size 3000 hold 3000+2638 = 5638 rows
10b. paged right through: 5638 rows both times, but 1 distinct disease(s) lost at size 3000 and 61 at size 500
11. cursor totals: size 40 -> (77, 77, 77), size 11 -> (77, 77, 0) (got, count-on-first-page, count-on-last-page)
```

**Invariants** — true regardless of release, so a failure means this skill is wrong:

- Line 3: GET is a server error, not JSON. Line 4: an argument error is HTTP 200 with the
  entity nulled and the reason only in `errors`. Line 5: a wrong identifier is `None` with no
  `errors` — the two failures are distinguishable only by looking at `errors`.
- Line 6: `mapIds` ranks `CRAT` above `CAT`, so `hits[0]` is unsafe and the exact name
  comparison is required. The assertion is deliberately on the *inequality*.
- Lines 7 and 8: the target side defaults to direct and the disease side to indirect, and
  `target.evidences` has no way to ask for indirect at all.
- Line 9: both scores reconstruct as a harmonic sum to under 1e-9. This is the strongest
  invariant here — it fails if the scoring model or the normaliser changes, and it is also
  what proves the score is a rank statistic rather than a probability.
- Line 10: the default page is 25 rows, and `page.index` is a page number, so consecutive
  pages are disjoint and exhaustive.

**Observed values**, from API 26.6.3 / data release 26.06 on 2026-08-27 — these move when
Open Targets rebuilds, and a mismatch is drift to investigate, not a bug: 5,638 direct and
17,613 indirect TP53 associations; Li-Fraumeni syndrome at 0.8763; 17,963 indirect and 15,586
direct targets for breast carcinoma; 995 vs 4,003 NOD2 x IBD evidence records; the overall
score 0.876321635082489.

## Sources

- Platform documentation, licence and per-source table — <https://platform-docs.opentargets.org/licence>
- Association scoring — <https://platform-docs.opentargets.org/associations>
- GraphQL API and schema — <https://api.platform.opentargets.org/api/v4/graphql/schema>
- Bulk release datasets — <https://ftp.ebi.ac.uk/pub/databases/opentargets/platform/>
