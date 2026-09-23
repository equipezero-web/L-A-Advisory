import { db } from "./firebase-config.js";

import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

let statusSelecionado = "pendente";
let acaoPendente = null;
let solicitacoesAtuais = [];

const listaAfiliados = document.getElementById("listaAfiliados");
const modalConfirmacao = document.getElementById("modalConfirmacao");
const tituloConfirmacao = document.getElementById("tituloConfirmacao");
const textoConfirmacao = document.getElementById("textoConfirmacao");
const confirmarAcao = document.getElementById("confirmarAcao");
const cancelarAcao = document.getElementById("cancelarAcao");
const fecharModalConfirmacao = document.getElementById("fecharModalConfirmacao");

function escaparHTML(texto = "") {
  const elemento = document.createElement("div");
  elemento.textContent = texto;
  return elemento.innerHTML;
}

function formatarData(timestamp) {
  if (!timestamp) {
    return "Aguardando registro";
  }

  const data = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatarNascimento(dataNascimento) {
  if (!dataNascimento) return "Não informado";

  const [ano, mes, dia] = dataNascimento.split("-");

  return `${dia}/${mes}/${ano}`;
}

function gerarCodigoAfiliado(nome) {
  const primeiroNome = nome
    .trim()
    .split(" ")[0]
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "");

  const codigoAleatorio = Math.random()
    .toString(36)
    .substring(2, 7)
    .toUpperCase();

  return `ROYAL-${primeiroNome}-${codigoAleatorio}`;
}

async function carregarSolicitacoes() {
  try {
    const consulta = query(
      collection(db, "solicitacoesAfiliados"),
      orderBy("criadoEm", "desc")
    );

    const resultado = await getDocs(consulta);

    solicitacoesAtuais = resultado.docs.map((documento) => {
      return {
        id: documento.id,
        ...documento.data()
      };
    });

    atualizarEstatisticas();
    renderizarLista();

  } catch (erro) {
    console.error("Erro ao buscar afiliados:", erro);

    listaAfiliados.innerHTML = `
      <div class="estado-vazio">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h2>Erro ao carregar solicitações</h2>
        <p>Verifique a conexão com o Firebase e as regras do Firestore.</p>
      </div>
    `;
  }
}

function atualizarEstatisticas() {
  const pendentes = solicitacoesAtuais.filter(
    (item) => item.status === "pendente"
  ).length;

  const aprovados = solicitacoesAtuais.filter(
    (item) => item.status === "aprovado"
  ).length;

  const recusados = solicitacoesAtuais.filter(
    (item) => item.status === "recusado"
  ).length;

  document.getElementById("totalPendentes").textContent = pendentes;
  document.getElementById("totalAprovados").textContent = aprovados;
  document.getElementById("totalRecusados").textContent = recusados;

  document.getElementById("contadorPendentes").textContent = pendentes;
  document.getElementById("contadorAprovados").textContent = aprovados;
  document.getElementById("contadorRecusados").textContent = recusados;
}

