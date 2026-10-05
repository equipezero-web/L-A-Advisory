const cors = {
  'Access-Control-Allow-Origin': 'https://equipezero-web.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers: cors });

  const token = Deno.env.get('MP_' + 'ACCESS_TOKEN');
  if (!token) return new Response(JSON.stringify({ error: 'Mercado Pago não configurado.' }), { status: 500, headers: cors });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return new Response(JSON.stringify({ error: 'JSON inválido.' }), { status: 400, headers: cors });

  const total = Number(body.total);
  const title = String(body.title || 'Produto').slice(0, 256);
  const email = String(body.email || '').trim().toLowerCase();

  if (!Number.isFinite(total) || total <= 0 || !email) {
    return new Response(JSON.stringify({ error: 'total e email são obrigatórios.' }), { status: 400, headers: cors });
  }

  const idempotency = crypto.randomUUID();
  const externalReference = 'LA' + idempotency.replaceAll('-', '');

  const mp = await fetch('https://api.mercadopago.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Idempotency-Key': idempotency
    },
    body: JSON.stringify({
      type: 'online',
      processing_mode: 'manual',
      total_amount: total.toFixed(2),
      external_reference: externalReference,
      payer: { email },
      config: {
        online: {
          success_url: 'https://equipezero-web.github.io/L-A-Advisory/',
          failure_url: 'https://equipezero-web.github.io/L-A-Advisory/',
          pending_url: 'https://equipezero-web.github.io/L-A-Advisory/',
          auto_return: 'approved'
        }
      },
      items: [{
        title,
        unit_price: total.toFixed(2),
        quantity: 1
      }]
    })
  });

  const rawResponse = await mp.text();
  let data = {};
  try { data = rawResponse ? JSON.parse(rawResponse) : {}; } catch (_) { data = { raw_response: rawResponse }; }

  if (!mp.ok || !data.checkout_url) {
    console.error('Mercado Pago rejeitou a Order:', {
      status: mp.status,
      message: data.message || data.error || null,
      error_code: data.error_code || data.code || null
    });

    return new Response(JSON.stringify({
      error: 'Mercado Pago recusou a order.',
      status: mp.status,
      message: data.message || data.error || null,
      cause: data.cause || null,
      error_code: data.error_code || data.code || null,
      details: data.details || data.errors || null,
      debug: data
    }), { status: 502, headers: cors });
  }

  console.log('Mercado Pago Order criada:', {
    order_id: data.id,
    external_reference: externalReference,
    status: data.status || null
  });

  return new Response(JSON.stringify({
    ok: true,
    order_id: data.id,
    checkout_url: data.checkout_url
  }), { status: 200, headers: cors });
});