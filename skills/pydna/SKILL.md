---
name: pydna
description: Plan and verify a DNA cloning construct in Python with pydna — restriction digests, ligation, Gibson assembly, Golden Gate, PCR and homologous recombination — before it is ordered. Models real sticky ends and plasmid topology.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [cloning, dna-assembly, plasmid, restriction-enzymes, primer-design]
datasets: [https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=L09137.2&rettype=gb&retmode=text]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-03
  against: pydna 5.5.16 / biopython 1.88 / Python 3.11.15
  executed: 14
  unverified: 0
---
# pydna — simulating a cloning plan before you order it

pydna represents DNA as **double-stranded** molecules with real ends. A fragment knows
whether it is blunt or sticky, what its overhang is, and whether the molecule it belongs
to is linear or circular. That is the whole point of the library and the reason it catches
mistakes that a string-based plan cannot: two fragments either ligate or they do not, and
pydna will tell you which before anything is ordered.

Use it to answer one question — **is the construct I am about to order the construct I
designed?** It simulates digests, ligation, Gibson assembly, Golden Gate, PCR and
homologous recombination, and gives you a topology-aware checksum to compare the result
against your intent.

It is a simulator, not a designer. It will not pick your codons, screen a sequence for
synthesis complexity, or choose which enzyme to use. It tells you what happens if you do.

## What you need

pip, and nothing else — pure Python, CPU only, no account, no key, no licence to accept.
pydna is BSD-3-Clause; it pulls in Biopython and networkx.

```bash
python3 -m venv venv && . venv/bin/activate
pip install "pydna==5.5.16"

# the worked examples below use pUC19 (GenBank L09137.2), fetched once
curl -s -o puc19.gb "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=L09137.2&rettype=gb&retmode=text"
```

One requirement arrives later and only if you use it — `pydna.genbank.Genbank` downloads
records from NCBI and its constructor **requires your email address** as its first
argument, because NCBI asks callers to identify themselves. There is no key and no
account. The examples here avoid it by fetching the record directly, so nothing below
needs your email.

## The object model, in one block

`Dseq` is the sequence; `Dseqrecord` wraps it with a name, features and topology. Printing
a `Dseq` shows both strands, which is the fastest way to see what an end actually looks
like.

```python
from pydna.dseq import Dseq
from pydna.dseqrecord import Dseqrecord
from Bio.Restriction import BamHI

d = Dseq("GGATCCAAA")
print(repr(d))
print("watson:", d.watson, "| crick:", d.crick)

# crick is given 5'->3' on its own strand, so it is the reverse complement
assert d.crick == "TTTGGATCC"

rec = Dseqrecord("aaaGGATCCtttGGATCCggg")
left, middle, right = rec.cut(BamHI)
print(repr(left.seq))
print("five:", left.seq.five_prime_end(), "| three:", left.seq.three_prime_end())

# a BamHI end is a 4-nt 5' overhang, and pydna says so rather than making you count
assert left.seq.three_prime_end() == ("5'", "gatc")
assert left.seq.five_prime_end() == ("blunt", "")
```

The two strands are not a display detail. Everything below follows from the fact that
pydna is tracking both of them.

## Four things that will bite you

These are the failure modes worth knowing before you write a plan. Each one is quiet —
none of them raises.

### 1. A fragment's length counts its overhangs on both sides

`len()` is the length of the longest strand span, so a 4-nt overhang is counted by the
fragment on each side of the cut. Fragment lengths therefore **sum to more than the
molecule you cut**, and the excess is exactly the overhang you created.

```python
from pydna.dseqrecord import Dseqrecord
from Bio.Restriction import BamHI

linear = Dseqrecord("aaaGGATCCtttGGATCCggg")          # 21 bp, two BamHI sites
frags = linear.cut(BamHI)
print("input:", len(linear), "| fragments:", [len(f) for f in frags], "| sum:", sum(len(f) for f in frags))

# invariant: sum of fragment lengths = molecule + (cuts x overhang)
assert [len(f) for f in frags] == [8, 13, 8]
assert sum(len(f) for f in frags) == len(linear) + 2 * 4 == 29

# the arithmetic is bookkeeping, not lost DNA — religating restores the original exactly
religated = frags[0] + frags[1] + frags[2]
assert len(religated) == 21 and str(religated.seq) == str(linear.seq)

# the same molecule as a circle has one fewer fragment for the same two cuts
circle = Dseqrecord("aaaGGATCCtttGGATCCggg", circular=True)
cfrags = circle.cut(BamHI)
assert [len(f) for f in cfrags] == [13, 16]
assert sum(len(f) for f in cfrags) == len(circle) + 2 * 4 == 29
print("circular:", [len(f) for f in cfrags])
```

