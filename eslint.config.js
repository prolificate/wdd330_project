import js from '@eslint/js';

const browserGlobals = [
  'window', 'document', 'localStorage', 'console', 'fetch', 'history', 'setTimeout',
  'clearTimeout', 'AbortController', 'URL', 'URLSearchParams', 'FormData', 'DOMParser',
  'TextEncoder', 'crypto',
];

export default [
  js.configs.recommended,
  {
    files: ['script/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: Object.fromEntries(browserGlobals.map((name) => [name, 'readonly'])),
    },
  },
  {
    files: ['script/boot.js'],
    languageOptions: { sourceType: 'script' },
  },
];
