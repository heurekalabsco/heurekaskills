---
name: graphical-abstract
description: Turn a paper or results summary into an accurate, accessible graphical abstract as editable SVG — choose the figure type, compose it, then audit palette contrast, greyscale separation and colour-vision safety before submission.
category: communication
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
try-it: pending
tags: [graphical-abstract, figures, accessibility, svg, publishing]
allowed-tools: Read, Write, Edit, Bash
---
# Graphical Abstract

## Overview

A graphical abstract is the most-read figure in a paper and the one most often
made badly. The failure mode is rarely draughtsmanship. It is cramming every
interaction into one frame, choosing colours that die in greyscale or under
red-green colour vision deficiency, and — the one that actually damages the
science — drawing mechanism the results do not support.

This skill encodes the judgement, not the drawing. It works in two modes:

- **create** — build a graphical abstract from a paper, manuscript draft, or
  results summary.
- **critique** — score an existing figure against the same checklist without
  redrawing it.

Output is **SVG**, deliberately. The author must be able to open the figure and
correct the science by hand, keep the text selectable and searchable, and scale
it to a journal column without resampling. A raster image is a dead end: an
error in it can only be fixed by regenerating the whole thing.

## When to use this skill

- Drafting a graphical abstract, visual abstract, or summary figure for a
  manuscript or preprint
- Reviewing a figure for accessibility before submission
- Adapting one figure for a different audience — clinicians, a policy brief, a
  conference slide, a lay summary
- Checking whether a palette survives greyscale printing and colour vision
  deficiency

**Not** for data plots with axes and quantitative encodings — those are charts,
governed by the data, and belong to a plotting workflow. This skill covers
schematic figures whose content is the argument.

## The one rule that outranks the rest

**Never draw a step the source does not state.** A graphical abstract is read
as a claim about the biology. If the results show that a knockout reduces flux
and do not identify the intermediate, the figure shows the knockout and the
reduced flux — not a guessed intermediate, not a speculative arrow, not a
mechanism assembled to make the picture look complete.

When the source is silent, the correct outputs are an honest gap, a dashed
"proposed" arrow explicitly labelled as such, or a question put back to the
author. Never a confident arrow.

Two supporting rules follow from it:

- **Do not upgrade correlation to causation with an arrowhead.** An association
  is a line or a bracket. An arrow asserts direction.
- **Do not invent quantities.** No axis, no "3-fold", no percentage that is not
  in the source.

---

## Mode: create

### Step 0 — Gate on the journal's policy, before drawing anything

Journal policies on AI-assisted and AI-generated imagery differ sharply and
change often. Some publishers prohibit generated imagery in figures outright,
some permit it with a declaration, some distinguish between generated artwork
and AI-assisted layout of author-supplied elements.

Ask the author for the target journal, then **read that journal's current
policy** rather than relying on memory or on this file — anything written here
would be stale within a year. Search the publisher's author guidelines for
"artificial intelligence", "generative AI", or "AI-generated images".

Resolve to one of three outcomes and say which:

| Finding | Action |
|---|---|
| Generated imagery prohibited | Stop. Produce the composition plan, palette and layout as a specification the author draws or commissions. Do not emit the figure. |
| Permitted with disclosure | Proceed, and deliver the declaration from Step 6 with the figure. |
| Policy not found or unclear | Proceed, flag it prominently, and tell the author to confirm before submission. |

If the author has no target journal yet, proceed and note that the gate is
deferred, not passed.

See `references/journal-policy.md` for what to search for and how to record it.

### Step 1 — Fix the single claim

Write, in one sentence, the claim the figure makes. Not the paper's topic — the
claim. "Loss of CPT1A blocks fatty acid oxidation, and medium-chain
supplementation restores it" is a claim. "Metabolic regulation in hepatocytes"
is a topic and cannot be drawn.

If the sentence needs an "and" joining two independent findings, the figure is
carrying two claims. Pick one, or split into two figures. Everything that does
not serve the chosen claim is cut in Step 4.

### Step 2 — Classify the figure type

The type determines the canonical composition. Six cover nearly everything:
**mechanism**, **process**, **experimental setup**, **workflow**,
**comparison**, **timeline**.

Read `references/figure-types.md` for each type's reading order, the layout it
implies, and its characteristic failure. Choosing the wrong type is the most
common structural error — a comparison drawn as a mechanism forces the reader
to hunt for the contrast that is the entire point.

### Step 3 — Fix the audience

The same result is drawn differently for different readers. State the audience
explicitly, because it changes what leads and what is cut:

| Audience | Leads with | Detail level | Terminology |
|---|---|---|---|
| Domain specialist | The mechanism or the novel step | Molecular, named entities | Gene and protein names, unexpanded |
| Adjacent researcher | The system-level result | Pathway, cell, tissue | Names expanded once |
| Clinician | The phenotype or outcome | Organ, patient, endpoint | Clinical vocabulary, few gene names |
| Policymaker or press | The consequence | One level, no molecules | Plain language throughout |
| Student | The logic of the experiment | Stepwise, nothing skipped | Everything defined |

### Step 4 — Compose

Apply all six, in order. Each is checkable in Step 5.

