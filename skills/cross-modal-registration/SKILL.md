---
name: cross-modal-registration
description: Bring a fluorescence, CODEX or IHC section into the same coordinate frame as its H&E image using ACCREDIT — building one representation both modalities share, searching orientation and scale before refining, and reading the reference-free quality score honestly enough to separate a good registration from a wrong one that scores well.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [microscopy, multiplex-imaging, image-analysis, registration, spatial]
datasets: [https://zenodo.org/api/records/5675686/files/DAB-thumbnail.jpg/content, https://zenodo.org/api/records/5675686/files/Fluo-thumbnail.jpg/content, https://zenodo.org/api/records/12624860/files/ZH811_INF_v6.ome.tif/content, https://zenodo.org/api/records/12624860/files/HE_scans.zip/content]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-29
  against: ACCREDIT at commit 9293473 / opencv-python 5.0.0 / tifffile 2026.8.23 / imagecodecs 2026.8.16 / SimpleITK 2.5.6 / scikit-image 0.26.0 / numpy 2.5.2 / Python 3.12.8 — one EPFL BIOP brightfield-versus-fluorescence pair and one GBM CODEX-versus-H&E pair, both from Zenodo
  executed: 8
  unverified: 0
---

# Putting two modalities in one coordinate frame

A CODEX panel and the H&E section beside it are two pictures of the same tissue in two
coordinate systems. Every downstream claim — this marker is in that morphological
compartment, this cell is inside that annotated region — is a claim about the map between
them. Getting that map wrong does not produce an error. It produces a table.

That is what makes registration different from the steps around it. A segmentation that
fails looks like nothing; a registration that fails looks like a slightly different
answer. So the work splits in two, and the second half is the harder one: compute a
transform, then **prove it is the right transform** without a ground truth to compare
against.

**ACCREDIT** (Zhou, Zhao, Ren *et al.*, OHSU) is the framework this page works through. It
is MIT-licensed, runs six modality-specific pipelines behind one entry point — plus a
`senior` variant for hard partial-overlap samples — scores every result with a reference-free
composite, and escalates through a fixed ladder of recovery strategies when the score is low.
The scoring is the interesting part and it is also where the traps are; the sections below
are mostly about reading those numbers correctly.

This page is about the transform and the score. Getting the pixels and marker names out of
a multiplex file is the `multiplex-imaging-io` skill; turning aligned pixels into a
cell-by-marker table is `codex-phenocycler`. Both of those assume the frames already agree,
which is what this page delivers.

## What you have to obtain first

Nothing on the fluorescence-to-H&E path needs an account, a token or a GPU:

```bash
pip install numpy opencv-python tifffile imagecodecs SimpleITK scikit-image
git clone --depth 1 https://github.com/LeeZhou-bearway/ACCREDIT.git
```

`imagecodecs` is not in the project's own install line and you will need it. The H&E
scans in the benchmark dataset used below are JPEG-compressed OME-TIFFs, and without it
the pipeline's very first read fails:

```
ValueError: <COMPRESSION.JPEG: 7> requires the 'imagecodecs' package
```

`openslide-python` is needed only for the brightfield whole-slide path, which reads SVS
through OpenSlide. The DAPI, CODEX and general-fluorescence pipelines import numpy,
OpenCV, tifffile, `skimage.color` and SimpleITK and nothing else.

**The H&E-to-IHC path additionally needs `torch` and LightGlue, and one of its two
pretrained models is non-commercial.** The project states this itself, in
`pipelines/he_ihc/METHODS.md`, alongside the substitution:

> | SuperPoint weights | MagicLeap research-only | **No** — use LightGlue's alternative |
> | LightGlue weights | Apache-2.0 | Yes |
>
> For commercial deployment, replace SuperPoint with LightGlue's DISK backend (Apache-2.0)
> or use ALIKED (MIT).

So the restriction is on the feature extractor in one of six pipelines, not on the
framework. Read it as three routes. Fluorescence to H&E — DAPI, CODEX, Xenium boundaries,
spatial transcriptomics — never loads SuperPoint and is unrestricted. H&E to IHC as shipped
loads SuperPoint and is academic-research-only. H&E to IHC with DISK or ALIKED substituted
for the extractor is unrestricted and is the one to take for commercial work. The same
file marks its reimplementation of the DeeperHistReg non-rigid core as *"Check DHR repo
(likely GPL-style) — Requires checking"*, which is upstream telling you the HE-IHC path has
one more licence question open than the fluorescence path does. That is a second reason to
lead with fluorescence where the science allows.

**The rescue agent needs a metered API key that is billed separately from any subscription
to a chat product.** The project's README says an existing subscription covers it. It does
not — API access is its own billed product, and a seat on a chat plan carries no API credit.
Budget for per-token cost before you turn the rescue on. Set `ANTHROPIC_API_KEY` in the
environment, or pass `--api-key`, which writes the same variable. You also need the
`anthropic` package, which the top-level install line omits and which only
`pipelines/he_ihc/README.md` mentions. Nothing about the deterministic pipelines requires
any of this — the rescue is an optional branch and the sections below say exactly when it
fires.

## One representation both modalities can be compared in

Registration algorithms compare intensities. H&E is dark tissue on a light field;
fluorescence is bright signal on a dark field. Nothing aligns until both are the same way
up.

Two conversions, and they are not interchangeable:

```python
import cv2, numpy as np
from skimage.color import rgb2hed

def he_inverted(rgb):
    """Whole-tissue proxy — everything stained shows up."""
    return (255 - cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)).astype(np.uint8)

def he_hematoxylin(rgb):
    """Nuclear proxy — comparable to a DAPI channel. Normalise on percentiles."""
    h = rgb2hed(rgb.astype(np.float64) / 255.0)[:, :, 0]
    lo, hi = np.percentile(h, [1, 99])
    return (np.clip((h - lo) / (hi - lo + 1e-8), 0, 1) * 255).astype(np.uint8)
```

Inverted grayscale is a proxy for total optical density and responds to both stains; the
hematoxylin channel isolates the nuclear component, so it is the side to compare a nuclear
stain against. Measured on the pair in `## Try it`, at the transform that block recovers,
the effect is real and small:

| moving channel | NCC vs inverted grayscale | NCC vs hematoxylin |
|---|---|---|
| fluorescence red | **0.2546** | 0.2059 |
| fluorescence green | 0.2984 | **0.3060** |
| fluorescence blue | 0.3074 | **0.3150** |

The nuclear-looking channels prefer hematoxylin and the non-nuclear one prefers inverted
grayscale, in the direction the mechanism predicts, by a few hundredths. Treat it as a
tie-breaker once a registration is working, not as the thing that makes one work.

**Normalise the hematoxylin channel on percentiles, not on min and max.** ACCREDIT contains
both — `registration/preprocess.py` uses the 1st and 99th percentiles, and
`run_fluo2he.he_to_h_channel` uses `h.min()` and `h.max()`. On the brightfield thumbnail in
`## Try it` the two produce images with means of 42.1 and 3.4 out of 255; the min-max
version puts **0.0%** of pixels above intensity 32 against **35.4%** for the percentile
version, because one extreme pixel sets the whole range. It survives inside `register_orb`
only because an Otsu threshold immediately follows it and recovers most of the mask (16.4%
of the frame against 18.7%). Anywhere the H channel is used as an intensity rather than as
input to a threshold, the min-max form is a bug waiting for a dust particle.

The fluorescence side needs the same treatment for the same reason — stretch between
percentiles of the **non-zero** pixels, because a fluorescence frame is mostly true zeros
and including them puts the 1st percentile at 0:

```python
def stretch(plane):
    f = plane.astype(np.float32)
    pos = f[f > 0]
    lo, hi = np.percentile(pos, [1, 99])
    return np.clip((f - lo) / (hi - lo + 1e-10) * 255, 0, 255).astype(np.uint8)
```

Tissue masks come from Otsu on those representations, closed and dilated so that a villus
lumen or a necrotic core does not read as background:

```python
def tissue_mask(gray):
    _, m = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k, iterations=2)
    return cv2.morphologyEx(m, cv2.MORPH_DILATE, k, iterations=1)
```

The structuring element is 15 pixels **at whatever resolution you hand it**. ACCREDIT
builds the fixed and moving masks with this same kernel at two different working scales, so
the dilation is not the same physical distance on both. Resize both images to a common
working size before masking, or the masks disagree by construction.

## Never let it pick the modality for you

`run_unified_agent.py` detects the modality from file content and then, in single-pair
mode, **blocks on `input()`** waiting for confirmation. An unattended agent hangs there
forever. Pass `-y`, or use batch mode, which is non-interactive by construction.

More importantly, pass `--mode` explicitly, because the detector misroutes both of the
commonest real inputs. Its fluorescence branch decides between the single-channel DAPI
pipeline and the CODEX pipeline on `len(tifffile.TiffFile(path).pages) > 5` — a page count,
not a channel count. That distinction is the subject of the `multiplex-imaging-io` skill;
here is what it costs. Four files, one detector:

| file | pages | real channels | detected |
|---|---|---|---|
| one DAPI plane, plain 2-D grayscale TIFF | 1 | 1 | `AxisError` — crashes |
| 3 fluorescence channels written as a 6-page pyramid or z-stack | 6 | 3 | `codex` |
| a 40-marker CODEX panel written as one 3-D page | 1 | 40 | `dapi` |
| brightfield H&E RGB named `block_2.tif` | 1 | 3 | `he-ihc` |

Three of those four are wrong and the first does not survive at all. The crash is
`AxisError: axis 2 is out of bounds for array of dimension 2`, raised inside the thumbnail
loader on any 2-D image — which is the ordinary shape of a single-plane fluorescence
export.

The last row is a substring match. `ck` is in the detector's IHC filename keyword list, for
cytokeratin, and it is tested with `in`, so it matches inside `block`, `stack`, `check` and
`back`. Rename that file `section_2.tif` and the same pixels are detected as `he-he`.
Filename-driven pipeline selection is fine when the filenames were designed for it and
catastrophic when they were not.

`--mode` takes `boundary`, `dapi`, `codex`, `he-ihc`, `he-he`, `st-he` or `senior`. Choose
it from what you know about the acquisition, and let detection be a cross-check you read
rather than a decision you delegate.

## The transform ladder

Cross-modal pairs from adjacent sections or different instruments differ in orientation,
scale, translation and — after that — in local deformation. Solve them in that order,
because a refinement step cannot recover an orientation error.

**Orientation and scale first, by search.** There is no gradient to descend from a 180°
error. ACCREDIT's DAPI pipeline enumerates 4 flips × 4 rotations × 6 scale ratios and keeps
the best; the CODEX pipeline searches channels instead, scoring each one by
`cv2.matchTemplate` with `TM_CCOEFF_NORMED` against the inverted H&E and registering the
winner. Either way, the outer loop is exhaustive and the inner one is not.

**Check where in the grid the winner landed.** Those six ratios are literally
`[0.5, 0.7, 0.8, 1.0, 1.2, 1.5]`, applied after both images are scaled to their own working
targets. The fine similarity fit that follows can move off the winning ratio, so the grid is
not a hard bound — but it is the starting point for a local optimisation, and a winner sitting
on the edge of the range means the optimum may be outside it. On the pair in `## Try it` the
pipeline's grid bottoms out at `0.5`, the fine step settles at a full-resolution scale of
0.526, and an exhaustive full-resolution search finds 0.470 with **2.4× the structural
correlation** — 0.3151 against 0.1289. Nothing in the output says the winner was on a
boundary. Compute the expected ratio from the two pixel sizes before you start, and pre-scale
one image if it lands near or outside the ends of the range.

**Translation by phase correlation, per candidate.** `cv2.phaseCorrelate` on the two masks
gives a translation in one FFT, so the search grid only has to cover scale and rotation.

**Then a similarity or affine fit.** ACCREDIT branches on whether the two images are within
20% of each other in size — ORB features on Otsu-binarised masks if so, SimpleITK
`Similarity2DTransform` with Mattes mutual information if not.

That branch is worth knowing about, because the quantity it tests is not the quantity it is
named after. `res_ratio` is the **mean of the two per-axis pixel-dimension ratios**, and the
variable it sets is called `same_resolution`. On the pair in `## Try it` the width ratio is
1.061 and the height ratio is 0.809 — a badly mismatched pair whose mean is 0.935, inside
the ORB window. Two images at the same micrometres-per-pixel but different crops fail the
test; two images at wildly different micrometres-per-pixel but similar pixel counts pass it.
Neither image's actual pixel size is consulted. Read it off the file yourself.

**Refine last, and check what the refinement actually applied.** `ecc_refine` runs
`cv2.findTransformECC` with `MOTION_EUCLIDEAN`, which estimates a rotation and a
translation — and then adds only the two translation entries back into the transform. Feed
it a pair differing by a 4° rotation and the linear part comes back untouched:

```
before: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
after : [[1.0, 0.0, -15.8562], [0.0, 1.0, 30.2891]]
```

That is a translation standing in for a rotation. It pulls the tissue centroid together and
pushes the periphery further apart, and the tissue-overlap metrics reward it. Only accept a
refinement that improved a metric sensitive to internal structure — see below.

## The twelve numbers, and what each one is actually measuring

`compute_quality_metrics_v2` returns twelve keys. Five of them, weighted, form the composite
quality score (QCS); two more become multipliers on it; four are computed and never read;
the twelfth is the composite itself.

| key | what the name suggests | what it computes | in the composite |
|---|---|---|---|
| `tissue_dice` | the tissue overlaps | Dice of the two Otsu masks | weight 0.30 |
| `boundary_dice` | the outlines agree | Dice restricted to a ±8 px band around either outline | weight 0.30 |
| `hausdorff_mean` | Hausdorff distance | **mean** symmetric nearest-neighbour distance between the two **largest** contours | weight 0.15, as `1 − hd/HD_MAX` |
| `hausdorff_95` | 95th-percentile Hausdorff | 95th percentile of the same distance set | unused |
| `inlier_ratio` | the images match | fraction of ORB matches kept by a **freshly estimated** RANSAC affine | weight 0.10, saturating at 0.15 |
| `n_inliers`, `n_matches` | counts | counts | unused |
| `ncc` | the pixels agree | Pearson correlation inside the overlap | **unused** in the default composite |
| `nmi` | mutual information | `(H(a)+H(b))/H(a,b)` over pixels where both exceed zero | weight 0.15, saturating at 1.15 |
| `coverage` | how much tissue is covered | warped mask area ÷ **total frame pixels** | multiplier `min(1, cov/0.20)` |
| `bg_coverage` | signal landing on background | warped mask ∩ H&E background ÷ H&E background | multiplier `1 − bg` |
| `qcs` | the composite | the weighted sum × both multipliers | — |

**`eval_px` is a free parameter that moves the score, and it does not resize anything.** It
scales `HD_MAX` — 500 px at the default 4000 — and nothing else, so it is a promise about
what resolution you warped at rather than an instruction. Pass the wrong one and the
Hausdorff term silently changes. The same transform on the same pixels from `## Try it`,
whose images are 848 px on the long side:

| `eval_px` | `HD_MAX` | Hausdorff sub-score | QCS |
|---|---|---|---|
| 512 | 64 | 0.0000 | 0.5250 |
| **848**, the true long side | 106 | 0.3201 | **0.5729** |
| 4000, the default | 500 | 0.8559 | 0.6531 |

A 0.13 swing on identical pixels, which is more than twice the gap between the pipeline's
"accept this" threshold and its "call the rescue agent" threshold.

**The DAPI pipeline does not pass its own working size.** It builds its masks at
`WORK_SIZE = 2000` on the long side and calls the scorer with `eval_px=4000`, so `HD_MAX` is
twice what it should be and the Hausdorff term is systematically over-generous. On the run
in `## Try it` that is not academic — the pipeline's own metrics rescored at 2000 give:

| `eval_px` | QCS |
|---|---|
| 4000, as the pipeline passes | 0.6177 |
| 2000, its actual working size | 0.5893 |

`QCS_DONE` is 0.60, so its own result moves from *accepted* to *below threshold*. Set
`eval_px` to the long side you actually evaluated at, and do not compare a published HE-IHC
score against a published DAPI one.

## Four places the number is not what its name says

Each of these is reproduced by the Tier 0 block in `## Try it`, which needs no download.

**A perfect boundary match is scored as the worst possible one.** The composite reads the
Hausdorff term as `metrics.get('hausdorff_mean', HD_MAX) or HD_MAX`. Python's `or` treats
`0.0` as absent, so the one value that means *the contours coincide exactly* is replaced by
the value that means *they could not be further apart*. Holding everything else fixed:

| `hausdorff_mean` | QCS |
|---|---|
| 0.0 | 0.75 |
| 0.005 | 0.90 |
| 1.0 | 0.8977 |
| 500.0 | 0.75 |

The better of the two — the one whose contours coincide exactly — scores **0.15 lower** than
one that misses by a hundredth of a pixel. `hausdorff_mean` is rounded to two decimals before
this, so anything under 0.005 px trips it, which in practice means an identity transform.
That is exactly the self-registration sanity check people run first, and it reports 0.75
where the arithmetic says 0.90.

**Only the largest contour of each mask is measured.** Both Hausdorff values come from
`max(contours, key=len)` on each mask, so a specimen with two tissue fragments is scored on
one of them. Move the smaller fragment 340 px and leave the larger one identical:
`tissue_dice` correctly drops to 0.9120 while `hausdorff_mean` and `hausdorff_95` both
report **0.0** — a perfect boundary match, which then hits the falsy-zero above and is
scored as the worst one. Two defects in series, and the visible symptom is a good
registration losing 0.15.

**The inlier ratio does not measure your transform.** `orb_inlier_ratio` detects ORB
features in both images and runs `cv2.estimateAffinePartial2D` with RANSAC — estimating a
*new* transform from scratch and reporting what fraction of matches it keeps. RANSAC
absorbs whatever translation is present, so the number barely moves as you displace the
result. Measured across the twelve shifted and rotated variants the `## Try it` block scores —
every shift from 0 to 160 px and every rotation up to 180° — it ranges from **0.326 to
0.565**, and because it saturates at 0.15 its sub-score is **1.000 for all twelve**. A tenth
of the composite is a constant. On smooth synthetic images ORB finds no matches at all and it
is a constant 0.000 instead. Neither constant is a measurement.

**`ncc` is computed and then discarded.** The module docstring calls normalized
cross-correlation "most discriminating metric" and the default composite does not read it.
Set it to −1.0, 0.0 or 1.0 with everything else fixed and the QCS is 0.6467 all three times.
It is used only by `composite_quality_score_cycif`, the full-field-of-view variant, at
weight 0.20 and normalised by a ceiling of 0.40 — so even there, the NCC of 0.3151 that the
correct registration below achieves contributes 0.158 of 1.00, and an NCC of 0.11
contributes 0.055. **If you want NCC to gate anything, read it directly.**

## The finding that matters — a silhouette is not an alignment

Four of the five weighted terms are computed on binary tissue masks. Masks describe the
outline. Two outlines can agree while the structure inside them is displaced by tens of
micrometres, which is the whole failure mode a cell-resolution claim depends on excluding.

Measured on the brightfield-versus-fluorescence pair in `## Try it` — same section, two
modalities, the fluorescence covering part of the brightfield field at a different scale.
Three transforms, all scored at `eval_px = 848`, the images' true long side:

| transform | scale | `tissue_dice` | `ncc` | QCS | what it looks like |
|---|---|---|---|---|---|
| the grid point with the best `tissue_dice` | 0.860 | **0.8283** | −0.0035 | 0.5620 | structure visibly offset from structure |
| the grid point with the best `ncc` | 0.470 | 0.5925 | **0.3151** | 0.5729 | every crypt on its own crypt |
| ACCREDIT's `dapi` pipeline, 597 s | 0.526 | 0.6760 | 0.1289 | **0.5951** | correct, slightly loose |

Two things to take from that table. The metric carrying the single largest weight ranks the
visibly wrong transform **first**, by 40%. And the composite puts all three inside a band of
**0.033**, ordering them in a way uncorrelated with structural agreement — it correctly puts
the worst last, and it inverts the top two, preferring the transform whose NCC is less than
half the other's. NCC spans −0.0035 to 0.3151 over the same three.

Which grid point comes out on top depends on the search bounds, and so does the composite's
ordering of the first two rows; narrow the grid and the wrong transform scores higher
instead. The 2-to-3% margin is the finding. The ranking is not stable enough to be one.

The mechanism is not subtle once stated. The moving image covers only part of the fixed
one, so Dice compares a small warped mask against the whole fixed tissue mask and every
uncovered pixel counts against it. Scaling the moving image **up** covers more fixed tissue
and raises Dice, while destroying the internal correspondence. **Dice rewards covering more
tissue. Correct registration does not always cover more tissue.** ACCREDIT's `coverage`
multiplier is aimed at the opposite failure — a warp that collapses — and does nothing
about this one.

That mechanism also says where the problem stops, and the sweep at the end of `## Try it`
confirms it: crop the fixed image to the region the moving one covers, so both describe the
same tissue, and `tissue_dice` on the same transform goes from 0.5925 to 0.9725 and the
composite becomes decisive. **The composite is valid on full-field pairs and unreliable on
partial-field ones**, and nothing in its output tells you which you have — which is what the
null control below is for.

What the composite *does* do is separate gross failure from success. Displace the correct
transform and it falls monotonically:

| shift | 0 px | 5 px | 10 px | 20 px | 40 px | 80 px | 160 px |
|---|---|---|---|---|---|---|---|
| QCS | 0.5729 | 0.5317 | 0.4998 | 0.4608 | 0.4073 | 0.3236 | 0.1909 |
| `ncc` | 0.3151 | 0.1213 | 0.0391 | −0.0494 | −0.0280 | 0.0168 | −0.0280 |

So it works as a catastrophe detector and not as a ranking. Notice where the pipeline's own
thresholds sit against that table: `QCS_DONE` is 0.60, the rescue gate is 0.65 and the
give-up threshold is 0.25. A **10-pixel** displacement costs 0.073 — larger than the entire
gap between "accept this" and "call the rescue agent". The operating thresholds are inside
the noise band.

### The null control — the cheapest honest test on this page

Score the registration you obtained. Then score the same registration with the moving image
rotated 180°, and compare.

```python
M180 = (np.vstack([M, [0, 0, 1]])
        @ np.vstack([cv2.getRotationMatrix2D((w / 2, h / 2), 180, 1.0), [0, 0, 1]]))[:2]
```

A 180° flip is the largest orientation error possible and the commonest gross failure in
this domain. Whatever metric you are gating on must separate the answer from it by a wide
margin. On the `## Try it` pair:

| | correct | rotated 180° | ratio |
|---|---|---|---|
| QCS | 0.5729 | 0.4031 | **1.4×** |
| `ncc` | 0.3151 | 0.0255 | **12×** |
| `tissue_dice` | 0.5925 | 0.4754 | 1.2× |

A compact specimen overlaps itself under rotation, so silhouette metrics cannot see
orientation at all. Run this control on **your** pair before you trust any threshold on it.
If your score ranks the answer within 1.5× of a 180° flip, it is not measuring alignment on
your data and it must not be the gate. On a full-field version of the same pair the composite
clears that bar by 90×, so this is a question about your framing rather than about the tool,
and one warp answers it.

### What to gate on instead

Read `ncc` on the overlap directly and require it to clear a floor you set from the null
control. Report the composite alongside as context, not as the decision. The overlap mask is
one line and the call is already in the library:

```python
from quality_metrics import ncc, compute_quality_metrics_v2

overlap = ((fixed_mask > 0) & (warped_mask > 0)).astype(np.uint8) * 255
structure = ncc(fixed_inverted, warped_moving, mask=overlap)
metrics = compute_quality_metrics_v2(fixed_mask, warped_mask, fixed_inverted, warped_moving,
                                     eval_px=max(fixed_mask.shape))
```

Constrain the overlap when you search on NCC, or the optimiser will find a tiny
high-correlation patch and stop. Requiring the overlap to be at least half the warped
tissue's own area is enough, and it is what the `## Try it` search does.

Two honest limits on this recommendation. NCC assumes a monotone intensity relationship
between the modalities, which cross-modal pairs only approximately have — a realistic good
value here is 0.32, not 0.9, and the floor has to be calibrated per pair rather than
carried over. And `nmi` is the more principled cross-modal choice, except that the composite
normalises it as `(nmi − 1.0)/0.15` and saturates at 1.15, so anything genuinely informative
is clipped to the same number; if you use NMI, use the raw value, not the sub-score.

## The CODEX pipeline mis-scales the transform it scores

Verified against commit 9293473 on 2026-08-29, and worth re-checking before you read any
CODEX QCS.

`pipelines/codex/run_codex_pipeline.py` holds two functions that convert a full-resolution
transform down to the working resolution. `_save_overlay` multiplies the linear part by
`he_scale / fl_scale`. `_compute_qcs`, in the same file, multiplies it by
`fl_scale / he_scale`. They are reciprocals, so they cannot both be right, and the derivation
says the overlay is: a point at `he_scale · (A · p + t)` in the working frame is
`(he_scale / fl_scale) · A · p_work + he_scale · t`.

The consequence only appears when the H&E and the CODEX image differ in pixel dimensions,
which is the normal case. Build a pair that is exactly a 2× rescaling of itself — a 6000 ×
4500 H&E and a 3000 × 2250 CODEX — so the true transform is known to be `[[2,0,0],[0,2,0]]`,
and warp the nuclear mask both ways:

| linear factor applied | mask Dice against the H&E |
|---|---|
| `he_scale / fl_scale` = 0.667, as `_save_overlay` uses | **0.9609** |
| `fl_scale / he_scale` = 1.500, as `_compute_qcs` uses | 0.0822 |

Handed the exact correct transform, `_compute_qcs` returns **QCS 0.1972**. The same call
with the ratio cancelled returns 0.5163. All six QCS evaluations in the CODEX decision
cascade go through that function, and every threshold in it — 0.60 to proceed, 0.55, 0.35,
0.25 to give up — is read from that number.

**On real data it changes the verdict, and the pipeline's own log shows it.** Tier 2 of
`## Try it` runs the shipped CODEX pipeline on a 43-channel GBM panel against its
name-matched H&E. At step 4 the region-of-interest module registers the pair, scores its own
warp in its own frame, and prints:

```
  QCS=0.842  td=0.874  bd=0.874  ncc=0.555  hd=17.4
  Final dice: 0.8739  QCS: 0.8416
  ROI: QCS=0.2209
```

Two lines apart, one registration, 0.8416 and 0.2209. The first is the module scoring the
warp it actually performed; the second is the parent re-scoring the same transform through
`_compute_qcs`. The pipeline keeps the second, and four steps later prints
`STEP 6: All steps failed (QCS=0.2209 < 0.25)` and writes a `user_guidance.txt` telling the
reader to check orientation and scale by hand.

Putting the same transform back through the same function with the ratio cancelled gives
**QCS 0.6908, `tissue_dice` 0.9013, `ncc` 0.4475** — above the pipeline's own 0.60 acceptance
threshold — and the overlay it wrote shows the CODEX signal sitting on the H&E tissue. The
ROI module's own 0.8416 is itself inflated, by the `eval_px` mismatch described above, so
0.6908 is the number to believe. Both are more than three times the verdict the pipeline
recorded.

Three practical consequences. **Check whether it bites you**: the applied factor is
`(fl_scale / he_scale)²` times the correct one, where each scale is `min(1, 4000 / long
side)`. That is 1.0 in exactly two situations — the two long sides are equal, or both are at
or below 4000 px so both scales clamp to 1.0. Whole-slide pairs are neither. In the
synthetic pair above the factor is 2.25; where both images exceed 4000 px it is
`(L_fixed / L_moving)²`. **Do not compare a CODEX QCS to a DAPI or HE-IHC one** — they are
not the same quantity. And **score the CODEX result yourself** with
`compute_quality_metrics_v2`, warping the moving image into the fixed frame with your own
scaling, which is what the `## Try it` Tier 2 block does. The overlay image the pipeline
writes is scaled correctly, so a good-looking overlay next to a poor QCS is the signature of
this and not of a bad registration.

## When the score is low

The CODEX pipeline escalates through a fixed ladder: register the best protein channel,
then a nuclear-channel mutual-information rescue, then a rotation-and-phase-correlation
rescue on the protein channel, then a region-of-interest registration with a channel and
scale search, then the exhaustive DAPI orientation search as a fallback, and finally a
`user_guidance.txt` file if the score is still under 0.25. Each step is entered on a
threshold and the best result across all of them is kept, so a later step never makes things
worse.

Above that sits an optional LLM rescue agent, gated in `run_unified_agent.py` on
`qcs < 0.65 and qcs > 0`, for the `dapi`, `codex`, `boundary` and `st-he` modalities. Four
things to know before you rely on it.

**It cannot fire on a total failure.** The `qcs > 0` half of the condition means a
registration scoring exactly zero — the worst outcome the pipeline can produce — skips the
rescue entirely.

**Its failures are swallowed.** The call sits inside a bare `except Exception` that logs one
line and continues. With no key, no package, or a stale model identifier, the run completes
normally and returns the unrescued result. The only evidence is that line, which on a host
without the SDK reads exactly:

```
Rescue agent failed: No module named 'anthropic'
```

Nothing about this reaches `result.json` or `pipeline_summary.json`. If you are consuming
those files programmatically, grep the log for `Rescue agent` before concluding the rescue
ran.

**The model identifier is hard-coded**, in two places in `agent/agent.py`. Read it out of
that file rather than assuming it — model names are retired on the provider's schedule, and
a stale one fails at the first API call and lands in the swallowed-exception path above.

**It is a search, not an oracle.** The agent selects among the same enhancement, rotation,
channel-selection and re-registration tools the deterministic ladder already exposes, and it
decides using the composite score. Everything in the sections above about that score
applies to its decisions too. A rescue that improves the composite without improving the
overlap NCC has improved the score, not the registration.

## When a fetch returns 403 or 429, vary the request before concluding anything

This belongs in a registration page because assembling a cross-modal pair means fetching
from several hosts, and a wrong conclusion here silently narrows what you will attempt.

`assets.hubmapconsortium.org` answers **403 to any User-Agent beginning `curl/` or
`Wget/`** and reaches the application for every other client string. Confirmed on
2026-08-29:

```bash
for ua in "curl/8.7.1" "Wget/1.21.4" "Mozilla/5.0"; do
  printf "%-16s " "$ua"
  curl -s -o /dev/null -w "%{http_code}\n" -I -A "$ua" "https://assets.hubmapconsortium.org/"
done
# curl/8.7.1       403
# Wget/1.21.4      403
# Mozilla/5.0      404
```

The 403 is a client-string block. The 404 is the application answering. Reported as-is, the
first reads as "this data is not publicly accessible", which is false and would have been
recorded as fact. A 429 from a data portal is usually a bot check on the landing page rather
than a limit on the file host, and the same applies.

So: on 403 or 429, change the User-Agent, try the direct file URL rather than the landing
page, and try one other client before writing anything down. Set `-A` on any curl aimed at
a HuBMAP host. This is not about being clever with headers — it is that "I could not reach
it" and "it is not available" are different findings, and only one of them is worth acting
on.

## What to write into the project

The transform is the artefact. Everything downstream is a re-derivation from it, so it has
to be recoverable without re-running anything:

```python
import json, numpy as np

np.save("moving_to_fixed_affine.npy", M)        # 2x3, maps moving pixels -> fixed pixels
json.dump({
    "fixed": {"path": fixed_path, "width": W, "height": H},
    "moving": {"path": moving_path, "width": w, "height": h},
    "transform_maps": "moving pixel coordinates -> fixed pixel coordinates",
    "search": {"scale": float(scale), "angle_deg": float(angle)},
    "metrics": {k: float(v) for k, v in metrics.items()},
    "ncc_overlap": float(structure),
    "ncc_overlap_rotated_180": float(structure_180),
}, open("registration.json", "w"), indent=2)
```

Alongside it, an overlay PNG. Every number on this page can be produced by a transform that
is visibly wrong, and the two minutes it takes to look at the overlay is the only check that
never misreports. Save it at a resolution where individual structures are distinguishable —
a 2000 px long side is enough to see whether crypts land on crypts, and a 500 px thumbnail
is not.

Write down which of the two H&E representations you used, which channel drove the
registration, the search bounds, the working resolution, and the NCC floor you set from the
null control. None of those is recoverable from the transform matrix, and each of them
changes the answer.

## Where this stops

Resolving a channel to a marker name, reading a region instead of a whole slide, and
recovering the pixel size from a file's own tags are the `multiplex-imaging-io` skill.
Choosing segmentation channels, running a segmenter over the aligned stack, measuring per
cell and assembling the AnnData are `codex-phenocycler`. The spatial statistics that follow
are `spatial-phenotyping`.

This page hands over one 2×3 matrix and an honest statement of how well it holds. It does
not do non-rigid deformation beyond what the pipelines apply internally, it does not
propagate a transform to segmentation masks or point sets, and it does not register three
or more modalities into a common frame — for the last, register each moving image to the
same fixed H&E rather than chaining, because chained transforms compound their errors and
the composite score cannot see the compounding.

## Try it

Three tiers. Tier 0 needs no data at all and reproduces the four metric defects. Tier 1 adds
0.2 MB and does a real cross-modal registration with the null control. Tier 2 is 849 MB and
runs ACCREDIT's own CODEX pipeline on a published benchmark pair.

**Data.** Tier 1 is `DAB-thumbnail.jpg` and `Fluo-thumbnail.jpg` from *Test Dataset for
Whole Slide Image Registration* (EPFL BIOP, Zenodo `10.5281/zenodo.5675686`), **CC BY 4.0**,
no account. They are one mouse duodenum section imaged twice — 848 × 484 brightfield with a
DAB chromogen, and 799 × 598 fluorescence covering part of the same field at a different
magnification. They are **thumbnails**, not the dataset: the record's 1,075 MB
`warpy-demo-project.zip` holds the real slides. So Tier 1 exercises the representation,
search, scoring and null control, and does **not** exercise OME-TIFF pyramid loading,
channel selection or memory behaviour.

Tier 2 is `ZH811_INF_v6.ome.tif` (718 MB CODEX) and its 1:1 name-matched
`ZH811_INF_v6_HE.ome.tif` (6.2 MB, inside the 131 MB `HE_scans.zip`) from *Glioma
spatialomics dataset* (Zenodo `10.5281/zenodo.12624860`), **CC BY 4.0**, no account. That is
the CODEX-plus-H&E resource behind Greenwald, Galili-Darnell, Hoefflin *et al.*, Cell 187(10)
2485–2501, 2024. Zenodo does not honour range requests on these files, so a dropped
connection restarts the download from zero — use a retry loop rather than `curl -C -`. All
four URLs confirmed reachable 2026-08-29.

**Run.** Cold, in an empty directory.

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install numpy opencv-python tifffile imagecodecs SimpleITK scikit-image
git clone --depth 1 https://github.com/LeeZhou-bearway/ACCREDIT.git
```

### Tier 0 — the twelve numbers and the four defects, no download

```python
import sys, numpy as np, cv2
sys.path.insert(0, "ACCREDIT/quality")
from quality_metrics import (compute_quality_metrics_v2, composite_quality_score,
                             hausdorff_distance, tissue_dice)

H = W = 512
fixed = np.zeros((H, W), np.uint8)
cv2.ellipse(fixed, (256, 250), (170, 115), 20, 0, 360, 210, -1)
cv2.circle(fixed, (430, 440), 42, 210, -1)          # a second tissue fragment
fixed = cv2.GaussianBlur(fixed, (0, 0), 3)
fixed_mask = ((fixed > 0) * 255).astype(np.uint8)

def shift(img, d):
    return cv2.warpAffine(img, np.float32([[1, 0, d], [0, 1, d]]), (W, H))

print("displacement -> the twelve numbers, and the composite")
print(f"{'px':>4} {'dice':>7} {'bnd':>7} {'ncc':>8} {'hd_mean':>8} {'IR':>6} {'nmi':>7} {'cov':>7} {'bg':>7} {'QCS':>7}")
for d in (0, 5, 20, 60, 150):
    mv, mm = shift(fixed, d), shift(fixed_mask, d)
    m = compute_quality_metrics_v2(fixed_mask, mm, fixed, mv, eval_px=512)
    print(f"{d:>4} {m['tissue_dice']:>7.4f} {m['boundary_dice']:>7.4f} {m['ncc']:>8.4f} "
          f"{m['hausdorff_mean']:>8.2f} {m['inlier_ratio']:>6.3f} {m['nmi']:>7.4f} "
          f"{m['coverage']:>7.4f} {m['bg_coverage']:>7.4f} {m['qcs']:>7.4f}")
print("keys returned:", len(compute_quality_metrics_v2(fixed_mask, fixed_mask, fixed, fixed, eval_px=512)))

base = dict(tissue_dice=1.0, boundary_dice=1.0, inlier_ratio=0.0, nmi=2.0,
            coverage=0.5, bg_coverage=0.0)
print("\nA. a perfect boundary match is scored as the worst possible one")
for hd in (0.0, 0.005, 0.01, 1.0, 500.0):
    print(f"   hausdorff_mean={hd:<7} QCS={composite_quality_score({**base, 'hausdorff_mean': hd}, eval_px=512)}")

print("\nB. ncc is computed and then discarded by the default composite")
b = dict(tissue_dice=0.8, boundary_dice=0.6, hausdorff_mean=10.0, inlier_ratio=0.05,
         nmi=1.08, coverage=0.5, bg_coverage=0.02)
for v in (-1.0, 0.0, 1.0):
    print(f"   ncc={v:<5} QCS={composite_quality_score({**b, 'ncc': v}, eval_px=512)}")

print("\nC. only the largest contour is measured")
moved = fixed_mask.copy()
moved[380:500, 380:500] = 0                                    # delete the small fragment
cv2.circle(moved, (90, 450), 42, 255, -1)                      # and put it 340 px away
print(f"   tissue_dice          {tissue_dice(fixed_mask, moved):.4f}")
print(f"   hausdorff_mean, _95  {hausdorff_distance(fixed_mask, moved)}")

assert composite_quality_score({**base, 'hausdorff_mean': 0.0}, eval_px=512) \
     < composite_quality_score({**base, 'hausdorff_mean': 1.0}, eval_px=512)
assert (composite_quality_score({**b, 'ncc': -1.0}, eval_px=512)
        == composite_quality_score({**b, 'ncc': 1.0}, eval_px=512))
assert hausdorff_distance(fixed_mask, moved) == (0.0, 0.0) and tissue_dice(fixed_mask, moved) < 0.95
print("\nOK")
```

**Expect — Tier 0.** Invariants; a failure here means this page is wrong:

- Twelve keys come back from `compute_quality_metrics_v2`.
- `hausdorff_mean = 0.0` scores **strictly lower** than `hausdorff_mean = 1.0`, everything
  else held fixed.
- The composite is identical for `ncc = −1.0` and `ncc = +1.0`.
- The two-fragment mask reports `(0.0, 0.0)` for both Hausdorff values while `tissue_dice`
  is below 0.95 — the displaced fragment is invisible to one metric and visible to the other.
- `inlier_ratio` is `0.000` on every row. ORB finds no features on smooth synthetic shapes,
  so the 0.10 inlier term contributes nothing here — the mirror image of the real-data case
  below, where it is pinned at its ceiling instead.

Observed on 2026-08-29 with OpenCV 5.0.0 and numpy 2.5.2; these move if OpenCV changes its
contour or ORB implementations:

```
  px    dice     bnd      ncc  hd_mean     IR     nmi     cov      bg     QCS
   0  1.0000  1.0000   1.0000     0.00  0.000  2.0000  0.2939  0.0000  0.7500
   5  0.9659  0.7845   0.7897     3.97  0.000  1.1986  0.2939  0.0142  0.8042
  20  0.8645  0.5289   0.2090    16.05  0.000  1.0335  0.2939  0.0564  0.5321
  60  0.6598  0.4834   0.0845    47.63  0.000  1.0200  0.2786  0.1271  0.3503
 150  0.3586  0.4615  -0.1121   103.21  0.000  1.0168  0.2191  0.1800  0.2155
```

The first two rows are the falsy-zero in the wild: a 5-pixel misalignment scores **0.8042**
and perfect alignment scores **0.7500**.

### Tier 1 — a real cross-modal registration and the null control

Every Zenodo URL here uses the API route, `​/api/records/<id>/files/<name>/content`, rather
than the browser one. Same bytes, and it is what `datasets:` declares, so the nightly probe
checks the address you actually run. The browser route works from a laptop but has been seen
answering HTML instead of the file when the request comes from a datacenter address — CI,
Colab, a cloud VM — which is exactly where an unattended run of this skill lives.

```bash
curl -sL -o DAB-thumbnail.jpg  "https://zenodo.org/api/records/5675686/files/DAB-thumbnail.jpg/content"
curl -sL -o Fluo-thumbnail.jpg "https://zenodo.org/api/records/5675686/files/Fluo-thumbnail.jpg/content"
```

```python
import sys, numpy as np, cv2
sys.path.insert(0, "ACCREDIT/quality")
from quality_metrics import compute_quality_metrics_v2, ncc, tissue_dice

def tissue(gray):
    _, m = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k, iterations=2)
    return cv2.morphologyEx(m, cv2.MORPH_DILATE, k, iterations=1)

