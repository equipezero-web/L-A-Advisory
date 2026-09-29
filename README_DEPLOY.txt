L&A Royal Advisory — migração Firebase -> Supabase

1) O arquivo index_supabase_migrated.html já aponta para:
   https://fqisewatypluagngmgka.supabase.co
   e usa somente a chave pública publishable no navegador.

2) NUNCA coloque SUPABASE_SERVICE_ROLE_KEY ou MERCADOPAGO_ACCESS_TOKEN no HTML/GitHub.

3) Execute primeiro:
   supabase/001_security_checkout.sql

4) Configure os secrets das Edge Functions:
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   MERCADOPAGO_ACCESS_TOKEN
   SITE_URL=https://equipezero-web.github.io/L-A-Advisory

5) Faça deploy das funções:
   supabase functions deploy create-checkout
   supabase functions deploy register-affiliate
   supabase functions deploy mercado-pago-webhook

6) O Mercado Pago deve apontar o webhook para:
   https://fqisewatypluagngmgka.supabase.co/functions/v1/mercado-pago-webhook

7) Antes de apagar Firebase, teste em produção:
   - cadastro de cliente
   - confirmação de e-mail (se habilitada)
   - login/logout
   - recuperação de senha
   - cadastro de afiliado
   - aprovação de afiliado pelo admin
   - criação de link de afiliado
   - checkout
   - retorno Mercado Pago
   - webhook e atualização do pedido
   - baixa de estoque
   - comissão
   - RLS com usuário cliente tentando acessar dados de outro usuário

8) O Turnstile foi configurado no projeto Supabase. Para a autenticação exigir o CAPTCHA no navegador, o widget/site key do Cloudflare ainda precisa ser colocado no HTML e o token enviado nas chamadas de Auth. Não invente uma site key.
