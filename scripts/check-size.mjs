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

const MAX_LINES = 500;
const MAX_STATE = 20;

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

  if (lines > MAX_LINES) {
    problems.push(
      `${file} is ${lines} lines, over ${MAX_LINES}. Split it rather than raising this.`,
    );
  }
  if (state > MAX_STATE) {
    problems.push(
      `${file} holds ${state} pieces of state, over ${MAX_STATE}. Extract a component or a hook.`,
    );
  }
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
