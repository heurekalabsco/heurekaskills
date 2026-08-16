---
name: microscopy-quantification
description: Quantify fluorescence microscopy images — open acquisition formats with pixel size and channels intact, segment nuclei or cells, and export per-object area, shape, intensity and colocalization as a tidy CSV with QC overlays.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [microscopy, image-analysis, segmentation, cell-counting, scikit-image]
datasets: [https://gitlab.com/scikit-image/data/-/raw/45e2cec9a2ebd24354beccf293e81dabc6220bbe/cells3d-with-metadata.tif]
allowed-tools: Read, Write, Edit, Bash
verified: pending
---
# Quantifying microscope images

Turn an acquisition file into a table of per-object measurements — how many cells,
how big, what shape, how bright in each channel — with overlays a person can check
and a script the lab can re-run.

The measuring is the easy part. `regionprops` has done it correctly for years. What
goes wrong is everything before it: the wrong channel, a pixel size nobody converted,
a background filter that quietly deleted the objects, a size filter applied at the
wrong moment. All of those produce a full CSV of plausible numbers, which is worse
than a crash. **Every trap documented below was hit while writing this skill**, on a
clean public dataset, using current library versions.

Nothing here needs an account, an API key, or a GPU. The optional deep-learning route
in *When thresholding is not enough* downloads model weights on first use — that is
the only thing to obtain, and it is stated again before that block.

## Open the file with its metadata attached

`bioio` reads vendor formats — `.czi`, `.lif`, `.nd2`, OME-TIFF — through per-format
plugins, normalises every one to `TCZYX`, and hands back physical pixel sizes without
you parsing anything.

```bash
pip install bioio bioio-tifffile      # plus a reader for your format:
# bioio-czi (Zeiss) · bioio-lif (Leica) · bioio-nd2 (Nikon) · bioio-ome-tiff
```

**`bioio-czi` is GPL-3.0**, inherited from the libCZI stack it wraps, while `bioio`
itself and the other readers are BSD-3 or MIT. Running it is unrestricted; if you
link it into something you distribute, that term is yours to honour.

```python
from bioio import BioImage

im = BioImage("cells3d.tif")
print(im.dims)                    # <Dimensions [T: 1, C: 2, Z: 60, Y: 256, X: 256]>
print(im.physical_pixel_sizes)    # PhysicalPixelSizes(Z=0.29, Y=0.26, X=0.26)
print(im.channel_names)           # ['Channel:0:0', 'Channel:0:1']
img = im.get_image_data("ZCYX")   # ask for the order you want, explicitly
```

Two things to notice in that output, because both are the normal case rather than a
defect in this file.

**Physical pixel size is in micrometres and it is not optional.** Every area you
report should be in µm², not pixels — a pixel is a property of the microscope, not
the biology, and two datasets from different objectives are not comparable in pixels.
Convert once, at the point of measurement, and put the units in the column names.

**The channel names are placeholders.** `Channel:0:0` tells you nothing. Which is the
next section.

### When you need the raw tags

`tifffile` alone is enough for plain and ImageJ TIFFs, and it is what to reach for
when you want to see exactly what the file claims:

```python
import tifffile

with tifffile.TiffFile("cells3d.tif") as tf:
    series = tf.series[0]
    img, axes = series.asarray(), series.axes
    ij = tf.imagej_metadata or {}
    xres = tf.pages[0].tags["XResolution"].value

pixel_um = xres[1] / xres[0]     # a rational in pixels-per-unit — invert it
z_um = ij["spacing"]
```

Two traps live in those four lines. `XResolution` is a `(numerator, denominator)`
rational expressing **pixels per unit**, so the pixel size is the reciprocal — read it
the other way round and every area is wrong by a factor of ~14 on this file, in a
direction that still looks like a cell. And `ResolutionUnit` reads `1`, meaning *none*,
while the actual unit — `micron` — is recorded only in the ImageJ metadata block. A
reader who trusts `ResolutionUnit` gets nothing; one who assumes micrometres is right
here and wrong on the next file. This is the argument for `bioio`: it resolves both
and hands you a number.

## Identify channels from the data, never from the index

**Do not hardcode a channel index from documentation.** The dataset used throughout
this skill is published by one project in two files with the **same imagery and
opposite channel order** — in `cells3d.tif` channel 1 is the nuclei, and in
`cells3d-with-metadata.tif` channel 0 is. The published docstring describes the first.
An analysis that hardcodes `img[z, 1]` as "nuclei" runs clean on one file and silently
measures membranes on the other.

Nuclei are compact and convex; a membrane or cytoskeletal stain is a thin connected
network. Solidity — object area over its convex hull area — separates them decisively:

```python
import numpy as np
from skimage import filters, measure, morphology

def nuclear_solidity(plane, pixel_um):
    """Median solidity of thresholded objects. Compact blobs -> ~0.9; networks -> ~0.2."""
    mask = plane > filters.threshold_otsu(plane)
    mask = morphology.remove_small_objects(mask, max_size=int(round(20 / pixel_um**2)))
    regions = measure.regionprops(measure.label(mask))
    return float(np.median([r.solidity for r in regions])) if regions else 0.0

z = img.shape[0] // 2
scores = [nuclear_solidity(img[z, c], pixel_um) for c in range(img.shape[1])]
NUC = int(np.argmax(scores))       # [0.86, 0.23] -> nuclei are channel 0
MEM = int(np.argmin(scores))
nuc = img[z, NUC]
```

Then **look at it once** before trusting the run. One `imshow` of the chosen channel
costs nothing and catches this class of error immediately, which no amount of
downstream assertion does.

Where a file does carry real channel names — most vendor formats do, and only this
TIFF does not — match on the name and fall back to this test. Either way, the rule is
that the identity is established, not assumed.

## Flatten background, then denoise

Uneven illumination makes one global threshold wrong across the field. A white tophat
subtracts anything larger than its structuring element, which flattens the background
while leaving the objects alone:

```python
from skimage import filters, morphology

px = lambda um: max(1, int(round(um / pixel_um)))

flat = morphology.white_tophat(nuc, morphology.disk(px(12.0)))
denoised = filters.gaussian(flat, sigma=1.0, preserve_range=True)
```

**The structuring element must be larger than the objects you are keeping.** A tophat
keeps what is *smaller* than its footprint, so a radius below the object radius erases
the interiors and leaves rings — segmentation then finds edge fragments and reports
nuclei of 7 µm² where the truth is 118 µm². Size the disk at roughly the widest object
you expect, here 12 µm against nuclei about 12 µm across, and never below it.

`sigma=1.0` is a light touch that stabilises the threshold without moving boundaries.
For shot noise, `filters.median` or `restoration.denoise_nl_means` preserve edges
better than a Gaussian; measure after denoising either way, and use `preserve_range`
so intensities stay in the original units.

## Segment — threshold, then split what touches

Otsu picks the threshold; the watershed separates nuclei that share a border. Without
the split, confluent cells merge into one object and the count collapses — on this
field, 11 nuclei become 2 connected components.

```python
from scipy import ndimage as ndi
from skimage import feature, segmentation

mask = ndi.binary_fill_holes(denoised > filters.threshold_otsu(denoised))

dist = ndi.distance_transform_edt(mask)
peaks = feature.peak_local_max(dist, min_distance=px(5.0), labels=mask)
seeds = np.zeros(mask.shape, bool)
seeds[tuple(peaks.T)] = True
labels = segmentation.watershed(-dist, ndi.label(seeds)[0], mask=mask)
labels = segmentation.clear_border(labels)
```

`min_distance` is the one parameter worth tuning, and it means *the closest two object
centres may be*. Set it in micrometres and convert, so the number survives a change of
objective. Too small shatters nuclei into fragments; too large merges neighbours. On
this data anything from 4 to 7 µm gives 11–13 objects, which is the sign of a
parameter sitting in a stable range rather than on a knife edge — check that range
rather than accepting the first value that looks right.

`clear_border` drops objects cut by the field edge. Do it: a partial nucleus has a
real-looking area that is simply wrong, and it biases every size statistic downward.

### Filter by size after splitting, not before

```python
MIN_AREA_UM2 = 30.0
regions = measure.regionprops(labels)
keep = [r.label for r in regions if r.area * pixel_um**2 >= MIN_AREA_UM2]
dropped = [round(float(r.area * pixel_um**2), 1) for r in regions
           if r.area * pixel_um**2 < MIN_AREA_UM2]
labels[~np.isin(labels, keep)] = 0
labels, _, _ = segmentation.relabel_sequential(labels)
print(f"{labels.max()} objects kept, dropped below {MIN_AREA_UM2} um^2: {dropped}")
```

A filter applied only *before* the watershed never sees the slivers the watershed
itself creates. In the 3D version of this pipeline that ordering left a 20-voxel
fragment in the results — 0.4 µm³ alongside nuclei of 750 µm³ — because it did not
exist at the moment the filter ran. Filter after, or filter twice.

**Print what you dropped.** On this field the discards are two fragments of 26 µm²,
and they are not debris — they are a mitotic cell, whose condensed chromosomes are
small, bright, and genuinely nuclear. Reporting `n = 11` without saying that a
dividing cell was removed is a quiet decision about the biology disguised as a
threshold. Say what left and why.

`relabel_sequential` closes the gaps in the label numbering afterwards, so labels
run 1..n and match the CSV rows.

## Measure

`regionprops_table` returns columns directly. Pass the multi-channel plane as
`intensity_image` and every channel is measured inside the same object masks:

```python
import pandas as pd

table = pd.DataFrame(measure.regionprops_table(
    labels,
    intensity_image=np.moveaxis(img[z], 0, -1),      # channels last for regionprops
    properties=("label", "area", "solidity", "eccentricity", "perimeter",
                "centroid", "intensity_mean")))

table["area_um2"] = table["area"] * pixel_um**2
table["diameter_um"] = 2 * np.sqrt(table["area_um2"] / np.pi)
table["perimeter_um"] = table["perimeter"] * pixel_um
table = table.rename(columns={f"intensity_mean-{NUC}": "nuclei_mean",
                              f"intensity_mean-{MEM}": "membrane_mean"})
```

Convert to physical units in the same expression that creates the column, and name the
column for the unit. A column called `area` gets compared across experiments by
somebody who was not there.

`eccentricity` and several other shape descriptors are **2D only** — they raise on a
3D label image. `area`, `solidity`, `centroid`, `intensity_mean` and the bounding box
work in both, and in 3D `area` is a voxel count, so it becomes a volume.

### Colocalization is per object, and it needs a threshold

Whole-image correlation coefficients are dominated by background — most pixels are
empty in both channels, which drives any correlation towards agreement regardless of
biology. Compute inside each object mask instead:

```python
a_img = img[z, NUC].astype(float)
b_img = img[z, MEM].astype(float)
b_thr = filters.threshold_otsu(b_img)

pearson, manders_m1 = [], []
for lb in table["label"]:
    sel = labels == lb
    a, b = a_img[sel], b_img[sel]
    pearson.append(np.corrcoef(a, b)[0, 1] if a.std() > 0 and b.std() > 0 else np.nan)
    manders_m1.append(float(a[b > b_thr].sum() / a.sum()) if a.sum() > 0 else np.nan)

table["pearson_r"] = pearson
table["manders_m1"] = manders_m1
```

The two answer different questions and are worth reporting together. Pearson asks
whether the intensities co-vary and runs −1 to 1. Manders' M1 asks what fraction of
channel A's signal sits where channel B is present, runs 0 to 1, and depends entirely
on the threshold chosen for B — so state that threshold, as here. Neither is evidence
of interaction at this resolution; both are descriptions of overlap.

Write it out tidy — one row per object, one column per measurement, the source file
and channel carried in columns so tables from many images concatenate:

```python
from pathlib import Path

Path("Analysis").mkdir(exist_ok=True)
table["source_file"] = "cells3d.tif"
table["z_plane"] = z
table.round(4).to_csv("Analysis/objects.csv", index=False)
```

## Check the segmentation by looking at it

A QC image per field is the cheapest defence against a confident wrong answer, and it
is what makes the numbers auditable months later:

```python
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from skimage import color, exposure

disp = exposure.rescale_intensity(nuc, in_range="image", out_range=(0, 1))
fig, axs = plt.subplots(1, 3, figsize=(15, 5))
axs[0].imshow(disp, cmap="gray");  axs[0].set_title("raw")
axs[1].imshow(mask, cmap="gray");  axs[1].set_title("mask")
axs[2].imshow(color.label2rgb(labels, image=disp, bg_label=0, alpha=0.35))
axs[2].contour(labels > 0, colors="w", linewidths=0.4)
axs[2].set_title(f"{labels.max()} objects")
for a in axs:
    a.axis("off")
plt.tight_layout()
plt.savefig("Analysis/qc_overlay.png", dpi=85)
```

Three panels, not one: raw, mask, and labels. The failure modes are distinguishable
only across them — a bad threshold shows in the mask, over-splitting shows only in the
labels, and a wrong channel is obvious in the raw panel and nowhere else.

## Measure volumes in 3D

Where the stack is the point, segment the volume rather than a plane. The distance
transform must be told the voxel is anisotropic, or z is silently treated as equal to
xy — here that is a 12% error in every distance, and more on a typical stack:

```python
voxel_um3 = pixel_um * pixel_um * z_um
vol = img[:, NUC]

den = filters.gaussian(vol, sigma=(1.0 * pixel_um / z_um, 2, 2), preserve_range=True)
mask3 = ndi.binary_fill_holes(den > filters.threshold_otsu(den))
mask3 = morphology.remove_small_objects(mask3, max_size=int(200 / voxel_um3))

dist3 = ndi.distance_transform_edt(mask3, sampling=(z_um, pixel_um, pixel_um))
peaks3 = feature.peak_local_max(dist3, min_distance=px(5.0), labels=mask3)
seeds3 = np.zeros(mask3.shape, bool)
seeds3[tuple(peaks3.T)] = True
lab3 = segmentation.clear_border(
    segmentation.watershed(-dist3, ndi.label(seeds3)[0], mask=mask3))

keep3 = [r.label for r in measure.regionprops(lab3) if r.area * voxel_um3 >= 200.0]
lab3[~np.isin(lab3, keep3)] = 0
lab3, _, _ = segmentation.relabel_sequential(lab3)

volumes = np.array([r.area for r in measure.regionprops(lab3)]) * voxel_um3
print(f"{lab3.max()} nuclei, median volume {np.median(volumes):.0f} um^3")
```

On the test stack: 12 nuclei, median 747 µm³. The Gaussian sigma is scaled by
`pixel_um / z_um` for the same reason — a sigma of 2 in z is a much longer distance
than a sigma of 2 in x whenever the z step differs from the pixel size.

The whole 60 × 256 × 256 stack segments in about a second, so reaching for 3D is a
question of whether the biology needs it, not of cost.

## When thresholding is not enough

Otsu plus watershed handles clean, well-separated, roughly convex objects. It degrades
on low contrast, heavy debris, dense tissue, and irregular shapes. A pretrained
segmentation model is the alternative, and Cellpose-SAM needs no training data and no
parameter tuning:

**Obtain first.** `pip install cellpose` pulls PyTorch, and the first `eval` call
downloads about **1.15 GB** of weights to `~/.cellpose/models`. No account and no key.
The published checkpoints are BSD-3-Clause; note that the Cellpose training data is
CC-BY-NC, which constrains the dataset rather than the model you are running. It uses
CUDA or Apple Metal automatically and falls back to CPU.

```python
from cellpose import models, core

model = models.CellposeModel(gpu=core.use_gpu())
masks, flows, styles = model.eval(nuc, batch_size=8)
masks = segmentation.clear_border(masks)
```

That is the entire substitution — `masks` is a label image, so every measurement
section above applies to it unchanged.

**Run both and compare, at least once.** On the test field the classical route gives
11 nuclei with a median area of 118 µm² and the model gives 11 at 123 µm². Two
methods with nothing in common agreeing within a few percent is real evidence the
segmentation is right. Divergence is the useful signal: a large gap means one of them
is wrong, and which one is visible in the overlay.

## Leave the analysis reproducible

Write the script the analysis actually ran into the project, next to its outputs —
`Analysis/quantify_nuclei.py` beside `Analysis/objects.csv` and
`Analysis/qc_overlay.png`. A CSV whose provenance is a chat transcript cannot be
re-run when a reviewer asks what the size cutoff was.

Record in the script, not in your memory of it: the source file, the channel index and
how it was determined, the pixel and z size, every threshold in micrometres, and the
library versions. `skimage.__version__` in the output header costs one line and dates
the result.

Two API renames landed in scikit-image 0.26 and will be enforced in 2.0 —
`remove_small_objects(min_size=)` and `remove_small_holes(area_threshold=)` are both
now `max_size=`, and the new threshold is **inclusive** where the old ones were not.
Code written against older documentation still runs, emits a `FutureWarning`, and
shifts by one pixel at the boundary. Running with `warnings.simplefilter("error",
FutureWarning)` once flushes these out.

## Try it

A self-contained check that this skill still works. Public data, no account, no key,
no GPU. Downloads 15 MB.

**Data** — a 3D two-channel fluorescence stack of a cell monolayer, imaged by the
Allen Institute for Cell Science and distributed with the scikit-image sample data:

    https://gitlab.com/scikit-image/data/-/raw/45e2cec9a2ebd24354beccf293e81dabc6220bbe/cells3d-with-metadata.tif

Released **CC0**, no account or licence acceptance. The URL is pinned to a commit, so
the bytes cannot change under it. This file is used rather than its sibling
`cells3d.tif` because it carries real voxel spacing and channel metadata — and because
the two files have opposite channel order, which is what the run below detects.
Last confirmed reachable 2026-08-14.

```python
import urllib.request, numpy as np, tifffile
from scipy import ndimage as ndi
from skimage import feature, filters, measure, morphology, segmentation

URL = ("https://gitlab.com/scikit-image/data/-/raw/"
       "45e2cec9a2ebd24354beccf293e81dabc6220bbe/cells3d-with-metadata.tif")
urllib.request.urlretrieve(URL, "cells3d.tif")

with tifffile.TiffFile("cells3d.tif") as tf:
    series = tf.series[0]
    img, axes = series.asarray(), series.axes
    ij = tf.imagej_metadata or {}
    xres = tf.pages[0].tags["XResolution"].value

pixel_um = xres[1] / xres[0]          # rational is pixels-per-unit, so invert it
z_um = ij["spacing"]
assert axes == "ZCYX", axes

def nuclear_solidity(plane):
    m = plane > filters.threshold_otsu(plane)
    m = morphology.remove_small_objects(m, max_size=int(round(20 / pixel_um**2)))
    rp = measure.regionprops(measure.label(m))
    return float(np.median([r.solidity for r in rp])) if rp else 0.0

z = img.shape[0] // 2
scores = [nuclear_solidity(img[z, c]) for c in range(img.shape[1])]
NUC = int(np.argmax(scores))          # identified, not assumed

px = lambda um: max(1, int(round(um / pixel_um)))
nuc = img[z, NUC]

flat = morphology.white_tophat(nuc, morphology.disk(px(12.0)))
den = filters.gaussian(flat, sigma=1.0, preserve_range=True)
mask = ndi.binary_fill_holes(den > filters.threshold_otsu(den))

dist = ndi.distance_transform_edt(mask)
peaks = feature.peak_local_max(dist, min_distance=px(5.0), labels=mask)
seeds = np.zeros(mask.shape, bool)
seeds[tuple(peaks.T)] = True
labels = segmentation.watershed(-dist, ndi.label(seeds)[0], mask=mask)
labels = segmentation.clear_border(labels)

MIN_AREA_UM2 = 30.0                   # filter AFTER splitting
regions = measure.regionprops(labels)
keep = [r.label for r in regions if r.area * pixel_um**2 >= MIN_AREA_UM2]
dropped = [round(float(r.area * pixel_um**2), 1) for r in regions
           if r.area * pixel_um**2 < MIN_AREA_UM2]
labels[~np.isin(labels, keep)] = 0
labels, _, _ = segmentation.relabel_sequential(labels)

areas = np.array([r.area for r in measure.regionprops(labels)]) * pixel_um**2
sol = np.array([r.solidity for r in measure.regionprops(labels)])
assert labels[0].sum() == labels[-1].sum() == 0
assert labels[:, 0].sum() == labels[:, -1].sum() == 0

print(f"pixel {pixel_um:.3f} um | z step {z_um} um")
print(f"channel solidity {np.round(scores, 2).tolist()} -> nuclei = channel {NUC}")
print(f"objects: {labels.max()}  (dropped below {MIN_AREA_UM2:.0f} um^2: {dropped})")
print(f"median area {np.median(areas):.1f} um^2 | median diameter "
      f"{2 * np.sqrt(np.median(areas) / np.pi):.2f} um")
print(f"area range {areas.min():.1f} - {areas.max():.1f} um^2")
print(f"min solidity {sol.min():.2f}")
```

**Expect**

Invariants — these hold regardless of library version, and a failure means the skill
is wrong:

- Pixel size resolves to **0.260 µm** and the z step to **0.29 µm**. Both are
  properties of this pinned file. Getting ~3.85 instead means the resolution rational
  was read the wrong way up, which is the trap this line exists to catch.
- Axes are `ZCYX` with shape `(60, 2, 256, 256)`, `uint16`.
- **The nuclear channel is channel 0 in this file** — while it is channel 1 in
  `cells3d.tif`, and the published docstring describes the latter. The solidity scores
  separate cleanly, around 0.86 against 0.23, so the assignment is not marginal. If
  `NUC` ever comes back as 1 here, the file changed, not the method.
- No object touches the field border after `clear_border` — the four assertions.
- Every retained object is at least 30 µm², and something is always dropped: the
  discards are a mitotic cell, not debris.
- Nuclei are compact — minimum solidity above 0.9. A value near 0.2 means the membrane
  channel was measured.

Observed 2026-08-14 with scikit-image **0.26.0**, numpy 2.5.2, tifffile 2026.7.31 —
these move when the libraries change their defaults, so treat a mismatch as drift to
investigate rather than a failure:

- 11 objects, 2 dropped at 26.8 and 26.2 µm² · median area 118.1 µm² · median diameter
  12.26 µm · area range 88.6–166.6 µm² · minimum solidity 0.96
- The 3D variant on the same stack: 12 nuclei, median volume 747 µm³
- Cellpose-SAM 4.2.1.1 on the same plane: 11 objects, median area 123.0 µm² — the
  cross-check described above, and the agreement is the point

## Sources

- scikit-image — https://scikit-image.org/
- `regionprops` reference — https://scikit-image.org/docs/stable/api/skimage.measure.html
- bioio — https://github.com/bioio-devs/bioio
- tifffile — https://github.com/cgohlke/tifffile
- Cellpose — https://github.com/MouseLand/cellpose
- Test data, Allen Institute for Cell Science via scikit-image — https://gitlab.com/scikit-image/data
