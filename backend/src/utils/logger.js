import { existsSync, writeFileSync, appendFileSync, statSync } from 'fs'
import { join } from 'path'

const levels = {
  error: 'ERROR',
}

const logFilePath = join('./app.log')
if (!existsSync(logFilePath)) {
  writeFileSync(logFilePath, '')
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `[${day}/${month}/${year} - ${hours}:${minutes}:${seconds}]`
}

function formatMessage(level, message) {
  const timestamp = formatDate(new Date())
  return `${timestamp} [${level}] ${message}\n`
}

function cleanLog() {
  const fileStats = statSync(logFilePath)
  const fileSizeInBytes = fileStats.size
  const fileSizeInKilobytes = fileSizeInBytes / 1024
  if (fileSizeInKilobytes > 1000) {
    writeFileSync(logFilePath, '')
  }
}

function log(level, message) {
  const formattedMessage = formatMessage(level, message)
  console.log(formattedMessage.trim())
  cleanLog()
  appendFileSync(logFilePath, formattedMessage)
}

export function error(message) { return log(levels.error, message) }
