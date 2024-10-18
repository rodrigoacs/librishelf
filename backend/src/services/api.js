const API_BASE_URL = 'https://librishelf.com/api'
// const API_BASE_URL = 'http://localhost:3000'

function getAuthHeader() {
  const token = localStorage.getItem('token')
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

export async function fetchTitles() {
  const response = await fetch(`${API_BASE_URL}/library?fields=title`, {
    headers: {
      ...getAuthHeader(),
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchAuthors(publisherQuery) {
  const url = publisherQuery
    ? `${API_BASE_URL}/author?publishers=${publisherQuery}`
    : `${API_BASE_URL}/author`

  const response = await fetch(url, {
    headers: {
      ...getAuthHeader(),
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchPublishers(authorQuery) {
  const url = authorQuery
    ? `${API_BASE_URL}/publisher?authors=${authorQuery}`
    : `${API_BASE_URL}/publisher`

  const response = await fetch(url, {
    headers: {
      ...getAuthHeader(),
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchBooks(fields) {
  const response = await fetch(`${API_BASE_URL}/library?fields=${fields}`, {
    headers: {
      ...getAuthHeader(),
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchBookReadState(readState) {
  const response = await fetch(`${API_BASE_URL}/library?readState=${readState}`, {
    headers: {
      ...getAuthHeader(),
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function fetchBookDetails(bookId) {
  const response = await fetch(`${API_BASE_URL}/library/${bookId}`, {
    headers: {
      ...getAuthHeader(),
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  return response.json()
}

export async function addNewBook(formData) {
  const response = await fetch(`${API_BASE_URL}/library`, {
    method: 'POST',
    headers: {
      ...getAuthHeader(),
    },
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
      ...getAuthHeader(),
    },
    body: JSON.stringify(updatedBook)
  })

  if (!response.ok) {
    throw new Error(`Error updating book details: ${response.statusText}`)
  }

  return await response.json()
}

export async function loginUser(credentials) {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(credentials)
  })

  if (!response.ok) {
    throw new Error(`Login error: ${response.statusText}`)
  }
  return response.json()
}

export async function registerUser(userData) {
  const response = await fetch(`${API_BASE_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(userData)
  })

  if (!response.ok) {
    throw new Error(`Registration error: ${response.statusText}`)
  }

  return response.json()
}
