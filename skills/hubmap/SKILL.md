---
name: hubmap
description: Query HuBMAP — the NIH atlas of healthy human tissue — for datasets, donors, samples and files across kidney, lung, placenta, spleen, heart, intestine and twenty more organs. Covers CODEX, MIBI, Visium, snRNA-seq and mass-spec assays, the donor to sample to dataset provenance chain, and which assays are openly downloadable versus protected human sequence.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [hubmap, public-data, spatial, single-cell, controlled-access]
covers: [human biomolecular atlas program, reference atlas, uterus, small intestine, large intestine, pancreas, ovary, fallopian tube, thymus, lymph node, bone marrow, skin, liver, brain, eye, phenocycler, cell dive, imaging mass cytometry, slide-seq, seqfish, xenium, atac-seq, rna-seq, 10x multiome, geomx, maldi, lc-ms, histology, spatial transcriptomics, h5ad]
papers: [PMID:31597973, PMID:37468756, PMID:34750582, PMID:40082611, PMID:40212885]
access: [open, controlled]
platform: hive-elasticsearch
datasets: [https://assets.hubmapconsortium.org/e4f073138aff9b294cc58a839951e4b2/sprm_outputs/reg1_stitched_expressions.ome.tiff-clustercell_texture_legend.csv, https://assets.hubmapconsortium.org/5a5ca03fa623602d9a859224aa40ace4/expr.h5ad]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: HuBMAP search-api /v3 (index build 3.6.23) / entity-api 2.6.19 (main:758ab49) / index hm_prod_public_portal, hm_prod_public_entities, hm_public_files / Python 3.12.8 stdlib only / curl 8.7.1
  executed: 15
  unverified: 0
---
# HuBMAP — Human BioMolecular Atlas Program

HuBMAP is building a cell-resolution map of the **healthy** adult human body. That word is
the whole point of the resource: where a disease atlas gives you tumour versus adjacent
normal, HuBMAP gives you tissue from donors who were not being studied for a disease,
sampled at a recorded anatomical position, across dozens of organs and dozens of assays.
When the question is *what does this organ normally look like*, this is the reference.

Everything below runs anonymously. No account, no key, no click-through.

Observed 2026-08-27 in the public index: **16,695 entities** — 9,760 Datasets, 5,152
Samples, 501 Donors, 40 Collections, 18 Publications, 1,224 Support entities — from 23
contributing groups, over 29 organ values led by Placenta (3,188 datasets), Uterus (820),
Lung (814 right / 640 left) and Kidney (721 left / 681 right).

## Reaching the API

Three mechanical facts sink most first attempts, and none of them announces itself.

**It is POST-only, and the index is named in the path.** A GET returns `405` with no hint
that the method is the problem. A wrong index name returns a `400` that helpfully
enumerates the real ones — which is the fastest route to a working call.

```bash
curl -s -o /dev/null -w "GET  -> %{http_code}\n" \
  https://search.api.hubmapconsortium.org/v3/portal/search

curl -s -X POST -H "Content-Type: application/json" \
  -d '{"size":0,"query":{"match_all":{}}}' \
  https://search.api.hubmapconsortium.org/v3/nonesuch/search
```

```
GET  -> 405
{"error":"400 Bad Request: Invalid index name 'nonesuch'. Use one of the following: entities,portal,hm_antibodies,files,logs-file-downloads,logs-api-usage,logs-github-analytics,logs-aggregated"}
```

**`hits.total.value` stops counting at 10,000.** The response says so, in a field most
callers drop: `relation` is `gte` when the count is a floor and `eq` when it is a count. Ask
for `track_total_hits` and you get the real number.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"size":0,"query":{"match_all":{}}}' \
  https://search.api.hubmapconsortium.org/v3/portal/search \
  | python3 -c 'import json,sys; print("default        ", json.load(sys.stdin)["hits"]["total"])'

curl -s -X POST -H "Content-Type: application/json" \
  -d '{"size":0,"track_total_hits":true,"query":{"match_all":{}}}' \
  https://search.api.hubmapconsortium.org/v3/portal/search \
  | python3 -c 'import json,sys; print("track_total_hits", json.load(sys.stdin)["hits"]["total"])'
