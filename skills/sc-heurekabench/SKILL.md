---
name: sc-heurekabench
description: Run sc-HeurekaBench, an ICLR 2026 benchmark of open-ended and multiple-choice single-cell questions, against an AI co-scientist agent. Get the question sets and the 29 GB corpus, split each question from the answer it ships with, and score a run.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, single-cell, agents, evaluation, public-data]
covers: [sc-heurekabench, heurekabench, agent benchmark, ai co-scientist, agent evaluation, open-ended questions, multiple choice, single-cell, scRNA-seq, snRNA-seq, ATAC-seq, multiome, h5ad, anndata, skeletal muscle, neuroblastoma, T cell, macrophage, microglia, neuron, endothelial, organoid, embryo, aging, myocarditis, COVID-19, infection, human, mouse, llm judge]
papers: [doi:10.48550/arXiv.2601.01678]
access: [open]
platform: huggingface
datasets: [https://raw.githubusercontent.com/mlbio-epfl/HeurekaBench/main/scheurekabench/benchmark/mcq_lite.json, https://raw.githubusercontent.com/mlbio-epfl/HeurekaBench/main/scheurekabench/benchmark/oeq_lite.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-09-18
  against: HeurekaBench repository at main (mlbio-epfl/HeurekaBench) / sibasmarakp/sc-HeurekaBench dataset revision of 2026-09-14 / Python 3.12
  executed: 6
  unverified: 4
  unverified_reason: >-
    The four unexecuted blocks each need something the validating environment does not
    have. Reassembling and extracting the corpus needs 29 GB of transfer and 44 GB of
    disk, and the Hugging Face LFS download path was refused on this run's network while
    the metadata API answered normally. Creating the conda environment, running an agent
    and scoring its output additionally need a hosted-LLM key and billed inference.
    Re-run all four from a workstation with the disk, an unrestricted route to Hugging
    Face, and a funded key.
---
# sc-HeurekaBench

**Thirteen published single-cell studies, turned into questions an agent has to answer by
analysing the studies' own data.** Each question is grounded in a finding the paper actually
reported, and the agent is graded against that finding rather than against a reference
implementation.

Two question formats ship side by side: **multiple-choice**, which scores deterministically,
and **open-ended**, which asks the agent to design and run a multi-step analysis and is scored
by an LLM judge. This skill gets you the questions, the data, and a correct scoring loop.

## Not a Heureka Labs project

The name collision is a coincidence and worth settling before anything else. **HeurekaBench is
an unrelated academic project** from the Brbić lab at EPFL, published at ICLR 2026. It is not
ours, we did not contribute to it, and nothing in this skill is a Heureka Labs benchmark. This
page documents somebody else's work, the same way the registry documents any other third-party
tool.

## What you need, and what you do not

**To inspect the benchmark — nothing.** The question sets are plain JSON in the public
repository, a few tens of kilobytes each. No account, no key, no download of the corpus. Most
of this page runs on that alone.

**To run an agent against it** you additionally need:

- **A hosted-LLM API key.** Every baseline in the tree drives a model over an API, and the
  open-ended scorer is itself an LLM judge, so scoring costs inference too. `.env.example`
  in the repository root names the keys the harness reads — `OPENAI_API_KEY` and
  `CLAUDE_API_KEY` for the closed baselines, plus `HF_TOKEN`, `HF_HOME` and
  `BIOMNI_DATA_PATH`.
- **73 GB of free disk** — 29 GB for the compressed parts and 44 GB for the extracted corpus,
  before you delete the parts.
- **GPUs**, but only if you serve an open-weights model yourself. The closed-model baselines
  need none.

Nothing here is behind an application or an approval. The code is MIT, the data is ungated
MIT, and the Hugging Face repository is public.

## Three licences in one tree, and it matters which agent you run

The repository is **not uniformly MIT**, and a reader who assumes it is can walk into terms
they did not agree to. Three separate licences sit in the checkout:

| Path | Licence | Covers |
|---|---|---|
| repository root | MIT | the framework, the question sets, the baselines, the scorers |
| `Biomni/` | Apache-2.0 | a vendored copy of the Biomni agent, version 0.0.6 |
| `scheurekabench/run_baselines/CellVoyager/` | MIT | a vendored copy of the CellVoyager agent |

`Biomni/` is a plain directory rather than a submodule, so it arrives with the clone whether or
not you intend to use it. Both licences are permissive and compatible with MIT.

**The sharper point is inside Biomni, not its licence.** `Biomni/license_info.md` lists six
components that the Biomni authors flag as **requiring a commercial licence** for commercial
use — among them the KEGG API, HOMER, OMIM, DDInter 2.0, the Human Protein Atlas and Guide to
PHARMACOLOGY — and names a permissive alternative for each. That file governs what the *agent*
may reach out to during a run; it does not restrict the benchmark. If you are evaluating
commercially, either route around those components or run a baseline that does not involve
Biomni at all. The plain LLM baselines and CellVoyager are both such routes, which is why no
reader is shut out.

## The question sets ship in the repository

You do not need the corpus to see what is being asked. Six files sit in
`scheurekabench/benchmark/`, all of them small:

```bash
BASE=https://raw.githubusercontent.com/mlbio-epfl/HeurekaBench/main/scheurekabench/benchmark
mkdir -p benchmark && cd benchmark
for f in mcq.json oeq.json mcq_lite.json oeq_lite.json mcq_tu.json oeq_tu.json; do
  curl -fsSL -o "$f" "$BASE/$f"
done
ls -la
```

Each file is a two-level object — `paper<N>` → `insight #<K>` → one record. Counting them,
against the repository at `main`:

```python
import json, re

FILES = ["mcq", "oeq", "mcq_lite", "oeq_lite", "mcq_tu", "oeq_tu"]
QMARK = re.compile(r"\*\*Question(\d+):\*\*")

for name in FILES:
    doc = json.load(open(f"benchmark/{name}.json"))
    key = "mcq_question" if name.startswith("mcq") else "oe_question"
    insights = sum(len(v) for v in doc.values())
    questions = sum(len(QMARK.findall(rec[key]))
                    for paper in doc.values() for rec in paper.values())
    print(f"{name:9s} {len(doc):2d} papers  {insights:3d} insights  {questions:3d} questions")
```

which prints:

```
mcq       13 papers   37 insights   50 questions
oeq       12 papers   41 insights   50 questions
mcq_lite   7 papers   14 insights   18 questions
oeq_lite   7 papers   17 insights   22 questions
mcq_tu     5 papers   11 insights   16 questions
oeq_tu     4 papers    9 insights   12 questions
```

Three things in that table are easy to get wrong:

- **`mcq` has 13 papers and `oeq` has 12.** `paper4` contributes multiple-choice questions and
  no open-ended ones. Do not assume the two sets are the same cohort, and do not index one by
  the other's keys.
- **Insights are not questions.** One insight frequently carries two or three questions in a
  single string. Reporting "37 questions" for `mcq` undercounts it by 13.
- **`_lite` is a paper-level subset, `_tu` is a different axis.** `_lite` cuts 13 papers to 7
  for agents that are expensive to run. `_tu` ("tool usage") selects the questions that require
  the agent to invoke tools, and is not a subset of `_lite`.

**Start with `_lite`.** A full sweep is 100 questions across 13 papers against 44 GB of data.

## Every question ships with its answer in the same string

This is the trap, and it is the one that silently invalidates a run.

The value under `mcq_question` / `oe_question` is not a question — it is a question *and its
answer*, concatenated. All 37 multiple-choice records and all 41 open-ended records carry
`**Answer<N>:**` inline. Hand that string to an agent verbatim and you have measured nothing.

The repository's own harness splits them before prompting, with a regex per format. Use the
same split rather than inventing one:

```python
import json, re

MCQ_RE = re.compile(
    r"\*\*Question(\d+):\*\*\s*(.*?)\s*((?:[A-D]\).*?(?:\s+))+?)\*\*Answer\1:\*\*\s*"
    r"([A-D](?:,[A-D])*)", re.DOTALL)
OEQ_RE = re.compile(r"\*\*Question(\d+):\*\*\s*(.*?)(?=\s*\*\*Answer\d+:|\Z)", re.DOTALL)

mcq = json.load(open("benchmark/mcq.json"))
raw = mcq["paper1"]["insight #1"]["mcq_question"]

print("LEAKS THE ANSWER:", "**Answer1:**" in raw)
for num, stem, options, answer in MCQ_RE.findall(raw):
    print(f"  Q{num} -> ask: {stem[:60]}...")
    print(f"        options: {options.split(chr(10))[0]} ...")
    print(f"        gold   : {answer}")
```

Two details the regexes encode, both of which bite a hand-rolled splitter:

- **A multiple-choice answer can be multi-letter.** `**Answer1:**B,D` is a real value in
  `paper1`. Parsing a single character truncates the gold answer and marks correct runs wrong.
- **There is not always a space after the marker.** `**Answer1:**B,D` has none, which is why
  the pattern uses `\s*` rather than a literal space.

Across the full files, both upstream patterns recover every question marker present — 50 of 50
in `mcq.json` and 50 of 50 in `oeq.json` — so if your own split returns fewer, the bug is
yours.

Because the answers are public and sit in the same repository as the questions, a model that
has seen the repository during training or retrieval has seen the answer key. That is a
property of the benchmark, not something this skill can fix; note it when you report a score,
and prefer the tool-usage subsets if contamination is a live concern for your model.

## Get the files

The questions come from the repository, above. The **single-cell corpus** comes from Hugging
Face, ungated and needing no token.

First, confirm what you are about to download and that it is still open:

```python
import json, urllib.request

API = "https://huggingface.co/api/datasets/sibasmarakp/sc-HeurekaBench"
meta = json.load(urllib.request.urlopen(API, timeout=60))
print("gated   :", meta.get("gated"))
print("private :", meta.get("private"))
print("license :", meta.get("cardData", {}).get("license"))

tree = json.load(urllib.request.urlopen(API + "/tree/main", timeout=60))
parts = [e for e in tree if e["path"].startswith("scdata.part")]
total = sum(e.get("size") or 0 for e in parts)
for e in sorted(parts, key=lambda e: e["path"]):
    print(f"  {e['path']:18s} {e.get('size'):>14,}")
print(f"{len(parts)} parts, {total:,} bytes ({total / 1024**3:.2f} GiB)")
```

Observed on 2026-09-18: `gated False`, `private False`, `license mit`, six parts totalling
29,070,546,131 bytes (27.07 GiB). Five parts are exactly 5 GiB; `scdata.part_af` is the
remainder.

Then reassemble, verify and extract. The checksum step is not optional — a truncated 29 GB
download is the obvious failure mode here, and it surfaces as confusing analysis errors many
minutes later rather than as a download error:

```bash
REPO=https://huggingface.co/datasets/sibasmarakp/sc-HeurekaBench/resolve/main
for p in aa ab ac ad ae af; do
  curl -fL -C - -o "scdata.part_$p" "$REPO/scdata.part_$p"
done
curl -fL -o scdata.tar.zst.sha256 "$REPO/scdata.tar.zst.sha256"

cat scdata.part_* > scdata.tar.zst
sha256sum -c scdata.tar.zst.sha256          # must print: scdata.tar.zst: OK
tar -I zstd -xf scdata.tar.zst              # extracts to scheurekabench/benchmark/scdata/
du -sh scheurekabench/benchmark/scdata/     # expect ~44 GB

rm scdata.part_* scdata.tar.zst
chmod -R a+r scheurekabench/benchmark/scdata/
```

The final `chmod` is load-bearing rather than tidiness: it is what stops an agent overwriting
the corpus mid-run and silently changing the inputs of every later question.

**There is no per-paper download.** The archive is all-or-nothing, so inspecting one study's
data still costs the full 29 GB. Take the checksum from the repository at download time rather
than from this page — pinning a digest here would go stale against a re-upload and tell you
the wrong thing.

The questions reference the corpus by relative path, and you can see exactly which files a run
will touch before fetching anything:

```python
import json, collections, os

mcq = json.load(open("benchmark/mcq.json"))
files = {p for paper in mcq.values() for rec in paper.values() for p in rec["data"]}
ext = collections.Counter(os.path.splitext(p)[1] for p in files)
print(f"{len(files)} distinct data files referenced by mcq.json")
print("by extension:", dict(ext))
print("example:", sorted(files)[0])
```

Paths are written relative to `scheurekabench/`, as
`benchmark/scdata/paper<N>/data/<file>`. Upstream recommends rewriting the `data` keys to
absolute paths before a run, because agents given relative paths often fail to locate the
files.

## Running an agent

Create the environment upstream specifies, then copy `.env.example` to `.env` and fill in the
keys you actually need:

```bash
conda create -n heurekabench python=3.12 -y
conda activate heurekabench
pip install vllm==0.11.0
pip install python-dotenv PyMuPDF openai anthropic nbformat
cp .env.example .env
```

`vllm` is only required if you serve open-weights models locally; the closed-model baselines
run without it.

### The four runners disagree about their own flags

Read this table before copying a command from anywhere, including upstream's README. The four
entry points were clearly written at different times, and **the README's invocation for
`run_closed_llms.py` uses a flag that script does not accept.** These rows were read off the
`argparse` blocks in each file at `main`, not off the documentation:

| runner | dataset flag | model flag | `--q_type` checked? |
|---|---|---|---|
| `run_baselines/run_open_llms.py` | `--dataset_json_path` | `--llm_name`, free text | yes |
| `run_baselines/run_closed_llms.py` | **`--dataset_json`** | `--llm_name`, `GPT` or `CLAUDE` only | yes |
| `run_baselines/CellVoyager/run_cellvoyager.py` | `--dataset_json_path` | `--cellvoyager_llm`, free text | no |
| `run_biomni/run_biomni.py` | **`--dataset_json`** | `--biomni_llm`, free text | no |

`--q_type` takes `mcq` or `oe` — **`oe`, not `oeq`**, even though the file is `oeq.json`. Only
the two `run_baselines` scripts constrain it; CellVoyager and Biomni accept any string and will
take a typo some distance into a paid sweep before anything goes wrong.

```bash
cd scheurekabench

# 1. a plain hosted LLM, no analysis environment. Note --dataset_json.
python run_baselines/run_closed_llms.py \
    --dataset_json benchmark/mcq_lite.json \
    --output_dir runs/plain-mcq \
    --llm_name GPT \
    --q_type mcq

# 2. CellVoyager. Note --dataset_json_path, and a free-text model flag.
cd run_baselines/CellVoyager && python run_cellvoyager.py \
    --dataset_json_path ../../benchmark/mcq_lite.json \
    --output_dir ../../runs/cellvoyager-mcq \
    --cellvoyager_llm <model-id> \
    --q_type mcq

# 3. Biomni. Back to --dataset_json.
cd ../.. && python run_biomni/run_biomni.py \
    --dataset_json benchmark/mcq_lite.json \
    --biomni_llm <model-id> \
    --q_type mcq \
    --output_dir runs/biomni-mcq
```

**`run_closed_llms.py` does not let you choose a model.** `--llm_name` selects a *provider* —
the two accepted values pick between the OpenAI client and the Anthropic client — and the model
itself comes from a hardcoded default constant near the top of the file. To benchmark a
different hosted model you edit that constant; passing a model identifier will be rejected by
`choices`. The file also contains a third branch for a newer model family that `choices` makes
unreachable, so do not read the body of `main` as the list of what you can pass.

The two agent runners take a free-text model flag and do pass it through, so `<model-id>` there
is a real model identifier of your choosing. The page does not pin one, because the model under
test is the variable you are changing.

`run_closed_llms.py` also composes its own output path, nesting results under the dataset
file's parent directory name, then the provider, then the question type — so `--output_dir` is
a prefix rather than the final destination.

To evaluate your own agent, upstream's guidance is to copy `run_biomni.py` and replace only the
agent instantiation; the argument handling, prompting and output layout stay as they are.

## Scoring

Scoring is two commands, and the first one is easy to skip and then be confused by:

```bash
python extract_agent_answer.py --root_dir runs/biomni-mcq

python evaluate_agent_answer.py \
    --dataset_json benchmark/mcq_lite.json \
    --results_json runs/biomni-mcq/processed_results.json \
    --q_type mcq
```

`extract_agent_answer.py` pulls the text between `<solution>` tags out of each run and writes
`processed_results.json`. Runs that crashed, hit a segmentation fault or stopped before
emitting a solution produce empty entries, and the judge will score those as failures rather
than skipping them. Upstream's advice is to delete those output files and re-run the affected
questions before scoring, and it is worth following — otherwise infrastructure flakes are
recorded as model errors.

**Open-ended scoring uses an LLM judge**, and that has consequences worth stating plainly:

- The judge is a hosted model called through the OpenAI client, with a default judge
  identifier and `top_logprobs: 3` set in `evaluate_agent_answer.py`'s `oe_specs`. It reads
  the judge's token probabilities to produce a weighted score rather than a bare verdict.
- **The judge is part of the measurement.** Changing the judge changes the numbers, so pin it
  and report it alongside the score. Comparing two agents judged by different models, or by
  the same model months apart, is not a comparison.
- `--batch_oe_judge` routes the open-ended judging through the provider's batch API, which is
  markedly cheaper for a full sweep and returns asynchronously.

Multiple-choice scoring needs no judge — the gold answer is the letter set parsed out of the
question string, so it is deterministic and free.

## What this skill will not do

- **It will not fetch the corpus for you.** 29 GB is a deliberate decision for the reader.
- **It will not pick your model, or your judge.** Both are the experiment.
- **It will not reproduce a published leaderboard number.** Agent runs are stochastic, the
  judge drifts across versions, and upstream's reported figures were produced with models and
  a Biomni version pinned at paper time.

## Try it

A self-contained check that this skill still holds. Public data, no account, no key, and
nothing larger than 80 KB. Run it in an empty directory.

**Data** — the two `_lite` question sets, served raw from the repository at `main`:

    https://raw.githubusercontent.com/mlbio-epfl/HeurekaBench/main/scheurekabench/benchmark/mcq_lite.json
    https://raw.githubusercontent.com/mlbio-epfl/HeurekaBench/main/scheurekabench/benchmark/oeq_lite.json

Both are MIT, ungated, and need no token. Last confirmed reachable 2026-09-18. The check
routes through the answer-leak trap on purpose — the first thing it asserts is that the raw
string is unsafe to prompt with.

```python
import json, re, urllib.request

BASE = ("https://raw.githubusercontent.com/mlbio-epfl/HeurekaBench/main"
        "/scheurekabench/benchmark")
get = lambda n: json.load(urllib.request.urlopen(f"{BASE}/{n}", timeout=60))

MCQ_RE = re.compile(
    r"\*\*Question(\d+):\*\*\s*(.*?)\s*((?:[A-D]\).*?(?:\s+))+?)\*\*Answer\1:\*\*\s*"
    r"([A-D](?:,[A-D])*)", re.DOTALL)
OEQ_RE = re.compile(r"\*\*Question(\d+):\*\*\s*(.*?)(?=\s*\*\*Answer\d+:|\Z)", re.DOTALL)
QMARK = re.compile(r"\*\*Question(\d+):\*\*")

mcq, oeq = get("mcq_lite.json"), get("oeq_lite.json")

# INVARIANT: the shipped string carries the answer. This is the whole trap.
leaky = [(p, i) for p, ins in mcq.items() for i, r in ins.items()
         if re.search(r"\*\*Answer\d+:\*\*", r["mcq_question"])]
assert len(leaky) == sum(len(v) for v in mcq.values()), "answers no longer inline"
print("mcq_lite records carrying an inline answer:", len(leaky), "of", len(leaky))

# INVARIANT: the upstream split recovers every question marker present.
for name, doc, key, pat in [("mcq_lite", mcq, "mcq_question", MCQ_RE),
                            ("oeq_lite", oeq, "oe_question", OEQ_RE)]:
    raw = sum(len(QMARK.findall(r[key])) for p in doc.values() for r in p.values())
    got = sum(len(pat.findall(r[key])) for p in doc.values() for r in p.values())
    assert raw == got, f"{name}: parser recovered {got} of {raw}"
    print(f"{name}: {len(doc)} papers, {sum(len(v) for v in doc.values())} insights, "
          f"{raw} questions, parser recovered {got}")

# INVARIANT: a gold answer may be multi-letter. Truncating it marks correct runs wrong.
golds = [g for p in mcq.values() for r in p.values()
         for *_, g in MCQ_RE.findall(r["mcq_question"])]
assert golds and all(re.fullmatch(r"[A-D](,[A-D])*", g) for g in golds)
print("multi-letter gold answers:", sum("," in g for g in golds), "of", len(golds))

# INVARIANT: the prompt-safe stem must not contain the answer marker.
stem = MCQ_RE.findall(mcq["paper2"][sorted(mcq["paper2"])[0]]["mcq_question"])[0][1]
assert "**Answer" not in stem
print("prompt-safe stem:", stem[:70].replace("\n", " "), "...")

# INVARIANT: data paths are relative to scheurekabench/ and point into scdata/.
paths = {p for doc in (mcq, oeq) for pa in doc.values()
         for r in pa.values() for p in r["data"]}
assert paths and all(p.startswith("benchmark/scdata/paper") for p in paths)
print("distinct data files referenced by the lite sets:", len(paths))

# OBSERVED 2026-09-18 — drift here means the benchmark changed, not that it broke.
print("--- observed 2026-09-18 ---")
print("mcq_lite 7 papers / 14 insights / 18 questions;",
      "oeq_lite 7 papers / 17 insights / 22 questions")
```

Expect, on the revision current at 2026-09-18:

```
mcq_lite records carrying an inline answer: 14 of 14
mcq_lite: 7 papers, 14 insights, 18 questions, parser recovered 18
oeq_lite: 7 papers, 17 insights, 22 questions, parser recovered 22
multi-letter gold answers: 4 of 18
prompt-safe stem: The dataset indicates that myeloid cell expansion in myocarditis is ch ...
distinct data files referenced by the lite sets: 13
--- observed 2026-09-18 ---
mcq_lite 7 papers / 14 insights / 18 questions; oeq_lite 7 papers / 17 insights / 22 questions
```

**Invariants** — answers inline in every record, the upstream parsers recovering every marker,
gold answers matching `[A-D](,[A-D])*`, the split stem being answer-free, and every data path
sitting under `benchmark/scdata/paper…`. A failure in any of those means this page is wrong.

**Observed** — the paper, insight, question and file counts, and the multi-letter tally. These
are dated. A mismatch means upstream revised the benchmark and this page needs re-checking, not
that anything is broken.

## Sources

- Repository — https://github.com/mlbio-epfl/HeurekaBench (MIT)
- Corpus — https://huggingface.co/datasets/sibasmarakp/sc-HeurekaBench (MIT, ungated)
- Paper — HeurekaBench, A Benchmarking Framework for AI Co-scientist, ICLR 2026,
  https://arxiv.org/abs/2601.01678
- Project site — https://brbiclab.epfl.ch/projects/heurekabench/
