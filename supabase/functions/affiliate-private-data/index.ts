import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://equipezero-web.github.io',
  'Access-Control-Allow-Headers': 'apikey, x-client-info, content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
// Prefere a chave secreta atual; usa a chave legada como fallback em projetos que ainda a disponibilizam.
const DB_SECRET = SECRET_KEYS.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SESSION_SECRET = Deno.env.get('AFFILIATE_SESSION_SECRET') || '';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}
function b64url(bytes: Uint8Array) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function validCpf(value: string) {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let digit = (sum * 10) % 11; if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  digit = (sum * 10) % 11; if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
}
function fromB64url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function verifyToken(token: string) {
  if (!SESSION_SECRET || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, fromB64url(parts[1]), new TextEncoder().encode(parts[0]));
  if (!valid) return null;
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
  if (!claims?.sub || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
  return claims as { sub: string; exp: number; typ: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Método não permitido.' }, 405);
  if (!DB_SECRET || !SESSION_SECRET) return json({ error: 'Serviço de dados privados não configurado.' }, 503);

  const bearer = req.headers.get('Authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
  const claims = await verifyToken(token).catch(() => null);
  if (!claims || claims.typ !== 'affiliate_session') return json({ error: 'Sessão inválida ou expirada. Entre novamente.' }, 401);

  const admin = createClient(SUPABASE_URL, DB_SECRET);
  const { data: affiliate, error: affiliateError } = await admin.from('affiliates').select('id,status').eq('id', claims.sub).maybeSingle();
  if (affiliateError) {
    console.error('Falha ao verificar o status do afiliado:', affiliateError.message);
    return json({ error: 'Não foi possível validar a conta de afiliado.' }, 500);
  }
  if (!affiliate || affiliate.status === 'blocked') return json({ error: 'A conta de afiliado não está disponível.' }, 403);
  if (req.method === 'GET') {
    const { data, error } = await admin.from('affiliate_private_data')
      .select('phone,cpf,pix_type,pix_key,updated_at')
      .eq('affiliate_id', claims.sub).maybeSingle();
    if (error) {
      console.error('Falha ao consultar dados privados de afiliado:', error.message);
      return json({ error: 'Não foi possível carregar os dados privados.' }, 500);
    }
    return json({ ok: true, privateData: data || { phone: '', cpf: '', pix_type: '', pix_key: '' } });
  }

  const body = await req.json().catch(() => null);
  const phone = String(body?.phone || '').trim().slice(0, 30);
  const cpf = String(body?.cpf || '').replace(/\D/g, '').slice(0, 11);
  const pix_type = String(body?.pix_type || '').trim().slice(0, 30);
  const pix_key = String(body?.pix_key || '').trim().slice(0, 200);
  const name = String(body?.name || '').trim().slice(0, 160);
  const instagram = String(body?.instagram || '').trim().slice(0, 200);
  const website = String(body?.website || '').trim().slice(0, 300);
  if (!name || !phone || !validCpf(cpf) || !pix_type || !pix_key) {
    return json({ error: 'Informe nome, telefone, CPF e dados Pix válidos.' }, 400);
  }
  const { error } = await admin.from('affiliate_private_data').upsert({
    affiliate_id: claims.sub, phone, cpf, pix_type, pix_key, updated_at: new Date().toISOString()
  }, { onConflict: 'affiliate_id' });
  if (error) {
    console.error('Falha ao atualizar dados privados de afiliado:', error.message);
    return json({ error: 'Não foi possível salvar os dados privados.' }, 500);
  }
  const { error: profileError } = await admin.from('affiliates').update({
    name, instagram: instagram || null, website: website || null, updated_at: new Date().toISOString()
  }).eq('id', claims.sub);
  if (profileError) {
    console.error('Falha ao atualizar perfil público de afiliado:', profileError.message);
    return json({ error: 'Os dados privados foram salvos, mas não foi possível atualizar o perfil.' }, 500);
  }
  return json({ ok: true });
});
