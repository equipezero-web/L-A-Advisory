export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function affiliateCommission(grossPrice: number, quantity: number, commissionPercent: number): number {
  if (!Number.isFinite(grossPrice) || grossPrice < 0) throw new Error('invalid gross price');
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('invalid quantity');
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) throw new Error('invalid commission');
  return money(grossPrice * quantity * commissionPercent / 100);
}

export function atomicStockAfter(stock: number, quantity: number): number {
  if (!Number.isInteger(stock) || stock < 0) throw new Error('invalid stock');
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('invalid quantity');
  if (stock < quantity) throw new Error('insufficient stock');
  return stock - quantity;
}

export function shouldFulfill(paymentStatus: string): boolean {
  return paymentStatus !== 'approved';
}
