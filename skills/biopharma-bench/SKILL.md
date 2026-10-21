---
name: biopharma-bench
description: Fetch Biopharma Bench, an agent benchmark of regulated drug-development desk work (CMC, QA/QC, regulatory). Gets the public Havenor slice — 10 tasks, 107 rubric criteria, company desks — with schema, scoring and a safe agent setup.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, agents, evaluation, public-data, drug-development]
covers: [biopharma bench, raycaster, havenor, agent benchmark, agent evaluation, cmc, chemistry manufacturing and controls, msat, quality assurance, quality control, gxp, regulatory affairs, regulatory cmc, ctd, stability, shelf life, sterile injectable, change control, deviation, capa, supplier quality, validation, information request, health authority, rubric grading, llm judge, pass@1, docx, xlsx, contamination]
access: [open]
datasets: ['https://huggingface.co/datasets/raycasterai/biopharma-bench/resolve/c020c2d3fdbdd6164f59558cab2cf3dd43813f0f/tasks_and_rubrics.json', 'https://huggingface.co/api/datasets/raycasterai/biopharma-bench/revision/c020c2d3fdbdd6164f59558cab2cf3dd43813f0f']
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: Hugging Face dataset revision c020c2d (2026-09-24) / Python 3.12.8 standard library
  executed: 4
  unverified: 1
  unverified_reason: The verdict roll-up needs a verdict sheet filled in by a judge of the reader's choosing, and no judge was run here. Its refusals (blank verdicts, a judge missing on some rows, two judges, a duplicate or missing criterion, an all-ERROR sheet) and its arithmetic on a synthetic filled sheet were exercised, but that is not a graded run. Re-run it after grading one task with any judge.
---
# Biopharma Bench

A benchmark for AI agents doing the desk work of drug and device **development**, not drug
discovery: chemistry, manufacturing and controls (CMC), manufacturing science (MSAT), QA and QC,
regulatory affairs and clinical site operations. An agent is placed in an employee's seat inside
a simulated company. It gets that person's drive, systems of record, a LIMS and colleagues on
chat, and it has to hand in one finished `.docx` or `.xlsx`. Each task has a fixed list of
pass/fail criteria, and the deliverable is graded against that list.

What makes it hard is reading authority, not retrieval. The drive holds superseded
specifications next to effective ones, informal memos next to filed positions, and data dated
after the company's "today". An agent that cites the wrong revision fails the criterion, however
well it writes.

This skill gets the public part of the benchmark onto disk, explains the record shapes and the
scoring, sets up an agent's workspace so the agent cannot see the rubric, and shows how to grade
the result against the published criteria with a judge you choose.

## What is public, and what is not

Read this first, because the headline numbers and the downloadable data cover **different
things**.

| | Scored suite (V0.1) | Public showcase (this skill) |
|---|---|---|
| companies | 12, built from real sponsor records | 1, Havenor Therapeutics, fully synthetic |
| tasks | 71 | 10 (`HVN-01` … `HVN-10`) |
| criteria | 752 | 107 |
| data | sealed, not downloadable | Hugging Face, plus a Harbor package |
| leaderboard | yes | scored separately, not counted in the 71 |

The 71-task suite is what the leaderboard ranks. Its company files come from real, partly
confidential records and are not released. **Havenor is the only company you can download**,
and it was written from scratch for the benchmark so that its files, runs and grading lists
could be published in full. A third environment, the Broad Institute showcase (4 tasks rebuilt
from a public FDA IND record), appears only as published runs on the results site. It is in
neither the dataset nor the Harbor package.

So this skill cannot reproduce a leaderboard number. It can put the same kind of task in front
of your agent and grade the result against the same published criteria.

## Licence, access and the contamination request

- **CC BY 4.0, ungated.** The dataset card's metadata and the `LICENSE` file at the pinned
  revision both say so. The licence text covers the desks and the prompts and rubrics, as well as
  the generated company records. Copyright is held by 7th Ave Labs Inc. (trading as Raycaster). No account
  is needed.
