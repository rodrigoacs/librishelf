import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { testOutbox } from '../../services/mailService.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const tokens = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
const ISBN = '9780140328721'

async function signUp(name, visibility) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
  await request(app).patch('/auth/me/visibility').set(auth(name)).send(visibility)
}

async function addBook(user, title, isbn) {
  const res = await request(app).post('/library').set(auth(user)).field({ title, authors: 'Roald Dahl', ...(isbn ? { isbn } : {}) })
  return res.body.bookId
}

const putReview = (user, id, body) => request(app).put(`/library/${id}/review`).set(auth(user)).send(body)
const publicBook = (owner, id, viewer) => {
  const req = request(app).get(`/library/public/u/${owner}/book/${id}`)
  return (viewer ? req.set(auth(viewer)) : req).then(res => res.body)
}
const community = (user, id) => request(app).get(`/community/books/${id}`).set(auth(user)).then(res => res.body)
const report = (user, id, body) => request(app).post(`/reviews/${id}/report`).set(auth(user)).send(body)
const waitMail = async () => { for (let i = 0; i < 50 && !testOutbox().length; i++) await new Promise(r => setTimeout(r, 20)) }

const ids = {}

beforeAll(async () => {
  process.env.ADMIN_EMAIL = 'moderacao@example.com'
  await clearDatabase()
  await signUp('ana', { isPublic: true, showInCommunity: true, showActivity: true })
  await signUp('bia', { isPublic: true, showInCommunity: true, showActivity: true })
  for (const name of ['caio', 'davi', 'eva']) await signUp(name, { showActivity: true })
  ids.ana = await addBook('ana', 'Fantastic Mr. Fox', ISBN)
  ids.bia = await addBook('bia', 'Fantastic Mr Fox', ISBN)
  testOutbox().length = 0
})

afterAll(async () => {
  delete process.env.ADMIN_EMAIL
  await closeDatabase()
})

describe('Escrever', () => {
  it('valida texto, tamanho, visibilidade e dono', async () => {
    expect((await putReview('ana', ids.ana, { body: '   ' })).body.code).toBe('REVIEW_EMPTY')
    const long = await putReview('ana', ids.ana, { body: 'x'.repeat(5001) })
    expect(long.body).toMatchObject({ code: 'REVIEW_TOO_LONG', params: { max: 5000 } })
    expect((await putReview('ana', ids.ana, { body: 'ok', visibility: 'todos' })).statusCode).toBe(400)
    expect((await putReview('ana', ids.ana, { body: 'ok', hasSpoiler: 'sim' })).statusCode).toBe(400)
    expect((await putReview('bia', ids.ana, { body: 'ok' })).statusCode).toBe(403)
  })

  it('cria e altera (uma por livro); o dono lê a sua', async () => {
    let res = await putReview('ana', ids.ana, { body: 'Raposa esperta.\nMuito bom.', hasSpoiler: true })
    expect(res.statusCode).toBe(200)
    expect(res.body.review).toMatchObject({ body: 'Raposa esperta.\nMuito bom.', hasSpoiler: true, visibility: 'public', hidden: false, likeCount: 0 })
    res = await putReview('ana', ids.ana, { body: 'Raposa muito esperta.', hasSpoiler: true })
    const own = (await request(app).get(`/library/${ids.ana}/review`).set(auth('ana'))).body.review
    expect(own.body).toBe('Raposa muito esperta.')
    const { rows } = await db.query('SELECT count(*)::int AS n FROM librishelf.reviews')
    expect(rows[0].n).toBe(1)
  })
})

describe('Quem vê', () => {
  it('pública: visitante vê no livro e no perfil; anotação continua privada', async () => {
    const book = await publicBook('ana', ids.ana)
    expect(book.review).toMatchObject({ body: 'Raposa muito esperta.', hasSpoiler: true, author: { username: 'ana' } })
    expect(book.notes).toBeUndefined()
    const profile = (await request(app).get('/library/public/u/ana/profile')).body
    expect(profile.reviews.total).toBe(1)
    expect(profile.reviews.items[0].book.title).toBe('Fantastic Mr. Fox')
  })

  it('comunidade do livro mostra a resenha de quem participa', async () => {
    const data = await community('bia', ids.bia)
    expect(data.reviews.map(r => r.author.username)).toEqual(['ana'])
    // Ana sai da comunidade: pública some da comunidade (continua na biblioteca)
    await request(app).patch('/auth/me/visibility').set(auth('ana')).send({ showInCommunity: false })
    expect((await community('bia', ids.bia)).reviews).toEqual([])
    expect((await publicBook('ana', ids.ana)).review).not.toBeNull()
    await request(app).patch('/auth/me/visibility').set(auth('ana')).send({ showInCommunity: true })
  })

  it('só seguidores: visitante não vê; seguidor aprovado vê', async () => {
    await putReview('ana', ids.ana, { body: 'Só para quem me segue.', visibility: 'followers' })
    expect((await publicBook('ana', ids.ana)).review).toBeNull()
    expect((await publicBook('ana', ids.ana, 'bia')).review).toBeNull()
    expect((await community('bia', ids.bia)).reviews).toEqual([])

    await request(app).post('/social/follow/ana').set(auth('bia'))
    expect((await publicBook('ana', ids.ana, 'bia')).review).toBeNull() // pedido ainda pendente
    await request(app).post('/social/requests/bia/accept').set(auth('ana'))
    expect((await publicBook('ana', ids.ana, 'bia')).review.body).toBe('Só para quem me segue.')
    expect((await community('bia', ids.bia)).reviews).toHaveLength(1)
    await putReview('ana', ids.ana, { body: 'Raposa muito esperta.', hasSpoiler: true, visibility: 'public' })
  })

  it('biblioteca privada: resenha pública não aparece', async () => {
    const caioBook = await addBook('caio', 'Fox', ISBN)
    await putReview('caio', caioBook, { body: 'Privado.' })
    expect((await request(app).get(`/library/public/u/caio/book/${caioBook}`)).statusCode).toBe(404)
    expect((await community('bia', ids.bia)).reviews.map(r => r.author.username)).toEqual(['ana'])
  })
})

