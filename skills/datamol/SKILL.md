---
name: datamol
description: Cheminformatics with datamol, a Pythonic layer over RDKit with sensible defaults — SMILES parsing and standardization, descriptors, fingerprints, clustering, 3D conformers, and parallel processing.
category: analysis
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.2.0
tags: [cheminformatics, rdkit, smiles, descriptors, fingerprints]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified: pending
---
# Datamol Cheminformatics Skill

## Overview

Datamol is a Python library that provides a lightweight, Pythonic abstraction layer over RDKit for molecular cheminformatics. Simplify complex molecular operations with sensible defaults, efficient parallelization, and modern I/O capabilities. All molecular objects are native `rdkit.Chem.Mol` instances, ensuring full compatibility with the RDKit ecosystem.

**Version note:** Examples target **datamol 0.12.x**. 0.12.5 (June 2024) is still the PyPI stable release as of August 2026. Since 0.10.0, modules are lazy-loaded by default (set `DATAMOL_DISABLE_LAZY_LOADING=1` to disable). Since 0.12.2, RDKit is a direct PyPI dependency of datamol. Fingerprints use RDKit's `rdFingerprintGenerator` API (0.12.5+).

**datamol has not been released in two years, and its dependencies have moved.** A fresh
`uv pip install datamol` today pairs 0.12.5 with a current RDKit and joblib, and three calls
that older tutorials still show now raise:

| Call | What happens | Use instead |
| --- | --- | --- |
| `dm.to_fp(mol, n_bits=2048)` | `Boost.Python.ArgumentError` — the kwarg goes straight to RDKit's generator | `fpSize=2048` |
| `dm.descriptors.batch_compute_many_descriptors(mols, n_jobs=-1)` | `ValueError: batch_size must be 'auto' or a positive integer, got: None` | add `batch_size="auto"` |
| `dm.descriptors.compute_many_descriptors(mol)["logp"]` | `KeyError` | `"clogp"`, `"n_lipinski_hbd"`, `"n_lipinski_hba"` |

`## Try it` at the end of this file asserts all three, so you can tell in one run whether
your install still behaves this way.

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

RDKit is installed automatically with datamol. For remote file paths (S3, GCS, HTTP), install the matching fsspec backend:

```bash
uv pip install s3fs   # AWS S3
uv pip install gcsfs  # Google Cloud Storage
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
       # Handle invalid SMILES
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

**Issue**: Clustering results look wrong or unpack strangely
- **Solution**: `dm.cluster_mols` returns a 2-tuple, `(index_clusters, molecule_clusters)`. Iterating the return value gives you those two items, not your clusters — unpack it

## Try it

A self-contained check that this skill still works. No key, no account, no GPU — just
`uv pip install datamol`.

**Data** — none to fetch, and `datasets:` is deliberately empty. The inputs are eight
SMILES strings written into the block below: aspirin, salicylic acid, paracetamol,
ibuprofen, caffeine, theophylline, nicotine and benzene. SMILES *are* the data for
cheminformatics, so there is no file to download and nothing that can 404 — the pairs are
chosen so that a chemically obvious relationship (aspirin is a salicylic-acid derivative;
caffeine is not) becomes an assertion.

The block routes through the four traps this library actually sets, and asserts the two
error paths rather than describing them — so a release that *fixes* `n_bits` fails here too,
loudly, instead of leaving the note above quietly wrong.

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

print("datamol        :", dm.__version__)
print("descriptors    :", df.shape, "| keys include clogp/n_lipinski_hbd, not logp/hbd")
print("aspirin mw     : %.6f (exact) vs RDKit MolWt %.3f (average)"
      % (d["mw"], Descriptors.MolWt(mols[asp])))
print("aspirin clogp  : %.4f | qed %.4f | tpsa %.2f" % (d["clogp"], d["qed"], d["tpsa"]))
print("ecfp4 / maccs  :", fp.shape, fp.dtype, "on-bits", int(fp.sum()), "|", maccs.shape)
print("distance matrix:", dist.shape, "| diagonal max %.1f" % dist.diagonal().max())
print("aspirin~salicylic %.4f  <  aspirin~caffeine %.4f" % (dist[asp, sal], dist[asp, caf]))
print("clusters       :", len(cluster_indices), "sizes", [len(c) for c in cluster_indices])

assert d["mw"] == Descriptors.ExactMolWt(mols[asp]) != Descriptors.MolWt(mols[asp])
assert {"mw", "clogp", "n_lipinski_hbd", "n_lipinski_hba"} <= d.keys()
assert df.shape[0] == len(mols)
assert fp.shape == (2048,) and maccs.shape == (167,)
assert dist.shape == (len(mols), len(mols)) and np.allclose(dist, dist.T)
assert dist.diagonal().max() == 0.0, "distance, not similarity: a molecule is 0 from itself"
assert dist[asp, sal] < dist[asp, caf], "aspirin is closer to salicylic acid than to caffeine"
assert len(mol_clusters) == len(cluster_indices)
assert flat == list(range(len(mols))), "clusters must partition the input exactly once"
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

Observed 2026-08-13 on datamol 0.12.5 / RDKit 2026.03.5 / joblib 1.5.3 / NumPy 2.4.6,
Python 3.11 — treat a mismatch here as drift to investigate, not a failure:

```
datamol        : 0.12.5
descriptors    : (8, 22) | keys include clogp/n_lipinski_hbd, not logp/hbd
aspirin mw     : 180.042259 (exact) vs RDKit MolWt 180.159 (average)
aspirin clogp  : 1.3101 | qed 0.5501 | tpsa 63.60
ecfp4 / maccs  : (2048,) uint8 on-bits 24 | (167,)
distance matrix: (8, 8) | diagonal max 0.0
aspirin~salicylic 0.6410  <  aspirin~caffeine 0.9344
clusters       : 6 sizes [2, 2, 1, 1, 1, 1]
invariants OK
```

At `cutoff=0.7` the only pairs that cluster together are aspirin with salicylic acid and
caffeine with theophylline — both genuine structural pairs, which is the result worth
recognising if you change the cutoff and everything collapses into one cluster.

## Additional Resources

- **Datamol Documentation**: https://docs.datamol.io/
- **RDKit Documentation**: https://www.rdkit.org/docs/
- **GitHub Repository**: https://github.com/datamol-io/datamol
