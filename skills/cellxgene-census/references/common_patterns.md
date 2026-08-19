# Common Query Patterns and Best Practices

**Read first:** every helper below defaults to `modality="census_data"`, and the Census's own
declared counts span `census_data` *and* `census_spatial_sequencing`. Any pattern here that
returns a count returns the dissociated half unless you pass `modality=`. For mouse
`tissue_general == 'kidney'` that is 398,589 of 2,399,190 cells, silently.

## Query Pattern Categories

### 1. Exploratory Queries (Metadata Only)

Use when exploring available data without loading expression matrices.

**Pattern: Get unique cell types in a tissue**
```python
import cellxgene_census

with cellxgene_census.open_soma() as census:
    cell_metadata = cellxgene_census.get_obs(
        census,
        "homo_sapiens",
        value_filter="tissue_general == 'brain' and is_primary_data == True",
        column_names=["cell_type"]
    )
    unique_cell_types = cell_metadata["cell_type"].unique()
    print(f"Found {len(unique_cell_types)} unique cell types")
```

**Pattern: Count cells by condition**
```python
cell_metadata = cellxgene_census.get_obs(
    census,
    "homo_sapiens",
    value_filter="disease != 'normal' and is_primary_data == True",
    column_names=["disease", "tissue_general"]
)
counts = cell_metadata.groupby(["disease", "tissue_general"]).size()
```

**Pattern: Explore dataset information**

The datasets frame has eleven columns and **none of them is `disease`, `tissue` or `assay`** —
`datasets["disease"]` is a `KeyError`. What it carries is provenance: `dataset_id`,
`dataset_version_id`, `dataset_title`, `dataset_h5ad_path`, `dataset_total_cell_count`,
`collection_id`, `collection_name`, `collection_doi`, `collection_doi_label`, `citation`,
`soma_joinid`. Biology lives in `obs`.

```python
datasets = census["census_info"]["datasets"].read().concat().to_pandas()

# Text search on what the frame actually has: 64 datasets sit in a collection whose name
# mentions COVID in 2025-11-08, against 51 that hold a COVID-19-labelled primary cell.
covid_collections = datasets[datasets.collection_name.str.contains("COVID", case=False, na=False)]

# Or go through obs, which is where the metadata is
covid_ids = cellxgene_census.get_obs(
    census, "homo_sapiens",
    value_filter="disease == 'COVID-19' and is_primary_data == True",
    column_names=["dataset_id"],
).dataset_id.unique()
covid_datasets = datasets[datasets.dataset_id.isin(covid_ids)]
```

### 2. Small-to-Medium Queries (AnnData)

Use `get_anndata()` when results fit in memory (typically < 100k cells).

**Pattern: Tissue-specific cell type query**
```python
adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",
    obs_value_filter="cell_type == 'B cell' and tissue_general == 'lung' and is_primary_data == True",
    obs_column_names=["assay", "disease", "sex", "donor_id"],
)
```

**Pattern: Gene-specific query with multiple genes**
```python
marker_genes = ["CD4", "CD8A", "CD19", "FOXP3"]

# First get gene IDs
gene_metadata = cellxgene_census.get_var(
    census, "homo_sapiens",
    value_filter=f"feature_name in {marker_genes}",
    column_names=["feature_id", "feature_name"]
)
gene_ids = gene_metadata["feature_id"].tolist()

# Query with gene filter
adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",
    var_value_filter=f"feature_id in {gene_ids}",
    obs_value_filter="cell_type == 'T cell' and is_primary_data == True",
)
```

**Pattern: Multi-tissue query**
```python
adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",
    obs_value_filter="tissue_general in ['lung', 'liver', 'kidney'] and is_primary_data == True",
    obs_column_names=["cell_type", "tissue_general", "dataset_id"],
)
```

**Pattern: Disease-specific query**
```python
adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",
    obs_value_filter="disease == 'COVID-19' and tissue_general == 'lung' and is_primary_data == True",
)
```

### 3. Large Queries (Out-of-Core Processing)

Use `axis_query()` for queries that exceed available RAM.

