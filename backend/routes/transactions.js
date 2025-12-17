// routes/transactions
const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();

const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const authMiddleware = require('../middleware/authMiddleware');
const sendEmail = require('../utils/sendEmail');

// ---------------- Logo resolver ----------------
const fs = require('fs');
const path = require('path');

let LOGO_BASE64 = null;

function readAsBase64IfExists(p) {
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p).toString('base64');
  } catch (_) {}
  return '';
}

function getLogoBase64() {
  if (LOGO_BASE64 !== null) return LOGO_BASE64;

  const BACKEND_DIR = path.resolve(__dirname, '..');
  const REPO_ROOT = path.resolve(BACKEND_DIR, '..');
  const ENV_PATH = process.env.LOGO_RELATIVE_PATH || 'assets/images/icon.png';

  const candidates = [
    path.join(REPO_ROOT, ENV_PATH),
    path.join(REPO_ROOT, 'assets', 'images', 'icon.png'),
    path.join(REPO_ROOT, 'assets', 'images', 'logo.png'),
    path.join(process.cwd(), 'assets', 'images', 'icon.png'),
    path.join(process.cwd(), 'assets', 'images', 'logo.png'),
    path.join(BACKEND_DIR, 'assets', 'images', 'icon.png'),
    path.join(BACKEND_DIR, 'assets', 'images', 'logo.png'),
  ];

  for (const p of candidates) {
    const b64 = readAsBase64IfExists(p);
    if (b64) {
      LOGO_BASE64 = b64;
      return LOGO_BASE64;
    }
  }

  console.warn('⚠️ Logo not found for email header. Checked:', candidates);
  LOGO_BASE64 = '';
  return LOGO_BASE64;
}

function logoImgTag(heightPx = 40) {
  const b64 = getLogoBase64();
  return b64
    ? `<img src="data:image/png;base64,${b64}" alt="JW Auto Clinic 246" style="height:${heightPx}px;display:block" />`
    : `<span style="font-weight:700;font-size:18px">JW Auto Clinic 246</span>`;
}

// ---------------- Utils ----------------
const isEmail = (s = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
function currency(n) { return Number(n || 0).toFixed(2); }

function dataUrlToAttachment(dataUrl, filename = `Receipt-${new Date().toISOString().slice(0,10)}.pdf`) {
  if (!dataUrl) return null;
  // Accept either full data URL or raw base64
  const base64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl;
  try {
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length) return null;
    return {
      filename,
      content: buf,
      contentType: 'application/pdf',
    };
  } catch {
    return null;
  }
}

/**
 * Ensure a Customer exists; return the _id. Uses (name + vehicleDetails) uniqueness.
 * If customer id already provided, it is returned as-is (after basic sanity check).
 */
