/**
 * Popula um banco LOCAL de teste com muitos dados fictícios: leitores, livros
 * (com edições diferentes da mesma obra), autores, editoras, tags, leituras,
 * notas, capas geradas, configurações de privacidade, seguidores e pedidos.
 *
 *   npm run db:seed                         (lê src/.env.local)
 *   npm run db:seed -- --reset              apaga tudo antes (só banco local)
 *   npm run db:seed -- --users=80 --books=120 --works=900 --seed=7 --no-covers
 *
 * Opções
 *   --users=N     leitores além das contas fixas (padrão 40)
 *   --books=N     média de livros por leitor (padrão 80; varia de ~5 a ~4×)
 *   --works=N     tamanho do catálogo de obras compartilhado (padrão 600)
 *   --seed=N      mesma semente → mesmos dados (padrão 42)
 *   --no-covers   não gera capas (bem mais rápido)
 *   --reset       TRUNCATE nas tabelas do librishelf e apaga as capas antes
 *   --allow-host=HOST  permite um host que não seja localhost (ex.: nome do
 *                      container do Postgres local). Nunca use com produção.
 *
 * Todas as contas usam a senha "senha12345". Contas fixas:
 *   demo     pública, na comunidade, aceita seguidores; tem pedidos pendentes
 *   privado  tudo desligado
 *   vazio    sem livros
 *   pendente e-mail ainda não confirmado (vê o aviso e os limites)
 *
 * Segurança: recusa NODE_ENV=production, host remoto (sem --allow-host) e
 * banco que já tenha usuários (sem --reset).
 */
import fs from 'fs/promises'
import path from 'path'
import bcrypt from 'bcrypt'
import sharp from 'sharp'
import { db } from '../database/connection.js'
import { pendingMigrations } from '../database/migrate.js'
import UPLOAD_DIR from '../config/uploadDir.js'
import { isbn13CheckDigit, normalizeIsbn13 } from '../utils/isbn.js'
import logger from '../utils/logger.js'

// ---------------------------------------------------------------------------
// Argumentos e travas de segurança
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const flag = name => args.includes(`--${name}`)
const option = (name, fallback) => {
  const found = args.find(arg => arg.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3) : fallback
}
const intOption = (name, fallback, min, max) => {
  const value = Number.parseInt(option(name, fallback), 10)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`--${name} precisa ser um inteiro entre ${min} e ${max}.`)
  }
  return value
}

const CONFIG = {
  users: intOption('users', 40, 0, 2000),
  books: intOption('books', 80, 1, 2000),
  works: intOption('works', 600, 20, 20000),
  seed: intOption('seed', 42, 0, 2 ** 31),
  covers: !flag('no-covers'),
  reset: flag('reset'),
  allowHost: option('allow-host', '')
}

const PASSWORD = 'senha12345'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', ''])

function refuse(message) {
  logger.error(`Seed recusado: ${message}`)
  process.exit(1)
}

async function checkSafety() {
  const host = (process.env.DB_HOST || '').trim()

  if (process.env.NODE_ENV === 'production') refuse('NODE_ENV=production.')
  if (!LOCAL_HOSTS.has(host) && host !== CONFIG.allowHost) {
    refuse(`DB_HOST="${host}" não é local. Se for um Postgres local em container, use --allow-host=${host}.`)
  }

  const pending = await pendingMigrations()
  if (pending.length) refuse(`banco sem as migrations: ${pending.join(', ')}. Rode "npm run db:migrate:local" antes.`)

  const { rows: [{ users }] } = await db.query('SELECT count(*)::int AS users FROM librishelf.users')
  if (users > 0 && !CONFIG.reset) {
    refuse(`o banco "${process.env.DB_NAME}" já tem ${users} usuário(s). Use --reset para apagar tudo e popular de novo.`)
  }
}

