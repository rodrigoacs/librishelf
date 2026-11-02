import { inject } from 'vue'

/**
 * As abas da área administrativa chamam a API por aqui: se a liberação
 * venceu (ADMIN_LOCKED), a tela volta para a senha e a aba recebe um
 * LockedError — que ela ignora, sem mostrar aviso de erro.
 */
export const ADMIN_CALL = Symbol('adminCall')

export class LockedError extends Error {
  constructor() {
    super('admin locked')
    this.name = 'LockedError'
  }
}

export function useAdminCall() {
  return inject(ADMIN_CALL, fn => fn())
}

const tag = locale => (locale === 'en' ? 'en-US' : 'pt-BR')

/** Data e hora curtas no idioma da pessoa ('' se não houver data). */
export function formatDateTime(value, locale) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(tag(locale), { dateStyle: 'short', timeStyle: 'short' })
}

export function formatDate(value, locale) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(tag(locale), { dateStyle: 'medium' })
}

export function formatNumber(value, locale) {
  return Number(value || 0).toLocaleString(tag(locale))
}

export function formatDayMonth(value, locale) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(tag(locale), { day: 'numeric', month: 'short' }).replace('.', '')
}

export function formatShortDate(value, locale) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(tag(locale), { dateStyle: 'short' })
}

export function formatBytes(bytes, locale) {
  if (bytes === null || bytes === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Number(bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value.toLocaleString(tag(locale), { maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0 })} ${units[unit]}`
}

/** 4990 → "R$ 49,90" */
export function formatMoney(cents, locale, currency = 'BRL') {
  return (Number(cents || 0) / 100).toLocaleString(tag(locale), { style: 'currency', currency })
}

/** Data ISO → "2026-11-02" (dia local), para <input type="date"> */
export function toDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "2026-11-02" → ISO no começo do dia local (ou no fim, com endOfDay); vazio → null */
export function fromDateInput(value, { endOfDay = false } = {}) {
  if (!value) return null
  const date = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** 93784 → "1d 2h 3min" */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}min`].filter(Boolean).join(' ')
}
