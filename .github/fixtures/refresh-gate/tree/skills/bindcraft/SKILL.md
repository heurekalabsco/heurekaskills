---
name: bindcraft
description: Design de novo protein binders against a chosen epitope with BindCraft — trimming the target, hotspot syntax, the settings and filter file grammar, what its accept/reject thresholds actually compare, and which interface metrics the PyRosetta-free FreeBindCraft build replaces with constants. The design stage needs an NVIDIA GPU.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-design, protein-structure, bindcraft, alphafold, licensing]
datasets: [https://raw.githubusercontent.com/cytokineking/FreeBindCraft/master/settings_filters/default_filters.json, https://raw.githubusercontent.com/cytokineking/FreeBindCraft/master/performance_data/pdl1_miniprotein/pdl1_final_design_stats_pyrosetta.csv, https://raw.githubusercontent.com/cytokineking/FreeBindCraft/master/performance_data/pdl1_miniprotein/pdl1_final_design_stats_freebindcraft.csv, https://files.rcsb.org/download/5O45.pdb]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: BindCraft efb5bfe (2026-08-12) / FreeBindCraft 8b8d4c4 (2026-07-10) / ColabDesign repository HEAD / Python 3.12.8, numpy 1.26.4, openmm 8.6, freesasa, biopython 1.88 / RCSB entries 5O45, 1IGT, 1TUP, 6VXX, 1F88, 1BRS, 1UBQ, 1D3Z, 1AKI, 1REI, 4HHB, 3BIS / licence text read from RosettaCommons/rosetta main and PyPI on 2026-08-28
  executed: 13
  unverified: 3
  unverified_reason: >-
    Three blocks install and run the design pipeline itself. BindCraft's own README
    states it requires a CUDA-compatible Nvidia graphics card, the installer builds a
    conda environment around a CUDA jaxlib, and the shipped helper binaries are Linux
    x86-64 ELF. The validating host is arm64 macOS with no NVIDIA GPU, so neither
    installer can complete and no trajectory can run. Re-run those three on a Linux
    x86_64 host with a CUDA GPU, conda, and roughly 10 GB free for the AlphaFold2
    weights. Everything else on this page — the licensing audit, the dependency tree,
    target and hotspot preparation, the CSV schema, filter semantics, and the audit of
    the PyRosetta-free scoring path against a published pair of matched runs — needs
    none of that and was executed.
---

# BindCraft

BindCraft designs a binder against a target you choose, from nothing. It hallucinates a
binder sequence and backbone directly through AlphaFold2 by backpropagating a loss that
rewards a confident interface at the epitope you name, redesigns that sequence with
ProteinMPNN, re-predicts the complex, and keeps what clears a filter file. Out the far
end come ranked PDB files and a CSV of interface metrics.

Two things about this page before anything else.

**The licence question is the reason it exists, and it is answered first.** BindCraft is
MIT. Its standard install is not runnable by everyone, because the installer pulls in
PyRosetta, whose free grant is a non-commercial licence. The PyRosetta-free build is the
route that works for every reader, and most of what follows is about what that build
computes, what it hard-codes, and how to tell the difference in an output file.

**This skill stops where design stops.** Ranking and cutting a set of finished designs —
interface confidence from a PAE matrix, self-consistency, developability, how well any of
those thresholds actually predict binding — is `binder-design-filtering`. What is below
covers BindCraft's own accept/reject step because that is part of running it, not the
downstream question of whether those thresholds are good ones.

## The licensing crux

### Both repositories, and which one has the escape hatch

Clone them side by side; every block on this page assumes that layout.

```bash
git clone --depth 1 https://github.com/martinpacesa/BindCraft.git
git clone --depth 1 https://github.com/cytokineking/FreeBindCraft.git

for r in BindCraft FreeBindCraft; do
  printf '%-14s %s  %s\n' "$r" "$(git -C $r rev-parse --short HEAD)" \
                              "$(git -C $r log -1 --format=%ad --date=short)"
done
diff <(tail -n +5 FreeBindCraft/LICENSE) BindCraft/LICENSE >/dev/null \
  && echo "LICENSE     FreeBindCraft carries BindCraft's MIT text verbatim under a 4-line header"
grep -q 'no-pyrosetta' FreeBindCraft/bindcraft.py && echo "--no-pyrosetta  present in FreeBindCraft/bindcraft.py"
grep -q 'no-pyrosetta' BindCraft/bindcraft.py     || echo "--no-pyrosetta  ABSENT from BindCraft/bindcraft.py"
```

```text
BindCraft      efb5bfe  2026-08-12
FreeBindCraft  8b8d4c4  2026-07-10
LICENSE     FreeBindCraft carries BindCraft's MIT text verbatim under a 4-line header
--no-pyrosetta  present in FreeBindCraft/bindcraft.py
--no-pyrosetta  ABSENT from BindCraft/bindcraft.py
```

**FreeBindCraft** is a fork of BindCraft v1.52 whose `LICENSE` is BindCraft's MIT text
carried verbatim under a four-line header saying exactly that. Its headline addition is
the `--no-pyrosetta` flag, usable at both install and run time, which the upstream
repository does not have; it also adds an `ipSAE` column, an interactive prompt mode, a
`--rank-by` option and a Docker path. The rest of this section is why that one flag is
the difference between a tool some readers can use and one all of them can.

### What the standard install pulls in

BindCraft's own installer does this, at line 106 of `install_bindcraft.sh`:

```
pip install pyrosetta --find-links https://west.rosettacommons.org/pyrosetta/quarterly/release.cxx11thread.serialization
```

and its README says, in its own words:

> Note: This install script will install PyRosetta, which requires a license for
> commercial purposes.

`pyrosetta` is not on public PyPI at all — that `--find-links` URL is an open directory
listing of wheels on a RosettaCommons host, which anyone can download without an account.
The gate is contractual, not technical. The package PyPI *does* carry,
`pyrosetta-installer`, declares its licence as `Rosetta Software License` and says on its
own project page:

> **Note that USE OF PyRosetta FOR COMMERCIAL PURPOSES REQUIRE PURCHASE OF A LICENSE.**

The terms themselves are in `RosettaCommons/rosetta`. The Rosetta preamble is explicit
about status:

> a. While the Rosetta source code is published on GitHub, it is not "Open Source"
> (according to the OSI definition). Use of Rosetta is governed by the license agreement
> -- either the one below or a separate commercial agreement obtained through University
> of Washington CoMotion.
>
> b. Use for commercial purposes is not permitted under the following license.

PyRosetta has its own file, and its title is the finding. `LICENSE.PyRosetta.md` opens:

> # PyRosetta Software Non-Commercial License Agreement
>
> The PyRosetta software has been developed by … and published/made publicly available
> via Github through the University of Washington ("UW") for noncommercial, non-profit
> use. … If you wish to use the Software for any commercial purposes, including fee-based
> service projects, you will need to execute a separate licensing agreement with the UW
> by contacting license@uw.edu and pay a fee.

and it stacks a second requirement on top of the first:

> "Software" includes both source and executable copies of the PyRosetta software as
> distributed by the Rosetta Commons. **Use of Software requires a valid concurrent
> non-commercial license of Rosetta.**

Its definition of who qualifies excludes more than the obvious case — not just companies,
but academic groups doing contract work whose IP a company owns:

> "Non-Commercial User" means 1) employees of not-for-profit research institutions,
> government laboratories, and universities conducting research excluding (a) commercial
> service; or (b) contract research or services for a for profit company where the
> intellectual property resulting from such research or service is owned by the for-profit
> company, and 2) individuals excluding (a) any use by, for, or on behalf of an entity
> organized for profit; or (b) any use intended for or directed toward commercial
> advantage or monetary compensation.

