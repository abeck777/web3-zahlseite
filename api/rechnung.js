// /pages/api/rechnung.js
// Next.js API-Route: generiert eine Rechnung als PDF (Base64) via PDFKit
// und speichert sie in Wix (RechnungenWeb3) – robust, hübsch, klickbarer Tx-Link.

export const config = {
  api: {
    bodyParser: { sizeLimit: '2mb' },
  },
};

function txExplorerUrl(chain, tx) {
  const c = String(chain || '').toUpperCase();
  const base =
    c === 'ETH' ? 'https://etherscan.io/tx/' :
    (c === 'POLYGON' || c === 'MATIC') ? 'https://polygonscan.com/tx/' :
    (c === 'BSC' || c === 'BNB') ? 'https://bscscan.com/tx/' :
    'https://etherscan.io/tx/';
  return tx ? base + tx : base;
}

function eur(n) {
  const x = Number(n || 0);
  return `${x.toFixed(2)} €`;
}

async function fetchLogoBuffer() {
  const logoUrl = 'https://static.wixstatic.com/media/956a0b_cf8d49de015e43e19b5c69672c502110~mv2.png';
  try {
    const r = await fetch(logoUrl);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    // Secret-Handshake
    if (req.body?.secret !== process.env.PDF_SECRET) {
      return res.status(401).json({ error: '❌ Ungültiger Secret-Key' });
    }

    const {
      orderId,
      name,
      email,
      warenkorbWert,
      chain,
      coin,
      txHash,
      walletAdresse,
      userId,
      provider,        // optional: für Anzeige
      paymentMethod,   // optional: für Anzeige
    } = req.body || {};

    if (!orderId || !name || !email || !warenkorbWert || !chain || !coin || !txHash || !walletAdresse || !userId) {
      return res.status(400).json({ error: '❌ Fehlende Felder' });
    }

    const totalEUR = Number(warenkorbWert);
    if (!isFinite(totalEUR)) return res.status(400).json({ error: '❌ warenkorbWert muss numerisch sein' });

    const [PDFDocumentMod, logoBuf] = await Promise.all([
      import('pdfkit'),
      fetchLogoBuffer()
    ]);
    const PDFDocument = PDFDocumentMod.default || PDFDocumentMod; // CJS/ESM kompatibel

    const now = new Date();
    const invoiceId = `INV-${orderId}`;
    const txUrl = txExplorerUrl(chain, txHash);
    const methodLabel = paymentMethod || 'On-Chain Web3-Direct';
    const providerLabel = provider || 'Wallet';

    // --- PDF aufbauen ---
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Rechnung ${invoiceId}`,
        Author: 'GoldSilverStuff',
      },
    });

    const chunks = [];
    doc.on('data', (d) => chunks.push(d));
    doc.on('error', (e) => {
      console.error('❌ PDF-Fehler (Stream):', e);
      try { res.status(500).json({ error: 'PDF-Fehler' }); } catch {}
    });
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const base64 = pdfBuffer.toString('base64');

      // In Wix speichern (best effort – Fehler brechen Response NICHT ab)
      try {
        await fetch('https://www.goldsilverstuff.com/_functions/rechnungCreate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            name,
            email,
            warenkorbWert: totalEUR,
            coin,
            chain,
            txHash,
            walletAdresse,
            zeitpunkt: now.toISOString(),
            pdfBase64: base64,
            userId,
            // extra Felder (werden von Wix ignoriert, falls nicht vorhanden)
            provider: providerLabel,
            paymentMethod: methodLabel,
          }),
        });
      } catch (e) {
        console.error('⚠️ Wix-Speicherfehler (RechnungenWeb3):', e?.message || e);
      }

      res.status(200).json({
        base64,
        filename: `Rechnung_${orderId}.pdf`,
      });
    });

    // Farben & Maße
    const GOLD = '#d4af37';
    const GREY = '#666666';
    const LIGHT = '#eeeeee';
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right; // 595 - 100 = 495

    // Header
    if (logoBuf) {
      doc.image(logoBuf, doc.page.margins.left, 40, { width: 120 });
    }
    doc
      .font('Helvetica-Bold').fontSize(22).fillColor('#111111')
      .text('Rechnung', 0, 50, { align: 'right' })
      .moveDown(0.2)
      .font('Helvetica').fontSize(10).fillColor(GREY)
      .text('GoldSilverStuff', { align: 'right' })
      .fillColor('#1a73e8')
      .text('www.goldsilverstuff.com', { align: 'right', link: 'https://www.goldsilverstuff.com', underline: true })
      .fillColor(GREY)
      .text('info@goldsilverstuff.com', { align: 'right' });

    doc.moveDown(2);

    // Helper: Section-Überschrift
    const sectionTitle = (title) => {
      doc
        .moveDown(0.2)
        .font('Helvetica-Bold').fontSize(12).fillColor('#111111')
        .text(title)
        .moveDown(0.3);
    };

    // Helper: "Card" (rounded box)
    const card = (height, draw) => {
      const x = doc.page.margins.left;
      const y = doc.y;
      const w = contentWidth;
      const h = height;

      // Hintergrund
      doc.save()
        .roundedRect(x, y, w, h, 10)
        .fillOpacity(0.035)
        .fill(GOLD)
        .restore();

      // Rahmen
      doc.save()
        .roundedRect(x, y, w, h, 10)
        .lineWidth(1)
        .strokeColor(LIGHT)
        .stroke()
        .restore();

      doc.moveDown(0.2);
      draw({ x, y, w, h, pad: 14 });
      doc.y = y + h + 10; // unter die Karte springen
    };

    // Rechnungsdetails
    sectionTitle('Rechnungsdetails');
    card(120, ({ x, y, w, pad }) => {
      const left = x + pad;
      let yy = y + pad;

      const row = (label, value) => {
        doc.font('Helvetica').fontSize(10).fillColor(GREY).text(label + ':', left, yy, { width: 140 });
        doc.font('Helvetica').fontSize(10).fillColor('#111111').text(String(value || ''), left + 150, yy, { width: w - 150 - pad * 2 });
        yy += 14;
      };

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(invoiceId, left, yy);
      yy += 18;

      row('Bestellnummer', orderId);
      row('Rechnungsdatum', new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(now));
      row('Kunde', name);
      row('E-Mail', email);
    });

    // Zahlungsinformationen
    sectionTitle('Zahlung');
    card(150, ({ x, y, w, pad }) => {
      const left = x + pad;
      let yy = y + pad;

      const row = (label, value) => {
        doc.font('Helvetica').fontSize(10).fillColor(GREY).text(label + ':', left, yy, { width: 160 });
        doc.font('Helvetica').fontSize(10).fillColor('#111111').text(String(value || ''), left + 170, yy, { width: w - 170 - pad * 2 });
        yy += 16;
      };

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('Zahlungsübersicht', left, yy);
      yy += 18;

      row('Betrag', eur(totalEUR));
      row('Zahlungsmethode', methodLabel);
      row('Provider', providerLabel);
      row('Chain / Coin', `${String(chain).toUpperCase()} / ${String(coin).toUpperCase()}`);
      row('Wallet', walletAdresse);

      // Tx-Link
      doc.fillColor(GREY).text('Transaktion:', left, yy, { width: 160 });
      doc
        .fillColor('#1a73e8')
        .text(txHash, left + 170, yy, {
          width: w - 170 - pad * 2,
          link: txUrl,
          underline: true,
        });
    });

    // Summe / Hinweis
    doc.moveDown(1.0);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(`Gesamtbetrag: ${eur(totalEUR)}`);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).fillColor(GREY)
      .text('Vielen Dank für Ihre Zahlung! Diese Rechnung wurde automatisch erstellt und steht auch in Ihrem Crypto-Dashboard zum Download bereit.');

    // abschließen
    doc.end();

  } catch (err) {
    console.error('❌ PDF-Fehler:', err);
    return res.status(500).json({ error: err?.message || 'PDF-Fehler' });
  }
}