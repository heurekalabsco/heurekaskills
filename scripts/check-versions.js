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
import { VERSION_RE, runnableBlocks } from './lib.js';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || process.env.BASE_REF || 'origin/main';

// stderr is discarded: `git show <base>:<path>` for a file the PR adds writes a `fatal:` to
// the log, and a stack of those printed directly above a green check reads like a failure
// that was ignored. Absence is an expected answer here, not an error.
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

// Distinguish "this path did not exist at the base" from "git failed and returned nothing".
// Without it an empty result is ambiguous and the file is waved through as a new skill —
// a swallow that fails open, which is the wrong direction for a gate.
const existsAt = (ref, file) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}:${file}`],
                 { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
};

// The merge base, so a branch that is merely behind main is not judged against its future.
const mergeBase = git('merge-base', base, 'HEAD').trim();
if (!mergeBase) {
  console.error(`could not resolve a merge base between "${base}" and HEAD.`);
  console.error('Two usual causes: the ref does not exist here — on workflow_dispatch,');
  console.error('actions/checkout fetches only the selected branch, so origin/main is absent');
  console.error('unless you dispatched on main — or the clone is shallow and needs');
  console.error('fetch-depth: 0. Pass an explicit base: node scripts/check-versions.js <ref>.');
  process.exit(2);
}

// Read `version` from the frontmatter block only. Matching `^version:` anywhere in the file
// would pick up a line inside a fenced example and compare the wrong number.
const versionOf = (text) => {
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fm) return null;
  return (fm[1].match(/^version:\s*(\S+)\s*$/m) || [])[1] || null;
};

// The pair of integers in `verified:`, summed. Frontmatter-scoped for the same reason
// `version` is: an `executed:` inside a fenced example is not this skill's claim.
const declaredBlocks = (text) => {
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fm) return null;
  const ran = (fm[1].match(/^\s+executed:\s*(\d+)\s*$/m) || [])[1];
  if (ran === undefined) return null;
  const skipped = (fm[1].match(/^\s+unverified:\s*(\d+)\s*$/m) || [])[1] || '0';
  return Number(ran) + Number(skipped);
};

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
// Tracked changes plus untracked additions. `git diff` cannot see a file that has never
// been added, so a contributor who writes a new references/*.md and runs this before
// `git add` would otherwise get a clean pass on work the gate has not looked at — the same
// false green that reading the working tree instead of HEAD was meant to close.
const untracked = () => git('ls-files', '--others', '--exclude-standard', 'skills')
  .split('\n').filter(Boolean);

const touched = new Map();                        // slug -> did any published file change
for (const f of [...git('diff', '--name-only', mergeBase).split('\n'), ...untracked()]) {
  const m = /^skills\/([^/]+)\//.exec(f);
  if (m) touched.set(m[1], true);
}

// Runnable fences across a skill's markdown, at a ref or in the working tree.
const countBlocks = (ref, slug, files, atRef) => files
  .filter((f) => f.toLowerCase().endsWith('.md'))
  .reduce((n, f) => {
    let text = '';
    if (atRef) text = existsAt(ref, f) ? git('show', `${ref}:${f}`) : '';
    else { try { text = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { text = ''; } }
    return n + runnableBlocks(text).length;
  }, 0);

const problems = [];
const notes = [];
let checked = 0;

for (const slug of [...touched.keys()].sort()) {
  const file = `skills/${slug}/SKILL.md`;
  if (!existsAt(mergeBase, file)) continue;       // newly added skill — 1.0.0 is correct
  const before = git('show', `${mergeBase}:${file}`);
  let after;
  try {
    after = fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    continue;                                     // skill deleted in this branch
  }

  const [oldV, newV] = [versionOf(before), versionOf(after)];

  // A regression is checked FIRST and unconditionally. Gating it behind "did the content
  // change" would let a bad rebase or a partial revert walk a version backwards in silence,
  // and print a tick saying the opposite — precisely the false green this exists to stop.
  // The 19 version-only lines this gate was built to protect are exactly what such a revert
  // takes back, one line at a time.
  if (oldV && newV && VERSION_RE.test(oldV) && VERSION_RE.test(newV) && isAfter(oldV, newV)) {
    problems.push(`${slug}: version went backwards, ${oldV} -> ${newV}`);
    continue;
  }

  // Did anything a reader receives actually change? Compare every published file under the
  // skill, with SKILL.md's version line stripped so a pure bump is not itself "a change".
  const strip = (s) => s.replace(/^version:.*$/m, '');
  const filesNow = [
    ...git('ls-files', `skills/${slug}`).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard', `skills/${slug}`).split('\n'),
  ].filter(Boolean);
  const filesBefore = git('ls-tree', '-r', '--name-only', mergeBase, `skills/${slug}`)
    .split('\n').filter(Boolean);
  const allFiles = [...new Set([...filesNow, ...filesBefore])].sort();

  let contentChanged = false;
  for (const f of allFiles) {
    const b = existsAt(mergeBase, f) ? git('show', `${mergeBase}:${f}`) : '';
    let a = '';
    try { a = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { a = ''; }
    if (f === file ? strip(b) !== strip(a) : b !== a) { contentChanged = true; break; }
  }
  if (!contentChanged) continue;                  // version-only edit, or no real change
  checked += 1;

  if (!newV) {
    problems.push(`${slug}: content changed and there is no version in the frontmatter`);
  } else if (!VERSION_RE.test(newV)) {
    problems.push(`${slug}: version "${newV.slice(0, 20)}" is not MAJOR.MINOR.PATCH`);
  } else if (!oldV || !VERSION_RE.test(oldV)) {
    continue;                                     // base was malformed; the new one is fine
  } else if (oldV === newV) {
    problems.push(`${slug}: content changed but version is still ${newV} — bump it`);
  }

  // Advisory, deliberately not a failure. `verified:` declares how many RUNNABLE blocks the
  // author ran, and the registry's settled position is that this is declared rather than
  // computed, because most fences are narrative fragments that cannot run standalone. So
  // adding a fragment legitimately moves the fence count without moving the declared total,
  // and an error here would fire on correct work.
  //
  // What is still worth saying out loud: the fence count moved and the claim did not. That
  // is the shape a real miss takes — a skill gained a runnable block, `verified.date` was
  // re-stamped to today, and the counts stayed where an older run left them, so the page
  // asserts a coverage it never measured. Printing it puts the question in front of review
  // at the moment it can still be answered, without pretending arithmetic can settle it.
  const blocksBefore = countBlocks(mergeBase, slug, filesBefore, true);
  const blocksNow = countBlocks(null, slug, filesNow, false);
  const declBefore = declaredBlocks(before);
  const declNow = declaredBlocks(after);
  if (blocksBefore !== blocksNow && declBefore !== null && declBefore === declNow) {
    notes.push(`${slug}: runnable blocks ${blocksBefore} -> ${blocksNow}, but verified still `
               + `claims ${declNow} — confirm the claim still covers the page`);
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
for (const n of notes) console.log(`  ! ${n}`);
