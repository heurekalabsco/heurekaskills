---
name: ncbi-gene
description: Look up genes in NCBI Gene for any organism — resolve symbols and aliases to a GeneID without guessing, follow replaced and discontinued records, read coordinates, transcripts, proteins and orthologs, and write gene, RNA and protein FASTA plus per-organism gene tables to disk through E-utilities, NCBI Datasets v2 and the Gene FTP tree.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [entrez, public-data, sequences, genomic-intervals]
covers: [ncbi gene, entrez gene, geneid, gene symbol, gene alias, hgnc, official symbol, discontinued gene, replaced gene, gene_info, gene_history, gene2refseq, gene2accession, gene orthologs, refseq, mane select, transcript, protein isoform, fasta, gene coordinates, grch38, t2t-chm13, e-utilities, ncbi datasets, human, mouse, yeast, bacteria, e. coli, model organisms]
papers: [PMID:25355515, PMID:38969627]
access: [open]
datasets: [https://api.ncbi.nlm.nih.gov/datasets/v2/gene/id/7157, https://api.ncbi.nlm.nih.gov/datasets/v2/gene/id/102724788, https://ftp.ncbi.nlm.nih.gov/gene/DATA/GENE_INFO/Fungi/Saccharomyces_cerevisiae.gene_info.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: NCBI E-utilities JSON 0.3 / db=gene Build261104-2135m.1 / NCBI Datasets API v2 (x-datasets-version 18.41.0) / Gene FTP files dated 2026-11-06 / Python 3.9.6 and 3.12.2 (stdlib only) / curl 8.7.1
  executed: 12
  unverified: 0
---
# NCBI Gene

NCBI Gene holds one record per gene per organism — about **101.7 million records** in the
2026-11-04 build, from human to single bacterial strains — keyed by an integer **GeneID**. It
is the hub that RefSeq transcripts and proteins, OMIM, HGNC, Ensembl, ClinVar and PubMed all
link through, so most gene-level questions start by turning a name into a GeneID.

Three surfaces reach it. No account and no key are needed for any of them:

| surface | use it for | shape |
|---|---|---|
| **E-utilities** (`eutils.ncbi.nlm.nih.gov`) | searching with field tags, record status, replaced/discontinued history | JSON summaries |
| **NCBI Datasets v2** (`api.ncbi.nlm.nih.gov/datasets/v2`) | symbol lookup, gene/transcript/protein reports, orthologs, FASTA download | JSON reports, zip packages |
| **Gene FTP** (`ftp.ncbi.nlm.nih.gov/gene/DATA`) | whole-organism tables | tab-separated `.gz` |

The difficulty is not access. A symbol is not an identifier: the same string names different
genes in different species and is an alias for other genes in the same species, and every
lookup route resolves that ambiguity silently and differently. A GeneID is not permanent
either: records are replaced and discontinued, and one route follows the replacement while
another drops it. This skill is built around catching both.

## Before the first call

- **Rate limits.** E-utilities allows 3 requests/s without a key (`x-ratelimit-limit: 3`);
  Datasets allows 5 (`x-ratelimit-limit: 5`). A free NCBI API key raises both to 10. Get one
  under *Account settings* at ncbi.nlm.nih.gov and export it as `NCBI_API_KEY`. Going over the
  limit returns `429`. The helper below spaces calls and backs off on `429` and `5xx`.
- **Contact address.** NCBI asks E-utilities clients to send `tool` and `email`. Set
  `NCBI_EMAIL`.
- **Terms.** NCBI places no restrictions on use or redistribution of its molecular database
  content, but notes that original submitters may hold rights in some of it. Cite NCBI Gene
  and the RefSeq accession you used.

## A stdlib helper

Save this as `ncbi_gene.py`. Every later Python block imports it. It uses only the standard
library, so it needs no virtual environment.

```python
"""Small stdlib client for NCBI Gene: E-utilities, Datasets v2, and the FTP tree."""
import json, os, time, urllib.error, urllib.parse, urllib.request

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
DATASETS = "https://api.ncbi.nlm.nih.gov/datasets/v2"
API_KEY = os.environ.get("NCBI_API_KEY")          # optional; raises the limits
EMAIL = os.environ.get("NCBI_EMAIL", "")           # NCBI asks for a contact address
GAP = 0.12 if API_KEY else 0.4                     # seconds between calls, both services
_last = [0.0]


def _open(req, timeout=60, tries=4):
    for attempt in range(tries):
        wait = _last[0] + GAP - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < tries - 1:
                time.sleep(2 ** attempt)
                continue
            body = e.read()[:300].decode("utf-8", "replace")
            raise RuntimeError(f"HTTP {e.code} from {req.full_url[:120]}: {body}") from None


def eutils(tool, **params):
    """POST an E-utility (no URL-length cap on long id lists) and return parsed JSON."""
    params = {"db": "gene", "retmode": "json", "tool": "heureka-ncbi-gene",
              "email": EMAIL, **params}
    if API_KEY:
        params["api_key"] = API_KEY
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f"{EUTILS}/{tool}.fcgi", data=data)
    out = json.loads(_open(req))
    if "error" in out or "ERROR" in out.get("esearchresult", {}):
        raise RuntimeError(f"{tool}: {out}")
    return out


def esearch(term, retmax=500):
    r = eutils("esearch", term=term, retmax=retmax)["esearchresult"]
    return int(r["count"]), r["idlist"], r["querytranslation"]


def esummary(ids):
    """GeneID -> summary dict, in chunks of 200."""
    ids = [str(i) for i in ids]
    out = {}
    for i in range(0, len(ids), 200):
        res = eutils("esummary", id=",".join(ids[i:i + 200]))["result"]
        out.update({u: res[u] for u in res["uids"]})
    return out


STATUS = {"": "live", "0": "live", "1": "replaced", "2": "discontinued"}


def resolve(gene_id, max_hops=10):
    """Follow 'replaced' links. Returns (final_id, final_status, path).

    A replacement chain can end at a discontinued record, so check the final
    status; a chain ending does not make the record live.
    """
    path = [str(gene_id)]
    for _ in range(max_hops):
        s = esummary([path[-1]]).get(path[-1])
        if s is None or "error" in s:
            return path[-1], "missing", path
        status = STATUS[str(s["status"])]
        if status != "replaced":
            return path[-1], status, path
        path.append(str(s["currentid"]))
    raise RuntimeError(f"replacement chain longer than {max_hops}: {path}")


def datasets(path, body=None, raw=False, timeout=120):
    """Datasets v2. GET by default, POST JSON when body is given."""
    headers = {"Accept": "application/zip" if raw else "application/json"}
    if API_KEY:
        headers["api-key"] = API_KEY
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{DATASETS}/{path.lstrip('/')}", data=data, headers=headers)
    blob = _open(req, timeout=timeout)
    return blob if raw else json.loads(blob)


def gene_by_symbol(symbol, taxon):
    """Symbol lookup that refuses to guess.

    Datasets resolves aliases silently and can return several genes, none of
    them named what you asked for. Returns (exact_matches, alias_matches).
    """
    rep = datasets(f"gene/symbol/{urllib.parse.quote(symbol)}/taxon/{taxon}")
    genes = [r["gene"] for r in rep.get("reports", [])]   # unknown symbol -> {} with HTTP 200
    exact = [g for g in genes if g.get("symbol", "").lower() == symbol.lower()]
    alias = [g for g in genes if g not in exact]
    return exact, alias
```

## Find the GeneID

### By symbol and organism (Datasets)

`/gene/symbol/{symbols}/taxon/{taxon}` accepts a taxid or a common name and is case-blind.
It is the shortest route, and also the one that hides the most. It falls back to **aliases
without saying so**, and can return several genes for one symbol:

```python
from ncbi_gene import gene_by_symbol

for sym, tax in [("TP53", 9606), ("TP53", 10090), ("HER2", 9606), ("AIM1", 9606),
                 ("CAP", 9606), ("COX1", 9606), ("HBD", 9606), ("NOTAGENE123", 9606)]:
    exact, alias = gene_by_symbol(sym, tax)
    print(f"{sym:12} {tax:>6}  exact={[g['gene_id'] for g in exact]}  "
          f"via alias={[(g['gene_id'], g['symbol']) for g in alias]}")
```

Observed 2026-11-06:

```
TP53           9606  exact=['7157']  via alias=[]
TP53          10090  exact=[]  via alias=[('22059', 'Trp53')]
HER2           9606  exact=[]  via alias=[('2064', 'ERBB2')]
AIM1           9606  exact=[]  via alias=[('9212', 'AURKB'), ('51151', 'SLC45A2'), ('202', 'CRYBG1')]
CAP            9606  exact=[]  via alias=[('23476', 'BRD4'), ('10487', 'CAP1'), ('4012', 'LNPEP'), ('10580', 'SORBS1'), ('5269', 'SERPINB6'), ('9200', 'HACD1')]
COX1           9606  exact=[]  via alias=[('5742', 'PTGS1')]
HBD            9606  exact=['3045']  via alias=[]
NOTAGENE123    9606  exact=[]  via alias=[]
```

How to read that:

- **An alias hit is a question to the user, not an answer.** `HER2` → `ERBB2` is what they
  meant. `AIM1` resolves to three unrelated genes, and `COX1` in human resolves to
  prostaglandin synthase *PTGS1*, not mitochondrial cytochrome c oxidase I (`MT-CO1`, 4512).
  Report the candidates and stop.
- **The symbol is case-blind, the species is not.** `TP53` in mouse finds `Trp53` through
  case-folding plus aliasing. Convert across species with orthologs, not by retyping the
  symbol.
- **An unknown symbol returns HTTP 200 with an empty body `{}`** — no `reports` key and no
  `total_count`. In a batch (`/gene/symbol/TP53,BRCA1,NOTAGENE123/taxon/9606`) the unknown
  one is dropped and `total_count` is 2. Compare what came back with what you sent.
- **Even an official symbol can name two genes.** Human `HBD` is both haemoglobin delta
  (3045) and a phenotype-only record, "hypophosphatemic bone disease" (100187828). Datasets
  returns only the first. E-utilities returns both (next section).

### By query (E-utilities `esearch`)

E-utilities is the route when you need a field-tagged query, a count, or records Datasets
will not show (discontinued ones). The tags that matter for genes:

| tag | means | note |
|---|---|---|
| `[pref]` | preferred (official) symbol only | the strict one |
| `[sym]` | symbol **or alias** | `P53[sym] AND 9606[taxid]` → 3 records |
| `[taxid]` | exactly this taxid | does **not** include strains or subspecies |
| `txid4932[orgn]` | this taxon **and its descendants** | `[orgn:noexp]` turns that off |
| `human[orgn]`, `mouse[orgn]` | organism by name | `mouse[orgn]` expands to the whole genus *Mus* |
| `alive[prop]` | live records only | |
| `"genetype protein coding"[prop]` | gene type | |
| `"replaced"[prop]`, `"discontinued"[prop]` | retired records | |
| `[chr]`, `[mim]`, `[go]`, `[dis]`, `[pmid]` | chromosome, OMIM, GO, disease, citing paper | |

```bash
# -g stops curl treating [ ] as a glob; without it the request is never sent and curl prints nothing
E=https://eutils.ncbi.nlm.nih.gov/entrez/eutils
curl -sg "$E/esearch.fcgi?db=gene&retmode=json&term=HBD[pref]+AND+9606[taxid]" | python3 -c \
  'import json,sys; r=json.load(sys.stdin)["esearchresult"]; print(r["count"], r["idlist"])'
sleep 1
curl -sg "$E/esearch.fcgi?db=gene&retmode=json&term=HBD[sym]+AND+9606[taxid]+AND+%22genetype+protein+coding%22[prop]" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["esearchresult"]; print(r["count"], r["idlist"])'
```

```
2 ['3045', '100187828']
1 ['3045']
```

Five traps, each observed on 2026-11-06:

```python
from ncbi_gene import esearch

# 1. An untagged term is a full-text search: 12,822 hits, and TP53 is not first.
n, ids, _ = esearch("TP53", retmax=5);   print("untagged      ", n, "TP53 first:", ids[0] == "7157")
# 2. Yeast genes sit on the strain taxid (S288C = 559292), not the species (4932).
print("GAL4 [taxid]  ", esearch("GAL4[sym] AND 4932[taxid]")[:2])
print("GAL4 txid/orgn", esearch("GAL4[sym] AND txid4932[orgn]")[:2])
# 3. The same is true for bacteria, and strain records are often discontinued.
print("lacZ K-12     ", esearch("lacZ[sym] AND 511145[taxid]")[:2])
print("lacZ E. coli  ", esearch("lacZ[sym] AND 562[taxid]")[:2], "<- a different, retired record")
# 4. 'AND NOT' is silently rewritten to 'AND' -- the opposite query. NOT is binary.
print("AND NOT       ", esearch("human[orgn] AND NOT alive[prop]", retmax=0)[::2])
print("NOT           ", esearch("human[orgn] NOT alive[prop]", retmax=0)[::2])
# 5. [sym] matches aliases, so it can return pseudogenes and retired records.
print("P53[sym] human", esearch("P53[sym] AND 9606[taxid]")[:2])
```

```
untagged       12822 TP53 first: False
GAL4 [taxid]   (0, [])
GAL4 txid/orgn (1, ['855828'])
lacZ K-12      (1, ['945006'])
lacZ E. coli   (1, ['24954864']) <- a different, retired record
AND NOT        (194035, '"Homo sapiens"[Organism] AND alive[prop]')
NOT            (166634, '"Homo sapiens"[Organism] NOT alive[prop]')
P53[sym] human (3, ['7157', '373859', '352997'])
```

Always print `querytranslation` for a query you have not run before. It is the only place
the rewrite in trap 4 shows. `esearch` returns at most 10,000 ids per page. To list a whole
organism, use the per-organism table under *Get the files*.

## Read the record, and check that it is still alive

`esummary` is the compact record. The fields worth knowing:

| field | holds |
|---|---|
| `name`, `nomenclaturesymbol`, `nomenclaturestatus` | symbol; the authority's symbol; `Official` or `Interim` (empty for most non-model organisms) |
| `otheraliases` | comma-separated aliases, i.e. everything `[sym]` will match |
| `status`, `currentid` | `""` live, `"1"` replaced (`currentid` = successor), `"2"` discontinued |
| `genomicinfo` | **a list**: one entry per placement on the reference assembly |
| `chrstart`, `chrstop` | **0-based**, and `chrstart > chrstop` on the minus strand |
| `locationhist` | placements per annotation release and assembly (GRCh38 and T2T-CHM13 for human) |
| `mim`, `summary`, `organism.taxid` | OMIM ids, RefSeq summary, taxon |

A GeneID you got from a paper, a spreadsheet or an old pipeline can be retired. `resolve`
follows replacements until it reaches a record that is not replaced, then reports what that
record is:

```python
from ncbi_gene import esummary, resolve

s = esummary(["7157", "6473"])
print(s["7157"]["name"], repr(s["7157"]["status"]), s["7157"]["genomicinfo"])
print(s["6473"]["name"], [(g["chrloc"], g["chrstart"], g["chrstop"]) for g in s["6473"]["genomicinfo"]])

for gid in ["7157", "102724788", "373859", "999999999"]:
    print(gid, "->", resolve(gid))
```

```
TP53 '' [{'chrloc': '17', 'chraccver': 'NC_000017.11', 'chrstart': 7687489, 'chrstop': 7668420, 'exoncount': 13}]
SHOX [('X', 624343, 659410), ('Y', 624343, 659410)]
7157 -> ('7157', 'live', ['7157'])
102724788 -> ('5625', 'live', ['102724788', '5625'])
373859 -> ('352997', 'discontinued', ['373859', '352997'])
999999999 -> ('999999999', 'missing', ['999999999'])
```

- `102724788` was a `LOC` placeholder that was merged into *PRODH* (5625). Use 5625.
- `373859` was replaced by `352997`, **which was itself later discontinued**. Following
  `currentid` once and stopping would hand you a dead record. There is no successor, so report
  the id as retired.
- A nonexistent id gives HTTP 200 with `{"error": "cannot get document summary"}` inside the
  record, not an HTTP error.
- *SHOX* sits in the pseudoautosomal region, so `genomicinfo` has an X entry **and** a Y
  entry. Never take `genomicinfo[0]` as "the" location.

Datasets treats retired ids differently on its two endpoints. Remember this for downloads:

| request | `/gene/id/{id}` report | `/gene/download` package |
|---|---|---|
| replaced `102724788` | returns *PRODH* 5625, with `warning.gene_warning_code: REPLACED_GENE_ID` | **drops it without a word** |
| discontinued `352997` | returns a stub `{"gene_id": "352997"}` with `DISCONTINUED_GENE_ID` | drops it |
| `abc` | HTTP 400 | HTTP 400 |

Resolve every id with `resolve()` before you request a package.

## Coordinates, transcripts and proteins (Datasets)

`/gene/id/{ids}` gives the gene report; `/gene/id/{ids}/product_report` adds every RefSeq
transcript and protein. Coordinates here are **1-based and inclusive**, one higher than the
`esummary` numbers for the same gene. And `annotations` lists **one entry per annotated
assembly**, so pick yours by name:

```python
from ncbi_gene import datasets

g = datasets("gene/id/7157")["reports"][0]["gene"]
print(g["symbol"], g["type"], g["swiss_prot_accessions"], g["ensembl_gene_ids"],
      g["nomenclature_authority"]["identifier"])
for a in g["annotations"]:
    loc = a["genomic_locations"][0]
    print(a["assembly_name"], loc["genomic_accession_version"], loc["genomic_range"])

p = datasets("gene/id/7157/product_report")["reports"][0]["product"]
print(p["transcript_type_counts"])
mane = [t for t in p["transcripts"] if t.get("select_category") == "MANE_SELECT"]
for t in mane:
    print(t["accession_version"], t["protein"]["accession_version"], t["ensembl_transcript"],
          t["cds"]["range"][0])

lacz = datasets("gene/id/945006/product_report")["reports"][0]["product"]["transcripts"]
print("lacZ transcripts:", len(lacz), "accession on transcript:", "accession_version" in lacz[0],
      "protein:", lacz[0]["protein"]["accession_version"])
```

```
TP53 PROTEIN_CODING ['P04637'] ['ENSG00000141510'] HGNC:11998
GRCh38.p14 NC_000017.11 {'begin': '7668421', 'end': '7687490', 'orientation': 'minus'}
T2T-CHM13v2.0 NC_060941.1 {'begin': '7572544', 'end': '7591594', 'orientation': 'minus'}
[{'type': 'PROTEIN_CODING', 'count': 25}, {'type': 'NON_CODING', 'count': 1}]
NM_000546.6 NP_000537.3 ENST00000269305.9 {'begin': '143', 'end': '1324', 'orientation': 'plus'}
lacZ transcripts: 1 accession on transcript: False protein: NP_414878.1
```

- `MANE_SELECT` exists for human only. Other organisms may carry `REFSEQ_SELECT` or no select
  flag at all, so do not assume a "canonical transcript" field is there.
- Prokaryotic genes have a "transcript" entry with **no accession**. It only places the
  protein (`NP_414878.1`) on the chromosome. There is no RNA to download.
- Datasets JSON uses `snake_case` (`gene_id`). The `data_report.jsonl` inside a download
  package uses `camelCase` (`geneId`). Parsers written for one silently miss on the other.

### Orthologs

`/gene/id/{id}/orthologs` returns NCBI's computed orthologs. It **ignores `page_size`** and
returned all 665 for TP53. Narrow it with repeated `taxon_filter`:

```python
from ncbi_gene import datasets

r = datasets("gene/id/7157/orthologs?taxon_filter=10090&taxon_filter=7955&taxon_filter=559292")
print(r.get("total_count"), [(x["gene"]["gene_id"], x["gene"]["symbol"], x["gene"]["taxname"])
                             for x in r["reports"]])
```

```
2 [('22059', 'Trp53', 'Mus musculus'), ('30590', 'tp53', 'Danio rerio')]
```

Yeast has no TP53 ortholog, and it is simply absent. An organism missing from the answer
means "none computed", not an error.

## The bulk files

Everything in `https://ftp.ncbi.nlm.nih.gov/gene/DATA/` is rebuilt daily. The combined
files are large, so check the size before transferring anything:

```bash
for f in gene_info.gz gene_history.gz gene2refseq.gz gene2accession.gz gene_orthologs.gz \
         GENE_INFO/Mammalia/Homo_sapiens.gene_info.gz; do
  curl -sI "https://ftp.ncbi.nlm.nih.gov/gene/DATA/$f" | tr -d '\r' | awk -F': ' -v f="$f" '
    tolower($1)=="content-length"{mb=$2/1e6} tolower($1)=="last-modified"{lm=$2}
    END{printf "%-45s %6.0f MB  %s\n", f, mb, lm}'
done
```

```
gene_info.gz                                    1604 MB  Fri, 06 Nov 2026 08:26:29 GMT
gene_history.gz                                  164 MB  Fri, 06 Nov 2026 08:24:29 GMT
gene2refseq.gz                                  2419 MB  Fri, 06 Nov 2026 08:24:17 GMT
gene2accession.gz                               4699 MB  Fri, 06 Nov 2026 08:18:24 GMT
gene_orthologs.gz                                131 MB  Fri, 06 Nov 2026 08:28:52 GMT
GENE_INFO/Mammalia/Homo_sapiens.gene_info.gz       5 MB  Fri, 06 Nov 2026 08:32:36 GMT
```

| file | one row per | use |
|---|---|---|
| `GENE_INFO/<group>/<Species>.gene_info.gz` | live gene in that organism | **the one to download**: symbols, synonyms, xrefs (HGNC, Ensembl, MIM), type |
| `gene_info.gz` | live gene, every organism | only for cross-kingdom work |
| `gene_history.gz` | retired GeneID → successor or `-` | offline version of `resolve()` |
| `gene2refseq.gz` | GeneID × RefSeq RNA/protein/genomic placement | id mapping at scale |
| `gene2accession.gz` | the same for GenBank too | rarely needed |
| `gene_orthologs.gz` | ortholog pair | offline version of the orthologs endpoint |

To read a large file's columns without downloading it, fetch the first 64 KB and inflate
that much of the gzip stream:

```python
import urllib.request, zlib

def peek_gz(url, nbytes=65536, lines=2):
    req = urllib.request.Request(url, headers={"Range": f"bytes=0-{nbytes - 1}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        assert r.status == 206, f"server ignored the Range header ({r.status})"
        chunk = r.read()
    text = zlib.decompressobj(31).decompress(chunk).decode("utf-8", "replace")
    return text.split("\n")[:lines]

for f in ["gene_history.gz", "gene2refseq.gz"]:
    head = peek_gz(f"https://ftp.ncbi.nlm.nih.gov/gene/DATA/{f}")
    print(f, head[0].split("\t"))
```

```
gene_history.gz ['#tax_id', 'GeneID', 'Discontinued_GeneID', 'Discontinued_Symbol', 'Discontinue_Date']
gene2refseq.gz ['#tax_id', 'GeneID', 'status', 'RNA_nucleotide_accession.version', 'RNA_nucleotide_gi', 'protein_accession.version', 'protein_gi', 'genomic_nucleotide_accession.version', 'genomic_nucleotide_gi', 'start_position_on_the_genomic_accession', 'end_position_on_the_genomic_accession', 'orientation', 'assembly', 'mature_peptide_accession.version', 'mature_peptide_gi', 'Symbol']
```

The files are sorted by `tax_id`, not GeneID, so a range read cannot jump to one gene. For
single genes use the APIs. For one organism use its `GENE_INFO` file. If you truly need a
combined file, stream it once through a filter and keep only your taxon's rows.

## Get the files

Two deliverables: **sequences and reports for a gene list**, and **the gene table for a
whole organism**.

### Sequences and reports for a list of genes

`POST /gene/download` returns a zip with `gene.fna` (genomic), `rna.fna`, `protein.faa`,
`data_report.jsonl` and an `md5sum.txt`. The function below resolves ids first, because the
package drops retired ones silently. It verifies every checksum and refuses a package that
is missing anything it asked for:

```python
import hashlib, json, pathlib, zipfile
from ncbi_gene import datasets, resolve

def download_genes(gene_ids, out_dir,
                   annotation=("FASTA_GENE", "FASTA_RNA", "FASTA_PROTEIN")):
    """Write NCBI Datasets gene package(s) to out_dir. Returns (data_dir, reports, retired)."""
    live, retired = {}, {}
    for gid in gene_ids:
        final, status, path = resolve(gid)
        if status == "live":
            live[str(gid)] = final
        else:
            retired[str(gid)] = (status, path)
    if not live:
        raise LookupError(f"no live GeneIDs among {list(gene_ids)}: {retired}")
    want = sorted(set(live.values()), key=int)

    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    blob = datasets("gene/download", raw=True,
                    body={"gene_ids": [int(g) for g in want],
                          "include_annotation_type": list(annotation)})
    zpath = out / "ncbi_gene_dataset.zip"
    zpath.write_bytes(blob)
    with zipfile.ZipFile(zpath) as z:
        for line in z.read("md5sum.txt").decode().splitlines():
            md5, name = line.split(maxsplit=1)
            if hashlib.md5(z.read(name)).hexdigest() != md5:
                raise IOError(f"checksum mismatch in {name}")
        z.extractall(out)

    data = out / "ncbi_dataset" / "data"
    reports = [json.loads(l) for l in (data / "data_report.jsonl").read_text().splitlines()]
    got = {r["geneId"] for r in reports}                     # camelCase in the package
    if set(want) - got:
        raise IOError(f"package is missing GeneIDs {sorted(set(want) - got)}")
    (out / "id_map.json").write_text(json.dumps({"requested_to_live": live,
                                                 "retired": retired}, indent=2))
    return data, reports, retired

data, reports, retired = download_genes(["7157", "22059", "855828", "945006", "102724788", "373859"],
                                        "ncbi_gene_out")
print("retired:", retired)
print([(r["geneId"], r["symbol"], r["taxname"]) for r in reports])
for f in ["gene.fna", "rna.fna", "protein.faa"]:
    heads = [l for l in (data / f).read_text().splitlines() if l.startswith(">")]
    per = {}
    for h in heads:
        gid = h.split("[GeneID=")[1].split("]")[0]
        per[gid] = per.get(gid, 0) + 1
    print(f, per)
```

```
retired: {'373859': ('discontinued', ['373859', '352997'])}
[('5625', 'PRODH', 'Homo sapiens'), ('7157', 'TP53', 'Homo sapiens'), ('22059', 'Trp53', 'Mus musculus'), ('855828', 'GAL4', 'Saccharomyces cerevisiae S288C'), ('945006', 'lacZ', 'Escherichia coli str. K-12 substr. MG1655')]
gene.fna {'5625': 2, '7157': 2, '22059': 1, '855828': 1, '945006': 1}
rna.fna {'5625': 3, '7157': 26, '22059': 5, '855828': 1}
protein.faa {'5625': 3, '7157': 25, '22059': 5, '855828': 1, '945006': 1}
```

Read those counts before using the files:

- **`gene.fna` is not one sequence per gene.** Human genes appear once per annotated
  assembly (GRCh38 and T2T-CHM13), so *TP53* and *PRODH* each have two genomic sequences.
  Select by the accession in the header (`NC_000017.11` is GRCh38 chr17) before computing
  anything from it.
- **`rna.fna` and `protein.faa` hold every RefSeq isoform**, including predicted `XM_`/`XP_`
  records. For one protein per human gene, take the MANE Select pair from the product report.
- **No RNA for prokaryotes.** lacZ has a protein and no `rna.fna` entry.
- Genomic headers use `c<start>-<end>` for minus-strand genes and the sequence is already
  reverse-complemented. The coordinates are 1-based.
- Send the whole list in one POST rather than looping per gene. The three FASTA types above
  are the ones verified here. Requesting `GENE_FLANKS` or `PRODUCT_REPORT` the same way
  (2026-11-06) added no file to the package, so do not rely on them without checking.

### The gene table for one organism

The `GENE_INFO` directory has a file per model organism (`Mammalia/Homo_sapiens`,
`Mammalia/Mus_musculus`, `Fungi/Saccharomyces_cerevisiae`, …) and a combined
`Archaea_Bacteria`, `Viruses`, `Plants` and so on. Each holds only live records:

```python
import collections, csv, gzip, io, pathlib, urllib.request

def gene_info(group_species, out_dir="ncbi_gene_out"):
    url = f"https://ftp.ncbi.nlm.nih.gov/gene/DATA/GENE_INFO/{group_species}.gene_info.gz"
    out = pathlib.Path(out_dir) / url.rsplit("/", 1)[1]
    out.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as r:
        out.write_bytes(r.read())
    with gzip.open(out, "rt", newline="") as fh:
        rows = list(csv.DictReader(fh, delimiter="\t"))
    return out, rows

path, rows = gene_info("Mammalia/Homo_sapiens")
print(path, path.stat().st_size, "bytes,", len(rows), "rows")
print(collections.Counter(r["#tax_id"] for r in rows))
print(collections.Counter(r["type_of_gene"] for r in rows).most_common(4))

human_pc = [r for r in rows if r["#tax_id"] == "9606" and r["type_of_gene"] == "protein-coding"]
print("human protein-coding:", len(human_pc))
dups = collections.Counter(r["Symbol"] for r in rows)
print("all protein-coding rows:", sum(r["type_of_gene"] == "protein-coding" for r in rows))
print("symbols on >1 row:", sum(1 for c in dups.values() if c > 1),
      [(r["#tax_id"], r["GeneID"]) for r in rows if r["Symbol"] == "COX1"])
tp53 = next(r for r in rows if r["GeneID"] == "7157")
print(tp53["Synonyms"], tp53["dbXrefs"])
```

```
ncbi_gene_out/Homo_sapiens.gene_info.gz 5200222 bytes, 194035 rows
Counter({'9606': 193962, '63221': 37, '741158': 36})
[('biological-region', 128261), ('ncRNA', 22757), ('protein-coding', 20600), ('pseudo', 17512)]
human protein-coding: 20574
all protein-coding rows: 20600
symbols on >1 row: 50 [('9606', '4512'), ('63221', '6775083'), ('741158', '8923218')]
BCC7|BMFS5|LFS1|P53|TRP53 MIM:191170|HGNC:HGNC:11998|Ensembl:ENSG00000141510|AllianceGenome:HGNC:11998
```

- **"Human" includes Neanderthal (63221) and Denisovan (741158) mitochondrial genes**,
  which share symbols such as *COX1* and add 26 protein-coding rows. Filter on `#tax_id`.
- **The `Symbol` column is NCBI's symbol, not always the official one.** Human
  mitochondrial cytochrome c oxidase I (4512) is `COX1` here and in `esummary`'s `name`, but
  `MT-CO1` in `Symbol_from_nomenclature_authority`, `nomenclaturesymbol` and Datasets'
  `symbol`. This is why Datasets' `COX1` lookup above returns only *PTGS1*.
- **Two thirds of the rows are not genes in the usual sense.** 128,261 are
  `biological-region` records (enhancers, regulatory elements). Only 20,600 are
  `protein-coding` (20,574 of them human). Filter on `type_of_gene` before counting "genes".
- The row count equals the esearch count for `human[orgn] AND alive[prop]` (194,035). The
  two surfaces agree, which is a cheap integrity check.
- Missing values are `-`, not empty. `Synonyms` and `dbXrefs` are `|`-separated, and
  `dbXrefs` is `DB:ID` with the first colon as the separator (`HGNC:HGNC:11998`).

The output of this section is on disk: `ncbi_gene_out/ncbi_gene_dataset.zip` with its
extracted `ncbi_dataset/data/` FASTA and JSONL, `id_map.json` recording which requested ids
were redirected or retired, and the organism's `*.gene_info.gz`.

## Try it

**Data.** NCBI Gene records for *TP53* (human, 7157), *Trp53* (mouse, 22059), *GAL4*
(*S. cerevisiae* S288C, 855828) and *lacZ* (*E. coli* K-12 MG1655, 945006). Two retired
GeneIDs: 102724788 (replaced by *PRODH*) and 373859 (replaced, then discontinued). Also the
yeast `GENE_INFO` table. All are public, need no account, and were confirmed reachable on
2026-11-06. NCBI places no use restrictions on this content.

**Run.** With `ncbi_gene.py` from above in the working directory:

```python
import collections, csv, gzip, io, urllib.request
from ncbi_gene import datasets, esearch, esummary, gene_by_symbol, resolve

# symbol -> GeneID across four kingdoms, strict match only
expected = {("TP53", 9606): "7157", ("Trp53", 10090): "22059",
            ("GAL4", 559292): "855828", ("lacZ", 511145): "945006"}
for (sym, tax), gid in expected.items():
    exact, alias = gene_by_symbol(sym, tax)
    assert [g["gene_id"] for g in exact] == [gid], (sym, tax, exact, alias)
print("symbol lookup  : 4/4 exact")

# the traps
assert gene_by_symbol("AIM1", 9606)[0] == [] and len(gene_by_symbol("AIM1", 9606)[1]) >= 2
assert gene_by_symbol("NOTAGENE123", 9606) == ([], [])
assert esearch("GAL4[sym] AND 4932[taxid]")[0] == 0           # species taxid misses the strain
assert esearch("GAL4[sym] AND txid4932[orgn]")[1] == ["855828"]
_, _, tr = esearch("human[orgn] AND NOT alive[prop]", retmax=0)
assert "NOT" not in tr, tr                                    # rewritten to the opposite query
both = esearch("HBD[pref] AND 9606[taxid]")[1]
assert set(both) == {"3045", "100187828"}
assert [g["gene_id"] for g in gene_by_symbol("HBD", 9606)[0]] == ["3045"]   # Datasets shows one
print("traps          : alias fan-out, empty {}, strain taxid, AND NOT, duplicate official symbol")

# retired ids
assert resolve("102724788")[:2] == ("5625", "live")
assert resolve("373859")[:2] == ("352997", "discontinued")    # the chain ends dead
assert resolve("999999999")[1] == "missing"
print("resolve        : replaced->live, replaced->discontinued, missing")

# coordinates: esummary is 0-based, Datasets 1-based
s = esummary(["7157"])["7157"]["genomicinfo"][0]
g = datasets("gene/id/7157")["reports"][0]["gene"]
grch38 = next(a for a in g["annotations"] if a["assembly_name"].startswith("GRCh38"))
rng = grch38["genomic_locations"][0]["genomic_range"]
assert int(rng["begin"]) == s["chrstop"] + 1 and int(rng["end"]) == s["chrstart"] + 1
assert len(esummary(["6473"])["6473"]["genomicinfo"]) == 2    # SHOX on X and Y
print("coordinates    :", s["chraccver"], s["chrstop"], s["chrstart"], "->", rng["begin"], rng["end"])

# the package drops a replaced id that the report endpoint follows
rep = datasets("gene/id/102724788")["reports"][0]
assert rep["gene"]["gene_id"] == "5625" and rep["warning"]["gene_warning_code"] == "REPLACED_GENE_ID"
import zipfile
z = zipfile.ZipFile(io.BytesIO(datasets("gene/download", raw=True, body={"gene_ids": [102724788]})))
assert "ncbi_dataset/data/data_report.jsonl" not in z.namelist(), z.namelist()   # HTTP 200, no genes
print("download       : replaced id 102724788 -> empty package; resolve first")

# organism table: yeast, live records only, keyed on the strain taxid
url = "https://ftp.ncbi.nlm.nih.gov/gene/DATA/GENE_INFO/Fungi/Saccharomyces_cerevisiae.gene_info.gz"
rows = list(csv.DictReader(io.TextIOWrapper(gzip.open(urllib.request.urlopen(url, timeout=120)),
                                            newline=""), delimiter="\t"))
gal4 = next(r for r in rows if r["GeneID"] == "855828")
assert gal4["#tax_id"] == "559292" and gal4["LocusTag"] == "YPL248C"
types = collections.Counter(r["type_of_gene"] for r in rows)
print("yeast table    :", len(rows), "rows,", dict(types.most_common(3)))
```

**Expect.**

Invariants. These hold whatever NCBI rebuilds, so a failure means the skill is wrong:

- Each of the four symbols resolves to exactly one exact-symbol match, the listed GeneID.
- `AIM1` (human) has no exact match and two or more alias matches. An unknown symbol gives
  `([], [])` from an HTTP 200 `{}`.
- `GAL4` is not found under species taxid 4932 and is found under `txid4932[orgn]`.
- `AND NOT` never survives into `querytranslation`.
- `HBD[pref]` in human returns two GeneIDs while Datasets' symbol lookup returns one.
- `102724788` resolves to live 5625. `373859` resolves through a replacement to the
  **discontinued** 352997.
- Datasets' GRCh38 `begin`/`end` equal `esummary`'s `chrstop + 1`/`chrstart + 1` for a
  minus-strand gene. *SHOX* has two `genomicinfo` placements.
- A download package requested with only a replaced id contains no gene.
- *GAL4* in the yeast table carries taxid 559292 and locus tag YPL248C.

Observed 2026-11-06 (Gene build 261104, Datasets 18.41.0). These move with NCBI rebuilds,
so treat a mismatch as drift to investigate:

```
symbol lookup  : 4/4 exact
traps          : alias fan-out, empty {}, strain taxid, AND NOT, duplicate official symbol
resolve        : replaced->live, replaced->discontinued, missing
coordinates    : NC_000017.11 7668420 7687489 -> 7668421 7687490
download       : replaced id 102724788 -> empty package; resolve first
yeast table    : 6514 rows, {'protein-coding': 6029, 'tRNA': 323, 'ncRNA': 116}
```

The method was also run on *SHOX* (pseudoautosomal), *A1BG* (GeneID 1, the oldest), *PRODH*
(alternate-locus placements), *HBD*, *COX1*, *CAP*, *HER2* and *P53*. Each counter-example
it surfaced is asserted above or documented in the section that handles it.

## Sources

- NCBI Gene — https://www.ncbi.nlm.nih.gov/gene/
- E-utilities — https://www.ncbi.nlm.nih.gov/books/NBK25499/
- NCBI Datasets v2 REST reference — https://www.ncbi.nlm.nih.gov/datasets/docs/v2/api/rest-api/
- Gene FTP and its README — https://ftp.ncbi.nlm.nih.gov/gene/DATA/ , https://ftp.ncbi.nlm.nih.gov/gene/README
- NCBI data policies — https://www.ncbi.nlm.nih.gov/home/about/policies/
- Brown GR et al. (2015) Gene: a gene-centered information resource at NCBI. *Nucleic Acids
  Research* 43, D36-D42 — https://doi.org/10.1093/nar/gku1055
- O'Leary NA et al. (2024) Exploring and retrieving sequence and metadata for species across
  the tree of life with NCBI Datasets. *Scientific Data* 11, 732 —
  https://doi.org/10.1038/s41597-024-03571-y
