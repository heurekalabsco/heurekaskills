# Parameters, scoring functions, and screening a compound set

Verified against AutoDock Vina 1.2.7.

## Runtime parameters

| flag | default | what moving it does |
|---|---|---|
| `--exhaustiveness` | 8 | search thoroughness; cost rises roughly linearly. 8 for a quick look, 32 for a result you will act on, higher for large or floppy ligands |
| `--seed` | see below | **always set it** |
| `--num_modes` | 9 | upper bound on poses reported |
| `--energy_range` | 3 | poses worse than best + this are dropped **from the file** |
| `--min_rmsd` | 1 | minimum RMSD between reported poses; raise it if output poses are near-duplicates |
| `--cpu` | all | threads |
| `--spacing` | 0.375 | grid spacing in Å; rarely worth changing |
| `--max_evals` | 0 (auto) | hard cap on evaluations per MC run |
| `--scoring` | vina | `vina`, `vinardo`, or `ad4` |

### `--seed` does not default to 0, despite what `--help` says

`--help` prints `--seed arg (=0)`, which reads like a fixed default. It is a
sentinel meaning *draw a random seed*. Verified: two runs with `--seed 0`
reported seeds −932932749 and 1543803442 and produced different output; two runs
with `--seed 42` produced byte-identical files.

So: pass a real seed, record it, and never assume a run is reproducible because
you left the seed alone.

### `--exhaustiveness` and when to stop raising it

Exhaustiveness controls how many independent Monte Carlo runs the search does.
There is no value that is "enough" in general. The practical test is stability:
run the same dock at several seeds and see whether the top pose moves.

```bash
for s in 1 2 3 4 5; do
  ./vina --receptor rec.pdbqt --ligand lig.pdbqt --config rec.box.txt \
         --exhaustiveness 32 --seed $s --out pose_$s.pdbqt \
    | awk '/^   1 /{print "seed '"$s"' ->", $2}'
done
```

If the top affinity and pose are consistent across seeds, the search has
converged for that system. If they scatter, raise exhaustiveness or reconsider
the box — scatter usually means the search space is too large, not that the
sampling is too weak.

## Scoring functions

Three are available, and they are on **different scales**. The same crystal pose
of imatinib in ABL kinase, scored in place:

| `--scoring` | score (kcal/mol) |
|---|---|
| `vina` | **−11.91** |
| `vinardo` | **−8.68** |

A 3.2 kcal/mol difference on an identical pose. Never compare a Vinardo score
against a Vina score, and state which you used.

- **`vina`** — the default. General purpose; use unless you have a reason not to.
- **`vinardo`** — a reparameterised function that some benchmarks find better at
  pose selection. Worth trying as a cross-check.
- **`ad4`** — the AutoDock4 function. Needs precomputed affinity maps supplied
  with `--maps`, not just a box. Use for continuity with AD4-based protocols.

## Scoring and minimisation modes

| mode | what it does | use for |
|---|---|---|
| *(default)* | full search in the box | docking |
| `--score_only` | score the input pose as given, no search | scoring a crystal pose or a pose from elsewhere |
| `--local_only` | local minimisation from the input pose | cleaning up a pose without re-searching |
| `--randomize_only` | randomise the input, no scoring | generating decoy starting points |

`--score_only` and `--local_only` accept `--autobox`, which sizes the search
space to the input ligand — convenient, and only valid for these modes.

Scoring a crystal pose in place is the single most informative sanity check you
can run. On 1IEP it returns −11.91, while docking finds −13.06 — the function
prefers a pose that is not the experimental one. That gap is the scoring
function's error bar, measured on your own system, and it is usually larger than
the score differences people use to rank compounds.

## The Python API

> **Not executed here.** Unlike everything else in this skill, the snippet below
> was not run — the `vina` PyPI package could not be built in the environment
> used to write this file (details below). It reflects the upstream API rather
> than a verified run. Treat it as a starting point and check the output of the
> first call, rather than assuming it works.

The package builds from source and needs Boost headers. On Apple Silicon with
Homebrew this fails even when Boost is installed, because its build script
searches only the conda prefix, `/usr/local/include` and `/usr/include` — it
ignores `BOOST_ROOT`, `CPPFLAGS`, and Homebrew's `/opt/homebrew` prefix:

```
ValueError: Boost library location was not found!
Directories searched: conda env, /usr/local/include and /usr/include.
```

A conda environment with `boost-cpp` installed is the path of least resistance
if you need the bindings. **For ordinary docking you do not** — the binary
covers it. Where the API earns its place is scripted scoring loops that would
otherwise pay process-startup and map-computation cost per ligand.

