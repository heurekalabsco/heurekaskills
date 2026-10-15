#!/usr/bin/env node
// Decide whether a diff is a VERIFICATION REFRESH: a re-run of a skill that still works,
// which records when it was checked and what against, and changes nothing else.
//
// This is the gate for autonomous merge, so it is written to be defeated rather than to be
// right. Every rule below exists because an adversarial review got past the previous version,
// and all seventeen of those bypasses are committed as fixtures.
//
// WHAT CHANGED AFTER THAT REVIEW, AND WHY
//
// v1 asked "does this line differ only in a date or a version?" and matched those patterns
// anywhere on the line. That is not answerable from the line alone, and eleven exploits
// followed from pretending it was: an FDR cutoff `0.05`->`0.50`, a licence `CC-BY-4.0`->`3.0`,
// a pinned install `==1.2.3`->`==9.9.9`, a DOI retargeted at a different paper, an IP swap.
// Each is "a version" to a regex and a behaviour change to a reader.
//
// The registry itself settles it. Grepping every skill for dated lines turns up
// `open_soma(census_version="2026-...")` and `SINCE = "2026-..."` — dates that are *arguments*
// selecting which data loads. So even a date-only edit is a behaviour change in the wrong
// place, and the only safe question is WHERE the token sits, not what it looks like.
//
// So v2 resolves every changed line against the base file and allows exactly two positions:
//   1. inside the frontmatter `verified:` mapping, and
//   2. prose — outside the frontmatter and outside every fenced code block — where the pair
//      differs only in dates and versions.
// Anything inside a fence, anywhere else in the frontmatter, or in a file this gate cannot
// resolve, refuses. Consent is positive: silence, novelty and confusion all mean no.
//
// Usage:  node scripts/is-verification-refresh.js --diff <unified.diff> --base-dir <repo> [--json]
// Exit 0 it is a refresh · 1 it is not (with reasons) · 2 refused to decide.
import fs from 'node:fs';
import path from 'node:path';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const JSON_OUT = process.argv.includes('--json');
const die = (m) => { console.error(`is-verification-refresh: ${m}`); process.exit(2); };

const diffPath = arg('--diff');
if (!diffPath) die('--diff <file> is required. A gate that cannot read the diff must not say yes.');
// The base tree the diff applies to. Required, because position cannot be judged without it —
// and because the caller must be made to think about WHICH tree it is. The workflow passes a
// checkout of the base ref, never the pull request's own.
const baseDir = arg('--base-dir');
if (!baseDir) die('--base-dir <repo> is required: every verdict depends on where a line sits in the base file.');

let raw;
try { raw = diffPath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(diffPath, 'utf8'); }
catch (e) { die(`cannot read ${diffPath}: ${e.message}`); }

const DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const VERSION = /\bv?\d+\.\d+(?:\.\d+)*(?:[-.][A-Za-z0-9]+)*\b/g;
const skeleton = (s) => s.replace(DATE, '\u0000D').replace(VERSION, '\u0000V');
const URLISH = /(?:https?:\/\/|doi\.org\/|10\.\d{4,})\S*/g;

// Position alone is not enough, and discovering that cost a round. Classifying by WHERE a
// line sits correctly refuses anything in a fenced block — but `Accept hits with FDR < 0.05.`
// is prose, and `0.05` is a version to any regex. Those exploits were rejected only by an
// incidental bug in the first draft of this rewrite; fixing the bug let them through again.
//
// So prose gets two further rules, each derived from an exploit that beat the last version:
//
//   A version may change only on a line whose DATE also changed. A refreshed observation
//   carries its date — "Observed 2026-08-19 with biopython 1.88" — while a threshold, a
//   licence and a pinned install do not. This is the rule that separates them, and it needs
//   no list of which numbers are thresholds.
//
//   Nothing inside a URL or DOI may change at all. `10.64898/2026.04.14.718529` is two
//   version tokens to a regex and a different paper to a reader; the same is true of a
//   version path segment and an IPv4 address.
function proseChangeIsAllowed(removed, added) {
  const strippedRemoved = removed.replace(URLISH, '\u0000U');
  const strippedAdded = added.replace(URLISH, '\u0000U');
  // Anything inside a URL differing is a content change, full stop.
  if ((removed.match(URLISH) || []).join('|') !== (added.match(URLISH) || []).join('|')) {
    return 'changes a URL or DOI';
  }
  const dateChanged = (strippedRemoved.match(DATE) || []).join('|') !== (strippedAdded.match(DATE) || []).join('|');
  const versionChanged = (strippedRemoved.replace(DATE, '').match(VERSION) || []).join('|')
                      !== (strippedAdded.replace(DATE, '').match(VERSION) || []).join('|');
  if (versionChanged && !dateChanged) {
    return 'changes a version on a line that carries no date — a threshold, a licence or a pin, not an observation';
  }
  return null;
}

