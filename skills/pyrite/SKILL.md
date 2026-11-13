---
name: pyrite
description: Load Pyrite, a 1,500-pair protein-ligand pose-ranking benchmark where the task is picking which of two docked poses sits closer to the crystal pose. Both 750-pair sets, the 113-column schema, the 34 label-leaking columns, and per-structure scoring.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, docking, pose-ranking, evaluation, ligand]
covers: [pose ranking, pose selection, protein-ligand, docking, cofolding, binding mode, crystal pose, rmsd, mm-gbsa, posebusters, torsion strain, interaction fingerprint, electron density, virtual screening, structure-based drug design, pdb, uniprot, alphafold3, temporal split, benchmark, agent evaluation, llm agents, small molecule, drug discovery]
papers: [doi:10.48550/arXiv.2611.14511]
access: [open]
platform: github
datasets: [https://raw.githubusercontent.com/genesistherapeutics/pyrite/main/data/pyrite_v6.1_curated.csv, https://raw.githubusercontent.com/genesistherapeutics/pyrite/main/data/pyrite_v6.1_random.csv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-13
  against: Pyrite v6.1 (curated + random, 750 pairs x 113 columns each) / pandas 3.0.5 on Python 3.13 and pandas 3.1.1 on Python 3.11, identical figures on both / numpy 2.5.3
  executed: 9
  unverified: 0
  unverified_reason: none — all nine runnable blocks executed against the released CSVs
---
# Pyrite

**A pairwise pose-ranking benchmark: given two docked poses of the same protein-ligand complex,
pick the one closer to the experimental binding mode.** 1,500 pairs in two sets of 750, every
complex from a public RCSB PDB entry, every pose carrying 3D coordinates, an interaction
fingerprint, and physics and geometry descriptors.

What makes it worth a skill is that the obvious way to score it is worse than guessing. The
MM-GBSA binding energy ships in the file, and ranking by it — lower energy wins, the direction
everyone reaches for — lands at **26%** mean per-structure accuracy on the curated set. Not near
chance. Well below it. Everything below is organised around getting that right.

## What is in the public release, and what is not

The repository holds the **benchmark data only**: two CSVs, the same two sets as Parquet, and a
self-contained `viewer.html` for inspecting pairs in 3D. That is all four data files and one
viewer — there is no package to install and no Python module to import.

The paper also describes **PyriteRep** (a structured pose representation) and two agents built on
it, **PyriteReasoner** and **PyriteFeaturizer**, reported at up to 67% and 74% accuracy. Those are
**not in the public repository** as of 2026-11-13. If you came looking for the agents, you will
find the benchmark they were measured on and nothing else; the numbers above are the paper's,
not something this skill can reproduce.

Nothing here needs an account, a key or a GPU. The data is a plain HTTPS download, and the
only dependency is **Python 3 with `pandas`** (`numpy` comes with it) — `python3 -m pip install
pandas`. Everything below is `pandas` over a local file.

## Licence

**CC BY 4.0**, published by Genesis Therapeutics — share and adapt, including commercially, with
credit. The structures underneath are public PDB entries; cite the relevant ones alongside the
benchmark where your work leans on them.

## Get the files

Both sets, straight from the repository. 15.7 MB and 16.3 MB respectively:

```bash
mkdir -p pyrite
base=https://raw.githubusercontent.com/genesistherapeutics/pyrite/main/data
curl -sSL -o pyrite/pyrite_v6.1_curated.csv "$base/pyrite_v6.1_curated.csv"
curl -sSL -o pyrite/pyrite_v6.1_random.csv  "$base/pyrite_v6.1_random.csv"
ls -l pyrite/
```

Parquet is available at the same paths with a `.parquet` extension and is the better choice if
you are going to read these repeatedly — the CSV carries multi-kilobyte text blobs in `pose_A`
and `pose_B`, which is most of its size.

`pandas` will also read them straight from the URL, which is enough for a first look:

```python
import pandas as pd

base = "https://raw.githubusercontent.com/genesistherapeutics/pyrite/main/data"
cur = pd.read_csv(f"{base}/pyrite_v6.1_curated.csv", low_memory=False)
rnd = pd.read_csv(f"{base}/pyrite_v6.1_random.csv", low_memory=False)

for name, df in [("curated", cur), ("random", rnd)]:
    print(name, df.shape, "structures", df.structure_id.nunique(), "proteins", df.uniprot_id.nunique())
```

Observed 2026-11-13, v6.1: `curated (750, 113) structures 177 proteins 120` and
`random (750, 113) structures 197 proteins 138`. The two sets share one schema and are built the
same way; `curated` is hand-selected for difficulty, `random` is sampled.

## The columns that leak the label

This is the first thing to get right, because 34 of the 113 columns are computed **against the
crystal structure** and therefore encode the answer. Feed any of them to a model and you will
measure nothing.

The leaking families, by prefix: `metric_rmsd_*`, `pose_rmsds_*`, `metric_lddt_pli_*`,
`metric_gt_interaction_*`, the density-support fractions `gt_frac` / `a_frac` / `b_frac`, the
set-construction flags `C1` / `C2` / `C3`, and the labels `correct` and `MM_correct` themselves.

Split the frame once, up front, and keep the halves apart:

```python
import pandas as pd, re

LEAKS = re.compile(
    r"^(metric_rmsd|pose_rmsds|metric_lddt_pli|metric_gt_interaction"
    r"|gt_frac$|a_frac$|b_frac$|C[123]$|correct$|MM_correct$)"
)

df = pd.read_csv("pyrite/pyrite_v6.1_curated.csv", low_memory=False)
leaky = [c for c in df.columns if LEAKS.match(c)]
inputs = df[[c for c in df.columns if c not in leaky]]
labels = df[["pair_id", "structure_id", "correct"]]

print("leaking:", len(leaky), "| model inputs:", inputs.shape[1], "| total:", df.shape[1])
```

Observed: `leaking: 34 | model inputs: 79 | total: 113`.

Note what is **not** on that list. `mm_step1_binding_energy_A` / `_B` are a physics score computed
from the pose alone, so they are legitimate inputs — and the whole point of the benchmark is that
they are weak ones. `MM_correct` is a convenience flag derived from them *and* the label, so it
leaks; the energies do not.

## Score it per structure, not per pair

The paper's convention is **mean per-structure accuracy**: average correctness within each
`structure_id`, then average those averages, so every structure counts once.

That is not a formality. Structures contribute between 1 and 37 pairs each (median 2), so pair-level
accuracy silently weights the benchmark toward whichever handful of complexes happen to be
over-represented. On the curated set the MM-GBSA baseline reads 0.327 per pair and 0.261 per
structure — a six-point gap from the weighting alone.

```python
import pandas as pd, numpy as np

df = pd.read_csv("pyrite/pyrite_v6.1_curated.csv", low_memory=False)

def mean_per_structure(df, pred):
    """pred: array of 'A'/'B' aligned to df.index. Returns mean per-structure accuracy."""
    hit = (np.asarray(pred) == df.correct.to_numpy()).astype(float)
    return pd.Series(hit, index=df.index).groupby(df.structure_id).mean().mean()

mm = np.where(df.mm_step1_binding_energy_A < df.mm_step1_binding_energy_B, "A", "B")
print("MM-GBSA  per-structure:", round(mean_per_structure(df, mm), 4))
print("MM-GBSA  per-pair     :", round((mm == df.correct).mean(), 4))
print("always-A per-structure:", round(mean_per_structure(df, np.array(["A"] * len(df))), 4))
```

Observed 2026-11-13: `0.2612`, `0.3267`, `0.5007`. The always-A line is the one to keep in view —
the label is balanced, so **0.5 is chance**, and any real baseline has to be read against that.

## The physics baseline is below chance, on both sets

Ranking by MM-GBSA energy in the intuitive direction does not merely fail to help. It is
anti-correlated with the answer, and it stays that way when you leave the hand-curated set:

```python
import pandas as pd, numpy as np

for name in ["curated", "random"]:
    df = pd.read_csv(f"pyrite/pyrite_v6.1_{name}.csv", low_memory=False)
    lower = np.where(df.mm_step1_binding_energy_A < df.mm_step1_binding_energy_B, "A", "B")
    hit = pd.Series((lower == df.correct).astype(float).to_numpy(), index=df.index)
    acc = hit.groupby(df.structure_id).mean().mean()
    print(f"{name:8s} lower-energy-wins {acc:.4f}   higher-energy-wins {1 - acc:.4f}")
```

Observed 2026-11-13: curated `0.2612` / `0.7388`, random `0.3500` / `0.6500`.

**Do not read the second column as a scoring function.** Inverting a baseline because its
complement looks good on the same 1,500 pairs is fitting the benchmark, and the inversion has no
physical reading — a pose being *less* favourable by MM-GBSA is not evidence it is right. What the
numbers say is narrower and more useful: on pairs built this way the energy term carries real
signal about the label and carries it with the wrong sign, which is why the paper finds expert
chemists holding these same scores performing near chance. Treat MM-GBSA as one input to a learned
combination, not as a ranker.

## Eleven columns cannot discriminate anything

Identical in both sets, and a cheap thing to check before spending time on a feature:

```python
import pandas as pd

for name in ["curated", "random"]:
    df = pd.read_csv(f"pyrite/pyrite_v6.1_{name}.csv", low_memory=False)
    const = {c: df[c].unique()[0] for c in df.columns if df[c].nunique(dropna=False) == 1}
    print(name, len(const), "constant columns")
    for c, v in const.items():
        print(f"   {c} = {v!r}")
```

Observed: 11 in each set — `metric_pb_valid_A` and `metric_pb_valid_B` are both `1.0`,
`map_available` is `'yes'`, `C1` / `C2` / `C3` are all `False`, `is_drug_like` is `True`,
`missing_ion_coordinating` and `missing_ion_nearby` are `False`, `missing_ion_elems` is `NaN`,
and `missing_ion_min_dist` is `-1.0`.

Two of those are worth naming. **PoseBusters validity is constant**, so the one pose-intrinsic
physical check most people would try first has already been applied as a filter during set
construction and discriminates nothing that remains. And the **`missing_ion_*` family is empty** —
documented as flagging under-represented coordinating ions, but carrying no such case in either
released set. A feature built on either is a feature built on a constant.

## The two sets are not interchangeable

Same schema, same size, different composition — so pooling them changes the distribution of
things you may be conditioning on:

```python
import pandas as pd

for name in ["curated", "random"]:
    df = pd.read_csv(f"pyrite/pyrite_v6.1_{name}.csv", low_memory=False)
    print(name,
          "| pair_kind", dict(df.pair_kind.value_counts()),
          "| post-AF3", int(df.released_after_af3_cutoff.sum()),
          "| water", dict(df.water_class.value_counts()))
```

Observed 2026-11-13:

- **curated** — `good_maybe` 649 / `good_bad` 101; 265 of 750 post-AF3; water `no_water` 600,
  `protein_ligand_water` 150.
- **random** — `good_maybe` 613 / `good_bad` 137; 219 of 750 post-AF3; water
  `protein_ligand_water` 731, `no_water` 19.

The water split is the one that surprises: 20% of curated pairs have a crystallographic water
bridging protein and ligand, against 97% of random pairs. Report the two sets separately unless
you have a reason not to.

`released_after_af3_cutoff` is the temporal split — `True` means the entry was released after the
AlphaFold3 training cutoff, so it is the held-out half for anything that may have seen PDB
entries in training. On the curated set the MM-GBSA baseline reads 0.2254 pre-cutoff and 0.3385
post-cutoff; on random, 0.3167 and 0.4242. Both halves are below chance either way, but the gap
is large enough that a single pooled number hides it.

```python
import pandas as pd, numpy as np

df = pd.read_csv("pyrite/pyrite_v6.1_curated.csv", low_memory=False)
for held_out, g in df.groupby("released_after_af3_cutoff"):
    lower = np.where(g.mm_step1_binding_energy_A < g.mm_step1_binding_energy_B, "A", "B")
    hit = pd.Series((lower == g.correct).astype(float).to_numpy(), index=g.index)
    print(f"post-AF3={held_out}  pairs={len(g):4d}  structures={g.structure_id.nunique():3d}"
          f"  MM per-structure={hit.groupby(g.structure_id).mean().mean():.4f}")
```

## What this skill will not do

- **It will not run the paper's agents.** PyriteRep, PyriteReasoner and PyriteFeaturizer are
  described in the preprint and absent from the public release; the 67% and 74% figures are
  reported results, not something you can reproduce from these files.
- **It will not re-dock anything.** The poses are fixed and shipped as coordinates. This is a
  ranking benchmark over a frozen pose set, not a docking pipeline.
- **It will not tell you a pose is correct in absolute terms.** Every item is a comparison between
  two poses of the same complex. "Closer to crystal" is the only question asked.

## Try it

**Data** — the curated set, 750 pairs, CC BY 4.0, fetched from the project repository
(`raw.githubusercontent.com/genesistherapeutics/pyrite`, confirmed reachable 2026-11-13).

**Run** — in an empty directory:

```bash
python3 -m pip install --quiet "pandas>=2.0"

curl -sSL -o pyrite_curated.csv \
  https://raw.githubusercontent.com/genesistherapeutics/pyrite/main/data/pyrite_v6.1_curated.csv

python3 - <<'PY'
import pandas as pd, numpy as np

df = pd.read_csv("pyrite_curated.csv", low_memory=False)
print("shape", df.shape, "structures", df.structure_id.nunique())

# INVARIANT: `correct` names whichever pose has the smaller RMSD to the crystal pose.
implied = np.where(df.metric_rmsd_A < df.metric_rmsd_B, "A", "B")
agree = (implied == df.correct).mean()
print("label == closer-pose:", agree)
assert agree == 1.0, "label no longer agrees with the RMSD columns"

# INVARIANT: chance is 0.5 — the label is balanced across the pair.
always_a = pd.Series((df.correct == "A").astype(float).to_numpy(), index=df.index)
print("always-A per-structure:", round(always_a.groupby(df.structure_id).mean().mean(), 4))

# OBSERVED (v6.1, 2026-11-13): the MM-GBSA baseline sits far below chance.
lower = np.where(df.mm_step1_binding_energy_A < df.mm_step1_binding_energy_B, "A", "B")
hit = pd.Series((lower == df.correct).astype(float).to_numpy(), index=df.index)
print("MM-GBSA per-structure:", round(hit.groupby(df.structure_id).mean().mean(), 4))
PY
```

**Expect**

- `shape (750, 113) structures 177` — **invariant** for v6.1; a change means the set was revised.
- `label == closer-pose: 1.0` — **invariant**. This is the benchmark's definition, and the assert
  is there because a failure means the label and the RMSD columns have come apart, which would
  invalidate anything built on either.
- `always-A per-structure: 0.5007` — **observed**, v6.1. Near 0.5 by construction; drift of a point
  or two across a revision is composition, not breakage.
- `MM-GBSA per-structure: 0.2612` — **observed**, v6.1; identical under pandas 3.0.5 and 3.1.1. A different number is
  drift to investigate, not a bug. The thing that would be a bug is this rising above 0.5 while
  the invariants hold, because the whole finding above rests on it being below.

## Sources

- Benchmark repository, data and viewer: https://github.com/genesistherapeutics/pyrite
- Srivastava, M. et al. *Pyrite: Building and Benchmarking Protein-Ligand Pose Ranking Agents.*
  arXiv:2611.14511 — https://arxiv.org/abs/2611.14511
- Structures: RCSB PDB entries named in `pdb_id`.
