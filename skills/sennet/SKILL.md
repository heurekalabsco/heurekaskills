---
name: sennet
description: Query the SenNet cellular senescence atlas — senescent-cell datasets across 17 organs in human and mouse, the donors behind them with ages spanning the whole lifespan, and the tissue samples and files derived from each. Covers the Elasticsearch grammar the portal exposes, the source-sample-dataset hierarchy, which tier a dataset sits in, and how to download public files with no account.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [sennet, senescence, consortium-data, public-data, single-cell]
covers: [senescence, senescent cell, senotype, aging, sasp, lifespan, lung, liver, brain, pancreas, placenta, heart, kidney, ovary, adipose tissue, skeletal muscle, lymph node, large intestine, skin, bone marrow, thymus, human, mouse, rna-seq, atac-seq, spatial transcriptomics, xenium, visium, geomx, phenocycler]
papers: [PMID:36936385, PMID:41727059, PMID:42527677, PMID:37400722]
access: [open, controlled]
platform: hive-elasticsearch
datasets: [https://assets.api.sennetconsortium.org/692432868170e17942767205be022798/genome_build.json, https://assets.api.sennetconsortium.org/b81af433a6e99298061312c1ecfbef6d/b81af433a6e99298061312c1ecfbef6d-metadata.tsv, https://assets.api.sennetconsortium.org/b81af433a6e99298061312c1ecfbef6d/geomx-rnaseq-with-probes-metadata.tsv, https://assets.api.sennetconsortium.org/b81af433a6e99298061312c1ecfbef6d/extras/contributors.tsv, https://assets.api.sennetconsortium.org/b81af433a6e99298061312c1ecfbef6d/lab_processed/images/GeoMx3-ome-tiff.channels.csv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: SenNet search-api 1.5.1 (main:4e6edc8) / entity-api 1.10.7 (main:7a126a0) / index sn_prod_public_entities / Python 3.12.8 stdlib only / curl 8.7.1
  executed: 15
  unverified: 1
  unverified_reason: >-
    The command-line transfer block needs a Globus login through an
    institutional identity provider, which the validating environment has no
    account for. Re-run it from a host with a SenNet or Globus institutional
    login. Every other route in this skill is anonymous and was executed.
---
# SenNet — the Cellular Senescence Network

SenNet is the NIH Common Fund programme building an atlas of senescent cells across the
human lifespan, with mouse tissue used to inform the mapping. That mandate is the reason
to query it rather than a general repository: the collection is organised around **age**
and around **which cells in a tissue have become senescent**, and a donor age travels with
every one of the 3,611 human datasets.

As of **2026-08-27** the public index holds **12,032 entities** — 5,762 Datasets, 5,406
Samples, 851 Sources and 13 Collections — over **17 organs** and **25 assay types**, plus
**186,040 file records**. All of it is readable with no account, no key and no licence
click-through.

**Licensing.** SenNet's External Data Use Agreement (Steering Committee, 15 June 2022)
states that data is released "under a permissive license, such as CC-BY 4.0 (for open
data)", with "no publication embargo placed on the non-SenNet community once SenNet data
has been publicly released". There is no non-commercial restriction. Two conditions do
attach: users agree not to use the data "to identify or contact individual participants
(or family members)", and publications must acknowledge "the NIH Common Fund, through the
Office of Strategic Coordination/Office of the NIH Director" with the relevant award
numbers. Confirm the current text at <https://sennetconsortium.org/external-data-use/>
before publishing.

Three services, all anonymous for the public tier:

| host | serves |
|---|---|
| `search.api.sennetconsortium.org` | the Elasticsearch query surface — four indices |
| `entity.api.sennetconsortium.org` | one record by id, and provenance walks |
| `assets.api.sennetconsortium.org` | the bytes |

**The assets host is `assets.api.sennetconsortium.org`.** The name without `.api.` does
not resolve at all, so a typo there fails as a DNS error rather than a 404.

## Five ways to call the search API, and only one of them works

```bash
# 1. A GET is refused, and the error page never mentions the method as the problem.
curl -s -o /dev/null -w '%{http_code}\n' \
  https://search.api.sennetconsortium.org/entities/search

# 2. A POST without a JSON content type is refused too.
curl -s -X POST -d '{"query":{"match_all":{}}}' \
  https://search.api.sennetconsortium.org/entities/search

# 3. A wrong index name is the most useful error here -- it enumerates the real ones.
curl -s -X POST -H 'Content-Type: application/json' -d '{"query":{"match_all":{}}}' \
  https://search.api.sennetconsortium.org/api/search

# 4. The call that works. Note what _index reports.
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"size":1,"sort":[{"uuid.keyword":"asc"}],"_source":["sennet_id","entity_type"],
       "query":{"match_all":{}}}' \
  https://search.api.sennetconsortium.org/entities/search \
  | python3 -c 'import json,sys; h=json.load(sys.stdin)["hits"]["hits"][0]; print(h["_index"], h["_source"])'

# 5. ...and that _index is not a name this API accepts in the path.
curl -s -X POST -H 'Content-Type: application/json' -d '{"query":{"match_all":{}}}' \
  https://search.api.sennetconsortium.org/sn_prod_public_entities/search
```

```
405
{"error":"400 Bad Request: A JSON body and appropriate Content-Type header are required"}
{"error":"400 Bad Request: Invalid index name 'api'. Use one of the following: entities,files,logs-file-downloads,logs-api-usage,logs-github-analytics,cell-types,senotypes"}
sn_prod_public_entities {'entity_type': 'Sample', 'sennet_id': 'SNT779.TQNV.747'}
{"error":"400 Bad Request: Invalid index name 'sn_prod_public_entities'. Use one of the following: entities,files,logs-file-downloads,logs-api-usage,logs-github-analytics,cell-types,senotypes"}
```

Read that third error carefully, because it is the fastest route to a working call and it
also misleads. The path segment is an **alias**, not the physical index. Every hit reports
`_index: sn_prod_public_entities`, and feeding that back into the path is rejected. The
three `logs-*` aliases in the list are enumerated but not readable anonymously — they
answer 500. What is actually queryable is four: `entities`, `files`, `cell-types`,
`senotypes`.

## What is in each index, and what `hits.total` is not

```python
import json, urllib.error, urllib.request

SEARCH = "https://search.api.sennetconsortium.org"


class SenNetError(RuntimeError):
    pass


def search(index, body, timeout=120):
    """POST a query DSL body to one of the four public indices.

    Elasticsearch failures arrive as an HTTP 4xx whose body carries the reason.
    urllib raises and discards that body unless you read it, which turns a
    precise message into a bare "HTTP Error 400: Bad Request".
    """
    req = urllib.request.Request(
        f"{SEARCH}/{index}/search",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as fh:
            return json.loads(fh.read())
    except urllib.error.HTTPError as exc:
        raise SenNetError(f"HTTP {exc.code} {_reason(exc.read())}") from None


def _reason(raw):
    try:
        err = json.loads(raw)["error"]
    except Exception:
        return raw.decode(errors="replace")[:200]
    if isinstance(err, str):
        return err
    causes = err.get("root_cause") or [err]
    return causes[0].get("reason", json.dumps(err))[:300]


# Without track_total_hits the count is a ceiling wearing a number's clothes.
capped = search("entities", {"size": 0, "query": {"match_all": {}}})
print("default          ", capped["hits"]["total"])

full = search("entities", {
    "size": 0,
    "track_total_hits": True,
    "query": {"match_all": {}},
    "aggs": {"kind": {"terms": {"field": "entity_type.keyword", "size": 10}}},
})
print("track_total_hits ", full["hits"]["total"])
for b in full["aggregations"]["kind"]["buckets"]:
    print(f"  {b['key']:12} {b['doc_count']:6}")

for index in ("files", "cell-types", "senotypes"):
    n = search(index, {"size": 0, "track_total_hits": True,
                       "query": {"match_all": {}}})["hits"]["total"]["value"]
    print(f"{index:12} {n:7}")
```

```
default           {'relation': 'gte', 'value': 10000}
track_total_hits  {'relation': 'eq', 'value': 12032}
  Dataset        5762
  Sample         5406
  Source          851
  Collection       13
files         186040
cell-types      5419
senotypes          0
```

**`hits.total.value` stops at 10000 and says so in `relation`.** A `match_all` reports
`{"relation": "gte", "value": 10000}`, which is not a count of anything — it is
Elasticsearch declining to keep counting. Reporting it as "SenNet has 10,000 datasets"
produces a wrong number that looks entirely plausible. `track_total_hits: true` gives the
real one, and `relation` flips to `eq`. **Read `relation`, not `value`.**

