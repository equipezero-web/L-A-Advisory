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

  if (digit === 10) {
    digit = 0;
  }

  if (digit !== Number(cpf[9])) {
    return false;
  }

  sum = 0;

  for (let i = 0; i < 10; i++) {
    sum += Number(cpf[i]) * (11 - i);
  }

  digit = (sum * 10) % 11;

  if (digit === 10) {
    digit = 0;
  }

  return digit === Number(cpf[10]);
}

function generateAffiliateCode(): string {
  const randomPart = crypto
    .randomUUID()
    .replaceAll('-', '')
    .slice(0, 8)
    .toUpperCase();

  return `AFF${randomPart}`;
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
      {
        error: 'Método não permitido.',
      },
      405
    );
  }

  /*
   * Verificação das configurações
   */
  if (!SUPABASE_URL) {
    console.error(
      'SUPABASE_URL não configurado.'
    );

    return json(
      {
        error:
          'Servidor não configurado corretamente.',
      },
      500
    );
  }

  if (!SUPABASE_PUBLISHABLE_KEY) {
    console.error(
      'SUPABASE_PUBLISHABLE_KEYS não configurado.'
    );

    return json(
      {
        error:
          'Servidor não configurado corretamente.',
      },
      500
    );
  }

  if (!SUPABASE_SECRET_KEY) {
    console.error(
      'SUPABASE_SECRET_KEYS não configurado.'
    );

    return json(
      {
        error:
          'Servidor não configurado corretamente.',
      },
      500
    );
  }

  /*
   * Autenticação
   */
  const authorization =
    req.headers.get('Authorization');

  if (
    !authorization ||
    !authorization.startsWith('Bearer ')
  ) {
    return json(
      {
        error:
          'Não autenticado.',
      },
      401
    );
  }

  /*
   * Cliente com a sessão do usuário.
   */
  const userClient = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: {
          Authorization:
            authorization,
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
      {
        error:
          'Sessão inválida ou expirada.',
      },
      401
    );
  }

  /*
   * Cliente administrativo.
   *
   * A Secret Key fica exclusivamente
   * no backend.
   */
  const admin = createClient(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY
  );

  /*
   * Lê o corpo da requisição.
   */
  const body =
    await req.json().catch(() => null);

  if (
    !body ||
    typeof body !== 'object'
  ) {
    return json(
      {
        error:
          'JSON inválido.',
      },
      400
    );
  }

  /*
   * Dados enviados pelo formulário.
   */
  const name =
    String(
      body.name ||
      body.fullName ||
      ''
    )
      .trim()
      .slice(0, 160);

  const phone =
    String(
      body.phone || ''
    )
      .trim()
      .slice(0, 40);

  const cpf =
    normalizeCpf(body.cpf);

  const pixType =
    String(
      body.pixType || ''
    )
      .trim()
      .slice(0, 30);

  const pixKey =
    String(
      body.pixKey || ''
    )
      .trim()
      .slice(0, 200);

  const instagram =
    String(
      body.instagram || ''
    )
      .trim()
      .slice(0, 200);

  const website =
    String(
      body.website || ''
    )
      .trim()
      .slice(0, 300);

  /*
   * Validações
   */
  if (!name) {
    return json(
      {
        error:
          'Informe seu nome completo.',
      },
      400
    );
  }

  if (!phone) {
    return json(
      {
        error:
          'Informe seu telefone.',
      },
      400
    );
  }

  if (!cpf) {
    return json(
      {
        error:
          'Informe seu CPF.',
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
   * Se o usuário já possui cadastro de afiliado,
   * não cria outro.
   */
  const {
    data: existingAffiliate,
    error: existingError,
  } = await admin
    .from('affiliates')
    .select(
      'id,code,status,name,phone,cpf,pix_type,pix_key,instagram,website'
    )
    .eq(
      'user_id',
      user.id
    )
    .maybeSingle();

  if (existingError) {
    console.error(
      'Erro ao consultar afiliado:',
      existingError
    );

    return json(
      {
        error:
          'Não foi possível verificar seu cadastro.',
      },
      500
    );
  }

  if (existingAffiliate) {
    return json({
      ok: true,
      existing: true,
      affiliate: {
        id:
          existingAffiliate.id,

        code:
          existingAffiliate.code,

        status:
          existingAffiliate.status,

        name:
          existingAffiliate.name,

        phone:
          existingAffiliate.phone,

        pixType:
          existingAffiliate.pix_type,

        instagram:
          existingAffiliate.instagram,

        website:
          existingAffiliate.website,
      },
    });
  }

  /*
   * Verifica se o CPF já pertence
   * a outro afiliado.
   */
  const {
    data: cpfAffiliate,
    error: cpfError,
  } = await admin
    .from('affiliates')
    .select('id,user_id')
    .eq('cpf', cpf)
    .maybeSingle();

  if (cpfError) {
    console.error(
      'Erro ao verificar CPF:',
      cpfError
    );

    return json(
      {
        error:
          'Não foi possível verificar o CPF.',
      },
      500
    );
  }

  if (cpfAffiliate) {
    return json(
      {
        error:
          'Este CPF já está cadastrado no programa de afiliados.',
      },
      409
    );
  }

  /*
   * Gera código único.
   *
   * Tentamos algumas vezes para evitar
   * colisão extremamente improvável.
   */
  let affiliateCode = '';
  let created = false;
  let lastInsertError: unknown = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate =
      generateAffiliateCode();

    const {
      data: insertedAffiliate,
      error: insertError,
    } = await admin
      .from('affiliates')
      .insert({
        id:
          crypto.randomUUID(),

        user_id:
          user.id,

        code:
          candidate,

        status:
          'pending',

        name:
          name,

        phone:
          phone,

        cpf:
          cpf,

        pix_type:
          pixType || null,

        pix_key:
          pixKey || null,

        instagram:
          instagram || null,

        website:
          website || null,

        total_sales:
          0,

        total_commission:
          0,
      })
      .select(
        'id,code,status,name,phone,pix_type,instagram,website'
      )
      .single();

    if (!insertError && insertedAffiliate) {
      affiliateCode =
        insertedAffiliate.code;

      created = true;

      return json(
        {
          ok: true,

          existing: false,

          affiliate: {
            id:
              insertedAffiliate.id,

            code:
              insertedAffiliate.code,

            status:
              insertedAffiliate.status,

            name:
              insertedAffiliate.name,

            phone:
              insertedAffiliate.phone,

            pixType:
              insertedAffiliate.pix_type,

            instagram:
              insertedAffiliate.instagram,

            website:
              insertedAffiliate.website,
          },

          message:
            'Solicitação de afiliado enviada. Aguarde a aprovação.',
        },
        201
      );
    }

    lastInsertError =
      insertError;
  }

  console.error(
    'Não foi possível gerar código de afiliado:',
    lastInsertError
  );

  return json(
    {
      error:
        'Não foi possível criar seu cadastro de afiliado. Tente novamente.',
    },
    500
  );
});
