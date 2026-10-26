import { signId, readSignedId } from './signedToken.js'

/**
 * Token de descadastro dos avisos por e-mail: "<id>.<assinatura>". Não expira
 * (o link do rodapé precisa funcionar em e-mails antigos) e não precisa de
 * tabela; não dá para forjar sem a chave (RFC 8058 pede um identificador
 * difícil de forjar).
 *   https://www.rfc-editor.org/rfc/rfc8058
 */
const PURPOSE = 'unsubscribe:follow-emails'

export function createUnsubscribeToken(userId) {
  return signId(PURPOSE, userId)
}

/** → id do usuário, ou null se o token não confere. */
export function readUnsubscribeToken(token) {
  return readSignedId(PURPOSE, token)
}
