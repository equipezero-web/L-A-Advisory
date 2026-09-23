import { db } from "./firebase-config.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

let afiliadoAtual = null;
let produtosAfiliaveis = [];

const telaAcessoAfiliado = document.getElementById("telaAcessoAfiliado");
const painelAfiliado = document.getElementById("painelAfiliado");

const formAcessoAfiliado = document.getElementById("formAcessoAfiliado");
const mensagemAcesso = document.getElementById("mensagemAcesso");

const catalogoAfiliado = document.getElementById("catalogoAfiliado");
const toastMensagem = document.getElementById("toastMensagem");

const nomeAfiliadoPainel = document.getElementById("nomeAfiliadoPainel");
const codigoAfiliadoPainel = document.getElementById("codigoAfiliadoPainel");

const totalCliques = document.getElementById("totalCliques");
const totalPedidos = document.getElementById("totalPedidos");
const comissaoPendente = document.getElementById("comissaoPendente");

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function escaparHTML(texto = "") {
  const elemento = document.createElement("div");
  elemento.textContent = texto;
  return elemento.innerHTML;
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

function mostrarToast(mensagem) {
  if (!toastMensagem) return;

  toastMensagem.textContent = mensagem;

  toastMensagem.classList.add("mostrar");

  setTimeout(() => {
    toastMensagem.classList.remove("mostrar");
  }, 2800);
}

function gerarLinkAfiliado(produtoId) {
  const origem = window.location.origin;

  return `${origem}/loja.html?produto=${encodeURIComponent(
    produtoId
  )}&ref=${encodeURIComponent(afiliadoAtual.codigoAfiliado)}`;
}

async function buscarAfiliadoPorEmail(email) {
  const emailNormalizado = email.trim().toLowerCase();

  const referenciaAfiliado = doc(db, "afiliados", emailNormalizado);

  const resultado = await getDoc(referenciaAfiliado);

  if (!resultado.exists()) {
    return null;
  }

  const afiliado = {
    id: resultado.id,
    ...resultado.data()
  };

  if (!afiliado.ativo || afiliado.perfil !== "afiliado") {
    return null;
  }

  return afiliado;
}

async function carregarProdutosAfiliaveis() {
  try {
    /*
      Produtos da sua loja atual estão salvos aqui:

      site
      └── catalogo
          └── products: [ ... ]
    */
    const catalogoRef = doc(db, "site", "catalogo");

    const catalogoSnap = await getDoc(catalogoRef);

    if (!catalogoSnap.exists()) {
      produtosAfiliaveis = [];
      return;
    }

    const dadosCatalogo = catalogoSnap.data();

    const produtos = Array.isArray(dadosCatalogo.products)
      ? dadosCatalogo.products
      : [];

    produtosAfiliaveis = produtos.filter((produto) => {
      return produto.affiliateEnabled === true;
    });

  } catch (erro) {
    console.error("Erro ao carregar produtos afiliáveis:", erro);

    produtosAfiliaveis = [];

    mostrarToast("Não foi possível carregar os produtos.");
  }
}

async function carregarEstatisticas() {
  try {
    const codigo = afiliadoAtual.codigoAfiliado;

    const consultaCliques = query(
      collection(db, "cliquesAfiliados"),
      where("codigoAfiliado", "==", codigo)
    );

    const consultaPedidos = query(
      collection(db, "pedidos"),
      where("codigoAfiliado", "==", codigo)
    );

    const [resultadoCliques, resultadoPedidos] = await Promise.all([
      getDocs(consultaCliques),
      getDocs(consultaPedidos)
    ]);

    const pedidos = resultadoPedidos.docs.map((documento) => {
      return {
        id: documento.id,
        ...documento.data()
      };
    });

    const comissaoTotalPendente = pedidos
      .filter((pedido) => {
        return (
          pedido.statusPagamento === "approved" ||
          pedido.statusPagamento === "pago"
        ) && pedido.statusComissao === "pendente";
      })
      .reduce((total, pedido) => {
        return total + Number(pedido.valorComissao || 0);
      }, 0);

    totalCliques.textContent = resultadoCliques.size;
    totalPedidos.textContent = pedidos.length;
    comissaoPendente.textContent = formatarMoeda(
      comissaoTotalPendente
    );

  } catch (erro) {
    console.warn(
      "Ainda não existem cliques ou pedidos de afiliado no Firebase:",
      erro.message
    );

    totalCliques.textContent = "0";
    totalPedidos.textContent = "0";
    comissaoPendente.textContent = "R$ 0,00";
  }
}

function renderizarCatalogo() {
  if (!catalogoAfiliado) return;

  if (produtosAfiliaveis.length === 0) {
    catalogoAfiliado.innerHTML = `
      <div class="estado-vazio">
        <i class="fa-solid fa-box-open"></i>
        <h2>Nenhum produto afiliável</h2>
        <p>
          O administrador ainda não liberou produtos para divulgação.
        </p>
      </div>
    `;

    return;
  }

  catalogoAfiliado.innerHTML = produtosAfiliaveis.map((produto) => {
    const valorBruto = Number(produto.grossValue || 0);

    const comissao = Number(
      produto.commissionValue || valorBruto * 0.20
    );

    const precoCliente = converterPrecoParaNumero(produto.price);

    const imagem = produto.img ||
      "https://placehold.co/600x420/071a33/d4af37?text=Royal+Advisory";

    return `
      <article class="produto-afiliado-card">
        <img
          src="${escaparHTML(imagem)}"
          alt="${escaparHTML(produto.name || "Produto Royal Advisory")}"
        >

        <div class="produto-afiliado-conteudo">
          <span class="produto-tag">
            <i class="fa-solid fa-crown"></i>
            Produto afiliável
          </span>

          <h3>
            ${escaparHTML(produto.name || "Produto sem nome")}
          </h3>

          <p class="produto-descricao">
            ${escaparHTML(produto.desc || "Produto exclusivo Royal Advisory.")}
          </p>

          <div class="preco-cliente">
            <span>Preço exibido ao cliente</span>
            <strong>${formatarMoeda(precoCliente)}</strong>
          </div>

          <div class="dados-comissao">
            <div>
              <span>Valor bruto</span>
              <strong>${formatarMoeda(valorBruto)}</strong>
            </div>

            <div>
              <span>Sua comissão — 20%</span>
              <strong class="valor-comissao">
                ${formatarMoeda(comissao)}
              </strong>
            </div>
          </div>

          <button
            type="button"
            class="botao-principal botao-gerar-link"
            data-produto-id="${escaparHTML(String(produto.id))}"
          >
            <i class="fa-solid fa-link"></i>
            Gerar e copiar link
          </button>
        </div>
      </article>
    `;
  }).join("");
}

async function carregarPainelAfiliado() {
  telaAcessoAfiliado.classList.add("oculto");

  painelAfiliado.classList.remove("oculto");

  nomeAfiliadoPainel.textContent =
    afiliadoAtual.nome.split(" ")[0];

  codigoAfiliadoPainel.textContent =
    afiliadoAtual.codigoAfiliado;

  await carregarProdutosAfiliaveis();

  renderizarCatalogo();

  await carregarEstatisticas();
}

formAcessoAfiliado.addEventListener("submit", async (event) => {
  event.preventDefault();

  const botaoAcesso = formAcessoAfiliado.querySelector(
    'button[type="submit"]'
  );

  const email = document
    .getElementById("emailAcessoAfiliado")
    .value
    .trim()
    .toLowerCase();

  mensagemAcesso.textContent = "";

  try {
    botaoAcesso.disabled = true;

    botaoAcesso.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Verificando...
    `;

    const afiliado = await buscarAfiliadoPorEmail(email);

    if (!afiliado) {
      mensagemAcesso.textContent =
        "Este e-mail não possui uma afiliação aprovada.";

      return;
    }

    afiliadoAtual = afiliado;

    sessionStorage.setItem(
      "royal_afiliado_atual",
      JSON.stringify({
        email: afiliado.email,
        codigoAfiliado: afiliado.codigoAfiliado
      })
    );

    await carregarPainelAfiliado();

  } catch (erro) {
    console.error("Erro ao acessar área de afiliação:", erro);

    mensagemAcesso.textContent =
      "Não foi possível verificar sua afiliação. Tente novamente.";

  } finally {
    botaoAcesso.disabled = false;

    botaoAcesso.innerHTML = `
      <i class="fa-solid fa-right-to-bracket"></i>
      Acessar área
    `;
  }
});

document.getElementById("sairAfiliado").addEventListener("click", () => {
  sessionStorage.removeItem("royal_afiliado_atual");

  afiliadoAtual = null;

  painelAfiliado.classList.add("oculto");

  telaAcessoAfiliado.classList.remove("oculto");

  document.getElementById("emailAcessoAfiliado").value = "";

  mensagemAcesso.textContent = "";
});

document
  .getElementById("copiarCodigoAfiliado")
  .addEventListener("click", () => {
    navigator.clipboard.writeText(
      afiliadoAtual.codigoAfiliado
    )
      .then(() => {
        mostrarToast("Código de afiliado copiado.");
      })
      .catch(() => {
        mostrarToast("Não foi possível copiar o código.");
      });
  });

catalogoAfiliado.addEventListener("click", (event) => {
  const botao = event.target.closest(".botao-gerar-link");

  if (!botao) return;

  const produtoId = botao.dataset.produtoId;

  const link = gerarLinkAfiliado(produtoId);

  navigator.clipboard.writeText(link)
    .then(() => {
      mostrarToast("Link de divulgação copiado com sucesso.");
    })
    .catch(() => {
      mostrarToast("Não foi possível copiar o link.");
    });
});

async function restaurarSessaoAfiliado() {
  const dadosSessao = sessionStorage.getItem(
    "royal_afiliado_atual"
  );

  if (!dadosSessao) return;

  try {
    const sessao = JSON.parse(dadosSessao);

    const afiliado = await buscarAfiliadoPorEmail(sessao.email);

    if (!afiliado) {
      sessionStorage.removeItem("royal_afiliado_atual");
      return;
    }

    afiliadoAtual = afiliado;

    await carregarPainelAfiliado();

  } catch (erro) {
    console.error("Erro ao restaurar sessão de afiliado:", erro);

    sessionStorage.removeItem("royal_afiliado_atual");
  }
}

restaurarSessaoAfiliado();
