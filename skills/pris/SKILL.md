---
name: pris
description: Score inorganic crystal structures for chemical plausibility and synthesizability with PRIS — eight one-line laws plus the PSS synthesis score. Triage candidate structures before DFT, and see which physical mechanism a rejected one broke.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [crystal-structure, materials, plausibility, synthesizability, screening]
allowed-tools: Read, Write, Edit, Bash
datasets: []
verified:
  date: 2026-09-06
  against: PRIS at commit 34e6c86 (the repository is untagged) / pymatgen 2026.5.4 / spglib 2.7.0 / numpy 2.4.6 / pandas 3.0.5 / scipy 1.17.1 / Python 3.11.15
  executed: 6
  unverified: 0
---

# PRIS: plausibility screening for inorganic crystal structures

PRIS is a set of eight one-line laws that judge whether an inorganic crystal
structure is chemically plausible, computed from nothing but a structure file and
a table of ionic radii. A derived continuous score, **PSS**, ranks structures by
how much they resemble compounds that have actually been synthesized.

The reason to reach for it is triage. Generative models for crystals emit far more
candidates than anyone can relax with DFT, and the filter usually applied — reject
anything with two atoms closer than some cutoff — is a single blunt test of one
mechanism. PRIS spreads its eight laws across several independent physical
mechanisms and, when a structure fails, names the one it broke. That last part is
what makes it useful in a loop rather than as a gate you tune once.

The mechanism labels the analyser actually prints, which are the strings you would
parse, are `short-range repulsion` (Law 1), `ionic contact` (Law 2), `packing`
(Law 3), `electrostatic balance` (Laws 4 to 6), `crystallographic site complexity`
(Law 7) and `bond-valence conservation` (Law 8). Six distinct strings, though the
write-up describes five mechanisms — it counts ionic contact and packing as one.
Key on the strings, not the count.

**It is a screen, not a verdict on stability.** It does not compute energy, does
not relax anything, and does not replace a hull calculation. It answers whether a
structure is chemically coherent — a cheaper question than whether it is
thermodynamically stable, and a different one.

## What you need before you start

- **Python 3.11 or newer.** Current pymatgen declares `requires-python >=3.11`.
  Both pymatgen and spglib ship binary wheels for common platforms, so in
  practice `pip` is enough and no compiler is needed.
- **A git clone.** PRIS is distributed only as a source repository. There is no
  package to install, and **`pip install pris` fetches an unrelated project** — a
  pattern-recognition library that has nothing to do with crystal structures.
  Clone from `https://github.com/AI4QC/PRIS` and run the code in place.
- **No account, no key, no network once installed.** The thresholds and the PSS
  weights are committed to the repository, so the analyser is entirely offline
  after the clone.
- **No GPU, and no meaningful compute.** A single structure takes two or three
  seconds end to end, most of which is interpreter startup and imports — so
  score a directory in one invocation rather than one process per file.

Two parts of the project are *not* reachable this way, and it is worth knowing
which before you plan around them. The scripts that reproduce the paper's
rule-set comparison and ranking benchmarks (`src/validity_rulesets.py`,
`src/rank_rulesets.py`) read a derived feature store of several gigabytes of
parquet that is not redistributed; you can run the analyser without it, but not
those. And the underlying structure collections differ in what they permit — COD
is CC0, ELEMENTA is non-commercial, and ICSD is not redistributable at all — so a
benchmark you assemble yourself inherits whichever terms you drew it from.

### One licence detail that decides which laws you can use commercially

The PRIS code and manuscript text are MIT. The bond-valence parameter table it
ships as `data/bvparm2020.cif` is **not** — it is I. David Brown's accumulated
table (McMaster University), and the notice in its header grants use and
distribution "without fee for non-profit purposes", directing anyone else to
consult the copyright owner. That restricts *use*, not merely redistribution, so
it lands differently on a commercial reader than on an academic one.

