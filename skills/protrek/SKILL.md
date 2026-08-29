---
name: protrek
description: Search proteins by plain-language function, amino-acid sequence or 3Di structure with the ProTrek trimodal model. Covers the hosted search API that needs no account, which database and output-modality pairs actually return anything, similarity scoring with a negative control, structure queries with no local foldseek, and the CPU-local route with the 35M checkpoint and the faiss indexes.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-language-model, embeddings, multimodal, uniprot, protein-structure]
datasets: [https://huggingface.co/datasets/westlake-repl/faiss_index/resolve/main/SwissProt/ProTrek_650M_UniRef50/text/subsections/Signal_peptide.index, https://alphafold.ebi.ac.uk/api/prediction/A0A0K8P6T7]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-29
  against: hosted server at search-protrek.com running Gradio 4.37.1, read 2026-08-29 / ProTrek_650M, ProTrek_35M and the faiss_index dataset on Hugging Face, read 2026-08-29 / ProTrek repository at HEAD 2026-08-29 / local 35M checkpoint on Python 3.12.8, torch 2.6.0, transformers 4.57.6, torchmetrics 0.9.3, faiss-cpu 1.15.0, setuptools 80.10.2, foldseek 10-941cd33, macOS 26.4 arm64, no CUDA
  executed: 14
  unverified: 2
  unverified_reason: >-
    Two blocks were not run here, and both are the same requirement. Pulling the full
    precomputed index set is 24 GB, and starting the bundled server on top of it also needs
    the 3.6 GB 650M checkpoint resident on the same machine. Re-run both on a host with
    roughly 30 GB of free disk and ports 7860-7863 available. Everything else executed in
    document order in one directory, including the git clone, the exact pip line, the local
    35M checkpoint on CPU, the foldseek install, and the faiss index inspection.
---

# ProTrek

## What it does

ProTrek embeds three descriptions of a protein into one shared 1024-dimensional space and
lets you search across them — a plain-English sentence, an amino-acid sequence, or a
Foldseek 3Di structure string. Any of the three can be the query and any of the three can
be the result, so nine search directions exist and a text query can retrieve sequences that
share no detectable homology with anything you already have.

Three encoders are trained together with a contrastive objective, and a search is an inner
product between a query embedding and a flat faiss index of precomputed ones.

| part | what it is |
|---|---|
| sequence encoder | ESM-2 — `esm2_t33_650M_UR50D` in the 650M model, `esm2_t12_35M_UR50D` in the 35M |
| text encoder | Microsoft BiomedNLP PubMedBERT, base, uncased, abstract + fulltext |
| structure encoder | a Foldseek 3Di transformer the ProTrek authors trained themselves |
| search | `faiss.IndexFlatIP` over L2-normalised 1024-d vectors |

The sequence encoder is the same ESM-2 checkpoint documented in the `esm` skill, which is
where the ESM licensing question is settled; nothing here re-derives it. What ProTrek adds
on top is the text encoder, the cross-modal alignment, and the index — none of which ESM
has.

Use this when the question is *find me proteins that do X* and you have no query sequence,
or when you have a sequence and want the function statement rather than a BLAST hit. Do not
use it when the question is quantitative — see *Limits* below.

## What you need before you run anything

**The hosted route needs nothing.** No account, no key, no licence click-through. Every
block in the next five sections runs on the Python standard library against a public server.

Two things about that server have to be said before you send it anything.

**There is no HTTPS.** `http://search-protrek.com/` answers; `https://search-protrek.com/`
has no listener and times out (checked 2026-08-29). Your query, the sequence in it, and
every result travel in plaintext across the network. That is fine for a Swiss-Prot accession
and it is not fine for an unpublished sequence, a proprietary design, or anything under an
NDA. Those belong in a local deployment — see *Running it yourself*. It is also why the
server URL cannot appear in this skill's `datasets:` list, which accepts `https://` only.

**The service runs on four rented machines.** The project's own FAQ says so, and adds that
those machines run other work at the same time and that queries are capped at 10,000
results to keep the queue fair:

> Currently, our service runs on 4 rented servers that also run many other tasks. The speed
> of our retrieval system is severely constrained by hardware limitations…

Treat it accordingly. Batch politely, keep `topk` at what you will actually read, and put
anything that looks like a sweep on your own hardware.

## The hosted API

The demo is a Gradio 4.37.1 app, and every control on the page is an HTTP endpoint. Ask it
what it exposes rather than reading the page source.

```bash
curl -s http://search-protrek.com/info -o info.json
python3 - <<'EOF'
import json
for name, spec in json.load(open("info.json"))["named_endpoints"].items():
    print(f'{name:20} {[p["parameter_name"] for p in spec["parameters"]]}')
EOF
```

```
/parse_pdb_file      ['input_type', 'file', 'chain']
/change_output_type  ['query_type', 'subsection_type']
/change_db_type      ['query_type', 'subsection_type', 'db_type']
/load_example        ['example_id']
/change_input_type   ['choice']
/search              ['input', 'nprobe', 'topk', 'input_type', 'query_type', 'subsection_type', 'db']
/clear_results       []
/parse_pdb_file_1    ['input_type', 'file', 'chain']
/parse_pdb_file_2    ['input_type', 'file', 'chain']
/load_example_1      ['examples']
/change_input_type_1 ['choice_1', 'choice_2']
/change_input_type_2 ['choice_1', 'choice_2']
/compute_score       ['input_type_1', 'input_1', 'input_type_2', 'input_2']
```

The four that matter:

| endpoint | does |
|---|---|
| `/search` | the search itself, in any of the nine directions |
| `/compute_score` | similarity between two individual inputs, no index involved |
| `/parse_pdb_file` | turns an uploaded `.pdb`/`.cif` into a 3Di string, server-side |
| `/upload` | the plain multipart upload `/parse_pdb_file` reads from |

Calls are two steps. `POST /call/<name>` with `{"data": [...positional args...]}` returns an
`event_id`; `GET /call/<name>/<event_id>` blocks and streams back a server-sent-event whose
`data:` line is the JSON result. Arguments are **positional and unnamed** — the order is
whatever `/info` reports, and there is no keyword form.

Write the client once.

```python
# protrek.py — hosted ProTrek client. Standard library only.
import json, urllib.request

SERVER = "http://search-protrek.com"          # no HTTPS listener exists
UA = {"User-Agent": "protrek-client"}

def call(fn, data, timeout=300):
    """POST returns an event id; GET streams the completed result."""
    req = urllib.request.Request(f"{SERVER}/call/{fn}",
                                 data=json.dumps({"data": data}).encode(),
                                 headers={"Content-Type": "application/json", **UA})
    eid = json.load(urllib.request.urlopen(req, timeout=60))["event_id"]
    body = urllib.request.urlopen(f"{SERVER}/call/{fn}/{eid}", timeout=timeout).read().decode()
    event = payload = None
    for line in body.splitlines():
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: "):
            payload = json.loads(line[6:])
    return event, payload

def search(query, in_type, out_type, db="Swiss-Prot", topk=5,
           subsection="Function", nprobe=1000):
    """Returns (headers, rows). Read the headers — the columns change with out_type."""
    event, payload = call("search",
                          [query, nprobe, topk, in_type, out_type, subsection, db])
    if event != "complete":
        raise RuntimeError(f"unexpected event {event!r}")
    frame = payload[3]
    if "value" not in frame:
        return [], []          # silent empty; see "The API validates nothing"
    return frame["value"]["headers"], frame["value"]["data"]
```

`/search` returns four objects. The first is a rendered Markdown table, the second and third
are a downloadable TSV and a score histogram on the server's own filesystem, and **the
fourth is the structured result** — a dataframe with `headers` and `data`. Parse the fourth.
Parsing the Markdown, which is the obvious thing to do because it comes first, truncates
every sequence to twenty residues and rounds every score to four places.

## Searching

```python
from protrek import search

headers, rows = search("Enzyme that catalyzes the hydrolysis of PET plastic",
                       "text", "sequence", db="Swiss-Prot", topk=5)
print(headers)
for acc, seq, length, score in rows:
    print(f"{acc:<12} {length:>4} aa  {score:8.4f}  {seq[:24]}...")
```

```
['Id', 'Sequence', 'Length', 'Matching score']
Q47RJ6        301 aa   19.9569  MAVMTPRRERSSLLSRALQVTAAA...
Q6A0I4        301 aa   19.9569  MAVMTPRRERSSLLSRALQVTAAA...
A0A0K8P6T7    290 aa   19.0516  MNFPRASRLMQAAVLGGLMAVSAA...
G9BY57        293 aa   18.9000  MDGVLWRVRTAALMAALLALAAWA...
F7IX06        300 aa   18.8338  MSVTTPRRETSLLSRALRATAAAA...
```

`A0A0K8P6T7` is IsPETase from *Ideonella sakaiensis*. Nothing in the query named it, named
its organism, or gave a sequence.

### The result columns change with the output modality

Four different schemas come back from the same endpoint. Index by column name, never by
position.

| in → out | headers |
|---|---|
| any → `sequence` | `Id`, `Sequence`, `Length`, `Matching score` |
| `sequence` → `sequence` | `Id`, `Sequence`, `Length`, **`Sequence identity`**, `Matching score` |
| any → `structure` | `Id`, `Foldseek sequence`, `Length`, `Matching score` |
| any → `text` | `Id`, `Matching score` |

Two traps sit in that table. A sequence-to-sequence search gains a fifth column, so code
written against the four-column shape reads the score out of the wrong slot. And in a `text`
output the column called `Id` is **not an identifier** — it holds the annotation sentence
itself, because a text index is built over unique Swiss-Prot phrasings rather than over
proteins. There is no accession anywhere in a text result.

```python
from protrek import search

PETASE = ("MNFPRASRLMQAAVLGGLMAVSAAATAQTNPYARGPNPTAASLEASAGPFTVRSFTVSRPSGYGAGTVYYPTNA"
          "GGTVGAIAIVPGYTARQSSIKWWGPRLASHGFVVITIDTNSTLDQPSSRSSQQMAALRQVASLNGTSSSPIYGKV"
          "DTARMGVMGWSMGGGGSLISAANNPSLKAAAPQAPWDSSTNFSSVTVPTLIFACENDSIAPVNSSALPIYDSMSR"
          "NAKQFLEINGGSHSCANSGNSNQALIGKKGVAWMKRFMDNDTRYSTFACENPNSTRVSDFRTANCS")

for out in ("sequence", "structure", "text"):
    headers, rows = search(PETASE, "sequence", out, topk=1)
    print(f"{out:<10} {headers}")
    print(f"           {str(rows[0][0])[:78]}")
```

```
sequence   ['Id', 'Sequence', 'Length', 'Sequence identity', 'Matching score']
           A0A0K8P6T7
structure  ['Id', 'Foldseek sequence', 'Length', 'Matching score']
           A0A0K8P6T7
text       ['Id', 'Matching score']
           Involved in the degradation and assimilation of the plastic poly(ethylene tere
```

### Case and wrapping are normalised; anything that is not a residue is not

A sequence query is tokenised the way you would hope, and then not defended at all. Lower
case, 60-column wrapping, internal spaces and a trailing newline all produce **exactly** the
same score. A FASTA header or a trailing `*` does not — it is embedded as though it were
protein, and it moves the number without any warning. Human insulin against *Insulin
decreases blood glucose concentration*, 2026-08-29:

| input | score |
|---|---|
| plain `MALWMRLLPLL…` | 15.2821 |
| lower case | 15.2821 |
| wrapped at 60 columns | 15.2821 |
| internal spaces, trailing newline | 15.2821 |
| `>sp\|P01308\|INS_HUMAN Insulin` on the first line | 14.9492 |
| trailing `*` stop codon | 14.9761 |

So strip the header and the stop codon, and do not bother normalising case or line breaks.
Non-standard residue letters — `X`, `B`, `Z`, `U`, `O`, `J` — are accepted silently too.

There is no hidden length limit. A 3,000-residue query is embedded whole, and changing
residues past position 1,022 changes the score, so nothing is being truncated at the usual
transformer boundary. A three-residue query is also accepted, and scores 40 against its
nearest neighbour — high enough to look like a real hit. Degenerate input is your problem,
not the server's.

### `subsection` selects which text index is searched

It applies only when the output modality is `text`, and it names one of 31 Swiss-Prot
annotation fields — `Function` is the default, and `Catalytic activity`,
`Enzyme commission number`, `Subcellular location`, `Pathway`, `Involvement in disease` and
`Global` are the ones worth knowing. `Global` searches the full annotation rather than one
field. Each is a separately built index, so the same query against `Function` and against
`Catalytic activity` returns different sentences with different scores, and asking for
`Enzyme commission number` is how you get `EC 3.1.1.101` out of a sequence.

## Which databases actually answer

The dropdown lists nine. **Five of them return nothing, from every query, with no error.**
And it is finer-grained than that: a database serves some output modalities and not others,
so the live surface is a matrix, not a list. Measured 2026-08-29:

| database | → sequence | → structure | → text |
|---|---|---|---|
| Swiss-Prot | yes | yes | yes |
| UniRef50 | yes | — | — |
| PDB | yes | yes | — |
| GOPC | yes | — | — |
| Uncharacterized, OMG_prot50, NCBI, MGnify, OMG | — | — | — |

Swiss-Prot is the only database with a text index, so every `→ text` search is a Swiss-Prot
search whatever the dropdown says. Probe before you trust:

```python
from protrek import search

DBS = ["Swiss-Prot", "UniRef50", "Uncharacterized", "OMG_prot50",
       "PDB", "GOPC", "NCBI", "MGnify", "OMG"]
Q = "Enzyme that catalyzes the hydrolysis of PET plastic"

for db in DBS:
    live = [out for out in ("sequence", "structure", "text")
            if search(Q, "text", out, db=db, topk=1)[1]]
    print(f"{db:<16} {', '.join(live) if live else 'nothing'}")
```

```
Swiss-Prot       sequence, structure, text
UniRef50         sequence
Uncharacterized  nothing
OMG_prot50       nothing
PDB              sequence, structure
GOPC             sequence
NCBI             nothing
MGnify           nothing
OMG              nothing
```

The five empty databases are not gone — the mirror described under *Precomputed embeddings*
publishes embeddings for all of them. They are not loaded on the hosted server.

### Identifiers differ by database, and scores do not transfer between them

The `Id` column means something different in each corpus, and one of the four does not
resolve anywhere. From the same PET query on 2026-08-29:

| database | example id | resolves at |
|---|---|---|
| Swiss-Prot | `A0A0K8P6T7` | UniProtKB |
| UniRef50 | `A0A5P9PSA9` | **UniProtKB** — it is the cluster's representative accession, and `UniRef50_A0A5P9PSA9` 404s |
| PDB | `7VVE-B` | RCSB, after splitting entry from chain on the hyphen |
| GOPC | `SRR7986302_GL0219073` | nowhere public — a run accession and a gene call from the source catalogue |

The scores from that one query ran to 19.96 in Swiss-Prot, 19.76 in UniRef50, 21.33 in PDB
and 21.30 in GOPC. Those are four different corpora with different redundancy and different
content, not four measurements of the same thing. **Rank within one database; never compare
a score across two.**

### The API validates nothing

This is the failure mode to design around. Every one of these returns HTTP 200,
`event: complete`, and a payload of four bare `{"__type__": "update"}` objects — byte-for-byte
the same answer:

- a database that exists but is not loaded (`NCBI`)
- a database name that does not exist at all (`NotADatabase`)
- a subsection name that does not exist (`NotASubsection`)

So a typo in a database name is indistinguishable from a real, empty answer, and neither
raises. An **empty query string** is worse than that: it is not rejected either, and it
returns five plausible, scored, real Swiss-Prot proteins. Assert on non-empty input before
you call, because the service will not.

```python
from protrek import search

Q = "Enzyme that catalyzes the hydrolysis of PET plastic"
print("unloaded db  ->", search(Q, "text", "sequence", db="NCBI"))
print("typo'd db    ->", search(Q, "text", "sequence", db="NotADatabase"))
rows = search("", "text", "sequence", topk=5)[1]
print(f"empty query  -> {len(rows)} hits, top {rows[0][0]} at {rows[0][3]:.4f}")
```

```
unloaded db  -> ([], [])
typo'd db    -> ([], [])
empty query  -> 5 hits, top Q0PCD7 at 14.7077
```

Only the top of that degenerate result is stable. The same empty query returned a different
second-through-fifth place in two sessions on 2026-08-29 while the top hit and its score were
identical both times, which is what you would expect from four machines answering in turn.
Real queries were stable across repeated calls in the same session and across sessions; do
not build an assertion on the tail of a query the model was never meant to answer.

### `nprobe` does nothing

The slider labelled *Number of clusters to search (lower value for faster search and higher
value for more accurate search)* promises a speed-versus-recall trade-off that the published
indexes cannot offer. Every index in the released set is an `IndexFlatIP` — exhaustive, no
clusters — and `nprobe` is an IVF parameter a flat index ignores. Confirmed empirically on
Swiss-Prot and on UniRef50 on 2026-08-29: `nprobe=1`, `nprobe=1000` and `nprobe=1000000`
return identical accessions with identical scores. Leave it at the default and do not report
it as a search setting.

### Deduplicate before you count

Distinct accessions can carry an identical sequence and therefore an identical score. The
PET query at `topk=50` returns 50 rows, 50 distinct accessions, and **48 distinct
sequences** — `Q47RJ6`/`Q6A0I4` and `Q47RJ7`/`G8GER6` are each one protein entered twice.
Any statement of the form "N of the top 50 hits" is wrong unless you collapse on sequence
first.

## Scoring, and the control that makes a score mean something

`/compute_score` takes two inputs of any two modalities and returns their similarity without
touching an index. It is the same number `/search` reports — a useful invariant, and the way
to check a single pair you already have.

A score on its own says very little. Run a mismatched pair through the same call and quote
both.

```python
from protrek import call

PETASE = ("MNFPRASRLMQAAVLGGLMAVSAAATAQTNPYARGPNPTAASLEASAGPFTVRSFTVSRPSGYGAGTVYYPTNA"
          "GGTVGAIAIVPGYTARQSSIKWWGPRLASHGFVVITIDTNSTLDQPSSRSSQQMAALRQVASLNGTSSSPIYGKV"
          "DTARMGVMGWSMGGGGSLISAANNPSLKAAAPQAPWDSSTNFSSVTVPTLIFACENDSIAPVNSSALPIYDSMSR"
          "NAKQFLEINGGSHSCANSGNSNQALIGKKGVAWMKRFMDNDTRYSTFACENPNSTRVSDFRTANCS")
MATCH   = "Enzyme that catalyzes the hydrolysis of PET plastic"
CONTROL = ("Voltage-gated potassium channel that mediates potassium ion transport "
           "across the plasma membrane")

for label, text in (("match", MATCH), ("control", CONTROL)):
    _, out = call("compute_score", ["sequence", PETASE, "text", text])
    print(f"{label:<8} {float(out[0]['label']):7.4f}")
```

```
match    19.0516
control   1.4713
```

Upstream's own bands, from the project FAQ, and they differ by modality pair:

| pair | low | good | strong | practical ceiling |
|---|---|---|---|---|
| protein ↔ text | below 10 | above 15 | above 18 | — |
| sequence ↔ sequence | below 20 | — | above 45 | about 54 |
| structure ↔ sequence | 5–10 for a mismatch | — | — | 27–37 for a true match |

The FAQ is explicit that these are not absolute and that rank matters more than value.
The practical consequence is that **a protein-text score and a sequence-sequence score are
not comparable** — 30 is a poor sequence hit and an impossible text hit — so never pool
them into one ranking or one histogram.

The band is what catches a bad query, because the ranking never will. *purple monday
elephant sings* returns three Swiss-Prot proteins with a top score of **13.71** — five
places of precision, a plausible accession, and a value the FAQ puts below the threshold for
good relevance. Rank alone cannot tell you that. Check the number against the band for the
modality pair you actually used.

One more failure that looks like a success — **the text encoder is English-only in practice
but does not say so**. *Enzym das die Hydrolyse von PET-Kunststoff katalysiert* scores
19.03, which reads as strong relevance, and returns a completely different protein from the
English sentence that means the same thing. A high score on a non-English query is not
evidence the query was understood. Query in English.

## Structure queries without installing foldseek

A structure query is a Foldseek 3Di string, and producing one locally means installing the
Foldseek binary. The hosted server will do the conversion for you instead — upload the
coordinate file, ask for a chain, get the 3Di back, then search with it. Nothing is
installed and the structure never has to be one you could have found by accession.

Upstream's own instructions point at a Google Drive link for the binary; if you do want it
locally, take it from the Foldseek project's own releases instead, and note that Foldseek is
GPL-3.0 while ProTrek is MIT.

```python
import json, urllib.request
from protrek import SERVER, UA, call, search

# Any .pdb or .cif will do. This one is AlphaFold's model of IsPETase.
AF = "https://alphafold.ebi.ac.uk/files/AF-A0A0K8P6T7-F1-model_v6.pdb"
pdb = urllib.request.urlopen(urllib.request.Request(AF, headers=UA), timeout=300).read()

boundary = "----protrek"
body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; "
        f"filename=\"query.pdb\"\r\nContent-Type: chemical/x-pdb\r\n\r\n").encode() \
       + pdb + f"\r\n--{boundary}--\r\n".encode()
req = urllib.request.Request(f"{SERVER}/upload", data=body,
                             headers={"Content-Type":
                                      f"multipart/form-data; boundary={boundary}", **UA})
remote = json.load(urllib.request.urlopen(req, timeout=300))[0]

# "structure" as the input_type is what makes this return 3Di rather than residues.
# Unlike /search, this endpoint does signal failure — check the event.
event, out = call("parse_pdb_file",
                  ["structure", {"path": remote, "meta": {"_type": "gradio.FileData"}}, "A"])
if event != "complete":
    raise RuntimeError("no protein chain 'A' in that file")
three_di = out[0]
print(f"{len(three_di)} 3Di states: {three_di[:40]}...")

headers, rows = search(three_di, "structure", "sequence", topk=3)
for acc, _, length, score in rows:
    print(f"{acc:<12} {length:>4} aa  {score:8.4f}")
```

```
290 3Di states: ddddddddddddddddddpppppppppdpqpldwddqddl...
A0A0K8P6T7    290 aa   33.7116
G9BY57        293 aa   31.2350
D4Q9N1        296 aa   30.7558
```

Four things to know about that path.

**This is the one endpoint that reports failure.** `/search` swallows everything; here a
chain letter that names no protein comes back as `event: error` with `data: null` — no
status code, no message, just the word. Asking 1TUP for chain `E`, which is DNA, for chain
`Z`, which does not exist, and for the empty string all produce it. That is why the block
above checks `event` before touching `out[0]`, and it is the whole error surface you get.

**The 3Di string is lowercase and exactly one state per residue**, so its length must equal
the chain length. Unresolved residues are simply absent, which is why 1TUP gives 196 states
for chain A and 194 for chain B of the same protein.

**Passing `"sequence"` rather than `"structure"`** as the first argument returns the
amino-acid sequence from the same upload, which is how to get both from one file.

**A complex has to be split.** ProTrek was trained on AlphaFold DB predictions of single
chains; give it one chain at a time.

The conversion is genuinely the same one you would run locally. Foldseek 10-941cd33 on the
same AlphaFold file produced a 3Di string **byte-identical** to the server's (checked
2026-08-29), so the hosted route costs nothing in fidelity.

