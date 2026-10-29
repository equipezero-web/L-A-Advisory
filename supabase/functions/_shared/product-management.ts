export type ProductMutation = {
  lookup: string;
  action: 'update' | 'activate' | 'deactivate';
  changes: Record<string, unknown>;
};

const ALLOWED_FIELDS = new Set([
  'description', 'price', 'sale_price', 'discount', 'stock',
  'commission', 'image', 'category', 'active'
]);

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string'
    ? value.replace(/\s/g, '').replace('R$', '').replace(',', '.')
    : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function isProductMutationIntent(prompt: string): boolean {
  return /(alter|atualiz|mud|troqu|ajust|aument|reduz|defin|coloc|desativ|ativ).{0,70}(produto|pre[cç]o|estoque|desconto|descri[cç][aã]o|comiss[aã]o|categoria|imagem)|produto.{0,70}(alter|atualiz|mud|troqu|ajust|desativ|ativ)/i.test(prompt);
}

export function sanitizeProductMutation(raw: Record<string, unknown>): ProductMutation {
  const actionRaw = String(raw.action || 'update').toLowerCase();
  const action: ProductMutation['action'] = actionRaw === 'deactivate'
    ? 'deactivate'
    : actionRaw === 'activate'
      ? 'activate'
      : 'update';
  const lookup = String(raw.lookup || raw.product || raw.name || raw.product_id || '').trim().slice(0, 180);
  const source = raw.changes && typeof raw.changes === 'object'
    ? raw.changes as Record<string, unknown>
    : raw;
  const changes: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (key === 'description' || key === 'image' || key === 'category') {
      const text = String(value ?? '').trim();
      if (text) changes[key] = text.slice(0, key === 'description' ? 5000 : 1000);
      continue;
    }
    if (key === 'active') {
      if (typeof value === 'boolean') changes.active = value;
      continue;
    }
    const n = numberValue(value);
    if (n === null) continue;
    if (key === 'stock') {
      if (Number.isInteger(n) && n >= 0) changes.stock = n;
    } else if (key === 'discount' || key === 'commission') {
      if (n >= 0 && n <= 100) changes[key] = n;
    } else if ((key === 'price' || key === 'sale_price') && n >= 0) {
      changes[key] = Math.round(n * 100) / 100;
    }
  }

  if (action === 'deactivate') changes.active = false;
  if (action === 'activate') changes.active = true;
  return { lookup, action, changes };
}

export function validateProductMutation(mutation: ProductMutation): string[] {
  const errors: string[] = [];
  if (!mutation.lookup) errors.push('produto não identificado');
  if (!Object.keys(mutation.changes).length) errors.push('nenhuma alteração válida identificada');
  return errors;
}

export function mutationPreview(product: Record<string, unknown>, mutation: ProductMutation): string {
  const labels: Record<string, string> = {
    description: 'Descrição', price: 'Preço bruto/custo', sale_price: 'Preço de venda',
    discount: 'Desconto', stock: 'Estoque', commission: 'Comissão', image: 'Imagem',
    category: 'Categoria', active: 'Status'
  };
  const values = Object.entries(mutation.changes).map(([key, value]) => {
    let shown = String(value);
    if (key === 'price' || key === 'sale_price') shown = `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
    if (key === 'discount' || key === 'commission') shown = `${value}%`;
    if (key === 'active') shown = value ? 'ativo' : 'desativado';
    return `${labels[key] || key}: ${shown}`;
  });
  return [`Prévia da alteração:`, `Produto: ${String(product.name || product.id)}`, ...values, '', 'Responda “confirmar” para aplicar ou “cancelar” para descartar.'].join('\n');
}
