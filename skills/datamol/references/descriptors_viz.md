# Datamol Descriptors and Visualization Reference

## Descriptors Module (`datamol.descriptors`)

The descriptors module provides tools for computing molecular properties and descriptors.

### Specialized Descriptor Functions

#### `dm.descriptors.n_aromatic_atoms(mol)`
Calculate the number of aromatic atoms.
- **Returns**: Integer count
- **Use case**: Aromaticity analysis

#### `dm.descriptors.n_aromatic_atoms_proportion(mol)`
Calculate ratio of aromatic atoms to total heavy atoms.
- **Returns**: Float between 0 and 1
- **Use case**: Quantifying aromatic character

#### `dm.descriptors.n_charged_atoms(mol)`
Count atoms with nonzero formal charge.
- **Returns**: Integer count
- **Use case**: Charge distribution analysis

#### `dm.descriptors.n_rigid_bonds(mol)`
Count non-rotatable bonds (neither single bonds nor ring bonds).
- **Returns**: Integer count
- **Use case**: Molecular flexibility assessment

#### `dm.descriptors.n_stereo_centers(mol)`
Count stereogenic centers (chiral centers).
- **Returns**: Integer count
- **Use case**: Stereochemistry analysis

#### `dm.descriptors.n_stereo_centers_unspecified(mol)`
Count stereocenters lacking stereochemical specification.
- **Returns**: Integer count
- **Use case**: Identifying incomplete stereochemistry

### Batch Descriptor Computation

#### `dm.descriptors.compute_many_descriptors(mol, properties_fn=None, add_properties=True)`
Compute multiple molecular properties for a single molecule.
- **Parameters**:
  - `properties_fn`: Custom list of descriptor functions
  - `add_properties`: Include additional computed properties
- **Returns**: Dictionary of descriptor name → value pairs
- **Default descriptors include**:
  - Molecular weight, LogP, number of H-bond donors/acceptors
  - Aromatic atoms, stereocenters, rotatable bonds
  - TPSA (Topological Polar Surface Area)
  - Ring count, heteroatom count
- **Example**:
  ```python
  mol = dm.to_mol("CCO")
  descriptors = dm.descriptors.compute_many_descriptors(mol)
  # Returns 22 keys: {'mw': 46.0419, 'clogp': -0.0014, 'n_lipinski_hbd': 1,
  #                   'n_lipinski_hba': 1, 'tpsa': 20.23, 'fsp3': 1.0, ...}
  # 'mw' is the exact (monoisotopic) mass. There is no 'logp'/'hbd'/'hba' key.
  ```

#### `dm.descriptors.batch_compute_many_descriptors(mols, properties_fn=None, add_properties=True, n_jobs=1, batch_size=None, progress=False)`
Compute descriptors for multiple molecules in parallel.
- **Parameters**:
  - `mols`: List of molecules
  - `n_jobs`: Number of parallel jobs (-1 for all cores)
  - `batch_size`: Chunk size for parallel processing. **The `None` default is not usable
    with `n_jobs` > 1** — joblib rejects it and nothing is computed. Pass `"auto"`
  - `progress`: Show progress bar
- **Returns**: Pandas DataFrame with one row per molecule
- **Example**:
  ```python
  mols = [dm.to_mol(smi) for smi in smiles_list]
  df = dm.descriptors.batch_compute_many_descriptors(
      mols,
      n_jobs=-1,
      batch_size="auto",
      progress=True
  )
  ```

### RDKit Descriptor Access

#### `dm.descriptors.any_rdkit_descriptor(name)`
Retrieve any descriptor function from RDKit by name.
- **Parameters**: `name` - Descriptor function name (e.g., 'MolWt', 'TPSA')
- **Returns**: RDKit descriptor function
- **Available descriptors**: From `rdkit.Chem.Descriptors` and `rdkit.Chem.rdMolDescriptors`
- **Example**:
  ```python
  tpsa_fn = dm.descriptors.any_rdkit_descriptor('TPSA')
  tpsa_value = tpsa_fn(mol)
  ```

### Common Use Cases