**Pattern: Iterative processing**
```python
import tiledbsoma as soma

# Create query
with census["census_data"]["homo_sapiens"].axis_query(
    measurement_name="RNA",
    obs_query=soma.AxisQuery(
        value_filter="tissue_general == 'brain' and is_primary_data == True"
    ),
    var_query=soma.AxisQuery(
        value_filter="feature_name in ['FOXP2', 'TBR1', 'SATB2']"
    ),
) as query:
    # Iterate through X matrix in chunks
    iterator = query.X("raw").tables()
    for batch in iterator:
        # Process batch (a pyarrow.Table)
        # batch has columns: soma_data, soma_dim_0, soma_dim_1
        process_batch(batch)
```

**Pattern: Incremental statistics (mean/variance) — count the implied zeros**

`X("raw").tables()` yields stored non-zeros only. Running Welford over `batch["soma_data"]` gives
the variance *of the expressing cells*, not of the gene, and running `sum / len(values)` gives a
mean that overstates by orders of magnitude. The denominator has to be `n_obs * n_vars`:

```python
import numpy as np, tiledbsoma as soma

with census["census_data"]["homo_sapiens"].axis_query(
    measurement_name="RNA",
    obs_query=soma.AxisQuery(value_filter="tissue_general == 'brain' and is_primary_data == True"),
    var_query=soma.AxisQuery(value_filter="feature_name in ['FOXP2', 'TBR1', 'SATB2']"),
) as query:
    n_obs, n_vars = query.n_obs, query.n_vars
    gene = query.var(column_names=["soma_joinid", "feature_name"]).concat().to_pandas()
    pos  = {j: i for i, j in enumerate(sorted(gene.soma_joinid))}
    total = np.zeros(n_vars); sq = np.zeros(n_vars); nonzero = np.zeros(n_vars, dtype=int)
    for batch in query.X("raw").tables():
        cols, vals = np.array([pos[j] for j in batch["soma_dim_1"].to_numpy()]), batch["soma_data"].to_numpy()
        np.add.at(total, cols, vals)
        np.add.at(sq, cols, vals.astype(float) ** 2)
        np.add.at(nonzero, cols, 1)

mean = total / n_obs                                    # zeros included, by construction
variance = sq / n_obs - mean ** 2                       # E[x^2] - E[x]^2, zeros contribute 0 to sq
fraction_expressing = nonzero / n_obs
```

`var` already carries per-gene `nnz` and `n_measured_obs` for the whole Census, so if the
question is coverage rather than a filtered subset, read those instead of streaming anything.

### 4. PyTorch Integration (Machine Learning)

Use TileDB-SOMA-ML for training models. The former `cellxgene_census.experimental.ml` loaders are deprecated and scheduled for removal.

**Pattern: Create training dataloader**
```python
import tiledbsoma as soma
from tiledbsoma_ml import ExperimentDataset, experiment_dataloader

with cellxgene_census.open_soma() as census:
    experiment = census["census_data"]["homo_sapiens"]
    with experiment.axis_query(
        measurement_name="RNA",
        obs_query=soma.AxisQuery(
            value_filter="tissue_general == 'liver' and is_primary_data == True"
        ),
    ) as query:
        dataset = ExperimentDataset(
            query=query,
            layer_name="raw",
            obs_column_names=["cell_type"],
            batch_size=128,
            shuffle=True,
        )
        dataloader = experiment_dataloader(dataset)

        for epoch in range(num_epochs):
            dataset.set_epoch(epoch)
            for X, obs in dataloader:
                labels = obs["cell_type"]
                # Train model...
```

**Pattern: Train/test split**
```python
# Split data
train_dataset, test_dataset = dataset.random_split(0.8, 0.2, seed=42)

# Create loaders
train_loader = experiment_dataloader(train_dataset, num_workers=2)
test_loader = experiment_dataloader(test_dataset, num_workers=2)
```

Set `batch_size` and `shuffle` on `ExperimentDataset`, not on the PyTorch `DataLoader`.

### 5. Spatial Census Data

Use the `cellxgene-census[spatial]` extra and query the `census_spatial_sequencing` collection for Visium or Slide-seq V2 data.

