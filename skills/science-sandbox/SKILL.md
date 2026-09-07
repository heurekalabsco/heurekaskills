---
name: science-sandbox
description: Run the Science Sandboxes agent benchmarks — CodonBox rule discovery and MPRAbox regulatory-sequence design — to measure how well an AI agent does autonomous experimental science. Covers setup, the sealed oracle contract, scored runs, and grading.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, agent-evaluation, sequence-design, protein-folding, experimental-design]
allowed-tools: Read, Write, Edit, Bash
datasets: []
verified:
  date: 2026-09-07
  against: science-sandbox @ 2812348 / gcc 13.3.0 / Python 3.11.15
  executed: 9
  unverified: 3
  unverified_reason: >-
    Three blocks need credentials or a large third-party download the validating
    environment did not have. The CodonBox agent loop needs an API key and 500 model
    calls per world. The two MPRAbox blocks need a CUDA PyTorch install and the ~700 MB
    Malinois checkpoint, which setup.sh pulls from storage.googleapis.com. Re-run from a
    host with an API key, outbound access to that bucket, and a GPU.
---
# Science Sandboxes

Two sealed environments for measuring whether an agent can actually do experimental
science — not recall it. In each, the agent gets one action, a budget of experiments,
and no explanation of the system it is probing.

- **CodonBox** — an invented genetic system. The agent submits a sequence, gets back a
  single number, and has to work out how the world converts sequence into fitness.
- **MPRAbox** — regulatory-sequence library design, scored by a pretrained model acting
  as the experimental oracle.

Both are scored against ground truth the agent never sees. This skill covers getting
them running and reading what comes out.

## What this skill deliberately withholds

A benchmark's scores are only worth something while its task material stays unseen, and
a skill is loaded straight into an agent's context — which is precisely the
contamination path. So the split here is deliberate:

**Documented:** installation, building the substrate, the oracle's interface contract,
how to launch a scored run, and how to read the grading output.

**Not documented, on purpose:** task prompts, per-world structural parameters, the
hidden codon tables, held-out evaluation set identities, and reference trajectories.
All of it is in the repository, where a human setting up a run can read it deliberately.

One case is worth stating plainly, because it is easy to leak by accident. CodonBox
tells the agent only the alphabet and the sequence length. That sequences contain
codons at all, how long a codon is, which positions carry information, whether they
act additively — every bit of that is what the agent is being scored on inferring.
Publishing a per-world parameter table into a document agents read would hand over the
answer. If you extend this skill, keep that line.

## Requirements

Before anything below runs:

- **git**, a **C compiler**, and **Python 3.11+**. The folding substrate and the
  CodonBox oracle need nothing else and run fully offline.
- **For the CodonBox agent loop only** — an Anthropic API key in `ANTHROPIC_API_KEY`,
  and `pip install anthropic`. A run is one model call per experiment, 500 experiments
  per world by default, against a conversation that grows all run. Price a single world
  before launching all eight.
- **For MPRAbox only** — a ~700 MB Malinois checkpoint download, PyTorch, and in
  practice a GPU. The checkpoint is covered by the **boda2** licence (AGPL-3.0), which
  is separate from this repository's MIT and applies to the weights themselves.

## Get the code

```bash
git clone https://github.com/asr2210/science-sandbox
cd science-sandbox
```

MPRAbox's `boda2` dependency is a git submodule, fetched later by its own setup step —
you do not need `--recurse-submodules` for CodonBox.

## CodonBox

### The scoring substrate

Underneath the invented genetics is one fixed piece of physics, shared by every world.
Each 16-residue chain of hydrophobic (`H`) and polar (`P`) residues is folded
exhaustively on a two-dimensional square lattice and scored by the classic HP contact
potential (Dill): **its fitness is the count of favourable non-consecutive H–H contacts
in the best fold it can reach**. Because that space is small enough to enumerate
completely, every world inherits the same known ceiling — which is what makes scores
comparable from one world to the next.

Build it:

```bash
cd codonbox
gcc -O3 -o hpfold hpfold.c
./hpfold build 16 contacts_rebuilt.bin
```

That enumerates the self-avoiding walks once and caches the contact lists — 802,075
folds, well under a second. The repository already ships `contacts_16.bin` and
`table_16.bin`, so this is a rebuild rather than a prerequisite.

