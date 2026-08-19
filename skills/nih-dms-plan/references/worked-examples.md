# Worked examples

Two complete outputs, both checked by the script in `SKILL.md`. They are here rather than in
the skill body because they are long, and because a reader wants to compare them side by side.

They differ on the one axis that changes the shape of a plan: whether the project generates
human data. In the first, elements 5 and 7b are **left blank** because answering them is the
PI's and the institution's business. In the second they are **answered `Not Applicable`**,
because a project with no human participants has no such question to answer — a factual
finding, not an attestation.

Both were drafted from real public awards in NIH RePORTER:

- `11016811` — *Genomic regulation of VWF levels in health and disease* (P01HL173579)
- `11128776` — *Circuit functions of fast-spiking interneurons in the main olfactory bulb* (R01DC021296)

Neither is a submission-ready plan for those projects: an abstract does not state consent
terms, embargoes or institutional arrangements. They show the shape and the reasoning.

---

# Example 1 — human genomic study

All seven elements live. GDS applies.

## `dms-plan.md`

```markdown
# Data Management and Sharing Plan

## 1. Maximum appropriate sharing of scientific data underlying peer-reviewed publications and other findings resulting from this award, including preprints, refereed papers reported at conferences, and other findings?

[x] Yes  [ ] No

## 2. Will the scientific data underlying peer-reviewed publications be shared by the time of publication, or for other findings, by the end of the period of performance including no-cost extensions?

[x] Yes  [ ] No

## 3. Will shared scientific data be made available for at least as long as required by applicable data repository policies and/or journal policies?

[x] Yes  [ ] No

## 4. Limitations on sharing, and the ethical, legal, or technical factors behind them

Individual-level human genomic data and the linked VWF antigen phenotypes generated
under this award will be shared through controlled access rather than as an open
download. The reason is the consent under which the contributing cohorts enrolled:
participants agreed to research use of their genetic and clinical data by qualified
investigators under a data use agreement, not to unrestricted public release. Because
genotype data are individually identifiable in principle even when direct identifiers
are removed, open posting would exceed that consent and would not be consistent with
NIH expectations for individual-level human genomic data.

Access will therefore be granted through the NIH-designated repository's established
request process, which records the requesting investigator, their institutional
signing official, and the research use for which access is granted. Summary-level
results — association statistics and allele frequencies — carry no comparable
re-identification risk and will be released without access controls at the time of
publication.

One further limitation is technical rather than ethical. A subset of samples is being
sequenced under a materials transfer agreement with an external biorepository that
retains the right to embargo release of raw reads until its own primary publication.
Where that applies, processed genotype calls and phenotypes will still be deposited on
the schedule above, and the raw reads will follow once the embargo lifts.

## 5. If scientific data derived from human research participants will be shared, will privacy, rights, and confidentiality of participants be protected as outlined in NOT-OD-22-213?

[ ] Yes  [ ] No  [ ] Not Applicable

## 6. Expected data types and repositories

| Expected Data Type | Established Repository or Example |
|---|---|
| Human whole-genome sequence and genotype data | dbGaP |
| Human plasma VWF antigen and activity phenotypes, linked to genotype | dbGaP |
| Bulk RNA-seq from endothelial cell models | GEO |
| Genome-wide association summary statistics | GWAS Catalog |
| Proteomic mass spectrometry from plasma samples | PRIDE |

## 7. For studies subject to the NIH Genomic Data Sharing Policy

**7a.** Will you share all large-scale human genomic and associated data in an
NIH-designated repository according to the accelerated timelines expected in the GDS
Policy?

[x] Yes  [ ] No  [ ] Not Applicable

**7b.** Do you anticipate that when sharing you will be able to meet the expectations
of the Institutional Certification in the GDS Policy?

[ ] Yes  [ ] No  [ ] Not Applicable
```

## `dms-plan-summary.md`

