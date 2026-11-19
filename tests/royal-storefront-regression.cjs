// Store Royal contract checks: runnable without browser or third-party services.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('js/royal-storefront-state.js','utf8');
let domListener;
const store=new Map();
const context={
  document:{readyState:'loading',addEventListener(type,fn){if(type==='DOMContentLoaded')domListener=fn;}},
  window:{},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
  state:{currentUser:null,cart:[],products:[],orders:[]},
  supabaseAuthUser:null,
  console,Date,Math,Number,String,JSON,Intl,setInterval(){},setTimeout(){},URLSearchParams
};
vm.createContext(context);
vm.runInContext(src,context);
const parse=context.window.royalParseBRL;
for(const [input,expected] of [
  ['200,00',200],['2.000,000',2000],['2.000,00',2000],['2500,50',2500.50],
  ['5.000,00',5000],['0,05',0.05],['4.999,99',4999.99],['5000.50',5000.50]
]) assert.equal(parse(input),expected,input);
for(const input of ['5.000,123','1,9,9','2.00,00','1.234.56','Infinity','-10,00','2e3']){
  assert.ok(Number.isNaN(parse(input)),'Invalid input accepted: '+input);
}
assert.equal(context.window.royalOrderLabel('pending'),'A pagar');
assert.equal(context.window.royalOrderLabel('processing'),'Preparando');
assert.equal(context.window.royalOrderLabel('shipped'),'A caminho');
assert.equal(context.window.royalOrderLabel('delivered',new Date().toISOString()),'A avaliar');
assert.equal(context.window.royalOrderLabel('delivered'),'Entregue');
assert.ok(typeof context.window.royalCartOnAuthChanged==='function');
assert.ok(typeof context.window.royalCheckoutOpen==='function');
assert.ok(typeof context.window.royalConfirmDelivery==='function');
assert.ok(typeof context.window.royalReviewOrderProduct==='function');
console.log('Store Royal: BRL parsing, status mapping and APIs passed');
