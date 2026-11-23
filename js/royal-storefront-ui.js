/* Store Royal storefront upgrade — progressive enhancements over the current Supabase storefront. */
(function () {
  'use strict';
  const HERO_BUCKET = 'royal-hero-banners';
  const fallback = {url:'./assets/hero/hero-ocean-desktop.webp', mobileUrl:'./assets/hero/hero-ocean-mobile.webp', alt:'Diamantes Royal Advisory'};
  let banners=[fallback], editing=[fallback], current=0, startX=null;
  const byId=(id)=>document.getElementById(id);
  const isAdmin=()=>typeof state!=='undefined' && state.currentUser && state.currentUser.role==='admin' && state.currentUser.status==='active';
  const safeUrl=(value)=>{
    try { const url=new URL(String(value||''),window.location.href);return ['https:','http:'].includes(url.protocol)?url.href:null; }
    catch (_) { return null; }
  };
  function repaintIcons() { try { if (window.lucide) lucide.createIcons(); } catch (_) {} }
  function element(tag,cls,txt) {
    const e=document.createElement(tag); if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;
  }
  function addSecondaryBar(){
    const header=document.querySelector('.royal-glass-header');
    if(!header || byId('royalWebStrip'))return;
    const strip=element('div','royal-web-strip');strip.id='royalWebStrip';
    strip.setAttribute('role','navigation');strip.setAttribute('aria-label','Serviços da loja');
    strip.innerHTML='<div class="royal-web-strip-inner">' +
      '<div id="royalWebGuestActions"><button type="button" onclick="openAuthModal(\'customer-register\')" data-i18n="register">Cadastrar</button><button type="button" onclick="openAuthModal(\'customer-login\')" data-i18n="login">Entrar</button></div>' +
      '<button type="button" id="royalWebAccount" hidden onclick="openUserMenu()"><i data-lucide="user-round"></i><span data-i18n="myAccount">Minha conta</span></button></div>';
    header.before(strip);
  }
  function addHeaderSearch(){
    const inner=document.querySelector('.royal-glass-inner');
    if(!inner || byId('royalHeaderSearch'))return;
    const box=element('div','royal-header-search'); box.id='royalHeaderSearchPanel'; box.setAttribute('role','search');
    box.innerHTML='<label for="royalHeaderSearch" class="sr-only">Buscar produtos</label><i data-lucide="search"></i>' +
      '<input id="royalHeaderSearch" type="search" placeholder="Buscar produtos na loja" autocomplete="off" data-i18n-placeholder="searchPlaceholder" aria-controls="royalSearchSuggestions" aria-autocomplete="list" oninput="royalHeaderSearchInput(this.value)" onkeydown="royalHeaderSearchKeydown(event)">' +
      '<button type="button" class="royal-header-search-submit" onclick="royalSearchGo()" aria-label="Buscar"><i data-lucide="arrow-right"></i></button>' +
      '<div id="royalSearchSuggestions" class="royal-search-suggestions" role="listbox" hidden></div>';
    const nav=inner.querySelector('.flex.items-center.justify-end');
    inner.insertBefore(box,nav||null);
    document.addEventListener('pointerdown',(e)=>{
      if(!box.contains(e.target))byId('royalSearchSuggestions').hidden=true;
    },{passive:true});
  }

  // Compact mobile header: full brand + search toggle + cart.
  // Search keeps its existing live catalog suggestions, but opens as a floating panel.
  function addMobileHeaderControls(){
    const inner=document.querySelector('header.royal-glass-header .royal-glass-inner');
    const search=byId('royalHeaderSearchPanel');
    if(!inner || !search || byId('royalMobileSearchToggle'))return;
    const brand=element('a','royal-mobile-brand');
    brand.href='#inicio';
    brand.setAttribute('aria-label','L&A Royal Advisory — voltar ao início');
    brand.innerHTML='<span class="royal-mobile-brand-name">L&amp;A ROYAL ADVISORY</span>';
    const toggle=element('button','royal-mobile-search-toggle');
    toggle.id='royalMobileSearchToggle';
    toggle.type='button';
    toggle.setAttribute('aria-label','Pesquisar produtos');
    toggle.setAttribute('title','Pesquisar produtos');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-controls','royalHeaderSearchPanel');
    toggle.innerHTML='<i data-lucide="search" aria-hidden="true"></i>';
    inner.insertBefore(brand,search);
    inner.insertBefore(toggle,search);
    const close=(returnFocus=false)=>{
      inner.classList.remove('royal-mobile-search-open');
      toggle.setAttribute('aria-expanded','false');
      toggle.setAttribute('aria-label','Pesquisar produtos');
      toggle.setAttribute('title','Pesquisar produtos');
      toggle.innerHTML='<i data-lucide="search" aria-hidden="true"></i>';
      const suggestions=byId('royalSearchSuggestions');
      if(suggestions)suggestions.hidden=true;
      if(returnFocus)toggle.focus();
      repaintIcons();
    };
    const open=()=>{
      inner.classList.add('royal-mobile-search-open');
      toggle.setAttribute('aria-expanded','true');
      toggle.setAttribute('aria-label','Fechar pesquisa');
      toggle.setAttribute('title','Fechar pesquisa');
      toggle.innerHTML='<i data-lucide="x" aria-hidden="true"></i>';
      repaintIcons();
      byId('royalHeaderSearch')?.focus();
    };
    toggle.addEventListener('click',()=>{
      if(inner.classList.contains('royal-mobile-search-open'))close();
      else open();
    });
    document.addEventListener('pointerdown',event=>{
      if(!inner.classList.contains('royal-mobile-search-open'))return;
      if(toggle.contains(event.target) || search.contains(event.target))return;
      close();
    },{passive:true});
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape' && inner.classList.contains('royal-mobile-search-open')){
        event.preventDefault();
        close(true);
      }
    });
    window.addEventListener('resize',()=>{
      if(window.innerWidth>=768 && inner.classList.contains('royal-mobile-search-open'))close();
    },{passive:true});
    window.royalCloseMobileSearch=close;
  }
  function allSearchMatches(value){
    const query=String(value||'').trim().toLocaleLowerCase('pt-BR');
    if(query.length<2 || typeof state==='undefined')return [];
    return (state.products||[]).filter(p=>p.active!==false && [p.name,p.description,p.category,p.brand].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(query));
  }
  window.royalHeaderSearchInput=function(value){
    const results=byId('royalSearchSuggestions');if(!results)return;
    results.replaceChildren();
    const matches=allSearchMatches(value).slice(0,6);
    for (const product of matches){
      const option=element('button','royal-search-result');option.type='button';option.setAttribute('role','option');
      const img=element('img');img.src=safeUrl(product.image)||'./icons/icons-192.png';img.alt='';img.loading='lazy';
      option.append(img,element('span','',product.name||'Produto'));
      option.addEventListener('click',()=>{results.hidden=true;if(window.royalCloseMobileSearch)window.royalCloseMobileSearch();const id=String(product.id);if(window.openRoyalProductPage)window.openRoyalProductPage(id);else if(typeof showProductDetails==='function')showProductDetails(id);});
      results.appendChild(option);
    }
    if(value.trim().length>=2){
      const all=element('button','royal-search-result royal-search-all','Ver resultados no catálogo');
      all.type='button';all.onclick=window.royalSearchGo;results.appendChild(all);
    }
    results.hidden=!results.children.length;
  };
  window.royalHeaderSearchKeydown=function(event){
    if(event.key==='Enter'){event.preventDefault();window.royalSearchGo();}
    if(event.key==='Escape'){const box=byId('royalSearchSuggestions');if(box)box.hidden=true;}
  };
  window.royalSearchGo=function(){
    const field=byId('searchProduct'),header=byId('royalHeaderSearch'),query=String(header?.value||'').trim();
    // Uma pesquisa pode encontrar itens de qualquer departamento.
    const found=allSearchMatches(query);
    if(found.length && typeof getProductAudience==='function' && typeof setStoreAudience==='function'){
      const wanted=getProductAudience(found[0]);
      if(typeof selectedStoreAudience!=='undefined' && wanted!==selectedStoreAudience)setStoreAudience(wanted);
    }
    if(field)field.value=query;
    byId('royalSearchSuggestions').hidden=true;
    if(window.royalCloseMobileSearch)window.royalCloseMobileSearch();
    if(typeof renderCatalog==='function')renderCatalog();
    byId('loja')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  window.focusRoyalCatalogSearch=function(){
    const header=byId('royalHeaderSearch');if(header){header.focus();header.scrollIntoView({behavior:'smooth',block:'nearest'});}
  };
  function moveFilters(){
    const shortcuts=document.querySelector('.royal-store-shortcuts'),helper=byId('storeAudienceHelper');
    if(shortcuts&&helper){helper.after(shortcuts);shortcuts.querySelector('[onclick="openCartModal()"]')?.remove();}
  }
  function prepareAffiliateEntryPoints(){
    const nav=document.getElementById('affiliateNavLink');
    if(nav){
      nav.textContent='Ser afiliado';
      nav.href='#afiliados';
      nav.onclick=(event)=>{event.preventDefault();window.royalOpenPanel('afiliados');};
    }
    document.querySelectorAll('a[href="#afiliados"]').forEach(link=>{
      link.addEventListener('click',event=>{event.preventDefault();window.royalOpenPanel('afiliados');});
    });
  }
  function preparePanels(){
    [['faq','Ajuda'],['afiliados','Afiliados']].forEach(([id,alt])=>{
      const section=byId(id);if(!section)return;
      section.classList.add('royal-content-panel');section.setAttribute('role','dialog');section.setAttribute('aria-modal','true');
      section.setAttribute('aria-hidden','true');section.setAttribute('aria-label',alt);
      const close=element('button','royal-panel-close');close.type='button';close.setAttribute('aria-label','Fechar '+alt);
      close.innerHTML='<i data-lucide="x"></i>';close.onclick=()=>window.royalClosePanel(id);
      section.prepend(close);
    });
  }
  window.royalOpenPanel=function(id){
    const panel=byId(id);if(!panel)return;
    document.querySelectorAll('.royal-content-panel.royal-panel-open').forEach(p=>{p.classList.remove('royal-panel-open');p.setAttribute('aria-hidden','true');});
    panel.classList.remove('hidden');panel.classList.add('royal-panel-open');panel.setAttribute('aria-hidden','false');
    panel.scrollTop=0;document.body.classList.add('royal-panel-lock');repaintIcons();
    panel.querySelector('.royal-panel-close')?.focus({preventScroll:true});
  };
  window.royalClosePanel=function(id){
    const panel=byId(id);if(!panel)return;
    panel.classList.remove('royal-panel-open');panel.setAttribute('aria-hidden','true');
    if(!document.querySelector('.royal-content-panel.royal-panel-open'))document.body.classList.remove('royal-panel-lock');
  };
  function prepareHero(){
    const hero=byId('inicio');if(!hero || byId('royalHeroSlides'))return;
    const photo=hero.querySelector('.royal-hero-photo');
    const track=element('div','royal-hero-slides');track.id='royalHeroSlides';
    track.tabIndex=0;track.setAttribute('role','group');track.setAttribute('aria-roledescription','carrossel');
    track.setAttribute('aria-label','Campanhas da loja');
    if(photo)photo.after(track);else hero.prepend(track);
    const buttons=element('div','royal-hero-controls');buttons.id='royalHeroControls';
    buttons.innerHTML='<button type="button" class="royal-hero-prev" aria-label="Banner anterior" onclick="royalHeroMove(-1)"><i data-lucide="chevron-left"></i></button>' +
      '<div id="royalHeroDots" class="royal-hero-dots" aria-label="Selecionar banner"></div>' +
      '<button type="button" class="royal-hero-next" aria-label="Próximo banner" onclick="royalHeroMove(1)"><i data-lucide="chevron-right"></i></button>';
    hero.append(buttons);
    hero.querySelector('.royal-fashion-actions')?.remove();
    track.addEventListener('pointerdown',e=>{if(e.isPrimary)startX=e.clientX;},{passive:true});
    track.addEventListener('pointerup',e=>{if(startX!=null&&Math.abs(e.clientX-startX)>34)window.royalHeroMove(e.clientX<startX?1:-1);startX=null;},{passive:true});
    track.addEventListener('pointercancel',()=>{startX=null;},{passive:true});
    track.addEventListener('wheel',event=>{
      if(banners.length<=1 || Math.abs(event.deltaX)<16 || Math.abs(event.deltaX)<Math.abs(event.deltaY))return;
      event.preventDefault();window.royalHeroMove(event.deltaX>0?1:-1);
    },{passive:false});
    track.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();window.royalHeroMove(e.key==='ArrowRight'?1:-1);}});
    window.addEventListener('resize',()=>renderHero());
    renderHero();
  }
  function renderHero(){
    const container=byId('royalHeroSlides'),buttons=byId('royalHeroControls'),dots=byId('royalHeroDots');
    if(!container||!buttons||!dots)return;
    current=((current%banners.length)+banners.length)%banners.length;
    container.replaceChildren();dots.replaceChildren();
    const mobile=matchMedia('(max-width: 767px)').matches;
    banners.forEach((banner,index)=>{
      const slide=element('div','royal-hero-slide'+(index===current?' royal-hero-slide-active':''));
      slide.style.backgroundImage='url("'+encodeURI(safeUrl((mobile&&banner.mobileUrl)||banner.url)||safeUrl(fallback.url))+'")';
      slide.setAttribute('aria-hidden',String(index!==current));slide.setAttribute('aria-label',banner.alt||'Campanha '+(index+1));container.appendChild(slide);
      if(banners.length>1){const dot=element('button','royal-hero-dot'+(current===index?' is-active':''));dot.type='button';dot.setAttribute('aria-label','Mostrar banner '+(index+1));
        dot.setAttribute('aria-current',String(index===current));dot.onclick=()=>window.royalHeroGo(index);dots.appendChild(dot);}
    });
    buttons.hidden=banners.length<=1;
  }
  window.royalHeroMove=function(direction){if(banners.length<=1)return;current=(current+direction+banners.length)%banners.length;renderHero();repaintIcons();};
  window.royalHeroGo=function(index){current=index;renderHero();repaintIcons();};
  async function loadBanners(){
    try{
      const {data,error}=await supabaseClient.from('royal_storefront_settings').select('value').eq('key','hero_banners').maybeSingle();
      if(error)throw error;
      const rows=Array.isArray(data?.value)?data.value:[];
      const valid=rows.slice(0,6).map(row=>({
        url:safeUrl(row.url),mobileUrl:safeUrl(row.mobileUrl),alt:String(row.alt||'Banner Royal').slice(0,160)
      })).filter(row=>row.url);
      banners=valid.length?valid:[fallback];editing=banners.map(x=>({...x}));current=0;renderHero();renderAdminHero();
    }catch(error){console.warn('Banners Royal: ',error);banners=[fallback];editing=[fallback];renderHero();renderAdminHero();}
  }
  function setAdminMessage(text){const e=byId('royalAdminHeroMessage');if(e)e.textContent=text;}
  function buildAdminHero(){
    const section=byId('admin-products');if(!section||byId('royalAdminHero'))return;
    const container=element('div','royal-admin-hero');container.id='royalAdminHero';
    container.innerHTML='<h4>Hero Banners · Página inicial</h4><p>Envie até 6 imagens (JPG, PNG ou WebP, até 6 MB por arquivo). Você pode alterar a ordem e remover banners.</p>' +
      '<div id="royalAdminHeroList" class="royal-admin-hero-list"></div>' +
      '<label class="royal-admin-hero-upload">Adicionar imagens <input id="royalHeroFiles" type="file" multiple accept="image/png,image/jpeg,image/webp" onchange="royalUploadHeroFiles(this.files)"></label>' +
      '<p id="royalAdminHeroMessage" role="status" aria-live="polite"></p>' +
      '<button type="button" class="royal-admin-save" onclick="royalSaveHeroBanners()">Salvar banners</button>';
    section.prepend(container);renderAdminHero();
  }
  function renderAdminHero(){
    const list=byId('royalAdminHeroList');if(!list)return;
    list.replaceChildren();
    editing.forEach((banner,i)=>{
      const item=element('div','royal-admin-hero-item');
      const img=element('img');img.src=safeUrl(banner.url)||fallback.url;img.alt='Banner '+(i+1);
      const controls=element('div','royal-admin-hero-actions');
      const title=element('span','',String(i+1)+' / '+editing.length);
      const left=element('button','','←');left.type='button';left.disabled=i===0;left.title='Mover para esquerda';left.onclick=()=>reorderBanner(i,-1);
      const right=element('button','','→');right.type='button';right.disabled=i===editing.length-1;right.title='Mover para direita';right.onclick=()=>reorderBanner(i,1);
      const remove=element('button','','Remover');remove.type='button';remove.onclick=()=>{editing.splice(i,1);renderAdminHero();setAdminMessage('Salve para publicar a alteração.');};
      controls.append(title,left,right,remove);item.append(img,controls);list.appendChild(item);
    });
    const input=byId('royalHeroFiles');if(input)input.disabled=editing.length>=6;
  }
  function reorderBanner(i,d){
    const j=i+d;if(j<0||j>=editing.length)return;
    [editing[i],editing[j]]=[editing[j],editing[i]];renderAdminHero();setAdminMessage('Nova ordem pronta para salvar.');
  }
  window.royalUploadHeroFiles=async function(files){
    const input=byId('royalHeroFiles');const uploads=Array.from(files||[]);if(input)input.value='';
    if(!isAdmin()){setAdminMessage('Entre como administrador para alterar banners.');return;}
    if(uploads.length+editing.length>6){setAdminMessage('Limite máximo de 6 imagens.');return;}
    for(const file of uploads){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6291456){
        setAdminMessage('Arquivo inválido: '+file.name+'. Use JPG, PNG ou WebP de até 6 MB.');continue;
      }
      const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
      const path='public/'+crypto.randomUUID()+'.'+ext;
      try {
        setAdminMessage('Enviando '+file.name+'...');
        const {error}=await supabaseClient.storage.from(HERO_BUCKET).upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
        if(error)throw error;
        const {data}=supabaseClient.storage.from(HERO_BUCKET).getPublicUrl(path);
        if(!safeUrl(data?.publicUrl))throw new Error('Endereço da imagem não disponível');
        editing.push({url:data.publicUrl,alt:'Campanha Royal Advisory'});renderAdminHero();
      }catch(error){setAdminMessage('Falha ao enviar '+file.name+': '+error.message);return;}
    }
    setAdminMessage('Imagens prontas. Clique em Salvar banners para publicar.');
  };
  window.royalSaveHeroBanners=async function(){
    if(!isAdmin()){setAdminMessage('Acesso administrativo necessário.');return;}
    if(!editing.length){setAdminMessage('Mantenha pelo menos um banner ativo.');return;}
    const save=editing.slice(0,6).map(x=>({url:x.url,mobileUrl:x.mobileUrl||null,alt:x.alt||'Campanha Royal Advisory'}));
    try{
      const {error}=await supabaseClient.from('royal_storefront_settings').upsert({key:'hero_banners',value:save,updated_at:new Date().toISOString()},{onConflict:'key'});
      if(error)throw error;
      banners=save;current=0;renderHero();setAdminMessage('Banners publicados com sucesso.');
    }catch(error){setAdminMessage('Não foi possível salvar banners: '+error.message);}
  };
  function buildPwaDock(){
    if(byId('royalPwaDock'))return;
    const dock=element('nav','royal-pwa-dock');dock.id='royalPwaDock';
    dock.setAttribute('aria-label','Navegação do aplicativo');
    dock.innerHTML='<button type="button" onclick="royalPwaHome()"><i data-lucide="house"></i><span data-i18n="home">Início</span></button>' +
      '<button type="button" onclick="royalPwaOrders()"><i data-lucide="package"></i><span data-i18n="orders">Pedidos</span></button>' +
      '<button type="button" onclick="royalPwaProfile()"><i data-lucide="user-round"></i><span data-i18n="profile">Perfil</span></button>';
    document.body.appendChild(dock);
    const panel=element('div','royal-pwa-profile');panel.id='royalPwaProfile';
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Meu perfil');panel.hidden=true;
    panel.innerHTML='<div class="royal-pwa-profile-card"><button class="royal-pwa-profile-close" type="button" onclick="royalPwaProfileClose()" aria-label="Fechar"><i data-lucide="x"></i></button>' +
      '<h2 data-i18n="myAccount">Minha conta</h2>' +
      '<button type="button" onclick="royalPwaAction(\'account\')"><i data-lucide="user-circle"></i><span data-i18n="profile">Perfil</span></button>' +
      '<button type="button" onclick="royalPwaAction(\'orders\')"><i data-lucide="package-check"></i><span data-i18n="myPurchases">Minhas compras</span></button>' +
      '<button type="button" onclick="royalPwaAction(\'faq\')"><i data-lucide="circle-help"></i><span data-i18n="helpCenter">FAQ · Central de ajuda</span></button>' +
      '<button type="button" onclick="royalPwaAction(\'about\')"><i data-lucide="info"></i><span data-i18n="about">Sobre nós</span></button>' +
      '<button type="button" onclick="royalPwaAction(\'logout\')"><i data-lucide="log-out"></i><span data-i18n="logout">Sair da conta</span></button></div>';
    panel.addEventListener('click',e=>{if(e.target===panel)window.royalPwaProfileClose();});
    document.body.appendChild(panel);
  }
  window.royalPwaHome=function(){window.royalPwaProfileClose();byId('inicio')?.scrollIntoView({behavior:'smooth'});};
  window.royalPwaOrders=function(){window.royalPwaProfileClose();if(typeof openCustomerOrders==='function')openCustomerOrders();};
  window.royalPwaProfile=function(){const panel=byId('royalPwaProfile');if(!panel)return;panel.hidden=false;repaintIcons();};
  window.royalPwaProfileClose=function(){const panel=byId('royalPwaProfile');if(panel)panel.hidden=true;};
  window.royalPwaAction=function(kind){
    window.royalPwaProfileClose();
    if(kind==='account'){if(typeof openCustomerProfile==='function')openCustomerProfile();}
    else if(kind==='orders')window.royalPwaOrders();
    else if(kind==='affiliate'){if(typeof openAffiliateRegistrationForCurrentUser==='function')openAffiliateRegistrationForCurrentUser();}
    else if(kind==='faq')window.royalOpenPanel('faq');
    else if(kind==='about')window.royalShowAbout();
    else if(kind==='logout'){if(typeof state!=='undefined'&&state.currentUser && typeof logoutUser==='function')logoutUser();else if(typeof openAuthModal==='function')openAuthModal('customer-login');}
  };
  window.royalShowAbout=function(){
    let panel=byId('royalAboutPanel');
    if(!panel){
      panel=element('section','royal-content-panel');panel.id='royalAboutPanel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Sobre nós');
      panel.innerHTML='<button type="button" class="royal-panel-close" onclick="royalClosePanel(\'royalAboutPanel\')" aria-label="Fechar"><i data-lucide="x"></i></button><div class="royal-about-content"><h2>Sobre a L&A Royal Advisory</h2><p>A Store Royal reúne produtos e coleções selecionados para uma experiência de compra elegante, segura e prática.</p><p>Explore as coleções, acompanhe seus pedidos e conte com a nossa central de ajuda.</p></div>';
      document.body.appendChild(panel);
    }
    window.royalOpenPanel('royalAboutPanel');
  };
  function removeInstallFromProfile(){
    document.querySelectorAll('#mobileLoggedMenu [data-royal-install],#userMenuModal [data-royal-install],#customerProfileModal [data-royal-install]').forEach(el=>el.remove());
  }
  window.royalSyncTopAuth=function(){
    const logged=typeof state!=='undefined'&&Boolean(state.currentUser), guest=byId('royalWebGuestActions'),account=byId('royalWebAccount');
    if(guest)guest.hidden=logged;if(account)account.hidden=!logged;
  };
  function initialize(){
    addSecondaryBar();addHeaderSearch();addMobileHeaderControls();moveFilters();preparePanels();prepareAffiliateEntryPoints();prepareHero();buildAdminHero();buildPwaDock();removeInstallFromProfile();
    window.royalSyncTopAuth();
    void loadBanners();repaintIcons();
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.royal-content-panel.royal-panel-open').forEach(p=>window.royalClosePanel(p.id));});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();