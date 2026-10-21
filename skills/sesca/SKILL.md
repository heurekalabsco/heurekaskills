---
name: sesca
description: Predict a protein's far-UV circular dichroism spectrum from a PDB structure with SESCA, or deconvolute a measured CD spectrum into helix, sheet and coil fractions — basis-set choice, mean residue ellipticity units, and the silent-failure traps.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [circular-dichroism, secondary-structure, protein-structure, protein-design, spectroscopy]
covers: [circular dichroism, CD spectrum, CD spectroscopy, far-UV CD, SRCD, synchrotron radiation circular dichroism, secondary structure estimation, secondary structure content, CD deconvolution, CD prediction, mean residue ellipticity, MRE, kMRE, delta epsilon, millidegrees, alpha helix, beta sheet, random coil, basis spectra, DISICL, DSSP, HBSS, model validation, folded check, designed protein, intrinsically disordered, Bayesian secondary structure, lysozyme, myoglobin]
papers: [doi:10.1021/acs.jctc.9b00203, doi:10.1007/s00249-020-01457-6, doi:10.1016/j.cpc.2021.108022]
datasets: ["https://www.mpinat.mpg.de/4787098/SESCA_v097.zip", "https://files.rcsb.org/download/1MBN.pdb", "https://files.rcsb.org/download/1TEN.pdb"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: SESCA 0.9.7 zip sha256 20bc2064 (files dated 2024-07-16 and 2024-08-14) / Python 3.12.8 with numpy 2.5.4 and scipy 1.18.1 for every block / Try it also cold on Python 3.9.6 with numpy 2.0.2 and scipy 1.13.1 / Try it also cold on Python 3.14.6 / mkdssp 4.6.1 from conda-forge / macOS arm64 / structures from RCSB PDB
  executed: 11
  unverified: 0
---

# SESCA — circular dichroism from structure, and structure from circular dichroism

Far-UV circular dichroism is the cheapest answer to "is this protein folded, and into
what?". A helical protein gives two negative bands near 208 and 222 nm and a strong
positive one near 192 nm; a β-rich protein gives a single, weaker negative band around
215–218 nm; an unfolded chain sits near zero above 210 nm and dips hard below 200 nm. For a
designed binder or a new construct, that check comes before any affinity number means
much.

SESCA works in both directions from one set of empirical **basis spectra** — the average
CD contribution of each secondary-structure class, fitted against a reference set of
proteins with known structures and measured spectra:

- **Structure to spectrum.** Classify every residue of a PDB model, weight the basis
  spectra by the class fractions, and sum. Compare to a measured spectrum to ask whether a
  model (a design, a predicted structure, an MD ensemble) is consistent with the sample.
- **Spectrum to structure.** Fit the basis-spectrum weights to a measured spectrum. The
  weights are the estimated secondary-structure fractions.

## Why SESCA and not a web server

Readers usually reach for a web tool first. As of 2026-09-30: CAPITO no longer resolves;
DichroWeb was unreachable on repeated attempts and requires registration, so it cannot be
scripted even when it is up; ChiraKit is restricted to academic use; BeStSel was live but
publishes no licence terms and no API. SESCA is a local command-line package under
**GPL-3.0** (the full licence text is `license.txt` in the zip), which permits commercial
use. It is the route this skill documents.

## What you need, before anything runs

Nothing to register for, buy or accept. CPU only; a prediction takes seconds.

- **Python 3** with **numpy** and **scipy** (scipy is needed by deconvolution and
  spectrum scaling). Every block below ran on Python 3.12; the Try it block also ran on
  3.9, and prediction on 3.14. The upstream README still describes 2.7 and 3.4, which is
  out of date rather than a requirement.
- **The SESCA zip** from the Max Planck Institute for Multidisciplinary Sciences in
  Göttingen, 4,974,241 bytes. It is not on PyPI or conda. There is no repository to pin
  to a commit, so pin **version 0.9.7 and the SHA-256** below. The download speed from that
  server varied from a few seconds to four minutes on the same day.
- **No external secondary-structure program for the default path.** The default basis
  set (`DS-dT`) uses DISICL, and the `HBSS-*` sets use HBSS; both are pure Python and ship
  in the zip. Only the `DSSP-*` basis sets need a DSSP binary. The zip bundles DSSP
  2.0.4 as static Linux x86/x86_64 and Windows executables, and `setup.py` wires SESCA to
  the Linux x86_64 one; that route was not exercised for this skill. On any other
  platform, see *DSSP basis sets off Linux x86_64* below.

## Install

```bash
curl -sSfL -o SESCA_v097.zip https://www.mpinat.mpg.de/4787098/SESCA_v097.zip
python3 -c "import hashlib,sys; h=hashlib.sha256(open('SESCA_v097.zip','rb').read()).hexdigest(); print(h); sys.exit(h!='20bc20647d9393c47269d149f3ba8e55a76e791e0a174e2191a73ded70ecb2f1')" \
  && unzip -q SESCA_v097.zip \
  && python3 -m venv sesca-venv \
  && "$PWD/sesca-venv/bin/python" -m pip install -q numpy scipy \
  && "$PWD/sesca-venv/bin/python" "$PWD/SESCA_v097/setup.py" @source "$PWD/SESCA_v097" @prefix "$PWD/sesca" > setup.log \
  && ls sesca/scripts/SESCA_main.py sesca/libs/Basis_sets.nfo
```

The setup step is not optional. Every module carries a hard-coded install path from the
author's machine, and `setup.py` copies the package to `@prefix` and rewrites those paths.
Give it **absolute** paths: a bare relative prefix is written into the scripts as-is, and
they then work only from the directory you installed from. SESCA's flags use `@`, not
`--`, throughout.

The steps are chained, so a checksum mismatch stops everything before the zip is
unpacked. Run the modules with the virtual environment's interpreter, by path — every
block below sets `PY="$PWD/sesca-venv/bin/python"` and runs from the install directory.
The scripts' own shebang is `#!/usr/bin/env python`, which does not exist on many current
systems, and a bare `python` in a fresh shell is not the one with numpy and scipy. Run the
Python blocks with the same interpreter.

## Structure to spectrum

SESCA writes its intermediate files into the current directory, so give each structure a
directory of its own.

```bash
S="$PWD/sesca"; PY="$PWD/sesca-venv/bin/python"
mkdir -p mb && curl -sSf -o mb/1MBN.pdb https://files.rcsb.org/download/1MBN.pdb
(cd mb && "$PY" "$S/scripts/SESCA_main.py" @pdb 1MBN.pdb @write CD_1MBN.out > main.log)
(cd mb && "$PY" "$S/scripts/SESCA_main.py" @pdb 1MBN.pdb @lib HBSS-3 @write CD_1MBN_hbss.out > hbss.log)
ls mb
```

`@lib` takes a basis-set **code** here (the list is in `sesca/libs/Basis_sets.nfo`); with
no `@lib` you get `DS-dT`. A multi-model PDB (an NMR ensemble, or frames from a trajectory
between `MODEL`/`ENDMDL` lines) is averaged over all models. Input must be PDB format;
SESCA does not read mmCIF.

The output file has a commented header carrying the class weights, then two columns:
wavelength in nm and predicted intensity in **kMRE**, thousands of degrees·cm²·dmol⁻¹ per
residue.

```python
def read_sesca(path):
    weights, spectrum = {}, {}
    for line in open(path):
        s = line.strip()
        if s.startswith("#"):
            key, sep, val = s.lstrip("#").partition(":")
            try:
                if sep:
                    weights[key.strip()] = float(val)
            except ValueError:
                pass
        elif s:
            wl, val = s.split()[:2]
            spectrum[float(wl)] = float(val)
    return weights, spectrum

for f in ["mb/CD_1MBN.out", "mb/CD_1MBN_hbss.out"]:
    w, sp = read_sesca(f)
    print(f, {k: v for k, v in w.items()})
    print("  grid %g-%g nm, %d points; 208 nm %.2f, 222 nm %.2f, 192 nm %.2f kMRE"
          % (min(sp), max(sp), len(sp), sp[208], sp[222], sp[192]))
```

The weights are the fraction of residues in each class of *that basis set*, so their names
change with `@lib` — `Alpha/Beta/Coil` for `DS-dT`, `Helix/Sheet/Coil` for `DSSP-T`, five
classes for `HBSS-3`. Parse by name, not by position. On myoglobin the default set reports
0.607 alpha while DSSP reports 0.785 helix: the classifiers draw the helix boundary in
different places, which is why each basis set was fitted to its own classifier and why
weights from two basis sets cannot be compared directly.

## Choosing a basis set

| code | classifier | needs | use it for |
|---|---|---|---|
| `DS-dT` | DISICL | nothing extra | the default; globular proteins |
| `DS5-4` | DISICL | nothing extra | models with a lot of loop and turn |
| `DS3-1` | DISICL (simplified classes) | nothing extra | a second opinion with split helix and strand classes |
| `HBSS-3` | HBSS | nothing extra | classes defined from backbone hydrogen bonds, with regular and irregular helix split |
| `DSSP-T` | DSSP | a DSSP binary | when you want DSSP's familiar helix/sheet definitions; the DSSP set to use with DSSP 4 |
| `DSSP-1` | DSSP | DSSP 2.0.4 | only with the bundled DSSP 2.0.4 — it counts π-helix as β, see below |
| `DS-B4R1` | DISICL | nothing extra | experimental; fitted with disordered proteins added, grid starts at 178 nm |
| `Seq2-2` | sequence only | nothing extra | no structure at all; markedly less accurate |

Sets whose code ends in `SC` plus a digit (`DS-dTSC3`, `DSSP-1SC3`, `HBSS-3SC1` and others)
add amino-acid side-chain contributions on top of the backbone. In prediction SESCA works
out the composition from the PDB itself. This skill did not exercise side-chain sets in
deconvolution, where the side-chain term has to be supplied separately.

For **deconvolution**, the classifier does not run at all — only the basis spectra are
used — so `DSSP-T` needs no DSSP binary in that direction.

## Checking a model against a measured spectrum

Give `SESCA_main.py` a reference spectrum with `@ref`. The zip ships a measured spectrum of
hen egg-white lysozyme alongside its crystal structure:

```bash
S="$PWD/sesca"; PY="$PWD/sesca-venv/bin/python"
mkdir -p val && cp "$S/examples/0-Basics/193l.pdb" "$S/examples/0-Basics/CD_lysm.dat" val/
(cd val && "$PY" "$S/scripts/SESCA_main.py" @pdb 193l.pdb @ref CD_lysm.dat @write val.out > v.log)
(cd val && "$PY" "$S/scripts/SESCA_main.py" @pdb 193l.pdb @ref CD_lysm.dat @refscale auto @write val_scaled.out > v2.log)
grep -E "RMSD|^#  +[0-9]+ |dSS|Scaling factor" val/val.out val/val_scaled.out
```

With a reference, the spectrum block gains `Iref`, `dev` and `diff` columns, and the file
ends with the RMSD between the two spectra (kMRE) and **dSS-est** — the estimated error in
the model's secondary-structure composition, read off a calibration curve stored in the
basis set. Observed here: RMSD 1.17 kMRE, dSS 6.3 ± 3.8 %; with `@refscale auto`, the
reference is rescaled by 1.069, RMSD drops to 0.98 and dSS is 8.2 ± 5.2 %.

`@refscale auto` exists because the commonest error in a measured spectrum is the
**protein concentration**, which scales the whole curve. A fitted factor far from 1 says
the concentration (or the residue count used to normalise) is suspect, not the structure.
A small dSS means the model's *composition* matches; many different folds share a
composition, so it is not proof the fold is right.

## Spectrum to structure

```bash
S="$PWD/sesca"; PY="$PWD/sesca-venv/bin/python"
"$PY" "$S/scripts/SESCA_deconv.py" @spect "$S/examples/0-Basics/CD_lysm.dat" \
  @lib "$S/libs/Map_DS-dT.dat" @write deconv_full.out > d1.log
"$PY" "$S/scripts/SESCA_deconv.py" @spect "$S/examples/0-Basics/CD_lysm.dat" \
  @lib "$S/libs/Map_DS-dT.dat" @range 190,250 @write deconv_190.out > d2.log
grep -E "^#\s+\S+\s+:|Scaling factor|^#\s+[0-9]+ " deconv_full.out deconv_190.out
```

**`@lib` takes a file path here, not a code.** `SESCA_deconv.py @lib DS-dT` stops with a
`FileNotFoundError`. The file for each code is the third column of
`sesca/libs/Basis_sets.nfo`.

The output lists one weight per basis spectrum, the fit RMSD, and the **scaling factor
from weight normalisation**. By default the fit lets the weights sum to anything and then
divides them back to 1; that factor is the sum before normalising. Like `@refscale` above,
a value far from 1 points at a concentration error. `@mult1 1000` forces the weights to sum
to 1 without rescaling, for when you trust the concentration and want the fit to say so.

Measured lysozyme deconvoluted with `DS-dT` over the full 175–269 nm gives alpha 0.342,
beta 0.062, coil 0.596 against 0.349 / 0.032 / 0.621 from the crystal structure. Cut to
190–250 nm, alpha moves to 0.423 and beta to 0.000. Across five basis sets, cutting to
200–250 nm moved the estimates further still — `DS3-1` beta went from 0.08 to 0.31, and
`DS5-4` needed a scaling factor of 0.45. **The short wavelengths carry much of what
separates β from coil.** Use every wavelength the instrument measured reliably, report the
range with the fractions, and on a bench instrument that stops at 195–200 nm treat the β
estimate as soft whichever basis set you use.

`SESCA_bayes.py` gives the same fractions with uncertainties, by sampling compositions and
scaling factors rather than taking one best fit. It took about 75 s here against under a
second for `SESCA_deconv.py`, and samples randomly, so the last digit moves run to run:

```bash
S="$PWD/sesca"; PY="$PWD/sesca-venv/bin/python"
"$PY" "$S/scripts/SESCA_bayes.py" @spect "$S/examples/0-Basics/CD_lysm.dat" \
  @lib "$S/libs/Map_DS-dT.dat" @write bayes.out > b.log
grep -A4 "most likely SS" bayes.out; grep "Avg. Scaling" bayes.out
```

Observed: alpha 0.38 ± 0.05, beta 0.05 ± 0.06, coil 0.57 ± 0.06, scaling factor
1.17 ± 0.12.

## Units and wavelength grid

Every basis set, and every SESCA output, is in **kMRE** — mean residue ellipticity in
units of 1000 deg·cm²·dmol⁻¹. Raw instrument files are almost always millidegrees, and a
millidegree spectrum fed in directly is off by orders of magnitude; deconvolution will
"fit" it through the scaling factor and return nonsense fractions.

The conversion is `MRE = mdeg / (10 · c · l · n)` with `c` the molar **protein**
concentration, `l` the path length in cm and `n` the number of residues; divide by 1000
for kMRE. `SESCA_process.py` does it:

```bash
S="$PWD/sesca"; PY="$PWD/sesca-venv/bin/python"
# A millidegree spectrum: lysozyme (129 residues) at 10 uM in a 1 mm cell.
awk '{printf "%.1f %.4f\n", $1, $2*1000*10*1e-5*0.1*129}' "$S/examples/0-Basics/CD_lysm.dat" > lys_mdeg.dat
"$PY" "$S/scripts/SESCA_process.py" @spect lys_mdeg.dat @Uinp mdeg @Uout kMRE \
  @conc 1e-5 @path 0.1 @res 129 @write lys_kMRE.dat > p.log
"$PY" -c "
a={float(l.split()[0]):float(l.split()[1]) for l in open('$S/examples/0-Basics/CD_lysm.dat')}
b={float(l.split()[0]):float(l.split()[1]) for l in open('lys_kMRE.dat') if l.strip() and not l.startswith('#')}
print(len(b), 'points, max round-trip error %.4f kMRE' % max(abs(a[k]-b[k]) for k in b))"
```

The flag is `@spect`. The worked example inside the zip (exercise 7) uses `@inp`, which
this version rejects. Other units it converts: `MRE`, `dAbs`, `dEps` (Δε; kMRE = 3.298 × Δε).
`@Mconc` with `@mr` takes a mass concentration instead.

**Wavelengths must sit on whole nanometres.** The basis spectra are tabulated at 1 nm from
175 to 269 nm (178 nm for `DS-B4R1`), and SESCA matches wavelengths exactly. Half-nm steps
are fine — the integer points are used — but a grid offset from the integers matches
nothing, and `SESCA_deconv.py` dies with `IndexError` from inside its fitting setup.
`SESCA_process.py @wl` filters rather than interpolates, so resample yourself:

```python
import numpy as np

d = np.loadtxt("lys_kMRE.dat", comments="#")[:, :2]
d[:, 0] += 0.3                       # an instrument grid that is not on whole nm
d = d[np.argsort(d[:, 0])]           # np.interp needs ascending x
grid = np.arange(np.ceil(d[0, 0]), np.floor(d[-1, 0]) + 1)
np.savetxt("lys_on_grid.dat", np.c_[grid, np.interp(grid, d[:, 0], d[:, 1])], fmt="%.1f %.4f")
print(len(grid), "points,", grid[0], "-", grid[-1], "nm")
```

## DSSP basis sets off Linux x86_64

`setup.py` points SESCA at the bundled DSSP 2.0.4 Linux x86_64 binary. On macOS, Linux ARM
or anywhere else it cannot execute, and **SESCA still exits 0, prints `SESCA finished
sucessfully!`, and writes a spectrum of all zeros with every weight 0.000.** Check the
weights before using any `DSSP-*` result.

**Use DSSP 4 with `DSSP-T` or `DSSP-TSC1` only.** The basis sets differ in which DSSP codes
they pool into each class, and the pooling is written as a combination matrix at the top
of each map file in `sesca/libs`. `DSSP-T` and `DSSP-TSC1` put 3₁₀-, α- and π-helix (DSSP
`G`, `H`, `I`) all into the helix class. `DSSP-1` and `DSSP-1SC3` put **π-helix into the
β class**, alongside strand. These sets were fitted to DSSP 2.0.4 output. DSSP 2.1.0
(2012) changed helix assignment so that a π-helix takes precedence over an α-helix (DSSP
changelog, citing Cooley et al. 2010), and DSSP 4.6.1
assigns 3.3 % of myoglobin's residues to `I`, as short π-helical stretches inside
α-helices, so through `DSSP-1` all-α myoglobin comes back with beta 0.033 and helix 0.752,
against sheet 0.000 and helix 0.785 under `DSSP-T`, with exit 0 and no warning. `DSSP-F`, an uncalibrated initial set,
keeps every DSSP code as its own class; it was not tested here.

DSSP 4 needs two adjustments SESCA does not make for itself. It refuses SESCA's re-wrapped
PDB frames (`Expected record ENDMDL but found CONECT`), and its classic-format output
carries non-ASCII bytes (UTF-8 non-breaking spaces in the `REFERENCE` line) that SESCA's parser cannot
decode. **The wrapper below is not part of SESCA or DSSP.** It was written for this skill
and tested only with mkdssp 4.6.1 from conda-forge. It keeps only `ATOM` and `TER`
records, so residues stored as `HETATM`, such as selenomethionine (`MSE`), are dropped
from the assignment. The conda environment is large — about 856 MB measured, almost all of it the
chemical component dictionary DSSP 4 ships with — and it carries the dictionaries DSSP
reads at startup, which `LIBCIFPP_DATA_DIR` points at:

```bash
conda create -y -q -p "$PWD/dssp-env" -c conda-forge --override-channels dssp=4.6.1 > conda.log
cat > dssp4 <<EOF
#!/bin/sh
grep -E '^(ATOM|TER)' "\$1" > "\$1.atoms.pdb"
LIBCIFPP_DATA_DIR="$PWD/dssp-env/share/libcifpp" "$PWD/dssp-env/bin/mkdssp" --output-format dssp "\$1.atoms.pdb" "\$2.raw" || exit 1
LC_ALL=C tr -cd '\11\12\40-\176' < "\$2.raw" > "\$2"
EOF
chmod +x dssp4
du -sh dssp-env
S="$PWD/sesca"; PY="$PWD/sesca-venv/bin/python"; DSSP="$PWD/dssp4"
(cd mb && "$PY" "$S/scripts/SESCA_main.py" @pdb 1MBN.pdb @lib DSSP-T @prep @dssp "$DSSP" @write CD_1MBN_dssp.out > dssp.log)
grep -A3 "Weighting" mb/CD_1MBN_dssp.out
# The counter-example: the same assignment through DSSP-1 reports beta in an all-alpha protein.
(cd mb && "$PY" "$S/scripts/SESCA_main.py" @pdb 1MBN.pdb @lib DSSP-1 @prep @dssp "$DSSP" @write CD_1MBN_dssp1.out > dssp1.log)
grep -A4 "Weighting" mb/CD_1MBN_dssp1.out; grep "5-Helix" mb/Dssp_1MBN.out
```

Pass the program as `@prep @dssp <path>`, **unquoted**. `@prep "@dssp <path>"` — the form
the help text suggests — is read as one unknown flag and DSSP is never called. Observed
under `DSSP-T`: helix 0.785, sheet 0.000, coil 0.216. DSSP prints one
`parse error at line 1: This file does not seem to be an mmCIF file` per frame as it tries
its mmCIF reader before falling back to PDB; it is harmless. Under
`DSSP-1`: helix 0.752, beta 0.033, bridge 0.000, other 0.216.

## Exit codes do not mean success

```bash
S="$PWD/sesca"; PY="$PWD/sesca-venv/bin/python"
mkdir -p err && cd err
"$PY" "$S/scripts/SESCA_main.py" @pdb no_such.pdb > a.log; echo "missing PDB        -> rc=$? ($(tail -1 a.log))"
"$PY" "$S/scripts/SESCA_main.py" @pdb ../mb/1MBN.pdb @lib NOPE > b.log; echo "unknown basis set  -> rc=$?"
"$PY" "$S/scripts/SESCA_deconv.py" @spect no_such.dat @lib "$S/libs/Map_DS-dT.dat" > c.log; echo "missing spectrum   -> rc=$?"
cd ..
```

A missing structure exits **0** and prints `Script failed` on its last line; the DSSP
failure above also exits 0. An unknown basis-set code exits 4, a missing spectrum 1. So
gate on the output, not the status: the output file must exist **and** its weights must
not all be zero.

## Try it

**Data.** Three public files, no account or key. The SESCA 0.9.7 zip (GPL-3.0), which also
carries a measured lysozyme spectrum, `examples/0-Basics/CD_lysm.dat`, from 175 to 269 nm in
kMRE. Two RCSB PDB entries, distributed under CC0: **1MBN**, sperm whale myoglobin, an
all-α protein, and **1TEN**, a fibronectin type III domain of tenascin, an all-β
domain. All three confirmed reachable 2026-10-21.

**Run.** In any directory, with Python 3 and network access. The block works in a fresh
temporary directory, downloads and unpacks SESCA itself, and routes through the exit-code
trap:

```bash
set -eu
WORK=$(mktemp -d) && cd "$WORK" && echo "working in $WORK"

curl -sSfL -o SESCA_v097.zip https://www.mpinat.mpg.de/4787098/SESCA_v097.zip
python3 -c "import hashlib,sys; h=hashlib.sha256(open('SESCA_v097.zip','rb').read()).hexdigest(); print('sha256', h); sys.exit(h!='20bc20647d9393c47269d149f3ba8e55a76e791e0a174e2191a73ded70ecb2f1')"
unzip -q SESCA_v097.zip
python3 -m venv venv && . venv/bin/activate && pip install -q numpy scipy
python "$PWD/SESCA_v097/setup.py" @source "$PWD/SESCA_v097" @prefix "$PWD/sesca" > setup.log
SESCA="$PWD/sesca/scripts"

for p in 1MBN 1TEN; do
  mkdir "$p" && curl -sSf -o "$p/$p.pdb" "https://files.rcsb.org/download/$p.pdb"
  (cd "$p" && python "$SESCA/SESCA_main.py" @pdb "$p.pdb" > main.log)
done

python "$SESCA/SESCA_deconv.py" @spect sesca/examples/0-Basics/CD_lysm.dat \
  @lib sesca/libs/Map_DS-dT.dat @write deconv.out > deconv.log

mkdir trap && (cd trap && python "$SESCA/SESCA_main.py" @pdb absent.pdb > main.log; echo "exit code with a missing PDB: $?")
test -e trap/CD_comp.out && echo "trap wrote output" || echo "trap wrote no CD_comp.out"

python - <<'EOF'
def read(path):
    weights, spec = {}, {}
    for line in open(path):
        s = line.strip()
        if s.startswith("#"):
            key, sep, val = s.lstrip("#").partition(":")
            try:
                if sep:
                    weights[key.strip()] = float(val)
            except ValueError:
                pass
        elif s:
            wl, val = s.split()[:2]
            spec[float(wl)] = float(val)
    return weights, spec

def local_min(spec, lo, hi):
    wl = min((w for w in spec if lo <= w <= hi), key=spec.get)
    return wl, spec[wl]

mb_w, mb = read("1MBN/CD_comp.out")
fn_w, fn = read("1TEN/CD_comp.out")
dc_w, _ = read("deconv.out")
print("1MBN weights:", mb_w)
print("1TEN weights:", fn_w)
print("grid: %g-%g nm, %d points" % (min(mb), max(mb), len(mb)))
assert min(mb) == 175 and max(mb) == 269 and len(mb) == 95
assert abs(sum(mb_w.values()) - 1) < 0.01 and abs(sum(fn_w.values()) - 1) < 0.01

a = local_min(mb, 204, 212); b = local_min(mb, 218, 226)
mid = max(mb[w] for w in mb if a[0] < w < b[0])
peak = max((w for w in mb if 185 <= w <= 200), key=mb.get)
print("1MBN minima: %g nm %.2f, %g nm %.2f | highest point between: %.2f | max %g nm %.2f"
      % (a + b + (mid, peak, mb[peak])))
assert mb_w["Alpha"] > max(mb_w["Beta"], 0.5)
assert mid > max(a[1], b[1]) and mb[peak] > 0 and a[1] < -10 and b[1] < -10

c = local_min(fn, 200, 230)
print("1TEN minimum: %g nm %.2f | at 222 nm: 1MBN %.2f vs 1TEN %.2f" % (c + (mb[222], fn[222])))
assert fn_w["Beta"] > fn_w["Alpha"] and 212 <= c[0] <= 220
assert abs(mb[222]) > 3 * abs(fn[222])

frac = {k: dc_w[k] for k in ("Alpha", "Beta", "Coil")}
print("lysozyme deconvolution:", frac, "| scaling factor", dc_w["Scaling factor from weight normalization"])
assert abs(sum(frac.values()) - 1) < 0.01
assert abs(frac["Alpha"] - 0.349) < 0.10 and frac["Coil"] > frac["Beta"]
print("all invariants hold")
EOF
```

**Expect**

Invariants — a failure here means this skill is wrong:

- The checksum line prints the pinned SHA-256 and the block carries on.
- `exit code with a missing PDB: 0` and `trap wrote no CD_comp.out`. If the exit code
  ever becomes non-zero, upstream has fixed the trap and the exit-code section can go.
- Both predictions are on the 175–269 nm grid at 1 nm, 95 points, and each set of weights
  sums to 1 within rounding.
- Myoglobin: alpha is the largest class and above 0.5; the spectrum has a minimum in
  204–212 nm and another in 218–226 nm, with a higher point between them, both below
  −10 kMRE, and a positive maximum in 185–200 nm — the α-helix signature.
- The FN3 domain: beta outweighs alpha; its single minimum sits in 212–220 nm; at 222 nm
  myoglobin's signal is more than three times stronger.
- Deconvoluting the measured lysozyme spectrum puts alpha within 0.10 of the 0.349 that
  DISICL assigns to the crystal structure, with more coil than beta.
- The script ends with `all invariants hold`.

Observed on 2026-10-21 with SESCA 0.9.7 (sha256 above), Python 3.12.8, numpy 2.5.4,
scipy 1.18.1, macOS arm64 — a change here is drift to investigate, not a failure:

- 1MBN weights alpha 0.607, beta 0.000, coil 0.395; minima −22.57 kMRE at 209 nm and
  −22.39 at 222 nm, −20.98 between them, maximum +40.65 at 192 nm.
- 1TEN weights alpha 0.034, beta 0.367, coil 0.594; minimum −5.86 at 216 nm; −3.89 at
  222 nm against myoglobin's −22.39.
- Lysozyme deconvolution alpha 0.3421, beta 0.0621–0.0622, coil 0.5958, scaling factor
  1.058; the fit starts from random weights, and repeat runs differed by at most 0.0001.
  The same values came out on Python 3.9.6 with numpy 2.0.2 and scipy 1.13.1.
- `SESCA_deconv.py` prints a scipy `OptimizeWarning: Unknown solver options: ftol`; it is
  harmless.
- The zip download took 4 minutes on one run and seconds on another; everything else
  finishes in under a minute.

## Sources

- SESCA home page and download: https://www.mpinat.mpg.de/sesca
- Nagy G, Igaev M, Hoffmann SV, Jones NC, Grubmüller H. *SESCA: Predicting circular
  dichroism spectra from protein molecular structures.* J Chem Theory Comput (2019).
  doi:10.1021/acs.jctc.9b00203
- Nagy G, Grubmüller H. *How accurate is circular dichroism-based model validation?*
  Eur Biophys J (2020). doi:10.1007/s00249-020-01457-6
- Nagy G, Grubmüller H. *Implementation of a Bayesian secondary structure estimation
  method for the SESCA circular dichroism analysis package.* Comput Phys Commun (2021).
  doi:10.1016/j.cpc.2021.108022
- DSSP 4: https://github.com/PDB-REDO/dssp
- For thermal melts followed by CD at one or several wavelengths, see the `moltenprot`
  skill.
