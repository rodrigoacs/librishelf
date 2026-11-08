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
    renewal: {
      subject: ({ date }) => `Seu Librishelf Pro vence em ${date}`,
      preheader: ({ founder }) => (founder
        ? 'Renovando até o vencimento, o preço de fundador continua o mesmo.'
        : 'Renove até o vencimento para seguir com os recursos Pro sem interrupção.'),
      title: 'Seu Pro está perto do vencimento',
      greeting: name => `Olá, ${name}.`,
      body: ({ founder }) => (founder
        ? 'O plano anual de fundador não renova sozinho. Renovando até o vencimento, o preço de fundador continua valendo e o novo ano começa quando o atual acabar.'
        : 'O plano anual não renova sozinho. Renovando agora, o novo ano começa quando o atual acabar, sem perder nenhum dia.'),
      line: line => line,
      button: 'Renovar o Pro',
      note: 'Se não renovar, nada é apagado: o que você guardou nos recursos Pro continua visível, só não dá para mudar.',
      ignore: 'Você recebe este aviso uma vez, 7 dias antes do vencimento de um plano que não renova sozinho.'
    },
    trialEnding: {
      subject: ({ date }) => `Seu teste do Pro termina em ${date}`,
      preheader: 'O teste não vira assinatura e não cobra nada.',
      title: 'Seu teste do Pro está acabando',
      greeting: name => `Olá, ${name}.`,
      body: 'O teste grátis não vira assinatura sozinho e não cobra nada. Para continuar com os recursos Pro depois do fim, escolha um plano.',
      line: line => line,
      button: 'Ver os planos',
      note: 'Se não assinar, nada é apagado: o que você guardou nos recursos Pro continua visível, só não dá para mudar.',
      ignore: 'Você recebeu este aviso porque ativou o teste grátis do Pro.'
    },
    trialEnded: {
      subject: 'Seu teste do Pro terminou',
      preheader: 'Seus dados continuam guardados. Assine quando quiser para voltar a editar.',
      title: 'Seu teste do Pro terminou',
      greeting: name => `Olá, ${name}.`,
      body: 'Os recursos Pro agora estão em modo de leitura: o que você criou continua guardado e visível, mas não dá para mudar. Assinando, tudo volta a funcionar como antes.',
      button: 'Ver os planos',
      note: 'Este é o último aviso sobre o teste.',
      ignore: 'Você recebeu este aviso porque ativou o teste grátis do Pro.'
    },
    loanReminder: {
      subject: ({ title }) => `Lembrete: “${title}” está emprestado`,
      preheader: ({ borrower, date }) => `O prazo combinado com ${borrower} é ${date}.`,
      title: 'Lembrete de empréstimo',
      greeting: name => `Olá, ${name}.`,
      body: ({ borrower, title, date }) => `O prazo combinado para ${borrower} devolver “${title}” é ${date}.`,
      button: 'Ver os empréstimos',
      note: 'Quando o livro voltar, marque a devolução no app. Este é o único lembrete deste prazo.',
      ignore: 'Você recebeu este lembrete porque o ligou no empréstimo deste livro.'
    },
    backupReady: {
      subject: 'Seu backup do Librishelf está pronto',
      preheader: ({ date }) => `Cópia da sua biblioteca de ${date}, pronta para baixar.`,
      title: 'Backup pronto',
      greeting: name => `Olá, ${name}.`,
      body: ({ date, books }) => `A cópia automática da sua biblioteca de ${date} está pronta, com ${books === 1 ? '1 livro' : `${books} livros`}. Ela fica guardada na sua conta, em Conta → Backup automático.`,
      button: 'Baixar o backup',
      note: ({ keep }) => `Guardamos os ${keep} backups mais recentes; os mais antigos saem sozinhos. O arquivo é o mesmo da exportação em JSON.`,
      ignore: 'Você recebeu este aviso porque ligou o backup automático com aviso por e-mail.'
    },
    paid: {
      subject: 'Pagamento confirmado no Librishelf',
      preheader: ({ planLabel, amount }) => `Pro ${planLabel.toLowerCase()} · ${amount}`,
      title: 'Pagamento confirmado',
      greeting: name => `Olá, ${name}.`,
      body: ({ lifetime, monthly }) => (lifetime
        ? 'Seu Librishelf Pro vitalício está ativo. Ele vale enquanto o serviço existir.'
        : monthly
          ? 'A cobrança do mês foi aprovada e o seu Pro foi estendido.'
          : 'Seu Librishelf Pro está ativo. Obrigado por apoiar o projeto.'),
      line: line => line,
      button: 'Ver minha conta',
      note: 'O plano e o histórico de cobranças ficam em Conta.',
      ignore: 'Você recebeu este e-mail porque fez um pagamento no Librishelf. Os dados do cartão ficam só com o Mercado Pago.'
    },
    withdrawn: {
      subject: 'Desistência confirmada no Librishelf',
      preheader: ({ amount }) => `Estorno de ${amount} pedido ao Mercado Pago`,
      title: 'Desistência confirmada',
      greeting: name => `Olá, ${name}.`,
      body: 'Recebemos sua desistência e já pedimos ao Mercado Pago o estorno do valor integral. O Pro desta compra foi encerrado e seus dados continuam na conta.',
      line: line => line,
      button: 'Ver minha conta',
      note: 'No cartão, o estorno aparece na fatura conforme o prazo do emissor. No Pix, o valor volta para a conta de onde saiu.',
      ignore: 'Você recebeu este e-mail porque desistiu de uma compra no Librishelf. Se não foi você, troque a senha e escreva para contato@librishelf.com.'
    },
    declined: {
      subject: 'Pagamento recusado no Librishelf',
      preheader: ({ renewal }) => (renewal
        ? 'A cobrança do mensal não passou. Seu Pro continua ativo por enquanto.'
        : 'Nada foi cobrado. Dá para tentar de novo.'),
      title: 'Pagamento recusado',
      greeting: name => `Olá, ${name}.`,
      body: ({ renewal, monthly }) => (renewal
        ? 'A cobrança do mês da sua assinatura foi recusada. O Mercado Pago tenta de novo nos próximos dias; enquanto isso, seu Pro continua ativo até a data abaixo.'
        : `O pagamento não foi aprovado e nada foi cobrado. Isso costuma acontecer por limite, dados do cartão ou recusa do banco. Dá para tentar de novo com outro cartão${monthly ? '' : ' ou com Pix'}.`),
      line: line => line,
      button: ({ renewal }) => (renewal ? 'Ver minha conta' : 'Tentar de novo'),
      note: ({ renewal }) => (renewal
        ? 'Se nenhuma tentativa passar, o Pro vale até a data acima e nada é apagado.'
        : 'O Librishelf não recebe os dados do cartão: eles ficam só com o Mercado Pago.'),
      ignore: 'Você recebeu este e-mail porque tentou fazer um pagamento no Librishelf.'
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
    renewal: {
      subject: ({ date }) => `Your Librishelf Pro ends on ${date}`,
      preheader: ({ founder }) => (founder
        ? 'Renew before it ends and the founder price stays the same.'
        : 'Renew before it ends to keep the Pro features without a break.'),
      title: 'Your Pro is about to end',
      greeting: name => `Hi, ${name}.`,
      body: ({ founder }) => (founder
        ? 'The founder annual plan does not renew on its own. Renew before it ends to keep the founder price; the new year starts when the current one ends.'
        : 'The annual plan does not renew on its own. Renew now and the new year starts when the current one ends, so you lose no days.'),
      line: line => line,
      button: 'Renew Pro',
      note: 'If you do not renew, nothing is deleted: what you saved in the Pro features stays visible, it just cannot be changed.',
      ignore: 'You get this notice once, 7 days before a plan that does not renew on its own ends.'
    },
    trialEnding: {
      subject: ({ date }) => `Your Pro trial ends on ${date}`,
      preheader: 'The trial does not turn into a subscription and charges nothing.',
      title: 'Your Pro trial is ending',
      greeting: name => `Hi, ${name}.`,
      body: 'The free trial does not turn into a subscription and charges nothing. To keep the Pro features after it ends, choose a plan.',
      line: line => line,
      button: 'See the plans',
      note: 'If you do not subscribe, nothing is deleted: what you saved in the Pro features stays visible, it just cannot be changed.',
      ignore: 'You got this notice because you started the free Pro trial.'
    },
    trialEnded: {
      subject: 'Your Pro trial has ended',
      preheader: 'Your data is still saved. Subscribe whenever you want to edit it again.',
      title: 'Your Pro trial has ended',
      greeting: name => `Hi, ${name}.`,
      body: 'The Pro features are now read-only: what you created is still saved and visible, but cannot be changed. Subscribe and everything works as before.',
      button: 'See the plans',
      note: 'This is the last notice about the trial.',
      ignore: 'You got this notice because you started the free Pro trial.'
    },
    loanReminder: {
      subject: ({ title }) => `Reminder: “${title}” is on loan`,
      preheader: ({ borrower, date }) => `The date you agreed on with ${borrower} is ${date}.`,
      title: 'Loan reminder',
      greeting: name => `Hi, ${name}.`,
      body: ({ borrower, title, date }) => `The date you agreed on for ${borrower} to return “${title}” is ${date}.`,
      button: 'See your loans',
      note: 'When the book comes back, mark it as returned in the app. This is the only reminder for this date.',
      ignore: 'You got this reminder because you turned it on for this loan.'
    },
    backupReady: {
      subject: 'Your Librishelf backup is ready',
      preheader: ({ date }) => `A copy of your library from ${date}, ready to download.`,
      title: 'Backup ready',
      greeting: name => `Hi, ${name}.`,
      body: ({ date, books }) => `The automatic copy of your library from ${date} is ready, with ${books === 1 ? '1 book' : `${books} books`}. It is kept in your account, under Account → Automatic backup.`,
      button: 'Download the backup',
      note: ({ keep }) => `We keep the ${keep} most recent backups; older ones are removed on their own. The file is the same as the JSON export.`,
      ignore: 'You got this notice because you turned on automatic backup with email notices.'
    },
    paid: {
      subject: 'Payment confirmed on Librishelf',
      preheader: ({ planLabel, amount }) => `Pro ${planLabel.toLowerCase()} · ${amount}`,
      title: 'Payment confirmed',
      greeting: name => `Hi, ${name}.`,
      body: ({ lifetime, monthly }) => (lifetime
        ? 'Your lifetime Librishelf Pro is active. It lasts for as long as the service exists.'
        : monthly
          ? 'This month’s charge was approved and your Pro was extended.'
          : 'Your Librishelf Pro is active. Thank you for supporting the project.'),
      line: line => line,
      button: 'Open my account',
      note: 'Your plan and billing history are in Account.',
      ignore: 'You got this email because you made a payment on Librishelf. Card details stay with Mercado Pago only.'
    },
    withdrawn: {
      subject: 'Withdrawal confirmed on Librishelf',
      preheader: ({ amount }) => `Refund of ${amount} requested from Mercado Pago`,
      title: 'Withdrawal confirmed',
      greeting: name => `Hi, ${name}.`,
      body: 'We received your withdrawal and already asked Mercado Pago to refund the full amount. The Pro from this purchase has ended and your data stays in your account.',
      line: line => line,
      button: 'Open my account',
      note: 'On cards, the refund shows on your statement within the issuer’s time frame. With Pix, the money goes back to the account it came from.',
      ignore: 'You got this email because you withdrew from a purchase on Librishelf. If it was not you, change your password and write to contato@librishelf.com.'
    },
    declined: {
      subject: 'Payment declined on Librishelf',
      preheader: ({ renewal }) => (renewal
        ? 'The monthly charge did not go through. Your Pro is still active for now.'
        : 'Nothing was charged. You can try again.'),
      title: 'Payment declined',
      greeting: name => `Hi, ${name}.`,
      body: ({ renewal, monthly }) => (renewal
        ? 'This month’s subscription charge was declined. Mercado Pago will try again over the next few days; meanwhile your Pro stays active until the date below.'
        : `The payment was not approved and nothing was charged. This usually happens because of the card limit, card details or a bank refusal. You can try again with another card${monthly ? '' : ' or with Pix'}.`),
      line: line => line,
      button: ({ renewal }) => (renewal ? 'Open my account' : 'Try again'),
      note: ({ renewal }) => (renewal
        ? 'If no attempt goes through, Pro lasts until the date above and nothing is deleted.'
        : 'Librishelf never receives your card details: they stay with Mercado Pago only.'),
      ignore: 'You got this email because you tried to make a payment on Librishelf.'
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

// ------------------------------------------------------------------ cobrança

const PLAN_LABELS = {
  pt: { monthly: 'Mensal', annual: 'Anual', founder_annual: 'Anual de fundador', founder_lifetime: 'Vitalício de fundador', vanguarda: 'Vanguarda', trial: 'Teste grátis' },
  en: { monthly: 'Monthly', annual: 'Annual', founder_annual: 'Founder annual', founder_lifetime: 'Founder lifetime', vanguarda: 'Vanguarda', trial: 'Free trial' }
}

const BILLING_LABELS = {
  pt: { plan: 'Plano', endsAt: 'Vence em', renewPrice: 'Valor para renovar', amount: 'Valor', method: 'Forma de pagamento', validUntil: 'Pro válido até', duration: 'Duração', lifetime: 'Vitalício', activeUntil: 'Pro ativo até', trialEnds: 'Termina em', pix: 'Pix', card: 'Cartão' },
  en: { plan: 'Plan', endsAt: 'Ends on', renewPrice: 'Renewal price', amount: 'Amount', method: 'Payment method', validUntil: 'Pro valid until', duration: 'Duration', lifetime: 'Lifetime', activeUntil: 'Pro active until', trialEnds: 'Ends on', pix: 'Pix', card: 'Card' }
}

/** Datas no fuso do app (APP_TIME_ZONE, padrão America/Sao_Paulo): "9 de novembro de 2026" */
export function formatDate(date, locale) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: process.env.APP_TIME_ZONE?.trim() || 'America/Sao_Paulo'
  }).format(new Date(date))
}

