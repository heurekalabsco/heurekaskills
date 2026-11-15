---
name: ensembl
description: Pull genes, transcripts, sequences, cross-references, variant consequences (VEP), orthologues and GRCh37/GRCh38 coordinates from Ensembl and Ensembl Genomes — vertebrates, plants, fungi, metazoa — over the REST API, choose the canonical or MANE transcript correctly, resolve retired IDs, and write FASTA, GFF3 and checksummed release files to disk.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [ensembl, public-data, genomic-intervals, variant-effect, human-genetics]
covers: [ensembl, ensembl genomes, gene annotation, transcript, canonical transcript, mane select, refseq, stable id, gene symbol, cdna, cds, protein sequence, gtf, gff3, fasta, vep, variant consequence, hgvs, dbsnp, orthologue, homology, compara, liftover, grch37, grch38, human, mouse, zebrafish, arabidopsis, yeast]
papers: [PMID:39656687, PMID:25236461, PMID:27268795, PMID:35388217, PMID:34791415, PMID:37953337]
access: [open]
datasets: ['https://rest.ensembl.org/lookup/symbol/homo_sapiens/BRCA2?content-type=application/json', https://ftp.ensembl.org/pub/release-116/fasta/saccharomyces_cerevisiae/pep/Saccharomyces_cerevisiae.R64-1-1.pep.all.fa.gz, https://ftp.ensembl.org/pub/release-116/fasta/homo_sapiens/dna_index/Homo_sapiens.GRCh38.dna.toplevel.fa.gz.fai]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: Ensembl release 116 / Ensembl Genomes 63 / rest.ensembl.org and grch37.rest.ensembl.org (both reporting release 116) / ftp.ensembl.org release-116 / Python 3.12.13 stdlib only / curl 8.7.1
  executed: 17
  unverified: 0
---
# Ensembl

Ensembl (EMBL-EBI) is the reference annotation for vertebrate genomes, and through Ensembl
Genomes for plants, fungi, protists, metazoa and bacteria. Every gene, transcript, exon and
protein has a stable ID (`ENSG…`, `ENST…`, `ENSP…`, with species infixes such as `ENSMUSG`
and `ENSDARG`; non-vertebrate genomes keep their community IDs such as `AT4G00020` or
`YER095W`). This skill gets those records, their sequences and their relationships out of
Ensembl and onto disk, without stumbling over the places where the API answers a slightly
different question from the one you asked.

**No account, no key, no licence to accept.** Ensembl states that it "imposes no restrictions
on access to, or use of, the data provided"; cite the release you used.

Two routes, and the choice is about size:

| route | use it for | limits |
|---|---|---|
| REST, `https://rest.ensembl.org` | one gene to a few thousand; lookups, sequences, VEP, orthologues | 55,000 requests/hour (header `x-ratelimit-limit`), POST bodies of 1000 IDs (200 for VEP), regions of 5 Mb (10 Mb for sequence) |
| FTP over HTTPS, `https://ftp.ensembl.org/pub/release-N/` | whole-genome GTF/GFF3/FASTA | none, but files run to hundreds of MB: check sizes with `HEAD` first |

Ensembl Genomes divisions (plants, fungi, metazoa, protists) are served by the **same REST
server**, so `arabidopsis_thaliana` works on `rest.ensembl.org`. Their bulk files live on a
different host, `https://ftp.ensemblgenomes.ebi.ac.uk/pub/<division>/release-N/`, numbered 53
below Ensembl (Ensembl 116 = Ensembl Genomes 63; `info/eg_version` reports it).

## Release drift

The REST server serves **only the current release**, which moved to 116 for this skill's
verification. Gene versions, canonical transcripts and even gene IDs change between releases.
Record the release (`info/data`) next to everything you save, and when a result must be
reproducible later, take files from `release-N/` on the FTP site, which do not change, rather
than from `current/`. `grch37.rest.ensembl.org` reports the same release number, but its gene
annotation is the GRCh37 build that froze years ago (see *GRCh37* below).

## The request helper

Every Python block below imports this. Save it as `ens.py` next to them. It uses only the
standard library.

```python
"""ens.py — one function for every Ensembl REST call in this skill."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

SERVER = "https://rest.ensembl.org"            # GRCh37: https://grch37.rest.ensembl.org


class EnsemblError(Exception):
    """A 4xx from Ensembl, carrying its own error text."""


def ens(path, params=None, data=None, server=SERVER, accept="application/json",
        tries=6, timeout=180):
    """GET `path` (POST when `data` is given) and return parsed JSON, or text for other types.

    429 waits for Retry-After; 5xx and network errors back off and retry, because the
    service answers a few percent of requests with an HTML 503 page that is not JSON.
    """
    url = f"{server}/{path.lstrip('/')}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    body = None if data is None else json.dumps(data).encode()
    for attempt in range(tries):
        # Ensembl chooses the response format from Content-Type, not Accept.
        req = urllib.request.Request(url, data=body, headers={
            "Content-Type": "application/json" if body else accept, "Accept": accept,
            "User-Agent": "ensembl-skill (python urllib)"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                text = r.read().decode()
            return json.loads(text) if accept == "application/json" else text
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")
            if e.code == 429:
                time.sleep(float(e.headers.get("Retry-After") or 1) + 0.5)
                continue
            if e.code >= 500:
                time.sleep(min(2 ** attempt, 30))
                continue
            try:
                msg = json.loads(text).get("error", text)
            except ValueError:
                msg = text[:200]
            raise EnsemblError(f"{e.code} {url} — {msg}") from None
        except (urllib.error.URLError, TimeoutError):
            time.sleep(min(2 ** attempt, 30))
    raise EnsemblError(f"no answer after {tries} tries — {url}")
```

Three things in it are load-bearing:

- **The response format follows `Content-Type`, not `Accept`.** Ask for GFF3 or FASTA with
  only `Accept` set and the server tries to serialise to JSON and returns a 400.
- **About one request in twenty comes back as an HTML `503` page during busy periods.** It is
  not JSON, so a bare `json.loads` crashes; the helper retries it.
- **A 429 carries `Retry-After`.** Forty concurrent requests did not trigger one during
  testing; the hourly budget is what a large loop actually runs into.

From the shell, the same rule about `Content-Type` holds:

```bash
curl -s -H "Content-Type: application/json" \
  "https://rest.ensembl.org/lookup/symbol/homo_sapiens/BRCA2" | head -c 300; echo
curl -s -w ' [%{http_code}]\n' -H "Content-Type: application/json" \
  "https://rest.ensembl.org/lookup/id/ENSG00000139618.19"
```

## Resolve a gene

```python
import re
from ens import ens, EnsemblError

ENS_VERSIONED = re.compile(r"^(ENS[A-Z]*[EGPRT]\d{11})\.\d+$")


def strip_version(stable_id):
    """ENSG00000139618.19 -> ENSG00000139618; lookup/ and sequence/ reject the suffix.

    Only Ensembl-style IDs. In AT4G00020.2 (an Arabidopsis transcript) the ".2" is part
    of the ID, and stripping it silently turns a transcript into its gene.
    """
    m = ENS_VERSIONED.match(stable_id)
    return m.group(1) if m else stable_id


def resolve_gene(species, name):
    """Return a list of current gene records for a symbol, synonym or stable ID.

    lookup/symbol knows only the official symbol. xrefs/symbol also searches synonyms
    and external IDs (UniProt, RefSeq), but answers with genes, transcripts, proteins
    and LRG records mixed together — keep only Ensembl genes.
    """
    name = strip_version(name)
    for path in (f"lookup/id/{name}", f"lookup/symbol/{species}/{name}"):
        try:
            rec = ens(path, {"species": species} if "/id/" in path else None)
            if rec.get("object_type") == "Gene":
                return [rec]
        except EnsemblError:
            pass
    hits = ens(f"xrefs/symbol/{species}/{name}")
    gene_ids = [h["id"] for h in hits if h["type"] == "gene" and not h["id"].startswith("LRG_")]
    return [ens(f"lookup/id/{g}") for g in dict.fromkeys(gene_ids)]


assert strip_version("ENSMUST00000202313.3") == "ENSMUST00000202313"
assert strip_version("AT4G00020.2") == "AT4G00020.2"
print(ens("lookup/id/AT4G00020.2")["object_type"], "AT4G00020.2")

for sp, q in [("homo_sapiens", "BRCA2"), ("homo_sapiens", "ENSG00000139618.19"),
              ("homo_sapiens", "FANCD1"), ("homo_sapiens", "P51587"), ("homo_sapiens", "MDR1"),
              ("danio_rerio", "brca2"), ("arabidopsis_thaliana", "AT4G00020"),
              ("saccharomyces_cerevisiae", "RAD51"), ("homo_sapiens", "NOTAGENE1")]:
    recs = resolve_gene(sp, q)
    print(f"{sp:26} {q:20} ->", [(r["id"], r["display_name"], r["assembly_name"]) for r in recs])
```

- **`lookup/symbol` only knows the current official symbol.** `FANCD1` (a BRCA2 synonym) is a
  400 there. `xrefs/symbol` searches synonyms and external accessions (UniProt `P51587`
  works) but mixes in transcripts, proteins and `LRG_` records, so filter to genes.
- **A synonym can name several genes.** `MDR1` resolves to `ABCB1` *and* `TBC1D9`. Return the
  list and choose on the record; never take the first hit.
- **`lookup/id` and `sequence/id` reject versioned IDs**: `ENSG00000139618.19` is a 400
  (`ID … not found`), even though it is the current version. Strip the suffix before calling,
  but only from `ENS…` IDs. In `AT4G00020.2` the `.2` is part of an Arabidopsis transcript ID,
  and stripping it quietly turns the transcript into its gene.

For many IDs at once, POST in chunks of 1000. Anything unknown, retired or versioned comes back
as `None` rather than an error:

```python
from ens import ens


def lookup_many(ids, species=None, chunk=1000):
    """POST lookup/id in chunks of at most 1000. Unknown or retired IDs come back as None."""
    out = {}
    ids = list(dict.fromkeys(ids))
    for i in range(0, len(ids), chunk):
        body = {"ids": ids[i:i + chunk]}
        if species:
            body["species"] = species
        out.update(ens("lookup/id", data=body))
    return out


res = lookup_many(["ENSG00000139618", "ENSMUSG00000041147", "ENSDARG00000079015",
                   "ENSG00000300550", "ENSG00000139618.19"])
for k, v in res.items():
    print(f"{k:22}", None if v is None else (v["species"], v["display_name"], v["assembly_name"]))
```

## Retired IDs

An ID that 400s on `lookup/` may simply have been retired. `archive/id` says when and what
replaced it:

```python
from ens import ens, EnsemblError


def history(stable_id):
    """What became of an ID that lookup/ no longer knows."""
    a = ens(f"archive/id/{stable_id}")
    return {"id": a["id"], "current": a["is_current"] == "1", "last_release": int(a["release"]),
            "last_assembly": a["assembly"], "latest": a["latest"],
            "replacements": [(r["stable_id"], r["score"]) for r in a["possible_replacement"]]}


for sid in ["ENSG00000139618", "ENSG00000300550", "ENSG00000200042"]:
    print(history(sid))

try:
    ens("archive/id/ENSG99999999999")
except EnsemblError as e:
    print("never existed:", e)
```

`ENSG00000300550` was last seen in release 114 and points at `ENSG00000287596`. `score` is a
sequence-overlap score, not a guarantee; two replacements means the gene was split, and you
decide which one carries the meaning you need. `ENSG00000200042` was last seen on GRCh37
(release 75), and the GRCh37 server still serves it. An ID that never existed is a 400 here
too. Note that POST `archive/id` silently drops IDs it has never heard of, so 1000 in can be
8 out.

## Choose the transcript

A human gene averages several transcripts (BRCA2 has 19, TP53 40). Pick one deliberately:

- **Ensembl canonical**: one per gene, every species. `is_canonical: 1` on the transcript.
- **MANE Select**: human only. One transcript per protein-coding gene that NCBI and EMBL-EBI
  agree on base for base, paired with a versioned RefSeq (`NM_000059.4`). This is the one
  clinical reporting expects. Ask for it with `mane=1`.
- **MANE Plus Clinical**: an additional transcript in a few genes, needed for clinically
  reported variants the Select misses. It is **not** the canonical: in `CDKN2A` the canonical
  encodes p16, and `ENST00000579755` (Plus Clinical, `NM_058195.4`) encodes p14ARF.

```python
from ens import ens


def pick_transcript(gene_id):
    """The Ensembl canonical transcript, plus its MANE Select record where one exists.

    The gene's `canonical_transcript` field carries a version suffix ("ENST00000380152.8"),
    and for genomes without Ensembl versioning a bare trailing dot ("YER095W_mRNA.").
    Read `is_canonical` on the expanded transcripts instead of parsing that string.
    """
    g = ens(f"lookup/id/{gene_id}", {"expand": 1, "mane": 1})
    tx = [t for t in g["Transcript"] if t.get("is_canonical") == 1]
    assert len(tx) == 1, f"{gene_id}: {len(tx)} canonical transcripts"
    t = tx[0]
    mane = {m["type"]: m["refseq_match"] for m in t.get("MANE", [])}
    return {"gene": g["id"], "symbol": g.get("display_name"), "transcript": t["id"],
            "version": t.get("version"), "biotype": t["biotype"],
            "translation": (t.get("Translation") or {}).get("id"),
            "n_transcripts": len(g["Transcript"]), "mane": mane,
            "gene_field": g["canonical_transcript"]}


for gid in ["ENSG00000139618", "ENSG00000141510", "ENSMUSG00000041147",
            "ENSDARG00000079015", "YER095W"]:
    print(pick_transcript(gid))
```

The gene's own `canonical_transcript` string is awkward to parse: it carries the version
(`ENST00000380152.8`), and for genomes without Ensembl versioning it ends in a bare dot
(`YER095W_mRNA.`). Read `is_canonical` from the expanded transcripts instead. Mouse,
zebrafish, yeast and Arabidopsis return an empty MANE dict, which is correct, not a failure.

## Sequences

```python
from ens import ens, EnsemblError

tx = "ENST00000380152"                                # BRCA2 canonical / MANE Select
for kind in ("genomic", "cdna", "cds", "protein"):
    s = ens(f"sequence/id/{tx}", {"type": kind})
    print(f"{kind:8} {s['id']}.{s['version']}  {len(s['seq']):>6}  {s['seq'][:12]}…{s['seq'][-6:]}")

# A gene ID with any type but genomic is ambiguous — one sequence per transcript.
try:
    ens("sequence/id/ENSG00000139618", {"type": "protein"})
except EnsemblError as e:
    print("refused:", str(e).split(" — ")[1][:110])
prots = ens("sequence/id/ENSG00000139618", {"type": "protein", "multiple_sequences": 1})
print("all BRCA2 proteins:", len(prots), "longest", max(len(p["seq"]) for p in prots))

# Flanks and arbitrary regions. Strand -1 returns the reverse complement.
g = ens("sequence/id/ENSG00000139618", {"expand_5prime": 1000, "expand_3prime": 1000})
print("gene ±1 kb:", g["desc"], len(g["seq"]))
fwd = ens("sequence/region/human/13:32315086..32315100:1")["seq"]
rev = ens("sequence/region/human/13:32315086..32315100:-1")["seq"]
print(fwd, rev)
try:
    ens("sequence/region/human/1:1-10000001")
except EnsemblError as e:
    print("refused:", str(e).split(" — ")[1][:80])
```

- `genomic` is the full transcript span including introns; `cdna` is the spliced transcript
  with UTRs; `cds` runs from start codon to stop codon **inclusive**, so `len(cds) == 3 *
  len(protein) + 3`. That held for every canonical transcript tried (human, mouse,
  zebrafish, yeast, Arabidopsis, titin at 35,991 aa).
- Asking for `protein` from a transcript returns the `ENSP…` record with **its own version**
  (`ENSP00000369497.3` for `ENST00000380152.8`).
- **A gene ID with any type but `genomic` is refused** unless you pass `multiple_sequences=1`,
  which returns a list, one per transcript.
- Do not translate a CDS yourself with the standard code. `MT-CO1` ends in `AGA`, a stop in the
  vertebrate mitochondrial code, and selenoproteins (`GPX1`, `SELENOP`) contain `U` in the
  protein Ensembl returns.
- Region coordinates are 1-based and inclusive, `chrom:start..end:strand`; strand `-1` returns
  the reverse complement. The `chr` prefix is accepted but not needed. Regions over 10 Mb are
  refused.

## Regions

```python
from ens import ens

MAX_SPAN = 5_000_000                                   # overlap/region refuses anything longer


def genes_in(species, chrom, start, end, biotype=None):
    """Every gene overlapping chrom:start-end, walking the region in 5 Mb windows."""
    seen = {}
    for s in range(start, end + 1, MAX_SPAN):
        e = min(s + MAX_SPAN - 1, end)
        params = {"feature": "gene"}
        if biotype:
            params["biotype"] = biotype
        for g in ens(f"overlap/region/{species}/{chrom}:{s}-{e}", params):
            seen[g["id"]] = g                          # genes spanning a window edge come back twice
    return sorted(seen.values(), key=lambda g: g["start"])


coding = genes_in("human", "17", 7_000_000, 18_000_000, biotype="protein_coding")
print(len(coding), "protein-coding genes in 17:7-18 Mb;", coding[0]["external_name"], "…",
      coding[-1]["external_name"])

# overlap/id is a *region* query over the ID's span: it returns the neighbours too.
near = ens("overlap/id/ENSG00000139618", {"feature": "gene"})
print("overlap/id ENSG00000139618 ->", [(g["id"], g.get("external_name")) for g in near])
own_tx = ens("overlap/id/ENSG00000139618", {"feature": "transcript"})
print(len(own_tx), "transcripts in span;",
      sum(t["Parent"] == "ENSG00000139618" for t in own_tx), "belong to BRCA2")
```

- `overlap/region` refuses spans over 5 Mb; walk larger regions in windows and deduplicate.
- Variation is far denser than genes: 1 Mb of chromosome 19 returned 425,547 variants and a
  5 Mb request did not finish. Use windows of about 100 kb for `feature=variation`.
- **`overlap/id` is a region query over the ID's span, not a list of the ID's parts.** For
  BRCA2 it also returns a pseudogene inside it and the neighbouring `ZAR1L`. Filter on
  `Parent` (transcripts) or `id` (genes).

## Cross-references

```python
from ens import ens

gene, tx, prot = "ENSG00000139618", "ENST00000380152", "ENSP00000369497"
by_db = {}
for x in ens(f"xrefs/id/{gene}"):
    by_db.setdefault(x["dbname"], []).append(x["primary_id"])
print({k: by_db[k] for k in ("HGNC", "EntrezGene", "MIM_GENE")})
print("Uniprot_gn on the gene:", len(by_db["Uniprot_gn"]), "accessions")   # every isoform's entry

# Ask the object at the right level: the canonical protein maps to one Swiss-Prot entry.
print("Swiss-Prot:", [x["primary_id"] for x in ens(f"xrefs/id/{prot}", {"external_db": "Uniprot/SWISSPROT"})])
print("RefSeq mRNA:", [x["primary_id"] for x in ens(f"xrefs/id/{tx}", {"external_db": "RefSeq_mRNA"})])
```

Ask at the right level. On the gene, `Uniprot_gn` lists 14 accessions, one per isoform's
UniProt entry including TrEMBL; on the canonical protein, `Uniprot/SWISSPROT` gives the single
reviewed entry. `RefSeq_mRNA` on a transcript lists every RefSeq that overlaps it, without
versions. For the one-to-one pairing, use MANE.

## Variants and VEP

```python
from ens import ens, EnsemblError

v = ens("variation/human/rs80357906")
m = v["mappings"][0]
print(v["name"], v["var_class"], m["location"], m["allele_string"], v["clinical_significance"])

# VEP leaves out the canonical / MANE flags and HGVS unless you ask for them.
r = ens("vep/human/id/rs80357906", {"canonical": 1, "mane": 1, "hgvs": 1})[0]
print("most severe:", r["most_severe_consequence"], "|", len(r["transcript_consequences"]),
      "transcript consequences")
for t in r["transcript_consequences"]:
    if t.get("mane_select"):
        print(" MANE:", t["transcript_id"], t["mane_select"], t["hgvsc"], t["hgvsp"])

# Three other ways in: HGVS, region + allele, and batch POST (max 200 per request).
print(ens("vep/human/hgvs/ENST00000357654.9:c.5264dup")[0]["most_severe_consequence"])
print(ens("vep/human/region/17:43057063-43057063:1/T")[0]["most_severe_consequence"])
batch = ens("vep/human/id", data={"ids": ["rs80357906", "rs699", "rs999999999999"]})
print("asked 3, got", [b["id"] for b in batch])          # unknown IDs vanish from a POST

for bad in ("vep/human/hgvs/ENST00000357654.9:c.5264A>T", "vep/human/id/rs999999999999"):
    try:
        ens(bad)
    except EnsemblError as e:
        print("refused:", str(e).split(" — ")[1][:120])
try:
    ens("vep/human/id", data={"ids": [f"rs{i}" for i in range(1, 202)]})
except EnsemblError as e:
    print("refused:", str(e).split(" — ")[1][:90])
```

- `variation/` gives the record (`GGG/GGGG`, as dbSNP spells the allele); VEP normalises
  alleles before annotating, so the two allele strings for one variant need not match.
- **VEP reports a consequence for every overlapping transcript** (44 here) and omits the
  canonical/MANE flags and HGVS unless you ask with `canonical=1`, `mane=1`, `hgvs=1`. Choose
  the transcript first, then read its consequence. `most_severe_consequence` may come from a
  transcript you would never report on.
- An HGVS whose reference base disagrees with the genome is refused with the base Ensembl sees.
  That is the check you want, not an error to suppress.
- POST takes at most 200 variants, and **unknown IDs vanish from the response** instead of
  raising. Match outputs to inputs by `id`/`input` and count what is missing.

## Orthologues

```python
from ens import ens, EnsemblError


def orthologues(species, gene_id, target, compara=None):
    p = {"type": "orthologues", "target_species": target, "sequence": "none", "format": "condensed"}
    if compara:
        p["compara"] = compara
    data = ens(f"homology/id/{species}/{gene_id}", p)["data"]
    return [(h["id"], h["type"], h["taxonomy_level"]) for d in data for h in d["homologies"]]


print("BRCA2 -> mouse    ", orthologues("human", "ENSG00000139618", "mus_musculus"))
print("BRCA2 -> zebrafish", orthologues("human", "ENSG00000139618", "danio_rerio"))
print("BRCA2 -> yeast    ", orthologues("human", "ENSG00000139618", "saccharomyces_cerevisiae"))
print("RAD51 -> yeast    ", orthologues("human", "ENSG00000051180", "saccharomyces_cerevisiae"))
try:
    orthologues("human", "ENSG00000051180", "arabidopsis_thaliana")
except EnsemblError as e:
    print("refused:", str(e).split(" — ")[1][:70])
print("RAD51 -> arabidopsis (pan)", orthologues("human", "ENSG00000051180", "arabidopsis_thaliana",
                                                compara="pan_homology"))
print("AT4G00020 -> rice (plants)", orthologues("arabidopsis_thaliana", "AT4G00020", "oryza_sativa",
                                                compara="plants"))

# Full records carry identity and the alignment; one2one is the only unambiguous type.
full = ens("homology/id/human/ENSG00000139618",
           {"type": "orthologues", "target_species": "mus_musculus", "sequence": "none"})
h = full["data"][0]["homologies"][0]
print(h["type"], h["source"]["protein_id"], "->", h["target"]["protein_id"],
      f"identity {h['source']['perc_id']:.1f}% / {h['target']['perc_id']:.1f}%")
```

- The default comparison set is vertebrates plus a few model outgroups (yeast is included, so
  human RAD51 → `YER095W` works). Plants are not in it. Use `compara=plants` within plants, or
  `compara=pan_homology` across divisions; otherwise the target species is "not found".
- An empty list is an answer: yeast has no BRCA2.
- Only `ortholog_one2one` is unambiguous. `one2many` and `many2many` mean duplications, and
  picking one partner is a choice you should state.

## GRCh37

`grch37.rest.ensembl.org` serves the GRCh37 assembly **with the annotation frozen at that
assembly**: different coordinates, older gene versions, and often a different canonical
transcript. Do not mix records from the two servers.

```python
from ens import ens

G37 = "https://grch37.rest.ensembl.org"
for server in ("https://rest.ensembl.org", G37):
    g = ens("lookup/symbol/homo_sapiens/BRCA2", server=server)
    print(f"{g['assembly_name']}: 13:{g['start']}-{g['end']} v{g['version']} "
          f"canonical {g['canonical_transcript']}")

# A gene retired after GRCh37 is still live on the GRCh37 server.
print(ens("lookup/id/ENSG00000200042", server=G37)["display_name"])

# Liftover of coordinates (not of IDs). A region can split into several pieces.
m = ens("map/human/GRCh37/13:32889617..32973809:1/GRCh38")["mappings"]
for x in m:
    o, n = x["original"], x["mapped"]
    print(f"{o['assembly']} {o['seq_region_name']}:{o['start']}-{o['end']} -> "
          f"{n['assembly']} {n['seq_region_name']}:{n['start']}-{n['end']}")
```

BRCA2's canonical on GRCh37 is `ENST00000544455`, not the GRCh38 MANE transcript
`ENST00000380152`. `map/` lifts coordinates between assemblies; it does not map IDs, and a
region that crosses an assembly change comes back as several pieces, so iterate over
`mappings`.

## Get the files

Three routes, by size. In every case, record the release and assembly next to the data.

**One gene, everything about it.** This writes the canonical transcript's cDNA, CDS and
protein, every protein isoform, the gene's own GFF3 features, and a manifest:

```python
import json
import pathlib
import re
from ens import ens


def wrap(seq, width=60):
    return "\n".join(seq[i:i + width] for i in range(0, len(seq), width))


def gene_bundle(species, gene_id, outdir):
    """Canonical transcript sequences, every protein isoform, and the gene's own GFF3."""
    out = pathlib.Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    release = ens("info/data")["releases"][0]
    g = ens(f"lookup/id/{gene_id}", {"expand": 1, "mane": 1, "species": species})
    canon = next(t for t in g["Transcript"] if t.get("is_canonical") == 1)
    files = {}

    for kind in ("cdna", "cds", "protein"):
        if kind != "cdna" and not canon.get("Translation"):
            continue                                   # non-coding canonical: no CDS or protein
        s = ens(f"sequence/id/{canon['id']}", {"type": kind})
        name = f"{g['display_name']}.canonical.{kind}.fa"
        ver = f".{s['version']}" if s.get("version") else ""
        (out / name).write_text(f">{s['id']}{ver} {g['id']} {g['display_name']} {kind} "
                                f"{g['assembly_name']} Ensembl {release}\n{wrap(s['seq'])}\n")
        files[kind] = name

    prots = ens(f"sequence/id/{g['id']}", {"type": "protein", "multiple_sequences": 1})
    (out / f"{g['display_name']}.proteins.fa").write_text(
        "".join(f">{p['id']}.{p['version']}\n{wrap(p['seq'])}\n" for p in prots))
    files["all_proteins"] = f"{g['display_name']}.proteins.fa"

    # overlap/id returns every feature in the gene's span, neighbours included: keep only ours.
    gff = ens(f"overlap/id/{g['id']}", {"feature": ["gene", "transcript", "exon", "cds"],
                                        "species": species}, accept="text/x-gff3")
    own_tx = {t["id"] for t in g["Transcript"]}
    keep = []
    for line in gff.splitlines():
        if line.startswith("#"):
            keep.append(line)
            continue
        attrs = line.split("\t")[8]
        ids = set(re.findall(r"(?:ID|Parent)=(?:gene|transcript):([^;,]+)", attrs))
        if g["id"] in ids or ids & own_tx:
            keep.append(line)
    (out / f"{g['display_name']}.gff3").write_text("\n".join(keep) + "\n")
    files["gff3"] = f"{g['display_name']}.gff3"

    manifest = {"source": "Ensembl REST", "release": release, "species": g["species"],
                "assembly": g["assembly_name"], "gene": f"{g['id']}.{g['version']}"
                if g.get("version") else g["id"], "symbol": g["display_name"],
                "canonical_transcript": canon["id"],
                "mane": {m["type"]: m["refseq_match"] for m in canon.get("MANE", [])},
                "location": f"{g['seq_region_name']}:{g['start']}-{g['end']}:{g['strand']}",
                "files": files, "n_transcripts": len(own_tx), "n_proteins": len(prots)}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


for sp, gid in [("homo_sapiens", "ENSG00000139618"), ("danio_rerio", "ENSDARG00000079015"),
                ("arabidopsis_thaliana", "AT4G00020")]:
    m = gene_bundle(sp, gid, f"ensembl_{gid}")
    gff = pathlib.Path(f"ensembl_{gid}") / m["files"]["gff3"]
    rows = [l.split("\t")[2] for l in gff.read_text().splitlines() if not l.startswith("#")]
    print(m["symbol"], m["assembly"], m["canonical_transcript"], m["mane"], m["n_transcripts"],
          "tx;", rows.count("mRNA") + rows.count("transcript"), "mRNA-ish rows,",
          rows.count("exon"), "exons,", rows.count("CDS"), "CDS rows")
```

The GFF3 comes from `overlap/id` with `Content-Type: text/x-gff3`, so it needs the neighbour
filter above. Without it the BRCA2 file would also hold `IFIT1P1` and `ZAR1L`. Check: 15
`mRNA` and 4 `lnc_RNA` rows equal BRCA2's 19 transcripts.

**Whole-genome annotation and sequence, from the release directory.** List the directory
rather than building a file name: yeast is mirrored on `ftp.ensembl.org/pub/release-116/`
as `Saccharomyces_cerevisiae.R64-1-1.63.gtf.gz`, numbered by its Ensembl Genomes release.
`HEAD` every file before fetching it (the human primary assembly is 882 MB), and verify
against the directory's `CHECKSUMS`, which uses the BSD `sum` algorithm (checksum, 1 KB
blocks), not MD5:

