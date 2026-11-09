import { computed } from 'vue'
import { useTheme, cssVar } from './useTheme.js'

/**
 * Cores dos gráficos. O chart.js não entende var(--x): lê os valores
 * resolvidos e recalcula quando o tema ou a cor de destaque mudam.
 */
export function useChartPalette() {
  const { themeVersion } = useTheme()
  return computed(() => {
    themeVersion.value // dependência reativa: muda quando o tema muda
    return {
      main: cssVar('--main-color') || '#3a86ff',
      text: cssVar('--text-secondary') || '#a1a1aa',
      grid: cssVar('--border-color') || 'rgba(255,255,255,0.1)',
      series: ['--blue', '--orange', '--green', '--purple', '--red', '--yellow'].map(name => cssVar(name) || '#888')
    }
  })
}

/** onHover do chart.js: mãozinha sobre barras/fatias clicáveis. */
export function pointerOnHover(event, elements) {
  const canvas = event?.native?.target
  if (canvas) canvas.style.cursor = elements.length ? 'pointer' : 'default'
}

/**
 * Opções de um gráfico de barras em que a coluna inteira é clicável (barras
 * baixas são difíceis de acertar). onColumn recebe o índice da coluna.
 */
export function clickableBarOptions(palette, onColumn) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { grid: { color: palette.grid }, ticks: { color: palette.text, precision: 0 } },
      x: { grid: { display: false }, ticks: { color: palette.text, maxRotation: 0, autoSkip: false } }
    },
    interaction: { mode: 'index', intersect: false },
    onHover: pointerOnHover,
    onClick: (_, elements) => {
      if (elements.length) onColumn(elements[0].index)
    }
  }
}
