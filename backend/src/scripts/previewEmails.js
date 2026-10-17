/**
 * Gera os e-mails em arquivos HTML para ver no navegador, sem enviar nada.
 *
 *   npm run email:preview            → grava em /tmp/librishelf-emails
 *   npm run email:preview -- ./saida → grava na pasta indicada
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resetPasswordEmail, verifyEmailEmail } from '../services/emailTemplates.js'

const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'librishelf-emails'))
fs.mkdirSync(outDir, { recursive: true })

const base = process.env.APP_URL || 'https://librishelf.com'
const token = 'exemplo_de_token_com_43_caracteres_0123456789'

const emails = {
  'verificar-pt': verifyEmailEmail({ name: 'Rodrigo', link: `${base}/verify-email?token=${token}`, locale: 'pt' }),
  'verificar-en': verifyEmailEmail({ name: 'Rodrigo', link: `${base}/verify-email?token=${token}`, locale: 'en' }),
  'senha-pt': resetPasswordEmail({ name: 'Rodrigo', link: `${base}/reset-password?token=${token}`, locale: 'pt' }),
  'senha-en': resetPasswordEmail({ name: 'Rodrigo', link: `${base}/reset-password?token=${token}`, locale: 'en' })
}

for (const [file, mail] of Object.entries(emails)) {
  fs.writeFileSync(path.join(outDir, `${file}.html`), mail.html)
  fs.writeFileSync(path.join(outDir, `${file}.txt`), `Assunto: ${mail.subject}\n\n${mail.text}\n`)
}

console.log(`E-mails gerados em ${outDir}:`)
for (const file of Object.keys(emails)) console.log(`  ${path.join(outDir, `${file}.html`)}`)