## Limits

**Results are capped at 10,000, and the cap is a request rather than a gate.** The FAQ
describes the limit as a fairness measure. The API does not enforce it — `topk=10001`
returned 10,001 rows on 2026-08-29. What does happen further up is worse than an error:
`topk=100000` ran for 110 seconds and then reset the connection, with no message. Stay
inside the stated limit.

**Viral proteins are out of scope by the authors' choice.** The server states it on the page
itself:

> Note: ProTrek does not support viral protein predictions for security reasons.

Treat that as a scope limit rather than a filter to route around, and know what the limit
looks like from the outside, because it does not look like a refusal. Asking for
*SARS-CoV-2 spike glycoprotein that binds ACE2* on 2026-08-29 returned bovine
angiotensin-converting enzyme 2 (`Q58DD0`) at **20.70** — above the FAQ's threshold for
strong relevance. Asking for *HIV-1 reverse transcriptase* returned a human endogenous
retrovirus Pol protein (`P63135`) at 18.65. There are no viral proteins in the index, so the
model hands back the nearest host-side thing with a confident score attached. A high score
is not evidence the subject was in scope.

**The model is weak exactly where it looks strongest.** From the project's own statement of
limitations, and each of these is a place where the retrieval will look confident and be
wrong. Training came from UniProt, so *de novo* designed proteins — especially single-domain
or single-motif ones — are out of distribution. Quantitative properties determined by a few
residues are not learned, so it will recognise a fluorescent protein and miss its emission
wavelength. Miniproteins under about 100 residues and isolated fragments are
under-represented and score low for the wrong reason. And structures came from AlphaFold DB,
so protein complexes are not modelled, only individual chains.

