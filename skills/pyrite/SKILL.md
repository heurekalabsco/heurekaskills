---
name: pyrite
description: Load Pyrite, a 1,500-pair protein-ligand pose-ranking benchmark where the task is picking which of two docked poses sits closer to the crystal pose. Both 750-pair sets, the 113-column schema, the 34 label-leaking columns, and why the paper's per-pair scoring and the repository's per-structure convention disagree.
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
  date: 2026-11-14
  against: Pyrite v6.1 (curated + random, 750 pairs x 113 columns each) / pandas 3.1.1 and numpy 2.5.4 on Python 3.12.8 / paper figures checked against arXiv 2611.14511v1 Table 1
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
everyone reaches for — lands at **33%** pairwise accuracy on the curated set: 0.32 on the
pre-AF3 half and 0.34 on the post-AF3 half, which are the paper's own Table 1 figures. Not near
chance. Well below it. Everything below is organised around getting that right, starting with
which accuracy you are computing — the repository and the paper do not use the same one.

## What is in the public release, and what is not

The repository holds the **benchmark data only**: two CSVs, the same two sets as Parquet, and a
self-contained `viewer.html` for inspecting pairs in 3D. That is all four data files and one
viewer — there is no package to install and no Python module to import.

The paper also describes **PyriteRep** (a structured pose representation) and two agents built on
it, **PyriteReasoner** and **PyriteFeaturizer**, reported at up to 67% and 74% accuracy. Those are
**not in the public repository** as of 2026-11-14. If you came looking for the agents, you will
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
you are going to read these repeatedly — 3.1 MB against 15.7 MB for the curated set. What the
CSV spends its bytes on is text blobs: the two
`metriclog_mogul_unusual_torsions_details_*` log columns are about 30% of the file each, so
roughly 60% between them, and the `pose_A` / `pose_B` coordinate blocks a further 24%. If you
only need the numeric descriptors, dropping those four columns on read is the cheaper win.

`pandas` will also read them straight from the URL, which is enough for a first look:

```python
import pandas as pd

base = "https://raw.githubusercontent.com/genesistherapeutics/pyrite/main/data"
cur = pd.read_csv(f"{base}/pyrite_v6.1_curated.csv", low_memory=False)
rnd = pd.read_csv(f"{base}/pyrite_v6.1_random.csv", low_memory=False)

for name, df in [("curated", cur), ("random", rnd)]:
    print(name, df.shape, "structures", df.structure_id.nunique(), "proteins", df.uniprot_id.nunique())
```

Observed 2026-11-14, v6.1: `curated (750, 113) structures 177 proteins 120` and
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

## Score it per pair, the way the paper does

**Report plain per-pair accuracy, split by `released_after_af3_cutoff`.** That is what the paper
reports and the only number comparable to its published baselines. Table 1 of arXiv:2611.14511v1
is captioned *"No method achieves pairwise accuracy significantly above chance"* and gives MM-GBSA
as 0.32 (pre-AF3 curated), 0.34 (post-AF3 curated) and 0.35 (post-AF3 full); the methods section
says only *"Because Pyrite is a balanced binary-classification task, we focus on comparing the
accuracy of various pose-ranking methods"* — one accuracy, over pairs, with abstentions counted
wrong.

**The repository's README states a different convention** — "mean per-structure accuracy", where
correctness is averaged within each `structure_id` and those averages are then averaged, so every
structure counts once. **It disagrees with the paper, and the paper does not use it**: nothing in
the preprint defines per-structure averaging. Treat per-structure as a secondary, README-defined
view, and never read it against Table 1.

Both are worth computing, because the gap between them tells you how much of a result is
weighting. Structures contribute between 1 and 37 pairs each on the curated set (median 2), so a
per-pair number leans on whichever complexes are over-represented, and the per-structure number
removes that lean along with any comparability to the paper:

```python
import pandas as pd, numpy as np

df = pd.read_csv("pyrite/pyrite_v6.1_curated.csv", low_memory=False)

def per_pair(df, pred):
    """pred: array of 'A'/'B' aligned to df.index. The paper's metric."""
    return (np.asarray(pred) == df.correct.to_numpy()).mean()

def mean_per_structure(df, pred):
    """The README's metric. Not comparable to the paper's Table 1."""
    hit = (np.asarray(pred) == df.correct.to_numpy()).astype(float)
    return pd.Series(hit, index=df.index).groupby(df.structure_id).mean().mean()

mm = np.where(df.mm_step1_binding_energy_A < df.mm_step1_binding_energy_B, "A", "B")
print("MM-GBSA  per-pair      :", round(per_pair(df, mm), 4))
for flag, g in df.groupby("released_after_af3_cutoff"):
    low = np.where(g.mm_step1_binding_energy_A < g.mm_step1_binding_energy_B, "A", "B")
    print(f"MM-GBSA  per-pair post-AF3={flag}:", round(per_pair(g, low), 4))
print("MM-GBSA  per-structure :", round(mean_per_structure(df, mm), 4))
print("always-A per-pair      :", round(per_pair(df, np.array(["A"] * len(df))), 4))
```