Build to a fresh filename rather than over the shipped one, because that makes the
artefacts checkable — both reproduce byte-for-byte from source:

```bash
cmp contacts_rebuilt.bin contacts_16.bin && echo "contacts reproduce byte-for-byte"
```

The full fitness lookup over all 2^16 chains is optional and much slower — about eight
minutes single-threaded, producing exactly 327,680 bytes (65,536 entries of one signed
byte of energy plus a `uint32` degeneracy). The oracle folds on demand when it is
absent, so skip it unless you are running many worlds:

```bash
./hpfold enumerate contacts_16.bin 16 table_rebuilt.bin
cmp table_rebuilt.bin table_16.bin && echo "fitness table reproduces byte-for-byte"
```

### Score a chain directly

`score` takes an H/P chain and prints two numbers — the energy and the degeneracy (how
many distinct optimal folds achieve it):

```bash
./hpfold score contacts_16.bin HHHHHHHHHHHHHHHH
./hpfold score contacts_16.bin PPPPPPPPPPPPPPPP
```

Fitness is the negated energy, so `-9 69` is a fitness of 9 reached 69 different ways.
**Nine is the ceiling for a 16-residue chain** — an invariant of the lattice, not of any
particular world, and the denominator every run is graded against. The all-polar chain
prints `0 802076`: with no hydrophobic residues there are no contacts to make, so every
fold ties for optimal.

### The oracle contract

This is the part to understand before you interpret anybody's run. The oracle is
deliberately silent: **every string is accepted and scored**. A sequence that uses
characters outside the alphabet, or that does not divide into exactly the right number
of codons, simply returns fitness 0 — no error, no hint about what was wrong.

That design has a consequence when you read results. A long opening run of zeros is
normally the agent failing to find the encoding at all, not a broken harness — and the
two look identical from the outside unless you know this.

You can exercise the whole stack offline against a world you build yourself, which
keeps the benchmark's own worlds out of it:

```bash
python3 - <<'PY'
from world import make_world
from oracle import Oracle

w = make_world("demo", alphabet_size=4, codon_length=3, seed="demo-seed")
print("alphabet:", w.alphabet, "codons:", len(w.code))
print("H codons:", sum(1 for v in w.code.values() if v == "H"), "of", len(w.code))

o = Oracle(w, n_residues=16, contacts_path="contacts_16.bin", folder_bin="./hpfold")
print("outside alphabet ->", o.query("Z" * 48))
print("wrong length     ->", o.query("A" * 47))
print("well-formed      ->", o.query("ABCD" * 12))
PY
```

Codon tables come out of a deterministic construction seeded from the world's own
parameters, with the assignment balanced so that half of them map to `H` — 32 of 64
above. Because that seed is pinned, a world rebuilt today grades identically to the run
that originally used it.

To see which worlds ship, ask the catalogue rather than hardcoding a list:

```bash
python3 - <<'PY'
from world import build_catalogue
print(sorted(build_catalogue()))
PY
```

### Drive a scored run

Each run is one experiment per turn — the harness enforces a single query per model
turn, so the agent has to think between experiments instead of sweeping in a loop. It
also keeps an append-only notebook, which is the artefact a human grades the reasoning
from.

```bash
pip install anthropic
export ANTHROPIC_API_KEY="your-key"
export MODEL_ID="the-model-identifier-your-account-serves"
python harness.py earthlike --budget 500 --model "$MODEL_ID"
```

`earthlike` is the control world; `--budget` is the experiment count. Set `MODEL_ID` to
whatever identifier your account serves — the harness defaults to one that may not
match your access.

### Read the results

Each run writes to `runs/<world>/`: the notebook, a JSONL of every query, a transcript,
and `summary.json` with the grading fields. Read the score from the summary:

```bash
python3 - <<'PY'
import json, pathlib

for p in sorted(pathlib.Path("runs").glob("*/summary.json")):
    d = json.load(open(p))
    # Deliberately not printing best_sequence — it is solution material for that world.
    print(f"{d['world']:>20}  {d['queries_used']:>4}/{d['budget']} queries  "
          f"fitness {d['best_fitness']}/{d['true_optimum_fitness']}  "
          f"({d['fraction_of_optimum']:.0%} of optimum)")
PY
```

