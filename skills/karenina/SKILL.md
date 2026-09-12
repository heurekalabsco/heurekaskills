---
name: karenina
description: Score LLM and agent answers with Karenina — typed answer templates that check field-level ground truth, plus deterministic regex and callable rubric traits. Gives weighted partial credit rather than one pass-or-fail verdict.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [evaluation, benchmarking, rubrics, llm, pydantic]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-09-12
  against: karenina 0.1.0 (git 140584a, 2026-08-27) / Python 3.11.15 / pydantic 2.13
  executed: 9
  unverified: 0
---
# Karenina — grading answers against templates and rubrics

Karenina turns "was that answer any good?" into two questions it can answer separately:

- **Did it get the facts right?** An *answer template* is a Pydantic model whose fields
  carry their own ground truth and their own comparison rule.
- **Was it well-made?** A *rubric* is a set of traits scored over the response text —
  cited, hedged, formatted, on-topic.

The two are independent on purpose. A response can name the right gene and argue for it
badly, or reason beautifully to the wrong gene, and you want to see which one happened.

The useful property for automation is that most of this is **deterministic**. Regex and
callable traits, and every template comparison below, are ordinary Python — no model call,
no key, same answer every time. Only the LLM-judge traits need a provider.

## What you need

- **Python 3.11 or newer.**
- **Install from the repository.** There is no PyPI release as of 2026-09-12, so `pip
  install karenina` will not find it.
- **A model-provider API key — only for LLM-judge traits.** Everything else in this page
  runs offline. The one section that needs a key says so before its code block.

Expect a large dependency tree (it pulls a full agent/LLM stack), so allow a few minutes.

```bash
pip install "git+https://github.com/biocypher/karenina.git"
python -c "import karenina; print(karenina.__version__)"
```

## Answer templates — ground truth on the field

Subclass `BaseAnswer` and declare each field with `VerifiedField`, giving it the correct
value and the rule for comparing against it. Karenina generates `verify()` and
`verify_granular()` for you.

```python
from karenina.schemas import BaseAnswer
from karenina.schemas.entities.verified_field import VerifiedField
from karenina.schemas.primitives import ExactMatch, NumericExact

class CFAnswer(BaseAnswer):
    gene: str = VerifiedField(
        description="HGNC symbol of the causal gene",
        ground_truth="CFTR",
        verify_with=ExactMatch(),
    )
    chromosome: int = VerifiedField(
        description="Chromosome carrying the gene",
        ground_truth=7,
        verify_with=NumericExact(),
    )

print(CFAnswer(gene="cftr", chromosome=7).verify())     # True
print(CFAnswer(gene="SCNN1A", chromosome=12).verify())  # False
```

`VerifiedField` is not re-exported from `karenina.schemas`; import it from
`karenina.schemas.entities.verified_field` as above.

The comparison rules live in `karenina.schemas.primitives` and cover the usual shapes —
`ExactMatch`, `NumericExact`, `NumericTolerance`, `NumericRange`, `ContainsAll`,
`ContainsAny`, `RegexMatch`, `SetContainment`, `DateMatch`, and composition helpers
(`AllOf`, `AnyOf`, `AtLeastN`).

## Two scores, not one

`verify()` is all-or-nothing. `verify_granular()` returns the **weighted fraction of
fields that passed**, as a float — not, despite the name, a per-field breakdown.

```python
from karenina.schemas import BaseAnswer
from karenina.schemas.entities.verified_field import VerifiedField
from karenina.schemas.primitives import ExactMatch, NumericExact

class Weighted(BaseAnswer):
    gene: str = VerifiedField(description="gene", ground_truth="CFTR",
                              verify_with=ExactMatch(), weight=3.0)
    chromosome: int = VerifiedField(description="chr", ground_truth=7,
                                    verify_with=NumericExact(), weight=1.0)

right_gene_wrong_chr = Weighted(gene="CFTR", chromosome=99)
print(right_gene_wrong_chr.verify())           # False
print(right_gene_wrong_chr.verify_granular())  # 0.75  -> 3 of 4 weight units
```

Weights are what stop a throwaway field from costing as much as the answer itself. Leave
`weight` off and every field counts 1.

## Two traps that pass wrong answers quietly

Both of these produce a template that looks strict and is not. They are worth knowing
before you trust a score.

**`NumericTolerance` is relative by default.** `tolerance=0.5` means ±50%, not ±0.5.
Against a ground truth of 7.2 it accepts anything up to 10.8.

