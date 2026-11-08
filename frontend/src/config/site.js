// Dados do site exibidos nos Termos de Uso e na Política de Privacidade.
export const CONTACT_EMAIL = 'contato@librishelf.com'

// Quem oferece o serviço (Termos e Privacidade, via {owner}). Para vender pela
// internet, o Decreto 7.962/2013 (art. 2º) pede nome, CPF ou CNPJ e endereço
// físico em local de destaque: preencha document e address antes de abrir as
// vendas. Vazios, ficam fora do texto.
export const OWNER = Object.freeze({
  name: 'Rodrigo Soares',
  document: '', // ex.: 'CPF 000.000.000-00' ou, depois, 'CNPJ 00.000.000/0001-00'
  address: 'Rua São Luiz, 109, Congonhas (MG), CEP 36410-136' // ex.: 'Rua …, nº …, Congonhas (MG), CEP …'
})

// Versão dos Termos e da Privacidade (aceitas juntas), que também é a data de
// "Última atualização" das duas páginas. Mesma data de
// backend/src/config/terms.js: trocar nos dois pede novo aceite a todos.
export const TERMS_VERSION = '2026-11-08'

// Enquanto o texto não passar pela revisão de um advogado, as duas páginas
// mostram o aviso de rascunho. Depois da revisão: false e versão nova.
export const LEGAL_DRAFT = true

// Mesmo limite do backend (routes/library.js → MAX_UPLOAD_MB).
export const MAX_UPLOAD_MB = 10

// Em produção a API fica no mesmo domínio, em /api (nginx do container do
// frontend faz o proxy). No dev o Vite faz o mesmo proxy.
export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
