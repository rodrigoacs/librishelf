import { db } from '../../database/connection.js'

/** Testes que não são sobre e-mail: marca a conta como confirmada direto no banco. */
export async function confirmEmail(username) {
  await db.query('UPDATE librishelf.users SET email_verified_at = now() WHERE name = $1', [username])
}
