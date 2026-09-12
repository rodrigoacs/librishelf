import fs from 'fs'
import path from 'path'
import logger from '../utils/logger.js'

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads')

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  logger.info('Pasta de uploads criada', { path: UPLOAD_DIR })
}

export default UPLOAD_DIR