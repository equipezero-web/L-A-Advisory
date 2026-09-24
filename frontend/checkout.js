const CHAVE_CARRINHO = "laRoyalAdvisoryCart";
const CHAVE_AFILIADO = "laRoyalAffiliateCode";

const API_URL = "https://la-royal-advisory-api.onrender.com";

const checkoutForm = document.getElementById("checkoutForm");
const buyerName = document.getElementById("buyerName");
const buyerEmail = document.getElementById("buyerEmail");
const affiliateCode = document.getElementById("affiliateCode");

const checkoutItems = document.getElementById("checkoutItems");
const checkoutQuantity = document.getElementById("checkoutQuantity");
const checkoutTotal = document.getElementById("checkoutTotal");

const checkoutMessage = document.getElementById("checkoutMessage");
const payButton = document.getElementById("payButton");
const payButtonText = document.getElementById("payButtonText");

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

function obterAffiliateCodeDaUrl() {
  const parametros = new URLSearchParams(window.location.search);

  return parametros.get("ref") || parametros.get("affiliate");
}

function normalizarCodigoAfiliado(codigo) {
  return String(codigo || "")
    .trim()
    .toUpperCase();
}

function mostrarMensagem(texto, tipo = "erro") {
  checkoutMessage.textContent = texto;
  checkoutMessage.className = `checkout-message checkout-message--${tipo}`;
}

function limparMensagem() {
  checkoutMessage.textContent = "";
  checkoutMessage.className = "checkout-message";
}

function definirCarregamento(ativo) {
  payButton.disabled = ativo;

  if (ativo) {
    payButtonText.textContent = "Criando pagamento անվտանգ...";
    return;
  }

  payButtonText.textContent = "Continuar para pagamento";
}

function calcularResumo(carrinho) {
  return carrinho.reduce(
    (resumo, item) => {
      const preco = Number(item.preco || 0);
      const quantidade = Number(item.quantidade || 0);

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

function renderizarResumo() {
  const carrinho = obterCarrinho();
  const resumo = calcularResumo(carrinho);

  checkoutQuantity.textContent = String(resumo.quantidade);
  checkoutTotal.textContent = formatarPreco(resumo.total);

  if (!carrinho.length) {
    checkoutItems.innerHTML = `
      <div class="empty-checkout">
        <p>Seu carrinho está vazio.</p>
        <a href="./loja.html">Ir para a loja</a>
      </div>
    `;

    payButton.disabled = true;
    payButtonText.textContent = "Carrinho vazio";

    return;
  }

  checkoutItems.innerHTML = carrinho.map((item) => {
    const preco = Number(item.preco || 0);
    const quantidade = Number(item.quantidade || 0);
    const subtotal = preco * quantidade;

    return `
      <article class="checkout-item">
        <div class="checkout-item__content">
          <h3>${escaparHtml(item.nome)}</h3>
          <p>
            ${quantidade} × ${formatarPreco(preco)}
          </p>
        </div>

        <strong>
          ${formatarPreco(subtotal)}
        </strong>
      </article>
    `;
  }).join("");
}

function carregarCodigoAfiliado() {
  const codigoDaUrl = obterAffiliateCodeDaUrl();

  if (codigoDaUrl) {
    const codigoNormalizado = normalizarCodigoAfiliado(codigoDaUrl);

    affiliateCode.value = codigoNormalizado;

    localStorage.setItem(
      CHAVE_AFILIADO,
      codigoNormalizado
    );

    return;
  }

  const codigoSalvo = localStorage.getItem(CHAVE_AFILIADO);

  if (codigoSalvo) {
    affiliateCode.value = normalizarCodigoAfiliado(codigoSalvo);
  }
}

function validarDadosDoFormulario() {
  const nome = buyerName.value.trim();
  const email = buyerEmail.value.trim();

  if (nome.length < 3) {
    mostrarMensagem(
      "Informe seu nome completo ou o nome da empresa."
    );

    buyerName.focus();
    return false;
  }

  if (!buyerEmail.validity.valid) {
    mostrarMensagem(
      "Informe um endereço de e-mail válido."
    );

    buyerEmail.focus();
    return false;
  }

  return true;
}

async function criarPagamento(event) {
  event.preventDefault();

  limparMensagem();

  const carrinho = obterCarrinho();

  if (!carrinho.length) {
    mostrarMensagem(
      "Seu carrinho está vazio. Adicione um produto antes de continuar."
    );

    return;
  }

  if (!validarDadosDoFormulario()) {
    return;
  }

  if (carrinho.length !== 1 || Number(carrinho[0].quantidade) !== 1) {
    mostrarMensagem(
      "Neste momento, o pagamento aceita um produto por vez. Volte ao carrinho e deixe apenas um item com quantidade 1."
    );

    return;
  }

  if (
    !API_URL ||
    API_URL.includes("SUA-API")
  ) {
    mostrarMensagem(
      "A URL da API ainda não foi configurada no arquivo checkout.js."
    );

    return;
  }

  const produto = carrinho[0];

  const codigoAfiliado = normalizarCodigoAfiliado(
    affiliateCode.value
  );

  if (codigoAfiliado) {
    localStorage.setItem(
      CHAVE_AFILIADO,
      codigoAfiliado
    );
  } else {
    localStorage.removeItem(CHAVE_AFILIADO);
  }

  definirCarregamento(true);

  try {
    const resposta = await fetch(
      `${API_URL}/api/pagamentos/criar-preferencia`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productId: produto.id,
          affiliateCode: codigoAfiliado || null,
          buyer: {
            nome: buyerName.value.trim(),
            email: buyerEmail.value.trim().toLowerCase()
          }
        })
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      throw new Error(
        dados.erro ||
        "Não foi possível criar o pagamento."
      );
    }

    if (!dados.checkoutUrl) {
      throw new Error(
        "A API não retornou uma URL de pagamento."
      );
    }

    sessionStorage.setItem(
      "laRoyalPendingOrder",
      JSON.stringify({
        orderId: dados.orderId,
        criadoEm: new Date().toISOString()
      })
    );

    window.location.href = dados.checkoutUrl;
  } catch (erro) {
    console.error("Erro ao iniciar pagamento:", erro);

    mostrarMensagem(
      erro.message ||
      "Não foi possível iniciar o pagamento. Tente novamente."
    );

    definirCarregamento(false);
  }
}

affiliateCode.addEventListener("input", () => {
  affiliateCode.value = normalizarCodigoAfiliado(
    affiliateCode.value
  );
});

checkoutForm.addEventListener("submit", criarPagamento);

document.getElementById("currentYear").textContent = new Date().getFullYear();

carregarCodigoAfiliado();
renderizarResumo();
