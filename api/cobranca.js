const https = require('https');

const BLACKPAY_API_KEY = process.env.BLACKPAY_API_KEY || 'bp_live_d45dada58ad14e04fdb73c9fdff7f949b57d55d709e36ae0';
const BLACKPAY_HOST = 'blackpays.site';
const BLACKPAY_BASE_PATH = '/api/public/v1';

function parseAmountToCents(val) {
  if (typeof val === 'number') {
    const cents = val < 500 ? Math.round(val * 100) : Math.round(val);
    return Math.max(200, cents);
  }
  const raw = String(val || '20,00').replace(/[^\d.,]/g, '').trim();
  if (!raw) return 2000;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const floatVal = parseFloat(normalized);
  if (isNaN(floatVal) || floatVal <= 0) return 2000;
  return Math.max(200, Math.round(floatVal * 100));
}

function normalizeCreatePayload(body) {
  const b = (typeof body === 'string') ? JSON.parse(body || '{}') : (body || {});
  const amountCents = b.amountCents
    ? Math.max(200, Number(b.amountCents))
    : parseAmountToCents(b.amount || b.value || 20);

  const customerName = String(b.customerName || b.customer_name || b.name || 'Cliente Delivery').trim();
  const cleanPhone = String(b.customerPhone || b.customer_phone || b.phone || '11999999999').replace(/\D/g, '') || '11999999999';
  const customerDocument = String(b.customerDocument || b.customer_document || b.cpf || '00000000000').replace(/\D/g, '');
  const customerEmail = String(b.customerEmail || b.customer_email || b.email || `cliente.${cleanPhone}@gmail.com`).trim();
  const externalRef = String(b.externalRef || b.external_id || `ord_${Date.now()}`).slice(0, 100);
  const description = String(b.description || 'Serviços online').slice(0, 180);

  return {
    amountCents,
    description,
    customerName,
    customerEmail,
    customerPhone: cleanPhone,
    customerDocument,
    externalRef
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers && (req.headers['authorization'] || req.headers['Authorization']);
  const authToSend = (authHeader && authHeader.includes('bp_live_'))
    ? (authHeader.startsWith('Bearer ') ? authHeader : ('Bearer ' + authHeader))
    : ('Bearer ' + BLACKPAY_API_KEY);

  const id = req.query && (req.query.id || req.query.transaction_id);
  const method = req.method || 'GET';

  const apiPath = (method === 'GET' && id)
    ? `${BLACKPAY_BASE_PATH}/pix/${encodeURIComponent(id)}`
    : `${BLACKPAY_BASE_PATH}/pix`;

  let postData = null;
  if (method === 'POST') {
    try {
      const normalized = normalizeCreatePayload(req.body);
      postData = JSON.stringify(normalized);
    } catch (e) {
      postData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    }
  }

  return new Promise((resolve) => {
    const bpReq = https.request({
      hostname: BLACKPAY_HOST,
      path: apiPath,
      method: method,
      headers: {
        'Authorization': authToSend,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, (bpRes) => {
      let data = '';
      bpRes.on('data', chunk => { data += chunk; });
      bpRes.on('end', () => {
        res.status(bpRes.statusCode || 200);
        res.setHeader('Content-Type', 'application/json');

        try {
          const parsed = JSON.parse(data);
          // Garantir compatibilidade de campos tanto para BlackPay quanto legado
          if (parsed && (parsed.pixCopyPaste || parsed.id)) {
            const pixCode = parsed.pixCopyPaste || parsed.pix_code || parsed.brCode || '';
            const qrRaw = parsed.qrCodeBase64 || parsed.qr_code_base64 || '';
            const enriched = Object.assign({}, parsed, {
              pixCopyPaste: pixCode,
              pix_code: pixCode,
              brCode: pixCode,
              qrCodeBase64: qrRaw,
              qr_code_base64: qrRaw,
              paid_at: parsed.paidAt || parsed.paid_at || null
            });
            res.send(JSON.stringify(enriched));
            return resolve();
          }
        } catch (_) {}

        res.send(data);
        resolve();
      });
    });

    bpReq.on('error', (err) => {
      res.status(500).json({ error: err.message });
      resolve();
    });

    if (postData) bpReq.write(postData);
    bpReq.end();
  });
};
