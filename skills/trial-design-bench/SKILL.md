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
  date: 2026-11-12
  against: TrialDesignBench master commit e587b1f / Python 3.11.18 / standard library only
  executed: 6
  unverified: 1
  unverified_reason: The protocol-excerpt retrieval block needs the public trial registry API, which the validating environment had no route to — its error path fired and was checked, its success path was not. Everything else runs against the two shipped tables. Re-run that one block from a host that can reach the registry.
---
# TrialDesignBench

**617 Phase-I and Phase-I/II oncology dose-finding trials, each carrying a reference-standard
design label that a panel validated** — plus the admissible design set, the ranked alternatives,
and the decision-tree path that produced the label.

It was built to score language models on design-method selection, and that is one use. The other
is simpler and needs no model at all: it is the only public table of real Phase-I trials paired
with a defensible answer to *which dose-finding design this trial should have used*. This skill
reads it, scores a proposed design against it, and tells you where the table's own columns
disagree with each other — which they do, on 94 of the 617 trials, for reasons that matter.

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
since it is `Primary` on 385 of 475 rows — silently mis-scores every one of them.

```python
import csv, urllib.request

BASE = "https://raw.githubusercontent.com/hanktang-research/TrialDesignBench/master/data"
def table(name):
    with urllib.request.urlopen(f"{BASE}/{name}", timeout=120) as fh:
        return list(csv.DictReader(fh.read().decode("utf-8").splitlines()))

ref = {r["nct_id"]: r for r in table("reference_standard.csv")}

def primary_tier(row):
    """The method the rule walk ranked Primary. NOT the reference standard."""
    for entry in row["ranked_tiers"].split("|"):
        method, _, tier = entry.partition(":")
        if tier == "Primary":
            return method
    return None

def score(nct_id, proposed):
    """Grade one proposal. Returns (verdict, tier) with tier None when not admissible."""
    row = ref[nct_id]
    if row["status"] == "out_of_scope":
        return ("correct" if proposed == "OUT_OF_SCOPE" else "wrong-scope"), None
    if proposed == "OUT_OF_SCOPE":
        return "wrong-scope", None
    tiers = dict(e.partition(":")[::2] for e in row["ranked_tiers"].split("|"))
    verdict = "correct" if proposed == row["label_primary"] else "wrong"
    return verdict, tiers.get(proposed)

# A corrected row: the label is 3+3, the walk still ranks BOIN Primary.
nct = "NCT00514046"
print(f"{nct} label      : {ref[nct]['label_primary']}")
print(f"{nct} Primary    : {primary_tier(ref[nct])}")
print("  proposing 3+3  :", score(nct, "3+3"))
print("  proposing BOIN :", score(nct, "BOIN"))

divergent = sum(
    1 for r in ref.values()
    if (r["status"] == "leaf" and primary_tier(r) != r["label_primary"])
    or (r["status"] == "out_of_scope" and not r["tree_path"].endswith("Out of scope"))
)
print(f"rows where the walk disagrees with the label: {divergent}")
```

```
NCT00514046 label      : 3+3
NCT00514046 Primary    : BOIN
  proposing 3+3  : ('correct', 'Acceptable')
  proposing BOIN : ('wrong', 'Primary')
rows where the walk disagrees with the label: 94
```

Note what the tier adds on that row: the correct answer sits at `Acceptable` and the wrong one at
`Primary`. The tier is a statement about the rule walk's ranking, and it is worth reporting — but
it is not partial credit toward the label, and nothing reads it as agreement.

## Tiers, and partial credit that means something

For the 385 trials where the walk and the label agree, the tiers are a graded scale: how far from
the standard a near-miss fell. Use them for top-3 credit and for a deviation measure, and exclude
the 90 corrected rows from any tier-based statistic rather than letting them score strangely.

```python
import collections, csv, urllib.request

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

# Top-3 credit, worked on the tier-consistent rows only.
def top3_credit(row, proposals):
    tiers = tiers_of(row)
    hits = [p for p in proposals if p == row["label_primary"]]
    if hits:
        return 1.0
    best = min((RANK[tiers[p]] for p in proposals if p in tiers), default=None)
    return {1: 0.5, 2: 0.25}.get(best, 0.0)

row = clean[0]
print(f"worked row                 : {row['nct_id']} -> {row['label_primary']}")
print("  exact                    :", top3_credit(row, [row["label_primary"]]))
print("  secondary near-miss      :",
      top3_credit(row, [p for p, t in tiers_of(row).items() if t == "Secondary"][:1]))
print("  off-set guess            :", top3_credit(row, ["Waterfall"]))
```

