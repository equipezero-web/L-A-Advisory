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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function validCpf(value: string) {
  const cpf = value.replace(/\D/g, '');
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

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Corpo da requisição inválido.' }, 400);

  const id = String(body.id || '').trim().slice(0, 160);
  const name = String(body.name || '').trim().slice(0, 160);
  const email = String(body.affiliate_email || '').trim().toLowerCase().slice(0, 160);
  const status = String(body.status || '').trim().toLowerCase();
  const instagram = String(body.instagram || '').trim().slice(0, 200);
  const website = String(body.website || '').trim().slice(0, 300);
  const phone = String(body.phone || '').trim().slice(0, 30);
  const cpf = String(body.cpf || '').replace(/\D/g, '');
  const pix_type = String(body.pix_type || '').trim().slice(0, 30);
  const pix_key = String(body.pix_key || '').trim().slice(0, 200);

  if (!id || !name || !/^\S+@\S+\.\S+$/.test(email) ||
      !['pending', 'active', 'blocked'].includes(status)) {
    return json({ error: 'Dados de afiliado inválidos.' }, 400);
  }
  if (!phone || !validCpf(cpf) || !pix_type || !pix_key) {
    return json({ error: 'Informe telefone, CPF válido e dados Pix.' }, 400);
  }

  // Both table changes happen in one PostgreSQL function invocation, so either
  // both succeed or both are rolled back. The RPC re-checks active admin status.
  const { error } = await admin.rpc('admin_update_affiliate_atomic', {
    p_admin_user_id: authData.user.id,
    p_affiliate_id: id,
    p_name: name,
    p_email: email,
    p_status: status,
    p_instagram: instagram || null,
    p_website: website || null,
    p_phone: phone,
    p_cpf: cpf,
    p_pix_type: pix_type,
    p_pix_key: pix_key
  });

  if (error) {
    console.error('Falha na atualização administrativa do afiliado:', error.message);
    if (error.code === '42501') return json({ error: 'Acesso restrito a administradores ativos.' }, 403);
    if (error.code === 'P0002') return json({ error: 'Afiliado não encontrado.' }, 404);
    if (error.code === '22023') return json({ error: 'Dados de afiliado inválidos.' }, 400);
    return json({ error: 'Não foi possível atualizar os dados do afiliado.' }, 500);
  }

  return json({ ok: true });
});
