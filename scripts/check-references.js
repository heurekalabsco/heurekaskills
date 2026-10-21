// Refuse a reference to a skill that is not there.
//
//   node scripts/check-references.js [base-ref] [--scan <dir>]...   # default base: origin/main
//
// Skills point at each other in prose — "`binder-design-filtering` carries the numbers",
// "the registry's `alphafold` skill" — and nothing checked that the slug on the other end
// still exists. A rename or a removal broke every inbound reference in silence, and the
// break surfaced only when a reader followed it (#311).
//
// Matching references by phrasing does not work. Of 111 backticked tokens in this registry
// that equal a live slug, only 29 sit in a "the `x` skill" phrase; the rest are bare
// (`protenix` predicts a complex…), and some slugs are also the names of the tools they
// document. So the gate watches the slug side instead:
//
//   1. A slug that existed at the merge base and is gone now must have an entry in
//      retired-slugs.json. Removing or renaming a skill is then a decision with a record.
//      The ledger is add-only: an entry, once merged, cannot be deleted or have its `date`
//      or `why` rewritten, or a PR could quietly un-retire a slug.
//   2. No published markdown, and none of the repo's own docs, may mention a retired slug in
//      backticks. With (1), a rename fails until every inbound reference has been swept —
//      bare ones included. A NOTICE stanza for a missing skill is validate.js's to catch.
//   3. In a --scan tree, a backticked token written as a skill ("`x` skill") must be a
//      live slug. Inside this registry validate.js already owns that check (4a).
//
// Relatedness stays prose; there is no `requires` field. This only keeps the prose honest.
//
// --scan adds markdown trees outside this repo (e.g. skills that build on this registry),
// so a downstream reference to a slug renamed or removed here is caught too.
//
// Exits 1 on a broken reference, 2 on a usage error or an unresolvable merge base.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLUG_RE, blankFences } from './lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(ROOT, 'skills');
const LEDGER = 'retired-slugs.json';
const REPO_DOCS = ['AGENTS.md', 'README.md', 'CONTRIBUTING.md'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const args = process.argv.slice(2);
const scanDirs = [];
let baseArg = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--scan') {
    // A bare --scan would resolve '' to the working directory and scan whatever is there.
    const dir = args[i + 1];
    if (!dir || dir.startsWith('--')) {
      console.error('--scan needs a directory: node scripts/check-references.js --scan <dir>');
      process.exit(2);
    }
    scanDirs.push(path.resolve(dir));
    i += 1;
  } else {
    baseArg = args[i];
  }
}
const base = baseArg || process.env.BASE_REF || 'origin/main';

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

const mergeBase = git('merge-base', base, 'HEAD').trim();
if (!mergeBase) {
  console.error(`could not resolve a merge base between "${base}" and HEAD.`);
  console.error('The ref may not exist here, or the clone is shallow and needs fetch-depth: 0.');
  console.error('Pass an explicit base: node scripts/check-references.js <ref>.');
  process.exit(2);
}

const problems = [];

// Working tree, not HEAD, for the same reason as check-versions.js: an uncommitted removal
// must not get a clean pass.
const live = new Set(fs.readdirSync(SKILLS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS, d.name, 'SKILL.md')))
  .map((d) => d.name));

// Own keys only. `slug in ledger` is also true for `constructor` and every other
// Object.prototype name, which would report `constructor` in a code span as a retired skill.
const parseLedger = (text, where) => {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    problems.push(`${where} does not parse: ${e.message}`);
    return {};
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    problems.push(`${where} must be a JSON object keyed by slug`);
    return {};
  }
  return doc;
};
const isRetired = (ledger, slug) => Object.hasOwn(ledger, slug);

const retired = fs.existsSync(path.join(ROOT, LEDGER))
  ? parseLedger(fs.readFileSync(path.join(ROOT, LEDGER), 'utf8'), LEDGER)
  : {};

