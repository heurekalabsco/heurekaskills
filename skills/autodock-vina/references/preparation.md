# Receptor and ligand preparation

Preparation determines the result far more than any docking parameter. A
perfectly tuned search on a badly prepared receptor gives a confident wrong
answer. Verified with Meeko 0.7.1 and RDKit.

## What PDBQT is, and what it loses

Both engines read PDBQT — PDB plus partial charges (`Q`) and AutoDock atom
types (`T`). It encodes coordinates, atom types, charges, and which torsions are
rotatable.

It does **not** encode bond orders, aromaticity, formal charges or
stereochemistry. Consequences:

- Reading a PDBQT back into a cheminformatics toolkit means guessing the
  chemistry from geometry. Sometimes it guesses wrong, and it never says so.
- Meeko works around this by recording the input chemistry and restoring it on
  export, which is why `mk_export.py` exists and why you should use it.
- **Keep the input SDF.** It is the only unambiguous record of what you docked.

## Receptor

### What to remove, and what to keep

| component | default | reasoning |
|---|---|---|
| crystallisation ligand | remove | it occupies the site you are docking into |
| waters | remove | but see below — some are structural |
| ions and cofactors in the site | **keep** | removing a catalytic Mg²⁺ or heme changes the site |
| ions far from the site | remove | noise |
| other chains | keep only if the site is at an interface | check before splitting a multimer |
| alternate conformations | pick one | `--default_altloc A` or `--wanted_altloc` |

**Waters deserve a decision, not a default.** A water bridging ligand and
protein in every structure of the target is part of the site. Deleting it and
docking into the cavity it filled produces poses that reach into space the water
occupies. If you keep one, keep it as part of the receptor and say so in the
write-up. Blanket-deleting all waters is the common choice; it is defensible
only when you have looked.

### Protonation

Do this before Meeko, always:

```bash
pdb2pqr --ff=AMBER --with-ph=7.4 --titration-state-method=propka \
        --pdb-output=rec_H.pdb rec.pdb rec.pqr
```

On a 274-residue kinase chain this placed 2182 hydrogens. `--with-ph` plus
PROPKA assigns histidine, aspartate, glutamate and cysteine states from
predicted pKa instead of assuming neutral. Histidine tautomers in a binding site
routinely flip a hydrogen bond from donor to acceptor, which flips the pose.

Skipping protonation also breaks Meeko outright:

```
RuntimeError: Updated 1 H positions but deleted 9
```

That error names neither the residue nor the cause. It appeared on a structure
with no chain breaks, no altlocs and no hydrogens, and `--allow_bad_res` did not
resolve it. Protonating first did.

### Building the PDBQT

```bash
mk_prepare_receptor.py --read_pdb rec_H.pdb -o rec -p -v \
  --box_enveloping lig_ref.sdf --padding 5 --allow_bad_res
```

| flag | effect |
|---|---|
| `-p` / `--write_pdbqt` | write the receptor PDBQT |
| `-v` / `--write_vina_box` | write a Vina config with the box |
| `--box_enveloping FILE` | size the box around a reference molecule |
| `--padding N` | grow that box by N Å on each side |
| `--box_center X Y Z`, `--box_size X Y Z` | set the box explicitly instead |
| `--allow_bad_res` | delete residues with missing atoms rather than failing |
| `--default_altloc A` | pick an altloc when the structure has several |
| `-f` / `--flexres` | declare flexible side chains |
| `-d` / `--delete_residues` | drop specific residues, `<chain>:<resnum>` |
| `-b` / `--blunt_ends` | treat a residue as a chain terminus |
| `--charge_model` | `gasteiger` (default), `espaloma`, `zero`, `read` |

It also writes `<basename>.box.pdb`. **Open it in a viewer with the receptor
before docking.** Most box mistakes are obvious in three seconds of looking and
invisible in the numbers.

### Choosing the box without a reference ligand

`--box_enveloping` needs something to envelop. Without a known ligand:

- **A known site with no bound ligand** — centre on the centroid of the residues
  lining it, and size it to cover the pocket plus ~8 Å of headroom.
- **No known site** — you need pocket detection first (AutoSite, fpocket, or a
  conservation/structure analysis). Blind docking across a whole protein with
  one huge box is the worst option: the search space explodes, exhaustiveness
  that was adequate becomes inadequate, and the top pose becomes close to
  arbitrary. If you must, use several focused boxes rather than one large one.

Size the box to the **site**, not to the ligand. A box that merely contains the
ligand leaves it no room to translate or rotate, and the result is the failure
documented in *Sharp edges* — large positive affinities and no error.