**Sequences come from the source databases unchanged**, which is the authors' point in the
FAQ that a retrieved metagenomic sequence may simply fail to express. Retrieval is a
hypothesis.

## Running it yourself

Do this when the sequences are confidential, when you want one of the five databases the
hosted server does not load, or when you want to search your own FASTA.

**The published dependency pins do not describe a working modern install, and the ones that
matter are not the ones the file names.** `requirements.txt` asks for `torch==2.0.1`, whose
last wheel is cp311 — there is nothing to install on Python 3.12 or newer — and
`transformers==4.28.0` from 2023. Neither pin is the real constraint. Four other things
break, each with an error that does not name the cause, and the first three fire during
`ProTrekTrimodalModel(...)` before a single weight is read:

| pin | why | what you see if you skip it |
|---|---|---|
| `torchmetrics==0.9.x` | the model class calls `torchmetrics.Accuracy()` with no arguments; 0.10 onward requires `task=` | `Accuracy.__new__() missing 1 required positional argument` |
| `setuptools<81` | torchmetrics 0.9.3 imports `pkg_resources` | `ModuleNotFoundError: No module named 'pkg_resources'` |
| `torch<2.7` | the bundled scheduler passes `verbose` positionally to `LRScheduler.__init__` | `LRScheduler.__init__() takes from 2 to 3 positional arguments but 4 were given` |
| `transformers<5` | the encoders call `tokenizer.batch_encode_plus`, removed in 5.0 | `EsmTokenizer has no attribute batch_encode_plus` |

