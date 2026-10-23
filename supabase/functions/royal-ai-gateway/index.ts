import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://equipezero-web.github.io',
  'Access-Control-Allow-Headers': 'apikey, x-client-info, content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const DB_SECRET = SECRET_KEYS.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';

const GEMINI_MODEL = Deno.env.get('ROYAL_AI_GEMINI_MODEL') || 'gemini-3.8-flash';
const GROQ_MODEL = Deno.env.get('ROYAL_AI_GROQ_MODEL') || 'llama-3.1-8b-instant';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function safeMessage(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function classifyProviderFailure(status: number) {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'error';
  if (status >= 500) return 'error';
  return 'error';
}

async function callGemini(prompt: string) {
  if (!GEMINI_API_KEY) throw Object.assign(new Error('GEMINI_API_KEY ausente.'), { provider: 'gemini', status: 503 });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 1200 }
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = safeMessage(data?.error?.message || `Gemini HTTP ${response.status}`);
    throw Object.assign(new Error(message), { provider: 'gemini', status: response.status });
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part?.text || '')
    .join('\n')
    .trim();

  if (!text) throw Object.assign(new Error('Gemini retornou resposta vazia.'), { provider: 'gemini', status: 502 });
  return { text, provider: 'gemini', model: GEMINI_MODEL };
}

async function callGroq(prompt: string) {
  if (!GROQ_API_KEY) throw Object.assign(new Error('GROQ_API_KEY ausente.'), { provider: 'groq', status: 503 });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Você é a Royal AI da Store Royal. Responda em português do Brasil, seja objetiva, não invente dados de produtos, vendas, estoque, fornecedores ou métricas.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.35,
      max_completion_tokens: 1200
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = safeMessage(data?.error?.message || `Groq HTTP ${response.status}`);
    throw Object.assign(new Error(message), { provider: 'groq', status: response.status });
  }

  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw Object.assign(new Error('Groq retornou resposta vazia.'), { provider: 'groq', status: 502 });
  return { text, provider: 'groq', model: GROQ_MODEL };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!SUPABASE_URL || !DB_SECRET) return json({ error: 'Servidor não configurado corretamente.' }, 503);

  const authorization = req.headers.get('Authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!accessToken) return json({ error: 'Autenticação obrigatória.' }, 401);

  const admin = createClient(SUPABASE_URL, DB_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role,status')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin' || profile.status !== 'active') {
    return json({ error: 'Acesso restrito a administradores ativos.' }, 403);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Corpo da requisição inválido.' }, 400);

  const action = String((body as Record<string, unknown>).action || 'generate').trim();

  if (action === 'status') {
    const [{ data: settings }, { data: providers }] = await Promise.all([
      admin.from('royal_ai_settings').select('bootstrap_mode,allow_paid_providers,automation_enabled,max_concurrent_tasks').eq('id', true).maybeSingle(),
      admin.from('royal_ai_providers').select('provider_key,display_name,priority,enabled,free_only,status,cooldown_until,last_success_at,last_failure_at,last_error_code').order('priority')
    ]);
    return json({ ok: true, settings, providers });
  }

  if (action !== 'generate') return json({ error: 'Ação inválida.' }, 400);

  const prompt = String((body as Record<string, unknown>).prompt || '').trim();
  if (!prompt || prompt.length > 12000) return json({ error: 'Prompt inválido.' }, 400);

  const { data: settings } = await admin
    .from('royal_ai_settings')
    .select('bootstrap_mode,allow_paid_providers')
    .eq('id', true)
    .maybeSingle();

  if (!settings?.bootstrap_mode || settings?.allow_paid_providers) {
    return json({ error: 'Royal AI está fora do modo bootstrap seguro. Operação bloqueada para revisão.' }, 503);
  }

  const { data: providers } = await admin
    .from('royal_ai_providers')
    .select('provider_key,enabled,free_only,status,cooldown_until,priority')
    .eq('enabled', true)
    .eq('free_only', true)
    .order('priority');

  const now = Date.now();
  const eligible = (providers || []).filter((p) => {
    if (!['gemini', 'groq'].includes(p.provider_key)) return false;
    if (p.status === 'disabled' || p.status === 'quota_exhausted') return false;
    if (p.cooldown_until && new Date(p.cooldown_until).getTime() > now) return false;
    return true;
  });

  const errors: Array<{ provider: string; status: number; message: string }> = [];

  for (const provider of eligible) {
    try {
      const result = provider.provider_key === 'gemini'
        ? await callGemini(prompt)
        : await callGroq(prompt);

      await admin.from('royal_ai_providers').update({
        status: 'available',
        consecutive_failures: 0,
        cooldown_until: null,
        last_success_at: new Date().toISOString(),
        last_error_code: null,
        last_error_message: null,
        model: result.model,
        updated_at: new Date().toISOString()
      }).eq('provider_key', result.provider);

      await admin.from('royal_ai_logs').insert({
        provider_key: result.provider,
        event_type: 'generation_success',
        level: 'info',
        message: 'Geração concluída pelo AI Gateway.',
        details: { model: result.model }
      });

      return json({ ok: true, provider: result.provider, model: result.model, text: result.text });
    } catch (error) {
      const providerKey = String((error as { provider?: string }).provider || provider.provider_key);
      const status = Number((error as { status?: number }).status || 500);
      const message = safeMessage((error as Error).message);
      const providerStatus = classifyProviderFailure(status);
      const cooldown = status === 429 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

      errors.push({ provider: providerKey, status, message });

      await admin.from('royal_ai_providers').update({
        status: providerStatus,
        cooldown_until: cooldown,
        last_failure_at: new Date().toISOString(),
        last_error_code: String(status),
        last_error_message: message,
        updated_at: new Date().toISOString()
      }).eq('provider_key', providerKey);

      await admin.from('royal_ai_logs').insert({
        provider_key: providerKey,
        event_type: 'provider_failure',
        level: 'warning',
        message: 'Provedor indisponível; AI Gateway tentará o próximo.',
        details: { http_status: status, error: message }
      });
    }
  }

  const { data: task } = await admin.from('royal_ai_tasks').insert({
    task_type: 'generate_text',
    priority: 5,
    status: 'waiting_provider',
    payload: { prompt },
    last_error: 'Nenhum provedor gratuito disponível.'
  }).select('id').single();

  return json({
    ok: false,
    queued: true,
    task_id: task?.id || null,
    error: 'Nenhum provedor gratuito está disponível agora. A tarefa foi colocada na fila.',
    providers: errors.map(({ provider, status }) => ({ provider, status }))
  }, 503);
});