```

```
default         {'relation': 'gte', 'value': 10000}
track_total_hits {'relation': 'eq', 'value': 16695}
```

Reporting 10,000 as a collection size publishes a wrong number that looks entirely
plausible. Set `track_total_hits` on anything you intend to quote.

## Three indices, three questions

| path | index | holds | use it for |
|---|---|---|---|
| `/v3/portal/search` | `hm_prod_public_portal` | entities, denormalised | almost everything — donor demographics, organ, assay, provenance are all inlined |
| `/v3/entities/search` | `hm_prod_public_entities` | entities, lean | id lookups where the fat portal document is waste |
| `/v3/files/search` | `hm_public_files` | 9,930,736 individual files | finding files by extension, size or checksum across the whole corpus |

`/v3/search` with no index is an alias for `entities`. The portal index is the one to reach
for: it is the same 16,695 entities with the donor, the organ, the sample chain and the
assay already joined in, so most questions are one request rather than four.

The entity API answers the same entities one at a time, by either identifier form, and is
the authoritative record rather than an index of it:

```bash
curl -s https://entity.api.hubmapconsortium.org/entities/HBM347.PSLC.425 \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["entity_type"], d["uuid"], d["status"], d["data_access_level"])'
```

```
Dataset e4f073138aff9b294cc58a839951e4b2 Published public
```

Two quirks of that host, both of which look like the record is missing when it is not.
`/entities/{id}` answers `404` to a `HEAD` and `200` to a `GET` of the identical URL, so a
reachability probe that uses `HEAD` reports every entity as gone. And `/entities/{id}/ancestors`
and `/parents/{id}` answer anonymously while `/descendants/{id}` and `/children/{id}` return
`401` — provenance walks upward for free and downward only for logged-in callers, so to go
downward, query the search index instead, which is what the rest of this skill does.

## Which tier your question is in

The public index carries metadata for **every** published dataset, including ones whose
files you cannot download. Of 9,760 datasets, 4,192 are `data_access_level: public` and
5,568 are `protected`. The split is not arbitrary and it is not per-dataset judgement — it
is exactly `contains_human_genetic_sequences`, and it falls along assay lines:

| assay | public | protected |
|---|---|---|
| Histology, LC-MS, MIBI, CODEX, MALDI, PhenoCycler, Cell DIVE, CyTOF, Xenium, DESI, Light Sheet, IMC, Auto-fluorescence | all | none |
| RNAseq, ATACseq, GeoMx (NGS), RNAseq (with probes), SNARE-seq2, 10X Multiome, Visium (no probes), Slide-seq, WGS, MUSIC | none | all |
| `RNAseq [Salmon]`, `ATACseq [SnapATAC]`, `ATACseq [BWA + MACS2]`, `10X Multiome [Salmon + ArchR + Muon]`, `Slide-seq [Salmon]`, `SNARE-seq2 [Salmon + ArchR + Muon]` | all | none |

Read the first and third rows together, because that is the finding that changes what a
reader does. **The raw reads are protected; the processed derivative of the same experiment
is public.** A search for public kidney `RNAseq` returns zero and looks like an empty
resource. The same search for `RNAseq [Salmon]` returns 98 datasets, each shipping
`expr.h5ad`, `raw_expr.h5ad` and `secondary_analysis.h5ad` — cell-by-gene matrices, openly
downloadable. Almost nobody asking "is there HuBMAP kidney single-cell data" needs the
FASTQs.

Two mechanical tells, both reliable:

- `data_access_level` on the entity — `public` or `protected`.
- `local_directory_rel_path` on the entity API record, which begins `public/` or
  `protected/`.

And two consequences. The `files` index contains **only** public files, so a protected
dataset returns zero rows there rather than an error. The assets host returns `401` for
protected paths and `200` for public ones:

```bash
curl -s -A "hubmap-skill/1.0" -o /dev/null -w "protected -> %{http_code}\n" \
  https://assets.hubmapconsortium.org/dda3b076b653c91c4ff29e31851fe855/
curl -s -A "hubmap-skill/1.0" -o /dev/null -w "public    -> %{http_code}\n" -I \
  https://assets.hubmapconsortium.org/5a5ca03fa623602d9a859224aa40ace4/expr.h5ad
```

```
protected -> 401
public    -> 200
```

## A client worth keeping

Save this as `hubmap.py`. Every later block imports from it.

```python
import json
import urllib.error
import urllib.request

SEARCH = "https://search.api.hubmapconsortium.org/v3/{}/search"
ENTITY = "https://entity.api.hubmapconsortium.org/entities/{}"
ASSETS = "https://assets.hubmapconsortium.org"

# The assets host rejects any User-Agent naming curl or wget with a bare nginx 403.
# Sending our own everywhere keeps one habit instead of two.
UA = {"User-Agent": "hubmap-skill/1.0"}


def search(body, index="portal", timeout=60):
    """POST an Elasticsearch query body. `index` is part of the path, not the body."""
    body = dict(body)
    body.setdefault("track_total_hits", True)   # or the count silently caps at 10000
    req = urllib.request.Request(
        SEARCH.format(index),
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **UA},
    )
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def total(body, index="portal"):
    return search({**body, "size": 0}, index)["hits"]["total"]["value"]


def sources(body, index="portal"):
    return [h["_source"] for h in search(body, index)["hits"]["hits"]]


def entity(identifier, timeout=60):
    """The authoritative record for one entity, by HuBMAP id or by uuid."""
    req = urllib.request.Request(ENTITY.format(identifier), headers=UA)
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def published_public(*clauses):
    """The filter almost every query wants: published, downloadable, not retracted."""
    return {"bool": {"filter": [
        {"term": {"status.keyword": "Published"}},
        {"term": {"data_access_level.keyword": "public"}},
        *clauses,
    ]}}
```

`published_public` exists because of a quiet trap: **296 of the 9,760 datasets have
`status: Retracted` and they are still in the index.** A `match_all` sweep collects them
alongside live data with nothing in the result to flag it.

## Donor, sample, dataset — the part newcomers get wrong

Every HuBMAP identifier looks the same. `HBM347.PSLC.425` is a Dataset, `HBM546.HQGH.786`
is a Donor, `HBM922.VXHH.673` is a Sample — and Collections, Publications and Support
entities use the identical `HBM###.XXXX.###` shape. **Nothing in the id says what it is.**
Read `entity_type` before you assume.

The chain runs Donor → Sample → … → Sample → Dataset, and the sample layer is not one step.
It nests by `sample_category`: an `organ` sample is subdivided into `block` samples, which
are cut into `section` samples or dissociated into a `suspension`. Across the index:
2,669 sections, 1,660 blocks, 601 organs, 222 suspensions.

