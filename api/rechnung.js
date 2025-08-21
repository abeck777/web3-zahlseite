// /pages/api/rechnung.js
import PDFDocument from 'pdfkit';
import { Buffer } from 'buffer';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

// ------- ENV-Fallbacks -------
const TAX_MODE_DEFAULT = (process.env.INVOICE_TAX_MODE || 'STANDARD').toUpperCase();
const TAX_RATE_DEFAULT = Number(process.env.INVOICE_TAX_RATE ?? 0.19);

// Seller aus ENV lesen (JSON)
function getEnvSeller() {
  try {
    const raw = process.env.INVOICE_SELLER_JSON;
    if (!raw) return null;
    const o = JSON.parse(raw);
    // minimale Normalisierung
    return {
      name: o.name || '',
      street: o.street || '',
      zip: o.zip || '',
      city: o.city || '',
      country: o.country || '',
      ustId: o.ustId || null,
      taxNo: o.taxNo || null,
      email: o.email || '',
      website: o.website || '',
      iban: o.iban || null,
      bic: o.bic || null,
      bank: o.bank || null,
      logoUrl: o.logoUrl || null, // optional
    };
  } catch (_) { return null; }
}

// ------- Utils -------
function money(n) { try { return Number(n).toFixed(2) + ' €'; } catch { return '0,00 €'; } }
function asStr(v){ return (v === null || v === undefined) ? '' : String(v); }

function drawRow(doc, x, y, widths, texts, opts = {}){
  const align = opts.align || ['left','right','right','right'];
  const font  = opts.font  || 'Helvetica';
  const size  = opts.size  || 10;
  doc.font(font).fontSize(size);
  let cx = x;
  texts.forEach((t, i) => {
    const w = widths[i];
    doc.text(t ?? '', cx + 2, y, { width: w - 4, align: align[i] || 'left' });
    cx += w;
  });
  return y;
}

