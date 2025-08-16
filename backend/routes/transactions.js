// routes/transactions
const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const authMiddleware = require('../middleware/authMiddleware');

const sendEmail = require('../utils/sendEmail');


const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer'); // 👈 add

// cache the base64 once
let LOGO_BASE64 = null;
function getLogoBase64() {
  if (LOGO_BASE64 !== null) return LOGO_BASE64;
  try {
    const filePath = path.join(__dirname, '..', 'assets', 'images', 'logo.png'); // adjust filename if needed
    const buf = fs.readFileSync(filePath);
    LOGO_BASE64 = buf.toString('base64');
  } catch (e) {
    console.warn('⚠️ Logo not found for email header:', e.message);
    LOGO_BASE64 = '';
  }
  return LOGO_BASE64;
}

// Safe logo <img> (fixes your current undefined b64/heightPx)
function logoImgTag(heightPx = 40) {
  const b64 = getLogoBase64();
  return b64
    ? `<img src="data:image/png;base64,${b64}" alt="JW Auto Clinic 246" style="height:${heightPx}px;display:block" />`
    : `<span style="font-weight:700;font-size:18px">JW Auto Clinic 246</span>`;
}

// HTML → PDF Buffer
async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new',
  });
  try {
    const page = await browser.newPage();
    // Ensure images (data URLs) and fonts render
    await page.setContent(html, { waitUntil: ['load', 'domcontentloaded', 'networkidle0'] });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}


/* ------------------------- helpers: email templates ------------------------ */