describe('Curtir', () => {
  it('curte, conta, descurte; não curte a própria', async () => {
    const reviewId = (await publicBook('ana', ids.ana)).review.id
    let res = await request(app).post(`/reviews/${reviewId}/like`).set(auth('bia'))
    expect(res.body).toEqual({ liked: true, likeCount: 1 })
    await request(app).post(`/reviews/${reviewId}/like`).set(auth('bia'))
    expect((await publicBook('ana', ids.ana, 'bia')).review).toMatchObject({ likeCount: 1, likedByMe: true })
    expect((await publicBook('ana', ids.ana)).review).toMatchObject({ likeCount: 1, likedByMe: false })
    res = await request(app).delete(`/reviews/${reviewId}/like`).set(auth('bia'))
    expect(res.body).toEqual({ liked: false, likeCount: 0 })
    expect((await request(app).post(`/reviews/${reviewId}/like`).set(auth('ana'))).body.code).toBe('REVIEW_OWN')
    expect((await request(app).post(`/reviews/${reviewId}/like`)).statusCode).toBe(401)
  })

  it('bloqueio esconde e impede curtir', async () => {
    const reviewId = (await publicBook('ana', ids.ana)).review.id
    await request(app).post('/social/blocks/eva').set(auth('ana'))
    expect((await publicBook('ana', ids.ana, 'eva')).review).toBeNull()
    expect((await request(app).post(`/reviews/${reviewId}/like`).set(auth('eva'))).statusCode).toBe(404)
    expect((await report('eva', reviewId, { reason: 'spam' })).statusCode).toBe(404)
  })
})

describe('Denunciar e moderar', () => {
  let reviewId
  let moderationToken

  beforeAll(async () => {
    reviewId = (await publicBook('ana', ids.ana)).review.id
  })

  it('valida o motivo; denúncia vai por e-mail com link de moderação; uma por pessoa', async () => {
    expect((await report('davi', reviewId, { reason: 'chato' })).statusCode).toBe(400)
    expect((await report('ana', reviewId, { reason: 'spam' })).body.code).toBe('REVIEW_OWN')

    const res = await report('davi', reviewId, { reason: 'spoiler', note: 'Conta o final' })
    expect(res.body).toEqual({ reported: true, duplicate: false })
    await waitMail()
    const mail = testOutbox().find(m => m.to === 'moderacao@example.com')
    expect(mail.subject).toBe('Resenha denunciada: Fantastic Mr. Fox')
    expect(mail.text).toContain('Motivo: Spoiler sem aviso')
    expect(mail.text).toContain('Conta o final')
    moderationToken = decodeURIComponent(mail.text.match(/\/moderation\?token=(\S+)/)[1])

    expect((await report('davi', reviewId, { reason: 'spam' })).body.duplicate).toBe(true)
  })

  it('três pessoas denunciando: some até a revisão; o dono vê "oculta"', async () => {
    await report('caio', reviewId, { reason: 'offensive' })
    await report('bia', reviewId, { reason: 'other' })
    expect((await publicBook('ana', ids.ana)).review).toBeNull()
    expect((await community('bia', ids.bia)).reviews).toEqual([])
    const own = (await request(app).get(`/library/${ids.ana}/review`).set(auth('ana'))).body.review
    expect(own.hidden).toBe(true)
    await new Promise(r => setTimeout(r, 100))
    expect(testOutbox().some(m => m.subject.startsWith('[Oculta]'))).toBe(true)
  })

  it('link de moderação: vê denúncias, mantém (reexibe e zera a conta) ou oculta', async () => {
    expect((await request(app).get('/moderation/review?token=1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).body.code).toBe('MODERATION_TOKEN_INVALID')
    const view = (await request(app).get(`/moderation/review?token=${encodeURIComponent(moderationToken)}`)).body
    expect(view.review).toMatchObject({ id: reviewId, hidden: true, hiddenReason: 'reports' })
    expect(view.reports).toHaveLength(3)

    const kept = (await request(app).post(`/moderation/review/show?token=${encodeURIComponent(moderationToken)}`)).body
    expect(kept.review.hidden).toBe(false)
    expect((await publicBook('ana', ids.ana)).review).not.toBeNull()

    const hidden = (await request(app).post(`/moderation/review/hide?token=${encodeURIComponent(moderationToken)}`)).body
    expect(hidden.review).toMatchObject({ hidden: true, hiddenReason: 'moderation' })
    expect((await publicBook('ana', ids.ana)).review).toBeNull()
  })

  it('o dono apaga a resenha', async () => {
    expect((await request(app).delete(`/library/${ids.ana}/review`).set(auth('ana'))).statusCode).toBe(200)
    expect((await request(app).get(`/library/${ids.ana}/review`).set(auth('ana'))).body.review).toBeNull()
  })
})