Two fields on a Dataset name the two ends of that sample chain, and they are not the same
field:

- **`origin_samples`** — the organ. This is `sample_category: organ` for all 9,760 datasets
  without exception, so it is the field to filter on when the question is "which organ".
- **`source_samples`** — the immediate parent, whatever depth that is: section for 6,688
  datasets, block for 1,597, suspension for 1,471, organ for 6.

```python
from hubmap import search, sources

d = sources({
    "size": 1,
    "query": {"term": {"hubmap_id.keyword": "HBM347.PSLC.425"}},
    "_source": ["hubmap_id", "entity_type", "dataset_type", "processing",
                "donor.hubmap_id", "origin_samples_unique_mapped_organs",
                "origin_samples.hubmap_id", "origin_samples.sample_category",
                "source_samples.hubmap_id", "source_samples.sample_category",
                "ancestor_counts", "ancestors.hubmap_id", "ancestors.entity_type",
                "ancestors.sample_category",
                "immediate_ancestors.hubmap_id", "immediate_ancestors.entity_type"],
})[0]

print(d["hubmap_id"], "|", d["dataset_type"], "|", d["processing"],
      "|", d["origin_samples_unique_mapped_organs"][0])
print("counted ancestors :", d["ancestor_counts"]["entity_type"])
print("donor             :", d["donor"]["hubmap_id"])
print("organ sample      :", d["origin_samples"][0]["hubmap_id"],
      "(" + d["origin_samples"][0]["sample_category"] + ")")
print("source sample     :", d["source_samples"][0]["hubmap_id"],
      "(" + d["source_samples"][0]["sample_category"] + ")")
print("immediate parents :", [(a["entity_type"], a["hubmap_id"])
                              for a in d["immediate_ancestors"]])
print("ancestors as given:", [(a["entity_type"], a.get("sample_category", "-"))
                              for a in d["ancestors"]])
```

```
HBM347.PSLC.425 | CODEX [Cytokit + SPRM] | processed | Lymph Node
counted ancestors : {'Dataset': 1, 'Donor': 1, 'Sample': 3}
donor             : HBM546.HQGH.786
organ sample      : HBM922.VXHH.673 (organ)
source sample     : HBM799.WXHD.535 (section)
immediate parents : [('Dataset', 'HBM747.CQKL.785')]
ancestors as given: [('Dataset', '-'), ('Sample', 'section'), ('Sample', 'block'), ('Sample', 'organ'), ('Donor', '-')]
```

Three things in that output are the ones people get wrong.

**A Dataset's parent is often another Dataset.** `HBM347.PSLC.425` is the Cytokit + SPRM
*processing* of the raw CODEX dataset `HBM747.CQKL.785`. Its `ancestors` therefore contain a
Dataset as well as the samples and the donor, and `ancestor_counts` says so explicitly.
Treating every ancestor as a sample double-counts the tissue.

**`immediate_ancestors` is a list, and sometimes a long one.** The public
`RNAseq [Salmon]` dataset `HBM675.VBDH.688` was produced from **seven** raw RNAseq datasets
pooled together. Code that reads `immediate_ancestors[0]` and moves on quietly drops six.

**Do not trust the order of `ancestors`.** It happens to read nearest-first here, but not
always: `HBM555.CGHX.875` returns `[Dataset, Sample(block), Sample(block), Sample(organ),
Donor, Dataset]` — a second Dataset *after* the Donor. Rebuild the chain from
`sample_category`, `donor`, `origin_samples` and `immediate_ancestors`, never from position.

Both of those are uncommon enough to survive testing and common enough to bite in
production. Across a 160-dataset sample spanning random draws plus the twenty oldest and
twenty newest, 5 had more than one immediate parent and 6 had an `ancestors` array that did
not end at the Donor. Everything else held without exception: every dataset had a donor,
every `origin_samples` entry was the organ, every dataset had at least one source sample,
and every processed dataset's first parent was a Dataset.

Going the other way — donor first — is a search, because the entity API will not walk
downward for an anonymous caller:

```python
from hubmap import search, sources

DONOR = "HBM546.HQGH.786"

meta = sources({"size": 1, "query": {"term": {"hubmap_id.keyword": DONOR}},
                "_source": ["entity_type", "group_name", "mapped_metadata"]})[0]
m = meta["mapped_metadata"]
print(DONOR, "|", meta["entity_type"], "|", meta["group_name"])
print("  ", m["sex"][0], m["age_value"][0], m["age_unit"][0], "|", m["race"][0],
      "| BMI", m["body_mass_index_value"][0], "| died of", m["cause_of_death"][0])

res = search({
    "size": 0,
    "query": {"bool": {"filter": [
        {"term": {"entity_type.keyword": "Dataset"}},
        {"term": {"donor.hubmap_id.keyword": DONOR}}]}},
    "aggs": {
        "organ": {"terms": {"field": "origin_samples_unique_mapped_organs.keyword"}},
        "assay": {"terms": {"field": "dataset_type.keyword", "size": 20}},
        "tier": {"terms": {"field": "data_access_level.keyword"}},
    },
})
print("  datasets:", res["hits"]["total"]["value"])
for name, agg in res["aggregations"].items():
    print("  ", name, [(b["key"], b["doc_count"]) for b in agg["buckets"]])
```

