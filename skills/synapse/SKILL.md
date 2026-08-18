---
name: synapse
description: Find and retrieve consortium datasets from Synapse (Sage Bionetworks) — resolve a syn id to entity metadata and annotations, walk a project's folders, and read an entity's access tier before attempting a download. Covers AMP-AD, the AD Knowledge Portal, PsychENCODE and HTAN. Most Synapse files need a free account; some need an approved data use certificate.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [synapse, public-data, controlled-access, alzheimers, consortium-data]
covers: [synapse, sage bionetworks, syn id, amp-ad, ad knowledge portal, agora, alzheimers, dementia, neurodegeneration, aging, rosmap, mount sinai brain bank, mayo rnaseq, psychencode, htan, dorsolateral prefrontal cortex, superior temporal gyrus, hippocampus, cerebellum, amygdala, plasma proteomics, brain proteomics, tmt, rna-seq, methylation, metabolomics, gwas, human, mouse, data use certificate]
papers: [PMID:24071850, PMID:26853544, PMID:33085189, PMID:30084846, PMID:29865057, PMID:30204156, PMID:27727239, PMID:35115731, PMID:32302568]
access: [open, registered, controlled]
platform: synapse
datasets: [https://repo-prod.prod.sagebase.org/repo/v1/entity/syn9890650, https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3219045/accessRequirement, https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3157322]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-17
  against: Synapse stack 601.0-20-g9b3fa3d75e / repo REST v1 / Python 3.12.8 (stdlib only)
  executed: 12
  unverified: 0
---
# Synapse — Sage Bionetworks

Synapse hosts a large share of consortium human data in aging and neurodegeneration —
AMP-AD and the AD Knowledge Portal, PsychENCODE, MODEL-AD, HTAN, the NF portals — and it
is the named deposit target for papers that say "data are available on Synapse" and give
no other route. Everything is addressed by a `syn` id.

**The one thing that makes Synapse different from GEO or Zenodo: three access tiers share
one namespace, and the id looks identical in all three.** `syn9890650` downloads with no
credential. `syn3219045` needs a free account and a click-through licence. `syn3157322`
needs a data use certificate co-signed by an institutional official and approved by a
human committee. Nothing in the identifier says which.

So the order of operations is not optional. **Read the entity's access requirements, report
them, and only then transfer bytes.** Get this backwards and a permissions refusal arrives
disguised as a missing file — and on one route it arrives disguised as success.

Every call below runs anonymously against the production API. No key, no account.

```bash
curl -s "https://repo-prod.prod.sagebase.org/repo/v1/version"
# {"version":"601.0-20-g9b3fa3d75e","stackInstance":"601"}
```

Two services on one host, and the split matters: `/repo/v1` serves metadata, annotations
and access requirements; `/file/v1` serves bytes. Anonymous callers get a lot of the first
and almost none of the second.

## Check the tier before you transfer anything

`POST /repo/v1/entity/{id}/bundle2` returns the entity, its annotations, the caller's
permissions, the folder path and the restriction state in one request. Use it as the
pre-flight.

```python
import json, urllib.error, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"


def _post(path, body, timeout=60):
    req = urllib.request.Request(
        REPO + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def preflight(syn_id):
    """Entity + annotations + permissions + tier in one call. Never downloads."""
    b = _post(f"/entity/{syn_id}/bundle2", {
        "includeEntity": True, "includeAnnotations": True,
        "includeRestrictionInformation": True, "includeEntityPath": True})
    ri = b["restrictionInformation"]
    perm = ri["userEntityPermissions"]

    # restrictionLevel alone is NOT the answer: a nonexistent or private id also
    # answers 200 with restrictionLevel OPEN. canView is what separates them.
    if not perm["canView"]:
        tier = "invisible"          # private, or the id does not exist
    elif perm["canDownload"]:
        tier = "open"               # this caller may actually transfer the bytes
    elif ri["restrictionLevel"] == "OPEN":
        tier = "registered"         # no access requirement, but a login is needed
    elif ri["restrictionLevel"] == "RESTRICTED_BY_TERMS_OF_USE":
        tier = "registered+terms"
    else:                            # CONTROLLED_BY_ACT
        tier = "controlled"

    return {
        "id": syn_id,
        "name": b["entity"].get("name"),
        "type": b.get("entityType"),
        "tier": tier,
        "restrictionLevel": ri["restrictionLevel"],
        "canView": perm["canView"],
        "canDownload": perm["canDownload"],
        "openData": perm["isEntityOpenData"],
        "requirementIds": [d["accessRequirementId"] for d in ri["restrictionDetails"]],
        "path": " / ".join(p["name"] for p in b["path"]["path"][1:]),
        "annotations": {k: v["value"] for k, v in b["annotations"]["annotations"].items()},
    }


for sid in ("syn9890650", "syn3219045", "syn3157322", "syn23448901", "syn999999999"):
    try:
        r = preflight(sid)
        print(f"{r['id']:14} {r['tier']:16} {r['restrictionLevel']:26} "
              f"AR={r['requirementIds']}  {str(r['name'])[:44]}")
    except urllib.error.HTTPError as e:
        print(f"{sid:14} HTTP {e.code}  {json.loads(e.read())['reason']}")
```

Run 2026-08-17, anonymous:

```
syn9890650     open             OPEN                       AR=[]  AMP-AD Knowledge Portal-Controlled Access Da
syn3219045     registered+terms RESTRICTED_BY_TERMS_OF_USE AR=[5592528]  ROSMAP
syn3157322     controlled       CONTROLLED_BY_ACT          AR=[5592528, 9603055]  Metadata
syn23448901    HTTP 403  You lack READ access to the requested entity.
syn999999999   HTTP 404  Resource: 'syn999999999' does not exist
```

Five ids, five different answers, and three of them are AD Knowledge Portal content sitting
in the same tree. `syn3157322` is the ROSMAP metadata folder, two levels below the ROSMAP
study folder `syn3219045` — and one tier stricter than it. **Restriction is inherited from a
benefactor and tightens as you descend**, so a tier read at the project is not the tier of
the file you want. Check the leaf.

`restrictionLevel` takes exactly three values — `OPEN`, `RESTRICTED_BY_TERMS_OF_USE`,
`CONTROLLED_BY_ACT` — and `OPEN` is the one that misleads. It means "no access requirement
is attached", not "you can download this". Read `canDownload`.

## Trap — `restrictionInformation` reports an id that does not exist as OPEN

`POST /repo/v1/restrictionInformation` is the endpoint the tier lives on, and called on its
own it will cheerfully describe entities that are private, or that were never created:

```bash
curl -s -X POST "https://repo-prod.prod.sagebase.org/repo/v1/restrictionInformation" \
  -H "Content-Type: application/json" \
  -d '{"objectId":"syn999999999","restrictableObjectType":"ENTITY"}'
```

```
{"objectId":999999999,"restrictionLevel":"OPEN","hasUnmetAccessRequirement":false,
 "userEntityPermissions":{"canView":false, ... "canDownload":false, ...},
 "restrictionDetails":[]}
```

HTTP 200. `restrictionLevel: OPEN`. `restrictionDetails: []`. A pre-flight that reads only
those three fields reports "openly available, no requirements" for an id that does not
exist — and reports the same for a private project you have no right to see. The tell is
`canView: false`, and the fix is to route the pre-flight through `bundle2`, which returns
404 and 403 for those two cases respectively. Keep the `canView` guard anyway; it costs
nothing and it is the field that carries the truth.

## Resolving a syn id

```bash
curl -s "https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3219045"
# {"name":"ROSMAP","id":"syn3219045", ... "parentId":"syn5550382",
#  "concreteType":"org.sagebionetworks.repo.model.Folder"}
```

Identifier handling is lenient in ways worth knowing: `3219045`, `syn3219045` and
`SYN3219045` all resolve to the same entity. A non-identifier is a 400 with a specific
reason (`TP53 is not a valid Synapse ID.`), and a well-formed id that was never created is
a 404 (`Resource: 'syn999999999' does not exist`). Those are different problems — 400 means
fix the string, 404 means the deposit is not there, 403 means it exists and is not yours.

`concreteType` decides what you can do next. `Project` and `Folder` are containers with
children. `FileEntity` carries `dataFileHandleId` and has bytes. `TableEntity` and
`EntityView` are queried with SQL, not listed. Asking for the children of a `FileEntity`
returns `{"page":[]}` rather than an error, so branch on the type instead of inferring it
from an empty listing.

## Annotations, and the shape they come back in

Annotations are where the science metadata lives — study, species, assay, tissue, diagnosis.
They come back wrapped in a type descriptor, and **every value is a list**, including
scalars and booleans:

```python
import json, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"


def _post(path, body, timeout=60):
    req = urllib.request.Request(
        REPO + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def children(parent_id, types=("folder", "file")):
    """Every child of a container. The API pages at 50 and does not tell you the total."""
    token, out = None, []
    while True:
        body = {"parentId": parent_id, "includeTypes": list(types),
                "sortBy": "NAME", "sortDirection": "ASC"}
        if token:
            body["nextPageToken"] = token
        page = _post("/entity/children", body)
        out.extend(page["page"])
        token = page.get("nextPageToken")
        if not token:
            return out


kids = children("syn5550382")                      # AD Knowledge Portal, human studies
print(f"{len(kids)} children")
for c in kids[:5]:
    print(" ", c["id"], c["type"].rsplit(".", 1)[-1], "|", c["name"])

ann = _post("/entity/syn3219045/bundle2", {"includeAnnotations": True})["annotations"]
print("\nannotations on syn3219045:")
for k, v in list(ann["annotations"].items())[:5]:
    print(f"  {k:20} {v['type']:8} {v['value']}")
```

Run 2026-08-17:

```
104 children
  syn21680862 Folder | ACOM
  syn5759376 Folder | ACT
  syn70781457 Folder | ADKP_Metadata_Harmonization_Study
  syn5592519 Folder | ADMC_ADNI1
  syn9705278 Folder | ADMC_ADNI2-GO

annotations on syn3219045:
  study                STRING   ['ROSMAP']
  species              STRING   ['Human']
  studyName            STRING   ['The Religious Orders Study and Memory and Aging Project Study']
  studyType            STRING   ['Individual']
  consortium           STRING   ['AMP-AD']
```

Three things about the listing. `POST /repo/v1/entity/children` pages at 50 with a
`nextPageToken` and never reports a total, so a single call on a folder of 104 silently
gives you the first 50 — loop until the token is absent. `includeTypes` is required and is
not defaulted; omit `table`, `entityview`, `dataset`, `link` or `dockerrepo` and those
children simply do not appear. And annotations are a flat map on the entity, not inherited,
so a file often carries far less than the study folder above it — read both.

The type wrapper is worth respecting rather than flattening blindly. A `BOOLEAN` annotation
arrives as `{"type": "BOOLEAN", "value": ["TRUE"]}` — the string `"TRUE"` inside a list, not
`true`. Coercing with `bool(value)` makes every boolean annotation true, including the false
ones.

## Reading the requirement in detail

`GET /repo/v1/entity/{id}/accessRequirement` returns every requirement standing between the
caller and the bytes, including ones inherited from ancestors. The `concreteType` is what
tells a reader what the tier will cost them.

```python
import json, re, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"

# What each requirement type costs the reader, in the order Synapse escalates.
KIND = {
    "TermsOfUseAccessRequirement": "click-through terms — accept once, in the browser",
    "SelfSignAccessRequirement": "self-signed — you attest, no committee reviews it",
    "ManagedACTAccessRequirement": "ACT review — an application a human approves",
    "LockAccessRequirement": "locked — contact the ACT, no self-service route",
}


def requirements(syn_id):
    """Every access requirement standing between you and this entity's bytes."""
    d = json.loads(urllib.request.urlopen(
        f"{REPO}/entity/{syn_id}/accessRequirement", timeout=60).read())
    out = []
    for ar in d["results"]:
        kind = ar["concreteType"].rsplit(".", 1)[-1]
        rec = {"id": ar["id"], "name": ar["name"], "kind": kind,
               "means": KIND.get(kind, "unknown requirement type"),
               "accessType": ar["accessType"],
               # subjectIds is every entity this requirement covers — hundreds of ids
               # you did not ask for. Count it and throw it away.
               "coversEntities": len(ar.get("subjectIds") or [])}
        if ar.get("termsOfUse"):
            rec["terms"] = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", ar["termsOfUse"])).strip()
        for flag in ("isCertifiedUserRequired", "isValidatedProfileRequired",
                     "isDUCRequired", "isIRBApprovalRequired", "isIDURequired",
                     "isIDUPublic", "isTwoFaRequired", "areOtherAttachmentsRequired"):
            if flag in ar:
                rec[flag] = ar[flag]
        if ar.get("expirationPeriod"):
            rec["accessExpiresAfterDays"] = ar["expirationPeriod"] // 86_400_000
        out.append(rec)
    return out


for sid in ("syn3219045", "syn3157322", "syn9890650"):
    print("=" * 72)
    reqs = requirements(sid)
    print(sid, "—", len(reqs), "requirement(s)")
    for r in reqs:
        print(json.dumps(r, indent=2)[:1100])
```

For the ROSMAP metadata folder this prints two requirements — the portal-wide click-wrap,
and the committee-reviewed one (2026-08-17):

```
{
  "id": 9603055,
  "name": "AD Knowledge Portal",
  "kind": "ManagedACTAccessRequirement",
  "means": "ACT review — an application a human approves",
  "accessType": "DOWNLOAD",
  "coversEntities": 277,
  "isCertifiedUserRequired": false,
  "isValidatedProfileRequired": false,
  "isDUCRequired": true,
  "isIRBApprovalRequired": false,
  "isIDURequired": true,
  "isIDUPublic": true,
  "isTwoFaRequired": false,
  "areOtherAttachmentsRequired": false,
  "accessExpiresAfterDays": 365
}
```

Those flags are the application, machine-readable, before anyone fills anything in — a data
use certificate is required, an intended-data-use statement is required and will be
published, an IRB approval is not required, and access lapses after a year. That is enough
to tell a reader what they are in for without them opening a browser.

`subjectIds` is the trap in this response. It lists every entity the requirement governs —
191 for the click-wrap, 277 for the ACT requirement — so the payload is tens of kilobytes of
identifiers unrelated to the question. Take its length and discard it.

Note also that `accessType` is `DOWNLOAD` on all of these. A requirement gates *transfer*,
not *reading*: metadata and annotations for a controlled study are public, which is exactly
what makes "does a cohort like this exist, and what would using it require" an answerable
question with no application at all.

## Downloading, and what a refusal looks like

Two routes, and they fail in completely different ways.

**Single file.** `GET /repo/v1/entity/{id}/file` 307-redirects to a pre-signed URL;
`?redirect=false` hands back the same URL as plain text so the fetch stays a separate,
inspectable step. This route fails loudly. Anonymous, 2026-08-17:

```bash
curl -s "https://repo-prod.prod.sagebase.org/repo/v1/entity/syn13363290/file?redirect=false"
# HTTP 403 {"reason":"Anonymous users have only READ access permission."}

curl -s "https://repo-prod.prod.sagebase.org/repo/v1/entity/syn21088596/file?redirect=false"
# HTTP 403 {"reason":"There are unmet access requirements that must be met to read
#            content in the requested container."}
```

Both are 403 and the two reasons mean different things. The first says *log in*. The second
says *apply*. Report the reason string, not the status code.

**Bulk.** `POST /file/v1/file/bulk/async/start` then poll `/file/bulk/async/get/{token}`.
This is the route multi-file tooling uses, and **it reports refusal as a success status with
the error buried in the body**:

```python
import json, time, urllib.request

FILESVC = "https://repo-prod.prod.sagebase.org/file/v1"
SID, FH = "syn13363290", "175408255"     # Agora data_manifest.csv


def _post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    r = urllib.request.urlopen(req, timeout=90)
    return r.status, json.loads(r.read())


status, tok = _post(f"{FILESVC}/file/bulk/async/start", {"requestedFiles": [
    {"fileHandleId": FH, "associateObjectId": SID, "associateObjectType": "FileEntity"}]})
print("start   HTTP", status, tok)

while True:
    r = urllib.request.urlopen(f"{FILESVC}/file/bulk/async/get/{tok['token']}", timeout=90)
    if r.status != 202:
        res = json.loads(r.read())
        break
    time.sleep(2)

print("get     HTTP", r.status, "<- not an error status")
for f in res["fileSummary"]:
    print(f"  {f['associateObjectId']}  status={f['status']}  "
          f"code={f.get('failureCode')}  {f.get('failureMessage')}")
print("zip file handle:", res.get("resultZipFileHandleId"))

failed = [f for f in res["fileSummary"] if f["status"] != "SUCCESS"]
if failed:
    raise SystemExit(f"{len(failed)} of {len(res['fileSummary'])} refused — "
                     "the HTTP status said nothing about it")
```

```
start   HTTP 201 {'token': '99974057'}
get     HTTP 201 <- not an error status
  syn13363290  status=FAILURE  code=UNAUTHORIZED  Anonymous users have only READ access permission.
zip file handle: None
1 of 1 refused — the HTTP status said nothing about it
```

That block exits non-zero on purpose — the `SystemExit` is the failure the transport layer
declined to raise.

**HTTP 201 on both calls.** `raise_for_status()` passes. There is no exception to catch. The
refusal lives in `fileSummary[].status`, `failureCode` and `failureMessage`, and
`resultZipFileHandleId` is `None` where the archive would have been. A caller that checks
only the status code concludes the download succeeded and then reports the absent files as
missing data. **Iterate `fileSummary` and fail on any entry that is not `SUCCESS`** — and
note the summary is per-file, so a mixed request partially succeeds and needs both branches
handled.

**Anonymous download is the rare exception, not the norm.** A registered account is required
to transfer bytes at all, whatever the restriction level says. The exception is an entity a
curator has flagged as Open Data, which shows up as `isEntityOpenData: true` and
`canDownload: true` for an anonymous caller. Sweeping 1,236 publicly readable file entities
across the repository on 2026-08-17 found 4 — so treat `canDownload: true` while
unauthenticated as a happy accident you check for, never as the expected state.

## Get the files

The pre-flight and the transfer belong in one loop, so a refusal is recorded as a
requirement with a route rather than surfacing later as an empty directory.

```python
import hashlib, json, os, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"
OUT = "Data/synapse"
WANT = ["syn9890650",   # openly downloadable — AD Knowledge Portal DUC template
        "syn21088596",  # ROSMAP RNA-seq assay metadata — behind the ACT
        "syn13363290"]  # Agora data_manifest.csv — no requirement, still needs a login


def _post(path, body, timeout=90):
    req = urllib.request.Request(REPO + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def _get(path, timeout=90):
    return urllib.request.urlopen(REPO + path, timeout=timeout).read()


os.makedirs(OUT, exist_ok=True)
got, blocked = [], []

for sid in WANT:
    b = _post(f"/entity/{sid}/bundle2",
              {"includeEntity": True, "includeRestrictionInformation": True})
    ri, ent = b["restrictionInformation"], b["entity"]

    # PRE-FLIGHT. Ask before transferring, so a refusal is reported as a requirement
    # rather than surfacing later as a missing file.
    if not ri["userEntityPermissions"]["canDownload"]:
        reqs = json.loads(_get(f"/entity/{sid}/accessRequirement"))["results"]
        blocked.append({
            "id": sid, "name": ent.get("name"),
            "restrictionLevel": ri["restrictionLevel"],
            "needs": [{"id": r["id"], "name": r["name"],
                       "kind": r["concreteType"].rsplit(".", 1)[-1]} for r in reqs]
            or [{"kind": "SynapseLogin",
                 "name": "no access requirement — but anonymous callers cannot download"}],
            "url": f"https://www.synapse.org/Synapse:{sid}"})
        print(f"BLOCKED {sid}  {ri['restrictionLevel']:26} {str(ent.get('name'))[:40]}")
        continue

    # The file handle carries the real filename, media type and checksum. The entity
    # name is a label a curator typed and is often neither the filename nor suffixed.
    fh = json.loads(_get(f"/entity/{sid}/filehandles"))["list"][0]

    # ?redirect=false hands back the signed URL as plain text, keeping the fetch of the
    # bytes a separate, inspectable step.
    url = _get(f"/entity/{sid}/file?redirect=false").decode()
    blob = urllib.request.urlopen(url, timeout=300).read()

    dest = os.path.join(OUT, f"{sid}_{fh['fileName'].replace(' ', '_')}")
    with open(dest, "wb") as out:
        out.write(blob)
    md5 = hashlib.md5(blob).hexdigest()
    got.append({"id": sid, "path": dest, "bytes": len(blob),
                "version": ent["versionNumber"], "contentType": fh["contentType"],
                "md5": md5, "md5Matches": md5 == fh["contentMd5"],
                # contentSize is an int here and a *string* in /version — coerce both.
                "sizeMatches": len(blob) == int(fh["contentSize"])})
    print(f"WROTE   {sid}  {len(blob):>9,} B  v{ent['versionNumber']}  "
          f"md5 ok={got[-1]['md5Matches']}  -> {dest}")

with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump({"source": "Synapse (Sage Bionetworks)", "endpoint": REPO,
               "credential": "anonymous", "downloaded": got, "blocked": blocked},
              fh, indent=2)

print(f"\n{len(got)} file(s) on disk, {len(blocked)} blocked — see {OUT}/manifest.json")
for b in blocked:
    print(f"  {b['id']} needs: " + ", ".join(n["kind"] for n in b["needs"]))
```

Run 2026-08-17, anonymous:

```
WROTE   syn9890650    117,501 B  v8  md5 ok=True  -> Data/synapse/syn9890650_AMP-AD_Knowledge_Portal-Controlled_Accees_DUC-v6.pdf
BLOCKED syn21088596  CONTROLLED_BY_ACT          ROSMAP_assay_RNAseq_metadata.csv
BLOCKED syn13363290  OPEN                       data_manifest.csv

1 file(s) on disk, 2 blocked — see Data/synapse/manifest.json
  syn21088596 needs: TermsOfUseAccessRequirement, ManagedACTAccessRequirement
  syn13363290 needs: SynapseLogin
```

One file, two documented refusals, and a manifest a reader can act on. To run it as a
registered user, add `Authorization: Bearer <personal access token>` to every request and
change nothing else — a token is issued from account settings on the Synapse website. The
ACT-gated id will still be refused until an application is approved; no header substitutes
for that. **Everything shown in this skill was executed anonymously, so the authenticated
path is documented from the API's own contract rather than exercised.**

Four details in there are load-bearing:

- **Take the filename from the file handle.** The entity is named "AMP-AD Knowledge
  Portal-Controlled Access Data Use Certificate"; the file is
  `AMP-AD Knowledge Portal-Controlled Accees DUC-v6.pdf`. They differ in wording, in
  spelling, and in whether there is a suffix at all. Naming files after entities produces a
  directory of extensionless files nothing will open.
- **Verify against `contentMd5`, and coerce `contentSize`.** The file handle gives
  `contentSize` as an integer; `GET /entity/{id}/version` gives the same number as the
  *string* `"117501"`. Comparing `len(blob)` to the version record without `int()` fails on
  every file, which looks exactly like corruption.
- **Pre-signed URLs are short-lived** — `X-Amz-Expires=900`, fifteen minutes. Fetch the bytes
  promptly rather than collecting URLs into a queue, and re-issue rather than retrying a
  stale one. Transient 403s from the CDN also happen; one retry is worth having.
- **Record the version.** Entities are versioned, and a bare `/entity/{id}` always hands back
  whichever revision is current. `syn9890650` is at `versionNumber` 8 with seven earlier
  revisions still addressable, each with its own size and checksum. A directory of Synapse
  files with no version stamped beside them cannot be compared against a later pull.

To pin a specific revision, request `/entity/{id}/version/{n}` rather than the entity —
otherwise you get whatever is current, which is not what the paper analysed.

## Finding data without a syn id

`POST /repo/v1/search` is a free-text index over everything the caller can read. It works
anonymously.

```python
import json, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"


def find(*terms, node_type=None, size=10):
    """Free-text search across everything the caller can read. No account needed."""
    body = {"queryTerm": list(terms), "size": size}
    if node_type:                     # project | folder | file | table | entityview | link
        body["booleanQuery"] = [{"key": "node_type", "value": node_type}]
    req = urllib.request.Request(REPO + "/search", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=90).read())


d = find("alzheimers", "proteomics", "brain", node_type="project", size=6)
print("matches:", d["found"], "(every term must appear; terms are ANDed)")
for h in d["hits"]:
    print(f"  {h['id']:14} {h['name'][:78]}")
```

```
matches: 516 (every term must appear; terms are ANDed)
  syn73569657    BPSD brain proteomics
  syn20609824    Hales Proteomics Paper - Detergent-Insoluble Brain Proteome
  syn25006611    Consensus TMT Deep Proteomics of Human Brain in Alzheimer's Disease
  syn2790911     Alzheimers Disease - Community Portal
  syn51150434    The role of sex in brain protein expression and disease
  syn20933797    Consensus Brain Protein Coexpression Study
```

Terms are ANDed and matched loosely, so `found` counts are large and the ranking does most
of the work — a four-term query returning 516 hits is normal, not a sign the query is wrong.
`node_type` narrows to `project` for studies, `file` for individual deposits. Search does not
tell you the tier, so run every candidate through the pre-flight before promising anyone the
data. Search is also scoped to what the caller can read: an anonymous search will not surface
a private project, so an empty result is not proof the deposit does not exist.

## Querying tables and file views

Portals build curated `TableEntity` and `EntityView` catalogues over their files. Querying
one is SQL over an async job, and it is the fastest way to get from a research question to a
list of syn ids.

```python
import csv, json, os, time, urllib.error, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"
TABLE = "syn17083367"          # AD Knowledge Portal study catalogue


def query_table(table_id, sql, timeout_s=180):
    body = {"concreteType": "org.sagebionetworks.repo.model.table.QueryBundleRequest",
            "entityId": table_id, "query": {"sql": sql}, "partMask": 0x1 | 0x2}
    req = urllib.request.Request(
        f"{REPO}/entity/{table_id}/table/query/async/start",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    token = json.loads(urllib.request.urlopen(req, timeout=60).read())["token"]

    deadline = time.time() + timeout_s
    while True:
        try:
            r = urllib.request.urlopen(
                f"{REPO}/entity/{table_id}/table/query/async/get/{token}", timeout=90)
        except urllib.error.HTTPError as e:
            # Bad SQL, an unknown column, and "Anonymous users have only READ access
            # permission" all surface here rather than at /start.
            raise ValueError(json.loads(e.read())["reason"]) from None
        if r.status != 202:
            res = json.loads(r.read())["queryResult"]["queryResults"]
            return ([h["name"] for h in res["headers"]],
                    [row["values"] for row in res["rows"]])
        if time.time() > deadline:
            raise TimeoutError(f"{table_id} index still building after {timeout_s}s")
        time.sleep(3)


cols, rows = query_table(TABLE, f"""
    SELECT Study, Study_Abbreviation, Species, specimenType, studyFocus,
           DataType_All, accessReqs, DOI
    FROM {TABLE}
    WHERE Species HAS ('Human') AND studyFocus HAS ('Alzheimer Disease')
    ORDER BY Study_Abbreviation""")

os.makedirs("Data/synapse", exist_ok=True)
with open("Data/synapse/adkp_human_ad_studies.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(cols)
    w.writerows(rows)

print(f"{len(rows)} human Alzheimer studies -> Data/synapse/adkp_human_ad_studies.csv")
for r in rows[:5]:
    print(f"  {r[0]:14} {str(r[1])[:26]:28} {str(r[5])[:44]}")
```

```
99 human Alzheimer studies -> Data/synapse/adkp_human_ad_studies.csv
  syn70753079    None                         ["Epigenetics"]
  syn38190930    ABC-DS                       ["Gene Expression"]
  syn21680862    ACOM                         ["Gene Expression"]
  syn5759376     ACT                          ["Proteomics"]
  syn70781457    ADKP_Metadata_Harmonizatio   ["Harmonized Metadata"]
```

That is a catalogue of studies on disk without any credential, and the `Study` column is the
syn id to feed back into the pre-flight.

The SQL dialect and the job both have edges:

- **Multi-value columns need `HAS`, not `=`.** `Species`, `studyFocus` and `DataType_All`
  are `STRING_LIST` columns and come back as JSON-encoded strings such as `["Human"]`.
  `WHERE Species = 'Human'` matches nothing useful; `Species HAS ('Human')` is the operator.
- **Numeric-looking columns are frequently `STRING`.** In `syn21783965`,
  `numberOfIndividuals` is declared `STRING`, so `> 100` compares lexically and `299` sorts
  below `4`. Read `headers[].columnType` before writing a comparison, cast, or filter in
  Python.
- **Errors surface at `/get`, not `/start`.** `/start` returns 201 and a token for a query
  with a nonexistent column; the `/get` poll is where you learn `Unknown column id`.
- **Some tables refuse anonymous queries.** Querying a table counts as a download in
  Synapse's permission model, so `syn52656269` and `syn20968992` both answer
  `Anonymous users have only READ access permission.` while `syn17083367` and `syn21783965`
  answer fine. Handle it as an access error, not a bad query.
- **Large views can take minutes to build an index, or never finish.** The legacy view
  `syn11346063` returned `202 PROCESSING` with `Waiting for the table index to become
  available...` continuously for over eight minutes on 2026-08-17. Bound the poll and treat
  the timeout as "use a smaller table", not as a bug in your SQL.

Portal catalogues are curated artifacts, so treat them as a fast index rather than the
authority: `syn21783965` and `syn17083367` are both AD Knowledge Portal study tables and hold
34 and 196 rows respectively. Confirm what you find against the entity tree.

## Requesting access

**This skill cannot obtain access and does not promise it.** Every route below ends at an
application decided by people at Sage Bionetworks or a data contributor. What the skill can
do — entirely from public endpoints, with no account — is tell you which tier an id sits in,
what that tier requires, and whether the study's consent even permits your question. Do that
first. The binding constraint is usually not the paperwork.

### Lead with what the data may be used for

Consortium studies are consented for particular purposes, and that limit survives approval.
The AD Knowledge Portal's certificate requires agreement to "respect any research use
limitations identified by the Data Contributor(s) and indicated with the Data description" —
so a study collected under an Alzheimer's consent does not become usable for unrelated
research once a committee says yes. The public annotations name the study, the diagnosis and
the contributor before any application starts; read them, and read the study wiki, and decide
whether the cohort can answer your question at all. Sending someone through a months-long
process for data that cannot is the expensive mistake, and it is avoidable with two anonymous
API calls.

### Work out which tier your syn id is in

The requirement type is the answer, and it is machine-readable. Run the pre-flight, then
`GET /repo/v1/entity/{id}/accessRequirement` and read `concreteType`:

| what you observe | tier | what it costs |
|---|---|---|
| `canDownload: true` while unauthenticated (`isEntityOpenData: true`) | **open** | nothing |
| `restrictionLevel: OPEN`, no requirements, `canDownload: false` | **registered** | a free account, minutes |
| `TermsOfUseAccessRequirement` | **registered** | a free account plus one click-through |
| `SelfSignAccessRequirement` | **registered** | you attest; may also demand certification or a validated profile |
| `ManagedACTAccessRequirement` | **controlled** | an application a committee reviews |
| `LockAccessRequirement` | **controlled** | no self-service route — contact the ACT |
| `canView: false`, or 403 on the entity | not visible | ask the contributing group whether it is meant to be public |

Two flags on a `SelfSignAccessRequirement` or `ManagedACTAccessRequirement` change the answer
materially, so check them rather than assuming: `isCertifiedUserRequired` and
`isValidatedProfileRequired`. Also read `isDUCRequired`, `isIRBApprovalRequired`,
`isIDURequired`, `isTwoFaRequired` and `expirationPeriod` — that set is the whole application,
declared in advance.

### The registered tier — a free account, and possibly a quiz

Synapse has four account levels, and the jumps between them are the registered tier in
practice.

- **Anonymous** reads public metadata and, in rare Open Data cases, downloads. It cannot
  transfer ordinary files at all, which is what the 403 above is telling you.
- **Registered** is a free self-service signup. This is what most `restrictionLevel: OPEN`
  and `TermsOfUseAccessRequirement` content needs. Accepting a click-through requirement is
  done once, in the browser, on the entity's page at
  `https://www.synapse.org/Synapse:synNNNNNNN`.
- **Certified** requires passing a 15-question quiz on Synapse's data-sharing rules, which
  Sage estimates at 15-20 minutes. It gates uploading, and it gates download of anything with
  `isCertifiedUserRequired: true`. Free, immediate, and self-service — take it before you
  need it. The quiz is browser-only; the API endpoint answers
  `You need to login to take the Certification Quiz.`
- **Validated** is identity verification: a complete profile, a linked public ORCID, the
  Synapse Pledge, and one recent identity attestation — a letter from an institutional
  signing official, a notarised letter, or a professional licence. Required where
  `isValidatedProfileRequired: true`. You cannot be your own signing official.

For API work, a registered account issues a personal access token from its Synapse settings;
send it as `Authorization: Bearer <token>` on the same endpoints used above. Nothing in the
code changes but the header. Never commit the token.

### The controlled tier — what a `ManagedACTAccessRequirement` application asks

Requirements differ per study, so read the flags for *your* id. Taking the AD Knowledge
Portal's requirement 9603055 as the worked example, its own certificate — openly downloadable
at `syn9890650`, no account needed, and worth reading before you start — asks the requester
to:

1. **Hold an active Synapse account.**
2. **Write an intended data use statement**, 1-3 paragraphs in English covering the research
   objectives, the main testable hypothesis and the procedures. `isIDUPublic: true` here, so
   it is published on the portal's researcher community page with the lead investigator's name
   and affiliation. Write it as something you are content to have public.
3. **Submit the data use certificate co-signed by an authorised institutional signing
   official.** Not the requester. A signing official is the person at your institution
   empowered to bind it to the terms — usually in a research administration, sponsored
   programs or technology transfer office. This is the step with real calendar time in it, and
   the one to start early.
4. **List every collaborator** who will touch the data, with name, Synapse username and
   email. Collaborators at a different institution file their own request.

Access lasts one year (`expirationPeriod` 365 days) and renewal needs an annual progress
report of 1-3 paragraphs, an updated collaborator list and reconfirmation of the terms.
Sage does not publish a review turnaround, so plan on the signing official's schedule
dominating and do not promise anyone a date. The requirement's own terms also commit the
requester to keeping data confidential, not attempting re-identification, destroying local
copies at project end, and reporting any misuse to the Access and Compliance Team within
5 business days. Requests are filed from the entity's page in the browser; the ACT is
reachable at `act@sagebase.org`.

### Assist with the application; do not author it

Drafting an intended data use statement from the researcher's own aims is useful work, and so
is checklisting the requirements above, explaining what a signing official is, and tracking
the one-year expiry.

**Do not fill in attestations.** IRB or ethics approval status, data security arrangements,
the undertaking not to re-identify participants, the identity of a signing official — those
are legal claims published under a named person's name and countersigned by an institution.
An agent that makes them easy to produce makes them easy to produce carelessly. Surface each
one, say who must answer it, and stop. Do not sign, do not paste, do not guess a determination
number, and do not offer a workaround for a requirement someone cannot meet.

## When Synapse is not the answer

"Available on Synapse" is a claim in a paper, not a guarantee, and consortium papers are
routinely assumed to be on Synapse when they are not. Oh et al., *Nature* 2023
(`doi:10.1038/s41586-023-06802-1`), the organ-specific plasma-proteome aging clocks across
roughly 5,700 samples, is a clean example: searching Synapse for it returns nothing, and the
paper's own data availability statement routes each cohort elsewhere — a Stanford ADRC release
committee, two named principal investigators by email, NIAGADS study `ng00130` for the
Knight-ADRC samples, and the original publications for the rest, with age-association
statistics in a public web application. The models ship as a Python package instead.

Two lessons. Read the data availability statement before searching, because a repository
search cannot distinguish "not deposited" from "deposited privately". And when a paper names
several routes, the cheapest one is rarely Synapse — check whether summary statistics or a
released model answers your question before applying for individual-level data.

## Try it

A self-contained check that this skill still works. Public endpoints, no account, no key.

**Data** — three real Synapse entities that sit in three different access tiers inside the
AD Knowledge Portal namespace, plus one id that does not exist:

    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn9890650        Open Data, downloadable
    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3219045        ROSMAP — click-through terms
    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3157322        ROSMAP metadata — ACT controlled

`syn9890650` is the AMP-AD Knowledge Portal controlled-access Data Use Certificate, a 4-page
PDF flagged as Open Data — it carries no access requirement of its own, which is why an
anonymous caller can read it. The other two are the ROSMAP study folder and its metadata
subfolder; their *metadata* is public, which is what makes them usable in a test that needs
no credential. The portal asks that publications using AD Knowledge Portal data cite both the
portal and the contributing groups. Last confirmed reachable 2026-08-17.

```python
import hashlib, json, time, urllib.error, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"
FILESVC = "https://repo-prod.prod.sagebase.org/file/v1"


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    r = urllib.request.urlopen(req, timeout=90)
    return r.status, json.loads(r.read())


def get(url):
    return urllib.request.urlopen(url, timeout=90).read()


# 1. restrictionInformation on its own cannot tell "open" from "does not exist".
code, ghost = post(f"{REPO}/restrictionInformation",
                   {"objectId": "syn999999999", "restrictableObjectType": "ENTITY"})
print(f"1  syn999999999 restrictionInformation -> HTTP {code}, "
      f"restrictionLevel={ghost['restrictionLevel']}, "
      f"canView={ghost['userEntityPermissions']['canView']}")
assert code == 200 and ghost["restrictionLevel"] == "OPEN"
assert ghost["userEntityPermissions"]["canView"] is False

# 2. bundle2 on the same id is honest about it.
try:
    post(f"{REPO}/entity/syn999999999/bundle2", {"includeEntity": True})
    raise AssertionError("expected 404 from bundle2")
except urllib.error.HTTPError as e:
    print(f"2  syn999999999 bundle2 -> HTTP {e.code} {json.loads(e.read())['reason']}")
    assert e.code == 404

# 3. Three real ids in one namespace, three different tiers.
for sid, expect in (("syn9890650", "OPEN"),
                    ("syn3219045", "RESTRICTED_BY_TERMS_OF_USE"),
                    ("syn3157322", "CONTROLLED_BY_ACT")):
    _, b = post(f"{REPO}/entity/{sid}/bundle2",
                {"includeEntity": True, "includeRestrictionInformation": True})
    ri = b["restrictionInformation"]
    ars = json.loads(get(f"{REPO}/entity/{sid}/accessRequirement"))["results"]
    kinds = [a["concreteType"].rsplit(".", 1)[-1] for a in ars]
    print(f"3  {sid:12} {ri['restrictionLevel']:26} canDownload="
          f"{str(ri['userEntityPermissions']['canDownload']):5} "
          f"openData={str(ri['userEntityPermissions']['isEntityOpenData']):5} "
          f"{kinds}")
    assert ri["restrictionLevel"] == expect
    assert ri["userEntityPermissions"]["canView"] is True
    assert (len(ars) == 0) == (expect == "OPEN")
    assert ri["hasUnmetAccessRequirement"] == (expect != "OPEN")

# 4. The one that is genuinely open downloads with no credential, and the bytes
#    can be checked against the file handle rather than trusted.
fh = json.loads(get(f"{REPO}/entity/syn9890650/filehandles"))["list"][0]
url = get(f"{REPO}/entity/syn9890650/file?redirect=false").decode()
blob = get(url)
print(f"4  {fh['fileName']}  {len(blob):,} B  {fh['contentType']}  md5 ok="
      f"{hashlib.md5(blob).hexdigest() == fh['contentMd5']}")
assert hashlib.md5(blob).hexdigest() == fh["contentMd5"]
assert len(blob) == int(fh["contentSize"])       # str here, int there
assert url.startswith("https://")

# 5. The bulk route refuses the gated file with a 2xx and an error in the body.
_, tok = post(f"{FILESVC}/file/bulk/async/start", {"requestedFiles": [
    {"fileHandleId": "175408255", "associateObjectId": "syn13363290",
     "associateObjectType": "FileEntity"}]})
while True:
    r = urllib.request.urlopen(f"{FILESVC}/file/bulk/async/get/{tok['token']}", timeout=90)
    if r.status != 202:
        res = json.loads(r.read())
        break
    time.sleep(2)
summary = res["fileSummary"][0]
print(f"5  bulk download -> HTTP {r.status} but status={summary['status']} "
      f"code={summary.get('failureCode')}")
assert r.status < 300 and summary["status"] == "FAILURE"
assert summary["failureCode"] == "UNAUTHORIZED"
assert res.get("resultZipFileHandleId") is None

print("\nall assertions passed")
```

**Expect**

Invariants — these hold regardless of stack version, and a failure means the skill is wrong:

- `POST /restrictionInformation` answers **200** for `syn999999999`, with
  `restrictionLevel: OPEN` and `canView: false`. This is the whole reason the pre-flight
  cannot read `restrictionLevel` alone.
- `bundle2` on the same id answers **404**. The two endpoints disagree about the same entity
  by design, and the honest one is `bundle2`.
- The three real ids report three distinct `restrictionLevel` values, and
  `hasUnmetAccessRequirement` tracks it: false for `OPEN`, true for the other two.
- An entity with `restrictionLevel: OPEN` has **zero** access requirements; a gated one has
  at least one. Requirements are inherited, so the ACT-controlled folder carries both its own
  and its parent's click-wrap.
- `syn9890650` downloads with no credential, and the bytes match the file handle's
  `contentMd5` and `contentSize`. `contentSize` is an integer in the file handle and a string
  in `/entity/{id}/version` — the `int()` is not decoration.
- The bulk download route returns a **2xx** while refusing the file:
  `fileSummary[0].status == "FAILURE"`, `failureCode == "UNAUTHORIZED"`, and no
  `resultZipFileHandleId`. This is the trap the skill exists to teach.

Observed 2026-08-17 against stack **601.0-20-g9b3fa3d75e** — these move when Synapse
restacks or a portal recurates, so treat a mismatch as drift to investigate, not a failure:

```
1  syn999999999 restrictionInformation -> HTTP 200, restrictionLevel=OPEN, canView=False
2  syn999999999 bundle2 -> HTTP 404 Resource: 'syn999999999' does not exist
3  syn9890650   OPEN                       canDownload=True  openData=True  []
3  syn3219045   RESTRICTED_BY_TERMS_OF_USE canDownload=False openData=False ['TermsOfUseAccessRequirement']
3  syn3157322   CONTROLLED_BY_ACT          canDownload=False openData=False ['TermsOfUseAccessRequirement', 'ManagedACTAccessRequirement']
4  AMP-AD Knowledge Portal-Controlled Accees DUC-v6.pdf  117,501 B  application/pdf  md5 ok=True
5  bulk download -> HTTP 201 but status=FAILURE code=UNAUTHORIZED

all assertions passed
```

`canDownload` is per-caller, so a reader who has already accepted the AD Knowledge Portal
click-wrap will see `True` on `syn3219045` in step 3 — that is correct behaviour, not drift.
The assertions deliberately test `restrictionLevel` and the requirement list, which do not
depend on who is asking.

## Sources

- Synapse — https://www.synapse.org/
- REST API reference — https://rest-docs.synapse.org/
- Synapse documentation, account types and governance — https://docs.synapse.org/
- AD Knowledge Portal — https://adknowledgeportal.synapse.org/
- Omberg et al. (2013) *Nature Genetics* 45, 1121-1126 — https://doi.org/10.1038/ng.2761
- Greenwood et al. (2020) *Current Protocols in Human Genetics* 108, e105 — https://doi.org/10.1002/cphg.105

Synapse content is licensed per project, not repository-wide. Read the entity's terms of use
before redistributing anything, cite the study and the contributing group as the portal's
acknowledgement statements require, and treat the Access and Compliance Team
(`act@sagebase.org`) as the authority on any question this skill leaves open.
