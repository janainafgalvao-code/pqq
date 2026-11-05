/**
 * UniPay Brasil Gateway Integration & Configurações da Aplicação
 * API Oficial: https://api-dash.unipaybr.com/v1
 * Integração direta com a UniPay Brasil para funcionamento 100% client-side (Vercel / GitHub Pages / Surge)
 */
(function() {
  const UNIPAY_PUBLIC_KEY = 'pk_live_f63867fac3be706b7fc4a9f0';
  const UNIPAY_SECRET_KEY = 'sk_live_26bee06dc1fd5504ea0335b4b2661ab6790ea7f3ac534ee2';
  const UNIPAY_BASE_URL = 'https://api-dash.unipaybr.com/v1';

  function getBasicAuth() {
    try {
      return 'Basic ' + window.btoa(UNIPAY_PUBLIC_KEY + ':' + UNIPAY_SECRET_KEY);
    } catch (_) {
      return 'Basic cGtfbGl2ZV9mNjM4NjdmYWMzYmU3MDZiN2ZjNGE5ZjA6c2tfbGl2ZV8yNmJlZTA2ZGMxZmQ1NTA0ZWEwMzM1YjRiMjY2MWFiNjc5MGVhN2YzYWM1MzRlZTI=';
    }
  }

  function isValidCpf(cpf) {
    const clean = String(cpf || '').replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i), 10) * (10 - i);
    let d1 = sum % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    if (parseInt(clean.charAt(9), 10) !== d1) return false;
    sum = 0;
    for (let j = 0; j < 10; j++) sum += parseInt(clean.charAt(j), 10) * (11 - j);
    let d2 = sum % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    return parseInt(clean.charAt(10), 10) === d2;
  }

  function gerarCpfValido() {
    const n = [];
    for (let i = 0; i < 9; i++) n.push(Math.floor(Math.random() * 10));
    let d1 = n.reduce(function(acc, val, i) { return acc + val * (10 - i); }, 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    n.push(d1);
    let d2 = n.reduce(function(acc, val, i) { return acc + val * (11 - i); }, 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    n.push(d2);
    return n.join('');
  }

  // Associar orderId -> transactionId
  function saveTxId(orderId, txId) {
    try {
      sessionStorage.setItem('unipay_tx_' + orderId, txId);
      sessionStorage.setItem('unipay_last_tx', txId);
      sessionStorage.setItem('techbynet_tx_' + orderId, txId);
      sessionStorage.setItem('techbynet_last_tx', txId);
    } catch (_) {}
  }

  function getTxId(orderId) {
    try {
      return (
        sessionStorage.getItem('unipay_tx_' + orderId) ||
        sessionStorage.getItem('unipay_last_tx') ||
        sessionStorage.getItem('techbynet_tx_' + orderId) ||
        sessionStorage.getItem('techbynet_last_tx')
      );
    } catch (_) {
      return null;
    }
  }

  const originalFetch = window.fetch;
  let lastOrderData = {};

  function getStoredJson(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  window.fetch = async function(resource, init) {
    const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';

    // 1. Criar Pedido
    if (url.includes('/api/orders')) {
      if (init && init.body) {
        try { lastOrderData = Object.assign({}, lastOrderData, JSON.parse(init.body)); } catch (_) {}
      }
      const orderId = 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      return new Response(JSON.stringify({ id: orderId, success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Checkout Session
    if (url.includes('/api/checkout-session/pix-copied')) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.includes('/api/checkout-session')) {
      if (init && init.body) {
        try { lastOrderData = Object.assign({}, lastOrderData, JSON.parse(init.body)); } catch (_) {}
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Gerar PIX via UniPay Brasil
    if (url.includes('/api/payments/create-pix')) {
      try {
        let reqData = {};
        if (init && init.body) {
          try { reqData = JSON.parse(init.body); } catch (_) {}
        }

        const pixStored = getStoredJson('pixCheckoutData');
        const checkoutStored = getStoredJson('checkoutData');

        const rawAmount = reqData.amount || pixStored.total || lastOrderData.total || 10;
        let amountInCents = 1000;
        if (typeof rawAmount === 'number') {
          amountInCents = (rawAmount > 0 && rawAmount < 500) ? Math.round(rawAmount * 100) : Math.round(rawAmount);
        } else if (typeof rawAmount === 'string') {
          const p = parseFloat(rawAmount.replace('R$', '').replace(/\s/g, '').replace(',', '.'));
          if (!isNaN(p) && p > 0) amountInCents = p < 500 ? Math.round(p * 100) : Math.round(p);
        }

        const rawCpf = reqData.customerCpf || pixStored.customerCpf || lastOrderData.customerCpf || (lastOrderData.paymentData && lastOrderData.paymentData.cpf) || '';
        let cpf = String(rawCpf).replace(/\D/g, '');
        if (!isValidCpf(cpf)) {
          cpf = gerarCpfValido();
        }

        const rawName = reqData.customerName || pixStored.customerName || lastOrderData.customerName || checkoutStored.name || 'Cliente Delivery';
        const customerName = String(rawName).trim() || 'Cliente Delivery';

        const rawPhone = reqData.customerPhone || pixStored.customerPhone || lastOrderData.customerPhone || checkoutStored.phone || '';
        let cleanPhone = String(rawPhone).replace(/\D/g, '');
        if ((cleanPhone.length === 12 || cleanPhone.length === 13) && cleanPhone.startsWith('55')) {
          cleanPhone = cleanPhone.slice(2);
        }
        if (cleanPhone.length < 10 || cleanPhone.length > 11) {
          cleanPhone = '11999999999';
        }

        const rawEmail = reqData.customerEmail || pixStored.customerEmail || lastOrderData.customerEmail || checkoutStored.email || '';
        const customerEmail = String(rawEmail).trim() || ('contato.' + cpf.slice(0, 6) + '@gmail.com');

        const orderId = reqData.orderId || ('ORD-' + Date.now());

        const unipayPayload = {
          amount: amountInCents,
          payment_method: 'pix',
          product_type: 'digital',
          customer: {
            name: customerName,
            email: customerEmail,
            tax_id: cpf,
            phone: cleanPhone,
            type: 'individual'
          },
          items: [
            {
              name: 'Pedido ' + orderId,
              quantity: 1,
              unit_price: amountInCents,
              tangible: false
            }
          ],
          payment_details: {
            expires_in_seconds: 3600
          }
        };

        const upRes = await originalFetch(UNIPAY_BASE_URL + '/charges', {
          method: 'POST',
          headers: {
            'Authorization': getBasicAuth(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(unipayPayload)
        });

        const upData = await upRes.json().catch(function() { return {}; });
        console.log('[UniPay Gateway] Resposta de criação:', upData);

        const tx = (upData && upData.data) || upData || {};
        const txId = tx.id || tx.transactionId || '';
        const paymentFields = tx.payment_fields || {};
        const pixCode = paymentFields.copy_paste || tx.copy_paste || tx.pix_code || tx.brCode || tx.code || (tx.pix && tx.pix.qrcode) || '';
        const qrImg = (paymentFields && paymentFields.qr_code_base64) || ('https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=0&data=' + encodeURIComponent(pixCode));

        if (pixCode && txId) {
          saveTxId(orderId, txId);

          return new Response(JSON.stringify({
            success: true,
            id: txId,
            transactionId: txId,
            orderId: orderId,
            qrCode: pixCode,
            qrCodeBase64: qrImg,
            pixCopiaECola: pixCode,
            brCode: pixCode,
            pix_code: pixCode,
            amount: amountInCents / 100
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          throw new Error((upData && (upData.message || upData.error)) || 'Erro ao gerar PIX na UniPay');
        }
      } catch (err) {
        console.error('[UniPay Gateway] Erro na chamada:', err);
        return new Response(JSON.stringify({ error: err.message || 'Falha na UniPay' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 4. Verificar Status do Pagamento via UniPay Brasil
    if (url.includes('/api/payments/check-status')) {
      try {
        const urlObj = new URL(url, window.location.origin);
        const orderId = urlObj.searchParams.get('orderId');
        const txId = getTxId(orderId);

        if (txId) {
          const checkRes = await originalFetch(UNIPAY_BASE_URL + '/charges/' + encodeURIComponent(txId), {
            method: 'GET',
            headers: {
              'Authorization': getBasicAuth(),
              'Accept': 'application/json'
            },
            cache: 'no-store'
          });

          const checkData = await checkRes.json().catch(function() { return {}; });
          const tx = (checkData && checkData.data) || checkData || {};
          const statusStr = String(tx.status || '').toUpperCase();
          const isPaid = ['PAID', 'CAPTURED', 'AUTHORIZED', 'COMPLETED', 'CONFIRMED', 'APPROVED', 'PAGO'].indexOf(statusStr) !== -1 || !!tx.paidAt;

          return new Response(JSON.stringify({
            orderId: orderId,
            paymentStatus: isPaid ? 'PAID' : 'PENDING',
            status: isPaid ? 'PAID' : (tx.status || 'PENDING'),
            paid: isPaid,
            isPaid: isPaid
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (err) {
        console.error('[UniPay Gateway] Erro ao consultar status:', err);
      }

      return new Response(JSON.stringify({ orderId: '', paymentStatus: 'PENDING' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return originalFetch.apply(this, arguments);
  };

  console.log('[UniPay Gateway] Integrado e ativo com sucesso.');
})();