It matters because Law 8 is the bond-valence law, and the table is what evaluates
it. Which routes stay open:

- **Non-profit use** — everything, including Law 8, Set 4 and PSS.
- **Otherwise** — Sets 1 to 3 are unaffected by the table, and
  `src/apply_rules.py` is the entry point that covers exactly that range. Either
  obtain terms from the copyright owner for the table, or screen on Sets 1 to 3
  and treat Set 4 and PSS as unavailable rather than as passes.

  **Choosing that entry point is not enough on its own.** A clone brings the
  table with it, and `elec_feat.bv_table()` opens it whenever it is present —
  `apply_rules.py` reaches that loader through `elec_feats` like every other
  path. To stay off the restricted route, delete `data/bvparm2020.cif` after
  cloning, or point `NEWPAULING_BVPARM` at a table you are licensed for. The
  loader catches the missing file and returns an empty table, so Sets 1 to 3
  still produce real verdicts — that is the behaviour to rely on, not the choice
  of script.

**Know what the unrestricted route does not catch.** Law 8 is the bond-valence
law, so it is the one that fails on the compressed structure in "What a distance
cutoff misses" below — the demonstration this page opens with. Screening on
Sets 1 to 3 alone returns *plausible* for that structure. That route is a
coarser filter than the full set, not the same filter minus a column, and on the
compression case specifically it behaves like the distance cutoff the opening
argument is against.

**spglib is required either way.** Both entry points import it through
`pymatgen`'s structure reader, and pymatgen declares it only under an extra, so
it can be absent. Without it every structure is skipped with
`No module named 'spglib'` and the run still exits 0 — the install line below
includes it for that reason. It is BSD-3-Clause and unrestricted; only the
bond-valence table carries the non-commercial terms.

Verify this against the file header yourself before relying on either reading;
the terms are stated there in full, and this is a summary of them, not advice.

## Install

The repository is untagged, so pin the commit rather than a release. Installing
`requirements.txt` wholesale pulls in a symbolic-regression stack (`pysr`, which
wants Julia, and `pystreed`) that the *analyser* never imports. For screening
structures, this smaller set is sufficient:

```bash
git clone https://github.com/AI4QC/PRIS.git
git -C PRIS checkout 34e6c86c083759dc1ee594ae22238ea9b5ebd8f4

python3 -m venv venv
./venv/bin/pip install numpy pandas pymatgen spglib scipy
```

Install the full `requirements.txt` only if you intend to re-run the law search
itself, and note that those fitting scripts deliberately refuse to re-execute
their sealed evaluations.

## Judge one structure

The analyser takes any structure file pymatgen can read — CIF, POSCAR, and the
rest. Run it as a module with the source directory on `PYTHONPATH`, which keeps
its internal imports and its frozen-artefact lookups working from any directory:

```bash
PYTHONPATH=PRIS/src ./venv/bin/python -m pris_analyze *.cif           # full report per file
PYTHONPATH=PRIS/src ./venv/bin/python -m pris_analyze --quiet *.cif   # one verdict line each
PYTHONPATH=PRIS/src ./venv/bin/python -m pris_analyze --json  *.cif   # machine-readable
```

The full report prints one row per law — the measured quantity, the threshold it is compared
against, the verdict, which of the nested sets the law belongs to, and the
mechanism it tests — then the verdict for each set and the PSS score.

Read the law rows before the final verdict. The rows are the point; the verdict is
a summary of them.

Three states appear in the verdict column, and the third is the one that misleads:

- **ok** — the law is satisfied.
- **FAIL** — the law is violated, and its mechanism is named.
- **--** — *not triggered*. Three of the eight laws are conditional, and a
  conditional law whose trigger is not met is counted as satisfied. A `--` is not
  a pass on the merits and not a failure; it means the law had nothing to say
  about this structure. Rocksalt MgO shows this on Law 3, whose clause only
  engages for structures with low mean anion coordination.

