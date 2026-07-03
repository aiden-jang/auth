import { baseConfig } from '@aidenjang/config/eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/*.config.js',
      // bloomnote asset scripts aren't linted (the Vercel source is gone as of 3.6).
      'apps/bloomnote/web/scripts/**',
      // Parked apps, imported but not yet ported. Un-ignored per app in its port phase.
      'apps/is-it-a-dog/**',
      'apps/wherever/**',
    ],
  },
  ...baseConfig,
];