RosettaCommons' own licensing FAQ answers the question directly: asked whether Rosetta is
open source, it says

> No. The Rosetta source code is made freely available for academic and not-for-profit
> research, but commercial entities must pay an annual licensing fee for access.

So the standard BindCraft path has one free route and it is a non-commercial one. An
academic or government user can take it today at no cost. A company, or an academic doing
company-owned contract work, cannot, without a negotiated agreement with UW CoMotion. The
tool is MIT; the path is not.

Check all of that yourself rather than taking it from this page — the terms are the sort
of thing that moves:

```bash
# 1. Is PyRosetta on public PyPI at all?
printf 'pypi/pyrosetta            %s\n' \
  "$(curl -s -o /dev/null -w '%{http_code}' https://pypi.org/pypi/pyrosetta/json)"

# 2. The package PyPI does carry is a downloader. Read the licence it declares.
curl -s https://pypi.org/pypi/pyrosetta-installer/json |
  python3 -c 'import json,sys; i=json.load(sys.stdin)["info"]; print("pypi/pyrosetta-installer  license:", i["license"]); print("                          summary:", i["summary"])'

# 3. The licence that actually binds a PyRosetta user.
curl -fsSL -o LICENSE.PyRosetta.md \
  https://raw.githubusercontent.com/RosettaCommons/rosetta/main/LICENSE.PyRosetta.md
head -1 LICENSE.PyRosetta.md
grep -o 'requires a valid concurrent non-commercial license of Rosetta' LICENSE.PyRosetta.md

# 4. What BindCraft's own installer does about it, and what its README says.
grep -n 'pip install pyrosetta' BindCraft/install_bindcraft.sh
grep -on 'which requires a license for commercial purposes' BindCraft/README.md
```

```text
pypi/pyrosetta            404
pypi/pyrosetta-installer  license: Rosetta Software License
                          summary: Download PyRosetta wheel package from PyRosetta.org and install it
# PyRosetta Software Non-Commercial License Agreement
requires a valid concurrent non-commercial license of Rosetta
106:pip install pyrosetta --find-links https://west.rosettacommons.org/pyrosetta/quarterly/release.cxx11thread.serialization
17:which requires a license for commercial purposes
```

Two traps worth naming, because both have produced wrong answers. **Check the
dependency's own distribution, not the parent's reputation** — BindCraft's MIT `LICENSE`
says nothing about what its installer fetches. And **an organisation name is not a
licence**: RosettaCommons publishes `foundry` under BSD-3-Clause while core Rosetta and
PyRosetta are not OSI-licensed at all, so confirming one repository in that organisation
and generalising across it gets this backwards.

### The route that avoids it

`--no-pyrosetta` swaps every Rosetta-dependent step for an open component: OpenMM for
relaxation, FreeSASA or Biopython for surface area, `sc-rs` for shape complementarity,
Biopython for alignment and RMSD. FreeBindCraft's own README states the licence condition
on the other branch in its own words:

> If you choose to install with PyRosetta, a license is required for commercial use.

That free route is what the rest of this page documents. It is not a drop-in equivalent,
and *What the free build substitutes* below is the accounting.

### The licence binds the whole program, not just the scoring step

This is the part that decides the question, and it is not visible from the README.
PyRosetta is *used* only at the end of a design — relaxation and a handful of interface
metrics. But stock BindCraft imports it unconditionally at package level, so nothing in
the program starts without it, including the AlphaFold2 stage that has no Rosetta content
at all. There is no partial route: you take the terms or you take the fork.

## What you must have before running anything

| | |
|---|---|
| **A CUDA-compatible NVIDIA GPU** | BindCraft's README — "BindCraft requires a CUDA-compatible Nvidia graphics card to run." Both installers build a conda environment around a CUDA `jaxlib`. |
| **GPU memory** | The README recommends "at least 32 Gb of GPU memory" for larger target-plus-binder complexes, and asks you to trim the target to the smallest size possible. |
| **Linux x86-64, in practice** | `dssp`, `sc-rs`, FASPR and `DAlphaBall.gcc` are committed as prebuilt Linux x86-64 ELF binaries. Anywhere else you build them yourself, and one of them fails silently if you do not — see *The shipped helper binaries are Linux x86-64 only*. |
| **conda or mamba** | The installer is a conda script. Neither `bindcraft` nor `freebindcraft` is on PyPI, so there is no pip route. |
| **~5.3 GB of disk** | The AlphaFold2 parameter archive the installer downloads. The code itself is about 2 MB. |
| **A PyRosetta licence** | Only on the standard path, and only if you are not a Non-Commercial User as its licence defines that. The `--no-pyrosetta` path needs none. |

No account, token or registration is needed for either repository or for the AlphaFold2
weights.

## Install

Neither of the next two blocks was executed here: this host has no NVIDIA GPU and the
environments will not build without one. They are transcribed from the two repositories'
own installers.

The PyRosetta-free build, which is the one to use unless you specifically need Rosetta
energetics and hold a licence:

```bash
git clone https://github.com/cytokineking/FreeBindCraft.git
cd FreeBindCraft
bash install_bindcraft.sh --cuda '12.4' --pkg_manager 'conda' --no-pyrosetta
```

The standard build, which fetches PyRosetta and puts you under the terms quoted above:

```bash
git clone https://github.com/martinpacesa/BindCraft.git
cd BindCraft
bash install_bindcraft.sh --cuda '12.4' --pkg_manager 'conda'
```

Set `--cuda` to your driver's CUDA version. Leaving it blank lets conda guess, and the
guess is often wrong in a way that surfaces much later as a jaxlib error.

### The open dependency tree, checked

The claim that `--no-pyrosetta` is genuinely open is worth testing rather than trusting.
Everything the bypass path scores with — SASA, relaxation, structure handling — installs
from PyPI with no conda channel, no CUDA and no Rust toolchain. That is a smaller set
than a working BindCraft install, which additionally needs a CUDA `jaxlib` and
ColabDesign; it is the part a laptop can confirm.

```bash
python3 -m venv fbc-venv
./fbc-venv/bin/pip install -q --disable-pip-version-check \
    'numpy<2.0.0' pandas scipy matplotlib seaborn biopython freesasa openmm \
    'pdbfixer @ git+https://github.com/openmm/pdbfixer.git'
./fbc-venv/bin/python - <<'PY'
import importlib, platform
for m in ["numpy", "pandas", "scipy", "matplotlib", "seaborn",
          "Bio", "freesasa", "openmm", "pdbfixer"]:
    mod = importlib.import_module(m)
    print(f"{m:11s} {getattr(mod, '__version__', '(no __version__)')}")
from openmm import Platform
print("openmm platforms:", [Platform.getPlatform(i).getName()
                            for i in range(Platform.getNumPlatforms())])
print("host:", platform.system(), platform.machine())
PY
```