- **No third-party documents found.** Havenor is synthetic. The full file listing of one desk
  was checked (792 files: PDF, DOCX, EML, XLSX, CSV), and it names no regulator guidance,
  standards text or anything else that would carry its own terms. The other desks are
  role-scoped slices of the same synthetic company drive.
- **The official grader is not covered.** The official leaderboard scores come from the
  publisher's grader, which ships in a Harbor task package with no licence of its own. The
  Harbor runner itself is Apache-2.0, and the dataset `LICENSE` covers only the Hugging Face
  dataset. This skill does not run that grader.

**Contamination.** The card and the `LICENSE` file both ask that the benchmark data never
appear in training corpora, and they carry a canary GUID for filtering. Read it there. This
page does not reproduce it, because a canary only works while it appears in nothing except the
data it marks. What follows from that request:

- Do not paste task prompts, criteria or desk contents into anything public: issues, papers,
  repos, model cards or prompts you share.
- Keep downloaded desks and agent outputs out of any repository or corpus that may feed
  training. The `Data/` and `agent-workspace/` directories below are scratch locations, not something to
  commit.
- This page shows the **shape** of the records and never their content. No block below prints a
  prompt or a criterion. The grading worklist writes criteria only into the grader-side tree.

## The records

The dataset is a small set of JSON files plus one zip per seat.

| file | size | what it is |
|---|---|---|
| `tasks_and_rubrics.json` | 50,716 B | the 10 tasks, one object each, criteria included |
| `world_descriptions.json` | 579 B | the company: name, domain, task count, company clock |
| `records/views.json` | 262,160 B | 13 systems-of-record tables (DMS, QMS, ERP, RIM, CSV, directory) |
| `records/directory.json` | 112,404 B | the staff roster behind the chat surface |
| `desks/*.zip` | 108.9–111.1 MB each, 873.9 MB for all 8 | a seat's drive, unzipped to become the agent's filesystem |

Sizes were measured at revision `c020c2d` on 2026-10-21.

A task record has these fields:

| field | meaning |
|---|---|
| `task_id` | `HVN-01` … `HVN-10` |
| `task_name`, `domain`, `world_id` | short title, `CMC / MSAT`, `havenor` |
| `seat` | `employee_id`, `name`, `role` of the person whose desk the agent sits at |
| `desk` | path of the zip to unpack, e.g. `desks/EMP-QA-001.zip` |
| `prompt` | the assignment as the colleague would phrase it |
| `virtual_now` | the company clock, `2026-09-27T08:00:00Z` for every task |
| `expected_output`, `deliverable` | always `file`; the path inside the desk where the file must land |
| `surfaces` | what the task expects the agent to use: `filesystem`, `records`, `lims`, `im` |
| `gold_response` | always `null`. No reference answer ships |
| `rubric` | list of `{verifier_id, criteria}`, 6 to 15 per task |

Things that will catch you out:

- **Desks are keyed by task, not by person.** `EMP-QC-005` has two different desks,
  `…-hvn-09.zip` and `…-hvn-10.zip`. Meanwhile HVN-01/HVN-04 share one desk, and so do
  HVN-05/HVN-08. Always unpack `task["desk"]` and never build a path from the employee ID.
- **Most deliverables start absent.** The `_Working/<name>/` folder does not exist yet in
  those desks, so the agent must create it. HVN-09 and HVN-10 instead ask the agent to finish a
  workbook that is already on the desk, in a colleague's `_Working` folder rather than the seat
  holder's, and the agent edits it.
- **`records/` is for tools, not for the desk.** Upstream says not to unzip it onto the agent's
  filesystem. Serve it through a tool if you want the records surface, or leave it out.