If you are reconciling a simulated digest against a gel, subtract the overhangs first or
every band will look slightly long.

### 2. Round-tripping through `str()` silently drops topology

A plasmid is circular. `str(record.seq)` is just letters, so rebuilding a `Dseqrecord`
from it gives you a **linear** molecule — and a linear molecule cut once falls into two
pieces where a circle gives one.

```python
from pydna.parsers import parse
from pydna.dseqrecord import Dseqrecord
from Bio.Restriction import EcoRI

puc = parse("puc19.gb")[0]
naive = Dseqrecord(str(puc.seq))            # topology discarded here

print("parsed:", puc.circular, "| rebuilt:", naive.circular)
assert puc.circular is True and naive.circular is False

# pUC19 has a single EcoRI site: one cut linearises a circle, but splits a linear molecule
assert len(EcoRI.search(puc.seq)) == 1
assert len(puc.cut(EcoRI)) == 1              # linearised, still one molecule
assert len(naive.cut(EcoRI)) == 2            # two fragments that were never real
print("circular cut ->", len(puc.cut(EcoRI)), "| linear cut ->", len(naive.cut(EcoRI)))
```

Pass `circular=True` when you construct one yourself, and prefer slicing or
`.looped()`/`.cut()` over rebuilding from a string.

### 3. Writing to GenBank flattens sticky ends

GenBank format has no way to express a single-stranded overhang. Writing a digested
fragment out and reading it back returns a **blunt** molecule, so a digest/ligation
pipeline that uses `.gb` files as its intermediate will fail or, worse, assemble something
different. Keep `Dseqrecord` objects in memory between the digest and the ligation.

```python
from pydna.parsers import parse
from Bio.Restriction import EcoRI

frag = parse("puc19.gb")[0].cut(EcoRI)[0]
print("before:", frag.seq.five_prime_end(), frag.seq.three_prime_end())
assert frag.seq.five_prime_end() == ("5'", "aatt")

frag.write("roundtrip.gb")
back = parse("roundtrip.gb")[0]
print("after :", back.seq.five_prime_end(), back.seq.three_prime_end())

# same length, no ends — the overhangs are gone and nothing said so
assert len(back) == len(frag) == 2690
assert back.seq.five_prime_end() == ("blunt", "")
assert frag.seq.five_prime_end() != back.seq.five_prime_end()
```

Note the 2690 for a 2686 bp plasmid — that is trap 1 again, the EcoRI overhang counted at
both ends of the linearised molecule.

### 4. An impossible assembly returns an empty list, it does not raise

This is the one that matters most to an agent. The assembly functions return a **list of
products**. A plan that cannot work returns `[]` and looks, from the outside, exactly like
a function that did nothing. Check the length; never index blindly.

```python
from pydna.parsers import parse
from pydna.dseqrecord import Dseqrecord
from pydna.assembly2 import ligation_assembly
from Bio.Restriction import EcoRI, BamHI, HindIII

puc = parse("puc19.gb")[0]
backbone, = [f for f in puc.cut(EcoRI, BamHI) if len(f) > 1000]
good = [f for f in Dseqrecord("ttttGAATTCatgAGCAAAGGTaaaGGATCCtttt").cut(EcoRI, BamHI) if 20 < len(f) < 60][0]
bad  = [f for f in Dseqrecord("ttttAAGCTTatgAGCAAAGGTaaaAAGCTTtttt").cut(HindIII) if 15 < len(f) < 60][0]

assert len(ligation_assembly([backbone, good], circular_only=True)) == 1
assert ligation_assembly([backbone, bad], circular_only=True) == []    # no exception
print("compatible ->", len(ligation_assembly([backbone, good], circular_only=True)),
      "| incompatible ->", len(ligation_assembly([backbone, bad], circular_only=True)))
```

