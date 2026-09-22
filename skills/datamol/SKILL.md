---
name: datamol
description: Cheminformatics with datamol, a Pythonic layer over RDKit with sensible defaults — SMILES parsing and standardization, descriptors, fingerprints, clustering, 3D conformers, and parallel processing.
category: analysis
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.4.0
tags: [cheminformatics, rdkit, smiles, descriptors, fingerprints]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-09-19
  against: datamol 0.13.0 / RDKit 2026.03.6 / joblib 1.6.0 / pandas 3.0.6 / NumPy 2.4.6 / scikit-learn 1.9.1 / Python 3.11.15. Conformer and descriptor differences additionally measured against datamol 0.12.5 on the same RDKit build
  executed: 8
  unverified: 0
---
# Datamol Cheminformatics Skill

## Overview

Datamol is a Python library that provides a lightweight, Pythonic abstraction layer over RDKit for molecular cheminformatics. Simplify complex molecular operations with sensible defaults, efficient parallelization, and modern I/O capabilities. All molecular objects are native `rdkit.Chem.Mol` instances, ensuring full compatibility with the RDKit ecosystem.

**Version note:** Examples target **datamol 0.13.x**. **0.13.0 reached PyPI on 2026-09-09**,
ending the long 0.12.5 plateau (June 2024). It needs **Python 3.11+ and RDKit 2024.09+**. The
optional-dependency groups are gone: a plain install now pulls the cloud filesystem backends,
the spreadsheet and Parquet readers, the drawing stack and SELFIES, so there is no longer an
extras bracket to get right. Since 0.10.0,
modules are lazy-loaded by default (set `DATAMOL_DISABLE_LAZY_LOADING=1` to disable). Since
0.12.2, RDKit is a direct PyPI dependency. Fingerprints go through RDKit's
`rdFingerprintGenerator` API.

**Three calls that older tutorials still show continue to raise on 0.13.0** — each re-tested
on this release, not carried over:

| Call | What happens | Use instead |
| --- | --- | --- |
| `dm.to_fp(mol, n_bits=2048)` | `Boost.Python.ArgumentError` — the kwarg goes straight to RDKit's generator | `fpSize=2048` |
| `dm.descriptors.batch_compute_many_descriptors(mols, n_jobs=-1)` | `ValueError: batch_size must be 'auto' or a positive integer, got: None` | add `batch_size="auto"` |
| `dm.descriptors.compute_many_descriptors(mol)["logp"]` | `KeyError` | `"clogp"`, `"n_lipinski_hbd"`, `"n_lipinski_hba"` |

### Upgrading from 0.12.5: two changes that alter results without raising

Both were measured here on **the same RDKit build (2026.03.6)**, so what follows is datamol's
doing and not a dependency moving underneath it. Neither raises, which is what makes them
worth stating.

**1. Conformer pruning actually honours `rms_cutoff` now, so you keep far fewer conformers.**
`dm.conformers.cluster` prunes with symmetry-aware optimal alignment on 0.13.0. On 20 seeded
conformers of ibuprofen at `rms_cutoff=1.0`:

| | conformers kept | closest pair in the kept set | honours the 1.0 Å cutoff |
| --- | --- | --- | --- |
| 0.12.5 | 10 | 0.560 Å | no |
| 0.13.0 (default) | **2** | 1.122 Å | **yes** |
| 0.13.0, `already_aligned=True` | 10 | 0.134 Å | no |

A pipeline that pinned a conformer count, or that budgeted downstream work on one, changes by
5× on this input. `already_aligned=True` skips the alignment step and compares conformers where
they sit, which is cheaper and is only correct if you really did align them first — on 0.12.5
the flag changed nothing either way, so code that sets it was getting the wrong answer
regardless of what it asked for.

