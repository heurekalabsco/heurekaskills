---
name: sam2
description: Segment and track objects with Meta's SAM 2.1 — point, box and mask prompts on a single image, automatic mask generation over a whole field, and propagation of a segmentation through a time-lapse. Covers where a natural-image model misreads microscopy, and what to check before trusting a count.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [segmentation, image-analysis, microscopy, sam2, time-lapse]
datasets: [https://raw.githubusercontent.com/CellProfiler/examples/master/ExampleHuman/images/AS_09125_050116030001_D03f00d0.tif, https://raw.githubusercontent.com/CellProfiler/examples/master/ExampleTrackObjects/images/Sequence1/DrosophilaEmbryo_GFPHistone_0000.tif, https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-25
  against: SAM 2.1 checkpoints dated 092824 / repository package SAM-2 1.0 installed from source at facebookresearch/sam2 main / torch 2.13.0, torchvision 0.28.0, Python 3.12.8 / CPU device on arm64 macOS / CellProfiler ExampleHuman and ExampleTrackObjects images
  executed: 11
  unverified: 0
---

# Segmenting with SAM 2

SAM 2.1 will return a mask for anything you point at, in any image, without training. That
is the appeal and it is also the whole problem: it was trained on photographs and video of
everyday scenes, so on a fluorescence field it is confident about the wrong things in ways
that are specific, reproducible, and easy to check once you know what to look for. This
page is mostly about those checks.

Use it where a classical or cell-specific segmenter struggles: irregular objects, objects
you can point at but not threshold, tissue structures, and carrying one object through a
movie. Do not use it as a drop-in nucleus counter — the measurements below show why.

## What a reader must obtain

Nothing gated. Both the code and the checkpoints are **Apache-2.0** — the repository's own
licence section states that "the SAM 2 model checkpoints, SAM 2 demo code (front-end and
back-end), and SAM 2 training code are licensed under Apache 2.0". The weights download
anonymously from Meta's public file host: no account, no token, no access request.

What you do need: **Python 3.10 or newer**, **PyTorch 2.5.1 or newer** with a matching
torchvision, and enough patience for CPU inference if you have no GPU. Times measured on
CPU are quoted throughout so you can size the work before starting it.

### Do not `pip install sam2`

The PyPI project named `sam2` is **not Meta's package**. Checked against PyPI metadata on
25 Aug 2026: `sam2` 1.1.0 is published by an individual, its only declared homepage is a
personal fork rather than `facebookresearch/sam2`, and its newest release was uploaded on
2024-12-21. A separate `segment-anything-2` 0.0.1 was uploaded in July 2026 with no author
and no content to speak of. Neither tracks the upstream repository, and SAM 2.1's
checkpoints require model code newer than either.

Meta does not publish SAM 2 to PyPI at all. The distribution is named `SAM-2` — the
repository's own upgrade note tells users to `pip uninstall SAM-2` before pulling — and
neither `SAM-2` nor its normalised form `sam-2` exists on PyPI. The install is a source
clone:

```bash
git clone https://github.com/facebookresearch/sam2.git && cd sam2
pip install -e .
```

On a machine without a CUDA toolkit, skip the optional extension:

```bash
SAM2_BUILD_CUDA=0 pip install -e .
```

You will then see this at runtime, once per session, and it is expected rather than broken:

```
UserWarning: cannot import name '_C' from 'sam2'
Skipping the post-processing step due to the error above.
```

What is skipped is the connected-component pass that fills small holes and removes
speckles from output masks. On a photograph that is cosmetic. On microscopy it is not
always: a nucleus mask with interior holes has a smaller area and a larger perimeter, so
any shape measurement you take from it is biased. Either build the extension on a CUDA
machine, or close the holes yourself with `scipy.ndimage.binary_fill_holes` before
measuring — and say which you did.

### Checkpoints

Four sizes, all from the `092824` release, all downloadable with `curl`:

| Checkpoint | Size | Config |
|---|---|---|
| `sam2.1_hiera_tiny.pt` | 156 MB | `configs/sam2.1/sam2.1_hiera_t.yaml` |
| `sam2.1_hiera_small.pt` | 184 MB | `configs/sam2.1/sam2.1_hiera_s.yaml` |
| `sam2.1_hiera_base_plus.pt` | 324 MB | `configs/sam2.1/sam2.1_hiera_b+.yaml` |
| `sam2.1_hiera_large.pt` | 898 MB | `configs/sam2.1/sam2.1_hiera_l.yaml` |

