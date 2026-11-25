---
name: hpo-monarch
description: Get Human Phenotype Ontology terms and disease/gene annotations from a pinned HPO release, and gene–disease–phenotype associations from the Monarch Initiative API — descendant queries, NOT annotations, paging, obsolete ids, id joins.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, human-genetics, phenotyping, rare-disease]
covers: [human phenotype ontology, hpo, hp.obo, phenotype.hpoa, hpoa, genes_to_phenotype, phenotype annotation, rare disease, mendelian disease, monarch initiative, monarch kg, knowledge graph, mondo, omim, orphanet, orphadata, decipher, ncbi gene, hgnc, gene-disease association, disease-phenotype association, gene-phenotype association, not qualifier, negated, obsolete term, alt_id, ontology descendants, seizure, marfan syndrome, human]
papers: [doi:10.1093/nar/gkad1005, doi:10.1093/nar/gkad1082]
access: [open]
datasets: [https://github.com/obophenotype/human-phenotype-ontology/releases/download/v2026-09-01/hp.obo, https://github.com/obophenotype/human-phenotype-ontology/releases/download/v2026-09-01/phenotype.hpoa, https://github.com/obophenotype/human-phenotype-ontology/releases/download/v2026-09-01/genes_to_disease.txt, https://api.monarchinitiative.org/v3/api/version, https://data.monarchinitiative.org/monarch-kg/2026-11-11/tsv/all_associations/causal_gene_to_disease_association.all.tsv.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-19
  against: HPO release v2026-09-01 (hp.obo data-version hp/releases/2026-09-01, phenotype.hpoa version 2026-09-02) / Monarch API 1.32.0 on Monarch KG 2026-11-11 / Python 3.12 standard library only / curl 8 / macOS arm64
  executed: 9
  unverified: 0
---

# HPO and Monarch — phenotypes, diseases and genes

Two sources, used together, answering different questions:

- **The Human Phenotype Ontology (HPO)** — about 19,900 current phenotype terms (`HP:` ids) in an
  `is_a` hierarchy, released with annotation files that link them to diseases (`OMIM:`, `ORPHA:`,
  `DECIPHER:`) and, through those diseases, to genes (`NCBIGene` ids). Versioned GitHub releases;
  pin one and the answer is reproducible.
- **The Monarch Initiative knowledge graph** — HPO's annotations plus Orphanet, OMIM, ClinGen,
  model-organism databases and others, re-keyed on `MONDO:` diseases and `HGNC:` genes, behind a
  REST API (`/v3/api`). Wider and easier to query; the API serves only the current graph.

Use the HPO files when you need a fixed release, the full annotation detail (frequency, onset,
evidence, curator) or a bulk join. Use Monarch for cross-source gene–disease edges, MONDO
disease groupings, model-organism phenotypes, or a quick question about one entity. For variants
behind a gene–disease link see `clinvar`; for population frequencies `gnomad`; for mouse knockout
phenotypes `impc`; for gene identifiers `ncbi-gene`; for target-level evidence `open-targets`.

No account or key for either. Everything below runs on the Python standard library.

## Licence and terms — read before you redistribute

**HPO.** The HPO licence page (https://hpo.jax.org/license, a single-page app; the text is served
from its JavaScript bundle) says the files "are freely available" and that "anyone can download
the HPO and use the ontologies or other HPO files under three conditions": that the HPO
Consortium is acknowledged and cited, that any HPO file displayed publicly includes its date or
version, and that "neither the content of the HPO file(s) nor the logical relationships embedded
within the HPO file(s) be altered in any way". It also asks users to state "This service/product
uses the Human Phenotype Ontology (version information)" in their online presence. There is no
non-commercial clause on the files. The same site's separate website terms restrict copying
*website content* to "personal, noncommercial use"; that clause covers pages on hpo.jax.org,
not the release files on GitHub. So: cite, carry the version (the helper keeps it), and do not
ship a modified `hp.obo` under the HPO name — derived tables are fine, an edited ontology is not.

**OMIM-derived content.** In `phenotype.hpoa` about 170,000 rows are keyed on `OMIM:` disease
ids. The annotations themselves are HPO curation (see the `biocuration` column) released under
HPO's terms; the disease ids and names name OMIM entries. OMIM's own data — its clinical text and
its `morbidmap` gene map — is a separate product from Johns Hopkins, downloadable only with a
registered key, and its download terms require a licence for commercial use and for
redistribution (omim.org answers automated clients with a Cloudflare `403`, so read the terms
there in a browser). HPO's `genes_to_disease.txt` takes its OMIM gene links from NCBI's
`mim2gene_medgen`, not from OMIM's files.

**Monarch.** The Monarch app and API code are BSD-3-Clause. Monarch states no single licence for
the graph's data: its terms page sends you to per-source licensing, and the graph's own
`NOTICE.md` lists attribution obligations that pass to anyone redistributing it. In practice:
Orphanet-sourced edges are CC BY 4.0 ("Data: Orphadata … licensed under CC BY 4.0"), HPO-sourced
edges carry HPO's terms above, and edges whose `primary_knowledge_source` is `infores:omim` on
gene–disease associations come from OMIM's key-gated `morbidmap` download. Before redistributing
Monarch output, group it by `primary_knowledge_source` and check each source's terms; for
commercial redistribution of OMIM-sourced edges, OMIM's licence applies.

Monarch's terms also say its tools "should not be used for direct diagnostic use or medical
decision-making". Neither source is a clinical product.

## Pin a release, not "latest"

- HPO: GitHub release tag **`v2026-09-01`** (published 2026-09-03). Files are at
  `https://github.com/obophenotype/human-phenotype-ontology/releases/download/v2026-09-01/<file>`.
  The PURL `http://purl.obolibrary.org/obo/hp/releases/2026-09-01/<file>` redirects to the same
  assets; `http://purl.obolibrary.org/obo/hp/hpoa/<file>` redirects to `releases/latest` and is
  not pinned. Inside, `hp.obo` says `data-version: hp/releases/2026-09-01` and `phenotype.hpoa`
  says `#version: 2026-09-02` — same release, one day apart; record both.
- Monarch API: always the current graph. Record `GET /v3/api/version` with every result. The
  graph itself is archived by date at `https://data.monarchinitiative.org/monarch-kg/<date>/`
  (monthly-ish, back to 2023-09-28); `/v3/api/sources/versions` says which upstream release each
  source came from. KG 2026-11-11 was built on the same HPO annotations (`infores:hpoa`
  2026-09-02) as the HPO release pinned here.

## Which file carries what

| file (release asset) | size | what it is |
|---|---|---|
| `hp.obo` | 11 MB | the ontology: terms, `is_a` parents, synonyms, `alt_id`, obsolete terms |
| `phenotype.hpoa` | 36 MB | disease → phenotype annotations: `qualifier` (`NOT`), `evidence`, `onset`, `frequency`, `sex`, `aspect`, curator |
| `genes_to_disease.txt` | 1.5 MB | gene → disease, `NCBIGene:` ids, with the source of each link |
| `genes_to_phenotype.txt` | 21 MB | gene → phenotype, via disease — **see the NOT trap below** |
| `phenotype_to_genes.txt` | 67 MB | the same, propagated up the hierarchy |

`aspect` in `phenotype.hpoa` is `P` (phenotypic abnormality, ~94%), `I` (mode of inheritance),
`C` (clinical course and onset), `M` (modifier) or `H` (past medical history). A question about
"phenotypes" usually wants `P` only.

## The helper

Every block below imports this. Save it as `hpo_tools.py`.

```python
# hpo_tools.py
import csv, json, os, shutil, time, urllib.error, urllib.parse, urllib.request

RELEASE = "v2026-09-01"        # HPO GitHub release tag; hp.obo data-version hp/releases/2026-09-01
HPO = f"https://github.com/obophenotype/human-phenotype-ontology/releases/download/{RELEASE}"
MONARCH = "https://api.monarchinitiative.org/v3/api"
PAGE = 500                      # the API's maximum; 501 answers 422


def download(name, folder=f"hpo-{RELEASE}"):
    """Fetch one release asset once. GitHub served these at about 0.5 MB/s; cache them."""
    os.makedirs(folder, exist_ok=True)
    dest = os.path.join(folder, name)
    if not os.path.exists(dest):
        with urllib.request.urlopen(f"{HPO}/{name}", timeout=900) as r, open(dest + ".part", "wb") as out:
            shutil.copyfileobj(r, out)
        os.replace(dest + ".part", dest)
    return dest


def load_obo(path):
    """hp.obo -> {'version', 'terms', 'alt', 'kids'}; obsolete terms are kept and flagged."""
    terms, alt, version, cur = {}, {}, None, None
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if line.startswith("data-version: "):
                version = line.split(": ", 1)[1]
            if line.startswith("["):          # [Typedef] stanzas also have id: lines
                cur = {"is_a": [], "alt_id": [], "obsolete": False, "replaced_by": [], "consider": []} \
                    if line == "[Term]" else None
                continue
            if cur is None or ": " not in line:
                continue
            k, v = line.split(": ", 1)
            if k == "id":
                terms[v] = cur
            elif k == "name":
                cur["name"] = v
            elif k == "is_a":
                cur["is_a"].append(v.split(" ", 1)[0])
            elif k in ("alt_id", "replaced_by", "consider"):
                cur[k].append(v.split(" ", 1)[0])
            elif k == "is_obsolete":
                cur["obsolete"] = v == "true"
    for tid, t in terms.items():
        for a in t["alt_id"]:
            alt[a] = tid
    kids = {}
    for tid, t in terms.items():
        if not t["obsolete"]:
            for p in t["is_a"]:
                kids.setdefault(p, set()).add(tid)
    return {"version": version, "terms": terms, "alt": alt, "kids": kids}


def resolve(onto, tid):
    """Map an HP id from any source to a current term -> (current_id or None, how)."""
    t = onto["terms"].get(tid)
    if t and not t["obsolete"]:
        return tid, "current"
    if t and len(t["replaced_by"]) > 1:
        return None, "obsolete, replaced_by is ambiguous: " + ",".join(t["replaced_by"])
    if t and t["replaced_by"]:
        return t["replaced_by"][0], "replaced_by"
    if tid in onto["alt"] and not onto["terms"][onto["alt"][tid]]["obsolete"]:
        return onto["alt"][tid], "alt_id"
    if t:
        return None, "obsolete, consider " + ",".join(t["consider"]) if t["consider"] else "obsolete"
    return None, "unknown id"


def descendants(onto, root):
    """The term itself plus every current is_a descendant."""
    out, stack = {root}, [root]
    while stack:
        for k in onto["kids"].get(stack.pop(), ()):
            if k not in out:
                out.add(k)
                stack.append(k)
    return out


def read_tsv(path):
    """phenotype.hpoa (skipping its #-header lines) and the genes_to_* files -> list of dicts."""
    with open(path, encoding="utf-8") as fh:
        lines = [l for l in fh if not l.startswith("#")]
    return list(csv.DictReader(lines, delimiter="\t"))


def monarch(path, **params):
    """One Monarch v3 call -> (status, parsed JSON or error text). Retries 5xx twice."""
    url = f"{MONARCH}{path}?{urllib.parse.urlencode(params, doseq=True)}" if params else f"{MONARCH}{path}"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 2:
                return e.code, e.read().decode("utf-8", "replace")[:300]
        time.sleep(2 * (attempt + 1))


def associations(**params):
    """Every row of /association, paged at 500, checked against the reported total."""
    rows, offset = [], 0
    while True:
        code, d = monarch("/association", limit=PAGE, offset=offset, **params)
        if code != 200:
            raise RuntimeError(f"{code}: {d}")
        rows += d["items"]
        offset += PAGE
        if offset >= d["total"] or not d["items"]:
            break
    if len(rows) != d["total"] or len({r["id"] for r in rows}) != d["total"]:
        raise RuntimeError(f"paging lost rows: {len(rows)} of {d['total']}")
    return rows
```

## Terms: obsolete, alt_id and replaced_by

An HP id in somebody else's table, an old paper or a Monarch result may no longer be current.
`hp.obo` v2026-09-01 has 20,482 `[Term]` stanzas, 588 of them obsolete, and 3,974 `alt_id`s. Of
the obsolete terms, 529 are also listed as an `alt_id` of a live term (a merge), 507 carry
`replaced_by`, and 58 have only `consider` — those need a human. One, `HP:0410382`, has two
`replaced_by` values, and its `alt_id` entry agrees with only one of them; `resolve()` refuses
to guess.

```python
import hpo_tools as h

onto = h.load_obo(h.download("hp.obo"))
print(onto["version"], len(onto["terms"]), "stanzas")
for tid in ["HP:0001250", "HP:0001425", "HP:0034653", "HP:0000535", "HP:0410382", "HP:9999999"]:
    print(tid, onto["terms"].get(tid, {}).get("name"), "->", h.resolve(onto, tid))
```

```
hp/releases/2026-09-01 20482 stanzas
HP:0001250 Seizure -> ('HP:0001250', 'current')
HP:0001425 obsolete Heterogeneous -> ('HP:0000005', 'replaced_by')
HP:0034653 obsolete Monocarboxylic aciduria -> ('HP:0033303', 'replaced_by')
HP:0000535 obsolete Sparse and thin eyebrow -> (None, 'obsolete, consider HP:0045074,HP:0045075')
HP:0410382 obsolete Abnormal proportion of effector memory CD4-positive, alpha-beta T cells -> (None, 'obsolete, replaced_by is ambiguous: HP:0025623,HP:0410379')
HP:9999999 None -> (None, 'unknown id')
```

Resolve every incoming id before you look it up. In this release no row of `phenotype.hpoa` or
`genes_to_phenotype.txt` uses an obsolete or `alt_id` term, but an older table joined against
it will. Monarch returns obsolete terms with `"deprecated": true` and no replacement
(`/entity/HP:0001425` → `obsolete Heterogeneous`), so resolve against `hp.obo` there too.

## Exact term or descendants — decide, then say which

"Diseases with seizures" is a question about `HP:0001250` **and its 346 descendants**
(focal, generalized, febrile…). Curators annotate the most specific term they can, so an
exact-id match misses most of them. Whichever you mean, key on ids — never on the label text.

```python
import hpo_tools as h

onto = h.load_obo(h.download("hp.obo"))
hpoa = h.read_tsv(h.download("phenotype.hpoa"))
SEIZURE = "HP:0001250"
sub = h.descendants(onto, SEIZURE)
pos = [r for r in hpoa if r["qualifier"] != "NOT"]
exact = {r["database_id"] for r in pos if r["hpo_id"] == SEIZURE}
deep = {r["database_id"] for r in pos if r["hpo_id"] in sub}
negated = {r["database_id"] for r in hpoa if r["qualifier"] == "NOT" and r["hpo_id"] in sub}
by_label = {t for t, v in onto["terms"].items() if not v["obsolete"] and "seizure" in v["name"].lower()}
labelled = {r["database_id"] for r in pos if r["hpo_id"] in by_label}
print("terms in subtree       :", len(sub))
print("diseases, exact term   :", len(exact))
print("diseases, + descendants:", len(deep))
print("diseases with a NOT row:", len(negated))
print("label search 'seizure' :", len(labelled), "diseases | subtree diseases it misses:", len(deep - labelled))
print("terms the label search adds from outside the subtree:",
      sorted(onto["terms"][t]["name"] for t in by_label - sub)[:5])
assert exact < deep
```

```
terms in subtree       : 347
diseases, exact term   : 2544
diseases, + descendants: 3129
diseases with a NOT row: 15
label search 'seizure' : 3104 diseases | subtree diseases it misses: 25
terms the label search adds from outside the subtree: ['Developmental stagnation at onset of seizures', 'Maternal seizure', 'Non-epileptic seizure', 'Pseudoseizure', 'Seizure cluster']
```

The label search misses status epilepticus, epileptic spasm and auras, and pulls in
"Non-epileptic seizure" and "Pseudoseizure", which is not a seizure in HPO's sense. Pass the subtree, state the
root id, and state whether NOT rows were removed.

## NOT annotations, and the file that drops them

`phenotype.hpoa` has 733 rows with `qualifier` = `NOT`: the curators recorded that the disease
does **not** show the phenotype — usually because it distinguishes it from a lookalike. Monarch
keeps them as `"negated": true`. Drop or separate them before counting anything.

`genes_to_phenotype.txt` has no qualifier column. It is exactly the join of
`genes_to_disease.txt` and `phenotype.hpoa` on disease id **with the NOT rows included**, so every
NOT annotation becomes a positive gene–phenotype row. In v2026-09-01 that is 826 of its 333,983
rows. Example: Orphanet records that progressive non-fluent aphasia (`ORPHA:100070`) does NOT
include stroke; `genes_to_phenotype.txt` lists stroke for GRN, MAPT, PSEN1, VCP, CHMP2B, TREM2 and
TMEM106B through that disease. Build gene → phenotype yourself:

```python
import collections, hpo_tools as h

hpoa = h.read_tsv(h.download("phenotype.hpoa"))
g2d = h.read_tsv(h.download("genes_to_disease.txt"))
g2p = h.read_tsv(h.download("genes_to_phenotype.txt"))

genes = collections.defaultdict(set)              # disease -> NCBIGene numbers
for r in g2d:
    genes[r["disease_id"]].add(r["ncbi_gene_id"].removeprefix("NCBIGene:"))   # prefixed here...
both, positive = set(), set()
for r in hpoa:
    for g in genes.get(r["database_id"], ()):
        both.add((g, r["hpo_id"], r["database_id"]))
        if r["qualifier"] != "NOT":
            positive.add((g, r["hpo_id"], r["database_id"]))
shipped = {(r["ncbi_gene_id"], r["hpo_id"], r["disease_id"]) for r in g2p}  # ...bare numbers here
print("genes_to_phenotype rows     :", len(shipped))
print("rebuilt, NOT rows included  :", len(both), "| identical to the file:", both == shipped)
print("rebuilt, NOT rows removed   :", len(positive))
print("rows that exist only via NOT:", len(shipped - positive))
assert both == shipped and positive < shipped
assert ("2896", "HP:0001297", "ORPHA:100070") in shipped - positive      # GRN - Stroke
```

```
genes_to_phenotype rows     : 333983
rebuilt, NOT rows included  : 333983 | identical to the file: True
rebuilt, NOT rows removed   : 333157
rows that exist only via NOT: 826
```

Note the gene id: `genes_to_disease.txt` writes `NCBIGene:2200`; `genes_to_phenotype.txt`
writes `2200`. Normalise before joining.

## The Monarch API

Base `https://api.monarchinitiative.org/v3/api` (also answered at `api-v3.monarchinitiative.org`).
OpenAPI at `https://api.monarchinitiative.org/openapi.json` — not under `/v3/`, which answers 404.
One endpoint does most of the work, `/association`, filtered by `subject`, `object`, `category`,
`predicate`, `primary_knowledge_source` and others. The traps, all measured:

- **`direct` defaults to `false`, which includes descendants.** `object=HP:0001250` returns
  associations to seizure *and every subtype*; `direct=true` returns only the exact term. On the
  subject side, `direct=false` likewise expands a MONDO disease to its subtypes: epilepsy
  (`MONDO:0005027`) has 1 phenotype edge of its own and 6,465 with its subtypes.
- **Without `category`, an `object=` query mixes kinds**: for seizure, cases, genes, diseases and
  chemical associations together.
- **`limit` defaults to 20 and is capped at 500.** The first page carries `total`; a reader that
  reads one page and stops has 20 of thousands with no error. `limit=501` answers `422`. An
  `offset` past the end answers `200` with an empty `items` list. `associations()` pages to the
  end and checks the count; deep offsets (268,000) worked.
- **`negated: true`** rows come back from a `has_phenotype` query. Filter them.
- **Monarch's gene → phenotype set is not HPO's file.** For FBN1 (`HGNC:3603`) Monarch has 287
  distinct phenotypes (481 edges, all `logical_entailment` via a disease); HPO's
  `genes_to_phenotype.txt` has 312. All 25 extra come through Orphanet diseases; the reason
  was not established. Say which source a gene's phenotype list came from.
- **Diseases are MONDO, genes are HGNC.** `/entity/OMIM:619340` and `/entity/NCBIGene:2200` answer
  `404 Entity not found`; translate with `/mappings` first (next section).

```python
import collections, hpo_tools as h

code, v = h.monarch("/version")
print(v)
CAT = "biolink:DiseaseToPhenotypicFeatureAssociation"
for direct in ("true", "false"):
    code, d = h.monarch("/association", object="HP:0001250", category=CAT, direct=direct, limit=0)
    print(f"seizure, direct={direct}: total {d['total']}")
code, d = h.monarch("/association", object="HP:0001250", category=CAT)
print("one call, no limit      :", len(d["items"]), "of", d["total"])
rows = h.associations(object="HP:0001250", category=CAT, direct="true")
print("paged, direct=true      :", len(rows), "| negated:", sum(r["negated"] is True for r in rows),
      "| sources:", dict(collections.Counter(r["primary_knowledge_source"] for r in rows)))
print("limit=501               :", h.monarch("/association", object="HP:0001250", limit=501)[0])
code, d = h.monarch("/association", object="HP:0001250", category=CAT, limit=500, offset=10**6)
print("offset past the end     :", code, len(d["items"]), "items")
print("/entity/OMIM:619340     :", h.monarch("/entity/OMIM:619340")[0])
code, d = h.monarch("/association", object="HP:0001250", limit=0, facet_fields="category")
print("no category, kinds      :", [f["label"].split(":")[1] for f in d["facet_fields"][0]["facet_values"]][:4])
```

```
{'monarch_kg_version': '2026-11-11', 'monarch_api_version': '1.32.0', 'monarch_kg_source': 'https://data.monarchinitiative.org/monarch-kg/2026-11-11'}
seizure, direct=true: total 2561
seizure, direct=false: total 5350
one call, no limit      : 20 of 5350
paged, direct=true      : 2561 | negated: 14 | sources: {'infores:orphanet': 1057, 'infores:mondo': 7, 'infores:omim': 1497}
limit=501               : 422
offset past the end     : 200 0 items
/entity/OMIM:619340     : 404
no category, kinds      : ['CaseToPhenotypicFeatureAssociation', 'GeneToPhenotypicFeatureAssociation', 'DiseaseToPhenotypicFeatureAssociation', 'Association']
```

On disease → phenotype edges, `infores:omim` names the disease's source, not who curated the
edge: these are HPO's annotations of OMIM diseases (`aggregator_knowledge_source` lists
`infores:hpo-annotations`). On gene → disease edges, `infores:omim` is OMIM's own `morbidmap`.

