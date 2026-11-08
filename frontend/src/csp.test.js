import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { precacheList } from '../vite/serviceWorker.js'

/**
 * A Content-Security-Policy (nginx-security.conf) só aceita scripts e estilos
 * vindos de arquivos do próprio domínio. Um <script> ou <style> inline, ou um
 * atributo on*= / style= no index.html, funciona no dev e quebra em produção
 * quando a política passa a bloquear.
 */
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const html = read('../index.html').replace(/<!--[\s\S]*?-->/g, '')

describe('index.html segue a CSP', () => {
  it('todo <script> vem de um arquivo (src=)', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    expect(scripts.length).toBeGreaterThan(0)
    for (const [tag, attrs, body] of scripts) {
      expect(attrs, tag).toMatch(/\bsrc=/)
      expect(body.trim(), tag).toBe('')
    }
  })

  it('sem <style>, style= nem on*= inline', () => {
    expect(html).not.toMatch(/<style\b/i)
    expect(html).not.toMatch(/\sstyle=/i)
    expect(html).not.toMatch(/\son[a-z]+=/i)
  })

  it('o script do tema fica guardado para abrir offline', () => {
    expect(html).toContain('src="/theme-boot.js"')
    expect(precacheList([])).toContain('/theme-boot.js')
  })
})

describe('nginx-security.conf', () => {
  const conf = read('../nginx-security.conf')
  const policy = conf.match(/add_header Content-Security-Policy(?:-Report-Only)? "([^"]+)"/)?.[1] ?? ''
  const directives = Object.fromEntries(policy.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]))

  it('sem unsafe-inline e sem unsafe-eval nos scripts', () => {
    expect(directives['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'"])
    expect(policy).not.toContain("'unsafe-inline'")
    expect(policy).not.toContain("'unsafe-eval'")
  })

  it('travas básicas e o coletor de relatórios', () => {
    expect(directives['object-src']).toEqual(["'none'"])
    expect(directives['frame-ancestors']).toEqual(["'none'"])
    expect(directives['base-uri']).toEqual(["'self'"])
    expect(directives['report-uri']).toEqual(['/api/csp-report'])
  })

  // Menos os internal (subrequisição do SSI): esses não respondem ao navegador
  it('todo location do nginx.conf inclui os cabeçalhos', () => {
    const nginx = read('../nginx.conf').replace(/#.*$/gm, '')
    const locations = nginx.split(/\n\s*location\s/).slice(1).filter(block => !/^\s*internal;/m.test(block))
    expect(locations.length).toBeGreaterThan(5)
    for (const block of locations) {
      expect(block, block.split('\n')[0]).toContain('include /etc/nginx/snippets/librishelf-security.conf;')
    }
  })
})
