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
function emailOf(v: unknown) { return String(v || '').trim().toLowerCase().slice(0, 160); }
function cpfOf(v: unknown) { return String(v || '').replace(/\D/g, ''); }
function validCpf(v: unknown) {
  const cpf = cpfOf(v);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d = (sum * 10) % 11; if (d === 10) d = 0;
  if (d !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  d = (sum * 10) % 11; if (d === 10) d = 0;
  return d === Number(cpf[10]);
}
function b64(bytes: Uint8Array) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s);
}
async function hashPassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, key, 256);
  return b64(new Uint8Array(bits));
}
function code() { return 'AFF' + crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase(); }
function b64url(bytes: Uint8Array) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function createAffiliateSession(affiliateId: string) {
  const secret = Deno.env.get('AFFILIATE_SESSION_SECRET') || '';
  if (secret.length < 32) throw new Error('Sessão segura de afiliado não configurada.');
  const claims = b64url(new TextEncoder().encode(JSON.stringify({ sub: affiliateId, typ: 'affiliate_session', exp: Math.floor(Date.now() / 1000) + 3600 })));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(claims)));
  return claims + '.' + b64url(signature);
}

async function verifyTurnstile(token: unknown) {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret || typeof token !== 'string' || !token.trim()) return false;
  try {
    const form = new URLSearchParams({ secret, response: token, remoteip: '' });
    form.delete('remoteip');
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
    const result = await response.json();
    return response.ok && result.success === true && result.hostname === 'equipezero-web.github.io';
  } catch (error) {
    console.error('Falha na validação Turnstile:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!SECRET) return json({ error: 'Servidor não configurado corretamente.' }, 500);
  if ((Deno.env.get('AFFILIATE_SESSION_SECRET') || '').length < 32) return json({ error: 'O acesso de afiliado está temporariamente indisponível.' }, 503);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'JSON inválido.' }, 400);
  if (!(await verifyTurnstile(body.captchaToken))) return json({ error: 'Falha na verificação de segurança. Atualize a página e tente novamente.' }, 403);

  const name = String(body.name || body.fullName || '').trim().slice(0, 160);
  const email = emailOf(body.email);
  const phone = String(body.phone || '').trim().slice(0, 40);
  const cpf = cpfOf(body.cpf);
  const pixType = String(body.pixType || '').trim().slice(0, 30);
  const pixKey = String(body.pixKey || '').trim().slice(0, 200);
  const instagram = String(body.instagram || '').trim().slice(0, 200);
  const website = String(body.website || '').trim().slice(0, 300);
  const password = String(body.password || '');

  if (!name || !email || !phone || !cpf || !pixType || !pixKey || !password) return json({ error: 'Preencha todos os campos obrigatórios.' }, 400);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Informe um e-mail válido.' }, 400);
  if (password.length < 12) return json({ error: 'A senha do afiliado deve ter pelo menos 12 caracteres.' }, 400);
  if (!validCpf(cpf)) return json({ error: 'Informe um CPF válido.' }, 400);

  const admin = createClient(SUPABASE_URL, SECRET);

  const { data: existingEmailRows, error: emailError } = await admin.from('affiliates')
    .select('id,code,status,name,affiliate_email,affiliate_password_hash')
    .eq('affiliate_email', email)
    .limit(1);
  if (emailError) {
    console.error('Erro ao consultar e-mail do afiliado:', emailError);
    return json({ error: 'Não foi possível verificar o e-mail do afiliado.' }, 500);
  }
  const existingEmail = existingEmailRows?.[0] || null;
  if (existingEmail?.affiliate_password_hash) {
    return json({ error: 'Este e-mail já possui uma conta de afiliado. Use Entrar como afiliado ou Recuperar senha.' }, 409);
  }

  const { data: cpfAffiliate, error: cpfError } = await admin.from('affiliate_private_data')
    .select('affiliate_id').eq('cpf', cpf).maybeSingle();
  if (cpfError) return json({ error: 'Não foi possível verificar o CPF.' }, 500);
  if (cpfAffiliate) return json({ error: 'Este CPF já está cadastrado no programa de afiliados.' }, 409);

  const { data: customerProfile } = await admin.from('profiles')
    .select('id,email').ilike('email', email).maybeSingle();

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await hashPassword(password, salt);

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: affiliate, error } = await admin.from('affiliates').insert({
      id: crypto.randomUUID(),
      user_id: customerProfile?.id || null,
      code: code(),
      status: 'pending',
      name,
      affiliate_email: email,
      affiliate_password_hash: passwordHash,
      affiliate_password_salt: b64(salt),
      instagram: instagram || null,
      website: website || null,
      total_sales: 0,
      total_commission: 0
    }).select('id,code,status,name,affiliate_email,instagram,website,user_id,total_sales,total_commission').single();

    if (!error && affiliate) {
      const { error: privateError } = await admin.from('affiliate_private_data').upsert({
        affiliate_id: affiliate.id, phone, cpf, pix_type: pixType, pix_key: pixKey, updated_at: new Date().toISOString()
      }, { onConflict: 'affiliate_id' });
      if (privateError) {
        console.error('Falha ao salvar dados privados do novo afiliado:', privateError.message);
        await admin.from('affiliates').delete().eq('id', affiliate.id);
        return json({ error: 'Não foi possível salvar os dados privados do cadastro.' }, 500);
      }
      const sessionToken = await createAffiliateSession(String(affiliate.id));
      const safeAffiliate = { ...affiliate, user_id: affiliate.user_id || affiliate.id, email: affiliate.affiliate_email || affiliate.email || email };
      return json({ ok: true, affiliate: safeAffiliate, sessionToken, expiresIn: 3600 }, 201);
    }
    if (error?.code !== '23505') {
      console.error(error);
      return json({ error: 'Não foi possível criar seu cadastro de afiliado.' }, 500);
    }
  }
  return json({ error: 'Não foi possível gerar um código de afiliado. Tente novamente.' }, 500);
});
