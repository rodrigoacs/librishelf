/**
 * Nomes de usuário que ninguém pode pegar: o nome vira a página pública
 * /u/<nome>, então "admin", "suporte" ou "librishelf" se passariam pelo
 * próprio site. Vale no cadastro e na troca de nome; contas antigas com um
 * desses nomes continuam como estão.
 *
 * A comparação ignora maiúsculas, acentos e os separadores . _ - (então
 * "Su.porte" e "s_u_p_o_r_t_e" também ficam de fora). Qualquer nome que comece
 * com "librishelf" também.
 */
const RESERVED = [
  // o próprio site e quem fala por ele
  'librishelf', 'admin', 'administrator', 'administrador', 'adm', 'root', 'sysadmin', 'system', 'sistema',
  'staff', 'equipe', 'team', 'moderator', 'moderador', 'mod', 'oficial', 'official',
  'suporte', 'support', 'ajuda', 'help', 'helpdesk', 'contato', 'contact', 'sac', 'atendimento',
  'security', 'seguranca', 'abuse', 'postmaster', 'hostmaster', 'webmaster', 'noreply', 'naoresponda',
  'mail', 'email', 'newsletter', 'billing', 'financeiro', 'privacy', 'privacidade', 'legal', 'terms', 'termos',
  // rotas e palavras do app
  'api', 'app', 'www', 'u', 'me', 'login', 'logout', 'entrar', 'sair', 'register', 'signup', 'signin',
  'cadastro', 'settings', 'configuracoes', 'conta', 'account', 'profile', 'perfil', 'dashboard', 'painel',
  'books', 'livros', 'library', 'biblioteca', 'authors', 'autores', 'publishers', 'editoras', 'tags',
  'categorias', 'community', 'comunidade', 'feed', 'uploads', 'assets', 'static',
  'forgotpassword', 'resetpassword', 'verifyemail', 'lists', 'listas', 'reviews', 'resenhas', 'retrospectiva',
  // valores que confundem
  'null', 'undefined', 'anonymous', 'anonimo'
]

const normalize = name => String(name)
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/[._-]/g, '')

const RESERVED_SET = new Set(RESERVED.map(normalize))

export function isReservedUsername(name) {
  const key = normalize(name)
  return RESERVED_SET.has(key) || key.startsWith('librishelf')
}
