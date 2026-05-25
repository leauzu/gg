import { ensureSchema, validateUserInput, sql, send, verifyPassword, createToken, sessionCookie, publicUser } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    await ensureSchema();
    const checked = validateUserInput(req.body?.username, req.body?.password);
    if (checked.error) return send(res, 400, { error: checked.error });
    const rows = await sql()`SELECT id, username, password_hash, salt, balance FROM users WHERE username = ${checked.username} LIMIT 1`;
    const user = rows[0];
    if (!user || !verifyPassword(checked.password, user.salt, user.password_hash)) {
      return send(res, 401, { error: 'Invalid username or password.' });
    }
    const out = publicUser(user);
    return send(res, 200, { user: out }, { 'Set-Cookie': sessionCookie(createToken(out)) });
  } catch (err) {
    return send(res, 500, { error: err.message || 'Login failed' });
  }
}
