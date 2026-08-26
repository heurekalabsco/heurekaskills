---
name: autodock-vina
description: Molecular docking with AutoDock Vina — receptor and ligand preparation, grid box definition, pose prediction and scoring. Use to predict how a small molecule binds a protein, to redock a known complex for validation, or to screen a compound set.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.2.0
try-it: pending
tags: [molecular-docking, autodock, vina, structure-based, virtual-screening]
allowed-tools: Read, Write, Edit, Bash
verified: pending
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

**Everything below was verified by running Vina 1.2.7 and Meeko 0.7.1.** The
numbers in *Sharp edges* come from actual runs on 1IEP, and the failure modes
are reproducible. Read that section before docking anything you care about —
**the most dangerous one produces confident, badly wrong numbers with no error
message at all.**

## Install

Vina ships prebuilt binaries. Use them.

```bash
# Pick the asset for your platform from the release page.
# mac_aarch64, mac_x86_64, linux_x86_64, linux_aarch64, win.exe
curl -L -o vina https://github.com/ccsb-scripps/AutoDock-Vina/releases/download/v1.2.7/vina_1.2.7_mac_aarch64
chmod +x vina && ./vina --version     # AutoDock Vina v1.2.7
```

**Do not start with `pip install vina`.** The PyPI package builds from source
and needs Boost headers; on a machine without them it fails at the wheel-build
step and takes the rest of the transaction down with it. The Python bindings
are useful for scripted scoring loops, but the binary is what you want for
ordinary docking.

Preparation needs Meeko, which converts molecules to the PDBQT format both
engines read:

```bash
pip install meeko rdkit numpy scipy gemmi
```

**Meeko declares no dependencies of its own.** `pip install meeko` alone
installs a package that raises `ModuleNotFoundError` on import — verified with
0.7.1, whose `Requires-Dist` is empty. Install the four above explicitly. You
will also want `pdb2pqr` for receptor protonation (see below).

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
