'use strict';

const js = require('@eslint/js');
const globals = require('globals');

// Renderer and editor files are classic <script> tags that share `window.Lastra*` globals
// and export to Node for tests through a guarded `module.exports`.
const browserScript = {
  sourceType: 'script',
  globals: { ...globals.browser, module: 'writable', require: 'readonly' },
};

module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'out/**', 'rsc/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Input validation deliberately matches control characters, and some patterns align columns with spaces.
      'no-control-regex': 'off',
      'no-regex-spaces': 'off',
      // Classic scripts may reuse names such as `status` that also exist on window.
      'no-redeclare': ['error', { builtinGlobals: false }],
    },
  },
  {
    // Functions serialized into an offscreen page with executeJavaScript run in the browser context.
    files: ['src/main/mcp-deck-render.js', 'src/main/stats-preview.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['src/renderer/**/*.js', 'src/editor/**/*.js', 'src/restore/**/*.js', 'src/agent-review/**/*.js', 'src/agent-preview/**/*.js',
      'src/sound/**/*.js'],
    languageOptions: browserScript,
  },
  {
    files: ['src/shared/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/renderer/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.browser },
  },
  {
    files: ['src/preload/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['extensions/lastra-wayland/**/*.{mjs,js}'],
    languageOptions: { sourceType: 'module', globals: { ARGV: 'readonly', print: 'readonly', printerr: 'readonly' } },
  },
];
