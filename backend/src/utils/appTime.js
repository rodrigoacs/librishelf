/**
 * Fuso do app (APP_TIME_ZONE, padrão America/Sao_Paulo): datas que a pessoa
 * lê (e-mails, contagens por dia) seguem o dia de Brasília, não o do UTC.
 */
export const appTimeZone = () => process.env.APP_TIME_ZONE?.trim() || 'America/Sao_Paulo'

/** 'YYYY-MM-DD' do dia no fuso do app. */
export function appDay(date = new Date()) {
  // en-CA formata como AAAA-MM-DD
  return date.toLocaleDateString('en-CA', { timeZone: appTimeZone() })
}
