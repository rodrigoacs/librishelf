import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

/**
 * Lint do frontend: npm run lint (npm run lint -- --fix corrige o que dá).
 * Regras recomendadas do ESLint e do Vue 3; o estilo (aspas, ponto e vírgula,
 * quebra de atributos) segue o que o código já usa.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, __APP_BUILD_TIME__: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      // O app usa nomes de uma palavra nas telas (Home, Library...)
      'vue/multi-word-component-names': 'off',
      // Estilo dos templates: o que o projeto já faz
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off',
      'vue/attributes-order': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off'
    }
  },

  // Service worker e scripts do build/testes rodam fora do navegador comum
  {
    files: ['sw/**/*.js'],
    // __BUILD_ID__ e __PRECACHE__ são trocados no build (vite/serviceWorker.js)
    languageOptions: { globals: { ...globals.serviceworker, __PRECACHE__: 'readonly' } }
  },
  {
    files: ['vite/**/*.js', 'vite.config.js', 'eslint.config.js', 'vitest.config.js'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['src/**/*.test.js'],
    languageOptions: { globals: { ...globals.node } }
  }
]
