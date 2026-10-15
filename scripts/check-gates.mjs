/*
 * Every gate in `verify` has to actually run.
 *
 * `pnpm docs` silently resolves to npm's own `docs` command, which exits 0 without running the
 * script — so that gate reported green for a day while never executing, and only failed once CI
 * tried to open a browser. `pnpm deploy` collides the same way. `pnpm run <name>` is unambiguous,
 * so the chain must always spell it out.
 */
import { readFileSync } from 'node:fs';

const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
const problems = [];

for (const chain of ['verify', 'verify:fast', 'verify:core']) {
  for (const step of scripts[chain].split('&&').map((s) => s.trim())) {
    // Workspace-wide and filtered invocations are not script-name lookups.
    if (
      step.startsWith('pnpm -r') ||
      step.startsWith('pnpm --filter') ||
      step.startsWith('pnpm exec')
    ) {
      continue;
    }
    const bare = /^pnpm (?!run )([\w:-]+)$/.exec(step);
    if (bare) {
      problems.push(
        `${chain} calls \`${step}\` — write \`pnpm run ${bare[1]}\`, or a pnpm builtin may shadow it`,
      );
      continue;
    }
    const named = /^pnpm run ([\w:-]+)$/.exec(step);
    if (named && !scripts[named[1]]) {
      problems.push(`${chain} calls \`${step}\` but there is no ${named[1]} script`);
    }
  }
}

/*
 * CI runs its own steps, and that is where the shadowed gate actually surfaced, so check the
 * workflow too rather than only the chains in package.json.
 */
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
for (const m of workflow.matchAll(/^\s*(?:- )?run: (pnpm [^\n]+)$/gm)) {
  const step = m[1].trim();
  if (/^pnpm (?:-r|--filter|exec|install) /.test(step)) continue;
  const bare = /^pnpm (?!run )([\w:-]+)$/.exec(step);
  if (bare) {
    problems.push(`ci.yml runs \`${step}\` — write \`pnpm run ${bare[1]}\``);
    continue;
  }
  const named = /^pnpm run ([\w:-]+)$/.exec(step);
  if (named && !scripts[named[1]]) {
    problems.push(`ci.yml runs \`${step}\` but there is no ${named[1]} script`);
  }
}

if (problems.length > 0) {
  console.error('gate check failed:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log('gates ok: every step of verify, verify:fast and ci.yml resolves to a real script');
