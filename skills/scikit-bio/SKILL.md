---
name: scikit-bio
description: Biological data analysis with scikit-bio — sequence handling, alignments, phylogenetic trees, alpha and beta diversity including UniFrac, ordination (PCoA), and PERMANOVA. Built for microbiome work.
category: analysis
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.1.0
try-it: pending
tags: [microbiome, diversity, unifrac, ordination, permanova]
allowed-tools: Read, Write, Edit, Bash
verified: pending
---
# scikit-bio

## Overview

scikit-bio is a comprehensive Python library for working with biological data. Apply this skill for bioinformatics analyses spanning sequence manipulation, alignment, phylogenetics, microbial ecology, and multivariate statistics.

Everything below was executed against **scikit-bio 0.7.3** (released 1 June 2026) on Python 3.11. It requires **Python 3.10+ and NumPy 2.0+** — 0.7.1 dropped both Python 3.9 and NumPy 1.x — and installs from a pre-compiled wheel on most platforms.

## When to Use This Skill

This skill should be used when the user:
- Works with biological sequences (DNA, RNA, protein)
- Needs to read/write biological file formats (FASTA, FASTQ, GenBank, Newick, BIOM, etc.)
- Performs sequence alignments or searches for motifs
- Constructs or analyzes phylogenetic trees
- Calculates diversity metrics (alpha/beta diversity, UniFrac distances)
- Performs ordination analysis (PCoA, CCA, RDA)
- Runs statistical tests on biological/ecological data (PERMANOVA, ANOSIM, Mantel)
- Analyzes microbiome or community ecology data
- Works with protein embeddings from language models
- Needs to manipulate biological data tables

## Core Capabilities

### 1. Sequence Manipulation

Work with biological sequences using specialized classes for DNA, RNA, and protein data.

**Key operations:**
- Read/write sequences from FASTA, FASTQ, GenBank, EMBL formats
- Sequence slicing, concatenation, and searching
- Reverse complement, transcription (DNA→RNA), and translation (RNA→protein)
- Find motifs and patterns using regex
- Calculate distances (Hamming, k-mer based)
- Handle sequence quality scores and metadata

**Common patterns:**
```python
import skbio

# Read sequences from file
seq = skbio.DNA.read('input.fasta')

# Sequence operations
rc = seq.reverse_complement()
rna = seq.transcribe()
protein = rna.translate()

# Find motifs. The regex MUST contain a capture group — without one the
# generator yields nothing and reports no error.
motif_positions = list(seq.find_with_regex('(ATG[ACGT]{3})'))

# Check for properties
has_degens = seq.has_degenerates()
seq_no_gaps = seq.degap()
```

**Important notes:**
- Use `DNA`, `RNA`, `Protein` classes for grammared sequences with validation
- Use `Sequence` class for generic sequences without alphabet restrictions
- `find_with_regex` returns a generator of `slice` objects and only matches on **captured groups**. `'ATG[ACGT]{3}'` silently returns nothing; `'(ATG[ACGT]{3})'` returns the slices. This fails quietly, so wrap patterns in parentheses by default
- Reading FASTQ requires `variant=` or `phred_offset=` — the reader raises `ValueError` rather than assuming an encoding. `phred_offset=33` matches modern Illumina output
- Metadata types: sequence-level (ID, description), positional (per-base), interval (regions/features)

### 2. Sequence Alignment

Perform pairwise and multiple sequence alignments using the `pair_align` engine (introduced in scikit-bio 0.7.0), a versatile and efficient dynamic-programming aligner.

**Key capabilities:**
- Global, local, and semi-global alignment (free ends configurable) in one function
- Convenience wrappers `pair_align_nucl` (BLASTN-like) and `pair_align_prot` (BLASTP-like)
- Configurable scoring: match/mismatch tuple or named substitution matrix; linear or affine gap penalties
- `PairAlignPath` results carry CIGAR strings and convert to aligned sequences
- Multiple sequence alignment storage and manipulation with `TabularMSA`