## Joining across sources: ids, with the right prefix

Every join in this skill keys on identifiers. Disease and phenotype names drift between releases
and sources; ids do not. Measured on v2026-09-01: of the 12,880 diseases in `phenotype.hpoa`,
matching the disease name to a MONDO label agreed with the MONDO id mapping for 7,431, found no
label for 5,222, and **picked a different MONDO disease for 132** — `OMIM:106210` "Aniridia"
label-matches the umbrella `MONDO:0019172` (aniridia), while its id maps to the specific
`MONDO:0024507` (aniridia 1); `OMIM:227500` "Factor VII deficiency" label-matches
`MONDO:0002244` (factor VII deficiency, which includes acquired forms) while its id maps to
`MONDO:0009211` (congenital factor VII deficiency).

The id crosswalks, each with its trap:

| from | to | route | trap |
|---|---|---|---|
| `OMIM:` / `ORPHA:` (HPO files) | `MONDO:` (Monarch) | `/v3/api/mappings?object_id=…` or `mondo.sssom.tsv` | HPO writes `ORPHA:`, MONDO and Monarch write `Orphanet:` — rewrite the prefix or nothing matches |
| `MONDO:` | `OMIM:`, `Orphanet:` | entity `xref` | a disease id can have no exact MONDO match (95 of the 12,880 in `phenotype.hpoa`) |
| `NCBIGene:` (HPO) | `HGNC:` (Monarch) | `/v3/api/mappings?entity_id=NCBIGene:…` | HGNC entity `xref` lists Ensembl and OMIM, not NCBIGene; `genes_to_phenotype.txt` drops the prefix |
| `HP:` from elsewhere | current `HP:` | `resolve()` | obsolete and merged terms |

