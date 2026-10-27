import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://equipezero-web.github.io',
  'Access-Control-Allow-Headers': 'apikey, x-client-info, content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const DB_SECRET = SECRET_KEYS.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';
const CLOUDFLARE_AI_API_TOKEN = Deno.env.get('CLOUDFLARE_AI_API_TOKEN') || '';
const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '';
const COHERE_API_KEY = Deno.env.get('COHERE_API_KEY') || '';
const GEMINI_MODEL = Deno.env.get('ROYAL_AI_GEMINI_MODEL') || 'gemini-3.8-flash';
const GROQ_MODEL = Deno.env.get('ROYAL_AI_GROQ_MODEL') || 'openai/gpt-oss-20b';
const OPENROUTER_MODEL = Deno.env.get('ROYAL_AI_OPENROUTER_MODEL') || 'openrouter/free';
const CLOUDFLARE_MODEL = Deno.env.get('ROYAL_AI_CLOUDFLARE_MODEL') || '@cf/meta/llama-3.1-8b-instruct-fp8-fast';
const COHERE_MODEL = Deno.env.get('ROYAL_AI_COHERE_MODEL') || 'command-a-03-2025';
const PROVIDER_TIMEOUT_MS = 8000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}
function safeMessage(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}
function providerError(provider: string, status: number, message: string) {
  return Object.assign(new Error(safeMessage(message)), { provider, status });
}
function providerTimeoutSignal() { return AbortSignal.timeout(PROVIDER_TIMEOUT_MS); }

const SYSTEM_PROMPT = `
Você é a Royal AI da Store Royal. Responda em português do Brasil.
Auxilie a administração com produtos, dropshipping, fornecedores, catálogo, marketing, vendas, métricas e relatórios.
Não invente vendas, estoque, preços, fornecedores ou métricas. Diferencie fatos de estimativas.
Não execute pagamentos nem altere pedidos. Não exponha chaves, tokens ou dados privados.
Produtos podem ser preparados para cadastro, mas só podem ser publicados depois de confirmação explícita do administrador.
Se faltarem dados para um produto, solicite somente os dados faltantes. Priorize soluções de custo zero durante o bootstrap.
`.trim();

async function callGemini(prompt: string) {
  if (!GEMINI_API_KEY) throw providerError('gemini', 503, 'GEMINI_API_KEY ausente.');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: 'POST', signal: providerTimeoutSignal(), headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1200 } }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError('gemini', response.status, data?.error?.message || `Gemini HTTP ${response.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p: {text?: string}) => p?.text || '').join('\n').trim();
  if (!text) throw providerError('gemini', 502, 'Gemini retornou resposta vazia.');
  return { text, provider: 'gemini', model: GEMINI_MODEL };
}
async function callGroq(prompt: string) {
  if (!GROQ_API_KEY) throw providerError('groq', 503, 'GROQ_API_KEY ausente.');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', signal: providerTimeoutSignal(), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }], temperature: 0.2, max_completion_tokens: 1200 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError('groq', response.status, data?.error?.message || `Groq HTTP ${response.status}`);
  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw providerError('groq', 502, 'Groq retornou resposta vazia.');
  return { text, provider: 'groq', model: GROQ_MODEL };
}
async function callOpenRouter(prompt: string) {
  if (!OPENROUTER_API_KEY) throw providerError('openrouter', 503, 'OPENROUTER_API_KEY ausente.');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: providerTimeoutSignal(), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }], temperature: 0.2, max_tokens: 1200 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError('openrouter', response.status, data?.error?.message || `OpenRouter HTTP ${response.status}`);
  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw providerError('openrouter', 502, 'OpenRouter retornou resposta vazia.');
  return { text, provider: 'openrouter', model: data?.model || OPENROUTER_MODEL };
}
async function callCloudflare(prompt: string) {
  if (!CLOUDFLARE_AI_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) throw providerError('cloudflare', 503, 'Configuração do Cloudflare Workers AI ausente.');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/ai/run/${CLOUDFLARE_MODEL}`, {
    method: 'POST', signal: providerTimeoutSignal(), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CLOUDFLARE_AI_API_TOKEN}` },
    body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }] }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) throw providerError('cloudflare', response.status, data?.errors?.[0]?.message || data?.error || `Cloudflare HTTP ${response.status}`);
  const text = String(data?.result?.response || data?.result?.text || '').trim();
  if (!text) throw providerError('cloudflare', 502, 'Cloudflare Workers AI retornou resposta vazia.');
  return { text, provider: 'cloudflare', model: CLOUDFLARE_MODEL };
}
async function callCohere(prompt: string) {
  if (!COHERE_API_KEY) throw providerError('cohere', 503, 'COHERE_API_KEY ausente.');
  const response = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST', signal: providerTimeoutSignal(), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${COHERE_API_KEY}` },
    body: JSON.stringify({ model: COHERE_MODEL, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }], temperature: 0.2, max_tokens: 1200 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError('cohere', response.status, data?.message || `Cohere HTTP ${response.status}`);
  const text = data?.message?.content?.filter((i: {type?: string}) => i?.type === 'text')?.map((i: {text?: string}) => i?.text || '').join('\n').trim();
  if (!text) throw providerError('cohere', 502, 'Cohere retornou resposta vazia.');
  return { text, provider: 'cohere', model: COHERE_MODEL };
}
async function callProvider(provider: string, prompt: string) {
  if (provider === 'gemini') return callGemini(prompt);
  if (provider === 'groq') return callGroq(prompt);
  if (provider === 'openrouter') return callOpenRouter(prompt);
  if (provider === 'cloudflare') return callCloudflare(prompt);
  if (provider === 'cohere') return callCohere(prompt);
  throw providerError(provider, 503, 'Provedor não suportado.');
}

