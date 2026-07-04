import { baseConfig } from '@aidenjang/config/eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/*.config.js',
      // Static assets served as-is (service workers, PWA files) — not app source to lint.
      '**/public/**',
      // Build-time asset scripts (icon generation, etc.) — run under Node, not app code.
      '**/scripts/**',
    ],
  },
  ...baseConfig,
];