```
HBM546.HQGH.786 | Donor | University of Florida TMC
   Male 32.0 years | White | BMI 30.2 | died of Anoxia
  datasets: 9
   assay [('CODEX [Cytokit + SPRM]', 6), ('CODEX', 3)]
   organ [('Lymph Node', 9)]
   tier [('public', 9)]
```

Donor demographics are also inlined on every Dataset as `donor_demographics`, with `age`,
`height`, `weight` and `body_mass_index` each carrying `min`/`mean`/`max` — because a
processed dataset can pool several donors, and a single number would be a lie there.

## Filtering

The interface is raw Elasticsearch, so learn the four clauses that do the work rather than
collecting canned queries. `bool.filter` for conjunctions (no scoring, cacheable), `term`
for one exact value, `terms` for a set, `range` for numbers.

**Exact matching needs the `.keyword` sub-field.** HuBMAP ids and organ names are indexed
twice: analysed (tokenised, lowercased) and as a keyword. A `term` query against the
analysed field is not an error — it returns zero. A `match` query returns far too much.

```python
from hubmap import total

ID = "HBM347.PSLC.425"
print("term hubmap_id.keyword :", total({"query": {"term": {"hubmap_id.keyword": ID}}}))
print("term hubmap_id         :", total({"query": {"term": {"hubmap_id": ID}}}))
print("match hubmap_id        :", total({"query": {"match": {"hubmap_id": ID}}}))
```

```
term hubmap_id.keyword : 1
term hubmap_id         : 0
match hubmap_id        : 64
```

Zero and sixty-four are both wrong, and neither raises. The over-match figure drifts with
reindexing — it was 68 earlier the same day — because it depends on which other ids happen
to share a token. That it is far from 1 is the invariant.

**Organ values carry laterality, so the obvious filter matches nothing.** There is no
`Kidney` — there is `Kidney (Left)` and `Kidney (Right)`. The general habit that avoids this
whole class of mistake: **aggregate to discover the vocabulary, then filter on the exact
values you saw.**

```python
from hubmap import search, total

DATASETS = {"term": {"entity_type.keyword": "Dataset"}}

res = search({"size": 0, "query": DATASETS,
              "aggs": {"organ": {"terms": {
                  "field": "origin_samples.mapped_organ.keyword", "size": 40}}}})
buckets = [(b["key"], b["doc_count"]) for b in res["aggregations"]["organ"]["buckets"]]
print("distinct organ values:", len(buckets))
print("kidney-ish:", [b for b in buckets if b[0].startswith("Kidney")])


def organ_datasets(clause):
    return total({"query": {"bool": {"filter": [DATASETS, clause]}}})


print("term  'Kidney'      :", organ_datasets({"term": {
    "origin_samples.mapped_organ.keyword": "Kidney"}}))
print("terms L+R           :", organ_datasets({"terms": {
    "origin_samples.mapped_organ.keyword": ["Kidney (Left)", "Kidney (Right)"]}}))
print("all entities, no type filter:", total({"query": {"terms": {
    "origin_samples.mapped_organ.keyword": ["Kidney (Left)", "Kidney (Right)"]}}}))
```

```
distinct organ values: 29
kidney-ish: [('Kidney (Left)', 721), ('Kidney (Right)', 681)]
term  'Kidney'      : 0
terms L+R           : 1402
all entities, no type filter: 3053
```

The last line is the other half of the same habit. `origin_samples` is set on Samples,
Support entities and Publications too, so dropping the `entity_type` filter turns 1,402
datasets into 3,053 mixed records — 1,239 tissue samples, 402 Support entities and 10
Publications ride along. **Filter on `entity_type` in every query**, or the number you
report is a mix of things.

There is an `anatomy_1` field holding lowercase laterality-free organ terms, and it is
tempting. **It is incomplete** — as of 2026-08-27 it covers 11 organ values totalling about
4,800 datasets, with Placenta, Uterus and Pancreas absent entirely. Use `origin_samples`.

Put together, a realistic triage query — young female donors, either kidney, tissue
registered to an anatomical position, published, downloadable:

```python
from hubmap import published_public, search, sources

query = published_public(
    {"term": {"entity_type.keyword": "Dataset"}},
    {"terms": {"origin_samples.mapped_organ.keyword": ["Kidney (Left)", "Kidney (Right)"]}},
    {"term": {"donor_demographics.sex.keyword": "Female"}},
    {"range": {"donor_demographics.age.max": {"lt": 40}}},
    {"term": {"is_spatial": True}},
)
res = search({"size": 0, "query": query,
              "aggs": {"assay": {"terms": {"field": "dataset_type.keyword", "size": 10}}}})
print("matching datasets:", res["hits"]["total"]["value"])
print("by assay:", [(b["key"], b["doc_count"]) for b in res["aggregations"]["assay"]["buckets"]])

for d in sources({"size": 3, "query": query, "sort": [{"hubmap_id.keyword": "asc"}],
                  "_source": ["hubmap_id", "uuid", "dataset_type", "title"]}):
    print(" ", d["hubmap_id"], d["uuid"][:12], "|", d["title"][:64])
```

