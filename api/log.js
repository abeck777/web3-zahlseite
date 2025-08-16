// /pages/api/log.js
export default async function handler(req, res) {
  try {
    const body = req.body ? JSON.parse(req.body) : {};
    console.log('[VRC] log', { query: req.query, body, ts: Date.now() });
  } catch (e) {
    console.log('[VRC] log(raw)', req.body);
  }
  res.status(200).json({ ok: true });
}