---
name: afm-lis
description: Decide whether a predicted protein complex is a real interaction and which residues form its interface, by scoring AlphaFold3, AlphaFold-Multimer, ColabFold, Boltz, Chai-1 or OpenFold3 output with the Local Interaction Score.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-interaction, protein-structure, pae, alphafold, ppi]
covers: [ilis, lis, lia, local interaction score, protein-protein interaction, ppi, interface residues, pae, predicted aligned error, alphafold-multimer, colabfold, alphafold3, boltz, chai-1, openfold3, iptm, ipsae, pdockq, slim, short linear motif, disordered region, transient interaction, complex prediction, interface confidence, binding partner]
datasets: [https://raw.githubusercontent.com/flyark/AFM-LIS/main/lis.py, https://zenodo.org/records/17063524/files/Dmelanogaster_CtBp_Prospero_EALSLVV_unrelaxed_rank_001_alphafold2_multimer_v3_model_2_seed_000.pdb, https://zenodo.org/records/17063524/files/Dmelanogaster_CtBp_Prospero_EALSLVV_scores_rank_001_alphafold2_multimer_v3_model_2_seed_000.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-09-27
  against: AFM-LIS lis.py at commit 29144b9 dated 2026-09-26 / Python 3.11.15 / numpy 2.4.6 / scipy 1.17.1 / Zenodo record 17063524 fetched 2026-09-27 / cutoffs read from the AFM-LIS README at that commit
  executed: 7
  unverified: 0
---
# Does this predicted complex mean they interact?

A structure predictor will fold any pair of sequences you hand it and return a confident
looking model either way. The question that follows is whether the interface in that model
is real, and the global confidence numbers answer it badly for the most interesting cases.

`ipTM` is averaged over the whole complex. When two proteins touch through a short motif
inside a long disordered region — which is how a large share of regulatory interactions
work — the confidently predicted contact is a few residue pairs against hundreds of
unconfident ones, and the average buries it. A real interaction scores low, and you discard
it.

The Local Interaction Score inverts that: it looks only at the part of the interface the
predictor was confident about, and asks how good *that* is. This skill runs it, reads the
output, and states what each number does and does not license you to conclude.

It scores predictions. It does not make them — `alphafold`, `protenix`, `boltzgen`,
`pxdesign` and `boltz2-nim` are the skills that produce the input.

## What you need

- **A prediction you have already run**, with its PAE matrix. AlphaFold3 (local or server
  layout), AlphaFold-Multimer, ColabFold, Boltz-1 and Boltz-2, Chai-1 and OpenFold3 are all
  recognised automatically. The PAE is the load-bearing input — a folder holding only
  coordinates cannot be scored at all.
- **Python 3.8 or newer, with numpy and scipy.** Nothing else.
- **`lis.py`**, a single file from the AFM-LIS repository, MIT licensed.

No API key, no account, no licence to accept and no GPU. Scoring is CPU-only and takes
well under a second per model, so the cost is entirely in the prediction you already paid
for.

## Get the scorer

Download to a temporary name and move it into place only on success. `curl` writes a
truncated file or an HTML error page under the target name otherwise, and a half-written
Python file fails with a syntax error that tells you nothing about the real cause. `-f`
makes an HTTP error a non-zero exit instead of a saved error page.

```bash
curl -fsSL -o lis.py.part https://raw.githubusercontent.com/flyark/AFM-LIS/main/lis.py
mv lis.py.part lis.py
python3 lis.py --help | head -4
```

## Get a prediction to score

The worked example below is a real published AlphaFold2-Multimer run: *Drosophila* CtBP
against a seven-residue Prospero peptide carrying the `EALSLVV` motif, deposited under
CC-BY-4.0. It is a good example precisely because the second chain is a short linear motif,
which is the case global scores handle worst.

```bash
mkdir -p prediction
BASE=https://zenodo.org/records/17063524/files
STEM=Dmelanogaster_CtBp_Prospero_EALSLVV
MODEL=rank_001_alphafold2_multimer_v3_model_2_seed_000
curl -fsSL -o "prediction/${STEM}_unrelaxed_${MODEL}.pdb" "$BASE/${STEM}_unrelaxed_${MODEL}.pdb"
curl -fsSL -o "prediction/${STEM}_scores_${MODEL}.json" "$BASE/${STEM}_scores_${MODEL}.json"
ls -1 prediction
```

ColabFold writes the PAE into the `scores_*` JSON, and the scorer pairs it with the
`unrelaxed_*` structure of the **same rank and model number**. Keep those two filenames
intact; the pairing is read off them.

## Score it

```bash
python3 lis.py prediction -d results
```

## What the numbers mean

Four quantities do the work, and they are built in two steps.

The first step is confidence. Every inter-chain residue pair whose PAE is at or below
**12 Å** counts as part of the local interface. `LIA` is how many such pairs there are, and
`LIS` is the mean confidence across them, rescaled so that higher is better. This alone has
a failure mode: a handful of pairs can be confidently placed relative to each other and
still be nowhere near touching.

The second step is physical contact. `cLIA` and `cLIS` are the same two quantities computed
over the subset that is *also* within **8 Å** Cβ to Cβ. Then

```
iLIS = sqrt(LIS × cLIS)
```

A geometric mean is the point rather than a detail. If nothing in the confident interface is
actually in contact, `cLIS` is zero and `iLIS` is zero however good `LIS` looked.

```python
import csv, glob, math

row = list(csv.DictReader(open(glob.glob('results/*.csv')[0])))[0]
LIS, cLIS, iLIS = (float(row[k]) for k in ('LIS', 'cLIS', 'iLIS'))

print(f"chains        : {row['chain_i']} ({row['len_i']} aa) + {row['chain_j']} ({row['len_j']} aa)")
print(f"LIS / cLIS    : {LIS:.4f} / {cLIS:.4f}")
print(f"iLIS          : {iLIS:.4f}   (recomputed {math.sqrt(LIS * cLIS):.4f})")
print(f"LIA / cLIA    : {row['LIA']} / {row['cLIA']}")
print(f"ipTM          : {row['ipTM']}")
print(f"interface on {row['chain_i']}: {row['cLIR_indices_i']}")

assert abs(math.sqrt(LIS * cLIS) - iLIS) < 5e-4
print(f"verdict       : iLIS {'>=' if iLIS >= 0.223 else '<'} 0.223")
```

`cLIR_indices_*` is the part to carry forward. Those are the contact-filtered interface
residues per chain, which is the answer to "where do they touch" and the input to a
mutagenesis design.

## The cutoffs, and what they are calibrated on

Two frameworks are published. **Use `iLIS` alone unless you have a reason not to**, and
never mix a threshold from one with a metric from the other.

| framework | interaction supported when |
|---|---|
| iLIS (current, recommended) | `iLIS` ≥ **0.223** |
| LIS + LIA (original) | best `LIS` ≥ **0.203** and best `LIA` ≥ **3432**, or average `LIS` ≥ **0.073** and average `LIA` ≥ **1610** |

"Best" and "average" in the second row are taken across the models of one prediction, not
across one model. The scorer emits one row per model, so that aggregation is yours to do.

**Where these came from matters more than their precision.** Both were fitted against
yeast two-hybrid reference sets in yeast, fly and human. That makes them calibrated for
"would this pair register in a binary interaction assay", on those organisms. A cutoff
carried onto a different organism, a different interaction class or a screen with a very
different prior is an assumption you are making, not one the number carries. Rank by
`iLIS` and take the cutoff as a starting point.

## Why the contact filter earns its place

This is a constructed three-chain case, not biology — the geometry is chosen so the
mechanism is visible. Chains A and B sit within contact distance; C is placed too far from A
to touch it, while all inter-chain PAE values are confidently low.

```python
import os, json, subprocess, csv, glob

JOB, CH, NRES = 'trimer_A_B_C', ['A', 'B', 'C'], 4
d = os.path.join('constructed', JOB)
os.makedirs(d, exist_ok=True)

hdr = ['group_PDB', 'id', 'type_symbol', 'label_atom_id', 'label_alt_id', 'label_comp_id',
       'label_asym_id', 'label_entity_id', 'label_seq_id', 'pdbx_PDB_ins_code',
       'Cartn_x', 'Cartn_y', 'Cartn_z', 'occupancy', 'B_iso_or_equiv',
       'auth_asym_id', 'auth_seq_id', 'pdbx_PDB_model_num']
lines = ['data_' + JOB, '#', 'loop_'] + ['_atom_site.' + h for h in hdr]
aid = 0
for ci, ch in enumerate(CH):                      # chains 6 A apart in y: A-B touch, A-C do not
    for res in range(1, NRES + 1):
        for atom in ('N', 'CA', 'C', 'O', 'CB'):
            aid += 1
            y = ci * 6.0 + {'N': -0.5, 'CA': 0.0, 'C': 0.5, 'O': 1.0, 'CB': 1.5}[atom]
            lines.append('ATOM %d %s %s . ALA %s %d %d ? %.3f %.3f %.3f 1.00 88.00 %s %d 1'
                         % (aid, atom[0], atom, ch, ci + 1, res, res * 4.0, y, 0.0, ch, res))
lines.append('#')
open(os.path.join(d, JOB + '_model.cif'), 'w').write('\n'.join(lines) + '\n')

n = len(CH) * NRES
tc = [c for c in CH for _ in range(NRES)]
json.dump({'pae': [[0.5 if i == j else (2.0 if tc[i] == tc[j] else 6.0)   # every pair confident
                    for j in range(n)] for i in range(n)],
           'token_chain_ids': tc,
           'token_res_ids': [r for _ in CH for r in range(1, NRES + 1)],
           'atom_plddts': [88.0] * (n * 5)},
          open(os.path.join(d, JOB + '_confidences.json'), 'w'))
json.dump({'iptm': 0.8, 'ptm': 0.75, 'ranking_score': 0.8},
          open(os.path.join(d, JOB + '_summary_confidences.json'), 'w'))

subprocess.run(['python3', 'lis.py', 'constructed', '-d', 'constructed_results'], check=True)
for r in csv.DictReader(open(glob.glob('constructed_results/*.csv')[0])):
    print(f"{r['chain_i']}+{r['chain_j']}  LIA={r['LIA']:>6}  cLIA={r['cLIA']:>5}  iLIS={r['iLIS']}")
```

A three-chain complex yields **three rows**, one per unordered chain pair — so never read
row 0 as "the answer" for anything past a dimer. And the A+C row carries a full confident
`LIA` with `cLIA` at zero, which drives `iLIS` to exactly `0.0000`. Under `LIS` alone that
pair would have scored as well as the two real contacts.

## Traps

**A model that fails to parse does not change the exit status.** This is the one to
engineer around. A missing path, an empty directory and a wrongly forced `--platform` all
exit non-zero. But a model the scorer finds and then cannot read — most often a folder with
coordinates and no PAE — is reported as `FAIL` on stdout, written to no CSV row, and the
process still exits **0**. A batch job that trusts the exit status records silent success
for a screen that scored nothing.

```bash
mkdir -p broken
cp prediction/*_unrelaxed_*.pdb broken/
python3 lis.py broken -d broken_results > broken.log 2>&1
echo "exit status : $?"
echo "data rows   : $(tail -n +2 broken_results/*.csv | grep -c . || true)"
grep -c FAIL broken.log
```

Count rows, or grep for `FAIL`. Do not branch on `$?`.

**Changing a cutoff invalidates the published thresholds.** `--pae-cutoff` and `--cb-cutoff`
are adjustable, and 12 Å and 8 Å are the values every number in the table above was fitted
at. Tightening PAE to 8 Å on the worked example moves `iLIS` from `0.5540` to `0.4413` —
still above `0.223`, but a pair near the line would cross it. If you change them, you own
recalibration.

**`--allow-pickle` executes arbitrary code.** Raw AlphaFold2 `result_*.pkl` files carry a
readable PAE, and the flag that reads them ships disabled for a good reason — loading a
pickle hands control to whoever wrote it. Only ever use it on files you generated yourself — and
check before reaching for it at all, because a pipeline that emits the pickle has
almost certainly emitted the same matrix as JSON too, which the scorer reads with no
flag and no code execution.

**An interface is not an affinity, and one prediction is not a measurement.** `iLIS` above
the cutoff means the predictor placed a contact confidently and consistently. It does not
give a `Kd`, it does not establish that the pair meets in a cell, and a single model is a
screening result. Rank with it, then test.

## When the layout is not recognised

Rather than renaming files to fool auto-detection, declare the layout in a `lis.json` beside
the predictions, or pass `--manifest`. Globs are relative to that folder and every field is
optional.

```json
{"structure": "*_model.cif", "pae": "*_confidences.json", "pae_key": "pae"}
```

For irregular naming or mixed sub-directories, name each model explicitly instead:

```json
{"models": [{"name": "runA", "structure": "runA/ranked_0.pdb", "pae": "runA/pae.json", "pae_key": "predicted_aligned_error"}]}
```

The manifest is consulted before auto-detection, and the error raised on an unreadable PAE
points here.

## Where this sits next to the other skills

`binder-design-filtering` answers a different question with an overlapping toolkit: given
thousands of *de novo* designs, which few do you pay to synthesise. Its thresholds are
fitted on design competition data and it optimises a spend decision. This skill asks whether
a pair of proteins interact at all and where, with cutoffs fitted on interaction assays. Use
that one to rank designs; use this one to triage a predicted interaction.

Both read the PAE matrix, and `lis.py` also reports `ipSAE`, `pDockQ` and `pDockQ2`, so the
CSV here can feed the filters described there.

## Try it

A self-contained check that this skill still works. Public data, no account, no key.

**Data** — one published AlphaFold2-Multimer model of *Drosophila* CtBP with a seven-residue
Prospero `EALSLVV` peptide, from Zenodo record
[17063524](https://doi.org/10.5281/zenodo.17063524), CC-BY-4.0:

    https://zenodo.org/records/17063524/files/Dmelanogaster_CtBp_Prospero_EALSLVV_unrelaxed_rank_001_alphafold2_multimer_v3_model_2_seed_000.pdb
    https://zenodo.org/records/17063524/files/Dmelanogaster_CtBp_Prospero_EALSLVV_scores_rank_001_alphafold2_multimer_v3_model_2_seed_000.json

Both files are needed — the structure alone cannot be scored. The scorer itself is fetched
from `main`, so it tracks upstream. Last confirmed reachable 2026-09-27.

```bash
set -eu
curl -fsSL -o lis.py.part https://raw.githubusercontent.com/flyark/AFM-LIS/main/lis.py
mv lis.py.part lis.py

mkdir -p tryit
BASE=https://zenodo.org/records/17063524/files
STEM=Dmelanogaster_CtBp_Prospero_EALSLVV
MODEL=rank_001_alphafold2_multimer_v3_model_2_seed_000
curl -fsSL -o "tryit/${STEM}_unrelaxed_${MODEL}.pdb" "$BASE/${STEM}_unrelaxed_${MODEL}.pdb"
curl -fsSL -o "tryit/${STEM}_scores_${MODEL}.json" "$BASE/${STEM}_scores_${MODEL}.json"

python3 lis.py tryit -d tryit_results

python3 - <<'PY'
import csv, glob, math
rows = list(csv.DictReader(open(glob.glob('tryit_results/*.csv')[0])))
assert len(rows) == 1, f"expected one chain pair, got {len(rows)}"
r = rows[0]
LIS, cLIS, iLIS = (float(r[k]) for k in ('LIS', 'cLIS', 'iLIS'))

assert abs(math.sqrt(LIS * cLIS) - iLIS) < 5e-4, "iLIS is not sqrt(LIS x cLIS)"
assert 0.0 <= iLIS <= 1.0 and 0.0 <= LIS <= 1.0 and 0.0 <= cLIS <= 1.0
assert int(r['len_i']) == 476 and int(r['len_j']) == 7
assert float(r['cLIA']) <= float(r['LIA'])
assert int(r['cLIR_i']) <= int(r['LIR_i'])
assert iLIS >= 0.223, "worked example should clear the published cutoff"

print("chain pair    :", r['chain_i'], "+", r['chain_j'], f"({r['len_i']} + {r['len_j']} aa)")
print("LIS / cLIS    : %.4f / %.4f" % (LIS, cLIS))
print("iLIS          : %.4f  (sqrt(LIS x cLIS) = %.4f)" % (iLIS, math.sqrt(LIS * cLIS)))
print("LIA / cLIA    :", r['LIA'], "/", r['cLIA'])
print("ipTM / ipSAE  :", r['ipTM'], "/", r['ipSAE'])
print("interface on", r['chain_i'], ":", r['cLIR_indices_i'])
print("interface on", r['chain_j'], ":", r['cLIR_indices_j'])
PY
```

**Expect**

Invariants — these hold regardless of upstream version, and a failure means the skill is
wrong:

- One row per unordered chain pair. This two-chain prediction gives exactly **one** row; a
  three-chain one gives three.
- `iLIS` equals `sqrt(LIS × cLIS)` to four decimal places. This is the documented identity,
  and checking it is what confirms the two components are being combined as described.
- `LIS`, `cLIS` and `iLIS` all lie in 0–1.
- The contact-filtered quantities are subsets — `cLIA` ≤ `LIA` and `cLIR_i` ≤ `LIR_i`.
- Chain lengths are 476 and 7. The short chain is the motif; if this changes, the file is
  not the one described here.
- Scoring needs the PAE. Delete the `scores_*` JSON and the same folder yields zero rows —
  while still exiting 0.

Observed 2026-09-27, against `lis.py` at commit `29144b9` — these move if upstream changes
the metric or its defaults, so treat a mismatch as drift to investigate, not as a failure:

```
chain pair    : A + B (476 + 7 aa)
LIS / cLIS    : 0.4152 / 0.7392
iLIS          : 0.5540  (sqrt(LIS x cLIS) = 0.5540)
LIA / cLIA    : 3933.0 / 62.0
ipTM / ipSAE  : 0.9200 / 0.4923
interface on A : [31-32,36,38,41-42,50-56,61-63,65-66]
interface on B : [1-7]
```

The interface it reports on chain B is the whole seven-residue peptide, and on chain A a
discontinuous set of about twenty residues in the 31–66 region. `iLIS` of `0.5540` sits well
above the `0.223` cutoff. Note that `ipTM` is also high here at `0.92`, so this particular
pair is not one global confidence would have missed — it is a clean positive by both
routes, which is what makes it a good regression case.

## Sources

- AFM-LIS, the reference implementation and the source of every cutoff quoted above —
  <https://github.com/flyark/AFM-LIS> (MIT). Cutoffs read from its README at commit
  `29144b9`.
- LIVIA, a browser-based viewer for the same scores that runs locally with no install —
  <https://flyark.github.io/LIVIA/> (MIT).
- Kim et al. 2026, FlyPredictome, which defines `iLIS` and fits the `0.223` cutoff —
  <https://doi.org/10.64898/2026.04.14.718529>.
- Kim et al. 2024, the original LIS and LIA framework —
  <https://doi.org/10.1101/2024.02.19.580970>.
- Worked-example data, Rovenko, Girych and Hietakangas, AlphaFold2 Multimer structural
  models for the CtBP-Prospero interaction — <https://doi.org/10.5281/zenodo.17063524>
  (CC-BY-4.0).
