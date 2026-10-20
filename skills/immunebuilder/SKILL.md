---
name: immunebuilder
description: Predict antibody, nanobody and TCR variable domains with ImmuneBuilder — seconds per model on CPU, with a per-residue error estimate. Covers the HMMER binary pip omits, why the B-factor column is not pLDDT, and how a run loses that estimate.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.1
tags: [antibody, nanobody, tcr, protein-structure, immunebuilder]
papers: [PMID:37248282, PMID:26424857]
datasets: [https://files.rcsb.org/download/1N8Z.pdb, https://files.rcsb.org/download/1MEL.pdb, https://files.rcsb.org/download/1AO7.pdb, 'https://zenodo.org/records/7258553/files/antibody_model_1?download=1']
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-10
  against: >-
    ImmuneBuilder 1.2 (PyPI) with ANARCI 2026.2.13.2, HMMER 3.4, OpenMM 8.6.1,
    pdbfixer 1.12.0, torch 2.14.1, numpy 2.4.6, scipy 1.17.1, biopython 1.88 and
    Python 3.11.17 on linux/amd64, CPU only (OpenMM Reference and CPU platforms;
    no GPU present). Antibody, nanobody and TCRBuilder2+ weight sets downloaded
    from Zenodo records 7258553 and 10892159 and md5-verified against the records.
    Structures from RCSB PDB entries 1N8Z, 1MEL and 1AO7, probed 2026-10-10.
  executed: 14
  unverified: 0
---
# ImmuneBuilder

ImmuneBuilder predicts the structure of an immune receptor's **variable domains** from
sequence. Three builders ship in one package:

| builder | predicts | chain keys |
|---|---|---|
| `ABodyBuilder2` | paired antibody Fv (VH + VL) | `H`, `L` |
| `NanoBodyBuilder2` | single-domain VHH (nanobody) | `H` |
| `TCRBuilder2` | αβ TCR variable domains | `A`, `B` |

The chain keys differ per builder and are not interchangeable — that is the first thing
that bites. Everything else here is about reading the output honestly.

Two properties make this worth reaching for over a general structure predictor. It is
**fast**: around 8 seconds for a four-model antibody ensemble on four CPU cores, with no
GPU and no MSA step, because the models are trained specifically on immune receptors and
take sequence alone. And it is **self-assessing**: the four models form an ensemble whose
spread becomes a per-residue uncertainty written into the output.

What it does **not** do: constant domains, full-length IgG, the antigen, or the complex.
It models the Fv and stops. For a designed binder that is not an immune receptor, or for
an antibody–antigen complex, use a general predictor instead — the registry's `alphafold`
skill covers retrieving precomputed predictions, and `boltzgen` and `bindcraft` cover
design.

## Before you start

Three requirements, all free, none gated. State them before you build anything on top:

- **A HMMER installation.** ImmuneBuilder numbers input sequences with ANARCI, and ANARCI
  shells out to the `hmmscan` **binary**. `pip install anarci` does not provide it, and
  the failure arrives late — at the first `predict()` call, as
  `FileNotFoundError: [Errno 2] No such file or directory: 'hmmscan'`. Install HMMER from
  your system package manager.
- **About 700 MB of model weights**, downloaded from Zenodo the first time you construct a
  builder, into the installed package directory. Each builder has its own set, so covering
  antibodies, nanobodies and TCRs is roughly 2 GB in total. They are cached after the first
  run. Budget disk for the install too — on Linux, `pip install` pulls `torch` with its full
  CUDA dependency stack whether or not you have a GPU. Measured here — about 5.6 GB of
  packages before a single weight file, and 1.9 GB of weights once all three builders have
  been constructed.
- **No GPU, no account, no API key.** CUDA is used if `torch.cuda.is_available()`, and CPU
  is a first-class path rather than a fallback.

Licensing, since this skill tells you to install four separate things: ImmuneBuilder is
BSD-3-Clause, ANARCI is BSD-3-Clause, the MUSCLE binary ANARCI bundles is public domain,
OpenMM and pdbfixer are permissive, and the Zenodo weight records are CC-BY-4.0. Nothing
in the chain restricts commercial use.

## Install

```bash
# HMMER — the dependency pip will not install for you
sudo apt-get install -y hmmer          # Debian / Ubuntu
# macOS:        brew install hmmer
# conda/mamba:  conda install -c bioconda hmmer

pip install ImmuneBuilder anarci openmm pdbfixer

hmmscan -h | head -2                   # must print a HMMER banner, not "not found"
python -c "from ImmuneBuilder import ABodyBuilder2; print('ok')"
```

`openmm` and `pdbfixer` are not optional even though `pip show ImmuneBuilder` does not list
them: `ImmuneBuilder.refine` imports `pdbfixer` at module load, so a bare
`pip install ImmuneBuilder` fails on `import ImmuneBuilder` with
`ModuleNotFoundError: No module named 'pdbfixer'`. Install all four together.

## Predict an antibody Fv

`predict()` takes a **dict**, not a list, and the keys must be exactly `H` and `L`:

```python
import torch
from ImmuneBuilder import ABodyBuilder2

# Trastuzumab, read straight from the SEQRES records of PDB 1N8Z chains B and A.
# These are the full Fab chains, constant domains included -- ANARCI finds the variable
# domain and the rest is dropped, which the next section shows.
H = ("EVQLVESGGGLVQPGGSLRLSCAASGFNIKDTYIHWVRQAPGKGLEWVARIYPTNGYTRYADSVKGRFTISADTSKN"
     "TAYLQMNSLRAEDTAVYYCSRWGGDGFYAMDYWGQGTLVTVSSASTKGPSVFPLAPSSKSTSGGTAALGCLVKDYF"
     "PEPVTVSWNSGALTSGVHTFPAVLQSSGLYSLSSVVTVPSSSLGTQTYICNVNHKPSNTKVDKKVEP")
L = ("DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSL"
     "QPEDFATYYCQQHYTTPPTFGQGTKVEIKRTVAAPSVFIFPPSDEQLKSGTASVVCLLNNFYPREAKVQWKVDNALQ"
     "SGNSQESVTEQDSKDSTYSLSSTLTLSKADYEKHKVYACEVTHQGLSSPVTKSFNRGEC")

torch.set_num_threads(4)
predictor = ABodyBuilder2()                  # downloads ~700 MB on first construction
antibody = predictor.predict({"H": H, "L": L})
antibody.save("trastuzumab.pdb")             # refines with OpenMM, then writes
print(len(antibody.atoms), "models in the ensemble")
```

Three things the API will not let you get away with, each a real `AssertionError` or
`TypeError` rather than a silently wrong model:

```python
for bad, label in [([H, L],                      "a list instead of a dict"),
                   ({"heavy": H, "light": L},    "descriptive key names"),
                   ({"H": H},                    "one chain only"),
                   ({"H": H, "L": H},            "a heavy chain in the light slot")]:
    try:
        predictor.predict(bad)
        print(f"{label:34s} accepted — unexpected")
    except Exception as e:
        print(f"{label:34s} {type(e).__name__}: {str(e).splitlines()[0][:62]}")
```

```
a list instead of a dict           TypeError: list indices must be integers or slices, not str
descriptive key names              AssertionError: Sequence provided as an heavy chain is not recognised as an he
one chain only                     KeyError: 'L'
a heavy chain in the light slot    AssertionError: Sequence provided as an L chain is not recognised as an L chai
```

`one chain only` is the signal to reach for `NanoBodyBuilder2` instead.

That last one matters: ANARCI classifies each sequence and checks it against the slot you
put it in, so a heavy chain pasted into `L` is caught rather than modelled as a light chain.

### Constant domains are dropped, not modelled

Hand it a whole Fab chain and it works, because ANARCI truncates to the Ig variable domain.
The output is an Fv either way, and knowing that stops you looking for a CH1 that was never
going to be there:

```python
# Full Fab chains from 1N8Z: heavy 220 aa, light 214 aa
ns = antibody.numbered_sequences
for chain in ("H", "L"):
    print(chain, len(ns[chain]), "numbered residues;",
          "first", ns[chain][0][0], "last", ns[chain][-1][0])
```

With IMGT numbering, trastuzumab gives 120 heavy residues ending at IMGT 128 and 107 light
residues ending at IMGT 127 — 227 in total, from 434 residues of input.

## The confidence estimate, and what the B-factor column means

This is the part that is easiest to misread, especially if you arrived from AlphaFold.

**The B-factor column holds a predicted error in angstroms, and lower is better.** It is
not pLDDT. AlphaFold writes pLDDT there on a 0–100 scale where *higher* is better; the
registry's `alphafold` skill documents that convention. ImmuneBuilder writes the
root-mean-square deviation of each residue's Cα across the four-model ensemble, in Å,
typically between 0.03 and 1.5. A colouring script or confidence filter carried over from
AlphaFold output will rank every residue backwards.

```python
import numpy as np

# error_estimates is (n_models, n_residues), in A^2. sqrt of the mean over models -> A
per_residue = antibody.error_estimates.mean(0).sqrt().cpu().numpy()
print("predicted error (A): min %.3f  mean %.3f  max %.3f"
      % (per_residue.min(), per_residue.mean(), per_residue.max()))

ca = [l for l in open("trastuzumab.pdb")
      if l.startswith("ATOM") and l[12:16].strip() == "CA"]
bfac = np.array([float(l[60:66]) for l in ca])
print(len(ca), "CA atoms;", "B-factors are the same numbers:",
      np.allclose(bfac, np.round(per_residue, 2), atol=0.011))
```

### Ensemble spread is not accuracy

The number above measures how much the four models **disagree**, which is a lower bound on
error, not an estimate of it. For trastuzumab the ensemble reports a mean of 0.13 Å while
the model actually sits 0.44–0.45 Å from the crystal structure — the models agree with
each other roughly three times more closely than they agree with reality. Read a low value as
"the ensemble is confident", never as "this is right to a tenth of an angstrom".

### A single model reports zero error everywhere

Because the estimate *is* the ensemble spread, asking for one model collapses it to zero
rather than to "unknown":

```python
from ImmuneBuilder import ABodyBuilder2
fast = ABodyBuilder2(model_ids=[1])            # 61 MB instead of ~700 MB, ~2.4 s
one = fast.predict({"H": H, "L": L})
print("ensemble size:", len(one.atoms))
print("max predicted error:", float(one.error_estimates.max()))   # exactly 0.0
```

Every B-factor in the saved PDB is then `0.00`, which looks like a perfect model and is
really a missing measurement. `model_ids=[1]` is a reasonable way to cut the download while
trying the tool out; it is not a way to generate structures you intend to trust or filter.

## Keeping the whole ensemble

`save()` writes only the top-ranked model. `save_all()` keeps all four plus the raw error
estimates, which is what you want if a downstream step needs the spread:

```python
antibody.save_all(dirname="ens_out")
# ens_out/: rank0_unrefined.pdb .. rank3_unrefined.pdb, final_model.pdb, error_estimates.npy
import numpy as np
err = np.load("ens_out/error_estimates.npy")     # shape (n_residues,), units A^2
print(err.shape, "sqrt mean %.3f A" % np.sqrt(err).mean())
print("ranking, best first:", antibody.ranking)
```

`rank0_unrefined.pdb` is the best model before refinement; `final_model.pdb` is that same
model after OpenMM minimisation, and is the one to use. `ranking` indexes into `atoms`, so
`ranking[0]` is not necessarily model 1.

## Numbering schemes change the labels, not the structure

```python
for scheme in ("imgt", "chothia", "kabat"):
    a = ABodyBuilder2(model_ids=[1], numbering_scheme=scheme).predict({"H": H, "L": L})
    ns = a.numbered_sequences
    print("%-8s H %d residues ending %s | L %d ending %s" %
          (scheme, len(ns["H"]), ns["H"][-1][0], len(ns["L"]), ns["L"][-1][0]))
```

IMGT ends the heavy chain at 128 and the light at 127; Chothia and Kabat both end at 113
and 107. The residue *count* is identical in all three — 120 and 107 — because the scheme
only relabels. Available schemes are `imgt`, `chothia`, `kabat`, `aho`, `wolfguy`, `martin`
and `raw`; IMGT is the default. Pick the one your downstream tooling expects and stay with
it, since CDR definitions are scheme-dependent.

## Nanobodies

`NanoBodyBuilder2` takes a single `H` key. Do not feed it the VH of a paired antibody — a
VHH has framework-2 substitutions that replace the VL interface, and the model is trained
on that chemistry.

```python
from ImmuneBuilder import NanoBodyBuilder2

# cAbLys3, the anti-lysozyme VHH, from the SEQRES of PDB 1MEL chain A -- all 148
# residues, including the trailing GRYPYDVPDYGSGRA, which is an HA tag. ANARCI drops
# it along with everything else outside the Ig domain.
VHH = ("DVQLQASGGGSVQAGGSLRLSCAASGYTIGPYCMGWFRQAPGKEREGVAAINMGGGITYYADSVKGRFTISQDNAKN"
       "TVYLLMNSLEPEDTAIYYCAADSTIYASYYECGHGLSTGGYGYDSWGQGTQVTVSSGRYPYDVPDYGSGRA")

nb = NanoBodyBuilder2().predict({"H": VHH})
nb.save("cablys3.pdb")
print(len(VHH), "residues in,", len(nb.numbered_sequences["H"]), "numbered")
```

Prints `148 residues in, 133 numbered` — the 15-residue tag is gone and the Ig domain is
what gets modelled. The nanobody weights are a separate ~700 MB download from the antibody
set, so the first `NanoBodyBuilder2()` pays that cost again.

## TCRs

`TCRBuilder2` uses `A` for the α chain and `B` for the β chain, and defaults to the
TCRBuilder2+ weights, a separate Zenodo record from the antibody and nanobody sets. Pass
`use_TCRBuilder2_PLUS_weights=False` for the original TCRBuilder2 weights.

```python
from ImmuneBuilder import TCRBuilder2

# A6 TCR, from the SEQRES of PDB 1AO7 chains D (alpha, 204 aa) and E (beta, 245 aa).
# Full chains again; the constant domains are dropped as with an antibody Fab.
A = ("KEVEQNSGPLSVPEGAIASLNCTYSDRGSQSFFWYRQYSGKSPELIMSIYSNGDKEDGRFTAQLNKASQYVSLLIRDS"
     "QPSDSATYLCAVTTDSWGKLQFGAGTQVVVTPDIQNPDPAVYQLRDSKSSDKSVCLFTDFDSQTNVSQSKDSDVYIT"
     "DKTVLDMRSMDFKSNSAVAWSNKSDFACANAFNNSIIPEDTFFPSPESS")
B = ("NAGVTQTPKFQVLKTGQSMTLQCAQDMNHEYMSWYRQDPGMGLRLIHYSVGAGITDQGEVPNGYNVSRSTTEDFPLRL"
     "LSAAPSQTSVYFCASRPGLAGGRPEQYFGPGTRLTVTEDLKNVFPPEVAVFEPSEAEISHTQKATLVCLATGFYPDHV"
     "ELSWWVNGKEVHSGVSTDPQPLKEQPALNDSRYALSSRLRVSATFWQNPRNHFRCQVQFYGLSENDEWTQDRAKPVTQ"
     "IVSAEAWGRAD")

tcr = TCRBuilder2().predict({"A": A, "B": B})
tcr.save("a6_tcr.pdb")
print(len(tcr.atoms), "models;",
      {c: len(tcr.numbered_sequences[c]) for c in tcr.numbered_sequences})
```

Prints `4 models; {'A': 110, 'B': 115}` — 225 numbered residues out of 449 supplied. The
output chains are labelled `B` then `A` in the PDB file rather than in the order you passed
them, which matters if a downstream step selects chains by position.

## Verify the weights yourself

The package's readiness check is weaker than it looks. `are_weights_ready()` returns true
for any file that is non-empty and does not begin with the bytes `EMPTY` — it checks
neither size nor checksum. A truncated download, or an HTML error page saved under the
weight filename, therefore passes as ready and fails later inside `torch.load`:

```
ERROR: nanobody_model_1 not downloaded or corrupted.
RuntimeError: PytorchStreamReader failed reading zip archive: failed finding central
directory. This is an internal miniz error.
```

Zenodo returns a 504 under load often enough that this is a routine occurrence rather than
a hypothetical. The record publishes md5 checksums, so check against them and delete
anything that does not match, rather than re-reading the opaque error:

```bash
DIR=$(python -c "import ImmuneBuilder,os;print(os.path.join(os.path.dirname(ImmuneBuilder.__file__),'trained_model'))")
# Record 7258553 carries the antibody and nanobody weights. Restrict the comparison to
# those two prefixes -- the record's tcr_model_* entries are a different set of weights
# that happen to share a filename, which the note below explains.
curl -sL "https://zenodo.org/api/records/7258553" | python -c "
import json, sys
for f in json.load(sys.stdin)['files']:
    if f['key'].startswith(('antibody_model_', 'nanobody_model_')):
        print(f['checksum'].split(':')[1], f['key'])" > expected.txt
cd "$DIR" && while read -r sum key; do
  [ -s "$key" ] || continue
  got=$(md5sum "$key" | cut -d' ' -f1)
  [ "$got" = "$sum" ] && echo "ok   $key" || echo "BAD  $key (delete and re-download)"
done < "$OLDPWD/expected.txt"
```

A deleted weight file is re-downloaded on the next construction, so recovery is just
removing the bad file.

**Do not check TCR weights against that record.** `TCRBuilder2` in its default
TCRBuilder2+ mode saves to `tcr_model_1` … `tcr_model_4` but fetches them from record
`10.5281/zenodo.10892159`, and record 7258553 has four *different* files under those same
four names — the original TCRBuilder2 weights, with different sizes and different
checksums. Comparing one against the other reports four healthy files as corrupt. For TCR
weights, read the checksums from `https://zenodo.org/api/records/10892159` instead.

## Command line

The three builders install as console scripts, which is the quickest route for a one-off:

```bash
cat > tras.fasta <<'FASTA'
>H
EVQLVESGGGLVQPGGSLRLSCAASGFNIKDTYIHWVRQAPGKGLEWVARIYPTNGYTRYADSVKGRFTISADTSKNTAYLQMNSLRAEDTAVYYCSRWGGDGFYAMDYWGQGTLVTVSS
>L
DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK
FASTA
ABodyBuilder2 -f tras.fasta -o cli_out.pdb
grep -c "^ATOM" cli_out.pdb
```

The FASTA records must be named `H` and `L` (`A` and `B` for `TCRBuilder2`). `--to_directory`
is the CLI equivalent of `save_all`, `-n` sets the numbering scheme, `--n_threads` forces CPU
refinement, and `-u` skips the strained-bond check for a little speed.

## How accurate is it

Checked against the crystal structure rather than asserted. This superposes the predicted Fv
onto PDB 1N8Z by sequence-matched Cα:

```python
import warnings; warnings.filterwarnings("ignore")
import urllib.request
from Bio.PDB import PDBParser, Superimposer
from Bio.Align import PairwiseAligner, substitution_matrices
from Bio.Data.IUPACData import protein_letters_3to1

urllib.request.urlretrieve("https://files.rcsb.org/download/1N8Z.pdb", "1n8z.pdb")

def ca(struct, chain):
    res = [r for r in struct[0][chain] if r.id[0] == " " and "CA" in r]
    return res, "".join(protein_letters_3to1.get(r.get_resname().capitalize(), "X")
                        for r in res)

p = PDBParser(QUIET=True)
pred, exp = p.get_structure("p", "trastuzumab.pdb"), p.get_structure("e", "1n8z.pdb")
al = PairwiseAligner(substitution_matrix=substitution_matrices.load("BLOSUM62"),
                     open_gap_score=-11, extend_gap_score=-1, mode="global")

fixed, moving = [], []
for pch, ech in (("H", "B"), ("L", "A")):      # 1N8Z: chain B heavy, chain A light
    pres, pseq = ca(pred, pch)
    eres, eseq = ca(exp, ech)
    a = al.align(pseq, eseq)[0]
    for (ps, pe), (es, ee) in zip(a.aligned[0], a.aligned[1]):
        for i, j in zip(range(ps, pe), range(es, ee)):
            moving.append(pres[i]["CA"]); fixed.append(eres[j]["CA"])

sup = Superimposer(); sup.set_atoms(fixed, moving)
print("Fv CA RMSD vs 1N8Z: %.2f A over %d atoms" % (sup.rms, len(fixed)))
```

It prints 0.44–0.45 Å. The spread is real rather than noise in the measurement: OpenMM
minimisation is not bit-reproducible, so the refined coordinates differ slightly between
runs and the last digit moves. Treat a value in that band as agreement and a jump out of it
as something to look into.

**Read the result with the training set in mind.** 1N8Z was deposited in 2002 and
trastuzumab is one of the most-solved antibodies there is, so it is almost certainly in
ImmuneBuilder's training data. This number is a sanity check that the pipeline works,
**not** an accuracy figure.

The held-out numbers are much larger, and they are the ones to plan against. On a benchmark
of 34 recently solved antibodies the paper (PMID:37248282) reports ABodyBuilder2 predicting
**CDR-H3 loops with an RMSD of 2.81 Å** — 0.09 Å better than AlphaFold-Multimer, at over a
hundred times the speed. NanoBodyBuilder2 averages **2.89 Å** on CDR-H3, 0.55 Å better than
AlphaFold2. So the honest summary is a sixfold gap between what this prints for a
well-known antibody and what to expect on a new one, concentrated almost entirely in one
loop.

Two practical consequences. Framework and the canonical CDR loops are accurate enough to
build on — that is where the sub-angstrom agreement is real. CDR-H3 is where to spend
scepticism: at ~2.8 Å it is a plausible conformation rather than a measurement, which is
usually fatal for reading out binding and fine for setting up a docking run or a design
filter. The per-residue error column tells you whether the ensemble is at least internally
confident there, which is a necessary and insufficient condition.

## Try it

A self-contained check that this skill still works. Public data, no account, no key. A cold
run downloads roughly 700 MB of antibody weights from Zenodo and takes a few minutes; a
warm one takes about 15 seconds.

**Data** — trastuzumab's heavy and light **variable domains** (the Fv, trimmed from the
full Fab chains so the block stays short), read from the SEQRES records of

    https://files.rcsb.org/download/1N8Z.pdb