async function ensureCustomerId({ customer, customerName, email, phone }) {
  if (customer) return customer;

  const name = String(customerName || '').trim();
  const mail = String(email || '').trim().toLowerCase();
  if (!name && !mail) throw new Error('Customer name or email is required.');

  if (mail && isEmail(mail)) {
    const byEmail = await Customer.findOne({ email: mail }).lean();
    if (byEmail?._id) return byEmail._id;
  }

  if (name) {
    const byName = await Customer.findOne({ name }).lean();
    if (byName?._id) return byName._id;
  }

  const created = await Customer.create({
    name: name || 'Customer',
    email: isEmail(mail) ? mail : undefined,
    phone: (phone || '').trim() || undefined,
  });
  return created._id;
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

/** sendEmail wrapper (supports attachments via utils/sendEmail.js) */
async function safeSendEmail(to, subject, html, { attachments } = {}) {
  if (!isEmail(to)) throw new Error('No recipient address provided (missing/invalid).');
  return sendEmail({ to, subject, html, ...(attachments ? { attachments } : {}) });
}

// ---------------- Email HTML builders ----------------
function buildBatchReceiptHTML({ customerName, vehicleDetails, paymentMethod, items }) {
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  const money = (v) => Number(v || 0).toFixed(2);

  let subtotal = 0;
  let totalDiscount = 0;
  let grandTotal = 0;

  const rows = (items || []).map((i, idx) => {
    const op = n(i.originalPrice);
    const dp = n(i.discountPercent);
    const daRaw = n(i.discountAmount);
    // Prefer explicit discountAmount; otherwise compute from percent
    const dAmt = daRaw > 0 ? daRaw : (op * dp) / 100;

    // Prefer provided finalPrice if it’s a sane number; else compute
    const fp = Math.max(0, op - dAmt);

    subtotal += op;
    totalDiscount += (op - fp);
    grandTotal += fp;

    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${idx + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">
          ${i.serviceName}${i.specialsName ? ` (${i.specialsName})` : ''}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${money(op)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${dp}%</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${money(fp)}</td>
      </tr>
    `;
  }).join('');

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
          <strong>Subtotal:</strong> $${money(subtotal)}<br/>
          <strong>Discounts:</strong> −$${money(totalDiscount)}<br/>
          <strong>Total:</strong> $${money(grandTotal)}
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
  const da = Number(t.discountAmount) || 0;
  const dAmt = da > 0 ? da : (op * dp) / 100;
  const final = Math.max(0, op - dAmt);

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

// ---------------- Routes ----------------

// GET /api/transactions?customer=<id>&limit=25&cursor=<lastId>&from=2025-01-01&to=2025-12-31
router.get('/', async (req, res) => {
  try {
    const { customer, limit = '25', cursor, from, to } = req.query;

    const q = {};
    if (customer && mongoose.isValidObjectId(customer)) q.customer = new mongoose.Types.ObjectId(customer);

    if (from || to) {
      q.serviceDate = {};
      if (from) q.serviceDate.$gte = new Date(from);
      if (to)   q.serviceDate.$lte = new Date(to);
    }

    const pageSize = Math.min(100, Math.max(1, Number(limit) || 25));

    // Cursor on _id (newer first). If cursor is present, fetch items with _id < cursor.
    if (cursor && mongoose.isValidObjectId(cursor)) q._id = { $lt: new mongoose.Types.ObjectId(cursor) };

    const docs = await Transaction.find(q)
      .sort({ _id: -1 })         // newest first
      .limit(pageSize + 1)       // fetch one extra to know if there's a next page
      .populate('createdBy', 'name email')
      .populate('customer');

    const hasMore = docs.length > pageSize;
    const items   = hasMore ? docs.slice(0, pageSize) : docs;
    const nextCursor = hasMore ? String(items[items.length - 1]._id) : null;

    res.json({ items, nextCursor });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});


// GET /api/transactions/vehicles?customer=<id>&limit=50
router.get('/vehicles', authMiddleware, async (req, res) => {
  try {
    const { customer, limit = '50' } = req.query;
    if (!customer || !mongoose.isValidObjectId(customer)) {
      return res.status(400).json({ error: 'customer is required' });
    }

    const rows = await Transaction.aggregate([
      { $match: {
          customer: new mongoose.Types.ObjectId(customer),
          vehicleDetails: { $type: 'string', $ne: '' }
        }},
      { $group: { _id: '$vehicleDetails', last: { $max: '$serviceDate' } } },
      { $sort: { last: -1 } },
      { $limit: Math.min(200, Number(limit) || 50) },
    ]);

    res.json(rows.map(r => r._id)); // strict string[]
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});



// POST single (ensures customer, attaches client PDF if provided)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { finalPrice, receiptPdfBase64, receiptFileName, ...rest } = req.body;

    // Ensure customer
    const customerId = await ensureCustomerId({
      customer: rest.customer,
      customerName: rest.customerName,
      vehicleDetails: rest.vehicleDetails,
      email: rest.email,
      phone: rest.phone,
    });

    if (!rest.paymentMethod) {
      return res.status(400).json({ error: 'Payment method is required' });
    }

    const transactionData = { ...rest, customer: customerId, createdBy: req.user.id };
    const newTransaction = await Transaction.create(transactionData);

    // Email (HTML + optional attached PDF from client)
    let emailSent = false;
    try {
      const to = await pickReceiptEmail({ email: newTransaction.email, customer: newTransaction.customer });
      if (to) {
        const html = buildSingleReceiptHTML(newTransaction);
        const att = dataUrlToAttachment(receiptPdfBase64, receiptFileName);
        await safeSendEmail(to, 'Your JW Auto Clinic Receipt', html, { attachments: att ? [att] : undefined });
        emailSent = true;
      }
    } catch (mailErr) {
      console.error('Email failed:', mailErr?.message || mailErr);
    }

    res.status(201).json({ ...newTransaction.toObject(), emailSent });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to save transaction' });
  }
});

// DELETE one
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await Transaction.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to delete' });
  }
});


// --- add near top (helpers) ---
const VALID_PAYMENT_METHODS = ['Cash', 'Mobile Payment'];

const toNumber = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const parseServiceDate = (v) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d; // undefined lets schema default
};


// POST batch (ensures customer, attaches client PDF if provided)
router.post('/batch', authMiddleware, async (req, res) => {
  const {
    customerName,
    email,
    vehicleDetails,
    paymentMethod,    // header-level fallback
    customer,
    items,
    receiptPdfBase64,
    receiptFileName,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items to save.' });
  }

  try {
    // Ensure (or create) a customer id
    const customerId = await ensureCustomerId({
      customer,
      customerName,
      vehicleDetails,
      email,
      phone: req.body.phone,
    });

    // Build docs with valid per-item payment method + optional per-item serviceDate
    const docsToInsert = items.map((i, idx) => {
      const pmRaw = i.paymentMethod || paymentMethod || 'Cash';
      const pm = VALID_PAYMENT_METHODS.includes(pmRaw) ? pmRaw : 'Cash';
      if (pm !== pmRaw) {
        console.warn(`Invalid payment method on item ${idx}; defaulting to Cash:`, pmRaw);
      }

      // Optional service date per item (falls back to schema default if invalid/absent)
      const sd = parseServiceDate(i.serviceDate);

      // If no notes provided, auto-fill with a concise item detail line
      const userNotes = (i.notes ?? '').toString().trim();
      const autoNotes =
        `Item #${idx + 1}: ${i.serviceName}` +
        (i.specialsName ? ` (${i.specialsName})` : '') +
        ` • $${toNumber(i.originalPrice).toFixed(2)} • Disc ${toNumber(i.discountPercent)}%` +
        (toNumber(i.discountAmount) ? ` + $${toNumber(i.discountAmount).toFixed(2)}` : '');

      return {
        customerName,
        email,
        vehicleDetails,
        serviceType: i.serviceName,
        specials: i.specialsName || null,
        paymentMethod: pm,
        originalPrice: toNumber(i.originalPrice),
        discountPercent: toNumber(i.discountPercent),
        discountAmount: toNumber(i.discountAmount),
        notes: userNotes || autoNotes,         // ← ensures notes carry item details
        ...(sd ? { serviceDate: sd } : {}),    // ← include only if valid
        customer: customerId,
        createdBy: req.user?.id,
      };
    });

    // Filter out any obviously invalid rows (missing required strings/numbers)
    const filtered = docsToInsert.filter(d =>
      d.customerName && d.vehicleDetails && d.serviceType && d.paymentMethod &&
      typeof d.originalPrice !== 'undefined'
    );

    if (filtered.length === 0) {
      return res.status(400).json({ error: 'No valid items to save (missing required fields).' });
    }

    const docs = await Transaction.insertMany(filtered, {
      ordered: false,
      runValidators: true,
    });

    const savedCount = docs.length;

    // Email
    let emailSent = false;
    try {
      const to = await pickReceiptEmail({ email, customer: customerId });
      if (to) {
        // Build email summary from what was saved (accurate finals computed by schema)
        const emailItems = docs.map((d) => ({
          serviceName: d.serviceType,
          specialsName: d.specials,
          originalPrice: d.originalPrice,
          discountPercent: d.discountPercent,
          discountAmount: d.discountAmount,
          finalPrice: d.finalPrice,
        }));

        // Decide label for email (never save 'Mixed' in DB)
        const uniqueMethods = Array.from(new Set(docs.map((d) => d.paymentMethod).filter(Boolean)));
        const summaryPaymentMethod = uniqueMethods.length > 1 ? 'Mixed' : (uniqueMethods[0] || 'Cash');

        const html = buildBatchReceiptHTML({
          customerName,
          vehicleDetails,
          paymentMethod: summaryPaymentMethod,
          items: emailItems,
        });

        // Prefer the client-provided PDF
        const att = dataUrlToAttachment(receiptPdfBase64, receiptFileName);
        await safeSendEmail(to, 'Your JW Auto Clinic Receipt', html, { attachments: att ? [att] : undefined });
        emailSent = true;
      }
    } catch (mailErr) {
      console.error('Email failed:', mailErr?.message || mailErr);
    }

    // If nothing saved, do NOT pretend success
    if (!savedCount) {
      return res.status(400).json({ error: 'No transactions were saved.' });
    }

    res.json({ ok: true, savedCount, emailSent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err?.message || 'Batch save failed.' });
  }
});

module.exports = router;
