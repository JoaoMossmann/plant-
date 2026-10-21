# Desenvolvimento

Requisitos: Node.js 24 LTS e npm. Use o checkout existente em uma tarefa de nuvem; cada tarefa já é isolada, sem necessidade de criar worktrees.

```sh
npm ci
npm test
npm run dev
```

O terminal informa o endereço local. Para validar o resultado publicável:

```sh
npm run build
npm run preview
```

Sem configuração de Supabase, o aplicativo mantém o jardim local e informa que contas estão em preparação. Para conectar contas, copie `.env.example` para `.env.local` e informe apenas Project URL e chave Publishable; veja [SUPABASE.md](SUPABASE.md). Nunca use Secret ou `service_role` no frontend.

Para testes de interface, execute `npx playwright install chromium` e `npm run test:e2e`. Se o Chromium já estiver instalado, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/caminho/do/chromium npm run test:e2e`. Os testes de interface usam um serviço Supabase simulado e nunca criam contas ou enviam e-mails reais.

Os testes de banco executam a migração em PostgreSQL via PGlite, com dois usuários simulados e verificações de acesso anônimo, isolamento, escrita e conflito entre dispositivos. Isso valida as políticas SQL e a lógica transacional; não substitui os testes de Auth, e-mail e Storage no projeto Supabase real.

Dados locais ficam no IndexedDB. Dados de conta ficam no banco e fotos em bucket privado. Os modos não compartilham automaticamente o mesmo jardim. A importação local para a conta é uma cópia explícita; não apaga o original. Uma sessão da conta não é usada como fallback para dados locais quando a rede falha.

O salvamento usa uma revisão no banco para rejeitar conflitos. Caso outro aparelho salve antes, o aplicativo pede uma atualização dos dados; não sobrescreve silenciosamente o jardim remoto. Exporte um backup antes de editar em vários aparelhos. O backup contém os registros salvos; campos de um formulário ainda não enviado não entram na exportação. Atualize manualmente para ver alterações de outro aparelho.

## Publicação

Em Settings → Pages, escolha GitHub Actions. O workflow `pages.yml` testa, compila e publica `dist/` a cada push na branch principal. A configuração `base: './'` atende o caminho de projeto no Pages. As duas variáveis públicas de Supabase devem estar em Settings → Secrets and variables → Actions → Variables (Repository variables).

GitHub Pages pode servir um domínio próprio mais adiante. A mudança exige configurar o domínio no Pages e no DNS, além de atualizar as URLs de redirecionamento do Supabase. Não publique um arquivo CNAME antes de possuir e configurar o domínio.

## Custos

Pages, Supabase e provedores de análise de imagens possuem condições e cotas distintas. Confirme os planos atuais e acompanhe uso, armazenamento, e-mails e tráfego. Não há promessa de IA ilimitada ou infraestrutura gratuita sem limites. Antes de abrir cadastros amplamente, configure e-mail transacional, proteção contra abuso e exclusão de conta, e conclua testes de integração em produção.
