# Datamol Reactions and Data Modules Reference

## Reactions Module (`datamol.reactions`)

The reactions module enables programmatic application of chemical transformations using SMARTS reaction patterns.

### Applying Chemical Reactions

#### `dm.reactions.apply_reaction(rxn, reactants, product_index=None, single_product_group=False, as_smiles=False, rm_attach=False, disable_logs=True, sanitize=True)`
Apply a chemical reaction to reactant molecules.

**Read the parameter order before calling this positionally.** `product_index` is the third
parameter, so `apply_reaction(rxn, reactants, True)` — the shape somebody writes meaning
`as_smiles=True` — sets `product_index=True` instead, and returns molecules. Pass everything
after `reactants` by keyword.

- **Parameters**:
  - `rxn`: Reaction object (from SMARTS pattern)
  - `reactants`: Tuple of reactant molecules
  - `product_index`: Which product to return from each product group (default: `None`, all)
  - `single_product_group`: Return just the first product group (default: **`False`**)
  - `as_smiles`: Return SMILES strings (True) or molecule objects (default: False)
  - `rm_attach`: Remove attachment point markers (default: **`False`**)
  - `disable_logs`: Silence RDKit's reaction logging (default: True)
  - `sanitize`: Sanitize product molecules (default: True)
- **Returns**: **A nested list, one inner list per product group** — not a molecule. With the
  defaults, a one-product reaction gives `[[Mol]]`, so the product is `result[0][0]`. Set
  `single_product_group=True` to flatten one level to `[Mol]`, and `as_smiles=True` to get
  strings in the same shape (`[['CCOC(C)=O']]`).
- **Example**:
  ```python
  import datamol as dm
  from rdkit.Chem import rdChemReactions

  # Define reaction: alcohol + carboxylic acid → ester.
  # rdChemReactions must be imported explicitly — `from rdkit import Chem` alone does not
  # put it on Chem, and `Chem.rdChemReactions` raises AttributeError.
  rxn = rdChemReactions.ReactionFromSmarts(
      '[C:1][OH:2].[C:3](=[O:4])[OH:5]>>[C:1][O:2][C:3](=[O:4])'
  )

  # Apply to reactants
  alcohol = dm.to_mol("CCO")
  acid = dm.to_mol("CC(=O)O")
  products = dm.reactions.apply_reaction(rxn, (alcohol, acid))
  print(dm.to_smiles(products[0][0]))                                    # CCOC(C)=O
  print(dm.reactions.apply_reaction(rxn, (alcohol, acid), as_smiles=True))  # [['CCOC(C)=O']]
  ```

### Creating Reactions

Reactions are typically created from SMARTS patterns using RDKit:
```python
from rdkit.Chem import rdChemReactions

# Reaction pattern: [reactant1].[reactant2]>>[product]
rxn = rdChemReactions.ReactionFromSmarts(
    '[1*][*:1].[1*][*:2]>>[*:1][*:2]'
)
```

### Validation Functions

The module includes functions to:
- **Check if molecule is reactant**: Verify if molecule matches reactant pattern
- **Validate reaction**: Check if reaction is synthetically reasonable
- **Process reaction files**: Load reactions from files or databases

### Common Reaction Patterns

**Amide formation**:
```python
# Amine + carboxylic acid → amide
amide_rxn = rdChemReactions.ReactionFromSmarts(
    '[N:1].[C:2](=[O:3])[OH]>>[N:1][C:2](=[O:3])'
)
```

**Suzuki coupling**:
```python
# Aryl halide + boronic acid → biaryl
suzuki_rxn = rdChemReactions.ReactionFromSmarts(
    '[c:1][Br].[c:2][B]([OH])[OH]>>[c:1][c:2]'
)
```

**Functional group transformations**:
```python
# Alcohol → ester
esterification = rdChemReactions.ReactionFromSmarts(
    '[C:1][OH:2].[C:3](=[O:4])[Cl]>>[C:1][O:2][C:3](=[O:4])'
)
```

### Workflow Example

```python
import datamol as dm
from rdkit.Chem import rdChemReactions

# 1. Define reaction
rxn_smarts = '[C:1](=[O:2])[OH:3]>>[C:1](=[O:2])[Cl:3]'  # Acid → acid chloride
rxn = rdChemReactions.ReactionFromSmarts(rxn_smarts)

# 2. Apply to molecule library. Ethanol is in here deliberately: it has no carboxylic
#    acid, so it exercises the no-match path.
acid_smiles_list = ["CC(=O)O", "c1ccccc1C(=O)O", "OC(=O)CCC(=O)O", "CCO"]
acids = [dm.to_mol(smi) for smi in acid_smiles_list]
acid_chlorides = []

for acid in acids:
    try:
        products = dm.reactions.apply_reaction(
            rxn,
            (acid,),                    # Single reactant as tuple
            single_product_group=True,  # [Mol] rather than the default [[Mol]]
            sanitize=True,
        )
        acid_chlorides.append(products)
    except Exception as e:
        print(f"Reaction failed: {e}")

# 3. Validate products. A reactant that does not match returns an EMPTY LIST, not None
#    and not an exception — so filter on emptiness. `if p is not None` keeps everything.
valid_products = [p for p in acid_chlorides if p]
print([dm.to_smiles(p[0]) for p in valid_products])
# ['CC(=O)Cl', 'O=C(Cl)c1ccccc1', 'O=C(O)CCC(=O)Cl']  — ethanol dropped out
```