Two indices exist for SenNet's own vocabulary, and one of them is empty — see *SenNet's
own units* below. The wrapping error helper is worth keeping: every malformed query below
comes back as a 400 whose body names the field or the limit that broke, and `urllib`
throws that body away by default.

## Source → Sample → Dataset, and what a SenNet id does not tell you

Every record is a **Source** (the donor or animal), a **Sample** (tissue taken from it, or
a piece of another sample), a **Dataset** (what an assay produced), or a **Collection** (a
study-level grouping). Samples nest — an `Organ` yields a `Block` yields a `Section` yields
a `Suspension` — so a Dataset's ancestry is usually four or five records deep.

```python
import json, urllib.error, urllib.request

ENTITY = "https://entity.api.sennetconsortium.org"


def entity(sennet_id, timeout=90):
    """Resolve a SenNet id or uuid. Works anonymously for anything public."""
    with urllib.request.urlopen(f"{ENTITY}/entities/{sennet_id}", timeout=timeout) as fh:
        return json.loads(fh.read())


# Four ids of identical shape, one per entity type. Only the record says which is which.
for sid in ("SNT764.FFHF.474", "SNT357.WRWT.979", "SNT389.HGGS.432", "SNT679.VSPM.947"):
    e = entity(sid)
    kind = (e.get("source_type") or e.get("sample_category")
            or e.get("dataset_type") or "-")
    print(f"{sid}  {e['entity_type']:11} {kind:16} {e['uuid']}")

d = entity("SNT389.HGGS.432")
print("\ntitle:", d["title"])
print("group:", d["group_name"], "| status:", d["status"],
      "| access:", d["data_access_level"])
print("origin_samples:", [(s["sennet_id"], s["organ"], s["organ_hierarchy"])
                          for s in d["origin_samples"]])
print("sources       :", [(s["sennet_id"], s["source_type"]) for s in d["sources"]])

# Provenance walks. /ancestors and /descendants are open; /children is not.
for path in ("ancestors", "descendants", "children"):
    try:
        with urllib.request.urlopen(f"{ENTITY}/{path}/SNT389.HGGS.432", timeout=90) as fh:
            rows = json.loads(fh.read())
        print(f"/{path:12} {len(rows):3} entities "
              f"{sorted({r['entity_type'] for r in rows})}")
    except urllib.error.HTTPError as exc:
        print(f"/{path:12} HTTP {exc.code}")
```

```
SNT764.FFHF.474  Source      Human            010320347d3999ecddc29cfd9b2273c4
SNT357.WRWT.979  Sample      Organ            0d88b6fb5a8778d83128c4a99b5921f9
SNT389.HGGS.432  Dataset     RNAseq [Salmon]  692432868170e17942767205be022798
SNT679.VSPM.947  Collection  -                e3c17664e384a7fbf1c785226f805053

title: RNAseq [Salmon] data from the lung (left) of a 1.62 year-old white female
group: TMC - University of Pittsburgh | status: Published | access: public
origin_samples: [('SNT247.VWMN.468', 'UBERON:0002168', 'Lung')]
sources       : [('SNT764.FFHF.474', 'Human')]
/ancestors      8 entities ['Dataset', 'Sample', 'Source']
/descendants    0 entities []
/children     HTTP 401
```

**A SenNet id is `SNT` + three digits + four letters + three digits, and that shape is the
same for all four entity types.** Nothing in `SNT764.FFHF.474` says it is a donor rather
than a dataset. Resolve the id before branching on it; do not pattern-match the string.
Both the id and the 32-character `uuid` work in every path.

Two more things this shows. `title` is composed by SenNet from the assay, the organ and the
donor — it is a rendered summary, not a submitter's title, so it is good for a printed
table and bad as a search key. And `/children` answers **401** anonymously while
`/ancestors` and `/descendants` answer 200; use `/descendants` and filter, or read
`immediate_descendants` off the record, which is present in the indexed document.

## Paging past 10,000

```python
# search() and SenNetError are the helper defined in the block above.

# from + size is checked against the window, not size alone.
try:
    search("entities", {"from": 10000, "size": 1, "query": {"match_all": {}}})
except SenNetError as exc:
    print(str(exc)[:140])


def walk(index, body, page=500, sort_field="uuid.keyword"):
    """Every hit, however many there are. search_after has no 10000 ceiling."""
    body = dict(body, size=page, sort=[{sort_field: "asc"}], track_total_hits=True)
    after, seen, total = None, 0, None
    while True:
        result = search(index, dict(body, search_after=after) if after else body)
        total = result["hits"]["total"]["value"] if total is None else total
        hits = result["hits"]["hits"]
        if not hits:
            break
        for h in hits:
            yield h["_source"]
        seen += len(hits)
        after = hits[-1]["sort"]
    assert seen == total, f"walked {seen} of {total} -- sort key is not unique"


rows = list(walk("entities", {
    "_source": ["sennet_id", "dataset_type"],
    "query": {"term": {"entity_type.keyword": "Dataset"}},
}))
print(f"walked {len(rows)} Dataset records, past a window that stops at 10000")
```

```
HTTP 400 Result window is too large, from + size must be less than or equal to: [10000] but was [10001]. See the scroll api for a more effic
walked 5762 Dataset records, past a window that stops at 10000
```

Three numbers to hold. **The default `size` is 10** — omit it and you get ten records with
nothing marking the page as partial. **`from + size` may not exceed 10000**, so offset
paging cannot reach the end of the `files` index at all. **`search_after` over a sort on a
unique field has no ceiling**, and `uuid.keyword` (or `file_uuid.keyword` in the `files`
index) is unique. The assertion at the end of `walk` is what catches a non-unique sort key,
which otherwise loops or skips silently.

For counting rather than listing, a `terms` or `composite` aggregation is far cheaper than
walking, and aggregations are not subject to the result window.

## Querying fields: free text does not work, and `term` is not `match`

```python
# search() and SenNetError are the helper defined in the block above.


def total(index, query):
    return search(index, {"size": 0, "track_total_hits": True,
                          "query": query})["hits"]["total"]["value"]


# Free text over the whole document does not work here, and does not say so.
print("query_string 'lung'                 ",
      total("entities", {"query_string": {"query": "lung"}}))
print("simple_query_string 'lung'          ",
      total("entities", {"simple_query_string": {"query": "lung"}}))
try:
    total("entities", {"query_string": {"query": "lung", "default_field": "*"}})
except SenNetError as exc:
    print("query_string over '*'                ", str(exc)[:104])

# Name the field and it works -- but `term` is not analysed and `match` is.
print("match origin_samples.organ_hierarchy ",
      total("entities", {"match": {"origin_samples.organ_hierarchy": "Lung"}}))
print("term  ...organ_hierarchy.keyword     ",
      total("entities", {"term": {"origin_samples.organ_hierarchy.keyword": "Lung"}}))
print("term  ...organ_hierarchy  'Lung'     ",
      total("entities", {"term": {"origin_samples.organ_hierarchy": "Lung"}}))
print("term  ...organ_hierarchy  'lung'     ",
      total("entities", {"term": {"origin_samples.organ_hierarchy": "lung"}}))
```

```
query_string 'lung'                  0
simple_query_string 'lung'           0
query_string over '*'                 HTTP 400 failed to create query: field expansion for [*] matches too many fields, limit: 1024, got: 2422
match origin_samples.organ_hierarchy  2193
term  ...organ_hierarchy.keyword      2193
term  ...organ_hierarchy  'Lung'      0
term  ...organ_hierarchy  'lung'      2193
```

**This is the most expensive mistake available here, because it is silent.** A bare
`query_string` or `simple_query_string` — the obvious way to ask "does SenNet have lung
data?" — returns **zero hits and HTTP 200**, no error, no warning. The index carries
**2,422 mapped fields** and no catch-all field to search across, and asking for `"*"`
explicitly fails against a 1,024-field expansion limit rather than working slowly. An agent
that writes a free-text query and reports the result concludes SenNet has no lung data,
with 2,193 lung records sitting in the index.

So every query names its fields. The rules that follow from the mapping:

- **`term` is not analysed; `match` is.** `term` on the text field with `"Lung"` returns 0
  because the indexed token is lowercase. Use `.keyword` for exact filtering, `match` for
  human-typed strings, and never `term` on a bare text field.
