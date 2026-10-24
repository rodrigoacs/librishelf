import * as dashboardRepository from '../repositories/dashboardRepository.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'

/** Ano do painel (gráfico mensal e meta). Padrão: o ano atual. */
function normalizeYear(value) {
  if (value === undefined || value === null || value === '') return new Date().getFullYear()
  const year = Number(value)
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw httpError("Ano inválido: use um ano com 4 dígitos.", STATUS.BAD_REQUEST, 'YEAR_INVALID')
  }
  return year
}

function normalizeTarget(value) {
  const target = Number(value)
  if (!Number.isInteger(target) || target < 1 || target > 1000) {
    throw httpError('A meta precisa ser um número inteiro de 1 a 1000.', STATUS.BAD_REQUEST, 'GOAL_INVALID')
  }
  return target
}

export async function getStats(userId, year) {
  return await dashboardRepository.getDashboardStats(userId, normalizeYear(year))
}

export async function setGoal(userId, year, target) {
  return await dashboardRepository.upsertGoal(userId, normalizeYear(year), normalizeTarget(target))
}

export async function removeGoal(userId, year) {
  await dashboardRepository.deleteGoal(userId, normalizeYear(year))
}
