---
name: vmh
description: Retrieve the Virtual Metabolic Human (VMH) human reconstruction (Recon3.1 JSON, Recon3D files) and VMH metabolite, reaction and gene records through its public API — rate-limited, with gene and metabolite ids resolved for joins.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [metabolic-modeling, public-data, metabolites]
covers: [vmh, virtual metabolic human, recon3d, recon3.1, recon, human metabolic reconstruction, genome-scale metabolic model, gem, metabolic network, gene-protein-reaction, gpr, stoichiometry, metabolite, reaction, subsystem, chebi, hmdb, kegg, inchikey, metanetx, hgnc, entrez, sparql, inborn errors of metabolism, cobra json, human, homo sapiens]
papers: [PMID:30371894, PMID:29457794]
access: [open]
datasets: ['https://www.vmh.life/api/public/getHumanReconstruction?type=recon_x', 'https://www.vmh.life/api/public/getRxnHandler?id=HEX1', 'https://www.vmh.life/api/public/getMetHandler?id=glc_D', 'https://www.vmh.life/api/public/getGeneHandler?id=PKM', 'https://www.vmh.life/api/reconstructionFiles?download=Recon%2F3D.01%2FRecon3DModel_301.mat']
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-12
  against: VMH public API (OpenAPI 1.0.0, VMH release 2026-09-18) / Recon3.1 JSON via getHumanReconstruction / Recon3DModel_301.mat and Recon3D.zip from the VMH download area / Python 3.12 standard library for every API and JSON block / cobra 0.32.1 and scipy 1.18.1 for the Recon3D block / every block run in page order in one fresh directory including the 404 and unknown-id error paths, and Try it run again alone in a fresh mktemp directory
  executed: 8
  unverified: 0
---
# VMH — the Virtual Metabolic Human

VMH is the knowledge base behind the Recon line of human metabolic reconstructions, run by the
Thiele and Fleming labs. It connects the human reconstruction to curated metabolite, reaction
and gene records, inherited metabolic diseases, gut-microbe reconstructions (AGORA2), foods
and diets. This page covers the human side: getting the reconstruction onto disk, and looking
up the records behind its ids so they can be joined to other sources **by identifier**.

What it is not:

- **Not flux analysis.** Recon3.1 arrives as COBRA-style JSON and Recon3D as COBRA `.mat`;
  load either in COBRApy and follow the `cobrapy` skill for FBA, knockouts and media.
- **Not the structural walk-through.** Hubs, currency metabolites, branch points and GPR
  semantics (isozymes, complexes, precedence) are worked through for Human-GEM in
  `human-gem`; the same reasoning applies here, and this page only adds what differs in
  VMH's files.

## Access and licence

No account and no key for anything below. VMH's FAQ entry "Can I use VMH data commercially?
(terms of use)", at https://www.vmh.life/general/Faq, says:

> VMH content is freely available for academic and research use; please cite the appropriate
> resources (see How to cite). VMH's own curated content is published under CC BY 4.0.
> Integrated data sources carry their own licences, and some restrict redistribution or
> commercial use.

So the reconstruction and VMH's curated records are CC BY 4.0, and **fields that VMH carries
from other sources keep those sources' terms**. The FAQ names food composition values (each
source's own terms, one not publicly served), DrugCentral drug-target and adverse-event data
(CC BY-SA 4.0) and OMIM, Orphanet and HPO identifiers. If you redistribute any of those fields,
check the source. The "Disclaimer: For research purposes only" footer on every page is a
medical disclaimer — VMH is not a clinical tool — not a licence term.

**Use VMH's copy, not BiGG's.** Recon3D is also on the legacy BiGG site, and that copy is
non-commercial: https://bigg.ucsd.edu/license says "BiGG is freely available for non-commercial
use", and https://bigg.bio/about keeps legacy content under a licence that "permits educational,
research and non-profit use. Commercial use of that content requires a separate agreement."
Nothing on this page uses BiGG.

**Rate limit.** Without a key, the API allows **100 requests per hour per IP**. The docs say
"each endpoint", but on 2026-11-12 every endpoint decremented one shared counter, reported in
the `x-ratelimit-remaining` and `x-ratelimit-reset` (Unix time) headers. Over the limit it
answers `429`. Keys that lift the limit need an account role granted by VMH. Treat the hour as
a budget: whole-model work goes through the downloads, never a loop of single-record calls.

## A client that respects the limit

