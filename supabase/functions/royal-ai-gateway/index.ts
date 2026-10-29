import { createClient } from 'npm:@supabase/supabase-js@2';
import { isProductMutationIntent, mutationPreview, sanitizeProductMutation, validateProductMutation } from '../_shared/product-management.ts';

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
const TIMEOUT = 8000;

const SYSTEM_PROMPT = `Você é a Royal AI da Store Royal. Responda em português do Brasil. Auxilie a administração com produtos, dropshipping, fornecedores, catálogo, marketing, vendas, métricas e relatórios. Não invente vendas, estoque, preços, fornecedores ou métricas. Não execute pagamentos nem altere pedidos. Não exponha chaves, tokens ou dados privados. Alterações de produtos exigem confirmação explícita do administrador.`;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: corsHeaders });
const safe = (v: unknown) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 500);
const pError = (provider: string, status: number, message: string) => Object.assign(new Error(safe(message)), { provider, status });

async function callProvider(provider: string, prompt: string) {
  const signal = AbortSignal.timeout(TIMEOUT);
  if (provider === 'gemini') {
    if (!GEMINI_API_KEY) throw pError(provider, 503, 'GEMINI_API_KEY ausente.');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, { method:'POST', signal, headers:{'Content-Type':'application/json','X-goog-api-key':GEMINI_API_KEY}, body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM_PROMPT}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:1200}}) });
    const d = await r.json().catch(()=>({})); if(!r.ok) throw pError(provider,r.status,d?.error?.message||`Gemini HTTP ${r.status}`);
    const text=d?.candidates?.[0]?.content?.parts?.map((x:{text?:string})=>x.text||'').join('\n').trim(); if(!text) throw pError(provider,502,'Resposta vazia.'); return {text,provider,model:GEMINI_MODEL};
  }
  if (provider === 'groq' || provider === 'openrouter') {
    const key = provider === 'groq' ? GROQ_API_KEY : OPENROUTER_API_KEY;
    const model = provider === 'groq' ? GROQ_MODEL : OPENROUTER_MODEL;
    const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    if(!key) throw pError(provider,503,`${provider} sem chave configurada.`);
    const r=await fetch(url,{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:prompt}],temperature:0.2,max_tokens:1200})});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw pError(provider,r.status,d?.error?.message||`${provider} HTTP ${r.status}`); const text=String(d?.choices?.[0]?.message?.content||'').trim(); if(!text) throw pError(provider,502,'Resposta vazia.'); return {text,provider,model:d?.model||model};
  }
  if (provider === 'cloudflare') {
    if(!CLOUDFLARE_AI_API_TOKEN||!CLOUDFLARE_ACCOUNT_ID) throw pError(provider,503,'Cloudflare AI não configurado.');
    const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/ai/run/${CLOUDFLARE_MODEL}`,{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${CLOUDFLARE_AI_API_TOKEN}`},body:JSON.stringify({messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:prompt}]})}); const d=await r.json().catch(()=>({})); if(!r.ok||d?.success===false) throw pError(provider,r.status,d?.errors?.[0]?.message||'Cloudflare AI falhou.'); const text=String(d?.result?.response||d?.result?.text||'').trim(); if(!text) throw pError(provider,502,'Resposta vazia.'); return {text,provider,model:CLOUDFLARE_MODEL};
  }
  if (provider === 'cohere') {
    if(!COHERE_API_KEY) throw pError(provider,503,'Cohere não configurado.');
    const r=await fetch('https://api.cohere.com/v2/chat',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${COHERE_API_KEY}`},body:JSON.stringify({model:COHERE_MODEL,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:prompt}],temperature:0.2,max_tokens:1200})}); const d=await r.json().catch(()=>({})); if(!r.ok) throw pError(provider,r.status,d?.message||'Cohere falhou.'); const text=d?.message?.content?.filter((x:{type?:string})=>x.type==='text').map((x:{text?:string})=>x.text||'').join('\n').trim(); if(!text) throw pError(provider,502,'Resposta vazia.'); return {text,provider,model:COHERE_MODEL};
  }
  throw pError(provider,503,'Provedor não suportado.');
}

function parseObject(text:string){const c=text.replace(/```(?:json)?/gi,'').replace(/```/g,'').trim();const a=c.indexOf('{'),b=c.lastIndexOf('}');if(a<0||b<=a)throw new Error('JSON inválido retornado pela IA.');return JSON.parse(c.slice(a,b+1));}
const confirm=(p:string)=>/^(sim|confirmar|confirmo|pode adicionar|pode cadastrar|pode alterar|pode atualizar|pode desativar|pode ativar|aplique|confirmado)$/i.test(p.trim());
const cancel=(p:string)=>/^(não|nao|cancelar|cancela|descartar|desista)$/i.test(p.trim());
const createIntent=(p:string)=>/(adicion|cadastr|cri|inclu|coloc).{0,40}produto|produto.{0,40}(adicion|cadastr|cri|inclu|coloc)/i.test(p);
function normalizeProduct(raw:Record<string,unknown>){const num=(v:unknown,f:number|null=null)=>{if(v===''||v==null)return f;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:f};return{name:String(raw.name||'').trim(),description:String(raw.description||'').trim(),price:num(raw.price),sale_price:num(raw.sale_price),discount:num(raw.discount,0),stock:num(raw.stock),commission:num(raw.commission,0),image:String(raw.image||'').trim(),category:String(raw.category||'').trim(),active:true};}
function missingProduct(p:ReturnType<typeof normalizeProduct>){const m:string[]=[];if(!p.name)m.push('nome');if(!p.description)m.push('descrição');if(p.price===null||p.price<0)m.push('preço bruto/custo');if(p.sale_price===null||p.sale_price<0)m.push('preço de venda');if(p.stock===null||!Number.isInteger(p.stock)||p.stock<0)m.push('estoque');if(!p.image)m.push('imagem (URL)');if(!p.category)m.push('categoria');if(p.discount===null||p.discount<0||p.discount>100)m.push('desconto válido');if(p.commission===null||p.commission<0||p.commission>100)m.push('comissão válida');return m;}
function createPreview(p:ReturnType<typeof normalizeProduct>,m:string[]){const money=(v:number|null)=>v===null?'não informado':`R$ ${v.toFixed(2).replace('.',',')}`;const x=['Prévia do produto:',`Nome: ${p.name||'não informado'}`,`Descrição: ${p.description||'não informada'}`,`Preço bruto/custo: ${money(p.price)}`,`Preço de venda: ${money(p.sale_price)}`,`Desconto: ${p.discount??0}%`,`Estoque: ${p.stock??'não informado'}`,`Comissão: ${p.commission??0}%`,`Categoria: ${p.category||'não informada'}`,`Imagem: ${p.image||'não informada'}`];if(m.length)x.push('',`Ainda faltam: ${m.join(', ')}.`,'Envie essas informações para completar o cadastro.');else x.push('','Responda “confirmar” para cadastrar ou “cancelar” para descartar.');return x.join('\n');}

Deno.serve(async(req)=>{try{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders}); if(req.method!=='POST')return json({error:'Método não permitido.'},405); if(!SUPABASE_URL||!DB_SECRET)return json({error:'Servidor não configurado.'},503);
  const auth=req.headers.get('Authorization')||'';const token=auth.startsWith('Bearer ')?auth.slice(7).trim():'';if(!token)return json({error:'Autenticação obrigatória.'},401);
  const admin=createClient(SUPABASE_URL,DB_SECRET,{auth:{persistSession:false,autoRefreshToken:false}});const {data:au,error:ae}=await admin.auth.getUser(token);if(ae||!au.user)return json({error:'Sessão inválida ou expirada.'},401);
  const {data:profile}=await admin.from('profiles').select('role,is_active').eq('id',au.user.id).maybeSingle();if(!profile||profile.role!=='admin'||profile.is_active!==true)return json({error:'Acesso restrito a administradores ativos.'},403);
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;if(!body)return json({error:'Corpo inválido.'},400);const action=String(body.action||'generate');
  if(action==='status'){const [{data:settings},{data:providers}]=await Promise.all([admin.from('royal_ai_settings').select('bootstrap_mode,allow_paid_providers,automation_enabled,max_concurrent_tasks').eq('id',true).maybeSingle(),admin.from('royal_ai_providers').select('provider_key,display_name,model,priority,enabled,free_only,status,cooldown_until,last_success_at,last_failure_at,last_error_code').order('priority')]);return json({ok:true,settings,providers});}
  if(action!=='generate')return json({error:'Ação inválida.'},400);const prompt=String(body.prompt||'').trim();if(!prompt||prompt.length>12000)return json({error:'Prompt inválido.'},400);
  const {data:settings}=await admin.from('royal_ai_settings').select('bootstrap_mode,allow_paid_providers').eq('id',true).maybeSingle();if(!settings?.bootstrap_mode||settings?.allow_paid_providers)return json({error:'Royal AI fora do modo bootstrap seguro.'},503);
  const {data:providerRows}=await admin.from('royal_ai_providers').select('provider_key,status,cooldown_until,priority').eq('enabled',true).eq('free_only',true).order('priority');const now=Date.now();const supported=['gemini','groq','openrouter','cloudflare','cohere'];const eligible=(providerRows||[]).filter((p:any)=>supported.includes(p.provider_key)&&p.status!=='disabled'&&p.status!=='quota_exhausted'&&(!p.cooldown_until||new Date(p.cooldown_until).getTime()<=now));
  const useAI=async(text:string)=>{const errors:any[]=[];for(const p of eligible){try{return await callProvider(p.provider_key,text)}catch(e:any){errors.push({provider:p.provider_key,status:Number(e?.status||500),message:safe(e?.message)})}}throw Object.assign(new Error('Nenhum provedor gratuito disponível.'),{errors});};

  const {data:pendingRows}=await admin.from('royal_ai_tasks').select('id,task_type,payload,created_at').in('task_type',['product_create_pending','product_mutation_pending']).eq('status','waiting_provider').order('created_at',{ascending:false}).limit(30);
  const pending=(pendingRows||[]).find((r:any)=>r?.payload?.admin_user_id===au.user.id)||null;
  if(pending&&cancel(prompt)){await admin.from('royal_ai_tasks').delete().eq('id',pending.id);return json({ok:true,provider:'royal-ai',model:'product-manager',text:'Operação cancelada. Nenhuma alteração foi aplicada.'});}
  if(pending?.task_type==='product_mutation_pending'&&confirm(prompt)){
    const mutation=sanitizeProductMutation(pending.payload?.mutation||{});const errors=validateProductMutation(mutation);if(errors.length)return json({error:`Alteração inválida: ${errors.join(', ')}.`},400);
    const productId=String(pending.payload?.product_id||'');const {data:updated,error}=await admin.from('products').update(mutation.changes).eq('id',productId).select('*').single();if(error)return json({error:`Não foi possível alterar o produto: ${error.message}`},500);
    await admin.from('royal_ai_tasks').delete().eq('id',pending.id);await admin.from('royal_ai_logs').insert({provider_key:'royal-ai',event_type:'product_updated',level:'info',message:'Produto alterado pela Royal AI após confirmação do administrador.',details:{product_id:productId,admin_user_id:au.user.id,fields:Object.keys(mutation.changes)}});
    return json({ok:true,provider:'royal-ai',model:'product-manager',product:updated,text:`Produto “${updated.name}” atualizado com sucesso.`});
  }
  if(pending?.task_type==='product_create_pending'&&confirm(prompt)){const product=normalizeProduct(pending.payload?.product||{});const missing=missingProduct(product);if(missing.length)return json({ok:true,text:createPreview(product,missing),provider:'royal-ai',model:'product-manager'});const id=`prod_${Date.now()}`;const {data:created,error}=await admin.from('products').insert({id,...product}).select('*').single();if(error)return json({error:`Não foi possível cadastrar: ${error.message}`},500);await admin.from('royal_ai_tasks').delete().eq('id',pending.id);return json({ok:true,provider:'royal-ai',model:'product-manager',product:created,text:`Produto “${product.name}” cadastrado com sucesso na Store Royal.`});}

  if(pending?.task_type==='product_mutation_pending'||isProductMutationIntent(prompt)){
    const previous=pending?.payload?.mutation||{};const used=await useAI(`Extraia uma alteração administrativa de produto. Retorne SOMENTE JSON válido. Formato: {"lookup":"nome ou id do produto","action":"update|activate|deactivate","changes":{"description":null,"price":null,"sale_price":null,"discount":null,"stock":null,"commission":null,"image":null,"category":null}}. Preço genérico significa sale_price; preço bruto/custo significa price. Não invente valores. Preserve dados anteriores quando a nova mensagem apenas complementar. Dados anteriores: ${JSON.stringify(previous)}. Mensagem: ${prompt}`);const mutation=sanitizeProductMutation({...previous,...parseObject(used.text)});const validation=validateProductMutation(mutation);if(validation.length)return json({ok:true,provider:used.provider,model:used.model,text:`Preciso de mais informação: ${validation.join(', ')}.`});
    let query=admin.from('products').select('id,name,description,price,sale_price,discount,stock,commission,image,category,active');const lookup=mutation.lookup;const byId=await query.eq('id',lookup).maybeSingle();let product=byId.data;
    if(!product){const {data:matches}=await admin.from('products').select('id,name,description,price,sale_price,discount,stock,commission,image,category,active').ilike('name',`%${lookup.replace(/[%_]/g,'')}%`).limit(5);if(!matches?.length)return json({ok:true,provider:used.provider,model:used.model,text:`Não encontrei um produto correspondente a “${lookup}”. Informe o nome exato ou ID.`});if(matches.length>1)return json({ok:true,provider:used.provider,model:used.model,text:`Encontrei mais de um produto: ${matches.map((x:any)=>`${x.name} (${x.id})`).join(', ')}. Informe qual deles deseja alterar.`});product=matches[0];}
    const payload={admin_user_id:au.user.id,product_id:product.id,mutation,updated_at:new Date().toISOString()};if(pending)await admin.from('royal_ai_tasks').update({task_type:'product_mutation_pending',payload,last_error:null}).eq('id',pending.id);else await admin.from('royal_ai_tasks').insert({task_type:'product_mutation_pending',priority:1,status:'waiting_provider',payload,last_error:null});return json({ok:true,provider:used.provider,model:used.model,awaiting_confirmation:true,product,mutation,text:mutationPreview(product,mutation)});
  }

  if(pending?.task_type==='product_create_pending'||createIntent(prompt)){const previous=pending?.payload?.product||{};const used=await useAI(`Retorne SOMENTE JSON de produto com campos name,description,price,sale_price,discount,stock,commission,image,category. Não invente dados. Preserve dados anteriores quando não forem substituídos. Dados anteriores: ${JSON.stringify(previous)}. Mensagem: ${prompt}`);const product=normalizeProduct({...previous,...parseObject(used.text)});const missing=missingProduct(product);const payload={admin_user_id:au.user.id,product,missing,updated_at:new Date().toISOString()};if(pending)await admin.from('royal_ai_tasks').update({task_type:'product_create_pending',payload,last_error:null}).eq('id',pending.id);else await admin.from('royal_ai_tasks').insert({task_type:'product_create_pending',priority:1,status:'waiting_provider',payload,last_error:null});return json({ok:true,provider:used.provider,model:used.model,product_draft:product,missing_fields:missing,awaiting_confirmation:missing.length===0,text:createPreview(product,missing)});}

  try{const result=await useAI(prompt);await admin.from('royal_ai_logs').insert({provider_key:result.provider,event_type:'generation_success',level:'info',message:'Geração concluída pelo Royal AI Gateway.',details:{model:result.model}});return json({ok:true,...result});}catch(e:any){const {data:task}=await admin.from('royal_ai_tasks').insert({task_type:'generate_text',priority:5,status:'waiting_provider',payload:{prompt},last_error:'Nenhum provedor gratuito disponível.'}).select('id').single();return json({ok:false,queued:true,task_id:task?.id||null,error:'Nenhum provedor gratuito está disponível agora.'},503);}
}catch(e){return json({ok:false,diagnostic:true,error:e instanceof Error?e.message:String(e)},500);}});