- **`.keyword` is what aggregations and `sort` need.** `terms` on the analysed field
  buckets by token, so "Adipose Tissue" becomes two buckets.
- **Put filters in `bool.filter`, not `bool.must`.** Nothing here needs relevance scoring,
  and `filter` is cached.

## Organs are lateralised, and array fields flatten

```python
# search() and SenNetError are the helper defined in the block above.


def total(index, query):
    return search(index, {"size": 0, "track_total_hits": True,
                          "query": query})["hits"]["total"]["value"]


def facet(index, field, query=None, size=40):
    body = {"size": 0, "query": query or {"match_all": {}},
            "aggs": {"f": {"terms": {"field": field, "size": size}}}}
    return [(b["key"], b["doc_count"])
            for b in search(index, body)["aggregations"]["f"]["buckets"]]


# organ_hierarchy is the unlateralised label. `organ` is a UBERON code, and the
# code for the whole organ is never the one stored.
print("organ_hierarchy == Lung          ",
      total("entities", {"term": {"origin_samples.organ_hierarchy.keyword": "Lung"}}))
for code, name in [("UBERON:0002048", "lung (whole)"),
                   ("UBERON:0002167", "right lung"),
                   ("UBERON:0002168", "left lung")]:
    print(f"organ == {code} {name:14}",
          total("entities", {"term": {"origin_samples.organ.keyword": code}}))

# 1558 + 643 != 2193, because origin_samples is an ARRAY and it is mapped as a
# plain object, not `nested`. Filters match across elements, not within one.
both = {"bool": {"filter": [
    {"term": {"origin_samples.organ.keyword": "UBERON:0002167"}},
    {"term": {"origin_samples.organ.keyword": "UBERON:0002168"}}]}}
print("both codes on one record         ", total("entities", both))
try:
    search("entities", {"size": 0, "query": {"nested": {
        "path": "origin_samples",
        "query": {"term": {"origin_samples.organ.keyword": "UBERON:0002167"}}}}})
except SenNetError as exc:
    print("nested query                      ", str(exc)[:96])

print("\norgan_hierarchy over the whole index:")
for organ, n in facet("entities", "origin_samples.organ_hierarchy.keyword"):
    print(f"  {organ:18} {n:5}")
```

```
organ_hierarchy == Lung           2193
organ == UBERON:0002048 lung (whole)   0
organ == UBERON:0002167 right lung     1558
organ == UBERON:0002168 left lung      643
both codes on one record          8
nested query                       HTTP 400 failed to create query: [nested] nested object under path [origin_samples] is not of ne

organ_hierarchy over the whole index:
  Lung                2193
  Liver               1821
  Brain               1747
  Pancreas            1177
  Placenta            1024
  Heart                663
  Kidney               564
  Adipose Tissue       414
  Muscle               397
  Lymph Node           347
  Ovary                286
  Large Intestine      243
  Skin                 203
  Bone Marrow           36
  Thymus                24
  Trachea               20
  Spleen                 9
```

Two independent traps in one query.

**SenNet records laterality in the UBERON code and drops it from the label.** Filtering
`origin_samples.organ == UBERON:0002048` — the code for *lung* — returns nothing, because
what is stored is `UBERON:0002167` (right lung) or `UBERON:0002168` (left lung). The same
holds for kidney (`UBERON:0004538`/`0004539`) and ovary (`UBERON:0002118`/`0002119`), and
in the `files` index the split is between `organs.hierarchy` ("Lung") and `organs.label`
("Lung (Right)"). **Filter on `organ_hierarchy` for an organ, on `organ` for a side.**

**`origin_samples`, `sources`, `ancestors`, `descendants` and `files` are arrays mapped as
plain objects, not `nested`.** A `nested` query is rejected outright. The consequence is
that a multi-condition filter matches across *different elements* of the array, so a record
can satisfy two conditions no single element satisfies. Eight datasets pool both lungs,
which is exactly why 1558 + 643 overshoots 2193 — and all eight are mouse RNAseq, where
pooling tissue from several animals is routine. For a dataset with one origin sample and
one source, which is the overwhelming majority, this never bites. Where it does, the only
fix is to re-check the condition client-side against the returned `_source`.

## Half the donors are mice

```python
# search() is the helper defined in the block above.


def total(query):
    return search("entities", {"size": 0, "track_total_hits": True,
                               "query": query})["hits"]["total"]["value"]


src = {"size": 0, "query": {"term": {"entity_type.keyword": "Source"}},
       "aggs": {"f": {"terms": {"field": "source_type.keyword", "size": 10}}}}
print("Source records by species:",
      [(b["key"], b["doc_count"])
       for b in search("entities", src)["aggregations"]["f"]["buckets"]])

lung = [{"term": {"entity_type.keyword": "Dataset"}},
        {"term": {"data_access_level.keyword": "public"}},
        {"term": {"origin_samples.organ_hierarchy.keyword": "Lung"}}]
print("\npublic lung datasets, no species filter ", total({"bool": {"filter": lung}}))
for species in ("Human", "Mouse"):
    q = {"bool": {"filter": lung + [{"term": {"sources.source_type.keyword": species}}]}}
    print(f"public lung datasets, {species:6}            ", total(q))
```

```
Source records by species: [('Mouse', 429), ('Human', 422)]

public lung datasets, no species filter  866
public lung datasets, Human              724
public lung datasets, Mouse              142
```

SenNet's design uses mouse tissue and induced-senescence models to inform the human map, so
**mouse is not a small side collection — it is slightly more than half the Source records.**
Nothing in the organ vocabulary distinguishes a mouse lung from a human one — mouse tissue
is filed under the same human UBERON codes, `UBERON:0002167` and `UBERON:0002168` for lung.
An unfiltered organ query mixes species and will not tell you.
**`sources.source_type` is a required filter, not an optional one.**

The same applies in reverse when the question is a mouse question: 142 public mouse lung
datasets is a real cohort, and several Collections are explicitly young-versus-old mouse
designs.

## Age is the axis, and the age is not on the Source record

```python
import collections

# search() is the helper defined in the block above.


# The friendly, unit-normalised view lives on Dataset records only, under the
# sources[] it was denormalised from -- never on the Source record itself.
by_dataset = search("entities", {
    "size": 0,
    "query": {"term": {"entity_type.keyword": "Dataset"}},
    "aggs": {"age": {"stats": {"field": "sources.mapped_metadata.age.value"}}},
})["aggregations"]["age"]
print("dataset-level:", {k: (round(v, 2) if isinstance(v, float) else v)
                         for k, v in by_dataset.items()})

on_source = search("entities", {
    "size": 0,
    "query": {"term": {"entity_type.keyword": "Source"}},
    "aggs": {"age": {"stats": {"field": "mapped_metadata.age.value"}}},
})["aggregations"]["age"]
print("source-level :", on_source)

# The Source record carries the same fact as a UMLS-coded row instead.
ages, after = [], None
while True:
    body = {"size": 500, "track_total_hits": True,
            "_source": ["sennet_id", "source_type", "metadata"],
            "query": {"term": {"entity_type.keyword": "Source"}},
            "sort": [{"uuid.keyword": "asc"}]}
    if after:
        body["search_after"] = after
    hits = search("entities", body)["hits"]["hits"]
    if not hits:
        break
    for h in hits:
        s = h["_source"]
        if s.get("source_type") != "Human":
            continue
        md = s.get("metadata") or {}
        # Deceased donors are filed under organ_donor_data, living ones under
        # living_donor_data. Read one and you lose the other cohort entirely.
        for group in ("organ_donor_data", "living_donor_data"):
            for row in md.get(group, []):
                if row.get("grouping_concept_preferred_term") == "Age":
                    ages.append(float(row["data_value"]))
    after = hits[-1]["sort"]

decades = collections.Counter(int(a // 10) * 10 for a in ages)
print(f"\n{len(ages)} human donors carry an age: "
      f"{min(ages):.0f}-{max(ages):.0f}, mean {sum(ages) / len(ages):.1f}")
for d in sorted(decades):
    print(f"  {d:3}s {'#' * decades[d]} {decades[d]}")
```

```
dataset-level: {'avg': 47.06, 'count': 3611, 'max': 90.0, 'min': 0.0, 'sum': 169945.83}
source-level : {'avg': None, 'count': 0, 'max': None, 'min': None, 'sum': 0.0}

422 human donors carry an age: 0-90, mean 44.9
    0s ############################################# 45
   10s ####### 7
   20s ########################################## 42
   30s ##################################################################### 69
   40s ################################################################### 67
   50s ###################################################################### 70
   60s #################################################################### 68
   70s ########################################## 42
   80s ########## 10
   90s ## 2
```

