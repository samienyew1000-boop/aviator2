/**
 * In Vite dev, use same-origin `/api` (proxied to backend).
 * In production, set VITE_API_URL or VITE_SOCKET_URL to your backend host.
 */
const API_BASE =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? '' : 'http://localhost:3001');

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3001';

const STORAGE_KEY = 'aviator_auth';

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      'Cannot reach the game server. Start the backend with: npm run dev:backend'
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

export const api = {
  register: (username, password) =>
    request('/api/auth/register', { method: 'POST', body: { username, password } }),
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: (token) => request('/api/auth/me', { token }),
  logout: (token) => request('/api/auth/logout', { method: 'POST', token }),
  adminState: (token) => request('/api/admin/state', { token }),
  startRound: (token) => request('/api/admin/start-round', { method: 'POST', token }),
  setAutoRun: (token, enabled) =>
    request('/api/admin/auto-run', { method: 'POST', token, body: { enabled } }),
  setCrashConfig: (token, config) =>
    request('/api/admin/crash-config', { method: 'POST', token, body: config }),
};

export { API_BASE, SOCKET_URL };
/** @deprecated use SOCKET_URL */
export const API_URL = SOCKET_URL;
