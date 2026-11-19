---
name: msigdb
description: Download MSigDB gene sets (Hallmark, C1–C9, mouse MH and M-series) from a pinned release as Entrez-keyed GMT files — per-collection licences with KEGG_LEGACY excluded, symbol drift between releases, Ensembl mapping.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, gsea, enrichment, entrez, licensing]
covers: [msigdb, molecular signatures database, gene sets, gmt, hallmark, gsea, ssgsea, gsva, c1, c2, c3, c5, c6, c7, c8, c9, canonical pathways, reactome, wikipathways, biocarta, kegg medicus, chemical and genetic perturbations, transcription factor targets, microrna targets, immunesigdb, cell type signatures, entrez, ensembl, human, mouse]
papers: [PMID:16199517, PMID:21546393, PMID:26771021, PMID:37704782]
access: [open, registered]
datasets: [https://content.msigdb.org/downloads/msigdb/release/2026.2.Hs/h.all.v2026.2.Hs.entrez.gmt, https://content.msigdb.org/downloads/msigdb/release/2026.2.Hs/h.all.v2026.2.Hs.symbols.gmt, https://content.msigdb.org/downloads/msigdb/release/2026.2.Hs/c2.cp.v2026.2.Hs.entrez.gmt, https://content.msigdb.org/downloads/msigdb/release/2026.2.Hs/c2.cp.kegg_legacy.v2026.2.Hs.entrez.gmt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-19
  against: MSigDB 2026.2.Hs and 2026.2.Mm (files dated 2026-10-15) plus 2025.1.Hs, 2024.1.Hs, 2023.1.Hs and 2022.1.Mm for comparison / content.msigdb.org live 2026-11-19 / Python 3.12.8 standard library only / curl 8.15 / macOS arm64
  executed: 5
  unverified: 0
---

# MSigDB — Molecular Signatures Database gene sets

MSigDB is the Broad Institute and UC San Diego's library of gene sets, the standard input to GSEA
and its relatives: 35,092 human sets and 23,881 mouse sets in release 2026.2. This skill gets
them onto disk from a **pinned release**, keyed on **NCBI Gene (Entrez) ids**, with the one
licence-restricted sub-collection removed, and reads them without the three mistakes that quietly
shrink gene sets: joining on symbols across releases, mixing human and mouse files, and taking a
combined file that bundles KEGG's licensed sets back in.

It stops at files. Running ORA, preranked GSEA or ssGSEA over them is `pathway-enrichment`.
Resolving a symbol or alias to a Gene id is `ncbi-gene`; the GO annotations behind C5 are
`gene-ontology`; the pathways behind `C2:CP:REACTOME` are `reactome`.

## Licence, collection by collection

MSigDB's terms page, <https://www.gsea-msigdb.org/gsea/msigdb_license_terms.jsp>, read
2026-11-19, applies to v6.0–v7.5.1 and v2022.1 onward:

> The contents of MSigDB are protected by copyright (c) 2004-2025 Broad Institute, Inc.,
> Massachusetts Institute of Technology, and Regents of the University of California, subject to
> the terms and conditions of the Creative Commons Attribution 4.0 International License. Some
> MSigDB gene sets are distributed with further restrictions.

The same page names three exceptions, each recognisable by set-name prefix:

| sets | prefix | terms | this skill |
|---|---|---|---|
| `C2:CP:KEGG_LEGACY` (186 sets) | `KEGG_` without `MEDICUS_` | "provided for use in the MSigDB collection under license to the Broad Institute … End users are directed to … kegg.jp … for information on the copyright holder's academic and commercial licensing policies" | **excluded** |
| `C2:CP:KEGG_MEDICUS` (790) | `KEGG_MEDICUS_` | "subject to the terms and conditions of the Creative Commons Attribution-ShareAlike 4.0 International License" | kept |
| `C2:CP:BIOCARTA` (292 human, 252 mouse) | `BIOCARTA_` | "conditioned upon acknowledgment and retention of the aforementioned copyright, and agreement to such disclaimer" | kept |

Why KEGG_LEGACY goes. KEGG's own page, <https://www.kegg.jp/kegg/legal.html> (updated
2024-10-01), says "Non-academic use of KEGG requires a commercial license." Academic users may
take the sets; a commercial reader needs a licence from Pathway Solutions. The rest of MSigDB is
open to both, so this skill drops the 186 sets everywhere they appear, including inside `c2.all`,
`c2.cp` and the all-in-one `msigdb.v…gmt`. If you are academic and want them, fetch
`c2.cp.kegg_legacy` yourself under KEGG's terms; the code below never does.

