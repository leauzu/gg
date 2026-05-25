import { ensureSchema, hashPassword, validateUserInput, sql, send, createToken, sessionCookie, publicUser, START_BALANCE } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    await ensureSchema();
    const checked = validateUserInput(req.body?.username, req.body?.password);
    if (checked.error) return send(res, 400, { error: checked.error });
    const { salt, hash } = hashPassword(checked.password);
    const rows = await sql()`
      INSERT INTO users (username, password_hash, salt, balance)
      VALUES (${checked.username}, ${hash}, ${salt}, ${START_BALANCE})
      RETURNING id, username, balance
    `;
    const user = publicUser(rows[0]);
    return send(res, 200, { user }, { 'Set-Cookie': sessionCookie(createToken(user)) });
  } catch (err) {
    if (String(err.message || '').includes('duplicate key')) {
      return send(res, 409, { error: 'Username already exists.' });
    }
    return send(res, 500, { error: err.message || 'Register failed' });
  }
}
