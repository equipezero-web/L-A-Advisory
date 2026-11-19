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
  window.formatBRLInput=function(value){
    const number=Number(value);
    return Number.isFinite(number)?new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(number):'';
  };
  window.royalMoneyInputBlur=function(input){
    const number=window.royalParseBRL(input?.value);
    if(input&&Number.isFinite(number))input.value=window.formatBRLInput(number);
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
    const text=status==='delivered'&&deliveredConfirmedAt?'A avaliar':(ORDER_LABELS[String(status)]||String(status||'Pendente'));
    const language=fromStore('laRoyalLanguage');
    const translations={pending:['Awaiting payment','Por pagar'],paid:['Preparing','Preparando'],processing:['Preparing','Preparando'],
      shipped:['On the way','En camino'],delivered:['Delivered','Entregado'],completed:['Review products','Por evaluar']};
    const idx=language==='en'?0:language==='es'?1:null;
    if(idx===null)return text;
    if(text==='A avaliar')return ['Review products','Por evaluar'][idx];
    return (translations[String(status)]||[text,text])[idx];
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
  window.royalOrderActions=function(order){
    if(!order||typeof state==='undefined'||String(order.userId)!==String(getId()))return '';
    const orderId=String(order.id||'').replace(/[^a-zA-Z0-9_-]/g,'');
    let html='';
    if(['shipped','delivered'].includes(String(order.status)) && !order.deliveredConfirmedAt &&
       ['approved','paid'].includes(String(order.paymentStatus||order.payment_status))) {
      html+='<button type="button" class="royal-order-confirm" onclick="royalConfirmDelivery(\''+orderId+'\')">Confirmar recebimento</button>';
    }
    if(order.deliveredConfirmedAt){
      const ids=new Set();
      for(const item of Array.isArray(order.items)?order.items:[]){
        const id=String(item.productId||item.product_id||'').replace(/[^a-zA-Z0-9_-]/g,'');
        if(!id||ids.has(id))continue;
        ids.add(id);
        const name=typeof escapeHtml==='function'?escapeHtml(String(item.name||item.product_name||'produto')):'produto';
        html+='<button type="button" class="royal-order-review" onclick="royalReviewOrderProduct(\''+id+'\')">Avaliar '+name+'</button>';
      }
    }
    return html;
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
    'Plataforma segura':['Secure platform','Plataforma segura'],
    'Sua experiência começa com uma conta.':['Your experience starts with an account.','Tu experiencia comienza con una cuenta.'],
    'Perfil seguro':['Secure profile','Perfil seguro'],
    'Checkout ágil':['Fast checkout','Pago rápido'],
    'Área afiliado':['Affiliate area','Área de afiliados'],
    'Área do cliente':['Customer area','Área del cliente'],
    'Bem-vindo de volta':['Welcome back','Bienvenido de nuevo'],
    'Entre para acessar seu perfil, carrinho, pedidos e dados preenchidos automaticamente.':['Sign in to access your profile, cart, orders and saved details.','Inicia sesión para acceder a tu perfil, carrito, pedidos y datos guardados.'],
    'Seu Carrinho':['Your cart','Tu carrito'],
    'Revise seus produtos antes de continuar.':['Review your items before continuing.','Revisa tus artículos antes de continuar.'],
    'Frete incluso no valor. Prazo de entrega: 7 dias.':['Shipping is included. Estimated delivery: 7 days.','Envío incluido. Plazo de entrega: 7 días.'],
    'Checkout Inteligente':['Smart checkout','Pago inteligente'],
    'Seus dados foram recuperados automaticamente do seu perfil.':['Your details were filled in from your profile.','Tus datos se completaron automáticamente desde tu perfil.'],
    'Nome completo / Empresa':['Full name / Company','Nombre completo / Empresa'],
    'WhatsApp / Telefone':['WhatsApp / Phone','WhatsApp / Teléfono'],
    'E-mail':['Email','Correo electrónico'],
    'Endereço de entrega':['Shipping address','Dirección de entrega'],
    'Informe o endereço completo. O CEP será conferido automaticamente.':['Enter your full address. Your postal code will be checked automatically.','Introduce tu dirección completa. El código postal se comprobará automáticamente.'],
    'Rua / Logradouro':['Street / Address','Calle / Dirección'],
    'Número':['Number','Número'],
    'Complemento':['Additional address details','Complemento'],
    'Bairro':['Neighborhood','Barrio'],
    'Cidade':['City','Ciudad'],
    'Estado':['State','Estado'],
    'Total':['Total','Total'],
    'Frete incluso no valor. Prazo de entrega: 7 dias após a confirmação do pagamento.':['Shipping is included. Estimated delivery: 7 days after payment confirmation.','El envío está incluido. Entrega estimada: 7 días después de confirmar el pago.'],
    'Código de afiliado':['Affiliate code','Código de afiliado'],
    '(opcional)':['(optional)','(opcional)'],
    'Pagamento seguro':['Secure payment','Pago seguro'],
    'Pagar diretamente no Mercado Pago':['Pay with Mercado Pago','Pagar con Mercado Pago'],
    'Você será direcionado ao ambiente seguro do Mercado Pago para escolher Pix ou cartão.':['You will be redirected to Mercado Pago to choose Pix or card securely.','Serás redirigido a Mercado Pago para elegir Pix o tarjeta de forma segura.'],
    'Acompanhe pedidos, pagamentos, entrega e solicitações.':['Track your orders, payments, deliveries and requests.','Sigue tus pedidos, pagos, entregas y solicitudes.'],
    'Rastrear Pedido':['Track order','Rastrear pedido'],
    'Troca ou Devolução':['Exchange or return','Cambio o devolución'],
    'Preencha sua solicitação para análise da equipe.':['Fill in your request for our team to review.','Completa tu solicitud para que nuestro equipo la revise.'],
    'Produto':['Product','Producto'],
    'Selecione o produto':['Select product','Selecciona el producto'],
    'Motivo':['Reason','Motivo'],
    'Selecione o motivo':['Select reason','Selecciona el motivo'],
    'Arrependimento da compra':['Changed my mind','Desistimiento de la compra'],
    'Produto com defeito':['Defective product','Producto defectuoso'],
    'Produto diferente do solicitado':['Incorrect product','Producto diferente al solicitado'],
    'Tamanho ou cor incorretos':['Wrong size or color','Talla o color incorrectos'],
    'Alterar foto':['Change photo','Cambiar foto'],
    'Remover':['Remove','Eliminar'],
    'Meu Perfil':['My profile','Mi perfil'],
    'Cliente':['Customer','Cliente'],
    'Cadastro':['Registration','Registro'],
    'Último acesso':['Last login','Último acceso'],
    'Programa de afiliados':['Affiliate program','Programa de afiliados'],
    'Quer se tornar um afiliado?':['Want to become an affiliate?','¿Quieres ser afiliado?'],
    'Solicite sua afiliação e aguarde a análise da equipe L&A.':['Apply to become an affiliate and await review by the L&A team.','Solicita tu afiliación y espera la revisión del equipo L&A.'],
    'Solicitar afiliação':['Apply to join','Solicitar afiliación'],
    'Dados pessoais':['Personal information','Datos personales'],
    'O e-mail é gerenciado pelo sistema de autenticação.':['Your email is managed by the authentication system.','El correo se gestiona mediante el sistema de autenticación.'],

    'Coleção':['Collection','Colección'],
    'Filtros avançados':['Advanced filters','Filtros avanzados'],
    'Pesquise por categoria, preço, tamanho, cor, disponibilidade e relevância.':['Search by category, price, size, color, availability and relevance.','Busca por categoría, precio, talla, color, disponibilidad y relevancia.'],
    'Categoria':['Category','Categoría'],
    'Preço mínimo':['Minimum price','Precio mínimo'],
    'Preço máximo':['Maximum price','Precio máximo'],
    'Todas as cores':['All colors','Todos los colores'],
    'Tamanho':['Size','Talla'],
    'Todos os tamanhos':['All sizes','Todas las tallas'],
    'Disponibilidade':['Availability','Disponibilidad'],
    'Todos':['All','Todos'],
    'Em estoque':['In stock','Disponible'],
    'Sem estoque':['Out of stock','Agotado'],
    'Ordenar por':['Sort by','Ordenar por'],
    'Nome: A–Z':['Name: A–Z','Nombre: A–Z'],
    'Nome: Z–A':['Name: Z–A','Nombre: Z–A'],
    'Carregando produtos...':['Loading products...','Cargando productos...'],
    'Modo afiliado ativo':['Affiliate mode active','Modo afiliado activo'],
    'Preciso criar uma conta para navegar pela loja?':['Do I need an account to browse the store?','¿Necesito una cuenta para explorar la tienda?'],
    'Como funciona o cadastro de afiliado?':['How do I join the affiliate program?','¿Cómo funciona el registro de afiliados?'],
    'Como funciona a comissão do afiliado?':['How do affiliate commissions work?','¿Cómo funcionan las comisiones de afiliado?'],
    'Quais formas de pagamento estarão disponíveis?':['Which payment methods will be available?','¿Qué métodos de pago estarán disponibles?'],
    'Programa Exclusivo':['Exclusive program','Programa exclusivo'],
    'Cresça como Afiliado L&A':['Grow with L&A Affiliates','Crece como afiliado de L&A'],
    'Crie sua conta':['Create your account','Crea tu cuenta'],
    'Cadastre seus dados pessoais, dados de contato, chave Pix e redes sociais.':['Provide your personal details, contact details, Pix key and social profiles.','Registra tus datos personales, de contacto, clave Pix y redes sociales.'],
    'Aguarde aprovação':['Await approval','Espera la aprobación'],
    'O administrador revisa sua solicitação e libera recursos de divulgação após a validação.':['The administrator reviews your application and unlocks promotion tools once approved.','El administrador revisa tu solicitud y habilita herramientas de promoción al aprobarla.'],
    'Compartilhe e acompanhe':['Share and track','Comparte y sigue'],
    'Compartilhe links parametrizados e acompanhe indicações, pedidos e comissões.':['Share referral links and track referrals, orders and commissions.','Comparte enlaces de referencia y sigue referencias, pedidos y comisiones.'],
    'Área exclusiva':['Exclusive area','Área exclusiva'],
    'Venda com mais clareza e controle.':['Sell with greater clarity and control.','Vende con más claridad y control.'],
    'Quero ser afiliado':['I want to become an affiliate','Quiero ser afiliado'],
    'Entrar como afiliado':['Affiliate login','Acceso de afiliados'],
    'Sua solicitação de afiliação está em análise. Aguarde a aceitação do administrador.':['Your affiliate application is under review. Please wait for approval.','Tu solicitud de afiliación está en revisión. Espera la aprobación.'],
    'Sessão de afiliado ativa':['Affiliate session active','Sesión de afiliado activa'],
    'Bem-vindo(a)':['Welcome','Bienvenido/a'],
    'Carregando status...':['Loading status...','Cargando estado...'],
    'Abrir painel executivo':['Open affiliate dashboard','Abrir panel de afiliado'],
    'Dados protegidos':['Protected data','Datos protegidos'],
    'Seu perfil, pedidos e dados de acesso serão protegidos por autenticação e permissões.':['Your account, orders and access details are protected by authentication and access controls.','Tu perfil, pedidos y datos de acceso están protegidos por autenticación y permisos.'],
    'Checkout inteligente':['Smart checkout','Pago inteligente'],
    'Dados do perfil preenchidos automaticamente no checkout após autenticação.':['Your account details are added to checkout automatically after signing in.','Los datos de tu perfil se completan automáticamente al pagar después de iniciar sesión.'],
    'Comissão rastreável':['Trackable commissions','Comisiones rastreables'],
    'Cada compra indicada mantém o vínculo com o afiliado e a comissão correspondente.':['Each referred purchase remains linked to its affiliate and commission.','Cada compra referida permanece vinculada al afiliado y su comisión.'],
    'Não. Você pode navegar livremente, ver produtos, comparar preços e usar os filtros sem login. A conta será necessária apenas ao adicionar itens ao carrinho, comprar ou solicitar afiliação.':['No. You may browse products, compare prices and use filters without signing in. You need an account to add items to the cart, purchase or apply as an affiliate.','No. Puedes explorar productos, comparar precios y usar filtros sin iniciar sesión. Necesitas una cuenta para añadir artículos al carrito, comprar o solicitar una afiliación.'],
    'Você cria uma conta ou faz login, completa sua ficha de afiliado e aguarda a validação do administrador. Após aprovação, o painel libera links, produtos, comissão e informações de vendas.':['Create an account or sign in, complete your affiliate profile and wait for administrative approval. The dashboard will then display links, products, commissions and sales information.','Crea una cuenta o inicia sesión, completa tu perfil de afiliado y espera la aprobación del administrador. Después tendrás acceso a enlaces, productos, comisiones y ventas.'],
    'Cada produto afiliável possui valor bruto, percentual e comissão cadastrados pelo ADM. Após o pagamento ser confirmado, a comissão fica vinculada à conta do afiliado responsável pela indicação.':['Eligible products have commission rates set by the administrator. Once payment is confirmed, the commission is linked to the referring affiliate.','Los productos elegibles tienen comisiones definidas por el administrador. Una vez confirmado el pago, la comisión queda vinculada al afiliado que hizo la referencia.'],
    'O sistema será preparado para checkout transparente com Pix, cartão de crédito e boleto. O pagamento será vinculado ao pedido e a comissão somente será criada após a confirmação segura da transação.':['The checkout supports secure payment flows for Pix, credit cards and invoices. Affiliate commissions are only registered after confirmed payment.','El pago admite métodos seguros como Pix, tarjeta de crédito y boleto. Las comisiones de afiliados se registran únicamente tras la confirmación del pago.'],

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
      document.querySelector('.royal-glass-header'),document.getElementById('royalPwaDock'),document.getElementById('royalPwaProfile'), document.getElementById('authModal'), document.getElementById('cartModal'), document.getElementById('checkoutModal'), document.getElementById('customerOrdersModal'), document.getElementById('customerProfileModal')];
    const result=[];
    for(const root of scopes.filter(Boolean)){
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
        const parent=node.parentElement;
        if(!parent||parent.closest('script,style,textarea,option,#adminDashboardModal,#catalogContainer,#customerOrdersList,#orderDetailsContent,#royalSearchSuggestions'))return NodeFilter.FILTER_REJECT;
        const normalized=node.textContent.trim().replace(/\s+/g,' ');
        return (COMMON[normalized] || Object.values(COMMON).some(v=>v.includes(normalized))) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
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
      const raw=originals.get(node),value=raw.trim(),translation=idx===null?value:COMMON[value.replace(/\s+/g,' ')]?.[idx];
      if(translation)node.textContent=raw.replace(value,translation);
    }
    const select=document.getElementById('royalLanguage');if(select)select.value=selected;
    if(typeof window.royalApplyCatalogTranslations === 'function') window.royalApplyCatalogTranslations();
  };
  window.royalApplyCatalogTranslations=function(){
    const language=fromStore('laRoyalLanguage');const idx=language==='en'?0:language==='es'?1:null;
    for(const heading of document.querySelectorAll('#catalogContainer .product-carousel-group > div:first-child h3')){
      const entry=Object.entries(COMMON).find(([portuguese,variants])=>
        portuguese===heading.textContent.trim() || variants.includes(heading.textContent.trim()));
      if(entry)heading.textContent=idx===null?entry[0]:entry[1][idx];
    }
    for(const label of document.querySelectorAll('#catalogContainer .royal-image-card-caption span')){
      label.textContent=idx===null?'Ver produto ›':idx===0?'View product ›':'Ver producto ›';
    }
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