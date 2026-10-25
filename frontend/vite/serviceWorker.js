import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

/**
 * Gera o /sw.js no build a partir de sw/sw.js, com a lista de arquivos do
 * "esqueleto" do app (o que precisa estar guardado para abrir sem internet).
 *
 * Entra: todo JS/CSS do build (as telas são carregadas sob demanda e
 * precisam abrir offline), as fontes do alfabeto latino e a fonte de ícones
 * (woff2), ícones e manifest. Fica de fora o que não faz sentido sem rede ou
 * é pesado: o leitor de código de barras (WebAssembly), fontes de outros
 * alfabetos e formatos antigos de fonte (o navegador usa o woff2).
 *
 * O BUILD_ID muda a cada build com arquivos diferentes: é o que faz o
 * navegador perceber o service worker novo.
 */
const TEMPLATE = fileURLToPath(new URL('../sw/sw.js', import.meta.url))

const EXCLUDE = [
  /\.wasm$/,
  /zxing|ponyfill/i,
  /\.(eot|ttf|woff|svg)$/,
  /(cyrillic|greek|vietnamese)/
]

const PUBLIC_FILES = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
  '/bookshelf.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]

export function precacheList(fileNames, base = '/') {
  return [
    ...fileNames
      .filter(name => /^assets\/.+\.(js|css|woff2)$/.test(name))
      .filter(name => !EXCLUDE.some(pattern => pattern.test(name)))
      .sort()
      .map(name => `${base}${name}`),
    ...PUBLIC_FILES
  ]
}

export default function serviceWorker() {
  let base = '/'
  return {
    name: 'librishelf:service-worker',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    generateBundle(_options, bundle) {
      const files = precacheList(Object.keys(bundle), base)
      const buildId = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
      const source = readFileSync(TEMPLATE, 'utf8')
        .replace("const BUILD_ID = '__BUILD_ID__'", `const BUILD_ID = ${JSON.stringify(buildId)}`)
        .replace('const PRECACHE = __PRECACHE__', `const PRECACHE = ${JSON.stringify(files, null, 2)}`)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    }
  }
}