const reasons = [];
const refuse = (r) => { if (!reasons.includes(r)) reasons.push(r); };

// ---- parse ----------------------------------------------------------------
// Structural changes carry no +/- content, so a parser that only reads +/- sees an empty diff
// and a gate that equates empty with harmless consents to a rename, a chmod, or a swapped
// binary. Each is called out by name and refuses.
const files = new Map();   // path -> { changes: [{oldLine, removed, added}] }
let cur = null;
let oldNo = 0;
let seenHunk = false;

for (const line of raw.split('\n')) {
  if (line.startsWith('diff --git ')) {
    const m = line.match(/ b\/(.+)$/);
    cur = m ? m[1] : null;
    if (cur && !files.has(cur)) files.set(cur, { changes: [] });
    seenHunk = false;
    continue;
  }
  if (!seenHunk) {
    if (/^(rename from|rename to) /.test(line)) { refuse(`refuses a rename (${cur ?? 'unknown file'}) — a moved file changes what the site serves and shows no content diff`); continue; }
    if (/^(old mode|new mode) /.test(line)) { refuse(`refuses a file-mode change (${cur ?? 'unknown file'})`); continue; }
    if (/^(new file mode|deleted file mode) /.test(line)) { refuse(`refuses an added or deleted file (${cur ?? 'unknown file'})`); continue; }
  }
  if (/^Binary files .* differ$/.test(line)) { refuse(`refuses a binary change (${cur ?? 'unknown file'})`); continue; }

  const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
  if (hunk) { seenHunk = true; oldNo = Number(hunk[1]); continue; }
  if (!seenHunk) continue;                 // still in the header block

  // `---`/`+++` are headers ONLY before the first hunk. v1 skipped them everywhere, so a
  // removed line beginning `--` (a `--flag` on its own line) arrived as `---…` and vanished.
  if (line.startsWith('-')) { files.get(cur)?.changes.push({ oldLine: oldNo, removed: line.slice(1) }); oldNo++; continue; }
  if (line.startsWith('+')) { files.get(cur)?.changes.push({ oldLine: oldNo, added: line.slice(1) }); continue; }
  oldNo++;                                  // context line
}

