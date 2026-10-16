-- Permite preços de produtos acima de R$ 1.000,00.
-- Mantém os valores monetários com duas casas decimais.
-- O limite de comissão é uma regra separada e não deve restringir o preço do produto.

ALTER TABLE public.products
  ALTER COLUMN price TYPE numeric(12,2)
    USING price::numeric(12,2),
  ALTER COLUMN sale_price TYPE numeric(12,2)
    USING sale_price::numeric(12,2);

-- Atualiza o cache do PostgREST após a alteração do esquema.
NOTIFY pgrst, 'reload schema';