**Drug-likeness Filtering (Lipinski's Rule of Five)**:
```python
# The keys are datamol's own: 'clogp' and 'n_lipinski_hb[ad]'.
# 'logp', 'hbd' and 'hba' do not exist and raise KeyError.
# 'mw' is the exact (monoisotopic) mass, not the average molecular weight.
descriptors = dm.descriptors.compute_many_descriptors(mol)
is_druglike = (
    descriptors['mw'] <= 500 and
    descriptors['clogp'] <= 5 and
    descriptors['n_lipinski_hbd'] <= 5 and
    descriptors['n_lipinski_hba'] <= 10
)
```

**ADME Property Analysis**:
```python
df = dm.descriptors.batch_compute_many_descriptors(compound_library)
# Filter by TPSA for blood-brain barrier penetration
bbb_candidates = df[df['tpsa'] < 90]
```

---

## Visualization Module (`datamol.viz`)

The viz module provides tools for rendering molecules and conformers as images.

### Main Visualization Function

#### `dm.viz.to_image(mols, legends=None, n_cols=4, use_svg=True, mol_size=(300, 300), highlight_atom=None, highlight_bond=None, outfile=None, max_mols=32, max_mols_ipython=50, copy=True, indices=False, ...)`
Generate image grid from molecules.
- **Parameters**:
  - `mols`: Single molecule or list of molecules
  - `legends`: String or list of strings as labels (one per molecule)
  - `n_cols`: Number of molecules per row (default: 4)
  - `use_svg`: Output SVG (**True, the default**) or PNG (False). Two consequences below
  - `mol_size`: Tuple (width, height) or single int for square images (default: `(300, 300)`)
  - `highlight_atom`: Atom indices to highlight (list or dict)
  - `highlight_bond`: Bond indices to highlight (list or dict)
  - `outfile`: Save path (local or remote, supports fsspec)
  - `max_mols`: Maximum number of molecules to display — **32 by default, not unlimited**
  - `indices`: Draw atom indices on structures (default: False)
  - `align`: Align molecules using MCS (Maximum Common Substructure)
- **Returns**: With the default `use_svg=True`, an SVG **`str`** — not a PIL image. `use_svg=False`
  returns a PIL image object.

Two defaults here bite silently rather than raising, so they are worth stating plainly:

- **`use_svg` defaults to `True`, so `outfile="grid.png"` writes SVG bytes into a file named
  `.png`.** Nothing warns; the file simply will not open as a PNG. Pass `use_svg=False` when
  the extension says PNG, or name the file `.svg`.
- **`max_mols` defaults to `32`, so a longer list is truncated without a warning.** Rendering
  40 molecules at `n_cols=4` produces an eight-row canvas (1200×2400 at the default
  `mol_size`), not ten rows — the last eight molecules are dropped. Pass `max_mols=len(mols)`
  when you mean all of them.

- **Example**:
  ```python
  # Basic grid
  dm.viz.to_image(mols[:10], legends=[dm.to_smiles(m) for m in mols[:10]])

  # Save to file — use_svg=False is required for the .png name to be truthful
  dm.viz.to_image(mols, outfile="molecules.png", n_cols=5, use_svg=False)

  # Save vector output instead
  dm.viz.to_image(mols, outfile="molecules.svg", n_cols=5)

  # Show every molecule, not the first 32
  dm.viz.to_image(mols, max_mols=len(mols))

  # Highlight substructure
  dm.viz.to_image(mol, highlight_atom=[0, 1, 2], highlight_bond=[0, 1])

  # Aligned visualization
  dm.viz.to_image(mols, align=True, legends=activity_labels)
  ```

### Conformer Visualization

#### `dm.viz.conformers(mol, conf_id=-1, n_confs=None, align_conf=True, n_cols=3, sync_views=True, remove_hs=True, width='auto')`
Display multiple conformers in grid layout.

Two traps, both about *how many* conformers you get:

- `conf_id` is the **second** positional parameter, so `dm.viz.conformers(mol_3d, 10)` sets
  `conf_id=10`, not `n_confs=10`. Pass `n_confs` by keyword.
- **`n_confs=None` shows only the first conformer, not all of them.** To show all, pass
  `n_confs=-1`. This is the opposite of the `conf_id` convention on the line above, where
  `-1` means the first conformer — and it only applies while `n_confs` is None.

- **Parameters**:
  - `mol`: Molecule with embedded conformers
  - `conf_id`: The single conformer to show; `-1` (default) shows the first. Only consulted
    while `n_confs` is None
  - `n_confs`: Number of conformers, or a list of conformer indices. `None` (default) shows
    only the first; `-1` shows all
  - `align_conf`: Align conformers for comparison (default: True)
  - `n_cols`: Grid columns (default: 3)
  - `sync_views`: Synchronize 3D views when interactive (default: True)
  - `remove_hs`: Remove hydrogens for clarity (default: True)
  - `width`: Width of the returned view (default: `'auto'`)
- **Returns**: Grid of conformer visualizations
- **Use case**: Comparing conformational diversity
- **Example**:
  ```python
  mol_3d = dm.conformers.generate(mol, n_confs=20)
  dm.viz.conformers(mol_3d, n_confs=10, align_conf=True)   # ten of them
  dm.viz.conformers(mol_3d, n_confs=-1)                    # all twenty
  ```

### Circle Grid Visualization

#### `dm.viz.circle_grid(center_mol, ring_mols, act_mapper=None, margin=50, legend=None, ring_scaler=1.0, align=None, use_svg=True, outfile=None, ...)`
Create concentric ring visualization with central molecule.

**The rings argument is `ring_mols`, not `circle_mols`**, and there is no `mol_size` or
`circle_margin` — the spacing parameter is `margin`. Calling this with the names an older
draft of this page used raises `TypeError: circle_grid() missing 1 required positional
argument: 'ring_mols'`.

- **Parameters**:
  - `center_mol`: Molecule at center
  - `ring_mols`: List of molecule lists (one list per ring)
  - `act_mapper`: Activity mapping dictionary for color-coding
  - `margin`: Spacing between rings (default: 50)
  - `ring_scaler`: Scale factor applied to ring radii (default: 1.0)
  - `use_svg`: SVG output (default: True), as in `to_image`
  - `outfile`: Save path
- **Returns**: An SVG `str` under the default `use_svg=True`
- **Use case**: Visualizing molecular neighborhoods, SAR analysis, similarity networks
- **Example**:
  ```python
  # Show a reference molecule surrounded by similar compounds
  dm.viz.circle_grid(
      center_mol=reference,
      ring_mols=[nearest_neighbors, second_tier]
  )
  ```

### Visualization Best Practices

1. **Use legends for clarity**: Always label molecules with SMILES, IDs, or activity values
2. **Align related molecules**: Use `align=True` in `to_image()` for SAR analysis
3. **Adjust grid size**: Set `n_cols` based on molecule count and display width
4. **SVG is already the default**: `use_svg=True` is what you get; set `use_svg=False` when you
   actually want a PNG, and make sure `outfile`'s extension matches
5. **Highlight substructures**: Use `highlight_atom` and `highlight_bond` to emphasize features
6. **Save large grids**: Use `outfile` parameter to save rather than display in memory
