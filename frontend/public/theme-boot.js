/*
 * Tema, cor de destaque e idioma aplicados antes do CSS e do Vue (evita
 * piscar o tema errado). Script clássico e bloqueante no <head> do
 * index.html, e não inline: a Content-Security-Policy (nginx-security.conf)
 * só aceita scripts do próprio domínio. A mesma lógica vive em useTheme.js
 * e i18n.js.
 */
(function () {
  var root = document.documentElement
  var accents = ['blue', 'green', 'purple', 'red', 'orange', 'yellow']
  // Pacote 29: personalização da conta (cópia do /auth/me feita pelo useTheme)
  var palettes = { paper: 'light', amoled: 'dark', slate: 'dark', forest: 'dark' }
  var bars = { paper: '#f3ecdf', amoled: '#000000', slate: '#0f172a', forest: '#0f1a14' }
  var proAccents = ['teal', 'pink', 'indigo']
  var icons = ['night', 'paper', 'mono']
  try {
    var theme = localStorage.getItem('user-theme')
    var accent = localStorage.getItem('user-accent')
    var lang = localStorage.getItem('user-locale')
    if (theme !== 'light' && theme !== 'dark') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    }
    var pz = null
    try { pz = JSON.parse(localStorage.getItem('user-personalization') || 'null') } catch (e) { /* cópia corrompida: sem personalização */ }
    if (pz && palettes[pz.palette]) { theme = palettes[pz.palette]; root.setAttribute('data-palette', pz.palette) }
    if (pz && proAccents.indexOf(pz.accent) !== -1) accent = pz.accent
    if (pz && icons.indexOf(pz.appIcon) !== -1) {
      var setHref = function (sel, href) { var el = document.querySelector(sel); if (el) el.setAttribute('href', href) }
      setHref('link[rel="manifest"]', '/manifest-' + pz.appIcon + '.webmanifest')
      setHref('link[rel="icon"][type="image/svg+xml"]', '/icons/alt/' + pz.appIcon + '.svg')
      setHref('link[rel="apple-touch-icon"]', '/icons/alt/' + pz.appIcon + '-192.png')
    }
    root.setAttribute('data-theme', theme)
    if (accents.indexOf(accent) !== -1 || proAccents.indexOf(accent) !== -1) {
      root.style.setProperty('--main-color-rgb', 'var(--' + accent + '-rgb)')
      root.style.setProperty('--main-solid-rgb', 'var(--' + accent + '-solid-rgb)')
    }
    var bar = (pz && bars[pz.palette]) || (theme === 'light' ? '#f0f0f3' : '#121212')
    var metas = document.querySelectorAll('meta[name="theme-color"]')
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', bar)
    if (lang === 'en') root.lang = 'en'
  } catch (e) {
    // Sem localStorage (aba privada, bloqueio): o Vue aplica o tema ao carregar
  }
})()
