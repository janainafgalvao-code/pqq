/**
 * BlackPay Gateway Integration & Configurações da Aplicação
 * API Oficial: https://blackpays.site/api/public/v1
 * Integração direta e via Vercel Serverless para funcionamento 100% no Vercel
 */
(function() {
  const BLACKPAY_API_KEY = 'bp_live_d45dada58ad14e04fdb73c9fdff7f949b57d55d709e36ae0';
  const BLACKPAY_CREATE_ENDPOINTS = [
    '/api/cobranca',
    '/api/blackpay/pix',
    'https://blackpays.site/api/public/v1/pix'
  ];

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
      sessionStorage.setItem('blackpay_tx_' + orderId, txId);
      sessionStorage.setItem('blackpay_last_tx', txId);
      sessionStorage.setItem('lulapay_tx_' + orderId, txId);
      sessionStorage.setItem('lulapay_last_tx', txId);
      sessionStorage.setItem('unipay_tx_' + orderId, txId);
      sessionStorage.setItem('unipay_last_tx', txId);
      sessionStorage.setItem('techbynet_tx_' + orderId, txId);
      sessionStorage.setItem('techbynet_last_tx', txId);
    } catch (_) {}
  }

  function getTxId(orderId) {
    try {
      return (
        sessionStorage.getItem('blackpay_tx_' + orderId) ||
        sessionStorage.getItem('blackpay_last_tx') ||
        sessionStorage.getItem('lulapay_tx_' + orderId) ||
        sessionStorage.getItem('lulapay_last_tx') ||
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

    // 3. Gerar PIX via BlackPay
    if (url.includes('/api/payments/create-pix')) {
      try {
        let reqData = {};
        if (init && init.body) {
          try { reqData = JSON.parse(init.body); } catch (_) {}
        }

        const pixStored = getStoredJson('pixCheckoutData');
        const checkoutStored = getStoredJson('checkoutData');

        const rawAmount = reqData.amount || pixStored.total || lastOrderData.total || 10;
        let amountReais = 10;
        if (typeof rawAmount === 'number') {
          amountReais = (rawAmount > 500) ? (rawAmount / 100) : rawAmount;
        } else if (typeof rawAmount === 'string') {
          const p = parseFloat(rawAmount.replace('R$', '').replace(/\s/g, '').replace(',', '.'));
          if (!isNaN(p) && p > 0) amountReais = (p > 500) ? (p / 100) : p;
        }
        amountReais = Math.round(amountReais * 100) / 100;
        if (amountReais < 2) amountReais = 2;
        const amountCents = Math.max(200, Math.round(amountReais * 100));

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

        const blackpayPayload = {
          amountCents: amountCents,
          description: 'Serviços online',
          customerName: customerName,
          customerEmail: customerEmail,
          customerPhone: cleanPhone,
          customerDocument: cpf,
          externalRef: String(orderId).slice(0, 100)
        };

        let bpData = null;
        let lastError = null;

        // Tentar endpoints disponíveis
        for (let i = 0; i < BLACKPAY_CREATE_ENDPOINTS.length; i++) {
          const ep = BLACKPAY_CREATE_ENDPOINTS[i];
          try {
            const headers = {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + BLACKPAY_API_KEY
            };

            const res = await originalFetch(ep, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(blackpayPayload)
            });

            if (res.ok) {
              const parsed = await res.json().catch(function() { return null; });
              const pixCandidate = parsed && (
                parsed.pixCopyPaste ||
                parsed.pix_code ||
                parsed.brCode ||
                parsed.qrCode ||
                (parsed.data && parsed.data.paymentData && parsed.data.paymentData.copyPaste)
              );
              if (parsed && (parsed.id || pixCandidate)) {
                bpData = parsed;
                break;
              }
            } else {
              const errJson = await res.json().catch(function() { return {}; });
              lastError = (errJson && (errJson.error || errJson.message)) || ('HTTP ' + res.status);
            }
          } catch (err) {
            lastError = err.message;
          }
        }

        console.log('[BlackPay Gateway] Resposta de criação:', bpData || lastError);

        if (bpData) {
          const txId = bpData.id || (bpData.data && bpData.data.id) || orderId;
          const pixCode =
            bpData.pixCopyPaste ||
            bpData.pix_code ||
            bpData.brCode ||
            bpData.copy_paste ||
            bpData.code ||
            (bpData.data && bpData.data.paymentData && bpData.data.paymentData.copyPaste) ||
            '';
          const qrRaw =
            bpData.qrCodeBase64 ||
            bpData.qr_code_base64 ||
            (bpData.data && bpData.data.paymentData && bpData.data.paymentData.qrCodeBase64) ||
            '';

          let qrImg = '';
          if (qrRaw) {
            qrImg = qrRaw.startsWith('data:')
              ? qrRaw
              : ('data:image/png;base64,' + qrRaw);
          } else if (pixCode) {
            qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=0&data=' + encodeURIComponent(pixCode);
          }

          if (pixCode) {
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
              pixCopyPaste: pixCode,
              expiresAt: bpData.expiresAt || null,
              amount: amountReais
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }

        throw new Error(lastError || 'Erro ao gerar PIX na BlackPay');
      } catch (err) {
        console.error('[BlackPay Gateway] Erro na chamada:', err);
        return new Response(JSON.stringify({ error: err.message || 'Falha na BlackPay' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 4. Verificar Status do Pagamento via BlackPay
    if (url.includes('/api/payments/check-status')) {
      try {
        const urlObj = new URL(url, window.location.origin);
        const orderId = urlObj.searchParams.get('orderId');
        const txId = getTxId(orderId);

        if (txId) {
          let checkData = null;

          const checkEndpoints = [
            '/api/cobranca?id=' + encodeURIComponent(txId),
            '/api/blackpay/pix/' + encodeURIComponent(txId),
            'https://blackpays.site/api/public/v1/pix/' + encodeURIComponent(txId)
          ];

          for (let j = 0; j < checkEndpoints.length; j++) {
            const cEp = checkEndpoints[j];
            try {
              const headers = {
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + BLACKPAY_API_KEY
              };

              const checkRes = await originalFetch(cEp, {
                method: 'GET',
                headers: headers,
                cache: 'no-store'
              });

              if (checkRes.ok) {
                const parsed = await checkRes.json().catch(function() { return null; });
                if (parsed && (parsed.status || (parsed.data && parsed.data.status))) {
                  checkData = parsed;
                  break;
                }
              }
            } catch (_) {}
          }

          const st = String((checkData && (checkData.status || (checkData.data && checkData.data.status))) || '').toLowerCase();
          const isPaid = ['paid', 'pago', 'completed', 'approved', 'confirmed', 'captured'].indexOf(st) !== -1 || !!(checkData && (checkData.paidAt || checkData.paid_at));
          const isExpired = ['expired', 'failed', 'refunded', 'canceled', 'cancelled'].indexOf(st) !== -1;

          return new Response(JSON.stringify({
            orderId: orderId,
            paymentStatus: isPaid ? 'PAID' : (isExpired ? 'EXPIRED' : 'PENDING'),
            status: isPaid ? 'PAID' : (isExpired ? 'EXPIRED' : (st.toUpperCase() || 'PENDING')),
            paid: isPaid,
            isPaid: isPaid
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (err) {
        console.error('[BlackPay Gateway] Erro ao consultar status:', err);
      }

      return new Response(JSON.stringify({ orderId: '', paymentStatus: 'PENDING' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return originalFetch.apply(this, arguments);
  };

  console.log('[BlackPay Gateway] Integrado e ativo com sucesso.');
})();
