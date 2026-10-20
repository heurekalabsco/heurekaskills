#!/usr/bin/env node
// Decide whether a diff is a VERIFICATION REFRESH: a re-run of a skill that still works, which
// records when it was checked and what against, and changes nothing a reader acts on.
//
// This is the gate for autonomous merge on a public registry, so it is written to be defeated
// rather than to be right. Three earlier versions were, nineteen times between them, by two
// adversarial reviews briefed to treat it as a security boundary. Every one of those diffs is
// generated under .github/fixtures/refresh-gate/.
//
// WHY THIS IS THE FOURTH VERSION
//
// v1 asked "does this line differ only in a date or a version?". v2 asked the same after
// resolving where the line sat. v3 narrowed it to "only a date, and only onto the run date".
// All three are the same question, and it is not answerable from text:
//
//   `Accept hits with FDR < 0.05`       — 0.05 is a version to a regex, a threshold to a reader
//   `training data cutoff 2025-06-30`   — a date to a regex, a capability claim to a reader
//   `stable` was `2025-11-08`           — a date to a regex, a census_version argument to a reader
//   `release_date=[... TO 2026-12-31]`  — a date to a regex, a query bound to a reader
//
// v3's rule was that a prose date may change if it lands on the run date. The run date came from
// the head commit's AUTHOR date, which whoever makes the commit sets with `git commit --date=`,
// so the guard travelled inside the thing it was guarding: with an author date of 2035-06-30, a
// training cutoff moved to 2035-06-30 was "a refresh". Even unforged it accepted moving that
// cutoff to today, which is a false claim about what the model was trained on.
//
// So v4 stops looking at prose. THE BODY MUST BE BYTE-IDENTICAL. A refresh changes the
// `verified:` block and the `version:` bump, in SKILL.md, and nothing else anywhere. There is no
// date rule, no fence detector and no run date — which also removes the only input an attacker
// controlled.
//
// WHAT REPLACED THE SHAPE RULES IN THE FRONTMATTER
//
// v3 enumerated bad shapes: no nested map under `verified:`. A YAML block scalar parses to a
// STRING, so text containing `license: GPL-3.0-only` slipped past that and was read as a
// TOP-LEVEL key by parseFrontmatterNaive — the client's parser, which has no nesting model and
// flattens every colon-bearing line. Real YAML and validate.js both still saw the correct
// licence; the registry would have served the wrong one.
//
// Enumerating shapes loses to the next shape. So v4 asserts the invariant instead: run the
// CLIENT's parser over both versions and require that what it reads is unchanged, except for the
// fields a refresh owns. That holds no matter how the YAML is spelled.
//
// Usage:  node scripts/is-verification-refresh.js --diff <unified.diff> --base-dir <repo> [--json]
// Exit 0 it is a refresh · 1 it is not (with reasons) · 2 refused to decide.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { parseFrontmatterNaive } from './lib.js';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const JSON_OUT = process.argv.includes('--json');
const die = (m) => { console.error(`is-verification-refresh: ${m}`); process.exit(2); };

const diffPath = arg('--diff');
if (!diffPath) die('--diff <file> is required. A gate that cannot read the diff must not say yes.');
// The base tree the diff applies to. Required, because the proposed file is reconstructed FROM it
// and every removed line is checked against it. The workflow passes a checkout of the base ref,
// never the pull request's own — v1 ran the gate from the PR's checkout and a one-line
// `date: process.exit(0);` label, a valid JavaScript label, made it exit 0 unconditionally.
const baseDir = arg('--base-dir');
if (!baseDir) die('--base-dir <repo> is required: the proposed file is rebuilt from it and checked against it.');

// The fields a refresh owns. `verified` and its own subfields, plus the version bump.
//
// The subfields are listed because parseFrontmatterNaive flattens them: `  date: 2026-09-27`
// inside the `verified:` mapping is a TOP-LEVEL `date` key to the client. That flattening is the
// client's behaviour, not a bug this gate can fix, so the gate accounts for it.
const VERIFIED_KEYS = ['date', 'against', 'executed', 'unverified', 'unverified_reason', 'records'];
const REFRESH_OWNS = new Set(['verified', 'version', ...VERIFIED_KEYS]);
// The record a verified skill must keep. `unverified_reason` and `records` may legitimately come
// and go — a skill that reaches zero unverified blocks no longer needs a reason.
const VERIFIED_CORE = ['date', 'against', 'executed', 'unverified'];

