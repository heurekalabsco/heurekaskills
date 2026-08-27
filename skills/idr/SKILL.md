---
name: idr
description: Browse and fetch public imaging studies from the Image Data Resource — resolve a published idr0000 accession to its OMERO screens and projects, walk plates, wells and datasets down to single images, read per-image gene, phenotype and pixel-size annotations, check each study's own licence, and pull OME-Zarr arrays or the EBI mirror.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [microscopy, public-data, image-analysis, high-content-screening, ome-zarr]
covers: [IDR, image data resource, OMERO, OME-Zarr, OME-NGFF, high content screen, HCS, siRNA screen, CRISPR screen, compound screen, well plate, fluorescence microscopy, spinning disk confocal, structured illumination, SIM, SPIM, light sheet, time-lapse imaging, transmission electron microscopy, imaging mass cytometry, in situ sequencing, histology, phenotype, CMPO, HeLa, human, mouse, zebrafish, Drosophila, segmentation]
papers: [PMID:28277571, PMID:34845388, PMID:25373780, PMID:23086237, PMID:31398189, PMID:20360735, PMID:20531400]
access: [open]
platform: omero
datasets: [https://idr.openmicroscopy.org/api/v0/m/projects/51/, https://idr.openmicroscopy.org/api/v0/m/images/1884807/, https://idr.openmicroscopy.org/webgateway/render_thumbnail/1884807/, https://uk1s3.embassy.ebi.ac.uk/idr/zarr/v0.4/idr0062A/6001240.zarr/.zattrs]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: IDR public API v0 (x-omero-apiversion 0.2) / IDR search engine API v1 / EMBL-EBI Embassy S3 / Python 3.12.8 / zarr 3.3.0 / numpy 2.5.2
  executed: 16
  unverified: 0
  records: all 105 screens and 147 projects enumerated and their study annotations read; techniques re-run against idr0001, idr0002, idr0012, idr0013, idr0021, idr0022, idr0025, idr0032, idr0043, idr0047, idr0062, idr0088, idr0097, idr0128, idr0154 and idr0156
---
# The Image Data Resource

IDR publishes the image data behind published papers — high-content screens, light-sheet
volumes, super-resolution stacks, electron microscopy — with the study's own annotation
tables attached to the images. It is the route from an accession printed in a methods
section (`idr0021`) to the pixels and to the per-image gene, reagent and phenotype calls.

Everything below is anonymous HTTP. No account, no key, no click-through. There is in fact
no way to log in: `/api/v0/token/` returns a token but sets no CSRF cookie, and
`/webclient/login/` redirects straight back into the public session, so the write side of
the OMERO API is unreachable by design.

**The one thing to internalise: IDR is OMERO underneath, and the hierarchy is the API.**
A study is not a record you fetch. It is one or more *containers* — screens or projects —
and everything else is reached by following the `url:*` fields those containers carry.
Screen-based and project-based studies are reached by different paths, so code written
against one study fails on the next unless it branches on the container type first.

## What state the service is in

IDR is mid-migration, and it changes what you can do with pixels. Its own banner, read
2026-08-27:

> The IDR is transitioning to the OME-Zarr format for improved data accessibility and
> performance. Images in other formats can no longer be fully viewed from our image viewer,
> but thumbnails are available. We are working to convert all studies to OME-Zarr, and in
> the meantime non-Zarr images can be downloaded for local viewing.

What that means in practice, measured across three studies on 2026-08-27:

| route | status | note |
|---|---|---|
| `/api/v0/m/…` metadata | 200 | complete, including pixel dimensions and physical sizes |
| `/webclient/api/annotations/` | 200 | study, well and image annotations, all intact |
| `/webgateway/render_thumbnail/{id}/` | 200 | 96×96 JPEG from the cached thumbnail store |
| `/webgateway/render_image/{id}/{z}/{t}/` | **403** | blocked at the proxy — zero-length body, no `Vary: Cookie` |
| `/webgateway/render_image_region/…` | **403** | same |
| `/webgateway/imgData/{id}/` | 200, but **carries an `Exception`** and no `size` |
| `/webgateway/archived_files/download/{id}/` | 302 → login → **200 HTML** | never the original file |

So: metadata and thumbnails come from the server, and pixels come from the mirrors under
*Get the files*. The 403 is not a session problem — no login exists to fix it — and it is
returned for OME-Zarr-converted images too, so waiting for a study's conversion does not
restore rendering.

## The hierarchy, and the two shapes a study takes

```
Screen  ──url:plates──▶  Plate  ──url:wells──▶  Well  ──WellSamples[].Image──▶  Image
Project ──url:datasets─▶  Dataset ──url:images─▶  Image
```

High-content studies land as screens; standard acquisition studies land as projects. A
`Well` is not an image — it holds a list of `WellSamples`, one per field of view, and each
`WellSample` wraps one `Image`. On `idr0001` plate 2551 that is 96 wells and 576 images.

Paging is where naive code loses data silently, so fix the four rules first:

```python
import json, urllib.error, urllib.parse, urllib.request

API = "https://idr.openmicroscopy.org/api/v0/m"


def get_json(url, timeout=90):
    """A route that does not exist under /api/v0/ answers 404 with an HTML page, not
    JSON — `/api/v0/m/images/1884807/filesets/` is 1561 bytes of Django error page.
    Let the HTTPError raise rather than feeding the body to a parser."""
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def page_all(url, **params):
    """Four traps, all confirmed 2026-08-27:

    1. The DEFAULT limit is 200, not "everything". A screen with 510 plates returns 200
       of them and a `meta` block that quietly says so.
    2. `maxLimit` is 1000 and a larger `limit` is CLAMPED, not rejected — `?limit=5000`
       answers 200 with `meta.limit = 1000`.
    3. Unrecognised query parameters are IGNORED, not rejected. `?name=idr0001` on
       /screens/ returns all 105 screens with HTTP 200, so a filter you invented reads
       as a filter that matched everything.
    4. An offset past the end returns an empty `data` list (this one is well behaved) —
       page against `meta.totalCount`, which is exact.
    """
    params.setdefault("limit", 500)
    out = []
    while True:
        q = urllib.parse.urlencode({**params, "offset": len(out)})
        payload = get_json(f"{url}?{q}")
        out += payload["data"]
        meta = payload["meta"]
        if len(out) >= meta["totalCount"] or not payload["data"]:
            return out, meta


screens, meta = page_all(f"{API}/screens/")
projects, _ = page_all(f"{API}/projects/")
print("screens :", len(screens), "| projects:", len(projects), "| maxLimit:", meta["maxLimit"])
print("no-op filter returns:", len(page_all(f"{API}/screens/", name="idr0001")[0]), "screens")
print("keys on a screen:", sorted(screens[0]))

# The paging actually paging: idr0088 is the screen that needs it.
big, big_meta = page_all(f"{API}/screens/2651/plates/", limit=400)
print("idr0088 plates  :", len(big), "unique", len({p["@id"] for p in big}),
      "| declared", big_meta["totalCount"], "| page size", big_meta["limit"])
```

Printed 2026-08-27:

```
screens : 105 | projects: 147 | maxLimit: 1000
no-op filter returns: 105 screens
keys on a screen: ['@id', '@type', 'Description', 'Name', 'omero:details', 'url:plates', 'url:screen']
idr0088 plates  : 1199 unique 1199 | declared 1199 | page size 400
```

Note `@id`, not `id`. Every OMERO object in this API is JSON-LD-flavoured — the identifier
is `@id`, the class is `@type`, and `omero:details` is a large nested ownership block that
is identical on every public object and is safe to discard.

## Resolving a published accession

There is no accession field and no accession endpoint. The accession lives at the front of
the container `Name`, in the form `idr0021-lawo-pericentriolarmaterial/experimentA`, and
resolving one means listing every container once and matching the prefix. That is two
requests, so build the index and keep it.

`?childCount=true` adds `omero:childCount` to each record, which is what separates a real
container from an empty one in the same two requests.

```python
import collections, re

ACCESSION = re.compile(r"^(idr\d{4})-")


def container_index():
    """Every IDR container, grouped by accession, in the API's own order."""
    index = collections.defaultdict(list)
    for kind, child in (("screens", "plates"), ("projects", "datasets")):
        items, _ = page_all(f"{API}/{kind}/", childCount="true")
        for it in items:
            index[ACCESSION.match(it["Name"]).group(1)].append({
                "kind": kind[:-1],                    # "screen" or "project"
                "id": it["@id"],
                "name": it["Name"],
                "children": it["omero:childCount"],
                "child_url": it[f"url:{child}"],
            })
    return dict(index)


IDX = container_index()

print("accessions:", len(IDX), "| containers:", sum(len(v) for v in IDX.values()))
empty = [c for v in IDX.values() for c in v if c["children"] == 0]
print("empty containers:", len(empty))

for acc in ("idr0021", "idr0022", "idr0097"):
    print(f"\n{acc}")
    for c in IDX[acc]:
        print(f"  {c['kind']:8s} {c['id']:5d}  {c['name']:48s} children={c['children']}")
```

Printed 2026-08-27:

```
accessions: 143 | containers: 252
empty containers: 32

idr0021
  project     51  idr0021-lawo-pericentriolarmaterial/experimentA  children=10

idr0022
  screen    2201  idr0022-koedoot-cellmigration                    children=0
  screen    2151  idr0022-koedoot-cellmigration/screenA            children=524
  screen    2152  idr0022-koedoot-cellmigration/screenB            children=152

idr0097
  screen    2801  idr0097-reicher-proteintag/screenA               children=8
  project   1601  idr0097-reicher-proteintag                       children=0
  project   1602  idr0097-reicher-proteintag/experimentB           children=2
  project   1603  idr0097-reicher-proteintag/experimentC           children=3
```

Three things in that output are the whole reason this section exists.

- **An accession is not one container.** 143 accessions across 252 containers, and
  `idr0156` alone has eight. Taking `[0]` gets one arm of a multi-arm study.
- **32 containers are empty umbrellas**, and the rule is exact across all 252 — a `Name`
  with no `/screenX` or `/experimentX` suffix has zero children, and every suffixed name
  has at least one. Worse, the API returns `idr0022`'s empty umbrella *first*, so "the
  first container matching the accession" is the one that yields nothing. Umbrellas still
  carry the study's map annotations, which is why they look real.
- **One accession can be a screen *and* a project.** `idr0097` is exactly that, and it is
  the only one as of 2026-08-27. Branch on `kind` per container, never per study.

## Study metadata, and the licence you actually have

Study-level metadata is not on the container record. It is a *map annotation* attached to
it, and the endpoint is under `/webclient/`, not under `/api/v0/`:

```
https://idr.openmicroscopy.org/webclient/api/annotations/?type=map&screen={id}
https://idr.openmicroscopy.org/webclient/api/annotations/?type=map&project={id}
```

The parameter name is the container type, and there is no generic one. **Screens and
projects number independently, so the same integer names two different studies** — screen
51 is `idr0003-breker-plasticity/screenA` and project 51 is
`idr0021-lawo-pericentriolarmaterial/experimentA`. Asking with the wrong parameter name
does not fail; it returns another study's metadata, with a licence that is plausible and
wrong (`CC BY-NC-SA 3.0` against `CC BY 4.0` for that pair). The response carries
`link.parent.name`, which is what lets you check you got the study you asked for. An id
that exists nowhere answers 200 with no annotations; a non-numeric id answers **500**.

**Read the `License` key before you use anything.** "IDR is open" is true of the archive
and not of every study in it. Each submission carries its own terms: 16 of the 252
containers are non-commercial or share-alike, and two state no licence at all.

```python
def study_info(container):
    """The study/info map annotation. `values` is a list of [key, value] PAIRS, not an
    object — dict() it. A container can carry several map annotations under different
    namespaces, so match the namespace rather than taking the first.

    Verify `link.parent.name` against the container you asked about: screen ids and
    project ids share a number space, so `?screen=` with a project's id silently returns
    a different study."""
    url = (f"https://idr.openmicroscopy.org/webclient/api/annotations/"
           f"?type=map&{container['kind']}={container['id']}")
    for ann in get_json(url)["annotations"]:
        if ann["ns"] != "idr.openmicroscopy.org/study/info":
            continue
        got = ann["link"]["parent"]["name"]
        if got != container["name"]:
            raise RuntimeError(f"asked for {container['name']}, got {got}")
        return dict(ann["values"])
    return {}


def licence_of(container):
    """Returns None when the study states no licence at all. Two containers do, and
    silence grants nothing — treat it as 'ask the submitter', not as 'open'."""
    return study_info(container).get("License")


for acc in ("idr0013", "idr0021", "idr0025", "idr0012", "idr0032"):
    for c in IDX[acc]:
        if c["children"]:
            info = study_info(c)
            print(f"{c['name']:46s} {str(licence_of(c)).split(' http')[0]:16s} "
                  f"{info.get('PubMed ID', '-').split()[0]:9s} {info.get('Organism', '-')}")

census = collections.Counter()
for containers in IDX.values():
    for c in containers:
        census[str(licence_of(c)).split(" http")[0]] += 1
print()
for lic, n in census.most_common():
    print(f"  {n:4d}  {lic}")
```

Printed 2026-08-27 — the per-study lines are stable, the census moves as studies are
released:

```
idr0013-neumann-mitocheck/screenA              CC0 1.0          20360735  Homo sapiens
idr0013-neumann-mitocheck/screenB              CC0 1.0          20360735  Homo sapiens
idr0021-lawo-pericentriolarmaterial/experimentA CC BY 4.0        23086237  Homo sapiens
idr0025-stadler-proteinatlas/screenA           CC BY-SA 3.0     22361696  Homo sapiens
idr0012-fuchs-cellmorph/screenA                CC BY-NC-ND 4.0  20531400  Homo sapiens
idr0032-yang-meristem/experimentA              None             27212401  Arabidopsis thaliana

   223  CC BY 4.0
    11  CC0 1.0
     9  CC BY-NC-SA 3.0
     3  CC BY-NC 4.0
     2  CC BY-NC-ND 4.0
     2  CC BY-SA 3.0
     2  None
```

Sixteen containers are not usable on CC-BY-equivalent terms, and they are named here so a
triage step can flag them without re-running the census. All confirmed 2026-08-27:

| licence | containers |
|---|---|
| CC BY-NC-SA 3.0 | `idr0003-breker-plasticity/screenA`, `idr0004-thorpe-rad52/screenA`, `idr0005-toret-adhesion/screenA`, `idr0005-toret-adhesion/screenB`, `idr0006-fong-nuclearbodies/screenA`, `idr0007-srikumar-sumo/screenA`, `idr0008-rohn-actinome/screenA`, `idr0008-rohn-actinome/screenB`, `idr0053-faas-virtualnanoscopy/experimentA` |
| CC BY-NC 4.0 | `idr0048-abdeladim-chroms/experimentA`, `idr0069-caldera-perturbome/screenA`, `idr0088-cox-phenomicprofiling/screenA` |
| CC BY-NC-ND 4.0 | `idr0012-fuchs-cellmorph/screenA`, `idr0017-breinig-drugscreen/screenA` |
| CC BY-SA 3.0 | `idr0025-stadler-proteinatlas/screenA`, `idr0043-uhlen-humanproteinatlas/experimentA` |
| none stated | `idr0112-verzat-motorneurons/screenA`, `idr0032-yang-meristem/experimentA` |

Non-commercial terms bind *use*, not redistribution, so a lab working commercially cannot
put `idr0088` through a pipeline at all — and `idr0048` is one of the twenty studies
converted to OME-Zarr, so being easy to fetch says nothing about being free to use. The
two with no licence are the strictest case: nothing was granted, so ask the submitter.

The other keys on that annotation are the study's citation trail, and they are worth
carrying into any manifest: `Publication Title`, `Publication Authors`, `PubMed ID`,
`Publication DOI`, `Data DOI`, `Release Date`, `Copyright`, `Organism`, `Imaging Method`,
`Study Type`, `Screen Type`, `Screen Technology Type`, and `Annotation File` — a link to
the submitter's own comma-separated annotation table on GitHub, whose header carries the
per-image `Characteristics [...]` and `Experimental Condition [...]` columns behind the map
annotations. `Release Date` is on all 252 containers; `Publication Title`,
`Publication Authors` and `Copyright` on 251; `License` on 250; `Publication DOI` on 211;
`PubMed ID` on 207; a `BioStudies Accession` cross-reference on 29.

## Walking a screen — plates, wells, fields

```python
def plate_wells(plate_id):
    plate = get_json(f"{API}/plates/{plate_id}/")["data"]
    wells, _ = page_all(f"{API}/plates/{plate_id}/wells/")
    return plate, wells


def fields_of(well):
    """A well that was never imaged has NO `WellSamples` KEY — not an empty list, the key
    is absent. On `idr0088` plate 8958, 136 of 384 wells are like that, so `well["WellSamples"]`
    raises KeyError a third of the way through the plate."""
    return well.get("WellSamples") or []


def well_label(plate, well):
    """`Row` and `Column` are ZERO-BASED integers, and the well LABEL is neither of them.
    A1 is Row 0, Column 0.

    `RowNamingConvention` / `ColumnNamingConvention` should settle this and usually
    cannot: both were null on 50 of the 91 screens sampled on 2026-08-27, they are
    sometimes ABSENT from the plate record rather than null — `plate["RowNamingConvention"]`
    raises KeyError on `idr0088` plate 8958 — and they vary between plates of one screen
    (`idr0128` screenC plate 9733 declares them, screenB plate 9735 does not).

    So use .get() with OMERO's default of letter rows and 1-based numeric columns, and
    cross-check against the image name, which carries the label the submitter used."""
    row_conv = plate.get("RowNamingConvention") or "letter"
    col_conv = plate.get("ColumnNamingConvention") or "number"
    row = chr(ord("A") + well["Row"]) if row_conv == "letter" else str(well["Row"] + 1)
    col = str(well["Column"] + 1) if col_conv == "number" else chr(ord("A") + well["Column"])
    return f"{row}{col}"


screen = [c for c in IDX["idr0001"] if c["children"]][0]
plates, _ = page_all(screen["child_url"])
plate, wells = plate_wells(plates[0]["@id"])

print(f"{screen['name']}  ->  {len(plates)} plates")
print(f"plate {plate['@id']} {plate['Name']}  {plate['Rows']}x{plate['Columns']} "
      f"conventions=({plate.get('RowNamingConvention')}, {plate.get('ColumnNamingConvention')})")
print("wells:", len(wells))

w = wells[0]
fields = fields_of(w)
print(f"well {w['@id']} Row={w['Row']} Column={w['Column']} -> label {well_label(plate, w)}")
print(f"  fields in this well: {len(fields)}")
print(f"  first image: @id {fields[0]['Image']['@id']}  {fields[0]['Image']['Name']}")
print(f"  images on this plate: {sum(len(fields_of(x)) for x in wells)}")

# Counter-example: a partly imaged plate from a 1,199-plate screen.
cx_plate, cx_wells = plate_wells(8958)
print(f"\nidr0088 plate {cx_plate['@id']} {cx_plate['Name']} "
      f"{cx_plate['Rows']}x{cx_plate['Columns']} "
      f"conventions={'RowNamingConvention' in cx_plate}")
print(f"  wells: {len(cx_wells)} | without a WellSamples key: "
      f"{sum(1 for x in cx_wells if 'WellSamples' not in x)}")
print(f"  fields per well: {sorted({len(fields_of(x)) for x in cx_wells})} "
      f"| images: {sum(len(fields_of(x)) for x in cx_wells)} of a full "
      f"{cx_plate['Rows'] * cx_plate['Columns'] * 3}")
```

Printed 2026-08-27:

```
idr0001-graml-sysgro/screenA  ->  192 plates
plate 2551 JL_120731_S6A  8x12 conventions=(letter, number)
wells: 96
well 590809 Row=0 Column=0 -> label A1
  fields in this well: 6
  first image: @id 1229801  JL_120731_S6A [Well A-1; Field #1]
  images on this plate: 576

idr0088 plate 8958 1013608204 16x24 conventions=False
  wells: 384 | without a WellSamples key: 136
  fields per well: [0, 3] | images: 744 of a full 1152
```

Plate geometry is not standard and should never be assumed. Across 91 screens sampled on
2026-08-27 the first plate was 16×24 in 53 cases and 8×12 in 18, with the remainder
spanning 6×8, 16×21, 15×23, 12×32, 22×18, 7×17, 8×23, 16×3, 6×11, 4×6, 7×9 and 4×4. Read
`Rows` and `Columns` rather than inferring a 96- or 384-well layout. `Rows × Columns` did
equal the well count on all 12 plates checked, so the well grid is dense.

**The image count is not.** That is the `idr0088` counter-example, and it is the shape of
the mistake this section guards against: the naming-convention keys are absent rather than
null, 136 of 384 wells carry no `WellSamples` key at all, and the plate holds 744 images
where `Rows × Columns × fields` predicts 1,152. Code reading `well["WellSamples"]` crashes
a third of the way in; code multiplying the geometry out reports 55% more data than exists.

Screens are large. Those 105 screens hold 6,779 plates between them, `idr0088` alone has
1,199, and 22,028 plates and datasets hang off the 252 containers. Enumerate the plate
list first, then decide what to descend into.

## Walking a project — datasets, images

```python
project = [c for c in IDX["idr0021"] if c["children"]][0]
datasets, _ = page_all(project["child_url"])
images, meta = page_all(f"{API}/datasets/{datasets[0]['@id']}/images/")

print(f"{project['name']}  ->  {len(datasets)} datasets")
print("dataset names:", [d["Name"] for d in datasets])
print(f"dataset {datasets[0]['@id']} {datasets[0]['Name']}: {meta['totalCount']} images")
print("first image:", images[0]["@id"], images[0]["Name"])
```

Printed 2026-08-27:

```
idr0021-lawo-pericentriolarmaterial/experimentA  ->  10 datasets
dataset names: ['CDK5RAP2-C', 'CENT2', 'CEP120/20111106', 'CEP120/20111209', 'CEP152', 'CEP192-M', 'CPAP', 'NEDD1-C1', 'PCNT-N1', 'TUBG1-N']
dataset 51 CDK5RAP2-C: 33 images
first image: 1884807 Centrin_PCNT_Cep215_20110506_Fri-1545_0_SIR_PRJ.dv
```

A dataset `Name` can itself contain a `/` — `CEP120/20111106` above — so it is not safe as
a directory name without sanitising, and it does not correspond to a nested container.

## Pixel dimensions, channels and physical size

Fetch these from `/api/v0/m/images/{id}/`. The `Pixels` block carries everything a
downstream measurement needs, including the physical pixel size in micrometres, which is
what makes an area in this dataset comparable with an area in any other.

```python
def image_meta(image_id):
    """`Size*` and `Type` are always present. `PhysicalSizeX` and a channel's `Name` are
    both OPTIONAL KEYS, absent rather than null when the submitter did not supply them —
    `c["Name"]` raises KeyError on idr0154's whole-slide histology, and
    `px["PhysicalSizeX"]` raises on that and on idr0047."""
    px = get_json(f"{API}/images/{image_id}/")["data"]["Pixels"]
    size = px.get("PhysicalSizeX")
    return {
        "shape": {k: px[f"Size{k}"] for k in "XYZCT"},
        "dtype": px["Type"]["value"],
        "channels": [c.get("Name") for c in px["Channels"]],
        "pixel_um": round(size["Value"], 5) if size else None,
        "pixel_unit": size["Symbol"] if size else None,
    }


for iid in (1884807, 1229801, 15148767):
    print(iid, image_meta(iid))

# Counter-example. /webgateway/imgData/ is the endpoint most OMERO tutorials reach for,
# and during the OME-Zarr migration it answers 200 while returning no dimensions at all.
img_data = get_json("https://idr.openmicroscopy.org/webgateway/imgData/1884807/")
print("\nimgData keys :", sorted(img_data))
print("imgData size :", img_data.get("size"), "| pixel_size:", img_data.get("pixel_size"))
print("imgData error:", img_data.get("Exception", "")[:52])
```

Printed 2026-08-27:

```
1884807 {'shape': {'X': 256, 'Y': 256, 'Z': 1, 'C': 3, 'T': 1}, 'dtype': 'float', 'channels': ['CENT2', 'PCNT', 'CDK5RAP2-C'], 'pixel_um': 0.0396, 'pixel_unit': 'µm'}
1229801 {'shape': {'X': 1376, 'Y': 1040, 'Z': 16, 'C': 2, 'T': 1}, 'dtype': 'uint16', 'channels': ['GFP', 'Cascade blue'], 'pixel_um': 0.1077, 'pixel_unit': 'µm'}
15148767 {'shape': {'X': 24320, 'Y': 24288, 'Z': 1, 'C': 3, 'T': 1}, 'dtype': 'uint8', 'channels': [None, None, None], 'pixel_um': None, 'pixel_unit': None}

imgData keys : ['Exception', 'id', 'meta', 'perms']
imgData size : None | pixel_size: None
imgData error: Error instantiating pixel buffer: /OMERO/ManagedRepo
```

`imgData` returning `Exception` alongside HTTP 200 is the shape of this trap: a
`response.raise_for_status()` passes, `data["size"]["width"]` raises `KeyError`, and the
obvious conclusion — that the image is broken — is wrong. Use `/api/v0/m/images/{id}/`.

The third line is the reason `image_meta` uses `.get()`. Image 15148767 is a 24,320 ×
24,288 whole-slide histology scan from `idr0154` with no physical pixel size and no channel
names at all — an area computed from it is in pixels and comparable to nothing. Check for
`None` before converting units rather than after.

Where channel names exist, the submitter's own description is often richer than the
acquisition name: `idr0001` labels its two channels `GFP` and `Cascade blue` in `Pixels`,
and `GFP:endogenous alpha tubulin 2;Cascade blue:growth media` in the bulk annotation read
in the next section.

## Per-image and per-well annotations

This is what makes IDR more than a file store: the submitter's annotation table is attached
to each image or well as map annotations, one per namespace.

```python
def map_annotations(kind, obj_id):
    """kind is 'image', 'well', 'plate', 'dataset', 'screen' or 'project'.
    Returns {namespace: {key: value}}. Namespaces do NOT merge cleanly — the same key
    can appear under two of them with different values."""
    url = (f"https://idr.openmicroscopy.org/webclient/api/annotations/"
           f"?type=map&{kind}={obj_id}")
    return {a["ns"]: dict(a["values"]) for a in get_json(url)["annotations"]}


for ns, kv in map_annotations("image", 1884807).items():
    print(f"{ns}\n    {kv}")

print("\nfor a screen the annotation is on the WELL, not the image:")
print("   ", sorted(map_annotations("well", 590809)))
print("    image 1229801 namespaces:", sorted(map_annotations("image", 1229801)))
```

Printed 2026-08-27:

```
openmicroscopy.org/mapr/cell_line
    {'Cell Line': 'HeLa'}
openmicroscopy.org/mapr/gene
    {'Gene Identifier': 'ENSG00000136861', 'Gene Identifier URL': 'http://www.ensembl.org/id/ENSG00000136861', 'Gene Symbol': 'CDK5RAP2'}
openmicroscopy.org/mapr/gene/supplementary
    {'Gene Symbol Synonyms': 'CEP215', 'Gene Annotation Comments': 'Gene identifiers and symbols from GRCh38.p5, Ensembl release 84, Mar 2016. Added by IDR curators.', 'Antibody Target': 'CDK5RAP2-C', 'Targeted Protein': 'CDK5RAP2', 'Targeted Protein URL': 'http://www.ebi.ac.uk/pdbe/entry/search/index?text:CDK5RAP2'}
openmicroscopy.org/mapr/organism
    {'Organism': 'Homo sapiens'}
openmicroscopy.org/mapr/phenotype
    {'Phenotype': 'protein localized to centrosome', 'Phenotype Term Name': 'protein localized in centrosome phenotype', 'Phenotype Term Accession': 'CMPO_0000425', 'Phenotype Term Accession URL': 'http://www.ebi.ac.uk/cmpo/CMPO_0000425'}
openmicroscopy.org/omero/bulk_annotations
    {'Cell Cycle Phase': 'interphase', 'Channels': '442:CENT2; 525:PCNT; 615:CDK5RAP2-C', 'Has Phenotype': 'yes', 'Phenotype Annotation Level': 'protein'}

for a screen the annotation is on the WELL, not the image:
    ['openmicroscopy.org/mapr/gene', 'openmicroscopy.org/mapr/organism', 'openmicroscopy.org/mapr/phenotype', 'openmicroscopy.org/omero/bulk_annotations']
    image 1229801 namespaces: ['openmicroscopy.org/mapr/gene', 'openmicroscopy.org/mapr/organism', 'openmicroscopy.org/mapr/phenotype', 'openmicroscopy.org/omero/bulk_annotations']
```

Two things about that. Phenotypes are ontology-backed — `CMPO_0000425` is a Cellular
Microscopy Phenotype Ontology term, so phenotype calls are comparable across studies in a
way free text would not be. And `Gene Symbol` is legitimately empty on organisms whose
genes are named by systematic identifier: `idr0001` records
`Gene Identifier: SPAC27E2.03c` with `Gene Symbol: ''`, so keying a join on the symbol
drops a whole yeast screen.

## Regions of interest

Where the submitter deposited segmentations, they are ROIs on the image, and they are the
reason IDR pairs well with a segmentation workflow — a published mask to validate against.

```python
rois, roi_meta = page_all(f"{API}/images/1229801/rois/", limit=50)
shape = rois[0]["shapes"][0]
print("rois on 1229801:", roi_meta["totalCount"])
print("shape type     :", shape["@type"].rsplit("#", 1)[1])
print("points field   :", shape["Points"][:44], "...")
print("vertices       :", len(shape["Points"].split()))
print("rois on 1884807:", page_all(f"{API}/images/1884807/rois/")[1]["totalCount"])
```

Printed 2026-08-27:

```
rois on 1229801: 36
shape type     : Polygon
points field   : 1247,760 1247,761 1247,762 1247,763 1247,764 ...
vertices       : 248
rois on 1884807: 0
```

`Points` is a single space-separated `x,y` string, in pixel coordinates on the full-size
image — multiply by `PhysicalSizeX` to get micrometres, and rescale if you are working
from a pyramid level other than 0. Most images have no ROIs; a count of 0 is the normal
case, not a failure.

## Finding studies by gene, compound or organism

The `/mapr/api/…` endpoints that older IDR tutorials use are gone — `/mapr/api/gene/` now
302s to the search engine's Swagger page, which a JSON client will happily parse as an
error. The current surface is the search engine:

```python
SEARCH = "https://idr.openmicroscopy.org/searchengine/api/v1/resources"


def search(key, value, resource="image"):
    """`size` is the true hit count; a page holds at most 1000 results and
    `pagination.total_pages` says how many there are. A query on a common value returns
    a page, not the answer — `Organism = Homo sapiens` is 13,337,611 hits over 13,338
    pages, so aggregate from `size` and never from `len(results)`."""
    q = urllib.parse.urlencode({"key": key, "value": value, "case_sensitive": "false"})
    return get_json(f"{SEARCH}/{resource}/search/?{q}")["results"]


res = search("Gene Symbol", "CDK5RAP2")
print("hits:", res["size"], "| pages:", res["pagination"]["total_pages"],
      "| returned here:", len(res["results"]))
for name, n in collections.Counter(
        h["screen_name"] or h["project_name"] for h in res["results"]).most_common():
    print(f"  {n:5d}  {name}")

keys = get_json(f"{SEARCH}/image/keys/")[0]["image"]
print("searchable image keys:", len(keys), "->", keys[:6])
print("Homo sapiens hits:", search("Organism", "Homo sapiens")["size"])
```

Printed 2026-08-27:

```
hits: 701 | pages: 1 | returned here: 701
    509  idr0043-uhlen-humanproteinatlas/experimentA
    120  idr0020-barr-chtog/screenA
     33  idr0021-lawo-pericentriolarmaterial/experimentA
     12  idr0009-simpson-secretion/screenA
      9  idr0093-mueller-perturbation/screenA
      8  idr0013-neumann-mitocheck/screenB
      6  idr0013-neumann-mitocheck/screenA
      2  idr0012-fuchs-cellmorph/screenA
      2  idr0010-doil-dnadamage/screenA
searchable image keys: 675 -> ['Organism', 'Gene Identifier URL', 'Gene Identifier', 'Gene Symbol', 'Cell Line', 'Organism Part']
Homo sapiens hits: 13337611
```

Every hit names the screen or project it came from, so this is the reverse index into the
container hierarchy — search for a gene, get back study accessions to walk. `screen_name`
and `project_name` are both present on every hit and exactly one is populated. Note what
the counts say: one gene reaches nine studies, and the largest contributor is
`idr0043-uhlen-humanproteinatlas`, which is CC BY-SA 3.0 — so the licence check belongs
between the search and the download, not after it.

The key vocabulary is study-supplied and therefore long — 675 searchable image keys, most
of them specific to one submission. `/searchengine/api/v1/resources/image/keys/` is the
authoritative list; guessing a key name returns zero hits rather than an error.

## Cheap visual triage

Before descending into a study, look at it. The cached thumbnail store is the one pixel
route still serving during the migration, and it costs one to five kilobytes — 12 images
sampled at random from 12 different projects on 2026-08-27 all returned a JPEG, between
1,025 and 4,637 bytes.

```python
def thumbnail(image_id, dest):
    """`/webgateway/render_thumbnail/{id}/` returns a 96x96 JPEG.

    Do NOT append a size: `/render_thumbnail/{id}/64/` 404s with a 1561-byte HTML page,
    and `curl -o out.jpg` without -f writes that page into out.jpg and exits 0. The
    ?w= and ?h= parameters are ignored, like every unrecognised parameter here.

    Full-resolution rendering is not available at all — /render_image/ and
    /render_image_region/ are 403 at the proxy for every image, converted or not."""
    url = f"https://idr.openmicroscopy.org/webgateway/render_thumbnail/{image_id}/"
    with urllib.request.urlopen(url, timeout=60) as r:
        body = r.read()
        if not body.startswith(b"\xff\xd8"):
            raise RuntimeError(f"{image_id}: not a JPEG — got {body[:16]!r}")
        open(dest, "wb").write(body)
        return r.status, len(body)


print("thumbnail 1884807 ->", thumbnail(1884807, "idr0021_1884807.jpg"))

for path in ("render_thumbnail/1884807/64/", "render_image/1884807/0/0/",
             "archived_files/download/1884807/"):
    try:
        with urllib.request.urlopen(f"https://idr.openmicroscopy.org/webgateway/{path}",
                                    timeout=60) as r:
            print(f"{path:36s} -> {r.status} {r.headers.get('content-type')} "
                  f"{len(r.read())} bytes at {urllib.parse.urlparse(r.url).path}")
    except urllib.error.HTTPError as e:
        print(f"{path:36s} -> {e.code} {e.headers.get('content-type')} "
              f"{len(e.read())} bytes")
```

Printed 2026-08-27:

```
thumbnail 1884807 -> (200, 879)
render_thumbnail/1884807/64/         -> 404 text/html; charset=utf-8 1561 bytes
render_image/1884807/0/0/            -> 403 None 0 bytes
archived_files/download/1884807/     -> 200 text/html; charset=utf-8 148580 bytes at /webclient/
```

The last line is the dangerous one. Asking for the original acquisition file follows a
redirect to the login page, which redirects again into the public webclient, and the
request *succeeds* — 148 KB of HTML that a downloader writes into `image.dv` and reports
as done. Check the content type, or check the first bytes, on anything you fetch from
`/webgateway/`.

## Get the files

Two routes, and which one you need depends on the study. Both are anonymous.

**OME-Zarr on the EMBL-EBI Embassy object store** is the programmatic route: array access,
a resolution pyramid, no whole-image download. It covers the converted studies only —
twenty of them on 2026-08-27. Reading it needs one package:

```bash
pip install "zarr>=3" fsspec aiohttp numpy
```

The store is a plain S3 bucket with anonymous list and get, so discover the paths rather
than constructing them. A screen's zarr is keyed by **plate** id; a project's by **image**
id; and the study prefix carries the container suffix letter (`idr0062A`, `idr0128E`) or,
for the newest submissions, no letter at all (`idr0154`, `idr0157`).

```python
import os, re, warnings, xml.etree.ElementTree as ET

warnings.simplefilter("ignore")
S3 = "https://uk1s3.embassy.ebi.ac.uk/idr"
NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}


def s3_prefixes(prefix):
    """Anonymous ListObjectsV2. Paginates on NextContinuationToken; a listing that stops
    at the first response silently truncates at 1000 keys."""
    out, token = [], None
    while True:
        q = {"list-type": "2", "prefix": prefix, "delimiter": "/", "max-keys": "1000"}
        if token:
            q["continuation-token"] = token
        with urllib.request.urlopen(f"{S3}?{urllib.parse.urlencode(q)}", timeout=90) as r:
            root = ET.fromstring(r.read())
        out += [p.findtext("s3:Prefix", namespaces=NS)
                for p in root.findall("s3:CommonPrefixes", NS)]
        token = root.findtext("s3:NextContinuationToken", namespaces=NS)
        if not token:
            return out


studies = [p.rstrip("/").rsplit("/", 1)[1] for p in s3_prefixes("zarr/v0.4/")]
print("studies converted to OME-Zarr:", len(studies))
print(studies)
print("under idr0062A:", [p.rsplit("/", 2)[1] for p in s3_prefixes("zarr/v0.4/idr0062A/")][:4])
```

Printed 2026-08-27:

```
studies converted to OME-Zarr: 20
['idr0001A', 'idr0013A', 'idr0044A', 'idr0047A', 'idr0048A', 'idr0050A', 'idr0052A', 'idr0054A', 'idr0056B', 'idr0062A', 'idr0072B', 'idr0073A', 'idr0076A', 'idr0079A', 'idr0083A', 'idr0101A', 'idr0128E', 'idr0138A', 'idr0154', 'idr0157']
under idr0062A: ['6001240.zarr', '6001240_ngff-zarr.ome.zarr', '6001247.zarr']
```

Now read one. The three traps in this block are what cost the most time:

```python
import numpy as np, zarr

ZARR = f"{S3}/zarr/v0.4/idr0062A/6001240.zarr"

# Trap 1: these are zarr v2 stores. zarr 3 defaults to zarr_format 3 and opens the group
# without error, so the failure surfaces later as an empty group.
attrs = get_json(f"{ZARR}/.zattrs")
multiscale = attrs["multiscales"][0]

# Trap 2: the axis order is NOT always TCZYX. This image is CZYX -- four axes. Read the
# order off `multiscales[0].axes` and index by name, or a channel selection slices Z.
axes = [a["name"] for a in multiscale["axes"]]
levels = [d["path"] for d in multiscale["datasets"]]

group = zarr.open_group(ZARR, mode="r", zarr_format=2)
# Trap 3: over plain HTTP, fsspec cannot list the store, so group.array_keys() is EMPTY
# even though every array opens by name. The level paths come from `multiscales`.
print("array_keys() over http:", list(group.array_keys()))
print("axes:", axes, "| levels:", levels)
print("channels:", [c["label"] for c in attrs["omero"]["channels"]])

lowest = group[levels[-1]]
print("lowest level:", lowest.shape, lowest.dtype, "chunks", lowest.chunks)

# Index by axis NAME. Hard-coding [0] happens to select a channel here and would select
# a timepoint on a TCZYX study.
selector = tuple(0 if a == "c" else slice(None) for a in axes)
plane = np.asarray(lowest[selector])
np.save("idr0062_6001240_level2_c0.npy", plane)
print("saved plane:", plane.shape, plane.dtype,
      "min", int(plane.min()), "max", int(plane.max()), "mean", round(float(plane.mean()), 2))
```

Printed 2026-08-27:

```
array_keys() over http: []
axes: ['c', 'z', 'y', 'x'] | levels: ['0', '1', '2']
channels: ['LaminB1', 'Dapi']
lowest level: (2, 236, 68, 67) uint16 chunks (1, 1, 68, 67)
saved plane: (236, 68, 67) uint16 min 5 max 4095 mean 66.67
```

**The EMBL-EBI mirror over HTTPS** is the route for everything else, and it is the
submitter's original directory tree rather than the OMERO hierarchy — there is no API field
giving the mirror path of an image, so this is a directory walk plus a filename match, not
a lookup.

```python
import datetime

FTP = "https://ftp.ebi.ac.uk/pub/databases/IDR"


def mirror_listing(path=""):
    with urllib.request.urlopen(f"{FTP}/{path}", timeout=90) as r:
        html = r.read().decode()
    return [h for h in re.findall(r'<a href="([^"?/][^"]*)"', html)]


mirror = {d.rstrip("/") for d in mirror_listing() if d.endswith("/")}
stems = {c["name"].split("/")[0] for v in IDX.values() for c in v}
print("directories on the mirror:", len(mirror))
print("study stems with no mirror directory:", sorted(stems - mirror))
print("mirror directories with no container:", sorted(mirror - stems))
print("idr0021 tree:", mirror_listing("idr0021-lawo-pericentriolarmaterial/"))
```

Printed 2026-08-27:

```
directories on the mirror: 138
study stems with no mirror directory: ['idr0047-neuert-yeastmrna', 'idr0151-clark-patterning', 'idr0167-li-cellcyclenet', 'idr0168-zhang-mllocalization', 'idr0170-rose-mibitof', 'idr0171-kuzikov-remedi4all', 'idr0173-breiter-alphasynuclein']
mirror directories with no container: ['idr0047-neuert-yeastmRNA', 'idr0162-kudo-perturbview']
idr0021 tree: ['20160411-original/', 'Raw-files/']
```

Six of those seven are genuinely unmirrored — recent submissions. The seventh is a case
mismatch: the container is named `idr0047-neuert-yeastmrna` and the directory is
`idr0047-neuert-yeastmRNA`. **The mirror path is not the container name lowercased and it
is not the container name verbatim** — list the mirror root once and match
case-insensitively. `idr0162-kudo-perturbview` is the reverse: files on the mirror with no
container in the API.

Finish with a manifest, because a directory of TIFFs with no record of which study,
which licence and which release it came from cannot be cited or re-fetched.

```python
def harvest(accession, out_dir=None):
    """Writes what was fetched, what it was fetched from, and the terms it carries."""
    out_dir = out_dir or f"Data/idr/{accession}"
    os.makedirs(out_dir, exist_ok=True)
    entries = []
    for c in IDX[accession]:
        if not c["children"]:
            continue                     # empty umbrella container
        info = study_info(c)
        entries.append({
            "container": c["name"], "kind": c["kind"], "id": c["id"],
            "children": c["children"],
            "license": info.get("License"),
            "copyright": info.get("Copyright"),
            "publication_doi": info.get("Publication DOI"),
            "data_doi": info.get("Data DOI"),
            "pubmed": info.get("PubMed ID"),
            "release_date": info.get("Release Date"),
            "annotation_table": info.get("Annotation File"),
            "mirror": next((f"{FTP}/{d}" for d in mirror
                            if d.lower() == c["name"].split("/")[0].lower()), None),
        })
    unlicensed = [e["container"] for e in entries if not e["license"]]
    manifest = {"accession": accession,
                "retrieved": datetime.date.today().isoformat(),
                "source": "https://idr.openmicroscopy.org/", "containers": entries,
                "containers_without_stated_license": unlicensed}
    path = os.path.join(out_dir, "manifest.json")
    json.dump(manifest, open(path, "w"), indent=2)
    return path, manifest


path, manifest = harvest("idr0021")
print(path)
print(json.dumps(manifest["containers"][0], indent=2))
```

Printed 2026-08-27:

```
Data/idr/idr0021/manifest.json
{
  "container": "idr0021-lawo-pericentriolarmaterial/experimentA",
  "kind": "project",
  "id": 51,
  "children": 10,
  "license": "CC BY 4.0 https://creativecommons.org/licenses/by/4.0/",
  "copyright": "Lawo et al",
  "publication_doi": "10.1038/ncb2591 https://doi.org/10.1038/ncb2591",
  "data_doi": null,
  "pubmed": "23086237 https://www.ncbi.nlm.nih.gov/pubmed/23086237",
  "release_date": "2016-05-26",
  "annotation_table": "idr0021-experimentA-annotation.csv https://github.com/IDR/idr0021-lawo-pericentriolarmaterial/blob/HEAD/experimentA/idr0021-experimentA-annotation.csv",
  "mirror": "https://ftp.ebi.ac.uk/pub/databases/IDR/idr0021-lawo-pericentriolarmaterial"
}
```

What ends up on disk is an array per image plane from the zarr route
(`idr0062_6001240_level2_c0.npy` above), or the submitter's original files from the mirror,
plus `manifest.json` recording the container, its licence, its citation and where each file
came from. Keep the manifest with the pixels; the licence is not recoverable from a
directory of TIFFs.

Once the pixels are local, `multiplex-imaging-io` covers opening acquisition formats with
channels and pixel size intact, and `microscopy-quantification` covers segmenting and
measuring them.

## What this does not cover

- **Submitting to IDR.** Deposition goes through the IDR submission process and requires
  OME-Zarr for new studies; nothing here writes.
- **Full-resolution server-side rendering.** It is 403 for everyone during the OME-Zarr
  migration. Render locally from the arrays instead.
- **Original acquisition files by image id.** There is no anonymous route from an image id
  to its `.dv`, `.flex` or `.czi` on the server; the mirror holds the submitter's tree and
  matching into it is by filename.
- **The OMERO Python client (`omero-py`) and the BlitzGateway.** They connect on port 4064,
  which IDR does not expose publicly — the `/api/v0/servers/` route advertises
  `localhost:4064`, which is the server talking about itself.

## Try it

Asserts the *shape* of the API, not just that it answers. A renamed field or restructured
paging fails this while a reachability check still passes. Runs on stdlib alone in an
empty directory, and fetches one 879-byte thumbnail.

**Data** — three public IDR studies, resolved through the public API:

    https://idr.openmicroscopy.org/api/v0/m/projects/51/    (idr0021, CC BY 4.0)
    https://idr.openmicroscopy.org/api/v0/m/images/1884807/ (one image from it)
    https://idr.openmicroscopy.org/webgateway/render_thumbnail/1884807/

`idr0021-lawo-pericentriolarmaterial` (Lawo et al. 2012, PMID 23086237) is 3D-SIM imaging
of centrosomal proteins in HeLa cells, released 2016-05-26 under CC BY 4.0.
`idr0001-graml-sysgro` (PMID 25373780) is a fission-yeast high-content screen, CC BY 4.0,
and is here because it is a *screen* and exercises the plate/well path that the project
path does not. `idr0012-fuchs-cellmorph` is asserted only for its licence — CC BY-NC-ND
4.0 — because the point that IDR's blanket terms are not every study's terms has to be a
test, not a sentence. No account, no key. Last confirmed reachable 2026-08-27.

```python
import collections, json, re, urllib.error, urllib.parse, urllib.request

BASE = "https://idr.openmicroscopy.org"
API = f"{BASE}/api/v0/m"


def j(url, timeout=90):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def page_all(url, **params):
    params.setdefault("limit", 500)
    out = []
    while True:
        q = urllib.parse.urlencode({**params, "offset": len(out)})
        payload = j(f"{url}?{q}")
        out += payload["data"]
        if len(out) >= payload["meta"]["totalCount"] or not payload["data"]:
            return out, payload["meta"]


def annotations(kind, obj_id):
    url = f"{BASE}/webclient/api/annotations/?type=map&{kind}={obj_id}"
    return {a["ns"]: dict(a["values"]) for a in j(url)["annotations"]}


# 1. Envelope. Every list route is {data, meta}, and meta carries an exact totalCount.
first = j(f"{API}/projects/?limit=1")
assert set(first) == {"data", "meta"}, sorted(first)
assert set(first["meta"]) == {"offset", "limit", "maxLimit", "totalCount"}, first["meta"]
assert first["meta"]["maxLimit"] == 1000

# 2. The identifier is @id, not id, and the traversal is url:*.
p = first["data"][0]
assert "@id" in p and "id" not in p, sorted(p)
assert p["@type"].endswith("#Project") and p["url:datasets"].startswith("https://")

# 3. The DEFAULT limit is 200 and a larger limit is CLAMPED, not rejected.
assert j(f"{API}/screens/")["meta"]["limit"] == 200
assert j(f"{API}/screens/?limit=5000")["meta"]["limit"] == 1000

# 4. Unrecognised parameters are IGNORED, so an invented filter matches everything.
n_screens = j(f"{API}/screens/?limit=1")["meta"]["totalCount"]
assert j(f"{API}/screens/?name=idr0001&limit=1")["meta"]["totalCount"] == n_screens

# 4b. Paging really pages — idr0088 declares more plates than one request can return.
big, big_meta = page_all(f"{API}/screens/2651/plates/", limit=400)
assert len(big) == len({p["@id"] for p in big}) == big_meta["totalCount"] > 1000

# 5. Accessions live in the container Name; a container with no /suffix is an empty
#    umbrella, and the API can return it FIRST. Exact across every container.
index = collections.defaultdict(list)
for kind, child in (("screens", "plates"), ("projects", "datasets")):
    items, _ = page_all(f"{API}/{kind}/", childCount="true")
    for it in items:
        index[re.match(r"^(idr\d{4})-", it["Name"]).group(1)].append(
            {"kind": kind[:-1], "id": it["@id"], "name": it["Name"],
             "children": it["omero:childCount"], "child_url": it[f"url:{child}"]})
for containers in index.values():
    for c in containers:
        assert (c["children"] == 0) == ("/" not in c["name"]), c

# 6. One accession spans several containers, and idr0097 spans both KINDS.
assert len(index["idr0097"]) > 1
assert {c["kind"] for c in index["idr0097"]} == {"screen", "project"}
assert index["idr0022"][0]["children"] == 0, "empty umbrella no longer sorts first"

# 7. Per-study licence, on a map annotation under /webclient/, not /api/v0/.
def licence(c):
    return annotations(c["kind"], c["id"]).get(
        "idr.openmicroscopy.org/study/info", {}).get("License")

lawo = [c for c in index["idr0021"] if c["children"]][0]
fuchs = [c for c in index["idr0012"] if c["children"]][0]
assert licence(lawo).startswith("CC BY 4.0")
assert licence(fuchs).startswith("CC BY-NC-ND 4.0"), "IDR is not uniformly CC BY"

# 7b. Screens and projects number independently, so ONE id names two studies and the
#     wrong parameter name returns another study's licence rather than an error.
assert lawo["id"] == 51 and lawo["kind"] == "project"
wrong = licence({"kind": "screen", "id": 51})
assert wrong.startswith("CC BY-NC-SA 3.0") and not wrong.startswith("CC BY 4.0")
parents = {k: [a["link"]["parent"]["name"]
               for a in j(f"{BASE}/webclient/api/annotations/?type=map&{k}=51")["annotations"]
               if a["ns"] == "idr.openmicroscopy.org/study/info"][0]
           for k in ("screen", "project")}
assert parents["screen"] != parents["project"], parents

# 8. Pixel metadata comes from /api/v0/, and imgData answers 200 with nothing usable.
px = j(f"{API}/images/1884807/")["data"]["Pixels"]
assert (px["SizeX"], px["SizeY"], px["SizeC"]) == (256, 256, 3)
assert [c["Name"] for c in px["Channels"]] == ["CENT2", "PCNT", "CDK5RAP2-C"]
assert px["PhysicalSizeX"]["Symbol"] == "µm" and round(px["PhysicalSizeX"]["Value"], 4) == 0.0396
bad = j(f"{BASE}/webgateway/imgData/1884807/")
assert "Exception" in bad and "size" not in bad, "imgData recovered — re-check the skill"

# 9. Screen path: Row/Column are 0-based and are not the well label; a well holds
#    several fields, so wells and images are different counts.
screen = [c for c in index["idr0001"] if c["children"]][0]
plate_meta = j(f"{screen['child_url']}?limit=1")["meta"]
plate = j(f"{API}/plates/2551/")["data"]
wells, _ = page_all(f"{API}/plates/2551/wells/")
w0 = wells[0]
assert (w0["Row"], w0["Column"]) == (0, 0)
assert "[Well A-1; Field #1]" in w0["WellSamples"][0]["Image"]["Name"]
assert len(w0["WellSamples"]) == 6 and len(wells) == 96

# 9b. Counter-examples that broke every step 9 assumption on a different screen.
#     A well that was never imaged has NO WellSamples KEY; the naming-convention keys are
#     absent from the plate record entirely; and the image count is not Rows x Columns x
#     fields. All three on one plate of idr0088.
cx_plate = j(f"{API}/plates/8958/")["data"]
cx_wells, _ = page_all(f"{API}/plates/8958/wells/")
blank = [x for x in cx_wells if "WellSamples" not in x]
cx_images = sum(len(x.get("WellSamples") or []) for x in cx_wells)
assert "RowNamingConvention" not in cx_plate, "the key is absent here, not null"
assert len(blank) == 136 and len(cx_wells) == 384
assert cx_images == 744 < cx_plate["Rows"] * cx_plate["Columns"] * 3

#     ...and the conventions differ between two plates of ONE study, so they cannot be
#     read once per screen.
assert j(f"{API}/plates/9733/")["data"].get("RowNamingConvention") == "letter"
assert j(f"{API}/plates/9735/")["data"].get("RowNamingConvention") is None

# 9c. PhysicalSizeX and a channel's Name are optional KEYS, not null values.
wsi = j(f"{API}/images/15148767/")["data"]["Pixels"]
assert "PhysicalSizeX" not in wsi and all("Name" not in c for c in wsi["Channels"])
assert (wsi["SizeX"], wsi["SizeY"]) == (24320, 24288)

# 10. Annotations are namespaced and `values` is a list of PAIRS, not an object.
raw = j(f"{BASE}/webclient/api/annotations/?type=map&image=1884807")["annotations"]
assert all(isinstance(a["values"], list) for a in raw)
ns = annotations("image", 1884807)
assert ns["openmicroscopy.org/mapr/gene"]["Gene Symbol"] == "CDK5RAP2"
assert ns["openmicroscopy.org/mapr/phenotype"]["Phenotype Term Accession"] == "CMPO_0000425"
#     ...and a systematic-id organism has an EMPTY Gene Symbol, so do not join on it.
assert annotations("image", 1229801)["openmicroscopy.org/mapr/gene"]["Gene Symbol"] == ""

# 11. Thumbnails answer; sized thumbnails 404 with HTML; full rendering is 403.
with urllib.request.urlopen(f"{BASE}/webgateway/render_thumbnail/1884807/", timeout=60) as r:
    thumb = r.read()
assert thumb.startswith(b"\xff\xd8") and len(thumb) < 4096
open("idr0021_1884807.jpg", "wb").write(thumb)

def status(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=60) as r:
            return r.status, len(r.read())
    except urllib.error.HTTPError as e:
        return e.code, len(e.read())

assert status("/webgateway/render_thumbnail/1884807/64/")[0] == 404
assert status("/webgateway/render_image/1884807/0/0/") == (403, 0)
#     ...and the original-file route SUCCEEDS with an HTML page, which is the trap.
code, size = status("/webgateway/archived_files/download/1884807/")
assert code == 200 and size > 100_000, "archived_files stopped serving the login page"

print("idr0088 plates    :", len(big), "paged in", big_meta["limit"], "at a time")
print("containers        :", sum(len(v) for v in index.values()),
      "across", len(index), "accessions;",
      len([c for v in index.values() for c in v if not c["children"]]), "empty umbrellas")
print("idr0097 kinds     :", sorted({c['kind'] for c in index['idr0097']}))
print("idr0022 first hit :", index["idr0022"][0]["name"], "children=",
      index["idr0022"][0]["children"])
print("idr0021 licence   :", licence(lawo).split(" http")[0])
print("idr0012 licence   :", licence(fuchs).split(" http")[0])
print("id 51 is two studies:", parents["project"], "|", parents["screen"],
      "->", wrong.split(" http")[0])
print("image 1884807     :", {k: px[f"Size{k}"] for k in "XYZCT"}, px["Type"]["value"],
      [c["Name"] for c in px["Channels"]], px["PhysicalSizeX"]["Value"], "µm")
print("imgData 1884807   : HTTP 200,", sorted(bad), "->", bad["Exception"][:38])
print("idr0001 screenA   :", plate_meta["totalCount"], "plates; plate 2551 is",
      f'{plate["Rows"]}x{plate["Columns"]}', "=", len(wells), "wells,",
      sum(len(x["WellSamples"]) for x in wells), "images")
print("well A1           : Row", w0["Row"], "Column", w0["Column"], "->",
      w0["WellSamples"][0]["Image"]["Name"])
print("idr0088 plate 8958:", len(cx_wells), "wells,", len(blank), "with no WellSamples key,",
      cx_images, "images of a full", cx_plate["Rows"] * cx_plate["Columns"] * 3)
print("idr0154 wsi       :", (wsi["SizeX"], wsi["SizeY"]), "no PhysicalSizeX, no channel names")
print("annotation ns     :", len(ns), "namespaces;", ns["openmicroscopy.org/mapr/gene"]["Gene Symbol"],
      "/", ns["openmicroscopy.org/mapr/phenotype"]["Phenotype Term Accession"])
print("thumbnail         :", len(thumb), "bytes ->", "idr0021_1884807.jpg")
print("sized thumbnail   :", status("/webgateway/render_thumbnail/1884807/64/"))
print("render_image      :", status("/webgateway/render_image/1884807/0/0/"))
print("archived_files    :", (code, size), "<- HTTP 200 and an HTML login page")
```

**Expect**

Invariants — true whatever IDR releases next, so a failure means this skill is wrong
rather than stale:

- Every list route returns exactly `{data, meta}`, and `meta` is exactly
  `{offset, limit, maxLimit, totalCount}`. Code reading a bare list is the mistake this
  asserts against.
- Objects carry `@id`, never `id`, and traversal happens through `url:*` fields.
- The default `limit` is 200 and `maxLimit` is 1000; a larger `limit` is clamped silently.
- An unrecognised query parameter is ignored, so an invented filter returns everything.
- A container whose `Name` has no `/suffix` has zero children, and one that has a suffix
  has at least one. Exact across all containers, both kinds.
- `Row` and `Column` on a well are zero-based, and the well label is neither — `A1` is
  `Row 0, Column 0`. A well holds several `WellSamples`, so wells and images differ.
- A well that was never imaged has **no `WellSamples` key**, not an empty list.
  `RowNamingConvention`, `PhysicalSizeX` and a channel's `Name` are likewise optional
  *keys*: absent, not null. Every one of those raises `KeyError` on some study.
- A map annotation's `values` is a list of `[key, value]` pairs and namespaces do not
  merge.
- Screen ids and project ids share one number space, so the annotation endpoint answers
  `?screen={project id}` with a *different study's* metadata rather than an error. Check
  `link.parent.name`.
- `/webgateway/imgData/` answers HTTP 200 with an `Exception` and no `size`;
  `/webgateway/archived_files/download/` answers HTTP 200 with an HTML page. Both are
  successes that carry nothing, and both are what a status-code check misses.

Observed 2026-08-27 — these move as IDR publishes, so a mismatch is drift to investigate,
not a bug:

```
idr0088 plates    : 1199 paged in 400 at a time
containers        : 252 across 143 accessions; 32 empty umbrellas
idr0097 kinds     : ['project', 'screen']
idr0022 first hit : idr0022-koedoot-cellmigration children= 0
idr0021 licence   : CC BY 4.0
idr0012 licence   : CC BY-NC-ND 4.0
id 51 is two studies: idr0021-lawo-pericentriolarmaterial/experimentA | idr0003-breker-plasticity/screenA -> CC BY-NC-SA 3.0
image 1884807     : {'X': 256, 'Y': 256, 'Z': 1, 'C': 3, 'T': 1} float ['CENT2', 'PCNT', 'CDK5RAP2-C'] 0.03959999978542328 µm
imgData 1884807   : HTTP 200, ['Exception', 'id', 'meta', 'perms'] -> Error instantiating pixel buffer: /OME
idr0001 screenA   : 192 plates; plate 2551 is 8x12 = 96 wells, 576 images
well A1           : Row 0 Column 0 -> JL_120731_S6A [Well A-1; Field #1]
idr0088 plate 8958: 384 wells, 136 with no WellSamples key, 744 images of a full 1152
idr0154 wsi       : (24320, 24288) no PhysicalSizeX, no channel names
annotation ns     : 6 namespaces; CDK5RAP2 / CMPO_0000425
thumbnail         : 879 bytes -> idr0021_1884807.jpg
sized thumbnail   : (404, 1561)
render_image      : (403, 0)
archived_files    : (200, 148580) <- HTTP 200 and an HTML login page
```

## Sources

- Image Data Resource — https://idr.openmicroscopy.org/
- API guide — https://idr.openmicroscopy.org/about/api.html
- Data download — https://idr.openmicroscopy.org/about/download.html
- Published studies — https://idr.openmicroscopy.org/about/studies.html
- Search engine API — https://idr.openmicroscopy.org/searchengine/apidocs/
- OMERO JSON API — https://docs.openmicroscopy.org/omero/latest/developers/json-api.html
- OME-NGFF specification — https://ngff.openmicroscopy.org/
- EMBL-EBI mirror — https://ftp.ebi.ac.uk/pub/databases/IDR/
- Williams et al. (2017) *Nature Methods* 14, 775-781 — https://doi.org/10.1038/nmeth.4326
- Moore et al. (2021) *Nature Methods* 18, 1496-1498, the OME-NGFF format — https://doi.org/10.1038/s41592-021-01326-w

IDR is operated by the University of Dundee and the Open Microscopy Environment. Each
study carries its submitter's own licence and citation request — the study's map
annotation holds `License`, `Copyright`, `Publication DOI` and `Data DOI`. Cite the
depositing study, not only the archive, and check the licence before use rather than
assuming the archive's terms cover it.
