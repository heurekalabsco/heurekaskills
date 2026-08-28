# Core Workflow Patterns

The eight patterns in full, with code: opening the Census, exploring Census information,
querying expression data at small to medium scale, large-scale out-of-core queries,
machine learning with PyTorch, spatial Census data, Scanpy integration, and
multi-dataset integration.

## Core Workflow Patterns

### 1. Opening the Census

Always use the context manager to ensure proper resource cleanup:

```python
import cellxgene_census

# Open whatever `stable` currently resolves to
with cellxgene_census.open_soma() as census:
    print(list(census.keys()))

# Open the current LTS version for reproducibility
with cellxgene_census.open_soma(census_version="2025-11-08") as census:
    print(list(census["census_data"].keys()))
```

Both blocks do real work rather than standing in for it, because a `with` body holding nothing
but a comment is an `IndentationError` — copy-pasting that shape does not run.

**Key points:**
- Use context manager (`with` statement) for automatic cleanup
- Specify `census_version` for reproducible analyses
- `stable` opens the current LTS Census release; `latest` opens the newest weekly release retained for a shorter period
- `cellxgene_census.get_census_version_directory()` lists every build and its LTS flag, and
  `get_census_version_description(v)` resolves one alias without opening it
- The collections a release has vary. `2023-05-15` has `census_data` (human, mouse) and
  `census_info` only; `2025-01-30` adds `census_spatial_sequencing`; `2025-11-08` adds marmoset,
  macaque and chimpanzee to `census_data`. Read `list(census.keys())` rather than assuming.

### 2. Exploring Census Information

Before querying expression data, explore available datasets and metadata.

**Access summary information:**
```python
# Get summary statistics as label/value rows
summary = census["census_info"]["summary"].read().concat().to_pandas()
summary_values = summary.set_index("label")["value"]
print(f"Total cells: {int(summary_values['total_cell_count']):,}")     # 217,768,036 in 2025-11-08
print(f"Unique cells: {int(summary_values['unique_cell_count']):,}")   # 125,463,259

# Get all datasets. Columns: soma_joinid, citation, collection_id, collection_name,
# collection_doi, collection_doi_label, dataset_id, dataset_version_id, dataset_title,
# dataset_h5ad_path, dataset_total_cell_count. There is no per-dataset disease/tissue/assay
# column — those live in obs, or in summary_cell_counts as organism-level rollups.
datasets = census["census_info"]["datasets"].read().concat().to_pandas()
assert datasets.dataset_total_cell_count.sum() == int(summary_values["total_cell_count"])

# Get precomputed counts by organism, cell type, tissue, disease, assay, sex,
# suspension_type and self_reported_ethnicity. Both counts are given: total_cell_count
# and unique_cell_count (the `is_primary_data == True` subset).
summary_counts = census["census_info"]["summary_cell_counts"].read().concat().to_pandas()
tissue_counts = summary_counts[summary_counts["category"].eq("tissue_general")]
```

**These declared counts span both collections.** `summary` and `summary_cell_counts` cover
`census_data` *and* `census_spatial_sequencing`; every query helper below defaults to
`census_data` alone. In 2025-11-08 that is 212,080,059 of the declared 217,768,036 cells, and
the shortfall is concentrated — mouse `tissue_general == 'kidney'` is 398,589 from `census_data`
against 2,399,190 declared. Pass `modality="census_spatial_sequencing"` for the other half.

**Query cell metadata to understand available data:**
```python
# Get unique cell types in a tissue
cell_metadata = cellxgene_census.get_obs(
    census,
    "homo_sapiens",
    value_filter="tissue_general == 'brain' and is_primary_data == True",
    column_names=["cell_type"]
)
unique_cell_types = cell_metadata["cell_type"].unique()
print(f"Found {len(unique_cell_types)} cell types in brain")

# Count cells by tissue
tissue_metadata = cellxgene_census.get_obs(
    census,
    "homo_sapiens",
    value_filter="is_primary_data == True",
    column_names=["tissue_general"],
)
tissue_counts = tissue_metadata["tissue_general"].value_counts()
```

**Important:** Always filter for `is_primary_data == True` to avoid counting duplicate cells unless specifically analyzing duplicates.