def norm8(a):
    f = a.astype(np.float32); pos = f[f > 0]
    lo, hi = np.percentile(pos, [1, 99])
    return np.clip((f - lo) / (hi - lo + 1e-10) * 255, 0, 255).astype(np.uint8)

dab = cv2.cvtColor(cv2.imread("DAB-thumbnail.jpg"), cv2.COLOR_BGR2RGB)
flu = cv2.cvtColor(cv2.imread("Fluo-thumbnail.jpg"), cv2.COLOR_BGR2RGB)
H, W = dab.shape[:2]; h, w = flu.shape[:2]
print(f"fixed  brightfield DAB  {W}x{H}")
print(f"moving fluorescence     {w}x{h}")
print(f"per-axis size ratios: width {W/w:.3f} height {H/h:.3f} -> mean {(W/w + H/h)/2:.3f}")

he_inv = (255 - cv2.cvtColor(dab, cv2.COLOR_RGB2GRAY)).astype(np.uint8)
mv = norm8(cv2.cvtColor(flu, cv2.COLOR_RGB2GRAY))
he_m, mv_m = tissue(he_inv), tissue(mv)
cy, cx = h / 2, w / 2
mv_area = float((mv_m > 0).sum())

def build(s, th, dx, dy):
    M = cv2.getRotationMatrix2D((cx, cy), th, s); M[0, 2] += dx; M[1, 2] += dy; return M
