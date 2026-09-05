/*
 * Three mechanical checks on comments, run by `pnpm verify`.
 *
 * A budget, because a cleanup is a moment and drift is permanent. A duplicate check, because the
 * same fact copied into several files is the failure this repo actually had: each copy reads as
 * reasonable on its own and only a whole-repo view shows it. And a stranded check, because moving
 * code leaves comments behind describing something that is no longer underneath them -- one of
 * those claimed an enumeration defence above a route that has none.
 */
import { globSync, readFileSync } from 'node:fs';

/*
 * Raise this only for a module you are adding, never to fit prose. If the number has to move to
 * accommodate an explanation you are rewriting, trim the explanation instead.
 */
const SRC_BUDGET = 699;
// The gates' own source counts too, on the same budget. Raised from 74 when the size gate grew a
// ratchet: a budget moves for a branch that needs explaining, never to make room for padding.
const SCRIPTS_BUDGET = 78;
const DUP_MIN_CHARS = 45;

/**
 * Comment spans in one file.
 *
 * Strings are blanked first, because the source is full of things that look like comment openers:
 * `http://…` in a URL, and `'/auth/*'` as a route path, which opened a block comment that swallowed
 * sixteen lines of middleware and counted them as prose.
 */
function comments(source, isCss) {
  const masked = source.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (m) =>
    ' '.repeat(m.length),
  );
  const out = [];
  const re = isCss ? /\/\*[\s\S]*?\*\//g : /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  for (const m of masked.matchAll(re)) {
    const text = source.slice(m.index, m.index + m[0].length);
    out.push({ text, lines: text.split('\n').length });
  }
  return out;
}

// scripts/ included: the checks were not checking themselves, and the budget comment in this very
// file had grown into an inaccurate changelog nobody was keeping true.
const files = [
  ...globSync('packages/*/{src,test,e2e}/**/*.{ts,tsx,css}'),
  ...globSync('scripts/*.mjs'),
];
const isSrc = (f) => f.includes('/src/') && !/\.test\.tsx?$/.test(f);

let srcLines = 0;
let scriptLines = 0;
const seen = new Map();
const stranded = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');

  for (const c of comments(source, file.endsWith('.css'))) {
    if (isSrc(file)) srcLines += c.lines;
    else if (file.startsWith('scripts/')) scriptLines += c.lines;
    const flat = c.text.replace(/\s+/g, ' ').trim();
    if (flat.length < DUP_MIN_CHARS) continue;
    // Directives are meant to repeat: two files suppressing the same rule is not duplication.
    if (/^(\/\/|\/\*)\s*(eslint-|prettier-|@ts-|c8 |v8 )/.test(flat)) continue;
    const where = seen.get(flat) ?? [];
    if (!where.includes(file)) where.push(file);
    seen.set(flat, where);
  }

  /*
   * A comment, then a blank line, then a declaration. Prose that opens a file or closes one is
   * fine; a paragraph floating between two routes is a comment whose subject moved without it.
   */
  const lines = source.split('\n');
  // Only once a declaration has closed. A doc block at the top of a file, then a blank line, then
  // the first export is the ordinary shape and not a comment that lost its subject.
  let afterDeclaration = false;
  for (let i = 1; i < lines.length - 2; i++) {
    if (/^\}\)?;?$/.test(lines[i])) afterDeclaration = true;
    if (!afterDeclaration) continue;
    const isComment = /^\s*(\/\/|\*\/)/.test(lines[i]);
    const gap = lines[i + 1]?.trim() === '';
    const next = lines.slice(i + 2, i + 4).find((l) => l.trim()) ?? '';
    if (isComment && gap && /^(export |app\.(get|post|all)\()/.test(next.trim())) {
      stranded.push(
        `${file}:${i + 1} — "${lines[i].trim().slice(0, 60)}…" then a blank line, then ${next.trim().slice(0, 40)}`,
      );
    }
  }
}

const problems = [];

if (srcLines > SRC_BUDGET) {
  problems.push(`src carries ${srcLines} comment lines, over the ${SRC_BUDGET} budget.`);
}

if (scriptLines > SCRIPTS_BUDGET) {
  problems.push(`scripts carry ${scriptLines} comment lines, over the ${SCRIPTS_BUDGET} budget.`);
}

for (const [text, where] of seen) {
  if (where.length < 2) continue;
  problems.push(
    `the same comment is in ${where.length} files: "${text.slice(0, 70)}…"\n    ${where.join('\n    ')}`,
  );
}

for (const s of stranded) problems.push(`a comment left behind by a move:\n    ${s}`);

if (problems.length > 0) {
  console.error('comment check failed:\n');
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

console.log(
  `comments ok: ${srcLines}/${SRC_BUDGET} in src, ${scriptLines}/${SCRIPTS_BUDGET} in scripts, ` +
    `no duplicates, none stranded`,
);
