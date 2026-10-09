L&A Royal Advisory — configuração de publicação (GitHub Pages)

Publicação atual
- Plataforma: GitHub Pages.
- Repositório: equipezero-web/L-A-Advisory.
- Fonte esperada: branch main, pasta raiz (/).
- Página principal: index.html.
- URL pública: https://equipezero-web.github.io/L-A-Advisory/
- Origem CORS correta (somente domínio, sem caminho): https://equipezero-web.github.io
- O caminho /L-A-Advisory/ faz parte da URL do site, mas NÃO faz parte do cabeçalho Origin do navegador.
- No Supabase Dashboard > Authentication > URL Configuration, configure o Site URL como https://equipezero-web.github.io/L-A-Advisory/ e inclua essa mesma URL em Redirect URLs para recuperação de senha e confirmação de e-mail.
- server.js, package.json e wrangler.jsonc não são usados pelo GitHub Pages; são artefatos para outras formas de hospedagem. O GitHub Pages não executa Node.js nem funções de servidor.
- Não é necessário criar workflow de deploy se Pages estiver configurado em Settings > Pages > Deploy from a branch > main > /(root).
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

Configure SITE_URL como secret das Supabase Edge Functions (não como variável do GitHub Pages). O checkout create-order agora usa esse valor para as URLs de retorno; mantenha-o sem barra final.

Não use MERCADOPAGO_ACCESS_TOKEN: as funções atuais leem MP_ACCESS_TOKEN.
Nunca coloque chave service-role, MP_ACCESS_TOKEN ou MP_WEBHOOK_SECRET no frontend.

Edge Functions presentes no repositório
- affiliate-login
- register-affiliate
- create-checkout
- create-order
- create-test-checkout
- mercado-pago-webhook

O frontend chama atualmente /functions/v1/create-order no Supabase. Publique essa função depois de atualizar o código. create-checkout e create-test-checkout são funções separadas; não confunda os endpoints.

CORS conferido para as funções do frontend: Access-Control-Allow-Origin deve ser https://equipezero-web.github.io (sem /L-A-Advisory). As chamadas autenticadas precisam permitir authorization, apikey e content-type. OPTIONS deve responder antes de validar método ou corpo. O webhook é chamado pelo Mercado Pago servidor-a-servidor; CORS não autentica nem valida a assinatura do webhook.

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
