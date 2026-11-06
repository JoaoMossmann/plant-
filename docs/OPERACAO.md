# Operação

Requer Node.js 24 e npm.

```sh
npm ci
npm run dev
```

Para validar e compilar:

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run audit:public -- --history
```

## Configuração

Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Esses valores são públicos. Sem eles, o aplicativo usa armazenamento local.

No backend, configure credenciais somente no gerenciador de segredos do provedor. Nunca inclua senha SMTP, chave Secret ou `service_role` em variáveis `VITE_*`, arquivos versionados ou logs.

Aplique somente migrações aprovadas de `supabase/migrations`, na ordem de suas dependências e uma única vez. Valide primeiro em homologação, com backup recuperável. Arquivos em um PR não significam que o banco remoto já foi atualizado.

No Supabase Auth, mantenha confirmação de e-mail, configure SMTP e cadastre a URL HTTPS do site e os redirecionamentos exatos. Links PKCE devem ser abertos no navegador que iniciou o pedido.

Publique a função `delete-account` para habilitar exclusão. Configure `ALLOWED_ORIGINS` no servidor com as origens autorizadas, sem caminhos. A função deve ser ampliada e testada quando novos tipos de arquivos forem adicionados.

## Publicação e dados

O workflow atual publica `dist/` no GitHub Pages após integração à `main`; em PRs, executa somente verificações. No GitHub Actions, as duas variáveis públicas do Supabase ficam em Repository variables. Mudanças nesses valores exigem novo build.

Migrar a hospedagem antes de operar comercialmente ou tornar o repositório privado. Depois da migração, atualizar DNS, redirecionamentos do Auth e origens permitidas; validar o novo endereço antes de interromper o anterior.

Jardins locais ficam no IndexedDB e não são sincronizados automaticamente. Dados de conta dependem das permissões do banco e do Storage. Manter RLS e fotos privadas; testar isolamento entre contas, recuperação e exclusão no ambiente real.

Backups do banco não incluem os objetos das fotos. Manter e testar recuperação de ambos, com retenção e acesso controlados. Não guardar backups pessoais no Git.

Os créditos e as licenças das fotografias estão em `src/assets/plants/CREDITS.md` e nas fichas do catálogo. Preservá-los ao redistribuir as imagens.

## Perfil

A tela de perfil depende da migração aprovada `202611040001_community_foundation.sql`. Teste-a em homologação antes de aplicar ao ambiente ativo; o merge não executa SQL. Não repita as migrações de jardins já aplicadas. Confirme login, criação/edição do perfil e isolamento entre duas contas antes de liberar o recurso.

Enquanto a interface estiver no Pages, a navegação usa fragmentos como `#/perfil`, permitindo recarregar sem regras de redirecionamento de servidor. Na migração de hospedagem, preserve esses links ou ofereça redirecionamento compatível.

## Limites de gravação

A migração `202611060001_write_limits.sql` depende das três anteriores. Aplique primeiro em homologação. O banco limita por conta: jardim com saldo de 30 gravações, reposição de 30 por minuto e até 2.000 por dia; perfil com saldo de 10, reposição de 10 por minuto e até 100 por dia. O dia reinicia em UTC. Erros e transações desfeitas não consomem saldo; esse controle não substitui proteção contra tráfego abusivo, limites globais ou cotas de fotos. Gravações exigem a sessão do proprietário, inclusive em futuras rotinas de backend.

Execute `supabase/checks/security_inventory.sql` no SQL Editor para consultar configuração, sem dados pessoais. Revise presença das tabelas, RLS, permissões, políticas e gatilhos; a consulta não certifica segurança automaticamente. Confirme também isolamento com duas contas de teste pelas APIs reais. Não publique tokens ou resultados que revelem configurações internas. Uploads ainda precisam de cotas por conta e validação do conteúdo no servidor.