**Colour — semantic, limited, luminance-laddered.** Use at most three
meaning-bearing colours. Assign them roles and keep the roles consistent across
every panel of the figure. The validated default palette:

| Role | Colour | Contrast on white |
|---|---|---|
| Ink — text, outlines, arrows | `#111111` | 18.88:1 |
| Baseline, normal, healthy, control | `#1b4965` | 9.60:1 |
| Perturbation, disease, treatment | `#ca6702` | 3.85:1 |
| Context — de-emphasized scaffolding | `#d9d9d9` | non-meaning-bearing, exempt |

This triple is verified in Step 5 to hold at least 1.90:1 separation between
every pair, including after protanopia and deuteranopia simulation. Warm reads
as perturbation and cool as baseline, which is the convention most readers
already carry.

If you deviate, run the audit — do not assume. Red-green pairs in particular
fail: the common `#d62728` / `#2ca02c` pair collapses to 1.16:1 under
deuteranopia, effectively one colour.

**Redundant encoding — colour is never the only channel.** Every distinction
carried by colour must also be carried by a label, a shape, or a position. This
is the rule that makes the figure work in greyscale, under every form of colour
vision deficiency, and when photocopied. Around 8% of men and 0.5% of women of
Northern European ancestry have red-green colour vision deficiency, so a
hue-only distinction is illegible to a substantial slice of any readership.

**Composition — one reading path.** Horizontal for a sequence, vertical for a
hierarchy or a gradient, cyclic for a loop that genuinely returns to its start,
forking for a decision or a divergence. Pick one and let the eye run it once,
left to right or top to bottom. Two competing paths in one frame is the second
most common structural error.

**Opacity — push context back.** Cells, organs, vessels and environments are
scaffolding, not content. Draw them at 30–40% opacity in a single neutral so
the central interaction is unambiguously dominant. If everything is at full
strength, nothing is emphasized.

**Restraint — variation must carry meaning.** At most four font sizes, three
stroke widths, and two arrowhead styles in the whole figure. Every distinct
value must correspond to a distinct meaning. A second arrowhead style that
means nothing costs the reader a moment of wondering what it means.

**Negative space — a clean background.** No gradient, no texture, no drop
shadow, no decorative border. White or transparent. Space around a group is how
the reader knows it is a group.

### Step 5 — Audit before returning

Not optional and not advisory. Write out both tools from
`references/accessibility-audit.md`, then run them:

```bash
python3 svg_lint.py figure.svg
python3 palette_audit.py '#ffffff' '#111111' '#1b4965' '#ca6702'
```

`svg_lint.py` checks the structure — viewBox present, no embedded raster, text
still live rather than outlined, a `<title>` for screen readers, and the
restraint caps from Step 4. It prints every hex colour it finds, which is the
input to the second command.

`palette_audit.py` checks the colours — WCAG 2.2 contrast against the
background, pairwise greyscale separation, and what each pair becomes under
protanopia and deuteranopia.

Both exit non-zero on failure. **Fix and re-run until both pass.** Do not
report a figure as finished while either is failing; report the failure instead.

Then check by eye what no tool can:

- Does the reading path run once, in the intended order?
- Would a reader outside the subfield get the claim in ten seconds?
- Are gene names italic and protein names roman, consistently?
- Are units, scale bars, and every abbreviation defined in the figure?
- Is every arrow supported by the source?

### Step 6 — Return with the accountability line

Deliver four things:

1. The SVG.
2. The design rationale — figure type, audience, palette roles, what was cut
   and why.
3. The audit output, pasted, both tools passing.
4. This line, verbatim, plus the declaration below if the journal requires one:

> Scientific accuracy is the author's responsibility. Every entity, arrow and
> label in this figure must be checked against the underlying results before
> submission.

`references/journal-policy.md` carries a declaration template to adapt.

---

## Mode: critique

Score an existing figure without redrawing it. If it is an SVG, run both tools
first — that settles structure and palette mechanically. Then judge what the
tools cannot, and report findings ordered by severity:

1. **Scientific accuracy** — is any drawn step unsupported by the source? Is
   any correlation drawn as causation? Any invented quantity? These are
   blocking; everything else is cosmetic beside them.
2. **Claim clarity** — is there one claim, and does the figure make it?
3. **Type and reading path** — right figure type, single unambiguous path?
4. **Accessibility** — contrast, greyscale separation, colour vision
   deficiency, redundant encoding.
5. **Restraint and clutter** — font sizes, stroke widths, arrowheads, opacity.
6. **Labelling** — gene and protein formatting, units, scale bars,
   abbreviations.

For each finding give the specific element, why it fails, and the concrete fix.
"Improve the contrast" is not a finding; "`#5b8e7d` against `#bc4b51` is 1.32:1
in greyscale, so the two arms are indistinguishable when printed — drop the
green to `#1b4965` for 1.95:1" is.

If the figure is a raster, say so first: the accessibility checks can still be
described but not run, and any correction means regenerating the figure.

## Reference files

- `references/figure-types.md` — the six types, their compositions, and the
  characteristic failure of each
- `references/accessibility-audit.md` — both audit tools, the standards they
  implement, and worked examples including the failure cases
- `references/journal-policy.md` — how to check a publisher's AI-imagery
  policy, and a declaration template