```bash
curl -L -O https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt
```

The config path is a Hydra resource name resolved from inside the installed package, not a
path on your disk. Pair the right config with the right checkpoint — a mismatch loads and
then produces nonsense rather than raising.

**SAM 3.1 is not a later drop-in.** Its checkpoints are gated behind an access request on
Hugging Face and carry Meta's own SAM licence rather than Apache-2.0. That is a different
licensing decision, not a version bump, so SAM 2.1 is what this page documents.

## Getting an image into the model

SAM 2 takes `HWC` `uint8` RGB. Microscopy is single-channel and usually 16-bit or float,
so a conversion happens whether or not you think about it — and **the conversion is part
of the method**.

```python
import numpy as np

def to_rgb8(plane, lo_pct=1.0, hi_pct=99.5):
    """Single-channel microscopy -> the uint8 RGB SAM 2 expects."""
    a = plane.astype(np.float32)
    lo, hi = np.percentile(a, [lo_pct, hi_pct])
    a = np.clip((a - lo) / max(hi - lo, 1e-9), 0, 1) * 255
    return np.stack([a.astype(np.uint8)] * 3, axis=-1)
```

Prompting the same nucleus in the same image under four different conversions gives four
different masks — measured on an already-8-bit field, so this is the *understated* case:

| Conversion | Mask area (px) | Predicted IoU |
|---|---|---|
| raw `uint8`, no rescale | 347 | 0.6149 |
| min-max stretch | 350 | 0.6600 |
| 1st-99th percentile stretch | 336 | 0.6935 |
| gain x2, clipped | 327 | 0.4284 |

A 7% spread in area and a score that nearly doubles, from a step most pipelines treat as
plumbing. Fix one conversion, record it next to the results, and do not change it between
conditions you intend to compare. Stretch to percentiles rather than min-max: one hot
pixel sets the maximum and pushes every real structure toward black.

Given the same array, SAM 2 is deterministic on CPU — the same input twice returns
byte-identical masks — so any variation you see is coming from your preprocessing.

## Prompting a single image

```python
import numpy as np, torch
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

model = build_sam2("configs/sam2.1/sam2.1_hiera_t.yaml",
                   "sam2.1_hiera_tiny.pt", device="cpu")
predictor = SAM2ImagePredictor(model)
predictor.set_image(rgb)                       # ~0.6 s for 512x512 on CPU

masks, scores, logits = predictor.predict(
    point_coords=np.array([[384, 261]]),       # (x, y), not (row, col)
    point_labels=np.array([1]),                # 1 = foreground, 0 = background
    multimask_output=True,
)
```

`masks` comes back `(3, H, W)` `float32` holding only 0.0 and 1.0 — not `bool`. Cast it if
you are going to index with it. `point_coords` is `(x, y)` while the array is `(row, col)`,
which is the same transposition trap that lives in every imaging API.

### There is no "nothing here" answer

Prompt a background pixel — value 9 in a field whose nuclei run to 255 — and SAM 2 returns
a 247,150-pixel mask covering most of the field, with a predicted IoU of **0.8212**. That
is its most confident answer for that image. `multimask_output=False` returns the same
mask.

Prompt an actual nucleus and the three candidates are 927, 141 and 348 pixels with scores
0.1207, 0.2993 and 0.5777 — every one of them below the confidence the model assigned to
the background.

So the score is not a detection probability and cannot be thresholded as one. It is a
predicted IoU between this mask and the object the model believes you meant, and on
microscopy the model's belief about what constitutes an object is frequently "the tissue"
or "the field". Two consequences:

- **Never let a prompt decide whether an object exists.** Decide that beforehand — a
  threshold, a local-maxima detector, an existing label image — and use SAM 2 only to
  refine the boundary of something you already know is there.
- **Filter by area against what the biology allows**, in physical units. Anything above a
  few hundred square micrometres is not a cell, whatever the score says.

### On crowded fields, prompt with a box

Same movie frame, same target nucleus, two prompt types:

| Prompt | Frame-0 mask area (px) |
|---|---|
| single foreground point at the nucleus centroid | 1231 |
| box, 13 x 19 px, around the same nucleus | 154 |

The thresholded seed object is 77 px. The point prompt returned eight times that — the
whole cluster of touching nuclei — and stayed there for all 21 frames. The box prompt
returned a plausible single nucleus and tracked it.