```text
numpy       1.26.4
pandas      3.0.5
scipy       1.17.1
matplotlib  3.11.1
seaborn     0.13.2
Bio         1.88
freesasa    (no __version__)
openmm      8.6
pdbfixer    (no __version__)
openmm platforms: ['Reference', 'CPU', 'OpenCL']
host: Darwin arm64
```

Pin `numpy<2.0.0`, as both installers do. It is not decorative — several packages in the
tree are built against the numpy 1.x ABI.

With that environment, the import asymmetry described above is directly observable. Stock
BindCraft cannot be imported at all; the fork gets past PyRosetta and stops only at
`jax`, which it genuinely needs and which is Apache-2.0:

```bash
for repo in BindCraft FreeBindCraft; do
  printf '%-14s ' "$repo"
  (cd $repo && ../fbc-venv/bin/python -c "import functions" 2>&1 | tail -1)
done
echo; echo "stock  functions/pyrosetta_utils.py lines 5-6:"
sed -n '5,6p' BindCraft/functions/pyrosetta_utils.py
echo "fork   functions/pyrosetta_utils.py lines 11-12 and 25-27:"
sed -n '11,12p;25,27p' FreeBindCraft/functions/pyrosetta_utils.py
```

```text
BindCraft      ModuleNotFoundError: No module named 'pyrosetta'
FreeBindCraft  ModuleNotFoundError: No module named 'jax'

stock  functions/pyrosetta_utils.py lines 5-6:
import os
import pyrosetta as pr
fork   functions/pyrosetta_utils.py lines 11-12 and 25-27:

# Conditionally import PyRosetta - will be available if initialized successfully
    PYROSETTA_AVAILABLE = True
except ImportError:
    PYROSETTA_AVAILABLE = False
```

## Preparing the target

### Trim it

BindCraft's README is emphatic, and the reason is GPU memory rather than accuracy:

> Always try to trim the input target PDB to the smallest size possible! It will
> significantly speed up the binder generation and minimise the GPU memory requirements.

Keep the domain you want a binder against and drop everything else — other chains,
ligands, waters, the rest of an ectodomain. PD-L1 makes a compact worked example, and
`5O45` is useful because chain B is a macrocyclic peptide bound at the PD-1 site, so the
crystal itself tells you where the epitope is.

```bash
curl -fsSL -o 5O45.pdb https://files.rcsb.org/download/5O45.pdb
grep '^COMPND.*MOLECULE' 5O45.pdb
```

```text
COMPND   2 MOLECULE: PROGRAMMED CELL DEATH 1 LIGAND 1;                          
COMPND   7 MOLECULE: PHE-MEA-9KK-SAR-ASP-VAL-MEA-TYR-SAR-TRP-TYR-LEU-CCS-GLY-   
```

### Read the epitope off a known binder

If a structure of your target with anything bound at the site you care about exists, its
footprint is the best hotspot list you will get for free.

```python
import collections, math

TARGET_CHAIN, PROBE_CHAIN, CUTOFF = "A", "B", 4.0
AA3 = {"ALA","ARG","ASN","ASP","CYS","GLN","GLU","GLY","HIS","ILE","LEU","LYS",
       "MET","PHE","PRO","SER","THR","TRP","TYR","VAL"}

def atoms(path):
    """Every heavy atom, keyed (chain, resnum, resname). HETATM included: the
    probe in this entry is a macrocycle of non-standard residues, and an
    ATOM-only parse sees none of it."""
    out = collections.defaultdict(list)
    for l in open(path):
        if l.startswith(("ATOM", "HETATM")):
            name, el = l[17:20].strip(), l[76:78].strip()
            if name == "HOH" or el == "H":
                continue
            out[(l[21], int(l[22:26]), name)].append(
                (float(l[30:38]), float(l[38:46]), float(l[46:54])))
    return out

a = atoms("5O45.pdb")
target = {k: v for k, v in a.items() if k[0] == TARGET_CHAIN and k[2] in AA3}
probe  = [xyz for k, v in a.items() if k[0] == PROBE_CHAIN for xyz in v]

nums = sorted(k[1] for k in target)
gaps = [(x, y) for x, y in zip(nums, nums[1:]) if y - x > 1]
print(f"target chain {TARGET_CHAIN}: {len(target)} standard residues, "
      f"numbered {nums[0]}-{nums[-1]}")
print(f"numbering gaps: {gaps if gaps else 'none'}")
print(f"probe chain {PROBE_CHAIN}: {len(probe)} heavy atoms, "
      f"{len({k[1] for k in a if k[0] == PROBE_CHAIN})} residues, "
      f"non-standard: {sorted({k[2] for k in a if k[0]==PROBE_CHAIN} - AA3)}")

epitope = sorted(
    k[1] for k, v in target.items()
    if any(math.dist(p, q) < CUTOFF for p in v for q in probe))
print(f"\nepitope under {CUTOFF} A of the probe: {len(epitope)} residues")
print("  " + ",".join(str(r) for r in epitope))

no_ca = sorted(k[1] for k in target
               if not any(l[12:16].strip() == "CA" and l[21] == TARGET_CHAIN
                          and int(l[22:26]) == k[1]
                          for l in open("5O45.pdb") if l.startswith("ATOM")))
print(f"residues with no CA (unusable as hotspots): {no_ca if no_ca else 'none'}")

with open("PDL1_target.pdb", "w") as fh:
    for l in open("5O45.pdb"):
        if l.startswith("ATOM") and l[21] == TARGET_CHAIN and l[17:20].strip() in AA3:
            fh.write(l)
    fh.write("END\n")
print(f"\nwrote PDL1_target.pdb  "
      f"{sum(1 for l in open('PDL1_target.pdb') if l.startswith('ATOM'))} atoms")
```

```text
target chain A: 129 standard residues, numbered 17-145
numbering gaps: none
probe chain B: 129 heavy atoms, 15 residues, non-standard: ['9KK', 'CCS', 'MEA', 'NH2', 'SAR']

epitope under 4.0 A of the probe: 16 residues
  54,56,58,60,61,63,66,68,76,113,115,116,117,121,122,123
residues with no CA (unusable as hotspots): none

wrote PDL1_target.pdb  2281 atoms
```

Residue 56 is in that list, which is the single hotspot BindCraft's own shipped
`settings_target/PDL1.json` uses for this target.

### Preflight, before you spend GPU hours

ColabDesign applies two transformations to your target before AlphaFold sees it, and
both can turn a valid PDB into a run that aborts or into a hotspot that means something
other than what you wrote. Only the first model is read. And an insertion code is
**stripped from the residue number rather than rejected** — so `100` and `100A` both
become residue 100.

That second one matters because BindCraft resolves each hotspot with
`assert len(idx) == 1, f'ERROR: positions {i} and chain {c} not found'`. Two residues
sharing a number make `len(idx) == 2`, and the run dies with a message saying the
position was *not found* — which is the opposite of the problem.

