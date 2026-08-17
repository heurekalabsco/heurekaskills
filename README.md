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
category: analysis        # data | models | analysis | utility | communication
license: CC-BY-4.0
author: Your Name
version: 1.0.0
tags: [example, demo]
attribution: https://example.com/source   # only when adapted from a third party
---
```

> **`name` and `description` must be single-line scalars.** They are read by a line-based
> parser, so YAML block scalars (`>` / `|`) and multi-line values will not load. CI enforces this.

A `data` skill carries four more keys, and needs a `## Get the files` section — retrieving
the data is the point of the category:

```yaml
covers: [liver, rna-seq, human]   # free-text search vocabulary, max 30 — how people find this
papers: [PMID:39607691]           # provenance; doi:10.… also accepted
access: [open]                    # open | registered | controlled
platform: snovault                # optional — shared infrastructure, for drift sweeps
```

`covers` is what makes a dataset findable by question rather than by name: the site indexes
it, so someone searching `liver rna-seq` reaches your skill even though neither word fits in
the description.

Some sources keep their data behind an application — individual-level human data, typically.
A skill may **describe** such a tier as long as what it actually instructs is open: query the
public catalogue, report what applying requires. Declare `access: [open, controlled]`, and add
a `## Requesting access` section covering who may apply, what the application asks for, and
how long it takes. A skill whose only route is `controlled` cannot deliver anything and is not
accepted; and no skill should fill in an application's attestations on someone's behalf.

Skills are documentation, not programs. Only `.md`, `.txt`, `.json`, `.yaml`, `.yml`,
`.csv`, `.tsv`, and `.bib` files may be published.

## Categories

| category | for |
|---|---|
| `data` | getting information out of an external source — databases, atlases, APIs |
| `models` | running a trained model — protein language models, structure prediction, docking |
| `analysis` | processing, computing over, or evaluating data you already have |
| `utility` | file formats, methodology, general-purpose helpers |
| `communication` | conveying science to a person — figures, graphical abstracts, posters, talks, plain-language summaries |

`communication` vs `utility`: a communication skill's output is read or viewed by a
person; a utility skill's output feeds another tool or workflow step.

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
