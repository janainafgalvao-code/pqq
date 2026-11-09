const https = require('https');

const LULAPAY_TOKEN = 'gwk_8c48161980d826f31366e244407f21ff41caa3fa1c0c0416';
const LULAPAY_HOST = 'lulapay.onrender.com';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers && (req.headers['authorization'] || req.headers['Authorization']);
  const authToSend = (authHeader && authHeader.trim().length > 10) 
    ? (authHeader.startsWith('Bearer ') ? authHeader : ('Bearer ' + authHeader))
    : ('Bearer ' + LULAPAY_TOKEN);

  const id = req.query && req.query.id;
  const path = id 
    ? `/api/v1/cobranca.php?id=${encodeURIComponent(id)}` 
    : '/api/v1/cobranca.php';

  const method = req.method || 'GET';
  let postData = null;
  if (method === 'POST') {
    postData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  }

  return new Promise((resolve) => {
    const lulaReq = https.request({
      hostname: LULAPAY_HOST,
      path: path,
      method: method,
      headers: {
        'Authorization': authToSend,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, (lulaRes) => {
      let data = '';
      lulaRes.on('data', chunk => { data += chunk; });
      lulaRes.on('end', () => {
        res.status(lulaRes.statusCode || 200);
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
        resolve();
      });
    });

    lulaReq.on('error', (err) => {
      res.status(500).json({ error: err.message });
      resolve();
    });

    if (postData) lulaReq.write(postData);
    lulaReq.end();
  });
};
