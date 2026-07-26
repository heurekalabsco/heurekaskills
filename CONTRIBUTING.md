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
   category: fetch | analysis | utility
   license: CC-BY-4.0
   author: <your name or org>
   version: 1.0.0
   tags: [a, b]
   ---
   ```
3. Put supporting material in `skills/<slug>/references/`. Relative paths only — no `..`,
   absolute paths, or symlinks.

## What belongs here

Skills that **fetch** data or **analyze** it, written so any agent can follow them.

Skills are documentation the agent reads, not code it runs, so only these file types may
be published: `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.csv`, `.tsv`, `.bib`.

## Validation

Run `npm run validate` before opening a PR. CI runs the same checks:

- `SKILL.md` present; `name` / `description` parse as non-empty single-line values.
- `name` equals the directory name and matches `^[a-z0-9-]+$`.
- `category` is one of `fetch`, `analysis`, `utility`.
- Reference paths are relative and safe; no symlinks.
- Allowed file types only.
- Per-file (1 MB) and per-skill (5 MB) size caps; at most 50 files per skill.

## License

By contributing you agree your skill content is released under **CC-BY-4.0** and any code
under **Apache-2.0**. If you adapt third-party CC-BY content, preserve attribution in the
skill and in `NOTICE`.