function drawTable(doc, x, y, widths, rows, header){
  // header
  doc.rect(x, y, widths.reduce((s,a)=>s+a,0), 20).fill('#f4f4f4').stroke('#e5e5e5');
  doc.fillColor('#111').strokeColor('#e5e5e5');
  drawRow(doc, x, y+5, widths, header, { align: ['left','right','right','right'], size: 10, font: 'Helvetica-Bold' });
  let cy = y + 22;
  // body
  rows.forEach(r => {
    drawRow(doc, x, cy, widths, r, { align: ['left','right','right','right'], size: 10 });
    cy += 18;
  });
  return cy;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    if (req.body?.secret !== process.env.PDF_SECRET) {
      return res.status(401).json({ error: '❌ Ungültiger Secret-Key' });
    }

    // Pflichtfelder (alt-kompatibel)
    const { orderId, name, email, warenkorbWert, chain, coin, txHash, walletAdresse, userId } = req.body || {};
    if (!orderId || !name || !email || !warenkorbWert || !chain || !coin || !txHash || !walletAdresse || !userId) {
      return res.status(400).json({ error: '❌ Fehlende Felder' });
    }

    // Request-Optionals
    const {
      invoiceId = `INV-${orderId}`,
      invoiceDate = new Date().toISOString(),
      serviceDate = new Date().toISOString(),
      currency = 'EUR',
      items = [],
      billingAddress = null,
      shippingAddress = null,
      // seller wird unten mit ENV-Fallback aufgelöst
      fxSource,
      fxRateEurPerUnit,
      fxTimestampUtc
    } = req.body || {};

    // Steuer/Modus aus Request -> ENV -> Defaults
    const taxMode = (req.body?.taxMode || TAX_MODE_DEFAULT).toUpperCase();
    const taxRate = taxMode === 'STANDARD'
      ? Number(req.body?.taxRate ?? TAX_RATE_DEFAULT)
      : null;

    // Payment-Darstellung
    const paymentMethod = req.body?.paymentMethod || 'Web3-Direct';
    const provider = req.body?.provider || 'Wallet';

    // Seller auflösen: Request > ENV > minimal
    const seller = req.body?.seller || getEnvSeller() || { name: 'GoldSilverStuff' };

    // Items/Summen
    const normItems = Array.isArray(items) && items.length
      ? items.map(it => ({
          name: asStr(it.name || 'Position'),
          qty: Number(it.qty || 1),
          unitPriceEur: Number(it.unitPriceEur || 0)
        })).filter(it => it.qty > 0)
      : [{ name: 'Warenlieferung gemäß Bestellung', qty: 1, unitPriceEur: Number(warenkorbWert) }];

    const netSum = normItems.reduce((s, it) => s + (it.unitPriceEur * it.qty), 0);

    let vat = 0;
    let gross = netSum;
    let vatNote = '';

    if (taxMode === 'STANDARD') {
      const rate = Number(taxRate || 0);
      vat = Math.round(netSum * rate * 100) / 100;
      gross = netSum + vat;
      vatNote = `Enthält ${Math.round(rate * 100)}% USt.`;
    } else if (taxMode === 'REVERSE') {
      vat = 0; gross = netSum;
      vatNote = 'Steuerschuldnerschaft des Leistungsempfängers – Reverse Charge (§ 13b UStG).';
    } else if (taxMode === 'EXEMPT') {
      vat = 0; gross = netSum;
      vatNote = 'Umsatzsteuerbefreit gemäß §19 UStG (Kleinunternehmerregelung).';
    } else if (taxMode === 'MARGIN') {
      vat = 0; gross = netSum;
      vatNote = 'Differenzbesteuerung gemäß §25a UStG.';
    }

    // PDF erstellen
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', d => chunks.push(d));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      return res.status(200).json({
        base64: pdfBuffer.toString('base64'),
        filename: `Rechnung_${invoiceId}.pdf`
      });
    });

    // Optional: Logo
    if (seller.logoUrl) {
      try {
        // Remote-Image-Unterstützung ist je nach Runtime tricky; wenn lokales Asset, hier einbinden.
        // doc.image('public/logo.png', 48, 36, { width: 120 });
      } catch(_) {}
    }

    // Kopf (Seller)
    doc.font('Helvetica-Bold').fontSize(14).text(seller?.name || 'GoldSilverStuff', { align: 'left' });
    doc.font('Helvetica').fontSize(10);
    const sellerLines = [
      [seller?.street, [seller?.zip, seller?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      [seller?.country].filter(Boolean).join(''),
      seller?.ustId ? `USt-IdNr.: ${seller.ustId}` : (seller?.taxNo ? `Steuernummer: ${seller.taxNo}` : null),
      seller?.email ? `E-Mail: ${seller.email}` : null,
      seller?.website || null,
      seller?.iban ? `IBAN: ${seller.iban}` : null,
      seller?.bic ? `BIC: ${seller.bic}` : null,
      seller?.bank ? `Bank: ${seller.bank}` : null
    ].filter(Boolean);
    sellerLines.forEach(l => doc.text(l));
    doc.moveDown(1);

    // Rechnungsdaten
    doc.font('Helvetica-Bold').fontSize(12).text('Rechnung', { align: 'left' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Rechnungs-Nr.: ${invoiceId}`);
    doc.text(`Rechnungsdatum: ${new Date(invoiceDate).toLocaleDateString('de-DE')}`);
    doc.text(`Leistungsdatum: ${new Date(serviceDate).toLocaleDateString('de-DE')}`);
    doc.text(`Bestellnummer: ${orderId}`);
    doc.moveDown(0.5);

    // Adressen
    const topY = doc.y;
    const leftX = doc.x;
    const rightX = 320;

    doc.font('Helvetica-Bold').text('Rechnung an:');
    doc.font('Helvetica');
    if (billingAddress) {
      doc.text(billingAddress.name || '');
      doc.text([billingAddress.street, [billingAddress.zip, billingAddress.city].filter(Boolean).join(' ')].filter(Boolean).join(', '));
      if (billingAddress.country) doc.text(billingAddress.country);
    } else {
      doc.text(name);
    }

    doc.text('');
    doc.text('');

    doc.save();
    doc.font('Helvetica-Bold').text('Lieferadresse:', rightX, topY);
    doc.font('Helvetica');
    if (shippingAddress) {
      doc.text(shippingAddress.name || '', rightX);
      doc.text([shippingAddress.street, [shippingAddress.zip, shippingAddress.city].filter(Boolean).join(' ')].filter(Boolean).join(', '), rightX);
      if (shippingAddress.country) doc.text(shippingAddress.country, rightX);
    } else {
      doc.text('-', rightX);
    }
    doc.restore();

    doc.moveDown(1);

    // Positionen Tabelle
    const startY = Math.max(doc.y, topY + 70);
    const tableX = leftX;
    const widths = [270, 70, 90, 90]; // Bezeichnung / Menge / Einzelpreis / Gesamt
    const header = ['Bezeichnung', 'Menge', 'Einzelpreis', 'Gesamt'];

    const rows = normItems.map(it => [
      it.name,
      String(it.qty),
      money(it.unitPriceEur),
      money(it.unitPriceEur * it.qty)
    ]);

    const afterRowsY = drawTable(doc, tableX, startY, widths, rows, header);
    doc.moveTo(tableX, afterRowsY + 6).lineTo(tableX + widths.reduce((s,a)=>s+a,0), afterRowsY + 6).stroke('#e5e5e5');

    // Summenblock (rechts)
    const sumX = tableX + widths[0] + widths[1];
    let sumY = afterRowsY + 12;
    doc.font('Helvetica').fontSize(10);
    drawRow(doc, sumX, sumY, [widths[2], widths[3]], ['Zwischensumme:', money(netSum)], { align: ['right','right'] });
    sumY += 18;

    if (taxMode === 'STANDARD') {
      drawRow(doc, sumX, sumY, [widths[2], widths[3]], [`zzgl. USt (${Math.round(Number(taxRate)*100)}%):`, money(vat)], { align: ['right','right'] });
      sumY += 18;
    } else {
      drawRow(doc, sumX, sumY, [widths[2], widths[3]], ['Hinweis:', vatNote], { align: ['right','right'] });
      sumY += 18;
    }

    doc.font('Helvetica-Bold');
    drawRow(doc, sumX, sumY, [widths[2], widths[3]], ['Gesamtbetrag:', money(gross)], { align: ['right','right'] });
    doc.font('Helvetica');

    doc.moveDown(1.2);

    // Zahlungs-/Krypto-Infos
    doc.font('Helvetica-Bold').text('Zahlungsdetails');
    doc.font('Helvetica').text(`Methode: ${paymentMethod}`);
    doc.text(`Provider: ${provider}`);
    doc.text(`Coin/Chain: ${coin} / ${chain}`);
    doc.text(`Wallet: ${walletAdresse}`);
    doc.text(`TxHash: ${txHash}`);
    if (fxSource || fxRateEurPerUnit) {
      doc.text(
        `FX: ${fxSource || '—'}${
          fxRateEurPerUnit ? ` @ ${Number(fxRateEurPerUnit).toFixed(2)} EUR/${coin}` : ''
        }${
          fxTimestampUtc ? ` (${new Date(fxTimestampUtc).toLocaleString('de-DE')})` : ''
        }`
      );
    }

    doc.moveDown(0.8);
    // Steuer-/Rechtshinweise
    if (taxMode !== 'STANDARD') {
      doc.text(vatNote);
    } else {
      doc.text('Preisangaben inkl. gesetzl. Umsatzsteuer.');
    }

    doc.moveDown(0.8);
    doc.text('Vielen Dank für Ihre Zahlung!', { align: 'left' });

    doc.end();
  } catch (err) {
    console.error('❌ PDF-Fehler:', err);
    return res.status(500).json({ error: err?.message || 'PDF-Fehler' });
  }
}