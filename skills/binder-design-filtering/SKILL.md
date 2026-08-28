---
name: binder-design-filtering
description: Rank and cut de novo protein binder designs before paying to synthesise them — interface confidence from the PAE matrix (ipSAE, ipTM, pDockQ), pLDDT scoped to the binder chain, self-consistency by DockQ, interface geometry and sequence liabilities. Every threshold carries its source, and the filters are scored against a public labelled benchmark of 402 designs.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-design, binding-affinity, pae, plddt, protein-structure]
datasets: [https://raw.githubusercontent.com/adaptyvbio/egfr_competition_2/main/results/result_summary.csv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: Python 3.12.8 / numpy 1.26.4 / biopython 1.88 / DockQ 2.1.3 / Adaptyv Bio EGFR design competition round 2 release / IPSAE example files fetched 2026-08-27 / RCSB PDB entries 1BRS, 1OL5, 1UBQ, 1BJ1
  executed: 12
  unverified: 0
---
# Filtering de novo binder designs before you order them

A generative pipeline will hand you thousands of designs. A contract research
organisation will make and measure a few dozen. Everything between those two numbers is
this skill: which designs go into the order, in what rank, and on what evidence.

The filters here are **enrichment, not proof**. The published numbers are worth stating
plainly before anything else:

| campaign | what was ordered | hit rate |
|---|---|---|
| Rosetta-era yeast-display screens, deep-learning filtered (Bennett 2023) | libraries of ~10⁴ designs per target | **< 1%** — and only ~2.3% of designs pass the filter at all |
| Adaptyv Bio EGFR competition round 2, 2024 | 402 designs, already selected from open submissions | **14.0%** (53 of 378 with usable labels) |
| Autonomous multi-target campaign, 2026 | 1,320 designs, 30 per target, heavily filtered and ensembled | **26.8%** overall, **49%** for the top-ranked design of each target |

A filtered design is a better bet, not a binder. Nothing below changes that, and a skill
that implies otherwise is selling you something.

## What this skill assumes you already have

This is an analysis skill: it computes over predictions you have, and does not run a
predictor. For each design you need

| input | what it is | where it comes from |
|---|---|---|
| **design model** | the complex your generator proposed — binder plus target | your backbone/sequence design pipeline |
| **re-predicted complex** | the same sequence pair folded again, independently | a co-folding model |
| **PAE matrix** | predicted aligned error, per residue pair, for the re-prediction | the predictor's confidence output |
| **per-residue pLDDT** | the re-prediction's local confidence | the same file |
| **binder sequence** | one-letter, binder chain only | anywhere |

The registry has skills for producing the predictions: `esm` runs ESMFold2 and the ESM
family, `boltz2-nim` runs Boltz2 for complexes with a confidence output, and `alphafold`
covers reading pLDDT and PAE out of AlphaFold DB records. This skill starts after that.

**Nothing here needs a GPU, an account, or a licence key.** Everything runs on CPU with
permissively licensed packages. Two filters that the literature leans on — Rosetta
interface ΔG/ΔSASA and the Lawrence–Colman shape complementarity `Sc` — are *not*
implemented here, because both ship through Rosetta or PyRosetta, which are not
OSI-licensed and need a paid licence for commercial use. See *What needs a licence* near
the end for what to substitute and what you lose.

## Set up

```bash
python3 -m venv .venv
./.venv/bin/pip install --quiet "biopython>=1.85" "DockQ>=2.1"
./.venv/bin/python -c "import numpy, Bio, DockQ; print(numpy.__version__, Bio.__version__)"
```

Run every Python block below with `./.venv/bin/python`. numpy is BSD-3-Clause, Biopython
ships under the permissive Biopython Licence Agreement, and DockQ is MIT.

Do not pin numpy here. DockQ 2.1.3 requires numpy below 2, so asking for `numpy>=2.0`
alongside it fails resolution outright rather than warning; the line above resolves to
numpy 1.26.4 and Biopython 1.88.

## Get the inputs used below

Four public sources, no account on any of them. About 49 MB to download, and roughly
330 MB on disk once the structure archive is unpacked.

```bash
# 1. A labelled benchmark: 402 designs against EGFR, expressed and measured by one lab.
#    Adaptyv Bio EGFR design competition round 2. Data ODbL, code Apache-2.0.
curl -sSL -o egfr_round2.csv \
  https://raw.githubusercontent.com/adaptyvbio/egfr_competition_2/main/results/result_summary.csv
curl -sSL -o egfr_structures.zip \
  https://api.adaptyvbio.com/storage/v1/object/public/egfr_design_competition_2/structure_predictions.zip
unzip -q -o egfr_structures.zip -x "__MACOSX/*"
rm -rf egfr_structures && mv structure_predictions egfr_structures

# 2. A real two-chain prediction with its PAE matrix, plus the reference scores for it.
#    From the IPSAE repository (MIT).
base=https://raw.githubusercontent.com/DunbrackLab/IPSAE/main/Example
curl -sSL -O $base/fold_aurka_0_tpx2_0_full_data_0.json
curl -sSL -O $base/fold_aurka_0_tpx2_0_model_0.cif
curl -sSL -O $base/fold_aurka_0_tpx2_0_model_0_10_10.txt
curl -sSL -O $base/RAF1_KSR1_MEK1_9f755_scores_alphafold2_multimer_v3_model_1_seed_000.json.gz
curl -sSL -O $base/RAF1_KSR1_MEK1_9f755_unrelaxed_alphafold2_multimer_v3_model_1_seed_000.pdb

# 3. Experimental structures, from the PDB. 1OL5 is the crystal structure of the complex
#    predicted in (2); 1BRS is barnase-barstar; 1UBQ and 1BJ1 are the awkward cases.
for id in 1OL5 1BRS 1UBQ 1BJ1; do
  curl -sSL -o $id.pdb https://files.rcsb.org/download/$id.pdb
done
ls -1 *.csv *.json *.cif *.pdb | head -20
```

The Adaptyv round 2 release is the labelled ground truth used throughout: 402 designs
submitted by 100+ entrants, all expressed by cell-free synthesis and measured on the same
SPR instrument, with a binder/non-binder call, a K_D where one could be fitted, and the
ColabFold AlphaFold2-multimer scores the organisers used for their own ranking. Confirmed
reachable 2026-08-27.

## Before any filter — check the field means what its name says

Most of the numbers below are read out of a file rather than computed, and the reading is
where the mistakes are. Run this once against your own predictor's output before you write
a single threshold.

```python
import collections, statistics

def bfactors_pdb(path):
    """(chain, resnum) -> list of B-factor column values, one per atom."""
    g = collections.defaultdict(list)
    for line in open(path):
        if line.startswith("ATOM"):
            g[(line[21], line[22:27])].append(float(line[60:66]))
    return g

def bfactors_cif(path):
    """Same, for an AlphaFold3-style mmCIF (label_asym_id, label_seq_id, B_iso)."""
    g = collections.defaultdict(list)
    for line in open(path):
        if line.startswith("ATOM"):
            f = line.split()
            g[(f[6], f[8])].append(float(f[14]))
    return g

def audit(path, reader):
    g = reader(path)
    flat = [v for vals in g.values() for v in vals]
    spread = max(max(v) - min(v) for v in g.values())
    plausible = max(flat) <= 100.0 and min(flat) >= 0.0 and statistics.median(flat) > 50.0
    print(f"{path:22s} residues {len(g):5d}  range {min(flat):6.2f}-{max(flat):6.2f}  "
          f"median {statistics.median(flat):6.2f}  max within-residue spread {spread:5.2f}  "
          f"looks like pLDDT: {plausible}")

audit("egfr_structures/aureliabustos.bce_var433.pdb", bfactors_pdb)   # AlphaFold2 PDB
audit("fold_aurka_0_tpx2_0_model_0.cif", bfactors_cif)                # AlphaFold3 mmCIF
audit("1UBQ.pdb", bfactors_pdb)                                       # X-ray monomer
audit("1BJ1.pdb", bfactors_pdb)                                       # X-ray complex

# and what "the residue's pLDDT" means when the values are genuinely per-atom
cif = bfactors_cif("fold_aurka_0_tpx2_0_model_0.cif")
ca = {}
for line in open("fold_aurka_0_tpx2_0_model_0.cif"):
    if line.startswith("ATOM"):
        f = line.split()
        if f[3] == "CA":
            ca[(f[6], f[8])] = float(f[14])
chain_a = [k for k in ca if k[0] == "A"]
print(f"AF3 chain A mean pLDDT: {statistics.mean(ca[k] for k in chain_a):.2f} from CA, "
      f"{statistics.mean(statistics.mean(cif[k]) for k in chain_a):.2f} from per-residue "
      f"atom means")
```

Four things this prints, and each of them is a bug someone has shipped:

- **The B-factor column of a deposited crystal structure is a crystallographic B-factor,
  not pLDDT.** `1UBQ` runs 2.00–42.75 and `1BJ1` reaches 142.29. Both are perfectly
  ordinary; neither is a confidence score, and for a B-factor *low is good*, the opposite
  direction. A value above 100 proves the column is not pLDDT. A median below 50 is a
  strong hint. Barnase–barstar, the tightest protein–protein complex known, scores a mean
  "pLDDT" of 26 if you make this mistake.
- **AlphaFold2 writes one pLDDT per residue, repeated on every atom; AlphaFold3 writes a
  genuine per-atom value** — its own documentation calls pLDDT "a per-atom confidence
  estimate". The audit prints a within-residue spread of `0.00` for the AF2
  files and `47.10` for the AF3 mmCIF. So `CA` is the residue's pLDDT in AF2 and only one
  of its atoms in AF3 — the last line of the block prints the consequence, the same chain
  reading 94.68 from `CA` and 92.18 from per-residue atom means.
- **Averaging over atoms instead of residues silently weights tryptophans over glycines.**
  Across the 400 EGFR design structures the per-atom binder mean differs from the
  per-residue binder mean by 0.92 pLDDT on average.
- **A modified residue is a `HETATM` record even in a predicted structure.** The audit
  above reports 317 residues for a chain pair that has 319, because the two
  phosphothreonines of this AURKA model are `HETATM` and an `ATOM`-only parse drops them.
  Harmless in a confidence audit; not harmless if one of them is in your interface.

## Filter 1 — interface confidence, from the PAE matrix

### ipTM is a global number, and it is not the interface

`ipTM` is one scalar for the whole prediction. It does not tell you which interface in a
multi-chain model is real, and per-chain-pair variants do not fix the ranking.

```python
import gzip, json, itertools
import numpy as np

scores = json.load(gzip.open(
    "RAF1_KSR1_MEK1_9f755_scores_alphafold2_multimer_v3_model_1_seed_000.json.gz"))
pae = np.asarray(scores["pae"], dtype=float)
chains = np.array([l[21] for l in
                   open("RAF1_KSR1_MEK1_9f755_unrelaxed_alphafold2_multimer_v3_model_1_seed_000.pdb")
                   if l.startswith("ATOM") and l[12:16].strip() == "CA"])
xyz = np.array([[float(l[30:38]), float(l[38:46]), float(l[46:54])] for l in
                open("RAF1_KSR1_MEK1_9f755_unrelaxed_alphafold2_multimer_v3_model_1_seed_000.pdb")
                if l.startswith("ATOM")])
atom_chains = np.array([l[21] for l in
                        open("RAF1_KSR1_MEK1_9f755_unrelaxed_alphafold2_multimer_v3_model_1_seed_000.pdb")
                        if l.startswith("ATOM")])

print(f"one global ipTM for the whole model: {scores['iptm']}")
print(f"pairwise ipTM reported by the predictor: {scores['pairwise_iptm']}")
for a, b in itertools.combinations(sorted(set(chains)), 2):
    A, B = xyz[atom_chains == a], xyz[atom_chains == b]
    n = sum(int((np.linalg.norm(A[i:i+500, None, :] - B[None, :, :], axis=-1) < 5.0).sum())
            for i in range(0, len(A), 500))
    print(f"  chains {a}-{b}: {n:5d} heavy-atom contacts under 5 A")
```

The global `ipTM` of 0.53 would fail a "confident interface" threshold of 0.6 even though
this model contains two well-packed interfaces. The pairwise values invert the ordering:
`B-C`, with 170 contacts, scores 0.604 — above `A-B`, which has 1254.

Use ipTM to reject nothing. Compute a per-pair score from the PAE matrix instead.

### ipAE, ipSAE and the direction that matters

Three scores are computed from the same cross-chain block of the PAE matrix, and they
differ in how they weight it.

- **ipAE** (often `pae_interaction`): the mean PAE over residue pairs with one residue in
  each chain. Simple, and dominated by the many pairs far from the interface.
- **pDockQ / pDockQ2**: logistic fits over interface pLDDT and contact count, or over
  PAE at contacting pairs. Calibrated to DockQ, so they answer "is this pose right", not
  "does it bind".
- **ipSAE**: for each residue *i* in the aligned chain, take only the partner residues
  with PAE below a cutoff, set `d0` from *how many* those are, and average
  `1/(1+(PAE/d0)²)` over them; the chain-pair score is the maximum over *i*. Restricting
  to confident pairs is what stops a big, badly-predicted chain from washing the interface
  out.

```python
import json
import numpy as np

def load_af3_pae(json_path, protein_chains):
    """AlphaFold3 PAE is per TOKEN, and a protein chain has more tokens than residues.
    Collapse to one row/column per residue before doing anything else."""
    d = json.load(open(json_path))
    pae = np.asarray(d["pae"], dtype=float)
    ch, rid = d["token_chain_ids"], d["token_res_ids"]
    keep, seen = [], set()
    for i, (c, r) in enumerate(zip(ch, rid)):
        if c in protein_chains and (c, r) not in seen:
            seen.add((c, r))
            keep.append(i)
    keep = np.array(keep)
    return pae[np.ix_(keep, keep)], np.array([ch[i] for i in keep])

def d0(n):
    """Yang and Skolnick length normalisation, floored at 1.0 as ipSAE does."""
    n = np.asarray(n, dtype=float)
    return np.maximum(1.0, 1.24 * np.sign(n - 15) * np.abs(n - 15) ** (1 / 3) - 1.8)

def ipsae_asym(pae, chains, aligned, scored, cutoff=10.0):
    """ipSAE for aligned -> scored. Asymmetric on purpose."""
    rows, cols = chains == aligned, chains == scored
    ok = np.zeros_like(pae, dtype=bool)
    ok[np.ix_(rows, cols)] = pae[np.ix_(rows, cols)] < cutoff
    n0 = ok.sum(axis=1)
    dd = d0(n0)
    best = 0.0
    for i in np.where(rows)[0]:
        m = ok[i]
        if m.any():
            best = max(best, float((1.0 / (1.0 + (pae[i, m] / dd[i]) ** 2)).mean()))
    return best

def ipae(pae, chains, a, b):
    return float(pae[np.ix_(chains == a, chains == b)].mean())

pae, chains = load_af3_pae("fold_aurka_0_tpx2_0_full_data_0.json", {"A", "B"})
ab = ipsae_asym(pae, chains, "A", "B")
ba = ipsae_asym(pae, chains, "B", "A")
print(f"residues after collapsing tokens: {len(chains)}  "
      f"(A {(chains=='A').sum()}, B {(chains=='B').sum()})")
print(f"ipSAE A->B (align on the 276-residue chain, score the 43-residue one): {ab:.6f}")
print(f"ipSAE B->A (the other direction):                                     {ba:.6f}")
print(f"ipSAE_max {max(ab, ba):.6f}   ipSAE_min {min(ab, ba):.6f}")
print(f"mean interface PAE (ipAE): {ipae(pae, chains, 'A', 'B'):.3f} A")
print(open("fold_aurka_0_tpx2_0_model_0_10_10.txt").read().rstrip())
```

Two things to take from that output.

**The implementation agrees with the reference.** The published values for this model are
`0.448952` and `0.866498`; the code above returns `0.448952` and `0.866531`. The last
digits differ only because a residue tokenised more than once has more than one PAE row
and the two implementations pick different ones.

That collapse is not cosmetic. This file carries **296 tokens for chain A's 276
residues** — AlphaFold3 tokenises modified residues one token per atom, and this AURKA
model is phosphorylated on Thr160 and Thr161, giving 11 tokens each. Index the PAE matrix
by token and B→A reads 0.874849 instead of 0.866531. The error grows with how much of your
interface is modified, and nothing in the file warns you.

**The two directions differ by a factor of nearly two on the same interface**, and this is
mechanical rather than mysterious. `d0` is set from the number of confident partner
residues, so the direction that scores the *small* chain gets a small `d0` and a harsh
score. In binder design the binder is always the small chain, so **align on the target and
score the binder** — which is the `min` of the two directions for any realistic
target/binder size ratio. That is the conservative convention, and the one benchmarked in
2026 across 3,532 designs.

It is also, on this particular complex, wrong: DockQ against the crystal structure (below)
says the model is right, and the pessimistic direction reads 0.449. Conservative filters
throw away good designs. That is what they are for; you just have to know the rate.

### Where the numbers come from

| filter | threshold | source | what sits either side |
|---|---|---|---|
| interface PAE (ipAE) | `< 10` Å | Bennett et al. 2023, Nat Commun 14:2625 — the AF2 initial-guess filter, paired with `af2_complex_rmsd < 5` Å | ~2.3% of raw designs pass; on the EGFR benchmark it keeps 105/378 and 24/53 binders |
| interface PAE, normalised | `i_pAE ≤ 0.35` | BindCraft `settings_filters/default_filters.json` (MIT). ColabDesign divides PAE by 31, so this is ≈10.9 Å raw | the same filter as the row above, in different units |
| ipTM | `> 0.8` confident, `< 0.6` failed, between is a grey zone | AlphaFold 3 `docs/output.md`, verbatim | global, so it cannot rank interfaces within a model |
| i_pTM | `≥ 0.5` | BindCraft default | looser than the row above and, on the EGFR benchmark, almost non-selective — it keeps 280 of 378 |
| binder pLDDT | `≥ 80` (`0.8` on BindCraft's 0–1 scale) | BindCraft default; AlphaFold DB bands are >90 very high, 70–90 confident, 50–70 low | keeps 222/378 and 39/53 binders |
| ipSAE | no published cutoff; **rank, do not threshold** | Dunbrack 2025 (IPSAE, MIT); Overath et al. 2025 computed >200 features per design and found the AF3-derived ipSAE beat both ipAE and ipTM, at 1.4× the average precision of ipAE | the score scales with interface size, so a cutoff transferred between targets is not the same filter |
| design vs re-prediction RMSD | `≤ 3.5` Å binder, `< 5` Å complex | BindCraft default; Bennett et al. 2023 | see *Filter 3* |
| DockQ | `≥ 0.23` acceptable, `≥ 0.49` medium, `≥ 0.80` high | printed by DockQ v2 itself | a quality band for a pose, not a binding probability |
| shape complementarity `Sc` | `≥ 0.55` per model, `≥ 0.60` averaged | BindCraft default; Lawrence and Colman 1993, J Mol Biol 234:946 | needs Rosetta — see *What needs a licence* |
| surface hydrophobicity | `≤ 0.35` | BindCraft default (exposed apolar residues over exposed residues) | a developability filter, not a binding one |
| interface residues / H-bonds | `≥ 7` / `≥ 3`, unsatisfied `≤ 4` | BindCraft defaults | see *Filter 4* |

## Filter 2 — pLDDT, scoped to the right chain

The target is usually large and always well predicted, so a complex-wide mean pLDDT is a
statement about the target. Score the binder, and score the binder's interface.

```python
import collections
import numpy as np

def per_residue_plddt(path):
    """AF2 PDB: one value per residue, repeated across its atoms. Take the CA."""
    out = collections.defaultdict(dict)
    for line in open(path):
        if line.startswith("ATOM") and line[12:16].strip() == "CA":
            out[line[21]][line[22:27]] = float(line[60:66])
    return out

def interface_residues(path, binder="A", target="B", cutoff=5.0):
    coords = collections.defaultdict(list)
    for line in open(path):
        if line.startswith("ATOM"):
            coords[(line[21], line[22:27])].append(
                (float(line[30:38]), float(line[38:46]), float(line[46:54])))
    tgt = np.array([c for (ch, _), v in coords.items() if ch == target for c in v])
    hits = []
    for (ch, res), v in coords.items():
        if ch != binder:
            continue
        d = np.linalg.norm(np.array(v)[:, None, :] - tgt[None, :, :], axis=-1)
        if (d < cutoff).any():
            hits.append(res)
    return hits

for name in ["round1zeroshot.K5Q_N70S_K71R_N73T_S87T_N88D_R179K_K183R_E213D_S214P",
             "chrisxushaoyong.hu_nano2_4_85252b",
             "elian.elian2"]:
    p = f"egfr_structures/{name}.pdb"
    pl = per_residue_plddt(p)
    iface = interface_residues(p)
    binder = np.array(list(pl["A"].values()))
    both = np.array(list(pl["A"].values()) + list(pl["B"].values()))
    print(f"{name[:34]:36s} binder {binder.mean():6.2f}  complex {both.mean():6.2f}  "
          f"interface {np.mean([pl['A'][r] for r in iface]):6.2f}  "
          f"binder min {binder.min():6.2f}")
```

On the 378 labelled EGFR designs, ranked by area under the ROC curve against the
binder/non-binder call:

| score | AUROC | average precision |
|---|---|---|
| interface pLDDT, binder side | **0.684** | 0.226 |
| binder mean pLDDT | 0.656 | 0.217 |
| ipTM | 0.636 | 0.207 |
| interface PAE | 0.612 | 0.210 |
| complex mean pLDDT | 0.609 | 0.220 |
| ESM2 pseudo-log-likelihood | 0.547 | 0.212 |
| **binder minimum pLDDT** | **0.439** | 0.129 |

Base rate 0.140. Two readings, both useful. Scoping pLDDT to the interface beats scoping
it to the binder, which beats the complex mean — as much as any of these beats anything.
And the *minimum* pLDDT over the binder is **worse than chance**: a design with one
flexible terminus is not a worse binder, and filtering on a minimum removes long designs
rather than bad ones.

## Filter 3 — self-consistency

Bennett et al. split design failure in two. *Type 1*: the sequence does not fold to the
intended monomer. *Type 2*: it folds and does not form the intended interface. Confidence
scores speak to neither directly — a model can be confidently wrong. Self-consistency
does: fold the sequence again, independently, and ask whether you get the structure you
designed.

DockQ is the standard measure, and it separates the two failures — `fnat` is interface
recovery, `LRMSD` is the pose, `iRMSD` is the interface geometry.

```bash
./.venv/bin/DockQ fold_aurka_0_tpx2_0_model_0.cif 1OL5.pdb 2>&1 | grep -vE '^\*|^$'
```

Against the crystal structure of the same complex the AlphaFold3 model scores
`DockQ 0.910, iRMSD 0.482, fnat 0.863` — a correct pose. In a design pipeline the
"native" argument is your **design model** and the "model" argument is the independent
re-prediction, which is what the 2026 campaign called self-consistency DockQ; on its own
it was a weaker filter than interface confidence (macro-average precision 0.45 against
0.62), and it was kept at quarter weight as a check that the predicted pose is the
designed one rather than a different pose that happens to score well.

Two traps in that command. **DockQ pairs chains by sequence, and prints which pairing it
chose.** Here it warns that model chain A and native chain B are too dissimilar to be
treated as homologous — correct and harmless, because the mapping it settled on
(`AB:AB`) is the right one. Read the mapping line, not the warning: a wrong mapping scores
a different interface and says nothing about it. **And a design that re-predicts as a
different but confident complex has a high ipSAE and a low DockQ** — the case a confidence
filter alone cannot see, and the reason self-consistency earns a place at all.

## Filter 4 — interface geometry

Buried surface area, contact counts and interface composition are cheap, interpretable,
and much weaker than they look.

```python
import copy, itertools, warnings
import numpy as np
from Bio.PDB import PDBParser
from Bio.PDB.SASA import ShrakeRupley
warnings.filterwarnings("ignore")

THREE = {"ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C", "GLN": "Q",
         "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I", "LEU": "L", "LYS": "K",
         "MET": "M", "PHE": "F", "PRO": "P", "SER": "S", "THR": "T", "TRP": "W",
         "TYR": "Y", "VAL": "V"}
HYDRO = set("AVILMFWYC")
parser, sr = PDBParser(QUIET=True), ShrakeRupley()

def interface_geometry(path, pairs=None):
    model = parser.get_structure("m", path)[0]
    chains = {c.id: [r for r in c if r.get_resname() in THREE] for c in model}
    chains = {k: v for k, v in chains.items() if v}
    if len(chains) < 2:
        raise ValueError(f"{path}: one protein chain — there is no interface to score")
    out = []
    for a, b in (pairs or itertools.combinations(sorted(chains), 2)):
        tgt = np.array([at.coord for r in chains[b] for at in r])
        iface, contacts = [], 0
        for k, r in enumerate(chains[a]):
            d = np.linalg.norm(np.array([at.coord for at in r])[:, None, :] - tgt[None, :, :], axis=-1)
            n = int((d < 5.0).sum())
            if n:
                iface.append(k)
                contacts += n
        if not iface:
            out.append((a, b, 0, 0, 0.0, 0.0))
            continue
        pair = copy.deepcopy(model)
        for c in list(pair):
            if c.id not in (a, b):
                pair.detach_child(c.id)
        A2, B2 = copy.deepcopy(model[a]), copy.deepcopy(model[b])
        sr.compute(pair, level="C"); sr.compute(A2, level="C"); sr.compute(B2, level="C")
        bsa = A2.sasa + B2.sasa - pair[a].sasa - pair[b].sasa
        seq = "".join(THREE[r.get_resname()] for r in chains[a])
        frac = sum(1 for k in iface if seq[k] in HYDRO) / len(iface)
        out.append((a, b, len(iface), contacts, bsa, frac))
    return out

print(f"{'structure':46s} {'pair':6s} {'iface':>5s} {'contacts':>8s} {'BSA A^2':>9s} {'phobic':>7s}")
for label, path, pairs in [
        ("barnase-barstar, KD ~1e-14 M", "1BRS.pdb", [("A", "D")]),
        ("barnase-barstar, crystal packing contact", "1BRS.pdb", [("A", "B")]),
        ("EGFR design, binder, KD 1.2 nM", "egfr_structures/round1zeroshot.K5Q_N70S_K71R_N73T_S87T_N88D_R179K_K183R_E213D_S214P.pdb", None),
        ("EGFR design, binder, KD 5.2 nM", "egfr_structures/chrisxushaoyong.hu_nano2_4_85252b.pdb", None),
        ("EGFR design, weak binder", "egfr_structures/a.tucs.Andrejs_Tucs_seq8.pdb", None),
        ("EGFR design, NON-binder, ipTM 0.90", "egfr_structures/elian.elian2.pdb", None),
        ("EGFR design, NON-binder, ipTM 0.90", "egfr_structures/aswini.seed1.pdb", None)]:
    for a, b, n, c, bsa, frac in interface_geometry(path, pairs):
        print(f"{label:46s} {a}-{b:4s} {n:5d} {c:8d} {bsa:9.0f} {frac:7.2f}")

try:
    interface_geometry("1UBQ.pdb")
except ValueError as e:
    print(f"\nmonomer: {e}")
```

Read that table honestly. Barnase–barstar, at roughly 10⁻¹⁴ M, buries 2304 Å² across 22
residues. The EGFR non-binder buries **3431 Å² across 39 residues** — a larger, more
hydrophobic interface, and no measurable binding. Across all 378 labelled designs, buried
surface area reaches AUROC 0.608, heavy-atom contact count 0.501, and the hydrophobic
fraction of the interface 0.536. **Contact count is chance.**

Two failure modes worth naming, both visible above:

- **A monomer must raise, not score zero.** A function that returns `0.0` for a
  single-chain file ranks it in the middle of your list rather than out of it. The block
  raises.
- **In a crystal structure, "chain A versus chain B" is often a lattice contact.** 1BRS
  contains three independent copies of the complex; the biological pairs are A–D, B–E and
  C–F, while A–B is a packing contact that still buries 921 Å² over 8 residues. If you are
  calibrating thresholds on PDB complexes, enumerate every chain pair and take the
  interface you meant, not the first one.

## Filter 5 — developability and sequence liabilities

These do not predict binding and are not meant to. They predict whether the molecule you
order can be made, purified and kept.

```python
import csv, re, statistics

def liabilities(seq):
    return {
        "length": len(seq),
        "cys": seq.count("C"),
        "unpaired_cys": seq.count("C") % 2,
        "n_glyc_sequons": len(re.findall(r"(?=N[^P][ST])", seq)),
        "deamidation_NG_NS": len(re.findall(r"(?=N[GS])", seq)),
        "isomerisation_DG_DP": len(re.findall(r"(?=D[GP])", seq)),
        "net_charge": sum(seq.count(c) for c in "KR") - sum(seq.count(c) for c in "DE"),
    }

rows = list(csv.DictReader(open("egfr_round2.csv")))
poor = [r for r in rows if r["expression"] in ("none", "low")]
good = [r for r in rows if r["expression"] == "high"]
print(f"designs {len(rows)}   failed to express {len(poor)}   expressed well {len(good)}")
print(f"median length: failed {statistics.median(len(r['sequence']) for r in poor):.0f}  "
      f"expressed {statistics.median(len(r['sequence']) for r in good):.0f}")
short = [r for r in rows if len(r["sequence"]) <= 80]
print(f"designs of 80 residues or fewer: {len(short)}, of which failed to express: "
      f"{sum(1 for r in short if r['expression'] in ('none', 'low'))}")
for k in ["unpaired_cys", "n_glyc_sequons", "deamidation_NG_NS", "isomerisation_DG_DP"]:
    n = sum(1 for r in rows if liabilities(r["sequence"])[k])
    print(f"  carry at least one {k:20s} {n:3d}/{len(rows)}")
```

What this benchmark actually shows: **every one of the 24 designs that failed to express
was longer than 80 residues**, and none of the 193 designs of 80 residues or fewer failed.
Length dominates (AUROC 0.846 for expression failure); N-glycosylation sequon count looks
predictive (0.795) only because the long entries are antibody-derived and carry more
sequons. Exposed hydrophobic *fraction* carries no signal at all here (0.463 within the
long designs).

So treat these as what they are:

- **N-glycosylation sequons `N-X-S/T` (X ≠ P)** matter in a mammalian expression system
  and are irrelevant in the *E. coli* and cell-free formats most binder CROs use. Filtering
  on them for a cell-free order is filtering on nothing.
- **An odd cysteine count** is a real risk — disulfide scrambling, covalent dimers — and it
  is common: 50 of these 402 designs carry one.
- **`NG`/`NS` deamidation and `DG`/`DP` isomerisation** are stability and heterogeneity
  liabilities on the shelf, not expression liabilities. 160 and 151 of these 402 designs
  carry at least one, so treating them as a hard filter deletes 40% of the library for a
  problem a binding assay will never see.
- **Length** is the one that repaid attention in this dataset, and it is the one nobody
  lists as a developability filter.

## One prediction is not a measurement

Every number above comes from one run of one model. Run it again with a different seed and
it moves. The 2026 campaign treated this as part of the method rather than a detail: five
seeds per predictor, the maximum ipSAE over seeds as the design's score, and an ensemble
across predictors.

You can see the size of that effect without a GPU. 1BRS holds three crystallographically
independent copies of the *same* complex in one asymmetric unit. They are not independent
experiments, but they are the same interface built three times, which puts a floor under
how much run-to-run spread to expect from anything softer.

```python
import csv
import numpy as np

reps = interface_geometry("1BRS.pdb", [("A", "D"), ("B", "E"), ("C", "F")])
bsa = np.array([r[4] for r in reps])
print("three independent copies of one complex:")
for a, b, n, c, area, frac in reps:
    print(f"  {a}-{b}: iface {n:3d}  contacts {c:4d}  BSA {area:7.0f} A^2")
print(f"  spread: {bsa.max() - bsa.min():.0f} A^2, "
      f"{100*(bsa.max()-bsa.min())/bsa.mean():.0f}% of the mean, on the same interface")

def aggregate_seeds(per_design):
    """One score per design per seed -> one score per design. Max over seeds is what the
    2026 campaign used: a design is credited with its best-supported pose."""
    return {d: max(v) for d, v in per_design.items()}

def zscore(values):
    """Z-score within a target before combining predictors. Different predictors put
    their scores on different scales, and different targets have different score
    distributions; averaging raw values lets one predictor and one easy target dominate."""
    v = np.asarray(values, dtype=float)
    return (v - v.mean()) / (v.std() or 1.0)

print("  max over replicates:",
      {k: round(v) for k, v in aggregate_seeds({"barnase-barstar": list(bsa)}).items()})

# Now the ensemble that does NOT work: three views of one prediction.
rows = [r for r in csv.DictReader(open("egfr_round2.csv"))
        if r["binding"] in ("true", "false") and r["iptm"] and r["pae_interaction"]]
y = np.array([r["binding"] == "true" for r in rows])
views = {"ipTM": np.array([float(r["iptm"]) for r in rows]),
         "-interface PAE": -np.array([float(r["pae_interaction"]) for r in rows]),
         "binder pLDDT": np.array([float(r["plddt"]) for r in rows])}
names = list(views)
C = np.corrcoef(np.vstack([views[n] for n in names]))
print("\ncorrelation between three scores from ONE ColabFold run:")
for i, n in enumerate(names):
    print(f"  {n:16s}" + "".join(f"{C[i][j]:7.2f}" for j in range(len(names))))

def top30(score):
    order = np.argsort(-np.asarray(score), kind="stable")[:30]
    return int(y[order].sum())

ens = sum(zscore(v) for v in views.values())
print(f"\nbinders in the top 30 by ipTM alone:        {top30(views['ipTM'])}/30")
print(f"binders in the top 30 by the z-ensemble:   {top30(ens)}/30")
```

Two things follow.

**Ensemble across predictors, not across the outputs of one run.** The block prints the
answer: z-scoring ipTM, interface PAE and binder pLDDT from a single ColabFold run and
averaging them puts **8 binders in the top 30 where ipTM alone puts 10**. The correlation
matrix says why — ipTM and interface PAE at r = 0.92, and binder pLDDT at 0.63 to 0.59
with the other two. Three views of one prediction are one filter wearing three hats. The
2026 result — macro-average precision 0.66 for the ensemble against 0.62 for the best
single predictor — came from *different models* (ESMFold2, ESMFold2-Fast, Protenix v2),
five seeds each.

**AND-stacking correlated filters buys nothing and costs recall.** On this benchmark,
every one of the 105 designs with interface PAE < 10 also passes ipTM ≥ 0.8 *and* binder
pLDDT ≥ 80. The three-filter stack and the one-filter version keep the same 105 designs
and the same 24 binders. A four-line filter block that reads like four independent
pieces of evidence is one piece of evidence, and each additional clause only removes
designs you would have kept.

## Score the filter before you trust it

A ranking nobody has checked is not a filter. Score yours against labelled data — either
a public benchmark, or your own last order, which is the better calibration set because it
shares your pipeline's failure modes.

```python
import csv

def auroc(scores, labels):
    order = sorted(range(len(scores)), key=lambda i: scores[i])
    ranks, i = [0.0] * len(scores), 0
    s = [scores[j] for j in order]
    while i < len(s):
        j = i
        while j + 1 < len(s) and s[j + 1] == s[i]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    pos = sum(labels)
    neg = len(labels) - pos
    return (sum(r for r, y in zip(ranks, labels) if y) - pos * (pos + 1) / 2) / (pos * neg)

def precision_at_k(scores, labels, k, tiebreak=None):
    key = (lambda i: (-scores[i], tiebreak[i])) if tiebreak else (lambda i: -scores[i])
    order = sorted(range(len(scores)), key=key)[:k]
    return sum(labels[i] for i in order) / k

rows = [r for r in csv.DictReader(open("egfr_round2.csv"))
        if r["binding"] in ("true", "false") and r["iptm"] and r["pae_interaction"]]
y = [r["binding"] == "true" for r in rows]
base = sum(y) / len(y)
print(f"n {len(rows)}  binders {sum(y)}  base rate {base:.3f}")
for label, score in [("ipTM", [float(r["iptm"]) for r in rows]),
                     ("-interface PAE", [-float(r["pae_interaction"]) for r in rows]),
                     ("binder pLDDT", [float(r["plddt"]) for r in rows]),
                     ("ESM2 PLL", [float(r["esm_pll"]) for r in rows])]:
    p30 = precision_at_k(score, y, 30)
    print(f"  {label:16s} AUROC {auroc(score, y):.3f}   precision@30 {p30:.3f}   "
          f"enrichment {p30/base:.2f}x")

names = [r["name"] for r in rows]
iptm = [float(r["iptm"]) for r in rows]
print(f"\nipTM is published to two decimals, so the top 30 is not a total order:")
print(f"  precision@30, file order within ties: {precision_at_k(iptm, y, 30):.3f}")
print(f"  precision@30, name  order within ties: "
      f"{precision_at_k(iptm, y, 30, tiebreak=names):.3f}")
print(f"  designs tied at the 30th score: "
      f"{sum(1 for v in iptm if v == sorted(iptm, reverse=True)[29])}")
```

Report **enrichment over the base rate**, not accuracy. With a 14% base rate a filter that
rejects everything is 86% accurate. Enrichment is what an order actually buys you: at
2.1× to 2.4× you expect roughly twice as many binders in thirty wells as you would picking
at random, and picking at random gives 4.2 of 30.

And read the last three lines of that output before you quote a precision@30 anywhere.
ipTM is published here to two decimal places, so **28 designs are tied at the score that
sits 30th**. Which nine or ten of them your order contains is decided by your sort's tie
behaviour, not by the model: file order gives 10 binders in the top 30, alphabetical order
gives 9. A rounded score is not a ranking. Either carry the unrounded value, or break ties
on something you can defend — scaffold diversity, epitope, a second predictor.

Note what enrichment does *not* say. Among the 53 confirmed binders, every score
correlates with K_D at Spearman +0.10 to +0.17 — the same +0.16 the 2026 campaign
reported. **These filters rank designs by whether they bind at all, and say essentially
nothing about how tightly.**

## What the filters do not catch

The verified failures on this benchmark, in the order they will cost you money.

- **The tightest binder in the set fails the field's standard PAE filter.** The 1.2 nM
  design scores interface PAE 13.6 and would be discarded by `< 10`. More broadly, **29 of
  the 53 binders have interface PAE ≥ 10** — the standard threshold removes 55% of the
  binders to remove 75% of the non-binders.
- **Antibody-format designs are invisible to co-folding confidence.** Two humanised
  nanobodies that bind at 5.2 nM and 18 nM score ipTM 0.21 and interface PAE 27, ranking
  368th and 369th of 378. Co-folding models are known to be weak on antibody–antigen
  interfaces, and the failure here is total, not marginal.
- **Confident non-binders are common.** 81 of the 325 non-binders have interface PAE < 10.
  Confidence is necessary and nowhere near sufficient.
- **Affinity is unpredicted.** See above.
- **Nothing here sees specificity.** A design that binds your target and six others passes
  every filter in this file. Off-target counter-screening is an experiment, not a
  computation.
- **Nothing here sees immunogenicity, aggregation in the actual buffer, or shelf
  stability.** The sequence-liability filters are proxies for problems a binding assay
  never measures, which is why they cannot be validated against a binding benchmark.
- **Target failure is not visible in advance.** In the 2026 campaign the three worst
  targets scored a median 0.68–0.70 against 0.72 for two of the best. A campaign that is
  going to fail on a target looks, in the scores, much like one that will not.
- **Everything here is measured on designs that were already filtered.** The EGFR round 2
  release is 402 designs selected from open submissions, and its 14% base rate is post-
  selection. Enrichment measured inside an already-enriched pool understates what the same
  filter would deliver on a raw pool — and overstates nothing, which is the safer error.

## What needs a licence, and what to use instead

| filter | canonical implementation | licence | permissive substitute |
|---|---|---|---|
| interface ΔG, ΔG/ΔSASA | Rosetta `InterfaceAnalyzer`, PyRosetta | not OSI-licensed; paid licence for commercial use | buried surface area and contact counts, above — weaker, and the loss is real: Overath et al. found Rosetta ΔG/ΔSASA added signal orthogonal to the confidence metrics |
| shape complementarity `Sc` | Rosetta, CCP4 `sc` | as above / CCP4 academic terms | `sc-rs` (MIT), a Rust reimplementation of Lawrence and Colman's algorithm — see below |
| unsatisfied buried H-bonds | Rosetta `BuriedUnsatHbonds` | as above | none this skill knows of |

BindCraft itself is MIT, and its standard install pulls PyRosetta. The **FreeBindCraft**
fork is also MIT and adds a `--no-pyrosetta` mode that swaps in open components: OpenMM
and FASPR for relaxation, FreeSASA or Biopython's Shrake–Rupley for surface area, and
`sc-rs` for shape complementarity. That is the route to BindCraft's filter set without a
Rosetta licence, and its own README is where the commercial-licence requirement on the
standard install is stated.

**`sc-rs` is the one substitute worth the extra dependency**, because nothing in this
file measures the same thing that `Sc` does. It is a CLI and a library, CPU-only, and it
needs a Rust toolchain — which is why no block here runs it. Add it if shape
complementarity is load-bearing for you; otherwise treat every Rosetta-derived number in
the threshold table as provenance for *where the field draws the line*, not as something
these blocks compute.

## Try it

Score the standard filters against a public labelled benchmark. Runs cold in an empty
directory with nothing but `curl` and the system Python — no venv, no packages.

**Data.** The Adaptyv Bio EGFR protein design competition round 2 result summary: 402
designs from open submission, expressed by cell-free synthesis and measured by SPR in one
laboratory, with a binder call, K_D where fitted, and the organisers' own ColabFold
AlphaFold2-multimer scores. Data under ODbL, code under Apache-2.0, no account needed.
Confirmed reachable 2026-08-27.

```bash
mkdir -p binder-filter-check && cd binder-filter-check

curl -sSL -o egfr_round2.csv \
  https://raw.githubusercontent.com/adaptyvbio/egfr_competition_2/main/results/result_summary.csv

python3 - <<'PY'
import csv

rows = list(csv.DictReader(open("egfr_round2.csv")))
scored = [r for r in rows
          if r["binding"] in ("true", "false") and r["pae_interaction"] and r["iptm"]]
y = [r["binding"] == "true" for r in scored]
base = sum(y) / len(y)

print(f"designs in release        {len(rows)}")
print(f"labelled and scored       {len(scored)}")
print(f"confirmed binders         {sum(y)}")
print(f"base rate                 {base:.3f}\n")

def report(label, keep):
    sub = [r for r in scored if keep(r)]
    hit = sum(r["binding"] == "true" for r in sub)
    if not sub:
        print(f"{label:<34s} kept   0")
        return
    print(f"{label:<34s} kept {len(sub):3d}  binders {hit:2d}  "
          f"precision {hit/len(sub):.3f}  recall {hit/sum(y):.3f}  "
          f"enrichment {(hit/len(sub))/base:.2f}x")

report("no filter", lambda r: True)
report("interface PAE < 10", lambda r: float(r["pae_interaction"]) < 10)
report("ipTM >= 0.8", lambda r: float(r["iptm"]) >= 0.8)
report("binder pLDDT >= 80", lambda r: float(r["plddt"]) >= 80)
report("all three, AND-stacked",
       lambda r: float(r["pae_interaction"]) < 10 and float(r["iptm"]) >= 0.8
       and float(r["plddt"]) >= 80)

top = sorted(scored, key=lambda r: (-float(r["iptm"]), r["name"]))[:30]
hit = sum(r["binding"] == "true" for r in top)
print(f"\ntop 30 by ipTM                     binders {hit:2d}/30  "
      f"precision {hit/30:.3f}  enrichment {(hit/30)/base:.2f}x")

lost = [r for r in scored
        if r["binding"] == "true" and float(r["pae_interaction"]) >= 10]
print(f"binders that PAE < 10 discards     {len(lost)} of {sum(y)}")
tight = min((r for r in lost if r["kd"]), key=lambda r: float(r["kd"]))
print(f"tightest one discarded             {tight['name']}  "
      f"KD {float(tight['kd'])*1e9:.1f} nM  ipTM {tight['iptm']}  "
      f"interface PAE {float(tight['pae_interaction']):.1f}")
PY
```

**Expect.**

*Invariants* — true of this frozen release regardless of any software version. A change
here means the dataset moved, not that a tool did. The release holds 402 designs, 378 of
which carry both a binder call and AlphaFold2 scores, and 53 of those bound. `no filter`
must report `precision` equal to the base rate and `recall 1.000`. The AND-stacked row
must be identical to the `interface PAE < 10` row: the three filters are nested on this
data, and if that ever stops being true the stack has started doing something.

*Observed values*, run 2026-08-27 with Python 3.12.8:

```
designs in release        402
labelled and scored       378
confirmed binders         53
base rate                 0.140

no filter                          kept 378  binders 53  precision 0.140  recall 1.000  enrichment 1.00x
interface PAE < 10                 kept 105  binders 24  precision 0.229  recall 0.453  enrichment 1.63x
ipTM >= 0.8                        kept 213  binders 35  precision 0.164  recall 0.660  enrichment 1.17x
binder pLDDT >= 80                 kept 222  binders 39  precision 0.176  recall 0.736  enrichment 1.25x
all three, AND-stacked             kept 105  binders 24  precision 0.229  recall 0.453  enrichment 1.63x

top 30 by ipTM                     binders  9/30  precision 0.300  enrichment 2.14x
binders that PAE < 10 discards     29 of 53
tightest one discarded             round1zeroshot.K5Q_N70S_K71R_N73T_S87T_N88D_R179K_K183R_E213D_S214P  KD 1.2 nM  ipTM 0.92  interface PAE 13.6
```

The last two lines are the point of the exercise. The standard filter discards 29 of the
53 binders, including the tightest one in the set.

## How to spend an order

A defensible protocol, in the order the evidence supports it.

1. **Cheap structural screens first**, before any prediction compute — sequence novelty
   against known proteins, redundancy against your own set, composition sanity. The 2026
   campaign did this and it is the only free step.
2. **One seed per predictor to screen**, five seeds per predictor to rank the survivors.
   Max over seeds.
3. **Rank by interface confidence**, computed per chain pair from the PAE matrix, aligned
   on the target and scoring the binder. Do not threshold on a number transferred from
   another target.
4. **Ensemble two or more genuinely different predictors** by z-scoring within the target.
   Not three outputs of one run.
5. **Add self-consistency as a check on the pose**, at low weight — it confirms the model
   is your design rather than a different complex.
6. **Apply developability filters as a veto, not a rank** — odd cysteine counts, and
   length against what your expression format tolerates.
7. **Calibrate on known binders of your target** before you trust the ordering. If your
   score does not rank a known binder of that target above your median design, the score
   is not working on that target and no threshold will fix it.
8. **Spread the order across scaffolds and epitopes.** Rank correlates with binding, and
   the correlation is weak enough that thirty designs from one backbone family is one
   experiment, not thirty.

## Sources

Every threshold and every published number quoted above, in one place.

- Bennett, N. R. *et al.* Improving de novo protein binder design with deep learning.
  *Nat Commun* **14**, 2625 (2023). doi:10.1038/s41467-023-38328-5 — the
  `pae_interaction < 10` and `af2_complex_rmsd < 5 Å` filter, the Type 1 / Type 2 failure
  split, "only ~2.3% of designs pass", and "success rates among the targets remain low
  (<1%)".
- Overath, M. D. *et al.* Predicting experimental success in de novo binder design — a
  meta-analysis of 3,766 experimentally characterised binders. bioRxiv (2025).
  doi:10.1101/2025.08.14.670059 — >200 features over 3,766 designs on 15 targets; the
  AF3-derived ipSAE beats ipAE and ipTM at 1.4× average precision, and Rosetta ΔG/ΔSASA
  and shape complementarity add orthogonal signal. Preprint text is CC BY-NC-ND, so it is
  cited here and not reproduced.
- Dunbrack, R. L. Rēs ipSAE loquuntur — what's wrong with AlphaFold's ipTM score and how
  to fix it. bioRxiv (2025). Reference implementation:
  https://github.com/DunbrackLab/IPSAE (MIT), whose `Example/` directory supplies the
  AURKA/TPX2 and RAF1/KSR1/MEK1 files used above.
- Lawrence, M. C. and Colman, P. M. Shape complementarity at protein/protein interfaces.
  *J Mol Biol* **234**, 946–950 (1993) — the `Sc` statistic, and the finding that
  antibody/antigen interfaces are less complementary than protease–inhibitor and
  oligomeric ones.
- Mirabello, C. and Wallner, B. DockQ v2. https://github.com/bjornwallner/DockQ (MIT) —
  the 0.23 / 0.49 / 0.80 quality bands, printed by the tool itself.
- BindCraft, https://github.com/martinpacesa/BindCraft (MIT), file
  `settings_filters/default_filters.json` — every BindCraft threshold quoted above.
  FreeBindCraft, https://github.com/cytokineking/FreeBindCraft (MIT), for the
  `--no-pyrosetta` path; `sc-rs`, https://github.com/cytokineking/sc-rs (MIT), for open
  shape complementarity.
- ColabDesign, https://github.com/sokrypton/ColabDesign — `get_pae_loss` divides PAE by
  31, which is what converts BindCraft's `i_pAE ≤ 0.35` into ≈10.9 Å.
- AlphaFold 3 documentation, `docs/output.md`,
  https://github.com/google-deepmind/alphafold3 — ipTM above 0.8 confident, below 0.6
  failed, and pLDDT defined as a per-atom estimate.
- Adaptyv Bio EGFR protein design competition, round 2 (2024).
  https://github.com/adaptyvbio/egfr_competition_2 — data ODbL, code Apache-2.0. The
  labelled benchmark used throughout. Round 1 is at
  https://github.com/adaptyvbio/egfr_competition_1 and carries no binder labels.
- Anthropic. Autonomous de novo protein binder design, 2026.
  https://www-cdn.anthropic.com/30bf50e22a01388bb29bf077ee3f244531594b7a.pdf — the
  five-seeds-per-predictor protocol, the ipSAE-plus-sc-DockQ ensemble
  (macro-AP 0.66 versus 0.62 for the best single predictor and 0.45 for sc-DockQ alone),
  the 26.8% and 49% hit rates, the +0.16 score-to-affinity correlation, and the finding
  that median score did not separate the failing targets in advance.
- RCSB PDB entries 1BRS, 1OL5, 1UBQ, 1BJ1. https://www.rcsb.org
