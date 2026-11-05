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