Observed 2026-11-14, v6.1: per-pair `0.3267` overall, `0.3196` pre-AF3 and `0.3396` post-AF3 —
those last two are the paper's 0.32 and 0.34 reproduced to the digits it printed. Per-structure
reads `0.2612`, six points lower, and matches nothing published. The always-A line reads `0.488`:
the label is balanced, so **0.5 is chance**, and any real baseline has to be read against that.

## The physics baseline is below chance, on both sets

Ranking by MM-GBSA energy in the intuitive direction does not merely fail to help. It is
anti-correlated with the answer, and it stays that way when you leave the hand-curated set:

```python
import pandas as pd, numpy as np

for name in ["curated", "random"]:
    df = pd.read_csv(f"pyrite/pyrite_v6.1_{name}.csv", low_memory=False)
    lower = np.where(df.mm_step1_binding_energy_A < df.mm_step1_binding_energy_B, "A", "B")
    acc = (lower == df.correct).mean()
    hit = pd.Series((lower == df.correct).astype(float).to_numpy(), index=df.index)
    per_struct = hit.groupby(df.structure_id).mean().mean()
    print(f"{name:8s} per-pair {acc:.4f}  (inverted {1 - acc:.4f})"
          f"   per-structure {per_struct:.4f}")
```

Observed 2026-11-14: curated per-pair `0.3267`, random per-pair `0.3347`; per-structure `0.2612`
and `0.3500`. Below chance on both sets and on either metric.

**Do not read the inverted figure as a scoring function.** Inverting a baseline because its
complement looks good on the same 1,500 pairs is fitting the benchmark, and the inversion has no
physical reading — a pose being *less* favourable by MM-GBSA is not evidence it is right. What the
numbers say is narrower and more useful: on pairs built this way the energy term carries real
signal about the label and carries it with the wrong sign. The paper reports the same trap for
people: five expert chemists shown these scores scored 0.42 pre-AF3 and 0.45 post-AF3 counting
abstentions as wrong, 0.51 and 0.57 on decisive calls only, and were least accurate on the pairs
where their stated reasoning leaned on MM-GBSA. Treat MM-GBSA as one input to a learned
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

frames = {}
for name in ["curated", "random"]:
    df = pd.read_csv(f"pyrite/pyrite_v6.1_{name}.csv", low_memory=False)
    frames[name] = df
    print(name,
          "| pair_kind", dict(df.pair_kind.value_counts()),
          "| post-AF3", int(df.released_after_af3_cutoff.sum()),
          "| water", dict(df.water_class.value_counts()))

cur, rnd = frames["curated"], frames["random"]
print("shared pair_id:", len(set(cur.pair_id) & set(rnd.pair_id)),
      "| shared structure_id:", len(set(cur.structure_id) & set(rnd.structure_id)),
      "| union structures:", len(set(cur.structure_id) | set(rnd.structure_id)))
```

Observed 2026-11-14:

- **curated** — `good_maybe` 649 / `good_bad` 101; 265 of 750 post-AF3; water `no_water` 600,
  `protein_ligand_water` 150.
- **random** — `good_maybe` 613 / `good_bad` 137; 219 of 750 post-AF3; water
  `protein_ligand_water` 731, `no_water` 19.

The water split is the one that surprises: 20% of curated pairs have a crystallographic water
bridging protein and ligand, against 97% of random pairs. Report the two sets separately unless
you have a reason not to.

**The pairs are disjoint; the structures are not.** No `pair_id` appears in both files, and the
union is exactly the paper's 1,500 pairs over 285 structures — but **89 of those 285 structures
appear in both sets**, because `curated` is the annotated half of one pool and `random` is the
rest. So concatenating the two frames and grouping by `structure_id` silently merges a structure's
curated pairs with its random ones, averaging across two very differently composed sets — 20%
versus 97% bridging water — inside what looks like one structure's score. Keep the sets apart, or
group by `(set, structure_id)` if you must pool.

`released_after_af3_cutoff` is the temporal split — `True` means the entry was released after the
AlphaFold3 training cutoff, so it is the held-out half for anything that may have seen PDB
entries in training. On the curated set the MM-GBSA baseline reads **0.3196 per pair pre-cutoff
and 0.3396 post-cutoff** (the paper's 0.32 and 0.34); on random, 0.3202 and 0.3699. The
README-convention per-structure figures for the same splits are 0.2254 and 0.3385 on curated,
0.3167 and 0.4242 on random — the curated post-cutoff 0.3385 lands a hair under the paper's 0.34
by coincidence and is **not** a reproduction of it. Every half is below chance on either metric,
but a single pooled number hides the gap:

```python
import pandas as pd, numpy as np

for name in ["curated", "random"]:
    df = pd.read_csv(f"pyrite/pyrite_v6.1_{name}.csv", low_memory=False)
    for held_out, g in df.groupby("released_after_af3_cutoff"):
        lower = np.where(g.mm_step1_binding_energy_A < g.mm_step1_binding_energy_B, "A", "B")
        hit = pd.Series((lower == g.correct).astype(float).to_numpy(), index=g.index)
        print(f"{name:8s} post-AF3={held_out}  pairs={len(g):4d}"
              f"  structures={g.structure_id.nunique():3d}"
              f"  per-pair={(lower == g.correct).mean():.4f}"
              f"  per-structure={hit.groupby(g.structure_id).mean().mean():.4f}")
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

