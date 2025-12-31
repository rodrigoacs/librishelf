import * as tagRepository from '../repositories/tagRepository.js'

export async function getTagsByUserId(userId) {
  return await tagRepository.getTagsByUserId(userId)
}