**2. Three descriptor keys were misspelled and are now spelled correctly.**
`compute_many_descriptors` returns `n_aliphatic_heterocycles`, `n_aromatic_heterocycles` and
`n_saturated_heterocycles`; through 0.12.5 each of those keys was missing its second `c`
(`…heterocyles`). The dict is still 22 keys, so nothing changed shape — but code that indexed
the old spelling now raises `KeyError`, and code that used `.get(...)` silently reads `None`.
The misspelled *callables* survive as deprecated aliases that emit a `DeprecationWarning`; the
misspelled *dict keys* are simply gone.

`## Try it` at the end of this file asserts the three traps above, the corrected key spelling,
and the conformer cutoff — so a future release that changes any of them fails loudly here. It
also pins the four return shapes and defaults that this page once documented wrongly:
`apply_reaction`, `to_image`, `fuzzy_scaffolding` and `viz.conformers`.

**Key capabilities**:
- Molecular format conversion (SMILES, SELFIES, InChI)
- Structure standardization and sanitization
- Molecular descriptors and fingerprints
- 3D conformer generation and analysis
- Clustering and diversity selection
- Scaffold and fragment analysis
- Chemical reaction application
- Visualization and alignment
- Batch processing with parallelization
- Cloud storage support via fsspec

## Installation and Setup

Guide users to install datamol:

```bash
uv pip install datamol
```

RDKit is installed automatically with datamol, and **0.13.0 needs Python 3.11 or newer**.

As of 0.13.0 the fsspec backends for remote file paths ship with the package — `s3fs` and
`gcsfs` both import straight after a plain install, so there is nothing extra to add for
`s3://` or `gs://` paths. Visualization, Excel/Parquet I/O and SELFIES arrive the same way.
On 0.12.5 and earlier these were separate installs:

```bash
uv pip install s3fs gcsfs   # only needed on datamol <= 0.12.5
```

**Import convention**:
```python
import datamol as dm
```

## Core Workflows

Ten workflow areas, each with worked code, are documented in
[references/core_workflows.md](references/core_workflows.md):

| # | Area | Covers |
| --- | --- | --- |
| 1 | Basic molecule handling | `to_mol`, batch conversion, error handling, canonical and isomeric SMILES, sanitization and full standardization |
| 2 | Reading and writing files | SDF, SMILES, CSV, Excel with rendered structures, the universal reader/writer, and cloud or HTTPS paths |
| 3 | Descriptors and properties | the standard descriptor set, parallel computation, aromaticity, stereochemistry, flexibility, and filtering |
| 4 | Fingerprints and similarity | ECFP4 and other types, pairwise and cross-set distances, nearest-neighbour lookup (Tanimoto distance = 1 − similarity) |
| 5 | Clustering and diversity | similarity clustering, diverse subset picking, and cluster centroids |
| 6 | Scaffold analysis | Bemis-Murcko scaffolds, grouping and counting, and scaffold-disjoint train/test splits |
| 7 | Fragmentation | fragmenting molecules, finding common fragments across a library, and fragment-based scoring |
| 8 | 3D conformers | generation, access, RMSD clustering, representative selection, and SASA |
| 9 | Visualization | grids, files, publication SVG, substructure alignment, atom and bond highlighting, conformer display |
| 10 | Chemical reactions | reaction SMARTS, applying to a molecule or a whole library |

Three end-to-end pipelines — load/filter/analyze, SAR by scaffold series, and virtual
screening — are in [references/workflow_patterns.md](references/workflow_patterns.md).

## Parallelization

Datamol includes built-in parallelization for many operations. Use `n_jobs` parameter:
- `n_jobs=1`: Sequential (no parallelization)
- `n_jobs=-1`: Use all available CPU cores
- `n_jobs=4`: Use 4 cores

**Functions supporting parallelization**:
- `dm.read_sdf(..., n_jobs=-1)`
- `dm.descriptors.batch_compute_many_descriptors(..., n_jobs=-1, batch_size="auto")` — **this one needs `batch_size`**
- `dm.cluster_mols(..., n_jobs=-1)`
- `dm.pdist(..., n_jobs=-1)`
- `dm.conformers.sasa(..., n_jobs=-1)`

