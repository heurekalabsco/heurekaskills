---
name: pathway-enrichment
description: Pathway and gene-set enrichment on a gene list or ranked table — over-representation (Enrichr, g:Profiler), preranked GSEA, and ssGSEA/GSVA against GO, KEGG, Reactome, and MSigDB, with background choice and FDR handled correctly.
category: analysis
license: MIT
author: K-Dense Inc. (adapted by Heureka Labs)
attribution: https://github.com/K-Dense-AI/scientific-agent-skills
version: 1.3.0
tags: [gsea, enrichment, gene-ontology, kegg, reactome]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-29
  against: gseapy 1.3.1 / pandas 3.0.5 / numpy 2.4.6 / scipy 1.17.1 / Python 3.11.15
  executed: 3
  unverified: 3
  unverified_reason: >-
    The Enrichr and MSigDB blocks (gp.get_library_name, gp.enrichr, and the
    preranked run against named Enrichr libraries) need outbound access to
    maayanlab.cloud and gsea-msigdb.org, which the validating environment does
    not have. Re-run them from a host with outbound HTTPS to those two domains.
---
# Pathway Enrichment

## Overview

Enrichment analysis answers "what biology is over-represented in my genes?" It is the standard last step after differential expression, a screen, or clustering. There are two core methods, and choosing correctly is the single most important decision:

- **ORA (over-representation analysis)** — take a *thresholded* gene list (e.g., padj < 0.05) and test which gene sets it overlaps more than chance, using Fisher's exact / hypergeometric tests. Tools: Enrichr, g:Profiler.
- **GSEA (gene set enrichment analysis)** — take the *whole ranked list* of genes (no threshold) and test whether each gene set is concentrated toward the top or bottom. Preranked GSEA uses a per-gene score (e.g., the DESeq2 `stat`). Better when effects are broad and subtle.

This skill orchestrates these analyses, the gene-set databases behind them, and the interpretation pitfalls that make results wrong or unpublishable.

## When to Use This Skill

Use this skill when the user wants to:
- Find enriched GO terms / KEGG / Reactome / WikiPathways / MSigDB Hallmark sets in a gene list.
- Run GSEA / preranked GSEA on DESeq2, edgeR, limma, or Scanpy `rank_genes_groups` output.
- Score pathway activity per sample/cell (ssGSEA, GSVA).
- Interpret, deduplicate, and visualize enrichment results, or build a publication table/figure.
- Decide between ORA and GSEA, pick gene-set libraries, choose a background, or fix gene-ID problems.

Use this skill for full, defensible enrichment workflows. For a single quick lookup, hitting the Enrichr or Reactome API directly is lighter weight.

## Choosing the Right Method

| Situation | Method | Tool / entry point |
|-----------|--------|--------------------|
| You have a discrete hit list (DE genes, screen hits, cluster markers) | **ORA** | `gp.enrichr(...)` or g:Profiler |
| You have a full ranked list (every tested gene + a score) | **Preranked GSEA** | `gp.prerank(...)` |
| You have an expression matrix + class labels | **GSEA** | `gp.gsea(...)` |
| You want a pathway score per sample/cell | **ssGSEA / GSVA** | `gp.ssgsea(...)`, `gp.gsva(...)` |
| You need a custom background or 500+ organisms | **ORA with custom domain** | g:Profiler (`domain_scope='custom'`) |
| You want TF / signaling *activity* (PROGENy, DoRothEA) | activity inference | see `references/databases-and-gene-sets.md` (decoupler) |

When in doubt: a thresholded list → ORA; a ranked table with scores → GSEA. Never threshold a list and then feed it to GSEA — that discards the ranking GSEA depends on.

## Setup

```bash
uv pip install gseapy gprofiler-official
# gseapy pulls pandas, numpy, scipy, matplotlib. Network access is needed for
# Enrichr, g:Profiler, and MSigDB downloads. For fully offline ORA, use a local
# GMT file with gp.enrich() (see references/gseapy.md).
```

Verify and list available gene-set libraries (names change over time — never hardcode blindly):

```python
import gseapy as gp
names = gp.get_library_name(organism="human")   # 200+ Enrichr libraries
print([n for n in names if "Reactome" in n or "KEGG" in n or "Hallmark" in n])
```

## Quick Start

### ORA on a hit list (gseapy + Enrichr)

```python
import gseapy as gp

# Enrichr libraries expect HGNC gene SYMBOLS (human: UPPERCASE). Map IDs first if needed.
genes = [g.strip() for g in open("deg_symbols.txt") if g.strip()]

enr = gp.enrichr(
    gene_list=genes,
    gene_sets=["MSigDB_Hallmark_2020", "GO_Biological_Process_2023",
               "KEGG_2021_Human", "Reactome_2022"],
    organism="human",
    outdir=None,            # in-memory; set a path to also write tables/plots
)
res = enr.results
sig = res[res["Adjusted P-value"] < 0.05].sort_values("Adjusted P-value")
print(sig[["Gene_set", "Term", "Overlap", "Adjusted P-value", "Combined Score", "Genes"]].head(20))
```

