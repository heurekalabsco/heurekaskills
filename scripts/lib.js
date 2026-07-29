// Shared helpers for the skill validator.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const CATEGORIES = ['data', 'models', 'analysis', 'utility', 'communication'];

export const SLUG_RE = /^[a-z0-9-]+$/;

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