export function formatMoney(cents, locale, currency = 'BRL') {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR', { style: 'currency', currency }).format(cents / 100)
}

const planLabel = (code, plan) => PLAN_LABELS[code][plan] || plan

/** Lembrete de renovação: { name, link, locale, plan, endsAt, amountCents } */
export function renewalReminderEmail({ plan, endsAt, amountCents, locale, ...rest }) {
  const code = normalizeLocale(locale)
  const L = BILLING_LABELS[code]
  const date = formatDate(endsAt, code)
  const items = [
    `${L.plan}: ${planLabel(code, plan)}`,
    `${L.endsAt}: ${date}`,
    ...(amountCents != null ? [`${L.renewPrice}: ${formatMoney(amountCents, code)}`] : [])
  ]
  return build('renewal', { ...rest, locale: code, items, date, founder: plan === 'founder_annual' })
}

/** Aviso antes do fim do teste: { name, link, locale, endsAt } */
export function trialEndingEmail({ endsAt, locale, ...rest }) {
  const code = normalizeLocale(locale)
  const date = formatDate(endsAt, code)
  return build('trialEnding', { ...rest, locale: code, items: [`${BILLING_LABELS[code].trialEnds}: ${date}`], date })
}

/** Fim do teste: { name, link, locale } */
export const trialEndedEmail = params => build('trialEnded', params)

