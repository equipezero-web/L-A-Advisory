const CHAVE_REFERENCIA_AFILIADO = "royal_referencia_afiliado";

function obterParametrosAfiliado() {
  const parametros = new URLSearchParams(window.location.search);

  const codigoAfiliado = parametros.get("ref");

  const produtoId = parametros.get("produto");

  if (!codigoAfiliado) {
    return null;
  }

  return {
    codigoAfiliado: codigoAfiliado.trim().toUpperCase(),
    produtoId: produtoId ? produtoId.trim() : null
  };
}

function salvarReferenciaAfiliado(referencia) {
  const dataAtual = new Date();

  const dataExpiracao = new Date(
    dataAtual.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  const dadosReferencia = {
    codigoAfiliado: referencia.codigoAfiliado,

    produtoId: referencia.produtoId,

    criadoEm: dataAtual.toISOString(),

    expiraEm: dataExpiracao.toISOString()
  };

  localStorage.setItem(
    CHAVE_REFERENCIA_AFILIADO,
    JSON.stringify(dadosReferencia)
  );

  return dadosReferencia;
}

function obterReferenciaAfiliadoValida() {
  try {
    const dados = localStorage.getItem(
      CHAVE_REFERENCIA_AFILIADO
    );

    if (!dados) {
      return null;
    }

    const referencia = JSON.parse(dados);

    if (!referencia?.codigoAfiliado) {
      localStorage.removeItem(CHAVE_REFERENCIA_AFILIADO);

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
    localStorage.removeItem(CHAVE_REFERENCIA_AFILIADO);

    return null;
  }
}

function removerReferenciaAfiliado() {
  localStorage.removeItem(CHAVE_REFERENCIA_AFILIADO);
}

function rastrearReferenciaAfiliado() {
  const referencia = obterParametrosAfiliado();

  if (!referencia) {
    return;
  }

  salvarReferenciaAfiliado(referencia);

  console.log(
    "Referência de afiliado salva:",
    referencia.codigoAfiliado
  );
}

window.obterReferenciaAfiliadoValida =
  obterReferenciaAfiliadoValida;

window.removerReferenciaAfiliado =
  removerReferenciaAfiliado;

rastrearReferenciaAfiliado();
