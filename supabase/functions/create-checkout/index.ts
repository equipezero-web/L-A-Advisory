import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_PUBLISHABLE_KEYS = JSON.parse(
  Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}'
);
const SUPABASE_SECRET_KEYS = JSON.parse(
  Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'
);

const SUPABASE_PUBLISHABLE_KEY =
  SUPABASE_PUBLISHABLE_KEYS['default'];

const SUPABASE_SECRET_KEY =
  SUPABASE_SECRET_KEYS['default'];

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');

const SITE_URL =
  Deno.env.get('SITE_URL') ||
  'https://equipezero-web.github.io/L-A-Advisory';

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function generateCode(prefix: string): string {
  return `${prefix}${crypto
    .randomUUID()
    .replaceAll('-', '')
    .slice(0, 10)
    .toUpperCase()}`;
}

function normalizeCpf(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf(value: unknown): boolean {
  const cpf = normalizeCpf(value);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;

  for (let i = 0; i < 9; i++) {
    sum += Number(cpf[i]) * (10 - i);
  }

  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;

  if (digit !== Number(cpf[9])) {
    return false;
  }

  sum = 0;

  for (let i = 0; i < 10; i++) {
    sum += Number(cpf[i]) * (11 - i);
  }

  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;

  return digit === Number(cpf[10]);
}

Deno.serve(async (req) => {
  /*
   * CORS
   */
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  /*
   * Somente POST
   */
  if (req.method !== 'POST') {
    return json(
      { error: 'Método não permitido.' },
      405
    );
  }

  /*
   * Verificações de configuração
   */
  if (!SUPABASE_URL) {
    console.error('SUPABASE_URL não configurado.');
    return json(
      { error: 'Servidor não configurado corretamente.' },
      500
    );
  }

  if (!SUPABASE_PUBLISHABLE_KEY) {
    console.error(
      'SUPABASE_PUBLISHABLE_KEYS não configurado.'
    );

    return json(
      { error: 'Servidor não configurado corretamente.' },
      500
    );
  }

  if (!SUPABASE_SECRET_KEY) {
    console.error(
      'SUPABASE_SECRET_KEYS não configurado.'
    );

    return json(
      { error: 'Servidor não configurado corretamente.' },
      500
    );
  }

  if (!MP_ACCESS_TOKEN) {
    console.error('MP_ACCESS_TOKEN não configurado.');

    return json(
      { error: 'Mercado Pago não configurado no servidor.' },
      500
    );
  }

  /*
   * Autenticação do usuário
   */
  const authorization =
    req.headers.get('Authorization');

  if (
    !authorization ||
    !authorization.startsWith('Bearer ')
  ) {
    return json(
      { error: 'Não autenticado.' },
      401
    );
  }

  /*
   * Cliente que respeita a sessão do usuário.
   *
   * A chave publishable é pública e o JWT do usuário
   * é enviado no Authorization.
   */
  const userClient = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    console.error(
      'Erro de autenticação:',
      userError
    );

    return json(
      { error: 'Sessão inválida ou expirada.' },
      401
    );
  }

  /*
   * Cliente administrativo.
   *
   * Usa a nova Secret Key do Supabase.
   * Esta chave NUNCA vai para o navegador.
   */
  const admin = createClient(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY
  );

  /*
   * Lê o JSON
   */
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return json(
      { error: 'JSON inválido.' },
      400
    );
  }

  const customer =
    body.customer &&
    typeof body.customer === 'object'
      ? body.customer
      : {};

  const items =
    Array.isArray(body.items)
      ? body.items
      : [];

  const affiliateCode =
    typeof body.affiliateCode === 'string'
      ? body.affiliateCode
          .trim()
          .toUpperCase()
          .slice(0, 100)
      : null;

  /*
   * Validação dos dados do cliente
   */
  const fullName =
    String(customer.fullName || '')
      .trim()
      .slice(0, 160);

  const cpf =
    normalizeCpf(customer.cpf);

  const phone =
    String(customer.phone || '')
      .trim()
      .slice(0, 40);

  const email =
    String(customer.email || '')
      .trim()
      .toLowerCase()
      .slice(0, 254);

  const addressText =
    String(customer.address || '')
      .trim()
      .slice(0, 1000);

  if (
    !fullName ||
    !cpf ||
    !phone ||
    !email ||
    !addressText
  ) {
    return json(
      {
        error:
          'Dados do cliente incompletos.',
      },
      400
    );
  }

  if (!isValidCpf(cpf)) {
    return json(
      {
        error:
          'Informe um CPF válido.',
      },
      400
    );
  }

  /*
   * Validação básica de e-mail
   */
  if (
    !email.includes('@') ||
    email.length < 5
  ) {
    return json(
      {
        error:
          'Informe um e-mail válido.',
      },
      400
    );
  }

  /*
   * Validação do carrinho
   */
  if (
    !items.length ||
    items.length > 50
  ) {
    return json(
      {
        error:
          'Carrinho inválido.',
      },
      400
    );
  }

  /*
   * Junta produtos repetidos e valida quantidades.
   */
  const quantities =
    new Map<string, number>();

  for (const item of items) {
    const productId =
      String(item?.productId || '').trim();

    const quantity =
      Number(item?.quantity);

    if (
      !productId ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return json(
        {
          error:
            'Item ou quantidade inválida.',
        },
        400
      );
    }

    const previous =
      quantities.get(productId) || 0;

    const totalQuantity =
      previous + quantity;

    if (totalQuantity > 99) {
      return json(
        {
          error:
            'Quantidade máxima por produto excedida.',
        },
        400
      );
    }

    quantities.set(
      productId,
      totalQuantity
    );
  }

  /*
   * Busca os produtos diretamente no banco.
   *
   * O preço enviado pelo navegador NÃO é confiável.
   * O servidor calcula tudo novamente.
   */
  const productIds =
    [...quantities.keys()];

  const {
    data: products,
    error: productsError,
  } = await admin
    .from('products')
    .select(
      'id,name,description,price,sale_price,discount,stock,commission,image,active'
    )
    .in('id', productIds)
    .eq('active', true);

  if (productsError) {
    console.error(
      'Erro ao consultar produtos:',
      productsError
    );

    return json(
      {
        error:
          'Não foi possível consultar os produtos.',
      },
      500
    );
  }

  if (
    !products ||
    products.length !== productIds.length
  ) {
    return json(
      {
        error:
          'Um ou mais produtos não estão disponíveis.',
      },
      409
    );
  }

  /*
   * Recalcula subtotal no servidor.
   */
  let subtotal = 0;

  const orderItems: any[] = [];
  const mercadoPagoItems: any[] = [];

  for (const product of products) {
    const quantity =
      quantities.get(product.id)!;

    const stock =
      Number(product.stock);

    if (
      !Number.isInteger(stock) ||
      stock < quantity
    ) {
      return json(
        {
          error:
            `Estoque insuficiente para ${product.name}.`,
        },
        409
      );
    }

    const price =
      Number(product.price);

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      console.error(
        'Preço inválido no produto:',
        product.id
      );

      return json(
        {
          error:
            'Um dos produtos possui preço inválido.',
        },
        500
      );
    }

    const salePriceRaw = Number(product.sale_price);

    const unitPrice = Number.isFinite(salePriceRaw) && salePriceRaw >= 0
      ? money(salePriceRaw)
      : money(price * (1 - discount / 100));

    const itemSubtotal =
      money(
        unitPrice * quantity
      );

    const grossPrice = money(price);
    const affiliateCommission = validAffiliateCode
      ? money(grossPrice * quantity * 0.20)
      : 0;

    subtotal =
      money(
        subtotal + itemSubtotal
      );

    orderItems.push({
      id: generateCode('ITEM'),
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price: unitPrice,
      gross_price: grossPrice,
      sale_price: unitPrice,
      affiliate_commission: affiliateCommission,
      discount,
      subtotal: itemSubtotal,
    });

    mercadoPagoItems.push({
      id: product.id,
      title: String(
        product.name || 'Produto'
      ).slice(0, 256),
      description: String(
        product.description ||
          product.name ||
          'Produto'
      ).slice(0, 256),
      quantity,
      unit_price: unitPrice,
      currency_id: 'BRL',
    });
  }

  /*
   * Verifica afiliado.
   *
   * O navegador pode enviar qualquer código.
   * Somente um afiliado ativo é aceito.
   */
  let validAffiliateCode:
    string | null = null;

  if (affiliateCode) {
    const {
      data: affiliate,
      error: affiliateError,
    } = await admin
      .from('affiliates')
      .select('code,status')
      .eq('code', affiliateCode)
      .eq('status', 'active')
      .maybeSingle();

    if (affiliateError) {
      console.error(
        'Erro ao consultar afiliado:',
        affiliateError
      );
    }

    if (affiliate) {
      validAffiliateCode =
        affiliate.code;
    }
  }

  /*
   * Gera identificadores internos.
   */
  const orderId =
    generateCode('ORDER');

  const orderCode =
    generateCode('ORD');

  /*
   * Cria o pedido.
   *
   * CPF NÃO fica dentro de orders.
   */
  const {
    error: orderError,
  } = await admin
    .from('orders')
    .insert({
      id: orderId,
      code: orderCode,
      user_id: user.id,

      customer_name:
        fullName,

      customer_phone:
        phone,

      customer_email:
        email,

      address: {
        text: addressText,
      },

      status: 'pending',
      payment_status: 'pending',

      subtotal,
      shipping: 0,
      discount: 0,
      total: subtotal,

      currency: 'BRL',

      affiliate_code:
        validAffiliateCode,

      payment_method:
        'mercado_pago',
    });

  if (orderError) {
    console.error(
      'Erro ao criar pedido:',
      orderError
    );

    return json(
      {
        error:
          'Não foi possível criar o pedido.',
        debug: {
          code: orderError.code || null,
          message: orderError.message || null,
          details: orderError.details || null,
          hint: orderError.hint || null,
        },
      },
      500
    );
  }

  /*
   * Salva/atualiza os dados privados do cliente.
   *
   * O CPF fica somente nesta tabela.
   */
  const {
    error: privateCustomerError,
  } = await admin
    .from('customer_private')
    .upsert(
      {
        user_id: user.id,
        cpf,
        phone,
        address: {
          text: addressText,
        },
        privacy_consent: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    );

  if (privateCustomerError) {
    console.error(
      'Erro ao salvar dados privados:',
      privateCustomerError
    );

    await admin
      .from('orders')
      .delete()
      .eq('id', orderId);

    return json(
      {
        error:
          'Não foi possível salvar os dados do cliente.',
      },
      500
    );
  }

  /*
   * Cria os itens do pedido.
   */
  const {
    error: itemsError,
  } = await admin
    .from('order_items')
    .insert(
      orderItems.map(
        (item) => ({
          ...item,
          order_id: orderId,
        })
      )
    );

  if (itemsError) {
    console.error(
      'Erro ao criar itens:',
      itemsError
    );

    await admin
      .from('orders')
      .delete()
      .eq('id', orderId);

    return json(
      {
        error:
          'Não foi possível criar os itens do pedido.',
      },
      500
    );
  }

  /*
   * Cria a preferência do Mercado Pago.
   */
  const preference = {
    items: mercadoPagoItems,

    external_reference:
      orderId,

    notification_url:
      `${SUPABASE_URL}/functions/v1/mercado-pago-webhook`,

    payer: {
      email,
    },

    back_urls: {
      success:
        `${SITE_URL}?payment=success&order=${encodeURIComponent(orderId)}`,

      failure:
        `${SITE_URL}?payment=failure&order=${encodeURIComponent(orderId)}`,

      pending:
        `${SITE_URL}?payment=pending&order=${encodeURIComponent(orderId)}`,
    },

    auto_return:
      'approved',
  };

  /*
   * Envia a preferência para o Mercado Pago.
   */
  const mercadoPagoResponse =
    await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${MP_ACCESS_TOKEN}`,

          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify(preference),
      }
    );

  const mercadoPagoData =
    await mercadoPagoResponse
      .json()
      .catch(() => ({}));

  /*
   * Se o Mercado Pago rejeitar,
   * cancela o pedido.
   */
  if (
    !mercadoPagoResponse.ok ||
    !mercadoPagoData.id ||
    !mercadoPagoData.init_point
  ) {
    console.error(
      'Erro ao criar preferência Mercado Pago:',
      mercadoPagoData
    );

    await admin
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: 'cancelled',
      })
      .eq('id', orderId);

    return json(
      {
        error:
          'Não foi possível iniciar o pagamento.',
      },
      502
    );
  }

  /*
   * Registra o pagamento como pendente.
   */
  const {
    error: paymentError,
  } = await admin
    .from('payments')
    .insert({
      id: generateCode('PAY'),
      order_id: orderId,

      provider:
        'mercado_pago',

      provider_payment_id:
        null,

      status:
        'pending',

      amount:
        subtotal,

      currency:
        'BRL',

      payment_method:
        'mercado_pago',

      provider_status:
        'created',
    });

  if (paymentError) {
    console.error(
      'Erro ao registrar pagamento:',
      paymentError
    );

    /*
     * O pedido continua existente porque a
     * preferência do Mercado Pago já foi criada.
     * O webhook poderá localizar o pedido
     * pelo external_reference.
     */
  }

  /*
   * Retorna somente dados necessários
   * ao navegador.
   *
   * Nenhum segredo é enviado.
   */
  return json({
    ok: true,
    orderId,
    init_point:
      mercadoPagoData.init_point,
  });
});
