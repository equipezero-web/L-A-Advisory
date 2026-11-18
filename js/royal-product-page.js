/* Store Royal — product landing page (same SPA, shareable ?produto=ID).
 * Requires storefront globals defined in index.html. No independent checkout path.
 */
(function () {
  'use strict';
  let activeId = null;
  const safe = value => escapeHtml(String(value == null ? '' : value));
  const attr = value => escapeAttribute(String(value == null ? '' : value));
  const money = value => formatCurrency(value);
  const productById = id => state.products.find(p => String(p.id) === String(id) && p.active !== false);
  const isOpen = () => Boolean(document.getElementById('productDetailsModal'));

  function currentUrlFor(id) {
    const u = new URL(window.location.href);
    u.searchParams.set('produto', String(id));
    u.searchParams.delete('prod');
    return u.pathname + u.search + u.hash;
  }

  function updateLocation(id) {
    if (new URLSearchParams(location.search).get('produto') === String(id)) return;
    history.pushState({ royalProductPage: String(id) }, '', currentUrlFor(id));
  }

  function leaveLocation(id) {
    const u = new URL(location.href);
    if (u.searchParams.get('produto') !== String(id)) return;
    if (history.state && history.state.royalProductPage === String(id)) {
      history.back();
    } else {
      u.searchParams.delete('produto');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
  }

  function removePage(updateHistory) {
    const current = activeId;
    const dialog = document.getElementById('productDetailsModal');
    if (dialog) dialog.remove();
    activeId = null;
    if (updateHistory && current != null) leaveLocation(current);
    if (typeof unlockAccountModalScroll === 'function') unlockAccountModalScroll();
  }

  function starString(rating) {
    const n = Math.max(0, Math.min(5, Number(rating) || 0));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function renderOptions(product) {
    // No fake variation choices: the current products table does not store
    // variant inventory/SKUs. Only show genuine product attributes.
    const values = [];
    if (product.category) values.push(['Categoria', product.category]);
    if (product.brand) values.push(['Marca', product.brand]);
    if (product.color) values.push(['Cor informada', product.color]);
    if (product.size) values.push(['Tamanho informado', product.size]);
    return values.map(pair => '<div class="royal-p-attribute"><span>' + safe(pair[0]) + '</span><strong>' + safe(pair[1]) + '</strong></div>').join('');
  }

  async function loadReviews(id) {
    const box = document.getElementById('royalProductReviews');
    if (!box || activeId !== String(id)) return;
    try {
      const { data, error } = await supabaseClient
        .from('reviews').select('rating,comment,created_at')
        .eq('product_id', id).eq('status', 'approved')
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      if (!box.isConnected || activeId !== String(id)) return;
      const reviews = Array.isArray(data) ? data : [];
      const avg = reviews.length
        ? (reviews.reduce((total, row) => total + Number(row.rating || 0), 0) / reviews.length).toFixed(1).replace('.', ',')
        : '';
      const ratingSummary = document.getElementById('royalProductRatingSummary');
      if (ratingSummary) ratingSummary.textContent = reviews.length
        ? avg + ' / 5 · ' + reviews.length + ' avaliação' + (reviews.length === 1 ? '' : 'ões')
        : 'Ainda sem avaliações';
      box.innerHTML = reviews.length ? reviews.map(row => {
        const date = row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : '';
        return '<article class="royal-p-review"><div class="royal-p-review-head"><strong class="royal-p-stars" aria-label="' + attr(row.rating) + ' de 5 estrelas">' + starString(row.rating) + '</strong><span>' + safe(date) + '</span></div>' +
          '<p>' + safe(row.comment || 'Avaliação sem comentário.') + '</p></article>';
      }).join('') : '<p class="royal-p-muted">Este produto ainda não recebeu comentários aprovados. Seja o primeiro a avaliar!</p>';
    } catch (error) {
      if (box.isConnected) box.textContent = 'Não foi possível consultar as avaliações agora.';
      console.warn('Store Royal reviews:', error);
    }
  }

  async function submitReview(event, id) {
    event.preventDefault();
    const form = event.currentTarget;
    const output = form.querySelector('[data-review-feedback]');
    const userId = supabaseAuthUser && supabaseAuthUser.id;
    if (!userId) {
      output.textContent = 'Entre na sua conta para enviar uma avaliação.';
      if (typeof openAuthModal === 'function') openAuthModal('customer-login');
      return;
    }
    const rating = Number(form.elements.rating.value);
    const comment = String(form.elements.comment.value || '').trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 5 || comment.length > 1000) {
      output.textContent = 'Selecione de 1 a 5 estrelas e escreva de 5 a 1000 caracteres.';
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const { data: existing, error: readError } = await supabaseClient.from('reviews')
        .select('id').eq('product_id', id).eq('user_id', userId).limit(1);
      if (readError) throw readError;
      if (existing && existing.length) {
        output.textContent = 'Você já enviou uma avaliação deste produto.';
        return;
      }
      const { error } = await supabaseClient.from('reviews')
        .insert({ user_id: userId, product_id: id, rating, comment, status: 'pending' });
      if (error) throw error;
      output.textContent = 'Obrigado! Seu comentário foi enviado e será exibido após aprovação.';
      form.reset();
    } catch (error) {
      console.error('Store Royal review submission:', error);
      output.textContent = 'Não foi possível enviar a avaliação. Tente novamente.';
    } finally {
      submit.disabled = false;
    }
  }

  function addQuantity(product, quantity) {
    const stock = Math.max(0, Number(product.stock) || 0);
    if (!stock) return alert('Produto indisponível no momento.');
    const qty = Math.max(1, Math.min(stock, Math.floor(Number(quantity) || 1)));
    const existing = state.cart.find(item => String(item.id) === String(product.id));
    const desired = qty + Number(existing?.quantity || 0);
    if (desired > stock) return alert('Quantidade total acima do estoque disponível (' + stock + ').');
    if (existing) existing.quantity = desired;
    else state.cart.push({
      id: product.id, name: product.name,
      price: calculateFinalPrice(product),
      grossPrice: Number(product.price) || 0,
      quantity: qty, image: product.image
    });
    if (typeof saveStateToStorage === 'function') saveStateToStorage();
    updateCartIcon();
    return true;
  }

  function createPage(product, updateHistory) {
    if (!product) return false;
    if (isOpen()) removePage(false);
    activeId = String(product.id);
    const stock = Math.max(0, Number(product.stock) || 0);
    const sale = calculateFinalPrice(product);
    const oldPrice = Number(product.price) || 0;
    const isAffiliate = document.body.classList.contains('affiliate-mode');
    const dialog = document.createElement('section');
    dialog.id = 'productDetailsModal';
    dialog.className = 'royal-product-page';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Página do produto ' + product.name);
    dialog.innerHTML =
      '<div class="royal-product-scroll" data-lenis-prevent data-lenis-prevent-wheel data-lenis-prevent-touch tabindex="-1">' +
        '<header class="royal-product-header"><button type="button" data-action="close" aria-label="Voltar à loja">← Voltar à loja</button><span>STORE ROYAL · L&A</span><button type="button" data-action="share" aria-label="Compartilhar produto">Compartilhar</button></header>' +
        '<div class="royal-product-container"><div class="royal-product-main">' +
          '<div class="royal-product-photo"><img src="' + attr(product.image) + '" alt="' + attr(product.name) + '"></div>' +
          '<div class="royal-product-info"><span class="royal-p-kicker">' + safe(product.category || 'Store Royal') + '</span>' +
            '<h1>' + safe(product.name) + '</h1>' +
            '<p class="royal-p-rating" id="royalProductRatingSummary">Carregando avaliações…</p>' +
            '<div class="royal-p-price">' + money(sale) + (oldPrice > sale ? '<s>' + money(oldPrice) + '</s>' : '') + '</div>' +
            '<p class="royal-p-stock">' + (stock ? stock + ' unidade' + (stock === 1 ? '' : 's') + ' disponível' + (stock === 1 ? '' : 'is') : 'Esgotado') + '</p>' +
            '<div class="royal-p-attributes">' + renderOptions(product) + '</div>' +
            (isAffiliate ? '<button class="royal-p-primary" data-action="share">Compartilhar produto</button>' :
            '<label class="royal-p-qty-label" for="royalProductQty">Quantidade</label>' +
            '<div class="royal-p-qty"><button type="button" data-action="decrease" aria-label="Diminuir quantidade">−</button>' +
            '<input id="royalProductQty" type="number" inputmode="numeric" min="1" max="' + stock + '" value="1" ' + (stock ? '' : 'disabled') + ' aria-label="Quantidade">' +
            '<button type="button" data-action="increase" aria-label="Aumentar quantidade">+</button></div>' +
            '<div class="royal-p-actions"><button type="button" data-action="cart" class="royal-p-primary" ' + (stock ? '' : 'disabled') + '>Adicionar ao carrinho</button>' +
            '<button type="button" data-action="buy" class="royal-p-secondary" ' + (stock ? '' : 'disabled') + '>Comprar agora</button></div>') +
            '<p class="royal-p-muted">Compra protegida e pagamento pelo checkout da Store Royal.</p>' +
          '</div></div>' +
          '<section class="royal-product-details"><h2>Descrição e informações</h2><p>' + safe(product.description || 'Mais informações sobre este produto em breve.') + '</p></section>' +
          '<section class="royal-product-details"><h2>Avaliações e comentários</h2><div id="royalProductReviews"><p class="royal-p-muted">Carregando avaliações…</p></div>' +
            '<form id="royalProductReviewForm" class="royal-p-review-form"><h3>Deixe sua avaliação</h3><label>Nota<select name="rating" required><option value="">Escolha a nota</option>' +
            [5,4,3,2,1].map(i => '<option value="' + i + '">' + i + ' estrela' + (i > 1 ? 's' : '') + '</option>').join('') +
            '</select></label><label>Comentário<textarea name="comment" required minlength="5" maxlength="1000" rows="4" placeholder="Conte sua experiência com este produto"></textarea></label>' +
            '<button type="submit" class="royal-p-primary">Enviar avaliação</button><p class="royal-p-muted" data-review-feedback aria-live="polite">Avaliações passam por moderação antes da publicação. É necessário estar conectado.</p></form>' +
          '</section></div></div>';
    document.body.appendChild(dialog);
    document.body.classList.add('account-modal-open');
    document.documentElement.classList.add('account-modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Lenis should not intercept this native scroll area.
    if (window.laLenis?.start) window.laLenis.start();
    const scroller = dialog.querySelector('.royal-product-scroll');
    if (scroller) scroller.scrollTop = 0;
    dialog.addEventListener('click', async event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'close') return removePage(true);
      if (action === 'share') {
        const affiliate = isAffiliate && state.affiliates.find(a => a.userId === state.currentUser?.id && a.code);
        const url = new URL(affiliate && typeof buildAffiliateProductLink === 'function'
          ? buildAffiliateProductLink(product.id, affiliate.code)
          : location.href, location.href);
        url.searchParams.set('produto', String(product.id));
        url.searchParams.delete('prod');
        if (navigator.share) {
          try { await navigator.share({ title: product.name, url: url.href }); } catch (_) {}
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(url.href);
          button.textContent = 'Link copiado!';
        }
        return;
      }
      const input = dialog.querySelector('#royalProductQty');
      if (!input) return;
      if (action === 'increase' || action === 'decrease') {
        input.value = String(Math.max(1, Math.min(stock, Number(input.value || 1) + (action === 'increase' ? 1 : -1))));
        return;
      }
      if (action === 'cart' || action === 'buy') {
        const qty = Number(input.value);
        if (!Number.isInteger(qty) || qty < 1 || qty > stock) {
          alert('Informe uma quantidade válida dentro do estoque.');
          input.focus();
          return;
        }
        if (!addQuantity(product, qty)) return;
        if (action === 'buy') {
          removePage(false);
          if (typeof startCheckout === 'function') startCheckout();
        } else {
          button.textContent = 'Adicionado ✓';
        }
      }
    });
    const form = dialog.querySelector('#royalProductReviewForm');
    if (form) form.addEventListener('submit', event => submitReview(event, String(product.id)));
    if (updateHistory) updateLocation(product.id);
    loadReviews(String(product.id));
    return true;
  }

  window.openRoyalProductPage = function (id, options) {
    const product = productById(id);
    if (!product) return false;
    return createPage(product, options?.updateHistory !== false);
  };

  window.closeRoyalProductPage = function () { removePage(true); };

  // Deep-link: wait for the existing Supabase public catalog load before rendering.
  window.openRoyalProductFromUrl = function () {
    const id = new URLSearchParams(location.search).get('produto');
    if (!id) return;
    if (activeId === id && isOpen()) return;
    window.openRoyalProductPage(id, {updateHistory: false});
  };

  window.addEventListener('popstate', () => {
    const id = new URLSearchParams(location.search).get('produto');
    if (!id) {
      if (isOpen()) removePage(false);
    } else {
      window.openRoyalProductFromUrl();
    }
  });
})();