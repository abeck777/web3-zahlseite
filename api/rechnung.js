// /pages/api/rechnung.js
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
pdfMake.vfs = pdfFonts.pdfMake.vfs;

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const base64 = Buffer.from(buf).toString('base64');
  const mime = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

function generatePdfBase64(docDefinition) {
  return new Promise((resolve) => {
    const pdf = pdfMake.createPdf(docDefinition);
    pdf.getBase64((data) => resolve(data));
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    if (req.body?.secret !== process.env.PDF_SECRET) {
      return res.status(401).json({ error: '❌ Ungültiger Secret-Key' });
    }

    const {
      orderId, name, email, warenkorbWert,
      chain, coin, txHash, walletAdresse, userId,
      provider, paymentMethod
    } = req.body || {};

    if (!orderId || !name || !email || !warenkorbWert || !chain || !coin || !txHash || !walletAdresse || !userId) {
      return res.status(400).json({ error: '❌ Fehlende Felder' });
    }

    const totalEUR = Number(warenkorbWert);
    if (Number.isNaN(totalEUR)) return res.status(400).json({ error: '❌ warenkorbWert muss numerisch sein' });

    // Branding
    const logoUrl = 'https://static.wixstatic.com/media/956a0b_cf8d49de015e43e19b5c69672c502110~mv2.png';
    let logoDataUrl = null;
    try { logoDataUrl = await fetchImageAsBase64(logoUrl); } catch {}

    const today = new Date();
    const datum = today.toLocaleDateString('de-DE');

    // Tx-Link
    const C = String(chain || '').toUpperCase();
    const explorer =
      C === 'ETH' ? 'https://etherscan.io/tx/' :
      (C === 'POLYGON' || C === 'MATIC') ? 'https://polygonscan.com/tx/' :
      (C === 'BSC' || C === 'BNB') ? 'https://bscscan.com/tx/' :
      'https://etherscan.io/tx/';
    const txUrl = `${explorer}${txHash}`;

    const doc = {
      pageMargins: [40, 60, 40, 60],
      defaultStyle: { fontSize: 10, lineHeight: 1.3 },
      styles: {
        h1: { fontSize: 18, bold: true, margin: [0, 6, 0, 12] },
        h2: { fontSize: 12, bold: true, margin: [0, 8, 0, 6] },
        kvk: { color: '#666' },
        boxLabel: { color: '#666' },
        boxValue: { bold: true }
      },
      content: [
        {
          columns: [
            logoDataUrl ? { image: logoDataUrl, width: 140 } : { text: 'GoldSilverStuff', style: 'h1' },
            {
              width: 'auto',
              alignment: 'right',
              stack: [
                { text: 'GoldSilverStuff', bold: true },
                { text: 'info@goldsilverstuff.com' },
                { text: 'www.goldsilverstuff.com', color: '#1a73e8', link: 'https://www.goldsilverstuff.com' }
              ]
            }
          ]
        },

        { text: 'Rechnung', style: 'h1', margin: [0, 20, 0, 2] },
        {
          columns: [
            {
              width: '*',
              stack: [
                { text: 'Rechnungsnummer', style: 'boxLabel' },
                { text: `INV-${orderId}`, style: 'boxValue', margin: [0, 0, 0, 8] },
                { text: 'Rechnungsdatum', style: 'boxLabel' },
                { text: datum, style: 'boxValue' }
              ]
            },
            {
              width: '*',
              stack: [
                { text: 'An', style: 'boxLabel' },
                { text: `${name}\n${email}`, style: 'boxValue' }
              ]
            }
          ],
          margin: [0, 0, 0, 16]
        },

        { text: 'Zahlungsdetails', style: 'h2' },
        {
          table: {
            widths: ['auto', '*'],
            body: [
              [{ text: 'Betrag (EUR)', style: 'kvk' }, { text: `${totalEUR.toFixed(2)} €`, bold: true }],
              [{ text: 'Coin / Chain', style: 'kvk' }, `${String(coin).toUpperCase()} / ${String(chain).toUpperCase()}`],
              [{ text: 'Wallet', style: 'kvk' }, walletAdresse],
              [{ text: 'TxHash', style: 'kvk' }, { text: txHash, color: '#1a73e8', link: txUrl }],
              [{ text: 'Provider', style: 'kvk' }, provider || 'Wallet' ],
              [{ text: 'Zahlungsmethode', style: 'kvk' }, paymentMethod || 'On-Chain Web3-Direct' ]
            ]
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 16]
        },

        { text: 'Hinweis', style: 'h2' },
        {
          text:
            'Diese Rechnung wurde automatisch auf Basis Ihrer On-Chain-Zahlung erstellt. ' +
            'Bitte bewahren Sie die Transaktions-ID (TxHash) für Rückfragen auf.'
        },

        // Fußbereich
        {
          margin: [0, 26, 0, 0],
          columns: [
            { text: 'GoldSilverStuff – Vielen Dank für Ihren Einkauf!', italics: true },
            { alignment: 'right', text: `Bestellnummer: ${orderId}` }
          ]
        }
      ]
    };

    const base64 = await generatePdfBase64(doc);

    // In Wix speichern
    await fetch('https://www.goldsilverstuff.com/_functions/rechnungCreate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId, name, email,
        warenkorbWert: totalEUR, coin, chain, txHash, walletAdresse,
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
    console.error('❌ PDF-Fehler:', err);
    return res.status(500).json({ error: err?.message || 'PDF-Fehler' });
  }
}