`batch_compute_many_descriptors` is the only one of these that defaults `batch_size` to
`None`, and current joblib rejects `None`, so any `n_jobs` above 1 raises before a single
descriptor is computed. Passing `batch_size="auto"` — joblib's own default — fixes it. The
others go through `dm.parallelized`, which already defaults to `"auto"` and is unaffected.

**Progress bars**: Many batch operations support `progress=True` parameter.

## Reference Documentation

For detailed API documentation, consult these reference files:

- **`references/core_api.md`**: Core namespace functions (conversions, standardization, fingerprints, clustering)
- **`references/io_module.md`**: File I/O operations (read/write SDF, CSV, Excel, remote files)
- **`references/conformers_module.md`**: 3D conformer generation, clustering, SASA calculations
- **`references/descriptors_viz.md`**: Molecular descriptors and visualization functions
- **`references/fragments_scaffolds.md`**: Scaffold extraction, BRICS/RECAP fragmentation
- **`references/reactions_data.md`**: Chemical reactions and toy datasets

## Best Practices

1. **Always standardize molecules** from external sources:
   ```python
   mol = dm.standardize_mol(mol, disconnect_metals=True, normalize=True, reionize=True)
   ```

2. **Check for None values** after molecule parsing:
   ```python
   mol = dm.to_mol(smiles)
   if mol is None:
       raise ValueError(f"could not parse SMILES: {smiles}")
   ```

3. **Use parallel processing** for large datasets:
   ```python
   result = dm.operation(..., n_jobs=-1, progress=True)
   ```

4. **Use cloud I/O only when requested** — confirm remote write paths; install `s3fs`/`gcsfs` as needed:
   ```python
   df = dm.read_sdf("s3://bucket/compounds.sdf")
   ```

5. **Use appropriate fingerprints** for similarity:
   - ECFP (Morgan): General purpose, structural similarity
   - MACCS: Fast, smaller feature space
   - Atom pairs: Considers atom pairs and distances

6. **Consider scale limitations**:
   - Butina clustering: ~1,000 molecules (full distance matrix)
   - For larger datasets: Use diversity selection or hierarchical methods

7. **Scaffold splitting for ML**: Ensure proper train/test separation by scaffold

8. **Align molecules** when visualizing SAR series

## Error Handling

```python
# Safe molecule creation
def safe_to_mol(smiles):
    try:
        mol = dm.to_mol(smiles)
        if mol is not None:
            mol = dm.standardize_mol(mol)
        return mol
    except Exception as e:
        print(f"Failed to process {smiles}: {e}")
        return None

# Safe batch processing
valid_mols = []
for smiles in smiles_list:
    mol = safe_to_mol(smiles)
    if mol is not None:
        valid_mols.append(mol)
```

## Integration with Machine Learning

Datamol ships with `scipy` and `scikit-learn` as dependencies. Import them as normal PyPI packages — they are not scripts bundled in this skill.

```python
import numpy as np

# Feature generation
X = np.array([dm.to_fp(mol) for mol in mols])

# Or descriptors (batch_size is required for n_jobs > 1 — see Parallelization)
desc_df = dm.descriptors.batch_compute_many_descriptors(mols, n_jobs=-1, batch_size="auto")
X = desc_df.values

# Train model (scikit-learn PyPI package)
from sklearn.ensemble import RandomForestRegressor  # third-party library
model = RandomForestRegressor()
model.fit(X, y_target)

# Predict
predictions = model.predict(X_test)
```

## Troubleshooting

**Issue**: Molecule parsing fails
- **Solution**: Use `dm.standardize_smiles()` first or try `dm.fix_mol()`

**Issue**: Memory errors with clustering
- **Solution**: Use `dm.pick_diverse()` instead of full clustering for large sets

**Issue**: Slow conformer generation
- **Solution**: Reduce `n_confs` or increase `rms_cutoff` to generate fewer conformers

**Issue**: Remote file access fails
- **Solution**: Install the matching fsspec backend (`uv pip install s3fs` or `gcsfs`) and verify only the provider credentials needed for that backend are set (see Remote file support above)

