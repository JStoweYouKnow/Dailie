let getter = null;

/** Bound once from AuthProvider so plain modules can attach a Clerk bearer token. */
export function bindSessionToken(fn) {
  getter = typeof fn === "function" ? fn : null;
}

export async function sessionHeaders(extra = {}) {
  const headers = { ...extra };
  if (!getter) return headers;
  try {
    const token = await getter();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch (err) { /* cookie fallback on the route */ }
  return headers;
}

export async function apiFetch(url, options = {}) {
  const headers = await sessionHeaders(options.headers || {});
  return fetch(url, { ...options, headers });
}