```python
import collections

AA3 = {"ALA","ARG","ASN","ASP","CYS","GLN","GLU","GLY","HIS","ILE","LEU","LYS",
       "MET","PHE","PRO","SER","THR","TRP","TYR","VAL"}

def preflight(pdb, chain):
    """What ColabDesign's target prep will actually see, and what will abort."""
    rows, model, nmodels, nonstd = [], 1, 0, collections.Counter()
    for l in open(pdb):
        if l.startswith("MODEL"):
            model += 1; nmodels += 1
        if model > 2:
            continue
        if l.startswith("ATOM") and l[21] == chain:
            icode = l[26] if l[26] != " " else ""
            rows.append((int(l[22:26]), icode, l[17:20].strip(), l[12:16].strip()))
            if l[17:20].strip() not in AA3:
                nonstd[l[17:20].strip()] += 1

    if not rows:
        return f"chain {chain!r} has no ATOM records - the run aborts at prep"

    by_num = collections.defaultdict(set)
    for num, icode, name, _ in rows:
        by_num[num].add((icode, name))
    collided = sorted(n for n, s in by_num.items() if len(s) > 1)

    atoms = collections.defaultdict(set)
    for num, icode, name, at in rows:
        atoms[(num, icode)].add(at)
    no_ca = [k for k, v in atoms.items() if "CA" not in v]

    return (len(by_num), collided, len(no_ca), dict(nonstd), max(nmodels, 1))

TARGETS = [("5O45","A"),("1BRS","A"),("1IGT","B"),("6VXX","A"),("1F88","A"),
           ("1UBQ","A"),("1D3Z","A"),("1TUP","E"),("1AKI","A"),("1REI","A"),
           ("4HHB","A"),("3BIS","A"),("5O45","Z")]
print(f"{'entry':7s} {'ch':3s} {'res':>5s} {'dup#':>5s} {'noCA':>5s} {'models':>6s}  non-standard / verdict")
for pdb, ch in TARGETS:
    r = preflight(f"sweep/{pdb}.pdb", ch)
    if isinstance(r, str):
        print(f"{pdb:7s} {ch:3s} {'':>5s} {'':>5s} {'':>5s} {'':>6s}  {r}")
        continue
    n, collided, no_ca, nonstd, models = r
    flag = ""
    if collided:
        flag = f"HOTSPOT ASSERT at {collided[:3]}{'...' if len(collided)>3 else ''}"
    elif no_ca:
        flag = f"{no_ca} residues dropped (unusable as hotspots)"
    print(f"{pdb:7s} {ch:3s} {n:5d} {len(collided):5d} {no_ca:5d} {models:6d}  "
          f"{','.join(sorted(nonstd)) or '-':22s} {flag}")
```

Fetch the twelve entries into `sweep/` first with
`for id in 5O45 1BRS 1IGT 6VXX 1F88 1UBQ 1D3Z 1TUP 1AKI 1REI 4HHB 3BIS; do curl -fsSL -o sweep/$id.pdb https://files.rcsb.org/download/$id.pdb; done`.

```text
entry   ch    res  dup#  noCA models  non-standard / verdict
5O45    A     129     0     0      1  -                      
1BRS    A     108     0     0      1  -                      
1IGT    B     437     3     0      1  -                      HOTSPOT ASSERT at [52, 82, 100]
6VXX    A     972     0     0      1  -                      
1F88    A     338     0     0      1  -                      
1UBQ    A      76     0     0      1  -                      
1D3Z    A      76     0     0     10  -                      
1TUP    E      21     0    21      1  DA,DC,DG,DT            21 residues dropped (unusable as hotspots)
1AKI    A     129     0     0      1  -                      
1REI    A     107     0     0      1  -                      
4HHB    A     141     0     0      1  -                      
3BIS    A     212     0     0      1  -                      
5O45    Z                             chain 'Z' has no ATOM records - the run aborts at prep
```

Three things that sweep found, in order of how much they cost:

- **An antibody target is not usable as deposited.** `1IGT` chain B is Kabat-numbered, so
  it carries insertion codes; residues 52, 82 and 100 each collide with an inserted
  neighbour once the code is stripped. Residue 52 becomes two positions, `52 SER` and
  `52A ASN`. Renumber the chain sequentially before using it as a target.
- **A nucleic-acid chain contributes nothing.** `1TUP` chain E is DNA; all 21 residues
  lack a `CA`, all are dropped, and none can be a hotspot. If your binding site is
  defined by a non-protein partner, BindCraft cannot see it.
- **A wrong chain letter aborts at prep**, not after the first trajectory. Cheap, but
  worth catching before a queue submission.

`1D3Z` is a ten-model NMR entry and only the first model is used, which is the right
behaviour and silent about it.

### The hotspot string

`target_hotspot_residues` is comma-separated segments. A segment is a residue number, a
chain letter followed by a number, a range, or a bare chain letter meaning the whole
chain. **A bare number takes the first chain in the prepped structure**, which is why
BindCraft's single-chain example can write `"56"` and mean chain A. Numbers are the
residue numbers in your file, not sequence offsets.

Leave it empty and BindCraft targets no particular epitope — a valid choice, and a
different experiment.

```python
import json, os, collections

def residue_index(pdb, chains):
    """(chain, resnum) in file order, restricted to residues that have a CA.
    ColabDesign's target prep drops CA-less residues, so they cannot be hotspots."""
    seen, out = set(), []
    for l in open(pdb):
        if l.startswith("ATOM") and l[12:16].strip() == "CA" and l[21] in chains:
            k = (l[21], int(l[22:26]))
            if k not in seen:
                seen.add(k); out.append(k)
    return out

def resolve_hotspots(spec, pdb, chains):
    """Comma-separated segments: '56', 'A56', '60-65', 'A60-A65', or a bare
    chain letter for the whole chain. A bare number takes the FIRST chain."""
    idx = residue_index(pdb, chains)
    first = idx[0][0]
    positions, missing = [], []
    for seg in spec.split(","):
        seg = seg.strip()
        lo, _, hi = seg.partition("-")
        if lo.isalpha() and not hi:
            positions += [i for i, k in enumerate(idx) if k[0] == lo]
            continue
        c, lo = (lo[0], int(lo[1:])) if lo[0].isalpha() else (first, int(lo))
        hi = lo if not hi else int(hi[1:] if hi[0].isalpha() else hi)
        for r in range(lo, hi + 1):
            hit = [i for i, k in enumerate(idx) if k == (c, r)]
            (positions.extend(hit) if hit else missing.append(f"{c}{r}"))
    return positions, missing

HOTSPOTS = "56,58,60,61,63,66,68"     # the PD-1-facing face, from the epitope above
pos, missing = resolve_hotspots(HOTSPOTS, "PDL1_target.pdb", "A")
print(f"{HOTSPOTS!r} -> {len(pos)} model positions, unresolved: {missing or 'none'}")

for bad in ["A56", "56-58", "A200", "B56", "A"]:
    p, m = resolve_hotspots(bad, "PDL1_target.pdb", "A")
    print(f"  {bad!r:10s} -> {len(p):3d} positions"
          + (f"   ABORTS: {m} not in the file" if m else ""))

settings = {
    "design_path": os.path.abspath("./pdl1_run") + "/",
    "binder_name": "PDL1",
    "starting_pdb": os.path.abspath("PDL1_target.pdb"),
    "chains": "A",
    "target_hotspot_residues": HOTSPOTS,
    "lengths": [65, 150],
    "number_of_final_designs": 100,
}
json.dump(settings, open("PDL1_settings.json", "w"), indent=4)

ref = json.load(open("BindCraft/settings_target/PDL1.json"))
print(f"\nwrote PDL1_settings.json; keys match the shipped example: "
      f"{sorted(settings) == sorted(ref)}")
print(f"binder lengths {settings['lengths']}, "
      f"{settings['number_of_final_designs']} designs wanted, "
      f"paths absolute: {settings['starting_pdb'].startswith('/')}")
```

