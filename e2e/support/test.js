import { test as base, expect } from '@playwright/test'
import { BASE_URL } from './env.js'

/**
 * `test` dos cenários: o do Playwright mais a guarda de CSP.
 *
 * Com o stack do Docker, o nginx manda a Content-Security-Policy (hoje em
 * Report-Only). O navegador dispara securitypolicyviolation mesmo sem
 * bloquear; qualquer violação no Librishelf durante o teste o reprova. É o
 * que diz se dá para trocar para o modo que bloqueia. Sem Docker (vite
 * preview) não há CSP e a guarda não acha nada.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const violations = []
    const origin = new URL(BASE_URL).origin
    await page.exposeFunction('__e2eCspViolation', violation => {
      if (violation.page.startsWith(origin)) violations.push(violation)
    })
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => {
        window.__e2eCspViolation({
          page: location.href,
          directive: event.effectiveDirective,
          blocked: event.blockedURI,
          source: event.sourceFile ? `${event.sourceFile}:${event.lineNumber}` : null
        })
      })
    })

    await use(page)
    expect(violations, 'violações de CSP no Librishelf').toEqual([])
  }
})

export { expect }
