import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Generated output, vendored dependencies, and binary E2E fixtures.
    ignores: [
      '.vite/**',
      'build/**',
      'graphify-out/**',
      'node_modules/**',
      'out/**',
      'tests/e2e/fixtures/**'
    ]
  },

  // Plain JavaScript: Forge config and the Node-based E2E harness.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node
    }
  },

  // Application TypeScript is linted with type information from the two project configs.
  {
    files: ['src/**/*.ts', 'electron.vite.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.web.json'],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // The rule cannot distinguish a callback property passed to another function from an
      // unbound class method; this codebase uses callback properties extensively.
      '@typescript-eslint/unbound-method': 'off'
    }
  },

  // Unit tests are not part of either runtime project, so lint them without type information.
  {
    files: ['tests/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended]
  },

  // Runtime globals per process boundary.
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['src/renderer/**/*.ts'],
    languageOptions: {
      globals: globals.browser
    }
  },

  // The composition root declares late-bound service singletons, then assigns each once in
  // dependency order; `const` cannot express that two-phase setup.
  {
    files: ['src/renderer/src/main.ts'],
    rules: {
      'prefer-const': 'off'
    }
  }
)
