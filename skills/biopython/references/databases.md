# Database Access with Bio.Entrez

## Overview

Bio.Entrez provides programmatic access to NCBI's Entrez databases, including PubMed, GenBank, Gene, Protein, Nucleotide, and many others. It handles all the complexity of API calls, rate limiting, and data parsing.

## Setup and Configuration

### Email Address (Required)

NCBI requires an email address to track usage and contact users if issues arise:

```python
from Bio import Entrez

# Always set your email
Entrez.email = "your.email@example.com"

# For reusable software, set a stable tool name and register
# the tool/email pair with NCBI.
Entrez.tool = "your_tool_name"
```

### API Key (Recommended)

Using an API key increases E-utilities rate limits from 3 to 10 requests per second. Register at https://www.ncbi.nlm.nih.gov/account/settings/ and read only `NCBI_API_KEY` from the environment — do not hardcode it and do not load unrelated environment variables:

```python
import os

# Check NCBI_API_KEY from the environment (or export it before running)
if api_key := os.environ.get("NCBI_API_KEY"):
    Entrez.api_key = api_key
```

### Rate Limiting

Biopython automatically respects NCBI rate limits:
- **Without API key**: 3 requests per second
- **With API key**: 10 requests per second

The module handles ordinary request pacing automatically and retries transient HTTP 5XX failures. For large jobs, use Entrez history (`usehistory="y"` / `WebEnv` / `query_key`) and batch requests rather than making one request per record. NCBI also recommends scheduling large jobs for weekends or between 9:00 PM and 5:00 AM Eastern time.

## Core Entrez Functions

### EInfo - Database Information

Get information about available databases and their statistics.

`Entrez.read()` wraps `DbInfo` in a **list holding one record**, so index it before
reading fields. Treating it as a mapping — `result["DbInfo"]["Description"]` — raises
`TypeError: list indices must be integers or slices, not str`:

```python
# List all databases
handle = Entrez.einfo()
result = Entrez.read(handle)
print(result["DbList"])

# Get information about a specific database
handle = Entrez.einfo(db="pubmed")
result = Entrez.read(handle)
info = result["DbInfo"][0]          # a list of one, not a mapping
print(info["Description"])
print(info["Count"])                # Number of records
print(info["LastUpdate"])
```

### ESearch - Search Databases

Search for records and retrieve their IDs:

```python
# Search PubMed
handle = Entrez.esearch(db="pubmed", term="biopython")
result = Entrez.read(handle)
handle.close()

id_list = result["IdList"]
count = result["Count"]
print(f"Found {count} results")
print(f"Retrieved IDs: {id_list}")
```

### Advanced ESearch Parameters

```python
# Search with additional parameters
handle = Entrez.esearch(
    db="pubmed",
    term="biopython[Title]",
    retmax=100,           # Return up to 100 IDs
    sort="relevance",     # Sort by relevance
    reldate=365,          # Only results from last year
    datetype="pdat"       # Use publication date
)
result = Entrez.read(handle)
handle.close()
```

### ESummary - Get Record Summaries

Retrieve summary information for a list of IDs:

```python
# Get summaries for multiple records
handle = Entrez.esummary(db="pubmed", id="19304878,18606172")
results = Entrez.read(handle)
handle.close()

for record in results:
    print(f"Title: {record['Title']}")
    print(f"Authors: {record['AuthorList']}")
    print(f"Journal: {record['Source']}")
    print()
```

### EFetch - Retrieve Full Records

Fetch complete records in various formats:

```python
# Fetch a GenBank record
handle = Entrez.efetch(db="nucleotide", id="EU490707", rettype="gb", retmode="text")
record_text = handle.read()
handle.close()

# Parse with SeqIO
from Bio import SeqIO
handle = Entrez.efetch(db="nucleotide", id="EU490707", rettype="gb", retmode="text")
record = SeqIO.read(handle, "genbank")
handle.close()
print(record.description)
```

### EFetch Return Types

Different databases support different return types:

**Nucleotide/Protein:**
- `rettype="fasta"` - FASTA format
- `rettype="gb"` or `"genbank"` - GenBank format
- `rettype="gp"` - GenPept format (proteins)