```text
'56,58,60,61,63,66,68' -> 7 model positions, unresolved: none
  'A56'      ->   1 positions
  '56-58'    ->   3 positions
  'A200'     ->   0 positions   ABORTS: ['A200'] not in the file
  'B56'      ->   0 positions   ABORTS: ['B56'] not in the file
  'A'        -> 129 positions

wrote PDL1_settings.json; keys match the shipped example: True
binder lengths [65, 150], 100 designs wanted, paths absolute: True
```

Use absolute paths in the settings file. `design_path` and `starting_pdb` are read as
given, and a relative path resolves against wherever the job happens to start, which on a
scheduler is rarely where you think.

`lengths` is a sampling range rather than a target, and `number_of_final_designs` is a
stopping condition rather than a batch size — see *Running it* for what each one does to
the run.

## Running it

Not executed here; this host has no NVIDIA GPU. Three files go in: the target settings
you just wrote, a filter file, and an advanced-settings profile.

```bash
python -u ./bindcraft.py \
  --settings './PDL1_settings.json' \
  --filters './settings_filters/default_filters.json' \
  --advanced './settings_advanced/default_4stage_multimer.json' \
  --no-pyrosetta
```

Drop `--no-pyrosetta` to use Rosetta scoring, which requires that you hold a licence
under the terms quoted above. The flag works at runtime even in an environment that has
PyRosetta installed, so one install can produce both.

`settings_advanced/` ships twenty profiles of 64 keys each, the same twenty in both
repositories. `default_4stage_multimer` is the starting point; `peptide_3stage_multimer`
is for short peptide binders; the `betasheet_` variants bias toward beta content;
`_hardtarget` variants raise the interface weighting for targets that resist.

The `_mpnn` suffix does not toggle ProteinMPNN, which is a common misreading.
`enable_mpnn` is `true` in both `default_4stage_multimer` and
`default_4stage_multimer_mpnn`; the two profiles differ in exactly two keys, and the one
that matters is `mpnn_fix_interface`, `true` in the base profile and `false` in the
`_mpnn` one. The suffix means "let MPNN redesign the interface too", not "use MPNN".

Two things are drawn at random per trajectory and neither is exposed as a flag: the seed,
from `np.random.randint(0, 999999)`, and the binder length, uniformly from the inclusive
range in `lengths`. Both are encoded in the design name — `PDL1_l129_s693217_mpnn7` is
binder length 129, seed 693217, MPNN sequence 7 — and both are columns in the CSV, so a
run is auditable after the fact even though it is not reproducible in advance.
`number_of_final_designs` is a stopping condition, not a batch size: the pipeline keeps
launching trajectories until that many designs have cleared the filters, which makes it
the setting that decides how long the job runs.

Expect this to run for hours to days rather than minutes. FreeBindCraft's own published
comparison on the PD-L1 example, on a single B200-class GPU, reports 33.19 h for the
standard pipeline and 12.25 h for the bypass, both to 101 accepted designs, with the
bypass needing 91 trajectories against 144. Treat those as one measurement on one target
and one card.

## What the run produces

Three CSVs, all keyed by column name. The schema changes between versions, so never index
by position — the fork's own `migrate_csv_columns` exists because it moved.

```python
import ast

def labels_from(repo):
    """Run the repo's own column definition without importing the package.
    Importing `functions` pulls in jax, matplotlib and - for stock BindCraft -
    pyrosetta, none of which this needs."""
    src = open(f"{repo}/functions/generic_utils.py").read()
    fn = next(n for n in ast.parse(src).body
              if isinstance(n, ast.FunctionDef) and n.name == "generate_dataframe_labels")
    ns = {}
    exec(compile(ast.Module([fn], []), "<upstream>", "exec"), ns)
    return ns["generate_dataframe_labels"]()

traj, design, final = labels_from("FreeBindCraft")
print(f"trajectory_stats.csv    {len(traj):3d} columns   one row per trajectory")
print(f"mpnn_design_stats.csv   {len(design):3d} columns   one row per MPNN sequence")
print(f"final_design_stats.csv  {len(final):3d} columns   accepted designs, ranked")

core = [c[len("Average_"):] for c in design if c.startswith("Average_")]
print(f"\n{len(core)} per-design metrics, each written six times as Average_X and 1_X..5_X")
print("   " + ", ".join(core[:6]) + ", ...")

_, stock, _ = labels_from("BindCraft")
print(f"\nadded by the fork : {sorted(set(design) - set(stock))[:6]}")
print(f"dropped by the fork: {sorted(set(stock) - set(design)) or 'none'}")
```

```text
trajectory_stats.csv     45 columns   one row per trajectory
mpnn_design_stats.csv   237 columns   one row per MPNN sequence
final_design_stats.csv  238 columns   accepted designs, ranked

37 per-design metrics, each written six times as Average_X and 1_X..5_X
   pLDDT, pTM, i_pTM, pAE, i_pAE, ipSAE, ...

added by the fork : ['1_ipSAE', '2_ipSAE', '3_ipSAE', '4_ipSAE', '5_ipSAE', 'Average_ipSAE']
dropped by the fork: none
```

Every interface metric appears six times: `Average_X`, and `1_X` through `5_X` for the
five AlphaFold2 models. Under the default advanced settings only two models score the
final designs, so columns `3_`, `4_` and `5_` are empty — an empty cell means *not
scored*, not *scored as zero*, and the difference matters because of how the filter
handles a missing value.

The column count is a live example of why to key on names. The published PD-L1
comparison used below has **232** columns in both its CSVs, matching stock BindCraft's
list exactly — those runs predate the six `ipSAE` columns the fork later added, and a
reader indexing by position against today's 238 would be six columns out from `pLDDT`
onward.

`ipSAE` is present only in the fork. It is an interface confidence score computed from
the PAE matrix that ranks better than `i_pTM` on published benchmarks;
`binder-design-filtering` covers what it is and how far to trust it.

## The filter file

`settings_filters/default_filters.json` has 218 entries, most of them `null`. A `null`
threshold means the metric is recorded and not gated. Five files ship: `default`,
`relaxed`, `peptide`, `peptide_relaxed`, and `no_filters`, which gates on nothing.

Two things about the comparison are worth pinning down rather than assuming, and one of
them is a real hazard.

