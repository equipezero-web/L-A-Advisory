document.addEventListener('DOMContentLoaded', async () => {
  const listaEl = document.getElementById('lista-produtos');

  try {
    const res = await fetch('produtos/produtos.json');
    const produtos = await res.json();

    listaEl.innerHTML = produtos
      .map(p => `
        <section class="produto">
          <h3>${p.nome}</h3>
          <p>${p.descricao}</p>
          <p><strong>R$ ${p.preco.toFixed(2).replace('.', ',')}</strong></p>
          <button data-id="${p.id}">Adicionar ao carrinho</button>
        </section>
      `)
      .join('');

    listaEl.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON') {
        const id = e.target.getAttribute('data-id');
        const produto = produtos.find(p => p.id === id);
        if (produto) {
          window.adicionarAoCarrinho({
            nome: produto.nome,
            preco: produto.preco,
            tipo: produto.tipo
          });
          alert('Produto adicionado ao carrinho!');
        }
      }
    });
  } catch (err) {
    console.error('Erro ao carregar produtos:', err);
    listaEl.innerHTML = '<p>Erro ao carregar produtos.</p>';
  }
});