Treat an empty list as the finding it is — *this construct cannot be built from these
parts* — and report it rather than continuing.

### And one import to get right

**`pydna.assembly` is deprecated** in favour of `pydna.assembly2`, which is where the
high-level helpers live. Most material written before the change imports the old module;
it still works and emits a `DeprecationWarning`, and it will be removed.

```python
import warnings
with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    import pydna.assembly                     # the old path
assert any(w.category is DeprecationWarning for w in caught)
print([str(w.message) for w in caught][:1])

from pydna.assembly2 import (                 # the current one
    gibson_assembly, golden_gate_assembly, ligation_assembly,
    restriction_ligation_assembly, pcr_assembly,
    homologous_recombination_integration,
)
print("assembly2 helpers imported")
```

## Restriction cloning, worked on a real plasmid

The ordinary case — open a vector with two enzymes, drop in an insert with matching ends,
confirm the product. pUC19's polylinker carries single `EcoRI`, `BamHI` and `HindIII`
sites, which is why it is still the textbook backbone.

```python
from pydna.parsers import parse
from pydna.dseqrecord import Dseqrecord
from pydna.assembly2 import ligation_assembly
from Bio.Restriction import EcoRI, BamHI

puc = parse("puc19.gb")[0]
for enz in (EcoRI, BamHI):
    assert len(enz.search(puc.seq)) == 1, f"{enz} is not unique in pUC19"

# open the vector; keep the large fragment, discard the ~17 bp polylinker stuffer
pieces = puc.cut(EcoRI, BamHI)
backbone, = [f for f in pieces if len(f) > 1000]
print("pieces:", sorted(len(f) for f in pieces), "-> backbone", len(backbone))

# an insert delivered with the same two ends, as a synthesised carrier would be
carrier = Dseqrecord("ttttGAATTCatgAGCAAAGGTGAAGAACTGTTTACCGGCGTGGTGCCGtaaGGATCCtttt")
insert, = [f for f in carrier.cut(EcoRI, BamHI) if 30 < len(f) < 80]
print("insert:", len(insert), "| ends", insert.seq.five_prime_end(), insert.seq.three_prime_end())

product, = ligation_assembly([backbone, insert], circular_only=True)
print("product:", len(product), "bp, circular:", product.circular)

# invariant: the two 4-nt overhangs are shared once each in the closed circle
assert product.circular is True
assert len(product) == len(backbone) + len(insert) - 2 * 4 == 2713
```

`circular_only=True` is worth making a habit. Without it you also get the linear
intermediates, and the circle — the only thing that transforms — is one entry among
several.

## Gibson assembly

Gibson joins fragments on shared terminal homology, so the product length is the sum of
the parts minus one copy of each homology arm. `limit` is the minimum overlap pydna will
accept; set it to the arm length you actually designed rather than leaving the default.

```python
from pydna.dseqrecord import Dseqrecord
from pydna.assembly2 import gibson_assembly

ARM_A, ARM_B, ARM_C = "GCTAGCTAATCGGATCCTTA", "TTCGAACCGGTTAAGCTTCA", "ACGTCCATGGAATTCGGTAC"
f1 = Dseqrecord(ARM_A + "AAAAGGGGCCCCTTTTAAAACCCC" + ARM_B, name="f1")
f2 = Dseqrecord(ARM_B + "GGGGTTTTAAAACCCCGGGGTTTT" + ARM_C, name="f2")
f3 = Dseqrecord(ARM_C + "CCCCAAAAGGGGTTTTCCCCAAAA" + ARM_A, name="f3")

circle, = gibson_assembly([f1, f2, f3], limit=20)
print("inputs:", [len(f) for f in (f1, f2, f3)], "-> circle", len(circle), circle.circular)

# invariant: each of the three junctions consumes one duplicate copy of a 20 bp arm
assert circle.circular is True
assert len(circle) == sum(len(f) for f in (f1, f2, f3)) - 3 * 20 == 132

# raising limit above the real arm length finds nothing — a quiet [] again
assert gibson_assembly([f1, f2, f3], limit=21) == []
print("limit=21 ->", gibson_assembly([f1, f2, f3], limit=21))
```