```
matching datasets: 37
by assay: [('LC-MS', 8), ('Light Sheet', 8), ('RNAseq [Salmon]', 8), ('Auto-fluorescence', 4), ('ATACseq [Lab Processed]', 2), ('Histology', 2), ('MALDI', 2), ('RNAseq [Lab Processed]', 2), ('Histology [Kaggle-1 Segmentation]', 1)]
  HBM253.ZBGF.863 4b5dc6d04aa3 | RNAseq [Salmon] data from the kidney (left) of a 25-year-old whi
  HBM269.TVZG.369 2c991113aae0 | Light Sheet data from the kidney (right) of a 26-year-old white 
  HBM278.FBRC.748 f0d80ca8548d | Auto-fluorescence data from the kidney (left) of a 20-year-old w
```

**`is_spatial` does not mean "spatial assay"**, which is why bulk `RNAseq [Salmon]` and
`LC-MS` appear in that result. It is exactly equivalent to the presence of `rui_location` —
the tissue block's registered position in the Common Coordinate Framework — and it is true
for 8,461 of 9,760 datasets, bulk sequencing included. For spatial *methods*, filter on
`dataset_type`.

Other useful boolean and keyword fields on a Dataset, all verified present: `visualization`,
`contains_human_genetic_sequences`, `processing` (`raw` / `processed`), `assay_modality`
(`single` / `multiple`), `creation_action`, `group_name`, `analyte_class`, `soft_assaytype`.

## Paging past the ten-thousand ceiling

`from` beyond 10,000 is a `400`, and `size` above 10,000 is a `400`. Sweep with
`search_after` on a sort that includes a tiebreaker — `uuid.keyword` is the safe one.

```python
from hubmap import search

body = {
    "size": 1000,
    "query": {"term": {"entity_type.keyword": "Dataset"}},
    "sort": [{"created_timestamp": "asc"}, {"uuid.keyword": "asc"}],
    "_source": ["hubmap_id"],
}
seen, after = set(), None
while True:
    page = search({**body, **({"search_after": after} if after else {})})
    hits = page["hits"]["hits"]
    if not hits:
        break
    seen.update(h["_source"]["hubmap_id"] for h in hits)
    after = hits[-1]["sort"]

print("swept:", len(seen), "reported total:", page["hits"]["total"]["value"])
```

```
swept: 9760 reported total: 9760
```

Roughly ten seconds for the full dataset sweep. Without the `uuid.keyword` tiebreaker,
records sharing a `created_timestamp` can repeat or vanish between pages.

## Get the files

**No single surface lists every file, and both of the obvious ones are silently
incomplete.** This is the trap that costs real data.

- The portal index and the entity API carry an inline `files` array — but **only** on
  datasets whose `creation_action` is `Central Process` (1,406 of 9,760). A raw dataset
  simply has no `files` key.
- The `files` index carries 9,930,736 public files with checksums — but does not cover
  everything either.

Sampling 40 random published public datasets on 2026-08-27: 26 appeared only in the `files`
index, 2 only via the entity API, 10 in both, and 2 (`Multi-Assay Split` components, whose
bytes live under the parent) in neither. Where both answered, they answered differently —
`HBM522.GTLH.372` returns 8 rows from the `files` index (the top-level deliverables) and
11,544 from the entity API (the full expanded tree).

So query both, merge on `rel_path`, and record which surface each entry came from.

```python
from hubmap import ASSETS, entity, search, sources


def weigh(dataset_uuid):
    """Count and total bytes for every indexed file, without listing any of them."""
    res = search({"size": 0, "query": {"term": {"dataset_uuid.keyword": dataset_uuid}},
                  "aggs": {"bytes": {"sum": {"field": "size"}}}}, index="files")
    return res["hits"]["total"]["value"], res["aggregations"]["bytes"]["value"]


def list_files(hubmap_id, max_files=2000):
    """Merge both file surfaces. Stops paging at max_files; `weigh` reports the truth."""
    d = sources({"size": 1, "query": {"term": {"hubmap_id.keyword": hubmap_id}},
                 "_source": ["hubmap_id", "uuid", "data_access_level", "status",
                             "creation_action"]})[0]
    if d["data_access_level"] != "public":
        return d, {}            # protected: metadata is readable, bytes are not

    merged, after = {}, None
    while len(merged) < max_files:
        page = search({"size": 1000,
                       "query": {"term": {"dataset_uuid.keyword": d["uuid"]}},
                       "sort": [{"file_uuid.keyword": "asc"}],
                       "_source": ["rel_path", "size", "md5_checksum"],
                       **({"search_after": after} if after else {})}, index="files")
        hits = page["hits"]["hits"]
        if not hits:
            break
        for h in hits:
            s = h["_source"]
            merged[s["rel_path"]] = {"size": s["size"], "md5": s.get("md5_checksum"),
                                     "source": "files-index"}
        after = hits[-1]["sort"]

    for f in entity(d["uuid"]).get("files") or []:   # inline manifest, processed only
        merged.setdefault(f["rel_path"], {"size": f.get("size"), "md5": None,
                                          "source": "entity-api"})
    return d, merged


for hid in ("HBM347.PSLC.425", "HBM575.MTPD.997", "HBM834.KDMQ.368"):
    d, files = list_files(hid)
    indexed, total_bytes = weigh(d["uuid"])
    origin = {}
    for f in files.values():
        origin[f["source"]] = origin.get(f["source"], 0) + 1
    print(f"{hid}  {d['data_access_level']:9} {d['creation_action'][:16]:18} "
          f"indexed={indexed:<6} listed={len(files):<5} {total_bytes / 1e9:8.2f} GB  {origin}")
    if d["data_access_level"] == "public":
        print("      ", f"{ASSETS}/{d['uuid']}/<rel_path>")
```