```python
import hpo_tools as h

def mondo_for(curie):
    curie = curie.replace("ORPHA:", "Orphanet:")
    code, d = h.monarch("/mappings", object_id=curie, predicate_id="skos:exactMatch", limit=50)
    return sorted({m["subject_id"] for m in d["items"]})

def hgnc_for(ncbigene):
    code, d = h.monarch("/mappings", entity_id=f"NCBIGene:{ncbigene}", limit=50)
    return sorted({m["subject_id"] for m in d["items"] if m["subject_id"].startswith("HGNC:")})

for c in ["OMIM:154700", "ORPHA:558", "OMIM:106210", "OMIM:227500"]:
    print(c, "->", mondo_for(c))
code, d = h.monarch("/mappings", object_id="ORPHA:558", limit=5)
print("ORPHA:558 unrewritten ->", d["total"], "mappings")
print("NCBIGene:2200 ->", hgnc_for("2200"))
code, e = h.monarch("/entity/MONDO:0007947")
print("MONDO:0007947", e["name"], [x for x in e["xref"] if x.startswith(("OMIM:", "Orphanet:"))])
```

```
OMIM:154700 -> ['MONDO:0007947']
ORPHA:558 -> ['MONDO:0007947']
OMIM:106210 -> ['MONDO:0024507']
OMIM:227500 -> ['MONDO:0009211']
ORPHA:558 unrewritten -> 0 mappings
NCBIGene:2200 -> ['HGNC:3603']
MONDO:0007947 Marfan syndrome ['OMIM:154700', 'Orphanet:284963', 'Orphanet:558']
```

