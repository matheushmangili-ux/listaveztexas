import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ApexCharts: 'readonly',
        echarts: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      'no-undef': 'error',
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      '.vercel/**',
      'sw.js',
      'js/update-checker.js'
    ]
  }
];