```
HBM347.PSLC.425  public    Central Process    indexed=109    listed=109      26.66 GB  {'files-index': 109}
       https://assets.hubmapconsortium.org/e4f073138aff9b294cc58a839951e4b2/<rel_path>
HBM575.MTPD.997  public    Create Dataset A   indexed=45151  listed=2000    210.75 GB  {'files-index': 2000}
       https://assets.hubmapconsortium.org/e69fb303e035192a0ee38a34e4b25024/<rel_path>
HBM834.KDMQ.368  protected Multi-Assay Spli   indexed=0      listed=0         0.00 GB  {}
```

Note the middle line before reaching for a loop: **45,151 files and 210 GB in one raw CODEX
dataset**, of which the guard listed the first 2,000. Ask `weigh` before you ask for a
listing — a `sum` aggregation costs one request whatever the file count — then filter to
what you need by `file_extension`, `rel_path` prefix or `size`.

Bytes come from the assets host, at `https://assets.hubmapconsortium.org/<dataset_uuid>/<rel_path>`.
The `rel_path` is used verbatim, subdirectories included, and the identifier is the **uuid**,
not the `HBM###` id.

**The assets host refuses `curl`.** It returns a bare nginx `403` — no JSON, no message, no
hint — to any request whose User-Agent contains `curl` or `wget`. Anything else, including
an empty User-Agent and Python's default, is served normally. This is the single most
confusing failure in HuBMAP, because the same URL works in a browser.

```bash
U=https://assets.hubmapconsortium.org/e4f073138aff9b294cc58a839951e4b2/sprm_outputs/reg1_stitched_expressions.ome.tiff-clustercell_texture_legend.csv
curl -s -o /dev/null -w "default curl UA   -> %{http_code}\n" "$U"
curl -s -o /dev/null -w "any other UA      -> %{http_code}\n" -A "hubmap-skill/1.0" "$U"
```

```
default curl UA   -> 403
any other UA      -> 200
```

Now pull real files onto disk. The `files` index publishes an md5 for every row, so a
download is verifiable rather than hopeful, and large files support `HEAD` and range
requests so you can size a transfer before committing to it.

```python
import hashlib
import os
import urllib.request

from hubmap import ASSETS, UA, published_public, sources

OUT = "hubmap_files"
os.makedirs(OUT, exist_ok=True)


def fetch(dataset_uuid, rec, out_dir=OUT):
    url = "{}/{}/{}".format(ASSETS, dataset_uuid, rec["rel_path"])
    dest = os.path.join(out_dir, os.path.basename(rec["rel_path"]))
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
        blob = r.read()
    if rec.get("md5_checksum") and hashlib.md5(blob).hexdigest() != rec["md5_checksum"]:
        raise ValueError("md5 mismatch for " + rec["rel_path"])
    with open(dest, "wb") as fh:
        fh.write(blob)
    return dest, len(blob)


# A public processed single-cell dataset: the open half of a protected RNAseq experiment.
d = sources({"size": 1, "sort": [{"hubmap_id.keyword": "asc"}],
             "query": published_public(
                 {"term": {"dataset_type.keyword": "RNAseq [Salmon]"}},
                 {"terms": {"origin_samples.mapped_organ.keyword":
                            ["Kidney (Left)", "Kidney (Right)"]}}),
             "_source": ["hubmap_id", "uuid", "title"]})[0]
print(d["hubmap_id"], "|", d["title"][:70])

# Everything it published, largest first.
rows = sources({"size": 200, "sort": [{"size": "desc"}],
                "query": {"term": {"dataset_uuid.keyword": d["uuid"]}},
                "_source": ["rel_path", "size", "md5_checksum"]}, index="files")
for r in rows[:5]:
    print(f"   {r['size']:>12,}  {r['rel_path']}")

# Check the weight of the matrix before pulling it.
h5ad = next(r for r in rows if r["rel_path"] == "expr.h5ad")
head = urllib.request.Request(
    "{}/{}/{}".format(ASSETS, d["uuid"], h5ad["rel_path"]), method="HEAD", headers=UA)
with urllib.request.urlopen(head) as r:
    print("expr.h5ad content-length:", r.headers["Content-Length"],
          "| ranges:", r.headers.get("Accept-Ranges"))

# Pull the small ones and verify each against the published md5.
for r in [x for x in rows if x["size"] < 200_000][:3]:
    path, n = fetch(d["uuid"], r)
    print("wrote", path, n, "bytes (md5 verified)")
```

```
HBM226.HRTZ.874 | RNAseq [Salmon] data from the kidney (right) of a 54-year-old white ma
    359,507,942  secondary_analysis.h5ad
    149,233,797  scvelo_annotated.h5ad
     60,876,504  expr.h5ad
     33,168,228  raw_expr.h5ad
     11,289,668  salmon_out/alevin/quants_mat.mtx.gz
expr.h5ad content-length: 60876504 | ranges: bytes
wrote hubmap_files/featureDump.txt 188242 bytes (md5 verified)
wrote hubmap_files/secondary_analysis.csv 108319 bytes (md5 verified)
wrote hubmap_files/secondary_analysis.arrow 82346 bytes (md5 verified)
```

