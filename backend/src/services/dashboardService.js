import * as dashboardRepository from '../repositories/dashboardRepository.js'

export async function getStats(userId) {
  return await dashboardRepository.getDashboardStats(userId)
}