// ---- scope ----------------------------------------------------------------
const paths = [...files.keys()];
const outside = paths.filter((f) => !/^skills\/[^/]+\/.+$/.test(f));
if (outside.length) refuse(`touches files outside a skill: ${outside.join(', ')}`);
const slugs = new Set(paths.map((f) => (f.match(/^skills\/([^/]+)\//) || [])[1]).filter(Boolean));
if (slugs.size > 1) refuse(`touches ${slugs.size} skills (${[...slugs].join(', ')}) — a refresh is one skill`);
if (paths.length === 0) refuse('contains no file changes at all');

// ---- position -------------------------------------------------------------
// Classify every line of the base file: frontmatter, inside the verified: mapping, inside a
// fenced code block, or prose. A date in prose is an observation; the same date inside a fence
// may be an argument that selects which data loads.
function classify(absPath) {
  let text;
  try { text = fs.readFileSync(absPath, 'utf8'); }
  catch { return null; }
  const lines = text.split('\n');
  const kind = new Array(lines.length + 1).fill('prose');
  let fmFence = 0, inFm = false, inVerified = false, fence = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const n = i + 1;
    if (fmFence < 2 && /^---\s*$/.test(l)) { fmFence++; inFm = fmFence === 1; kind[n] = 'frontmatter'; continue; }
    if (inFm) {
      if (/^verified:/.test(l)) inVerified = true;
      else if (/^[A-Za-z][\w-]*:/.test(l)) inVerified = false;
      kind[n] = inVerified ? 'verified' : 'frontmatter';
      continue;
    }
    const f = l.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (fence && l.trim().startsWith(fence)) { fence = null; kind[n] = 'fence'; continue; }
      if (!fence) { fence = f[1]; kind[n] = 'fence'; continue; }
    }
    kind[n] = fence ? 'fence' : 'prose';
  }
  return kind;
}

// ---- judge, per file ------------------------------------------------------
let changedLines = 0;
for (const [file, { changes }] of files) {
  if (!changes.length) continue;
  changedLines += changes.length;
  const kind = classify(path.join(baseDir, file));
  if (!kind) { refuse(`cannot read ${file} in the base tree — refusing rather than guessing where its lines sit`); continue; }

  // Pairing is per FILE. v1 pooled globally, so a caveat deleted from SKILL.md was "matched"
  // by a lookalike added to references/, and the dangerous move read as a clean swap.
  // Only additions OUTSIDE the verified: block are pooled. Verified-block additions are
  // allowed outright — a skill moving off `verified: pending` genuinely gains lines there —
  // so pooling them would leave them unmatched and reported as leftovers, which is how the
  // first run of this rewrite rejected a legitimate refresh.
  const pool = new Map();
  for (const c of changes) {
    if (c.added === undefined) continue;
    if ((kind[c.oldLine] ?? 'prose') === 'verified') continue;
    const k = skeleton(c.added);
    pool.set(k, (pool.get(k) || 0) + 1);
  }

  for (const c of changes) {
    const where = kind[c.oldLine] ?? 'prose';
    if (where === 'verified') continue;                       // the one place new lines may appear
    if (where === 'fence') {
      refuse(`${file}:${c.oldLine} changes a line inside a fenced code block — a date or version there can be an argument, not an observation`);
      continue;
    }
    // `version:` is the one frontmatter field outside `verified:` that a refresh may touch —
    // check-versions.js requires a bump whenever a skill's content changes. It pairs like any
    // other line but is exempt from the prose rule below, which would otherwise read a bump as
    // "a version on a line with no date" and refuse every legitimate refresh. That exact
    // oversight rejected the first correct refresh this rewrite was tested against.
    let frontmatterVersionBump = false;
    if (where === 'frontmatter') {
      const text = (c.removed ?? c.added ?? '');
      if (!/^version:/.test(text)) {
        refuse(`${file}:${c.oldLine} changes frontmatter outside the verified: block (${JSON.stringify(text.trim().slice(0, 48))})`);
        continue;
      }
      frontmatterVersionBump = true;
    }
    // Prose, or a version: bump. Allowed only as a matched pair differing in dates/versions.
    if (c.removed !== undefined) {
      const k = skeleton(c.removed);
      const n = pool.get(k) || 0;
      if (n > 0) {
        pool.set(k, n - 1);
        // The pair matched on skeleton; now check WHAT changed inside it.
        const partner = changes.find((o) => o.added !== undefined && skeleton(o.added) === k && !o.__used);
        if (partner) {
          partner.__used = true;
          const bad = frontmatterVersionBump ? null : proseChangeIsAllowed(c.removed, partner.added);
          if (bad) refuse(`${file}:${c.oldLine} ${bad} — ${JSON.stringify(c.removed.trim().slice(0, 48))}`);
        }
      } else {
        refuse(`${file}:${c.oldLine} removes a line with no date/version-only counterpart — ${JSON.stringify(c.removed.trim().slice(0, 56))}`);
      }
    }
  }
  for (const [k, n] of pool) {
    if (n > 0) refuse(`${file} adds ${n} line(s) outside the verified: block that are not a date/version restatement — ${JSON.stringify(k.replace(/\u0000D/g, '<date>').replace(/\u0000V/g, '<version>').trim().slice(0, 56))}`);
  }
}

// A diff that changed no lines is not a harmless diff, it is a diff this gate did not read.
if (changedLines === 0) refuse('no added or removed lines — nothing here was actually inspected, so consent cannot be given');

const verdict = { refresh: reasons.length === 0, skill: [...slugs][0] ?? null, files: paths, changedLines, reasons };
if (JSON_OUT) console.log(JSON.stringify(verdict, null, 2));
else {
  console.log(verdict.refresh
    ? `✓ verification refresh — ${verdict.skill}: only the verified: block and dated prose changed`
    : `✗ not a verification refresh${verdict.skill ? ` (${verdict.skill})` : ''}`);
  for (const r of reasons) console.log(`  · ${r}`);
}
process.exitCode = verdict.refresh ? 0 : 1;
