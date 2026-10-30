---
name: scorpion-toxin-binders
description: The 211 de novo designs made against five scorpion neurotoxins — sequences, both labs' SPR verdicts and KDs, predicted scores, sensorgrams, structures. 64 design-toxin pairs look like hits and 17 are binders; mostly a page about that gap.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-design, binder-design, benchmark, public-data, spr]
covers: [scorpion toxin, neurotoxin, Cn2, Ts1, AaH II, AaH I, LqhIII, Centruroides, Tityus, Androctonus, Leiurus, antivenom, antitoxin, de novo binder, minibinder, protein design, binding affinity, KD, surface plasmon resonance, SPR, biolayer interferometry, BLI, sensorgram, polyreactivity, off-target, CLEC12A, ipSAE, DockQ, benchmark, labelled dataset]
papers: [PMID:36812764, PMID:27560519, PMID:36927031]
access: [open]
platform: huggingface
datasets: [https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main/design.csv, https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main/in_silico_scores.csv, https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main/toxins.csv, https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main/supporting_tables/OVA.csv, https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main/supporting_tables/origin.csv, https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main/structures/INDEX.csv, https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main/structures/888c8f04/888c8f04_design-cn2.pdb]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-30
  against: dataset revision 0bac3d02 (last modified 2026-10-20) — 5,108 files, 211 designs, 17 named binders / Python 3.11.17 / pandas 3.1.0 / stdlib csv and urllib only in the Try it block
  executed: 6
  unverified: 0
---

# The scorpion toxin binder design release

A labelled set of **211 de novo designed proteins** aimed at five scorpion neurotoxins, each
one expressed, purified and measured by surface plasmon resonance at **two independent contract
research organisations** — Adaptyv Bio and Twist Bioscience — with the predicted scores that
were computed before any of it was ordered.

That combination is rare and is the reason to use this release. Most public design data is
either unlabelled (sequences with no assay) or labelled by one lab against one target. Here
every design carries two labs' verdicts, a fitted KD where there was one, an off-target screen
against an unrelated human protein, a polyreactivity ELISA, per-concentration sensorgram
traces, and 19 structure files (20 for a fusion design).

**Use it for calibration, not for a leaderboard.** 64 design-toxin pairs produced a `hit`
somewhere; 17 of them are binders. The arithmetic of that gap is most of what this page is for.