function normalizeProduct(raw: Record<string, unknown>) {
  const num = (v: unknown, fallback: number | null = null) => {
    if (v === '' || v === null || v === undefined) return fallback;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    name: String(raw.name || '').trim(), description: String(raw.description || '').trim(), price: num(raw.price), sale_price: num(raw.sale_price),
    discount: num(raw.discount, 0), stock: num(raw.stock), commission: num(raw.commission, 0), image: String(raw.image || '').trim(), category: String(raw.category || '').trim(), active: true,
  };
}
function missingProductFields(p: ReturnType<typeof normalizeProduct>) {
  const missing: string[] = [];
  if (!p.name) missing.push('nome'); if (!p.description) missing.push('descrição'); if (p.price === null || p.price < 0) missing.push('preço bruto/custo');
  if (p.sale_price === null || p.sale_price < 0) missing.push('preço de venda'); if (p.stock === null || !Number.isInteger(p.stock) || p.stock < 0) missing.push('estoque');
  if (!p.image) missing.push('imagem (URL)'); if (!p.category) missing.push('categoria'); if (p.discount === null || p.discount < 0 || p.discount > 100) missing.push('desconto válido (0 a 100%)');
  if (p.commission === null || p.commission < 0 || p.commission > 100) missing.push('comissão válida (0 a 100%)'); return missing;
}
function productPreview(p: ReturnType<typeof normalizeProduct>, missing: string[]) {
  const money = (v: number | null) => v === null ? 'não informado' : `R$ ${v.toFixed(2).replace('.', ',')}`;
  const lines = ['Prévia do produto:', `Nome: ${p.name || 'não informado'}`, `Descrição: ${p.description || 'não informada'}`, `Preço bruto/custo: ${money(p.price)}`, `Preço de venda: ${money(p.sale_price)}`, `Desconto: ${p.discount ?? 0}%`, `Estoque: ${p.stock ?? 'não informado'}`, `Comissão: ${p.commission ?? 0}%`, `Categoria: ${p.category || 'não informada'}`, `Imagem: ${p.image || 'não informada'}`];
  if (missing.length) lines.push('', `Ainda faltam: ${missing.join(', ')}.`, 'Envie essas informações para eu completar o cadastro.');
  else lines.push('', 'Todos os dados estão completos. Responda “confirmar” para cadastrar este produto na Store Royal, ou “cancelar” para descartar.'); return lines.join('\n');
}
function parseJsonObject(text: string) {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim(); const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA não retornou os dados do produto em formato válido.'); return JSON.parse(cleaned.slice(start, end + 1));
}
function isProductIntent(prompt: string) { return /(adicion|cadastr|cri|inclu|coloc).{0,40}produto|produto.{0,40}(adicion|cadastr|cri|inclu|coloc)/i.test(prompt); }
function isConfirmation(prompt: string) { return /^(sim|confirmar|confirmo|pode adicionar|pode cadastrar|cadastre|pode incluir|confirmado)$/i.test(prompt.trim()); }
function isCancellation(prompt: string) { return /^(não|nao|cancelar|cancela|descartar|desista)$/i.test(prompt.trim()); }

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
    if (!SUPABASE_URL || !DB_SECRET) return json({ error: 'Servidor não configurado corretamente.' }, 503);
    const authorization = req.headers.get('Authorization') || ''; const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!accessToken) return json({ error: 'Autenticação obrigatória.' }, 401);
    const admin = createClient(SUPABASE_URL, DB_SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken); if (authError || !authData.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
    const { data: profile, error: profileError } = await admin.from('profiles').select('role,is_active').eq('id', authData.user.id).maybeSingle();
    if (profileError || !profile || profile.role !== 'admin' || profile.is_active !== true) return json({ error: 'Acesso restrito a administradores ativos.' }, 403);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null; if (!body) return json({ error: 'Corpo da requisição inválido.' }, 400); const action = String(body.action || 'generate').trim();
    if (action === 'status') {
      const [{ data: settings }, { data: providers }] = await Promise.all([admin.from('royal_ai_settings').select('bootstrap_mode,allow_paid_providers,automation_enabled,max_concurrent_tasks').eq('id', true).maybeSingle(), admin.from('royal_ai_providers').select('provider_key,display_name,model,priority,enabled,free_only,status,cooldown_until,last_success_at,last_failure_at,last_error_code').order('priority')]);
      return json({ ok: true, settings, providers });
    }
    if (action !== 'generate') return json({ error: 'Ação inválida.' }, 400);
    const prompt = String(body.prompt || '').trim(); if (!prompt || prompt.length > 12000) return json({ error: 'Prompt inválido.' }, 400);
    const { data: settings } = await admin.from('royal_ai_settings').select('bootstrap_mode,allow_paid_providers').eq('id', true).maybeSingle();
    if (!settings?.bootstrap_mode || settings?.allow_paid_providers) return json({ error: 'Royal AI está fora do modo bootstrap seguro. Operação bloqueada para revisão.' }, 503);
    const { data: providers } = await admin.from('royal_ai_providers').select('provider_key,enabled,free_only,status,cooldown_until,priority').eq('enabled', true).eq('free_only', true).order('priority');
    const supported = ['gemini','groq','openrouter','cloudflare','cohere']; const now = Date.now();
    const eligible = (providers || []).filter(p => supported.includes(p.provider_key) && p.status !== 'disabled' && p.status !== 'quota_exhausted' && (!p.cooldown_until || new Date(p.cooldown_until).getTime() <= now));
    const { data: pendingRows } = await admin.from('royal_ai_tasks').select('id,payload,created_at').eq('task_type', 'product_create_pending').eq('status', 'waiting_provider').order('created_at', { ascending: false }).limit(20);
    const pending = (pendingRows || []).find((r: any) => r?.payload?.admin_user_id === authData.user.id) || null;
    if (pending && isCancellation(prompt)) { await admin.from('royal_ai_tasks').delete().eq('id', pending.id); return json({ ok: true, provider: 'royal-ai', model: 'product-manager', text: 'Cadastro cancelado. O produto não foi publicado.' }); }
    if (pending && isConfirmation(prompt)) {
      const product = normalizeProduct((pending.payload?.product || {}) as Record<string, unknown>); const missing = missingProductFields(product);
      if (missing.length) return json({ ok: true, provider: 'royal-ai', model: 'product-manager', text: productPreview(product, missing) });
      const id = `prod_${Date.now()}`; const { data: created, error: createError } = await admin.from('products').insert({ id, ...product }).select('*').single();
      if (createError) return json({ error: `Não foi possível cadastrar o produto: ${createError.message}` }, 500);
      await admin.from('royal_ai_tasks').delete().eq('id', pending.id); await admin.from('royal_ai_logs').insert({ provider_key: 'royal-ai', event_type: 'product_created', level: 'info', message: 'Produto cadastrado pela Royal AI após confirmação do administrador.', details: { product_id: id, admin_user_id: authData.user.id } });
      return json({ ok: true, provider: 'royal-ai', model: 'product-manager', product: created, text: `Produto “${product.name}” cadastrado com sucesso na Store Royal. Ele já está ativo no catálogo.` });
    }
    const shouldHandleProduct = !!pending || isProductIntent(prompt);
    if (shouldHandleProduct) {
      const previous = pending?.payload?.product || {}; const extractionPrompt = `Você é um extrator de dados de produto. Retorne SOMENTE JSON válido, sem markdown.\nCampos: name, description, price, sale_price, discount, stock, commission, image, category.\nprice = preço bruto/custo informado. sale_price = preço de venda. discount e commission são percentuais. Não invente dados ausentes; preserve dados anteriores quando a nova mensagem não os substituir.\nDados anteriores: ${JSON.stringify(previous)}\nNova mensagem do administrador: ${prompt}\nJSON:`;
      let extracted: any = null; let used: any = null; const errors: any[] = [];
      for (const p of eligible) { try { used = await callProvider(p.provider_key, extractionPrompt); extracted = parseJsonObject(used.text); break; } catch (e: any) { errors.push({ provider: p.provider_key, status: Number(e?.status || 500), message: safeMessage(e?.message) }); } }
      if (!extracted) return json({ ok: false, error: 'Não foi possível interpretar os dados do produto agora.', providers: errors.map(e => ({provider:e.provider,status:e.status})) }, 503);
      const product = normalizeProduct({ ...previous, ...extracted }); const missing = missingProductFields(product); const payload = { admin_user_id: authData.user.id, product, missing, updated_at: new Date().toISOString() };
      if (pending) await admin.from('royal_ai_tasks').update({ payload, last_error: null }).eq('id', pending.id); else await admin.from('royal_ai_tasks').insert({ task_type: 'product_create_pending', priority: 1, status: 'waiting_provider', payload, last_error: null });
      return json({ ok: true, provider: used.provider, model: used.model, product_draft: product, missing_fields: missing, awaiting_confirmation: missing.length === 0, text: productPreview(product, missing) });
    }
    const errors: Array<{provider:string,status:number,message:string}> = [];
    for (const p of eligible) {
      try {
        const result = await callProvider(p.provider_key, prompt);
        await admin.from('royal_ai_providers').update({ status:'available', consecutive_failures:0, cooldown_until:null, last_success_at:new Date().toISOString(), last_error_code:null, last_error_message:null, model:result.model, updated_at:new Date().toISOString() }).eq('provider_key', result.provider);
        await admin.from('royal_ai_logs').insert({ provider_key: result.provider, event_type:'generation_success', level:'info', message:'Geração concluída pelo Royal AI Gateway.', details:{model:result.model} }); return json({ ok:true, provider:result.provider, model:result.model, text:result.text });
      } catch (e: any) {
        const status = Number(e?.status || 500); const provider = String(e?.provider || p.provider_key); const message = safeMessage(e?.message || e); errors.push({provider,status,message});
        const cooldown = status === 429 ? new Date(Date.now()+15*60*1000).toISOString() : status === 503 ? new Date(Date.now()+5*60*1000).toISOString() : null;
        try { await admin.from('royal_ai_providers').update({ status: status === 429 ? 'rate_limited' : 'error', cooldown_until:cooldown, last_failure_at:new Date().toISOString(), last_error_code:String(status), last_error_message:message, updated_at:new Date().toISOString() }).eq('provider_key', provider); } catch (_) {}
      }
    }
    const { data: task } = await admin.from('royal_ai_tasks').insert({ task_type:'generate_text', priority:5, status:'waiting_provider', payload:{prompt}, last_error:'Nenhum provedor gratuito disponível.' }).select('id').single();
    return json({ ok:false, queued:true, task_id:task?.id || null, error:'Nenhum provedor gratuito está disponível agora. A tarefa foi colocada na fila.', providers:errors.map(({provider,status})=>({provider,status})) }, 503);
  } catch (fatalError) { return json({ ok:false, diagnostic:true, error:fatalError instanceof Error ? fatalError.message : String(fatalError) }, 500); }
});