### 3. Querying Expression Data (Small to Medium Scale)

For queries returning < 100k cells that fit in memory, use `get_anndata()`. Count first with
`get_obs` — the filter below is 97,465 cells, and dropping `tissue_general` makes it 1,406,088.

```python
# Basic query with cell type and tissue filters
adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",  # or "Mus musculus"
    obs_value_filter="cell_type == 'B cell' and tissue_general == 'lung' and is_primary_data == True",
    obs_column_names=["assay", "disease", "sex", "donor_id"],
)

# The same call against the spatial collection. Human lung holds 275,274 spatial cells the
# default modality never sees; take one dataset at a time unless you want all of them.
spatial_adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",
    obs_value_filter="dataset_id == '4cceac62-9513-42a4-90e5-2878dbb0192c'",
    modality="census_spatial_sequencing",          # 4,992 x 43,386
)

# Query specific genes with multiple filters
adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",
    var_value_filter="feature_name in ['CD4', 'CD8A', 'CD19', 'FOXP3']",
    obs_value_filter="cell_type == 'T cell' and disease == 'COVID-19' and is_primary_data == True",
    obs_column_names=["cell_type", "tissue_general", "donor_id"],
)
```

**Filter syntax:**
- Use `obs_value_filter` for cell filtering
- Use `var_value_filter` for gene filtering
- Combine conditions with `and`, `or`
- Use `in` for multiple values: `tissue in ['lung', 'liver']`
- Select only needed columns with `obs_column_names`
- Pass `modality="census_spatial_sequencing"` to reach Visium and Slide-seqV2 cells; the default
  `census_data` never contains them, and returns zero rows rather than an error
- A value that is not in the release's vocabulary returns an empty frame with no warning; a
  column that is not in the schema raises `SOMAError`. Only the second is visible
- In current LTS releases, `disease` and `disease_ontology_term_id` may contain ` || `-delimited multiple values; inspect available values before relying on exact equality filters for disease cohorts. `disease == 'Alzheimer disease'` returns 608,235 of the 2,736,680 primary cells whose label mentions it — enumerate the labels from `summary_cell_counts` and use `in`
- There is no `organism` column; organism is the collection key

**Getting metadata separately:**
```python
# Query cell metadata
cell_metadata = cellxgene_census.get_obs(
    census, "homo_sapiens",
    value_filter="disease == 'COVID-19' and is_primary_data == True",
    column_names=["cell_type", "tissue_general", "donor_id"]
)

# Query gene metadata
gene_metadata = cellxgene_census.get_var(
    census, "homo_sapiens",
    value_filter="feature_name in ['CD4', 'CD8A']",
    column_names=["feature_id", "feature_name", "feature_length"]
)
```

### 4. Large-Scale Queries (Out-of-Core Processing)

For queries exceeding available RAM, use `axis_query()` with iterative processing:

```python
import tiledbsoma as soma

# Create axis query
with census["census_data"]["homo_sapiens"].axis_query(
    measurement_name="RNA",
    obs_query=soma.AxisQuery(
        value_filter="tissue_general == 'brain' and is_primary_data == True"
    ),
    var_query=soma.AxisQuery(
        value_filter="feature_name in ['FOXP2', 'TBR1', 'SATB2']"
    ),
) as query:
    # Iterate through expression matrix in chunks
    iterator = query.X("raw").tables()
    for batch in iterator:
        # batch is a pyarrow.Table with columns:
        # - soma_data: expression value
        # - soma_dim_0: cell (obs) coordinate
        # - soma_dim_1: gene (var) coordinate
        process_batch(batch)
```

**Computing incremental statistics — the zeros are not in the iterator.**

`X("raw")` is sparse and `.tables()` yields only *stored non-zero* entries. Dividing the running
sum by the number of values you saw gives the mean **over expressing cells**, not the mean
expression, and the two differ by orders of magnitude for any typical gene. Divide by
`n_obs * n_vars` instead, and take both counts from the query:

