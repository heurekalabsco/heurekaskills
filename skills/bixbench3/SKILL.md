---
name: bixbench3
description: Access BixBench3, a benchmark of 20 research-study-scale computational biology tasks in which an agent must rebuild a published paper's analysis from its raw data. Fetch the release index, per-task manifests carrying per-file provenance and checksums, and study data from open buckets that need no account. The task prompts themselves sit behind a free click-through.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, bioinformatics, agents, evaluation, public-data]
covers: [bixbench3, agent benchmark, agent evaluation, computational biology, bioinformatics, reproducibility, edison scientific, rna-seq, single-cell, atac-seq, chip-seq, methylation, imaging, fastq, differential expression, analysis pipeline, ground truth, deterministic grading, c. elegans, mouse, drosophila, glioblastoma, medulloblastoma, e. coli, zenodo, sra, geo, ena, google cloud storage, huggingface]
papers: [doi:10.48550/arXiv.2608.25286]
access: [open, registered]
datasets: [https://storage.googleapis.com/bixbench3-inputs/releases/v1.0.0/release-public.json, https://storage.googleapis.com/bixbench3-ground-truth/releases/v1.0.0/release.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: BixBench3 v1.0.0 release / harness repository at main, pushed 2026-08-22 / Python 3.12.8, standard library only
  executed: 8
  unverified: 3
  unverified_reason: >-
    The three harness blocks each need something the validating environment does not have —
    a Hugging Face account that has accepted the dataset's terms, a billed GCP project with
    n2-standard-32 quota, and licensed Cell Ranger tarballs from 10x Genomics. Re-run them
    from a workstation holding all three. Every block that reads the public release was
    executed, including the whole-set sweep over all twenty tasks.
---
# BixBench3

**Twenty computational biology papers, reduced to twenty tasks an agent has to actually do.**
Each one hands over the study's raw data — FASTQs, image stacks, sample sheets — plus the
research objective and a sketch of the method, and asks for a working analysis pipeline. What
comes back is graded on **138 structured artifacts**, tables checked against the ones the
published study reported.

The set is 1.4 TB of real study data drawn from Zenodo, SRA, GEO and ENA, with per-file
provenance and checksums. This skill gets you the index, the manifests, and the data.

## Not the same benchmark as BixBench

The names invite the mistake and the number reads like a version, so settle it first. These
are two different benchmarks with two different maintainers, and neither replaces the other:

| | BixBench | BixBench3 |
|---|---|---|
| published by | FutureHouse | Edison Scientific |
| shape | 205 short questions over 59 notebook-derived capsules | 20 end-to-end analyses over 138 graded artifacts |
| scale | ~5.9 GB of capsule zips | 1.4 TB of raw study data |
| grading | open-answer or multiple choice | deterministic checks on submitted tables, plus a process judge |
| licence | Apache-2.0 | CC BY-SA 4.0 |
| account | none | free Hugging Face click-through for the prompts |
| cost of one attempt | a download | hours on a cloud VM, and real money |

There is no public BixBench2. The `bixbench` skill covers the first one, and a score from one
says nothing about the other.

## What you need, and what you do not

Three tiers, and only the third is expensive. **Everything in this page above `Running the
harness` runs with no account, no key and no token** — the release indexes, every manifest, the
provenance records, the checksums and the raw data all sit in two world-readable Google Cloud
Storage buckets that answer anonymous HTTPS.

**The task prompts and output contracts are gated.** They live on Hugging Face under
`EdisonScientific/BixBench3`, which asks you to agree to share your contact information before
it will serve files. Approval is automatic — any Hugging Face account clears it — but until you
have clicked through, **every file request returns `401`, `README.md` included**, so even the
dataset card is unreadable through the API even though the dataset page renders it in a browser.
A CI job or an agent on a fresh machine therefore cannot read the prompts unattended. Export
`HF_TOKEN` after accepting.

**Running an agent against a task needs considerably more**, and it is disclosed in full before
the blocks that need it, under `Running the harness`.

## The release index

Two JSON files describe the whole benchmark — one for the inputs, one for the ground truth. They
are built together and carry matching totals, which makes them each other's check.

```python
import json, urllib.request

INPUTS  = "https://storage.googleapis.com/bixbench3-inputs"
GROUND  = "https://storage.googleapis.com/bixbench3-ground-truth"
VERSION = "v1.0.0"

def get_json(url):
    with urllib.request.urlopen(url, timeout=120) as fh:
        # A 200 is not proof you got JSON -- an interstitial or bot wall also
        # returns 200, with text/html. Check the type before parsing.
        assert fh.headers.get_content_type() == "application/json", fh.headers.get("content-type")
        return json.load(fh)

rel = get_json(f"{INPUTS}/releases/{VERSION}/release-public.json")
gt  = get_json(f"{GROUND}/releases/{VERSION}/release.json")
gt_by_id = {t["paper_id"]: t for t in gt["tasks"]}

# Each ground-truth task ships one grading specification alongside its artifacts,
# so artifacts = object_count - 1. Check that against the release's own total
# rather than trusting the arithmetic.
artifacts = {p: t["object_count"] - 1 for p, t in gt_by_id.items()}
assert sum(artifacts.values()) == gt["artifact_count"] == rel["artifact_count"]

print(f"{rel['benchmark_version']}  {rel['task_count']} tasks  "
      f"{rel['artifact_count']} graded artifacts  built {rel['created_at'][:10]}")
print(f"raw inputs {sum(t['total_size_bytes'] for t in rel['tasks']) / 1e12:.2f} TB   "
      f"ground truth {sum(t['total_size_bytes'] for t in gt['tasks']) / 1e6:.0f} MB\n")

print(f"{'#':>3}  {'paper id':32} {'files':>6} {'GB':>8} {'artifacts':>10}")
for t in sorted(rel["tasks"], key=lambda t: t["task_number"]):
    print(f"{t['task_number']:3}  {t['paper_id']:32} {t['object_count']:6} "
          f"{t['total_size_bytes'] / 1e9:8.1f} {artifacts[t['paper_id']]:10}")
```

Run 2026-08-27:

```
v1.0.0  20 tasks  138 graded artifacts  built 2026-08-21
raw inputs 1.40 TB   ground truth 209 MB

  #  paper id                          files       GB  artifacts
  1  10.1101_2025.06.17.659900_v1         32     16.3         12
  2  10.64898_2026.02.11.704850_v1       100     91.3         10
  3  10.1101_2025.08.16.670679_v1        632    109.2          4
  4  10.64898_2026.02.03.703548_v1       124     91.3          4
  5  10.1101_2025.07.20.665670_v1         48     14.6         10
  6  10.1101_2025.07.08.663208_v1         65    186.6          4
  7  10.1101_2025.07.28.666515_v1        459     70.9          4
  8  10.1038_s42003-022-03654-9_v1        25     51.8         12
  9  10_1186_s12915_024_01879_0_v1        32      7.9         14
 10  10.1038_s41467-023-44243-6_v1        25     45.3          4
 11  10.1016_j.crtox.2021.01.003_v1       90     15.8          5
 12  10.1101_2025.06.02.657493_v1         39     45.8          5
 13  10.64898_2026.03.10.709901_v1       119     76.0          4
 14  10.1101_2025.07.21.665972_v1        116     81.8          4
 15  10.64898_2026.01.09.698641_v1        37     52.2          7
 16  10.1101_2025.07.31.667834_v1         86     27.5          7
 17  10.1101_2025.07.18.664654_v1        186    258.7          4
 18  10.64898_2026.01.02.697332_v1        41     43.0          6
 19  10.64898_2026.01.31.702960_v1        45     63.0         14
 20  10.64898_2026.02.04.703711_v1      3019     48.7          4
```

Nothing here is uniform. A task is 25 files or 3,019 of them, 7.9 GB or 258.7 GB, and asks for
4 artifacts or 14. **Do not budget from an average** — the median task is 52 GB and the largest
is five times that, so a per-task disk that fits the median fails on a third of the set.

The two entries that matter operationally are `manifest_url`, which is where the file list
lives, and `manifest_sha256`, which the harness verifies before it will stage a task.

## Paper ids are escaped DOIs, and not by one rule

`paper_id` is the stable identifier everywhere — the runner accepts it in place of a task
number, and it names every directory in both buckets. It is a DOI with the slash replaced.
Except once.

```python
import json, urllib.request

REL = ("https://storage.googleapis.com/bixbench3-inputs"
       "/releases/v1.0.0/release-public.json")
with urllib.request.urlopen(REL, timeout=120) as fh:
    rel = json.load(fh)

# The DOI is escaped for use as a path segment, and NOT the same way every time.
# 19 ids replace only the "/". One replaces every separator, so the usual
# one-shot fix -- swap the first "_" for a "/" -- silently produces "10/1186".
EXCEPTIONS = {"10_1186_s12915_024_01879_0_v1": "10.1186/s12915-024-01879-0"}

def doi(paper_id):
    stem = paper_id.removesuffix("_v1")
    if paper_id in EXCEPTIONS:
        return EXCEPTIONS[paper_id]
    prefix, _, suffix = stem.partition("_")
    if not prefix.startswith("10.") or not suffix:
        raise ValueError(f"unrecognised paper id encoding: {paper_id!r}")
    return f"{prefix}/{suffix}"

naive = sum(1 for t in rel["tasks"]
            if t["paper_id"].removesuffix("_v1").partition("_")[0].startswith("10."))
print(f"paper ids following the common encoding: {naive}/{len(rel['tasks'])}"
      f"   off-pattern: {len(rel['tasks']) - naive}")

for n in (9, 11, 13):
    t = next(t for t in rel["tasks"] if t["task_number"] == n)
    print(f"  task {n:2}  {t['paper_id']:32} -> {doi(t['paper_id'])}")

dois = {doi(t["paper_id"]) for t in rel["tasks"]}
print(f"\n{len(dois)} distinct source papers")
prefixes = sorted({d.split('/')[0] for d in dois})
print("DOI prefixes:", ", ".join(prefixes))
```

Run 2026-08-27:

```
paper ids following the common encoding: 19/20   off-pattern: 1
  task  9  10_1186_s12915_024_01879_0_v1    -> 10.1186/s12915-024-01879-0
  task 11  10.1016_j.crtox.2021.01.003_v1   -> 10.1016/j.crtox.2021.01.003
  task 13  10.64898_2026.03.10.709901_v1    -> 10.64898/2026.03.10.709901

20 distinct source papers
DOI prefixes: 10.1016, 10.1038, 10.1101, 10.1186, 10.64898
```

The odd one out is task 9. Nineteen ids keep the DOI's dots and hyphens and swap only the
slash; that one has every separator flattened to an underscore, so string surgery yields
`10/1186_s12915_024_01879_0`, which resolves to nothing. Both spellings round-trip through the
buckets fine — the identifier is opaque as far as the benchmark is concerned. It is only when
you try to reach the paper that the encoding matters, and the failure is a dead link rather
than an error. Keep the exception table, or resolve through the harness's own map.

`10.64898` is bioRxiv's newer prefix, so seven of the twenty tasks are built on preprints from
2026. Nine more are 2025 preprints and four are journal articles. Sixteen of twenty are
preprints, most of them posted within a year of the release — the set skews recent, which is
the point of it.

## Inside a task

The manifest is the file list, and it carries a good deal more than filenames.

```python
import collections, hashlib, json, urllib.request

INPUTS  = "https://storage.googleapis.com/bixbench3-inputs"
VERSION = "v1.0.0"
PAPER   = "10.1101_2025.06.17.659900_v1"        # task 1, the smallest by file count

def get_bytes(url):
    with urllib.request.urlopen(url, timeout=180) as fh:
        return fh.read()

rel = json.loads(get_bytes(f"{INPUTS}/releases/{VERSION}/release-public.json"))
entry = next(t for t in rel["tasks"] if t["paper_id"] == PAPER)

raw = get_bytes(entry["manifest_url"])
# The release records a checksum over the manifest itself. The harness refuses to
# stage a task whose manifest does not match, so verify it before reading further.
digest = hashlib.sha256(raw).hexdigest()
assert digest == entry["manifest_sha256"], f"manifest drifted: {digest}"
manifest = json.loads(raw)

print(f"task {entry['task_number']}  {PAPER}")
print(f"  {manifest['object_count']} objects   "
      f"{manifest['total_size_bytes'] / 1e9:.1f} GB   manifest sha256 verified")

by_category = collections.Counter(o["category"] for o in manifest["objects"])
print("  categories:", dict(by_category))

sources = collections.Counter(o["upstream_repository"] for o in manifest["objects"])
print("  upstream:  ", dict(sources))

print("\n  five smallest objects")
for o in sorted(manifest["objects"], key=lambda o: o["size_bytes"])[:5]:
    name = o["object_path"].split(f"{PAPER}/", 1)[1]
    print(f"    {o['size_bytes']:>10,}  {o['category']:9}  {name}")

largest = max(manifest["objects"], key=lambda o: o["size_bytes"])
print(f"\n  largest    {largest['size_bytes'] / 1e9:.1f} GB  "
      f"{largest['object_path'].rsplit('/', 1)[1]}")
print(f"  accession  {largest['source_accession_or_url']}")
```

Run 2026-08-27:

```
task 1  10.1101_2025.06.17.659900_v1
  32 objects   16.3 GB   manifest sha256 verified
  categories: {'metadata': 14, 'raw_data': 18}
  upstream:   {'rna_seq_samplesheet': 9, 'damid_average_tracks_method_tool': 1, 'reddy_2019_ipr_support_list': 1, 'arrayexpress_sdrf_rna_seq': 1, 'arrayexpress_sdrf_damid': 1, 'damid_samplesheet': 1, 'ena_study': 18}

  five smallest objects
            84  metadata   data/metadata/method_tools/damid/average_tracks.pl.sha256
            91  metadata   data/metadata/reference/ipr/reddy_2019_ipr_genes.tsv.sha256
           868  metadata   data/metadata/sample_info/damid_samplesheet.tsv
         1,213  metadata   data/metadata/sample_info/rna_seq_samplesheet.tsv
         1,926  metadata   data/metadata/README.md

  largest    1.6 GB  ERR13767139_2.fastq.gz
  accession  ERP164967
```

Every object carries nine fields. `object_path` and `public_url` locate it, `size_bytes`,
`sha256` and `crc32c` verify it, `media_type` types it, and three describe where it came from:

| field | |
|---|---|
| `category` | `raw_data` (agent-visible study data) or `metadata` (sample sheets, references, tool notes) |
| `upstream_repository` | which archive it was mirrored from, or a free-text label — see below |
| `source_accession_or_url` | the accession or link that identifies it upstream |

**`public_url` is a plain anonymous URL and it works** — no signing, no requester-pays, no
token. Which is convenient, and, for the ground-truth bucket, a hazard worth understanding.

## Across all twenty

One task is not the method. The sweep below reads every manifest in the release, verifies
every checksum, and tallies what is actually in there.

```python
import collections, hashlib, json, urllib.request

INPUTS  = "https://storage.googleapis.com/bixbench3-inputs"
VERSION = "v1.0.0"

def get_bytes(url):
    with urllib.request.urlopen(url, timeout=300) as fh:
        return fh.read()

rel = json.loads(get_bytes(f"{INPUTS}/releases/{VERSION}/release-public.json"))

# Four archives plus a per-file Zenodo label account for every raw_data object;
# metadata objects carry free text instead. Asserted below.
ARCHIVES   = {"zenodo_file", "zenodo_repository", "sra_bioproject", "geo_series", "ena_study"}
categories = collections.Counter()
pairs      = collections.Counter()
upstream   = collections.Counter()
media      = collections.Counter()
verified   = 0

for entry in sorted(rel["tasks"], key=lambda t: t["task_number"]):
    raw = get_bytes(entry["manifest_url"])
    verified += hashlib.sha256(raw).hexdigest() == entry["manifest_sha256"]
    manifest = json.loads(raw)
    assert manifest["object_count"] == entry["object_count"] == len(manifest["objects"])
    assert manifest["total_size_bytes"] == entry["total_size_bytes"]
    for o in manifest["objects"]:
        categories[o["category"]] += 1
        pairs[(o["category"], o["upstream_repository"] in ARCHIVES)] += 1
        upstream[o["upstream_repository"]] += 1
        media[o["media_type"]] += 1

print(f"manifests checksum-verified : {verified}/{len(rel['tasks'])}")
print(f"objects described           : {sum(categories.values()):,}")
print(f"categories                  : {dict(categories)}")
print(f"\nmedia types (top 5)")
for name, n in media.most_common(5):
    print(f"  {n:5,}  {name}")

# `upstream_repository` is NOT a controlled vocabulary. Five values name an actual
# archive and cover every raw_data object; the rest are free-text labels on metadata,
# so grouping by this field and calling the result "sources" overstates archives ~12-fold.
assert set(pairs) == {("raw_data", True), ("metadata", False)}, dict(pairs)
archived = sum(n for k, n in upstream.items() if k in ARCHIVES)
print(f"\nupstream_repository values  : {len(upstream)} distinct, "
      f"{sum(1 for n in upstream.values() if n == 1)} used once")
print(f"  archive-shaped values     : {archived:,} objects "
      f"({archived / sum(upstream.values()):.0%})")
for name, n in upstream.most_common(6):
    print(f"  {n:5,}  {name}")
```

Run 2026-08-27, about twelve seconds and four megabytes:

```
manifests checksum-verified : 20/20
objects described           : 5,320
categories                  : {'metadata': 267, 'raw_data': 5053}

media types (top 5)
  3,686  application/octet-stream
  1,353  image/tiff
     80  text/csv
     51  application/pdf
     42  text/tab-separated-values

upstream_repository values  : 59 distinct, 40 used once
  archive-shaped values     : 5,053 objects (95%)
  3,013  zenodo_file
  1,452  sra_bioproject
    440  geo_series
    114  ena_study
     93  sample_sheet
     34  zenodo_repository
```

Two things the sweep settles.

**All twenty manifests verify**, and every one agrees with the release on object count and total
size. That is the harness's own gate, reproducible without credentials, and it is the cheapest
check that the release you are reading is the release the runner will stage.

**`upstream_repository` is not a controlled vocabulary**, and it fails in the direction that
looks like a finding. Fifty-nine distinct values, forty of them used exactly once. Group by it
and you will report "59 upstream sources" — but the assertion in the block holds exactly: the
five archive names cover **all 5,053 `raw_data` objects and nothing else**, while all 267
`metadata` objects carry a free-text label naming the kind of file rather than a repository.
So the real answer is four archives (Zenodo, SRA, GEO, ENA), and the split between the two
readings is `category`, not the field itself.

The media types are worth a glance too. Over two thirds is `application/octet-stream`, which is
what compressed sequencing reads look like to a content sniffer, and 1,353 TIFFs mean at least
one task is imaging rather than sequencing. **Type by extension and manifest, not by
`media_type`.**

## The manifest is the contract, not the bucket

Both buckets support anonymous listing, which makes it tempting to enumerate a prefix and work
from what comes back. That disagrees with the release in both directions.

```python
import json, urllib.parse, urllib.request

BUCKET  = "bixbench3-inputs"
API     = f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o"
VERSION = "v1.0.0"
PAPER   = "10.64898_2026.02.04.703711_v1"        # task 20, the file-heaviest task

def list_prefix(prefix):
    names, token = set(), None
    while True:
        query = {"prefix": prefix, "maxResults": "1000", "fields":
                 "items(name),nextPageToken"}
        if token:
            query["pageToken"] = token
        with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(query)}",
                                    timeout=180) as fh:
            page = json.load(fh)
        names.update(i["name"] for i in page.get("items", []))
        token = page.get("nextPageToken")
        if not token:
            return names

with urllib.request.urlopen(
        f"https://storage.googleapis.com/{BUCKET}/releases/{VERSION}"
        f"/manifests/{PAPER}.json", timeout=180) as fh:
    manifest = json.load(fh)

listed  = {o["object_path"] for o in manifest["objects"]}
present = list_prefix(f"releases/{VERSION}/tasks/{PAPER}/")

print(f"task 20  {PAPER}")
print(f"  manifest lists : {len(listed)}")
print(f"  bucket holds   : {len(present)}")
print(f"  in bucket only : {len(present - listed)}")
print(f"  manifest only  : {len(listed - present)}")
for name in sorted(present - listed):
    print(f"    {name.split(PAPER + '/')[1]}")

# A manifest directory listing is not a task list either. One extra manifest sits
# under a differently-named prefix and describes a paper that shipped no data.
release_ids = {t["paper_id"] for t in json.load(urllib.request.urlopen(
    f"https://storage.googleapis.com/{BUCKET}/releases/{VERSION}"
    f"/release-public.json", timeout=120))["tasks"]}
# Note the missing trailing slash: this catches manifests/ AND manifests-public/.
manifest_paths = {n.rsplit("/", 1)[1].removesuffix(".json"): n
                  for n in list_prefix(f"releases/{VERSION}/manifests")}
print(f"\nrelease task ids        : {len(release_ids)}")
print(f"manifest files on disk  : {len(manifest_paths)}")
for extra in sorted(set(manifest_paths) - release_ids):
    staged = list_prefix(f"releases/{VERSION}/tasks/{extra}/")
    print(f"  not in the release    : {manifest_paths[extra]}")
    print(f"                          {extra} -> {len(staged)} objects staged")
```

Run 2026-08-27:

```
task 20  10.64898_2026.02.04.703711_v1
  manifest lists : 3019
  bucket holds   : 3023
  in bucket only : 4
  manifest only  : 0
    data/raw/zenodo_18468666/Zenodo_folder/FigS7/results/soilextract_log_linear_slope_mu_max.csv
    data/raw/zenodo_18468666/Zenodo_folder/FigS7/results/soilextract_log_linear_slope_mu_max_extra_rep.csv
    data/raw/zenodo_18468666/Zenodo_folder/FigS7/results/succinate_log_linear_slope_mu_max.csv
    data/raw/zenodo_18468666/Zenodo_folder/FigS7/results/succinate_log_linear_slope_mu_max_extra_rep.csv

release task ids        : 20
manifest files on disk  : 21
  not in the release    : releases/v1.0.0/manifests-public/10.64898_2026.02.03.703544_v1.json
                          10.64898_2026.02.03.703544_v1 -> 0 objects staged
```

**Four files in the bucket are absent from task 20's manifest**, all under one `FigS7/results/`
directory mirrored from a Zenodo deposit. The manifest is what the checksum covers and what the
runner stages, so those four are simply not part of the task — but a reader who lists the prefix
gets them, and a reader who sums the listing gets a different total from the one the release
records. The other nineteen tasks match exactly.

**There is a twenty-first manifest and it has no data.** It sits under `manifests-public/`
rather than `manifests/`, describes 74 objects and 38.9 GB for a paper that appears in neither
release, in neither bucket's `tasks/` tree, and in no case directory. It is not a mis-spelling
of task 4 despite the near-identical id — the two resolve to different bioRxiv preprints posted
the same day. Read it as a task prepared and then held back from v1.0.0.

The rule both cases point at: **`release-public.json` is the task list.** Listing `manifests/`
happens to give the right twenty; listing `manifests` without the slash gives twenty-one; and
listing a task's own prefix can give more objects than the task contains.

## The answers are public. That is your problem to manage.

The ground-truth bucket is world-readable on the same anonymous HTTPS as the inputs. It holds
the published tables every submission is scored against.

This block reads the **index only** — counts, formats and sizes. It deliberately does not fetch
an artifact, and it deliberately does not print artifact filenames, because those are
descriptive rather than opaque and naming them tells you what each task is being asked for.

```python
import collections, json, urllib.request

GROUND  = "https://storage.googleapis.com/bixbench3-ground-truth"
VERSION = "v1.0.0"

def get_json(url):
    with urllib.request.urlopen(url, timeout=180) as fh:
        return json.load(fh)

release = get_json(f"{GROUND}/releases/{VERSION}/release.json")

shapes, sizes, specs, artifacts = collections.Counter(), [], 0, 0
for entry in release["tasks"]:
    manifest = get_json(entry["manifest_url"])
    for o in manifest["objects"]:
        if o["category"] == "grading_specification":
            specs += 1
        else:
            artifacts += 1
            shapes[o["object_path"].rsplit(".", 1)[1]] += 1
            sizes.append(o["size_bytes"])

sizes.sort()
print(f"tasks {release['task_count']}   graded artifacts {artifacts}   "
      f"grading specifications {specs}")
print(f"artifact formats {dict(shapes)}")
print(f"artifact size  min {min(sizes)} B   "
      f"median {sizes[len(sizes) // 2] / 1e3:.1f} KB   max {max(sizes) / 1e6:.1f} MB")
print(f"per task       min {min(t['object_count'] - 1 for t in release['tasks'])}   "
      f"max {max(t['object_count'] - 1 for t in release['tasks'])}")
print(f"whole set      {sum(t['total_size_bytes'] for t in release['tasks']) / 1e6:.0f} MB")
```

Run 2026-08-27:

```
tasks 20   graded artifacts 138   grading specifications 20
artifact formats {'tsv': 18, 'csv': 118, 'bed': 2}
artifact size  min 42 B   median 115.8 KB   max 48.0 MB
per task       min 4   max 14
whole set      209 MB
```

One grading specification per task, four to fourteen artifacts each, and the whole answer key is
209 MB of CSV that anyone can download without logging in.

**Nothing about the transport protects it, so the run has to.** The harness puts every request
an agent makes through a network gateway that refuses this bucket by name — its default
protected-source list contains exactly `bixbench3-ground-truth`, and a request that names it is
rejected rather than fetched. That mechanism, not the bucket's permissions, is what makes a
scored run mean anything.

Three consequences if you are doing anything other than running the harness unmodified:

- **Never stage ground truth where the agent can reach it.** Not on the analysis disk, not in
  the working directory, not behind a proxy that will resolve `storage.googleapis.com`
  unconditionally. A run whose agent could read the bucket produced a number about network
  policy, not about analysis.
- **A score computed outside the harness needs its own gate**, and you have to say so when you
  report it. "Graded with the deterministic grader" and "graded under the harness's network
  policy" are different claims.
- **Do not republish artifacts, or paraphrase what they contain.** They are one download away
  for anyone who needs them legitimately, so copying them adds nothing — while putting them into
  a page, an issue, a repo or a model's training corpus makes every future score on this
  benchmark less informative, permanently and for everybody.

## Get the files

The index, one task's manifests, and its small metadata files, checksum-verified as they land.
Raw data stays where it is — task 1 alone is 16 GB, and the set is 1.4 TB.

```python
import hashlib, json, os, urllib.request

INPUTS  = "https://storage.googleapis.com/bixbench3-inputs"
GROUND  = "https://storage.googleapis.com/bixbench3-ground-truth"
VERSION = "v1.0.0"
PAPER   = "10.1101_2025.06.17.659900_v1"     # task 1
OUT     = "Data/bixbench3"
MAX     = 64_000        # skip the reference genome and annotation; see the note below

def get_bytes(url):
    with urllib.request.urlopen(url, timeout=300) as fh:
        return fh.read()

os.makedirs(f"{OUT}/{PAPER}", exist_ok=True)

index = json.loads(get_bytes(f"{INPUTS}/releases/{VERSION}/release-public.json"))
truth = json.loads(get_bytes(f"{GROUND}/releases/{VERSION}/release.json"))
with open(f"{OUT}/release-public.json", "w") as fh:
    json.dump(index, fh, indent=2)
with open(f"{OUT}/ground-truth-index.json", "w") as fh:
    json.dump(truth, fh, indent=2)

entry = next(t for t in index["tasks"] if t["paper_id"] == PAPER)
raw = get_bytes(entry["manifest_url"])
assert hashlib.sha256(raw).hexdigest() == entry["manifest_sha256"], "manifest drifted"
with open(f"{OUT}/{PAPER}/inputs-manifest.json", "wb") as fh:
    fh.write(raw)
manifest = json.loads(raw)

wanted = [o for o in manifest["objects"]
          if o["category"] == "metadata" and o["size_bytes"] <= MAX]
skipped = sum(1 for o in manifest["objects"] if o["category"] == "metadata") - len(wanted)
kept = 0
for o in wanted:
    body = get_bytes(o["public_url"])
    # Every object carries a sha256. Check it -- a truncated transfer of a 30 GB
    # FASTQ fails silently otherwise, and the run is graded on what you analysed.
    assert hashlib.sha256(body).hexdigest() == o["sha256"], o["object_path"]
    dest = os.path.join(f"{OUT}/{PAPER}", o["object_path"].split(f"{PAPER}/", 1)[1])
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as fh:
        fh.write(body)
    kept += 1

raw_bytes = sum(o["size_bytes"] for o in manifest["objects"] if o["category"] == "raw_data")
print(f"index          {len(index['tasks'])} tasks -> {OUT}/release-public.json")
print(f"task {entry['task_number']} manifest {manifest['object_count']} objects, checksum verified")
print(f"metadata       {kept} files written, {skipped} skipped over {MAX // 1000} KB")
print(f"still on GCS   {raw_bytes / 1e9:.1f} GB of raw_data for this task alone")
for root, _, names in sorted(os.walk(f"{OUT}/{PAPER}")):
    for n in sorted(names):
        p = os.path.join(root, n)
        print(f"  {os.path.getsize(p):>8,}  {os.path.relpath(p, OUT)}")
```

Run 2026-08-27:

```
index          20 tasks -> Data/bixbench3/release-public.json
task 1 manifest 32 objects, checksum verified
metadata       12 files written, 2 skipped over 64 KB
still on GCS   16.0 GB of raw_data for this task alone
    20,804  10.1101_2025.06.17.659900_v1/inputs-manifest.json
     1,926  10.1101_2025.06.17.659900_v1/data/metadata/README.md
     5,410  10.1101_2025.06.17.659900_v1/data/metadata/method_tools/damid/average_tracks.pl
        84  10.1101_2025.06.17.659900_v1/data/metadata/method_tools/damid/average_tracks.pl.sha256
     7,107  10.1101_2025.06.17.659900_v1/data/metadata/reference/ipr/reddy_2019_ipr_genes.tsv
        91  10.1101_2025.06.17.659900_v1/data/metadata/reference/ipr/reddy_2019_ipr_genes.tsv.sha256
     4,895  10.1101_2025.06.17.659900_v1/data/metadata/sample_info/E-MTAB-14522.idf.txt
     9,642  10.1101_2025.06.17.659900_v1/data/metadata/sample_info/E-MTAB-14522.sdrf.txt
     5,858  10.1101_2025.06.17.659900_v1/data/metadata/sample_info/E-MTAB-14522.tsv
     4,854  10.1101_2025.06.17.659900_v1/data/metadata/sample_info/E-MTAB-14824.idf.txt
     5,258  10.1101_2025.06.17.659900_v1/data/metadata/sample_info/E-MTAB-14824.sdrf.txt
       868  10.1101_2025.06.17.659900_v1/data/metadata/sample_info/damid_samplesheet.tsv
     1,213  10.1101_2025.06.17.659900_v1/data/metadata/sample_info/rna_seq_samplesheet.tsv
```

ArrayExpress IDF and SDRF sample descriptions, two sample sheets, a Perl script the original
authors used to average DamID tracks with its checksum beside it, and a gene support list. This
is the shape of a task's `metadata/` — everything except the reads.

**The size cap is doing real work.** Two of task 1's fourteen metadata objects are a *C.
elegans* reference genome and a 313 MB annotation, which is 342 MB of the 342.3 MB total. Raise
`MAX` when you actually want them, and stream to disk rather than into memory when you do —
single objects in this release reach 30 GB.

**Change one line and this fetches raw data instead.** Dropping the `category` filter on task 1
downloads 16 GB of FASTQ. That is a legitimate thing to want, and it is also how an unattended
agent fills a disk. Filter first, sum `size_bytes`, then fetch.

## Running the harness

Everything above reads the release. This runs an agent against it, and the requirements are
substantial. **Read all of them before starting** — the last one is not something you can obtain
in the middle of a session.

- **Python 3.12 or newer, `uv`, and the Google Cloud CLI.** The harness is not on PyPI; you
  clone it and install the locked environment.
- **A Hugging Face account that has accepted the dataset's terms**, and `HF_TOKEN` exported.
  The task prompts, output contracts and task-number map all come from the gated repository, so
  even local grading needs this.
- **A billed GCP project** with the Compute Engine API enabled and quota for an `n2-standard-32`
  in `us-central1-a`. The agent runs on a VM there; nothing runs on your workstation.
- **`OPENAI_API_KEY`, always** — the network adjudicator and the process judge call GPT-5.5
  regardless of which model you are evaluating — plus a provider key for the model under test.
- **Cell Ranger 6.0.2 and Cell Ranger ARC 2.0.2 tarballs from 10x Genomics**, accepted under
  their End User Software License Agreement. Both are required arguments to the runtime build;
  there is no path that skips them. The project states the position plainly, and it is theirs to
  state rather than ours to summarise:

  > This repository does not host or redistribute the tarballs, and BixBench3 does not verify
  > that you accepted the license.

- **Budget.** The project reports an average attempt at 6.8 hours, 102 million tokens and $43,
  with the largest at 24 hours, 1.07 billion tokens and $525 — before the VM, which is billable
  from `run` until you `complete` or `cancel` it.

Install and authenticate:

```bash
git clone https://github.com/EdisonScientific/BixBench3.git
cd BixBench3
uv sync --locked

gcloud auth login
gcloud config set project YOUR_PROJECT

export HF_TOKEN=...          # after accepting the dataset terms on Hugging Face
export OPENAI_API_KEY=...    # required for every run, whatever model you evaluate
export ANTHROPIC_API_KEY=... # or GOOGLE_API_KEY / OPENROUTER_API_KEY
```

Build the runtime image once. This is the step that needs the 10x tarballs; it stands up a VM,
builds and tests the image, stores it privately in your project and deletes the VM, and takes
30–60 minutes. `--dry-run` validates the archives and prints the planned operations without
creating anything, which is the right first invocation.

```bash
uv run bixbench3 setup-runtime \
  --project YOUR_PROJECT \
  --cellranger-tarball /path/to/cellranger-6.0.2.tar.gz \
  --cellranger-arc-tarball /path/to/cellranger-arc-2.0.2.tar.gz \
  --dry-run
```

Then run, watch and collect. `run` accepts a task number or a `paper_id`, requires an explicit
effort with no default, and returns as soon as the detached service starts — your workstation
does not stay connected. **The VM keeps billing until `complete` or `cancel`**, and `complete`
is also what downloads the grades.

```bash
uv run bixbench3 run --task 1 --model openai/gpt-5.5 --effort max \
  --project YOUR_PROJECT --results-bucket gs://YOUR_BUCKET/bixbench3

uv run bixbench3 status   --run RUN_ID --project YOUR_PROJECT
uv run bixbench3 complete --run RUN_ID --project YOUR_PROJECT

# grade artifacts you already have, with no VM involved
uv run bixbench3 grade --task 1 --artifacts-dir ./outputs
```

Two things about what comes back. `grade.json` is deterministic — artifacts are compared with
F1 over label sets, Spearman correlation, and concordance correlation over aligned numeric
frames, all reproducible. `judge.json` is not: it is a language model scoring the run's process
against rubrics, and it is recorded alongside the deterministic grade rather than folded into
it. Report them separately. And **without `--results-bucket`, the agent's own outputs, the
copied artifacts and the network gateway logs are deleted with the VM** — you keep the grades
and lose the evidence behind them.

## What this skill will not do

It stops at the release. It does not write an analysis pipeline for a task, does not submit
artifacts, and does not evaluate a model on your behalf.

Reading a task's prompt is fine and is what the prompts are for. Reading its ground-truth
artifacts before an attempt is not, and no amount of care afterwards undoes it — that run is
no longer a measurement of anything, and if the contents travel, neither is anybody else's.

## Try it

**Data.** The BixBench3 v1.0.0 public release — `release-public.json` in the
`bixbench3-inputs` bucket and `release.json` in `bixbench3-ground-truth`, both anonymous HTTPS,
no account. The benchmark's own materials are CC BY-SA 4.0; the mirrored study data keeps the
terms its depositors set. Last confirmed reachable 2026-08-27.

**Run.** Standard library only, about three seconds, nothing written to disk.

```python
import hashlib, json, urllib.parse, urllib.request

INPUTS  = "https://storage.googleapis.com/bixbench3-inputs"
GROUND  = "https://storage.googleapis.com/bixbench3-ground-truth"
API     = "https://storage.googleapis.com/storage/v1/b/bixbench3-inputs/o"
VERSION = "v1.0.0"

def fetch(url):
    with urllib.request.urlopen(url, timeout=300) as fh:
        return fh.read(), fh.headers.get_content_type()

def fetch_json(url):
    body, ctype = fetch(url)
    assert ctype == "application/json", f"{url} returned {ctype}, not JSON"
    return json.loads(body)

index = fetch_json(f"{INPUTS}/releases/{VERSION}/release-public.json")
truth = fetch_json(f"{GROUND}/releases/{VERSION}/release.json")

assert index["kind"] == "inputs" and truth["kind"] == "ground_truth"
assert index["benchmark_version"] == truth["benchmark_version"] == VERSION
assert index["task_count"] == truth["task_count"] == len(index["tasks"])
assert index["artifact_count"] == truth["artifact_count"]
by_id = {t["paper_id"]: t for t in truth["tasks"]}
assert set(by_id) == {t["paper_id"] for t in index["tasks"]}, "the two sides name different tasks"
assert sum(t["object_count"] - 1 for t in truth["tasks"]) == truth["artifact_count"], \
    "a ground-truth task no longer ships exactly one grading specification"

print(f"release          {index['benchmark_version']}  {index['task_count']} tasks  "
      f"{index['artifact_count']} artifacts")
print(f"raw inputs       {sum(t['total_size_bytes'] for t in index['tasks']) / 1e12:.2f} TB")

# The release records a sha256 over each manifest and the harness refuses to stage a
# task that fails it. Check the file-heaviest, the smallest, and the odd-encoded one.
CHECK = ["10.64898_2026.02.04.703711_v1", "10.1038_s41467-023-44243-6_v1",
         "10_1186_s12915_024_01879_0_v1"]
for paper_id in CHECK:
    entry = next(t for t in index["tasks"] if t["paper_id"] == paper_id)
    raw, _ = fetch(entry["manifest_url"])
    assert hashlib.sha256(raw).hexdigest() == entry["manifest_sha256"], f"{paper_id} drifted"
    manifest = json.loads(raw)
    assert manifest["object_count"] == entry["object_count"] == len(manifest["objects"])
    assert manifest["total_size_bytes"] == entry["total_size_bytes"]
    assert {o["category"] for o in manifest["objects"]} <= {"raw_data", "metadata"}
print(f"manifests        {len(CHECK)}/{len(CHECK)} checksum-verified against the release")

# Object-level integrity, on the smallest file in the set, fetched anonymously.
entry = next(t for t in index["tasks"] if t["paper_id"] == CHECK[1])
manifest = fetch_json(entry["manifest_url"])
smallest = min(manifest["objects"], key=lambda o: o["size_bytes"])
body, _ = fetch(smallest["public_url"])
assert len(body) == smallest["size_bytes"]
assert hashlib.sha256(body).hexdigest() == smallest["sha256"]
print(f"object           {smallest['size_bytes']} B fetched with no credentials, sha256 matches")

# Paper ids are escaped DOIs, and not by one rule. Nineteen keep the dots.
odd = [t["paper_id"] for t in index["tasks"]
       if not t["paper_id"].removesuffix("_v1").partition("_")[0].startswith("10.")]
assert odd == ["10_1186_s12915_024_01879_0_v1"], odd
print(f"paper ids        {len(index['tasks']) - len(odd)} keep the DOI dots, {len(odd)} does not")

# A manifest directory listing is not the task list.
query = urllib.parse.urlencode({"prefix": f"releases/{VERSION}/manifests",
                                "maxResults": "1000", "fields": "items(name)"})
listed = {n["name"].rsplit("/", 1)[1].removesuffix(".json")
          for n in fetch_json(f"{API}?{query}")["items"]}
extra = sorted(listed - set(by_id))
assert not (set(by_id) - listed), "a released task has no manifest file"
print(f"manifest files   {len(listed)} on disk for {len(by_id)} released tasks; "
      f"unreleased: {len(extra)}")
print("all assertions passed")
```

**Expect.**

Invariants — these hold whatever Edison Scientific republishes, and a failure means this page is
wrong rather than stale:

- **The two release indexes describe the same benchmark.** Same version, same task count, same
  artifact total, same set of `paper_id`s. They are generated together; if they disagree, one of
  them is not the release.
- **Every manifest matches the sha256 the release records for it**, and its own
  `object_count` and `total_size_bytes` match the release entry. This is the harness's own
  staging gate, run here without credentials.
- **Every object's bytes match its declared `size_bytes` and `sha256`.**
- **Every released task has a manifest file.** The reverse is not an invariant — an unreleased
  manifest exists by design, which is why the assertion runs one way only.
- **Every object is `raw_data` or `metadata`.** A third category would mean the input tree
  gained something this page does not describe.
- **No credential is used anywhere in the block.** If any request starts returning `401`, the
  buckets have changed policy and this skill's premise has moved.

Observed 2026-08-27 against **v1.0.0** — these move when the release is rebuilt, so treat a
mismatch as drift to investigate:

```
release          v1.0.0  20 tasks  138 artifacts
raw inputs       1.40 TB
manifests        3/3 checksum-verified against the release
object           1491 B fetched with no credentials, sha256 matches
paper ids        19 keep the DOI dots, 1 does not
manifest files   21 on disk for 20 released tasks; unreleased: 1
all assertions passed
```

## Sources

- BixBench3 — Koch, Wassie, Valdes-Aleman, Lee, Hinks, Rodriques, White and Laurent,
  *BixBench3 — Benchmarking AI agents on research-study-scale computational biology tasks*,
  arXiv [2608.25286](https://arxiv.org/abs/2608.25286) (2026), CC BY-SA 4.0.
- Dataset — [`EdisonScientific/BixBench3`](https://huggingface.co/datasets/EdisonScientific/BixBench3),
  CC BY-SA 4.0, gated behind a contact-information click-through.
- Harness and grader —
  [`EdisonScientific/BixBench3`](https://github.com/EdisonScientific/BixBench3), CC BY-SA 4.0.
- Data — `gs://bixbench3-inputs` and `gs://bixbench3-ground-truth`, both readable over
  anonymous HTTPS at `https://storage.googleapis.com/<bucket>/…`.

The CC BY-SA 4.0 licence covers the benchmark's own contribution — the prompts, schemas, code
and grading specifications. It does not relicense what the buckets mirror: the raw reads,
reference data and published tables keep the terms their depositors, publishers and repositories
set, and the project's `NOTICE` says so and points at per-file provenance. Every object's
`source_accession_or_url` names where it came from, so check the source before redistributing
anything you pull out of a task. Cell Ranger and Cell Ranger ARC are proprietary 10x Genomics
software, distributed by neither the repository nor the buckets.