for (const [slug, entry] of Object.entries(retired)) {
  const where = `${LEDGER}: "${slug}"`;
  if (!SLUG_RE.test(slug)) problems.push(`${where} is not a slug`);
  if (live.has(slug)) problems.push(`${where} is retired but skills/${slug} exists`);
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    problems.push(`${where} must be an object {successor, date, why}`);
    continue;
  }
  const extra = Object.keys(entry).filter((k) => !['successor', 'date', 'why'].includes(k));
  if (extra.length) problems.push(`${where} has unknown field(s): ${extra.join(', ')}`);
  if (!Object.hasOwn(entry, 'successor') || (entry.successor !== null && typeof entry.successor !== 'string')) {
    problems.push(`${where} needs "successor": a live slug, or null for a removal`);
  } else if (entry.successor !== null && !live.has(entry.successor)) {
    problems.push(`${where} names successor "${entry.successor}", which is not a live skill`);
  }
  if (typeof entry.date !== 'string' || !DATE_RE.test(entry.date)) {
    problems.push(`${where} needs "date" as YYYY-MM-DD`);
  }
  if (typeof entry.why !== 'string' || !entry.why.trim()) {
    problems.push(`${where} needs a one-line "why"`);
  }
}

// Add-only against the merge base. `successor` may move — when a successor is itself renamed,
// the older entry has to follow it — but an entry cannot disappear or be rewritten.
const baseLedgerText = git('show', `${mergeBase}:${LEDGER}`);
if (baseLedgerText) {
  const baseLedger = parseLedger(baseLedgerText, `${LEDGER} at the merge base`);
  for (const [slug, was] of Object.entries(baseLedger)) {
    if (!isRetired(retired, slug)) {
      problems.push(`${LEDGER}: "${slug}" was removed from the ledger — entries are permanent`);
      continue;
    }
    const now = retired[slug] || {};
    for (const k of ['date', 'why']) {
      if (was && now[k] !== was[k]) problems.push(`${LEDGER}: "${slug}".${k} was changed — entries are permanent`);
    }
  }
}

// 1. Disappearances since the merge base.
const before = new Set(git('ls-tree', '-d', '--name-only', `${mergeBase}:skills`).split('\n').filter(Boolean));
for (const slug of [...before].sort()) {
  if (!live.has(slug) && !isRetired(retired, slug)) {
    problems.push(`skills/${slug} was removed or renamed without an entry in ${LEDGER} `
                  + '— add one (with its successor, if any) and sweep inbound references');
  }
}

// Inline code only. A fenced block is example input or output, where a token that happens to
// equal a slug (`pip install alphafold`) is not a pointer to a skill. Fences are blanked, not
// removed, so the line numbers reported below still point at the real file.
const lineAt = (text, i) => text.slice(0, i).split('\n').length;

const markdownUnder = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.toLowerCase().endsWith('.md')) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
};

const docs = REPO_DOCS.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f));
const sources = [
  { files: [...markdownUnder(SKILLS), ...docs], label: (p) => path.relative(ROOT, p), named: false },
];
for (const d of scanDirs) {
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
    problems.push(`--scan ${d}: no such directory`);
    continue;
  }
  sources.push({ files: markdownUnder(d), label: (p) => `${path.basename(d)}/${path.relative(d, p)}`, named: true });
}

let refs = 0;
for (const { files, label, named } of sources) {
  for (const file of files) {
    const text = blankFences(fs.readFileSync(file, 'utf8'));

    // 2. Mentions of a retired slug, however phrased.
    for (const m of text.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)) {
      const slug = m[1];
      if (!isRetired(retired, slug)) continue;
      const next = retired[slug] && retired[slug].successor;
      problems.push(`${label(file)}:${lineAt(text, m.index)} mentions retired skill \`${slug}\``
                    + (next ? ` — now \`${next}\`` : ' — it was removed; reword or drop the pointer'));
    }

    // 3. A token written as a skill must be one. `\s+` spans a line break, since prose wraps.
    if (!named) continue;
    for (const m of text.matchAll(/`([a-z0-9][a-z0-9-]*)`\s+skills?\b/g)) {
      refs += 1;
      const slug = m[1];
      if (live.has(slug) || isRetired(retired, slug)) continue;   // retired is reported above
      problems.push(`${label(file)}:${lineAt(text, m.index)} names \`${slug}\` as a skill, `
                    + `but there is no skills/${slug}`);
    }
  }
}

if (problems.length) {
  console.error(`\n${problems.length} broken skill reference(s):\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nSee AGENTS.md, "Referring to other skills".\n');
  process.exit(1);
}

console.log(`✓ ${live.size} live slug(s), ${Object.keys(retired).length} retired, none mentioned`
            + (scanDirs.length ? `; ${refs} named reference(s) in ${scanDirs.length} scanned tree(s) resolve` : '')
            + ` (base ${base})`);