**Common patterns:**
```python
from skbio import DNA, Protein
from skbio.alignment import pair_align_nucl, pair_align_prot, pair_align, TabularMSA

# Nucleotide alignment with BLASTN-like defaults
seq1, seq2 = DNA('ACTACCAGATTACTTACGGATCAGG'), DNA('CGAAACTACTAGATTACGGATCTTA')
aln = pair_align_nucl(seq1, seq2)
aln.score                                  # alignment score (float)
path = aln.paths[0]                        # PairAlignPath (repr shows CIGAR)
cigar = path.to_cigar()                    # e.g. '7I4M8D' — a method, not an attribute
aligned_seqs = path.to_aligned((seq1, seq2))  # list of gapped strings

# Build a TabularMSA from the alignment path + original sequences
msa = TabularMSA.from_path_seqs(path, (seq1, seq2))

# Customize the algorithm via pair_align (default mode='global')
aln = pair_align(seq1, seq2, mode='local')                       # Smith-Waterman
aln = pair_align(seq1, seq2, sub_score=(2, -3), gap_cost=(5, 2)) # affine gaps
aln = pair_align(seq1, seq2, sub_score='NUC.4.4', gap_cost=3)    # substitution matrix, linear gap

# Protein alignment (BLASTP-like, BLOSUM62)
aln = pair_align_prot(Protein('HEAGAWGHEE'), Protein('PAWHEAE'))

# Read a multiple alignment from file and summarize
msa = TabularMSA.read('alignment.fasta', constructor=DNA)
consensus = msa.consensus()
conservation = msa.conservation()   # per-position conservation, NaN on all-gap columns
gap_freqs = msa.gap_frequencies(axis='position')
```

**Important notes:**
- `pair_align` replaces the removed SSW wrapper (`local_pairwise_align_ssw`, `StripedSmithWaterman`) and the deprecated pure-Python aligners (`global_pairwise_align`, `local_pairwise_align_nucleotide`, etc.)
- The result is a `PairAlignResult` that also unpacks as `score, paths, matrices` (use `keep_matrices=True` to retain the DP matrix)
- `sub_score` accepts a `(match, mismatch)` tuple or a matrix name (e.g., `'NUC.4.4'`, `'BLOSUM62'`); `gap_cost` accepts a single number (linear) or `(open, extend)` tuple (affine)
- The CIGAR string comes from `path.to_cigar()`; there is no `.cigar` attribute. Parse external CIGAR strings with `PairAlignPath.from_cigar('1I8M2D5M2I')`, and score an existing alignment with `align_score(...)`
- `TabularMSA` carries `consensus()`, `conservation()` and `gap_frequencies()`. It has no `majority_consensus()`, `position_entropies()` or `omit_gap_positions()` — filter gappy columns from `gap_frequencies(axis='position', relative=True)` instead

### Evolutionary distances from an alignment

`skbio.sequence.distance` (0.7.2) turns an alignment into the corrected distances that
tree building expects, and `align_dists` applies one across a whole MSA. `metric` is
required — there is no default.

```python
from skbio import DNA
from skbio.alignment import TabularMSA, align_dists
from skbio.sequence.distance import jc69, k2p, tn93, logdet, pdist
from skbio.tree import nj

msa = TabularMSA([DNA('ACGTACGTAC'), DNA('ACGTACGTTC'), DNA('ACGAACGTTG')],
                 index=['s1', 's2', 's3'])

dm = align_dists(msa, metric='k2p')   # DistanceMatrix, ready for tree building
tree = nj(dm)

# Or one pair at a time; gamma= models among-site rate heterogeneity (0.7.3)
d = jc69(DNA('ACGTACGTAC'), DNA('ACGTACGTTC'))
d_gamma = jc69(DNA('ACGTACGTAC'), DNA('ACGTACGTTC'), gamma=0.5)
```

Available metrics: `pdist` (uncorrected p-distance), `jc69`, `f81`, `k2p`, `f84`,
`tn93`, `logdet` and `paralin`. Gamma correction is supported by `jc69`, `f81`, `k2p`
and `tn93`.

### 3. Phylogenetic Trees

Construct, manipulate, and analyze phylogenetic trees representing evolutionary relationships.

**Key capabilities:**
- Tree construction from distance matrices (UPGMA/WPGMA, Neighbor Joining, GME, BME)
- Tree rearrangement with nearest neighbor interchange (`nni`)
- Tree manipulation (pruning, rerooting, traversal)
- Distance calculations (patristic via `cophenet`, Robinson-Foulds via `compare_rfd`)
- ASCII visualization
- Newick format I/O

