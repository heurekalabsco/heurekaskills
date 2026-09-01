---
name: mdarena
description: Access MDArena, 50 containerised molecular dynamics tasks — system preparation, parameterization, trajectory analysis, free energy, enhanced sampling — used to score coding agents. Map the catalogue and the per-task resource contract, check the force-field and PDB provenance, and find which 43 of the 50 run from a bare clone. Reads metadata only and never task content.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, agents, evaluation, molecular-dynamics, public-data]
covers: [mdarena, molecular dynamics, md simulation, benchmark, agent evaluation, computational chemistry, gromacs, amber, openmm, plumed, openff, openfe, mdanalysis, rdkit, orca, charmm36, opls-aa, force field, free energy, fep, abfe, rbfe, umbrella sampling, expanded ensemble, membrane protein, gpcr, protein data bank, canary, contamination, harbor]
papers: [doi:10.48550/arXiv.2608.02642]
access: [open, registered]
datasets: [https://raw.githubusercontent.com/weitse-hsu/MDArena/v0.1.0/docs/DATA_PROVENANCE.md, https://raw.githubusercontent.com/weitse-hsu/MDArena/v0.1.0/scripts/external_inputs.toml, https://data.rcsb.org/rest/v1/core/entry/4EIY]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-29
  against: MDArena v0.1.0 (commit d50547a, the same commit main points at) / Harbor 0.22.0 / Python 3.12.8 / git 2.39.0 / macOS arm64
  executed: 14
  unverified: 2
  unverified_reason: >-
    The two blocks that build the container image and run a scored task were not executed.
    Between them they need a container runtime the validating environment does not have, an
    amd64 host or emulation for a CUDA base image, roughly an hour of from-source GROMACS
    build, and an Anthropic credential for the verifier that all 50 tasks declare. Re-run
    them on a Linux amd64 host with Docker and that credential. Everything else here —
    the catalogue, the schema sweep, the gating map, the provenance check, the licence
    check, the Harbor install and CLI surface, the repository's own task validator and both
    contamination-audit scripts — ran end to end.
---
# MDArena

**Fifty molecular dynamics workflows, containerised and scored.** Each task hands an agent a
real system — a receptor in a bilayer, a trajectory, an alchemical setup — and a written
objective, and grades what comes back twice over — a deterministic correctness check on the
outputs, and a language-model judge scoring how the work was done. The tasks came out of
working computational chemistry projects rather than being written as exercises, and the
software is what that work actually uses.

This skill is the index and access layer. It gets you the catalogue, the per-task resource
contract, the third-party data provenance, the map of what you can and cannot run, and the
runner. **It never touches a task's instructions, verifier, rubric or reference solution**,
and the reason is the next section.

## Do not load this skill inside an MDArena evaluation run

A skill is loaded into an agent's context. An agent being *scored* on MDArena that also
carries a document about MDArena is contaminated — not because anything here reveals an
answer, but because knowing the shape of the benchmark, the categories, the resource limits
and the fact that a judge scores the process is itself information the measurement assumes
the agent does not have.

So: use this to plan, choose and audit a sweep, from outside. Do not install it into the
agent under test. No other page in this registry carries that risk as sharply, because no
other page is about the benchmark its reader may be sitting inside.

The project asks for the same thing in the other direction. `CANARY.md` at the repository
root asks that everything under `tasks/` — prompts, inputs, verifiers, rubrics, reference
outputs, reference solutions — stay out of language-model training corpora, and embeds two
marker GUIDs per file so corpus filters can drop them. That request is narrow and it is
worth honouring exactly as written: it covers the task material, not the runner, not the
install, not the submission flow. Read it at
[CANARY.md](https://github.com/weitse-hsu/MDArena/blob/v0.1.0/CANARY.md); do not reproduce
either GUID anywhere, including here. Copying that string into an unrelated public document
is what destroys the attribution it exists to provide.

## What you need, and when

| To do this | You need |
|---|---|
| Everything down to *Get the files* — catalogue, schema, provenance, gating map | `git` 2.37+, Python 3.11+, and network. No account, no container, no key |
| Install the runner and inspect it | Python 3.12 or newer |
| Build the images and run a scored task | a container runtime, an amd64 host or emulation, and an **Anthropic credential** |
| Task `38_pept2_qm_cluster_orca` | an ORCA distribution, obtained through FACCTs registration |

**The judge is not optional.** All fifty tasks declare `CLAUDE_CODE_OAUTH_TOKEN` under
`[verifier.env]`, so end-to-end scoring needs either a subscription token or
`ANTHROPIC_API_KEY` for metered billing. Harbor can be told to skip verification, but then
nothing is graded, and the submission checker reports any such trial as a `verifier-disabled`
finding — so there is no scored path around the credential. That is stated here, before
anything that runs a task, because it is the requirement most likely to be discovered late.

**No GPU is required**, which is not what the base image suggests. See *The `task.toml`
contract* below — the number is checked, not assumed.

## Get the index without the 222 MB clone

A full clone is roughly 222 MB packed and about half a gigabyte checked out, because the
tasks ship trajectories and structures. You do not need any of that to plan a sweep. A
blobless sparse clone pulls the metadata layer in a couple of seconds.

```bash
set -euo pipefail

# Blobless, sparse, pinned to the tagged release. Pulls the 50 task.toml files,
# the 50 per-task Dockerfiles, the repository's own tooling and its top-level
# documents — and none of the instructions, verifiers or reference solutions.
git -c advice.detachedHead=false clone --quiet \
    --branch v0.1.0 --depth 1 --filter=blob:none --sparse \
    https://github.com/weitse-hsu/MDArena.git mdarena-meta
git -C mdarena-meta sparse-checkout set --no-cone \
    'tasks/*/task.toml' 'tasks/*/environment/Dockerfile' \
    'docs/**' 'scripts/**' '/*.md' '/LICENSE' '/no-github-access.yaml'

echo "commit      $(git -C mdarena-meta rev-parse HEAD)"
echo "task.toml   $(ls -d mdarena-meta/tasks/*/task.toml | wc -l | tr -d ' ')"
echo "Dockerfile  $(ls -d mdarena-meta/tasks/*/environment/Dockerfile | wc -l | tr -d ' ')"
echo "on disk     $(du -sh mdarena-meta | cut -f1)"
```

Run 2026-08-29, about three seconds:

```
commit      d50547af07a4de9720c95ae42450ee3d49b8ae14
task.toml   50
Dockerfile  50
on disk     1.1M
```

Three things about that command are deliberate. **`--filter=blob:none` with `--sparse`**
fetches file contents lazily and checks out nothing until the pattern is set, so the
trajectories are never transferred. **`--no-cone`** is required because cone mode matches
whole directories and the point here is to take one file out of each task directory — it
arrived in git 2.37, and a pattern naming a single file wants a leading slash or git warns.
**`--branch v0.1.0`** pins the release the published results were produced against. When
this page was first written `main` and `v0.1.0` were the same commit, so the pin looked
free; `v0.2.0` has since shipped and `main` has moved off it, so an unpinned clone now
gets a different tree. The pin is doing real work.

The sparse pattern is also the boundary this skill respects, expressed as a checkout rather
than as a promise: `instruction.md`, `tests/` and `solution/` are simply not on disk.

## Licence — unmodified MIT, and why GitHub says otherwise

GitHub reports `NOASSERTION` for this repository, which reads as "no usable licence" and is
wrong. The `LICENSE` file is the canonical MIT text with a `THIRD-PARTY MATERIAL` section
appended after a horizontal rule, and the appended section is what defeats the classifier.
Check it rather than taking either GitHub's word or this paragraph's.

```python
import json, pathlib, re, urllib.request

LICENSE = pathlib.Path("mdarena-meta/LICENSE").read_text()

# Split at the horizontal rule and test the grant on its own against SPDX's
# canonical text, with the two placeholders relaxed to patterns.
grant, _, third_party = LICENSE.partition("\n---\n")

with urllib.request.urlopen("https://spdx.org/licenses/MIT.json", timeout=60) as r:
    canonical = json.load(r)["licenseText"]

flat = lambda text: re.sub(r"\s+", " ", text).strip()
pattern = re.escape(flat(canonical))
pattern = pattern.replace(re.escape("<year>"), r"\d{4}")
pattern = pattern.replace(re.escape("<copyright holders>"), r".+?")

holder = re.search(r"Copyright \(c\) \d{4} .+", grant)
print(f"grant matches the SPDX MIT text verbatim  : "
      f"{re.fullmatch(pattern, flat(grant)) is not None}")
print(f"copyright line                            : {holder.group(0)}")
print(f"appended section                          : "
      f"{third_party.strip().splitlines()[0]}, {len(third_party.split())} words")
print(f"appended section disclaims rather than grants: "
      f"{'beyond what its upstream terms allow' in third_party}")
```

Run 2026-08-29:

```
grant matches the SPDX MIT text verbatim  : True
copyright line                            : Copyright (c) 2026 Wei-Tse Hsu
appended section                          : THIRD-PARTY MATERIAL, 75 words
appended section disclaims rather than grants: True
```

So the code and the task scaffolding are MIT. The appended section does not narrow that
grant; it says the scientific data redistributed alongside it keeps its own upstream terms,
which is a correct statement rather than a restriction on the licence. Those upstream terms
are itemised, and they are checked further down under *Third-party data*.

The copyright is held by a named individual rather than by an organisation. For a benchmark
you are running that changes nothing; if you intend to redistribute the text, that is the
fact to take to whoever decides such things.

## The 50 tasks

Twelve categories over three difficulty levels. The grid is worth reading before choosing a
subset, because the corpus is not balanced and a "random ten tasks" sample will not
represent it.

```python
import collections, pathlib, tomllib

ROOT = pathlib.Path("mdarena-meta")

# `task.description` is a one-line summary that, for several tasks, states the
# finding the task is asking for or names the defect planted in its inputs. It is
# evaluation content wearing a metadata label, so it is dropped on load and nothing
# downstream can print it by accident.
ANSWER_BEARING = ("description",)

def load(path):
    """tomllib parses values only, so the canary comment block at the head of every
    task.toml never enters the returned object. Parse these files; do not cat them."""
    with open(path, "rb") as fh:
        cfg = tomllib.load(fh)
    cfg["task"] = {k: v for k, v in cfg["task"].items() if k not in ANSWER_BEARING}
    return cfg

tasks = {p.parent.name: load(p) for p in sorted(ROOT.glob("tasks/*/task.toml"))}
assert all("description" not in t["task"] for t in tasks.values()), "projection failed"

grid = collections.defaultdict(collections.Counter)
for cfg in tasks.values():
    grid[cfg["metadata"]["category"]][cfg["metadata"]["difficulty"]] += 1

print(f"{'category':<38}{'easy':>6}{'medium':>8}{'hard':>6}{'total':>7}")
for cat in sorted(grid, key=lambda c: (-sum(grid[c].values()), c)):
    row = grid[cat]
    print(f"{cat:<38}{row['easy']:>6}{row['medium']:>8}{row['hard']:>6}"
          f"{sum(row.values()):>7}")
tot = collections.Counter(t["metadata"]["difficulty"] for t in tasks.values())
print(f"{'ALL (' + str(len(tasks)) + ' tasks, ' + str(len(grid)) + ' categories)':<38}"
      f"{tot['easy']:>6}{tot['medium']:>8}{tot['hard']:>6}{sum(tot.values()):>7}")
```

Read 2026-08-29 at `v0.1.0`:

```
category                                easy  medium  hard  total
trajectory_analysis                        5       6     2     13
system_preparation                         2       4     1      7
enhanced_sampling                          0       4     2      6
free_energy_planning                       0       6     0      6
membrane_protein_system_preparation        0       0     5      5
parameterization                           1       1     3      5
structure_analysis                         2       0     1      3
free_energy_analysis                       0       0     1      1
free_energy_setup                          0       1     0      1
quantum_chemistry                          0       0     1      1
simulation_validation                      0       1     0      1
troubleshooting                            1       0     0      1
ALL (50 tasks, 12 categories)             11      23    16     50
```

**Twelve categories, five of them holding a single task.** A per-category score is therefore
an n of one for five of the twelve, and three of the names — `free_energy_planning`,
`free_energy_setup`, `free_energy_analysis` — divide eight tasks between them along a line
only their authors can arbitrate. Report by task or by difficulty, and treat `category` as a
browsing aid.

The difficulty distribution is more usable: 11 easy, 23 medium, 16 hard, and it is not
uniform across categories. Every membrane-protein preparation task is `hard`; every free
energy planning task is `medium`. So a cheap subset picked on difficulty alone is skewed —
five of the eleven easy tasks are trajectory analysis, and none is a membrane setup or a free
energy calculation.

### One field in `task.toml` is not metadata

The repository's own tree listing labels `task.toml` *"metadata: resource limits, timeouts,
declared artifacts"*. It is that, plus one field that is not.

`[task].description` is a single sentence per task, and it is written for a maintainer
reading the tree rather than for an agent. **At least five of the fifty state outright the
conclusion the task is asking the agent to reach, or name the defect deliberately planted in
its inputs**, and several more come close enough that the only safe rule is to treat the
whole field as evaluation content. A catalogue that dumps `task.toml` verbatim therefore
ships part of the answer key in a column labelled "description", and nothing about the file
warns you.

That is why the loader above projects the field out at parse time rather than remembering not
to print it. The same reflex handles the canary: `tomllib` reads values and discards comments,
so the marker block at the head of every `task.toml` never reaches the parsed object. Parse
these files; do not `cat` them into a log, an issue, or a model's context.

## The `task.toml` contract

Every task declares the same schema. What varies, and what does not, decides how you size a
sweep.

```python
import collections, pathlib, tomllib

ROOT = pathlib.Path("mdarena-meta")
# No projection here because nothing below reads `task.description` — every
# accessor is named explicitly. That is the other safe pattern: project it out,
# or never reach for it.
tasks = {p.parent.name: tomllib.load(open(p, "rb"))
         for p in sorted(ROOT.glob("tasks/*/task.toml"))}

def spread(get):
    c = collections.Counter(get(cfg) for cfg in tasks.values())
    numeric = all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in c)
    return dict(sorted(c.items(), key=(lambda kv: kv[0]) if numeric
                                  else (lambda kv: str(kv[0]))))

env = lambda k: spread(lambda c: c["environment"][k])
print("schema_version        ", spread(lambda c: c["schema_version"]))
print("artifacts             ", spread(lambda c: tuple(c["artifacts"])))
print()
print("environment.gpus      ", env("gpus"))
print("environment.cpus      ", env("cpus"))
print("environment.memory_mb ", env("memory_mb"))
print("environment.storage_mb", env("storage_mb"))
print("build_timeout_sec     ", env("build_timeout_sec"))
print("allow_internet        ", env("allow_internet"))
print()
print("agent.timeout_sec     ", spread(lambda c: c["agent"]["timeout_sec"]))
print("verifier.timeout_sec  ", spread(lambda c: c["verifier"]["timeout_sec"]))
print("verifier.env keys     ", spread(lambda c: tuple(sorted(c["verifier"]["env"]))))
print()
print("metadata key sets     ", spread(lambda c: tuple(sorted(c["metadata"]))))
odd = sorted(t for t, c in tasks.items() if c["task"]["name"] != f"mdarena/{t}")
print(f"task.name != mdarena/<dir>:  {len(odd)} of {len(tasks)}, "
      f"tasks {odd[0][:2]}-{odd[-1][:2]}")
kw = collections.Counter(k for c in tasks.values() for k in c["task"]["keywords"])
print(f"keywords: {len(kw)} distinct, {sum(v == 1 for v in kw.values())} used once, "
      f"case-variant duplicates {sorted(k for k in kw if k.lower() != k and k.lower() in kw)}")
```

Read 2026-08-29 at `v0.1.0`:

```
schema_version         {'1.2': 50}
artifacts              {('/app/outputs', '/app/final_answer.txt'): 50}

environment.gpus       {0: 50}
environment.cpus       {2: 46, 4: 4}
environment.memory_mb  {8192: 50}
environment.storage_mb {10240: 49, 20480: 1}
build_timeout_sec      {3600.0: 50}
allow_internet         {True: 50}

agent.timeout_sec      {900.0: 30, 3600.0: 6, 4500.0: 7, 7200.0: 6, 9000.0: 1}
verifier.timeout_sec   {600.0: 1, 900.0: 47, 3600.0: 1, 9000.0: 1}
verifier.env keys      {('CLAUDE_CODE_OAUTH_TOKEN',): 50}

metadata key sets      {('category', 'difficulty', 'protocol', 'system', 'task_id'): 2, ('category', 'difficulty', 'task_id'): 48}
task.name != mdarena/<dir>:  31 of 50, tasks 20-50
keywords: 101 distinct, 69 used once, case-variant duplicates ['ABFE', 'GROMACS', 'PCA', 'PepT2']
```

Five things in that output change what you do.

**`gpus = 0` on every task, on a CUDA image.** The shared base builds GROMACS 2026.2 from
source with `-DGMX_GPU=CUDA` on top of `nvidia/cuda:12.4.1-devel-ubuntu22.04`, which reads
like a GPU requirement and is not one. Every task asks Harbor for zero GPUs, so a GPU host
buys you nothing at run time. The CUDA base is a **build-time** cost — several gigabytes of
image and a from-source GROMACS compile — with `build_timeout_sec` set to a full hour
accordingly. Budget an hour and about 8 GB of RAM per concurrent trial, not accelerator time.
A value that is the same in all fifty files could just as easily be a default nobody set;
*Are those numbers declared, or defaulted?* below settles that, and they are declared.

**`allow_internet = true` on every task, and it is load-bearing on both sides.** The agent
gets network access, which is the entire reason the network-mediation overlay further down
exists. Less obviously, the *verifier* needs it too: several tasks' checkers resolve extra
Python packages from PyPI on every grading call, uncached, so a network blip during grading
fails the check rather than the task. The maintainers log this as a known fragility.

**Agent timeouts span fifteen minutes to two and a half hours.** Thirty of the fifty get the
15-minute floor; twenty get between one and two and a half hours. Summed, one replicate of
every task allows 36.8 hours of agent time plus 15.4 hours of verifier time, so a full sweep
is days of wall clock at modest concurrency, not an afternoon. A flat `--timeout-multiplier`
also stretches the long tasks in absolute terms far more than the short ones.

**`task.name` drops the numeric prefix from task 20 onward.** Tasks 01–19 are named
`mdarena/<directory>`; tasks 20–50 are named `mdarena/<directory-without-the-number>`. Harbor
records the name, not the path, so joining run output back to a directory by name silently
fails for 31 of 50 tasks. Join on `metadata.task_id`, which does equal the directory name on
all fifty.

**`keywords` is not a usable index.** 101 distinct terms across 50 tasks, 69 of them used
exactly once, and four appear in two casings each. Filter on `category`, `difficulty` or
`task_id`; treat keywords as prose.

Two tasks additionally carry `system` and `protocol` keys that the other 48 do not. Nothing
reads them, but code that assumes a fixed `metadata` key set will trip over them.

## Three base images, not one

The quickstart says every task's container is built on top of one image. Two tasks say
otherwise, and both failure modes appear only when you run those tasks.

```python
import collections, pathlib, re

ROOT = pathlib.Path("mdarena-meta")
FROM_RE = re.compile(r"^\s*FROM\s+(?:--\S+\s+)*(\S+)", re.M)
COPY_RE = re.compile(r"^\s*COPY\s+(\S+)", re.M)

bases, external = collections.defaultdict(list), {}
for df in sorted(ROOT.glob("tasks/*/environment/Dockerfile")):
    tid, text = df.parents[1].name, df.read_text()
    bases[FROM_RE.search(text).group(1)].append(tid)
    for src in COPY_RE.findall(text):
        if src.startswith("inputs/"):
            continue
        arg = re.search(rf"^\s*ARG\s+{re.escape(src.strip('${}'))}=(\S+)", text, re.M)
        external[tid] = arg.group(1) if arg else src

for base, ids in sorted(bases.items(), key=lambda kv: -len(kv[1])):
    who = "" if len(ids) > 3 else "   " + ", ".join(ids)
    print(f"{len(ids):>3}  FROM {base}{who}")
print()
for tid, artefact in sorted(external.items()):
    print(f"{tid} also needs an artefact dropped into its environment/ directory:")
    print(f"      {artefact}")
```

Read 2026-08-29 at `v0.1.0`:

```
 48  FROM mdarena:latest
  1  FROM mambaorg/micromamba:latest   25_mglu5_membrane_setup
  1  FROM mdarena-plumed-lambda:latest   48_cb7_10_alchemical_metadynamics

38_pept2_qm_cluster_orca also needs an artefact dropped into its environment/ directory:
      orca_6_1_1_linux_x86-64_shared_openmpi418_nodmrg.tar.xz
```

**`mdarena-plumed-lambda:latest` is a second image the quickstart does not build.** It exists
because GROMACS's native PLUMED interface, which the main image uses, does not support
interaction with GROMACS energy — no lambda dynamics, no replica exchange — so the alchemical
metadynamics task needs a classically patched build instead. Its own Dockerfile carries the
build command:

`docker build -f environment/Dockerfile.plumed-lambda -t mdarena-plumed-lambda:latest environment`

Skip it and that one task fails at image build.

**One task does not use an MDArena image at all.** `25_mglu5_membrane_setup` builds from
`mambaorg/micromamba:latest`, pulled from a public registry, unpinned — the only task whose
base does not come from this repository. Its recorded task digest can therefore be identical
across two runs whose containers are not. (The shared base is not perfectly reproducible
either — it pulls unpinned upstream layers — but at least the recipe is versioned here.)

**And one task needs a distribution you have to register for.** `38_pept2_qm_cluster_orca`
copies an ORCA tarball into its build context; ORCA is free for academic use but is
distributed through FACCTs registration and cannot be redistributed here or fetched
automatically. That is a restriction on one option among fifty, not on the only path, so it
is a disclosure rather than a blocker — and the maintainers have it logged for removal in a
later dataset version.

## What runs from a bare clone, and what does not

Seven tasks cannot be run from a fresh checkout. Six are missing inputs on purpose, and the
repository declares exactly which, in a file its own validator keeps honest.

```python
import pathlib, re, tomllib

ROOT = pathlib.Path("mdarena-meta")
tasks = sorted(p.parent.name for p in ROOT.glob("tasks/*/task.toml"))

# Inputs that are real but deliberately not committed. This is an explicit, reviewed
# exemption from the rule that every /app/inputs path a task references must be
# tracked in git — the task validator fails if an entry names a task that is gone, or
# a file that has since been committed, so the list cannot rot quietly.
withheld = tomllib.load(open(ROOT / "scripts/external_inputs.toml", "rb"))
assert set(withheld) <= set(tasks), "external_inputs.toml names a task that is gone"

SIZE = re.compile(r"(\d+(?:\.\d+)?)\s*(GB|MB)")
def biggest(notes):
    mb = [float(v) * (1000 if u == "GB" else 1) for n in notes for v, u in SIZE.findall(n)]
    return max(mb) if mb else 0.0

print(f"{'task':<40}{'entries':>8}{'globs':>7}{'largest size named':>20}")
for tid in sorted(withheld):
    entries = withheld[tid]
    print(f"{tid:<40}{len(entries):>8}{sum('*' in k for k in entries):>7}"
          f"{biggest(entries.values()) / 1000:>17.1f} GB")
print()

ORCA = "38_pept2_qm_cluster_orca"          # from the Dockerfile sweep above
gated = sorted(set(withheld) | {ORCA})
print(f"gated tasks                 {len(gated)}   {', '.join(t[:2] for t in gated)}")
print(f"run from a bare clone       {len(tasks) - len(gated)} of {len(tasks)}")
```

Read 2026-08-29 at `v0.1.0`:

```
task                                     entries  globs  largest size named
19_traj_ana_open                               3      0              0.1 GB
20_fep_abfe_dhdl_analysis                      3      3              0.5 GB
22_traj_ana_pept2_pca_cv_suitability           1      0              4.8 GB
28_traj_ana_pept2_pca_plumed_setup             1      0              4.8 GB
31_traj_ana_na_conductance_6nq0                1      0              5.2 GB
39_fep_gmx_d3_abfe                            24      0              0.1 GB

gated tasks                 7   19, 20, 22, 28, 31, 38, 39
run from a bare clone       43 of 50
```

The size column reads the figures out of the declarations themselves, so it reports what the
maintainers wrote rather than a measurement — and for tasks 20 and 39 the figure is the whole
withheld set, not one file. It still separates the two causes cleanly.

**Forty-three of fifty run from `git clone` and nothing else.** That is the number to plan
against, and it is the number to report alongside any score — a sweep of "MDArena" that
silently skipped seven tasks is not comparable to one that ran them.

The six withheld tasks split into two causes, and the file says which is which. Three ship
trajectories of 4.8 to 5.2 GB, over the 2 GiB per-object limit the file cites. Three more
were small enough to distribute but together came to two thirds of the packed repository, so
they were held back to keep a clone tractable. All six are declared as "contact the task
authors", which is a case-by-case route rather than a published download — a restriction on
six options out of fifty rather than on the only path, which is why it is a disclosure here
and not a reason to leave the benchmark alone. All six are slated for subsampled inputs in a
later version, at which point the entries disappear.

**An entry is not a file.** `20_fep_abfe_dhdl_analysis` shows three entries and all three are
globs; between them they cover 44 individual free-energy output files. The other five tasks
list literal paths. Counting declared keys therefore under-counts the missing data by an
order of magnitude for that one task, which is what the `globs` column exists to flag.

## Third-party data, and what it obliges you to do

The MIT grant covers MDArena's own material. The force fields, parameter sets and
coordinates it redistributes keep their own terms, and `docs/DATA_PROVENANCE.md` itemises
every one. Nothing there is non-commercial, and the only copyleft is the LGPL-2.1 on one
force field, which is weak and reaches neither MDArena nor your results:

| Component | Terms |
|---|---|
| CHARMM36 (July 2022), used by two tasks | upstream force-field files **MIT**; the GROMACS port **BSD-3-Clause** |
| AMBER99SB\*-ILDN with mutation support | citation requested in the bundled documentation |
| OPLS-AA/L with decane parameters | ships with GROMACS, **LGPL-2.1** |
| CHARMM-GUI-style `toppar` trees and lipid parameters, across 15 tasks | inherit the CHARMM36 terms above |
| Ligand coordinates | generated locally; the *compounds* come from published medicinal chemistry and are cited per task |
| One ligand from PubChem | **public domain** |
| Experimental structures from the PDB | **unrestricted redistribution**; the obligation is citation, and it carries to derivatives |

That last row is the one worth checking rather than trusting, because a provenance table is
exactly the kind of document that drifts from the thing it describes. Every PDB id in the
file resolves, and the citation each row claims is the citation the PDB itself records:

```python
import json, pathlib, re, urllib.request

PROV = pathlib.Path("mdarena-meta/docs/DATA_PROVENANCE.md").read_text()

# A PDB id is a digit plus three alphanumerics — a pattern that also matches years,
# journal page numbers and DOI fragments, all of which this file is full of. Without
# the isalpha guard the scan returns 33 ids instead of 12 and the first lookup 404s
# on "2012".
CODES = [c for c in dict.fromkeys(re.findall(r"\b([0-9][A-Z0-9]{3})\b", PROV))
         if any(ch.isalpha() for ch in c)]

def rcsb(code):
    with urllib.request.urlopen(
            f"https://data.rcsb.org/rest/v1/core/entry/{code}", timeout=60) as r:
        d = json.load(r)
    cit = d.get("rcsb_primary_citation") or {}
    return (d["rcsb_entry_info"]["experimental_method"],
            d["rcsb_accession_info"]["initial_release_date"][:10],
            f"{cit.get('journal_abbrev')} {cit.get('year')}",
            d["struct"]["title"])

print(f"PDB ids named in docs/DATA_PROVENANCE.md: {len(CODES)}\n")
print(f"{'id':<6}{'method':<8}{'released':<12}{'primary citation':<26}title")
for c in CODES:
    method, released, cite, title = rcsb(c)
    print(f"{c:<6}{method:<8}{released:<12}{cite:<26}{title[:40]}")
```

Read 2026-08-29 against the RCSB data API:

```
PDB ids named in docs/DATA_PROVENANCE.md: 12

id    method  released    primary citation          title
3PWH  X-ray   2011-09-07  Structure 2011            Thermostabilised Adenosine A2A Receptor
6X8F  X-ray   2020-11-25  J.Med.Chem. 2020          Crystal structure of TYK2 with Compound 
1A6M  X-ray   1999-04-06  Biophys.J. 1999           OXY-MYOGLOBIN, ATOMIC RESOLUTION
4S0V  X-ray   2015-01-14  Nature 2015               Crystal structure of the human OX2 orexi
5WQC  X-ray   2017-11-29  Structure 2018            Crystal structure of human orexin 2 rece
5WS3  X-ray   2017-12-13  Structure 2018            Crystal structures of human orexin 2 rec
4EIY  X-ray   2012-07-25  Science 2012              Crystal structure of the chimeric protei
5CGC  X-ray   2015-08-12  J.Med.Chem. 2015          Structure of the human class C GPCR meta
3PBL  X-ray   2010-11-03  Science 2010              Structure of the human dopamine D3 recep
6GT3  X-ray   2019-06-26  J Immunother Cancer 2020  Crystal Structure of the A2A-StaR2-bRIL5
9BIS  EM      2024-07-24  Nat Commun 2024           Cryo-EM structure of the mammalian pepti
6NQ0  EM      2019-03-27  Elife 2019                Cryo-EM structure of human TPC2 channel 
```

**Eleven of the twelve agree with the provenance table on journal and year.** Ten X-ray
structures and two cryo-EM maps, released across twenty-five years, and the file's citations
are the entries' own primary citations rather than a secondary source. That is a table you
can cite from.

The twelfth, `6NQ0`, is named in prose below the table with no citation attached, because
only derived coordinates are shipped for it. The file states in its own words that the
citation obligation applies equally to processed derivatives, so the two tasks built on it
need the *eLife* 2019 paper cited even though the table does not carry it. The maintainers
have completing that table logged as outstanding work.

**Do not treat one component's licence as a licence on everything in a task directory.** The
table runs from MIT and BSD-3-Clause through LGPL-2.1 to public domain and
unrestricted-with-citation, and each applies only to what its row names. The LGPL-2.1 entry
is the one to read carefully if you redistribute anything: it is weak copyleft on those
force-field files, not on MDArena and not on your results. And the compound coordinates carry
citation obligations attached to the medicinal chemistry papers they came from, which the
provenance file identifies by the papers' own compound numbering rather than by an accession
you can resolve automatically.

## Get the files

The catalogue, on disk — one row per task, carrying the columns you would actually filter on
— plus the provenance document, which is what you cite from. No answer-bearing field is
written.

```python
import csv, os, pathlib, re, tomllib

ROOT, OUT = pathlib.Path("mdarena-meta"), pathlib.Path("Data/mdarena")
OUT.mkdir(parents=True, exist_ok=True)

withheld = tomllib.load(open(ROOT / "scripts/external_inputs.toml", "rb"))
FROM_RE = re.compile(r"^\s*FROM\s+(?:--\S+\s+)*(\S+)", re.M)
ARG_RE = re.compile(r"^\s*ARG\s+\w+=(\S+)", re.M)

rows = []
for path in sorted(ROOT.glob("tasks/*/task.toml")):
    tid = path.parent.name
    cfg = tomllib.load(open(path, "rb"))
    docker = (path.parent / "environment/Dockerfile").read_text()
    artefact = ARG_RE.search(docker)
    gate = ("inputs not committed" if tid in withheld else
            "external artefact required" if artefact else "")
    rows.append({
        "task_id": tid,
        # `task.description` is deliberately absent — see the projection above.
        "category": cfg["metadata"]["category"],
        "difficulty": cfg["metadata"]["difficulty"],
        "keywords": ";".join(cfg["task"]["keywords"]),
        "base_image": FROM_RE.search(docker).group(1),
        "cpus": cfg["environment"]["cpus"],
        "storage_mb": cfg["environment"]["storage_mb"],
        "agent_timeout_sec": int(cfg["agent"]["timeout_sec"]),
        "verifier_timeout_sec": int(cfg["verifier"]["timeout_sec"]),
        "runs_from_bare_clone": int(not gate),
        "gate": gate,
    })

with open(OUT / "tasks.tsv", "w", newline="") as fh:
    w = csv.DictWriter(fh, rows[0].keys(), delimiter="\t")
    w.writeheader()
    w.writerows(rows)

(OUT / "DATA_PROVENANCE.md").write_bytes((ROOT / "docs/DATA_PROVENANCE.md").read_bytes())

print(f"{OUT}/tasks.tsv            {len(rows)} rows, {len(rows[0])} columns")
print(f"{OUT}/DATA_PROVENANCE.md   {os.path.getsize(OUT / 'DATA_PROVENANCE.md')} bytes")
print(f"runnable from a bare clone {sum(r['runs_from_bare_clone'] for r in rows)}")
print(f"no answer-bearing field written: {'description' not in rows[0]}")
```

Run 2026-08-29:

```
Data/mdarena/tasks.tsv            50 rows, 11 columns
Data/mdarena/DATA_PROVENANCE.md   3106 bytes
runnable from a bare clone 43
no answer-bearing field written: True
```

That table is enough to choose a subset, size the wall clock, and record what you ran. To
actually run anything you need the full checkout, the images and the credential — the rest of
this page.

## Validate the tree yourself

The repository ships its own structural validator, and it is standard-library only — no
container, no GPU, no credential. It is the cheapest way to confirm a checkout is intact
before spending an hour on an image build, and the fastest way to see the invariants the
project enforces on itself.

```bash
set -euo pipefail
# The full clone. About 222 MB packed; the working tree is roughly half a gigabyte
# because tasks ship trajectories and structures. There is no Git LFS here — the
# repository says so in .gitattributes and asks that it not be reintroduced.
git -c advice.detachedHead=false clone --quiet --branch v0.1.0 --depth 1 \
    https://github.com/weitse-hsu/MDArena.git mdarena
du -sh mdarena mdarena/.git

python3 mdarena/scripts/validate_tasks.py
```

Run 2026-08-29:

```
711M	mdarena
224M	mdarena/.git
Validated 50 task(s).

Time elapsed: 1.8 second(s)
```

What it checks is worth knowing even if you never run it: that every task directory holds the
seven required files, that `task.toml`'s fields are well formed, that every `/app/inputs`
path an instruction or a rubric references is either tracked in git or declared in the
withheld-inputs file, that the canary markers are present in each file that is supposed to
carry one, and that the task root contains nothing outside an allowlist. It runs in the
project's CI on every push, so a green result here means your checkout matches what CI saw.

## Running a task

MDArena is driven by Harbor, an Apache-2.0 evaluation runner distributed on PyPI as
`harbor`. It starts the container, hands the agent the task's prompt, runs the verifier, and
writes a jobs directory. Each task's verifier entry point in turn invokes Reward Kit, a small
grading toolkit resolved into its own isolated environment.

**Before running anything, re-read *What you need* at the top.** A container runtime and an
Anthropic credential are both required, and the second one is the one people discover late,
because a run starts happily and fails at the verifier.

Install the runner. Nothing here needs the container yet.

```bash
set -euo pipefail
python3 -m venv .venv                       # Harbor requires Python 3.12 or newer
./.venv/bin/pip -q --disable-pip-version-check install "harbor>=0.22"
./.venv/bin/harbor --version
./.venv/bin/python -c "
from harbor.models.agent.name import AgentName
names = sorted(a.value for a in AgentName)
control = sorted({'oracle', 'nop'} & set(names))
print(f'agent adapters registered : {len(names)}')
print(f'control adapters          : {control}')
print(f'vendor CLI adapters       : {len(names) - len(control)} (harbor run -h lists them)')
"
```

Run 2026-08-29, about two minutes for the install:

```
0.22.0
agent adapters registered : 43
control adapters          : ['nop', 'oracle']
vendor CLI adapters       : 41 (harbor run -h lists them)
```

### Are those numbers declared, or defaulted?

A field that carries the same value in all fifty task files is either a decision every author
made, or a default nobody touched — and the two mean opposite things. Harbor is the only
place that answers it, which is why this check waits until it is installed.

```bash
set -euo pipefail
./.venv/bin/python -c "
from harbor.models.task.config import EnvironmentConfig
for name in ('gpus', 'cpus', 'memory_mb', 'storage_mb',
             'build_timeout_sec', 'allow_internet'):
    print(f'{name:20} Harbor default {EnvironmentConfig.model_fields[name].default!r}')
"
```

Run 2026-08-29 against Harbor 0.22.0:

```
gpus                 Harbor default None
cpus                 Harbor default None
memory_mb            Harbor default None
storage_mb           Harbor default None
build_timeout_sec    Harbor default 600.0
allow_internet       Harbor default None
```

**Five of the six are unset by default, and MDArena sets all six in all fifty tasks.** So
`gpus = 0` is a positive statement that these tasks do not want a GPU, not a field left
blank — which is what makes "no GPU required" safe to act on. The sixth is the sharpest:
`build_timeout_sec` defaults to 600 seconds and every task raises it to 3600, which is the
project telling you the image build is a six-times-the-default job.

### The two control adapters

Start with these two. Neither costs an inference call. `oracle` is Harbor's default and
executes a task's own reference solution inside the container, which is how you confirm a
task's verifier works at all before trusting a score from it. `nop` does nothing, which is
the negative control confirming a task scores near zero for no work. Between them they
establish a task's scoring range before any model is involved.

`oracle` needs a reference solution, and a reference solution is optional. Find out which
tasks have one *without* pulling one onto your disk:

```bash
set -euo pipefail

# `ls-tree` reads the tree object, not the blobs. In a blobless clone that means
# you can enumerate exactly what each task ships without any of it landing on
# disk — which is how you answer "can the oracle run this?" without fetching a
# reference solution.
git -C mdarena-meta ls-tree -r --name-only HEAD -- tasks \
  | awk -F/ '$3 == "solution" { print $2 }' | sort -u > with-solution.txt
git -C mdarena-meta ls-tree -r --name-only HEAD -- tasks \
  | awk -F/ 'NF > 2 { print $2 }' | sort -u > all-tasks.txt

echo "tasks                       $(wc -l < all-tasks.txt | tr -d ' ')"
echo "ship a reference solution   $(wc -l < with-solution.txt | tr -d ' ')"
echo "oracle cannot run these     $(comm -23 all-tasks.txt with-solution.txt | wc -l | tr -d ' ')"
echo "lowest-numbered task the oracle CAN run   $(head -1 with-solution.txt)"
```

Read 2026-08-29 at `v0.1.0`. Nothing under `solution/` lands on disk; the working tree still
holds the same 123 files the sparse pattern selected:

```
tasks                       50
ship a reference solution   31
oracle cannot run these     19
lowest-numbered task the oracle CAN run   05_traj_ana_hbonds
```

**Nineteen tasks have no reference solution**, so on those there is no way to confirm the
verifier works without spending a real agent run. The quickstart's own oracle example names a
task that is one of the nineteen, so copying it produces a failure that looks like a broken
install. Point the oracle at a task that ships one.

Then build the shared image and run something. **Neither of the next two blocks was executed
here** — see `verified.unverified_reason`. They are the upstream quickstart's steps 3 and 4,
transcribed with the two corrections this page establishes.

```bash
# Paths are relative to the working directory used throughout this page, which
# now holds ./mdarena (the full clone) and ./.venv (Harbor).
#
# Roughly an hour: a CUDA devel base plus a from-source GROMACS build, which is
# what build_timeout_sec = 3600 is sized for. amd64 only.
docker build -t mdarena:latest mdarena/environment

# The second base image, needed by 48_cb7_10_alchemical_metadynamics and by
# nothing else. The quickstart does not mention building it.
docker build -f mdarena/environment/Dockerfile.plumed-lambda \
             -t mdarena-plumed-lambda:latest mdarena/environment
```

```bash
export CLAUDE_CODE_OAUTH_TOKEN=...     # or ANTHROPIC_API_KEY for metered billing

# Reference solution, no model involved: does this task's verifier work?
# `oracle` is the default agent, so omitting -a selects it. This task is one of
# the 31 that ship a solution — see the block above before substituting another.
./.venv/bin/harbor run -p mdarena/tasks/05_traj_ana_hbonds

# Negative control: does it correctly score near zero for no work?
./.venv/bin/harbor run -p mdarena/tasks/05_traj_ana_hbonds -a nop

# A scored run. `-a` names an agent adapter and `-m` its model; read both
# from the Harbor documentation for the version you installed rather than
# from any write-up, this one included.
./.venv/bin/harbor run -p mdarena/tasks/05_traj_ana_hbonds -a <adapter> -m <model-id> \
    --extra-docker-compose mdarena/no-github-access.yaml

./.venv/bin/harbor view ./jobs
```

Four things about that invocation are worth stating.

**The overlay is not optional for a reportable run.** `--extra-docker-compose
no-github-access.yaml` is what stops a browsing-enabled agent from reading the verifier for
the task it is being scored on. The next section is about what it does and does not achieve.

**Never name a model from memory.** The identifiers move, and a stale one silently changes
what a number means. Read them from the runner's own documentation at the version you
installed.

**`-p` takes a path, `--config` takes a batch file.** Sweeping 50 tasks one `harbor run` at a
time works and is slower than it needs to be; the batch config takes a list of tasks and a
list of agents with per-agent concurrency.

**Replicates matter more than they look.** Agent runs are high variance, and a single trial
per task produces a number that will not reproduce. Report how many replicates you ran; the
submission checker has a `--min-trials` flag precisely because one is a common mistake.

## Contamination control, which is the most distinctive thing here

MDArena is a public repository, and every task runs with `allow_internet = true`. An agent
that can browse can, in principle, fetch the verifier for the task it is being scored on.
The project addresses that with three layers, and is unusually candid that none of them is a
guarantee.

**One: block the obvious routes.** `no-github-access.yaml` is a compose overlay that points
GitHub's hosts at `127.0.0.1` inside the container — and not only GitHub. It also covers the
CDNs that re-serve arbitrary files from any public repository by path, the repository-to-text
services that return a whole repository as one document, a generic URL-fetch proxy, and three
code-search engines that would surface a verifier's contents without fetching anything. That
list is the interesting part: blocking `github.com` alone leaves at least ten other services
that reach the same content.

Its own header says what it cannot do, and the limits are structural rather than
oversights. `/etc/hosts` has no wildcard syntax, so every hostname must be listed literally
and any mirror not named is not covered. An agent that connects by IP bypasses it entirely.
And it cannot be scoped to this repository alone — HTTPS exposes the hostname through SNI and
never the path, so blocking one repository means blocking the whole host.

Two run-time consequences the overlay's own header records. `49_slco2a1_physical_validation`
is the one task whose instructions point the agent at a package's source repository, so under
the overlay that install route fails; the package is on PyPI and PyPI stays reachable, so the
task remains solvable, but the agent has to work that out unaided and what you measure there
is partly recovery from a dead URL. And one agent adapter — the header names which — installs
itself by bootstrapping from a blocked content host, so it fails before the task starts; bake
that CLI into the image, or run that adapter without the overlay.

**Two: audit what the run actually did.** Since no hostname list is complete, the repository
ships a scanner that reads every trajectory after the fact and reports any that referenced
this repository or requested a repository-lookup address. Both it and the submission checker
are standard-library only and run against the sparse checkout.

```bash
set -euo pipefail
mkdir -p jobs

# Both fail closed on an empty or mis-pointed jobs directory rather than reporting
# a clean run — check this before wiring either into a release gate.
python3 mdarena-meta/scripts/scan_exec_trajs.py jobs || echo "  exit $?"
python3 mdarena-meta/scripts/verify_submission.py jobs --tag v0.1 || echo "  exit $?"
python3 mdarena-meta/scripts/verify_submission.py jobs --tag v9.9 || echo "  exit $?"
```

Run 2026-08-29, with no runs to check:

```
No trajectory.json files found. Point this at a Harbor jobs directory.

Time elapsed: 0.0 second(s)
  exit 1
No trials found under jobs.

Time elapsed: 0.0 second(s)
  exit 1
No manifest for 'v9.9'. Available: v0.1

Time elapsed: 0.0 second(s)
  exit 1
```

The scanner makes two distinctions that keep its output usable, and both matter when you read
a report. It separates hits in the **task prompt** from hits by the **agent**, because one
task legitimately names a repository URL in its own instructions and a hit there says nothing
about behaviour. And it separates a URL in a tool call's **arguments** — the agent asked for
that address — from one in an **observation**, which usually means the string appeared in
something the agent read, and MD software is full of repository URLs in licence headers and
docstrings. Only request-side matches are reported by default.

**Three: tie a number to a release.** `verify_submission.py` compares every trial's recorded
task digest, agent, model, timeout multiplier, verifier state and compose-overlay digest
against a published manifest, and folds the trajectory scan in. It exits non-zero on any
finding. Useful flags are `--min-trials` for replicate counts, `--require-mediation` to fail
trials that ran without the overlay, and `--strict-lookups` to fail on any repository-lookup
address rather than only this repository's.

The manifest lives in the repository as one file per release, generated from the tagged tree
rather than hand-written. Only `v0.1` exists today, which the checker will tell you if you
name any other tag. Note that this is the manifest's own name — the file is
`scripts/task_digests/v0.1.toml` — and it is not the git tag, which is `v0.1.0`. Pass
`--tag v0.1` here even though you cloned `v0.1.0`.

Be clear about what that establishes. Everything checked is a file the submitter produced, so
a fabricated bundle passes. What it catches is a run against edited tasks, a disabled
verifier, an inflated timeout, an agent given extra network access, missing trajectories, and
an agent that looked the benchmark up — misconfiguration and casual tampering, not fraud.
There is a separate opt-in pass that asks a language model whether a trial's outputs were
computed or invented; it never changes pass or fail, and the repository's own guidance is to
use a judge from a different vendor than the agent under review, through a plain completion
API rather than an agent CLI that could read the verifier it is auditing.

**And the canary.** Two GUIDs are embedded per file in `task.toml`, `checks.py`, `judge.toml`
and `solve.sh`, plus a `CANARY.md` in every task directory — per file rather than only at the
repository root, because crawlers ingest files without repository context. The task validator
enforces their presence, so a task cannot ship unmarked. One GUID is the widely used shared
benchmark canary, which existing corpus filters may already drop; the other is specific to
MDArena, which is what gives it attribution — a model reproducing it points at this benchmark
rather than at any other. `instruction.md` is deliberately left unmarked, because a canary in
the prompt would tell the agent mid-task that it is being evaluated. That is a considered
design, not an oversight, and it is the clearest signal that the request is about corpora and
not about description.

## Pitfalls

- **`task.toml` is labelled metadata and one of its fields is not.** `[task].description`
  gives the answer away for at least five of the fifty. Project it out at load, as every
  block on this page does, rather than relying on remembering.
- **Grading needs the network, not just the agent.** Several tasks' verifiers resolve Python
  packages from PyPI on every call, uncached, so a transient network failure during grading
  reads as a failed task rather than a failed check. Re-run before believing a zero.
- **The repository keeps an open defect log**, `TODOS.md`, naming specific tasks with
  underspecified prompts, permissive verifiers, or scoring that credits a failed run. Several
  are deliberately deferred rather than fixed, because `v0.1.0` has to keep matching the
  published results. **Read it before reporting a per-task number.** This page does not
  restate which tasks or what the defects are, for the reason in the first section.
- **`main` has moved off `v0.1.0`.** They were the same commit when this page was written;
  `v0.2.0` shipped afterwards and `main` now points at it, so an unpinned clone no longer
  reproduces the published results — and the submission checker's own documentation says a
  sweep where *every* trial fails the digest usually means the run used a different dataset
  version rather than edited tasks. Pin the tag.
- **The base image is amd64.** The CUDA base is `linux/amd64`; on Apple Silicon you are
  emulating, and the verifier dependency that failed to build during the maintainers' own
  local testing failed for exactly that reason. Build and run on Linux amd64.
- **`harbor` needs Python 3.12 or newer.** An older interpreter reports an unsatisfiable
  requirement rather than a version error, which reads as a broken package.
- **The `oracle` agent is not available for every task**, and the quickstart's own oracle
  example is one of the nineteen it cannot run. Check before substituting a task.
- **Do not `cat` a file under `tasks/`.** Every `task.toml`, `checks.py`, `judge.toml` and
  `solve.sh` carries a canary comment block, and printing one into a log, an issue or a
  model's context is how the marker ends up somewhere it means nothing. Parse; never print.
- **A score is not comparable without its scaffold.** Which 43 or 50 tasks ran, how many
  replicates, which agent adapter and model, whether the mediation overlay was on, and which
  release tag. Every one of those moves the number, and the submission checker exists because
  they are all recorded and all easy to omit.

## Try it

**Data.** The MDArena repository at tag `v0.1.0`, MIT, public, no account and no Git LFS — this
block takes about a megabyte of it. Last confirmed reachable 2026-08-29. The block reads
`task.toml` and `scripts/external_inputs.toml` and prints only counts and invariants, never a
task's own text.

**Run.** In a fresh empty directory, with nothing installed but `git` 2.37 or newer — that is
where `sparse-checkout set --no-cone` arrived — and Python 3.11 or newer for `tomllib`:

```bash
set -euo pipefail

git -c advice.detachedHead=false clone --quiet \
    --branch v0.1.0 --depth 1 --filter=blob:none --sparse \
    https://github.com/weitse-hsu/MDArena.git mdarena-tryit
git -C mdarena-tryit sparse-checkout set --no-cone \
    'tasks/*/task.toml' '/scripts/external_inputs.toml'

python3 - <<'PY'
import collections, pathlib, tomllib

ROOT = pathlib.Path("mdarena-tryit")
paths = sorted(ROOT.glob("tasks/*/task.toml"))

# Project the answer-bearing field out at load, so nothing below can print it.
def load(p):
    cfg = tomllib.load(open(p, "rb"))
    cfg["task"].pop("description", None)
    return cfg

tasks = {p.parent.name: load(p) for p in paths}
assert len(tasks) == 50, f"expected 50 tasks, found {len(tasks)}"
assert all("description" not in c["task"] for c in tasks.values()), "projection failed"

# The invariants a sweep depends on.
assert {c["schema_version"] for c in tasks.values()} == {"1.2"}, "schema moved"
assert all(c["environment"]["gpus"] == 0 for c in tasks.values()), "a task now wants a GPU"
assert all(c["environment"]["allow_internet"] for c in tasks.values()), "network policy moved"
assert all(c["verifier"]["env"] for c in tasks.values()), "a task declares no verifier credential"
assert all(t == c["metadata"]["task_id"] for t, c in tasks.items()), "task_id != directory"

# The trap: task.name is NOT the directory name for the second half of the corpus.
odd = [t for t, c in tasks.items() if c["task"]["name"] != f"mdarena/{t}"]
assert len(odd) == 31, f"expected 31 name mismatches, found {len(odd)}"

withheld = tomllib.load(open(ROOT / "scripts/external_inputs.toml", "rb"))
assert set(withheld) <= set(tasks), "external_inputs.toml names a task that is gone"

diff = collections.Counter(c["metadata"]["difficulty"] for c in tasks.values())
cats = {c["metadata"]["category"] for c in tasks.values()}
print(f"tasks / categories        : {len(tasks)} / {len(cats)}")
print(f"difficulty                : {dict(sorted(diff.items()))}")
print(f"gpus declared, all tasks  : {sorted({c['environment']['gpus'] for c in tasks.values()})}")
print(f"tasks with withheld inputs: {len(withheld)}")
print(f"task.name != directory    : {len(odd)}")
print("all assertions passed")
PY
```

**Expect.**

*Invariants* — a failure here means this page is wrong, not that upstream moved. Fifty task
directories, each with a parseable `task.toml`; `metadata.task_id` equal to the directory
name on every one; `gpus = 0` and `allow_internet = true` on every one; a verifier credential
declared on every one; the projection removing `description` from every one; and every task
named in the withheld-inputs file still existing.

*Observed at `v0.1.0` (commit `d50547a`), read 2026-08-29* — these move when the maintainers
publish a new dataset version, and a mismatch is drift to investigate rather than a bug:

```
tasks / categories        : 50 / 12
difficulty                : {'easy': 11, 'hard': 16, 'medium': 23}
gpus declared, all tasks  : [0]
tasks with withheld inputs: 6
task.name != directory    : 31
all assertions passed
```

The `task.name` assertion is the one that earns its place. It asserts a *defect* — 31 of 50
task names do not match their directory — because a reader joining run output back to a
directory by name will lose those 31 silently, and if a later release fixes it, this
assertion is what tells you the join changed.

## Where this sits

MDArena is a leaf, indexed nowhere else in this registry. The `biomedarena` skill maps a
harness registering 155 biomedical benchmarks; **this is not one of them**, checked
2026-08-29, so there is no index entry to defer to. It is this registry's first
computational-chemistry benchmark.

Against the neighbours it shares a runner or a shape with: `biomnibench-da` is 50 biomedical
data-analysis tasks graded on the analytical trajectory against expert rubrics and driven by
the same runner, `bioagent-bench` is ten bioinformatics pipelines each graded on one
deliverable file, `latch-bench` is 45 single-cell and spatial evaluations graded by
deterministic comparison, and `bixbench3` is twenty study-scale rebuilds. This one is fifty
molecular simulation workflows graded by a deterministic correctness check *and* a
process-level judge. Different science, different graders, different maintainers — a score on
one says nothing about another.

## Sources

- MDArena — Mouroug Anand, Hsu, Vaccaro, Gage, Colburn, Phan, Seo, Guan & Biggin, *MDArena —
  Evaluating Coding Agents on Realistic Molecular Dynamics Workflows*, arXiv
  [2608.02642](https://arxiv.org/abs/2608.02642) (2026),
  [10.48550/arXiv.2608.02642](https://doi.org/10.48550/arXiv.2608.02642). Published results
  were produced with the `v0.1.0` release.
- Repository — [`weitse-hsu/MDArena`](https://github.com/weitse-hsu/MDArena) at tag `v0.1.0`,
  commit `d50547a`. **MIT**, © 2026 Wei-Tse Hsu, with third-party scientific data carved out
  and itemised in `docs/DATA_PROVENANCE.md`.
- Canary statement — [CANARY.md](https://github.com/weitse-hsu/MDArena/blob/v0.1.0/CANARY.md).
  Read it before doing anything with the task material; this page deliberately reproduces
  neither marker GUID.
- Runner — [`harbor-framework/harbor`](https://github.com/harbor-framework/harbor),
  Apache-2.0, on PyPI as `harbor`. Version 0.22.0 was the one installed and inspected here.
- Structures — the RCSB PDB data API, used above to confirm the provenance table. wwPDB
  releases structural data without copyright restriction; the obligation is citation, and it
  applies to processed derivatives too.

The text of this skill is original and CC-BY-4.0. It documents MDArena's interfaces, metadata
and access surface; it reproduces none of its evaluation material.