**Issue**: `Boost.Python.ArgumentError` mentioning `GetMorganGenerator` or `GetFingerprint`
- **Solution**: Two different causes. `n_bits=` is not a fingerprint kwarg — use `fpSize=`. And `dm.to_fp` takes **one** molecule, so featurizing a table means `np.array([dm.to_fp(m) for m in df["mol"]])`, not `dm.to_fp(df["mol"])`

**Issue**: `ValueError: batch_size must be 'auto' or a positive integer, got: None`
- **Solution**: You passed `n_jobs` > 1 to `batch_compute_many_descriptors`. Add `batch_size="auto"`

**Issue**: `KeyError` on a descriptor you know exists
- **Solution**: The keys are datamol's, not RDKit's or Lipinski's — `clogp`, `n_lipinski_hbd`, `n_lipinski_hba`. Print `.keys()` once rather than guessing. Note `mw` is the **exact (monoisotopic)** mass, not the average molecular weight

**Issue**: `KeyError: 'n_aromatic_heterocyles'` (or the aliphatic/saturated equivalents) after upgrading
- **Solution**: Those keys were misspelled through 0.12.5 and are corrected in 0.13.0 — add the
  missing second `c`: `n_aromatic_heterocycles`. The same-named *functions* still exist as
  deprecated aliases, so `dm.descriptors.n_aromatic_heterocyles(mol)` keeps working with a
  `DeprecationWarning` while the dict key does not. Watch for `.get("n_aromatic_heterocyles")`,
  which returns `None` instead of raising

**Issue**: Conformer clustering suddenly returns far fewer conformers than it used to
- **Solution**: Expected on 0.13.0, and it is the old behaviour that was wrong.
  `dm.conformers.cluster` now prunes with symmetry-aware optimal alignment, so the set it
  returns genuinely satisfies your `rms_cutoff`; 0.12.5 returned conformers closer together
  than you asked for. Do **not** reach for `already_aligned=True` to get the old count back —
  that flag is for conformers you have actually pre-aligned, and on unaligned input it
  reproduces the old, cutoff-violating result

**Issue**: `TypeError` or `KeyError: 'mol'` right after `dm.read_sdf`
- **Solution**: Two defaults, both easy to misread. `as_df` is **False**, so a bare
  `dm.read_sdf(path)` hands you a `list` and subscripting it with `"mol"` raises `TypeError`.
  And `mol_column` is **None**, so `as_df=True` on its own returns a frame with a `smiles`
  column and no molecules — `KeyError`. Ask for both:
  `dm.read_sdf(path, as_df=True, mol_column="mol")`. `dm.read_smi` is stricter still: it takes
  only the path and always returns a sequence of molecules

**Issue**: Clustering results look wrong or unpack strangely
- **Solution**: `dm.cluster_mols` returns a 2-tuple, `(index_clusters, molecule_clusters)`. Iterating the return value gives you those two items, not your clusters — unpack it

**Issue**: `AttributeError: module 'rdkit.Chem' has no attribute 'rdChemReactions'`
- **Solution**: `from rdkit import Chem` does not pull in the reactions submodule. Import it
  directly: `from rdkit.Chem import rdChemReactions`

**Issue**: A reaction product will not sanitize, draw or convert to SMILES
- **Solution**: `dm.reactions.apply_reaction` returns a **nested list**, one inner list per
  product group — `[[Mol]]` with the defaults, so the molecule is `result[0][0]`. A reactant
  that does not match returns `[]`, never `None`, so `if p is not None` filters nothing.
  `single_product_group=True` flattens one level. And mind the argument order: `product_index`
  is the third parameter, so a positional `apply_reaction(rxn, reactants, True)` sets that,
  not `as_smiles`

**Issue**: A saved `.png` grid will not open, or a grid is missing molecules
- **Solution**: Both are `dm.viz.to_image` defaults. `use_svg` is **True**, so `outfile="x.png"`
  writes SVG bytes under a `.png` name — pass `use_svg=False`, or name it `.svg`. And
  `max_mols` is **32**, so a longer list is silently truncated — pass `max_mols=len(mols)`

