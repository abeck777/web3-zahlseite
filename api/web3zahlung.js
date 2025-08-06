const base = "https://www.goldsilverstuff.com/_functions/web3zahlung";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { orderId, token } = req.query;
      if (!orderId || !token) {
        return res.status(400).json({ error: "orderId und token erforderlich" });
      }

      const url = `${base}?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;
      const response = await fetch(url);
      const data = await response.json();

      return res.status(response.ok ? 200 : response.status).json(data);
    }

    if (req.method === "POST") {
      const body = req.body;
      const response = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      return res.status(response.ok ? 200 : response.status).json(data);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("Proxy /api/web3zahlung error:", err);
    return res.status(500).json({ error: "Proxy-Fehler" });
  }
}
