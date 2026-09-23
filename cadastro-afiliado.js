import { db } from "./firebase-config.js";

import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const formAfiliado = document.getElementById("formAfiliado");
const telefoneAfiliado = document.getElementById("telefoneAfiliado");
const motivacaoAfiliado = document.getElementById("motivacaoAfiliado");
const contadorMotivacao = document.getElementById("contadorMotivacao");
const modalVerificacao = document.getElementById("modalVerificacao");
const fecharModal = document.getElementById("fecharModal");
const continuarNavegando = document.getElementById("continuarNavegando");

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
  const quantidade = motivacaoAfiliado.value.trim().length;

  contadorMotivacao.textContent =
    `${quantidade} / mínimo de 20 caracteres`;
});

formAfiliado.addEventListener("submit", async (event) => {
  event.preventDefault();

  const botaoEnviar = formAfiliado.querySelector('button[type="submit"]');

  const nome = document.getElementById("nomeAfiliado").value.trim();
  const email = document.getElementById("emailAfiliado").value.trim().toLowerCase();
  const telefone = telefoneAfiliado.value.trim();
  const nascimento = document.getElementById("nascimentoAfiliado").value;
  const motivacao = motivacaoAfiliado.value.trim();

  if (motivacao.length < 20) {
    alert("A resposta precisa conter pelo menos 20 caracteres.");
    motivacaoAfiliado.focus();
    return;
  }

  try {
    botaoEnviar.disabled = true;
    botaoEnviar.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Enviando solicitação...
    `;

    const consultaEmail = query(
      collection(db, "solicitacoesAfiliados"),
      where("email", "==", email)
    );

    const resultados = await getDocs(consultaEmail);

    const jaExistePendente = resultados.docs.some((documento) => {
      return documento.data().status === "pendente";
    });

    if (jaExistePendente) {
      alert("Já existe uma solicitação pendente para este e-mail.");
      return;
    }

    await addDoc(collection(db, "solicitacoesAfiliados"), {
      nome,
      email,
      telefone,
      nascimento,
      motivacao,

      status: "pendente",

      codigoAfiliado: null,
      analisadoEm: null,
      analisadoPor: null,

      criadoEm: serverTimestamp()
    });

    formAfiliado.reset();
    contadorMotivacao.textContent = "0 / mínimo de 20 caracteres";

    abrirModal();

  } catch (erro) {
    console.error("Erro ao salvar solicitação:", erro);

    alert(
      "Não foi possível enviar sua solicitação. Verifique a conexão e tente novamente."
    );

  } finally {
    botaoEnviar.disabled = false;
    botaoEnviar.innerHTML = `
      <i class="fa-solid fa-paper-plane"></i>
      Enviar solicitação
    `;
  }
});

fecharModal.addEventListener("click", fecharModalVerificacao);

continuarNavegando.addEventListener("click", fecharModalVerificacao);

modalVerificacao.addEventListener("click", (event) => {
  if (event.target === modalVerificacao) {
    fecharModalVerificacao();
  }
});