```
labelled / tier-consistent : 475 / 385
admissible-set sizes       : {1: 1, 2: 56, 3: 23, 7: 395}
tier counts                : {'Primary': 475, 'Secondary': 1287, 'Acceptable': 1185}
worked row                 : NCT00002663 -> BOIN
  exact                    : 1.0
  secondary near-miss      : 0.5
  off-set guess            : 0.0
```

## The structured fields, and the five input configurations

`structured_fields.csv` carries 25 columns per trial — the same 617 `nct_id` keys, no more and no
fewer. The prompt templates assemble their user block from exactly two groups of them:

- **`B_FIELD_KEYS`** (14): `brief_title`, `phase`, `conditions`, `interventions`, `enrollment`,
  `start_date`, `B1.phase_i_goal`, `B1.endpoint_nature`, `B3.dlt_definition_text`,
  `B3.ctcae_version`, `B3.dlt_assessment_window_days`, `B3.interpatient_interval_days`,
  `B3.interpatient_interval_basis`, `B3.interpatient_safety_floor_days`.
- **`C_LATENT_KEYS`** (7): `B1.primary_endpoint_type`, `B1.multiple_or_continuous_toxicity`,
  `B1.prior_information_available`, `B1.regimen_modality`, `B1.comb_target`, `B1.obd_basis`,
  `B1.mtd_as_secondary` — the judgements that would otherwise require reading the full protocol,
  handed to the model already resolved.

The five configurations are a ladder of how much is given:

| config | user block | system block |
|---|---|---|
| A | protocol excerpt only | flat 32-method vocabulary |
| B | A + the 14 structured fields | flat vocabulary |
| C | B + the 7 resolved latents, plus `final_ai_ratio`, `m2_gate`, `interval_basis` | flat vocabulary |
| D | same user block as B | 11-class taxonomy + decision tree + node-answer schema |
| E | same user block as C | same as D |

C and E read `final_ai_ratio` and `interval_basis` from the **reference-standard** row
(`ai_ratio`, `interval_basis`), not from the fields table. That join is easy to miss and silently
produces a C prompt that is really a B prompt.

```python
import csv, urllib.request

BASE = "https://raw.githubusercontent.com/hanktang-research/TrialDesignBench/master/data"
def table(name):
    with urllib.request.urlopen(f"{BASE}/{name}", timeout=120) as fh:
        return {r["nct_id"]: r for r in csv.DictReader(fh.read().decode("utf-8").splitlines())}

fields, ref = table("structured_fields.csv"), table("reference_standard.csv")
assert set(fields) == set(ref), "the two tables no longer key the same trials"

B_KEYS = ["brief_title", "phase", "conditions", "interventions", "enrollment", "start_date",
          "B1.phase_i_goal", "B1.endpoint_nature", "B3.dlt_definition_text", "B3.ctcae_version",
          "B3.dlt_assessment_window_days", "B3.interpatient_interval_days",
          "B3.interpatient_interval_basis", "B3.interpatient_safety_floor_days"]
C_KEYS = ["B1.primary_endpoint_type", "B1.multiple_or_continuous_toxicity",
          "B1.prior_information_available", "B1.regimen_modality", "B1.comb_target",
          "B1.obd_basis", "B1.mtd_as_secondary"]

def lines(row, keys):
    return "\n".join(f"- {k}: {row[k] or '(not populated)'}" for k in keys)

def user_block(nct_id, config, protocol_excerpt):
    """Build the user half of a configuration prompt. `protocol_excerpt` is yours to supply."""
    row, rs = fields[nct_id], ref[nct_id]
    parts = [f"Case ID: {nct_id}", ""]
    if config != "A":
        parts += ["Trial characteristics:", lines(row, B_KEYS), ""]
    parts += ["Protocol excerpt (background, rationale, objectives):", protocol_excerpt]
    if config in ("C", "E"):
        parts += ["", "Latent trial characteristics (resolved for you):", lines(row, C_KEYS),
                  f"- final_ai_ratio: {rs['ai_ratio'] or '(not populated)'}",
                  f"- m2_gate: {rs['m2_gate'] or '(not populated)'}",
                  f"- interval_basis: {rs['interval_basis'] or '(not populated)'}"]
    return "\n".join(parts)

nct = "NCT00002663"
print(f"columns in fields table : {len(fields[nct])}")
print(f"B keys present          : {sum(k in fields[nct] for k in B_KEYS)}/14")
print(f"C keys present          : {sum(k in fields[nct] for k in C_KEYS)}/7")
block = user_block(nct, "C", "<protocol excerpt not redistributed — see below>")
print(f"config C block lines    : {len(block.splitlines())}")
print(block.splitlines()[-3])
```