// ---------------------------------------------------------------------------
// Aleatório reprodutível
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = mulberry32(CONFIG.seed)
const chance = p => random() < p
const int = (min, max) => min + Math.floor(random() * (max - min + 1))
const pick = list => list[Math.floor(random() * list.length)]
const pickSome = (list, count) => {
  const copy = [...list]
  const result = []
  while (result.length < count && copy.length) result.push(copy.splice(Math.floor(random() * copy.length), 1)[0])
  return result
}
// Distribuição com cauda longa (poucos leitores com muitos livros).
const skewed = (mean, min, max) => Math.max(min, Math.min(max, Math.round(-Math.log(1 - random()) * mean)))

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()
const iso = time => new Date(time).toISOString().slice(0, 10)
const between = (start, end) => start + random() * Math.max(0, end - start)

// ---------------------------------------------------------------------------
// Vocabulário (tudo fictício)
// ---------------------------------------------------------------------------

const FIRST_NAMES = ['Ana', 'Beatriz', 'Carla', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Júlia',
  'Larissa', 'Mariana', 'Natália', 'Olívia', 'Paula', 'Renata', 'Sofia', 'Tatiana', 'Valéria', 'Yasmin',
  'André', 'Bruno', 'Caio', 'Diego', 'Eduardo', 'Felipe', 'Gustavo', 'Henrique', 'Igor', 'João',
  'Leonardo', 'Marcelo', 'Nicolas', 'Otávio', 'Pedro', 'Rafael', 'Samuel', 'Thiago', 'Vinícius', 'Wagner']
const LAST_NAMES = ['Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferraz', 'Gomes', 'Henriques', 'Igarashi', 'Junqueira',
  'Lacerda', 'Macedo', 'Nogueira', 'Oliveira', 'Pacheco', 'Queiroz', 'Rezende', 'Siqueira', 'Teixeira', 'Uchoa',
  'Vasconcelos', 'Werneck', 'Xavier', 'Yamada', 'Zanetti', 'Moreau', 'Lindqvist', 'Okafor', 'Kowalski', 'Haddad']
const PEN_FIRST = ['Aurélio', 'Celeste', 'Dora', 'Elias', 'Flora', 'Iris', 'Jonas', 'Lívia', 'Mateus', 'Nina',
  'Orlando', 'Píer', 'Rosa', 'Silas', 'Teodora', 'Ulisses', 'Vera', 'Zeca', 'Mira', 'Heitor', 'Clarice', 'Bento']
const PEN_LAST = ['Arantes', 'Bellini', 'Castelo', 'Drummond', 'Espinosa', 'Fontana', 'Galvão', 'Holanda', 'Ilha', 'Jardim',
  'Lobato', 'Marinho', 'Neves', 'Orsini', 'Prado', 'Quintana', 'Ramos', 'Sabino', 'Torres', 'Valadares', 'Weiss', 'Zimmer']

const PUBLISHERS = ['Editora Aurora', 'Casa do Vento', 'Livros Farol', 'Edições Quintal', 'Selo Andorinha', 'Editora Ponte',
  'Grafia Nova', 'Edições Maré', 'Biblioteca Azul', 'Editora Ladrilho', 'Papel & Tinta', 'Edições Lume',
  'Selo Coruja', 'Editora Cais', 'Arquipélago Livros', 'Editora Trama', 'Edições Sertão', 'Moinho Editorial']

