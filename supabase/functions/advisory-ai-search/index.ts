import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGIN = 'https://equipezero-web.github.io';
const HEADERS: Record<string,string> = {
  'Access-Control-Allow-Origin':ORIGIN,
  'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'Vary':'Origin'
};
type Offer = {
  id:string; title:string; merchant:string; url:string;
  linkKind:'merchant'|'aggregator'; image:string|null;
  price:number; currency:'BRL'; delivery:string|null;
  freeShipping:boolean; shippingKnown:boolean; shippingCost:number|null;
  knownTotal:number|null; rating:number|null; reviews:number|null;
  score:number; query:string;
};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:HEADERS});
const text=(v:unknown,max=180)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';
function safeUrl(v:unknown):string|null {
  if(typeof v!=='string')return null;
  try{
    const u=new URL(v);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
    if(/^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)$/i.test(u.hostname))return null;
    return u.href;
  }catch{return null}
}
function numericPrice(v:unknown):number|null {
  if(typeof v==='number')return Number.isFinite(v)&&v>0?Math.round(v*100)/100:null;
  const s=text(v,70);
  if(!s||/US\$|USD|EUR|€|£/i.test(s))return null;
  let n=s.replace(/R\$|BRL|\s/gi,'').replace(/[^\d.,]/g,'');
  if(n.includes(',')&&n.includes('.')){
    n=n.lastIndexOf(',')>n.lastIndexOf('.')?n.replace(/\./g,'').replace(',','.'):n.replace(/,/g,'');
  }else if(n.includes(','))n=n.replace(',','.');
  else if((n.match(/\./g)||[]).length>1)n=n.replace(/\./g,'');
  const val=Number(n);
  return Number.isFinite(val)&&val>0&&val<100000000?Math.round(val*100)/100:null;
}
function shipping(value:unknown){
  const delivery=text(value,200);
  const free=/(?:frete|entrega|envio)\s+gr[aá]tis|gr[aá]tis\s+(?:frete|entrega|envio)|free\s+(?:shipping|delivery)/i.test(delivery)
    || /^gr[aá]tis$/i.test(delivery)
    || /(?:frete|entrega|envio)\D{0,15}R\$\s*0(?:,00)?\b/i.test(delivery);
  if(free)return {delivery,freeShipping:true,shippingKnown:true,shippingCost:0};
  const match=delivery.match(/(?:frete|entrega|envio|shipping|delivery)[^\d]{0,25}R\$\s*([\d.,]+)/i)
    ||delivery.match(/R\$\s*([\d.,]+)\s*(?:de\s+)?(?:frete|entrega|envio)/i);
  const price=match?numericPrice(match[1]):null;
  return {delivery:delivery||null,freeShipping:false,shippingKnown:price!==null,shippingCost:price};
}
function count(v:unknown):number|null {
  if(typeof v==='number')return Number.isFinite(v)&&v>=0?Math.trunc(v):null;
  const s=text(v,35).toLowerCase().replace(/\s/g,'');
  if(!s)return null;
  const n=/\dk\+?$/.test(s)?Number.parseFloat(s.replace(',','.'))*1000:Number(s.replace(/[.,]/g,''));
  return Number.isFinite(n)&&n>=0?Math.round(n):null;
}
function normal(raw:Record<string,unknown>,q:string,provider:string):Offer|null {
  const title=text(raw.title,230);
  const url=safeUrl(raw.link||raw.product_link);
  const price=numericPrice(raw.extracted_price??raw.price);
  if(!title||!url||price===null)return null;
  const ship=shipping(raw.delivery||raw.shipping);
  const rating=Number(raw.rating);
  const stars=Number.isFinite(rating)&&rating>=1&&rating<=5?rating:null;
  const host=new URL(url).hostname;
  const isAggregator=/(^|\.)(google\.[a-z.]+|serpapi\.com|serper\.dev)$/.test(host);
  return {
    id:provider+':'+text(raw.productId||raw.product_id||url,260),
    title,merchant:text(raw.source||raw.merchant||raw.store,110)||'Loja não identificada',
    url,linkKind:isAggregator?'aggregator':'merchant',
    image:safeUrl(raw.imageUrl||raw.thumbnail||raw.image),
    price,currency:'BRL',...ship,
    knownTotal:ship.shippingKnown?Math.round((price+(ship.shippingCost||0))*100)/100:null,
    rating:stars,reviews:count(raw.ratingCount??raw.reviews),score:0,query:q
  };
}
function rank(offers:Offer[]){
  const prices=offers.map(o=>o.price);
  const lowest=Math.min(...prices),highest=Math.max(...prices);
  for(const o of offers){
    const cheap=highest===lowest?30:40*(highest-o.price)/(highest-lowest);
    const quality=o.rating===null?0:o.rating/5*28;
    const reviews=o.reviews===null?0:Math.min(12,Math.log10(o.reviews+1)*4);
    const delivery=o.freeShipping?20:o.shippingKnown?7:2;
    o.score=Math.round((cheap+quality+reviews+delivery)*10)/10;
  }
}
function validated(raw:Record<string,unknown>){
  const category=text(raw.category,90),query=text(raw.query,140);
  if(category.length<2||query.length<2)throw Error('Informe categoria e produto pesquisado.');
  const maxPrice=raw.maxPrice===null||raw.maxPrice===undefined||raw.maxPrice===''?null:Number(raw.maxPrice);
  if(maxPrice!==null&&(!Number.isFinite(maxPrice)||maxPrice<=0||maxPrice>1000000))throw Error('Preço máximo inválido.');
  const minRating=Number(raw.minRating??0),minReviews=Number(raw.minReviews??0);
  const depth=Number(raw.depth??2),sort=text(raw.sort,25)||'balance';
  if(![0,4,4.3,4.5,4.7].includes(minRating)||![0,10,25,50,100].includes(minReviews)
    ||![1,2,3].includes(depth)||!['balance','price','rating','reviews','shipping'].includes(sort))
    throw Error('Filtro inválido.');
  return {category,query,maxPrice,minRating,minReviews,depth,sort,onlyFree:raw.onlyFree===true};
}
async function runProvider(provider:'serper'|'serpapi',key:string,q:string):Promise<unknown[]>{
  const signal=AbortSignal.timeout(18000);
  let result:Response;
  if(provider==='serper'){
    result=await fetch('https://google.serper.dev/shopping',{
      method:'POST',signal,
      headers:{'Content-Type':'application/json','X-API-KEY':key},
      body:JSON.stringify({q,gl:'br',hl:'pt',num:35,page:1})
    });
  }else{
    const uri=new URL('https://serpapi.com/search.json');
    for(const [k,v] of Object.entries({engine:'google_shopping',api_key:key,q,gl:'br',hl:'pt',num:'35'}))
      uri.searchParams.set(k,v);
    result=await fetch(uri,{signal});
  }
  if(!result.ok){
    if(result.status===429)throw Error('Limite de consultas do provedor atingido.');
    if([401,403].includes(result.status))throw Error('Chave de acesso ao provedor inválida ou sem permissão.');
    throw Error('Provedor de buscas indisponível: HTTP '+result.status);
  }
  const body=await result.json();
  if(body?.error)throw Error('Provedor informou uma falha na consulta.');
  const rows=provider==='serper'?body?.shopping:body?.shopping_results;
  return Array.isArray(rows)?rows:[];
}
const recent=new Map<string,number>();
Deno.serve(async (req:Request):Promise<Response>=>{
  const origin=req.headers.get('origin');
  if(origin&&origin!==ORIGIN)return json({ok:false,error:'Origem não autorizada.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  if(req.method!=='POST')return json({ok:false,error:'Método não permitido.'},405);
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!service)return json({ok:false,error:'Servidor não configurado.'},503);
  const token=/^Bearer (\S+)$/i.exec(req.headers.get('authorization')||'')?.[1];
  if(!token)return json({ok:false,error:'Autenticação obrigatória.'},401);
  try{
    const viewer=createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:identity,error:authError}=await viewer.auth.getUser(token);
    if(authError||!identity.user)return json({ok:false,error:'Sessão inválida.'},401);
    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:profile,error:profileError}=await admin.from('profiles')
      .select('role,is_active').eq('id',identity.user.id).maybeSingle();
    if(profileError||profile?.role!=='admin'||profile?.is_active!==true)
      return json({ok:false,error:'Apenas administradores podem pesquisar fornecedores.'},403);
    const reqbody=await req.json().catch(()=>null);
    if(!reqbody||typeof reqbody!=='object')return json({ok:false,error:'Solicitação inválida.'},400);
    const input=reqbody as Record<string,unknown>;
    // Dedicated keys take precedence; existing generic provider keys also work.
    const serper=Deno.env.get('ADVISORY_SERPER_API_KEY')||Deno.env.get('SERPER_API_KEY')||'';
    const serpapi=Deno.env.get('ADVISORY_SERPAPI_API_KEY')||Deno.env.get('SERPAPI_API_KEY')||'';
    const provider:'serper'|'serpapi'|null=serper?'serper':serpapi?'serpapi':null;
    if(input.action==='status')return json({ok:true,configured:Boolean(provider),provider,
      message:provider?'Busca externa configurada.':'Configure ADVISORY_SERPER_API_KEY ou ADVISORY_SERPAPI_API_KEY no Supabase.'});
    if(input.action!=='search')return json({ok:false,error:'Ação não suportada.'},400);
    if(!provider)return json({ok:false,code:'provider_not_configured',
      error:'A busca externa exige uma chave Serper ou SerpApi nos secrets do Supabase.'},503);
    let options:ReturnType<typeof validated>;
    try{options=validated(input)}catch(e){return json({ok:false,error:String((e as Error).message)},400)}
    const last=recent.get(identity.user.id)||0;
    if(Date.now()-last<9000)return json({ok:false,error:'Aguarde 9 segundos antes da próxima pesquisa.'},429);
    if(recent.size>250)recent.clear();
    recent.set(identity.user.id,Date.now());
    const queries=[options.category+' '+options.query];
    if(options.depth>1)queries.push(options.query+' '+options.category+' ofertas lojas');
    if(options.depth>2)queries.push(options.category+' '+options.query+' promoção comprar');
    const calls=await Promise.allSettled(queries.map(async q=>
      (await runProvider(provider,provider==='serper'?serper:serpapi,q.slice(0,190)))
        .map(row=>normal(row as Record<string,unknown>,q,provider)).filter((x):x is Offer=>x!==null)
    ));
    const offers=new Map<string,Offer>();
    const errors:string[]=[];let rawCount=0;
    for(let i=0;i<calls.length;i++){
      const result=calls[i];
      if(result.status==='rejected'){errors.push('Pesquisa '+(i+1)+': '+text(result.reason?.message,150));continue}
      for(const item of result.value){rawCount++;if(!offers.has(item.url))offers.set(item.url,item)}
    }
    if(errors.length&&!offers.size)return json({ok:false,error:'As buscas externas falharam.',details:errors},502);
    let selected=[...offers.values()].filter(o=>
      (options.maxPrice===null||o.price<=options.maxPrice)&&
      (options.minRating===0||(o.rating!==null&&o.rating>=options.minRating))&&
      (options.minReviews===0||(o.reviews!==null&&o.reviews>=options.minReviews))&&
      (!options.onlyFree||o.freeShipping)
    );
    if(selected.length)rank(selected);
    if(options.sort==='price')selected.sort((a,b)=>a.price-b.price);
    else if(options.sort==='rating')selected.sort((a,b)=>(b.rating??-1)-(a.rating??-1));
    else if(options.sort==='reviews')selected.sort((a,b)=>(b.reviews??-1)-(a.reviews??-1));
    else if(options.sort==='shipping')selected.sort((a,b)=>Number(b.freeShipping)-Number(a.freeShipping)||a.price-b.price);
    else selected.sort((a,b)=>b.score-a.score);
    return json({ok:true,provider,category:options.category,query:options.query,
      searchedAt:new Date().toISOString(),queries:queries.length,rawCount,
      uniqueCount:offers.size,totalMatching:selected.length,results:selected.slice(0,90),
      notices:errors,partial:errors.length>0,
      disclaimer:'Valores e fretes informados pelo agregador. Confirme o anúncio, CEP de entrega, estoque e reputação na loja original.'});
  }catch(e){
    console.error('Advisory AI - search failed',String(e));
    return json({ok:false,error:'Erro interno ao pesquisar fornecedores.'},500);
  }
});