What the other two mean in practice. KEGG MEDICUS is share-alike: analysing with it is
unrestricted, but if you **redistribute** those sets or a modified version (in a supplement, a
package, a derived GMT), that file goes out under CC BY-SA 4.0. BioCarta asks that you keep the
copyright notice and accept its no-warranty disclaimer. The mouse release has no KEGG sets at all.

Cite MSigDB with Subramanian et al. 2005 and Liberzon et al. 2011, plus Liberzon et al. 2015 for
Hallmark and Castanza et al. 2023 for the mouse collections, and name the release (`2026.2.Hs`).

## Access

The Broad asks you to register before downloading. Its home page,
<https://www.gsea-msigdb.org/gsea/msigdb/index.jsp>: "Please register to download the GSEA
software and the MSigDB gene sets … Registration is free. Its only purpose is to help us track
usage for reports to our funding agencies." The form takes an email and an organisation. Register
once at <https://www.gsea-msigdb.org/gsea/register.jsp>; the usage counts it produces are what
keeps the resource funded.

The release files themselves are served with no login, cookie or key. Every block here fetches
them directly. The website's Downloads page redirects to a login form; the file hosts do not.

## Pin a release

Releases are named `YYYY.N.Hs` (human) and `YYYY.N.Mm` (mouse), twice a year or so, and listed
with dates in `msigdb_releases.json`. Set membership changes between them, and so do symbols.
Comparing 2025.1.Hs with 2026.2.Hs:

- 1,939 set names are new and 1,981 are gone; 33,153 are in both.
- **5,090 sets have identical Entrez membership and a changed symbol list.** 12 of the 50
  Hallmark sets are among them; all 50 are Entrez-identical.
- 855 NCBI Gene ids carry a different symbol in the 2026.2 annotation than in 2025.1. In
  Hallmark: `NCL` is now `NUCLEOLIN`, `NDUFA4` is `COXFA4`, `CENPJ` is `CPAP`, `IL1RL1` is
  `IL33R`, `GPR182` is `ACKR5`.

So a gene list annotated against one release and matched by symbol to another loses genes with
no error. Record the release beside every result and match on Entrez ids.

```bash
curl -s https://data.broadinstitute.org/gsea-msigdb/msigdb/release/msigdb_releases.json |
python3 -c 'import json,sys
for r in json.load(sys.stdin)["releases"][:4]: print(r["versionId"], r["releaseDate"], r["description"])'
curl -s https://content.msigdb.org/downloads/msigdb/release/2026.2.Hs/genesets_v2026.2.Hs.json |
python3 -c 'import json,sys; f=json.load(sys.stdin)["files"]; print(len(f), "collections;", f[0]["name"])'
```

```
2026.2.Hs 2026-10 Human collections, released October 2026
2026.2.Mm 2026-10 Mouse collections, released October 2026
2026.1.Hs 2026-01 Human collections, released January 2026
2026.1.Mm 2026-01 Mouse collections, released January 2026
34 collections; c1.all.v2026.2.Hs.symbols.gmt
```

## Files and names

`https://content.msigdb.org/downloads/msigdb/release/<release>/<collection>.v<release>.<ids>.gmt`

- `<ids>` is `entrez` or `symbols`. Both files of one release list the same sets with genes **in
  the same order**, so position *i* in one is position *i* in the other (checked over all 35,092
  sets in 2026.2.Hs, and against the release's own NCBI Gene annotation file).
- Human collections: `h.all`, `c1.all` … `c9.all`, and sub-collections such as `c2.cp.reactome`,
  `c5.go.bp`, `c7.immunesigdb`. Mouse ones start with `m`: `mh.all`, `m2.cp`, `m5.go.bp`,
  `m5.mpo`, `m8.all`. `msigdb.v<release>.<ids>.gmt` is everything in one file.
- `<collection>.v<release>.json` carries per-set metadata: `collection` (e.g.
  `C2:CP:KEGG_LEGACY`), `systematicName`, `pmid`, `exactSource`, `geneSymbols`.
- `genesets_v<release>.json` is the release's own list of collections (symbols files only; the
  entrez twin of each exists under the same stem).