**The Source record does not carry `mapped_metadata`. Aggregating age over Sources returns
`count: 0` and no error** — the same silent-zero failure as the free-text query, in the one
field a senescence question depends on most. The normalised view exists **only on Dataset
records**, denormalised under `sources[]`; Sample records carry no `sources[]` block at
all, so a query that walks Samples to reach donors returns nothing. What follows from that:

- **`sources.mapped_metadata.age.value` on Datasets is the queryable field**, and a `range`
  filter on it is how you select an aged cohort. All 3,611 datasets with a human source
  carry an age and none of the 2,151 mouse-source datasets do, so a `range` filter on age is
  also an implicit species filter — which is convenient and worth being deliberate about.
  It counts **datasets, not donors**: 3,611 dataset-level ages, mean 47.1, against 422
  donors, mean 44.9. A group that ran ten assays on one donor is weighted ten times. Never
  report the dataset-level mean as a cohort age.
- **For donor-level statistics, read `metadata` off the Source and parse the coded rows.**
  Every one of the 422 human Sources carries an age. The rows are UMLS-coded — SNOMED CT
  `424144002` / UMLS `C0001779` for Age — and they sit under **`organ_donor_data`** for
  deceased donors and **`living_donor_data`** for living ones. Read one key and you drop a
  whole cohort. Match on `grouping_concept_preferred_term` rather than on the key name.
- **Ages are fractional years.** 19 human donors are under one year old, recorded as values
  like `0.03`. `int(age)` collapses all of them to 0, and a "0-year-old" bucket that mixes a
  stillborn placenta with an 11-month infant is not a lifespan bin. The same fields carry
  `Race`, `Ethnicity`, `Sex`, `Cause of Death` and `Mechanism of Injury` in the same shape.

Mouse Sources carry neither `mapped_metadata` nor donor demographics in the public index,
so a mouse age has to come from the Collection description or the submitted metadata TSV.

## SenNet's own units — senotypes, cell types and collections

```python
import json, urllib.request

# search() is the helper defined in the block above.

ENTITY = "https://entity.api.sennetconsortium.org"

# 1. senotypes -- the index exists and is served, and it is empty.
seno = search("senotypes", {"size": 5, "track_total_hits": True,
                            "query": {"match_all": {}}})
print("senotypes:", seno["hits"]["total"], "hits returned", len(seno["hits"]["hits"]))

# 2. cell-types -- CL-coded annotations with per-dataset cell counts.
ct = search("cell-types", {
    "size": 1, "track_total_hits": True, "query": {"match_all": {}},
    "aggs": {"datasets": {"cardinality": {"field": "dataset.uuid.keyword"}},
             "cells": {"sum": {"field": "cell_count"}},
             "organ": {"terms": {"field": "organs.category.keyword", "size": 20}}},
})
agg = ct["aggregations"]
print(f"\ncell-types: {ct['hits']['total']['value']} annotations over "
      f"{agg['datasets']['value']} datasets, {int(agg['cells']['value'])} cells")
print("  organs:", [(b["key"], b["doc_count"]) for b in agg["organ"]["buckets"]])
top = search("cell-types", {
    "size": 0, "query": {"term": {"organs.category.keyword": "Lung"}},
    "aggs": {"label": {"terms": {"field": "cell_label.keyword", "size": 5}}},
})
print("  most-annotated lung cell types:",
      [b["key"] for b in top["aggregations"]["label"]["buckets"]])

# 3. Collections -- the study-level groupings, and where the senescence
#    question is actually stated. The member list is NOT in the index.
colls = search("entities", {"size": 20, "_source": ["sennet_id", "title"],
                            "sort": [{"sennet_id.keyword": "asc"}],
                            "query": {"term": {"entity_type.keyword": "Collection"}}})
print(f"\n{colls['hits']['total']['value']} collections:")
for h in colls["hits"]["hits"]:
    s = h["_source"]
    print(f"  {s['sennet_id']}  {s['title'][:74]}")

print("\n'entities' present in the indexed document:",
      "entities" in colls["hits"]["hits"][0]["_source"])
with urllib.request.urlopen(f"{ENTITY}/entities/SNT679.VSPM.947", timeout=90) as fh:
    coll = json.loads(fh.read())
print("SNT679.VSPM.947 ->", coll["title"])
print("  registered_doi:", coll.get("registered_doi"))
print("  member datasets:", len(coll["entities"]),
      [e["sennet_id"] for e in coll["entities"][:3]], "...")
```

```
senotypes: {'relation': 'eq', 'value': 0} hits returned 0

cell-types: 5419 annotations over 109 datasets, 600559 cells
  organs: [('Lung', 3935), ('Ovary', 868), ('Liver', 310), ('Bone Marrow', 306)]
  most-annotated lung cell types: ['intestine goblet cell', 'lymphocyte', 'pulmonary alveolar type 1 cell', 'T cell', 'CD4-positive, CD25-positive, alpha-beta regulatory T cell']

13 collections:
  SNT249.TPCD.565  Aged Mouse Brain Spatial Transcriptomics Collection
  SNT293.NGHG.565  Profiling of pancreases with Akoya PhenoCycler and H&E staining
  SNT354.RMQR.958  Ex vivo senescence induction – snRNA Sequencing
  SNT456.VHRV.853  Datasets from "Uncovering the Signatures of Aging and Senescence in the Hu
  SNT495.DLVB.649  Datasets for RamanOmics
  SNT559.LLTN.426  Induced model of senescence using doxorubicin snRNA of ovary
  SNT573.JKVS.464  Datasets for "Cellular senescence in human liver under normal aging and ca
  SNT579.RPQP.334  10x multiome data of young and old mouse livers
  SNT679.VSPM.947  Data for the Human lymph node cellular senescence atlas
  SNT793.SZRS.468  Multimodal profiling of pancreases with 10x Genomics Xenium In Situ, follo
  SNT797.JGHF.784  Human Cellular Clock of the Aging Lung Parenchyma spatial transcriptomics 
  SNT895.LCQZ.682  JAX Xenium in situ RNA and H&E profiling of normal human lung and skin tis
  SNT987.ZGSS.452  10X Multiome data from male mouse liver samples

'entities' present in the indexed document: False
SNT679.VSPM.947 -> Data for the Human lymph node cellular senescence atlas
  registered_doi: 10.60586/SNT679.VSPM.947
  member datasets: 32 ['SNT625.XDTN.459', 'SNT455.SZCP.225', 'SNT584.CWSK.568'] ...
```

**A senotype is SenNet's own unit of description** — a senescent-cell state defined jointly
by lineage, tissue context, the stimulus that induced senescence and the time since onset,
rather than by a single marker. The `senotypes` index is provisioned, answers queries, and
**holds zero public documents as of 2026-08-27.** That matters twice over: nothing can be
built on it today, and a non-zero count on a later run means SenNet has started publishing
senotypes and this skill needs rewriting around them. The `## Try it` block prints the
count rather than asserting it is zero, for exactly that reason.

**`cell-types` is the annotation layer that does exist**, and it is small relative to the
corpus: 5,419 annotations over **109 of 5,762 datasets**, 600,559 cells, four organs. Each
document is one (dataset, cell type) pair with a Cell Ontology id, a cell count, the organ,
and the donor's age, sex and race denormalised in. Treat `cell_label` as a **machine
annotation, not a curated call** — "intestine goblet cell" is the most frequent label under
Lung, which is an artefact of automated reference mapping rather than a finding. Use it to
find candidate datasets; re-annotate before you cite a proportion.

**Collections are where the senescence question is stated in words.** Thirteen of them, each
a published or in-preparation study with a `title`, an abstract-length `description`,
`contributors` with ORCIDs, and a SenNet-registered DOI under the `10.60586` prefix. They
are the best entry point for a reader who does not yet know which assay they want. Note
that **the member list is not in the search index** — the indexed Collection document has no
`entities` key, so resolve the id against the entity API to get the 32 member datasets.

## A worked query — aged human lung

