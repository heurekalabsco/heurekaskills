---
name: biogrid
description: Get BioGRID protein and genetic interactions and ORCS CRISPR screens from pinned keyless release files — physical vs genetic kept apart, evidence rows vs distinct pairs, Entrez not symbol joins, organism filters, the REST key and 10,000-row cap.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, protein-interaction, ppi, crispr]
covers: [biogrid, biogrid orcs, orcs, protein-protein interaction, genetic interaction, physical interaction, synthetic lethality, negative genetic, positive genetic, epistasis, affinity capture-ms, two-hybrid, proximity labeling, interactome, crispr screen, crispr knockout screen, essential genes, multi-validated, mitab, entrez gene, virus-host interaction, sars-cov-2, human, mouse, yeast, saccharomyces cerevisiae, drosophila, arabidopsis, c. elegans, e. coli]
papers: [PMID:33070389, PMID:30476227, PMID:16381927]
access: [open, registered]
datasets: [https://downloads.thebiogrid.org/Download/BioGRID/Release-Archive/BIOGRID-5.0.263/BIOGRID-CORONAVIRUS-5.0.263.tab3.zip, https://downloads.thebiogrid.org/Download/BioGRID/Release-Archive/BIOGRID-5.0.263/BIOGRID-ALL-5.0.263.tab3.zip, https://downloads.thebiogrid.org/Download/BioGRID-ORCS/Release-Archive/BIOGRID-ORCS-2.0.18/BIOGRID-ORCS-ALL-drosophila_melanogaster-2.0.18.screens.tar.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-19
  against: BioGRID 5.0.263 release files (built 2026-10-30) / BioGRID ORCS 2.0.18 / NCBI Homo_sapiens.gene_info fetched 2026-11-19 / Python 3.12 standard library only / curl 8 / macOS arm64
  executed: 7
  unverified: 1
  unverified_reason: The paged REST block needs a BioGRID access key, which requires registering an account; it was not run. Its keyless error path was run. Re-run with BIOGRID_ACCESS_KEY set.
---

# BioGRID — protein and genetic interactions, and ORCS CRISPR screens

BioGRID (TyersLab) curates interactions from the literature: **physical** ones (two proteins
co-purify, bind in a two-hybrid assay, sit in a crystal structure) and **genetic** ones (two
mutations together give a phenotype neither gives alone — synthetic lethality, suppression,
rescue). Release 5.0.263 (November 2026) holds 2,964,629 evidence rows, split into 98
per-organism files. BioGRID ORCS is its sister database of published CRISPR screens, scored per gene.

Four things to know before counting anything:

- **Physical and genetic interactions are different claims in one file.** 2,074,672 rows are
  physical, 889,957 genetic. A "number of interactions" that does not say which is a sum of
  two unlike things. Split on `Experimental System Type` every time.
- **A row is one piece of evidence, not one interaction.** The same pair reported by five
  papers, or by one paper with two methods, is five or two rows. The 2,964,629 rows are
  2,306,541 distinct pairs. TP53 has 6,133 rows but 2,590 distinct partners.
- **Join on ids, not symbols.** BioGRID prints the gene symbol current when the record was
  built, and some are old: 1,620 of 21,096 human genes in 5.0.263 carry a symbol NCBI no
  longer uses, and 26 of those symbols now belong to a *different* gene.
- **Cross-species rows are real data.** 116,904 rows pair proteins from two organisms, mostly
  virus–host. Filtering "both sides human" silently deletes them.

## What you need

**For the release files: nothing.** They are anonymous downloads, and they are the route this
page verifies and recommends. **For the REST service: a free access key**, issued on
registration at <https://webservice.thebiogrid.org>. Every REST call, including `/version`,
is refused without it (see **REST**). The ORCS web service needs its own key in the same
way; ORCS release files need none.

The download host refuses Python's default `User-Agent` with `403 Forbidden`, and limits
rapid requests with `429`. Send a `User-Agent` of your own (the blocks here do) and fetch a
release once rather than in a loop.

## Licence

Checked on 2026-11-19 at <https://wiki.thebiogrid.org/doku.php/terms_and_conditions>, which the
footer of every BioGRID and ORCS page links as its terms: the page is the MIT licence,
"Copyright 2021 Mike Tyers", and grants "to any person obtaining a copy … to deal in the
Software without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies", provided the copyright notice is
kept. Commercial use is allowed. Keep that notice with any redistributed BioGRID file, and cite
the release. Rows imported from other databases (`Source Database` other than `BIOGRID`, such
as FlyBase or WormBase — 67,692 rows in 5.0.263) come from those sources.

This page is original text, CC-BY-4.0, by Heureka Labs.

## Pin the release

BioGRID releases monthly, as `MAJOR.MINOR.BUILD`; the 4.4 series ended at 4.4.249 and the 5.0
series followed.
`Latest-Release/` and `*-LATEST.*` names move with each build, so pin the archive path:

```
https://downloads.thebiogrid.org/Download/BioGRID/Release-Archive/BIOGRID-<rel>/<file>
```

The current number is on <https://thebiogrid.org> ("Our current index is version …") and the
list of builds at <https://downloads.thebiogrid.org/BioGRID/Release-Archive/>. ORCS is
versioned separately: 2.0.18 was current on 2026-11-19, with files dated September 2025.

The useful 5.0.263 files (sizes from the release page):

| file | size | what |
|---|---|---|
| `BIOGRID-ALL-<rel>.tab3.zip` | 175 MB (1.57 GB unzipped) | every row, every organism, one file |
| `BIOGRID-ORGANISM-<rel>.tab3.zip` | 181 MB | one `.tab3.txt` per organism (98 of them) |
| `BIOGRID-MV-Physical-<rel>.tab3.zip` | 34 MB | multi-validated physical rows only |
| `BIOGRID-CORONAVIRUS-<rel>.tab3.zip` | 4.5 MB | coronavirus themed project |
| `BIOGRID-IDENTIFIERS-<rel>.tab.zip` | 259 MB | BioGRID id to every external id |

Use TAB 3.0 (`.tab3`). It carries Entrez, BioGRID, UniProt and RefSeq ids for both sides plus
both organism ids. BioGRID's format page lists TAB 2.0, TAB 1.0 and PSI-MI XML 1.0 as obsolete
legacy formats; MITAB and PSI-MI 2.5 are there for tools that need them.

## Get the files

The server sends no `Content-Length` and ignores `Range`, so a partial download is not
detectable from the headers: test the archive after it lands. A file that does not exist
answers `302` to `/Error`, which serves an HTML page with status `404`. Without `-L`, `curl -f`
exits 0 on the `302` and leaves an empty file.

```bash
REL=5.0.263                                   # pin: BioGRID releases monthly
BASE=https://downloads.thebiogrid.org/Download/BioGRID/Release-Archive/BIOGRID-$REL
f=BIOGRID-ALL-$REL.tab3.zip
# -L matters: a missing file answers 302 -> /Error (404). Without -L, curl -f exits 0 on an empty file.
curl -fsSL -o "$f" "$BASE/$f" || { echo "no such release file: $BASE/$f" >&2; exit 1; }
unzip -tq "$f"                                # the server sends no Content-Length; test the archive
unzip -l "$f" | sed -n 4p
```

On 2026-11-19 (about 30 seconds):

```
No errors detected in compressed data of BIOGRID-ALL-5.0.263.tab3.zip.
1569462267  10-30-2026 00:12   BIOGRID-ALL-5.0.263.tab3.txt
```

With `REL=5.0.299` it printed `curl: (22) The requested URL returned error: 404` and the
`no such release file` line, and exited 1.

**One organism.** Take it from the ORGANISM zip without unpacking the rest:
`unzip -p BIOGRID-ORGANISM-5.0.263.tab3.zip BIOGRID-ORGANISM-Homo_sapiens-5.0.263.tab3.txt`.
A cross-species row appears in **both** organisms' files: the 98 organism files of 5.0.263
hold 3,081,533 rows against 2,964,629 in the ALL file, and the difference, 116,904, is exactly
the number of cross-species rows. Never concatenate organism files to get "everything"; use
ALL. The human file has 1,441,421 rows, 113,939 of them with a non-human partner (55,909 with
SARS-CoV-2).

### The helper

The later blocks import this module; run them from the directory holding the release zip.

```bash
cat > biogrid_tab3.py <<'PY'
"""Stream a BioGRID TAB 3.0 release zip and count it without mixing up its denominators."""
import collections
import io
import zipfile

# zero-based columns of TAB 3.0 (the header row starts with '#BioGRID Interaction ID')
ID, ENTREZ_A, ENTREZ_B, BG_A, BG_B = 0, 1, 2, 3, 4
SYMBOL_A, SYMBOL_B, SYSTEM, TYPE, AUTHOR, PUB = 7, 8, 11, 12, 13, 14
TAX_A, TAX_B, THROUGHPUT = 15, 16, 17


def rows(zip_path):
    """Yield every evidence row as a list of strings. '-' means empty."""
    with zipfile.ZipFile(zip_path) as z:
        (name,) = [n for n in z.namelist() if n.endswith(".tab3.txt")]
        with z.open(name) as fh:
            for line in io.TextIOWrapper(fh, encoding="utf-8"):
                if line.startswith("#"):
                    assert line.split("\t")[TYPE] == "Experimental System Type", "not TAB 3.0"
                    continue
                yield line.rstrip("\n").split("\t")


def gene_summary(zip_path, biogrid_id, partner_taxa=None):
    """Evidence rows, distinct partners and publications for one gene, split by
    physical/genetic. Keys on BioGRID ids: Entrez is '-' for many viral proteins.
    partner_taxa: None keeps every partner; a set of NCBI taxon ids (strings) keeps
    only partners from those organisms and counts the rest under 'excluded'."""
    ev = collections.Counter()
    partners = {"physical": set(), "genetic": set()}
    pubs = {"physical": set(), "genetic": set()}
    excluded = collections.Counter()
    for f in rows(zip_path):
        if biogrid_id not in (f[BG_A], f[BG_B]):
            continue
        a_side = f[BG_A] == biogrid_id
        partner, partner_tax = (f[BG_B], f[TAX_B]) if a_side else (f[BG_A], f[TAX_A])
        if partner_taxa is not None and partner_tax not in partner_taxa:
            excluded[partner_tax] += 1
            continue
        t = f[TYPE]
        ev[t] += 1
        pubs[t].add(f[PUB])
        partners[t].add(partner)                      # a self-interaction adds the gene itself
    return {
        "evidence_rows": {t: ev[t] for t in ("physical", "genetic")},
        "partners": {t: len(p) for t, p in partners.items()},
        "partners_any_type": len(partners["physical"] | partners["genetic"]),
        "partners_both_types": len(partners["physical"] & partners["genetic"]),
        "publications": {t: len(p) for t, p in pubs.items()},
        "self_interaction": biogrid_id in partners["physical"] | partners["genetic"],
        "excluded_rows": sum(excluded.values()),
        "excluded_top_taxa": dict(excluded.most_common(3)),
    }
PY
```

`gene_summary` keys on the **BioGRID id**, not on Entrez. Entrez is `-` on 7,274 rows (viral
proteins such as SARS-CoV-2 ORF9b have no Entrez gene); keying pairs on Entrez merges all of
those into a handful of fake "genes", turning 2,306,541 distinct pairs into 2,294,827.

## Counting: evidence, pairs, and the two kinds of interaction

```python
import collections
from biogrid_tab3 import rows, gene_summary, BG_A, BG_B, ENTREZ_A, ENTREZ_B, TYPE, TAX_A, TAX_B

ZIP = "BIOGRID-ALL-5.0.263.tab3.zip"
n = collections.Counter()
by_bg, by_entrez = collections.defaultdict(set), set()
for f in rows(ZIP):
    n[f[TYPE]] += 1
    n["cross-species"] += f[TAX_A] != f[TAX_B]
    n["no Entrez on a side"] += "-" in (f[ENTREZ_A], f[ENTREZ_B])
    by_bg[frozenset((f[BG_A], f[BG_B]))].add(f[TYPE])
    by_entrez.add(frozenset((f[ENTREZ_A], f[ENTREZ_B])))
print(f"evidence rows {n['physical'] + n['genetic']:,}: physical {n['physical']:,}, genetic {n['genetic']:,}")
print(f"distinct pairs {len(by_bg):,}: physical only {sum(v == {'physical'} for v in by_bg.values()):,}, "
      f"genetic only {sum(v == {'genetic'} for v in by_bg.values()):,}, both {sum(len(v) == 2 for v in by_bg.values()):,}")
print(f"the same pairs keyed on Entrez instead: {len(by_entrez):,} ('-' merges unrelated viral proteins)")
print(f"cross-species rows {n['cross-species']:,}; rows with no Entrez id on one side {n['no Entrez on a side']:,}")

# Find TP53's BioGRID id from its Entrez id (7157), never from the symbol.
tp53 = next(f[BG_A] if f[ENTREZ_A] == "7157" else f[BG_B]
            for f in rows(ZIP) if "7157" in (f[ENTREZ_A], f[ENTREZ_B]))
print("TP53, BioGRID id", tp53)
print("  all partners  :", gene_summary(ZIP, tp53))
print("  human partners:", gene_summary(ZIP, tp53, partner_taxa={"9606"}))
```

On 2026-11-19 against 5.0.263 (about 35 seconds):

```
evidence rows 2,964,629: physical 2,074,672, genetic 889,957
distinct pairs 2,306,541: physical only 1,576,472, genetic only 704,258, both 25,811
the same pairs keyed on Entrez instead: 2,294,827 ('-' merges unrelated viral proteins)
cross-species rows 116,904; rows with no Entrez id on one side 7,274
TP53, BioGRID id 113010
  all partners  : {'evidence_rows': {'physical': 5745, 'genetic': 388}, 'partners': {'physical': 2280, 'genetic': 379}, 'partners_any_type': 2590, 'partners_both_types': 69, 'publications': {'physical': 1745, 'genetic': 27}, 'self_interaction': True, 'excluded_rows': 0, 'excluded_top_taxa': {}}
  human partners: {'evidence_rows': {'physical': 5609, 'genetic': 387}, 'partners': {'physical': 2207, 'genetic': 378}, 'partners_any_type': 2516, 'partners_both_types': 69, 'publications': {'physical': 1689, 'genetic': 26}, 'self_interaction': True, 'excluded_rows': 137, 'excluded_top_taxa': {'10090': 32, '333760': 23, '2697049': 18}}
```

Read it this way:

- **Physical and genetic barely overlap.** Of 2.3 million pairs, 25,811 have both kinds of
  evidence. TP53 has 2,280 physical and 379 genetic partners, 69 in common. Adding the two
  partner counts double-counts those 69; a single "interaction count" hides which question
  was asked.
- **Rows inflate.** TP53's 5,745 physical rows are 2,280 partners from 1,745 publications.
  Ranking genes by row count ranks them by how often they were studied with mass spectrometry
  (`Affinity Capture-MS` alone is 1,008,699 rows, 49% of physical evidence).
- **High-throughput dominates.** 2,471,143 rows are `High Throughput`, 479,920 `Low Throughput`
  and 13,566 carry both tags. Filter on `Throughput` when you want curated small-scale work.
- **Self-interactions** (homodimers, 21,992 rows) put the gene in its own partner list;
  `self_interaction` reports it.
- **Choose the partner organism explicitly.** For a human gene, restricting partners to human
  removes few rows (137 of 6,133 for TP53). For a viral protein it removes nearly everything:
  SARS-CoV-2 ORF9b has 1,049 rows, 1,019 of them with partners from another species.

Genetic interaction semantics are in `Experimental System`: `Negative Genetic` and `Synthetic
Lethality` mean the double mutant is sicker than expected, `Positive Genetic` and `Synthetic
Rescue` the opposite. Do not sum them as one "genetic" score — they point in opposite
directions. The `Score` column is `-` on most rows and, where present, its scale depends on
the publication.

**Multi-validated physical (MV) file.** BioGRID's MV file keeps physical rows whose pair is
supported by a second row with a different experimental system, a different publication, or
both (<https://wiki.thebiogrid.org/doku.php/biogrid_mv>). In 5.0.263 it has 568,517 rows over
168,112 distinct pairs — still evidence rows, so deduplicate as above. Recomputing those
criteria from the ALL file does **not** reproduce it: a straightforward reading gave 676,647
rows, with 108,172 extra, nearly all high-throughput. Use BioGRID's file as published rather
than rebuilding it, and say which you used.

## Joining to other sources: Entrez, not symbols

`Official Symbol` is BioGRID's label at build time. Join on `Entrez Gene Interactor A/B` (or
the `SWISS-PROT Accessions` columns for UniProt), and treat the symbol as display text.

```python
import collections, gzip, urllib.request
from biogrid_tab3 import rows, ENTREZ_A, ENTREZ_B, SYMBOL_A, SYMBOL_B, TAX_A, TAX_B

# NCBI's current human gene table (moves daily; record the date you fetched it)
urllib.request.urlretrieve("https://ftp.ncbi.nlm.nih.gov/gene/DATA/GENE_INFO/Mammalia/Homo_sapiens.gene_info.gz",
                           "Homo_sapiens.gene_info.gz")
ncbi, by_symbol = {}, collections.defaultdict(set)
with gzip.open("Homo_sapiens.gene_info.gz", "rt") as fh:
    for line in fh:
        if not line.startswith("#"):
            f = line.split("\t"); ncbi[f[1]] = f[2]; by_symbol[f[2]].add(f[1])

biogrid = {}                                    # Entrez id -> symbol as BioGRID prints it
for f in rows("BIOGRID-ALL-5.0.263.tab3.zip"):
    for e, s, t in ((f[ENTREZ_A], f[SYMBOL_A], f[TAX_A]), (f[ENTREZ_B], f[SYMBOL_B], f[TAX_B])):
        if t == "9606" and e != "-":
            biogrid[e] = s
stale = {e: (s, ncbi[e]) for e, s in biogrid.items() if e in ncbi and ncbi[e] != s}
wrong = {e: (s, sorted(by_symbol[s])) for e, s in biogrid.items() if s in by_symbol and e not in by_symbol[s]}
gone = [e for e in biogrid if e not in ncbi]
print(f"human genes in BioGRID 5.0.263: {len(biogrid):,}")
print(f"  symbol differs from NCBI today: {len(stale):,}, e.g.", list(stale.items())[:4])
print(f"  a symbol join lands on a different NCBI gene: {len(wrong)}, e.g. 7795 ->", wrong.get("7795"))
print(f"  Entrez id no longer in NCBI's human table: {len(gone)}, e.g. {gone[:3]}")
```

On 2026-11-19 (gene_info fetched that day):

```
human genes in BioGRID 5.0.263: 21,096
  symbol differs from NCBI today: 1,620, e.g. [('4677', ('NARS', 'NARS1')), ('51678', ('MPP6', 'PALS2')), ('5859', ('QARS', 'QARS1')), ('4301', ('MLLT4', 'AFDN'))]
  a symbol join lands on a different NCBI gene: 26, e.g. 7795 -> ('MEMO1', ['51072'])
  Entrez id no longer in NCBI's human table: 120, e.g. ['9220', '26148', '11217']
```

A symbol join loses the 1,620 renamed genes and, worse, attaches 26 genes' interactions to
the wrong gene. Entrez 7795 is labelled `MEMO1` in BioGRID; NCBI now calls it `LOC7795`
("methylation modifier for class I HLA") and gives `MEMO1` to Entrez 51072 (mediator of cell
motility 1). Inside BioGRID the two are already ambiguous: both print as `MEMO1` in the human
file. The 120 vanished ids are replaced records — NCBI reports 9220 (TIAF1) as replaced by
399687 — so map them through NCBI's `gene_history` file rather than dropping them.

## REST

**Requires a free BioGRID access key** (register at <https://webservice.thebiogrid.org>). The
key goes in every call as `accesskey=`. Without one:

```bash
# Without a key every endpoint answers 401 with a JSON reason, including /version
for key in "" 00000000000000000000000000000000; do
  curl -sS -w '  -> HTTP %{http_code}\n' \
    "https://webservice.thebiogrid.org/interactions/?searchNames=true&geneList=TP53&taxId=9606&format=count&accesskey=$key"
done
```

On 2026-11-19:

```
{"STATUS":"ERROR","MESSAGES":["Your Access Key is Not Validly Formatted. It must be a 32 character alphanumeric string precisely as provided when you registered. Register again at: https:\/\/webservice.thebiogrid.org"],"TYPE":"UNAUTHORIZED ACCESS"}  -> HTTP 401
{"STATUS":"ERROR","MESSAGES":["Your Access Key is Not Valid. This might be because you have not yet registered, or possibly because your access key was invalidated due to abuse of the API. If you feel this is in error, contact us at biogridadmin@gmail.com. Register again at: https:\/\/webservice.thebiogrid.org"],"TYPE":"UNAUTHORIZED ACCESS"}  -> HTTP 401
```

`/version` without a key does not return JSON: it redirects (`302`) to the service's HTML
home page.

The REST parameters have four traps, all stated in BioGRID's own parameter table
(<https://wiki.thebiogrid.org/doku.php/biogridrest>). They are documented behaviour, **not
verified here** for want of a key:

| parameter | trap |
|---|---|
| `max` | capped at 10,000; a larger value is ignored, not refused. TP53 alone has 6,133 rows in 5.0.263, and a gene list with `includeInteractors` passes 10,000 easily. Ask `format=count` first and page with `start` |
| `geneList` | ignored unless `searchNames`, `searchIds` or `searchSynonyms` is `true` (or `additionalIdentifierTypes` is set). Without one you get the first 10,000 rows of the whole database, ordered by interaction id, not your gene |
| `taxId` | restricts which genes the **query** matches, not the partners. Add `interSpeciesExcluded=true` only if you mean to drop virus–host and other cross-species rows |
| `evidenceList` | **excludes** the listed experimental systems unless `includeEvidence=true` |

`includeInteractors` defaults to `true` (first-order partners are returned, not only edges
within the list). `searchSynonyms` matches old and alias symbols, which is how a query for a
symbol picks up a different gene; prefer `searchIds=true` with Entrez ids. The service reports
its own release at `/version`; check it matches the files you pin.

A paged fetch, for readers with a key (unverified, see above):

```python
import json, os, urllib.parse, urllib.request

KEY = os.environ["BIOGRID_ACCESS_KEY"]           # free, from https://webservice.thebiogrid.org
BASE = "https://webservice.thebiogrid.org/interactions/"
query = {"geneList": "7157", "searchIds": "true",  # Entrez id; geneList is ignored without a search* flag
         "taxId": "9606", "interSpeciesExcluded": "true", "includeInteractors": "true"}

def get(**extra):
    url = BASE + "?" + urllib.parse.urlencode({**query, **extra, "accesskey": KEY})
    req = urllib.request.Request(url, headers={"User-Agent": "heurekaskills-biogrid"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode()

total = int(get(format="count").strip())         # ask how many first
got = {}
for start in range(0, total, 10000):             # max is capped at 10,000 per call, silently
    got.update(json.loads(get(format="json", start=start, max=10000)))
assert len(got) == total, (len(got), total)       # JSON is keyed by BioGRID interaction id
print(f"{total} evidence rows for Entrez 7157 with human partners")
```

For a whole organism or anything above a few thousand rows, use the release files instead:
they are faster, keyless and pinned.

## ORCS — CRISPR screens

ORCS ships one tarball per organism: an index of screens plus one score file per screen.
Human is 718 MB, mouse 55 MB, yeast 3.1 MB, fly 0.7 MB (2.0.18).

```python
import collections, csv, io, tarfile, urllib.request

REL = "2.0.18"                                   # ORCS releases separately from BioGRID
NAME = f"BIOGRID-ORCS-ALL-mus_musculus-{REL}.screens.tar.gz"
req = urllib.request.Request(f"https://downloads.thebiogrid.org/Download/BioGRID-ORCS/Release-Archive/"
                             f"BIOGRID-ORCS-{REL}/{NAME}", headers={"User-Agent": "heurekaskills-biogrid"})
with urllib.request.urlopen(req, timeout=600) as r, open(NAME, "wb") as out:
    out.write(r.read())

def table(member):
    text = io.TextIOWrapper(tar.extractfile(member), encoding="utf-8")
    return list(csv.DictReader(text, delimiter="\t", quoting=csv.QUOTE_NONE))

with tarfile.open(NAME) as tar:
    members = tar.getmembers()
    (index_member,) = [m for m in members if "SCREEN_INDEX" in m.name]
    index = {r["#SCREEN_ID"]: r for r in table(index_member)}
    scores = collections.defaultdict(list)
    for m in members:
        if m is not index_member:
            for r in table(m):
                scores[r["#SCREEN_ID"]].append(r)

for sid, meta in index.items():                  # the index's own counts must match the rows
    assert int(meta["SCORES_SIZE"]) == len(scores[sid])
    assert int(meta["NUMBER_OF_HITS"]) == sum(r["HIT"] == "YES" for r in scores[sid])
partial = [s for s, m in index.items() if m["FULL_SIZE_AVAILABLE"] == "No"]
print(f"ORCS {REL} mouse: {len(index)} screens; {len(partial)} publish only part of what was screened")
m = index[partial[0]]
print(f"  e.g. screen {partial[0]}: {m['SCORES_SIZE']} of {m['FULL_SIZE']} genes in the file, hit rule '{m['SIGNIFICANCE_CRITERIA']}'")
print("  first score column means:", collections.Counter(m["SCORE.1_TYPE"] for m in index.values()).most_common(5))

GENE = "22059"                                   # Trp53, by Entrez id
seen = {s: r for s, rs in scores.items() for r in rs if r["IDENTIFIER_ID"] == GENE}
hits = [s for s, r in seen.items() if r["HIT"] == "YES"]
absent_partial = [s for s in partial if s not in seen]
print(f"Trp53: scored in {len(seen)} screens, a hit in {len(hits)}, "
      f"absent from {len(index) - len(seen)} ({len(absent_partial)} of them partial files, so not 'not a hit')")
```

On 2026-11-19:

```
ORCS 2.0.18 mouse: 205 screens; 32 publish only part of what was screened
  e.g. screen 599: 455 of 2368 genes in the file, hit rule 'Score.3 (FDR) < 0.1'
  first score column means: [('p-Value', 45), ('MaGeCK Score', 33), ('Log2FC', 26), ('Z-score', 22), ('Rank', 13)]
Trp53: scored in 161 screens, a hit in 21, absent from 44 (30 of them partial files, so not 'not a hit')
```

- **A missing gene is not a non-hit.** 32 of 205 mouse screens publish only part of the
  screened genes (`FULL_SIZE_AVAILABLE` = `No`): screen 599 lists 455 of 2,368. A gene absent
  from such a file was not reported, which is different from scoring below threshold.
- **`HIT` is the authors' call under that screen's rule** (`SIGNIFICANCE_CRITERIA`), and the
  score columns mean different things per screen: `SCORE.1_TYPE` is a p-value in 45 mouse
  screens, a MAGeCK score in 33, a log2 fold change in 26, a Z-score in 22, a rank in 13. Never
  compare raw scores across screens; compare `HIT` calls, or re-analyse from the source data.
- **Direction is in the criteria text.** Negative-selection screens mark depletion (essential
  genes) with low scores; positive selection marks resistance with high ones; some screens
  use both. Read `SCREEN_TYPE` and `SIGNIFICANCE_CRITERIA` before calling a gene "essential".
- Genes are identified by `IDENTIFIER_ID` with `IDENTIFIER_TYPE` (`ENTREZ_GENE` in these
  files); join on that, not on `OFFICIAL_SYMBOL`.

## What does not work

| attempt | result (2026-11-19) |
|---|---|
| any REST call without `accesskey` | `401`, JSON `UNAUTHORIZED ACCESS`; `/version` redirects to HTML |
| Python `urllib` with its default `User-Agent` on the download host | `403 Forbidden`; set a `User-Agent` |
| many requests in quick succession to the download host | `429`; fetch each release file once |
| `Range` requests for part of a release file | ignored; the whole file comes back with `200` |
| `curl -f` without `-L` on a release that does not exist | exits 0 with an empty file (`302` to `/Error`) |
| `https://wiki.thebiogrid.org/doku.php/multi-validated_datasets` | "This topic does not exist yet"; the MV page is `biogrid_mv` |
| concatenating ORGANISM files for a whole-database count | double-counts all 116,904 cross-species rows |

Neighbours: `string` for scored functional and physical association networks (STRING
integrates BioGRID among other sources, with its own scores); `ncbi-gene` for Entrez gene
records and history; `uniprot` for the accessions in the `SWISS-PROT` columns; `depmap` for
genome-wide CRISPR dependency data from one uniform pipeline, rather than ORCS's collection of
published screens.

## Try it

**Data.** Three pinned, keyless BioGRID files: the coronavirus subset of release 5.0.263
(`BIOGRID-CORONAVIRUS-5.0.263.tab3.zip`, 4.5 MB), the fly tarball of ORCS 2.0.18 (0.7 MB), and
the REST service's keyless refusal. MIT terms, no account. Reachable on 2026-11-19.

**Run.** Self-contained; Python 3.9+ standard library only; under a minute.

```python
import collections
import csv
import io
import json
import tarfile
import urllib.error
import urllib.request
import zipfile

UA = {"User-Agent": "heurekaskills-biogrid-tryit"}   # the download host refuses Python's default


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        return r.read()


# 1. a pinned release file: the SARS-CoV-2 / coronavirus subset of BioGRID 5.0.263
REL = "5.0.263"
z = zipfile.ZipFile(io.BytesIO(fetch(
    f"https://downloads.thebiogrid.org/Download/BioGRID/Release-Archive/BIOGRID-{REL}/"
    f"BIOGRID-CORONAVIRUS-{REL}.tab3.zip")))
(name,) = z.namelist()
lines = z.read(name).decode().splitlines()
header, rows = lines[0].split("\t"), [l.split("\t") for l in lines[1:]]
assert header[0] == "#BioGRID Interaction ID" and header[12] == "Experimental System Type"
print("release file       :", name, f"{len(rows):,} evidence rows", dict(collections.Counter(r[12] for r in rows)))

# 2. rows are evidence, not interactions; pairs keyed on Entrez lose proteins that have none
by_bg = {frozenset((r[3], r[4])) for r in rows}
by_entrez = {frozenset((r[1], r[2])) for r in rows}
no_entrez = sum("-" in (r[1], r[2]) for r in rows)
assert len(rows) > len(by_bg) > len(by_entrez) and no_entrez > 0
print("distinct pairs     :", f"{len(by_bg):,} by BioGRID id, {len(by_entrez):,} by Entrez id "
      f"({no_entrez:,} rows have no Entrez id on one side)")

# 3. an organism filter on 'both sides in one taxon' deletes the virus-host interactions
orf9b = "4383874"                      # BioGRID id; this viral protein has no Entrez id to key on
mine = [r for r in rows if orf9b in (r[3], r[4])]
assert {r[7] if r[3] == orf9b else r[8] for r in mine} == {"ORF9b"}
same = [r for r in mine if r[15] == r[16]]
assert len(mine) - len(same) > len(same)
print("SARS-CoV-2 ORF9b   :", f"{len(mine):,} rows, {len(same):,} with a same-species partner, "
      f"{len({r[4] if r[3] == orf9b else r[3] for r in mine}):,} distinct partners")

# 4. ORCS screen files agree with their own index; a hit is whatever each screen's rule says
ORCS = "2.0.18"
tar = tarfile.open(fileobj=io.BytesIO(fetch(
    f"https://downloads.thebiogrid.org/Download/BioGRID-ORCS/Release-Archive/BIOGRID-ORCS-{ORCS}/"
    f"BIOGRID-ORCS-ALL-drosophila_melanogaster-{ORCS}.screens.tar.gz")))
tables = {m.name: list(csv.DictReader(io.TextIOWrapper(tar.extractfile(m), encoding="utf-8"),
                                       delimiter="\t", quoting=csv.QUOTE_NONE)) for m in tar.getmembers()}
(index,) = [t for n, t in tables.items() if "SCREEN_INDEX" in n]
per_screen = collections.defaultdict(list)
for n, t in tables.items():
    if "SCREEN_INDEX" not in n:
        for r in t:
            per_screen[r["#SCREEN_ID"]].append(r)
for s in index:
    got = per_screen[s["#SCREEN_ID"]]
    assert int(s["SCORES_SIZE"]) == len(got)
    assert int(s["NUMBER_OF_HITS"]) == sum(r["HIT"] == "YES" for r in got)
print("ORCS", ORCS, "fly     :", [(s["#SCREEN_ID"], s["SCORES_SIZE"], s["NUMBER_OF_HITS"],
                                   s["SIGNIFICANCE_CRITERIA"]) for s in index])

# 5. the REST service needs a key; without one it answers 401 with a JSON reason
try:
    fetch("https://webservice.thebiogrid.org/interactions/?format=count&accesskey=")
    raise AssertionError("REST answered without a key")
except urllib.error.HTTPError as e:
    body = json.loads(e.read())
    assert e.code == 401 and body["STATUS"] == "ERROR"
    print("REST without a key :", e.code, body["TYPE"])
```

**Expect**

Invariants — a failure means the skill is wrong:

- The zip holds one TAB 3.0 file whose column 13 is `Experimental System Type`.
- Evidence rows outnumber distinct BioGRID-id pairs, which outnumber the same pairs keyed on
  Entrez, because some viral proteins have no Entrez id.
- SARS-CoV-2 ORF9b (BioGRID id 4383874) has more cross-species rows than same-species ones:
  a "both sides in one organism" filter would discard most of it.
- Every ORCS screen file has exactly `SCORES_SIZE` rows and `NUMBER_OF_HITS` rows marked `YES`.
- The REST service without a key answers `401` with `STATUS` `ERROR`.

Observed on 2026-11-19 against 5.0.263 and ORCS 2.0.18 — counts grow with each release, so a
mismatch is drift to investigate:

```
release file       : BIOGRID-CORONAVIRUS-5.0.263.tab3.txt 80,413 evidence rows {'physical': 80410, 'genetic': 3}
distinct pairs     : 56,700 by BioGRID id, 47,052 by Entrez id (3,943 rows have no Entrez id on one side)
SARS-CoV-2 ORF9b   : 1,049 rows, 30 with a same-species partner, 666 distinct partners
ORCS 2.0.18 fly     : [('633', '13651', '1235', 'Score.1 (Z-score) < -3.99'), ('634', '3942', '91', 'Score.1 (Z-score) < -10.0 OR Score.1 (Z-score) > 10.0'), ('636', '3942', '27', 'Score.1 (Z-score) < -10.0 OR Score.1 (Z-score) > 10.0')]
REST without a key : 401 UNAUTHORIZED ACCESS
```

## Sources

- BioGRID — https://thebiogrid.org ; downloads — https://downloads.thebiogrid.org/BioGRID/
- File formats — https://wiki.thebiogrid.org/doku.php/downloads ; TAB 3.0 —
  https://wiki.thebiogrid.org/doku.php/biogrid_tab_version_3.0
- REST service — https://wiki.thebiogrid.org/doku.php/biogridrest
- Terms — https://wiki.thebiogrid.org/doku.php/terms_and_conditions
- BioGRID ORCS — https://orcs.thebiogrid.org ; downloads — https://downloads.thebiogrid.org/BioGRID-ORCS/
- Oughtred et al. (2021) The BioGRID database: a comprehensive biomedical resource of curated
  protein, genetic, and chemical interactions. *Protein Science* 30, 187–200 —
  https://doi.org/10.1002/pro.3978
- Oughtred et al. (2019) The BioGRID interaction database: 2019 update. *Nucleic Acids
  Research* 47, D529–D541 — https://doi.org/10.1093/nar/gky1079
- Stark et al. (2006) BioGRID: a general repository for interaction datasets. *Nucleic Acids
  Research* 34, D535–D539 — https://doi.org/10.1093/nar/gkj109
