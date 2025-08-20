// /pages/api/rechnung.js
import PDFDocument from "pdfkit";

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } }, // etwas Luft
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Secret muss mit Wix-Secret 'PDF_SECRET' matchen
    if (req.body?.secret !== process.env.PDF_SECRET) {
      return res.status(401).json({ error: "❌ Ungültiger Secret-Key" });
    }

    const {
      orderId, name, email, warenkorbWert,
      chain, coin, txHash, walletAdresse, userId
    } = req.body || {};

    if (!orderId || !name || !email || !warenkorbWert || !chain || !coin || !txHash || !walletAdresse || !userId) {
      return res.status(400).json({ error: "❌ Fehlende Felder" });
    }

    // PDF in Memory bauen
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", (e) => console.error("PDF error:", e));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const base64 = pdfBuffer.toString("base64");

      // Optional in Wix ablegen (du nutzt das schon)
      try {
        await fetch("https://www.goldsilverstuff.com/_functions/rechnungCreate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId, name, email,
            warenkorbWert: Number(warenkorbWert),
            coin, chain, txHash, walletAdresse,
            zeitpunkt: new Date().toISOString(),
            pdfBase64: base64,
            userId
          })
        });
      } catch (e) {
        console.error("RechnungWeb3 save failed:", e?.message || e);
      }

      res.status(200).json({
        base64,
        filename: `Rechnung_${orderId}.pdf`
      });
    });

    // Inhalt
    doc.fontSize(18).text("🧾 Rechnung – GoldSilverStuff");
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Bestellnummer: ${orderId}`);
    doc.text(`Name: ${name}`);
    doc.text(`E-Mail: ${email}`);
    doc.text(`Warenkorbwert: ${Number(warenkorbWert).toFixed(2)} EUR`);
    doc.text(`Coin: ${String(coin).toUpperCase()}`);
    doc.text(`Chain: ${String(chain).toUpperCase()}`);
    doc.text(`Wallet: ${walletAdresse}`);
    doc.text(`TxHash: ${txHash}`);
    doc.moveDown();
    doc.text("Vielen Dank für Ihre Zahlung!");
    doc.end();

  } catch (err) {
    console.error("❌ PDF-Fehler:", err);
    return res.status(500).json({ error: err?.message || "PDF-Fehler" });
  }
}