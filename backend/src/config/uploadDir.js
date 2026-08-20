import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads')

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  console.log(`[System] Pasta de uploads criada em: ${UPLOAD_DIR}`)
}

export default UPLOAD_DIR