```python
import pathlib
import re
import urllib.request

UA = {"User-Agent": "ensembl-skill (python urllib)"}


def listing(url):
    """File names in an FTP-over-HTTPS directory. Never build a file name from the release
    number: Ensembl Genomes genomes mirrored on ftp.ensembl.org keep their own numbering."""
    html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode()
    return [h for h in re.findall(r'href="([^"?/][^"]*)"', html) if not h.startswith("/")]


def size(url):
    req = urllib.request.Request(url, method="HEAD", headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return int(r.headers["Content-Length"])


def bsd_sum(path):
    """The checksum in Ensembl's CHECKSUMS files: BSD `sum` (16-bit rotate-and-add, 1 KB blocks)."""
    c, n = 0, 0
    with open(path, "rb") as fh:
        while chunk := fh.read(1 << 20):
            n += len(chunk)
            for b in chunk:
                c = ((c >> 1) | ((c & 1) << 15)) + b & 0xFFFF
    return c, (n + 1023) // 1024


def download_checked(dir_url, name, dest, max_bytes=50_000_000):
    n = size(dir_url + name)
    if n > max_bytes:
        raise RuntimeError(f"{name} is {n / 1e6:.0f} MB — raise max_bytes deliberately, or use a ranged read")
    sums = {line.split()[2]: (int(line.split()[0]), int(line.split()[1]))
            for line in urllib.request.urlopen(urllib.request.Request(dir_url + "CHECKSUMS", headers=UA),
                                               timeout=60).read().decode().splitlines()}
    out = pathlib.Path(dest) / name
    out.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(dir_url + name, headers=UA), timeout=600) as r:
        out.write_bytes(r.read())
    got = bsd_sum(out)
    if got != sums[name]:
        out.unlink()
        raise RuntimeError(f"{name}: checksum {got} != CHECKSUMS {sums[name]}")
    return out, n, got


REL = "https://ftp.ensembl.org/pub/release-116"
print("human gtf/:", listing(f"{REL}/gtf/homo_sapiens/"))
print("yeast gtf/:", listing(f"{REL}/gtf/saccharomyces_cerevisiae/"))      # ".63.", not ".116."
for f in ("gtf/homo_sapiens/Homo_sapiens.GRCh38.116.gtf.gz",
          "fasta/homo_sapiens/pep/Homo_sapiens.GRCh38.pep.all.fa.gz",
          "fasta/homo_sapiens/dna/Homo_sapiens.GRCh38.dna.primary_assembly.fa.gz"):
    print(f"{size(f'{REL}/{f}') / 1e6:8.1f} MB  {f}")

d = f"{REL}/fasta/saccharomyces_cerevisiae/pep/"
name = next(n for n in listing(d) if n.endswith(".pep.all.fa.gz"))
path, n, s = download_checked(d, name, "ensembl_ftp")
print("downloaded", path, n, "bytes, sum", s, "matches CHECKSUMS")
try:
    download_checked(f"{REL}/fasta/homo_sapiens/dna/", "Homo_sapiens.GRCh38.dna.primary_assembly.fa.gz", "ensembl_ftp")
except RuntimeError as e:
    print("refused:", e)

EG = "https://ftp.ensemblgenomes.ebi.ac.uk/pub/plants/release-63"
print("arabidopsis gtf/:", listing(f"{EG}/gtf/arabidopsis_thaliana/"))
```