### Preranked GSEA from DESeq2 results

```python
import gseapy as gp
import pandas as pd

res = pd.read_csv("deseq2_results.csv", index_col=0)   # index = gene symbols
# Rank by the test statistic (sign = direction, magnitude = evidence). This is
# more stable than ranking by log2FoldChange, which is noisy for low-count genes.
rnk = res["stat"].dropna().sort_values(ascending=False)
rnk.index = rnk.index.str.upper()
rnk = rnk[~rnk.index.duplicated(keep="first")]

pre = gp.prerank(
    rnk=rnk,
    gene_sets=["MSigDB_Hallmark_2020", "GO_Biological_Process_2023"],
    min_size=15, max_size=500,        # drop tiny/huge sets (noisy or generic)
    permutation_num=1000, seed=123,   # seed = reproducible p-values
    threads=4, outdir=None,
)
out = pre.res2d.sort_values("FDR q-val")
print(out[["Term", "ES", "NES", "NOM p-val", "FDR q-val", "Lead_genes"]].head(20))
```

If you have no `stat` column, build the rank from `sign(log2FoldChange) * -log10(pvalue)`.

## Core Workflow

For a defensible analysis, work through these steps. The middle steps (ID type, background) are where results most often silently go wrong.

### Step 1 — Pin down inputs and pick the method
Confirm: which genes, what organism, is there a per-gene score (→ GSEA) or just a list (→ ORA), and what comparison they represent (direction matters for interpretation).

### Step 2 — Get gene IDs into the right namespace
Enrichr/MSigDB libraries are keyed by **gene symbols** (human UPPERCASE, mouse Title-case). If you have Ensembl/Entrez IDs, convert first. See `references/databases-and-gene-sets.md` for `gp.Biomart`, g:Profiler `g:Convert`, and `mygene`. An ID mismatch is the #1 cause of "nothing is significant" — and a *partial* one is the dangerous kind, because it does not raise and quietly shrinks every gene set instead (Pitfall 1).

### Step 3 — Choose gene-set libraries to match the question
Hallmark (broad themes) → GO:BP (mechanism) → KEGG/Reactome/WikiPathways (curated pathways) → C7 (immune), etc. Don't run 50 libraries; pick 2–4 that fit the biology. Catalog and selection guidance: `references/databases-and-gene-sets.md`.

### Step 4 — Set the background universe (ORA only)
The background must be the genes that *could* have been detected in your assay (e.g., all expressed/tested genes), not the whole genome. The wrong background inflates significance. Enrichr uses a fixed background; when background matters, use g:Profiler with `domain_scope='custom'` + your `background`, or `gp.enrich()` with an explicit background. Rationale in `references/interpretation.md`.

### Step 5 — Run the analysis
Use the Quick Start patterns. For GSEA always set a `seed` and report `permutation_num`.

### Step 6 — Filter on adjusted p-values
Use `Adjusted P-value` (ORA, Benjamini–Hochberg) or `FDR q-val` (GSEA), not raw p-values. Typical cutoff 0.05; also check the overlap/gene count so a "hit" isn't 1 gene out of a 2000-gene set.

### Step 7 — Visualize
Dotplots, bar plots, enrichment maps, and GSEA running-score plots are built into gseapy (`gp.dotplot`, `gp.barplot`, `gp.enrichment_map`, `gp.gseaplot`). See `references/gseapy.md`.

### Step 8 — Reduce redundancy and interpret
GO especially returns many near-duplicate terms. Collapse with an enrichment map (term–term similarity), leading-edge overlap, or parent terms, and report representative terms. Interpretation framework and a publication-table format are in `references/interpretation.md`.

## Boilerplate That Is Easy To Get Wrong

Symbol cleanup and rank construction cause most of the silent failures. Do both
explicitly rather than trusting the input file.

```python
import pandas as pd

def clean_symbols(genes, organism="human"):
    """Dedup, drop NA/blank, and match the casing the libraries use."""
    s = pd.Series(list(genes), dtype="string").dropna().str.strip()
    s = s[s.ne("")]
    s = s.str.upper() if organism == "human" else s.str.capitalize()
    return s.drop_duplicates().tolist()

def rank_from_deseq2(path):
    """Preranked GSEA input from a DESeq2 table, `stat` preferred over LFC."""
    res = pd.read_csv(path, index_col=0)
    if "stat" in res:
        rnk = res["stat"].dropna()
    else:
        import numpy as np
        d = res.dropna(subset=["pvalue", "log2FoldChange"])
        rnk = np.sign(d.log2FoldChange) * -np.log10(d.pvalue.clip(lower=1e-300))
    rnk.index = rnk.index.str.upper()
    return rnk[~rnk.index.duplicated(keep="first")].sort_values(ascending=False)
```

