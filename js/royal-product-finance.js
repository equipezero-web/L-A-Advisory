/* Gestão financeira privada por produto — Store Royal.
 * Nunca adicionar fornecedor/link/custos aos objetos públicos de state.products.
 * A proteção de acesso é aplicada também pelas policies RLS do Supabase.
 */
(function () {
'use strict';
const TABLE = 'product_admin_finance';
const COST_FIELDS = ['acquisition_cost','supplier_shipping','icms_cost','service_cost','supplier_discount','payment_fee'];
const FORM_FIELDS = {
  supplier_name: 'royalFinanceSupplierName',
  supplier_url: 'royalFinanceSupplierUrl',
  acquisition_cost: 'royalFinanceAcquisition',
  supplier_shipping: 'royalFinanceShipping',
  icms_cost: 'royalFinanceIcms',
  service_cost: 'royalFinanceService',
  supplier_discount: 'royalFinanceSupplierDiscount',
  payment_fee: 'royalFinancePaymentFee'
};
const el = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const moneyInput = n => n===null||n===undefined?'':new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n));
const round = n => {
  const value=Number(n),abs=Math.abs(value);
  if(!Number.isFinite(value))return NaN;
  // Currency half-up rounding including x.xxx5 ties despite IEEE-754 precision.
  return Math.sign(value)*Math.round((abs+Number.EPSILON*Math.max(1,abs))*100)/100;
};
const percent = n => Number.isFinite(n)?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(n)+'%':'—';
const create = (tag,cl='',txt)=>{const node=document.createElement(tag);if(cl)node.className=cl;if(txt!==undefined)node.textContent=String(txt);return node;};
let openGeneration = 0;
let formReady = false;
let ledgerRows = new Map();
let lastLedgerProducts = [];
let ledgerVersion = 0;

function isAdmin() {
  return typeof state!=='undefined' && state.currentUser?.role==='admin' &&
    state.currentUser?.status==='active' &&
    typeof supabaseAuthUser!=='undefined' && Boolean(supabaseAuthUser?.id);
}
function parseCost(raw) {
  const s=String(raw??'').trim();
  if(!s)return null;
  if(!/^(?:R\$\s*)?[\d.,\s]+$/.test(s))throw Error('Informe valores monetários válidos.');
  let normalized=s.replace(/R\$|\s/g,'');
  if(normalized.includes(','))normalized=normalized.replace(/\./g,'').replace(',','.');
  else if((normalized.match(/\./g)||[]).length>1)normalized=normalized.replace(/\./g,'');
  const n=Number(normalized);
  if(!Number.isFinite(n)||n<0||n>100000000)throw Error('Os custos devem ser valores positivos ou zero.');
  return round(n);
}
function cleanUrl(value) {
  const s=String(value||'').trim();
  if(!s)return null;
  if(s.length>2048)throw Error('O link do fornecedor é muito longo.');
  const u=new URL(/^https?:\/\//i.test(s)?s:'https://'+s);
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!u.hostname.includes('.'))
    throw Error('Informe um link HTTPS válido do fornecedor.');
  return u.href;
}
function fieldId(key){return FORM_FIELDS[key];}
function clearForm() {
  for(const id of Object.values(FORM_FIELDS))if(el(id))el(id).value='';
  const note=el('royalFinanceFormStatus');
  if(note){note.textContent='Os dados desta seção ficam restritos à administração.';note.className='text-xs text-slate-600 mt-2';}
}
function displayForm(row) {
  for(const [field,id] of Object.entries(FORM_FIELDS)) {
    const input=el(id);
    if(!input)continue;
    const value=row?.[field];
    input.value=COST_FIELDS.includes(field)?moneyInput(value):String(value??'');
  }
}
function setFormState(ready,message,error=false) {
  formReady=ready;
  const msg=el('royalFinanceFormStatus');
  if(msg){msg.textContent=message;msg.className='text-xs mt-2 '+(error?'text-red-700 font-semibold':'text-slate-600');}
}
async function requireAdmin(){
  if(!isAdmin())throw Error('Entre como administrador para visualizar informações privadas.');
  if(typeof getRoyalAiAccessToken==='function')await getRoyalAiAccessToken();
  if(typeof supabaseClient==='undefined'||!supabaseClient)throw Error('Conexão com o banco indisponível.');
}
async function getOne(productId) {
  await requireAdmin();
  const {data,error}=await supabaseClient.from(TABLE).select('*').eq('product_id',String(productId)).maybeSingle();
  if(error)throw error;
  return data||null;
}
window.royalFinanceGetRecord = getOne;
window.royalFinanceFormOpened = async function(productId) {
  const generation=++openGeneration;
  clearForm();
  setFormState(!productId,productId?'Carregando dados privados do fornecedor…':
    'Cadastre os dados do fornecedor e custos quando estiverem disponíveis.');
  if(!productId)return;
  try {
    const row=await getOne(productId);
    if(generation!==openGeneration || String(el('adminProductId')?.value)!==String(productId))return;
    displayForm(row);
    setFormState(true,row?'Dados privados do fornecedor carregados com segurança.':
      'Fornecedor ainda não cadastrado neste produto. Campos vazios significam dados não informados.');
  } catch(e) {
    if(generation!==openGeneration)return;
    setFormState(false,'Não foi possível carregar os dados privados. O formulário não poderá salvar até que o carregamento funcione: '+String(e?.message||e),true);
  }
};
window.royalFinanceCancelProductForm = function() {
  ++openGeneration;
  formReady=false;
  clearForm();
};
window.royalFinanceReadProductForm = function() {
  if(!formReady)throw Error('Os dados privados ainda não foram carregados. Aguarde ou reabra o produto antes de salvar.');
  if(!isAdmin())throw Error('Acesso administrativo necessário para cadastrar fornecedor.');
  const result={};
  const name=String(el(fieldId('supplier_name'))?.value||'').trim();
  if(name.length>160)throw Error('Nome do fornecedor deve ter até 160 caracteres.');
  result.supplier_name=name||null;
  try{result.supplier_url=cleanUrl(el(fieldId('supplier_url'))?.value);}
  catch{throw Error('O link de compra do fornecedor precisa ser uma URL válida (https://...).');}
  for(const field of COST_FIELDS){
    try{result[field]=parseCost(el(fieldId(field))?.value);}
    catch(e){throw Error('Custo '+field+': '+String(e?.message||e));}
  }
  if(result.acquisition_cost!==null && result.supplier_discount!==null &&
      result.supplier_discount>result.acquisition_cost)
    throw Error('O desconto do fornecedor não pode ultrapassar o custo de aquisição.');
  return result;
};
window.royalFinanceSaveProduct = async function(productId,formRecord) {
  await requireAdmin();
  const payload={...formRecord,product_id:String(productId),updated_at:new Date().toISOString()};
  const {error}=await supabaseClient.from(TABLE).upsert(payload,{onConflict:'product_id'});
  if(error)throw error;
  ledgerRows.set(String(productId),{...ledgerRows.get(String(productId)),...payload});
};