**Issue**: `TypeError: 'Mol' object is not iterable` from `dm.scaffold.fuzzy_scaffolding`
- **Solution**: It takes a **list** of molecules and returns a 3-tuple,
  `(scaffolds, scaffold_infos, all_scaffolds)`. `dm.to_scaffold_murcko` is the per-molecule one

## Try it

A self-contained check that this skill still works. No key, no account, no GPU — just
`uv pip install datamol`.

**Data** — none to fetch, and `datasets:` is deliberately empty. The inputs are eight
SMILES strings written into the block below: aspirin, salicylic acid, paracetamol,
ibuprofen, caffeine, theophylline, nicotine and benzene. SMILES *are* the data for
cheminformatics, so there is no file to download and nothing that can 404 — the pairs are
chosen so that a chemically obvious relationship (aspirin is a salicylic-acid derivative;
caffeine is not) becomes an assertion.

The block routes through the traps this library actually sets, and asserts the two error
paths rather than describing them — so a release that *fixes* `n_bits` fails here too,
loudly, instead of leaving the note above quietly wrong. The last step also generates
conformers, which is the only part that takes more than a moment to run.

```python
import datamol as dm
import numpy as np
from rdkit.Chem import Descriptors

# Eight well-known drug molecules, written out here — nothing to download.
SMILES = {
    "aspirin":      "CC(=O)Oc1ccccc1C(=O)O",
    "salicylic":    "OC(=O)c1ccccc1O",
    "paracetamol":  "CC(=O)Nc1ccc(O)cc1",
    "ibuprofen":    "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
    "caffeine":     "Cn1cnc2c1c(=O)n(C)c(=O)n2C",
    "theophylline": "Cn1c(=O)c2[nH]cnc2n(C)c1=O",
    "nicotine":     "CN1CCC[C@H]1c1cccnc1",
    "benzene":      "c1ccccc1",
}
names = list(SMILES)
mols = [dm.to_mol(s) for s in SMILES.values()]
assert all(m is not None for m in mols), "a SMILES failed to parse"
asp, sal, caf = (names.index(n) for n in ("aspirin", "salicylic", "caffeine"))

# 1. Descriptors. The keys are not the Lipinski names you would guess, and `mw` is the
#    EXACT (monoisotopic) mass — cross-check it against RDKit's two masses to see which.
d = dm.descriptors.compute_many_descriptors(mols[asp])
try:
    d["logp"]
    raise SystemExit("expected KeyError: the key is 'clogp'")
except KeyError:
    pass

# 1b. Three keys were misspelled through 0.12.5 (…heterocyles, one 'c' short) and are
#     corrected in 0.13.0. The old spelling is gone from the dict — and .get() would hide
#     that by returning None, so check membership rather than truthiness.
het = sorted(k for k in d if "heterocy" in k)
assert d.get("n_aromatic_heterocyles") is None, "0.12.5 spelling should no longer be a key"

# 2. Parallel batch descriptors. n_jobs > 1 alone raises — batch_size defaults to None,
#    which joblib rejects. Pass batch_size explicitly.
df = dm.descriptors.batch_compute_many_descriptors(mols, n_jobs=-1, batch_size="auto")

# 3. Fingerprints. The bit-count kwarg is fpSize (RDKit's generator API), not n_bits.
fp = dm.to_fp(mols[asp], fp_type="ecfp", radius=2, fpSize=2048)
maccs = dm.to_fp(mols[asp], fp_type="maccs")
try:
    dm.to_fp(mols[asp], fp_type="ecfp", radius=2, n_bits=2048)
    raise SystemExit("expected an ArgumentError: the kwarg is fpSize, not n_bits")
except Exception as e:
    assert "did not match C++ signature" in str(e), e

# 4. pdist is Tanimoto DISTANCE, not similarity: 0 = identical, 1 = nothing in common.
dist = dm.pdist(mols)

# 5. cluster_mols returns a 2-TUPLE (index clusters, molecule clusters) — not a list
#    of clusters. Iterating it directly gives you two items whatever the data says.
cluster_indices, mol_clusters = dm.cluster_mols(mols, cutoff=0.7)
flat = sorted(i for c in cluster_indices for i in c)

# 6. Reactions. rdChemReactions needs its own import — `from rdkit import Chem` alone
#    leaves Chem.rdChemReactions raising AttributeError. apply_reaction returns a NESTED
#    list (one inner list per product group), and a non-matching reactant gives [].
from rdkit.Chem import rdChemReactions
rxn = rdChemReactions.ReactionFromSmarts('[C:1][OH:2].[C:3](=[O:4])[OH:5]>>[C:1][O:2][C:3](=[O:4])')
ester = dm.reactions.apply_reaction(rxn, (dm.to_mol("CCO"), dm.to_mol("CC(=O)O")))
no_match = dm.reactions.apply_reaction(rxn, (dm.to_mol("c1ccccc1"), dm.to_mol("c1ccccc1")))

# 7. to_image defaults: SVG (a str), and only the first 32 molecules.
grid_svg = dm.viz.to_image(mols)
truncating = dm.viz.to_image([dm.to_mol("C" * (i % 8 + 1)) for i in range(40)], n_cols=4)
complete = dm.viz.to_image([dm.to_mol("C" * (i % 8 + 1)) for i in range(40)], n_cols=4,
                           max_mols=40)

# 8. fuzzy_scaffolding takes a LIST and returns a 3-tuple — to_scaffold_murcko is the
#    per-molecule one. RDKit prints hydrogen warnings to stderr here; they are not failures.
series = [dm.to_mol(s) for s in ("c1ccc2ncnc(N)c2c1", "Cc1ccc2ncnc(N)c2c1",
                                 "Clc1ccc2ncnc(N)c2c1", "COc1ccc2ncnc(N)c2c1")]
scaffolds, scaffold_infos, all_scaffolds = dm.scaffold.fuzzy_scaffolding(series)

# 9. Conformer pruning. 0.13.0 prunes with symmetry-aware optimal alignment, so the set it
#    returns really does satisfy rms_cutoff. already_aligned=True is the faster common-frame
#    path and is only valid for genuinely pre-aligned input — here it keeps conformers far
#    closer than the cutoff, which is what 0.12.5 did for everyone.
ibu = dm.conformers.generate(dm.to_mol(SMILES["ibuprofen"]), n_confs=20,
                             minimize_energy=False, random_seed=42)
def closest_pair(m):
    R = dm.conformers.rmsd(m)
    n = m.GetNumConformers()
    return float(R[~np.eye(n, dtype=bool)].min()) if n > 1 else float("inf")
pruned = dm.conformers.cluster(ibu, rms_cutoff=1.0, centroids=True)
loose = dm.conformers.cluster(ibu, rms_cutoff=1.0, already_aligned=True, centroids=True)

print("datamol        :", dm.__version__)
print("descriptors    :", df.shape, "| keys include clogp/n_lipinski_hbd, not logp/hbd")
print("aspirin mw     : %.6f (exact) vs RDKit MolWt %.3f (average)"
      % (d["mw"], Descriptors.MolWt(mols[asp])))
print("aspirin clogp  : %.4f | qed %.4f | tpsa %.2f" % (d["clogp"], d["qed"], d["tpsa"]))
print("ecfp4 / maccs  :", fp.shape, fp.dtype, "on-bits", int(fp.sum()), "|", maccs.shape)
print("distance matrix:", dist.shape, "| diagonal max %.1f" % dist.diagonal().max())
print("aspirin~salicylic %.4f  <  aspirin~caffeine %.4f" % (dist[asp, sal], dist[asp, caf]))
print("clusters       :", len(cluster_indices), "sizes", [len(c) for c in cluster_indices])
print("apply_reaction :", type(ester).__name__, "of", type(ester[0]).__name__,
      "->", dm.to_smiles(ester[0][0]), "| no match ->", no_match)
print("to_image       :", type(grid_svg).__name__, "| 40 mols default vs max_mols=40:",
      len(truncating), "vs", len(complete), "chars")
print("fuzzy_scaffolds:", sorted(scaffolds))
print("heterocycle keys:", het)
print("conformers     : 20 seeded -> %d pruned (closest %.3f A) | already_aligned=True -> %d (closest %.3f A)"
      % (pruned.GetNumConformers(), closest_pair(pruned),
         loose.GetNumConformers(), closest_pair(loose)))

assert d["mw"] == Descriptors.ExactMolWt(mols[asp]) != Descriptors.MolWt(mols[asp])
assert {"mw", "clogp", "n_lipinski_hbd", "n_lipinski_hba"} <= d.keys()
assert het == ["n_aliphatic_heterocycles", "n_aromatic_heterocycles",
               "n_saturated_heterocycles"], "0.13.0 corrected the '…heterocyles' spelling"
assert df.shape[0] == len(mols)
assert fp.shape == (2048,) and maccs.shape == (167,)
assert dist.shape == (len(mols), len(mols)) and np.allclose(dist, dist.T)
assert dist.diagonal().max() == 0.0, "distance, not similarity: a molecule is 0 from itself"
assert dist[asp, sal] < dist[asp, caf], "aspirin is closer to salicylic acid than to caffeine"
assert len(mol_clusters) == len(cluster_indices)
assert flat == list(range(len(mols))), "clusters must partition the input exactly once"

# apply_reaction: nested list, and [] rather than None when nothing matches
assert isinstance(ester, list) and isinstance(ester[0], list), "product groups nest one deep"
assert dm.to_smiles(ester[0][0]) == "CCOC(C)=O"
assert no_match == [], "a non-matching reactant returns an empty list, not None"
# to_image: SVG string by default, and max_mols=32 truncates without warning
assert isinstance(grid_svg, str) and grid_svg.lstrip().startswith("<?xml"), "use_svg is True"
assert len(complete) > len(truncating), "max_mols defaults to 32, so 40 molecules truncate"
# fuzzy_scaffolding: a list in, a 3-tuple out
assert scaffolds == {"Nc1ncnc2ccc([*:1])cc12", "Nc1ncnc2ccccc12"}
assert isinstance(scaffold_infos, type(df)) and isinstance(all_scaffolds, type(df))
try:
    dm.scaffold.fuzzy_scaffolding(mols[asp])
    raise SystemExit("expected TypeError: fuzzy_scaffolding takes a list of molecules")
except TypeError:
    pass
# conformer pruning: the kept set must honour the cutoff it was given
assert closest_pair(pruned) >= 1.0, "pruned conformers must be at least rms_cutoff apart"
assert pruned.GetNumConformers() < loose.GetNumConformers(), \
    "already_aligned=True skips the symmetry-aware alignment and keeps more"
assert closest_pair(loose) < 1.0, "the opt-out path returns conformers closer than the cutoff"
print("invariants OK")
```