/** Backup pronto: { name, link, locale, books, createdAt, keep } */
export function backupReadyEmail({ createdAt, locale, ...rest }) {
  const code = normalizeLocale(locale)
  return build('backupReady', { ...rest, locale: code, date: formatDate(createdAt, code) })
}

/** Lembrete de empréstimo: { name, link, locale, title, borrower, dueOn (AAAA-MM-DD) } */
export function loanReminderEmail({ dueOn, locale, ...rest }) {
  const code = normalizeLocale(locale)
  return build('loanReminder', { ...rest, locale: code, date: formatDate(`${dueOn}T12:00:00Z`, code) })
}

/** Pagamento confirmado: { name, link, locale, plan, amountCents, currency, method, endsAt } (endsAt nulo = vitalício) */
export function paymentConfirmedEmail({ plan, amountCents, currency = 'BRL', method, endsAt, locale, ...rest }) {
  const code = normalizeLocale(locale)
  const L = BILLING_LABELS[code]
  const amount = formatMoney(amountCents, code, currency)
  const lifetime = !endsAt
  const items = [
    `${L.plan}: ${planLabel(code, plan)}`,
    `${L.amount}: ${amount}`,
    ...(method ? [`${L.method}: ${L[method] || method}`] : []),
    lifetime ? `${L.duration}: ${L.lifetime}` : `${L.validUntil}: ${formatDate(endsAt, code)}`
  ]
  return build('paid', { ...rest, locale: code, items, amount, planLabel: planLabel(code, plan), lifetime, monthly: plan === 'monthly' })
}

