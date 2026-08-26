// Validate every skill under skills/ against the registry's format rules.
// Exit non-zero on any error. Run by CI on PRs and locally via `npm run validate`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  listSkillDirs, listSkillFiles, parseFrontmatterNaive,
  CATEGORIES, SLUG_RE, VERSION_RE, ALLOWED_EXTENSIONS,
  MAX_COVERS, MAX_PAPERS, ACCESS_LEVELS, PAPER_ID_RE, CLIENT_READ_KEYS,
  hasSection, sectionBody,
} from './lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKILLS = path.join(ROOT, 'skills');

const MAX_FILE_BYTES = 1024 * 1024;       // 1 MB per file
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;  // 5 MB per skill
const MAX_FILES = 50;
const MAX_TAGS = 5;
const TAG_RE = /^[a-z0-9-]+$/;

// Floor on executed share of RUNNABLE blocks. Raise it as coverage improves; never
// silently lower it to make a skill pass.
const MIN_VERIFIED = 0.5;

// Instructions that hand a reader's HOST to whatever they run. A skill may document a
// container — that is an ordinary reader requirement, like a GPU — but it may never tell
// somebody to dissolve the boundary the container exists to provide. These four are
// unambiguous: each one is host root, or arbitrary unreviewed remote code. Anything
// genuinely needing them belongs upstream in the project's own docs, not in a skill an
// agent executes.
const DANGEROUS_INSTRUCTIONS = [
  [/--privileged\b/, 'container run with --privileged is host root'],
  [/\/var\/run\/docker\.sock/, 'mounting the Docker socket into a container is host root'],
  [/(?:-v|--volume)\s+\/:(?:\/|\s)/, 'mounting the host root filesystem into a container'],
  [/\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/, 'piping a download straight into a shell runs unreviewed remote code'],
];

const MAX_DESCRIPTION = 400;

// Every skill's frontmatter licence must be one we can positively identify as permissive,
// original or adapted. An unrecognised value is rejected rather than assumed benign. This
// checks the licence on the text; the access test on the tool is judgement — see AGENTS.md.
const LICENCES = [
  'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'CC-BY-4.0', 'CC0-1.0', 'ISC', 'Unlicense',
];

// SPDX semantics, not a token scan. `AND` binds tighter than `OR`, so an expression is
// acceptable when ANY or-branch is fully permitted: `MIT OR GPL-3.0` is redistributable
// under MIT and must not be rejected, while `MIT AND GPL-3.0` imposes both and must be.
// SPDX identifiers are case-insensitive, so `mit` is the same licence as `MIT` — a
// contributor should not be blocked over capitalisation.
const licencePermitted = (lic) => {
  const id = lic.replace(/\s+WITH\s+.*$/i, '').replace(/\+$/, '').trim().toLowerCase();
  return LICENCES.some((l) => l.toLowerCase() === id);
};

const licenceAcceptable = (expr) =>
  expr.replace(/[()]/g, ' ').split(/\s+OR\s+/i)
    .some((branch) => branch.split(/\s+AND\s+/i).map((s) => s.trim()).filter(Boolean).every(licencePermitted));

const errors = [];
const err = (slug, msg) => errors.push(`${slug}: ${msg}`);

const slugs = listSkillDirs(SKILLS);
const attributed = new Set();
const tagUses = new Map();
const coversUses = new Map();
// Skills whose frontmatter could not be read at all. They already reported a real
// error; the NOTICE pairing below cannot say anything true about them, so it stays
// quiet rather than adding a second, misleading one.
const unreadable = new Set();

