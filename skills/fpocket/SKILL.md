---
name: fpocket
description: Find and score cavities on a protein structure with fpocket — alpha-sphere detection, pocket and druggability scores — and track whether a cavity stays open across an ensemble or MD trajectory with mdpocket. Use to pick a site before docking.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [pocket-detection, binding-site, druggability, fpocket, mdpocket]
datasets: [https://files.rcsb.org/download/3PTB.pdb, https://files.rcsb.org/download/1E8L.pdb]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-09
  against: fpocket git tag 4.2.3 (commit 4bb0d84, 2026-03-09; the binaries self-report "fpocket 4.0") / gcc 13.3.0 / Python 3.11.17 on Linux x86_64
  executed: 7
  unverified: 1
  unverified_reason: >-
    The mdpocket binary-trajectory path (--trajectory_file with xtc/dcd/netcdf) needs an
    actual MD trajectory and an engine to produce one, neither of which the validating
    environment has. The equivalent --pdb_list path over a 10-conformer NMR ensemble was
    executed instead, which exercises the same per-snapshot pocket code. Re-run the
    trajectory block from a host with GROMACS or Amber output to hand.
---

# fpocket — geometric pocket detection

fpocket finds cavities on a protein surface by Voronoi tessellation. It packs
the structure with **alpha spheres** — spheres touching four atoms and holding
no atom inside — then clusters the spheres that sit in concave regions. Each
cluster is a pocket, described by ~20 geometric and physicochemical
descriptors and two scores.

It is **purely geometric**. It knows nothing about any ligand, it does not
dock, and it does not predict affinity. What it answers is "where are the
cavities on this structure, and which ones look like ligand sites" — the step
before docking, not a substitute for it. The companion `autodock-vina` skill
covers what to do once a site is chosen.

Three binaries come out of one build, and they answer different questions:

| binary | question |
|---|---|
| **fpocket** | where are the pockets on this one structure |
| **mdpocket** | does a pocket stay open across an ensemble or a trajectory |
| **dpocket** | extract descriptors for known ligand sites, to train or compare |

`tpocket` also builds; it scores fpocket's own performance against a
benchmark set and is not part of normal use.

**What you need to obtain: nothing.** No account, no API key, no licence to
accept, no GPU. fpocket is MIT-licensed C and runs on one CPU core in under a
second for a typical protein. The only requirement is a C compiler, and the
build is self-contained — qhull is vendored in the source tree and the NetCDF
dependency is disabled by default.

## Install

Build from source. This is the canonical route and pins an exact commit:

```bash
git clone https://github.com/Discngine/fpocket
cd fpocket
make                       # NOT make -j — see below
./bin/fpocket -h | head -3
```

**Do not use `make -j`.** The upstream makefile is not parallel-safe: the
top-level rules compile against qhull headers that a concurrent sub-make is
still staging, and `make -j4` fails with
`fatal error: libqhull/libqhull.h: No such file or directory`. Serial `make`
succeeds from the same clean tree. The build emits ~120 compiler warnings and
exits 0; that is expected for this codebase.

`make install` copies the binaries to `/usr/local/bin`, which needs root. For
an unprivileged install, leave them in `bin/` and put that on `PATH`, or copy
them anywhere you like — they are static enough to relocate.

`conda install -c conda-forge fpocket` is the packaged alternative when a
conda environment is already in play. The conda-forge recipe builds the same
4.2.3 tag from the same repository and is co-maintained by one of fpocket's
authors, so it is not a divergent fork — but note it **skips Windows**
(`skip: true  # [win]`), so WSL or a container is the Windows route either
way.

A third-party WebAssembly build, FpocketWeb (Apache-2.0), runs the same
algorithm client-side in a browser. It is useful for a one-off look at a
single structure and is not a dependency of anything here.

Version reporting is confusing and worth knowing before you record what you
ran: the repository's current tag is **4.2.3**, but every binary prints
`fpocket 4.0` in its banner. Take the version from `git describe --tags`, not
from the program.

## Running it on one structure

```bash
curl -O https://files.rcsb.org/download/3PTB.pdb
fpocket -f 3PTB.pdb
```

3PTB is bovine trypsin with benzamidine in the S1 specificity pocket. Output
lands in a directory named after the input file with the extension stripped:

```
3PTB_out/
├── 3PTB_info.txt          descriptors for every pocket, ranked
├── 3PTB_out.pdb           the protein plus alpha spheres as STP records
├── 3PTB_pockets.pqr       all alpha spheres with radii
├── 3PTB.pml  3PTB.tcl     PyMOL / VMD session scripts
├── 3PTB_PYMOL.sh  3PTB_VMD.sh
└── pockets/
    ├── pocket1_atm.pdb    protein atoms lining pocket 1
    ├── pocket1_vert.pqr   pocket 1's alpha spheres
    └── …                  one pair per pocket, numbered from 1
```

Both input formats work and agree. `fpocket -f 3PTB.cif` on the mmCIF of the
same entry gives identical scores to the PDB run.

Pocket numbering is consistent: `_info.txt` lists `Pocket 1` first and
`pockets/pocket1_*` is that same pocket. The files are **1-indexed**, not
0-indexed.

## Reading the two scores

Every pocket carries a **Score** and a **Druggability Score**, and they rank
differently. This is the single most important thing to get right about
fpocket, because taking the wrong one points you at the wrong cavity.

- **Score** is the pocket score from the original fpocket paper — a
  combination of alpha-sphere density, polarity and apolar proportion, trained
  to separate real ligand sites from incidental surface dents. `_info.txt` is
  ordered by it, descending.
- **Druggability Score** is a separate later model aimed at whether a pocket
  would bind a *drug-like* molecule. It is **not** a refinement of Score and
  it does not inherit the ordering.

Parse the file and compare them:

```bash
python3 - <<'PY'
import re
info = open("3PTB_out/3PTB_info.txt").read()
# "Pocket 1 :" sits at byte 0 of the file. A regex anchored on a preceding
# newline silently drops it and you lose the top-ranked pocket.
blocks = re.split(r"Pocket (\d+) :\n", info)
rows = []
for i in range(1, len(blocks), 2):
    n, body = int(blocks[i]), blocks[i + 1]
    get = lambda k: float(re.search(rf"{k} :?\s*([-\d.]+)", body).group(1))
    rows.append((n, get("Score"), get("Druggability Score"), get("Volume")))

print(f"{'pocket':>6} {'score':>7} {'drug':>7} {'volume':>9}")
for n, s, d, v in rows:
    print(f"{n:>6} {s:>7.3f} {d:>7.3f} {v:>9.3f}")
print("\nrank by Score :", [n for n, *_ in sorted(rows, key=lambda r: -r[1])])
print("rank by Drugg.:", [n for n, *_ in sorted(rows, key=lambda r: -r[2])])
PY
```

On 3PTB this prints ten pockets, and the two rankings disagree at the top:
Score puts pocket 1 first (0.553), druggability puts pocket 3 first (0.463)
while pocket 1 scores only 0.027 there. Pocket 1 is the right answer —
`pockets/pocket1_atm.pdb` holds Asp189, Ser190, Cys191, Gln192, Ser195,
Val213, Ser214, Trp215, Gly216, Gly219 and Cys220, which is the canonical
trypsin S1 site: Asp189 is the residue that confers Arg/Lys specificity and
Ser195 is the catalytic serine. It recovers 11 of the 13 residues within
4.5 Å of the crystallographic benzamidine.

So on a structure whose answer is known, ranking by druggability would have
pointed at the wrong cavity. Use Score to rank candidate sites and read
druggability as a second, independent opinion about one pocket — never as the
sort key on its own.

## Scoring a pocket you already know

Given a bound ligand, `-r` restricts the run to the pocket at that ligand
instead of searching the whole surface. The argument is
`residuenumber:residuename:chain`:

```bash
fpocket -f 3PTB.pdb -r 1:BEN:A
```

`_info.txt` then contains exactly **one** pocket, built around the ligand —
on 3PTB it recovers the same 11 of 13 S1 residues as the unrestricted run's
pocket 1.

**Its Score is not comparable to a ranked run's.** The restricted pocket here
reports Score 0.001 and a volume near 570 Å³, against the unrestricted
pocket 1's 0.553 and roughly 240 Å³, because `-r` grows a pocket around the
ligand rather than scoring a cluster the search produced. Use `-r` for
descriptors of a known site; never put its Score next to the numbers from a
normal run.

`-r` writes to the same output directory as a plain run on the same file, so
run it somewhere else or rename the input — see *Sharp edges*.

## Pockets across an ensemble or a trajectory

`mdpocket` runs the same detection per snapshot and accumulates how often each
point in space is inside a pocket. That is how you tell a persistently open
cavity from one that is an artefact of a single conformer, and it is the tool
for cryptic-pocket questions.

It takes either a binary trajectory or a plain list of PDB files. The file
list needs no MD engine, so an NMR ensemble works as a real conformational
ensemble:

```bash
curl -O https://files.rcsb.org/download/1E8L.pdb
mkdir -p ens
python3 - <<'PY'
n, out = 0, None
for line in open("1E8L.pdb"):
    if line.startswith("MODEL"):
        n += 1
        if n > 10:
            break
        out = open(f"ens/model{n:02d}.pdb", "w")
    elif line.startswith("ENDMDL"):
        if out:
            out.write("END\n"); out.close(); out = None
    elif out is not None and line.startswith(("ATOM", "TER")):
        out.write(line)
print("wrote", n - 1 if n > 10 else n, "snapshots")
PY
ls ens/*.pdb | sort > ens_list.txt
mdpocket --pdb_list ens_list.txt -o lyz
```

1E8L is a 50-model solution-NMR ensemble of hen lysozyme; the first 10 models
are used here and the run takes about half a second. Note what this is and is
not: NMR conformers are experimentally determined alternatives, not
time-ordered MD frames, so frequencies describe the deposited ensemble rather
than a kinetic population.

Four outputs matter:

```
lyz_freq.dx                  grid of pocket frequency, 0–1, over the snapshots
lyz_dens.dx                  grid of alpha-sphere density
lyz_freq_iso_0_5.pdb         the freq >= 0.5 isosurface as pseudo-atoms
lyz_all_atom_pdensities.pdb  protein, with per-atom pocket density in B-factor
```

The `.dx` grids open in PyMOL or VMD as volumes. The isosurface PDB is the
quick numeric handle — the points in it are where a pocket existed in at least
half the snapshots:

```bash
python3 - <<'PY'
iso = [(float(l[30:38]), float(l[38:46]), float(l[46:54]))
       for l in open("lyz_freq_iso_0_5.pdb") if l[:6].strip() in ("ATOM", "HETATM")]
print("freq>=0.5 grid points:", len(iso))

lining = {}
for l in open("lyz_all_atom_pdensities.pdb"):
    if l[:6].strip() not in ("ATOM", "HETATM"):
        continue
    x, y, z = float(l[30:38]), float(l[38:46]), float(l[46:54])
    b = float(l[60:66]) if l[60:66].strip() else 0.0
    if min((x - p[0])**2 + (y - p[1])**2 + (z - p[2])**2 for p in iso) < 16.0:
        lining.setdefault((int(l[22:26]), l[17:20].strip()), []).append(b)

print("residues lining it:", len(lining))
print("catalytic pair present:",
      sorted(f"{rn}{ri}" for ri, rn in lining if ri in (35, 52)))
PY
```

The B-factor column of `*_all_atom_pdensities.pdb` is **overwritten** with
pocket density — it is not a crystallographic B-factor any more. Anything
downstream that reads B-factors from this file is reading pocket occupancy.

Read the result conservatively. On this ensemble the freq ≥ 0.5 isosurface is
a broad region lined by ~66 residues across the protein, not one tidy pocket;
the catalytic Glu35/Asp52 pair of lysozyme falls inside it, and cleft
residues including Trp108, Gln121 and Ala107 carry the higher per-atom
densities. A frequency map is a map, so threshold it and inspect the region
you care about rather than reporting "the pocket".

For a real MD trajectory, pass it directly with a topology PDB. This is the
block that was **not** executed here — there is no trajectory in the
validating environment:

```bash
mdpocket --trajectory_file traj.xtc --trajectory_format xtc \
         -f topology.pdb -o run1
# then characterise one pocket over the same trajectory:
mdpocket --trajectory_file traj.xtc --trajectory_format xtc \
         -f topology.pdb --selected_pocket run1_freq_iso_0_5.pdb -o run1_char
```

Accepted formats are `xtc`, `trr`, `dcd`, `netcdf`, `crd`, `crdbox` and
`dtr`. **Strip solvent and align the trajectory first** — mdpocket maps onto a
fixed grid, so an unaligned trajectory smears every pocket toward
nothing. The second invocation is the characterisation pass: given a pocket
from the exploration pass, it reports that pocket's volume and descriptors
per frame.

## Sharp edges

- **A second run on the same input silently merges into the first run's
  directory, and can leave it inconsistent.** The output directory is named
  from the input filename with the extension stripped, so `3PTB.pdb` and
  `3PTB.cif` — and a plain run and a `-r` run of the same file — all write to
  `3PTB_out/`. fpocket neither fails nor picks a new name: it prints
  `mkdir: cannot create directory '3PTB_out/pockets': File exists` and
  carries on. The damage is that `_info.txt` is rewritten while
  `pockets/` is not cleaned, so after `fpocket -f 3PTB.pdb` followed by
  `fpocket -f 3PTB.pdb -r 1:BEN:A` the info file describes **1** pocket while
  `pockets/` still holds the **20** files of the earlier 10. Code that globs
  `pockets/*_atm.pdb` then reads nine pockets nothing describes. Work in a
  fresh directory per run.
- **`Volume` is a Monte-Carlo estimate and is not reproducible to the
  decimal.** Three runs of the same binary on the same file gave pocket 1 a
  volume of 237.78, 236.91 and 236.91 Å³ while `Score` (0.553), the
  druggability score (0.027) and the alpha-sphere count (48) were identical
  every time. Round volumes before reporting them, and never diff them for
  equality.
- **A newline-anchored regex loses pocket 1.** `Pocket 1 :` is the first byte
  of `_info.txt`. Split on `Pocket (\d+) :` without a leading `\n`.
- **Ligands, waters and ions are dropped.** fpocket reads ATOM records only.
  In `_out.pdb` the original HETATM records are gone and the HETATM lines you
  see are `STP` pseudo-atoms — the alpha spheres (245 of them for 3PTB). A
  cavity is therefore found in the space a ligand occupied, which is what
  makes redetecting a known site a valid control, but do not expect to find
  the ligand in any output file.
- **A missing input exits 1**, printing `! File x.pdb does not exist` and
  `! Structure reading failed!`. The `***** POCKET HUNTING BEGINS *****`
  banner can appear *after* those lines because the two streams interleave —
  seeing it is not evidence the run got anywhere. Check the exit status.
- **Pocket count is not a quality signal.** Ten pockets on a 223-residue
  protease is normal; most are shallow surface dents. Filter on Score,
  volume and alpha-sphere count before looking at a list.
- **Numbering is per run, not stable across inputs.** "Pocket 3" of one
  structure has nothing to do with "pocket 3" of a mutant or another
  conformer. Compare by residue composition or by position, never by index.

## Limits

fpocket sees one conformation's geometry. A pocket that opens only on ligand
binding is invisible to it on an apo structure — that is what mdpocket over an
ensemble is for, and even then it only finds what the ensemble sampled.
Scores are trained statistics, not physics: a high score is a hypothesis to
test by docking or experiment. Druggability in particular was fitted on a
modest set of drug-target complexes and travels poorly to pockets unlike
those, such as protein-protein interfaces, RNA and metal sites.

## Try it

A self-contained check that this skill still holds: build fpocket from
source, detect pockets on a structure whose ligand site is known, and assert
that the top-scored pocket is that site while the druggability ranking
disagrees. Public data, no account, no key. About two minutes, one core.

**Data** — one PDB entry from the RCSB file service:

    https://files.rcsb.org/download/3PTB.pdb

3PTB is bovine trypsin with benzamidine bound in the S1 specificity pocket, so
the answer is known independently of fpocket. PDB structure data is released
into the public domain (CC0) and needs no account. Last confirmed reachable
2026-10-09.

Runs in an empty directory; it clones and builds the tool it invokes.

```bash
set -eu
git clone --quiet https://github.com/Discngine/fpocket
make -C fpocket >/dev/null 2>&1          # serial: the makefile is not -j safe
FP="$PWD/fpocket/bin/fpocket"
echo "tag: $(git -C fpocket describe --tags)"

curl -sS -O https://files.rcsb.org/download/3PTB.pdb
"$FP" -f 3PTB.pdb

# the known answer: residues within 4.5 A of the benzamidine
python3 - <<'PY'
import re

def atoms(path, recs=("ATOM", "HETATM")):
    for l in open(path):
        if l[:6].strip() in recs:
            yield (l[17:20].strip(), l[22:26].strip(),
                   float(l[30:38]), float(l[38:46]), float(l[46:54]))

lig = [a for a in atoms("3PTB.pdb", ("HETATM",)) if a[0] == "BEN"]
assert lig, "no BEN in 3PTB.pdb — the entry changed"
# Protein ATOM records only. Counting HETATM here would fold the ordered
# waters and the Ca2+ ion into the "site" and inflate the denominator.
site = {a[1] for a in atoms("3PTB.pdb", ("ATOM",))
        for q in lig
        if (a[2]-q[2])**2 + (a[3]-q[3])**2 + (a[4]-q[4])**2 < 4.5**2}

info = open("3PTB_out/3PTB_info.txt").read()
blocks = re.split(r"Pocket (\d+) :\n", info)        # no leading \n: pocket 1 is at byte 0
rows = []
for i in range(1, len(blocks), 2):
    n, body = int(blocks[i]), blocks[i + 1]
    get = lambda k: float(re.search(rf"{k} :?\s*([-\d.]+)", body).group(1))
    rows.append((n, get("Score"), get("Druggability Score")))
assert rows and rows[0][0] == 1, "pocket 1 missing — the newline-anchored parse bug"

by_score = [n for n, *_ in sorted(rows, key=lambda r: -r[1])]
by_drug = [n for n, *_ in sorted(rows, key=lambda r: -r[2])]
top = by_score[0]
lin = {a[1] for a in atoms(f"3PTB_out/pockets/pocket{top}_atm.pdb", ("ATOM",))}
recovered = len(lin & site)

print("pockets found      :", len(rows))
print("info file ordered  :", "by Score" if by_score == [n for n, *_ in rows] else "NOT by Score")
print("top pocket by Score:", top)
print("site residues      : %d, recovered by that pocket: %d" % (len(site), recovered))
print("rank by Score      :", by_score[:3])
print("rank by Druggabil. :", by_drug[:3])
print("S1 markers present :", sorted(lin & {"189", "195"}))

assert recovered >= 8, "top-scored pocket is no longer the benzamidine site"
assert {"189", "195"} <= lin, "Asp189/Ser195 missing from the top pocket"
assert by_drug[0] != top, "druggability now agrees with Score — the ranking caveat is stale"
print("OK")
PY
```

**Expect**

Invariants — these hold across versions, and a failure means the skill is
wrong:

- Serial `make` exits 0 and produces `bin/fpocket`. A `libqhull.h` not-found
  error means the build went parallel.
- `_info.txt` is ordered by **Score**, descending, and pocket numbering starts
  at **1** and matches `pockets/pocketN_*`.
- The **top pocket by Score is the benzamidine site**, recovering at least 8
  of its ~13 contact residues and always including **Asp189** and **Ser195**.
  This is the claim the skill rests on; if it fails, ranking advice here is
  wrong.
- The **druggability ranking disagrees** with the Score ranking at the top. If
  that assertion ever fails, the *Reading the two scores* caveat is stale and
  should be rewritten rather than quietly dropped.
- No HETATM from the input survives into `pockets/pocketN_atm.pdb` — the
  ligand is never part of a pocket file.

Observed 2026-10-09 against fpocket tag 4.2.3 / gcc 13.3.0 / Python 3.11.17 —
treat a mismatch here as drift to investigate, not as a failure:

```
tag: 4.2.3
pockets found      : 10
info file ordered  : by Score
top pocket by Score: 1
site residues      : 13, recovered by that pocket: 11
rank by Score      : [1, 2, 3]
rank by Druggabil. : [3, 1, 5]
S1 markers present : ['189', '195']
OK
```

Exact scores move with the build and the input file's revision, so the
numbers in *Reading the two scores* (0.553 and 0.027 for pocket 1, 0.463 for
pocket 3) are observed values rather than invariants. The orderings, the
residue composition of the top pocket, and the disagreement between the two
rankings are the parts that carry the claim.

## Sources

- Le Guilloux V., Schmidtke P., Tuffery P. Fpocket — an open source platform
  for ligand pocket detection. *BMC Bioinformatics* 10, 168 (2009).
  https://doi.org/10.1186/1471-2105-10-168
- Schmidtke P., Barril X. Understanding and predicting druggability — a
  high-throughput method for detection of drug binding sites.
  *J Med Chem* 53(15), 5858–5867 (2010).
  https://doi.org/10.1021/jm100574m
- Schmidtke P., Bidon-Chanal A., Luque F.J., Barril X. MDpocket — open-source
  cavity detection and characterization on molecular dynamics trajectories.
  *Bioinformatics* 27(23), 3276–3285 (2011).
  https://doi.org/10.1093/bioinformatics/btr550
- Source repository and MIT licence: https://github.com/Discngine/fpocket
