---
name: multiplex-imaging-io
description: Open multiplex imaging files — Akoya QPTIFF from PhenoCycler and Vectra, CODEX multichannel TIFF, OME-TIFF, and folders of single-channel TIFFs — resolving channels by marker name rather than position, reading regions instead of whole slides, and recovering pixel size in micrometres from the file's own tags.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [microscopy, multiplex-imaging, file-io, qptiff, image-analysis]
datasets: [https://downloads.openmicroscopy.org/images/Vectra-QPTIFF/perkinelmer/PKI_fields/LuCa-7color_%5B13860%2C52919%5D_1x1component_data.tif]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-25
  against: tifffile 2026.8.23 / mxtifffile 0.0.2 / numpy 2.5.2 / Python 3.12.8 / PerkinElmer Vectra LuCa-7color sample data (OME public sample set)
  executed: 16
  unverified: 0
---

# Opening a multiplex image

Everything downstream — segmentation, per-cell measurement, phenotyping — inherits
whatever this step gets wrong, and this step gets things wrong quietly. A channel read
by position instead of by name produces a full table of measurements attributed to the
wrong antibody. A whole-slide read at full resolution produces a `MemoryError` at best
and swap-thrashing at worst. A pixel size nobody recovered produces areas in pixels that
cannot be compared to any other dataset.

Nothing here needs an account, an API key, or a GPU. The one thing to obtain is the
sample file itself, which is public and stated where it is used.

## What these files actually are

All four formats below are TIFF underneath. What differs is where the channel names live
and whether a resolution pyramid is present.

| Format | Produced by | Channel names live in | Pyramid |
|---|---|---|---|
| QPTIFF | Akoya PhenoCycler, Vectra / Polaris | per-page `PerkinElmer-QPI-ImageDescription` XML | yes, on scans |
| Component TIFF | Akoya inForm unmixing | same per-page QPI XML | no |
| OME-TIFF | converters, most pipelines | one OME-XML block for the whole file | sometimes |
| ImageJ TIFF | CODEX processor, Fiji exports | `imagej_metadata["Labels"]`, or nowhere | no |
| Folder of TIFFs | many CODEX and MIBI pipelines | the file names | no |

`tifffile` reads all of them, is BSD-3-Clause, and is the only hard dependency of
anything below.

```bash
pip install tifffile imagecodecs numpy zarr pillow
```

`imagecodecs` is not optional in practice: Akoya writes JPEG- and LZW-compressed pages,
and without it `asarray()` raises on exactly the files you care about.

## Never index channels by position

This is the failure that survives review, because nothing about it looks wrong. Read the
canonical public Vectra 7-colour sample and ask where DAPI is:

```python
import tifffile
import xml.etree.ElementTree as ET

path = "LuCa-7color_1x1component_data.tif"
with tifffile.TiffFile(path) as tf:
    names = [(ET.fromstring(p.description).findtext("Name") or "").strip() for p in tf.pages]

print(names)
# ['PDL1 (Opal 520)', 'CD8 (Opal 540)', 'FoxP3 (Opal 570)', 'CD68 (Opal 620)',
#  'PD1 (Opal 650)', 'CK (Opal 690)', 'DAPI', 'Autofluorescence']
```

**DAPI is channel 6.** Not 0. Akoya orders component pages by emission wavelength and
appends DAPI and the autofluorescence estimate at the end. Every tutorial that opens with
`nuclei = img[0]` gets PD-L1 and segments an immune checkpoint marker as if it were
chromatin.

Build the map once and index through it everywhere:

```python
index_of = {n: i for i, n in enumerate(names)}
nuclei = index_of["DAPI"]                      # 6
tumour = index_of["CK (Opal 690)"]             # 5
```

Two things to notice about that name list, both of which bite when you try to match
against a panel table.

**The names carry the fluorophore, not just the marker.** `CD8 (Opal 540)` will not
match a panel row that says `CD8`. Split on the parenthesis when you need the bare
marker, and keep the full string as the key into the file — they are different
identifiers and conflating them silently drops channels.

**`Autofluorescence` is not a marker.** inForm's unmixing emits it as a component
alongside the real ones. Include it in a clustering run and it behaves like a
high-variance marker present on every cell. Exclude it explicitly, by name.

## The page count is not the channel count

```python
with tifffile.TiffFile(path) as tf:
    print(len(tf.pages))          # 9
    print(len(tf.series))         # 2
    print(tf.series[0].shape, tf.series[0].axes, tf.series[0].dtype)
    # (8, 1400, 1868) CYX float32
    print(tf.series[1].shape, tf.series[1].axes, tf.series[1].dtype)
    # (350, 467, 3) YXS uint8
```

Nine pages, eight channels. Page 8 is a 350x467 RGB thumbnail that Akoya writes into
the same file. Iterating `tf.pages` and treating each as a channel gives you a ninth
"marker" that is a downsampled colour preview.

And "channels equals pages minus one" is not a rule you can lean on either. A tiled
2x2 field from the same sample directory has five pages for two channels: two
`FullResolution`, one `Thumbnail` and two `ReducedResolution` pyramid levels. The
difference is invisible in the page count and stated plainly in each page's XML.

**Read through `tf.series`, not `tf.pages`.** `tifffile` has already grouped the pages
into logical images and labelled the axes; `series[0]` is the multichannel stack and
`series[1]` is the thumbnail. On a Vectra scan the same mechanism separates the pyramid
levels from the label and macro images.

If you do need the pages — the per-channel XML only exists there — filter on what the
XML says the page is:

```python
with tifffile.TiffFile(path) as tf:
    channels = [p for p in tf.pages
                if ET.fromstring(p.description).findtext("ImageType") == "FullResolution"]
print(len(channels))              # 8
```

The values `ImageType` takes across the Akoya sample set are `FullResolution`,
`ReducedResolution` and `Thumbnail`. Filter to the first and the count is right whatever
else the file happens to carry.

## Pixel size, in micrometres, from the file

A whole-slide area in pixels is a property of the objective, not the biology. Two
datasets acquired at 10x and 20x are not comparable in pixels and are comparable in
square micrometres, so convert once and put the unit in the column name.

TIFF stores resolution as a rational, in pixels per `ResolutionUnit`:

```python
with tifffile.TiffFile(path) as tf:
    page = tf.pages[0]
    num, den = page.tags["XResolution"].value
    unit = page.tags["ResolutionUnit"].value      # 3 = centimetre, 2 = inch

pixels_per_cm = num / den                          # 20080.54
um_per_pixel = 1e4 / pixels_per_cm                 # 0.4980
```

Three traps in those four lines.

**The numerator here is 4294967295** — that is 2^32 - 1, the largest value a TIFF
`RATIONAL` can hold. Akoya saturates the numerator and puts the precision in the
denominator. Code that assumes `den == 1` and reads the numerator as the resolution
gets a number four billion times too large.

**`ResolutionUnit` is 3, not the default 2.** TIFF's default is inches. Dividing by
2.54 when the file already says centimetres, or not dividing when it says inches, is a
factor-of-2.54 error in every area you report — large enough to matter, small enough to
look like biology.

**The thumbnail has its own resolution.** `tf.pages[8]` reports 1.9920 um/pixel, exactly
4x the full-resolution 0.4980. Read the tag from the page you actually measured on.

For OME-TIFF, prefer the OME-XML, which states the unit outright rather than encoding it:

```python
with tifffile.TiffFile("image.ome.tif") as tf:
    if tf.is_ome:
        root = ET.fromstring(tf.ome_metadata)
        ns = {"ome": root.tag.split("}")[0].strip("{")}
        px = root.find(".//ome:Pixels", ns)
        print(px.get("PhysicalSizeX"), px.get("PhysicalSizeXUnit"))
```

## Reading a region instead of a slide

A PhenoCycler scan is on the order of 10^5 pixels on a side across dozens of channels.
At `uint16` that is hundreds of gigabytes decompressed. `asarray()` on the full-resolution
series is not a slow path, it is a path that does not complete.

Two mechanisms, both driven through `tifffile`. The second needs `zarr` as well, which is
why it is in the install line above.

**Pick a pyramid level.** A pyramidal file's `series[0]` carries `levels`, each a halving.
Run against the tiled 2x2 field from the sample set, which has two:

```python
with tifffile.TiffFile("HandEcompressed_2x2component_data.tif") as tf:
    s = tf.series[0]
    for i, lv in enumerate(s.levels):
        print(i, lv.shape)
    # 0 (2, 2784, 3728)
    # 1 (2, 1392, 1864)
    overview = s.levels[-1].asarray()   # smallest level — safe to hold in memory
```

A PhenoCycler scan has more of them, on the same halving pattern. Use the smallest level
for anything you are going to *look at* rather than measure: tissue detection, a QC figure,
choosing where to crop. Never measure on a downsampled level and report the numbers as if
they came from level 0.

`len(s.levels)` is 1 on a file with no pyramid, so the same code path works either way and
`levels[-1]` degrades to the full-resolution image rather than raising. That is convenient
and it is also how a "fast overview" silently becomes a full-resolution read on a scan
someone exported without a pyramid — check the shape you got back.

**Slice a region out of a Zarr view.** `aszarr()` exposes the file as a chunked store that
reads only the tiles a slice touches:

```python
import zarr

with tifffile.TiffFile("HandEcompressed_2x2component_data.tif") as tf:
    store = tf.series[0].aszarr(level=0)
    z = zarr.open(store, mode="r")
    print(z.shape, z.dtype, z.chunks)      # (2, 2784, 3728) float32 (1, 512, 512)
    tile = z[:, 1000:1512, 2000:2512]      # (2, 512, 512)
    store.close()
```

The chunk shape is the file's own tile grid — `(1, 512, 512)` here — so a slice aligned to
it reads exactly the tiles it needs. A slice that straddles tile boundaries reads the
straddled tiles in full and discards the remainder, which is correct but not free.

The order of the axes in that slice is whatever `series.axes` said — check it, do not
assume `CYX`. A file written `YXC` accepts the same slice and returns a different region
without error.

## `mxtifffile`, and what it does and does not do

`mxtifffile` wraps `tifffile` with format detection and name-based reads. It is worth
knowing about because the API it advertises is exactly what this page is about — and on
the canonical public Vectra file, three of its four headline calls fail. Verified against
version 0.0.2, the current release, on 25 Aug 2026:

```python
from mxtifffile import MxTiffFile

f = MxTiffFile("LuCa-7color_1x1component_data.tif")
f.format_id                 # 'qptiff'  — detection works
f.get_fluorophores()        # all eight names — works
f.get_markers()             # ['PDL1', None, None, None, None, None, None, None]
f.print_channel_summary()   # TypeError: unsupported format string passed to NoneType.__format__
f.read_region("DAPI", pos=(0, 0), shape=(256, 256))
                            # ValueError: Biomarker 'DAPI' not found in this file
```

The cause is a mapping choice, not a bug in the file. `mxtifffile` resolves a channel's
marker from an XML element named `Marker`, and in Akoya's per-page XML that element only
appears inside the `ScanProfile` block — which Akoya writes on **page 0 only**. Page 0's
description is 14,823 characters; every other page's is about 1,970. So channel 0 gets a
marker and channels 1-7 get `None`, `read_region` by name resolves against that list, and
`print_channel_summary` formats a `None` description.

The library's own extension mechanism fixes it. Point the `biomarker` field at the `Name`
element that every page does carry:

```python
import json, importlib.resources as resources
from pathlib import Path
from mxtifffile import MxTiffFile

cfg = json.loads(resources.files("mxtifffile").joinpath("formats.json").read_text())
for fmt in cfg["formats"]:
    if fmt["id"] == "qptiff":
        fmt["channel_fields"]["biomarker"] = ".//Name"
Path("vectra-formats.json").write_text(json.dumps(cfg, indent=2))

f = MxTiffFile("LuCa-7color_1x1component_data.tif", formats_config="vectra-formats.json")
f.get_markers()
# ['PDL1 (Opal 520)', 'CD8 (Opal 540)', 'FoxP3 (Opal 570)', 'CD68 (Opal 620)',
#  'PD1 (Opal 650)', 'CK (Opal 690)', 'DAPI', 'Autofluorescence']
region = f.read_region(["DAPI", "CD8 (Opal 540)"], pos=(200, 300), shape=(128, 128), level=0)
```

`print_channel_summary()` still raises, because no Vectra page carries a `Description`
element for it to format. Print your own table.

**`read_region` mixes two axis conventions in one call, and this is the part to get
right.** Measured against a full-array reference on the sample file:

```python
region = f.read_region(6, pos=(300, 100), shape=(60, 50), level=0)
region.shape          # (50, 60) — that is (height, width)
```

`pos` is `(x, y)`. `shape` is `(width, height)`. The array that comes back is
`(row, column, channel)`, so it is `(height, width, channels)`. Passing a NumPy-style
`(rows, cols)` to `shape` silently returns a transposed region wherever the region is
not square, and raises `ValueError: Requested region exceeds image dimensions` wherever
the transposed extent runs off the edge — which is the lucky case, because it is the one
you notice.

**On licensing, `mxtifffile` contradicts itself.** Its `pyproject.toml`, `setup.cfg`,
README badge and PyPI classifiers all declare MIT; the `LICENSE` file in the repository is
the GNU General Public License v3. Running it is unaffected either way. If you intend to
vendor or redistribute it, that contradiction is unresolved upstream and is worth an issue
before you rely on either reading. `qptifffile` is the same author's earlier package and
its `LICENSE` file is empty; `mxtifffile` supersedes it.

Given all of the above, the `tifffile` route earlier on this page is the one to reach for
first. It is BSD-3-Clause, unambiguous, has no name-resolution layer to go wrong, and is
already a dependency of everything downstream.

## CODEX ImageJ TIFFs and folders of single-channel files

The CODEX processor writes a multichannel ImageJ TIFF whose channel names, when present,
live in the ImageJ metadata rather than in any XML:

```python
with tifffile.TiffFile("codex_stack.tif") as tf:
    meta = tf.imagej_metadata or {}
    labels = meta.get("Labels")          # often one label per plane; often absent
    stack = tf.series[0].asarray()
```

When `Labels` is absent there is nothing in the file to recover names from, and the
channel order is defined by the run's own cycle-and-channel table. Do not guess it. Ask
for the table, write it next to the image, and index through it.

A folder of single-channel TIFFs is the same problem with the names in the file paths:

```python
import re, glob, numpy as np, tifffile

paths = sorted(glob.glob("cycle*/*.tif"))
names = [re.search(r"_([A-Za-z0-9+-]+)\.tif$", p).group(1) for p in paths]
stack = np.stack([tifffile.imread(p) for p in paths])     # (C, Y, X)
```

Sort the paths explicitly. Directory order is filesystem order, and `cycle10` sorts
before `cycle2` under every default. The pairing of `names` to `stack` is only as good as
that sort.

## Write the channel table into the project

The channel table is the provenance record for everything measured afterwards. Write it
to disk next to the image, not into a notebook cell.

```python
import csv
import xml.etree.ElementTree as ET
import tifffile

path = "LuCa-7color_1x1component_data.tif"
rows = []
with tifffile.TiffFile(path) as tf:
    num, den = tf.pages[0].tags["XResolution"].value
    um_px = 1e4 / (num / den)
    series = tf.series[0]
    for i, page in enumerate(tf.pages):
        meta = ET.fromstring(page.description)
        if meta.findtext("ImageType") != "FullResolution":
            continue
        name = (meta.findtext("Name") or "").strip()
        rows.append({
            "index": i,
            "channel_name": name,
            "marker": name.split(" (")[0],
            "fluorophore": name[name.find("(") + 1:name.rfind(")")] if "(" in name else "",
            "is_marker": name not in ("DAPI", "Autofluorescence"),
            "height": page.shape[0],
            "width": page.shape[1],
            "dtype": str(page.dtype),
            "um_per_pixel": round(um_px, 4),
            "levels": len(series.levels),
        })

with open("channels.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
```

Alongside it, write small PNG crops so a person can confirm the mapping is right before
anything expensive runs on it. Segmenting a slide and discovering at the phenotyping
stage that the nuclear channel was PD-L1 costs a day; looking at eight thumbnails costs a
minute.

```python
import numpy as np, tifffile
from PIL import Image

with tifffile.TiffFile(path) as tf:
    stack = tf.series[0].asarray()          # small file — a scan would use a pyramid level

for i, name in enumerate(names[:stack.shape[0]]):
    crop = stack[i, :512, :512].astype(np.float32)
    lo, hi = np.percentile(crop, [1, 99.5])
    scaled = np.clip((crop - lo) / max(hi - lo, 1e-9), 0, 1) * 255
    Image.fromarray(scaled.astype(np.uint8)).save(f"qc_{i}_{name.split(' (')[0]}.png")
```

Stretch to percentiles rather than to min/max. A single hot pixel sets the max and
renders every real structure black, which reads as a dead channel.

## Dtype, and what the numbers mean

Raw Akoya and CODEX acquisitions are `uint16`. inForm's unmixed components are `float32`
in normalised counts — the sample file above runs 0 to 29.36 on DAPI, not 0 to 65535.

Two consequences. Anything that assumes a 16-bit range — `img / 65535`, a `uint8` cast, a
threshold of 1000 — is wrong on component data by three orders of magnitude. And an
intensity is comparable across cells within one image, comparable across images only after
the cross-slide correction the analysis stage does, and never comparable across markers:
each channel's scale is set by its own antibody, exposure and unmixing.

```python
import numpy as np
print(stack.dtype, float(stack.min()), float(stack.max()))    # float32 0.0 29.357
print(np.percentile(stack[index_of["DAPI"]], [50, 99]))
```

Check the range before you threshold on it, every time. It costs one line and it is the
difference between a threshold that selects nuclei and one that selects nothing.

## Try it

**Data.** The PerkinElmer Vectra 7-colour lung carcinoma sample, `LuCa-7color`, from the
Open Microscopy public sample-image set. Released by PerkinElmer under
**CC-BY-4.0** (see `COPYING` beside the file); no account, no token. The 1x1 component
field used here is 85 MB and was confirmed reachable on 25 Aug 2026.

Two neighbours in the same directory are worth knowing about. `HandEcompressed_[11004,54205]_2x2component_data.tif`
(117 MB) is the tiled, pyramidal file the *Reading a region* section is verified against —
use it to exercise `levels` and `aszarr`, which a single 1x1 field cannot. And
`PKI_scans/LuCa-7color_Scan1.qptiff` is a 2.09 GB whole-slide QPTIFF, which is the realistic
shape of PhenoCycler output; the host serves it at a few hundred KB/s, so budget for that
rather than putting it in a quick test.

**Run.** Self-contained, no other setup:

```bash
pip install tifffile imagecodecs numpy zarr pillow
curl -L -o LuCa-7color_1x1component_data.tif \
  "https://downloads.openmicroscopy.org/images/Vectra-QPTIFF/perkinelmer/PKI_fields/LuCa-7color_%5B13860%2C52919%5D_1x1component_data.tif"
```

```python
import xml.etree.ElementTree as ET
import numpy as np
import tifffile

path = "LuCa-7color_1x1component_data.tif"

with tifffile.TiffFile(path) as tf:
    pages = tf.pages
    names = [(ET.fromstring(p.description).findtext("Name") or "").strip() for p in pages]
    kinds = [ET.fromstring(p.description).findtext("ImageType") for p in pages]
    series = tf.series[0]
    stack = series.asarray()
    num, den = pages[0].tags["XResolution"].value
    unit = pages[0].tags["ResolutionUnit"].value

um_px = 1e4 / (num / den)
channels = [n for n, k in zip(names, kinds) if k == "FullResolution"]
index_of = {n: i for i, n in enumerate(channels)}

print("pages", len(pages), "| full-resolution channels", len(channels))
print("series0", series.shape, series.axes, series.dtype)
print("channels", channels)
print("DAPI index", index_of["DAPI"], "| CK index", index_of["CK (Opal 690)"])
print("resolution unit", unit, "| um/pixel", round(um_px, 4))

dapi = stack[index_of["DAPI"]]
print("DAPI range", float(dapi.min()), round(float(dapi.max()), 3))

# A region read, and the axis order that comes back with it.
region = stack[:, 100:150, 300:360]
print("region", region.shape)

# The invariant that makes name-lookup worth doing: position and name disagree.
assert index_of["DAPI"] != 0, "DAPI would be channel 0 only if the file were reordered"
assert not np.array_equal(stack[0], dapi)
# The channel axis is the FullResolution page count -- not the page count.
assert stack.shape[0] == len(channels)
assert [k for k in kinds if k != "FullResolution"] == ["Thumbnail"]
print("OK")
```

**Expect.**

Invariants — a failure here means the skill is wrong, not that upstream moved:

- `series[0].axes` is `CYX` and `series[0].shape[0]` equals the number of `FullResolution`
  pages, so the channel axis is first and the two spatial axes follow. This is the
  relationship that holds; "pages minus one" holds only on files with exactly one
  non-channel page, which is why the assertion pairs it with the `ImageType` filter.
- `index_of["DAPI"]` is not `0`, and `stack[0]` is not the DAPI plane — the assertion that
  makes positional indexing fail loudly instead of silently.
- `ResolutionUnit` is `3` (centimetre), so the micrometre conversion is `1e4 / (num/den)`;
  reading it as inches gives a value 2.54x wrong.
- A NumPy slice `stack[:, 100:150, 300:360]` returns `(channels, 50, 60)` — rows then
  columns. `mxtifffile.read_region(pos=(300, 100), shape=(60, 50))` returns the same
  pixels as `(50, 60, channels)`. Same region, two conventions.

Observed values, from a run on 25 Aug 2026 against tifffile 2026.8.23 — these move only if
PerkinElmer republishes the sample:

- `pages` 9, `FullResolution` channels 8, `series[0].shape` `(8, 1400, 1868)`, dtype
  `float32`.
- Channel order `PDL1 (Opal 520)`, `CD8 (Opal 540)`, `FoxP3 (Opal 570)`, `CD68 (Opal 620)`,
  `PD1 (Opal 650)`, `CK (Opal 690)`, `DAPI`, `Autofluorescence`. DAPI at index 6, CK at 5.
- `XResolution` `(4294967295, 213887)`, `ResolutionUnit` 3, printing as `0.498` um/pixel.
- DAPI range 0.0 to 29.357 — float32 normalised counts, not a 16-bit range.

**Across other files in the same set.** The reader above was re-run against the two H&E
component files in the same directory, which differ from the 7-colour field on every axis
that could break it:

| File | Pages | `ImageType` values | Channels | Layout | um/px |
|---|---|---|---|---|---|
| `LuCa-7color_[13860,52919]_1x1component_data.tif` | 9 | 8 x FullResolution, Thumbnail | 8 | strips | 0.4980 |
| `HnE_3_1x1component_data.tif` | 3 | 2 x FullResolution, Thumbnail | 2 | strips | 0.4989 |
| `HandEcompressed_[11004,54205]_2x2component_data.tif` | 5 | 2 x FullResolution, Thumbnail, 2 x ReducedResolution | 2 | tiled | 0.4989 |

The `ImageType` filter, the `XResolution` conversion and the series-versus-pages
distinction hold on all three. Three things do not generalise, and each is why the code
above is written the way it is: the channel count, the position of any given marker — the
H&E files are `['Eosin', 'Hematoxylin']`, with no DAPI at all — and the page count, which
the tiled file inflates with two `ReducedResolution` pyramid pages that are neither
channels nor the thumbnail.