**PubMed:**
- `rettype="medline"` - MEDLINE format
- `rettype="abstract"` - Abstract text

**Common modes:**
- `retmode="text"` - Plain text
- `retmode="xml"` - XML format

### ELink - Find Related Records

Find links between records in different databases:

```python
# Find protein records linked to a nucleotide record
handle = Entrez.elink(dbfrom="nucleotide", db="protein", id="EU490707")
result = Entrez.read(handle)
handle.close()

# Extract linked IDs
for linkset in result[0]["LinkSetDb"]:
    if linkset["LinkName"] == "nucleotide_protein":
        protein_ids = [link["Id"] for link in linkset["Link"]]
        print(f"Linked protein IDs: {protein_ids}")
```

### EPost - Upload ID Lists

Upload large lists of IDs to the server for later use:

```python
# Post IDs to server
id_list = ["19304878", "18606172", "16403221"]
handle = Entrez.epost(db="pubmed", id=",".join(id_list))
result = Entrez.read(handle)
handle.close()

# Get query_key and WebEnv for later use
query_key = result["QueryKey"]
webenv = result["WebEnv"]

# Use in subsequent queries
handle = Entrez.efetch(
    db="pubmed",
    query_key=query_key,
    WebEnv=webenv,
    rettype="medline",
    retmode="text"
)
```

### Counting hits across several databases

**There is no `Entrez.egquery` in Biopython 1.88** — the attribute does not exist, so the
call fails with `AttributeError` before any request is made. The wrapper is gone; the
functions Biopython still exposes are `einfo`, `esearch`, `epost`, `esummary`, `efetch`,
`elink`, `espell` and `ecitmatch`.

Count per database with `esearch` instead, asking for no records and reading `Count`:

```python
for db in ("pubmed", "nucleotide", "protein", "gene"):
    handle = Entrez.esearch(db=db, term="biopython", retmax=0)
    print(f"{db}: {Entrez.read(handle)['Count']} results")
    handle.close()
```

`Entrez.einfo()` lists the database names this accepts.

### ESpell - Spelling Suggestions

Get spelling suggestions for search terms:

```python
handle = Entrez.espell(db="pubmed", term="biopythn")
result = Entrez.read(handle)
handle.close()

print(f"Original: {result['Query']}")
print(f"Suggestion: {result['CorrectedQuery']}")
```

## Working with Different Databases

### PubMed

```python
# Search for articles
handle = Entrez.esearch(db="pubmed", term="cancer genomics", retmax=10)
result = Entrez.read(handle)
handle.close()

# Fetch abstracts
handle = Entrez.efetch(
    db="pubmed",
    id=result["IdList"],
    rettype="medline",
    retmode="text"
)
records = handle.read()
handle.close()
print(records)
```

### GenBank / Nucleotide

```python
# Search for sequences
handle = Entrez.esearch(db="nucleotide", term="Cypripedioideae[Orgn] AND matK[Gene]")
result = Entrez.read(handle)
handle.close()

# Fetch sequences
if result["IdList"]:
    handle = Entrez.efetch(
        db="nucleotide",
        id=result["IdList"][:5],
        rettype="fasta",
        retmode="text"
    )
    sequences = handle.read()
    handle.close()
```

### Protein

```python
# Search for protein sequences
handle = Entrez.esearch(db="protein", term="human insulin")
result = Entrez.read(handle)
handle.close()

# Fetch protein records
from Bio import SeqIO
handle = Entrez.efetch(
    db="protein",
    id=result["IdList"][:5],
    rettype="gp",
    retmode="text"
)
records = SeqIO.parse(handle, "genbank")
for record in records:
    print(f"{record.id}: {record.description}")
handle.close()
```

### Gene

```python
# Search for gene records
handle = Entrez.esearch(db="gene", term="BRCA1[Gene] AND human[Organism]")
result = Entrez.read(handle)
handle.close()

# Get gene information
handle = Entrez.efetch(db="gene", id=result["IdList"][0], retmode="xml")
record = Entrez.read(handle)
handle.close()
```

### Taxonomy

