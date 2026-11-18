/* Royal Intelligence: eventos agregados, sem PII, somente após consentimento analítico. */
(()=>{'use strict';
const endpoint='https://fqisewatypluagngmgka.supabase.co/rest/v1/rpc/royal_track_event';
const key='sb_publishable_Etts25r3XRBdDHuUYuUajg_YjXTn_wb';
const consent=()=>{try{return localStorage.getItem('laCookieConsentGiven')==='true'&&typeof state!=='undefined'&&state.cookiePreferences?.analytics===true;}catch{return false;}};
const sid=()=>{let id=sessionStorage.getItem('royal_analytics_sid');if(!id){id=crypto.randomUUID();sessionStorage.setItem('royal_analytics_sid',id);}return id;};
const send=(type,product)=>{if(!consent())return;fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':key},body:JSON.stringify({p_type:type,p_session:sid(),p_path:location.pathname.slice(0,160),p_product:product?String(product).slice(0,120):null}),keepalive:true}).catch(()=>{});};
let lastCheckout=false;
const checkout=()=>{const el=document.getElementById('checkoutModal');const visible=el&&!el.classList.contains('hidden');if(visible&&!lastCheckout){send('checkout_start');sessionStorage.setItem('royal_checkout_pending','1');}if(!visible&&lastCheckout&&sessionStorage.getItem('royal_checkout_pending')==='1'){send('checkout_abandoned');sessionStorage.removeItem('royal_checkout_pending');}lastCheckout=!!visible;};
document.addEventListener('DOMContentLoaded',()=>{
 if(consent()){send('page_view');if(sessionStorage.getItem('royal_checkout_pending')==='1'){send('checkout_abandoned');sessionStorage.removeItem('royal_checkout_pending');}}
 const modal=document.getElementById('checkoutModal');if(modal)new MutationObserver(checkout).observe(modal,{attributes:true,attributeFilter:['class']});
 document.addEventListener('click',e=>{const target=e.target.closest('button,a,[onclick]');if(!target)return;const action=target.getAttribute('onclick')||'';if(/addToCart\s*\(/.test(action)){const m=action.match(/addToCart\s*\(\s*['"]?([^'")]+)/);send('add_to_cart',m?.[1]);}if(/showProductDetails\s*\(|openRoyalProductPage\s*\(/.test(action)){const m=action.match(/\(\s*['"]?([^'")]+)/);send('product_click',m?.[1]);send('product_view',m?.[1]);}if(/goToMercadoPago|submitCheckout|confirmCheckout|finalizeOrder/i.test(target.id||'')||/processPayment\s*\(/.test(action)){send('checkout_submit');}});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-product-id]');if(b){send('product_click',b.getAttribute('data-product-id'));}});
 const accept=document.querySelectorAll('[onclick*="acceptAllCookies"],[onclick*="saveCookiePreferences"]');accept.forEach(el=>el.addEventListener('click',()=>setTimeout(()=>{if(consent())send('page_view');},100)));
});
window.royalTrackEvent=send;
})();