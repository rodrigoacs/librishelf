import request from 'supertest'
import app from '../../app.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

beforeAll(async () => {
  await clearDatabase()
})

afterAll(async () => {
  await closeDatabase()
})

describe('Auth Endpoints', () => {

  const mockUser = {
    username: 'testuser',
    password: 'password123',
    email: 'test@example.com'
  }

  it('should register a new user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send(mockUser)

    expect(res.statusCode).toEqual(201)
    expect(res.body).toHaveProperty('user')
    expect(res.body.user.name).toBe(mockUser.username)
  })

  it('should not register user with duplicate username', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send(mockUser)

    expect(res.statusCode).toEqual(409)
  })

  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send(mockUser)

    expect(res.statusCode).toEqual(200)
    expect(res.body).toHaveProperty('token')
  })

  it('should reject login with wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        username: mockUser.username,
        password: 'wrongpassword'
      })

    expect(res.statusCode).toEqual(401)
  })

  it('should reject registration with a password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'weakpassuser', password: '1234567', email: 'weakpass@example.com' })

    expect(res.statusCode).toEqual(400)
  })

  it('should reject registration with a password that has no letters', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'onlynumbersuser', password: '12345678', email: 'onlynumbers@example.com' })

    expect(res.statusCode).toEqual(400)
  })

  it('should reject registration with a password that has no numbers', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'onlylettersuser', password: 'abcdefgh', email: 'onlyletters@example.com' })

    expect(res.statusCode).toEqual(400)
  })

  it('should accept registration with a password meeting the minimum policy', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'goodpassuser', password: 'abcdefg1', email: 'goodpass@example.com' })

    expect(res.statusCode).toEqual(201)
  })
})