// The gate's own clock, which is not in the diff and so is not the author's to set. Used only to
// refuse a verified: date in the future.
const TODAY = new Date().toISOString().slice(0, 10);

let raw;
try { raw = diffPath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(diffPath, 'utf8'); }
catch (e) { die(`cannot read ${diffPath}: ${e.message}`); }

const reasons = [];
const refuse = (r) => { if (!reasons.includes(r)) reasons.push(r); };

// ---- parse the diff -------------------------------------------------------
// Only two things come from the diff: the structural changes its headers announce, and the hunks
// needed to rebuild the file. Nothing is inferred from the shape of a +/- line.
const files = new Map();   // path -> { hunks: [{ oldStart, oldCount, newCount, ops }] }
let cur = null;
let hunk = null;
let headerFailed = false;

// A trailing newline on the diff file yields one empty element from the split, which is not a
// diff line. v3 absorbed it as an empty context line and silently overran a hunk by one; counting
// it as overflow instead made every well-formed diff refuse. It is simply not part of the diff.
const rawLines = raw.split('\n');
if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop();

for (const line of rawLines) {
  if (line.startsWith('diff --git ')) {
    const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    // An unparseable header is the one case where dropping a file silently would be worst: the
    // gate would judge the files it understood and consent to the one it did not.
    if (!m) { refuse(`cannot parse a diff header, so cannot know which file it changes — ${JSON.stringify(line.slice(0, 72))}`); cur = null; hunk = null; headerFailed = true; continue; }
    // A header naming one path on the a-side and another on the b-side is either a rename or a
    // forgery; either way the gate would judge the destination while the diff describes a move.
    if (m[1] !== m[2]) { refuse(`refuses a diff header whose paths differ: a/${m[1]} vs b/${m[2]}`); cur = null; hunk = null; headerFailed = true; continue; }
    headerFailed = false;
    cur = m[2];
    if (!files.has(cur)) files.set(cur, { hunks: [] });
    hunk = null;
    continue;
  }
  const h = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (h) {
    // Suppressed when a header has already been refused: the orphan hunk is a consequence of
    // that, and a refusal should name its own cause rather than cascade.
    if (!cur) { if (!headerFailed) refuse('a hunk appeared before any file header — refusing to guess which file it belongs to'); continue; }
    hunk = {
      oldStart: Number(h[1]),
      oldCount: h[2] === undefined ? 1 : Number(h[2]),
      newCount: h[4] === undefined ? 1 : Number(h[4]),
      oldSeen: 0, newSeen: 0, overflow: false, ops: [],
    };
    files.get(cur).hunks.push(hunk);
    continue;
  }
  if (!hunk) {
    if (headerFailed) continue;
    // Header territory. Each of these announces a change carrying no +/- content at all, so a
    // gate that reads only +/- lines sees an empty diff and calls it harmless.
    if (/^(rename from|rename to) /.test(line)) refuse(`refuses a rename (${cur ?? 'unknown file'}) — a moved file changes what the site serves and shows no content diff`);
    else if (/^(old mode|new mode) /.test(line)) refuse(`refuses a file-mode change (${cur ?? 'unknown file'})`);
    else if (/^(new file mode|deleted file mode) /.test(line)) refuse(`refuses an added or deleted file (${cur ?? 'unknown file'})`);
    else if (/^Binary files .* differ$/.test(line)) refuse(`refuses a binary change (${cur ?? 'unknown file'})`);
    else if (/^GIT binary patch/.test(line)) refuse(`refuses a binary patch (${cur ?? 'unknown file'})`);
    continue;
  }
  // "\ No newline at end of file" means the diff changes whether the file ends in a newline. A
  // refresh does not touch the end of the file, and reconstructing the distinction correctly is
  // more care than it is worth for a case that should never arise.
  if (line.startsWith('\\')) { refuse(`${cur}: refuses a diff that changes the end-of-file newline`); continue; }
  // A hunk is exactly as long as its header says. v3 ended the hunk on overflow and CONTINUED,
  // which dropped the line — so the counts still matched and the mismatch check never fired, and
  // an under-declared header let the gate judge a document missing the added line entirely.
  if (hunk.oldSeen >= hunk.oldCount && hunk.newSeen >= hunk.newCount) {
    if (/^[-+ ]/.test(line) || line === '') hunk.overflow = true;
    hunk = null;
    continue;
  }
  const kind = line.startsWith('-') ? 'del'
             : line.startsWith('+') ? 'add'
             : line.startsWith(' ') || line === '' ? 'ctx'    // git writes an empty context as " "
             : null;
  if (kind === null) { hunk = null; continue; }               // anything else ends the hunk
  hunk.ops.push([kind, line === '' ? '' : line.slice(1)]);
  if (kind !== 'add') hunk.oldSeen++;
  if (kind !== 'del') hunk.newSeen++;
}