The pure-Python `bsd_sum` is fine for files of a few MB. For large files, macOS and Linux
`sum` (BSD mode, `sum -r` on GNU) prints the same two numbers. Directory layout per release:
`gtf/<species>/`, `gff3/<species>/`, `fasta/<species>/{dna,cdna,cds,pep,ncrna,dna_index}/`.
`*.gtf.gz` covers the primary assembly plus scaffolds; `*.chr.gtf.gz` covers chromosomes
only; `*.chr_patch_hapl_scaff.gtf.gz` adds patches and haplotypes.

GTF and GFF3 files are plain gzip, so the start of one can be read without downloading it.
This is a cheap way to confirm the build and see which tags a release carries:

```python
import collections
import re
import urllib.request
import zlib

url = "https://ftp.ensembl.org/pub/release-116/gtf/homo_sapiens/Homo_sapiens.GRCh38.116.gtf.gz"
req = urllib.request.Request(url, headers={"Range": "bytes=0-1999999",
                                           "User-Agent": "ensembl-skill (python urllib)"})
with urllib.request.urlopen(req, timeout=120) as r:
    assert r.status == 206, r.status
    head = zlib.decompressobj(31).decompress(r.read()).decode()
lines = head.split("\n")[:-1]                      # the last line is cut mid-record
print("\n".join(l for l in lines if l.startswith("#!")))
rows = [l.split("\t") for l in lines if not l.startswith("#")]
print(len(rows), "rows from the first 2 MB;", collections.Counter(r[2] for r in rows).most_common(4))
tx = [r[8] for r in rows if r[2] == "transcript"]
tags = collections.Counter(t for a in tx for t in re.findall(r'tag "([^"]+)"', a))
print({k: tags[k] for k in ("Ensembl_canonical", "MANE_Select", "MANE_Plus_Clinical", "gencode_primary")},
      "of", len(tx), "transcripts")
```