- **The dataset does not include the LIMS or the chat surface.** Every task lists `im`, and
  HVN-01, 04, 08, 09 and 10 also list `lims`. A filesystem-only run can fail criteria that
  depend on those surfaces, and upstream says its scores are not comparable with the published
  ones.

## How scoring works

- **Each criterion is binary**, pass or fail. Style and length are not scored.
- **Task score** = criteria passed ÷ criteria in that task.
- **Macro task mean**, the headline metric, is the task score averaged over tasks, each task
  weighted equally.
- **Pass@1** = tasks where every criterion passed on the single scored attempt. The leaderboard
  also reports criteria passed pooled across all criteria.

**Every criterion is judged by a language model.** Each criterion is a sentence of prose that
states a fact, a citation, a number or a conclusion the deliverable must get right. In the
official grader all 107 Havenor criteria go to a model judge, which reads the finished files and
the sources the criterion relies on, then returns PASS or FAIL. None is checked by a script.
What follows from that:

- **The judge is part of the measurement.** Two runs graded by different judges are not
  comparable, even on the same deliverable. Report the judge, and its settings, with any result.
- **A criterion the judge could not grade is `ERROR`**, not FAIL. It still counts as not passed
  in the task score, so a run with errors is a lower bound. If every criterion in a task errors,
  the task is ungraded and should be left out of the mean, as the leaderboard does.

## Get the files

Pinned to the dataset commit, so a later push cannot change what you test against. This fetches
the JSON files and one desk, checks each file against the hash the Hugging Face API publishes
for it, and unpacks the desk into a workspace an agent can be pointed at. Standard library only.

