---
name: 4dn
description: Search and download 4D Nucleome chromatin architecture data — in situ Hi-C, Micro-C, HiChIP, ChIA-PET, SPRITE, DamID, Repli-seq, ATAC-seq and imaging (DNA FISH, single particle tracking) across human and mouse cell lines and tissue. Walks ExperimentSet to Experiment to File, checks each file's access tier before transferring, and pulls open files from the AWS Open Data bucket with no account.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [4dn, hi-c, chromatin, public-data, controlled-access]
covers: [4d nucleome, in situ hi-c, micro-c, capture hi-c, hichip, chia-pet, sprite, damid, tsa-seq, repli-seq, atac-seq, chip-seq, rna-seq, dna fish, multiplexed fish, single particle tracking, chromatin architecture, chromosome conformation, topologically associating domain, chromatin loops, a/b compartments, insulation score, contact matrix, mcool, cooler, h1-hesc, gm12878, hffc6, human, mouse]
papers: [PMID:28905911, PMID:35501320, PMID:32213324, PMID:34480151, PMID:37845234]
access: [open, registered, controlled]
platform: snovault
datasets: [https://data.4dnucleome.org/search/?type=ExperimentSetReplicate&limit=1&format=json, https://data.4dnucleome.org/experiment-set-replicates/4DNES2M5JIGV/?format=json, https://data.4dnucleome.org/ga4gh/drs/v1/objects/4DNFI5INXRCH, https://4dn-open-data-public.s3.amazonaws.com/fourfront-webprod/wfoutput/e6e5aea1-1df7-4422-a5a8-10b10e5cd9e0/4DNFI5INXRCH.bed.gz, https://4dn-open-data-public.s3.amazonaws.com/fourfront-webprod/wfoutput/366724cc-de20-4c88-b9a6-c88992a88a9f/4DNFI23M4PPX.mcool, https://data.4dnucleome.org/profiles/?format=json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: 4DN Data Portal at data.4dnucleome.org (fourfront/snovault), live 2026-08-27 — 3,392 ExperimentSetReplicate, 69,831 File, 54 ExperimentType / Python 3.12.8 stdlib / cooler 0.10.4 with numpy 2.5.2, pandas 3.0.5, h5py 3.16.0 / curl 8.7.1 / aws-cli 2.8.11
  executed: 21
  unverified: 1
  unverified_reason: >-
    One block shows the authenticated portal download route (curl --user with a 4DN access
    key pair). The validating environment has no 4DN account, so the block ran and its
    documented 401 was observed, but the credentialed 200 path was not exercised. Re-run it
    from a host holding a portal access key. The open download route beside it, which is
    what the skill actually recommends, was executed in full.
---
# 4D Nucleome — data.4dnucleome.org

4DN is the NIH Common Fund programme for how the genome is folded, and its portal is the
place to go when the question is *has anyone measured chromatin contacts in this cell type*.
On 2026-08-27 it held **3,392 experiment sets** over **7,473 experiments** and **69,831
files** — 2,567 sequencing sets and 825 microscopy sets, across 11 organisms, with 680 Hi-C
family sets and 565 FISH sets.

Three things go wrong for newcomers, and none of them looks like what it is:

1. **The portal's own download button needs a login, even for fully public files.** An
   anonymous `@@download` returns **403 with an HTML page**, which `curl -O` will happily
   write to disk under a `.bam` name. The no-account route is a different URL, on the file
   record, and it works fine.
2. **Files are attached at two different levels of the hierarchy**, and the obvious
   single query returns one level and silently omits the other.
3. **A filter that matches nothing comes back as HTTP 404** — with a complete, valid JSON
   body reporting `total: 0`. Every HTTP client in wide use either raises on that or throws
   the body away, so the query that matched nothing is indistinguishable from a broken
   endpoint until you look.

Everything below is organised around those three.

## Which tier your question is in

| What you want | Tier | How |
|---|---|---|
| Any metadata — experiments, biosamples, protocols, QC, file listings | open | anonymous JSON API |
| Processed contact matrices — `.mcool`, `.hic`, `.pairs` | open | AWS Open Data bucket |
| Feature calls — compartments, insulation, boundaries, domains, loops | open | AWS Open Data bucket |
| Microscopy images and tracks — `.tiff`, z-stacks, SPT trajectories | open | AWS Open Data bucket |
| Raw reads (`.fastq`) and alignments (`.bam`) for **non-protected** samples | open | AWS Open Data bucket |
| The portal's own `@@download` URL, for anything | registered | free account + access key |
| Raw reads and alignments for **protected human** samples | controlled | not through 4DN — see *Requesting access* |

Of 69,831 file records on 2026-08-27: **66,440 released**, **3,126 restricted**, 265
archived, and 201 replaced (which the default search hides). So the restricted tier is
4.5% of files, and it is concentrated exactly where you would expect — 2,076 fastq and 904
bam, from human primary tissue and patient-derived samples.

The portal's own FAQ states the rule that produces that split:

> Raw read files (fastq) and alignment files (bam) will be restricted, meaning that they
> cannot be downloaded and only the metadata associated with these files is available in
> the portal.

and, separately:

> File download from the 4DN data portal now requires authentication, even if the file is
> public.

Those two sentences are the whole access model. The second is the one that surprises
people, and the AWS Open Data mirror is the answer to it — the registry entry for 4DN
states that "External data users may freely download, analyze, and publish results based
on any 4DN data provided here without restrictions."

**This skill uses only the open route.** It reads metadata anonymously and downloads from
the open bucket. It documents the account route and the controlled tier; it does not need
either, and it cannot obtain access to the controlled tier for you.

## Trap 1 — `@@download` is not the open URL

Every file record carries an `href` that looks like the download link. It is the portal
route, and unauthenticated it fails:

```bash
# 4DNFI5INXRCH is a released, fully public 157 KB BED of Hi-C boundary calls.
curl -s -o portal.out -w 'portal @@download -> HTTP %{http_code}, %{size_download} bytes\n' \
  "https://data.4dnucleome.org/files-processed/4DNFI5INXRCH/@@download/4DNFI5INXRCH.bed.gz"
head -c 120 portal.out; echo

# The same bytes, from the AWS Open Data bucket, with no account:
curl -s -o open.bed.gz -w 'open_data_url  -> HTTP %{http_code}, %{size_download} bytes\n' \
  "https://4dn-open-data-public.s3.amazonaws.com/fourfront-webprod/wfoutput/e6e5aea1-1df7-4422-a5a8-10b10e5cd9e0/4DNFI5INXRCH.bed.gz"
gzip -t open.bed.gz && echo "open.bed.gz is valid gzip"
```

```
portal @@download -> HTTP 403, 9281 bytes
<!DOCTYPE html>
<html lang="en"><head><meta charSet="utf-8"/><meta http-equiv="Content-Type" content="text/html, charset
open_data_url  -> HTTP 200, 156797 bytes
open.bed.gz is valid gzip
```

The 403 body carries a JSON context that says `"title": "Not logged in."` — which reads
like the file is private. It is not; the file is `status: released` and world-readable.
Always pass `-f` (or check the status code) so a refusal fails loudly instead of landing
on disk as a 9 KB HTML file with a `.bed.gz` name.

**Where the open URL lives.** Every released file record carries `open_data_url`. On
2026-08-27 that held for **all 66,440** released files and for **none** of the 3,126
restricted ones, which makes its presence the cleanest pre-flight check there is:

| Field on a File record | Released file | Restricted file |
|---|---|---|
| `status` | `released` | `restricted` |
| `href` (portal `@@download`) | present, 403 anonymously | present, 403 anonymously |
| `open_data_url` | present | **absent** |
| `md5sum`, `file_size`, `file_format` | present | present |

Both kinds of file carry an `href`, and both refuse it without a credential — so `href`
tells you nothing about the tier. `open_data_url` does, and it is a field you can test.

`principals_allowed.view` is **not** the check. A restricted file reports
`{"view": ["system.Everyone"]}` — that governs the metadata record, which really is public,
not the bytes.

There is also a GA4GH DRS endpoint, which resolves an accession straight to both open URLs
plus the checksum and needs no account:

```bash
curl -s "https://data.4dnucleome.org/ga4gh/drs/v1/objects/4DNFI5INXRCH" \
| python3 -c "
import json,sys
d = json.load(sys.stdin)
print(d['id'], d['size'], 'bytes')
for m in d['access_methods']:
    print(' ', m['type'], m['access_url']['url'])
for c in d['checksums']:
    print(' ', c['type'], c['checksum'])"
```

```
4DNFI5INXRCH 156797 bytes
  https https://4dn-open-data-public.s3.amazonaws.com/fourfront-webprod/wfoutput/e6e5aea1-1df7-4422-a5a8-10b10e5cd9e0/4DNFI5INXRCH.bed.gz
  s3 s3://4dn-open-data-public/fourfront-webprod/wfoutput/e6e5aea1-1df7-4422-a5a8-10b10e5cd9e0/4DNFI5INXRCH.bed.gz
  md5 565f9755e8f6c1b0e619c2bd6bd9b8c9
```

Use DRS for one known accession. It is not a search interface, and a restricted accession
did not answer at all when tried on 2026-08-27 — the request hung and timed out at 60 s
rather than returning a 403 — so pre-flight with `status` from the search API, not with DRS.

## The `type=` vocabulary is the whole interface

4DN runs on the same portal stack as ENCODE — snovault, in 4DN's `fourfront` build — so
`/search/` is a typed object store rather than a full-text index. If you have queried
ENCODE, the grammar transfers; the field names and the facet vocabulary do not, because
they come from 4DN's own schemas. **`type=` is mandatory**, it names one class of object,
and each class has its own fields and its own facets. Getting it wrong is the difference
between 3,392 results and none.

```bash
BASE=https://data.4dnucleome.org

# type= is required. Omit it and you get a 301 that appends type=Item.
curl -s -o /dev/null -w 'no type    -> %{http_code} %{redirect_url}\n' \
  "$BASE/search/?q=cardiomyocyte&limit=0&format=json"

# A type that does not exist is a real error, not an empty result.
curl -s -w '\nbogus type -> %{http_code}\n' \
  "$BASE/search/?type=ExperimentSetReplicates&limit=0&format=json"

# Without format=json (or an Accept header) you get the HTML app, not data.
curl -s -o /dev/null -w 'no format  -> %{content_type}\n' "$BASE/search/?type=File&limit=1"
curl -s -o /dev/null -H 'Accept: application/json' \
  -w 'Accept hdr -> %{content_type}\n' "$BASE/search/?type=File&limit=1"
```

```
no type    -> 301 https://data.4dnucleome.org/search/?q=cardiomyocyte&limit=0&format=json&type=Item
{"@type": ["HTTPBadRequest", "Error"], "status": "error", "code": 400, "title": "Bad Request", "description": "Invalid type: ExperimentSetReplicates"}
bogus type -> 400
no format  -> text/html; charset=utf-8
Accept hdr -> application/json
```

The authoritative list of types is `/profiles/` — the full JSON Schema for every class,
1.4 MB on 2026-08-27, carrying **103** types. Read it rather than guessing at a name:

```bash
curl -s "https://data.4dnucleome.org/profiles/?format=json" \
| python3 -c "
import json,sys
names = sorted(k for k in json.load(sys.stdin) if not k.startswith('@'))
print(len(names), 'types')
print(', '.join(n for n in names if n.startswith(('Experiment','File'))))"
```

```
103 types
Experiment, ExperimentAtacseq, ExperimentCaptureC, ExperimentChiapet, ExperimentDamid, ExperimentHiC, ExperimentMic, ExperimentRepliseq, ExperimentSeq, ExperimentSet, ExperimentSetReplicate, ExperimentTsaseq, ExperimentType, File, FileCalibration, FileFastq, FileFormat, FileMicroscopy, FileOther, FileProcessed, FileReference, FileSet, FileSetCalibration, FileSetMicroscopeQc, FileVistrack
```

The nine that carry almost every question, with live counts from 2026-08-27:

| `type=` | n | what it is |
|---|---|---|
| `ExperimentSetReplicate` | 3,392 | **start here** — one biological dataset, its replicates and its combined results |
| `Experiment` | 7,473 | one assay on one biosample; abstract over `ExperimentHiC`, `ExperimentMic`, … |
| `File` | 69,831 | abstract over every file subtype |
| `FileProcessed` | 34,340 | pipeline output — contact matrices, pairs, bigWigs, feature calls |
| `FileFastq` | 29,513 | raw reads |
| `FileMicroscopy` | 5,649 | images and z-stacks |
| `Biosample` | 4,830 | the prepared sample, with modifications and treatments |
| `ExperimentType` | 54 | the assay vocabulary itself |
| `Publication` | 177 | papers, linked from the sets they used |

`File`, `Experiment` and `ExperimentSet` are **abstract** — searching them returns every
subtype, and the `type` facet in the response breaks the total down. That is the fastest
way to see what a result set is actually made of, and it is why `type=File` is usually the
right query even when you want only processed output.

`ExperimentSetReplicate` and `ExperimentSet` return the same 3,392 records today, because
every set in the portal is `experimentset_type: replicate`. Use `ExperimentSetReplicate`:
it is the concrete type, and it is what the browse UI links to.

## Facets are self-documenting — and their group headings are not filter values

Every search response carries a `facets` block listing the filterable fields for that type,
their human titles, and their term counts. Read it instead of hardcoding a field list —
it is how you discover that `ExperimentSetReplicate` filters on
`experiments_in_set.biosample.biosource.organism.name` and not on `organism`.

```python
import json, urllib.error, urllib.parse, urllib.request

BASE = "https://data.4dnucleome.org"


def search(item_type, *, limit=25, fields=(), **filters):
    """One /search/ call. Returns the decoded response, including `facets` and `total`.

    Repeat a filter key (pass a list) for OR. Suffix a key with '!' for NOT — it must
    reach the server percent-encoded, which urlencode does for us.

    An empty result set is served as **HTTP 404 with a full JSON body**, so catch it and
    return the body. A 400 is a real error — an invalid `type=` — and is left to raise.
    """
    params = [("type", item_type), ("format", "json"), ("limit", str(limit))]
    params += [("field", f) for f in fields]
    for key, value in filters.items():
        key = key.replace("__", ".")           # Python identifiers cannot hold dots
        for v in (value if isinstance(value, (list, tuple)) else [value]):
            params.append((key, str(v)))
    url = f"{BASE}/search/?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        body = json.loads(e.read())
        if "total" not in body:                # a genuinely missing path, not an empty hit
            raise
        return body


res = search("ExperimentSetReplicate", limit=0)
print(res["total"], "experiment sets;", len(res["facets"]), "facets\n")
for f in res["facets"][:8]:
    print(f"  {f['field']:60s} {f['title']}")
```

```
3392 experiment sets; 22 facets

  type                                                         Data Type
  award.project                                                Project
  lab.display_title                                            Lab
  experiments_in_set.experiment_type.experiment_category       Experiment Category
  experiments_in_set.experiment_type.display_title             Experiment Type
  dataset_label                                                Dataset
  experiments_in_set.biosample.biosource.organism.name         Organism
  experiments_in_set.biosample.biosample_type                  Sample Type
```

**Now the trap.** A facet carrying `has_group_by: true` returns a two-level structure: a
top-level `key` that is a *display grouping*, and a nested `terms` list of the values you
can actually filter on. Filtering on the group heading matches nothing — which the portal
serves as a 404 the helper above has to unwrap.

```python
et = next(f for f in res["facets"]
          if f["field"] == "experiments_in_set.experiment_type.display_title")
print("has_group_by:", et.get("has_group_by"))
for group in et["terms"][:3]:
    members = ", ".join(f"{t['key']} ({t['doc_count']})" for t in group["terms"])
    print(f"  group {group['key']!r} = {group['doc_count']}  ->  {members}")

TYPE_FIELD = "experiments_in_set__experiment_type__display_title"
for value in ("Hi-C", "in situ Hi-C", "Micro-C"):
    r = search("ExperimentSetReplicate", limit=0, **{TYPE_FIELD: value})
    print(f"  filter {value!r:15s} -> total {r['total']:4d}  {r['notification']!r}")

# A field name that does not exist fails in exactly the same way.
r = search("ExperimentSetReplicate", limit=0, organism="human")
print(f"  filter organism='human'  -> total {r['total']:4d}  {r['notification']!r}")
```

```
has_group_by: True
  group 'Hi-C' = 680  ->  in situ Hi-C (497), Dilution Hi-C (118), Micro-C (26), DNase Hi-C (25), TCC (14)
  group 'FISH' = 565  ->  DNA FISH (277), multiplexed FISH (203), RNA FISH (85)
  group 'Transcription' = 416  ->  RNA-seq (294), single cell RNA-seq (76), SLAM-seq (28), sci-RNA-seq (15), Droplet paired-tag (2), Bru-seq (1)
  filter 'Hi-C'          -> total    0  'No results found'
  filter 'in situ Hi-C'  -> total  497  'Success'
  filter 'Micro-C'       -> total   26  'Success'
  filter organism='human'  -> total    0  'No results found'
```

`'Hi-C'` names 680 sets in the facet and matches nothing as a filter, because it is a
heading over five real assay names. A field that does not exist at all behaves identically.

**Both of those are HTTP 404.** The portal serves an empty result set as `404 Not Found`
carrying the ordinary JSON envelope — `total: 0`, `notification: "No results found"`, an
empty `@graph`, and the full `facets` block:

```bash
BASE=https://data.4dnucleome.org
for filter in \
  "experiments_in_set.experiment_type.display_title=Hi-C" \
  "experiments_in_set.experiment_type.display_title=in+situ+Hi-C" \
  "organism=human" ; do
  code=$(curl -s -o body.json -w '%{http_code}' \
    "$BASE/search/?type=ExperimentSetReplicate&$filter&limit=0&format=json")
  python3 -c "
import json,sys
d = json.load(open('body.json'))
print(f'HTTP $code  total={d[\"total\"]:<5} {d[\"notification\"]!r}  <- $filter')"
done
```

```
HTTP 404  total=0     'No results found'  <- experiments_in_set.experiment_type.display_title=Hi-C
HTTP 200  total=497   'Success'  <- experiments_in_set.experiment_type.display_title=in+situ+Hi-C
HTTP 404  total=0     'No results found'  <- organism=human
```

Note the `+` in that second filter. A space encoded as `%20` gets a **301** to the `+` form,
so a client that does not follow redirects sees an HTML redirect page instead of JSON.
Python's `urllib.parse.urlencode` produces `+` already, which is why the helper above never
meets this.

This is the single most consequential thing to get right. `requests.raise_for_status()`
raises, `urlopen` raises `HTTPError`, and `curl -f` discards the body — so a query that
simply matched nothing reads as a broken endpoint, and a retry loop keyed on status codes
will hammer a URL that is working perfectly. **Catch the 404, parse the body, and branch on
`total`.** A malformed request is a *400*, and that one should raise.

Take filter values from the nested `terms` of a grouped facet, never from its group
heading. The 54 real assay names live in `type=ExperimentType`, which is the vocabulary the
portal actually stores.

## Query grammar

Everything below was checked against `type=ExperimentSetReplicate` on 2026-08-27.

| Want | Syntax | Note |
|---|---|---|
| JSON | `format=json` | or `Accept: application/json` |
| Page size | `limit=25` | **25 is the default** — a bare query silently truncates |
| Everything | `limit=all` | fine on narrow queries; `type=File` unfielded is 69,831 records |
| Count only | `limit=0` | returns `total`, `facets`, and an empty `@graph` |
| Offset | `from=25` | pairs with `limit` |
| Trim the payload | `field=accession&field=status` | repeatable; **`@id` and `@type` always come back** |
| OR | repeat the key | `…display_title=in situ Hi-C&…display_title=Micro-C` → 523 = 497 + 26 |
| NOT | `field%21=value` | a literal `!` triggers a 301 to the encoded form |
| Space in a value | `in+situ+Hi-C` | `%20` also 301s to the `+` form |
| Free text | `q=cardiomyocyte` | still needs `type=` |
| Sort | `sort=file_size` / `sort=-file_size` | `-` is descending |

```python
ES = "ExperimentSetReplicate"
T = "experiments_in_set__experiment_type__display_title"
ORG = "experiments_in_set__biosample__biosource__organism__name"

print("all sets                ", search(ES, limit=0)["total"])
print("in situ Hi-C            ", search(ES, limit=0, **{T: "in situ Hi-C"})["total"])
print("Micro-C                 ", search(ES, limit=0, **{T: "Micro-C"})["total"])
print("OR of the two           ", search(ES, limit=0, **{T: ["in situ Hi-C", "Micro-C"]})["total"])
print("mouse                   ", search(ES, limit=0, **{ORG: "mouse"})["total"])
print("NOT mouse               ", search(ES, limit=0, **{ORG + "!": "mouse"})["total"])
print("q=cardiomyocyte         ", search(ES, limit=0, q="cardiomyocyte")["total"])

micro = search(ES, limit="all", fields=("accession",), **{T: "Micro-C"})
default = search(ES, fields=("accession",), **{T: "Micro-C"})
page2 = search(ES, limit=5, fields=("accession",), **{T: "Micro-C"}, **{"from": 5})
print(f"limit=all returned {len(micro['@graph'])} of {micro['total']};"
      f" default returned {len(default['@graph'])};"
      f" from=5&limit=5 returned {[r['accession'] for r in page2['@graph']]}")
```

```
all sets                 3392
in situ Hi-C             497
Micro-C                  26
OR of the two            523
mouse                    974
NOT mouse                2418
q=cardiomyocyte          213
limit=all returned 26 of 26; default returned 25; from=5&limit=5 returned ['4DNESCXWBAEE', '4DNES1UAI7F5', '4DNESC9311OT', '4DNESRTUDA91', '4DNESM9M3FA4']
```

`497 + 26 = 523` and `974 + 2418 = 3392`, so OR and NOT are doing what they claim. The
`default returned 25` line is the one to internalise — a query with no `limit` looks like a
complete answer and is a first page.

`field=` is the difference between a usable pipeline and a slow one. A single
`ExperimentSetReplicate` record embeds its lab, award, publications and every experiment,
so `limit=1` with no `field=` is a **135 KB** response. Note that `field=` trims `@graph`
only — the `facets` block is unaffected, so pair it with `limit=0` when you want counts and
with `field=` when you want records.

```python
import collections

hic = search(
    "ExperimentSetReplicate",
    limit="all",
    fields=("accession", "dataset_label", "number_of_experiments",
            "experiments_in_set.biosample.biosource_summary", "lab.display_title"),
    experiments_in_set__experiment_type__display_title=["in situ Hi-C", "Micro-C"],
    experiments_in_set__biosample__biosource__organism__name="human",
)
assert hic["total"] > 0, hic["notification"]
print(hic["total"], "human in situ Hi-C or Micro-C sets")

labs = collections.Counter(r["lab"]["display_title"] for r in hic["@graph"])
for lab, n in labs.most_common(5):
    print(f"  {n:4d}  {lab}")
```

```
384 human in situ Hi-C or Micro-C sets
   163  Job Dekker, UMMS
    60  Jesse Dixon, SALK
    46  Erez Lieberman Aiden, BCM
    43  Rafael Casellas, NIH
    21  Benoit Bruneau, UCSF
```

## Trap 2 — ExperimentSet, Experiment, File, and the query that misses half of them

The hierarchy has three levels, and files hang off **two** of them:

```
ExperimentSetReplicate  4DNES2M5JIGV        "in situ Hi-C on H1-hESC (Tier 1) with DpnII"
├── processed_files[]                        combined-replicate output
│     .mcool  .hic  .pairs  compartments  insulation  boundaries
├── other_processed_files[]                  supplementary groups, contributed per lab
│     each group has a title, a type (supplementary | preliminary | archived), and files[]
└── experiments_in_set[]
      ├── Experiment 4DNEXENKINA2  (/experiments-hi-c/)
      │     ├── files[]                      raw — 18 fastq
      │     ├── processed_files[]            per-replicate — bam, pairs
      │     └── other_processed_files[]
      └── Experiment 4DNEXZJZ5EBZ            (same shape)
```

**The combined contact matrix is on the set, not on any experiment.** That is the point of
the level, and it is what most people came for. Per-experiment `processed_files` are the
per-replicate intermediates.

The obvious one-shot query — ask the File index for everything in a set — has two spellings
and **neither is complete**:

```python
SET = "4DNES2M5JIGV"     # in situ Hi-C on H1-hESC (Tier 1) with DpnII, Dekker lab
FILE_FIELDS = ("accession", "status", "file_classification", "file_type",
               "file_format.display_title", "file_size", "genome_assembly",
               "open_data_url", "md5sum", "href")

direct = search("File", limit="all", fields=FILE_FIELDS, experiment_sets__accession=SET)
via_exp = search("File", limit="all", fields=FILE_FIELDS,
                 experiments__experiment_sets__accession=SET)

d = {r["accession"] for r in direct["@graph"]}
v = {r["accession"] for r in via_exp["@graph"]}
print(f"experiment_sets.accession             -> {len(d)}")
print(f"experiments.experiment_sets.accession -> {len(v)}")
print(f"overlap {len(d & v)}, union {len(d | v)}")
```

```
experiment_sets.accession             -> 38
experiments.experiment_sets.accession -> 50
overlap 0, union 88
```

**The overlap is zero.** `experiment_sets.accession` returns the set-level files (all 38
`processed file`); `experiments.experiment_sets.accession` returns the experiment-level
files (36 raw + 14 processed). Run both and take the union, or you will report a Hi-C
dataset as having no reads, or no contact matrix, depending on which spelling you picked.

```python
def files_for_set(accession, fields=FILE_FIELDS):
    """Every File attached to an experiment set, at either level of the hierarchy."""
    out = {}
    for key in ("experiment_sets__accession", "experiments__experiment_sets__accession"):
        res = search("File", limit="all", fields=fields, **{key: accession})
        for rec in res["@graph"]:
            out[rec["accession"]] = rec
    return out


files = files_for_set(SET)
by_kind = collections.Counter((f["file_classification"], f["status"]) for f in files.values())
for (kind, status), n in sorted(by_kind.items()):
    print(f"  {n:3d}  {kind:15s} {status}")
print(f"  {len(files)} total")
```

```
   25  processed file  archived
   27  processed file  released
   36  raw file        released
  88 total
```

Note the 25 archived files. They are real records with real URLs, and they are superseded —
4DN keeps earlier calls from contributing labs under `other_processed_files` groups titled
"Archived …". **Filter on `status=released`** unless you specifically want the history.

Run over 21 sets chosen to differ — multiplexed FISH in fly, DNA SPRITE in mouse
cerebellum, ENCODE-project Hi-C sets of 14 and 154 files, the oldest and newest sets by
`date_created`, archived sets and retired ones — `files_for_set` held up everywhere, with
one edge case, in the next section. Every released file in that sample had an
`open_data_url` and a `file_format.display_title`.

### Reading the set record directly

Walking the embedded JSON is the other route, and it is the one that shows you the group
titles and provenance the flat File index does not carry. Two things about the embedded
form are worth knowing before you write the loop:

```python
import urllib.request

with urllib.request.urlopen(f"{BASE}/experiment-set-replicates/{SET}/?format=json", timeout=120) as r:
    es = json.loads(r.read())

print(es["accession"], "|", es["description"])
print("set-level processed_files:")
for f in es["processed_files"]:
    print(f"  {f['accession']}  {f['file_type']:24s} {f['file_format']['display_title']:6s}"
          f"  {f['file_size']:>14,}  {f['genome_assembly']}")

print("other_processed_files groups:")
for g in es["other_processed_files"]:
    readable = [f for f in g["files"] if "accession" in f]
    print(f"  {g['title']!r} ({g['type']}) — {len(g['files'])} files,"
          f" {len(g['files']) - len(readable)} not viewable")
```

```
4DNES2M5JIGV | in situ Hi-C on H1-hESC (Tier 1) with DpnII
set-level processed_files:
  4DNFITU7K8VQ  contact list-combined    pairs   49,203,877,939  GRCh38
  4DNFIQYQWPF5  contact matrix           hic     22,161,530,585  GRCh38
  4DNFI6HDY7WZ  contact matrix           mcool   26,310,980,892  GRCh38
  4DNFI5INXRCH  boundaries               bed            156,797  GRCh38
  4DNFI4P777MF  insulation score-diamond bw           8,497,134  GRCh38
  4DNFI4RWBB4U  compartments             bw             212,766  GRCh38
other_processed_files groups:
  'Compartment, insulation and loop calls - Dekker Lab' (supplementary) — 4 files, 0 not viewable
  'JAWG results - Dekker Lab' (supplementary) — 4 files, 4 not viewable
  'JAWG results - Yue Lab version 1' (preliminary) — 5 files, 5 not viewable
  'Archived Boundaries, Domains and Dot Calls - Cremins Lab' (archived) — 25 files, 0 not viewable
  'Archived Results' (archived) — 2 files, 2 not viewable
  'Archived results' (archived) — 3 files, 0 not viewable
```

**An embedded object you cannot view is replaced by a stub, not omitted.** Those entries are
literally `{"error": "no view permissions"}` — no `accession`, no `@id`. Guard every loop
over an embedded list with an `"accession" in f` test, or the first such group raises a
`KeyError` halfway through a walk.

**Embedding depth is not uniform.** `file_format` is embedded as
`{"file_format": "fastq", "display_title": "fastq", …}` under an experiment's raw `files`,
but as `{"display_title": "hic", …}` — with no `file_format` key — under the set's
`processed_files`. Read `file_format.display_title`, which is present in both, or
`file_type_detailed`, which is a flat string (`"contact matrix (mcool)"`).

### Retired accessions redirect; the File index does not follow them

67 experiment sets carry `status: replaced` on 2026-08-27, and the default search hides
them — 3,390 released plus 2 archived is the 3,392 you see. A retired accession still
resolves, by a **301 to its replacement**, but the File index knows nothing about it:

```python
OLD = "4DNESRR9GN9U"     # retired; replaced by another set

for key in ("experiment_sets__accession", "experiments__experiment_sets__accession"):
    print(f"  files via {key.replace('__', '.'):40s} -> {search('File', limit=0, **{key: OLD})['total']}")

req = urllib.request.Request(f"{BASE}/experiment-set-replicates/{OLD}/?format=json")
with urllib.request.urlopen(req, timeout=120) as r:          # urlopen follows the 301
    now = json.loads(r.read())
print(f"  {OLD} -> {now['accession']} ({now['status']}), "
      f"alternate_accessions={now['alternate_accessions']}, "
      f"{len(now['experiments_in_set'])} experiments")

hit = search("ExperimentSetReplicate", limit=1, fields=("accession", "status"),
             alternate_accessions=OLD)
print(f"  alternate_accessions={OLD} -> {[r['accession'] for r in hit['@graph']]}")
```

```
  files via experiment_sets.accession                -> 0
  files via experiments.experiment_sets.accession    -> 0
  4DNESRR9GN9U -> 4DNESLM6T5VF (released), alternate_accessions=['4DNESRR9GN9U'], 5 experiments
  alternate_accessions=4DNESRR9GN9U -> ['4DNESLM6T5VF']
```

So an accession from an older paper that returns zero files is probably retired rather than
empty. Resolve it — fetch the item and follow the redirect, or search
`alternate_accessions=<old>` — and re-run the file queries against the accession you get
back.

## Check the tier before you transfer anything

`4DNESOBTE6GH` is the shape to expect from a patient-derived human dataset — in situ Hi-C
on bone marrow mononuclear lymphocytes, Dixon lab. Processed output is public; reads and
alignments are not:

```python
def triage(accession):
    rows = sorted(files_for_set(accession).values(),
                  key=lambda r: (r["status"], r["file_type"]))
    print(f"{accession}: {len(rows)} files")
    for r in rows:
        gb = r["file_size"] / 1e9
        route = "open_data_url" if r.get("open_data_url") else "NO OPEN ROUTE"
        print(f"  {r['accession']}  {r['status']:10s} {r['file_classification']:14s}"
              f" {r['file_type']:22s} {r['file_format']['display_title']:5s}"
              f" {gb:8.2f} GB  {route}")


triage("4DNESOBTE6GH")
```

```
4DNESOBTE6GH: 8 files
  4DNFICKJTH4L  released   processed file compartments           bw        0.00 GB  open_data_url
  4DNFIUNJKNJF  released   processed file contact list-combined  pairs     1.80 GB  open_data_url
  4DNFII6IVXF2  released   processed file contact list-replicate pairs     2.02 GB  open_data_url
  4DNFIXGAEPB6  released   processed file contact matrix         mcool     0.95 GB  open_data_url
  4DNFI7EETNXL  released   processed file contact matrix         hic       1.55 GB  open_data_url
  4DNFI7VWY5NZ  restricted processed file alignments             bam      26.38 GB  NO OPEN ROUTE
  4DNFIIJHOAYQ  restricted raw file       reads                  fastq     8.98 GB  NO OPEN ROUTE
  4DNFIWJQTEFS  restricted raw file       reads                  fastq     8.59 GB  NO OPEN ROUTE
```

That is the answer to give a user before starting a transfer: *the contact matrices and
compartment calls are open and total about 6.3 GB; the reads and the BAM are controlled and
4DN cannot release them*. Reporting the restricted three as "download failed" is the failure
this section exists to prevent.

To find such datasets on purpose — or to avoid them:

```python
for label, kw in [
    ("sets with any restricted raw file", {"experiments_in_set__files__status": "restricted"}),
    ("sets with restricted processed files", {"experiments_in_set__processed_files__status": "restricted"}),
    ("human individuals flagged protected_data", None),
]:
    if kw is None:
        r = search("IndividualHuman", limit=0, protected_data="true")
    else:
        r = search("ExperimentSetReplicate", limit=0, **kw)
    print(f"  {r['total']:5d}  {label}")
```

```
    549  sets with any restricted raw file
    355  sets with restricted processed files
    140  human individuals flagged protected_data
```

`IndividualHuman.protected_data` is the upstream cause: 140 of 249 human donors on the
portal are flagged, and every restricted file traces back through
`biosample.biosource.individual` to one of them.

## Get the files

The pattern is always the same four steps — find the set, enumerate both file levels,
partition by tier, then fetch from `open_data_url` with the portal's md5 as the check.

### Write a manifest first

```python
import csv

OPEN_FIELDS = ["accession", "file_type", "file_format", "genome_assembly",
               "file_size", "md5sum", "open_data_url"]


def manifest(set_accessions, path="4dn_manifest.tsv", released_only=True):
    """One TSV row per downloadable file, plus a printed account of what was withheld."""
    rows, withheld = [], []
    for acc in set_accessions:
        for rec in files_for_set(acc).values():
            if released_only and rec["status"] != "released":
                withheld.append((acc, rec["accession"], rec["status"], rec["file_type"]))
                continue
            if not rec.get("open_data_url"):
                withheld.append((acc, rec["accession"], rec["status"], rec["file_type"]))
                continue
            rows.append({
                "accession": rec["accession"],
                "file_type": rec["file_type"],
                "file_format": rec["file_format"]["display_title"],
                "genome_assembly": rec.get("genome_assembly", ""),
                "file_size": rec["file_size"],
                "md5sum": rec["md5sum"],
                "open_data_url": rec["open_data_url"],
            })
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=OPEN_FIELDS, delimiter="\t")
        w.writeheader()
        w.writerows(rows)
    total = sum(r["file_size"] for r in rows)
    print(f"{path}: {len(rows)} files, {total / 1e9:.2f} GB")
    for acc, f, status, ftype in withheld:
        print(f"  withheld {f} ({status}, {ftype}) from {acc}")
    return rows


rows = manifest(["4DNESOBTE6GH"])
```

```
4dn_manifest.tsv: 5 files, 6.32 GB
  withheld 4DNFI7VWY5NZ (restricted, alignments) from 4DNESOBTE6GH
  withheld 4DNFIIJHOAYQ (restricted, reads) from 4DNESOBTE6GH
  withheld 4DNFIWJQTEFS (restricted, reads) from 4DNESOBTE6GH
```

The portal also has a `/metadata/` endpoint that returns a TSV of the same shape. It is
built for logged-in bulk download and, tried anonymously on 2026-08-27, it returned only
its header row for every query shape tried — 200 OK, 24 columns, zero data rows. Build the
manifest from `/search/` instead; the columns you need are all there.

### Fetch and verify

```python
import hashlib, pathlib, urllib.request


def fetch(row, outdir="4dn"):
    """Download one manifest row and verify it against the portal's md5. Returns the path."""
    pathlib.Path(outdir).mkdir(exist_ok=True)
    url = row["open_data_url"]
    dest = pathlib.Path(outdir) / url.rsplit("/", 1)[-1]
    if not dest.exists() or dest.stat().st_size != int(row["file_size"]):
        with urllib.request.urlopen(url, timeout=600) as r, open(dest, "wb") as fh:
            while chunk := r.read(1 << 20):
                fh.write(chunk)
    digest = hashlib.md5()
    with open(dest, "rb") as fh:
        while chunk := fh.read(1 << 20):
            digest.update(chunk)
    if digest.hexdigest() != row["md5sum"]:
        raise ValueError(f"{dest}: md5 {digest.hexdigest()} != portal {row['md5sum']}")
    print(f"{dest} {dest.stat().st_size:,} bytes  md5 ok")
    return dest


small = [r for r in rows if r["file_size"] < 5_000_000]
for r in small:
    fetch(r)
```

```
4dn/4DNFICKJTH4L.bw 209,943 bytes  md5 ok
```

The md5 check is not optional here. The bucket is plain HTTPS with no signature, and a
truncated transfer produces a shorter file with no error — which for a `.mcool` means a
corrupt HDF5 that fails much later, in an analysis, rather than at the download.

### The same bucket over the S3 API

`open_data_url` is an `https://<bucket>.s3.amazonaws.com/<key>` URL; the CLI wants
`s3://<bucket>/<key>`. Anonymous access needs `--no-sign-request`:

```bash
# https://4dn-open-data-public.s3.amazonaws.com/PREFIX  ->  s3://4dn-open-data-public/PREFIX
aws s3 ls --no-sign-request \
  "s3://4dn-open-data-public/fourfront-webprod/wfoutput/e6e5aea1-1df7-4422-a5a8-10b10e5cd9e0/"
```

```
2021-03-04 15:17:38     156797 4DNFI5INXRCH.bed.gz
2021-04-14 20:19:55    1619968 4DNFI5INXRCH.beddb
```

The extra `.beddb` is a HiGlass tileset built from the same data. It sits under
`extra_files` on the parent File record — with `use_for: "visualization"`, its own
`md5sum`, and the **parent's accession** rather than one of its own — so it will not turn
up in a search keyed on accessions. Read `extra_files` when you want the visualisation
sidecars, and expect them next to the primary key in the bucket.

### The authenticated portal route

You should not need this. Every one of the 66,440 released files carried an `open_data_url`
on 2026-08-27, so the open route covers everything the portal will release. Use the account
route if you want a single URL scheme across a script that also touches non-public work of
your own. Create a free account at the portal, then Profile → Add Access Key, and keep the
pair out of your shell history:

```bash
# FOURDN_KEY / FOURDN_SECRET come from Profile -> Add Access Key on the portal.
# Shell variables cannot start with a digit, so do not name them 4DN_KEY.
curl -s -o /dev/null -w 'portal @@download -> HTTP %{http_code}\n' \
  --user "${FOURDN_KEY:-}:${FOURDN_SECRET:-}" -L \
  "https://data.4dnucleome.org/files-processed/4DNFI5INXRCH/@@download/4DNFI5INXRCH.bed.gz"
```

```
portal @@download -> HTTP 401
```

With a valid key pair that becomes a 200 and the file. The two refusals observed on
2026-08-27 are different codes and mean different things:

| Request | Code | Body `title` |
|---|---|---|
| no `--user` header at all | 403 | `Not logged in.` |
| `--user` with an empty or wrong key pair | 401 | `No Access` |

A 401 means fix the credential; a 403 means the credential is not what is missing. And a
key does not unlock the restricted tier — the portal's FAQ states those files "cannot be
downloaded", account or not, because the key proves an account and not an authorisation.
Pre-flight on `status`, not on whether a credential is present.

### Reading a contact matrix

`.mcool` is a multi-resolution [cooler](https://github.com/open2c/cooler) file and `.hic`
is Juicer's format; both are on the open bucket. Of the 1,148 released `.mcool` files on
2026-08-27 the median was **1.11 GB** and the largest **48.3 GB**, with 52 under 100 MB —
so `sort=file_size` on the File index is how you find one small enough to iterate against
before committing to the matrix you actually want:

```bash
python3 -m venv .venv
./.venv/bin/pip install --quiet --disable-pip-version-check cooler
./.venv/bin/python -c "import cooler; print('cooler', cooler.__version__)"
```

```
cooler 0.10.4
```

```bash
curl -s -O "https://4dn-open-data-public.s3.amazonaws.com/fourfront-webprod/wfoutput/366724cc-de20-4c88-b9a6-c88992a88a9f/4DNFI23M4PPX.mcool"
./.venv/bin/python -c "
import cooler
path = '4DNFI23M4PPX.mcool'
print(len(cooler.fileops.list_coolers(path)), 'resolutions')
c = cooler.Cooler(path + '::/resolutions/1000000')
print('binsize', c.binsize, '| bins', c.info['nbins'], '| nnz', c.info['nnz'])
print('chroms', len(c.chromnames), c.chromnames[:4])
m = c.matrix(balance=False).fetch('chr21')
print('chr21', m.shape, 'sum', int(m.sum()))
print('cooler genome-assembly field:', c.info.get('genome-assembly'))"
```

```
13 resolutions
binsize 1000000 | bins 3102 | nnz 218768
chroms 24 ['chr1', 'chr2', 'chr3', 'chr4']
chr21 (47, 47) sum 2949
cooler genome-assembly field: unknown
```

`4DNFI23M4PPX` is in situ Hi-C on GM12878 (Lieberman Aiden lab), 30 MB, from set
`4DNESJNPEKZD`. Note the last line — the cooler's own `genome-assembly` metadata says
`unknown`, while the portal record says `GRCh38`. **Take the assembly from the File record,
not from the file.** The portal is authoritative and the header often is not.

## Requesting access

The 3,126 restricted files are human genomic data covered by the NIH Genomic Data Sharing
Policy. Before anything else, three facts that change what is worth doing:

**4DN does not run a controlled tier, and cannot grant you access to one.** The portal
withholds the files; it does not gate them behind an application it administers. Its FAQ is
explicit that the generating lab, not the DCIC, registers and deposits protected data
elsewhere:

> The data generating lab is responsible for registering their data sets with dbGAP and
> submitting them to that resource at the appropriate time. The 4DN-DCIC will add
> appropriate links and database cross references on the portal to facilitate discovery of
> these datasets.

**In practice those links are mostly not there yet.** Sampling every `Experiment` carrying
a cross-reference on 2026-08-27 — 2,598 records, 3,848 references — the prefixes were `GEO`
(2,406), `SRA` (1,244) and `ENCODE` (198). **Zero dbGaP accessions**, and a portal-wide
search for `phs`-style study ids returned nothing. So you cannot generally resolve a
restricted 4DN file to a dbGaP study from the portal metadata.

**The binding constraint is consent, not paperwork.** These are patient and donor samples
consented under study-specific terms, and a study consented for one disease is unusable for
unrelated research even after an application succeeds. Establish that the consent covers
your question before spending months on access.

What to actually do, in order:

1. **Check whether you need the restricted files at all.** Compartments, insulation scores,
   TAD and loop calls, `.pairs` contact lists and `.mcool`/`.hic` matrices are released for
   these datasets — see `4DNESOBTE6GH` above. Re-alignment or variant-aware analysis needs
   the reads; almost nothing else does.
2. **Read the set's `publications_of_set`.** A paper that used the data states its data
   availability, and that is where a dbGaP `phs` accession or an EGA study id will be named
   if one exists.
3. **Ask the generating lab.** `lab.display_title` and the lab record's `correspondence`
   give the PI. They own the deposit and the timing of it.
4. **Ask the DCIC where the deposit went** — `support@4dnucleome.org`. They maintain the
   cross-references and can say whether a study has been registered.
5. **Apply to dbGaP, if a study id exists.** That is an application by a named investigator
   through an institutional signing official, with a research use statement, a data access
   request, and an institutional data-use certification. Typical turnaround is weeks to
   months, and approvals are renewable and revocable.

An agent may usefully draft a research use statement and checklist the requirements. **It
must not fill in the attestations** — IRB determination, data security plan, and
non-re-identification are legal claims published under a named person's name, and the
signing official is the point of the process.

## What the portal will not answer

- **It is not a genome browser.** There is no "contacts near *MYC*" query. Fetch the
  `.mcool` and slice it with cooler, or use the portal's HiGlass views in a browser.
- **It is not an SRA mirror.** Many experiments carry `dbxrefs` like `SRA:SRX27149410` and
  `GEO:GSM8702013`; the same reads under those accessions carry their own terms.
- **Its `q=` is weak.** Free text over embedded metadata, not over paper full text. Filter
  on facet fields and use `q=` only to widen a search you already scoped with `type=`.
- **Counts move.** Every number in this page is dated 2026-08-27. The portal releases
  continuously (the AWS mirror updates daily), so treat exact totals as drift indicators
  rather than invariants.

## Try it

**Data.** `4DNES2M5JIGV` — in situ Hi-C on H1-hESC (Tier 1) with DpnII, Job Dekker lab,
released, used in Krietenstein et al. 2020 (PMID:32213324) and Akgol Oksuz et al. 2021
(PMID:34480151). Its set-level `4DNFI5INXRCH` is a 157 KB gzipped BED of boundary calls on
GRCh38. Both are public, no account is needed, and the AWS Open Data registry entry for 4DN
states that external users may freely download, analyse and publish results based on this
data without restrictions.

**Run.** In a fresh empty directory, with Python 3 (standard library only):

```bash
cat > try_4dn.py <<'PY'
import hashlib, json, urllib.error, urllib.parse, urllib.request

BASE = "https://data.4dnucleome.org"
SET, FILE = "4DNES2M5JIGV", "4DNFI5INXRCH"
codes = {}


def search(item_type, *, limit=25, fields=(), **filters):
    """An empty result set is HTTP 404 with a full JSON body — unwrap it, do not raise."""
    params = [("type", item_type), ("format", "json"), ("limit", str(limit))]
    params += [("field", f) for f in fields]
    for key, value in filters.items():
        key = key.replace("__", ".")
        for v in (value if isinstance(value, (list, tuple)) else [value]):
            params.append((key, str(v)))
    url = f"{BASE}/search/?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            body, code = json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        body, code = json.loads(e.read()), e.code
        if "total" not in body:
            raise
    codes[body["total"]] = code
    return body


# 1. Response shape. Every /search/ answer carries these, whatever the type.
res = search("ExperimentSetReplicate", limit=1, fields=("accession",))
for key in ("@graph", "total", "facets", "filters", "notification", "columns", "sort"):
    assert key in res, f"missing {key}"
assert res["notification"] == "Success", res["notification"]
assert len(res["@graph"]) == 1 and res["@graph"][0]["@id"].startswith("/experiment-set-replicates/")
print(f"shape ok — {res['total']} experiment sets, {len(res['facets'])} facets")

# 2. The grouped-facet trap: the group heading is not a filter value, and no match is a 404.
et = next(f for f in search("ExperimentSetReplicate", limit=0)["facets"]
          if f["field"] == "experiments_in_set.experiment_type.display_title")
assert et["has_group_by"] is True
group = next(g for g in et["terms"] if g["key"] == "Hi-C")
member = group["terms"][0]["key"]
F = "experiments_in_set__experiment_type__display_title"
by_group = search("ExperimentSetReplicate", limit=0, **{F: "Hi-C"})["total"]
by_member = search("ExperimentSetReplicate", limit=0, **{F: member})["total"]
assert by_group == 0 and by_member > 0
assert codes[0] == 404 and codes[by_member] == 200, codes
print(f"facet group 'Hi-C' = {group['doc_count']} sets, but filtering on it -> {by_group}"
      f" (HTTP {codes[0]}); on {member!r} -> {by_member} (HTTP {codes[by_member]})")

# 3. Files hang off two levels, and neither query alone is complete.
FF = ("accession", "status", "file_classification", "file_type",
      "file_format.display_title", "file_size", "md5sum", "open_data_url")
direct = {r["accession"]: r for r in
          search("File", limit="all", fields=FF, experiment_sets__accession=SET)["@graph"]}
via = {r["accession"]: r for r in
       search("File", limit="all", fields=FF, experiments__experiment_sets__accession=SET)["@graph"]}
assert not (direct.keys() & via.keys()), "levels are supposed to be disjoint"
print(f"{SET}: {len(direct)} set-level + {len(via)} experiment-level = {len(direct | via)} files")

# 4. Access tier. Released files carry open_data_url; restricted ones never do.
allf = {**direct, **via}
released = [f for f in allf.values() if f["status"] == "released"]
assert all(f.get("open_data_url") for f in released), "a released file with no open route"
assert all(not f.get("open_data_url") for f in allf.values() if f["status"] == "restricted")
print(f"{len(released)} released, all with an open_data_url; "
      f"{sum(1 for f in allf.values() if f['status'] != 'released')} not released")

# 5. Download one small open file and check it against the portal's own md5.
rec = allf[FILE]
with urllib.request.urlopen(rec["open_data_url"], timeout=300) as r:
    blob = r.read()
assert len(blob) == rec["file_size"], f"{len(blob)} != {rec['file_size']}"
assert hashlib.md5(blob).hexdigest() == rec["md5sum"]
print(f"{FILE} {rec['file_type']} ({rec['file_format']['display_title']}) "
      f"{len(blob):,} bytes, md5 matches portal")
PY
python3 try_4dn.py
```

**Expect.**

```
shape ok — 3392 experiment sets, 22 facets
facet group 'Hi-C' = 680 sets, but filtering on it -> 0 (HTTP 404); on 'in situ Hi-C' -> 497 (HTTP 200)
4DNES2M5JIGV: 38 set-level + 50 experiment-level = 88 files
63 released, all with an open_data_url; 25 not released
4DNFI5INXRCH boundaries (bed) 156,797 bytes, md5 matches portal
```

**Invariants** — a failure here means this skill is wrong, not that 4DN moved:

- `notification == "Success"` and `@graph`/`total`/`facets`/`filters` present on every
  `/search/` response.
- A hit is HTTP 200; an empty result set is HTTP **404** carrying the same JSON envelope.
- The `Experiment Type` facet is grouped (`has_group_by: true`), and filtering on a group
  heading returns 0 while filtering on a member returns more than 0.
- Set-level and experiment-level file queries are **disjoint**; neither is the whole set.
- Every `released` file has an `open_data_url`; no `restricted` file has one.
- The downloaded bytes match both `file_size` and `md5sum` from the portal record.

**Observed values, 2026-08-27** — a mismatch here is drift to investigate:

- 3,392 experiment sets; 22 facets on `ExperimentSetReplicate`.
- Facet group `Hi-C` = 680 sets; member `in situ Hi-C` = 497.
- `4DNES2M5JIGV` has 88 files — 38 set-level and 50 experiment-level; 63 released (36 raw,
  27 processed) and 25 archived.
- `4DNFI5INXRCH` is 156,797 bytes, md5 `565f9755e8f6c1b0e619c2bd6bd9b8c9`, GRCh38.

## Sources

- 4DN Data Portal — <https://data.4dnucleome.org>
- Data use guidelines and citation, portal FAQ — <https://data.4dnucleome.org/help/user-guide/faq>
- Downloading files, including the AWS Open Data route — <https://data.4dnucleome.org/help/downloading-files>
- REST API and DRS notes — <https://data.4dnucleome.org/help/user-guide/rest-api>, <https://data.4dnucleome.org/help/user-guide/data-access/drsapi>
- AWS Open Data registry entry, which carries the data licence statement — <https://registry.opendata.aws/4dnucleome/>
- Dekker J *et al.* The 4D nucleome project. *Nature* 2017 — PMID:28905911
- Reiff SB *et al.* The 4D Nucleome Data Portal. *Nat Commun* 2022 — PMID:35501320
- NIH Genomic Data Sharing Policy — <https://sharing.nih.gov/genomic-data-sharing-policy>

When you use 4DN data, the portal asks that you cite the 4DN white paper and the portal
paper, acknowledge the generating lab, and — for unpublished sets — contact that lab about
coordinated publication.