**Expect**

Invariants — these are properties of the library and of chemistry, not of a release, and a
failure means this skill is wrong:

- **`mw` is the exact (monoisotopic) mass.** The assertion pins it to RDKit's
  `ExactMolWt` *and* pins it away from `MolWt`, so the two masses cannot be confused: 180.0423
  against 180.159 for aspirin. Reading `mw` as average molecular weight is a quiet 0.1–0.2%
  error that no exception will ever raise for you.
- **The descriptor keys are `clogp`, `n_lipinski_hbd`, `n_lipinski_hba`.** `logp` raises
  `KeyError`, which the block asserts rather than assumes.
- **The fingerprint width kwarg is `fpSize`.** `n_bits` raises `Boost.Python.ArgumentError`,
  also asserted. ECFP4 is 2048 bits; MACCS is always 167.
- **`dm.pdist` returns Tanimoto *distance*.** Symmetric, zero on the diagonal. Aspirin is
  closer to salicylic acid than to caffeine — a chemical fact, so it holds under any
  fingerprint the library might default to.
- **`dm.cluster_mols` returns a 2-tuple**, `(index_clusters, molecule_clusters)`, and the
  index clusters partition the input exactly once — every molecule in one cluster, none
  dropped or repeated.
- **`batch_compute_many_descriptors` needs `batch_size` when `n_jobs` > 1.** If this line
  starts working without it, joblib changed, not this skill.
