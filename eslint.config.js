import { baseConfig } from '@aidenjang/config/eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/*.config.js',
      // bloomnote/web + the bloomnote/api Worker (src/) are ported. The parked Vercel source
      // (garden shortener → KV done; design-garden/OG pending 3.5+) and asset scripts aren't linted.
      'apps/bloomnote/api/_legacy/**',
      'apps/bloomnote/middleware.ts',
      'apps/bloomnote/list-messages.mjs',
      'apps/bloomnote/web/scripts/**',
      // Parked apps, imported but not yet ported. Un-ignored per app in its port phase.
      'apps/is-it-a-dog/**',
      'apps/wherever/**',
    ],
  },
  ...baseConfig,
];
