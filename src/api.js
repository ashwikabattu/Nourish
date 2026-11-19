const TOKEN_KEY = 'nourish.token'

let unauthorizedHandler = null

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // storage unavailable (private mode); the session just won't persist
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

/** Called when the server rejects our token, so the app can return to the sign-in screen. */
export function onUnauthorized(handler) {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const token = getToken()
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    if (res.status === 401 && token) {
      clearToken()
      unauthorizedHandler?.()
    }
    const detail = data.details?.[0]
    throw new Error(detail ? detail.message : data.error || `Request failed (${res.status})`)
  }
  return data
}

async function authenticate(path, email, password) {
  const { token, user } = await request(path, { method: 'POST', body: { email, password } })
  setToken(token)
  return user
}

export const api = {
  register: (email, password) => authenticate('/auth/register', email, password),
  login: (email, password) => authenticate('/auth/login', email, password),
  me: () => request('/auth/me').then((d) => d.user),

  listEntries: (date) => request(`/entries?date=${date}`).then((d) => d.entries),
  createEntry: (entry) => request('/entries', { method: 'POST', body: entry }).then((d) => d.entry),
  deleteEntry: (id) => request(`/entries/${id}`, { method: 'DELETE' }),

  updateGoals: (goals) => request('/goals', { method: 'PUT', body: goals }).then((d) => d.goals),
  summary: (from, to) => request(`/summary?from=${from}&to=${to}`),

  searchFoods: (q) => request(`/foods/search?q=${encodeURIComponent(q)}`).then((d) => d.foods),

  getProfile: () => request('/profile'),
  saveProfile: (profile) => request('/profile', { method: 'PUT', body: profile }),
}