- `annotations/` holds chip files mapping Ensembl, UniProt, HGNC, RefSeq and array probe ids to
  the release's symbols, and ortholog chips from mouse, rat and macaque ids to human symbols.

The same tree is mirrored at `https://data.broadinstitute.org/gsea-msigdb/msigdb/release/`
with a browsable index. It was about 13 times slower (62 KB/s against 819 KB/s on a 4 MB file,
2026-11-19), so the code uses `content.msigdb.org`.

## The helper

Writes `msigdb_tools.py` into the working directory. Standard library only.

```bash
cat > msigdb_tools.py <<'EOF'
"""MSigDB release files: pinned download, GMT reading, licence filter, Entrez-keyed joins."""
import json
import os
import urllib.error
import urllib.request

BASE = "https://content.msigdb.org/downloads/msigdb/release"
RELEASE = "2026.2.Hs"          # human; the mouse twin is "2026.2.Mm"
SET_HOST = "://www.gsea-msigdb.org/gsea/msigdb/"   # http:// before 2023.2, https:// since


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "msigdb-skill/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            # content.msigdb.org is an S3 bucket: a missing key answers 403 AccessDenied
            raise FileNotFoundError(f"{e.code} for {url} -- no such file in this release; "
                                    "check the name against catalog()") from None
        raise


def catalog(release=RELEASE):
    """Collection stems listed by the release's own catalogue, e.g. 'h.all', 'c2.cp.reactome'."""
    files = json.loads(_get(f"{BASE}/{release}/genesets_v{release}.json"))["files"]
    tail = f".v{release}.symbols.gmt"
    return {f["name"][: -len(tail)]: f["description"] for f in files if f["name"].endswith(tail)}


def gmt_url(collection, release=RELEASE, ids="entrez"):
    species = release.rsplit(".", 1)[-1]
    if species not in ("Hs", "Mm"):
        raise ValueError(f"release must end in .Hs or .Mm, got {release!r}")
    if ids not in ("entrez", "symbols"):
        raise ValueError("ids is 'entrez' or 'symbols'")
    mouse_stem = collection.startswith("m") and collection != "msigdb"
    if species == "Mm" and not (mouse_stem or collection == "msigdb"):
        raise ValueError(f"{collection!r} is a human collection name; mouse ones are mh.all, m2.cp, m5.go.bp ...")
    if species == "Hs" and mouse_stem:
        raise ValueError(f"{collection!r} is a mouse collection name; use a .Mm release")
    return f"{BASE}/{release}/{collection}.v{release}.{ids}.gmt"


def fetch(collection, dest=".", release=RELEASE, ids="entrez"):
    """Download one GMT into dest, check its shape, return the path."""
    url = gmt_url(collection, release, ids)
    data = _get(url).decode("utf-8")
    for n, line in enumerate(data.splitlines(), 1):
        f = line.split("\t")
        if len(f) < 3 or SET_HOST not in f[1]:
            raise ValueError(f"{url} line {n} is not GMT")
        if ids == "entrez" and not all(g.isdigit() for g in f[2:]):
            raise ValueError(f"{url} line {n} carries a non-numeric Entrez id")
    path = os.path.join(dest, url.rsplit("/", 1)[-1])
    with open(path, "w") as fh:
        fh.write(data)
    return path


def read_gmt(path):
    """{set name: [gene, ...]} in file order. Set names are unique within a release file."""
    sets = {}
    with open(path) as fh:
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if f[0] in sets:
                raise ValueError(f"duplicate set name {f[0]} in {path}")
            sets[f[0]] = f[2:]
    return sets


def is_kegg_legacy(name):
    """KEGG_LEGACY sets carry KEGG's own licence; KEGG_MEDICUS_ sets are CC BY-SA 4.0."""
    return name.startswith("KEGG_") and not name.startswith("KEGG_MEDICUS_")


def drop_kegg_legacy(sets):
    kept = {k: v for k, v in sets.items() if not is_kegg_legacy(k)}
    return kept, sorted(set(sets) - set(kept))


def symbol_to_entrez(symbols_path, entrez_path):
    """Release-internal symbol -> Entrez map, from the paired GMTs of ONE release.
    The two files list each set's genes in the same order; this checks that, then pairs them."""
    s, e = read_gmt(symbols_path), read_gmt(entrez_path)
    if s.keys() != e.keys():
        raise ValueError("the two files are not the same collection/release")
    pair = {}
    for k in s:
        if len(s[k]) != len(e[k]):
            raise ValueError(f"{k}: {len(s[k])} symbols vs {len(e[k])} ids")
        for sym, gid in zip(s[k], e[k]):
            if pair.setdefault(sym, gid) != gid:
                raise ValueError(f"{sym} pairs with {pair[sym]} and {gid}")
    return pair
EOF
```

