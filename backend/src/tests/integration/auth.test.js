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
    expect(res.body.user.username).toBe(mockUser.user)
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
})