/* Advisory AI — product sourcing, read-only, admin only. */
(function () {
  'use strict';
  const byId=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
  const safeHref=value=>{
    try{const u=new URL(String(value));return ['https:','http:'].includes(u.protocol)?u.href:null}
    catch{return null}
  };
  const el=(tag,classes,txt)=>{
    const node=document.createElement(tag);
    if(classes)node.className=classes;
    if(txt!==undefined)node.textContent=String(txt);
    return node;
  };
  let initialized=false,loading=false,offers=[],searchedAt=null;
  let catalogCategoriesLoaded=false;
  const clean=v=>String(v||'').trim();

  function updateStatus(message,kind='neutral'){
    const node=byId('advisoryStatus');
    if(!node)return;
    node.textContent=message;
    node.className='text-sm leading-relaxed rounded-xl px-3 py-3 border '+
      (kind==='error'?'bg-red-50 text-red-800 border-red-200':
        kind==='success'?'bg-emerald-50 text-emerald-800 border-emerald-200':
        'bg-slate-50 text-slate-700 border-slate-200');
  }
  function formatTimestamp(value){
    const date=new Date(value);
    return Number.isNaN(date.valueOf())?'Horário indisponível':
      new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(date);
  }
  function fillCatalogCategories(){
    const select=byId('advisoryCategory');
    if(!select)return;
    const current=select.value;
    const fromCatalog=typeof state!=='undefined'&&Array.isArray(state.products)
      ? [...new Set(state.products.map(p=>clean(p.category)).filter(Boolean))] : [];
    for(const category of fromCatalog){
      if(![...select.options].some(o=>o.value.toLocaleLowerCase('pt-BR')===
        category.toLocaleLowerCase('pt-BR'))){
        const option=new Option(category,category);
        select.appendChild(option);
      }
    }
    if(current)select.value=current;
    catalogCategoriesLoaded=true;
  }

  async function request(body){
    if(typeof getRoyalAiAccessToken!=='function')throw Error('Validação da sessão administrativa indisponível.');
    let token=await getRoyalAiAccessToken();
    const send=jwt=>fetch(SUPABASE_FUNCTIONS_BASE+'/advisory-ai-search',{
      method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,
        'Authorization':'Bearer '+jwt},body:JSON.stringify(body),cache:'no-store'
    });
    let response=await send(token);
    if(response.status===401){token=await getRoyalAiAccessToken(true);response=await send(token)}
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok){
      const details=Array.isArray(data.details)?data.details.join(' | '):'';
      throw Error((data.error||'Busca indisponível. ')+
        (details?' '+details:'')+
        (data.code==='provider_not_configured'
          ? ' Configure uma chave de pesquisa no Supabase antes de utilizar a busca real.':''));
    }
    return data;
  }

  const offerPrice=o=>o.price!==null&&Number.isFinite(Number(o.price))?money(o.price):'Preço a consultar na loja';
  const priceContext=o=>o.priceSource==='snippet'
    ?'Valor encontrado no resultado de busca; confirme no anúncio.'
    :o.priceSource==='shopping'
      ?'Preço mostrado no Google Shopping; confirme na loja.'
      :'Preço não informado pelo buscador; consulte diretamente o vendedor.';
  function infoLine(name,value){
    const p=el('p','text-sm text-slate-700');
    p.append(el('strong','text-slate-900',name+': '),document.createTextNode(value));
    return p;
  }
  function addImage(parent,offer,classes){
    const src=safeHref(offer.image);
    const image=el('img',classes);
    image.alt=offer.title||'Foto do produto';
    image.loading='lazy';image.referrerPolicy='no-referrer';
    if(src){image.src=src;image.onerror=()=>{image.remove();parent.appendChild(el('p','text-xs text-slate-500 p-3','Imagem não disponível'));}}
    else image.src='./icons/icons-192.png';
    parent.appendChild(image);
  }
  function anchor(offer,title){
    const url=safeHref(offer.url);
    const a=el('a','inline-flex min-h-[36px] items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-bold text-amber-200 hover:bg-slate-700',title);
    if(url){a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer'}
    else{a.removeAttribute('href');a.setAttribute('aria-disabled','true')}
    return a;
  }
  function shippingLabel(o){
    if(o.freeShipping)return 'Frete grátis informado no anúncio';
    if(o.shippingCost!==null)return 'Frete informado: '+money(o.shippingCost);
    return o.delivery?'Entrega: '+o.delivery:'Frete não informado · consultar CEP';
  }
  function reviewsLabel(o){
    const star=typeof o.rating==='number'?o.rating.toFixed(1)+' ★':'Sem nota informada';
    const reviews=typeof o.reviews==='number'?o.reviews.toLocaleString('pt-BR')+' avaliações':'avaliações não informadas';
    return star+' · '+reviews;
  }
  function previewOffer(offer){
    const preview=byId('advisoryPreview');
    if(!preview)return;
    preview.replaceChildren();
    const header=el('div','flex flex-wrap items-start justify-between gap-3');
    const heading=el('div','');
    heading.append(el('p','text-xs font-bold uppercase tracking-wider text-amber-700','Prévia do produto no Advisory AI'),
      el('h5','mt-1 text-lg font-bold text-slate-900',offer.title));
    const close=el('button','rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700','Fechar prévia');
    close.type='button';close.addEventListener('click',()=>{preview.hidden=true});
    header.append(heading,close);preview.append(header);
    const grid=el('div','mt-3 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5');
    const imageWrap=el('div','flex items-center justify-center rounded-xl bg-white border border-slate-200 min-h-[190px] overflow-hidden');
    addImage(imageWrap,offer,'w-full max-h-[290px] object-contain');
    const details=el('div','flex flex-col gap-2');
    details.append(infoLine('Loja',offer.merchant),
      infoLine('Preço anunciado',offerPrice(offer)),
      infoLine('Origem do preço',priceContext(offer)),
      infoLine('Avaliações',reviewsLabel(offer)),
      infoLine('Frete',shippingLabel(offer)),
      infoLine('Preço + frete conhecido',
        offer.knownTotal!==null?money(offer.knownTotal):'Não calculável: falta valor do frete'),
      infoLine('Origem do link',offer.linkKind==='merchant'?'Anúncio da loja':'Ficha agregada do produto'),
      infoLine('Nota comparativa',offer.score.toFixed(1)+'/100 (pontuação interna, não nota da loja)'));
    const actions=el('div','mt-3 flex flex-wrap gap-2');
    actions.appendChild(anchor(offer,offer.linkKind==='merchant'?'Abrir anúncio na loja':'Abrir ficha de ofertas'));
    const copy=el('button','rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50','Copiar link');
    copy.type='button';copy.addEventListener('click',async ()=>{
      if(navigator.clipboard){try{await navigator.clipboard.writeText(offer.url);copy.textContent='Link copiado';return}catch{}}
      window.prompt('Copie o link do anúncio:',offer.url);
    });
    actions.append(copy);details.append(actions);
    details.append(el('p','mt-1 text-xs text-slate-500',
      'Esta é uma prévia informativa dentro da L&A. Para confirmar disponibilidade, entrega por CEP e comprar, use a página original do vendedor.'));
    grid.append(imageWrap,details);preview.appendChild(grid);
    preview.hidden=false;preview.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function productCard(offer,index){
    const card=el('article','rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col');
    const image=el('div','bg-[#f8f8f6] min-h-[180px] h-[215px] flex items-center justify-center overflow-hidden');
    addImage(image,offer,'w-full h-full object-contain');
    card.appendChild(image);
    const body=el('div','flex flex-1 flex-col gap-2 p-4');
    body.append(el('p','text-[11px] uppercase tracking-wide text-slate-500',offer.merchant),
      el('h6','text-sm font-bold text-slate-900 leading-snug min-h-[40px]',offer.title));
    const price=el('p',offer.price===null
      ?'text-sm font-bold text-emerald-900':'text-xl font-black text-emerald-800',offerPrice(offer));
    body.append(price,
      el('p','text-[11px] text-slate-500',priceContext(offer)),
      el('p','text-xs text-slate-600',reviewsLabel(offer)),
      el('p','text-xs font-medium '+(offer.freeShipping?'text-emerald-700':'text-slate-600'),shippingLabel(offer)));
    if(offer.knownTotal!==null)
      body.append(el('p','text-xs font-bold text-slate-700','Total com frete informado: '+money(offer.knownTotal)));
    const actions=el('div','mt-auto pt-3 flex flex-wrap gap-2');
    const preview=el('button','flex-1 min-h-[36px] rounded-lg border border-slate-300 px-2 py-2 text-xs font-bold text-slate-800','Prévia na L&A');
    preview.type='button';preview.addEventListener('click',()=>previewOffer(offer));
    actions.append(preview,anchor(offer,offer.linkKind==='merchant'?'Ver anúncio':'Ver ficha'));
    body.append(actions);
    card.append(body);
    return card;
  }
  function render(data){
    const items=byId('advisoryResults'),summary=byId('advisorySummary'),preview=byId('advisoryPreview');
    if(!items||!summary)return;
    if(preview){preview.replaceChildren();preview.hidden=true}
    offers=Array.isArray(data.results)?data.results:[];
    searchedAt=data.searchedAt;
    const copyButton=byId('advisoryCopyAllButton');
    if(copyButton)copyButton.disabled=!offers.length;
    items.replaceChildren();
    const total=Number(data.totalMatching)||0;
    summary.textContent=offers.length+' resultado(s) exibido(s) · '+total+
      ' correspondente(s) aos filtros · '+Number(data.uniqueCount||0)+
      ' anúncio(s) distinto(s) encontrados · '+Number(data.queries||1)+' consultas externas · '+
      Number(data.knownPrices||0)+' com preço informado · '+formatTimestamp(searchedAt)+'.';
    const coverage=byId('advisoryStoreCoverage');
    if(coverage){
      const searched=Array.isArray(data.searchedStores)?data.searchedStores:[];
      const found=new Set(Array.isArray(data.storesWithLinks)?data.storesWithLinks:[]);
      coverage.replaceChildren();
      if(searched.length){
        coverage.appendChild(el('strong','text-sm font-bold text-slate-900','Lojas consultadas: '));
        for(const shop of searched){
          const hasLinks=found.has(shop);
          const status=el('span','inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold '+
            (hasLinks?'bg-emerald-50 text-emerald-800 border-emerald-200':'bg-slate-100 text-slate-600 border-slate-200'),
            shop+(hasLinks?' · anúncios encontrados':' · sem anúncios nesta consulta'));
          coverage.appendChild(status);
        }
      }
    }
    if(!offers.length)items.append(el('p','col-span-full rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900',
      'Nenhum anúncio corresponde aos filtros. Tente um nome mais simples, retire os filtros de avaliação/preço/frete ou use a busca muito ampla.'));
    for(const [i,offer] of offers.entries())items.appendChild(productCard(offer,i));
    const notes=Array.isArray(data.notices)?data.notices:[];
    const notice=byId('advisoryNotices');
    if(notice)notice.textContent=notes.length?'Busca parcialmente concluída: '+notes.join('; '):'';
    const stamp=byId('advisorySource');
    if(stamp)stamp.textContent='Fontes: buscas Google Shopping e pesquisas em sites de lojas, por '+
      (Array.isArray(data.providersUsed)&&data.providersUsed.length?data.providersUsed.join(', '):String(data.provider||'provedor externo'))+
      ' · Consultado em '+formatTimestamp(data.searchedAt)+
      ' · Nem todos os anúncios aparecem em buscadores. Preços, estoque e frete devem ser confirmados na loja original.';
  }
  function readForm(){
    const f=byId('advisorySearchForm');
    return {
      action:'search',
      category:clean(byId('advisoryCategory')?.value),
      query:clean(byId('advisoryQuery')?.value),
      maxPrice:clean(byId('advisoryMaxPrice')?.value)||null,
      minRating:Number(byId('advisoryMinRating')?.value||0),
      minReviews:Number(byId('advisoryMinReviews')?.value||0),
      onlyFree:byId('advisoryOnlyFree')?.checked===true,
      depth:Number(byId('advisoryDepth')?.value||2),
      sort:byId('advisorySort')?.value||'balance'
    };
  }
  async function runSearch(e){
    if(e)e.preventDefault();
    if(loading)return;
    const args=readForm();
    if(!args.category||args.query.length<2){
      updateStatus('Escolha uma categoria e informe o produto ou característica que deseja pesquisar.','error');return;
    }
    loading=true;
    const btn=byId('advisorySearchButton');
    if(btn){btn.disabled=true;btn.textContent='Pesquisando ofertas...'}
    updateStatus('Pesquisando Google Shopping e lojas de verdade (Shopee, SHEIN, Mercado Livre e outras conforme a amplitude). Os preços dependem dos anúncios recuperados.');
    try{
      const result=await request(args);
      render(result);
      updateStatus(result.results?.length?
        'Pesquisa concluída: confira os resultados e abra a prévia dos produtos.' :
        'A pesquisa terminou, mas nenhum anúncio atendeu a todos os filtros.','success');
    }catch(e){updateStatus('Não foi possível buscar ofertas reais: '+String(e?.message||e),'error')}
    finally{loading=false;if(btn){btn.disabled=false;btn.textContent='Buscar melhores ofertas'}}
  }
  window.advisoryAiCopyLinks = async function(){
    if(!offers.length)return;
    const header='ADVISORY AI | Lista de ofertas | '+formatTimestamp(searchedAt);
    const lines=offers.map((offer,i)=>[
      String(i+1)+'. '+offer.title,
      'Loja: '+offer.merchant+' | Preço: '+offerPrice(offer),
      reviewsLabel(offer)+' | '+shippingLabel(offer),
      'Link original: '+offer.url
    ].join('\n'));
    const report=[header,'',...lines].join('\n\n');
    try{
      await navigator.clipboard.writeText(report);
      updateStatus(offers.length+' link(s) de ofertas copiados com seus preços, lojas, fretes e avaliações.','success');
    }catch{
      window.prompt('Copie a lista de links:',report);
    }
  };

  window.advisoryAiInit = async function(){
    if(!initialized){
      const form=byId('advisorySearchForm');
      if(!form)return;
      form.addEventListener('submit',runSearch);
      initialized=true;
    }
    if(!catalogCategoriesLoaded || (typeof state!=='undefined' && state.products?.length))fillCatalogCategories();
    try{
      const response=await request({action:'status'});
      updateStatus(response.configured?
        'Motor de busca configurado. Pesquise por menor preço em Google Shopping, Shopee, SHEIN e outras lojas. A disponibilidade dos anúncios depende do provedor.' :
        'Busca ainda não configurada. É necessário adicionar uma chave de acesso Serper ou SerpApi aos segredos da Edge Function no Supabase.',
        response.configured?'success':'error');
    }catch(e){
      updateStatus('Advisory AI indisponível: '+String(e?.message||e),'error');
    }
  };
})();