That last assertion is the useful diagnostic. If a Gibson plan returns `[]`, the first
thing to check is whether `limit` exceeds your shortest arm.

## Golden Gate

Type IIS enzymes cut outside their recognition site, so the site leaves with the
backbone and the overhang you designed is what remains. Pass the enzyme and let pydna
work out which junctions are compatible.

```python
from pydna.dseqrecord import Dseqrecord
from pydna.assembly2 import golden_gate_assembly
from Bio.Restriction import BsaI

# BsaI is GGTCTC(1/5) — one spacer nt, then the 4-nt overhang
def part(left_overhang, core, right_overhang):
    return "GGTCTCA" + left_overhang + core + right_overhang + "TGAGACC"

p1 = Dseqrecord(part("AATG", "AAAGGGCCCTTTAAAGGGCCCTTT", "TTCT"), name="p1")
p2 = Dseqrecord(part("TTCT", "GGGTTTCCCAAAGGGTTTCCCAAA", "GCAA"), name="p2")
p3 = Dseqrecord(part("GCAA", "CCCAAATTTGGGCCCAAATTTGGG", "AATG"), name="p3")

circle, = golden_gate_assembly([p1, p2, p3], [BsaI])
print("parts:", [len(p) for p in (p1, p2, p3)], "-> circle", len(circle), circle.circular)

# each 46 bp part contributes only its 4-nt overhang plus its 24 bp core
assert circle.circular is True
assert len(circle) == 3 * (4 + 24) == 84

# the overhangs are what close the circle — break one and the assembly disappears
p3_wrong = Dseqrecord(part("GCAA", "CCCAAATTTGGGCCCAAATTTGGG", "TTAG"), name="p3_wrong")
assert golden_gate_assembly([p1, p2, p3_wrong], [BsaI]) == []
print("mismatched overhang ->", golden_gate_assembly([p1, p2, p3_wrong], [BsaI]))
```

The `84 == 3 * (4 + 24)` identity is the check worth keeping: in a correct Golden Gate
product every part contributes its core plus exactly one overhang, and the recognition
sites are gone.

## Primers and PCR

`primer_design` picks primer lengths to hit a target melting temperature; `pcr` then
amplifies and hands back an `Amplicon` that can draw itself.

```python
from pydna.parsers import parse
from pydna.dseqrecord import Dseqrecord
from pydna.design import primer_design
from pydna.amplify import pcr
from pydna.tm import tm_default

region = Dseqrecord(str(parse("puc19.gb")[0].seq)[200:800])
amp = primer_design(region, target_tm=58.0)

fwd, rev = amp.forward_primer, amp.reverse_primer
print("fwd:", fwd.seq, "%.2f C" % tm_default(str(fwd.seq)))
print("rev:", rev.seq, "%.2f C" % tm_default(str(rev.seq)))
print(amp.figure())

assert len(amp) == 600
assert abs(tm_default(str(fwd.seq)) - 58.0) < 2.0
assert abs(tm_default(str(rev.seq)) - 58.0) < 2.0

# re-amplifying with those primers must reproduce the same product
again = pcr(fwd, rev, region)
assert str(again.seq) == str(amp.seq)
print("pcr reproduces the amplicon:", len(again), "bp")

# note the different convention — pcr RAISES when there is no single product,
# where the assembly2 helpers return []. Handle both.
try:
    pcr(fwd, fwd, region)
except ValueError as e:
    print("pcr with two forward primers raised ValueError:", str(e)[:60])
```

`tm_default` is Biopython's nearest-neighbour model with **polymerase-buffer defaults
baked in** — 250 nM each primer, 40 mM Na, 1.5 mM Mg, 75 mM Tris, 0.8 mM dNTPs. A generic
online calculator uses different salt and will not agree with it. Quote the conditions
whenever you quote a Tm.

## Homologous recombination

For an integration you give the target and the insert, and `limit` is the minimum homology
arm — in yeast, the arm length you ordered on your primers.

