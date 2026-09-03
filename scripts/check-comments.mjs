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
 * Raise this only when a phase adds a module, never to fit prose into it. If the number has to move
 * to accommodate an explanation you are rewriting rather than a module you are adding, trim the
 * explanation instead. It was set at 910 once and had crept to 907 within a day, entirely on
 * paragraphs restating what the file below already showed.
 *
 * 865 -> 870 for the passkey offer: three functions and an autofill path, trimmed twice first.
 * 870 -> 858 after trimming http/context.ts, which had been repeating credentialAlert.ts.
 * 858 -> 820 after index.ts and harden.ts, the last two files that were more prose than code.
 * 820 -> 718 after a pass over every block longer than four lines, and after the scanner stopped
 * counting route paths as comments.
 */
const SRC_BUDGET = 718;
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

const files = globSync('packages/*/{src,test,e2e}/**/*.{ts,tsx,css}');
const isSrc = (f) => f.includes('/src/') && !/\.test\.tsx?$/.test(f);

let srcLines = 0;
const seen = new Map();
const stranded = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');

  for (const c of comments(source, file.endsWith('.css'))) {
    if (isSrc(file)) srcLines += c.lines;
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

console.log(`comments ok: ${srcLines}/${SRC_BUDGET} lines in src, no duplicates, none stranded`);
