// @ts-check
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

// Flat-config port of the former .eslintrc.json. Lints src/**/*.ts only (test/, *.js,
// *.json, and the build output stay excluded, matching the old ignorePatterns). The base
// is typescript-eslint's `recommended` set — deliberately NOT eslint:recommended, mirroring
// the previous config, which extended only the @typescript-eslint recommended presets.
export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'test/',
      'documentation/',
      'docs/',
      '___src/',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      '**/*.json',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended, eslintPluginPrettierRecommended],
    rules: {
      'prettier/prettier': 'warn',
      'array-element-newline': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-labels': 'off',
      'no-array-constructor': 'off',
      quotes: 'off',
      'no-unreachable': 'warn',
      'newline-before-return': 'warn',
      'comma-spacing': 'warn',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
