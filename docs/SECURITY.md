# Segurança e privacidade

## Repositório e publicação

- Código, histórico e artefatos do frontend são públicos. `.gitignore` não esconde arquivos já versionados nem apaga histórico.
- Credenciais administrativas, senha do banco e dados pessoais nunca pertencem ao frontend, ao Git, a issues ou a logs.
- A URL de Supabase e a chave Publishable são públicas. A segurança das contas depende de RLS e das políticas de Storage, não do sigilo dessa chave.
- Variáveis `VITE_*` são incorporadas ao bundle. Use somente valores públicos nelas.
- Backups `meu-jardim-*.json`, `.env`, arquivos de credenciais e pastas `backups/`, `private/` e `uploads/` são ignorados. Confira `git status` antes de publicar.
- Use a identidade genérica do projeto ou o e-mail noreply do GitHub nos commits. Verifique nome e e-mail do autor e committer para não republicar metadados pessoais.
- Os workflows fixam versões de Actions por SHA e limitam permissões. Dependabot propõe atualizações; revise antes de incorporar.

## Dados da aplicação

No modo local, os dados e fotos ficam no IndexedDB do navegador, sem criptografia própria ou login. Quem usa o mesmo perfil do navegador pode acessar esse jardim.

No modo de conta, autenticação é tratada pelo Supabase Auth. O frontend não armazena senhas em tabelas próprias. Jardins e fotos ficam vinculados ao ID da conta; fotos usam bucket privado e download autenticado. Sessões são mantidas pelo SDK no navegador: evite dispositivos compartilhados e use sair após o uso.

Dados locais não são enviados automaticamente para uma conta. A importação precisa ser solicitada pelo usuário. Ao sair ou trocar de conta, o estado do jardim anterior é desmontado; falhas de rede não redirecionam silenciosamente para outro conjunto de dados.

Não há identificação por IA ou envio de fotos a serviços de análise nesta etapa. A futura integração deve passar por função de servidor, com limites de upload e requisições, consentimento informado e descrição do fornecedor que receberá as imagens.

## Critérios para lançamento público

Conclua testes de isolamento com duas contas no Supabase real, confirmação e recuperação de e-mail, CAPTCHA/rate limits, exclusão da conta e seus arquivos, privacidade e retenção de dados, revisão editorial das fichas e acompanhamento das cotas. Testes locais de SQL não comprovam sozinhos a configuração do projeto remoto.

Se uma credencial secreta vazar, revogue-a ou troque-a antes de remover referências do Git. URLs antigas, caches e clones podem preservar versões anteriores. Para relatar um problema, use um canal privado do mantenedor no perfil do GitHub, sem postar segredos em issues públicas.