def warp(M):
    return cv2.warpAffine(mv_m, M, (W, H)), cv2.warpAffine(mv, M, (W, H))
def score(M):
    wm, wf = warp(M)
    return compute_quality_metrics_v2(he_m, wm, he_inv, wf, eval_px=max(H, W))
def ncc_of(M):
    wm, wf = warp(M)
    ov = ((he_m > 0) & (wm > 0)).astype(np.uint8) * 255
    s2 = (M[0, 0] ** 2 + M[1, 0] ** 2)
    return ncc(he_inv, wf, mask=ov) if (ov > 0).sum() > 0.5 * mv_area * s2 else -1.0

cands = []
for s in np.arange(0.42, 0.90, 0.01):
    for th in np.arange(-6, 10.1, 2.0):
        R = cv2.getRotationMatrix2D((cx, cy), th, s)
        (dx, dy), _ = cv2.phaseCorrelate(np.float32(cv2.warpAffine(mv_m, R, (W, H))) / 255.,
                                         np.float32(he_m) / 255.)
        cands.append((s, th, dx, dy))

by_dice = max(cands, key=lambda p: tissue_dice(he_m, warp(build(*p))[0]))
by_ncc  = max(cands, key=lambda p: ncc_of(build(*p)))

print()
print(f"{'chosen by':>11} {'scale':>6} {'angle':>6} {'dice':>7} {'ncc':>8} {'IR':>6} {'nmi':>7} {'cov':>6} {'QCS':>7}")
for label, p in (("tissue dice", by_dice), ("ncc", by_ncc)):
    m = score(build(*p))
    print(f"{label:>11} {p[0]:>6.3f} {p[1]:>6.1f} {m['tissue_dice']:>7.4f} {m['ncc']:>8.4f} "
          f"{m['inlier_ratio']:>6.3f} {m['nmi']:>7.4f} {m['coverage']:>6.4f} {m['qcs']:>7.4f}")