- **`dm.reactions.apply_reaction` returns a nested list**, one inner list per product group,
  so the molecule is `result[0][0]`. A reactant that matches nothing returns `[]` — not
  `None`, and not an exception.
- **`dm.viz.to_image` returns an SVG `str` by default** (`use_svg=True`), and shows at most
  `max_mols=32` molecules with no warning. The block renders 40 twice, once at the default
  and once at `max_mols=40`, and asserts the second is larger.
- **`dm.scaffold.fuzzy_scaffolding` takes a list and returns a 3-tuple.** Passing a single
  molecule raises `TypeError`, which the block asserts. The two scaffolds recovered from the
  4-aminoquinazoline series are a chemical fact about that series, not a version detail.
- **A pruned conformer set honours the cutoff it was given.** The closest surviving pair is at
  least `rms_cutoff` apart — that is what pruning means, and on 0.13.0 it finally holds. The
  block asserts it, and asserts that `already_aligned=True` on unaligned input does *not*
  hold it, so the faster path cannot be mistaken for a free one.

Version-dependent observations — a mismatch is **drift to investigate**, not a failure:

- **The descriptor keys spell `heterocycles` in full.** On 0.12.5 and earlier all three were
  a `c` short. If this assertion fires, check your installed version before your code.
- **Twenty seeded conformers of ibuprofen prune to 2 at `rms_cutoff=1.0`.** The count depends
  on RDKit's embedding as well as datamol's pruning, so treat the number as observed; the
  cutoff invariant above is the part that must hold.