```python
from vina import Vina

v = Vina(sf_name='vina', seed=42)
v.set_receptor('rec.pdbqt')
v.compute_vina_maps(center=[15.107, 53.977, 17.143], box_size=[20, 29, 25])

v.set_ligand_from_file('lig.pdbqt')
v.dock(exhaustiveness=32, n_poses=9)
v.write_poses('docked.pdbqt', n_poses=9, overwrite=True)

print(v.energies())          # per-pose energy terms
print(v.score())             # score the current pose without searching
```

`compute_vina_maps` is the expensive step. Computing maps once and looping
`set_ligand_from_file` / `dock` over many ligands is the reason to use the API
at all.

## Screening a compound set

Vina has a batch mode that reuses the maps across ligands:

```bash
mk_prepare_ligand.py -i library.sdf --multimol_outdir ligands/

./vina --receptor rec.pdbqt --batch ligands/*.pdbqt \
       --config rec.box.txt --dir results/ \
       --exhaustiveness 32 --seed 42
```

Each input produces `<name>_out.pdbqt` in `--dir`. Collect them with the score
attached to the identity:

```python
import glob, os, csv

rows = []
for f in sorted(glob.glob('results/*_out.pdbqt')):
    best = None
    for line in open(f):
        if line.startswith('REMARK VINA RESULT'):
            best = float(line.split()[3])
            break                     # first is the best pose
    rows.append({'ligand': os.path.basename(f).replace('_out.pdbqt', ''),
                 'affinity': best})

rows.sort(key=lambda r: (r['affinity'] is None, r['affinity']))
with open('screen_results.csv', 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=['ligand', 'affinity'])
    w.writeheader()
    w.writerows(rows)
```

### Sanity checks that must run on every screen

A screen is thousands of results nobody will look at individually, so the checks
have to be automatic.

```python
bad = [r for r in rows if r['affinity'] is None or r['affinity'] > 0]
if bad:
    raise SystemExit(f"{len(bad)} ligands scored positive or failed — "
                     "check the box and the failing inputs before ranking")
```

**A positive affinity is a failure, not a weak binder.** An undersized box
returns values like +38.67 with exit status 0 and no warning. In a batch run
nothing draws your attention to it, so assert on it.

Also check that every input produced an output — silent per-ligand failures
leave gaps in the results directory, and a screen ranked on 900 of 1000
compounds looks exactly like a screen ranked on 1000.

```python
n_in  = len(glob.glob('ligands/*.pdbqt'))
n_out = len(glob.glob('results/*_out.pdbqt'))
assert n_in == n_out, f"{n_in - n_out} ligands produced no output"
```

### Ranking honestly

Raw score ranking is biased toward large molecules — more atoms make more
contacts and score better nearly regardless of fit. Report ligand efficiency
alongside:

```python
from rdkit import Chem

heavy = {m.GetProp('_Name'): m.GetNumHeavyAtoms()
         for m in Chem.SDMolSupplier('library.sdf') if m}

for r in rows:
    n = heavy.get(r['ligand'])
    r['ligand_efficiency'] = r['affinity'] / n if n else None
```

The effect is not subtle. On a three-compound run against ABL kinase, raw score
ranks imatinib far ahead — but it is also three times the size:

| ligand | affinity | heavy atoms | efficiency |
|---|---|---|---|
| imatinib | −12.92 | 37 | −0.35 |
| aspirin | −7.18 | 13 | −0.55 |
| caffeine | −5.92 | 14 | −0.42 |

By raw score imatinib wins by 5.7 kcal/mol; by efficiency it ranks last. Neither
column is "the" answer — imatinib *is* the true ligand here — but a screen ranked
on raw score alone is substantially ranking on molecular weight.

And keep the size range narrow when comparing, or the ranking mostly recovers
molecular weight.

A screen's output is a **prioritised list for experimental testing**, not a set
of predicted affinities. Differences under ~1 kcal/mol do not order compounds
reliably. State the enrichment you expect: docking typically concentrates actives
in the top few percent, which is useful, and is not the same as being right about
any individual compound.

### Controls worth the compute

- **Redock a known ligand** into the same prepared receptor and check RMSD. If
  that fails, the screen is meaningless.
- **Include known actives** in the set if any exist, and check they rank well.
  This is the only direct evidence your setup can find what you are looking for.
- **Include decoys** — property-matched inactives — and check they do not.
  Without them a screen that ranks everything well looks like a success.