The data is **CC BY 4.0** and ungated: no account, no token, no licence to accept. Only the
tables are small — the full repository is about **1.45 GB across 5,108 files**, so read
[Get the files](#get-the-files) before cloning anything.

## What is in it

Counts below were recomputed from the files, not read off the card.

| File | What it holds |
| --- | --- |
| `design.csv` | 211 rows, one per design: `sequence`, `length_aa`, `format`, `intended_toxins`, each lab's result and KD per toxin, the off-target columns, and `binder_against` |
| `in_silico_scores.csv` | 211 rows: per-toxin `final_score`, ipSAE and scDockQ under three predictors, plus monomer pLDDT and scRMSD |
| `toxins.csv` | the 5 toxins: mature sequence, family, receptor site, organism, UniProt accession, disulfide pairing |
| `controls.csv` | 115 rows of control-antibody measurements at both labs |
| `Cn2_competition_Twist_Bioscience.csv` | BLI competition against the antibodies LR, RU1 and 9004G for Cn2 |
| `BVP_ELISA.csv` | baculovirus-particle ELISA, a polyreactivity screen, for 51 designs |
| `supporting_tables/` | 12 tables: `origin.csv`, `expression.csv`, the follow-up assays, per-seed scores, interfaces, thresholds |
| `sensorgrams/` | 223 folders (211 designs + 12 controls) of traces, kinetic fits and figures, indexed in `sensorgrams/INDEX.csv` |
| `structures/` | 211 folders, 4,041 PDB files, indexed in `structures/INDEX.csv` |
| `COLUMNS.md` | every file and every column, defined by the depositors — read this before trusting any column name |

The five toxins, from `toxins.csv`:

| Toxin | Family | Site | Organism | UniProt | Binders |
| --- | --- | --- | --- | --- | --- |
| Cn2 | beta | site 4 | *Centruroides noxius* | P01495 | 7 |
| Ts1 | beta | site 4 | *Tityus serrulatus* | P15226 | 0 |
| AaH II | alpha | site 3 | *Androctonus australis* | P01484 | 4 |
| AaH I | alpha | site 3 | *Androctonus australis* | P01479 | 4 |
| LqhIII | alpha-like | site 3 | *Leiurus hebraeus* | P56678 | 2 |

179 designs are single domains and 32 are fusions of two domains; lengths run 55 to 234
residues with a median of 105.

## Get the files

Everything is served anonymously over HTTPS. The three routes differ only in how much they
drag along.

**One table, nothing else.** No dependencies, no client library:

```bash
BASE=https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main
curl -sL -o design.csv "$BASE/design.csv"
curl -sL -o in_silico_scores.csv "$BASE/in_silico_scores.csv"
wc -c design.csv in_silico_scores.csv
```

**Straight into pandas**, keeping the identifier as text — see [the identifier
trap](#load-the-tables-without-corrupting-them):

```python
import pandas as pd

URL = "hf://datasets/Anthropic/scorpion-toxin-binder-design/design.csv"
designs = pd.read_csv(URL, dtype={"uuid": str})
print(len(designs), designs.binder_against.notna().sum())
```

`hf://` needs `huggingface_hub` installed; plain `https://…/resolve/main/design.csv` works with
no extra package and is what the `## Try it` block below uses.

**The whole package is 1.45 GB**, four fifths of it predicted structures. Every table, both
indexes and nothing else comes to 23 files and about 2 MB:

```bash
hf download Anthropic/scorpion-toxin-binder-design --repo-type dataset --local-dir ./stbd \
  --include "*.csv" --include "*.md" \
  --exclude "sensorgrams/*/*" --exclude "structures/*/*"
find ./stbd -type f -not -path '*/.cache/*' | wc -l
```

**Repeat the flag for each pattern.** `--include` and `--exclude` take **one** glob each. A
second bare pattern — `--include "*.csv" "*.md"` — is parsed as a positional *filename*, and
the CLI then prints `Ignoring --include since filenames have been explicitly set` and drops
both filters. Written that way, the command above fetches 4,041 structure files instead of 23
tables. It warns, on stderr, after it has started; nothing fails. Excluding one level deeper
(`sensorgrams/*/*`) rather than `sensorgrams/*` is also deliberate — the latter would discard
`sensorgrams/INDEX.csv`, which is how you find anything in there.

**The per-design folders need the plain URL on a restricted network.** The sensorgram traces
are large and stored as LFS objects, which the client fetches through a Hugging Face CDN host
(`cas-server.xethub.hf.co`) rather than from `huggingface.co`. Where that host is not
reachable, `hf download --include "*/888c8f04/*"` aborts partway with a CAS reconstruction
error, and `HF_HUB_DISABLE_XET=1` only moves the failure to the other CDN host. The
`resolve/main` path serves the identical file over `huggingface.co` alone:

```bash
D=888c8f04   # Cn2-B1
BASE=https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main
curl -sL -o ${D}_kinetics.csv "$BASE/sensorgrams/$D/${D}_kinetics.csv"      # 1.1 KB, the fits
curl -sL -o ${D}_traces.csv   "$BASE/sensorgrams/$D/${D}_traces.csv"        # 3.9 MB, LFS
curl -sL -o ${D}_design.pdb   "$BASE/structures/$D/${D}_design-cn2.pdb"     # 82 KB
wc -c ${D}_kinetics.csv ${D}_traces.csv ${D}_design.pdb
grep -c '^ATOM' ${D}_design.pdb
head -2 ${D}_traces.csv
```

Listing the repository through the API is paginated at 1,000 entries. A single
`?recursive=true` call returns 1,000 of 5,546 entries and looks complete — follow the `Link`
header's `cursor` until it stops, or you will conclude that `structures/`, `supporting_tables/`
and `toxins.csv` do not exist. That is not a hypothetical; it is what the first pass of this
page did.

## Load the tables without corrupting them

Four things will bite, in rough order of how quietly they do it.

**`uuid` is text that sometimes looks like a number.** Designs are eight hex-ish characters.
`946282e8` is a valid float literal, so anything that type-infers a lone identifier turns it
into `94628200000000.0` — a spreadsheet, a one-column export, a `float()` in a helper. Twelve
of the 211 identifiers also start with `0`, which the same inference strips. Inside the full
`design.csv` pandas keeps the column as text because its other values are not numeric, so the
bug does not appear until you handle an identifier on its own. Pass `dtype={"uuid": str}`
everywhere and the question never arises.

**An empty cell never means `no hit`.** `COLUMNS.md` says so outright, and the counts bear it
out: 71 to 78 of the 211 Adaptyv cells per toxin are blank, against 114 to 133 that carry an
explicit `no hit`. A blank records the absence of a result — the assay was not run, the value
does not apply, or no fit converged — and never a negative one. Read it as a negative and you
have invented between 71 and 78 measurements per toxin, all of them favourable to whatever you
are testing.

**The verdict columns have four values, not two.** `<toxin>_Twist_result` is `hit`, `no hit`,
`weak or ambiguous`, or `not assessable (capture <50 RU)`: 22 cells are weak-or-ambiguous and
20 are not-assessable. `!= "hit"` folds a failed capture into a negative result. The Adaptyv
columns carry only `hit` and `no hit`, so the two labs' columns are not the same vocabulary and
should not be compared with one expression.

**LqhIII was measured at one lab only.** There is no `LqhIII_Twist_result`, no
`LqhIII_Twist_KD_nM` and no `LqhIII_Twist_Rmax_ratio`. Any loop that composes column names from
a toxin list and a lab list raises `KeyError` on the fifth toxin. Guard on presence rather than
assuming the grid is full. One design, `6a7a1c19`, has no Twist measurement for any toxin.

## A hit is not a binder

`binder_against` is the only column that answers "did this work". It is populated for 17 of the
211 designs and empty for 194. The four criteria behind it, and where each one lives:

1. **A hit at both labs, in every replicate.** The per-replicate verdicts are in
   `sensorgrams/<uuid>/<uuid>_kinetics.csv`, not in `design.csv` — the summary column can say
   `hit` while a replicate inside it did not.
2. **Every main-screen KD at 1 µM or tighter**, from `<toxin>_<lab>_KD_nM`.
3. **A fitted Rmax within the theoretical maximum** — `<toxin>_Twist_Rmax_ratio` of 1 or less.
   A ratio above 1 means more response than one toxin per binding site can give, which is
   evidence of something other than the intended 1:1 interaction.
4. **No signal above background against CLEC12A**, an unrelated human protein, in both of
   Twist's runs: `CLEC12A_Twist_result_run_1` and `_run_2`.

Criterion 4 is the one that does the work, and it is worth seeing on real rows. AaH I is the
sharpest case: 19 designs are a `hit` at Adaptyv, 19 at Twist, **16 at both** — and 4 are
binders.

```python
import pandas as pd

BASE = "https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main"
d = pd.read_csv(f"{BASE}/design.csv", dtype={"uuid": str})

both = d[(d.AaHI_Adaptyv_result == "hit") & (d.AaHI_Twist_result == "hit")]
print("hit at both labs      :", len(both))
print("of those, binders     :", (both.binder_against == "AaH I").sum())
print("failing CLEC12A run 2 :", (both.CLEC12A_Twist_result_run_2 != "no hit").sum())
print(both.loc[both.CLEC12A_Twist_result_run_1 == "hit", ["uuid", "AaHI_Adaptyv_KD_nM"]]
        .sort_values("AaHI_Adaptyv_KD_nM").head(3).to_string(index=False))
```

Twelve of the sixteen bind CLEC12A. Among them is `0af4b327`, whose 1.65 nM Adaptyv fit is the
tightest AaH I number in the table — tighter than any of the four binders, and not a binder,
because it binds an unrelated protein just as well. **If you rank this dataset by KD you will
rank polyreactive proteins to the top.** Whatever filter you build, the off-target column
belongs in it, and a single-target assay cannot supply one.

Two more cautions on the 17:

- **Being a binder here does not mean being clean.** `supporting_tables/OVA.csv` screens 52
  designs against ovalbumin, and `888c8f04` — Cn2-B1, the best-characterised design in the
  release — is a `hit` there at 12.7% of theoretical Rmax. Criterion 4 covers CLEC12A, not
  every off-target. Read `OVA.csv` and `BVP_ELISA.csv` before calling any design specific.
- **Nothing here is neutralisation.** Every verdict is binding measured in vitro. The
  depositors are explicit that the expected channel-level consequence has not been tested in
  cells. A skill, a model or a paper that uses `binder_against` as a neutralisation label is
  mislabelling it.

## What the predicted scores were worth

`in_silico_scores.csv` is a labelled calibration set: scores computed before ordering, outcomes
measured after. Scored over the 665 design-toxin pairs a design was actually aimed at
(`intended_toxins`), against the 17 binders:

| `final_score` cut | pairs kept | binders kept | precision | recall |
| --- | --- | --- | --- | --- |
| none | 665 | 17 | 2.6% | 100% |
| ≥ 0.50 | 517 | 17 | 3.3% | 100% |
| ≥ 0.70 | 236 | 14 | 5.9% | 82% |
| ≥ 0.80 | 119 | 13 | 10.9% | 76% |
| ≥ 0.90 | 53 | 10 | 18.9% | 59% |

So the score is a real filter — a 0.90 cut is about **7× enrichment** — and nowhere near a
decision procedure: it still throws away 7 of 17 binders, and 43 of the 53 pairs it keeps did
not work. The highest `final_score` in the whole set, 0.9492 for `1578f84e` against AaH I, is
not a binder. Binders themselves span 0.5931 to 0.9454.

Use it the way the existing `binder-design-filtering` skill frames thresholds: to order a
list you will truncate by budget, not to decide what binds. Note also that
`supporting_tables/ipSAE_thresholds.csv` is indexed by toxin **and** predictor — fifteen rows,
0.15 for Cn2 under ESMFold2 against 0.54 under Protenix v2. An ipSAE cutoff carried between
predictors is not the same filter.

## Sensorgrams, structures and provenance

- **`sensorgrams/INDEX.csv`** — 3,819 rows, one per measured series: `folder`, `lab`, `toxin`,
  `replicate`, `concentrations_nM`, `n_points`, `result`, `assay`. Filter here first, then
  fetch only the `<uuid>_traces.csv` you need; the trace files run to several MB each.
  Control folders are named `control_<control>`, not by uuid.
- **`structures/INDEX.csv`** — 4,041 rows with `kind`, `predictor` and `toxin` per file: 19
  files for each of the 179 single domains and 20 for each of the 32 fusions. Every design has
  its design model (`<uuid>_design-<toxin>.pdb`), predicted complexes against all five toxins
  under ESMFold2, ESMFold2-Fast and Protenix v2, and three predicted monomers. Fusions split
  the design model into `_design-domainA-<toxin>` and `_design-domainB-<toxin>`.
- **`supporting_tables/origin.csv`** — how each design was made: `design_tool`,
  `backbone_family`, `redesign_round`, `sequence_design_method`, and for fusions the two parent
  uuids and the linker. Ten generators appear across the 179 single domains — Mosaic (55),
  PXDesign (48), Genie 3 (27), RFdiffusion3 (17), FreeBindCraft and Proteina-Complexa (12
  each), BoltzGen (4), and one each from Protein Hunter, BoltzDesign1 and RFdiffusion; the 32
  fusions leave the field empty and inherit through `parent_uuid`. This is the column to group
  by when asking which generator produced the binders rather than how many there were.
- **`supporting_tables/expression.csv`** — split-GFP expression and purified yield for all 211,
  which is where designs die before any assay sees them.

The structure files pair naturally with `binder-design-filtering` for recomputing interface
metrics. For the generators `origin.csv` names, the registry already documents `pxdesign`,
`genie3`, `boltzgen`, `bindcraft` (which covers the PyRosetta-free FreeBindCraft build) and
`rosetta-foundry` (RFdiffusion3).

## Try it

A self-contained check that this page still holds. Public data, no account, no key, standard
library only.

**Data** — the two summary tables, fetched anonymously:

    https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main/design.csv
    https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design/resolve/main/in_silico_scores.csv

CC BY 4.0, ungated, 118 KB for the pair. The block routes through every trap above: it reads
identifiers as text, counts empty cells separately from `no hit`, discovers that LqhIII has no
Twist columns rather than assuming it does, and separates hits from binders. Last confirmed
reachable 2026-10-30.

```python
import csv, io, urllib.request

BASE = ("https://huggingface.co/datasets/Anthropic/"
        "scorpion-toxin-binder-design/resolve/main")

def table(name):
    with urllib.request.urlopen(f"{BASE}/{name}", timeout=60) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))

designs, scores = table("design.csv"), table("in_silico_scores.csv")
TOX = {"Cn2": "Cn2", "Ts1": "Ts1", "AaHII": "AaH II",
       "AaHI": "AaH I", "LqhIII": "LqhIII"}

# --- invariants: the shape of the release -----------------------------------
uuids = [r["uuid"] for r in designs]
assert len(designs) == len(scores) == 211
assert len(set(uuids)) == 211
assert sum(u.startswith("0") for u in uuids) == 12      # text, not integers
assert float("946282e8") == 94628200000000.0            # why dtype=str matters
assert "946282e8" in uuids

# LqhIII was measured at one lab only — never compose column names blindly
cols = designs[0].keys()
assert "LqhIII_Adaptyv_result" in cols
assert not any(c.startswith("LqhIII_Twist") for c in cols)

# every binder is clean against the unrelated human protein, in both runs
binders = [r for r in designs if r["binder_against"]]
assert all(r["CLEC12A_Twist_result_run_1"] == "no hit"
           and r["CLEC12A_Twist_result_run_2"] == "no hit" for r in binders)
assert all(r["name"] for r in binders)                  # binders are the named ones
assert all(not r["name"] for r in designs if not r["binder_against"])

# --- observed values: recount rather than trust ------------------------------
per_toxin, hit_cells, hit_pairs, empty = {}, 0, set(), {}
for r in designs:
    if r["binder_against"]:
        per_toxin[r["binder_against"]] = per_toxin.get(r["binder_against"], 0) + 1
    for key in TOX:
        empty[key] = empty.get(key, 0) + (r[f"{key}_Adaptyv_result"] == "")
        for lab in ("Adaptyv", "Twist"):
            col = f"{key}_{lab}_result"
            if col in r and r[col] == "hit":
                hit_cells += 1
                hit_pairs.add((r["uuid"], key))

vocab = {r[f"{k}_Twist_result"] for r in designs for k in TOX
         if f"{k}_Twist_result" in r}

print("designs / scored      :", len(designs), "/", len(scores))
print("hit cells, any lab    :", hit_cells)
print("design-toxin pairs    :", len(hit_pairs), "with a hit at either lab")
print("binders               :", len(binders), per_toxin)
print("Twist vocabulary      :", sorted(v for v in vocab if v))
print("empty Adaptyv cells   :", empty)

assert len(binders) == 17
assert per_toxin == {"Cn2": 7, "AaH II": 4, "AaH I": 4, "LqhIII": 2}
assert "Ts1" not in per_toxin                            # nothing worked against Ts1
assert (hit_cells, len(hit_pairs)) == (99, 64)
assert len(vocab - {""}) == 4

# --- observed: the AaH I case, and what separates the four -------------------
both = [r for r in designs if r["AaHI_Adaptyv_result"] == "hit"
        and r["AaHI_Twist_result"] == "hit"]
dirty = [r for r in both if r["CLEC12A_Twist_result_run_2"] != "no hit"]
tightest = min(both, key=lambda r: float(r["AaHI_Adaptyv_KD_nM"]))

print()
print("AaH I hit at both labs:", len(both),
      "| binders:", sum(r["binder_against"] == "AaH I" for r in both),
      "| fail CLEC12A run 2:", len(dirty))
print("tightest AaH I fit    :", tightest["uuid"],
      tightest["AaHI_Adaptyv_KD_nM"], "nM -> binder:",
      bool(tightest["binder_against"]))

assert (len(both), len(dirty)) == (16, 12)
assert sum(r["binder_against"] == "AaH I" for r in both) == 4
assert tightest["uuid"] == "0af4b327" and not tightest["binder_against"]

# --- observed: predicted score as a filter, over intended pairs only ---------
by_uuid = {r["uuid"]: r for r in scores}
pairs = []
for r in designs:
    intended = [t.strip() for t in r["intended_toxins"].split(";")]
    for key, label in TOX.items():
        if label in intended:
            pairs.append((float(by_uuid[r["uuid"]][f"{key}_final_score"]),
                          r["binder_against"] == label))

print()
print("intended pairs        :", len(pairs))
for cut in (0.0, 0.5, 0.7, 0.8, 0.9):
    kept = [b for s, b in pairs if s >= cut]
    print(f"  final_score >= {cut:.2f}: {len(kept):3} kept, {sum(kept):2} binders, "
          f"precision {sum(kept) / len(kept) * 100:4.1f}%")

top_score, top_is_binder = max(pairs)
assert len(pairs) == 665 and sum(b for _, b in pairs) == 17
assert [len([b for s, b in pairs if s >= c]) for c in (0.5, 0.7, 0.8, 0.9)] == [517, 236, 119, 53]
assert [sum(b for s, b in pairs if s >= c) for c in (0.5, 0.7, 0.8, 0.9)] == [17, 14, 13, 10]
assert round(top_score, 4) == 0.9492 and not top_is_binder   # best score, not a binder
print()
print("best final_score      : %.4f, a binder: %s" % (top_score, top_is_binder))
print("all assertions passed")
```

**Expect** — invariants, which hold across revisions. A failure means this page is wrong:
211 designs with unique text identifiers, 12 of them starting with `0`; no `LqhIII_Twist_*`
column; `binder_against` populated exactly for the named designs; every binder `no hit` against
CLEC12A in both runs.

Observed 2026-10-30 against revision `0bac3d02` — these move if the depositors revise the
tables, so treat a mismatch as drift to investigate rather than a failure:

```
designs / scored      : 211 / 211
hit cells, any lab    : 99
design-toxin pairs    : 64 with a hit at either lab
binders               : 17 {'Cn2': 7, 'AaH II': 4, 'AaH I': 4, 'LqhIII': 2}
Twist vocabulary      : ['hit', 'no hit', 'not assessable (capture <50 RU)', 'weak or ambiguous']
empty Adaptyv cells   : {'Cn2': 74, 'Ts1': 71, 'AaHII': 75, 'AaHI': 78, 'LqhIII': 78}

AaH I hit at both labs: 16 | binders: 4 | fail CLEC12A run 2: 12
tightest AaH I fit    : 0af4b327 1.65 nM -> binder: False

intended pairs        : 665
  final_score >= 0.00: 665 kept, 17 binders, precision  2.6%
  final_score >= 0.50: 517 kept, 17 binders, precision  3.3%
  final_score >= 0.70: 236 kept, 14 binders, precision  5.9%
  final_score >= 0.80: 119 kept, 13 binders, precision 10.9%
  final_score >= 0.90:  53 kept, 10 binders, precision 18.9%

best final_score      : 0.9492, a binder: False
all assertions passed
```

## How to cite

The release asks to be cited as: Claude Science, Nathaniel Horwitz, James van Geelen, Kat
Kajderowicz, Amir Shanehsazzadeh, *De novo design of protein binders against scorpion toxins
with Claude*, 20 October 2026. The report PDF and the accompanying write-up are linked from the
dataset card; the dataset itself is
[`Anthropic/scorpion-toxin-binder-design`](https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design).

## Sources

- Dataset — [`Anthropic/scorpion-toxin-binder-design`](https://huggingface.co/datasets/Anthropic/scorpion-toxin-binder-design),
  CC BY 4.0, © 2026 Anthropic, PBC. `LICENSE.md` notes that toxin chains in the structure files
  derive from PDB entries 25IH, 1NPI, 1AHO and 7K18 and from AlphaFold DB entry AF-P01479-F1,
  which keep their own terms — check those before redistributing a structure file.
- Column definitions — `COLUMNS.md` and `README.md` in the dataset itself. Every count and
  threshold on this page was recomputed from the CSVs rather than copied from either.
- Background on anti-toxin antibody fragments — Romero-Moreno et al., *Development of a human
  antibody fragment cross-neutralizing scorpion toxins*, PMID
  [36812764](https://pubmed.ncbi.nlm.nih.gov/36812764/) (2023), on maturing the scFv 3F family
  toward broader recognition including Cn2. It does not describe the LR, RU1 or 9004G controls
  used here; the release names those but cites no paper for them.
- `scDockQ` — Basu and Wallner, *DockQ: A Quality Measure for Protein-Protein Docking Models*,
  PMID [27560519](https://pubmed.ncbi.nlm.nih.gov/27560519/) (2016).
- ESMFold — Lin et al., *Evolutionary-scale prediction of atomic-level protein structure with a
  language model*, PMID [36927031](https://pubmed.ncbi.nlm.nih.gov/36927031/) (2023), one of the
  three predictors behind `in_silico_scores.csv`.
