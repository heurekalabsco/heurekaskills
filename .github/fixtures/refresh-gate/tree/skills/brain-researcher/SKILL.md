---
name: brain-researcher
description: Audit your own neuroimaging analysis with Brain Researcher — seal a commitment before you look, grade the evidence, bound the claim by how it survived pipeline variation, and re-hash the record afterwards. Covers the 10 versioned MCP contracts, the 1,693-dataset access catalogue, and the pinned open-data path. The BR-KG graph itself is private and is not shipped.
category: analysis
license: MIT
author: Brain Researcher Team (adapted by Heureka Labs)
attribution: https://github.com/brain-researcher/brain-researcher-public
version: 1.0.0
tags: [neuroimaging, provenance, agents, evidence-appraisal, controlled-access]
covers: [neuroimaging, fmri, mri, eeg, meg, ieeg, dwi, pet, bids, openneuro, neurosynth, nimare, nilearn, fmriprep, mriqc, fitlins, freesurfer, neurodesk, coordinate meta-analysis, multiverse analysis, specification curve, preregistration, claim record, provenance, reproducibility, model context protocol, mcp server, knowledge graph, hcp, cognitive atlas]
papers: [doi:10.48550/arXiv.2608.19902, doi:10.5281/zenodo.21966011, doi:10.1038/s41592-025-02704-4]
access: [open, controlled]
datasets: [https://raw.githubusercontent.com/neurosynth/neurosynth-data/209c33cd009d0b069398a802198b41b9c488b9b7/data-neurosynth_version-7_coordinates.tsv.gz, https://raw.githubusercontent.com/neurosynth/neurosynth-data/209c33cd009d0b069398a802198b41b9c488b9b7/data-neurosynth_version-7_metadata.tsv.gz, https://raw.githubusercontent.com/neurosynth/neurosynth-data/209c33cd009d0b069398a802198b41b9c488b9b7/data-neurosynth_version-7_vocab-terms_source-abstract_type-tfidf_features.npz, https://raw.githubusercontent.com/neurosynth/neurosynth-data/209c33cd009d0b069398a802198b41b9c488b9b7/data-neurosynth_version-7_vocab-terms_vocabulary.txt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-29
  against: brain-researcher-public v0.3.0 at commit 451b25a, MCP contract epoch 2026-05-27, MCP server build 1.29.1, toolset_hash 677290ac / clean venv on CPython 3.11.14 (the package pins >=3.11,<3.12) and stdlib-only checks on CPython 3.12.8 / all four reproducibility packs re-hashed, plus a deliberate one-byte tamper that flipped a pack to exit 1 / the claim record regenerated end to end on the NiMARE backend from the public corpus / 10 stable tool contracts parsed against the 87 tools a local server actually exposes / the multiverse ceiling reimplementation matched the shipped one on 8 profiles / 1,693 catalogue rows counted and tiered / the pinned Neurosynth v7 bundle fetched cold and matched on byte size and SHA-256 / hosted endpoint probed anonymously and with a bad token / arXiv 2608.19902 abstract and both HCP-YA data-use tiers read 2026-08-29 / curl 8.7.1
  executed: 16
  unverified: 2
  unverified_reason: >-
    The Docker Compose stack will not start without an LLM provider API key, which the
    validating environment does not hold, and the A1 headline rerun downloads roughly
    835 MB for about 1.0 GB extracted, over its disk budget. Re-run both on a host with one
    provider key and 2 GB free. No BR-KG query is documented here because the compiled graph
    is private and no reader can obtain it.
---
# Brain Researcher — recording and auditing your own neuroimaging claim

Brain Researcher is a workspace for AI-assisted neuroimaging that treats an analysis
result as something that has to earn the word *finding*. You seal what you are claiming
and what would sink it **before** you look; you grade the evidence against a named bar;
you bound the claim by how the effect survived across pipeline variants; and you finish
with a JSON record another person can re-hash without your machine, your data or your
agent.

**This documents recording and auditing your own analysis, not appraising someone
else's.** A published-evidence appraisal — GRADE, Cochrane risk of bias, reading a
methods section — works backwards from a paper that already exists. Everything here works
forwards from an analysis you are about to run, and its output is an artifact, not a
judgement. The registry's `scientific-critical-thinking` covers the backwards direction.

Two things to settle before reading further, because both are stated by the project
itself and both are routinely misread.

**The compiled knowledge graph is private.** The repository ships the BR-KG service code,
the Cypher schema and the KG configs; it does not ship the graph. From its own README:

> The compiled BR-KG graph, Neo4j dumps, and internal graph-derived datasets are private
> and are not attached to GitHub Releases.

First boot brings up an empty Neo4j. There is no deposit anywhere that fills it — every
Brain Researcher record on Zenodo is a code archive. Nothing below promises graph
contents, and a skill that did would be promising something no reader can get.

**The thresholds are not calibrated, and the project says so.** The multiverse module's
own docstring describes its constants as

> CONVENTIONS that must be calibrated against NARPS/HCP-style ground truth […] before they
> are load-bearing.

So read this system as asserting a **governance discipline** — commit before you observe,
name the bar with the number, let the weakest axis set the ceiling — and not as offering
statistical guarantees. That distinction is the honest framing, and it is the project's
own.

## What the published numbers are, and which ones to quote

The preprint (arXiv 2608.19902, submitted 20 Aug 2026, read 2026-08-29) reports
first-choice tool-selection accuracy across seven foundation models rising from **23.3%
without the harness to 93.6% with it**, a gain of 70.2 percentage points, and verifiable
grounding rising **from 4.6% to 22.0%**.

`CITATION.cff` in the repository tells a different story for the same system — "from 51%
to 63% at baseline to about 93%", and grounding improved "nearly sixfold". The two have
not been reconciled upstream. **Quote the arXiv figures and date them**, because that is
the peer-facing artifact; if you cite the software abstract instead, say which one you
used.

Both numbers describe benchmark tool selection. Neither is a claim about scientific
accuracy, and neither transfers to your dataset.

## The access boundary

Several different things get called "access" here and they are not the same gate.

| what | route | what it costs you |
|---|---|---|
| Code, contracts, docs, reproducibility packs | public clone, MIT | nothing |
| Neurosynth v7, OpenNeuro, NeuroVault, Cognitive Atlas, PMC OA | open download | nothing |
| Hosted MCP endpoint | ordinary self-serve sign-up, one personal token | an account, no approval |
| Local MCP server | run it yourself | nothing — no account at all |
| HCP-YA (the deeper A1 rerun) | data-use agreement | see *Requesting access* |
| BR-KG graph contents | none — private | not obtainable |

The main path — verify the packs, read the claim records, query the dataset catalogue,
fetch the pinned open corpus — needs no account, no agreement and no key. HCP-YA is the
only data-use-agreement dependency the tooling actually has, and it sits on an optional
deeper branch. ABCD, UK Biobank, ADNI and the rest appear as catalogue rows and named
future replication targets; no downloader in the repository targets them.

One disclosure on the local stack: the Compose file pins `neo4j:5.20`, which is Neo4j
Community under GPL-3.0. You run that image; you do not redistribute it, so it constrains
nothing you publish. `redis:7-alpine` and `alpine:3.20` are the other two images.

## Get the code, and check what is actually in it

The clone is about 226 MB. `verify.py` uses only the standard library, so this first step
needs no install and no Brain Researcher environment.

```bash
git clone --depth 1 https://github.com/brain-researcher/brain-researcher-public.git
cd brain-researcher-public
python3 reproducibility/verify.py --all
```

```
{
  "verification_schema_version": "br.reproducibility_verification.v2",
  "mode": "all_manifest_packs",
  "n_packs": 4,
  "summary": {
    "verified": 3,
    "incomplete": 1,
    "failed": 0
  },
  "packs": [
    {
      "pack_id": "bounded_autoresearch_a1",
      "status": "verified",
      "exit_code": 0,
      "integrity_verified": true,
      "executed": false,
      "scientifically_reproduced": false
    },
    {
      "pack_id": "fitlins_multiverse_yeo17",
      "status": "incomplete",
      "exit_code": 2,
      "integrity_verified": null,
      "executed": false,
      "scientifically_reproduced": false
    },
    {
      "pack_id": "hcp_workflow_search",
      "status": "verified",
      "exit_code": 0,
      "integrity_verified": true,
      "executed": false,
      "scientifically_reproduced": false
    },
    {
      "pack_id": "tribe_speech_tools",
      "status": "verified",
      "exit_code": 0,
      "integrity_verified": true,
      "executed": false,
      "scientifically_reproduced": false
    }
  ],
  "exit_code": 2
}
```

Note `"executed": false` on every pack, including the three that verified. A clean checksum
result proves the committed bytes are intact; it runs no analysis and claims none.

Three verified, one incomplete, none failed — and the process exits **2**, which is what
the README documents. The incomplete one is deliberate: `fitlins_multiverse_yeo17` ships
two statmap entries as `schema_only`, so complete integrity is indeterminate rather than
broken.

### Exit 2 means two different things, and only one of them is fine

This is the trap worth hitting on purpose. Exit 2 is "verification is incomplete or
unavailable" — and a mistyped path produces exactly the same code.

```bash
for pack in bounded_autoresearch_a1 fitlins_multiverse_yeo17 hcp_workflow_search tribe_speech_tools no_such_pack; do
  out=$(python3 reproducibility/verify.py "reproducibility/$pack" 2>&1); code=$?
  case "$out" in '{'*) shape=json ;; *) shape="$(printf '%s' "$out" | head -1)" ;; esac
  printf '%-26s exit=%s  %s\n' "$pack" "$code" "$shape"
done
```

```
bounded_autoresearch_a1    exit=0  json
fitlins_multiverse_yeo17   exit=2  json
hcp_workflow_search        exit=0  json
tribe_speech_tools         exit=0  json
no_such_pack               exit=2  not a directory: reproducibility/no_such_pack
```

**Never branch on the exit code alone.** A real result emits a JSON object on stdout; a
bad path emits one bare line and no JSON. A wrapper that treats exit 2 as "partial, carry
on" will silently swallow a typo and report a pack it never looked at. Exit **1** is the
one that always means trouble — a checksum mismatch or a failed execution — and it takes
precedence over any incompleteness.

The checker is not decorative. Appending a single newline to one shipped CSV in
`hcp_workflow_search` flips it from `exit=0, integrity_verified: true, 11/11 matched` to
`exit=1, integrity_verified: false, 10 matched, 1 mismatched`, naming
`data/matched_outcomes.csv` as the mismatch. One byte.

## The five-level reproduction ladder

This is the most portable idea in the project and it costs nothing to adopt. "Reproducible"
is not a boolean; it is a cumulative ladder, and a pack states which rung it has actually
reached.

| level | what has been shown |
|---|---|
| `inspectable` | the files, the provenance and the stated boundary can be read |
| `integrity_verified` | every required artifact is present and matches its recorded SHA-256 |
| `public_runnable` | a public user can run the documented path from public inputs and compare against recorded tolerances |
| `governed_rerun` | the governed-data or governed-runtime path has been rerun under its recorded contract |
| `fully_reproduced` | the complete declared analysis, governed work and scientific comparison criteria included, has been reproduced |

Each rung carries one of three evidence states — `attained`, `partial`, `not_claimed` —
and the rule that makes the ladder honest is that **`partial` never promotes**. A pack's
`current_level` is the highest `attained` rung with nothing missing beneath it.

```python
import json, pathlib

LEVELS = ["inspectable", "integrity_verified", "public_runnable",
          "governed_rerun", "fully_reproduced"]
MARK = {"attained": "yes", "partial": "partial", "not_claimed": "-"}

print(f"{'pack':<25}" + "".join(f"{l.split('_')[0][:9]:>10}" for l in LEVELS)
      + "   current_level")
for m in sorted(pathlib.Path("reproducibility").glob("*/manifest.json")):
    att = json.loads(m.read_text())["attestation"]
    cells = "".join(f"{MARK[att['levels'][l]['status']]:>10}" for l in LEVELS)
    print(f"{m.parent.name:<25}{cells}   {att['current_level']}")

# The rule the ladder enforces: current_level is the highest ATTAINED rung with no
# gap below it. `partial` is evidence, never a promotion.
for m in sorted(pathlib.Path("reproducibility").glob("*/manifest.json")):
    att = json.loads(m.read_text())["attestation"]
    ok = [l for l in LEVELS if att["levels"][l]["status"] == "attained"]
    expected = ok[-1] if ok and ok == LEVELS[:len(ok)] else None
    print(f"{m.parent.name:<25} no-gap rule holds -> {expected == att['current_level']}")
```

```
pack                      inspectab integrity    public  governed     fully   current_level
bounded_autoresearch_a1         yes       yes       yes   partial         -   public_runnable
fitlins_multiverse_yeo17        yes   partial         -         -         -   inspectable
hcp_workflow_search             yes       yes   partial         -         -   integrity_verified
tribe_speech_tools              yes       yes   partial         -         -   integrity_verified
bounded_autoresearch_a1   no-gap rule holds -> True
fitlins_multiverse_yeo17  no-gap rule holds -> True
hcp_workflow_search       no-gap rule holds -> True
tribe_speech_tools        no-gap rule holds -> True
```

Read that table before quoting any pack. Not one of the four claims `fully_reproduced`,
and only `bounded_autoresearch_a1` is runnable from public inputs.

**`fitlins_multiverse_yeo17` is synthetic and is not a multiverse demonstration.** Its own
README:

> It contains no real BIDS dataset and no NIfTI statmap bytes. It is useful for inspecting
> and testing the pack format; it is not a real scientific result and is not runnable end
> to end as shipped.

Its recorded parameters also predate the current tool signature, so passing them to today's
FitLins tool and calling the output a reproduction would be wrong twice over. Treat it as a
schema exemplar.

## The other vocabulary — what the repository supports

Separate from the reproduction ladder, every public surface carries a support status. The
distinction that matters is that `deployment-specific` is not a maturity level at all — it
means *a public checkout does not imply access*, so nothing you read in the repo tells you
whether it will work for you.

| status | covers | means |
|---|---|---|
| `stable` | the Python package release metadata and the 10 versioned MCP contracts | breaking changes need a contract-epoch bump and a deprecation window |
| `supported-local` | Python 3.11 clean install, the root Compose stack, pack verification, documented public-data reruns | exercised by required CI, except Compose runtime health, which is yours to check |
| `experimental` | Helm and Kubernetes assets, JupyterHub values, research workers | inspect or develop, do not deploy |
| `deployment-specific` | hosted execution, BR-KG contents, governed datasets, cluster profiles | depends on someone's auth, data and credits — not on this checkout |
| `historical` | dated archives, tombstones, old campaign reports | provenance only, not instructions |

## The stable MCP surface is 10 tools, and it pins arguments rather than answers

Brain Researcher exposes its tools over the Model Context Protocol. Ten of them carry a
versioned contract under `contracts/tools/`, at contract epoch `2026-05-27`.

```python
import json, pathlib

epoch = pathlib.Path("contracts/VERSION").read_text().strip()
rows = [json.loads(p.read_text()) for p in sorted(pathlib.Path("contracts/tools").glob("*.json"))]

print(f"contract epoch            {epoch}")
print(f"contracts shipped         {len(rows)}")
print(f"all stability=stable      {all(c['stability'] == 'stable' for c in rows)}")
print(f"all at epoch              {all(c['contract_version'] == epoch for c in rows)}")
print()
print(f"{'tool':<30}{'surface':<10}{'capability family':<22}required arguments")
for c in rows:
    req = ", ".join(c["input_schema"].get("required", [])) or "(none)"
    print(f"{c['name']:<30}{c['surface_tier']:<10}{c['capability_family']:<22}{req}")

# What the stability promise actually covers.
print()
print(f"contracts declaring output properties  "
      f"{sum(1 for c in rows if c['output_schema'].get('properties'))} of {len(rows)}")
print(f"contracts with no worked example       "
      f"{sum(1 for c in rows if not c['examples'])} of {len(rows)}")
```

```
contract epoch            2026-05-27
contracts shipped         10
all stability=stable      True
all at epoch              True

tool                          surface   capability family     required arguments
get_execution_recipe          advanced  execution_recipe      tool_id
grounding_gate_evidence_basis advanced  grounding             (none)
grounding_resolve             advanced  grounding             (none)
pipeline_plan_review          ops       pipeline_execution    plan
pipeline_plan_validate        ops       pipeline_execution    plan
plan_preflight                default   planning              query
run_scorecard                 advanced  run_observability     run_id
scientific_report_generate    ops       scientific_report     (none)
server_info                   ops       server_ops            (none)
tool_search                   default   tool_discovery        query

contracts declaring output properties  0 of 10
contracts with no worked example       5 of 10
```

Three things to take from that.

**Two orthogonal axes.** `surface_tier` answers "should an agent UI show this by default?"
(`default`, `advanced`, `ops`). `stability` answers "can a downstream package depend on this
not breaking?" A tool can be `ops` and `stable` — `server_info` is — or `default` and
experimental. Do not read one axis as the other.

**The promise covers arguments, not answers.** Every one of the ten declares an open output
object with no properties. The argument shape is the contract; the response shape is not.
Parse defensively and assert on the fields you rely on, because a release can add, rename
or drop a response key without breaking the stated contract. `server_info` publishes a
`toolset_hash` for exactly this reason — it changes when the schema does, and adapter
consumers refuse to dispatch across a mismatch.

**Nothing on the stable surface runs an analysis.** `get_execution_recipe` returns a
recipe; `pipeline_plan_validate` explicitly does no execution; `scientific_report_generate`
drafts from an existing run. A recipe is a handoff. If no artifacts exist, nothing executed,
and an agent that reports otherwise is over-claiming.

## The claim record — commitment hash, graded verdicts, claim card

This is the artifact the whole system exists to produce, and the repository ships a worked
one built entirely on public Neurosynth data, so it can be read in full without any account.

Three files, in the order they are written:

- **`commitment_card.json`** — written *before* the first evidence query. It freezes the
  claim text, the rival explanation that must be ruled out, the scope the claim is confined
  to, the success and failure criteria, and the attacks that will be attempted. It is
  hashed.
- **`evidence_verdicts.json`** — one graded verdict per attack, each carrying its own
  statistic, the bar it was judged against, and a `reproducible_query` you can re-run.
- **`claim_card.json`** — written *after* review. Final status, which checks survived,
  which failed, the scope boundary, what further evidence would promote it — and the
  commitment hash, pointing back at the seal.

```python
import json, pathlib

D = pathlib.Path("reproducibility/auditable_claim_record")
commit = json.loads((D / "commitment_card.json").read_text())
card = json.loads((D / "claim_card.json").read_text())
verdicts = json.loads((D / "evidence_verdicts.json").read_text())

print(f"claim         {commit['claim_text'][:78]}")
print(f"sealed at     {commit['locked_at']}")
print(f"rivals named in advance    {commit['allowed_alternatives']}")
print(f"attacks named in advance   {commit['attack_strategies']}")
print(f"seal on commitment card    {commit['commitment_hash'][:16]}")
print(f"seal on claim card         {card['commitment_hash'][:16]}")
print(f"same seal                  {commit['commitment_hash'] == card['commitment_hash']}")
print()

# Every verdict carries the bar it was judged against, so the bar is auditable too.
print(f"{'verdict':<30}{'statistic':>10}{'bar':>6}  status")
for name, v in verdicts.items():
    raw = v["raw"]
    stat = raw.get("lift", raw.get("coactivation_lift", raw.get("lift_specific")))
    print(f"{name:<30}{stat:>10.3f}{raw['lift_bar']:>6.1f}  {v['status']}")

fd, fs = verdicts["forward_default"], verdicts["forward_strict"]
print()
print(f"default and strict read the same number   {fd['raw']['lift'] == fs['raw']['lift']}")
print(f"only the bar moved                        "
      f"{fd['raw']['lift_bar']} -> {fs['raw']['lift_bar']}")
print()
for c in card["survived_checks"]:
    print(f"  survived  {c.split(':')[0]}")
for c in card["failed_checks"]:
    print(f"  FAILED    {c.split(':')[0]}")
print(f"\ncard status   {card['status']}   (the weakest axis, not the average)")
```

```
claim         Working-memory-labeled Neurosynth studies show dlPFC activation and dlPFC-IPS 
sealed at     2026-06-13T14:48:01.826043+00:00
rivals named in advance    ['attention']
attacks named in advance   ['strict_evidence_profile', 'compositional_specificity', 'network_coactivation']
seal on commitment card    4871ea4346e81bc7
seal on claim card         4871ea4346e81bc7
same seal                  True

verdict                        statistic   bar  status
forward_default                    1.633   1.5  supported_within_scope
forward_strict                     1.633   3.0  weakened
network_coactivation               1.564   1.5  supported_within_scope
specificity_excluding_rivals       1.661   1.5  supported_within_scope

default and strict read the same number   True
only the bar moved                        1.5 -> 3.0

  survived  structure-complete
  survived  reasoning_mode=associational (association only — no causal/mechanistic claim)
  survived  neurolang-forward-default
  survived  specificity-not-attention
  survived  network-coactivation-dlpfc-ips
  FAILED    strict-evidence-profile

card status   weakened   (the weakest axis, not the average)
```

**The whole mechanism is in one row of that table.** The lift is 1.633 under both evidence
profiles — identical evidence, identical query. What moves is the bar: 1.5 under the default
profile, 3.0 under the conservative one. Five checks passed and one failed, and the card
records `weakened` rather than averaging or reporting the four wins. The weakest axis sets
the ceiling.

`commitment_hash` covers the claim, the scope, the criteria, the attack strategies, the
SHA-256 of each rubric file, and the evidence engine's name and version. It deliberately
excludes `locked_at`, so the same sealed content hashes the same in two different clones
while a changed rubric or a changed engine changes the hash. That is what makes silent
post-hoc editing of a pre-registered plan detectable rather than merely discouraged.

### The status vocabulary

Seven values, and two of them are not evidential verdicts at all:

| status | meaning |
|---|---|
| `supported_within_scope` | supported, inside the declared scope — not "true" |
| `qualified` | supported with a stated caveat |
| `weakened` | supported but undermined on at least one axis |
| `rejected` | positively refuted — not "insufficient evidence" |
| `unresolved` | adjudicated, and the evidence was insufficient |
| `conflicting` | genuine support *and* genuine contradiction both present |
| `ill_typed` | a **structural** verdict — the plan is type-incoherent, so no evidential verdict was attempted |

`ill_typed` is emitted only by a deterministic typecheck (an EEG dataset fed to an fMRI GLM,
for instance), never by the evidence layer. Keeping the structural and evidential layers
apart is the point: a plan that cannot be evaluated must not be reported as a plan that was
evaluated and found wanting.

You can regenerate this record yourself from the public corpus, with no account and no
agreement — see *Regenerating the claim record*, below, after the install.

## Multiverse survival bounds what the claim may say

A neuroimaging effect that only survives your particular preprocessing choices is not the
same finding as one that survives most of them. This maps a multiverse survival profile onto
a **ceiling** — the strongest status a claim is allowed to reach, whatever else supports it.

The inputs are three numbers from a multiverse run: `active_frac` (fraction of pipeline
variants where the effect clears threshold), `sign_consistency` (the larger of the fractions
positive and negative), and `n_valid` (variants that ran), plus optionally
`effect_size_stability` and an absolute effect size for the underpowered check.

```python
# The published thresholds. The project's own source calls them "CONVENTIONS that must be
# calibrated against NARPS/HCP-style ground truth ... before they are load-bearing", so read
# them as a default worth arguing with, not as a calibrated test.
ROBUST_ACTIVE, ROBUST_SIGN, EFFECT_STABILITY = 0.8, 0.9, 0.7
SENSITIVE_ACTIVE, DIRECTION_SIGN = 0.5, 0.7
MIN_VARIANTS, BWAS_R_CEILING = 5, 0.4

LADDER = ["rejected", "weakened", "qualified", "supported_within_scope"]


def ceiling(active, sign, n_valid, stability=None, effect_r=None):
    """Highest claim status a multiverse survival profile can support."""
    if sign < DIRECTION_SIGN:
        status, why = "weakened", "direction-unstable"
    elif active >= ROBUST_ACTIVE and sign >= ROBUST_SIGN:
        if stability is not None and stability >= EFFECT_STABILITY:
            status, why = "supported_within_scope", "robust"
        else:
            status, why = "qualified", "effect-size-unstable"
    elif active < SENSITIVE_ACTIVE:
        status, why = "weakened", "pipeline-dependent, not robust"
    else:
        status, why = "qualified", "pipeline-sensitive"

    power = []
    if n_valid < MIN_VARIANTS:
        power.append(f"only {n_valid} valid variants")
    if effect_r is not None and effect_r > BWAS_R_CEILING:
        power.append(f"|r| {effect_r} over the BWAS ceiling {BWAS_R_CEILING}")
    if power:
        # Underpowered costs one tier and floors at `weakened`: low power is not refutation.
        status = LADDER[max(LADDER.index("weakened"), LADDER.index(status) - 1)]
        why += "; underpowered — " + "; ".join(power)
    return status, why


CASES = [
    ("survives everywhere",   dict(active=0.92, sign=0.97, n_valid=48, stability=0.81)),
    ("magnitude wobbles",     dict(active=0.92, sign=0.97, n_valid=48, stability=0.40)),
    ("magnitude undefined",   dict(active=0.92, sign=0.97, n_valid=48)),
    ("survives two thirds",   dict(active=0.62, sign=0.95, n_valid=48, stability=0.80)),
    ("survives a minority",   dict(active=0.30, sign=0.95, n_valid=48, stability=0.80)),
    ("sign flips",            dict(active=0.95, sign=0.55, n_valid=48, stability=0.90)),
    ("four variants only",    dict(active=0.92, sign=0.97, n_valid=4,  stability=0.81)),
    ("implausible effect",    dict(active=0.92, sign=0.97, n_valid=48, stability=0.81, effect_r=0.55)),
]
print(f"{'profile':<22}{'ceiling':<24}why")
for name, kw in CASES:
    status, why = ceiling(**kw)
    print(f"{name:<22}{status:<24}{why}")

print()
print("no profile can reach `rejected` ->",
      all(ceiling(**kw)[0] != "rejected" for _, kw in CASES))
```

```
profile               ceiling                 why
survives everywhere   supported_within_scope  robust
magnitude wobbles     qualified               effect-size-unstable
magnitude undefined   qualified               effect-size-unstable
survives two thirds   qualified               pipeline-sensitive
survives a minority   weakened                pipeline-dependent, not robust
sign flips            weakened                direction-unstable
four variants only    qualified               robust; underpowered — only 4 valid variants
implausible effect    qualified               robust; underpowered — |r| 0.55 over the BWAS ceiling 0.4
```

Verbatim agreement with the shipped implementation was checked on all eight profiles on
2026-08-29 — same status, same label. Three rules in there are worth keeping even if you
never touch this codebase:

- **A ceiling can only lower a claim, never raise one.** No survival profile, however clean,
  emits `rejected`, because rejection needs a positive refutation — a falsifier that fired
  — not merely poor survival.
- **Underpowered costs one tier and floors at `weakened`.** Fewer than five valid variants,
  or an implausibly large brain-wide association effect (|r| above 0.4, the Marek 2022
  ceiling), demotes the claim without refuting it. Notice "four variants only" and
  "implausible effect" both keep the label *robust* while dropping a tier: the survival
  profile really was clean, and the demotion is about power, not about survival.
- **Direction instability short-circuits everything.** If the sign flips across pipelines,
  no amount of activation fraction rescues the claim.

If you adopt these numbers, say in your methods that you did and that upstream describes
them as uncalibrated. If you change them, say that too — they are one line each.

## The dataset catalogue and what its access tiers really say

The repository ships a pre-classified catalogue of 1,693 neuroimaging datasets as JSONL, in
the checkout, under MIT, with no API call needed. It is the fastest way to answer *does a
cohort like this exist, in this modality, and what would using it require*.

The catalogue lives in three files: `configs/datasets/catalog.v1.jsonl` is the merged view,
and it is exactly `catalog_openneuro.jsonl` (1,594 rows) plus `catalog_manual.jsonl` (99
rows). Every manual row carries `created_from:
configs/datasets/public_datasets_manual_annotation.csv`, and **that file is not in the public
checkout** — the field records where the annotation came from upstream, not something you can
open. Read the JSONL.

```python
import collections, json, pathlib

rows = [json.loads(l) for l in
        pathlib.Path("configs/datasets/catalog.v1.jsonl").read_text().splitlines() if l.strip()]
print(f"datasets catalogued   {len(rows)}")

tiers = collections.Counter(r["access_type"] for r in rows)
for tier, n in tiers.most_common():
    print(f"  {tier:<14}{n:>6}")

mods = collections.Counter()
for r in rows:
    for m in r.get("modalities") or []:
        mods[m] += 1
print("\nmodalities " + "  ".join(f"{m}={n}" for m, n in mods.most_common(8)))

gated = [r for r in rows if r["access_type"] != "public"]
print(f"\n{len(gated)} rows are not public, and every one is hand-curated: "
      f"{all(r['dataset_id'].startswith('ds:manual:') for r in gated)}")
print(f"{'dataset':<16}{'tier':<14}where it lives")
for r in sorted(gated, key=lambda r: (r["access_type"], r["short_name"] or ""))[:8]:
    print(f"{(r['short_name'] or r['name'])[:15]:<16}{r['access_type']:<14}{r['source_repo']}")

# `access_type: public` is a statement about the door, not about reuse terms.
blank = [r for r in rows if r["access_type"] == "public" and not (r.get("license") or "").strip()]
print(f"\npublic rows with a blank licence field   {len(blank)}")
print(f"distinct licence strings                 "
      f"{len({(r.get('license') or '').strip() for r in rows})}")
print(f"licence strings longer than 40 chars     "
      f"{len([s for s in {(r.get('license') or '').strip() for r in rows} if len(s) > 40])}")
```

```
datasets catalogued   1693
  public          1663
  application       16
  registration      13
  restricted         1

modalities MRI=773  fMRI=638  EEG=165  DWI=91  Behavior=69  MEG=41  iEEG=26  PET=19

30 rows are not public, and every one is hand-curated: True
dataset         tier          where it lives
4RTNI           application   LONI
ADNI            application   LONI
AIBL            application   LONI / project site
ARWIBO          application   ARWIBO site
AllOfUs         application   Researcher Workbench
EDSD            application   project-site / request
IMAGEN          application   project / EGA
NACC            application   NACC portal

public rows with a blank licence field   23
distinct licence strings                 33
licence strings longer than 40 chars     13
```

Four things that will bite a script written against this file:

- **The entire gated tier is the 99-row manual catalogue.** All 30 non-public rows carry a
  `ds:manual:` id. The 1,594 OpenNeuro rows are public by construction. So "is it gated?"
  is answered by which file a row came from, long before you read `access_type`.
- **`access_type: public` describes the door, not the licence.** 23 public rows carry an
  empty `license`. Reading `public` as "free to reuse" is wrong for those, and the
  catalogue does not pretend otherwise — it just leaves the field blank.
- **`license` is free text, not SPDX.** 33 distinct strings across 1,693 rows, 13 of them
  longer than 40 characters because they are whole paragraphs pasted from a dataset README.
  `CC0` also appears misspelled as `CCO`, alongside `PD`, `PDDL` and `PPDL`. Normalise
  before you group; never equality-match.
- **Most rows have no subject count.** Only 713 of 1,693 carry an integer `subjects_count`.
  Filter on presence first or your cohort-size histogram silently drops 58% of the
  catalogue.

The four tiers mean: `public` (open download), `registration` (an account or a click-through),
`application` (a reviewed request), `restricted` (a trial or enclave portal — one row, the A4
trial). HCP-YA sits at `registration`, which matches its Open Access terms exactly; the
restricted HCP tier is a separate agreement the catalogue does not model.

The gated rows are not thin. All 30 carry modality, species, disease flags, centre, PI,
consortium, a primary URL and a category, and 22 carry a subject count — enough to triage a
cohort before you go near an application. What the catalogue does **not** carry is consent
terms, and consent is usually the binding constraint. Read the source's own terms before
planning around a row.

Two more quirks in the manual rows, both artifacts of a CSV import. `size_human` is the
string `"nan"` on 61 of the 99, not null or absent. And `tasks` was split on commas inside a
free-text cell, so five rows have a bracket stranded across list elements — HCP-YA's reads
`["7 tasks (WM", "motor", "language", "etc.)", "rest"]`. Treat `tasks` as a hint for a human,
never as a controlled vocabulary.

## Install the package — and the version pin that will stop you

Everything above is standard library. The CLI, the MCP server and the claim-record
regeneration need the package, and **it pins `requires-python = ">=3.11,<3.12"`** — 3.12 and
3.13 are refused, not merely untested.

```bash
python3.11 --version
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -e .
brain-researcher --version
```

```
Python 3.11.14
Brain Researcher v0.3.0
```

Two CLI commands are named to disappoint. `brain-researcher analyze` and `brain-researcher
ingest` both self-describe as "Preview-only placeholder; does not execute neuroimaging
analysis" / "does not ingest neuroimaging data". They are stubs. Real work goes through the
workflow recipes and the reproducibility packs.

The base install is 50-odd packages. The `.[mcp]` profile is not two more — it pulls
`brain_researcher[agent]`, 43 dependencies including a deep-learning stack, for a venv
around 2.2 GB. Install `.[mcp]` only when you actually want to run a server.

## The one downloader with a real provenance contract

The repository has thirteen scripts whose job is to fetch data, and `scripts/DOWNLOADERS.md`
grades every one of them. **Exactly one is `supported-public`**: the Neurosynth downloader.
The rest are `experimental` (no pinned version, no checksum, sometimes exit 0 on a partial
result), `private-input` (behaviour set by a local inventory you supply) or `historical`.

That single script is the shape to copy. It pins the source to a Git commit, verifies both
byte size and SHA-256 for all four files including ones already on disk, publishes atomically
via `.part`, and writes a `source_manifest.json` that records the pinned URLs, commit,
snapshot, licence, sizes and hashes. Any failure exits non-zero and leaves no success
manifest.

```bash
source .venv/bin/activate
python scripts/data/download_neurosynth_data.py --check-only; echo "check-only on an empty tree -> exit $?"
python scripts/data/download_neurosynth_data.py
python scripts/data/download_neurosynth_data.py --check-only; echo "recheck -> exit $?"
python -c "
import json
m = json.load(open('data/neurosynth_nimare/neurosynth_v7/source_manifest.json'))
print('snapshot   ', m['source_snapshot'])
print('commit     ', m['source_commit'])
print('licence    ', m['license']['spdx'])
print('files      ', len(m['files']))
print('total bytes', sum(f['size_bytes'] for f in m['files']))
"
```

```
Neurosynth verification failed: missing Neurosynth source manifest: .../data/neurosynth_nimare/neurosynth_v7/source_manifest.json; run python scripts/data/download_neurosynth_data.py
check-only on an empty tree -> exit 1
data-neurosynth_version-7_coordinates.tsv.gz: downloaded and verified
data-neurosynth_version-7_metadata.tsv.gz: downloaded and verified
data-neurosynth_version-7_vocab-terms_source-abstract_type-tfidf_features.npz: downloaded and verified
data-neurosynth_version-7_vocab-terms_vocabulary.txt: downloaded and verified
Verified Neurosynth version-7 source commit 209c33cd009d0b069398a802198b41b9c488b9b7 under ODbL-1.0 in .../data/neurosynth_nimare/neurosynth_v7
Source manifest: .../data/neurosynth_nimare/neurosynth_v7/source_manifest.json
data-neurosynth_version-7_coordinates.tsv.gz: verified existing file
...
recheck -> exit 0
snapshot    version-7
commit      209c33cd009d0b069398a802198b41b9c488b9b7
licence     ODbL-1.0
files       4
total bytes 14692745
```

`--check-only` is genuinely read-only — it will not create, delete or repair anything — and
it fails closed on a directory that has the right filenames but no matching manifest. Four
correct files are not a verified bundle; the manifest is what makes it one.

**The pin is doing invisible work.** As of 2026-08-29 the `master` tip of
`neurosynth/neurosynth-data` still serves bytes identical to the pinned commit, so a
tip-of-branch URL looks like it works. It works right up until upstream rebuilds, at which
point a pinned run stays reproducible and a branch-tip run silently changes underneath you.
(That repository's default branch is `master`; a guessed `main` URL returns 404, which is at
least a loud failure.)

Neurosynth v7 is **ODbL-1.0**, which carries share-alike obligations on derived databases.
That is fine for analysis and reporting, and it is something to check before you redistribute
a derived corpus.

## Regenerating the claim record

With the package installed and the corpus verified, the tutorial rebuilds the whole record
from public data. No account, no MCP server, no data-use agreement. It installs NiMARE and
Nilearn under the checked-in Python 3.11 constraints, converts the corpus into a NiMARE
dataset with a checksum-bound provenance sidecar, seals a fresh commitment card, runs the
four graded evidence queries, and writes the four output files.

```bash
source .venv/bin/activate
bash reproducibility/auditable_claim_record/run_end_to_end.sh
```

```
== [1/4] the question (natural language) ==
   claim: Working-memory-labeled Neurosynth studies show dlPFC activation and dlPFC-IPS coactivation within coordinate evidence.
   scope: Neurosynth v7 / fMRI / 'attention' as the allowed rival explanation
== [2/4] environment (light — not the full platform) ==
   brain_researcher import: .../src/brain_researcher/__init__.py
== [3/4] public corpus: download -> convert ==
data-neurosynth_version-7_coordinates.tsv.gz: verified existing file
...
== [4/4] execute the claim -> sealed record (default NiMARE backend) ==
wrote /tmp/auditable_claim_e2e
case=working_memory
claim_card.status=supported_within_scope
binding_axis=structure-complete
== verify the chain actually fired ==
   status = supported_within_scope
   forward_default n_studies = 14371
   OK: claim -> grounded evidence -> sealed claim record, end to end
```

Five files land in `/tmp/auditable_claim_e2e` — `commitment_card.json`, written before the
first query, plus `claim_card.json`, `evidence_verdicts.json`, `demo_bundle.json` and a
generated `README.md` afterwards. The corpus conversion is the slow step, a few minutes; the
evidence queries take seconds.

**Your regenerated card will not say `weakened`.** The committed card came from the
NeuroLang probabilistic-Datalog reference engine; the supported path uses NiMARE, which
clears the strict bar, so a fresh run lands `supported_within_scope` with an empty
`failed_checks`. Both records are faithful to the engine that produced them, and neither is
the "right" answer. The invariant to check is *not* that you reproduced the committed status
— it is that **each fresh claim card matches its own pre-observation commitment**, which it
does: the fresh commitment card hashed `99a9900370fab25c…` and the fresh claim card points
at exactly that. It is a different hash from the shipped `4871ea4346e81bc7…`, because the
hash covers the evidence engine's name and version, and the engine changed.

The reference engine cannot be rebuilt from the public checkout: as of 2026-07-14 upstream
records that `neurolang` has no installable PyPI distribution and the repository pins no
verified source commit for it. `pip install neurolang` fails. The committed JSON stays
inspectable; the engine behind it does not.

**Run the second case too, because agreeing is the easy half.** A boundary example ships
alongside the working-memory one, and it is the more informative of the two — it is where you
see the machinery decline.

```bash
source .venv/bin/activate
python scripts/autoresearch/run_auditable_claim_demo.py \
  --case response_inhibition_boundary \
  --corpus data/neurosynth_nimare/neurosynth_dataset_v7.pkl \
  --output-dir /tmp/ri_demo
python -c "
import json
card = json.load(open('/tmp/ri_demo/claim_card.json'))
commit = json.load(open('/tmp/ri_demo/commitment_card.json'))
print('status          ', card['status'])
print('matches own seal', card['commitment_hash'] == commit['commitment_hash'])
for c in card['failed_checks']:
    print('  did not clear  ', c.split(':')[0])
"
```

```
wrote /tmp/ri_demo
case=response_inhibition_boundary
claim_card.status=unresolved
binding_axis=neurolang-forward-default
status           unresolved
matches own seal True
  did not clear   neurolang-forward-default
  did not clear   strict-evidence-profile
  did not clear   network-coactivation-acc-ifg
```

`unresolved` is the honest answer here, and note which one it is: the ACC/response-inhibition
association did not clear the bar, so the record says *adjudicated, evidence insufficient* —
not `rejected`, which would claim a refutation nobody produced. A card that comes back
`unresolved` and still matches its own seal is the machinery working, not failing.

## Connecting an MCP client

Two endpoints, and they behave identically at the door.

**Hosted** — `https://brain-researcher.com/mcp`, streamable HTTP, a personal bearer token
from an ordinary self-serve sign-up at `https://brain-researcher.com/mcp/setup`. No invite,
no waitlist, no institutional approval. One active token per user, and generating a new one
rotates the old immediately. Client config is a standard MCP HTTP server entry with
`Authorization: Bearer ${BR_MCP_TOKEN}` and
`Accept: application/json, text/event-stream`. Keep the token in your shell profile, never
in a project config file.

**The endpoint refuses cleanly, and the two refusals differ:**

```bash
for auth in "" "Authorization: Bearer not-a-real-token"; do
  label=$([ -z "$auth" ] && echo "no token" || echo "wrong token")
  code=$(curl -sS -o /tmp/br_mcp_probe.json -w '%{http_code}' \
    ${auth:+-H "$auth"} https://brain-researcher.com/mcp)
  printf '%-12s HTTP %s  %s\n' "$label" "$code" "$(cat /tmp/br_mcp_probe.json)"
done
```

```
no token     HTTP 401  {"ok":false,"error":"missing_bearer_token"}
wrong token  HTTP 401  {"ok":false,"error":"invalid_token"}
```

Same status, different error string. `missing_bearer_token` means the client never sent the
header — the variable was not in the environment the client was launched from, which is the
usual cause. `invalid_token` means it sent one that was rejected — usually rotated. Read the
body, not the code.

**A `403` from that host is a third thing entirely.** The edge blocks unfamiliar clients
before the application sees the request: a bare Python `urllib` call with its default user
agent gets `HTTP 403` and a body reading `error code: 1010`, with no JSON and no mention of
tokens. Set a `User-Agent` header on any non-browser client and the same request returns the
`401` above. A 403 there is your client being blocked, never your token being wrong.

**Local** — no account at all. This is what to reach for when you want the tool surface
without a hosted dependency.

```bash
source .venv/bin/activate
python -m pip install --quiet -e ".[mcp]"
export BR_MCP_AUTH_TOKEN=local-dev-token
brain-researcher serve mcp --port 7099 > /tmp/br_mcp.log 2>&1 &
for _ in $(seq 30); do curl -sf -o /dev/null http://127.0.0.1:7099/healthz && break; sleep 2; done
curl -sf -o /dev/null http://127.0.0.1:7099/healthz \
  && grep -E '^\[mcp-http\]|health checks passed' /tmp/br_mcp.log \
  || { echo "server did not start — its own log says:"; tail -4 /tmp/br_mcp.log; }
```

```
[mcp-http] transport=streamable-http
[mcp-http] health=http://127.0.0.1:7099/healthz
[mcp-http] rpc=http://127.0.0.1:7099/mcp
[mcp-http] auth_mode=auto
[mcp-http] auth_token_set=yes
[mcp-http] stateless_http=1
... MCP startup health checks passed (run_root=.../data/runs/mcp_runs writable=True neo4j_configured=False neo4j_reachable=False strict=True)
```

`neo4j_configured=False` and the server starts anyway. A local MCP server with no graph is
the normal state of a public checkout, not a broken one.

**Set `BR_MCP_AUTH_TOKEN` or nothing will answer you.** The default `BR_MCP_AUTH_MODE=auto`
with no token configured resolves to *token mode, deny by default*, so a freshly started
local server returns exactly the same `401 missing_bearer_token` as the hosted one. The
startup banner says `auth_token_set=no` and that is the only warning you get.
`BR_MCP_AUTH_MODE=none` disables auth explicitly, which is a deliberate choice rather than
a default.

**And do not copy `.env.example` to `.env` before you start this.** The MCP server reads the
same `.env` the Compose stack does, and the example ships
`BR_MCP_TOKEN_PEPPER=replace_with_64_hex_chars`. Left unedited, the server exits at import
with `ValueError: BR_MCP_TOKEN_PEPPER must be valid hex` — an error that says nothing about
the token you did set, and which the bounded wait above turns into a printed log tail rather
than a hang. Either edit that value to 64 hex characters, or set up the MCP server before the
Compose stack.

```bash
curl -sS -o /dev/null -w 'no token   HTTP %{http_code}\n' -X POST http://127.0.0.1:7099/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'

curl -sS -o /tmp/br_tools.sse -w 'with token HTTP %{http_code}\n' -X POST http://127.0.0.1:7099/mcp \
  -H "Authorization: Bearer $BR_MCP_AUTH_TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

python - <<'PY'
import json, pathlib
tools = []
for line in pathlib.Path("/tmp/br_tools.sse").read_text().splitlines():
    if line.startswith("data: "):
        tools = json.loads(line[6:])["result"]["tools"]
        break
names = {t["name"] for t in tools}
stable = {json.loads(p.read_text())["name"]
          for p in pathlib.Path("contracts/tools").glob("*.json")}
print(f"tools this local server exposes  {len(names)}")
print(f"of those, versioned as stable    {len(stable & names)}")
print(f"served with no stability promise {len(names - stable)}")
print(f"stable contracts not served      {sorted(stable - names) or 'none'}")
PY
```

```
no token   HTTP 401
with token HTTP 200
tools this local server exposes  87
of those, versioned as stable    10
served with no stability promise 77
stable contracts not served      none
```

**That ratio is the single most useful thing to know before building on this surface.** A
bare local checkout exposes 87 tools; 10 carry a versioned contract. The other 77 — every
`kg_*` tool, the deep-research tools, `tool_execute`, the session and memory tools — may
change shape between releases with no deprecation window. Call `server_info` first and read
its `stable_tools` list rather than assuming a tool you found by listing is safe to depend
on.

Calling `server_info` on that same local server returns `allow_network: false`,
`allow_dangerous: false` and `enable_tool_execute: false`, with `allowed_roots` confined to
the checkout's `artifacts/`, `data/` and `tmp/`, and a `toolset_hash` of
`677290acdbedb024…` at contract version `2026-05-27`. Safe by default; opening any of those
is a decision you make deliberately. `system_self_test` returns `overall=pass` with 5 passes
and no warnings, failures or skips, on a checkout with no graph at all.

Two families will be present in the listing and will not work for you. Every `kg_*` tool
needs the compiled BR-KG graph, which is private. The `google_deep_research*` and
`google_file_search` tools need `GEMINI_API_KEY` (or `GOOGLE_API_KEY` for libraries that
read that name instead). Neither is a bug; both are the `deployment-specific` status doing
its job.

## Running the browser stack

Compose brings up Neo4j, Redis, the BR-KG API, the agent and the web UI, plus a one-shot
`init-local-dirs` job. **It does not start the MCP server** — that is `brain-researcher serve
mcp`, above, and the two are independent.

**You need one LLM provider API key before this will start**, and that is a hard
prerequisite rather than a nicety — the stack will not come up without it. The runtime reads
whichever of the four supported provider key variables you set, and `DEFAULT_LLM_MODEL` must
name a model that same provider actually serves; `.env.example` lists both. It also wants
`NEO4J_PASSWORD` (8+ chars), `JWT_SECRET_KEY` and `NEXTAUTH_SECRET` (32+ each), which you
generate locally.

```bash
cp .env.example .env
python3 -c "
import secrets
for k, n in (('NEO4J_PASSWORD', 24), ('JWT_SECRET_KEY', 48), ('NEXTAUTH_SECRET', 48)):
    print(f'{k}={secrets.token_urlsafe(n)}')
"
```

That prints three `KEY=value` lines with fresh random secrets — different every run, which
is the point, so there is no fixed output to compare against. Put them into `.env` in place
of the placeholders, then add your provider key and a matching `DEFAULT_LLM_MODEL`. Only
then:

```bash
PUBLIC_HOSTNAME=localhost docker compose --env-file .env config --quiet
docker compose up -d --build --wait --wait-timeout 300
docker compose ps --all
bash scripts/smoke/health_smoke.sh
```

`docker compose config --quiet` is the static validation the project's own CI runs; it
checks the Compose model without starting anything, so run it first and read its complaint
rather than debugging a half-started stack. Expect `init-local-dirs` to exit 0 and `neo4j`,
`redis`, `br-kg`, `agent` and `web-ui` to reach `healthy`. The UI is on
`http://localhost:3000`; `docker compose down` stops it without deleting volumes.

Neo4j comes up **empty** and stays that way. Populate it only from sources you are
authorised to use. Do not treat an empty graph as a broken install — it is the documented
state of a public checkout.

The Helm chart and raw Kubernetes manifests under `infrastructure/k8s/` are `experimental`
and the project says plainly not to apply them: it publishes no application images for the
tags the chart renders, and the manifests carry empty secret contracts and need cluster
CRDs. Render them to read them; do not deploy them.

## The deeper A1 rerun

`bounded_autoresearch_a1` is the one pack that runs from public inputs. Its headline path
downloads roughly 835 MB (about 1.0 GB extracted), installs a Python 3.11 lock, runs the
frozen predictor and checks the recorded tolerance. No HCP account and no MCP. The archive is
checksum-pinned like the Neurosynth bundle — the pack records the expected `tar.gz` SHA-256,
and the fetcher verifies it before extracting.

```bash
python3.11 -m venv ~/.venvs/br-a1-repro
source ~/.venvs/br-a1-repro/bin/activate
bash reproducibility/bounded_autoresearch_a1/run_end_to_end.sh
```

What that does **not** do is the governed rerun. The pack's attestation records
`governed_rerun: partial` for a specific, stated reason — the target reconstruction and
permutation seeds 1 through 30 were rerun; seeds 31 through 1000 were not. Rebuilding the
subject-keyed target needs HCP-YA rows plus the exact 326-subject connectivity/behaviour
intersection, and neither is redistributed. `fully_reproduced` is not claimed and should not
be reported.

The same honesty applies to the agentic path. Upstream states that an agent's search
trajectory is non-deterministic, so a rerun reproduces **the discipline** —
commit-before-observe, a frozen evaluator, cheap checks before expensive compute — and, once
the same predictor is frozen, the confirmatory numbers. It does not reproduce the trajectory.
Do not promise byte-identical agent traces.

## What this skill deliberately does not do

Upstream publishes its own agent kit of 46 MIT-licensed skills — operational ones
(release rollout, worktree hygiene, PR cycles, session handoff, GPU requests) and workflow
wrappers around its MCP sequences. Those are theirs, they ship alongside the tool, and they
assume you are working inside that project's repository and deployment. This is not a
re-hosting of them and does not duplicate any: it is one vetted entry point with the access
boundary drawn — what is public, what is private, what needs an agreement, and what the
published numbers do and do not say. If you want the operational bundles, install them from
the project directly.

It also will not, and cannot, get you the BR-KG graph. There is no deposit to point you at.

## Requesting access

Two different gates get confused here, so take them separately. Neither is obtained by this
skill, and nothing here should be read as a promise of either.

### The hosted MCP account — an ordinary sign-up

Open `https://brain-researcher.com/mcp/setup`, sign in, generate a personal token, copy it
immediately (the secret is shown once). That is the whole process: no invitation, no
waitlist, no institutional agreement, no committee. One active token per user; generating a
new one rotates the previous one immediately, which silently breaks any client still holding
the old one. Treat it as a password and keep it in your shell profile rather than a project
file.

If you would rather not have an account at all, run the local server. It exposes the same
tool surface from your own checkout with no sign-up, and the *Connecting an MCP client*
section above is executed proof that it works.

### HCP-YA — a data-use agreement, in two tiers

The Human Connectome Project Young Adult (WU-Minn) data is the only data-use-agreement
dependency in this tooling, and it is needed only for the deeper A1 reconstruction. The
headline A1 result, and everything else in this skill, runs without any HCP account at all.

**Settle which tier your question needs before starting anything**, because the two are very
different processes and the project's own input table says exactly which is which:

| what you need it for | tier | what that costs |
|---|---|---|
| the public FC feature archive and the shipped residualised target | none | a download |
| the HCP-YA behaviour export (IQ and covariate columns), to rebuild the target | **Open Access** | a free ConnectomeDB account and a click-through agreement |
| HCP-YA `Family_ID`, for the family-block confirmatory null | **Restricted** | a PI-led application, on top of the Open Access terms |

So the step most people assume is the hard one — getting imaging and behaviour — is the
click-through, and the step that looks like a technical detail — twin and sibling structure
for the exchangeability null — is the one behind an application.

**Open Access** covers all the imaging data and most of the behavioural data. Register a free
account at `db.humanconnectome.org` and agree to the Open Access Data Use Terms (last updated
26 Apr 2013). That agreement includes complying with your institution's rules, so **you may
need IRB or ethics-committee approval before you begin** — HCP says plainly that the released
data are *not* considered de-identified, because combinations of restricted elements could
allow identification. Consult your IRB first; that is HCP's own instruction, not caution
added here.

**Restricted Data** covers family structure (twin or non-twin status), age by year, and
handedness. A qualified investigator must agree to **both** the Open and the Restricted
Access Data Use Terms (restricted terms last updated 11 Feb 2022). Applications are approved
under a PI or group leader who lists the group members needing access, and the terms carry
significant limits on how restricted elements may appear in publications and public
presentations — which is a constraint on your figures, not only on your storage.

- **Data Use Terms, both tiers** — <https://www.humanconnectome.org/study/hcp-young-adult/data-use-terms>
- **Register, agree, and stage the data** — <https://db.humanconnectome.org>

The authoritative requirements are on those pages and they change; where they and this
disagree, they are right and this is stale.

**Sharing a copy is not a shortcut.** HCP requires that everyone who works with open-access
HCP data registers and agrees to the terms themselves, *including people using a shared
copy*. Handing a collaborator the files does not transfer your agreement to them, and raw
subject rows, subject identifiers and raw connectivity files are not redistributable at all.
The A1 pack's whole export design keeps them out of the bundle; yours must too.

**What this skill will do**: help you decide whether HCP-YA is even the right cohort, read
the catalogue row and the pack's stated input contract, and assemble the technical account of
what you would stage and where. **What it will not do**: complete any attestation on your
behalf — institutional status, IRB approval, data security, non-redistribution, or the
restricted-tier justification. Those are statements a named person makes and is personally
accountable for, and an agent that makes them easy to produce makes them easy to produce
carelessly.

One last constraint that shapes a project rather than just its start. Staging the HCP export
is still not sufficient: the exact 326-subject connectivity/behaviour intersection and its
subject-keyed derived component table are separately governed inputs that upstream does not
ship, and the public projection module records the method but not the subject ids. A full A1
reconstruction needs more than either HCP tier grants.

## Try it

A cold check that the pinned open-data contract still holds and that the hosted endpoint
still refuses the way this skill describes. Standard library only, no account, no clone, no
install — it runs in an empty directory and writes nothing.

**Data** — the Neurosynth version-7 release, pinned to commit
`209c33cd009d0b069398a802198b41b9c488b9b7` of `neurosynth/neurosynth-data`, under
**ODbL-1.0**. Four files totalling 14,692,745 bytes, fetched anonymously from
`raw.githubusercontent.com`; no account and no agreement. Brain Researcher publishes the
expected byte size and SHA-256 for each, which is what makes this a test rather than a
download. All four confirmed reachable 2026-08-29.

The block routes through the traps rather than around them: it fetches from the pinned commit
rather than the branch tip, it shows that having the right filenames is not the same as
having a verified bundle, it sends the `User-Agent` without which the hosted host answers
`403` instead of `401`, and it asserts that the endpoint refuses an anonymous call and
distinguishes that from a rejected one.

```python
import hashlib
import json
import urllib.error
import urllib.request

COMMIT = "209c33cd009d0b069398a802198b41b9c488b9b7"
BASE = f"https://raw.githubusercontent.com/neurosynth/neurosynth-data/{COMMIT}/"

# The contract Brain Researcher publishes: filename, exact bytes, exact digest.
PINNED = [
    ("data-neurosynth_version-7_coordinates.tsv.gz",
     3_587_167, "17135be3e08a0ab045896c77217e8463086543a0817d52a6a88c8e32c1161616"),
    ("data-neurosynth_version-7_metadata.tsv.gz",
     1_175_486, "8acde7de2a14ee2a12b406e50a8805e83288b0bc78924ddb36879d496dfb757b"),
    ("data-neurosynth_version-7_vocab-terms_source-abstract_type-tfidf_features.npz",
     9_896_293, "1b3359eebcbc8557340583788b3855031ea21361e87c265cb8fc540d9b6c4edd"),
    ("data-neurosynth_version-7_vocab-terms_vocabulary.txt",
     33_799, "71c1858c5eb1bcc79854198bbca234569731efdc382c6205a9e46495379614af"),
]

# 1. invariant: the pinned commit still serves bytes matching the published contract
sizes_ok = digests_ok = 0
for name, size, digest in PINNED:
    with urllib.request.urlopen(BASE + name, timeout=300) as r:
        blob = r.read()
    sizes_ok += len(blob) == size
    digests_ok += hashlib.sha256(blob).hexdigest() == digest
print(f"pinned files checked       -> {len(PINNED)}")
print(f"byte sizes matching        -> {sizes_ok}")
print(f"sha256 digests matching    -> {digests_ok}")
print(f"total bytes                -> {sum(s for _, s, _ in PINNED)}")

# 2. invariant: filenames are not a bundle. The manifest is the authority: it must name the
#    pinned commit and licence and cover every file, and it is what the loader verifies.
manifest = {
    "schema_version": "brain-researcher.neurosynth-source-manifest.v1",
    "dataset": "Neurosynth",
    "source_snapshot": "version-7",
    "source_commit": COMMIT,
    "base_url": BASE,
    "license": {"spdx": "ODbL-1.0", "url": BASE + "LICENSE.txt"},
    "output_directory": ".",
    "files": [{"filename": n, "size_bytes": s, "sha256": d, "url": BASE + n}
              for n, s, d in PINNED],
}
print(f"manifest names the commit  -> {manifest['source_commit'] == COMMIT}")
print(f"manifest licence           -> {manifest['license']['spdx']}")
print(f"manifest covers all files  -> {len(manifest['files']) == len(PINNED)}")

# 3. invariant: the licence the manifest points at is served at the same pin
with urllib.request.urlopen(manifest["license"]["url"], timeout=120) as r:
    licence = r.read().decode("utf-8", "replace")
print(f"licence text is ODbL       -> {'Open Database License' in licence}")

# 4. invariant: the hosted endpoint refuses an anonymous call, and says which refusal it is.
#    The User-Agent is not optional — the edge blocks a default urllib agent with 403
#    before the application ever sees the request.
UA = "brain-researcher-skill-check (+https://heurekaskills.com)"


def probe(token=None):
    req = urllib.request.Request("https://brain-researcher.com/mcp",
                                 method="GET", headers={"User-Agent": UA})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read(200).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(200).decode("utf-8", "replace")


for label, token in (("no token  ", None), ("bad token ", "not-a-real-token")):
    code, body = probe(token)
    err = json.loads(body)["error"] if body.startswith("{") else body[:40].strip()
    print(f"hosted MCP, {label}     -> HTTP {code} {err}")
```

**Expect** — invariants first. A failure in any of these means this skill is wrong, not that
upstream moved on:

```
pinned files checked       -> 4
byte sizes matching        -> 4
sha256 digests matching    -> 4
total bytes                -> 14692745
manifest names the commit  -> True
manifest licence           -> ODbL-1.0
manifest covers all files  -> True
licence text is ODbL       -> True
hosted MCP, no token       -> HTTP 401 missing_bearer_token
hosted MCP, bad token      -> HTTP 401 invalid_token
```

Everything above is an invariant, because the commit is pinned: those four digests cannot
change without the pin changing, and a mismatch means the skill's recorded contract is wrong
or the host is serving something else. The two 401 bodies are the other kind of check — they
assert that the hosted endpoint still refuses, and still distinguishes a missing header from
a rejected token. **Observed and dated 2026-08-29**, against contract epoch `2026-05-27`,
package v0.3.0 and MCP server build 1.29.1: the `1693` catalogue rows, the `10` stable
contracts, the `87` tools a local server exposes, and the `3 verified / 1 incomplete / 0
failed` pack summary. Those move when upstream publishes a release — a mismatch there is
drift to re-verify, not a fault.

## Sources

- Brain Researcher — <https://github.com/brain-researcher/brain-researcher-public>
- Software release v0.3.0 — <https://doi.org/10.5281/zenodo.21966011>
- Preprint — <https://arxiv.org/abs/2608.19902>
- Reproducibility packs and the status ladder — <https://github.com/brain-researcher/brain-researcher-public/blob/main/docs/reproducibility_packs.md>
- Contract tiers — <https://github.com/brain-researcher/brain-researcher-public/blob/main/docs/contract-tiers.md>
- Downloader inventory — <https://github.com/brain-researcher/brain-researcher-public/blob/main/scripts/DOWNLOADERS.md>
- Agent kit and MCP client setup — <https://github.com/brain-researcher/brain-researcher-agent-kit>
- Hosted MCP setup — <https://brain-researcher.com/mcp/setup>
- Neurosynth data, pinned commit — <https://github.com/neurosynth/neurosynth-data/tree/209c33cd009d0b069398a802198b41b9c488b9b7>
- ODbL-1.0 — <https://opendatacommons.org/licenses/odbl/1-0/>
- HCP Young Adult — <https://www.humanconnectome.org/study/hcp-young-adult>
- HCP Young Adult data use terms, both tiers — <https://www.humanconnectome.org/study/hcp-young-adult/data-use-terms>
- Connectivity-mapping benchmark (Liu et al., Nature Methods 2025) — <https://doi.org/10.1038/s41592-025-02704-4>
