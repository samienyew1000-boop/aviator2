import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const STARTING_BALANCE = 5000;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/** @type {Map<string, { userId: string, expiresAt: number }>} */
const sessions = new Map();

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    const admin = createUserRecord('admin', 'admin123', 'admin');
    saveUsers([admin]);
  }
}

function loadUsers() {
  ensureStore();
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  ensureStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

function createUserRecord(username, password, role = 'user') {
  const { salt, hash } = hashPassword(password);
  return {
    id: crypto.randomUUID(),
    username: username.toLowerCase().trim(),
    displayName: username.trim(),
    role,
    balance: STARTING_BALANCE,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    balance: user.balance,
  };
}

function issueToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

export function getUserByToken(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const users = loadUsers();
  return users.find((u) => u.id === session.userId) || null;
}

export function register(username, password) {
  const name = String(username || '').trim();
  const pass = String(password || '');
  if (name.length < 3) return { ok: false, error: 'Username must be at least 3 characters' };
  if (pass.length < 4) return { ok: false, error: 'Password must be at least 4 characters' };

  const users = loadUsers();
  if (users.some((u) => u.username === name.toLowerCase())) {
    return { ok: false, error: 'Username already taken' };
  }

  const user = createUserRecord(name, pass, 'user');
  users.push(user);
  saveUsers(users);
  const token = issueToken(user.id);
  return { ok: true, token, user: publicUser(user) };
}

export function login(username, password) {
  const users = loadUsers();
  const user = users.find((u) => u.username === String(username || '').toLowerCase().trim());
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    return { ok: false, error: 'Invalid username or password' };
  }
  const token = issueToken(user.id);
  return { ok: true, token, user: publicUser(user) };
}

export function logout(token) {
  sessions.delete(token);
}

export function updateBalance(userId, balance) {
  const users = loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  user.balance = Number(Number(balance).toFixed(2));
  saveUsers(users);
  return publicUser(user);
}

export function getUserById(userId) {
  return loadUsers().find((u) => u.id === userId) || null;
}

export function listUsersPublic() {
  return loadUsers().map(publicUser);
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.body?.token;
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = publicUser(user);
  req.token = token;
  next();
}

export function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  });
}

// Ensure default admin exists on import
ensureStore();
