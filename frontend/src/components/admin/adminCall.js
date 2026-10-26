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

/** 93784 → "1d 2h 3min" */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}min`].filter(Boolean).join(' ')
}
