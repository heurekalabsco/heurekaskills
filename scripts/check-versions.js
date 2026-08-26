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
// Exits non-zero when a SKILL.md changed and its version did not, or when a version moved
// backwards. Exits zero for new skills, deletions, and reference-only edits.
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

const versionOf = (text) => (text.match(/^version:\s*(\S+)/m) || [])[1] || null;
const parse = (v) => (v || '').split('.').map((n) => parseInt(n, 10));
const isAfter = (a, b) => {                       // strictly greater, component-wise
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
};

// Working tree, not HEAD. Comparing `mergeBase...HEAD` would ignore uncommitted edits and
// hand a developer running this before committing a clean pass on work that has not been
// checked — a false green, which is the one outcome worth engineering against.
const changed = git('diff', '--name-only', mergeBase)
  .split('\n')
  .filter((f) => /^skills\/[^/]+\/SKILL\.md$/.test(f));

const problems = [];
let checked = 0;

for (const file of changed) {
  const before = git('show', `${mergeBase}:${file}`);
  if (!before) continue;                          // newly added skill — 1.0.0 is correct
  let after;
  try {
    after = fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    continue;                                     // deleted
  }
  checked += 1;

  const [oldV, newV] = [versionOf(before), versionOf(after)];
  const slug = file.split('/')[1];

  // A pure version bump is not a content change; strip the field before comparing bodies.
  const strip = (t) => t.replace(/^version:.*$/m, '');
  if (strip(before) === strip(after)) continue;   // frontmatter-only version edit

  if (!newV) {
    problems.push(`${slug}: content changed and there is no version field`);
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

console.log(`✓ ${checked} changed skill(s) carry a version bump (base ${base})`);
