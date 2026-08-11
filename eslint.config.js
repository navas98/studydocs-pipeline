// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // frontend/ is a separate Vite/React app with its own toolchain (and
    // its own dist/ build output), so it doesn't belong to this Node/TS
    // backend lint config.
    ignores: ['dist/**', 'node_modules/**', 'frontend/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
