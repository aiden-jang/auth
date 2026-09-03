import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Shared flat-config base for every app and package. Consumers spread this and add
// their own ignores / environment-specific overrides.
export const baseConfig = tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  rules: {
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
});

export default baseConfig;
