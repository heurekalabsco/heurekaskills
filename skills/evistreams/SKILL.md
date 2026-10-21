---
name: evistreams
description: Extract systematic-review fields from clinical trial PDFs with the open EviStreams engine — typed forms, staged LLM extraction with page-linked quotes, a quote audit, dual-review comparison and field-level scoring.
category: analysis
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [systematic-review, data-extraction, clinical-ai, llm, evaluation]
covers: [evistreams, systematic review, meta-analysis, evidence synthesis, data extraction, clinical trials, randomised controlled trial, rct, trial pdf, cochrane, extraction form, source grounding, verbatim quote, provenance, dual review, double data extraction, adjudication, inter-rater agreement, reviewer disagreement, dspy, litellm, ollama, local llm, precision recall, f1]
papers: [doi:10.48550/arXiv.2609.27418]
datasets: ["https://pmc-oa-opendata.s3.amazonaws.com/PMC7706009.1/PMC7706009.1.pdf"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: evistream_backend commit aae3b76 (2026-10-19) / Python 3.11.14 / dspy 3.0.3 / litellm 1.77.4 / PyMuPDF 1.26.0 / rapidfuzz 3.13.0 / scipy 1.16.3 / gemma3 12b (Ollama digest f4031aab637d, Q4_K_M, 131072-token context) served by Ollama 0.20.7 on macOS arm64 / extraction block run without its ollama pull line (registry refused 0.20.7; model pulled earlier), all other lines verbatim
  executed: 17
  unverified: 2
  unverified_reason: The hosted-provider run needs a paid model API key and the full web platform needs a Postgres project, an object-storage bucket, Redis and a paid PDF-conversion key, none of which the validating machine holds. Both are wiring around the engine that did run here against a local model. Re-run them from an account that has those credentials.
---
# EviStreams — quote-traceable extraction for systematic reviews

EviStreams is a research platform for the data-extraction step of a systematic review. A
reviewer describes the fields they want from each study as a typed form, a language model
fills the form from the full text of each trial report, and every value comes back with the
sentence it was taken from and the page that sentence sits on. Two reviewers then work
the same studies independently, their entries are compared field by field, and an
adjudicator settles what they disagree on. The design is described in Kosuri et al.,
*EviStreams: Human-in-the-Loop AI Data Extraction for Systematic Reviews in Medicine*,
arXiv:2609.27418 (2026).

The value of the quote is that it makes a model's answer checkable in seconds rather than
re-read from scratch. The catch, which this skill is mostly about, is that a quote being
*present* is not the same as a quote being *evidence*. Section 5 shows the engine handing
back a real, verbatim sentence that does not contain the value it is offered in support of.

Use this skill to:

- run the extraction engine standalone on trial reports, with a local model or a hosted one;
- check which extracted values are actually supported by verbatim text;
- compare two reviewers' records and produce an adjudicated table;
- score an extraction against a reference sheet with the project's field-typed scorer.

Do not use it to screen abstracts, to rate risk of bias, or to pool results. It extracts;
it does not decide inclusion or synthesise. For risk-of-bias and GRADE appraisal, use the
`scientific-critical-thinking` skill.

## What a reader needs before starting

Read this before any block that runs the engine.

- **The code is Apache-2.0** — `karthik-strikes/evistream_backend` on GitHub, with the
  matching web frontend under the same licence in `karthik-strikes/evistream_frontend`.
  Both repositories were published on 19 October 2026 with no tagged release, so this
  skill pins a commit.
- **Extraction calls a language model, and that is the only thing in this skill that can
  cost money.** Any model LiteLLM can reach will do. Two routes:
  - *No key* — a local model through [Ollama](https://ollama.com). This skill was verified
    with `gemma3:12b` (digest `f4031aab637d`), an 8.1 GB download that occupied 18 GB of
    memory on the verifying machine with a 131,072-token context. Slow, and how its
    accuracy compares with a hosted model was not measured, but nothing leaves the machine.
  - *Paid key* — an OpenAI, Google Gemini or other provider key. The upstream defaults
    point at hosted commercial models.
- **The full web platform is a deployment, not an install.** Reviewer accounts, blinded
  assignments and the adjudication screens need your own Supabase (Postgres) project, an
  S3 bucket, Redis, a Datalab API key for PDF conversion (a paid, per-page service) and a
  model key, with the frontend pointed at the same backend. Section 8 sketches it. Nothing
  in sections 1 to 7 needs any of it.
- **A hosted instance exists at evistreams.com.** Its interim terms describe academic and
  research use. This skill does not use it; everything here runs from the open code.
- **Trial reports are third-party publications.** The project's evaluation folder ships
  reference annotations but no PDFs, and says to obtain articles under their own terms.
  The worked example below uses a CC BY 4.0 trial report so it can be downloaded freely.

## 1. Install

Python 3.11 exactly, matching the release lock file. The lock is large — about 550 MB once
installed — because it carries the API server, workers and three provider SDKs. A Python
3.11 interpreter is needed; `uv` will fetch one if the system does not have it.

```bash
git clone https://github.com/karthik-strikes/evistream_backend.git
cd evistream_backend
git checkout aae3b7699526fe3d636340c850a63e6da052b288
uv venv -p 3.11 .venv
uv pip install --python .venv -r requirements.lock.txt
# The locked scipy 1.15.2 wheel fails to load on recent macOS with
# "section '__DATA/__thread_bss' has a zero-fill section type". 1.16.3 loads and
# passes the project's own checks; harmless to apply on Linux too.
uv pip install --python .venv "scipy==1.16.3"
```

Without `uv`, upstream documents `python3.11 -m venv .venv` followed by
`.venv/bin/pip install -r requirements.lock.txt`; that route was not timed here. The clone
itself is about 10 MB.

Every block after this one runs from inside `evistream_backend/` with `.venv` active.

## 2. Check the install without an account

```bash
source .venv/bin/activate
PYTHON_DOTENV_DISABLED=1 python -m pytest -q tests
python eval/smoke_test.py
```

Expect `16 passed` and a single `PASS:` line from the scorer smoke test. The repository
also ships `scripts/smoke_api.py`; at this commit it fails offline with
`AssertionError: Network access is forbidden in the offline smoke test`, because the test
blocks sockets and the Redis cache only tolerates a `redis.ConnectionError`. That is a
defect in the check, not in your install.

`PYTHON_DOTENV_DISABLED=1` stops the modules that call `load_dotenv()` at import time from
reading a `.env` file in the repository root. It does not cover the two settings classes,
`core/config.py` and `app/config.py`, which read `.env` through pydantic — the first from
the current directory, the second from the repository root. For standalone use, keep no
`.env` in the checkout, so nothing can silently supply keys or switch models.

## 3. Turn a PDF into paged text

The platform sends PDFs to Datalab, which returns Markdown with tables preserved and a
page separator line between pages — `{N}` (zero-based) followed by at least 48 dashes. The source
linker in section 5 reads those separators to report page numbers, so a local conversion
has to write the same separator. PyMuPDF, already in the lock file, does the job:

```python
# to_md.py — PDF to page-separated text the engine can cite pages from
import sys

import fitz  # PyMuPDF

pdf_path, out_path = sys.argv[1], sys.argv[2]
doc = fitz.open(pdf_path)
pages = []
for i, page in enumerate(doc):
    pages.append("{%d}%s\n\n%s" % (i, "-" * 48, page.get_text("text").strip()))
with open(out_path, "w", encoding="utf-8") as fh:
    fh.write("\n\n".join(pages) + "\n")
print(f"{doc.page_count} pages -> {out_path}")
```

```bash
curl -fsSL -o trial.pdf \
  "https://pmc-oa-opendata.s3.amazonaws.com/PMC7706009.1/PMC7706009.1.pdf"
python to_md.py trial.pdf trial.md
```

The example is Purngpipattrakul et al., *Comparison of GlideScope visualization and neck
flexion with lateral neck pressure nasogastric tube insertion techniques in anesthetized
patients*, Trials 21:990 (2020), doi:10.1186/s13063-020-04911-0, CC BY 4.0, fetched
from NCBI's copy of the PMC Open Access Subset (PMC7706009), which needs no account. It
prints `7 pages -> trial.md`.

What the local route gives up: plain text extraction flattens tables into one value per
line, so a value that lives only in a table is harder for the model to quote and harder for
the linker to place. Datalab output also carries block coordinates the platform uses to
highlight the quote on the page. This skill verified the local route on prose-reported
fields only; table-heavy outcome fields were not exercised on it.

## 4. Describe the form and run the extraction

A form is a JSON `schema_def`. Each **signature** is one model call: its `docstring` is the
instruction, it takes the paper as `markdown_content`, and it returns one or more
**output fields**. **Stages** say which signatures run together and which wait for
earlier answers.

```json
{
  "task_name": "rct_basics",
  "signatures": [
    {
      "class_name": "ExtractTrialSetting",
      "docstring": "Extract where a randomised trial was run and how many participants it randomised.",
      "input_fields": [{"name": "markdown_content", "type": "str", "desc": "Full text of the trial report."}],
      "output_fields": [
        {"name": "country", "type": "Dict[str, Any]", "source_grounded": true,
         "description": "Country where participants were recruited, in English.",
         "rules": ["Use NR if the report does not state it"]},
        {"name": "n_randomised", "type": "Dict[str, Any]", "source_grounded": true,
         "description": "Total number of participants randomised, as an integer.",
         "rules": ["Count randomised participants, not those screened or analysed"]}
      ]
    },
    {
      "class_name": "ClassifyDesign",
      "docstring": "Classify the design of a clinical study.",
      "input_fields": [{"name": "markdown_content", "type": "str", "desc": "Full text of the trial report."}],
      "output_fields": [
        {"name": "design", "type": "Dict[str, Any]", "source_grounded": true,
         "description": "Study design.",
         "options": ["parallel RCT", "crossover RCT", "cluster RCT", "non-randomised"]}
      ]
    }
  ],
  "pipeline_stages": [
    {"stage": 1, "execution": "parallel",
     "signatures": ["ExtractTrialSetting", "ClassifyDesign"],
     "provides_fields": ["country", "n_randomised", "design"], "requires_fields": []}
  ]
}
```

Save that as `form.json`. What the field keys do:

| key | effect |
|---|---|
| `description` | what the field is; becomes the field's instruction |
| `options` | allowed values; add `"multiple": true` for multi-select |
| `hints`, `rules`, `examples` | appended to the instruction as lists |
| `source_grounded` | asks for `{"value", "source_text"}` with a verbatim quote, and `NR` when absent |
| `subform_fields` | makes the field a table of rows, each cell carrying its own quote |

A stage with `"execution": "sequential"` and `"requires_fields": [...]` receives those
earlier answers as extra inputs — the way to classify something from values already
extracted. Two signatures in the same parallel stage may not produce the same field name;
building the pipeline then fails immediately with
`ValueError: Duplicate output field 'country' across parallel signatures ...`.

On the platform, a reviewer lists the fields and a model turns that list into
signatures and stages, which the reviewer then approves. Writing the JSON yourself skips
that step and keeps the form under version control.

```python
# extract.py — run one paper through a form with the EviStreams engine
import asyncio
import json
import sys
from pathlib import Path

from schemas.config import DynamicSchemaConfig

form = json.loads(Path(sys.argv[1]).read_text())
markdown = Path(sys.argv[2]).read_text(encoding="utf-8")

config = DynamicSchemaConfig(
    schema_name=form["task_name"], task_name=form["task_name"],
    module_path="", signatures_path="",
    signature_class_names=[s["class_name"] for s in form["signatures"]],
    pipeline_stages=form["pipeline_stages"],
    project_id="", form_id="", form_name=form["task_name"],
    schema_def=form,
)
pipeline = config.build_pipeline()

# Do not use asyncio.run() here: the pipeline finishes, then asyncio.run() hangs
# indefinitely while cancelling a leftover background task. Drive the loop directly.
loop = asyncio.new_event_loop()
result = loop.run_until_complete(pipeline(markdown_content=markdown))

Path(sys.argv[3]).write_text(json.dumps(result, indent=2, ensure_ascii=False))
for name, cell in result.items():
    loc = cell.get("source_location") or {}
    print(f"{name:14} {str(cell.get('value')):16} page={loc.get('page')} {loc.get('grounding_method')}")
```

Run it against a local model. Start Ollama with a context long enough for a whole paper —
the server otherwise picks a default from available memory, and Ollama truncates a prompt
longer than its window — then confirm the `CONTEXT` column of `ollama ps` once the model
loads. The recorded runs used that machine's server default, 131,072 tokens; 32,768 covers
the trial reports used here.

Pulling needs Ollama 0.30.0 or later: the registry build's config declares
`requires: 0.30.0`, and on 2026-10-21 it refused `ollama pull gemma3:12b` from 0.20.7 with
"requires a newer version of Ollama". The registry's current `gemma3:12b` is also a
different build from the one verified here — a separate vision-projector layer and a
different model-layer digest — so expect drift from the observations in section 5.

```bash
# In another terminal: OLLAMA_CONTEXT_LENGTH=32768 ollama serve
ollama pull gemma3:12b
PYTHON_DOTENV_DISABLED=1 PYTHONPATH="$PWD" \
DEFAULT_MODEL=ollama_chat/gemma3:12b FALLBACK_MODELS='[]' ENABLE_MODEL_FALLBACK=false \
python extract.py form.json trial.md result.json
```

For a hosted provider, change the model id and supply that provider's key. This route
was not executed for this skill:

```bash
export GEMINI_API_KEY=...   # your own key; usage is billed by the provider
PYTHON_DOTENV_DISABLED=1 PYTHONPATH="$PWD" \
DEFAULT_MODEL=gemini/gemini-2.5-flash FALLBACK_MODELS='[]' ENABLE_MODEL_FALLBACK=false \
python extract.py form.json trial.md result.json
```

Three settings are doing real work in those commands:

- `DEFAULT_MODEL` replaces the primary model. Any LiteLLM id works.
- `FALLBACK_MODELS='[]'` empties the router's fallback list, which otherwise names two
  hosted models — a local run should never route to a provider you hold no key for.
- Each signature whose fields all come back empty or `NR` is retried, up to three calls
  in total. On a hosted model, a form that does not fit the paper costs three times over.

Each field comes back as a cell:

```json
{"value": "Thailand",
 "source_text": "This randomized clinical trial was performed at a teaching hospital on 86 adult patients undergoing abdominal surgery",
 "status": "reported",
 "source_location": {"page": 1, "start_char": 797, "end_char": 914, "confidence": 1.0,
                     "section": "Abstract", "grounding_method": "quote_exact"}}
```

`status` is `reported`, `not_reported` (the model said `NR`) or `missing` (the model left
the field out, which is a failure rather than an absence). `page` is one-based. A field
with `options` gets its value matched to an option case-insensitively; anything that
matches no option is kept and listed under `off_options` rather than rejected.

## 5. Audit the quotes before trusting a value

The cell above is a real result from this paper, and it is the reason this section exists.
The quote is verbatim — the linker found it character for character on page 1 — and it
does not mention Thailand at all. The value may be right; the quote is not evidence for it.

`grounding_method` says how the linker placed the quote, and only one value means what a
reader assumes:

| `grounding_method` | what happened | what it proves |
|---|---|---|
| `quote_exact` | the quote occurs in the text, case-sensitively, after normalising line breaks, hyphenation and ligatures | the sentence exists — not that it supports the value |
| `quote_fuzzy` | a passage scored at least 0.65 on partial fuzzy matching | anything from a changed capital letter to a paraphrase; the location may be a whole page |
| `value_text`, `value_table` | the quote was not found, so the linker searched for the *value* instead (`value_table` needs Datalab block data) | the quote is unverified; a number happens to occur somewhere |
| absent | neither quote nor value could be placed | nothing |

The value fallback is the subtle one. A distinctive value — a decimal, a percentage, a
code with a digit in it — is located even when the quote offered for it was invented, so
`79.1%` with a made-up sentence still gets a page and a section. A bare integer is only
placed when other tokens of the value sit near it, and a plain word such as `Thailand`
never is.

`section` is the nearest recognised heading *above* the match in reading order, not the
section the text belongs to. Figure text floats: this paper's participant-flow figure is
reported under `Discussion`.

So audit every record with two tests — was the quote found verbatim, and does it contain
the value:

```python
# audit.py — classify each extracted value by the evidence behind it
import json
import re
import sys
from pathlib import Path

record = json.loads(Path(sys.argv[1]).read_text())


def squash(text):
    # Letters and digits only, so PDF line breaks and hyphenation do not matter.
    return re.sub(r"[^0-9a-z]+", "", str(text).lower())


needs_review = []
for field, cell in record.items():
    value = cell.get("value")
    quote = cell.get("source_text") or ""
    loc = cell.get("source_location") or {}
    method = loc.get("grounding_method")
    if "value" not in cell:
        verdict = f"malformed cell, keys {sorted(cell)}"
    elif str(value).strip().upper() == "NR":
        verdict = "not reported"
    elif method == "quote_exact" and squash(value) in squash(quote):
        verdict = "supported by a verbatim quote"
    elif method == "quote_exact":
        verdict = "verbatim quote that does not contain the value"
    elif method == "quote_fuzzy":
        verdict = "approximate quote"
    elif method in ("value_text", "value_table"):
        verdict = "quote not found, value located instead"
    else:
        verdict = "no evidence located"
    if verdict not in ("supported by a verbatim quote", "not reported"):
        needs_review.append(field)
    print(f"{field:14} {str(value):16} page={loc.get('page')!s:5} {verdict}")
print("needs review:", needs_review)
```

```bash
python audit.py result.json
```

Everything below in this section is **observed**, not invariant. It comes from one local
model — `gemma3:12b`, Ollama digest `f4031aab637d`, at the engine's temperature of 1.0 with a
131,072-token context — on 2026-10-21. Hosted models, which upstream defaults to and its
paper evaluated, were not tested here and may behave quite differently.

Five runs of the same command on this paper gave these audit verdicts:

| run | `country` | `n_randomised` | `design` |
|---|---|---|---|
| 1 | Thailand — verbatim quote without the value | 86 — approximate quote | parallel RCT — no quote |
| 2 | Thailand — verbatim quote without the value | 86 — approximate quote | malformed cell |
| 3 | malformed cell | 86 — approximate quote | parallel RCT — no quote |
| 4 | malformed cell | 86 — **supported by a verbatim quote** | malformed cell |
| 5 | `NR` | 86 — **supported by a verbatim quote** | parallel RCT — no quote |

Read the `n_randomised` column against the paper. It is **wrong in all five runs**: the
abstract's "86 adult patients" are the patients analysed, while the participant-flow figure
on page 5 reads `Randomized (n=92)` and the Results say 92 were enrolled. The form's own
rule told the model not to make this slip. In runs 4 and 5 the wrong value passed the audit,
because the abstract sentence really is in the paper and really does contain 86.

So the audit is a filter, not a verdict. **"Supported by a verbatim quote" means the
quote is real and contains the value — not that the value is the right answer to the
field.** A real sentence about a different quantity passes. Catching that takes a person
reading the field definition against the paper, which is what section 6 is for.

A "malformed cell" is the model putting its answer under `"type"` instead of `"value"`. The
engine keeps the cell, finds no value, and marks it `not_reported`, so a possibly right
answer reads downstream as "the paper does not say". That is why the audit checks each
cell's shape before anything else. Run 5's `NR` for country is simply wrong — Thailand is
on pages 1, 2 and 7.

A normalised value — `parallel RCT` from "randomized into two groups" — will often fail the
containment test legitimately; that is a cell for a person to confirm, not an error.

The same form and model were also run once on each of three more CC BY trial reports, on
the same date:

- Donoghue et al., *Double-blind, placebo-controlled trial of mifepristone on cognition and
  depression in alcohol dependence*, Trials 21:796 (2020), PMC7493392 — a phase 2 trial
  that recruited 27 of a planned 120.
- *Nitroglycerin for treatment of retained placenta: a randomised, placebo-controlled,
  multicentre, double-blind trial in the UK*, PLOS Medicine 16(12):e1003001 (2019),
  PMC6936786 — 1,107 women randomised.
- The CHIRPY DRAGON cluster-randomised trial of a school obesity intervention in China,
  PLOS Medicine 16(11):e1002971 (2019), PMC6879117 — 20 pages.

What those single runs showed, again as observations of this one model:

- The audit passed one value of nine: 1,107 randomised, quoted as "1,107".
- Two country values were backed by quotes that name no place, and one by "the UK" for
  `United Kingdom`. The mifepristone total of 27 was quoted from "Fourteen ...
  mifepristone and 13 ... placebo", a correct sum the containment test cannot see.
- Exact matching is case-sensitive. A quote the model began with a capital letter that the
  paper does not have scored `quote_fuzzy` at 0.988 — near 1 is cosmetic, near 0.65 is a
  different sentence.
- `design` came back unquoted on the two parallel-group trials and quoted on the cluster
  trial.
- The 20-page paper took eight minutes, and one call was cut off at exactly ten minutes
  while another job shared the GPU. Allow for it in batch runs.

## 6. Two reviewers, one adjudicated table

How upstream does it: two **people** extract each study independently as reviewer 1 and
reviewer 2 — optionally blind to each other, a per-project setting that is off by default.
The platform compares their two records field by field and shows the model's extraction
beside them as a reference value; the model is not one of the two reviewers. An
adjudicator then settles every disagreement.

The comparison itself lives in the API service, whose database calls need the full
platform. The three helpers that decide agreement do not, so the script below **imports
them from the checkout rather than re-implementing them**: `_unwrap_for_compare`,
`_align_multiselect` and `_canon` from `app/services/adjudication_service.py`, at the pinned
commit `aae3b76`. What they do:

- quotes and other metadata are ignored — only values are compared;
- strings compare case-insensitively after trimming the ends; internal spaces still count;
- a number and its string are equal (`"86"`, `86`, `86.0`), as are `yes`/`y`/`true` and
  `no`/`false`;
- a multi-select agrees in any order, including a list on one side and `"a, b"` on the
  other;
- table rows from `subform_fields` agree in any order, cell by cell;
- a field one reviewer left out agrees only with an empty (`null`) value, never with a
  non-null one such as the text `"None"`.

Those helpers are private (`_`-prefixed), so this holds at commit `aae3b76` and may break
on a newer upstream. The script refuses to run without them, or from a checkout at any
other commit, rather than falling back to a copy. Importing their module builds the
platform's settings, so the script sets inert placeholders for the seven required ones
first; environment variables win over a `.env` file, which that settings class still
reads. Nothing the script calls touches the database, storage or the network. Run it like
the extraction, from the checkout with `PYTHONPATH="$PWD"`.

The script's own part is the glue and one rule upstream does not have, aimed at the
problem in section 5. **A quote is carried into the finished table only if it is found in
the paper's text**, under the same normalisation as the audit, whoever wrote it. Among
verbatim quotes, one that also contains the value wins — matched as whole words and whole
numbers, so `86.0` is found in "86 adult patients", `1107` in "1,107", and `9` is not
found in "(n=92)". If none does, a verbatim quote is still carried but flagged under
`outstanding`; with no verbatim quote at all, the cell is
left blank and flagged. List and table values are carried with a note that the quote was
not checked against them.

Write two reviewers' records. Reviewer 1 made the abstract slip; reviewer 2 read the
participant-flow figure:

```bash
cat > reviewer1.json <<'JSON'
{
  "country": {"value": "Thailand", "source_text": "Songklanagarind Hospital, Thailand"},
  "n_randomised": {"value": "86", "source_text": "performed at a teaching hospital on 86 adult patients"},
  "design": {"value": "parallel RCT", "source_text": "The patients were randomized into two groups"}
}
JSON
cat > reviewer2.json <<'JSON'
{
  "country": {"value": "thailand", "source_text": "study was conducted in the operating theater of Songklanagarind Hospital, Thailand."},
  "n_randomised": {"value": "92", "source_text": "Randomized (n=92)"},
  "design": {"value": "parallel RCT", "source_text": "patients were randomised into two groups"}
}
JSON
```

Reviewer 2's `design` quote says "randomised" where the paper says "randomized". It is
not verbatim, so it is never carried.

```python
# adjudicate.py — compare two reviewers' records and write the adjudicated table.
# Agreement is decided by upstream's own helpers, imported rather than re-implemented:
# _unwrap_for_compare, _align_multiselect and _canon from app/services/adjudication_service.py
# in evistream_backend at commit aae3b76 (Apache-2.0). They are private, so they may move
# or change in later commits; this script is pinned to that commit.
import csv
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PINNED = "aae3b76"
NEEDED = ("evistream_backend at commit aae3b76 is required: run from that checkout with it "
          "on PYTHONPATH. app.services.adjudication_service must provide the private "
          "helpers _unwrap_for_compare, _align_multiselect and _canon, which may have "
          "moved in later commits.")

# The module reads the platform's settings when imported. Give the required ones inert
# placeholders; environment variables take precedence over a .env file in the checkout,
# which the settings class still reads. Nothing below touches the database, storage or
# any network service.
for key in ("SECRET_KEY", "SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_KEY",
            "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET"):
    os.environ[key] = "offline-placeholder"
try:
    from app.services import adjudication_service as upstream
    from app.services.adjudication_service import (
        _align_multiselect, _canon, _unwrap_for_compare)
except Exception as exc:
    sys.exit(f"{NEEDED} Import failed with: {exc!r}")

checkout = Path(upstream.__file__).resolve().parents[2]
head = subprocess.run(["git", "-C", str(checkout), "rev-parse", "HEAD"],
                      capture_output=True, text=True).stdout.strip()
if not head.startswith(PINNED):
    sys.exit(f"{NEEDED} The checkout at {checkout} is at {head or 'an unknown commit'}.")


def agree(a, b):
    left, right = _align_multiselect(_unwrap_for_compare(a), _unwrap_for_compare(b))
    return _canon(left) == _canon(right)


def squash(text):
    return re.sub(r"[^0-9a-z]+", "", str(text).lower())


def cell_text(value):
    if value is None:
        return ""
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


TOKEN = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|[a-z]+")


def tokens(text):
    # Words and numbers; numbers lose thousands separators and compare as floats,
    # so 86, 86.0 and "86" are one token, and 9 is not found inside 92.
    out = []
    for t in TOKEN.findall(str(text).lower()):
        out.append(float(t.replace(",", "")) if t[0].isdigit() else t)
    return out


def contains_value(value, quote):
    v, q = tokens(value), tokens(quote)
    return bool(v) and any(q[i:i + len(v)] == v for i in range(len(q) - len(v) + 1))


def choose_quote(value, cells, paper):
    """Return (quote, note). Only quotes found verbatim in the paper are eligible; one that
    also contains the value wins. Anything weaker comes back with a note for the summary."""
    quotes = [c.get("source_text") for c in cells if isinstance(c, dict)]
    found = [q for q in quotes
             if isinstance(q, str) and len(squash(q)) >= 5 and squash(q) in paper]
    if not found:
        return "", "no verbatim quote"
    if isinstance(value, (list, dict)):
        return found[0], "quote not checked against a list or table value"
    for q in found:
        if contains_value(value, q):
            return q, None
    return found[0], "quote does not contain the value"


if __name__ == "__main__":
    paper = squash(Path(sys.argv[1]).read_text(encoding="utf-8"))
    r1 = json.loads(Path(sys.argv[2]).read_text())
    r2 = json.loads(Path(sys.argv[3]).read_text())
    ai = json.loads(Path(sys.argv[4]).read_text()) if len(sys.argv) > 4 else {}
    decisions = json.loads(Path(sys.argv[5]).read_text()) if len(sys.argv) > 5 else {}

    rows, outstanding = [], []
    for field in sorted(set(r1) | set(r2)):
        a, b = r1.get(field), r2.get(field)
        if field in decisions:
            value, status = _unwrap_for_compare(decisions[field]), "adjudicated"
            quote, note = choose_quote(value, [decisions[field]], paper)
        elif agree(a, b):
            value, status = _unwrap_for_compare(a), "agreed"
            quote, note = choose_quote(value, [a, b], paper)
        else:
            value, status, quote, note = "", "conflict", "", None
            outstanding.append(f"{field}: reviewers disagree, "
                               f"{_unwrap_for_compare(a)!r} vs {_unwrap_for_compare(b)!r}")
        if note:
            outstanding.append(f"{field}: {note} for the {status} value")
        ref = cell_text(_unwrap_for_compare(ai[field])) if field in ai else ""
        rows.append({"field": field, "value": cell_text(value), "status": status,
                     "quote": quote, "ai_value": ref})

    with open("adjudicated.csv", "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["field", "value", "status", "quote", "ai_value"])
        writer.writeheader()
        writer.writerows(rows)
    for r in rows:
        print(f"{r['field']:14} {r['status']:12} {r['value']:14} "
              f"quote={'yes' if r['quote'] else 'NO'}  ai={r['ai_value']}")
    print("outstanding:", outstanding or "none")
```

The arguments are the paper's text, reviewer 1, reviewer 2, and optionally the model's
record as the reference column and an adjudicator's decisions:

```bash
PYTHONPATH="$PWD" python adjudicate.py trial.md reviewer1.json reviewer2.json result.json
cat > decisions.json <<'JSON'
{"n_randomised": {"value": 92, "source_text": "Randomized (n=92)"}}
JSON
PYTHONPATH="$PWD" python adjudicate.py trial.md reviewer1.json reviewer2.json result.json decisions.json
```

The first command agrees `country` (`Thailand` and `thailand` are one value), carrying
reviewer 1's quote because it contains the value. It agrees `design` too, but its only
verbatim quote, "randomized into two groups", does not contain `parallel RCT`, so that is
listed under `outstanding` for a person to confirm. It leaves `n_randomised` blank as a
`conflict`, with the model's 86 beside it as `ai_value`. The second command records the
adjudicator's 92, quoted from the flow figure; only the `design` note stays open. The
`decisions.json` here stands in for that person; in real use it is theirs to write, and a
model should never fill it in.

**The quote rule, tested.** On one run the model backed `country` with "This randomized
clinical trial was performed at a teaching hospital in Thailand" — a sentence that is not in
the paper. Using a model as one of the reviewers is this skill's variant, not upstream's
design, and it is exactly where the rule matters. The second case is a real sentence that
does not name the country:

```bash
cat > model_invented.json <<'JSON'
{
  "country": {"value": "Thailand", "source_text": "This randomized clinical trial was performed at a teaching hospital in Thailand"},
  "n_randomised": {"value": 86, "source_text": "86 adult patients were randomized"}
}
JSON
PYTHONPATH="$PWD" python adjudicate.py trial.md model_invented.json reviewer2.json
grep '^country' adjudicated.csv
PYTHONPATH="$PWD" python adjudicate.py trial.md model_invented.json model_invented.json

cat > quote_without_value.json <<'JSON'
{"country": {"value": "Thailand", "source_text": "This randomized clinical trial was performed at a teaching hospital on 86 adult patients undergoing abdominal surgery"}}
JSON
cat > quote_with_value.json <<'JSON'
{"country": {"value": "Thailand", "source_text": "Songklanagarind Hospital, Thailand"}}
JSON
PYTHONPATH="$PWD" python adjudicate.py trial.md quote_without_value.json quote_with_value.json
grep '^country' adjudicated.csv
PYTHONPATH="$PWD" python adjudicate.py trial.md quote_without_value.json quote_without_value.json
```

- Invented quote against reviewer 2: `country` agrees and carries reviewer 2's real quote,
  although the invented sentence contains "Thailand" and comes first.
- The model compared with itself: both fields agree, both quote cells stay blank, and each
  is listed as `no verbatim quote for the agreed value`.
- A real sentence without the value against one with it: the one naming Thailand is
  carried, with nothing outstanding.
- The real sentence without the value on its own: it is carried, and listed as `quote does
  not contain the value for the agreed value`.

Containment is matched on whole tokens, not substrings:

```bash
cat > token_cases.json <<'JSON'
{
  "n_randomised": {"value": 9, "source_text": "Randomized (n=92)"},
  "n_analysed": {"value": 86.0, "source_text": "performed at a teaching hospital on 86 adult patients"},
  "country": {"value": "Thailand", "source_text": "Songklanagarind Hospital, Thailand"}
}
JSON
PYTHONPATH="$PWD" python adjudicate.py trial.md token_cases.json token_cases.json
```

Only `n_randomised` is listed under `outstanding`: a 9 is not supported by "(n=92)",
while `86.0` is supported by "86 adult" and the plain text `Thailand` by its quote.

Without the checkout on the path, the script stops instead of guessing:

```bash
# Expected to fail: the copy outside the checkout cannot import upstream's helpers.
(d=$(mktemp -d) && cp adjudicate.py "$d" && cd "$d" && env -u PYTHONPATH python adjudicate.py trial.md reviewer1.json reviewer2.json || echo "exit status $?")
```

```
evistream_backend at commit aae3b76 is required: run from that checkout with it on PYTHONPATH. app.services.adjudication_service must provide the private helpers _unwrap_for_compare, _align_multiselect and _canon, which may have moved in later commits. Import failed with: ModuleNotFoundError("No module named 'app'")
exit status 1
```

The finished table has no placeholders: conflicts, missing quotes and agreed empty
values are blank cells, explained under `outstanding`. List and table values are written
as JSON. Pass the
`outstanding` list on as the summary next to the table — which values were agreed, which
were adjudicated and by whom, and which remain open and why.

## 7. Score against a reference sheet

`eval/score_form.py` is the project's field-typed scorer. It reads an extraction CSV with
one row per study and a reference workbook, matches studies by a fuzzy name, infers a
comparison per column (exact number, normalised text, or a model judge for free text),
and writes per-field precision, recall, F1 and a colour-coded comparison workbook.

```python
# make_sheets.py — one-study extraction CSV and reference workbook
import json

import pandas as pd

record = json.load(open("result.json"))
row = {"Paper": "Purngpipattrakul 2020"}
row.update({k: v.get("value") for k, v in record.items()})
pd.DataFrame([row]).to_csv("extraction.csv", index=False)

reference = pd.DataFrame([{"Paper": "Purngpipattrakul 2020", "country": "Thailand",
                           "n_randomised": 92, "design": "parallel RCT"}])
reference.to_excel("reference.xlsx", sheet_name="study_char", index=False)
print(open("extraction.csv").read())
```

```bash
python make_sheets.py
python eval/score_form.py --ai extraction.csv --gt reference.xlsx \
  --gt-sheet study_char --no-llm --out-dir scores
```

Against the reference value of 92, the first run scores `macro_f1: 0.667` — `country`
and `design` right, `n_randomised` counted as a wrong value — and the second run
`macro_f1: 0.333`, its `design` scored as empty. Read that next to section 5: the scorer
compares values only, so `country` scores as correct although its quote supports nothing.
Score and quote audit answer different questions, and a review needs both.

`--no-llm` drops free-text fields from the score instead of sending them to a model judge;
the scores it prints are partial and are not the paper's numbers. The scorer handles one
row per study. Per-arm and per-outcome tables need an explicit field configuration — the
project's `eval/engine/forms/` folder carries the ones it used for its benchmark corpora.

## 8. The full platform, briefly

Only when a team needs the shared web workflow — accounts, blinded assignments, a pilot
calibration round, the adjudication screens, exports. Fill `.env` from `.env.example`
with your own credentials, create the database by following `docs/DATABASE.md` in the
repository, then start three processes from the repository root:

```bash
# each in its own terminal, all from the repository root with .venv active
redis-server --port 6380
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
celery -A app.workers.celery_app:celery_app worker --loglevel=info --concurrency=2 \
  -Q pdf_processing,code_generation,extraction,celery
```

Then run the frontend repository against it and register reviewers. The shared demo
account is switched off in this release.

## Try it

A self-contained check of the parts of this skill that need no model and no account: the
page-separated conversion, the source linker's four grounding outcomes, and the dual-review
rules. It installs two pinned packages into its own virtual environment rather than the
550 MB lock file, because the source linker depends on nothing else.

**Data** — the CC BY 4.0 trial report from section 3 (Trials 21:990, 2020; PMC7706009),
from NCBI's public PMC Open Access bucket, which tags it `CC BY` and needs no account. The
file's MD5 matches the checksum in the bucket's own metadata for this article. Confirmed reachable on 2026-10-21;
744,750 bytes, 7 pages.
The six quotes below are written inline: three real passages from the paper, one real
sentence reworded, and two invented sentences carrying real values — each standing for
something a model returned in section 4 or could return.

**Run**

```bash
set -euo pipefail
git clone --quiet https://github.com/karthik-strikes/evistream_backend.git
git -C evistream_backend checkout --quiet aae3b7699526fe3d636340c850a63e6da052b288
python3 -m venv tryit-venv
tryit-venv/bin/pip install --quiet "pymupdf==1.26.0" "rapidfuzz==3.13.0"
curl -fsSL -o trial.pdf \
  "https://pmc-oa-opendata.s3.amazonaws.com/PMC7706009.1/PMC7706009.1.pdf"

cat > tryit.py <<'PY'
import sys

import fitz

sys.path.insert(0, sys.argv[1])
from utils.source_linker import enrich_extraction_results, parse_page_boundaries

doc = fitz.open(sys.argv[2])
md = "\n\n".join("{%d}%s\n\n%s" % (i, "-" * 48, p.get_text("text").strip())
                 for i, p in enumerate(doc))
pages = parse_page_boundaries(md)
print("pages:", doc.page_count, len(pages))
assert len(pages) == doc.page_count == 7

cells = {
    # verbatim, crosses a line break in the PDF text
    "n_analysed": {"value": "86", "source_text": "performed at a teaching hospital on 86 adult patients undergoing abdominal surgery"},
    # verbatim, text inside the participant-flow figure
    "n_randomised": {"value": "92", "source_text": "Randomized (n=92)"},
    # verbatim, crosses a hyphenated line break ("com-" / "plications")
    "complications": {"value": "33", "source_text": "A total of 33 of the 86 study patients developed complications"},
    # the same abstract sentence, reworded
    "reworded": {"value": "86", "source_text": "This randomised clinical trial was done at a teaching hospital on 86 adult patients"},
    # invented sentence, real and distinctive value
    "invented": {"value": "79.1%", "source_text": "Group G succeeded in four of five patients."},
    # invented sentence, plain integer value
    "invented_int": {"value": "86", "source_text": "Eighty-six adults were enrolled across four sites."},
}
out = enrich_extraction_results(cells, md)
for k, v in out.items():
    loc = v.get("source_location") or {}
    print(f"{k:14} page={loc.get('page')} method={loc.get('grounding_method')} conf={loc.get('confidence')}")

loc = {k: v.get("source_location") or {} for k, v in out.items()}
assert (loc["n_analysed"]["grounding_method"], loc["n_analysed"]["page"]) == ("quote_exact", 1)
assert (loc["n_randomised"]["grounding_method"], loc["n_randomised"]["page"]) == ("quote_exact", 5)
assert (loc["complications"]["grounding_method"], loc["complications"]["page"]) == ("quote_exact", 3)
assert loc["reworded"]["grounding_method"] == "quote_fuzzy" and loc["reworded"]["page"] == 1
assert loc["invented"]["grounding_method"] == "value_text" and loc["invented"]["page"] == 1
assert loc["invented_int"] == {}


def canon(v):
    s = str(v).strip().lower()
    if s in ("yes", "y", "true"):
        return "true"
    if s in ("no", "false"):
        return "false"
    try:
        return float(s)
    except ValueError:
        return s


assert canon("Thailand") == canon(" thailand ") and canon("86") == canon(86.0)
assert canon(True) == canon("Y") and canon("86") != canon("92")
# canon() above is a compact stand-in for the single-value rules only; section 6 uses
# upstream's own helpers, which also cover lists, table rows and missing fields.
print("all assertions passed")
PY
tryit-venv/bin/python tryit.py evistream_backend trial.pdf
```

**Expect**

*Invariants* (a failure here means this skill is wrong):

- The PDF converts to 7 pages and the linker reads back 7 page spans.
- A verbatim quote is placed as `quote_exact` on the right page, including across a line
  break (page 1), across a hyphenated break (page 3) and inside the participant-flow
  figure (page 5).
- A reworded sentence is still placed, as `quote_fuzzy` — the reason to trust only
  `quote_exact`.
- An invented quote with a distinctive value is placed as `value_text` on the page where
  the value occurs, and an invented quote with a bare integer is not placed at all.
- Reviewer values compare case- and type-insensitively, and `86` against `92` is a conflict.

*Observed, commit aae3b76 on 2026-10-21* (drift to investigate, not a bug):

```
pages: 7 7
n_analysed     page=1 method=quote_exact conf=1.0
n_randomised   page=5 method=quote_exact conf=1.0
complications  page=3 method=quote_exact conf=1.0
reworded       page=1 method=quote_fuzzy conf=0.904
invented       page=1 method=value_text conf=0.7
invented_int   page=None method=None conf=None
all assertions passed
```

The fuzzy score and the fixed 0.7 for value placement are the linker's own constants and
scoring, so they move only when upstream changes the matching.

## Troubleshooting

- **The extraction script finishes its model calls and never exits** — it used
  `asyncio.run()`. Drive the event loop directly, as `extract.py` does.
- **`ImportError: dlopen(... _spropack ...) section '__DATA/__thread_bss'`** — the locked
  scipy wheel on recent macOS. Install `scipy==1.16.3` into the same environment.
- **Pydantic `Field required` errors naming `SUPABASE_SERVICE_KEY`, `S3_BUCKET` and
  others** — you imported something under `app/`, which reads the platform settings at
  import. The extraction engine (`schemas/`, `dspy_components/`, `utils/`) does not need
  them; stay out of `app/` for standalone use.
- **Answers that ignore the later pages on a local model** — check the `CONTEXT` column
  of `ollama ps` against the length of the paper. A full trial report with references is
  commonly 10,000 to 25,000 tokens.
