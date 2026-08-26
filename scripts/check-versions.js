// Refuse a changed skill whose `version` did not move.
//
//   node scripts/check-versions.js [base-ref]     # default: origin/main
//
// `version` is the only signal a reader or an installing client has that a published page
// changed underneath them. validate.js can check that the field exists and is well formed;
// it cannot check that it was *bumped*, because that needs the diff. This does.
//
// Why it is worth a script. Of 41 skills, 19 had accumulated content changes across as many
// as four separate publications without a single bump between them — not through
// carelessness but because nothing asked. The nightshift was told to update `verified:` on
// any skill it touched and never told about `version:`, so it dutifully did exactly that.
// A rule nobody is reminded of is a rule that decays to whoever happens to remember it.
//
// Exits non-zero when a skill's published files changed and its version did not, or when a
// version moved backwards. Exits zero for new skills and for deletions.
//
// "Published files" means everything under skills/<slug>/, not just SKILL.md. 19 of the
// skills here also ship references/*.md, and the site serves them — so a references-only
// edit changes what a reader gets and has to move the version too. An earlier draft of this
// script watched SKILL.md alone and let 84 published files through unchecked.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || process.env.BASE_REF || 'origin/main';

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
};

// The merge base, so a branch that is merely behind main is not judged against its future.
const mergeBase = git('merge-base', base, 'HEAD').trim();
if (!mergeBase) {
  console.error(`could not resolve a merge base with ${base} — is the history shallow? ` +
                'CI needs fetch-depth: 0 for this check.');
  process.exit(2);
}

// Read `version` from the frontmatter block only. Matching `^version:` anywhere in the file
// would pick up a line inside a fenced example and compare the wrong number.
const versionOf = (text) => {
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fm) return null;
  return (fm[1].match(/^version:\s*(\S+)\s*$/m) || [])[1] || null;
};

const SEMVER = /^\d+\.\d+\.\d+$/;
const parse = (v) => v.split('.').map(Number);
const isAfter = (a, b) => {                       // strictly greater, component-wise
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
};

// Working tree, not HEAD. Comparing `mergeBase...HEAD` would ignore uncommitted edits and
// hand a developer running this before committing a clean pass on work that has not been
// checked — a false green, which is the one outcome worth engineering against.
// Every file under a skill counts, not just SKILL.md: see the note at the top.
const touched = new Map();                        // slug -> did any published file change
for (const f of git('diff', '--name-only', mergeBase).split('\n')) {
  const m = /^skills\/([^/]+)\//.exec(f);
  if (m) touched.set(m[1], true);
}

const problems = [];
let checked = 0;

for (const slug of [...touched.keys()].sort()) {
  const file = `skills/${slug}/SKILL.md`;
  const before = git('show', `${mergeBase}:${file}`);
  if (!before) continue;                          // newly added skill — 1.0.0 is correct
  let after;
  try {
    after = fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    continue;                                     // skill deleted in this branch
  }

  // Did anything a reader receives actually change? Compare every published file under the
  // skill, with SKILL.md's version line stripped so a pure bump is not itself "a change".
  const strip = (s) => s.replace(/^version:.*$/m, '');
  const filesNow = git('ls-files', `skills/${slug}`).split('\n').filter(Boolean);
  const filesBefore = git('ls-tree', '-r', '--name-only', mergeBase, `skills/${slug}`)
    .split('\n').filter(Boolean);
  const allFiles = [...new Set([...filesNow, ...filesBefore])].sort();

  let contentChanged = false;
  for (const f of allFiles) {
    const b = git('show', `${mergeBase}:${f}`);
    let a = '';
    try { a = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { a = ''; }
    if (f === file ? strip(b) !== strip(a) : b !== a) { contentChanged = true; break; }
  }
  if (!contentChanged) continue;                  // version-only edit, or no real change
  checked += 1;

  const [oldV, newV] = [versionOf(before), versionOf(after)];
  if (!newV) {
    problems.push(`${slug}: content changed and there is no version in the frontmatter`);
  } else if (!SEMVER.test(newV)) {
    problems.push(`${slug}: version "${newV.slice(0, 20)}" is not MAJOR.MINOR.PATCH`);
  } else if (!oldV || !SEMVER.test(oldV)) {
    continue;                                     // base was malformed; the new one is fine
  } else if (oldV === newV) {
    problems.push(`${slug}: content changed but version is still ${newV} — bump it`);
  } else if (!isAfter(newV, oldV)) {
    problems.push(`${slug}: version went backwards, ${oldV} -> ${newV}`);
  }
}

if (problems.length) {
  console.error(`\n${problems.length} skill(s) changed without a version bump:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nBump the minor for a revision that changes what the page says or shows;');
  console.error('bump the patch for a typo or a broken link. See AGENTS.md, "Versioning".\n');
  process.exit(1);
}

const touchedCount = touched.size;
console.log(`✓ ${checked} of ${touchedCount} touched skill(s) changed content, and each carries `
            + `a version bump (base ${base})`);