**Two trees, on purpose.** The task file (with its criteria), `records/` and the desk zips go
under `Data/biopharma-bench/`. The agent's workspace goes under a separate `agent-workspace/`
tree. The two are siblings, so the split does not hide the rubric by itself. It makes it
possible to confine the agent to its own tree (see *Set up the agent's workspace*).

```python
import hashlib, json, os, urllib.request, zipfile

def need(ok, msg):              # an explicit check: `assert` vanishes under python -O
    if not ok:
        raise SystemExit(msg)

REV = "c020c2d3fdbdd6164f59558cab2cf3dd43813f0f"   # pinned dataset commit, 2026-09-24
BASE = f"https://huggingface.co/datasets/raycasterai/biopharma-bench/resolve/{REV}"
TREE = f"https://huggingface.co/api/datasets/raycasterai/biopharma-bench/tree/{REV}?recursive=true"
OUT = "Data/biopharma-bench"                       # grader-side files: never give this to the agent
WORK_ROOT = "agent-workspace"                      # the only tree the agent should see
TASK = "HVN-05"                                    # any of HVN-01 .. HVN-10

with urllib.request.urlopen(TREE, timeout=120) as r:
    listing = {e["path"]: e for e in json.load(r)}

def fetch(path):
    dest = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    sha256, sha1 = hashlib.sha256(), hashlib.sha1()
    sha1.update(b"blob %d\0" % listing[path]["size"])   # git blob header
    with urllib.request.urlopen(f"{BASE}/{path}", timeout=900) as r, open(dest, "wb") as fh:
        while chunk := r.read(1 << 20):
            fh.write(chunk); sha256.update(chunk); sha1.update(chunk)
    e = listing[path]
    if e.get("lfs"):                               # desks: LFS oid is the sha256
        need(sha256.hexdigest() == e["lfs"]["oid"], f"{path}: sha256 mismatch")
    else:                                          # small files: oid is the git blob sha1
        need(sha1.hexdigest() == e["oid"], f"{path}: git blob hash mismatch")
    return {"path": path, "bytes": os.path.getsize(dest), "sha256": sha256.hexdigest()}

got = [fetch(p) for p in ("tasks_and_rubrics.json", "world_descriptions.json",
                          "records/views.json", "records/directory.json")]
tasks = {t["task_id"]: t for t in json.load(open(os.path.join(OUT, "tasks_and_rubrics.json")))}
task = tasks[TASK]

got.append(fetch(task["desk"]))                    # ~109 MB, one per seat
desk_zip = os.path.join(OUT, task["desk"])
work = os.path.join(WORK_ROOT, TASK)
with zipfile.ZipFile(desk_zip) as z:
    z.extractall(work)
n_files = sum(len(f) for _, _, f in os.walk(work))

# One manifest for every task fetched so far: re-running with another TASK adds to it.
man_path = os.path.join(OUT, "manifest.json")
man = json.load(open(man_path)) if os.path.exists(man_path) else {"revision": REV, "tasks": {}}
need(man["revision"] == REV, "manifest was written at another revision; start a fresh Data/")
man["tasks"][TASK] = {"desk": task["desk"], "workspace": work, "workspace_files": n_files,
                      "deliverable": task["deliverable"], "files": got}
with open(man_path, "w") as fh:
    json.dump(man, fh, indent=2)

for g in got:
    print(f"{g['bytes']:>11,}  {g['path']}")
print(f"{TASK}: {n_files} files in {work}; deliverable goes to {task['deliverable']}")
print("deliverable already on desk:", os.path.exists(os.path.join(work, task["deliverable"])))
print("all hashes match the published listing")
```

Run 2026-10-21 from an empty directory (35 s):

```
     50,716  tasks_and_rubrics.json
        579  world_descriptions.json
    262,160  records/views.json
    112,404  records/directory.json
109,385,263  desks/EMP-QA-001.zip
HVN-05: 792 files in agent-workspace/HVN-05; deliverable goes to _Working/Leena Rao/AVI-401_pre_submission_records_check.docx
deliverable already on desk: False
all hashes match the published listing
```

`Data/biopharma-bench/manifest.json` keeps one entry per task fetched, with each file's size
and sha256. Every file was checked against the published listing before it was recorded. Run the
block again with another `TASK` to add that task's desk and workspace.

With `TASK = "HVN-09"` the same block fetches `EMP-QC-005-hvn-09.zip` (108,909,687 B), unpacks
790 files and reports `deliverable already on desk: True`. That is the review-in-place case.
`EMP-RA-001.zip` and `EMP-MSAT-002.zip` publish the same sha256, so those two seats get
byte-identical drives. The card says seats with the same access share a drive, which may be the
reason; the listing shows only that the bytes match.

Then browse what you fetched. The table shows seat, output type, criteria count and surfaces,
and deliberately leaves out prompts and criteria text:

```python
import json, os

OUT = "Data/biopharma-bench"          # written by the block above
tasks = json.load(open(os.path.join(OUT, "tasks_and_rubrics.json")))
views = json.load(open(os.path.join(OUT, "records/views.json")))["views"]

print(f"{'task':7} {'seat':22} {'role':28} {'out':5} {'crit':>4}  surfaces")
for t in tasks:
    ext = t["deliverable"].rsplit(".", 1)[-1]
    print(f"{t['task_id']:7} {t['seat']['employee_id']:22} {t['seat']['role'][:28]:28} "
          f"{ext:5} {len(t['rubric']):>4}  {','.join(t['surfaces'])}")
print("criteria:", sum(len(t["rubric"]) for t in tasks))

print("\nsystems-of-record views (records/views.json):")
for name, v in views.items():
    print(f"  {name:20} {v['system']:4} {len(v['rows']):>4} rows  {len(v['columns'])} columns")
```

Run 2026-10-21:

```
task    seat                   role                         out   crit  surfaces
HVN-01  EMP-RA-001             Regulatory CMC Manager       docx    11  filesystem,records,lims,im
HVN-02  EMP-MSAT-002           Head of CMC and MSAT         docx    11  filesystem,records,im
HVN-03  EMP-MSAT-003           Principal MSAT Engineer      docx     9  filesystem,records,im
HVN-04  EMP-RA-001             Regulatory CMC Manager       docx    14  filesystem,records,lims,im
HVN-05  EMP-QA-001             QA Product Lead              docx     9  filesystem,records,im
HVN-06  EMP-VAL-001            Validation Engineer          docx     9  filesystem,records,im
HVN-07  EMP-SQ-002             Supplier Quality Manager     docx     8  filesystem,records,im
HVN-08  EMP-QA-001             QA Product Lead              docx     6  filesystem,records,lims,im
HVN-09  EMP-QC-005             QC Stability Scientist       xlsx    15  filesystem,records,lims,im
HVN-10  EMP-QC-005             QC Stability Scientist       xlsx    15  filesystem,records,lims,im
criteria: 107

systems-of-record views (records/views.json):
  dms.documents        DMS   352 rows  7 columns
  dms.versions         DMS   401 rows  6 columns
  qms.records          QMS    79 rows  6 columns
  erp.suppliers        ERP    17 rows  6 columns
  erp.equipment        ERP    34 rows  4 columns
  rim.portfolio        RIM     8 rows  5 columns
  erp.materials        ERP     4 rows  7 columns
  rim.submissions      RIM     3 rows  7 columns
  rim.correspondence   RIM     1 rows  8 columns
  dms.relations        DMS    25 rows  12 columns
  rim.commitments      RIM     1 rows  5 columns
  csv.systems          CSV    17 rows  5 columns
  dir.people           DIR   133 rows  6 columns
```

Each view is `{system, title, description, columns, rows}`. That is enough to serve them from a
small read-only tool if you are building your own harness.

## Set up the agent's workspace

*Get the files* already keeps the two sides apart. The agent gets `agent-workspace/<TASK>` and
nothing else. `Data/biopharma-bench/` holds `tasks_and_rubrics.json` (criteria included),
`records/` and the zips, and the agent must not be able to read it.

- **Confine the agent to its workspace.** Starting it in that directory is not enough, because
  most agent harnesses can read the parent and would find `Data/` beside it. Mount only
  `agent-workspace/<TASK>` into a container as the agent's working directory, or give the agent
  a separate machine or user that can see only that tree.
- **Use a fresh agent session.** The agent under test must not have loaded this skill, read
  `Data/`, or seen any earlier grading output. Run the grading side in a different session.
- **Give it the task as a colleague would.** Pass the `prompt` text and nothing else from the
  task record, and tell it the company date is `virtual_now`. The deliverable path is already in
  the prompt.
- **Decide on the records surface before the run.** If you serve `records/views.json` through a
  read-only tool, say so in the report. If you leave it out, the agent will fail criteria that
  need it. Either way, never copy `records/` into the workspace.
- **Collect the deliverable** at `agent-workspace/<TASK>/<deliverable>` after the run. For
  HVN-09 and HVN-10 the file already exists, so check its timestamp to see whether the agent
  touched it.

## Grade it with your own judge (not comparable with the leaderboard)

You can grade the deliverable against the published criteria with any judge you choose: a
model, or a person with GxP experience. Label the result **own-judge, filesystem-only**.

**It is not comparable with the leaderboard, for three reasons.**
- **The judge differs.** The leaderboard's judge is not yours.
- **The surfaces differ.** The published runs give the agent the records, LIMS and chat through an
  MCP server, and some criteria depend on facts found only there. An agent without those surfaces
  loses those criteria, whatever its ability. The same holds for any agent harness that has no
  MCP client.
- **The task set differs.** These are the 10 Havenor tasks, not the sealed 71.

First, write the judge's worklist and an empty verdict sheet, grader side, for the task fetched
above:

```python
import csv, json, os

OUT = "Data/biopharma-bench"                       # grader side, written by Get the files
TASK = "HVN-05"                                    # a task already fetched
man = json.load(open(os.path.join(OUT, "manifest.json")))
work = man["tasks"][TASK]["workspace"]
task = next(t for t in json.load(open(os.path.join(OUT, "tasks_and_rubrics.json")))
            if t["task_id"] == TASK)

deliverable = os.path.join(work, task["deliverable"])
grading = os.path.join(OUT, "grading")
os.makedirs(grading, exist_ok=True)

# One line per criterion for the judge: criterion text, the file to read, the workspace.
with open(os.path.join(grading, f"{TASK}.jsonl"), "w") as fh:
    for r in task["rubric"]:
        fh.write(json.dumps({"task_id": TASK, "verifier_id": r["verifier_id"],
                             "criteria": r["criteria"], "deliverable": deliverable,
                             "workspace": work}) + "\n")

# The sheet the judge fills: verdict is PASS, FAIL or ERROR; judge names who graded.
sheet = os.path.join(grading, f"{TASK}.verdicts.csv")
with open(sheet, "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["task_id", "verifier_id", "verdict", "judge"])
    for r in task["rubric"]:
        w.writerow([TASK, r["verifier_id"], "", ""])

print(f"{TASK}: {len(task['rubric'])} criteria -> {grading}/{TASK}.jsonl and {TASK}.verdicts.csv")
print("deliverable present:", os.path.exists(deliverable))
```

Run 2026-10-21, after *Get the files* and before any agent run:

```
HVN-05: 9 criteria -> Data/biopharma-bench/grading/HVN-05.jsonl and HVN-05.verdicts.csv
deliverable present: False
```

Each JSONL line gives the judge one criterion with the path of the file to read. Grade one
criterion at a time, so evidence for one cannot leak into another. The judge fills `verdict`
with `PASS`, `FAIL` or `ERROR`, and writes its own name in `judge`. Run the judge outside the
agent's confinement. Then roll the sheets up into the benchmark's metrics:

```python
import collections, csv, glob, json

def need(ok, msg):              # an explicit check: `assert` vanishes under python -O
    if not ok:
        raise SystemExit(msg)

OUT = "Data/biopharma-bench"
rubric = {t["task_id"]: [r["verifier_id"] for r in t["rubric"]]
          for t in json.load(open(f"{OUT}/tasks_and_rubrics.json"))}
rows = []
for path in sorted(glob.glob(f"{OUT}/grading/*.verdicts.csv")):
    rows += list(csv.DictReader(open(path, newline="")))
need(rows, f"no verdict sheets under {OUT}/grading/")

# Every row graded, by one named judge.
blank = [r["verifier_id"] for r in rows if r["verdict"].strip().upper() not in {"PASS", "FAIL", "ERROR"}]
need(not blank, f"{len(blank)} criteria have no verdict yet, e.g. {blank[:3]}")
unnamed = [r["verifier_id"] for r in rows if not r["judge"].strip()]
need(not unnamed, f"{len(unnamed)} rows name no judge, e.g. {unnamed[:3]}")
judges = {r["judge"].strip() for r in rows}
need(len(judges) == 1, f"one judge per run, found {sorted(judges)}")

# Each sheet covers its task's rubric exactly once: no missing, extra or duplicate rows.
by_task = collections.defaultdict(dict)
for r in rows:
    t, vid = r["task_id"], r["verifier_id"]
    need(t in rubric and vid in rubric[t], f"{vid} is not a criterion of {t}")
    need(vid not in by_task[t], f"duplicate verdict for {vid}")
    by_task[t][vid] = r["verdict"].strip().upper()
for t, got in by_task.items():
    missing = set(rubric[t]) - set(got)
    need(not missing, f"{t}: {len(missing)} criteria missing from the sheet")

scores = {}
for t, v in sorted(by_task.items()):
    v = list(v.values())
    if v.count("ERROR") == len(v):
        print(f"{t}: every criterion errored; not graded, left out of the mean")
        continue
    scores[t] = (v.count("PASS"), len(v), v.count("ERROR"))
    print(f"{t}: {v.count('PASS')}/{len(v)}  errors={v.count('ERROR')}")
need(scores, "no task was graded (every criterion errored); there is no score to report")

mean = sum(p / n for p, n, _ in scores.values()) / len(scores)
full = sum(1 for p, n, e in scores.values() if p == n)
print(f"judge {judges.pop()}: macro task mean {mean:.1%} over {len(scores)} task(s); "
      f"Pass@1 {full}/{len(scores)}. Own-judge, filesystem-only: not comparable with the leaderboard.")
```

The roll-up refuses to score until every row has a verdict, every row names the same judge,
and each task's sheet holds exactly its rubric's criteria, once each. It also refuses if every
criterion errored, because then there is nothing to score. On the blank sheet
above it stops with exit status 1 and `9 criteria have no verdict yet, e.g. ['HVN-05-R01', …]`.

## The leaderboard

The scored suite's results are on the benchmark's results page at eval.raycaster.ai, which
names each system, its agent harness and its reasoning setting. These numbers are
**observations**. They move whenever a system is added or re-run, and the published sources
already disagree with each other:

| source, as read 2026-10-21 | systems | best macro mean | best Pass@1 | systems passing no task |
|---|---|---|---|---|
| results page | 12 | 70.4% | 8 of 71 (two systems tied) | 4 |
| announcement post (2026-09-22) | 12 | 70.4% | 8 of 71 (two systems tied) | 5 |
| dataset card | 8 | 65.9% | 2 of 71 | 6 |

The post and the results page differ on one system's entry, which accounts for the 4 against
5. The card's list is an earlier, shorter roster. All of them agree on the suite itself: 71
tasks, 12 companies, 752 criteria, and one scored trial per task, so run-to-run variance is not
averaged out. Cost columns cover the agent only. Grading spend is excluded.

## What this skill will not do

It will not reproduce, paraphrase or summarise task prompts, criteria or desk contents, and it
does not point an agent at the criteria while it works. Reading the rubric before writing the
deliverable is the one way to make the score meaningless. It does not reach the sealed 71-task
suite, and it does not claim that a Havenor score predicts a leaderboard position. It does not
run the official grader, for the licence reason given above.

## Try it

**Data.** The Biopharma Bench public dataset on Hugging Face (`raycasterai/biopharma-bench`),
CC BY 4.0, ungated, no account needed, pinned at commit `c020c2d`. Last confirmed reachable
2026-10-21. The block reads only the 50 KB task file and the revision's metadata. It never
downloads a desk.

**Run.**

```python
import collections, json, urllib.request

REV = "c020c2d3fdbdd6164f59558cab2cf3dd43813f0f"
REPO = "https://huggingface.co/datasets/raycasterai/biopharma-bench"
API = "https://huggingface.co/api/datasets/raycasterai/biopharma-bench"

def get(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.load(r)

tasks = get(f"{REPO}/resolve/{REV}/tasks_and_rubrics.json")
meta = get(f"{API}/revision/{REV}")
files = {s["rfilename"] for s in meta["siblings"]}

FIELDS = {"task_id", "task_name", "world_id", "domain", "seat", "desk", "prompt", "virtual_now",
          "expected_output", "deliverable", "surfaces", "gold_response", "rubric"}
assert all(set(t) == FIELDS for t in tasks), "task schema changed; re-read the field table"
assert all(set(r) == {"verifier_id", "criteria"} for t in tasks for r in t["rubric"]), "rubric item schema changed"
assert meta["sha"] == REV and meta["gated"] is False, "revision moved or dataset became gated"
assert meta["cardData"]["license"] == "cc-by-4.0" and "LICENSE" in files, "licence changed"

# Every criterion belongs to its own task and every id is unique.
ids = [r["verifier_id"] for t in tasks for r in t["rubric"]]
assert len(ids) == len(set(ids)), "duplicate verifier_id"
assert all(r["verifier_id"].startswith(t["task_id"] + "-R") for t in tasks for r in t["rubric"])
# No reference answers ship: grading is rubric-only.
assert all(t["gold_response"] is None for t in tasks)
# Every desk a task names exists at this revision.
assert all(t["desk"] in files for t in tasks), "a task names a desk that is not in the repo"

# The trap: desks are keyed by task, not by employee. Two tasks share a seat
# and still get different desks; two other pairs genuinely share one.
by_seat = collections.defaultdict(set)
for t in tasks:
    by_seat[t["seat"]["employee_id"]].add(t["desk"])
split = sorted(s for s, d in by_seat.items() if len(d) > 1)
assert split, "no seat maps to two desks any more; the keying note is stale"

desks = {t["desk"] for t in tasks}
lims = [t["task_id"] for t in tasks if "lims" in t["surfaces"]]
per = [len(t["rubric"]) for t in tasks]
print(f"revision          : {meta['sha'][:12]}  ({meta['lastModified'][:10]})")
print(f"worlds / tasks    : {len({t['world_id'] for t in tasks})} / {len(tasks)}")
print(f"criteria          : {sum(per)}  (per task {min(per)}-{max(per)})")
print(f"desks / seats     : {len(desks)} / {len(by_seat)}  (seat with two desks: {', '.join(split)})")
print(f"deliverables      : {dict(collections.Counter(t['deliverable'].rsplit('.', 1)[-1] for t in tasks))}")
print(f"tasks needing LIMS: {', '.join(lims)}")
print("all assertions passed")
```

**Expect.**

Invariants. A failure here means this page is wrong, not that upstream moved:

- Every task carries the 13 fields in the table above, and every criterion is exactly
  `{verifier_id, criteria}`.
- Every `verifier_id` is unique and prefixed by its own task's ID.
- `gold_response` is null everywhere. The benchmark ships criteria, not answers.
- Every `desk` a task names exists in the repository at the pinned revision.
- At least one seat maps to two desks. That is the reason to unpack `task["desk"]` rather than
  anything derived from the employee.
- At the pinned revision the dataset is ungated and declares CC BY 4.0. The revision is a
  commit hash, so these hold until the commit itself disappears. If one fires, the pin is gone,
  and the counts below need re-reading too.

Observed 2026-10-21 at revision `c020c2d`. Treat a mismatch on a newer revision as drift to
investigate:

```
revision          : c020c2d3fdbd  (2026-09-24)
worlds / tasks    : 1 / 10
criteria          : 107  (per task 6-15)
desks / seats     : 8 / 7  (seat with two desks: EMP-QC-005)
deliverables      : {'docx': 8, 'xlsx': 2}
tasks needing LIMS: HVN-01, HVN-04, HVN-08, HVN-09, HVN-10
all assertions passed
```

`1 / 10` is the point of the first line. Whatever the leaderboard says about 71 tasks, this
dataset holds one company.

## Sources

- Dataset and card: [raycasterai/biopharma-bench](https://huggingface.co/datasets/raycasterai/biopharma-bench)
  on Hugging Face, CC BY 4.0. The card carries the contamination request and the canary. Read
  them there.
- Results page: [eval.raycaster.ai/benchmarks/biopharma-bench](https://eval.raycaster.ai/benchmarks/biopharma-bench/).
- Announcement: ["Biopharma Bench: Can Frontier Agents Do Real Professional Work?"](https://raycaster.ai/blog/biopharma-bench),
  Raycaster, 2026-09-22.
- Official runner and grader: the task package on the
  [Harbor hub](https://hub.harborframework.com/datasets/biopharma-bench/biopharma-bench)
  (`biopharma-bench/biopharma-bench`, version `v0.1`). It carries no licence file of its own.
  [Harbor](https://github.com/harbor-framework/harbor) itself is Apache-2.0.