**Common patterns:**
```python
import numpy as np
from skbio import TreeNode, DistanceMatrix
from skbio.tree import nj, upgma, gme, bme, rf_dists

# Read tree from file
tree = TreeNode.read('tree.nwk')

# Construct tree from distance matrix
distance_matrix = DistanceMatrix(
    np.array([[0, 5, 9, 9], [5, 0, 10, 10], [9, 10, 0, 8], [9, 10, 8, 0]], dtype=float),
    ids=['OTU1', 'OTU2', 'OTU3', 'OTU4'])
tree = nj(distance_matrix)

# Tree operations
subtree = tree.shear(['OTU1', 'OTU2', 'OTU3'])
tips = [node for node in tree.tips()]
lca = tree.lca(['OTU1', 'OTU2'])

# Calculate distances
patristic_dist = tree.find('OTU1').distance(tree.find('OTU2'))
cophenetic_dm = tree.cophenet()           # patristic distance matrix among tips

# Compare two trees (Robinson-Foulds)
other_tree = upgma(distance_matrix)
rf_distance = tree.compare_rfd(other_tree)
# Pairwise RF distances among many trees -> DistanceMatrix
rf_dm = rf_dists([tree, other_tree, bme(distance_matrix)])

# Build a tree from taxonomic lineages; extract_rank=True strips rank prefixes (0.7.3)
lineages = [('otu1', ['k__Bacteria', 'p__Firmicutes', 'g__Bacillus']),
            ('otu2', ['k__Bacteria', 'p__Firmicutes', 'g__Clostridium'])]
taxonomy_tree = TreeNode.from_taxonomy(lineages, extract_rank=True)
```

**Important notes:**
- Use `nj()` for neighbor joining (classic phylogenetic method)
- Use `upgma()` for UPGMA/WPGMA (assumes molecular clock)
- GME and BME are highly scalable for large trees; refine topology with `nni()`. `bme` parallelizes by default since 0.7.3, and `nni()` raises on a tree whose root has a single child
- `shear()` returns the sheared tree even when `inplace=True` (0.7.2), so the return value is safe to use either way
- Tips with `name is None` are excluded from `subset`, `subsets`, `bipart` and `cophenet` as of 0.7.2 — name every tip you expect to be counted
- `cophenet()` (formerly `tip_tip_distances`) returns the patristic distance matrix; `compare_rfd()` is the Robinson-Foulds method (`compare_wrfd`/`compare_cophenet` for weighted/cophenetic variants)
- `lca()` is the lowest common ancestor; `lowest_common_ancestor` remains as an alias
- Trees can be rooted or unrooted; some metrics require specific rooting

### 4. Diversity Analysis

Calculate alpha and beta diversity metrics for microbial ecology and community analysis.

**Key capabilities:**
- Alpha diversity: richness (`sobs`, `observed_features`, `chao1`, `ace`), Shannon, Simpson, Hill numbers (`hill`), Faith's PD (`faith_pd`), generalized PD (`phydiv`), Pielou's evenness
- Beta diversity: Bray-Curtis, Jaccard, weighted/unweighted UniFrac, Euclidean distances
- Phylogenetic diversity metrics (require tree input)
- Rarefaction and subsampling
- Integration with ordination and statistical tests

**Common patterns:**
```python
from skbio.diversity import alpha_diversity, beta_diversity

# Alpha diversity (phylogenetic metrics take taxa= for tip-name mapping)
alpha = alpha_diversity('shannon', counts_matrix, ids=sample_ids)
faith_pd = alpha_diversity('faith_pd', counts_matrix, ids=sample_ids,
                           tree=tree, taxa=feature_ids)

# Beta diversity
bc_dm = beta_diversity('braycurtis', counts_matrix, ids=sample_ids)
unifrac_dm = beta_diversity('unweighted_unifrac', counts_matrix,
                            ids=sample_ids, tree=tree, taxa=feature_ids)

# Get available metrics
from skbio.diversity import get_alpha_diversity_metrics, get_beta_diversity_metrics
print(get_alpha_diversity_metrics())
print(get_beta_diversity_metrics())

# Rarefy to an even depth (subsample_counts lives in skbio.stats, not skbio.diversity)
from skbio.stats import subsample_counts
rarefied = subsample_counts(counts_matrix[0], n=10)
```