Two things every call needs, both learned by failing: **a `User-Agent` header** — VMH sits
behind Cloudflare, which refuses Python's default one with `403` and the body `error code:
1010` — and **a check of the remaining budget before the next call**. The API also returns an
occasional `502` from Cloudflare with a plain-text body; one retry clears it.

```python
import json, time, urllib.error, urllib.parse, urllib.request

BASE = "https://www.vmh.life/api/public"
HEADERS = {"User-Agent": "vmh-research-client/1.0"}   # the default Python-urllib agent gets 403 / 1010
RESERVE = 5                                            # stop this many calls short of the hourly limit
_budget = {"remaining": None, "reset": None}

def vmh(endpoint, data=None, **params):
    """GET (or POST with `data`) one VMH endpoint. Returns parsed JSON, text, or None on 404."""
    if _budget["remaining"] is not None and _budget["remaining"] <= RESERVE:
        wait = max(0, _budget["reset"] - time.time())
        raise RuntimeError(f"VMH budget: {_budget['remaining']} calls left; resets in {wait / 60:.0f} min. "
                           "Use the downloads or one SPARQL query instead of more single calls.")
    url = f"{BASE}/{endpoint}" + ("?" + urllib.parse.urlencode(params) if params else "")
    for attempt in (1, 2):
        req = urllib.request.Request(url, data=data, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                code, hdr, body = r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            code, hdr, body = e.code, e.headers, e.read()
        if code == 502 and attempt == 1:
            time.sleep(5)
            continue
        break
    if hdr.get("x-ratelimit-remaining") is not None:
        _budget.update(remaining=int(hdr["x-ratelimit-remaining"]), reset=int(hdr["x-ratelimit-reset"]))
    if code == 404:
        return None
    if code == 429:
        raise RuntimeError(f"VMH rate limit hit; resets at {hdr.get('x-ratelimit-reset')} (Unix time)")
    if code != 200:
        raise RuntimeError(f"{endpoint} {params}: HTTP {code}: {body[:200]!r}")
    return json.loads(body) if "json" in hdr.get("content-type", "") else body.decode()

rec = vmh("getRxnHandler", id="HEX1")
print(rec["rxnData"][0]["formula"], "| calls left this hour:", _budget["remaining"])
print("unknown id ->", vmh("getRxnHandler", id="NOT_A_REACTION"))
```

A `404` comes back as JSON with an `error` message, so the client turns it into `None`; anything
else unexpected raises with the body attached.

## Get the files

The human reconstruction is two things in VMH, and they are not the same model:

| | Recon3.1 | Recon3D (model) |
|---|---|---|
| route | `GET /api/public/getHumanReconstruction?type=recon_x` (counts against the hourly limit) | `/api/reconstructionFiles?download=Recon/3D.01/Recon3DModel_301.mat` (a file download; no rate-limit headers) |
| format | COBRA-style JSON, about 4.4 MB | COBRA Toolbox `.mat` |
| reactions / metabolites / genes | 14,208 / 8,889 / 3,292 | 10,600 / 5,835 / 2,248 |
| metabolite id | `glc_D_c` | `glc_D[c]` |
| gene id in GPR rules | **HGNC symbol** (`HK1`) | **Entrez gene id plus transcript** (`3098.1`) |
| objective | none set | `biomass_maintenance` |

Recon3.1 is VMH's current human reconstruction; Recon3D (2017, Brunk et al. 2018) is the
published one, and `Recon/3D.01/` holds its `301` revision. The download area also has Recon 2,
2.02, 2.03 and 2.04 and the original `Recon/3D/Recon3D.zip`. **Name which one you used** — the
reaction sets differ, and a result on one does not transfer by default.

VMH publishes no tagged releases. `GET /api/release` reports the database release date
(`2026-09-18` on 2026-11-12), so the pin is that date plus the file checksums, written into a
manifest:

```python
import hashlib, json, os, urllib.parse, urllib.request
from datetime import date

OUT = "Data/vmh"
os.makedirs(OUT, exist_ok=True)

def download(url, dest, min_bytes):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as fh:
        fh.write(r.read())
    size = os.path.getsize(dest)
    # a Cloudflare 502 can arrive as a 16-byte "error code: 502" body; never keep it as a model file
    if size < min_bytes:
        raise RuntimeError(f"{dest}: only {size} bytes: {open(dest, 'rb').read(80)!r}")
    with open(dest, "rb") as fh:
        return {"file": os.path.basename(dest), "url": url, "bytes": size,
                "sha256": hashlib.sha256(fh.read()).hexdigest()}

release = json.load(urllib.request.urlopen(
    urllib.request.Request("https://www.vmh.life/api/release", headers=HEADERS), timeout=60))
files = [
    download(f"{BASE}/getHumanReconstruction?type=recon_x", f"{OUT}/Recon3.1.json", 1_000_000),
    download("https://www.vmh.life/api/reconstructionFiles?download="
             + urllib.parse.quote("Recon/3D.01/Recon3DModel_301.mat", safe=""),
             f"{OUT}/Recon3DModel_301.mat", 1_000_000),
]
with open(f"{OUT}/manifest.json", "w") as fh:
    json.dump({"source": "Virtual Metabolic Human", "vmh_release": release["release"],
               "retrieved": date.today().isoformat(), "license": "CC-BY-4.0 (VMH curated content)",
               "files": files}, fh, indent=2)
for f in files:
    print(f"{f['file']:24} {f['bytes']:>10,} bytes  sha256 {f['sha256'][:12]}")
print("VMH release", release["release"])
```

Run 2026-11-12: `Recon3.1.json` 4,422,060 B and `Recon3DModel_301.mat` 1,513,886 B. The Recon3.1
call is one request against the hour; the `.mat` is not counted.

To browse the download area, `GET /api/reconstructionFiles?path=Recon` lists folders and files
as JSON (`path=Recon/3D.01` lists that revision). The whole AGORA2 microbe collection sits beside
it at about 17.7 GB.

## Read Recon3.1

The JSON is COBRA's own layout — `reactions`, `metabolites`, `genes`, `compartments` — so it
loads with the standard library, and with `cobra.io.load_json_model` when you want flux.

```python
import json
from collections import Counter

recon = json.load(open("Data/vmh/Recon3.1.json"))
R, M, G = recon["reactions"], recon["metabolites"], recon["genes"]
comps = {c["id"]: c["name"] for c in recon["compartments"]}
print(recon["id"], len(R), "reactions,", len(M), "metabolites,", len(G), "genes")
print(comps)

# A metabolite id is <VMH abbreviation>_<compartment>; split on the LAST underscore,
# because abbreviations contain underscores themselves (glc_D, 10fthf5glu).
abbr = {m["id"]: m["id"].rsplit("_", 1)[0] for m in M}
assert all(m["id"].rsplit("_", 1)[1] == m["compartment"] and m["compartment"] in comps for m in M)
print("compartment-aware", len(M), "| collapsed", len(set(abbr.values())))
print("reactions with a GPR:", sum(bool(r.get("gene_reaction_rule")) for r in R),
      "| objective set:", any(r.get("objective_coefficient") for r in R),
      "| no subsystem:", [r["id"] for r in R if not r.get("subsystem")])
```

v2026-09-18: 14,208 reactions, 8,889 metabolites (4,223 once compartments are collapsed), 3,292
genes, nine compartments; 7,761 reactions carry a GPR, and `NM_6`, `NM_7` and `NCAMt` have no
subsystem.

Three things to know before reusing Human-GEM habits on this file:

- **No objective is set.** `cobra.io.load_json_model` loads it with an empty objective, and
  `slim_optimize()` returns `0.0` without complaint. Set the biomass reaction you mean before any
  FBA; the Recon3D `.mat` does carry `biomass_maintenance`.
- **The letter `i` means a different place.** Here it is *Intermembrane space, mitochondrion*;
  in Human-GEM `i` is *Inner mitochondria*. Map letters through each file's own compartment
  table before comparing models.
- **Collapse on the abbreviation.** `glc_D_c` and `glc_D_e` are one chemical species,
  `glc_D`, and that abbreviation is the key every VMH record uses.
- **Reaction ids keep brackets where metabolite ids do not.** 1,899 reaction ids carry a
  bracketed compartment, such as the exchange `EX_glc_D[e]`, while the metabolite it exchanges is
  `glc_D_e`. Use the reaction id exactly as given; `getRxnHandler` accepts it in that form.

## GPR rules in VMH files — write a tokenizer

The rules mean what they mean everywhere (`and` a complex, `or` isozymes, `and` binding tighter;
see `human-gem` for the semantics). What differs is the spelling, and both files defeat the
shortcut of handing the rule to Python's parser:

- **Recon3.1 mixes `or`/`and` with `OR`/`AND`** — 338 uppercase operators in v2026-09-18 — and
  **14 gene symbols contain a hyphen** (`MT-ND1` to `MT-ND6`, `MT-CO1`, readthroughs such as
  `NT5C1B-RDH14`). `ast.parse` raises on 87 rules. COBRApy loads them, printing a warning for
  every uppercase rule.
- **Recon3D's ids are `3098.1`.** `ast.parse("3098.3 or 80201.1")` *succeeds* — as two floats —
  and a walk for gene names finds nothing. That one fails silently.

Tokenize instead, then let Python handle precedence on placeholder names:

```python
import ast, re

def gpr_parse(rule):
    """Return (tree, {placeholder: gene id}) for any VMH rule spelling."""
    out, names = [], {}
    for tok in re.findall(r"\(|\)|[^\s()]+", rule or ""):
        low = tok.lower()
        if tok in "()" or low in ("and", "or"):
            out.append(low if low in ("and", "or") else tok)
        else:
            out.append(names.setdefault(tok, f"g{len(names)}"))
    tree = ast.parse(" ".join(out), mode="eval").body if out else None
    return tree, {v: k for k, v in names.items()}

def gpr_genes(rule):
    return set(gpr_parse(rule)[1].values())

def gpr_active(rule, absent):
    tree, back = gpr_parse(rule)
    def ev(n):
        if isinstance(n, ast.BoolOp):
            vals = [ev(v) for v in n.values]
            return all(vals) if isinstance(n.op, ast.And) else any(vals)
        return back[n.id] not in absent
    return True if tree is None else ev(tree)

genes = {g["id"] for g in G}
used = set().union(*(gpr_genes(r.get("gene_reaction_rule", "")) for r in R))
print("GPR tokens not in the gene list:", sorted(used - genes))
hadh = next(r for r in R if r.get("gene_reaction_rule") == "ACAA2 OR (HADHA AND HADHB)")
print(hadh["id"], "| without HADHA:", gpr_active(hadh["gene_reaction_rule"], {"HADHA"}),
      "| without ACAA2 and HADHA:", gpr_active(hadh["gene_reaction_rule"], {"ACAA2", "HADHA"}))
print(sorted(gpr_genes("3098.3 or 80201.1")), "vs ast on the raw rule:",
      ast.dump(ast.parse("3098.3 or 80201.1", mode="eval").body)[:40])
```

Every token resolves to a listed gene. In the mixed-case rule, losing HADHA leaves ACAA2, and
losing both blocks the reaction.

## Look up records

Each record endpoint takes `id` and returns one object in a list under a key that **is not the
one the OpenAPI document names** — `metData`, `rxnData`, `geneData` — so read the key off the
response, not the spec.

```python
met = vmh("getMetHandler", id="glc_D")
m = met["metData"][0]
print("metabolite:", m["abbreviation"], m["fullName"], "| ChEBI", m["cheBlId"], "| HMDB", m["hmdb"],
      "| KEGG", m["keggId"], "| InChIKey", m["inchiKey"], "| MetaNetX", m["metanetx"], "| BiGG", m["biggId"])
print("  canonical", met["canonicalAbbr"], "| former abbreviations", met["formerAbbrs"])

rx = vmh("getRxnHandler", id="HEX1")["rxnData"][0]
print("reaction:", rx["abbreviation"], rx["formula"], "| EC", rx["ecnumber"], "| Rhea", rx["rhea"],
      "| reversible", rx["reversible"], "| subsystem", rx["subsystem"])

gene = vmh("getGeneHandler", id="PKM")["geneData"][0]
print("gene:", gene["symbol"], "| HGNC", gene["hgnc_id"], "| Entrez", gene["entrez_id"],
      "| Ensembl", gene["ensembl_gene_id"], "| UniProt", gene["uniprot_ids"],
      "| previous symbol", gene["prev_symbol"])

print("BiGG id glc__D ->", vmh("getMetHandler", id="glc__D"))
print("previous symbol PKM2 ->", vmh("getGeneHandler", id="PKM2"))
print("Entrez 5315 ->", vmh("getGeneHandler", id="5315"))
old = vmh("getRxnHandler", id="11DOCRTSLte")               # a Recon3D reaction id renamed in Recon3.1
print("Recon3D id 11DOCRTSLte ->", old["rxnData"][0]["abbreviation"], "| response keys", sorted(old))
print("calls left this hour:", _budget["remaining"])
```

Field traps, all observed on 2026-11-12:

- **The ChEBI field is spelled `cheBlId`** — lower-case L, not capital I — and holds the bare
  number (`4167`), without the `CHEBI:` prefix.
- **Field types are mixed.** Identifiers are strings (`"cheBlId": "4167"`), flags are integers
  (`"isHuman": 1`, `"reversible": 0`), and a missing value is `null` in some fields and an empty
  string in others (`"notes": ""`). Test `v not in (None, "")` before treating a field as
  present, and compare flags to `1`, not `"1"`.
- **Lookups are by VMH abbreviation and HGNC symbol only.** The BiGG id `glc__D`, the previous
  symbol `PKM2` and the Entrez id `5315` all return `404`. A renamed record answers under its
  new abbreviation — the Recon3D reaction `11DOCRTSLte` returns `11DOCRTSLt` — and the response
  says what it resolved to: `canonicalAbbr` and `formerAbbrs` for a metabolite, `finalRxnAbbr`,
  `redirectAbbr` and `formerRxnAbbrs` for a reaction. Store the resolved id, not the one you sent.

**The record endpoints are for a handful of ids, not a model.** Resolving all 3,292 Recon3.1
genes one call at a time would take 33 hours of budget.

## SPARQL — one call for many records, but count what comes back

`/api/public/sparql` answers SPARQL 1.1 over VMH's records (classes `vmh:Metabolite`,
`vmh:Reaction`, `vmh:Gene`, `vmh:Disease` and more; the `vmh:`, `rdf:`, `rdfs:`, `xsd:` and `skos:`
prefixes are injected). One query costs one call, which makes it the batch route. Three
behaviours make its answers easy to misread:

1. **A result is cut off at 30,000 rows, with no flag.** `vmh:Gene` holds more than that, so an
   unfiltered gene query returns exactly 30,000 rows — and the gene class as served is missing
   genes the record endpoint has: `TPI1`, `SOD1` and `SLC2A1` are absent from SPARQL and present
   in `getGeneHandler`. 1,212 of Recon3.1's 3,292 gene symbols were absent. **A row count of
   exactly 30,000 means truncated, and a SPARQL miss on a gene is not evidence the gene is absent.**
2. **`format=tsv` drops unbound columns.** A row whose `OPTIONAL` variable is unbound prints one
   field instead of two, so columns shift. Use JSON.
3. **Rows repeat.** The same binding comes back more than once — three copies of each
   metabolite row and two of each gene row in the queries below, three of a `COUNT` row.
   Deduplicate before counting anything.

```python
def sparql(query, max_rows=30_000):
    res = vmh("sparql", data=urllib.parse.urlencode({"query": query, "format": "json"}).encode())
    raw = res["results"]["bindings"]
    if len(raw) >= max_rows:
        raise RuntimeError(f"{len(raw)} rows: the endpoint's cap; narrow the query, the answer is truncated")
    seen, rows = set(), []
    for b in raw:                                   # the endpoint repeats rows; keep one of each
        key = tuple(sorted((k, v["value"]) for k, v in b.items()))
        if key not in seen:
            seen.add(key)
            rows.append(dict(key))
    return rows

n = sparql("SELECT (COUNT(?r) AS ?n) WHERE { ?r a vmh:Reaction ; vmh:isHuman true }")
print("human reactions:", n[0]["n"])
mets = sparql("""SELECT ?abbr ?chebi ?hmdb WHERE {
  ?m a vmh:Metabolite ; vmh:abbreviation ?abbr .
  OPTIONAL { ?m vmh:chebiId ?chebi } OPTIONAL { ?m vmh:hmdb ?hmdb }
  FILTER(?abbr IN ("glc_D", "pyr", "lac_L", "atp", "akg")) }""")
print(mets)
genes_found = sparql("""SELECT ?sym ?entrez WHERE { ?g a vmh:Gene ; vmh:symbol ?sym .
  OPTIONAL { ?g vmh:entrezId ?entrez } FILTER(?sym IN ("PKM", "HK1", "TPI1", "SOD1")) }""")
print("genes SPARQL can see:", sorted(r["sym"] for r in genes_found), "of PKM, HK1, TPI1, SOD1")
```

On 2026-11-12: 15,181 human reactions in VMH's reaction records (more than the 14,208 in
Recon3.1 — the records include reactions outside the reconstruction); PKM and HK1 are found and
TPI1 and SOD1 are not.

## Joining out — on identifiers

- **Metabolites:** strip the compartment from the model id (`glc_D_c` → `glc_D`), then take
  ChEBI, HMDB, KEGG, InChIKey or MetaNetX from the record or a SPARQL query, and join on those.
  Split multi-valued fields first. Human-GEM's `metabolites.tsv` carries the VMH abbreviation in
  its `metRecon3DID` column, so the two models join on that id (see `human-gem`).
- **Genes:** Recon3.1 is keyed on **symbols, which are labels** — `PKM2` became `PKM` in 2012, and
  a symbol-keyed join against an older table silently drops it. Resolve the symbols you care
  about to Entrez or Ensembl through `getGeneHandler` before joining, inside the hourly budget.
  For whole-model gene work, Recon3D's rules are already Entrez-keyed: drop the transcript suffix
  (`3098.1` → `3098`). For bulk symbol mapping beyond VMH, `ensembl` covers it.
- **Reactions:** the abbreviation (`HEX1`) is the key in Recon3D, Recon3.1 and the reaction
  records, and the record adds KEGG, Rhea, MetaNetX and EC numbers. But **abbreviations were
  renamed between Recon3D and Recon3.1** — `11DOCRTSLte` is `11DOCRTSLt` now — and
  `getRxnHandler` resolves the old one to the new record. Map old ids through it rather than
  matching strings.

Recon3D next to Recon3.1, joined on reaction abbreviation (needs `cobra` or `scipy` for the `.mat`;
this block uses COBRApy):

```python
import cobra

r3d = cobra.io.load_matlab_model("Data/vmh/Recon3DModel_301.mat")
ids_31 = {r["id"] for r in R}
ids_3d = {r.id for r in r3d.reactions}
print("Recon3D model:", len(ids_3d), "| Recon3.1:", len(ids_31), "| shared:", len(ids_3d & ids_31),
      "| only in 3D:", len(ids_3d - ids_31), "| only in 3.1:", len(ids_31 - ids_3d))
hex_3d = sorted({g.id.split(".")[0] for g in r3d.reactions.get_by_id("HEX1").genes}, key=int)
hex_31 = sorted(gpr_genes(next(r for r in R if r["id"] == "HEX1")["gene_reaction_rule"]))
print("HEX1 in Recon3D, Entrez:", hex_3d, "| in Recon3.1, symbols:", hex_31)
print("objective, Recon3D:", r3d.objective.expression)
```

Only 7,286 reaction ids appear in both: 3,314 are Recon3D-only and 6,922 Recon3.1-only. Part
of that is genuine growth, and part is renaming — the reason not to compare the two models on
raw id strings. HEX1 is `{3098, 3099, 3101, 2645, 80201}` in Recon3D and `{HK1, HK2, HK3, GCK,
HKDC1}` in Recon3.1 — the same five hexokinases, keyed on ids in one file and on labels in the
other.

For the other side of a join: `uniprot` for proteins, `chembl` and `pubchem` for compounds,
`reactome` for curated pathways, `metabolomics-workbench` for measured metabolite levels.

## What does not work

Each was tried on 2026-11-12.

| tried | result |
|---|---|
| the legacy API, `https://www.vmh.life/_api/metabolites/?abbreviation=atp` (and `/_api/genes/`, `/_api/reactions/`) | `308` redirect, then `404` HTML "Page not found". Retired; VMH's `/apiMigration` page covers the move to `/api/public` |
| any call with Python's default `User-Agent` | `403`, body `error code: 1010` (Cloudflare) |
| `getHumanReconstruction` without `type` | `410 Gone`; pass `type=recon_x` |
| `getRxnToModelHandler?rxn=HEX1` | `count` 203,579 rows, paged 100 at a time, microbes first; with `model=Recon`, 0 rows. Read GPRs and bounds from the downloaded files instead |
| `getMetHandler?id=glc__D` (BiGG id), `getGeneHandler?id=PKM2` (previous symbol), `getGeneHandler?id=5315` (Entrez) | `404` each |
| unfiltered SPARQL over `vmh:Gene` | exactly 30,000 rows, no truncation flag; TPI1, SOD1, SLC2A1 missing |
| saving a download without checking its size | a transient `502` once left a 16-byte `error code: 502` file named `.mat` |
| the BiGG copy of Recon3D | reachable, but non-commercial — not the route |

## Try it

**Data** — VMH's live human reconstruction and three records, all public, no account:
`https://www.vmh.life/api/public/getHumanReconstruction?type=recon_x` plus
`getRxnHandler?id=HEX1`, `getMetHandler?id=glc_D` and `getGeneHandler?id=PKM`. Seven API calls in
total, within the hourly limit. VMH curated content is CC BY 4.0. Confirmed reachable 2026-11-12.
Standard library only. It routes through the traps: the `User-Agent` refusal, the
`metData`/`cheBlId` field names and mixed field types, a mixed-case GPR with a hyphenated gene, a lookup by a previous
symbol, and the 30,000-row SPARQL cap.

```python
import ast, json, re, urllib.error, urllib.parse, urllib.request

BASE = "https://www.vmh.life/api/public"
UA = {"User-Agent": "vmh-research-client/1.0"}

def call(endpoint, params=None, data=None, headers=UA):
    url = f"{BASE}/{endpoint}" + ("?" + urllib.parse.urlencode(params) if params else "")
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=180) as r:
                return r.status, json.loads(r.read()), r.headers.get("x-ratelimit-remaining")
        except urllib.error.HTTPError as e:
            if e.code == 502 and attempt == 1:
                continue
            return e.code, e.read()[:60], e.headers.get("x-ratelimit-remaining")

# 1. the full reconstruction, one call
code, recon, left = call("getHumanReconstruction", {"type": "recon_x"})
assert code == 200
R, M, G = recon["reactions"], recon["metabolites"], recon["genes"]
comps = {c["id"] for c in recon["compartments"]}
assert all(m["id"].rsplit("_", 1)[1] == m["compartment"] in comps for m in M)

# 2. GPRs: tokenize, because Recon3.1 mixes OR/or and has hyphenated symbols
def gpr(rule):
    out, names = [], {}
    for t in re.findall(r"\(|\)|[^\s()]+", rule or ""):
        lo = t.lower()
        out.append(lo if lo in ("and", "or") else t if t in "()" else names.setdefault(t, f"g{len(names)}"))
    return (ast.parse(" ".join(out), mode="eval").body if out else None), {v: k for k, v in names.items()}
def active(rule, absent):
    tree, back = gpr(rule)
    ev = lambda n: (all if isinstance(n.op, ast.And) else any)(ev(v) for v in n.values) \
        if isinstance(n, ast.BoolOp) else back[n.id] not in absent
    return True if tree is None else ev(tree)
gene_ids = {g["id"] for g in G}
tokens = set().union(*(gpr(r.get("gene_reaction_rule"))[1].values() for r in R))
upper = sum(len(re.findall(r"\b(?:OR|AND)\b", r.get("gene_reaction_rule", ""))) for r in R)
hadh = next(r["gene_reaction_rule"] for r in R if r.get("gene_reaction_rule") == "ACAA2 OR (HADHA AND HADHB)")
hyphen = sorted(t for t in tokens if "-" in t)

# 3. the reaction record agrees with the file's stoichiometry
code, rxd, left = call("getRxnHandler", {"id": "HEX1"})
rec = rxd["rxnData"][0]
lhs, rhs = re.split(r"\s*(?:->|<=>)\s*", rec["formula"])
parse = lambda side: {re.sub(r"^\d+(\.\d+)?\s+", "", s).replace("[", "_").rstrip("]")
                      for s in side.split(" + ") if s}
hex1 = next(r for r in R if r["id"] == "HEX1")["metabolites"]

# 4. metabolite and gene records: the field names and the label trap
code, md, left = call("getMetHandler", {"id": "glc_D"})
met = md["metData"][0]
code_prev, _, _ = call("getGeneHandler", {"id": "PKM2"})
code, gd, left = call("getGeneHandler", {"id": "PKM"})
gene = gd["geneData"][0]

# 5. Cloudflare refuses Python's default agent; SPARQL truncates at 30,000 rows
code_ua, body_ua, _ = call("getMetHandler", {"id": "glc_D"}, headers={})
q = "SELECT ?s WHERE { ?g a vmh:Gene ; vmh:symbol ?s }"
code, sp, left = call("sparql", data=urllib.parse.urlencode({"query": q, "format": "json"}).encode())
syms = {b["s"]["value"] for b in sp["results"]["bindings"]}

print("Recon3.1         :", recon["id"], len(R), "reactions,", len(M), "metabolites,", len(G), "genes")
print("collapsed mets   :", len({m["id"].rsplit("_", 1)[0] for m in M}))
print("GPR              :", upper, "uppercase operators,", len(hyphen), "hyphenated symbols, e.g.", hyphen[:3])
print("HEX1 formula     :", rec["formula"])
print("glc_D            : ChEBI", met["cheBlId"], "| KEGG", met["keggId"], "| lipidmaps", met["lipidmaps"])
print("PKM              : Entrez", gene["entrez_id"], "| Ensembl", gene["ensembl_gene_id"], "| PKM2 ->", code_prev)
print("default agent    :", code_ua, body_ua)
print("SPARQL genes     :", len(sp["results"]["bindings"]), "rows | PKM", "PKM" in syms, "| TPI1", "TPI1" in syms)
print("calls left       :", left)

assert not (tokens - gene_ids)                                   # every GPR token is a listed gene
assert upper > 0 and hyphen                                      # the spellings that break ast.parse
assert active(hadh, {"HADHA"}) and not active(hadh, {"ACAA2", "HADHA"})
assert parse(lhs) == {m for m, c in hex1.items() if c < 0} and parse(rhs) == {m for m, c in hex1.items() if c > 0}
assert "metaboliteData" not in md and met["cheBlId"].isdigit() and met["lipidmaps"] is None and met["isHuman"] == 1
assert code_prev == 404 and gene["entrez_id"] == "5315" and gene["ensembl_gene_id"] == "ENSG00000067225"
assert code_ua == 403 and b"1010" in body_ua
assert len(sp["results"]["bindings"]) == 30000 and "TPI1" not in syms
print("all checks passed")
```

**Expect**

Invariants — a failure means the skill is wrong:

- The reconstruction is COBRA-style JSON; every metabolite id ends in `_<compartment>`, and that
  compartment is listed.
- Every token in every GPR rule, once tokenized case-insensitively, is a listed gene.
- The HEX1 record's formula names the same substrates and products as HEX1 in the file.
- `ACAA2 OR (HADHA AND HADHB)` survives losing HADHA and not losing ACAA2 and HADHA together.
- Record payloads sit under `metData`/`rxnData`/`geneData`; a missing ChEBI or LipidMaps value is
  `null`, and `isHuman` is the integer `1`.
- A previous gene symbol is not a lookup key.

Counter-examples found in the multi-record pass, asserted so nobody simplifies them away — each
could be fixed upstream, and a failure here means re-read the page rather than that it is wrong:
uppercase operators and hyphenated symbols in the rules; ChEBI under `cheBlId`; Python's default
`User-Agent` refused with `1010`; SPARQL capped at 30,000 gene rows without TPI1.

Observed 2026-11-12 (VMH release 2026-09-18) — these move with each VMH release, so a mismatch is
drift to investigate, not a failure:

```
Recon3.1         : Recon3.1 14208 reactions, 8889 metabolites, 3292 genes
collapsed mets   : 4223
GPR              : 338 uppercase operators, 14 hyphenated symbols, e.g. ['CHURC1-FNTB', 'JMJD7-PLA2G4B', 'MT-CO1']
HEX1 formula     : atp[c] + glc_D[c] -> h[c] + adp[c] + g6p[c]
glc_D            : ChEBI 4167 | KEGG C00031 | lipidmaps None
PKM              : Entrez 5315 | Ensembl ENSG00000067225 | PKM2 -> 404
default agent    : 403 b'error code: 1010\n'
SPARQL genes     : 30000 rows | PKM True | TPI1 False
calls left       : 52
all checks passed
```

`calls left` depends on what else the same IP has called this hour.

## Citing it

Cite VMH and the reconstruction you used:

- Noronha A, et al. The Virtual Metabolic Human database: integrating human and gut microbiome
  metabolism with nutrition and disease. *Nucleic Acids Res.* 47(D1):D614–D624 (2019).
  https://doi.org/10.1093/nar/gky992 — VMH's About page also lists a VMH 2.0 manuscript as submitted.
- Brunk E, et al. Recon3D enables a three-dimensional view of gene variation in human metabolism.
  *Nat. Biotechnol.* 36:272–281 (2018). https://doi.org/10.1038/nbt.4072 — Recon3D
- State the VMH release date (`/api/release`) and the file checksums from the manifest; Recon3.1
  has no separate version number (`"version": "1"`).