M = build(*by_ncc); M3 = np.vstack([M, [0, 0, 1]])
print("\ndegrading the ncc-chosen transform by a pure shift")
print(f"{'px':>5} {'dice':>7} {'ncc':>8} {'QCS':>7}")
for d in (0, 5, 10, 20, 40, 80, 160):
    Md = M.copy(); Md[0, 2] += d; Md[1, 2] += d
    m = score(Md); print(f"{d:>5} {m['tissue_dice']:>7.4f} {m['ncc']:>8.4f} {m['qcs']:>7.4f}")

print("\nthe null control: rotate the moving image and re-score")
print(f"{'deg':>5} {'dice':>7} {'ncc':>8} {'QCS':>7}")
rot = {}
for th in (0, 10, 45, 90, 180):
    Mr = (M3 @ np.vstack([cv2.getRotationMatrix2D((cx, cy), th, 1.0), [0, 0, 1]]))[:2]
    rot[th] = score(Mr)
    print(f"{th:>5} {rot[th]['tissue_dice']:>7.4f} {rot[th]['ncc']:>8.4f} {rot[th]['qcs']:>7.4f}")

m0, m180 = rot[0], rot[180]
print(f"\nseparation between the answer and a 180-degree flip")
print(f"   QCS {m0['qcs']:.4f} / {m180['qcs']:.4f} = {m0['qcs']/m180['qcs']:.2f}x")
print(f"   NCC {m0['ncc']:.4f} / {abs(m180['ncc']):.4f} = {abs(m0['ncc']/m180['ncc']):.0f}x")

