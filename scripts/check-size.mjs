/*
 * Ceilings on file length and component state, run by `pnpm verify`.
 *
 * Nothing else here notices a file growing. index.ts reached 1225 lines holding thirty routes and
 * AccountPage 1151 with 43 useState calls, both passing every other gate the whole way. A god-file
 * is never added; it accretes twenty lines at a time, and no single diff looks wrong.
 *
 * Raise a ceiling only when the thing above it genuinely is one responsibility. Splitting the file
 * is the other option and usually the right one.
 */
import { globSync, readFileSync } from 'node:fs';

const MAX_LINES = 400;
const MAX_STATE = 12;

/*
 * Already over, and being decomposed. Listed at its own size rather than the ceiling being raised for
 * everyone, so nothing else can grow past it meanwhile.
 * An entry sitting above its file fails too, so nobody has to remember to shrink one.
 */
const ALREADY_OVER = {
  'packages/web/src/pages/AccountPage.tsx': { lines: 483, state: 16 },
};

const files = globSync('packages/*/src/**/*.{ts,tsx}').filter((f) => !/\.test\.tsx?$/.test(f));
const problems = [];
let widest = { lines: 0 };
let busiest = { state: 0 };

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n').length;
  // useState in a component, not every hook: a count of these is how much one file is keeping track of.
  const state = (source.match(/\buseState[(<]/g) ?? []).length;

  if (lines > widest.lines) widest = { file, lines };
  if (state > busiest.state) busiest = { file, state };

  const allowed = ALREADY_OVER[file] ?? {};
  const lineCap = allowed.lines ?? MAX_LINES;
  const stateCap = allowed.state ?? MAX_STATE;

  if (lines > lineCap) {
    problems.push(`${file} is ${lines} lines, over ${lineCap}. Split it rather than raising this.`);
  }
  if (state > stateCap) {
    problems.push(
      `${file} holds ${state} pieces of state, over ${stateCap}. Extract a component or a hook.`,
    );
  }
  if (ALREADY_OVER[file]) {
    if (lines <= MAX_LINES && state <= MAX_STATE) {
      problems.push(`${file} is under the ceiling now: drop it from ALREADY_OVER`);
    } else {
      if (allowed.lines !== undefined && lines < allowed.lines) {
        problems.push(
          `${file} is down to ${lines} lines: lower its ALREADY_OVER entry from ${allowed.lines}`,
        );
      }
      if (allowed.state !== undefined && state < allowed.state) {
        problems.push(
          `${file} is down to ${state} state: lower its ALREADY_OVER entry from ${allowed.state}`,
        );
      }
    }
  }
}

for (const file of Object.keys(ALREADY_OVER)) {
  if (!files.includes(file))
    problems.push(`${file} is listed as being decomposed but does not exist`);
}

if (problems.length > 0) {
  console.error('size check failed:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(
  `size ok: largest ${widest.file.split('/src/')[1]} at ${widest.lines}/${MAX_LINES} lines, ` +
    `most state ${busiest.file.split('/src/')[1]} at ${busiest.state}/${MAX_STATE}`,
);