```python
import tiledbsoma as soma

with cellxgene_census.open_soma(census_version="2025-11-08") as census:
    spatial_experiment = census["census_spatial_sequencing"]["homo_sapiens"]
    with spatial_experiment.axis_query(
        measurement_name="RNA",
        obs_query=soma.AxisQuery(
            value_filter="dataset_id == '4cceac62-9513-42a4-90e5-2878dbb0192c'"
        ),
    ) as query:
        sdata = query.to_spatialdata(X_name="raw")
```

### 6. Integration Workflows

**Pattern: Scanpy integration**

`cell_type == 'neuron' and is_primary_data == True` is 3,858,369 cells with no gene filter —
that is not a slice, it is most of the human brain. Add a tissue, then subsample before
`neighbors`/`umap`, which are the steps that do not scale.

```python
import scanpy as sc

adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",
    obs_value_filter="cell_type == 'neuron' and tissue_general == 'cortex' "
                     "and is_primary_data == True",          # 37,756 cells
    obs_column_names=["cell_type", "tissue", "assay", "donor_id"],
)

sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata, n_top_genes=2000, subset=True)
sc.pp.pca(adata, n_comps=50)
sc.pp.neighbors(adata)
sc.tl.umap(adata)
sc.pl.umap(adata, color=["tissue", "assay"])
```

`cortex` is one of the 71 `tissue_general` labels in this release. `cerebral cortex` is a valid
`tissue` but **not** a valid `tissue_general`, so `tissue_general == 'cerebral cortex'` returns
zero cells without saying so. The two vocabularies are not interchangeable — check the label
against the right category in `summary_cell_counts` before trusting it.

**Pattern: Multi-dataset integration**

`sce.pp.scanorama_integrate` takes **one** `AnnData` and the name of its batch column —
`(adata, key, *, basis="X_pca", adjusted_basis="X_scanorama", …)` — not a list. Concatenate
first, and let `dataset_id` be the batch key rather than inventing one. It also needs
`uv pip install scanorama`, which scanpy does not pull in; without it the call raises
`ModuleNotFoundError` at the last line.

```python
import anndata as ad, scanpy as sc, scanpy.external as sce

ids = ["de17ac25-550a-4018-be75-bbb485a0636e",   # Myeloid cells of human eye, 395 cells
       "00ff600e-6e2e-4d76-846f-0eec4f0ae417"]   # Human tonsil nonlymphoid cells, 363 cells

adatas = [
    cellxgene_census.get_anndata(
        census=census, organism="Homo sapiens",
        obs_value_filter=f"dataset_id == '{d}'",
        obs_column_names=["cell_type", "tissue_general", "dataset_id"])
    for d in ids
]
combined = ad.concat(adatas, join="inner", index_unique="-")   # `inner` — gene spaces may differ
sc.pp.normalize_total(combined, target_sum=1e4); sc.pp.log1p(combined); sc.pp.pca(combined)
sce.pp.scanorama_integrate(combined, "dataset_id")             # writes obsm["X_scanorama"]
```

`index_unique` is not optional in practice: `get_anndata` returns a positional `0..n-1` obs
index, so two slices collide and `ad.concat` warns rather than fails. Downstream code that joins
on `obs_names` then silently mismatches.

Note the missing `is_primary_data == True`. A single-dataset query has nothing to de-duplicate,
and some datasets are wholly non-primary: all 146 cells of
`0895c838-e550-48a3-a777-dbcd35d30272` carry `is_primary_data == False`, so adding the filter
returns an empty result with no error. Filter for primary data when de-duplicating *across*
datasets; do not assume any given dataset survives it.

## Best Practices

### 1. Always Filter for Primary Data
Unless specifically analyzing duplicates, always include `is_primary_data == True`:
```python
obs_value_filter="cell_type == 'B cell' and is_primary_data == True"
```

### 2. Specify Census Version
For reproducible analysis, always specify the Census version:
```python
census = cellxgene_census.open_soma(census_version="2025-11-08")
```

### 3. Use Context Manager
Always use the context manager to ensure proper cleanup:
```python
with cellxgene_census.open_soma() as census:
    # Your code here
```

### 4. Select Only Needed Columns
Minimize data transfer by selecting only required metadata columns:
```python
obs_column_names=["cell_type", "tissue_general", "disease"]  # Not all columns
```