A point says "something here". A box says "this much and no more", and on densely packed
cells that is the only one of the two that answers the question you asked. Derive boxes
from a cheap detector — thresholded region bounding boxes work — and hand SAM 2 the
refinement job.

## Automatic mask generation, and why its defaults undercount

`SAM2AutomaticMaskGenerator` samples a grid of points, segments at each, and
de-duplicates. It is the closest thing to "segment everything", and on microscopy its
defaults are wrong in a direction that looks like success.

Run against the ExampleHuman DNA field, where CellProfiler's published pipeline finds
**289 nuclei**:

| Settings | Masks | Wall clock (CPU) | Median area | Field-sized masks (>5000 px) |
|---|---|---|---|---|
| defaults (`points_per_side=32`) | **141** | 17-18 s | 123 px | 0 |
| `points_per_side=64`, `pred_iou_thresh=0.5`, `stability_score_thresh=0.8`, `min_mask_region_area=20` | **369** | 67 s | 110 px | 1 |

At defaults SAM 2 finds fewer than half the nuclei, returns no obviously wrong object, and
gives you a tidy table of 141 rows with a sensible size distribution. Nothing in the output
says that 148 cells are missing. The cause is the default thresholds: `pred_iou_thresh` is
0.88 and `stability_score_thresh` is 0.95, and — as the section above shows — the model's
predicted IoU for a real nucleus sits nearer 0.6.

Relaxing them recovers the count and admits one 255,975-pixel mask of the background, which
is why an area filter belongs after every automatic run, not instead of one.

```python
from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

gen = SAM2AutomaticMaskGenerator(
    model,
    points_per_side=64,
    pred_iou_thresh=0.5,
    stability_score_thresh=0.8,
    min_mask_region_area=20,
)
anns = gen.generate(rgb)      # dicts: segmentation, area, bbox, predicted_iou, stability_score

lo_px, hi_px = 40, 600        # from what a nucleus measures in THIS assay, in pixels
keep = [a for a in anns if lo_px <= a["area"] <= hi_px]
```

Set those bounds from the assay, not from a page. Convert to square micrometres only if
the file actually carries a pixel size — the ExampleHuman TIFF used below has no
resolution tags at all, and inventing one is how a plausible number becomes a wrong one.

**Relaxing the thresholds also brings back the overlap the strict defaults suppressed.**
Measured on the same field:

| Settings | Masks | Union (px) | Pixels in 2+ masks | Deepest stack | Interior holes (first 60 masks) |
|---|---|---|---|---|---|
| defaults | 141 | 17,822 | 0 | 1 | 0 px |
| relaxed | 369 | 261,127 | 33,539 (12.8%) | 5 | 4,187 px |

At defaults the de-duplication leaves a clean partition and you can treat the masks as
disjoint. At the settings that actually recover the count, one pixel in eight belongs to
more than one mask and the masks have holes — so the label-painting guard and the hole fill
in *Getting measurements out* below are needed exactly where the counting works.

**Calibrate the thresholds against a labelled field before you trust a count**, and report
the settings with the number. "SAM 2 found 141 nuclei" and "SAM 2 found 369 nuclei" are
the same model on the same image, and only one of them is close.

## Time-lapse

The video predictor keeps a memory of the object across frames, which is what makes it a
tracker rather than a per-frame segmenter.

**It reads only an MP4 file or a directory of JPEGs.** A folder of TIFFs — what every
time-lapse microscope produces — raises `NotImplementedError: Only MP4 video and JPEG
folder are supported at this moment`. The JPEGs must be named `<frame_index>.jpg`, numbered
from 0.

```python
import glob, numpy as np, tifffile
from PIL import Image

for i, path in enumerate(sorted(glob.glob("frames/*.tif"))):
    plane = tifffile.imread(path)
    Image.fromarray(to_rgb8(plane) if plane.ndim == 2 else plane).save(f"jpg/{i}.jpg", quality=95)
```

Sort the paths explicitly and number from the sorted order. `frame10.tif` sorts before
`frame2.tif` under every default, and a scrambled frame order produces a tracker that
appears to work and reports nonsense motion.

**JPEG is lossy, so measure on the TIFFs.** The masks SAM 2 returns are in frame
coordinates; apply them to the original arrays for any intensity you intend to report.
Never quote an intensity read off the JPEG.

