---
name: string
description: Query STRING protein association networks — pin the release, map gene names or UniProt accessions to STRING ids without silent collapses or drops, pull functional, physical or regulatory edges with per-channel evidence, and read the combined score as confidence rather than strength.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, protein-interaction, ppi, uniprot]
covers: [string, string-db, protein-protein interaction, protein interaction network, functional association, physical interaction, regulatory network, interactome, combined score, text mining, coexpression, experimental evidence, curated database, interaction partners, network expansion, ppi enrichment, gene list, human, mouse, yeast, e. coli, all organisms, ensembl protein, network analysis, cytoscape, stringdb]
papers: [PMID:39558183, PMID:36370105]
access: [open]
datasets: ["https://string-db.org/api/json/version", "https://stringdb-downloads.org/download/protein.links.detailed.v12.5/9606.protein.links.detailed.v12.5.txt.gz"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: STRING 12.5 (current since 2026-09-29; API at version-12-5.string-db.org, bulk files at stringdb-downloads.org) with spot checks on 12.0 and 11.5 / Python 3.12.9 standard library only / curl 8 / macOS arm64
  executed: 6
  unverified: 0
---

# STRING — protein association networks

STRING (run by SIB, CPR Copenhagen and EMBL) scores pairs of proteins for how likely they are
to be **functionally associated**: in the same pathway, complex or process. On 2026-11-06 the
current release, 12.5, covered 59.3 million proteins in 12,535 organisms.

Three things to know before using any of it:

- **An edge is not a binding event.** The default network is functional. Two proteins can score
  0.92 because papers mention them together. Use the `physical` network when the question is
  about binding, and read the evidence channels whatever network you use.
- **The score is a confidence, not a strength.** A combined score of 0.9 means STRING
  estimates a 90% chance that the association is real. It says nothing about affinity, effect
  size or how much one protein influences the other.
- **STRING ids are release-specific.** They are Ensembl protein ids with a taxon prefix
  (`9606.ENSP00000269305`). They changed between 11.5 and 12.0 and can change again. Store the
  query and the release next to every id.

**What you need: nothing.** The API and the downloads are anonymous. STRING asks clients to
send a `caller_identity` and to wait one second between calls; the helper below does both.

## Licence

Checked on 2026-11-06 at <https://string-db.org/cgi/access>:

> All data and download files in STRING are freely available under the Creative Commons
> Attribution 4.0 (CC BY 4.0) license. When using the data, please credit STRING and indicate
> any changes or additions you made to the data.

The same page covers commercial use and AI use explicitly: STRING outputs "may be used in AI
applications, such as MCP servers, retrieval-augmented generation (RAG), knowledge graphs and
agent tools, and for training or evaluating machine learning models", and asks that STRING
**and its version** be named in the metadata that goes with the data. The provenance file
written under **Get the files** does that. Material STRING imports from other resources
"remains subject to the terms of its original provider".

This page is original text, CC-BY-4.0, by Heureka Labs.

## Pin the release

`https://string-db.org` always serves the current release, and moves without notice: 12.0 was
current from 2023-07-26 until 2026-09-29, then 12.5 replaced it. Each release keeps a stable
address, `https://version-12-5.string-db.org`, which the `version` endpoint reports. Ask for it
once and send every later call there, so a long job cannot straddle two releases.

Releases differ in more than numbers. The same TP53–MDM2 query returned the edge once from
12.5 and 12.0, and **twice** (two identical rows) from 11.5. The coexpression score for that
pair was 0.116 in 12.0 and 0.129 in 12.5. Do not mix releases in one analysis.

## The helper

The later blocks import this module, so run them from the directory you write it into.

```bash
cat > string_api.py <<'PY'
"""A small STRING API client: pinned version, polite pacing, checked identifier mapping."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

CALLER = "heurekaskills-string-skill"      # STRING asks every client to identify itself
_last = [0.0]


def _post(base, endpoint, params, fmt="json", tries=4):
    url = f"{base}/api/{fmt}/{endpoint}"
    data = urllib.parse.urlencode({**params, "caller_identity": CALLER}).encode()
    for i in range(tries):
        time.sleep(max(0.0, 1.0 - (time.time() - _last[0])))   # one call per second, as asked
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=300) as r:
                body = r.read().decode()
            return json.loads(body) if fmt == "json" else body
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429 or i == tries - 1:
                raise RuntimeError(f"HTTP {e.code} from {url}: {e.read()[:300]!r}") from None
        except (urllib.error.URLError, TimeoutError):
            if i == tries - 1:
                raise
        time.sleep(5 * (i + 1))


def pinned():
    """(version, base URL) of the current release. Use the base for every later call: the
    plain string-db.org address moves to the next release without notice."""
    v = _post("https://string-db.org", "version", {})[0]
    return v["string_version"], v["stable_address"]


def map_ids(base, identifiers, species):
    """Resolve names or accessions to STRING ids, one row per INPUT, in input order.

    STRING returns one row per protein: inputs that resolve to the same protein collapse to
    one row (the last one wins), and inputs that resolve to nothing are left out. Each input
    missing from the batch answer is asked again alone, which tells the two cases apart."""
    rows = _post(base, "get_string_ids", {"identifiers": "\r".join(identifiers),
                                           "species": species, "echo_query": 1, "limit": 1})
    by_index = {int(r["queryIndex"]): r for r in rows}
    out = []
    for i, query in enumerate(identifiers):
        r = by_index.get(i)
        if r is None:                                  # collapsed, or not found: ask alone
            alone = _post(base, "get_string_ids", {"identifiers": query, "species": species,
                                                    "limit": 1})
            r = alone[0] if alone else None
        out.append({"query": query, "string_id": r and r["stringId"],
                    "preferred_name": r and r["preferredName"]})
    for row in out:
        row["same_protein_as"] = [o["query"] for o in out if o is not row
                                  and o["string_id"] and o["string_id"] == row["string_id"]]
    return out


CHANNELS = ("nscore", "fscore", "pscore", "ascore", "escore", "dscore", "tscore")
PRIOR = 0.041


def combined(edge):
    """STRING's combined score from its channel scores: remove the prior from each channel,
    combine as independent evidence, add the prior back once."""
    miss = 1.0
    for k in CHANNELS:
        miss *= 1 - max(0.0, (edge[k] - PRIOR) / (1 - PRIOR))
    return (1 - miss) + PRIOR * miss


def network(base, string_ids, species, required_score=400, network_type="functional"):
    """Edges among the given proteins. required_score is on STRING's 0-1000 scale."""
    if network_type not in ("functional", "physical"):
        raise ValueError("regulatory networks have a different row shape; see the skill text")
    return _post(base, "network", {"identifiers": "\r".join(string_ids), "species": species,
                                   "required_score": required_score, "network_type": network_type})
PY
python3 - <<'EOF'
from string_api import pinned, map_ids
version, base = pinned()
print("STRING", version, "at", base)
for row in map_ids(base, ["TP53", "ARP1", "P04637", "NOTAGENE1", "p53", "EGFR"], 9606):
    print(f"  {row['query']:10} -> {row['string_id']} {row['preferred_name']}  same protein as {row['same_protein_as']}")
EOF
```

On 2026-11-06:

```
STRING 12.5 at https://version-12-5.string-db.org
  TP53       -> 9606.ENSP00000269305 TP53  same protein as ['P04637', 'p53']
  ARP1       -> 9606.ENSP00000234816 ANGPTL1  same protein as []
  P04637     -> 9606.ENSP00000269305 TP53  same protein as ['TP53', 'p53']
  NOTAGENE1  -> None None  same protein as []
  p53        -> 9606.ENSP00000269305 TP53  same protein as ['TP53', 'P04637']
  EGFR       -> 9606.ENSP00000275493 EGFR  same protein as []
```

## Mapping identifiers first

Every endpoint accepts names, but resolve them with `get_string_ids` first and pass STRING ids
from then on. The mapping call has three behaviours that lose data without an error:

| behaviour (12.5, 2026-11-06) | consequence |
|---|---|
| **One row per protein, not per input.** `TP53`, `P04637` and `p53` in one call returned one row, for `p53`, the last of them | the first two inputs vanish from the answer; match on `queryIndex`, never by position |
| **Unmatched inputs are left out.** `NOTAGENE1` produced no row and no message | count rows against inputs |
| **An ambiguous name gets one answer.** `ARP1`, a former symbol of four human proteins (UniProt lists ANGPTL1, ARFRP1, NR2F2 and PITX2), resolved to ANGPTL1 alone, also with `limit=5`; `AIM1` resolved to SLC45A2 of three | the call cannot tell you it chose; compare `preferredName` with what you asked for |

The helper keeps one output row per input, asks again alone for any input missing from the
batch answer (which separates "collapsed" from "not found"), and lists inputs that landed on
the same protein. It costs one extra call per missing input, so for lists in the thousands,
deduplicate before calling.

Mapping is per organism (`species` is an NCBI taxon id), and names are matched loosely:
`TP53` with `species=10090` resolves to mouse `Trp53`. When you have UniProt accessions, pass
those rather than gene symbols. Resolve symbols to accessions in UniProtKB first, filtering on
the primary gene name, so that an ambiguous symbol is caught there rather than settled
silently here.

## Edges, channels and the combined score

`network` returns the edges among the proteins you pass; `interaction_partners` returns the
best-scored partners of each. Both take `required_score` on a **0–1000** scale (default 400,
"medium confidence"; 700 is "high", 900 "highest"), while the scores in the answer are on a
**0–1** scale.

Each edge carries seven channel scores — `nscore` (gene neighbourhood), `fscore` (gene
fusion), `pscore` (phylogenetic co-occurrence), `ascore` (coexpression), `escore`
(experiments), `dscore` (curated databases), `tscore` (text mining) — and the combined
`score`. The combined score is a fixed function of the channels: subtract the prior (0.041)
from each, combine them as independent evidence, and add the prior back once. The helper's
`combined()` reproduces the API's value to within 0.001 on every edge tested — 200 TP53
partners, and gene sets from human, mouse, yeast and *E. coli*. Use it to rebuild a score
from the channels you trust: dropping `tscore` and recomputing is the usual way to ask
"what is left without the literature co-mentions?"

```python
from string_api import pinned, map_ids, network, combined, CHANNELS

version, base = pinned()
genes = ["TP53", "EGFR", "BRCA1", "GAPDH", "ACTB", "MYC", "IL6", "TNF", "INS", "ALB", "APOE", "VEGFA"]
ids = [r["string_id"] for r in map_ids(base, genes, 9606)]

edges = network(base, ids, 9606, required_score=400)
worst = max(abs(combined(e) - e["score"]) for e in edges)
text_only = [e for e in edges if all(e[k] == 0 for k in CHANNELS if k != "tscore")]
print(f"STRING {version}: {len(edges)} functional edges at >= 0.400; "
      f"combined score recomputed from channels within {worst:.4f}")
print(f"  {len(text_only)} rest on text mining alone, e.g.",
      sorted(((e["preferredName_A"], e["preferredName_B"], e["score"]) for e in text_only),
             key=lambda t: -t[2])[:3])

physical = network(base, ids, 9606, required_score=400, network_type="physical")
f = {(e["preferredName_A"], e["preferredName_B"]): e["score"] for e in edges}
p = {(e["preferredName_A"], e["preferredName_B"]): e["score"] for e in physical}
both = sorted(set(f) & set(p))
print(f"  physical subnetwork: {len(physical)} edges; the same pair scores differently, e.g.",
      [(k, f[k], p[k]) for k in both if f[k] != p[k]][:2])
```

On 2026-11-06:

```
STRING 12.5: 58 functional edges at >= 0.400; combined score recomputed from channels within 0.0010
  21 rest on text mining alone, e.g. [('INS', 'IL6', 0.924), ('INS', 'TNF', 0.924), ('ALB', 'IL6', 0.92)]
  physical subnetwork: 14 edges; the same pair scores differently, e.g. [(('ALB', 'INS'), 0.933, 0.518), (('ALB', 'TNF'), 0.97, 0.8)]
```

More than a third of the edges among these twelve heavily studied genes have no evidence but
text mining, and several of them score above 0.9. The `physical` network is a separate
network with its own channel scores, not a filter on the functional one: the same pair gets
a different value in each.

## Network statistics, partners and direction

`ppi_enrichment` reports whether a gene set has more edges among its members than a random
set of the same size would have. Two cautions. Well-studied genes are densely connected in
STRING whether or not they are related in your experiment, so the null is not "random
biology". And a non-significant result does not mean the genes are unconnected: twelve
textbook genes with 58 edges between them came out at p = 0.40, because 57 were expected. For
enrichment of GO terms or pathways in a gene list, use the `pathway-enrichment` skill rather
than STRING's enrichment endpoint, which this skill does not cover.

`interaction_partners` with `limit` returns the top partners by score, and many partners tie
at 0.999. Which tied partners make the cut is not defined, so the list can change between
calls; take all partners above a threshold instead of the top N when the set matters.

`network_type=regulatory` (new in 12.x) returns **directed** edges with a `sign` (`pos`,
`neg` or `n/a`) and a different row shape: `source_string_id`/`target_string_id` and
`combined_score`, with no `stringId_A`. Code written for the functional rows raises a
`KeyError` on them. The sign is often missing: of 559 regulatory rows for TP53 on 2026-11-06,
149 were `n/a`, including TP53 → MDM2, a textbook case of positive regulation. Those 559 rows
also came back for `limit=500`, so do not rely on `limit` to cap regulatory answers.

```python
from string_api import _post, pinned, map_ids

version, base = pinned()
genes = ["TP53", "EGFR", "BRCA1", "GAPDH", "ACTB", "MYC", "IL6", "TNF", "INS", "ALB", "APOE", "VEGFA"]
ids = [r["string_id"] for r in map_ids(base, genes, 9606)]
stats = _post(base, "ppi_enrichment", {"identifiers": "\r".join(ids), "species": 9606})[0]
print(f"{stats['number_of_edges']} edges observed, {stats['expected_number_of_edges']} expected, "
      f"p = {stats['p_value']}")

partners = _post(base, "interaction_partners", {"identifiers": ids[0], "species": 9606,
                                                "limit": 10, "required_score": 900})
print("TP53 top partners:", [(e["preferredName_B"], e["score"]) for e in partners][:5])

reg = _post(base, "network", {"identifiers": "\r".join(ids[:2] + [partners[0]["stringId_B"]]),
                              "species": 9606, "network_type": "regulatory"})
print("regulatory row keys:", sorted(reg[0]) if reg else "no regulatory edges")
```

On 2026-11-06:

```
58 edges observed, 57 expected, p = 0.4038
TP53 top partners: [('SIRT1', 0.999), ('MAPK1', 0.999), ('AURKA', 0.999), ('CSNK2A1', 0.999), ('STUB1', 0.999)]
regulatory row keys: ['combined_score', 'database_score', 'experimental_score', 'ncbiTaxonId', 'sign', 'source_preferred_name', 'source_string_id', 'target_preferred_name', 'target_string_id', 'textmining_score']
```

## Get the files

**A network for a gene list, through the API.** The block maps the list, pulls the edges at
high confidence (700), and writes a node table with one row per input, an edge table with
every channel, and a provenance record. The record names the release and the stable address,
lists inputs that matched nothing, and lists inputs STRING resolved to a differently named
protein so a person can check them. `ARP1` is in the list on purpose, to show what that
looks like.

```python
import csv
import json
import time
from string_api import CHANNELS, map_ids, network, pinned

GENES = ["TP53", "MDM2", "CDKN1A", "ATM", "CHEK2", "BAX", "PUMA", "NOXA", "ARP1", "NOTAGENE1"]
SPECIES, MIN_SCORE = 9606, 700

version, base = pinned()
mapping = map_ids(base, GENES, SPECIES)
ids = sorted({m["string_id"] for m in mapping if m["string_id"]})
edges = network(base, ids, SPECIES, required_score=MIN_SCORE)

with open("string_nodes.tsv", "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["query", "string_id", "preferred_name", "same_protein_as"])
    for m in mapping:
        w.writerow([m["query"], m["string_id"] or "", m["preferred_name"] or "",
                    ",".join(m["same_protein_as"])])
with open("string_edges.tsv", "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["string_id_a", "string_id_b", "name_a", "name_b", "combined", *CHANNELS])
    for e in edges:
        w.writerow([e["stringId_A"], e["stringId_B"], e["preferredName_A"], e["preferredName_B"],
                    e["score"], *(e[k] for k in CHANNELS)])
with open("string_network.provenance.json", "w") as fh:
    json.dump({"source": f"STRING {version} API, {base}", "species": SPECIES,
               "network_type": "functional", "required_score": MIN_SCORE, "queried": GENES,
               "unmatched": [m["query"] for m in mapping if not m["string_id"]],
               "renamed": {m["query"]: m["preferred_name"] for m in mapping
                           if m["string_id"] and m["query"].upper() != m["preferred_name"].upper()},
               "edges": len(edges), "nodes": len(ids),
               "downloaded": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "licence": f"CC BY 4.0 — credit STRING {version} and state any changes"}, fh, indent=2)
print(open("string_network.provenance.json").read())
```

On 2026-11-06 it wrote `string_nodes.tsv` (10 rows), `string_edges.tsv` (20 edges among 9
proteins) and `string_network.provenance.json`, which included:

```
  "unmatched": ["NOTAGENE1"],
  "renamed": {"PUMA": "BBC3", "NOXA": "PMAIP1", "ARP1": "ANGPTL1"},
  "edges": 20,
  "nodes": 9,
```

`PUMA` and `NOXA` are old names correctly resolved to their current symbols. `ARP1` is the
wrong protein for anyone who meant ARFRP1, NR2F2 or PITX2, and nothing but this list shows it.

**Whole organisms, from the download server.** For a complete network, use the per-organism
files at `https://stringdb-downloads.org/download/`. Size them with `HEAD` first — the
all-organism links file is 134 GB — and inspect the format with a ranged read rather than a
download:

```bash
V=12.5                     # match the API's string_version; files exist per release
DL=https://stringdb-downloads.org/download
for f in "protein.links.v$V/9606.protein.links.v$V.txt.gz" \
         "protein.links.detailed.v$V/9606.protein.links.detailed.v$V.txt.gz" \
         "protein.physical.links.v$V/9606.protein.physical.links.v$V.txt.gz" \
         "protein.info.v$V/9606.protein.info.v$V.txt.gz" \
         "protein.links.v$V.txt.gz"; do
  size=$(curl -fsSI "$DL/$f" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}')
  [ -n "$size" ] || { echo "refusing: no Content-Length for $f" >&2; exit 1; }
  printf '%10.1f MB  %s\n' "$(echo "$size / 1000000" | bc -l)" "$f"
done
# the first 64 kB of the detailed human file, decompressed as far as it goes: columns and scale
curl -fsS -r 0-65535 "$DL/protein.links.detailed.v$V/9606.protein.links.detailed.v$V.txt.gz" |
  python3 -c "import sys, zlib; t = zlib.decompressobj(31).decompress(sys.stdin.buffer.read());
print(*t.decode().splitlines()[:3], sep='\n')"
```

On 2026-11-06:

```
      62.8 MB  protein.links.v12.5/9606.protein.links.v12.5.txt.gz
     103.0 MB  protein.links.detailed.v12.5/9606.protein.links.detailed.v12.5.txt.gz
       7.3 MB  protein.physical.links.v12.5/9606.protein.physical.links.v12.5.txt.gz
       2.0 MB  protein.info.v12.5/9606.protein.info.v12.5.txt.gz
  133758.4 MB  protein.links.v12.5.txt.gz
protein1 protein2 neighborhood fusion cooccurence coexpression experimental database textmining combined_score
9606.ENSP00000000233 9606.ENSP00000000412 0 0 0 97 0 0 151 200
9606.ENSP00000000233 9606.ENSP00000037243 0 0 0 159 0 0 63 178
```

The files are space-separated and use **integers 0–1000**, where the API uses 0–1. Divide by
1000 before mixing the two. The column names differ from the API's too (`coexpression` is
`ascore`, `cooccurence` — spelled so — is `pscore`). `protein.info` maps each STRING id to a
preferred name and is the file to join on. Its 12.5 copy has the same size and date as
12.0's, consistent with the release history's identical protein count (59,309,604) for both. The download files carry the same CC BY 4.0
terms as the API.

