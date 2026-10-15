import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://equipezero-web.github.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-supabase-api-version',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const DB_SECRET = SECRET_KEYS.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SESSION_SECRET = Deno.env.get('AFFILIATE_SESSION_SECRET') || '';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function b64urlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function verifyAffiliateToken(token: string) {
  if (!SESSION_SECRET || token.length > 4096) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[1]), new TextEncoder().encode(parts[0]))) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    if (claims?.typ !== 'affiliate_session' || !claims?.sub || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return { affiliateId: String(claims.sub) };
  } catch { return null; }
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
const allowedProfileFields = new Set(['name', 'instagram', 'website', 'phone', 'cpf', 'pix_type', 'pix_key']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!SUPABASE_URL || !DB_SECRET) return json({ error: 'Servidor não configurado.' }, 503);

  const bearer = req.headers.get('Authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
  if (!token) return json({ error: 'Sessão inválida ou expirada. Entre novamente.' }, 401);

  const admin = createClient(SUPABASE_URL, DB_SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  let affiliateId = '';
  let adminUserId = '';
  const affiliateClaims = await verifyAffiliateToken(token);
  if (affiliateClaims) {
    affiliateId = affiliateClaims.affiliateId;
  } else {
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
    const { data: profile, error: profileError } = await admin.from('profiles').select('id,role,is_active').eq('id', authData.user.id).maybeSingle();
    if (profileError || !profile || profile.role !== 'admin' || profile.is_active !== true) {
      return json({ error: 'Acesso restrito a administradores ativos.' }, 403);
    }
    adminUserId = authData.user.id;
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Corpo da requisição inválido.' }, 400);
  const action = String(body.action || '');
  const isAdmin = Boolean(adminUserId);

  if (!isAdmin) {
    const { data: affiliate, error } = await admin.from('affiliates').select('id,status').eq('id', affiliateId).maybeSingle();
    if (error || !affiliate || affiliate.status !== 'active') return json({ error: 'A conta de afiliado não está ativa.' }, 403);
  }

  if (action === 'send_message') {
    if (isAdmin) return json({ error: 'Esta operação é exclusiva do afiliado.' }, 403);
    const message = String(body.message || '').trim();
    if (!message || message.length > 4000) return json({ error: 'A mensagem deve ter entre 1 e 4000 caracteres.' }, 400);
    const { data, error } = await admin.from('affiliate_messages').insert({
      affiliate_id: affiliateId, sender_role: 'affiliate', sender_user_id: affiliateId, message
    }).select('id,affiliate_id,sender_role,message,created_at,read_at').single();
    if (error) { console.error('Mensagem de afiliado:', error.message); return json({ error: 'Não foi possível enviar a mensagem.' }, 500); }
    return json({ ok: true, message: data });
  }

  if (action === 'request_profile_change') {
    if (isAdmin) return json({ error: 'Esta operação é exclusiva do afiliado.' }, 403);
    const raw = body.changes && typeof body.changes === 'object' ? body.changes : {};
    const changes: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!allowedProfileFields.has(key) || typeof value !== 'string') continue;
      const clean = value.trim().slice(0, key === 'website' ? 300 : key === 'pix_key' ? 200 : key === 'instagram' ? 200 : 160);
      if (clean) changes[key] = clean;
    }
    if (!Object.keys(changes).length) return json({ error: 'Informe ao menos um campo para alterar.' }, 400);
    if (changes.cpf) changes.cpf = changes.cpf.replace(/\D/g, '');
    const { data: pending } = await admin.from('affiliate_profile_change_requests').select('id').eq('affiliate_id', affiliateId).eq('status', 'pending').limit(1).maybeSingle();
    if (pending) return json({ error: 'Você já possui uma solicitação aguardando análise do administrador.' }, 409);
    const { data, error } = await admin.from('affiliate_profile_change_requests').insert({
      affiliate_id: affiliateId, proposed_changes: changes
    }).select('id,status,requested_at').single();
    if (error) { console.error('Solicitação de alteração:', error.message); return json({ error: 'Não foi possível enviar a solicitação.' }, 500); }
    return json({ ok: true, request: data });
  }

  if (action === 'list_messages') {
    if (!isAdmin) {
      const { error: markError } = await admin.from('affiliate_messages').update({ read_at: new Date().toISOString() })
        .eq('affiliate_id', affiliateId).eq('sender_role', 'admin').is('read_at', null);
      if (markError) console.warn('Marcação de leitura:', markError.message);
    } else {
      const targetId = String(body.affiliate_id || '');
      if (!targetId) return json({ error: 'Afiliado não informado.' }, 400);
      affiliateId = targetId;
      const { error: markError } = await admin.from('affiliate_messages').update({ read_at: new Date().toISOString() })
        .eq('affiliate_id', affiliateId).eq('sender_role', 'affiliate').is('read_at', null);
      if (markError) console.warn('Marcação de leitura:', markError.message);
    }
    const { data, error } = await admin.from('affiliate_messages').select('id,affiliate_id,sender_role,sender_user_id,message,created_at,read_at')
      .eq('affiliate_id', affiliateId).order('created_at', { ascending: true }).limit(500);
    if (error) { console.error('Histórico de mensagens:', error.message); return json({ error: 'Não foi possível carregar a conversa.' }, 500); }
    return json({ ok: true, messages: data || [] });
  }

  if (action === 'admin_list_conversations') {
    if (!isAdmin) return json({ error: 'Acesso restrito a administradores.' }, 403);
    const { data: affiliates, error } = await admin.from('affiliates')
      .select('id,name,affiliate_email,status,user_id').eq('status', 'active').order('name', { ascending: true });
    if (error) { console.error('Lista de afiliados:', error.message); return json({ error: 'Não foi possível carregar os afiliados.' }, 500); }
    const ids = (affiliates || []).map(a => String(a.id));
    const { data: messages } = ids.length ? await admin.from('affiliate_messages')
      .select('affiliate_id,sender_role,read_at,created_at,message').in('affiliate_id', ids)
      .order('created_at', { ascending: false }).limit(2000) : { data: [] as any[] };
    const lastById: Record<string, any> = {};
    const unreadById: Record<string, number> = {};
    for (const m of messages || []) {
      if (!lastById[m.affiliate_id]) lastById[m.affiliate_id] = m;
      if (m.sender_role === 'affiliate' && !m.read_at) unreadById[m.affiliate_id] = (unreadById[m.affiliate_id] || 0) + 1;
    }
    const withPhotos = await Promise.all((affiliates || []).map(async a => {
      let avatar_url = '';
      if (a.user_id) {
        const { data: authUser } = await admin.auth.admin.getUserById(String(a.user_id));
        avatar_url = String(authUser?.user?.user_metadata?.avatar_url || '');
      }
      return { ...a, avatar_url, unread_count: unreadById[a.id] || 0, last_message: lastById[a.id] || null };
    }));
    return json({ ok: true, affiliates: withPhotos });
  }

  if (action === 'admin_reply') {
    if (!isAdmin) return json({ error: 'Acesso restrito a administradores.' }, 403);
    const targetId = String(body.affiliate_id || '');
    const message = String(body.message || '').trim();
    if (!targetId || !message || message.length > 4000) return json({ error: 'Informe o afiliado e uma mensagem de até 4000 caracteres.' }, 400);
    const { data: target, error: targetError } = await admin.from('affiliates').select('id,status').eq('id', targetId).eq('status', 'active').maybeSingle();
    if (targetError || !target) return json({ error: 'Afiliado ativo não encontrado.' }, 404);
    const { data, error } = await admin.from('affiliate_messages').insert({
      affiliate_id: targetId, sender_role: 'admin', sender_user_id: adminUserId, message
    }).select('id,affiliate_id,sender_role,message,created_at,read_at').single();
    if (error) { console.error('Resposta administrativa:', error.message); return json({ error: 'Não foi possível enviar a resposta.' }, 500); }
    return json({ ok: true, message: data });
  }

  if (action === 'admin_list_profile_requests') {
    if (!isAdmin) return json({ error: 'Acesso restrito a administradores.' }, 403);
    const { data, error } = await admin.from('affiliate_profile_change_requests').select('id,affiliate_id,proposed_changes,status,requested_at')
      .eq('status', 'pending').order('requested_at', { ascending: true }).limit(500);
    if (error) { console.error('Solicitações pendentes:', error.message); return json({ error: 'Não foi possível carregar as solicitações.' }, 500); }
    const ids = [...new Set((data || []).map(r => String(r.affiliate_id)))];
    const { data: affiliates } = ids.length ? await admin.from('affiliates').select('id,name,affiliate_email,user_id').in('id', ids) : { data: [] as any[] };
    const byId = Object.fromEntries((affiliates || []).map(a => [String(a.id), a]));
    return json({ ok: true, requests: (data || []).map(r => ({ ...r, affiliate: byId[String(r.affiliate_id)] || null })) });
  }

  if (action === 'admin_review_profile_request') {
    if (!isAdmin) return json({ error: 'Acesso restrito a administradores.' }, 403);
    const requestId = String(body.request_id || '');
    const decision = String(body.decision || '');
    const adminNote = String(body.admin_note || '').trim().slice(0, 1000);
    if (!requestId || !['approved', 'rejected'].includes(decision)) return json({ error: 'Decisão inválida.' }, 400);
    const { data: request, error: requestError } = await admin.from('affiliate_profile_change_requests')
      .select('id,affiliate_id,proposed_changes,status').eq('id', requestId).eq('status', 'pending').maybeSingle();
    if (requestError || !request) return json({ error: 'Solicitação não encontrada ou já analisada.' }, 404);
    if (decision === 'approved') {
      const { data: affiliate, error: affiliateError } = await admin.from('affiliates')
        .select('id,name,affiliate_email,status,instagram,website').eq('id', request.affiliate_id).maybeSingle();
      if (affiliateError || !affiliate) return json({ error: 'Afiliado não encontrado.' }, 404);
      const { data: privateData, error: privateError } = await admin.from('affiliate_private_data')
        .select('phone,cpf,pix_type,pix_key').eq('affiliate_id', request.affiliate_id).maybeSingle();
      if (privateError) return json({ error: 'Não foi possível carregar os dados privados atuais.' }, 500);
      const changes = request.proposed_changes as Record<string, string>;
      const name = changes.name ?? affiliate.name;
      const email = affiliate.affiliate_email;
      const status = affiliate.status;
      const phone = changes.phone ?? privateData?.phone ?? '';
      const cpf = (changes.cpf ?? privateData?.cpf ?? '').replace(/\D/g, '');
      const pixType = changes.pix_type ?? privateData?.pix_type ?? '';
      const pixKey = changes.pix_key ?? privateData?.pix_key ?? '';
      if (!String(name || '').trim() || !String(email || '').trim() || !phone || !validCpf(cpf) || !pixType || !pixKey) {
        return json({ error: 'Não foi possível aprovar: confira nome, telefone, CPF e dados Pix do afiliado.' }, 400);
      }
      const { error: updateError } = await admin.rpc('admin_update_affiliate_atomic', {
        p_admin_user_id: adminUserId,
        p_affiliate_id: String(request.affiliate_id),
        p_name: String(name),
        p_email: String(email),
        p_status: String(status),
        p_instagram: changes.instagram ?? affiliate.instagram ?? null,
        p_website: changes.website ?? affiliate.website ?? null,
        p_phone: String(phone),
        p_cpf: cpf,
        p_pix_type: String(pixType),
        p_pix_key: String(pixKey)
      });
      if (updateError) {
        console.error('Aplicação de alteração aprovada:', updateError.message);
        return json({ error: 'Não foi possível aplicar a alteração aprovada.' }, 500);
      }
    }
    const { error: reviewError } = await admin.from('affiliate_profile_change_requests').update({
      status: decision, reviewed_at: new Date().toISOString(), reviewed_by: adminUserId, admin_note: adminNote || null
    }).eq('id', requestId).eq('status', 'pending');
    if (reviewError) { console.error('Registro da decisão:', reviewError.message); return json({ error: 'A alteração foi processada, mas não foi possível registrar a decisão. Contate o suporte.' }, 500); }
    return json({ ok: true, status: decision });
  }

  return json({ error: 'Operação desconhecida.' }, 400);
});