```python
# search() is the helper defined in the block above.

PORTAL = "https://data.sennetconsortium.org/dataset?uuid="

query = {"bool": {"filter": [
    {"term": {"entity_type.keyword": "Dataset"}},
    {"term": {"data_access_level.keyword": "public"}},
    {"term": {"status.keyword": "Published"}},
    {"term": {"origin_samples.organ_hierarchy.keyword": "Lung"}},
    {"term": {"sources.source_type.keyword": "Human"}},
    {"range": {"sources.mapped_metadata.age.value": {"gte": 60}}},
]}}

summary = search("entities", {
    "size": 0, "track_total_hits": True, "query": query,
    "aggs": {"assay": {"terms": {"field": "dataset_type.keyword", "size": 20}},
             "lab": {"terms": {"field": "group_name.keyword", "size": 5}}},
})
print("public human lung datasets, donor 60+:",
      summary["hits"]["total"]["value"])
print("  by assay:", [(b["key"], b["doc_count"])
                      for b in summary["aggregations"]["assay"]["buckets"]])
print("  by lab  :", [(b["key"], b["doc_count"])
                      for b in summary["aggregations"]["lab"]["buckets"]])

rows = search("entities", {
    "size": 5, "query": query,
    # Ages tie at the top, so a second key is what makes the page reproducible.
    "sort": [{"sources.mapped_metadata.age.value": "desc"}, {"uuid.keyword": "asc"}],
    "_source": ["sennet_id", "uuid", "dataset_type", "group_name",
                "sources.mapped_metadata.age.value_display",
                "sources.mapped_metadata.sex.value_display",
                "origin_samples.organ"],
})["hits"]["hits"]
print("\noldest five donors:")
for h in rows:
    s = h["_source"]
    donor = s["sources"][0]["mapped_metadata"]
    print(f"  {s['sennet_id']}  {s['dataset_type']:22} "
          f"{donor['age']['value_display']:9} {donor['sex']['value_display']:7} "
          f"{s['origin_samples'][0]['organ']}")
    print(f"    {PORTAL}{s['uuid']}")
```

```
public human lung datasets, donor 60+: 242
  by assay: [('RNAseq [Salmon]', 76), ('LC-MS', 46), ('Xenium', 44), ('Histology', 37), ('Histology [Image Pyramid]', 33), ('RNAseq (with probes)', 5), ('Seq-Scope', 1)]
  by lab  : [('TMC - University of Pittsburgh', 143), ('TMC - Duke University', 40), ('TDA - Pacific Northwest National Laboratory', 36), ('TMC - UConn Health', 12), ('TMC - Buck Institute', 10)]

oldest five donors:
  SNT758.JTNK.883  RNAseq [Salmon]        90 years  Male    UBERON:0002167
    https://data.sennetconsortium.org/dataset?uuid=407adfc02f648925e001c4c706a8399c
  SNT685.JJBK.939  LC-MS                  90 years  Male    UBERON:0002167
    https://data.sennetconsortium.org/dataset?uuid=8157904b598bbdd2878227785d8322bc
  SNT688.MCVS.525  RNAseq [Salmon]        90 years  Male    UBERON:0002167
    https://data.sennetconsortium.org/dataset?uuid=d2f1bf445cef0c64c1825c0e737f9450
  SNT859.XSWT.534  LC-MS                  90 years  Male    UBERON:0002167
    https://data.sennetconsortium.org/dataset?uuid=df8f73e81beebe37c4810c8432189277
  SNT536.LMGC.884  RNAseq [Salmon]        90 years  Male    UBERON:0002167
    https://data.sennetconsortium.org/dataset?uuid=dfa901d22321d06a30c38fc13aee268e
```

Note `_source` takes dotted paths and preserves the nesting, so
`sources.mapped_metadata.age.value_display` returns `{"sources": [{"mapped_metadata":
{"age": {"value_display": "90 years"}}}]}` rather than a flat key. That is what keeps a
query over 12,032 records with 2,422 fields down to a few kilobytes.

The `_source` field to hand a person is `uuid`, not `sennet_id` — the portal's dataset page
is keyed on the uuid.

## Which tier a dataset is in

```python
import urllib.error, urllib.request

# search() is the helper defined in the block above.

ASSETS = "https://assets.api.sennetconsortium.org"


def facet(index, field, query=None):
    body = {"size": 0, "track_total_hits": True, "query": query or {"match_all": {}},
            "aggs": {"f": {"terms": {"field": field, "size": 10}}}}
    r = search(index, body)
    return r["hits"]["total"]["value"], [(b["key"], b["doc_count"])
                                         for b in r["aggregations"]["f"]["buckets"]]


print("entities", facet("entities", "data_access_level.keyword"))
print("files   ", facet("files", "data_access_level.keyword"))
protected = {"term": {"data_access_level.keyword": "protected"}}
print("protected entities, by type          ",
      facet("entities", "entity_type.keyword", protected)[1])
print("protected datasets, human sequence?  ",
      facet("entities", "contains_human_genetic_sequences", protected)[1])

# Metadata for a protected dataset is fully readable without a credential.
prot = search("entities", {
    "size": 1, "_source": ["sennet_id", "dataset_type", "title", "group_name"],
    "query": {"term": {"sennet_id.keyword": "SNT622.MLVF.396"}},
})["hits"]["hits"][0]["_source"]
print("\nSNT622.MLVF.396:", prot["dataset_type"], "|", prot["title"])

# The bytes are not readable, and the status code will not tell you why.
probes = [
    ("protected metadata.json", "c5489dc234a2f1567269ae464ea74222/metadata.json"),
    ("protected metadata.json", "8a029b42e79e96d0f43526080b0ce0ad/metadata.json"),
    ("public   genome_build.json", "692432868170e17942767205be022798/genome_build.json"),
    ("public   invented filename", "692432868170e17942767205be022798/no-such-file.json"),
]
for label, path in probes:
    req = urllib.request.Request(f"{ASSETS}/{path}", method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            code = r.status
    except urllib.error.HTTPError as exc:
        code = exc.code
    print(f"  {code}  {label:26} {path.split('/')[0][:8]}…")
```

```
entities (12032, [('public', 11172), ('protected', 847)])
files    (186040, [('public', 176065), ('protected', 9975)])
protected entities, by type           [('Dataset', 847)]
protected datasets, human sequence?   [(1, 847)]

SNT622.MLVF.396: RNAseq | RNAseq data from the bone marrow of a 44 year-old white female
  401  protected metadata.json    c5489dc2…
  404  protected metadata.json    8a029b42…
  200  public   genome_build.json 69243286…
  404  public   invented filename 69243286…
```

**The public index is a catalogue of both tiers.** 11,172 of 12,032 entities are `public`
and 847 are `protected`; the 13 Collections carry no access level at all. Every protected
entity is a Dataset, and every one of the 847 has
`contains_human_genetic_sequences: true` — which is precisely SenNet's stated boundary:
raw human DNA and RNA sequence is controlled, and nothing else is.

The catalogue side of that is genuinely useful. A protected dataset's title, assay, organ,
donor demographics, protocol DOI, contributors and full file listing are all readable
anonymously. What you cannot have is the bytes.

**And the refusal is not legible from the HTTP status.** Two protected `metadata.json`
files, indistinguishable in the index apart from the dataset they belong to, answer **401**
and **404**. A file that does not exist answers 404 as well. Probing twenty protected
`metadata.json` files on 2026-08-27 returned 401 seventeen times and 404 three times, so
neither code identifies the tier. A 404 from the assets host means *gated, or missing, or
mistyped*, with nothing in the response to separate them. **Read `data_access_level` from
the `files` index before you request bytes**, and treat any 4xx from the assets host as
inconclusive rather than as an error to report or retry.

## Get the files

Two file listings exist for a dataset and neither is a superset of the other. Start here:

