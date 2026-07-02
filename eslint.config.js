import { baseConfig } from '@aidenjang/config/eslint';

export default [
  { ignores: ['**/dist/**', '**/build/**', '**/node_modules/**', '**/*.config.js'] },
  ...baseConfig,
];
