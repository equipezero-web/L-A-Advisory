/**
 * L&A Royal Advisory - registro de vendas na planilha.
 *
 * Como usar:
 * 1. Abra a planilha > Extensões > Apps Script e cole este código.
 * 2. Troque SEGREDO abaixo pelo mesmo valor configurado no Supabase (SHEETS_WEBHOOK_SECRET).
 * 3. Implantar > Nova implantação > Tipo: App da Web
 *    - Executar como: Eu
 *    - Quem pode acessar: Qualquer pessoa
 * 4. Copie a URL do app da Web (termina em /exec) e configure como SHEETS_WEBHOOK_URL no Supabase.
 */
const SEGREDO = 'COLE_AQUI_O_SEGREDO';
const ABA = 'Vendas';
const CABECALHO = [
  'Pedido', 'Produto', 'Quantidade', 'Valor unitário (R$)', 'Valor total (R$)',
  'Código de afiliado', 'Data do pagamento', 'Horário do pagamento'
];

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    if (!SEGREDO || SEGREDO === 'COLE_AQUI_O_SEGREDO' || dados.secret !== SEGREDO) {
      return resposta({ ok: false, error: 'não autorizado' });
    }
    const linhas = Array.isArray(dados.rows) ? dados.rows : [];
    if (!linhas.length) return resposta({ ok: true, added: 0 });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const planilha = SpreadsheetApp.getActiveSpreadsheet();
      let aba = planilha.getSheetByName(ABA);
      if (!aba) aba = planilha.insertSheet(ABA);
      if (aba.getLastRow() === 0) {
        aba.appendRow(CABECALHO);
        aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold');
        aba.setFrozenRows(1);
      }
      // Evita duplicar se o Mercado Pago reenviar a notificação: ignora pedidos já registrados.
      const pedido = String(linhas[0][0]);
      const existentes = aba.getLastRow() > 1
        ? aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues().flat().map(String)
        : [];
      if (existentes.indexOf(pedido) !== -1) return resposta({ ok: true, added: 0, duplicate: true });

      const inicio = aba.getLastRow() + 1;
      aba.getRange(inicio, 1, linhas.length, CABECALHO.length).setValues(linhas);
      aba.getRange(inicio, 4, linhas.length, 2).setNumberFormat('R$ #,##0.00');
      return resposta({ ok: true, added: linhas.length });
    } finally {
      lock.releaseLock();
    }
  } catch (erro) {
    return resposta({ ok: false, error: String(erro) });
  }
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
