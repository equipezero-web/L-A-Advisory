const CHAVE_SOLICITACOES = "royal_solicitacoes_afiliados";

const formAfiliado = document.getElementById("formAfiliado");
const telefoneAfiliado = document.getElementById("telefoneAfiliado");
const motivacaoAfiliado = document.getElementById("motivacaoAfiliado");
const contadorMotivacao = document.getElementById("contadorMotivacao");
const modalVerificacao = document.getElementById("modalVerificacao");
const fecharModal = document.getElementById("fecharModal");
const continuarNavegando = document.getElementById("continuarNavegando");

function gerarId(prefixo = "id") {
  const codigoAleatorio = Math.random().toString(36).substring(2, 10);
  return `${prefixo}_${Date.now()}_${codigoAleatorio}`;
}

function obterSolicitacoes() {
  const dados = localStorage.getItem(CHAVE_SOLICITACOES);
  return dados ? JSON.parse(dados) : [];
}

function salvarSolicitacoes(solicitacoes) {
  localStorage.setItem(CHAVE_SOLICITACOES, JSON.stringify(solicitacoes));
}

function abrirModal() {
  modalVerificacao.classList.add("ativo");
  modalVerificacao.setAttribute("aria-hidden", "false");
}

function fecharModalVerificacao() {
  modalVerificacao.classList.remove("ativo");
  modalVerificacao.setAttribute("aria-hidden", "true");
}

telefoneAfiliado.addEventListener("input", (event) => {
  let valor = event.target.value.replace(/\D/g, "");

  if (valor.length > 11) {
    valor = valor.substring(0, 11);
  }

  valor = valor.replace(/^(\d{2})(\d)/g, "($1) $2");
  valor = valor.replace(/(\d)(\d{4})$/, "$1-$2");

  event.target.value = valor;
});

motivacaoAfiliado.addEventListener("input", () => {
  const total = motivacaoAfiliado.value.trim().length;
  contadorMotivacao.textContent = `${total} / mínimo de 20 caracteres`;
});

formAfiliado.addEventListener("submit", (event) => {
  event.preventDefault();

  const nome = document.getElementById("nomeAfiliado").value.trim();
  const email = document.getElementById("emailAfiliado").value.trim().toLowerCase();
  const telefone = telefoneAfiliado.value.trim();
  const nascimento = document.getElementById("nascimentoAfiliado").value;
  const motivacao = motivacaoAfiliado.value.trim();

  if (motivacao.length < 20) {
    alert("A resposta precisa ter pelo menos 20 caracteres.");
    motivacaoAfiliado.focus();
    return;
  }

  const solicitacoes = obterSolicitacoes();

  const existeSolicitacaoPendente = solicitacoes.some((solicitacao) => {
    return solicitacao.email === email && solicitacao.status === "pendente";
  });

  if (existeSolicitacaoPendente) {
    alert("Já existe uma solicitação pendente para este e-mail.");
    return;
  }

  const novaSolicitacao = {
    id: gerarId("sol"),
    nome,
    email,
    telefone,
    nascimento,
    motivacao,
    status: "pendente",
    criadoEm: new Date().toISOString(),
    analisadoEm: null,
    analisadoPor: null,
    codigoAfiliado: null
  };

  solicitacoes.unshift(novaSolicitacao);
  salvarSolicitacoes(solicitacoes);

  console.log("Solicitação criada:", novaSolicitacao);

  /*
    Quando houver backend, envie os dados para sua API:

    await fetch("https://seu-backend.com/api/afiliados/solicitacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novaSolicitacao)
    });

    O BACKEND deverá enviar o e-mail para:
    lucaalves17.20@gmail.com
  */

  formAfiliado.reset();
  contadorMotivacao.textContent = "0 / mínimo de 20 caracteres";

  abrirModal();
});

fecharModal.addEventListener("click", fecharModalVerificacao);
continuarNavegando.addEventListener("click", fecharModalVerificacao);

modalVerificacao.addEventListener("click", (event) => {
  if (event.target === modalVerificacao) {
    fecharModalVerificacao();
  }
});