The sets are nested, from `Set 1` (a single hard-sphere contact floor) to `Set 4`
(seven laws, the strictest). `Set 1'` sits beside the chain rather than inside it.
A looser set catching nothing is not evidence a structure is sound — it is
evidence you asked a weaker question.

## The trap — the exit status is always 0, and "no verdict" is not a pass

This is the thing to get right before running PRIS over a directory.

Roughly a fifth of real structures cannot be judged at all: several anions, complex
molecular groups, or no integer charge assignment that balances. Those come back as
**NO VERDICT**. Crucially, so does a file that does not exist, and so does a file
that is not a parseable structure. All four cases land in the same bucket, and in
every one of them **the process still exits 0**:

```bash
PYTHONPATH=PRIS/src ./venv/bin/python -m pris_analyze does_not_exist.cif
echo "exit status: $?"
```

That prints `NO VERDICT -- cannot read structure` and an exit status of `0`. A
batch run in which every file failed to parse reports `implausible 0` and looks
perfectly clean.

So never screen on the exit status, and never treat the absence of an
`implausible` count as success. Parse the JSON and require a positive verdict.
Note that unjudged rows carry a **different shape** — no `pss`, no `laws`, no
`sets` keys at all, plus a `reason` string — so code that reaches straight for
`row["pss"]` raises `KeyError` on exactly the rows you most need to notice:

```bash
PYTHONPATH=PRIS/src ./venv/bin/python -m pris_analyze --json *.cif > verdicts.json
```

```python
import json

rows = json.load(open("verdicts.json"))

passed, rejected, unjudged = [], [], []
for r in rows:
    if r["verdict"] == "plausible":
        passed.append((r["file"], r["pss"]))
    elif r["verdict"] == "implausible":
        mechanisms = sorted({l["mechanism"] for l in r["laws"].values()
                             if l["state"] == "fail"})
        rejected.append((r["file"], mechanisms))
    else:
        unjudged.append((r["file"], r.get("reason", "unknown")))

print(f"{len(passed)} plausible, {len(rejected)} implausible, "
      f"{len(unjudged)} never judged")
for f, why in unjudged:
    print(f"  unjudged: {f} — {why}")   # audit these; they are not passes

passed.sort(key=lambda t: -t[1])        # best PSS first
```

Count the unjudged every time and look at the reasons. A screening run whose
unjudged fraction is far above a fifth usually means a malformed export, not an
exotic chemistry.

## Reading the JSON

One object per input file. Judged rows carry `formula`, `n_sites`, `charges`,
`ionic_character`, `laws`, `sets`, `pss`, `pss_terms` and `verdict`.

`laws` is a dict keyed by law number as a **string** — `"1"` through `"8"`, not
integers — each with `name`, `quantity`, `statement`, `mechanism`, `threshold`,
`value`, the `sets` it applies in, and `state`, which is `pass`, `fail` or
`not triggered`.

`sets` is keyed by set name and gives each set's `model`, `verdict`, and the lists
`unsatisfied` and `unavailable`. `unsatisfied` is the direct answer to "why was
this rejected" — a list of law names.

`pss_terms` itemises the score: each term's raw value, its standardised value, its
weight, its contribution, and an `imputed` flag marking terms that fell back to a
frozen default rather than being measured. Check `imputed` before reading much
into a score. Volume per atom carries by far the largest weight, so PSS is
substantially a statement about density.

## What a distance cutoff misses

Take experimental rocksalt MgO and compress every axis by 15%. The result is
physically absurd, and the usual generative-pipeline filter does not notice: the
shortest cation–anion distance is still 84% of the summed ionic radii, comfortably
above the Law 1 floor of 0.804. Law 8 catches it, because the bond valences no
longer sum to the formal charges — the deviation goes from 0.017 to 1.308 against
a threshold of 0.714 — and the report names *bond-valence conservation* as the
mechanism. PSS moves from +3.34 to −4.51.