Transcript rows carry `tag "Ensembl_canonical"` and `tag "MANE_Select"`; filter on those to
get one transcript per gene from the bulk file. The file is not sorted by position, so do not
stop reading at the first chromosome change.

**A region of a genome, without downloading the genome.** `dna_index/` holds a bgzip-compressed
toplevel FASTA with its `.fai` and `.gzi` indexes. The indexes are small, and from them any
region is a single ranged read:

```python
import struct
import urllib.request
import zlib

UA = "ensembl-skill (python urllib)"


def http_range(url, start=None, end=None):
    headers = {"User-Agent": UA}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=180) as r:
        if start is not None and r.status != 206:
            raise RuntimeError(f"Range ignored ({r.status}) for {url}")
        return r.read()


def load_index(fa_gz):
    """.fai (where each sequence starts) and .gzi (bgzf block map) beside a bgzipped FASTA."""
    fai = {}
    for line in http_range(fa_gz + ".fai").decode().splitlines():
        name, length, offset, line_bases, line_bytes = line.split("\t")[:5]
        fai[name] = tuple(map(int, (length, offset, line_bases, line_bytes)))
    raw = http_range(fa_gz + ".gzi")
    (n,) = struct.unpack("<Q", raw[:8])
    flat = struct.unpack(f"<{2 * n}Q", raw[8:8 + 16 * n])
    return fai, [(0, 0)] + list(zip(flat[0::2], flat[1::2]))      # (compressed, uncompressed)


def region(fa_gz, fai, blocks, name, start, end):
    """Forward-strand bases start..end (1-based, inclusive) using only ranged reads."""
    length, offset, lb, lw = fai[name]
    if not 1 <= start <= end <= length:
        raise ValueError(f"{name}:{start}-{end} is outside 1..{length}")
    u0 = offset + (start - 1) // lb * lw + (start - 1) % lb
    u1 = offset + (end - 1) // lb * lw + (end - 1) % lb + 1
    i = max(k for k, (_, u) in enumerate(blocks) if u <= u0)
    j = next((k for k, (_, u) in enumerate(blocks) if u >= u1), None)
    c_end = blocks[j + 1][0] - 1 if j is not None and j + 1 < len(blocks) else ""
    data = http_range(fa_gz, blocks[i][0], c_end)
    if data[:4] != b"\x1f\x8b\x08\x04":
        raise RuntimeError(f"{fa_gz}.gzi does not match the FASTA (no bgzf block at byte "
                           f"{blocks[i][0]}) — stale index; use REST sequence/region instead")
    buf = bytearray()
    while data and len(buf) < u1 - blocks[i][1]:
        d = zlib.decompressobj(31)                     # each bgzf block is one gzip member
        buf += d.decompress(data)
        data = d.unused_data
    seq = bytes(buf[u0 - blocks[i][1]:u1 - blocks[i][1]]).replace(b"\n", b"").decode()
    if len(seq) != end - start + 1:
        raise RuntimeError(f"got {len(seq)} bases for {name}:{start}-{end} — stale index")
    return seq


human = ("https://ftp.ensembl.org/pub/release-116/fasta/homo_sapiens/dna_index/"
         "Homo_sapiens.GRCh38.dna.toplevel.fa.gz")
fai, blocks = load_index(human)
seq = region(human, fai, blocks, "13", 32315086, 32400268)            # all of BRCA2
with open("BRCA2_GRCh38_13_32315086_32400268.fa", "w") as fh:
    fh.write(">13:32315086-32400268 GRCh38 Ensembl 116\n")
    fh.writelines(seq[k:k + 60] + "\n" for k in range(0, len(seq), 60))
print(len(fai), "sequences indexed;", len(seq), "bases written;", seq[:15])

arab = ("https://ftp.ensemblgenomes.ebi.ac.uk/pub/plants/release-63/fasta/arabidopsis_thaliana/"
        "dna_index/Arabidopsis_thaliana.TAIR10.dna.toplevel.fa.gz")
afai, ablocks = load_index(arab)
try:
    region(arab, afai, ablocks, "4", 2895, 10504)
except RuntimeError as e:
    print("refused:", str(e)[-90:])
```