for (const slug of slugs) {
  const dir = path.join(SKILLS, slug);
  const skillMd = path.join(dir, 'SKILL.md');

  if (!SLUG_RE.test(slug)) err(slug, `directory name must match ${SLUG_RE}`);
  if (!fs.existsSync(skillMd)) { err(slug, 'missing SKILL.md'); unreadable.add(slug); continue; }

  const raw = fs.readFileSync(skillMd, 'utf8');

  // Full YAML parse (what the site consumes).
  let fm;
  try { fm = yaml.load(raw.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? '') ?? {}; }
  catch (e) { err(slug, `frontmatter is not valid YAML: ${e.message}`); unreadable.add(slug); continue; }

  // 1. Loader compatibility: the client's naive line parser must read the SAME
  //    name + description as real YAML. Block scalars (`>`/`|`), quoting, or
  //    multi-line values make the two diverge, so the client would load garbage.
  const naive = parseFrontmatterNaive(raw).frontmatter;
  if ((naive.name ?? '') !== String(fm.name ?? '')) {
    err(slug, `name must be a single-line scalar — the loader would read "${naive.name ?? ''}", not "${fm.name ?? ''}"`);
  }
  if ((naive.description ?? '') !== String(fm.description ?? '')) {
    err(slug, `description must be a single-line scalar (no block scalars \`>\`/\`|\` or quoting) — the loader would read "${(naive.description ?? '').slice(0, 40)}…"`);
  }

  // 1a. Client/YAML agreement on every key the client reads. That same parser has no nesting
  //     model — it splits every line on its first colon — so the children of a multi-line
  //     mapping land in the TOP-level namespace, and it is last-write-wins. `verified:` does
  //     this harmlessly: its date/against/executed keys are visible to the client and unused.
  //
  //     The invariant that matters is not "is there a nested key" but **the client must read
  //     the same value as YAML**. Checks 1 above enforce exactly that for `name` and
  //     `description`; this extends it to `allowed-tools`, which had no such comparison and
  //     is the one that grants capability.
  //
  //     Written first as a presence test (`flat && !top`) and that was backwards: it fired
  //     only when the top-level key was ABSENT — the harmless direction — and stayed silent
  //     when a nested occurrence overwrote a real one. 18 of the corpus carry a top-level
  //     `allowed-tools`, so that silent case was the normal one. A skill could ship
  //     `allowed-tools: Read` to reviewers and install `Bash, Write, Edit`.
  for (const key of CLIENT_READ_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(naive, key)) continue;
    const asClient = String(naive[key] ?? '');
    const asYaml = fm[key] === undefined ? '' : String(fm[key]);
    if (asClient !== asYaml) {
      err(slug, `the client would read ${key} as "${asClient.slice(0, 40)}" but YAML says "${asYaml.slice(0, 40)}" — a nested or repeated \`${key}:\` line is overwriting it`);
    }
  }

  // 2. Identity.
  if (fm.name !== slug) err(slug, `frontmatter name "${fm.name}" must equal directory name "${slug}"`);
  if (!String(fm.description || '').trim()) err(slug, 'description is required');

  // 3. Category.
  if (!CATEGORIES.includes(fm.category)) {
    err(slug, `category must be one of ${CATEGORIES.join(', ')} (got "${fm.category ?? 'none'}")`);
  }

  // Adapted-skill detection gates a licence obligation, so a malformed value must
  // fail loudly rather than read as "not adapted". `attribution: []` stringifies to
  // '' and would otherwise silently suppress the NOTICE requirement below.
  if (fm.attribution !== undefined) {
    if (typeof fm.attribution !== 'string' || !fm.attribution.trim()) {
      err(slug, 'attribution must be a non-empty string (the source URL) when present');
    } else if (!/^https?:\/\//.test(fm.attribution.trim())) {
      // The site renders this straight into an href. Escaping protects the attribute but
      // not the scheme, so `javascript:…` here produced a live link on a public page.
      // Found by audit, pre-dates the discovery keys; fixed at the gate because the
      // renderer should not be the only thing standing between frontmatter and an href.
      err(slug, `attribution must be an http(s) URL — "${String(fm.attribution).slice(0, 40)}" is rendered as a link, and a non-http scheme becomes a live one`);
    } else {
      attributed.add(slug);
    }
  }

  // 3b. Licence. Permissive and positively identified, or it does not ship.
  const licence = String(fm.license ?? '').trim();
  if (!licence) {
    err(slug, 'license is required');
  } else if (!licenceAcceptable(licence)) {
    err(slug, `license "${licence}" is not permitted — no branch of it is fully covered by ${LICENCES.join(', ')}`);
  }

  // 3b-ii. Version. Required, and MAJOR.MINOR.PATCH so it sorts and compares.
  //     `version` is the only signal a reader or an installing client has that a published
  //     page changed underneath them, which makes an absent or malformed one worse than a
  //     stale one: stale is wrong, absent is unanswerable. `pathway-cca-coessentiality`
  //     shipped with no `version` key at all and nothing noticed, because nothing looked.
  //     What this cannot check is whether the number was bumped when the body changed —
  //     that needs the diff, and lives in scripts/check-versions.js.
  const version = String(fm.version ?? '').trim();
  if (!version) {
    err(slug, 'version is required — it is the only signal a reader has that this page changed');
  } else if (!VERSION_RE.test(version)) {
    err(slug, `version "${version.slice(0, 20)}" must be MAJOR.MINOR.PATCH without leading zeros (e.g. 1.2.0)`);
  }

  // 3c. Description budget. Every installed skill's description is loaded into every
  //     session whether or not the skill is used, so length is a shared cost — roughly
  //     a quarter of a token per character, per installed skill, per session.
  //     Raised 250 -> 400 on 2026-08-16: descriptions were running at a median of 223 of
  //     250, so authors were truncating rather than choosing. A data skill has more to say
  //     than a tool skill — source, modality, tissue, organism, what you get back.
  //     The long-tail search vocabulary belongs in `covers`, which is not loaded per
  //     session and so costs nothing here; this budget is for routing and for humans.
  const desc = String(fm.description ?? '');
  if (desc.length > MAX_DESCRIPTION) {
    err(slug, `description is ${desc.length} characters, over the ${MAX_DESCRIPTION} budget`);
  }

  // 4. Body non-empty.
  const body = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  if (!body.trim()) err(slug, 'SKILL.md body is empty');

  // Most of the corpus is references/, and SKILL.md tells the agent to load them, so a
  // dead cross-reference hides there just as well as in the body. Scan both.
  const refBodies = listSkillFiles(dir)
    .filter((rel) => rel.startsWith('references/') && rel.endsWith('.md') && !rel.includes('..'))
    .map((rel) => path.join(dir, rel))
    .filter((abs) => fs.existsSync(abs) && fs.lstatSync(abs).isFile())
    .map((abs) => fs.readFileSync(abs, 'utf8'));

  // 4a. Body traps. Both send an agent somewhere that does not exist: a cross-reference
  //     to a skill outside this registry, or a scripts/ directory this repo never ships.
  //     Slugs are lowercase, so compare lowercased — prose capitalises names.
  const deadRef = (name, where) => {
    if (!slugs.includes(name.toLowerCase())) {
      err(slug, `${where} references "${name}", which is not a skill in this registry`);
    }
  };

  // Prose capitalises names, and slugs are lowercase — compare lowercased. A bare word
  // is only treated as a skill name if it is hyphenated or already a slug: "see the same
  // skill triggered twice" is ordinary English, not a reference. A delimited name is
  // always a reference, whatever it looks like.
  const looksLikeSkill = (n) => n.includes('-') || slugs.includes(n.toLowerCase());
  for (const text of [body, ...refBodies]) {
    for (const m of text.matchAll(/\b(?:see|use|refer to) the (?:`([A-Za-z0-9-]+)`|([A-Za-z0-9-]+)) skill\b/gi)) {
      const name = m[1] ?? m[2];
      if (m[1] || looksLikeSkill(name)) deadRef(name, 'body');
    }

    // AGENTS.md names "any related skills section" as the other place this hides. Every
    // name bulleted under that heading reads as a registry skill, so a library listed
    // there is a dead reference too.
    const heading = text.match(/^#{2,4}[ \t]*Related skills[ \t]*\r?\n([\s\S]*)/mi);
    if (heading) {
      for (const line of heading[1].split(/^#{1,4}[ \t]/m)[0].split('\n').filter((l) => /^\s*[-*]\s/.test(l))) {
        for (const m of line.matchAll(/(?:\*\*([A-Za-z0-9-]{2,})\*\*|`([A-Za-z0-9-]{2,})`)/g)) {
          deadRef(m[1] ?? m[2], 'the Related skills section');
        }
      }
    }
  }

  // 4b. Tags. Optional, but the site reads them with Array.isArray — so a plain
  //     string parses fine here and then silently renders nothing. Fail loudly
  //     instead, and keep the vocabulary lowercase-hyphenated so the registry
  //     filter doesn't accumulate three spellings of the same tag.
  if (fm.tags !== undefined) {
    if (!Array.isArray(fm.tags)) {
      err(slug, `tags must be a list (e.g. [a, b]) — "${String(fm.tags).slice(0, 40)}" would be ignored entirely`);
    } else {
      if (fm.tags.length > MAX_TAGS) err(slug, `${fm.tags.length} tags exceeds cap of ${MAX_TAGS}`);
      if (new Set(fm.tags).size !== fm.tags.length) err(slug, 'tags contains duplicates');
      for (const t of fm.tags) {
        if (typeof t !== 'string' || !TAG_RE.test(t)) {
          err(slug, `tag "${t}" must be lowercase letters, digits and hyphens`);
        } else {
          tagUses.set(t, (tagUses.get(t) ?? 0) + 1);
        }
      }
    }
  }

  // 4b-i. Discovery and provenance keys. Optional everywhere, expected on `category: data`.
  //
  //     Why these exist rather than a longer description: a skill's whole searchable surface
  //     on the site is name + slug + description + tags + category, AND-matched. Body text is
  //     invisible. So "liver rna-seq" could never reach a project skill whose description
  //     spends its budget naming the project. `covers` carries that vocabulary instead, and
  //     unlike `description` it is never loaded into session context — search reach at no
  //     per-session cost.
  //
  //     `covers` is free text on purpose. Tissue, assay, organism, platform, whatever a
  //     reader would actually type. The singleton report at the end of this run surfaces
  //     fragmentation (liver/hepatic/hepatocyte) without forbidding it.
  if (fm.covers !== undefined) {
    if (!Array.isArray(fm.covers)) {
      err(slug, `covers must be a list (e.g. [liver, rna-seq]) — "${String(fm.covers).slice(0, 40)}" would be ignored entirely`);
    } else {
      if (fm.covers.length > MAX_COVERS) err(slug, `${fm.covers.length} covers terms exceeds cap of ${MAX_COVERS}`);
      const seen = new Set();
      for (const c of fm.covers) {
        if (typeof c !== 'string' || !c.trim()) {
          err(slug, `covers entry "${c}" must be a non-empty string`);
        } else {
          const k = c.trim().toLowerCase();
          if (seen.has(k)) err(slug, `covers contains a duplicate: "${c}"`);
          seen.add(k);
          coversUses.set(k, (coversUses.get(k) ?? 0) + 1);
        }
      }
    }
  }

  //     `papers` is the provenance a dataset card needs — the paper defining the resource,
  //     and papers that used it. Both id forms are real: PubMed-indexed work has a PMID,
  //     deposits on Zenodo or Dryad have a DOI and no PMID.
  if (fm.papers !== undefined) {
    if (!Array.isArray(fm.papers)) {
      err(slug, `papers must be a list (e.g. [PMID:31597973]) — "${String(fm.papers).slice(0, 40)}" would be ignored entirely`);
    } else {
      if (fm.papers.length > MAX_PAPERS) err(slug, `${fm.papers.length} papers exceeds cap of ${MAX_PAPERS}`);
      if (new Set(fm.papers).size !== fm.papers.length) err(slug, 'papers contains duplicates');
      for (const p of fm.papers) {
        if (typeof p !== 'string' || !PAPER_ID_RE.test(p)) {
          err(slug, `paper id "${p}" must be PMID:<digits> or doi:10.<registrant>/<suffix>`);
        }
      }
    }
  }

  //     `access` records the route THIS skill documents. It is the §3b access test made
  //     mechanical, not a relaxation of it: a skill whose only route is approval-only is the
  //     "access granted case by case" rejection and does not ship. Sources with tiers list
  //     both — GTEx is [open, controlled], documents the open summary tier, and names the
  //     controlled tier so a reader learns which side their question sits on.
  //     Required on `data`, because a gate you can skip by not declaring it is not a gate.
  //     Written first as optional-if-present, which meant the controlled-only rejection was
  //     opt-in: the author who would fail it simply omitted the key.
  if (fm.category === 'data' && fm.access === undefined) {
    err(slug, 'a data skill must declare access: [open|registered|controlled] — state the route a reader takes to the data');
  }
  if (fm.access !== undefined) {
    if (!Array.isArray(fm.access)) {
      err(slug, `access must be a list (e.g. [open]) — "${String(fm.access).slice(0, 40)}" would be ignored entirely`);
    } else if (fm.access.length === 0) {
      err(slug, 'access is an empty list — state the route the skill documents, or omit the key');
    } else {
      for (const a of fm.access) {
        if (!ACCESS_LEVELS.includes(a)) {
          err(slug, `access "${a}" must be one of ${ACCESS_LEVELS.join(', ')}`);
        }
      }
      if (fm.access.every((a) => a === 'controlled')) {
        err(slug, 'access is controlled-only — no reader has a lawful route, which is the settled §3b rejection. Document an open or registered route, or do not ship this skill');
      }
    }
  }

  //     `platform` records shared infrastructure (snovault, hive-elasticsearch). One skill
  //     per project means several skills over one platform, and when that platform's query
  //     grammar drifts nothing else records the kinship — it gets fixed in one and rots in
  //     the others. This is what makes that sweepable.
  if (fm.platform !== undefined) {
    if (typeof fm.platform !== 'string' || !TAG_RE.test(fm.platform)) {
      err(slug, `platform "${fm.platform}" must be a single lowercase-hyphenated token`);
    }
  }

  // 4c. Datasets. `## Try it` (§7a of adding-skills.md) declares the data a reader runs the
  //     skill against, and scripts/check-datasets.js probes those URLs nightly. It reads
  //     this key with real YAML, so anything that parses to a non-list — or to a list
  //     holding something that is not an https URL — would never be probed. Gate the shape
  //     here, on every PR, rather than discovering it at 07:00 UTC. Same reasoning as tags
  //     above: silently ignored is the failure mode worth failing loudly on.
  //     An explicit empty list is legal and meaningful: "generated inline, nothing to fetch".
  const hasTryIt = hasSection(raw, 'Try it');
  if (fm.datasets !== undefined) {
    if (!Array.isArray(fm.datasets)) {
      err(slug, `datasets must be a list (e.g. [https://…]) — "${String(fm.datasets).slice(0, 40)}" would never be probed`);
    } else {
      for (const d of fm.datasets) {
        if (typeof d !== 'string' || !/^https:\/\//.test(d.trim())) {
          err(slug, `dataset "${String(d).slice(0, 60)}" must be an https:// URL — anything else is silently skipped by the liveness check`);
        }
      }
    }
    if (!hasTryIt) err(slug, 'declares datasets but has no "## Try it" section — nothing tells a reader what the data is for');
  } else if (hasTryIt) {
    err(slug, 'has "## Try it" but declares no datasets: — add `datasets: [https://…]`, or `datasets: []` if the data is generated inline');
  }

  // 4d. Every skill must be testable (§7a). A skill that predates the rule carries
  //     `try-it: pending` in its OWN frontmatter rather than sitting in a list here.
  //     That is deliberate: the nightshift publishes one skill's files at a time, so an
  //     exemption stored anywhere else makes backfilling a two-file change the routine
  //     cannot make, and the whole queue deadlocks. Backfilling is now: delete the marker,
  //     add the section. One file.
  // Strict, not stringified. `String(['pending'])` is the bare word `pending`, so
  // `try-it: [pending]` — a list — bought the exemption and, once 4d-i below started reading
  // this flag, bypassed the `## Get the files` requirement too.
  const exempt = fm['try-it'] === 'pending';
  if (exempt && hasTryIt) {
    err(slug, 'has "## Try it" but still declares `try-it: pending` — drop that line, it is only for skills awaiting backfill');
  }
  if (!hasTryIt && !exempt) {
    err(slug, 'missing a "## Try it" section — every new skill must be runnable and checkable (§7a). A skill awaiting backfill declares `try-it: pending`, but a new one may not');
  }
  if (fm['try-it'] !== undefined && !exempt) {
    err(slug, `try-it must be \`pending\` or absent — got "${String(fm['try-it']).slice(0, 30)}"`);
  }

  // 4d-i. A `data` skill has to end in files on disk. The point of the category is that an
  //     agent can obtain data, and the likeliest failure is a skill that teaches a query
  //     grammar beautifully and stops at a printed result — the API is the interesting part
  //     to write, and the download is the part the reader actually needed. Requiring the
  //     section makes that omission visible at review instead of at use.
  //
  //     Reuses the `try-it: pending` backfill marker rather than inventing a second one: a
  //     skill that has not been made testable at all cannot be expected to document a
  //     verified download, and both clear together when the routine touches it.
  if (fm.category === 'data' && !exempt && !hasSection(raw, 'Get the files')) {
    err(slug, 'a data skill must have a "## Get the files" section — retrieving the data is the point of the category, and a skill that stops at a query result has not delivered it');
  }

  // 4d-ii. A skill documenting a controlled tier owes the reader the way through it.
  //
  //     `access` records what a reader meets. Declaring `controlled` is a statement that some
  //     of what this skill describes sits behind an application — committee review, an
  //     institutional agreement, a data use certification. That is allowed, and it is not the
  //     §3b rejection, because what the SKILL instructs is still open: query a public
  //     catalogue, read the terms, report the requirements. The controlled tier is described,
  //     never used. `access: [controlled]` alone remains rejected above — that is a skill that
  //     can deliver nothing.
  //
  //     What turns that from a dead end into something useful is telling the reader what
  //     applying involves, so a person can decide before spending months. Hence the section.
  //     Unconditional, with no `try-it: pending` escape: declaring `controlled` is an active
  //     choice made while writing the skill, not a state inherited from before the rule.
  //
  //     The section is also where the boundary gets stated. A skill may draft a research use
  //     statement, checklist requirements, and name the timelines. It may not fill in
  //     attestations — those are legal claims about IRB approval, data security and
  //     re-identification, published under a named applicant, and an agent that makes them
  //     easy to produce makes them easy to produce carelessly.
  if (Array.isArray(fm.access) && fm.access.includes('controlled')) {
    const body = sectionBody(raw, 'Requesting access');
    if (body === null) {
      err(slug, 'declares access: controlled but has no "## Requesting access" section — a level-2 heading in SKILL.md, outside any code block. Say who may apply, what the application requires and how long it takes, or do not claim the controlled tier');
    } else if (!body.trim()) {
      err(slug, '"## Requesting access" is empty — a heading over nothing tells a reader less than omitting the controlled tier would');
    }
  }

  // 4e. Verification coverage (§7). The registry's claim is that skills are executed, not
  //     merely written — but "every block ran" has never been literally true, and the
  //     disclosure lived in PR bodies no reader sees: `biopython` shipped 43 unexecuted
  //     Entrez/BLAST blocks, `polars-bio` its whole `s3://` surface. This makes the claim
  //     checkable instead of aspirational.
  //
  //     Declared, not computed. Of 1037 code blocks in the registry, most are narrative
  //     fragments that continue from earlier context and cannot run standalone by
  //     construction — so a computed denominator would punish good skills for prose style.
  //     The author states how many RUNNABLE blocks they ran; we check the shape, the floor,
  //     and the age. Trusting the author is the deliberate trade: a wrong number is visible
  //     and re-auditable, an absent one is not.
  const V = fm.verified;
  if (V === undefined) {
    err(slug, 'missing `verified:` — state when this skill was last executed and what fraction of its runnable blocks ran (§7)');
  } else if (V === 'pending') {
    // Predates the rule. The nightshift fills it in when it next touches the skill, the
    // same way `try-it: pending` clears. This list can only shrink.
  } else if (typeof V !== 'object' || Array.isArray(V)) {
    err(slug, 'verified must be a mapping (date/against/executed/unverified) or the literal `pending`');
  } else {
    // YAML turns an unquoted 2026-08-09 into a Date, so accept both rather than making
    // every author remember to quote it.
    const vdate = V.date instanceof Date
      ? V.date.toISOString().slice(0, 10)
      : String(V.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vdate)) {
      err(slug, `verified.date must be YYYY-MM-DD — got "${vdate.slice(0, 20)}"`);
    } else if (vdate > new Date().toISOString().slice(0, 10)) {
      err(slug, `verified.date is in the future (${vdate}) — it records when the run happened`);
    }
    if (!String(V.against ?? '').trim()) {
      err(slug, 'verified.against is required — the versions the run was made against, so a later pass knows what to re-run');
    }
    const ran = Number(V.executed), skipped = Number(V.unverified ?? 0);
    if (!Number.isInteger(ran) || ran < 0) {
      err(slug, 'verified.executed must be a non-negative integer (runnable blocks actually executed)');
    } else if (!Number.isInteger(skipped) || skipped < 0) {
      err(slug, 'verified.unverified must be a non-negative integer');
    } else {
      const runnable = ran + skipped;
      if (runnable === 0) {
        err(slug, 'verified.executed + verified.unverified is 0 — a skill with no runnable block cannot claim verification');
      } else {
        const pct = ran / runnable;
        if (pct < MIN_VERIFIED) {
          err(slug, `only ${ran}/${runnable} runnable blocks executed (${Math.round(pct * 100)}%) — the floor is ${Math.round(MIN_VERIFIED * 100)}%. Execute more, or drop what cannot be verified`);
        }
        // An unverified block must say why, or nobody can act on it later.
        if (skipped > 0 && !String(V.unverified_reason ?? '').trim()) {
          err(slug, `${skipped} block(s) unverified but no verified.unverified_reason — say what blocked them and what would unblock it`);
        }
      }
    }
  }

  // 4f. Container and shell safety. Skills document tools; a container-based tool is fine
  //     (§3b treats a runtime like a GPU). What is never fine is instructing a reader — or
  //     an agent acting for them — to give away the host. Checked across every markdown
  //     file in the skill, code block or prose, because a copyable line is a copyable line.
  for (const rel of listSkillFiles(dir).filter((f) => f.toLowerCase().endsWith('.md'))) {
    let text;
    try { text = fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { continue; }
    for (const [re, why] of DANGEROUS_INSTRUCTIONS) {
      const hit = text.match(re);
      if (hit) {
        err(slug, `${rel} instructs "${hit[0].trim().slice(0, 48)}" — ${why}. Skills never tell a reader to escalate privilege; document the tool, not a way around its sandbox`);
      }
    }
  }

  // 4g. `## Try it` has to run cold. The section exists so a reader — or a re-audit months
  //     from now — can check the skill without reading the rest of it, and that only works
  //     if the block provisions whatever it invokes.
  //
  //     The failure is invisible to the routine that validates skills, which is why this is
  //     a gate and not advice: it executes EVERY fenced block, in order, in ONE working
  //     directory. An earlier block writes `foo.py`; `## Try it` then shells out to it and
  //     passes — truthfully, in a directory the earlier steps primed. Run the same block in
  //     a fresh directory and it fails, and `verified:` has already counted it as executed.
  if (hasTryIt) {
    const tryBody = (raw.match(/^##\s+Try it\s*$([\s\S]*?)(?=^##\s|\Z)/m) || [])[1] || '';
    for (const [, code] of tryBody.matchAll(/```(?:python|bash|sh)\n([\s\S]*?)```/g)) {
      const invoked = new Set();
      // A local script named as a string arg, or run by an interpreter.
      for (const m of code.matchAll(/["']([\w./-]+\.(?:py|sh|R|rb|pl))["']/g)) invoked.add(m[1]);
      for (const m of code.matchAll(/(?:python3?|bash|sh|Rscript)\s+([\w./-]+\.(?:py|sh|R))/g)) invoked.add(m[1]);
      for (const f of invoked) {
        const base = f.replace(/^\.\//, '');
        const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Does this same block create it? open(...,"w"), Path.write_text, a heredoc, cp/mv.
        const creates = new RegExp(
          `(open\\(\\s*["']${esc}["']\\s*,\\s*["'][wax]|` +
          `Path\\(\\s*["']${esc}["']\\s*\\)\\s*\\.write_|` +
          `["']${esc}["']\\s*\\)?\\s*\\.write_text|` +
          `cat\\s*>\\s*${esc}|cp\\s+\\S+\\s+${esc}|mv\\s+\\S+\\s+${esc})`
        ).test(code);
        if (!creates) {
          err(slug, `"## Try it" invokes ${base} but never creates it — the block must run in a fresh directory. Write it inline, or drop the section's self-contained claim and have it fail with a message naming the missing file`);
        }
      }
    }
  }

  // 5. Path safety + file types.
  const files = listSkillFiles(dir);
  for (const rel of files) {
    if (rel.includes('..') || path.isAbsolute(rel)) { err(slug, `unsafe file path: ${rel}`); continue; }
    const abs = path.join(dir, rel);
    const lst = fs.lstatSync(abs);
    if (lst.isSymbolicLink()) { err(slug, `symlink not allowed: ${rel}`); continue; }
    if (lst.size > MAX_FILE_BYTES) err(slug, `${rel} exceeds ${MAX_FILE_BYTES} bytes`);

    // Skills ship documentation only — clients refuse anything else, so a
    // non-doc file would publish here and fail to install everywhere.
    if (!ALLOWED_EXTENSIONS.includes(path.extname(rel).toLowerCase())) {
      err(slug, `${rel} is not an allowed file type (skills ship documentation only: ${ALLOWED_EXTENSIONS.join(', ')})`);
    }
  }

  // 6. Size / count caps.
  if (files.length > MAX_FILES) err(slug, `${files.length} files exceeds cap of ${MAX_FILES}`);
  const total = files.reduce((n, rel) => n + fs.statSync(path.join(dir, rel)).size, 0);
  if (total > MAX_TOTAL_BYTES) err(slug, `total size ${total} exceeds ${MAX_TOTAL_BYTES} bytes`);
}

// 7. Attribution ⇄ NOTICE. An adapted skill redistributes someone else's work, so
//    its NOTICE stanza is a licence obligation rather than bookkeeping. Checked
//    both ways: a missing stanza publishes uncredited, and a stale one credits a
//    skill that no longer exists or was never adapted. The routine that opens
//    skill PRs cannot write NOTICE — it is outside skills/<slug>/ — so without
//    this check an adapted skill merges green with its attribution missing.
const noticePath = path.join(ROOT, 'NOTICE');
if (!fs.existsSync(noticePath)) {
  err('NOTICE', 'missing — every adapted skill is credited there');
} else {
  const notice = fs.readFileSync(noticePath, 'utf8');

  // Read only the indented `  skills/<slug>` list lines of a stanza. Scanning the
  // whole file would treat any matching substring as a credit, so a URL such as
  // github.com/org/skills/tree/main/foo would invent the slug "tree" and fail the
  // build. Stanza lines carry two columns, hence matchAll per line.
  const listed = new Set(
    notice.split('\n')
      .filter((line) => /^\s{2,}(?:skills\/[a-z0-9-]+\s*)+$/.test(line))
      .flatMap((line) => [...line.matchAll(/skills\/([a-z0-9-]+)/g)].map((m) => m[1])),
  );

  for (const slug of attributed) {
    if (!listed.has(slug)) {
      err(slug, 'has an attribution: field but no NOTICE entry — adapted skills must be credited in NOTICE');
    }
  }
  for (const slug of listed) {
    if (!slugs.includes(slug)) err('NOTICE', `credits skills/${slug}, which does not exist`);
    else if (!attributed.has(slug) && !unreadable.has(slug)) err('NOTICE', `credits skills/${slug}, which has no attribution: field`);
  }
}

// Repo hygiene, over the whole tracked tree rather than just skills/.
//
// `skills/` already refused symlinks. That rule was right and its scope was wrong: the
// node_modules link sat at the repo root, outside it, for three days.
//
// The symlink half is a proof — a tracked mode of 120000 IS a symlink, and no amount of path
// formatting hides it. The home-path half is a TRIPWIRE, not a proof: it catches the shape
// that has actually leaked here and misses others (no trailing slash, a file:// URL, a tilde,
// backslashes, UTF-16, anything encoded). Read a pass as "the obvious form is absent", never
// as "there is no path in here".
//
// Reads the git index, not the filesystem, so untracked scratch and ignored build output are
// none of its business.
const HYGIENE_ALLOW = 'hygiene-allow';

function repoHygiene() {
  let tracked, top;
  try {
    top = execFileSync('git', ['rev-parse', '--show-toplevel'],
                       { cwd: ROOT, encoding: 'utf8' }).trim();
    // -z, because `ls-files -s` C-quotes any path with non-ASCII, a tab or a newline
    // ("caf\303\251.md"), which then fails to resolve on disk and was silently skipped.
    // One mis-named directory would have exempted every file under it.
    tracked = execFileSync('git', ['ls-files', '-sz'],
                           { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    console.warn(`[hygiene] tracked-tree checks skipped: ${e.code || e.message}`);
    return;
  }
  // `git ls-files` inside an unrelated PARENT repo succeeds and returns nothing, so the loop
  // would pass a leak in silence. Only a real toplevel match means we scanned what we think.
  if (path.resolve(top) !== path.resolve(ROOT)) {
    console.warn(`[hygiene] git toplevel is ${top}, not ${ROOT} — tracked-tree checks skipped`);
    return;
  }

  const HOME_PATH = /(^|[\s"'`(=:<>{|,])\/(?:Users|home)\/[A-Za-z0-9._-]+\//;
  for (const line of tracked.split('\0')) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const mode = line.slice(0, line.indexOf(' '));
    const file = line.slice(tab + 1);
    if (mode === '120000') {
      err('repo', `tracked symlink: ${file} — a link's blob is its target's path, and this history is public`);
      continue;
    }
    if (mode === '160000') continue;                     // gitlink; nothing to read
    const abs = path.join(ROOT, file);
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;
    const buf = fs.readFileSync(abs);
    if (buf.includes(0)) continue;                       // binary
    const text = buf.toString('utf8');
    if (text.includes(HYGIENE_ALLOW)) continue;          // deliberate, and visible in review
    const m = HOME_PATH.exec(text);
    if (m) {
      err('repo', `tracked file ${file} contains an absolute home path (${m[0].trim().slice(0, 44)}…) — `
                + `elide the username, or add the marker ${HYGIENE_ALLOW} if the path is genuinely `
                + `part of the documentation`);
    }
  }
}
repoHygiene();

if (errors.length) {
  console.error(`✗ validation failed (${errors.length}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✓ ${slugs.length} skill(s) valid (${attributed.size} adapted, all credited in NOTICE)`);

// Not a failure. A tag only one skill uses renders as a filter chip that returns that
// one skill, so vocabulary growth is worth seeing at review time rather than a year on.
const singletons = [...tagUses.entries()].filter(([, n]) => n === 1).map(([t]) => t);
if (singletons.length) {
  console.log(`  ${tagUses.size} unique tags; ${singletons.length} used by a single skill — prefer an existing tag over a new synonym`);
}

// Same reasoning, weaker rule. `covers` is free text by design, so a singleton is often
// correct — one project really is the only source of a given assay. What this catches is
// drift between spellings of the same idea (liver / hepatic / hepatocyte), which nothing
// else would surface until search quietly stopped working.
const coversSingletons = [...coversUses.entries()].filter(([, n]) => n === 1).length;
if (coversUses.size) {
  console.log(`  ${coversUses.size} unique covers terms; ${coversSingletons} used by a single skill — free text by design, but check for spelling drift`);
}