Observed 2026-09-19 on datamol 0.13.0 / RDKit 2026.03.6 / joblib 1.6.0 / pandas 3.0.6 /
NumPy 2.4.6, Python 3.11.15. The character counts in the `to_image` line are the loosest thing
here; only their ordering is asserted:

```
datamol        : 0.13.0
descriptors    : (8, 22) | keys include clogp/n_lipinski_hbd, not logp/hbd
aspirin mw     : 180.042259 (exact) vs RDKit MolWt 180.159 (average)
aspirin clogp  : 1.3101 | qed 0.5501 | tpsa 63.60
ecfp4 / maccs  : (2048,) uint8 on-bits 24 | (167,)
distance matrix: (8, 8) | diagonal max 0.0
aspirin~salicylic 0.6410  <  aspirin~caffeine 0.9344
clusters       : 6 sizes [2, 2, 1, 1, 1, 1]
apply_reaction : list of list -> CCOC(C)=O | no match -> []
to_image       : str | 40 mols default vs max_mols=40: 42857 vs 53513 chars
fuzzy_scaffolds: ['Nc1ncnc2ccc([*:1])cc12', 'Nc1ncnc2ccccc12']
heterocycle keys: ['n_aliphatic_heterocycles', 'n_aromatic_heterocycles', 'n_saturated_heterocycles']
conformers     : 20 seeded -> 2 pruned (closest 1.122 A) | already_aligned=True -> 10 (closest 0.134 A)
invariants OK
```

Every line above except the `datamol` version, the two new lines, and the conformer counts is
**byte-identical to the 0.12.5 run recorded on 2026-09-05** — the upgrade left everything else
this block asserts untouched.

RDKit also writes `not removing hydrogen atom without neighbors` warnings to **stderr**
during the `fuzzy_scaffolding` step. They come from its fuzzy-matching internals and do not
indicate a failure — the block exits 0.

At `cutoff=0.7` the only pairs that cluster together are aspirin with salicylic acid and
caffeine with theophylline — both genuine structural pairs, which is the result worth
recognising if you change the cutoff and everything collapses into one cluster.

## Additional Resources

- **Datamol Documentation**: https://docs.datamol.io/
- **RDKit Documentation**: https://www.rdkit.org/docs/
- **GitHub Repository**: https://github.com/datamol-io/datamol
