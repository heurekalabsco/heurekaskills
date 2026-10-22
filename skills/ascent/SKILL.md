---
name: ascent
description: Run Bayer's ASCENT demo — an MCP server for epidemiological text-to-SQL, medical-code lookup and cohort building over synthetic OMOP CDM and claims-style data — and check its answers against shipped ground truth and the EpiTrap benchmark.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [epidemiology, cohort, agents, benchmark, omop]
covers: [omop cdm, real-world data, rwd, real-world evidence, ehr, claims, text-to-sql, nl2sql, sql, medical coding, concept sets, phenotype, cohort building, attrition, prevalence, incidence, observational research, pharmacoepidemiology, model context protocol, mcp server, synthetic patients, duckdb, epitrap, ohdsi, vocabulary, snomed, icd-10, cpt]
papers: [doi:10.48550/arXiv.2609.24620, doi:10.48550/arXiv.2502.21107]
datasets: ["https://raw.githubusercontent.com/bayer-group/ascent-epi-demo/0d40690821f6ae00dacc582e2dfd484b656aed6c/data/synthetic/omop_synthetic_1k.db.zip", "https://raw.githubusercontent.com/bayer-group/ascent-epi-demo/0d40690821f6ae00dacc582e2dfd484b656aed6c/data/synthetic/source_synthetic_1k.db.zip", "https://raw.githubusercontent.com/bayer-group/ascent-epi-demo/0d40690821f6ae00dacc582e2dfd484b656aed6c/data/synthetic/ground_truth_1k.json", "https://raw.githubusercontent.com/bayer-group/ascent-epi-demo/0d40690821f6ae00dacc582e2dfd484b656aed6c/data/synthetic/SHA256SUMS"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: ascent-epi-demo commit 0d40690 (BSD-3-Clause) / Python 3.12.8 via uv with the frozen lock, duckdb 1.1.3, sqlglot 25.20.2 / backend suite 794 passed and 4 skipped on macOS arm64 / warehouse built on the host from the shipped 1k archives / all 50 ground-truth prevalence counts and three two-diagnosis attrition steps rebuilt in plain SQL / EpiTrap item and category counts matched the release notes for both bindings / OHDSI Book vocabulary chapter, SNOMED International licensing page and the UMLS licence agreement (CPT as Category 3) read 2026-10-21 / Python 3.12 stdlib sqlite3 for Try it
  executed: 9
  unverified: 3
  unverified_reason: The three Docker Compose blocks (full stack, health probes, MCP-only start) need a running container engine and a Gemini API key, and the backend refuses to start without a model key; the validating host had neither. Re-run them on a machine with Docker Compose v2 and a Gemini key, about 2.5 GB of free disk for embedding models, and network access for the first build.
---

# ASCENT — epidemiological questions over OMOP and claims data, through MCP

## Overview

ASCENT is Bayer's research system for answering epidemiological questions against
real-world clinical data with an agent. The public release, `bayer-group/ascent-epi-demo`,
packages it as a local demo: a backend that serves the work as Model Context Protocol
tools, a medical-coding service that turns clinical phrases into concept ids, a DuckDB
warehouse holding a **synthetic** population, and an optional chat front end. The
companion paper is *ASCENT: An Agentic System over the Model Context Protocol for
Real-World Clinical Data Analysis* (Ziletti, D'Ambrosi, Tuchardt and Kondziella,
arXiv:2609.24620, September 2026).

What the tools do, in the order an analysis uses them:

1. **Discover** which databases exist and what their tables look like.
2. **Code** — turn "type 2 diabetes" into the concept ids that the data actually uses.
3. **Generate** SQL for a prevalence, incidence, treatment or cohort question, as a
   template with placeholders for the medical entities.
4. **Resolve** the placeholders into code lists, **execute**, and for cohorts **persist**
   the result and produce an attrition table.

Use this skill to stand the demo up, connect an agent to it, and — the part most worth
having — check what the agent says against numbers known in advance. The synthetic
population ships with a ground-truth file, and the release includes EpiTrap, a benchmark
of questions designed to make a one-shot query commit a classic epidemiological error.

Do not use it as a source of evidence. Every patient is generated, every count describes
that generated population, and nothing here estimates real-world prevalence.

## What a reader needs, and what it costs

Stated before anything runs:

- **A container engine with Docker Compose v2 and BuildKit** for the stack itself.
- **A Gemini API key.** The default chat agent and the non-OMOP question pipeline name
  Gemini models directly. The OMOP pipeline can be switched to an Azure OpenAI deployment
  (key *and* endpoint) or one other provider listed in the repository's `.env.template`,
  but a single non-Gemini key leaves the chat UI without a working model and non-OMOP
  questions failing. **Provider calls are billed to you**, and the chat front end's
  per-user credit cap does not cover model calls the backend makes from inside MCP tools —
  set a spending limit at the provider.
- **Disk and network.** The first build pulls about 2.5 GB of embedding-model weights plus
  three images' worth of packages, and needs network for that. The upstream does not
  publish a measured RAM or disk minimum.
- **No account with anyone else.** No hosted warehouse, no data-use agreement, no
  credentials beyond the model key. The data ships in the repository.

Optional, for the host-side checks below: Python 3.12 and `uv`. The frozen backend
environment is about 1.3 GB on disk (CPU-only PyTorch included), and the repository is
73 MB checked out.

## Licensing — the code, the data, and the vocabularies

**The code** is BSD 3-Clause, copyright Bayer, from the `LICENSE` file at the repository
root — an organisation, not an individual. The chat front end is LibreChat, MIT, fetched
at a pinned commit during the build. The paper is CC BY 4.0.

**EpiTrap and the query library** live in the same repository and carry no licence of
their own, so the root BSD 3-Clause file is what governs them. The query library tracks
Bayer's earlier `epi-cohort-text2sql-ecai2025` repository, which is MIT, copyright Bayer. The EpiTrap release notes
ask that you cite the paper when you use the dataset or its rubric.

**The synthetic data** is generated by code in the same repository, under the same
licence. It derives from no real patient.

**The vocabularies are where the real constraints live**, and they bite the moment you
move off the demo data:

- **The demo vocabulary is invented.** Nine synthetic vocabularies (`MEDLEX`, `DXCODE`,
  `DXCODE9`, `PHARMLEX`, `DRUGPKG`, `LABLEX`, `LABLOCAL`, `PXCODE`, `ENCTYPE`) play the
  parts that SNOMED, ICD-10, ICD-9, RxNorm, NDC, LOINC and procedure codes play in
  real data. That is precisely why it can ship: a public repository has no right to
  republish real SNOMED CT or CPT content.
- **Two deliberate exceptions reproduce real OMOP identifiers:** the small gender, race,
  ethnicity, unit and type-concept vocabularies (`8532` is FEMALE, as in real OMOP), and
  20 observation and death concepts filed under `vocabulary_id = 'SNOMED'` with real
  standard concept ids and names but invented concept codes. The upstream states this
  itself and documents how to replace them.
- **Real OMOP vocabularies come from OHDSI ATHENA**, behind a free account. Most are open,
  but ATHENA marks proprietary ones "License required" and releases them only after you
  show you hold that licence — MedDRA is the usual example.
- **SNOMED CT** is free to use in SNOMED International member countries, but the use is
  still registered, with the country's national release centre or through SNOMED
  International's Member Licensing and Distribution Service (MLDS) where the country uses
  it. Outside member countries it needs an affiliate licence through MLDS, which may carry
  a fee depending on territory and use.
- **CPT-4** is owned by the American Medical Association. ATHENA does not ship CPT-4
  concept names; they are reconstituted locally with a UMLS API key, and that route is
  narrow. The UMLS licence lists CPT under its Category 3 restrictions: internal use at
  the licensee's own sites for research, product development and statistical analysis
  only. That clause expressly excludes using the material in routine patient data
  creation, putting it in any publicly accessible system, creating derivative works,
  making it available to any unauthorised party, and copying it except for backup. So a
  reconstituted CPT-4 table is for internal research at your own site. Systems that
  create routine patient data, and any sharing, need a licence from the AMA, the source
  contact the UMLS agreement names. Wherever CPT content is displayed, the agreement's
  source list requires the AMA's copyright notice to be shown with it. Never commit,
  publish or share the table; anyone else who needs it rebuilds it under their own licence.

So: the demo itself needs nothing beyond the model key. **Pointing ASCENT at a real OMOP
instance means you also carry that instance's vocabulary licences.**

## Never real patient data

The stack sends questions, schema descriptions and generated SQL to an external model
provider, the literature comparison hands it your result as well, and the two literature
tools run public web searches on your question. The upstream warns against putting
real patients, anything confidential, or licensed data into it, and against basing any
patient decision on what it returns. Hold to that. In particular, this
registry's `all-of-us` skill explains why an AI-enabled tool must never be provisioned
inside a controlled research platform such as All of Us; ASCENT is exactly such a tool.

## Get the code at a pinned commit

The repository has no tagged release, so pin the commit. This fetches only that one
commit, about 32 MB of history and 73 MB checked out.

```bash
REV=0d40690821f6ae00dacc582e2dfd484b656aed6c
git init -q ascent-epi-demo && cd ascent-epi-demo
git fetch -q --depth 1 https://github.com/bayer-group/ascent-epi-demo "$REV"
git checkout -q FETCH_HEAD
git rev-parse HEAD
head -3 LICENSE
```

Every later block runs from inside `ascent-epi-demo/` unless it says otherwise.

## Start the stack

The Gemini key goes into `.env`, which the build reads; nothing else needs changing for
a local run. Every published port binds to `127.0.0.1`.

```bash
cp -n .env.template .env
# put the key on the GEMINI_API_KEY= line of .env, then:
docker compose up --build
```

The first build is long — the chat image alone can take a quarter of an hour — and it
builds the warehouse and indexes the synthetic vocabulary before the backend answers.
From another terminal:

```bash
docker compose ps -a
curl --fail http://localhost:8000/api/public/health
curl --fail http://localhost:8000/mcp/health
```

Read those two probes for what they are. The first is process liveness. The second checks
that the MCP servers mounted and Redis answers — **not** the warehouse, the medical coder,
the vector index or the model provider. A green pair does not mean a question will work;
the first real query is the test.

If you only want the MCP tools, skip the chat UI and its database:

```bash
docker compose up --build postgres redis qdrant medical-coder backend
```

The chat UI, when running, is at `http://localhost:3080` with a seeded local account
(the credentials are in the upstream README; change them with `CHAT_USER` and
`CHAT_PASSWORD` *before* first start — editing `.env` later does not rotate an existing
password).

### Connect an MCP client

The backend exposes three streamable-HTTP MCP servers:

| URL | Tools | Role |
|---|---:|---|
| `http://localhost:8000/mcp/ascent-mcp-v1` | 29 | the analysis surface — use this one |
| `http://localhost:8000/mcp/ascent-experimental` | 9 | lower-level variants of the data tools |
| `http://localhost:8000/mcp/ascent-ui-kit` | 3 | form and button widgets for hosts that render MCP-UI |

Register the first URL with your client as an HTTP transport. No authentication is
needed locally. If you set `API_AUTH_TOKEN` in `.env` (do, before the stack is reachable
from anywhere but your own machine), the main and experimental servers require
`Authorization: Bearer <token>`; keep that header in user-level client configuration, not
in a project file. The token is one shared secret, not per-user access control, and it
does not protect the medical-coder service or the health probes.

## The tool surface

The 29 tools on `ascent-mcp-v1`, counted from the source at the pinned commit (the paper
describes the research system and gives a different total):

| Group | Tools | Needs the model provider |
|---|---|---|
| Discovery | `get_omop_databases`, `get_non_omop_databases`, `get_database_schema`, `list_tables`, `describe_table`, `get_sample_data`, `get_ontology_info` | no |
| Coding | `lookup_medical_codes`, `list_placeholder_concepts`, `resolve_placeholders` | only when an LLM filter is requested |
| Question to SQL | `disambiguate_epidemiological_question`, `generate_epidemiological_sql_with_entities_omop`, `generate_epidemiological_sql_non_omop` | yes |
| Execution | `execute_sql` | no |
| Cohorts | `cohort_text_to_criteria`, `cohort_generate_sql_omop`, `cohort_generate_sql_non_omop`, `cohort_persist`, `generate_cohort_attrition`, `cohort_add_covariates`, `list_cohorts`, `get_cohort`, `rename_cohort`, `share_cohort`, `revoke_cohort_access`, `delete_cohort` | text-to-criteria and SQL generation do |
| Literature | `get_contextual_literature`, `compare_rwd_with_literature` | yes, and they search the public web |
| Bundle | `sync_skills` | no — returns agent instructions the server ships for its own workflows |

Two databases are served:

| Database | Schema | Contents |
|---|---|---|
| `SYNTHETIC_EHR_OMOP` | `CDM` | OMOP CDM 5.4, 1,000 people, clinical tables plus `concept`, `concept_ancestor`, `concept_relationship` and `vocabulary` |
| `SYNTHETIC_CLAIMS` | `DATA_202601` | the same 1,000 people as a messy source feed: `PATIENT_MASTER`, `ENCOUNTER`, `DX`, `PROCEDURES`, `MED_ORDERS`, `LAB_RESULTS`, `COVERAGE`, `FACILITY`, `SOCIAL_HX` |

How the pieces fit:

- **Generated SQL is Snowflake dialect.** The research system ran on Snowflake; the demo
  warehouse is DuckDB, and every statement is translated with sqlglot before it runs.
  If a generated query errors on a function name, the translation is the first suspect.
- **Placeholders, not codes, come out of SQL generation.** OMOP templates carry
  two-part markers such as `[condition@chronic kidney disease]`; SQL for the claims feed
  carries three-part ones that also name the coding system, such as `DXCODE`. `resolve_placeholders`
  swaps in code lists from the medical coder. Read the resolved list before executing —
  that is where a wrong concept set enters.
- **Only the `bge` encoder is indexed.** Asking `lookup_medical_codes` for another encoder
  fails with a missing-collection error; loading a model does not build its index.
- **An empty concept list is a coding result, not a patient count.** And when the LLM
  relevance filter fails validation the tool now raises rather than quietly returning the
  unfiltered list — treat that error as a failure, never as "zero matching patients".
- **Leave web fallbacks off for coding.** The coder's web-assisted search can return real
  codes that do not exist in the synthetic vocabulary.
- **`cohort_persist` needs Postgres.** Everything else reads the DuckDB warehouse;
  persisted cohorts go to Postgres and can be joined back to patient tables.

## The traps in the data, which are the point

The synthetic population is built to punish shortcuts. An agent working against it — or
a person checking an agent — should know these before trusting a number:

- **The codes look real and are not.** In `DXCODE`, `Q48.0`–`Q48.9` are atrial
  fibrillation; in real ICD-10 they are congenital lung anomalies. Do not relabel the
  synthetic vocabularies as `ICD10CM` to make a prompt "work", and do not let an agent use
  remembered codes. Search by concept *name* through the coder, then map with
  `concept_relationship` (`Maps to`) to the standard `MEDLEX` concept.
- **The raw source dates use four formats.** In the SQLite source file, `DX.DX_DT` mixes
  ISO dates, `DD-Mon-YYYY`, `MM/DD/YYYY` and Unix epoch seconds; a parse that expects one
  format silently drops most rows. The built warehouse normalises them to `DATE`, so this
  bites only when you query the source file directly — as the Try it block does.
- **Some dates are wrong on purpose.** A planted defect transposes the last two digits of
  a year, so the claims feed contains diagnoses dated decades after the observation
  window closes. A count with no date bounds includes them.
- **Two labels, one code system.** `DX_CD_TYPE` holds `D10` and `DX10` for the same
  system, plus `DX9`. Grouping by that column over-counts the systems.
- **Patients have site-local identifiers.** The claims feed lists far more MRNs than
  people; the person-level key is `MEMBER_ID`. Counting distinct MRNs inflates every
  denominator.
- **Observation periods have gaps.** A minority of people have more than one
  `observation_period`; do not merge the spells when computing prior observation or
  person-time.
- **Obesity is under-coded on purpose,** so a diagnosis-only prevalence comes out low
  against measured BMI. That is the realistic answer, not a bug.

The full list, with counts, is `data/synthetic/KNOWN_QUIRKS_1k.md` in the repository.

## Check an agent's answer without a model

`data/synthetic/ground_truth_1k.json` holds the expected answers for the shipped
population: cohort attrition ladders, prevalence by sex and age band, incidence per 1,000
person-years, treatment uptake and lab distributions. It was computed from the finished
database, so it is the reference to grade an agent against — and you can reproduce its
numbers yourself in plain SQL.

### On the host, through the upstream's own warehouse layer

This builds the same DuckDB warehouse the backend serves and queries it through the same
module `execute_sql` uses, with no container and no key. The install is the frozen lock
file, so expect a long first sync.

```bash
uv sync --frozen --extra dev
PYTHONPATH=./src uv run --no-sync pytest tests/ -q
```

At the pinned commit the backend suite reported 794 passed and 4 skipped; it uses local
fixtures and needs no services or keys.

```bash
export WAREHOUSE_DATA_DIR=data/synthetic WAREHOUSE_WORK_DIR=.warehouse
PYTHONPATH=./src uv run --no-sync python -m ascent_platform.warehouse.bootstrap
```

```bash
WAREHOUSE_DATA_DIR=data/synthetic WAREHOUSE_WORK_DIR=.warehouse \
PYTHONPATH=./src uv run --no-sync python - <<'PY'
import asyncio
from ascent_platform.warehouse.session import get_db, transpile

# Generated SQL is Snowflake dialect; the local warehouse rewrites it for DuckDB first.
snowflake_sql = """
SELECT COUNT(*) FROM DX
WHERE DX_DT > DATEADD(day, 0, TO_DATE('2026-01-31'))"""
print(transpile(snowflake_sql))

async def main():
    async with get_db("SYNTHETIC_EHR_OMOP") as cur:
        print("OMOP persons:", cur.execute("SELECT COUNT(*) FROM person").fetchone()[0])
    async with get_db("SYNTHETIC_CLAIMS") as cur:
        dtype = cur.execute("SELECT data_type FROM information_schema.columns "
                            "WHERE table_name = 'DX' AND column_name = 'DX_DT'").fetchone()[0]
        total = cur.execute("SELECT COUNT(*) FROM DX").fetchone()[0]
        late = cur.execute(snowflake_sql).fetchone()[0]
        top = cur.execute("SELECT MAX(DX_DT) FROM DX").fetchone()[0]
        print(f"claims DX_DT is {dtype}; {total} rows; {late} dated after the window, latest {top}")

asyncio.run(main())
PY
```

It logs a warning that the cohort store is unavailable — that is the missing Postgres,
and only cohort persistence needs it. Observed at the pinned commit: the transpiled
statement ends `CAST('2026-01-31' AS DATE) + INTERVAL 0 DAY`, 1,000 OMOP persons,
`DX_DT` typed `DATE`, 50,849 claims diagnoses of which 20 fall after the window, the
latest in 2091.

### Without the stack, with Python's standard library

The shipped archives are SQLite, so the same checks need no Python packages — only
`curl`, `shasum` (or `sha256sum`), `unzip` and Python 3. This block leaves the repository
and works in a new `ascent-data/` directory beside it, and **the attrition and EpiTrap
blocks below run from `ascent-data/`** — from anywhere else, `sqlite3.connect` would
quietly create an empty database instead of opening the real one. Fetch the data files at
the pinned commit (about 27 MB) and confirm them against the checksum list committed
beside them:

```bash
cd .. && mkdir -p ascent-data && cd ascent-data
RAW=https://raw.githubusercontent.com/bayer-group/ascent-epi-demo/0d40690821f6ae00dacc582e2dfd484b656aed6c/data/synthetic
for f in omop_synthetic_1k.db.zip source_synthetic_1k.db.zip ground_truth_1k.json SHA256SUMS; do
  curl -fsSL -o "$f" "$RAW/$f"
done
grep -E ' (omop|source)_synthetic_1k\.db\.zip| ground_truth_1k\.json' SHA256SUMS > want.sha256
shasum -a 256 -c want.sha256
unzip -o -q omop_synthetic_1k.db.zip && unzip -o -q source_synthetic_1k.db.zip
```

On Linux, `sha256sum -c want.sha256` does the same as `shasum -a 256 -c`.

A cohort's attrition ladder is the most useful thing to grade, because each step is a
decision an agent can get wrong. This rebuilds the "two diagnoses at least 30 days apart"
step for three cohorts, expanding each index condition through `concept_ancestor`:

```python
import json, sqlite3

omop = sqlite3.connect("omop_synthetic_1k.db")
gt = json.load(open("ground_truth_1k.json"))
cohorts = {c["id"]: c for c in gt["cohorts"]}

def confirmed(concept_id, min_gap_days=30):
    """Persons with two diagnoses of the concept (or a descendant) >= min_gap_days apart."""
    return omop.execute("""
        SELECT COUNT(*) FROM (
          SELECT co.person_id
          FROM condition_occurrence co
          JOIN concept_ancestor ca ON ca.descendant_concept_id = co.condition_concept_id
          WHERE ca.ancestor_concept_id = ?
          GROUP BY co.person_id
          HAVING julianday(MAX(co.condition_start_date))
               - julianday(MIN(co.condition_start_date)) >= ?
        )""", (concept_id, min_gap_days)).fetchone()[0]

# cohort id -> the prevalence key holding its index condition's standard concept
index_condition = {"t2dm_metformin_uncontrolled": "t2dm",
                   "hf_reduced_ef_on_beta_blocker": "heart_failure",
                   "untreated_hypertension": "hypertension"}
for cohort_id, key in index_condition.items():
    step = cohorts[cohort_id]["attrition"][1]
    got = confirmed(gt["prevalence"][key]["standard_concept_id"])
    print(f"{cohort_id:30s} {step['step']!r}: expected {step['n']}, got {got}",
          "OK" if got == step["n"] else "MISMATCH")
```

All three matched at the pinned commit (89, 13 and 384). When an agent's cohort count
disagrees with the ladder, find the first step where it diverges; that step names the
decision it got wrong.

## EpiTrap — the benchmark that ships with it

EpiTrap is a set of goal-only epidemiological questions, each built so that the obvious
single query commits one recognised error — a missing washout, the wrong denominator,
unconverted units, information leaking from the future — without the prompt ever naming
it. It comes in two bindings: 153 items on OMOP CDM and 156 on a non-OMOP EHR schema.
Each item carries the trap, the grading logic and a list of query strategies labelled
PASS or FAIL. **There is no gold SQL**: grading is a judgement about whether the
submitted SQL applies the required guardrail, and the authors score with a model judge
whose input they document.

What it is not: there are no executed results, trajectories or reference answers, because
those were computed on licensed EHR data. And the non-OMOP binding is written against a
commercial EHR schema that is not the demo's claims feed, so its items can be graded on
the SQL an agent writes but not executed against anything a reader has. The OMOP binding
can be run against the synthetic warehouse, though its questions were not written for
this population and no expected values exist for it.

**This skill does not reproduce or paraphrase any EpiTrap question, trap description,
grading logic or answer.** Fetch the files and read them in place.

```bash
mkdir -p epitrap
for f in epitrap-omop.jsonl epitrap-non-omop.jsonl; do
  curl -fsSL -o "epitrap/$f" \
    "https://raw.githubusercontent.com/bayer-group/ascent-epi-demo/0d40690821f6ae00dacc582e2dfd484b656aed6c/data/epitrap-dataset/$f"
done
python3 - <<'PY'
import json
from collections import Counter

for name in ("epitrap/epitrap-omop.jsonl", "epitrap/epitrap-non-omop.jsonl"):
    items = [json.loads(line) for line in open(name) if line.strip()]
    assert len({i["id"] for i in items}) == len(items), "duplicate ids"
    fields = sorted(set().union(*(i.keys() for i in items)))
    # One item carries a scenario-conditional verdict string, so read the prefix.
    verdicts = Counter(a["verdict"].split()[0] for i in items for a in i["approaches"])
    no_pass = [i["id"] for i in items
               if not any(a["verdict"].startswith("PASS") for a in i["approaches"])]
    print(name, len(items), "items | fields:", fields)
    print("  categories:", dict(Counter(i["category"] for i in items).most_common()))
    print("  verdict prefixes:", dict(verdicts), "| items without a PASS route:", no_pass)
PY
```

Observed at the pinned commit: 153 and 156 items, the seven fields `id`, `trap_topic`,
`category`, `prompt`, `what_it_tests`, `grading_logic` and `approaches`, category counts
matching the upstream release notes, and every item offering at least one PASS route.
`category` is the shape of the requested answer (count, proportion, rate,
summary-statistic, table) and plays no part in grading.

To grade a run, give a judge each item's four rubric fields followed by the SQL your agent
actually executed, and ask for a verdict with the deciding clause quoted. The label
definitions — what counts as PASS, FAIL and UNKNOWN — and the exact judge layout are in
the "How to grade" section of `data/epitrap-dataset/README.md`; use them as written there,
especially if you want numbers comparable with the paper's. The sketch below only
assembles the inputs.

```python
import json

def load(path):
    return {item["id"]: item for item in map(json.loads, filter(str.strip, open(path)))}

def judge_input(item, candidate_sql):
    """Everything a grader needs for one item: the four rubric fields, then the SQL under test."""
    routes = "\n".join(f"  - {a['description']} -> {a['verdict']}" for a in item["approaches"])
    return (f"Question {item['id']}\n\nPrompt: {item['prompt']}\n\n"
            f"Trap: {item['what_it_tests']}\n\nGrading logic: {item['grading_logic']}\n\n"
            f"Approaches:\n{routes}\n\nCandidate SQL:\n{candidate_sql}\n\n"
            "Answer PASS, FAIL or UNKNOWN, quoting the clause that decides it.")

def verdict_prefix(v):
    return v.split()[0]  # one item carries a two-scenario verdict string

omop_items = load("epitrap/epitrap-omop.jsonl")
first = next(iter(omop_items.values()))
block = judge_input(first, "SELECT COUNT(*) FROM person")
print(len(omop_items), "items; judge input for", first["id"], "is", len(block), "characters")
assert all(verdict_prefix(a["verdict"]) in {"PASS", "FAIL", "UNKNOWN"}
           for i in omop_items.values() for a in i["approaches"])
```

Keep the judge's grade and its quoted clause together for every item, so a human can
audit any verdict against the SQL that earned it. Do not publish per-item judge inputs or
outputs alongside your scores: they contain the benchmark's text.

## What this skill does not do

- It does not connect ASCENT to a real clinical database. The demo is wired to its own
  synthetic warehouse; adapting it to a real OMOP instance is development work, and brings
  that instance's data-use terms and vocabulary licences with it.
- It does not estimate anything about real populations. The ground truth describes 1,000
  generated people.
- It does not run the 10,000-patient scale. Those archives are not committed and no
  public download is configured; the upstream documents generating them locally.
- It does not cover the medical coder's direct HTTP API, which the upstream documents in
  `services/medical-coder/USAGE.md`, or exposing the stack beyond your own machine, for
  which the upstream keeps a checklist in `docs/operations.md`.

## Try it

A self-contained check that the shipped data still says what this skill claims. No
account, no key, no container and no installs beyond `curl` and Python 3's standard
library.

**Data** — the 1,000-person synthetic OMOP database, the matching claims-style source
database, the ground-truth file and the checksum list, all fetched from the repository at
commit `0d40690821f6ae00dacc582e2dfd484b656aed6c` (about 27 MB in total). BSD 3-Clause,
copyright Bayer; generated, with no real patients. Confirmed reachable 2026-10-21.

**Run** — verifies checksums, then routes through two traps on purpose: a code that looks
like ICD-10 and is not, and a raw date column that a single-format parse would gut.

```bash
COLD=$(mktemp -d) && cd "$COLD"
REV=0d40690821f6ae00dacc582e2dfd484b656aed6c
RAW=https://raw.githubusercontent.com/bayer-group/ascent-epi-demo/$REV/data/synthetic
for f in omop_synthetic_1k.db.zip source_synthetic_1k.db.zip ground_truth_1k.json SHA256SUMS; do
  curl -fsSL -o "$f" "$RAW/$f" || { echo "download failed: $f"; exit 1; }
done
cat > check_ascent_data.py <<'PY'
import hashlib, json, re, sqlite3, zipfile
from datetime import datetime, timezone, timedelta

# 1. Checksums against the list committed at the same revision.
sums = dict(reversed(l.split()) for l in open("SHA256SUMS") if l.strip())
for f in ("omop_synthetic_1k.db.zip", "source_synthetic_1k.db.zip", "ground_truth_1k.json"):
    got = hashlib.sha256(open(f, "rb").read()).hexdigest()
    assert got == sums[f], f"checksum mismatch: {f}"
print("checksums: 3/3 match SHA256SUMS")

for z in ("omop_synthetic_1k.db.zip", "source_synthetic_1k.db.zip"):
    zipfile.ZipFile(z).extractall(".")
omop = sqlite3.connect("omop_synthetic_1k.db")
src = sqlite3.connect("source_synthetic_1k.db")
gt = json.load(open("ground_truth_1k.json"))

# 2. Population size agrees with the ground truth's own header.
n = omop.execute("SELECT COUNT(*) FROM person").fetchone()[0]
assert n == gt["meta"]["n_patients"], (n, gt["meta"])
print("persons:", n)

# 3. The trap: these codes look like ICD-10 and are not.
synthetic = {"MEDLEX", "DXCODE", "DXCODE9", "PHARMLEX", "DRUGPKG",
             "LABLEX", "LABLOCAL", "PXCODE", "ENCTYPE"}
present = {r[0] for r in omop.execute("SELECT vocabulary_id FROM vocabulary")}
real = omop.execute("SELECT COUNT(*) FROM concept "
                    "WHERE vocabulary_id IN ('ICD10CM', 'ICD9CM', 'CPT4', 'RxNorm', 'LOINC')"
                    ).fetchone()[0]
snomed = omop.execute("SELECT COUNT(*) FROM concept WHERE vocabulary_id = 'SNOMED'").fetchone()[0]
row = omop.execute("""
    SELECT c2.concept_id, c2.concept_name, c2.vocabulary_id
    FROM concept c1
    JOIN concept_relationship r ON r.concept_id_1 = c1.concept_id AND r.relationship_id = 'Maps to'
    JOIN concept c2 ON c2.concept_id = r.concept_id_2
    WHERE c1.vocabulary_id = 'DXCODE' AND c1.concept_code = 'Q48.0'""").fetchone()
print("synthetic vocabularies present:", len(synthetic & present), "of", len(synthetic),
      "| ICD/CPT/RxNorm/LOINC concepts:", real, "| concepts filed as SNOMED:", snomed)
print("DXCODE Q48.0 maps to:", row)
assert synthetic <= present and real == 0 and row[1] == "Atrial fibrillation" and row[2] == "MEDLEX"

# 4. Every prevalence count in the ground truth, rebuilt by descendant expansion.
sql = """SELECT COUNT(DISTINCT co.person_id) FROM condition_occurrence co
         JOIN concept_ancestor ca ON ca.descendant_concept_id = co.condition_concept_id
         WHERE ca.ancestor_concept_id = ?"""
miss = [k for k, p in gt["prevalence"].items()
        if omop.execute(sql, (p["standard_concept_id"],)).fetchone()[0] != p["n_patients"]]
print(f"prevalence entries reproduced: {len(gt['prevalence']) - len(miss)}/{len(gt['prevalence'])}", miss)
assert not miss

# 5. Raw source dates: an ISO-only parse silently drops rows; four parsers drop none.
def parse(s):
    if re.fullmatch(r"-?\d+", s):
        return (datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=int(s))).date()
    for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None
dates = [r[0] for r in src.execute("SELECT DX_DT FROM DX")]
iso_only = sum(1 for s in dates if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s))
parsed = sum(1 for s in dates if parse(s) is not None)
print(f"DX rows {len(dates)} | ISO-only parse keeps {iso_only} | four-format parse keeps {parsed}")
assert parsed == len(dates) and iso_only < len(dates)
print("ALL CHECKS PASSED")
PY
python3 check_ascent_data.py
```

**Expect.**

*Invariants* — a failure means this skill is wrong:

- All three files match the `SHA256SUMS` committed at the same commit.
- The `person` count equals the ground truth's `n_patients`.
- All nine synthetic vocabularies are present; no concept is filed under ICD-10-CM,
  ICD-9-CM, CPT-4, RxNorm or LOINC; `DXCODE` `Q48.0` maps to the `MEDLEX` concept
  *Atrial fibrillation*.
- Every prevalence entry in the ground truth is reproduced exactly by descendant
  expansion through `concept_ancestor`.
- A four-format parse keeps every raw `DX_DT` value, and an ISO-only parse keeps fewer.

*Observed values* — at commit `0d40690`, 2026-10-21; a change means drift to investigate:

- 1,000 persons; 20 concepts filed as `SNOMED`; `Q48.0` maps to concept id 20001000.
- 50 of 50 prevalence entries reproduced.
- 50,849 raw `DX` rows, of which an ISO-only parse keeps 19,104.
- Cold run time about two minutes on a contended connection; the work itself takes
  seconds.

## Sources

- Repository, pinned: https://github.com/bayer-group/ascent-epi-demo/tree/0d40690821f6ae00dacc582e2dfd484b656aed6c
- Paper: Ziletti A, D'Ambrosi L, Tuchardt M, Kondziella T. *ASCENT: An Agentic System over
  the Model Context Protocol for Real-World Clinical Data Analysis.* arXiv:2609.24620 (2026).
  https://arxiv.org/abs/2609.24620
- Query-library paper: *Generating Patient Cohorts from Electronic Health Records Using
  Two-Step Retrieval-Augmented Text-to-SQL Generation.* arXiv:2502.21107 (ECAI 2025).
  https://arxiv.org/abs/2502.21107
- OHDSI ATHENA vocabulary download: https://athena.ohdsi.org
- The Book of OHDSI, Standardized Vocabularies chapter (licence-required vocabularies):
  https://ohdsi.github.io/TheBookOfOhdsi/StandardizedVocabularies.html
- SNOMED International licensing: https://www.snomed.org/get-snomed
- UMLS Metathesaurus License Agreement, section 12.3 (Category 3) and Appendix 1 (CPT is
  listed as Category 3): https://uts.nlm.nih.gov/uts/assets/LicenseAgreement.pdf