```python
import json, urllib.request

# search() is the helper defined in the block above.

ENTITY = "https://entity.api.sennetconsortium.org"
with urllib.request.urlopen(f"{ENTITY}/entities/SNT389.HGGS.432", timeout=90) as fh:
    record = json.loads(fh.read())
on_record = {f["rel_path"] for f in record.get("files", [])}

indexed = set()
after = None
while True:
    body = {"size": 500, "_source": ["rel_path"], "sort": [{"file_uuid.keyword": "asc"}],
            "query": {"term": {"dataset_uuid.keyword": record["uuid"]}}}
    if after:
        body["search_after"] = after
    hits = search("files", body)["hits"]["hits"]
    if not hits:
        break
    indexed |= {h["_source"]["rel_path"] for h in hits}
    after = hits[-1]["sort"]

print(f"entity record files[]  {len(on_record):5}")
print(f"files index            {len(indexed):5}")
print(f"in both                {len(on_record & indexed):5}")
print(f"index only             {len(indexed - on_record):5}",
      sorted({p.split('/')[0] for p in indexed - on_record}))
print(f"record only            {len(on_record - indexed):5}",
      sorted({p.split('/')[0] for p in on_record - indexed}))

# And across a spread of assay types, the record's list is usually empty.
print()
for sid in ("SNT432.QVBD.935", "SNT769.VJVP.479", "SNT276.XJKR.739",
            "SNT723.VWCS.599", "SNT657.LDWJ.346", "SNT389.HGGS.432"):
    with urllib.request.urlopen(f"{ENTITY}/entities/{sid}", timeout=90) as fh:
        e = json.loads(fh.read())
    n = search("files", {"size": 0, "track_total_hits": True,
                         "query": {"term": {"dataset_uuid.keyword": e["uuid"]}}}
               )["hits"]["total"]["value"]
    print(f"  {sid}  {e['dataset_type']:22} record {len(e.get('files', [])):5}"
          f"   index {n:5}")
```

```
entity record files[]   2072
files index               46
in both                   22
index only                24 ['fastqc_output', 'metadata.json', 'salmon_out', 'session.log']
record only             2050 ['hubmap_ui']

  SNT432.QVBD.935  RNAseq                 record     0   index     3
  SNT769.VJVP.479  Histology              record     0   index     8
  SNT276.XJKR.739  GeoMx (NGS)            record     0   index    15
  SNT723.VWCS.599  Xenium                 record     0   index   134
  SNT657.LDWJ.346  CosMx Transcriptomics  record     0   index   253
  SNT389.HGGS.432  RNAseq [Salmon]        record  2072   index    46
```

**Enumerate from the `files` index, never from the entity record's `files[]`.** For
lab-submitted datasets that array is *empty* — five different assay types above, zero
entries each, while the index holds 3 to 253 files. For pipeline-processed datasets it is
populated but wrong for this purpose: 2,072 entries of which 2,050 are chunks of the
portal's visualisation store, and it omits `salmon_out/` — the quantification output that
is the actual point of the dataset — entirely. The two listings overlap on 22 of 2,096
distinct paths.

Second, 861 public datasets have no files at all, and they are not empty deposits:

```python
# search() is the helper defined in the block above.


def uuids(index, query):
    """Every distinct id matching a query, walked with a composite aggregation."""
    field = "uuid.keyword" if index == "entities" else "dataset_uuid.keyword"
    out, after = set(), None
    while True:
        agg = {"c": {"composite": {"size": 1000,
                                   "sources": [{"u": {"terms": {"field": field}}}]}}}
        if after:
            agg["c"]["composite"]["after"] = after
        r = search(index, {"size": 0, "query": query, "aggs": agg})
        buckets = r["aggregations"]["c"]["buckets"]
        out |= {b["key"]["u"] for b in buckets}
        if len(buckets) < 1000:
            return out
        after = r["aggregations"]["c"]["after_key"]


def dataset(**terms):
    return {"bool": {"filter": [{"term": {"entity_type.keyword": "Dataset"}}]
                     + [{"term": {f"{k}.keyword": v}} for k, v in terms.items()]}}


public = uuids("entities", dataset(data_access_level="public"))
with_files = uuids("files", {"match_all": {}})
for action in ("Create Dataset Activity", "Central Process", "Multi-Assay Split"):
    group = uuids("entities", dataset(data_access_level="public",
                                      creation_action=action))
    print(f"{action:26} public {len(group):5}   with files "
          f"{len(group & with_files):5}   without {len(group - with_files):5}")

# And the per-file access level is not the dataset's.
prot_files = uuids("files", {"term": {"data_access_level.keyword": "protected"}})
pub_files = uuids("files", {"term": {"data_access_level.keyword": "public"}})
protected = uuids("entities", dataset(data_access_level="protected"))
print(f"\npublic datasets holding at least one protected file  {len(public & prot_files):5}")
print(f"  ...of which every file is protected                {len((public & prot_files) - pub_files):5}")
print(f"protected datasets holding at least one public file   {len(protected & pub_files):5}")
```

```
Create Dataset Activity    public  2594   with files  2594   without     0
Central Process            public  1460   with files  1460   without     0
Multi-Assay Split          public   861   with files     0   without   861

public datasets holding at least one protected file    191
  ...of which every file is protected                  159
protected datasets holding at least one public file       0
```

Two clean invariants, both worth coding against:

- **Every public `Multi-Assay Split` dataset has zero files, and every other public dataset
  has at least one.** A multi-assay experiment — 10X Multiome, or a Visium run paired with
  histology — is registered as one parent dataset plus one child per assay. The children
  carry the assay type you searched for and none of the data. 861 of 4,915 public datasets,
  one in six, are children. **Follow `direct_ancestors` to the parent Dataset.**
- **A dataset's `data_access_level` is not its files'.** 191 public datasets hold at least
  one protected file and 159 hold *only* protected files, so the entity looks open and every
  byte in it is gated. The reverse never happens. **Filter the `files` index on
  `data_access_level`, not the entity.** A public multi-assay child can also have a
  protected parent, so re-check after following the ancestor link.

The download itself is plain HTTPS, no account:

```python
import csv, hashlib, json, os, urllib.error, urllib.parse, urllib.request

# search() is the helper defined in the block above.

ENTITY = "https://entity.api.sennetconsortium.org"
ASSETS = "https://assets.api.sennetconsortium.org"


def resolve(sennet_id):
    """A SenNet id -> the record that actually owns the files."""
    with urllib.request.urlopen(f"{ENTITY}/entities/{sennet_id}", timeout=90) as fh:
        e = json.loads(fh.read())
    if e.get("creation_action") == "Multi-Assay Split":
        parent = next(a for a in e["direct_ancestors"] if a["entity_type"] == "Dataset")
        print(f"{sennet_id} is one assay of a multi-assay experiment; "
              f"its files are on {parent['sennet_id']}")
        return resolve(parent["sennet_id"])
    if e["data_access_level"] != "public":
        raise SystemExit(f"{e['sennet_id']} is {e['data_access_level']} -- see "
                         f"'Requesting access'. A public component can have a "
                         f"protected parent.")
    return e


def manifest(uuid, public_only=True):
    """Every indexed file for a dataset, paged. Not the record's own files[]."""
    filters = [{"term": {"dataset_uuid.keyword": uuid}}]
    if public_only:
        filters.append({"term": {"data_access_level.keyword": "public"}})
    out, after = [], None
    while True:
        body = {"size": 500, "sort": [{"file_uuid.keyword": "asc"}],
                "_source": ["rel_path", "size", "sha256_checksum", "data_access_level"],
                "query": {"bool": {"filter": filters}}}
        if after:
            body["search_after"] = after
        hits = search("files", body)["hits"]["hits"]
        if not hits:
            return out
        out += [h["_source"] for h in hits]
        after = hits[-1]["sort"]


def download(uuid, entry, into="."):
    """One file, checked against the checksum the index published for it."""
    url = f"{ASSETS}/{uuid}/{urllib.parse.quote(entry['rel_path'])}"
    dest = os.path.join(into, entry["rel_path"])
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=600) as fh:
            blob = fh.read()
    except urllib.error.HTTPError as exc:
        # 401 and 404 both happen for files the index lists and the store will
        # not serve. Neither means your id or your path is wrong.
        return f"HTTP {exc.code}"
    if entry.get("sha256_checksum") \
            and hashlib.sha256(blob).hexdigest() != entry["sha256_checksum"]:
        raise SystemExit(f"checksum mismatch on {entry['rel_path']}")
    with open(dest, "wb") as fh:
        fh.write(blob)
    return f"ok {len(blob)} B"


record = resolve("SNT998.RFFC.236")
files = manifest(record["uuid"])
biggest = max(files, key=lambda f: f["size"])
print(f"{record['sennet_id']}  {record['dataset_type']}  {len(files)} public files, "
      f"{sum(f['size'] for f in files) / 1e9:.1f} GB total")
print(f"largest: {biggest['rel_path']}  {biggest['size'] / 1e9:.1f} GB")

print("\nfetching everything under 6 kB:")
for f in sorted((f for f in files if f["size"] < 6000), key=lambda f: f["size"]):
    print(f"  {download(record['uuid'], f, into='sennet'):12} {f['size']:6} "
          f"{f['rel_path']}")

row = next(csv.DictReader(open("sennet/geomx-rnaseq-with-probes-metadata.tsv"),
                          delimiter="\t"))
print()
for key in ("dataset_type", "analyte_class", "assay_input_entity",
            "acquisition_instrument_model", "preparation_protocol_doi"):
    print(f"  {key:30} {row[key]}")
```

