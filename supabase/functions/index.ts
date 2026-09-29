import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function code() { return `AFF${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Não autenticado.' }, 401);
  const userClient = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Sessão inválida.' }, 401);
  const admin = createClient(URL, SERVICE);
  const body = await req.json().catch(() => null) || {};

  const { data: existing } = await admin.from('affiliates').select('id,code,status').eq('user_id', user.id).maybeSingle();
  if (existing) return json({ ok: true, affiliate: existing });

  const profile = await admin.from('profiles').select('full_name,email').eq('id', user.id).single();
  let affiliateCode = code();
  for (let i = 0; i < 5; i++) {
    const { data: collision } = await admin.from('affiliates').select('id').eq('code', affiliateCode).maybeSingle();
    if (!collision) break;
    affiliateCode = code();
  }

  const { data: affiliate, error } = await admin.from('affiliates').insert({
    id: crypto.randomUUID(), user_id: user.id, code: affiliateCode, status: 'pending',
    name: String(body.name || profile.data?.full_name || '').slice(0, 160),
    phone: String(body.phone || '').slice(0, 40), cpf: String(body.cpf || '').replace(/\D/g, '').slice(0, 11),
    pix_type: String(body.pixType || '').slice(0, 30), pix_key: String(body.pixKey || '').slice(0, 200),
    instagram: String(body.instagram || '').slice(0, 200), website: String(body.website || '').slice(0, 500),
  }).select('id,code,status,name').single();
  if (error) return json({ error: 'Não foi possível enviar a solicitação de afiliado.' }, 500);
  return json({ ok: true, affiliate });
});
