import { baseConfig } from '@aidenjang/config/eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/*.config.js',
      // bloomnote/web is ported (Phase 3). Its API is still parked Vercel source (ported in
      // 3.2), and asset scripts aren't linted.
      'apps/bloomnote/api/**',
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