`.h5ad` files open with any AnnData reader; `.ome.tiff` with tifffile or bioformats; the
`sprm_outputs/*.csv` files are per-cell tables keyed on a cell `ID` with one column per
antibody channel, and need no special reader. Size is not a guide to importance in either
direction — the largest single file in the 109-file CODEX dataset above is a 1.25 GB
per-cell channel covariance table, while the matrices most people want are the `.h5ad`.

For a whole-dataset transfer HuBMAP also publishes a Globus route from the portal, driven by
a manifest file. It is the right tool at hundreds of gigabytes; for anything selective the
assets host above is simpler and needs no client.

**Cite what you take.** Published HuBMAP data is released under CC BY 4.0. Datasets that
carry a `registered_doi` should be cited by it; the consortium also asks for the
acknowledgement "The results here are in whole or part based upon data generated by the
HuBMAP Program", linking https://hubmapconsortium.org.

## Requesting access

**This skill cannot obtain protected data and does not promise it.** Everything above uses
the open tier. What follows describes the closed one so a reader can tell, during triage,
whether they need it — and usually they do not, because the processed derivative of a
protected experiment is public.

What is protected is exactly raw human genetic sequence: the assays in the middle row of the
tier table, 5,568 datasets. Their metadata — donor, organ, assay, provenance, title, DOI —
is fully public and queryable by anyone. Only the bytes are gated.

Two routes exist, and they are for different people.

**Consortium membership.** HuBMAP awardees log in to the portal through Globus, using
institutional or eRA Commons credentials, which unlocks protected files and additionally
exposes consortium-tier data that has not yet been published. Membership follows from an
NIH award, not from an application form, so this is not a route an unaffiliated reader can
take.

**dbGaP Authorized Access.** For everyone else, HuBMAP states that human sequence data is
distributed through dbGaP on release of the study, and that "once the data are available in
dbGaP the identifiers will be available from the portal". Access is granted by an NIH Data
Access Committee against a Data Use Certification signed by an institutional signing
official — a person with authority to bind the institution, which is why a researcher cannot
complete it alone. Expect weeks rather than days.

As of 2026-08-27 no dbGaP accession appears anywhere in the entity or search metadata for
protected datasets, so the accession has to be read off the portal page for the specific
study rather than derived from the API. Check the dataset's portal record before planning an
application around it.

Two things that matter more than the paperwork:

- **Consent governs use, and it is decided before any application.** HuBMAP donors are
  consented under either no research-use restriction or General Research Use. That is
  permissive as controlled data goes, but it is still the binding constraint on what an
  approved user may do, and it is set at the study, not negotiable per project.
- **A signing official's attestations are legal claims published under a named person's
  name.** Draft the research use statement, checklist the requirements, and track renewal
  dates — but IRB status, data security and non-re-identification are attested by a human,
  never filled in by an agent.

Authoritative instructions live with HuBMAP's own policies at
https://hubmapconsortium.org/policies/ and with dbGaP.

## Try it

**Data.** `HBM347.PSLC.425` — a published, public CODEX [Cytokit + SPRM] dataset from a
lymph node, contributed by the University of Florida TMC and released 2022-01-13, together
with its donor `HBM546.HQGH.786` and the 35-byte CSV
`sprm_outputs/reg1_stitched_expressions.ome.tiff-clustercell_texture_legend.csv`. CC BY 4.0,
anonymous, no account. Reachable 2026-08-27.

**Run.** In an empty directory:

