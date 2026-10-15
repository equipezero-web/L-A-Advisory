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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!SUPABASE_URL || !DB_SECRET) return json({ error: 'Servidor não configurado corretamente.' }, 503);

  const authorization = req.headers.get('Authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!accessToken) return json({ error: 'Autenticação obrigatória.' }, 401);

  const authClient = createClient(SUPABASE_URL, DB_SECRET, {
    global: { headers: { Authorization: 'Bearer ' + accessToken } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);

  const admin = createClient(SUPABASE_URL, DB_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role,is_active')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Falha ao validar administrador:', profileError.message);
    return json({ error: 'Não foi possível validar as permissões administrativas.' }, 500);
  }
  if (profile?.role !== 'admin' || profile?.is_active !== true) {
    return json({ error: 'Acesso restrito a administradores ativos.' }, 403);
  }

  const body = await req.json().catch(() => null);
  const id = String(body?.id || '').trim();
  const name = String(body?.name || '').trim().slice(0, 160);
  const email = String(body?.affiliate_email || '').trim().toLowerCase().slice(0, 160);
  const status = String(body?.status || '').trim().toLowerCase();
  const instagram = String(body?.instagram || '').trim().slice(0, 200);
  const website = String(body?.website || '').trim().slice(0, 300);
  const phone = String(body?.phone || '').trim().slice(0, 30);
  const cpf = String(body?.cpf || '').replace(/\D/g, '').slice(0, 11);
  const pix_type = String(body?.pix_type || '').trim().slice(0, 30);
  const pix_key = String(body?.pix_key || '').trim().slice(0, 200);

  if (!id || !name || !/^\S+@\S+\.\S+$/.test(email) || !['pending', 'active', 'approved', 'blocked', 'rejected'].includes(status)) {
    return json({ error: 'Dados de afiliado inválidos.' }, 400);
  }
  if (!phone || cpf.length !== 11 || !pix_type || !pix_key) {
    return json({ error: 'Informe telefone, CPF e dados Pix válidos.' }, 400);
  }

  const { data: affiliate, error: updateError } = await admin.from('affiliates').update({
    name, affiliate_email: email, status,
    instagram: instagram || null, website: website || null,
    updated_at: new Date().toISOString()
  }).eq('id', id).select('id').maybeSingle();
  if (updateError) {
    console.error('Falha ao atualizar afiliado:', updateError.message);
    return json({ error: 'Não foi possível atualizar o afiliado.' }, 500);
  }
  if (!affiliate) return json({ error: 'Afiliado não encontrado.' }, 404);

  const { error: privateError } = await admin.from('affiliate_private_data').upsert({
    affiliate_id: id, phone, cpf, pix_type, pix_key, updated_at: new Date().toISOString()
  }, { onConflict: 'affiliate_id' });
  if (privateError) {
    console.error('Falha ao atualizar dados privados do afiliado:', privateError.message);
    return json({ error: 'O perfil foi atualizado, mas os dados privados não puderam ser salvos.' }, 500);
  }

  return json({ ok: true });
});
