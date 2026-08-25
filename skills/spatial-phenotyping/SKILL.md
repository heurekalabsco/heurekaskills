---
name: spatial-phenotyping
description: Spatial statistics on a segmented multiplex dataset — a cell-by-marker AnnData with coordinates, from CODEX, MxIF, IMC or MIBI. Phenotyping, neighborhood enrichment, cellular neighborhoods, Ripley's L and co-occurrence, with the per-slide graph construction and per-patient aggregation that keep the statistics honest.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [spatial, single-cell, multiplex-imaging, h5ad, statistics]
datasets: [https://exampledata.scverse.org/squidpy/mibitof.h5ad]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-25
  against: squidpy 1.8.3 / scanpy 1.12.3 / anndata 0.13.x / numpy 2.5.2 / pandas 3.x / Python 3.12.8 / squidpy MIBI-TOF example dataset (3309 cells, 36 markers, 3 ROIs, 2 donors)
  executed: 17
  unverified: 1
  unverified_reason: >-
    The SPAC install block is not executed. SPAC is not published to PyPI or conda-forge
    and its documented install is a conda environment built from the repository, pinned
    to a custom package channel; the validating environment installs from PyPI only.
    Everything the block would set up has an executed squidpy equivalent on this page.
    Re-run it from a conda environment created with the repository's own
    environment.yml.
---

# Spatial statistics on segmented multiplex data

This starts where segmentation ends: a cell-by-marker matrix with an `x` and a `y` for
every cell. The image is gone; what is left is a point pattern with attributes, and the
questions are about arrangement — which cell types sit next to which, whether a type
clusters or disperses, whether any of it differs between patients.

The statistics are the easy part. Every library below computes neighborhood enrichment
correctly. What goes wrong is upstream of the statistic: a graph built across slides that
are not adjacent, a permutation null that permutes the wrong thing, and a p-value computed
over cells when the samples are patients. All three produce a number, a figure, and a
conclusion.

Nothing here needs an account or a GPU.

## The object

One `AnnData`. Cells in `obs`, markers in `var`, intensities in `X`, coordinates in
`obsm["spatial"]` as an `(n_cells, 2)` array, and — this is the part that is usually
missing — a column in `obs` naming the **image, ROI or slide** each cell came from, and
another naming the **patient or specimen**.

```python
import anndata as ad
a = ad.read_h5ad("cells.h5ad")
a                       # AnnData object with n_obs x n_vars = 3309 x 36
a.obsm["spatial"].shape # (3309, 2)
a.obs[["library_id", "donor"]].value_counts()
```

Keep every annotation in `.obs` and every embedding in `.obsm`. That is what makes the
object portable to any scverse tool and what makes the file the analysis rather than a
step in it.

If the coordinates are in pixels, convert them to micrometres once, at the point you write
the object, using the pixel size out of the acquisition file. Every distance below —
Ripley's radii, co-occurrence intervals, neighbourhood radii — is in the units of
`obsm["spatial"]`, and a radius of 50 means something different in every dataset otherwise.

## Build the graph per image. This is the one that ruins results silently

`squidpy` builds a neighbour graph from the coordinates. Every ROI in a multi-sample
object typically starts its coordinate system at the origin, so a single graph over the
whole object connects cells that were never within a millimetre of each other.

Measured on the squidpy MIBI-TOF example — three colorectal ROIs, all spanning roughly
x 1-1021, y 1-1021:

```python
import squidpy as sq

wrong = a.copy()
sq.gr.spatial_neighbors(wrong, coord_type="generic", delaunay=True)

right = a.copy()
sq.gr.spatial_neighbors(right, library_key="library_id",
                        coord_type="generic", delaunay=True)
```

| | Edges | Edges joining cells from different ROIs |
|---|---|---|
| no `library_key` | 19,792 | **13,276 (67%)** |
| `library_key="library_id"` | 19,720 | 0 |

Two thirds of the graph is fictional. And the consequence is not noise — it is a
systematically different answer that still looks reasonable:

| | Epithelial self-enrichment z-score |
|---|---|
| no `library_key` | 19.0 |
| `library_key="library_id"` | **72.3** |

Nothing raises, nothing warns, and the wrong number is the smaller one, so it reads as a
conservative result. **Pass `library_key` whenever the object holds more than one image**,
and check it afterwards rather than trusting it:

```python
import numpy as np

lib = a.obs["library_id"].to_numpy()
edges = right.obsp["spatial_connectivities"].tocoo()
assert (lib[edges.row] != lib[edges.col]).sum() == 0
```

Three lines, run once, and they close the failure mode entirely.

The same rule covers functions that have no `library_key` argument. `sq.gr.ripley` and
`sq.gr.co_occurrence` compute over the whole object, so subset per image and loop:

```python
for roi in a.obs["library_id"].cat.categories:
    sub = a[a.obs["library_id"] == roi].copy()
    sq.gr.ripley(sub, cluster_key="Cluster", mode="L", n_simulations=100, seed=0)
    ...
```

`.copy()` matters — a view raises on write, and these functions write into `uns`.

## Transform intensities before you cluster them

Marker intensities are not counts and are not log-normal. They span orders of magnitude
between markers, they have a nonzero background, and a handful of cells are far brighter
than the rest.

**Check first whether somebody already transformed it.** A published `.h5ad` frequently
arrives normalised, and arcsinh on top of a z-score is meaningless. The MIBI-TOF example
used in `## Try it` below has `X` running -0.599 to 0.717 — plainly not raw intensity.
One line, before anything else:

```python
print(float(a.X.min()), float(a.X.max()))
```

Raw multiplex intensity is non-negative and skewed, typically spanning two or three orders
of magnitude. Anything centred on zero has been processed, and the processing is usually
undocumented in the file.

**arcsinh** is the standard in the cytometry lineage that CODEX and IMC inherit from. It
is linear near zero — so background stays background rather than being blown up the way
`log1p` does — and logarithmic above the cofactor:

```python
import numpy as np
a.layers["raw"] = a.X.copy()
a.X = np.arcsinh(a.X / 5.0)      # cofactor 5 for fluorescence; 150 is typical for CyTOF
```

The cofactor is a real parameter. Too small and background noise is expanded into
structure; too large and everything is squashed linear. Pick it by looking at where each
marker's negative population sits, and record it — a clustering result is not reproducible
without it.

Then z-score **per marker**, so no single bright channel dominates the distance metric:

```python
import scanpy as sc
sc.pp.scale(a, max_value=10)
```

Scale after arcsinh, not instead of it. And keep `raw` — every annotation decision below
is made by looking at untransformed intensities, because that is the scale on which
"positive" means anything.

### Batch effects between runs are not the same as between patients

Marker intensity drifts between acquisition runs: antibody lot, exposure, scanner
calibration. If you correct it, correct on the **run**, not the patient, and check what
you removed. Cross-slide correction that uses the patient as the batch variable removes
the between-patient difference you are trying to measure. If run and patient are
confounded — one slide per patient, run in order — no correction can separate them, and
the honest move is to say so rather than to apply one.

## Phenotyping: gate or cluster, and check either

**Gating** applies per-marker thresholds and is defensible when the panel is well
characterised and the thresholds come from a control. It is reproducible, it is auditable,
and it puts every cell into exactly one place you chose.

**Clustering** finds structure without thresholds and is what most workflows use. It is
also where cell types get invented. Measured on a Cellpose-segmented Vectra 7-colour field
— 1,334 cells, six markers — at three Leiden resolutions, everything else held fixed:

| Resolution | Clusters | Highest cluster mean: CD8 / FoxP3 / CD68 |
|---|---|---|
| 0.2 | 6 | 3.87 / 0.97 / 0.66 |
| 0.5 | 11 | 3.75 / 2.96 / 1.30 |
| 1.0 | 14 | 3.71 / 2.80 / 1.21 |

At 0.2 the FoxP3 cells are absorbed into other clusters and no cluster's FoxP3 mean gets
above 1. At 0.5 a FoxP3-high cluster separates cleanly at 2.96. Going on to 1.0 adds three
more clusters and no new marker separation at all — it splits the CK-high tumour
compartment into four clusters whose means differ in nothing nameable.

None of that is visible in the clustering. You have to look at the marker means:

```python
import numpy as np, pandas as pd
raw = np.asarray(a.layers["raw"])                 # .toarray() if it is sparse
means = (pd.DataFrame(raw, index=a.obs_names, columns=a.var_names)
           .groupby(a.obs["cluster"].values, observed=True).mean())
print(means.round(2).to_string())
```

`np.asarray` on a sparse layer returns a 1-element object array and `pd.DataFrame` then
fails with a shape mismatch rather than doing anything sensible — call `.toarray()` when
`a.layers["raw"]` is sparse, which it will be on anything that came through scanpy.

**A marker in the panel is not a cell type in the data.** In the same run CD68's best
cluster mean is 1.30, against a 99th-percentile raw intensity of 1.65 across all cells —
the dimmest channel in the panel. CD8 by contrast reaches 3.75 in one cluster while sitting
at 0.11-0.22 in every other. There is no macrophage cluster to find here, at any
resolution, even though CD68 is in the panel and macrophages are in the tissue. Reporting
"no macrophages" from that would be wrong; naming a CD68-high cluster the data does not
support would be worse. The honest output is that the panel included CD68 and the clustering
did not resolve it.

So: print the table, name clusters from the markers that are actually elevated, leave the
ones you cannot name unnamed, and say in the write-up which is which. An unnamed cluster
is honest. A cluster named from the argmax of six markers is not — the argmax is defined
for every cluster whether or not any marker is elevated.

```python
a.obs["cell_type"] = a.obs["cluster"].map({
    "3": "CD8 T cell",
    "8": "Treg",
    "0": "Tumour", "1": "Tumour", "7": "Tumour",
}).astype("object").fillna("unassigned").astype("category")
```

## Neighborhood enrichment

Are cells of type A found next to cells of type B more often than chance? `squidpy`
answers it by permuting cluster labels over the fixed graph and comparing the observed
adjacency count to the null:

```python
sq.gr.nhood_enrichment(a, cluster_key="cell_type", seed=0, n_perms=1000)
z = a.uns["cell_type_nhood_enrichment"]["zscore"]
```

The matrix is symmetric, and its diagonal is self-enrichment — how strongly a type sits
with its own kind. On the MIBI-TOF data with the correct per-ROI graph: Epithelial 72.3,
Fibroblast 31.7, CD4 T 26.6, CD8 T 26.4.

Three things to hold onto.

**The null permutes labels, not positions.** The tissue architecture is held fixed and
only the cell-type assignment is shuffled, which is the right null for "given where the
cells are, is this labelling non-random". It is not a null for "is this tissue organised",
and the z-score is not comparable across datasets with different densities or different
graph constructions.

**The z-score is not a p-value and it is not calibrated.** With thousands of cells and a
dense graph, z-scores in the tens are ordinary. Use them to rank pairs within one dataset,
not to declare significance.

**It inherits every graph decision.** Delaunay versus k-nearest versus a fixed radius
changes the answer, because it changes what "next to" means. State the construction with
the result. A fixed radius in micrometres is the most interpretable of the three and the
most sensitive to segmentation density.

## Cellular neighborhoods

A neighborhood is a *region* type rather than a cell type: describe each cell by the
composition of cells around it, then cluster those composition vectors.

```python
import numpy as np, pandas as pd
from sklearn.cluster import KMeans

A = a.obsp["spatial_connectivities"]
onehot = pd.get_dummies(a.obs["cell_type"]).to_numpy(float)
comp = A @ onehot                                    # neighbour counts per cell
comp = comp / np.clip(comp.sum(1, keepdims=True), 1, None)
a.obs["neighborhood"] = pd.Categorical(
    KMeans(n_clusters=8, n_init=10, random_state=0).fit_predict(comp))
```

The number of neighborhoods is as arbitrary as a Leiden resolution and gets less scrutiny.
Report the composition matrix — mean fraction of each cell type per neighborhood — beside
the count, so a reader can see whether eight neighborhoods describe eight distinguishable
regions or three regions and five variations on one.

Cells at the edge of an ROI have fewer neighbours than cells in the middle, so their
composition vectors are noisier and biased toward whatever is inside the boundary. Either
exclude a border margin or carry the neighbour count as a covariate; do not ignore it.

## Ripley's L and co-occurrence

Ripley's L asks whether one cell type clusters or disperses relative to complete spatial
randomness, as a function of radius. Above the CSR line means clustered; below means
regularly spaced.

```python
for roi in a.obs["library_id"].cat.categories:
    sub = a[a.obs["library_id"] == roi].copy()
    sq.gr.ripley(sub, cluster_key="cell_type", mode="L", n_simulations=100, seed=0)
    stat = sub.uns["cell_type_ripley_L"]["L_stat"]
```

**Edge correction is not optional.** A cell near the boundary of an ROI has part of its
neighbourhood outside the imaged region, so the uncorrected count is low and every type
looks more dispersed than it is. The effect grows with the radius, so the bias is largest
exactly where the interesting structure usually is. Cap the radii you interpret at a
fraction of the ROI's short side — a quarter is a common rule — and say what you capped at.

**Simulations are per-ROI.** The CSR envelope depends on the ROI's shape and cell density,
so an envelope computed on a pooled object is not the envelope for any of the ROIs in it.

Co-occurrence answers a related question — the probability of finding type B within a
distance of type A, relative to B's overall frequency — and is less sensitive to the graph
because it works from distances directly:

```python
sq.gr.co_occurrence(sub, cluster_key="cell_type")
```

## The unit of replication is the patient, not the cell

This is the error that survives peer review most often, and it is arithmetic rather than
biology. The MIBI-TOF example holds **3,309 cells**, from **3 ROIs**, from **2 donors**:

```
donor  library_id
21d7   point23       1241
90de   point16       1023
       point8        1045
```

A test comparing cell-level values between conditions with n = 3,309 is answering "do
these two collections of cells differ", which they always do, because cells within one
patient are not independent draws. The n that a clinical claim rests on is 2.

So aggregate first, then test:

```python
frac = (a.obs.groupby(["library_id", "cell_type"], observed=True).size()
          .unstack(fill_value=0)
          .pipe(lambda d: d.div(d.sum(axis=1), axis=0)))
frac.to_csv("per_roi_composition.csv")
```

On this dataset that yields three rows — one per ROI — and the between-ROI spread is large:
Epithelial runs 0.102, 0.206, 0.391 and CD4 T runs 0.078, 0.220, 0.396. Two of those ROIs
are the same donor. Any statistic that treated the 3,309 cells as independent would have
called differences of that size overwhelmingly significant.

Then:

- **Multiple ROIs per patient are nested, not replicated.** Average them to the patient
  first, or fit a mixed model with patient as a random effect. Treating three ROIs from one
  patient as n = 3 is the same error one level up.
- **The same rule applies to the spatial statistics**, not only to composition. Compute
  neighborhood enrichment per ROI, aggregate to the patient, and compare those. A z-score
  from a graph pooled over both groups has no replication structure at all.
- **Say the n out loud in the write-up**, as patients and as ROIs. A figure captioned
  "n = 3,309 cells" and a figure captioned "n = 2 patients" describe the same experiment,
  and only one of them lets a reader judge it.

## SPAC, scimap and squidpy

- **squidpy** (BSD-3-Clause, scverse) is what this page is written against. It is on PyPI,
  it operates on `AnnData` in place, and it covers the graph, neighborhood enrichment,
  Ripley, co-occurrence and centrality.
- **scimap** (MIT) is on PyPI and adds a gating-first phenotyping workflow, spatial LDA and
  spatial-context maps, on the same `AnnData`.
- **SPAC** (BSD-3-Clause, Frederick National Laboratory) wraps this ground with a
  consistent API and a Shiny front end, and is the package behind the platform paper at
  doi 10.1186/s12859-025-06339-2 and the software paper at doi 10.21105/joss.08787. It is
  **not on PyPI or conda-forge**: the documented install is a conda environment built from
  the repository, which additionally configures a custom package channel for a pinned
  `scimap` build.

```bash
# SPAC — from the repository, not from PyPI
git clone https://github.com/FNLCR-DMAP/SCSAWorkflow.git && cd SCSAWorkflow
conda env create -f environment.yml && conda activate spac
pip install -e .
```

Because all three read and write the same `AnnData`, the choice is about ergonomics rather
than capability, and they compose. Keep the object as the interchange format and none of
this is a commitment.

## What to write out

```python
a.write_h5ad("spatial_analysis.h5ad")           # every annotation in .obs, portable
frac.to_csv("per_roi_composition.csv")          # tidy, one row per ROI
pd.DataFrame(z, index=cats, columns=cats).to_csv("nhood_enrichment_z.csv")
```

Plus a short written summary saying which thresholds and resolutions were chosen and on
what basis, which clusters were named and which were left unassigned, what the graph
construction was, and what the n is in patients. Those are the decisions a reader needs to
disagree with, and none of them is recoverable from the `.h5ad`.

## Try it

**Data.** The `squidpy` MIBI-TOF example — 3,309 cells, 36 markers, three ROIs from
colorectal carcinoma, published by Hartmann et al (doi 10.1101/2020.01.17.909796) and
redistributed by scverse. 20 MB, no account, confirmed reachable on 25 Aug 2026. It is the
right test case here precisely because it has more ROIs than donors, which is the shape
that makes the replication question concrete.

**Run.** Self-contained:

```bash
pip install squidpy scanpy anndata
curl -L -O https://exampledata.scverse.org/squidpy/mibitof.h5ad
```

```python
import anndata as ad, numpy as np, pandas as pd, squidpy as sq

a = ad.read_h5ad("mibitof.h5ad")
lib = a.obs["library_id"].to_numpy()
print("cells", a.n_obs, "| markers", a.n_vars,
      "| ROIs", a.obs.library_id.nunique(), "| donors", a.obs.donor.nunique())
print(a.obs.groupby(["donor", "library_id"], observed=True).size().to_string())

for roi in a.obs.library_id.cat.categories:
    m = lib == roi
    xy = a.obsm["spatial"][m]
    print(f"  {roi}: x {xy[:,0].min():.0f}-{xy[:,0].max():.0f}  "
          f"y {xy[:,1].min():.0f}-{xy[:,1].max():.0f}")

def cross_roi(adata):
    e = adata.obsp["spatial_connectivities"].tocoo()
    return int((lib[e.row] != lib[e.col]).sum()), int(e.nnz)

pooled = a.copy()
sq.gr.spatial_neighbors(pooled, coord_type="generic", delaunay=True)
per_roi = a.copy()
sq.gr.spatial_neighbors(per_roi, library_key="library_id",
                        coord_type="generic", delaunay=True)
print("pooled graph : %d/%d edges cross an ROI boundary" % cross_roi(pooled))
print("per-ROI graph: %d/%d edges cross an ROI boundary" % cross_roi(per_roi))

cats = list(a.obs.Cluster.cat.categories)
epi = cats.index("Epithelial")
for name, obj in [("pooled", pooled), ("per-ROI", per_roi)]:
    sq.gr.nhood_enrichment(obj, cluster_key="Cluster", seed=0, show_progress_bar=False)
    z = obj.uns["Cluster_nhood_enrichment"]["zscore"]
    print(f"{name:8s} Epithelial self-z = {z[epi][epi]:.1f}")

frac = (a.obs.groupby(["library_id", "Cluster"], observed=True).size()
          .unstack(fill_value=0).pipe(lambda d: d.div(d.sum(axis=1), axis=0)))
print("\nper-ROI composition:\n", frac.round(3).to_string())

# The graph must not join cells from different images.
assert cross_roi(per_roi)[0] == 0
assert cross_roi(pooled)[0] > 0.5 * cross_roi(pooled)[1]
# Enrichment is symmetric, and the pooled graph understates self-enrichment here.
zp = per_roi.uns["Cluster_nhood_enrichment"]["zscore"]
assert np.allclose(zp, zp.T, equal_nan=True)
assert zp[epi][epi] > pooled.uns["Cluster_nhood_enrichment"]["zscore"][epi][epi]
# More ROIs than donors: the point of the whole section above.
assert a.obs.library_id.nunique() > a.obs.donor.nunique()
assert np.allclose(frac.sum(axis=1).to_numpy(), 1.0)
print("OK")
```

**Expect.**

Invariants — a failure means the skill is wrong:

- With `library_key`, **zero** edges join cells from different `library_id` values. Without
  it, most edges do — the three ROIs share one coordinate box, so a pooled Delaunay
  triangulation stitches them together.
- `zscore` is symmetric, because adjacency is.
- Every row of the per-ROI composition table sums to 1.
- The dataset has more ROIs than donors, so ROI-level rows are not independent samples.

Observed values, from a run on 25 Aug 2026 against squidpy 1.8.3 — these move if scverse
rebuilds the example or squidpy changes its default graph:

- 3,309 cells, 36 markers, 3 ROIs, 2 donors. `point23` is donor `21d7`; `point8` and
  `point16` are both donor `90de`.
- All three ROIs span roughly x 1-1021, y 1-1021.
- Pooled graph 19,792 edges, **13,276 crossing an ROI boundary**. Per-ROI graph 19,720
  edges, 0 crossing.
- Epithelial self-enrichment z: 19.0 pooled, **72.3** per-ROI.
- Epithelial fraction by ROI: point16 0.206, point23 0.102, point8 0.391.

**Across other data.** The graph check, the arcsinh transform, the resolution comparison
and the aggregation were re-run on a Cellpose-segmented Vectra 7-colour field — a single
ROI, six markers, 1,334 cells — and on the squidpy IMC example (4,668 cells, 34 markers,
one ROI, cell types already assigned). What generalises is all of it except the graph
check, which is vacuous on a single-ROI object; the failure it catches only exists once an
object holds more than one image, which is exactly when nobody remembers to look. What
changes is the clustering: six markers do not support the resolution that thirty-six do,
and the IMC object's marker names arrive as instrument channel strings like
`1021522Tm169Di EGFR`, which need cleaning before any marker-based annotation is legible.
