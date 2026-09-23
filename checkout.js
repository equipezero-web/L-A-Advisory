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
    // Mostrar formulário de pagamento
function mostrarFormularioPagamento(metodo) {
    // Esconder todos
    document.getElementById('form-cartao').style.display = 'none';
    document.getElementById('form-pix').style.display = 'none';
    document.getElementById('form-boleto').style.display = 'none';
    
    // Mostrar selecionado
    document.getElementById(`form-${metodo}`).style.display = 'block';
}

// Máscaras de input
document.addEventListener('DOMContentLoaded', () => {
    // Máscara CPF
    const cpfInput = document.getElementById('cpf');
    if (cpfInput) {
        cpfInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            e.target.value = value;
        });
    }
    
    // Máscara Telefone
    const telInput = document.getElementById('telefone');
    if (telInput) {
        telInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            value = value.replace(/^(\d{2})(\d)/g, '($1) $2');
            value = value.replace(/(\d)(\d{4})$/, '$1-$2');
            e.target.value = value;
        });
    }
    
    // Máscara CEP
    const cepInput = document.getElementById('cep');
    if (cepInput) {
        cepInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            value = value.replace(/^(\d{5})(\d)/, '$1-$2');
            e.target.value = value;
        });
        
        // Buscar CEP
        cepInput.addEventListener('blur', async (e) => {
            const cep = e.target.value.replace(/\D/g, '');
            if (cep.length === 8) {
                try {
                    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                    const data = await response.json();
                    if (data.erro) {
                        alert('CEP não encontrado!');
                        return;
                    }
                    document.getElementById('endereco').value = `${data.logradouro}, ${data.localidade} - ${data.uf}`;
                    document.getElementById('cidade').value = data.localidade;
                    document.getElementById('estado').value = data.uf;
                } catch (error) {
                    console.error('Erro ao buscar CEP:', error);
                }
            }
        });
    }
    
    // Máscara Cartão
    const cartaoInput = document.getElementById('numero-cartao');
    if (cartaoInput) {
        cartaoInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            value = value.replace(/(\d{4})(\d)/, '$1 $2');
            value = value.replace(/(\d{4})(\d)/, '$1 $2');
            value = value.replace(/(\d{4})(\d)/, '$1 $2');
            e.target.value = value.substring(0, 19);
        });
    }
    
    // Máscara Validade
    const validadeInput = document.getElementById('validade');
    if (validadeInput) {
        validadeInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            value = value.replace(/^(\d{2})(\d)/, '$1/$2');
            e.target.value = value.substring(0, 5);
        });
    }
});

// Confirmar compra
function confirmarCompra() {
    // Validação básica
    const nome = document.getElementById('nome').value.trim();
    const email = document.getElementById('email').value.trim();
    const telefone = document.getElementById('telefone').value.trim();
    const cpf = document.getElementById('cpf').value.trim();
    const cep = document.getElementById('cep').value.trim();
    const endereco = document.getElementById('endereco').value.trim();
    
    if (!nome || !email || !telefone || !cpf || !cep || !endereco) {
        alert('Por favor, preencha todos os campos obrigatórios!');
        return;
    }
    
    // Validação de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Por favor, digite um e-mail válido!');
        return;
    }
    
    // Simular processamento
    const btnFinalizar = document.querySelector('.btn-finalizar');
    btnFinalizar.disabled = true;
    btnFinalizar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    
    setTimeout(() => {
        alert('✅ Pedido confirmado com sucesso!\n\nEm breve você receberá um e-mail com os detalhes da compra.');
        window.location.href = 'confirmacao.html';
    }, 2000);
}
  });
});