`requirements.txt` also under-declares. `scikit-learn`, `torchmetrics`, `pytorch-lightning`,
`lmdb` and `tabulate` are listed but `pandas` is not, and the model module imports it at the
top. Install the list below rather than the file.

**`environment.sh` installs `faiss-gpu` through conda.** On a machine with no NVIDIA GPU
that install fails or silently produces something unusable; substitute `faiss-cpu` from
PyPI. Searching a flat inner-product index on CPU is fine at Swiss-Prot scale.

```bash
git clone https://github.com/westlake-repl/ProTrek.git
cd ProTrek
python3 -m venv .venv
./.venv/bin/pip install "torch<2.7" "transformers<5" "torchmetrics==0.9.3" "setuptools<81" \
    pytorch-lightning scikit-learn pandas numpy biopython easydict lmdb tabulate \
    pyspellchecker faiss-cpu huggingface_hub
./.venv/bin/hf download westlake-repl/ProTrek_35M --local-dir weights/ProTrek_35M
```

`ProTrek_35M` is 711 MB and runs on CPU. `ProTrek_650M` is 3,644 MB and is the checkpoint
the published indexes were built with — if you intend to search those indexes you need the
650M model, because embeddings from the two are not comparable. Both checkpoints bundle the
config and tokenizer of all three sub-encoders; the weights are inside the single `.pt`.

