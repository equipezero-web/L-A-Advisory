import { db } from "./firebase-config.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const listaProdutos = document.getElementById("lista-produtos");

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

function renderizarProdutos(produtos) {
  if (!listaProdutos) return;

  if (!Array.isArray(produtos) || produtos.length === 0) {
    listaProdutos.innerHTML = `
      <p class="mensagem-vazia">
        Nenhum produto disponível no momento.
      </p>
    `;

    return;
  }

  listaProdutos.innerHTML = produtos.map((produto) => {
    const preco = converterPrecoParaNumero(produto.price);

    const imagem = produto.img
      ? `
        <img
          src="${escaparHTML(produto.img)}"
          alt="${escaparHTML(produto.name)}"
          class="produto-imagem"
        >
      `
      : "";

    return `
      <article class="produto">
        ${imagem}

        <h3>${escaparHTML(produto.name || "Produto")}</h3>

        <p>
          ${escaparHTML(
            produto.desc || "Produto exclusivo Royal Advisory."
          )}
        </p>

        <p class="produto-preco">
          <strong>${formatarMoeda(preco)}</strong>
        </p>

        <button
          type="button"
          class="btn-adicionar-carrinho"
          data-id="${escaparHTML(String(produto.id))}"
        >
          Adicionar ao carrinho
        </button>
      </article>
    `;
  }).join("");
}

async function carregarProdutos() {
  try {
    const catalogoRef = doc(db, "site", "catalogo");

    const catalogoSnap = await getDoc(catalogoRef);

    if (!catalogoSnap.exists()) {
      renderizarProdutos([]);

      return;
    }

    const dados = catalogoSnap.data();

    const produtos = Array.isArray(dados.products)
      ? dados.products
      : [];

    const produtosAtivos = produtos.filter((produto) => {
      return produto.ativo !== false;
    });

    renderizarProdutos(produtosAtivos);

    listaProdutos.addEventListener("click", (event) => {
      const botao = event.target.closest(
        ".btn-adicionar-carrinho"
      );

      if (!botao) return;

      const produtoId = botao.dataset.id;

      const produto = produtosAtivos.find((item) => {
        return String(item.id) === String(produtoId);
      });

      if (!produto) {
        alert("Produto não encontrado.");

        return;
      }

      if (typeof window.adicionarAoCarrinho !== "function") {
        alert("Erro: carrinho não foi carregado.");

        return;
      }

      window.adicionarAoCarrinho({
        id: produto.id,
        nome: produto.name,
        preco: converterPrecoParaNumero(produto.price),
        imagem: produto.img || "",
        descricao: produto.desc || "",
        quantidade: 1
      });

      alert("Produto adicionado ao carrinho.");
    });

  } catch (erro) {
    console.error("Erro ao carregar produtos:", erro);

    if (listaProdutos) {
      listaProdutos.innerHTML = `
        <p class="mensagem-erro">
          Não foi possível carregar os produtos.
        </p>
      `;
    }
  }
}

carregarProdutos();