wf = warp(M)[1]; ovl = dab.copy(); k = wf > 30
ovl[k] = (ovl[k] * 0.55 + np.array([0, 255, 0], np.uint8) * 0.45).astype(np.uint8)
cv2.imwrite("overlay_ncc.png", cv2.cvtColor(ovl, cv2.COLOR_RGB2BGR))
np.save("M_moving_to_fixed.npy", M)
print("\nwrote overlay_ncc.png and M_moving_to_fixed.npy")

d_dice, d_ncc = score(build(*by_dice)), score(build(*by_ncc))
assert d_dice['tissue_dice'] > 1.3 * d_ncc['tissue_dice']          # dice prefers the wrong transform
assert abs(d_dice['qcs'] - d_ncc['qcs']) / d_ncc['qcs'] < 0.10     # the composite cannot separate them
assert d_ncc['ncc'] > 10 * abs(d_dice['ncc'])                      # ncc separates them by an order of magnitude
assert m0['ncc'] > 10 * abs(m180['ncc'])                           # ncc sees a 180-degree flip
assert m0['qcs'] / m180['qcs'] < 1.5                               # the composite barely does
assert m0['inlier_ratio'] > 0.15                                   # the inlier term sits on its ceiling
print("OK")
```

**Expect — Tier 1.** About ten seconds. Invariants:

- `tissue_dice` prefers the transform with essentially zero structural correlation, by more
  than 30%.
- The composite separates those two transforms by less than 10% — it cannot rank them.
- `ncc` separates them by more than an order of magnitude, and separates the answer from a
  180° flip by more than 10×, while the composite stays under 1.5×.
- `inlier_ratio` exceeds 0.15 on the correct transform, so its sub-score is saturated at
  1.000 and the 0.10 inlier term is constant.
- Open `overlay_ncc.png`. Every crypt cross-section in the green channel sits on its own
  brightfield counterpart. That is what an NCC of 0.32 looks like on a cross-modal pair, and
  it is the calibration the number has no meaning without.

Observed on 2026-08-29:

```
fixed  brightfield DAB  848x484
moving fluorescence     799x598
per-axis size ratios: width 1.061 height 0.809 -> mean 0.935

  chosen by  scale  angle    dice      ncc     IR     nmi    cov     QCS
