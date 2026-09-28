const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

function cors(req, res) {
  const origin = req.headers.origin || '*';
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

exports.createPayment = onRequest({ secrets: [MP_ACCESS_TOKEN], cors: true }, async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const order = req.body?.order;
    if (!order?.id || !Array.isArray(order.items) || !order.items.length) {
      return res.status(400).json({ error: 'Pedido inválido.' });
    }

    const items = order.items.map((item) => ({
      id: String(item.id),
      title: String(item.name).slice(0, 256),
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.price) || 0,
      currency_id: 'BRL'
    }));

    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${protocol}://${host}`;

    const preference = {
      items,
      payer: { email: order.customerEmail },
      external_reference: order.id,
      notification_url: `${baseUrl}/api/mercadopago-webhook`,
      back_urls: {
        success: `${baseUrl}/?payment=success&external_reference=${encodeURIComponent(order.id)}`,
        failure: `${baseUrl}/?payment=failure&external_reference=${encodeURIComponent(order.id)}`,
        pending: `${baseUrl}/?payment=pending&external_reference=${encodeURIComponent(order.id)}`
      },
      auto_return: 'approved',
      metadata: { order_id: order.id }
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN.value()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preference)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Mercado Pago preference error:', data);
      return res.status(502).json({ error: 'Mercado Pago recusou a criação do pagamento.' });
    }

    return res.json({
      preference_id: data.id,
      init_point: data.init_point || data.sandbox_init_point
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno ao criar pagamento.' });
  }
});

exports.mercadopagoWebhook = onRequest({ secrets: [MP_ACCESS_TOKEN], cors: true }, async (req, res) => {
  cors(req, res);
  try {
    const type = req.body?.type || req.query?.type;
    const paymentId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id;
    if (type !== 'payment' || !paymentId) return res.status(200).send('ignored');

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN.value()}` }
    });
    const payment = await response.json();
    if (!response.ok) {
      console.error('Mercado Pago payment lookup error:', payment);
      return res.status(200).send('received');
    }

    const orderId = payment.external_reference || payment.metadata?.order_id;
    if (!orderId) return res.status(200).send('received');

    const ref = db.collection('app_state').doc('main');
    const snap = await ref.get();
    if (!snap.exists) return res.status(200).send('received');

    const state = snap.data();
    const orders = Array.isArray(state.orders) ? [...state.orders] : [];
    const index = orders.findIndex((o) => o.id === orderId);
    if (index === -1) return res.status(200).send('received');

    const statusMap = {
      approved: 'paid',
      pending: 'pending',
      in_process: 'pending',
      rejected: 'rejected',
      cancelled: 'canceled',
      refunded: 'refunded',
      charged_back: 'refunded'
    };

    const nextStatus = statusMap[payment.status] || 'pending';
    orders[index] = {
      ...orders[index],
      status: nextStatus,
      paymentStatus: payment.status || null,
      paymentId: String(payment.id),
      paymentMethod: payment.payment_method_id || 'mercado_pago',
      paidAt: payment.status === 'approved' ? new Date().toISOString() : orders[index].paidAt || null,
      paymentUpdatedAt: new Date().toISOString()
    };

    await ref.set({ orders, updatedAt: new Date().toISOString() }, { merge: true });
    return res.status(200).send('ok');
  } catch (error) {
    console.error(error);
    return res.status(500).send('error');
  }
});