and inlined below so the block needs no download of its own, plus the four antibody weight
files from the Zenodo record `10.5281/zenodo.7258553`, which ImmuneBuilder fetches itself.
RCSB PDB coordinate data carries no licensing restriction and the Zenodo record is
CC-BY-4.0, so neither needs an account. Both last confirmed reachable 2026-10-10.

**Run** — requires HMMER on `PATH` and `pip install ImmuneBuilder anarci openmm pdbfixer`:

```python
import numpy as np, torch
from ImmuneBuilder import ABodyBuilder2

H = ("EVQLVESGGGLVQPGGSLRLSCAASGFNIKDTYIHWVRQAPGKGLEWVARIYPTNGYTRYADSVKGRFTISADTSKN"
     "TAYLQMNSLRAEDTAVYYCSRWGGDGFYAMDYWGQGTLVTVSS")
L = ("DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSL"
     "QPEDFATYYCQQHYTTPPTFGQGTKVEIK")

torch.set_num_threads(4)
ab = ABodyBuilder2().predict({"H": H, "L": L})       # default ensemble, all four models
ab.save("try_it.pdb")

ns = ab.numbered_sequences
per_residue = ab.error_estimates.mean(0).sqrt().cpu().numpy()
ca = [l for l in open("try_it.pdb")
      if l.startswith("ATOM") and l[12:16].strip() == "CA"]
bfac = np.array([float(l[60:66]) for l in ca])

print("ensemble size   :", len(ab.atoms))
print("H / L residues  :", len(ns["H"]), "/", len(ns["L"]))
print("last IMGT number:", ns["H"][-1][0][0], "/", ns["L"][-1][0][0])
print("CA atoms        :", len(ca))
print("predicted error : min %.3f  mean %.3f  max %.3f A"
      % (per_residue.min(), per_residue.mean(), per_residue.max()))

# --- invariants: these must hold on any version ---
assert len(ab.atoms) == 4, "default is a four-model ensemble"
assert len(ns["H"]) == 120 and len(ns["L"]) == 107
assert ns["H"][-1][0][0] == 128 and ns["L"][-1][0][0] == 127   # IMGT numbering
assert len(ca) == len(ns["H"]) + len(ns["L"]) == 227           # one CA per numbered residue
assert (per_residue > 0).all(), "a real ensemble never reports zero error everywhere"
assert np.allclose(bfac, np.round(per_residue, 2), atol=0.011), \
    "the B-factor column is the per-residue predicted error in A, not pLDDT"
assert any("OPENMM" in l for l in open("try_it.pdb")), "refinement REMARK is missing"

# --- a single model collapses the estimate to exactly zero, by construction ---
one = ABodyBuilder2(model_ids=[1]).predict({"H": H, "L": L})
assert float(one.error_estimates.max()) == 0.0

# --- observed 2026-10-10, ImmuneBuilder 1.2: drift to investigate, not a bug ---
assert 0.05 < per_residue.mean() < 0.30, f"ensemble spread moved: {per_residue.mean():.3f}"
print("OK")
```