```python
import torch
from model.ProTrek.protrek_trimodal_model import ProTrekTrimodalModel

W = "weights/ProTrek_35M"
model = ProTrekTrimodalModel(
    protein_config=f"{W}/esm2_t12_35M_UR50D",
    text_config=f"{W}/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext",
    structure_config=f"{W}/foldseek_t12_35M",
    from_checkpoint=f"{W}/ProTrek_35M.pt",
).eval().to("cpu")                      # "cuda" if you have one; CPU is the fallback

PETASE = ("MNFPRASRLMQAAVLGGLMAVSAAATAQTNPYARGPNPTAASLEASAGPFTVRSFTVSRPSGYGAGTVYYPTNA"
          "GGTVGAIAIVPGYTARQSSIKWWGPRLASHGFVVITIDTNSTLDQPSSRSSQQMAALRQVASLNGTSSSPIYGKV"
          "DTARMGVMGWSMGGGGSLISAANNPSLKAAAPQAPWDSSTNFSSVTVPTLIFACENDSIAPVNSSALPIYDSMSR"
          "NAKQFLEINGGSHSCANSGNSNQALIGKKGVAWMKRFMDNDTRYSTFACENPNSTRVSDFRTANCS")
MATCH   = "Enzyme that catalyzes the hydrolysis of PET plastic"
CONTROL = ("Voltage-gated potassium channel that mediates potassium ion transport "
           "across the plasma membrane")

with torch.no_grad():
    protein = model.get_protein_repr([PETASE])
    texts = model.get_text_repr([MATCH, CONTROL])
    # Embeddings come back L2-normalised, so the dot product is a cosine. Dividing by the
    # learned temperature is what puts it on the same scale the server reports.
    scores = (protein @ texts.T / model.temperature).squeeze(0)

print("embedding", tuple(protein.shape), "norm", round(float(protein.norm()), 4))
print("temperature", round(float(model.temperature), 4))
print(f"match {scores[0]:.4f}   control {scores[1]:.4f}")
```

