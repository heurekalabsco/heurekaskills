# Contributing to heurekaskills

Skills are added and edited by pull request. A maintainer reviews every one before it
goes live.

## Add or edit a skill

1. Create `skills/<slug>/SKILL.md`. `<slug>` must match `^[a-z0-9-]+$` and equal the
   `name` in the frontmatter.
2. Frontmatter — all values single-line. The loader is a line-based parser, so **no**
   YAML block scalars (`>` / `|`) for `name` or `description`:

   ```yaml
   ---
   name: <slug>
   description: One single-line sentence — when should the agent use this skill?
   category: data | models | analysis | utility | communication
   license: CC-BY-4.0
   author: <your name or org>
   version: 1.0.0
   tags: [a, b]
   ---
   ```

   When a skill is adapted from a third party, keep their licence in `license`,
   credit them in `author`, and point `attribution` at the original source. The
   body is Heureka Labs' rewrite — it documents the third-party *tools*, but it
   should not carry another vendor's authorship or house style.
3. Put supporting material in `skills/<slug>/references/`. Relative paths only — no `..`,
   absolute paths, or symlinks.

## What belongs here

Skills that get **data**, run **models**, **analyze** results, or **communicate** them,
written so any agent can follow them.

Skills are documentation the agent reads, not code it runs, so only these file types may
be published: `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.csv`, `.tsv`, `.bib`.

## Validation

Run `npm run validate` before opening a PR. CI runs the same checks:

- `SKILL.md` present; `name` / `description` parse as non-empty single-line values.
- `name` equals the directory name and matches `^[a-z0-9-]+$`.
- `category` is one of `data`, `models`, `analysis`, `utility`, `communication`.
- Reference paths are relative and safe; no symlinks.
- Allowed file types only.
- Per-file (1 MB) and per-skill (5 MB) size caps; at most 50 files per skill.
- Every skill with an `attribution` field is credited in `NOTICE`, and every skill
  `NOTICE` credits exists and carries that field.
- `license` is present and permitted (MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0,
  CC-BY-4.0, CC0-1.0, ISC, Unlicense). SPDX expressions are evaluated, not string-matched:
  `A AND B` needs both permitted, `A OR B` needs either, so `MIT OR GPL-3.0` is accepted
  on its MIT branch.
- `description` is at most 400 characters.
- A `data` skill has a `## Get the files` section, and an `access:` that is not
  `controlled` alone — retrieving the data is the point of the category, and a source no
  reader can lawfully reach does not ship.
- A skill whose `access:` includes `controlled` has a non-empty `## Requesting access`
  section — a real level-2 heading in `SKILL.md`, not one shown inside a code block. CI checks
  that it exists and has content; review checks that it says who may apply, what the
  application requires, and how long it takes. Describing a gated tier is allowed; naming a
  locked door and walking away is not.
- Neither `SKILL.md` nor `references/*.md` references a skill outside this registry —
  checked for "see/use/refer to the … skill" and for names under a "Related skills"
  heading.

## License

By contributing **original** skill content you agree it is released under **CC-BY-4.0**,
and any code under **Apache-2.0**.

**Adapted content keeps its original licence — do not relicense it.** Set `license` to
the licence that actually governs the text you are redistributing, credit the original
author in `author`, and point `attribution` at the source. **Text you adapt** must come
from a permissively licensed source (MIT, BSD, Apache-2.0, CC-BY). Adapted text whose
licence you cannot positively identify will not be merged, and neither will adapted text
under a share-alike or non-commercial licence.

**Documenting a tool is not adapting it.** A skill you write from scratch is yours to
license, whatever the licence of the program or database it is about — that is the usual
case, not the exception. Adapting means reusing the upstream's expression: its prose, its
structure, its worked examples. Facts and interfaces are not expression, so reading a
tool's parameters and writing them up yourself is original work. If you cannot tell which
you produced, it is adapted. Never paste upstream code into a body — write the snippet
yourself, since the body is where this registry ships code.

The tool's own licence matters for a different reason: **a reader has to be able to run
it.** Needing an API key, an account, or a GPU is fine — say so before the first code
block that runs the tool. What does not ship is a tool nobody can lawfully use:
non-commercial terms (they restrict use, and a skill exists to cause use), no stated
licence at all (silence grants nothing), access handed out case by case, or no
public install path at all.

Write the body in your own words. Do not paste documentation from the tool you are
documenting — a skill is instructions for an agent, not a copy of an upstream manual.

If you adapt third-party CC-BY content, preserve attribution in the
skill and in `NOTICE`.
