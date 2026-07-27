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
category: analysis        # data | models | analysis | utility
license: CC-BY-4.0
author: Your Name
version: 1.0.0
tags: [example, demo]
attribution: https://example.com/source   # only when adapted from a third party
---
```

> **`name` and `description` must be single-line scalars.** They are read by a line-based
> parser, so YAML block scalars (`>` / `|`) and multi-line values will not load. CI enforces this.

Skills are documentation, not programs. Only `.md`, `.txt`, `.json`, `.yaml`, `.yml`,
`.csv`, `.tsv`, and `.bib` files may be published.

## Categories

| category | for |
|---|---|
| `data` | getting information out of an external source — databases, atlases, APIs |
| `models` | running a trained model — protein language models, structure prediction, docking |
| `analysis` | processing, computing over, or evaluating data you already have |
| `utility` | file formats, methodology, general-purpose helpers |

## Installing a skill

In **Heureka Bench**: Settings → ARC → Skills → *Browse registry*, then install
any skill from the list.

You can also just ask ARC — it can search this registry and install a skill
mid-conversation, then use it in the same turn.

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

Repository code is licensed under **Apache-2.0**. Skill content authored here is
licensed under **CC-BY-4.0**. See [LICENSE](LICENSE).

**Skills adapted from third-party sources keep their original licence.** That licence
is named in each skill's `license` frontmatter field and shown on its page; the source
is in `attribution`; the full list is in [NOTICE](NOTICE). Do not assume a skill is
CC-BY-4.0 — check the skill.

Skills are documentation describing how to use third-party tools and data sources.
They are provided **as is, without warranty of any kind**, and naming a tool here is
not an endorsement of it or a claim of affiliation with it. Verify results before
relying on them.