```
embedding (1, 1024) norm 1.0
temperature 0.0145
match 21.1800   control -2.0315
```

Loading prints two lines about optimizer defaults and a list of rotary-embedding buffers
that were not in the checkpoint. Both are expected — the class is a training module being
used for inference, and `inv_freq` buffers are recomputed rather than stored.

Note what the control did. The hosted 650M model scored that same mismatched pair at
**1.4713**; the 35M scores it at **-2.0315**. The two checkpoints are not on one scale, and
the FAQ thresholds quoted above were set against the 650M. Run your own matched and
mismatched pair through whichever checkpoint you are using and calibrate against that,
rather than importing a threshold across models.

Structure embeddings need a real 3Di string. The repository's helper shells out to a
`foldseek` binary you supply; the upload route above is the way to avoid that, and the two
produce the same string for the same chain.

```bash
# Only if you want 3Di locally. The hosted upload route above needs none of this.
case "$(uname -s)-$(uname -m)" in
  Darwin-*)      ASSET=foldseek-osx-universal.tar.gz ;;
  Linux-aarch64) ASSET=foldseek-linux-arm64.tar.gz ;;
  Linux-*)       ASSET=foldseek-linux-avx2.tar.gz ;;
esac
curl -sL -o foldseek.tar.gz \
  "https://github.com/steineggerlab/foldseek/releases/download/10-941cd33/$ASSET"
tar xzf foldseek.tar.gz && mkdir -p bin && mv foldseek/bin/foldseek bin/
chmod +x bin/foldseek && ./bin/foldseek version
```

```
941cd33ff0771cd2e3f144e3293e22a2b87e9fda
```

## The published indexes

`westlake-repl/faiss_index` on Hugging Face is a **dataset** repo, `license: mit`, not gated,
and it holds Swiss-Prot only — sequence, structure, and 56 per-subsection text indexes. Every
file is an `IndexFlatIP` of L2-normalised 1024-d float32 vectors, with a 45-byte header, and
a companion `*_ids.tsv` whose *n*-th line corresponds to the *n*-th vector.

| index | vectors | size |
|---|---|---|
| `sequence/sequence.index` | 569,792 | 2.33 GB |
| `structure/structure.index` | 545,889 | 2.24 GB |
| `text/subsections/Global.index` | 2,288,995 | 9.38 GB |
| `text/subsections/Signal_peptide.index` | 74 | 303 KB |

The whole set is about 24 GB. `Signal_peptide.index` is the one to pull first — it is
smaller than a photograph and it settles every structural question about the format:

```bash
python3 -m venv .venv
./.venv/bin/pip install faiss-cpu huggingface_hub numpy
```

```python
from huggingface_hub import hf_hub_download
import faiss, numpy as np, os

path = hf_hub_download(
    "westlake-repl/faiss_index",
    "SwissProt/ProTrek_650M_UniRef50/text/subsections/Signal_peptide.index",
    repo_type="dataset", local_dir="faiss_index")
ids = hf_hub_download(
    "westlake-repl/faiss_index",
    "SwissProt/ProTrek_650M_UniRef50/text/subsections/Signal_peptide_ids.tsv",
    repo_type="dataset", local_dir="faiss_index")

index = faiss.read_index(path)
rows = open(ids).read().splitlines()
vecs = index.reconstruct_n(0, index.ntotal)

print(type(index).__name__, "ntotal", index.ntotal, "d", index.d,
      "inner product" if index.metric_type == faiss.METRIC_INNER_PRODUCT else "L2")
print("file", os.path.getsize(path), "bytes = 45 +", index.ntotal, "x", index.d, "x 4")
print("ids.tsv lines", len(rows), "| norms", np.unique(np.round(np.linalg.norm(vecs, axis=1), 6)))
print("row 0:", rows[0])
```

```
IndexFlatIP ntotal 74 d 1024 inner product
file 303149 bytes = 45 + 74 x 1024 x 4
ids.tsv lines 74 | norms [1.]
row 0: The position 1 to 18 in this protein contains an N-terminal signal peptide.
```

Seventy-four vectors for every signal peptide in Swiss-Prot is not a truncated index — a
text index stores each *distinct sentence* once, and there are only 74 distinct phrasings of
the signal-peptide annotation. This is also why a `→ text` search returns sentences and no
accessions: the vectors were never per-protein.

And note which index that was. The published set has **56** subsection indexes; the hosted
dropdown offers **31**, all of which are published — so 25 built indexes are unreachable
from the public server, including `Active_site`, `Binding_site`, `Transmembrane`,
`Natural_variant`, `Mutagenesis`, `Disulfide_bond` and `Signal_peptide` itself. Wanting one
of those is a reason to deploy locally that has nothing to do with confidentiality.

To serve the whole thing locally, pull the dataset and the 650M weights and run the bundled
pipeline. Ports 7860–7863 must all be free; it uses four.

```bash
./.venv/bin/hf download westlake-repl/faiss_index --repo-type dataset --local-dir faiss_index/
./.venv/bin/hf download westlake-repl/ProTrek_650M --local-dir weights/ProTrek_650M
```

```bash
./.venv/bin/python demo/run_pipeline.py
```

The repository README links the index as `faiss_index_ProTrek_650M_UniRef50`, and the model
as `ProTrek_650M_UniRef50`. Both names now 307-redirect to `faiss_index` and `ProTrek_650M`;
the directory layout inside still carries the old name, which is why the paths above read
`SwissProt/ProTrek_650M_UniRef50/`.

### Precomputed embeddings for the other databases

Hugging Face carries Swiss-Prot. The other eight — UniRef50, PDB, GOPC, NCBI, MGnify,
Uncharacterized, OMG and OMG_prot50, which includes all five the hosted server does not
load — are published at `https://protrek.westlake.edu.cn/` instead, as raw `.npy`
memory-mapped `float32` arrays of shape `(n, 1024)` alongside an `ids.tsv`, split into
numbered parts of about 10 million proteins each. GOPC alone is 492 files. PDB is shipped as
a faiss `.index` instead of `.npy`. Building a searchable index out of those is your job;
they ship as embeddings, not as an index.

