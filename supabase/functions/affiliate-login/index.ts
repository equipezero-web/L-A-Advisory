import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://equipezero-web.github.io',
  'Access-Control-Allow-Headers': 'apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const SECRET = SECRET_KEYS.default;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}
function b64(bytes: Uint8Array) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s);
}
function fromB64(value: string) {
  const s = atob(value); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function hashPassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, key, 256);
  return b64(new Uint8Array(bits));
}
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!SECRET) return json({ error: 'Servidor não configurado corretamente.' }, 500);

  const body = await req.json().catch(() => null);
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!email || !password) return json({ error: 'Preencha e-mail e senha.' }, 400);

  const admin = createClient(SUPABASE_URL, SECRET);
  const { data: affiliate, error } = await admin.from('affiliates')
    .select('id,code,status,name,email,affiliate_email,affiliate_password_hash,affiliate_password_salt,phone,cpf,pix_type,pix_key,instagram,website,user_id,total_sales,total_commission')
    .ilike('affiliate_email', email)
    .maybeSingle();

  if (error) {
    console.error(error);
    return json({ error: 'Não foi possível realizar o login de afiliado.' }, 500);
  }
  if (!affiliate?.affiliate_password_hash || !affiliate?.affiliate_password_salt) {
    return json({ error: 'Conta de afiliado não configurada para este acesso.' }, 401);
  }

  let suppliedHash = '';
  try {
    suppliedHash = await hashPassword(password, fromB64(affiliate.affiliate_password_salt));
  } catch {
    return json({ error: 'Não foi possível validar a senha.' }, 500);
  }

  if (!equal(suppliedHash, affiliate.affiliate_password_hash)) {
    return json({ error: 'E-mail ou senha de afiliado incorretos.' }, 401);
  }
  if (affiliate.status === 'blocked') return json({ error: 'Seu perfil de afiliado está bloqueado. Contate o suporte.' }, 403);

  const safeAffiliate = {
    id: affiliate.id,
    code: affiliate.code,
    status: affiliate.status,
    name: affiliate.name,
    email: affiliate.affiliate_email || affiliate.email || email,
    phone: affiliate.phone,
    cpf: affiliate.cpf,
    pix_type: affiliate.pix_type,
    pix_key: affiliate.pix_key,
    instagram: affiliate.instagram,
    website: affiliate.website,
    user_id: affiliate.user_id || affiliate.id,
    total_sales: Number(affiliate.total_sales || 0),
    total_commission: Number(affiliate.total_commission || 0)
  };

  return json({ ok: true, affiliate: safeAffiliate });
});
