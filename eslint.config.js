import { baseConfig } from '@aidenjang/config/eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

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

  /*
   * Type-aware rules, narrowed to the ones that catch a real defect. The full
   * recommendedTypeChecked set is mostly require-await noise here.
   *
   * A dropped await on a Worker is the one that hurts: the isolate can be torn down the moment the
   * response is returned, so an unawaited write is a write that may never land.
   */
  {
    files: ['packages/{api,client}/{src,test}/**/*.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      /*
       * no-unnecessary-type-assertion is deliberately absent. `Response.json()` is typed `any` in
       * workers-types, so the rule reads every `(await res.json()) as {...}` in the tests as
       * redundant and its fixer deletes them -- turning a checked body into `any` and losing the
       * typo it would have caught. The two genuine hits in src are not worth that.
       */
    },
  },

  /*
   * The web app is React and nothing was checking it. jsx-no-comment-textnodes is the one with a
   * history: a comment written in JSX children without braces renders as visible text on the page,
   * and reads as perfectly ordinary code in review.
   */
  {
    // src only: e2e/ is Playwright, whose fixture callbacks take a `use` argument that the
    // rules-of-hooks check reads as a React hook called from the wrong place.
    files: ['packages/web/src/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs['recommended-latest'].rules,
      // The SPA is on the new JSX transform, so React needs no import and no scope check.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      /*
       * Off for quotes and apostrophes. The ambiguity this rule exists for is `>` and `}`; a
       * straight quote in prose renders exactly as written, and spelling out &quot; through a
       * privacy policy makes the copy unreadable in the source for no reader-visible gain.
       */
      'react/no-unescaped-entities': 'off',
    },
  },
];
