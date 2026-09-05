---
name: autodock-vina
description: Molecular docking with AutoDock Vina — receptor and ligand preparation, grid box definition, pose prediction and scoring. Use to predict how a small molecule binds a protein, to redock a known complex for validation, or to screen a compound set.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.3.0
tags: [molecular-docking, autodock, vina, structure-based, virtual-screening]
datasets: [https://raw.githubusercontent.com/ccsb-scripps/AutoDock-Vina/v1.2.7/example/basic_docking/solution/1iep_receptor.pdbqt, https://raw.githubusercontent.com/ccsb-scripps/AutoDock-Vina/v1.2.7/example/basic_docking/data/1iep_ligand.sdf]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-31
  against: AutoDock Vina 1.2.7 (release binary and PyPI wheel) / Meeko 0.8.0 / RDKit 2026.3.5 / pdb2pqr 3.7.1 / NumPy 2.4.6 / SciPy 1.17.1 / gemmi 0.7.5 / Python 3.11.15 on Linux x86_64
  executed: 25
  unverified: 0
---

# AutoDock Vina — molecular docking

AutoDock Vina predicts how a small molecule binds a protein. It searches
ligand position, orientation and torsions inside a user-defined box and ranks
the results with an empirical scoring function, reported in kcal/mol.

Use it to generate a binding hypothesis, to rank a set of compounds against one
target, or to reproduce a known complex as a control. It is a **pose-prediction
and ranking tool**, not a binding-affinity predictor and not a substitute for
free-energy methods — see *What the score is not*.

The AutoDock family has several engines. This skill covers **Vina 1.2.x**, the
current general-purpose one, and routes to the others where they are the better
answer:

| engine | use it when | licence |
|---|---|---|
| **AutoDock Vina 1.2.x** | default for almost everything | Apache-2.0 |
| **AutoDock-GPU** | large campaigns, or you specifically need the AD4 scoring function | GPL-2.0 |
| **AutoDock4** | legacy protocols and reproducing older published work | GPL-2.0 |

Vina 1.2.x can itself run the AD4 and Vinardo scoring functions, so needing a
different *score* is not by itself a reason to leave Vina.

**Everything below was verified by running Vina 1.2.7** — originally with Meeko
0.7.1, and re-run against Meeko 0.8.0. The numbers in *Sharp edges* come from
actual runs on 1IEP, and the failure modes are reproducible. Read that section
before docking anything you care about — **the most dangerous one produces
confident, badly wrong numbers with no error message at all.**

## Install

Vina ships prebuilt binaries. Use them.

```bash
# Pick the asset for your platform from the release page.
# mac_aarch64, mac_x86_64, linux_x86_64, linux_aarch64, win.exe
curl -L -o vina https://github.com/ccsb-scripps/AutoDock-Vina/releases/download/v1.2.7/vina_1.2.7_mac_aarch64
chmod +x vina && ./vina --version     # AutoDock Vina v1.2.7
```

**`pip install vina` is not a substitute for that binary, and what it does
depends on your platform.** For 1.2.7 PyPI carries manylinux and musllinux
wheels for CPython 3.8–3.12 on **x86_64 Linux only**. There, pip installs a
prebuilt wheel, needs no Boost, and takes about a second. Anywhere else — macOS
on either architecture, Linux aarch64 — there is no wheel, pip falls back to the
sdist, and the build needs Boost headers; without them it fails at the
wheel-build step and takes the rest of the transaction down with it.

Either way the package ships **only the Python bindings**. There is no `vina`
executable inside it. Install it when you want the API for scripted scoring
loops; fetch the binary above for ordinary docking.

Preparation needs Meeko, which converts molecules to the PDBQT format both
engines read:

```bash
pip install meeko rdkit numpy scipy gemmi
```

**Meeko declares no dependencies of its own.** `pip install meeko` alone
installs a package that raises `ModuleNotFoundError: No module named 'rdkit'` on
import — still true at 0.8.0, whose `Requires-Dist` is empty. Install the four
above explicitly. You will also want `pdb2pqr` for receptor protonation (see
below).

## The workflow

Docking is four steps, and three of them are preparation. Preparation is where
results are won or lost.

```
receptor PDB ──protonate──> PDB+H ──mk_prepare_receptor──> rec.pdbqt ─┐
                                                                      ├─> vina ──> poses
ligand SMILES/SDF ──3D + protomer──> mk_prepare_ligand ──> lig.pdbqt ─┘
                                          box (center + size) ────────┘
```

### 1. Receptor

Split out the chain you want, drop waters and the crystallisation ligand,
then **protonate before anything else**:

```bash
pdb2pqr --ff=AMBER --with-ph=7.4 --titration-state-method=propka \
        --pdb-output=rec_H.pdb rec_A.pdb rec_A.pqr
```

Protonation is not optional and not cosmetic. Crystal structures rarely carry
hydrogens, docking scores depend on hydrogen-bond geometry, and the protonation
state of a histidine in the site can change the answer. `--with-ph` plus
PROPKA assigns states from predicted pKa rather than assuming.

Then build the PDBQT and the box in one call:

```bash
mk_prepare_receptor.py --read_pdb rec_H.pdb -o rec -p -v \
  --box_enveloping lig_crystal.sdf --padding 5 --allow_bad_res
```

`--box_enveloping` sizes the box around a reference molecule and `--padding`
grows it — the most defensible way to place a box when you have a known ligand.
It writes `rec.pdbqt`, `rec.box.txt` (a Vina config), and `rec.box.pdb` for
visual inspection. **Look at `rec.box.pdb` in a viewer before you dock.**

### 2. Ligand

Get bond orders from a chemical definition, never from PDB coordinates — a PDB
`HETATM` block has no bond orders, and perceiving them from geometry is where
silent chemistry errors enter:

```python
from rdkit import Chem
from rdkit.Chem import AllChem

raw  = Chem.MolFromPDBFile('lig_raw.pdb', removeHs=False)   # coordinates
tmpl = Chem.MolFromSmiles(smiles_from_the_ligand_definition)  # bond orders
lig  = AllChem.AssignBondOrdersFromTemplate(tmpl, raw)
lig  = Chem.AddHs(lig, addCoords=True)
Chem.SDWriter('lig.sdf').write(lig)
```

Starting from SMILES instead, embed a 3D conformer first:

```python
m = Chem.AddHs(Chem.MolFromSmiles(smiles))
AllChem.EmbedMolecule(m, randomSeed=42)
AllChem.MMFFOptimizeMolecule(m)
```

Then:

```bash
mk_prepare_ligand.py -i lig.sdf -o lig.pdbqt
```

Vina samples torsions but **not** protonation, tautomers or stereochemistry.
Whatever you hand it is what it docks. Decide the protomer at your target pH
deliberately, and dock each stereoisomer separately if the stereocentre is
undefined.

### 3. Dock

```bash
./vina --receptor rec.pdbqt --ligand lig.pdbqt --config rec.box.txt \
       --exhaustiveness 32 --seed 42 --num_modes 9 --out docked.pdbqt
```

**Always pass `--seed`.** Without it Vina draws a random seed per run and
results are not reproducible — verified: two unseeded runs drew different seeds
and produced different output; two runs with `--seed 42` produced
byte-identical files.

`--exhaustiveness` (default 8) buys search thoroughness roughly linearly in
time. 32 is a reasonable default for a real answer; a 37-heavy-atom ligand at
exhaustiveness 32 took 22 s on 11 cores.

### 4. Read the results

```bash
mk_export.py docked.pdbqt -s docked.sdf     # back to SDF with bond orders
```

Export through Meeko rather than reading the PDBQT directly. PDBQT does not
carry bond orders; Meeko restores them from what it recorded at preparation
time. The per-pose affinity is in the SDF `meeko` property as `free_energy`,
and in the PDBQT as `REMARK VINA RESULT`.

The stdout table's `rmsd l.b.`/`rmsd u.b.` columns are distances **from the
best mode**, not from any experimental structure. They say how different the
poses are from each other, nothing about correctness.

## Sharp edges

Verified against Vina 1.2.7. Each fails quietly.

### An undersized box returns large positive numbers, not an error

This is the one that will burn you. Docking 1IEP's ligand in a correct box gives
**−13.06 kcal/mol**. The identical run in a 10 Å cube gives:

| box | best affinity |
|---|---|
| enveloping the ligand + 5 Å padding | **−13.06** |
| 10 Å cube, same centre | **+38.67** |

No error, no warning, exit status 0. The remaining modes ran to +86, +872,
+3464, +14430. **A positive score for the *best* pose means your box or your
input is wrong** — it is not a statement that binding is unfavourable. Any
pipeline that parses the top score must assert it is negative and physically
plausible (roughly −4 to −15 kcal/mol for drug-like ligands).

Lower-ranked modes can be positive even from a good run — a correct box on the
same system returned a ninth mode at +45.78 while its best pose was −12.92. It
is the top pose that carries the signal.

The box must hold the ligand *and* room to move. Size it to the site, not to the
ligand's own dimensions.

### The stdout table lists more poses than the output file contains

`--num_modes 9` requested nine, the table printed nine, the file held seven.
`--energy_range` (default 3 kcal/mol) filters what is *written* but not what is
*printed*. With the best pose at −13.055, the cutoff was −10.055, and the two
modes at −9.84 and −9.83 were printed and then dropped. Re-running with
`--energy_range 5` wrote all nine.

Parse the output file, not the stdout table, or the two will disagree and the
mismatch will look like a bug in your code.

### Receptor prep fails on an unprotonated PDB, cryptically

`mk_prepare_receptor.py` on a raw crystal PDB dies with:

```
RuntimeError: Updated 1 H positions but deleted 9
```

The message names neither the residue nor the real problem, and
`--allow_bad_res` does not fix it — the input had no chain breaks, no altlocs
and no hydrogens. Protonating first with `pdb2pqr` fixed it and is better
practice regardless. If you hit this after protonating, `--allow_bad_res` and
`--default_altloc A` are the next two things to try.

### The scoring function's best pose is not the crystal pose

Scoring 1IEP's crystal pose in place with `--score_only` gives **−11.91**, while
docking the same ligand finds a pose at **−13.06** — a pose the function likes
*better* than the experimental answer. That gap is the scoring function's error,
and it is why a better score does not mean a better pose. Never conclude one
ligand binds more tightly than another from a fraction of a kcal/mol.

### PDBQT silently loses chemistry

PDBQT stores atom types and partial charges, not bond orders or stereochemistry.
Round-tripping a molecule through it without Meeko's records will quietly change
what you think you docked. Keep the input SDF, and export with `mk_export.py`.

## Validate by redocking

Before trusting a campaign, reproduce a known answer. Take a complex with a
crystallised ligand, prepare both from that structure, dock, and measure RMSD of
the top pose against the crystal coordinates:

```python
from rdkit import Chem
from rdkit.Chem import rdMolAlign

ref  = Chem.RemoveHs(Chem.SDMolSupplier('lig_crystal.sdf', removeHs=False)[0])
pose = Chem.RemoveHs([m for m in Chem.SDMolSupplier('docked.sdf', removeHs=False) if m][0])
print(rdMolAlign.GetBestRMS(pose, ref))     # symmetry-corrected
```

Use `GetBestRMS`, which handles topological symmetry — a phenyl ring flipped
180° is the same pose, and a naive atom-order RMSD will call it a 2 Å error.

**< 2.0 Å is the conventional success criterion.** On 1IEP (imatinib/ABL kinase)
this protocol gave **0.18 Å** at exhaustiveness 32.

A redock that fails tells you the preparation is wrong, not that the target is
hard. Fix it before docking anything unknown. Note that redocking is the
*easiest* possible test — the receptor is already in the conformation that binds
this ligand. Cross-docking a different ligand into the same structure is a much
harder and more honest check.

## What the score is not

Vina reports kcal/mol, which invites over-reading. The score is an empirical
function fitted to reproduce known binding data. It is **not** a computed free
energy.

- **Not comparable across targets.** Scores from different receptors are on
  different effective scales.
- **Biased by ligand size.** Bigger ligands make more contacts and score better
  almost regardless of fit. Compare within a narrow size range, or use ligand
  efficiency (score ÷ heavy atoms).
- **Not a ranking you should trust to a decimal.** Treat differences under
  ~1 kcal/mol as noise.
- **Blind to entropy, explicit waters and receptor flexibility** unless you have
  modelled them deliberately.

The defensible claim is "this pose is a plausible binding hypothesis
consistent with the site," not "this compound binds at X nM."

## Reporting

State plainly:

- Vina version, scoring function, and `--seed`
- the receptor source (PDB ID, chain), what was removed (waters, ions,
  cofactors), and how it was protonated and at what pH
- ligand source, protomer and tautomer chosen, stereochemistry
- box centre and size, and how they were chosen
- `--exhaustiveness`, `--num_modes`, `--energy_range`
- redocking RMSD for the control, and the criterion used
- for any ranking, that scores are empirical and the size bias

Report the score with the pose. A number without a picture of where the ligand
sat is not a result.

## Limits

- **Rigid receptor by default.** Side chains do not move unless you declare them
  flexible, and the backbone never does. A ligand needing an induced fit will
  dock badly.
- **No solvent.** Explicit bridging waters are absent unless you keep them
  deliberately.
- **Metals, covalent binders and macrocycles** need specific handling and are
  not covered by the default protocol.
- **Sampling is stochastic.** Seed it; on a hard target run several seeds and
  check the top pose is stable.
- **Scores are not affinities.** See above.

## Try it

A self-contained check that this skill still holds: redock a known complex, then assert
that the two failure modes in *Sharp edges* still fail the way they are documented. Public
data, no account, no key. About two and a half minutes on four cores.

**Data** — the AutoDock-Vina project's own `basic_docking` example, pinned at tag `v1.2.7`:

    .../v1.2.7/example/basic_docking/solution/1iep_receptor.pdbqt
    .../v1.2.7/example/basic_docking/data/1iep_ligand.sdf

1IEP is imatinib bound to ABL kinase. Taking the **prepared** receptor from upstream is
deliberate: it holds preparation fixed, so a failure here points at Vina or at this skill
rather than at a preparation step that drifted. The box is the one upstream ships for that
receptor in `solution/1iep_receptor.box.txt`. The repository is Apache-2.0 and needs no
account. Last confirmed reachable 2026-08-31.

Needs `pip install vina meeko rdkit numpy scipy gemmi`. Note the platform caveat in
*Install* — the `vina` wheel is x86_64 Linux only, and elsewhere pip builds it from source.

```python
import urllib.request
from pathlib import Path

from meeko import MoleculePreparation, PDBQTMolecule, PDBQTWriterLegacy, RDKitMolCreate
from rdkit import Chem
from rdkit.Chem import rdMolAlign
from vina import Vina

BASE = ("https://raw.githubusercontent.com/ccsb-scripps/AutoDock-Vina/v1.2.7/"
        "example/basic_docking/")
for url, name in [(BASE + "solution/1iep_receptor.pdbqt", "rec.pdbqt"),
                  (BASE + "data/1iep_ligand.sdf", "lig_crystal.sdf")]:
    if not Path(name).exists():
        urllib.request.urlretrieve(url, name)

# Bond orders come from the SDF. Never perceive them from PDBQT geometry.
crystal = Chem.SDMolSupplier("lig_crystal.sdf", removeHs=False)[0]
setup = MoleculePreparation().prepare(Chem.AddHs(crystal, addCoords=True))[0]
pdbqt, ok, msg = PDBQTWriterLegacy.write_string(setup)
assert ok, msg
Path("lig.pdbqt").write_text(pdbqt)

CENTRE = [15.190, 53.903, 16.917]         # upstream solution/1iep_receptor.box.txt
v = Vina(sf_name="vina", seed=42, verbosity=0)
v.set_receptor("rec.pdbqt")
v.set_ligand_from_file("lig.pdbqt")

v.compute_vina_maps(center=CENTRE, box_size=[20, 20, 20])
v.dock(exhaustiveness=32, n_poses=9)
v.write_poses("docked.pdbqt", n_poses=9, energy_range=5, overwrite=True)

top   = v.energies(n_poses=9)[0][0]
poses = RDKitMolCreate.from_pdbqt_mol(
    PDBQTMolecule.from_file("docked.pdbqt", skip_typing=True))[0]
rmsd  = rdMolAlign.GetBestRMS(Chem.RemoveHs(poses), Chem.RemoveHs(crystal), prbId=0)

print("top affinity   : %.2f kcal/mol" % top)
print("poses written  :", poses.GetNumConformers())
print("redock RMSD    : %.2f A" % rmsd)
assert -15 <= top <= -4, "top pose outside the physically plausible range"
assert rmsd < 2.0, "redock failed the conventional 2 A success criterion"

# --- energy_range filters what you read back, not only what is written ---
kept = len(v.energies())                  # no n_poses: the default energy_range=3 applies
print("energies() rows: %d of the 9 requested (default energy_range=3)" % kept)
assert kept < 9, "energy_range no longer filters the returned poses"

# --- an undersized box returns large positive numbers, not an error ---
v.compute_vina_maps(center=CENTRE, box_size=[10, 10, 10])
v.dock(exhaustiveness=8, n_poses=9)
bad = v.energies(n_poses=9)[0][0]
print("10 A cube top  : %+.2f kcal/mol, no error raised" % bad)
assert bad > 0, "the undersized-box failure no longer reproduces"

print("OK")
```

**Expect**

Invariants — these hold across versions, and a failure means the skill is wrong:

- The top affinity is **negative** and physically plausible, roughly −4 to −15 kcal/mol for
  a drug-like ligand. A positive best pose means the box or the input is wrong; it is never
  a statement that binding is unfavourable.
- Redocking clears the conventional **< 2.0 Å** criterion. This is the easiest test there
  is — the receptor is already in the conformation that binds this ligand — so failing it
  means preparation is broken, not that the target is hard.
- RMSD must be symmetry-corrected (`GetBestRMS`). A naive atom-order RMSD scores a phenyl
  ring flipped 180° as a ~2 Å error when the pose is identical.
- `energies()` returns **fewer** rows than `n_poses` asked for whenever poses fall outside
  `energy_range`. The filter applies to what you read back, not only to the written file —
  which is why the count you print and the count in the table can disagree.
- The 10 Å cube still returns large positive affinities and **raises nothing**. If that
  assertion ever fails, Vina has started reporting the condition and *Sharp edges* needs
  rewriting.

Observed 2026-08-31 against Vina 1.2.7 / Meeko 0.8.0 / RDKit 2026.3.5 — treat a mismatch
here as drift to investigate, not as a failure:

```
top affinity   : -13.25 kcal/mol
poses written  : 9
redock RMSD    : 0.27 A
energies() rows: 6 of the 9 requested (default energy_range=3)
10 A cube top  : +38.60 kcal/mol, no error raised
OK
```

The exact affinity moves with preparation, so it is an observed value rather than an
invariant. Protonating the receptor here with `pdb2pqr` and preparing it locally, instead
of using upstream's prepared file, gave −13.27 and 0.15 Å on the same complex — a few
tenths of a kcal/mol is prep drift, not a broken skill.

## Reference files

- `references/preparation.md` — receptor and ligand preparation in depth.
  Waters, cofactors, metals and ions; protonation choices; flexible side
  chains; what PDBQT does and does not encode; batch preparation.
- `references/parameters-and-screening.md` — every runtime parameter and what
  changes when you move it; the Vina, Vinardo and AD4 scoring functions; the
  Python API for scripted scoring; and running a compound set with per-ligand
  provenance.

## Sources

- Eberhardt J., Santos-Martins D., Tillack A.F., Forli S. AutoDock Vina 1.2.0 —
  new docking methods, expanded force field, and Python bindings.
  *J Chem Inf Model* 61(8), 3891–3898 (2021).
  https://doi.org/10.1021/acs.jcim.1c00203
- Trott O., Olson A.J. AutoDock Vina — improving the speed and accuracy of
  docking. *J Comput Chem* 31, 455 (2010). https://doi.org/10.1002/jcc.21334
- Vina source and releases: https://github.com/ccsb-scripps/AutoDock-Vina
  (Apache-2.0) · documentation: https://autodock-vina.readthedocs.io/
- Meeko: https://github.com/forlilab/Meeko (LGPL-2.1)
- AutoDock-GPU: https://github.com/ccsb-scripps/AutoDock-GPU (GPL-2.0)
- Project home: https://autodock.scripps.edu/
- Test system 1IEP — imatinib bound to ABL kinase. https://www.rcsb.org/structure/1IEP