**That site carries no licence statement of any kind** — no licence, no copyright line, no
terms, no citation request anywhere on the page (checked 2026-08-29). The MIT grant on the
Hugging Face dataset does not extend to it, and silence is not permission. Prefer the Hugging
Face copy for anything you will redistribute or build a product on, and treat the mirror as
material whose terms you would have to ask the authors about.

## Licensing, and one gap worth knowing

| artefact | what it says | where |
|---|---|---|
| ProTrek source | MIT, `Copyright (c) 2024 westlake-repl` | `LICENSE` in the repository |
| `ProTrek_650M`, `ProTrek_35M` | `license: mit` on the model card, not gated | Hugging Face metadata |
| `faiss_index` | `license: mit` on the dataset card, not gated | Hugging Face metadata |
| ESM-2 sequence encoder | MIT | see the `esm` skill |
| PubMedBERT text encoder | MIT | Microsoft's model card |
| Foldseek, if you install the binary | GPL-3.0 | the Foldseek repository |
| `protrek.westlake.edu.cn` embeddings | nothing stated | — |

**The gap.** None of the three Hugging Face repositories contains a `LICENSE` file — all
three answer 404 for one (checked 2026-08-29). The MIT grant on the weights and on the index
exists only as the `license:` tag on the repository card. That tag is a deliberate
declaration by the uploading account, and the code repository's MIT `LICENSE` is
unambiguous, so nothing here is blocked. It is a weaker artefact than a checked-in licence
file, and it is worth knowing before relying on it commercially. The date is stated so a
later reader can test whether it has been fixed rather than repeat the search.

## Try it

**Data.** Three public sources, none needing an account.

- The hosted server at `http://search-protrek.com` — no key, no registration, plain HTTP.
- AlphaFold DB's model of IsPETase, `AF-A0A0K8P6T7-F1-model_v6.pdb`, CC-BY-4.0.
- `Signal_peptide.index` from `westlake-repl/faiss_index` on Hugging Face, MIT, 303 KB.

All three confirmed reachable 2026-08-29. The block below is standard library only —
no installs, no faiss, no torch — and it routes through every trap this skill documents.

**Run.** In an empty directory:

```python
# try_protrek.py
import json, struct, urllib.request

SERVER = "http://search-protrek.com"          # plain HTTP — there is no HTTPS listener
UA = {"User-Agent": "protrek-skill-check"}

def call(fn, data, timeout=300):
    req = urllib.request.Request(f"{SERVER}/call/{fn}",
                                 data=json.dumps({"data": data}).encode(),
                                 headers={"Content-Type": "application/json", **UA})
    eid = json.load(urllib.request.urlopen(req, timeout=60))["event_id"]
    body = urllib.request.urlopen(f"{SERVER}/call/{fn}/{eid}", timeout=timeout).read().decode()
    event = payload = None
    for line in body.splitlines():
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: "):
            payload = json.loads(line[6:])
    return event, payload

def search(query, in_type, out_type, db="Swiss-Prot", topk=5,
           subsection="Function", nprobe=1000):
    event, payload = call("search", [query, nprobe, topk, in_type, out_type, subsection, db])
    assert event == "complete", event
    frame = payload[3]
    if "value" not in frame:                  # silent empty — nothing ever raises
        return [], []
    return frame["value"]["headers"], frame["value"]["data"]

# 1. Text -> sequence. A PET-hydrolase sentence must retrieve IsPETase.
PET_DESC = "Enzyme that catalyzes the hydrolysis of PET plastic"
headers, rows = search(PET_DESC, "text", "sequence", topk=5)
print("headers:", headers)
for acc, seq, length, score in rows:
    print(f"  {acc:<12} {length:>4} aa  {score:8.4f}  {seq[:20]}...")
hits = {r[0]: r for r in rows}
assert "A0A0K8P6T7" in hits, sorted(hits)
petase_seq = hits["A0A0K8P6T7"][1]
petase_search_score = hits["A0A0K8P6T7"][3]

# 2. An unloaded database, a database that does not exist, and a subsection that does not
#    exist are the same 200 with the same empty payload.
dead = search(PET_DESC, "text", "sequence", db="NCBI")
typo = search(PET_DESC, "text", "sequence", db="NotADatabase")
bad_sub = search(petase_seq, "sequence", "text", subsection="NotASubsection")
assert dead == typo == bad_sub == ([], []), (dead, typo, bad_sub)
print(f"\nunserved db, invalid db and invalid subsection are indistinguishable -> {dead}")

# 3. An empty query is not rejected either.
_, empty_rows = search("", "text", "sequence", topk=5)
assert len(empty_rows) == 5, len(empty_rows)
print(f"empty query -> {len(empty_rows)} hits, top {empty_rows[0][0]} at {empty_rows[0][3]:.4f}")

# 4. Distinct accessions can share a sequence and a score.
_, fifty = search(PET_DESC, "text", "sequence", topk=50)
by_seq = {}
for acc, seq, _, score in fifty:
    by_seq.setdefault(seq, []).append(acc)
dups = [v for v in by_seq.values() if len(v) > 1]
assert len(fifty) == 50 and len(by_seq) < 50
print(f"topk=50 -> {len(fifty)} rows, {len(by_seq)} distinct sequences; duplicated: "
      + ", ".join("/".join(g) for g in dups))

# 5. compute_score reproduces the search score, and collapses on a mismatch.
CONTROL = ("Voltage-gated potassium channel that mediates potassium ion transport "
           "across the plasma membrane")
_, m = call("compute_score", ["sequence", petase_seq, "text", PET_DESC])
_, c = call("compute_score", ["sequence", petase_seq, "text", CONTROL])
match, control = float(m[0]["label"]), float(c[0]["label"])
assert abs(match - petase_search_score) < 1e-3, (match, petase_search_score)
print(f"\ncompute_score  match {match:.4f}  control {control:.4f}  "
      f"(search reported {petase_search_score:.4f})")

# 6. Structure query with no local foldseek — upload, convert server-side, search.
AF = "https://alphafold.ebi.ac.uk/files/AF-A0A0K8P6T7-F1-model_v6.pdb"
pdb = urllib.request.urlopen(urllib.request.Request(AF, headers=UA), timeout=300).read()
boundary = "----protrek"
body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; "
        f"filename=\"query.pdb\"\r\nContent-Type: chemical/x-pdb\r\n\r\n").encode() \
       + pdb + f"\r\n--{boundary}--\r\n".encode()
up = urllib.request.Request(f"{SERVER}/upload", data=body,
                            headers={"Content-Type":
                                     f"multipart/form-data; boundary={boundary}", **UA})
remote = json.load(urllib.request.urlopen(up, timeout=300))[0]
_, three_di = call("parse_pdb_file",
                   ["structure", {"path": remote, "meta": {"_type": "gradio.FileData"}}, "A"])
three_di = three_di[0]
assert len(three_di) == len(petase_seq) == 290, (len(three_di), len(petase_seq))
assert set(three_di) <= set("acdefghiklmnpqrstvwy")
headers, struc_rows = search(three_di, "structure", "sequence", topk=3)
print(f"\n3Di from server-side foldseek, {len(three_di)} states: {three_di[:24]}...")
for acc, _, length, score in struc_rows:
    print(f"  {acc:<12} {length:>4} aa  {score:8.4f}")
assert struc_rows[0][0] == "A0A0K8P6T7", struc_rows[0][0]

# 7. The published index is a flat inner-product table of unit-norm 1024-d vectors.
IDX = ("https://huggingface.co/datasets/westlake-repl/faiss_index/resolve/main/"
       "SwissProt/ProTrek_650M_UniRef50/text/subsections/Signal_peptide.index")
blob = urllib.request.urlopen(urllib.request.Request(IDX, headers=UA), timeout=300).read()
fourcc, dim, ntotal, _, _, trained, metric, ncodes = struct.unpack_from("<4siqqqBiq", blob, 0)
head = struct.calcsize("<4siqqqBiq")
assert (fourcc, dim, metric, trained) == (b"IxFI", 1024, 0, 1)
assert ncodes == ntotal * dim and len(blob) == head + ncodes * 4
vec = struct.unpack_from(f"<{dim}f", blob, head)
norm = sum(x * x for x in vec) ** 0.5
print(f"\n{fourcc.decode()}  d={dim}  ntotal={ntotal}  metric=INNER_PRODUCT  "
      f"{len(blob):,} bytes = {head} + {ntotal}x{dim}x4")
print(f"first vector L2 norm {norm:.6f}")
```

