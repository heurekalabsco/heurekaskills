---
name: gget
description: Quick gene lookups with gget from Python or the shell — symbol to Ensembl ID, annotation, FASTA sequences, reference links, BLAT, BLAST and DIAMOND, orthologs, PDB — and the silent failures that return NaN, None or empty links.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, bioinformatics, blast, sequences, ensembl]
covers: [gget, ensembl, gene symbol, ensembl id, gene annotation, transcript, isoform, protein sequence, cdna, fasta, gtf, reference genome, blat, blast, diamond, sequence alignment, orthologs, bgee, open targets, pdb, uniprot, enrichr, human, mouse, zebrafish, yeast]
papers: [PMID:36610989]
access: [open]
datasets: ['https://rest.ensembl.org/lookup/id/ENSG00000142168?content-type=application/json', https://ftp.ensembl.org/pub/release-116/fasta/saccharomyces_cerevisiae/pep/Saccharomyces_cerevisiae.R64-1-1.pep.all.fa.gz]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: gget 0.30.8 / Python 3.12.13 / pandas 3.1.1 / numpy 2.5.4 / Ensembl release 116 / bundled DIAMOND 2.1.8 / genes tried SOD1 in human, mouse, zebrafish and yeast plus TP53 and SOD2 / Try it run alone in a fresh directory with a fresh venv
  executed: 13
  unverified: 1
  unverified_reason: The BLAST block was submitted twice and never finished because the NCBI queue estimated over six hours for one swissprot blastp on 2026-11-06. Re-run when the NCBI BLAST queue is back to minutes.
---
# gget

gget is a Python package and command-line tool from the Pachter lab that wraps about twenty
public genomics services behind one-line calls. Ensembl is the backbone: search, gene and
transcript annotation, sequences and reference-genome links all come from it. Other modules
reach UCSC BLAT, NCBI BLAST, a bundled DIAMOND binary, Open Targets, Bgee, RCSB PDB and
Enrichr.

Use it for the **quick lookup**: "what is the Ensembl ID for this gene in zebrafish", "give
me the protein sequence as FASTA", "where does this 150 bp fragment map", "which GTF matches
release 116". For deeper work on a single resource there are dedicated skills: `open-targets`
for target-disease evidence, `pathway-enrichment` for enrichment with a proper background,
`alphafold` for predicted structures, `cellxgene-census` for single-cell expression, and
`biopython` for parsing and manipulating the sequences gget hands back.

The main hazard is that **several gget modules fail quietly.** An unknown ID returns `None`.
A blocked web page becomes `NaN` in a column. A missing file becomes an empty link string.
Each section below shows the quiet failure and the check that catches it.

## Install and access

```bash
pip install gget
```

gget is BSD-2-Clause, and version 0.30.8 needs Python 3.12 or newer. The modules in this
skill need **no account and no key**. Each one calls a public web service, so it needs
network access to that host: `rest.ensembl.org`, `ftp.ensembl.org`, `genome.ucsc.edu`,
`blast.ncbi.nlm.nih.gov`, `api.platform.opentargets.org`, `www.bgee.org`, `data.rcsb.org`,
`maayanlab.cloud`.

Modules this skill deliberately leaves out, and why:

| module | what it needs |
|---|---|
| `cosmic` | A COSMIC account and a download of its database. COSMIC is free for academic use, and commercial use needs a paid license |
| `alphafold` | Runs a local structure prediction with heavy extra dependencies. To *retrieve* a predicted structure, use `alphafold` instead |
| `muscle` | Ships a precompiled binary. On the macOS validating host it failed to start because the OpenMP runtime (`libgomp`) was missing, and gget's error message suggests installing it with Homebrew |
| `elm` | A one-time `gget.setup("elm")` download before the first call |
| `cellxgene` | `pip install "gget[cellxgene]"`. For real work use `cellxgene-census` |

Python calls return a pandas DataFrame by default, and `json=True` returns a list of dicts.
The command line returns JSON by default, and `-csv` returns CSV. Code written against one
form will not read the other.

## Ensembl answers 500 sometimes — retry it

`info` and `seq` go through the Ensembl REST API, and that API intermittently answers `500`
or `503`. During testing for this skill, the same four-ID request returned `500`, then `200`,
then `200` within a minute. gget turns that into
`RuntimeError: http://rest.ensembl.org/ returned error status code 500. Please double-check arguments`,
which reads like a mistake in your input. It usually is not one. Retry server errors with a
pause, and let anything else raise:

```python
import time
import gget

def retry(fn, *args, tries=4, wait=10, **kwargs):
    """Call a gget function, retrying only Ensembl 5xx errors."""
    for attempt in range(tries):
        try:
            return fn(*args, **kwargs)
        except RuntimeError as err:
            if "status code 5" not in str(err) or attempt == tries - 1:
                raise
            time.sleep(wait * (attempt + 1))

df = retry(gget.info, ["ENSG00000142168"], ncbi=False, verbose=False)
print(df[["ensembl_id", "primary_gene_name", "uniprot_id"]])
```

The later blocks define `retry` again so that each one runs on its own.

## Gene name to Ensembl ID — `search`

`search` is a free-text match against gene names, synonyms and descriptions in an Ensembl
core database. It is **not** an exact symbol lookup, so the gene you asked for may not be
the first row:

```python
import gget

for species, symbol in [("homo_sapiens", "SOD1"), ("mus_musculus", "Sod1"),
                        ("danio_rerio", "sod1"), ("saccharomyces_cerevisiae", "SOD1")]:
    hits = gget.search([symbol], species=species, verbose=False)
    exact = hits[hits["gene_name"].str.upper() == symbol.upper()]
    print(f"{species:26} {len(hits)} rows, first row {hits.iloc[0]['gene_name']:7}"
          f" -> exact match {exact['ensembl_id'].tolist()}")
```

Observed on 2026-11-06 with Ensembl 116: 7 rows for human, 1 for mouse, 1 for zebrafish, and
7 for yeast. **The first yeast row is SOD2**, because "SOD1" also appears in SOD2's
description. Filtering on `gene_name` is necessary but not enough. For human it still leaves
two rows, `ENSG00000142168` and `LRG_652`, a Locus Reference Genomic record that carries the
same name. Keep the `ENSG` row, and check `biotype` when you expect a protein-coding gene.
The other human rows are three SOD1 pseudogenes and a divergent transcript.

Other behavior to know about:

- `species` takes `genus_species` (or the shortcuts `human` and `mouse`). Non-vertebrates come
  from Ensembl Genomes, and a name matching several databases logs a warning and uses the
  first one. The log line names the database it used. Yeast resolves to
  `saccharomyces_cerevisiae_core_63_116_4`.
- Several words are combined with `andor="or"` by default. Use `andor="and"` to require all of
  them.
- `release=` pins an Ensembl release. Without it, search uses the latest release, so a rerun
  next year can return different rows. Pin the release in anything you will publish.
- `id_type="transcript"` returns transcript IDs instead of gene IDs.

## Gene and transcript annotation — `info`

`info` takes **Ensembl IDs only** (gene, transcript or protein, any species). It returns one
row per ID with UniProt and NCBI cross-references, location, description and every transcript:

```python
import time
import gget

def retry(fn, *args, tries=4, wait=10, **kwargs):
    for attempt in range(tries):
        try:
            return fn(*args, **kwargs)
        except RuntimeError as err:
            if "status code 5" not in str(err) or attempt == tries - 1:
                raise
            time.sleep(wait * (attempt + 1))

ids = ["ENSG00000142168", "ENSMUSG00000022982", "ENSDARG00000043848", "YJR104C"]
df = retry(gget.info, ids, ncbi=False, verbose=False)
print(df[["ensembl_id", "primary_gene_name", "uniprot_id", "species",
          "assembly_name", "seq_region_name", "start", "end", "strand"]].to_string())

print(retry(gget.info, ["SOD1"], verbose=False))             # a symbol, not an ID
print(retry(gget.info, ["ENSG00000000000"], verbose=False))  # an ID that does not exist
```

What to check:

- **A symbol or an unknown ID returns `None`**, not an error, and only after up to a minute of
  waiting. Test for `None` before indexing the result. The symbol call above returns `None`.
- **The index is the ID you passed, but the `ensembl_id` column is versioned.** For example,
  `ENSG00000142168` becomes `ENSG00000142168.17`. Join on the index, or strip the `.N`.
  Passing a versioned ID works. gget always answers for the current version.
- **`ncbi_gene_id` comes back `NaN` for every gene, with no error.** gget gets it by
  scraping the NCBI Gene web page, and on 2026-11-06 NCBI was serving a browser check
  (reCAPTCHA) instead of that page. Pass `ncbi=False`, which also makes the call faster, and
  get the NCBI Gene ID from E-utilities instead:

```python
import json
import urllib.request

def ncbi_gene_id(ensembl_id):
    url = ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
           f"?db=gene&retmode=json&term={ensembl_id}")
    ids = json.load(urllib.request.urlopen(url, timeout=30))["esearchresult"]["idlist"]
    if len(ids) != 1:
        raise LookupError(f"{ensembl_id}: NCBI Gene returned {ids}")
    return ids[0]

for gene in ["ENSG00000142168", "ENSG00000141510", "ENSMUSG00000022982"]:
    print(gene, ncbi_gene_id(gene))
```

Expected output: `6647` (SOD1), `7157` (TP53) and `20655` (mouse Sod1). NCBI allows three
requests a second without an API key.

## Sequences — `seq`

`seq` returns a **flat list that alternates header and sequence**, not a dict and not
records. By default it returns the gene's genomic DNA. `translate=True` returns the protein
of the canonical transcript, with the UniProt accession in the header:

```python
import time
import gget

def retry(fn, *args, tries=4, wait=10, **kwargs):
    for attempt in range(tries):
        try:
            return fn(*args, **kwargs)
        except RuntimeError as err:
            if "status code 5" not in str(err) or attempt == tries - 1:
                raise
            time.sleep(wait * (attempt + 1))

genes = ["ENSG00000142168", "ENSMUSG00000022982", "ENSDARG00000043848"]
lines = retry(gget.seq, genes, translate=True, verbose=False)
with open("sod1_orthologs.faa", "w") as fh:
    fh.write("\n".join(lines) + "\n")

for header, sequence in zip(lines[::2], lines[1::2]):
    print(header.split()[0], header.split("uniprot_id: ")[1].split()[0], len(sequence))
```

Expected output: human `P00441`, mouse `P08228` and zebrafish `O73872`, all 154 residues.

- `isoforms=True` returns every transcript instead. For human SOD1 that was 23 protein
  records on 2026-11-06, most of them unreviewed UniProt entries. It took about half a minute
  and logged a warning for each one. Take the canonical transcript unless you really need the isoforms.
- `translate=False` with a gene ID returns the **whole genomic span, introns included**
  (9,315 bp for SOD1). For a transcript sequence, pass a transcript ID (`ENST…`).
- An ID that does not exist raises the same `RuntimeError` as a server error, with status
  `500`. So if a retry loop still fails, check the ID before blaming the server.

## Reference files — `ref`

`ref` does not download anything by default. It returns the Ensembl FTP links, with release,
date and size, for a species' genome (`dna`), annotation (`gtf`), transcriptome (`cdna`),
coding sequences (`cds`), non-coding RNA (`cdrna`) and proteins (`pep`).

**Pin `release=`.** Without it you get the latest release, and a GTF from one release with a
genome from another is a classic way to break an alignment pipeline:

```python
import gget

for species in ["homo_sapiens", "danio_rerio", "saccharomyces_cerevisiae"]:
    links = gget.ref(species, which=["gtf", "pep"], release=116, verbose=False)[species]
    for kind, entry in links.items():
        status = entry["ftp"] or "EMPTY LINK"
        print(f"{species:26} {kind:24} {entry['bytes'] or '-':>6}  {status}")
```

**An empty `ftp` string is not "no such file".** For yeast, `annotation_gtf` comes back as
`""`, yet the GTF exists on the Ensembl FTP as `Saccharomyces_cerevisiae.R64-1-1.63.gtf.gz`.
It carries the Ensembl Genomes release number (63), not the Ensembl one (116), and gget looks
for the wrong name. Test every link for emptiness. For non-vertebrates, list the FTP directory
to find the file.

`gget.ref(None, list_species=True)` lists the 359 vertebrate species in the current release.

## Where does this sequence map — `blat`, `blast`, `diamond`

**BLAT** (UCSC) is the fast one. Use it to place a nucleotide or protein sequence on a genome
assembly. It returns in under a second:

```python
import gget

fragment = ("ATGGCGACGAAGGCCGTGTGCGTGCTGAAGGGCGACGGCCCAGTGCAGGGCATCATCAATTTCGAGCAGAAGG"
            "AAAGTAATGGACCAGTGAAGGTGTGGGGAAGCATTAAAGGACTGACTGAAGGCCTGCATGGATTCCATGTTCATGAG")
for assembly in ["human", "mouse"]:
    hits = gget.blat(fragment, assembly=assembly, verbose=False)
    print(hits[["genome", "chromosome", "strand", "start", "end",
                "%_aligned", "%_matched"]].to_string(), "\n")
```

The human SOD1 coding fragment lands at 100% aligned on chr21 in hg38. Against mouse (mm39)
none of the three hits covers more than 41% of it, and the top-listed one is not even the
longest, because BLAT is built for near-identical matches. **No
hit is not evidence of absence**: BLAT is the wrong tool across species. `assembly` accepts
`human`, `mouse`, `zebrafinch` or a UCSC build name such as `hg19`.

**BLAST** submits to NCBI and **polls once a minute with no time limit**, so the call blocks
until NCBI answers. On a normal day that is minutes. On 2026-11-06 NCBI's own estimate for a
single 154-residue `blastp` against `swissprot` was over six hours, and a gget call left
running for 23 minutes was still waiting. Run it in the background, or use DIAMOND against a
downloaded proteome when you need an answer now. It returns `None` on failure or no hits,
after logging an error, so check for `None` before using the result:

```python
import gget

sod1 = ("MATKAVCVLKGDGPVQGIINFEQKESNGPVKVWGSIKGLTEGLHGFHVHEFGDNTAGCTSAGPHFNPLSRKHGGPK"
        "DEERHVGDLGNVTADKDGVADVSIEDSVISLSGDHCIIGRTLVVHEKADDLGKGGNEESTKTGNAGSRLACGVIGIAQ")
hits = gget.blast(sod1, database="swissprot", limit=5, verbose=False)
if hits is None:
    raise RuntimeError("BLAST returned nothing; check the log line above")
print(hits.to_string())
```

`program` and `database` are inferred from the sequence (protein → `blastp` against `nr`)
unless you set them. Use `swissprot` when you want reviewed hits. For more than a handful of
queries, a local BLAST or DIAMOND run is the polite choice.

**DIAMOND** runs locally on a bundled binary (Linux, macOS, Windows), so it needs no network
access. Use it for protein-against-protein search against a set *you* supply:

```python
import gget

human = ("MATKAVCVLKGDGPVQGIINFEQKESNGPVKVWGSIKGLTEGLHGFHVHEFGDNTAGCTSAGPHFNPLSRKHGGPK"
         "DEERHVGDLGNVTADKDGVADVSIEDSVISLSGDHCIIGRTLVVHEKADDLGKGGNEESTKTGNAGSRLACGVIGIAQ")
mouse = ("MAMKAVCVLKGDGPVQGTIHFEQKASGEPVVLSGQITGLTEGQHGFHVHQYGDNTQGCTSAGPHFNPHSKKHGGPA"
         "DEERHVGDLGNVTAGKDGVANVSIEDRVISLSGEHSIIGRTMVVHEKQDDLGKGGNEESTKTGNAGSRLACGVIGIAQ")
res = gget.diamond(human, reference=mouse, verbose=False)
print(res[["query_accession", "subject_accession", "identity_percentage",
           "length", "e-value"]].to_string())
```

Human and mouse SOD1 come out at 83.8% identity over all 154 residues. **Raw sequence strings
are renamed `Seq0`, `Seq1`, and so on, in both columns.** Pass FASTA file paths as `query` and
`reference` if you need your own IDs in the output.

## Other one-liners

```python
import gget

print(gget.opentargets("ENSG00000142168", resource="diseases", limit=3, verbose=False)
      [["disease.name", "score"]].to_string())
print(gget.opentargets("ENSG00000146648", resource="drugs", limit=3, verbose=False)
      [["drug.name", "drug.maximumClinicalStage"]].to_string())

orth = gget.bgee("ENSG00000142168", type="orthologs", verbose=False)
print(len(orth), "orthologs in Bgee;", orth["species"].nunique(), "species")

entry = gget.pdb("2C9V", resource="entry")      # RCSB metadata as a dict
print(entry["struct"]["title"], entry["rcsb_entry_info"]["resolution_combined"])
```

- `opentargets` resources: `diseases`, `drugs`, `tractability`, `pharmacogenetics`,
  `expression`, `depmap`, `interactions`. It returns the top rows, with no evidence behind
  them. For the evidence records and release pinning, use `open-targets`.
- `bgee` with `type="expression"` returns anatomical entities with an expression score. Those
  rows are **not sorted by score**, so sort before reading off the top tissues.
- `pdb` with the default `resource="pdb"` returns the coordinate file as one string. Write it
  to disk unchanged.

## Enrichment — `enrichr`

```python
import gget

df = gget.enrichr(["SOD1", "SOD2", "CAT", "GPX1", "PRDX1", "TXN"],
                  database="pathway", verbose=False)
print(df[["path_name", "adj_p_val", "overlapping_genes"]].head().to_string())
```

`database` accepts shortcuts (`pathway`, `ontology`, `transcription`, `diseases_drugs`,
`celltypes`, `kinase_interactions`) or any Enrichr library name. **Without `background_list`
the test runs against Enrichr's whole gene universe.** That is the wrong background for most
experiments, which measured only the genes expressed in the sample. For a background-aware
analysis, use `pathway-enrichment`.

## Get the files

gget's results are small tables and sequences. Write them with the release and date that
produced them, because Ensembl rebuilds every few months and the same call will change:

```python
import datetime
import json
import os
import time
import urllib.request
import gget

def retry(fn, *args, tries=4, wait=10, **kwargs):
    for attempt in range(tries):
        try:
            return fn(*args, **kwargs)
        except RuntimeError as err:
            if "status code 5" not in str(err) or attempt == tries - 1:
                raise
            time.sleep(wait * (attempt + 1))

OUT, RELEASE, SPECIES = "gget_out", 116, "saccharomyces_cerevisiae"
os.makedirs(OUT, exist_ok=True)

hits = gget.search(["SOD1", "SOD2", "CCS1"], species=SPECIES, release=RELEASE, verbose=False)
genes = hits[hits["gene_name"].isin(["SOD1", "SOD2", "CCS1"])]
genes.to_csv(f"{OUT}/genes.csv", index=False)

info = retry(gget.info, genes["ensembl_id"].tolist(), ncbi=False, verbose=False)
info.drop(columns=["all_exons", "exon_starts", "exon_ends"]).to_csv(f"{OUT}/info.csv")

fasta = retry(gget.seq, genes["ensembl_id"].tolist(), translate=True, verbose=False)
with open(f"{OUT}/proteins.faa", "w") as fh:
    fh.write("\n".join(fasta) + "\n")

link = gget.ref(SPECIES, which=["pep"], release=RELEASE, verbose=False)[SPECIES]
pep = link["protein_translation_pep"]["ftp"]
assert pep, "empty link from gget.ref; list the Ensembl FTP directory instead"
urllib.request.urlretrieve(pep.replace("http://", "https://"), f"{OUT}/{os.path.basename(pep)}")

with open(f"{OUT}/manifest.json", "w") as fh:
    json.dump({"gget": gget.__version__, "ensembl_release": RELEASE, "species": SPECIES,
               "retrieved": datetime.date.today().isoformat(),
               "genes": genes["ensembl_id"].tolist(), "proteome_url": pep}, fh, indent=2)
print(sorted(os.listdir(OUT)))
```

Expected output: `genes.csv`, `info.csv`, `manifest.json`, `proteins.faa` (3 records) and the
2.6 MB yeast proteome `Saccharomyces_cerevisiae.R64-1-1.pep.all.fa.gz`. The exon columns are
dropped because they hold nested lists that do not survive a CSV round trip. Keep the
DataFrame, or write with `json=True`, if you need them.

On the command line, `gget ref -w gtf -r 116 -d -od refs danio_rerio` downloads the files it
lists, and `-csv` or `-o file.json` writes any module's result.

## Try it

A self-contained check that the Ensembl path, the quiet failures and DIAMOND still behave as
described above. Public data, no account, no key.

**Data**: human SOD1 (`ENSG00000142168`) and its mouse and zebrafish orthologs, read live
from Ensembl release 116 through the Ensembl REST API, plus the yeast reference listing on the
Ensembl FTP. Ensembl data has no restrictions on use. Both were last confirmed reachable on
2026-11-06.

```bash
python3 -m venv gget-try && . gget-try/bin/activate && pip install -q gget
python - <<'EOF'
import time
import gget

def retry(fn, *args, tries=4, wait=10, **kwargs):
    for attempt in range(tries):
        try:
            return fn(*args, **kwargs)
        except RuntimeError as err:
            if "status code 5" not in str(err) or attempt == tries - 1:
                raise
            time.sleep(wait * (attempt + 1))

# 1. search is free text: filter on gene_name, never take row 0
yeast = gget.search(["SOD1"], species="saccharomyces_cerevisiae", release=116, verbose=False)
exact = yeast[yeast["gene_name"] == "SOD1"]
print("yeast row 0      :", yeast.iloc[0]["gene_name"], "| exact:", exact["ensembl_id"].tolist())
assert len(exact) == 1 and exact.iloc[0]["ensembl_id"] == "YJR104C"

# 2. info: versioned column, symbol -> None, NCBI scrape -> NaN
ids = ["ENSG00000142168", "ENSMUSG00000022982", "ENSDARG00000043848"]
info = retry(gget.info, ids, verbose=False)
print(info[["ensembl_id", "uniprot_id", "ncbi_gene_id"]].to_string())
assert list(info.index) == ids
assert all(v.split(".")[0] == i for i, v in zip(ids, info["ensembl_id"]))
assert retry(gget.info, ["SOD1"], verbose=False) is None
print("ncbi_gene_id NaN :", int(info["ncbi_gene_id"].isna().sum()), "of", len(info))

# 3. seq: flat header/sequence list, canonical protein per gene
lines = retry(gget.seq, ids, translate=True, verbose=False)
assert len(lines) == 2 * len(ids) and all(h.startswith(">") for h in lines[::2])
lengths = [len(s) for s in lines[1::2]]
print("protein lengths  :", lengths)
assert lengths == [154, 154, 154]

# 4. ref: an empty link is not a missing file
y = gget.ref("saccharomyces_cerevisiae", which=["gtf", "pep"], release=116, verbose=False)
y = y["saccharomyces_cerevisiae"]
print("yeast gtf link   :", repr(y["annotation_gtf"]["ftp"]))
assert y["protein_translation_pep"]["ftp"].endswith("pep.all.fa.gz")

# 5. diamond: local, renames raw strings to Seq0
d = gget.diamond(lines[1], reference=lines[3], verbose=False)
print("diamond          :", d.iloc[0]["query_accession"], d.iloc[0]["subject_accession"],
      d.iloc[0]["identity_percentage"], "% identity")
assert d.iloc[0]["query_accession"] == "Seq0" and d.iloc[0]["length"] == 154
assert 80 < d.iloc[0]["identity_percentage"] < 90
EOF
```

**Expect**

Invariants hold regardless of gget or Ensembl release, and a failure means the skill is wrong:

- `search` returns a free-text match. For yeast `SOD1` the exact row is `YJR104C` and it is
  not the first row.
- `info` keeps the IDs you passed as its index, and the `ensembl_id` column is the same ID
  plus a version suffix.
- `info` on a gene symbol returns `None`, not an error.
- `seq` returns `2 × n` strings that alternate header and sequence, and human, mouse and
  zebrafish SOD1 are each 154 residues.
- `diamond` labels raw string inputs `Seq0` and aligns the full 154 residues.

Observed values on 2026-11-06 with gget 0.30.8 and Ensembl 116. These move with releases, so
treat a mismatch as drift to investigate, not a failure:

```
yeast row 0      : SOD2 | exact: ['YJR104C']
                               ensembl_id uniprot_id ncbi_gene_id
ENSG00000142168        ENSG00000142168.17     P00441          NaN
ENSMUSG00000022982  ENSMUSG00000022982.12     P08228          NaN
ENSDARG00000043848   ENSDARG00000043848.5     O73872          NaN
ncbi_gene_id NaN : 3 of 3
protein lengths  : [154, 154, 154]
yeast gtf link   : ''
diamond          : Seq0 Seq0 83.8 % identity
```

The NaN count and the empty yeast GTF link are known gget limitations, not invariants. When
gget fixes them, these lines will change: 0 of 3, and a real URL.

## Sources

- gget documentation: https://pachterlab.github.io/gget/
- gget source and license (BSD-2-Clause): https://github.com/pachterlab/gget
- Luebbert L, Pachter L (2023). Efficient querying of genomic reference databases with gget.
  *Bioinformatics* 39(1), btac836. https://doi.org/10.1093/bioinformatics/btac836
- Ensembl REST API: https://rest.ensembl.org/
- NCBI E-utilities: https://www.ncbi.nlm.nih.gov/books/NBK25501/

Cite gget and the underlying databases that answered: Ensembl, UCSC, NCBI, Open Targets,
Bgee, RCSB PDB or Enrichr, whichever you used.