const GENRES = {
  'Fantasia': ['O Reino de {place}', 'A Espada de {name}', 'Crônicas de {place}', 'O Dragão {adj}', 'A Coroa {adj}'],
  'Ficção científica': ['Órbita {adj}', 'Os Últimos de {place}', 'Protocolo {name}', 'A Estação {adj}', 'Sinal de {place}'],
  'Romance': ['Cartas para {name}', 'O Verão em {place}', 'Um Amor {adj}', 'A Casa da Rua {name}', 'Depois de {name}'],
  'Policial': ['O Caso {adj}', 'Morte em {place}', 'A Testemunha {adj}', 'O Último Álibi', 'Sombras de {place}'],
  'Terror': ['A Casa {adj}', 'O Poço de {place}', 'Noite em {place}', 'O Que {name} Viu', 'Vozes {adj}'],
  'História': ['{place}: Uma História', 'O Século {adj}', 'Os Arquivos de {place}', 'A Queda de {place}', 'Memórias de {name}'],
  'Biografia': ['{name}: Uma Vida', 'O Homem de {place}', 'A Mulher {adj}', 'Diário de {name}', 'Retrato de {name}'],
  'Filosofia': ['Ensaio sobre o {noun}', 'O Problema do {noun}', 'Pequeno Tratado do {noun}', 'Sobre o {noun} {adj}'],
  'Poesia': ['Poemas de {place}', 'O {noun} {adj}', 'Cantos de {name}', 'Canções do {noun}'],
  'Autoajuda': ['O Poder do {noun}', 'Hábitos {adj}s', 'Menos {noun}, Mais Vida', 'A Arte do {noun}'],
  'Tecnologia': ['Arquitetura {adj}', 'Código {adj}', 'Sistemas Distribuídos na Prática', 'O {noun} dos Dados'],
  'Infantil': ['{name} e o {noun}', 'A Viagem de {name}', 'O Gato {adj}', 'Um Dia em {place}'],
  'Quadrinhos': ['{name} Contra Todos', 'Liga de {place}', 'O Vigia {adj}', 'Heróis de {place}']
}
const EXTRA_TAGS = ['Clássico', 'Nacional', 'Traduzido', 'Favoritos', 'Emprestado', 'Releitura', 'Clube do livro', 'Presente',
  'Distopia', 'Jovem adulto', 'Contos', 'Mistério', 'Viagem', 'Guerra', 'Mitologia', 'Humor', 'Drama', 'Ensaios']
const PLACES = ['Vidro', 'Areia', 'Cinzas', 'Ferro', 'Marfim', 'Neblina', 'Âmbar', 'Prata', 'Pedra Alta', 'Vale Escuro',
  'Lua Nova', 'Rio Fundo', 'Serra Azul', 'Porto Velho', 'Ilha Clara', 'Monte Frio', 'Campo Largo', 'Mar Morto']
const ADJECTIVES = ['Perdido', 'Silencioso', 'Eterno', 'Invisível', 'Esquecido', 'Partido', 'Selvagem', 'Distante',
  'Profundo', 'Antigo', 'Secreto', 'Imperfeito', 'Dourado', 'Vermelho', 'Último', 'Inquieto']
const NOUNS = ['Tempo', 'Silêncio', 'Abismo', 'Destino', 'Esquecimento', 'Labirinto', 'Espelho', 'Vazio', 'Inverno', 'Acaso']

const PALETTE = ['#1e3a5f', '#5b2a86', '#8c1c13', '#1b4332', '#7f5539', '#264653', '#6d2e46', '#3d405b', '#9c6644', '#0b525b',
  '#4a4e69', '#283618', '#5e548e', '#9d0208', '#14213d', '#3a5a40']

// ---------------------------------------------------------------------------
// Catálogo de obras e edições
// ---------------------------------------------------------------------------

function makeAuthorPool(size) {
  const names = new Set()
  while (names.size < size) {
    const roll = random()
    if (roll < 0.08) names.add(`${pick(PEN_LAST)}, ${pick(PEN_FIRST)}`)                      // "Sobrenome, Nome"
    else if (roll < 0.15) names.add(`${pick(PEN_FIRST)} ${pick(PEN_FIRST).charAt(0)}. ${pick(PEN_LAST)}`)
    else names.add(`${pick(PEN_FIRST)} ${pick(PEN_LAST)}`)
  }
  return [...names]
}

function fillTitle(template) {
  return template
    .replace('{place}', pick(PLACES))
    .replace('{name}', pick(PEN_FIRST))
    .replace('{adj}', pick(ADJECTIVES))
    .replace('{noun}', pick(NOUNS))
}

let isbnCounter = 0
function newIsbn13() {
  // Prefixo 978-65 (Brasil) + sequência: válido e sem repetição.
  isbnCounter += 1
  const first12 = `97865${String(1000000 + isbnCounter * 7919 % 9000000).padStart(7, '0')}`
  return first12 + isbn13CheckDigit(first12)
}

function isbn10From13(isbn13) {
  const core = isbn13.slice(3, 12)
  const sum = [...core].reduce((acc, digit, i) => acc + Number(digit) * (10 - i), 0)
  const check = (11 - (sum % 11)) % 11
  return core + (check === 10 ? 'X' : String(check))
}

