---
name: latch-bench
description: Access the LatchBio agent benchmarks — scBench, SpatialBench, EpiBench, VariantBench and two long-horizon variants. Fetch the 45 publicly released evaluations, read the deterministic grader contract declared inside each task file, and pull the AnnData analysis snapshots a task starts from. The full benchmarks are withheld upstream; this reaches the public sample.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, agents, evaluation, single-cell, public-data]
covers: [latchbio, scbench, spatialbench, epibench, variantbench, agent benchmark, agent evaluation, deterministic grading, verifiable benchmark, single-cell, scrna-seq, spatial transcriptomics, xenium, visium, curio, merfish, bd rhapsody, chromium, parse bio, atac-seq, chip-seq, cut&tag, dna methylation, epigenomics, variant calling, statistical genetics, anndata, h5ad, contamination, reproducibility]
access: [open]
platform: latch-bench
datasets: [https://raw.githubusercontent.com/latchbio/scbench/main/evals/manifest.json, https://raw.githubusercontent.com/latchbio/spatialbench/main/example_evals/manifest.json, https://raw.githubusercontent.com/latchbio/scbench/main/evals/dimensionality_reduction/dr_05_pca_preprocessing_sentinels.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: >-
    scbench 0bc3403, spatialbench 5042c4f, epibench 6bc01f1, variantbench a1cd271,
    scbench-long 99da791, spatialbench-long 7de13d3 (no repository carries a tag or release) /
    Python 3.12.8 / anndata 0.13.3
  executed: 9
  unverified: 0
  unverified_reason: >-
    All nine runnable blocks executed — the environment setup plus eight standalone Python
    blocks run against the live repositories and the live storage endpoint. Nothing here runs
    an agent, so no provider key was needed and no inference path was exercised.
---
# Latch benchmarks

A family of agent benchmarks built the same way: take a real analysis, snapshot its state at
the moment **before** one decisive step, hand an agent the snapshot and the question, and check
whether the number it returns is the one the analysis actually produced.

The distinguishing property is the last part. **Grading is a comparison, not a judgement.** Most
agent benchmarks in biology score with a language model reading the answer, which makes a score
noisy, expensive and impossible to reproduce exactly. Here the grader is a numeric interval, a
set overlap or an exact match — and, unusually, the entire rule is written down in the task file
under a permissive licence, so anyone can re-derive a published result offline. This page shows
how to do that, and measures how far the claim actually holds.

## What is public, and what is not

Every one of these repositories publishes a **sample**, not the benchmark. The maintainers
withhold the rest deliberately, to keep the tasks out of training corpora. The numbers in the
READMEs, the preprints and any coverage you have read describe the **full** set; the numbers
below describe what you can download.

Run this first. It reads each manifest and reconciles it against the repository's own file
listing, in both directions.

```python
import json, time, urllib.request

REPOS = {                              # repo -> folder holding manifest.json and the evals
    "scbench": "evals",
    "spatialbench": "example_evals",   # NOT `evals` -- this one alone is named differently
    "epibench": "evals",
    "variantbench": "evals",
    "scbench-long": "evals",
    "spatialbench-long": "evals",
}

def get_json(url, tries=4):
    """GitHub's tree endpoint truncates a chunked response often enough that a single
    attempt fails on the larger repositories. Retry, and read the whole body before parsing."""
    for n in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as fh:
                return json.loads(fh.read())
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(2 * (n + 1))

def entries(manifest, folder):
    """The manifest ships in TWO shapes. scbench and spatialbench are a bare JSON *list*
    keyed task/kit/eval_id and carrying no path, so the path has to be constructed. The
    other four are an object with an `evals` list keyed id/path. Code written against
    either shape alone reads nothing at all from the other, without erroring."""
    if isinstance(manifest, list):
        return {(e["eval_id"], f"{folder}/{e['task']}/{e['eval_id']}.json") for e in manifest}
    return {(e["id"], e["path"]) for e in manifest["evals"]}

print(f"{'repository':20} {'rows':>5} {'evals':>6} {'files':>6} {'orphan':>7} {'dangling':>9}")
total = 0
for repo, folder in REPOS.items():
    man = get_json(f"https://raw.githubusercontent.com/latchbio/{repo}/main/{folder}/manifest.json")
    ev = entries(man, folder)
    tree = get_json(f"https://api.github.com/repos/latchbio/{repo}/git/trees/main?recursive=1")
    assert not tree.get("truncated"), f"{repo}: tree truncated, counts would be wrong"
    onfile = {b["path"] for b in tree["tree"] if b["type"] == "blob"
              and b["path"].startswith(folder + "/") and b["path"].endswith(".json")
              and not b["path"].endswith(("manifest.json", "vocabulary.json"))}
    ref = {p for _, p in ev}
    rows = len(man if isinstance(man, list) else man["evals"])
    total += len(ev)
    print(f"{repo:20} {rows:5} {len(ev):6} {len(onfile):6} "
          f"{len(onfile - ref):7} {len(ref - onfile):9}")
print(f"{'TOTAL':20} {'':5} {total:6}")
```

Run 2026-08-28:

```
repository            rows  evals  files  orphan  dangling
scbench                  6      6      6       0         0
spatialbench            18     16     16       0         0
epibench                 7      7      7       0         0
variantbench             8      8      8       0         0
scbench-long             4      4      4       0         0
spatialbench-long        4      4      4       0         0
TOTAL                          45
```

**Count the unique ids, not the manifest rows.** SpatialBench's manifest carries 18 rows for 16
evaluations — two entries are byte-for-byte duplicates of two others, so `len(manifest)`
overcounts by two. Nothing else in the family disagrees with itself, and no reference is dangling.

Set that against what the projects say they hold:

| benchmark | full set, per its own README | public sample | subject |
|---|---:|---:|---|
| scBench | 195 | 6 | single-cell RNA-seq, 6 kits, 6 task categories |
| SpatialBench | 159 | 16 | spatial transcriptomics, 5 platforms, 7 task categories |
| EpiBench | 106 | 7 | ATAC-seq, ChIP-seq, CUT&Tag/CUT&RUN, DNA methylation |
| VariantBench | 118 | 8 | variant calling, statistical genetics, personal genomics |
| scBench-Long | not stated | 4 | long-horizon single cell |
| SpatialBench-Long | not stated | 4 | long-horizon spatial |

**The four that state a size come to 578 problems, of which 37 are published**; the two
long-horizon sets publish four each and state no total. Two of VariantBench's eight are marked
`benchmark: false` in its own manifest, and its README says they sit outside the 118 — so six
of its public eight are drawn from the scored set.

Three further repositories in the same organisation are **biosecurity** benchmarks — pathogen
surveillance, functional risk assessment, and a paired refusal/red-team set. They share this
layout and this grader contract. This skill deliberately does not document them, and routing an
agent into dual-use evaluation material is not something a general registry should make easy.

## Two licences, and neither one covers the data

Read the LICENSE body. GitHub's classifier is wrong here in both directions, and so is the
common summary of it.

- **scBench and SpatialBench** carry the canonical Apache-2.0 text plus `Copyright 2024 Latch
  Bio`. GitHub reports Apache-2.0. This is the straightforward case.
- **EpiBench, VariantBench, scBench-Long and SpatialBench-Long** carry a *modified* Apache-2.0
  and GitHub reports `NOASSERTION`. The modification is real, not cosmetic: the file is
  re-wrapped, it **omits the copyright statement entirely** so no licensor is named, it stops at
  `END OF TERMS AND CONDITIONS` with no appendix, and in the patent grant it drops the
  `(except as stated in this section)` qualifier while keeping the litigation-termination
  sentence that qualifier refers to. Every substantive permission of Apache-2.0 is present and
  the deviation runs toward the licensee, so a reader has a route; it is not the verbatim text,
  and anyone whose counsel diffs licence files should be told which four files these are.

Neither licence covers the material a task actually operates on. Every evaluation points at its
data through an opaque handle into LatchBio's own storage, not a URL, and **no eval file records
where that data came from**: across all 45, four accession-like strings appear anywhere, and
three of those are only inside an eval's own name. The snapshots derive from published studies
whose terms are set by those studies. Fetch them, work with them in place, and do not mirror or
redistribute them — you cannot establish what you would be redistributing.

**The shared grader library is not usable.** `latch-eval-tools`, which the READMEs point to for
grader implementations, has a LICENSE reading `© LatchBio LLC. All rights reserved.` A sibling
repository holding earlier graders is archived with no LICENSE at all, and `txbench-pp`, a
seventh analysis benchmark in the same family, has none either. So the one integration that
would cover the whole family is the one piece nothing can be built on. That turns out not to
matter, for the reason the next two sections set out: the grading **rule** is data, published
under the benchmark's own permissive licence, and only the code that executes it is not.

**No repository in the family carries a tag or a release.** `main` is the only reference point
and it can move under you. Record the commit you read, as this page does.

## The eval file, minus the answer key

One JSON object per task. Three of its fields must never be printed, pasted or committed
anywhere public — two hold the answer, one is the contamination tripwire.

```python
import collections, json, urllib.request

REPOS = {"scbench": "evals", "spatialbench": "example_evals", "epibench": "evals",
         "variantbench": "evals", "scbench-long": "evals", "spatialbench-long": "evals"}
RAW = "https://raw.githubusercontent.com/latchbio"

# `grader`/`graders` hold the ground truth; `canary` is the leak-detection string.
GRADED = ("grader", "graders", "canary")

def get_json(url):
    with urllib.request.urlopen(url, timeout=60) as fh:
        return json.loads(fh.read())

def paths(repo, folder):
    man = get_json(f"{RAW}/{repo}/main/{folder}/manifest.json")
    if isinstance(man, list):
        return sorted({f"{folder}/{e['task']}/{e['eval_id']}.json" for e in man})
    return sorted({e["path"] for e in man["evals"]})

def safe(ev):
    """Project to the fields that carry no answer. Everything downstream works off this,
    so a stray print() cannot leak a ground truth. Cheaper than auditing every later line."""
    return {k: v for k, v in ev.items() if k not in GRADED}

evals, withheld = [], collections.Counter()
for repo, folder in REPOS.items():
    for p in paths(repo, folder):
        ev = get_json(f"{RAW}/{repo}/main/{p}")
        for k in GRADED:
            if k in ev:
                withheld[k] += 1
        evals.append((repo, safe(ev)))

fields = collections.Counter(k for _, e in evals for k in e)
print(f"{len(evals)} evals loaded, projected to safe fields\n")
print("field present on n evals:")
for k, n in fields.most_common():
    print(f"  {k:12} {n:3}/{len(evals)}")
print("\nwithheld, never printed:")
for k, n in withheld.most_common():
    print(f"  {k:12} {n:3}/{len(evals)}")

# `metadata` is where the useful axes live -- and it is not uniform across the family.
md = collections.Counter()
for repo, e in evals:
    md[tuple(sorted(e.get("metadata", {})))] += 1
print("\nmetadata key sets:")
for k, n in md.most_common():
    print(f"  {n:3}x {list(k)}")
```

Run 2026-08-28:

```
45 evals loaded, projected to safe fields

field present on n evals:
  data_node     45/45
  id            45/45
  metadata      45/45
  task          45/45
  notes         30/45

withheld, never printed:
  canary        41/45
  grader        28/45
  graders        2/45

metadata key sets:
   23x ['eval_type', 'kit', 'task', 'time_horizon']
    5x ['eval_type', 'kit', 'task', 'time_horizon', 'timeout_s']
    4x ['assay', 'eval_type', 'kit', 'task', 'time_horizon']
    3x ['eval_type', 'failure_mode_taxonomy_version', 'failure_modes', 'kit', 'task', 'time_horizon']
    3x ['eval_type', 'kit', 'modules', 'task', 'time_horizon']
    3x ['graded_biological_result', 'kit', 'task', 'time_horizon']
    1x ['eval_type', 'failure_mode_taxonomy_version', 'failure_modes', 'kit', 'task', 'time_horizon', 'timeout_s']
    1x ['assay', 'eval_type', 'failure_mode_taxonomy_version', 'failure_modes', 'kit', 'task', 'time_horizon']
    1x ['eval_type', 'kit', 'modules', 'task', 'time_horizon', 'version']
    1x ['graded_biological_result']
```

`id`, `task` (the prompt), `metadata` and `data_node` are on every eval. `notes` is on two
thirds. `metadata` is the field to be careful with: ten different key sets across 45 files, and
`eval_type` — the field a filter would key on — is missing from four and is the constant
`"scientific"` on the other 41. It has never distinguished anything.

**There is no directory-level split between safe and graded material here.** In some benchmarks
the answer lives in a separate folder, so avoiding it is a path test. Here the answer sits in
the same object as the prompt, so the boundary is the projection above and nothing enforces it
for you. Apply it once at load and work off the result.

Four evals carry no `canary`. That is an omission upstream, not permission — treat every task
in the family as canaried, and **never reproduce a canary value in a public document**. Doing
so is what destroys its only function, for everyone, permanently.

## The grader contract

```python
import collections, json, urllib.request

REPOS = {"scbench": "evals", "spatialbench": "example_evals", "epibench": "evals",
         "variantbench": "evals", "scbench-long": "evals", "spatialbench-long": "evals"}
RAW = "https://raw.githubusercontent.com/latchbio"

def get_json(url):
    with urllib.request.urlopen(url, timeout=60) as fh:
        return json.loads(fh.read())

def paths(repo, folder):
    man = get_json(f"{RAW}/{repo}/main/{folder}/manifest.json")
    if isinstance(man, list):
        return sorted({f"{folder}/{e['task']}/{e['eval_id']}.json" for e in man})
    return sorted({e["path"] for e in man["evals"]})

def graders(ev):
    """`grader` (singular, one object) and `graders` (plural, a list) are both used, and
    `all_of` nests further graders under config.children. Handle all three or you undercount."""
    found = [ev["grader"]] if "grader" in ev else list(ev.get("graders", []))
    out = []
    while found:
        g = found.pop()
        out.append(g)
        found.extend(g.get("config", {}).get("children", []))
    return out

fam = collections.Counter()
tol = collections.Counter()
have = collections.Counter()
for repo, folder in REPOS.items():
    for p in paths(repo, folder):
        ev = get_json(f"{RAW}/{repo}/main/{p}")
        gs = graders(ev)
        have[repo] += 1 if gs else 0
        for g in gs:
            fam[g["type"]] += 1
            for t in g.get("config", {}).get("tolerances", {}).values():
                # `type` is the field you would switch on. Check what it actually varies over.
                tol[(t.get("type"), tuple(sorted(t)))] += 1

print("evals carrying a machine-readable grader:")
for r in REPOS:
    print(f"  {r:20} {have[r]}")
print(f"\ngrader families over {sum(fam.values())} grader objects:")
for k, n in fam.most_common():
    print(f"  {n:3}  {k}")
print("\ntolerance entries, by declared type and by actual keys:")
for (ty, keys), n in tol.most_common():
    print(f"  {n:3}  type={ty!r:12} keys={list(keys)}")
```

Run 2026-08-28:

```
evals carrying a machine-readable grader:
  scbench              6
  spatialbench         16
  epibench             0
  variantbench         8
  scbench-long         0
  spatialbench-long    0

grader families over 35 grader objects:
   27  numeric_tolerance
    4  label_set_jaccard
    2  marker_gene_precision_recall
    1  multiple_choice
    1  all_of

tolerance entries, by declared type and by actual keys:
   55  type='absolute'   keys=['type', 'value']
    4  type='absolute'   keys=['lower', 'type', 'upper']
```

Three things to take from this.

**The grader is only published for 30 of the 45 public evals.** EpiBench, scBench-Long and
SpatialBench-Long ship the prompt and the data pointer and no grading rule at all, even though
their READMEs describe deterministic endpoint grading. For those 15 you can run the task; you
cannot score it.

**Every family present is a pure comparison.** A numeric band, a Jaccard overlap against a fixed
label set, precision and recall at k against a fixed marker list, an exact string match, and a
conjunction of the others. No language model appears in any of them. The scBench and
SpatialBench READMEs list a fifth family, `DistributionComparison`, which occurs in zero public
evals, and neither lists `all_of`, which occurs in one — so the documented set and the shipped
set differ in both directions.

**`type` is the field that lies.** It reads `absolute` on all 59 tolerance entries and has never
taken another value, while the keys beside it describe two different rules. Fifty-five entries
carry `value`, a symmetric band around the ground truth. Four carry `lower` and `upper` — and
those are an **asymmetric offset from the ground truth**, not the interval endpoints. Read them
as endpoints and the verdict flips; the next section measures how often.

## Is the grader actually deterministic

Not a claim to take from a README. Two of these repositories publish, for each recorded agent
run, both the answer that was submitted and the verdict the real grader returned. So the
question has an exact answer: re-derive every verdict from the published rule and count the
contradictions.

This reads about a thousand small files and took roughly five minutes on a slow connection.

```python
import collections, concurrent.futures, json, time, urllib.request

RAW = "https://raw.githubusercontent.com/latchbio"
REPOS = {"scbench": "evals", "spatialbench": "example_evals"}   # the two that ship graded runs

def get_json(url, tries=4):
    for n in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as fh:
                return json.loads(fh.read())
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(2 * (n + 1))

def numeric_tolerance(answer, config):
    """The whole grader, re-derived from the eval file. `value` is a symmetric band; a
    `lower`/`upper` pair is an ASYMMETRIC offset from ground truth, not a literal interval —
    read it as bounds and the verdict flips on every eval that uses it. `type` is
    'absolute' in both cases and tells you nothing."""
    scores = {}
    for field, expected in config["ground_truth"].items():
        if field not in answer:
            scores[field] = 0.0
            continue
        err = float(answer[field]) - float(expected)
        tol = config["tolerances"][field]
        ok = (abs(err) <= float(tol["value"])) if "value" in tol \
            else (-float(tol["lower"]) <= err <= float(tol["upper"]))
        scores[field] = 1.0 if ok else 0.0
    return all(v == 1.0 for v in scores.values()), scores

agree = disagree = null_runs = 0
score_mismatch = field_mismatch = 0
impls = collections.Counter()
t0 = time.time()

for repo, folder in REPOS.items():
    man = get_json(f"{RAW}/{repo}/main/{folder}/manifest.json")
    ev_paths = sorted({f"{folder}/{e['task']}/{e['eval_id']}.json" for e in man})
    evals = {}
    for p in ev_paths:
        e = get_json(f"{RAW}/{repo}/main/{p}")
        evals[e["id"]] = e["grader"]["config"]
    tree = get_json(f"https://api.github.com/repos/latchbio/{repo}/git/trees/main?recursive=1")
    assert not tree.get("truncated")
    runs = [b["path"] for b in tree["tree"]
            if b["type"] == "blob" and b["path"].endswith("/result.json")]

    def check(path):
        r = get_json(f"{RAW}/{repo}/main/{path}")
        return path.split("/")[1], r
    with concurrent.futures.ThreadPoolExecutor(16) as ex:
        for eval_id, r in ex.map(check, runs):
            impls[r.get("latch_eval_tools_version", "not recorded")] += 1
            graded = (r.get("result") or {}).get("grader_result")
            if graded is None:          # a run that submitted nothing records null, not False
                null_runs += 1
                continue
            passed, scores = numeric_tolerance(r["result"]["agent_answer"], evals[eval_id])
            agree += passed == graded["passed"]
            disagree += passed != graded["passed"]
            if abs(sum(scores.values()) / len(scores) - graded["score"]) > 1e-9:
                score_mismatch += 1
            if scores != graded["field_scores"]:
                field_mismatch += 1

print(f"recorded runs read      : {agree + disagree + null_runs}  ({time.time()-t0:.0f}s)")
print(f"gradable                : {agree + disagree}")
print(f"runs that submitted none: {null_runs}")
print(f"pass/fail reproduced    : {agree}   contradicted: {disagree}")
print(f"score contradicted      : {score_mismatch}")
print(f"per-field contradicted  : {field_mismatch}")
print(f"grader builds covered   : {dict(impls)}")
```

Run 2026-08-28:

```
recorded runs read      : 1041  (287s)
gradable                : 1040
runs that submitted none: 1
pass/fail reproduced    : 1040   contradicted: 0
score contradicted      : 0
per-field contradicted  : 0
grader builds covered   : {'0.3.8': 225, '0.3.9': 48, '0.3.7': 432, 'not recorded': 336}
```

**Every recorded verdict, reproduced from the published rule alone.** Not only the pass/fail
flag: the real-valued score and every per-field score agree exactly, across three different
builds of the upstream grader. Roughly a dozen lines of arithmetic stand in for a library nobody
outside the company may use.

Two supporting checks worth doing, because "deterministic" can fail quietly in either place.
Running the whole pass twice in separate processes under different `PYTHONHASHSEED` values gives
byte-identical output, which rules out iteration-order or set-ordering effects in the
reimplementation. And the `reasoning` string the real grader attaches to each verdict is a fixed
template on all 273 scBench runs — `Numeric Tolerance Check: PASS` or `FAIL`, then one line per
field — with no generated prose anywhere. There is no model in the loop to be non-deterministic.

What this does **not** say is that a benchmark run is reproducible. The agent is not
deterministic and nothing here makes it so; three attempts per task per configuration is the
published protocol precisely because of that. What is fixed is everything downstream of the
submitted answer. Given a trajectory, the score follows with no variance, no key and no cost —
which is what makes an independently published number checkable rather than merely quotable.

## What deterministic grading cannot do

The gain is exactness. The losses are specific, and they shape what a score means.

- **The endpoint verdict is all or nothing.** `field_scores` records partial credit per field
  and `score` is their mean, but `passed` requires every field inside tolerance. An answer that
  is right about three of four quantities scores 0.75 and fails. EpiBench's own README reports
  field-level scores higher than endpoint scores, which is this effect measured.
- **Only the declared answer shape counts.** The grader looks up `ground_truth`'s field names
  in the submitted object, and a name it does not find scores zero. A correct result reported
  under a different key, or in different units, fails indistinguishably from a wrong one.
- **A defensible different number is still wrong.** Where several reasonable pipelines give
  materially different cell counts, only the band around the reference pipeline's answer passes.
  The tolerances are the whole allowance for methodological freedom, and four of them are
  asymmetric — wider on one side of the reference value than the other.
- **Nothing about method is examined.** An answer guessed, or copied from the source paper
  without touching the data, grades identically to one computed. The projects address this by
  choosing questions whose answers are not recoverable from prior knowledge, which is a property
  of task design, not of grading.
- **A missing answer is `null`, not `False`.** One recorded run submitted nothing, and its
  `passed` is `null`. Treating that as a boolean throws; summing it silently drops the run from
  the denominator and flatters the pass rate.

## Which tasks you can actually run

A task is only usable if its snapshots resolve. They are addressed by handle, and a handle the
project never shared is refused — including some inside the published sample.

```python
import concurrent.futures, json, time, urllib.request, urllib.error

REPOS = {"scbench": "evals", "spatialbench": "example_evals", "epibench": "evals",
         "variantbench": "evals", "scbench-long": "evals", "spatialbench-long": "evals"}
RAW = "https://raw.githubusercontent.com/latchbio"
SIGN = "https://nucleus.latch.bio/ldata/get-signed-url"

def get_json(url, tries=4):
    for n in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as fh:
                return json.loads(fh.read())
        except urllib.error.HTTPError:
            raise
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(2 * (n + 1))

def reachable(node):
    """400, not 401 and not 404. A node that was never shared and a node that never existed
    return the same status and the same sentence, so this answers 'can I get it', not 'is
    it there'."""
    req = urllib.request.Request(SIGN, data=json.dumps({"path": node}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as fh:
            return bool(json.loads(fh.read()).get("data", {}).get("url"))
    except urllib.error.HTTPError:
        return False

tasks = []
for repo, folder in REPOS.items():
    man = get_json(f"{RAW}/{repo}/main/{folder}/manifest.json")
    paths = sorted({f"{folder}/{e['task']}/{e['eval_id']}.json" for e in man}) \
        if isinstance(man, list) else sorted({e["path"] for e in man["evals"]})
    for p in paths:
        ev = get_json(f"{RAW}/{repo}/main/{p}")
        nodes = [ev["data_node"]] if isinstance(ev["data_node"], str) else ev["data_node"]
        tasks.append((repo, ev["id"], nodes))

every = sorted({n for _, _, ns in tasks for n in ns})
with concurrent.futures.ThreadPoolExecutor(12) as ex:
    status = dict(zip(every, ex.map(reachable, every)))

print(f"{'repository':20} {'evals':>6} {'runnable':>9} {'nodes':>6} {'reachable':>10}")
for repo in REPOS:
    rows = [t for t in tasks if t[0] == repo]
    nodes = {n for _, _, ns in rows for n in ns}
    runnable = sum(all(status[n] for n in ns) for _, _, ns in rows)
    print(f"{repo:20} {len(rows):6} {runnable:9} {len(nodes):6} "
          f"{sum(status[n] for n in nodes):10}")
print(f"\n{len(every)} distinct data nodes, {sum(status.values())} reachable without an account")
print(f"{sum(all(status[n] for n in ns) for _, _, ns in tasks)} of {len(tasks)} evals have every node reachable")
for repo, eid, ns in tasks:
    if not all(status[n] for n in ns):
        print(f"  incomplete: {repo}/{eid}  {sum(not status[n] for n in ns)} of {len(ns)} nodes refused")
```

Run 2026-08-28:

```
repository            evals  runnable  nodes  reachable
scbench                   6         6      6          6
spatialbench             16        16     10         10
epibench                  7         7    512        512
variantbench              8         6     35         23
scbench-long              4         3     10          9
spatialbench-long         4         1      9          3

582 distinct data nodes, 563 reachable without an account
39 of 45 evals have every node reachable
  incomplete: variantbench/eval_stage4_annotated_vcf  7 of 7 nodes refused
  incomplete: variantbench/osteosarcoma_wes_stage3_called_vcf_neoantigen_gene_recall  11 of 11 nodes refused
  incomplete: scbench-long/green_2_tme_context_dependence  1 of 3 nodes refused
  incomplete: spatialbench-long/lineage_metastasis_multilayer_niche_mapping  1 of 1 nodes refused
  incomplete: spatialbench-long/visium_perineural_proximity  3 of 3 nodes refused
  incomplete: spatialbench-long/xenium_organoid_spatial_niche_disruption  2 of 3 nodes refused
```

**No account, no token, no click-through.** 563 of 582 handles resolve to a presigned link for
an anonymous caller, which is the whole access story for this family.

The 19 that do not are a real gap in a published release, and it falls unevenly: **six of the
45 evals are missing at least part of their data**, four of them all of it, and
SpatialBench-Long is down to one complete task in four. The two VariantBench failures are
exactly the two its manifest marks `benchmark: false` — extras whose data was never shared.
Check before you plan around a task, not after.

Two traps in the refusal itself. It is **HTTP 400**, not 401 and not 404, and one message covers
both "no such node" and "not shared with you" — so a caller cannot distinguish a withheld
snapshot from a typo. And sending a malformed `Authorization` header gets a **401** where
sending none gets a 200 — the header is validated when present and not required when absent, so
a stale or wrong token turns a request that would have worked into one that does not.

## Snapshot sizes before you fetch

For scBench and SpatialBench each task's snapshot is a single `.h5ad`, and they span three
orders of magnitude. Size before transferring.

```python
import concurrent.futures, json, statistics, time, urllib.request

RAW = "https://raw.githubusercontent.com/latchbio"
SIGN = "https://nucleus.latch.bio/ldata/get-signed-url"
REPOS = {"scbench": "evals", "spatialbench": "example_evals"}

def get_json(url):
    with urllib.request.urlopen(url, timeout=90) as fh:
        return json.loads(fh.read())

def size_of(node, tries=5):
    """One ranged GET of eight bytes. Content-Range carries the full length, so this costs
    nothing and answers the only question worth asking before a transfer. Retry: the storage
    host resets connections often enough that a single attempt fails on a set this size."""
    req = urllib.request.Request(SIGN, data=json.dumps({"path": node}).encode(),
                                 headers={"Content-Type": "application/json"})
    url = json.loads(urllib.request.urlopen(req, timeout=90).read())["data"]["url"]
    for n in range(tries):
        try:
            probe = urllib.request.Request(url, headers={"Range": "bytes=0-7"})
            with urllib.request.urlopen(probe, timeout=180) as fh:
                return fh.read(), int(fh.headers["content-range"].split("/")[1])
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(3 * (n + 1))

pairs = []
for repo, folder in REPOS.items():
    man = get_json(f"{RAW}/{repo}/main/{folder}/manifest.json")
    for p in sorted({f"{folder}/{e['task']}/{e['eval_id']}.json" for e in man}):
        ev = get_json(f"{RAW}/{repo}/main/{p}")
        pairs.append((repo, ev["id"], ev["data_node"]))

nodes = sorted({n for _, _, n in pairs})
with concurrent.futures.ThreadPoolExecutor(6) as ex:
    info = dict(zip(nodes, ex.map(size_of, nodes)))

sizes = sorted(s for _, s in info.values())
print(f"{len(pairs)} evals reference {len(nodes)} distinct snapshots "
      f"(several evals share one)")
print(f"container magic : {sorted({m[:4] for m, _ in info.values()})}")
print(f"smallest        : {sizes[0] / 1e6:.1f} MB")
print(f"median          : {statistics.median(sizes) / 1e6:.1f} MB")
print(f"largest         : {sizes[-1] / 1e6:.1f} MB")
print(f"over 1 GB       : {sum(s > 1e9 for s in sizes)} of {len(sizes)}")
print(f"whole set       : {sum(sizes) / 1e9:.1f} GB\n")
for repo, eid, node in sorted(pairs, key=lambda t: info[t[2]][1]):
    print(f"  {info[node][1] / 1e6:9.1f} MB  {repo:13} {eid[:46]}")
```

Run 2026-08-28:

```
22 evals reference 16 distinct snapshots (several evals share one)
container magic : [b'\x89HDF']
smallest        : 8.8 MB
median          : 126.3 MB
largest         : 9631.0 MB
over 1 GB       : 5 of 16
whole set       : 23.5 GB

        8.8 MB  scbench       bd_rhapsody_tnbc_panel_aware_qc
        8.8 MB  spatialbench  visium_bone_celltype_lineage_resolution_limit
       34.8 MB  scbench       tapestri_ccus_clustering_12_largest_mutant_clo
       79.0 MB  spatialbench  norm_01_opc_olig_maturation_foldchange
       79.0 MB  spatialbench  norm_02_myelin_gene_coexpression_normalization
       79.0 MB  spatialbench  qc_01_endothelial_doublet_assessment
       80.7 MB  scbench       dr_05_pca_preprocessing_sentinels
      110.8 MB  spatialbench  xenium_kidney_celltype_fib_immune_temporal
      110.8 MB  spatialbench  xenium_kidney_spatial_fibro_inflammatory_niche
      114.4 MB  spatialbench  xenium_kidney_spatial_cn7_composition_day14
      115.0 MB  scbench       NRM01_sparse_normalization
      137.7 MB  scbench       T04a_endothelin_niche_sources
      242.7 MB  spatialbench  MOTIF04_neuronal_female_tf_family
      639.5 MB  spatialbench  curio_ovary_oocyte_count_per_timepoint
     1102.1 MB  spatialbench  curio_ovary_cumulus_gc_count_immature
     1102.1 MB  spatialbench  curio_ovary_follicle_count_immature
     1102.1 MB  spatialbench  curio_ovary_batch_driven_clustering
     1590.6 MB  scbench       DE01_pseudobulk_de
     3209.6 MB  spatialbench  NORM01_batch_correction
     6416.3 MB  spatialbench  DR01_batch_confounded_clustering
     9631.0 MB  spatialbench  SPATIAL10_genome_wide_de_pct
     9631.0 MB  spatialbench  SPATIAL07_sex_housekeeping_de
```

**Twenty-two tasks, sixteen files.** Snapshots are shared — three SpatialBench evaluations run
off the same 1.1 GB object and two more off the same 9.6 GB one — so counting tasks overstates
what you need to download by a third here. The other four repositories point each eval at a
*list* of handles rather than one, so the same arithmetic runs the other way there.

## Get the files

Reading the `.h5ad` needs one dependency; everything above is standard library.

```bash
python3 -m venv .venv && ./.venv/bin/pip install anndata
```

```python
import json, os, time, urllib.request

RAW = "https://raw.githubusercontent.com/latchbio"
SIGN = "https://nucleus.latch.bio/ldata/get-signed-url"
OUT = "Data/latch-bench"
EVAL = "evals/qc/bd_rhapsody_tnbc_panel_aware_qc.json"     # smallest snapshot in the public set
os.makedirs(OUT, exist_ok=True)

def get_json(url):
    with urllib.request.urlopen(url, timeout=90) as fh:
        return json.loads(fh.read())

def resolve(node):
    """`latch://<id>.node` is a handle into LatchBio's storage, not a URL. This endpoint
    trades it for a presigned S3 link and needs NO account for a node the project shared.
    Send a malformed Authorization header and it 401s, so send none at all. A node that was
    never shared answers 400 -- 'does not exist' and 'not public' share one status and one
    message, so you cannot tell them apart."""
    req = urllib.request.Request(SIGN, data=json.dumps({"path": node}).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as fh:
        return json.loads(fh.read())["data"]["url"]

def fetch_resumable(url, dest, chunk=1 << 22, tries=6):
    """Range-resume rather than stream in one call. These links are served slowly and drop
    mid-transfer; a plain read() on a multi-GB snapshot loses the whole transfer when it
    does. Re-running this continues from whatever is already on disk."""
    with urllib.request.urlopen(
            urllib.request.Request(url, headers={"Range": "bytes=0-7"}), timeout=120) as fh:
        magic, total = fh.read(), int(fh.headers["content-range"].split("/")[1])
    assert magic[:4] == b"\x89HDF", f"not an HDF5 container: {magic!r}"
    have = os.path.getsize(dest) if os.path.exists(dest) else 0
    with open(dest, "ab") as out:
        while have < total:
            hi = min(have + chunk, total) - 1
            for n in range(tries):
                try:
                    req = urllib.request.Request(url, headers={"Range": f"bytes={have}-{hi}"})
                    with urllib.request.urlopen(req, timeout=300) as fh:
                        buf = fh.read()
                    break
                except Exception:
                    if n == tries - 1:
                        raise
                    time.sleep(3 * (n + 1))
            out.write(buf)
            out.flush()
            have += len(buf)
    return total

ev = get_json(f"{RAW}/scbench/main/{EVAL}")
with open(os.path.join(OUT, os.path.basename(EVAL)), "w") as fh:
    json.dump(ev, fh, indent=2)        # written whole; printed only in projection

dest = os.path.join(OUT, f"{ev['id']}.h5ad")
total = fetch_resumable(resolve(ev["data_node"]), dest)

print(f"eval        {ev['id']}")
print(f"kit / task  {ev['metadata']['kit']} / {ev['metadata']['task']}")
print(f"prompt      {len(ev['task'])} characters (on disk, not printed)")
print(f"withheld    {[k for k in ('grader', 'graders', 'canary') if k in ev]}")
print(f"data_node   {ev['data_node']}  ->  {total / 1e6:.1f} MB")
print(f"written     {dest}  ({os.path.getsize(dest) / 1e6:.1f} MB)")

import anndata
ad = anndata.read_h5ad(dest)
print(f"AnnData     {ad.shape[0]} obs x {ad.shape[1]} var")
print(f"obs columns {list(ad.obs.columns)[:5]}")
print(f"layers      {list(ad.layers)}")
```

Run 2026-08-28:

```
eval        bd_rhapsody_tnbc_panel_aware_qc
kit / task  bd_rhapsody / qc
prompt      628 characters (on disk, not printed)
withheld    ['grader', 'canary']
data_node   latch://203298116.node  ->  8.8 MB
written     Data/latch-bench/bd_rhapsody_tnbc_panel_aware_qc.h5ad  (8.8 MB)
AnnData     16136 obs x 386 var
obs columns ['sample', 'Cell_Index', 'tissue', 'sex', 'treatment']
layers      ['DBEC_Adjusted_Molecules', 'RSEC_Adjusted_Molecules', 'Raw_Molecules']
```

Real working data, mid-analysis: 16,136 cells against a 386-gene targeted panel, three count
layers reflecting successive molecular-index corrections, and sample covariates already
attached. That is the state the analysis was in the moment before the step being tested — which
is what makes these tasks concrete rather than hypothetical.

The download is resumable on purpose. This storage path is slow and drops connections; a
single-call stream on a 9.6 GB snapshot will lose the whole transfer and start over.

## Names that collide

Both of the largest members share a name with an unrelated resource in an adjacent field, and a
citation without the organisation attached is ambiguous.

- **SCBench** is also a long-context language-model benchmark distributed on Hugging Face, and
  separately a SystemC hardware verification suite. Searching Hugging Face for "scbench" returns
  several of these and none of this. There is no Hugging Face distribution for this family at
  all — the organisation publishes no datasets there — so a Hugging Face path is the wrong place
  to look, not a permissions problem.
- **SpatialBench** is also a published spatial-transcriptomics platform comparison deposited in
  BioStudies with its own DOI, which is a benchmark *of assays* rather than of agents.

None of these repositories carries a DOI or a tagged release, so cite the organisation, the
repository and the commit.

## What this skill will not do

It stops at the tasks, the grading rule and the data. It does not run an agent, does not stand
up a harness, and does not submit anything to a leaderboard.

It also has no shortcut. The `biomedarena` harness registers 155 biomedical benchmarks behind
one CLI and not one of these is among them, so reaching this family means reaching these
repositories.

That boundary matters more than usual here. These sets are small, published as samples
precisely so the rest can stay uncontaminated, and 41 of the 45 carry a leak-detection string
for that reason. Reading a task's answer is fine and is what the projection above is careful
about; **publishing one — an expected value, a grader config, a canary — into any indexable
document retires that task for everyone.** The registry that hosts this page is public and
permanent, which is exactly why no ground truth appears anywhere above.

## Try it

**Data.** The public evaluation samples in `latchbio/scbench` and `latchbio/variantbench`
(Apache-2.0 and a modified Apache-2.0 respectively), their recorded run results, and one
analysis snapshot resolved through LatchBio's storage endpoint. No account is needed for any of
it. Last confirmed reachable 2026-08-28.

**Run.** Standard library only.

```python
import concurrent.futures, json, time, urllib.request

RAW = "https://raw.githubusercontent.com/latchbio"
SIGN = "https://nucleus.latch.bio/ldata/get-signed-url"
GRADED = ("grader", "graders", "canary")

def get_json(url, tries=4):
    for n in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as fh:
                return json.loads(fh.read())
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(2 * (n + 1))

def entries(man, folder):
    if isinstance(man, list):                       # scbench, spatialbench
        return sorted({f"{folder}/{e['task']}/{e['eval_id']}.json" for e in man})
    return sorted({e["path"] for e in man["evals"]})   # the other four

# Both manifest shapes must parse, or half the family reads as empty.
sc = entries(get_json(f"{RAW}/scbench/main/evals/manifest.json"), "evals")
vb = entries(get_json(f"{RAW}/variantbench/main/evals/manifest.json"), "evals")
assert len(sc) == 6 and len(vb) == 8, (len(sc), len(vb))

evals = {}
for p in sc:
    e = get_json(f"{RAW}/scbench/main/{p}")
    assert {"id", "task", "metadata", "data_node"} <= set(e), sorted(e)
    evals[e["id"]] = e
assert all("canary" in e for e in evals.values()), "canary field gone -- recheck the policy"
safe = {i: {k: v for k, v in e.items() if k not in GRADED} for i, e in evals.items()}
assert not any(k in s for s in safe.values() for k in GRADED), "projection leaked a graded field"

# `type` is the field you would switch on, and it never varies -- while the keys that carry
# the actual rule do. Reading `lower`/`upper` as literal bounds instead of as an asymmetric
# offset from ground truth flips real verdicts, which the re-grade below demonstrates.
tol = [t for e in evals.values() for t in e["grader"]["config"]["tolerances"].values()]
assert {t["type"] for t in tol} == {"absolute"}, "a second tolerance type appeared"
shapes = {tuple(sorted(t)) for t in tol}
assert shapes == {("type", "value"), ("lower", "type", "upper")}, shapes

EVAL_ID = "dr_05_pca_preprocessing_sentinels"      # the one using the lower/upper form
cfg = evals[EVAL_ID]["grader"]["config"]

def grade(answer, cfg, naive=False):
    scores = {}
    for field, expected in cfg["ground_truth"].items():
        if field not in answer:
            scores[field] = 0.0
            continue
        got, tolerance = float(answer[field]), cfg["tolerances"][field]
        if "value" in tolerance:
            ok = abs(got - float(expected)) <= float(tolerance["value"])
        elif naive:
            ok = float(tolerance["lower"]) <= got <= float(tolerance["upper"])
        else:
            ok = -float(tolerance["lower"]) <= got - float(expected) <= float(tolerance["upper"])
        scores[field] = 1.0 if ok else 0.0
    return all(v == 1.0 for v in scores.values()), scores

tree = get_json("https://api.github.com/repos/latchbio/scbench/git/trees/main?recursive=1")
assert not tree.get("truncated")
runs = sorted(b["path"] for b in tree["tree"] if b["type"] == "blob"
              and b["path"].startswith(f"trajectories/{EVAL_ID}/") and b["path"].endswith("/result.json"))

with concurrent.futures.ThreadPoolExecutor(12) as ex:
    results = list(ex.map(lambda p: get_json(f"{RAW}/scbench/main/{p}"), runs))

ok = naive_wrong = 0
for r in results:
    graded = r["result"]["grader_result"]
    passed, scores = grade(r["result"]["agent_answer"], cfg)
    assert passed == graded["passed"], "declared grader spec did not reproduce a recorded verdict"
    assert scores == graded["field_scores"], "per-field scores did not reproduce"
    ok += 1
    naive_wrong += grade(r["result"]["agent_answer"], cfg, naive=True)[0] != graded["passed"]
assert naive_wrong > 0, "the naive tolerance reading no longer disagrees -- recheck the trap"

req = urllib.request.Request(SIGN, headers={"Content-Type": "application/json"},
                             data=json.dumps({"path": evals[EVAL_ID]["data_node"]}).encode())
url = json.loads(urllib.request.urlopen(req, timeout=90).read())["data"]["url"]
probe = urllib.request.Request(url, headers={"Range": "bytes=0-7"})
with urllib.request.urlopen(probe, timeout=120) as fh:
    magic, size = fh.read(), int(fh.headers["content-range"].split("/")[1])
assert magic[:4] == b"\x89HDF", magic

print(f"manifest shapes parsed         : list={len(sc)} evals, object={len(vb)} evals")
print(f"scbench evals, projected       : {len(safe)}  withheld {sorted(GRADED)}")
print(f"tolerance types / key shapes   : {sorted({t['type'] for t in tol})} / {len(shapes)}")
print(f"recorded runs re-graded        : {ok}  contradicted: 0")
print(f"naive lower/upper reading      : {naive_wrong} of {ok} verdicts wrong")
print(f"data_node resolved, no account : {size / 1e6:.1f} MB, HDF5 magic ok")
print("all assertions passed")
```

**Expect.**

Invariants — these hold whatever the maintainers republish, and a failure means this page is
wrong rather than stale:

- **Both manifest shapes parse.** A list keyed `eval_id` and an object keyed `path` are both
  live in this family; handling one is handling half of it.
- **The projection removes every graded field**, and a `canary` is present on all six scBench
  evals before it does.
- **`type` is the constant `absolute`** while the tolerance entries take two distinct key
  shapes. That gap is the trap, not a bug to route around.
- **The declared grader reproduces every recorded verdict**, pass/fail and per-field score
  alike. This is the deterministic-grading claim, tested rather than quoted; if it fires,
  either the grader changed or this page's reading of it was wrong.
- **The naive reading of `lower`/`upper` still contradicts at least one recorded verdict**, so
  the asymmetric-offset semantics are load-bearing and not a stylistic preference.
- **A shared handle resolves for an anonymous caller** and yields an HDF5 container.

Observed 2026-08-28 at the commits named in `verified` — these move when upstream republishes,
so a mismatch is drift to investigate:

```
manifest shapes parsed         : list=6 evals, object=8 evals
scbench evals, projected       : 6  withheld ['canary', 'grader', 'graders']
tolerance types / key shapes   : ['absolute'] / 2
recorded runs re-graded        : 48  contradicted: 0
naive lower/upper reading      : 5 of 48 verdicts wrong
data_node resolved, no account : 80.7 MB, HDF5 magic ok
all assertions passed
```

## Sources

- [`latchbio/scbench`](https://github.com/latchbio/scbench) and
  [`latchbio/spatialbench`](https://github.com/latchbio/spatialbench) — Apache-2.0, copyright
  Latch Bio.
- [`latchbio/epibench`](https://github.com/latchbio/epibench),
  [`latchbio/variantbench`](https://github.com/latchbio/variantbench),
  [`latchbio/scbench-long`](https://github.com/latchbio/scbench-long) and
  [`latchbio/spatialbench-long`](https://github.com/latchbio/spatialbench-long) — a modified
  Apache-2.0 naming no copyright holder, which is why GitHub reports no assertion.
- Grader implementations live in `latchbio/latch-eval-tools`, whose LICENSE reads
  `© LatchBio LLC. All rights reserved.` Nothing here uses or depends on it; the rule each
  grader applies is published in the eval file under the benchmark's own licence.
- The client that normally resolves a storage handle is
  [`latchbio/latch`](https://github.com/latchbio/latch), MIT, on PyPI as `latch`. The blocks
  above call the same endpoint directly so nothing has to be installed to fetch data.
- None of these repositories carries a DOI, a tag or a release. Cite the commit.

Snapshots derive from published studies. The benchmark licences cover the benchmark's own
contribution — prompts, graders, trajectories — and say nothing about the underlying data, whose
provenance the eval files do not record. Fetch from upstream, and establish terms at the source
publication before redistributing anything you pull out of a snapshot.
