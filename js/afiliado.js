]export function escaparHTML(texto = "") {
  const elemento = document.createElement("div");

  elemento.textContent = texto;

  return elemento.innerHTML;
}

export function formatarMoeda(valor = 0) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export function formatarData(timestamp) {
  if (!timestamp) {
    return "Não informado";
  }

  const data = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export function formatarNascimento(dataNascimento) {
  if (!dataNascimento) {
    return "Não informado";
  }

  const [ano, mes, dia] = dataNascimento.split("-");

  return `${dia}/${mes}/${ano}`;
}

export function gerarCodigoAfiliado(nome = "AFILIADO") {
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

  return `ROYAL-${primeiroNome || "AFILIADO"}-${codigoAleatorio}`;
}

export function calcularComissao(valorBruto, percentual = 20) {
  const valor = Number(valorBruto || 0);

  return Number((valor * (percentual / 100)).toFixed(2));
}

export function obterReferenciaAfiliado() {
  const parametros = new URLSearchParams(window.location.search);

  const codigoAfiliado = parametros.get("ref");

  const produtoId = parametros.get("produto");

  if (!codigoAfiliado) {
    return null;
  }

  return {
    codigoAfiliado,
    produtoId: produtoId || null
  };
}