The BRCA2 region written this way matches REST `sequence/id/ENSG00000139618` base for base,
and the same code returned identical sequence for mouse (GRCm39) and zebrafish (GRCz11).
**Arabidopsis's index was stale on 2026-11-06**: the `.gzi` (26 March) predates the `.fa.gz`
(3 April), so its block offsets point into the middle of compressed data. The header check
catches that. Without it you would get a zlib error at best and the wrong bases at worst. When
it fires, use REST `sequence/region` (10 Mb per request).

## Try it

**Data.** Human BRCA2 (`ENSG00000139618`) on GRCh38 from the live Ensembl REST API, with
counter-examples from retired, synonym, GRCh37, Arabidopsis and yeast records. All open, no
account. Confirmed reachable 2026-11-06.

**Run.** Self-contained, standard library only:

```python
import json, time, urllib.error, urllib.parse, urllib.request

def call(path, params=None, data=None, server="https://rest.ensembl.org"):
    """Return (status, parsed JSON). Retries 429 and 5xx; returns 4xx for the caller to assert on."""
    url = f"{server}/{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    body = None if data is None else json.dumps(data).encode()
    for attempt in range(6):
        req = urllib.request.Request(url, data=body, headers={
            "Content-Type": "application/json", "User-Agent": "ensembl-skill try-it"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(float(e.headers.get("Retry-After") or 2 ** attempt))
                continue
            return e.code, json.loads(e.read() or b"{}")
    raise RuntimeError(f"no answer: {url}")

release = call("info/data")[1]["releases"][0]

# --- the gene, its canonical transcript, and MANE ---
_, g = call("lookup/symbol/homo_sapiens/BRCA2", {"expand": 1, "mane": 1})
canon = [t for t in g["Transcript"] if t.get("is_canonical") == 1]
assert len(canon) == 1
t = canon[0]
assert g["canonical_transcript"].split(".")[0] == t["id"]       # the gene field carries ".version"
mane = {m["type"]: m["refseq_match"] for m in t["MANE"]}

# --- sequences agree with each other ---
seq = {k: call(f"sequence/id/{t['id']}", {"type": k})[1]["seq"] for k in ("genomic", "cdna", "cds", "protein")}
assert len(seq["genomic"]) == t["end"] - t["start"] + 1
assert len(seq["cds"]) == 3 * len(seq["protein"]) + 3           # CDS includes the stop codon
assert seq["cds"][:3] == "ATG" and seq["cds"][-3:] in ("TAA", "TAG", "TGA")
assert "*" not in seq["protein"]

# --- traps, each one asserted ---
assert call("lookup/id/ENSG00000139618.19")[0] == 400           # versioned IDs are rejected
assert call("lookup/symbol/homo_sapiens/FANCD1")[0] == 400      # synonyms are not symbols
mdr1 = {h["id"] for h in call("xrefs/symbol/homo_sapiens/MDR1")[1]
        if h["type"] == "gene" and not h["id"].startswith("LRG_")}
assert len(mdr1) >= 2                                           # a synonym can name several genes
assert call("lookup/id/ENSG00000300550")[0] == 400              # retired ...
arch = call("archive/id/ENSG00000300550")[1]                    # ... but the archive knows it
assert arch["is_current"] == "" and arch["possible_replacement"]
near = {x["id"] for x in call("overlap/id/ENSG00000139618", {"feature": "gene"})[1]}
assert "ENSG00000139618" in near and len(near) > 1              # overlap/id returns neighbours
_, g37 = call("lookup/symbol/homo_sapiens/BRCA2", server="https://grch37.rest.ensembl.org")
assert g37["assembly_name"] == "GRCh37" and g37["start"] != g["start"]
vep = call("vep/human/id", data={"ids": ["rs80357906", "rs999999999999"]})[1]
assert [v["id"] for v in vep] == ["rs80357906"]                 # unknown IDs silently dropped
assert call("lookup/id/AT4G00020.2")[1]["object_type"] == "Transcript"   # ".2" is not a version
assert call("lookup/id/YER095W")[1]["canonical_transcript"].endswith(".")

print("release        :", release)
print("gene           :", f"{g['id']}.{g['version']}", g["assembly_name"], f"{g['seq_region_name']}:{g['start']}-{g['end']}")
print("canonical      :", f"{t['id']}.{t['version']}", "of", len(g["Transcript"]), "transcripts", "| MANE", mane)
print("lengths        :", {k: len(v) for k, v in seq.items()})
print("GRCh37         :", f"{g37['seq_region_name']}:{g37['start']}-{g37['end']}", "canonical", g37["canonical_transcript"])
print("MDR1 ->        :", sorted(mdr1))
print("ENSG00000300550:", "last seen release", arch["release"], "->", [r["stable_id"] for r in arch["possible_replacement"]])
print("overlap/id     :", sorted(near))
```

