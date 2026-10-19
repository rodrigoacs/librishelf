import postcss from 'postcss'

/**
 * Tema do PrimeVue ligado aos tokens do app.
 *
 * O PrimeVue 3 traz o tema Aura em arquivos prontos, com as cores escritas
 * direto em cada regra (o azul do tema aparece mais de 100 vezes). Este plugin
 * carrega o Aura claro e o escuro e, no build:
 *
 *   1. prefixa cada regra com :where([data-theme="dark"|"light"]) — os dois
 *      convivem no mesmo CSS e vale o tema escolhido no app (o :where não
 *      soma especificidade, então o CSS do app continua vencendo como antes);
 *   2. troca o azul do Aura pela cor de destaque do app (--main-color para
 *      texto e borda, --main-solid para fundo com texto branco);
 *   3. tira os @font-face (o app usa a própria Inter).
 *
 * Uso: import 'primevue/resources/themes/aura-dark-blue/theme.css' e
 * '.../aura-light-blue/theme.css' no main.js.
 */

const THEME_FILE = /primevue\/resources\/themes\/aura-(dark|light)-blue\/theme\.css$/

const solid = 'var(--main-solid)'
const accent = 'var(--main-color)'
const onAccent = 'var(--on-main)'
const darker = pct => `color-mix(in srgb, var(--main-solid) ${pct}%, black)`
const tint = alpha => `rgba(var(--main-color-rgb), ${alpha})`

// cor do Aura → [valor quando é fundo, valor nos outros usos (texto, borda, sombra)]
const PALETTE = {
  dark: {
    '#60a5fa': [solid, accent],
    '#3b82f6': [solid, accent],
    '#93c5fd': [darker(88), accent],
    '#bfdbfe': [darker(78), accent],
    '#020617': [onAccent, onAccent]
  },
  light: {
    '#3b82f6': [solid, accent],
    '#2563eb': [darker(88), accent],
    '#1d4ed8': [darker(78), accent],
    '#eff6ff': [tint(0.1), tint(0.5)],
    '#dbeafe': [tint(0.16), tint(0.5)],
    '#bfdbfe': [tint(0.24), tint(0.5)],
    // cinzas "slate" do Aura claro → "zinc", os mesmos cinzas do app
    '#f8fafc': ['#fafafa', '#fafafa'],
    '#f1f5f9': ['#f4f4f5', '#f4f4f5'],
    '#e2e8f0': ['#e4e4e7', '#e4e4e7'],
    '#cbd5e1': ['#d4d4d8', '#d4d4d8'],
    '#94a3b8': ['#a1a1aa', '#a1a1aa'],
    '#64748b': ['#71717a', 'var(--text-secondary)'],
    '#475569': ['#52525b', '#52525b'],
    '#334155': ['#3f3f46', 'var(--text-primary)'],
    '#1e293b': ['#27272a', '#27272a'],
    '#0f172a': ['#18181b', '#18181b']
  }
}
const BLUE_RGBA = /rgba\(\s*(?:96,\s*165,\s*250|59,\s*130,\s*246)\s*,\s*([\d.]+)\s*\)/gi
const HEX = /#[0-9a-f]{6}\b/gi

function isBackground(prop) {
  return prop === 'background' || prop === 'background-color' || /^--.*(bg|background)/.test(prop)
}

function recolor(value, prop, palette) {
  const bg = isBackground(prop)
  return value
    .replace(BLUE_RGBA, (_, alpha) => tint(alpha))
    .replace(HEX, hex => {
      const entry = palette[hex.toLowerCase()]
      return entry ? entry[bg ? 0 : 1] : hex
    })
}

function scopeSelector(selector, scope) {
  if (selector.startsWith(':root')) return `:where(:root${scope})${selector.slice(5)}`
  return `:where(${scope}) ${selector}`
}

export function transformTheme(css, mode) {
  const scope = `[data-theme="${mode}"]`
  const palette = PALETTE[mode]
  const root = postcss.parse(css)

  root.walkAtRules('font-face', rule => rule.remove())
  root.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return
    rule.selectors = rule.selectors.map(sel => scopeSelector(sel, scope))
  })
  root.walkDecls(decl => {
    if (decl.prop === 'font-family' || decl.prop === '--font-family') {
      decl.remove()
      return
    }
    decl.value = recolor(decl.value, decl.prop, palette)
  })
  return root.toString()
}

export default function primevueTheme() {
  return {
    name: 'librishelf:primevue-theme',
    enforce: 'pre',
    transform(code, id) {
      const match = id.split('?')[0].match(THEME_FILE)
      if (!match) return null
      return { code: transformTheme(code, match[1]), map: null }
    }
  }
}
