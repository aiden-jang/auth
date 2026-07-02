import { baseConfig } from '@aidenjang/config/eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/*.config.js',
      // Parked apps, imported but not yet ported. Un-ignored per app in its port phase.
      'apps/bloomnote/**',
      'apps/is-it-a-dog/**',
      'apps/wherever/**',
    ],
  },
  ...baseConfig,
];
