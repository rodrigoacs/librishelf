import { defineConfig } from 'vitest/config'

/**
 * Testes unitários do frontend (npm test): funções puras de src/utils/.
 * Fuso fixo em São Paulo: é onde os bugs de "dia anterior" aparecem.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    env: { TZ: 'America/Sao_Paulo' }
  }
})