function buildCatalog(count) {
  const authors = makeAuthorPool(Math.max(60, Math.round(count / 3)))
  const genreNames = Object.keys(GENRES)
  const titles = new Set()
  const works = []

  for (let i = 0; i < count; i++) {
    const genre = pick(genreNames)
    let title = fillTitle(pick(GENRES[genre]))
    if (chance(0.15)) title += `: ${pick(['Livro Um', 'Parte II', 'Volume 3', 'Uma Novela', 'Edição Definitiva'])}`
    while (titles.has(title)) title = `${title} ${pick(['II', 'III', 'Revisitado', 'e Outras Histórias'])}`
    titles.add(title)

    const authorCount = chance(0.85) ? 1 : chance(0.8) ? 2 : 3
    const pubYear = int(1880, 2025)
    const work = {
      index: i,
      title,
      authors: pickSome(authors, authorCount),
      tags: [genre, ...pickSome(EXTRA_TAGS, int(0, 2))],
      olWorkKey: chance(0.7) ? `/works/OL${90000000 + i}W` : null,
      editions: [],
      weight: 1 / Math.pow(i + 1, 0.85),
      color: pick(PALETTE)
    }

    const editionCount = chance(0.6) ? 1 : chance(0.7) ? 2 : 3
    for (let e = 0; e < editionCount; e++) {
      const year = Math.min(new Date(NOW).getUTCFullYear(), pubYear + (e === 0 ? 0 : int(1, 40)))
      const pubTime = Math.min(Date.UTC(year, int(0, 11), int(1, 28)), NOW - int(30, 365) * DAY)
      work.editions.push({
        key: `${i}-${e}`,
        isbn13: newIsbn13(),
        olEditionKey: work.olWorkKey ? `/books/OL${80000000 + i * 3 + e}M` : null,
        publisher: pick(PUBLISHERS),
        pubDate: chance(0.2) ? null : iso(pubTime),
        title: e > 0 && chance(0.3) ? `${title} (${pick(['edição de bolso', 'edição comentada', 'nova tradução'])})` : title,
        hasCover: chance(0.85),
        bookIds: []
      })
    }
    works.push(work)
  }

  const totalWeight = works.reduce((sum, w) => sum + w.weight, 0)
  return { works, totalWeight }
}

function pickWork(catalog) {
  let roll = random() * catalog.totalWeight
  for (const work of catalog.works) {
    roll -= work.weight
    if (roll <= 0) return work
  }
  return catalog.works.at(-1)
}

// ---------------------------------------------------------------------------
// Leitores
// ---------------------------------------------------------------------------