```python
import numpy as np, tiledbsoma as soma

with census["census_data"]["mus_musculus"].axis_query(
    measurement_name="RNA",
    obs_query=soma.AxisQuery(value_filter="tissue_general == 'optic cup' and is_primary_data == True"),
    var_query=soma.AxisQuery(value_filter="feature_name in ['Rho', 'Sox2', 'Pax6']"),
) as query:
    n_obs, n_vars = query.n_obs, query.n_vars
    gene = query.var(column_names=["soma_joinid", "feature_name"]).concat().to_pandas()
    pos  = {j: i for i, j in enumerate(sorted(gene.soma_joinid))}   # soma_joinid -> column
    total, nonzero = np.zeros(n_vars), np.zeros(n_vars, dtype=int)
    for batch in query.X("raw").tables():
        cols = np.array([pos[j] for j in batch["soma_dim_1"].to_numpy()])
        np.add.at(total, cols, batch["soma_data"].to_numpy())
        np.add.at(nonzero, cols, 1)

mean_per_cell = total / n_obs                     # Pax6 0.02055, Sox2 0.0, Rho 0.0 across 146 cells
fraction_expressing = nonzero / n_obs             # the other statistic people usually want
```

Pooled over the three genes here, the wrong formula gives `1.500` and the right one `0.00685` —
a 219x overstatement, with nothing in the output to signal it. Welford's algorithm over
`batch["soma_data"]` has the same defect: it computes the variance of the non-zero values.
Account for the implied zeros explicitly, or read the per-gene `nnz` and `n_measured_obs`
columns already in `var`.

### 5. Machine Learning with PyTorch

For training models, use TileDB-SOMA-ML. The former `cellxgene_census.experimental.ml` PyTorch loaders are deprecated and scheduled for removal.

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

        # Training loop
        for epoch in range(num_epochs):
            dataset.set_epoch(epoch)
            for X, obs in dataloader:
                labels = obs["cell_type"]

                # Forward pass
                outputs = model(X)
                loss = criterion(outputs, labels)

                # Backward pass
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
```

**Train/test splitting:**
```python
train_dataset, test_dataset = dataset.random_split(0.8, 0.2, seed=42)
train_loader = experiment_dataloader(train_dataset, num_workers=2)
test_loader = experiment_dataloader(test_dataset, num_workers=2)
```

Use `batch_size` and `shuffle` on `ExperimentDataset`, not on `torch.utils.data.DataLoader`; `experiment_dataloader()` rejects DataLoader-level `batch_size`, `shuffle`, `sampler`, and `batch_sampler` arguments.

### 6. Spatial Census Data

Spatial data is available for supported Census releases in a separate `census_spatial_sequencing` collection. Use the spatial extra and a current TileDB-SOMA version when querying Visium or Slide-seq V2 data:

```python
import cellxgene_census
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

### 7. Integration with Scanpy

Seamlessly integrate Census data with scanpy workflows:

```python
import scanpy as sc

# Load data from Census
adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",
    obs_value_filter="cell_type == 'neuron' and tissue_general == 'cortex' and is_primary_data == True",
)

# Standard scanpy workflow
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata, n_top_genes=2000)

# Dimensionality reduction
sc.pp.pca(adata, n_comps=50)
sc.pp.neighbors(adata)
sc.tl.umap(adata)

# Visualization
sc.pl.umap(adata, color=["cell_type", "tissue", "disease"])
```

### 8. Multi-Dataset Integration

Query and integrate multiple datasets:

```python
# Strategy 1: Query multiple tissues separately
tissues = ["lung", "liver", "kidney"]
adatas = []

for tissue in tissues:
    adata = cellxgene_census.get_anndata(
        census=census,
        organism="Homo sapiens",
        obs_value_filter=f"tissue_general == '{tissue}' and is_primary_data == True",
    )
    adata.obs["tissue"] = tissue
    adatas.append(adata)

# Concatenate with AnnData's current API
import anndata as ad
combined = ad.concat(adatas, label="tissue", keys=tissues)

# Strategy 2: Query multiple datasets directly
adata = cellxgene_census.get_anndata(
    census=census,
    organism="Homo sapiens",
    obs_value_filter="tissue_general in ['lung', 'liver', 'kidney'] and is_primary_data == True",
)
```
