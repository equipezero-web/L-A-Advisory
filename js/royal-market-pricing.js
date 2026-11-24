/* Store Royal — referências informadas pelo lojista em 23/11/2026.
 * Simulações informativas. O Mercado Pago determina taxas, disponibilidade
 * e valor final no checkout; não reajustar pedidos, Pix ou comissão aqui.
 */
(function(){
 'use strict';
 const buyerRates=Object.freeze({2:4.52,3:6.61,4:8.68,5:10.65,6:11.95,7:13.13,8:14.39,9:15.62,10:16.82,11:18.01,12:19.17});
 const methods=Object.freeze([
  Object.freeze({id:'pix',name:'Pix',rate:0.99,days:'Na hora'}),
  Object.freeze({id:'credit1',name:'Cartão de crédito · à vista',rate:4.98,days:'7 dias'}),
  Object.freeze({id:'credit2to6',name:'Cartão · 2 a 6x',rate:2.99,days:'7 dias'}),
  Object.freeze({id:'credit7to12',name:'Cartão · 7 a 12x',rate:3.09,days:'7 dias'}),
  Object.freeze({id:'credit13to18',name:'Cartão · 13 a 18x',rate:3.09,days:'7 dias'}),
  Object.freeze({id:'creditLine',name:'Linha de Crédito',rate:4.99,days:'7 dias'}),
  Object.freeze({id:'boleto',name:'Boleto',fixed:3.49,days:'3 dias'}),
  Object.freeze({id:'balance',name:'Saldo Mercado Pago',rate:4.99,days:'7 dias'}),
  Object.freeze({id:'prepaid',name:'Cartão pré-pago',rate:4.99,days:'7 dias'}),
  Object.freeze({id:'openFinance',name:'Open Finance',rate:0,days:'Na hora'})
 ]);
 const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
 function installment(base,count){
  const amount=Number(base),n=Number(count),rate=buyerRates[n];
  if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(n)||rate===undefined)return null;
  const total=round(amount*(1+rate/100));
  return {count:n,rate,total,perInstallment:Math.ceil(total/n*100-0.0000001)/100};
 }
 function merchantFee(base,id){
  const amount=Number(base),method=methods.find(m=>m.id===id);
  if(!Number.isFinite(amount)||amount<0||!method)return null;
  return method.fixed!==undefined?round(method.fixed):round(amount*method.rate/100);
 }
 function scenario(base,productCostExcludingManualPaymentFee,affiliateCommission=0,id='pix'){
  const revenue=Number(base),cost=Number(productCostExcludingManualPaymentFee),commission=Number(affiliateCommission);
  const fee=merchantFee(revenue,id);
  if(fee===null||![revenue,cost,commission].every(Number.isFinite))return null;
  return {id,fee,received:round(revenue-fee),directProfit:round(revenue-fee-cost),
   affiliateProfit:round(revenue-fee-cost-commission)};
 }
 const languages={
  'pt-BR':{noReviews:'Sem avaliações',pix:'no Pix ou cartão à vista',offer:'Oferta',install:'12x de',checkout:'Parcelas e condições finais no checkout.',payments:'Possíveis meios de pagamento',seePayments:'Ver simulações de parcelamento',estimated:'Simulação com acréscimo ao comprador',buyer:'Acréscimo estimado ao comprador',warning:'Simulações baseadas em percentuais de referência. Juros, limite de parcelas, meios disponíveis e total final são confirmados pelo Mercado Pago no checkout.',options:'Pix, cartão de crédito, linha de crédito, boleto, saldo Mercado Pago, cartão pré-pago e Open Finance (conforme disponibilidade).'},
  en:{noReviews:'No reviews yet',pix:'with Pix or one-time card payment',offer:'Offer',install:'12 installments of',checkout:'Final installments and terms at checkout.',payments:'Potential payment methods',seePayments:'View installment estimates',estimated:'Estimate with buyer financing',buyer:'Estimated buyer surcharge',warning:'Estimates based on reference rates. Financing, installment limits, available methods and final totals are confirmed by Mercado Pago at checkout.',options:'Pix, credit card, credit line, bank slip, Mercado Pago balance, prepaid card and Open Finance (subject to availability).'},
  es:{noReviews:'Sin reseñas',pix:'con Pix o tarjeta a un pago',offer:'Oferta',install:'12 cuotas de',checkout:'Cuotas y condiciones finales en el pago.',payments:'Posibles medios de pago',seePayments:'Ver cuotas estimadas',estimated:'Simulación con recargo al comprador',buyer:'Recargo estimado al comprador',warning:'Simulaciones basadas en tasas de referencia. Intereses, cuotas, medios disponibles y total final se confirman en Mercado Pago al pagar.',options:'Pix, tarjeta de crédito, línea de crédito, boleto, saldo Mercado Pago, tarjeta prepaga y Open Finance (según disponibilidad).'}
 };
 const copy=()=>languages[document.documentElement.lang]||languages['pt-BR'];
 window.royalMarketPricing=Object.freeze({buyerRates,methods,round,installment,merchantFee,scenario,copy});
})();
