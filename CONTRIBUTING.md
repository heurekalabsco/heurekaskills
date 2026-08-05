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
- `description` is at most 250 characters.
- Neither `SKILL.md` nor `references/*.md` references a skill outside this registry —
  checked for "see/use/refer to the … skill" and for names under a "Related skills"
  heading.

## License

By contributing **original** skill content you agree it is released under **CC-BY-4.0**,
and any code under **Apache-2.0**.

**Adapted content keeps its original licence — do not relicense it.** Set `license` to
the licence that actually governs the text you are redistributing, credit the original
author in `author`, and point `attribution` at the source. Only permissively licensed
sources are accepted (MIT, BSD, Apache-2.0, CC-BY). Content whose licence you cannot
positively identify will not be merged, and neither will anything under a share-alike
or non-commercial licence.

**Documenting a tool is not adapting it.** A skill you write in your own words is yours
to license, whatever the licence of the program or database it is about — that is the
usual case, not the exception.

The tool's own licence matters for a different reason: **a reader has to be able to run
it.** Needing an API key, an account, or a GPU is fine — say so before the first code
block. What does not ship is a tool nobody can lawfully use: non-commercial terms (they
restrict use, and a skill exists to cause use), access handed out case by case, or no
public install path at all.

Write the body in your own words. Do not paste documentation from the tool you are
documenting — a skill is instructions for an agent, not a copy of an upstream manual.

If you adapt third-party CC-BY content, preserve attribution in the
skill and in `NOTICE`.
