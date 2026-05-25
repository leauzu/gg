import { getCurrentUser, sql, send, publicUser } from './_lib.js';

export default async function handler(req, res) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return send(res, 401, { error: 'Not logged in' });

    if (req.method === 'GET') return send(res, 200, { user: publicUser(user) });
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

    const nextBalance = Math.max(0, Math.floor(Number(req.body?.balance)));
    if (!Number.isFinite(nextBalance)) return send(res, 400, { error: 'Invalid balance' });

    const rows = await sql()`
      UPDATE users SET balance = ${nextBalance}, updated_at = NOW()
      WHERE id = ${user.id}
      RETURNING id, username, balance
    `;
    return send(res, 200, { user: publicUser(rows[0]) });
  } catch (err) {
    return send(res, 500, { error: err.message || 'Balance update failed' });
  }
}