function renderizarLista() {
  const filtrados = solicitacoesAtuais.filter((item) => {
    return item.status === statusSelecionado;
  });

  if (filtrados.length === 0) {
    listaAfiliados.innerHTML = `
      <div class="estado-vazio">
        <i class="fa-solid fa-folder-open"></i>
        <h2>Nenhum registro encontrado</h2>
        <p>Não existem solicitações com este status no momento.</p>
      </div>
    `;

    return;
  }

  listaAfiliados.innerHTML = filtrados.map((candidato) => {
    const codigoAfiliado = candidato.codigoAfiliado
      ? `
        <p>
          <strong>Código:</strong>
          <code>${escaparHTML(candidato.codigoAfiliado)}</code>
        </p>
      `
      : "";

    let botoes = "";

    if (candidato.status === "pendente") {
      botoes = `
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
    }

    if (candidato.status === "aprovado") {
      botoes = `
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
    }

    if (candidato.status === "recusado") {
      botoes = `
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

          ${codigoAfiliado}
        </div>

        <div class="candidato-motivacao">
          <h4>
            <i class="fa-solid fa-comment-dots"></i>
            Por que deseja ser afiliado?
          </h4>

          <p>${escaparHTML(candidato.motivacao)}</p>
        </div>

        ${botoes}
      </article>
    `;
  }).join("");
}

function abrirConfirmacao(acao, id) {
  const candidato = solicitacoesAtuais.find((item) => item.id === id);

  if (!candidato) return;

  acaoPendente = { acao, id };

  if (acao === "aprovar") {
    tituloConfirmacao.textContent = "Aprovar afiliação?";
    textoConfirmacao.textContent =
      `${candidato.nome} receberá um código exclusivo de afiliado e poderá acessar a área de afiliação.`;

    confirmarAcao.innerHTML = `
      <i class="fa-solid fa-check"></i>
      Aprovar
    `;
  }

  if (acao === "recusar") {
    tituloConfirmacao.textContent = "Recusar afiliação?";
    textoConfirmacao.textContent =
      `A solicitação de ${candidato.nome} será marcada como recusada.`;

    confirmarAcao.innerHTML = `
      <i class="fa-solid fa-ban"></i>
      Recusar
    `;
  }

  modalConfirmacao.classList.add("ativo");
  modalConfirmacao.setAttribute("aria-hidden", "false");
}

function fecharConfirmacao() {
  acaoPendente = null;

  modalConfirmacao.classList.remove("ativo");
  modalConfirmacao.setAttribute("aria-hidden", "true");
}

async function aprovarAfiliado(id) {
  const candidato = solicitacoesAtuais.find((item) => item.id === id);

  if (!candidato) return;

  try {
    const codigoAfiliado = candidato.codigoAfiliado || gerarCodigoAfiliado(candidato.nome);

    await updateDoc(doc(db, "solicitacoesAfiliados", id), {
      status: "aprovado",
      codigoAfiliado,
      analisadoPor: "ADM LA Advisory",
      analisadoEm: serverTimestamp()
    });

    /*
      Cria ou atualiza o perfil público do afiliado.

      No futuro, quando usar Firebase Authentication, troque o ID abaixo
      pelo UID verdadeiro do usuário autenticado.
    */
    await setDoc(
      doc(db, "afiliados", candidato.email),
      {
        nome: candidato.nome,
        email: candidato.email,
        telefone: candidato.telefone,
        codigoAfiliado,
        perfil: "afiliado",
        ativo: true,
        aprovadoEm: serverTimestamp()
      },
      { merge: true }
    );

    alert(
      `Afiliação aprovada com sucesso!\n\nCódigo: ${codigoAfiliado}`
    );

    await carregarSolicitacoes();

  } catch (erro) {
    console.error("Erro ao aprovar afiliado:", erro);
    alert("Não foi possível aprovar a afiliação.");
  }
}

async function recusarAfiliado(id) {
  const candidato = solicitacoesAtuais.find((item) => item.id === id);

  if (!candidato) return;

  try {
    await updateDoc(doc(db, "solicitacoesAfiliados", id), {
      status: "recusado",
      analisadoPor: "ADM LA Advisory",
      analisadoEm: serverTimestamp()
    });

    await setDoc(
      doc(db, "afiliados", candidato.email),
      {
        ativo: false,
        perfil: "cliente",
        removidoEm: serverTimestamp()
      },
      { merge: true }
    );

    alert("Solicitação recusada com sucesso.");

    await carregarSolicitacoes();

  } catch (erro) {
    console.error("Erro ao recusar afiliado:", erro);
    alert("Não foi possível recusar a solicitação.");
  }
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

    navigator.clipboard.writeText(codigo)
      .then(() => alert(`Código copiado: ${codigo}`))
      .catch(() => alert("Não foi possível copiar o código."));
  }
});

confirmarAcao.addEventListener("click", async () => {
  if (!acaoPendente) return;

  const { acao, id } = acaoPendente;

  fecharConfirmacao();

  if (acao === "aprovar") {
    await aprovarAfiliado(id);
  }

  if (acao === "recusar") {
    await recusarAfiliado(id);
  }
});

cancelarAcao.addEventListener("click", fecharConfirmacao);
fecharModalConfirmacao.addEventListener("click", fecharConfirmacao);

modalConfirmacao.addEventListener("click", (event) => {
  if (event.target === modalConfirmacao) {
    fecharConfirmacao();
  }
});

carregarSolicitacoes();
