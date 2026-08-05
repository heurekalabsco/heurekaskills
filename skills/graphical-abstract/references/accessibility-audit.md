# Accessibility audit

Two standard-library tools. No third-party packages, no network. Write each to
the working directory and run it.

## What they implement

**Contrast** follows WCAG 2.2. Relative luminance is
`0.2126 R + 0.7152 G + 0.0722 B` over sRGB channels linearized as
`c/12.92` when `c <= 0.03928` and `((c + 0.055)/1.055) ** 2.4` otherwise. The
ratio of two colours is `(L_lighter + 0.05) / (L_darker + 0.05)`, which runs
from 1:1 to 21:1.

Thresholds used, and where each comes from:

| Threshold | Applies to | Source |
|---|---|---|
| 4.5:1 | Normal text against its background | WCAG 2.2 SC 1.4.3 |
| 3.0:1 | Text at 18pt or larger, or 14pt bold or larger | WCAG 2.2 SC 1.4.3 |
| 3.0:1 | Meaningful shapes, strokes and fills against background | WCAG 2.2 SC 1.4.11 |
| 1.5:1 | Separation between two meaning-bearing colours | **Not a standard.** A working floor for this skill |

The 1.5:1 pairwise floor is a heuristic, stated as such in the tool output. The
standards-backed rule for categorical colour is WCAG 2.2 SC 1.4.1, which is
qualitative — colour must not be the only visual means of conveying
information. The numeric floor operationalizes it; redundant labelling
satisfies it.

**Colour vision deficiency** uses the dichromat simulation of Vienot, Brettel
and Mollon (1999), *Digital video colourmaps for checking the legibility of
displays by dichromats*, Color Research and Application 24(4). Their
single-plane simplification reduces the LMS pipeline to one 3x3 matrix per
deficiency, applied in **linear** sRGB and converted back afterwards. Two
correctness properties worth knowing, because they are easy to break by
applying the matrix to gamma-encoded values by mistake:

- Neutrals are fixed points. `#ffffff` simulates to `#ffffff`, `#000000` to
  `#000000`.
- Blue is largely preserved; red and green collapse toward a common
  yellow-olive.

Protanopia and deuteranopia are simulated. Tritanopia is omitted deliberately —
it is rare, and the blue-yellow axis it affects is the axis a red-green-safe
palette is already relying on, so simulating it invites a palette that is safe
for nobody in particular.

## palette_audit.py

Checks a background and a list of colours. Exits 0 on pass, 1 on findings,
2 on bad input.

