/** Remembers the selected project per user. Storage may be disabled; the project remains on the server. */

export function savedProject(key: string) {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function rememberProject(key: string, id: string) {
  try {
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  } catch {
    /* Storage may be disabled. The project remains on the server. */
  }
}
