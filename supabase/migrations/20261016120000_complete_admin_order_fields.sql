-- Garante que todos os campos usados pelo formulário administrativo de pedidos existam.
-- Seguro para executar mais de uma vez.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS tracking_code text,
    ADD COLUMN IF NOT EXISTS observations text,
    ADD COLUMN IF NOT EXISTS carrier text;

-- Atualiza o cache do PostgREST após criar/confirmar as colunas.
NOTIFY pgrst, 'reload schema';
