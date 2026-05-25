import { send, clearCookie } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
}
