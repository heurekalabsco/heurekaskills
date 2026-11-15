---
name: trial-design-bench
description: Query TrialDesignBench — 617 Phase-I and Phase-I/II oncology dose-finding trials with expert-validated reference design labels, admissible design sets, ranked tiers and decision-tree paths. Score a proposed design against the standard.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, clinical-trials, dose-finding, biostatistics, evaluation]
covers: [trialdesignbench, phase 1, phase i, dose finding, dose escalation, dose optimization, oncology, mtd, obd, dlt, boin, tite-boin, boin12, keyboard, crm, 3+3, ewoc, blrm, efftox, waterfall, trial design, clinical trial, nct id, aact, project optimus, biostatistics, benchmark, llm evaluation, design selection]
papers: [doi:10.48550/arXiv.2611.12640, doi:10.1371/journal.pone.0033677]
access: [open]
datasets: [https://raw.githubusercontent.com/hanktang-research/TrialDesignBench/master/data/reference_standard.csv, https://raw.githubusercontent.com/hanktang-research/TrialDesignBench/master/data/structured_fields.csv]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-14
  against: TrialDesignBench master commit e587b1f / ClinicalTrials.gov API v2 / Python 3.12.8 / standard library only
  executed: 7
  unverified: 0
---
# TrialDesignBench

**617 Phase-I and Phase-I/II oncology dose-finding trials, each carrying a reference-standard
design label that a panel validated** — plus the admissible design set, the ranked alternatives,
and the decision-tree path that produced the label.

It was built to score language models on design-method selection, and that is one use. The other
is simpler and needs no model at all: it is a public table of real Phase-I trials paired with a
defensible answer to *which dose-finding design this trial should have used*. This skill reads it,
scores a proposed design against it, and tells you where the table's own columns disagree with
each other — which they do, on 94 of the 617 trials, for reasons that matter.

**Nothing here needs an account, a key or a licence click.** The two tables and the prompt
templates are CC BY 4.0 and the code is MIT, served from a public repository. Only the full
model-evaluation matrix at the end needs anything you have to obtain, and that section says so
before its first command.

## What it is not

Every label here is the answer that **one** documented selection workflow gives, applied to each
trial as though it were being designed under Project Optimus rather than as it was actually run.
A match therefore tells you a proposal agrees with that workflow. It does not tell you the design
is right for the trial, and the benchmark's own authors disclaim any clinical reading of their
labels. Treat a label as a graded exam answer rather than a recommendation — nothing this skill
produces belongs in a protocol that a qualified biostatistician has not reviewed.

It is also an evaluation set. The authors identify every trial to a model by an opaque case id,
never by its registry number, and their system prompt tells the model not to try to identify the
trial. Keep it that way in anything you build from this page: the code below never prints a
trial's label next to its registry number, and the prompt builder refuses to emit one.

## Get the files

Two CSVs and six Markdown templates, about 900 KB in total. No authentication.

```bash
BASE=https://raw.githubusercontent.com/hanktang-research/TrialDesignBench/master
mkdir -p tdb/data tdb/prompts

curl -sSfL -o tdb/data/reference_standard.csv "$BASE/data/reference_standard.csv"
curl -sSfL -o tdb/data/structured_fields.csv  "$BASE/data/structured_fields.csv"

for f in 00_shared_blocks A_protocol_narrative B_structured_fields \
         C_resolved_latents D_workflow E_workflow_plus_latents; do
  curl -sSfL -o "tdb/prompts/$f.md" "$BASE/prompts/$f.md"
done

wc -c tdb/data/*.csv && ls tdb/prompts
```

```
279608 tdb/data/reference_standard.csv
611088 tdb/data/structured_fields.csv
890696 total
00_shared_blocks.md
A_protocol_narrative.md
B_structured_fields.md
C_resolved_latents.md
D_workflow.md
E_workflow_plus_latents.md
```

`-f` matters. Without it a renamed path gives you a 404 page with exit status 0, and the CSV
reader downstream fails somewhere far less obvious.

## The reference standard

`reference_standard.csv` is one row per trial, twelve columns, keyed by `nct_id`.

| column | what it holds |
|---|---|
| `nct_id` | the registry identifier, `NCT` + 8 digits |
| `status` | `leaf` (in scope, labelled) or `out_of_scope` |
| `label_primary` | **the reference standard** — one design method, blank when out of scope |
| `admissible_set` | pipe-separated methods acceptable at the leaf the rule walk reached |
| `ranked_tiers` | the same methods as `method:tier`, tiers `Primary`, `Secondary`, `Acceptable` |
| `ai_ratio` | the accrual-to-window ratio range used by the late-onset rule |
| `swing_case` | whether the escalation-timing gate decided the label |
| `interval_basis` | how the inter-patient interval was established from the registry record |
| `late_onset_tier` | the late-onset determination tier, populated only where that rule ran |
| `m2_gate` | the escalation-timing-gate diagnostic, as free text |
| `tree_path` | the node-by-node walk, `node=answer` joined by ` -> ` |
| `note` | construction provenance, including which corrections touched the row |

```python
import collections, csv, urllib.request

URL = ("https://raw.githubusercontent.com/hanktang-research/TrialDesignBench"
       "/master/data/reference_standard.csv")
with urllib.request.urlopen(URL, timeout=120) as fh:
    ref = list(csv.DictReader(fh.read().decode("utf-8").splitlines()))

labelled = [r for r in ref if r["status"] == "leaf"]
print(f"trials            : {len(ref)}")
print(f"labelled          : {len(labelled)}")
print(f"out of scope      : {sum(r['status'] == 'out_of_scope' for r in ref)}")
for method, n in collections.Counter(r["label_primary"] for r in labelled).most_common():
    print(f"  {method:<12} {n}")
```

```
trials            : 617
labelled          : 475
out of scope      : 142
  BOIN         366
  3+3          59
  TITE-BOIN    24
  BOIN Comb    20
  BOIN-ET      4
  TITE-BOIN12  1
  BOIN12       1
```

The distribution is lopsided on purpose — it reflects what contemporary Phase-I oncology
practice should be under this workflow, not a balanced test set. Report balanced accuracy or
macro-F1 alongside plain accuracy, or a model that answers `BOIN` to everything scores 77%.

## How upstream scores a model

The authors' aggregation script (`code/full_report_v10.py`) fixes what a reported number means:

- **Only labelled rows count.** For each model and configuration, a response contributes when it
  parsed, declared the trial in scope, and named a top-1 method (name-normalised). The
  `out_of_scope` rows never enter the accuracy figures — and nor does a labelled trial the model
  wrongly called out of scope; it drops out of the scored count rather than counting as wrong.
  Report the scored count beside every figure, or a model that abstains often looks better than it is.
- **In D and E, the node walk gates the answer.** The response's node answers are walked
  mechanically through the decision tree; only if the walk reaches a leaf is the top-1 method scored.
- **Top-1 only.** The response schema asks for a top-3 list as well, and none of the reported
  metrics reads it.
- **Two families of metric**, both against `label_primary` with `BOIN` as the majority baseline:
  exact — accuracy, balanced accuracy, macro-F1, Cohen's kappa, MCC — and the same five
  **class-credited**, where a prediction in the same decision-tree class as the label counts as
  the label. The method-to-class map lives in that script as `CLASS_MAP` and covers the 25 methods
  the tree's leaves contain.

Class credit is generous where the classes are wide: Class 1 holds seven methods, among them
`BOIN` and `3+3`.

## The trap — score against `label_primary`, nothing else

`label_primary` and `status` are the reference standard. `tree_path`, `admissible_set` and
`ranked_tiers` record the **rule-derived walk**, which happens *before* three corrections that
only ever moved the label. So those columns can contradict the answer, and on 94 of 617 trials
(15.2%) at least one of them does:

- **59 trials** relabelled `BOIN` → `3+3`, because fewer than three dose levels were
  prespecified. `ranked_tiers` still ranks `BOIN` as `Primary`.
- **31 trials** re-verified from combination to single-agent. `tree_path` still ends
  `mtd_comb_target=Single MTD` and `admissible_set` is still the combination pair, which **does
  not contain the label at all**.
- **4 trials** moved to `out_of_scope` on expert re-audit. `tree_path` still shows a complete
  in-scope walk to a Class-1 leaf.

The three groups are disjoint. Reading the `Primary` tier as the answer — the obvious shortcut,
since it is `Primary` on 385 of 475 rows — mis-scores every one of them. The block below grades
that shortcut both ways, reading the class map from the upstream scorer rather than restating it.

```python
import ast, collections, csv, urllib.request

RAW = "https://raw.githubusercontent.com/hanktang-research/TrialDesignBench/master"
def fetch(path):
    with urllib.request.urlopen(f"{RAW}/{path}", timeout=120) as fh:
        return fh.read().decode("utf-8")

def module_constant(path, name):
    """Read one literal constant out of an upstream module without executing it."""
    for node in ast.parse(fetch(path)).body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise KeyError(f"{name} not found in {path} — upstream scorer changed")

ref = list(csv.DictReader(fetch("data/reference_standard.csv").splitlines()))
CLASS_MAP = module_constant("code/full_report_v10.py", "CLASS_MAP")   # method -> class 1..10

def tiers_of(row):
    return dict(e.partition(":")[::2] for e in row["ranked_tiers"].split("|")) if row["ranked_tiers"] else {}

def primary_tier(row):
    """The method the rule walk ranked Primary. NOT the reference standard."""
    return next((m for m, t in tiers_of(row).items() if t == "Primary"), None)

def score(row, proposed):
    """Grade one top-1 proposal on a labelled row, as upstream does: exact, then class-credited."""
    label = row["label_primary"]
    exact = proposed == label
    same_class = CLASS_MAP.get(label) is not None and CLASS_MAP.get(proposed) == CLASS_MAP[label]
    return {"exact": exact, "class_credit": exact or same_class, "tier": tiers_of(row).get(proposed)}

labelled = [r for r in ref if r["status"] == "leaf"]
diverged = [r for r in labelled if primary_tier(r) != r["label_primary"]]
reaudit = [r for r in ref if r["status"] == "out_of_scope" and not r["tree_path"].endswith("Out of scope")]

print(f"methods in the upstream class map                 : {len(CLASS_MAP)}")
print(f"labelled rows whose Primary tier is not the label : {len(diverged)}")
print(f"out-of-scope rows whose walk still reaches a leaf : {len(reaudit)}")
print(f"walk disagrees with the label, in total           : {len(diverged) + len(reaudit)}")
graded = [score(r, primary_tier(r)) for r in diverged]
print(f"answering the Primary tier on the {len(diverged)} labelled rows:")
print(f"  exact matches            : {sum(g['exact'] for g in graded)}")
print(f"  class-credited matches   : {sum(g['class_credit'] for g in graded)}")
print("  where the label sits     :",
      dict(collections.Counter(tiers_of(r).get(r["label_primary"], "outside the set") for r in diverged)))
```

```
methods in the upstream class map                 : 25
labelled rows whose Primary tier is not the label : 90
out-of-scope rows whose walk still reaches a leaf : 4
walk disagrees with the label, in total           : 94
answering the Primary tier on the 90 labelled rows:
  exact matches            : 0
  class-credited matches   : 59
  where the label sits     : {'Acceptable': 59, 'outside the set': 31}
```

Read the two lines together. On the 59 relabelled rows the shortcut scores zero exact and full
class credit, because `BOIN` and `3+3` share Class 1 — so class-credited accuracy cannot see this
correction, and exact accuracy can. On the 31 combination rows the shortcut lands in a different
class and fails both ways. The tier the proposal sits at is worth reporting, but it is a statement
about the rule walk's ranking, not about agreement with the label.

## Tiers, and a partial-credit scheme of your own

For the 385 trials where the walk and the label agree, the tiers form a graded scale: how far from
the standard a near-miss fell. Upstream does not use them in any metric. If you want a
deviation measure or credit for a top-3 list, the weights below — 1.0 for the label, 0.5 for a
`Secondary` method, 0.25 for an `Acceptable` one — are **this page's choice, not the benchmark's**.
Say so when you report them, and exclude the 90 corrected rows rather than letting them score
strangely.

```python
import collections, csv, statistics, urllib.request

URL = ("https://raw.githubusercontent.com/hanktang-research/TrialDesignBench"
       "/master/data/reference_standard.csv")
with urllib.request.urlopen(URL, timeout=120) as fh:
    ref = list(csv.DictReader(fh.read().decode("utf-8").splitlines()))

RANK = {"Primary": 0, "Secondary": 1, "Acceptable": 2}

def tiers_of(row):
    return dict(e.partition(":")[::2] for e in row["ranked_tiers"].split("|"))

labelled = [r for r in ref if r["status"] == "leaf"]
clean = [r for r in labelled if tiers_of(r).get(r["label_primary"]) == "Primary"]

print(f"labelled / tier-consistent : {len(labelled)} / {len(clean)}")
print("admissible-set sizes       :",
      dict(sorted(collections.Counter(len(tiers_of(r)) for r in labelled).items())))
print("tier counts                :",
      dict(collections.Counter(t for r in labelled for t in tiers_of(r).values())))

# This page's own weighting, not the benchmark's: upstream scores top-1 only.
WEIGHT = {0: 1.0, 1: 0.5, 2: 0.25}
def top3_credit(row, proposals):
    tiers = tiers_of(row)
    if row["label_primary"] in proposals:
        return 1.0
    best = min((RANK[tiers[p]] for p in proposals if p in tiers), default=None)
    return WEIGHT.get(best, 0.0)

def first_with(row, tier):
    return [p for p, t in tiers_of(row).items() if t == tier][:1]

with_secondary = [r for r in clean if first_with(r, "Secondary")]
print(f"mean credit over {len(clean)} tier-consistent rows:")
print("  the label itself         :", statistics.mean(top3_credit(r, [r["label_primary"]]) for r in clean))
print(f"  a Secondary method ({len(with_secondary)} rows):",
      statistics.mean(top3_credit(r, first_with(r, "Secondary")) for r in with_secondary))
print("  an off-set guess         :", statistics.mean(top3_credit(r, ["OTHER"]) for r in clean))
```

```
labelled / tier-consistent : 475 / 385
admissible-set sizes       : {1: 1, 2: 56, 3: 23, 7: 395}
tier counts                : {'Primary': 475, 'Secondary': 1287, 'Acceptable': 1185}
mean credit over 385 tier-consistent rows:
  the label itself         : 1.0
  a Secondary method (384 rows): 0.5
  an off-set guess         : 0.0
```

## The structured fields, and the input configurations

`structured_fields.csv` carries 25 columns per trial — the same 617 `nct_id` keys, no more and no
fewer. The prompt templates assemble their user block from two groups of them:

- **`B_FIELD_KEYS`** (14): `brief_title`, `phase`, `conditions`, `interventions`, `enrollment`,
  `start_date`, `B1.phase_i_goal`, `B1.endpoint_nature`, `B3.dlt_definition_text`,
  `B3.ctcae_version`, `B3.dlt_assessment_window_days`, `B3.interpatient_interval_days`,
  `B3.interpatient_interval_basis`, `B3.interpatient_safety_floor_days`.
- **`C_LATENT_KEYS`** / **`E_LATENT_KEYS`** (the same 7): `B1.primary_endpoint_type`,
  `B1.multiple_or_continuous_toxicity`, `B1.prior_information_available`, `B1.regimen_modality`,
  `B1.comb_target`, `B1.obd_basis`, `B1.mtd_as_secondary` — the judgements that would otherwise
  require reading the full protocol, handed to the model already resolved.

The configurations are a ladder of how much is given. The run script iterates seven: A.1, A.2,
A.3, B, C, D, E.

| config | user block | system block |
|---|---|---|
| A.1 | four structured fields only — intervention, condition, phase, primary objective | flat 32-method vocabulary |
| A.2 | the registry brief summary, under its own `Registry brief summary:` header | flat vocabulary |
| A.3 | the protocol excerpt only | flat vocabulary |
| B | the 14 structured fields + the protocol excerpt | flat vocabulary |
| C | B + a paragraph introducing the 7 resolved latents, plus `final_ai_ratio`, `m2_gate`, `interval_basis` | flat vocabulary |
| D | B + a **dose-level escalation schedule** extracted from the full protocol | 11-class taxonomy + decision tree + node-answer schema |
| E | B + the latents under a one-line header (not C's paragraph) + the dose-level schedule | same as D |

Three details that the templates in `prompts/` alone will not tell you, all read from
`code/build_prompt.py`'s `build_prompt_v11`, the version the run script uses:

- **D and E append a dose-level schedule** after the template's text. The template files for D
  and E do not show it, and the per-trial schedule file it is read from is not in the release.
  Run upstream's builder without that file and it does not fail: every D and E prompt silently
  gets a fixed "no explicit dose-level table" line instead.
- **`final_ai_ratio`, `m2_gate` and `interval_basis` come from the reference-standard row.**
  The fields table also carries `final_ai_ratio` and `interval_basis` with identical values on all
  617 rows, but `m2_gate` exists only in the reference standard.
- **Those three are left blank when the cell is blank** (195 rows), while the 21 field keys print
  `(not populated)`. The C template's note says a missing `m2_gate` reads `(not populated)`; the
  code is what produced the results.

Every model-visible prompt names the trial by an opaque case id, `CASE_0001` to `CASE_0617`,
numbered over the sorted registry ids. Use the same mapping and the same rule: the registry id
must not appear anywhere a model reads it, because the system prompt forbids identifying the trial
and an id is the one thing that makes identification trivial. The builder below fills the
upstream template files rather than restating them, and refuses any block that contains the
registry id — which matters most when the excerpt is your own registry text.

```python
import csv, re, urllib.request

RAW = "https://raw.githubusercontent.com/hanktang-research/TrialDesignBench/master"
def fetch(path):
    with urllib.request.urlopen(f"{RAW}/{path}", timeout=120) as fh:
        return fh.read().decode("utf-8")
def table(name):
    return {r["nct_id"]: r for r in csv.DictReader(fetch(f"data/{name}").splitlines())}

fields, ref = table("structured_fields.csv"), table("reference_standard.csv")
assert set(fields) == set(ref), "the two tables no longer key the same trials"

# Opaque case ids, derived exactly as upstream does: sorted NCT ids, numbered from 1.
CASE_ID = {nct: f"CASE_{i:04d}" for i, nct in enumerate(sorted(ref), start=1)}

B_KEYS = ["brief_title", "phase", "conditions", "interventions", "enrollment", "start_date",
          "B1.phase_i_goal", "B1.endpoint_nature", "B3.dlt_definition_text", "B3.ctcae_version",
          "B3.dlt_assessment_window_days", "B3.interpatient_interval_days",
          "B3.interpatient_interval_basis", "B3.interpatient_safety_floor_days"]
LATENT_KEYS = ["B1.primary_endpoint_type", "B1.multiple_or_continuous_toxicity",
               "B1.prior_information_available", "B1.regimen_modality", "B1.comb_target",
               "B1.obd_basis", "B1.mtd_as_secondary"]
TEMPLATE_FILE = {"A.3": "A_protocol_narrative", "B": "B_structured_fields",
                 "C": "C_resolved_latents", "D": "D_workflow", "E": "E_workflow_plus_latents"}
TEMPLATE = {c: re.search(r"```\n(.*?)\n```", fetch(f"prompts/{f}.md"), re.S).group(1)
            for c, f in TEMPLATE_FILE.items()}

def lines(row, keys):
    return "\n".join(f"- {k}: {row[k] or '(not populated)'}" for k in keys)

def user_block(nct_id, config, excerpt, dose_schedule=None):
    """The user half of one configuration's prompt. `excerpt` (and, for D/E, `dose_schedule`)
    are yours to supply; the release ships neither."""
    row, rs = fields[nct_id], ref[nct_id]
    if config == "A.2":                       # the registry brief summary, under its own header
        text = f"Case ID: {CASE_ID[nct_id]}\n\nRegistry brief summary:\n{excerpt}"
    else:
        out = []
        for line in TEMPLATE[config].split("\n"):
            if line.startswith("{B_FIELD_KEYS"):
                out.append(lines(row, B_KEYS))
            elif line.startswith(("{C_LATENT_KEYS", "{E_LATENT_KEYS")):
                out.append(lines(row, LATENT_KEYS))
            else:
                out.append(line)
        # Upstream reads these three from the reference-standard row and leaves a blank cell blank.
        text = ("\n".join(out).replace("{pseudo_id}", CASE_ID[nct_id])
                .replace("{final_ai_ratio}", rs["ai_ratio"])
                .replace("{m2_gate}", rs["m2_gate"])
                .replace("{interval_basis}", rs["interval_basis"])
                .replace("{protocol_excerpt}", excerpt))
        if config in ("D", "E"):
            if dose_schedule is None:
                raise ValueError("D and E need the dose-level schedule; the release does not ship it")
            text += ("\n\nDose-level escalation schedule (extracted from the full trial protocol):\n"
                     + dose_schedule)
    if nct_id in text:
        raise ValueError(f"the registry id leaked into a model-visible string for {CASE_ID[nct_id]}")
    return text

nct = sorted(ref)[0]
print(f"case ids                : {len(CASE_ID)} ({min(CASE_ID.values())} .. {max(CASE_ID.values())})")
print(f"B / latent keys present : {sum(k in fields[nct] for k in B_KEYS)}/14, "
      f"{sum(k in fields[nct] for k in LATENT_KEYS)}/7")
for config in ("A.2", "A.3", "B", "C", "D", "E"):
    block = user_block(nct, config, "EXCERPT", dose_schedule="SCHEDULE")
    print(f"config {config:<3} lines       : {len(block.splitlines())}")
print(user_block(nct, "C", "EXCERPT").splitlines()[0])
```

```
case ids                : 617 (CASE_0001 .. CASE_0617)
B / latent keys present : 14/14, 7/7
config A.2 lines       : 4
config A.3 lines       : 4
config B   lines       : 20
config C   lines       : 32
config D   lines       : 23
config E   lines       : 35
Case ID: CASE_0001
```

This builder was checked against a transcription of upstream's own `build_prompt_v11` user
strings across all 617 trials and the six configurations it covers, with placeholder excerpt and
schedule text: 3,702 blocks, no differences.

## What the release does not contain

Two inputs are drawn from documents the authors did not own and are **not redistributed**:

- **The protocol excerpt** — background, rationale and objectives from each trial's posted
  protocol or linked publication — used by A.3 and B through E. The A.2 brief summary is not
  shipped either.
- **The dose-level schedule** that D and E append, extracted from the full protocol.

This is not a gap you can shrug off. Without them, no configuration that uses them can be
reproduced from this release alone — the templates tell you exactly where the text goes, and the
text is not there. The registry record is retrievable per trial using the `nct_id`, which every
row carries, and the `clinicaltrials-gov` skill covers that API in full. The block below fetches
the three registry sections closest to what the excerpt covers — brief summary, detailed
description, primary outcome measures — and assembles both an A.2 input and a registry stand-in
for the excerpt.

```python
import json, urllib.request

NCT = "NCT00002663"
FIELDS = "BriefSummary,DetailedDescription,PrimaryOutcome"
url = f"https://clinicaltrials.gov/api/v2/studies/{NCT}?fields={FIELDS}"
try:
    with urllib.request.urlopen(url, timeout=60) as fh:
        study = json.load(fh)
except urllib.error.HTTPError as exc:          # 400 = a bad field name; 404 = no such record
    raise SystemExit(f"registry refused the request for {NCT}: HTTP {exc.code} {exc.read()[:200]!r}")
except urllib.error.URLError as exc:           # DNS, proxy or firewall: no route at all
    raise SystemExit(f"registry unreachable from this host: {exc.reason}")

proto = study.get("protocolSection", {})
desc = proto.get("descriptionModule", {})
brief = desc.get("briefSummary", "")
detailed = desc.get("detailedDescription", "")
outcomes = "\n".join(f"- {o.get('measure', '')}" for o in
                     proto.get("outcomesModule", {}).get("primaryOutcomes", []))

a2_text = brief                                 # configuration A.2: the brief summary, alone
stand_in = "\n\n".join(p for p in (brief, detailed,
                                   outcomes and f"Primary outcome measures:\n{outcomes}") if p)
print(f"brief summary characters    : {len(brief)}")
print(f"detailed description chars  : {len(detailed)}")
print(f"primary outcome measures    : {len(proto.get('outcomesModule', {}).get('primaryOutcomes', []))}")
print(f"A.2 text / stand-in chars   : {len(a2_text)} / {len(stand_in)}")
print(f"registry id inside the text : {NCT in stand_in}")
```

```
brief summary characters    : 211
detailed description chars  : 0
primary outcome measures    : 1
A.2 text / stand-in chars   : 211 / 270
registry id inside the text : False
```

Observed 2026-11-14; registry records are edited, so the counts can move. Keep the two error
paths apart: an HTTP status means the registry answered and refused the request — a mistyped
field name returns 400, not an outage — while a URL error means there is no route from your host.

The brief summary is exactly what A.2 uses. The stand-in is not the authors' protocol excerpt —
many records, like this one, carry no detailed description at all — so numbers produced with it are
a registry-text variant of A.3 through E. Say so when you report them, rather than presenting them
as the benchmark's configurations. Pass either text through `user_block`, which rejects it if the
registry id appears inside.

## Running the full evaluation matrix

**This is the one route that needs something you have to obtain**: your own model-serving
credentials, for whichever models you are scoring. There is no hosted endpoint here and the
authors do not provide one. Everything above this section needs nothing.

The upstream repository ships the harness under MIT, eleven Python modules in `code/`, and the
division is worth knowing before you plan an afternoon around it:

- **Self-contained against the shipped data (3):** `tree_walker.py` (the decision tree and the
  mechanical walker), `normalize.py` (method-name normalisation), `model_config.py` (the model roster).
- **Call a model-serving layer and need your credentials (2):** `runner.py` and
  `run_full_matrix.py`, which drives every model × configuration × trial.
- **Aggregation (1):** `full_report_v10.py` turns the run's outputs into the metrics above. It needs
  the outputs of a run you have made, and scikit-learn.
- **Construction, for transparency (5):** `reroute_v9.py`, `late_onset_rule_v9.py`,
  `apply_combination_node_correction.py`, `build_reference_standard.py` and `build_prompt.py`.
  They reference intermediate working files that are not in the release, so they do not run
  standalone. Together their outputs are `reference_standard.csv` and the `prompts/` templates;
  `structured_fields.csv` is an input to them, not an output.

So the honest plan is: take the templates, supply your own excerpt and schedule text, call your
own models, and score the way upstream does. The walker is worth reading before you re-implement
the tree.

### A discrepancy in the D/E taxonomy, worth knowing before you score classes

The class taxonomy given to models in configurations D and E lists **eleven** classes and states
that it matches the tree's leaves exactly. It does not. The tree has ten nodes and ten leaves, one
per numbered class from 1 to 10, plus an out-of-scope exit. **Class 11** — a catch-all for seven
Phase-I designs the tree never routes to (TPI, mTPI, mTPI-2, TEQR, Rolling-6, Storer two-stage and
accelerated titration) — is in the taxonomy and in no leaf. Those seven methods are exactly the
difference between the 32-method flat vocabulary of A to C and the 25 methods the leaves contain.

What that means in practice:

- **No D or E class can be Class 11.** The D/E response schema has no class field — the class is
  whatever leaf the node answers reach, so the walk cannot produce Class 11. The taxonomy text
  still asks the model for top classes, which the schema then gives it nowhere to put.
- **A Class-11 method can still be a top-1 answer** — freely in A to C, from the flat vocabulary,
  and in D or E whenever a model ignores the instruction to choose among its leaf's methods. It
  scores wrong on exact match, and it never gets class credit, because `CLASS_MAP` has no entry
  for any of the seven.
- **Nothing in the reference standard is labelled with a Class-11 method**, so the discrepancy
  never changes what the right answer is — only how a wrong one is counted.

## Try it

**Data.** `reference_standard.csv` and `structured_fields.csv` from TrialDesignBench
(`hanktang-research/TrialDesignBench`, branch `master`), CC BY 4.0, no authentication. Last
confirmed reachable 2026-11-14.

**Run.**

```python
import collections, csv, urllib.request

BASE = "https://raw.githubusercontent.com/hanktang-research/TrialDesignBench/master/data"
def table(name):
    with urllib.request.urlopen(f"{BASE}/{name}", timeout=120) as fh:
        return list(csv.DictReader(fh.read().decode("utf-8").splitlines()))

ref, fields = table("reference_standard.csv"), table("structured_fields.csv")
by_id = {r["nct_id"]: r for r in ref}
fld = {r["nct_id"]: r for r in fields}

REF_COLS = {"nct_id", "status", "label_primary", "admissible_set", "ranked_tiers", "ai_ratio",
            "swing_case", "interval_basis", "late_onset_tier", "m2_gate", "tree_path", "note"}
assert set(ref[0]) == REF_COLS, "reference-standard schema changed — recheck the column table"
assert len(fields[0]) == 25, f"structured-fields width moved: {len(fields[0])}"
assert set(by_id) == set(fld), "the two tables no longer key the same trials"
assert all(r["nct_id"].startswith("NCT") and r["nct_id"][3:].isdigit() for r in ref), "bad NCT id"

labelled = [r for r in ref if r["status"] == "leaf"]
oos = [r for r in ref if r["status"] == "out_of_scope"]
assert len(labelled) + len(oos) == len(ref), "a third status value appeared"
assert all(r["label_primary"] for r in labelled), "a labelled row has no label"
assert all(not r["label_primary"] for r in oos), "an out-of-scope row carries a label"
assert all(not r["admissible_set"] and not r["ranked_tiers"] for r in oos), \
    "an out-of-scope row carries an admissible set"

def tiers_of(row):
    return dict(e.partition(":")[::2] for e in row["ranked_tiers"].split("|"))

assert all(set(tiers_of(r)) == set(r["admissible_set"].split("|")) for r in labelled), \
    "admissible_set and ranked_tiers no longer list the same methods"
assert all(sum(t == "Primary" for t in tiers_of(r).values()) == 1 for r in labelled), \
    "a labelled row does not have exactly one Primary tier"

# The three post-walk corrections. Each is a real, documented divergence: if a group empties,
# the release has been rebuilt and the scoring guidance on this page needs re-deriving.
relabel = [r for r in labelled
           if tiers_of(r).get(r["label_primary"]) != "Primary" and r["label_primary"] == "3+3"]
comb = [r for r in labelled if "mtd_comb_target=Single MTD" in r["tree_path"]
        and r["label_primary"] not in ("BOIN Comb", "Keyboard Comb")]
reaudit = [r for r in oos if not r["tree_path"].endswith("Out of scope")]
ids = [{r["nct_id"] for r in g} for g in (relabel, comb, reaudit)]
assert not (ids[0] & ids[1] or ids[0] & ids[2] or ids[1] & ids[2]), "correction groups overlap"
assert all(r["label_primary"] not in r["admissible_set"].split("|") for r in comb), \
    "the combination correction no longer leaves the label outside the admissible set"

levels = {r["nct_id"]: fld[r["nct_id"]]["B3.dose_levels_count"] for r in relabel}
assert all(v.isdigit() and int(v) < 3 for v in levels.values()), \
    f"a 3+3 relabel without fewer than three dose levels: {sorted(set(levels.values()))}"

print(f"trials / labelled / out of scope : {len(ref)} / {len(labelled)} / {len(oos)}")
print(f"corrections  relabel/comb/scope  : {len(relabel)} / {len(comb)} / {len(reaudit)}")
print(f"walk disagrees with the label on : {len(relabel) + len(comb) + len(reaudit)} trials")
print(f"commonest label                  : "
      f"{collections.Counter(r['label_primary'] for r in labelled).most_common(1)[0]}")
print(f"terminal walk nodes              : "
      f"{dict(sorted(collections.Counter(r['tree_path'].split(' -> ')[-1].split('=')[0] for r in ref).items()))}")
print("all assertions passed")
```

**Expect.**

Invariants — these hold however the release is revised, and a failure means this page is wrong
rather than that upstream moved:

- Both tables key **exactly the same** 617 `nct_id` values, and the reference standard carries
  those twelve columns.
- `status` takes two values. A `leaf` row has a label; an `out_of_scope` row has none, and no
  admissible set either.
- `admissible_set` and `ranked_tiers` always list the same methods, with exactly one `Primary`.
- **The three correction groups are non-empty and disjoint**, the combination group's label is
  never inside its own admissible set, and every `3+3` relabel has fewer than three prespecified
  dose levels. These are the whole reason to score on `label_primary`; if one empties, re-derive
  the guidance rather than deleting the assertion.

Observed 2026-11-14 against `master` at commit `e587b1f` — these move if the benchmark is
revised, so treat a mismatch as drift to investigate:

```
trials / labelled / out of scope : 617 / 475 / 142
corrections  relabel/comb/scope  : 59 / 31 / 4
walk disagrees with the label on : 94 trials
commonest label                  : ('BOIN', 366)
terminal walk nodes              : {'dose_finding_gate': 138, 'mtd_comb_target': 51, 'mtd_late_onset': 422, 'obd_late_onset': 2, 'obd_utility': 4}
all assertions passed
```

## Sources

- TrialDesignBench — Tang, Yang, Xin, Shang, Chen, Yuan, Lian and Long, *TrialDesignBench —
  Benchmarking Language Models for Phase-I Trial Design Against Clinical Knowledge*, NeurIPS 2026
  Workshop on World Models for High-Stakes Health (non-archival). doi:10.48550/arXiv.2611.12640
- Repository — https://github.com/hanktang-research/TrialDesignBench (code MIT; `data/` and
  `prompts/` CC BY 4.0)
- Trial population and registry-derived fields are drawn from the public Aggregate Analysis of
  ClinicalTrials.gov database — Tasneem et al., doi:10.1371/journal.pone.0033677