tissue dice  0.860    8.0  0.8283  -0.0035  0.281  1.0222 0.4850  0.5620
        ncc  0.470    0.0  0.5925   0.3151  0.559  1.0584 0.2070  0.5729

degrading the ncc-chosen transform by a pure shift
   px    dice      ncc     QCS
    0  0.5925   0.3151  0.5729
    5  0.5783   0.1213  0.5317
   10  0.5609   0.0391  0.4998
   20  0.5304  -0.0494  0.4608
   40  0.4801  -0.0280  0.4073
   80  0.3947   0.0168  0.3236
  160  0.1888  -0.0280  0.1909

the null control: rotate the moving image and re-score
  deg    dice      ncc     QCS
    0  0.5925   0.3151  0.5729
   10  0.5698   0.0511  0.5089
   45  0.4997   0.0010  0.4089
   90  0.4792  -0.0205  0.3908
  180  0.4754   0.0255  0.4031

separation between the answer and a 180-degree flip
   QCS 0.5729 / 0.4031 = 1.42x
   NCC 0.3151 / 0.0255 = 12x
```

Here the composite happens to put the right transform first, by 0.0109. On a narrower search
grid — 0.55 to 0.75 in steps of 0.005 — it puts the wrong one first instead, by 0.011. The
margin is what holds; the ordering is not stable enough to be a finding, and a gate whose
sign flips with a search bound is not a gate.

**Across other inputs.** The same reader was run against the ACCREDIT `dapi` pipeline
end-to-end on this pair, and against a synthetic 6000 × 4500 H&E paired with a 3000 × 2250
CODEX stack:

| input | what it exercised | outcome |
|---|---|---|
| this pair, through the shipped entry point in `--mode dapi -y` | the orientation search, ECC and BSpline steps | 597 s on a 0.4-megapixel pair; scale 0.526, correct overlay; QCS reported as 0.6177 at `eval_px=4000`, 0.5893 at its true 2000 px working size, 0.5951 when its transform is rescored in the frame above; rescue gate fired at `qcs < 0.65` and failed on the missing SDK |
| synthetic 2× rescaled pair, through `_compute_qcs` | the CODEX full-to-work transform scaling | true transform scored **0.1972**; warping with the overlay function's ratio instead gives mask Dice 0.9609 against 0.0822 |
| four TIFFs differing only in page layout and filename | `detect_modality` | one crash, two misroutes, one filename-driven misroute |
| a JPEG-compressed OME-TIFF H&E without `imagecodecs` | the first read in every pipeline | `ValueError: <COMPRESSION.JPEG: 7> requires the 'imagecodecs' package` |

The three code defects generalised — the falsy-zero, the largest-contour restriction and the
discarded NCC are properties of the source and appeared identically on synthetic and real
data. **The silhouette problem did not**, and how it varies is the most useful thing in this
section. Running the same transform and the same null control across four variants of the
pair:

| variant | `tissue_dice` | `ncc` | QCS | QCS vs its own 180° flip | NCC vs 180° |
|---|---|---|---|---|---|
| as published, 848 × 484 | 0.5925 | 0.3151 | 0.5729 | 1.42× | 12× |
| both downsampled 2×, 424 × 242 | 0.5870 | 0.4374 | 0.5494 | 1.34× | 57× |
| both downsampled 4×, 212 × 121 | 0.5556 | 0.4856 | 0.5281 | **1.17×** | 23× |
| moving cast to `uint16` | 0.5925 | 0.3151 | 0.5729 | 1.42× | 12× |
| fixed cropped to the moving's footprint | 0.9725 | 0.3117 | 0.8146 | **90×** | 14× |

Three conclusions, and the last one is the operative one:

**Bit depth is a non-event.** Percentile stretching over the non-zero pixels makes 8-bit and
16-bit inputs produce byte-identical scores. Nothing to guard against.

**The composite discriminates *worse* at lower resolution.** The 15-pixel morphology kernel,
the 8-pixel boundary band and `HD_MAX` are all fixed pixel counts, so downsampling shrinks
the real errors relative to them while leaving the tolerances put. NCC, having no length
scale, sharpens instead. Do not validate a registration on a downsampled proxy.

**The silhouette problem is a partial-field problem.** Crop the fixed image to the region the
moving one actually covers and both images describe the same tissue — `tissue_dice` goes to
0.9725 and the composite separates the answer from a 180° flip by **90×** instead of 1.4×.
So the composite is not broken; it is valid on full-field pairs and unreliable on
partial-field ones, and nothing in its output says which you have. `## Try it`'s null control
is how you find out, and it takes one warp.