### Flexible side chains

Vina can move nominated side chains. Declare them at preparation:

```bash
mk_prepare_receptor.py --read_pdb rec_H.pdb -o rec -p -v \
  --box_enveloping lig_ref.sdf --padding 5 -f A:315
```

**The residue spec is `<chain>:<resnum>` — no residue name.** Passing
`A:THR315` fails with `ValueError: residue_id='A:THR315' not in valid monomers`,
which reads like the residue is absent when it is only misspelt.

Note the output filenames change once `-f` is used: instead of one `rec.pdbqt`
you get `rec_rigid.pdbqt` and `rec_flex.pdbqt`. Pass both:

```bash
./vina --receptor rec_rigid.pdbqt --flex rec_flex.pdbqt \
       --ligand lig.pdbqt --config rec.box.txt \
       --exhaustiveness 16 --seed 42 --out flexdock.pdbqt
```

Each flexible residue adds torsions and enlarges the search. Two or three
well-chosen side chains is usually the limit before you should be running
something other than docking. Flexibility is not a fix for docking into the
wrong conformational state — if the site needs a backbone shift, dock into a
structure that already has it, or use an ensemble.

## Ligand

### Get the chemistry right first

Vina samples **torsions only**. It does not change protonation, tautomers,
stereochemistry or ring conformation (except macrocycles, which it can sample).
Every one of those is your decision, made before preparation, and each is a way
to dock the wrong molecule with complete confidence.

From a crystal structure, take coordinates from the PDB and bond orders from the
chemical definition — never perceive bond orders from coordinates:

```python
from rdkit import Chem
from rdkit.Chem import AllChem

raw  = Chem.MolFromPDBFile('lig_raw.pdb', removeHs=False)
tmpl = Chem.MolFromSmiles(reference_smiles)
lig  = AllChem.AssignBondOrdersFromTemplate(tmpl, raw)
lig  = Chem.AddHs(lig, addCoords=True)
Chem.SDWriter('lig.sdf').write(lig)
```

Confirm the result — a formula check catches a surprising number of mistakes:

```python
from rdkit.Chem.rdMolDescriptors import CalcMolFormula
print(CalcMolFormula(lig))     # compare against the ligand definition
```

From SMILES, embed and minimise before preparation:

```python
m = Chem.AddHs(Chem.MolFromSmiles(smiles))
AllChem.EmbedMolecule(m, randomSeed=42)
AllChem.MMFFOptimizeMolecule(m)
```

The starting conformer matters less than for rigid-body methods, since Vina
samples torsions — but ring conformations and stereocentres are fixed at this
point, so get them right.

### Protomers and tautomers

Decide the charge state at your working pH. An amine that is neutral in the SDF
and protonated in reality will dock into an anionic pocket with the wrong
electrostatics. If a compound has a plausible ambiguity, prepare both and dock
both, then report that you did.

### Running the preparation

```bash
mk_prepare_ligand.py -i lig.sdf -o lig.pdbqt
```

| flag | effect |
|---|---|
| `-i` / `--mol` | input SDF/MOL2 |
| `-o` / `--out` | output PDBQT, single molecule |
| `--multimol_outdir DIR` | one PDBQT per molecule from a multi-molecule input |
| `--multimol_prefix P` | name outputs by prefix and index rather than by molecule name |
| `-z` / `--multimol_targz` | compress the outputs |
| `--rigid_macrocycles` | keep macrocycles in their input conformation |
| `--charge_model` | override the default charge assignment |

For a compound set, prepare in bulk:

```bash
mk_prepare_ligand.py -i library.sdf --multimol_outdir ligands/
```

Watch for name collisions — molecules sharing a title overwrite each other.
`--multimol_prefix` sidesteps it by numbering instead.

### Verify before docking

```bash
grep -c "^ATOM" lig.pdbqt          # heavy atoms + polar H
grep "^REMARK" lig.pdbqt | head    # torsion tree
```

A ligand with zero rotatable bonds when you expected several means the torsion
tree was not built as intended, and the dock will be rigid-body.

## Getting results back

```bash
mk_export.py docked.pdbqt -s docked.sdf
```

Per-pose data lands in the SDF `meeko` property as JSON, including
`free_energy`. Read it rather than parsing stdout:

```python
import json
from rdkit import Chem

for m in Chem.SDMolSupplier('docked.sdf', removeHs=False):
    if m is None:
        continue
    print(json.loads(m.GetProp('meeko'))['free_energy'])
```

The pose count in the file can be smaller than the count printed to stdout —
`--energy_range` filters the file only. Trust the file.
