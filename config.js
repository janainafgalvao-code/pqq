/**
 * TechBynet Gateway Integration & Configurações da Aplicação
 * Integração direta com a TechBynet para funcionamento 100% no Surge
 */
(function() {
  const TECHBYNET_KEY = 'f3496353-b145-431a-91ac-1e47968b5b6f';
  const TECHBYNET_BASE_URL = 'https://api-gateway.techbynet.com/api/user/transactions';

  // Associar orderId -> transactionId
  function saveTxId(orderId, txId) {
    try {
      sessionStorage.setItem('techbynet_tx_' + orderId, txId);
      sessionStorage.setItem('techbynet_last_tx', txId);
    } catch (_) {}
  }

  function getTxId(orderId) {
    try {
      return sessionStorage.getItem('techbynet_tx_' + orderId) || sessionStorage.getItem('techbynet_last_tx');
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

    // 3. Gerar PIX via TechBynet
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
          let p = parseFloat(rawAmount.replace('R$', '').replace(/\s/g, '').replace(',', '.'));
          if (!isNaN(p) && p > 0) amountInCents = p < 500 ? Math.round(p * 100) : Math.round(p);
        }

        const rawCpf = reqData.customerCpf || pixStored.customerCpf || lastOrderData.customerCpf || (lastOrderData.paymentData && lastOrderData.paymentData.cpf) || '';
        let cpf = String(rawCpf).replace(/\D/g, '');
        if (cpf.length !== 11) cpf = '07580365316';

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
        const customerEmail = String(rawEmail).trim() || ('contato.' + cpf.slice(0, 5) + '@delivery.com');

        const orderId = reqData.orderId || ('ORD-' + Date.now());

        const techbynetPayload = {
          amount: amountInCents,
          paymentMethod: 'PIX',
          customer: {
            name: customerName,
            email: customerEmail,
            document: {
              number: cpf,
              type: 'CPF'
            },
            phone: cleanPhone
          },
          items: [
            {
              title: 'Pedido ' + orderId,
              unitPrice: amountInCents,
              quantity: 1,
              tangible: false
            }
          ],
          pix: {
            expiresInDays: 1
          }
        };

        const tbRes = await originalFetch(TECHBYNET_BASE_URL, {
          method: 'POST',
          headers: {
            'x-api-key': TECHBYNET_KEY,
            'User-Agent': 'AtivoB2B/1.0',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(techbynetPayload)
        });

        const tbData = await tbRes.json();
        console.log('[TechBynet Gateway] Resposta de criação:', tbData);

        const tx = (tbData && tbData.data) || tbData;
        const txId = tx && tx.id;
        const pixCode = (tx && (tx.qrCode || (tx.pix && tx.pix.qrcode))) || '';

        if (pixCode && txId) {
          saveTxId(orderId, txId);

          return new Response(JSON.stringify({
            success: true,
            id: txId,
            transactionId: txId,
            orderId: orderId,
            qrCode: pixCode,
            brCode: pixCode,
            pix_code: pixCode,
            amount: amountInCents / 100
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          throw new Error((tbData && (tbData.message || tbData.error)) || 'Erro ao gerar PIX na TechBynet');
        }
      } catch (err) {
        console.error('[TechBynet Gateway] Erro na chamada:', err);
        return new Response(JSON.stringify({ error: err.message || 'Falha na TechBynet' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 4. Verificar Status do Pagamento via TechBynet
    if (url.includes('/api/payments/check-status')) {
      try {
        const urlObj = new URL(url, window.location.origin);
        const orderId = urlObj.searchParams.get('orderId');
        const txId = getTxId(orderId);

        if (txId) {
          const checkRes = await originalFetch(TECHBYNET_BASE_URL + '/' + encodeURIComponent(txId) + '/summary', {
            method: 'GET',
            headers: {
              'x-api-key': TECHBYNET_KEY,
              'User-Agent': 'AtivoB2B/1.0'
            }
          });

          const checkData = await checkRes.json();
          const tx = (checkData && checkData.data) || checkData || {};
          const statusStr = String(tx.status || '').toUpperCase();
          const isPaid = statusStr === 'PAID' || statusStr === 'APPROVED' || statusStr === 'COMPLETED' || !!tx.paidAt;

          return new Response(JSON.stringify({
            orderId: orderId,
            paymentStatus: isPaid ? 'PAID' : 'PENDING',
            status: tx.status
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (err) {
        console.error('[TechBynet Gateway] Erro ao consultar status:', err);
      }

      return new Response(JSON.stringify({ orderId: '', paymentStatus: 'PENDING' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return originalFetch.apply(this, arguments);
  };

  console.log('[TechBynet Gateway] Integrado e ativo com sucesso.');
})();