One trap in the other direction. `composite_quality_score_cycif` exists for full-field pairs
and is the right variant there — but on a **partial**-field pair its stricter coverage floor
and area-ratio penalty both reward over-scaling. Feeding this pair to it, the score **rises**
monotonically from 0.0055 at the correct transform to 0.1033 at 40% too large — nineteen
times better for a registration whose NCC has collapsed from 0.3151 to 0.0614. Choose the
variant from the framing, not from the modality name.

### Tier 2 — ACCREDIT's own CODEX pipeline on a published benchmark pair

849 MB and roughly an hour of download at the rate Zenodo serves these files.

```bash
curl -sL --retry 5 --retry-delay 15 -o HE_scans.zip \
  "https://zenodo.org/api/records/12624860/files/HE_scans.zip/content"
unzip -q HE_scans.zip
until [ "$(stat -f%z ZH811_INF_v6.ome.tif 2>/dev/null || stat -c%s ZH811_INF_v6.ome.tif 2>/dev/null || echo 0)" -ge 718135498 ]; do
  curl -sL --retry 5 --retry-delay 15 -o ZH811_INF_v6.ome.tif \
    "https://zenodo.org/api/records/12624860/files/ZH811_INF_v6.ome.tif/content"
done
```

```bash
. .venv/bin/activate
cat > tier2.py <<'EOF'
import json, os, sys, numpy as np, cv2, tifffile
for sd in ("", "quality", "registration", "pipelines/codex",
           "pipelines/fluo_general", "pipelines/dapi"):
    sys.path.insert(0, os.path.join("ACCREDIT", sd))
from run_codex_pipeline import run_codex_pipeline, _compute_qcs
from quality_metrics import compute_quality_metrics_v2, ncc

HE, MV = "HE/ZH811_INF_v6_HE.ome.tif", "ZH811_INF_v6.ome.tif"
with tifffile.TiffFile(HE) as t:
    he_shape, he_levels = t.series[0].shape, len(t.series[0].levels)
with tifffile.TiffFile(MV) as t:
    mv_shape, mv_pages = t.series[0].shape, len(t.pages)
print("fixed  H&E  ", he_shape, "pyramid levels", he_levels)
print("moving CODEX", mv_shape, "pages", mv_pages)

he_long, mv_long = max(he_shape[:2]), max(mv_shape[-2:])
he_scale, mv_scale = min(1.0, 4000 / he_long), min(1.0, 4000 / mv_long)
print(f"long sides {he_long} and {mv_long}")
print(f"_compute_qcs applies {mv_scale/he_scale:.4f}; the correct factor is {he_scale/mv_scale:.4f}")
print(f"the scaling defect bites here: {abs(mv_scale/he_scale - he_scale/mv_scale) > 1e-9}")

res = run_codex_pipeline(HE, MV, "out_codex")
summary = json.load(open("out_codex/pipeline_summary.json"))
print("\nreported stage", summary["final_stage"], "reported QCS", summary["final_qcs"])

# Re-score the same transform with the correct full-to-work ratio.
M = np.array(res["M_full"] if "M_full" in res else json.load(open("out_codex/result.json"))["M_full"])
M_fixed = M.copy(); M_fixed[:, :2] *= (he_scale / mv_scale) / (mv_scale / he_scale)
qcs_corrected, m_corrected = _compute_qcs(HE, MV, M_fixed, "out_codex")
print("QCS with the ratio cancelled  ", qcs_corrected)
print("ncc on the overlap            ", m_corrected["ncc"])
print("tissue_dice                   ", m_corrected["tissue_dice"])
EOF
python tier2.py
```