## Get the files

**The pinned HPO release** — the ontology and the three annotation files, with a manifest of
sizes, checksums and the version line each file carries, plus a gene → phenotype table rebuilt
with NOT rows removed and `aspect` kept so you can filter to `P`:

```python
import collections, csv, hashlib, json, os
import hpo_tools as h

NAMES = ["hp.obo", "phenotype.hpoa", "genes_to_disease.txt", "genes_to_phenotype.txt"]
manifest = {"release": h.RELEASE, "source": h.HPO,
            "terms": "https://hpo.jax.org/license — cite HPO, show this version, do not alter the files",
            "files": []}
for n in NAMES:
    p = h.download(n)
    with open(p, encoding="utf-8") as fh:
        head = [l.strip() for l, _ in zip(fh, range(30)) if l.startswith(("data-version", "#version", "#date"))]
    manifest["files"].append({"name": n, "bytes": os.path.getsize(p),
                              "sha256": hashlib.sha256(open(p, "rb").read()).hexdigest(), "header": head})
out = f"hpo-{h.RELEASE}"
json.dump(manifest, open(f"{out}/MANIFEST.json", "w"), indent=1)

onto = h.load_obo(f"{out}/hp.obo")
genes = collections.defaultdict(set)
for r in h.read_tsv(f"{out}/genes_to_disease.txt"):
    genes[r["disease_id"]].add((r["ncbi_gene_id"], r["gene_symbol"], r["association_type"]))
n = 0
with open(f"{out}/gene_phenotype_positive.tsv", "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["ncbi_gene_id", "gene_symbol", "association_type", "hpo_id", "hpo_name", "aspect",
                "disease_id", "frequency", "evidence", "reference"])
    for r in h.read_tsv(f"{out}/phenotype.hpoa"):
        if r["qualifier"] == "NOT":
            continue
        for gid, sym, kind in sorted(genes.get(r["database_id"], ())):
            w.writerow([gid, sym, kind, r["hpo_id"], onto["terms"][r["hpo_id"]]["name"], r["aspect"],
                        r["database_id"], r["frequency"], r["evidence"], r["reference"]])
            n += 1
for f in manifest["files"]:
    print(f["name"], f["bytes"], f["sha256"][:12], f["header"])
print(n, "rows in gene_phenotype_positive.tsv")
```