```python
#!/usr/bin/env python3
"""Audit a figure palette for contrast, greyscale separation and dichromat safety.

Usage:  python3 palette_audit.py BACKGROUND COLOUR [COLOUR ...]
Example: python3 palette_audit.py '#ffffff' '#1b4965' '#bc4b51' '#5b8e7d'
Pure standard library. No network, no install.
"""
import itertools
import sys

# --- sRGB / WCAG 2.2 -------------------------------------------------------
def hex_to_rgb(h):
    s = h.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6 or any(c not in "0123456789abcdefABCDEF" for c in s):
        raise ValueError(f"not a hex colour: {h!r}")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))

def srgb_to_linear(c):
    c /= 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def luminance(h):
    r, g, b = (srgb_to_linear(c) for c in hex_to_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    lo, hi = sorted((la, lb))
    return (hi + 0.05) / (lo + 0.05)

# --- dichromat simulation --------------------------------------------------
# Vienot, Brettel & Mollon (1999), applied in linear sRGB.
CVD = {
    "protanopia":   ((0.11238, 0.88762, 0.0), (0.11238, 0.88762, 0.0), (0.00401, -0.00401, 1.0)),
    "deuteranopia": ((0.29275, 0.70725, 0.0), (0.29275, 0.70725, 0.0), (-0.02234, 0.02234, 1.0)),
}

def linear_to_srgb(c):
    c = max(0.0, min(1.0, c))
    v = c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
    return round(max(0.0, min(1.0, v)) * 255)

def simulate(h, kind):
    lin = [srgb_to_linear(c) for c in hex_to_rgb(h)]
    m = CVD[kind]
    return "#{:02x}{:02x}{:02x}".format(
        *(linear_to_srgb(sum(m[i][j] * lin[j] for j in range(3))) for i in range(3)))

# --- thresholds ------------------------------------------------------------
TEXT_MIN = 4.5      # WCAG 2.2 SC 1.4.3, normal text
LARGE_MIN = 3.0     # SC 1.4.3, text >=18pt or >=14pt bold
NONTEXT_MIN = 3.0   # SC 1.4.11, meaningful graphical objects
PAIR_MIN = 1.5      # this skill's heuristic for greyscale separability -- NOT a WCAG rule

def main(argv):
    if len(argv) < 3:
        print(__doc__.strip())
        return 2
    bg, palette = argv[1], argv[2:]
    try:
        for c in [bg, *palette]:
            hex_to_rgb(c)
    except ValueError as e:
        print(f"FAIL  {e}")
        return 2

    failures = 0
    print(f"background {bg}   luminance {luminance(bg):.4f}\n")

    print("-- vs background (SC 1.4.11 needs 3.0 for shapes, SC 1.4.3 needs 4.5 for body text)")
    for c in palette:
        r = contrast(c, bg)
        tag = "ok  " if r >= NONTEXT_MIN else "FAIL"
        text = "text ok" if r >= TEXT_MIN else ("large text only" if r >= LARGE_MIN else "not usable for text")
        if r < NONTEXT_MIN:
            failures += 1
        print(f"  {tag}  {c}  {r:5.2f}:1   {text}")

    print(f"\n-- pairwise greyscale separation (heuristic floor {PAIR_MIN}:1)")
    for a, b in itertools.combinations(palette, 2):
        r = contrast(a, b)
        tag = "ok  " if r >= PAIR_MIN else "WARN"
        if r < PAIR_MIN:
            failures += 1
        print(f"  {tag}  {a} / {b}  {r:5.2f}:1")

    print("\n-- dichromat simulation (does the pair survive without hue?)")
    for kind in ("protanopia", "deuteranopia"):
        print(f"  {kind}")
        for a, b in itertools.combinations(palette, 2):
            sa, sb = simulate(a, kind), simulate(b, kind)
            r = contrast(sa, sb)
            tag = "ok  " if r >= PAIR_MIN else "WARN"
            print(f"    {tag}  {a}->{sa}  {b}->{sb}   {r:5.2f}:1")

    print(f"\n{'PASS' if failures == 0 else f'{failures} problem(s)'}")
    return 0 if failures == 0 else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

## svg_lint.py

Checks structure, editability and restraint, and prints every hex colour it
finds so the output feeds straight into `palette_audit.py`. Exits 0 on pass,
1 on findings, 2 on bad input.

```python
#!/usr/bin/env python3
"""Lint a graphical abstract SVG for editability, restraint and accessibility.

Usage: python3 svg_lint.py figure.svg
Pure standard library. No network, no install.
"""
import re
import sys
import xml.etree.ElementTree as ET

SVG = "{http://www.w3.org/2000/svg}"
MIN_FONT = 9.0          # user units; below this is unreadable when scaled to column width
MAX_FONT_SIZES = 4      # heuristic: title, label, annotation, caption
MAX_STROKE_WIDTHS = 3   # heuristic: emphasis, normal, hairline

def tag(el):
    return el.tag.split("}")[-1]

def colours_in(el):
    out = set()
    for attr in ("fill", "stroke", "stop-color"):
        v = el.get(attr)
        if v and v.startswith("#"):
            out.add(v.lower())
    style = el.get("style") or ""
    for m in re.finditer(r"(?:fill|stroke|stop-color)\s*:\s*(#[0-9a-fA-F]{3,6})", style):
        out.add(m.group(1).lower())
    return out

def numeric(el, attr):
    v = el.get(attr)
    if v is None:
        style = el.get("style") or ""
        m = re.search(rf"{attr}\s*:\s*([0-9.]+)", style)
        v = m.group(1) if m else None
    if v is None:
        return None
    m = re.match(r"^([0-9.]+)", str(v).strip())
    return float(m.group(1)) if m else None

