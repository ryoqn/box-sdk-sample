import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ['**/*.{js,mjs,cjs,ts}'] },
  { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
  { languageOptions: { globals: globals.node } },
  {
    rules: {
      semi: 'off',
      '@typescript-eslint/semi': 'off',
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
]
