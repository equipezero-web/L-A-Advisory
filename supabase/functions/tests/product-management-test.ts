import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  isProductMutationIntent,
  sanitizeProductMutation,
  validateProductMutation,
} from '../_shared/product-management.ts';

Deno.test('detecta alteração de preço', () => {
  assert(isProductMutationIntent('Mude o preço de venda do produto Relógio Royal para 129,90'));
});

Deno.test('permite somente campos administrativos autorizados', () => {
  const mutation = sanitizeProductMutation({
    lookup: 'Relógio Royal',
    action: 'update',
    changes: {
      sale_price: '129,90',
      stock: 25,
      discount: 10,
      id: 'produto-injetado',
      created_at: '2000-01-01',
      user_id: 'ataque',
    },
  });
  assertEquals(mutation.changes, { sale_price: 129.9, stock: 25, discount: 10 });
  assertEquals(validateProductMutation(mutation), []);
});

Deno.test('rejeita estoque negativo e percentuais fora de 0 a 100', () => {
  const mutation = sanitizeProductMutation({
    lookup: 'Produto A',
    changes: { stock: -1, discount: 150, commission: -10 },
  });
  assertEquals(validateProductMutation(mutation), ['nenhuma alteração válida identificada']);
});

Deno.test('desativar só produz active=false', () => {
  const mutation = sanitizeProductMutation({ lookup: 'Produto A', action: 'deactivate' });
  assertEquals(mutation.changes, { active: false });
});
