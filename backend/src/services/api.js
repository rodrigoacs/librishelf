const API_BASE_URL = 'http://srv539972.hstgr.cloud:3000'

export async function fetchTitles() {
  const response = await fetch(`${API_BASE_URL}/library?fields=title`)
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchAuthors(publisherQuery) {
  const url = publisherQuery
    ? `${API_BASE_URL}/author?publishers=${publisherQuery}`
    : `${API_BASE_URL}/author`
  const response = await fetch(url)
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

export async function addNewBook(formData) {
  const response = await fetch(`${API_BASE_URL}/library`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }

  return response.json()
}

export async function updateBookDetails(bookId, updatedBook) {
  const response = await fetch(`${API_BASE_URL}/library/${bookId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatedBook)
  })

  if (!response.ok) {
    throw new Error(`Error updating book details: ${response.statusText}`)
  }

  return await response.json()
}
