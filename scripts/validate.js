// Validate every skill under skills/ against the registry's format rules.
// Exit non-zero on any error. Run by CI on PRs and locally via `npm run validate`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  listSkillDirs, listSkillFiles, parseFrontmatterNaive,
  CATEGORIES, SLUG_RE, ALLOWED_EXTENSIONS,
} from './lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKILLS = path.join(ROOT, 'skills');

const MAX_FILE_BYTES = 1024 * 1024;       // 1 MB per file
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;  // 5 MB per skill
const MAX_FILES = 50;
const MAX_TAGS = 5;
const TAG_RE = /^[a-z0-9-]+$/;
const MAX_DESCRIPTION = 250;

// A skill ships only under a licence we can positively identify as permissive. An
// unrecognised value is rejected rather than assumed benign — see AGENTS.md. Compound
// expressions are split on AND/OR and every part must be on the list.
const LICENCES = [
  'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'CC-BY-4.0', 'CC0-1.0', 'ISC', 'Unlicense',
];

const errors = [];
const err = (slug, msg) => errors.push(`${slug}: ${msg}`);

const slugs = listSkillDirs(SKILLS);
const attributed = new Set();
const tagUses = new Map();
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
    } else {
      attributed.add(slug);
    }
  }

  // 3b. Licence. Permissive and positively identified, or it does not ship.
  const licence = String(fm.license ?? '').trim();
  if (!licence) {
    err(slug, 'license is required');
  } else {
    const parts = licence.split(/\s+(?:AND|OR)\s+/).map((s) => s.trim()).filter(Boolean);
    const bad = parts.filter((p) => !LICENCES.includes(p));
    if (bad.length) {
      err(slug, `license "${licence}" is not on the permitted list (${LICENCES.join(', ')}) — unrecognised: ${bad.join(', ')}`);
    }
  }

  // 3c. Description budget. Every installed skill's description is loaded into every
  //     session whether or not the skill is used, so length is a shared cost.
  const desc = String(fm.description ?? '');
  if (desc.length > MAX_DESCRIPTION) {
    err(slug, `description is ${desc.length} characters, over the ${MAX_DESCRIPTION} budget`);
  }

  // 4. Body non-empty.
  const body = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  if (!body.trim()) err(slug, 'SKILL.md body is empty');

  // 4a. Body traps. Both send an agent somewhere that does not exist: a cross-reference
  //     to a skill outside this registry, or a scripts/ directory this repo never ships.
  for (const m of body.matchAll(/\bsee the [`"']?([a-z0-9-]+)[`"']? skill\b/gi)) {
    if (!slugs.includes(m[1])) err(slug, `body references the "${m[1]}" skill, which is not in this registry`);
  }
  if (/(^|[\s`'"(])scripts\//m.test(body)) {
    err(slug, 'body references a scripts/ path — skills ship documentation only; inline the code in a fenced block');
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
