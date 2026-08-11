// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // public/ is plain browser JS served as-is (no build step, no Node
    // globals), so it doesn't belong to this Node/TypeScript lint config.
    ignores: ['dist/**', 'node_modules/**', 'public/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