Note the third product. Succinic acid has **two** carboxylic acids, and
`single_product_group=True` keeps only the first product group, so what comes back is the
mono-acid-chloride `O=C(O)CCC(=O)Cl`, not the di-chloride. Drop `single_product_group` (or set
it False) to see every group the reaction found, at the cost of the extra nesting level.

### Key Concepts

- **SMARTS**: SMiles ARbitrary Target Specification - pattern language for reactions
- **Atom Mapping**: Numbers like [C:1] preserve atom identity through reaction
- **Attachment Points**: [1*] represents generic connection points
- **Reaction Validation**: Not all SMARTS reactions are chemically reasonable

---

## Data Module (`datamol.data`)

The data module provides convenient access to curated molecular datasets for testing and learning.

### Available Datasets

#### `dm.data.cdk2(as_df=True, mol_column='mol')`
RDKit CDK2 dataset - kinase inhibitor data.
- **Parameters**:
  - `as_df`: Return as DataFrame (True) or list of molecules (False)
  - `mol_column`: Name for molecule column
- **Returns**: Dataset with molecular structures and activity data
- **Use case**: Small dataset for algorithm testing
- **Example**:
  ```python
  cdk2_df = dm.data.cdk2(as_df=True)
  print(cdk2_df.shape)
  print(cdk2_df.columns)
  ```

#### `dm.data.freesolv()`
FreeSolv dataset - experimental and calculated hydration free energies.
- **Contents**: 642 molecules with:
  - IUPAC names
  - SMILES strings
  - Experimental hydration free energy values
  - Calculated values
- **Warning**: "Only meant to be used as a toy dataset for pedagogic and testing purposes"
- **Not suitable for**: Benchmarking or production model training
- **Example**:
  ```python
  freesolv_df = dm.data.freesolv()
  # Columns: iupac, smiles, expt (kcal/mol), calc (kcal/mol)
  ```

#### `dm.data.solubility(as_df=True, mol_column='mol')`
RDKit solubility dataset with train/test splits.
- **Contents**: Aqueous solubility data with pre-defined splits
- **Columns**: `mol`, `ID`, `NAME`, `SOL`, `SOL_classification`, `smiles`, `split` — the
  target is `SOL`, and `split` holds `'train'` (1025 rows) or `'test'` (257 rows)
- **Use case**: Testing ML workflows with proper train/test separation
- **Example**:
  ```python
  import numpy as np

  sol_df = dm.data.solubility(as_df=True)

  # Split into train/test
  train_df = sol_df[sol_df['split'] == 'train']
  test_df = sol_df[sol_df['split'] == 'test']

  # Use for model development. dm.to_fp takes one molecule, not a Series.
  X_train = np.array([dm.to_fp(mol) for mol in train_df['mol']])
  y_train = train_df['SOL']
  ```

### Usage Guidelines

**For testing and tutorials**:
```python
# Quick dataset for testing code
df = dm.data.cdk2()
mols = df['mol'].tolist()

# Test descriptor calculation (add batch_size="auto" if you pass n_jobs > 1)
descriptors_df = dm.descriptors.batch_compute_many_descriptors(mols)

# Test clustering — the return is a 2-tuple, not a list of clusters
cluster_indices, mol_clusters = dm.cluster_mols(mols, cutoff=0.3)
```

**For learning workflows**:
```python
# Complete ML pipeline example
import numpy as np

sol_df = dm.data.solubility()
# columns: mol, ID, NAME, SOL, SOL_classification, smiles, split
# The target column is SOL (log solubility), and the split column is already there:
# 1025 train / 257 test.

# Preprocessing
train = sol_df[sol_df['split'] == 'train']
test = sol_df[sol_df['split'] == 'test']

# Featurization. dm.to_fp takes ONE molecule — handing it a pandas Series raises
# a Boost.Python.ArgumentError. Map it over the column instead.
X_train = np.array([dm.to_fp(mol) for mol in train['mol']])
X_test = np.array([dm.to_fp(mol) for mol in test['mol']])

# Model training (example; scikit-learn is a PyPI dependency, not a bundled skill script)
from sklearn.ensemble import RandomForestRegressor  # third-party library
model = RandomForestRegressor(random_state=0)
model.fit(X_train, train['SOL'])
predictions = model.predict(X_test)
```

### Important Notes

- **Toy Datasets**: Designed for pedagogical purposes, not production use
- **Small Size**: Limited number of compounds suitable for quick tests
- **Pre-processed**: Data already cleaned and formatted
- **Citations**: Check dataset documentation for proper attribution if publishing

### Best Practices

1. **Use for development only**: Don't draw scientific conclusions from toy datasets
2. **Validate on real data**: Always test production code on actual project data
3. **Proper attribution**: Cite original data sources if using in publications
4. **Understand limitations**: Know the scope and quality of each dataset