def main(argv):
    if len(argv) != 2:
        print(__doc__.strip())
        return 2
    try:
        tree = ET.parse(argv[1])
    except ET.ParseError as e:
        print(f"FAIL  not well-formed XML — {e}")
        return 1
    except OSError as e:
        print(f"FAIL  cannot read file — {e}")
        return 2

    root = tree.getroot()
    problems, notes = [], []

    if tag(root) != "svg":
        print(f"FAIL  root element is <{tag(root)}>, expected <svg>")
        return 1

    if not root.get("viewBox"):
        problems.append("no viewBox — the figure will not scale cleanly to a journal column")

    els = list(root.iter())
    rasters = [e for e in els if tag(e) == "image"]
    if rasters:
        problems.append(f"{len(rasters)} <image> element(s) — embedded raster cannot be corrected by the author")

    texts = [e for e in els if tag(e) == "text"]
    if not texts:
        problems.append("no <text> elements — labels appear to be outlined paths, so nothing is editable or selectable")

    if root.find(f"{SVG}title") is None and root.find("title") is None:
        problems.append("no <title> — screen readers announce nothing for this figure")

    sizes, small = set(), []
    for t in texts:
        s = numeric(t, "font-size")
        if s is None:
            continue
        sizes.add(s)
        if s < MIN_FONT:
            small.append((("".join(t.itertext()) or "").strip()[:24], s))
    if len(sizes) > MAX_FONT_SIZES:
        problems.append(f"{len(sizes)} distinct font sizes {sorted(sizes)} — variation should carry meaning; cap is {MAX_FONT_SIZES}")
    for label, s in small:
        problems.append(f"font-size {s} on {label!r} is below the {MIN_FONT} floor")

    widths = {w for w in (numeric(e, "stroke-width") for e in els) if w is not None}
    if len(widths) > MAX_STROKE_WIDTHS:
        problems.append(f"{len(widths)} distinct stroke widths {sorted(widths)} — cap is {MAX_STROKE_WIDTHS}")

    markers = {e.get(a) for e in els for a in ("marker-end", "marker-start") if e.get(a)}
    if len(markers) > 2:
        problems.append(f"{len(markers)} distinct arrowhead styles — each style should mean something different")

    palette = sorted({c for e in els for c in colours_in(e)})
    notes.append(f"{len(els)} elements, {len(texts)} text nodes, {len(sizes)} font size(s), {len(widths)} stroke width(s)")
    notes.append("colours: " + (" ".join(palette) if palette else "(none as hex)"))
    notes.append("-> feed those colours to palette_audit.py with the background colour")

    for n in notes:
        print(f"note  {n}")
    for p in problems:
        print(f"FAIL  {p}")
    print("\n" + ("PASS" if not problems else f"{len(problems)} problem(s)"))
    return 0 if not problems else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

## Worked examples

### A palette that passes

```bash
python3 palette_audit.py '#ffffff' '#111111' '#1b4965' '#ca6702'
```

Every pair clears the floor with room to spare — the worst case is 1.90:1,
between the ink and the blue after deuteranopia simulation:

```text
-- vs background (SC 1.4.11 needs 3.0 for shapes, SC 1.4.3 needs 4.5 for body text)
  ok    #111111  18.88:1   text ok
  ok    #1b4965   9.60:1   text ok
  ok    #ca6702   3.85:1   large text only

-- pairwise greyscale separation (heuristic floor 1.5:1)
  ok    #111111 / #1b4965   1.97:1
  ok    #111111 / #ca6702   4.90:1
  ok    #1b4965 / #ca6702   2.49:1

PASS
```

### The red-green pair, which does not

The default categorical red and green of most plotting libraries:

```bash
python3 palette_audit.py '#ffffff' '#d62728' '#2ca02c'
```

Both clear 3:1 against white individually, so each looks fine in isolation.
Against each other they are 1.48:1 in greyscale, and after deuteranopia
simulation both land on the same olive at 1.16:1:

```text
  WARN  #d62728 / #2ca02c   1.48:1
  deuteranopia
    WARN  #d62728->#7f7f13  #2ca02c->#8a8a32    1.16:1
```

For a substantial share of readers, and for anyone reading a greyscale print,
that figure has one colour where it claims two. This is the single most common
accessibility defect in published figures, and it is why the audit is a gate
rather than a suggestion.

### Structural failures

Running `svg_lint.py` on a figure built the way a generator would build it —
raster panel, outlined text, five font sizes — reports each defect separately:

```text
FAIL  no viewBox — the figure will not scale cleanly to a journal column
FAIL  1 <image> element(s) — embedded raster cannot be corrected by the author
FAIL  no <title> — screen readers announce nothing for this figure
FAIL  5 distinct font sizes [6.0, 8.0, 12.0, 16.0, 22.0] — variation should carry meaning; cap is 4
FAIL  font-size 8.0 on 'Note' is below the 9.0 floor
FAIL  font-size 6.0 on 'Fine print' is below the 9.0 floor
FAIL  5 distinct stroke widths [0.5, 1.0, 3.0, 7.0, 11.0] — cap is 3
FAIL  3 distinct arrowhead styles — each style should mean something different
```

## Choosing your own palette

Constraints interact, and the interaction is not obvious: requiring at least
3:1 against white caps a colour's relative luminance at 0.30, and requiring
1.5:1 between every pair forces the colours onto a luminance ladder whose rungs
are 1.5x apart in `L + 0.05`. From black those rungs fall at roughly
L = 0, 0.025, 0.063, 0.119, 0.203 — so four or five meaning-bearing colours are
geometrically possible, but they are pushed into a narrow band of dark, mostly
desaturated hues and stop looking like a categorical palette.

The practical consequence: **past three colours, add meaning with shape,
label or position rather than another hue.** That is a stronger figure anyway,
and it satisfies SC 1.4.1 directly rather than by proxy.

To search for your own triple, keep the roles fixed and vary the hues, checking
each candidate with `palette_audit.py` before committing to it.