```python
from sam2.build_sam import build_sam2_video_predictor

predictor = build_sam2_video_predictor(
    "configs/sam2.1/sam2.1_hiera_t.yaml", "sam2.1_hiera_tiny.pt", device="cpu")
state = predictor.init_state("jpg", offload_video_to_cpu=True)

predictor.add_new_points_or_box(state, frame_idx=0, obj_id=1,
                                box=np.array([120, 70, 133, 89], np.float32))  # x0,y0,x1,y1

for frame_idx, obj_ids, logits in predictor.propagate_in_video(state):
    mask = (logits[0, 0] > 0).cpu().numpy()
```

`propagate_in_video` yields logits, not masks: threshold at 0 to get the mask.
`offload_video_to_cpu=True` keeps the decoded frames off the GPU, which is what lets a
long movie fit at all. Twenty-one 264x542 frames propagate in about 18 s on CPU.

### SAM 2 does not know about cell division

An object id is one object for the whole movie. When a tracked cell divides, the mask does
not split and no second id appears — it grows to cover both daughters. Tracking the same
box-prompted nucleus through a Drosophila syncytial-blastoderm movie:

```
frame:  0    1    2   ...  17   18   19   20
area:  154  129  131  ...  147  147  131  293
```

Steady at 130-190 px through nineteen frames, then 293 px on the last one. Nothing errors,
no id is added, and a per-frame area trace reads as a cell that suddenly doubled in size.

So for lineage work, SAM 2 gives you high-quality per-frame masks and nothing else. Detect
division yourself — a step change in area, or a mask whose connected-component count goes
from one to two — and re-prompt each daughter as a new `obj_id` from the frame after the
split. Multiple objects can be prompted into one state with distinct ids and propagated
together in a single pass.

## Getting measurements out

A mask is not a result. Convert to a label image and measure on the original data, in
physical units:

```python
import numpy as np, pandas as pd
from scipy import ndimage as ndi
from skimage.measure import regionprops_table

label = np.zeros(rgb.shape[:2], np.int32)
for i, ann in enumerate(sorted(keep, key=lambda a: -a["area"]), start=1):
    label[ann["segmentation"] & (label == 0)] = i      # larger masks are painted first

filled = np.zeros_like(label)                          # the post-process a CPU build skips
for i in range(1, label.max() + 1):
    filled[ndi.binary_fill_holes(label == i)] = i

table = pd.DataFrame(regionprops_table(
    filled, intensity_image=plane,                     # the ORIGINAL plane, not the RGB
    properties=("label", "centroid", "area", "eccentricity", "intensity_mean")))
table.to_csv("objects.csv", index=False)
```

The `& (label == 0)` is load-bearing whenever the generator was relaxed enough to be
useful: at the settings that recovered the count above, 12.8% of covered pixels sat under
two or more masks and the deepest stack was five. Painting without the guard silently
reassigns those pixels, so every area depends on iteration order. Resolving largest-first,
first-writer-wins, at least makes it deterministic and stateable.

Fill holes per label rather than on the union. `binary_fill_holes(label > 0)` returns a
boolean of the filled union, and multiplying it back by `label` leaves the filled pixels at
zero — it looks like a fill and does nothing.

## Try it

**Data.** One field of human cells, DNA channel, from the CellProfiler `ExampleHuman`
dataset — imaged by Jason Moffat for the study at PMID 16564017, released **CC-0**, 233 KB.
The published CellProfiler pipeline for this exact image finds 289 nuclei, which is what
makes it a test rather than a demo: there is a number to compare against. Confirmed
reachable on 25 Aug 2026.

**Run.** Needs the source install above and the 156 MB tiny checkpoint. About two minutes
end to end on CPU.

```bash
git clone https://github.com/facebookresearch/sam2.git && cd sam2
SAM2_BUILD_CUDA=0 pip install -e . && pip install scipy pillow
cd .. && curl -L -O https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt
curl -sL -o dna.tif https://raw.githubusercontent.com/CellProfiler/examples/master/ExampleHuman/images/AS_09125_050116030001_D03f00d0.tif
```

