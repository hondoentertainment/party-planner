import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // These flags are too strict for normal data-loading and ref-to-callback patterns
      // used across hooks (Supabase on mount, matchMedia, debounced save).
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },
  {
    // Context + hook files export more than components; HMR is still fine in Vite.
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