```python
import json, collections

filters = json.load(open("FreeBindCraft/settings_filters/default_filters.json"))

def check_filters(row, filters):
    """BindCraft's accept/reject, reproduced. Two things to note: both
    comparisons are INCLUSIVE, so `higher` is a minimum and not-`higher` is a
    maximum; and a metric absent from the row is SKIPPED, not failed."""
    unmet = []
    for label, cond in filters.items():
        if label.endswith("_InterfaceAAs"):
            for aa, c in cond.items():
                v = (row.get(label) or {}).get(aa)
                if v is None or c["threshold"] is None:
                    continue
                if (v < c["threshold"]) if c["higher"] else (v > c["threshold"]):
                    unmet.append(f"{label}_{aa}")
            continue
        v = row.get(label)
        if v is None or cond["threshold"] is None:
            continue
        if (v < cond["threshold"]) if cond["higher"] else (v > cond["threshold"]):
            unmet.append(label)
    return unmet

active = {k: v for k, v in filters.items()
          if not k.endswith("_InterfaceAAs") and v["threshold"] is not None}
aa_active = {f"{k}_{aa}" for k, v in filters.items() if k.endswith("_InterfaceAAs")
             for aa, c in v.items() if c["threshold"] is not None}
print(f"entries in default_filters.json : {len(filters)}")
print(f"with a threshold set            : {len(active)} + {len(aa_active)} amino-acid caps")

fam = collections.defaultdict(dict)
for k, v in filters.items():
    if not k.endswith("_InterfaceAAs"):
        pre, _, rest = k.partition("_")
        fam[rest][pre] = (v["threshold"], v["higher"])
print("\nactive thresholds, by metric (Average / model 1 / model 2):")
for m, d in fam.items():
    if any(t is not None for t, _ in d.values()):
        arrow = "min" if d["Average"][1] else "max"
        print(f"  {m:32s} {arrow} "
              + "  ".join(f"{p}={d[p][0]}" for p in ("Average", "1", "2")))

bad = {m: d for m, d in fam.items() if len({h for _, h in d.values()}) > 1}
print(f"\nmetrics whose direction is not the same on every model: {list(bad)}")
print(f"  {list(bad)[0]}: " + ", ".join(f"{p}:higher={h}" for p, (_, h) in bad[list(bad)[0]].items()))

good = {"Average_pLDDT": 0.8, "Average_i_pTM": 0.5, "Average_i_pAE": 0.35,
        "Average_ShapeComplementarity": 0.6, "Average_n_InterfaceResidues": 7,
        "Average_dSASA": 1, "Average_Binder_Loop%": 90}
print(f"\nrow sitting exactly on every threshold -> unmet: {check_filters(good, filters)}")
print(f"same row with ShapeComplementarity 0.59 -> unmet: "
      f"{check_filters({**good, 'Average_ShapeComplementarity': 0.59}, filters)}")
print(f"row with ShapeComplementarity absent    -> unmet: "
      f"{check_filters({k: v for k, v in good.items() if 'Shape' not in k}, filters)}")
```

```text
entries in default_filters.json : 218
with a threshold set            : 54 + 2 amino-acid caps

active thresholds, by metric (Average / model 1 / model 2):
  pLDDT                            min Average=0.8  1=0.8  2=0.8
  pTM                              min Average=0.55  1=0.55  2=0.55
  i_pTM                            min Average=0.5  1=0.5  2=0.5
  i_pAE                            max Average=0.35  1=0.35  2=0.35
  Binder_Energy_Score              max Average=0  1=0  2=0
  Surface_Hydrophobicity           max Average=0.35  1=0.35  2=0.35
  ShapeComplementarity             min Average=0.6  1=0.55  2=0.55
  dG                               max Average=0  1=0  2=0
  dSASA                            min Average=1  1=1  2=1
  n_InterfaceResidues              min Average=7  1=7  2=7
  n_InterfaceHbonds                min Average=3  1=3  2=3
  n_InterfaceUnsatHbonds           max Average=4  1=4  2=4
  Binder_Loop%                     max Average=90  1=90  2=90
  Hotspot_RMSD                     max Average=6  1=6  2=6
  Binder_pLDDT                     min Average=0.8  1=0.8  2=0.8
  Binder_RMSD                      max Average=3.5  1=3.5  2=3.5

metrics whose direction is not the same on every model: ['InterfaceUnsatHbondsPercentage']
  InterfaceUnsatHbondsPercentage: Average:higher=False, 1:higher=False, 2:higher=False, 3:higher=False, 4:higher=False, 5:higher=True

row sitting exactly on every threshold -> unmet: []
same row with ShapeComplementarity 0.59 -> unmet: ['Average_ShapeComplementarity']
row with ShapeComplementarity absent    -> unmet: []
```

- **Both comparisons are inclusive.** `higher: true` fails on `value < threshold`, so it
  is a minimum and a value exactly on the line passes. `higher: false` is a maximum, the
  same way. Neither is strict.
- **A metric missing from the row is skipped, not failed.** That is the last line above:
  drop `ShapeComplementarity` and the design passes a filter set that gates on it. This
  is why the bypass path emits placeholders instead of leaving cells empty, and it is why
  an empty column is not evidence a filter ran.
- **`i_pAE` is not in ångströms**, despite being the field everyone reaches for when
  comparing against a published interface-PAE cutoff. ColabDesign's `get_pae_loss` divides
  the raw matrix by 31, so BindCraft's default threshold of 0.35 is roughly 10.9 Å of raw
  predicted aligned error. The published run above confirms the scale rather than the
  arithmetic — its `Average_i_pAE` runs 0.150 to 0.300 across 101 designs, which is not
  ångströms of anything.
- **`dSASA ≥ 1` is not a size filter.** One square ångström of buried surface is "there
  is an interface at all". It rejects a binder that missed entirely and nothing else.
- **`5_InterfaceUnsatHbondsPercentage` carries the opposite direction to the other five
  entries in its family.** Its threshold is `null`, so it is inert as shipped and this
  costs nothing today. Set a threshold there in a custom filter file and model 5 will be
  filtered the wrong way round.
- The two amino-acid caps in the default set are `Average_InterfaceAAs` `K ≤ 3` and
  `M ≤ 3` — a cap on lysine and methionine at the interface, not on anything else.

## What the free build substitutes, and what it hard-codes

This is the section to read before trusting a `--no-pyrosetta` output file.