**The target must be linear.** `homologous_recombination_integration` models integration
into a chromosome and raises `ValueError` on a circular genome, pointing you at
`in_vivo_assembly` instead. That is the right split: integrating into a chromosome and
recombining into a plasmid are different reactions with different products, and the
library makes you say which you mean.

```python
from pydna.dseqrecord import Dseqrecord
from pydna.assembly2 import homologous_recombination_integration, in_vivo_assembly

UP = "ATGGCGTTAACGTCCAGGTTACGATCCGTTAGCCATGGTA"      # 40 bp upstream arm
DN = "CCGTTAAGCTTGGATCCTTAACGGTCAGTTAACCGGTTAC"      # 40 bp downstream arm
cassette = Dseqrecord(UP + "GGGGGGCCCCCCAAAAAAGGGGGGCCCCCC" + DN, name="cassette")

# a chromosomal locus — linear
chrom = Dseqrecord(UP + "TTTTTTTTTTTTTTTTTTTT" + DN, name="chr")
integrant, = homologous_recombination_integration(chrom, [cassette], limit=40)
print("chromosome:", len(chrom), "-> integrant", len(integrant), "circular:", integrant.circular)

# the 20 bp original stuffer is replaced by the 30 bp cassette payload
assert integrant.circular is False
assert len(integrant) == len(chrom) - 20 + 30 == 110

# arms shorter than `limit` are not recognised — [] again, not an error
assert homologous_recombination_integration(chrom, [cassette], limit=41) == []
print("limit=41 ->", homologous_recombination_integration(chrom, [cassette], limit=41))

# the same event on a circular target is in_vivo_assembly, and the product stays circular
plasmid = Dseqrecord(UP + "TTTTTTTTTTTTTTTTTTTT" + DN, name="plasmid", circular=True)
try:
    homologous_recombination_integration(plasmid, [cassette], limit=40)
except ValueError as e:
    print("circular target rejected:", str(e)[:60])

recombined, = in_vivo_assembly([plasmid, cassette], limit=40)
assert recombined.circular is True and len(recombined) == 110
print("plasmid   :", len(plasmid), "-> recombinant", len(recombined), "circular:", recombined.circular)
```

Both routes give a 110 bp product here and they are not the same molecule — one is a
linear chromosome arm, the other a closed plasmid. The topology is the answer, so check it
rather than only the length.

## Confirming the construct is the one you designed

`seguid()` returns a checksum **prefixed with the topology it was computed under** —
`cdseguid=` for a circular double-stranded molecule, `ldseguid=` for a linear one. The
circular form is invariant under rotation, which is what makes it the right identity check
for a plasmid: two GenBank files that start at different bases describe the same plasmid
and get the same `cdseguid`.

```python
from pydna.parsers import parse
from pydna.dseqrecord import Dseqrecord

puc = parse("puc19.gb")[0]
rotated = Dseqrecord(str(puc.seq)[100:] + str(puc.seq)[:100], circular=True)

print("as parsed:", puc.seguid())
print("rotated  :", rotated.seguid())

# same plasmid, different starting base — one identity
assert puc.seguid().startswith("cdseguid=")
assert rotated.seguid() == puc.seguid()

# the linear reading is a different molecule and says so in the prefix
linear = Dseqrecord(str(puc.seq))
assert linear.seguid().startswith("ldseguid=")
assert linear.seguid() != puc.seguid()

# and a linear checksum is NOT rotation-invariant, correctly
assert Dseqrecord(str(puc.seq)[100:] + str(puc.seq)[:100]).seguid() != linear.seguid()
print("circular identity holds under rotation; linear identity does not")
```

Record the `cdseguid=` of the intended plasmid in your notes. It is the one string that
survives re-annotation, renaming and re-origin, and comparing it is how you tell "the
sequencing came back correct" from "the sequencing came back".

Earlier material calls this `cseguid()`. That method is gone — `seguid()` with the
`cdseguid=` prefix replaces it.

## Try it

A self-contained check that this skill still works — fetch a real plasmid, open it, ligate
an insert, confirm the product by length and by topology-aware checksum, and confirm that
an incompatible insert yields no product. Public data, no account, no key. Transfers about
8 kB.

