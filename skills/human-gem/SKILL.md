---
name: human-gem
description: Read the Human-GEM genome-scale metabolic model from a pinned release — stoichiometric matrix, Ensembl-keyed GPR rules, compartments, subsystems — to ask structural questions such as hubs, branch points and which pathways use a gene.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [metabolic-modeling, public-data, sbml, ensembl, metabolites]
covers: [human-gem, human1, human2, genome-scale metabolic model, gem, metabolic network, metabolic reconstruction, stoichiometric matrix, gene-protein-reaction, gpr, isozyme, enzyme complex, subsystem, metabolic pathway, compartment, mitochondria, cytosol, peroxisome, hub metabolite, currency metabolite, branch point, ensembl, chebi, hmdb, kegg, metanetx, recon3d, metabolic atlas, human, homo sapiens]
papers: [PMID:32209698, PMID:41950094]
access: [open]
datasets: [https://raw.githubusercontent.com/SysBioChalmers/Human-GEM/v2.1.1/model/Human-GEM.yml, https://raw.githubusercontent.com/SysBioChalmers/Human-GEM/v2.1.1/model/genes.tsv, https://raw.githubusercontent.com/SysBioChalmers/Human-GEM/v2.1.1/model/metabolites.tsv, https://raw.githubusercontent.com/SysBioChalmers/Human-GEM/v2.1.1/model/reactions.tsv, 'https://api.github.com/repos/SysBioChalmers/Human-GEM/tags?per_page=100']
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-12
  against: Human-GEM v2.1.1 (commit 6812be2a5c1504a89ea9e84d770786a84f5f3ce2), with v1.8.0, v1.12.0, v1.19.0, v2.0.0 and v2.1.0 for the multi-release pass / PyYAML 6.0.3 with libyaml / scipy 1.18.1 / numpy 2.5.4 / cobra 0.32.1 for the cross-check block / Python 3.12 / install line run in a fresh venv, every block run in page order in one fresh directory including the unknown-tag error path, and Try it run again alone in a fresh mktemp directory
  executed: 13
  unverified: 0
---
# Human-GEM — the human genome-scale metabolic model

Human-GEM is the community genome-scale metabolic model (GEM) of a generic human cell,
maintained by SysBioChalmers on GitHub and mirrored in Metabolic Atlas. It is a network of
about 12,700 reactions, 8,400 compartment-specific metabolites and 2,900 genes, with about
7,700 of those reactions tied to the genes that catalyse them through a gene-protein-reaction
(GPR) rule.

This skill reads that network **from a pinned file on disk** and answers structural
questions of it: what the stoichiometric matrix looks like, which metabolites are hubs, where
the network branches, which subsystems a gene sits in, and how many metabolites there are
with and without compartments. It needs no solver.

It does not simulate. Flux balance analysis, flux variability, knockouts and media belong to
the `cobrapy` skill — load the same release's SBML file there, and use this page to decide
which reactions and genes you are asking about. The structural answer and the flux answer
are different questions: a gene can sit in a subsystem here and still carry no flux there.

**Access.** No account, no key, no click-through. The repository is licensed CC-BY-4.0
("Creative Commons Attribution 4.0 International", `LICENSE.md` at
https://github.com/SysBioChalmers/Human-GEM), which allows commercial use with attribution.
Cite the paper for the major version you use: **Human2** (v2.x, Luo et al. 2026, *PNAS*,
which describes a reconstruction made with large language models) or **Human1** (v1.x,
Robinson et al. 2020, *Science Signaling*). The repository README asks for exactly that split.

Install for everything below: `pyyaml` and `scipy` (plus `cobra` only for the optional
cross-check block).

```bash
python -m pip install pyyaml scipy
```

## Pin a release

Human-GEM publishes tagged releases, and the network changes between them — reactions are
merged and retired, genes are added and dropped, compartment letters have changed. An analysis
that names no release cannot be repeated. Measured across six releases with the loader below:

| release | date | reactions | metabolites | collapsed | genes | compartment letters |
|---|---|---|---|---|---|---|
| v1.8.0 | 2021-06-21 | 13,083 | 8,378 | 4,124 | 3,625 | c g i l m n **p r s** |
| v1.12.0 | 2022-06-21 | 13,070 | 8,369 | 4,112 | 3,067 | c **e** g i l m n r **x** |
| v1.19.0 | 2024-06-25 | 12,971 | 8,455 | 4,162 | 2,887 | c e g i l m n r x |
| v2.0.0 | 2026-03-26 | 12,931 | 8,461 | 4,165 | 2,848 | c e g i l m n r x |
| v2.1.0 | 2026-09-30 | 12,748 | 8,374 | 4,102 | 2,870 | c e g i l m n r x |
| v2.1.1 | 2026-10-07 | 12,748 | 8,374 | 4,102 | 2,870 | c e g i l m n r x |

"Collapsed" is the count of distinct metabolites once the compartment is ignored. The tag is
the pin; the release has **no attached assets** — the files live in the repository's `model/`
directory at that tag. Starting from v1.5.0 every release is also archived on Zenodo (concept
DOI 10.5281/zenodo.4099692) if you need a DOI for the exact version.

Find the latest tag, and the commit it points at, from the GitHub API:

```python
import json, urllib.request

API = "https://api.github.com/repos/SysBioChalmers/Human-GEM"
latest = json.load(urllib.request.urlopen(f"{API}/releases/latest", timeout=60))
tags = json.load(urllib.request.urlopen(f"{API}/tags?per_page=100", timeout=60))
sha = {t["name"]: t["commit"]["sha"] for t in tags}
print(latest["tag_name"], latest["published_at"][:10], sha[latest["tag_name"]])
print(len(tags), "tags, oldest", tags[-1]["name"])
```

Things about the release layout that cost time if you find them by accident:

- **Read from a tag or a commit, never from `main` or `develop`.** `main` moves with each
  release, and non-`main` branches carry only the `.yml` — no `.xml`, `.mat` or `.xlsx`.
- **The layout changed.** v1.0.0 kept the model at `ModelFiles/yml/humanGEM.yml`; v1.5.0 had
  `model/Human-GEM.yml` but annotations as JSON under `data/annotation/`; the `model/*.tsv`
  annotation tables this page uses exist from **v1.8.0** on. Earlier tags `404` on those paths.
- **v2.1.0's SBML has no subsystems.** The v2.1.1 release notes say so ("`Human-GEM.xml` again
  holds subsystems"). If you are pinned to v2.1.0, read subsystems from the `.yml`.
- **GitHub limits unauthenticated API calls to 60 an hour per IP.** The `tags` and `releases`
  calls are API calls; the `raw.githubusercontent.com` downloads are not. Over the limit the API
  refuses with a rate-limit message rather than an empty tag list — read the error before
  concluding a tag is gone.

## Get the files

Four files answer every structural question: the model as YAML and the three annotation
tables. Download by **commit SHA** rather than by tag name — a tag can be moved, a SHA cannot
— and write a manifest with checksums beside them.

```python
import hashlib, json, os, urllib.request
from datetime import date

TAG = "v2.1.1"
OUT = f"Data/human-gem/{TAG}"
FILES = ["Human-GEM.yml", "genes.tsv", "metabolites.tsv", "reactions.tsv"]
# add "Human-GEM.xml" (about 50 MB) if you will hand the model to cobrapy for flux analysis

API = "https://api.github.com/repos/SysBioChalmers/Human-GEM"
tags = {t["name"]: t["commit"]["sha"]
        for t in json.load(urllib.request.urlopen(f"{API}/tags?per_page=100", timeout=60))}
if TAG not in tags:
    raise LookupError(f"{TAG} is not a Human-GEM tag; newest are {list(tags)[:5]}")
sha = tags[TAG]

os.makedirs(OUT, exist_ok=True)
manifest = {"model": "Human-GEM", "tag": TAG, "commit": sha, "license": "CC-BY-4.0",
            "retrieved": date.today().isoformat(), "files": []}
for name in FILES:
    url = f"https://raw.githubusercontent.com/SysBioChalmers/Human-GEM/{sha}/model/{name}"
    dest = os.path.join(OUT, name)
    urllib.request.urlretrieve(url, dest)
    with open(dest, "rb") as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()
    manifest["files"].append({"file": name, "url": url, "bytes": os.path.getsize(dest), "sha256": digest})
    print(f"  {name:16} {os.path.getsize(dest):>10,} bytes")

# The yml states its own version. A mismatch means you fetched something other than the tag.
with open(os.path.join(OUT, "Human-GEM.yml"), encoding="utf-8") as fh:
    head = fh.read(3000)
v = TAG.lstrip("v")
assert f"version: {v}\n" in head or f'version: "{v}"' in head, "yml version does not match the tag"
with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=2)
print(f"{TAG} at {sha[:12]} -> {OUT}")
```

Run 2026-11-12: `Human-GEM.yml` 7,514,158 B, `genes.tsv` 1,092,372 B, `metabolites.tsv`
2,499,013 B, `reactions.tsv` 953,268 B, commit `6812be2a5c15`. A tag that does not exist
raises the `LookupError`, naming the newest tags.

## Choose a read path

Every route below reads the same network. Measured on v2.1.1, one laptop:

| route | time | what you get |
|---|---|---|
| `.yml` with PyYAML's `CSafeLoader` (libyaml) | ~5 s | plain dicts and lists; the lightweight path this page uses |
| `.yml` with PyYAML's pure-Python `SafeLoader` | ~16 s | same, where libyaml is not compiled in |
| `.xml` (SBML, 50 MB) with `cobra.io.read_sbml_model` | ~10 s | a COBRApy `Model`, ready for flux analysis |
| `.yml` with `cobra.io.load_yaml_model` | ~33 s | a COBRApy `Model`, slowly |

The trade-off is what you do next. For structure, the YAML is the source the maintainers edit,
it is 7 MB rather than 50, and nothing in it is hidden behind an object model. For flux, load
the SBML with COBRApy — the `cobrapy` skill covers that — and the reaction, metabolite and
gene ids are the same, so anything you found here carries over. On v2.1.1 the two agree
exactly: same reaction order, same GPR strings, same subsystems, and the stoichiometric
matrix built below equals COBRApy's `create_stoichiometric_matrix` with a maximum difference
of 0.0.

Five traps in the YAML, all handled by the loader:

1. **The top level is an `!!omap`, so `yaml.load` returns a list of `(key, value)` pairs, not a
   dict.** `doc["reactions"]` raises `TypeError`; wrap it in `dict()` first. Every reaction,
   metabolite and gene is an `!!omap` too.
2. **`metaData` changed shape** — a plain mapping through v2.0.0, an `!!omap` from v2.1.0.
   `dict()` handles both.
3. **`subsystem` is a list.** Every reaction in v2.1.1 has exactly one, but v1.12.0 has
   `MAR01044` in both *Heme synthesis* and *Porphyrin metabolism*. Code that takes
   `subsystem[0]`, or treats the value as a string, loses one silently.
4. **A reaction with no GPR has no `gene_reaction_rule` key at all** — not an empty string.
   5,002 of 12,748 reactions in v2.1.1.
5. **Reaction names are not reliably there.** Every reaction is named in v2.1.1, but 8,211
   names are empty strings in v1.8.0 and 5,714 reactions have no `name` key at all in v2.0.0.
   Display them; never key anything on them.

And one in the annotation tables: **some releases have rows with too few fields**, and
`csv.DictReader` fills the missing tail with `None`. Sometimes that is harmless — in v1.19.0
and v2.0.0 the rows for `MAM02120x` and `MAM02120m` simply stop before two empty trailing
columns. Sometimes it is not: in v2.0.0 the ISCA1 row of `genes.tsv` is missing its protein id
in the *middle*, so every later column shifts left, its `geneSymbols` holds `81689` (its Entrez
id), and a lookup of `ISCA1` reports it absent from the model. FDX1 is truncated in v2.0.0 and
v2.1.0 (the v2.1.1 release notes record the fix). A parser cannot tell the two cases apart, so
the loader names every short row and leaves the reading to you. v2.1.1 has none.

```python
import csv, warnings
from pathlib import Path
import yaml

def read_tsv(path):
    # Default csv quoting strips the double quotes v2.0.0 and v2.1.0 put around every
    # field of genes.tsv. A plain line.split("\t") keeps them, and "PKM" stops matching.
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh, delimiter="\t"))
    short = [next(iter(r.values())) for r in rows if None in r.values() or None in r]
    if short:
        warnings.warn(f"{Path(path).name}: {len(short)} row(s) with the wrong number of fields, "
                      f"check them by hand before trusting their columns: {short[:5]}")
    for r in rows:
        r.pop(None, None)                       # surplus fields, if a row has too many
        for k, v in r.items():
            if v is None:
                r[k] = ""                       # missing tail, if a row has too few
    return rows, short

def load_human_gem(model_dir):
    model_dir = Path(model_dir)
    loader = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
    with open(model_dir / "Human-GEM.yml", encoding="utf-8") as fh:
        doc = dict(yaml.load(fh, Loader=loader))
    rxns = []
    for r in doc["reactions"]:
        r = dict(r)
        r["metabolites"] = dict(r["metabolites"])
        ss = r.get("subsystem") or []
        r["subsystem"] = [ss] if isinstance(ss, str) else list(ss)
        r["gene_reaction_rule"] = r.get("gene_reaction_rule") or ""
        r["name"] = r.get("name") or ""
        rxns.append(r)
    gem = {"meta": dict(doc["metaData"]),
           "mets": [dict(m) for m in doc["metabolites"]],
           "rxns": rxns,
           "genes": [dict(g) for g in doc["genes"]],
           "compartments": dict(doc["compartments"])}
    gem["short_rows"] = {}
    for name in ("genes", "metabolites", "reactions"):
        gem[name + "_tsv"], gem["short_rows"][name] = read_tsv(model_dir / f"{name}.tsv")
    return gem

gem = load_human_gem("Data/human-gem/v2.1.1")
print(gem["meta"]["version"], len(gem["rxns"]), "reactions,", len(gem["mets"]), "metabolites,",
      len(gem["genes"]), "genes,", len(gem["compartments"]), "compartments")
print("short rows:", gem["short_rows"])
# The annotation tables are keyed on the same ids as the model; check before joining.
assert {g["genes"] for g in gem["genes_tsv"]} == {g["id"] for g in gem["genes"]}
assert {m["mets"] for m in gem["metabolites_tsv"]} == {m["id"] for m in gem["mets"]}
assert {r["rxns"] for r in gem["reactions_tsv"]} == {r["id"] for r in gem["rxns"]}
```

## The stoichiometric matrix

Rows are compartment-specific metabolites, columns are reactions, entries are stoichiometric
coefficients — negative for a substrate, positive for a product, in the direction the reaction
is written.

```python
from scipy import sparse

def stoichiometric_matrix(gem):
    met_ids = [m["id"] for m in gem["mets"]]
    row = {m: i for i, m in enumerate(met_ids)}
    rows, cols, vals = [], [], []
    for j, r in enumerate(gem["rxns"]):
        for m, coef in r["metabolites"].items():
            rows.append(row[m]); cols.append(j); vals.append(coef)
    S = sparse.csr_matrix((vals, (rows, cols)), shape=(len(met_ids), len(gem["rxns"])))
    return S, met_ids, [r["id"] for r in gem["rxns"]]

S, met_ids, rxn_ids = stoichiometric_matrix(gem)
print(S.shape, S.nnz, "non-zeros; max |coefficient|", abs(S).max())
assert S.nnz == sum(len(r["metabolites"]) for r in gem["rxns"])
```

v2.1.1: shape `(8374, 12748)`, 54,325 non-zeros, maximum coefficient **77,243**.

**Do not read the magnitudes as weights.** Most coefficients are 1 or 2, but lipoprotein and
pool reactions carry stoichiometries in the thousands — `MAR00001` (lipoprotein lipase,
chylomicron) produces 77,243 of `MAM02956e`, and 445 entries exceed 100 in absolute value.
For topology — degree, connectivity, paths — use the pattern `S != 0`, not the values. For
anything spectral, expect those columns to dominate.

Reading the columns:

- **Direction** comes from the bounds. `lower_bound < 0` means reversible (5,668 reactions);
  no reaction in v2.1.1 has `lower_bound > 0`, and 8 are blocked with both bounds 0.
- **Exchange reactions** are the 1,654 columns with a single metabolite, all in `e`
  (1,652 in *Exchange/demand reactions*, 2 in *Xenobiotics metabolism*). Find them by shape,
  not by subsystem name.
- **The objective** is `MAR13082`, *Generic human cell biomass reaction* — the only reaction
  with an `objective_coefficient`.

## Metabolites and compartments

A metabolite id is `MAM` + five digits + **one compartment letter**: `MAM02819c` is pyruvate in
the cytosol, `MAM02819m` pyruvate in mitochondria. `metabolites.tsv` carries the id without the
letter as `metsNoComp`, and in every release from v1.8.0 to v2.1.1 `metsNoComp` equals the id
minus its last character.

**Take the compartment from the `compartment` field, not from the id's last letter.** They
agree for every metabolite in v2.1.1, but in v1.19.0 `MAM20076n` (N-hexadecanoylsphing-4-enine)
has `compartment: c`, and v2.0.0 adds `MAM00208m`. Map letters to names through the file's
own `compartments` section, never a table you remember:

```python
from collections import Counter

nocomp = {m["mets"]: m["metsNoComp"] for m in gem["metabolites_tsv"]}
assert all(m["compartment"] in gem["compartments"] for m in gem["mets"])
suffix_disagrees = [m["id"] for m in gem["mets"] if m["id"][-1] != m["compartment"]]
print("id suffix disagrees with compartment field:", suffix_disagrees)
per_comp = Counter(m["compartment"] for m in gem["mets"])
print("compartment-aware   :", len(gem["mets"]))
print("compartment-collapsed:", len(set(nocomp.values())))
print({gem["compartments"][c]: n for c, n in per_comp.most_common()})
spread = Counter(Counter(nocomp.values()).values())
print("compartments per metabolite:", dict(sorted(spread.items())))
```

v2.1.1: **8,374 compartment-aware, 4,102 collapsed**. Cytosol 3,298, Extracellular 1,654,
Endoplasmic reticulum 968, Mitochondria 931, Peroxisome 502, Lysosome 449, Golgi apparatus 358,
Nucleus 212, Inner mitochondria 2. 1,643 metabolites occur in one compartment; two occur in all
nine.

Which count to report depends on the question. "How many distinct chemical species does the
model know" is the collapsed count; "how many nodes does the network have" is the aware one,
because pyruvate in the cytosol and pyruvate in mitochondria are joined only by a transport
reaction.

**Compartment letters changed meaning between releases.** v1.8.0 used `s` for Extracellular
and `p` for Peroxisome; by v1.12.0 those were `e` and `x`. So the same metabolite is
`MAM00001s` in v1.8.0 and `MAM00001e` later, and an id-level diff across that boundary reports
it as removed and re-added. Compare releases on `(metsNoComp, compartment name)`.

## Hubs, and the currency metabolites that dominate them

A metabolite's degree is the number of reactions it takes part in — the non-zeros in its row.
Raw degree is dominated by cofactors and inorganic species that every second reaction touches:

```python
deg = (S != 0).sum(axis=1).A1
name = {m["id"]: m["name"] for m in gem["mets"]}
order = deg.argsort()[::-1]
print([(met_ids[i], name[met_ids[i]], int(deg[i])) for i in order[:6]])
```

v2.1.1: `MAM02039c` H+ 2,663, `MAM02040c` H2O 1,977, `MAM01371c` ATP 857, `MAM02751c` Pi 700,
`MAM01285c` ADP 688, `MAM02039m` H+ 574.

To ask which *pathway intermediates* are hubs, exclude a currency set **by `metsNoComp` id**,
so every compartment's copy goes at once. Excluding `MAM02039c` alone leaves H+ in
mitochondria as the sixth-biggest hub. The set is a judgement — state it with the result. This
one is nineteen species; the expected name beside each id is checked on load, so a release that
reassigns an id fails loudly rather than excluding the wrong molecule:

```python
CURRENCY = {"MAM02039": "H+", "MAM02040": "H2O", "MAM01371": "ATP", "MAM01285": "ADP",
            "MAM01334": "AMP", "MAM02751": "Pi", "MAM02759": "PPi", "MAM02552": "NAD+",
            "MAM02553": "NADH", "MAM02554": "NADP+", "MAM02555": "NADPH", "MAM01802": "FAD",
            "MAM01803": "FADH2", "MAM01597": "CoA", "MAM02630": "O2", "MAM01596": "CO2",
            "MAM02046": "HCO3-", "MAM02578": "NH3", "MAM02519": "Na+"}
named = {nocomp[m]: name[m] for m in met_ids}
wrong = {k: (v, named.get(k)) for k, v in CURRENCY.items() if named.get(k) != v}
assert not wrong, f"currency ids no longer carry the expected names: {wrong}"

SKIP_SUBSYSTEMS = {"Transport reactions", "Exchange/demand reactions",
                   "Artificial reactions", "Pool reactions"}
metabolic = [j for j, r in enumerate(gem["rxns"]) if not set(r["subsystem"]) & SKIP_SUBSYSTEMS]
deg_metabolic = (S[:, metabolic] != 0).sum(axis=1).A1

def hubs(degree, n=10):
    keep = [i for i in degree.argsort()[::-1] if nocomp[met_ids[i]] not in CURRENCY]
    return [(met_ids[i], name[met_ids[i]], int(degree[i])) for i in keep[:n]]

print("all reactions      :", hubs(deg, 5))
print("no transport/pools :", hubs(deg_metabolic, 5))
```

v2.1.1, all reactions: L-carnitine `c` 249, acetyl-CoA `m` 164, arginine `c` 155, glycine `c`
144, tryptophan `c` 143. Drop transport, exchange, artificial and pool reactions (5,735
columns) and the amino acids fall away — they are hubs of *transport*, not of chemistry:
L-carnitine `c` 225, acetyl-CoA `m` 164, UDP `g` 127, cholesterol `r` 126, L-carnitine `m` 125.

**Why ids and not names.** Names are labels, and the model reuses them. `retinal` names two
different metabolites — `MAM02832` (ChEBI 17898, KEGG C00376, in `c`, `r`, `e`) and `MAM20002`
(ChEBI 15035, nucleus only) — and `retinol` likewise names `MAM02834` and `MAM20001`. A
name-keyed exclusion or join merges them without a word.

## Branch points

A branch point is a metabolite with more than one way out. Count producers and consumers per
metabolite, and let the bounds decide direction: a reversible reaction both produces and
consumes each of its metabolites, which is why reversible-heavy metabolites look branchier
than they are.

```python
def producers_consumers(gem, met, skip=frozenset()):
    prod, cons = [], []
    for r in gem["rxns"]:
        c = r["metabolites"].get(met)
        if c is None or set(r["subsystem"]) & skip:
            continue
        fwd, bwd = r["upper_bound"] > 0, r["lower_bound"] < 0
        if (c > 0 and fwd) or (c < 0 and bwd): prod.append(r["id"])
        if (c < 0 and fwd) or (c > 0 and bwd): cons.append(r["id"])
    return prod, cons

rx = {r["id"]: r for r in gem["rxns"]}
for met in ["MAM02819c", "MAM02819m"]:
    p_all, c_all = producers_consumers(gem, met)
    p, c = producers_consumers(gem, met, SKIP_SUBSYSTEMS)
    print(f"{met} {name[met]}: {len(p_all)} in / {len(c_all)} out; "
          f"without transport and pools {len(p)} in / {len(c)} out")
    for j in c:
        print("   ", j, rx[j]["name"][:55], "|", rx[j]["subsystem"][0],
              "| reversible" if rx[j]["lower_bound"] < 0 else "")

# Every reaction that consumes a non-currency metabolite with two or more metabolic consumers
branch = {}
for m in met_ids:
    if nocomp[m] in CURRENCY:
        continue
    _, c = producers_consumers(gem, m, SKIP_SUBSYSTEMS)
    if len(c) >= 2:
        branch[m] = c
at_branch = {j for c in branch.values() for j in c}
print(len(branch), "branch-point metabolites;", len(at_branch), "reactions leave one")
```

v2.1.1: cytosolic pyruvate has 37 producers and 23 consumers, but 14 of those consumers are
transport reactions and one is a biomass pool. Without them it has 23 producers and 8
consumers — the alanine, glutamine and serine aminotransferases, lactate dehydrogenase, a
dTDP-dependent pyruvate kinase, N-acetylneuraminate lyase, a salsolinol hydrolysis and
methionine transaminase, six of them reversible. Mitochondrial pyruvate drops from 14 / 7 to
12 / 6 — pyruvate carboxylase, the thiamine diphosphate step of pyruvate dehydrogenase,
lactate dehydrogenase and three aminotransferases. Across the model, 2,133 non-currency
metabolites have two or more metabolic consumers, and 5,005 reactions leave one of them.

Two things follow. **Reversibility, not chemistry, makes most of those "consumers"**: run the
same count on flux bounds from a context-specific model, or on a flux solution from `cobrapy`,
and many disappear. And **the pyruvate dehydrogenase complex appears as its E1 step** under
*Thiamine metabolism*, not as one reaction under *Glycolysis*: subsystem labels describe how the
reconstruction was assembled, not the textbook pathway map.

## GPR rules — reading them correctly

A GPR rule is a Boolean expression over Ensembl gene ids:

- `A or B` — **isozymes**. Either gene is enough.
- `A and B` — a **complex**. Both are needed.
- `and` binds tighter than `or`, so `A or B and C` means `A or (B and C)`.

That precedence is Python's, so `ast.parse` reads a rule correctly. **Parse it; never `eval`
it** — a rule is file content, and `eval` runs whatever it says.

```python
import ast

def gpr_tree(rule):
    return ast.parse(rule, mode="eval").body if rule.strip() else None

def gpr_genes(rule):
    t = gpr_tree(rule)
    return set() if t is None else {n.id for n in ast.walk(t) if isinstance(n, ast.Name)}

def gpr_active(rule, absent):
    """Can the reaction still be catalysed with the genes in `absent` missing?"""
    def ev(n):
        if isinstance(n, ast.BoolOp):
            vals = [ev(v) for v in n.values]
            return all(vals) if isinstance(n.op, ast.And) else any(vals)
        if isinstance(n, ast.Name):
            return n.id not in absent
        raise ValueError(f"unexpected element in GPR rule: {ast.dump(n)}")
    t = gpr_tree(rule)
    return True if t is None else ev(t)

# precedence: A or (B and C)
assert ast.dump(gpr_tree("A or B and C")) == ast.dump(gpr_tree("A or (B and C)"))
assert gpr_active("A or B and C", {"B"}) and not gpr_active("A or B and C", {"A", "B"})

sym = {g["genes"]: g["geneSymbols"] for g in gem["genes_tsv"]}
mpc = rx["MAR04926"]                      # pyruvate transport, cytosol to mitochondria
print(mpc["name"], "|", " ".join(sym.get(t, t) for t in
      mpc["gene_reaction_rule"].replace("(", " ( ").replace(")", " ) ").split()))
for g in sorted(gpr_genes(mpc["gene_reaction_rule"]), key=sym.get):
    print(f"  without {sym[g]:6} active={gpr_active(mpc['gene_reaction_rule'], {g})}")
```

The mitochondrial pyruvate carrier is `(MPC1 and MPC2) or (MPC1L and MPC2)`: MPC2 is required,
MPC1 and MPC1L are each replaceable.

**Rules change between releases, so the answer does.** In v1.8.0 and v1.12.0 the same reaction
read `MPC1 or MPC2 or MPC1L` — three isozymes, none required. By v1.19.0 it was the complex
above. A "which genes are essential for this reaction" answer is a fact about one release.

**The tempting shortcut is wrong.** "A gene is required only if the rule has no `or`" misses
exactly that case — a subunit shared by every alternative complex. Across v2.1.1, 23,566
gene-reaction pairs; **234 of them are required despite an `or` in the rule**, including P4HB
in prolyl 4-hydroxylase, SUCLG1 in succinyl-CoA ligase, DLST in 2-oxoglutarate dehydrogenase
and ACAA1 and ACOX1 in peroxisomal beta oxidation (176 in v1.8.0, 198 in v1.19.0). Splitting
the string on `" or "` fails the same way and leaves parentheses in the pieces.

Other things the rules do and do not tell you:

- **Mixed rules are parenthesised in every release checked** (129 in v2.1.1, none without
  parentheses from v1.8.0 to v2.1.1). Do not depend on that; the parser handles both.
- **No rule is not "spontaneous".** 5,002 reactions have no GPR, and only 192 are flagged
  `spontaneous = 1` in `reactions.tsv`. The rest are mostly transport (1,730), exchange
  (1,652), drug metabolism (396) and peptide metabolism (244) with no gene assigned — gaps in
  annotation, not chemistry that needs no enzyme.
- **Ensembl ids are valid Python identifiers**, which is why `ast.parse` works. A model keyed on
  Entrez numbers would not parse this way.

COBRApy's own GPR evaluator agrees: `model.reactions.get_by_id(r).gpr.eval({gene})` returned the
same answer as `gpr_active` on all 23,566 pairs, read from the v2.1.1 SBML. This optional block
confirms it, and needs `pip install cobra` plus the SBML file:

```python
import urllib.request, cobra
urllib.request.urlretrieve("https://raw.githubusercontent.com/SysBioChalmers/Human-GEM/"
                           "6812be2a5c1504a89ea9e84d770786a84f5f3ce2/model/Human-GEM.xml",
                           "Data/human-gem/v2.1.1/Human-GEM.xml")
model = cobra.io.read_sbml_model("Data/human-gem/v2.1.1/Human-GEM.xml")
disagree = sum(model.reactions.get_by_id(r["id"]).gpr.eval({g}) != gpr_active(r["gene_reaction_rule"], {g})
               for r in gem["rxns"] for g in gpr_genes(r["gene_reaction_rule"]))
from cobra.util.array import create_stoichiometric_matrix
C = sparse.csr_matrix(create_stoichiometric_matrix(model, array_type="lil"))
print("GPR disagreements:", disagree, "| max |S - S_cobra|:", abs(C - S).max())
assert disagree == 0 and abs(C - S).max() == 0
```

## Which subsystems contain a gene

Key the question on the **Ensembl gene id**. GPR rules use nothing else, and the gene list in
the YAML carries a `name` field that is just a label.

Get from a symbol to the id through the model's own `genes.tsv`, matching the `geneSymbols`
column exactly. **Do not fall back to the aliases column silently** — 63 symbols in v2.1.1 are
also an alias of a *different* gene in the same table:

| symbol | is the symbol of | is also an alias of |
|---|---|---|
| `CPS1` | `ENSG00000021826` carbamoyl-phosphate synthase 1 | `ENSG00000231852` CYP21A2 (steroid 21-hydroxylase) |
| `CAD` | `ENSG00000084774` CAD (pyrimidine synthesis) | `ENSG00000102794` ACOD1 (cis-aconitate decarboxylase) |
| `GLA` | `ENSG00000102393` alpha-galactosidase A | `ENSG00000144035` NAT8 |
| `SCD` | `ENSG00000099194` stearoyl-CoA desaturase | `ENSG00000197375` SLC22A5 |

A lookup that searches symbols and aliases together — what many gene-name services do by
default — returns two genes for `CPS1`, one of them in a different pathway. Use the alias
column only when there is no symbol hit, and report it as an alias match: `IRG1` has no symbol
hit, and its alias hit is ACOD1, which is correct.

```python
from collections import defaultdict

def symbol_to_ensembl(gem, symbol):
    exact = [g["genes"] for g in gem["genes_tsv"] if g["geneSymbols"] == symbol]
    if exact:
        return exact, "symbol"
    alias = [g["genes"] for g in gem["genes_tsv"] if symbol in g["geneAliases"].split(";")]
    return alias, "alias" if alias else "not in model"

def gene_subsystems(gem, ensg):
    out = defaultdict(lambda: {"required": [], "replaceable": []})
    for r in gem["rxns"]:
        rule = r["gene_reaction_rule"]
        if ensg in gpr_genes(rule):            # token match, never substring
            role = "replaceable" if gpr_active(rule, {ensg}) else "required"
            for s in r["subsystem"]:
                out[s][role].append(r["id"])
    return dict(out)

for symbol in ["SDHA", "PKM", "CPS1", "IRG1"]:
    ids, how = symbol_to_ensembl(gem, symbol)
    print(f"{symbol}: {ids} ({how})")
    for e in ids:
        for s, roles in sorted(gene_subsystems(gem, e).items()):
            print(f"   {s}: required in {len(roles['required'])}, replaceable in {len(roles['replaceable'])}")
```

v2.1.1:

- **SDHA** — required in 1 reaction of *Tricarboxylic acid cycle and glyoxylate/dicarboxylate
  metabolism*, `MAR04652`, whose rule is `SDHA and SDHB and SDHC and SDHD`.
- **PKM** — in 7 reactions across *Glycolysis / Gluconeogenesis*, *Pyruvate metabolism*, *Purine
  metabolism* and *Pyrimidine metabolism*, and **required in none**: PKLR is an isozyme in every
  one. "PKM is in glycolysis" and "glycolysis needs PKM" are different claims.
- **CPS1** — required in 2 reactions of *Alanine, aspartate and glutamate metabolism*.
- **IRG1** — no symbol hit; the alias resolves to ACOD1 (`ENSG00000102794`), required in 1
  reaction of *C5-branched dibasic acid metabolism*.

A gene not in the model returns an empty list. That is a fact about the reconstruction, not
about the gene: v2.1.1 carries 2,870 genes, where v1.8.0 carried 3,625.
*Transport reactions* counts as a subsystem, so a transporter's subsystems are mostly that.

## Joining out — on identifiers, never labels

The three annotation tables carry cross-references for every model id. Join through them:

| table | key | cross-references |
|---|---|---|
| `genes.tsv` | `genes` (Ensembl gene) | Ensembl transcript and protein, UniProt, symbol, Entrez, name, aliases, compartment evidence |
| `metabolites.tsv` | `mets` (with compartment) and `metsNoComp` | BiGG, KEGG, HMDB, ChEBI, PubChem, LipidMaps, Recon3D, MetaNetX, SMILES, InChI, ModelSEED |
| `reactions.tsv` | `rxns` | KEGG, BiGG, Reactome, Recon3D, MetaNetX, Rhea, TCDB, ModelSEED, `spontaneous` |

Rules for using them:

- **Fields can hold several ids separated by `;`**, and can be empty. In v2.1.1, 3,359 of
  8,374 metabolite rows have no ChEBI id; 11 genes carry more than one Entrez id and 4 more
  than one UniProt id.
  Split before joining.
- **Join metabolites on `metsNoComp`** when the other side has no compartments — ChEBI,
  HMDB and KEGG do not — and expect one external id to fan out to several model rows.
- **`metRetired` and `rxnRetired` are not a "retired" flag.** They list the older ids an entry
  has carried (HMR2 ids, merged `MAR`/`MAM` ids and other legacy ids), and 12,547 of 12,748 reactions have a
  value. Filtering rows on a non-empty `rxnRetired` throws away 98% of the model. They are
  useful the other way: to find the current id for an id quoted in an older paper.
- **The `genes.tsv` columns `compartments` and `compDataSource`** (from v1.19.0) are protein
  localisation annotations with their source (for example `DeepLoc2`), not the compartments of
  the gene's reactions.

For the other side of a join, point at the skill that owns that source: `uniprot` for proteins,
`ensembl` for gene models, `chembl` and `pubchem` for compounds, `reactome` for curated
pathways, `metabolomics-workbench` for measured metabolite levels.

## What does not work

Each of these was tried on 2026-11-12:

| tried | result |
|---|---|
| `https://metabolicatlas.org/api/v2/` | `404` HTML. Metabolic Atlas does answer `/api/v2/repository/integrated_models` with JSON listing Human-GEM 2.1.1, so it is a version check — but it is not a file route, and the GitHub tag is the citable pin. |
| `model/genes.tsv` at `v1.0.0` or `v1.5.0` | `404` — the annotation tables did not live there yet (see *Pin a release*) |
| reading `subsystem` from v2.1.0's SBML | absent — the file has 0 `groups:group` elements, v2.1.1 has 146; read the `.yml` instead |
| `line.split("\t")` on v2.0.0 or v2.1.0 `genes.tsv` | every field keeps its double quotes, so `"PKM"` never equals `PKM`; use `csv` |
| `doc["reactions"]` straight after `yaml.load` | `TypeError` — the document is a list of pairs |
| looking up `ISCA1` in v2.0.0 `genes.tsv` | not found — a middle field is missing, so its symbol column holds `81689`; the loader names the row |
| release assets | none; `releases/latest` lists an empty `assets` array |

## Try it

**Data** — Human-GEM **v2.1.1**, the latest release on 2026-11-12, read straight from the
tagged repository (CC-BY-4.0, no account):
`https://raw.githubusercontent.com/SysBioChalmers/Human-GEM/v2.1.1/model/Human-GEM.yml`, plus
`genes.tsv` and `metabolites.tsv` beside it. Needs `pyyaml` and `scipy`. Confirmed reachable
2026-11-12. The run goes through the traps above: the `!!omap` top level, currency exclusion
by id, a GPR rule where a gene is required despite an `or`, a symbol that is another gene's
alias, and a name that labels two metabolites.

```python
import ast, csv, urllib.request
from collections import Counter
import yaml
from scipy import sparse

BASE = "https://raw.githubusercontent.com/SysBioChalmers/Human-GEM/v2.1.1/model/"
for f in ["Human-GEM.yml", "genes.tsv", "metabolites.tsv"]:
    urllib.request.urlretrieve(BASE + f, f)

doc = yaml.load(open("Human-GEM.yml", encoding="utf-8"), Loader=getattr(yaml, "CSafeLoader", yaml.SafeLoader))
assert isinstance(doc, list)                 # !!omap: a list of (key, value) pairs, not a dict
doc = dict(doc)
meta = dict(doc["metaData"])
mets = [dict(m) for m in doc["metabolites"]]
rxns = [dict(r) for r in doc["reactions"]]
for r in rxns:
    r["metabolites"] = dict(r["metabolites"])
    r["gene_reaction_rule"] = r.get("gene_reaction_rule") or ""
G = list(csv.DictReader(open("genes.tsv", newline="", encoding="utf-8"), delimiter="\t"))
M = list(csv.DictReader(open("metabolites.tsv", newline="", encoding="utf-8"), delimiter="\t"))
short = [next(iter(r.values())) for r in G + M if None in r.values() or None in r]

# stoichiometric matrix
met_ids = [m["id"] for m in mets]
row = {m: i for i, m in enumerate(met_ids)}
trip = [(row[m], j, c) for j, r in enumerate(rxns) for m, c in r["metabolites"].items()]
S = sparse.csr_matrix(([t[2] for t in trip], ([t[0] for t in trip], [t[1] for t in trip])),
                      shape=(len(mets), len(rxns)))
name = {m["id"]: m["name"] for m in mets}

# hubs, raw and with currency excluded by id across every compartment
deg = (S != 0).sum(axis=1).A1
CURRENCY = {"MAM02039": "H+", "MAM02040": "H2O", "MAM01371": "ATP", "MAM01285": "ADP",
            "MAM01334": "AMP", "MAM02751": "Pi", "MAM02759": "PPi", "MAM02552": "NAD+",
            "MAM02553": "NADH", "MAM02554": "NADP+", "MAM02555": "NADPH", "MAM01802": "FAD",
            "MAM01803": "FADH2", "MAM01597": "CoA", "MAM02630": "O2", "MAM01596": "CO2",
            "MAM02046": "HCO3-", "MAM02578": "NH3", "MAM02519": "Na+"}
assert all(name[k + "c"] == v for k, v in CURRENCY.items())
order = [met_ids[i] for i in deg.argsort()[::-1]]
top_raw = order[0]
top_non = next(m for m in order if m[:-1] not in CURRENCY)
second_H = next(m for m in order if m[:-1] == "MAM02039" and m != "MAM02039c")

# GPR: and binds tighter than or; a subunit shared by every complex is required
def tree(rule): return ast.parse(rule, mode="eval").body
def active(rule, absent):
    def ev(n):
        if isinstance(n, ast.BoolOp):
            v = [ev(x) for x in n.values]
            return all(v) if isinstance(n.op, ast.And) else any(v)
        return n.id not in absent
    return ev(tree(rule)) if rule else True
sym = {g["genes"]: g["geneSymbols"] for g in G}
ens = {g["geneSymbols"]: g["genes"] for g in G}
mpc = next(r for r in rxns if r["id"] == "MAR04926")["gene_reaction_rule"]
def genes_of(rule):
    return {n.id for n in ast.walk(tree(rule)) if isinstance(n, ast.Name)} if rule else set()
naive_wrong = sum(1 for r in rxns if " or " in r["gene_reaction_rule"]
                  for g in genes_of(r["gene_reaction_rule"])
                  if not active(r["gene_reaction_rule"], {g}))

# a symbol that is also another gene's alias
cps1_alias_of = [g["genes"] for g in G if "CPS1" in (g["geneAliases"] or "").split(";")]

# a name that labels two different metabolites
retinal = sorted({(m["metsNoComp"], m["metChEBIID"]) for m in M if name[m["mets"]] == "retinal"})

print("release          :", meta["version"], meta["date"])
print("S                :", S.shape, S.nnz, "non-zeros, max |coef|", abs(S).max())
print("collapsed mets   :", len({m["metsNoComp"] for m in M}))
print("top hub raw      :", top_raw, name[top_raw], int(deg[row[top_raw]]))
print("top hub, no curr.:", top_non, name[top_non], int(deg[row[top_non]]))
print("H+ elsewhere     :", second_H, int(deg[row[second_H]]))
print("MPC rule         :", " ".join(sym.get(t, t) for t in mpc.replace("(", " ( ").replace(")", " ) ").split()))
print("required despite 'or':", naive_wrong)
print("CPS1             : symbol of", ens["CPS1"], "| alias of", cps1_alias_of, sym[cps1_alias_of[0]])
print("retinal          :", retinal)
print("short rows       :", short)

# invariants
assert meta["version"] == "2.1.1"
assert not short                             # no row missing a field (v2.0.0 had ISCA1, FDX1)
assert {g["genes"] for g in G} == {dict(g)["id"] for g in doc["genes"]}
assert {m["mets"] for m in M} == set(met_ids)
assert S.nnz == sum(len(r["metabolites"]) for r in rxns)
assert all(m["metsNoComp"] == m["mets"][:-1] for m in M)
assert top_raw[:-1] in CURRENCY and top_non[:-1] not in CURRENCY
assert ast.dump(tree("A or B and C")) == ast.dump(tree("A or (B and C)"))
assert not active(mpc, {ens["MPC2"]}) and active(mpc, {ens["MPC1"]}) and active(mpc, {ens["MPC1L"]})
assert ens["CPS1"] not in cps1_alias_of
assert len({m for m, _ in retinal}) == 2 and len({c for _, c in retinal}) == 2
print("all checks passed")
```

**Expect**

Invariants — these held on every release checked from v1.8.0 to v2.1.1, and a failure means
the skill is wrong:

- `yaml.load` returns a **list**; it becomes a dict only through `dict()`.
- The annotation tables and the YAML carry the same gene and metabolite ids, and `metsNoComp`
  is the id minus its last character.
- The matrix has exactly one non-zero per (metabolite, reaction) entry in the YAML.
- The raw top hub is H+ in the cytosol, and excluding currency **by id** moves the answer to a
  pathway intermediate (L-carnitine in every release checked).
- `A or B and C` parses as `A or (B and C)`.
- `CPS1` is the symbol of one gene and an alias of a different one.

Pinned to v2.1.1 and asserted, but **not** true of every release — each is a counter-example
found in the multi-release pass, kept here so nobody reintroduces the simplification:

- Every `genes.tsv` and `metabolites.tsv` row has its full set of fields. v2.0.0 has two short
  gene rows (ISCA1, FDX1) and two short metabolite rows, v2.1.0 one gene row (FDX1) and v1.19.0
  two metabolite rows.
- In `MAR04926`, MPC2 is required and MPC1 and MPC1L are each replaceable. In v1.8.0 and v1.12.0
  the rule was three isozymes.
- `retinal` names two different `metsNoComp` ids with two different ChEBI ids. Through v1.12.0
  it named one.

Observed 2026-11-12 against **v2.1.1** — these move with each release, so a mismatch is drift
to investigate, not a failure:

```
release          : 2.1.1 2026-10-07
S                : (8374, 12748) 54325 non-zeros, max |coef| 77243.0
collapsed mets   : 4102
top hub raw      : MAM02039c H+ 2663
top hub, no curr.: MAM02348c L-carnitine 249
H+ elsewhere     : MAM02039m 574
MPC rule         : ( MPC1 and MPC2 ) or ( MPC1L and MPC2 )
required despite 'or': 234
CPS1             : symbol of ENSG00000021826 | alias of ['ENSG00000231852'] CYP21A2
retinal          : [('MAM02832', 'CHEBI:17898'), ('MAM20002', 'CHEBI:15035')]
short rows       : []
all checks passed
```

## Citing it

Name the release and the commit, and cite the paper for its major version:

- Luo J, Wang H, Moyer D, et al. Reconstruction of human metabolic models with large language
  models. *PNAS* 123(15):e2516511123 (2026). https://doi.org/10.1073/pnas.2516511123 — Human2, v2.x
- Robinson JL, et al. An atlas of human metabolism. *Sci. Signal.* 13:eaaz1482 (2020).
  https://doi.org/10.1126/scisignal.aaz1482 — Human1, v1.x
- Repository: https://github.com/SysBioChalmers/Human-GEM (CC-BY-4.0); per-release archive on
  Zenodo, https://doi.org/10.5281/zenodo.4099692