**Expect.**

Invariants. A failure here means the skill is wrong:

- Exactly one transcript has `is_canonical: 1`, and the gene's `canonical_transcript` minus its
  `.version` names it.
- `len(genomic) == end - start + 1`; `len(cds) == 3 * len(protein) + 3`; the CDS starts with
  `ATG` and ends in a standard stop (true for a nuclear gene like BRCA2, not for
  mitochondrial ones); no `*` in the protein.
- A versioned ID and a synonym are both 400 on `lookup/`; `MDR1` names at least two genes.
- A retired ID is 400 on `lookup/` and present in `archive/id` with a replacement.
- `overlap/id` returns more genes than the one asked about.
- GRCh37 coordinates differ from GRCh38.
- VEP POST drops an unknown rsID without an error.
- `AT4G00020.2` is a transcript; yeast's `canonical_transcript` ends in a bare dot.

Observed 2026-11-06 on release 116. These move between releases, so a mismatch is drift to
investigate, not a failure:

```text
release        : 116
gene           : ENSG00000139618.19 GRCh38 13:32315086-32400268
canonical      : ENST00000380152.8 of 19 transcripts | MANE {'MANE_Select': 'NM_000059.4'}
lengths        : {'genomic': 84761, 'cdna': 11954, 'cds': 10257, 'protein': 3418}
GRCh37         : 13:32889611-32973805 canonical ENST00000544455.1
MDR1 ->        : ['ENSG00000085563', 'ENSG00000109436']
ENSG00000300550: last seen release 114 -> ['ENSG00000287596']
overlap/id     : ['ENSG00000139618', 'ENSG00000189167', 'ENSG00000215515']
```

