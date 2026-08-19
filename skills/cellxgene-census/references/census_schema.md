# CZ CELLxGENE Census Data Schema Reference

## Overview

The CZ CELLxGENE Census is a versioned collection of single-cell and spatial transcriptomics data built on the TileDB-SOMA framework. This reference documents the data structure, available metadata fields, and query syntax.

Current reference point, confirmed 2026-08-18:
- Package examples target `cellxgene-census==1.17.*`, which resolves to 1.17.0. 1.18.0 is on
  PyPI; the pin is for reproducibility, not because 1.18 is broken
- Current stable LTS Census: `2025-11-08` — still `stable` in the release directory, flagged LTS
  with `do_not_delete`
- Census schema version: `2.4.0`
- CELLxGENE dataset schema version: `7.0.0`
- 1.17.0 opens every release in the directory, `2023-05-15` through `2025-11-08`
- Vocabulary sizes in this release: 71 human `tissue_general` labels against 423 `tissue`, 903
  human cell types, 261 human disease labels, 39 human assay labels; mouse 36 / 102 / 492 / 18 / 18

## High-Level Structure

The Census is organized as a `SOMACollection` with these main components:

### 1. census_info
Summary information including:
- **summary**: Build date, schema versions, `total_cell_count`, `unique_cell_count`
- **datasets**: All datasets in the release. Eleven columns — `soma_joinid`, `citation`,
  `collection_id`, `collection_name`, `collection_doi`, `collection_doi_label`, `dataset_id`,
  `dataset_version_id`, `dataset_title`, `dataset_h5ad_path`, `dataset_total_cell_count`. No
  disease, tissue or assay column
- **summary_cell_counts**: `total_cell_count` and `unique_cell_count` per label, for the
  categories `all`, `assay`, `cell_type`, `disease`, `self_reported_ethnicity`, `sex`,
  `suspension_type`, `tissue`, `tissue_general`
- **organisms**: `organism`, `organism_label`, `organism_ontology_term_id` for the release

**Every count in `summary` and `summary_cell_counts` covers `census_data` and
`census_spatial_sequencing` together.** Query helpers default to `census_data` alone, so an
answer checked against these numbers will be short by the spatial share of that filter — 0% for
human brain, 83% for mouse kidney, 100% for human `inguinal part of abdomen`.

### 2. census_data
Organism-specific `SOMAExperiment` objects:
- **"homo_sapiens"**: Human single-cell data
- **"mus_musculus"**: Mouse single-cell data
- **"callithrix_jacchus"**: Common marmoset single-cell data
- **"macaca_mulatta"**: Rhesus macaque single-cell data
- **"pan_troglodytes"**: Chimpanzee single-cell data

### 3. census_spatial_sequencing
Spatial organism-specific `SOMAExperiment` objects for supported releases. Spatial and non-spatial data share core metadata requirements, while spatial observations also include spatial columns such as `array_col`, `array_row`, and `in_tissue`.

## Single-Cell Data Structure Per Organism

Each organism experiment contains:

### obs (Cell Metadata)
Cell-level annotations stored as a `SOMADataFrame`. Access via:
```python
census["census_data"]["homo_sapiens"].obs
```

### ms["RNA"] (Measurement)
RNA measurement data including:
- **X**: Data matrices with two layers in `census_data` — `raw` (counts) and `normalized`. The
  spatial collection carries `raw` only. `get_anndata` returns `raw` in `.X`; request the other
  with `X_layers=["normalized"]`, which lands in `.layers`
- **var**: Gene metadata. Human `census_data` has 61,497 features, mouse 53,384, and human
  `census_spatial_sequencing` 43,386 — the collections do not share a gene space
- **feature_dataset_presence_matrix**: Sparse boolean array showing which genes were measured in each dataset

## Spatial Data Structure Per Organism

Spatial data is stored separately from the single-cell Census data:
```python
census["census_spatial_sequencing"]["homo_sapiens"]
```

Each spatial organism experiment contains:
- `obs`: Spatial observation metadata, including core Census metadata and spatial fields such as `array_col`, `array_row`, and `in_tissue`
- `ms["RNA"]`: RNA measurement matrices and feature metadata
- `spatial[scene_id].obsl["loc"]`: point-cloud positions for each scene, with `x`, `y`, and `soma_joinid`

Use `axis_query(...).to_spatialdata(X_name="raw")` when exporting a spatial slice to `spatialdata`.

## Cell Metadata Fields (obs)

### Required/Core Fields

**Identity & Dataset:**
- `soma_joinid`: Unique integer identifier for joins
- `dataset_id`: Source dataset identifier
- `is_primary_data`: Boolean flag (True = unique cell, False = duplicate across datasets)

**Cell Type:**
- `cell_type`: Human-readable cell type name
- `cell_type_ontology_term_id`: Standardized ontology term (e.g., "CL:0000236")

**Tissue:**
- `tissue`: Specific tissue name
- `tissue_general`: Broader tissue category (useful for grouping)
- `tissue_ontology_term_id`: Standardized ontology term
- `tissue_general_ontology_term_id`: Standardized ontology term for the broader tissue category

**Assay:**
- `assay`: Sequencing technology used
- `assay_ontology_term_id`: Standardized ontology term

**Disease:**
- `disease`: Disease status or condition
- `disease_ontology_term_id`: Standardized ontology term

**Donor:**
- `donor_id`: Unique donor identifier
- `sex`: Biological sex (male, female, unknown)
- `self_reported_ethnicity`: Ethnicity information
- `development_stage`: Life stage (adult, child, embryonic, etc.)
- `development_stage_ontology_term_id`: Standardized ontology term