```
columns in fields table : 25
B keys present          : 14/14
C keys present          : 7/7
config C block lines    : 32
- final_ai_ratio: 0.45-0.45
```

## The one thing the release does not contain

Every configuration substitutes a **protocol excerpt** — background, rationale and objectives
drawn from each trial's own posted protocol, registry summary or linked publication. That text is **not
redistributed**. It is prose lifted out of documents the authors did not own, rather than a value
they extracted, so it was never theirs to pass on.

This is not a gap you can shrug off. Without it, configurations A through E cannot be reproduced
from this release alone — the templates tell you exactly where the text goes, and the text is
not there. It is retrievable per trial from the public registry using the `nct_id`, which every
row carries, and the `clinicaltrials-gov` skill covers that API in full. The block below fetches
the three narrative sections the excerpt is drawn from for one trial.

```python
import json, urllib.request

NCT = "NCT00002663"
FIELDS = "BriefSummary,DetailedDescription,PrimaryOutcomes"
url = f"https://clinicaltrials.gov/api/v2/studies/{NCT}?fields={FIELDS}"
try:
    with urllib.request.urlopen(url, timeout=60) as fh:
        study = json.load(fh)
except Exception as exc:                      # no registry route, or the record moved
    raise SystemExit(f"registry unreachable or record absent for {NCT}: {exc}")

desc = study.get("protocolSection", {}).get("descriptionModule", {})
excerpt = "\n\n".join(p for p in (desc.get("briefSummary"), desc.get("detailedDescription")) if p)
print(f"{NCT} excerpt characters: {len(excerpt)}")
print(excerpt[:300] if excerpt else "no narrative text posted for this record")
```

What comes back is the registry's own summary, which is not identical to the protocol-document
excerpt the authors used. Treat a reconstruction as configuration A.2 — a registry-summary
variant — and say so when you report numbers, rather than claiming A.3.

## Running the full evaluation matrix

**This is the one route that needs something you have to obtain**: your own model-serving
credentials, for whichever models you are scoring. There is no hosted endpoint here and the
authors do not provide one. Everything above this section needs nothing.

The upstream repository ships the harness for it under MIT, and the division is worth knowing
before you plan an afternoon around it. Three modules are self-contained against the shipped
data — the decision-tree walker, the method-name normaliser, and the model roster. Two call a
serving layer and need your credentials. The remaining five construction scripts are published
for algorithmic transparency and **reference intermediate working files that are not in the
release**, so they do not run standalone. Their outputs are the two CSVs you already have.

So the honest plan is: take the templates, substitute your own excerpt text, call your own
models, and score with the rules on this page. The walker is worth reading before you
re-implement the tree.

### A discrepancy in the D/E taxonomy, worth knowing before you score classes

The class taxonomy given to models in configurations D and E lists **eleven** classes and states
that it corresponds exactly to the leaves of the decision tree. It does not. The tree has ten
nodes and reaches ten numbered classes plus `OUT_OF_SCOPE`; **Class 11** — "other Phase I designs
not covered above", holding TPI, mTPI, mTPI-2, TEQR, Rolling-6, Storer two-stage and accelerated
titration — is in the taxonomy but is **not reachable as a leaf**. Those same seven methods are
the exact difference between the 32-method flat vocabulary used in A/B/C and the 25 methods the
tree's leaves contain.

Nothing in the shipped reference standard is labelled Class 11, so it does not affect scoring
against `label_primary`. It does affect you if you score a model's *class* answer by walking its
node answers: a model that answers Class 11 has given an answer the tree cannot produce, and your
scorer needs a branch for it rather than an exception.

## Try it

**Data.** `reference_standard.csv` and `structured_fields.csv` from TrialDesignBench
(`hanktang-research/TrialDesignBench`, branch `master`), CC BY 4.0, no authentication. Last
confirmed reachable 2026-11-12.

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

Observed 2026-11-12 against `master` at commit `e587b1f` — these move if the benchmark is
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