## Try it

**Data.** The live STRING 12.5 API and the first 64 kB of the human detailed-links file
(`9606.protein.links.detailed.v12.5.txt.gz`). CC BY 4.0, no account. Both reachable on
2026-11-06.

**Run.** Self-contained; Python 3.9+ standard library only; about ten seconds, most of it the
one-second spacing STRING asks for.

```python
import json
import time
import urllib.parse
import urllib.request
import zlib


def api(base, endpoint, **params):
    time.sleep(1)                                         # STRING asks for one call per second
    params["caller_identity"] = "heurekaskills-string-tryit"
    data = urllib.parse.urlencode(params).encode()
    with urllib.request.urlopen(f"{base}/api/json/{endpoint}", data=data, timeout=120) as r:
        return json.loads(r.read())


def combined(scores, prior=0.041):
    miss = 1.0
    for s in scores:
        miss *= 1 - max(0.0, (s - prior) / (1 - prior))
    return (1 - miss) + prior * miss


CH = ("nscore", "fscore", "pscore", "ascore", "escore", "dscore", "tscore")

# 1. pin the release
v = api("https://string-db.org", "version")[0]
base = v["stable_address"]
assert api(base, "version")[0]["string_version"] == v["string_version"]
print("release            :", v["string_version"], base)

# 2. three names for one protein come back as ONE row; an unknown name is simply absent
rows = api(base, "get_string_ids", identifiers="TP53\rP04637\rp53\rNOTAGENE1", species=9606,
           echo_query=1)
assert len({r["stringId"] for r in rows}) == 1 and len(rows) == 1
assert "NOTAGENE1" not in {r["queryItem"] for r in rows}
print("4 inputs, rows back:", len(rows), "->", rows[0]["queryItem"], rows[0]["stringId"])

# 3. the combined score is a function of the channel scores, and is not their maximum
edges = api(base, "network", identifiers="9606.ENSP00000269305\r9606.ENSP00000258149",
            species=9606)
e = edges[0]
assert abs(combined([e[k] for k in CH]) - e["score"]) <= 0.002
assert e["score"] >= max(e[k] for k in CH)
print("TP53-MDM2 functional:", e["score"], {k: e[k] for k in CH if e[k]})

# 4. the physical network is a different network with different channel scores
p = api(base, "network", identifiers="9606.ENSP00000269305\r9606.ENSP00000258149",
        species=9606, network_type="physical")[0]
print("TP53-MDM2 physical  :", p["score"], {k: p[k] for k in CH if p[k]})

# 5. regulatory rows are directed and use different column names
reg = api(base, "network", identifiers="9606.ENSP00000269305\r9606.ENSP00000258149",
          species=9606, network_type="regulatory")
assert reg and "source_string_id" in reg[0] and "stringId_A" not in reg[0]
print("regulatory          :", [(r["source_preferred_name"], r["target_preferred_name"],
                                 r["sign"], r["combined_score"]) for r in reg])

# 6. the bulk files use 0-1000 integers, and the same formula holds on them
url = (f"https://stringdb-downloads.org/download/protein.links.detailed.v{v['string_version']}/"
       f"9606.protein.links.detailed.v{v['string_version']}.txt.gz")
req = urllib.request.Request(url, headers={"Range": "bytes=0-65535"})
with urllib.request.urlopen(req, timeout=120) as r:
    assert r.status == 206
    lines = zlib.decompressobj(31).decompress(r.read()).decode().splitlines()
head, first = lines[0].split(), lines[1].split()
nums = [int(x) / 1000 for x in first[2:9]]
assert head[-1] == "combined_score" and abs(combined(nums) - int(first[-1]) / 1000) <= 0.002
print("bulk file row       :", " ".join(first), "| recomputed", round(combined(nums) * 1000))
```