```python
from karenina.schemas import BaseAnswer
from karenina.schemas.entities.verified_field import VerifiedField
from karenina.schemas.primitives import NumericTolerance

class Relative(BaseAnswer):
    v: float = VerifiedField(description="HbA1c", ground_truth=7.2,
                             verify_with=NumericTolerance(tolerance=0.5))

class Absolute(BaseAnswer):
    v: float = VerifiedField(description="HbA1c", ground_truth=7.2,
                             verify_with=NumericTolerance(tolerance=0.5, mode="absolute"))

for v in (7.5, 8.9, 10.7, 10.9):
    print(v, Relative(v=v).verify(), Absolute(v=v).verify())
# 7.5  True  True
# 8.9  True  False   <- 24% off, still "within tolerance"
# 10.7 True  False
# 10.9 False False
```

Pass `mode="absolute"` whenever you mean units.

**Unknown keyword arguments to a primitive are dropped silently.** `ExactMatch` has no
`case_sensitive` parameter — it has `normalize`, which defaults to lowercasing and
stripping. So `ExactMatch(case_sensitive=True)` is accepted, changes nothing, and leaves
you case-insensitive.

```python
from karenina.schemas import BaseAnswer
from karenina.schemas.entities.verified_field import VerifiedField
from karenina.schemas.primitives import ExactMatch

print(ExactMatch(case_sensitive=True).model_dump())
# {'normalize': ['lowercase', 'strip']}  -- the argument vanished

class Loose(BaseAnswer):
    g: str = VerifiedField(description="gene", ground_truth="CFTR",
                           verify_with=ExactMatch())

class Strict(BaseAnswer):
    g: str = VerifiedField(description="gene", ground_truth="CFTR",
                           verify_with=ExactMatch(normalize=[]))

print(Loose(g="cftr").verify(), Strict(g="cftr").verify())  # True False
```

Check `Primitive.model_dump()` when a comparison behaves unexpectedly — it shows what the
primitive actually holds. `normalize=[]` is how you get a case-sensitive match.

## Rubric traits over the response text

A `Rubric` holds five lists of traits. Two of them run with no model at all.

`RegexRubricTrait.evaluate(text)` returns a bool. `invert_result=True` turns a pattern
into a prohibition, which is how you check that something is *absent*.

```python
from karenina.schemas import Rubric, RegexRubricTrait

rubric = Rubric(regex_traits=[
    RegexRubricTrait(name="cites_pmid", pattern=r"PMID:\s*\d{6,8}",
                     description="cites at least one PMID"),
    RegexRubricTrait(name="no_hedging", pattern=r"\b(?:might|maybe|possibly)\b",
                     case_sensitive=False, invert_result=True,
                     description="states a conclusion without hedging"),
])

for text in ["The causal gene is CFTR (PMID: 2475911).", "It might possibly be CFTR."]:
    print({t.name: t.evaluate(text) for t in rubric.regex_traits})
# {'cites_pmid': True, 'no_hedging': True}
# {'cites_pmid': False, 'no_hedging': False}
```

Callable traits take an arbitrary function, which is where domain checks belong — a symbol
that must appear in a reference set, a dose that must be physiological. Build them with
`from_callable` and give `kind="boolean"` or `kind="score"`.

```python
import re
from karenina.schemas import CallableRubricTrait

KNOWN = {"CFTR", "TP53", "KRAS", "BRCA1"}

def only_known_genes(text: str) -> bool:
    found = set(re.findall(r"\b[A-Z][A-Z0-9]{2,}\b", text))
    return bool(found) and found <= KNOWN

def n_citations(text: str) -> int:
    return len(re.findall(r"PMID:\s*\d+", text))

t1 = CallableRubricTrait.from_callable(name="only_known_genes", func=only_known_genes,
                                       kind="boolean", description="no invented symbols")
t2 = CallableRubricTrait.from_callable(name="n_citations", func=n_citations,
                                       kind="score", min_score=0, max_score=5)

print(t1.deserialize_callable()("CFTR and TP53 are implicated."))   # True
print(t1.deserialize_callable()("FAKEGENE1 is implicated."))        # False
print(t2.deserialize_callable()("PMID: 123456 and PMID: 654321"))   # 2
```

**A callable trait stores pickled code, and `deserialize_callable()` executes it.** The
library warns on every call. A rubric is therefore as dangerous as a script — load one
only from somewhere you trust, and do not accept rubric files from users the way you would
accept a CSV.

## LLM-judge traits

`LLMRubricTrait` is the one that needs a provider. It is for judgements no regex reaches —
whether the reasoning follows, whether a caveat was warranted. Traits are declared the same
way; scoring them requires a configured model and **will spend API credits**.

Set your provider key in the environment first (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or
`GOOGLE_API_KEY`, depending on provider). Declaring the traits, as below, needs no key and
costs nothing — it is *scoring* them against responses that calls the provider, and that
step was deliberately not exercised when this page was verified.