FDR is computed *within* a library, so filter per library rather than across the
concatenated table:

```python
sig = (res.groupby("Gene_set", group_keys=False)
          .apply(lambda g: g[g["Adjusted P-value"] < 0.05])
          .sort_values("Adjusted P-value"))
```

## Common Pitfalls

These cause most wrong or irreproducible results:

1. **Gene-ID / organism mismatch** — symbols vs Ensembl, human vs mouse casing. Map IDs and set `organism` correctly. How this fails depends on how *complete* the mismatch is, and only one of the three cases is loud (measured against gseapy 1.3.1, see *Try it*):
   - **Total mismatch** — no symbol in common, e.g. an uppercase human ranking against a Title-case mouse GMT. `gp.prerank` raises `LookupError` ("No gene sets passed through filtering condition") and names the cause. Loud, and hard to miss.
   - **Partial mismatch** — some symbols match. **This one is silent.** Each gene set is quietly shrunk to the overlapping genes and the run proceeds, so a 40-gene set tested on the 10 genes that happened to match still reports an FDR. The `Tag %` denominator is the tell: it is the *filtered* set size, not the declared one. Check it against what the library says the set contains.
   - **Casing alone, human** — a lowercase ranking against uppercase sets is auto-corrected. gseapy uppercases the ranked list when it is not mostly uppercase *and* the sampled gene sets all are, so plain lowercasing is not the hazard it is usually described as. That rescue is one-directional: it does not fire for an uppercase ranking against Title-case mouse sets.
2. **Wrong background (ORA)** — using the whole genome instead of the tested/expressed gene set inflates p-values. Set a custom background when it matters.
3. **Thresholding before GSEA** — GSEA needs the *full* ranked list; only ORA uses a cut list.
4. **Ranking GSEA by log2FoldChange alone** — unstable for low-count genes; prefer `stat` or `sign(LFC) * -log10(p)`.
5. **Multiple-testing across libraries** — FDR is computed *within* a library; running many libraries multiplies tests. Report per-library FDR and stay conservative.
6. **Redundant GO terms** — don't report 40 variants of the same term; collapse and show representatives.
7. **Significance ≠ relevance** — check the overlap count and gene-set size; tiny sets reach significance trivially.
8. **List too short/long for ORA** — <10 genes is underpowered; >2000 loses specificity (consider GSEA instead).
9. **No reproducibility metadata** — Enrichr/GO libraries are versioned and drift over time. Record library names+date and set a GSEA `seed`.

## Where The Genes Come From

Enrichment is always a second step. The usual upstream sources and what to carry
forward from each:

- **Bulk RNA-seq differential expression** — the results table. Carry the `stat`
  column for preranked GSEA, and the significant subset for ORA.
- **Single-cell marker detection** — per-cluster marker genes with their scores.
- **CRISPR or drug screens** — the hit list, plus the set of genes actually
  targeted by the library, which is the correct ORA background.
- **Proteomics** — the identified protein set mapped to gene symbols first.

Whatever the source, record which genes were *testable*, not just which were hit —
Step 4 needs it.

## Try it

A self-contained check that preranked GSEA still behaves. No account, no key, no network.

**Data** — generated inline; `datasets: []`. A 2000-gene ranked list with a 40-gene set
planted at the top, plus a six-set GMT written next to it. This is deliberately synthetic
rather than a real MSigDB collection: the check has to be deterministic and runnable with
no outbound access, and a planted set is the only way to assert that the statistic recovers
a signal it is *known* to contain. The live paths — Enrichr libraries and MSigDB downloads —
are the blocks this skill declares unverified, and they are not what this section is testing.
`np.random.default_rng(0)` and `seed=123` fix the whole thing.