**Organism:**
- **Not an obs column.** Organism is the experiment key —
  `census["census_data"]["homo_sapiens"]`, or the `organism` argument to `get_obs`/`get_var`, or
  `organism="Homo sapiens"` for `get_anndata`. A filter on `organism` raises
  `SOMAError: 'Column organism does not exist in schema'`. The release's organism table is
  `census["census_info"]["organisms"]`

**Technical:**
- `suspension_type`: Sample preparation type (cell, nucleus, na)
- `tissue_type`: whether the sample is tissue, organoid or cell culture
- `observation_joinid`: stable per-cell identifier across releases
- `raw_sum`, `nnz`, `raw_mean_nnz`, `raw_variance_nnz`, `n_measured_vars`: per-cell summaries
  computed at build time

Human and mouse obs schemas are identical column-for-column, so a filter written for one works
unchanged on the other. Spatial obs adds `in_tissue`, `array_row` and `array_col`.

## Gene Metadata Fields (var)

Access via:
```python
census["census_data"]["homo_sapiens"].ms["RNA"].var
```

**Available Fields:**
- `soma_joinid`: Unique integer identifier for joins
- `feature_id`: Ensembl gene ID (e.g., "ENSG00000161798")
- `feature_name`: Gene symbol (e.g., "FOXP2")
- `feature_type`: Feature type from the source schema
- `feature_length`: Gene length in base pairs
- `nnz`: Non-zero count summary
- `n_measured_obs`: Number of measured observations for the feature

## Value Filter Syntax

Queries use Python-like expressions for filtering. The syntax is processed by TileDB-SOMA.

### Comparison Operators
- `==`: Equal to
- `!=`: Not equal to
- `<`, `>`, `<=`, `>=`: Numeric comparisons
- `in`: Membership test (e.g., `feature_id in ['ENSG00000161798', 'ENSG00000188229']`)

There is no substring or regular-expression operator. To match a family of labels, enumerate
them from `summary_cell_counts` in pandas and pass the list to `in`.

A filter naming a column that does not exist raises `SOMAError`. A filter naming a *value* that
does not exist returns an empty result with no error — that failure is silent, and it is the one
worth guarding against.

### Logical Operators
- `and`, `&`: Logical AND
- `or`, `|`: Logical OR

### Examples

**Single condition:**
```python
value_filter="cell_type == 'B cell'"
```

**Multiple conditions with AND:**
```python
value_filter="cell_type == 'B cell' and tissue_general == 'lung' and is_primary_data == True"
```

**Using IN for multiple values:**
```python
value_filter="tissue in ['lung', 'liver', 'kidney']"
```

**Complex condition:**
```python
value_filter="(cell_type == 'neuron' or cell_type == 'astrocyte') and disease != 'normal'"
```

**Filtering genes:**
```python
var_value_filter="feature_name in ['CD4', 'CD8A', 'CD19']"
```

### Multi-Value Disease Fields

In current LTS releases, `disease` and `disease_ontology_term_id` may contain multiple values delimited by ` || `. Exact equality filters such as `disease == 'COVID-19'` can miss cells whose disease field contains multiple labels. For comprehensive disease queries, first inspect available values with `get_obs()` or `summary_cell_counts`, then choose filters that match the selected release's encoding.

## Data Inclusion Criteria

The Census includes all data from CZ CELLxGENE Discover meeting:

1. **Species**: as of `2025-11-08`, human, mouse, common marmoset, rhesus macaque and
   chimpanzee in `census_data`; human and mouse in `census_spatial_sequencing`. Releases before
   `2025-11-08` carry human and mouse only
2. **Technology**: Approved sequencing technologies for RNA. 39 assay labels for human and 18
   for mouse in this release, from `10x 3' v3` (97.3M human cells) down to `Smart-seq` (172)
3. **Count Type**: Raw counts only (no processed/normalized-only data)
4. **Metadata**: Standardized following CELLxGENE schema
5. **Both spatial and non-spatial data**, but in **separate collections** — see the note under
   `census_info` above

## Important Data Characteristics

### Duplicate Cells
Cells may appear across multiple datasets. Use `is_primary_data == True` to filter for unique cells in most analyses.

### Count Types
The Census includes:
- **Molecule counts**: From UMI-based methods
- **Full-gene sequencing read counts**: From non-UMI methods
These may need different normalization approaches.

### Versioning
Census releases are versioned (e.g., "2025-11-08", "stable", "latest"). Always specify an LTS build date for reproducible analysis:
```python
census = cellxgene_census.open_soma(census_version="2025-11-08")
```

`stable` resolves to the current LTS release. `latest` resolves to the newest weekly release, which provides fast access to newly ingested datasets but is retained for a shorter period than LTS releases.

## Feature Dataset Presence Matrix

Access which genes were measured in each dataset. `cellxgene_census.get_presence_matrix(census,
organism)` returns it as a SciPy CSR of shape `(n_datasets, n_genes)` — 1,845 x 61,497 for
human in `2025-11-08` — with rows indexed by the dataset's `soma_joinid` and columns by the
gene's. **It takes no `var_value_filter`**; that argument is a `TypeError`.
```python
presence_matrix = census["census_data"]["homo_sapiens"].ms["RNA"]["feature_dataset_presence_matrix"]
```

This sparse boolean matrix helps understand:
- Gene coverage across datasets
- Which datasets to include for specific gene analyses
- Technical batch effects related to gene coverage

## SOMA Object Types

Core TileDB-SOMA objects used:
- **DataFrame**: Tabular data (obs, var)
- **SparseNDArray**: Sparse matrices (X layers, presence matrix)
- **DenseNDArray**: Dense arrays (less common)
- **Collection**: Container for related objects
- **Experiment**: Top-level container for measurements
- **SOMAScene**: Spatial transcriptomics scenes
- **obs_spatial_presence**: Spatial data availability
