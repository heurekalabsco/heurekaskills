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

const errors = [];
const err = (slug, msg) => errors.push(`${slug}: ${msg}`);

for (const slug of listSkillDirs(SKILLS)) {
  const dir = path.join(SKILLS, slug);
  const skillMd = path.join(dir, 'SKILL.md');

  if (!SLUG_RE.test(slug)) err(slug, `directory name must match ${SLUG_RE}`);
  if (!fs.existsSync(skillMd)) { err(slug, 'missing SKILL.md'); continue; }

  const raw = fs.readFileSync(skillMd, 'utf8');

  // Full YAML parse (what the site consumes).
  let fm;
  try { fm = yaml.load(raw.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? '') ?? {}; }
  catch (e) { err(slug, `frontmatter is not valid YAML: ${e.message}`); continue; }

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

  // 4. Body non-empty.
  const body = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  if (!body.trim()) err(slug, 'SKILL.md body is empty');

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

if (errors.length) {
  console.error(`✗ validation failed (${errors.length}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✓ ${listSkillDirs(SKILLS).length} skill(s) valid`);
