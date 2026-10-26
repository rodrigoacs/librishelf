import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { recipientDomain } from '../../services/mailService.js'

const MODULE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../services/mailService.js')

// Envia sem SMTP num processo próprio e devolve o que foi para o log.
function logOf(env) {
  const script = `
    const { sendMail } = await import(${JSON.stringify(MODULE)})
    await sendMail({ to: 'Pessoa.Real@exemplo.test', subject: 'Redefinir senha', text: 'Abra https://librishelf.com/reset-password?token=segredo123' })
  `
  const { SMTP_HOST, ...base } = process.env
  // Avisos vão para o stderr; junta os dois
  const { stdout, stderr } = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...base, LOG_FORMAT: 'json', LOG_LEVEL: 'debug', ...env },
    encoding: 'utf8'
  })
  return stdout + stderr
}

describe('log de e-mail (M12)', () => {
  it('recipientDomain guarda só o domínio', () => {
    expect(recipientDomain('Pessoa@Gmail.com')).toBe('gmail.com')
    expect(recipientDomain('sem-arroba')).toBeNull()
  })

  it('produção sem SMTP: aviso sem endereço, assunto nem link', () => {
    const log = logOf({ NODE_ENV: 'production' })
    expect(log).toContain('SMTP não configurado')
    expect(log).toContain('exemplo.test')
    expect(log).not.toContain('Pessoa.Real')
    expect(log).not.toContain('segredo123')
  })

  it('desenvolvimento sem SMTP: o conteúdo continua no log (para copiar o link)', () => {
    expect(logOf({ NODE_ENV: 'development' })).toContain('segredo123')
  })
})
