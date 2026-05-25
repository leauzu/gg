import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const START_BALANCE = 1_000_000_000;
const TOKEN_COOKIE = 'lj_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
let schemaReady = false;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  return neon(process.env.DATABASE_URL);
}

export async function ensureSchema() {
  if (schemaReady) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      balance BIGINT NOT NULL DEFAULT 1000000000,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`;
  schemaReady = true;
}

export function sql() {
  return getSql();
}

export function send(res, status, data, headers = {}) {
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.status(status).json(data);
}

export function validateUserInput(username, password) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanPassword = String(password || '');
  if (!/^[a-z0-9_]{3,32}$/.test(cleanUsername)) {
    return { error: 'Username must be 3-32 chars: a-z, 0-9, underscore only.' };
  }
  if (cleanPassword.length < 6 || cleanPassword.length > 72) {
    return { error: 'Password must be 6-72 characters.' };
  }
  return { username: cleanUsername, password: cleanPassword };
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 210000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  const test = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
}

function secret() {
  return process.env.AUTH_SECRET || process.env.JWT_SECRET || 'dev-change-this-secret';
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function createToken(user) {
  const payload = base64url(JSON.stringify({ id: user.id, username: user.username, iat: Date.now() }));
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (Date.now() - Number(data.iat || 0) > COOKIE_MAX_AGE * 1000) return null;
  return data;
}

export function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const parts = raw.split(';').map(v => v.trim());
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx) === name) return decodeURIComponent(part.slice(idx + 1));
  }
  return null;
}

export function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

export function clearCookie() {
  return `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function getCurrentUser(req) {
  const token = getCookie(req, TOKEN_COOKIE);
  const data = verifyToken(token);
  if (!data?.id) return null;
  await ensureSchema();
  const rows = await sql()`SELECT id, username, balance FROM users WHERE id = ${data.id} LIMIT 1`;
  return rows[0] || null;
}

export function publicUser(row) {
  return { id: Number(row.id), username: row.username, balance: Number(row.balance ?? START_BALANCE) };
}

export { START_BALANCE };
