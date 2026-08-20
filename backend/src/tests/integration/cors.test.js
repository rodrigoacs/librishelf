import request from 'supertest'
import app from '../../app.js'

describe('CORS', () => {
  it('deve permitir requisição sem header Origin (curl, apps mobile, server-to-server)', async () => {
    const res = await request(app).get('/ping')

    expect(res.statusCode).toBe(200)
  })

  it('deve permitir origem presente na whitelist e ecoar o header Access-Control-Allow-Origin', async () => {
    const res = await request(app).get('/ping').set('Origin', 'http://localhost:5173')

    expect(res.statusCode).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('deve bloquear origem fora da whitelist com 403', async () => {
    const res = await request(app).get('/ping').set('Origin', 'https://site-malicioso.com')

    expect(res.statusCode).toBe(403)
    expect(res.body.status).toBe('error')
  })
})