```python
import numpy as np, pandas as pd, gseapy as gp

rng = np.random.default_rng(0)
genes = [f"GENE{i:04d}" for i in range(2000)]
score = pd.Series(rng.normal(size=2000), index=genes)
planted = genes[:40]
score[planted] += 4.0                      # plant a coherent signal at the top
rnk = score.sort_values(ascending=False)

with open("sets.gmt", "w") as fh:          # 1 true set + 5 random decoys
    fh.write("PLANTED_SET\tinline\t" + "\t".join(planted) + "\n")
    for k in range(5):
        decoy = rng.choice(genes, 40, replace=False)
        fh.write(f"DECOY_{k}\tinline\t" + "\t".join(decoy) + "\n")

pre = gp.prerank(rnk=rnk, gene_sets="sets.gmt", min_size=15, max_size=500,
                 permutation_num=1000, seed=123, threads=4, outdir=None)
res = pre.res2d.sort_values("NES", ascending=False).reset_index(drop=True)
print(res[["Term", "ES", "NES", "NOM p-val", "FDR q-val", "Tag %"]].to_string(index=False))

top = res.iloc[0]
tag_hit, tag_total = (int(x) for x in str(top["Tag %"]).split("/"))

# Invariants — a failure here means this skill is wrong
assert top["Term"] == "PLANTED_SET",            "planted set did not rank first"
assert float(top["NES"]) > 0,                   "planted set NES not positive"
assert float(top["FDR q-val"]) < 0.05,          "planted set not significant"
assert tag_total == 40, f"gene set silently truncated to {tag_total}/40 — namespace mismatch"
assert (res.iloc[1:]["FDR q-val"].astype(float) > 0.05).all(), "a decoy reached significance"

# The trap: a namespace sharing no symbols raises, it does not return an empty frame
with open("mouse.gmt", "w") as fh:
    fh.write("PLANTED_SET\tinline\t" + "\t".join(g.title() for g in planted) + "\n")
try:
    gp.prerank(rnk=rnk, gene_sets="mouse.gmt", min_size=15, max_size=500,
               permutation_num=100, seed=123, threads=4, outdir=None)
    raise SystemExit("FAIL: expected LookupError on a total namespace mismatch")
except LookupError as e:
    assert "No gene sets passed through filtering" in str(e)
    print("\ntotal namespace mismatch -> LookupError, as expected")

print(f"\nplanted: NES={float(top['NES']):.4f}  FDR={float(top['FDR q-val']):.4f}  Tag={top['Tag %']}")
print("OK")
```

**Expect** — the five assertions above are **invariants**: they hold for any correct
preranked GSEA implementation, and a failure means the skill (or gseapy) is wrong, not that
something drifted. The `tag_total == 40` assertion is the one worth copying into real work —
it is the guard against the silent partial-mismatch case in Pitfall 1.

These are **observed values**, run 2026-08-29 against gseapy 1.3.1 / pandas 3.0.5 /
numpy 2.4.6 / Python 3.11.15. A mismatch here is drift to investigate — gseapy's permutation
RNG is seeded but not guaranteed stable across releases — not a failure:

```
       Term        ES       NES  NOM p-val  FDR q-val Tag %
PLANTED_SET  0.986820  3.413775   0.000000   0.000000 39/40
    DECOY_1  0.373886  1.284122   0.126829   0.315882  7/40
    DECOY_0  0.265437  0.922930   0.587459   0.979437 24/40
    DECOY_4  0.262259  0.911207   0.615883   0.759943 11/40
    DECOY_2  0.245021  0.843613   0.717187   0.711851  7/40
    DECOY_3 -0.291002 -1.103382   0.296954   0.298177 15/40
```

`Tag %` reads `39/40`, not `40/40`: the leading edge holds 39 of the 40 planted genes, and
the denominator is what matters for the namespace guard. The decoys land where random sets
should — none below FDR 0.05.

## Reference Files

Read the relevant file when you need depth:

- `references/gseapy.md` — full gseapy API: `enrichr`, offline `enrich`, `prerank`, `gsea`, `ssgsea`, `gsva`, `Msigdb`, `Biomart`, `get_library_name`/`read_gmt`, every plot, result-column meanings, GMT/offline usage, and troubleshooting (rate limits, empty results).
- `references/databases-and-gene-sets.md` — GO, KEGG, Reactome, WikiPathways, MSigDB collections, Enrichr library naming, g:Profiler sources, organism handling, gene-ID conversion, library selection by question, and pointers to Reactome/STRING APIs and decoupler activity inference.
- `references/interpretation.md` — ORA vs GSEA statistics, background-universe choice, multiple-testing methods (BH vs g:SCS vs Bonferroni), leading-edge genes, redundancy reduction, effect vs significance, a publication-table template, and reproducibility checklist.

## Resources

- gseapy docs: https://gseapy.readthedocs.io/ · repo: https://github.com/zqfang/GSEApy
- g:Profiler: https://biit.cs.ut.ee/gprofiler/ · Python client: https://pypi.org/project/gprofiler-official/
- Enrichr: https://maayanlab.cloud/Enrichr/ · MSigDB: https://www.gsea-msigdb.org/gsea/msigdb/
- GSEA method: Subramanian et al. (2005) PNAS, DOI: 10.1073/pnas.0506580102
