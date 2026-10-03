---
name: posebusters
description: Check whether a docked or generated ligand pose is physically plausible with PoseBusters — chemistry, internal geometry, protein clashes, volume overlap and symmetry-corrected RMSD. Use to filter docking or co-folding poses before ranking them.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [docking, pose-validation, quality-control, rdkit, rmsd]
datasets: [https://files.rcsb.org/download/1IEP.pdb, https://files.rcsb.org/ligands/download/STI_ideal.sdf]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-01
  against: posebusters 0.6.5 (PyPI) / RDKit 2026.3.6 / pandas 3.0.6 / Python 3.11.15 on Linux x86_64
  executed: 10
  unverified: 0
---

# PoseBusters — is this pose physically possible?

A docking program or a co-folding model will always hand back a pose. It will not
tell you whether that pose is a molecule at all. PoseBusters runs a fixed battery
of checks over a predicted ligand pose — is the chemistry intact, are the bond
lengths and angles sane, are the aromatic rings flat, does the ligand sit inside
the protein instead of beside it or through it — and answers each one `True` or
`False`.

It is a **validity filter, not a scoring function.** It never tells you a pose is
*right*, only that nothing about it is impossible. A pose that passes all checks
can still be the wrong binding mode; a pose that fails any of them is not worth
ranking. Use it between pose generation and whatever you do next.

This pairs with the docking skills in this registry: `autodock-vina` and
`diffdock-nim` both emit poses that nothing else here checks.

## Nothing to obtain

CPU only, no account, no API key, no licence to accept. One `pip install` and the
inputs you already have. The package is pure Python over RDKit.

```bash
pip install "posebusters==0.6.5"
```

`0.6.5` is the current release on PyPI. Pin it — the check batteries and the
column names below are version-surface, and a later release may add modules.

**A licence mismatch worth knowing about.** The project's `LICENSE` file is the
MIT licence (Copyright 2025 Martin Buttenschoen). The packaging metadata carries
`License :: OSI Approved :: BSD License`, a stale classifier, so PyPI displays
BSD. The `LICENSE` file is what governs. Cite MIT, and expect automated licence
scanners pointed at package metadata to disagree.

## Three modes, and the mode is inferred from your arguments

There is one entry point, `bust`, and it decides what to check from which inputs
you give it. This is the first thing to get right, because the wrong mode still
prints a clean pass.

| you pass | mode | checks |
|---|---|---|
| `mol_pred` | `mol` | 12 |
| `mol_pred -p protein` | `dock` | 22 |
| `mol_pred -l crystal -p protein` | `redock` | 28 |

- **`mol`** — the ligand alone: loading, sanitization, InChI round-trip, connectivity,
  radicals, bond lengths, bond angles, internal clashes, ring flatness and
  non-flatness, double-bond flatness, internal energy.
- **`dock`** adds the ten protein-aware checks: minimum distance and volume overlap
  against the protein, organic cofactors, inorganic cofactors and waters, plus a
  maximum-distance check that catches a ligand parked outside the structure.
- **`redock`** adds identity and geometry against a reference ligand: molecular
  formula, bond graph, double-bond stereochemistry, tetrahedral chirality, and
  `rmsd_≤_2å` — the symmetry-corrected 2 Å criterion that "PB-valid" rates are
  quoted against.

**Forgetting `-p` is the easy mistake.** The same file scores 12/12 in `mol` mode
and 22/22 in `dock` mode, and the ten checks you actually wanted — the ones about
the pocket — are simply absent from the first. Nothing warns you. Count the
denominator in the output and make sure it is the one you meant.

## Running it

The examples below use the three files `## Try it` builds from PDB entry 1IEP —
`crystal.sdf` (one ligand pose), `poses.sdf` (three) and `protein.pdb`. Run that
section first and every block on this page is runnable as written.

```bash
bust crystal.sdf -p protein.pdb --outfmt short
```

Three output formats. `short` is one line per pose with a pass count, `long`
prints every check by name, `csv` emits one row per pose with one boolean column
per check and is what you want for anything downstream.

```bash
bust poses.sdf -p protein.pdb --outfmt long          # every check, named
bust poses.sdf -p protein.pdb --outfmt csv --output report.csv
```

A multi-model SDF — what a docking run actually produces — gives one row per
pose, numbered by `position` from 0 and named from the molecule's title line:

```
poses.sdf shift_0.0  0  passes (22 / 22)
poses.sdf shift_1.5  1  passes (21 / 22)
poses.sdf shift_10.0 2  passes (20 / 22)
```

`--top-n N` restricts the run to the first N poses in the file, which is the usual
want when a program emits twenty and you ranked the top five. `--max-workers` and
`--chunk-size` parallelise across poses.

For many complexes, drive it from a table instead of a shell loop. The CSV's
columns are the argument names:

```bash
printf 'mol_pred,mol_true,mol_cond\nposes.sdf,crystal.sdf,protein.pdb\n' > batch.csv
bust -t batch.csv --outfmt csv --output report.csv
```

## The exit code is not the verdict

`bust` exits **0 whether every check passed or several failed.** It is a reporting
tool, and the report is on stdout.

```bash
bust poses.sdf -p protein.pdb --outfmt short > /dev/null; echo "exit=$?"   # 0
```

Two consequences, both of which bite scripts rather than people:

- **A missing input file exits 2** (argument parsing), so a non-zero exit means
  "I could not run", never "the pose is bad".
- **An unparseable input prints nothing and exits 0.** A truncated or malformed
  SDF produces no rows at all — not a failing row. A pipeline that counts failures
  sees zero and calls it clean.

So never gate on `$?`. Gate on the parsed output, which means the Python API.

## The Python API is the scriptable route

`bust()` returns a pandas DataFrame: a `(file, molecule, position)` MultiIndex and
one boolean column per check — 12, 22 or 28 of them depending on the mode. On a
default report every column is a check, so the per-pose verdict is one call:

```python
from posebusters import PoseBusters

pb = PoseBusters(config="dock")                     # "mol" | "dock" | "redock"
df = pb.bust(["poses.sdf"], None, "protein.pdb")    # mol_pred(s), mol_true, mol_cond

verdict = df.all(axis=1)        # True only if every check in the mode passed
print(verdict)
print("valid poses:", int(verdict.sum()), "of", len(verdict))
```

Keep the DataFrame rather than the booleans when you need to say *why* a pose
failed — `df.columns[~df.loc[row]]` names the failing checks, and that is what
belongs in a methods section.

### Numbers behind the booleans

`full_report=True` (or `--full-report` on the CLI) keeps the measured quantity next
to each verdict — 112 columns in `dock` mode instead of 22, and 133 in `redock`
instead of 28. This is what turns "failed the clash check" into "five atom pairs
clashed and the worst contact was 0.49 of the sum of their van der Waals radii",
which is the version that belongs in a methods section:

```python
from posebusters import PoseBusters

full = PoseBusters(config="dock").bust(["poses.sdf"], None, "protein.pdb",
                                       full_report=True)
print(full[["smallest_distance_protein", "num_pairwise_clashes_protein",
            "most_extreme_relative_distance_protein",
            "volume_overlap_protein"]].to_string())
```

The protein-aware numbers are suffixed `_protein`, with parallel
`_organic_cofactors`, `_inorganic_cofactors` and `_waters` sets:
`smallest_distance_protein` (Å), `num_pairwise_clashes_protein`,
`most_extreme_relative_distance_protein` (the worst contact as a fraction of the
summed radii — below 1.0 is an overlap) and `volume_overlap_protein` (a fraction).
For the ligand on its own: `number_clashes`,
`shortest_noncovalent_relative_distance`, `number_short_outlier_bonds` /
`number_long_outlier_bonds`, `most_extreme_relative_angle`,
`aromatic_ring_maximum_distance_from_plane` and `energy_ratio`.

Note what *does not* move: a rigid translation leaves every internal-geometry
number identical, because none of them involves the protein. If a column reads the
same across poses that clearly differ, check that it is measuring what you think.

**Do not take the verdict from a full report.** Of its 133 `redock` columns, 46 are
booleans and only 28 are checks; the rest are diagnostics, and some read `False` on
a pose that passed everything — `most_extreme_clash_protein` and the three
`not_too_far_away_*` columns do, because they report a condition rather than a
result. `df.select_dtypes(bool).all(axis=1)` over a full report therefore calls
**every** pose invalid, a deposited crystal ligand included. Run twice if you want
both: once plain for the verdict, once with `full_report=True` for the numbers.

## Two traps that silently invert the answer

### A ligand read from a PDB file has no bond orders

`Chem.MolFromPDBFile` cannot recover bond orders — the format does not carry them.
Every aromatic ring comes back as single bonds. PoseBusters will check that
molecule quite happily, and it is **not** the molecule you meant:

- `Sanitization`, `InChI convertible` and `Aromatic ring flatness` all **pass** —
  the first two because an all-single-bond graph is a perfectly valid molecule, the
  third because with no aromatic rings perceived there is nothing to check.
- The only check that fails is `Non-aromatic ring non-flatness`, which reads the
  flat benzene rings as suspiciously planar *aliphatic* rings. 21 of 22 pass, and
  the one failure names something that sounds unrelated to the real problem.

Assign bond orders from a reference before checking. The ideal-geometry SDF for any
PDB chemical component is a usable template:

```python
from rdkit import Chem
from rdkit.Chem import AllChem

template = Chem.RemoveHs(Chem.MolFromMolFile("STI_ideal.sdf"))
pose = Chem.MolFromPDBFile("ligand_raw.pdb", removeHs=False)
pose = AllChem.AssignBondOrdersFromTemplate(template, pose)   # coordinates kept
```

An SDF or MOL2 from a docking program already carries bond orders. This applies to
ligands you have cut out of a PDB or mmCIF entry, which is the common way of
getting a reference pose.

### `kabsch_rmsd` is not the docking metric

The full report carries both `rmsd` and `kabsch_rmsd`, and only the first is what
anyone means by pose accuracy.

- **`rmsd`** — symmetry-corrected, computed in place. This is what `rmsd_≤_2å`
  tests and what a PB-valid rate is built from.
- **`kabsch_rmsd`** — superimposes the two molecules first, then measures. It
  reports the best-case agreement of *shape*, having discarded where the pose sits.

Translate a ligand 10 Å out of its pocket and `rmsd` reads 10.0 while
`kabsch_rmsd` reads 0.0. Read the wrong column and a pose nowhere near the site
looks perfect.

## What it does not check

- **Not affinity, not a score.** No ranking, no kcal/mol. Pair it with whatever
  your pose generator reports.
- **Not the right binding mode.** Without `-l`, nothing compares the pose to a
  reference; a plausible pose in the wrong pocket passes.
- **The protein is taken as given.** Clashes are measured against the coordinates
  you supply. Protein-side geometry is not validated, and a ligand checked against
  an apo structure whose side chains never moved will show clashes that a flexible
  receptor would not.
- **Cofactors and waters come from the same file as the protein.** Strip them, or
  keep them deliberately — the four distance and four overlap checks are reported
  separately per category precisely so that choice is visible.
- **Protonation is yours.** The checks are run on the molecule as given, hydrogens
  and all; `pH` is not a parameter.

## Try it

A cold check that this skill still holds, from two public files and nothing else.
No account, no key, no GPU. Needs network access once, to fetch them.

**Data** — PDB entry **1IEP**, the ABL1 kinase domain with imatinib (ligand code
`STI`) bound, and the idealised-geometry SDF for that chemical component. Both from
RCSB, which releases its coordinate and chemical-component files into the public
domain. Last confirmed reachable 2026-10-01.

    https://files.rcsb.org/download/1IEP.pdb
    https://files.rcsb.org/ligands/download/STI_ideal.sdf

The example routes through both traps above: the reference pose is cut out of a PDB
entry, so it needs `AssignBondOrdersFromTemplate`, and the displaced poses separate
`rmsd` from `kabsch_rmsd`.

**Run**

```bash
pip install "posebusters==0.6.5"
curl -sSO https://files.rcsb.org/download/1IEP.pdb
curl -sSO https://files.rcsb.org/ligands/download/STI_ideal.sdf
```

```python
from rdkit import Chem
from rdkit.Chem import AllChem
from posebusters import PoseBusters

# Chain A's copy of the ligand, straight out of the entry: coordinates but no bond orders.
sti = [l for l in open("1IEP.pdb")
       if l.startswith("HETATM") and l[17:20].strip() == "STI" and l[21] == "A"]
open("ligand_raw.pdb", "w").writelines(sti + ["END\n"])
raw = Chem.MolFromPDBFile("ligand_raw.pdb", removeHs=False)
print("raw from PDB :", raw.GetNumAtoms(), "atoms,", raw.GetNumBonds(), "bonds")

# The trap: aromatic rings read as aliphatic until bond orders are assigned.
template = Chem.RemoveHs(Chem.MolFromMolFile("STI_ideal.sdf"))
crystal = AllChem.AssignBondOrdersFromTemplate(template, raw)
print("aromatic atoms, raw -> templated:",
      sum(a.GetIsAromatic() for a in raw.GetAtoms()), "->",
      sum(a.GetIsAromatic() for a in crystal.GetAtoms()))
Chem.MolToMolFile(crystal, "crystal.sdf")
Chem.MolToMolFile(raw, "raw.sdf")

# Protein without the ligand or solvent.
prot = [l for l in open("1IEP.pdb") if l.startswith("ATOM  ") and l[21] == "A"]
open("protein.pdb", "w").writelines(prot + ["END\n"])

# Three "predictions": the deposited pose, and rigid translations of it by 1.5 and 10 A.
w = Chem.SDWriter("poses.sdf")
for dx in (0.0, 1.5, 10.0):
    m = Chem.Mol(crystal); c = m.GetConformer()
    for i in range(m.GetNumAtoms()):
        p = c.GetAtomPosition(i)
        c.SetAtomPosition(i, (p.x + dx, p.y, p.z))
    m.SetProp("_Name", f"shift_{dx}")
    w.write(m)
w.close()

# INVARIANT: the deposited pose passes every check in dock mode.
dock = PoseBusters(config="dock").bust(["crystal.sdf"], None, "protein.pdb")
print("deposited pose, dock mode:", int(dock.sum(axis=1).iloc[0]), "/", dock.shape[1],
      "| all pass:", bool(dock.all(axis=1).iloc[0]))

# INVARIANT: without bond orders, only the non-aromatic-ring check objects.
bad = PoseBusters(config="dock").bust(["raw.sdf"], None, "protein.pdb")
print("no bond orders, failing checks:", list(bad.columns[~bad.iloc[0].astype(bool)]))

# INVARIANT: mode comes from the arguments. Same file, fewer checks, still "all pass".
mol = PoseBusters(config="mol").bust(["crystal.sdf"], None, None)
print("mol mode:", mol.shape[1], "checks | dock mode:", dock.shape[1], "checks")

# INVARIANT: rmsd is measured in place; kabsch_rmsd superimposes first and loses the shift.
re = PoseBusters(config="redock").bust(["poses.sdf"], "crystal.sdf", "protein.pdb",
                                       full_report=True)
print(re[["rmsd", "kabsch_rmsd", "rmsd_≤_2å",
          "minimum_distance_to_protein", "volume_overlap_with_protein"]].to_string())

# INVARIANT: the verdict comes from a plain report, where every column is a check.
# Taking it from `re` above would call all three invalid — see the full-report note.
plain = PoseBusters(config="redock").bust(["poses.sdf"], "crystal.sdf", "protein.pdb")
print("checks:", plain.shape[1], "| valid poses:",
      int(plain.all(axis=1).sum()), "of", len(plain))
```

**Expect**

Invariants — a mismatch here means this skill is wrong:

- `raw from PDB` reports **37 atoms, 41 bonds**; aromatic atoms go from **0 → 24**
  once the template is applied.
- The deposited pose passes **22 / 22** in `dock` mode. A deposited crystal ligand
  satisfying every physical check is the floor this tool is calibrated against.
- Without bond orders, the only failing check is
  **`non-aromatic_ring_non-flatness`** — 21 of 22 still pass.
- `mol` mode reports **12** checks against `dock` mode's **22**.
- `rmsd` for the three poses is **0.0, 1.5, 10.0** — exactly the translations
  applied, because it is computed in place. `kabsch_rmsd` is **0.0 for all three**.
- `rmsd_≤_2å` is `True, True, False`.
- `minimum_distance_to_protein` is `True, False, False`: the 1.5 Å shift already
  clashes. `volume_overlap_with_protein` is `True, True, False` — it tolerates the
  1.5 Å shift, so the two protein-aware checks are not redundant.
- A plain `redock` report has **28** checks and gives `valid poses: 1 of 3`.

Observed on 2026-10-01 with posebusters 0.6.5, RDKit 2026.3.6, pandas 3.0.6,
Python 3.11.15 — a change in these is drift to investigate, not a failure:

- `full_report=True` widens `redock` from 28 columns to **133**, of which 46 are
  booleans; `dock` widens from 22 to **112**.
- The RDKit template match emits `WARNING: More than one matching pattern found -
  picking one`. Imatinib has symmetry-equivalent substructures; the chosen match
  does not affect the assigned bond orders.
- `STI_ideal.sdf` loads with `Warning: molecule is tagged as 2D, but at least one Z
  coordinate is not zero` — RCSB's ideal SDFs declare 2D in the header and carry 3D
  coordinates. Harmless; the geometry is used, not the flag.

## Sources

- Repository and `LICENSE` (MIT): https://github.com/maabuu/posebusters
- Package: https://pypi.org/project/posebusters/
- Documentation: https://posebusters.readthedocs.io/
- Buttenschoen M, Morris GM, Deane CM. *PoseBusters: AI-based docking methods fail
  to generate physically valid poses or generalise to novel sequences.*
  Chem Sci (2024). doi:10.1039/D3SC04185A
