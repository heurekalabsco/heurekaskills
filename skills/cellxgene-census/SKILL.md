---
name: cellxgene-census
description: Query the CZ CELLxGENE Census for versioned public single-cell and spatial transcriptomics data — cell metadata, expression slices, summary counts, source H5AD downloads, and embeddings across organisms, tissues, diseases, and cell types.
category: data
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.2.0
tags: [single-cell, atlas, transcriptomics, spatial, public-data]
covers: [single-cell, scRNA-seq, spatial transcriptomics, gene expression, cell atlas, skeletal muscle aging, skeletal muscle ageing, human, mouse, marmoset, macaque, chimpanzee, brain, blood, kidney, lung, liver, heart, neuron, T cell, B cell, macrophage, COVID-19, Alzheimer disease, Visium, Slide-seqV2, Smart-seq2, h5ad, anndata, TileDB-SOMA]
papers: [PMID:39607691, doi:10.1038/s43587-024-00613-3]
access: [open]
datasets: [https://census.cellxgene.cziscience.com/cellxgene-census/v1/release.json, https://datasets.cellxgene.cziscience.com/85954cff-a901-4de2-bd7f-a23b0077812b.h5ad, https://datasets.cellxgene.cziscience.com/05bd6f1d-bc18-4e6c-bac7-70f4e4ee6db9.h5ad, https://api.cellxgene.cziscience.com/curation/v1/collections?visibility=PUBLIC]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: Census 2025-11-08 LTS (schema 2.4.0, 1,845 datasets) and 2023-05-15 LTS / CELLxGENE Discover curation API v1 (388 public collections, 2,216 datasets) / cellxgene-census 1.17.0 / tiledbsoma 2.3.0 / tiledbsoma-ml 0.1.0 / spatialdata 0.8.0 / anndata 0.13.3.post0 / scanpy 1.12.4 / numpy 2.5.2 / pandas 2.3.3 / Python 3.12.8
  executed: 38
  unverified: 20
  unverified_reason: Every block was executed in document order in one working directory; the 20 outstanding are all expression reads or depend on one — get_anndata over ten thousand to ten million cells, the full-atlas ExperimentDataset stream in Use Case 3, and the scanpy and scanorama workflows built on those slices. Each was attempted and killed at a two-to-three minute cap on a 15 Mbit/s domestic link, where a 2,000-cell fourteen-gene get_anndata takes ten minutes; the binding resource is bandwidth to the Census S3 bucket rather than memory, so an in-region machine unblocks all of them. Two notes on the edges — the get_presence_matrix call inside the size-estimate block is separately confirmed by the Try it, which returns the full 1,845 x 61,497 matrix, and the multi-dataset integration block additionally needs the scanorama install the text names, which this environment did not carry.
---
# CZ CELLxGENE Census

## Overview

The CZ CELLxGENE Census provides programmatic access to a comprehensive, versioned collection of standardized single-cell and spatial transcriptomics data from CZ CELLxGENE Discover. This skill enables efficient querying and analysis of public Census releases without downloading whole datasets first.

The 2025-11-08 stable LTS release declares, in `census_info/summary`:

- **217,768,036 total cells** and **125,463,259 unique cells**
- **1,845 datasets**, whose `dataset_total_cell_count` values sum to exactly that total
- **Human, mouse, marmoset, rhesus macaque, and chimpanzee** in `census_data`; human and mouse in `census_spatial_sequencing`
- **Standardized metadata** (cell types, tissues, diseases, donors) and `raw` plus `normalized` expression layers
- **Source H5AD lookup/download helpers**, pre-calculated summary counts, and hosted embeddings
- **Integration with AnnData, Scanpy, TileDB-SOMA, TileDB-SOMA-ML, and other analysis tools**

Nothing here needs an account or a key.

## What the Census is, and is not

The Census is CZI's own versioned aggregation of **CZ CELLxGENE Discover**, rebuilt on a schedule
and frozen at each release. Every dataset in a release is a Discover dataset. The converse does
not hold, and the gap is the coverage question to settle before concluding a study is not there.

Measured 2026-08-27 against the public Discover catalogue, which needs no key:

| | |
|---|---:|
| public Discover collections / datasets | 388 / 2,216 |
| of those, in Census `2025-11-08` | 1,845, across 313 collections |
| Census datasets absent from Discover | 0 |
| **Discover datasets absent from the Census** | **371** |

Those 371 break down three ways, and the largest has nothing to do with the data:

- **203**, across 55 collections, were published to Discover *after* the 2025-11-08 build. A
  release is frozen at its build date; later deposits appear in later builds, not this one.
- **62** carry an organism no release models — zebrafish, mouse lemur, pig, rat.
- **106** are human or mouse, were on Discover before the build, and still did not make it. The
  inclusion criteria are narrower than Discover's, and assay is the main axis: all 13 `MERFISH`,
  all 10 `snmC-Seq2`, all 6 `snm3C-seq` and all 6 `10x scATAC-seq` datasets in the catalogue are
  absent.

Assay does not decide it on its own, though, and guessing gets this wrong in the confident
direction: 87 of the 107 `10x multiome` datasets on Discover *are* in the release, as are 238 of
310 `Slide-seqV2` and 302 of 350 `Visium`. Check the id, do not infer from the platform.

**It is not a Human Cell Atlas mirror.** 61 Discover collections carry an HCA consortium label,
holding 341 datasets; 28 of those are absent from `2025-11-08`, and 7 of the 61 collections are
absent entirely. Reading "not in the Census" as "not in the HCA" loses studies silently.

So a negative Census result is a statement about one build, not about the field. Ask Discover
before believing it:

```python
import json, urllib.request, cellxgene_census

DISCOVER = "https://api.cellxgene.cziscience.com/curation/v1/collections?visibility=PUBLIC"

def census_coverage(doi, census_version="2025-11-08"):
    """What a Census release actually holds of a published Discover collection."""
    with urllib.request.urlopen(DISCOVER, timeout=120) as r:
        col = next((c for c in json.load(r) if (c.get("doi") or "") == doi), None)
    if col is None:
        raise LookupError(f"{doi} is not a public collection on CELLxGENE Discover")
    on_discover = {d["dataset_id"] for d in col["datasets"]}
    with cellxgene_census.open_soma(census_version=census_version) as census:
        in_release = set(census["census_info"]["datasets"].read().concat().to_pandas().dataset_id)
    return {"collection": col["name"], "url": col["collection_url"],
            "on_discover": len(on_discover), "in_census": len(on_discover & in_release),
            "missing": sorted(on_discover - in_release)}

census_coverage("10.1038/s41586-023-06311-1")    # 55 datasets on Discover, 45 in this release
```

The dataset stubs on that endpoint carry `dataset_id`, `dataset_version_id`, `organism`, `assay`,
`tissue`, `disease` and `suspension_type`. They carry no `title` and no `cell_count` — those keys
are absent from the collections listing rather than empty, so `d.get("title")` quietly returns
`None` and a report keyed on it comes out blank. Take titles and counts from `census_info/datasets`,
or from the single-collection endpoint.

## The declared totals span two collections — every query reaches only one

**This is the trap, and it is silent.** A Census release is two top-level experiment collections:

| collection | 2025-11-08 cells | contents |
|---|---:|---|
| `census_data` | 212,080,059 | dissociated single-cell, five organisms |
| `census_spatial_sequencing` | 5,687,977 | Visium and Slide-seqV2, human and mouse |
| declared `total_cell_count` | **217,768,036** | **both** |

`census_info/summary` and `census_info/summary_cell_counts` — the numbers you would naturally
check an answer against — count **both**. Every query helper defaults to `modality="census_data"`
and reaches only the first. There is no warning, no error, and no hint in the result.

The cost is not evenly spread, which is why one worked example never catches it:

| filter (`is_primary_data == True`) | `census_data` | declared unique | you get |
|---|---:|---:|---:|
| mouse `tissue_general == 'kidney'` | 398,589 | 2,399,190 | **17%** |
| mouse `tissue_general == 'colon'` | 3,509 | 43,445 | **8%** |
| human `tissue_general == 'inguinal part of abdomen'` | 0 | 14,976 | **0%** |
| human `tissue_general == 'kidney'` | 1,463,942 | 2,501,535 | 59% |
| human `cell_type == 'B cell'` | 1,406,088 | 1,475,370 | 95% |
| human `tissue_general == 'brain'` | 28,967,109 | 28,967,109 | 100% |
| human `tissue_general == 'blood'` | 25,872,063 | 25,872,063 | 100% |

Brain and blood are exact because no spatial dataset covers them. Twenty-three human and six
mouse `tissue_general` labels are not exact, and one reads as if the tissue is absent entirely.

`get_obs`, `get_var` and `get_anndata` all take `modality=`; `axis_query` is reached through the
collection you index. Query both and add, or say in writing which one you meant:

```python
def n_cells(census, organism, filt, modality="census_data"):
    return len(cellxgene_census.get_obs(census, organism, value_filter=filt,
                                        column_names=["soma_joinid"], modality=modality))

F = "tissue_general == 'kidney' and is_primary_data == True"
n_cells(census, "mus_musculus", F)                                  # 398,589
n_cells(census, "mus_musculus", F, "census_spatial_sequencing")     # 2,000,601

adata = cellxgene_census.get_anndata(census=census, organism="Homo sapiens",
                                     obs_value_filter="dataset_id == '4cceac62-9513-42a4-90e5-2878dbb0192c'",
                                     modality="census_spatial_sequencing")
```

The two collections do not share a gene space — human `census_data` has 61,497 features and
human `census_spatial_sequencing` has 43,386 — so concatenate on the intersection, not blindly.

## When to Use This Skill

This skill should be used when:
- Querying single-cell expression data by cell type, tissue, or disease
- Exploring available single-cell datasets and metadata
- Training machine learning models on single-cell data
- Performing large-scale cross-dataset analyses
- Integrating Census data with scanpy or other analysis frameworks
- Computing statistics across millions of cells
- Accessing pre-calculated embeddings or model predictions

## Installation and Setup

Install the Census API:
```bash
uv pip install "cellxgene-census==1.17.*"
```

Reading data needs nothing else — no account, no key, no cloud credentials. `1.17.0` opens
every release currently listed, from `2023-05-15` to `2025-11-08`.

For spatial workflows. `to_spatialdata()` warns and then raises `ModuleNotFoundError: No module
named 'spatialdata'` without this — the warning alone does not stop the call:
```bash
uv pip install "cellxgene-census[spatial]==1.17.*" "spatialdata[extra]>=0.2.5"
```

For PyTorch model training, use TileDB-SOMA-ML. The old `cellxgene_census.experimental.ml` loaders are deprecated:

```bash
uv pip install "cellxgene-census==1.17.*" tiledbsoma-ml
```

## Core Workflow Patterns

Eight patterns, each with code, are in
[references/core_workflow_patterns.md](references/core_workflow_patterns.md):

1. **Opening the Census** — always pin `census_version` so an analysis stays reproducible.
2. **Exploring Census information** — available datasets, cell counts, and summary tables.
3. **Querying expression data** — small to medium scale into an `AnnData`.
4. **Large-scale queries** — out-of-core processing when the slice will not fit in memory.
5. **Machine learning with PyTorch** — the Census data loaders.
6. **Spatial Census data** — accessing spatial assays.
7. **Integration with Scanpy** — handing a Census slice to a standard Scanpy workflow.
8. **Multi-dataset integration** — combining datasets and handling batch effects.

## Key Concepts and Best Practices

### Always Filter for Primary Data
Unless analyzing duplicates, always include `is_primary_data == True` in queries to avoid counting cells multiple times:
```python
obs_value_filter="cell_type == 'B cell' and is_primary_data == True"
```

`is_primary_data == True` matches `summary_cell_counts.unique_cell_count`; no filter at all
matches `total_cell_count`. Both of those declared totals include the spatial collection, so the
`B cell` filter above returns 1,406,088 from `census_data` against 1,475,370 declared — see
*The declared totals span two collections*.

One dataset can be **entirely** non-primary: all 146 cells of
`0895c838-e550-48a3-a777-dbcd35d30272` carry `is_primary_data == False`, so adding the filter to
a single-dataset query returns an empty result with no error. Deduplicate across datasets; do
not assume any one dataset survives it.

**The same thing makes `dataset_total_cell_count` a bad way to size a collection.** Depositors
routinely ship compartment or subset views of one object alongside it, each with its own
`dataset_id` and its own declared count, all flagged non-primary. Ten collections, chosen for
spread — the most datasets, the most cells, the two smallest, and four named atlases — checked
on 2026-08-27 against `2025-11-08`:

| collection | datasets | Σ `dataset_total_cell_count` | primary cells | ratio |
|---|---:|---:|---:|---:|
| Human Brain Cell Atlas v1.0 | 138 | 10,107,657 | 3,264,757 | **3.1x** |
| Mouse embryonic development timelapse | 31 | 34,324,221 | 11,441,407 | **3.0x** |
| Tabula Sapiens | 35 | 3,408,625 | 1,136,218 | **3.0x** |
| Tabula Muris Senis | 42 | 1,068,639 | 356,213 | **3.0x** |
| Human skeletal muscle ageing atlas | 8 | 519,615 | 279,690 | **1.9x** |
| Slide-seqV2 disease neighbourhoods | 128 | 2,920,689 | 2,920,689 | 1.0x |
| Whole mouse embryo spatial maps | 74 | 533,615 | 533,615 | 1.0x |
| Age-related immune dynamics | 8 | 13,789,548 | 13,789,548 | 1.0x |
| Smoking-induced bronchial heterogeneity | 1 | 796 | 796 | 1.0x |
| Lymphatic endothelial cells in lymph nodes | 1 | 893 | 893 | 1.0x |

Five of the ten over-count, by up to 3.1x, and nothing distinguishes them from the outside: the
datasets frame has no flag for "this is a view of another dataset here". Count through `obs` with
`is_primary_data == True`, never by summing the declared column.

The same sweep found the other half of the problem. The Slide-seqV2 collection reconciles only
because both organisms were read: 920,088 of its cells are human and 2,000,601 are mouse, all in
`census_spatial_sequencing`. A single-organism, single-modality read of it returns a third of the
collection and reports no error.

### Specify Census Version for Reproducibility
Always specify the Census version in production analyses:
```python
census = cellxgene_census.open_soma(census_version="2025-11-08")
```

### `soma_joinid` Is Release-Local and Gets Reassigned
This is the version trap with teeth, because it fails silently. `soma_joinid` is a row offset in
one build, not an identity. Between `2023-05-15` and `2025-11-08`, **551 of the 553 datasets
present in both releases have a different dataset `soma_joinid`** — only 2 of 562 ids still
point at the same dataset. Cell ids move too: the first cell of dataset
`00476f9f-ebc1-4b72-b541-32f912ce36ea` is `soma_joinid` 20,321,147 in the 2023 build and
1,971,589 in the 2025 one, with the same 10,099 cells in both.

So a saved `soma_joinid` list — from a size estimate, an `obs_coords` subsample, a cached
index — reads **different cells** against a different release, with no error and no warning.

- Persist `dataset_id` and `observation_joinid`, which are stable, not `soma_joinid`.
- `observation_joinid` does not exist in pre-2025 releases, so a workflow that must span old and
  new builds has to key on `dataset_id` plus the source H5AD's own barcodes.
- Re-derive `soma_joinid` inside the release you are querying, every time.

### Estimate Query Size Before Loading
`get_obs` does not truncate and does not cap rows. Unfiltered human brain is 48,581,856 cells
and it returns all 48,581,856 in seconds, in about 2.5 GB of RSS, with one column selected. So
counting first is cheap and reliable, and it is the only thing standing between you and a
`get_anndata` that tries to materialise millions of cells:

```python
n_cells = len(cellxgene_census.get_obs(
    census, "homo_sapiens",
    value_filter="tissue_general == 'brain' and is_primary_data == True",
    column_names=["soma_joinid"],          # one column — do not read the whole obs frame
))
print(f"Query will return {n_cells:,} cells")
```

Above roughly 100k cells, move to `axis_query`, or subsample. **A `var_value_filter` alone does
not save you.** `get_anndata` carries a multi-gigabyte fixed cost whatever the slice — a
3,364-cell, three-gene query peaked at 4.0 GB of RSS and took 319 s — and grows from there with
the **cells**, not the genes: 224,666 cells on those same three genes passed 6 GB, and 437,482
cells on sixteen genes was past 9 GB and still going after nineteen minutes. Several filters
that read as ordinary examples are far over that line in this release: `tissue_general in
['lung','liver','kidney']` is 9,257,011 primary cells, `cell_type == 'neuron'` is 3,858,369, and
`cell_type == 'macrophage' and tissue_general in ['lung','liver','brain']` is 807,855.

To subsample, take the `soma_joinid`s from `get_obs` and pass them back as `obs_coords`. Use the
ids within the same open release and do not persist them — see the section above.

```python
import numpy as np

ids = cellxgene_census.get_obs(census, "homo_sapiens", value_filter=F,
                               column_names=["soma_joinid"]).soma_joinid.to_numpy()
keep = np.sort(np.random.default_rng(0).choice(ids, size=50_000, replace=False))
adata = cellxgene_census.get_anndata(census=census, organism="Homo sapiens", obs_coords=keep)
```

### An Unknown Value Returns Nothing; an Unknown Column Raises
The asymmetry matters because only one half is visible:

```python
# Not a value in this release's `tissue` vocabulary -> empty DataFrame, no error, no warning
cellxgene_census.get_obs(census, "homo_sapiens",
                         value_filter="tissue == 'peripheral blood mononuclear cell'")   # 0 rows

# Not a column -> SOMAError: 'Column tissue_generall does not exist in schema'
cellxgene_census.get_obs(census, "homo_sapiens", value_filter="tissue_generall == 'brain'")
```

Take the vocabulary from the release rather than from memory. `summary_cell_counts` carries
every `assay`, `cell_type`, `disease`, `self_reported_ethnicity`, `sex`, `suspension_type`,
`tissue` and `tissue_general` label with its declared counts, so it is both the vocabulary and
the ground truth — **for seven of those eight**.

`suspension_type` is the exception, and it fails in the opposite direction from the spatial
bug this skill is about. The table lists a single label, `cell`, carrying the organism totals;
`nucleus` and `na` are absent, and `nucleus` is another 37.7M primary human cells. Read the
vocabulary for that one field off the obs enumeration instead, or you will conclude `nucleus`
is not a legal value and over-count `cell`. Checked 2026-08-19 on `2025-11-08`:
`summary_cell_counts` gives `['cell']` where obs gives three values.

For the other seven:

```python
counts = census["census_info"]["summary_cell_counts"].read().concat().to_pandas()
h = counts[counts.organism.eq("homo_sapiens")]
sorted(h[h.category.eq("tissue_general")].label)   # 71 labels; 'peripheral blood mononuclear cell' is not one
```

### Use tissue_general for Broader Groupings
The `tissue_general` field provides coarser categories than `tissue` — 71 human labels against
423 — which is useful for cross-tissue analyses. **The two vocabularies are not
interchangeable**, and putting a label in the wrong one returns zero cells rather than an error.
`thymus` and `cerebral cortex` are `tissue` labels with no `tissue_general` counterpart, so
`tissue_general == 'thymus'` is silently empty; `cortex` exists in both.
```python
# Broader grouping
obs_value_filter="tissue_general == 'immune system'"

# Specific tissue, taken from the 423 labels this release actually carries
obs_value_filter="tissue == 'blood'"
```

### `disease` Holds Multi-Labels, So `==` Is a Subset
A cell donated by someone with several recorded conditions carries all of them in one string,
` || `-delimited. Equality matches the single-condition label only:

```python
# 608,235 primary cells
"disease == 'Alzheimer disease' and is_primary_data == True"
```

The Census declares **2,736,680** primary Alzheimer cells across the 18 labels that mention the
disease — `dementia || Alzheimer disease` alone holds 1,486,303. Equality hands back 22%. There
is no `contains` operator in the filter grammar, so enumerate the labels and use `in`:

```python
d = counts[counts.organism.eq("homo_sapiens") & counts.category.eq("disease")]
labels = d.loc[d.label.str.contains("Alzheimer disease"), "label"].tolist()
cellxgene_census.get_obs(census, "homo_sapiens",
                         value_filter=f"disease in {labels} and is_primary_data == True",
                         column_names=["soma_joinid"])          # 2,736,680 — matches the declared sum
```

`disease == 'COVID-19'` happens to be exact in this release, because no multi-label mentions it.
That is luck, not a rule — check before relying on it.

### Select Only Needed Columns
Minimize data transfer by specifying only required metadata columns:
```python
obs_column_names=["cell_type", "tissue_general", "disease"]  # Not all columns
```

The columns come back as pandas **categoricals carrying the release's whole dictionary**, not
just the values present. A small slice's `cell_type` still carries all 898 human levels present in `census_data`, and a
200-cell two-tissue slice still has all 36 mouse `tissue_general` levels.

This is not merely untidy — it **breaks downstream tools**. `sc.tl.rank_genes_groups(adata,
groupby="tissue_general")` on that 200-cell slice raises `ValueError: Could not calculate
statistics for groups forelimb, reproductive system, brain, … since they only contain one
sample`, naming 34 tissues the slice does not contain. Drop the unused levels first:

```python
adata.obs["tissue_general"] = adata.obs.tissue_general.cat.remove_unused_categories()  # 36 -> 2
adata.obs.groupby("cell_type", observed=True).size()      # observed=True does the same for a groupby
```

### Check Dataset Presence for Gene-Specific Queries
When analyzing specific genes, verify which datasets measured them. **`get_presence_matrix`
takes no gene filter** — its signature is `(census, organism, measurement_name="RNA",
modality="census_data")`, and passing `var_value_filter=` is a `TypeError`. It returns the whole
`n_datasets x n_genes` boolean matrix (1,845 x 61,497 for human here), row-indexed by the
dataset's `soma_joinid` and column-indexed by the gene's. Slice it yourself:

```python
import numpy as np

var = cellxgene_census.get_var(census, "homo_sapiens", column_names=["soma_joinid", "feature_name"])
presence = cellxgene_census.get_presence_matrix(census, "homo_sapiens")   # (1845, 61497)

idx = var.loc[var.feature_name.isin(["CD4", "CD8A"]), "soma_joinid"].to_numpy()
both = np.asarray(presence[:, idx].sum(axis=1)).ravel() == len(idx)       # 1,067 of 1,845 datasets

datasets = census["census_info"]["datasets"].read().concat().to_pandas()
usable = datasets.loc[datasets.soma_joinid.isin(np.where(both)[0]), "dataset_id"].tolist()
```

### Two-Step Workflow: Explore Then Query
First explore metadata to understand available data, then query expression:
```python
# Step 1: Explore what's available
metadata = cellxgene_census.get_obs(
    census, "homo_sapiens",
    value_filter="disease == 'COVID-19' and is_primary_data == True",
    column_names=["cell_type", "tissue_general"]
)
print(metadata.value_counts())

# Step 2: Query based on findings
adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",
    obs_value_filter="disease == 'COVID-19' and cell_type == 'T cell' and is_primary_data == True",
)
```

## Available Metadata Fields

### Cell Metadata (obs)
Key fields for filtering:
- `cell_type`, `cell_type_ontology_term_id`
- `tissue`, `tissue_general`, `tissue_ontology_term_id`
- `disease`, `disease_ontology_term_id`
- `assay`, `assay_ontology_term_id`
- `donor_id`, `sex`, `self_reported_ethnicity`
- `development_stage`, `development_stage_ontology_term_id`
- `dataset_id`
- `is_primary_data` (Boolean: True = unique cell)
- `tissue_type`, `suspension_type`, `observation_joinid`
- `raw_sum`, `nnz`, `raw_mean_nnz`, `raw_variance_nnz`, `n_measured_vars` (per-cell summaries)

Spatial observations carry three more: `in_tissue`, `array_row`, `array_col`.

**There is no `organism` column.** Organism is the collection key, not a filterable field —
`value_filter="organism == 'Homo sapiens'"` raises `SOMAError: 'Column organism does not exist
in schema'`. Human and mouse obs schemas are otherwise identical, so a filter written for one
works unchanged on the other. Confirm the organisms a release carries with
`list(census["census_data"].keys())` and `list(census["census_spatial_sequencing"].keys())`.

### Gene Metadata (var)
- `feature_id` (Ensembl gene ID, e.g., "ENSG00000161798")
- `feature_name` (Gene symbol, e.g., "FOXP2")
- `feature_type`
- `feature_length` (Gene length in base pairs)
- `nnz`, `n_measured_obs` (availability summaries useful for checking sparsity and coverage)

## Reference Documentation

This skill includes detailed reference documentation:

### references/census_schema.md
Comprehensive documentation of:
- Census data structure and organization
- All available metadata fields
- Value filter syntax and operators
- SOMA object types
- Data inclusion criteria

**When to read:** When you need detailed schema information, full list of metadata fields, or complex filter syntax.

### references/common_patterns.md
Examples and patterns for:
- Exploratory queries (metadata only)
- Small-to-medium queries (AnnData)
- Large queries (out-of-core processing)
- PyTorch integration
- Spatial Census access patterns
- Scanpy integration workflows
- Multi-dataset integration
- Best practices and common pitfalls

**When to read:** When implementing specific query patterns, looking for code examples, or troubleshooting common issues.

## Common Use Cases

### Use Case 1: Explore Cell Types in a Tissue
Metadata only, so 6,167,731 cells is fine. Lung has 275,274 spatial cells too, so read both if
the answer is meant to be the tissue rather than the dissociated half of it.
```python
with cellxgene_census.open_soma(census_version="2025-11-08") as census:
    F = "tissue_general == 'lung' and is_primary_data == True"
    cells = cellxgene_census.get_obs(census, "homo_sapiens", value_filter=F,
                                     column_names=["cell_type"])
    spatial = cellxgene_census.get_obs(census, "homo_sapiens", value_filter=F,
                                       column_names=["cell_type"],
                                       modality="census_spatial_sequencing")
    print(cells["cell_type"].value_counts())
    print(f"{len(cells):,} dissociated + {len(spatial):,} spatial")
```

### Use Case 2: Query Marker Gene Expression
`cell_type in ['T cell', 'B cell'] and is_primary_data == True` is 2,673,107 cells; adding
`tissue_general == 'lung'` still leaves 224,666, and that slice passed 6 GB of RSS on three
genes. Narrow the **cells**, not just the genes. The same filter over `bone marrow` is 3,364.
```python
with cellxgene_census.open_soma(census_version="2025-11-08") as census:
    adata = cellxgene_census.get_anndata(
        census=census,
        organism="Homo sapiens",
        var_value_filter="feature_name in ['CD4', 'CD8A', 'CD19']",
        obs_value_filter="cell_type in ['T cell', 'B cell'] and tissue_general == 'bone marrow' "
                         "and is_primary_data == True",
        obs_column_names=["cell_type", "assay", "donor_id"],
    )                                                  # 3,364 x 3 — 2,020 B cells, 1,344 T cells
```
Even that took 319 s and 4.0 GB. `get_anndata` is never cheap; it is only ever cheaper.
Size varies wildly by tissue for the same filter: spleen 42,196, kidney 47,245, lymph node
115,795, liver 168,816 — and `tissue_general == 'thymus'` is 0, because thymus is a `tissue`
label and not a `tissue_general` one. Count before you load, every time.

### Use Case 3: Train Cell Type Classifier
`is_primary_data == True` with nothing else is all 96,591,226 primary human cells in
`census_data` — a real full-atlas run, not a demo. It streams, so it does not blow memory, but
add a tissue or assay filter unless that is genuinely the training set you want. The loader
reaches `census_data` only, so a classifier trained this way has seen no spatial cells.
```python
import tiledbsoma as soma
from tiledbsoma_ml import ExperimentDataset, experiment_dataloader

with cellxgene_census.open_soma(census_version="2025-11-08") as census:
    experiment = census["census_data"]["homo_sapiens"]
    with experiment.axis_query(
        measurement_name="RNA",
        obs_query=soma.AxisQuery(value_filter="is_primary_data == True"),
    ) as query:
        dataset = ExperimentDataset(
            query=query,
            layer_name="raw",
            obs_column_names=["cell_type"],
            batch_size=128,
            shuffle=True,
        )
        dataloader = experiment_dataloader(dataset)

        for X, obs in dataloader:
            labels = obs["cell_type"]
            # Training logic
            pass
```

### Use Case 4: Cross-Tissue Analysis
That obs filter is 807,855 primary cells — eight times the `get_anndata` guidance above — and
with no `var_value_filter` it asks for 807,855 x 61,497. Cutting to lung and liver still leaves
437,482, and a 16-gene panel does not rescue it, because the cost is in the cells. Count, then
subsample by `soma_joinid`, then load.
```python
import numpy as np, scanpy as sc

PANEL = ["MRC1", "MARCO", "CD5L", "TIMD4", "VSIG4", "SIGLEC1", "SPP1", "APOE",
         "C1QA", "C1QB", "FABP4", "TREM2", "LYVE1", "FOLR2", "CD163", "MSR1"]
F = ("cell_type == 'macrophage' and tissue_general in ['lung', 'liver'] "
     "and is_primary_data == True")

with cellxgene_census.open_soma(census_version="2025-11-08") as census:
    ids = cellxgene_census.get_obs(census, "homo_sapiens", value_filter=F,
                                   column_names=["soma_joinid"]).soma_joinid.to_numpy()
    keep = np.sort(np.random.default_rng(0).choice(ids, size=50_000, replace=False))

    adata = cellxgene_census.get_anndata(
        census=census,
        organism="Homo sapiens",
        var_value_filter=f"feature_name in {PANEL}",
        obs_coords=keep,                                        # not obs_value_filter
        obs_column_names=["tissue_general", "assay", "donor_id"],
    )                                                           # 50,000 x 16

    # Without this, rank_genes_groups raises: the categorical still has all 70 tissues
    adata.obs["tissue_general"] = adata.obs.tissue_general.cat.remove_unused_categories()

    sc.pp.normalize_total(adata, target_sum=1e4); sc.pp.log1p(adata)
    sc.tl.rank_genes_groups(adata, groupby="tissue_general", method="wilcoxon")
```
`obs_coords` takes `soma_joinid` values, so the filter is applied once, in the cheap metadata
pass, and the expensive pass reads only the rows you kept. `assay` and `donor_id` are in
`obs_column_names` for a reason: the tissues are not balanced across assays or donors, so the
top of that ranking is partly a batch effect. Check the crosstab before believing it.

## Get the files

Two routes end in files on disk, and they answer different questions.

**Know the size before you fetch.** In a twelve-dataset spot check of this release the source
H5ADs spanned 9 MB to 20 GB, and neither `download_source_h5ad` nor the datasets frame tells you
which you are about to pull. `dataset_total_cell_count` is a poor proxy: one 4,992-cell dataset in
that sample was 570 MB and another was 72 MB, while a 3,799-cell one was 9 MB. Each row carries a
`dataset_version_id`, which is the basename of a plain HTTPS object, so a `HEAD` gives the exact
byte count with nothing downloaded:

```python
import urllib.request, cellxgene_census

def source_h5ad_sizes(dataset_ids, version="2025-11-08"):
    """(title, cells, bytes, url) per dataset, before anything is fetched."""
    with cellxgene_census.open_soma(census_version=version) as census:
        frame = census["census_info"]["datasets"].read().concat().to_pandas().set_index("dataset_id")
    out = []
    for did in dataset_ids:
        row = frame.loc[did]
        url = f"https://datasets.cellxgene.cziscience.com/{row.dataset_version_id}.h5ad"
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as r:
            out.append((row.dataset_title, int(row.dataset_total_cell_count),
                        int(r.headers["Content-Length"]), url))
    return out

for title, cells, nbytes, _ in source_h5ad_sizes([
        "0895c838-e550-48a3-a777-dbcd35d30272",   # 146 cells
        "b3c9904b-2ffd-4038-8620-ee1c5b072e9c"]): # 183,161 cells
    print(f"{cells:>8,} cells  {nbytes/1e6:>8.1f} MB  {title}")
```

```
     146 cells       5.4 MB  Healthy human liver: B cells
 183,161 cells    1182.3 MB  Human muscle cells and nuclei
```

That URL is the same object `download_source_h5ad` writes, and the same one the `citation` string
names, so the number is the download you are about to start. `get_source_h5ad_uri` returns the
`s3://` form instead, which no plain HTTP client can `HEAD`.

**The source H5AD** is the dataset as CELLxGENE Discover curated it, with the full gene space
and every obs column — not the Census's harmonised subset. Check what lands against the
`dataset_total_cell_count` the release declares rather than assuming they agree; that is what
the `assert` below is for. Both datasets fetched here matched exactly.

```python
import json, os, anndata as ad, cellxgene_census

VERSION, OUT = "2025-11-08", "Data/cellxgene-census"

def fetch_source_h5ads(dataset_ids, outdir=OUT, version=VERSION):
    """Source H5ADs on disk, each checked against the cell count the release declares."""
    os.makedirs(outdir, exist_ok=True)
    with cellxgene_census.open_soma(census_version=version) as census:
        frame = census["census_info"]["datasets"].read().concat().to_pandas().set_index("dataset_id")
    manifest = []
    for did in dataset_ids:
        if did not in frame.index:
            raise KeyError(f"{did} is not in Census {version}. get_source_h5ad_uri raises the same "
                           f"KeyError('Unknown dataset_id') for a withdrawn dataset and for a typo — "
                           f"check an older LTS release before assuming the id is wrong.")
        row, dest = frame.loc[did], os.path.join(outdir, f"{did}.h5ad")
        cellxgene_census.download_source_h5ad(did, to_path=dest, census_version=version,
                                              progress_bar=False)
        n_obs = ad.read_h5ad(dest, backed="r").n_obs
        assert n_obs == row.dataset_total_cell_count, \
            f"{did}: {n_obs} cells on disk, {row.dataset_total_cell_count} declared"
        manifest.append({"dataset_id": did, "title": row.dataset_title, "path": dest,
                         "cells": int(n_obs), "bytes": os.path.getsize(dest),
                         "citation": row.citation})
        print(f"  {n_obs:>7,} cells  {os.path.getsize(dest):>9,} B  {row.dataset_title[:46]}")
    with open(os.path.join(outdir, "manifest.json"), "w") as fh:
        json.dump({"census_version": version, "datasets": manifest}, fh, indent=2)
    return manifest

fetch_source_h5ads([
    "0895c838-e550-48a3-a777-dbcd35d30272",   # human liver B cells — every cell is_primary_data False
    "4eb29386-de81-452f-b3c0-e00844e8c7fd",   # Slide-seqV2 mouse — lives in census_spatial_sequencing
])
```

```
      146 cells  5,382,132 B  Healthy human liver: B cells
   10,888 cells  4,396,363 B  Spatial transcriptomics in mouse: Puck_191112_
```

The second of those is the reminder: a spatial dataset downloads from the same helper, but no
`census_data` query will ever find its cells.

**A cross-dataset slice** is what the Census is for — a filter no single H5AD answers. Write the
`AnnData` straight out, and pass `modality=` when the cells are spatial:

```python
with cellxgene_census.open_soma(census_version=VERSION) as census:
    adata = cellxgene_census.get_anndata(
        census=census, organism="Mus musculus",
        obs_value_filter="tissue_general == 'optic cup' and is_primary_data == True")
    adata.write_h5ad(f"{OUT}/optic_cup.h5ad")                       # 146 x 53,384

    sp = cellxgene_census.get_anndata(
        census=census, organism="Homo sapiens",
        obs_value_filter="dataset_id == '4cceac62-9513-42a4-90e5-2878dbb0192c'",
        modality="census_spatial_sequencing")
    sp.write_h5ad(f"{OUT}/thymus_visium.h5ad")                      # 4,992 x 43,386
```

Every dataset carries a `citation` string in the datasets frame — publication DOI, dataset
version URL and collection URL. Keep it with the file; it is the attribution the depositors are
owed. Terms are per-collection on CELLxGENE Discover, so check the collection page before
redistributing.

### Worked example: one published collection, on disk

The human skeletal muscle ageing atlas (Kedlian et al., *Nature Aging* 2024,
`10.1038/s43587-024-00613-3`) is collection `2d40e6a7-f2fd-49ba-9db9-6b97e4c6dad5`. It is worth
walking through because the obvious reading of it is wrong three ways, and each way generalises.

| dataset_id | title | declared cells | source H5AD |
|---|---|---:|---:|
| `9038a71d-…` | MuSCs | 17,528 | 142.9 MB |
| `f854421b-…` | Endothelium and SMC | 19,317 | 168.7 MB |
| `32e8a3d7-…` | Immune Cells | 20,321 | 139.1 MB |
| `1851b6ab-…` | Fibroblasts and Schwann cells | 20,611 | 194.5 MB |
| `e1cc3162-…` | Myofiber (nuclei) | 74,626 | 382.6 MB |
| `551ad2bc-…` | Myofiber (cells and nuclei) | 87,522 | 452.5 MB |
| `bedee313-…` | **Mouse** muscle cells and nuclei | 96,529 | 502.8 MB |
| `b3c9904b-…` | Human muscle cells and nuclei | 183,161 | 1,182.3 MB |

- **Summing `dataset_total_cell_count` gives 519,615; the collection holds 279,690 cells.** Six of
  the seven human datasets are compartment views of the seventh, and every cell in them carries
  `is_primary_data == False`. This is not peculiar to this study — see the sweep below.
- **One dataset in a collection called "Human skeletal muscle ageing atlas" is mouse.** No
  `homo_sapiens` query reaches its 96,529 cells, and `census_info/datasets` has no organism
  column to warn you. Read the organism off `obs`, or off the Discover stub.
- **The human primary count reconciles with the paper exactly.** 183,161 = 90,902 single cells +
  92,259 single nuclei from 17 donors, which is what the abstract reports; `suspension_type` is
  the column that splits them. That is the check worth running on any collection whose paper
  states a number — and it only works against the primary subset.

Landing a named tissue and cell type from it. Count first, subsample by `soma_joinid`, then read
expression for the rows you kept — `get_anndata` costs by the cell, so a 20,215-cell request with
a 14-gene panel is not a small query:

```python
import numpy as np, cellxgene_census

KEDLIAN = "b3c9904b-2ffd-4038-8620-ee1c5b072e9c"          # the primary human object
PANEL   = ["PAX7", "MYF5", "MYOD1", "MKI67", "CDKN1A", "CDKN2A", "MYH7", "MYH2",
           "DES", "TTN", "PDGFRA", "PTPRC", "PECAM1", "CD68"]
F = (f"dataset_id == '{KEDLIAN}' and cell_type == 'skeletal muscle satellite stem cell' "
     "and is_primary_data == True")

with cellxgene_census.open_soma(census_version=VERSION) as census:
    ids = cellxgene_census.get_obs(census, "homo_sapiens", value_filter=F,
                                   column_names=["soma_joinid"]).soma_joinid.to_numpy()
    keep = np.sort(np.random.default_rng(0).choice(ids, size=2000, replace=False))
    adata = cellxgene_census.get_anndata(
        census=census, organism="Homo sapiens",
        var_value_filter=f"feature_name in {PANEL}", obs_coords=keep,
        obs_column_names=["cell_type", "development_stage", "donor_id", "sex", "suspension_type"])
    for c in adata.obs.columns:                            # drop the release-wide dictionaries
        if str(adata.obs[c].dtype) == "category":
            adata.obs[c] = adata.obs[c].cat.remove_unused_categories()
    adata.write_h5ad(f"{OUT}/kedlian_muscle_satellite_cells.h5ad")
```

That lands `2000 x 14` in 193,276 bytes, covering all six development stages and 16 of the 17
donors, and it took ten minutes on a 15 Mbit/s link — for two thousand cells and fourteen genes.
`get_anndata` is the expensive step in every one of these workflows; budget for it.

`development_stage` is how age reaches you here: this release bins the 17 donors into
`young adult stage` and the third, fourth, sixth, seventh and eighth `decade stage`, not into
years. There is no numeric age column, so an age model has to be built on those bins or on
`donor_id` joined to the paper's own metadata.

## Try it

A self-contained check against the 2025-11-08 stable LTS, plus one read of the oldest LTS build
to show that `soma_joinid` moves. Public data, no account, no key. Runs cold in an empty
directory and leaves one file behind: `kedlian_muscle_200.h5ad`, a 200-cell, 14-gene slice of the
human skeletal muscle ageing atlas.

Everything else is metadata — row identifiers, one presence matrix, and three non-zero
expression values. **Nothing here reads a large expression slice, and it should not**: the Census
is 218 million cells, and `get_anndata` costs by the cell whatever gene filter you pass.

**Cost.** Order of magnitude: tens of minutes and a few hundred megabytes over the wire. The run
whose output is quoted below took 22 minutes and peaked at 4.4 GB of RSS on a domestic connection
measuring about 15 Mbit/s. It is bandwidth-bound rather than compute-bound — seven of those 22
minutes were CPU — so a fast link is much quicker. The presence matrix (1,845 x 61,497) and the
200-cell `get_anndata` dominate, and nothing is cached between runs. Run it on its own; see
*`Response checksums mismatch`* under Troubleshooting.

**Data** — Census releases `2025-11-08` (the current `stable`) and `2023-05-15` (the oldest LTS),
both listed here:

    https://census.cellxgene.cziscience.com/cellxgene-census/v1/release.json

Openly accessible; the directory flags both as LTS with `do_not_delete`. The slice comes from
CELLxGENE Discover collection `2d40e6a7-f2fd-49ba-9db9-6b97e4c6dad5`, the atlas published as
Kedlian et al., *Nature Aging* 2024, `10.1038/s43587-024-00613-3`; terms are per-collection on
Discover, so check the collection page before redistributing what lands. Last confirmed
reachable 2026-08-27.

```bash
uv pip install "cellxgene-census==1.17.*"
```

```python
import os, numpy as np, cellxgene_census, tiledbsoma as soma

VERSION = "2025-11-08"          # the current stable LTS

def n_cells(census, organism, filt, modality="census_data"):
    """Cells matching a filter. `modality` selects the collection — this is the trap."""
    return len(cellxgene_census.get_obs(census, organism, value_filter=filt,
                                        column_names=["soma_joinid"], modality=modality))

with cellxgene_census.open_soma(census_version=VERSION) as census:
    # 1. What the release declares about itself.
    summary  = census["census_info"]["summary"].read().concat().to_pandas().set_index("label")["value"]
    counts   = census["census_info"]["summary_cell_counts"].read().concat().to_pandas()
    datasets = census["census_info"]["datasets"].read().concat().to_pandas()
    declared = lambda org, cat, lab: int(counts[counts.organism.eq(org) & counts.category.eq(cat)
                                                & counts.label.eq(lab)].unique_cell_count.iloc[0])

    # 2. Spatial lives in its own collection; the declared totals count both.
    data_obs    = sum(census["census_data"][o].obs.count for o in census["census_data"].keys())
    spatial_obs = sum(census["census_spatial_sequencing"][o].obs.count
                      for o in census["census_spatial_sequencing"].keys())

    # 3. The counter-example: mouse kidney is mostly Slide-seqV2.
    F = "tissue_general == 'kidney' and is_primary_data == True"
    mk_data    = n_cells(census, "mus_musculus", F)
    mk_spatial = n_cells(census, "mus_musculus", F, "census_spatial_sequencing")
    mk_declared = declared("mus_musculus", "tissue_general", "kidney")

    # 4. A tissue that reads as absent from census_data entirely.
    G = "tissue_general == 'inguinal part of abdomen' and is_primary_data == True"
    ig_data    = n_cells(census, "homo_sapiens", G)
    ig_spatial = n_cells(census, "homo_sapiens", G, "census_spatial_sequencing")

    # 5. An unknown VALUE returns an empty frame; an unknown COLUMN raises.
    pbmc = n_cells(census, "homo_sapiens", "tissue == 'peripheral blood mononuclear cell'")
    try:
        n_cells(census, "homo_sapiens", "tissue_generall == 'brain'"); bad_column = "no error"
    except Exception as e:
        bad_column = type(e).__name__

    # 6. `disease` holds ' || '-delimited multi-labels, so `==` is a subset.
    alz_eq  = n_cells(census, "homo_sapiens", "disease == 'Alzheimer disease' and is_primary_data == True")
    d       = counts[counts.organism.eq("homo_sapiens") & counts.category.eq("disease")]
    alz_lab = d.loc[d.label.str.contains("Alzheimer disease"), "label"].tolist()
    alz_all = int(d.loc[d.label.str.contains("Alzheimer disease"), "unique_cell_count"].sum())
    alz_in  = n_cells(census, "homo_sapiens", f"disease in {alz_lab} and is_primary_data == True")

    # 7. X("raw").tables() yields stored non-zeros only — dividing by len() is not the mean.
    with census["census_data"]["mus_musculus"].axis_query(
        measurement_name="RNA",
        obs_query=soma.AxisQuery(value_filter="tissue_general == 'optic cup' and is_primary_data == True"),
        var_query=soma.AxisQuery(value_filter="feature_name in ['Rho', 'Sox2', 'Pax6']"),
    ) as q:
        nnz, total, cells, genes = 0, 0.0, q.n_obs, q.n_vars
        for batch in q.X("raw").tables():
            v = batch["soma_data"].to_numpy(); nnz += len(v); total += float(v.sum())
    mean_nonzero, mean_true = total / nnz, total / (cells * genes)

    # 8. get_presence_matrix takes no gene filter, and returns datasets x ALL genes.
    try:
        cellxgene_census.get_presence_matrix(census, "homo_sapiens", var_value_filter="feature_name == 'CD4'")
        presence_err = "accepted (unexpected)"
    except TypeError:
        presence_err = "TypeError"
    presence = cellxgene_census.get_presence_matrix(census, "homo_sapiens")

    # 9. A withdrawn dataset_id and a nonsense one fail identically.
    def uri_err(d):
        try:
            cellxgene_census.get_source_h5ad_uri(d, census_version=VERSION); return "found"
        except KeyError as e:
            return f"KeyError {e}"
    withdrawn = uri_err("0c774045-26a7-40f8-9b07-6742d3c771c0")   # in the 2023-05-15 LTS, gone from this one
    nonsense  = uri_err("00000000-0000-0000-0000-000000000000")

    # 10. A published collection, reconciled: Kedlian et al. 2024, human skeletal muscle ageing.
    #     Summing dataset_total_cell_count over a collection double-counts, and a collection
    #     titled "Human …" can hold a mouse dataset no homo_sapiens query reaches.
    ked      = datasets[datasets.collection_id.eq("2d40e6a7-f2fd-49ba-9db9-6b97e4c6dad5")]
    ked_ids  = ked.dataset_id.tolist()
    ked_sum  = int(ked.dataset_total_cell_count.sum())
    ked_obs  = {o: cellxgene_census.get_obs(census, o, value_filter=f"dataset_id in {ked_ids}",
                                            column_names=["dataset_id", "is_primary_data",
                                                          "suspension_type", "donor_id"])
                for o in ("homo_sapiens", "mus_musculus")}
    ked_primary = sum(int(f.is_primary_data.sum()) for f in ked_obs.values())
    hs          = ked_obs["homo_sapiens"]
    hs_primary  = hs[hs.is_primary_data]
    susp        = hs_primary.suspension_type.value_counts()
    ked_donors  = hs_primary.donor_id.nunique()
    ked_mouse   = int(ked_obs["mus_musculus"].is_primary_data.sum())
    # Six of the seven human datasets are compartment views and are wholly non-primary.
    per_ds      = hs.groupby("dataset_id", observed=True).is_primary_data.sum()
    ked_empty   = int((per_ds == 0).sum())

    # 11. Land the slice on disk: one named tissue and cell type, 14 genes, from the primary object.
    KEDLIAN = "b3c9904b-2ffd-4038-8620-ee1c5b072e9c"
    PANEL   = ["PAX7", "MYF5", "MYOD1", "MKI67", "CDKN1A", "CDKN2A", "MYH7", "MYH2",
               "DES", "TTN", "PDGFRA", "PTPRC", "PECAM1", "CD68"]
    musc_ids = cellxgene_census.get_obs(
        census, "homo_sapiens", column_names=["soma_joinid"],
        value_filter=f"dataset_id == '{KEDLIAN}' and is_primary_data == True").soma_joinid.to_numpy()
    keep  = np.sort(np.random.default_rng(0).choice(musc_ids, size=200, replace=False))
    slice_ = cellxgene_census.get_anndata(
        census=census, organism="Homo sapiens", obs_coords=keep,
        var_value_filter=f"feature_name in {PANEL}",
        obs_column_names=["cell_type", "development_stage", "donor_id", "sex", "suspension_type"])
    stages_all = slice_.obs.development_stage.cat.categories.size          # release-wide dictionary
    slice_.obs["development_stage"] = slice_.obs.development_stage.cat.remove_unused_categories()
    stages_here = slice_.obs.development_stage.cat.categories.size
    slice_.write_h5ad("kedlian_muscle_200.h5ad")

# 12. soma_joinid is a row offset in ONE build, not an identity.
with cellxgene_census.open_soma(census_version="2023-05-15") as old:
    old_ds = old["census_info"]["datasets"].read().concat().to_pandas().set_index("dataset_id").soma_joinid
new_ds = datasets.set_index("dataset_id").soma_joinid
shared = old_ds.index.intersection(new_ds.index)
moved  = int((old_ds[shared] != new_ds[shared]).sum())

assert data_obs + spatial_obs == int(summary["total_cell_count"]), "declared total covers both collections"
assert data_obs != int(summary["total_cell_count"]), "census_data alone must not reconcile"
assert mk_data + mk_spatial == mk_declared, "the two collections partition the declared count"
assert mk_data < mk_declared / 4, "census_data alone hands back under a quarter of mouse kidney"
assert ig_data == 0 and ig_spatial > 0, "a spatial-only tissue reads as empty from census_data"
assert pbmc == 0, "an unknown VALUE returns an empty frame with no error"
assert bad_column == "SOMAError", "an unknown COLUMN does raise"
assert alz_eq < alz_all / 4, "== on disease misses the ' || ' multi-label cells"
assert alz_in == alz_all, "enumerating the labels and using `in` recovers all of them"
assert mean_nonzero > 100 * mean_true, "dividing by len(values) is a mean over expressing cells"
assert presence_err == "TypeError", "get_presence_matrix has no var_value_filter"
assert presence.shape[0] == len(datasets), "presence rows are datasets, indexed by soma_joinid"
assert withdrawn == nonsense, "a withdrawn id is indistinguishable from a typo"
assert moved > 0.9 * len(shared), "soma_joinid is release-local — do not persist it"
assert ked_sum > 1.5 * ked_primary, "summing dataset_total_cell_count over a collection double-counts"
assert ked_empty > 0, "compartment views of one object are wholly is_primary_data == False"
assert ked_mouse > 0, "a collection titled 'Human …' carries a mouse dataset census_data/homo_sapiens never returns"
assert (int(susp["cell"]), int(susp["nucleus"]), ked_donors) == (90_902, 92_259, 17), \
    "the primary human subset must reconcile with the published atlas"
assert stages_all > stages_here, "obs categoricals arrive with the release-wide dictionary"
assert slice_.shape == (200, 14) and os.path.getsize("kedlian_muscle_200.h5ad") > 0, "the slice is on disk"

print(f"release                            : {summary['census_build_date']} (schema {summary['census_schema_version']})")
print(f"declared total / unique cells      : {int(summary['total_cell_count']):,} / {int(summary['unique_cell_count']):,}")
print(f"census_data + spatial obs          : {data_obs:,} + {spatial_obs:,} = {data_obs + spatial_obs:,}")
print(f"datasets in release                : {len(datasets):,}")
print(f"mouse kidney, primary              : census_data {mk_data:,} + spatial {mk_spatial:,} = {mk_declared:,} declared")
print(f"human inguinal part of abdomen     : census_data {ig_data:,} + spatial {ig_spatial:,}")
print(f"tissue == 'peripheral blood mono…' : {pbmc} rows, no error | bad column -> {bad_column}")
print(f"disease == 'Alzheimer disease'     : {alz_eq:,}; in [{len(alz_lab)} labels] {alz_in:,} of {alz_all:,} declared")
print(f"optic cup Rho/Sox2/Pax6            : {nnz} non-zeros over {cells}x{genes}; mean {mean_nonzero:.3f} vs {mean_true:.5f}")
print(f"get_presence_matrix(var_value_filter): {presence_err}; unfiltered shape {presence.shape}")
print(f"withdrawn id / nonsense id         : {withdrawn} / {nonsense}")
print(f"dataset soma_joinid vs 2023-05-15  : {moved} of {len(shared)} shared datasets moved")
print(f"Kedlian muscle ageing collection   : {len(ked_ids)} datasets, {ked_sum:,} declared, {ked_primary:,} primary")
print(f"  human primary                    : {int(susp['cell']):,} cells + {int(susp['nucleus']):,} nuclei, {ked_donors} donors")
print(f"  wholly non-primary datasets      : {ked_empty} of {len(per_ds)} human; mouse holds {ked_mouse:,}")
print(f"  slice on disk                    : {slice_.shape[0]}x{slice_.shape[1]}, development_stage {stages_all} -> {stages_here} levels")
```

**Expect**

Invariants — these hold across releases, and a failure means the skill is wrong:

- **The declared `total_cell_count` never equals `census_data` alone.** It is `census_data` plus
  `census_spatial_sequencing`, and no default-modality query can reach the second term.
- **Mouse kidney from `census_data` alone is under a quarter of the declared count**, and the two
  collections sum to it exactly. The assertion is a ratio, not a fixed number, so it keeps
  holding as the Census grows. This is what stops anyone reintroducing "just query `census_data`",
  which hands a reader 398,589 of 2,399,190 cells with nothing to signal the loss.
- **A tissue can be entirely spatial** — `inguinal part of abdomen` is 0 cells from `census_data`
  and 14,976 from the spatial collection.
- **An unknown value is silent and an unknown column raises.** Only the second failure is visible.
- **`disease == '…'` is a subset**, and `disease in [every label mentioning it]` recovers the
  declared total exactly.
- **`X("raw").tables()` yields stored non-zeros**, so `sum / len(values)` is a mean over
  expressing cells and overstates by more than two orders of magnitude here.
- **`get_presence_matrix` rejects `var_value_filter`** and returns one row per dataset.
- **A withdrawn dataset id and a nonsense one raise the identical `KeyError`.**
- **Summing `dataset_total_cell_count` over a collection double-counts it.** Compartment views
  of a single object are shipped as their own datasets and are wholly `is_primary_data == False`,
  so the declared sum runs well ahead of the cells the collection holds.
- **A collection's title does not bound its organisms.** "Human skeletal muscle ageing atlas"
  contains a mouse dataset, and `census_info/datasets` has no organism column to say so.
- **The primary human subset reconciles with the published paper**: 90,902 cells + 92,259 nuclei
  from 17 donors, exactly the figures in the Kedlian abstract. This is the only check here with
  ground truth outside the Census, so it is the one that catches a bad rebuild rather than a
  changed one.
- **An `obs` categorical arrives carrying the release-wide dictionary**, not the levels the slice
  contains, until `remove_unused_categories()` is called.
- **`soma_joinid` is release-local.** Nearly every dataset shared between `2023-05-15` and
  `2025-11-08` sits at a different id. A persisted id list silently selects different cells in a
  different release, which is why the skill says to store `dataset_id` instead.

Observed 2026-08-27 against Census `2025-11-08` — these move with each release:

```
release                            : 2025-11-08 (schema 2.4.0)
declared total / unique cells      : 217,768,036 / 125,463,259
census_data + spatial obs          : 212,080,059 + 5,687,977 = 217,768,036
datasets in release                : 1,845
mouse kidney, primary              : census_data 398,589 + spatial 2,000,601 = 2,399,190 declared
human inguinal part of abdomen     : census_data 0 + spatial 14,976
tissue == 'peripheral blood mono…' : 0 rows, no error | bad column -> SOMAError
disease == 'Alzheimer disease'     : 608,235; in [18 labels] 2,736,680 of 2,736,680 declared
optic cup Rho/Sox2/Pax6            : 2 non-zeros over 146x3; mean 1.500 vs 0.00685
get_presence_matrix(var_value_filter): TypeError; unfiltered shape (1845, 61497)
withdrawn id / nonsense id         : KeyError 'Unknown dataset_id' / KeyError 'Unknown dataset_id'
dataset soma_joinid vs 2023-05-15  : 551 of 553 shared datasets moved
Kedlian muscle ageing collection   : 8 datasets, 519,615 declared, 279,690 primary
  human primary                    : 90,902 cells + 92,259 nuclei, 17 donors
  wholly non-primary datasets      : 6 of 7 human; mouse holds 96,529
  slice on disk                    : 200x14, development_stage 194 -> 6 levels
```

Two `ImplicitModificationWarning: Transforming to str index` lines appear on stderr when the
slice is written. They come from `write_h5ad` converting the positional obs index `get_anndata`
returns; nothing is wrong, and the file is fine.

## Troubleshooting

### The Count Does Not Match the Census Summary
- The declared totals include `census_spatial_sequencing`; your query almost certainly did not.
  Re-run with `modality="census_spatial_sequencing"` and add.
- `is_primary_data == True` corresponds to `summary_cell_counts.unique_cell_count`; no filter at
  all corresponds to `total_cell_count`. Mixing them up looks like a bug in the query.
- A `disease`, `cell_type` or `tissue` value that appears in several ` || `-delimited labels is
  matched by `==` only in its solo label.
- A misspelled *value* silently matches nothing. Compare against `summary_cell_counts` labels.
- If you sized a collection by summing `dataset_total_cell_count`, that number is too high
  wherever the depositor shipped compartment views alongside the whole object — five of ten
  collections checked, by up to 3.1x. Count through `obs` with `is_primary_data == True`.

### Query Returns Too Many Cells
- Add more specific filters to reduce scope
- Use `tissue` instead of `tissue_general` for finer granularity
- Filter by specific `dataset_id` if known
- Switch to out-of-core processing for large queries

### Memory Errors
- Reduce query scope with more restrictive filters
- Select fewer genes with `var_value_filter`
- Use out-of-core processing with `axis_query()`
- Process data in batches

### `SOMAError: … Response checksums mismatch`

A read that ends in `Query FAILED: … S3: Failed to read S3 object … Response checksums mismatch`
is a corrupted transfer, not bad data and not a bad query. Every byte of the Census arrives over
ranged S3 reads, and TileDB verifies each one; on a saturated or lossy link a body arrives
mangled and the read aborts partway through. Three things that matter when you see it:

- **It is transient.** The identical script succeeds on a retry. Do not start editing the filter.
- **Concurrency makes it much more likely.** Running several Census readers at once on one
  connection turned an occasional failure into a reliable one while this skill was being checked.
  Run one at a time.
- **It aborts mid-read**, so a long query can burn ten minutes and return nothing. Order work so
  the cheap metadata pass happens first and the expensive expression pass reads only what
  survived it — which is the `obs_coords` pattern above, and the reason to prefer it.

### Duplicate Cells in Results
- Always include `is_primary_data == True` in filters
- Check if intentionally querying across multiple datasets

### Gene Not Found
- Verify gene name spelling (case-sensitive)
- Try Ensembl ID with `feature_id` instead of `feature_name`
- Check dataset presence matrix to see if gene was measured
- Some genes may have been filtered during Census construction

### Version Inconsistencies
- Always specify `census_version` explicitly
- Use same version across all analyses
- Check release notes for version-specific changes
- `stable` and `latest` are moving aliases. On 2026-08-18 `stable` was `2025-11-08` and `latest`
  was `2025-11-17`; ten builds were listed, of which six carry the LTS flag. Weekly non-LTS
  builds are deleted, so an analysis pinned to one stops resolving.
- Older releases have fewer collections and fewer organisms. `2023-05-15` is 562 datasets, two
  organisms and no `census_spatial_sequencing`; `2025-01-30` gains the spatial collection;
  `2025-11-08` gains marmoset, macaque and chimpanzee. Code that indexes
  `census["census_spatial_sequencing"]` raises `KeyError` on a pre-2025 release. One client
  version reads all of them — `cellxgene-census` 1.17.0 opened `2023-05-15`, `2024-07-01`,
  `2025-01-30` and `2025-11-08` without complaint.

### A dataset_id Is Not Found
`get_source_h5ad_uri` raises `KeyError('Unknown dataset_id')` for a withdrawn dataset and for a
typo alike — the message does not distinguish them. Nine datasets in the `2023-05-15` LTS are
absent from `2025-11-08`. Check the `datasets` frame of an older release before concluding the
id is wrong. A `dataset_id` filter on `obs` is worse: it returns zero rows with no error either
way.

## Sources

- CZ CELLxGENE Discover — https://cellxgene.cziscience.com/
- Discover curation API, for what Discover holds that a Census build does not —
  https://api.cellxgene.cziscience.com/curation/v1/collections?visibility=PUBLIC
- Census documentation — https://chanzuckerberg.github.io/cellxgene-census/
- Release directory (which builds exist, and which are LTS) —
  https://census.cellxgene.cziscience.com/cellxgene-census/v1/release.json
- Census schema — https://github.com/chanzuckerberg/cellxgene-census/blob/main/docs/cellxgene_census_schema.md
- CELLxGENE dataset schema — https://github.com/chanzuckerberg/single-cell-curation
- TileDB-SOMA — https://github.com/single-cell-data/TileDB-SOMA
