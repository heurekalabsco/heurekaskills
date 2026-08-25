---
name: codex-phenocycler
description: Take a CODEX or PhenoCycler image from pixels to a cell-by-marker table — choosing segmentation channels, running Cellpose over a multiplex stack, measuring per-cell intensity in micrometres, and building the AnnData that spatial analysis starts from. Includes the licence and token gates on the tools this workflow is usually built with.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [microscopy, multiplex-imaging, segmentation, spatial, single-cell]
datasets: [https://downloads.openmicroscopy.org/images/Vectra-QPTIFF/perkinelmer/PKI_fields/LuCa-7color_%5B13860%2C52919%5D_1x1component_data.tif]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-25
  against: cellpose 4.2.1.1 (Cellpose-SAM) on MPS / tifffile 2026.8.23 / scikit-image 0.26.x / anndata 0.13.x / scanpy 1.12.3 / squidpy 1.8.3 / numpy 2.5.2 / Python 3.12.8 / PerkinElmer Vectra LuCa-7color component field
  executed: 11
  unverified: 0
---

# From a CODEX image to a cell table

A PhenoCycler or CODEX run produces one enormous multichannel image and the expectation
that a table of typed, positioned cells will come out the other end. The chain is:
read the file, choose which channels define a cell, segment, measure every marker inside
every mask, assemble an `AnnData`, cluster, and confirm the cell types by eye before
anybody builds on them.

Each step has one decision that carries the result and several that do not. This page is
about the ones that do.

Reading the file — channel names, pixel size, regions rather than slides — is its own
problem, and the `multiplex-imaging-io` skill covers it. The spatial statistics that come
after the table are covered by `spatial-phenotyping`. This page is the middle.

## Before you start: two gates on the obvious tools

The published workflow for this task is **SPACEc** (Nat Commun 2025), and the CLI
alternative is **multiplex-imaging-pipeline** with DeepCell's Mesmer. Both are worth
knowing about, and neither is the route this page takes.

**SPACEc is licensed for academic non-commercial use only.** Its `LICENSE.txt` is a
Stanford Academic Software License Agreement, under which the recipient

> agrees to use the Software solely for internal academic non-commercial purposes and
> shall not distribute or transfer it to another location or to any other person without
> prior written permission from STANFORD. In particular, no article in this license grants
> commercial use rights to RECIPIENT.

The same agreement also states that the recipient "may NOT make modifications to the
Software or integrate Software into RECIPIENT's own software". If you are at an academic
institution and staying inside it, that is a route you can take, and the paper is the
reference for the method. If you are anywhere else, it is not, and no amount of tooling
changes that. Read the licence yourself before installing it.

**DeepCell's Mesmer needs an account token.** `deepcell-tf` itself is Apache-2.0, but the
model weights are fetched with a `DEEPCELL_ACCESS_TOKEN` obtained by registering at
`users.deepcell.org`. That is an ordinary requirement — any reader can register — but it is
a requirement, and it belongs in your setup notes rather than being discovered at the
segmentation step. `multiplex-imaging-pipeline` (MIT) wraps it as `segment-ome`, and its
last release predates the numpy 2 transition, so expect to pin an environment for it.

**Cellpose is BSD-3-Clause, on PyPI, and downloads its weights anonymously.** That is why
the worked path below uses it. It is not a claim that it segments better than Mesmer — for
membrane-based whole-cell segmentation on multiplex data, Mesmer is the stronger published
result — only that it is a path every reader can actually take.

```bash
pip install cellpose tifffile imagecodecs scikit-image anndata scanpy squidpy
```

A GPU helps and is not required: `cellpose.core.use_gpu()` reports what it found, and CUDA
and Apple MPS both count. A 700x700 two-channel crop segments in about 4 seconds on MPS.

## Choose the segmentation channels deliberately

This is the decision that determines every number downstream, and it is usually made by
whatever the tutorial happened to use.

**A nuclear channel is mandatory.** DAPI, Hoechst, or the equivalent. It is what tells the
segmenter where cells are.

**A membrane or cytoplasmic channel is optional and changes what you measure.** Nuclei-only
segmentation gives you nuclear masks; any marker that lives in the membrane or cytoplasm is
then measured over the wrong compartment, and CD8 on a T cell will read as background.
Adding a membrane channel gives you whole-cell masks and the marker intensities mean what
their names suggest.

There is rarely one membrane channel that covers every cell type — a pan-cytokeratin marks
epithelium and says nothing about lymphocytes. The usual compromise is a sum of two or
three broad markers. State which, because the segmentation is not reproducible without it.

Measured on the 700x700 crop of the Vectra field used below:

| Segmentation input | Objects found |
|---|---|
| DAPI alone | 1424 |
| DAPI + CK (Opal 690) | 1334 |

Both are defensible; they are not the same set of cells, and the second is the one where a
cytoplasmic measurement means something. Never pick these channels by index — resolve them
by marker name, because the position of DAPI is a property of the vendor's export and not
of your panel.

### Segmentation is reproducible on CPU and not on a GPU

Running the identical two-channel input through the identical model three times:

| Device | Object count | Label image identical between runs |
|---|---|---|
| Apple MPS | 1334, 1334, 1334 | **no** — run 1 differed from run 2 |
| CPU | 1335, 1335 | yes, bitwise |

The counts agree and the masks do not, and CPU finds one object that MPS does not. That is
a 0.07% difference, which is nothing for a composition estimate and is not nothing for a
result someone will try to reproduce exactly.

So: **segment once, save the label image, and measure from the saved labels.** Re-running
segmentation as part of a downstream script means the numbers move slightly every time and
nobody can tell whether a change came from the analysis or the accelerator. Record the
device alongside the model version.

```python
import numpy as np, tifffile
import xml.etree.ElementTree as ET
from cellpose import models

with tifffile.TiffFile(path) as tf:
    names = [(ET.fromstring(p.description).findtext("Name") or "").strip() for p in tf.pages]
    kinds = [ET.fromstring(p.description).findtext("ImageType") for p in tf.pages]
    stack = tf.series[0].asarray()

channels = [n for n, k in zip(names, kinds) if k == "FullResolution"]
index_of = {n: i for i, n in enumerate(channels)}

seg_input = np.stack([stack[index_of["DAPI"]],
                      stack[index_of["CK (Opal 690)"]]])        # (C, Y, X)
labels = models.CellposeModel(gpu=True).eval(seg_input, channel_axis=0, batch_size=8)[0]
print(labels.shape, labels.dtype, int(labels.max()))            # (700, 700) uint16 1334
```

`channel_axis=0` is what tells Cellpose the leading axis is channels rather than the first
spatial axis. Omit it on a `(2, Y, X)` array and it interprets the stack as a two-row image.

## Tile a slide; do not feed it whole

A whole PhenoCycler slide is orders of magnitude larger than anything a segmenter will hold.
Read a pyramid level or a region for anything exploratory, and tile with overlap for the
real run.

The overlap is not optional and the deduplication is the part people get wrong. Cells
straddling a tile boundary are segmented twice, once partially in each tile. Discard the
objects that touch a tile edge rather than trying to merge them — a partial mask has a
smaller area and a truncated intensity profile, so keeping both halves is worse than
keeping neither, and the cells you lose are recovered from the neighbouring tile where they
sit in the interior.

```python
from skimage.segmentation import clear_border

tile_labels = clear_border(tile_labels)      # drops objects touching this tile's edge
```

On the 700x700 crop below that drops 1335 objects to 1242 — **7% of the cells sit on the
border of a single tile**. That is the fraction you must recover from neighbouring tiles,
and it is why the overlap has to be real rather than nominal: with no overlap you would
simply have lost them.

Choose the overlap from the largest cell you expect — two cell diameters is a safe default —
and keep a global offset so coordinates stay in slide space rather than tile space.

## Measure inside the masks, on the original data

```python
import pandas as pd
from skimage.measure import regionprops_table

markers = [n for n in channels if n not in ("DAPI", "Autofluorescence")]

props = regionprops_table(labels, properties=("label", "centroid", "area"))
X = np.column_stack([
    regionprops_table(labels, intensity_image=stack[index_of[m]],
                      properties=("intensity_mean",))["intensity_mean"]
    for m in markers
])
```

**Exclude the autofluorescence component and the nuclear stain from the marker matrix.**
Autofluorescence is an unmixing artefact, not an antibody; DAPI is present on every cell
by construction. Both behave like high-variance markers in a clustering run and both will
drive clusters that mean nothing.

**Mean, not sum.** Total intensity scales with cell area, so a summed matrix clusters
primarily on size. If you want the size, carry it as a column in `obs`, where it is a
covariate you can look at rather than a hidden component of every marker.

**Convert to micrometres at this point**, using the pixel size from the file. Areas in
pixels are not comparable to anything from another instrument, and the coordinates feed
distance-based statistics downstream where the units matter.

```python
import anndata as ad

a = ad.AnnData(
    X.astype(np.float32),
    obs=pd.DataFrame({"area_um2": props["area"] * um_px**2},
                     index=[f"cell_{i}" for i in props["label"]]),
    var=pd.DataFrame(index=[m.split(" (")[0] for m in markers]),
)
a.obsm["spatial"] = np.column_stack([props["centroid-1"],      # x = column
                                     props["centroid-0"]]) * um_px   # y = row
a.obs["image_id"] = pd.Categorical(["LuCa-7color-field-1"] * a.n_obs)
a.layers["raw"] = a.X.copy()
```

`regionprops` returns `centroid-0` as the **row** and `centroid-1` as the **column**, while
`obsm["spatial"]` is conventionally `(x, y)`. Swapping them transposes your tissue, which
leaves every neighbourhood statistic valid-looking and wrong.

Set `image_id` even for a single field — the spatial tools need it the moment a second
image arrives, and adding it later means rewriting the object. **Make it a `Categorical`,
not a string.** `a.obs["image_id"] = "field-1"` produces a string column and squidpy
refuses it later with `TypeError: Expected adata.obs['image_id'] to be categorical, found
string` — several steps after the mistake, in a function that has nothing to do with it.

Sanity-check the areas against the biology before going further. A median of 47.7 um^2 on
this field is a small nucleus-plus-rim, which is what a DAPI+CK segmentation of dense
carcinoma should give. A median in the hundreds means the masks have merged cells.

## Cluster, then confirm the cell types by hand

Transform, cluster, and then — this is the step that matters — **look at the marker means
before naming anything**.

```python
import scanpy as sc

a.X = np.arcsinh(a.X / 5.0)
sc.pp.scale(a, max_value=10)
sc.pp.neighbors(a, n_neighbors=15, random_state=0)
sc.tl.leiden(a, resolution=0.5, key_added="cluster",
             flavor="igraph", n_iterations=2, random_state=0)

means = (pd.DataFrame(np.asarray(a.layers["raw"]), index=a.obs_names, columns=a.var_names)
           .groupby(a.obs["cluster"].values, observed=True).mean())
print(means.round(2).to_string())
```

On the Vectra field, resolution 0.5 gives 11 clusters and the table contains rows like
these — quoted by what they contain rather than by cluster number, because the numbering is
not stable across runs on a GPU:

```
    PDL1   CD8  FoxP3  CD68    PD1    CK
    1.12  0.14   0.19  0.11   3.03   6.76      <- CK-high: tumour
    1.14  0.13   0.20  0.09   3.05   9.14      <- CK-high: tumour, indistinguishable from the row above
    4.60  0.11   0.17  0.50  19.44   0.72      <- PD1-high
    3.90  3.75   0.37  0.24   5.81   1.13      <- CD8-high: cytotoxic T cell
    4.66  0.13   2.75  0.54  10.46   0.60      <- FoxP3-high: regulatory T cell
```

Three things that table tells you and the clustering does not.

**Some clusters are namable and some are not.** The CD8-high and FoxP3-high rows have one
marker an order of magnitude above every other cluster. The two CK-high rows differ in
nothing you can name. Leave the second kind unnamed. `cluster_6` in a results table is
honest; `Tumour subtype B` is a claim nobody made.

**A marker in the panel is not a cell type in the data.** CD68's highest cluster mean here
is 1.21, against a 99th-percentile whole-field intensity of 1.65 — the dimmest channel in
the panel. No macrophage population separates at resolution 0.2, 0.5 or 1.0. That is a real
result about this field and this panel, and it must be reported rather than papered over.

**Never take the argmax.** Every cluster has a highest marker whether or not any marker is
elevated, so `means.idxmax(axis=1)` returns a full set of confident labels from a table
that supports two of them. It is the single fastest way to publish invented cell types.

Then write the annotation as an explicit, auditable map — and surface it for a person to
confirm, because on this data it is a proposal, not a measurement:

```python
a.obs["cell_type"] = (a.obs["cluster"]
    .map({"0": "Tumour", "1": "Tumour", "3": "CD8 T cell", "8": "Treg"})
    .astype("object").fillna("unassigned").astype("category"))
print(a.obs.cell_type.value_counts().to_dict())
```

## Neighborhoods, and where this hands off

With cell types on the object, the first spatial question is which types sit together:

```python
import squidpy as sq

sq.gr.spatial_neighbors(a, library_key="image_id", coord_type="generic", delaunay=True)
sq.gr.nhood_enrichment(a, cluster_key="cell_type", seed=0, show_progress_bar=False)
```

Pass `library_key` from the start. On one image it changes nothing; the moment the object
holds two, omitting it builds edges between cells on different slides, and the result stays
plausible. The `spatial-phenotyping` skill covers that failure, the permutation nulls,
Ripley's L, cellular neighborhoods, and the aggregation to patients that any group
comparison needs.

## What to write into the project

```python
a.write_h5ad("cells.h5ad")                       # the object everything downstream reads
tifffile.imwrite("labels.tif", labels)           # the mask, so measurements are re-derivable
means.round(3).to_csv("cluster_marker_means.csv")
```

Plus a written summary — not comments in a notebook — recording which channels were used
for segmentation and why, the pixel size and where it came from, the arcsinh cofactor, the
Leiden resolution, which clusters were named and on what marker evidence, and which were
left unassigned. Every one of those is a decision that changes the cell counts, and none of
them is recoverable from the `.h5ad`.

## Try it

**Data.** The PerkinElmer Vectra 7-colour lung carcinoma component field, `LuCa-7color`,
from the Open Microscopy public sample set — 8 unmixed component layers including DAPI,
CD8, FoxP3, CD68, PD1, PD-L1 and pan-cytokeratin. Released by PerkinElmer under
**CC-BY-4.0** (see `COPYING` beside the file), 85 MB, no account. Confirmed reachable on
25 Aug 2026. It is a Vectra field rather than a PhenoCycler slide, which makes it small
enough to run in a minute while carrying the same structure: named channels, a nuclear
stain that is not channel 0, a real membrane marker, and a per-page pixel size.

**Run.** Cellpose downloads its weights on first use, from a public host, without an
account. About a minute on a GPU or Apple MPS, a few minutes on CPU.

```bash
pip install cellpose tifffile imagecodecs scikit-image anndata scanpy squidpy
curl -L -o LuCa.tif \
  "https://downloads.openmicroscopy.org/images/Vectra-QPTIFF/perkinelmer/PKI_fields/LuCa-7color_%5B13860%2C52919%5D_1x1component_data.tif"
```

```python
import xml.etree.ElementTree as ET
import numpy as np, pandas as pd, tifffile, anndata as ad, scanpy as sc
from cellpose import models
from skimage.measure import regionprops_table

with tifffile.TiffFile("LuCa.tif") as tf:
    names = [(ET.fromstring(p.description).findtext("Name") or "").strip() for p in tf.pages]
    kinds = [ET.fromstring(p.description).findtext("ImageType") for p in tf.pages]
    stack = tf.series[0].asarray()
    num, den = tf.pages[0].tags["XResolution"].value

um_px = 1e4 / (num / den)
channels = [n for n, k in zip(names, kinds) if k == "FullResolution"]
index_of = {n: i for i, n in enumerate(channels)}
markers = [n for n in channels if n not in ("DAPI", "Autofluorescence")]
print("channels", channels)
print("DAPI index", index_of["DAPI"], "| um/pixel", round(um_px, 4), "| markers", len(markers))

crop = stack[:, :700, :700]
model = models.CellposeModel(gpu=True)
nuc_only = model.eval(crop[index_of["DAPI"]], batch_size=8)[0]
labels = model.eval(np.stack([crop[index_of["DAPI"]], crop[index_of["CK (Opal 690)"]]]),
                    channel_axis=0, batch_size=8)[0]
print("objects: DAPI alone", int(nuc_only.max()), "| DAPI+CK", int(labels.max()))

props = regionprops_table(labels, properties=("label", "centroid", "area"))
X = np.column_stack([
    regionprops_table(labels, intensity_image=crop[index_of[m]],
                      properties=("intensity_mean",))["intensity_mean"]
    for m in markers])

a = ad.AnnData(X.astype(np.float32),
               obs=pd.DataFrame({"area_um2": props["area"] * um_px**2},
                                index=[f"cell_{i}" for i in props["label"]]),
               var=pd.DataFrame(index=[m.split(" (")[0] for m in markers]))
a.obsm["spatial"] = np.column_stack([props["centroid-1"], props["centroid-0"]]) * um_px
a.obs["image_id"] = pd.Categorical(["LuCa-7color-field-1"] * a.n_obs)
a.layers["raw"] = a.X.copy()
print("AnnData", a.shape, "| median area um2", round(float(np.median(a.obs.area_um2)), 1))

a.X = np.arcsinh(a.X / 5.0)
sc.pp.scale(a, max_value=10)
sc.pp.neighbors(a, n_neighbors=15, random_state=0)
sc.tl.leiden(a, resolution=0.5, key_added="cluster",
             flavor="igraph", n_iterations=2, random_state=0)
means = (pd.DataFrame(np.asarray(a.layers["raw"]), index=a.obs_names, columns=a.var_names)
           .groupby(a.obs["cluster"].values, observed=True).mean())
print("clusters", a.obs.cluster.nunique())
print(means.round(2).to_string())
print("highest cluster mean per marker:", means.max().round(2).to_dict())

# DAPI is not channel 0, and the marker matrix excludes it and autofluorescence.
assert index_of["DAPI"] != 0
assert "DAPI" not in list(a.var_names) and "Autofluorescence" not in list(a.var_names)
assert a.n_vars == len(channels) - 2
# One row per label, and labels are 1..N with no gaps.
assert a.n_obs == int(labels.max()) == len(set(props["label"]))
# Coordinates are inside the crop, in micrometres.
assert a.obsm["spatial"].min() >= 0
assert a.obsm["spatial"].max() <= 700 * um_px
# CD8 separates into a cluster; CD68 does not rise above the noise anywhere.
assert means["CD8"].max() > 5 * means["CD8"].median()
assert means["CD68"].max() < means["CD8"].max()
print("OK")
```

**Expect.**

Invariants — a failure means the skill is wrong:

- `index_of["DAPI"]` is not 0, so any positional segmentation-channel choice is wrong on
  this file.
- The marker matrix has exactly `len(channels) - 2` columns: DAPI and Autofluorescence are
  excluded by name, not by position.
- `a.n_obs` equals `labels.max()` — Cellpose labels are consecutive from 1, so one row per
  object with no gaps. A mismatch means objects were dropped between segmentation and
  measurement.
- Coordinates lie within the crop, in micrometres: `0 <= spatial <= 700 * um_px`. A
  transposed or unconverted coordinate breaks this.
- `centroid-0` is the row and `centroid-1` is the column, so `obsm["spatial"]` takes them
  in the order `(centroid-1, centroid-0)`.
- The CD8 cluster mean is several times the median cluster mean, while CD68's peak stays
  below CD8's — the panel contains a marker that does not resolve, which is the case the
  annotation step has to survive.

Observed values, from a run on 25 Aug 2026 against cellpose 4.2.1.1 on Apple MPS — these
move with the Cellpose model version, and, per the determinism section above, slightly
between runs on a GPU:

- 8 channels; DAPI at index 6; 0.498 um/pixel; 6 markers after exclusions.
- 700x700 crop: **1424** objects from DAPI alone, **1334** from DAPI + CK. On CPU the
  DAPI + CK count is 1335.
- Median cell area 47.7 um^2.
- Leiden at 0.5: 11 clusters. Highest cluster mean per marker — PDL1 9.42, CD8 3.75,
  FoxP3 2.75, CD68 1.21, PD1 19.44, CK 9.14. Across two runs these varied in the second
  significant figure (FoxP3 2.75-2.96, CK 8.79-9.14) while the ordering never changed.
- One CD8-high cluster at 3.75 against 0.11-0.22 elsewhere; one FoxP3-high cluster; three
  CK-high clusters that are mutually indistinguishable. Cluster *numbers* are not stable
  between runs — match clusters by their marker profile, not by id.

**Across other inputs.** The channel-resolution, measurement and AnnData-assembly code was
re-run on the two H&E component files in the same sample directory, whose channels are
`['Eosin', 'Hematoxylin']` with no DAPI at all. It fails at exactly the right place — the
`index_of["DAPI"]` lookup raises `KeyError` — rather than silently segmenting on
Hematoxylin. That is the behaviour to preserve when you adapt this: resolve segmentation
channels by name and let a missing one raise, because the alternative is a full cell table
built on the wrong compartment.