**Expect** — the invariants above hold exactly; a failure there means the skill is wrong.
The observed numbers on 2026-10-10 with ImmuneBuilder 1.2 and ANARCI 2026.2.13.2 were a
mean predicted error of 0.130 Å, a maximum of 0.563 Å, and an Fv Cα RMSD of 0.44–0.45 Å
against 1N8Z over repeat runs. Those are version-stamped observations — if they move, the
weights or the numbering changed and it is worth finding out which, not a reason to loosen
the assertion. Note what is *not* asserted exactly: the RMSD and the refined coordinates
shift in the last digit between runs because OpenMM minimisation is not bit-reproducible,
so the block bounds the ensemble spread rather than pinning it.

## When not to use it

- **You need the constant domains, a full IgG, or the Fab elbow angle.** ImmuneBuilder
  models the variable domains only.
- **You need the antigen complex.** It predicts the receptor alone; docking or a
  complex-capable predictor comes after.
- **The molecule is not an immune receptor.** ANARCI rejects anything it cannot number as
  an Ig or TCR domain — `AssertionError: Sequence too short to be an Ig domain` is also what
  a non-antibody sequence of any length produces. A designed non-Ig binder needs a general
  predictor.
- **You are ranking designs on absolute confidence.** The error column is ensemble
  agreement. It is good at flagging a loop the models cannot agree on and poor at telling
  you a structure is correct.
