# Auditoria de exposição de credenciais — 21/10/2026

## Resultado

Não foram encontrados padrões conhecidos de credenciais privadas nos arquivos versionados examinados, nas versões históricas de texto ou nos arquivos gerados pelo build local. A checagem não imprime valores de credenciais. Esse resultado descreve o escopo verificado; não certifica ausência de toda vulnerabilidade.

A interface foi compilada com a configuração pública real fornecida pelo mantenedor, sem copiar os valores para este relatório. As fotografias atualizadas de alecrim, avenca, zamioculca, cheflera e ficus-lira estão no repositório; o padrão de exploração prioriza vasos e pequenos espaços.

## O que aparece no navegador

| Informação                              | Situação                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Project URL do Supabase                 | Pública por projeto.                                                                                                                    |
| Chave `Publishable` do Supabase         | Pública por projeto; não é credencial administrativa.                                                                                   |
| Token de sessão do usuário autenticado  | Necessário ao cliente para operar em nome do usuário; mantido pelo SDK no navegador. Não deve ser compartilhado.                        |
| `service_role` / chave Secret           | Não encontrada como valor no frontend ou no build. A função de servidor lê a credencial administrativa do ambiente Supabase em runtime. |
| Senha SMTP                              | Não está implementada no frontend. Deve ser configurada somente no SMTP do Supabase.                                                    |
| Chave privada de identificação botânica | Não existe integração dessa API nesta versão. Uma futura chave deve ficar em função de servidor.                                        |

Guardar um valor em GitHub Secrets ou em `.env` não impede que ele entre no frontend quando o código o incorpora no build. Qualquer `VITE_*` consumida pela interface deve ser tratada como pública. O workflow injeta apenas as duas configurações públicas do Supabase. A validação de build rejeita chave Secret, JWT legado e URL com credenciais no campo de configuração pública.

A segurança do Supabase depende de RLS, permissões das funções e políticas do Storage, não de esconder a Publishable key nem de restringir apenas a interface. O token do próprio usuário existe no navegador; proteção contra XSS e cuidado com dispositivos compartilhados continuam necessários.

## Evidências locais

- Somente `.env.example` está versionado; `.env.local` está ignorado.
- Build concluído e sem mapas de código-fonte publicados em `dist/`.
- Nenhum achado na verificação por padrões aplicada ao código, histórico e build.
- `npm audit`: nenhuma vulnerabilidade conhecida reportada nas dependências instaladas na consulta desta auditoria.
- Testes de configuração e de detecção de credenciais passaram.
- As políticas SQL foram executadas em PostgreSQL local com testes de isolamento, bloqueio de leitura anônima, fotos por proprietário e controle de revisão.

O comando reproduzível é:

```sh
npm ci
npm test
npm run build
npm run audit:public -- --history
```

A publicação agora executa `npm run audit:public` depois do build e antes do upload dos artefatos. A checagem cobre padrões conhecidos de chaves privadas, tokens de provedores, JWT administrativo e literais de senhas; ela não reconhece qualquer segredo arbitrário e não substitui análise humana.

## Verificações no serviço Supabase real

Usando apenas a configuração pública, sem criar contas nem enviar e-mails:

- O serviço Auth respondeu: cadastro habilitado e confirmação de e-mail obrigatória.
- Uma tentativa anônima de ler `gardens` foi rejeitada com HTTP 401, código PostgreSQL `42501` (permissão negada).
- A função `delete-account` respondeu HTTP 404, `NOT_FOUND`: a função ainda precisa ser publicada e testada no projeto remoto.

O teste anônimo não substitui o teste com duas contas reais tentando acessar os dados uma da outra. O acesso aos valores dos Secrets do GitHub, ao SMTP e às configurações administrativas do Supabase não estava disponível nesta auditoria. Não é necessário compartilhar esses valores em chat.

## Pendências e limites

1. **Publicar a função de exclusão de conta**, configurar a origem permitida e testar remoção de usuário, jardim e fotos no projeto real.
2. **Configurar e validar envio externo de e-mails**. Com o SMTP padrão, pessoas fora da equipe podem não receber confirmação; não desabilitar a confirmação para contornar esse limite.
3. **Validar isolamento com duas contas reais** e testar recuperação e exclusão antes de uma abertura ampla.
4. **Adicionar cotas por usuário e proteção contra abuso de uploads** antes de divulgar amplamente. As políticas atuais isolam os arquivos e limitam cada foto a 2 MB, mas não implementam uma cota total de armazenamento por usuário.
5. O ambiente de auditoria bloqueou o acesso ao domínio do site publicado. Portanto, o conteúdo exato entregue pelo GitHub Pages e seus cabeçalhos não foi verificado remotamente; o build local e o repositório foram verificados.

O rascunho do ambiente recebeu os domínios necessários à conferência da publicação e das alternativas de e-mail. Salvar um rascunho não demonstra aplicação da política em runtime nem publicação do site.