## Get the files

Every collection in the pinned release, both id flavours, `KEGG_LEGACY` removed from every file,
and a `MANIFEST.tsv` with set counts and SHA-256 per file. Save as `get_msigdb.py` beside
`msigdb_tools.py` and run `python3 get_msigdb.py`.

```python
import hashlib
import os
import msigdb_tools as m

REL = m.RELEASE                       # "2026.2.Mm" for the mouse collections
out = os.path.join("msigdb", REL)
os.makedirs(out, exist_ok=True)
rows = []
for stem in m.catalog(REL):
    if stem.endswith("kegg_legacy"):  # KEGG's own licence; see "Licence, collection by collection"
        continue
    for ids in ("entrez", "symbols"):
        path = m.fetch(stem, out, REL, ids)
        with open(path) as fh:
            lines = fh.readlines()
        keep = [l for l in lines if not m.is_kegg_legacy(l.split("\t", 1)[0])]
        if len(keep) != len(lines):   # c2.all and c2.cp bundle the legacy sets in
            with open(path, "w") as fh:
                fh.writelines(keep)
        body = open(path, "rb").read()
        rows.append((os.path.basename(path), len(keep), len(lines) - len(keep),
                     len(body), hashlib.sha256(body).hexdigest()))
with open(os.path.join(out, "MANIFEST.tsv"), "w") as fh:
    fh.write("file\tsets\tkegg_legacy_removed\tbytes\tsha256\n")
    for r in rows:
        fh.write("\t".join(map(str, r)) + "\n")
print(f"{len(rows)} files in {out}; KEGG_LEGACY sets removed:",
      sum(r[2] for r in rows), "| total MB", round(sum(r[3] for r in rows) / 1e6, 1))
```

```
66 files in msigdb/2026.2.Hs; KEGG_LEGACY sets removed: 744 | total MB 135.6
```

About 100 seconds. 744 is 186 sets times four files (`c2.all` and `c2.cp`, each in two id
flavours); the manifest shows `c2.cp` at 4,091 sets after removing them. Change `REL` to
`"2026.2.Mm"` for the 21 mouse collections, where nothing is removed.

For one collection: `m.fetch("h.all", ".", "2026.2.Hs", "entrez")`.

## Join on Entrez ids, not symbols

Read the Entrez GMT and match your genes by NCBI Gene id. If your table carries symbols, convert
them to ids with the annotation that produced them (or `ncbi-gene`), then join. If you must hand a
tool symbols, take the symbol GMT **of the same release** you mapped against, and say which.

Where your table has Ensembl gene ids, the release's own chip file maps them to that release's
symbols, and `symbol_to_entrez` turns those into ids from the paired GMTs:

```python
import os
import urllib.request
import msigdb_tools as m

REL = m.RELEASE
chip = f"Human_Ensembl_Gene_ID_MSigDB.v{REL}.chip"
if not os.path.exists(chip):
    urllib.request.urlretrieve(f"{m.BASE}/{REL}/annotations/{chip}", chip)
ens2sym = {}
with open(chip) as fh:
    next(fh)                                      # Probe Set ID / Gene Symbol / Gene Title
    for line in fh:
        ens, sym = line.split("\t")[:2]
        ens2sym[ens] = sym

pe, ps = m.fetch("h.all", ".", REL, "entrez"), m.fetch("h.all", ".", REL, "symbols")
sym2id = m.symbol_to_entrez(ps, pe)              # same release on both sides

mine = ["ENSG00000141510.18", "ENSG00000115053", "ENSG00000189043", "ENSG00000000000"]
for raw in mine:
    ens = raw.split(".")[0]                       # the chip has no version suffixes
    sym = ens2sym.get(ens)
    print(f"{raw:20s} -> {sym or 'not in chip':12s} -> Entrez {sym2id.get(sym, '-')}")

by_sym = {}
for ens, sym in ens2sym.items():
    by_sym.setdefault(sym, []).append(ens)
multi = {s: e for s, e in by_sym.items() if len(e) > 1}
print(f"{len(ens2sym)} Ensembl ids -> {len(by_sym)} symbols; {len(multi)} symbols take more than one id")
```

