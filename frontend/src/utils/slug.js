/** "Melhores de 2026!" → "melhores-de-2026" (só enfeite na URL; quem vale é o id). */
export function slugify(text, max = 60) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')
}
