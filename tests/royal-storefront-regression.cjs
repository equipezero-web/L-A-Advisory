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


// The language selector must reverse translations on both existing and newly rendered nodes.
{
  const textNodes=[];
  const mainRoot={};
  const filterConstants={SHOW_TEXT:4,FILTER_ACCEPT:1,FILTER_SKIP:3,FILTER_REJECT:2};
  const saved=new Map();
  const testDocument={
    readyState:'loading',
    documentElement:{lang:'pt-BR'},
    addEventListener(){},
    querySelector(selector){return selector==='main'?mainRoot:null;},
    querySelectorAll(){return [];},
    getElementById(){return null;},
    createTreeWalker(_root,_what,filter){
      const candidates=textNodes.filter(node=>filter.acceptNode(node)===filterConstants.FILTER_ACCEPT);
      let index=-1;
      return {nextNode(){return ++index<candidates.length;},get currentNode(){return candidates[index];}};
    }
  };
  const l10n={
    document:testDocument,
    NodeFilter:filterConstants,
    window:{},
    localStorage:{
      getItem:key=>saved.get(key)||null,
      setItem:(key,val)=>saved.set(key,String(val)),
      removeItem:key=>saved.delete(key)
    },
    state:{currentUser:null,cart:[],products:[],orders:[]},
    supabaseAuthUser:null,console,Date,Math,Number,String,JSON,Intl,URLSearchParams,
    setInterval(){},setTimeout(){}
  };
  vm.createContext(l10n);
  vm.runInContext(src,l10n);
  const node=text=>({textContent:text,parentElement:{closest(){return false;}}});
  const old=node('Bem-vindo de volta');
  textNodes.push(old);
  l10n.window.royalSetLanguage('en');
  assert.equal(old.textContent,'Welcome back','Initial translation to English');
  l10n.window.royalSetLanguage('es');
  assert.equal(old.textContent,'Bienvenido de nuevo','Existing node changes to Spanish');
  const dynamic=node('Secure payment'); // Injected after English was already selected.
  textNodes.push(dynamic);
  l10n.window.royalSetLanguage('es');
  assert.equal(dynamic.textContent,'Pago seguro','New English node changes to Spanish');
  l10n.window.royalSetLanguage('pt-BR');
  assert.equal(old.textContent,'Bem-vindo de volta');
  assert.equal(dynamic.textContent,'Pagamento seguro','Return to PT-BR must restore dynamic node');
  dynamic.textContent='A caminho'; // Reused text node with new content.
  l10n.window.royalSetLanguage('en');
  assert.equal(dynamic.textContent,'On the way','Updated node source must be re-evaluated');
  assert.equal(testDocument.documentElement.lang,'en');
}
console.log('Store Royal: reversible language switching passed');
