const API_BASE_URL = 'http://localhost:3000'

export async function fetchTitles() {
  const response = await fetch(`${API_BASE_URL}/library?fields=title`)
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchAuthors() {
  const response = await fetch(`${API_BASE_URL}/author`)
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchPublishers(authorQuery) {
  const url = authorQuery
    ? `${API_BASE_URL}/publisher?authors=${authorQuery}`
    : `${API_BASE_URL}/publisher`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchBooks(fields) {
  const response = await fetch(`${API_BASE_URL}/library?fields=${fields}`)
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchBookReadState(readState) {
  const response = await fetch(`${API_BASE_URL}/library?readState=${readState}`)
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchBookDetails(bookId) {
  const response = await fetch(`${API_BASE_URL}/library/${bookId}`)
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}