**Expect — Tier 2.** About 18 minutes and a peak of roughly 9 GB of resident memory on ten
cores; the 43-channel × 7-ratio scan in step 4 alone takes 694 s. The pipeline reads the
whole 43-channel stack into memory, so budget for it. Nothing is printed until the process
exits if you redirect stdout, because Python buffers it.

Invariants — a failure here means this page is wrong:

- The pipeline writes `result.json`, `pipeline_summary.json`, `pipeline.log`,
  `user_guidance.txt` and `overlay_final.png` into `out_codex`, and `pipeline_summary.json`
  carries `final_stage`, `final_qcs` and the six thresholds.
- The two images do **not** share a long-side pixel count, so the scaling defect applies: the
  block prints `True` for that line, and the two ratios it prints are reciprocals.
- The QCS printed with the ratio cancelled is **more than three times** the QCS the pipeline
  reports, and the `ncc` that comes with it is above 0.4 — a registration the pipeline
  declared a failure.
- `overlay_final.png` is scaled by the correct ratio and shows the CODEX signal filling the
  H&E tissue outline. Where the overlay looks right and the reported QCS looks bad, believe
  the overlay.

Observed on 2026-08-29, first and last lines of the run:

```
fixed  H&E   (10275, 8334, 3) pyramid levels 3
moving CODEX (43, 8885, 7194) pages 43
long sides 10275 and 8885
_compute_qcs applies 1.1564; the correct factor is 0.8647
the scaling defect bites here: True
...
STEP 6: All steps failed  (QCS=0.2209 < 0.25)
Total time: 1047s

reported stage failed reported QCS 0.2209
QCS with the ratio cancelled   0.6908
ncc on the overlap             0.4475
tissue_dice                    0.9013
```

Two more observed values worth knowing, both from the middle of the log. Channel selection
scores all 43 channels by template match and picks **ch39** at 0.5482; the region-of-interest
step in the ladder independently picks **ch31** by its own QCS scan. Different channel, same
panel, two selection criteria — so "the best channel" is a property of the scoring rule, not
of the panel, and it belongs in whatever you write down about the run.