```
ENSG00000141510.18   -> TP53         -> Entrez 7157
ENSG00000115053      -> NUCLEOLIN    -> Entrez 4691
ENSG00000189043      -> COXFA4       -> Entrez 4697
ENSG00000000000      -> not in chip  -> Entrez -
53313 Ensembl ids -> 43840 symbols; 5462 symbols take more than one id
```

Strip the version suffix first; the chip has none. The many-to-one is mostly alternate-haplotype
and patch-region copies of one gene (`ZNF486` has three ids): several rows of an RNA-seq table can
land on one gene, so collapse them (sum counts, or keep the highest-expressed) before ranking.
`symbol_to_entrez` built from `h.all` only knows Hallmark genes; build it from `c2.all` or the
`msigdb` pair for genome-wide coverage.

## Human and mouse

Since 2022.1 the mouse release is native: mouse gene ids from mouse-curated sources plus
ortholog-mapped versions of human collections (`mh.all` is Hallmark mapped to mouse). Measured on
2026.2:

- `msigdb.v2026.2.Hs` covers 43,768 human Gene ids and `msigdb.v2026.2.Mm` 41,700 mouse ids, and
  **no id is shared** (NCBI Gene ids are unique across species). Joining a mouse table to a human
  Entrez GMT returns nothing, which is loud.
- The quiet failure is symbols. Mouse symbols are mixed case (`Aurka`); upper-casing mouse genes
  to match a human symbol file matches most one-to-one orthologs and drops the rest without
  error. Use the `.Mm` release for mouse data, or a deliberate ortholog mapping, and never
  `.upper()` across species.
- Set names repeat across species (`HALLMARK_G2M_CHECKPOINT` is in both), so a name alone does not
  say which file a result came from.

`gmt_url` refuses a human collection name under a `.Mm` release and the reverse, so the wrong
pairing fails before any download.

## What does not work

- **`https://www.gsea-msigdb.org/gsea/downloads.jsp`** redirects to `login.jsp`; it is not a file
  URL. Use the release tree.
- **A file that does not exist answers `403 AccessDenied`** (XML) on `content.msigdb.org`, not
  404; the Broad mirror answers 404. The helper reports both as `FileNotFoundError`. Measured
  with `c2.cp.kegg.v2026.2.Hs.entrez.gmt`, a name that existed until 2023.1.
- **`h.all.v2026.2.Mm…`** does not exist; mouse Hallmark is `mh.all`.
- **Older names differ.** v7.x files carry no species suffix (`h.all.v7.5.1.entrez.gmt`) and the
  helper refuses those releases; up to 2023.1 the legacy KEGG file was `c2.cp.kegg`, and
  `KEGG_MEDICUS_` sets first appear in 2023.2 (619 then, 790 now). The prefix rule finds the 186
  legacy sets in 2023.1 too.
- **The second GMT column was `http://` before 2023.2** and `https://` since; the helper checks
  the host, not the scheme. Most GMT readers ignore this column, which is right.
- **`c2.all`, `c2.cp` and `msigdb.v…` include `KEGG_LEGACY`.** Downloading a combined file and
  stopping there brings the licensed sets back.

## Try it

**Data.** MSigDB 2026.2.Hs Hallmark (both id flavours), the combined canonical-pathways file
`c2.cp`, and its `kegg_legacy` sub-collection, from `content.msigdb.org`. CC BY 4.0 apart from the
exceptions above; no account needed to fetch. Last confirmed reachable 2026-11-19.

**Run.** Routed through both traps: the licence filter has to remove exactly the KEGG_LEGACY
sub-collection from the combined file, and four genes annotated with 2025.1-era symbols have to
be found in their Hallmark sets.

