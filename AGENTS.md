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
- **Keep descriptions under ~250 characters.** Not CI-enforced, but a description is
  loaded for every installed skill in every session whether or not the skill is used.
  Upstream descriptions routinely run past 1,000 characters — rewrite them, don't paste.
- Upstream frontmatter often carries junk: authoring metadata, platform-specific blocks,
  stale compatibility strings. Rebuild the frontmatter rather than patching theirs.

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
   dead end that sends an agent hunting for something that does not exist. Grep for
   "see the … skill" and for any "related skills" section.
4. **Strip the origin's branding, keep the subject matter.** An adapted skill credits its
   source in `author`, `attribution`, and `NOTICE` — not in the prose. Naming the tools
   being documented is correct and expected; carrying another vendor's authorship or
   house style is not.
5. **Do not route work through third-party AI services.** Prefer something local and
   editable — a Mermaid diagram stays readable as text; a generated image does not.

## Licensing

A skill ships only when its licence is **positively identified** and **permissive**
(MIT, BSD, Apache-2.0, CC-BY-4.0, or equivalent).

Rejected, without exception:

- Unknown, missing, or ambiguous licence. If the original author did not know, we don't either.
- Share-alike (CC-BY-SA, GPL) — it would force its terms onto the registry.
- Non-commercial (CC-BY-NC).
- Content credited to an individual contributor rather than the publishing project,
  unless that project demonstrably holds an assignment or CLA. A repository LICENSE file
  does not prove the repository owner had the right to grant it.

**Never relicense adapted content.** Set `license` to the licence that actually governs
the text being redistributed. Do not relabel it CC-BY-4.0 just because that is this
repo's default for original content — claiming a licence we do not hold creates exactly
the problem the gate exists to prevent. Every adapted skill also needs an entry in
`NOTICE`.

## Pull requests

- **Always a PR. Never push to `main`.** CI validates on the PR; a maintainer reviews
  and merges. Merged changes publish automatically — there is no manual publish step, so
  a bad merge is live within minutes.
- **`git fetch` before comparing against `main`.** A stale local ref has already caused a
  duplicated fix and a merge conflict. Compare against `origin/main`.
- **Commit messages are as public as the files** and are permanent. Keep them factual and
  about the content.
- **Everything you write here is world-readable — PR titles and bodies, issue comments,
  and review threads, not just files.** Heureka Labs' other repositories are private. Do
  not name them, cite their PR or issue numbers, or quote their file paths, line numbers,
  or internal identifiers in anything published here. Refer to "the Bench client", "the
  registry site", or "the submission service" instead. Editing a body later does not undo
  it — GitHub keeps the edit history visible.
- Do not add AI co-authorship trailers to commits. This repo's history has none; keep it
  that way.
- Group changes into logical commits — the history is a public artifact.