```bash
cat > hubmap_try_it.py <<'PY'
import hashlib, json, urllib.request

SEARCH = "https://search.api.hubmapconsortium.org/v3/{}/search"
ASSETS = "https://assets.hubmapconsortium.org"
UA = {"User-Agent": "hubmap-skill/1.0"}
DATASET = "HBM347.PSLC.425"


def search(index, body):
    req = urllib.request.Request(
        SEARCH.format(index),
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **UA},
    )
    return json.load(urllib.request.urlopen(req))


# Exact id match needs the .keyword sub-field: the analysed field splits on dots.
res = search("portal", {
    "size": 1, "track_total_hits": True,
    "query": {"term": {"hubmap_id.keyword": DATASET}},
    "_source": ["hubmap_id", "uuid", "entity_type", "dataset_type", "status",
                "data_access_level", "processing",
                "origin_samples_unique_mapped_organs", "donor.hubmap_id",
                "origin_samples.hubmap_id", "origin_samples.sample_category",
                "source_samples.hubmap_id", "source_samples.sample_category",
                "immediate_ancestors.hubmap_id", "immediate_ancestors.entity_type"],
})
d = res["hits"]["hits"][0]["_source"]
strict = res["hits"]["total"]["value"]
analysed = search("portal", {"size": 0, "track_total_hits": True,
                             "query": {"term": {"hubmap_id": DATASET}}})["hits"]["total"]["value"]
loose = search("portal", {"size": 0, "track_total_hits": True,
                          "query": {"match": {"hubmap_id": DATASET}}})["hits"]["total"]["value"]

# Smallest CSV this dataset published, from the file-level index.
f = search("files", {
    "size": 1, "track_total_hits": True,
    "query": {"bool": {"filter": [
        {"term": {"dataset_uuid.keyword": d["uuid"]}},
        {"term": {"file_extension.keyword": ".csv"}}]}},
    "sort": [{"size": "asc"}],
    "_source": ["rel_path", "size", "md5_checksum"],
})
rec = f["hits"]["hits"][0]["_source"]

# Fetch it. The assets host rejects any User-Agent naming curl or wget.
url = "{}/{}/{}".format(ASSETS, d["uuid"], rec["rel_path"])
blob = urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()

checks = [
    ("keyword term matches exactly one entity", strict == 1),
    ("analysed term matches nothing", analysed == 0),
    ("match query over-matches", loose > 1),
    ("entity_type is Dataset", d["entity_type"] == "Dataset"),
    ("origin sample is the organ", d["origin_samples"][0]["sample_category"] == "organ"),
    ("source sample is below the organ", d["source_samples"][0]["sample_category"] != "organ"),
    ("parent of a processed dataset is a Dataset", d["immediate_ancestors"][0]["entity_type"] == "Dataset"),
    ("downloaded size matches the index", len(blob) == rec["size"]),
    ("md5 matches the index", hashlib.md5(blob).hexdigest() == rec["md5_checksum"]),
]
for label, ok in checks:
    print("{}  {}".format("PASS" if ok else "FAIL", label))

print()
print("dataset       ", d["hubmap_id"], "/", d["uuid"])
print("assay         ", d["dataset_type"])
print("organ         ", d["origin_samples_unique_mapped_organs"][0])
print("tier          ", d["data_access_level"], "|", d["status"], "|", d["processing"])
print("donor         ", d["donor"]["hubmap_id"])
print("organ sample  ", d["origin_samples"][0]["hubmap_id"])
print("source sample ", d["source_samples"][0]["hubmap_id"],
      "(" + d["source_samples"][0]["sample_category"] + ")")
print("parent dataset", d["immediate_ancestors"][0]["hubmap_id"])
print("csv files     ", f["hits"]["total"]["value"])
print("fetched       ", rec["rel_path"], "->", len(blob), "bytes")
print("content       ", blob.decode().strip())
PY
python3 hubmap_try_it.py
```

**Expect.**

```
PASS  keyword term matches exactly one entity
PASS  analysed term matches nothing
PASS  match query over-matches
PASS  entity_type is Dataset
PASS  origin sample is the organ
PASS  source sample is below the organ
PASS  parent of a processed dataset is a Dataset
PASS  downloaded size matches the index
PASS  md5 matches the index

dataset        HBM347.PSLC.425 / e4f073138aff9b294cc58a839951e4b2
assay          CODEX [Cytokit + SPRM]
organ          Lymph Node
tier           public | Published | processed
donor          HBM546.HQGH.786
organ sample   HBM922.VXHH.673
source sample  HBM799.WXHD.535 (section)
parent dataset HBM747.CQKL.785
csv files      42
fetched        sprm_outputs/reg1_stitched_expressions.ome.tiff-clustercell_texture_legend.csv -> 35 bytes
content        ID,CD107a,CD1c,CD163
1,0.0,0.0,0.0
```

**Invariants** — a failure here means this skill is wrong, not that HuBMAP moved. All nine
`PASS` lines: the `.keyword`/analysed asymmetry, `entity_type`, the organ-versus-source
sample distinction, a processed dataset's parent being a Dataset, and the downloaded bytes
matching the size and md5 the index published.

**Observed 2026-08-27**, so a mismatch is drift to investigate rather than a bug: the uuid,
the donor and sample identifiers, the parent dataset id, `csv files 42`, the 35-byte file and
its contents. Reprocessing can add a revision and change the file inventory without anything
being broken.

## Pitfalls

| symptom | cause | fix |
|---|---|---|
| `405` on the search endpoint | GET is not supported | POST |
| `400 Invalid index name` | index goes in the path | `/v3/portal/search`, `/v3/entities/search`, `/v3/files/search` |
| total is exactly 10000 | Elasticsearch's count ceiling, `relation: gte` | `"track_total_hits": true` |
| only 10 results | that is the default `size` | set `size`, or page with `search_after` |
| `400` when paging deep | `from` and `size` are capped at 10000 | `search_after` with a `uuid.keyword` tiebreaker |
| `term` on an id returns 0 | analysed field, tokenised on dots | use `hubmap_id.keyword` |
| `match` on an id returns dozens | token overlap across ids | use `term` on `.keyword` |
| organ filter returns 0 | values carry laterality | `Kidney (Left)` and `Kidney (Right)`, discovered by aggregation |
| public RNAseq search returns 0 | raw sequence is protected | query the processed type, e.g. `RNAseq [Salmon]` |
| retracted data in results | 296 datasets are `status: Retracted` and still indexed | filter `status.keyword: Published` |
| dataset has no `files` key | inline manifests exist only on `Central Process` datasets | query the `files` index by `dataset_uuid.keyword` |
| file count looks too low | neither file surface is complete | merge both on `rel_path` |
| bare `403` from the assets host | User-Agent contains `curl` or `wget` | send any other User-Agent |
| `401` from the assets host | the dataset is `protected` | check `data_access_level` first |
| `401` on `/descendants` or `/children` | those entity routes need a login | walk downward through the search index |
| `404` from the entity API on a live id | the route answers `HEAD` with `404` | use `GET` |
| ancestors look mis-ordered | the array is not guaranteed hierarchical | rebuild from `sample_category` and `immediate_ancestors` |
| six of seven parents missing | `immediate_ancestors` is a list | iterate it |