function buildUsers(count) {
  const used = new Set(['demo', 'privado', 'vazio', 'pendente'])
  const users = [
    { name: 'demo', isPublic: true, showInCommunity: true, showActivity: true, bookCount: 150, fixed: true },
    { name: 'privado', isPublic: false, showInCommunity: false, showActivity: false, bookCount: 60, fixed: true },
    { name: 'vazio', isPublic: true, showInCommunity: true, showActivity: true, bookCount: 0, fixed: true },
    { name: 'pendente', isPublic: false, showInCommunity: false, showActivity: false, bookCount: 12, fixed: true, unverified: true }
  ]

  while (users.length < count + 4) {
    const first = pick(FIRST_NAMES)
    const last = pick(LAST_NAMES)
    const style = int(0, 3)
    let name = [
      `${first}.${last}`,
      `${first}${last}`,
      `${first}_${int(1, 99)}`,
      `${first.charAt(0)}${last}`
    ][style].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    while (used.has(name)) name += int(0, 9)
    used.add(name)

    const isPublic = chance(0.65)
    users.push({
      name,
      isPublic,
      showInCommunity: isPublic && chance(0.75),
      showActivity: chance(0.55),
      bookCount: skewed(CONFIG.books, 3, CONFIG.books * 4)
    })
  }

  return users.map(user => ({
    ...user,
    // Contas criadas nos últimos 3 anos.
    createdAt: NOW - int(30, 3 * 365) * DAY
  }))
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

async function resetDatabase() {
  logger.warn('Apagando todos os dados do librishelf', { db: process.env.DB_NAME })
  await db.query(`
    TRUNCATE librishelf.follows, librishelf.books_authors_link, librishelf.books_tags_link,
             librishelf.books, librishelf.authors, librishelf.publishers, librishelf.tags,
             librishelf.users RESTART IDENTITY CASCADE
  `)

  const files = await fs.readdir(UPLOAD_DIR).catch(() => [])
  await Promise.all(files
    .filter(file => /^\d+\.(avif|jpg)$/.test(file))
    .map(file => fs.unlink(path.join(UPLOAD_DIR, file)).catch(() => { })))
}

async function insertUsers(users) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  for (const user of users) {
    const { rows: [row] } = await db.query(`
      INSERT INTO librishelf.users (name, email, password_hash, is_public, show_in_community, show_activity, created_at, email_verified_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [user.name, `${user.name}@exemplo.test`, hash, user.isPublic, user.showInCommunity, user.showActivity,
      new Date(user.createdAt), user.unverified ? null : new Date(user.createdAt)])
    user.id = row.id
  }
}

function shelfEntry(work, edition, user, usedIsbns) {
  // Como as pessoas digitam o ISBN de verdade: limpo, com traços, ISBN-10,
  // sem ISBN ou com um dígito errado.
  let isbn = null
  const roll = random()
  if (roll < 0.5) isbn = edition.isbn13
  else if (roll < 0.7) isbn = `${edition.isbn13.slice(0, 3)}-${edition.isbn13.slice(3, 5)}-${edition.isbn13.slice(5, 9)}-${edition.isbn13.slice(9, 12)}-${edition.isbn13.slice(12)}`
  else if (roll < 0.82) isbn = isbn10From13(edition.isbn13)
  else if (roll < 0.96) isbn = null
  else isbn = edition.isbn13.slice(0, 12) + ((Number(edition.isbn13[12]) + int(1, 8)) % 10) // inválido

  if (isbn && usedIsbns.has(isbn)) isbn = null
  if (isbn) usedIsbns.add(isbn)

  const addedAt = between(user.createdAt, NOW)
  const isRead = chance(0.55)
  const pubTime = edition.pubDate ? Date.parse(edition.pubDate) : Date.UTC(2000, 0, 1)
  const readStart = Math.min(Math.max(pubTime, user.createdAt - 4 * 365 * DAY, Date.UTC(2012, 0, 1)), NOW - DAY)
  const readAt = isRead ? Math.min(between(readStart, NOW), NOW - DAY) : null

  let rating = null
  if (isRead && chance(0.65)) rating = pick([2, 3, 3, 4, 4, 4, 5, 5, 5, 1])
  else if (!isRead && chance(0.04)) rating = pick([3, 4, 5])

  const authors = work.authors.map(name => (chance(0.03) ? name.toLowerCase() : name))
  const tags = chance(0.15) ? [] : [...work.tags, ...(chance(0.1) ? [pick(EXTRA_TAGS)] : [])]

  return {
    title: edition.title,
    pubDate: edition.pubDate,
    authors,
    publisher: chance(0.08) ? null : edition.publisher,
    tags,
    readDate: readAt ? iso(readAt) : null,
    isbn,
    rating,
    // Chave do Open Library só quando o ISBN veio certo (como no enrich).
    olWorkKey: isbn && normalizeIsbn13(isbn) && edition.olEditionKey && chance(0.8) ? work.olWorkKey : null,
    olEditionKey: null,
    addedAt
  }
}

async function insertBooks(users, catalog) {
  let total = 0

  for (const [index, user] of users.entries()) {
    if (user.bookCount === 0) continue

    const chosen = new Map()
    let attempts = 0
    while (chosen.size < Math.min(user.bookCount, catalog.works.length) && attempts++ < user.bookCount * 20) {
      const work = pickWork(catalog)
      if (!chosen.has(work.index)) chosen.set(work.index, work)
    }

    const usedIsbns = new Set()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      for (const work of chosen.values()) {
        const edition = pick(work.editions)
        const entry = shelfEntry(work, edition, user, usedIsbns)
        if (entry.olWorkKey) entry.olEditionKey = edition.olEditionKey

        const { rows: [{ book_id: bookId }] } = await client.query(
          'SELECT librishelf.add_book($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS book_id',
          [entry.title, entry.pubDate, entry.authors, entry.publisher, entry.tags, entry.readDate,
          entry.isbn, user.id, entry.rating, entry.olWorkKey, entry.olEditionKey]
        )

        const addedAt = new Date(entry.addedAt)
        await client.query('UPDATE librishelf.books SET created_at = $1::timestamptz, last_modified = $1::timestamptz WHERE id = $2', [addedAt, bookId])
        edition.bookIds.push({ bookId, work, edition })
        total += 1
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    if ((index + 1) % 10 === 0 || index === users.length - 1) {
      logger.info('Livros gravados', { leitores: `${index + 1}/${users.length}`, livros: total })
    }
  }

  return total
}

/**
 * "Lendo" (até 2 por leitor, começados nos últimos dias) e "Quero ler" (cerca
 * de 1 em 8 dos não lidos), mais uma meta para o ano atual e o anterior.
 */
async function insertReadingStatusAndGoals() {
  await db.query(`
    WITH unread AS (
      SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY id DESC) AS rn
      FROM librishelf.books WHERE read_date IS NULL
    )
    UPDATE librishelf.books b
    SET reading_status = CASE WHEN u.rn <= 2 THEN 'reading' ELSE 'want' END,
        started_at = CASE WHEN u.rn <= 2 THEN (current_date - (u.rn * 9)::int) END
    FROM unread u
    WHERE b.id = u.id AND (u.rn <= 2 OR u.rn % 8 = 0)
  `)
  await db.query(`
    INSERT INTO librishelf.reading_goals (user_id, year, target)
    SELECT u.id, y.year, 12 + (u.id * 7 + y.year) % 19
    FROM librishelf.users u
    CROSS JOIN (VALUES (EXTRACT(YEAR FROM now())::int), (EXTRACT(YEAR FROM now())::int - 1)) AS y(year)
    ON CONFLICT DO NOTHING
  `)
}

async function insertFollows(users) {
  const byName = new Map(users.map(user => [user.name, user]))
  const pairs = new Map()
  const add = (follower, followee, status) => {
    if (!follower || !followee || follower.id === followee.id) return
    pairs.set(`${follower.id}-${followee.id}`, { follower, followee, status })
  }

  const accepting = users.filter(user => user.showActivity)
  for (const followee of accepting) {
    for (const follower of pickSome(users, int(0, 8))) {
      add(follower, followee, chance(0.75) ? 'accepted' : 'pending')
    }
  }

  // Cenário pronto para testar a tela Comunidade com a conta demo.
  const demo = byName.get('demo')
  const others = users.filter(user => !user.fixed)
  for (const user of pickSome(others.filter(u => u.showActivity), 6)) add(demo, user, 'accepted')
  for (const user of pickSome(others.filter(u => u.showActivity), 2)) add(demo, user, 'pending')
  for (const user of pickSome(others, 3)) add(user, demo, 'pending')
  for (const user of pickSome(others, 5)) add(user, demo, 'accepted')

  for (const { follower, followee, status } of pairs.values()) {
    const createdAt = new Date(between(Math.max(follower.createdAt, followee.createdAt), NOW))
    await db.query(`
      INSERT INTO librishelf.follows (follower_id, followee_id, status, created_at, accepted_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (follower_id, followee_id) DO UPDATE SET status = EXCLUDED.status
    `, [follower.id, followee.id, status, createdAt, status === 'accepted' ? createdAt : null])
  }

  return pairs.size
}

// ---------------------------------------------------------------------------
// Capas
// ---------------------------------------------------------------------------

const escapeXml = text => text.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))

function wrap(text, maxChars) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = (line + ' ' + word).trim()
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 5)
}

function coverSvg(title, authors, color) {
  const titleLines = wrap(title, 14)
  const startY = 150 - (titleLines.length - 1) * 22
  const titleText = titleLines
    .map((line, i) => `<text x="178" y="${startY + i * 46}" font-size="38" font-weight="700" text-anchor="middle" fill="#fff">${escapeXml(line)}</text>`)
    .join('')
  const author = escapeXml(authors.join(' & ').slice(0, 40))

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="356" height="500" viewBox="0 0 356 500">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/>
    </linearGradient></defs>
    <rect width="356" height="500" fill="${color}"/>
    <rect width="356" height="500" fill="url(#g)" opacity="0.55"/>
    <rect x="22" y="22" width="312" height="456" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2"/>
    <g font-family="DejaVu Serif, Georgia, serif">${titleText}</g>
    <line x1="128" y1="360" x2="228" y2="360" stroke="#fff" stroke-opacity="0.6" stroke-width="2"/>
    <text x="178" y="410" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" text-anchor="middle" fill="#fff" fill-opacity="0.9">${author}</text>
  </svg>`)
}

async function generateCovers(catalog) {
  const jobs = catalog.works
    .flatMap(work => work.editions)
    .filter(edition => edition.hasCover && edition.bookIds.length > 0)

  let done = 0
  const worker = async () => {
    while (jobs.length) {
      const edition = jobs.shift()
      const [first, ...rest] = edition.bookIds
      // Mesmo formato e nomes do upload real ({id}.avif + {id}.jpg), mas com
      // compressão rápida: o esforço padrão do AVIF levaria vários minutos aqui.
      const image = sharp(coverSvg(edition.title, first.work.authors, first.work.color))
      await Promise.all([
        image.clone().avif({ quality: 60, effort: 0 }).toFile(path.join(UPLOAD_DIR, `${first.bookId}.avif`)),
        image.clone().jpeg({ quality: 80 }).toFile(path.join(UPLOAD_DIR, `${first.bookId}.jpg`))
      ])

      // Mesma edição em outras estantes: mesma capa, sem gerar de novo.
      for (const { bookId } of rest) {
        await Promise.all(['avif', 'jpg'].map(ext =>
          fs.copyFile(path.join(UPLOAD_DIR, `${first.bookId}.${ext}`), path.join(UPLOAD_DIR, `${bookId}.${ext}`))))
      }

      done += 1
      if (done % 100 === 0) logger.info('Capas geradas', { capas: done })
    }
  }

  await Promise.all(Array.from({ length: 4 }, worker))
  return done
}

// ---------------------------------------------------------------------------

async function main() {
  await checkSafety()
  logger.info('Populando banco local', { db: process.env.DB_NAME, host: process.env.DB_HOST || 'localhost', ...CONFIG })

  if (CONFIG.reset) await resetDatabase()

  const startedAt = Date.now()
  const catalog = buildCatalog(CONFIG.works)
  const users = buildUsers(CONFIG.users)

  await insertUsers(users)
  const books = await insertBooks(users, catalog)
  await insertReadingStatusAndGoals()
  const follows = await insertFollows(users)
  const covers = CONFIG.covers ? await generateCovers(catalog) : 0

  const { rows: [summary] } = await db.query(`
    SELECT
      (SELECT count(*)::int FROM librishelf.users) AS leitores,
      (SELECT count(*)::int FROM librishelf.books) AS livros,
      (SELECT count(*)::int FROM librishelf.authors) AS autores,
      (SELECT count(*)::int FROM librishelf.publishers) AS editoras,
      (SELECT count(*)::int FROM librishelf.tags) AS tags,
      (SELECT count(*)::int FROM librishelf.books WHERE read_date IS NOT NULL) AS lidos,
      (SELECT count(*)::int FROM librishelf.books WHERE rating IS NOT NULL) AS com_nota,
      (SELECT count(*)::int FROM librishelf.books WHERE reading_status = 'reading') AS lendo,
      (SELECT count(*)::int FROM librishelf.books WHERE reading_status = 'want') AS quero_ler,
      (SELECT count(*)::int FROM librishelf.books WHERE isbn IS NOT NULL AND btrim(isbn) <> '' AND isbn13 IS NULL) AS isbn_invalido,
      (SELECT count(*)::int FROM librishelf.users WHERE is_public AND show_in_community) AS na_comunidade
  `)

  logger.info('Banco local populado', {
    ...summary,
    livros_gravados: books,
    seguir: follows,
    capas: covers,
    segundos: Math.round((Date.now() - startedAt) / 1000),
    login: `demo / ${PASSWORD} (todas as contas usam a mesma senha)`
  })
}

main()
  .catch(err => {
    logger.error('Seed falhou', { message: err.message, stack: err.stack })
    process.exitCode = 1
  })
  .finally(() => db.end())