# heurekaskills

A public registry of **scientific workflow skills** — reusable, documented procedures that an AI research agent can load on demand. Browse them at **[heurekaskills.com](https://heurekaskills.com)**.

This repository is the source of truth for the skill content. Nothing else lives here.

## What is a skill?

A directory under `skills/` containing a `SKILL.md` (the instructions) plus optional reference files:

```
skills/<slug>/
  SKILL.md            # required — YAML frontmatter + instruction body
  references/*.md     # optional supporting material
```

`SKILL.md` frontmatter:

```yaml
---
name: my-skill            # must equal the directory name; [a-z0-9-]+
description: One single-line sentence describing when to use this skill.
category: analysis        # fetch | analysis | utility
license: CC-BY-4.0
author: Your Name
version: 1.0.0
tags: [example, demo]
---
```

> **`name` and `description` must be single-line scalars.** They are read by a line-based
> parser, so YAML block scalars (`>` / `|`) and multi-line values will not load. CI enforces this.

Skills are documentation, not programs. Only `.md`, `.txt`, `.json`, `.yaml`, `.yml`,
`.csv`, `.tsv`, and `.bib` files may be published.

## Categories

| category | for |
|---|---|
| `fetch` | retrieving data from an external source |
| `analysis` | processing, computing over, or evaluating data |
| `utility` | general-purpose helpers |

## Installing a skill

**CLI**

```
arc skill install <slug>          # e.g. arc skill install boltz2-nim
arc skill list --remote
```

**Heureka Bench** — Settings → Extensions → Skills → *Install from URL*, then paste
`https://heurekaskills.com/<slug>`.

## Machine interface

- `GET /registry.json` — index of all skills.
- `GET /<slug>/skill.json` — per-skill manifest with `files[]` (each with `sha256` + `size`).
- `GET /<slug>/files/<path>` — raw skill files.

Clients verify every file's `sha256` before installing. JSON Schemas for both documents
are in [`schema/`](schema/).

## Contributing

Add or edit a skill under `skills/` and open a pull request — see
[CONTRIBUTING.md](CONTRIBUTING.md). CI validates the format on every PR, and a maintainer
reviews and merges. Merged changes appear on the site shortly afterwards.

## License

Dual-licensed: code under **Apache-2.0**, skills and documentation under **CC-BY-4.0**.
See [LICENSE](LICENSE) and [NOTICE](NOTICE). Seed skills are adapted from the
[NVIDIA BioNeMo Agent Toolkit](https://github.com/NVIDIA-BioNeMo/bionemo-agent-toolkit)
under CC-BY-4.0.
