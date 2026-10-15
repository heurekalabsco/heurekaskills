---
name: geneicl
description: Run GeneICL on bulk RNA-seq expression tables — in-context classification, regression and Cox survival from a labelled support set in one forward pass, with no per-cohort training. Weights ship inside the pip package and run on CPU.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [geneicl, bulk-rna-seq, in-context-learning, tabular-foundation-model, survival]
papers: [doi:10.48550/arXiv.2610.08694]
datasets: [https://gtexportal.org/api/v2/reference/gene?geneId=GFAP&gencodeVersion=v39, https://gtexportal.org/api/v2/expression/medianGeneExpression?gencodeId=ENSG00000131095.14&datasetId=gtex_v10]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-15
  against: geneicl 1.0.0 (PyPI) / torch 2.14.1+cu130 / numpy 2.4.6 / Python 3.11.17 on linux-x86_64, CPU only / GTEx Portal API v2, datasetId gtex_v10, GENCODE v39
  executed: 6
  unverified: 0
---
# GeneICL — one in-context model for bulk expression tasks

GeneICL takes a labelled block of expression profiles and an unlabelled block, and
predicts the second from the first in a single forward pass. There is no fitting step in
the usual sense: `fit` stores the labelled rows, and `predict` pushes support and query
through the network together. The same 4.24M-parameter checkpoint answers
classification, regression and Cox survival, so moving between those three is a
constructor argument rather than a different model and a different training run.

The practical consequence is that small cohorts stop being a modelling problem. A task
with sixty labelled samples is one the model reads as context rather than one it has to
learn from, and the cost of trying a second outcome on the same matrix is another forward
pass.

**What this is not** is a model that learned biology from expression data. It was
pretrained on synthetic tabular tasks only. It is a general in-context predictor applied
to expression matrices, which is why it transfers across cohorts without retraining, and
also why you should expect a well-tuned cohort-specific model to beat it where you have
enough labels to fit one.

## Before the first block

Nothing to obtain: no API key, no account, no registration, and no GPU — every block
below was run on CPU. Two things are worth knowing before you install:

- **Disk.** `pip install geneicl` depends only on `torch` and `numpy`, but the default
  `torch` wheel carries the bundled CUDA libraries, so the environment lands near 5 GB.
  The package itself is small: the three checkpoints are 25 MB each and ship inside it,
  so there is no separate weights download and no model host to be unreachable. On a
  CPU-only machine you can cut most of that by installing a CPU `torch` wheel from
  `https://download.pytorch.org/whl/cpu` before installing `geneicl` — unverified here,
  because that index is not reachable from the environment these blocks were run in.
- **Python ≥ 3.10**, and `torch ≥ 2.4` (the model uses `nn.RMSNorm`).

The licence is MIT, held by ETH Zurich, covering the code and the checkpoints in the
repository that publishes them.

## Install

```bash
pip install geneicl
python -m geneicl        # self-check: runs all three modes on synthetic data
```

The self-check prints `geneicl OK` and takes a few seconds on CPU. It is the fastest way
to tell whether the install and the checkpoint load are both sound.

## The call shape

```python
import numpy as np
from geneicl import GeneICL

rng = np.random.default_rng(0)
X = rng.normal(5, 1, (40, 60)).astype("float32")      # samples x genes, log1p-CPM scale
y = np.array(["case"] * 20 + ["control"] * 20)

clf = GeneICL(mode="classification").fit(X[:30], y[:30])
print(clf.predict(X[30:]))                             # labels, from clf.classes_
print(clf.predict_proba(X[30:]).shape)                 # (n_query, n_classes)
print(list(clf.classes_))
```

`X` is **samples x genes**, and support and query must carry the same columns in the same
order. Any gene set works — the model standardises each task and reduces it to principal
components internally, so you are choosing which genes to show it, not fitting a
preprocessing pipeline to be reused later.

Three things follow from `fit` only storing the support set:

| | what it means |
|---|---|
| `fit` is cheap | it copies the support rows; no gradient step runs |
| `predict` carries the cost | one forward pass per query chunk, support included each time |
| the support set is the model | change which rows you label and the predictions change, with no retraining |

Column order in `predict_proba` follows `clf.classes_`, which is the sorted unique set of
the labels you passed. Read the column index off `classes_` rather than assuming the
order you wrote them in.

## Try it

**Data** — GTEx Portal API v2, release `gtex_v10` (GENCODE v39), two open endpoints and no
key: `reference/gene` to turn gene symbols into the versioned GENCODE ids GTEx requires,
and `expression/medianGeneExpression` for median TPM per tissue. Both were reachable on
2026-10-15. The task is built from GTEx's **median expression per tissue**, which gives 54
rows keyed explicitly by `tissueSiteDetailId` — chosen over per-sample values deliberately,
because the per-sample endpoint returns bare value arrays with no sample identifiers, so
assembling a multi-gene matrix from it would rest on an assumption about ordering that the
response does not let you check.

**Run**

```python
import json, urllib.parse, urllib.request
import numpy as np
from geneicl import GeneICL

BASE = "https://gtexportal.org/api/v2"
PANEL = ("GFAP SNAP25 SYT1 NEFL MBP PLP1 GRIN1 STMN2 ALB APOA1 CYP3A4 SERPINA1 TTR FGA "
         "ACTA1 MYH7 CKM TNNT1 DES MYBPC1 HBB HBA1 PTPRC LYZ S100A8 KRT1 KRT14 FLG "
         "PRM1 DAZL SYCP3 PRSS1 CPA1 INS UMOD NPHS2 SLC34A1 SFTPC SFTPB AGER "
         "NPPA MYL7 TNNT2 TG TPO ACTB GAPDH B2M").split()


def get(path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.load(r)["data"]


# 1. symbols -> the versioned GENCODE ids gtex_v10 requires
ref = get("reference/gene", {"geneId": PANEL, "gencodeVersion": "v39",
                             "genomeBuild": "GRCh38/hg38"})
ids = {g["geneSymbol"]: g["gencodeId"] for g in ref
       if g["geneSymbol"] in PANEL and not g["gencodeId"].endswith("_PAR_Y")}
genes = sorted(ids)
print(f"resolved {len(genes)}/{len(PANEL)} genes")

# 2. median TPM per tissue, keyed by tissueSiteDetailId — no positional assumptions
rows = get("expression/medianGeneExpression",
           {"gencodeId": [ids[g] for g in genes], "datasetId": "gtex_v10",
            "itemsPerPage": 100000})
tab = {}
for r in rows:
    tab.setdefault(r["tissueSiteDetailId"], {})[r["geneSymbol"]] = r["median"]
tissues = sorted(t for t, v in tab.items() if len(v) == len(genes))

# 3. tissues x genes, log1p — GeneICL expects log1p-CPM scale, not raw TPM
X = np.log1p(np.array([[tab[t][g] for g in genes] for t in tissues], dtype=np.float32))
y = np.array(["brain" if t.startswith("Brain_") else "other" for t in tissues])
print(f"matrix {X.shape}  max {X.max():.2f}  brain {(y == 'brain').sum()}/{len(y)}")

# 4. class-stratified support/query split, fixed seed
rng = np.random.default_rng(0)
sup = np.concatenate([rng.permutation(np.where(y == c)[0])[: int(round(0.6 * (y == c).sum()))]
                      for c in np.unique(y)])
qry = np.setdiff1d(np.arange(len(y)), sup)

# 5. one in-context forward pass — no training
clf = GeneICL(mode="classification").fit(X[sup], y[sup])
pred = clf.predict(X[qry])
proba = clf.predict_proba(X[qry])

print(f"support {len(sup)}  query {len(qry)}  classes_ {list(clf.classes_)}")
print(f"proba shape {proba.shape}  rows sum to 1: {np.allclose(proba.sum(1), 1)}")
print(f"accuracy {(pred == y[qry]).mean():.3f}")
for t, p, pr in list(zip(np.array(tissues)[qry], pred, proba))[:4]:
    print(f"  {t:42} -> {p:5}  P(brain)={pr[list(clf.classes_).index('brain')]:.3f}")
```

**Expect**

*Invariants* — these hold regardless of GTEx release or package version, and a failure
here means something is wrong rather than merely different:

- all 48 symbols resolve, and the matrix is `(54, 48)` — 54 GTEx tissues, one row each
- `X.max()` stays well under 20, so `fit` raises no scale warning
- `proba.shape == (n_query, 2)` and every row sums to 1
- `predict` returns labels drawn from `classes_`, which is `['brain', 'other']`
- the brain tissues in the query block carry `P(brain)` above 0.5

*Observed, 2026-10-15, `gtex_v10` / geneicl 1.0.0 / CPU* — a mismatch here is drift to
look into, not a bug:

- `resolved 48/48 genes`, `matrix (54, 48)  max 12.24  brain 13/54`
- `support 33  query 21`, `accuracy 0.905`
- `Adipose_Subcutaneous -> other  P(brain)=0.012`, and the five brain regions in the query
  block between `P(brain)=0.879` and `0.892`
- about 3 seconds end to end on CPU, most of it the two HTTP calls

The split is seeded, the forward pass is deterministic on CPU, and repeated runs gave the
same accuracy.

## Regression, on the same matrix

Regression mode predicts a continuous target. Here the target is one gene's expression
held out of the feature set — a self-contained check that the mode works on real data,
using the matrix the previous block built.

```python
import numpy as np
from geneicl import GeneICL
# X, genes, tissues from the Try it block above
tgt = genes.index("SNAP25")
keep = [i for i in range(len(genes)) if i != tgt]
perm = np.random.default_rng(0).permutation(len(tissues))
s, q = perm[:33], perm[33:]

reg = GeneICL(mode="regression").fit(X[np.ix_(s, keep)], X[s, tgt])
pred = reg.predict(X[np.ix_(q, keep)])
print(f"n_query {len(q)}  pearson r {np.corrcoef(pred, X[q, tgt])[0, 1]:.3f}"
      f"  MAE {np.abs(pred - X[q, tgt]).mean():.3f}")
```

Observed on 2026-10-15: `n_query 21  pearson r 0.877  MAE 0.850`. Support labels are
z-scored internally and predictions come back on the scale you supplied, so no inverse
transform is needed on your side.

## Survival

Survival mode is Cox proportional hazards run in context: GeneICL regresses the support
set's martingale residuals and returns a log-risk, higher meaning shorter survival. The
Breslow baseline hazard is fitted on out-of-fold support scores, which is what makes
`predict_survival_function` possible at all.

The data below is **generated inline, and it is synthetic** — the registry's reachable
open sources carry expression matrices but not linked per-sample follow-up time, and
individual-level survival alongside expression is generally controlled-access. So this
block checks the mechanics and the output contract, not predictive quality on a real
cohort. Swap in your own cohort's `time` and `event` to do that.

```python
import numpy as np
from geneicl import GeneICL

rng = np.random.default_rng(1)
X = rng.normal(5, 1, (80, 40)).astype("float32")
risk = X[:, :5].sum(1)                                    # first five genes drive the hazard
T = rng.exponential(np.exp(-0.3 * (risk - risk.mean())) * 100)
E = (rng.random(80) < 0.7).astype(int)                    # 1 = event observed, 0 = censored

cox = GeneICL(mode="survival").fit(X[:60], T[:60], event=E[:60])
logrisk = cox.predict(X[60:])
surv = cox.predict_survival_function(X[60:])
print(f"log-risk {logrisk.shape}  S(t) {surv.shape}  times_ {len(cox.times_)}")
print(f"S non-increasing in t: {bool(np.all(np.diff(surv, axis=1) <= 1e-9))}")
print(f"S within (0, 1]: {bool((surv > 0).all() and (surv <= 1).all())}")
```

Observed on 2026-10-15: `log-risk (20,)  S(t) (20, 39)  times_ 39`, both checks `True`.
`S(t)` has one column per entry in `cox.times_`, which holds the distinct times at which
an event was observed in the support set — so its width is a property of your support
set, not a fixed number. Note `fit(X, time, event=event)`: the second positional argument
is the time, and `event` is keyword-only in practice.

## The guards the model enforces

Four failure modes are caught for you, which is worth knowing because three of them are
silent-wrong-answer territory in a hand-rolled pipeline.

```python
import warnings
import numpy as np
from geneicl import GeneICL

X = np.random.default_rng(0).gamma(2, 50, (40, 30)).astype("float32")   # raw-TPM scale
y = np.array(["a"] * 20 + ["b"] * 20)

with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    GeneICL(mode="classification").fit(X, y)
    print([str(w.message) for w in caught])

for call in (lambda: GeneICL(mode="classification").fit(np.log1p(X), np.arange(40) % 11),
             lambda: GeneICL(mode="survival").fit(np.log1p(X), np.arange(40.0)),
             lambda: GeneICL(mode="clustering")):
    try:
        call()
    except ValueError as e:
        print(f"ValueError: {e}")
```

Observed output, 2026-10-15:

```
['X looks like raw counts; GeneICL expects log1p-CPM']
ValueError: 11 classes; the classification head has 10
ValueError: mode='survival' needs fit(X, time, event=event)
ValueError: mode='clustering', expected one of ('classification', 'regression', 'survival')
```

The scale warning is the one to take seriously: it fires when `X.max() > 20`, on the
reasoning that `log1p` of a CPM value cannot exceed about 13.8. It is a warning rather
than an error, so a pipeline that passes raw TPM will run and return worse numbers
quietly unless you are watching your warnings. The ten-class ceiling is the
classification head's width and is not configurable.

## Checkpoints, seeds and the test-time ensemble

Three checkpoints ship in the package, trained with seeds 0, 1 and 2; `geneicl.CKPT` is
seed 0 and is the default. Pass `ckpt=` to select another, and the published SHA-256
prefixes let you confirm what you are running.

```python
import hashlib
import numpy as np
import geneicl
from geneicl import GeneICL

for p in sorted(geneicl.CKPT.parent.glob("*.pt")):
    print(f"{p.name:26} {p.stat().st_size / 1e6:5.1f} MB  "
          f"sha256[:16]={hashlib.sha256(p.read_bytes()).hexdigest()[:16]}")

X = np.random.default_rng(0).normal(5, 1, (40, 30)).astype("float32")
y = np.array(["a"] * 20 + ["b"] * 20)
m = GeneICL(mode="classification", ensemble_seed=42).fit(X[:30], y[:30])
print("ensembled predictions:", m.predict(X[30:]).shape)
```

Observed on 2026-10-15: `trm_segmented8_s0.pt  25.6 MB  sha256[:16]=52609d58f5bb7185`,
matching the value published alongside the checkpoints, and `s1`/`s2` at
`b6cbb95328eff8bb` and `db3e478f38c66cec`. The ensembled call returned `(10,)`.

`ensemble_seed=<int>` averages predictions over eight support views crossed with three
internal PCA thresholds — 24 forward passes instead of one, for a benefit the authors
describe as small and inconsistent. Treat it as something to try at the end if a result
is borderline, not as the default. `ensemble_seed=None`, the default, is the single pass.

## Limits worth stating plainly

- **Ten classes maximum** in classification, fixed by the head width.
- **`X` must be on a log1p-CPM scale.** Raw counts or raw TPM warn rather than fail.
- **Support and query must share columns**, in the same order.
- **Pretrained on synthetic tasks only.** Nothing about human tissue or disease is baked
  in; the biology has to come from the support set you provide.
- **Predict is not free.** The support set rides along in every forward pass, so a large
  support set makes every prediction more expensive — the opposite of the trained-model
  cost profile people expect.
- **CPU is fine at this scale.** The matrices here run in seconds; `device=` accepts a
  CUDA device and the runner switches to bf16 autocast there.
