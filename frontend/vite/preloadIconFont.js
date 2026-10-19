/**
 * Pré-carrega a fonte do PrimeIcons no build.
 *
 * O primeicons.css usa font-display: block: até a fonte chegar, os ícones
 * ficam invisíveis e os botões só de ícone (fechar, filtro, marcar como lido,
 * estrelas) aparecem vazios. Com o <link rel="preload"> no index.html o
 * navegador baixa a fonte junto com o CSS, sem esperar o primeiro ícone.
 * O nome do arquivo tem hash, por isso o link é gerado aqui e não escrito à mão.
 */
export default function preloadIconFont() {
  let base = '/'
  return {
    name: 'librishelf:preload-icon-font',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const font = Object.values(ctx.bundle || {}).find(
          file => file.type === 'asset' && /primeicons.*\.woff2$/.test(file.fileName)
        )
        if (!font) return html
        return [{
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${base}${font.fileName}`, crossorigin: '' },
          injectTo: 'head'
        }]
      }
    }
  }
}
