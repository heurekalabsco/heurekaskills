---
name: brenda
description: Retrieve BRENDA enzyme kinetic constants — Km, kcat, kcat/Km, Ki — by EC number, keyed on NCBI taxid and ligand structure id rather than free-text names, with the pH, temperature and mutant/wild-type notes that make a value usable.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, enzyme-kinetics, metabolic-modeling]
covers: [brenda, enzyme kinetics, km, michaelis constant, kcat, turnover number, catalytic efficiency, kcat/km, ki, inhibition constant, ec number, enzyme commission, substrate, inhibitor, kinetic parameters, kinetic model, enzyme-constrained model, metabolic modeling, mutant enzyme, wild-type, inchikey, ncbi taxonomy, uniprot, sparql, soap, dsmz, human, yeast, e. coli]
papers: [PMID:41206471, PMID:33211880]
access: [open, registered]
datasets: ['https://www.brenda-enzymes.org/result_download.php?a=12&W[1]=1.1.1.27&T[1]=1&nolimit=1', https://www.brenda-enzymes.org/soap/brenda_zeep.wsdl, https://www.brenda-enzymes.org/schemas/2.0.0/enzyme.schema.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-12
  against: BRENDA release 2026.1 (March 2026) / SOAP WSDL brenda_zeep.wsdl with 171 operations / DSMZ SPARQL endpoint for BRENDA (QLever) / JSON schema 2.0.0 / Python 3.12.8 / zeep 4.3.3 / lxml 6.1.3 / every block run in page order in one fresh directory and Try it run again alone in a fresh mktemp directory
  executed: 12
  unverified: 2
  unverified_reason: Two blocks need what the validating session did not have. The credentialed SOAP call needs a BRENDA account (free registration with an email address); a bad-credential call was run and its fault is documented. Reading the bulk JSON file needs the archive, which a person downloads after ticking the licence box on the download page; the session did not accept the licence on anyone's behalf. Re-run both with a registered account and a downloaded release 2026.1 archive.
---
# BRENDA — enzyme kinetic constants

BRENDA (the BRaunschweig ENzyme DAtabase, curated at the Leibniz Institute DSMZ) is the
largest curated collection of enzyme functional data. This skill is about one slice of it:
the four kinetic constants per EC number — **Km**, **turnover number (kcat)**,
**kcat/Km** and **Ki** — each tied to a substrate or inhibitor, an organism, a free-text
commentary holding the conditions, and a literature reference.

A BRENDA constant on its own is close to meaningless. Km for one enzyme spans five orders of
magnitude across organisms, isozymes, mutants, pH and temperature; lactate dehydrogenase has
333 Km rows, and only 9 are human. The skill therefore always carries the context forward —
taxid, UniProt accession, variant, pH, temperature — and keys every join on an identifier,
because BRENDA's substrate and organism *names* are free text and the same molecule appears
under several of them.

## Licence and what you need

BRENDA's licence page (<https://www.brenda-enzymes.org/license.php>, checked 2026-11-12) says:

> The usage of the BRENDA data is licensed under Creative Commons Attribution License CC BY 4.0.
> If you use BRENDA for your scientifc work, please cite our latest publication.

The same page adds that data "may be subject to benefit-sharing obligations from the use of
Digital Sequence Information (DSI)" under the UN Convention on Biological Diversity,
"including monetary contributions to the Cali Fund from commercial users". That obligation
sits with the user and the use, not with retrieval; commercial readers should read the linked
CBD guide.

Four surfaces, and what each needs:

| Surface | What it gives | You need |
|---|---|---|
| Enzyme page `enzyme.php?ecno=…` | All four constants for one EC, with NCBI taxid, UniProt, ligand structure id, commentary | Nothing |
| SPARQL endpoint `sparql.dsmz.de/api/brenda` | Identifiers — compounds with InChIKey, organisms with taxid, EC classes, references. **No kinetic values** | Nothing |
| SOAP web service | Every field, queryable by EC and organism | A free BRENDA account (email + password) from the site's `register.php` |
| Bulk download (text or JSON, ~75 MB) | The whole release | A person ticking "I accept the license agreement" on the download page |

The enzyme page is the default route below: no account, one request per EC number, and it is
the only surface that attaches a taxid to every row. The site's `robots.txt` sets
`Crawl-delay: 2`; the SOAP page asks for at most one request per second. For more than a few
dozen EC numbers, use the bulk download rather than looping over pages.

## Kinetic constants for one EC number, no account

Standard library only. The fetcher refuses to hand back an empty page, because the site does:
`1.1.1` (three levels) answers **200 with an empty page**, a transferred EC such as `1.1.1.68`
answers **200** with a "transferred to EC 1.7.99.5" note and no data, and only a well-formed
EC that never existed (`1.1.1.999`) answers 404.

```python
import collections, html, re, time, urllib.error, urllib.request

BRENDA = "https://www.brenda-enzymes.org"
UA = {"User-Agent": "brenda-kinetics (one EC per request)"}
EC_RE = re.compile(r"^[1-7]\.\d+\.\d+\.n?\d+$")
# page anchor -> (parameter, unit, ligand column header)
SECTIONS = {
    "KM VALUE [mM]": ("km", "mM", "SUBSTRATE"),
    "TURNOVER NUMBER [1/s]": ("kcat", "1/s", "SUBSTRATE"),
    "kcat/KM VALUE [1/(mM*s)]": ("kcat_km", "1/(mM*s)", "SUBSTRATE"),
    "Ki VALUE [mM]": ("ki", "mM", "INHIBITOR"),
}
COLUMNS = ["ORGANISM", "UNIPROT", "COMMENTARY", "LITERATURE", "IMAGE"]


def _text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def fetch_enzyme_page(ec):
    """One GET per EC number. Raises instead of handing back an empty page."""
    if not EC_RE.match(ec):
        # the site answers 200 with an empty page for '1.1.1' -- check before asking
        raise ValueError(f"{ec!r} is not a full four-level EC number")
    url = f"{BRENDA}/enzyme.php?ecno={ec}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as fh:
            page = fh.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise LookupError(f"EC {ec}: not in BRENDA (404)") from None
        raise
    moved = re.search(r'class="ec_comment card">\s*(transferred to|deleted)(.*?)</div>', page, re.S)
    if moved:
        raise LookupError(f"EC {ec}: {moved.group(1)} {_text(moved.group(2))}".strip())
    release = re.search(r"Release (\d{4}\.\d)\s+\(([^)]+)\)", page)
    return page, (release.group(1) if release else None), url


def parse_kinetics(page, ec):
    """Every Km, kcat, kcat/Km and Ki row on the page, with the ids the page carries."""
    anchors = re.findall(r'<a name="([^"]+)"></a>', page)
    drift = [a for a in anchors if re.search(r"KM VALUE|TURNOVER|Ki VALUE", a, re.I) and a not in SECTIONS]
    if drift:
        raise RuntimeError(f"section anchors changed: {drift} -- the unit labels may have moved")
    rows = []
    for anchor, (param, unit, ligand_head) in SECTIONS.items():
        start = page.find(f'<a name="{anchor}"></a>')
        if start < 0:
            continue  # this EC has no rows for this constant
        end = page.find('<a name="', start + 10)
        block = page[start:end if end > 0 else len(page)]
        tab = re.search(r'<div id="(tab\d+)" class="equal"', block).group(1)
        heads = [_text(h).split(" [")[0] for h in re.findall(r'<div class="header">(.*?)</div>', block)]
        if heads[1:] != [ligand_head] + COLUMNS:
            raise RuntimeError(f"{anchor}: column layout changed: {heads}")
        cells = {}
        for rid, col, raw in re.findall(
                rf'<div id="{tab}(r\d+sr\d+)c(\d+)" class="cell[^"]*">(.*?)</div>', block, re.S):
            cells.setdefault(rid, {})[int(col)] = raw
        # completeness: grouped rows ("N entries") plus singletons must equal the rows parsed
        claimed = sum(int(n) for n in re.findall(r'alt="show "> (\d+) entries', block))
        group_ids = set(re.findall(rf'id="{tab}(r\d+)" class="row', block))
        singles = {r.split("sr")[0] for r in cells} - group_ids
        if len(cells) != claimed + len(singles):
            raise RuntimeError(f"{anchor}: parsed {len(cells)} rows, page claims {claimed + len(singles)}")
        for rid, c in cells.items():
            raw_value = _text(c.get(0, ""))
            value = maximum = None
            m = re.fullmatch(r"(-?[\d.eE+-]+)(?:\s*-\s*([\d.eE+-]+))?", raw_value)
            if m:
                value = float(m.group(1))
                maximum = float(m.group(2)) if m.group(2) else None
            org = re.search(r"Org\('(\d+)'\)", c.get(2, ""))
            acc = re.search(r"Sequence2\('([^']+)'\)", c.get(3, ""))
            mol = re.search(r"MolPicture\('(\d+)'\)", c.get(6, ""))
            commentary = _text(c.get(4, ""))
            rows.append({
                "ec": ec, "parameter": param, "unit": unit,
                "value": value, "value_max": maximum, "value_text": raw_value,
                "ligand": _text(c.get(1, "")),
                "ligand_structure_id": int(mol.group(1)) if mol else None,
                "organism": _text(c.get(2, "")),
                "taxid": int(org.group(1)) if org else None,
                "uniprot": acc.group(1) if acc else None,
                "commentary": "" if commentary == "-" else commentary,
                "brenda_refs": ";".join(re.findall(r"[?&]r=(\d+)", c.get(5, ""))),
            })
    return rows


page, release, url = fetch_enzyme_page("1.1.1.27")
rows = parse_kinetics(page, "1.1.1.27")
print("release", release, "|", len(rows), "rows")
print(collections.Counter(r["parameter"] for r in rows))
print("no number (additional information):", sum(r["value"] is None for r in rows))
print("no taxid:", sum(r["taxid"] is None for r in rows))
human_km = [r for r in rows if r["parameter"] == "km" and r["taxid"] == 9606 and r["value"] is not None]
for r in sorted(human_km, key=lambda r: (r["ligand"], r["value"])):
    print(f'{r["value"]:>8} {r["unit"]:<4} {r["ligand"]:<12} {r["uniprot"] or "-":<7} {r["commentary"][:60]}')
```

What the page holds, and how the parser reads it:

- **The organism link is an NCBI taxid.** `Org('9606')` is *Homo sapiens*, `Org('5833')`
  *Plasmodium falciparum*. Filter on `taxid`, never on the organism string. A few rows carry
  no taxid — strain-level or obscure names such as *Molinema dessetae* (15 of 548 rows for
  EC 1.1.1.27, 33 of 498 for 2.7.1.40). Keep them and flag them; dropping them is a choice
  the reader should make knowingly.
- **"additional information" is BRENDA's no-number row** — a value of `-999` with the
  substrate `more` in the database, rendered as the words *additional information* on this
  page. It carries a qualitative finding in the commentary ("sigmoidal kinetics with respect
  to pyruvate"). `value` is `None` for these; never let one reach a mean.
- **A value can be a range.** `0.1 - 0.5` parses to `value` 0.1 and `value_max` 0.5. Rare on
  single rows (1 of 548 for LDH), but present.
- **Grouped rows are all there.** The page collapses repeats behind "show 50 entries"; the
  hidden rows are in the HTML. The parser checks that the rows it read equal the counts the
  page claims, so a layout change fails loudly instead of returning a subset.
- **The release is on every page.** Stamp it on whatever you write — BRENDA releases twice
  a year and values are added and corrected between them.

## Make a constant interpretable — conditions and variant

The commentary is free text, written by curators from the paper. Pull out what a reader
needs to decide whether two numbers are comparable. Continues from the block above.

```python
SUBSTITUTION = re.compile(r"\b[ACDEFGHIKLMNPQRSTVWY]\d{1,4}[ACDEFGHIKLMNPQRSTVWY*]\b")


def annotate(row):
    """Pull the conditions a constant depends on out of its free-text commentary.

    variant is 'unstated' when the commentary says neither -- which is most rows.
    Unstated is not wild-type; keep the two apart.
    """
    t = row["commentary"]
    ph = re.search(r"\bpH\s*(\d+(?:\.\d+)?)", t)
    temp = re.search(r"(-?\d+(?:\.\d+)?)\s*°C", t)
    mutant = bool(re.search(r"mutant", t, re.I) or SUBSTITUTION.search(t))
    wild = bool(re.search(r"wild[- ]?type", t, re.I))
    variant = {(True, False): "mutant", (False, True): "wild-type",
               (True, True): "both named", (False, False): "unstated"}[(mutant, wild)]
    return {**row,
            "ph": float(ph.group(1)) if ph else None,
            "temp_c": float(temp.group(1)) if temp else None,
            "ph_unreported": "pH not specified in the publication" in t,
            "temp_unreported": "temperature not specified in the publication" in t,
            "variant": variant,
            "substitutions": ";".join(SUBSTITUTION.findall(t))}


rows = [annotate(r) for r in rows]
print(collections.Counter(r["variant"] for r in rows))
print("pH parsed:", sum(r["ph"] is not None for r in rows), "of", len(rows),
      "| temperature parsed:", sum(r["temp_c"] is not None for r in rows))
for r in rows:
    if r["variant"] == "mutant" and r["substitutions"] and r["parameter"] == "km":
        print(r["value"], r["unit"], r["ligand"], r["substitutions"], r["ph"], r["temp_c"])
        break
```

Measured across eleven EC numbers (1.1.1.27, 1.1.1.1, 2.7.1.1, 2.7.1.40, 3.1.1.7, 1.1.1.49,
4.1.2.13, 7.1.1.2, 2.7.11.1, 3.4.21.5, 1.2.1.12; 6,580 rows), **61–87% of rows name neither
mutant nor wild type.** That is the single most important thing to know about the variant field:

- **`unstated` is not wild-type.** Most unstated rows probably are, but a model fitted on
  "wild-type" Km values must say it assumed so.
- **`both named`** is usually a qualitative "additional information" row comparing the two —
  read it, do not bin it.
- **The substitution pattern is a heuristic.** It catches `D241N` and `F16Q/C81S`, misses
  insertions (`G211InsG` is still classed `mutant` through the word) and run-together typos
  (`D38SC81S`). Keep the commentary column beside the parsed fields.
- About half of rows state a pH and slightly fewer a temperature. BRENDA writes
  "pH not specified in the publication" when the paper did not say — a recorded absence,
  which `ph_unreported` keeps distinct from "the curator wrote nothing".

## Units — BRENDA's are not the literature's

Each constant has one fixed unit in BRENDA, written in the section anchor the parser checks:
Km and Ki in **mM**, kcat in **1/s**, kcat/Km in **1/(mM·s)**. Papers and kinetic models
mostly use µM and **M⁻¹·s⁻¹**, so a BRENDA kcat/Km copied into a model unconverted is off by
a factor of 1000.

```python
TO_SI = {  # BRENDA unit -> (common literature unit, multiplier)
    "mM": ("uM", 1e3),
    "1/s": ("1/s", 1.0),
    "1/(mM*s)": ("1/(M*s)", 1e3),
}


def in_literature_units(row):
    unit, factor = TO_SI[row["unit"]]
    scale = (lambda v: None if v is None else v * factor)
    return {**row, "value_lit": scale(row["value"]), "value_max_lit": scale(row["value_max"]),
            "unit_lit": unit}


rows = [in_literature_units(r) for r in rows]
eff = [r for r in rows if r["parameter"] == "kcat_km" and r["value"] is not None]
r = max(eff, key=lambda r: r["value"])
print(f'{r["ligand"]}: {r["value"]} {r["unit"]} = {r["value_lit"]:.3g} {r["unit_lit"]}')
assert all(r["unit_lit"] for r in rows)
```

## Substrates are free text — key on the structure id

BRENDA records the substrate as the paper named it. The same molecule appears under several
names on one enzyme page, and a join on the name splits its measurements into groups that
look like different substrates. Each row also carries a **ligand structure id** (the page's
structure-image link), and the open SPARQL graph maps that id to a BRENDA compound and its
InChIKey. Key on those.

```python
import json, urllib.parse

SPARQL = "https://sparql.dsmz.de/api/brenda"


def sparql(query):
    data = urllib.parse.urlencode({"query": query}).encode()
    req = urllib.request.Request(SPARQL, data=data,
                                 headers={"Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=120) as fh:
        out = json.load(fh)
    if out.get("status") == "ERROR" or "results" not in out:
        raise RuntimeError(out.get("exception", out))
    return [{k: v["value"] for k, v in b.items()} for b in out["results"]["bindings"]]


def ligand_compounds(structure_ids):
    """BRENDA structure id (the page's ligand image id) -> compound id, name, InChIKey."""
    out = {}
    ids = sorted(set(structure_ids))
    for i in range(0, len(ids), 200):
        values = " ".join(f"<https://purl.dsmz.de/brenda/structure/{n}>" for n in ids[i:i + 200])
        for b in sparql(f"""
            PREFIX s: <https://purl.dsmz.de/schema/>
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            SELECT DISTINCT ?st ?c ?name ?k WHERE {{
              VALUES ?st {{ {values} }}
              ?c s:hasStructure ?st ; rdfs:label ?name .
              OPTIONAL {{ ?c s:hasStructure ?any . ?any s:hasInChIKey ?k }}
            }}"""):
            sid = int(b["st"].rsplit("/", 1)[1])
            rec = {"compound_id": int(b["c"].rsplit("/", 1)[1]), "compound": b["name"],
                   "inchikey": b["k"].replace("InChIKey=", "") if "k" in b else None}
            if sid in out and out[sid] != rec:
                raise RuntimeError(f"structure {sid} maps to two records: {out[sid]} / {rec}")
            out[sid] = rec
    return out


ids = {r["ligand_structure_id"] for r in rows if r["ligand_structure_id"]}
cmap = ligand_compounds(ids)
for r in rows:
    r.update(cmap.get(r["ligand_structure_id"], {"compound_id": None, "compound": None, "inchikey": None}))

names_per_compound = {}
for r in rows:
    if r["compound_id"] is not None:
        names_per_compound.setdefault(r["compound_id"], set()).add(r["ligand"])
print(len(ids), "structure ids ->", len({v["compound_id"] for v in cmap.values()}), "compounds")
print("rows with no structure id:", sum(r["ligand_structure_id"] is None for r in rows))
for c, names in sorted(names_per_compound.items()):
    if len(names) > 1:
        k = next(v for v in cmap.values() if v["compound_id"] == c)
        print(f"compound {c} {k['compound']!r} {k['inchikey']}: page names {sorted(names)}")
```

On lactate dehydrogenase this prints three compounds that a name join would split:
`(S)-lactate` / `L-lactate`, `2-oxobutanoate` / `2-oxobutyrate`, and
`3-acetylpyridine adenine dinucleotide` / `APAD+`. The first one matters: grouping LDH Km
values by substrate name puts L-lactate measurements in a different bin from (S)-lactate
ones. Across the eleven EC numbers above, between 0 and 45 compounds per enzyme carried more
than one name (45 for alcohol dehydrogenase, 1.1.1.1), including three spellings of
fructose 1,6-bisphosphate on aldolase and `glycerone phosphate` / `dihydroxyacetone
phosphate`.

Things to know about the id join:

- **The structure ids belong to two different structures, same compound.** `2-oxobutanoate`
  is structure 390, `2-oxobutyrate` structure 371; both hang off compound 311. Joining on
  the structure id alone would still split them — join on `compound_id` within BRENDA, and
  on **InChIKey** to reach another source. In release 2026.1 every BRENDA compound carries
  at most one InChIKey (174,769 of 219,715 have one), so the key is unambiguous where present.
- **The join inherits BRENDA's curation.** `DL-glyceraldehyde` and `glyceraldehyde` resolve
  to one compound on 1.2.1.12. That is BRENDA's decision about stereochemistry, not yours;
  where it matters, read the InChIKey's stereo block.
- **Rows with no structure id** are mostly the "additional information" rows (41 of 548 on
  LDH) and macromolecular substrates — proteins and peptides have no InChIKey.
- To go from an InChIKey to a PubChem CID or ChEBI-adjacent records, see `pubchem`; for
  inhibitor potency against drug targets measured outside enzymology papers, see `chembl`
  and `bindingdb`.

The same id discipline applies to the organism (`taxid`, above) and to the protein
(`uniprot`, where present — see `uniprot` to go from accession to sequence). BRENDA's
"organism" is a species or strain name with no further structure, and the SOAP service
returns only that string.

## Get the files

One TSV per EC number plus a manifest that records the release, the licence, the units and
a checksum. Continues from the blocks above.

```python
import csv, datetime, hashlib, pathlib

FIELDS = ["ec", "parameter", "value", "value_max", "unit", "value_lit", "value_max_lit", "unit_lit",
          "value_text", "ligand", "ligand_structure_id", "compound_id", "compound", "inchikey",
          "organism", "taxid", "uniprot", "variant", "substitutions", "ph", "temp_c",
          "ph_unreported", "temp_unreported", "commentary", "brenda_refs"]


def write_kinetics(rows, ec, release, url, outdir="brenda"):
    out = pathlib.Path(outdir)
    out.mkdir(exist_ok=True)
    table = out / f"brenda_{release}_EC{ec}_kinetics.tsv"
    with table.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, FIELDS, delimiter="\t", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    manifest = {
        "source": "BRENDA", "release": release, "ec": ec, "url": url,
        "retrieved": datetime.date.today().isoformat(),
        "licence": "CC BY 4.0 (https://www.brenda-enzymes.org/license.php)",
        "cite": "doi:10.1093/nar/gkaf1113",
        "units": {"km": "mM", "ki": "mM", "kcat": "1/s", "kcat_km": "1/(mM*s)"},
        "rows": len(rows),
        "rows_without_number": sum(r["value"] is None for r in rows),
        "rows_without_taxid": sum(r["taxid"] is None for r in rows),
        "file": table.name,
        "sha256": hashlib.sha256(table.read_bytes()).hexdigest(),
    }
    (out / f"brenda_{release}_EC{ec}_manifest.json").write_text(json.dumps(manifest, indent=2))
    return table, manifest


table, manifest = write_kinetics(rows, "1.1.1.27", release, url)
print(table, manifest["rows"], "rows,", manifest["rows_without_number"], "without a number")
```

For a handful of EC numbers, loop over `fetch_enzyme_page` with `time.sleep(2)` between
calls. Pages run 2–9 MB (alcohol dehydrogenase 6.8 MB, 2.7.11.1 9.2 MB) and take 2–12 s.
For a whole pathway or more, the bulk download below is the right tool.

### A lighter export, filtered by organism

Each kinetic table on the site has a "download all results as CSV" link. It returns the same
rows for one EC (and optionally one organism) without the 2–9 MB page, but with less: the
organism as text, **no taxid**. It also has three traps, all handled here: no header row,
a body declared UTF-8 that is actually Latin-1 (`°` is byte `0xB0`), and an empty result
that is the sentence "Nothing in this file" — itself tab-separated — under HTTP 200.
Continues from the first block (`UA`, `time`).

```python
import urllib.parse

TABLES = {"km": 12, "kcat": 44, "kcat_km": 305, "ki": 49}
EXPORT_COLS = ["ec", "value", "value_max", "ligand", "commentary", "organism",
               "uniprot", "ligand_structure_id", "brenda_ref"]


def export(parameter, ec, organism=None):
    """The search page's 'download all results as CSV' link: tab-separated, no header, Latin-1."""
    q = {"a": TABLES[parameter], "W[1]": ec, "T[1]": 1, "nolimit": 1}
    if organism:
        q.update({"W[6]": organism, "T[6]": 1})  # T=1 is exact match -- on free text
    q.update({f"V[{i}]": 1 for i in range(2, 10)})
    url = "https://www.brenda-enzymes.org/result_download.php?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as fh:
        body = fh.read().decode("latin-1")  # served as 'UTF-8'; the degree sign is byte 0xB0
    if body.split() == ["Nothing", "in", "this", "file"]:
        return []  # the empty result: a 200 carrying this sentence, itself tab-separated
    out = []
    for line in body.splitlines():
        f = line.split("\t")
        if len(f) != len(EXPORT_COLS) + 1 or f[-1] != "":
            raise RuntimeError(f"export layout changed: {len(f)} fields in {line[:120]!r}")
        out.append(dict(zip(EXPORT_COLS, f)))
    return out


human = export("km", "1.1.1.27", "Homo sapiens")
print(len(human), "rows")
for r in human:
    print(r["value"], "|", r["ligand"], "|", r["uniprot"], "|", r["commentary"][:50])
time.sleep(2)
print(export("kcat_km", "1.1.1.27", "Homo sapiens"))
time.sleep(2)
print(len(export("km", "1.1.1.27", "Human")), "rows for organism 'Human'")
```

The last line is the organism hazard in one number: `Homo sapiens` returns 8 rows,
`Human` returns 0, and both are a successful 200. The export also counts slightly fewer rows
than the page (8 against 9 human Km rows for LDH; 1,061 against 1,064 for alcohol
dehydrogenase) because the page repeats a row once per linked protein. Filter by taxid on
the page when the organism matters.

## The SOAP web service — registered users

**This needs a BRENDA account.** Registration is free (`register.php`, linked from the
login page) and asks for an email address and a password. The service's own fault message
names an unactivated account as one cause of refusal, so finish whatever activation step
registration asks for. The service takes the password as its SHA-256 hex digest, never in
clear.

The service is SOAP/RPC with one operation per data field (171 in all). The Python route is
`zeep` against `brenda_zeep.wsdl`, whose endpoint is `brenda_server_zeep.php`. The older
`brenda.wsdl` and `brenda_server.php` serve the Perl, PHP and Java clients, and the SOAPpy
example on the help page is Python 2.

```bash
python -m pip install zeep lxml
```

Read the parameter order from the live WSDL — it is the only reliable source. The help
page's per-method Python 3 snippets list some parameters in a different order (for
`getTurnoverNumber` it puts `organism` sixth; the WSDL has it second), and
`getTemperatureRange` takes `organism` *before* `ecNumber`. No account needed for this block.

```python
import xml.etree.ElementTree as ET

WSDL = "https://www.brenda-enzymes.org/soap/brenda_zeep.wsdl"
W = "{http://schemas.xmlsoap.org/wsdl/}"
with urllib.request.urlopen(WSDL, timeout=60) as fh:
    root = ET.fromstring(fh.read())

messages = {m.get("name"): [p.get("name") for p in m.findall(W + "part")]
            for m in root.findall(W + "message")}
operations = {}
for op in root.iter(W + "operation"):
    inp = op.find(W + "input")
    if inp is not None and inp.get("message"):
        operations[op.get("name")] = messages[inp.get("message").split(":")[-1]]

print(len(operations), "operations; endpoint",
      next(e.get("location") for e in root.iter() if e.get("location")))
for name in ["getKmValue", "getTurnoverNumber", "getKcatKmValue", "getKiValue", "getTemperatureRange"]:
    print(f"{name}: {operations[name]}")
```

So never pass arguments positionally. Pass every part by name, each as `name*value` (the
service's own convention; an unset filter is `name*`). Building the envelope without sending
it shows exactly what will go over the wire — still no account needed:

```python
import hashlib
from lxml import etree
from zeep import Client, Settings

client = Client(WSDL, settings=Settings(strict=False))


def brenda_args(operation, email, password, **filters):
    """Every WSDL part by name, each as 'name*value'; unset filters go as 'name*'."""
    names = operations[operation]  # from the live WSDL, block above
    unknown = set(filters) - set(names[2:])
    if unknown:
        raise TypeError(f"{operation} has no parameter(s) {sorted(unknown)}; it takes {names}")
    args = {"email": email, "password": hashlib.sha256(password.encode()).hexdigest()}
    for n in names[2:]:
        args[n] = f"{n}*{filters.get(n, '')}"
    return args


args = brenda_args("getTemperatureRange", "nobody@example.invalid", "x",
                   ecNumber="1.1.1.27", organism="Homo sapiens")
envelope = client.create_message(client.service, "getTemperatureRange", **args)
print("\n".join(l for l in etree.tostring(envelope, pretty_print=True).decode().splitlines()
                if "*" in l))
```

Wrong credentials fail loudly, which is the good case. Run against a deliberately invalid
address, both operations tried (`getKmValue`, `getEcNumbersFromKmValue`) returned the same
fault — for a wrong password, a clear-text password where the digest belongs, and empty
credentials alike:

```python
from zeep.exceptions import Fault

try:
    client.service.getKmValue(**brenda_args("getKmValue", "nobody@example.invalid",
                                            "not-a-password", ecNumber="1.1.1.27"))
except Fault as e:
    print("Fault", e.code, "-", e.message)
```

`Fault 401 - Username or password is wrong, or account was not activated.` The message
covers an unactivated account too, so a fresh registration that fails here may not be
activated yet.

With an account, the four kinetic constants for one EC and organism. Set `BRENDA_EMAIL`
and `BRENDA_PASSWORD` in the environment first; the block hashes the password itself.

```python
import os

EMAIL, PASSWORD = os.environ["BRENDA_EMAIL"], os.environ["BRENDA_PASSWORD"]
SOAP_OPS = {  # parameter -> (operation, value field, ligand field, unit)
    "km": ("getKmValue", "kmValue", "substrate", "mM"),
    "kcat": ("getTurnoverNumber", "turnoverNumber", "substrate", "1/s"),
    "kcat_km": ("getKcatKmValue", "kcatKmValue", "substrate", "1/(mM*s)"),
    "ki": ("getKiValue", "kiValue", "inhibitor", "mM"),
}


def soap_number(s):
    return None if s in (None, "", "-999") else float(s)  # -999 is the no-number sentinel


def soap_kinetics(ec, organism):
    out = []
    for param, (op, field, ligand, unit) in SOAP_OPS.items():
        result = getattr(client.service, op)(
            **brenda_args(op, EMAIL, PASSWORD, ecNumber=ec, organism=organism))
        for rec in result or []:
            out.append({
                "ec": rec["ecNumber"], "parameter": param, "unit": unit,
                "value": soap_number(rec[field]), "value_max": soap_number(rec[field + "Maximum"]),
                "value_text": rec[field], "ligand": rec[ligand],
                "ligand_structure_id": rec["ligandStructureId"],
                "organism": rec["organism"], "commentary": rec["commentary"] or "",
                "literature": rec["literature"]})
        time.sleep(1.1)  # the service asks for at most one request per second
    return out


soap_rows = soap_kinetics("1.1.1.27", "Homo sapiens")
print(collections.Counter(r["parameter"] for r in soap_rows))
if not soap_rows:
    print("No rows. Check the organism string against the enzyme page's organism column.")
```

What the WSDL says each record holds, read from its type definitions: `ecNumber`,
`organism`, the value and its `…Maximum`, `substrate` (or `inhibitor` for Ki), `commentary`,
`ligandStructureId` and `literature` (an array of BRENDA reference ids). Every value field
is typed `xsd:string`, so cast it. There is **no taxid and no UniProt accession** in a SOAP
kinetic record — the organism is the free-text name, and the `ligandStructureId` is the same
structure id the SPARQL join above uses. Cross-check the counts against the enzyme page
before trusting a SOAP result: for LDH in *Homo sapiens* the page has 9 Km rows, 1 kcat, 0
kcat/Km and 35 Ki. Two things this block assumes and the validating session could not test
without an account: that a misspelt organism returns an empty result rather than a fault,
and the exact Python shape zeep gives `literature`.

## Bulk download

The download page offers the whole release as a text file (`brenda_2026_1.txt.tar.gz`,
71.6 MB) or JSON (`brenda_2026_1.json.tar.gz`, 79.4 MB), plus a README for the text format.
The buttons stay disabled until the "I accept the license agreement" box is ticked. **A
person ticks it, in a browser.** An agent posting the acceptance on someone's behalf is
agreeing to terms for them; do not script it. Whether a login is also required was not
tested for that reason.

The JSON's schema is public. It states the units and little else about the numbers:

```python
BASE = "https://www.brenda-enzymes.org/schemas/2.0.0/"
with urllib.request.urlopen(BASE + "enzyme.schema.json", timeout=60) as fh:
    enzyme = json.load(fh)
for key in ["km_value", "turnover_number", "kcat_km_value", "ki_value"]:
    print(f'{key:16} {enzyme["properties"][key]["description"]}')
print("numeric_dataset declares:", sorted(enzyme["$defs"]["numeric_dataset"]["properties"]))
print("dataset def keys:", sorted(enzyme["$defs"]["dataset"]))
```

Schema 2.0.0 declares only `value` for a numeric entry, and its shared `dataset` definition
lists `comment`, `proteins` and `references` as bare keys instead of under `properties`, so a
JSON Schema validator enforces nothing about them. **Validating the file against this schema
proves nothing about the fields you will parse.** Look at a real record before writing a
parser:

```python
import tarfile

archive = "brenda_2026_1.json.tar.gz"  # saved from the download page after accepting the licence
with tarfile.open(archive) as tar:
    member = next(m for m in tar.getmembers() if m.isfile() and m.name.endswith(".json"))
    dump = json.load(tar.extractfile(member))
print(dump["release"], dump["version"], len(dump["data"]), "EC entries")
entry = dump["data"]["1.1.1.27"]
first = entry["km_value"][0]
print(sorted(first), first)
print(entry["protein"][first["proteins"][0]])
```

The uncompressed size was not measured here; `json.load` holds the whole release in memory,
so check free memory before running it. Per the schema, a value's `proteins` list points into the entry's `protein`
map, which carries the organism and, where known, UniProt or GenBank accessions — the bulk
equivalent of the page's taxid and UniProt columns.

## What does not work

| What | What happens | Instead |
|---|---|---|
| `enzyme.php?ecno=1.1.1` (three levels) | 200, empty page | Validate the EC before asking |
| A transferred EC (`1.1.1.68`) | 200, "transferred to EC 1.7.99.5", no data | Read the `ec_comment` note and follow it |
| Organism filter by name (export, SOAP) | `Human` returns 0 rows under 200 | Filter the page's rows on `taxid` |
| SPARQL for kinetic values | The graph has 37 predicates and none is kinetic | Page, SOAP or bulk download |
| SPARQL `CONTAINS(STR(?ec), "1.1.1.1")` | Also matches 1.1.1.10, 1.1.1.102, … | Use the IRI `https://purl.dsmz.de/brenda/ec/1.1.1.1` |
| SPARQL on an IRI lacking a predicate | Sometimes `"status": "ERROR"`, an engine assertion, not an empty result | Check `status`; query from the class side |
| SPARQL JSON | Once during testing a response came back truncated (unparseable JSON); the rerun was fine | Retry once on a decode error |
| Help-page SOAP snippets | Parameter order differs from the WSDL for several methods | Read the WSDL; pass by name |
| SOAP with a clear-text password | Same 401 fault as a wrong one | SHA-256 hex digest |
| Validating the JSON dump against schema 2.0.0 | Passes regardless of the numeric fields | Inspect a record |
| The `-999` sentinel | `-999`/`more` in search results, "additional information" on pages and in the export | Treat all three as no number |
| Scripting the download page | Requires a licence acceptance | A person downloads it |

## Try it

A cold check that the page parser, the id join, and the WSDL facts above still hold. Python
standard library only, no account, four requests to BRENDA spaced two seconds apart, plus
two SPARQL queries; about a minute.

**Data** — the BRENDA enzyme page for EC 1.1.1.27, L-lactate dehydrogenase
(<https://www.brenda-enzymes.org/enzyme.php?ecno=1.1.1.27>), the pages for `1.1.1.999` and
`1.1.1.68` as negative controls, the DSMZ SPARQL endpoint, and the SOAP WSDL. All CC BY 4.0,
no account. Last confirmed reachable 2026-11-12, release 2026.1. The enzyme page itself is not
declared in `datasets:`: it is HTML by design, and a dataset probe reads HTML as a gate page.
The plain-text export of the same Km table stands in for it there, with the WSDL and the JSON
schema.

```python
import html, json, re, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

BRENDA = "https://www.brenda-enzymes.org"
SPARQL = "https://sparql.dsmz.de/api/brenda"
UA = {"User-Agent": "brenda-kinetics try-it"}
SECTIONS = {"KM VALUE [mM]": ("km", "SUBSTRATE"), "TURNOVER NUMBER [1/s]": ("kcat", "SUBSTRATE"),
            "kcat/KM VALUE [1/(mM*s)]": ("kcat_km", "SUBSTRATE"), "Ki VALUE [mM]": ("ki", "INHIBITOR")}


def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def page(ec):
    if not re.match(r"^[1-7]\.\d+\.\d+\.n?\d+$", ec):
        raise ValueError(ec)
    try:
        with urllib.request.urlopen(urllib.request.Request(
                f"{BRENDA}/enzyme.php?ecno={ec}", headers=UA), timeout=180) as fh:
            p = fh.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise LookupError("404") from None
        raise
    moved = re.search(r'class="ec_comment card">\s*(transferred to|deleted)(.*?)</div>', p, re.S)
    if moved:
        raise LookupError(f"{moved.group(1)} {text(moved.group(2))}")
    return p


def kinetics(p, ec):
    rows = []
    for anchor, (param, lig) in SECTIONS.items():
        i = p.find(f'<a name="{anchor}"></a>')
        if i < 0:
            continue
        block = p[i:p.find('<a name="', i + 10)]
        tab = re.search(r'<div id="(tab\d+)" class="equal"', block).group(1)
        heads = [text(h).split(" [")[0] for h in re.findall(r'<div class="header">(.*?)</div>', block)]
        assert heads[1:] == [lig, "ORGANISM", "UNIPROT", "COMMENTARY", "LITERATURE", "IMAGE"], heads
        cells = {}
        for rid, col, raw in re.findall(rf'<div id="{tab}(r\d+sr\d+)c(\d+)" class="cell[^"]*">(.*?)</div>',
                                        block, re.S):
            cells.setdefault(rid, {})[int(col)] = raw
        claimed = sum(int(n) for n in re.findall(r'alt="show "> (\d+) entries', block))
        singles = {r.split("sr")[0] for r in cells} - set(re.findall(rf'id="{tab}(r\d+)" class="row', block))
        assert len(cells) == claimed + len(singles), (anchor, len(cells), claimed, len(singles))
        for c in cells.values():
            v = text(c.get(0, ""))
            m = re.fullmatch(r"(-?[\d.eE+-]+)(?:\s*-\s*([\d.eE+-]+))?", v)
            org = re.search(r"Org\('(\d+)'\)", c.get(2, ""))
            mol = re.search(r"MolPicture\('(\d+)'\)", c.get(6, ""))
            rows.append({"parameter": param, "value": float(m.group(1)) if m else None, "value_text": v,
                         "ligand": text(c.get(1, "")), "taxid": int(org.group(1)) if org else None,
                         "structure": int(mol.group(1)) if mol else None})
    return rows


# 1. One EC, all four constants, ids attached.
p = page("1.1.1.27")
release = re.search(r"Release (\d{4}\.\d)\s+\(", p).group(1)
rows = kinetics(p, "1.1.1.27")
count = {k: sum(r["parameter"] == k for r in rows) for k in ("km", "kcat", "kcat_km", "ki")}
nonum = [r for r in rows if r["value"] is None]
assert all(r["value_text"] == "additional information" for r in nonum)  # the -999 sentinel, as rendered
human_km = sorted((r["ligand"], r["value"]) for r in rows
                  if r["parameter"] == "km" and r["taxid"] == 9606 and r["value"] is not None)
print(f"release {release}: {len(rows)} rows {count}; {len(nonum)} without a number; "
      f"{sum(r['taxid'] is None for r in rows)} without a taxid")
print("human Km (mM):", human_km)

# 2. The page's failure modes: never an empty success.
for ec, want in [("1.1.1", ValueError), ("1.1.1.999", LookupError), ("1.1.1.68", LookupError)]:
    time.sleep(2)
    try:
        page(ec)
        raise AssertionError(f"{ec} did not raise")
    except want as e:
        print(f"{ec:10} -> {type(e).__name__}: {e}")


# 3. Two names, one compound: key on the structure id, not the label.
def sparql(q):
    req = urllib.request.Request(SPARQL, data=urllib.parse.urlencode({"query": q}).encode(),
                                 headers={"Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=120) as fh:
        out = json.load(fh)
    assert out.get("status") != "ERROR", out.get("exception")
    return [{k: v["value"] for k, v in b.items()} for b in out["results"]["bindings"]]


by_name = {r["ligand"]: r["structure"] for r in rows if r["structure"]}
pair = [by_name["2-oxobutanoate"], by_name["2-oxobutyrate"]]
values = " ".join(f"<https://purl.dsmz.de/brenda/structure/{n}>" for n in pair)
hits = sparql(f"""PREFIX s: <https://purl.dsmz.de/schema/>
    SELECT DISTINCT ?st ?c WHERE {{ VALUES ?st {{ {values} }} ?c s:hasStructure ?st }}""")
compounds = {h["c"] for h in hits}
assert pair[0] != pair[1] and len(hits) == 2 and len(compounds) == 1, hits
print(f"'2-oxobutanoate' (structure {pair[0]}) and '2-oxobutyrate' (structure {pair[1]}) -> "
      f"{compounds.pop().rsplit('/', 1)[1]}")

# 4. The open SPARQL graph carries no kinetic constants.
preds = [b["p"] for b in sparql("SELECT DISTINCT ?p WHERE { ?s ?p ?o }")]
assert not [x for x in preds if re.search(r"km|kcat|turnover|kivalue|michaelis", x, re.I)], preds
print(f"SPARQL: {len(preds)} predicates, none kinetic")

# 5. SOAP parameter order comes from the live WSDL, not from the help page.
W = "{http://schemas.xmlsoap.org/wsdl/}"
with urllib.request.urlopen(f"{BRENDA}/soap/brenda_zeep.wsdl", timeout=60) as fh:
    root = ET.fromstring(fh.read())
msgs = {m.get("name"): [x.get("name") for x in m.findall(W + "part")] for m in root.findall(W + "message")}
ops = {o.get("name"): msgs[o.find(W + "input").get("message").split(":")[-1]]
       for o in root.iter(W + "operation") if o.find(W + "input") is not None
       and o.find(W + "input").get("message")}
assert ops["getKmValue"][:4] == ["email", "password", "ecNumber", "organism"], ops["getKmValue"]
assert ops["getTemperatureRange"][2:4] == ["organism", "ecNumber"], ops["getTemperatureRange"]
print(f"WSDL: {len(ops)} operations; getTurnoverNumber {ops['getTurnoverNumber']}")
```

**Expect — invariants.** A failure here means the skill is wrong, not that BRENDA moved:

- Every kinetic table has exactly the columns value / substrate-or-inhibitor / organism /
  UniProt / commentary / literature / image, and the rows parsed equal the rows the page
  claims, grouped and single.
- Every row without a number reads *additional information*.
- `1.1.1` raises before any request, `1.1.1.999` raises on 404, and `1.1.1.68` raises naming
  where it went. None returns an empty success.
- `2-oxobutanoate` and `2-oxobutyrate` are two structure ids on one compound. This is the
  counter-example to joining on substrate names; if it ever stops holding, BRENDA has
  re-curated, and the general point stands on the other pairs listed above.
- The SPARQL graph has no kinetic predicate.
- `getKmValue` takes `email, password, ecNumber, organism, …`; `getTemperatureRange` takes
  `organism` before `ecNumber`.

**Expect — observed values**, release 2026.1, read 2026-11-12. A mismatch here is drift to
investigate, not a bug:

```
release 2026.1: 548 rows {'km': 333, 'kcat': 99, 'kcat_km': 34, 'ki': 82}; 43 without a number; 15 without a taxid
human Km (mM): [('(S)-lactate', 10.73), ('(S)-lactate', 21.78), ('NAD+', 0.5), ('NAD+', 0.99), ('pyruvate', 0.03), ('pyruvate', 0.398)]
1.1.1      -> ValueError: 1.1.1
1.1.1.999  -> LookupError: 404
1.1.1.68   -> LookupError: transferred to EC 1.7.99.5
'2-oxobutanoate' (structure 390) and '2-oxobutyrate' (structure 371) -> 311
SPARQL: 37 predicates, none kinetic
WSDL: 171 operations; getTurnoverNumber ['email', 'password', 'ecNumber', 'organism', 'turnoverNumber', 'turnoverNumberMaximum', 'substrate', 'commentary', 'ligandStructureId', 'literature']
```

## Citing it

Cite the release you read and the current BRENDA paper: Hauenstein J. et al., *BRENDA in
2026: a Global Core Biodata Resource for functional enzyme and metabolic data within the DSMZ
Digital Diversity*, Nucleic Acids Res. 54(D1):D527–D534 (2026), doi:10.1093/nar/gkaf1113,
PMID 41206471. For a constant used in a model or a figure, cite the primary paper too — the
`brenda_refs` column holds BRENDA's reference ids, and each resolves at
`https://www.brenda-enzymes.org/literature.php?e=<EC>&r=<id>` to the paper with its PubMed id.

For constraint-based models that take kcat values, see `cobrapy`.