That is the case for reading the mechanism column rather than the verdict, and
the `## Try it` block below reproduces it exactly.

## Sharp edges

- **Oxidation states come from composition, not from bond lengths.** The analyser
  will not call pymatgen's `BVAnalyzer`, and that is deliberate: `BVAnalyzer`
  infers valences *from* bond lengths, so feeding its output into a bond-length
  law would assume the conclusion. The consequence for you is that structures
  whose composition admits no integer charge balance are skipped rather than
  guessed at.
- **`src/apply_rules.py` is a lighter path that covers only Set 1 to Set 3** — it
  does not require the bond-valence table (it still needs spglib, as every path
  does). Be aware that it prints its
  verdicts in Chinese (`合理` plausible, `不合理` implausible, `跳过` skipped),
  which will silently break any parser written against the English output of
  `pris_analyze`. **It shares the exit-0 trap described above**: its `main()`
  returns 0 unconditionally, and a file it cannot read is counted into the
  trailing `跳过` total rather than raising. A batch where every structure failed
  to parse therefore reports `合理 0 / 不合理 0 / 跳过 N` and exits clean, exactly
  as `pris_analyze` does. Check the skip count, not the exit status. Prefer
  `pris_analyze --json` for anything automated.
- **Most other scripts in `src/` are an audit trail, not a library.** The
  project says so directly: many still contain absolute paths from the machine
  the original campaign ran on. Treat `pris_analyze.py` and `apply_rules.py` as
  the supported surface.
- **A missing input degrades the score rather than stopping it.** Remove
  `data/bvparm2020.cif` and the analyser keeps going: Law 8 is reported
  `unavailable`, Set 4 returns no verdict, the overall verdict becomes
  `NO VERDICT` — and PSS is still printed, as `+2.726` where the intact run gives
  `+3.336` for the same structure, with `bv_rel_mean` imputed from development
  medians. The report does say `imputed from development medians`, but a pipeline
  reading `pss` alone sees only a plausible-looking number. Check the `imputed`
  flags in `pss_terms` before ranking on the score. The table's location can also
  be redirected with the `NEWPAULING_BVPARM` environment variable, which is worth
  knowing before you conclude the file is missing.
- **The repository has no tags and no packaging metadata.** Pin the commit SHA in
  anything reproducible; there is no version number to record instead.
- **Satisfaction and detection are separate axes.** A rule set that almost all
  real crystals satisfy may still catch very few damaged ones. When comparing
  sets, hold one axis fixed — the strictest set trades a materially lower
  satisfaction rate on real structures for much higher detection of damaged ones,
  which is the right trade for triage and the wrong one for validation.

## Try it

A self-contained check that this skill still holds. It clones the tool, builds its
own inputs and needs no data source of any kind.

**It exercises Law 8, so it runs on the non-profit route.** The clone brings the
bond-valence table with it, and the assertions below read that law. On any other
route, run this block only under terms you have obtained from the copyright
owner — see the licence section above.

**Data** — generated inline, which is why `datasets:` is empty. The analyser's
input is a local structure file, and the two structures here are built from
published parameters rather than downloaded: rocksalt MgO at its experimental
lattice constant of 4.212 Å, the same cell compressed 15% on every axis, and
diamond-structure silicon at 5.431 Å as an unjudgeable case. Constructing them
with pymatgen keeps the check deterministic and independent of any repository
staying reachable, and there is no live dataset being papered over — nothing here
was ever fetched.

**Run** — in an empty directory:

