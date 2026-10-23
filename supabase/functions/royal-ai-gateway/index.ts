import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://equipezero-web.github.io',
  'Access-Control-Allow-Headers':
    'apikey, x-client-info, content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SECRET_KEYS = JSON.parse(
  Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'
);

const DB_SECRET =
  SECRET_KEYS.default ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  '';

const GEMINI_API_KEY =
  Deno.env.get('GEMINI_API_KEY') || '';

const GROQ_API_KEY =
  Deno.env.get('GROQ_API_KEY') || '';

const OPENROUTER_API_KEY =
  Deno.env.get('OPENROUTER_API_KEY') || '';

const CLOUDFLARE_AI_API_TOKEN =
  Deno.env.get('CLOUDFLARE_AI_API_TOKEN') || '';

const CLOUDFLARE_ACCOUNT_ID =
  Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '';

const COHERE_API_KEY =
  Deno.env.get('COHERE_API_KEY') || '';


// ================================
// MODELOS
// ================================

const GEMINI_MODEL =
  Deno.env.get('ROYAL_AI_GEMINI_MODEL') ||
  'gemini-3.8-flash';

const GROQ_MODEL =
  Deno.env.get('ROYAL_AI_GROQ_MODEL') ||
  'openai/gpt-oss-20b';

const OPENROUTER_MODEL =
  Deno.env.get('ROYAL_AI_OPENROUTER_MODEL') ||
  'openrouter/free';

const CLOUDFLARE_MODEL =
  Deno.env.get('ROYAL_AI_CLOUDFLARE_MODEL') ||
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast';

const COHERE_MODEL =
  Deno.env.get('ROYAL_AI_COHERE_MODEL') ||
  'command-a-03-2025';


// ================================
// HELPERS
// ================================

function json(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: corsHeaders,
    }
  );
}

function safeMessage(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function providerError(
  provider: string,
  status: number,
  message: string
) {
  return Object.assign(
    new Error(safeMessage(message)),
    {
      provider,
      status,
    }
  );
}

function classifyProviderFailure(status: number) {
  if (status === 429) {
    return 'rate_limited';
  }

  if (status === 401 || status === 403) {
    return 'error';
  }

  return 'error';
}

const SYSTEM_PROMPT = `
Você é a Royal AI da Store Royal.

Responda em português do Brasil.

Sua função é auxiliar a administração da Store Royal com:
- análise de produtos;
- oportunidades de dropshipping;
- fornecedores;
- catálogo;
- marketing;
- vendas;
- métricas;
- relatórios;
- recomendações comerciais.

REGRAS OBRIGATÓRIAS:

1. Não invente vendas, estoque, preços, fornecedores ou métricas.
2. Diferencie claramente fatos de estimativas.
3. Não execute pagamentos.
4. Não altere pedidos.
5. Não publique produtos automaticamente.
6. Não aprove alterações financeiras automaticamente.
7. Não exponha chaves, tokens ou dados privados.
8. Priorize soluções de custo zero durante o modo bootstrap.
9. Uma recomendação da IA não significa autorização para execução.
10. Se não houver dados suficientes, diga claramente que faltam dados.
`.trim();


// ================================
// GEMINI
// ================================

async function callGemini(prompt: string) {

  if (!GEMINI_API_KEY) {
    throw providerError(
      'gemini',
      503,
      'GEMINI_API_KEY ausente.'
    );
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY,
      },

      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: SYSTEM_PROMPT,
            },
          ],
        },

        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],

        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 1200,
        },
      }),
    }
  );

  const data =
    await response.json().catch(() => ({}));

  if (!response.ok) {

    throw providerError(
      'gemini',
      response.status,
      data?.error?.message ||
        `Gemini HTTP ${response.status}`
    );
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(
        (part: { text?: string }) =>
          part?.text || ''
      )
      .join('\n')
      .trim();

  if (!text) {
    throw providerError(
      'gemini',
      502,
      'Gemini retornou resposta vazia.'
    );
  }

  return {
    text,
    provider: 'gemini',
    model: GEMINI_MODEL,
  };
}


// ================================
// GROQ
// ================================

async function callGroq(prompt: string) {

  if (!GROQ_API_KEY) {
    throw providerError(
      'groq',
      503,
      'GROQ_API_KEY ausente.'
    );
  }

  const response = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization:
          `Bearer ${GROQ_API_KEY}`,
      },

      body: JSON.stringify({
        model: GROQ_MODEL,

        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],

        temperature: 0.35,
        max_completion_tokens: 1200,
      }),
    }
  );

  const data =
    await response.json().catch(() => ({}));

  if (!response.ok) {

    throw providerError(
      'groq',
      response.status,
      data?.error?.message ||
        `Groq HTTP ${response.status}`
    );
  }

  const text =
    String(
      data?.choices?.[0]?.message?.content || ''
    ).trim();

  if (!text) {
    throw providerError(
      'groq',
      502,
      'Groq retornou resposta vazia.'
    );
  }

  return {
    text,
    provider: 'groq',
    model: GROQ_MODEL,
  };
}