const isEmail = (s = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

function currency(n) {
  const v = Number(n || 0);
  return v.toFixed(2);
}

/** Prefer req.body.email, else fall back to the Customer.email */
async function pickReceiptEmail({ email, customer }) {
  const e = String(email || '').trim().toLowerCase();
  if (isEmail(e)) return e;

  if (customer) {
    try {
      const c = await Customer.findById(customer).lean();
      const ce = String(c?.email || '').trim().toLowerCase();
      if (isEmail(ce)) return ce;
    } catch (_) {}
  }
  return '';
}

/** Works with either sendEmail({ to, subject, html }) OR sendEmail(to, subject, html) */
async function safeSendEmail(to, subject, html) {
  if (!isEmail(to)) throw new Error('No recipient address provided (missing/invalid).');
  try {
    // Try object signature first
    await sendEmail({ to, subject, html });
  } catch (e1) {
    // Fallback to (to, subject, html)
    await sendEmail(to, subject, html);
  }
}

function buildBatchReceiptHTML({ customerName, vehicleDetails, paymentMethod, items }) {
  const subtotal = items.reduce((s, i) => s + (Number(i.originalPrice) || 0), 0);
  const totalDiscount = items.reduce((s, i) => s + (Number(i.discountAmount) || 0), 0);
  const grandTotal = items.reduce((s, i) => s + (Number(i.finalPrice) || 0), 0);

  const rows = items.map((i, idx) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${idx + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">
        ${i.serviceName}${i.specialsName ? ` (${i.specialsName})` : ''}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${currency(i.originalPrice)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${i.discountPercent || 0}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${currency(i.finalPrice)}</td>
    </tr>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="color-scheme" content="light only" />
      </head>
      <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
        <div style="margin:0 0 8px;display:flex;align-items:center;gap:12px">
          ${logoImgTag(40)}
          <span style="font-size:18px;font-weight:700">Receipt</span>
        </div>

        <p style="margin:0 0 12px">Hi ${customerName || 'Customer'},</p>
        <p style="margin:0 0 16px">Thanks for your purchase. Here is your itemised receipt.</p>
        ${vehicleDetails ? `<p style="margin:0 0 8px"><strong>Vehicle:</strong> ${vehicleDetails}</p>` : ''}

        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #333;">#</th>
              <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #333;">Item</th>
              <th style="text-align:right;padding:8px 12px;border-bottom:2px solid #333;">Price</th>
              <th style="text-align:right;padding:8px 12px;border-bottom:2px solid #333;">Disc%</th>
              <th style="text-align:right;padding:8px 12px;border-bottom:2px solid #333;">Final</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <p style="margin:12px 0">
          <strong>Subtotal:</strong> $${currency(subtotal)}<br/>
          <strong>Discounts:</strong> −$${currency(totalDiscount)}<br/>
          <strong>Total:</strong> $${currency(grandTotal)}
        </p>

        <p style="margin:12px 0">Payment Method: ${paymentMethod || 'Cash'}</p>
        <p style="margin:16px 0 0">— JW Auto Clinic 246</p>
      </body>
    </html>
  `;
}

function buildSingleReceiptHTML(t) {
  const op = Number(t.originalPrice) || 0;
  const dp = Number(t.discountPercent) || 0;
  const dAmt = Number(t.discountAmount) || (op * dp) / 100;
  const final = Number(t.finalPrice) || (op - dAmt);

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="color-scheme" content="light only" />
      </head>
      <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
        <div style="margin:0 0 8px;display:flex;align-items:center;gap:12px">
          ${logoImgTag(40)}
          <span style="font-size:18px;font-weight:700">Receipt</span>
        </div>

        <p style="margin:0 0 12px">Hi ${t.customerName || 'Customer'},</p>
        <p style="margin:0 0 16px">Thanks for your purchase. Here are your transaction details.</p>
        ${t.vehicleDetails ? `<p style="margin:0 0 8px"><strong>Vehicle:</strong> ${t.vehicleDetails}</p>` : ''}

        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #333;">Item</th>
              <th style="text-align:right;padding:8px 12px;border-bottom:2px solid #333;">Price</th>
              <th style="text-align:right;padding:8px 12px;border-bottom:2px solid #333;">Disc%</th>
              <th style="text-align:right;padding:8px 12px;border-bottom:2px solid #333;">Final</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">
                ${t.serviceType}${t.specials ? ` (${t.specials})` : ''}
              </td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${currency(op)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${dp}%</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${currency(final)}</td>
            </tr>
          </tbody>
        </table>

        <p style="margin:12px 0">Payment Method: ${t.paymentMethod || '—'}</p>
        ${t.notes ? `<p style="margin:12px 0"><strong>Notes:</strong> ${t.notes}</p>` : ''}
        <p style="margin:16px 0 0">— JW Auto Clinic 246</p>
      </body>
    </html>
  `;
}


/* ------------------------------- GET all ------------------------------- */
router.get('/', async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('createdBy', 'name email')
      .populate('customer') // if you normalised customers
      .sort({ serviceDate: -1, createdAt: -1 });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/* ------------------------------ POST single ----------------------------- */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { finalPrice, ...rest } = req.body;

    if (!rest.customer) {
      return res.status(400).json({ error: 'Customer is required' });
    }
    if (!rest.paymentMethod) {
      return res.status(400).json({ error: 'Payment method is required' });
    }

    const transactionData = { ...rest, createdBy: req.user.id };
    const newTransaction = new Transaction(transactionData);
    await newTransaction.save();

    let emailSent = false;
    try {
      const to = await pickReceiptEmail({
        email: newTransaction.email,
        customer: newTransaction.customer,
      });

      if (to) {
        const html = buildSingleReceiptHTML(newTransaction);
        let attachments;
        try {
          const pdfBuffer = await htmlToPdfBuffer(html);
          attachments = [{ filename: `Receipt-${new Date().toISOString().slice(0,10)}.pdf`, content: pdfBuffer }];
        } catch (pdfErr) {
          console.warn('PDF generation failed, sending email without attachment:', pdfErr?.message || pdfErr);
        }

        await safeSendEmail(to, 'Your JW Auto Clinic Receipt', html, { attachments });
        emailSent = true;
      } else {
        console.warn('Receipt email skipped: no valid email for customer/transaction.');
      }
    } catch (mailErr) {
      console.error('Email failed:', mailErr?.message || mailErr);
    }

    res.status(201).json({ ...newTransaction.toObject(), emailSent });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


/* ------------------------------ GET by id ------------------------------- */
router.get('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('customer');
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    res.json(transaction);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ------------------------------ DELETE one ------------------------------ */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await Transaction.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Transaction not found' });

    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------- POST batch (new) --------------------------- */
/**
 * Body:
 * {
 *   customerName, email, vehicleDetails, paymentMethod, customer,
 *   items: [{
 *     serviceTypeId, serviceName, specialsId, specialsName,
 *     originalPrice, discountPercent, discountAmount, notes, paymentMethod
 *   }, ...]
 * }
 */
router.post('/batch', authMiddleware, async (req, res) => {
  const { customerName, email, vehicleDetails, paymentMethod, customer, items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items to save.' });
  }

  let docsToInsert;
  try {
    docsToInsert = items.map((i) => {
      const pm = i.paymentMethod || paymentMethod; // must be 'Cash' or 'Mobile Payment'
      if (!pm) throw new Error('Payment method is required for all items');
      return {
        customerName,
        email, // store what client sent (may be empty); receipt email is derived later
        vehicleDetails,
        serviceType: i.serviceName,
        specials: i.specialsName || null,
        paymentMethod: pm,
        originalPrice: i.originalPrice,
        discountPercent: i.discountPercent,
        discountAmount: i.discountAmount,
        notes: i.notes,
        customer: i.customer || customer,
        createdBy: req.user?.id,
      };
    });
  } catch (mkErr) {
    return res.status(400).json({ error: mkErr.message || 'Invalid item(s).' });
  }

  try {
    const docs = await Transaction.insertMany(docsToInsert, {
      ordered: false,
      runValidators: true,
    });

    // Decide label for email (never store 'Mixed' in DB)
    const uniqueMethods = Array.from(new Set(docs.map((d) => d.paymentMethod).filter(Boolean)));
    const summaryPaymentMethod = uniqueMethods.length > 1 ? 'Mixed' : (uniqueMethods[0] || 'Cash');

    // Build items for email (from saved docs so finalPrice is computed server-side)
    const emailItems = docs.map((d) => ({
      serviceName: d.serviceType,
      specialsName: d.specials,
      originalPrice: d.originalPrice,
      discountPercent: d.discountPercent,
      discountAmount: d.discountAmount,
      finalPrice: d.finalPrice,
    }));

    let emailSent = false;
    try {
      const to = await pickReceiptEmail({ email, customer });
      if (to) {
        const html = buildBatchReceiptHTML({
          customerName,
          vehicleDetails,
          paymentMethod: summaryPaymentMethod,
          items: emailItems,
        });

        let attachments;
        try {
          const pdfBuffer = await htmlToPdfBuffer(html);
          attachments = [{ filename: `Receipt-${new Date().toISOString().slice(0,10)}.pdf`, content: pdfBuffer }];
        } catch (pdfErr) {
          console.warn('PDF generation failed, sending email without attachment:', pdfErr?.message || pdfErr);
        }

        await safeSendEmail(to, 'Your JW Auto Clinic Receipt', html, { attachments });
        emailSent = true;
      } else {
        console.warn('Receipt email skipped: no valid email for customer/transaction.');
      }
    } catch (mailErr) {
      console.error('Email failed:', mailErr?.message || mailErr);
    }

    res.json({ ok: true, savedCount: docs.length, emailSent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Batch save failed.' });
  }
});


module.exports = router;