**Important notes:**
- Counts must be integers representing abundances, not relative frequencies
- The phylogenetic-metric argument is `taxa=` (renamed from `otu_ids` in 0.6.0; the old name is a deprecated alias); `observed_otus` is now `observed_features` (or `sobs`)
- `counts_matrix` may be any table-like input (NumPy array, pandas/polars DataFrame, BIOM `Table`, or AnnData) via the dispatch system
- Phylogenetic metrics (Faith's PD, UniFrac) require tree and taxa-to-tip mapping
- Pass UniFrac **as a string**, not as an imported callable — a callable routes to a much slower implementation and emits a `UserWarning` saying so (0.7.3)
- `partial_beta_diversity()` and `block_beta_diversity()` accept only a **callable** metric or an optimized UniFrac name; a string like `'braycurtis'` raises `ValueError`. Pass `scipy.spatial.distance.braycurtis` instead. `partial_beta_diversity` has also been deprecated since 0.5.0 and fills uncalculated pairs with zeros, which reads as "identical samples" — prefer a full `beta_diversity` unless the matrix is genuinely too large
- `sokalmichener` was removed from the beta-diversity metrics in 0.7.2, following its removal from SciPy 1.17; `rogerstanimoto` is the upstream-recommended replacement
- Alpha diversity returns a `pandas.Series`, beta diversity returns a `DistanceMatrix`

### 5. Ordination Methods

Reduce high-dimensional biological data to visualizable lower-dimensional spaces.

**Key capabilities:**
- PCoA (Principal Coordinate Analysis) from distance matrices
- CA (Correspondence Analysis) for contingency tables
- CCA (Canonical Correspondence Analysis) with environmental constraints
- RDA (Redundancy Analysis) for linear relationships
- MMvec joint embeddings of two co-occurring feature sets
- Biplot projection for feature interpretation

**Common patterns:**
```python
from skbio.stats.ordination import pcoa, cca
import skbio

# PCoA from distance matrix (limit dimensions for large matrices)
pcoa_results = pcoa(distance_matrix, dimensions=3)
pc1 = pcoa_results.samples['PC1']
pc2 = pcoa_results.samples['PC2']

# Built-in scatter plot; centroids and confidence ellipses added in 0.7.2.
# Ellipses are 2D only, so name the two axes to draw when the result has more.
fig = pcoa_results.plot(sample_metadata, column='bodysite', axes=[0, 1],
                        centroids=True, confidence_ellipses=True)

# CCA with environmental variables. The keyword is feature_ids, not species_ids
cca_results = cca(species, env,
                  sample_ids=['Site1', 'Site2', 'Site3'],
                  feature_ids=['SpeciesA', 'SpeciesB', 'SpeciesC'])

# Save/load ordination results
pcoa_results.write('ordination.txt')
results = skbio.OrdinationResults.read('ordination.txt')
```

Learn a joint embedding of two feature sets measured on the same samples — microbes
and metabolites, say — with `mmvec` (0.7.3):

```python
import numpy as np
import pandas as pd
from skbio.stats.ordination import mmvec

rng = np.random.default_rng(0)
samples = [f'S{i}' for i in range(15)]
microbe_table = pd.DataFrame(rng.integers(0, 30, size=(15, 5)),
                             index=samples, columns=[f'B{i}' for i in range(5)])
metabolite_table = pd.DataFrame(rng.integers(0, 30, size=(15, 6)),
                                index=samples, columns=[f'M{i}' for i in range(6)])

result = mmvec(microbe_table, metabolite_table, dimensions=2, max_iter=200, seed=42)
result.ranks          # conditional ranks: microbes x metabolites
result.x_embeddings   # per-microbe latent coordinates
predicted = result.predict(microbe_table)
```

**Important notes:**
- PCoA works with any distance/dissimilarity matrix; pass `dimensions` as an int (count) or a float in (0, 1] (fraction of cumulative variance to retain)
- `OrdinationResults` exposes pandas-based attributes: `samples`, `features`, `eigvals`, `proportion_explained`, `biplot_scores`, `sample_constraints`. These are indexed by axis *name*, so read positions with `.iloc[0]` — `proportion_explained[0]` raises `KeyError` under pandas 3, which 0.7.2 added support for
- `cca()` and `rda()` take `y` (community table) then `x` (constraints), and label axes with `sample_ids`, `feature_ids` and `constraint_ids`
- CCA reveals environmental drivers of community composition
- `OrdinationResults.plot()` produces a matplotlib figure; results also integrate with seaborn/plotly

### 6. Statistical Testing

Perform hypothesis tests specific to ecological and biological data.

**Key capabilities:**
- PERMANOVA: test group differences using distance matrices
- ANOSIM: alternative test for group differences
- PERMDISP: test homogeneity of group dispersions
- Mantel test: correlation between distance matrices
- Bioenv: find environmental variables correlated with distances
- Differential abundance: `ancombc` (bias-corrected, 0.7.1), `struc_zero`, `ancom`, `dirmult_ttest`, and `dirmult_lme` (longitudinal mixed-effects) in `skbio.stats.composition`

**Common patterns:**
```python
from skbio.stats.distance import permanova, anosim, mantel

# Test if groups differ significantly
permanova_results = permanova(distance_matrix, grouping, permutations=999)
print(f"p-value: {permanova_results['p-value']}")

# ANOSIM test
anosim_results = anosim(distance_matrix, grouping, permutations=999)

# Mantel test between two distance matrices
mantel_results = mantel(dm1, dm2, method='pearson', permutations=999)
print(f"Correlation: {mantel_results[0]}, p-value: {mantel_results[1]}")

# Differential abundance on a feature table (raw counts recommended).
# treatment= and reference= must be values that appear in the grouping.
import numpy as np
import pandas as pd
from skbio.stats.composition import dirmult_ttest

rng = np.random.default_rng(0)
samples = [f'S{i}' for i in range(12)]
feature_table = pd.DataFrame(rng.integers(1, 60, size=(12, 6)),
                             index=samples, columns=[f'F{i}' for i in range(6)])
sample_groups = pd.Series(['control'] * 6 + ['treated'] * 6, index=samples)

da = dirmult_ttest(feature_table, sample_groups,
                   treatment='treated', reference='control')
```

ANCOM-BC corrects the sampling-fraction bias that ANCOM ignores, and takes a metadata
frame plus a formula rather than a bare grouping vector:

```python
import numpy as np
import pandas as pd
from skbio.stats.composition import ancombc, struc_zero, rclr

rng = np.random.default_rng(0)
samples = [f'S{i}' for i in range(12)]
feature_table = pd.DataFrame(rng.integers(1, 60, size=(12, 6)),
                             index=samples, columns=[f'F{i}' for i in range(6)])
sample_metadata = pd.DataFrame({'group': ['control'] * 6 + ['treated'] * 6},
                               index=samples)

res = ancombc(feature_table, sample_metadata, 'group')
res.loc[:, ['Log2(FC)', 'qvalue', 'Signif']]     # indexed by (FeatureID, Covariate)

# Features absent from an entire group ("structural zeros"), which bias the above
zeros = struc_zero(feature_table, sample_metadata, 'group')

# Robust CLR: transform only the observed (non-zero) values (0.7.3)
transformed = rclr(feature_table.values)
```

**Important notes:**
- Permutation tests provide non-parametric significance testing
- Use 999+ permutations for robust p-values
- PERMANOVA sensitive to dispersion differences; pair with PERMDISP
- **`permdisp` raises `ValueError: Invalid operation: cannot extend distance matrix size` on any distance matrix with fewer than 10 samples in 0.7.3.** Its `dimensions` default is 10 and it passes that straight to `pcoa`, which refuses to return more axes than the matrix has samples. Pass `dimensions=0` to use every axis, or any value ≤ the sample count
- Mantel tests assess matrix correlation (e.g., geographic vs genetic distance); `mantel` and `permanova` accept condensed-form distance matrices as of 0.7.2
- Supply differential-abundance tests with raw counts, not pre-normalized proportions, to preserve magnitude information

### 7. File I/O and Format Conversion

Read and write 19+ biological file formats with automatic format detection.

**Supported formats:**
- Sequences: FASTA, FASTQ, GenBank, EMBL, QSeq
- Alignments: Clustal, PHYLIP, Stockholm
- Trees: Newick
- Tables: BIOM (HDF5 and JSON)
- Distances: delimited square matrices (`lsmat`), PHYLIP distance matrices (`phylip_dm`, 0.7.2)
- Analysis: BLAST+6/7, GFF3, Ordination results
- Metadata: TSV/CSV with validation

**Common patterns:**
```python
import skbio

# Read with automatic format detection
seq = skbio.DNA.read('file.fasta', format='fasta')
tree = skbio.TreeNode.read('tree.nwk')

# Write to file
seq.write('output.fasta', format='fasta')

# Generator for large files (memory efficient)
for seq in skbio.io.read('large.fasta', format='fasta', constructor=skbio.DNA):
    process(seq)

# Convert formats. FASTQ needs an explicit quality encoding, and skbio.io.write
# takes a generator — a list or an iterator over one raises UnrecognizedFormatError.
seqs = list(skbio.io.read('input.fastq', format='fastq',
                          constructor=skbio.DNA, phred_offset=33))
skbio.io.write((s for s in seqs), format='fasta', into='output.fasta')
```

**Important notes:**
- Use generators for large files to avoid memory issues
- `skbio.io.write` dispatches on the *type* of what you hand it. A `list` (or an iterator built with `iter()`) has no registered writer; wrap it in a generator expression, or call `.write()` on a single object
- FASTQ reading requires `variant=` (e.g. `'illumina1.8'`) or `phred_offset=` (33 for modern data); without one the reader raises `ValueError`
- Format can be auto-detected when `into` parameter specified
- Support for stdin/stdout piping with `verify=False`

### 8. Distance Matrices

Create and manipulate distance/dissimilarity matrices with statistical methods.

**Key capabilities:**
- Store symmetric (`DistanceMatrix`, hollow diagonal) or general pairwise (`PairwiseMatrix`) data
- ID-based indexing and slicing
- Integration with diversity, ordination, and statistical tests
- Read/write delimited text format

**Common patterns:**
```python
from skbio import DistanceMatrix
import numpy as np

# Create from array
data = np.array([[0, 1, 2], [1, 0, 3], [2, 3, 0]])
dm = DistanceMatrix(data, ids=['A', 'B', 'C'])

# Access distances
dist_ab = dm['A', 'B']
row_a = dm['A']

# Read from file
dm = DistanceMatrix.read('distances.txt')

# Use in downstream analyses
from skbio.stats.ordination import pcoa
from skbio.stats.distance import permanova

grouping = ['Group1'] * (dm.shape[0] // 2) + ['Group2'] * (dm.shape[0] - dm.shape[0] // 2)
pcoa_results = pcoa(dm)
permanova_results = permanova(dm, grouping)
```

**Important notes:**
- `DistanceMatrix` enforces symmetry and a zero (hollow) diagonal; it is a subclass of `SymmetricMatrix`, which can hold its data in condensed form and halve the memory footprint (0.7.1)
- `PairwiseMatrix` (renamed from `DissimilarityMatrix`, which is kept as a deprecated alias) allows general/asymmetric values
- IDs enable integration with metadata and biological knowledge
- Compatible with pandas, numpy, and scikit-learn

### 9. Biological Tables

Work with feature tables (OTU/ASV tables) common in microbiome research.

**Key capabilities:**
- BIOM format I/O (HDF5 and JSON) via the native `Table` class
- Table dispatch system (0.7.0+): functions accept any `table_like` input — BIOM `Table`, pandas/polars DataFrame, NumPy array, or AnnData — without explicit conversion
- Data augmentation techniques (`phylomix`, `mixup`, `aitchison_mixup`, `compos_cutmix`)
- Sample/feature filtering and normalization
- Metadata integration

**Common patterns:**
```python
from skbio import Table
from skbio.diversity import beta_diversity

# Read BIOM table. The format name is 'biom' — 'hdf5' is not a registered
# reader and raises UnrecognizedFormatError. Omitting format sniffs it.
table = Table.read('table.biom', format='biom')

# Access data
sample_ids = table.ids(axis='sample')
feature_ids = table.ids(axis='observation')
counts = table.matrix_data

# Filter (inplace=False leaves the original table untouched)
sample_ids_to_keep = sample_ids[:2]
filtered = table.filter(sample_ids_to_keep, axis='sample', inplace=False)

# Pass table-like objects directly to scikit-bio drivers (dispatch system)
import pandas as pd
df = pd.read_table('data.tsv', index_col=0)   # samples x features
bdiv = beta_diversity('braycurtis', df)         # no manual conversion needed
```

**Important notes:**
- BIOM tables are standard in QIIME 2 workflows
- Rows typically represent samples, columns represent features (OTUs/ASVs)
- Supports sparse and dense representations
- With the dispatch system, functions return the same format as their input, or a user-specified output format

### 10. Protein Embeddings

Work with protein language model embeddings for downstream analysis.

**Key capabilities:**
- Store per-residue embeddings (`ProteinEmbedding`) or one vector per sequence (`ProteinVector`)
- Convert a collection of sequence-level vectors to distance matrices
- Generate ordination objects for visualization
- Export to numpy/pandas for ML workflows

Two classes, and the distinction decides which functions apply. `ProteinEmbedding`
holds one row **per residue** of a single protein. `ProteinVector` holds a single
row for the **whole** protein — the pooled vector most downstream work uses. The
conversion helpers are module-level `embed_vec_*` functions over a *list* of vectors;
the embedding objects themselves have no `to_distances` / `to_ordination` /
`to_array` / `to_dataframe` methods.

**Common patterns:**
```python
import numpy as np
from skbio.embedding import (ProteinEmbedding, ProteinVector,
                             embed_vec_to_distances, embed_vec_to_ordination,
                             embed_vec_to_numpy, embed_vec_to_dataframe)

# Per-residue embedding of one protein: second argument is the SEQUENCE, not IDs
per_residue = ProteinEmbedding(np.random.rand(10, 8), 'ACDEFGHIKL')
per_residue.embedding.shape      # (residues, features)
per_residue.sequence

# One pooled vector per protein — shape (1, n_features) each
vectors = [ProteinVector(np.random.rand(1, 8), seq)
           for seq in ('ACDEFGHIKL', 'ACDEFGHIKM', 'WWWWYYYYFF')]

dm = embed_vec_to_distances(vectors, metric='euclidean')   # DistanceMatrix
ordination = embed_vec_to_ordination(vectors)              # OrdinationResults (PCoA)
array = embed_vec_to_numpy(vectors)                        # (n_sequences, n_features)
df = embed_vec_to_dataframe(vectors)                       # indexed by sequence
```

**Important notes:**
- Embeddings bridge protein language models with traditional bioinformatics
- `embed_vec_to_distances` routes through `beta_diversity`, which rejects negative values — shift or take the absolute value of raw language-model output before calling it, or compute distances with SciPy directly
- The vectors are keyed by their sequence string, so two identical sequences collide; deduplicate before converting
- `SequenceEmbedding` / `SequenceVector` are the generic (non-protein) equivalents
- Useful for sequence clustering, classification, and visualization

## Best Practices

### Installation
```bash
uv pip install "scikit-bio==0.7.3"
```
Requires Python 3.10+ and NumPy 2.0+. Pre-compiled wheels are published for each release since 0.7.0, so most platforms install without a compiler. Conda users can instead run `conda install -c conda-forge scikit-bio`. Nothing here needs an API key, an account or a GPU.

### Performance Considerations
- Use generators for large sequence files to minimize memory usage
- For massive phylogenetic trees, prefer GME or BME over NJ — both were substantially accelerated in 0.7.3, and `bme` parallelizes by default
- Store large distance matrices in condensed form to halve their memory footprint
- BIOM format (HDF5) more efficient than JSON for large tables

### Integration with Ecosystem
- Sequences interoperate with Biopython via standard formats
- Tables integrate with pandas, polars, and AnnData
- Distance matrices compatible with scikit-learn
- Ordination results visualizable with matplotlib/seaborn/plotly
- Works seamlessly with QIIME 2 artifacts (BIOM, trees, distance matrices)

### Common Workflows
1. **Microbiome diversity analysis**: Read BIOM table → Calculate alpha/beta diversity → Ordination (PCoA) → Statistical testing (PERMANOVA)
2. **Phylogenetic analysis**: Read sequences → Align → Build distance matrix → Construct tree → Calculate phylogenetic distances
3. **Sequence processing**: Read FASTQ → Quality filter → Trim/clean → Find motifs → Translate → Write FASTA
4. **Comparative genomics**: Read sequences → Pairwise alignment → Calculate distances → Build tree → Analyze clades

## Reference Documentation

For detailed API information, parameter specifications, and advanced usage examples, refer to `references/api_reference.md` which contains comprehensive documentation on:
- Complete method signatures and parameters for all capabilities
- Extended code examples for complex workflows
- Troubleshooting common issues
- Performance optimization tips
- Integration patterns with other libraries

## Additional Resources

- Official documentation: https://scikit.bio/docs/latest/
- GitHub repository: https://github.com/scikit-bio/scikit-bio
- Changelog: https://github.com/scikit-bio/scikit-bio/blob/main/CHANGELOG.md
- Reference paper: "scikit-bio: a fundamental Python library for biological omic data," *Nature Methods* (2025), https://www.nature.com/articles/s41592-025-02981-z
- Forum support: https://forum.qiime2.org (scikit-bio is part of QIIME 2 ecosystem)

