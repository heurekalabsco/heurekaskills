# Figure types

Six types cover nearly every graphical abstract. Classify before composing —
the type determines the layout, and the most common structural error is drawing
one type in another's shape.

Each entry gives what it asserts, its canonical composition, and its
characteristic failure.

---

## Mechanism

**Asserts:** a causal chain of molecular or cellular events.

**Composition:** horizontal, left to right, one row. Entities are nodes;
arrows carry direction. The perturbation enters from above or from the left,
never from the middle. Keep the chain to three to five steps — a mechanism with
nine nodes is a pathway diagram and belongs in a supplementary figure.

**Reading path:** upstream to downstream, strictly left to right.

**Characteristic failure:** drawing every known interaction rather than the one
the results establish. If the paper shows A reduces C and does not test B, the
figure has two nodes and one arrow, not three nodes and two arrows. This is the
type where invented mechanism does the most damage, because a mechanism figure
is read as a claim about causality.

---

## Process

**Asserts:** a biological sequence that unfolds over time or space, without a
single manipulated cause.

**Composition:** horizontal for a linear sequence, cyclic only when the process
genuinely returns to its starting state — a cell cycle is cyclic, a
differentiation trajectory is not. For a cycle, place the entry point at the
upper left and run clockwise.

**Reading path:** the direction of the process itself.

**Characteristic failure:** drawing a linear process as a cycle because a
circle fills the frame more attractively. This asserts a return that does not
happen.

---

## Experimental setup

**Asserts:** what was physically done — the system, the intervention, the
measurement.

**Composition:** vertical or horizontal in three bands — the model system, the
treatment or perturbation, the readout. Show the actual model at the level the
audience needs: organism, tissue, culture, or construct. Sample sizes and
timing belong here if they are a design feature rather than a result.

**Reading path:** input to output.

**Characteristic failure:** decorative labware. A drawing of a pipette, a plate
or a mouse that adds no information consumes the space and the reader's
attention that the readout needed.

---

## Workflow

**Asserts:** a procedure a reader could follow — computational pipeline,
protocol, decision procedure.

**Composition:** vertical, top to bottom, with one branch point at most.
Distinguish data from operations by shape, consistently, and say which is which
in a legend. If there are branches, label each edge with its condition.

**Reading path:** top to bottom, following the arrows.

**Characteristic failure:** unlabelled branches. A fork whose two edges carry
no condition leaves the reader unable to tell what determines which path is
taken, which defeats the point of drawing a procedure.

---

## Comparison

**Asserts:** two or more conditions differ in a specific, stated way.

**Composition:** side-by-side panels of **identical** construction — same
layout, same scale, same element positions. Only the compared property varies.
The contrast is the content, so anything else that differs between panels is
noise that reads as signal.

**Reading path:** panel to panel, with the eye moving between the elements that
differ.

**Characteristic failure:** panels that differ in more than the compared
property — a control drawn smaller, or arranged differently, or with a label the
treatment panel lacks. Every incidental difference is read as a finding. Use
identical templates and change exactly one thing.

---

## Timeline

**Asserts:** ordering and interval — what happened when, and how far apart.

**Composition:** horizontal axis, events as marks above it, intervals labelled.
The axis must be honest: if the spacing is not proportional to elapsed time,
break the axis visibly rather than silently compressing it.

**Reading path:** left to right along the axis.

**Characteristic failure:** a non-proportional axis presented as proportional.
A gap drawn the same width as a one-hour interval but representing six months
misstates the experiment.

---

## Choosing between types

When two types seem to fit, ask what the reader is meant to take away:

| The reader should leave knowing | Type |
|---|---|
| What causes what | Mechanism |
| What happens, in order | Process |
| What was done | Experimental setup |
| How to do it | Workflow |
| That these two differ | Comparison |
| When things happened | Timeline |

A paper often supports several. The figure gets one — the one that carries the
claim fixed in Step 1. If the claim is "the knockout blocks oxidation and
supplementation rescues it", that is a comparison of three conditions, not a
mechanism, even though a mechanism exists in the background.

## Combining types

Combine only when one type is clearly subordinate — a comparison whose panels
each contain the same short mechanism is legitimate, because the mechanism is
the repeated template and the comparison is the claim. Two co-equal types in
one frame produce two reading paths, and the reader follows neither.
