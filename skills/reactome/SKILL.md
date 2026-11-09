---
name: reactome
description: Navigate the Reactome pathway knowledgebase — map proteins to lowest-level and ancestor pathways, roll them up the hierarchy, open reactions into participants with stoichiometry, sets and literature, and resolve identifier lists — handling the 404, 403, 429 and object-reference behaviours that otherwise lose data.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, reactome, uniprot]
covers: [reactome, pathway, pathways, biological pathway, reaction, biochemical reaction, pathway hierarchy, top-level pathway, signaling, metabolism, complex, protein complex, entity set, stoichiometry, participants, catalyst, chebi, uniprot, ensembl, orthology, inferred pathways, human, mouse, rat, yeast, disease pathways, curated knowledgebase, literature references, identifier mapping, pathway membership]
papers: [PMID:37941124]
access: [open]
datasets: ["https://reactome.org/ContentService/data/mapping/UniProt/P04637/pathways?species=9606", "https://reactome.org/ContentService/data/eventsHierarchy/9606?pathwaysOnly=true"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: Reactome release 98 (ContentService and AnalysisService; download files dated 2026-10-18) / Python 3.12.9 standard library only / curl 8 / macOS arm64
  executed: 7
  unverified: 0
---

# Reactome — the pathway knowledgebase

Reactome is a curated, peer-reviewed database of human biological processes, built by
groups at OICR, EMBL-EBI, NYU Grossman School of Medicine and OHSU. Its unit is the **reaction**: inputs become outputs, in a
compartment, perhaps with a catalyst, each backed by literature. Reactions are grouped into
pathways, and pathways into a hierarchy of 29 human top-level pathways. Other species are
**inferred** from human by orthology rather than curated.

This skill is about **reading the knowledgebase**: which pathways a protein is in at each
level of the hierarchy, what happens inside a reaction, which molecules take part and in what
quantity, and how identifiers resolve. For over-representation or GSEA statistics on a gene
list, including Reactome gene sets, use the `pathway-enrichment` skill; this one does not
compute enrichment.

**What you need: nothing.** No key or account. Two access details matter, though, and both
surface as errors that look like something else (see **Talking to the API**).

## Licence

From <https://reactome.org/license>, checked 2026-11-06: "All data in the Reactome database
and files derived from that data are licensed under the Creative Commons Public Domain
Dedication (CC0)". Commercial use and redistribution need no permission; attribution is
encouraged, not required. Pathway illustrations, the icon library and other art are CC BY 4.0,
and Reactome's software is Apache-2.0, apart from the FoamTree treemap component, which has
its own licence. This skill uses data only.

This page is original text, CC-BY-4.0, by Heureka Labs.

## Talking to the API

Two services, one host:

- **ContentService** (`https://reactome.org/ContentService/`) answers questions about the
  knowledgebase: entities, events, hierarchy, mappings, search.
- **AnalysisService** (`https://reactome.org/AnalysisService/`) takes a list of identifiers
  and maps it onto pathways. It is the enrichment engine, and it is also the most forgiving
  identifier resolver Reactome has, which is how this skill uses it.

What happened when calling them on 2026-11-06:

| behaviour | consequence |
|---|---|
| Python's default `User-Agent` (`Python-urllib/3.x`) gets **HTTP 403** from the Cloudflare front end; `curl`, `python-requests` and any custom string get 200 | set a `User-Agent`; a 403 here is not a permissions problem |
| **HTTP 429** with no `Retry-After`, at one call per second and occasionally at one every two seconds; after a burst, calls took about 4 seconds each | pace calls, back off on 429, and prefer one hierarchy call over one call per pathway |
| **404 means "nothing found"**, and it is the same answer for an unknown accession, a secondary accession and an isoform accession | resolve accessions in UniProt first; never read a 404 as "this protein is in no pathway" |
| There is one live release (98 on 2026-11-06), reported by `/data/database/version` and nowhere in the responses | record the release with every result |
| Stable ids carry a version, `R-HSA-69685.4`; the bare `R-HSA-69685` always means the current version | store `stIdVersion` when you need to know the record has not changed |

## The helper

The later blocks import this module, so run them from the directory you write it into.

```bash
cat > reactome.py <<'PY'
"""A small Reactome client: ContentService, AnalysisService, polite and explicit. Stdlib only."""
import csv
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://reactome.org"
# Reactome sits behind Cloudflare, which answers Python's default User-Agent with HTTP 403.
HEADERS = {"User-Agent": "heurekaskills-reactome-skill"}
_last = [0.0]


def call(path, params=None, data=None, content_type=None, tries=6, raw=False):
    """GET (or POST) one Reactome URL. Returns parsed JSON, or text when raw=True.

    Returns None on 404, which Reactome uses for "nothing found" as well as "unknown id".
    Retries 429 (sent without Retry-After, even at one call every two seconds) and 5xx."""
    url = f"{BASE}/{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    headers = dict(HEADERS, **({"Content-Type": content_type} if content_type else {}))
    for i in range(tries):
        time.sleep(max(0.0, 1.0 - (time.time() - _last[0])))
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=300) as r:
                body = r.read().decode()
            return body if raw else json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(10 * (i + 1))
                continue
            raise RuntimeError(f"HTTP {e.code} from {url}: {e.read()[:300]!r}") from None
        except (urllib.error.URLError, TimeoutError):
            if i == tries - 1:
                raise
            time.sleep(10 * (i + 1))


def release():
    return call("ContentService/data/database/version")


def lowest_pathways(uniprot, species=9606):
    """The lowest-level pathways an accession takes part in. [] when Reactome has none, which
    includes unknown accessions, secondary accessions and isoform accessions alike."""
    return call(f"ContentService/data/mapping/UniProt/{uniprot}/pathways",
                {"species": species}) or []


def parents_map(species=9606):
    """child stId -> set of parent stIds, for every pathway of a species, from one call.
    A pathway can have several parents, so this is a graph, not a tree."""
    parents, names, top = {}, {}, set()

    def walk(node, parent):
        names[node["stId"]] = node["name"]
        if parent:
            parents.setdefault(node["stId"], set()).add(parent)
        else:
            top.add(node["stId"])
        for child in node.get("children", []):
            walk(child, node["stId"])

    for root in call(f"ContentService/data/eventsHierarchy/{species}", {"pathwaysOnly": "true"}):
        walk(root, None)
    return parents, names, top


def ancestors(stid, parents):
    seen, todo = set(), [stid]
    while todo:
        for p in parents.get(todo.pop(), ()):
            if p not in seen:
                seen.add(p)
                todo.append(p)
    return seen


def analysis_map(identifiers, projection=True):
    """Submit identifiers to the AnalysisService and return (token, found_rows, not_found).

    Used here as an identifier report, not for its p-values. projection=True maps non-human
    identifiers onto human pathways. Interactors stay off: they add pathways reached only
    through an interaction partner."""
    kind = "projection" if projection else ""
    res = call(f"AnalysisService/identifiers/{kind}",
               {"interactors": "false", "includeDisease": "true", "pageSize": 1, "page": 1},
               data="\n".join(identifiers).encode(), content_type="text/plain")
    token = urllib.parse.unquote(res["summary"]["token"])   # it arrives percent-encoded
    found = call(f"AnalysisService/download/{token}/entities/found/TOTAL/found.csv", raw=True)
    missing = call(f"AnalysisService/download/{token}/entities/notfound/notfound.csv", raw=True)
    rows = list(csv.DictReader(io.StringIO(found or "")))
    not_found = [ln.strip() for ln in (missing or "").splitlines()[1:] if ln.strip()]
    return token, rows, not_found
PY
python3 -c "
from reactome import release, lowest_pathways
print('Reactome release', release())
for acc in ('P04637', 'Q15086', 'P04637-2', 'Q00000'):
    print(f'  {acc:9} lowest-level pathways: {len(lowest_pathways(acc))}')
"
```

On 2026-11-06:

```
Reactome release 98
  P04637    lowest-level pathways: 46
  Q15086    lowest-level pathways: 0
  P04637-2  lowest-level pathways: 0
  Q00000    lowest-level pathways: 0
```

`Q15086` is a secondary accession of `P04637` (TP53), and `P04637-2` is one of its isoforms.
Both get the same empty answer as `Q00000`, which is no protein at all.

## From a protein to its pathways

`/data/mapping/UniProt/{accession}/pathways?species=…` returns the **lowest-level** pathways
only, the ones that contain the protein's reactions directly. Asking "which processes is this
protein in" usually means every level, so walk up the hierarchy. Calling
`/data/event/{id}/ancestors` once per pathway is the obvious route and the one that runs into
429s; `/data/eventsHierarchy/{species}?pathwaysOnly=true` returns the whole pathway tree in one
561 kB call (0.2 s), and the helper builds a parent map from it.

The hierarchy is a graph, not a tree. Some pathways have more than one parent, so a protein
can roll up into the same top-level pathway along several routes, or into several top-level
pathways. Count distinct pathways, not paths.

```python
from collections import Counter
from reactome import ancestors, lowest_pathways, parents_map

parents, names, top = parents_map(9606)
low = lowest_pathways("P04637", 9606)
every = set()
by_top = Counter()
for p in low:
    up = ancestors(p["stId"], parents)
    every |= up | {p["stId"]}
    for t in (up | {p["stId"]}) & top:
        by_top[names[t]] += 1
multi = sorted(names[s] for s in every if len(parents.get(s, ())) > 1)
print(f"TP53: {len(low)} lowest-level pathways, {len(every)} at all levels, "
      f"{sum(p['isInDisease'] for p in low)} of them disease pathways")
print(f"  {len(multi)} of those have more than one parent, e.g. {multi[:2]}")
print("  by top-level pathway:", by_top.most_common(6))

mouse = lowest_pathways("P02340", 10090)
print(f"mouse Trp53: {len(mouse)} pathways, {sum(p['isInferred'] for p in mouse)} inferred from human")
```

On 2026-11-06:

```
TP53: 46 lowest-level pathways, 125 at all levels, 2 of them disease pathways
  4 of those have more than one parent, e.g. ['MyD88 cascade initiated on plasma membrane', 'MyD88 dependent cascade initiated on endosome']
  by top-level pathway: [('Gene expression (Transcription)', 18), ('Cell Cycle', 6), ('Cellular responses to stimuli', 4), ('Metabolism of proteins', 4), ('Programmed Cell Death', 3), ('Immune System', 3)]
mouse Trp53: 22 pathways, 22 inferred from human
```

Read three fields on every pathway before using it:

- `isInferred` — the event was projected from another species by orthology, not curated in
  this one. Every mouse pathway for Trp53 is inferred. An inferred pathway says that the
  human process probably has a mouse counterpart; it is not mouse evidence.
- `isInDisease` — the disease branch models what goes wrong (mutant proteins, viral
  hijacking). Two of TP53's 46 pathways are disease pathways, and SARS-CoV-2 spike
  (`P0DTC2`, under `species=9606`) has 6 of 8. Keep these apart from normal physiology.
- `species` — viral and bacterial proteins appear in human pathways because the pathway
  describes human infection, so filter on the pathway's species, not the protein's.

## Inside a reaction

`/data/query/{stId}` returns the full record of any object: a reaction's inputs, outputs,
catalysts, compartment, preceding events, literature and summary text. **Objects the response
has already printed once come back as their bare integer `dbId` instead of a dictionary.**
That is how stoichiometry is encoded: CHEK2 phosphorylating the TP53 tetramer consumes four ATP,
and the `input` list holds the ATP dictionary once followed by its `dbId` three times. Code
that calls `x["displayName"]` on every element raises a `TypeError`; code that skips the
integers reports one ATP.

`/data/participants/{stId}/referenceEntities` flattens a reaction to the reference molecules
behind it (UniProt and ChEBI ids), catalysts included. It is the quickest route to "which
proteins and small molecules", and it discards stoichiometry, compartments, modification
states and the difference between a complex and a set.

That last difference matters. A **Complex** needs all of its components. A **DefinedSet** or
**CandidateSet** means *any one of* its members. `TP63 Tetramer/TP53 Tetramer`
(`R-HSA-5632387`) is a CandidateSet, so a reaction using it is satisfied by either protein,
and a pathway reached through a set member is weaker evidence of involvement than one reached
through a complex. The physical entities in a reaction carry `schemaClass`; check it.

```python
from reactome import call

rxn = call("ContentService/data/query/R-HSA-69685")
print(rxn["schemaClass"], rxn["stIdVersion"], "-", rxn["displayName"])

# Objects the response has already shown once come back as their bare integer dbId.
seen = {}
def index(node):
    if isinstance(node, dict):
        if "dbId" in node:
            seen.setdefault(node["dbId"], node)
        for v in node.values():
            index(v)
    elif isinstance(node, list):
        for v in node:
            index(v)
index(rxn)
for side in ("input", "output"):
    items = [seen[x] if isinstance(x, int) else x for x in rxn[side]]
    counts = {}
    for it in items:
        counts[it["displayName"]] = counts.get(it["displayName"], 0) + 1
    print(f"  {side:6}: raw {[x if isinstance(x, int) else x['displayName'] for x in rxn[side]]}")
    print(f"          stoichiometry {counts}")

refs = call("ContentService/data/participants/R-HSA-69685/referenceEntities")
print("  reference molecules:", sorted(f"{r['databaseName']}:{r['identifier']}" for r in refs))
print("  literature:", len(rxn["literatureReference"]), "references; inferred:", rxn["isInferred"])

hits = call("ContentService/search/query", {"query": "TP53", "types": "Set",
                                            "species": "Homo sapiens", "cluster": "true"})
entry = hits["results"][0]["entries"][0]
print("  search result name, as returned:", entry["name"])
```

On 2026-11-06:

```
Reaction R-HSA-69685.4 - CHEK2 phosphorylates TP53
  input : raw ['p-S15-TP53 Tetramer [nucleoplasm]', 'ATP [nucleoplasm]', 29358, 29358, 29358]
          stoichiometry {'p-S15-TP53 Tetramer [nucleoplasm]': 1, 'ATP [nucleoplasm]': 4}
  output: raw ['p-S15,S20-TP53 Tetramer [nucleoplasm]', 'ADP [nucleoplasm]', 113582, 113582, 113582]
          stoichiometry {'p-S15,S20-TP53 Tetramer [nucleoplasm]': 1, 'ADP [nucleoplasm]': 4}
  reference molecules: ['ChEBI:30616', 'ChEBI:456216', 'UniProt:O96017', 'UniProt:P04637']
  literature: 4 references; inferred: False
  search result name, as returned: NDN, <span class="highlighting" >TP53</span>
```

CHEK2 (`O96017`) is the catalyst, not an input, yet it is among the reference molecules. And
the search endpoint wraps matched words in HTML `<span>` tags inside the `name` field; strip
them before you display or compare names.

## Resolving identifier lists

The AnalysisService accepts mixed identifiers — gene symbols, UniProt and Ensembl ids,
identifiers from other species — and reports what each one matched. Its `projection` mode maps
non-human identifiers onto human pathways via orthology. Used this way it is an identifier
report, and its p-values can be ignored.

What it does differently from ContentService, all observed on 2026-11-06:

- It resolves the secondary accession `Q15086` to `P04637`, which ContentService answers
  with 404.
- It still does not recognise the isoform accession `P04637-2`.
- The `token` it returns arrives percent-encoded (`…MTMwODQ%3D`); decode it before putting it
  in a download URL. The found and not-found tables are then CSV downloads under
  `/download/{token}/entities/found/TOTAL/…csv` and `…/entities/notfound/…csv`. Tokens are not
  permanent, so save the tables when you get them.
- Interactors (`interactors=true`) add pathways reached only through an IntAct interaction
  partner. The helper leaves them off; turning them on changes the answer to "pathways near
  this protein", which is a different question.

```python
from collections import defaultdict
from reactome import analysis_map

ids = ["TP53", "P04637", "Q15086", "ENSG00000141510", "P02340", "P04637-2", "EGFR", "NOTAGENE1"]
token, found, not_found = analysis_map(ids)
to = defaultdict(set)
for r in found:
    to[r["Submitted identifier"]].add(f"{r['Resource']}:{r['Found identifier']}")
for i in ids:
    print(f"  {i:16} -> {sorted(to[i]) if i in to else 'NOT FOUND' if i in not_found else '?'}")
print("token", token, "| kept on the server for a limited time; save what you need now")
```

On 2026-11-06:

```
  TP53             -> ['ENSEMBL:ENSG00000141510', 'UNIPROT:P04637']
  P04637           -> ['UNIPROT:P04637']
  Q15086           -> ['UNIPROT:P04637']
  ENSG00000141510  -> ['ENSEMBL:ENSG00000141510', 'UNIPROT:P04637']
  P02340           -> ['UNIPROT:P04637']
  P04637-2         -> NOT FOUND
  EGFR             -> ['ENSEMBL:ENSG00000146648', 'ENSEMBL:ENST00000275493', 'UNIPROT:P00533']
  NOTAGENE1        -> NOT FOUND
token MjAyNjExMDYxNjQ3MDRfMTMwOTE= | kept on the server for a limited time; save what you need now
```

Five of the eight inputs are TP53 under different names, mouse `P02340` included. Deduplicate
on the found UniProt accession before counting genes.

## Get the files

**A pathway table for a list of proteins.** The block writes one row per accession and
pathway, marking each as `lowest` or `ancestor` with its top-level pathway(s) and its inferred
and disease flags, plus a provenance record with the release. The list includes the secondary
accession `Q15086` to show where such inputs end up.

```python
import csv
import json
import time
from reactome import ancestors, lowest_pathways, parents_map, release

ACCESSIONS = ["P04637", "Q00987", "P38936", "O96017", "Q13315", "Q15086"]   # TP53 MDM2 CDKN1A CHEK2 ATM + a secondary
SPECIES = 9606

rel = release()
parents, names, top = parents_map(SPECIES)
tops_of = lambda st: ";".join(sorted(names[t] for t in (ancestors(st, parents) | {st}) & top))
rows, empty = [], []
for acc in ACCESSIONS:
    low = lowest_pathways(acc, SPECIES)
    if not low:
        empty.append(acc)
    up = set().union(*(ancestors(p["stId"], parents) for p in low)) - {p["stId"] for p in low}
    for p in low:
        rows.append([acc, p["stId"], p["stIdVersion"], p["displayName"], "lowest",
                     tops_of(p["stId"]), p["isInferred"], p["isInDisease"]])
    for a in sorted(up):                       # each ancestor once per accession
        rows.append([acc, a, "", names[a], "ancestor", tops_of(a), "", ""])

with open("reactome_pathways.tsv", "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["uniprot", "pathway", "pathway_version", "name", "level", "top_level",
                "inferred", "disease"])
    w.writerows(rows)
with open("reactome_pathways.provenance.json", "w") as fh:
    json.dump({"source": "Reactome ContentService", "release": rel, "species": SPECIES,
               "accessions": ACCESSIONS, "no_pathways": empty, "rows": len(rows),
               "note": "no_pathways mixes accessions Reactome lacks with secondary and isoform "
                       "accessions; resolve those in UniProt and retry",
               "downloaded": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "licence": "Reactome data CC0 1.0; attribution encouraged"}, fh, indent=2)
print(f"release {rel}: {len(rows)} rows for {len(ACCESSIONS)} accessions; no pathways for {empty}")
```

On 2026-11-06:

```
release 98: 335 rows for 6 accessions; no pathways for ['Q15086']
```

The provenance file lists `Q15086` under `no_pathways`. Resolve such accessions in UniProt (it
is TP53) rather than reporting them as proteins without pathways.

**The whole knowledgebase, from the download server.** `https://reactome.org/download/current/`
holds the mapping files (`UniProt2Reactome.txt` for lowest-level pathways,
`UniProt2Reactome_All_Levels.txt` for every level, the same for Ensembl, NCBI and ChEBI), the
hierarchy (`ReactomePathwaysRelation.txt`) and a full graph-database dump. The text files are
served without a `Content-Length`, and a `Range` request gets the whole file back: about 41 MB
for `UniProt2Reactome.txt` on 2026-11-06. So size the dump with `HEAD`, and inspect a text
file by reading a few lines and closing the connection:

```bash
DL=https://reactome.org/download/current
UA="heurekaskills-reactome-skill"
for f in UniProt2Reactome.txt UniProt2Reactome_All_Levels.txt ReactomePathwaysRelation.txt reactome.graphdb.tgz; do
  printf '%-34s ' "$f"
  curl -fsSI -A "$UA" "$DL/$f" | tr -d '\r' |
    awk 'tolower($1)=="content-length:"{l=$2} tolower($1)=="last-modified:"{$1=""; m=$0}
         END{print (l ? sprintf("%.1f MB", l/1e6) : "no Content-Length"), "|", m}'
done
# Range is ignored on the .txt files (the whole file comes back), so read a few lines and hang up
curl -sS -A "$UA" "$DL/UniProt2Reactome_All_Levels.txt" 2>/dev/null | head -3
```

On 2026-11-06:

```
UniProt2Reactome.txt               no Content-Length |  Sun, 18 Oct 2026 04:07:11 GMT
UniProt2Reactome_All_Levels.txt    no Content-Length |  Sun, 18 Oct 2026 04:08:11 GMT
ReactomePathwaysRelation.txt       no Content-Length |  Sun, 18 Oct 2026 04:36:39 GMT
reactome.graphdb.tgz               453.7 MB |  Fri, 16 Oct 2026 03:30:27 GMT
A0A023GPK8	R-DME-1500931	https://reactome.org/PathwayBrowser/#/R-DME-1500931	Cell-Cell communication	IEA	Drosophila melanogaster
A0A023GPK8	R-DME-373753	https://reactome.org/PathwayBrowser/#/R-DME-373753	Nephrin family interactions	IEA	Drosophila melanogaster
A0A023GRW3	R-DME-72163	https://reactome.org/PathwayBrowser/#/R-DME-72163	mRNA Splicing - Major Pathway	IEA	Drosophila melanogaster
```

The mapping files cover every species in one file, so filter on the last column. The fifth
column is an evidence code: `IEA` for an inferred event, `TAS` for a curated one. Human rows
are not all `TAS` (in the first 300,000 lines, 9,719 of 49,037 human rows were `IEA`), so filter
on the code as well as the species when only curated human events will do. The files carry
no release number; their `Last-Modified` date is the only marker, so record it.

## Try it

**Data.** The live Reactome ContentService and AnalysisService, centred on TP53 (`P04637`) and
the reaction `R-HSA-69685`. CC0, no account. Reachable on 2026-11-06.

**Run.** Self-contained; Python 3.9+ standard library only; about a minute, because it paces
itself and backs off on 429.

```python
import csv
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://reactome.org"
UA = {"User-Agent": "heurekaskills-reactome-tryit"}


def get(path, data=None, ctype=None, raw=False, headers=UA):
    for i in range(6):
        time.sleep(1)
        h = dict(headers, **({"Content-Type": ctype} if ctype else {}))
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{BASE}/{path}", data=data,
                                                               headers=h), timeout=300) as r:
                body = r.read().decode()
                return 200, (body if raw else json.loads(body))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < 5:
                time.sleep(10 * (i + 1))
                continue
            return e.code, None


# 0. the default Python User-Agent (an observation, not an invariant)
print("default urllib UA :", get("ContentService/data/database/version", headers={})[0])

# 1. release
code, rel = get("ContentService/data/database/version")
assert code == 200 and isinstance(rel, int)
print("release           :", rel)

# 2. accession -> lowest-level pathways; secondary and isoform accessions are plain 404s
code, low = get("ContentService/data/mapping/UniProt/P04637/pathways?species=9606")
assert code == 200 and low and all(p["stId"].startswith("R-HSA-") for p in low)
assert not any(p["isInferred"] for p in low)
for acc in ("Q15086", "P04637-2"):
    assert get(f"ContentService/data/mapping/UniProt/{acc}/pathways?species=9606")[0] == 404
print("P04637 lowest     :", len(low), "| Q15086 and P04637-2: 404")

# 3. every lowest-level pathway rolls up to a top-level pathway through the hierarchy
code, tree = get("ContentService/data/eventsHierarchy/9606?pathwaysOnly=true")
parents, top = {}, {n["stId"] for n in tree}
stack = [(n, None) for n in tree]
while stack:
    node, parent = stack.pop()
    if parent:
        parents.setdefault(node["stId"], set()).add(parent)
    stack += [(c, node["stId"]) for c in node.get("children", [])]


def roots(st):
    up, todo = set(), [st]
    while todo:
        s = todo.pop()
        ps = parents.get(s, set())
        if not ps:
            up.add(s)
        todo += list(ps)
    return up


assert all(roots(p["stId"]) <= top and roots(p["stId"]) for p in low)
print("top-level         :", len(top), "pathways; all", len(low), "roll up into them")

# 4. repeated objects come back as bare integer dbIds — that is the stoichiometry
code, rxn = get("ContentService/data/query/R-HSA-69685")
ints = [x for x in rxn["input"] if isinstance(x, int)]
atp = next(x for x in rxn["input"] if isinstance(x, dict) and x["displayName"].startswith("ATP"))
assert ints and all(i == atp["dbId"] for i in ints)
print("R-HSA-69685 input :", [x if isinstance(x, int) else x["displayName"] for x in rxn["input"]],
      "-> ATP x", 1 + len(ints))

# 5. the AnalysisService resolves what ContentService did not, and projects mouse onto human
ids = "TP53\nQ15086\nP02340\nP04637-2\nNOTAGENE1"
code, res = get("AnalysisService/identifiers/projection?interactors=false&pageSize=1&page=1",
                data=ids.encode(), ctype="text/plain")
token = urllib.parse.unquote(res["summary"]["token"])
_, found = get(f"AnalysisService/download/{token}/entities/found/TOTAL/found.csv", raw=True)
_, missing = get(f"AnalysisService/download/{token}/entities/notfound/notfound.csv", raw=True)
pairs = {(r["Submitted identifier"], r["Found identifier"]) for r in csv.DictReader(io.StringIO(found))}
assert ("Q15086", "P04637") in pairs and ("P02340", "P04637") in pairs
assert set(missing.split()[2:]) == {"P04637-2", "NOTAGENE1"}
print("analysis mapping  :", sorted(p for p in pairs if p[1].startswith("P")),
      "| not found:", missing.split()[2:])

# 6. mouse pathways are inferred from human
code, mouse = get("ContentService/data/mapping/UniProt/P02340/pathways?species=10090")
assert mouse and all(p["isInferred"] and p["stId"].startswith("R-MMU-") for p in mouse)
print("mouse Trp53       :", len(mouse), "pathways, all inferred")
```

**Expect**

Invariants — a failure means the skill is wrong:

- The release is an integer.
- `P04637` has lowest-level human pathways, all `R-HSA-` and none inferred; `Q15086` and
  `P04637-2` get **404** from the same endpoint.
- Every one of those pathways rolls up to one of the top-level pathways from the
  `eventsHierarchy` call.
- The input list of `R-HSA-69685` contains bare integers, and every one equals the `dbId` of
  the ATP object listed before them.
- The AnalysisService maps `Q15086` and mouse `P02340` to `P04637`, and reports exactly
  `P04637-2` and `NOTAGENE1` as not found.
- Every mouse pathway for `P02340` is inferred and `R-MMU-`.

Observed on 2026-11-06 against release 98 — counts move between releases, and the first line
depends on Reactome's edge configuration, so treat a mismatch as drift to investigate:

```
default urllib UA : 403
release           : 98
P04637 lowest     : 46 | Q15086 and P04637-2: 404
top-level         : 29 pathways; all 46 roll up into them
R-HSA-69685 input : ['p-S15-TP53 Tetramer [nucleoplasm]', 'ATP [nucleoplasm]', 29358, 29358, 29358] -> ATP x 4
analysis mapping  : [('P02340', 'P04637'), ('Q15086', 'P04637'), ('TP53', 'P04637')] | not found: ['NOTAGENE1', 'P04637-2']
mouse Trp53       : 22 pathways, all inferred
```

## Sources

- Reactome — https://reactome.org/ ; ContentService — https://reactome.org/ContentService/ ;
  AnalysisService — https://reactome.org/AnalysisService/
- Licence — https://reactome.org/license
- Downloads — https://reactome.org/download-data
- Milacic et al. (2024) The Reactome Pathway Knowledgebase 2024. *Nucleic Acids Research* 52,
  D672–D678 — https://doi.org/10.1093/nar/gkad1025