**Data** — both released sets, 750 pairs each, CC BY 4.0, fetched from the project repository
(`raw.githubusercontent.com/genesistherapeutics/pyrite`, confirmed reachable 2026-11-14).

**Run** — in an empty directory:

```bash
python3 -m pip install --quiet "pandas>=2.0"

base=https://raw.githubusercontent.com/genesistherapeutics/pyrite/main/data
curl -sSL -o pyrite_curated.csv "$base/pyrite_v6.1_curated.csv"
curl -sSL -o pyrite_random.csv  "$base/pyrite_v6.1_random.csv"

python3 - <<'PY'
import pandas as pd, numpy as np

df  = pd.read_csv("pyrite_curated.csv", low_memory=False)
rnd = pd.read_csv("pyrite_random.csv", low_memory=False)
print("shape", df.shape, "structures", df.structure_id.nunique())

# INVARIANT: `correct` names whichever pose has the smaller RMSD to the crystal pose.
implied = np.where(df.metric_rmsd_A < df.metric_rmsd_B, "A", "B")
agree = (implied == df.correct).mean()
print("label == closer-pose:", agree)
assert agree == 1.0, "label no longer agrees with the RMSD columns"

# INVARIANT: the sets share no pair but do share structures, so a pooled frame
# grouped by structure_id merges two differently composed sets per structure.
shared_pairs = len(set(df.pair_id) & set(rnd.pair_id))
shared_structures = len(set(df.structure_id) & set(rnd.structure_id))
print("shared pairs:", shared_pairs, "| shared structures:", shared_structures)
assert shared_pairs == 0, "the sets are no longer disjoint at the pair level"
assert shared_structures > 0, "the sets no longer share structures"

# INVARIANT: chance is 0.5 — the label is balanced across the pair.
print("always-A per-pair:", round((df.correct == "A").mean(), 4))

# OBSERVED (v6.1, 2026-11-14): the MM-GBSA baseline sits far below chance.
# Per-pair is the paper's metric; per-structure is the README's and is not comparable to it.
lower = np.where(df.mm_step1_binding_energy_A < df.mm_step1_binding_energy_B, "A", "B")
print("MM-GBSA per-pair:", round((lower == df.correct).mean(), 4))
for flag, g in df.groupby("released_after_af3_cutoff"):
    low = np.where(g.mm_step1_binding_energy_A < g.mm_step1_binding_energy_B, "A", "B")
    print(f"MM-GBSA per-pair post-AF3={flag}:", round((low == g.correct).mean(), 4))
hit = pd.Series((lower == df.correct).astype(float).to_numpy(), index=df.index)
print("MM-GBSA per-structure:", round(hit.groupby(df.structure_id).mean().mean(), 4))
PY
```

**Expect**

- `shape (750, 113) structures 177` — **invariant** for v6.1; a change means the set was revised.
- `label == closer-pose: 1.0` — **invariant**. This is the benchmark's definition, and the assert
  is there because a failure means the label and the RMSD columns have come apart, which would
  invalidate anything built on either.
- `shared pairs: 0 | shared structures: 89` — the zero is an **invariant**: the two files partition
  the 1,500 pairs. The 89 is **observed**, v6.1, and is why the asserts are separate — a structure
  in both sets is pooled across two compositions if you group a concatenated frame by
  `structure_id`.
- `always-A per-pair: 0.488` — **observed**, v6.1. Near 0.5 by construction; drift of a point or
  two across a revision is composition, not breakage.
- `MM-GBSA per-pair: 0.3267`, with `post-AF3=False: 0.3196` and `post-AF3=True: 0.3396` —
  **observed**, v6.1. These are the paper's metric, and the two split figures reproduce Table 1's
  0.32 and 0.34.
- `MM-GBSA per-structure: 0.2612` — **observed**, v6.1, under the README's per-structure
  convention. It is six points below the per-pair figure and matches nothing in the paper, so do
  not compare it to Table 1.
- A different number anywhere in the observed lines is drift to investigate, not a bug. The thing
  that would be a bug is the MM-GBSA figures rising above 0.5 while the invariants hold, because
  the whole finding above rests on them being below.

## Sources

- Benchmark repository, data and viewer: https://github.com/genesistherapeutics/pyrite
- Repository README, source of the per-structure convention and the column reference:
  https://raw.githubusercontent.com/genesistherapeutics/pyrite/main/README.md
- Licence, CC BY 4.0, "including commercially":
  https://raw.githubusercontent.com/genesistherapeutics/pyrite/main/LICENSE
- Srivastava, M. et al. *Pyrite: Building and Benchmarking Protein-Ligand Pose Ranking Agents.*
  arXiv:2611.14511 — https://arxiv.org/abs/2611.14511. Table 1 is the source of the per-pair
  baselines quoted above; the v1 PDF is at https://arxiv.org/pdf/2611.14511v1
- Structures: RCSB PDB entries named in `pdb_id`.
