const CHAVE_CARRINHO = "royal_carrinho";
const CHAVE_DESCONTO = "royal_desconto";

let carrinho = obterCarrinho();
let descontoPercentual = Number(
  localStorage.getItem(CHAVE_DESCONTO) || 0
);

function obterCarrinho() {
  try {
    const dados = JSON.parse(
      localStorage.getItem(CHAVE_CARRINHO) || "[]"
    );

    return Array.isArray(dados) ? dados : [];

  } catch {
    return [];
  }
}

function salvarCarrinho() {
  localStorage.setItem(
    CHAVE_CARRINHO,
    JSON.stringify(carrinho)
  );
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function converterPrecoParaNumero(preco) {
  if (typeof preco === "number") {
    return preco;
  }

  return Number(
    String(preco || "0")
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  ) || 0;
}

function normalizarProduto(produto) {
  return {
    id: produto.id || Date.now(),

    nome: produto.nome || produto.name || "Produto Royal Advisory",

    preco: converterPrecoParaNumero(
      produto.preco ?? produto.price ?? 0
    ),

    imagem: produto.imagem || produto.img || "",

    descricao: produto.descricao || produto.desc || "",

    quantidade: Number(produto.quantidade) || 1
  };
}

function atualizarContadorCarrinho() {
  const contador = document.getElementById("cartCount");

  if (!contador) return;

  const quantidadeTotal = carrinho.reduce((total, item) => {
    return total + Number(item.quantidade || 1);
  }, 0);

  contador.textContent = quantidadeTotal;
}

function adicionarAoCarrinho(produto) {
  const produtoNormalizado = normalizarProduto(produto);

  const itemExistente = carrinho.find((item) => {
    return String(item.id) === String(produtoNormalizado.id);
  });

  if (itemExistente) {
    itemExistente.quantidade += 1;
  } else {
    carrinho.push(produtoNormalizado);
  }

  salvarCarrinho();

  atualizarContadorCarrinho();

  atualizarCarrinho();

  return carrinho;
}

function removerItem(id) {
  carrinho = carrinho.filter((item) => {
    return String(item.id) !== String(id);
  });

  salvarCarrinho();

  atualizarCarrinho();
}

function alterarQuantidade(id, alteracao) {
  const item = carrinho.find((produto) => {
    return String(produto.id) === String(id);
  });

  if (!item) return;

  item.quantidade += Number(alteracao);

  if (item.quantidade < 1) {
    item.quantidade = 1;
  }

  salvarCarrinho();

  atualizarCarrinho();
}

function atualizarQuantidade(id, valor) {
  const item = carrinho.find((produto) => {
    return String(produto.id) === String(id);
  });

  if (!item) return;

  const novaQuantidade = Number(valor);

  item.quantidade = novaQuantidade > 0
    ? novaQuantidade
    : 1;

  salvarCarrinho();

  atualizarCarrinho();
}

function limparCarrinho() {
  carrinho = [];

  descontoPercentual = 0;

  localStorage.removeItem(CHAVE_CARRINHO);

  localStorage.removeItem(CHAVE_DESCONTO);

  atualizarCarrinho();
}

function calcularResumo() {
  const subtotal = carrinho.reduce((total, item) => {
    return total + (
      converterPrecoParaNumero(item.preco) *
      Number(item.quantidade || 1)
    );
  }, 0);

  const desconto = subtotal * (descontoPercentual / 100);

  const total = subtotal - desconto;

  return {
    subtotal,
    desconto,
    total
  };
}

function aplicarCupom() {
  const inputCupom = document.getElementById("codigo-cupom");

  const mensagemCupom = document.getElementById("cupom-mensagem");

  if (!inputCupom || !mensagemCupom) return;

  const codigo = inputCupom.value.trim().toUpperCase();

  const cuponsValidos = {
    ROYAL10: 10,
    PRIMEIRO15: 15,
    VIP20: 20
  };

  if (!cuponsValidos[codigo]) {
    descontoPercentual = 0;

    localStorage.removeItem(CHAVE_DESCONTO);

    mensagemCupom.style.color = "#dc3545";

    mensagemCupom.textContent = "Cupom inválido.";

    atualizarCarrinho();

    return;
  }

  descontoPercentual = cuponsValidos[codigo];

  localStorage.setItem(
    CHAVE_DESCONTO,
    String(descontoPercentual)
  );

  mensagemCupom.style.color = "#28a745";

  mensagemCupom.textContent =
    `Cupom aplicado: ${descontoPercentual}% de desconto.`;

  atualizarCarrinho();
}

function renderizarCarrinhoPagina() {
  const areaItens = document.getElementById("cartItemsPage");

  if (!areaItens) return;

  if (carrinho.length === 0) {
    areaItens.innerHTML = `
      <div class="cart-empty">
        <i class="fas fa-shopping-cart"></i>
        <h3>Seu carrinho está vazio</h3>
        <p>Volte para a loja e adicione produtos.</p>
        <a href="../index.html#loja" class="btn-voltar">
          Continuar comprando
        </a>
      </div>
    `;

    return;
  }

  areaItens.innerHTML = carrinho.map((item) => {
    const subtotalItem =
      converterPrecoParaNumero(item.preco) *
      Number(item.quantidade || 1);

    const imagem = item.imagem
      ? `
        <img
          src="${item.imagem}"
          alt="${item.nome}"
          class="produto-imagem-real"
        >
      `
      : `
        <div class="produto-imagem">
          <i class="fas fa-crown"></i>
        </div>
      `;

    return `
      <div class="cart-item" data-id="${item.id}">
        <div class="col-produto">
          <div class="produto-info">
            ${imagem}

            <div class="produto-detalhes">
              <h3>${item.nome}</h3>
              <p class="produto-desc">
                ${item.descricao || "Produto exclusivo Royal Advisory"}
              </p>
            </div>
          </div>
        </div>

        <div class="col-preco">
          ${formatarMoeda(item.preco)}
        </div>

        <div class="col-quantidade">
          <div class="quantidade-controls">
            <button
              type="button"
              class="btn-quantidade"
              onclick="alterarQuantidade('${item.id}', -1)"
            >
              -
            </button>

            <input
              type="number"
              min="1"
              value="${item.quantidade}"
              onchange="atualizarQuantidade('${item.id}', this.value)"
            >

            <button
              type="button"
              class="btn-quantidade"
              onclick="alterarQuantidade('${item.id}', 1)"
            >
              +
            </button>
          </div>
        </div>

        <div class="col-subtotal">
          ${formatarMoeda(subtotalItem)}
        </div>

        <div class="col-acao">
          <button
            type="button"
            class="btn-remover"
            onclick="removerItem('${item.id}')"
            aria-label="Remover produto"
          >
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function renderizarCarrinhoModal() {
  const areaItens = document.getElementById("cartItems");

  const total = document.getElementById("cartTotal");

  if (!areaItens || !total) return;

  const resumo = calcularResumo();

  if (carrinho.length === 0) {
    areaItens.innerHTML = `
      <p class="text-slate-500 text-center py-6">
        Seu carrinho está vazio.
      </p>
    `;

    total.textContent = "R$ 0,00";

    return;
  }

  areaItens.innerHTML = carrinho.map((item) => `
    <div class="flex justify-between items-center gap-3 p-3 bg-slate-50 rounded-lg">
      <div class="min-w-0">
        <p class="font-bold text-sm text-slate-900 truncate">
          ${item.nome}
        </p>

        <p class="text-xs text-amber-600">
          ${item.quantidade}x ${formatarMoeda(item.preco)}
        </p>
      </div>

      <button
        type="button"
        onclick="removerItem('${item.id}')"
        class="text-red-500"
        aria-label="Remover produto"
      >
        <i data-lucide="trash-2" class="w-4 h-4"></i>
      </button>
    </div>
  `).join("");

  total.textContent = formatarMoeda(resumo.total);

  if (window.lucide) {
    lucide.createIcons();
  }
}

function atualizarResumoDaPagina() {
  const resumo = calcularResumo();

  const subtotal = document.getElementById("subtotal");

  const desconto = document.getElementById("desconto");

  const total = document.getElementById("total");

  if (subtotal) {
    subtotal.textContent = formatarMoeda(resumo.subtotal);
  }

  if (desconto) {
    desconto.textContent = formatarMoeda(resumo.desconto);
  }

  if (total) {
    total.textContent = formatarMoeda(resumo.total);
  }
}

function atualizarCarrinho() {
  atualizarContadorCarrinho();

  renderizarCarrinhoPagina();

  renderizarCarrinhoModal();

  atualizarResumoDaPagina();
}

function finalizarCompra() {
  if (carrinho.length === 0) {
    alert("Seu carrinho está vazio.");

    return;
  }

  const estaNaPastaFrontend = window.location.pathname.includes(
    "/frontend/"
  );

  window.location.href = estaNaPastaFrontend
    ? "checkout.html"
    : "frontend/checkout.html";
}

function toggleCart() {
  const modal = document.getElementById("cartModal");

  if (!modal) {
    finalizarCompra();

    return;
  }

  modal.classList.toggle("hidden");

  renderizarCarrinhoModal();
}

window.obterCarrinho = obterCarrinho;
window.adicionarAoCarrinho = adicionarAoCarrinho;
window.removerItem = removerItem;
window.alterarQuantidade = alterarQuantidade;
window.atualizarQuantidade = atualizarQuantidade;
window.limparCarrinho = limparCarrinho;
window.aplicarCupom = aplicarCupom;
window.atualizarCarrinho = atualizarCarrinho;
window.finalizarCompra = finalizarCompra;
window.toggleCart = toggleCart;
window.calcularResumoCarrinho = calcularResumo;

document.addEventListener("DOMContentLoaded", () => {
  atualizarCarrinho();
});
