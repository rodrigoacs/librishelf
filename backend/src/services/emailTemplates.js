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
    fallback: "If the button doesn't work, copy and paste this address into your browser:",
    tagline: 'Your personal library, organized.',
    footer: "You're receiving this email because it is registered on Librishelf. This is an automated address: replies are not read."
  }
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

function layout({ locale, lang, t, name, link }) {
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
              <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(t.body)}</p>

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
              <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${BRAND.line};font-size:14px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(t.ignore)}</p>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td align="center" style="padding:24px 24px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.soft}">
              <a href="${home}" target="_blank" style="font-family:${SERIF};font-size:15px;color:${BRAND.ink};text-decoration:none">Librishelf</a><span style="color:#a1a1aa">&nbsp;&middot;&nbsp;</span><a href="${home}" target="_blank" style="color:${BRAND.soft};text-decoration:underline">${homeLabel}</a>
              <p style="margin:10px auto 0;max-width:420px">${escapeHtml(lang.footer)}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function build(kind, { name, link, locale }) {
  const code = normalizeLocale(locale)
  const lang = TEXTS[code]
  const t = lang[kind]

  const text = [
    t.title,
    '',
    t.greeting(name),
    '',
    t.body,
    '',
    `${t.button}:`,
    link,
    '',
    t.note,
    '',
    t.ignore,
    '',
    '— Librishelf',
    siteUrl()
  ].join('\n')

  return { subject: t.subject, text, html: layout({ locale: code, lang, t, name, link }) }
}

export const resetPasswordEmail = params => build('reset', params)
export const verifyEmailEmail = params => build('verify', params)