```bash
set -e
git clone -q https://github.com/AI4QC/PRIS.git
git -C PRIS checkout -q 34e6c86c083759dc1ee594ae22238ea9b5ebd8f4
python3 -m venv venv
./venv/bin/pip install -q numpy pandas pymatgen spglib scipy

cat > make_structures.py <<'PY'
from pymatgen.core import Structure, Lattice
mgo = Structure.from_spacegroup("Fm-3m", Lattice.cubic(4.212),
                                ["Mg", "O"], [[0, 0, 0], [0.5, 0.5, 0.5]])
mgo.to(filename="mgo.cif")
squashed = mgo.copy()
squashed.scale_lattice(mgo.volume * 0.85 ** 3)      # every axis 15% shorter
squashed.to(filename="mgo_squashed.cif")
Structure.from_spacegroup("Fd-3m", Lattice.cubic(5.431),
                          ["Si"], [[0, 0, 0]]).to(filename="si.cif")
PY
./venv/bin/python make_structures.py

PYTHONPATH=PRIS/src ./venv/bin/python -m pris_analyze --json \
    mgo.cif mgo_squashed.cif si.cif > verdicts.json
echo "analyser exit status: $?   <- 0, even though si.cif was never judged"

./venv/bin/python - <<'PY'
import json
rows = {r["file"]: r for r in json.load(open("verdicts.json"))}

# --- INVARIANTS: a failure here means this skill is wrong ------------------
assert rows["mgo.cif"]["verdict"] == "plausible"
assert rows["mgo_squashed.cif"]["verdict"] == "implausible"
assert rows["si.cif"]["verdict"] == "no verdict"
assert "pss" not in rows["si.cif"]          # unjudged rows carry no score at all
assert "reason" in rows["si.cif"]

sq = rows["mgo_squashed.cif"]["laws"]
assert sq["8"]["state"] == "fail"           # bond valence catches the squash
assert sq["1"]["state"] == "pass"           # the distance floor does NOT
assert rows["mgo_squashed.cif"]["sets"]["Set 4"]["unsatisfied"] == ["Law 8"]
assert rows["mgo.cif"]["pss"] > rows["mgo_squashed.cif"]["pss"]

# --- OBSERVED 2026-09-06: a mismatch here is drift, not a bug --------------
for f, r in rows.items():
    print(f'{f:18} {r["verdict"]:12} PSS {r.get("pss", float("nan")):+.3f}')
mg = rows["mgo.cif"]["laws"]
print(f'Law 1 rho     {mg["1"]["value"]:.4f} -> {sq["1"]["value"]:.4f}   (threshold {mg["1"]["threshold"]})')
print(f'Law 8 bv      {mg["8"]["value"]:.4f} -> {sq["8"]["value"]:.4f}   (threshold {mg["8"]["threshold"]})')
print('Law 3 state  ', mg["3"]["state"], '- conditional, its trigger was never met')
PY
```

**Expect** — the assertions above are invariants and must hold. The printed
numbers are observed values recorded on 2026-09-06 against the pinned commit; if
they move, the frozen artefacts or pymatgen's radii changed, which is drift to
investigate rather than a bug:

```
analyser exit status: 0   <- 0, even though si.cif was never judged
mgo.cif            plausible    PSS +3.336
mgo_squashed.cif   implausible  PSS -4.510
si.cif             no verdict   PSS +nan
Law 1 rho     0.9934 -> 0.8444   (threshold 0.804)
Law 8 bv      0.0174 -> 1.3075   (threshold 0.7143)
Law 3 state   not triggered - conditional, its trigger was never met
```

## When not to use this

- **You need stability, not plausibility.** PRIS says nothing about formation
  energy or the convex hull. It screens candidates cheaply so that the expensive
  calculation runs on fewer of them.
- **Organic, molecular or framework materials with complex anions.** These are
  largely in the unjudgeable fifth. Check your unjudged fraction on a sample
  before building a pipeline around it.
- **Metals and elemental phases.** With no cation–anion distinction there is no
  charge assignment, so nearly every law is inapplicable — the silicon case in
  `## Try it` is the demonstration.
- **You need the paper's benchmark numbers reproduced.** That needs the derived
  feature store described above, which is not distributed with the repository.

## Citing

The method is described in arXiv:2609.01209 (Song and Cheng, 2026). The
repository carries a `CITATION.cff` with entries for both the preprint and the
software.
