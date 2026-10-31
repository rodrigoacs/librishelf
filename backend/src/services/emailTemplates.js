/**
 * E-mails do Librishelf (pt/en): versão texto + HTML.
 *
 * O HTML segue as regras de e-mail, não as de página web:
 * - layout em <table> e estilos inline (Gmail e Outlook ignoram boa parte do <style>);
 * - botão "à prova de bala" (célula de tabela com bgcolor), que aparece mesmo
 *   com imagens bloqueadas;
 * - o logo vem por URL pública (MAIL_LOGO_URL, padrão https://librishelf.com/bookshelf.png),
 *   com largura e altura fixas: se o leitor bloquear imagens, o layout não pula
 *   e o nome "Librishelf" logo abaixo continua identificando o e-mail.
 *
 * Para criar um e-mail novo: acrescente os textos em TEXTS (pt e en) e
 * exporte uma função que chama build('chave', params).
 * Para ver o resultado sem enviar: npm run email:preview
 */

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const BRAND = {
  ink: '#18181b',
  muted: '#52525b',
  soft: '#71717a',
  page: '#eceef3',
  card: '#ffffff',
  line: '#e4e4e7',
  shelf: '#18181b',
  wood: '#3f3f46',
  button: '#2563eb',
  link: '#2563eb',
  tint: '#eef4ff'
}

