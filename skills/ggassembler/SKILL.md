---
name: ggassembler
description: Design a combinatorial mutation library as degenerate-codon oligos with GGAssembler — pick ambiguous codons for the positions that vary, place Golden Gate overhangs by shortest-path search, simulate the assembly, and emit the oligos to order.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [golden-gate, library-design, degenerate-codons, protein-engineering, dna-assembly]
covers: [combinatorial library, degenerate codon, ambiguous codon, golden gate, type IIS, BsaI, BsmBI, SapI, oligo pool, site-saturation mutagenesis, deep mutational scanning, overhang fidelity, oligo order, resfile]
papers: [doi:10.1002/pro.5169, doi:10.1021/acssynbio.8b00333]
datasets: [https://www.ebi.ac.uk/ena/browser/api/embl/M62653.1]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-14
  against: GGAssembler (package dawdlib 0.0.1a0) at master 1bfee36 / biopython 1.88 / pandas 3.0.6 / networkx 3.6.1 / Python 3.11.17 on Linux
  executed: 5
  unverified: 1
  unverified_reason: >-
    The degenerate-table command calls the Kazusa codon-usage database over the network to
    rank candidate codons by host usage, and the validating environment could not resolve
    that host, so that one block is unrun. Everything downstream of the table is pure
    computation and was executed, including the offline table builder the Try it block
    uses in its place. Re-run it from a host that can reach the Kazusa codon-usage service,
    and confirm there that the service still answers.
---

# Designing a combinatorial mutation library with GGAssembler

A combinatorial library is not a list of mutants. If you want every combination of two
options at six positions, that is 64 proteins, and ordering 64 genes is absurd when the
positions differ from the parent by one codon each. The economical answer is to order a
few **degenerate** oligos — oligos synthesised with ambiguous bases, so one tube carries
several sequences — and assemble them combinatorially.

Golden Gate does the assembly, and that is where the difficulty actually lives. The
fragments are joined by four-base overhangs, every overhang in one reaction competes with
every other, and mis-ligation between two similar overhangs silently produces the wrong
protein. So the design problem is a search: cut the gene into the fewest segments such
that each variable position sits inside a segment, every junction is an overhang that
ligates efficiently, and no two junctions in the pot are confusable.

GGAssembler solves that search. You declare which positions vary and into what, and it
returns a set of junctions and the oligos to order, scored against measured ligation data
rather than a GC rule of thumb. The method is described in Hoch and colleagues,
*Protein Science* 2024 (`doi:10.1002/pro.5169`), which reports one-pot camelid antibody
libraries of more than 10^5 variants at under $0.007 of DNA per variant, with over 93% of
the intended variants present in the product by deep sequencing.

**This skill is about turning a design into an order.** Getting a parent coding sequence
that is clean enough to assemble — codon optimisation, GC windows, removing the assembly
enzyme's own recognition sites — is the step before it, and the `dna-chisel` skill covers
that.

## What you need before the first run

- **A Rust compiler.** GGAssembler's shortest-path core is a Rust extension built at
  install time, so `rustc` and `cargo` must be on the path. There is no published wheel.
- **Network access to a codon-usage service** for one step only. The degenerate-table
  step scores candidate ambiguous codons by how often each of their codons is used in
  your host, and it fetches those counts from the Kazusa codon-usage database at request
  time. Nothing else in the pipeline touches the network. If that host is unreachable you
  can still build the table yourself — there is a block below that does.
- **No account, no key, no GPU.** The whole pipeline is CPU work and finishes in seconds
  for a gene-sized sequence.

GGAssembler is licensed **AGPL-3.0**, which permits commercial use. The network clause
that distinguishes AGPL from GPL applies to offering *the tool itself* as a hosted
service over a network; it does not reach the oligo sequences you design with it, and it
does not constrain running it locally or inside your own pipeline. If you intend to expose
GGAssembler to third parties as a web service, read the licence — that is the case it
was written for.

```bash
# needs rustc on PATH; the extension is compiled during install
pip install "git+https://github.com/Fleishman-Lab/GGAssembler.git"
```

The import name is `dawdlib`, not `ggassembler`. Nothing is published on the package
index under either name — a package called `ggassembler` there is an unrelated project by
a different author, so `pip install ggassembler` installs the wrong software without
erroring.

## Four objects, in order

The pipeline is a chain of four files, and almost every confusion comes from mixing them
up:

| object | what it says |
|---|---|
| **resfile** | which amino-acid positions vary, and to which residues |
| **degenerate codon table** | which ambiguous codons realise that choice, per position |
| **gate path** | where the Golden Gate junctions go |
| **oligo table** | the DNA to order, with prefixes and suffixes attached |

A **resfile** is the Rosetta format, one line per position:

```
nataa
start
65	A	PIKAA	ST
203	A	PIKAA	TY
```

`PIKAA ST` means "at position 65, allow only S or T". The parser reads the first
whitespace field as the position and the last as the allowed residues; the chain column is
ignored.

## Step 1 — the degenerate codon table

```bash
dawdlib degenerate_table --res_file input.resfile --output_csv deg_table.csv
```

`--organism_id` is an NCBI taxonomy id and defaults to `37762` (*Escherichia coli*); pass
`4932` for *S. cerevisiae*, or any other id whose codon usage the service carries. **This
is the step that needs the network**, and when the codon-usage host cannot be reached it
raises `requests.exceptions.ConnectionError` naming `www.kazusa.or.jp` rather than
degrading quietly.

The output has one row per varied position:

| column | meaning |
|---|---|
| `AA_POS` | amino-acid position, 1-based |
| `DNA_POS` | **1-based position of the first base of that codon** — `AA_POS * 3 - 2` |
| `ENCODED_AAS` | the residues the chosen codons actually encode |
| `ENCODED_COUNT` | how many codons encode each of those residues |
| `AMBIGUOUS_CODONS1`…`4` | the ambiguous codons for this position, blank-padded |

Two of those columns carry the traps. `DNA_POS` counts **bases from 1**, so a table built
by hand with 0-based offsets places every variable position one base early and the design
is wrong without failing. And a position needs **more than one** ambiguous codon whenever
the residues you want cannot be covered by a single IUPAC codon — `{T, Y}` differ at two
of the three bases, so `ACC` and `TAC` are listed side by side and the assembly ends up
with two oligos for that segment instead of one.

The library's size is the product of the per-position codon counts:

```python
import ast
import pandas as pd

deg_table = pd.read_csv("deg_table.csv", na_filter=True, keep_default_na=False)
diversity = deg_table.ENCODED_COUNT.apply(ast.literal_eval).apply(sum).prod()
print(f"the table encodes {diversity} DNA variants")
```

### Building the table without the codon-usage service

What the service buys is *ranking* — among the ambiguous codons that cover a residue set,
prefer the one whose codons are common in the host. The coverage itself is arithmetic on
the IUPAC code and the standard genetic code, so a table can be built offline. Use this
when you want to pin the codons yourself, or when the codon-usage host is down:

```python
import itertools
import pandas as pd
from Bio.Data.IUPACData import ambiguous_dna_values as AMBIG
from Bio.Seq import Seq

def codon_residues(codon):
    """Every residue an ambiguous codon encodes, with the number of codons for each."""
    counts = {}
    for bases in itertools.product(*[AMBIG[b] for b in codon]):
        aa = str(Seq("".join(bases)).translate())
        counts[aa] = counts.get(aa, 0) + 1
    return counts

def exact_codons(residues):
    """Single ambiguous codons encoding exactly this residue set and no stop."""
    want = frozenset(residues)
    hits = []
    for codon in map("".join, itertools.product("ACGTRYSWKMBDHVN", repeat=3)):
        counts = codon_residues(codon)
        if "*" not in counts and frozenset(counts) == want:
            hits.append(codon)
    return hits

print("S,T ->", exact_codons("ST")[:4])
print("T,Y ->", exact_codons("TY"))        # empty: needs two codons

def deg_table_from_design(design):
    """design maps a 1-based AA position to the list of ambiguous codons to use there."""
    rows = []
    for aa_pos, codons in sorted(design.items()):
        counts = {}
        for codon in codons:
            for aa, n in codon_residues(codon).items():
                counts[aa] = counts.get(aa, 0) + n
        if "*" in counts:
            raise ValueError(f"position {aa_pos} encodes a stop codon")
        residues = sorted(counts)
        row = {"AA_POS": aa_pos, "DNA_POS": aa_pos * 3 - 2,
               "ENCODED_AAS": str(residues),
               "ENCODED_COUNT": str([counts[aa] for aa in residues])}
        for i in range(4):
            row[f"AMBIGUOUS_CODONS{i + 1}"] = codons[i] if i < len(codons) else ""
        rows.append(row)
    return pd.DataFrame(rows)
```

`exact_codons` returning an empty list is the signal that the position needs a
multi-codon entry, not that the design is impossible.

## Step 2 — the parent gene must carry no site for the assembly enzyme

Golden Gate cuts with a type IIS enzyme, so a recognition site anywhere inside the parent
gene is cut as well and the assembly loses a fragment. GGAssembler checks this for you and
hands back which positions offend:

```python
from dawdlib.golden_gate.utils import check_for_restriction_sites

clean, enzyme, positions = check_for_restriction_sites(dna, ["BsaI"])
if not clean:
    raise SystemExit(f"{enzyme} site(s) at {positions} — remove them before designing")
```

The check runs on **both strands** — `BsaI` is `GGTCTC`, and a gene with no `GGTCTC`
anywhere can still carry `GAGACC` on the minus strand and be cut. Grepping the site as
written is the mistake this check exists to catch. Clearing it is a synonymous codon
substitution; `dna-chisel` does it as a declared constraint, and the `## Try it` block
below does it in a few lines for the one site in the example gene.

Note that a *chosen degenerate codon* can also create a site that the parent did not
have. Nothing catches that until the reaction simulation in step 4, which is one reason
not to skip it.

## Step 3 — placing the junctions

**Use the Python API, not the `create_goldengates` subcommand.** At master `1bfee36` the
`dawdlib create_goldengates` and `dawdlib ggsim` subcommands both raise

```
TypeError: Requirements.__new__() missing 2 required positional arguments: 'oligo_suffix' and 'const_cost'
```

because the `Requirements` tuple gained fields that those two call sites were never
updated for. The `degenerate_table`, `combine` and `embl` subcommands are unaffected. The
library path below is what the project's own example notebook uses and it works.

```python
from dawdlib.golden_gate.utils import RequirementsFactory, expand_dna_var_poss
from dawdlib.golden_gate.gate_data import GGData
from dawdlib.golden_gate.graph_maker import GraphMaker, make_default_graph
from dawdlib.golden_gate.find_gg import deg_table_to_dict
from dawdlib.dijkstra.len_limit import all_shortest_paths
from dawdlib.degenerate_dna.deg_table import TableColNames

PREFIX = "GACATTGGTCTCA"                        # ends with the BsaI site
SUFFIX = "TGAGACCAACGACGCCGTACTCTTTGTCAAC"      # starts with the BsaI site

reqs = RequirementsFactory(
    min_oligo_length=20, max_oligo_length=200, min_const_oligo_length=20,
    min_efficiency=0.25, min_fidelity=0.1,
    oligo_prefix=PREFIX, oligo_suffix=SUFFIX,
    const_cost=40, filter_gc_overhangs=False,
)
ggdata = GGData(temperature=reqs.gg_temp, hours=reqs.gg_hours,
                min_efficiency=reqs.min_efficiency, min_fidelity=reqs.min_fidelity)

var_poss = expand_dna_var_poss(deg_table[TableColNames.DNA_POS.value].tolist())
graph, src, target = make_default_graph(
    GraphMaker(ggdata), dna, var_poss, deg_table_to_dict(deg_table), reqs, 4)
print(f"{graph.number_of_nodes()} candidate junctions, {graph.number_of_edges()} segments")
```

Four things in that call decide whether you get a usable answer.

- **`RequirementsFactory`, not `Requirements`.** The factory subtracts the prefix and
  suffix lengths from `max_oligo_length`, so the number you pass is the length of the
  oligo you will actually order. Construct the tuple directly and you will order oligos
  that are 44 bases longer than your synthesis limit.
- **`max_oligo_length` bounds only the segments that carry a varied position.** A segment
  with nothing variable in it has a minimum (`min_const_oligo_length`) and no maximum at
  all, so constant segments routinely come back longer than the synthesis limit. That is
  the design working as intended — you amplify those off the parent plasmid rather than
  buying them — but it means a blanket length check over the whole oligo table fails, and
  the check you want is over the non-constant rows. Both bounds are strict, so a segment
  exactly `max_oligo_length` long is rejected.
- **`min_fidelity` is a mis-ligation budget, not a fidelity floor** in the usual
  direction. It is compared against the reaction fidelity returned by the ligation model;
  `0.1` is permissive and what the project's example uses.
- **The last argument is the overhang length**, 4 for `BsaI` and `BsmBI`. `SapI` leaves
  3-base overhangs, and switching to it means passing `3` *and* swapping the ligation
  table and the prefix and suffix for that enzyme's recognition sequence.
- **`PREFIX` and `SUFFIX` must contain the enzyme's recognition site**, because they are
  what the enzyme cuts to release each fragment. They are not primer tails.

Then enumerate shortest paths and keep the first whose overhang set ligates cleanly:

```python
chosen = None
for i, (path, cost) in enumerate(all_shortest_paths(
        graph, src, target, weight="weight", len_cutoff=12)):
    junctions = [g for g in path if not g.src_or_target]
    try:
        fidelity = ggdata.reaction_fidelity(*[g.bps for g in junctions])[0]
    except ValueError:
        continue                      # overhang pair absent from the ligation table
    if fidelity > reqs.min_fidelity:
        chosen = (path, cost, fidelity)
        break
    if i > 2000:
        break

path, cost, fidelity = chosen
print(f"{len([g for g in path if not g.src_or_target])} junctions, "
      f"cost {cost}, reaction fidelity {fidelity:.4f}")
```

`cost` is the thing being minimised and it is in bases of synthesis, weighted by
`const_cost` for each constant segment — that is what "economical" means here, and it is
why the search prefers few long segments over many short ones.

### Ligation data and reaction conditions

The fidelity model is a published measurement, not a heuristic — the T4 ligase
four-base-overhang ligation profiling of Potapov and colleagues
(`doi:10.1021/acssynbio.8b00333`), shipped with the package as CSV tables. That is what
makes "this overhang set ligates cleanly" a claim with numbers behind it. Only three
condition combinations are bundled, and `GGData` raises `ValueError` for anything else:

```python
import dawdlib.golden_gate.resources as resources
from dawdlib.golden_gate.gate_data import GGData

print(sorted(resources.ligation_data))
print({k: v.rsplit("/", 1)[-1] for k, v in GGData.df_files.items()})   # (hours, °C)
try:
    GGData(temperature=16, hours=4)
except ValueError as exc:
    print("unsupported conditions ->", exc)
```

Watch the defaults: `GGData` defaults to 25 °C while `Requirements` defaults `gg_temp` to
**37**, so passing `reqs.gg_temp` through — as above — is not the same as taking either
default. Set the pair to the conditions you will actually run, and say which in the design
summary.

## Step 4 — oligos, and simulating the assembly

```python
from dawdlib.gg_dc_combine.gg_dc_combine import dc_df_codon_list, gate_cdn_oligos
from dawdlib.golden_gate.reaction_sim import ReactionSim

oligos = gate_cdn_oligos(path, dc_df_codon_list(deg_table), dna,
                         reqs.oligo_prefix, reqs.oligo_suffix, "GFP-SPECTRAL")
oligos.to_csv("oligos.csv", index=False)

sim = ReactionSim(ggdata, reqs, ["BsaI"])
problem = sim.create_reaction_graph("oligos.csv")
if problem is not None:
    message, entry = problem
    raise SystemExit(f"{message}\ncodons {entry.oligo_codons} in {entry.name} "
                     f"created a new restriction site — change them in the table")

wt, = sim.get_wt_dna()
assert wt.dna == dna, "the simulated parent product is not the input gene"
ok, products, offender = sim.verify_reaction(
    wt.end - wt.start, wt.no_segments, wt.fidelity_sum)
print(f"simulation {'passed' if ok else 'FAILED'}, {products} distinct products")
if not ok:
    print("first badly assembled product:", offender)
```

`verify_reaction` returns **three** values — the verdict, the product count, and the
first product that failed, empty on success. Its own docstring describes a 2-tuple, so
unpacking into two names raises `ValueError: too many values to unpack` rather than
anything that points at the cause.

**`verify_reaction` is the check that matters.** It walks the assembly graph and counts
the distinct products the reaction can make; that number must equal the diversity the
degenerate table encodes. If it is lower, diversity was lost somewhere — a segment that
cannot ligate, an overhang collision, a codon that got absorbed. If it is higher,
something is assembling that should not. Either way the order is wrong and the design has
to change, not the assertion.

`create_reaction_graph` returning `None` means no oligo created a new restriction site.
When it returns a tuple, the fix is in the degenerate table — pick a different synonymous
codon for the position it names and re-run from step 3. Do not relax the enzyme list.

The oligo table has one row per segment, and two boolean columns decide what you buy:

- `wt` marks the parent sequence for that segment, `const` marks a segment with no varied
  position in it.
- The rows that carry diversity are `~wt & ~const` — those are the degenerate oligos.
- The `wt & const` rows are the invariant backbone pieces. You need them for the assembly,
  but only once, you may already have them from a previous order, and they are the rows
  that can exceed your synthesis limit — amplify them from the parent.

`full_oligo_dna` is what you paste into an order form — segment plus prefix and suffix,
with the ambiguous bases in place. `oligo_dna` is the segment alone.

## Step 5 — annotate the design so a human can read it

```python
from Bio import SeqIO
from dawdlib.embl_utils.embl_maker import create_dc_features, create_path_features
from dawdlib.degenerate_dna.utils import parse_degenerate_codon_csv

record = SeqIO.read("parent.fasta", "fasta")
record.annotations["molecule_type"] = "DNA"
record.features.extend(create_dc_features(parse_degenerate_codon_csv("deg_table.csv")))
record.features.extend(create_path_features(path))
SeqIO.write(record, "design.embl", "embl")
```

That file opens in any sequence viewer with the varied codons and the junctions marked,
which is the artefact to attach to a design review. `molecule_type` must be set or
Biopython refuses to write EMBL.

Expect one `BiopythonWarning` per feature on the way out. GGAssembler names each feature
after what it is — `ST=1` for a degenerate codon, `G.178.TTGT` for a junction — and those
are not valid INSDC feature keys. The file is written and reads correctly in a viewer; the
warnings are not a failure and there is nothing to fix in the design.

## What to hand back

The deliverable is the order table plus a short design summary — not a transcript of the
run. Keep them separate, and never leave a placeholder in either.

- **Proposed** — the junctions chosen, the segment count, and the oligos to order with
  their lengths.
- **Inferred** — the diversity the table encodes and the product count the simulation
  found, stated as the same number or flagged as a mismatch.
- **Decided** — enzyme, overhang length, reaction temperature and time, synthesis length
  limit, and whether constant segments were included in the order.
- **Outstanding** — anything left to a human. A position whose residue set needed two
  codons and so doubled a segment's oligo count is the usual one.

## Try it

**Data.** The native *Aequorea victoria* green fluorescent protein mRNA, ENA accession
**M62653.1**, fetched from the ENA Browser API. INSDC records carry no access conditions
and need no account; confirmed reachable 14 Oct 2026. The coding sequence is taken from
the record's own `CDS` feature rather than assumed, and the design varies six positions
that avGFP numbering makes recognisable — 64, 65, 145, 148, 167 and 203 — two options
each, so 64 variants.

The block is routed through two traps on purpose. The native CDS carries **no `GGTCTC`
anywhere** and is still cut by `BsaI`, on the minus strand, so it must be repaired before
it can be assembled. And position 203 wants `{T, Y}`, which no single ambiguous codon
encodes, so that segment ends up with two oligos while the others have one.

The degenerate table is built inline by the offline routine above rather than by
`dawdlib degenerate_table`, so this runs with no network beyond the one ENA fetch. That
is a deliberate substitution and it changes nothing that is checked here — the codons are
pinned by the design, and what the codon-usage service would have supplied is a preference
among codons that encode the same residues.

**Run.** Self-contained, from an empty directory. Needs `rustc` on the path.

```bash
pip install "git+https://github.com/Fleishman-Lab/GGAssembler.git"
```

```python
import ast
import itertools
import urllib.request

import pandas as pd
from Bio import Restriction, SeqIO
from Bio.Data.IUPACData import ambiguous_dna_values as AMBIG
from Bio.Seq import Seq

from dawdlib.degenerate_dna.deg_table import TableColNames
from dawdlib.dijkstra.len_limit import all_shortest_paths
from dawdlib.gg_dc_combine.gg_dc_combine import dc_df_codon_list, gate_cdn_oligos
from dawdlib.golden_gate.find_gg import deg_table_to_dict
from dawdlib.golden_gate.gate_data import GGData
from dawdlib.golden_gate.graph_maker import GraphMaker, make_default_graph
from dawdlib.golden_gate.reaction_sim import ReactionSim
from dawdlib.golden_gate.utils import (RequirementsFactory,
                                       check_for_restriction_sites,
                                       expand_dna_var_poss)

# ---- parent gene: native avGFP from ENA
urllib.request.urlretrieve(
    "https://www.ebi.ac.uk/ena/browser/api/embl/M62653.1", "gfp.embl")
record = SeqIO.read("gfp.embl", "embl")
cds = str(next(f for f in record.features
               if f.type == "CDS").extract(record.seq)).upper()
protein = str(Seq(cds).translate())
print(f"CDS {len(cds)} bp, protein {len(protein) - 1} aa")

# Trap 1: no GGTCTC in the text, still a BsaI site -- on the minus strand.
assert "GGTCTC" not in cds
print("BsaI cut positions in the native CDS:", Restriction.BsaI.search(Seq(cds)))
print("check_for_restriction_sites(native):", check_for_restriction_sites(cds, ["BsaI"]))

# Repair it with synonymous substitutions.
synonyms = {}
for codon in map("".join, itertools.product("ACGT", repeat=3)):
    synonyms.setdefault(str(Seq(codon).translate()), []).append(codon)

dna = cds
while Restriction.BsaI.search(Seq(dna)):
    site = next(p for p in (str(Restriction.BsaI.site),
                            str(Seq(str(Restriction.BsaI.site)).reverse_complement()))
                if p in dna)
    start = dna.find(site)
    for ci in range(start // 3, (start + len(site) - 1) // 3 + 1):
        here = dna[ci * 3:ci * 3 + 3]
        swap = next((alt for alt in synonyms[str(Seq(here).translate())]
                     if alt != here
                     and not Restriction.BsaI.search(
                         Seq(dna[:ci * 3] + alt + dna[ci * 3 + 3:]))), None)
        if swap:
            dna = dna[:ci * 3] + swap + dna[ci * 3 + 3:]
            break
    else:
        raise SystemExit("no synonymous substitution clears the site")

# Invariants: same protein, same length, no site on either strand.
assert str(Seq(dna).translate()) == protein, "repair changed the protein"
assert len(dna) == len(cds)
assert check_for_restriction_sites(dna, ["BsaI"])[0]
print("synonymous edits to clear BsaI:",
      sum(1 for a, b in zip(cds, dna) if a != b))
open("parent.fasta", "w").write(f">parent\n{dna}\n")

# ---- degenerate codon table, built offline
def codon_residues(codon):
    counts = {}
    for bases in itertools.product(*[AMBIG[b] for b in codon]):
        aa = str(Seq("".join(bases)).translate())
        counts[aa] = counts.get(aa, 0) + 1
    return counts

DESIGN = {64: ["TTM"], 65: ["AST"], 145: ["TWC"],
          148: ["YAC"], 167: ["AYT"], 203: ["ACC", "TAC"]}   # trap 2: 203 needs two

rows = []
for aa_pos, codons in sorted(DESIGN.items()):
    counts = {}
    for codon in codons:
        for aa, n in codon_residues(codon).items():
            counts[aa] = counts.get(aa, 0) + n
    assert "*" not in counts, aa_pos
    residues = sorted(counts)
    assert protein[aa_pos - 1] in residues, f"parent residue dropped at {aa_pos}"
    row = {"AA_POS": aa_pos, "DNA_POS": aa_pos * 3 - 2,
           "ENCODED_AAS": str(residues),
           "ENCODED_COUNT": str([counts[aa] for aa in residues])}
    for i in range(4):
        row[f"AMBIGUOUS_CODONS{i + 1}"] = codons[i] if i < len(codons) else ""
    rows.append(row)
deg_table = pd.DataFrame(rows)
deg_table.to_csv("deg_table.csv", index=False)

# Invariant: DNA_POS is the 1-based first base of the codon for that residue.
for row in rows:
    codon = dna[row["DNA_POS"] - 1:row["DNA_POS"] + 2]
    assert str(Seq(codon).translate()) == protein[row["AA_POS"] - 1], row

diversity = deg_table.ENCODED_COUNT.apply(ast.literal_eval).apply(sum).prod()
print("intended diversity:", diversity)

# ---- junctions
PREFIX = "GACATTGGTCTCA"
SUFFIX = "TGAGACCAACGACGCCGTACTCTTTGTCAAC"
reqs = RequirementsFactory(
    min_oligo_length=20, max_oligo_length=200, min_const_oligo_length=20,
    min_efficiency=0.25, min_fidelity=0.1,
    oligo_prefix=PREFIX, oligo_suffix=SUFFIX,
    const_cost=40, filter_gc_overhangs=False)
assert reqs.max_oligo_length == 200 - len(PREFIX) - len(SUFFIX)

ggdata = GGData(temperature=reqs.gg_temp, hours=reqs.gg_hours,
                min_efficiency=reqs.min_efficiency, min_fidelity=reqs.min_fidelity)
graph, src, target = make_default_graph(
    GraphMaker(ggdata), dna,
    expand_dna_var_poss(deg_table[TableColNames.DNA_POS.value].tolist()),
    deg_table_to_dict(deg_table), reqs, 4)
print(f"graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges")

chosen = None
for i, (candidate, cost) in enumerate(all_shortest_paths(
        graph, src, target, weight="weight", len_cutoff=12)):
    junctions = [g for g in candidate if not g.src_or_target]
    try:
        fidelity = ggdata.reaction_fidelity(*[g.bps for g in junctions])[0]
    except ValueError:
        continue
    if fidelity > reqs.min_fidelity:
        chosen = (candidate, cost, fidelity, len(junctions))
        break
    if i > 2000:
        break
assert chosen, "no path cleared the fidelity threshold"
path, cost, fidelity, n_junctions = chosen

# ---- oligos and simulation
oligos = gate_cdn_oligos(path, dc_df_codon_list(deg_table), dna,
                         reqs.oligo_prefix, reqs.oligo_suffix, "GFP-SPECTRAL")
oligos.to_csv("oligos.csv", index=False)

sim = ReactionSim(ggdata, reqs, ["BsaI"])
problem = sim.create_reaction_graph("oligos.csv")
assert problem is None, f"an oligo created a new restriction site: {problem}"
wt, = sim.get_wt_dna()
assert wt.dna == dna, "simulated parent product is not the input gene"
ok, products, offender = sim.verify_reaction(
    wt.end - wt.start, wt.no_segments, wt.fidelity_sum)

# Invariants: the reaction makes exactly the library the table encodes.
assert ok, f"verify_reaction failed on {offender}"
assert products == diversity, (products, diversity)
to_order = oligos[~oligos.wt & ~oligos.const]
assert len(to_order) == 4, len(to_order)
# The length bound applies to segments carrying a varied position, not to constant ones.
assert all(len(o) <= 200 for o in oligos[~oligos.const].full_oligo_dna), \
    "a variable oligo exceeds the synthesis limit"
assert any(len(o) > 200 for o in oligos[oligos.const].full_oligo_dna), \
    "expected at least one constant segment past the limit -- those are amplified"

# Observed values -- drift to investigate, not failure.
print(f"junctions: {n_junctions}, cost: {cost}, fidelity: {fidelity:.4f}")
print(f"segments in the reaction: {wt.no_segments}")
print(f"oligo rows: {len(oligos)}, degenerate oligos to order: {len(to_order)}")
print("overhangs:", [g.bps for g in path if not g.src_or_target])
print(f"products: {products} (intended {diversity})")
print("OK")
```

**Expect.**

Invariants — a failure here means the skill or the design is wrong:

- The native CDS contains no `GGTCTC` and `Restriction.BsaI.search` still reports a cut.
- The repaired gene translates to the same 238-residue protein and is the same length.
- `DNA_POS - 1` indexes the codon for `AA_POS` in the repaired gene.
- `create_reaction_graph` returns `None`.
- The simulated parent product equals the input gene, and `verify_reaction` reports
  **exactly** the diversity the table encodes.
- No oligo carrying a varied position is longer than the 200-base limit passed to
  `RequirementsFactory`, and at least one constant segment is longer — the bound does not
  apply to those.

Observed on 14 Oct 2026, against GGAssembler at master `1bfee36` — a mismatch here is
drift to investigate, not a bug:

```
CDS 717 bp, protein 238 aa
BsaI cut positions in the native CDS: [639]
check_for_restriction_sites(native): (False, 'BsaI', [639])
synonymous edits to clear BsaI: 1
intended diversity: 64
graph: 609 nodes, 58326 edges
junctions: 5, cost: 460, fidelity: 0.9778
segments in the reaction: 8
oligo rows: 10, degenerate oligos to order: 4
overhangs: ['TTGT', 'TATG', 'CAAC', 'CTTT', 'CAAT']
products: 64 (intended 64)
OK
```

Sixty-four proteins from four degenerate oligos and six backbone segments is the point of
the method, and the product count is the only evidence that the library you ordered is
the library you designed.
