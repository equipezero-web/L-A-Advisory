// URL do seu backend (ajuste depois que colocar no ar)
const API_BASE = 'https://api.laadvisory.com.br/api';

document.addEventListener('DOMContentLoaded', () => {
  const itensPedidoEl = document.getElementById('itens-pedido');
  const totalPedidoEl = document.getElementById('total-pedido');
  const btnFinalizar = document.getElementById('btn-finalizar');
  const pixArea = document.getElementById('pix-area');
  const pixQr = document.getElementById('pix-qr');
  const pixCopiaCola = document.getElementById('pix-copia-cola');

  const carrinho = window.obterCarrinho();

  if (carrinho.length === 0) {
    itensPedidoEl.innerHTML = '<p>Seu carrinho está vazio.</p>';
    btnFinalizar.disabled = true;
    return;
  }

  const total = carrinho.reduce((sum, i) => sum + i.preco * (i.quantidade || 1), 0);
  itensPedidoEl.innerHTML = carrinho
    .map(i => `<p>${i.nome} — ${i.quantidade || 1}x — R$ ${Number(i.preco).toFixed(2)}</p>`)
    .join('');
  totalPedidoEl.textContent = total.toFixed(2).replace('.', ',');

  btnFinalizar.addEventListener('click', async () => {
    const nome = document.getElementById('nome').value.trim();
    const email = document.getElementById('email').value.trim();
    const cpf = document.getElementById('cpf').value.trim();
    const telefoneRaw = document.getElementById('telefone').value.trim();

    if (!nome || !email || !cpf || !telefoneRaw) {
      alert('Preencha todos os dados do cliente.');
      return;
    }

    const numeros = telefoneRaw.replace(/\D/g, '');
    if (numeros.length < 10 || numeros.length > 11) {
      alert('Telefone inválido.');
      return;
    }
    const ddd = numeros.slice(0, 2);
    const telefone = numeros.slice(2);

    const formaPagamento = document.querySelector('input[name="forma"]:checked').value;

    btnFinalizar.disabled = true;
    btnFinalizar.textContent = 'PROCESSANDO...';

    try {
      const res = await fetch(`${API_BASE}/pagamentos/criar-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: carrinho.map(i => ({
            nome: i.nome,
            preco: i.preco,
            quantidade: i.quantidade || 1
          })),
          cliente: { nome, email, cpf, ddd, telefone },
          formaPagamento
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar pagamento');
      }

      if (formaPagamento === 'pix') {
        pixArea.style.display = 'block';
        if (data.pix?.qrCodeBase64) {
          pixQr.src = `data:image/png;base64,${data.pix.qrCodeBase64}`;
        }
        if (data.pix?.qrCode) {
          pixCopiaCola.value = data.pix.qrCode;
        } else {
          pixCopiaCola.value = 'QR Code não disponível. Tente cartão.';
        }
        btnFinalizar.textContent = 'AGUARDANDO PAGAMENTO...';
      } else {
        window.location.href = data.initPoint;
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao iniciar pagamento. Tente novamente.');
      btnFinalizar.disabled = false;
      btnFinalizar.textContent = 'FINALIZAR PAGAMENTO';
    }
  });
});
