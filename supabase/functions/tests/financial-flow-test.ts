import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { affiliateCommission, atomicStockAfter, shouldFulfill } from '../_shared/financial-rules.ts';

Deno.test('comissão respeita products.commission', () => {
  assertEquals(affiliateCommission(100, 2, 12), 24);
  assertEquals(affiliateCommission(199.9, 1, 10), 19.99);
  assertEquals(affiliateCommission(80, 3, 25), 60);
});

Deno.test('estoque é reduzido sem ficar negativo', () => {
  assertEquals(atomicStockAfter(10, 3), 7);
  assertEquals(atomicStockAfter(1, 1), 0);
  assertThrows(() => atomicStockAfter(1, 2), Error, 'insufficient stock');
});

Deno.test('aprovação duplicada não deve cumprir pedido novamente', () => {
  assertEquals(shouldFulfill('pending'), true);
  assertEquals(shouldFulfill('approved'), false);
});

Deno.test('valida comissão e quantidade inválidas', () => {
  assertThrows(() => affiliateCommission(100, 1, 101));
  assertThrows(() => affiliateCommission(100, 0, 20));
});
