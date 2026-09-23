// Carrinho simples usando localStorage
function obterCarrinho() {
  try {
    return JSON.parse(localStorage.getItem('carrinho') || '[]');
  } catch {
    return [];
  }
}

function adicionarAoCarrinho(produto) {
  const carrinho = obterCarrinho();
  const existente = carrinho.find(i => i.nome === produto.nome);
  if (existente) {
    existente.quantidade = (existente.quantidade || 1) + 1;
  } else {
    carrinho.push({ ...produto, quantidade: 1 });
  }
  localStorage.setItem('carrinho', JSON.stringify(carrinho));
}

function limparCarrinho() {
  localStorage.removeItem('carrinho');
}

// Expõe para outros scripts
window.obterCarrinho = obterCarrinho;
window.adicionarAoCarrinho = adicionarAoCarrinho;
window.limparCarrinho = limparCarrinho;
// Dados do carrinho
let carrinho = [
    { id: 1, nome: 'Consultoria Premium', preco: 500.00, quantidade: 1 },
    { id: 2, nome: 'Pacote Empresarial', preco: 1500.00, quantidade: 1 }
];

// Atualizar carrinho ao carregar
document.addEventListener('DOMContentLoaded', () => {
    atualizarCarrinho();
});

// Alterar quantidade
function alterarQuantidade(id, alteracao) {
    const item = carrinho.find(item => item.id === id);
    if (item) {
        item.quantidade += alteracao;
        if (item.quantidade < 1) item.quantidade = 1;
        document.getElementById(`qtd-${id}`).value = item.quantidade;
        atualizarCarrinho();
    }
}

// Atualizar quantidade via input
function atualizarQuantidade(id) {
    const item = carrinho.find(item => item.id === id);
    const input = document.getElementById(`qtd-${id}`);
    if (item && input) {
        item.quantidade = parseInt(input.value) || 1;
        if (item.quantidade < 1) item.quantidade = 1;
        atualizarCarrinho();
    }
}

// Remover item
function removerItem(id) {
    if (confirm('Tem certeza que deseja remover este item?')) {
        carrinho = carrinho.filter(item => item.id !== id);
        atualizarCarrinho();
    }
}

// Aplicar cupom
function aplicarCupom() {
    const codigo = document.getElementById('codigo-cupom').value.trim().toUpperCase();
    const mensagem = document.getElementById('cupom-mensagem');
    
    const cuponsValidos = {
        'ROYAL10': 10,
        'PRIMEIRO15': 15,
        'VIP20': 20
    };
    
    if (cuponsValidos[codigo]) {
        const desconto = cuponsValidos[codigo];
        mensagem.style.color = 'var(--sucesso)';
        mensagem.textContent = `Cupom aplicado! ${desconto}% de desconto.`;
        atualizarCarrinho(desconto);
    } else {
        mensagem.style.color = 'var(--erro)';
        mensagem.textContent = 'Cupom inválido!';
    }
}

// Atualizar visualização do carrinho
function atualizarCarrinho(descontoPercentual = 0) {
    const subtotal = carrinho.reduce((total, item) => total + (item.preco * item.quantidade), 0);
    const desconto = subtotal * (descontoPercentual / 100);
    const total = subtotal - desconto;
    
    // Atualizar valores no resumo
    document.getElementById('subtotal').textContent = formatarMoeda(subtotal);
    document.getElementById('desconto').textContent = formatarMoeda(desconto);
    document.getElementById('total').textContent = formatarMoeda(total);
    
    // Atualizar itens na tela
    carrinho.forEach(item => {
        const itemElement = document.querySelector(`.cart-item[data-id="${item.id}"]`);
        if (itemElement) {
            const subtotalItem = item.preco * item.quantidade;
            itemElement.querySelector('.col-subtotal').textContent = formatarMoeda(subtotalItem);
        }
    });
    
    // Salvar no localStorage
    localStorage.setItem('carrinhoRoyal', JSON.stringify(carrinho));
}

// Formatar moeda
function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Finalizar compra
function finalizarCompra() {
    if (carrinho.length === 0) {
        alert('Seu carrinho está vazio!');
        return;
    }
    window.location.href = 'checkout.html';
}