const SERIF = "Georgia,'Times New Roman',serif"
const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const TEXTS = {
  pt: {
    reset: {
      subject: 'Redefinir sua senha do Librishelf',
      preheader: 'Use o link para escolher uma senha nova. Ele vale por 1 hora.',
      title: 'Vamos trocar sua senha',
      greeting: name => `Olá, ${name}!`,
      body: 'Recebemos um pedido para redefinir a senha da sua conta. Toque no botão abaixo para escolher uma senha nova.',
      button: 'Escolher senha nova',
      note: 'O link vale por 1 hora e só funciona uma vez.',
      ignore: 'Se não foi você, pode ignorar este e-mail: sua senha continua a mesma e ninguém entrou na sua conta.'
    },
    verify: {
      subject: 'Confirme seu e-mail no Librishelf',
      preheader: 'Falta só um passo para liberar a biblioteca pública e a comunidade.',
      title: 'Boas-vindas à sua estante',
      greeting: name => `Olá, ${name}!`,
      body: 'Que bom ter você no Librishelf. Confirme que este e-mail é seu para liberar a biblioteca pública, a comunidade de leitores e a recuperação de senha.',
      button: 'Confirmar e-mail',
      note: 'O link vale por 3 dias.',
      ignore: 'Se você não criou uma conta no Librishelf, pode ignorar este e-mail.'
    },
    changed: {
      subject: 'O e-mail da sua conta no Librishelf mudou',
      preheader: 'Se foi você, não precisa fazer nada.',
      title: 'Seu e-mail foi trocado',
      greeting: name => `Olá, ${name}!`,
      body: ({ newEmail }) => `O e-mail da sua conta agora é ${newEmail}. Avisos e links de senha passam a ir para lá.`,
      button: 'Não fui eu: redefinir senha',
      note: 'Redefinir a senha derruba todas as sessões abertas.',
      ignore: 'Se foi você quem trocou, pode ignorar este aviso.'
    },
    follow: {
      subject: ({ items }) => followSubjectPt(items),
      preheader: ({ items }) => items.map(item => followLinePt(item)).join(' · '),
      title: 'Novidades dos seus leitores',
      greeting: name => `Olá, ${name}!`,
      body: ({ items }) => (items.some(item => item.kind === 'request')
        ? 'Pedidos para seguir precisam da sua aprovação. Você decide quem acompanha suas leituras.'
        : 'Agora você acompanha as leituras dessas pessoas na comunidade.'),
      line: item => followLinePt(item),
      button: ({ items }) => (items.some(item => item.kind === 'request') ? 'Ver pedidos' : 'Abrir a comunidade'),
      note: ({ hours }) => `Você recebe no máximo um destes avisos a cada ${hours} horas; o que acontecer nesse meio-tempo vem junto no próximo.`,
      unsubscribe: 'Não quer mais estes avisos?',
      unsubscribeLink: 'Descadastrar com um clique',
      manage: 'Você também pode mudar isso na Conta, em Avisos por e-mail.',
      footer: 'Você recebeu este e-mail porque ativou os avisos de seguidores no Librishelf. Este é um endereço automático: respostas não são lidas.'
    },
    report: {
      subject: ({ title, hidden }) => `${hidden ? '[Oculta] ' : ''}Resenha denunciada: ${title}`,
      preheader: ({ author, reasonLabel }) => `${author} · ${reasonLabel}`,
      title: 'Resenha denunciada',
      greeting: () => 'Olá!',
      body: ({ hidden, total }) => (hidden
        ? `Esta resenha recebeu ${total} denúncias e foi ocultada automaticamente até alguém revisar.`
        : 'Um leitor denunciou esta resenha. Ela continua visível até você decidir.'),
      line: line => line,
      button: 'Revisar a resenha',
      note: 'No link você vê a resenha inteira e as denúncias, e escolhe ocultar ou manter.',
      ignore: 'Você recebeu este e-mail porque o endereço está em ADMIN_EMAIL no servidor do Librishelf.'
    },
    avatarReport: {
      subject: ({ username, hidden }) => `${hidden ? '[Oculta] ' : ''}Foto de perfil denunciada: ${username}`,
      preheader: ({ username, reasonLabel }) => `${username} · ${reasonLabel}`,
      title: 'Foto de perfil denunciada',
      greeting: () => 'Olá!',
      body: ({ hidden, total }) => (hidden
        ? `Esta foto recebeu ${total} denúncias e saiu do ar automaticamente até alguém revisar (a conta mostra a inicial).`
        : 'Um leitor denunciou esta foto de perfil. Ela continua no ar até você decidir.'),
      line: line => line,
      button: 'Revisar a foto',
      note: 'No link você vê a foto e as denúncias, e escolhe manter ou remover. O link para de valer se a pessoa trocar a foto.',
      ignore: 'Você recebeu este e-mail porque o endereço está em ADMIN_EMAIL no servidor do Librishelf.'
    },
    fallback: 'Se o botão não funcionar, copie e cole este endereço no navegador:',
    tagline: 'Sua biblioteca pessoal, organizada.',
    footer: 'Você recebeu este e-mail porque ele está cadastrado no Librishelf. Este é um endereço automático: respostas não são lidas.'
  },
  en: {
    reset: {
      subject: 'Reset your Librishelf password',
      preheader: 'Use the link to choose a new password. It is valid for 1 hour.',
      title: "Let's reset your password",
      greeting: name => `Hi, ${name}!`,
      body: 'We received a request to reset your account password. Tap the button below to choose a new one.',
      button: 'Choose a new password',
      note: 'The link is valid for 1 hour and works only once.',
      ignore: "If this wasn't you, you can ignore this email: your password stays the same and nobody has accessed your account."
    },
    verify: {
      subject: 'Confirm your email on Librishelf',
      preheader: 'One last step to unlock your public library and the community.',
      title: 'Welcome to your shelf',
      greeting: name => `Hi, ${name}!`,
      body: "We're glad to have you on Librishelf. Confirm this email is yours to unlock the public library, the readers' community and password recovery.",
      button: 'Confirm email',
      note: 'The link is valid for 3 days.',
      ignore: "If you didn't create a Librishelf account, you can ignore this email."
    },
    changed: {
      subject: 'Your Librishelf email has changed',
      preheader: "If it was you, there's nothing to do.",
      title: 'Your email was changed',
      greeting: name => `Hi, ${name}!`,
      body: ({ newEmail }) => `Your account email is now ${newEmail}. Notices and password links will go there from now on.`,
      button: "It wasn't me: reset password",
      note: 'Resetting your password signs out every open session.',
      ignore: 'If you made this change, you can ignore this notice.'
    },
    follow: {
      subject: ({ items }) => followSubjectEn(items),
      preheader: ({ items }) => items.map(item => followLineEn(item)).join(' · '),
      title: 'News from your readers',
      greeting: name => `Hi, ${name}!`,
      body: ({ items }) => (items.some(item => item.kind === 'request')
        ? 'Follow requests need your approval. You decide who keeps up with your reading.'
        : "You now follow these readers' activity in the community."),
      line: item => followLineEn(item),
      button: ({ items }) => (items.some(item => item.kind === 'request') ? 'See requests' : 'Open the community'),
      note: ({ hours }) => `You get at most one of these emails every ${hours} hours; anything that happens in between comes in the next one.`,
      unsubscribe: "Don't want these emails anymore?",
      unsubscribeLink: 'Unsubscribe in one click',
      manage: 'You can also change this in Account, under Email notifications.',
      footer: "You're receiving this email because you turned on follower notifications on Librishelf. This is an automated address: replies are not read."
    },
    report: {
      subject: ({ title, hidden }) => `${hidden ? '[Hidden] ' : ''}Review reported: ${title}`,
      preheader: ({ author, reasonLabel }) => `${author} · ${reasonLabel}`,
      title: 'Review reported',
      greeting: () => 'Hi!',
      body: ({ hidden, total }) => (hidden
        ? `This review got ${total} reports and was hidden automatically until someone reviews it.`
        : 'A reader reported this review. It stays visible until you decide.'),
      line: line => line,
      button: 'Review it',
      note: 'The link shows the full review and the reports, and lets you hide or keep it.',
      ignore: "You're receiving this email because this address is set as ADMIN_EMAIL on the Librishelf server."
    },
    avatarReport: {
      subject: ({ username, hidden }) => `${hidden ? '[Hidden] ' : ''}Profile photo reported: ${username}`,
      preheader: ({ username, reasonLabel }) => `${username} · ${reasonLabel}`,
      title: 'Profile photo reported',
      greeting: () => 'Hi!',
      body: ({ hidden, total }) => (hidden
        ? `This photo got ${total} reports and was taken down automatically until someone reviews it (the account shows its initial).`
        : 'A reader reported this profile photo. It stays up until you decide.'),
      line: line => line,
      button: 'Review the photo',
      note: 'The link shows the photo and the reports, and lets you keep or remove it. It stops working if the person changes the photo.',
      ignore: "You're receiving this email because this address is set as ADMIN_EMAIL on the Librishelf server."
    },
    fallback: "If the button doesn't work, copy and paste this address into your browser:",
    tagline: 'Your personal library, organized.',
    footer: "You're receiving this email because it is registered on Librishelf. This is an automated address: replies are not read."
  }
}

