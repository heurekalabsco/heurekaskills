---
name: graphical-abstract
description: Turn a paper or results summary into an accurate, accessible graphical abstract as editable SVG — choose the figure type, compose it, then audit palette contrast, greyscale separation and colour-vision safety before submission.
category: communication
license: CC-BY-4.0
author: Heureka Labs
version: 1.1.0
tags: [graphical-abstract, figures, accessibility, svg, publishing]
datasets: []
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-18
  against: Python 3.11.15, standard library only
  executed: 7
  unverified: 0
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
restraint caps from Step 4. It prints every hex colour it finds, which is where
the second command's arguments come from — but **select them, do not paste the
list**. Pass the background once, as the first argument, then only the
meaning-bearing colours. The background repeated scores 1.00:1 against itself
and the scaffolding neutral is faint by design, so handing over the raw list
fails a figure that is correct. `references/accessibility-audit.md` works this
through, and `## Try it` below runs both selections so you can see the
difference.

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

## Try it

A self-contained check that this skill's own numbers still hold. No account, no key,
no network, and nothing to install — both tools are pure standard library.

**Data** — generated inline, and the frontmatter says so with `datasets: []` rather
than naming a source. There is nothing to fetch: the input to this skill is a figure
the author is drafting, and the audit is arithmetic over colour values plus a structural
read of the XML. The block writes a miniature graphical abstract built to Step 4 — three
meaning-bearing colours in fixed roles, context pushed back in a neutral, every colour
distinction also carried by a label — and audits that.

**Prerequisite** — write both tools from `references/accessibility-audit.md` into the
working directory as `svg_lint.py` and `palette_audit.py`. Step 5 of the create mode
does this anyway; the block below does the rest.

**Run**

```python
import subprocess, sys, textwrap

FIGURE = textwrap.dedent('''\
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120">
      <title>CPT1A loss blocks fatty acid oxidation; medium-chain supplementation restores it</title>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#111111"/>
        </marker>
      </defs>
      <rect x="12" y="24" width="336" height="72" rx="8" fill="#d9d9d9" opacity="0.35"/>
      <text x="180" y="18" font-size="13" text-anchor="middle" fill="#111111">Hepatocyte fatty acid oxidation</text>
      <circle cx="60" cy="60" r="18" fill="#1b4965"/>
      <text x="60" y="96" font-size="10" text-anchor="middle" fill="#111111">Control</text>
      <circle cx="180" cy="60" r="18" fill="#ca6702"/>
      <text x="180" y="96" font-size="10" text-anchor="middle" fill="#111111">CPT1A KO</text>
      <circle cx="300" cy="60" r="18" fill="#1b4965"/>
      <text x="300" y="96" font-size="10" text-anchor="middle" fill="#111111">KO + MCT</text>
      <path d="M 84 60 L 156 60" stroke="#111111" stroke-width="2" marker-end="url(#arrow)"/>
      <path d="M 204 60 L 276 60" stroke="#111111" stroke-width="2" marker-end="url(#arrow)"/>
      <text x="120" y="52" font-size="10" text-anchor="middle" fill="#111111">FAO down</text>
      <text x="240" y="52" font-size="10" text-anchor="middle" fill="#111111">FAO restored</text>
    </svg>
    ''')
open("figure.svg", "w").write(FIGURE)

def run(*cmd):
    p = subprocess.run([sys.executable, *cmd], capture_output=True, text=True)
    return p.returncode, p.stdout

def ratio(out, needle):
    """The 'a.bc:1' on the first ratio-bearing output line mentioning `needle`."""
    for line in out.splitlines():
        if needle in line and ":1" in line:
            return float(line.split(":1")[0].split()[-1])
    raise AssertionError(f"no ratio line matching {needle!r}")

BG, INK, BASE, PERT, CONTEXT = "#ffffff", "#111111", "#1b4965", "#ca6702", "#d9d9d9"

# 1. Structure -- editable, scalable, and announced to a screen reader.
code, out = run("svg_lint.py", "figure.svg")
print("1. svg_lint on a figure built to Step 4")
print("   " + "\n   ".join(out.strip().splitlines()))
assert code == 0, "a compliant figure must lint clean"

# 2. The palette, meaning-bearing colours only: background first, then the three roles.
code, out = run("palette_audit.py", BG, INK, BASE, PERT)
pairs = [float(l.split(":1")[0].split()[-1])
         for l in out.splitlines() if ":1" in l and ("/" in l or "->" in l)]
print("\n2. palette_audit on the three roles")
print(f"   ink vs white                              {ratio(out, INK + '  '):5.2f}:1")
print(f"   baseline vs white                         {ratio(out, BASE + '  '):5.2f}:1")
print(f"   perturbation vs white                     {ratio(out, PERT + '  '):5.2f}:1")
print(f"   worst pair, greyscale and both simulations {min(pairs):5.2f}:1")
assert code == 0, "the documented default palette must pass its own audit"
assert abs(ratio(out, INK + "  ") - 18.88) < 0.01
assert abs(ratio(out, BASE + "  ") - 9.60) < 0.01
assert abs(ratio(out, PERT + "  ") - 3.85) < 0.01
assert abs(min(pairs) - 1.90) < 0.01, "Step 4 claims at least 1.90:1 between every pair"

# 3. The trap. svg_lint prints every hex it finds, including the background and the
#    exempt scaffolding neutral. Pasting that list straight through fails by
#    construction -- on a figure that is correct.
code, out = run("palette_audit.py", BG, INK, BASE, PERT, CONTEXT, BG)
print("\n3. the same figure, audited with svg_lint's raw colour list")
print(f"   context {CONTEXT} vs white                 {ratio(out, CONTEXT + '  '):5.2f}:1   (exempt by Step 4)")
print(f"   background against itself                 {ratio(out, '  ' + BG + '  '):5.2f}:1")
print(f"   exit {code} -- select the meaning-bearing colours, do not paste the list")
assert code == 1, "the raw list must be shown failing, or nobody learns to filter it"

# 4. The gate bites: the default categorical red/green of most plotting libraries.
code, out = run("palette_audit.py", BG, "#d62728", "#2ca02c")
grey, deut = ratio(out, "#d62728 / #2ca02c"), ratio(out, "#d62728->#7f7f13")
print("\n4. the red-green pair every plotting library hands you")
print(f"   greyscale separation                      {grey:5.2f}:1")
print(f"   after deuteranopia                        {deut:5.2f}:1   (one colour, not two)")
assert code == 1 and grey < 1.5 and deut < 1.2

# 5. Invariants of the simulation itself. Both break if the matrix is applied to
#    gamma-encoded values by mistake.
sys.path.insert(0, ".")
import palette_audit as pa
print("\n5. invariants")
for kind in ("protanopia", "deuteranopia"):
    w, k = pa.simulate("#ffffff", kind), pa.simulate("#000000", kind)
    print(f"   {kind:13s} white -> {w}   black -> {k}")
    assert (w, k) == ("#ffffff", "#000000")
print(f"   contrast(#ffffff, #000000) = {pa.contrast('#ffffff', '#000000'):.2f}:1")
print(f"   3:1 on white caps relative luminance at L = {1.05 / 3 - 0.05:.2f}")
assert round(pa.contrast("#ffffff", "#000000"), 2) == 21.00
assert abs((1.05 / 3 - 0.05) - 0.30) < 1e-12

print("\nall checks passed")
```