```
hp.obo 10863613 93dace952fcb ['data-version: hp/releases/2026-09-01']
phenotype.hpoa 35816037 e89aa39c8f97 ['#version: 2026-09-02']
genes_to_disease.txt 1492039 7937a1b92779 []
genes_to_phenotype.txt 20821704 507a17bff9c4 []
333807 rows in gene_phenotype_positive.tsv
```

One row per annotation row × linked gene, so a gene–phenotype pair recurs when a disease has
several annotation rows for the term (different onset, frequency or source) or the gene has
several links to the disease; the distinct (gene, phenotype, disease) count is 333,157.
`genes_to_disease.txt` and `genes_to_phenotype.txt` carry no version line, so the manifest's
release tag and checksum are what identify them.

**A pinned Monarch graph slice** — the dated KG archive has one TSV per association type
(`disease_to_phenotypic_feature`, `gene_to_phenotypic_feature`, `causal_gene_to_disease`,
`correlated_gene_to_disease`, `variant_to_disease` and two dozen more) under
`tsv/all_associations/`, plus per-entity folders under `tsv/gene_associations/` and
`tsv/disease_associations/`. Each row carries `primary_knowledge_source`, so you can split by
source for licensing:

```bash
KG=2026-11-11
mkdir -p monarch-kg-$KG && cd monarch-kg-$KG
curl -sSfLO "https://data.monarchinitiative.org/monarch-kg/$KG/tsv/all_associations/causal_gene_to_disease_association.all.tsv.gz"
curl -sSfLO "https://data.monarchinitiative.org/monarch-kg/$KG/metadata.yaml"
curl -sSfLO "https://data.monarchinitiative.org/monarch-kg/$KG/NOTICE.md"
gunzip -c causal_gene_to_disease_association.all.tsv.gz | awk -F'\t' 'NR>1{print $14}' | sort | uniq -c
shasum -a 256 causal_gene_to_disease_association.all.tsv.gz
```