**Expect**

Invariants — a failure means the skill is wrong:

- The stable address reports the same version as the moving address.
- `TP53`, `P04637` and `p53` sent together come back as **one** row, and `NOTAGENE1` produces
  no row.
- The combined score for TP53–MDM2 is reproduced from its seven channels within 0.002, and is
  at least as large as its largest channel.
- Regulatory rows carry `source_string_id`, not `stringId_A`.
- The bulk file answers a ranged request with `206`, its last column is `combined_score`, and
  the same formula holds on its 0–1000 integers.

Observed on 2026-11-06 against 12.5 — channel values move between releases, so a mismatch is
drift to investigate:

```
release            : 12.5 https://version-12-5.string-db.org
4 inputs, rows back: 1 -> p53 9606.ENSP00000269305
TP53-MDM2 functional: 0.999 {'ascore': 0.129, 'escore': 0.999, 'dscore': 0.9, 'tscore': 0.984}
TP53-MDM2 physical  : 0.999 {'escore': 0.999, 'dscore': 0.7, 'tscore': 0.927}
regulatory          : [('MDM2', 'TP53', 'n/a', 0.997), ('TP53', 'MDM2', 'n/a', 0.996)]
bulk file row       : 9606.ENSP00000000233 9606.ENSP00000000412 0 0 0 97 0 0 151 200 | recomputed 201
```

## Sources

- STRING — https://string-db.org/ ; API help — https://string-db.org/help/api/
- Access, licensing and release history — https://string-db.org/cgi/access
- Downloads — https://string-db.org/cgi/download
- Szklarczyk et al. (2025) The STRING database in 2025: protein networks with directionality
  of regulation. *Nucleic Acids Research* 53, D730–D737 — https://doi.org/10.1093/nar/gkae1113
- Szklarczyk et al. (2023) The STRING database in 2023. *Nucleic Acids Research* 51, D638–D646
  — https://doi.org/10.1093/nar/gkac1000