function calcUnit(p,row,qty) {
  const stock=Math.max(0,Math.trunc(Number(p.stock)||0));
  const quantity=Number(qty);
  const valid=Number.isInteger(quantity)&&quantity>0&&quantity<=Math.min(stock,100);
  const gross=Number(p.price)||0;
  const retail=typeof calculateFinalPrice==='function'?calculateFinalPrice(p):
    (Number(p.salePrice)>0?round(Number(p.salePrice)):round(gross*(1-Number(p.discount||0)/100)));
  const wholesaleRate=valid&&typeof getStoreWholesaleRate==='function'?getStoreWholesaleRate(quantity):
    valid?(quantity>=70?5:quantity>=40?4:quantity>=10?3:0):0;
  const saleUnit=round(retail*(1-wholesaleRate/100));
  const revenue=valid?round(saleUnit*quantity):null;
  const commissionRate=Number(p.commission)||0;
  // Same affiliate commission base as the create-order function: original gross price.
  const commission=valid?round(round(gross)*quantity*commissionRate/100):null;
  const missing=COST_FIELDS.filter(field=>row?.[field]===null||row?.[field]===undefined);
  const costsReady=Boolean(row)&&missing.length===0 &&
    COST_FIELDS.every(f=>Number.isFinite(Number(row[f]))&&Number(row[f])>=0) &&
    Number(row.supplier_discount)<=Number(row.acquisition_cost);
  const component=costsReady?Object.fromEntries(COST_FIELDS.map(f=>[f,round(row[f])])):null;
  // Na planilha, "Serviço" (F) é um acréscimo ao preço (H), e não uma despesa
  // que deve ser subtraída novamente do lucro (J).
  const unitCost=costsReady?round(component.acquisition_cost+component.supplier_shipping+
    component.icms_cost+component.payment_fee-component.supplier_discount):null;
  const sheetPrice=costsReady?round(component.acquisition_cost+component.supplier_shipping+
    component.icms_cost+component.service_cost-component.supplier_discount):null;
  const costTotal=valid&&costsReady?round(unitCost*quantity):null;
  const directProfit=costTotal!==null?round(revenue-costTotal):null;
  const affiliateProfit=directProfit!==null?round(directProfit-commission):null;
  // Referência da planilha: comissão I = valor de compra C × taxa.
  // O checkout real usa o preço bruto cadastrado: mostrar as duas bases, não confundir.
  const sheetCommission=valid&&costsReady?round(component.acquisition_cost*quantity*commissionRate/100):null;
  // A fórmula de referência J usa o preço composto H da planilha,
  // enquanto o checkout real usa o preço vigente da loja com o atacado.
  const sheetStyleProfit=valid&&costsReady&&sheetPrice!==null&&sheetCommission!==null?
    round(round(sheetPrice*quantity)-costTotal-sheetCommission):null;
  // The payment_fee field is a *manual per-unit estimate*. For provider-specific
  // comparisons replace it with the corresponding Mercado Pago reference fee;
  // do not subtract both charges, or expected profit would be understated.
  const pricing=window.royalMarketPricing;
  const baseCostExcludingManualPaymentFee=costTotal!==null
    ? round(costTotal-component.payment_fee*quantity):null;
  const paymentScenarios=valid&&costsReady&&pricing
    ? Object.fromEntries(pricing.methods.map(method=>[method.id,
        pricing.scenario(revenue,baseCostExcludingManualPaymentFee,commission,method.id)]))
    : null;
  // 6% on top of the product price is a PRIVATE comparison, not an active fee
  // or automatic change to Mercado Pago checkout.
  const creditMarkupComparison=paymentScenarios?(()=>{
    const simulatedGross=round(revenue*1.06);
    const fee=pricing.merchantFee(simulatedGross,'credit1');
    return {gross:simulatedGross,fee,net:round(simulatedGross-fee),
      directProfit:round(simulatedGross-fee-baseCostExcludingManualPaymentFee),
      affiliateProfit:round(simulatedGross-fee-baseCostExcludingManualPaymentFee-commission)};
  })():null;
  const directMargin=directProfit!==null&&revenue>0?round(directProfit/revenue*100):null;
  const affiliateMargin=affiliateProfit!==null&&revenue>0?round(affiliateProfit/revenue*100):null;
  // As colunas K, L e M da planilha usam H × 3% e I × 3% (comissão
  // sobre o custo da compra), não a comissão efetiva do checkout.
  const sheetThreePercent=valid&&costsReady&&sheetPrice!==null&&sheetCommission!==null?{
    revenue:round(round(sheetPrice*quantity)*.03),
    commission:round(sheetCommission*.03),
    combined:round(round(round(sheetPrice*quantity)*.03)+round(sheetCommission*.03))
  }:null;
  return {valid,quantity,stock,retail,saleUnit,wholesaleRate,revenue,commissionRate,commission,
    costsReady,missing,component,unitCost,sheetPrice,costTotal,directProfit,affiliateProfit,
    sheetCommission,sheetStyleProfit,directMargin,affiliateMargin,sheetThreePercent,
    paymentScenarios,creditMarkupComparison, supplier:row?.supplier_name||null,
    supplierUrl:row?.supplier_url||null,order:Number(row?.display_order)||0};
}
window.royalFinanceCompute = function(p,financeRow,analysisOrQty){
  const quantity=typeof analysisOrQty==='object'?analysisOrQty.quantity:Number(analysisOrQty);
  return calcUnit(p,financeRow,quantity);
};