```python
import numpy as np, time
from PIL import Image
from scipy import ndimage as ndi
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor
from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

plane = np.array(Image.open("dna.tif"))
rgb = np.stack([plane] * 3, -1)
print("image", plane.shape, plane.dtype, plane.min(), plane.max())

model = build_sam2("configs/sam2.1/sam2.1_hiera_t.yaml",
                   "sam2.1_hiera_tiny.pt", device="cpu")
predictor = SAM2ImagePredictor(model)
predictor.set_image(rgb)

# Where is a real nucleus? Pick the brightest thresholded blob, away from the edges.
lab, n = ndi.label(plane > 60)
sizes = np.array(ndi.sum(np.ones_like(lab), lab, range(1, n + 1)))
cy, cx = ndi.center_of_mass(plane, lab, int(np.argmax(sizes)) + 1)
print("blobs >60:", n, "| prompting nucleus at (x=%d, y=%d)" % (cx, cy))

def probe(x, y):
    m, s, _ = predictor.predict(point_coords=np.array([[x, y]]),
                                point_labels=np.array([1]), multimask_output=True)
    return m, s

bg_m, bg_s = probe(250, 250)                       # a dark background pixel
nu_m, nu_s = probe(int(cx), int(cy))               # a nucleus
print("background pixel value", plane[250, 250],
      "-> areas", [int(x.sum()) for x in bg_m], "scores", np.round(bg_s, 4))
print("nucleus  pixel value", plane[int(cy), int(cx)],
      "-> areas", [int(x.sum()) for x in nu_m], "scores", np.round(nu_s, 4))

t = time.time()
anns = SAM2AutomaticMaskGenerator(model).generate(rgb)     # defaults
areas = np.array([a["area"] for a in anns])
print("automatic (defaults): %d masks in %.0fs, median area %d"
      % (len(anns), time.time() - t, np.median(areas)))
print("CellProfiler on this image: 289 nuclei")

# Masks are binary float32 with a leading candidate axis, not bool.
assert bg_m.shape == (3,) + plane.shape and bg_m.dtype == np.float32
assert set(np.unique(bg_m)) <= {0.0, 1.0}
assert bg_s.shape == (3,)
# There is no "nothing here": the background prompt returns a large, confident mask.
assert bg_m[int(np.argmax(bg_s))].sum() > 0.5 * plane.size
# ...and it is more confident than anything it returned for the real nucleus.
assert bg_s.max() > nu_s.max()
# Automatic generation at defaults finds far fewer objects than the field contains.
assert len(anns) < 200
print("OK")
```

**Expect.**

Invariants — a failure means the skill is wrong, not that upstream moved:

- `predict(multimask_output=True)` returns `masks` of shape `(3, H, W)`, dtype `float32`,
  containing only 0.0 and 1.0, and `scores` of shape `(3,)`. Code that treats `masks` as
  boolean or as a single mask is wrong on both counts.
- A point on empty background returns a mask covering more than half the field, at a high
  score. SAM 2 has no null answer, so the score cannot be used as a detection test.
- That background score exceeds every score returned for a genuine nucleus — the ordering
  that makes `argmax(scores)` an unsafe selector on microscopy.
- `point_coords` is `(x, y)` while `plane` is indexed `(row, col)`; the script indexes
  `plane[250, 250]` and `plane[int(cy), int(cx)]` accordingly.
- The automatic generator at defaults returns far fewer masks than the field contains,
  and every ann dict has keys `segmentation`, `area`, `bbox`, `crop_box`, `point_coords`,
  `predicted_iou`, `stability_score`.

Observed values, from a CPU run on 25 Aug 2026 against the `092824` checkpoints and torch
2.13.0 — these shift if the checkpoints are re-released or preprocessing changes:

- image `(512, 512)` `uint8`, range 7 to 255; 420 thresholded blobs above 60.
- background prompt at (250, 250), pixel value 9: areas 247150 / 404 / 69108, scores
  0.8212 / 0.0020 / 0.1579.
- nucleus prompt at (384, 261), pixel value 97: areas 927 / 141 / 348, scores 0.1207 /
  0.2993 / 0.5777.
- automatic generation at defaults: 141 masks, about 18 s, median area 123 px, no mask
  above 5000 px. Against 289 nuclei from CellProfiler.

**Across other data.** The same prompting code was run on the Drosophila GFP-histone
time-lapse from `ExampleTrackObjects` (21 frames, 264x542, syncytial blastoderm, nuclei
far more crowded than the ExampleHuman field) and on single channels of a Vectra 7-colour
component TIFF. What generalises is everything above about scores, prompt types and the
`(x, y)` convention. What does not is the tuning: `points_per_side` and the two thresholds
that recovered a plausible count on ExampleHuman are not the ones that work on the dense
embryo, where a point prompt returns the cluster regardless of setting and a box prompt is
the only reliable route. Calibrate per assay, not per model.
