---
name: p2rank
description: Predict ligand-binding pockets on a protein structure with P2Rank, which scores solvent-accessible surface points and clusters them into ranked pockets. Use it to find a druggable site or to place a docking box for AutoDock Vina or DiffDock.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [binding-site, pocket-prediction, druggability, structure-based, virtual-screening]
datasets: [https://github.com/rdk/p2rank/releases/download/2.5.1/p2rank_2.5.1.tar.gz, https://files.rcsb.org/download/1HSG.pdb, https://files.rcsb.org/download/2SRC.cif]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-13
  against: P2Rank 2.5.1 (release binary) / OpenJDK 21.0.12 / Python 3.11.17 on Linux x86_64
  executed: 18
  unverified: 0
---

# P2Rank — ligand-binding site prediction

P2Rank takes a protein structure and returns a ranked list of candidate
ligand-binding pockets. It covers the protein's solvent-accessible surface with
points, scores each point for "ligandability" with a random-forest model trained
on known protein–ligand complexes, clusters the high-scoring points, and ranks
the resulting clusters.

It answers one question well: **where on this protein would a small molecule
bind?** That makes it the step before docking — `autodock-vina` and
`diffdock-nim` both need a site or a box, and nothing finds one for you. It is
also a quick sanity check on a predicted structure: a model with no pocket
anywhere is a different problem from a model with a pocket in the wrong place.

What it is not: it does not dock, does not score affinity, and does not tell you
what binds. A high pocket score means "this looks like the kind of surface that
binds something", not "your compound binds here".

## What you need before you start

- **Java 17 to 23.** This is a hard range, not a minimum — the distribution
  states both ends, so a newer JDK is not a safe assumption. Verified here on
  OpenJDK 21.
- **About 276 MB of download** for the release archive, which unpacks to roughly
  293 MB — so allow ~570 MB if you keep the archive alongside it. The bulk is the
  trained models that ship with the distribution; there is nothing to compile and
  nothing to install.
- **No account, no API key, no licence to accept, no GPU.** P2Rank is MIT
  licensed and the release archives are public. A single structure takes a few
  seconds on four cores.

## Install

P2Rank requires no installation — unpack the release archive and run the
launcher script from it.

```bash
set -euo pipefail
mkdir -p p2rank-install && cd p2rank-install
curl -sSLO https://github.com/rdk/p2rank/releases/download/2.5.1/p2rank_2.5.1.tar.gz
tar xzf p2rank_2.5.1.tar.gz
export P2RANK="$PWD/p2rank_2.5.1/prank"
"$P2RANK" 2>&1 | head -1
```

```
P2Rank 2.5.1
```

**Pin the version.** `2.5.1` is the version this skill documents and the only
release asset that resolves today — `p2rank_2.6.tar.gz`, `p2rank_2.6.0.tar.gz`
and `p2rank_2.5.2.tar.gz` all return HTTP 404. If you see a newer tag
referenced somewhere, confirm the archive actually downloads before depending
on it.

## A first prediction

`-f` runs on a single structure; `-o` sets the output directory, relative to the
working directory.

```bash
curl -sSO https://files.rcsb.org/download/1HSG.pdb
"$P2RANK" predict -f 1HSG.pdb -o out_1hsg 2>&1 | grep -E "protein   atoms|ignoring ligands|pocket [0-9]"
```

```
[INFO] Protein - protein   atoms: 1492
[INFO] Protein - ignoring ligands
[INFO] PocketPredictor - pocket 1 -  surf_atoms:  53   points:  57   score:   21.7
```

1HSG is HIV-1 protease with indinavir bound. Note `ignoring ligands`: P2Rank
reads only the protein atoms and discards every HETATM group. That is by design
and it is what makes the result worth anything on a holo structure — the
prediction cannot be cheating by looking at the ligand it is supposed to find.

Two files carry the result:

```bash
ls out_1hsg
```

```
1HSG.pdb_predictions.csv
1HSG.pdb_residues.csv
params.txt
run.log
visualizations
```

`*_predictions.csv` is one row per pocket, ranked. `*_residues.csv` is one row
per residue in the whole protein, with the pocket it was assigned to (`0` for
residues in no pocket). `visualizations/` holds PyMOL and ChimeraX scripts.

## Reading the CSV — the column names are padded

This is the first thing that will bite you. P2Rank pads its CSV for human
reading, so the header is not what you expect:

```bash
head -2 out_1hsg/1HSG.pdb_predictions.csv | cut -c1-96
```

```
name     ,  rank,   score, probability, sas_points, surf_atoms,   center_x,   center_y,   center
pocket1  ,     1,   21.67,       0.873,        119,         53,    13.0901,    23.1420,     6.00
```

Every field is space-padded, header and values alike. `csv.DictReader` with
`skipinitialspace=True` strips the leading padding and gives you clean keys —
**except for the first column**, whose padding is trailing, not leading:

```bash
python3 - <<'PY'
import csv
rows = list(csv.DictReader(open("out_1hsg/1HSG.pdb_predictions.csv"),
                           skipinitialspace=True))
print("keys:", list(rows[0].keys()))
print("rank:", rows[0]["rank"], "score:", rows[0]["score"],
      "probability:", rows[0]["probability"])
PY
```

```
keys: ['name     ', 'rank', 'score', 'probability', 'sas_points', 'surf_atoms', 'center_x', 'center_y', 'center_z', 'residue_ids', 'surf_atom_ids']
rank: 1 score: 21.67 probability: 0.873
```

So `row["rank"]` works and `row["name"]` raises `KeyError`. Strip the keys
yourself rather than relying on `skipinitialspace` alone:

```bash
python3 - <<'PY'
import csv
with open("out_1hsg/1HSG.pdb_predictions.csv") as fh:
    rows = [{k.strip(): v.strip() for k, v in r.items()}
            for r in csv.DictReader(fh)]
print(rows[0]["name"], rows[0]["rank"], rows[0]["probability"])
PY
```

```
pocket1 1 0.873
```

`residues.csv` does not have the trailing-padding problem on its first column —
its header is `chain, residue_label, …` with no padding on `chain` — but strip
both files the same way and you do not have to remember which is which.

Two more shapes worth knowing. `residue_ids` and `surf_atom_ids` are
**space-separated lists inside a comma-separated file**, so they arrive as one
string per row and need splitting. And `residue_ids` entries are
`CHAIN_RESNUM`, not bare numbers:

```bash
python3 - <<'PY'
import csv
with open("out_1hsg/1HSG.pdb_predictions.csv") as fh:
    r = [{k.strip(): v.strip() for k, v in row.items()}
         for row in csv.DictReader(fh)][0]
res = r["residue_ids"].split()
print("residues in pocket1:", len(res))
print("first six:", res[:6])
print("surface atoms:", len(r["surf_atom_ids"].split()))
PY
```

```
residues in pocket1: 29
first six: ['A_23', 'A_25', 'A_27', 'A_28', 'A_29', 'A_30']
surface atoms: 53
```

## Does the top pocket actually find the site?

The point of predicting on a structure whose ligand you know is that you can
check. Indinavir is `MK1` in 1HSG; P2Rank never saw it. Compare its centroid
against the predicted pocket centre:

```bash
python3 - <<'PY'
import csv, math
lig = [(float(l[30:38]), float(l[38:46]), float(l[46:54]))
       for l in open("1HSG.pdb")
       if l.startswith("HETATM") and l[17:20].strip() == "MK1"]
cen = [sum(a[i] for a in lig) / len(lig) for i in range(3)]
with open("out_1hsg/1HSG.pdb_predictions.csv") as fh:
    p = [{k.strip(): v.strip() for k, v in r.items()}
         for r in csv.DictReader(fh)][0]
pc = (float(p["center_x"]), float(p["center_y"]), float(p["center_z"]))
print("MK1 atoms:", len(lig))
print("ligand centroid: %.3f %.3f %.3f" % tuple(cen))
print("pocket1 centre:  %.3f %.3f %.3f" % pc)
print("centre-to-centroid: %.2f A" % math.dist(cen, pc))
print("nearest ligand atom: %.2f A" % min(math.dist(pc, a) for a in lig))
PY
```

```
MK1 atoms: 45
ligand centroid: 13.073 22.467 5.557
pocket1 centre:  13.090 23.142 6.004
centre-to-centroid: 0.81 A
nearest ligand atom: 1.59 A
```

0.81 Å from the centroid of a 45-atom inhibitor, with the inhibitor excluded
from the input. This is the check to run whenever you want to know if P2Rank is
working on your class of target — pick a holo structure, predict, measure.

## Rank and probability — read the gap, not the list

A larger protein returns several pockets, and the scores are not evenly spread.
mmCIF input works exactly the same way:

```bash
curl -sSO https://files.rcsb.org/download/2SRC.cif
"$P2RANK" predict -f 2SRC.cif -o out_2src 2>&1 | grep -E "protein   atoms|FILTERED CLUSTERS"
python3 - <<'PY'
import csv
with open("out_2src/2SRC.cif_predictions.csv") as fh:
    rows = [{k.strip(): v.strip() for k, v in r.items()}
            for r in csv.DictReader(fh)]
for r in rows:
    print("%-9s rank %s  score %6s  probability %s"
          % (r["name"], r["rank"], r["score"], r["probability"]))
PY
```

```
[INFO] Protein - protein   atoms: 3529
[INFO] PocketPredictor - FILTERED CLUSTERS: 7
pocket1   rank 1  score  26.67  probability 0.916
pocket2   rank 2  score   3.94  probability 0.156
pocket3   rank 3  score   3.09  probability 0.103
pocket4   rank 4  score   2.63  probability 0.076
pocket5   rank 5  score   2.56  probability 0.072
pocket6   rank 6  score   2.43  probability 0.066
pocket7   rank 7  score   0.89  probability 0.004
```

Seven pockets, and one of them means something. `score` is the summed
ligandability of the cluster's points; `probability` is that score mapped
through a calibration curve onto roughly "chance this is a real ligand-binding
site". The drop from 0.916 to 0.156 is the signal — 2SRC is Src kinase with the
ATP analogue `ANP` bound, and only pocket 1 is near it:

```bash
python3 - <<'PY'
import csv, math
lig = []
for l in open("2SRC.cif"):
    if l.startswith("HETATM"):
        f = l.split()
        if f[5] == "ANP":
            lig.append((float(f[10]), float(f[11]), float(f[12])))
cen = [sum(a[i] for a in lig) / len(lig) for i in range(3)]
with open("out_2src/2SRC.cif_predictions.csv") as fh:
    rows = [{k.strip(): v.strip() for k, v in r.items()}
            for r in csv.DictReader(fh)]
for r in rows[:3]:
    pc = (float(r["center_x"]), float(r["center_y"]), float(r["center_z"]))
    print("rank %s  probability %s  %6.2f A from ANP"
          % (r["rank"], r["probability"], math.dist(cen, pc)))
PY
```

```
rank 1  probability 0.916    4.63 A from ANP
rank 2  probability 0.156   19.48 A from ANP
rank 3  probability 0.103   23.60 A from ANP
```

Treat anything below roughly 0.2 as surface texture unless you have an
independent reason to care about it. Reporting "P2Rank found 7 pockets" is
true and almost always misleading.

## Silent failure — the exit code does not mean what you want

This is the trap that will cost you a day in a pipeline. P2Rank distinguishes a
**missing** file from an **unparseable** one, and only the first is an error:

```bash
"$P2RANK" predict -f does-not-exist.pdb -o out_e1 >/dev/null 2>&1; echo "missing file   -> exit $?"
printf '<!doctype html><title>403</title>403 Forbidden' > truncated.pdb
"$P2RANK" predict -f truncated.pdb -o out_e2 >/dev/null 2>&1; echo "HTML error page -> exit $?"
: > empty.pdb
"$P2RANK" predict -f empty.pdb -o out_e3 >/dev/null 2>&1; echo "empty file      -> exit $?"
wc -l < out_e2/truncated.pdb_predictions.csv
```

```
missing file   -> exit 1
HTML error page -> exit 0
empty file      -> exit 0
1
```

A failed download that left an HTML error page on disk, or a truncated file,
gives you **exit 0 and a predictions CSV containing only its header**. "No
pockets found" and "your structure never parsed" are the same observable. Since
a structure download is the most likely thing to fail unattended, check that
the protein was actually read rather than trusting the exit code:

```bash
python3 - <<'PY'
import csv, re, sys

def pockets(outdir, stem, logpath):
    atoms = 0
    for line in open(logpath):
        m = re.search(r"protein\s+atoms:\s+(\d+)", line)
        if m:
            atoms = max(atoms, int(m.group(1)))
    if atoms == 0:
        sys.exit(f"{stem}: no protein atoms parsed - check the input file")
    with open(f"{outdir}/{stem}_predictions.csv") as fh:
        return atoms, [{k.strip(): v.strip() for k, v in r.items()}
                       for r in csv.DictReader(fh)]

atoms, rows = pockets("out_1hsg", "1HSG.pdb", "out_1hsg/run.log")
print(f"1HSG.pdb: {atoms} protein atoms, {len(rows)} pocket(s)")
for bad in (("out_e2", "truncated.pdb"), ("out_e3", "empty.pdb")):
    try:
        pockets(bad[0], bad[1], f"{bad[0]}/run.log")
    except SystemExit as e:
        print("caught ->", e)
PY
```

```
1HSG.pdb: 1492 protein atoms, 1 pocket(s)
caught -> truncated.pdb: no protein atoms parsed - check the input file
caught -> empty.pdb: no protein atoms parsed - check the input file
```

A zero-pocket result on a protein that did parse is a real answer, and a useful
one — it is how you learn a surface has nothing druggable on it.

## Many structures at once

A dataset file (`.ds`) is a plain list of structure paths, one per line, no
header. Pass it as the positional argument instead of `-f`.

```bash
printf '%s\n' 1HSG.pdb 2SRC.cif > mine.ds
"$P2RANK" predict mine.ds -o out_batch 2>&1 | grep -E "\[INFO\].*processing \[|protein   atoms"
ls out_batch/*_predictions.csv
```

```
[INFO] Console - processing [1HSG.pdb] (1/2)
[INFO] Console - processing [2SRC.cif] (2/2)
[INFO] Protein - protein   atoms: 1492
[INFO] Protein - protein   atoms: 3529
out_batch/1HSG.pdb_predictions.csv
out_batch/2SRC.cif_predictions.csv
```

**Paths inside a `.ds` resolve relative to the `.ds` file, not to your working
directory.** A dataset file in a subdirectory listing a bare filename that sits
next to *you* fails with exit 1:

```bash
mkdir -p sub
printf '%s\n' 1HSG.pdb > sub/bare.ds
"$P2RANK" predict sub/bare.ds -o out_bare >/dev/null 2>&1; echo "bare name   -> exit $?"
printf '%s\n' ../1HSG.pdb > sub/rel.ds
"$P2RANK" predict sub/rel.ds -o out_rel >/dev/null 2>&1; echo "../ to file -> exit $?"
```

```
bare name   -> exit 1
../ to file -> exit 0
```

`-threads N` sets the worker count; the default is the processor count plus one.
Note that the dataset log line reports `using 0 threads` whatever you pass, so
do not read it as confirmation that your setting took effect.

## Predicted structures need a different model

The default model uses the B-factor column as a feature. On a crystal structure
that is crystallographic B-factor; in an AlphaFold or ESMFold model the same
column holds pLDDT, which is a confidence score with the opposite sense. Feeding
a predicted model to the default configuration therefore feeds the model a
feature that means something else.

The distribution ships an `alphafold` configuration that drops it. Compare the
feature sets:

```bash
"$P2RANK" predict -f 1HSG.pdb -o out_cfg_default 2>&1 | grep -m1 enabledFeatures
"$P2RANK" predict -c alphafold -f 1HSG.pdb -o out_cfg_af 2>&1 | grep -m1 enabledFeatures
```

```
[INFO] FeatureSetup - enabledFeatures: [chem, volsite, protrusion, bfactor, atom_table]
[INFO] FeatureSetup - enabledFeatures: [chem, volsite, protrusion, atom_table]
```

`bfactor` is present by default and absent under `-c alphafold`. So use
`-c alphafold` for any computationally predicted structure, and the default for
experimental ones. (The comparison above runs both configurations on an
experimental structure purely to show the feature difference; the pocket numbers
quoted elsewhere in this skill are all from the default configuration. This
skill's checks were run against experimental structures from the PDB, so the
`-c alphafold` recommendation rests on that documented feature difference rather
than on a prediction scored against a predicted model.)

Two companions to the configuration choice. `config/` holds the others:
`conservation_hmm` and `alphafold_conservation_hmm` add a `conservation`
feature and set `load_conservation`, so they expect precomputed conservation
scores from an HMMER pipeline alongside each structure — they will not work on a
bare PDB file. Note which of them keeps `bfactor`: `conservation_hmm` does, so it
is the experimental-structure variant, and `alphafold_conservation_hmm` is the
predicted-model one. Separately, `-m` selects a trained classifier from
`models/` independently of the configuration.

Any parameter can also be overridden directly on the command line as
`-<param_name> <value>`, which takes precedence over a `-c` config file, which
in turn overrides `config/default.groovy`.

## Handing a pocket to a docking run

`autodock-vina` needs a box centre and size. P2Rank's `center_*` is the
ligandability-weighted centre of the cluster, and on 1HSG it landed 0.81 Å from
the real ligand — closer than the geometric centre of the pocket's surface
atoms, which is pulled around by the shape of the cavity. Use `center_*` for the
centre and the surface-atom extent only to choose the size:

```bash
python3 - <<'PY'
import csv
with open("out_1hsg/1HSG.pdb_predictions.csv") as fh:
    p = [{k.strip(): v.strip() for k, v in r.items()}
         for r in csv.DictReader(fh)][0]
ids = {int(i) for i in p["surf_atom_ids"].split()}
xyz = [(float(l[30:38]), float(l[38:46]), float(l[46:54]))
       for l in open("1HSG.pdb")
       if l.startswith("ATOM") and int(l[6:11]) in ids]
print("matched %d of %d surface atoms" % (len(xyz), len(ids)))
pad = 4.0
for name, i in (("x", 0), ("y", 1), ("z", 2)):
    lo, hi = min(a[i] for a in xyz), max(a[i] for a in xyz)
    print("  center_%s = %8.3f   extent+pad = %7.3f"
          % (name, float(p["center_" + name]), hi - lo + 2 * pad))
PY
```

```
matched 53 of 53 surface atoms
  center_x =   13.090   extent+pad =  24.678
  center_y =   23.142   extent+pad =  25.770
  center_z =    6.004   extent+pad =  21.586
```

Read that extent as an upper bound rather than a recommendation. 1HSG's site is
the long cleft of a homodimer, so its surface atoms span ~25 Å in every
direction; docking into a 25 Å cube wastes most of the search on solvent and
degrades the ranking. Start from a 20–24 Å box on `center_*`, confirm the pocket
residues fall inside it, and shrink rather than grow.

The pocket's residues come straight out of `residues.csv`, which is the more
convenient file when you want to select a site in PyMOL or restrain a region:

```bash
python3 - <<'PY'
import csv
with open("out_1hsg/1HSG.pdb_residues.csv") as fh:
    rows = [{k.strip(): v.strip() for k, v in r.items()}
            for r in csv.DictReader(fh)]
p1 = [r for r in rows if r["pocket"] == "1"]
print("residues in pocket 1:", len(p1))
print("PyMOL selection:")
print("  select pocket1, chain A and resi "
      + "+".join(r["residue_label"] for r in p1 if r["chain"] == "A"))
PY
```

```
residues in pocket 1: 29
PyMOL selection:
  select pocket1, chain A and resi 8+23+25+27+28+29+30+32+47+48+49+50+82+84
```

`visualizations/` already contains a ready `*_pymol.pml` and `*_chimerax.cxc`
for the same purpose if you would rather load the session than build a
selection.

## Other commands

`prank help` lists four. `predict` is the one this skill covers.
`rescore` takes pockets found by another method (fpocket or ConCavity output)
and re-ranks them with P2Rank's model, which is useful when you want another
tool's pocket geometry with P2Rank's ligandability ordering. `eval-predict` and
`eval-rescore` measure a model against a dataset whose true ligands are known —
they are for benchmarking and model development, not for a prediction run, and
they need the paired liganated structures described in `prank help`.

## Limits worth stating in a methods section

- It predicts **where**, not **what** and not **how strongly**. There is no
  affinity here.
- It is trained on known protein–ligand complexes, so it is best on the kind of
  site that training set contains — small drug-like molecules in enclosed
  pockets. Shallow protein–protein interfaces, metal sites and large or highly
  charged ligands are outside that comfort zone.
- It scores a **single rigid conformation**. A cryptic pocket that only opens in
  another conformation is not there to be found; running an ensemble and
  comparing pockets across it is the usual workaround.
- `ignoring ligands` means cofactors are discarded too, so a site that only
  exists once a cofactor is in place may be mispredicted.
- The score is calibrated on the training distribution, not on your target
  class. Verify on a holo structure from your own system, as above, before you
  trust a threshold.

## Try it

**Data.** HIV-1 protease with indinavir, PDB `1HSG`, fetched from the public RCSB
file service (no licence or registration), plus the public P2Rank 2.5.1 release
archive. Both confirmed reachable 2026-10-13.

**Run.** Self-contained — downloads the tool and the structure into a fresh
directory and uses only the Python standard library. Needs Java 17–23 and about
276 MB of download.

```bash
set -euo pipefail
COLD=$(mktemp -d) && cd "$COLD"

curl -sSLO https://github.com/rdk/p2rank/releases/download/2.5.1/p2rank_2.5.1.tar.gz
tar xzf p2rank_2.5.1.tar.gz
curl -sSO https://files.rcsb.org/download/1HSG.pdb

./p2rank_2.5.1/prank predict -f 1HSG.pdb -o out > prank.stdout 2>&1

python3 - <<'PY'
import csv, math, re, sys

fails = []
def check(label, got, want):
    ok = got == want
    fails.append(label) if not ok else None
    print(f"{'ok  ' if ok else 'FAIL'} {label}: {got!r}" + ("" if ok else f" != {want!r}"))

# --- invariants: a failure here means the skill is wrong ---
atoms = max((int(m.group(1)) for m in
             (re.search(r"protein\s+atoms:\s+(\d+)", l) for l in open("out/run.log")) if m),
            default=0)
check("protein atoms parsed", atoms, 1492)
check("ligands ignored", any("ignoring ligands" in l for l in open("out/run.log")), True)

with open("out/1HSG.pdb_predictions.csv") as fh:
    raw = list(csv.DictReader(fh, skipinitialspace=True))
check("first column keeps trailing padding", "name     " in raw[0], True)
check("'name' is NOT a usable key", "name" in raw[0], False)

with open("out/1HSG.pdb_predictions.csv") as fh:
    rows = [{k.strip(): v.strip() for k, v in r.items()} for r in csv.DictReader(fh)]
check("exactly one pocket", len(rows), 1)
check("top pocket name", rows[0]["name"], "pocket1")
check("top pocket rank", rows[0]["rank"], "1")
check("pocket residues are CHAIN_RESNUM", rows[0]["residue_ids"].split()[0].count("_"), 1)
check("residue count", len(rows[0]["residue_ids"].split()), 29)
check("surface atom count", len(rows[0]["surf_atom_ids"].split()), 53)

lig = [(float(l[30:38]), float(l[38:46]), float(l[46:54]))
       for l in open("1HSG.pdb")
       if l.startswith("HETATM") and l[17:20].strip() == "MK1"]
check("indinavir atoms present in input", len(lig), 45)
cen = [sum(a[i] for a in lig) / len(lig) for i in range(3)]
pc = tuple(float(rows[0]["center_" + a]) for a in "xyz")
d = math.dist(cen, pc)
print(f"ok   top pocket is {d:.2f} A from the indinavir centroid")
check("top pocket lands on the real site (<3 A)", d < 3.0, True)

# exit code cannot distinguish an unparseable input from an empty result
open("truncated.pdb", "w").write("<!doctype html><title>403</title>403 Forbidden")
import subprocess
rc = subprocess.run(["./p2rank_2.5.1/prank", "predict", "-f", "truncated.pdb", "-o", "out_bad"],
                    capture_output=True)
check("unparseable input still exits 0", rc.returncode, 0)
with open("out_bad/truncated.pdb_predictions.csv") as fh:
    check("...and writes a header-only CSV", len(fh.readlines()), 1)

# --- observed 2026-10-13, P2Rank 2.5.1: a change here is drift, not a bug ---
check("[observed] score", rows[0]["score"], "21.67")
check("[observed] probability", rows[0]["probability"], "0.873")
check("[observed] surf_atoms", rows[0]["surf_atoms"], "53")

print()
print("FAILED: " + ", ".join(fails) if fails else "all checks passed")
sys.exit(1 if fails else 0)
PY
```

**Expect.** All checks pass. The load-bearing ones are the invariants — 1492
protein atoms parsed, ligands ignored, exactly one pocket, its 29 residues and
53 surface atoms, the padded first column, exit 0 on an unparseable input, and
the top pocket within 3 Å of the indinavir centroid (0.81 Å when this was
written). The three `[observed]` values are dated to P2Rank 2.5.1 — if only
those move, the model or its calibration changed upstream and this page needs a
new date, not a fix. If an invariant fails, the skill is wrong.