function followLinePt({ kind, actor }) {
  return kind === 'request' ? `${actor} pediu para seguir você` : `${actor} aceitou seu pedido para seguir`
}

function followLineEn({ kind, actor }) {
  return kind === 'request' ? `${actor} asked to follow you` : `${actor} accepted your follow request`
}

function followSubjectPt(items) {
  const requests = items.filter(item => item.kind === 'request')
  const accepted = items.filter(item => item.kind === 'accepted')
  if (items.length === 1) return `${followLinePt(items[0])} no Librishelf`
  if (accepted.length === 0) return `${requests.length} pedidos para seguir você no Librishelf`
  if (requests.length === 0) return `${accepted.length} pedidos seus foram aceitos no Librishelf`
  return 'Novidades dos seus leitores no Librishelf'
}

function followSubjectEn(items) {
  const requests = items.filter(item => item.kind === 'request')
  const accepted = items.filter(item => item.kind === 'accepted')
  if (items.length === 1) return `${followLineEn(items[0])} on Librishelf`
  if (accepted.length === 0) return `${requests.length} people asked to follow you on Librishelf`
  if (requests.length === 0) return `${accepted.length} of your follow requests were accepted on Librishelf`
  return 'News from your readers on Librishelf'
}

export function normalizeLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('en') ? 'en' : 'pt'
}

function siteUrl() {
  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
}

/** Endereço público do logo. Precisa ser https e acessível de fora: o Gmail baixa a imagem pelos servidores dele. */
function logoUrl() {
  return process.env.MAIL_LOGO_URL?.trim() || 'https://librishelf.com/bookshelf.png'
}

