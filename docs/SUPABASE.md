# Ativar contas e sincronização

## 1. Preparar o banco e as fotos

No projeto Supabase, abra **SQL Editor → New query**, execute em ordem:

1. [Jardins privados](../supabase/migrations/202610210001_private_gardens.sql).
2. [Validação dos dados](../supabase/migrations/202610210002_validate_payload.sql).

Se já executou a primeira, rode apenas a segunda. Execute apenas uma vez em um projeto sem essas tabelas/políticas. Não desabilite RLS e não transforme o bucket de fotos em público.

A migração cria `gardens`, uma função transacional com controle de revisão e o bucket privado `plant-photos`. Cada usuário só pode ler seu jardim e seus arquivos. Não existe tabela de senhas própria; as credenciais são tratadas pelo Supabase Auth. A chave pública não concede acesso administrativo.

## 2. Configurar autenticação

Em **Authentication → Providers / Sign In**, habilite e-mail e senha. Mantenha a confirmação de e-mail ativa. Configure o tamanho mínimo da senha para pelo menos 12 caracteres; a interface exige esse mínimo no cadastro e na troca de senha.

Em **Authentication → URL Configuration**:

- **Site URL**: endereço HTTPS publicado pelo GitHub Pages, incluindo o caminho do projeto e a barra final.
- **Redirect URLs**: adicione o mesmo endereço exato. Para desenvolvimento, adicione separadamente a URL local informada pelo Vite. Evite curingas amplos em produção.

Confirmação e recuperação usam PKCE: abra o link no mesmo navegador/aparelho que iniciou o pedido. Solicite um novo link se o original expirar. Templates personalizados precisam preservar o link de confirmação fornecido pelo Supabase. Consulte a [documentação de senhas](https://supabase.com/docs/guides/auth/passwords).

Antes de abrir cadastros ao público, configure SMTP de um provedor transacional. O serviço de e-mails de teste do Supabase tem restrições e cotas; confira as condições atuais no painel. Configure rate limits para reduzir abuso. Antes de habilitar CAPTCHA no painel, adicione a integração do desafio à interface; ativar a exigência sem esse componente impede cadastro e login. Não considere o login pronto para lançamento antes de testar cadastro, entrega de e-mail e recuperação com um endereço real.

## 3. Conectar o GitHub Pages

No GitHub, entre em **Settings → Secrets and variables → Actions → Variables → New repository variable**. Adicione:

| Nome                            | Valor                                                            |
| ------------------------------- | ---------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Project URL do seu Supabase (`https://<project-id>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública com prefixo `sb_publishable_`                      |

São configurações públicas incorporadas ao JavaScript do navegador. Nunca use senha do banco, chave Secret ou `service_role` nesses campos. O controle de acesso depende das políticas no banco e no Storage.

Depois de criar as variáveis, execute novamente **Actions → Publicar site no GitHub Pages → Run workflow → main**. Variáveis adicionadas depois de um build exigem uma nova compilação. Confira se o site mostra o formulário de cadastro ao clicar em **Entrar / criar conta**.

## 4. Validar antes de divulgar

1. Crie uma conta A, confirme o e-mail, cadastre uma planta com foto e registre uma rega.
2. Entre com A em outro aparelho e confirme foto e histórico. Alterações aparecem depois de atualizar os dados ou entrar novamente.
3. Crie uma conta B em outro perfil de navegador: o jardim deve começar vazio e não mostrar dados de A.
4. No painel, confirme bucket privado e RLS habilitado. Teste também a API com o token de B tentando ler o jardim e uma foto de A; a leitura deve ser negada ou retornar vazia.
5. Teste recuperação de senha, sair e entrar novamente.
6. Exporte um backup, remova uma planta e importe o backup para verificar recuperação dos dados.
7. Abra o mesmo jardim em dois aparelhos, salve em um e tente salvar no outro sem atualizar. O segundo salvamento deve pedir atualização, sem apagar o primeiro.

Não use contas ou e-mails de terceiros para testes. Não comite tokens, e-mails ou arquivos com dados reais.

## Operação e próximos passos

Uploads são limitados a 2 MB por foto no bucket; a interface redimensiona imagens antes do envio. Somente JPEG, PNG e WebP são permitidos. Backups locais devem ser guardados fora do repositório.

Um upload pode ficar sem referência se a conexão cair durante o salvamento. Não apague arquivos em uso; uma rotina futura pode limpar apenas objetos comprovadamente órfãos. A revisão transacional evita sobrescrita silenciosa entre dispositivos.

Para habilitar **Excluir minha conta e dados**, publique a função `supabase/functions/delete-account` no projeto e configure o secret de servidor `ALLOWED_ORIGINS` com a origem HTTPS exata do site (sem o caminho do repositório). A função recebe as credenciais internas do Supabase no servidor; nunca coloque essas credenciais no GitHub Pages. Veja [Edge Functions](https://supabase.com/docs/guides/functions).

A função valida o token de sessão, exige confirmação explícita, remove os arquivos do usuário e só então exclui a conta. Jardins são removidos por cascade. Faça uma conta de teste com foto, exclua pelo site e confira Auth, banco e Storage. Backups do usuário e dados locais não são apagados. Sem publicar a função, o botão apresenta erro e a exclusão não é concluída.

Se ativar o serviço sem revisar URLs, e-mail, políticas e cotas, autenticação ou salvamento podem falhar. Mantenha o acesso restrito a testes até concluir a validação acima.
