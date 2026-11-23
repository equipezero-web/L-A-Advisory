/* Store Royal multilingual product content. Never mutate state.products or checkout data. */
(function(){
 'use strict';
 const cache=new Map(), inFlight=new Map();
 const language=()=>['en','es'].includes(document.documentElement.lang)?document.documentElement.lang:'pt-BR';
 const catalogue=()=>typeof state!=='undefined'&&Array.isArray(state.products)?state.products:[];
 const product=id=>catalogue().find(p=>String(p.id)===String(id));
 const source=p=>JSON.stringify([p.name||'',p.description||'',p.category||'']);
 function translated(id,lang){
   const p=product(id),v=cache.get(lang+':'+id);
   return p&&v&&v.source===source(p)?v.content:null;
 }
 window.royalProductLabel=(p,field)=>p?(translated(p.id,language())?.[field]||p[field]||''):'';
 const DICT={
  'Voltar à loja':['Back to store','Volver a la tienda'],
  'Favoritar':['Favorite','Favorito'],'Favoritado':['Favorited','Favorito guardado'],
  'Compartilhar':['Share','Compartir'],'Quantidade':['Quantity','Cantidad'],
  'Adicionar ao carrinho':['Add to cart','Añadir al carrito'],
  'Comprar agora':['Buy now','Comprar ahora'],
  'Detalhes do produto':['Product details','Detalles del producto'],
  'Descrição do produto':['Product description','Descripción del producto'],
  'Descrição e informações':['Description and information','Descripción e información'],
  'Avaliações do produto':['Product reviews','Reseñas del producto'],
  'Avaliações e comentários':['Reviews and comments','Reseñas y comentarios'],
  'Deixe sua avaliação':['Write a review','Deja tu reseña'],
  'Nota':['Rating','Calificación'],'Comentário':['Comment','Comentario'],
  'Enviar avaliação':['Submit review','Enviar reseña'],
  'Categoria':['Category','Categoría'],'Estoque':['Stock','Existencias'],
  'Marca':['Brand','Marca'],'Cor':['Color','Color'],'Tamanho':['Size','Talla'],
  'País de origem':['Country of origin','País de origen'],
  'Conteúdo da embalagem':['Package contents','Contenido del paquete'],
  'Preço de varejo e atacado':['Retail and wholesale pricing','Precios minoristas y mayoristas'],
  'Cartão de crédito':['Credit card','Tarjeta de crédito'],
  'Envio e frete':['Shipping and delivery','Envío y entrega'],
  'Consulte parcelas, taxas e opções de pagamento no checkout.':['See installment plans, fees and payment options at checkout.','Consulta cuotas, tarifas y formas de pago al finalizar la compra.'],
  'Frete incluso no valor, conforme a política atual da Store Royal. Prazo informado no checkout.':['Shipping included in the price under the current Store Royal policy. Delivery time shown at checkout.','Envío incluido en el precio según la política actual de Store Royal. Plazo en el pago.'],
  'Finalização segura pelo checkout da Store Royal.':['Secure checkout through Store Royal.','Pago seguro a través de Store Royal.'],
  'Compra protegida e pagamento pelo checkout da Store Royal.':['Protected purchase and secure checkout through Store Royal.','Compra protegida y pago seguro en Store Royal.'],
  'Atacado em ativação:':['Wholesale activation in progress:','Mayorista en activación:'],
  'a finalização de compras com 10 ou mais unidades ficará indisponível até a atualização do servidor de pagamento.':['checkout for 10 or more units remains unavailable until the payment server is updated.','el pago de 10 o más unidades no estará disponible hasta actualizar el servidor de pagos.'],
  'O desconto é por quantidade do mesmo produto e sujeito à confirmação no pedido.':['Quantity discounts apply to the same product, subject to order confirmation.','Los descuentos por cantidad se aplican al mismo producto, sujetos a la confirmación del pedido.'],
  'Denunciar problema com este anúncio':['Report an issue with this listing','Reportar un problema con este anuncio'],
  'Carregando avaliações…':['Loading reviews…','Cargando reseñas…'],
  'Carregando avaliações aprovadas…':['Loading approved reviews…','Cargando reseñas aprobadas…'],
  'Ainda sem avaliações':['No reviews yet','Aún sin reseñas'],
  'Nenhuma avaliação aprovada até o momento.':['No approved reviews yet.','Aún no hay reseñas aprobadas.'],
  'Avaliação sem comentário.':['Review without comment.','Reseña sin comentario.'],
  'Este produto ainda não recebeu comentários aprovados. Seja o primeiro a avaliar!':['No approved comments yet. Be the first to review!','Este producto aún no tiene comentarios aprobados. ¡Sé el primero en valorar!'],
  'Avaliações passam por moderação antes da publicação. É necessário estar conectado.':['Reviews are moderated before publication. Sign in to participate.','Las reseñas se moderan antes de publicarse. Inicia sesión para participar.'],
  'Varejo indisponível — produto esgotado.':['Retail unavailable — out of stock.','Venta minorista no disponible — agotado.'],
  'Produto esgotado. Varejo e atacado indisponíveis.':['Out of stock. Retail and wholesale unavailable.','Agotado. Venta minorista y mayorista no disponibles.'],
  'Produto esgotado: nenhuma unidade disponível para compra.':['Out of stock: no units available for purchase.','Agotado: no hay unidades disponibles para comprar.'],
  'Esgotado':['Out of stock','Agotado'],
  'Não informada':['Not specified','No especificada'],
  'Mais informações sobre este produto em breve.':['More product information coming soon.','Próximamente habrá más información sobre este producto.']
 };
 const reverse=new Map();
 for(const [key,v] of Object.entries(DICT)){reverse.set(key,key);for(const t of v)reverse.set(t,key);}
 function otherText(s,lang){
  const idx=lang==='en'?0:1;
  const exact=reverse.get(s);
  if(exact)return DICT[exact][idx];
  let m=s.match(/^(\d+) (unidade disponível|unidades disponíveis)$/);
  if(m)return m[1]+' '+(lang==='en'?(m[1]==='1'?'unit available':'units available'):(m[1]==='1'?'unidad disponible':'unidades disponibles'));
  m=s.match(/^(\d+) \/ 5 · (\d+) avaliações?$/);
  if(m)return m[1]+' / 5 · '+m[2]+' '+(lang==='en'?'reviews':'reseñas');
  m=s.match(/^(\d+) avaliações? aprovadas?$/);
  if(m)return m[1]+' '+(lang==='en'?'approved reviews':'reseñas aprobadas');
  m=s.match(/^-(\d+)% por unidade$/);
  if(m)return '-'+m[1]+'% '+(lang==='en'?'per unit':'por unidad');
  m=s.match(/^(\d+)–(\d+) un\.$/);
  if(m)return m[1]+'–'+m[2]+' '+(lang==='en'?'units':'unid.');
  m=s.match(/^Selecione de 1 a (\d+) unidades disponíveis deste produto\.$/);
  if(m)return lang==='en'?'Select 1 to '+m[1]+' available units of this product.':'Selecciona de 1 a '+m[1]+' unidades disponibles de este producto.';
  m=s.match(/^Atacado indisponível: estoque atual de apenas (\d+) unidades\.$/);
  if(m)return lang==='en'?'Wholesale unavailable: only '+m[1]+' units in stock.':'Mayorista no disponible: solo '+m[1]+' unidades disponibles.';
  m=s.match(/^Faixas de atacado limitadas às (\d+) unidades disponíveis deste produto\.$/);
  if(m)return lang==='en'?'Wholesale tiers limited to '+m[1]+' available units.':'Descuentos mayoristas limitados a '+m[1]+' unidades disponibles.';
  m=s.match(/^Varejo \(1 a (\d+) unidades\):$/);
  if(m)return (lang==='en'?'Retail (1–':'Minorista (1–')+m[1]+(lang==='en'?' units):':' unidades):');
  m=s.match(/^(Atacado · \d+% OFF|Varejo) · (.+) por unidade · Total: (.+)$/);
  if(m)return (m[1]==='Varejo'?(lang==='en'?'Retail':'Minorista'):(lang==='en'?'Wholesale':'Mayorista')+' · '+m[1].match(/\d+%/)?.[0]+' OFF')
    +' · '+m[2]+' '+(lang==='en'?'per unit':'por unidad')+' · Total: '+m[3];
  return s;
 }
 function staticDetail(dialog,lang){
  const nodes=[],walker=document.createTreeWalker(dialog,NodeFilter.SHOW_TEXT);
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
   const el=node.parentElement;
   if(!el||el.closest('.royal-p-review,script,style,.royal-p-current-price,.royal-p-original-price'))continue;
   const current=node.textContent.trim();
   if(!current)continue;
   const canonical=node._royalOriginal||reverse.get(current)||current;
   if(lang==='pt-BR'){
    if(node._royalOriginal)node.textContent=node.textContent.replace(current,canonical);
   }else{
    const value=otherText(canonical,lang);
    if(value!==canonical){
     node._royalOriginal=canonical;
     node.textContent=node.textContent.replace(current,value);
    }
   }
  }
 }
 function detail(){
  const dialog=document.getElementById('productDetailsModal');
  if(!dialog)return;
  const p=product(dialog.dataset.productId);
  if(!p)return;
  const lang=language(),v=lang==='pt-BR'?null:translated(p.id,lang);
  const name=v?.name||p.name;
  const title=dialog.querySelector('.royal-product-info h1');
  if(title)title.textContent=name;
  const category=v?.category||p.category||'Produtos';
  const kicker=dialog.querySelector('.royal-p-kicker');
  if(kicker)kicker.textContent='Store Royal  /  '+category;
  const photo=dialog.querySelector('#royalSelectedProductImage');
  if(photo)photo.alt=name;
  const desc=dialog.querySelector('.royal-product-details:not(.royal-p-specs):not(#royalProductReviewsSection) > p');
  if(desc)desc.textContent=(v?.description??p.description)||(lang==='en'?'More product information coming soon.':lang==='es'?'Próximamente habrá más información sobre este producto.':'Mais informações sobre este produto em breve.');
  const spec=dialog.querySelector('.royal-p-specs dl > div:first-child dd');
  if(spec)spec.textContent=category;
  staticDetail(dialog,lang);
 }
 function cards(){
  for(const card of document.querySelectorAll('#catalogContainer .royal-image-only-card[data-product-id]')){
   const p=product(card.dataset.productId);
   if(!p)continue;
   const name=translated(p.id,language())?.name||p.name;
   const title=card.querySelector('.royal-image-card-caption h3');
   if(title)title.textContent=name;
   const img=card.querySelector('img.royal-full-card-image');
   if(img)img.alt=name;
   card.setAttribute('aria-label',language()==='en'?'View details: '+name:language()==='es'?'Ver detalles: '+name:'Ver detalhes de '+name);
  }
 }
 function notice(message){
  const bar=document.querySelector('.royal-web-strip-inner');
  if(!bar)return;
  let target=document.getElementById('royalProductTranslationNotice');
  if(!target){target=document.createElement('span');target.id='royalProductTranslationNotice';target.setAttribute('role','status');target.className='royal-product-translation-notice';bar.append(target);}
  target.textContent=message;target.hidden=!message;
 }
 async function request(ids,lang){
  const base=typeof SUPABASE_FUNCTIONS_BASE!=='undefined'?SUPABASE_FUNCTIONS_BASE:'';
  const key=typeof SUPABASE_ANON_KEY!=='undefined'?SUPABASE_ANON_KEY:'';
  if(!base||!key)throw Error('Serviço indisponível');
  const response=await fetch(base+'/royal-product-translate',{method:'POST',cache:'no-store',
   headers:{'Content-Type':'application/json',apikey:key},
   body:JSON.stringify({language:lang,ids})});
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body?.ok)throw Error(body?.error||'Falha ao traduzir produtos');
  for(const t of body.translations||[]){
   const p=product(t.id);
   if(p&&typeof t.name==='string'&&typeof t.description==='string'&&typeof t.category==='string')
    cache.set(lang+':'+t.id,{source:source(p),content:{name:t.name,description:t.description,category:t.category}});
  }
  if(body.warning&&body.pending?.length)notice(body.warning);
  else if(!body.pending?.length)notice('');
 }
 async function load(ids,lang){
  const missing=[...new Set(ids.map(String))].filter(id=>product(id)&&!translated(id,lang));
  for(let i=0;i<missing.length;i+=15){
   const batch=missing.slice(i,i+15),key=lang+':'+batch.join(',');
   if(inFlight.has(key)){await inFlight.get(key);continue;}
   const task=request(batch,lang);inFlight.set(key,task);
   try{await task;}finally{inFlight.delete(key);}
   if(language()===lang){cards();detail();}
  }
 }
 window.royalTranslateVisibleProducts=async function(){
  cards();detail();
  const lang=language();
  if(lang==='pt-BR'){notice('');return;}
  const ids=[...document.querySelectorAll('#catalogContainer .royal-image-only-card[data-product-id]')].map(e=>e.dataset.productId);
  const dialog=document.getElementById('productDetailsModal');
  if(dialog?.dataset.productId)ids.unshift(dialog.dataset.productId);
  try{await load(ids,lang);}
  catch(e){console.warn('Store Royal translations:',String(e));notice('Tradução indisponível; exibindo títulos originais.');}
 };
 window.royalTranslateProductDetail=async function(id){
  detail();
  const lang=language();
  if(lang==='pt-BR')return;
  try{await load([id],lang);}catch(e){console.warn('Product translations:',String(e));notice('Tradução do produto indisponível.');}
  if(language()===lang)detail();
 };
 window.royalApplyProductDetailTranslations=detail;
})();