## Sources

- Ensembl REST API: https://rest.ensembl.org/
- Release files: https://ftp.ensembl.org/pub/ and https://ftp.ensemblgenomes.ebi.ac.uk/pub/
- Terms of use: https://www.ensembl.org/info/about/legal/disclaimer.html (the live page was
  erroring on 2026-11-06; the text quoted above is from the May 2025 archive of the same page)
- Dyer et al. (2025) Ensembl 2025. *Nucleic Acids Research* 53, D948. https://doi.org/10.1093/nar/gkae1071
- Harrison et al. (2024) Ensembl 2024. *Nucleic Acids Research* 52, D891. https://doi.org/10.1093/nar/gkad1049
- Yates et al. (2015) The Ensembl REST API. *Bioinformatics* 31, 143. https://doi.org/10.1093/bioinformatics/btu613
- McLaren et al. (2016) The Ensembl Variant Effect Predictor. *Genome Biology* 17, 122. https://doi.org/10.1186/s13059-016-0974-4
- Morales et al. (2022) A joint NCBI and EMBL-EBI transcript set for clinical genomics and research (MANE). *Nature* 604, 310. https://doi.org/10.1038/s41586-022-04558-8
- Yates et al. (2022) Ensembl Genomes 2022. *Nucleic Acids Research* 50, D996. https://doi.org/10.1093/nar/gkab1007