// ================================
// OPENROUTER
// ================================

async function callOpenRouter(prompt: string) {

  if (!OPENROUTER_API_KEY) {
    throw providerError(
      'openrouter',
      503,
      'OPENROUTER_API_KEY ausente.'
    );
  }

  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization:
          `Bearer ${OPENROUTER_API_KEY}`,
      },

      body: JSON.stringify({
        model: OPENROUTER_MODEL,

        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],

        temperature: 0.35,
        max_tokens: 1200,
      }),
    }
  );

  const data =
    await response.json().catch(() => ({}));

  if (!response.ok) {

    throw providerError(
      'openrouter',
      response.status,
      data?.error?.message ||
        `OpenRouter HTTP ${response.status}`
    );
  }

  const text =
    String(
      data?.choices?.[0]?.message?.content || ''
    ).trim();

  if (!text) {
    throw providerError(
      'openrouter',
      502,
      'OpenRouter retornou resposta vazia.'
    );
  }

  return {
    text,
    provider: 'openrouter',
    model:
      data?.model ||
      OPENROUTER_MODEL,
  };
}


// ================================
// CLOUDFLARE WORKERS AI
// ================================

async function callCloudflare(prompt: string) {

  if (
    !CLOUDFLARE_AI_API_TOKEN ||
    !CLOUDFLARE_ACCOUNT_ID
  ) {

    throw providerError(
      'cloudflare',
      503,
      'Configuração do Cloudflare Workers AI ausente.'
    );
  }

  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/ai/run/${CLOUDFLARE_MODEL}`;

  const response = await fetch(
    endpoint,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization:
          `Bearer ${CLOUDFLARE_AI_API_TOKEN}`,
      },

      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    }
  );

  const data =
    await response.json().catch(() => ({}));

  if (!response.ok || data?.success === false) {

    const cloudflareMessage =
      data?.errors?.[0]?.message ||
      data?.error ||
      `Cloudflare HTTP ${response.status}`;

    throw providerError(
      'cloudflare',
      response.status,
      cloudflareMessage
    );
  }

  const text =
    String(
      data?.result?.response ||
      data?.result?.text ||
      ''
    ).trim();

  if (!text) {
    throw providerError(
      'cloudflare',
      502,
      'Cloudflare Workers AI retornou resposta vazia.'
    );
  }

  return {
    text,
    provider: 'cloudflare',
    model: CLOUDFLARE_MODEL,
  };
}


// ================================
// COHERE
// ================================

async function callCohere(prompt: string) {

  if (!COHERE_API_KEY) {
    throw providerError(
      'cohere',
      503,
      'COHERE_API_KEY ausente.'
    );
  }

  const response = await fetch(
    'https://api.cohere.com/v2/chat',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization:
          `Bearer ${COHERE_API_KEY}`,
      },

      body: JSON.stringify({
        model: COHERE_MODEL,

        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],

        temperature: 0.35,
        max_tokens: 1200,
      }),
    }
  );

  const data =
    await response.json().catch(() => ({}));

  if (!response.ok) {

    throw providerError(
      'cohere',
      response.status,
      data?.message ||
        `Cohere HTTP ${response.status}`
    );
  }

  const text =
    data?.message?.content
      ?.filter(
        (item: { type?: string }) =>
          item?.type === 'text'
      )
      ?.map(
        (item: { text?: string }) =>
          item?.text || ''
      )
      .join('\n')
      .trim();

  if (!text) {
    throw providerError(
      'cohere',
      502,
      'Cohere retornou resposta vazia.'
    );
  }

  return {
    text,
    provider: 'cohere',
    model: COHERE_MODEL,
  };
}


// ================================
// ROUTER
// ================================

async function callProvider(
  provider: string,
  prompt: string
) {

  switch (provider) {

    case 'gemini':
      return await callGemini(prompt);

    case 'groq':
      return await callGroq(prompt);

    case 'openrouter':
      return await callOpenRouter(prompt);

    case 'cloudflare':
      return await callCloudflare(prompt);

    case 'cohere':
      return await callCohere(prompt);

    default:
      throw providerError(
        provider,
        503,
        'Provedor não suportado pelo Royal AI Gateway.'
      );
  }
}


// ================================
// EDGE FUNCTION
// ================================

Deno.serve(async (req) => {

  let debugStage = 'inicio';

  try {

  if (req.method === 'OPTIONS') {
    return new Response(
      'ok',
      {
        headers: corsHeaders,
      }
    );
  }

  if (req.method !== 'POST') {
    return json(
      {
        error:
          'Método não permitido.',
      },
      405
    );
  }

  if (!SUPABASE_URL || !DB_SECRET) {
    return json(
      {
        error:
          'Servidor não configurado corretamente.',
      },
      503
    );
  }


  // ============================
  // AUTENTICAÇÃO
  // ============================

  const authorization =
    req.headers.get('Authorization') || '';

  const accessToken =
    authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';

  if (!accessToken) {
    return json(
      {
        error:
          'Autenticação obrigatória.',
      },
      401
    );
  }


  const admin =
    createClient(
      SUPABASE_URL,
      DB_SECRET,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );


  const {
    data: authData,
    error: authError,
  } =
    await admin.auth.getUser(
      accessToken
    );


  if (
    authError ||
    !authData.user
  ) {
    return json(
      {
        error:
          'Sessão inválida ou expirada.',
      },
      401
    );
  }


const {
  data: profile,
  error: profileError,
} =
  await admin
    .from('profiles')
    .select('role,is_active')
    .eq(
      'id',
      authData.user.id
    )
    .maybeSingle();


if (
  profileError ||
  !profile ||
  profile.role !== 'admin' ||
  profile.is_active !== true
) {
    return json(
      {
        error:
          'Acesso restrito a administradores ativos.',
      },
      403
    );
  }


  // ============================
  // BODY
  // ============================

  const body =
    await req.json()
      .catch(() => null);


  if (
    !body ||
    typeof body !== 'object'
  ) {
    return json(
      {
        error:
          'Corpo da requisição inválido.',
      },
      400
    );
  }


  const action =
    String(
      (body as Record<string, unknown>)
        .action ||
      'generate'
    ).trim();


  // ============================
  // STATUS
  // ============================

  if (action === 'status') {

    const [
      { data: settings },
      { data: providers },
    ] =
      await Promise.all([
        admin
          .from('royal_ai_settings')
          .select(
            'bootstrap_mode,allow_paid_providers,automation_enabled,max_concurrent_tasks'
          )
          .eq('id', true)
          .maybeSingle(),

        admin
          .from('royal_ai_providers')
          .select(
            'provider_key,display_name,priority,enabled,free_only,status,cooldown_until,last_success_at,last_failure_at,last_error_code'
          )
          .order('priority'),
      ]);


    return json({
      ok: true,
      settings,
      providers,
    });
  }


if (action !== 'generate') {
  return json(
    {
      error:
        'Ação inválida.',
    },
    400
  );
}

const prompt =
  String(
    (body as Record<string, unknown>)
      .prompt || ''
  ).trim();


  if (
    !prompt ||
    prompt.length > 12000
  ) {
    return json(
      {
        error:
          'Prompt inválido.',
      },
      400
    );
  }


  // ============================
  // ZERO-COST LOCK
  // ============================

  debugStage = 'carregar_settings_generate';

  const {
    data: settings,
  } =
    await admin
      .from('royal_ai_settings')
      .select(
        'bootstrap_mode,allow_paid_providers'
      )
      .eq('id', true)
      .maybeSingle();

  if (
    !settings?.bootstrap_mode ||
    settings?.allow_paid_providers
  ) {
    return json(
      {
        error:
          'Royal AI está fora do modo bootstrap seguro. Operação bloqueada para revisão.',
      },
      503
    );
  }


  // ============================
  // CARREGAR PROVEDORES
  // ============================

  debugStage = 'carregar_providers';

  const {
    data: providers,
  } =
    await admin
      .from('royal_ai_providers')
      .select(
        'provider_key,enabled,free_only,status,cooldown_until,priority'
      )
      .eq('enabled', true)
      .eq('free_only', true)
      .order('priority');

  const supportedProviders =
    [
      'gemini',
      'groq',
      'openrouter',
      'cloudflare',
      'cohere',
    ];


  const now = Date.now();


  const eligible =
    (providers || [])
      .filter((provider) => {

        if (
          !supportedProviders.includes(
            provider.provider_key
          )
        ) {
          return false;
        }

        if (
          provider.status === 'disabled' ||
          provider.status ===
            'quota_exhausted'
        ) {
          return false;
        }

        if (
          provider.cooldown_until &&
          new Date(
            provider.cooldown_until
          ).getTime() > now
        ) {
          return false;
        }

        return true;
      });


  const errors: Array<{
    provider: string;
    status: number;
    message: string;
  }> = [];

  // ============================
  // FAILOVER
  // ============================

  debugStage = 'iniciar_failover';

for (const provider of eligible) {
  try {
    const result = await callProvider(
      provider.provider_key,
      prompt
    );

    // Registra sucesso do provedor.
    const { error: providerUpdateError } =
      await admin
        .from('royal_ai_providers')
        .update({
          status: 'available',
          consecutive_failures: 0,
          cooldown_until: null,
          last_success_at: new Date().toISOString(),
          last_error_code: null,
          last_error_message: null,
          model: result.model,
          updated_at: new Date().toISOString(),
        })
        .eq('provider_key', result.provider);

    // Falha de auditoria NÃO pode derrubar uma geração válida.
    if (providerUpdateError) {
      console.error(
        'Royal AI provider success update failed:',
        providerUpdateError.message
      );
    }

    const { error: successLogError } =
      await admin
        .from('royal_ai_logs')
        .insert({
          provider_key: result.provider,
          event_type: 'generation_success',
          level: 'info',
          message:
            'Geração concluída pelo Royal AI Gateway.',
          details: {
            model: result.model,
          },
        });

    if (successLogError) {
      console.error(
        'Royal AI success log failed:',
        successLogError.message
      );
    }

    return json({
      ok: true,
      provider: result.provider,
      model: result.model,
      text: result.text,
    });

  } catch (caughtError: unknown) {

    // Normaliza qualquer tipo de erro sem assumir
    // que caughtError sempre será um objeto Error.
    const errorObject =
      caughtError &&
      typeof caughtError === 'object'
        ? caughtError as Record<string, unknown>
        : {};

    const providerKey =
      typeof errorObject.provider === 'string'
        ? errorObject.provider
        : String(provider.provider_key);

    const parsedStatus =
      Number(errorObject.status);

    const status =
      Number.isFinite(parsedStatus) &&
      parsedStatus > 0
        ? parsedStatus
        : 500;

    const message =
      safeMessage(
        caughtError instanceof Error
          ? caughtError.message
          : typeof errorObject.message === 'string'
            ? errorObject.message
            : String(caughtError || 'Erro desconhecido.')
      ) || 'Erro desconhecido do provedor.';

    const providerStatus =
      classifyProviderFailure(status);

    // 429 recebe cooldown.
    // 503 também recebe um cooldown curto para evitar
    // insistir imediatamente em um provedor sobrecarregado.
    const cooldown =
      status === 429
        ? new Date(
            Date.now() + 15 * 60 * 1000
          ).toISOString()
        : status === 503
          ? new Date(
              Date.now() + 5 * 60 * 1000
            ).toISOString()
          : null;

    errors.push({
      provider: providerKey,
      status,
      message,
    });

    // Registrar a falha é secundário.
    // Mesmo que o banco falhe aqui, o próximo provedor
    // ainda deve ser tentado.
    try {
      const { error: failureUpdateError } =
        await admin
          .from('royal_ai_providers')
          .update({
            status: providerStatus,
            cooldown_until: cooldown,
            last_failure_at:
              new Date().toISOString(),
            last_error_code:
              String(status),
            last_error_message:
              message,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'provider_key',
            providerKey
          );

      if (failureUpdateError) {
        console.error(
          'Royal AI provider failure update failed:',
          failureUpdateError.message
        );
      }
    } catch (dbError) {
      console.error(
        'Royal AI provider failure persistence crashed:',
        dbError
      );
    }

    try {
      const { error: failureLogError } =
        await admin
          .from('royal_ai_logs')
          .insert({
            provider_key:
              providerKey,

            event_type:
              'provider_failure',

            level:
              'warning',

            message:
              'Provedor indisponível; Royal AI tentará o próximo.',

            details: {
              http_status:
                status,
              error:
                message,
            },
          });

      if (failureLogError) {
        console.error(
          'Royal AI failure log failed:',
          failureLogError.message
        );
      }
    } catch (logError) {
      console.error(
        'Royal AI failure log persistence crashed:',
        logError
      );
    }

    // IMPORTANTE:
    // não há "return" e não há "throw" aqui.
    // O loop continua automaticamente para
    // o próximo provedor.
  }
}


  // ============================
  // TODOS INDISPONÍVEIS
  // ============================

  const {
    data: task,
  } =
    await admin
      .from('royal_ai_tasks')
      .insert({
        task_type:
          'generate_text',

        priority:
          5,

        status:
          'waiting_provider',

        payload: {
          prompt,
        },

        last_error:
          'Nenhum provedor gratuito disponível.',
      })
      .select('id')
      .single();


  return json(
    {
      ok: false,
      queued: true,

      task_id:
        task?.id || null,

      error:
        'Nenhum provedor gratuito está disponível agora. A tarefa foi colocada na fila.',

      providers:
        errors.map(
          ({
            provider,
            status,
          }) => ({
            provider,
            status,
          })
        ),
    },
    503
  );

  } catch (fatalError) {
    return json(
      {
        ok: false,
        diagnostic: true,
        stage: debugStage,
        error:
          fatalError instanceof Error
            ? fatalError.message
            : String(fatalError),
      },
      500
    );
  }
});
