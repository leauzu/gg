import { getCurrentUser, send, publicUser } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  try {
    const user = await getCurrentUser(req);
    if (!user) return send(res, 401, { error: 'Not logged in' });
    return send(res, 200, { user: publicUser(user) });
  } catch (err) {
    return send(res, 500, { error: err.message || 'Auth check failed' });
  }
}
