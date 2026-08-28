---
name: proteinmpnn
description: Design amino acid sequences for a fixed protein backbone with ProteinMPNN — inverse folding on CPU, chain and position constraints, homooligomer tying, and the soluble and CA-only checkpoints. Covers what native-sequence recovery does and does not tell you, and the silent ways a backbone stops being designed.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-design, inverse-folding, protein-structure, proteinmpnn]
datasets: [https://files.rcsb.org/download/1UBQ.pdb, https://raw.githubusercontent.com/dauparas/ProteinMPNN/main/vanilla_model_weights/v_48_020.pt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: ProteinMPNN at commit 8907e66 (repository HEAD, last pushed 2024-08-14) / weights v_48_002, v_48_010, v_48_020, v_48_030 vanilla, soluble and CA-only / torch 2.13.0, numpy 2.5.2, Python 3.12.8 / CPU device on arm64 macOS, Apple M1 Max / structures from RCSB PDB
  executed: 17
  unverified: 0
---

# Inverse folding with ProteinMPNN

ProteinMPNN answers one question: given these backbone coordinates, what amino acid
sequence would fold into them? It is a message-passing graph network over backbone
geometry, not a language model over sequences, and it does not know what the protein is
for. Point it at a backbone and it returns sequences; whether those sequences fold, express
or function is a separate question this page is careful not to blur into the first one.

Two properties make it the default for this job. It is small — every inference checkpoint is
under 7 MB — so it runs on a laptop CPU in seconds, and it takes constraints: fix a chain,
fix a position, tie residues across chains so a homooligomer gets one gene instead of three.

The part that costs people real experiments is not the model. It is that a backbone can
stop being designed without the tool saying so, and the output looks the same either way.
Most of this page is about detecting that.

## What a reader must obtain

Nothing gated. The code and every checkpoint live in one public GitHub repository,
`dauparas/ProteinMPNN`, and clone anonymously — no account, no token, no request form, no
click-through.

On licensing, what is actually in the repository as of 27 Aug 2026: a single `LICENSE` file
at the root, the MIT License, `Copyright (c) 2022 Justas Dauparas`, and a byte-identical
copy at `training/LICENSE`. The weight files sit in `vanilla_model_weights/`,
`soluble_model_weights/` and `ca_model_weights/` inside that same repository, and there is
no separate terms file, notice, or licence statement attached to them anywhere in the tree
or in the README.

**No GPU is required and none is used by default.** The runner selects CUDA only when
`torch.cuda.is_available()`, so on a machine without an NVIDIA card it runs on CPU without
being asked to, including on Apple silicon — it does not reach for Metal. Every number on
this page was measured that way. See *How long this takes on CPU* for the scaling.

What you do need: **Python 3**, **PyTorch**, **NumPy**, and about **200 MB of disk** for the
clone, which is nearly all model weights. The repository states no tighter version bound
than that; this page was verified on Python 3.12.8 with torch 2.13.0 and numpy 2.5.2.

## Install

The clone is the install — there is no PyPI package for ProteinMPNN, and nothing to build.

```bash
python3 -m venv venv
./venv/bin/pip install --disable-pip-version-check torch numpy
git clone --depth 1 https://github.com/dauparas/ProteinMPNN.git
du -sh ProteinMPNN
```

Everything below assumes that layout — a `venv/` and a `ProteinMPNN/` beside each other,
commands run from the directory containing both.

## The first design

Ubiquitin, one chain, 76 residues. `--seed` matters: leave it at its default of `0` and the
runner picks a random one, so nothing you do is reproducible.

```bash
curl -fsSL -o 1UBQ.pdb https://files.rcsb.org/download/1UBQ.pdb
./venv/bin/python ProteinMPNN/protein_mpnn_run.py \
    --pdb_path 1UBQ.pdb --out_folder design \
    --num_seq_per_target 4 --sampling_temp 0.1 --seed 37
cat design/seqs/1UBQ.fa
```

Two things about that invocation are load-bearing.

Use `curl -f`. RCSB answers a missing entry — or one whose structure is too large for the
PDB format to hold — with an HTML error page under a 404, and without `-f` curl writes that
page into `1UBQ.pdb`. ProteinMPNN then dies inside its featurizer with
`ValueError: need at least one array to concatenate`, which names nothing useful. It does
exit non-zero, so a pipeline that checks status codes will notice; one that checks only for
an output file will find an empty `seqs/` directory.

**Name the file after the PDB ID, in the case you intend to use everywhere else.** The
output FASTA and every JSON key described under *Constraining the design* are keyed on the
input file's **basename**, never on the identifier inside the file. Download to `1ubq.pdb`
and the result is `design/seqs/1ubq.fa` and the fixed-position key is `1ubq`; a JSON written
against `1UBQ` then fails with a bare `KeyError: '1ubq'` from inside the featurizer. macOS
hides half of this — its filesystem is case-insensitive, so reading `1ubq.fa` as `1UBQ.fa`
succeeds locally and the same script fails on Linux. Pick one spelling and keep it.

The output is a FASTA whose first record is the **native** sequence read off the structure,
followed by one record per design:

```text
>1UBQ, score=1.3470, global_score=1.3470, fixed_chains=[], designed_chains=['A'], model_name=v_48_020, git_hash=8907e6671bfbfc92303b5f79c4b5e6ce47cdef57, seed=37
MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG
>T=0.1, sample=1, score=0.7958, global_score=0.7958, seq_recovery=0.5263
MTIKVKFEDGTTLELEVSPDDTIANLKKKIEEKTGIPPEEQVLIYKGEVLEDDKTLADYNIEEGDTIELRLVPKGG
```

- **`score`** — mean negative log probability, in nats, of the sampled residue at each
  **designed** position. Lower is better. It is a self-assessment, not a measurement.
- **`global_score`** — the same average taken over every residue in every chain, including
  chains and positions that were held fixed. Identical to `score` when the whole structure
  was designed, which is why they match above.
- **`seq_recovery`** — the fraction of designed positions where the sampled residue equals
  the native one. Its denominator is narrower than it looks; see below.
- **`fixed_chains` / `designed_chains`** — chains, only. Neither field reflects fixed
  *positions*, and neither reflects the positions described under *Five ways a backbone
  stops being designed*.

## What `seq_recovery` actually counts

The denominator is not the sequence length. It is the number of positions that were
**both** designable and structurally resolved: residues in a designed chain, not held
fixed, and carrying a complete `N`, `CA`, `C`, `O` backbone. Everything else is dropped
from numerator and denominator alike.

This is worth pinning down rather than assuming, because it is the number people quote.

```python
def read_fasta(path):
    lines = open(path).read().strip().split("\n")
    native = lines[1]
    designs = [(float(h.split("seq_recovery=")[1]), s)
               for h, s in zip(lines[2::2], lines[3::2])]
    return native, designs

native, designs = read_fasta("design/seqs/1UBQ.fa")
for reported, seq in designs:
    matches = sum(a == b for a, b in zip(native, seq))
    print("reported %.4f   recomputed %d/%d = %.4f"
          % (reported, matches, len(native), matches / len(native)))
```

For a fully resolved single-chain structure with nothing fixed, the two agree exactly. The
interesting cases are the ones where they do not, and each of those is a case where
ProteinMPNN quietly designed less of your protein than you asked it to.

Barnase–barstar (`1BRS`, six chains, 592 parsed residues) is the small worked example: two
residues in that entry are missing only their backbone `O` atom, and the reported recovery
is `321/586`, not `323/588`. Two residues out of 592 does not change a conclusion. Sixteen
does, and the next section is how that happens.

## Five ways a backbone stops being designed

Each of these is silent. The header still reads `designed_chains=['A']`, no warning is
printed, and the FASTA is the length you expected.

**1. A residue missing any backbone atom is copied from the native sequence, not
designed.** Delete the `O` atom from residues 10–25 of ubiquitin — change nothing else —
and those sixteen positions come back exactly native in every sample, and vanish from the
recovery denominator. Nothing in the output says so. Incomplete backbones are ordinary in
deposited crystal structures, and a truncated terminus or a poorly resolved loop is enough.

**2. Unresolved residues become `X` in the native sequence and in the design.** Where the
residue numbering spans a gap, the parser pads it, so the parsed chain is longer than the
observed one and the missing positions carry `X`. In the SARS-CoV-2 spike trimer `6VXX`
that is 447 of 3363 positions. The model designs none of them, and the output FASTA
contains `X` characters that are not amino acids — order that sequence and you are ordering
nothing.

**3. Only protein backbones are visible. Everything else contributes nothing.** Nucleic
acids, ligands, metals, cofactors and waters are not seen — not as context, not at all. In
`1TUP`, p53 bound to its DNA response element, the two DNA strands are parsed as 21-residue
chains of `X`, they are listed in `designed_chains`, and they provide zero structural
context. The DNA-binding surface is designed as though it faced solvent. This is the
limitation with the largest scientific consequence on the page, and it applies to every
binding site defined by a non-protein partner.

**4. When you fix chains, the fixed chains are not in the output.** Both the native and the
designed FASTA records contain the designed chains only. Reassembling the complex is your
job, and a script that assumes the record round-trips the whole input will misalign.

**5. mmCIF is not parsed.** The parser reads fixed-width PDB columns and dies on a `.cif`
file with `ValueError: could not convert string to float`. Structures too large for the PDB
format — over 62 chains or 99,999 atoms — are distributed as mmCIF only, and are therefore
out of reach without converting first.

Run this before every design. It reports what the parser will actually see, which is the
only thing that matters:

```python
import collections

BACKBONE = {"N", "CA", "C", "O"}
NUCLEIC = {"DA", "DC", "DG", "DT", "DI", "A", "C", "G", "U", "I"}

def preflight(path):
    atoms, order, present = collections.defaultdict(set), [], set()
    model = 0
    for line in open(path):
        if line.startswith("MODEL"):
            model += 1
            if model > 1:
                break                       # only the first model is ever used
        if line.startswith(("ATOM", "HETATM")):
            key, name = (line[21], line[22:27]), line[17:20].strip()
            if key not in atoms:
                order.append((key, name))
            atoms[key].add(line[12:16].strip())
            present.add(name)
    # A residue counts as protein only if it has a CA. That filter is what keeps waters,
    # ions and ligands out of the report — HOH's single atom is named O, so a naive
    # "has some backbone atom" test flags every water in the file as a broken residue.
    prot = [(k, r) for k, r in order if "CA" in atoms[k]]
    partial = [(k, r) for k, r in prot if not BACKBONE <= atoms[k]]
    chains = collections.Counter(k[0] for k, _ in prot)
    gaps = []
    for ch in chains:
        nums = sorted({int(k[1][:4]) for k, _ in prot if k[0] == ch})
        gaps += [(ch, a, b) for a, b in zip(nums, nums[1:]) if b - a > 1]
    print("protein chains ", dict(chains))
    print("partial bbone  ", len(partial),
          [f"{k[0]}{k[1].strip()} {r} missing {sorted(BACKBONE - atoms[k])}"
           for k, r in partial[:4]])
    print("numbering gaps ", len(gaps), gaps[:4])
    print("nucleic acid   ", sorted(present & NUCLEIC))
    print("models         ", max(model, 1))
    return partial, gaps

preflight("1UBQ.pdb")
```

`partial bbone` is the line to act on: those residues will be copied from the native
sequence. Either accept that they are fixed and say so when you report recovery, or use the
CA-only checkpoint, which needs nothing but `CA` and therefore designs them. Checked against
19 RCSB entries spanning 46 to 3363 residues, `numbering gaps` predicts the number of `X`
positions ProteinMPNN produces exactly in every case — 447 for `6VXX`, 74 for `1IGT`, 31 for
`1F88`, 4 for `1BRS`, 0 for the twelve entries with no gaps.

Two things this check also settles. Selenomethionine (`MSE`) arrives as `HETATM` and **is**
read, mapping to `M` — the parser is not simply ignoring heteroatom records. And a
multi-model NMR entry such as `1D3Z` is handled: the first model is used, so a 10-model file
yields one 76-residue chain rather than ten concatenated copies.

## Temperature buys diversity, not accuracy

Temperature rescales the per-position distribution before sampling. The usual assumption is
that it trades native recovery for diversity. Measured over 32 designs per temperature on
ubiquitin at seed 37, that trade barely exists below 0.3:

| `--sampling_temp` | mean recovery | mean pairwise identity between designs | mean `score` |
|---|---|---|---|
| 0.0001 | 0.549 | 0.840 | 0.789 |
| 0.05 | 0.551 | 0.837 | 0.791 |
| 0.1 | 0.546 | 0.821 | 0.793 |
| 0.2 | 0.544 | 0.779 | 0.819 |
| 0.3 | 0.544 | 0.708 | 0.880 |
| 0.5 | 0.516 | 0.570 | 1.073 |
| 1.0 | 0.380 | 0.311 | 1.826 |

Recovery is flat from 0.0001 to 0.3 while pairwise identity falls from 84% to 71%. Diversity
is close to free in that range, and only above 0.5 does the model start paying for it. The
upstream default of 0.1 is conservative; 0.2–0.3 is a reasonable place to generate a library.

```bash
for T in 0.0001 0.1 0.3 1.0; do
  ./venv/bin/python ProteinMPNN/protein_mpnn_run.py --pdb_path 1UBQ.pdb \
      --out_folder "temp_$T" --num_seq_per_target 32 \
      --sampling_temp "$T" --seed 37 > /dev/null
done
```

```python
import glob, itertools, statistics

for out in ["temp_0.0001", "temp_0.1", "temp_0.3", "temp_1.0"]:
    native, designs = read_fasta(glob.glob(out + "/seqs/*.fa")[0])
    seqs = [s for _, s in designs]
    rec = [sum(a == b for a, b in zip(native, s)) / len(native) for s in seqs]
    pw = [sum(a == b for a, b in zip(x, y)) / len(x)
          for x, y in itertools.combinations(seqs, 2)]
    print("%-12s unique %2d/%d   recovery %.3f   pairwise identity %.3f"
          % (out, len(set(seqs)), len(seqs), statistics.mean(rec), statistics.mean(pw)))
```

## Low temperature is not deterministic, and the reason matters

At `--sampling_temp 0.0001` the per-position choice is effectively the argmax, so the
sequences should be identical. They are not: all 32 are distinct, and they average 84%
identity to one another. The diversity is coming from somewhere other than the temperature.

It comes from the **decoding order**. ProteinMPNN decodes positions in a random order and
conditions each choice on the residues already placed, so a different order is a different
autoregressive factorisation and gives a different sequence even at zero temperature. That
has three practical consequences.

**The reported `score` is a random variable.** It depends on the decoding order drawn, not
only on the backbone and the sequence. Scoring the same native ubiquitin ten times gives
values from 1.3246 to 1.3661. `--score_only` exists to handle this properly — it repeats the
scoring under `--num_seq_per_target` different decoding orders and reports the spread:

```bash
./venv/bin/python ProteinMPNN/protein_mpnn_run.py --pdb_path 1UBQ.pdb \
    --out_folder scoring --score_only 1 --num_seq_per_target 10 --seed 37 \
    | grep "^Score"
```

That prints `mean: 1.3432, std: 0.0127, sample size: 10`, and saves the per-order values
alongside the integer-encoded sequence in `scoring/score_only/1UBQ_pdb.npz`. Never compare
two single scores; compare means, and quote the standard deviation.

**`--batch_size` changes the output at a fixed seed.** Four sequences generated one at a
time and four generated in a single batch of four are different sequences from the same
seed, because the batch draws its random state differently. Batching is a throughput choice
on a GPU; on CPU it buys little, and pinning `--batch_size 1` is what makes a run
reproducible.

**Reproducibility is per machine.** With `--seed` and `--batch_size` fixed, repeated runs on
one machine are byte-identical. Across architectures, floating-point differences can move a
sampled residue. Record the seed, and treat exact sequences as machine-specific.

## Choosing a checkpoint

Three families ship in the repository. Within each, the checkpoint name encodes two numbers:
`v_48_020` means 48 neighbours in the geometric graph and backbone coordinates noised during
training with a standard deviation of 0.20 Å. The vanilla and soluble families offer
`v_48_002`, `v_48_010`, `v_48_020` and `v_48_030`; the CA-only family stops at `v_48_020`.
Higher noise is more tolerant of an imprecise backbone; the runner echoes the level it loaded
as `Training noise level`, and `v_48_020` is the default and the right starting point.

| directory | flag | trained on | use for |
|---|---|---|---|
| `vanilla_model_weights` | *(default)* | the PDB | anything, unless one of the rows below applies |
| `soluble_model_weights` | `--use_soluble_model` | PDB with membrane proteins excluded | designs that must stay soluble |
| `ca_model_weights` | `--ca_only` | CA traces | backbones with only `CA`, or with incomplete backbones |

The flag is enough — the runner resolves the weight directory relative to its own location
on disk, so none of these needs a path. The README lists only `v_48_010` and `v_48_020` for
the soluble family; that is stale, and the directory in fact ships `v_48_002`, `v_48_010`,
`v_48_020` and `v_48_030`, all four of which load and run.

**Do not also pass `--path_to_model_weights`.** It is checked first and overrides the flags
without saying so. `--use_soluble_model --path_to_model_weights ProteinMPNN/vanilla_model_weights`
loads the vanilla checkpoint, suppresses the `Using ProteinMPNN trained on soluble proteins
only!` line the runner would otherwise print, and returns output byte-identical to a plain
vanilla run. The header reports `model_name=v_48_020` either way and never names the family.
Use the flag; reach for the path only when you keep weights outside the clone.
`--ca_only --use_soluble_model` is the one combination that is caught — it prints
`WARNING: CA-SolubleMPNN is not available yet` and exits without designing anything.

The soluble checkpoint is not a cosmetic variant, and the direction of its effect is
checkable. Bovine rhodopsin (`1F88`) is a seven-transmembrane-helix protein whose native
sequence is largely lipid-facing — precisely what solubleMPNN was trained not to produce:

```bash
curl -fsSL -o 1F88.pdb https://files.rcsb.org/download/1F88.pdb
for M in "" "--use_soluble_model"; do
  ./venv/bin/python ProteinMPNN/protein_mpnn_run.py --pdb_path 1F88.pdb \
      --out_folder "rhod${M:+_soluble}" --num_seq_per_target 4 \
      --sampling_temp 0.1 --seed 37 $M > /dev/null
done
grep -ho "seq_recovery=[0-9.]*" rhod/seqs/1F88.fa rhod_soluble/seqs/1F88.fa
```

Vanilla recovers 0.3484–0.3717 of the native sequence; soluble recovers 0.2644–0.2784. The
soluble checkpoint is actively designing away from the native membrane-facing residues,
which is what you want for a solubilised variant and exactly what you do not want if you are
reproducing a membrane protein.

The CA-only checkpoint is the answer to trap 1. It conditions on `CA` positions alone, so
residues missing `N`, `C` or `O` are designed rather than copied — at the cost of a coarser
model of the backbone:

```bash
./venv/bin/python ProteinMPNN/protein_mpnn_run.py --pdb_path 1UBQ.pdb \
    --out_folder ca --num_seq_per_target 2 --sampling_temp 0.1 --seed 37 --ca_only
head -3 ca/seqs/1UBQ.fa
```

The header confirms which architecture was loaded by reporting `CA_model_name` rather than
`model_name`, and the runner prints `Using CA-ProteinMPNN!` on the way in. Applied to the
O-stripped ubiquitin from trap 1, the CA-only model designs all sixteen of the residues the
default model copied.

On recent PyTorch this path — and only this path, because it is the one computing dihedrals —
emits `UserWarning: Using torch.cross without specifying the dim arg is deprecated`. It is
upstream's, it is harmless, and the results are unaffected.

## Constraining the design

**Whole chains.** Name the chains to design; every other chain becomes fixed context that
the model sees but does not change.

```bash
curl -fsSL -o 1BRS.pdb https://files.rcsb.org/download/1BRS.pdb
./venv/bin/python ProteinMPNN/protein_mpnn_run.py --pdb_path 1BRS.pdb \
    --pdb_path_chains "A" --out_folder barnase --num_seq_per_target 8 \
    --sampling_temp 0.1 --seed 37 > /dev/null
./venv/bin/python ProteinMPNN/protein_mpnn_run.py --pdb_path 1BRS.pdb \
    --out_folder complex --num_seq_per_target 8 \
    --sampling_temp 0.1 --seed 37 > /dev/null
head -2 barnase/seqs/1BRS.fa
```

The header now reads `fixed_chains=['B', 'C', 'D', 'E', 'F'], designed_chains=['A']`, and
`score` (0.6610) and `global_score` (1.2012) differ, because the first covers chain A and the
second covers all six.

Fixed context is real information and the model uses it — but the comparison has to be made
over the *same* residues, because recovery over a different set of positions is simply a
different number:

```python
import statistics

def chain_recovery(path, index=0):
    lines = open(path).read().strip().split("\n")
    native = lines[1].split("/")[index]
    observed = [i for i, c in enumerate(native) if c != "X"]
    out = []
    for design in lines[3::2]:
        d = design.split("/")[index]
        out.append(sum(native[i] == d[i] for i in observed) / len(observed))
    return out

for label, path in [("B-F fixed at native ", "barnase/seqs/1BRS.fa"),
                    ("B-F co-designed     ", "complex/seqs/1BRS.fa")]:
    r = chain_recovery(path)
    print("chain A, %s n=%d  mean %.4f  sd %.4f"
          % (label, len(r), statistics.mean(r), statistics.pstdev(r)))
```

Chain A recovers **0.6354 ± 0.0217** against a fixed native barstar and **0.5787 ± 0.0324**
when all six chains are designed at once. Design a binder against a fixed target, not against
the whole complex.

An unknown chain letter is not validated. `--pdb_path_chains "Z"` raises a bare
`KeyError: 'seq_chain_Z'` from inside the featurizer, exits 1, and writes no output.

**Individual positions.** `--fixed_positions_jsonl` takes a JSON object mapping the PDB
basename to a per-chain list of positions. The indices are **1-based offsets into the parsed
chain sequence, not PDB residue numbers**, and the two differ whenever numbering does not
start at 1 — which is most of the time. For a chain whose first observed residue is numbered
`f`, the index of residue `r` is `r - f + 1`.

```python
import json

json.dump({"1UBQ": {"A": list(range(1, 11))}}, open("fixed.jsonl", "w"))
```

```bash
./venv/bin/python ProteinMPNN/protein_mpnn_run.py --pdb_path 1UBQ.pdb \
    --out_folder fixed --num_seq_per_target 2 --sampling_temp 0.1 --seed 37 \
    --fixed_positions_jsonl fixed.jsonl
head -4 fixed/seqs/1UBQ.fa
```

Every design now begins `MQIFVKTLTG`, the native first ten. `seq_recovery` drops to a
denominator of 66, and `fixed_chains` still reads `[]` — fixed positions are not reported
anywhere in the header.

**Homooligomers.** This one is a correctness bug, not a preference. A homodimer designed
without tying gets an independent sequence per chain: on the immunoglobulin light-chain
dimer `1REI`, whose two chains are identical natives of 107 residues, **none** of sixteen
untied designs returned two matching chains, and the two copies averaged only **74.7%
identity to each other**. That is two different genes for what has to be one protein.

`--tied_positions_jsonl` couples positions across chains so that every copy receives the
same residue. Each entry in the list is one tied group — here, position *i* of chain A with
position *i* of chain B:

```python
import json

tied = [{"A": [i], "B": [i]} for i in range(1, 108)]
json.dump({"1REI": tied}, open("tied.jsonl", "w"))
```

```bash
curl -fsSL -o 1REI.pdb https://files.rcsb.org/download/1REI.pdb
./venv/bin/python ProteinMPNN/protein_mpnn_run.py --pdb_path 1REI.pdb \
    --out_folder tied --num_seq_per_target 16 --sampling_temp 0.1 --seed 37 \
    --tied_positions_jsonl tied.jsonl > /dev/null
./venv/bin/python ProteinMPNN/protein_mpnn_run.py --pdb_path 1REI.pdb \
    --out_folder untied --num_seq_per_target 16 --sampling_temp 0.1 --seed 37 > /dev/null
```

```python
import statistics

for label, path in [("tied  ", "tied/seqs/1REI.fa"), ("untied", "untied/seqs/1REI.fa")]:
    lines = open(path).read().strip().split("\n")
    designs = [d.split("/") for d in lines[3::2]]
    same = sum(d[0] == d[1] for d in designs)
    across = statistics.mean(sum(a == b for a, b in zip(d[0], d[1])) / len(d[0])
                             for d in designs)
    rec = [float(h.split("seq_recovery=")[1]) for h in lines[2::2]]
    print("%s  chains identical %2d/%d   chain-to-chain identity %.3f   recovery %.4f ± %.4f"
          % (label, same, len(designs), across, statistics.mean(rec), statistics.pstdev(rec)))
```

Tied, all sixteen designs return two identical chains. Recovery is unaffected —
**0.6156 ± 0.0175** tied against **0.6113 ± 0.0164** untied, indistinguishable over sixteen
samples — because the two copies of `1REI` sit in near-identical environments, so one sequence
satisfies both at no cost. Expect a real cost only where the copies see genuinely different
surroundings. And do not read a single-sample difference as that cost: sample 1 alone reads
0.5981 tied and 0.6168 untied, which looks like a 0.019 penalty and is noise. Cyclic
homooligomers and nanoparticle subunits are the same construction with more chains per tied
group.

## How long this takes on CPU

Eight sequences per target, `v_48_020`, Apple M1 Max on the CPU device, 27 Aug 2026. Wall
time includes about 1.2 s of interpreter start-up and weight loading; generation time is
what the runner reports itself:

| structure | designed residues | generation | wall |
|---|---|---|---|
| `1CRN` | 46 | 1.0 s | 2.4 s |
| `1UBQ` | 76 | 1.6 s | 2.8 s |
| `1AKI` | 129 | 2.2 s | 3.4 s |
| `1REI` | 214 | 3.6 s | 4.9 s |
| `1BRS` | 592 | 8.9 s | 10.7 s |
| `4KT6` | 830 | 13.4 s | 15.5 s |
| `1IGT` | 1390 | 23.4 s | 26.6 s |
| `3ZOW` | 1449 | 25.2 s | 29.4 s |
| `6VXX` | 3363 | 67.6 s | 74.2 s |

Cost is linear in residues × sequences at roughly **2.5 ms per residue per sequence** on this
hardware, from a 46-residue peptide to a 3363-residue viral trimer. Treat that constant as
hardware-specific and the linearity as the thing to plan with — a thousand designs on a
200-residue target is about eight minutes, not a cluster job. Nothing on this page needed a
GPU, and nothing here would be qualitatively different with one.

## What a designed sequence is, and is not

ProteinMPNN samples from a learned distribution over sequences given a backbone. That is the
whole claim. It contains no model of folding kinetics, stability, expression, solubility,
aggregation, or function, and it has not been told what your protein does.

**Native-sequence recovery is a similarity measure, not a success criterion.** It asks how
often the model reproduces one particular natural solution — and many sequences fold to the
same backbone, so a design that disagrees with the native everywhere may be perfectly good
and a design that agrees may not fold at all. The published figure is 52.4% on native
backbones, against 32.9% for Rosetta (Dauparas *et al.*, *Science* 378:49–56, 2022).

Recovery also varies far more between targets than between settings, which is why a single
number carries almost no information on its own. Across 19 RCSB structures spanning 46 to
3363 residues, all at `--sampling_temp 0.1`, seed 37, `v_48_020`, whole structure designed:

| | |
|---|---|
| median | 0.483 |
| range | 0.304 (`2GB1`, 56 residues) to 0.617 (`1REI`, 214 residues) |
| membrane protein `1F88` | 0.372 |
| de novo designed `1QYS` (Top7) | 0.424 |

A 0.42 on a de novo backbone and a 0.62 on an immunoglobulin domain are not a worse and a
better run. Compare a design against other designs on the *same* backbone, never against a
number from a different target.

**The in-silico check that means something is a fold-back.** Predict a structure for each
design with a structure predictor — ESMFold and Boltz-2 are both practical at this scale —
and compare it to the input backbone by RMSD, along with the predictor's own confidence.
That tests whether the sequence encodes the fold you asked for, which recovery does not.
It is still not experimental validation, and this page will not pretend otherwise.

## Try it

**Data.** Ubiquitin, PDB entry `1UBQ` — one chain, 76 residues, fully resolved, 78 KB, from
RCSB PDB, which releases its coordinate files into the public domain under CC0 1.0. No
account needed; confirmed reachable 27 Aug 2026. Model weights come from the clone.

**Run.** Cold in an empty directory. About five and a half minutes end to end, nearly all of
it pip downloading PyTorch; the two ProteinMPNN runs take under three seconds combined. The
second half deliberately routes through the trap in *Five ways a backbone stops being
designed* — it strips one backbone atom from sixteen residues and checks what comes back.

```bash
set -e
python3 -m venv venv
./venv/bin/pip install -q --disable-pip-version-check torch numpy
git clone -q --depth 1 https://github.com/dauparas/ProteinMPNN.git
MPNN=$PWD/ProteinMPNN

# -f matters: RCSB answers a missing or PDB-format-unavailable entry with an HTML
# error page under a 404, and without -f curl writes that page to 1UBQ.pdb.
curl -fsSL -o 1UBQ.pdb https://files.rcsb.org/download/1UBQ.pdb

# A second copy with the backbone O deleted from residues 10-25 — nothing else changed.
./venv/bin/python - <<'PY'
keep = []
for line in open("1UBQ.pdb"):
    if line.startswith("ATOM") and 10 <= int(line[22:26]) <= 25 and line[12:16].strip() == "O":
        continue
    keep.append(line)
open("1UBQ_noO.pdb", "w").writelines(keep)
PY

./venv/bin/python "$MPNN/protein_mpnn_run.py" --pdb_path 1UBQ.pdb \
    --out_folder full --num_seq_per_target 8 --sampling_temp 0.1 --seed 37 > /dev/null
./venv/bin/python "$MPNN/protein_mpnn_run.py" --pdb_path 1UBQ_noO.pdb \
    --out_folder noO --num_seq_per_target 8 --sampling_temp 0.1 --seed 37 > /dev/null

./venv/bin/python - <<'PY'
def read(path):
    lines = open(path).read().strip().split("\n")
    native = lines[1]
    designs = [(float(h.split("seq_recovery=")[1]), s)
               for h, s in zip(lines[2::2], lines[3::2])]
    return native, designs

native, full = read("full/seqs/1UBQ.fa")
_, noO = read("noO/seqs/1UBQ_noO.fa")

def identity(a, b, positions):
    return sum(a[i] == b[i] for i in positions) / len(positions)

allpos = range(len(native))
stripped = set(range(9, 25))                       # residues 10-25, zero-based
designed = [i for i in allpos if i not in stripped]

print("native length          ", len(native))
print("native sequence        ", native)
print("designs returned       ", len(full))
print("all designs same length", all(len(s) == len(native) for _, s in full))

rec_full = [identity(native, s, allpos) for _, s in full]
print("reported == recomputed over all 76 :",
      all(abs(r - m) < 5e-5 for (r, _), m in zip(full, rec_full)))
print("mean recovery, intact backbone     : %.4f" % (sum(rec_full) / len(rec_full)))

# Strip one backbone atom from 16 residues and ProteinMPNN stops designing them.
carried = [s[9:25] == native[9:25] for _, s in noO]
print("residues 10-25 returned unchanged  :", all(carried), "in", sum(carried), "of 8 designs")
rec_noO = [identity(native, s, designed) for _, s in noO]
print("reported == recomputed over the 60 :",
      all(abs(r - m) < 5e-5 for (r, _), m in zip(noO, rec_noO)))
print("mean recovery, 60 designed positions: %.4f" % (sum(rec_noO) / len(rec_noO)))
print("mean over all 76, had you assumed it: %.4f"
      % (sum(identity(native, s, allpos) for _, s in noO) / len(noO)))

assert len(native) == 76 and len(full) == 8
assert all(len(s) == len(native) for _, s in full)
assert all(abs(r - m) < 5e-5 for (r, _), m in zip(full, rec_full))
assert 0.45 < sum(rec_full) / len(rec_full) < 0.65
assert all(carried)                                # never designed, never announced
assert all(abs(r - m) < 5e-5 for (r, _), m in zip(noO, rec_noO))
assert not any("X" in s for _, s in full)
print("OK")
PY
```

**Expect.**

```text
native length           76
native sequence         MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG
designs returned        8
all designs same length True
reported == recomputed over all 76 : True
mean recovery, intact backbone     : 0.5428
residues 10-25 returned unchanged  : True in 8 of 8 designs
reported == recomputed over the 60 : True
mean recovery, 60 designed positions: 0.4583
mean over all 76, had you assumed it: 0.5724
OK
```

*Invariants* — a failure here means this page is wrong, not that upstream moved:

- The native record is the sequence read off the coordinates. For a fully resolved `1UBQ` it
  is 76 residues and matches the deposited sequence exactly.
- Every design has the same length as the native, and contains no `X` for a gapless input.
- `seq_recovery` in the header equals the identity you recompute yourself — but only over
  the positions ProteinMPNN actually designed. On the intact backbone that is all 76; on the
  O-stripped copy it is 60, and the reported figure agrees with the narrower denominator in
  both cases.
- **Residues 10–25 of the O-stripped structure come back native in all eight designs**, with
  no warning anywhere in the output. That is the assertion that catches the trap: if a future
  version starts designing them, `all(carried)` fails and this page needs revising.
- The last two printed numbers are the point of the exercise. `0.4583` is recovery over the
  60 positions that were designed; `0.5724` is what you get by dividing over all 76, which
  is *higher* precisely because the 16 undesigned positions are 100% native. Computing
  recovery yourself over the full length inflates it.

*Observed values*, ProteinMPNN commit `8907e66`, `v_48_020`, torch 2.13.0, arm64 CPU,
27 Aug 2026 — a mismatch is drift to investigate, not a bug. The two recovery means, `0.5428`
and `0.4583`, are stable across repeated cold runs on one machine at seed 37 and
`--batch_size 1`, and may move on a different architecture; the assertions bracket them
rather than pinning them.

## Citing this

Dauparas, J. *et al.* Robust deep learning-based protein sequence design using ProteinMPNN.
*Science* **378**, 49–56 (2022). doi:10.1126/science.add2187

Code and weights: https://github.com/dauparas/ProteinMPNN
