---
name: gene-ontology
description: Get Gene Ontology terms, the is_a/part_of/regulates graph and GO annotations for UniProt proteins from pinned GO releases and QuickGO — evidence codes, NOT and other qualifiers, propagation up the graph, obsolete and merged terms.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, gene-ontology, uniprot]
covers: [gene ontology, go, go term, go annotation, go-basic, gaf, gpad, quickgo, goa, uniprot, molecular function, biological process, cellular component, evidence code, iea, electronic annotation, not qualifier, contributes_to, colocalizes_with, is_a, part_of, regulates, true path rule, annotation propagation, obsolete term, alt_id, zenodo, human, mouse, yeast]
papers: [doi:10.1038/75556, doi:10.1093/nar/gkaf1292, PMID:19744993]
access: [open]
datasets: [https://release.geneontology.org/2026-08-05/ontology/go-basic.obo, https://release.geneontology.org/2026-08-05/annotations/gaf/HUMAN-uniprot.gaf.gz, https://release.geneontology.org/2026-08-05/metadata/release-archive-doi.json, "https://www.ebi.ac.uk/QuickGO/services/annotation/search?geneProductId=P04637&limit=1"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-15
  against: GO release 2026-08-05 (ontology data-version 2026-07-26, Zenodo 10.5281/zenodo.21844811) / QuickGO REST live 2026-11-15 / Python 3.12 standard library only / curl 8 / macOS arm64
  executed: 11
  unverified: 0
---

# Gene Ontology — terms, graph and annotations

The Gene Ontology (GO) is two things that are released together and read separately:

- **the ontology** — about 38,000 current terms in three aspects (molecular function, biological
  process, cellular component), joined by `is_a`, `part_of` and `regulates` edges;
- **the annotations** — statements that a gene product *enables*, is *involved in*, or is
  *located in* a term, each with an evidence code, a reference and a qualifier.

This skill gets both onto disk from a pinned release and reads them correctly: which file carries
which relations, how to walk the graph, what the qualifiers do (`NOT` inverts the statement), how
much of any count is electronic (`IEA`), and what obsolete and merged GO ids turn into. It also
covers QuickGO, EMBL-EBI's GO annotation service, for single-protein lookups and filtered
downloads, and its limits.

Everything is keyed on **GO ids** (`GO:0006915`) and **UniProt accessions** (GAF column 2), never
on a term name or a gene symbol.

Neighbours: `uniprot` resolves secondary and deleted accessions before you look one up here;
`interpro` owns the InterPro2GO domain-to-term mapping; `reactome` is the pathway view of the same
proteins; `open-targets` uses GO as one of its target annotations; `pathway-enrichment` runs
enrichment tests over GO gene sets once you have them.

## Licence

From the GO citation policy, <https://geneontology.org/docs/go-citation-policy/>, read 2026-11-15:

> Gene Ontology Consortium data and data products are licensed under the Creative Commons
> Attribution 4.0 Unported License.

The same page asks that a citation name the release date (e.g. "2024-01-17") and optionally its
Zenodo DOI, and cite Ashburner et al. 2000 and the current GO knowledgebase paper. QuickGO is
served under the EMBL-EBI terms of use; the GOA files on the EBI FTP carry their own notice that
they "may be copied and redistributed freely, without advance permission, provided that this
copyright statement is reproduced". No account or key is needed anywhere in this skill.

## Pin a release, not "current"

A GO release is a directory named by its date on `release.geneontology.org`, archived as a whole
on Zenodo with its own DOI. `current.geneontology.org` is whichever release is newest. Three
things about dates trip people:

- **The ontology inside a release carries an earlier date.** Release `2026-08-05` ships a
  `go-basic.obo` whose header says `data-version: releases/2026-07-26`. The PURL built from that
  data-version, `http://purl.obolibrary.org/obo/go/releases/2026-07-26/go-basic.obo`, redirects to
  `release.geneontology.org/2026-07-26/…` and answers **404** — there is no such release
  directory. Pin and cite the **directory** date and its DOI; record the data-version beside it.
- **Each annotation file carries its own ontology version.** In the same release,
  `HUMAN-uniprot.gaf.gz` says `go-version … 2026-07-26` and `MOUSE-mod.gaf.gz` says `2026-08-02`.
  Check annotation GO ids against the ontology you load (the Try it does).
- **`metadata/release-date.json` is not JSON** — it reads `{date: 2026-08-05}` with an unquoted
  key and `json.loads` raises. Read `metadata/date.txt` instead.

```bash
REL=2026-08-05
curl -s https://current.geneontology.org/metadata/date.txt; echo "  <- current today"
curl -s https://release.geneontology.org/$REL/metadata/date.txt; echo "  <- the pin"
curl -s https://release.geneontology.org/$REL/metadata/release-archive-doi.json
curl -s https://zenodo.org/api/records/21844811 | python3 -c "
import json, sys; d = json.load(sys.stdin)
print(d['doi'], '|', d['metadata']['title'], d['metadata']['version'], '|',
      d['metadata']['license']['id'], '| concept DOI', d['conceptdoi'])
print([(f['key'], f['size']) for f in d['files']])"
```

On 2026-11-15:

```
2026-08-05  <- current today
2026-08-05  <- the pin
{
  "doi": "10.5281/zenodo.21844811"
}
10.5281/zenodo.21844811 | Gene Ontology Data Archive 2026-08-05 | cc-by-4.0 | concept DOI 10.5281/zenodo.1205166
[('go-release-archive.tgz', 1340419512)]
```

The concept DOI `10.5281/zenodo.1205166` always resolves to the newest archive, so it is not a pin.
Releases in 2026 so far: 01-23, 03-25, 05-19, 06-19, 08-05 — roughly every two months, so
"current" moves under any analysis that runs longer than that.

**`current/` keeps stale files from older layouts.** The release file layout changed between
`2026-05-19` and `2026-06-19`: `annotations/goa_human.gaf.gz` became
`annotations/gaf/HUMAN-uniprot.gaf.gz`. `current.geneontology.org/annotations/goa_human.gaf.gz`
still answers 200 — it is the May file (last modified 2026-05-28, scheduled to expire 2027-05-29),
and 162 of its rows point at terms that are obsolete in the current ontology. Every script that
hard-codes the old name keeps "working" on three-month-old data. On `release.*` the old name in a
new release is a plain 404, which is one more reason to read from a pinned release.

## Which file carries what

### Ontology: go-basic.obo, not go.obo, for propagation

Both files hold the same 48,340 `[Term]` stanzas (38,092 current, 10,248 obsolete). They differ in
edges. Counted in release 2026-08-05:

| relationship | go-basic.obo | go.obo |
|---|---|---|
| `is_a` | 57,456 | 57,456 |
| `part_of` | 6,270 | 7,058 |
| `regulates` / `positively_regulates` / `negatively_regulates` | 2,820 / 2,475 / 2,475 | 2,939 / 2,627 / 2,624 |
| `has_part` | — | 743 |
| `occurs_in` | — | 173 |
| `happens_during`, `ends_during` | — | 13, 1 |
| edges that cross aspects | **0** | 1,365 (786 are molecular function `part_of` biological process) |

`go-basic.obo` is the file GO describes as safe for propagation: acyclic, no edges between the
three aspects. Propagating over `go.obo`'s `part_of` moves molecular-function annotations into
biological process, and `has_part` points the wrong way for propagation altogether. Use `go.obo`
when you want those relations to read, not to roll annotations up.

`go-basic.json` (5 MB gzipped) carries the same content as OBO-graphs JSON if you prefer it; this
skill parses the OBO because it is line-oriented and needs nothing installed.

### Annotations: GAF, GPAD + GPI, and two files per model organism

Under `annotations/` each release has `gaf/`, `gpad/` and `gpi/`, one file per species or source:
193 GAFs in 2026-08-05. Names follow the UniProt species mnemonic:

| file | keyed on | notes |
|---|---|---|
| `gaf/HUMAN-uniprot.gaf.gz` | UniProtKB accession | 910,476 rows, 38,902 objects (19,776 proteins, plus RNAcentral and ComplexPortal ids) |
| `gaf/MOUSE-mod.gaf.gz` | MGI id | the mouse database's own file; 714,894 rows |
| `gaf/MOUSE-uniprot.gaf.gz` | UniProtKB accession | the same biology keyed for UniProt; 716,911 rows |
| `gaf/YEAST-mod.gaf.gz` / `gaf/YEAST-uniprot.gaf.gz` | SGD id / UniProtKB | 142,056 / 137,564 rows |
| `gpad/*.gpad.gz` + `gpi/*.gpi.gz` | prefixed CURIE (`UniProtKB:P04637`) | GPAD 2.0: relations as RO ids, `NOT` in its own column, evidence as ECO only |

Organisms with their own model-organism database — 21 in 2026-08-05, among them mouse, rat,
budding and fission yeast, zebrafish, Xenopus, Arabidopsis, worm, fly, Dictyostelium, E. coli and
several Candida — have **both** a `-mod` and a `-uniprot` file. Pick by the
identifier you will join on, not by which is bigger. There is no `HUMAN-mod`.

The whole-UniProt files named in `annotations/README.txt` (`filtered_goa_uniprot_all*.gaf.gz`)
are not in the 2026-08-05 release (404); the last ones are in `2026-05-19`, at 10.9 GB. The
continuously updated EBI GOA files (`https://ftp.ebi.ac.uk/pub/databases/GO/goa/`, e.g.
`HUMAN/goa_human.gaf.gz`, last modified 2026-11-04) change between GO releases and are not a
release: use them only if you record their own date.

## The helper

Every block below imports this. Standard library only. Save it as `go_tools.py`.

```python
# go_tools.py
import gzip, json, os, shutil, time, urllib.error, urllib.parse, urllib.request

RELEASE = "2026-08-05"                     # the release DIRECTORY date; the .obo inside says 2026-07-26
BASE = f"https://release.geneontology.org/{RELEASE}"
QUICKGO = "https://www.ebi.ac.uk/QuickGO/services"
TRUE_PATH = ("is_a", "part_of")            # the closure GO defines; regulates is a separate choice
REGULATES = ("regulates", "positively_regulates", "negatively_regulates")


UA = {"User-Agent": "go-tools/1.0"}           # Python's default User-Agent gets a Cloudflare 403


def download(url, dest):
    """Fetch once to disk. A missing file answers 404 on release.*, 403 on current.*"""
    if not os.path.exists(dest):
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r, \
                open(dest + ".part", "wb") as out:
            shutil.copyfileobj(r, out)
        os.replace(dest + ".part", dest)
    return dest


def load_obo(path):
    """[Term] stanzas of go-basic.obo -> {'version', 'terms', 'alt', 'kids'}."""
    terms, alt, version, cur = {}, {}, None, None
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if line.startswith("data-version: "):
                version = line.split(": ", 1)[1]
            if line.startswith("["):        # [Typedef] stanzas also carry id: and is_a: lines
                cur = {"edges": [], "obsolete": False, "replaced_by": [], "consider": [],
                       "alt_ids": []} if line == "[Term]" else None
                continue
            if cur is None or ": " not in line:
                continue
            key, val = line.split(": ", 1)
            if key == "id":
                cur["id"] = val
                terms[val] = cur
            elif key in ("name", "namespace"):
                cur[key] = val
            elif key == "is_a":
                cur["edges"].append(("is_a", val.split()[0]))
            elif key == "relationship":
                rel, parent = val.split()[:2]
                cur["edges"].append((rel, parent))
            elif key == "is_obsolete" and val == "true":
                cur["obsolete"] = True
            elif key in ("replaced_by", "consider"):
                cur[key].append(val.split()[0])
            elif key == "alt_id":
                cur["alt_ids"].append(val)
                alt[val] = cur["id"]
    kids = {}
    for tid, t in terms.items():
        for rel, parent in t["edges"]:
            kids.setdefault(parent, []).append((rel, tid))
    return {"version": version, "terms": terms, "alt": alt, "kids": kids}


def resolve(onto, go_id):
    """-> (current GO id or None, why). Never picks among several 'consider' terms for you."""
    if go_id in onto["alt"]:
        return onto["alt"][go_id], "alt_id of a merged term"
    t = onto["terms"].get(go_id)
    if t is None:
        return None, "not in this release"
    if not t["obsolete"]:
        return go_id, "current"
    if t["replaced_by"]:
        return resolve(onto, t["replaced_by"][0])[0], "obsolete, replaced_by"
    return None, "obsolete, consider " + (",".join(t["consider"]) or "nothing")


def _walk(start, step):
    seen, stack = {start}, [start]
    while stack:
        for nxt in step(stack.pop()):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen


def ancestors(onto, go_id, rels=TRUE_PATH):
    """go_id plus every term above it over rels."""
    return _walk(go_id, lambda t: [p for r, p in onto["terms"][t]["edges"] if r in rels])


def descendants(onto, go_id, rels=TRUE_PATH):
    """go_id plus every term below it over rels."""
    return _walk(go_id, lambda t: [k for r, k in onto["kids"].get(t, []) if r in rels])


GAF = ["db", "acc", "symbol", "qualifier", "go_id", "reference", "evidence", "with_from",
       "aspect", "name", "synonyms", "type", "taxon", "date", "assigned_by", "extension", "form"]


def read_gaf(path, accessions=None):
    """GAF 2.2 rows as dicts; `accessions` filters on DB_Object_ID (column 2)."""
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("!"):
                continue
            row = dict(zip(GAF, line.rstrip("\n").split("\t")))
            if accessions is None or row["acc"] in accessions:
                row["negated"] = row["qualifier"].startswith("NOT|")
                yield row


def propagate(onto, rows, rels=TRUE_PATH):
    """Positive rows go UP the graph, NOT rows go DOWN. -> (positive, negative) term -> evidence."""
    pos, neg = {}, {}
    for r in rows:
        hits = descendants if r["negated"] else ancestors
        for t in hits(onto, r["go_id"], rels):
            (neg if r["negated"] else pos).setdefault(t, set()).add(
                (r["qualifier"], r["evidence"], r["reference"]))
    return pos, neg


def quickgo(path, accept="application/json", **params):
    """One QuickGO call. A 400 carries the reason in 'messages'; 5xx is retried."""
    url = f"{QUICKGO}/{path}?" + urllib.parse.urlencode(params, safe=",:")
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={**UA, "Accept": accept})
            with urllib.request.urlopen(req, timeout=300) as r:
                body = r.read().decode("utf-8")
                return json.loads(body) if accept == "application/json" else body
        except urllib.error.HTTPError as e:
            if e.code >= 500 and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"QuickGO {e.code}: {e.read().decode('utf-8', 'replace')[:300]}") from None


def annotations(**params):
    """Every page of annotation/search. pageInfo.total counts PAGES, not rows."""
    params["limit"] = 200                                   # 201 is a 400
    first = quickgo("annotation/search", page=1, **params)
    if first["numberOfHits"] > 200 * 10000:                 # page 10001 is a 400
        raise ValueError(f"{first['numberOfHits']:,} hits is past the page cap; use a GAF")
    rows = first["results"]
    for page in range(2, first["pageInfo"]["total"] + 1):
        rows += quickgo("annotation/search", page=page, **params)["results"]
    if len({r["id"] for r in rows}) != first["numberOfHits"]:
        raise RuntimeError(f"{len(rows)} rows for {first['numberOfHits']} hits: the set moved mid-walk")
    return rows
```

## Terms: obsolete, replaced_by, consider and alt_id

A GO id never disappears; it changes state. Of the 48,340 term stanzas in 2026-08-05, 10,248 are
obsolete: 2,232 name one `replaced_by` term (safe to remap automatically), 2,191 name only
`consider` terms (a curator's suggestions — choosing one is a judgement about *your* annotation),
and 5,825 name neither. Separately, 3,646 `alt_id`s are ids of terms that were **merged** into
another; the merged-away id is not a stanza of its own, only a line inside the survivor.

```python
import go_tools as g

obo = g.download(f"{g.BASE}/ontology/go-basic.obo", "go-basic.obo")       # 32 MB
onto = g.load_obo(obo)
print(onto["version"], len(onto["terms"]), "term stanzas")
for go_id in ["GO:0006915", "GO:0000003", "GO:0000005", "GO:0072422", "GO:0000004", "GO:9999999"]:
    now, why = g.resolve(onto, go_id)
    name = onto["terms"][now]["name"] if now else ""
    print(f"{go_id} -> {now} ({why}) {name}")
```

```
releases/2026-07-26 48340 term stanzas
GO:0006915 -> GO:0006915 (current) apoptotic process
GO:0000003 -> GO:0022414 (obsolete, replaced_by) reproductive process
GO:0000005 -> None (obsolete, consider GO:0042254,GO:0044183,GO:0140309) 
GO:0072422 -> GO:0000077 (alt_id of a merged term) DNA damage checkpoint signaling
GO:0000004 -> GO:0008150 (alt_id of a merged term) biological_process
GO:9999999 -> None (not in this release) 
```

Resolve every GO id that came from somewhere else — a paper's supplement, an older GAF, a gene
set library — before you query or count with it. QuickGO treats these ids inconsistently (see
*QuickGO* below), and a GAF from a newer release can carry ids your ontology has never seen.

**Term names are not keys.** Obsolete terms are renamed `obsolete …`, merged terms keep only the
survivor's name, and a name can change between releases while its id does not. QuickGO's `ontology/go/search?query=`
finds ids from text (7,104 hits for "apoptotic process"), which is a starting point for a human,
not a join.

## Annotations for a protein

GAF 2.2 has 17 tab-separated columns. The ones that change the meaning of a row:

| col | field | read it as |
|---|---|---|
| 2 | DB_Object_ID | the key. UniProt accession in `*-uniprot` files, MGI/SGD/… id in `*-mod` files |
| 4 | Qualifier | the relation, and whether it is negated: `enables`, `NOT\|enables`, `contributes_to`, `colocalizes_with`, … |
| 5 | GO ID | the term |
| 7 | Evidence | three-letter code: `IDA`, `IMP`, `IPI`, `IBA`, `IEA`, … |
| 8 | With/From | for `IPI`, the interacting partner; for `IEA`, the rule or signature |
| 15 | Assigned_By | the group that made the call (`UniProt`, `GO_Central`, `InterPro`, `Ensembl`, …) |
| 17 | Gene_Product_Form_ID | an isoform (`UniProtKB:P04637-2`) when the statement is about one isoform only |

**`NOT` inverts the row.** `NOT|enables GO:0070330` says the protein has been shown *not* to have
that activity. Read only columns 2 and 5 — which is what a "gene → GO terms" table does — and a
negative finding becomes a positive one. Human 2026-08-05 has 1,497 `NOT` rows; 1,034 of the
1,373 distinct protein–term pairs have no positive row on the same term, so a qualifier-blind
reader adds a false positive for each. Positive and negative rows can also coexist on one term
when papers disagree:

```python
import go_tools as g
from collections import Counter

gaf = g.download(f"{g.BASE}/annotations/gaf/HUMAN-uniprot.gaf.gz", "HUMAN-uniprot.gaf.gz")   # 12 MB
tp53 = list(g.read_gaf(gaf, {"P04637"}))
print("TP53 rows:", len(tp53), "| distinct terms:", len({r["go_id"] for r in tp53}))
print("qualifiers:", Counter(r["qualifier"] for r in tp53).most_common())
print("evidence:  ", Counter(r["evidence"] for r in tp53).most_common(6))
print("isoform-only rows (column 17):", Counter(r["form"] for r in tp53 if r["form"] != "UniProtKB:P04637"))

for r in g.read_gaf(gaf, {"A0A087X1C5"}):                    # CYP2D7
    if r["go_id"] == "GO:0070330":                           # aromatase activity
        print(r["symbol"], r["qualifier"], r["go_id"], r["evidence"], r["reference"])
```

```
TP53 rows: 1068 | distinct terms: 131
qualifiers: [('enables', 676), ('located_in', 222), ('involved_in', 146), ('acts_upstream_of_or_within', 10), ('part_of', 7), ('is_active_in', 3), ('acts_upstream_of', 2), ('acts_upstream_of_negative_effect', 1), ('colocalizes_with', 1)]
evidence:   [('IPI', 616), ('IDA', 158), ('TAS', 136), ('IEA', 52), ('IMP', 51), ('EXP', 17)]
isoform-only rows (column 17): Counter({'UniProtKB:P04637-2': 4, 'UniProtKB:P04637-7': 4, 'UniProtKB:P04637-4': 4, 'UniProtKB:P04637-1': 2, 'UniProtKB:P04637-3': 2, 'UniProtKB:P04637-8': 2, 'UniProtKB:P04637-9': 1})
CYP2D7 NOT|enables GO:0070330 IDA PMID:18838503
CYP2D7 enables GO:0070330 IDA PMID:15051713
```

CYP2D7 has two direct-assay papers that disagree about aromatase activity. A table that drops
column 4 shows "aromatase activity, IDA" twice and calls it well supported.

The other qualifiers do not invert, but they are weaker than the default relation and should
travel with the row, not be collapsed into it:

- `contributes_to` (1,617 human rows) — the protein is a subunit of a complex that has the
  activity; it may not have it alone.
- `colocalizes_with` (1,364) — found *with* the component, not established as *in* it.
- `acts_upstream_of…` (seven variants) — the protein affects the process without being shown to
  be part of it.
- `part_of` as a qualifier means "subunit of this complex" and is unrelated to the `part_of`
  ontology edge of the same name.

`IPI` rows (616 of TP53's 1,068) are mostly `enables GO:0005515` "protein binding" (569), one row
per interacting partner in column 8, so raw row counts measure how many interaction papers exist,
not how much is known about function. Count distinct terms, by evidence, instead.

## Propagating annotations up the graph

GO's rule: a **positive** annotation to a term implies every ancestor over `is_a` and `part_of`
(a protein that enables "protein kinase activity" enables "catalytic activity"). A **`NOT`**
annotation goes the other way — it implies every **descendant** (not a kinase means not a tyrosine
kinase). `regulates` is not part of that rule: an annotation to "positive regulation of apoptotic
process" does not mean the protein is involved in apoptosis itself, and adding `regulates` to the
closure is a choice to say so in the methods.

```python
import go_tools as g

onto = g.load_obo(g.download(f"{g.BASE}/ontology/go-basic.obo", "go-basic.obo"))
gaf = g.download(f"{g.BASE}/annotations/gaf/HUMAN-uniprot.gaf.gz", "HUMAN-uniprot.gaf.gz")
rows = list(g.read_gaf(gaf, {"P04637"}))

pos, neg = g.propagate(onto, rows)
pos_reg, _ = g.propagate(onto, rows, g.TRUE_PATH + g.REGULATES)
print("direct terms:", len({r["go_id"] for r in rows}),
      "| is_a+part_of closure:", len(pos), "| with regulates:", len(pos_reg), "| NOT closure:", len(neg))

# the local closure matches QuickGO's own, term by term
term = "GO:0043065"                           # positive regulation of apoptotic process
remote = g.quickgo(f"ontology/go/terms/{term}/ancestors", relations="is_a,part_of")["results"][0]["ancestors"]
print(term, "QuickGO", len(remote), "local", len(g.ancestors(onto, term)), set(remote) == g.ancestors(onto, term))
```

```
direct terms: 131 | is_a+part_of closure: 457 | with regulates: 509 | NOT closure: 0
GO:0043065 QuickGO 10 local 10 True
```

Each propagated term keeps the set of `(qualifier, evidence, reference)` that reached it, so a
filter applied after propagation (drop `IEA`, drop `colocalizes_with`) is still possible. Filter
evidence **before** you propagate if the question is "experimentally supported", because one
experimental leaf supports every ancestor, and an `IEA` leaf removed first supports none of them.

**QuickGO's default does include `regulates`.** `goId=` defaults to `goUsage=descendants`, and the
default relation set gives the same count as `is_a,part_of,regulates`. Asking for human
annotations "to apoptotic process" (`GO:0006915`), measured 2026-11-15:

| request | hits |
|---|---|
| `goId=GO:0006915` (defaults) | 6,409 |
| `…&goUsage=descendants&goUsageRelationships=is_a,part_of` | 1,975 |
| `…&goUsage=exact` | 825 |

The default answer is 3.2 times the true-path answer, most of it proteins that regulate apoptosis.
Always pass `goUsage` and `goUsageRelationships` explicitly.

## Evidence codes and how much is electronic

`IEA` (inferred from electronic annotation — mappings from InterPro, UniProt keywords, EC numbers,
Ensembl orthology) is assigned by pipeline with no curator reading the protein. It is most of
GO by row count, and how much depends on where you read:

| population (2026-11-15, QuickGO unless stated) | all | IEA | share |
|---|---|---|---|
| everything in QuickGO | 513,439,710 | 506,710,232 | 98.7% |
| human (taxon 9606) | 1,529,065 | 811,047 | 53% |
| cow (9913) | 445,004 | 341,963 | 77% |
| zebrafish (7955) | 473,330 | 309,459 | 65% |
| mouse (10090) | 924,273 | 409,659 | 44% |
| `HUMAN-uniprot.gaf.gz`, release 2026-08-05 | 910,476 | 196,546 | 22% |

The release GAF covers 19,776 human proteins, about one accession per gene, while QuickGO's taxon filter covers every UniProtKB entry including unreviewed ones, which are
annotated almost entirely by pipeline. In QuickGO, the IEA filter is
`evidenceCode=ECO:0000501&evidenceCodeUsage=descendants`; the GO-code parameter `goEvidence=IEA`
is **ignored without error** and returns the unfiltered count.

A gene set built from "all annotations" in a poorly studied organism is mostly a projection of
sequence similarity, and an enrichment against it measures the annotation pipeline. State which
evidence you kept.

## QuickGO

`https://www.ebi.ac.uk/QuickGO/services` — no account. The parts that matter:

| endpoint | use |
|---|---|
| `annotation/search` | JSON, paged: `limit` ≤ 200, `page` ≤ 10,000 (so 2,000,000 rows at most) |
| `annotation/downloadSearch` | TSV, GAF or GPAD by `Accept` header; `downloadLimit` ≤ 2,000,000, **default 10,000** |
| `ontology/go/terms/{ids}` and `…/complete` | term records; `complete` adds `replacements` and `secondaryIds` |
| `ontology/go/terms/{id}/ancestors?relations=` | closure, including the term itself |

Measured behaviour, 2026-11-15:

```python
import go_tools as g

def hits(**p):
    p.setdefault("limit", 1)
    try:
        return g.quickgo("annotation/search", **p)["numberOfHits"]
    except RuntimeError as e:                        # QuickGO's 400 says what was wrong
        return str(e).split('"messages":')[-1][:90]

print("P04637            ", hits(geneProductId="P04637"))
print("P04637-2 isoform  ", hits(geneProductId="P04637-2"))
print("Q15086 secondary  ", hits(geneProductId="Q15086"))
print("TP53 symbol       ", hits(geneProductId="TP53"))
print("MGI:98834         ", hits(geneProductId="MGI:98834"))
print("alt_id, exact     ", hits(goId="GO:0072422", goUsage="exact", taxonId=9606))
print("primary, exact    ", hits(goId="GO:0000077", goUsage="exact", taxonId=9606))
print("misspelt filter   ", hits(taxonId=9606, goEvidnce="IEA"), "| unfiltered", hits(taxonId=9606))
print("limit=201         ", hits(geneProductId="P04637", limit=201))
print("page=10001        ", hits(taxonId=9606, page=10001))
print("501 ids           ", hits(geneProductId=",".join(["P04637"] * 501)))
p = g.quickgo("annotation/search", geneProductId="P04637", limit=200)
print("pageInfo", p["pageInfo"], "| goName without includeFields:", p["results"][0]["goName"])
t = g.quickgo("ontology/go/terms/GO:0000003,GO:0000005,GO:0072422/complete")
print(t["numberOfHits"], "of 3:", [(r["id"], r["isObsolete"], r.get("replacements")) for r in t["results"]])
```

```
P04637             1043
P04637-2 isoform   0
Q15086 secondary   0
TP53 symbol        ["The 'Gene Product ID' parameter contains invalid values: TP53"]}
MGI:98834          ["The 'Gene Product ID' parameter contains invalid values: MGI:98834"]}
alt_id, exact      0
primary, exact     149
misspelt filter    1529065 | unfiltered 1529065
limit=201          ["Number of entries per page cannot be more than 200 but found: 201"]}
page=10001         ["Page number cannot be greater than 10000, but found: 10001"]}
501 ids            ["Number of items in 'Gene Product ID' is larger than: 500"]}
pageInfo {'resultsPerPage': 200, 'current': 1, 'total': 6} | goName without includeFields: None
3 of 3: [('GO:0000005', True, [{'id': 'GO:0042254', 'type': 'consider'}, {'id': 'GO:0044183', 'type': 'consider'}, {'id': 'GO:0140309', 'type': 'consider'}]), ('GO:0000003', True, [{'id': 'GO:0022414', 'type': 'replaced_by'}]), ('GO:0000077', False, None)]
```

What to take from it:

- **Zero is not "unannotated".** An isoform (`P04637-2`), a secondary accession (`Q15086`, merged
  into `P04637`) and a GO `alt_id` under `goUsage=exact` all answer `200` with 0 hits. Resolve
  accessions through `uniprot` and GO ids through `resolve()` first; read isoform-level statements
  from GAF column 17.
- **QuickGO keys only on UniProtKB, RNAcentral and ComplexPortal ids.** MGI, SGD and other
  model-organism ids are a 400; for those, read the `-mod` GAF. Gene symbols are a 400 too.
- **A misspelt parameter is ignored, not rejected.** `goEvidnce=IEA` (or the real-looking
  `goEvidence=IEA`) returns the unfiltered 1.5 million. Check that a filter moved the count.
- **`pageInfo.total` is the number of pages** (6 for TP53's 1,043 rows at 200 a page), not rows;
  `numberOfHits` is the row count. `annotations()` in the helper walks the pages and checks that
  the unique row ids add up.
- **Names are off by default** — `goName` is `null` unless you pass `includeFields=goName`.
- **Term lookups substitute a merged id silently.** Asking `ontology/go/terms` for `GO:0072422`
  returns the record for `GO:0000077`, under that id; match results back through `secondaryIds`,
  not by position.
- Negated qualifiers contain a literal `|`, e.g. `qualifier=NOT|enables`. Unencoded, it is an HTML
  `400` from the web server; encode it as `%7C` (550 human hits).

The download endpoint returns files, not JSON, and **truncates at 10,000 rows without saying so**
unless you pass `downloadLimit`:

```bash
Q=https://www.ebi.ac.uk/QuickGO/services/annotation/downloadSearch
F='taxonId=9606&goId=GO:0005739&goUsage=exact'                       # human, "mitochondrion"
curl -s "https://www.ebi.ac.uk/QuickGO/services/annotation/search?$F&limit=1" | python3 -c "import json,sys; print('hits', json.load(sys.stdin)['numberOfHits'])"
curl -s -H 'Accept: text/tsv' "$Q?$F" | tail -n +2 | wc -l                       # default: silently 10,000
curl -s -H 'Accept: text/tsv' "$Q?$F&downloadLimit=2000000" | tail -n +2 | wc -l  # all of them
curl -s -H 'Accept: text/gaf' "$Q?geneProductId=P04637&downloadLimit=3" | grep -v '^!' | cut -f1-7
curl -s -o /dev/null -w 'Accept: application/json -> %{http_code}\n' -H 'Accept: application/json' "$Q?geneProductId=P04637"
curl -s -o /dev/null -w 'unencoded NOT|enables -> %{http_code}\n' "https://www.ebi.ac.uk/QuickGO/services/annotation/search?taxonId=9606&qualifier=NOT|enables"
curl -s "https://www.ebi.ac.uk/QuickGO/services/annotation/search?taxonId=9606&qualifier=NOT%7Cenables&limit=1" | python3 -c "import json,sys; print('NOT%7Cenables hits', json.load(sys.stdin)['numberOfHits'])"
```

```
hits 10108
   10000
   10108
UniProtKB	P04637	TP53	acts_upstream_of	GO:0008285	PMID:30514107	ISS
UniProtKB	P04637	TP53	acts_upstream_of	GO:0051726	PMID:30514107	ISS
UniProtKB	P04637	TP53	acts_upstream_of_negative_effect	GO:1902749	PMID:10962037	IMP
Accept: application/json -> 406
unencoded NOT|enables -> 400
NOT%7Cenables hits 550
```

`Accept` picks the format: `text/tsv`, `text/gaf` (GAF 2.2) or `text/gpad`; JSON is `406`. The GAF
header names the ontology and ECO versions QuickGO used that day, and the filter URL. Above
2,000,000 rows (`downloadLimit=2000001` is a 400) use the release files.

**QuickGO is live; a release is fixed.** For the same protein they differ: TP53 has 1,068 rows in
the 2026-08-05 GAF and 1,043 in QuickGO on 2026-11-15; APP (`P05067`) has 1,140 and 835. Part of
that is three months of curation, part is that QuickGO answers for the accession while 416 of
APP's GAF rows are about one isoform or one processed chain (amyloid-beta and others) in
column 17. Do not mix rows from the two in one count.

## Joining across sources: ids, never symbols

GO files from different sources describe the same gene under different keys — a UniProt
accession, an MGI id, an SGD id — and each carries a symbol in column 3. Joining on the symbol
looks free and is wrong in both directions. The GPI file that ships beside each GAF holds the
cross-reference (column 10) to join on instead:

```python
import gzip
import go_tools as g

gpi = g.download(f"{g.BASE}/annotations/gpi/MOUSE-mod.gpi.gz", "MOUSE-mod.gpi.gz")             # 2 MB
mod = g.download(f"{g.BASE}/annotations/gaf/MOUSE-mod.gaf.gz", "MOUSE-mod.gaf.gz")             # 11 MB
uni = g.download(f"{g.BASE}/annotations/gaf/MOUSE-uniprot.gaf.gz", "MOUSE-uniprot.gaf.gz")     # 10 MB

# GPI 2.0: column 1 is the MGI CURIE, column 10 its cross-references, UniProtKB among them
mgi2uniprot = {}
with gzip.open(gpi, "rt") as fh:
    for line in fh:
        if not line.startswith("!"):
            c = line.rstrip("\n").split("\t")
            mgi2uniprot[c[0].removeprefix("MGI:")] = {x.split(":", 1)[1] for x in c[9].split("|")
                                                     if x.startswith("UniProtKB:")}
by_symbol = {}
for r in g.read_gaf(uni):
    if r["db"] == "UniProtKB":
        by_symbol.setdefault(r["symbol"], set()).add(r["acc"])

genes = {(r["acc"], r["symbol"]) for r in g.read_gaf(mod) if r["db"] == "MGI"}
wrong = []
for mgi, sym in sorted(genes):
    ids, label = mgi2uniprot.get(mgi, set()), by_symbol.get(sym, set())
    if ids and label and not ids & label:
        wrong.append((mgi, sym, sorted(ids), sorted(label)))
print(len(genes), "MGI genes; symbol join hands", len(wrong), "of them a different protein:")
for w in wrong:
    print("  ", w)
```

```
27765 MGI genes; symbol join hands 4 of them a different protein:
   ('MGI:2145969', 'Ugt3a1', ['Q8JZZ0'], ['Q3UP75'])
   ('MGI:2146055', 'Ugt3a2', ['Q3UP75'], ['Q8JZZ0'])
   ('MGI:2442435', 'Gprasp3', ['Q3UME2'], ['Q6PB60'])
   ('MGI:2442797', 'Cd200r1l', ['Q8BTP3'], ['Q6XJV6'])
```

`Ugt3a1` and `Ugt3a2` are swapped: the mouse database and UniProt give the two symbols to opposite
proteins, while both agree on the ids (UniProt's own entry `Q8JZZ0` cross-references
`MGI:2145969`). A symbol join gives each gene its paralogue's annotations, and nothing looks
wrong. The same pass found 1,530 MGI genes whose symbol is not in the UniProt file at all, and 35
where it matches a different set of accessions. The 4 is small; the point is that the symbol
join cannot tell you which 4.

The same rule holds on the GO side: join on GO ids, expanded through `descendants()` when the
question is "annotated to X or anything more specific", never on term-name text. `interpro`
measures what a label match does to a domain-to-GO join (23 of 23 false positives on one domain).

## Get the files

Two routes, depending on whether the question needs a fixed release or today's annotations.

**A pinned release** — the ontology, one or more species' GAF and GPI, a manifest that records the
release, DOI, sizes, checksums and the ontology version each file says it was built against, and a
propagated, experimental-evidence-only table for a list of proteins:

```python
import csv, gzip, hashlib, json, os
import go_tools as g

SPECIES = ["HUMAN-uniprot"]                       # e.g. add "MOUSE-mod", "YEAST-uniprot"
OUT = f"go-{g.RELEASE}"
os.makedirs(OUT, exist_ok=True)

files = {"ontology/go-basic.obo": f"{OUT}/go-basic.obo"}
for sp in SPECIES:
    files[f"annotations/gaf/{sp}.gaf.gz"] = f"{OUT}/{sp}.gaf.gz"
    files[f"annotations/gpi/{sp}.gpi.gz"] = f"{OUT}/{sp}.gpi.gz"

def header(path):
    """The !-lines that say which ontology each file was built against."""
    op = gzip.open if path.endswith(".gz") else open
    with op(path, "rt", encoding="utf-8") as fh:
        return [l.strip() for l, _ in zip(fh, range(40))
                if l.startswith(("data-version", "!gaf-version", "!gpi-version", "!go-version", "!date-generated"))]

with open(g.download(f"{g.BASE}/metadata/release-archive-doi.json", f"{OUT}/doi.json")) as fh:
    doi = json.load(fh)["doi"]
manifest = {"release": g.RELEASE, "zenodo_doi": doi, "licence": "CC BY 4.0", "files": []}
for rel, dest in files.items():
    g.download(f"{g.BASE}/{rel}", dest)
    sha = hashlib.sha256(open(dest, "rb").read()).hexdigest()
    manifest["files"].append({"url": f"{g.BASE}/{rel}", "path": dest, "bytes": os.path.getsize(dest),
                              "sha256": sha, "header": header(dest)})
json.dump(manifest, open(f"{OUT}/MANIFEST.json", "w"), indent=1)

# Propagated, evidence-filtered annotation table for the proteins you care about
onto = g.load_obo(f"{OUT}/go-basic.obo")
ACCS = {"P04637", "P38398", "P00533"}                   # TP53, BRCA1, EGFR
EXPERIMENTAL = {"EXP", "IDA", "IPI", "IMP", "IGI", "IEP", "HTP", "HDA", "HMP", "HGI", "HEP"}
rows = [r for r in g.read_gaf(f"{OUT}/HUMAN-uniprot.gaf.gz", ACCS) if r["evidence"] in EXPERIMENTAL]
with open(f"{OUT}/experimental_propagated.tsv", "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["uniprot", "go_id", "go_name", "aspect", "polarity", "direct", "qualifiers", "evidence", "references"])
    for acc in sorted(ACCS):
        mine = [r for r in rows if r["acc"] == acc]
        direct = {r["go_id"] for r in mine}
        pos, neg = g.propagate(onto, mine)
        for polarity, closure in (("positive", pos), ("NOT", neg)):
            for go_id, ev in sorted(closure.items()):
                t = onto["terms"][go_id]
                w.writerow([acc, go_id, t["name"], t["namespace"], polarity, go_id in direct,
                            "|".join(sorted({q for q, _, _ in ev})), "|".join(sorted({e for _, e, _ in ev})),
                            "|".join(sorted({ref for _, _, ref in ev}))])
print(json.dumps({k: v for k, v in manifest.items() if k != "files"}))
for f in manifest["files"]:
    print(f["path"], f["bytes"], f["sha256"][:12], f["header"])
print(sum(1 for _ in open(f"{OUT}/experimental_propagated.tsv")) - 1, "rows in experimental_propagated.tsv")
```

```
{"release": "2026-08-05", "zenodo_doi": "10.5281/zenodo.21844811", "licence": "CC BY 4.0"}
go-2026-08-05/go-basic.obo 32227785 b08d45b268b8 ['data-version: releases/2026-07-26']
go-2026-08-05/HUMAN-uniprot.gaf.gz 12109254 a0afba19dfb1 ['!gaf-version: 2.2', '!date-generated: 2026-07-28 19:42', '!go-version: http://purl.obolibrary.org/obo/go/releases/2026-07-26/extensions/go-plus.ofn']
go-2026-08-05/HUMAN-uniprot.gpi.gz 9897023 2aad49b7eddf ['!gpi-version: 2.0', '!date-generated: 2026-07-28 22:03']
957 rows in experimental_propagated.tsv
```

The table keeps one row per protein and term, `positive` or `NOT`, with `direct` marking terms
that were annotated rather than inherited, and the qualifiers, evidence codes and references that
reached each term. The experimental set is the GO experimental and high-throughput codes; the
phylogenetic (`IBA`), sequence-similarity (`ISS`…), author/curator (`TAS`, `NAS`, `IC`) and `IEA`
codes are left out on purpose — widen `EXPERIMENTAL` if your question allows them, and say so.
For other organisms, change `SPECIES` and the key: a `-mod` file is keyed on the organism
database's id.

**Today's annotations for a set of proteins** — QuickGO's download, with the limit stated so it
cannot truncate, written as GAF. 500 accessions per request at most:

```bash
curl -s -H 'Accept: text/gaf' -o tp53_brca1_egfr.quickgo.gaf \
  "https://www.ebi.ac.uk/QuickGO/services/annotation/downloadSearch?geneProductId=P04637,P38398,P00533&downloadLimit=2000000"
grep -m3 '^!' tp53_brca1_egfr.quickgo.gaf; grep -vc '^!' tp53_brca1_egfr.quickgo.gaf
curl -s "https://www.ebi.ac.uk/QuickGO/services/annotation/search?geneProductId=P04637,P38398,P00533&limit=1" \
  | python3 -c "import json,sys; print('numberOfHits', json.load(sys.stdin)['numberOfHits'])"
```

```
!gaf-version: 2.2
!Project_name: EBI GO Annotation program (GOA)
!URL: https://www.ebi.ac.uk/GOA
2333
numberOfHits 2333
```

The row count matching `numberOfHits` is the check that nothing was cut. Record the download
date; this file is not reproducible later.

## What does not work

| what | what happens | instead |
|---|---|---|
| Python's default User-Agent on `release.` / `current.geneontology.org` | Cloudflare `403`, body `error code: 1010` | send any other User-Agent (the helper does) |
| `current.geneontology.org/annotations/goa_human.gaf.gz` | `200`, but it is the 2026-05 file left over from the old layout | `annotations/gaf/HUMAN-uniprot.gaf.gz` in a pinned release |
| a missing file on `current.` | `403` (S3), not `404` | treat 403 there as "no such file" |
| `purl.obolibrary.org/obo/go/releases/<data-version>/go-basic.obo` | redirects to a release directory that does not exist, `404` | the release-directory date |
| `metadata/release-date.json` | not valid JSON (`{date: 2026-08-05}`) | `metadata/date.txt` |
| `filtered_goa_uniprot_all*.gaf.gz` named in `annotations/README.txt` | `404` in 2026-08-05 | per-species files, or the EBI GOA FTP with its own date |
| QuickGO `geneProductId=` with an isoform, a secondary accession, or a symbol | `0` hits, `0` hits, `400` | resolve first; isoforms are in GAF column 17 |
| QuickGO `goId=` with a GO `alt_id` and `goUsage=exact` | `0` hits | `resolve()` to the primary id |
| QuickGO `goId=` alone | includes `regulates` descendants (6,409 vs 1,975 for apoptosis) | pass `goUsage` and `goUsageRelationships` |
| QuickGO `goEvidence=` (or any misspelt filter) | ignored, full count returned | `evidenceCode=ECO:…&evidenceCodeUsage=descendants` |
| QuickGO `downloadSearch` without `downloadLimit` | stops at 10,000 rows, no warning | `downloadLimit=2000000` and compare to `numberOfHits` |
| QuickGO `downloadSearch` with `Accept: application/json` | `406` | `annotation/search` for JSON |
| propagating over `go.obo` | molecular-function terms leak into biological process; `has_part` points the wrong way | `go-basic.obo` |

## Try it

**Data.** Gene Ontology release 2026-08-05 (Zenodo `10.5281/zenodo.21844811`, CC BY 4.0):
`go-basic.obo` (32 MB) and the human UniProt GAF `HUMAN-uniprot.gaf.gz` (12 MB), read from
`release.geneontology.org`, plus live QuickGO calls. No account. Confirmed reachable 2026-11-15.

**Run.** In a fresh directory; standard library only.

```python
import gzip, json, os, urllib.error, urllib.parse, urllib.request
from collections import Counter

REL = "2026-08-05"
BASE = f"https://release.geneontology.org/{REL}"
QG = "https://www.ebi.ac.uk/QuickGO/services"
UA = {"User-Agent": "go-tryit/1.0"}             # the default Python User-Agent is refused (403)

def get(url, accept="*/*"):
    req = urllib.request.Request(url, headers={**UA, "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def fetch(name, url):
    if not os.path.exists(name):
        code, body = get(url)
        assert code == 200, (url, code)
        open(name, "wb").write(body)
    return name

def qg(path, **p):
    code, body = get(f"{QG}/{path}?" + urllib.parse.urlencode(p, safe=",:"), "application/json")
    return code, json.loads(body)

# 1. the pin: directory date, DOI, and the ontology's own (different) data-version
assert get(f"{BASE}/metadata/date.txt")[1].decode().strip() == REL
doi = json.loads(get(f"{BASE}/metadata/release-archive-doi.json")[1])["doi"]
print("release", REL, "doi", doi)

# 2. ontology: go-basic.obo
terms, alt, cur, version, tid = {}, {}, None, None, None
for line in open(fetch("go-basic.obo", f"{BASE}/ontology/go-basic.obo"), encoding="utf-8"):
    line = line.rstrip("\n")
    if line.startswith("data-version: "):
        version = line[14:]
    if line.startswith("["):
        cur = {"edges": [], "obs": False, "rb": []} if line == "[Term]" else None
        continue
    if cur is None or ": " not in line:
        continue
    k, v = line.split(": ", 1)
    if k == "id": tid = v; terms[v] = cur
    elif k == "namespace": cur["ns"] = v
    elif k == "is_a": cur["edges"].append(("is_a", v.split()[0]))
    elif k == "relationship": cur["edges"].append(tuple(v.split()[:2]))
    elif k == "is_obsolete": cur["obs"] = True
    elif k == "replaced_by": cur["rb"].append(v)
    elif k == "alt_id": alt[v] = tid
rels = Counter(r for d in terms.values() for r, _ in d["edges"])
cross = sum(1 for d in terms.values() for r, p in d["edges"] if terms[p]["ns"] != d["ns"])
print("data-version", version, "| terms", len(terms), "| obsolete", sum(d["obs"] for d in terms.values()),
      "| alt_ids", len(alt), "| edges", dict(rels), "| cross-aspect", cross)
assert set(rels) == {"is_a", "part_of", "regulates", "positively_regulates", "negatively_regulates"}
assert cross == 0
assert terms["GO:0000003"]["obs"] and terms["GO:0000003"]["rb"] == ["GO:0022414"]
assert alt["GO:0072422"] == "GO:0000077" and "GO:0072422" not in terms

def up(t, use=("is_a", "part_of")):
    seen, stack = {t}, [t]
    while stack:
        for r, p in terms[stack.pop()]["edges"]:
            if r in use and p not in seen:
                seen.add(p); stack.append(p)
    return seen

# 3. the local closure equals QuickGO's
code, d = qg("ontology/go/terms/GO:0043065/ancestors", relations="is_a,part_of")
assert code == 200 and set(d["results"][0]["ancestors"]) == up("GO:0043065")
print("GO:0043065 ancestors over is_a+part_of:", len(up("GO:0043065")), "== QuickGO")

# 4. annotations: every GO id in the release GAF is current in the release ontology; NOT is a qualifier
gaf = fetch("HUMAN-uniprot.gaf.gz", f"{BASE}/annotations/gaf/HUMAN-uniprot.gaf.gz")
state, qual, ev, tp53, cyp = Counter(), Counter(), Counter(), [], []
with gzip.open(gaf, "rt", encoding="utf-8") as fh:
    for line in fh:
        if line[0] == "!":
            continue
        c = line.rstrip("\n").split("\t")
        assert len(c) == 17
        state["alt_id" if c[4] in alt else "absent" if c[4] not in terms
              else "obsolete" if terms[c[4]]["obs"] else "current"] += 1
        qual["NOT" if c[3].startswith("NOT|") else "positive"] += 1
        ev[c[6]] += 1
        if c[1] == "P04637": tp53.append(c)
        if c[1] == "A0A087X1C5" and c[4] == "GO:0070330": cyp.append((c[3], c[6], c[5]))
rows = sum(state.values())
print("GAF rows", rows, dict(state), dict(qual), f"| IEA {ev['IEA'] / rows:.1%}")
assert set(state) == {"current"}
print("CYP2D7 aromatase activity:", sorted(cyp))
assert {q for q, _, _ in cyp} == {"enables", "NOT|enables"}

# 5. propagation: positive rows up over is_a+part_of; regulates is an opt-in
pos = [c for c in tp53 if not c[3].startswith("NOT|")]
closure = set().union(*(up(c[4]) for c in pos))
closure_reg = set().union(*(up(c[4], ("is_a", "part_of", "regulates", "positively_regulates",
                                       "negatively_regulates")) for c in pos))
print("TP53 rows", len(tp53), "| direct terms", len({c[4] for c in pos}),
      "| closure", len(closure), "| with regulates", len(closure_reg))
assert {c[4] for c in pos} <= closure < closure_reg

# 6. QuickGO limits and defaults
n = lambda **p: qg("annotation/search", limit=1, **p)[1]["numberOfHits"]
default = n(taxonId=9606, goId="GO:0006915")
truepath = n(taxonId=9606, goId="GO:0006915", goUsage="descendants", goUsageRelationships="is_a,part_of")
print("human 'apoptotic process': default", default, "| is_a+part_of", truepath)
assert default > truepath
assert qg("annotation/search", geneProductId="P04637", limit=201)[0] == 400
assert n(goId="GO:0072422", goUsage="exact", taxonId=9606) == 0          # alt_id: silently nothing
assert n(geneProductId="P04637-2") == 0                                    # isoforms live in GAF col 17
hits = n(taxonId=9606, goId="GO:0005739", goUsage="exact")
code, tsv = get(f"{QG}/annotation/downloadSearch?taxonId=9606&goId=GO:0005739&goUsage=exact", "text/tsv")
got = len(tsv.decode().splitlines()) - 1
print("mitochondrion: hits", hits, "| downloadSearch without downloadLimit returned", got)
assert got == min(hits, 10000)

# 7. the pre-June file name is gone from the release
assert get(f"{BASE}/annotations/goa_human.gaf.gz")[0] == 404
print("ok")
```

**Expect**

Invariants — these hold for any release, and a failure means the skill is wrong:

- `go-basic.obo` has exactly the five relations `is_a`, `part_of`, `regulates`,
  `positively_regulates`, `negatively_regulates`, and **no edge crosses aspects** — the property
  that makes it safe to propagate over.
- An obsolete term is still a stanza (`GO:0000003`, with its `replaced_by`); a merged id is not
  (`GO:0072422` exists only as an `alt_id` of `GO:0000077`).
- The local `is_a`+`part_of` closure of a term equals QuickGO's `ancestors` for the same relations.
- Every GAF row has 17 columns, and every GO id in a release GAF is a current term in that
  release's ontology.
- `NOT` lives in the qualifier column; a positive and a negative row can sit on the same protein
  and term (CYP2D7, aromatase activity, two IDA papers).
- Adding `regulates` to the closure strictly grows it; QuickGO's default `goId` search returns more
  than the `is_a,part_of` search.
- QuickGO: `limit=201` is a 400; an `alt_id` under `exact` and an isoform accession return 0;
  `downloadSearch` without `downloadLimit` returns `min(numberOfHits, 10000)` rows.
- The pre-June-2026 file name is a 404 inside a release.

Observed 2026-11-15 against release 2026-08-05 and live QuickGO — these move with each release
and with QuickGO's continuous updates, so a mismatch is drift to investigate, not a failure:

```
release 2026-08-05 doi 10.5281/zenodo.21844811
data-version releases/2026-07-26 | terms 48340 | obsolete 10248 | alt_ids 3646 | edges {'is_a': 57456, 'part_of': 6270, 'regulates': 2820, 'negatively_regulates': 2475, 'positively_regulates': 2475} | cross-aspect 0
GO:0043065 ancestors over is_a+part_of: 10 == QuickGO
GAF rows 910476 {'current': 910476} {'positive': 908979, 'NOT': 1497} | IEA 21.6%
CYP2D7 aromatase activity: [('NOT|enables', 'IDA', 'PMID:18838503'), ('enables', 'IDA', 'PMID:15051713')]
TP53 rows 1068 | direct terms 131 | closure 457 | with regulates 509
human 'apoptotic process': default 6409 | is_a+part_of 1975
mitochondrion: hits 10108 | downloadSearch without downloadLimit returned 10000
ok
```

Runs in about 20 to 30 seconds on a fast connection, most of it the two downloads.

## Sources

- Gene Ontology downloads — https://geneontology.org/docs/download-ontology/ and
  https://geneontology.org/docs/download-go-annotations/
- Release archive — https://release.geneontology.org/ ; current release — https://current.geneontology.org/
- GAF 2.2 format — https://geneontology.org/docs/go-annotation-file-gaf-format-2.2/
- Annotation qualifiers and the NOT modifier — https://geneontology.org/docs/go-annotations/
- Citation policy and licence — https://geneontology.org/docs/go-citation-policy/
- QuickGO — https://www.ebi.ac.uk/QuickGO/ ; EBI GOA files — https://ftp.ebi.ac.uk/pub/databases/GO/goa/
- Ashburner et al. (2000) Gene Ontology: tool for the unification of biology. *Nature Genetics*
  25, 25-29 — https://doi.org/10.1038/75556
- The Gene Ontology Consortium (2025) The Gene Ontology knowledgebase in 2026. *Nucleic Acids
  Research* — https://doi.org/10.1093/nar/gkaf1292
- Binns et al. (2009) QuickGO: a web-based tool for Gene Ontology searching. *Bioinformatics* 25,
  3045-3046 — PMID 19744993

Cite the release you used by date and Zenodo DOI, e.g. "Gene Ontology release 2026-08-05,
doi:10.5281/zenodo.21844811".
