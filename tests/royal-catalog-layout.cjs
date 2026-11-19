// Regression coverage for the continuous Store Royal product grid.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('assets/royal-storefront-upgrade.css', 'utf8');

assert.match(html, /id="catalogPagination"/, 'Bottom-of-page pagination container is required');
assert.match(html, /id="catalogContainer"[^>]*royal-catalog-grid/, 'Catalog must be a continuous grid');
assert.equal((html.match(/id="filterCategory"/g) || []).length, 1, 'Only one live category select');
assert.equal(html.includes('<nav class="royal-store-shortcuts"'), false, 'Remove the boxed shortcut strip');
assert.equal(html.includes('class="product-carousel-group "'), false, 'Remove product carousel groups');
assert.equal(html.includes('aria-label="Carrossel de produtos"'), false, 'Remove horizontal product carousels');
assert.match(css, /#customerProfileModal:not\(\.hidden\)[^\n]*z-index:30000!important/, 'Customer profile must layer above the header');
assert.match(css, /#catalogContainer\.royal-catalog-grid > \.royal-image-only-card/, 'Mobile cards must fill their own grid cells');
assert.match(css, /min-width:1024px[^\n]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/, 'Six product cards must appear on each desktop row');
assert.match(css, /max-width:639px[^\n]*border-radius:16px!important/, 'Keep original rounded mobile cards');
assert.match(css, /royal-image-only-card[^\n]*border-radius:15px!important/, 'Keep original desktop image-card corners');
assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'Responsive phone layout keeps two images per row');
assert.equal((html.match(/class="product-motion-card royal-image-only-card cursor-pointer"/g) || []).length, 1, 'Reuse the same image-only product card template');


const from = html.indexOf('const CATALOG_PAGE_SIZE = 60;');
const to = html.indexOf('function clearCatalogFilters()', from);
assert.ok(from > 0 && to > from, 'Pagination implementation exists');
const context = {console};
vm.runInNewContext(html.slice(from, to) + '\nthis.api={paginateStoreProducts,renderCatalogPagination};', context);
const {paginateStoreProducts, renderCatalogPagination} = context.api;

for (const total of [0, 1, 25, 59, 60, 61, 120, 121, 180, 601]) {
  const items = Array.from({length: total}, (_, i) => ({id: i + 1}));
  const expectedPages = Math.ceil(total / 60);
  const actualItems = [];
  for (let page = 1; page <= Math.max(1, expectedPages); page++) {
    const result = paginateStoreProducts(items, page);
    assert.equal(result.totalPages, expectedPages, 'Total pages for ' + total);
    assert.equal(result.page, page, 'Current page for ' + total);
    assert.ok(result.items.length <= 60, 'Maximum 60 products per page');
    actualItems.push(...result.items.map(item => item.id));
  }
  assert.deepEqual(actualItems, items.map(item => item.id), 'All product IDs appear once across pages');
  const pagination = renderCatalogPagination(paginateStoreProducts(items, 1));
  assert.equal(Boolean(pagination), total > 60, 'Pagination appears only when > 60 products');
}
const products = Array.from({length:61}, (_,i) => i);
assert.equal(paginateStoreProducts(products,2).items.length,1);
assert.equal(paginateStoreProducts(products,200).page,2, 'Out-of-range page clamps to last');
assert.equal(paginateStoreProducts(products,-5).page,1);
assert.match(renderCatalogPagination(paginateStoreProducts(products,2)), /aria-current="page">2<\/button>/);
assert.match(html, /filterSignature !== lastCatalogFilterSignature/, 'Search and category changes must reset to page 1');

// Header controls: only the cart survives beside the account actions.
const header = html.slice(html.indexOf('<header class="royal-glass-header'), html.indexOf('<!-- Menu hamburger exclusivo do mobile -->'));
assert.ok(header.includes('ROYAL ADVISORY') && header.includes('Excellence in Every Detail'), 'Brand and slogan remain in the header');
assert.equal(header.includes('royal-desktop-nav'), false, 'Remove header Loja/Afiliados navigation');
assert.equal(header.includes('openNavigationModal()'), false, 'Remove compass beside cart');
assert.ok(header.includes('openCartModal()'), 'Do not remove cart itself');
assert.match(css, /royal-brand-heading p \{display:block!important/, 'Show compact slogan on mobile');
assert.match(css, /body #userMenuModal:not\(\.hidden\) \{[^\n]*z-index:30030!important/, 'Account dropdown above header');
assert.match(css, /body #customerProfileModal:not\(\.hidden\) \{z-index:30040!important/, 'Customer profile above all header controls');
const openProfile = html.slice(html.indexOf('async function openCustomerProfile()'), html.indexOf('function closeCustomerProfile()', html.indexOf('async function openCustomerProfile()')));
assert.ok(openProfile.indexOf("modal.classList.remove('hidden')") > -1, 'Profile must open');
assert.ok(openProfile.indexOf("modal.classList.remove('hidden')") < openProfile.indexOf('refreshCustomerAffiliateStatus()'), 'Show profile before async affiliate status');
assert.ok(openProfile.includes('document.body.appendChild(modal)'), 'Profile must be mounted outside stacking-context ancestors');
assert.match(html, /if \(modal.parentElement !== document.body\) document.body.appendChild\(modal\);\s*updateUserMenu\(\)/, 'Dropdown mounts at document root');

console.log('Store Royal: grid, unique products, 60-item pagination, category picker and profile overlay passed');
