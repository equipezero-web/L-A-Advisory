L&A Royal Advisory — configuração atual do repositório

Frontend
- Página principal atual: index.html (não existe index_supabase_migrated.html na raiz).
- URL GitHub Pages configurada no frontend: https://equipezero-web.github.io/L-A-Advisory
- Nunca publique chaves secretas no HTML, no GitHub ou no navegador.

SQL
- A migração de segurança do checkout está na raiz: 001_security_checkout.sql.
- A autenticação separada e pagamentos de comissão de afiliados estão em: supabase/affiliate_auth.sql.
- Revise e aplique cada script no Supabase SQL Editor antes de publicar as funções que dependem dele.

Secrets usados pelas Edge Functions
- SUPABASE_URL
- SUPABASE_SECRET_KEYS (JSON com a chave service-role em "default") ou SUPABASE_SERVICE_ROLE_KEY, conforme a função
- SUPABASE_PUBLISHABLE_KEYS (JSON com a chave pública em "default") ou SUPABASE_ANON_KEY, conforme a função
- MP_ACCESS_TOKEN
- MP_WEBHOOK_SECRET
- SITE_URL=https://equipezero-web.github.io/L-A-Advisory

Não use MERCADOPAGO_ACCESS_TOKEN: as funções atuais leem MP_ACCESS_TOKEN.
Nunca coloque chave service-role, MP_ACCESS_TOKEN ou MP_WEBHOOK_SECRET no frontend.

Edge Functions presentes no repositório
- affiliate-login
- register-affiliate
- create-checkout
- create-order
- create-test-checkout
- mercado-pago-webhook

Confira qual endpoint é chamado pelo frontend antes de fazer deploy. Não remova funções que ainda tenham chamadas ativas.

Webhook Mercado Pago
https://fqisewatypluagngmgka.supabase.co/functions/v1/mercado-pago-webhook

Checklist obrigatório antes de produção
- cadastro, login, logout e recuperação de senha
- aprovação e bloqueio de afiliados
- links de afiliado e atribuição de vendas
- checkout Pix/cartão
- confirmação de pagamento pelo webhook assinado
- baixa de estoque sem duplicação
- comissão correta e pagamento de comissão
- RLS: um cliente não pode ler dados de outro cliente
- teste de layout e rolagem em desktop e celular

Observação
O arquivo de configuração do Turnstile e a integração de CAPTCHA no navegador precisam ser verificados antes de afirmar que a autenticação exige CAPTCHA.
