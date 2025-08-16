// pages/api/web3zahlung.js
const BASE = 'https://www.goldsilverstuff.com/_functions/web3zahlung';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { orderId, token } = req.query || {};
      if (!orderId || !token) return res.status(400).json({ error: 'orderId und token erforderlich' });

      const url = `${BASE}?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.status(r.ok ? 200 : r.status).json(data);
    }

    if (req.method === 'POST') {
      const r = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {})
      });
      const data = await r.json();
      return res.status(r.ok ? 200 : r.status).json(data);
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Proxy /api/web3zahlung error:', err);
    res.status(500).json({ error: 'Proxy-Fehler' });
  }
}