```python
# Search for organism
handle = Entrez.esearch(db="taxonomy", term="Homo sapiens")
result = Entrez.read(handle)
handle.close()

# Fetch taxonomic information
handle = Entrez.efetch(db="taxonomy", id=result["IdList"][0], retmode="xml")
records = Entrez.read(handle)
handle.close()

for record in records:
    print(f"TaxID: {record['TaxId']}")
    print(f"Scientific Name: {record['ScientificName']}")
    print(f"Lineage: {record['Lineage']}")
```

## Parsing Entrez Results

### Reading XML Results

```python
# Most results can be parsed with Entrez.read()
handle = Entrez.efetch(db="pubmed", id="19304878", retmode="xml")
records = Entrez.read(handle)
handle.close()

# Access parsed data
article = records['PubmedArticle'][0]['MedlineCitation']['Article']
print(article['ArticleTitle'])
```

### Handling Large Result Sets

**Paging an ESearch with `retstart` stops at 9998.** The hit count keeps rising past that
and the parameter keeps accepting values, but the server refuses the request:
`RuntimeError: Search Backend failed: Exception: 'retstart' cannot be larger than 9998.
For PubMed, ESearch can only retrieve the first 9,999 records matching the query.` A loop
over a broad query therefore dies partway through rather than at the start, which is the
worst place to find out.

**The history server is not a way around it.** Storing the search with `usehistory="y"`
and paging it with `efetch` hits the same wall, and reports it less helpfully — a bare
`HTTPError: HTTP Error 400: Bad Request` at the same offset, with nothing to say why.

So a result set larger than the window has to be **partitioned** until each piece fits.
Dates are the usual axis. Halve the range, ask for each half's count, and keep halving
until every slice is inside the window:

```python
from datetime import date, timedelta

WINDOW = 9999  # PubMed serves no record past this offset, by either route


def hit_count(term):
    handle = Entrez.esearch(db="pubmed", term=term, retmax=0)
    result = Entrez.read(handle)
    handle.close()
    return int(result["Count"])


def fitting_slices(term, start, end):
    """Halve the date range until each slice fits. Flags any day that cannot."""
    span = f"{term} AND {start:%Y/%m/%d}:{end:%Y/%m/%d}[PDAT]"
    total = hit_count(span)
    if total <= WINDOW:
        yield span, total, True
    elif start == end:
        yield span, total, False      # one day, still too big: date cannot split it
    else:
        mid = start + (end - start) // 2
        yield from fitting_slices(term, start, mid)
        yield from fitting_slices(term, mid + timedelta(days=1), end)


def page_slice(span, batch_size=500):
    """Page one slice that is known to fit."""
    ids = []
    for start in range(0, min(hit_count(span), WINDOW), batch_size):
        handle = Entrez.esearch(db="pubmed", term=span, retstart=start, retmax=batch_size)
        result = Entrez.read(handle)
        handle.close()
        ids.extend(result["IdList"])
    return ids


search_term = "cancer[Title]"
print(f"whole query: {hit_count(search_term)} hits, of which {WINDOW} are reachable")

reachable, unreachable = 0, []
for span, total, fits in fitting_slices(search_term, date(2024, 1, 1), date(2024, 1, 7)):
    window = span.split("AND ")[1]
    if fits:
        reachable += total
        print(f"  {total:>5} hits  {window}")
    else:
        unreachable.append((window, total))
        print(f"  {total:>5} hits  {window}  NOT RETRIEVABLE — needs a second facet")

print(f"reachable in this range: {reachable}")
for window, total in unreachable:
    print(f"still capped: {window} holds {total}, so {total - WINDOW} are out of reach")

ids = page_slice(f"{search_term} AND 2024/01/02:2024/01/02[PDAT]")
print(f"paged {len(ids)} ids from one fitting slice, first {ids[0]}")
```

**A single day can exceed the window, and then dates have run out.** PubMed assigns
1 January to records whose issue carries only a year, so that date accumulates a pile
orders of magnitude larger than its neighbours — the block above prints both, and the gap
is not subtle. The partitioner reports such a slice instead of paging it, because the
alternative is returning the first 9,999 and calling that the answer. Splitting it needs a
second facet — a journal, a subject heading, an article type — not a narrower date.

## Advanced Patterns

