/* Royal AI: deterministic, one-product-only calculation audit. No generative estimates. */
(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const money = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
  const percent = n => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(n) || 0) + '%';
  const clean = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const integer = n => Number.isInteger(n) && n >= 0;
  const tierRate = qty => qty >= 70 ? 5 : qty >= 40 ? 4 : qty >= 10 ? 3 : 0;
  const fields = 'id,name,category,price,sale_price,discount,stock,commission,active,updated_at';
  let choices = [];
  let listPromise = null;
  let reportGeneration = 0;

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  }

  function isAdmin() {
    return typeof state !== 'undefined' &&
      state.currentUser?.role === 'admin' && state.currentUser?.status === 'active';
  }

  function status(message, isError) {
    const area = byId('royalAiProductAnalysisOutput');
    if (!area) return;
    area.replaceChildren();
    area.appendChild(element('p',
      isError ? 'rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800'
        : 'rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700', message));
  }

  function fillChoices() {
    const select = byId('royalAiProductSelect');
    const filter = byId('royalAiProductFilter');
    if (!select) return;
    const current = select.value;
    const q = clean(filter?.value);
    const matches = choices.filter(p => clean(p.name).includes(q) || clean(p.id) === q);
    select.replaceChildren(new Option('Escolha exatamente um produto', ''));
    for (const p of matches) {
      const label = p.name + (p.active === false ? ' · Inativo' : '') +
        ' · Estoque: ' + Math.max(0, Number(p.stock) || 0) +
        ' · ID: ' + String(p.id).slice(-8);
      select.appendChild(new Option(label, String(p.id)));
    }
    if (matches.some(p => String(p.id) === current)) select.value = current;
    window.royalAiSyncProductLimits();
  }

  window.royalAiFilterProductChoices = fillChoices;

  window.royalAiSyncProductLimits = function () {
    const select = byId('royalAiProductSelect');
    const qty = byId('royalAiAnalysisQuantity');
    if (!qty) return;
    const p = choices.find(p => String(p.id) === String(select?.value));
    const max = Math.min(100, Math.max(0, Math.trunc(Number(p?.stock) || 0)));
    qty.max = String(Math.max(1, max));
    qty.disabled = !p || max === 0;
    if (!qty.disabled && (Number(qty.value) > max || Number(qty.value) < 1)) qty.value = String(Math.min(1, max));
  };

  window.royalAiLoadProductChoices = async function () {
    if (!byId('royalAiProductSelect') || !isAdmin()) return;
    if (listPromise) return listPromise;
    listPromise = (async () => {
      const select = byId('royalAiProductSelect');
      select.disabled = true;
      try {
        if (!supabaseClient) throw new Error('Conexão com o catálogo indisponível.');
        if (typeof getRoyalAiAccessToken === 'function') await getRoyalAiAccessToken();
        const { data, error } = await supabaseClient.from('products')
          .select('id,name,stock,active').order('name', { ascending: true });
        if (error) throw error;
        choices = (data || []).filter(p => p.id != null && p.name);
        fillChoices();
        if (!choices.length) status('Nenhum produto acessível no catálogo administrativo.', false);
      } catch (e) {
        status('Não foi possível carregar os produtos: ' + String(e?.message || e), true);
      } finally {
        select.disabled = false;
        listPromise = null;
      }
    })();
    return listPromise;
  };

  function calculations(p, quantity) {
    const price = Number(p.price);
    const stock = Number(p.stock);
    const discount = Number(p.discount ?? 0);
    const commission = Number(p.commission ?? 0);
    const saleRaw = p.sale_price === null || p.sale_price === undefined ||
      String(p.sale_price).trim() === '' ? null : Number(p.sale_price);
    if (!Number.isFinite(price) || price < 0 ||
        !integer(stock) || !Number.isFinite(discount) || discount < 0 || discount > 100 ||
        !Number.isFinite(commission) || commission < 0 || commission > 100 ||
        (saleRaw !== null && !Number.isFinite(saleRaw))) {
      throw new Error('Dados de preço, estoque ou comissão inconsistentes no cadastro.');
    }
    // Same priority as create-order: positive sale_price replaces catalog discount.
    const salePriceApplies = saleRaw !== null && saleRaw > 0;
    const retail = salePriceApplies ? round(saleRaw) : round(price * (1 - discount / 100));
    const max = Math.min(stock, 100);
    const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= max;
    const rate = valid ? tierRate(quantity) : 0;
    const unit = round(retail * (1 - rate / 100));
    const total = valid ? round(unit * quantity) : null;
    const retailTotal = valid ? round(retail * quantity) : null;
    const grossTotal = valid ? round(price * quantity) : null;
    // Existing create-order calculates the affiliate commission on gross product price,
    // conditional on an eligible affiliate code, never on the discounted unit price.
    const affiliateCommission = valid ? round(round(price) * quantity * commission / 100) : null;
    const tiers = [{ min: 1, max: 9, rate: 0 },
      { min: 10, max: 39, rate: 3 }, { min: 40, max: 69, rate: 4 },
      { min: 70, max: 100, rate: 5 }]
      .filter(t => max >= t.min)
      .map(t => ({ min: t.min, max: Math.min(max, t.max), rate: t.rate,
        unit: round(retail * (1 - t.rate / 100)),
        exampleTotal: round(round(retail * (1 - t.rate / 100)) * t.min) }));
    return {
      price, stock, discount, commission, retail, saleRaw, salePriceApplies, max,
      valid, quantity, rate, unit, total, retailTotal, grossTotal, affiliateCommission,
      totalSavings: valid ? round(grossTotal - total) : null,
      wholesaleSavings: valid ? round(retailTotal - total) : null,
      afterCommission: valid ? round(total - affiliateCommission) : null,
      effectiveDiscount: price > 0 ? (price - retail) / price * 100 : 0,
      stockRemaining: valid ? stock - quantity : null, tiers
    };
  }

  function section(parent, heading, rows) {
    const group = element('section', 'rounded-xl border border-slate-200 bg-white p-4');
    group.appendChild(element('h6', 'mb-3 text-sm font-bold text-slate-900', heading));
    const dl = element('dl', 'space-y-2');
    for (const [label, value] of rows) {
      const row = element('div', 'flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2 text-sm');
      row.append(element('dt', 'text-slate-600', label),
        element('dd', 'font-semibold text-slate-900 text-right', value));
      dl.appendChild(row);
    }
    group.appendChild(dl);
    parent.appendChild(group);
  }

  function showReport(p, a) {
    const output = byId('royalAiProductAnalysisOutput');
    if (!output) return;
    output.replaceChildren();
    const wrap = element('article', 'mt-4 space-y-4');
    const header = element('div', 'rounded-xl bg-slate-900 p-4 text-white');
    header.append(element('p', 'text-xs uppercase tracking-wider text-amber-300', 'Royal AI · Auditoria de um produto'),
      element('h6', 'mt-1 text-lg font-bold', p.name),
      element('p', 'text-xs text-slate-300', 'Categoria: ' + (p.category || 'Não informada') +
        ' · ' + (p.active === false ? 'Inativo' : 'Ativo') +
        ' · Estoque atual: ' + a.stock + ' unidade(s)'));
    wrap.appendChild(header);
    section(wrap, '1. Preço e descontos do cadastro', [
      ['Preço original por unidade', money(a.price)],
      ['Desconto cadastrado', percent(a.discount) +
        (a.salePriceApplies ? ' (não acumulado com preço promocional)' : '')],
      ['Preço promocional informado', a.saleRaw === null ? 'Não cadastrado' : money(a.saleRaw)],
      ['Regra aplicada', a.salePriceApplies ? 'Preço promocional tem prioridade' : 'Preço original menos desconto cadastrado'],
      ['Preço de varejo efetivo', money(a.retail)],
      ['Diferença frente ao preço original', money(round(a.price - a.retail)) +
        ' (' + percent(a.effectiveDiscount) + ')']
    ]);
    if (!a.valid) {
      const message = a.max === 0
        ? 'Produto sem estoque: não existem quantidades disponíveis para simular compra.'
        : 'A quantidade solicitada está fora do limite disponível (1 a ' + a.max +
          ' unidades por pedido deste produto). Nenhum total de compra foi simulado.';
      wrap.appendChild(element('p', 'rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900', message));
    } else {
      section(wrap, '2. Simulação da quantidade escolhida', [
        ['Quantidade solicitada', a.quantity + ' unidade(s)'],
        ['Modalidade', a.rate ? 'Atacado · desconto de ' + a.rate + '%' : 'Varejo'],
        ['Preço efetivo por unidade', money(a.unit)],
        ['Total sem promoções (preço original)', money(a.grossTotal)],
        ['Total com preço de varejo', money(a.retailTotal)],
        ['Desconto extra por atacado', money(a.wholesaleSavings)],
        ['Total final dos produtos', money(a.total)],
        ['Economia total frente ao preço original', money(a.totalSavings)],
        ['Estoque remanescente se a venda for concluída', String(a.stockRemaining) + ' unidade(s)']
      ]);
    }
    const tierBox = element('section', 'rounded-xl border border-slate-200 bg-white p-4');
    tierBox.appendChild(element('h6', 'mb-3 text-sm font-bold text-slate-900', '3. Faixas possíveis pelo estoque'));
    if (!a.tiers.length) {
      tierBox.appendChild(element('p', 'text-sm text-slate-600', 'Nenhuma faixa disponível: estoque zerado.'));
    } else {
      const scroll = element('div', 'overflow-x-auto');
      const table = element('table', 'w-full min-w-[400px] text-left text-sm');
      const tr = element('tr', 'border-b border-slate-200 text-slate-600');
      for (const label of ['Unidades', 'Desconto', 'Preço/un.', 'Total no mínimo']) {
        tr.appendChild(element('th', 'px-2 py-2 font-semibold', label));
      }
      const head = element('thead', '');
      head.appendChild(tr); table.appendChild(head);
      const tbody = element('tbody', '');
      for (const tier of a.tiers) {
        const row = element('tr', 'border-b border-slate-100 text-slate-900');
        const cols = [tier.min + '–' + tier.max, percent(tier.rate),
          money(tier.unit), money(tier.exampleTotal)];
        for (const value of cols) row.appendChild(element('td', 'px-2 py-2', value));
        tbody.appendChild(row);
      }
      table.appendChild(tbody); scroll.appendChild(table); tierBox.appendChild(scroll);
    }
    tierBox.appendChild(element('p', 'mt-2 text-xs text-slate-500',
      'Cada faixa corresponde a unidades do mesmo produto. Teto de 100 unidades por pedido; preços sujeitos à confirmação no servidor de pagamento.'));
    wrap.appendChild(tierBox);
    section(wrap, '4. Comissão de afiliados (condicional)', [
      ['Taxa cadastrada', percent(a.commission)],
      ['Base por unidade', money(a.price) + ' (preço original)'],
      ['Comissão para a quantidade escolhida',
        a.valid ? money(a.affiliateCommission) : 'Indisponível sem quantidade válida'],
      ['Receita após comissão, antes de outros custos',
        a.valid ? money(a.afterCommission) : 'Indisponível sem quantidade válida']
    ]);
    wrap.appendChild(element('p', 'rounded-xl bg-slate-100 border border-slate-200 p-3 text-sm text-slate-700',
      'A comissão só existe quando houver indicação válida de afiliado. Lucro e margem reais não podem ser calculados: este cadastro não contém custo de aquisição, taxas do pagamento, tributos ou custos operacionais. A receita após comissão NÃO é lucro.'));
    const stamp = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    wrap.appendChild(element('p', 'text-xs text-slate-500',
      'Fonte: registro atual deste único produto no Supabase · Consultado em ' + stamp +
      (p.updated_at ? ' · Cadastro atualizado: ' + new Intl.DateTimeFormat('pt-BR',
        { dateStyle: 'short', timeStyle: 'short' }).format(new Date(p.updated_at)) : '') +
      ' · Nenhum preço, estoque ou comissão foi alterado.'));
    output.appendChild(wrap);
  }

  function plainReport(p, a) {
    const lines = [
      'Análise exclusiva: ' + p.name,
      'Preço original: ' + money(a.price),
      'Desconto cadastrado: ' + percent(a.discount) +
        (a.salePriceApplies ? ' (não acumulado)' : ''),
      'Preço promocional informado: ' + (a.saleRaw === null ? 'não cadastrado' : money(a.saleRaw)),
      'Preço de varejo: ' + money(a.retail),
      'Estoque disponível: ' + a.stock + ' un.',
      'Faixas permitidas: ' + (a.tiers.map(t =>
        t.min + '–' + t.max + ' un. = ' + t.rate + '% (' + money(t.unit) + '/un.)').join('; ') || 'nenhuma')
    ];
    if (a.valid) {
      lines.push('Simulação: ' + a.quantity + ' un. · ' +
        (a.rate ? 'Atacado ' + a.rate + '%' : 'Varejo') + ' · ' + money(a.unit) + '/un.',
        'Total: ' + money(a.total) + ' · Economia extra de atacado: ' + money(a.wholesaleSavings),
        'Comissão se venda com afiliado válido: ' + money(a.affiliateCommission),
        'Receita após comissão, antes dos demais custos: ' + money(a.afterCommission),
        'Estoque remanescente se vender: ' + a.stockRemaining + ' un.');
    } else {
      lines.push('Quantidade indisponível: escolha de 1 a ' + a.max + ' unidade(s).');
    }
    lines.push('Lucro/margem: não calculáveis sem o custo do produto e demais despesas.',
      'Relatório detalhado exibido no painel Royal AI. Nenhum dado foi alterado.');
    return lines.join('\n');
  }

  window.royalAiAnalyzeSelectedProduct = async function (specifiedId) {
    const selectedId = String(specifiedId || byId('royalAiProductSelect')?.value || '').trim();
    const quantity = Number(byId('royalAiAnalysisQuantity')?.value);
    const button = byId('royalAiAnalyzeProductButton');
    if (!selectedId) {
      status('Selecione primeiro exatamente um produto. Não farei cálculos de outros itens.', true);
      return null;
    }
    if (!isAdmin()) {
      status('A análise de preços administrativos exige uma conta de administrador ativa.', true);
      return null;
    }
    const selectedChoice = choices.find(p => String(p.id) === selectedId);
    if (!selectedChoice) {
      status('O produto não está na lista disponível. Atualize a seleção.', true);
      return null;
    }
    const generation = ++reportGeneration;
    if (button) { button.disabled = true; button.textContent = 'Consultando...'; }
    status('Consultando os dados atuais do produto selecionado...', false);
    try {
      if (typeof getRoyalAiAccessToken === 'function') await getRoyalAiAccessToken();
      const { data, error } = await supabaseClient.from('products')
        .select(fields).eq('id', selectedId).maybeSingle();
      if (error) throw error;
      if (!data || String(data.id) !== selectedId) throw new Error('Produto não encontrado no cadastro atual.');
      const a = calculations(data, quantity);
      if (generation !== reportGeneration) return null;
      showReport(data, a);
      return plainReport(data, a);
    } catch (e) {
      if (generation === reportGeneration) status('Falha na análise: ' + String(e?.message || e), true);
      return null;
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Analisar cálculos'; }
    }
  };

  // Intercept only explicit product-calculation requests; other chat features remain unchanged.
  window.royalAiMaybeAnalyzeProductQuestion = async function (prompt) {
    const q = clean(prompt);
    if (!/\b(analis|analise|analisar|calculo|calculos|calcule|calcular|desconto|atacado|varejo|comissao|estoque|preco|margem|lucro)\b/.test(q)) return null;
    if (!choices.length) await window.royalAiLoadProductChoices();
    const matches = choices.filter(p => {
      const name = clean(p.name);
      return name.length >= 3 && q.includes(name);
    });
    let selected = null;
    if (matches.length === 1) selected = matches[0];
    else if (matches.length > 1) return 'Encontrei mais de um nome de produto na pergunta. Selecione um único produto no analisador para evitar misturar cálculos.';
    else if (/\b(produto selecionado|este produto|desse produto|deste produto)\b/.test(q)) {
      selected = choices.find(p => String(p.id) === String(byId('royalAiProductSelect')?.value));
    }
    if (!selected) return 'Para uma análise precisa, informe o nome completo de UM produto cadastrado ou selecione-o no analisador Royal AI. Não utilizarei dados de produtos não identificados.';
    const select = byId('royalAiProductSelect');
    if (select) {
      const filter = byId('royalAiProductFilter');
      if (filter) filter.value = '';
      fillChoices();
      select.value = String(selected.id);
      window.royalAiSyncProductLimits();
    }
    return await window.royalAiAnalyzeSelectedProduct(selected.id) ||
      'Não foi possível analisar este produto no momento. Confira a mensagem exibida no painel.';
  };
})();