```
 227 infores:clingen
6956 infores:omim
6844 infores:orphanet
0ff7f30e5dbf4540a6de026654a239b7ae6eb4bb79876692c7f34bc11ac852f4  causal_gene_to_disease_association.all.tsv.gz
```

Half of the causal gene–disease edges in this slice are OMIM-sourced — the part to check
against OMIM's terms before redistribution.

The whole graph is there too (`monarch-kg.duckdb`, `monarch-kg.jsonl.tar.gz`, a Neo4j dump) if
you would rather query it locally than page an API.

## What does not work

| what | what happens | instead |
|---|---|---|
| `https://hpo.jax.org/license`, `/app/license` | HTTP `404` with the app shell; the licence text is rendered by JavaScript | read it in a browser; quote it with the date |
| `purl.obolibrary.org/obo/hp/hpoa/phenotype.hpoa` | redirects to `releases/latest` — moves under you | `releases/download/v2026-09-01/...` or the dated PURL |
| `genes_to_phenotype.txt` as "genes with this phenotype" | includes 826 rows that exist only because of a NOT annotation | rebuild from `genes_to_disease.txt` + `phenotype.hpoa` (above) |
| Monarch `/association` with no `limit` | 20 rows, `total` says thousands | `associations()` pages at 500 and checks the count |
| Monarch `limit=501` or more | `422` | 500 and `offset` |
| Monarch `object=HP:…` expecting the exact term | descendants included (`direct` defaults to false): 5,350 vs 2,561 for seizure | `direct=true`, or keep the default and say so |
| Monarch `/entity/OMIM:…`, `/entity/NCBIGene:…` | `404 Entity not found` | `/mappings` to MONDO / HGNC |
| Monarch `/entity/{id}/biolink:PhenotypicFeature` | `422 Unknown association-type section key` | `/association` with `subject=` and `category=` |
| Monarch `/v3/openapi.json`; the v2 `/api/bioentity/...` paths | `404` | `/openapi.json`; v3 `/v3/api/...` |
| `ORPHA:558` against Monarch or MONDO | no mapping | `Orphanet:558` |
| omim.org pages and downloads from a script | Cloudflare `403` "Just a moment…" | a browser, and OMIM's registered download key |