function line(parent,key,value) {
  const wrap=create('div','flex flex-wrap items-start justify-between gap-2 py-2 border-b border-slate-100');
  wrap.append(create('span','text-sm text-slate-600',key),create('strong','text-sm text-right text-slate-900',value));
  parent.appendChild(wrap);
}
function composeCell(tr,value,classes=''){
  const td=create('td','px-3 py-2.5 align-top text-xs whitespace-nowrap '+classes);
  if(value instanceof Node)td.appendChild(value);
  else td.textContent=String(value??'—');
  tr.appendChild(td);
}
function urlAnchor(value,label){
  let url;
  try{url=cleanUrl(value)}catch{return create('span','text-slate-400','Link inválido');}
  if(!url)return create('span','text-slate-400','—');
  const a=create('a','text-emerald-800 font-semibold underline underline-offset-2',label);
  a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';
  return a;
}
function info(msg,isError=false) {
 const node=el('royalFinanceLedgerStatus');
 if(node){node.textContent=msg;node.className='text-sm mt-2 '+(isError?'text-red-700 font-semibold':'text-slate-600');}
}
function rowsSorted() {
  const products=typeof state!=='undefined'&&Array.isArray(state.products)?state.products:[];
  return [...products].sort((a,b)=>{
    const ordA=Number(ledgerRows.get(String(a.id))?.display_order)||0;
    const ordB=Number(ledgerRows.get(String(b.id))?.display_order)||0;
    return (ordA||100000)-(ordB||100000)||String(a.name).localeCompare(String(b.name),'pt-BR');
  });
}
window.royalFinanceRenderLedger=function(){
  const tbody=el('royalFinanceLedgerBody');
  if(!tbody)return;
  tbody.replaceChildren();
  if(!isAdmin()){info('Acesso administrativo necessário.',true);return;}
  const q=Number(el('royalFinanceLedgerQty')?.value||1);
  let seen=0,complete=0,totalRevenue=0,totalCost=0,totalAffiliateProfit=0,totalsMissing=false;
  const products=rowsSorted();
  lastLedgerProducts=products;
  for(const p of products){
    const row=ledgerRows.get(String(p.id))||null;
    const c=calcUnit(p,row,q);
    const tr=create('tr','border-b border-slate-100 hover:bg-slate-50');
    composeCell(tr,create('input','w-16 rounded-md border border-slate-300 px-2 py-1 text-sm text-center'));
    const number=tr.lastChild.querySelector('input');
    number.type='number';number.min='0';number.max='1000000';number.step='1';
    number.value=row?.display_order||0;number.dataset.productId=String(p.id);
    composeCell(tr,String(p.name),'max-w-[240px] truncate font-semibold text-slate-900');
    const supplier=create('div','min-w-[110px]');
    supplier.append(create('span','block text-slate-800',row?.supplier_name||'Não informado'),
      urlAnchor(row?.supplier_url,'Abrir fornecedor'));
    composeCell(tr,supplier);
    for(const field of COST_FIELDS)
      composeCell(tr,row?.[field]===null||row?.[field]===undefined?'Pendente':money(row[field]),
        field==='acquisition_cost'?'font-medium':'');
    composeCell(tr,c.sheetPrice===null?'Pendente':money(c.sheetPrice));
    composeCell(tr,money(c.saleUnit)+(c.wholesaleRate?' · -'+c.wholesaleRate+'%':''));
    composeCell(tr,validOr(c,c.revenue));
    composeCell(tr,validOr(c,c.commission));
    composeCell(tr,c.costsReady?money(c.unitCost):'Custos pendentes');
    composeCell(tr,c.sheetStyleProfit===null?'Pendente':money(c.sheetStyleProfit));
    composeCell(tr,c.valid&&c.costsReady?money(c.directProfit):'Pendente',
      c.directProfit===null?'text-slate-500':c.directProfit<0?'text-red-700 font-semibold':'text-emerald-700 font-semibold');
    for(const methodId of ['pix','credit1','credit7to12']){
      const value=c.paymentScenarios?.[methodId]?.directProfit;
      composeCell(tr,value===null||value===undefined?'Pendente':money(value),
        value===null||value===undefined?'text-slate-500':value<0?'text-red-700 font-semibold':'text-emerald-700 font-semibold');
    }
    composeCell(tr,c.valid&&c.costsReady?money(c.affiliateProfit):'Pendente',
      c.affiliateProfit===null?'text-slate-500':c.affiliateProfit<0?'text-red-700 font-semibold':'text-emerald-700 font-semibold');
    composeCell(tr,c.valid&&c.costsReady?percent(c.affiliateMargin):'Pendente');
    const view=create('button','rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-amber-300','Analisar');
    view.type='button';view.dataset.productId=String(p.id);
    view.addEventListener('click',()=>{
      const tab=document.querySelector('.admin-tab[onclick*="admin-royal-ai"]');
      if(typeof window.switchAdminTab==='function')window.switchAdminTab('admin-royal-ai',tab);
      void (async ()=>{
        if(typeof window.royalAiLoadProductChoices==='function')await window.royalAiLoadProductChoices();
        const select=el('royalAiProductSelect'),filter=el('royalAiProductFilter');
        if(filter){filter.value='';window.royalAiFilterProductChoices?.()}
        if(select){select.value=String(p.id);window.royalAiSyncProductLimits?.()}
        if(el('royalAiAnalysisQuantity'))el('royalAiAnalysisQuantity').value=String(q);
        await window.royalAiAnalyzeSelectedProduct?.(String(p.id));
      })();
    });
    const actions=create('div','flex flex-wrap gap-2 min-w-[145px]');
    const edit=create('button','rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800','Editar');
    edit.type='button';
    edit.addEventListener('click',()=>{
      if(typeof window.openAdminProductForm==='function')window.openAdminProductForm(String(p.id));
    });
    actions.append(edit,view);
    composeCell(tr,actions);
    tbody.appendChild(tr);
    if(c.valid){seen++;totalRevenue=round(totalRevenue+c.revenue)}
    if(c.valid&&c.costsReady){complete++;totalCost=round(totalCost+c.costTotal);totalAffiliateProfit=round(totalAffiliateProfit+c.affiliateProfit)}
    else totalsMissing=true;
  }
  const label=el('royalFinanceLedgerTotals');
  if(label)label.textContent='Simulação de '+(Number.isInteger(q)?q:'?')+' unidade(s) de cada produto · '+
    products.length+' produto(s) · '+complete+' com cálculo financeiro completo e estoque compatível.'+
    (totalsMissing?' Totais gerais não calculados: há produtos sem custos completos ou estoque suficiente.':
      ' Receita total: '+money(totalRevenue)+' · Custos: '+money(totalCost)+
      ' · Resultado estimado com afiliados: '+money(totalAffiliateProfit)+'.');
  if(products.length===0)info('Nenhum produto disponível no catálogo.',false);
};
function validOr(c,v){return c.valid&&v!==null?money(v):'Estoque insuficiente'}
window.royalFinanceLoadLedger=async function(){
  const generation=++ledgerVersion;
  if(!isAdmin()){info('Faça login como administrador.',true);return;}
  info('Carregando fornecedores e contas privadas…');
  try{
    await requireAdmin();
    const {data,error}=await supabaseClient.from(TABLE).select('*');
    if(error)throw error;
    if(generation!==ledgerVersion)return;
    ledgerRows=new Map((data||[]).map(row=>[String(row.product_id),row]));
    window.royalFinanceRenderLedger();
    info('Dados privados sincronizados. Os valores do fornecedor não aparecem para clientes.');
  }catch(e){info('Não foi possível carregar as contas privadas: '+String(e?.message||e),true);}
};
window.royalFinanceSaveOrder=async function(){
  if(!isAdmin()){info('Acesso administrativo necessário.',true);return;}
  const inputs=[...document.querySelectorAll('#royalFinanceLedgerBody input[data-product-id]')];
  const edits=[];
  for(const input of inputs){
    const n=Number(input.value);
    if(!Number.isInteger(n)||n<0||n>1000000){info('A ordem deve ser um número inteiro entre 0 e 1.000.000.',true);input.focus();return;}
    const id=String(input.dataset.productId);
    if(n!==Number(ledgerRows.get(id)?.display_order||0))edits.push({id,order:n});
  }
  if(!edits.length){info('A ordem já está salva.');return;}
  info('Salvando a nova ordem no painel privado…');
  try {
    await requireAdmin();
    for(const item of edits){
      const exists=ledgerRows.has(item.id);
      const query=exists?supabaseClient.from(TABLE).update({display_order:item.order,updated_at:new Date().toISOString()}).eq('product_id',item.id):
        supabaseClient.from(TABLE).insert({product_id:item.id,display_order:item.order});
      const {error}=await query;
      if(error)throw error;
      ledgerRows.set(item.id,{...ledgerRows.get(item.id),product_id:item.id,display_order:item.order});
    }
    window.royalFinanceRenderLedger();
    info('Ordem dos produtos atualizada e salva no Supabase.');
  }catch(e){
    info('Não foi possível salvar todas as posições. Atualize a tabela: '+String(e?.message||e),true);
  }
};
window.royalFinanceClearPrivateUI = function(){
  ++ledgerVersion;
  ++openGeneration;
  ledgerRows.clear();
  lastLedgerProducts=[];
  formReady=false;
  clearForm();
  el('royalFinanceLedgerBody')?.replaceChildren();
  const summary=el('royalFinanceLedgerTotals');
  if(summary)summary.textContent='Abra novamente o painel administrativo para carregar as informações financeiras.';
  info('Dados financeiros privados limpos desta sessão visual.');
  el('royalAiProductAnalysisOutput')?.replaceChildren();
  // O chat administrativo pode conter nomes de fornecedores/custos; limpar ao sair.
  el('royalAiChatMessages')?.replaceChildren();
};
// Only confidential records are fetched into administrator views, never persisted in the public catalog.
})();