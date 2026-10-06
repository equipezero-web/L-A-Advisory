import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': 'https://equipezero-web.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: cors
  });
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function generateCode(prefix: string): string {
  return prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
}

function normalizeCpf(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf(value: unknown): boolean {
  const cpf = normalizeCpf(value);

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);

  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);

  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;

  return digit === Number(cpf[10]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const token = Deno.env.get('MP_' + 'ACCESS_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';

  const secretKeys = JSON.parse(
    Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'
  );

  const serviceKey =
    secretKeys['default'] ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    '';

  const publishableKeys = JSON.parse(
    Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}'
  );

  const publishableKey =
    publishableKeys['default'] ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    '';

  if (!token || !supabaseUrl || !serviceKey || !publishableKey) {
    return json(
      { error: 'Servidor não configurado corretamente.' },
      500
    );
  }

  const authorization = req.headers.get('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return json({ error: 'Não autenticado.' }, 401);
  }

  const userClient = createClient(
    supabaseUrl,
    publishableKey,
    {
      global: {
        headers: {
          Authorization: authorization
        }
      }
    }
  );

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json(
      { error: 'Sessão inválida ou expirada.' },
      401
    );
  }

  const admin = createClient(
    supabaseUrl,
    serviceKey
  );

  const body = await req.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const customer =
    body.customer && typeof body.customer === 'object'
      ? body.customer
      : {
          fullName: body.fullName || body.first_name || body.firstName || '',
          phone: body.phone || '',
          email: body.email || '',
          cpf: body.cpf || body.identification_number || body.identificationNumber || '',
          addressText: body.addressText || '',
          address: body.address && typeof body.address === 'object'
            ? body.address
            : {}
        };

  const items =
    Array.isArray(body.items)
      ? body.items
      : [];

  const affiliateCode =
    typeof body.affiliateCode === 'string'
      ? body.affiliateCode.trim().toUpperCase().slice(0, 100)
      : null;

  const fullName =
    String(customer.fullName || '').trim().slice(0, 160);

  const phone =
    String(customer.phone || '').trim().slice(0, 40);

  const email =
    String(customer.email || '').trim().toLowerCase().slice(0, 254);

  const cpf = normalizeCpf(customer.cpf);

  const address =
    customer.address && typeof customer.address === 'object'
      ? customer.address
      : {};

  const addressText =
    String(customer.addressText || '').trim().slice(0, 1000) ||
    [
      String(address.street || address.street_name || '').trim(),
      String(address.number || address.street_number || '').trim(),
      String(address.complement || '').trim(),
      String(address.neighborhood || '').trim(),
      String(address.city || '').trim(),
      String(address.state || '').trim(),
      String(address.zipCode || address.zip_code || '').replace(/\D/g, '')
    ].filter(Boolean).join(', ').slice(0, 1000);

  const missingCustomerFields: string[] = [];

  if (!fullName) missingCustomerFields.push('nome completo');
  if (!phone) missingCustomerFields.push('telefone');
  if (!email) missingCustomerFields.push('e-mail');
  if (!cpf) missingCustomerFields.push('CPF');
  if (!addressText) missingCustomerFields.push('endereço');

  if (missingCustomerFields.length) {
    return json(
      {
        error:
          'Dados do cliente incompletos. Campos faltando: ' +
          missingCustomerFields.join(', ') + '.',
        missing: missingCustomerFields
      },
      400
    );
  }

  if (!isValidCpf(cpf)) {
    return json({ error: 'Informe um CPF válido.' }, 400);
  }

  if (!email.includes('@') || email.length < 5) {
    return json({ error: 'Informe um e-mail válido.' }, 400);
  }

  if (!items.length || items.length > 50) {
    return json({ error: 'Carrinho inválido.' }, 400);
  }

  const quantities = new Map<string, number>();

  for (const item of items) {
    const productId = String(
      item?.productId ||
      item?.product_id ||
      item?.id ||
      ''
    ).trim();

    const quantity = Number(item?.quantity);

    if (
      !productId ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return json({ error: 'Item ou quantidade inválida.' }, 400);
    }

    const totalQuantity =
      (quantities.get(productId) || 0) + quantity;

    if (totalQuantity > 99) {
      return json(
        { error: 'Quantidade máxima por produto excedida.' },
        400
      );
    }

    quantities.set(productId, totalQuantity);
  }

  const productIds = [...quantities.keys()];

  const {
    data: products,
    error: productsError
  } = await admin
    .from('products')
    .select(
      'id,name,description,price,sale_price,discount,stock,commission,image,active'
    )
    .in('id', productIds)
    .eq('active', true);

  if (productsError) {
    console.error('Erro ao consultar produtos:', productsError);
    return json(
      { error: 'Não foi possível consultar os produtos.' },
      500
    );
  }

  if (!products || products.length !== productIds.length) {
    return json(
      { error: 'Um ou mais produtos não estão disponíveis.' },
      409
    );
  }

  let subtotal = 0;
  const orderItems: any[] = [];
  const mercadoPagoItems: any[] = [];

  for (const product of products) {
    const quantity = quantities.get(product.id)!;
    const stock = Number(product.stock);

    if (!Number.isInteger(stock) || stock < quantity) {
      return json(
        { error: `Estoque insuficiente para ${product.name}.` },
        409
      );
    }

    const price = Number(product.price);

    if (!Number.isFinite(price) || price < 0) {
      return json(
        { error: 'Um dos produtos possui preço inválido.' },
        500
      );
    }

    const discount = Math.min(
      Math.max(Number(product.discount || 0), 0),
      100
    );

    const hasSalePrice =
      product.sale_price !== null &&
      product.sale_price !== undefined &&
      String(product.sale_price).trim() !== '';

    const salePriceRaw = hasSalePrice
      ? Number(product.sale_price)
      : NaN;

    const unitPrice =
      Number.isFinite(salePriceRaw) && salePriceRaw > 0
        ? money(salePriceRaw)
        : money(price * (1 - discount / 100));

    const itemSubtotal =
      money(unitPrice * quantity);

    if (
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0 ||
      itemSubtotal <= 0
    ) {
      return json(
        { error: 'O produto possui preço de venda inválido.' },
        409
      );
    }

    const grossPrice = money(price);

    subtotal = money(subtotal + itemSubtotal);

    orderItems.push({
      id: generateCode('ITEM'),
      product_id: product.id,
      product_name: product.name,
      image: product.image || '',
      quantity,
      unit_price: unitPrice,
      gross_price: grossPrice,
      sale_price: unitPrice,
      affiliate_commission: 0,
      discount,
      subtotal: itemSubtotal
    });

    mercadoPagoItems.push({
      title: String(product.name || 'Produto').slice(0, 256),
      description: String(
        product.description || product.name || 'Produto'
      ).slice(0, 256),
      external_code: String(product.id).slice(0, 100),
      category_id: 'other',
      unit_price: unitPrice.toFixed(2),
      quantity
    });
  }

  let validAffiliateCode: string | null = null;

  if (affiliateCode) {
    const { data: affiliate } = await admin
      .from('affiliates')
      .select('code,status')
      .eq('code', affiliateCode)
      .eq('status', 'active')
      .maybeSingle();

    if (affiliate) {
      validAffiliateCode = affiliate.code;

      for (const item of orderItems) {
        item.affiliate_commission = money(
          Number(item.gross_price || 0) *
          Number(item.quantity || 0) *
          0.20
        );
      }
    }
  }

  const orderId = crypto.randomUUID();
  const orderCode = generateCode('ORD');

  const { error: orderError } = await admin
    .from('orders')
    .insert({
      id: orderId,
      code: orderCode,
      user_id: user.id,
      customer_name: fullName,
      customer_phone: phone,
      customer_email: email,
      address: { text: addressText },
      status: 'pending',
      payment_status: 'pending',
      subtotal,
      shipping: 0,
      discount: 0,
      total: subtotal,
      currency: 'BRL',
      affiliate_code: validAffiliateCode,
      payment_method: 'mercado_pago'
    });

  if (orderError) {
    console.error('Erro ao criar pedido:', orderError);
    return json(
      {
        error: 'Não foi possível criar o pedido.',
        debug: {
          code: orderError.code || null,
          message: orderError.message || null,
          details: orderError.details || null,
          hint: orderError.hint || null
        }
      },
      500
    );
  }

  const { error: itemsError } = await admin
    .from('order_items')
    .insert(
      orderItems.map(item => ({
        ...item,
        order_id: orderId
      }))
    );

  if (itemsError) {
    console.error('Erro ao criar itens:', itemsError);

    await admin
      .from('orders')
      .delete()
      .eq('id', orderId);

    return json(
      { error: 'Não foi possível criar os itens do pedido.' },
      500
    );
  }

  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts.shift() || fullName;
  const lastName = nameParts.join(' ').trim();

  const phoneDigits = phone.replace(/\D/g, '');
  const phoneAreaCode =
    phoneDigits.length >= 10
      ? phoneDigits.slice(0, 2)
      : '';
  const phoneNumber =
    phoneDigits.length >= 10
      ? phoneDigits.slice(2)
      : phoneDigits;

  const payer: Record<string, unknown> = {
    email,
    first_name: firstName
  };

  if (lastName) {
    payer.last_name = lastName;
  }

  if (cpf) {
    payer.identification = {
      type: 'CPF',
      number: cpf
    };
  }

  if (phoneAreaCode && phoneNumber) {
    payer.phone = {
      area_code: phoneAreaCode,
      number: phoneNumber
    };
  }

  const mp = await fetch(
    'https://api.mercadopago.com/v1/orders',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Idempotency-Key': orderId
      },
      body: JSON.stringify({
        type: 'online',
        processing_mode: 'manual',
        capture_mode: 'automatic_async',
        total_amount: subtotal.toFixed(2),
        external_reference: orderId,
        description:
          products.length === 1
            ? String(products[0].name || 'Produto').slice(0, 256)
            : 'Compra L&A Royal Advisory',
        payer,
        config: {
          statement_descriptor: 'LA ROYAL ADVISORY',
          online: {
            success_url:
              'https://equipezero-web.github.io/L-A-Advisory/?payment=success&order=' +
              encodeURIComponent(orderId),
            failure_url:
              'https://equipezero-web.github.io/L-A-Advisory/?payment=failure&order=' +
              encodeURIComponent(orderId),
            pending_url:
              'https://equipezero-web.github.io/L-A-Advisory/?payment=pending&order=' +
              encodeURIComponent(orderId),
            auto_return: 'approved'
          }
        },
        items: mercadoPagoItems
      })
    }
  );

  const rawResponse = await mp.text();

  let data: any = {};
  try {
    data = rawResponse ? JSON.parse(rawResponse) : {};
  } catch (_) {
    data = { raw_response: rawResponse };
  }

  if (!mp.ok || !data.checkout_url) {
    console.error('Mercado Pago rejeitou a Order:', {
      status: mp.status,
      message: data.message || data.error || null,
      error_code: data.error_code || data.code || null
    });

    await admin
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: 'cancelled'
      })
      .eq('id', orderId);

    return json(
      {
        error: 'Mercado Pago recusou a order.',
        status: mp.status,
        message: data.message || data.error || null,
        cause: data.cause || null,
        error_code: data.error_code || data.code || null,
        details: data.details || data.errors || null,
        debug: data
      },
      502
    );
  }

  const { error: paymentInsertError } = await admin
    .from('payments')
    .insert({
      id: crypto.randomUUID(),
      order_id: orderId,
      provider: 'mercado_pago',
      provider_payment_id: null,
      status: 'pending',
      amount: subtotal,
      currency: 'BRL',
      payment_method: 'mercado_pago',
      provider_status: data.status || 'created',
      provider_status_detail: data.status_detail || null,
      paid_at: null
    });

  if (paymentInsertError) {
    console.error(
      'Order criada, mas não foi possível registrar o pagamento local:',
      paymentInsertError
    );
  }

  console.log('Mercado Pago Order criada:', {
    order_id: data.id,
    internal_order_id: orderId,
    external_reference: orderId,
    status: data.status || null,
    status_detail: data.status_detail || null,
    capture_mode: data.capture_mode || null,
    total_amount: data.total_amount || null,
    total_paid_amount: data.total_paid_amount || null
  });

  return json({
    ok: true,
    order_id: data.id,
    internal_order_id: orderId,
    checkout_url: data.checkout_url
  });
});