```python
from karenina.schemas import Rubric, LLMRubricTrait

rubric = Rubric(llm_traits=[
    LLMRubricTrait(
        name="mechanism_explained",
        kind="boolean",
        description="States the mechanism linking the gene to the phenotype, not just the name.",
    ),
    LLMRubricTrait(
        name="calibration",
        kind="score",
        min_score=1,
        max_score=5,
        description="Confidence is proportionate to the evidence actually cited.",
    ),
])
print(rubric.get_llm_trait_names())
```

Prefer a deterministic trait wherever one will do. A regex costs nothing, never drifts
between model versions, and cannot disagree with itself on a re-run — and an eval whose
own grader is stochastic is an eval you have to re-run to trust.

## Try it

Fully offline — no key, no network, no data to fetch. Saves the file, runs it, and checks
every assertion including the relative-tolerance trap.

**Data** — generated inline; there is no external dataset to obtain.

**Run**

```bash
pip install "git+https://github.com/biocypher/karenina.git"

cat > karenina_tryit.py <<'PY'
from karenina.schemas import BaseAnswer, Rubric, RegexRubricTrait
from karenina.schemas.entities.verified_field import VerifiedField
from karenina.schemas.primitives import ExactMatch, NumericExact, NumericTolerance

class CFAnswer(BaseAnswer):
    gene: str = VerifiedField(description="causal gene", ground_truth="CFTR",
                              verify_with=ExactMatch(), weight=3.0)
    chromosome: int = VerifiedField(description="chromosome", ground_truth=7,
                                    verify_with=NumericExact(), weight=1.0)

assert CFAnswer(gene="cftr", chromosome=7).verify() is True
partial = CFAnswer(gene="CFTR", chromosome=99)
assert partial.verify() is False
assert partial.verify_granular() == 0.75

class Rel(BaseAnswer):
    v: float = VerifiedField(description="HbA1c", ground_truth=7.2,
                             verify_with=NumericTolerance(tolerance=0.5))
class Abs(BaseAnswer):
    v: float = VerifiedField(description="HbA1c", ground_truth=7.2,
                             verify_with=NumericTolerance(tolerance=0.5, mode="absolute"))
assert Rel(v=8.9).verify() is True     # relative: 8.9 is within +50% of 7.2
assert Abs(v=8.9).verify() is False    # absolute: 8.9 is not within 7.2 +/- 0.5

rubric = Rubric(regex_traits=[
    RegexRubricTrait(name="cites_pmid", pattern=r"PMID:\s*\d{6,8}"),
    RegexRubricTrait(name="no_hedging", pattern=r"\b(?:might|maybe|possibly)\b",
                     case_sensitive=False, invert_result=True),
])
good = {t.name: t.evaluate("The causal gene is CFTR (PMID: 2475911).")
        for t in rubric.regex_traits}
weak = {t.name: t.evaluate("It might possibly be CFTR.")
        for t in rubric.regex_traits}
assert good == {"cites_pmid": True, "no_hedging": True}
assert weak == {"cites_pmid": False, "no_hedging": False}

print("granular (3 of 4 weight units):", partial.verify_granular())
print("good answer traits:", good)
print("weak answer traits:", weak)
print("trait names:", rubric.get_trait_names())
print("OK")
PY

python karenina_tryit.py
```

**Expect**

```
granular (3 of 4 weight units): 0.75
good answer traits: {'cites_pmid': True, 'no_hedging': True}
weak answer traits: {'cites_pmid': False, 'no_hedging': False}
trait names: ['cites_pmid', 'no_hedging']
OK
```

*Invariants* (a failure means this page is wrong): `verify()` is all-or-nothing while
`verify_granular()` returns the weighted pass fraction; a relative tolerance is wider than
the same number read as units; `invert_result` flips a regex trait.

*Observed against* karenina 0.1.0 (git `140584a`) on Python 3.11.15, 2026-09-12. A changed
default — `normalize` on `ExactMatch`, or `mode` on `NumericTolerance` — would change these
values, and that is drift to investigate rather than a bug in the page.

## Limits

- **No PyPI release** as of 2026-09-12; installation is from the repository, which means
  you are pinning a commit rather than a version. `karenina.__version__` reports `0.1.0`.
- **`verify_granular()` returns a float**, so if you want to know *which* field failed you
  have to compare fields yourself.
- **Deterministic traits do not judge meaning.** `no_hedging` above fires on the word, not
  the stance — a confidently wrong answer passes it.
- The library also carries multi-turn conversation and agent-trace primitives
  (`AllTurns`, `LastTurn`, `TraceContains`, `TraceLength`) and a `Benchmark` object with
  SQL storage. This page covers single-answer scoring only.