**Expect**

Everything here is an **invariant**, not an observed value. Both tools are pure standard
library over constants written into this skill, so there is no upstream version to drift
and no dated figure to re-stamp — a mismatch means the tool or the palette was changed,
which is exactly what the section is for.

```text
1. svg_lint on a figure built to Step 4
   note  17 elements, 6 text nodes, 2 font size(s), 1 stroke width(s)
   note  colours: #111111 #1b4965 #ca6702 #d9d9d9
   note  -> audit the MEANING-BEARING ones: palette_audit.py BACKGROUND COLOUR [COLOUR ...]
   note     omit the background itself and any de-emphasized scaffolding neutral

   PASS

2. palette_audit on the three roles
   ink vs white                              18.88:1
   baseline vs white                          9.60:1
   perturbation vs white                      3.85:1
   worst pair, greyscale and both simulations  1.90:1

3. the same figure, audited with svg_lint's raw colour list
   context #d9d9d9 vs white                  1.41:1   (exempt by Step 4)
   background against itself                  1.00:1
   exit 1 -- select the meaning-bearing colours, do not paste the list

4. the red-green pair every plotting library hands you
   greyscale separation                       1.48:1
   after deuteranopia                         1.16:1   (one colour, not two)

5. invariants
   protanopia    white -> #ffffff   black -> #000000
   deuteranopia  white -> #ffffff   black -> #000000
   contrast(#ffffff, #000000) = 21.00:1
   3:1 on white caps relative luminance at L = 0.30

all checks passed
```

Check 3 is the one to read twice. The figure in check 2 and the figure in check 3 are the
same file — only the argument selection differs, and that alone moves the audit from PASS
to a failure. A figure is not wrong because the tool said so; the tool is only as good as
what you hand it.

## Reference files

- `references/figure-types.md` — the six types, their compositions, and the
  characteristic failure of each
- `references/accessibility-audit.md` — both audit tools, the standards they
  implement, and worked examples including the failure cases
- `references/journal-policy.md` — how to check a publisher's AI-imagery
  policy, and a declaration template
