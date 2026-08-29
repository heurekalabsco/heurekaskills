---
name: bioagent-bench
description: Access BioAgent Bench, ten end-to-end bioinformatics pipeline tasks where an agent is handed raw inputs and a written objective and must return one deliverable file. Fetch the task index and per-task inputs from an open OSF deposit that needs no account, with the truth files projected out on load. Covers RNA-seq, single-cell, variant calling, metagenomics and comparative genomics.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, bioinformatics, agents, evaluation, public-data]
covers: [bioagent bench, benchmark, agent evaluation, bioinformatics pipeline, rna-seq, differential expression, deseq2, single-cell, scrna-seq, variant calling, giab, na12878, metagenomics, kraken, viral metagenomics, comparative genomics, phylogenetics, transcript quantification, alzheimer, mouse model, cystic fibrosis, escherichia coli, candida parapsilosis, micrococcus, skeletal muscle, osf, ground truth, contamination, perturbation, robustness]
access: [open]
datasets: [https://raw.githubusercontent.com/bioagent-bench/bioagent-bench/6d098b602b8a8fdc33a9d25e410a502be7ed9ce0/src/task_metadata.json, https://files.de-1.osf.io/v1/resources/jfsme/providers/osfstorage/?meta=]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: >-
    benchmark repository at commit 6d098b6 (master, 2026-08-11, no tags and no releases) and
    the OSF deposit jfsme as listed that day (41 files, 20.92 GB) / Python 3.12.8 / standard
    library, plus requests 2.34.2 and click 8.5.0 for the upstream downloader
  executed: 9
  unverified: 0
  unverified_reason: >-
    Every runnable block executed in one directory in document order. Nothing here runs a
    model or a pipeline, so no provider key was needed. Coverage inside the blocks is the
    thing to read rather than the count — the archive sweep opens the four smallest task
    archives, and three more were opened separately, leaving deseq, giab and metagenomics
    characterised from deposit metadata rather than from their contents.
---
# BioAgent Bench

**Ten end-to-end bioinformatics tasks.** Each hands over a study's raw inputs and a written
objective — find the causal variant, quantify the transcripts, name the viral species — and
expects **one deliverable file** back, in a column schema the prompt states. Submissions are
graded against truth files the maintainers produced by running the pipeline themselves.

That is a different shape from the question-answering benchmarks it sits beside. The unit of
work is a pipeline run: read FASTQs, choose an aligner, pick thresholds, write a table.

This skill establishes what is reachable where, gets you the index and a task's inputs, and
keeps the answer key out of reach. It does not run an evaluation.

## Where it lives, and where it does not

Nothing here needs an account, a token or a click-through. The routes differ in what they hold
and in what governs reuse, so read the whole table before treating any one of them as "the
benchmark".

| route | holds | licence |
|---|---|---|
| `bioagent-bench/bioagent-bench` on GitHub, branch `master` | task prompts, the index, the downloader, the reproduction recipes | **CC-BY-4.0**, `LICENSE` is verbatim CC BY 4.0 |
| OSF project `jfsme` | every byte you actually analyse — 41 files, 20.92 GB of inputs, references and truth files | **none declared** |
| `genome-idx.s3.amazonaws.com` | one 12.0 GB Kraken 2 index, the metagenomics reference | the Kraken 2 project's own terms |
| `bioagent-bench/bioagent-experiments` on GitHub | the perturbation generators, harness and judge packages, published result tables | **no `LICENSE` file** |
| Hugging Face `BioAgentBench/BioAgentBench` | nothing — see below | not applicable |

There is **no tag and no release**. Pin the commit; `6d098b6` is what everything below was
checked against.

There is also **no paper**. The experiments repository refers to one, but nothing is on arXiv,
bioRxiv or Europe PMC under this name as of 2026-08-28, so there is no DOI to cite yet — cite
the repository and the commit.

### The 401 that is not a gate

A search for this benchmark on Hugging Face lands on a `401`, which reads as "gated, ask for
access". It is not. Hugging Face answers `401` for any repository you may not know the existence
of, and that covers *does not exist* as well as *private*. Run the controls:

```python
import json, time, urllib.request, urllib.error

def probe(url, tries=4):
    req = urllib.request.Request(url, headers={"User-Agent": "bioagent-bench-skill/1.0"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(2 ** i); continue          # api.osf.io 500s intermittently
            try:    return e.code, json.loads(e.read() or b"{}")
            except Exception: return e.code, {}

ROUTES = [
    ("benchmark repo",  "https://api.github.com/repos/bioagent-bench/bioagent-bench"),
    ("experiments repo","https://api.github.com/repos/bioagent-bench/bioagent-experiments"),
    ("data deposit",    "https://api.osf.io/v2/nodes/jfsme/"),
    ("claimed HF set",  "https://huggingface.co/api/datasets/BioAgentBench/BioAgentBench"),
    ("HF name that cannot exist",
                        "https://huggingface.co/api/datasets/no-such-org-9x7/no-such-dataset"),
    ("HF set that really is gated",
                        "https://huggingface.co/api/datasets/EdisonScientific/labbench2"),
]

for label, url in ROUTES:
    code, body = probe(url)
    if "api.github.com" in url:
        lic = (body.get("license") or {}).get("spdx_id") or "none declared"
        note = f"branch {body.get('default_branch')}, licence {lic}"
    elif "api.osf.io" in url:
        a = body.get("data", {}).get("attributes", {})
        note = f"public {a.get('public')}, licence {a.get('node_license') or 'none declared'}"
    elif code == 200:
        note = f"exists, gated={body.get('gated')!r}"
    else:
        note = f"body {json.dumps(body)}"
    print(f"{code}  {label:<28} {note}")
```

Run 2026-08-28:

```
200  benchmark repo               branch master, licence CC-BY-4.0
200  experiments repo             branch master, licence none declared
200  data deposit                 public True, licence none declared
401  claimed HF set               body {"error": "Invalid username or password."}
401  HF name that cannot exist    body {"error": "Invalid username or password."}
200  HF set that really is gated  exists, gated='auto'
```

The claimed dataset and a name assembled at random return the **same status and the same body**.
A dataset that genuinely is gated returns `200` and says so in a `gated` field. The Hugging Face
organisation `BioAgentBench` returns `404`, and `?author=BioAgentBench` returns `[]`. So the
conclusion is not "gated" but **"never published there"** — and the repository's own
`publish_hf_datasets.py` agrees, because it takes a required `--namespace` argument. It is a
tool for pushing to *your* account, not a pointer to an upstream release.

Two lessons that generalise past this benchmark. **A `401` is not evidence of a gate unless a
name you invented returns something different.** And **do not conclude "blocked" from one
route** — the thing that looked closed here was simply somewhere else.

## Two licences, not one

Ask the question twice, because the answers differ.

**The benchmark's own contribution is CC-BY-4.0.** Prompts, the task index, the downloader and
the reproduction recipes all sit in the repository under a verbatim CC BY 4.0 `LICENSE`, and the
README asks for attribution to *BioAgent Bench contributors* with a link and a statement of
changes.

**The data is not covered by that.** Every byte you analyse comes from the OSF deposit, which is
public, needs no account, and declares **no licence at all** — the block above reads
`node_license` straight off the OSF API and it is null. Upstream says as much itself:

> Third-party datasets and other materials referenced or downloaded by this project remain
> subject to their original owners' terms and licenses.

So the practical rule is: **fetch it and analyse it; do not redistribute it.** Public posting
grants access, not reuse terms. If you need to mirror, republish or ship a derivative, trace the
original accession first — they differ per task and several are unclear:

| task | inputs trace back to |
|---|---|
| alzheimer-mouse | GEO `GSE168137`, `GSE161904`, `GSE118523` |
| comparative-genomics | RefSeq `GCF_002008305.4`, `GCF_003691675.1`, `GCF_005280335.1`, `GCF_020097155.1`, `GCF_023573625.1` |
| cystic-fibrosis | CEPH pedigree 1463 (Complete Genomics Diversity Panel), plus ClinVar `20250521` |
| deseq | SRA `SRR1278968`–`SRR1278973`, *Candida parapsilosis* |
| evolution | an *E. coli* experimental-evolution teaching set |
| giab | NIST Genome in a Bottle `NA12878` / `HG001`, GRCh38 |
| metagenomics | Cuatro Ciénegas Basin samples `JC1A` and `JP4D` |
| single-cell | GEO `GSM6611295`–`GSM6611300`, human skeletal muscle |
| transcript-quant | reads simulated from GEUVADIS `ERR188297` |
| viral-metagenomics | a 2017 dolphin faecal virome study |

Five of these were routed through teaching repositories whose own licences are **MIT, MIT, MIT,
`NOASSERTION` and nothing at all** — checked 2026-08-28. A permissive licence on the tutorial
that used the data is not a licence on the data.

The text of this skill is original and CC-BY-4.0. Everything quoted from upstream is marked as a
quotation.

## The contamination boundary, and why it is mechanical here

This benchmark carries held-out answers, and two distinct things must stay away from an agent
under test:

1. **The truth files.** The index nests them under `download_urls.results`. That is a key name,
   so the boundary is a `dict.pop`, not a habit — project the key out the moment you load the
   index and nothing downstream can reach it by accident.
2. **The reproduction recipes.** In the repository, everything under `tasks/<task>/` — the
   `run_*` scripts in shell, Python and R, plus `Dockerfile` and `environment.yml` — is the
   pipeline that *produced* those truth files, and the environment it ran in. Upstream is blunt
   about it:

   > Obviously don't prompt the LLM with the scripts used for reproducing the eval files.

   That is also a name test — the whole `tasks/` tree of the repository is off-limits to the
   agent, and only `src/` is not.

Both boundaries are structural rather than advisory, which is the good case. Use them: clone the
repository for the downloader, hand the agent nothing from `tasks/`, and never fetch `results/`
into a directory a run can see.

**Publishing either one contaminates the benchmark for everyone.** A truth file or a
reproduction script pasted into a public issue, a blog post or a training corpus cannot be
withdrawn, and every later score on the affected task becomes unreadable. This skill fetches
neither, and the sizes it reports for truth files come from deposit metadata rather than from
opening them.

One subtlety that is easy to miss: **eight of the ten prompts embed an example output row**, and
at least one of those rows reads as a genuine row of the expected answer rather than an invented
one. Those examples are part of the prompt by design and the agent is meant to see them. Do not
treat reproducing the example row as evidence of anything.

## Try it

**Data.** The task index — `src/task_metadata.json` in the benchmark repository at commit
`6d098b6`, CC-BY-4.0, 14 kB, no account — and the top-level listing of OSF project `jfsme`,
public, no account, no licence declared. Both were reachable on 2026-08-28. Neither request
touches data or a truth file; together they move about 20 kB.

**Run.** In an empty directory, with nothing installed:

```python
import json, urllib.request

COMMIT = "6d098b602b8a8fdc33a9d25e410a502be7ed9ce0"          # master, 2026-08-11
INDEX = ("https://raw.githubusercontent.com/bioagent-bench/bioagent-bench/"
         f"{COMMIT}/src/task_metadata.json")
DEPOSIT = ("https://files.de-1.osf.io/v1/resources/jfsme/"
           "providers/osfstorage/?meta=")

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "bioagent-bench-skill/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

# --- the index, with the answer key projected out on load -------------------
raw = fetch(INDEX)
withheld, tasks = 0, []
for t in raw:
    urls = dict(t["download_urls"])
    withheld += len(urls.pop("results", []))          # truth files: never carried forward
    tasks.append({**t, "download_urls": urls})

assert all("results" not in t["download_urls"] for t in tasks), "answer key leaked"
assert all(t["download_urls"]["data"] for t in tasks), "a task with no input data"

print(f"tasks {len(tasks)}   answer-key URLs withheld {withheld}")

# --- the deposit those URLs point into --------------------------------------
folders = sorted(e["attributes"]["name"] for e in fetch(DEPOSIT)["data"]
                 if e["attributes"]["kind"] == "folder")
ids = sorted(t["task_id"] for t in tasks)
print(f"deposit folders {len(folders)}   match task ids: {folders == ids}")

print(f"\n{'task_id':<21}{'data':>5}{'ref':>5}  deliverable")
for t in tasks:
    d = t["download_urls"]
    kind = ("CSV" if "CSV file" in t["task_prompt"]
            else ".tsv file" if ".tsv" in t["task_prompt"]
            else ".vcf.gz file")
    print(f"{t['task_id']:<21}{len(d['data']):>5}{len(d['reference_data']):>5}  {kind}")
```

**Expect.**

```
tasks 10   answer-key URLs withheld 10
deposit folders 10   match task ids: True

task_id               data  ref  deliverable
alzheimer-mouse          1    0  CSV
comparative-genomics     1    1  CSV
cystic-fibrosis          1    1  CSV
deseq                    6    1  CSV
evolution                1    0  CSV
giab                     1    1  .vcf.gz file
metagenomics             1    1  CSV
single-cell              1    1  CSV
transcript-quant         1    0  .tsv file
viral-metagenomics       1    2  CSV
```

*Invariants* — a failure means this page is wrong, not that upstream moved. Both assertions must
hold: the projection removes `results` from every task, and no task has an empty `data` list.
The deposit's top-level folder names must equal the task ids exactly.

*Observed at commit `6d098b6`, deposit read 2026-08-28* — ten tasks; ten withheld answer-key
URLs, one per task; `deseq` the only task with more than one input archive; three tasks needing
no reference data. These move when upstream adds a task, and a mismatch is drift to look into.

## Reconciling the index against the deposit

Counting one side gets you the wrong answer, in both directions. This checks both, and writes
`reconciled.json` for the blocks that follow.

```python
import json, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

COMMIT  = "6d098b602b8a8fdc33a9d25e410a502be7ed9ce0"
INDEX   = ("https://raw.githubusercontent.com/bioagent-bench/bioagent-bench/"
           f"{COMMIT}/src/task_metadata.json")
WB      = "https://files.de-1.osf.io/v1/resources/jfsme/providers/osfstorage/"
UA      = {"User-Agent": "bioagent-bench-skill/1.0"}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)

def walk(url, prefix=""):
    out = []
    for e in get(url + "?meta=")["data"]:
        a = e["attributes"]; p = prefix + "/" + a["name"]
        if a["kind"] == "folder":
            out += walk(WB + a["path"].strip("/") + "/", p)
        else:
            out.append({"path": p, "id": a["path"].strip("/"), "size": a["sizeInt"]})
    return out

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, hdrs, newurl):
        raise urllib.error.HTTPError(req.full_url, code, newurl, hdrs, None)

def file_id(url):
    """An index URL may carry the file id or a short OSF GUID. Only the redirect knows."""
    try:
        urllib.request.build_opener(NoRedirect).open(
            urllib.request.Request(url, headers=UA), timeout=60)
    except urllib.error.HTTPError as e:
        if 300 <= e.code < 400:
            return e.reason.rstrip("/").rsplit("/", 1)[-1]
        raise
    return None

deposit = walk(WB)
index   = get(INDEX)
refs    = [(t["task_id"], cat, e["filename"], e["url"])
           for t in index for cat, es in t["download_urls"].items() for e in es]
osf_refs = [r for r in refs if "osf.io" in r[3]]

with ThreadPoolExecutor(8) as pool:
    ids = dict(zip((r[3] for r in osf_refs), pool.map(file_id, (r[3] for r in osf_refs))))

by_id = {f["id"]: f for f in deposit}
print(f"deposit   {len(deposit)} files, {sum(f['size'] for f in deposit)/1e9:.2f} GB")
print(f"index     {len(refs)} URLs — {len(osf_refs)} on the deposit, "
      f"{len(refs)-len(osf_refs)} elsewhere")

dangling = [r for r in osf_refs if ids[r[3]] not in by_id]
print(f"referenced but absent from the deposit   {len(dangling)}")
used = {ids[r[3]] for r in osf_refs}
orphans = sorted((f for f in deposit if f["id"] not in used), key=lambda f: f["path"])
print(f"present in the deposit, referenced by nothing   {len(orphans)}")
for f in orphans:
    print(f"    {f['size']:>6} B  {f['path']}")
renamed = [(r[3], ids[r[3]]) for r in osf_refs if ids[r[3]] not in r[3]]
print(f"index URLs whose file id is not the id in the URL   {len(renamed)}  {renamed}")
mismatch = [(r[0], r[2], by_id[ids[r[3]]]["path"]) for r in osf_refs
            if ids[r[3]] in by_id and by_id[ids[r[3]]]["path"].rsplit("/", 1)[1] != r[2]]
print(f"filename disagreements index vs deposit   {len(mismatch)}")
json.dump({"deposit": deposit, "index": index, "ids": ids}, open("reconciled.json", "w"))
```

2026-08-28, about 16 seconds:

```
deposit   41 files, 20.92 GB
index     33 URLs — 32 on the deposit, 1 elsewhere
referenced but absent from the deposit   0
present in the deposit, referenced by nothing   9
      1261 B  /comparative-genomics/data_desc.MD
      1768 B  /cystic-fibrosis/data_desc.MD
      1437 B  /deseq/data_desc.MD
      1576 B  /evolution/data_desc.MD
       971 B  /giab/data_desc.MD
      1252 B  /metagenomics/data_desc.MD
      2771 B  /single-cell/data_desc.MD
       519 B  /transcript-quant/data_desc.MD
       883 B  /viral-metagenomics/data_desc.MD
index URLs whose file id is not the id in the URL   1  [('https://osf.io/download/v8egn/', '683f0c5a105cc712f553945f')]
filename disagreements index vs deposit   0
```

**Nothing is broken, and nine files are invisible.** The forward direction is clean — every
index URL resolves to a real file, and every filename agrees. The reverse direction is where the
nine per-task notes turn up, reachable only by listing the deposit. There are nine for ten tasks;
`alzheimer-mouse` has none.

**One URL cannot be matched by string comparison.** `osf.io/download/v8egn/` is a short OSF GUID,
not a file id, and it resolves to `683f0c5a105cc712f553945f`. Match the index to the deposit by
parsing ids out of the URLs and you get 31 of 32 plus one phantom orphan. Follow the redirect.

## What a full pull costs

```python
import json
r = json.load(open("reconciled.json"))
by_id = {f["id"]: f for f in r["deposit"]}
size  = lambda url: by_id[r["ids"][url]]["size"] if url in r["ids"] else None

def human(b):
    if b is None: return "off-deposit"
    if b == 0:    return "-"
    for u, s in (("GB", 1e9), ("MB", 1e6), ("kB", 1e3)):
        if b >= s: return f"{b/s:.1f} {u}"
    return f"{b} B"

print(f"{'task':<21}{'inputs':>12}{'reference':>12}{'truth':>10}")
tot = [0, 0, 0]
for t in r["index"]:
    row = []
    for i, cat in enumerate(("data", "reference_data", "results")):
        vals = [size(e["url"]) for e in t["download_urls"][cat]]
        row.append(None if any(v is None for v in vals) else sum(vals))
        tot[i] += sum(v for v in vals if v is not None)
    print(f"{t['task_id']:<21}{human(row[0]):>12}{human(row[1]):>12}{human(row[2]):>10}")
print(f"{'on the deposit':<21}{human(tot[0]):>12}{human(tot[1]):>12}{human(tot[2]):>10}")
print("plus one 12.0 GB Kraken 2 index on S3, the metagenomics reference")
```

Read 2026-08-28:

```
task                       inputs   reference     truth
alzheimer-mouse            3.6 MB           -     746 B
comparative-genomics       4.0 MB    441.3 MB     693 B
cystic-fibrosis           34.8 MB    163.8 MB     501 B
deseq                     13.1 GB      4.6 MB   19.1 kB
evolution                431.7 MB           -    1.1 kB
giab                       4.1 GB    890.3 MB  132.1 MB
metagenomics             448.3 MB off-deposit     825 B
single-cell               65.1 MB      2.5 MB    6.4 kB
transcript-quant           9.6 MB           -    1.8 kB
viral-metagenomics        96.6 MB    985.0 MB     249 B
on the deposit            18.3 GB      2.5 GB  132.1 MB
plus one 12.0 GB Kraken 2 index on S3, the metagenomics reference
```

`download --all --dest ... --reference` is therefore roughly **33 GB** once the off-deposit
Kraken index is counted, and two tasks are most of it. Four tasks come in under 100 MB of
inputs, which is where to start.

Two things the numbers say that prose would not. **The truth files are tiny** — under 20 kB for
nine of ten tasks, because the deliverable is a small summary table; `giab` is the exception at
132 MB because its answer is a variant set. And **`metagenomics` reads `off-deposit`** because
its reference is the only URL in the whole index that does not point at OSF. That archive is
named `k2_standard_16gb`, and the `16gb` is the index's memory ceiling rather than its size: the
download is **12.0 GB**.

## Get the files

Two routes. Take the second unless you specifically want the upstream tool.

### The upstream downloader

The repository ships a Click CLI. It imports only `requests` and `click`, so the project's full
dependency set — which also pulls pandas, datasets and pyarrow — is more than the downloader
needs:

```bash
python3 -m venv .venv
./.venv/bin/pip -q install "requests>=2.32.4" "click>=8.1.7"
git clone https://github.com/bioagent-bench/bioagent-bench.git bench
git -C bench checkout 6d098b602b8a8fdc33a9d25e410a502be7ed9ce0
./.venv/bin/python bench/src/dataset.py --metadata bench/src/task_metadata.json list-tasks
./.venv/bin/python bench/src/dataset.py --metadata bench/src/task_metadata.json \
    download --task transcript-quant --dest cli-data
find cli-data -type f | sort
```

Ends with, 2026-08-28:

```
cli-data/transcript-quant/data/reads_1.fq.gz
cli-data/transcript-quant/data/reads_2.fq.gz
cli-data/transcript-quant/data/transcriptome.fa
```

Four things about that command line are not guessable:

- **The subcommand is `list-tasks`, not `list`.** `list` exits 2 with `No such command`.
- **`--metadata` and `--dest` are group-level options and must come before the subcommand.**
  `download` also has its own `--dest`, so there are two spellings at two levels.
- **`--metadata` defaults to the relative path `src/task_metadata.json`**, so running from
  anywhere but the repository root raises `FileNotFoundError` unless you pass it.
- **`download --task X` never fetches truth files.** Only `--results`, or the separate
  `download-all-results` command, does. The default is the safe one, which is the right default;
  do not add the flag out of curiosity.

### Index-driven, no clone

Enough to get a task's inputs, with the projection applied and the archive hazards handled:

```python
import json, tarfile, urllib.request
from pathlib import Path

TASK    = "alzheimer-mouse"          # 3.6 MB of inputs, the smallest of the ten
COMMIT  = "6d098b602b8a8fdc33a9d25e410a502be7ed9ce0"
INDEX   = ("https://raw.githubusercontent.com/bioagent-bench/bioagent-bench/"
           f"{COMMIT}/src/task_metadata.json")
UA      = {"User-Agent": "bioagent-bench-skill/1.0"}

with urllib.request.urlopen(urllib.request.Request(INDEX, headers=UA)) as r:
    index = json.load(r)

task = next(t for t in index if t["task_id"] == TASK)
urls = dict(task["download_urls"])
print(f"withholding {len(urls.pop('results'))} answer-key URL(s) for {TASK}")

def place(url, name, into):
    """Archives disagree about their own layout — some carry a top-level data/ or
    reference/ directory, some do not — so normalise to basenames under `into`."""
    into.mkdir(parents=True, exist_ok=True)
    tmp = into / name
    urllib.request.urlretrieve(url, tmp)
    if not tarfile.is_tarfile(tmp):
        print(f"  {tmp}  ({tmp.stat().st_size:,} B, not an archive)")
        return
    with tarfile.open(tmp) as tar:
        members = [m for m in tar.getmembers() if m.isfile()]
        seen = {}
        for m in members:
            base = Path(m.name).name
            if base in seen:
                raise SystemExit(f"collision: {m.name} and {seen[base]} share a basename")
            seen[base] = m.name
            m.name = base
            tar.extract(m, path=into, filter="data")
    tmp.unlink()
    for m in sorted(seen):
        print(f"  {into/m}  ({(into/m).stat().st_size:,} B)")

root = Path("bench-data") / TASK
for cat, sub in (("data", "data"), ("reference_data", "reference")):
    for e in urls[cat]:
        place(e["url"], e["filename"], root / sub)
```

```
withholding 1 answer-key URL(s) for alzheimer-mouse
  bench-data/alzheimer-mouse/data/DEA_PS3O1S.csv  (6,338,318 B)
  bench-data/alzheimer-mouse/data/GSE161904_Raw_gene_counts_cortex.txt  (1,622,885 B)
  bench-data/alzheimer-mouse/data/GSE168137_countList.txt  (4,388,517 B)
```

Three differences from the upstream downloader, each deliberate:

- **`filter="data"`** on extraction. Upstream calls `tar.extract` with no filter, which raises a
  `DeprecationWarning` today and changes behaviour under Python 3.14. It also means a crafted
  archive could write outside the destination.
- **Collisions are fatal, not silent.** Both implementations rewrite each member to its
  basename, which is what makes the heterogeneous archive layouts land in one place — but two
  members sharing a basename would then overwrite each other without a word. Seven of the ten
  archives were opened and none collides today; the guard is for the eighth.
- **No resume-by-existence.** Upstream returns success for any path that already exists, so an
  interrupted download is treated as complete on the next run. There are **no checksums anywhere
  in this benchmark**, so nothing downstream would notice. Delete a partial file rather than
  re-running over it.

### The per-task notes nobody references

The deposit carries a short `data_desc.MD` beside most tasks, describing the files. **The index
references none of them**, so neither downloader ever fetches one. They are worth having:

```python
import json, urllib.request
from pathlib import Path

WB = "https://files.de-1.osf.io/v1/resources/jfsme/providers/osfstorage/"
r  = json.load(open("reconciled.json"))
used = set(r["ids"].values())
notes = [f for f in r["deposit"] if f["id"] not in used]

out = Path("bench-data/_notes"); out.mkdir(parents=True, exist_ok=True)
for f in sorted(notes, key=lambda x: x["path"]):
    task = f["path"].strip("/").split("/")[0]
    dest = out / f"{task}.md"
    urllib.request.urlretrieve(WB + f["id"], dest)
    first = dest.read_text().splitlines()[0]
    print(f"{dest}  {dest.stat().st_size:>5} B  {first}")
```

```
bench-data/_notes/comparative-genomics.md   1261 B  # Comparative Genomics Dataset
bench-data/_notes/cystic-fibrosis.md   1768 B  # Cystic Fibrosis Genetic Analysis Dataset
bench-data/_notes/deseq.md   1437 B  # RNA-Seq Differential Expression Dataset
bench-data/_notes/evolution.md   1576 B  # Experimental Evolution Dataset
bench-data/_notes/giab.md    971 B  # GIAB Variant Calling Dataset
bench-data/_notes/metagenomics.md   1252 B  # Metagenomics Dataset
bench-data/_notes/single-cell.md   2771 B  # Single Cell RNA-seq Dataset
bench-data/_notes/transcript-quant.md    519 B  # Transcript Quantification Dataset
bench-data/_notes/viral-metagenomics.md    883 B  # Viral Metagenomics Dataset
```

They describe inputs only and give nothing away.

## Ten tasks, and what the prompts actually specify

Nine of the ten prompts name the deliverable's columns and eight embed an example header row.
Where both are present they should agree, and they do not always:

```python
import json, re, urllib.request

COMMIT = "6d098b602b8a8fdc33a9d25e410a502be7ed9ce0"
INDEX  = ("https://raw.githubusercontent.com/bioagent-bench/bioagent-bench/"
          f"{COMMIT}/src/task_metadata.json")
with urllib.request.urlopen(urllib.request.Request(
        INDEX, headers={"User-Agent": "bioagent-bench-skill/1.0"})) as r:
    index = json.load(r)

def declared(p):
    """Column names the prompt names in prose. Quoting is inconsistent — one task
    closes a name with a stray apostrophe — so take the quoted run and clean it."""
    m = re.search(r"columns:\s*(.*)", p)
    if not m: return []
    seg = re.split(r"<example>|\bExample\b|\n", m.group(1))[0]
    names = re.findall(r"'([^']+)'", seg)
    if not names:                                    # one task quotes nothing
        names = [c.strip() for c in seg.strip(" .:").split(",") if c.strip()]
    return [n.strip().strip("',") for n in names]

def example_header(p):
    m = re.search(r"<example>(.*?)</example>", p, re.S)
    if not m: return []
    head = m.group(1).strip().splitlines()[0]
    return [c.strip() for c in re.split(r"\t|,", head) if c.strip()]

print(f"{'task':<21}{'out':>5}{'named':>7}{'example':>9}  headers agree")
for t in index:
    p   = t["task_prompt"]
    fmt = "CSV" if "CSV" in p else "TSV" if ".tsv" in p else "VCF" if ".vcf" in p else "?"
    d, e = declared(p), example_header(p)
    agree = "-" if not (d and e) else ("yes" if d == e else
            "case only" if [x.lower() for x in d] == [x.lower() for x in e] else "NO")
    print(f"{t['task_id']:<21}{fmt:>5}{len(d) or '-':>7}{len(e) or '-':>9}  {agree}")
```

```
task                   out  named  example  headers agree
alzheimer-mouse        CSV      4        4  case only
comparative-genomics   CSV      1        2  NO
cystic-fibrosis        CSV     16       16  yes
deseq                  CSV      4        -  -
evolution              CSV      7        8  NO
giab                   VCF      -        -  -
metagenomics           CSV      5        5  yes
single-cell            CSV      8        8  yes
transcript-quant       TSV      2        2  yes
viral-metagenomics     CSV      3        3  yes
```

**Five of ten agree exactly. None of the other five is a parser artefact.**

- `alzheimer-mouse` names `pathway` in prose and `Pathway` in its example. Compare headers
  case-sensitively and one of the two is wrong; the prompt does not say which.
- `comparative-genomics` reads as one name rather than two because its prose is
  `'cluster_number, 'consensus_annotation'` — the quotes are misplaced.
- `evolution` quotes seven of its eight names; the eighth is written `status'` with no opening
  quote. Its example header is uppercase where the prose is lowercase, so it is a case
  disagreement as well.
- `deseq` states its columns and ships no `<example>` block.
- `giab` names no columns at all — it is the one task whose deliverable is a `.vcf.gz` rather
  than a table.

None of this stops a human, and all of it stops a grader that string-matches headers. Normalise
case and whitespace before comparing, and read the prompt rather than only the column list.

## What is inside the archives

```python
import collections, json, os, tarfile, tempfile, urllib.request
from pathlib import Path

# The four smallest tasks — about 52 MB of transfer in total. Widen the list as
# far as `viral-metagenomics` (97 MB) if you want; the remaining four are 431 MB,
# 448 MB, 4.1 GB and 13.1 GB, so leave those alone unless you will analyse them.
SMALL = ["alzheimer-mouse", "comparative-genomics",
         "transcript-quant", "cystic-fibrosis"]
index = {t["task_id"]: t for t in json.load(open("reconciled.json"))["index"]}

for task in SMALL:
    url = index[task]["download_urls"]["data"][0]["url"]
    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as fh:
        tmp = Path(fh.name)
    urllib.request.urlretrieve(url, tmp)
    with tarfile.open(tmp) as tar:
        names = [m.name for m in tar.getmembers() if m.isfile()]
    tmp.unlink()
    tops = sorted({n.lstrip("./").split("/")[0] for n in names})
    counts = collections.Counter(os.path.basename(n) for n in names)
    dupes = [k for k, v in counts.items() if v > 1]
    def ext(n):
        p = Path(n)
        return "".join(p.suffixes[-2:]) if p.suffix == ".gz" else (p.suffix or "(none)")
    exts = collections.Counter(ext(n) for n in names)
    print(f"{task:<21}{len(names):>3} files  top level {tops}  collisions {len(dupes)}")
    print(f"{'':<21}    {dict(exts.most_common())}")
```

2026-08-28, about 52 MB of transfer:

```
alzheimer-mouse        3 files  top level ['data']  collisions 0
                         {'.txt': 2, '.csv': 1}
comparative-genomics   7 files  top level ['data']  collisions 0
                         {'.fna': 5, '.jsonl': 1, '.gff': 1}
transcript-quant       3 files  top level ['data']  collisions 0
                         {'.fq.gz': 2, '.fa': 1}
cystic-fibrosis        2 files  top level ['data']  collisions 0
                         {'.vcf': 1, '.txt': 1}
```

Seven of the ten input archives have been opened — the four above, plus `single-cell`,
`evolution` and `viral-metagenomics` separately. **Every one has a single `data/` top level and
zero basename collisions.**

| task | opened | what is inside |
|---|---|---|
| alzheimer-mouse | yes | 3 files; one of them is already a differential-expression table, not counts |
| comparative-genomics | yes | 5 genome FASTAs, 1 GFF, 1 assembly report |
| transcript-quant | yes | 2 FASTQ + 1 transcriptome FASTA |
| cystic-fibrosis | yes | 1 annotated VCF + 1 pedigree note |
| single-cell | yes | 18 files — six 10x samples, three files each |
| evolution | yes | 6 FASTQ — ancestor plus two evolved lines, paired |
| viral-metagenomics | yes | 2 FASTQ — one paired-end sample |
| deseq | no | 13.1 GB across six per-sample archives |
| giab | no | 4.1 GB |
| metagenomics | no | 448 MB |

Five of those observations change what a run should do.

**`comparative-genomics` ships five genomes and asks about four.** The README, the task
description and the prompt all say four organisms, and the quality filter the prompt states is
*present in all four*. The archive contains five complete *Micrococcus* chromosomes. "Present in
all N" is a different set for N=4 and N=5, so decide explicitly rather than letting the loader
decide.

**One GFF annotates one of those five.** The single `genomic.gff` covers `NZ_CP097650.1`, the
*Micrococcus yunnanensis* assembly, so the prompt's requirement of at least one high-confidence
annotation is anchored to a single genome rather than to all of them.

**`cystic-fibrosis` starts from an annotated VCF.** The input is already SnpEff-annotated, so
that task is variant *filtering* against a pedigree, not variant calling.

**`evolution` ships no reference genome** — its `reference_data` list is empty and the archive is
six FASTQs. The example row in its prompt carries assembler-style contig names, so the reference
is meant to be assembled from the ancestor reads rather than downloaded.

**Reference archives are laid out inconsistently.** `single-cell`'s reference archive carries a
top-level `./reference/` directory; `deseq`'s puts its two files at the archive root. That is why
both downloaders flatten to basenames — it normalises the inconsistency — and it is why
extracting an archive "as-is" and expecting a uniform tree will not work.

## The perturbation variants, and their licence

The most distinctive thing about this benchmark is not in the benchmark repository. A separate
repository holds an **ablation suite** that re-runs the same ten tasks under controlled damage —
generators for corrupted inputs, for decoy files planted in the working directory, and for prompt
bloat — alongside the harness and judge packages and the published result tables. That axis asks
a question completion rate cannot: **does the agent notice when it should stop?** By the
maintainers' own published tables, that is where results fall off hardest.

Three cautions before reaching for it.

- **It has no `LICENSE` file.** The access probe above reads `none declared`. Silence grants
  nothing, so read it and cite it, but do not vendor or redistribute it. That is a strictly
  tighter position than the CC-BY-4.0 benchmark repository, and the two are easy to conflate
  because they sit in the same organisation.
- **It names specific models and pins a judge model in its evaluation configs.** Read those
  identifiers out of the configs at the commit you are using rather than from any write-up,
  this one included — they move, and a stale identifier silently changes what a number means.
- **It needs an inference key and a container or conda runtime**, and its default local runtime
  gives the agent host access. Its own README says so and offers isolated runtimes instead. Use
  those.

## Pitfalls

- **`api.osf.io` is unreliable.** It returned `500` and read timeouts repeatedly during
  verification while the file-serving host was fine throughout. Use
  `files.de-1.osf.io/v1/resources/jfsme/providers/osfstorage/` for listings — it answered in
  under a second — and keep `api.osf.io` for the node metadata only it serves, with retries.
- **Deposit throughput is variable, and parallel transfers make it worse.** The same archives
  that arrived in seconds one hour crawled at a few kB/s the next while two downloads competed.
  Serialise, and do not treat a slow transfer as a hung one.
- **The deposit region is in the hostname.** `files.de-1.osf.io` is where this project's storage
  lives; another OSF project may sit elsewhere. Take it from the redirect rather than hard-coding
  it for a different deposit.
- **No checksums, anywhere.** Not in the index, not in the deposit listing, not in the archives.
  A truncated download is indistinguishable from a complete one. Compare against the deposit's
  `sizeInt` before trusting a file.
- **`download --all` is roughly 33 GB and has no dry run.** Pick tasks.
- **The task id and the repository directory disagree for one task.** The index and the CLI use
  `comparative-genomics`; the reproduction recipes live in `tasks/comparative-geno/`. Downloading
  into the repository therefore creates a *second* directory beside the first rather than filling
  it in. Download somewhere else.
- **Truth files are not promised to be correct.** Upstream says so directly, and warns that
  different tool versions and assumptions produce different results — several tasks are graded on
  overlap rather than equality. Treat a mismatch as a question, not a verdict.
- **A score is meaningless without the scaffold.** The maintainers' own tables show the same
  model swinging tens of points across harnesses. Report the harness, the commit and the task set
  with any number.

## What this skill will not do

It does not run an evaluation, score a submission, or fetch a truth file. It does not read
`tasks/` for anything except telling you to keep it away from the agent. And it does not promise
the data is yours to republish — see the licence section; that question is open and the deposit
does not answer it.

## Where this sits

BioAgent Bench is a leaf, and it is indexed nowhere else in this registry. The `biomedarena`
skill maps a harness registering 155 biomedical benchmarks; **this is not one of them** —
searching that registry's own benchmark list for it returns nothing, checked 2026-08-28. So
there is no index entry to defer to, and nothing here duplicates one.

Against the neighbours it is most easily confused with: `bixbench` is 205 short questions over
notebook capsules, `bixbench3` is twenty study-scale rebuilds graded on structured artifacts,
and this is ten canonical pipelines graded on one deliverable file each. Different sizes,
different graders, different maintainers. A score on one is not a score on another.

## Sources

- Benchmark repository — `github.com/bioagent-bench/bioagent-bench`, commit `6d098b6`
  (`master`, 2026-08-11), CC-BY-4.0.
- Data deposit — OSF project `jfsme`, public, no licence declared, listed 2026-08-28.
- Experiments repository — `github.com/bioagent-bench/bioagent-experiments`, `master`, no
  licence declared.
- No paper is published under this name as of 2026-08-28. Cite the repository and the commit.