```markdown
# Summary — what this draft assumes, and what it needs from you

## Proposed

- **Elements 1, 2 and 3: Yes.** The award generates scientific data and nothing in the
  aims indicates data that cannot be shared at all; dbGaP and GEO both retain deposits
  well beyond a project period.
- **Element 7a: Yes.** The project generates large-scale human genomic data, so the GDS
  Policy applies and NIH expects deposit in an NIH-designated repository.

## Inferred

- **Large-scale human genomic data**, from "genetic studies of VWF antigen levels",
  "more than two dozen loci" and the sequencing aims. This is what triggers element 7.
- **Human participants**, from the cohort and ancestry language.
- **A plasma proteomic component and an endothelial cell model**, from the mechanism aims.
- **No animal data**, and no imaging.

## Decided

- **dbGaP** for genotype and linked phenotype, **GEO** for expression, **GWAS Catalog**
  for summary statistics, **PRIDE** for proteomics. These are examples, which is what
  element 6 asks for — replace any your programme officer or institution prefers.
- **Element 4 describes controlled access as a limitation.** Controlled access is a
  restriction on who may obtain the data, so it belongs here; leaving element 4 empty on
  a human genomic study is a common way plans come back for revision.
- The **embargo paragraph in element 4 is conditional**. Delete it if no external
  biorepository MTA applies to this award.

## Outstanding — these are yours to answer

- **Element 5** is left blank deliberately. It asserts that participant privacy, rights
  and confidentiality *are* protected as outlined in NOT-OD-22-213 — a statement about
  your consent forms, IRB determinations and data security arrangements. That is a claim
  under your name, not an inference from your aims.
- **Element 7b** is left blank deliberately. The Institutional Certification is signed by
  your institutional signing official, who determines whether the consents permit the
  intended sharing. Ask your sponsored programmes office before answering.

## Check before submitting

- Element 4 is 300 words maximum; it is currently within that but will not stay so if you
  add to it.
- Element 6 is 100 words maximum, counted across the whole table.
- If your competing application was submitted before 2026-05-25 and is not yet awarded,
  this plan goes in at Just-in-Time rather than with the application.
```

---

# Example 2 — animal study, no human data

Elements 5 and 7 are `Not Applicable` on the facts. Element 4 is short because there is
genuinely nothing limiting sharing — which is a legitimate answer, and much more common than
the length of Example 1 suggests.

## `dms-plan.md`

```markdown
# Data Management and Sharing Plan

## 1. Maximum appropriate sharing of scientific data underlying peer-reviewed publications and other findings resulting from this award, including preprints, refereed papers reported at conferences, and other findings?

[x] Yes  [ ] No

## 2. Will the scientific data underlying peer-reviewed publications be shared by the time of publication, or for other findings, by the end of the period of performance including no-cost extensions?

[x] Yes  [ ] No

## 3. Will shared scientific data be made available for at least as long as required by applicable data repository policies and/or journal policies?

[x] Yes  [ ] No

## 4. Limitations on sharing, and the ethical, legal, or technical factors behind them

No limitations on sharing are anticipated. All scientific data generated under this
award derive from mouse experiments and carry no participant privacy considerations.
Raw electrophysiology recordings are large but within the capacity of the repositories
named below, so volume is not a barrier to deposit.

## 5. If scientific data derived from human research participants will be shared, will privacy, rights, and confidentiality of participants be protected as outlined in NOT-OD-22-213?

[ ] Yes  [ ] No  [x] Not Applicable

## 6. Expected data types and repositories

| Expected Data Type | Established Repository or Example |
|---|---|
| Mouse in vivo extracellular electrophysiology | DANDI |
| Mouse two-photon calcium imaging | Brain Image Library |
| Mouse behavioural event and odour-delivery logs | DANDI |
| Immunohistochemistry image stacks | Brain Image Library |

## 7. For studies subject to the NIH Genomic Data Sharing Policy

**7a.** Will you share all large-scale human genomic and associated data in an
NIH-designated repository according to the accelerated timelines expected in the GDS
Policy?

[ ] Yes  [ ] No  [x] Not Applicable

**7b.** Do you anticipate that when sharing you will be able to meet the expectations
of the Institutional Certification in the GDS Policy?

[ ] Yes  [ ] No  [x] Not Applicable
```

## `dms-plan-summary.md`

```markdown
# Summary

## Proposed
Elements 1-3 Yes. Element 5 **Not Applicable** and elements 7a/7b **Not Applicable**.

## Inferred
Mouse olfactory bulb circuit work — extracellular recording, two-photon imaging,
behaviour. No human participants and no large-scale human genomic data, so the GDS
Policy does not apply and element 5 has no subject matter.

Note the abstract says the olfactory system matters "in mammals, including humans".
That is background motivation, not a human-subjects component.

## Decided
DANDI for electrophysiology and behaviour, Brain Image Library for imaging.

## Outstanding
Nothing left blank. Element 5 and element 7b are answered Not Applicable on a factual
basis — there are no human participants — rather than left for you.
```

---

## What the checker says about both

```
dms-plan.md   (human genomic)  element 4: 215/300   element 6: 64/100   blank: ['5', '7b']   problems: 0
mouse-plan.md (animal only)    element 4:  45/300   element 6: 49/100   blank: []            problems: 0
```

Note what is *not* in either draft: no notes to the reader, no bracketed placeholders, no
instructions carried over from NIH's template. Everything a reader needs to know about how
the draft was reached is in the summary beside it. A blank in the plan is always explained
there — a blank nobody mentions is a gap that reaches a submission.
