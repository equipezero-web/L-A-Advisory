const CHAVE_CARRINHO = "laRoyalAdvisoryCart";

const produtosPadrao = [
  {
    id: "ebook-investimentos",
    nome: "E-book: Introdução aos Investimentos",
    descricao: "Um guia direto para compreender os primeiros passos do investimento com mais segurança.",
    preco: 29.90,
    categoria: "ebooks",
    icone: "📘"
  },
  {
    id: "planilha-fluxo-caixa",
    nome: "Planilha de Fluxo de Caixa Empresarial",
    descricao: "Organize entradas, saídas e a visão mensal do caixa da sua empresa.",
    preco: 39.90,
    categoria: "planilhas",
    icone: "📊"
  },
  {
    id: "guia-planejamento-financeiro",
    nome: "Guia de Planejamento Financeiro",
    descricao: "Material prático para definir metas, prioridades e decisões financeiras.",
    preco: 24.90,
    categoria: "guias",
    icone: "📈"
  },
  {
    id: "template-plano-estrategico",
    nome: "Template de Plano Estratégico",
    descricao: "Estrutura editável para transformar objetivos empresariais em ações organizadas.",
    preco: 49.90,
    categoria: "templates",
    icone: "🎯"
  },
  {
    id: "kit-gestao-empresarial",
    nome: "Kit Gestão Empresarial",
    descricao: "Conjunto de materiais digitais para apoiar controle financeiro e decisões de gestão.",
    preco: 79.90,
    categoria: "planilhas",
    icone: "💼"
  }
];

let produtosVisiveis = [...produtosPadrao];

const productsContainer = document.getElementById("productsContainer");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const resultMessage = document.getElementById("resultMessage");
const cartCounter = document.getElementById("cartCounter");
const toast = document.getElementById("toast");

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

function atualizarContadorCarrinho() {
  const quantidadeTotal = obterCarrinho().reduce((total, item) => {
    return total + Number(item.quantidade || 0);
  }, 0);

  cartCounter.textContent = String(quantidadeTotal);
}

function mostrarMensagem(texto) {
  toast.textContent = texto;
  toast.classList.add("is-visible");

  window.clearTimeout(mostrarMensagem.timeoutId);

  mostrarMensagem.timeoutId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2800);
}

function traduzirCategoria(categoria) {
  const categorias = {
    ebooks: "E-book",
    planilhas: "Planilha",
    guias: "Guia",
    templates: "Template"
  };

  return categorias[categoria] || "Produto digital";
}

function renderizarProdutos() {
  if (!produtosVisiveis.length) {
    productsContainer.innerHTML = `
      <div class="empty-state">
        <h2>Nenhum produto encontrado</h2>
        <p>Tente pesquisar outro termo ou selecione uma categoria diferente.</p>
      </div>
    `;

    resultMessage.textContent = "Nenhum produto encontrado.";
    return;
  }

  productsContainer.innerHTML = produtosVisiveis.map((produto) => {
    const nome = escaparHtml(produto.nome);
    const descricao = escaparHtml(produto.descricao);
    const categoria = escaparHtml(traduzirCategoria(produto.categoria));
    const icone = escaparHtml(produto.icone || "📦");

    return `
      <article class="product-card">
        <div class="product-image" aria-hidden="true">
          ${icone}
        </div>

        <div class="product-content">
          <span class="product-category">${categoria}</span>

          <h2 class="product-title">${nome}</h2>

          <p class="product-description">${descricao}</p>

          <div class="product-footer">
            <strong class="product-price">
              ${formatarPreco(Number(produto.preco))}
            </strong>

            <button
              class="button"
              type="button"
              data-add-product="${escaparHtml(produto.id)}"
            >
              Adicionar
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  const quantidade = produtosVisiveis.length;
  resultMessage.textContent = `${quantidade} ${
    quantidade === 1 ? "produto encontrado" : "produtos encontrados"
  }.`;
}

function adicionarAoCarrinho(productId) {
  const produto = produtosPadrao.find((item) => item.id === productId);

  if (!produto) {
    mostrarMensagem("Produto não encontrado.");
    return;
  }

  const carrinho = obterCarrinho();

  const itemExistente = carrinho.find((item) => item.id === productId);

  if (itemExistente) {
    itemExistente.quantidade += 1;
  } else {
    carrinho.push({
      id: produto.id,
      nome: produto.nome,
      preco: Number(produto.preco),
      quantidade: 1
    });
  }

  salvarCarrinho(carrinho);
  atualizarContadorCarrinho();

  mostrarMensagem(`${produto.nome} foi adicionado ao carrinho.`);
}

function filtrarProdutos() {
  const termo = searchInput.value.trim().toLocaleLowerCase("pt-BR");
  const categoriaSelecionada = categoryFilter.value;

  produtosVisiveis = produtosPadrao.filter((produto) => {
    const correspondeAoTermo = [
      produto.nome,
      produto.descricao,
      produto.categoria
    ].join(" ").toLocaleLowerCase("pt-BR").includes(termo);

    const correspondeACategoria =
      categoriaSelecionada === "all" ||
      produto.categoria === categoriaSelecionada;

    return correspondeAoTermo && correspondeACategoria;
  });

  renderizarProdutos();
}

document.addEventListener("click", (event) => {
  const botao = event.target.closest("[data-add-product]");

  if (!botao) {
    return;
  }

  adicionarAoCarrinho(botao.dataset.addProduct);
});

searchInput.addEventListener("input", filtrarProdutos);
categoryFilter.addEventListener("change", filtrarProdutos);

document.getElementById("currentYear").textContent = new Date().getFullYear();

atualizarContadorCarrinho();
renderizarProdutos();