/** Desistência da compra (pacote 36b): { name, link, locale, plan, amountCents, currency, method } */
export function withdrawalConfirmedEmail({ plan, amountCents, currency = 'BRL', method, locale, ...rest }) {
  const code = normalizeLocale(locale)
  const L = BILLING_LABELS[code]
  const amount = formatMoney(amountCents, code, currency)
  const items = [
    `${L.plan}: ${planLabel(code, plan)}`,
    `${L.amount}: ${amount}`,
    ...(method ? [`${L.method}: ${L[method] || method}`] : [])
  ]
  return build('withdrawn', { ...rest, locale: code, items, amount })
}

/**
 * Pagamento recusado: { name, link, locale, plan, amountCents, currency, monthly, renewal, activeUntil }
 * renewal: cobrança de um mês seguinte do mensal, com o Pro ainda ativo até activeUntil.
 */
export function paymentDeclinedEmail({ plan, amountCents, currency = 'BRL', monthly = false, renewal = false, activeUntil = null, locale, ...rest }) {
  const code = normalizeLocale(locale)
  const L = BILLING_LABELS[code]
  const items = [
    `${L.plan}: ${planLabel(code, plan)}`,
    `${L.amount}: ${formatMoney(amountCents, code, currency)}`,
    ...(renewal && activeUntil ? [`${L.activeUntil}: ${formatDate(activeUntil, code)}`] : [])
  ]
  return build('declined', { ...rest, locale: code, items, monthly, renewal })
}
