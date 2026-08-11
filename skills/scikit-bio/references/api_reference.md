# scikit-bio API Reference

This document provides detailed API information, advanced examples, and troubleshooting guidance for working with scikit-bio. Every code block here was executed against **scikit-bio 0.7.3** on Python 3.11.

## Table of Contents
1. [Sequence Classes](#sequence-classes)
2. [Alignment Methods](#alignment-methods)
3. [Phylogenetic Trees](#phylogenetic-trees)
4. [Diversity Metrics](#diversity-metrics)
5. [Ordination](#ordination)
6. [Statistical Tests](#statistical-tests)
7. [Distance Matrices](#distance-matrices)
8. [File I/O](#file-io)
9. [Troubleshooting](#troubleshooting)

## Sequence Classes

### DNA, RNA, and Protein Classes

```python
from skbio import DNA, RNA, Protein, Sequence

# Creating sequences
dna = DNA('ATCGATCG', metadata={'id': 'seq1', 'description': 'Example'})
rna = RNA('AUCGAUCG')
protein = Protein('ACDEFGHIKLMNPQRSTVWY')

# Sequence operations
dna_rc = dna.reverse_complement()  # Reverse complement
rna = dna.transcribe()  # DNA -> RNA
protein = rna.translate()  # RNA -> Protein

# Using genetic code tables
protein = rna.translate(genetic_code=11)  # Bacterial code
```

### Sequence Searching and Pattern Matching

```python
from skbio import DNA

# Find motifs using regex. Only CAPTURED groups are reported: 'ATG.{3}' yields
# nothing at all, silently, while '(ATG.{3})' yields the slices.
dna = DNA('ATGCGATCGATGCATCG')
motif_locs = list(dna.find_with_regex('(ATG.{3})'))
# -> [slice(0, 6), slice(9, 15)]

for loc in motif_locs:
    print(loc.start, str(dna[loc]))

# Find all positions
import re
for match in re.finditer('ATG', str(dna)):
    print(f"ATG found at position {match.start()}")

# k-mer counting
kmers = dna.kmer_frequencies(k=3)
```

### Handling Sequence Metadata

```python
from skbio import DNA

# Sequence-level metadata
dna = DNA('ATCGATCGATCGATCGATCG', metadata={'id': 'seq1', 'source': 'E. coli'})
print(dna.metadata['id'])

# Positional metadata (per-base quality scores from FASTQ)
seqs = DNA.read('reads.fastq', format='fastq', phred_offset=33)
quality_scores = seqs.positional_metadata['quality']

# Interval metadata (features/annotations). Bounds are half-open and must fall
# within the sequence, so this needs a sequence at least 15 bases long.
dna.interval_metadata.add([(5, 15)], metadata={'type': 'gene', 'name': 'geneA'})
```

### Distance Calculations

```python
from functools import partial

from skbio import DNA

seq1 = DNA('ATCGATCG')
seq2 = DNA('ATCG--CG')

# Hamming distance (default)
dist = seq1.distance(seq2)

# Custom distance function. kmer_distance requires k, so bind it before passing.
from skbio.sequence.distance import kmer_distance
dist = seq1.distance(seq2, metric=partial(kmer_distance, k=3))
```

### Evolutionary Distances Between Aligned Sequences

Added in 0.7.2. `align_dists` applies one metric across a whole alignment and returns
a `DistanceMatrix` ready for tree building; `metric` is required.

```python
from skbio import DNA
from skbio.alignment import TabularMSA, align_dists
from skbio.sequence.distance import pdist, jc69, f81, k2p, f84, tn93, logdet, paralin
from skbio.tree import nj

msa = TabularMSA([DNA('ACGTACGTAC'), DNA('ACGTACGTTC'), DNA('ACGAACGTTG')],
                 index=['s1', 's2', 's3'])

dm = align_dists(msa, metric='k2p')
tree = nj(dm)

# Pairwise, with optional gamma correction for rate heterogeneity (0.7.3):
# supported by jc69, f81, k2p and tn93.
d = jc69(DNA('ACGTACGTAC'), DNA('ACGTACGTTC'))
d_gamma = jc69(DNA('ACGTACGTAC'), DNA('ACGTACGTTC'), gamma=0.5)
```

## Alignment Methods

### Pairwise Alignment

scikit-bio 0.7.0 introduced `pair_align`, a single fast engine for global, local, and semi-global alignment. The convenience wrappers `pair_align_nucl` and `pair_align_prot` ship with BLASTN/BLASTP-like scoring. The old SSW wrapper (`local_pairwise_align_ssw`, `StripedSmithWaterman`) was removed, and the pure-Python `global_pairwise_align`/`local_pairwise_align_*` functions are deprecated.

```python
from skbio import DNA, Protein
from skbio.alignment import pair_align_nucl, pair_align_prot, pair_align, align_score

# Nucleotide alignment with BLASTN-like defaults
seq1 = DNA('ATCGATCGATCG')
seq2 = DNA('ATCGGGGATCG')
aln = pair_align_nucl(seq1, seq2)

# Inspect the result (PairAlignResult: score + paths [+ matrices])
print(f"Score: {aln.score}")
path = aln.paths[0]                       # PairAlignPath; repr shows the CIGAR
aligned_seqs = path.to_aligned((seq1, seq2))   # list of gapped strings

# Global alignment with custom affine scoring via pair_align
aln = pair_align(
    seq1, seq2,
    mode='global',          # 'global' (default), 'local', or semi-global via free_ends
    sub_score=(2, -3),      # (match, mismatch)
    gap_cost=(5, 2),        # (open, extend) -> affine; a single number -> linear
)

# Use a named substitution matrix instead of match/mismatch scores
aln = pair_align(seq1, seq2, mode='global', sub_score='NUC.4.4', gap_cost=3)

# Protein alignment with BLASTP-like defaults (BLOSUM62)
protein_query = Protein('ACDEFGHIKLMNPQRSTVWY')
protein_target = Protein('ACDEFMNPQRSTVWY')
aln = pair_align_prot(protein_query, protein_target)

# Re-score an existing alignment with the same parameters
score = align_score((aln.paths[0], (protein_query, protein_target)),
                    sub_score='BLOSUM62', gap_cost=(11, 1))

# PairAlignResult also unpacks as a tuple
score, (path,), _ = pair_align_nucl(seq1, seq2)
```

### Multiple Sequence Alignment

```python
from skbio.alignment import TabularMSA, pair_align_nucl
from skbio import DNA

# Read MSA from file
msa = TabularMSA.read('alignment.fasta', constructor=DNA)

# Build a TabularMSA from a pairwise alignment path + original sequences
score, (path,), _ = pair_align_nucl(DNA('ATCGATCG'), DNA('ATCGGGGATCG'))
msa = TabularMSA.from_path_seqs(path, (DNA('ATCGATCG'), DNA('ATCGGGGATCG')))

# Create MSA manually
seqs = [
    DNA('ATCG--'),
    DNA('ATGG--'),
    DNA('ATCGAT')
]
msa = TabularMSA(seqs)

# MSA operations
consensus = msa.consensus()

# Per-position conservation (NaN where a column is all gaps)
conservation = msa.conservation()

# Access sequences
first_seq = msa[0]
column = msa[:, 2]  # Third column

# Gap load per position or per sequence. There is no omit_gap_positions() or
# position_entropies() on TabularMSA — select columns yourself.
gap_freqs = msa.gap_frequencies(axis='position', relative=True)
keep = [i for i, f in enumerate(gap_freqs) if f <= 0.5]
degapped_msa = msa[:, keep]
```

### CIGAR Strings and Alignment Paths

```python
from skbio.alignment import PairAlignPath, AlignPath, pair_align_nucl
from skbio import DNA

# Parse a CIGAR string into a pairwise alignment path
path = PairAlignPath.from_cigar('10M2I5M3D10M')
print(repr(path))   # <PairAlignPath, ..., CIGAR: '10M2I5M3D10M'>

# A path produced by pair_align can emit its CIGAR. It is a method,
# to_cigar(); there is no .cigar attribute.
aln = pair_align_nucl(DNA('ATCGATCG'), DNA('ATCGGGGATCG'))
cigar_string = aln.paths[0].to_cigar()

# AlignPath generalizes to >2 sequences (e.g., from aligned strings)
path3 = AlignPath.from_aligned(['CGTCGTGC', 'CA--GT-C', 'CGTCGT-T'])

# Parse CIGAR output from external tools such as parasail
# path = PairAlignPath.from_cigar(res.cigar.decode)
```

## Phylogenetic Trees

### Tree Construction

```python
from skbio import TreeNode, DistanceMatrix
from skbio.tree import nj, upgma

# Distance matrix
dm = DistanceMatrix([[0, 5, 9, 9],
                     [5, 0, 10, 10],
                     [9, 10, 0, 8],
                     [9, 10, 8, 0]],
                    ids=['A', 'B', 'C', 'D'])

# Neighbor joining
nj_tree = nj(dm)

# UPGMA (assumes molecular clock)
upgma_tree = upgma(dm)

# Balanced Minimum Evolution (scalable for large trees)
from skbio.tree import bme
bme_tree = bme(dm)
```

### Tree Manipulation

The fixture tree used below is
`(((OTU1:0.1,OTU2:0.2)n1:0.3,(OTU3:0.15,OTU4:0.25)n2:0.35)root:0.0);`.

```python
from skbio import TreeNode

# Read tree
tree = TreeNode.read('tree.nwk', format='newick')

# Traversal
for node in tree.traverse():
    print(node.name)

# Preorder, postorder, levelorder
for node in tree.preorder():
    print(node.name)

# Get tips only
tips = list(tree.tips())

# Find specific node
node = tree.find('OTU1')

# Root tree at midpoint
rooted_tree = tree.root_at_midpoint()

# Prune tree to specific taxa. shear() returns the pruned tree whether or not
# inplace=True (0.7.2), and every name must already be in the tree.
pruned = tree.shear(['OTU1', 'OTU2', 'OTU3'])

# Get subtree
lca = tree.lowest_common_ancestor(['OTU1', 'OTU2'])
subtree = lca.copy()

# Add/remove nodes
parent = tree.find('n1')
child = TreeNode(name='new_child', length=0.5)
parent.append(child)

# Remove node
node_to_remove = tree.find('new_child')
node_to_remove.parent.remove(node_to_remove)
```

### Tree Distances and Comparisons

```python
from skbio import TreeNode

tree = TreeNode.read('tree.nwk', format='newick')
other_tree = TreeNode.read(
    ['(((OTU1:0.1,OTU3:0.2)m1:0.3,(OTU2:0.15,OTU4:0.25)m2:0.35)root:0.0);'])
third_tree = TreeNode.read(
    ['(((OTU4:0.1,OTU3:0.2)k1:0.3,(OTU2:0.15,OTU1:0.25)k2:0.35)root:0.0);'])

# Patristic distance (branch-length distance) between two nodes
node1 = tree.find('OTU1')
node2 = tree.find('OTU2')
patristic = node1.distance(node2)

# Cophenetic (patristic) distance matrix among all tips
# cophenet() replaces the former tip_tip_distances()
cophenetic_dm = tree.cophenet()

# Robinson-Foulds distance between two trees (compare_rfd, added in 0.6.3)
rf_dist = tree.compare_rfd(other_tree)              # count (float)
rf_prop = tree.compare_rfd(other_tree, proportion=True)  # normalized to [0, 1]

# Weighted Robinson-Foulds and cophenetic-correlation comparisons
wrf = tree.compare_wrfd(other_tree)
coph = tree.compare_cophenet(other_tree)

# Pairwise RF distances among many trees -> DistanceMatrix
from skbio.tree import rf_dists
rf_dm = rf_dists([tree, other_tree, third_tree])
```

### Tree Visualization

```python
# ASCII art visualization
print(tree.ascii_art())

# For advanced visualization, export to external tools
tree.write('tree.nwk', format='newick')

# Then use ete3, toytree, or ggtree for publication-quality figures
```

## Diversity Metrics

### Alpha Diversity

```python
from skbio.diversity import alpha_diversity, get_alpha_diversity_metrics
import numpy as np

# Sample count data (samples x features)
counts = np.array([
    [10, 5, 0, 3],
    [2, 0, 8, 4],
    [5, 5, 5, 5]
])
sample_ids = ['Sample1', 'Sample2', 'Sample3']

# List available metrics
print(get_alpha_diversity_metrics())

# Calculate various alpha diversity metrics
shannon = alpha_diversity('shannon', counts, ids=sample_ids)
simpson = alpha_diversity('simpson', counts, ids=sample_ids)
observed = alpha_diversity('observed_features', counts, ids=sample_ids)  # was 'observed_otus'
chao1 = alpha_diversity('chao1', counts, ids=sample_ids)
hill_q2 = alpha_diversity('hill', counts, ids=sample_ids)  # effective number of species

# Phylogenetic alpha diversity (requires tree). Note: taxa= replaces otu_ids=
from skbio import TreeNode

tree = TreeNode.read('tree.nwk')
feature_ids = ['OTU1', 'OTU2', 'OTU3', 'OTU4']

faith_pd = alpha_diversity('faith_pd', counts, ids=sample_ids,
                           tree=tree, taxa=feature_ids)
```

### Beta Diversity

```python
from skbio.diversity import beta_diversity, partial_beta_diversity

# Beta diversity (all pairwise comparisons)
bc_dm = beta_diversity('braycurtis', counts, ids=sample_ids)

# Jaccard (presence/absence)
jaccard_dm = beta_diversity('jaccard', counts, ids=sample_ids)

# Phylogenetic beta diversity (taxa= replaces the deprecated otu_ids=)
unifrac_dm = beta_diversity('unweighted_unifrac', counts,
                            ids=sample_ids,
                            tree=tree,
                            taxa=feature_ids)

weighted_unifrac_dm = beta_diversity('weighted_unifrac', counts,
                                     ids=sample_ids,
                                     tree=tree,
                                     taxa=feature_ids)

# Compute only specific pairs. The metric must be a CALLABLE (or an optimized
# UniFrac name) — a string like 'braycurtis' raises ValueError. Uncalculated
# pairs come back as 0.0, which is indistinguishable from "identical samples",
# and the function has been deprecated since 0.5.0.
from scipy.spatial.distance import braycurtis

pairs = [('Sample1', 'Sample2'), ('Sample1', 'Sample3')]
partial_dm = partial_beta_diversity(braycurtis, counts,
                                   ids=sample_ids,
                                   id_pairs=pairs)
```

### Rarefaction and Subsampling

```python
# subsample_counts lives in skbio.stats, not skbio.diversity
from skbio.stats import subsample_counts
from skbio.diversity import alpha_diversity

# Rarefy to an even depth no deeper than the shallowest sample
min_depth = int(counts.sum(axis=1).min())
rarefied = [subsample_counts(row, n=min_depth) for row in counts]

# Multiple rarefactions for confidence intervals
import numpy as np
rarefactions = []
for i in range(100):
    rarefied_counts = np.array([subsample_counts(row, n=min_depth) for row in counts])
    shannon_rare = alpha_diversity('shannon', rarefied_counts)
    rarefactions.append(shannon_rare.to_numpy())

# Calculate mean and std across replicates (stack the Series values first)
mean_shannon = np.mean(rarefactions, axis=0)
std_shannon = np.std(rarefactions, axis=0)
```

## Ordination

### Principal Coordinate Analysis (PCoA)

```python
from skbio.stats.ordination import pcoa
from skbio import DistanceMatrix
import numpy as np

# PCoA from distance matrix
data = np.array([[0.0, 0.5, 0.9, 0.8],
                 [0.5, 0.0, 0.7, 0.6],
                 [0.9, 0.7, 0.0, 0.4],
                 [0.8, 0.6, 0.4, 0.0]])
dm = DistanceMatrix(data, ids=['A', 'B', 'C', 'D'])
pcoa_results = pcoa(dm)

# Access coordinates
pc1 = pcoa_results.samples['PC1']
pc2 = pcoa_results.samples['PC2']

# Proportion explained
prop_explained = pcoa_results.proportion_explained

# Eigenvalues
eigenvalues = pcoa_results.eigvals

# Save results
pcoa_results.write('pcoa_results.txt')

# Plot with matplotlib. proportion_explained is a Series indexed by axis NAME
# ('PC1', 'PC2', ...), so take positions with .iloc — prop_explained[0] raises
# KeyError on pandas 3.
import matplotlib.pyplot as plt
plt.scatter(pc1, pc2)
plt.xlabel(f'PC1 ({prop_explained.iloc[0]*100:.1f}%)')
plt.ylabel(f'PC2 ({prop_explained.iloc[1]*100:.1f}%)')
```

### Canonical Correspondence Analysis (CCA)

```python
from skbio.stats.ordination import cca
import pandas as pd
import numpy as np

# Species abundance matrix (samples x species)
species = np.array([
    [10, 5, 3],
    [2, 8, 4],
    [5, 5, 5]
])

# Environmental variables (samples x variables)
env = pd.DataFrame({
    'pH': [6.5, 7.0, 6.8],
    'temperature': [20, 25, 22],
    'depth': [10, 15, 12]
})

# CCA. Species labels go in feature_ids; there is no species_ids parameter.
cca_results = cca(species, env,
                 sample_ids=['Site1', 'Site2', 'Site3'],
                 feature_ids=['SpeciesA', 'SpeciesB', 'SpeciesC'])

# Access constrained axes
cca1 = cca_results.samples['CCA1']
cca2 = cca_results.samples['CCA2']

# Biplot scores for environmental variables
env_scores = cca_results.biplot_scores
```

### Redundancy Analysis (RDA)

```python
from skbio.stats.ordination import rda

# Similar to CCA but for linear relationships
rda_results = rda(species, env,
                 sample_ids=['Site1', 'Site2', 'Site3'],
                 feature_ids=['SpeciesA', 'SpeciesB', 'SpeciesC'])
```

### MMvec Joint Embeddings

Added in 0.7.3. Learns co-occurrence structure between two feature sets measured on
the same samples — microbes and metabolites being the motivating case.

```python
import numpy as np
import pandas as pd
from skbio.stats.ordination import mmvec

rng = np.random.default_rng(0)
samples = [f'S{i}' for i in range(15)]
microbes = pd.DataFrame(rng.integers(0, 30, size=(15, 5)),
                        index=samples, columns=[f'B{i}' for i in range(5)])
metabolites = pd.DataFrame(rng.integers(0, 30, size=(15, 6)),
                           index=samples, columns=[f'M{i}' for i in range(6)])

result = mmvec(microbes, metabolites, dimensions=2, max_iter=200, seed=42)
result.ranks           # conditional ranks, microbes x metabolites
result.x_embeddings    # latent coordinates for the first table
result.score           # log-likelihood of the fit
predicted = result.predict(microbes)
```

`optimizer='adam'` swaps L-BFGS for minibatch Adam on large tables.

## Statistical Tests

### PERMANOVA

```python
from skbio.stats.distance import permanova
from skbio import DistanceMatrix
import numpy as np

# Distance matrix over six samples
rng = np.random.default_rng(0)
data = rng.random((6, 6))
data = (data + data.T) / 2
np.fill_diagonal(data, 0)
dm = DistanceMatrix(data, ids=[f's{i}' for i in range(1, 7)])

# Grouping variable
grouping = ['Group1', 'Group1', 'Group2', 'Group2', 'Group3', 'Group3']

# Run PERMANOVA
results = permanova(dm, grouping, permutations=999)

print(f"Test statistic: {results['test statistic']}")
print(f"p-value: {results['p-value']}")
print(f"Sample size: {results['sample size']}")
print(f"Number of groups: {results['number of groups']}")
```

### ANOSIM

```python
from skbio.stats.distance import anosim

# ANOSIM test
results = anosim(dm, grouping, permutations=999)

print(f"R statistic: {results['test statistic']}")
print(f"p-value: {results['p-value']}")
```

### PERMDISP

```python
from skbio.stats.distance import permdisp

# Test homogeneity of dispersions.
#
# In 0.7.3 permdisp defaults to dimensions=10 and hands that to pcoa, which
# refuses to return more axes than the matrix has samples. Any matrix with
# fewer than 10 samples therefore fails with
#   ValueError: Invalid operation: cannot extend distance matrix size.
# Pass dimensions=0 to keep every axis, or any value <= the sample count.
results = permdisp(dm, grouping, permutations=999, dimensions=0)

print(f"F statistic: {results['test statistic']}")
print(f"p-value: {results['p-value']}")
```

### Mantel Test

```python
import numpy as np
from skbio.stats.distance import mantel
from skbio import DistanceMatrix

# Two distance matrices to compare
ids = [f's{i}' for i in range(1, 7)]
genetic = np.array([[0, 1, 2, 5, 6, 7], [1, 0, 3, 6, 5, 8], [2, 3, 0, 7, 8, 5],
                    [5, 6, 7, 0, 1, 2], [6, 5, 8, 1, 0, 3], [7, 8, 5, 2, 3, 0]],
                   dtype=float)
dm1 = DistanceMatrix(genetic, ids=ids)              # e.g., genetic distance

geographic = genetic * 1.5 + 0.1                    # e.g., geographic distance
np.fill_diagonal(geographic, 0)                     # the diagonal must stay zero
dm2 = DistanceMatrix(geographic, ids=ids)

# Mantel test
r, p_value, n = mantel(dm1, dm2, method='pearson', permutations=999)

print(f"Correlation: {r}")
print(f"p-value: {p_value}")
print(f"Sample size: {n}")

# Spearman correlation
r_spearman, p, n = mantel(dm1, dm2, method='spearman', permutations=999)
```

### Partial Mantel Test

```python
from skbio.stats.distance import mantel

r_partial, p_value, n = mantel(dm1, dm2, method='pearson',
                               permutations=999, alternative='two-sided')
```

`mantel` and `permanova` accept condensed-form distance matrices directly as of
0.7.2, which halves the memory a large matrix needs.

### Differential Abundance

`ancombc` (0.7.1) corrects the sampling-fraction bias that ANCOM ignores. It takes a
metadata frame plus a formula, not a bare grouping vector, and returns a frame indexed
by `(FeatureID, Covariate)`.

```python
import numpy as np
import pandas as pd
from skbio.stats.composition import ancombc, struc_zero, dirmult_ttest, rclr

rng = np.random.default_rng(0)
samples = [f'S{i}' for i in range(12)]
table = pd.DataFrame(rng.integers(1, 60, size=(12, 6)),
                     index=samples, columns=[f'F{i}' for i in range(6)])
metadata = pd.DataFrame({'group': ['control'] * 6 + ['treated'] * 6,
                         'age': rng.integers(20, 60, 12)}, index=samples)

res = ancombc(table, metadata, 'group')
res.loc[:, ['Log2(FC)', 'qvalue', 'Signif']]

# Adjust for a covariate with a formula
res_adj = ancombc(table, metadata, 'group + age')

# Structural zeros: features absent from an entire group
zeros = struc_zero(table, metadata, 'group')

# Dirichlet-multinomial t-test; treatment/reference must appear in the grouping
dmt = dirmult_ttest(table, metadata['group'],
                    treatment='treated', reference='control')

# Robust CLR — transforms only observed (non-zero) values (0.7.3)
transformed = rclr(table.values)
```

## Distance Matrices

### Creating and Manipulating Distance Matrices

```python
from skbio import DistanceMatrix
from skbio.stats.distance import PairwiseMatrix
import numpy as np

# Create from array
data = np.array([[0, 1, 2],
                 [1, 0, 3],
                 [2, 3, 0]])
dm = DistanceMatrix(data, ids=['A', 'B', 'C'])

# Access elements
dist_ab = dm['A', 'B']
row_a = dm['A']

# Slicing
subset_dm = dm.filter(['A', 'C'])

# General/asymmetric matrix: PairwiseMatrix (renamed from DissimilarityMatrix,
# which is kept as a deprecated alias)
asym_data = np.array([[0, 1, 2],
                      [3, 0, 4],
                      [5, 6, 0]])
pwm = PairwiseMatrix(asym_data, ids=['X', 'Y', 'Z'])

# Read/write. 'lsmat' (the default) is the labelled square matrix format;
# 'phylip_dm' reads and writes PHYLIP distance matrices (0.7.2).
dm.write('distances.txt')
dm2 = DistanceMatrix.read('distances.txt')

dm.write('distances.phy', format='phylip_dm')
dm3 = DistanceMatrix.read('distances.phy', format='phylip_dm')

# Convert to condensed form (for scipy)
condensed = dm.condensed_form()

# Convert to dataframe
df = dm.to_data_frame()
```

## File I/O

### Reading Sequences

```python
import skbio

# Read single sequence
dna = skbio.DNA.read('sequence.fasta', format='fasta')

# Read multiple sequences (generator)
for seq in skbio.io.read('sequences.fasta', format='fasta', constructor=skbio.DNA):
    print(seq.metadata['id'], len(seq))

# Read into list
sequences = list(skbio.io.read('sequences.fasta', format='fasta',
                               constructor=skbio.DNA))

# Read FASTQ with quality scores. variant= or phred_offset= is REQUIRED; without
# one the reader raises ValueError rather than guessing the encoding.
for seq in skbio.io.read('reads.fastq', format='fastq',
                         constructor=skbio.DNA, phred_offset=33):
    quality = seq.positional_metadata['quality']
    print(f"Mean quality: {quality.mean()}")
```

### Writing Sequences

```python
# Write single sequence
dna.write('output.fasta', format='fasta')

# Write multiple sequences. skbio.io.write dispatches on the type of its first
# argument and has no writer registered for list or list_iterator — pass a
# generator, or it raises UnrecognizedFormatError.
sequences = [dna1, dna2, dna3]
skbio.io.write((s for s in sequences), format='fasta', into='output.fasta')

# Write with custom line wrapping
dna.write('output.fasta', format='fasta', max_width=60)
```

### BIOM Tables

```python
from skbio import Table

# Read BIOM table. The registered format name is 'biom' for both the HDF5 and
# JSON flavours; format='hdf5' raises UnrecognizedFormatError. Omit it to sniff.
table = Table.read('table.biom', format='biom')

# Access data
sample_ids = table.ids(axis='sample')
feature_ids = table.ids(axis='observation')
matrix = table.matrix_data.toarray()  # if sparse

# Filter samples
abundant_samples = table.filter(lambda row, id_, md: row.sum() > 1000,
                                axis='sample', inplace=False)

# Filter features (OTUs/ASVs)
prevalent_features = table.filter(lambda col, id_, md: (col > 0).sum() >= 3,
                                 axis='observation', inplace=False)

# Normalize
relative_abundance = table.norm(axis='sample', inplace=False)

# Write
table.write('filtered_table.biom', format='biom')
```

### Format Conversion

```python
# FASTQ to FASTA. skbio.io.read returns a generator, which is what write wants.
seqs = skbio.io.read('input.fastq', format='fastq',
                     constructor=skbio.DNA, phred_offset=33)
skbio.io.write(seqs, format='fasta', into='output.fasta')

# GenBank to FASTA
seqs = skbio.io.read('genes.gb', format='genbank', constructor=skbio.DNA)
skbio.io.write(seqs, format='fasta', into='genes.fasta')
```

## Troubleshooting

### Common Issues and Solutions

#### Issue: "ValueError: Ids must be unique"
```python
# Problem: Duplicate sequence IDs
# Solution: Make IDs unique or filter duplicates
seen = set()
unique_seqs = []
for seq in sequences:
    if seq.metadata['id'] not in seen:
        unique_seqs.append(seq)
        seen.add(seq.metadata['id'])
```

#### Issue: "ValueError: Counts must be integers"
```python
# Problem: Relative abundances instead of counts
# Solution: Convert to integer counts or use appropriate metrics
counts_int = (abundance_table * 1000).astype(int)
```

#### Issue: Memory error with large files
```python
# Problem: Loading entire file into memory
# Solution: Use generators
for seq in skbio.io.read('huge.fasta', format='fasta', constructor=skbio.DNA):
    # Process one at a time
    process(seq)
```

#### Issue: Tree tips don't match OTU IDs
```python
# Problem: Mismatch between tree tip names and feature IDs
# Solution: Verify and align IDs
tree_tips = {tip.name for tip in tree.tips()}
feature_ids = set(feature_ids)
missing_in_tree = feature_ids - tree_tips
missing_in_table = tree_tips - feature_ids

# Prune tree to match table
tree_pruned = tree.shear(feature_ids)
```

#### Issue: Alignment fails with sequences of different lengths
```python
# Problem: Trying to align pre-aligned sequences
# Solution: Degap sequences first or ensure sequences are unaligned
from skbio.alignment import pair_align_nucl

seq1_degapped = seq1.degap()
seq2_degapped = seq2.degap()
alignment = pair_align_nucl(seq1_degapped, seq2_degapped)
```

#### Issue: `find_with_regex` returns nothing and reports no error
```python
# Problem: the pattern has no capture group, so nothing is yielded
list(dna.find_with_regex('ATG.{3}'))     # -> []

# Solution: wrap the pattern in a group
list(dna.find_with_regex('(ATG.{3})'))   # -> [slice(0, 6), ...]
```

#### Issue: "ValueError: Invalid operation: cannot extend distance matrix size"
```python
# Problem: permdisp's dimensions default (10) exceeds the sample count
# Solution: keep every axis, or ask for no more axes than there are samples
from skbio.stats.distance import permdisp

results = permdisp(dm, grouping, permutations=999, dimensions=0)
```

#### Issue: "partial_beta_diversity is only compatible with optimized unifrac methods and callable functions"
```python
# Problem: a metric passed by name to partial_beta_diversity / block_beta_diversity
# Solution: pass the callable itself
from scipy.spatial.distance import braycurtis
from skbio.diversity import partial_beta_diversity

partial_dm = partial_beta_diversity(braycurtis, counts, ids=sample_ids,
                                    id_pairs=[('Sample1', 'Sample2')])
```

### Performance Tips

1. **Use appropriate data structures**: BIOM HDF5 for large tables, generators for large sequence files, condensed-form distance matrices for large sample sets
2. **Restrict work, don't parallelize blindly**: `partial_beta_diversity()` computes only chosen pairs but is deprecated and zero-fills the rest; `block_beta_diversity()` decomposes a large calculation into blocks. Both need a callable metric
3. **Subsample large datasets**: For exploratory analysis, work with subsampled data first
4. **Cache results**: Save distance matrices and ordination results to avoid recomputation

### Integration Examples

#### With pandas
```python
import numpy as np
import pandas as pd
from skbio import DistanceMatrix
from skbio.diversity import alpha_diversity

# Distance matrix to DataFrame
dm = DistanceMatrix(np.array([[0.0, 1.0, 2.0], [1.0, 0.0, 3.0], [2.0, 3.0, 0.0]]),
                    ids=['Sample1', 'Sample2', 'Sample3'])
df = dm.to_data_frame()

# Alpha diversity to DataFrame
alpha = alpha_diversity('shannon', counts, ids=sample_ids)
alpha_df = pd.DataFrame({'shannon': alpha})
```

#### With matplotlib/seaborn
```python
import matplotlib.pyplot as plt
import seaborn as sns

# PCoA plot. matplotlib's c= wants numbers or colours, so map the group labels
# to codes first — passing the label strings raises ValueError.
fig, ax = plt.subplots()
codes = pd.Categorical(grouping).codes
scatter = ax.scatter(pc1, pc2, c=codes, cmap='viridis')
ax.set_xlabel(f'PC1 ({prop_explained.iloc[0]*100:.1f}%)')
ax.set_ylabel(f'PC2 ({prop_explained.iloc[1]*100:.1f}%)')
plt.colorbar(scatter)

# Heatmap of distance matrix
sns.heatmap(dm.to_data_frame(), cmap='viridis')
```

#### With QIIME 2
```python
# scikit-bio objects are compatible with QIIME 2
# Export from QIIME 2
# qiime tools export --input-path table.qza --output-path exported/

# Read in scikit-bio
from skbio import Table

table = Table.read('exported/feature-table.biom', format='biom')

# Process with scikit-bio
# ...

# Import back to QIIME 2 if needed
table.write('processed-table.biom')
# qiime tools import --input-path processed-table.biom --output-path processed.qza
```