### Search History with WebEnv

History keeps a result set on the server so later calls refer to it instead of resending
the query. It does **not** widen the retrieval window: the loop below is correct only while
`count` stays under 9999, which holds for this example's query and not for a broad one. Past
that, partition the search as *Handling Large Result Sets* above does.

```python
# Perform search and store on server
handle = Entrez.esearch(
    db="pubmed",
    term="biopython",
    usehistory="y"
)
result = Entrez.read(handle)
handle.close()

webenv = result["WebEnv"]
query_key = result["QueryKey"]
count = int(result["Count"])

# Fetch results in batches using history
batch_size = 100
for start in range(0, count, batch_size):
    handle = Entrez.efetch(
        db="pubmed",
        retstart=start,
        retmax=batch_size,
        rettype="medline",
        retmode="text",
        webenv=webenv,
        query_key=query_key
    )
    data = handle.read()
    handle.close()
    # Process data
```

### Combining Searches

```python
# Use boolean operators
complex_search = "(cancer[Title]) AND (genomics[Title]) AND 2020:2025[PDAT]"
handle = Entrez.esearch(db="pubmed", term=complex_search, retmax=100)
result = Entrez.read(handle)
handle.close()
```

## Best Practices

1. **Always set Entrez.email** - Required by NCBI
2. **Set Entrez.tool** for reusable software and register the tool/email pair with NCBI
3. **Use `NCBI_API_KEY` from the environment** for higher rate limits (10 req/s vs 3 req/s); never hardcode keys
4. **Close handles** after reading to free resources
5. **Batch large requests** - Use retstart and retmax for pagination, remembering that
   PubMed serves nothing past a retstart of 9998 by any route; past that, partition the
   query by date instead
6. **Use WebEnv for large downloads** - Store results on server
7. **Cache locally** - Download once and save to avoid repeated requests
8. **Handle errors gracefully** - Network issues and API limits can occur
9. **Respect NCBI guidelines** - Don't overwhelm the service
10. **Use appropriate rettype** - Choose format that matches your needs
11. **Parse XML carefully** - Structure varies by database and record type

## Error Handling

```python
from urllib.error import HTTPError
from Bio import Entrez

Entrez.email = "your.email@example.com"

try:
    handle = Entrez.efetch(db="nucleotide", id="invalid_id", rettype="gb")
    record = handle.read()
    handle.close()
except HTTPError as e:
    print(f"HTTP Error: {e.code} - {e.reason}")
except Exception as e:
    print(f"Error: {e}")
```

## Common Use Cases

### Download GenBank Records

```python
from Bio import Entrez, SeqIO

Entrez.email = "your.email@example.com"

# List of accession numbers
accessions = ["EU490707", "EU490708", "EU490709"]

for acc in accessions:
    handle = Entrez.efetch(db="nucleotide", id=acc, rettype="gb", retmode="text")
    record = SeqIO.read(handle, "genbank")
    handle.close()

    # Save to file
    SeqIO.write(record, f"{acc}.gb", "genbank")
```

### Search and Download Papers

```python
# Search PubMed
handle = Entrez.esearch(db="pubmed", term="machine learning bioinformatics", retmax=20)
result = Entrez.read(handle)
handle.close()

# Get details
handle = Entrez.efetch(db="pubmed", id=result["IdList"], retmode="xml")
papers = Entrez.read(handle)
handle.close()

# Extract information
for paper in papers['PubmedArticle']:
    article = paper['MedlineCitation']['Article']
    print(f"Title: {article['ArticleTitle']}")
    print(f"Journal: {article['Journal']['Title']}")
    print()
```

### Find Related Sequences

```python
# Start with one sequence
handle = Entrez.efetch(db="nucleotide", id="EU490707", rettype="gb", retmode="text")
record = SeqIO.read(handle, "genbank")
handle.close()

# Find similar sequences
handle = Entrez.elink(dbfrom="nucleotide", db="nucleotide", id="EU490707")
result = Entrez.read(handle)
handle.close()

# Get related IDs
related_ids = []
for linkset in result[0]["LinkSetDb"]:
    for link in linkset["Link"]:
        related_ids.append(link["Id"])
```
