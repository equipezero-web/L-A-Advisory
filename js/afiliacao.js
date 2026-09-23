const CHAVE_USUARIOS = "royal_usuarios";
const CHAVE_SESSAO_AFILIADO = "royal_sessao_afiliado";
const CHAVE_CLIQUES = "royal_cliques_afiliados";

const produtosAfiliaveis = [
  {
    id: "ebook-estrategia-royal",
    nome: "E-book Estratégia Royal",
    descricao: "Conteúdo digital com estratégias para crescimento e posicionamento.",
    precoFinal: 197.00,
    valorBruto: 100.00,
    imagem: "https://placehold.co/600x420/0a1f3d/d4af37?text=E-book+Royal"
  },
  {
    id: "curso-royal-advisory",
    nome: "Curso Royal Advisory",
    descricao: "Formação completa com conteúdos estratégicos e aplicáveis.",
    precoFinal: 697.00,
    valorBruto: 350.00,
    imagem: "https://placehold.co/600x420/102f57/d4af37?text=Curso+Royal"
  },
  {
    id: "kit-planejamento-premium",
    nome: "Kit Planejamento Premium",
    descricao: "Ferramentas e materiais para organizar metas e estratégias.",
    precoFinal: 297.00,
    valorBruto: 150.00,
    imagem: "https://placehold.co/600x420/0a1f3d/f4d06f?text=Kit+Premium"
  }
];

let afiliadoAtual = null;

const telaAcessoAfiliado = document.getElementById("telaAcessoAfiliado");
const painelAfiliado = document.getElementById("painelAfiliado");
const formAcessoAfiliado = document.getElementById("formAcessoAfiliado");
const mensagemAcesso = document.getElementById("mensagemAcesso");
const catalogoAfiliado = document.getElementById("catalogoAfiliado");
const toastMensagem = document.getElementById("toastMensagem");

function obterDados(chave, padrao = []) {
  const dados = localStorage.getItem(chave);
  return dados ? JSON.parse(dados) : padrao;
}

function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function mostrarToast(mensagem) {
  toastMensagem.textContent = mensagem;
  toastMensagem.classList.add("mostrar");

  setTimeout(() => {
    toastMensagem.classList.remove("mostrar");
  }, 2800);
}

function obterAfiliadoPorEmail(email) {
  const usuarios = obterDados(CHAVE_USUARIOS);

  return usuarios.find((usuario) => {
    return (
      usuario.email.toLowerCase() === email.toLowerCase() &&
      usuario.perfil === "afiliado"
    );
  });
}

function obterCliquesDoAfiliado(codigoAfiliado) {
  const cliques = obterDados(CHAVE_CLIQUES);
  return cliques.filter((clique) => clique.codigoAfiliado === codigoAfiliado);
}

function renderizarEstatisticas() {
  const cliques = obterCliquesDoAfiliado(afiliadoAtual.codigoAfiliado);

  document.getElementById("totalCliques").textContent = cliques.length;
  document.getElementById("totalPedidos").textContent = "0";
  document.getElementById("comissaoPendente").textContent = "R$ 0,00";
}

function gerarLinkAfiliado(produtoId) {
  const origem = window.location.origin;
  const caminhoBase = window.location.pathname.includes("/afiliacao.html")
    ? window.location.pathname.replace("afiliacao.html", "loja.html")
    : "/loja.html";

  return `${origem}${caminhoBase}?produto=${produtoId}&ref=${afiliadoAtual.codigoAfiliado}`;
}

function renderizarCatalogo() {
  catalogoAfiliado.innerHTML = produtosAfiliaveis
    .map((produto) => {
      const comissao = produto.valorBruto * 0.20;

      return `
        <article class="produto-afiliado-card">
          <img src="${produto.imagem}" alt="${produto.nome}">

          <div class="produto-afiliado-conteudo">
            <span class="produto-tag">
              <i class="fa-solid fa-crown"></i>
              Produto afiliável
            </span>

            <h3>${produto.nome}</h3>

            <p class="produto-descricao">
              ${produto.descricao}
            </p>

            <div class="preco-cliente">
              <span>Preço exibido ao cliente</span>
              <strong>${formatarMoeda(produto.precoFinal)}</strong>
            </div>

            <div class="dados-comissao">
              <div>
                <span>Valor bruto</span>
                <strong>${formatarMoeda(produto.valorBruto)}</strong>
              </div>

              <div>
                <span>Sua comissão — 20%</span>
                <strong class="valor-comissao">${formatarMoeda(comissao)}</strong>
              </div>
            </div>

            <button
              type="button"
              class="botao-principal botao-gerar-link"
              data-produto-id="${produto.id}"
            >
              <i class="fa-solid fa-link"></i>
              Gerar e copiar link
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function carregarPainel() {
  telaAcessoAfiliado.classList.add("oculto");
  painelAfiliado.classList.remove("oculto");

  document.getElementById("nomeAfiliadoPainel").textContent =
    afiliadoAtual.nome.split(" ")[0];

  document.getElementById("codigoAfiliadoPainel").textContent =
    afiliadoAtual.codigoAfiliado;

  renderizarEstatisticas();
  renderizarCatalogo();
}

formAcessoAfiliado.addEventListener("submit", (event) => {
  event.preventDefault();

  const email = document.getElementById("emailAcessoAfiliado").value.trim();
  const afiliado = obterAfiliadoPorEmail(email);

  if (!afiliado) {
    mensagemAcesso.textContent =
      "Este e-mail não possui uma afiliação aprovada. Aguarde a análise ou verifique o e-mail informado.";
    return;
  }

  afiliadoAtual = afiliado;

  localStorage.setItem(
    CHAVE_SESSAO_AFILIADO,
    JSON.stringify({
      email: afiliado.email,
      codigoAfiliado: afiliado.codigoAfiliado
    })
  );

  mensagemAcesso.textContent = "";
  carregarPainel();
});

document.getElementById("sairAfiliado").addEventListener("click", () => {
  localStorage.removeItem(CHAVE_SESSAO_AFILIADO);

  afiliadoAtual = null;

  painelAfiliado.classList.add("oculto");
  telaAcessoAfiliado.classList.remove("oculto");

  document.getElementById("emailAcessoAfiliado").value = "";
});

document.getElementById("copiarCodigoAfiliado").addEventListener("click", () => {
  navigator.clipboard.writeText(afiliadoAtual.codigoAfiliado)
    .then(() => mostrarToast("Código de afiliado copiado com sucesso."))
    .catch(() => mostrarToast("Não foi possível copiar o código."));
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

function restaurarSessaoAfiliado() {
  const sessao = obterDados(CHAVE_SESSAO_AFILIADO, null);

  if (!sessao?.email) return;

  const afiliado = obterAfiliadoPorEmail(sessao.email);

  if (!afiliado) {
    localStorage.removeItem(CHAVE_SESSAO_AFILIADO);
    return;
  }

  afiliadoAtual = afiliado;
  carregarPainel();
}

restaurarSessaoAfiliado();
