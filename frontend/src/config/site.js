// Dados do site exibidos na política de privacidade e usados nos links.
// Revise antes de publicar.
export const CONTACT_EMAIL = 'rodrigohths@gmail.com'
export const PRIVACY_UPDATED_AT = '2026-10-26'

// Mesmo limite do backend (routes/library.js → MAX_UPLOAD_MB).
export const MAX_UPLOAD_MB = 10

// Em produção a API fica no mesmo domínio, em /api (nginx do container do
// frontend faz o proxy). No dev o Vite faz o mesmo proxy.
export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
