// /pages/api/rechnung.js
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

pdfMake.vfs = pdfFonts.pdfMake.vfs;

function generatePdfBase64(docDefinition) {
  return new Promise((resolve, reject) => {
    const pdfDocGenerator = pdfMake.createPdf(docDefinition);
    pdfDocGenerator.getBase64((data) => {
      resolve(data);
    });
  });
}

export default async function handler(req, res) {
  if (req.body.secret !== process.env.PDF_SECRET) {
    return res.status(401).json({ error: "❌ Ungültiger Secret-Key" });
  }  
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

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

    const docDefinition = {
      content: [
        { text: "🧾 Rechnung – GoldSilverStuff", style: "header" },
        { text: `Bestellnummer: ${orderId}` },
        { text: `Name: ${name}` },
        { text: `E-Mail: ${email}` },
        { text: `Warenkorbwert: ${totalEUR.toFixed(2)} EUR` },
        { text: `Coin: ${coin}`, margin: [0, 5] },
        { text: `Chain: ${chain}` },
        { text: `Wallet: ${walletAdresse}` },
        { text: `TxHash: ${txHash}` },
        { text: "Vielen Dank für Ihre Zahlung!", margin: [0, 20] }
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 10]
        }
      }
    };

    // ✅ PDF generieren
    const base64 = await generatePdfBase64(docDefinition);

    // ✅ POST an WIX (Rechnung speichern)
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
    return res.status(500).json({ error: err.message || "PDF-Fehler" });
  }
}