### 5. Check Dataset Presence for Gene Queries
`get_presence_matrix` accepts no gene filter — `var_value_filter=` is a `TypeError`. It returns
the full `n_datasets x n_genes` boolean matrix; slice it with the gene `soma_joinid`s yourself:
```python
import numpy as np

var = cellxgene_census.get_var(census, "homo_sapiens", column_names=["soma_joinid", "feature_name"])
presence = cellxgene_census.get_presence_matrix(census, "homo_sapiens")     # (1845, 61497)
idx = var.loc[var.feature_name.isin(["CD4", "CD8A"]), "soma_joinid"].to_numpy()
both = np.asarray(presence[:, idx].sum(axis=1)).ravel() == len(idx)         # 1,067 datasets
```

### 6. Use tissue_general for Broader Queries
`tissue_general` provides coarser groupings than `tissue` — 71 human labels against 423 — which
is useful for cross-tissue analyses. Take the value from the release, not from memory: a value
that is not in the vocabulary returns an empty frame with no error, and
`tissue == 'peripheral blood mononuclear cell'` is one of those (0 rows in 2025-11-08).
```python
counts = census["census_info"]["summary_cell_counts"].read().concat().to_pandas()
h = counts[counts.organism.eq("homo_sapiens")]
sorted(h[h.category.eq("tissue")].label)              # the 423 legal `tissue` values

obs_value_filter="tissue_general == 'immune system'"  # broad
obs_value_filter="tissue == 'blood'"                  # specific, and real
```

### 7. Combine Metadata Exploration with Expression Queries
First explore metadata to understand available data, then query expression:
```python
# Step 1: Explore
metadata = cellxgene_census.get_obs(
    census, "homo_sapiens",
    value_filter="disease == 'COVID-19'",
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

### 8. Memory Management for Large Queries
For large queries, check estimated size before loading:
```python
# Get cell count first
metadata = cellxgene_census.get_obs(
    census, "homo_sapiens",
    value_filter="tissue_general == 'brain' and is_primary_data == True",
    column_names=["soma_joinid"]
)
n_cells = len(metadata)
print(f"Query will return {n_cells} cells")

# If too large, use out-of-core processing or further filtering
```

### 9. Leverage Ontology Terms for Consistency
When possible, use ontology term IDs instead of free text:
```python
# More reliable than cell_type == 'B cell' across datasets
obs_value_filter="cell_type_ontology_term_id == 'CL:0000236'"
```

### 10. Batch Processing Pattern
For systematic analyses across multiple conditions:
```python
tissues = ["lung", "liver", "kidney", "heart"]
results = {}

for tissue in tissues:
    adata = cellxgene_census.get_anndata(
        census=census,
        organism="Homo sapiens",
        obs_value_filter=f"tissue_general == '{tissue}' and is_primary_data == True",
    )
    # Perform analysis
    results[tissue] = analyze(adata)
```

## Common Pitfalls to Avoid

1. **Forgetting `modality=`**: the declared totals count `census_data` *and*
   `census_spatial_sequencing`; every helper defaults to the first. Mouse `tissue_general ==
   'kidney'` returns 398,589 of 2,399,190 declared primary cells, silently
2. **Not filtering for is_primary_data**: Leads to counting duplicate cells
3. **Assuming a dataset has primary cells**: some are wholly `is_primary_data == False`, so the
   filter returns an empty result rather than the dataset
4. **Misspelling a value**: an unknown *value* returns an empty frame with no error; only an
   unknown *column* raises
5. **`==` on `disease`**: multi-condition donors carry ` || `-delimited labels that equality misses
6. **Dividing by `len(batch["soma_data"])`**: the iterator holds non-zeros only, so that is a mean
   over expressing cells
7. **Loading too much data**: Use metadata queries to estimate size first
8. **Not using context manager**: Can cause resource leaks
9. **Inconsistent versioning**: Results not reproducible without specifying version
10. **Ignoring dataset presence**: Some genes not measured in all datasets
11. **Wrong count normalization**: Be aware of UMI vs read count differences. `X` has two layers,
    `raw` and `normalized`; `get_anndata` returns `raw` unless you ask
