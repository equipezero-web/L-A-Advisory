-- Permite salvar a transportadora informada no painel administrativo.
-- Seguro para executar mais de uma vez.
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS carrier text;

-- Atualiza o cache de esquema do PostgREST para reconhecer a nova coluna.
NOTIFY pgrst, 'reload schema';
