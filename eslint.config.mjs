// Root ESLint flat config — applies to both frontend/ and backend/.
//
// The default `complexity` rule threshold is 10, which is far too low for
// idiomatic React: every JSX ternary (`a ? b : c`) and `&&` guard counts as a
// branch, so ordinary presentational components routinely score 20-35 without
// being hard to read. 20 keeps a real safety net for genuinely tangled code
// while removing the React false positives. Bump this only with reason.
export default [
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Browser globals used across frontend/
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        Audio: 'readonly',
        setTimeout: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        // Node globals used across backend/src/
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      complexity: ['warn', 20],
    },
  },
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  },
];
