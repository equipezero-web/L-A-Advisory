const API_BASE = "https://api.laadvisory.com.br/api";

const CHAVE_CARRINHO = "royal_carrinho";
const CHAVE_DESCONTO = "royal_desconto";
const CHAVE_REFERENCIA_AFILIADO = "royal_referencia_afiliado";

const formCheckout = document.getElementById("formCheckout");

const checkoutItens = document.getElementById("checkoutItens");

const checkoutSubtotal = document.getElementById("checkoutSubtotal");
const checkoutDesconto = document.getElementById("checkoutDesconto");
const checkoutFrete = document.getElementById("checkoutFrete");
const checkoutTotal = document.getElementById("checkoutTotal");

const btnFinalizarPagamento = document.getElementById(
  "btnFinalizarPagamento"
);

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

function escaparHTML(texto = "") {
  const elemento = document.createElement("div");

  elemento.textContent = texto;

  return elemento.innerHTML;
}

function calcularResumo() {
  const subtotal = carrinho.reduce((total, item) => {
    const preco = converterPrecoParaNumero(item.preco);

    const quantidade = Number(item.quantidade || 1);

    return total + preco * quantidade;
  }, 0);

  const desconto = subtotal * (descontoPercentual / 100);

  const total = subtotal - desconto;

  return {
    subtotal,
    desconto,
    total
  };
}

function renderizarResumoPedido() {
  if (!checkoutItens) return;

  if (carrinho.length === 0) {
    checkoutItens.innerHTML = `
      <div class="checkout-empty">
        <i class="fa-solid fa-cart-shopping"></i>
        <p>Seu carrinho está vazio.</p>
        <a href="carrinho.html">Voltar ao carrinho</a>
      </div>
    `;

    checkoutSubtotal.textContent = "R$ 0,00";
    checkoutDesconto.textContent = "R$ 0,00";
    checkoutFrete.textContent = "Grátis";
    checkoutTotal.textContent = "R$ 0,00";

    btnFinalizarPagamento.disabled = true;

    return;
  }

  checkoutItens.innerHTML = carrinho.map((item) => {
    const preco = converterPrecoParaNumero(item.preco);

    const quantidade = Number(item.quantidade || 1);

    const imagem = item.imagem || item.img
      ? `
        <img
          src="${escaparHTML(item.imagem || item.img)}"
          alt="${escaparHTML(item.nome || item.name)}"
          class="checkout-item-image"
        >
      `
      : `
        <div class="checkout-item-icon">
          <i class="fa-solid fa-crown"></i>
        </div>
      `;

    return `
      <article class="order-item">
        ${imagem}

        <div class="item-info">
          <h4>${escaparHTML(item.nome || item.name || "Produto")}</h4>

          <p>
            ${quantidade}x ${formatarMoeda(preco)}
          </p>
        </div>

        <strong class="checkout-item-total">
          ${formatarMoeda(preco * quantidade)}
        </strong>
      </article>
    `;
  }).join("");

  const resumo = calcularResumo();

  checkoutSubtotal.textContent = formatarMoeda(resumo.subtotal);

  checkoutDesconto.textContent = formatarMoeda(resumo.desconto);

  checkoutFrete.textContent = "Grátis";

  checkoutTotal.textContent = formatarMoeda(resumo.total);

  btnFinalizarPagamento.disabled = false;
}

function obterReferenciaAfiliadoValida() {
  try {
    const referencia = JSON.parse(
      localStorage.getItem(CHAVE_REFERENCIA_AFILIADO) || "null"
    );

    if (!referencia?.codigoAfiliado) {
      return null;
    }

    if (
      referencia.expiraEm &&
      new Date(referencia.expiraEm) < new Date()
    ) {
      localStorage.removeItem(CHAVE_REFERENCIA_AFILIADO);

      return null;
    }

    return referencia;

  } catch {
    return null;
  }
}

function aplicarMascaraTelefone(input) {
  let valor = input.value.replace(/\D/g, "");

  if (valor.length > 11) {
    valor = valor.substring(0, 11);
  }

  valor = valor.replace(/^(\d{2})(\d)/g, "($1) $2");

  valor = valor.replace(/(\d)(\d{4})$/, "$1-$2");

  input.value = valor;
}

function aplicarMascaraCPF(input) {
  let valor = input.value.replace(/\D/g, "");

  if (valor.length > 11) {
    valor = valor.substring(0, 11);
  }

  valor = valor.replace(/(\d{3})(\d)/, "$1.$2");
  valor = valor.replace(/(\d{3})(\d)/, "$1.$2");
  valor = valor.replace(/(\d{3})(\d{1,2})$/, "$1-$2");

  input.value = valor;
}

function aplicarMascaraCEP(input) {
  let valor = input.value.replace(/\D/g, "");

  if (valor.length > 8) {
    valor = valor.substring(0, 8);
  }

  valor = valor.replace(/^(\d{5})(\d)/, "$1-$2");

  input.value = valor;
}