function layout({ locale, lang, t, name, link, items = [], unsubscribe = null }) {
  const url = escapeHtml(link)
  const home = escapeHtml(siteUrl())
  const homeLabel = escapeHtml(siteUrl().replace(/^https?:\/\//, ''))

  return `<!doctype html>
<html lang="${locale === 'en' ? 'en' : 'pt-BR'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(t.subject)}</title>
  <style>
    @media (max-width:600px) {
      .container { width:100% !important; }
      .px { padding-left:24px !important; padding-right:24px !important; }
      .title { font-size:26px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(t.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.page}" style="background:${BRAND.page}">
    <tr>
      <td align="center" style="padding:32px 12px">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px">

          <!-- Topo: logo + nome -->
          <tr>
            <td align="center" bgcolor="${BRAND.shelf}" style="background:${BRAND.shelf};border-radius:16px 16px 0 0;padding:28px 24px 26px">
              <img src="${escapeHtml(logoUrl())}" width="72" height="72" alt="" style="display:block;margin:0 auto;width:72px;height:72px;border:0;outline:none;text-decoration:none">
              <p style="margin:14px 0 0;font-family:${SERIF};font-size:24px;line-height:1;color:#ffffff;letter-spacing:0.5px">Librishelf</p>
              <p style="margin:8px 0 0;font-family:${SANS};font-size:13px;color:#a1a1aa">${escapeHtml(lang.tagline)}</p>
            </td>
          </tr>

          <!-- Conteúdo -->
          <tr>
            <td class="px" bgcolor="${BRAND.card}" style="background:${BRAND.card};padding:40px 48px 12px;font-family:${SANS};color:${BRAND.ink}">
              <h1 class="title" style="margin:0 0 20px;font-family:${SERIF};font-size:30px;line-height:1.2;font-weight:normal;color:${BRAND.ink}">${escapeHtml(t.title)}</h1>
              <p style="margin:0 0 12px;font-size:16px;line-height:1.6;font-weight:bold">${escapeHtml(t.greeting(name))}</p>
              <p style="margin:0 0 ${items.length ? 16 : 28}px;font-size:16px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(t.body)}</p>
${items.length ? `              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px">${items.map(line => `
                <tr><td style="padding:10px 14px;border-left:3px solid ${BRAND.button};background:${BRAND.tint};font-size:15px;line-height:1.5;color:${BRAND.ink}">${escapeHtml(line)}</td></tr>
                <tr><td style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>`).join('')}
              </table>
` : ''}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                <td align="center" bgcolor="${BRAND.button}" style="background:${BRAND.button};border-radius:10px">
                  <a href="${url}" target="_blank" style="display:block;padding:15px 28px;font-family:${SANS};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(t.button)}</a>
                </td>
              </tr></table>

              <p style="margin:16px 0 0;text-align:center;font-size:13px;line-height:1.5;color:${BRAND.soft}">${escapeHtml(t.note)}</p>
            </td>
          </tr>

          <tr>
            <td class="px" bgcolor="${BRAND.card}" style="background:${BRAND.card};border-radius:0 0 16px 16px;padding:24px 48px 40px;font-family:${SANS}">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                <td bgcolor="${BRAND.tint}" style="background:${BRAND.tint};border-radius:10px;padding:16px 18px">
                  <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${BRAND.muted}">${escapeHtml(lang.fallback)}</p>
                  <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all"><a href="${url}" target="_blank" style="color:${BRAND.link};text-decoration:underline">${url}</a></p>
                </td>
              </tr></table>
              ${unsubscribe
                ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${BRAND.line};font-size:14px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(t.unsubscribe)} <a href="${escapeHtml(unsubscribe)}" target="_blank" style="color:${BRAND.link};text-decoration:underline">${escapeHtml(t.unsubscribeLink)}</a>. ${escapeHtml(t.manage)}</p>`
                : `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${BRAND.line};font-size:14px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(t.ignore)}</p>`}
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td align="center" style="padding:24px 24px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.soft}">
              <a href="${home}" target="_blank" style="font-family:${SERIF};font-size:15px;color:${BRAND.ink};text-decoration:none">Librishelf</a><span style="color:#a1a1aa">&nbsp;&middot;&nbsp;</span><a href="${home}" target="_blank" style="color:${BRAND.soft};text-decoration:underline">${homeLabel}</a>
              <p style="margin:10px auto 0;max-width:420px">${escapeHtml(t.footer || lang.footer)}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function build(kind, { name, link, locale, unsubscribe = null, ...extra }) {
  const code = normalizeLocale(locale)
  const lang = TEXTS[code]
  const base = lang[kind]
  const resolve = value => (typeof value === 'function' ? value(extra) : value)
  const t = {
    ...base,
    subject: resolve(base.subject),
    preheader: resolve(base.preheader),
    body: resolve(base.body),
    button: resolve(base.button),
    note: resolve(base.note)
  }
  const items = base.line ? (extra.items || []).map(item => base.line(item)) : []

  const text = [
    t.title,
    '',
    t.greeting(name),
    '',
    t.body,
    ...(items.length ? ['', ...items.map(line => `• ${line}`)] : []),
    '',
    `${t.button}:`,
    link,
    '',
    t.note,
    '',
    unsubscribe ? `${t.unsubscribe} ${t.unsubscribeLink}: ${unsubscribe}` : t.ignore,
    '',
    '— Librishelf',
    siteUrl()
  ].join('\n')

  return { subject: t.subject, text, html: layout({ locale: code, lang, t, name, link, items, unsubscribe }) }
}

export const resetPasswordEmail = params => build('reset', params)
export const verifyEmailEmail = params => build('verify', params)
/** Aviso ao endereço antigo: { name, link, locale, newEmail } (newEmail já mascarado). */
export const emailChangedEmail = params => build('changed', params)
/**
 * Avisos de seguidores juntos num e-mail só:
 * { name, link, locale, items: [{ kind: 'request'|'accepted', actor }], hours, unsubscribe }
 */
export const followDigestEmail = params => build('follow', params)

const REPORT_REASONS = {
  pt: { spoiler: 'Spoiler sem aviso', offensive: 'Ofensiva ou discurso de ódio', spam: 'Spam ou propaganda', other: 'Outro motivo' },
  en: { spoiler: 'Unmarked spoiler', offensive: 'Offensive or hateful', spam: 'Spam or advertising', other: 'Other' }
}

/**
 * Denúncia de resenha para quem modera:
 * { link, locale, author, title, excerpt, reason, note, total, hidden }
 */
export function reviewReportEmail({ author, title, excerpt, reason, note, total, hidden, locale, ...rest }) {
  const code = normalizeLocale(locale)
  const reasonLabel = REPORT_REASONS[code][reason] || reason
  const L = code === 'en'
    ? { book: 'Book', author: 'Author', reason: 'Reason', note: 'Reader note', excerpt: 'Excerpt', count: 'Reports' }
    : { book: 'Livro', author: 'Autor da resenha', reason: 'Motivo', note: 'Observação do leitor', excerpt: 'Trecho', count: 'Denúncias' }
  const items = [
    `${L.book}: ${title}`,
    `${L.author}: ${author}`,
    `${L.reason}: ${reasonLabel}`,
    ...(note ? [`${L.note}: ${note}`] : []),
    `${L.count}: ${total}`,
    `${L.excerpt}: “${excerpt}”`
  ]
  return build('report', { ...rest, locale: code, items, author, title, reasonLabel, total, hidden })
}
const AVATAR_REPORT_REASONS = {
  pt: { offensive: 'Ofensiva ou imprópria', impersonation: 'Se passando por outra pessoa', spam: 'Spam ou propaganda', other: 'Outro motivo' },
  en: { offensive: 'Offensive or inappropriate', impersonation: 'Impersonating someone', spam: 'Spam or advertising', other: 'Other' }
}

/**
 * Denúncia de foto de perfil para quem modera:
 * { link, locale, username, reason, note, total, hidden }
 */
export function avatarReportEmail({ username, reason, note, total, hidden, locale, ...rest }) {
  const code = normalizeLocale(locale)
  const reasonLabel = AVATAR_REPORT_REASONS[code][reason] || reason
  const L = code === 'en'
    ? { user: 'Account', reason: 'Reason', note: 'Reader note', count: 'Reports' }
    : { user: 'Conta', reason: 'Motivo', note: 'Observação do leitor', count: 'Denúncias' }
  const items = [
    `${L.user}: @${username}`,
    `${L.reason}: ${reasonLabel}`,
    ...(note ? [`${L.note}: ${note}`] : []),
    `${L.count}: ${total}`
  ]
  return build('avatarReport', { ...rest, locale: code, items, username, reasonLabel, total, hidden })
}
