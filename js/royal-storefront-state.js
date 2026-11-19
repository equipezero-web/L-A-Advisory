/* Store Royal: BRL formatting, user-scoped persistent cart, timed checkout and customer order actions. */
(function () {
  'use strict';
  const CART_PREFIX='laRoyalCart:v2:', CHECKOUT_KEY='laRoyalCheckout:v1';
  const CHECKOUT_TTL=10*60*1000;
  let activeUid=null, initialized=false, syncGeneration=0;
  let remoteQueue=Promise.resolve(), restoringCheckout=false;
  const getId=()=>typeof state!=='undefined'&&state.currentUser?.id&&typeof supabaseAuthUser!=='undefined'&&supabaseAuthUser?.id===state.currentUser.id ? String(state.currentUser.id):null;
  function fromStore(key) {try {return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}}
  function intoStore(key,value) {try {localStorage.setItem(key,JSON.stringify(value));}catch(e){console.warn('Armazenamento da loja indisponível:',e);}}
  function removeStore(key){try{localStorage.removeItem(key);}catch(_){}}
  function cartKey(uid){return CART_PREFIX+(uid||'guest');}
  function normalizeItems(list){
    if(!Array.isArray(list))return [];
    const unique=new Map();
    list.slice(0,100).forEach(raw=>{
      if(!raw||!raw.id)return;
      const id=String(raw.id).slice(0,160),qty=Math.min(99,Math.max(1,Math.trunc(Number(raw.quantity)||1)));
      const product=(typeof state!=='undefined' ? (state.products||[]).find(p=>String(p.id)===id) : null);
      const unit=product&&typeof calculateFinalPrice==='function'?calculateFinalPrice(product):Number(raw.price);
      const price=Number.isFinite(unit)&&unit>=0?Math.round(unit*100)/100:0;
      const item={id,name:String(product?.name||raw.name||'Produto').slice(0,160),quantity:qty,price:price,
        grossPrice:Number(product?.price??raw.grossPrice??price),image:String(product?.image||raw.image||'').slice(0,700)};
      if(unique.has(id))unique.get(id).quantity=Math.min(99,unique.get(id).quantity+qty);else unique.set(id,item);
    });
    return [...unique.values()].slice(0,100);
  }
  function mergeItems(primary,extras){
    const result=normalizeItems(primary);
    for(const other of normalizeItems(extras)){
      const found=result.find(item=>item.id===other.id);
      if(found)found.quantity=Math.max(found.quantity,other.quantity);
      else if(result.length<100)result.push(other);
    }
    return result;
  }
  function updateIcon(){
    if(typeof updateCartIcon==='function')updateCartIcon();
    if(document.getElementById('cartModal')&&!document.getElementById('cartModal').classList.contains('hidden')&&typeof renderCartItems==='function'){
      renderCartItems();if(typeof updateCartTotal==='function')updateCartTotal();
    }
  }
  function localCart(uid){const row=fromStore(cartKey(uid));return {items:normalizeItems(row?.items),savedAt:Number(row?.savedAt)||0};}
  window.royalRefreshCartPrices=function(){
    if(typeof state==='undefined'||!Array.isArray(state.cart))return;
    state.cart=normalizeItems(state.cart);updateIcon();
  };
  window.royalPersistCart=function(){
    if(typeof state==='undefined')return Promise.resolve();
    const uid=getId(),scope=(activeUid===uid?uid:activeUid);
    const items=normalizeItems(state.cart);
    state.cart=items;
    intoStore(cartKey(scope),{items,savedAt:Date.now()});
    updateIcon();
    if(!scope)return Promise.resolve();
    // Serial queue keeps the newest cart from being overwritten by a slower older write.
    remoteQueue=remoteQueue.catch(()=>{}).then(async()=>{
      if(getId()!==scope)return;
      const {error}=await supabaseClient.from('royal_carts').upsert({
        user_id:scope,items:items,updated_at:new Date().toISOString()
      },{onConflict:'user_id'});
      if(error)console.warn('Falha ao sincronizar carrinho:',error.message);
    });
    return remoteQueue;
  };
  window.royalCartOnAuthChanged=async function(){
    if(typeof state==='undefined')return;
    const uid=getId();
    if(uid===activeUid)return;
    const generation=++syncGeneration;
    activeUid=uid;
    if(!uid){
      state.cart=localCart(null).items;updateIcon();return;
    }
    const local=localCart(uid),guest=localCart(null);
    let chosen=local.items;
    try{
      const {data,error}=await supabaseClient.from('royal_carts').select('items,updated_at').eq('user_id',uid).maybeSingle();
      if(error)throw error;
      const serverTime=new Date(data?.updated_at||0).getTime();
      if(data&&serverTime>local.savedAt)chosen=normalizeItems(data.items);
    }catch(error){console.warn('Carrinho da conta:',error.message);}
    if(generation!==syncGeneration||getId()!==uid)return;
    state.cart=mergeItems(chosen,guest.items);
    removeStore(cartKey(null)); // Guest items transferred to the signed-in account.
    await window.royalPersistCart();updateIcon();
    restoreCheckout();
  };
  window.royalCartOrderPaid=function(orderId){
    if(!orderId||typeof state==='undefined')return;
    const order=(state.orders||[]).find(o=>String(o.id)===String(orderId)||String(o.code)===String(orderId));
    if(!order||!['paid','processing','shipped','delivered','completed'].includes(String(order.status))||
        !['approved','paid'].includes(String(order.paymentStatus||order.payment_status)))return;
    state.cart=[];void window.royalPersistCart();removeStore(CHECKOUT_KEY);
  };
  window.royalParseBRL=function(value){
    const input=String(value??'').replace(/R\$\s?/g,'').replace(/\s/g,'').trim();
    if(!input)return NaN;
    let amount;
    if(input.includes(',')){
      if(!(/^\d+(?:\.\d{3})*(?:,\d{1,3})?$/.test(input)))return NaN;
      let parts=input.split(',');
      if(parts[1]?.length===3&&parts[1].slice(2)!=='0')return NaN;
      amount=Number(parts[0].replace(/\./g,'')+'.'+(parts[1]||'00').slice(0,2));
    }else if(/^\d{1,3}(?:\.\d{3})+$/.test(input)){
      amount=Number(input.replace(/\./g,''));
    }else if(/^\d+(?:\.\d{1,2})?$/.test(input)){
      amount=Number(input);
    }else return NaN;
    return Number.isFinite(amount)&&amount>=0?Math.round(amount*100)/100:NaN;
  };
  function checkoutState(){return fromStore(CHECKOUT_KEY);}
  window.royalCheckoutOpen=function(){
    if(typeof state==='undefined'||!state.currentUser)return;
    let saved=checkoutState(),now=Date.now(),uid=getId();
    if(saved?.uid!==uid||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=now){
      saved={uid,expiresAt:now+CHECKOUT_TTL,startedAt:now};
      intoStore(CHECKOUT_KEY,saved);
    }
    showCheckoutCountdown();
  };
  function showCheckoutCountdown(){
    const modal=document.getElementById('checkoutModal');if(!modal)return;
    let indicator=document.getElementById('royalCheckoutExpiryNotice');
    if(!indicator){
      indicator=document.createElement('p');indicator.id='royalCheckoutExpiryNotice';
      indicator.className='text-xs font-semibold text-[#35675c] mb-3';
      modal.querySelector('#checkoutForm')?.before(indicator);
    }
    const current=checkoutState(),remaining=Math.max(0,(current?.expiresAt||0)-Date.now());
    const mm=Math.floor(remaining/60000),ss=Math.floor((remaining%60000)/1000);
    indicator.textContent='Tempo para retomar este checkout: '+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  }
  function expireCheckout(redirect){
    const old=checkoutState();if(!old||Date.now()<old.expiresAt)return false;
    removeStore(CHECKOUT_KEY);
    const modal=document.getElementById('checkoutModal');
    if(modal&&!modal.classList.contains('hidden')&&typeof closeCheckoutModal==='function')closeCheckoutModal();
    if(redirect&&!new URLSearchParams(location.search).has('status')&&!new URLSearchParams(location.search).has('payment')){
      if(location.hash!=='#inicio')history.replaceState(null,'',location.pathname+'#inicio');
      window.scrollTo({top:0,behavior:'auto'});
    }
    return true;
  }
  function restoreCheckout(){
    const saved=checkoutState();
    if(!saved||restoringCheckout)return;
    if(expireCheckout(true))return;
    if(!getId()||saved.uid!==getId())return;
    if(typeof state==='undefined'||!state.cart.length)return;
    const p=new URLSearchParams(location.search);
    if(p.has('status')||p.has('payment')||p.has('external_reference')||sessionStorage.getItem('laPendingPaymentOrder'))return;
    const modal=document.getElementById('checkoutModal');
    if(!modal||!modal.classList.contains('hidden'))return;
    restoringCheckout=true;
    try{
      if(typeof populateCheckoutForm==='function')populateCheckoutForm();
      if(typeof openCheckoutModal==='function')openCheckoutModal();
    }finally{restoringCheckout=false;}
  }
  function checkoutTick(){
    if(expireCheckout(false))return;
    const modal=document.getElementById('checkoutModal');
    if(modal&&!modal.classList.contains('hidden'))showCheckoutCountdown();
  }
  const ORDER_LABELS={pending:'A pagar',paid:'Preparando',processing:'Preparando',shipped:'A caminho',delivered:'Entregue',
    completed:'A avaliar',cancelled:'Cancelado',canceled:'Cancelado',refunded:'Reembolsado'};
  window.royalOrderLabel=function(status,deliveredConfirmedAt){
    if(status==='delivered'&&deliveredConfirmedAt)return 'A avaliar';
    return ORDER_LABELS[String(status)]||String(status||'Pendente');
  };
  window.royalConfirmDelivery=async function(orderId){
    if(!getId()){if(typeof openAuthModal==='function')openAuthModal('customer-login');return;}
    const order=(state.orders||[]).find(o=>String(o.id)===String(orderId));
    if(!order||order.userId!==getId()||!['shipped','delivered'].includes(order.status))return;
    if(!window.confirm('Confirmar que você recebeu este pedido?'))return;
    try{
      const {data,error}=await supabaseClient.rpc('confirm_order_delivery',{p_order_id:String(orderId)});
      if(error)throw error;
      order.status='delivered';order.deliveredConfirmedAt=data;
      if(typeof renderCustomerOrders==='function')renderCustomerOrders();
      window.alert('Recebimento confirmado. Você já pode avaliar os produtos na página de cada item.');
    }catch(error){window.alert('Não foi possível confirmar o recebimento: '+error.message);}
  };
  window.royalReviewOrderProduct=function(productId){
    if(!productId)return;
    if(typeof closeCustomerOrders==='function')closeCustomerOrders();
    if(window.openRoyalProductPage)window.openRoyalProductPage(String(productId));
    setTimeout(()=>{
      const form=document.getElementById('royalProductReviewForm');
      if(form)form.scrollIntoView({behavior:'smooth',block:'center'});
    },80);
  };
  const UI_TEXT={
    'pt-BR':{
      downloadApp:'Baixar o app',followUs:'Siga-nos',help:'Ajuda (FAQ)',register:'Cadastrar',login:'Entrar',myAccount:'Minha conta',
      searchPlaceholder:'Buscar produtos na loja',home:'Início',orders:'Pedidos',profile:'Perfil',myPurchases:'Minhas compras',
      beAffiliate:'Ser afiliado',helpCenter:'FAQ · Central de ajuda',about:'Sobre nós',logout:'Sair da conta'
    },
    en:{
      downloadApp:'Install app',followUs:'Follow us',help:'Help (FAQ)',register:'Sign up',login:'Sign in',myAccount:'My account',
      searchPlaceholder:'Search store products',home:'Home',orders:'Orders',profile:'Profile',myPurchases:'My purchases',
      beAffiliate:'Become an affiliate',helpCenter:'FAQ · Help center',about:'About us',logout:'Sign out'
    },
    es:{
      downloadApp:'Instalar app',followUs:'Síguenos',help:'Ayuda (FAQ)',register:'Registrarse',login:'Iniciar sesión',myAccount:'Mi cuenta',
      searchPlaceholder:'Buscar productos en la tienda',home:'Inicio',orders:'Pedidos',profile:'Perfil',myPurchases:'Mis compras',
      beAffiliate:'Ser afiliado',helpCenter:'FAQ · Centro de ayuda',about:'Sobre nosotros',logout:'Cerrar sesión'
    }
  };
  const COMMON={
    'Produtos em destaque':['Featured products','Productos destacados'],
    'Roupas':['Clothing','Ropa'],'Sapatos':['Shoes','Zapatos'],'Acessórios':['Accessories','Accesorios'],
    'Dispositivos':['Devices','Dispositivos'],'Outros produtos':['Other products','Otros productos'],
    'Masculino':['Men','Masculino'],'Feminino':['Women','Femenino'],'Unissex / Outros':['Unisex / Other','Unisex / Otros'],
    'Todos os produtos':['All products','Todos los productos'],'Categorias e filtros':['Categories and filters','Categorías y filtros'],
    'Buscar':['Search','Buscar'],'Buscar produto':['Search products','Buscar productos'],
    'Explorar produtos':['Explore products','Explorar productos'],
    'Explore nossa loja':['Explore our store','Explora nuestra tienda'],
    'Store Royal · Sua vitrine':['Store Royal · Your showcase','Store Royal · Tu escaparate'],
    'Descubra o':['Discover the','Descubre lo'],'extraordinário.':['extraordinary.','extraordinario.'],
    'Perguntas Frequentes':['Frequently asked questions','Preguntas frecuentes'],
    'Dúvidas':['Questions','Dudas'],'Central de ajuda':['Help center','Centro de ayuda'],
    'Filtros e ordenação':['Filters and sorting','Filtros y ordenación'],
    'Relevância':['Relevance','Relevancia'],'Mais recentes':['Newest','Más recientes'],
    'Menor preço':['Lowest price','Precio más bajo'],'Maior preço':['Highest price','Precio más alto'],
    'Limpar filtros':['Clear filters','Limpiar filtros'],'Todas as categorias desta coleção':['All categories in this collection','Todas las categorías de esta colección'],
    'Meu perfil':['My profile','Mi perfil'],'Meus pedidos':['My orders','Mis pedidos'],
    'Carrinho':['Cart','Carrito'],'Seu carrinho está vazio.':['Your cart is empty.','Tu carrito está vacío.'],
    'Continuar para checkout':['Proceed to checkout','Continuar al pago'],
    'Resumo do pedido':['Order summary','Resumen del pedido'],'Pagamento seguro':['Secure payment','Pago seguro'],
    'A pagar':['Awaiting payment','Por pagar'],'Preparando':['Preparing','Preparando'],
    'A caminho':['On the way','En camino'],'A avaliar':['Review products','Por evaluar'],
    'Confirmar recebimento':['Confirm receipt','Confirmar recepción'],
    'Ver detalhes':['View details','Ver detalles'],'Sobre nós':['About us','Sobre nosotros'],
    'Sair da conta':['Sign out','Cerrar sesión'],'Ser afiliado':['Become an affiliate','Ser afiliado'],
    'Política de Privacidade':['Privacy policy','Política de privacidad'],
    'Preferências de cookies':['Cookie preferences','Preferencias de cookies'],
    'Entre':['Sign in','Entrar'],'Criar conta':['Create account','Crear cuenta']
  };
  const originals=new WeakMap();
  function translationNodes(){
    const scopes=[document.querySelector('main'),document.querySelector('footer'),document.querySelector('.royal-web-strip'),
      document.querySelector('.royal-glass-header'),document.getElementById('royalPwaDock'),document.getElementById('royalPwaProfile')];
    const result=[];
    for(const root of scopes.filter(Boolean)){
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
        const parent=node.parentElement;
        if(!parent||parent.closest('script,style,textarea,option,#adminDashboardModal,#catalogContainer,#customerOrdersList,#customerProfileModal,#orderDetailsContent,#royalSearchSuggestions'))return NodeFilter.FILTER_REJECT;
        return COMMON[node.textContent.trim()]?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP;
      }});
      while(walker.nextNode())result.push(walker.currentNode);
    }
    return result;
  }
  window.royalSetLanguage=function(lang){
    const selected=UI_TEXT[lang]?lang:'pt-BR';
    intoStore('laRoyalLanguage',selected);document.documentElement.lang=selected;
    const idx=selected==='en'?0:selected==='es'?1:null;
    document.querySelectorAll('[data-i18n]').forEach(e=>{
      const key=e.getAttribute('data-i18n');if(UI_TEXT[selected][key])e.textContent=UI_TEXT[selected][key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(e=>{
      const key=e.getAttribute('data-i18n-placeholder');if(UI_TEXT[selected][key])e.setAttribute('placeholder',UI_TEXT[selected][key]);
    });
    for(const node of translationNodes()){
      if(!originals.has(node))originals.set(node,node.textContent);
      const raw=originals.get(node),value=raw.trim(),translation=idx===null?value:COMMON[value]?.[idx];
      if(translation)node.textContent=raw.replace(value,translation);
    }
    const select=document.getElementById('royalLanguage');if(select)select.value=selected;
  };
  function init(){
    if(initialized)return;initialized=true;
    if(typeof state!=='undefined'){state.cart=localCart(null).items;updateIcon();}
    window.royalSetLanguage(fromStore('laRoyalLanguage')||'pt-BR');
    window.addEventListener('pageshow',()=>{if(!expireCheckout(true))restoreCheckout();});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(!expireCheckout(true))restoreCheckout();}});
    setInterval(checkoutTick,1000);
    if(typeof state!=='undefined')void window.royalCartOnAuthChanged();
    restoreCheckout();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();