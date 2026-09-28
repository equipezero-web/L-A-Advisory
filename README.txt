L&A ROYAL ADVISORY

Estrutura preparada para Firebase + Mercado Pago.

Arquivos:
- index.html
- firebase.json
- firestore.rules
- functions/index.js
- functions/package.json

IMPORTANTE:
1. Configure o Access Token do Mercado Pago como segredo/variável de ambiente no backend. Não coloque token de produção no index.html.
2. Ative E-mail/Senha no Firebase Authentication.
3. Revise as regras do Firestore antes de colocar em produção.
4. Para instalar/deployar as Functions:
   cd functions
   npm install
   cd ..
   firebase deploy --only functions

Depois, para o projeto completo:
   firebase deploy