```
SNT998.RFFC.236 is one assay of a multi-assay experiment; its files are on SNT652.KFPV.658
SNT652.KFPV.658  GeoMx (NGS)  15 public files, 17.9 GB total
largest: lab_processed/images/GeoMx3_Niedernhofer_Project_060.ome.tiff  17.8 GB

fetching everything under 6 kB:
  ok 3 B            3 extras/microscope_hardware.json
  ok 184 B        184 lab_processed/images/GeoMx3-ome-tiff.channels.csv
  ok 1122 B      1122 b81af433a6e99298061312c1ecfbef6d-metadata.tsv
  ok 1902 B      1902 geomx-rnaseq-with-probes-metadata.tsv
  ok 5203 B      5203 extras/contributors.tsv

  dataset_type                   RNAseq (with probes)
  analyte_class                  RNA
  assay_input_entity             area of interest
  acquisition_instrument_model   NovaSeq X Plus
  preparation_protocol_doi       https://dx.doi.org/10.17504/protocols.io.8epv5r7k6g1b/v2
```

Four things that make this safe to run unattended.

**Size the download before starting it.** This dataset is 15 files and 17.9 GB, of which
17.8 GB is one OME-TIFF. Imaging assays — Xenium, PhenoCycler, CosMx, GeoMx, Visium — are
the bulk of SenNet and routinely put a single multi-gigabyte pyramid alongside a handful of
kilobyte-scale metadata files. Sum `size` from the manifest first and filter by extension or
by a size ceiling; the `files` index carries `size`, `file_extension`, `md5_checksum` and
`sha256_checksum` for every record, so none of this needs a request to find out.

**Verify against the published checksum.** `sha256_checksum` is in the index for every file
and the assets host serves the bytes that match it. A silent truncation on a 17 GB transfer
is otherwise invisible.

**Expect a small fraction of listed public files not to be served.** Probing one file from
each of 60 distinct public datasets, 56 returned 200 and 4 returned 404 — including whole
datasets where every listed file is unavailable over HTTPS. Treat a 4xx as "not available by
this route", keep going, and report which paths failed rather than aborting the run.

**Three small files answer most provenance questions.** All 2,594 public lab-submitted
datasets carry a `<uuid>-metadata.tsv` — and usually an assay-named twin of it — holding the
CEDAR-validated submission record: instrument, protocol DOI, library chemistry, input
entity. 2,584 carry a `metadata.json` and 2,447 an `extras/contributors.tsv` with named
authors and ORCIDs (8 more spell it `.txt`, so match on the stem). All three are kilobytes,
not gigabytes. Separately, 32 public datasets carry a `sequence-data-removed-README.txt`
entry, which marks a dataset whose raw sequence was stripped from the public copy.

For bulk transfer across many datasets, SenNet publishes a command-line tool that moves
files over Globus:

```bash
# Not executed here -- see `verified.unverified_reason`. Needs a Globus login.
pip install atlas-consortia-clt

# A manifest is one line per item: a SenNet id, a space, then a path inside the
# dataset. A trailing slash means the whole directory.
cat > manifest.txt <<'EOF'
SNT652.KFPV.658 /extras/
SNT652.KFPV.658 /geomx-rnaseq-with-probes-metadata.tsv
SNT389.HGGS.432 /
EOF

sennet-clt login                    # Google or ORCID for public data
sennet-clt transfer manifest.txt --destination sennet-downloads
```

The login is the reason to prefer plain HTTPS for anything that fits: **the CLT requires an
account even for public data**, while `assets.api.sennetconsortium.org` requires none.
Reach for the CLT when the transfer is large enough that Globus's resumption and integrity
checking earn their setup cost, or when the data is protected — in which case the account
must be a SenNet one and the command takes `--from-protected-space`.

## Requesting access

The 847 protected datasets are raw human DNA and RNA sequence, and they are the only
protected records in the index. Everything else — including every processed expression
matrix, every image, and the complete metadata of the protected datasets themselves — is
open.

**Read the consent before the process.** SenNet's External Data Use Agreement states that
data is released under one of two consent groups: **"no restrictions for research use"** or
**General Research Use (GRU)**. Both are broad, which is unusually permissive for
individual-level human sequence, but they are the binding constraint on what the data may be
used for and they are set per tissue source. Establish that your question fits the consent
before you spend months on an application, not after.

What the route requires, as SenNet publishes it:

- **Permission is granted by a designated NIH Data Access Committee**, under the NIH Genomic
  Data Sharing Policy, not by the consortium and not by the submitting lab. Approved data is
  handled under the NIH Security Best Practices document.
- **A SenNet account backed by an institutional identity.** Authentication is Globus Auth,
  and the portal requires an institutional identity provider rather than a personal Google
  or ORCID login, which is what the public tier accepts. Register at
  <https://profile.sennetconsortium.org/>.
- **Transfer is through the command-line tool with `--from-protected-space`.** The HTTPS
  assets route does not serve protected files at all.

**This skill cannot obtain access and does not promise it.** No public page publishes a
step-by-step application, and no dbGaP study accession for SenNet was findable on
2026-08-27; the authoritative statement is the External Data Use Agreement at
<https://sennetconsortium.org/external-data-use/>, and the SenNet help desk is the route to
the current process. Assist with an application by drafting a research use statement and
checklisting requirements — but **never fill in an attestation** about IRB status, data
security or non-re-identification. Those are legal claims made under a named person's name.

## Where SenNet is not the answer

- **You want a marker panel rather than data.** SenNet publishes a senescence biomarker
  catalogue as an interactive graph over a spreadsheet, outside the APIs above; it is
  reachable from <https://docs.sennetconsortium.org/biomarkers>.
- **You want per-cell senescence calls.** The `cell-types` index gives Cell Ontology labels
  and counts for 109 datasets; it does not label cells as senescent. Deciding that is the
  analysis, and it is yours.
- **You want an aggregated cross-study expression matrix.** SenNet publishes per-dataset
  outputs. Harmonising across assays and centres is not done for you.
- **You want raw human sequence.** That is the protected tier above.

## Sources

- SenNet Data Sharing Portal — <https://data.sennetconsortium.org>
- Search API — `https://search.api.sennetconsortium.org/{entities|files|cell-types|senotypes}/search`
- Entity API — `https://entity.api.sennetconsortium.org/entities/{id}`
- Assets — `https://assets.api.sennetconsortium.org/{dataset_uuid}/{rel_path}`
- Developer documentation — <https://docs.sennetconsortium.org/apis>
- External Data Use Agreement — <https://sennetconsortium.org/external-data-use/>
- Command-line transfer — <https://docs.sennetconsortium.org/libraries/clt/>

## Try it

A self-contained check that this skill still holds. Public data, no account, no key,
Python standard library only, and nothing larger than 106 bytes is transferred.

**Data** — the SenNet public production index `sn_prod_public_entities`, reached through
the search API; one record on the entity API; and one file downloaded in full:

    https://assets.api.sennetconsortium.org/692432868170e17942767205be022798/genome_build.json

SenNet public data carries a permissive licence — the consortium's External Data Use
Agreement names CC-BY 4.0 for open data — and needs no account or licence acceptance.
`SNT389.HGGS.432` (uuid `692432868170e17942767205be022798`) is a pipeline-processed lung
RNAseq dataset, used because its 106-byte `genome_build.json` is the smallest public file
with a published checksum. `SNT998.RFFC.236` is a multi-assay component with no files of its
own, used because that is the case a single-dataset test misses. Two protected
`metadata.json` files are probed with HEAD rather than fetched, to show that a refusal comes
back as 401 on one dataset and 404 on another, and that 404 is also what a mistyped path
returns. The other four entries in `datasets:` are the files `## Get the files` retrieves.
Last confirmed reachable 2026-08-27.

The search endpoint itself is deliberately absent from `datasets:` — it is POST-only and
answers a GET with 405, so a GET-based reachability sweep would report a healthy service as
dead.