The fork's technical overview is candid about the design: relaxation moves to OpenMM with
PDBFixer preparation and FASPR side-chain repacking, SASA to FreeSASA with a Biopython
Shrake–Rupley fallback, shape complementarity to `sc-rs` (a Rust reimplementation of
Lawrence and Colman's statistic, MIT), and alignment and RMSD to Biopython. Those are
real substitutions and the overview shows they track the Rosetta values closely.

Rosetta energetics and hydrogen-bond network measures are a different case. Its own words:

> For schema compatibility, placeholders are emitted that satisfy default thresholds but
> should not be interpreted as true physical values. If your workflow critically depends
> on these, run with PyRosetta enabled.

The fork ships a matched pair of runs on the PD-L1 example — one standard, one bypass,
101 accepted designs each — which makes the effect measurable rather than a matter of
reading source comments. A metric that takes one value across 101 designs and every model
is a constant; cross-checking that against the fork's own source separates a hard-coded
placeholder from a metric that merely happened not to vary.

```python
import csv, json, re, collections

D = "FreeBindCraft/performance_data/pdl1_miniprotein"
runs = {"PyRosetta": list(csv.DictReader(open(f"{D}/pdl1_final_design_stats_pyrosetta.csv"))),
        "bypass":    list(csv.DictReader(open(f"{D}/pdl1_final_design_stats_freebindcraft.csv")))}
for n, rows in runs.items():
    print(f"{n:10s} {len(rows)} accepted designs")

# --- 1. empirical: which metrics never move across designs and models?
metrics = sorted({c[len("Average_"):] for c in runs["PyRosetta"][0]
                  if c.startswith("Average_") and not c.endswith("InterfaceAAs")})
def spread(rows, m):
    return {r[c] for r in rows for c in (f"{i}_{m}" for i in range(1, 6))
            if r.get(c) not in (None, "")}
constant = {m: spread(runs["bypass"], m).copy().pop()
            for m in metrics
            if len(spread(runs["bypass"], m)) == 1 and len(spread(runs["PyRosetta"], m)) > 1}

# --- 2. authoritative: which does the fork's own source hard-code?
src = open("FreeBindCraft/functions/pr_alternative_utils.py").read()
col = dict(re.findall(r"'([A-Za-z_%/]+)':\s*mpnn_interface_scores\['(\w+)'\]",
                      open("FreeBindCraft/bindcraft.py").read()))          # CSV -> score key
var = dict(re.findall(r"'(\w+)':\s*(\w+)\s*[,}]", src))                    # score key -> variable
lit = dict(re.findall(r"^\s{4}(\w+)\s*=\s*(-?[\d.]+)\s*#", src, re.M))     # variable -> literal
declared = {c: lit[var[k]] for c, k in col.items() if var.get(k) in lit}

print(f"\n{'metric':32s} {'PyRosetta':>10s} {'bypass':>7s}  value   hard-coded in the fork?")
for m in sorted(constant):
    print(f"{m:32s} {len(spread(runs['PyRosetta'], m)):7d} vals {1:5d}  "
          f"{constant[m]:>6s}   {'yes' if m in declared else 'NO - constant here by chance'}")

# --- 3. which hard-coded metrics does the default filter set gate on?
filters = json.load(open("FreeBindCraft/settings_filters/default_filters.json"))
print("\ndefault filters whose input is a constant in bypass mode:")
for m, v in sorted(declared.items()):
    f = filters.get(f"Average_{m}", {})
    if f.get("threshold") is not None:
        print(f"  Average_{m:30s} {'min' if f['higher'] else 'max'} {f['threshold']:>5}"
              f"   fed {v}  -> passes every time")
```

```text
PyRosetta  101 accepted designs
bypass     101 accepted designs

metric                            PyRosetta  bypass  value   hard-coded in the fork?
Binder_Energy_Score                  202 vals     1    -1.0   yes
InterfaceHbondsPercentage             77 vals     1    60.0   yes
InterfaceUnsatHbondsPercentage        44 vals     1     0.0   yes
Interface_BetaSheet%                   8 vals     1     0.0   NO - constant here by chance
PackStat                              23 vals     1    0.65   yes
Relaxed_Clashes                        2 vals     1       0   NO - constant here by chance
dG                                   197 vals     1   -10.0   yes
dG/dSASA                              97 vals     1     0.0   yes
n_InterfaceHbonds                     15 vals     1       5   yes
n_InterfaceUnsatHbonds                 5 vals     1       1   yes

default filters whose input is a constant in bypass mode:
  Average_Binder_Energy_Score            max     0   fed -1.0  -> passes every time
  Average_dG                             max     0   fed -10.0  -> passes every time
  Average_n_InterfaceHbonds              min     3   fed 5  -> passes every time
  Average_n_InterfaceUnsatHbonds         max     4   fed 1  -> passes every time
```

So: **four of the sixteen metrics the default filter set gates on are no-ops under
`--no-pyrosetta`.**
Interface energy, binder energy, interface hydrogen-bond count and buried unsatisfied
hydrogen bonds are each fed a fixed number chosen to clear its threshold. Four more
metrics — `PackStat`, `dG/dSASA`, and the two hydrogen-bond percentages — are constants
that no default filter gates on, so they are inert placeholders in the CSV that will
mislead anyone who plots them.

Note what the block also shows, because it is the reason to cross-check rather than infer
from the data alone: `Interface_BetaSheet%` and `Relaxed_Clashes` are constant in this
particular pair of runs and are **not** placeholders. These designs are helical and
relaxed cleanly. Constancy alone would have called them fakes.

The fork's justification is empirical and it is worth stating fairly. Across roughly
20,000 trajectories it measured that over 90% of rejections are driven by AlphaFold
metrics before any Rosetta scoring is reached, hydrogen-bond network quality accounts for
about 3.23%, shape complementarity about 0.74%, and interface energetics were "negligible
drivers (only one observed rejection across these runs)". So the four dead filters were
rejecting almost nothing to begin with.

Its own head-to-head is the honest number for what that costs. Rescoring the 101
bypass-accepted designs with PyRosetta, it reports approximately 58% satisfying all the
traditional Rosetta filters — meaning about two designs in five would not have survived
the standard pipeline, most of them on hydrogen-bond network measures.

### The shipped helper binaries are Linux x86-64 only

`sc-rs`, FASPR and `dssp` are committed to the repositories as prebuilt binaries, which
is convenient on the platform they were built for and a silent failure everywhere else.
Shape complementarity is the one that bites: the fork checks the executable bit, which an
ELF file on macOS satisfies, then fails at exec, catches the exception, and returns a
fallback of 0.70 — comfortably above the 0.55 and 0.60 thresholds.

```bash
for b in FreeBindCraft/functions/sc FreeBindCraft/functions/FASPR \
         FreeBindCraft/functions/dssp BindCraft/functions/DAlphaBall.gcc; do
  printf '%-40s %s\n' "$b" "$(file -b "$b" | cut -d, -f1-2)"
done
python3 - <<'PY'
import os, subprocess
p = "FreeBindCraft/functions/sc"
print("\nos.access(sc, X_OK):", os.access(p, os.X_OK), "  <- the check the fork makes")
try:
    subprocess.run([p, "x.pdb", "A", "B", "--json"], capture_output=True, check=True)
except Exception as e:
    print("actually running it:", type(e).__name__ + ":", e)
    print("-> _calculate_shape_complementarity returns its 0.70 fallback,")
    print("   which passes the default ShapeComplementarity thresholds of 0.55/0.60")
PY
```

```text
FreeBindCraft/functions/sc               ELF 64-bit LSB pie executable, x86-64
FreeBindCraft/functions/FASPR            ELF 64-bit LSB pie executable, x86-64
FreeBindCraft/functions/dssp             ELF 64-bit LSB executable, x86-64
BindCraft/functions/DAlphaBall.gcc       ELF 64-bit LSB executable, x86-64

os.access(sc, X_OK): True   <- the check the fork makes
actually running it: OSError: [Errno 8] Exec format error: 'FreeBindCraft/functions/sc'
-> _calculate_shape_complementarity returns its 0.70 fallback,
   which passes the default ShapeComplementarity thresholds of 0.55/0.60
```

The two fallback paths differ in how loudly they fail. A missing binary is announced only
under `--verbose`; a binary that exists and will not execute prints a warning per design,
which in a run of thousands is easy to scroll past. Either way the number in the CSV is
0.70. **If every `ShapeComplementarity` in your output is exactly 0.70, no shape
complementarity was computed.**

The fork ships a `Dockerfile` on `nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04` that
defaults to the PyRosetta-free build (`--build-arg WITH_PYROSETTA=true` opts into the
other one). Building that image is the least effortful way to be on the platform the
binaries were compiled for, and a container runtime plus an NVIDIA GPU is the same
requirement the conda path already has.

## Where this skill stops

BindCraft hands back ranked PDBs and a CSV. Deciding which of them to synthesise — which
scores to rank on, which thresholds transfer between targets, how much enrichment any of
this buys against a labelled benchmark, and what none of it predicts — is
`binder-design-filtering`. It is worth reading before you order, because the filters in
this page's CSV are BindCraft's opinion about its own designs, and they were set for a
pipeline rather than validated against binding data.

Two related tools in this registry. `proteinmpnn` runs the inverse-folding step on its
own, if you want to redesign a backbone you already have. `protenix` predicts a complex
structure, which is what you would use to re-predict a design independently.

## Try it

Checks the central claim of this page against a published pair of matched runs: that four
of BindCraft's default filters receive a constant when the pipeline runs without
PyRosetta, and that a metric absent from a row passes the filter set rather than failing
it. Runs cold in an empty directory with `curl` and the system Python — no venv, no
packages, no GPU.

**Data.** FreeBindCraft's own PD-L1 comparison release — `final_design_stats.csv` from
two runs against the same target, one with PyRosetta and one with `--no-pyrosetta`, 101
accepted designs each — plus the default filter file. MIT-licensed, in a public GitHub
repository, no account needed. Confirmed reachable 2026-08-28.

```bash
set -e
base=https://raw.githubusercontent.com/cytokineking/FreeBindCraft/master
curl -fsSL -O $base/settings_filters/default_filters.json
for v in pyrosetta freebindcraft; do
  curl -fsSL -O $base/performance_data/pdl1_miniprotein/pdl1_final_design_stats_$v.csv
done

python3 - <<'PY'
import csv, json

filters = json.load(open("default_filters.json"))
runs = {v: list(csv.DictReader(open(f"pdl1_final_design_stats_{v}.csv")))
        for v in ("pyrosetta", "freebindcraft")}

def check_filters(row):
    """BindCraft's own accept/reject. Both comparisons are inclusive, and a
    metric missing from the row is skipped rather than failed."""
    unmet = []
    for label, cond in filters.items():
        if label.endswith("_InterfaceAAs"):
            continue
        v, t = row.get(label), cond["threshold"]
        if v is None or t is None:
            continue
        if (v < t) if cond["higher"] else (v > t):
            unmet.append(label)
    return unmet

def spread(rows, metric):
    return {r[c] for r in rows for c in (f"{i}_{metric}" for i in range(1, 6))
            if r.get(c) not in (None, "")}

print("accepted designs           "
      + "  ".join(f"{v}={len(r)}" for v, r in runs.items()))

GATED = ["dG", "Binder_Energy_Score", "n_InterfaceHbonds", "n_InterfaceUnsatHbonds"]
print(f"\n{'metric':24s} {'PyRosetta':>10s} {'bypass':>8s}  bypass value  threshold")
for m in GATED:
    a, b = spread(runs["pyrosetta"], m), spread(runs["freebindcraft"], m)
    f = filters[f"Average_{m}"]
    val = next(iter(b))
    print(f"{m:24s} {len(a):8d}v {len(b):7d}v  {val:>12s}  "
          f"{'min' if f['higher'] else 'max'} {f['threshold']}")
    assert len(b) == 1 and len(a) > 1
    assert (float(val) >= f["threshold"]) if f["higher"] else (float(val) <= f["threshold"])

on_threshold = {"Average_pLDDT": 0.8, "Average_i_pTM": 0.5, "Average_i_pAE": 0.35,
                "Average_ShapeComplementarity": 0.6, "Average_n_InterfaceResidues": 7}
print(f"\nrow exactly on every threshold      unmet: {check_filters(on_threshold)}")
print(f"ShapeComplementarity 0.59           unmet: "
      f"{check_filters({**on_threshold, 'Average_ShapeComplementarity': 0.59})}")
print(f"ShapeComplementarity absent         unmet: "
      f"{check_filters({k: v for k, v in on_threshold.items() if 'Shape' not in k})}")

assert check_filters(on_threshold) == []
assert check_filters({**on_threshold, "Average_ShapeComplementarity": 0.59}) \
       == ["Average_ShapeComplementarity"]
assert check_filters({k: v for k, v in on_threshold.items() if "Shape" not in k}) == []
assert len(runs["pyrosetta"]) == len(runs["freebindcraft"]) == 101
print("\nOK")
PY
```

**Expect.**

*Invariants* — these hold regardless of any software version, because the release is
frozen. A failure means this page is wrong, not that upstream moved. Both runs hold 101
accepted designs. Each of the four gated metrics takes exactly one value across all 101
designs and all five model columns in the bypass run, and more than one in the PyRosetta
run. Each of those constants satisfies its own threshold, which is the definition of a
no-op filter. A row sitting exactly on every threshold passes, because both comparisons
are inclusive. Nudging shape complementarity one hundredth below its threshold fails that
one filter and no other. **Removing shape complementarity from the row entirely passes** —
that is the trap the whole section is about, and if a future version starts failing on a
missing value, the last assertion breaks and this page needs revising.

*Observed values*, run 2026-08-28 against FreeBindCraft `8b8d4c4` with Python 3.12.8. A
mismatch here is drift to investigate — the placeholder constants are chosen in the
fork's source and could change.

```text
accepted designs           pyrosetta=101  freebindcraft=101

metric                    PyRosetta   bypass  bypass value  threshold
dG                            197v       1v         -10.0  max 0
Binder_Energy_Score           202v       1v          -1.0  max 0
n_InterfaceHbonds              15v       1v             5  min 3
n_InterfaceUnsatHbonds          5v       1v             1  max 4

row exactly on every threshold      unmet: []
ShapeComplementarity 0.59           unmet: ['Average_ShapeComplementarity']
ShapeComplementarity absent         unmet: []

OK
```

## Citing this

Pacesa, M. *et al.* One-shot design of functional protein binders with BindCraft.
*Nature* (2025). Preprint: doi:10.1101/2024.09.30.615802. Code:
https://github.com/martinpacesa/BindCraft (MIT).

Ring, A. M. FreeBindCraft (2025). https://github.com/cytokineking/FreeBindCraft (MIT) —
the `--no-pyrosetta` build, its technical overview, and the PD-L1 comparison release used
above. Shape complementarity: `sc-rs`, https://github.com/cytokineking/sc-rs (MIT).

If you used the standard build, PyRosetta's licence requires you to cite Rosetta as well;
see `CITING_ROSETTA.md` in `RosettaCommons/rosetta`.

Underlying components: ColabDesign, https://github.com/sokrypton/ColabDesign, which
supplies the AlphaFold2 design interface and the hotspot grammar; ProteinMPNN
(Dauparas, J. *et al.*, *Science* **378**, 49–56, 2022); FASPR (Huang, X. *et al.*,
*Bioinformatics* **36**, 3758–3765, 2020); OpenMM (Eastman, P. *et al.*, *PLoS Comput
Biol* **13**, e1005659, 2017); FreeSASA (Mitternacht, S., *F1000Research* **5**, 189,
2016); and the shape complementarity statistic of Lawrence, M. C. and Colman, P. M.,
*J Mol Biol* **234**, 946–950 (1993).
