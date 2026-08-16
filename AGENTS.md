# AGENTS.md

Guidance for AI agents working in this repository. Humans should start with
[README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md) — this file is the
operational version of both.

## What this repo is

The public source of truth for the skills published at
**[heurekaskills.com](https://heurekaskills.com)** — a library of agent skills for
scientific discovery: getting data, running models, analyzing results.

Content only. Skills, their schemas, and the validator that checks them. There is no
application code here, and none should be added.

Two consequences that shape everything below:

- **A skill becomes another agent's instructions.** Whatever you write here, some
  agent will later follow literally, including any code block. Wrong instructions are
  worse than no skill.
- **Every skill is reviewed by a scientist before it is published, and this history is
  public and permanent.** Assume a person reads every line, and that nothing you
  commit can be unpublished later.

## Layout

```
skills/<slug>/
  SKILL.md            # required — YAML frontmatter + instruction body
  references/*.md     # optional supporting material
schema/               # JSON Schema for registry.json and skill.json
scripts/validate.js   # the checks CI runs
NOTICE                # attribution for every adapted skill
```

## Commands

```bash
npm install
npm run validate      # exactly what CI runs on the PR — run it before pushing
```

## Frontmatter contract

```yaml
---
name: <slug>                 # must equal the directory name; ^[a-z0-9-]+$
description: One single-line sentence — when should an agent use this skill?
category: data | models | analysis | utility | communication
license: <the licence that actually governs this text>
author: <name or org>
version: 1.0.0
tags: [a, b]                 # max 5, no duplicates
attribution: <source url>    # adapted skills only
---
```

Traps that will fail CI or, worse, fail silently in a client:

- **Never quote `name` or `description`, and never use block scalars (`>` / `|`).**
  A line-based parser reads these fields, and CI checks that it and a real YAML parser
  return the same value. Quoting makes them diverge, so the check fails by design.
- **No `: ` inside an unquoted description.** YAML reads it as a nested mapping and the
  file stops parsing. Use an em dash instead.
- **Keep descriptions at or under 250 characters — CI enforces this.** A description is
  loaded for every installed skill in every session whether or not the skill is used.
  Upstream descriptions routinely run past 1,000 characters — rewrite them, don't paste.
- Upstream frontmatter often carries junk: authoring metadata, platform-specific blocks,
  stale compatibility strings. Rebuild the frontmatter rather than patching theirs.
- **Reuse an existing tag before inventing one.** Tags are filter chips on the site, so a
  tag only your skill uses is a filter that returns exactly one result. Run
  `npm run validate` — it prints how many tags are used by a single skill — and check the
  live vocabulary before adding a synonym of one that already exists (`rna-seq` vs
  `rnaseq`, `structure-prediction` vs `protein-structure`). New vocabulary is fine when
  the subject is genuinely new; a fifth spelling of an existing idea is not.

### Categories

| category | for |
|---|---|
| `data` | getting information out of an external source — databases, atlases, APIs |
| `models` | running a trained model — protein language models, structure prediction, docking |
| `analysis` | processing, computing over, or evaluating data you already have |
| `utility` | file formats, methodology, general-purpose helpers |
| `communication` | conveying science to a person — figures, posters, plain-language summaries |

`communication` vs `utility`: a communication skill's output is read by a person; a
utility skill's output feeds another tool or workflow step.

When both readings fit, ask **what the skill hands back at the end**:

| Skill | Hands back | Category |
|---|---|---|
| Graphical abstract for a paper | An SVG a reader looks at | `communication` |
| Plain-language summary of a result | Prose a non-specialist reads | `communication` |
| Filling a journal submission portal | A form field file the tool consumes | `utility` |
| Converting between file formats | A file the next step opens | `utility` |

The subject matter being publication-adjacent does not make it `communication`.
Submission, formatting and packaging are plumbing; the manuscript is the artefact a
person reads, and a skill that does not produce that artefact is `utility`.

## Documentation only — do not add scripts

Publishable file types: `.md` `.txt` `.json` `.yaml` `.yml` `.csv` `.tsv` `.bib`.
Caps: 50 files per skill, 1 MB per file, 5 MB per skill.

**A single disallowed file makes the entire skill uninstallable** — clients reject the
whole manifest, not just the offending file. The allowlist is enforced in the validator
here *and* independently in each client, so it cannot be widened from this repo alone.

So when a skill needs code, **inline it as a fenced code block in the body** and let the
agent write it into the project. This is deliberate: in a lab notebook, code the
researcher can read and keep beats a black box they cannot. Most upstream "scripts" are
argument parsers wrapped around a few library calls, which an agent writes correctly
from a clear description.

Do not add a `scripts/` directory to a skill, and do not reference one in the body.

## Writing the body

1. **Verify against live sources, not documentation, and run every code block** —
   including its error paths — before proposing it. Endpoints migrate, response shapes
   are not what the docs claim, model versions move on. A skill that ships a broken
   snippet is worse than no skill, because the agent will run it.
2. **Write in your own words.** Do not reproduce an upstream manual. Permissive
   licensing allows reuse, but a copied manual is bad content regardless.
3. **Do not reference skills that are not in this registry.** "See the `foo` skill" is a
   dead end that sends an agent hunting for something that does not exist. CI checks both
   forms — "see/use/refer to the … skill", and every name bulleted under a "Related
   skills" heading — across `SKILL.md` and `references/*.md`. A **library** is not a
   skill: naming statsmodels under that heading reads as a registry skill that does not
   exist, so mention tools in prose instead. **Write skill names in backticks.** A bare
   word is left alone, because "the router will see the same skill twice" is English, not
   a reference — so `` `foo` `` is what CI can actually check.
4. **Strip the origin's branding, keep the subject matter.** An adapted skill credits its
   source in `author`, `attribution`, and `NOTICE` — not in the prose. Naming the tools
   being documented is correct and expected; carrying another vendor's authorship or
   house style is not.
5. **Do not route work through third-party AI services.** Prefer something local and
   editable — a Mermaid diagram stays readable as text; a generated image does not.

## `## Try it` — every skill must be testable

A skill is a claim that a tool works a certain way. `## Try it` is what lets anyone — a
reader, or the nightshift — check whether that claim still holds. Required on every new
skill, and on any existing skill you touch.

**It is maintained, not written once.** Datasets decay independently of the tool: URLs 404,
accessions get withdrawn, hosts add a login. That is the same class of decay as an upstream
API change and is treated the same way — `npm run check-datasets` probes every declared
dataset in the registry, the nightshift runs it before choosing a target, and CI runs it
nightly besides. A dead dataset is drift, and it becomes work.

**Declare the dataset in frontmatter, not just in prose:**

```yaml
datasets: [https://alphafold.ebi.ac.uk/api/prediction/P04637]
```

The checker reads that key and never parses the body — which is what keeps the cost flat as
the registry grows. Prose still needs to say what the dataset *is*, what licence it carries,
and when it was last confirmed reachable; frontmatter is what a machine sweeps.

**A skill awaiting backfill declares `try-it: pending`** in its own frontmatter. That marker
is the only exemption from the rule above, and it lives in the skill rather than in a central
list on purpose: the nightshift publishes one skill's files at a time, so an exemption stored
anywhere else makes backfilling a two-file change it cannot make — which deadlocked the whole
queue until 2026-08-15. Backfilling is now: delete the marker, add the section, declare the
data. One file. A new skill may not use the marker.

Entries must be `https://` URLs. If your `Try it` generates its data inline and there is
nothing to fetch, say so explicitly with an empty list — `datasets: []` — rather than
omitting the key. `npm run validate` enforces all of this on every PR, so a malformed entry
fails there rather than going quiet until the nightly check.

`skills/alphafold/SKILL.md` is the worked example. Three parts, in this order:

**Data.** A named, citable, public dataset, with its licence and the fact that no account
is needed. Prefer real data over synthetic: real data is what catches the schema change
that breaks the skill. If no lawful public dataset exists — the §3b access test applies to
data exactly as it does to tools — generate it inline instead, and say why you had to.
Never `example.com`, never `path/to/your.bam`. A placeholder is not testable.

**Run.** One self-contained block that goes from the data to a result, runnable by copy
and paste with nothing else set up. Where the tool has a trap, route the example through
it — the AlphaFold example indexes `rec[0]` precisely because the endpoint returns a list
and treating it as a dict is the usual mistake.

**Expect.** What makes this a test rather than a demo. Two kinds, and both matter:

- **Invariants** — true regardless of version, so a failure means the skill is *wrong*.
  One pLDDT per residue; the recomputed mean matching the API's own figure.
- **Observed values, dated and version-stamped** — these move when upstream rebuilds, so a
  mismatch means *drift to investigate*, not a bug.

Keeping those apart is the whole point. Collapse them and every upstream release reads as
a failure, and the section gets ignored within a month.

**Run it before you ship it.** The block goes in the skill only after it has executed
verbatim and produced the output written under Expect. This is `## 7` applied to the one
block a reader is most likely to run first.

## Licensing

Two separate questions. Conflating them has already produced wrong answers on the issue
tracker — twice — so ask them in order.

### 1. Whose text is this? — what goes in `license`

`license` describes **the text in the file**, not the tool the text is about.

A skill written here from scratch is `CC-BY-4.0`, credited to whoever wrote it —
`author: Heureka Labs`, or a contributor by name, as `pathway-cca-coessentiality` is.
That holds even when its entire subject is somebody else's database or program:
`alphafold` documents an EMBL-EBI database and `autodock-vina` documents a program we did
not write, and both are original skills.

**Adapted** means you reused the upstream's **expression** — not only its sentences, but
its structure, its worked examples, its selection and ordering of what matters. Rewording
an upstream manual is still adapting it; `paperpush` was written here against the released
tool and is *still* adapted, because what it documents came from that project. Two
tests, in this order:

- **Facts and interfaces are not expression.** Endpoint names, parameters, return shapes,
  version numbers, what a flag does — reading those off a tool and writing them up is
  original work. That is the usual case.
- **If you cannot tell which you produced, it is adapted.** Set the source's licence and
  add the `NOTICE` entry. Where the call is genuinely close and the answer changes what
  ships, leave it to a human.

Where text *is* adapted, its licence must be **positively identified** and **permissive**
(MIT, BSD, Apache-2.0, CC-BY-4.0, or equivalent). Rejected, without exception:

- Unknown, missing, or ambiguous licence. If the original author did not know, we don't either.
- Share-alike (CC-BY-SA, GPL) — it would force its terms onto the registry. A dual
  expression is fine when a permissive branch exists: `MIT OR GPL-3.0` is accepted and
  taken under MIT, because nothing here inherits the GPL terms. `MIT AND GPL-3.0` is not.
- Non-commercial (CC-BY-NC).
- Content credited to an individual contributor rather than the publishing project,
  unless that project demonstrably holds an assignment or CLA. A repository LICENSE file
  does not prove the repository owner had the right to grant it.

**Never relicense adapted content.** Set `license` to the licence that actually governs
the text being redistributed. Do not relabel it CC-BY-4.0 just because that is this
repo's default for original content — claiming a licence we do not hold creates exactly
the problem the gate exists to prevent. Every adapted skill also needs an entry in
`NOTICE`.

These four rejections are about text we would republish. None of them is a reason to
refuse to *document* a tool — that question is the next one.

Two things hold whichever way the skill was written. The frontmatter `license` must always
be one CI permits, original or adapted — `scripts/validate.js` checks every skill, not
only adapted ones. And **never paste upstream code into a body.** Inlined blocks are how
this registry ships code (see *Documentation only*), so a copied script carries its
source's licence into a file stamped with ours. Write the snippet yourself.

### 2. Can the reader run it? — the access test

A skill nobody can run is not a skill, and a registry of them is worse than a smaller one
that works. This gate is about the tool, and it decides whether documenting it is worth
doing at all.

**Ship it, and state what the reader must obtain before the first code block that runs the
tool.** A free or paid API key, an account, a click-through licence, a GPU — all fine,
because any reader can get one. `boltz2-nim` states its NGC key requirement before the
first call. Install commands do not count as that block; the rule is about not letting
someone reach the point of running something before they learn they cannot.

Plenty of skills need nothing at all — `alphafold` reads an open endpoint,
`graphical-abstract` documents a method. Nothing to obtain is the easiest pass, not a gap.

**Do not ship it** when no reader has a lawful route to running it:

- **Non-commercial terms on the tool.** Share-alike restricts redistribution, and the code
  in these bodies is ours — documenting a GPL tool is fine, which is why `autodock-vina`
  routes to two GPL-2.0 engines. Non-commercial restricts *use*, and getting an agent to
  use the tool is the whole function of a skill. Much of this registry's audience works
  commercially, so publishing one would route them into terms they cannot meet. Settled.
- **No licence at all** — no `LICENSE`, no terms page, nothing stated. Silence grants
  nothing, which is stricter than the non-commercial case, not looser. Upstream can fix
  this, so it parks rather than closes.
- **Access granted case by case** — committee approval, an institutional agreement, "email
  us for the weights". We cannot promise a reader a door somebody else opens. Settled
  unless the gate is advertised as open to anyone who asks.
- **No public install path, or a dependency that is not released yet.** Parks.

Judge the *paths*, not the tool, and ask whether **one** reader can lawfully take one.
A restricted option alongside usable ones is a disclosure; a restriction on the only path
is a reject. Free-for-academics with commercial terms by negotiation is the common hard
case: it ships, because the academic route is real and open — say plainly who each route
is for. Where a gated tool has an open equivalent, document the equivalent.

Record the finding on the issue either way, with the link that proves it. Settled cases
get `blocked`; re-checkable ones get `needs-info`, stay open, and **name what would
unblock them** — "when a LICENSE lands", "when the package ships" — so a later pass tests
that instead of repeating the search. A rejection nobody wrote down gets investigated
again next pass.

## Pull requests

- **Always a PR. Never push to `main`.** CI validates on the PR; a maintainer reviews
  and merges. Merged changes publish automatically — there is no manual publish step, so
  a bad merge is live within minutes.
- **`git fetch` before comparing against `main`.** A stale local ref has already caused a
  duplicated fix and a merge conflict. Compare against `origin/main`.
- **Commit messages are as public as the files** and are permanent. Keep them factual and
  about the content.
- **Everything you write here is world-readable — PR titles and bodies, issue comments,
  and review threads, not just files.** Heureka Labs' other repositories are private. In
  anything published here, do not name them, link to them, or quote what is inside them:
  PR and issue numbers, file paths, line numbers, branch names, commit SHAs, hostnames,
  or pasted logs and screenshots containing any of those. Say "the Bench client", "the
  registry site", or "the submission service" instead.

  This covers the private *repositories*, not the products. The public names — **Heureka
  Bench**, **ARC**, **heurekaskills.com** — are used deliberately in `README.md` and in
  the issue templates, and telling a user where to install a skill is the whole point.
  Keep writing them.

  Editing a body afterwards does not undo it — GitHub keeps the edit history visible.
- Do not add AI co-authorship trailers to commits. One commit on `main`, `49762ff`,
  carries one and a session URL; it predates this rule and cannot be edited out without
  rewriting history. It is the exception, not the pattern to copy.
- Group changes into logical commits — the history is a public artifact.