async function buscarCEP() {
  const inputCEP = document.getElementById("cep");

  const cep = inputCEP.value.replace(/\D/g, "");

  if (cep.length !== 8) {
    return;
  }

  try {
    const resposta = await fetch(
      `https://viacep.com.br/ws/${cep}/json/`
    );

    const endereco = await resposta.json();

    if (endereco.erro) {
      alert("CEP não encontrado.");

      return;
    }

    document.getElementById("endereco").value =
      `${endereco.logradouro || ""}${endereco.bairro ? ` - ${endereco.bairro}` : ""}`;

    document.getElementById("cidade").value =
      endereco.localidade || "";

    document.getElementById("estado").value =
      endereco.uf || "";

  } catch (erro) {
    console.error("Erro ao buscar CEP:", erro);
  }
}

function validarFormulario() {
  const nome = document.getElementById("nome").value.trim();

  const email = document.getElementById("email").value.trim();

  const telefone = document
    .getElementById("telefone")
    .value
    .replace(/\D/g, "");

  const cpf = document
    .getElementById("cpf")
    .value
    .replace(/\D/g, "");

  const cep = document
    .getElementById("cep")
    .value
    .replace(/\D/g, "");

  const endereco = document
    .getElementById("endereco")
    .value
    .trim();

  const cidade = document
    .getElementById("cidade")
    .value
    .trim();

  const estado = document
    .getElementById("estado")
    .value
    .trim();

  if (
    !nome ||
    !email ||
    !telefone ||
    !cpf ||
    !cep ||
    !endereco ||
    !cidade ||
    !estado
  ) {
    alert("Preencha todos os campos obrigatórios.");

    return false;
  }

  if (telefone.length < 10 || telefone.length > 11) {
    alert("Informe um telefone válido.");

    return false;
  }

  if (cpf.length !== 11) {
    alert("Informe um CPF válido.");

    return false;
  }

  if (cep.length !== 8) {
    alert("Informe um CEP válido.");

    return false;
  }

  return true;
}

async function criarPagamento(event) {
  event.preventDefault();

  if (carrinho.length === 0) {
    alert("Seu carrinho está vazio.");

    return;
  }

  if (!validarFormulario()) {
    return;
  }

  const nome = document.getElementById("nome").value.trim();

  const email = document
    .getElementById("email")
    .value
    .trim()
    .toLowerCase();

  const telefoneNumeros = document
    .getElementById("telefone")
    .value
    .replace(/\D/g, "");

  const cpf = document
    .getElementById("cpf")
    .value
    .replace(/\D/g, "");

  const formaPagamento = document.querySelector(
    'input[name="pagamento"]:checked'
  ).value;

  const referenciaAfiliado = obterReferenciaAfiliadoValida();

  const textoOriginalBotao = btnFinalizarPagamento.innerHTML;

  try {
    btnFinalizarPagamento.disabled = true;

    btnFinalizarPagamento.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Criando pagamento seguro...
    `;

    const resposta = await fetch(
      `${API_BASE}/pagamentos/criar-pagamento`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          itens: carrinho.map((item) => {
            return {
              id: item.id,

              nome: item.nome || item.name,

              preco: converterPrecoParaNumero(item.preco),

              quantidade: Number(item.quantidade || 1)
            };
          }),

          cliente: {
            nome,
            email,
            cpf,
            ddd: telefoneNumeros.slice(0, 2),
            telefone: telefoneNumeros.slice(2)
          },

          formaPagamento,

          codigoAfiliado:
            referenciaAfiliado?.codigoAfiliado || null,

          produtoIndicado:
            referenciaAfiliado?.produtoId || null
        })
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      throw new Error(
        dados.error || "Não foi possível criar o pagamento."
      );
    }

    if (!dados.initPoint) {
      throw new Error(
        "O Mercado Pago não retornou o link de pagamento."
      );
    }

    window.location.href = dados.initPoint;

  } catch (erro) {
    console.error("Erro ao criar pagamento:", erro);

    alert(
      erro.message ||
      "Erro ao iniciar o pagamento. Tente novamente."
    );

    btnFinalizarPagamento.disabled = false;

    btnFinalizarPagamento.innerHTML = textoOriginalBotao;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderizarResumoPedido();

  const inputTelefone = document.getElementById("telefone");

  const inputCPF = document.getElementById("cpf");

  const inputCEP = document.getElementById("cep");

  inputTelefone.addEventListener("input", () => {
    aplicarMascaraTelefone(inputTelefone);
  });

  inputCPF.addEventListener("input", () => {
    aplicarMascaraCPF(inputCPF);
  });

  inputCEP.addEventListener("input", () => {
    aplicarMascaraCEP(inputCEP);
  });

  inputCEP.addEventListener("blur", buscarCEP);

  formCheckout.addEventListener("submit", criarPagamento);
});