## Try it

**Data.** HPO release `v2026-09-01` from GitHub — `hp.obo` (11 MB), `phenotype.hpoa` (36 MB),
`genes_to_disease.txt` (1.5 MB), `genes_to_phenotype.txt` (21 MB) — free to use under the HPO
licence quoted above; and the live Monarch v3 API. No account, no key. The first run took about
five minutes on 2026-11-19, almost all of it downloading; reruns reuse the files. Confirmed
reachable 2026-11-19.

**Run.** In a fresh directory, with `hpo_tools.py` from *The helper* saved there.

```python
import collections, hpo_tools as h

onto = h.load_obo(h.download("hp.obo"))
hpoa = h.read_tsv(h.download("phenotype.hpoa"))
g2d = h.read_tsv(h.download("genes_to_disease.txt"))
g2p = h.read_tsv(h.download("genes_to_phenotype.txt"))

# 1. the release you think you have
assert onto["version"] == "hp/releases/2026-09-01"

# 2. obsolete and merged ids resolve, ambiguous ones do not
assert h.resolve(onto, "HP:0034653") == ("HP:0033303", "replaced_by")
assert h.resolve(onto, "HP:0410382")[0] is None
assert h.resolve(onto, "HP:0000535")[0] is None

# 3. exact term vs descendants
sub = h.descendants(onto, "HP:0001250")
pos = [r for r in hpoa if r["qualifier"] != "NOT"]
exact = {r["database_id"] for r in pos if r["hpo_id"] == "HP:0001250"}
deep = {r["database_id"] for r in pos if r["hpo_id"] in sub}
assert exact < deep

# 4. genes_to_phenotype.txt turns NOT annotations into positive rows
genes = collections.defaultdict(set)
for r in g2d:
    genes[r["disease_id"]].add(r["ncbi_gene_id"].removeprefix("NCBIGene:"))
both = {(g, r["hpo_id"], r["database_id"]) for r in hpoa for g in genes.get(r["database_id"], ())}
positive = {(g, r["hpo_id"], r["database_id"]) for r in pos for g in genes.get(r["database_id"], ())}
shipped = {(r["ncbi_gene_id"], r["hpo_id"], r["disease_id"]) for r in g2p}
assert both == shipped
assert ("2896", "HP:0001297", "ORPHA:100070") in shipped - positive

# 5. Monarch: version, descendants by default, the 20-row default page, the 500 cap, paging
code, v = h.monarch("/version")
CAT = "biolink:DiseaseToPhenotypicFeatureAssociation"
t_direct = h.monarch("/association", object="HP:0001250", category=CAT, direct="true", limit=0)[1]["total"]
t_deep = h.monarch("/association", object="HP:0001250", category=CAT, limit=0)[1]["total"]
first = h.monarch("/association", object="HP:0001250", category=CAT)[1]
assert t_deep > t_direct and len(first["items"]) == 20 < first["total"]
assert h.monarch("/association", object="HP:0001250", limit=501)[0] == 422
rows = h.associations(object="HP:0001250", category=CAT, direct="true")
assert len(rows) == t_direct and all(r["object"] == "HP:0001250" for r in rows)
neg = [r for r in rows if r["negated"] is True]
assert neg, "Monarch returns negated has_phenotype rows; filter them"

# 6. the NOT row survives in Monarch as negated, on the MONDO id, not as a gene edge
mondo = h.monarch("/mappings", object_id="Orphanet:100070", predicate_id="skos:exactMatch")[1]["items"][0]["subject_id"]
edge = h.monarch("/association", subject=mondo, object="HP:0001297", direct="true")[1]["items"]
assert [e["negated"] for e in edge] == [True]
assert h.monarch("/association", subject="HGNC:4601", object="HP:0001297", direct="true")[1]["total"] == 0

# 7. prefixes: ORPHA: is not Orphanet:, OMIM is not a Monarch entity
assert h.monarch("/mappings", object_id="ORPHA:100070")[1]["total"] == 0
assert h.monarch("/entity/OMIM:619340")[0] == 404

print("HPO", onto["version"], "| hpoa rows", len(hpoa), "| NOT", len(hpoa) - len(pos))
print("seizure subtree", len(sub), "terms | diseases exact", len(exact), "| + descendants", len(deep))
print("genes_to_phenotype", len(shipped), "| only via NOT", len(shipped - positive))
print("Monarch", v["monarch_api_version"], "KG", v["monarch_kg_version"],
      "| seizure direct", t_direct, "| with descendants", t_deep, "| negated", len(neg))
print("ORPHA:100070 ->", mondo, "| NOT Stroke kept as negated:", edge[0]["negated"])
```

