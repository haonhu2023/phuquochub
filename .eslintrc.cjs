// ESLint dùng chung cho packages/* và apps/api (eslintrc, ESLint 8).
// apps/web dùng cấu hình riêng (extends next/core-web-vitals) qua root: true.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    '.next',
    'coverage',
    '.turbo',
    '**/*.js',
    '**/*.mjs',
    '**/*.cjs',
    'apps/web/**',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-empty-function': 'off',
  },
};
