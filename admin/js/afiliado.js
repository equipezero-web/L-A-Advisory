const CHAVE_SOLICITACOES = "royal_solicitacoes_afiliados";
const CHAVE_USUARIOS = "royal_usuarios";

let statusSelecionado = "pendente";
let acaoPendente = null;

const listaAfiliados = document.getElementById("listaAfiliados");
const modalConfirmacao = document.getElementById("modalConfirmacao");
const tituloConfirmacao = document.getElementById("tituloConfirmacao");
const textoConfirmacao = document.getElementById("textoConfirmacao");
const confirmarAcao = document.getElementById("confirmarAcao");
const cancelarAcao = document.getElementById("cancelarAcao");
const fecharModalConfirmacao = document.getElementById("fecharModalConfirmacao");

function obterDados(chave) {
  const dados = localStorage.getItem(chave);
  return dados ? JSON.parse(dados) : [];
}

function salvarDados(chave, dados) {
  localStorage.setItem(chave, JSON.stringify(dados));
}

function formatarData(dataISO) {
  if (!dataISO) return "—";

  return new Date(dataISO).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatarNascimento(data) {
  if (!data) return "Não informado";

  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function escaparHTML(texto = "") {
  const elemento = document.createElement("div");
  elemento.textContent = texto;
  return elemento.innerHTML;
}

function gerarCodigoAfiliado(nome) {
  const primeiroNome = nome
    .trim()
    .split(" ")[0]
    .toUpperCase()
    .replace(/[^A-ZÀ-Ú]/g, "");

  const aleatorio = Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase();

  return `ROYAL-${primeiroNome}-${aleatorio}`;
}

function atualizarEstatisticas() {
  const solicitacoes = obterDados(CHAVE_SOLICITACOES);

  const pendentes = solicitacoes.filter((item) => item.status === "pendente").length;
  const aprovados = solicitacoes.filter((item) => item.status === "aprovado").length;
  const recusados = solicitacoes.filter((item) => item.status === "recusado").length;

  document.getElementById("totalPendentes").textContent = pendentes;
  document.getElementById("totalAprovados").textContent = aprovados;
  document.getElementById("totalRecusados").textContent = recusados;

  document.getElementById("contadorPendentes").textContent = pendentes;
  document.getElementById("contadorAprovados").textContent = aprovados;
  document.getElementById("contadorRecusados").textContent = recusados;
}

function renderizarLista() {
  const solicitacoes = obterDados(CHAVE_SOLICITACOES);

  const listaFiltrada = solicitacoes.filter((item) => {
    return item.status === statusSelecionado;
  });

  if (listaFiltrada.length === 0) {
    listaAfiliados.innerHTML = `
      <div class="estado-vazio">
        <i class="fa-solid fa-folder-open"></i>
        <h2>Nenhum registro encontrado</h2>
        <p>Não existem solicitações com este status no momento.</p>
      </div>
    `;
    return;
  }

  listaAfiliados.innerHTML = listaFiltrada
    .map((candidato) => {
      const codigo = candidato.codigoAfiliado
        ? `<p><strong>Código:</strong> <code>${escaparHTML(candidato.codigoAfiliado)}</code></p>`
        : "";

      const acoesPendentes = `
        <div class="acoes-afiliado">
          <button
            class="botao-aceitar"
            data-acao="aprovar"
            data-id="${candidato.id}"
          >
            <i class="fa-solid fa-check"></i>
            Aceitar afiliação
          </button>

          <button
            class="botao-recusar"
            data-acao="recusar"
            data-id="${candidato.id}"
          >
            <i class="fa-solid fa-xmark"></i>
            Excluir / Recusar afiliação
          </button>
        </div>
      `;

      const acoesAprovado = `
        <div class="acoes-afiliado">
          <button
            class="botao-copiar"
            data-codigo="${candidato.codigoAfiliado || ""}"
          >
            <i class="fa-solid fa-copy"></i>
            Copiar código
          </button>

          <button
            class="botao-recusar"
            data-acao="recusar"
            data-id="${candidato.id}"
          >
            <i class="fa-solid fa-ban"></i>
            Revogar afiliação
          </button>
        </div>
      `;

      const acoesRecusado = `
        <div class="acoes-afiliado">
          <button
            class="botao-aceitar"
            data-acao="aprovar"
            data-id="${candidato.id}"
          >
            <i class="fa-solid fa-rotate-left"></i>
            Aprovar agora
          </button>
        </div>
      `;

      let acoes = acoesPendentes;

      if (candidato.status === "aprovado") {
        acoes = acoesAprovado;
      }

      if (candidato.status === "recusado") {
        acoes = acoesRecusado;
      }

      return `
        <article class="card-candidato">
          <div class="candidato-topo">
            <div>
              <span class="tag-status tag-${candidato.status}">
                ${candidato.status}
              </span>

              <h3>${escaparHTML(candidato.nome)}</h3>
            </div>

            <span class="data-solicitacao">
              Solicitado em ${formatarData(candidato.criadoEm)}
            </span>
          </div>

          <div class="candidato-dados">
            <p>
              <i class="fa-solid fa-envelope"></i>
              <strong>E-mail:</strong> ${escaparHTML(candidato.email)}
            </p>

            <p>
              <i class="fa-solid fa-phone"></i>
              <strong>Telefone:</strong> ${escaparHTML(candidato.telefone)}
            </p>

            <p>
              <i class="fa-solid fa-cake-candles"></i>
              <strong>Data de nascimento:</strong>
              ${formatarNascimento(candidato.nascimento)}
            </p>

            ${codigo}
          </div>

          <div class="candidato-motivacao">
            <h4>
              <i class="fa-solid fa-comment-dots"></i>
              Por que deseja ser afiliado?
            </h4>

            <p>${escaparHTML(candidato.motivacao)}</p>
          </div>

          ${acoes}
        </article>
      `;
    })
    .join("");
}

function abrirConfirmacao(acao, id) {
  const solicitacoes = obterDados(CHAVE_SOLICITACOES);
  const candidato = solicitacoes.find((item) => item.id === id);

  if (!candidato) return;

  acaoPendente = { acao, id };

  if (acao === "aprovar") {
    tituloConfirmacao.textContent = "Aprovar afiliação?";
    textoConfirmacao.textContent =
      `Ao confirmar, ${candidato.nome} será aprovado como afiliado e receberá um código exclusivo de divulgação.`;
    confirmarAcao.innerHTML = `<i class="fa-solid fa-check"></i> Aprovar`;
  } else {
    tituloConfirmacao.textContent = "Recusar afiliação?";
    textoConfirmacao.textContent =
      `Ao confirmar, a solicitação de ${candidato.nome} será recusada e o acesso de afiliado será removido, caso exista.`;
    confirmarAcao.innerHTML = `<i class="fa-solid fa-ban"></i> Recusar`;
  }

  modalConfirmacao.classList.add("ativo");
  modalConfirmacao.setAttribute("aria-hidden", "false");
}

function fecharConfirmacao() {
  acaoPendente = null;
  modalConfirmacao.classList.remove("ativo");
  modalConfirmacao.setAttribute("aria-hidden", "true");
}

function aprovarAfiliado(id) {
  const solicitacoes = obterDados(CHAVE_SOLICITACOES);
  const usuarios = obterDados(CHAVE_USUARIOS);

  const indice = solicitacoes.findIndex((item) => item.id === id);

  if (indice === -1) return;

  const candidato = solicitacoes[indice];

  if (!candidato.codigoAfiliado) {
    candidato.codigoAfiliado = gerarCodigoAfiliado(candidato.nome);
  }

  candidato.status = "aprovado";
  candidato.analisadoEm = new Date().toISOString();
  candidato.analisadoPor = "ADM LA Advisory";

  const usuarioExistente = usuarios.find((usuario) => {
    return usuario.email === candidato.email;
  });

  if (usuarioExistente) {
    usuarioExistente.perfil = "afiliado";
    usuarioExistente.codigoAfiliado = candidato.codigoAfiliado;
  } else {
    usuarios.push({
      id: `user_${Date.now()}`,
      nome: candidato.nome,
      email: candidato.email,
      telefone: candidato.telefone,
      perfil: "afiliado",
      codigoAfiliado: candidato.codigoAfiliado,
      criadoEm: new Date().toISOString()
    });
  }

  solicitacoes[indice] = candidato;

  salvarDados(CHAVE_SOLICITACOES, solicitacoes);
  salvarDados(CHAVE_USUARIOS, usuarios);

  /*
    No backend, envie o e-mail de aprovação para candidato.email.
    Também registre que o admin aprovou o perfil.
  */

  alert(
    `Afiliação aprovada com sucesso!\n\nCódigo do afiliado: ${candidato.codigoAfiliado}`
  );

  atualizarEstatisticas();
  renderizarLista();
}

function recusarAfiliado(id) {
  const solicitacoes = obterDados(CHAVE_SOLICITACOES);
  const usuarios = obterDados(CHAVE_USUARIOS);

  const indice = solicitacoes.findIndex((item) => item.id === id);

  if (indice === -1) return;

  const candidato = solicitacoes[indice];

  candidato.status = "recusado";
  candidato.analisadoEm = new Date().toISOString();
  candidato.analisadoPor = "ADM LA Advisory";

  const usuariosAtualizados = usuarios.map((usuario) => {
    if (usuario.email === candidato.email) {
      return {
        ...usuario,
        perfil: "cliente",
        codigoAfiliado: null
      };
    }

    return usuario;
  });

  solicitacoes[indice] = candidato;

  salvarDados(CHAVE_SOLICITACOES, solicitacoes);
  salvarDados(CHAVE_USUARIOS, usuariosAtualizados);

  /*
    No backend, envie o e-mail de recusa para candidato.email.
  */

  alert("Solicitação recusada com sucesso.");

  atualizarEstatisticas();
  renderizarLista();
}

document.querySelectorAll(".aba-afiliado").forEach((botao) => {
  botao.addEventListener("click", () => {
    document.querySelectorAll(".aba-afiliado").forEach((aba) => {
      aba.classList.remove("ativa");
    });

    botao.classList.add("ativa");
    statusSelecionado = botao.dataset.status;
    renderizarLista();
  });
});

listaAfiliados.addEventListener("click", (event) => {
  const botaoAcao = event.target.closest("[data-acao]");
  const botaoCopiar = event.target.closest("[data-codigo]");

  if (botaoAcao) {
    abrirConfirmacao(botaoAcao.dataset.acao, botaoAcao.dataset.id);
  }

  if (botaoCopiar) {
    const codigo = botaoCopiar.dataset.codigo;

    if (!codigo) return;

    navigator.clipboard.writeText(codigo)
      .then(() => alert("Código copiado: " + codigo))
      .catch(() => alert("Não foi possível copiar o código."));
  }
});

confirmarAcao.addEventListener("click", () => {
  if (!acaoPendente) return;

  const { acao, id } = acaoPendente;

  if (acao === "aprovar") {
    aprovarAfiliado(id);
  }

  if (acao === "recusar") {
    recusarAfiliado(id);
  }

  fecharConfirmacao();
});

cancelarAcao.addEventListener("click", fecharConfirmacao);
fecharModalConfirmacao.addEventListener("click", fecharConfirmacao);

modalConfirmacao.addEventListener("click", (event) => {
  if (event.target === modalConfirmacao) {
    fecharConfirmacao();
  }
});

atualizarEstatisticas();
renderizarLista();