**Expect**

Invariants — a failure means the skill is wrong:

- `resolve()` follows `replaced_by` and `alt_id`, and returns `None` for a term with only
  `consider` or with two `replaced_by` values.
- The descendant set strictly contains the exact-term set; a count that does not say which it
  used is not a count.
- `genes_to_phenotype.txt` equals the gene × disease × phenotype join including NOT rows, and
  GRN – Stroke via `ORPHA:100070` is in it only because of a NOT annotation. Both facts are fixed
  for the pinned release.
- Monarch's default page is 20 rows of a larger `total`; 501 answers `422`; `associations()`
  returns exactly `total` distinct rows; `direct=true` returns only the queried term.
- Monarch keeps the NOT as `negated: true` on the MONDO disease and makes no GRN – Stroke gene edge.
- `ORPHA:` ids have no mapping until rewritten to `Orphanet:`; `/entity/OMIM:…` is `404`.

Observed 2026-11-19 — HPO numbers are fixed by the pinned release; Monarch numbers move with each
graph build, so a mismatch there is drift to investigate:

```
HPO hp/releases/2026-09-01 | hpoa rows 286651 | NOT 733
seizure subtree 347 terms | diseases exact 2544 | + descendants 3129
genes_to_phenotype 333983 | only via NOT 826
Monarch 1.32.0 KG 2026-11-11 | seizure direct 2561 | with descendants 5350 | negated 14
ORPHA:100070 -> MONDO:0015059 | NOT Stroke kept as negated: True
```

## Sources

- HPO releases: https://github.com/obophenotype/human-phenotype-ontology/releases/tag/v2026-09-01
- HPO licence: https://hpo.jax.org/license
- HPO annotation format: https://obophenotype.github.io/human-phenotype-ontology/annotations/phenotype_hpoa/
- Monarch API docs: https://api.monarchinitiative.org/v3/docs
- Monarch KG archive: https://data.monarchinitiative.org/monarch-kg/
- Monarch terms: https://monarchinitiative.org/kg/terms and per-source documentation at https://monarch-app.monarchinitiative.org/Sources/
- Gargano et al., The Human Phenotype Ontology in 2024, Nucleic Acids Res 2024 — doi:10.1093/nar/gkad1005
- Putman et al., The Monarch Initiative in 2024, Nucleic Acids Res 2024 — doi:10.1093/nar/gkad1082
