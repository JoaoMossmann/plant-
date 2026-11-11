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

Execute `supabase/checks/security_inventory.sql` no SQL Editor para consultar configuração, sem dados pessoais. O resultado é uma linha JSON com todas as seções; use Export para salvar o resultado completo. Revise presença das tabelas, RLS, permissões, políticas e gatilhos; a consulta não certifica segurança automaticamente. Confirme também isolamento com duas contas de teste pelas APIs reais. Não publique tokens ou resultados que revelem configurações internas. O fluxo de fotos protegidas depende da implantação descrita abaixo.

## Fotos protegidas

O fluxo novo é optativo durante a migração. Primeiro publique `plant-photos` em homologação, com `ALLOWED_ORIGINS` contendo as origens HTTPS exatas da interface de testes. A função usa somente credenciais nativas do servidor (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); não copie esses segredos para o frontend. `verify_jwt=false` desliga apenas a verificação legada do gateway: a função valida toda sessão com `auth.getUser` e as RPCs verificam identidade e permissões novamente. Aplique depois `202611100001_protected_photos.sql`, dependente das quatro migrações anteriores. Ative `VITE_SERVER_PHOTOS_ENABLED=true` somente no build conectado a esse banco e valide os dois usuários. Repita em produção apenas após revisão e validação; merge e deploy do frontend não publicam função nem executam SQL. Mantenha a variável ausente/false no site atual até essa implantação coordenada. O modo novo não faz fallback para Storage.

As cotas iniciais são 100 objetos e 50 MB por conta, com teto do bucket de 5.000 objetos e 500 MB. Cada upload reserva 2 MB antes da leitura/decodificação, contando fotos antigas, órfãs e reservas. Uploads: saldo de 5, reposição de 5/minuto e 50/dia; leituras: 120, 120/minuto e 10.000/dia; lotes de remoção: 20, 20/minuto e 1.000/dia. Dias em UTC. São limites deste fluxo, sem garantia de teto para custos de tráfego, Auth ou outros serviços. Cada arquivo tem até 2 MB; novos JPEG/PNG estáticos aceitam lados de até 1.600 px e 1,5 milhão de pixels, saem em JPEG com lado máximo de 1.000 px e sem reaproveitar metadados. A interface converte WebP antes do novo upload; fotos WebP antigas continuam legíveis. Os codecs usam as licenças MIT de `jpeg-js` e `pngjs`.

A retirada de uma foto do jardim registra seu bloqueio no mesmo commit, e a atualização do jardim retenta remoções pendentes em lotes. O gateway valida esse bloqueio/existência em cada leitura, não entrega URL assinada e responde por POST com `no-store`. URLs diretas antigas já em cache não são purgadas retroativamente, e cópias baixadas/backup permanecem fora desse controle. Exclusão de conta continua removendo objetos antes de apagar o usuário; reservas, bloqueios e contadores são removidos por cascata.

Falhas incertas de upload preservam reservas para não liberar espaço enquanto o envio pode terminar. Isso pode exigir manutenção: após encerrar requisições pendentes, conferir a existência dos objetos pela API do Storage e reconciliar reservas com `finish_photo_reservation` usando somente uma credencial de servidor. Nunca apague metadados de `storage.objects` diretamente. Órfãos sem referência continuam consumindo cota, sem coleta automática por idade. Antes da migração, confira se cada `photoPath` salvo aponta para um objeto existente e revise políticas extras que possam liberar o Storage. Após aplicar, confirme pelas APIs que leitura/upload/remoção diretos estão bloqueados, cache e isolamento funcionam, limites são respeitados e exclusão/recuperação foram testadas. Os testes locais não substituem essa validação no Edge Runtime hospedado.

## Exclusão de conta

A migração `202611110001_account_deletion.sql` depende das cinco anteriores. Aplique em homologação antes de publicar a nova `delete-account`, que valida sessão, confirmação e senha atual no servidor. A interface pede a senha novamente, não a persiste e limpa o campo após cada tentativa. A RPC de autorização limita a três tentativas iniciais, reposição de uma a cada cinco minutos e dez por dia em UTC, inclusive para senhas recusadas. Somente o backend pode marcar uma conta para remoção. O fluxo atual atende contas com e-mail/senha; novos provedores de login exigirão uma alternativa de reautenticação.

Reservas sem objeto impedem iniciar a exclusão: aguarde o envio terminar ou reconcilie reservas incertas conforme a seção de fotos. Ao iniciar, um bloqueio persistente impede novos uploads, gravações e leituras privadas e retira o perfil da comunidade. Arquivos, inclusive legados em subpastas, são removidos antes do usuário no Auth; os registros associados são removidos por cascata. Falhas preservam o bloqueio e permitem nova tentativa autenticada. Não remova o bloqueio manualmente para contornar uma falha. Teste com contas descartáveis confirmação, senha incorreta, uploads pendentes, acesso de outro usuário, remoção e limpeza dos dados, além das limitações de cache e backups já descritas.
