const cors = {
  'Access-Control-Allow-Origin': 'https://equipezero-web.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método não permitido.' }),
      { status: 405, headers: cors }
    );
  }

  const token = Deno.env.get('MP_' + 'ACCESS_TOKEN');

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Mercado Pago não configurado.' }),
      { status: 500, headers: cors }
    );
  }

  const body = await req.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return new Response(
      JSON.stringify({ error: 'JSON inválido.' }),
      { status: 400, headers: cors }
    );
  }

  const total = Number(body.total);
  const title = String(body.title || 'Produto').slice(0, 256);
  const email = String(body.email || '').trim().toLowerCase();

  const firstName = String(
    body.first_name || body.firstName || ''
  ).trim().slice(0, 100);

  const lastName = String(
    body.last_name || body.lastName || ''
  ).trim().slice(0, 100);

  const identificationType = String(
    body.identification_type || body.identificationType || ''
  ).trim().toUpperCase().slice(0, 10);

  const identificationNumber = String(
    body.identification_number || body.identificationNumber || ''
  ).replace(/\D/g, '').slice(0, 30);

  const phoneAreaCode = String(
    body.phone_area_code || body.phoneAreaCode || ''
  ).replace(/\D/g, '').slice(0, 5);

  const phoneNumber = String(
    body.phone_number || body.phoneNumber || ''
  ).replace(/\D/g, '').slice(0, 15);

  const registrationDate = String(
    body.registration_date || body.registrationDate || ''
  ).trim();

  if (!Number.isFinite(total) || total <= 0 || !email) {
    return new Response(
      JSON.stringify({
        error: 'total e email são obrigatórios.'
      }),
      { status: 400, headers: cors }
    );
  }

  const idempotency = crypto.randomUUID();

  const externalReference =
    'LA' + idempotency.replaceAll('-', '');

  const payer: Record<string, unknown> = {
    email
  };

  if (firstName) {
    payer.first_name = firstName;
  }

  if (lastName) {
    payer.last_name = lastName;
  }

  if (identificationType && identificationNumber) {
    payer.identification = {
      type: identificationType,
      number: identificationNumber
    };
  }

  if (phoneAreaCode && phoneNumber) {
    payer.phone = {
      area_code: phoneAreaCode,
      number: phoneNumber
    };
  }

  const additionalPayer: Record<string, unknown> = {
    is_first_purchase_online: true
  };

  if (registrationDate) {
    additionalPayer.registration_date = registrationDate;
  }

  const mp = await fetch(
    'https://api.mercadopago.com/v1/orders',
    {
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

        description: title,

        payer,

        config: {
          statement_descriptor: 'LA ROYAL ADVISORY',

          online: {
            success_url:
              'https://equipezero-web.github.io/L-A-Advisory/',

            failure_url:
              'https://equipezero-web.github.io/L-A-Advisory/',

            pending_url:
              'https://equipezero-web.github.io/L-A-Advisory/',

            auto_return: 'approved'
          }
        },

        additional_info: {
          payer: additionalPayer
        },

        items: [
          {
            title,
            description: title,
            external_code: 'LA-PRODUTO',
            category_id: 'other',
            unit_price: total.toFixed(2),
            quantity: 1
          }
        ]
      })
    }
  );

  const rawResponse = await mp.text();

  let data: any = {};

  try {
    data = rawResponse
      ? JSON.parse(rawResponse)
      : {};
  } catch (_) {
    data = {
      raw_response: rawResponse
    };
  }

  if (!mp.ok || !data.checkout_url) {
    console.error(
      'Mercado Pago rejeitou a Order:',
      {
        status: mp.status,
        message:
          data.message ||
          data.error ||
          null,

        error_code:
          data.error_code ||
          data.code ||
          null
      }
    );

    return new Response(
      JSON.stringify({
        error: 'Mercado Pago recusou a order.',

        status: mp.status,

        message:
          data.message ||
          data.error ||
          null,

        cause:
          data.cause ||
          null,

        error_code:
          data.error_code ||
          data.code ||
          null,

        details:
          data.details ||
          data.errors ||
          null,

        debug: data
      }),
      {
        status: 502,
        headers: cors
      }
    );
  }

  console.log(
    'Mercado Pago Order criada:',
    {
      order_id: data.id,

      external_reference:
        externalReference,

      status:
        data.status ||
        null
    }
  );

  return new Response(
    JSON.stringify({
      ok: true,

      order_id: data.id,

      checkout_url:
        data.checkout_url
    }),
    {
      status: 200,
      headers: cors
    }
  );
});
