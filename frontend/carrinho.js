const CHAVE_CARRINHO = "laRoyalAdvisoryCart";

const cartContainer = document.getElementById("cartContainer");
const itemsQuantity = document.getElementById("itemsQuantity");
const cartTotal = document.getElementById("cartTotal");
const checkoutButton = document.getElementById("checkoutButton");
const clearCartButton = document.getElementById("clearCartButton");

function formatarPreco(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(valor);
}

function escaparHtml(texto) {
  const elemento = document.createElement("div");
  elemento.textContent = String(texto ?? "");
  return elemento.innerHTML;
}

function obterCarrinho() {
  try {
    const carrinhoSalvo = localStorage.getItem(CHAVE_CARRINHO);
    const carrinho = carrinhoSalvo ? JSON.parse(carrinhoSalvo) : [];

    return Array.isArray(carrinho) ? carrinho : [];
  } catch {
    return [];
  }
}

function salvarCarrinho(carrinho) {
  localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho));
}

function calcularResumo(carrinho) {
  return carrinho.reduce(
    (resumo, item) => {
      const quantidade = Number(item.quantidade || 0);
      const preco = Number(item.preco || 0);

      resumo.quantidade += quantidade;
      resumo.total += preco * quantidade;

      return resumo;
    },
    {
      quantidade: 0,
      total: 0
    }
  );
}

function atualizarResumo(carrinho) {
  const resumo = calcularResumo(carrinho);

  itemsQuantity.textContent = String(resumo.quantidade);
  cartTotal.textContent = formatarPreco(resumo.total);

  checkoutButton.disabled = carrinho.length === 0;
  clearCartButton.disabled = carrinho.length === 0;

  checkoutButton.style.opacity = carrinho.length === 0 ? "0.55" : "1";
  clearCartButton.style.opacity = carrinho.length === 0 ? "0.55" : "1";
  checkoutButton.style.cursor = carrinho.length === 0 ? "not-allowed" : "pointer";
  clearCartButton.style.cursor = carrinho.length === 0 ? "not-allowed" : "pointer";
}

function renderizarCarrinho() {
  const carrinho = obterCarrinho();

  atualizarResumo(carrinho);

  if (!carrinho.length) {
    cartContainer.innerHTML = `
      <div class="empty-state">
        <h2>Seu carrinho está vazio</h2>
        <p>Escolha um material digital para continuar.</p>
        <a class="button" href="./loja.html">Ir para a loja</a>
      </div>
    `;

    return;
  }

  cartContainer.innerHTML = carrinho.map((item) => {
    const quantidade = Number(item.quantidade || 1);
    const preco = Number(item.preco || 0);
    const subtotal = preco * quantidade;

    return `
      <article class="cart-item">
        <div>
          <h2 class="cart-item__name">
            ${escaparHtml(item.nome)}
          </h2>

          <p class="cart-item__price">
            ${formatarPreco(preco)} por unidade
          </p>

          <div class="cart-item__actions">
            <div class="quantity-control" aria-label="Quantidade">
              <button
                type="button"
                data-action="decrease"
                data-product-id="${escaparHtml(item.id)}"
                aria-label="Diminuir quantidade"
              >
                −
              </button>

              <span class="quantity-value">${quantidade}</span>

              <button
                type="button"
                data-action="increase"
                data-product-id="${escaparHtml(item.id)}"
                aria-label="Aumentar quantidade"
              >
                +
              </button>
            </div>

            <button
              class="remove-button"
              type="button"
              data-action="remove"
              data-product-id="${escaparHtml(item.id)}"
            >
              Remover
            </button>
          </div>
        </div>

        <strong class="cart-item__subtotal">
          ${formatarPreco(subtotal)}
        </strong>
      </article>
    `;
  }).join("");
}

function alterarQuantidade(productId, variacao) {
  const carrinho = obterCarrinho();

  const item = carrinho.find((produto) => produto.id === productId);

  if (!item) {
    return;
  }

  item.quantidade = Number(item.quantidade || 1) + variacao;

  const carrinhoAtualizado = carrinho.filter((produto) => {
    return Number(produto.quantidade) > 0;
  });

  salvarCarrinho(carrinhoAtualizado);
  renderizarCarrinho();
}

function removerProduto(productId) {
  const carrinho = obterCarrinho();

  const carrinhoAtualizado = carrinho.filter((produto) => {
    return produto.id !== productId;
  });

  salvarCarrinho(carrinhoAtualizado);
  renderizarCarrinho();
}

cartContainer.addEventListener("click", (event) => {
  const botao = event.target.closest("[data-action]");

  if (!botao) {
    return;
  }

  const { action, productId } = botao.dataset;

  if (action === "increase") {
    alterarQuantidade(productId, 1);
  }

  if (action === "decrease") {
    alterarQuantidade(productId, -1);
  }

  if (action === "remove") {
    removerProduto(productId);
  }
});

clearCartButton.addEventListener("click", () => {
  const carrinho = obterCarrinho();

  if (!carrinho.length) {
    return;
  }

  const confirmar = window.confirm(
    "Deseja remover todos os itens do carrinho?"
  );

  if (!confirmar) {
    return;
  }

  localStorage.removeItem(CHAVE_CARRINHO);
  renderizarCarrinho();
});

checkoutButton.addEventListener("click", () => {
  const carrinho = obterCarrinho();

  if (!carrinho.length) {
    return;
  }

  window.location.href = "./checkout.html";
});

document.getElementById("currentYear").textContent = new Date().getFullYear();

renderizarCarrinho();
