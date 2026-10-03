---
name: dna-chisel
description: Turn a designed protein into orderable DNA with DNA Chisel — codon-optimize for a host, hold GC inside a window, strip Golden Gate and other restriction sites from both strands, avoid repeats and hairpins, export an annotated GenBank of the edits.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [dna, codon-optimization, sequence-design, synthetic-biology, golden-gate]
datasets: [https://www.ebi.ac.uk/ena/browser/api/embl/M62653.1]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-02
  against: dnachisel 3.2.16 / python_codon_tables 0.1.18 / biopython 1.88 / numpy 2.4.6 / Python 3.11.15 on Linux
  executed: 11
  unverified: 0
---

# Designing a coding sequence with DNA Chisel

A protein design is not an order. Between the two sits a sequence that has to satisfy
a dozen unrelated requirements at once — the host's codon preferences, the synthesis
vendor's GC and repeat limits, the assembly method's forbidden restriction sites, and
whatever else the downstream vector demands. Hand-editing codons until all of them hold
is where errors enter, because fixing a GC window reintroduces a site you removed two
edits ago.

DNA Chisel inverts that. You **declare** what must be true and what you would prefer,
and a constraint solver finds a sequence inside the intersection. The declaration is
the useful artefact: it is reviewable, it is diffable, and it is what you re-run when
the vendor changes a rule.

**Nothing here needs an account, an API key, or a GPU.** DNA Chisel is MIT-licensed,
installs from the package index, and runs on CPU in seconds for a gene-sized sequence.
The one optional network call is noted where it appears.

## Constraints and objectives are different things

This distinction decides whether the run succeeds, and it is the first thing to get
right.

- A **constraint** is a hard requirement. The solver must satisfy every one of them or
  it raises. Translation must be preserved; the BsaI site must be gone; GC must stay
  between 0.35 and 0.65 in every 50 bp window.
- An **objective** is a preference, scored and maximized within whatever room the
  constraints leave. Codon optimization belongs here, almost always. Make it a
  constraint and you are asserting that a particular codon in a particular position is
  non-negotiable, which it is not.

The two run in order, and both calls are needed:

```python
problem.resolve_constraints()   # find any sequence satisfying the hard requirements
problem.optimize()              # improve the objectives without breaking them
```

Calling `optimize()` alone on a sequence that violates a constraint optimizes a sequence
that was never valid. Calling `resolve_constraints()` alone gives a legal sequence with
no codon optimization at all.

## Install

```bash
pip install dnachisel biopython
```

`python_codon_tables` and `numpy` come with it. Everything below was executed against
dnachisel 3.2.16.

## From protein to DNA

`reverse_translate` gives you a starting sequence. By default it picks one fixed codon
per amino acid, which produces a low-complexity sequence with long repeats — fine as a
solver starting point, bad as a final answer. Pass `randomize_codons=True` for a more
realistic start, then let the constraints do the work.

```python
from Bio.Seq import Seq
import dnachisel as dc

protein = "MKVLATGIVALQDLEYRFKAWCNHPSTM"

naive = dc.reverse_translate(protein)
varied = dc.reverse_translate(protein, randomize_codons=True)

for label, seq in [("one-codon-per-aa", naive), ("randomized", varied)]:
    print(label, len(seq), "bp  GC %.3f" % dc.biotools.gc_content(seq))
    print("   ", seq)
    print("    round-trips:", str(Seq(seq).translate()) == protein)
```

Neither output is a design. It is the input to one.

## Audit the sequence before you optimize it

Run the checks before you change anything, so you know what the solver is actually
fixing. The sequence here is the native *Aequorea victoria* GFP coding sequence, pulled
from its ENA record.

```python
import re, urllib.request
from Bio import SeqIO
import dnachisel as dc

urllib.request.urlretrieve(
    "https://www.ebi.ac.uk/ena/browser/api/embl/M62653.1", "gfp.embl")
record = SeqIO.read("gfp.embl", "embl")
cds = str(next(f for f in record.features if f.type == "CDS").extract(record.seq)).upper()

print("CDS", len(cds), "bp  overall GC %.3f" % dc.biotools.gc_content(cds))

# Restriction sites, counted on BOTH strands -- this is the part done wrong by hand.
for enzyme in ["BsaI", "BsmBI", "EcoRI"]:
    site = str(dc.EnzymeSitePattern(enzyme)).split("(")[1].rstrip(")")
    fwd = [m.start() for m in re.finditer(site, cds)]
    rev = [m.start() for m in re.finditer(dc.reverse_complement(site), cds)]
    print(f"{enzyme} ({site})  plus strand {fwd}  minus strand {rev}")

# Local GC, which is what a synthesis vendor actually rejects on.
windows = [dc.biotools.gc_content(cds[i:i + 50]) for i in range(0, len(cds) - 50, 10)]
print("50 bp GC window range %.3f - %.3f" % (min(windows), max(windows)))
```

Native avGFP is the right teaching case because its problems are invisible to a forward
reading. It carries no `GGTCTC` anywhere — and it is still unusable for Golden Gate with
BsaI, because `GAGACC` sits at position 643. **Restriction sites are palindrome-free and
strand-agnostic; a grep for the site as written finds half of them.** `AvoidPattern`
scans both strands by default, which is the whole reason to use it.

## The design run

```python
import urllib.request
from Bio import SeqIO
from Bio.Seq import Seq
import numpy
import dnachisel as dc

urllib.request.urlretrieve(
    "https://www.ebi.ac.uk/ena/browser/api/embl/M62653.1", "gfp.embl")
record = SeqIO.read("gfp.embl", "embl")
cds = str(next(f for f in record.features if f.type == "CDS").extract(record.seq)).upper()
numpy.random.seed(0)

problem = dc.DnaOptimizationProblem(
    sequence=cds,
    constraints=[
        dc.EnforceTranslation(location=(0, len(cds), 1)),   # the protein is fixed
        dc.EnforceGCContent(mini=0.35, maxi=0.65, window=50),
        dc.AvoidPattern("BsaI_site"),                        # Golden Gate
        dc.AvoidPattern("BsmBI_site"),
        dc.AvoidPattern("9xA"),                              # homopolymer run
        dc.UniquifyAllKmers(12),                             # no repeated 12-mers
    ],
    objectives=[
        dc.CodonOptimize(species="e_coli", method="use_best_codon",
                         location=(0, len(cds), 1)),
    ],
    logger=None,
)

print(problem.constraints_text_summary())      # what is wrong with the input
problem.resolve_constraints()
problem.optimize()
print(problem.constraints_text_summary())      # what the solver fixed
print(problem.objectives_text_summary())

designed = problem.sequence
print("edits:", sum(1 for a, b in zip(cds, designed) if a != b), "of", len(cds))
print("final GC %.3f" % dc.biotools.gc_content(designed))
print("protein unchanged:", str(Seq(designed).translate()) == str(Seq(cds).translate()))
```

Two details in that block carry weight.

**`location=(0, len(cds), 1)` is not optional for `EnforceTranslation`.** The third
element is the strand, and the span tells the solver where the reading frame starts.
Give it the wrong span and it will faithfully preserve the translation of the wrong
frame.

**`CodonOptimize` always pairs with `EnforceTranslation` over the same location.** On
its own it is free to change amino acids, because nothing told it not to.

## Choosing a codon-optimization method

Three are available, and they answer different questions. All three were run against
the same avGFP CDS with the same constraints and `numpy.random.seed(0)`.

```python
import urllib.request
from Bio import SeqIO
from Bio.Seq import Seq
import numpy
import dnachisel as dc

urllib.request.urlretrieve(
    "https://www.ebi.ac.uk/ena/browser/api/embl/M62653.1", "gfp.embl")
record = SeqIO.read("gfp.embl", "embl")
cds = str(next(f for f in record.features if f.type == "CDS").extract(record.seq)).upper()

def run(**codon_kwargs):
    numpy.random.seed(0)
    problem = dc.DnaOptimizationProblem(
        sequence=cds,
        constraints=[dc.EnforceTranslation(location=(0, len(cds), 1)),
                     dc.EnforceGCContent(mini=0.35, maxi=0.65, window=50),
                     dc.AvoidPattern("BsaI_site"), dc.AvoidPattern("BsmBI_site")],
        objectives=[dc.CodonOptimize(location=(0, len(cds), 1), **codon_kwargs)],
        logger=None)
    problem.resolve_constraints()
    problem.optimize()
    assert str(Seq(problem.sequence).translate()) == str(Seq(cds).translate())
    return problem

for kwargs in [dict(species="e_coli", method="use_best_codon"),
               dict(species="e_coli", method="match_codon_usage"),
               dict(species="e_coli", original_species="h_sapiens",
                    method="harmonize_rca")]:
    p = run(**kwargs)
    print("%-18s edits=%3d  GC=%.3f" % (
        kwargs["method"],
        sum(1 for a, b in zip(cds, p.sequence) if a != b),
        dc.biotools.gc_content(p.sequence)))
```

- **`use_best_codon`** replaces every codon with the host's most frequent synonym.
  Watch the objectives summary and you will see it resolve to an objective reported as
  `MaximizeCAI`, which is what it is. It moves the most bases of the three and produces
  the most repetitive sequence, so it is the method that fights the repeat and GC
  constraints hardest — 166 edits here against 104 for the distribution-matching run.
- **`match_codon_usage`** reproduces the host's codon *distribution* rather than its
  argmax, so rare codons survive at roughly their natural frequency. Preferred when
  translational pausing matters — folding-sensitive proteins, membrane proteins.
- **`harmonize_rca`** maps each codon's usage in its *original* host onto a codon of
  comparable usage in the target, preserving the native rhythm. It requires both
  `species` and `original_species`; omitting the second raises
  `ValueError: Provide either an species name or a codon usage table`, which names the
  missing table rather than the missing argument.

Nine codon tables ship with the package and need no network — `e_coli`, `h_sapiens`,
`m_musculus`, `s_cerevisiae`, `b_subtilis`, `d_melanogaster`, `c_elegans`, `g_gallus`
and `m_musculus_domesticus`. **Passing a numeric TaxID instead downloads the table at
run time**, so a pipeline keyed on a TaxID fails on an offline host while the same
pipeline keyed on a name does not.

## The solver is stochastic — seed it

Repeated runs of the same problem give different sequences. Across three unseeded runs
of the design above the edit count moved between 160 and 164 and the final GC between
0.494 and 0.497, all of them valid. Nothing is wrong; the search starts from a random
point.

For a design you intend to order, synthesise, or put in a paper, seed numpy's global
generator before constructing the problem. Seeding it alone is sufficient — the
`random` module is not involved.

```python
import urllib.request
from Bio import SeqIO
import numpy
import dnachisel as dc

urllib.request.urlretrieve(
    "https://www.ebi.ac.uk/ena/browser/api/embl/M62653.1", "gfp.embl")
record = SeqIO.read("gfp.embl", "embl")
cds = str(next(f for f in record.features if f.type == "CDS").extract(record.seq)).upper()

def design(seed):
    numpy.random.seed(seed)
    problem = dc.DnaOptimizationProblem(
        sequence=cds,
        constraints=[dc.EnforceTranslation(location=(0, len(cds), 1)),
                     dc.EnforceGCContent(mini=0.35, maxi=0.65, window=50),
                     dc.AvoidPattern("BsaI_site"), dc.AvoidPattern("BsmBI_site"),
                     dc.AvoidPattern("9xA"), dc.UniquifyAllKmers(12)],
        objectives=[dc.CodonOptimize(species="e_coli", method="use_best_codon",
                                     location=(0, len(cds), 1))],
        logger=None)
    problem.resolve_constraints()
    problem.optimize()
    return problem.sequence

print("seed 0 twice identical:", design(0) == design(0))
print("seed 0 vs seed 1 differ:", design(0) != design(1))
```

Record the seed next to the sequence. A design nobody can regenerate cannot be audited.

## The trap — some constraints rewrite the sequence on construction

Most constraints are checked and then fixed by the solver. A few are enforced by
restricting the *mutation space* instead, and DNA Chisel applies that restriction when
the problem object is built. `AvoidRareCodons` is one of them.

```python
import urllib.request
from Bio import SeqIO
import numpy
import dnachisel as dc

urllib.request.urlretrieve(
    "https://www.ebi.ac.uk/ena/browser/api/embl/M62653.1", "gfp.embl")
record = SeqIO.read("gfp.embl", "embl")
cds = str(next(f for f in record.features if f.type == "CDS").extract(record.seq)).upper()

def build(extra):
    numpy.random.seed(0)
    return dc.DnaOptimizationProblem(
        sequence=cds,
        constraints=[dc.EnforceTranslation(location=(0, len(cds), 1)),
                     dc.AvoidPattern("BsaI_site")] + extra,
        logger=None)

plain = build([])
restricted = build([dc.AvoidRareCodons(0.1, species="e_coli")])

for label, problem in [("without AvoidRareCodons", plain),
                       ("with AvoidRareCodons", restricted)]:
    changed = sum(1 for a, b in zip(cds, problem.sequence) if a != b)
    print("%-24s untouched=%-5s codons already rewritten=%d  BsaI site at %d"
          % (label, problem.sequence == cds, changed, problem.sequence.find("GAGACC")))
```

The consequence is specific. `problem.constraints_text_summary()` called straight after
construction reports on the **already-adjusted** sequence, not on your input — in the
run above the minus-strand BsaI site has disappeared before any solver call, making the
"before" report look cleaner than the sequence you handed in. Audit the input sequence
itself, as in the section above, if you want to know what was wrong with it.

## When there is no solution

Over-constrain the problem and the solver raises rather than returning something
plausible. Read the message: it names the specification that failed and the span it
failed on.

```python
import numpy
import dnachisel as dc

numpy.random.seed(0)
# Tryptophan has exactly one codon (TGG), so a low-GC ceiling here is unsatisfiable.
sequence = dc.reverse_translate("MWWWWWWWWWWK")

try:
    problem = dc.DnaOptimizationProblem(
        sequence=sequence,
        constraints=[dc.EnforceTranslation(location=(0, len(sequence), 1)),
                     dc.EnforceGCContent(mini=0.0, maxi=0.30, window=15)],
        logger=None)
    problem.resolve_constraints()
    print("resolved -- not expected")
except dc.NoSolutionError as error:
    print(type(error).__name__)
    print(str(error).split("\n")[0])
```

The span in the message is where to look first. A failure localized to one short
segment is usually a genuine conflict — a run of single-codon residues, or two
constraints disagreeing over the same bases — and the fix is to relax one constraint
over that span rather than loosen it globally.

## Export what changed, not just the answer

A bare FASTA of the optimized sequence loses the reasoning. `to_record` writes a
GenBank in which every constraint, every objective and every edited stretch is a
feature, so the design opens in any sequence viewer with its own justification
attached. Adjacent edited bases merge into one feature, so the edit-segment count runs
below the number of changed bases.

```python
import urllib.request
from Bio import SeqIO
import numpy
import dnachisel as dc

urllib.request.urlretrieve(
    "https://www.ebi.ac.uk/ena/browser/api/embl/M62653.1", "gfp.embl")
record = SeqIO.read("gfp.embl", "embl")
cds = str(next(f for f in record.features if f.type == "CDS").extract(record.seq)).upper()

numpy.random.seed(0)
problem = dc.DnaOptimizationProblem(
    sequence=cds,
    constraints=[dc.EnforceTranslation(location=(0, len(cds), 1)),
                 dc.EnforceGCContent(mini=0.35, maxi=0.65, window=50),
                 dc.AvoidPattern("BsaI_site"), dc.AvoidPattern("BsmBI_site")],
    objectives=[dc.CodonOptimize(species="e_coli", method="use_best_codon",
                                 location=(0, len(cds), 1))],
    logger=None)
problem.resolve_constraints()
problem.optimize()

annotated = problem.to_record(with_sequence_edits=True)
annotated.id = "avGFP_ecoli_seed0"
annotated.annotations["molecule_type"] = "DNA"
SeqIO.write(annotated, "avGFP_ecoli.gb", "genbank")

roles = [f.qualifiers.get("role", ["edit"])[0] for f in annotated.features]
print("features written:", len(annotated.features))
print("constraints:", roles.count("c"), " objectives:", roles.count("o"),
      " edit segments:", roles.count("edit"))
```

Keep that GenBank, the seed, and the constraint list together. They are the three
things a reviewer needs to reproduce the design, and the sequence alone is none of them.

## What this does not do

- **It does not simulate the assembly.** Removing BsaI sites makes a fragment
  Golden-Gate-compatible; it does not design the overhangs or check the junctions.
- **It does not check synthesis complexity against a specific vendor.** The constraints
  here approximate the common rules; vendors run their own screens and the authoritative
  answer is their quote.
- **It does not predict expression.** Codon adaptation correlates with yield and does
  not determine it.
- **It does not do biosecurity screening.** Sequences of concern are screened by the
  synthesis provider, and that step is separate from and not replaced by anything here.

The Edinburgh Genome Foundry also hosts a browser interface to these methods. It still
runs, but its codebase has been untouched since 2022 — reasonable for a one-off check,
not something to build a pipeline against.

## Try it

**Data.** The native *Aequorea victoria* green fluorescent protein mRNA, ENA accession
**M62653.1**, fetched from the ENA Browser API. INSDC records are free to use without
an account or a token; confirmed reachable 2 Oct 2026. The coding sequence is extracted
from the record's own `CDS` feature rather than assumed, so the example survives the
record's untranslated regions.

The example is routed through the trap deliberately: this CDS has **no `GGTCTC`
anywhere** and still contains a BsaI site, on the minus strand at position 643. A check
that greps the site as written passes it.

**Run.** Self-contained, from an empty directory:

```bash
pip install dnachisel biopython
```

```python
import re, urllib.request
from Bio import SeqIO
from Bio.Seq import Seq
import numpy
import dnachisel as dc

urllib.request.urlretrieve(
    "https://www.ebi.ac.uk/ena/browser/api/embl/M62653.1", "gfp.embl")
record = SeqIO.read("gfp.embl", "embl")
cds = str(next(f for f in record.features if f.type == "CDS").extract(record.seq)).upper()
protein = str(Seq(cds).translate())

print("CDS %d bp, protein %d aa, GC %.3f"
      % (len(cds), len(protein) - 1, dc.biotools.gc_content(cds)))
print("GGTCTC in input:", cds.find("GGTCTC"), "| GAGACC in input:", cds.find("GAGACC"))

numpy.random.seed(0)
problem = dc.DnaOptimizationProblem(
    sequence=cds,
    constraints=[dc.EnforceTranslation(location=(0, len(cds), 1)),
                 dc.EnforceGCContent(mini=0.35, maxi=0.65, window=50),
                 dc.AvoidPattern("BsaI_site"), dc.AvoidPattern("BsmBI_site"),
                 dc.AvoidPattern("9xA"), dc.UniquifyAllKmers(12)],
    objectives=[dc.CodonOptimize(species="e_coli", method="use_best_codon",
                                 location=(0, len(cds), 1))],
    logger=None)
problem.resolve_constraints()
problem.optimize()
designed = problem.sequence

# Invariants.
assert str(Seq(designed).translate()) == protein, "protein changed"
assert len(designed) == len(cds)
for site in ["GGTCTC", "CGTCTC"]:
    assert site not in designed and dc.reverse_complement(site) not in designed, site
assert "A" * 9 not in designed
windows = [dc.biotools.gc_content(designed[i:i + 50])
           for i in range(0, len(designed) - 50 + 1)]
assert 0.35 <= min(windows) and max(windows) <= 0.65, (min(windows), max(windows))
assert len(re.findall("GAGACC", cds)) == 1, "input should carry one minus-strand BsaI site"

# Observed values -- drift to investigate, not failure.
print("edits: %d" % sum(1 for a, b in zip(cds, designed) if a != b))
print("final GC: %.4f" % dc.biotools.gc_content(designed))
print("GC window range: %.3f - %.3f" % (min(windows), max(windows)))
print("objective score: %.2f" % problem.objective_scores_sum())
print("designed tail:", designed[-24:])
print("OK")
```

**Expect.**

Invariants — a failure here means the skill is wrong, not that upstream moved:

- The translation is byte-identical before and after, and the length is unchanged.
  Codon optimization that alters the protein is the one unrecoverable failure, which is
  why it is asserted rather than printed.
- Neither `GGTCTC`/`GAGACC` (BsaI) nor `CGTCTC`/`GAGACG` (BsmBI) appears in the output
  on either strand, and no run of nine adenines survives.
- Every 50 bp window of the output has GC between 0.35 and 0.65 inclusive.
- The **input** contains exactly one `GAGACC` and zero `GGTCTC`. If that stops holding,
  ENA's M62653.1 has changed and the minus-strand lesson needs a new example rather
  than a looser assertion.

Observed on 2 Oct 2026 with dnachisel 3.2.16, python_codon_tables 0.1.18, biopython
1.88, numpy 2.4.6, Python 3.11.15, `numpy.random.seed(0)`:

- `CDS 717 bp, protein 238 aa, GC 0.385`
- `GGTCTC in input: -1 | GAGACC in input: 643`
- `edits: 166`, `final GC: 0.4993`, `GC window range: 0.360 - 0.640`
- `objective score: -14.64`
- `designed tail: GGCATGGATGAACTGTATAAATAA`

The edit count, the score and the tail are seed-dependent and version-dependent. With
the seed removed they move by a few edits per run (160–166 observed); a change in them
under seed 0 after a dnachisel release is drift to note, not a break.