```bash
COLD=$(mktemp -d) && cd "$COLD"
R=2026.2.Hs
B=https://content.msigdb.org/downloads/msigdb/release/$R
for f in h.all.v$R.entrez.gmt h.all.v$R.symbols.gmt c2.cp.v$R.entrez.gmt c2.cp.kegg_legacy.v$R.entrez.gmt; do
  curl -sSfO "$B/$f" || { echo "FAILED $f"; exit 1; }
done
python3 - "$R" <<'EOF'
import sys
R = sys.argv[1]
def gmt(path):
    return {f[0]: f[2:] for f in (l.rstrip("\n").split("\t") for l in open(path))}

hs, he = gmt(f"h.all.v{R}.symbols.gmt"), gmt(f"h.all.v{R}.entrez.gmt")
assert hs.keys() == he.keys() and len(he) == 50, "Hallmark is 50 sets in both id flavours"
sym2id = {}
for k in hs:
    assert len(hs[k]) == len(he[k]), k
    for s, g in zip(hs[k], he[k]):
        assert g.isdigit() and sym2id.setdefault(s, g) == g, (k, s, g)
id2sym = {g: s for s, g in sym2id.items()}
assert len(id2sym) == len(sym2id), "pairing is one-to-one"

# Licence filter: KEGG_ without MEDICUS_ is exactly the KEGG_LEGACY sub-collection
cp, legacy = gmt(f"c2.cp.v{R}.entrez.gmt"), gmt(f"c2.cp.kegg_legacy.v{R}.entrez.gmt")
flagged = {k for k in cp if k.startswith("KEGG_") and not k.startswith("KEGG_MEDICUS_")}
assert flagged == set(legacy), "prefix rule matches the sub-collection file"
kept = {k: v for k, v in cp.items() if k not in flagged}
assert not any(k in kept for k in legacy)

# The label trap: hits annotated with 2025.1-era symbols, joined against this release
hits = {"NCL": "4691", "NDUFA4": "4697", "CENPJ": "55835", "IL1RL1": "9173"}
where = {"NCL": "HALLMARK_G2M_CHECKPOINT", "NDUFA4": "HALLMARK_OXIDATIVE_PHOSPHORYLATION",
         "CENPJ": "HALLMARK_MITOTIC_SPINDLE", "IL1RL1": "HALLMARK_IL2_STAT5_SIGNALING"}
by_symbol = sum(sym in hs[where[sym]] for sym in hits)
by_entrez = sum(gid in he[where[sym]] for sym, gid in hits.items())
assert by_entrez == 4, "every hit is in its set when joined on Entrez"
print(f"release {R}: {len(he)} Hallmark sets, {len(sym2id)} distinct genes")
print(f"c2.cp: {len(cp)} sets, KEGG_LEGACY removed {len(flagged)}, kept {len(kept)}")
print(f"symbol join found {by_symbol}/4, Entrez join found {by_entrez}/4")
for sym, gid in hits.items():
    print(f"  {sym:7s} Entrez {gid:>5s} -> {id2sym[gid]} in {R}")
EOF
```

**Expect.**

Invariants (a failure means the skill is wrong):

- 50 Hallmark sets; the symbols and entrez files list the same sets with the same lengths, and
  the positional pairing is one-to-one.
- The `KEGG_` without `MEDICUS_` rule selects exactly the sets in `c2.cp.kegg_legacy`, and none
  survive the filter.
- All four hits are found when joined on Entrez ids.

Observed on 2026.2.Hs, 2026-11-19 (drift to investigate, not a bug, if they move):

```
release 2026.2.Hs: 50 Hallmark sets, 4384 distinct genes
c2.cp: 4277 sets, KEGG_LEGACY removed 186, kept 4091
symbol join found 0/4, Entrez join found 4/4
  NCL     Entrez  4691 -> NUCLEOLIN in 2026.2.Hs
  NDUFA4  Entrez  4697 -> COXFA4 in 2026.2.Hs
  CENPJ   Entrez 55835 -> CPAP in 2026.2.Hs
  IL1RL1  Entrez  9173 -> IL33R in 2026.2.Hs
```

The `0/4` is the point: those symbols were current in 2025.1 and every one of the genes is still
in its set. A later release could rename them back or rename others; the Entrez count should stay
at 4.