```python
import hashlib, json, urllib.error, urllib.request

SEARCH = "https://search.api.sennetconsortium.org"
ENTITY = "https://entity.api.sennetconsortium.org"
ASSETS = "https://assets.api.sennetconsortium.org"


def post(index, body):
    """Returns (status, parsed). Never raises -- the error bodies are the point."""
    req = urllib.request.Request(f"{SEARCH}/{index}/search",
                                 data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as fh:
            return fh.status, json.loads(fh.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


def total(index, query, exact=True):
    body = {"size": 0, "query": query}
    if exact:
        body["track_total_hits"] = True
    return post(index, body)[1]["hits"]["total"]


def head(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"),
                                    timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as exc:
        return exc.code


# 1. POST only, and the index alias belongs in the path.
try:
    urllib.request.urlopen(f"{SEARCH}/entities/search", timeout=60)
    raise AssertionError("a GET should not have succeeded")
except urllib.error.HTTPError as exc:
    assert exc.code == 405, exc.code
    print("GET /entities/search      :", exc.code)

status, body = post("api", {"query": {"match_all": {}}})
assert status == 400, status
names = body["error"].split("Use one of the following: ")[1].split(",")
queryable = [n for n in names if not n.startswith("logs-")]
assert queryable == ["entities", "files", "cell-types", "senotypes"], queryable
print("index aliases             :", ", ".join(queryable))

# 2. hits.total is a ceiling until you ask for the real number.
capped = total("entities", {"match_all": {}}, exact=False)
assert capped == {"relation": "gte", "value": 10000}, capped
_, full = post("entities", {"size": 0, "track_total_hits": True,
                            "query": {"match_all": {}},
                            "aggs": {"k": {"terms": {"field": "entity_type.keyword"}}}})
assert full["hits"]["total"]["relation"] == "eq"
counts = {b["key"]: b["doc_count"] for b in full["aggregations"]["k"]["buckets"]}
assert set(counts) == {"Source", "Sample", "Dataset", "Collection"}, sorted(counts)
assert sum(counts.values()) == full["hits"]["total"]["value"]
print("public entities           :", full["hits"]["total"]["value"],
      "=", " + ".join(f"{k} {v}" for k, v in counts.items()))

# 3. The index name a hit reports is not a name this API accepts.
_, one = post("entities", {"size": 1, "sort": [{"uuid.keyword": "asc"}],
                           "_source": ["sennet_id"], "query": {"match_all": {}}})
physical = one["hits"]["hits"][0]["_index"]
status, body = post(physical, {"query": {"match_all": {}}})
assert status == 400 and physical in body["error"], body
print("_index                    :", physical, "-> HTTP", status, "in the path")

# 4. Free text over the whole document returns zero, and no error with it.
loose = total("entities", {"query_string": {"query": "lung"}})
named = total("entities", {"term": {"origin_samples.organ_hierarchy.keyword": "Lung"}})
assert loose["value"] == 0, loose
assert named["value"] > 1000, named
print("query_string 'lung'       :", loose["value"],
      "| term organ_hierarchy Lung:", named["value"])

# 5. Organ codes are lateralised. The whole-organ code is never the one stored,
#    and the two sides sum to more than the deduplicated organ count.
sides = {code: total("entities", {"term": {"origin_samples.organ.keyword": code}})["value"]
         for code in ("UBERON:0002048", "UBERON:0002167", "UBERON:0002168")}
assert sides["UBERON:0002048"] == 0, sides
assert min(sides["UBERON:0002167"], sides["UBERON:0002168"]) > 0, sides
assert sides["UBERON:0002167"] + sides["UBERON:0002168"] >= named["value"], sides
print("lung whole/right/left     :", *sides.values())

# 6. Both species are in here, and neither is the default.
_, sp = post("entities", {"size": 0, "query": {"term": {"entity_type.keyword": "Source"}},
                          "aggs": {"s": {"terms": {"field": "source_type.keyword"}}}})
species = {b["key"]: b["doc_count"] for b in sp["aggregations"]["s"]["buckets"]}
assert set(species) == {"Human", "Mouse"}, sorted(species)
print("Source records by species :", species)

# 7. Both SenNet-specific indices answer. Their counts are observed, not fixed.
sizes = {ix: total(ix, {"match_all": {}})["value"] for ix in ("cell-types", "senotypes")}
assert sizes["cell-types"] > 0, sizes
print("cell-types / senotypes    :", sizes["cell-types"], "/", sizes["senotypes"])

# 8. A multi-assay component owns no files; its parent does.
with urllib.request.urlopen(f"{ENTITY}/entities/SNT998.RFFC.236", timeout=90) as fh:
    child = json.loads(fh.read())
assert child["creation_action"] == "Multi-Assay Split", child["creation_action"]
parent = next(a for a in child["direct_ancestors"] if a["entity_type"] == "Dataset")
n = {label: total("files", {"term": {"dataset_uuid.keyword": uuid}})["value"]
     for label, uuid in (("child", child["uuid"]), ("parent", parent["uuid"]))}
assert n["child"] == 0 and n["parent"] > 0, n
print(f"{child['sennet_id']} files      : {n['child']}  ->  "
      f"{parent['sennet_id']} files: {n['parent']}")

# 9. A public file downloads anonymously and checks against the published hash.
_, pubf = post("files", {"size": 1, "_source": ["rel_path", "size", "sha256_checksum"],
                         "query": {"bool": {"filter": [
                             {"term": {"dataset_uuid.keyword":
                                       "692432868170e17942767205be022798"}},
                             {"term": {"rel_path.keyword": "genome_build.json"}}]}}})
entry = pubf["hits"]["hits"][0]["_source"]
with urllib.request.urlopen(
        f"{ASSETS}/692432868170e17942767205be022798/{entry['rel_path']}",
        timeout=120) as fh:
    blob = fh.read()
assert len(blob) == entry["size"], (len(blob), entry["size"])
assert hashlib.sha256(blob).hexdigest() == entry["sha256_checksum"]
print("genome_build.json         :", entry["size"], "B, sha256 matches the index")
print("                           ", json.loads(blob))

# 10. A protected file is refused, and the status code does not say so.
refused = {p: head(f"{ASSETS}/{p}") for p in (
    "c5489dc234a2f1567269ae464ea74222/metadata.json",
    "8a029b42e79e96d0f43526080b0ce0ad/metadata.json",
    "692432868170e17942767205be022798/no-such-file.json")}
assert all(code >= 400 for code in refused.values()), refused
assert len(set(refused.values())) > 1, refused
print("two protected + one typo  :", *refused.values())
```

**Expect** — printed 2026-08-27:

```
GET /entities/search      : 405
index aliases             : entities, files, cell-types, senotypes
public entities           : 12032 = Dataset 5762 + Sample 5406 + Source 851 + Collection 13
_index                    : sn_prod_public_entities -> HTTP 400 in the path
query_string 'lung'       : 0 | term organ_hierarchy Lung: 2193
lung whole/right/left     : 0 1558 643
Source records by species : {'Mouse': 429, 'Human': 422}
cell-types / senotypes    : 5419 / 0
SNT998.RFFC.236 files      : 0  ->  SNT652.KFPV.658 files: 15
genome_build.json         : 106 B, sha256 matches the index
                            {'genome': 'grch38', 'annotations': {'source': 'GENCODE', 'version': 35}}
two protected + one typo  : 401 404 404
```

**Invariants** — a failure here means the skill is wrong, not that SenNet moved:

- A GET is 405 and the alias list is exactly `entities, files, cell-types, senotypes`.
- `hits.total` without `track_total_hits` is `{"relation": "gte", "value": 10000}`, and with
  it the relation is `eq` and the four entity-type buckets sum to the total.
- The physical index name a hit reports is rejected as a path segment.
- A bare `query_string` returns 0 while the field-qualified `term` returns thousands.
- `UBERON:0002048` never appears; left and right lung both do, and their sum is at least the
  deduplicated `organ_hierarchy: Lung` count.
- `source_type` has exactly two values, Human and Mouse.
- A `Multi-Assay Split` dataset has zero file records and its parent has some.
- A public file's bytes match the `sha256_checksum` published in the `files` index.
- Both protected files are refused, and not with the same status code as each other.

**Observed values** — these move when SenNet publishes, and a mismatch is drift to
investigate, not a bug: 12,032 entities and their per-type split; 2,193 lung records split
1,558 right and 643 left; 429 mouse and 422 human Sources; 5,419 cell-type annotations;
**0 senotypes**; 15 files on `SNT652.KFPV.658`; the exact 401/404 pair. A non-zero
`senotypes` count is the one to act on — it means SenNet has begun publishing its own
senescent-state descriptions and this skill needs rewriting around them.