**Expect.**

Invariants — these hold whatever upstream does, and a failure means this skill is wrong:

- A search returns four objects; the fourth carries `headers` and `data`, and the header
  list changes with the output modality.
- An unloaded database, a nonexistent database and a nonexistent subsection are
  indistinguishable — all three are `event: complete` with an empty payload, and none
  raises. This is the assertion that proves the API does **not** validate.
- An empty query is not rejected and returns scored hits.
- `compute_score` on a pair equals the matching score `/search` reports for that same pair —
  this is the assertion, and it is what makes the two endpoints one measurement.
- A matched description scores far above a mismatched one. The size of the gap is a version
  observation; that a gap exists at all is not.
- The 3Di string has exactly one lowercase state per residue, so its length equals the
  chain length.
- The published index is `IxFI` — `IndexFlatIP`, metric 0 — with `d = 1024`, a 45-byte
  header, and a file size of exactly `45 + ntotal x 1024 x 4`. Its vectors are unit-norm.

Observed 2026-08-29 against Gradio 4.37.1 — these move if the databases are rebuilt, so a
mismatch is drift to investigate rather than a bug:

```
headers: ['Id', 'Sequence', 'Length', 'Matching score']
  Q47RJ6        301 aa   19.9569  MAVMTPRRERSSLLSRALQV...
  Q6A0I4        301 aa   19.9569  MAVMTPRRERSSLLSRALQV...
  A0A0K8P6T7    290 aa   19.0516  MNFPRASRLMQAAVLGGLMA...
  G9BY57        293 aa   18.9000  MDGVLWRVRTAALMAALLAL...
  F7IX06        300 aa   18.8338  MSVTTPRRETSLLSRALRAT...

unserved db, invalid db and invalid subsection are indistinguishable -> ([], [])
empty query -> 5 hits, top Q0PCD7 at 14.7077
topk=50 -> 50 rows, 48 distinct sequences; duplicated: Q47RJ6/Q6A0I4, Q47RJ7/G8GER6

compute_score  match 19.0516  control 1.4713  (search reported 19.0516)

3Di from server-side foldseek, 290 states: ddddddddddddddddddpppppp...
  A0A0K8P6T7    290 aa   33.7116
  G9BY57        293 aa   31.2350
  D4Q9N1        296 aa   30.7558

IxFI  d=1024  ntotal=74  metric=INNER_PRODUCT  303,149 bytes = 45 + 74x1024x4
first vector L2 norm 1.000000
```

The line to watch is the second one. If an unloaded database ever starts returning an error
instead of silence, the defensive checks this skill recommends become unnecessary and the
*Which databases actually answer* section should be rewritten.

## Sources

- ProTrek source and deployment instructions —
  <https://github.com/westlake-repl/ProTrek>
- Limitations, score interpretation, the four-server note and the 10,000-result cap —
  <https://github.com/westlake-repl/ProTrek/wiki/FAQs>
- Hosted search server — <http://search-protrek.com/>, endpoint contract at `/info`
- Model weights — <https://huggingface.co/westlake-repl/ProTrek_650M> and
  <https://huggingface.co/westlake-repl/ProTrek_35M>
- Precomputed Swiss-Prot indexes —
  <https://huggingface.co/datasets/westlake-repl/faiss_index>
- Embeddings for the remaining databases — <https://protrek.westlake.edu.cn/>
- A trimodal protein language model enables advanced protein searches, *Nature
  Biotechnology*, 2026 — <https://doi.org/10.1038/s41587-025-02836-0> (PMID 41039041)
- Foldseek, whose 3Di alphabet the structure modality uses —
  <https://github.com/steineggerlab/foldseek>
