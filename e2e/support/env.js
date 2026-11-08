/**
 * Endereços dos testes. Com Docker (npm run test:stack): E2E_BASE_URL e
 * E2E_FAKES_URL. Sem Docker: as portas que o playwright.config.js sobe.
 */
// Modo sem Docker: portas fora das do desenvolvimento (3050, 5173, 8080)
export const NATIVE_PORTS = Object.freeze({ fakes: 4010, smtp: 2525, backend: 3051, frontend: 4180 })

export const BASE_URL = (process.env.E2E_BASE_URL || `http://localhost:${NATIVE_PORTS.frontend}`).replace(/\/+$/, '')
export const FAKES_URL = (process.env.E2E_FAKES_URL || `http://localhost:${NATIVE_PORTS.fakes}`).replace(/\/+$/, '')