// A header that does not describe its own body means the diff was mis-parsed, and a mis-parsed
// diff must refuse rather than be judged on the part that happened to make sense.
for (const [f, { hunks }] of files) {
  for (const k of hunks) {
    if (k.overflow) refuse(`${f}: the hunk at line ${k.oldStart} carries more lines than its header declares (${k.oldCount} old, ${k.newCount} new)`);
    else if (k.oldSeen !== k.oldCount || k.newSeen !== k.newCount) {
      refuse(`${f}: the hunk at line ${k.oldStart} declares ${k.oldCount} old and ${k.newCount} new lines but carries ${k.oldSeen} and ${k.newSeen}`);
    }
  }
}

// ---- scope ----------------------------------------------------------------
// A verification refresh touches exactly one file: one skill's SKILL.md. Everything a refresh is
// allowed to say lives in that file's frontmatter, so anything else — a references/ page, a
// .json, a second skill — is out of scope by construction rather than by rule.
const paths = [...files.keys()];
if (paths.length === 0 && !reasons.length) refuse('contains no file changes at all');
// A path refused here is NOT then read and judged as content: that produced a second refusal
// ("has no parseable frontmatter") which is a consequence of the first, and a cascade makes it
// impossible to tell from the output which rule actually fired.
const outOfScope = new Set();
for (const f of paths) {
  if (!/^skills\/[^/.][^/]*\/SKILL\.md$/.test(f)) {
    refuse(`touches ${JSON.stringify(f)} — a refresh changes one skill's SKILL.md and nothing else`);
    outOfScope.add(f);
  }
}
if (paths.length > 1) refuse(`touches ${paths.length} files (${paths.join(', ')}) — a refresh is one SKILL.md`);
const slug = (paths[0]?.match(/^skills\/([^/]+)\//) || [])[1] ?? null;

// ---- rebuild the proposed file from the base -------------------------------
// The diff is believed only if it applies: every context and removed line must match the base
// tree exactly. That retires the whole class of bypass in which a malformed diff walks the line
// counter off by one and lands a changed line on a position that excuses it.
function rebuild(baseLines, hunks, file) {
  const out = [];
  let cursor = 0;
  for (const h of hunks) {
    const start = h.oldStart - 1 + (h.oldCount === 0 ? 1 : 0);   // -N,0 inserts AFTER line N
    if (start < cursor) return `${file}: hunks overlap or run backwards at line ${h.oldStart}`;
    if (start > baseLines.length) return `${file}: hunk at line ${h.oldStart} starts past the end of the base file`;
    out.push(...baseLines.slice(cursor, start));
    cursor = start;
    for (const [kind, text] of h.ops) {
      if (kind === 'add') { out.push(text); continue; }
      if (baseLines[cursor] !== text) {
        return `${file}: the diff does not apply to the base tree — line ${cursor + 1} is ${JSON.stringify((baseLines[cursor] ?? '<past end of file>').slice(0, 48))}, the diff expects ${JSON.stringify(text.slice(0, 48))}`;
      }
      if (kind === 'ctx') out.push(text);
      cursor++;
    }
  }
  out.push(...baseLines.slice(cursor));
  return out;
}

// ---- compare the two documents --------------------------------------------
const FENCE = /^---\s*$/;
function split(text) {
  const lines = text.split('\n');
  if (!FENCE.test(lines[0] ?? '')) return null;                 // a SKILL.md must open with ---
  for (let i = 1; i < lines.length; i++) {
    // The fence lines come back too. They are in neither the frontmatter nor the body, so
    // without them trailing whitespace on a `---` is a change no comparison here would see.
    if (FENCE.test(lines[i])) {
      return { open: lines[0], close: lines[i], fm: lines.slice(1, i).join('\n'), body: lines.slice(i + 1).join('\n') };
    }
  }
  return null;                                                  // opened frontmatter, never closed
}

function eq(a, b) {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && eq(a[k], b[k]));
}

// A bare increase, digit group by digit group. Anything that does not clearly increase refuses,
// which is the safe direction: check-versions.js requires a bump, so no bump means no merge.
function versionIncreased(from, to) {
  const parts = (v) => String(v).split('.').map((x) => { const n = /^\d+/.exec(x); return n ? Number(n[0]) : 0; });
  const a = parts(from), b = parts(to);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (y !== x) return y > x;
  }
  return false;
}

const asDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10)
  : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);

let changedFiles = 0;
for (const [file, { hunks }] of files) {
  if (!hunks.length || outOfScope.has(file)) continue;

  let baseText;
  try { baseText = fs.readFileSync(path.join(baseDir, file), 'utf8'); }
  catch { refuse(`cannot read ${file} in the base tree — refusing rather than judging a file it cannot see`); continue; }

  const built = rebuild(baseText.split('\n'), hunks, file);
  if (typeof built === 'string') { refuse(built); continue; }
  const headText = built.join('\n');
  if (headText === baseText) continue;                          // unchanged after all
  changedFiles++;

  const b = split(baseText), h = split(headText);
  if (!b) { refuse(`${file} has no parseable frontmatter in the base tree`); continue; }
  if (!h) { refuse(`${file} would end up with no parseable frontmatter`); continue; }

  // ---- the body does not change. at all. ----
  if (b.body !== h.body) {
    const bl = b.body.split('\n'), hl = h.body.split('\n');
    const i = bl.findIndex((l, n) => l !== hl[n]);
    refuse(bl.length !== hl.length
      ? `${file} changes the body — ${Math.abs(hl.length - bl.length)} line(s) added or removed. A refresh records what it checked; it does not edit the page.`
      : `${file} changes the body at line ${i + 1} of the prose — ${JSON.stringify((bl[i] ?? '').trim().slice(0, 56))}. A refresh records what it checked; it does not edit the page.`);
    continue;
  }

  // ---- the frontmatter TEXT, outside the verified: block, does not change either ----
  // Both parsers this gate compares discard comments, and parseFrontmatterNaive only makes a key
  // when the line contains a colon. So a frontmatter line starting with `#` and containing no
  // colon was invisible to every check here: absent from the body, no YAML key, no client key.
  // Arbitrary prose shipped — "the cutoffs below are superseded, use this other build instead" —
  // in the published bytes, through a gate whose stated contract is that only `verified:` and
  // `version:` move. `validate.js` and `check-versions.js` passed it too.
  //
  // Comparing parsed values cannot see a comment, so compare the lines. Everything outside the
  // `verified:` span must be byte-identical but for the one `version:` line, which covers
  // comments, trailing whitespace, reordering, and whatever the next invisible spelling is.
  const fmSpan = (fm) => {
    const lines = fm.split('\n');
    const start = lines.findIndex((l) => /^verified:/.test(l));
    if (start === -1) return lines;
    let end = start + 1;
    while (end < lines.length && /^(\s+\S|\s*$)/.test(lines[end])) end++;
    return [...lines.slice(0, start), ...lines.slice(end)];
  };
  const VERSION_LINE = /^version:.*$/;
  // The version line is masked so a bump compares equal — but the mask is for COMPARING only.
  // Reporting from the masked array printed "version:\u0000" as the offending line, which named
  // the one line that is allowed to change.
  const mask = (l) => (VERSION_LINE.test(l) ? 'version:\u0000' : l);
  const bo = fmSpan(b.fm), ho = fmSpan(h.fm);
  if (bo.map(mask).join('\n') !== ho.map(mask).join('\n')) {
    // Named by multiset difference, not by line index. Deleting a line shifts every line after
    // it, so an index-wise comparison blamed whichever line happened to land at the first
    // differing position — for a deleted `author:` it named the `version:` bump, the one line
    // that is allowed to move.
    const pool = new Map();
    for (const l of bo.map(mask)) pool.set(l, (pool.get(l) ?? 0) + 1);
    const addedIdx = ho.findIndex((l) => {
      const k = mask(l), n = pool.get(k) ?? 0;
      if (n === 0) return true;
      pool.set(k, n - 1); return false;
    });
    const culprit = addedIdx !== -1 ? `added or changed: ${ho[addedIdx]}`
      : `removed: ${[...pool].filter(([, n]) => n > 0).map(([l]) => l).join(', ')}`;
    refuse(`${file} changes the frontmatter outside the verified: block — `
      + `${JSON.stringify(culprit.trim().slice(0, 72))}. Only verified: and version: may move.`);
    // Deliberately NOT a `continue`. This textual rule catches every text-visible change to a
    // top-level field, so short-circuiting here would shadow the YAML rules below and leave them
    // untested — the same "refused, but for another rule's reason" failure the suite exists to
    // make visible. Both reasons are reported, and the mutation test keeps both load-bearing.
  }
  // The `---` fences belong to neither the frontmatter nor the body, so neither comparison sees
  // them; trailing whitespace on one would have been a free edit to the published bytes.
  if (b.open !== h.open || b.close !== h.close) {
    refuse(`${file} changes a --- frontmatter fence line`); continue;
  }
  // Inside the verified: span the comparison above is deliberately permissive, so a comment put
  // THERE — appended to the `verified:` line, or on its own indented line among the fields — was
  // still invisible. No skill's frontmatter contains a `#` today (checked across all 101), so a
  // new one is never part of a refresh, wherever it sits.
  const baseFmLines = new Set(b.fm.split('\n'));
  for (const l of h.fm.split('\n')) {
    if (l.includes('#') && !baseFmLines.has(l)) {
      refuse(`${file} introduces a comment into the frontmatter — ${JSON.stringify(l.trim().slice(0, 56))}. `
        + `Both parsers discard comments, so nothing else here would see it.`);
    }
  }

  // ---- what a refresh may WRITE inside verified: ----
  // Every rule above compares the two parsers this gate has, and that is how v5 was beaten.
  // YAML 1.1 parsers — PyYAML, libyaml (Ruby Psych, serde_yaml), go-yaml — treat U+2028, U+2029
  // and U+0085 as line breaks; js-yaml (1.2) and parseFrontmatterNaive do not. So a
  // `records: |` block whose one physical line read
  // `against: <U+2028>license: GPL-3.0-only<U+2028>allowed-tools: Bash(*)` was invisible to both
  // parsers here while every 1.1 consumer read a new licence and an unrestricted tool grant.
  // Adding a third parser loses to the fourth, so constrain the BYTES a refresh may introduce
  // instead: any line of the verified: span that is not already in the base must be one field,
  // one line, a plain scalar, printable ASCII plus the dashes the registry already uses. That
  // also rules out the block scalar every multi-line smuggle so far has needed. Lines carried
  // over unchanged are exempt — 36 skills already hold block scalars here, and leaving one
  // untouched adds nothing.
  //
  // The free-text fields are the other half. A refresh merges without review, so `against`,
  // `unverified_reason` and `records` were an unreviewed channel for instructions and URLs into
  // the published file. The cap is what an observation record needs and no more: no URL, no
  // backticks (nothing to copy and run), and no longer than the longest one written so far.
  const spanLines = (fm) => {
    const lines = fm.split('\n');
    const start = lines.findIndex((l) => /^verified:/.test(l));
    if (start === -1) return [];
    let end = start + 1;
    while (end < lines.length && /^(\s+\S|\s*$)/.test(lines[end])) end++;
    return lines.slice(start, end);
  };
  const SAFE_TEXT = /^[\x20-\x7E–—]*$/;
  const FIELD_LINE = new RegExp(`^  (${VERIFIED_KEYS.join('|')}): ([^\\s|>"'&*!\\[{%@\`#].*)$`, 's');
  const FREE_TEXT = new Set(['against', 'unverified_reason', 'records']);
  const FREE_TEXT_MAX = 900;
  // One refusal per rule per file: the first offending line names the problem, and a block
  // scalar would otherwise report every one of its lines.
  const carried = new Map();
  for (const l of spanLines(b.fm)) carried.set(l, (carried.get(l) ?? 0) + 1);
  const written = spanLines(h.fm).filter((l) => {
    const n = carried.get(l) ?? 0;
    if (n > 0) { carried.set(l, n - 1); return false; }
    return l.trim() !== '';
  });
  const unsafe = written.find((l) => !SAFE_TEXT.test(l));
  if (unsafe !== undefined) {
    const odd = [...unsafe].find((c) => !SAFE_TEXT.test(c));
    refuse(`${file} writes U+${odd.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} into verified: — `
      + `a refresh writes printable ASCII, and YAML 1.1 parsers read U+2028, U+2029 and U+0085 as line breaks`);
  }
  // The `verified:` line itself is left to the rules that already own it — the comment check
  // above, and the record-erasure check below.
  const fields = written.filter((l) => !/^verified:/.test(l));
  const shapeless = fields.find((l) => !FIELD_LINE.test(l));
  if (shapeless !== undefined) {
    refuse(`${file} writes ${JSON.stringify(shapeless.trim().slice(0, 56))} into verified: — a refresh writes `
      + `one "  field: value" line per field, with no block scalars, quoting or continuation lines`);
  }
  const free = fields.map((l) => FIELD_LINE.exec(l)).filter((m) => m && FREE_TEXT.has(m[1]));
  const url = free.find((m) => m[2].includes('://'));
  if (url) refuse(`${file} puts a URL in verified.${url[1]} — an observation record names versions, not places to fetch from`);
  const tick = free.find((m) => m[2].includes('`'));
  if (tick) refuse(`${file} puts backticks in verified.${tick[1]} — an observation record holds no commands`);
  const long = free.find((m) => m[2].length > FREE_TEXT_MAX);
  if (long) refuse(`${file} writes ${long[2].length} characters into verified.${long[1]}, over the ${FREE_TEXT_MAX} a refresh may carry`);

  // ---- frontmatter, by the parser the registry build uses ----
  let bf, hf;
  try { bf = yaml.load(b.fm); hf = yaml.load(h.fm); }
  catch (e) { refuse(`${file} frontmatter is not parseable YAML (${e.message.split('\n')[0].slice(0, 72)})`); continue; }
  if (bf === null || typeof bf !== 'object' || Array.isArray(bf)
      || hf === null || typeof hf !== 'object' || Array.isArray(hf)) {
    refuse(`${file} frontmatter is not a mapping`); continue;
  }

  const bk = Object.keys(bf), hk = Object.keys(hf);
  const gone = bk.filter((k) => !hk.includes(k));
  const added = hk.filter((k) => !bk.includes(k));
  if (gone.length) refuse(`${file} removes the frontmatter key(s) ${gone.join(', ')}`);
  // A refresh may introduce `verified` and nothing else. This is what stops a key being inserted
  // next to it — v3 read an insertion above `verified:` as being inside the block.
  for (const k of added) if (k !== 'verified') refuse(`${file} adds the frontmatter key ${JSON.stringify(k)} — only verified: may appear`);
  for (const k of hk) {
    if (k === 'verified' || k === 'version' || added.includes(k)) continue;
    if (!eq(bf[k], hf[k])) refuse(`${file} changes the frontmatter field ${JSON.stringify(k)} — a refresh records what it checked, it does not restate the skill`);
  }
  if (Object.hasOwn(hf, 'version') && !eq(bf.version, hf.version) && !versionIncreased(bf.version, hf.version)) {
    refuse(`${file} version ${JSON.stringify(bf.version)} -> ${JSON.stringify(hf.version)} is not an increase`);
  }

  // ---- what the CLIENT reads must not change, outside the fields a refresh owns ----
  // This is the rule that does not care how the YAML is spelled. parseFrontmatterNaive has no
  // nesting model: it takes every line with a colon and makes the text before it a top-level key,
  // last one winning. So a block scalar under `verified: against:` whose text contains
  // `license: GPL-3.0-only` silently replaces the licence the client displays, while real YAML
  // and validate.js both still read `CC-BY-4.0`. Enumerating that shape loses to the next shape;
  // comparing what the client actually reads does not.
  const bn = parseFrontmatterNaive(baseText).frontmatter;
  const hn = parseFrontmatterNaive(headText).frontmatter;
  for (const k of new Set([...Object.keys(bn), ...Object.keys(hn)])) {
    if (REFRESH_OWNS.has(k)) continue;
    if (bn[k] !== hn[k]) {
      refuse(`${file} changes what the client's frontmatter parser reads for ${JSON.stringify(k)}: `
        + `${JSON.stringify(bn[k] ?? null)} -> ${JSON.stringify(hn[k] ?? null)}`
        + (Object.hasOwn(bf, k) ? '' : ' — a nested or multi-line value is read as a top-level field by that parser'));
    }
  }

  // Exempting a key by NAME was not enough, and this is how v4 was beaten. `version` is
  // refresh-owned AND a real top-level field in all 101 skills, so skipping it let the two
  // parsers disagree about it: a block scalar under `verified: against:` carrying its own
  // `version: 0.0.1` line made the client read 0.0.1 while the YAML — and check-versions.js,
  // which reads the literal top-level line — both read 1.0.1. The registry would have served a
  // version the repo never set.
  //
  // So for every top-level key YAML defines as a scalar, the client's reading has to track it.
  // The test is relational rather than absolute because two skills already disagree benignly:
  // `compatibility: "requests>=2.28"` loses its quotes in YAML and keeps them in the client. The
  // rule is that whatever relationship held in the base must still hold in the head.
  const scalar = (v) => v === null || v instanceof Date || ['string', 'number', 'boolean'].includes(typeof v);
  const asText = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
  for (const k of Object.keys(hf)) {
    if (!scalar(hf[k]) || !Object.hasOwn(bf, k) || !scalar(bf[k])) continue;
    const yb = asText(bf[k]), yh = asText(hf[k]);
    if (bn[k] === yb) {
      // The parsers agreed in the base, so they must agree in the head.
      if (hn[k] !== yh) {
        refuse(`${file} makes the client read ${JSON.stringify(k)} as ${JSON.stringify(hn[k] ?? null)} `
          + `while the YAML says ${JSON.stringify(yh)} — a nested or multi-line value is overriding a real field`);
      }
    } else if (bn[k] !== hn[k] || yb !== yh) {
      // They already disagreed, so nothing about this key may move at all.
      refuse(`${file} changes ${JSON.stringify(k)}, whose YAML and client values already differ `
        + `(${JSON.stringify(yb)} vs ${JSON.stringify(bn[k] ?? null)}) — refusing rather than reasoning about which one wins`);
    }
  }

  // ---- verified: is the payload, and it may not be erased ----
  const bv = bf.verified, hv = hf.verified;
  const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
  if (isMap(bv)) {
    // v3 only checked `verified` while it stayed a mapping, so `verified: pending` replaced a
    // populated record — date, against, executed, unverified — with one scalar, and validate.js
    // accepts `pending` too. A skill that was verified would have quietly stopped being so.
    if (!isMap(hv)) {
      refuse(`${file} replaces the verified: record with ${JSON.stringify(hv)} — a refresh adds to that record, it does not erase it`);
    } else {
      for (const k of VERIFIED_CORE) {
        if (Object.hasOwn(bv, k) && !Object.hasOwn(hv, k)) refuse(`${file} drops verified.${k}`);
      }
    }
  }
  if (isMap(hv)) {
    for (const k of Object.keys(hv)) {
      if (!VERIFIED_KEYS.includes(k)) refuse(`${file} puts ${JSON.stringify(k)} inside verified:, which is not one of its fields (${VERIFIED_KEYS.join(', ')})`);
    }
    // Carried lines are exempt from the write rules above, which left removing or reordering
    // them open. Deleting a block scalar's header folded its text into the field above —
    // `unverified: 1` became a paragraph — and reordering continuation lines rewrote reviewed
    // prose without writing a byte. So a field whose value changes must be rewritten whole, as
    // the one line the write rules have already checked.
    const segs = {};
    let cur = null;
    for (const l of spanLines(h.fm).slice(1)) {
      const k = /^ {2}([A-Za-z_]+):/.exec(l)?.[1];
      if (k) cur = k;
      if (cur && l.trim() !== '') (segs[cur] ??= []).push(l);
    }
    for (const k of Object.keys(hv)) {
      if (isMap(bv) && eq(bv[k], hv[k])) continue;
      const seg = segs[k] ?? [];
      if (seg.length !== 1 || !written.includes(seg[0])) {
        refuse(`${file} changes verified.${k} without rewriting it as one line — a refresh replaces a field, it does not delete or reorder the lines of one`);
      }
    }
    // Counts are counts. `executed: 1:20` is the string "1:20" to js-yaml and the number 80 to
    // YAML 1.1's sexagesimal rule; `012` is 12 or 10 depending on who reads it.
    for (const k of ['executed', 'unverified']) {
      if (!Object.hasOwn(hv, k) || (isMap(bv) && eq(bv[k], hv[k]))) continue;
      const v = /^ {2}[a-z_]+: (.*)$/.exec(segs[k]?.[0] ?? '')?.[1];
      if (!/^(0|[1-9]\d*)$/.test(v ?? '')) refuse(`${file} verified.${k} is ${JSON.stringify(v ?? null)}, not a whole number`);
    }
    // The one date the gate still reads, and the only one that is definitionally an observation
    // stamp. Checked against this process's clock, which does not travel in the diff.
    const nd = asDate(hv.date), od = isMap(bv) ? asDate(bv.date) : null;
    if (hv.date !== undefined && nd === null) refuse(`${file} verified.date is not a YYYY-MM-DD date: ${JSON.stringify(String(hv.date).slice(0, 32))}`);
    else if (nd && nd > TODAY) refuse(`${file} verified.date ${nd} is in the future`);
    else if (nd && od && nd < od) refuse(`${file} moves verified.date backwards, ${od} -> ${nd}`);
    // And the TEXT must be the date YAML read, not merely something YAML could digest.
    // `date: 2026-10-00` is a day that does not exist; YAML silently rolls it to 2026-09-30, so
    // the forward-progress and future checks above saw a sane date while the client displayed
    // the impossible literal. Comparing the two parsers settles it, as everywhere else here.
    if (nd && hn.date !== undefined && hn.date !== nd) {
      refuse(`${file} verified.date reads as ${JSON.stringify(hn.date)} but YAML resolves it to ${nd}`
        + ` — a date that does not survive being parsed is not a date`);
    }
  }
}

// A diff that changed nothing is not a harmless diff, it is a diff this gate did not read. This
// is a BACKSTOP for the case where nothing else objected — appended to an existing refusal it
// said nothing, and buried which rule had actually fired.
if (changedFiles === 0 && !reasons.length) refuse('no file content actually changed — nothing here was inspected, so consent cannot be given');

const verdict = { refresh: reasons.length === 0, skill: slug, files: paths, changedFiles, reasons };
if (JSON_OUT) console.log(JSON.stringify(verdict, null, 2));
else {
  console.log(verdict.refresh
    ? `✓ verification refresh — ${verdict.skill}: the verified: block and a version bump, with the page itself untouched`
    : `✗ not a verification refresh${verdict.skill ? ` (${verdict.skill})` : ''}`);
  for (const r of reasons) console.log(`  · ${r}`);
}
process.exitCode = verdict.refresh ? 0 : 1;
