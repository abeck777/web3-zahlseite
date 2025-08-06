// /pages/api/rechnung.js
import puppeteer from "puppeteer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const {
      orderId, name, email, warenkorbWert,
      chain, coin, txHash, walletAdresse, userId
    } = req.body || {};

    if (!orderId || !name || !email || !warenkorbWert || !chain || !coin || !txHash || !walletAdresse || !userId) {
      return res.status(400).json({ error: "❌ Fehlende Felder" });
    }

    const totalEUR = Number(warenkorbWert);
    if (isNaN(totalEUR)) {
      return res.status(400).json({ error: "❌ warenkorbWert muss numerisch sein" });
    }

    const html = `
      <html>
        <head><meta charset="UTF-8"><title>Rechnung</title></head>
        <body style="font-family:sans-serif; padding:20px;">
          <h1>🧾 Rechnung zu Ihrer Bestellung</h1>
          <p><strong>Bestellnummer:</strong> ${orderId}</p>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Chain:</strong> ${chain}</p>
          <p><strong>Coin:</strong> ${coin}</p>
          <p><strong>Warenkorbwert:</strong> ${totalEUR.toFixed(2)} EUR</p>
          <p><strong>Wallet-Adresse:</strong> ${walletAdresse}</p>
          <p><strong>Transaktions-Hash:</strong> ${txHash}</p>
          <p style="margin-top:30px;">Vielen Dank für Ihre Zahlung bei GoldSilverStuff!</p>
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"] // wichtig für Vercel/Serverless
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({ format: "A4" });
    await browser.close();

    const base64 = pdfBuffer.toString("base64");

    // CMS-Eintrag in Wix (PDF + Metadaten)
    await fetch("https://www.goldsilverstuff.com/_functions/rechnungCreate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        name,
        email,
        warenkorbWert: totalEUR,
        coin,
        chain,
        txHash,
        walletAdresse,
        zeitpunkt: new Date().toISOString(),
        pdfBase64: base64,
        userId
      })
    });

    return res.status(200).json({
      base64,
      filename: `Rechnung_${orderId}.pdf`
    });

  } catch (err) {
    console.error("❌ Fehler bei PDF-Erstellung:", err);
    return res.status(500).json({ error: "PDF-Konvertierung fehlgeschlagen" });
  }
}