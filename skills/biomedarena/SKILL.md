---
name: biomedarena
description: BioMedArena is an MIT harness that puts 166 registered benchmark entries — 155 biomedical benchmarks plus 11 aliases — behind one CLI. This skill maps that index, resolves every entry to the dataset the loader actually reads, and measures the licence and access gate on each, because the harness licence covers none of them. The map lands on disk as CSV.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [benchmark, agents, evaluation, licensing]
covers: [biomedarena, benchmark, agent evaluation, harness, biomedical, clinical, medical qa, chemistry, protein, genomics, rna, drug, licensing, non-commercial, share-alike, gated dataset, huggingface, bixbench, lab-bench, medxpertqa, healthbench, medcalc, mmlu, pubmedqa, superchem, gpqa, contamination, reproducibility, leaderboard, data access]
papers: [doi:10.48550/arXiv.2605.06177]
access: [open, registered, controlled]
datasets: [https://raw.githubusercontent.com/AI-in-Health/BioMedArena/main/docs/benchmark_datasets.md, https://huggingface.co/api/datasets/futurehouse/BixBench]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: BioMedArena at commit 4ea206b (2026-06-25, no tagged release) / Python 3.12.8 / datasets 5.0.1
  executed: 6
  unverified: 0
  unverified_reason: >-
    All six standalone blocks executed against the pinned commit and the live Hugging Face
    API. Nothing here runs a model, so no provider key was needed and none of the scoring
    path was exercised.
---
# BioMedArena

**An index, not a benchmark.** BioMedArena is an evaluation harness that registers **166 CLI
benchmark entries** — 155 canonical biomedical benchmarks plus 11 deprecated aliases — behind
one command, alongside 76 tool schemas. It holds almost none of that data itself. It reaches
for it.

That distinction is the whole reason this skill exists. The harness is MIT. **The 155 things
behind it are not.** Measured below: **68 of the 155 carry terms that clearly permit commercial
use.** The other 87 are silent, restricted, unreachable, or not the benchmark the name promises.
A reader who reads MIT on the repository and starts running entries is wrong more often than
right. This page is the map of which is which, and the code that regenerates it.

The benchmarks it fronts are leaves, and several deserve their own treatment — the `bixbench`
skill covers one of them in depth. This one stays at the index level and does not re-document
what sits underneath.

## What the harness's own licence covers, and what it does not

`AI-in-Health/BioMedArena` ships an **MIT** `LICENSE`, ungated, installable from GitHub with no
account. That settles the harness: any reader can obtain and run it.

Two caveats worth knowing before you lean on that.

- The copyright line reads `Copyright (c) 2026` and **names no holder**; `pyproject.toml`
  credits "BioMedArena contributors". The grant is unambiguous, the grantor is not identified.
- The tool layer includes a port of a third-party skill collection. Its own `NOTICE.md` states
  that at port time *"the upstream repository did not publish a `LICENSE` file at its root"* and
  that only endpoint paths and payload shapes were reimplemented. That is the same
  facts-are-not-expression reasoning this registry uses, and it is disclosed rather than hidden
  — but it means one part of an MIT repo rests on an unlicensed upstream.

**MIT covers the harness code. It confers nothing on the datasets.** Every benchmark is
downloaded at run time from its own publisher under its own terms, and those terms are not
recorded anywhere in the harness. Measuring them is the rest of this page.

## Install, and confirm the count

Provider SDKs and NumPy/SciPy come in as hard dependencies, so use a virtualenv. No API key is
needed for anything on this page — listing and inspecting the registry never calls a model.

Pin the commit. There are **no tags and no releases**, so `@main` is a moving target.

```bash
python3 -m venv .venv
./.venv/bin/pip install -q --disable-pip-version-check \
  "biomedarena @ git+https://github.com/AI-in-Health/BioMedArena.git@4ea206b8a68e8f66357623e349774bf26431446f"
./.venv/bin/pip install -q --disable-pip-version-check "datasets>=2.16" "huggingface_hub>=0.24"

./.venv/bin/biomedarena list-benchmarks | wc -l
./.venv/bin/biomedarena list-benchmarks | head -5
```

Run 2026-08-27:

```
     166
aa_lcr
agentclinic
bioasq
bioprobench
bixbench
```

`list-modes` and `list-backbones` are the other two read-only commands — four harness modes and
nine registered backbone identifiers across three commercial API providers. Both need no key.

The headline figure holds, with a caveat the badge does not carry: **166 is entries, not
benchmarks.** The repository's own README says so — 155 canonical plus 11 deprecated
compatibility aliases — and the next block confirms it from the installed package.

## The shape of the registry

Two loader families. 129 entries go through one generic Hugging Face loader driven by a
declarative spec; 26 have hand-written loaders. That split decides how much you can learn
programmatically, so establish it first.

```python
from harness.cli import BENCHMARKS
from harness.eval.hf_benchmark_registry import (
    HF_BENCHMARK_SPECS, HF_VERIFIED_BENCHMARK_KEYS, HF_DEPRECATED_ALIASES)

hf = sorted(HF_VERIFIED_BENCHMARK_KEYS)
aliases = sorted(HF_DEPRECATED_ALIASES)
dedicated = sorted(k for k in BENCHMARKS if k not in hf and k not in aliases)

print(f"CLI entries            {len(BENCHMARKS)}")
print(f"  generic HF loader    {len(hf)}")
print(f"  dedicated loaders    {len(dedicated)}")
print(f"  deprecated aliases   {len(aliases)}")
print(f"specs defined but not exposed  {len(HF_BENCHMARK_SPECS) - len(hf) - len(aliases)}")
print()
print("dedicated:", " ".join(dedicated))
```

```
CLI entries            166
  generic HF loader    129
  dedicated loaders    26
  deprecated aliases   11
specs defined but not exposed  27

dedicated: aa_lcr agentclinic bioasq bioprobench bixbench genotex gpqa_bio healthbench hle_gold labbench labbench2 medagentbench medcalc medhelm medmcqa medqa medxpertqa medxpertqa_mm mmlu pathvqa pubmedqa quick_suite rag_essential super_chemistry superchem supergpqa
```

Twenty-seven further specs exist in the source without reaching the CLI. Six carry an explicit
marker — four training-only corpora and two the maintainers pulled as non-benchmarks — and the
other twenty-one are simply absent from the verified list, with nothing in the code saying why.
All twenty-seven are importable and **not** part of the 166; do not count them.

## Three fields that are constants, not measurements

The harness publishes a machine-readable metadata table per benchmark, and it carries exactly
the three fields you would reach for first — `gated`, `license`, `count`. Read one row and each
looks like an answer. Read all 129 and none of them is.

```python
import collections
from harness.eval.hf_benchmark_registry import hf_verified_metadata, validate_hf_metadata

meta = hf_verified_metadata()
for field in ("gated", "license", "count"):
    tally = collections.Counter(str(row[field]) for row in meta.values())
    values = ", ".join(f"{v}={n}" for v, n in tally.most_common())
    print(f"{field:8} over {len(meta)} entries -> {values}")

print()
print("release-gate metadata problems:", validate_hf_metadata() or "none")
```

```
gated    over 129 entries -> False=129
license  over 129 entries -> unknown=129
count    over 129 entries -> unknown=129

release-gate metadata problems: none
```

**Not one spec in the source sets any of the three.** The metadata builder pulls each key out of
a spec's extras with a fallback, and nothing ever supplies the key — so 129 rows read "not gated"
because `False` is the default argument, and `license` and `count` resolve the same way to the
literal string `unknown`. The repository's own release gate checks that `license` is *present*,
and passes. A field can satisfy its own validator and still mean nothing.

This propagates. The generated inventory in `docs/benchmark_datasets.md` has a **Gated** column
reading `no` on 158 of 166 rows, and that column is this default rendered as a fact. Two of those
`no` rows are repositories that answer 401 to any anonymous request; a third is gated for
case-by-case owner approval.

**Do not filter on these fields. Measure the sources instead.**

## The measured licence map

This resolves every canonical entry to the source its loader actually reads and asks Hugging Face
what that source says about itself. Sources for the 26 dedicated loaders have no machine-readable
field — the inventory writes them as prose — so they are transcribed here from the loader
modules.

```python
import collections, concurrent.futures, json, urllib.error, urllib.request
from harness.cli import BENCHMARKS
from harness.eval.hf_benchmark_registry import HF_BENCHMARK_SPECS, HF_VERIFIED_BENCHMARK_KEYS

# Read off harness/eval/bench_*.py at the pinned commit.
DEDICATED = {
    "aa_lcr": "hf:ArtificialAnalysis/AA-LCR",
    "bioasq": "hf:enelpol/rag-mini-bioasq",
    "bioprobench": "hf:BioProBench/BioProBench",
    "bixbench": "hf:futurehouse/BixBench",
    "gpqa_bio": "hf:Idavidrein/gpqa",
    "healthbench": "hf:openai/healthbench",
    "hle_gold": "hf:futurehouse/hle-gold-bio-chem",
    "labbench": "hf:futurehouse/lab-bench",
    "labbench2": "hf:EdisonScientific/labbench2",
    "medcalc": "hf:ncbi/MedCalc-Bench-v1.2",
    "medhelm": "hf:UTAustin-AIHealth/MedHallu",
    "medmcqa": "hf:openlifescienceai/medmcqa",
    "medqa": "hf:GBaker/MedQA-USMLE-4-options",
    "medxpertqa": "hf:TsinghuaC3I/MedXpertQA",
    "medxpertqa_mm": "hf:TsinghuaC3I/MedXpertQA",
    "mmlu": "hf:cais/mmlu",
    "pathvqa": "hf:flaviagiammarino/path-vqa",
    "pubmedqa": "hf:qiaojin/PubMedQA",
    "super_chemistry": "hf:ZehuaZhao/SUPERChem",
    "superchem": "hf:ZehuaZhao/SUPERChem",
    "supergpqa": "hf:m-a-p/SuperGPQA",
    # No external dataset at all — these run question lists written into the harness.
    "agentclinic": "in-repo:bench_agentclinic.py",
    "genotex": "in-repo:bench_genotex.py",
    "quick_suite": "in-repo:bench_quick_suite.py",
    "rag_essential": "in-repo:bench_rag_essential.py",
    "medagentbench": "vendor:MedAgentBench (absent -> in-repo fallback)",
}

def effective_source(key):
    """Where the loader actually reads from — not always what the inventory prints."""
    if key in DEDICATED:
        return DEDICATED[key]
    spec = HF_BENCHMARK_SPECS[key]
    if spec.extra.get("raw_urls"):
        return "url:" + sorted(spec.extra["raw_urls"].values())[0].rsplit("/", 3)[0]
    return "hf:" + spec.extra.get("loader_repo", spec.repo)

entries = {k: effective_source(k)
           for k in sorted(set(HF_VERIFIED_BENCHMARK_KEYS) | set(DEDICATED))}
repos = sorted({v[3:] for v in entries.values() if v.startswith("hf:")})
print(f"{len(entries)} canonical entries -> {len(repos)} distinct HuggingFace repos "
      f"+ {len({v for v in entries.values() if not v.startswith('hf:')})} non-HF sources")

def probe(repo):
    req = urllib.request.Request(f"https://huggingface.co/api/datasets/{repo}",
                                 headers={"User-Agent": "biomedarena-licence-map"})
    try:
        with urllib.request.urlopen(req, timeout=60) as fh:
            ctype = fh.headers.get("content-type", "")
            if "application/json" not in ctype:      # a 200 is not proof of an answer
                return repo, {"http": 200, "licence": None, "gated": None,
                              "note": f"non-JSON response ({ctype})"}
            body = json.loads(fh.read().decode())
        lic = (body.get("cardData") or {}).get("license")
        if isinstance(lic, list):
            lic = "|".join(lic)
        return repo, {"http": 200, "licence": lic, "gated": body.get("gated"), "note": ""}
    except urllib.error.HTTPError as e:
        return repo, {"http": e.code, "licence": None, "gated": None, "note": e.reason}

with concurrent.futures.ThreadPoolExecutor(8) as pool:
    cards = dict(pool.map(probe, repos))

PERMISSIVE = {"apache-2.0", "mit", "bsd-3-clause", "bsd-2-clause", "cc0-1.0", "odc-by",
              "cc-by-2.0", "cc-by-2.5", "cc-by-3.0", "cc-by-4.0", "afl-3.0", "ms-pl",
              "openmdw-1.1", "isc", "unlicense"}

def verdict(source):
    if source.startswith("in-repo:"):
        return "questions written into the harness"
    if source.startswith("vendor:"):
        return "needs a vendor checkout the repo does not ship"
    if source.startswith("url:"):
        return "raw files from a code repository"
    card = cards[source[3:]]
    if card["http"] != 200:
        return f"unreachable without credentials (HTTP {card['http']})"
    lic = (card["licence"] or "").lower()
    if lic in ("", "unknown", "other"):
        return "no licence stated on the dataset card"
    parts = [p.strip() for p in lic.split("|")]
    if any("-nc" in p for p in parts):
        return "non-commercial"
    if any("-nd" in p for p in parts):
        return "no-derivatives"
    if any(p.startswith(("cc-by-sa", "gpl", "agpl", "lgpl")) for p in parts):
        return "share-alike / copyleft"
    if all(p in PERMISSIVE for p in parts):
        return "permissive"
    return f"unclassified ({lic})"

tally = collections.Counter(verdict(s) for s in entries.values())
print()
for name, n in tally.most_common():
    print(f"{n:5}  {name}")
print(f"{sum(tally.values()):5}  TOTAL")

gates = {r: c["gated"] for r, c in cards.items() if c["gated"] not in (False, None)}
unreach = {r: c["http"] for r, c in cards.items() if c["http"] != 200}
print()
print("HuggingFace access gates :", gates or "none")
print("unreachable anonymously  :", unreach or "none")
json.dump({"entries": entries, "cards": cards}, open("licence_map.json", "w"), indent=1)
```

Measured 2026-08-27 against the pinned commit — these are dataset cards on a live host, so treat
a changed number as drift, not as a broken skill:

```
155 canonical entries -> 108 distinct HuggingFace repos + 7 non-HF sources

   68  permissive
   67  no licence stated on the dataset card
    6  share-alike / copyleft
    4  questions written into the harness
    4  non-commercial
    2  unreachable without credentials (HTTP 401)
    2  raw files from a code repository
    1  no-derivatives
    1  needs a vendor checkout the repo does not ship
  155  TOTAL

HuggingFace access gates : {'EdisonScientific/labbench2': 'auto', 'Idavidrein/gpqa': 'auto', 'futurehouse/hle-gold-bio-chem': 'auto', 'nlplabtdtu/health_qa': 'manual'}
unreachable anonymously  : {'bigbio/clicr': 401, 'biomedbench/BioMedBench': 401}
```

**Under half the set is cleanly usable.** 68 of 155 carry a licence that permits commercial use
and redistribution. The largest single bucket is the one that answers nothing: 67 entries whose
Hugging Face card declares no licence, or the literal string `unknown`, or `other`.

**A blank card is not a permissive licence, and it is not proof one is missing either.** These
are mostly third-party mirrors of corpora that do carry terms at their original home — BioCreative
shared-task corpora, MoleculeNet splits, published RNA and protein benchmark suites. The card is
silent; the corpus usually is not. For any of those 67, the licence question is answered at the
original publication, not on Hugging Face, and this harness does not record where that is.

Silent really does mean silent. Those 67 entries sit on 50 distinct repositories; each was checked
for a `LICENSE` file and for a licence named anywhere in its README. **Three of the fifty say
anything** — one ships a `LICENSE` file, two name terms in README prose. Hugging Face is not
where this question gets answered, and there is no second field to fall back on.

**How this was sampled.** It was not sampled. All 155 canonical entries were resolved and all 108
distinct Hugging Face repositories were probed, one API call each. The measurement is complete
for what a dataset card states. It is *not* a legal review — a card is a self-declaration, and
the previous paragraph is the reason to treat it as a starting point.

## Named traps

Ten specific things this registry will hand a reader who trusts the index. Each was checked
individually.

| what | the finding |
|---|---|
| `bioprobench` | Card reads **`cc-by-nc-4.0`**. Non-commercial terms on the benchmark's own data. Registered like any other entry and marked "not gated". |
| `hf_ddi_corpus_2013`, `hf_genomics_long_range`, `hf_medexqa` | The other three non-commercial entries. `hf_ddi_corpus_2013` is also the target of the deprecated alias `hf_openddi`, so it is reachable under two names. |
| `hf_mednli` | Reads a third-party mirror carrying `cc-by-sa-4.0`. MedNLI's own distribution is **PhysioNet Credentialed Access under a Data Use Agreement**, because it is derived from MIMIC-III clinical notes. The alias `hf_mednli_augmented` points at the same mirror. Check the PhysioNet record before using either. |
| `labbench`, `labbench2`, `medcalc`, `hf_ebm_nlp` | **CC-BY-SA-4.0.** Fine to run; share-alike propagates to anything derived from them, which is a redistribution question, not an access one. |
| `hf_cord19_qa` | Card declares `cc-by-nd-4.0`, `cc-by-sa-4.0` **and** `other` together. No-derivatives and share-alike in the same field is not a licence a reader can act on without going upstream. |
| `agentclinic`, `genotex` | Neither loads the benchmark it is named after. Both are **question lists written into the harness source** — a vendor checkout is attempted first, silently swallowed on any failure, and the built-in list is returned. The inventory's Source column reads "AgentClinic official release" and "GenoTEX official data". |
| `medagentbench` | Wants `vendors/MedAgentBench`, which the repository does not ship. Absent, it returns **one** built-in task. |
| `bioasq` | Loads `enelpol/rag-mini-bioasq`, a reduced derivative. The inventory says "BioASQ official/local source". |
| `hf_clicr`, `hf_biomedbench` | Both HF repositories answer **401 anonymously**. Both are marked "not gated". |
| `hf_healthqa` | `nlplabtdtu/health_qa` is **`gated: manual`** — access granted case by case by the dataset owner. Marked "not gated". |

Two structural faults behind that table.

**Six entries read from a source other than the one the inventory names.** The spec supports
`loader_repo` and `raw_urls` overrides, and the metadata function reports `spec.repo` regardless.
Four resolve to a different Hugging Face repository — `hf_anatem`, `hf_ebm_nlp`, `hf_litcovid`,
`hf_ms2` — and two fetch TSVs from `raw.githubusercontent.com` while the inventory links Hugging
Face — `hf_pgr`, `hf_ppi_benchmark`. `hf_litcovid` is the sharpest case: the repository the
inventory links answers 401, and the one the loader reads works fine. The CSV written further
down carries both columns so you can see all six.

A seventh case is a plain documentation error rather than an override — `medxpertqa_mm`'s
inventory link names a repository that does not exist, while the loader uses the correct one
with a subset argument.

**Twelve entries sit on repositories that hold a loader script and no data**, or answer 401.
Since `datasets` 4 removed script-based loading, these depend entirely on Hugging Face's
auto-converted Parquet. Loaded individually at the pinned commit with `datasets` 5.0.1: five
returned rows through that route (`hf_bc5cdr`, `hf_blurb`, `hf_hallmarks_of_cancer`, `hf_jnlpba`,
`hf_ncbi_disease`) and **seven returned zero** (`hf_biocreative_viii_biored`, `hf_biored`,
`hf_biomedbench`, `hf_clicr`, `hf_clinical_trials_eligibility_nlp`, `hf_craft`,
`hf_meddialogqa`). The CLI prints `Loader returned 0 tasks for <name>.` and **exits 0**, so a
matrix script sweeping benchmarks records success.

For `hf_clinical_trials_eligibility_nlp` the empty result is upstream behaving correctly — n2c2
corpora require a data use agreement and that repository publishes only the loader — but the
harness reports it identically to a network hiccup.

## Benchmark integrity

Fetching an index is safe. Reading answers is not, and this registry makes both easy.

- **Never publish answer keys, distractors, rubrics or reference solutions** pulled through this
  harness. Contamination is not a per-user problem — once a benchmark's answers are in a public
  corpus, every future model's score on it is uninterpretable, for everybody, permanently.
  Several of these datasets carry canary strings precisely so leakage can be detected later;
  point at the upstream card for those rather than copying the value anywhere.
- **The harness itself ships graded material in-source.** The four `in-repo:` entries above are
  question-and-answer lists sitting in a public repository with no canary and no separation
  between prompt and key. Nothing stops you printing them. Treat them as answer keys, because
  that is what they are, and note that anything already scraped from that repository is
  compromised as an evaluation set.
- Reading an item makes it worthless as a blind test for you specifically. That only matters if
  you later evaluate on the same items — but you usually do.

## Get the files

The deliverable of this skill is the map, not the benchmarks. Downloading 155 datasets would be
tens of gigabytes and would put a reader inside terms they have not checked, which is the exact
mistake the page exists to prevent — so what lands on disk is the index, with every entry
resolved to its real source and its measured licence beside it.

*Continues from the licence-map block above — reads the `licence_map.json` it wrote.*

```python
import csv, json, os

MAP = json.load(open("licence_map.json"))
entries, cards = MAP["entries"], MAP["cards"]

from harness.eval.hf_benchmark_registry import (
    HF_BENCHMARK_SPECS, HF_VERIFIED_BENCHMARK_KEYS, HF_DEPRECATED_ALIASES)

OUT = "Data/biomedarena"
os.makedirs(OUT, exist_ok=True)

def declared(key):
    """What the generated inventory prints as this entry's source."""
    spec = HF_BENCHMARK_SPECS.get(key)
    return f"hf:{spec.repo}" if spec else entries[key]

rows = []
for key in sorted(entries):
    eff = entries[key]
    card = cards.get(eff[3:], {}) if eff.startswith("hf:") else {}
    rows.append({
        "benchmark": key,
        "loader": "generic_hf" if key in HF_VERIFIED_BENCHMARK_KEYS else "dedicated",
        "declared_source": declared(key),
        "effective_source": eff,
        "source_matches_inventory": declared(key) == eff,
        "hf_licence": card.get("licence") or "",
        "hf_gated": "" if card.get("gated") in (None, False) else card["gated"],
        "http": card.get("http", ""),
    })

with open(f"{OUT}/benchmarks.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

with open(f"{OUT}/aliases.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["alias", "resolves_to"])
    w.writerows(sorted(HF_DEPRECATED_ALIASES.items()))

summary = {
    "harness_commit": "4ea206b8a68e8f66357623e349774bf26431446f",
    "cli_entries": len(entries) + len(HF_DEPRECATED_ALIASES),
    "canonical_entries": len(entries),
    "deprecated_aliases": len(HF_DEPRECATED_ALIASES),
    "distinct_hf_repos": len(cards),
    "source_mismatches": sum(1 for r in rows if not r["source_matches_inventory"]),
    "hf_gated": {r: c["gated"] for r, c in cards.items() if c["gated"] not in (None, False)},
    "unreachable": {r: c["http"] for r, c in cards.items() if c["http"] != 200},
}
with open(f"{OUT}/summary.json", "w") as fh:
    json.dump(summary, fh, indent=2)

for name in ("benchmarks.csv", "aliases.csv", "summary.json"):
    print(f"{OUT}/{name:16} {os.path.getsize(f'{OUT}/{name}'):7,} bytes")
print()
print(f"{summary['canonical_entries']} canonical + {summary['deprecated_aliases']} aliases "
      f"= {summary['cli_entries']} CLI entries")
print(f"{summary['source_mismatches']} entries read from a source other than the one the "
      f"inventory names")
```

Run 2026-08-27:

```
Data/biomedarena/benchmarks.csv    16,460 bytes
Data/biomedarena/aliases.csv          354 bytes
Data/biomedarena/summary.json         458 bytes

155 canonical + 11 aliases = 166 CLI entries
6 entries read from a source other than the one the inventory names
```

`benchmarks.csv` is the working artefact. Filter it on `hf_licence` before you run anything, and
sort it on `source_matches_inventory` to see the six entries whose published source is not the
one the code reads.

## Requesting access

Five of the sources behind this registry are not simply downloadable, and they are gated in three
different ways. None of them can be obtained through this skill.

**Click-through, any account (`registered`).** `Idavidrein/gpqa`, `futurehouse/hle-gold-bio-chem`
and `EdisonScientific/labbench2` are `gated: auto` on Hugging Face. Sign in, open the dataset
page, accept the stated terms, and access is granted immediately with no review. Then export a
token as `HF_TOKEN` before the loader runs. Minutes, and open to anyone.

**Owner approval, case by case (`controlled`).** `nlplabtdtu/health_qa`, behind `hf_healthqa`, is
`gated: manual` — a request goes to the dataset owner and is granted or refused at their
discretion, on no published timetable and against no published criteria. There is no route this
skill can promise. If you need it, request it on the dataset page and plan for the answer to be
no, or never.

**Credentialed access under a data use agreement (`controlled`).** MedNLI, behind `hf_mednli`, is
distributed by PhysioNet under Credentialed Access because it derives from MIMIC-III clinical
notes. The route is a PhysioNet account, the CITI Program's *Data or Specimens Only Research*
training in human research and data privacy, credentialing review, and signature on the
Credentialed Health Data Use Agreement — v1.5.0 for this record. Review is not instant and the
outcome is not guaranteed. The authoritative instructions are on the PhysioNet record for MedNLI
and its credentialing pages; nothing here substitutes for them.

**The harness does not take that route.** It reads an ungated third-party mirror. Read the
PhysioNet terms and decide for yourself before running that entry, and do not treat the mirror's
existence as evidence that the underlying corpus is open.

Two entries, `hf_clicr` and `hf_biomedbench`, answer 401 with no gate to request — the repository
is private or gone. There is nothing to apply for.

The rest of the registry needs no account at all.

## What this skill will not do

It stops at the index. It does not run a benchmark, does not call a model, does not fetch task
content, and does not judge whether a licence permits your particular use — it reports what each
publisher declares and points at where to check.

It also does not re-document the benchmarks underneath. Where one deserves its own treatment it
gets its own page; the `bixbench` skill is the worked example, and this page deliberately stops
where that one starts.

## Try it

**Data.** The BioMedArena registry at commit `4ea206b`, MIT, ungated, plus four Hugging Face
dataset cards read through the public API with no account. Last confirmed reachable 2026-08-27.

**Run.** Cold, in an empty directory.

```bash
python3 -m venv .venv
./.venv/bin/pip install -q --disable-pip-version-check \
  "biomedarena @ git+https://github.com/AI-in-Health/BioMedArena.git@4ea206b8a68e8f66357623e349774bf26431446f"

./.venv/bin/python - <<'PY'
import collections, json, urllib.request
from harness.cli import BENCHMARKS
from harness.eval.hf_benchmark_registry import (
    hf_verified_metadata, HF_DEPRECATED_ALIASES, HF_VERIFIED_BENCHMARK_KEYS)

meta = hf_verified_metadata()
dedicated = [k for k in BENCHMARKS
             if k not in HF_VERIFIED_BENCHMARK_KEYS and k not in HF_DEPRECATED_ALIASES]
print(f"CLI entries / generic-HF / dedicated / aliases : "
      f"{len(BENCHMARKS)} / {len(meta)} / {len(dedicated)} / {len(HF_DEPRECATED_ALIASES)}")
assert len(BENCHMARKS) == len(meta) + len(dedicated) + len(HF_DEPRECATED_ALIASES)

for field in ("gated", "license", "count"):
    values = collections.Counter(str(row[field]) for row in meta.values())
    assert len(values) == 1, f"{field} now varies — the defaults may have been filled in"
    print(f"{field:8} distinct values over {len(meta)} entries : {list(values)}")

def card(repo):
    req = urllib.request.Request(f"https://huggingface.co/api/datasets/{repo}",
                                 headers={"User-Agent": "biomedarena-try-it"})
    with urllib.request.urlopen(req, timeout=60) as fh:
        assert "application/json" in fh.headers.get("content-type", ""), f"{repo} answered non-JSON"
        body = json.loads(fh.read().decode())
    lic = (body.get("cardData") or {}).get("license")
    return ("|".join(lic) if isinstance(lic, list) else lic), body.get("gated")

print()
for repo in ("futurehouse/BixBench", "futurehouse/lab-bench",
             "EdisonScientific/labbench2", "BioProBench/BioProBench"):
    lic, gated = card(repo)
    print(f"{repo:30} licence={str(lic):16} gated={gated}")

nc, _ = card("BioProBench/BioProBench")
assert nc and "-nc" in nc, "BioProBench card no longer reads non-commercial — recheck before running it"
print()
print("all assertions passed")
PY
```

**Expect.**

Invariants at the pinned commit — a failure means this page is wrong, not that upstream moved:

- The three loader families partition the CLI exactly — 129 + 26 + 11 = 166. The dedicated set is
  built by exclusion, so if that sum ever breaks, an entry has gone missing from the CLI itself.
- `gated`, `license` and `count` each take **exactly one** value across all 129 generic entries.
  The moment any of them varies, the maintainers have started populating it and the central
  argument of this page needs re-checking rather than repeating.
- Every dataset-card probe returns `application/json`. A 200 carrying HTML is a challenge page,
  not an answer, and the assertion catches it before a licence gets read off a login screen.

Observed 2026-08-27 — live dataset cards, so a mismatch is drift to investigate:

```
CLI entries / generic-HF / dedicated / aliases : 166 / 129 / 26 / 11
gated    distinct values over 129 entries : ['False']
license  distinct values over 129 entries : ['unknown']
count    distinct values over 129 entries : ['unknown']

futurehouse/BixBench           licence=apache-2.0       gated=False
futurehouse/lab-bench          licence=cc-by-sa-4.0     gated=False
EdisonScientific/labbench2     licence=cc-by-sa-4.0     gated=auto
BioProBench/BioProBench        licence=cc-by-nc-4.0     gated=False

all assertions passed
```

The BioProBench line is the one that matters, and it is the only card the block asserts on.
`bioprobench` is registered exactly like the other 165 entries and reads exactly like them from
the harness's own metadata — and it is the one a commercial reader must not run.

## Sources

- BioMedArena — *An Open-source Toolkit for Building and Evaluating Biomedical Deep Research
  Agents*, arXiv [2605.06177](https://arxiv.org/abs/2605.06177) (v2, submitted 7 May 2026). The
  paper's central claim — that identical backbones score differently across harnesses — is not
  tested here; nothing on this page runs a model.
- Harness — [`AI-in-Health/BioMedArena`](https://github.com/AI-in-Health/BioMedArena), MIT. No
  tagged releases; everything above is measured at commit `4ea206b` (2026-06-25).
- Generated inventory —
  [`docs/benchmark_datasets.md`](https://raw.githubusercontent.com/AI-in-Health/BioMedArena/main/docs/benchmark_datasets.md),
  the repository's own public source-of-truth for what it supports. Useful, and wrong in the
  specific ways set out above.
- MedNLI access terms — the [PhysioNet record](https://physionet.org/content/mednli/1.0.0/),
  Credentialed Access.

Each benchmark carries its publisher's terms, and several are themselves built from material
whose terms belong to someone else again — clinical notes, published figures, shared-task
corpora. The harness licence reaches none of that. Fetch from upstream, check the source before
redistributing anything, and treat this map as where the question starts.
