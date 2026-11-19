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
      const reviewCount = document.getElementById('royalProductReviewCount');
      if (reviewCount) reviewCount.textContent = reviews.length ? reviews.length + ' avaliação' + (reviews.length === 1 ? '' : 'ões') + ' aprovada' + (reviews.length === 1 ? '' : 's') : 'Nenhuma avaliação aprovada até o momento.';
      // Reviews are user-controlled: never pass their text through innerHTML.
      box.replaceChildren();
      if (!reviews.length) {
        const empty = document.createElement('p');
        empty.className = 'royal-p-muted';
        empty.textContent = 'Este produto ainda não recebeu comentários aprovados. Seja o primeiro a avaliar!';
        box.appendChild(empty);
      }
      for (const review of reviews) {
        const article = document.createElement('article');
        article.className = 'royal-p-review';
        const header = document.createElement('div');
        header.className = 'royal-p-review-head';
        const stars = document.createElement('strong');
        stars.className = 'royal-p-stars';
        stars.textContent = starString(review.rating);
        stars.setAttribute('aria-label', String(review.rating) + ' de 5 estrelas');
        const date = document.createElement('span');
        date.textContent = review.created_at ? new Date(review.created_at).toLocaleDateString('pt-BR') : '';
        header.append(stars,date);
        const text = document.createElement('p');
        text.textContent = review.comment || 'Avaliação sem comentário.';
        article.append(header,text);
        box.appendChild(article);
      }
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



  function showProductToast(dialog, message) {
    if (!dialog?.isConnected) return;
    let toast = dialog.querySelector('.royal-p-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'royal-p-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      dialog.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.remove('is-leaving');
    if (dialog.royalToastTimer) clearTimeout(dialog.royalToastTimer);
    dialog.royalToastTimer = setTimeout(() => {
      if (toast.isConnected) toast.classList.add('is-leaving');
      dialog.royalToastTimer = setTimeout(() => { if (toast.isConnected) toast.hidden = true; }, 250);
    }, 2700);
  }

  // White, product-first detail layout. Values come exclusively from the Store Royal catalog.
  function enhanceProductPage(dialog, product, gallery, sale, oldPrice, stock) {
    const header = dialog.querySelector('.royal-product-header');
    header.innerHTML =
      '<div class="royal-p-header-left"><button type="button" data-action="close" aria-label="Voltar à loja"><i data-lucide="arrow-left" aria-hidden="true"></i><span>Voltar à loja</span></button></div>' +
      '<strong class="royal-p-header-brand">STORE ROYAL</strong>' +
      '<div class="royal-p-header-tools">' +
        '<button type="button" data-action="favorite" aria-pressed="false" aria-label="Favoritar produto" title="Favoritar"><i data-lucide="heart" aria-hidden="true"></i><span data-favorite-label>Favoritar</span></button>' +
        '<button type="button" data-action="share" aria-label="Compartilhar produto" title="Compartilhar"><i data-lucide="share-2" aria-hidden="true"></i><span>Compartilhar</span></button>' +
      '</div>';

    const photo = dialog.querySelector('.royal-product-photo');
    photo.setAttribute('tabindex','0');
    photo.setAttribute('role','group');
    photo.setAttribute('aria-label','Galeria de imagens de ' + product.name);
    if (gallery.length > 1) {
      photo.insertAdjacentHTML('beforeend',
        '<button type="button" class="royal-p-gallery-arrow royal-p-gallery-prev" data-gallery-step="-1" aria-label="Imagem anterior"><i data-lucide="chevron-left" aria-hidden="true"></i></button>' +
        '<button type="button" class="royal-p-gallery-arrow royal-p-gallery-next" data-gallery-step="1" aria-label="Próxima imagem"><i data-lucide="chevron-right" aria-hidden="true"></i></button>' +
        '<span class="royal-p-image-count" aria-live="polite">1 / ' + gallery.length + '</span>'
      );
    }

    const kicker = dialog.querySelector('.royal-p-kicker');
    kicker.textContent = 'Store Royal  /  ' + (product.category || 'Produtos');

    const rating = dialog.getElementById ? dialog.getElementById('royalProductRatingSummary') : dialog.querySelector('#royalProductRatingSummary');
    if (rating) {
      rating.outerHTML =
        '<button type="button" class="royal-p-rating-trigger" data-action="reviews" aria-label="Ir para avaliações do produto">' +
          '<i data-lucide="star" aria-hidden="true"></i><span id="royalProductRatingSummary">Carregando avaliações…</span>' +
          '<i data-lucide="chevron-right" aria-hidden="true"></i>' +
        '</button>';
    }

    const price = dialog.querySelector('.royal-p-price');
    if (price) {
      const percentage = oldPrice > sale && oldPrice > 0 ? Math.round((1 - sale / oldPrice) * 100) : 0;
      price.innerHTML =
        '<strong class="royal-p-current-price">' + money(sale) + '</strong>' +
        (oldPrice > sale ? '<span class="royal-p-original-price">De <s>' + money(oldPrice) + '</s></span>' : '') +
        (percentage > 0 ? '<span class="royal-p-discount-badge">-' + percentage + '%</span>' : '');
    }

    price.insertAdjacentHTML('afterend',
      '<div class="royal-p-service-list">' +
        '<div class="royal-p-service"><i data-lucide="credit-card" aria-hidden="true"></i><div><strong>Cartão de crédito</strong><p>Consulte parcelas, taxas e opções de pagamento no checkout.</p></div></div>' +
        '<div class="royal-p-service"><i data-lucide="truck" aria-hidden="true"></i><div><strong>Envio e frete</strong><p>Frete incluso no valor, conforme a política atual da Store Royal. Prazo informado no checkout.</p></div></div>' +
      '</div>'
    );

    const attributes = dialog.querySelector('.royal-p-attributes');
    if (attributes) attributes.remove();

    const container = dialog.querySelector('.royal-product-container');
    const phone = typeof APP_CONFIG !== 'undefined' ? String(APP_CONFIG.supportPhone || '').replace(/\D/g, '') : '';
    const productLink = new URL(location.href);
    productLink.searchParams.set('produto', String(product.id));
    productLink.searchParams.delete('prod');
    const reportUrl = phone ? 'https://wa.me/' + phone + '?text=' +
      encodeURIComponent('Olá! Gostaria de relatar um problema com o anúncio do produto ' + product.name + ': ' + productLink.href) : '';

    const sections = container.querySelectorAll('.royal-product-details');
    if (sections[0]) {
      const specs = [
        ['Categoria', product.category || 'Não informada'],
        ['Estoque', stock > 0 ? stock + (stock === 1 ? ' unidade disponível' : ' unidades disponíveis') : 'Esgotado']
      ];
      for (const [name, value] of [['Marca', product.brand], ['Cor', product.color], ['Tamanho', product.size], ['País de origem', product.originCountry], ['Conteúdo da embalagem', product.packageContents]]) {
        if (value != null && String(value).trim()) specs.push([name, String(value)]);
      }
      sections[0].insertAdjacentHTML('beforebegin',
        '<section class="royal-product-details royal-p-specs"><h2>Detalhes do produto</h2><dl>' +
          specs.map(pair => '<div><dt>' + safe(pair[0]) + '</dt><dd>' + safe(pair[1]) + '</dd></div>').join('') +
        '</dl></section>'
      );
      sections[0].querySelector('h2').textContent = 'Descrição do produto';
    }
    if (sections[1]) {
      sections[1].id = 'royalProductReviewsSection';
      sections[1].querySelector('h2').textContent = 'Avaliações do produto';
      sections[1].querySelector('h2').insertAdjacentHTML('afterend',
        '<p class="royal-p-review-count" id="royalProductReviewCount">Carregando avaliações aprovadas…</p>'
      );
      if (reportUrl) {
        sections[1].insertAdjacentHTML('beforeend',
          '<a class="royal-p-report" target="_blank" rel="noopener noreferrer" href="' + attr(reportUrl) +
          '"><i data-lucide="flag" aria-hidden="true"></i>Denunciar problema com este anúncio</a>'
        );
      }
    }
    const note = dialog.querySelector('.royal-product-info > .royal-p-muted');
    if (note) note.textContent = 'Finalização segura pelo checkout da Store Royal.';
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function setFavoriteButton(button, saved) {
    if (!button) return;
    button.classList.toggle('is-favorited', Boolean(saved));
    button.setAttribute('aria-pressed', String(Boolean(saved)));
    button.setAttribute('aria-label', saved ? 'Remover dos favoritos' : 'Favoritar produto');
    const label = button.querySelector('[data-favorite-label]');
    if (label) label.textContent = saved ? 'Favoritado' : 'Favoritar';
  }

  async function readFavorite(productId) {
    const button = document.querySelector('#productDetailsModal button[data-action="favorite"]');
    const userId = typeof supabaseAuthUser !== 'undefined' && supabaseAuthUser?.id;
    if (!button || !userId) return;
    try {
      const { data, error } = await supabaseClient.from('favorites').select('id')
        .eq('user_id', userId).eq('product_id', productId).limit(1);
      if (error) throw error;
      if (activeId === String(productId)) setFavoriteButton(button, Boolean(data?.length));
    } catch (error) {
      console.warn('Não foi possível consultar favoritos:', error);
    }
  }

  async function toggleFavorite(product, button) {
    const userId = typeof supabaseAuthUser !== 'undefined' && supabaseAuthUser?.id;
    if (!userId) {
      alert('Entre na sua conta para salvar este produto nos favoritos.');
      if (typeof openAuthModal === 'function') openAuthModal('customer-login');
      return;
    }
    if (button.disabled) return;
    button.disabled = true;
    try {
      const { data, error: selectError } = await supabaseClient.from('favorites').select('id')
        .eq('user_id', userId).eq('product_id', product.id).limit(1);
      if (selectError) throw selectError;
      if (data?.length) {
        const { error } = await supabaseClient.from('favorites').delete()
          .eq('id', data[0].id).eq('user_id', userId);
        if (error) throw error;
        setFavoriteButton(button, false);
        showProductToast(button.closest('#productDetailsModal'), 'Removido dos favoritos.');
      } else {
        const { error } = await supabaseClient.from('favorites')
          .insert({user_id: userId, product_id: product.id});
        if (error) throw error;
        setFavoriteButton(button, true);
        showProductToast(button.closest('#productDetailsModal'), 'Produto salvo nos favoritos!');
      }
    } catch (error) {
      console.error('Não foi possível atualizar favoritos:', error);
      alert('Não foi possível atualizar seus favoritos. Tente novamente.');
    } finally {
      button.disabled = false;
    }
  }

  function createPage(product, updateHistory) {
    if (!product) return false;
    if (isOpen()) removePage(false);
    activeId = String(product.id);
    const stock = Math.max(0, Number(product.stock) || 0);
    const sale = calculateFinalPrice(product);
    const oldPrice = Number(product.price) || 0;
    const gallery = Array.isArray(product.images) && product.images.length ? product.images : [product.image].filter(Boolean);
    const isAffiliate = document.body.classList.contains('affiliate-mode');
    const dialog = document.createElement('section');
    dialog.id = 'productDetailsModal';
    dialog.className = 'royal-product-page';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Página do produto ' + product.name);
    dialog.innerHTML =
      '<div class="royal-product-scroll" data-lenis-prevent data-lenis-prevent-wheel data-lenis-prevent-touch tabindex="-1">' +
        '<header class="royal-product-header"><button type="button" data-action="close" aria-label="Voltar à loja">← Voltar à loja</button><span>STORE ROYAL</span><button type="button" data-action="share" aria-label="Compartilhar produto">Compartilhar</button></header>' +
        '<div class="royal-product-container"><div class="royal-product-main">' +
          '<div class="royal-p-gallery"><div class="royal-product-photo"><img id="royalSelectedProductImage" src="' + attr(gallery[0] || product.image) + '" alt="' + attr(product.name) + '"></div>' +
          '<div class="royal-p-thumbnails">' + gallery.map((src,index) =>
            '<button type="button" data-image-index="' + index + '" aria-label="Ver imagem ' + (index+1) + '" class="' + (index===0 ? 'royal-p-thumbnail-active' : '') + '"><img src="' + attr(src) + '" alt="Foto ' + (index+1) + ' de ' + attr(product.name) + '"></button>'
          ).join('') + '</div></div>' +
          '<div class="royal-product-info"><span class="royal-p-kicker">' + safe(product.category || 'Store Royal') + '</span>' +
            '<h1>' + safe(product.name) + '</h1>' +
            '<p class="royal-p-rating" id="royalProductRatingSummary">Carregando avaliações…</p>' +
            '<div class="royal-p-price">' + money(sale) + (oldPrice > sale ? '<s>' + money(oldPrice) + '</s>' : '') + '</div>' +
            '<p class="royal-p-stock">' + (stock ? stock + (stock === 1 ? ' unidade disponível' : ' unidades disponíveis') : 'Esgotado') + '</p>' +
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
    enhanceProductPage(dialog, product, gallery, sale, oldPrice, stock);
    document.body.appendChild(dialog);
    document.body.classList.add('account-modal-open');
    document.documentElement.classList.add('account-modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Lenis should not intercept this native scroll area.
    if (window.laLenis?.start) window.laLenis.start();
    const scroller = dialog.querySelector('.royal-product-scroll');
    if (scroller) scroller.scrollTop = 0;
    // Horizontal swipes change photos; vertical scrolling remains completely native.
    const photoSurface = dialog.querySelector('.royal-product-photo');
    if (photoSurface && gallery.length > 1) {
      let touchPoint = null;
      photoSurface.addEventListener('touchstart', event => {
        const point = event.changedTouches?.[0];
        touchPoint = point ? {x:point.clientX,y:point.clientY} : null;
      }, {passive:true});
      photoSurface.addEventListener('touchend', event => {
        const point = event.changedTouches?.[0];
        if (!touchPoint || !point) return;
        const dx = point.clientX - touchPoint.x;
        const dy = point.clientY - touchPoint.y;
        touchPoint = null;
        if (Math.abs(dx) >= 46 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          photoSurface.querySelector('[data-gallery-step="' + (dx < 0 ? 1 : -1) + '"]')?.click();
        }
      }, {passive:true});
      photoSurface.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        photoSurface.querySelector('[data-gallery-step="' + (event.key === 'ArrowRight' ? 1 : -1) + '"]')?.click();
      });
    }
    dialog.addEventListener('click', async event => {
      const imageButton = event.target.closest('button[data-image-index]');
      if (imageButton) {
        const imageIndex = Number(imageButton.dataset.imageIndex);
        if (!Number.isInteger(imageIndex) || !gallery[imageIndex]) return;
        const image = dialog.querySelector('#royalSelectedProductImage');
        if (image && image.src !== gallery[imageIndex]) {
          image.classList.remove('royal-p-photo-enter');
          void image.offsetWidth;
          image.src = gallery[imageIndex];
          image.classList.add('royal-p-photo-enter');
        }
        dialog.querySelectorAll('button[data-image-index]').forEach(button => button.classList.toggle('royal-p-thumbnail-active', button === imageButton));
        const count = dialog.querySelector('.royal-p-image-count');
        if (count) count.textContent = (imageIndex + 1) + ' / ' + gallery.length;
        return;
      }
      const galleryStep = event.target.closest('button[data-gallery-step]');
      if (galleryStep) {
        const current = Array.from(dialog.querySelectorAll('button[data-image-index]')).findIndex(el => el.classList.contains('royal-p-thumbnail-active'));
        const nextIndex = (Math.max(current, 0) + Number(galleryStep.dataset.galleryStep) + gallery.length) % gallery.length;
        const nextButton = dialog.querySelector('button[data-image-index="' + nextIndex + '"]');
        if (nextButton) nextButton.click();
        return;
      }
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'close') return removePage(true);
      if (action === 'favorite') return toggleFavorite(product, button);
      if (action === 'reviews') { dialog.querySelector('#royalProductReviewsSection')?.scrollIntoView({behavior:'smooth',block:'start'}); return; }
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
          try {
            await navigator.clipboard.writeText(url.href);
            showProductToast(dialog, 'Link do produto copiado!');
          } catch (_) {
            window.prompt('Copie o link do produto:', url.href);
          }
        } else {
          window.prompt('Copie o link do produto:', url.href);
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
          showProductToast(dialog, 'Produto adicionado ao carrinho!');
        }
      }
    });
    const form = dialog.querySelector('#royalProductReviewForm');
    if (form) form.addEventListener('submit', event => submitReview(event, String(product.id)));
    if (updateHistory) updateLocation(product.id);
    loadReviews(String(product.id));
    readFavorite(String(product.id));
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


  window.openRoyalReviewModeration = async function () {
    if (state.currentUser?.role !== 'admin' || !supabaseAuthUser) {
      alert('Acesso exclusivo ao administrador.');
      return;
    }
    let modal = document.getElementById('royalReviewAdminModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'royalReviewAdminModal';
      modal.className = 'royal-review-admin-modal';
      modal.innerHTML = '<div class="royal-review-admin-scroll" data-lenis-prevent><header><h2>Moderação de avaliações</h2><button type="button" data-admin-close>Fechar</button></header><div id="royalReviewAdminList">Carregando…</div></div>';
      modal.addEventListener('click', async event => {
        if (event.target === modal || event.target.closest('[data-admin-close]')) {
          modal.remove();
          return;
        }
        const button = event.target.closest('button[data-review-id]');
        if (!button) return;
        const nextStatus = button.dataset.nextStatus;
        const reviewId = button.dataset.reviewId;
        if (!['approved', 'rejected'].includes(nextStatus) || !reviewId) return;
        button.disabled = true;
        const { error } = await supabaseClient.from('reviews').update({ status: nextStatus }).eq('id', reviewId);
        if (error) {
          alert('Não foi possível atualizar a avaliação: ' + error.message);
          button.disabled = false;
          return;
        }
        const pageId = activeId;
        await window.openRoyalReviewModeration();
        if (pageId) loadReviews(pageId);
      });
      document.body.appendChild(modal);
    }
    const list = modal.querySelector('#royalReviewAdminList');
    if (!list) return;
    list.textContent = 'Carregando avaliações…';
    const { data, error } = await supabaseClient.from('reviews')
      .select('id,product_id,comment,rating,status,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) { list.textContent = 'Falha ao carregar avaliações: ' + error.message; return; }
    if (!modal.isConnected) return;
    list.replaceChildren();
    if (!data?.length) { list.textContent = 'Nenhuma avaliação registrada.'; return; }
    for (const review of data) {
      const product = productById(review.product_id);
      const card = document.createElement('article');
      card.className = 'royal-review-admin-item';
      const title = document.createElement('p');
      title.textContent = (product?.name || 'Produto') + ' · ' + String(review.status) + ' · ' + starString(review.rating);
      const comment = document.createElement('p');
      comment.textContent = review.comment || 'Sem comentário';
      const actions = document.createElement('div');
      for (const [status,label] of [['approved','Aprovar'],['rejected','Rejeitar']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.reviewId = String(review.id);
        button.dataset.nextStatus = status;
        actions.appendChild(button);
      }
      card.append(title, comment, actions);
      list.appendChild(card);
    }
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