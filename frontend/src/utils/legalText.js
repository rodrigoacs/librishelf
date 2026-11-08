import { OWNER } from '../config/site.js'

/**
 * Textos dos Termos e da Privacidade (e frases que apontam para eles, como a
 * caixa do cadastro) têm marcas que viram link: {email}, {terms} e {privacy}.
 * {owner} vira texto: nome e, quando preenchidos, documento e endereço.
 *
 * O i18n recebe uma marca no lugar de cada link; LegalText.vue divide o texto
 * pronto nas marcas e desenha os links.
 */
export const LINK_TOKENS = Object.freeze(['email', 'terms', 'privacy'])

const MARK = '\u0001'
const mark = name => `${MARK}${name}${MARK}`
const SPLIT = new RegExp(`${MARK}(\\w+)${MARK}`)

export function ownerLine(owner = OWNER) {
  return [owner.name, owner.document, owner.address].map(part => part?.trim()).filter(Boolean).join(', ')
}

/** Parâmetros para t()/rt(). */
export function legalParams(owner = OWNER) {
  return { ...Object.fromEntries(LINK_TOKENS.map(name => [name, mark(name)])), owner: ownerLine(owner) }
}

/** 'Leia os \u0001terms\u0001.' → [{ text: 'Leia os ' }, { link: 'terms' }, { text: '.' }] */
export function splitLinks(text) {
  return String(text ?? '')
    .split(SPLIT)
    .map((part, index) => (index % 2 ? { link: part } : { text: part }))
    .filter(part => (part.link ? LINK_TOKENS.includes(part.link) : part.text))
}