`fraction_of_optimum` is the headline number. Note what it does *not* capture: an agent
can stumble onto a high-fitness sequence without ever understanding the world, which is
why the notebook is graded separately by a human. There is no automated grader for the
reasoning, by design.

`runs/<world>/GROUND_TRUTH.json` holds the world's true structure. It exists for
post-hoc grading — keep it out of any context an evaluated agent can see, and out of
anything you publish.

## MPRAbox

MPRAbox scores library *design* rather than rule discovery. In each design round the
agent produces a library of 50,000 200 bp sequences; the Malinois model labels them as
a sealed in-silico assay; those labels then train a surrogate model from scratch, which
is scored on held-out test sets. The agent is given only the per-set Pearson
correlations and their mean — never sequence-level predictions, set identities, or
anything about the oracle's internals.

Setup is the heavy part. It wants its own environment, and `setup.sh` then clones
`boda2`, pulls the ~700 MB checkpoint, builds the evaluation index, and ends with a
correlation sanity check against the oracle:

```bash
cd mprabox
python3.12 -m venv venv && source venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cu128
pip install numpy scipy pandas matplotlib lightning
bash setup.sh
```

The CUDA wheel index above is the project's own choice; substitute the build matching
your hardware.

Scoring is the agent-facing half. `prepare.py` takes a directory holding three sequence
files — `sequences_0.txt`, `sequences_1.txt`, `sequences_2.txt` — and returns
measurements, so the designing agent treats it the way it would a collaborator running
the assay:

```bash
python prepare.py path/to/your_library/
```

The `instructions/` directory holds one task file per condition; a run starts by
copying the variant you are testing to `instructions.md` and pointing a coding agent at
it. Which variant you chose is what makes two runs comparable, so record it alongside
the score. Completed runs ship under `results/`, laid out by condition — the quickest
way to see the expected output shape before generating your own.

*Both MPRAbox blocks above are unexecuted here — see `verified.unverified_reason`.*

## Try it

**Data** — none fetched. The substrate is enumerated locally by the block itself, and
the world is one you construct, so nothing external is queried and nothing can rot.
The only network access is cloning the repository (MIT).

**Run** — in a fresh empty directory:

```bash
git clone --depth 1 https://github.com/asr2210/science-sandbox
cd science-sandbox/codonbox
gcc -O3 -o hpfold hpfold.c
./hpfold build 16 contacts_rebuilt.bin
cmp contacts_rebuilt.bin contacts_16.bin && echo "contacts reproduce byte-for-byte"
echo "--- ceiling ---"
./hpfold score contacts_16.bin HHHHHHHHHHHHHHHH
python3 - <<'PY'
from world import make_world
from oracle import Oracle
w = make_world("demo", alphabet_size=4, codon_length=3, seed="demo-seed")
o = Oracle(w, n_residues=16, contacts_path="contacts_16.bin", folder_bin="./hpfold")
print("H codons:", sum(1 for v in w.code.values() if v == "H"), "of", len(w.code))
print("outside alphabet:", o.query("Z" * 48)["fitness"])
print("well-formed:", o.query("ABCD" * 12)["fitness"])
PY
```

**Expect** —

*Invariants* (a failure here means the skill or the tool is wrong):

- `build 16` reports **802,075 folds**.
- The all-hydrophobic chain scores energy **-9**, i.e. fitness 9 — the ceiling for 16
  residues. No chain scores better.
- The codon table is balanced: **32 H of 64** codons for a 4-letter alphabet with
  3-character codons.
- A sequence using characters outside the alphabet scores **0**, silently.

*Observed, 2026-09-07, science-sandbox @ 2812348* (a mismatch is drift to investigate,
not a bug):

- `score` on the all-H chain prints `-9 69` — 69 distinct optimal folds.
- The well-formed query in the `demo` world returns fitness **7**.
- `contacts_16.bin` is 6,719,114 bytes and reproduces byte-identically against the
  copy committed to the repository.

## Licence and citation

The repository is MIT (© 2025 Ananth Rao). The Malinois weights MPRAbox uses are
governed separately by the boda2 licence (AGPL-3.0) — it restricts redistribution of
the model, not your use of the benchmark.

The sandboxes accompany *Science sandboxes measure the scientific capability of AI
agents* (arXiv:2608.30165). Cite that, and say which commit you ran — the worlds are
seed-pinned, so a commit identifies the exact benchmark you scored against.
