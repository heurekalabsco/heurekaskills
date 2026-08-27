// Shared helpers for the skill validator.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const CATEGORIES = ['data', 'models', 'analysis', 'utility', 'communication', 'grants'];

export const SLUG_RE = /^[a-z0-9-]+$/;

// `version` is MAJOR.MINOR.PATCH with no leading zeros: `1.02.0` and `1.2.0` are one release
// to a human and two different strings to everything else. Shared so validate.js and
// check-versions.js cannot drift into disagreeing about what a version is.
export const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// Fence languages that denote code a reader could execute, as opposed to a fence used for
// output, data or markup. `verified:` counts blocks in this set, and the "## Try it" gate
// scans them; both must agree on the set or a block slips between them.
//
// `r` is in the list because it was the one that got missed. An audit of declared coverage
// scanned python/bash/sh only, concluded `motrpac` claimed nine runnable blocks where seven
// existed, and reported an impossible number. `motrpac` has two `r` blocks and was exactly
// right. Counting a subset does not understate the count — it manufactures a contradiction,
// which is worse, because it reads as a defect in the skill rather than in the scanner.
export const RUNNABLE_LANGS = ['python', 'bash', 'sh', 'r', 'R'];

// Every runnable block in one markdown document, as source strings.
//
// Scanned line by line rather than with one regex, because both things a regex gets wrong
// here are load-bearing. Fences indent: a block inside a numbered list item — which is how
// every pitfall in the registry is written — starts at four spaces, and an anchored /^```/
// silently skips it. And a fence may carry an info string beyond the language. A first cut
// using /^```(python|bash|sh)/ undercounted the registry by 34 blocks, all of them inside
// list items, which is the population this count most needs to see.
//
// Non-runnable fences are tracked too, not ignored, so that a ``` inside a ```text block
// cannot be mistaken for the close of something else.
export function runnableBlocks(md) {
  const out = [];
  let open = null;
  let buf = [];
  for (const line of md.split('\n')) {
    const o = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)/.exec(line);
    if (open === null) {
      if (!o) continue;
      const keep = RUNNABLE_LANGS.includes(o[2]);
      open = { char: o[1][0], len: o[1].length, keep };
      buf = [];
    } else {
      const c = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
      if (c && c[1][0] === open.char && c[1].length >= open.len) {
        if (open.keep) out.push(buf.join('\n'));
        open = null;
      } else if (open.keep) {
        buf.push(line);
      }
    }
  }
  return out;
}

// Discovery vocabulary for `data` skills. `covers` is deliberately free text — tissue,
// assay, organism, modality, whatever a reader would actually type. It is NOT rendered as
// filter chips (that is what `tags` is for) and it is NOT loaded into session context, so
// unlike `description` its length costs nothing per session. The cap is a sanity bound, not
// a budget.
export const MAX_COVERS = 30;
export const MAX_PAPERS = 20;

// What a reader must do to obtain the data by the route the skill documents.
// This is the §3b access test made mechanical rather than a new policy: `controlled` alone
// on a data skill is the "access granted case by case" rejection, and validate.js refuses it.
export const ACCESS_LEVELS = ['open', 'registered', 'controlled'];

// Provenance ids. Both forms are accepted: papers indexed in PubMed carry a PMID, and
// dataset deposits (Zenodo, Dryad) have a DOI and no PMID.
export const PAPER_ID_RE = /^(PMID:\d{1,8}|doi:10\.\d{4,9}\/\S+)$/;

// The client's frontmatter parser has no nesting model (see parseFrontmatterNaive), so a
// nested mapping flattens into the top level. A nested key named one of these would
// overwrite what every client actually installs.
export const CLIENT_READ_KEYS = ['name', 'description', 'allowed-tools'];

// Skills are documentation the agent reads, not programs it runs. Clients write
// skill files non-executable and refuse a manifest containing anything outside
// this list, so a skill shipping one would publish and then fail to install.
export const ALLOWED_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.tsv', '.bib'];

// Mirror the client's line-based frontmatter parser exactly, so validation
// reflects what will actually be read. Single-line scalars only.
export function parseFrontmatterNaive(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content };
  const frontmatter = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) {
      frontmatter[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return { frontmatter, body: m[2] };
}

// Section checks must read the PROSE, and only the prose.
//
// `## Try it`, `## Get the files` and `## Requesting access` were each tested with
// /^##\s+Heading\s*$/m against the whole file. Four ways that passed without the section
// existing, all reproduced:
//
//   - the heading inside a fenced code block — a skill that SHOWS the heading in an example
//     satisfied the gate;
//   - the heading inside an HTML comment;
//   - the heading as a line in the FRONTMATTER, where `## Requesting access` is a valid YAML
//     comment. One line, and the cheapest of the four;
//   - `##` and the text on separate lines, because `\s+` spans newlines — matching something
//     that is not a heading at all. Hence `[ \t]+` below.
//
// This is what `## Try it` — the registry's claim that skills are runnable — was resting on.
export function stripFences(md) {
  const out = [];
  let fence = null;                       // the opening run, e.g. ``` or ~~~~
  for (const line of md.split('\n')) {
    const m = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      // A closing fence is the same character, at least as long, and carries no info string.
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !line.slice(m[0].length).trim()) {
        fence = null;
      }
      continue;                           // drop everything inside, including the fences
    }
    if (m) { fence = m[1]; continue; }
    out.push(line);
  }
  return out.join('\n');
}

// The body a reader actually sees: frontmatter gone, fenced blocks gone, HTML comments gone.
export const proseOf = (md) => stripFences(md.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, ''))
  .replace(/<!--[\s\S]*?-->/g, '');

// Return the body under an `## <name>` heading, or null when the section is absent.
// Trailing text after the name is allowed — `## Requesting access: dbGaP` is an honest author
// writing an honest heading, and an anchored `$` rejected it.
export function sectionBody(md, name) {
  const prose = proseOf(md);
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^##[ \\t]+${esc}\\b.*$`, 'm').exec(prose);
  if (!m) return null;
  const after = prose.slice(m.index + m[0].length);
  const next = /^#{1,2}[ \t]+\S/m.exec(after);   // next section at the same level or above
  return next ? after.slice(0, next.index) : after;
}

export const hasSection = (md, name) => sectionBody(md, name) !== null;

// List immediate skill slugs (directories) under skills/.
export function listSkillDirs(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) return [];
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
}

// Recursively list a skill's files as relative POSIX paths, skipping dotfiles,
// with SKILL.md first then lexicographic. This is the set that gets published.
export function listSkillFiles(dir) {
  const out = [];
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, r);
      else if (e.isFile()) out.push(r);
    }
  })(dir, '');
  out.sort((a, b) => (a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b)));
  return out;
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Deterministic content id over the sorted (path, sha256) pairs.
export function skillChecksum(files) {
  const h = crypto.createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(`${f.path}\0${f.sha256}\n`);
  }
  return 'sha256:' + h.digest('hex');
}
