# Advisory AI — resultados de lojas de origem (v82)

## Alteração
- Não solicitar mais cards agregados do Google Shopping.
- Pesquisa orgânica do provedor (Serper/SerpApi) é apenas mecanismo de **descoberta** de anúncios: resultados aceitos devem ter URL final com domínio do marketplace consultado, nunca Google Shopping.
- Modo rápido: 3 pesquisas (Shopee, SHEIN, Mercado Livre); amplo: 6 lojas; muito amplo: 12 pesquisas com segunda variante por loja.
- A interface descarta qualquer resultado legado cujo link não pertença aos marketplaces conhecidos ou cuja classe não seja `merchant`.
- A ação do card abre a URL original do anúncio. Sem URL direta, **não exibe uma ficha agregada disfarçada de oferta**.

## Verificação obrigatória depois de publicar
1. Buscar “camisa masculina”, profundidade **Ampla**, sem filtro de avaliações, ordenação **menor preço**.
2. Inspecionar cada botão “Abrir na loja”: o endereço deve apontar à loja de origem (Shopee, SHEIN, Mercado Livre, AliExpress, Amazon Brasil ou Magalu), não a `google.com/shopping`.
3. Se a busca orgânica não trouxer links adequados, mostrar zero resultados em vez dos produtos caros do Google Shopping.
4. Conferir preço do anúncio na própria loja: valores extraídos do texto indexado **podem estar desatualizados**.
5. Confirmar autenticação administrativa e não exposição de chaves no navegador.
6. Validar no desktop e no celular; verificar que a quantidade de buscas exibida corresponde ao modo escolhido.

## Limitações
Nenhum mecanismo de busca indexa integralmente cada marketplace. Links diretos e snippets **não são uma integração oficial das APIs** de Shopee/SHEIN/Mercado Livre, nem garantem estoque/preço atualizado. Para catálogo em tempo real, será necessária integração autorizada com cada marketplace/fornecedor; não contornar restrições ou páginas protegidas.
