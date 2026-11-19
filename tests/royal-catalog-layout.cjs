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
console.log('Store Royal: grid, unique products, 60-item pagination, category picker and profile overlay passed');
