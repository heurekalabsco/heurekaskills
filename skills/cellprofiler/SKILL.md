---
name: cellprofiler
description: Run CellProfiler pipelines headlessly and edit them as text — the -c -r invocation, LoadData CSVs that carry per-image metadata, batch groups, illumination correction before measurement, and joining the exported per-object tables back to the images they came from.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [microscopy, image-analysis, segmentation, cellprofiler, cell-counting]
datasets: [https://raw.githubusercontent.com/CellProfiler/examples/master/ExampleHuman/ExampleHuman.cppipe, https://raw.githubusercontent.com/CellProfiler/examples/master/ExampleHuman/images/AS_09125_050116030001_D03f00d0.tif]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-25
  against: CellProfiler 4.2.8 (container image, linux/amd64 under emulation on arm64) / Python 3.12.8 for the pipeline-editing and CSV-joining code / CellProfiler ExampleHuman and ExampleIlluminationCorrection datasets
  executed: 15
  unverified: 0
---

# Running CellProfiler without the GUI

CellProfiler is usually met as a desktop application, and the pipeline you build in it is
a text file. That is the fact this page is built on: `.cppipe` is line-oriented, diffable,
editable and committable, so a pipeline can be inspected, changed and version-controlled
in the project rather than reconstructed by clicking.

This is a different tool from scikit-image measurement, and a different one from
deep-learning segmentation. Reach for CellProfiler when the work is a fixed,
multi-module measurement protocol applied identically to many images — a plate, a screen,
a batch — and you want the protocol itself to be the artefact.

## What a reader needs before the first run

**A container runtime.** Installing CellProfiler 4.2.8 from PyPI is possible in principle
and painful in practice: it pins `scipy==1.9.0` and `scikit-image==0.18.3`, and pulls in
`python-javabridge` (needs a JDK and compiles), `wxPython` (needs GUI toolkits even when
you never open a window) and `mysqlclient` (needs MySQL client headers). None of those
pins has a wheel for a current Python. The published container image sidesteps all of it:

```bash
docker pull cellprofiler/cellprofiler:4.2.8
docker run --rm cellprofiler/cellprofiler:4.2.8 --version      # 4.2.8
```

The image is published for `linux/amd64` only. On Apple Silicon or another arm64 host,
add `--platform linux/amd64` to every command below and expect emulation overhead —
measured here at roughly 8 seconds for a three-image, fourteen-module pipeline, and
proportionally more for a plate.

If you do want the library rather than the application, `cellprofiler-core` carries the
pipeline and measurement machinery without the GUI modules, and is the lighter of the two
installs. It is still bound by the same pins.

## The headless invocation

```bash
docker run --rm -v "$PWD":/data -w /data cellprofiler/cellprofiler:4.2.8 \
  -c -r -p pipeline.cppipe -i /data/images -o /data/out
```

- `-c` runs without the GUI. `-r` runs the pipeline immediately rather than waiting.
  Both are needed; `-c` alone opens a headless session and exits.
- `-p` is the pipeline, `-i` the input directory, `-o` the output directory.
- Paths are resolved **inside the container**. `-i images` works only because `-w /data`
  made it relative to the mount; `-i /data/images` is unambiguous and is what to write.

Mount the working directory, not the host root. A skill that tells an agent to mount `/`
into a container has handed away the machine, and nothing about image analysis requires it.

Output lands as one CSV per object class plus one for the image, written by whatever
`ExportToSpreadsheet` module the pipeline ends with — not by the command line. A pipeline
with no export module runs to completion and writes nothing, which reads as a silent
failure and is not one.

## `.cppipe` is a text file — read it, edit it, commit it

The format is a header, then one block per module: a header line carrying
`module_num`, `variable_revision_number` and flags, then four-space-indented
`Setting name:value` lines.

```
IdentifyPrimaryObjects:[module_num:5|svn_version:'Unknown'|variable_revision_number:14|...]
    Select the input image:DNA
    Name the primary objects to be identified:Nuclei
    Typical diameter of objects, in pixel units (Min,Max):8,80
    ...
    Threshold strategy:Global
    Thresholding method:Minimum Cross-Entropy
    Threshold correction factor:1.0
```

Listing the modules is enough to understand what a pipeline does:

```python
import re
from pathlib import Path

HEADER = re.compile(r"^(\w+):\[module_num:(\d+)\|", re.M)

def modules(path):
    """(module_num, name, line_index) for every module, in file order."""
    lines = Path(path).read_text().splitlines()
    return [(int(m.group(2)), m.group(1), i)
            for i, line in enumerate(lines) if (m := HEADER.match(line))]

print([(n, name) for n, name, _ in modules("ExampleHuman.cppipe")])
# [(1, 'Images'), (2, 'Metadata'), (3, 'NamesAndTypes'), (4, 'Groups'),
#  (5, 'IdentifyPrimaryObjects'), (6, 'IdentifyPrimaryObjects'), (7, 'RelateObjects'),
#  (8, 'IdentifySecondaryObjects'), (9, 'IdentifyTertiaryObjects'),
#  (10, 'MeasureObjectIntensity'), (11, 'MeasureObjectSizeShape'),
#  (12, 'OverlayOutlines'), (13, 'SaveImages'), (14, 'ExportToSpreadsheet')]
```

The third element of each tuple is the line index, dropped in that print and used by
`settings()` and `set_setting()` below to bound a module's block.

### The trap: a setting name is not a key

The settings list is **positional**. CellProfiler reads it by index and the names are
labels for a human, so the same name can appear twice in one module and mean two
different things. `IdentifyPrimaryObjects` module 5 above contains `Thresholding method`
twice — once holding `Minimum Cross-Entropy` and once holding `Otsu` — because the
threshold-settings group carries a slot for the method the adaptive branch would use.

A naive `text.replace("Threshold correction factor:1.0", "...")` also hits every other
module in the file. Scope the edit to one module and refuse when the key is ambiguous:

```python
def settings(path, module_num):
    lines = Path(path).read_text().splitlines()
    starts = {n: i for n, _, i in modules(path)}
    order = sorted(starts.values())
    s = starts[module_num]
    e = next((x for x in order if x > s), len(lines))
    out = {}
    for line in lines[s + 1:e]:
        if line.startswith("    "):
            k, _, v = line[4:].partition(":")
            out.setdefault(k, []).append(v)          # a list, because keys repeat
    return out

def set_setting(path, module_num, key, value, out_path):
    lines = Path(path).read_text().splitlines()
    starts = {n: i for n, _, i in modules(path)}
    order = sorted(starts.values())
    s = starts[module_num]
    e = next((x for x in order if x > s), len(lines))
    hits = 0
    for i in range(s + 1, e):
        if lines[i].startswith(f"    {key}:"):
            lines[i] = f"    {key}:{value}"
            hits += 1
    if hits != 1:
        raise ValueError(f"{key!r} matched {hits} lines in module {module_num} — "
                         "refusing an ambiguous edit")
    Path(out_path).write_text("\n".join(lines) + "\n")
    return out_path
```

`settings()` returning a list per key is not defensiveness for its own sake — it is what
makes `set_setting` able to detect the ambiguity instead of silently editing the first
match.

### Measure the effect of an edit; do not assume it

Editing the nuclear threshold on ExampleHuman, running each variant, and reading
`Threshold_FinalThreshold_Nuclei` and `Count_Nuclei` out of `Image.csv`:

| `Threshold correction factor` | `OrigThreshold` | `FinalThreshold` | `Count_Nuclei` |
|---|---|---|---|
| 1.0 | 0.09860165 | 0.09860165 | 289 |
| 1.4 | 0.09860165 | 0.13804231 | 289 |
| 2.5 | 0.09860165 | 0.24650412 | 76 |

Two things worth carrying away. `FinalThreshold` is exactly `correction x OrigThreshold`,
which is how you confirm an edit landed in the module you meant. And a 40% increase in the
threshold changed the count by nothing at all, while 2.5x removed three quarters of the
objects — the response is not proportional, so the only way to know what a parameter did
is to run it and read the count.

## Per-image metadata belongs in a LoadData CSV

The `Images` -> `Metadata` -> `NamesAndTypes` chain discovers files on disk and pulls
metadata out of their names with a regular expression. That is convenient for one plate
and brittle for anything assembled from a database, a sample sheet or an LIMS export.

`LoadData` replaces all three modules with one that reads an explicit table. The CSV
convention is one column per image role, prefixed:

```
Metadata_Plate,Metadata_Well,Metadata_Site,Image_PathName_DNA,Image_FileName_DNA,Image_PathName_PH3,Image_FileName_PH3,Image_PathName_cellbody,Image_FileName_cellbody
AS_09125,D03,0,/data/images,AS_09125_050116030001_D03f00d0.tif,/data/images,AS_09125_050116030001_D03f00d1.tif,/data/images,AS_09125_050116030001_D03f00d2.tif
```

- `Image_FileName_<name>` and `Image_PathName_<name>` come in pairs, and `<name>` must be
  the image name the rest of the pipeline uses (`DNA`, `PH3`, `cellbody` here).
- `Image_PathName_*` is a path **inside the container**.
- Every `Metadata_*` column is carried through to `Image.csv` and is available for
  grouping and for joining afterwards.

Swap the modules by editing the file — remove modules 1-3, insert `LoadData` as module 1,
renumber the rest, and fix `ModuleCount`:

```python
import re
from pathlib import Path

LOADDATA = """LoadData:[module_num:1|svn_version:'Unknown'|variable_revision_number:6|show_window:False|notes:[]|batch_state:array([], dtype=uint8)|enabled:True|wants_pause:False]
    Input data file location:Default Input Folder|
    Name of the file:images.csv
    Load images based on this data?:Yes
    Base image location:None|
    Process just a range of rows?:No
    Rows to process:1,100000
    Group images by metadata?:Yes
    Select metadata tags for grouping:Well
    Rescale intensities?:Yes""".splitlines()

src = Path("ExampleHuman.cppipe").read_text().splitlines()
HEADER = re.compile(r"^(\w+):\[module_num:(\d+)\|")
starts = [(i, int(HEADER.match(l).group(2))) for i, l in enumerate(src) if HEADER.match(l)]

head = src[:next(i for i, n in starts if n == 1)]          # file header block
tail = src[next(i for i, n in starts if n == 4):]          # from Groups onward

out, n = head + LOADDATA + [""], 1
for line in tail:
    if HEADER.match(line):
        n += 1
        line = re.sub(r"module_num:\d+", f"module_num:{n}", line, count=1)
    out.append(line)

text = re.sub(r"^ModuleCount:\d+$", f"ModuleCount:{n}", "\n".join(out) + "\n",
              count=1, flags=re.M)
Path("loaddata.cppipe").write_text(text)
```

`variable_revision_number:6` is not cosmetic. CellProfiler uses it to decide how to read
the settings that follow, and a wrong number makes it misparse a valid module. Take it
from the version you are running rather than copying it from a blog post:

```bash
docker run --rm --entrypoint python3 cellprofiler/cellprofiler:4.2.8 -c "
import cellprofiler_core.preferences as prefs; prefs.set_headless()
from cellprofiler_core.modules.loaddata import LoadData
m = LoadData()
print('variable_revision_number:', m.variable_revision_number)
for s in m.settings(): print('   ', s.text)
"
```

`prefs.set_headless()` has to run **before** the module import. Import first and the
module pulls in wx, which raises `Unable to access the X Display, is $DISPLAY set
properly?` in a container that has no display. The error names X11 and the cause is import
order.

Then run it:

```bash
docker run --rm -v "$PWD":/data -w /data cellprofiler/cellprofiler:4.2.8 \
  -c -r -p loaddata.cppipe --data-file /data/images.csv -o /data/out
```

On ExampleHuman this produces the same 289 nuclei and 22 PH3 objects as the file-discovery
route, plus `Metadata_Plate`, `Metadata_Well` and `Metadata_Site` columns in `Image.csv`.
That equality is the check worth running when you convert a pipeline: the measurements
must not move, only the provenance should be added.

## Batch groups, and the failure that looks like a crashed node

`-g` runs one group of a grouped pipeline, which is how a plate is spread across a
cluster — one job per well or per site.

```bash
docker run --rm -v "$PWD":/data -w /data cellprofiler/cellprofiler:4.2.8 \
  -c -r -p loaddata.cppipe --data-file /data/images.csv -o /data/out \
  -g Metadata_Well=D03
```

**The key is the full metadata column name, not the bare tag.** The pipeline groups on
`Well`, and the command line wants `Metadata_Well`. Getting it wrong fails loudly, which
is the good case:

```
ValueError: The grouping keys specified on the command line (Well) must be the same as
those defined by the modules in the pipeline (Metadata_Well)
```

**A group that does not exist fails quietly, which is the bad case.** Ask for
`-g Metadata_Well=Z99` on a plate that has no Z99 and CellProfiler does not report an
empty selection. It starts, writes `Experiment.csv`, reaches the export module with no
image sets, and dies inside it:

```
IndexError: index 0 is out of bounds for axis 0 with size 0
```

Spread across 384 jobs, a typo'd or stale well list produces a handful of nodes that
exit non-zero with an `IndexError` in `exporttospreadsheet.py` and an output directory
holding one small file. That reads as infrastructure flakiness and is a data error.
Validate the group list against the LoadData CSV before submitting:

```python
import csv
wanted = {"D03", "Z99"}
have = {r["Metadata_Well"] for r in csv.DictReader(open("images.csv"))}
missing = wanted - have
if missing:
    raise SystemExit(f"no image sets for: {sorted(missing)}")
```

## Illumination correction goes before measurement, not after

Wide-field illumination falls off toward the edges of every field. Uncorrected, an object's
mean intensity depends on where in the field it happened to sit, and any comparison across
wells inherits the difference in how the tissue was positioned.

The module pair is `CorrectIlluminationCalculate` (build a correction function) then
`CorrectIlluminationApply` (divide or subtract it). Both must sit **before** the
`Identify*` and `Measure*` modules that use the corrected image, because the corrected
image is a new image name that later modules refer to. Placing them after leaves every
measurement on the raw image and produces no error at all.

The choice that actually matters is what the correction is computed over.

- **Each** computes a function per image. It removes within-image shading and it also
  removes any real, image-wide intensity difference — including the biological signal you
  are measuring, if a well is genuinely brighter.
- **All** computes one function across the whole set and applies it to every image. It
  preserves between-image differences, which is what you want when brightness is the
  readout, and it requires the set to be large and varied enough that the average is
  flat background rather than an average cell.

`ExampleIlluminationCorrection` in the CellProfiler examples ships both as
`..._Example1_EachMethod.cppipe` and `..._Example1_AllMethod.cppipe` over the same 72
images, which is the cheapest way to see the difference on real data:

```bash
docker run --rm -v "$PWD":/data -w /data cellprofiler/cellprofiler:4.2.8 \
  -c -r -p Example1_AllMethod.cppipe -i /data/images -o /data/out
```

Run the same measurement pipeline on corrected and uncorrected images and compare the
intensity distribution against field position before you accept either. A correction that
is doing nothing and a correction that has flattened your signal look identical in the
CSV.

**These pipelines produce no CSV at all.** `..._Example1_AllMethod.cppipe` ends in
`SaveImages`, not `ExportToSpreadsheet`: 72 images in, and the output directory holds one
`Illum.npy` and nothing else. Any wrapper that decides a run succeeded by waiting for
`Image.csv` will wait forever on a perfectly successful illumination job. Check the last
module before you decide what success looks like.

One benign message to expect on this pipeline and some others in that repository:

```
Error during notes decoding - 'utf-8' codec can't decode byte 0xe2 ...
Some characters may have been lost
```

That is CellProfiler failing to decode a mojibake em dash in a module's *notes* field. The
notes are human commentary; no setting is affected and the run completes normally. The file
itself is valid UTF-8, so `Path(...).read_text()` on it works.

## Joining the exported tables

`ExportToSpreadsheet` writes one file per object class — `Nuclei.csv`, `Cells.csv`,
`Cytoplasm.csv` — plus `Image.csv` and `Experiment.csv`. The per-object files carry
`ImageNumber` and `ObjectNumber` and **no metadata at all**. Everything that says which
well, which plate, which treatment lives only in `Image.csv`, keyed by `ImageNumber`.

So a per-object table is not analysable on its own, and the join is the step people skip:

```python
import pandas as pd

img = pd.read_csv("out/Image.csv")
nuc = pd.read_csv("out/Nuclei.csv")

meta = [c for c in img.columns if c.startswith("Metadata_")] + ["ImageNumber"]
tidy = nuc.merge(img[meta], on="ImageNumber", validate="many_to_one")
tidy.to_csv("nuclei_tidy.csv", index=False)
```

`validate="many_to_one"` is the guard. If `Image.csv` ever has two rows per `ImageNumber`
— which happens when outputs from two runs are written into one directory — the merge
silently duplicates every object row, and a doubled n is not visible in any summary
statistic. The validation turns that into an exception.

The object-to-object relationships are the other join. `RelateObjects` and
`IdentifySecondaryObjects` write a `Parent_<Object>` column, so `Cytoplasm.csv` carries
`Parent_Nuclei` and `Parent_Cells`:

```python
cells = pd.read_csv("out/Cells.csv")
per_cell = nuc.merge(cells, left_on=["ImageNumber", "ObjectNumber"],
                     right_on=["ImageNumber", "Parent_Nuclei"],
                     suffixes=("_nuc", "_cell"))
```

On ExampleHuman that join is one-to-one — 289 nuclei, 289 cells, 289 cytoplasms — because
secondary objects are grown outward from each primary. **`Parent_` is one-to-many in
general, and it is one-to-many in this very run.** `PH3.csv` holds 22 objects spread
across only 19 distinct `Parent_Nuclei`; three nuclei carry two PH3 objects each. So on
the same pair of tables:

```python
ph3 = pd.read_csv("out/PH3.csv")

inner = nuc.merge(ph3, left_on=["ImageNumber", "ObjectNumber"],
                  right_on=["ImageNumber", "Parent_Nuclei"], suffixes=("", "_ph3"))
left = nuc.merge(ph3, left_on=["ImageNumber", "ObjectNumber"],
                 right_on=["ImageNumber", "Parent_Nuclei"], how="left", suffixes=("", "_ph3"))
len(inner), len(left)        # (22, 292)
```

The left join returns **292** rows from a 289-row table. Three cells are counted twice and
nothing warns you. Decide before you write the merge whether the row you want is a cell or
a PH3 spot; if it is a cell, aggregate the children first (`ph3.groupby("Parent_Nuclei")
.size()`) and join the count, rather than joining the objects.

## Keep the pipeline in the project

The `.cppipe` is the provenance record. The CSVs are not reproducible without it, and the
parameters that produced them are not recoverable from them. Commit the pipeline beside
the results, and commit the LoadData CSV too — together they state exactly which files
were processed with which settings.

`ExportToDatabase` writes to MySQL or SQLite instead of CSVs, and is what CellProfiler
Analyst reads for interactive phenotype classification. It is the right destination for a
screen rather than a plate; for anything that fits in memory, the CSV route above and a
dataframe are less machinery for the same answer.

## Try it

**Data.** `ExampleHuman` from the CellProfiler examples repository: three channels of one
field of human cells — DNA, phospho-histone H3, and a cell-body stain — imaged by Jason
Moffat for the study at PMID 16564017. The **images are CC-0**; the repository holding
them and the pipeline is **BSD-3-Clause**. About 770 KB in total, no account, confirmed
reachable on 25 Aug 2026.

**Run.** Needs a container runtime and nothing else. On arm64, add `--platform
linux/amd64` to both `docker` lines.

```bash
mkdir -p cp-tryit/images cp-tryit/out && cd cp-tryit
base=https://raw.githubusercontent.com/CellProfiler/examples/master/ExampleHuman
curl -sL -o ExampleHuman.cppipe "$base/ExampleHuman.cppipe"
for d in 0 1 2; do
  curl -sL -o "images/AS_09125_050116030001_D03f00d$d.tif" \
    "$base/images/AS_09125_050116030001_D03f00d$d.tif"
done

docker pull cellprofiler/cellprofiler:4.2.8
docker run --rm -v "$PWD":/data -w /data cellprofiler/cellprofiler:4.2.8 \
  -c -r -p ExampleHuman.cppipe -i /data/images -o /data/out
```

Both blocks run from the `cp-tryit` directory the first one creates — the Python below
reads `out/Image.csv` relative to it. If you are driving these as separate processes rather
than one shell, set the working directory for the second one too.

```python
import csv
import statistics

image = list(csv.DictReader(open("out/Image.csv")))[0]
nuclei = list(csv.DictReader(open("out/Nuclei.csv")))
cells = list(csv.DictReader(open("out/Cells.csv")))
cyto = list(csv.DictReader(open("out/Cytoplasm.csv")))
ph3 = list(csv.DictReader(open("out/PH3.csv")))

counts = {k: v for k, v in image.items() if k.startswith("Count_")}
print("counts        ", counts)
print("rows          ", {"Nuclei": len(nuclei), "Cells": len(cells),
                         "Cytoplasm": len(cyto), "PH3": len(ph3)})
print("Nuclei columns", len(nuclei[0]))
print("mean area px  ", round(statistics.mean(float(r["AreaShape_Area"]) for r in nuclei), 1))
print("threshold     ", round(float(image["Threshold_FinalThreshold_Nuclei"]), 8))
print("source files  ", {k: v for k, v in image.items() if k.startswith("FileName_")})

# Counts in Image.csv must agree with the rows actually exported.
assert int(float(counts["Count_Nuclei"])) == len(nuclei)
assert int(float(counts["Count_PH3"])) == len(ph3)
# Secondary and tertiary objects are derived one-per-primary.
assert len(nuclei) == len(cells) == len(cyto)
# Every PH3 object points at a nucleus that exists.
parents = {int(r["ObjectNumber"]) for r in nuclei}
assert all(int(r["Parent_Nuclei"]) in parents for r in ph3)
# The correction factor is 1.0 in this pipeline, so the two thresholds coincide.
assert abs(float(image["Threshold_FinalThreshold_Nuclei"])
           - float(image["Threshold_OrigThreshold_Nuclei"])) < 1e-6
print("OK")
```

**Expect.**

Invariants — a failure means the skill is wrong:

- `Count_Nuclei` in `Image.csv` equals the number of rows in `Nuclei.csv`, and likewise
  for `Count_PH3` and `PH3.csv`. The image table and the object tables are two views of
  one run and cannot disagree.
- `Nuclei`, `Cells` and `Cytoplasm` have equal row counts, because `IdentifySecondaryObjects`
  grows one secondary from each primary and `IdentifyTertiaryObjects` subtracts one from
  the other.
- Every `Parent_Nuclei` in `PH3.csv` is an `ObjectNumber` present in `Nuclei.csv` —
  the parent link is what makes the per-object tables joinable at all.
- With `Threshold correction factor` at 1.0, `Threshold_FinalThreshold_Nuclei` equals
  `Threshold_OrigThreshold_Nuclei`. Set the factor to *k* and the ratio becomes exactly *k*.
- `Experiment.csv` is written before any image is processed, so its presence proves
  nothing about whether the run produced data.

Observed values, from a run on 25 Aug 2026 against the `4.2.8` image — these move if
CellProfiler changes a default or the example pipeline is updated:

- `Count_Nuclei` 289, `Count_Cells` 289, `Count_Cytoplasm` 289, `Count_PH3` 22.
- `Nuclei.csv` has 106 columns; mean nuclear area 127.9 px (the block prints the mean;
  the median over the same column is 115).
- `Threshold_FinalThreshold_Nuclei` 0.09860165.
- Wall-clock about 8 s for the fourteen-module pipeline, under emulation on arm64.
- `FileName_DNA` `...d0.tif`, `FileName_PH3` `...d1.tif`, `FileName_cellbody` `...d2.tif` —
  the channel-to-role mapping comes from `NamesAndTypes`, not from the file order. A
  fourth `FileName_OrigOverlay` appears alongside them because `SaveImages` records what
  it wrote; it is an output, not an input.
- 22 PH3 objects across 19 distinct parent nuclei, so `ph3.groupby("Parent_Nuclei").size()`
  has three entries equal to 2.

**Across other pipelines.** The module-listing and scoped-edit code above was re-run
against `ExampleIlluminationCorrection_Example1_AllMethod.cppipe` (9 modules, no object
detection, 72 real images) and against the `LoadData` conversion of `ExampleHuman`. The
header regex and the positional-settings warning hold on all three. Two things did not
survive the wider run and are now documented above rather than assumed: that a pipeline
ends in `ExportToSpreadsheet` — the illumination pipeline ran all 72 images and wrote a
single `Illum.npy`, no CSV — and that `Parent_` links are one-to-one, which the PH3 objects
in ExampleHuman disprove within the very run the `## Try it` block executes.