**Data** — pUC19, GenBank accession `L09137.2`, the 2686 bp cloning vector, served as a
GenBank flat file by NCBI E-utilities:

    https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=L09137.2&rettype=gb&retmode=text

NCBI's E-utilities are open to anonymous callers and need no key for a single record.
`L09137.2` is a stable, versioned accession. Last confirmed reachable 2026-10-03.

**Run** — needs only `pip install pydna`:

```python
import urllib.request, pathlib
from pydna.parsers import parse
from pydna.dseqrecord import Dseqrecord
from pydna.assembly2 import ligation_assembly
from Bio.Restriction import EcoRI, BamHI, HindIII

URL = ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
       "?db=nuccore&id=L09137.2&rettype=gb&retmode=text")
pathlib.Path("puc19_tryit.gb").write_text(
    urllib.request.urlopen(URL, timeout=60).read().decode())

puc = parse("puc19_tryit.gb")[0]
print("parsed       :", puc.id, len(puc), "bp, circular:", puc.circular)

# --- invariants: these hold across releases, a failure here means the skill is wrong ---
assert puc.circular is True                                  # a plasmid record is a circle
assert len(EcoRI.search(puc.seq)) == 1                       # unique sites in the polylinker
assert len(BamHI.search(puc.seq)) == 1
assert len(puc.cut(EcoRI)) == 1                              # one cut linearises a circle
assert puc.seguid().startswith("cdseguid=")                  # topology-prefixed checksum

backbone, = [f for f in puc.cut(EcoRI, BamHI) if len(f) > 1000]
insert,   = [f for f in Dseqrecord(
    "ttttGAATTCatgAGCAAAGGTGAAGAACTGTTTACCGGCGTGGTGCCGtaaGGATCCtttt"
    ).cut(EcoRI, BamHI) if 30 < len(f) < 80]

product, = ligation_assembly([backbone, insert], circular_only=True)
print("backbone     :", len(backbone), "| insert:", len(insert), "| product:", len(product))

assert product.circular is True
assert len(product) == len(backbone) + len(insert) - 2 * 4   # overhangs shared once each
assert product.seguid().startswith("cdseguid=")
assert product.seguid() != puc.seguid()                      # it is not the empty vector

# an incompatible insert returns [], it does not raise
bad, = [f for f in Dseqrecord("ttttAAGCTTatgAGCAAAGGTaaaAAGCTTtttt").cut(HindIII)
        if 15 < len(f) < 60]
assert ligation_assembly([backbone, bad], circular_only=True) == []
print("incompatible :", ligation_assembly([backbone, bad], circular_only=True), "(no exception)")

# --- observed values, pydna 5.5.16 / biopython 1.88, 2026-10-03 ---
# Drift here means the record or the library moved, not that the skill is broken.
assert len(puc) == 2686
assert len(backbone) == 2669 and len(insert) == 52 and len(product) == 2713
assert puc.seguid() == "cdseguid=mCC0B3UMZfgLyh3Pl574MVjm30U"
print("construct    :", product.seguid())
print("OK")
```

**Expect** — `parsed` reports `L09137.2 2686 bp, circular: True`; backbone 2669, insert 52,
product 2713 bp; the incompatible ligation prints `[]`; and the final line is a
`cdseguid=` checksum for the new plasmid, followed by `OK`. The length and checksum
assertions are invariants; the three specific fragment lengths and the pUC19 checksum are
observed values for the versions above.

## When not to use it

- **Designing the sequence.** pydna simulates what you specify. Codon optimisation,
  synthesis-complexity screening and part selection happen before it.
- **Reading sequencing data.** It models intended molecules, not reads. Confirming a
  construct from Sanger or nanopore output is a different job — bring the result back as a
  sequence and compare `seguid()`.
- **Anything needing real reaction conditions.** It will tell you two ends are compatible;
  it will not tell you the ligation is efficient, that the insert is toxic, or that your
  GC-rich arm will not anneal.
- **Vendor-specific ordering constraints.** Fragment length limits, repeat rules and
  homopolymer limits belong to whoever is synthesising the DNA.

For reading and writing the underlying sequence records, parsing features or running
alignments, use Biopython directly — pydna is built on it and `Dseqrecord` interoperates
with `SeqRecord`.
