# Primeira versão do produto

Documento de planejamento para revisão. As funcionalidades descritas aqui representam o produto proposto, não uma declaração de que já estão implementadas ou liberadas para uso comercial.

## Objetivo e público

Criar uma comunidade para pessoas que cultivam plantas em apartamentos e casas pequenas. O produto reúne um jardim pessoal privado, troca de experiências e descoberta de negócios locais.

Começar por São Leopoldo, Novo Hamburgo, Esteio e Sapucaia do Sul, no Rio Grande do Sul. Expandir para Porto Alegre depois de observar uso recorrente e capacidade de manter o diretório e a moderação.

A hipótese de negócio é que a combinação entre acompanhamento das plantas, aprendizado com a comunidade e descoberta de lojas incentive o retorno. Assinatura opcional e parcerias identificadas com lojas são possibilidades a validar; ainda não são recursos de cobrança nem contratos comerciais.

## Escopo da primeira versão

| Área             | Experiência prevista                                                            | Critério para considerar concluída                                                                |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Conta            | Criar conta, confirmar e-mail, entrar, recuperar senha e excluir conta          | Fluxos reais testados, incluindo remoção do jardim e dos arquivos                                 |
| Perfil           | Apelido, foto, apresentação curta e cidade opcional                             | E-mail, telefone e dados de autenticação não aparecem no perfil comunitário                       |
| Jardim           | Cadastrar, editar e excluir plantas, fotos, data de aquisição, notas e cuidados | Dados privados por proprietário e acesso consistente em dois aparelhos                            |
| Compartilhamento | Criar publicação com texto e uma foto, opcionalmente associada a uma planta     | O usuário escolhe o que compartilhar; notas e histórico privados não são copiados automaticamente |
| Feed             | Publicações recentes, comentários e curtidas                                    | Paginação, autorização no servidor, edição e exclusão do conteúdo próprio                         |
| Comunidade       | Denunciar conteúdo e bloquear usuários                                          | Denúncias privadas, tratamento de bloqueios e painel de moderação funcional                       |
| Lojas            | Consultar estabelecimentos por cidade e proximidade                             | Informações verificadas, cobertura identificada e funcionamento sem permissão de localização      |
| Privacidade      | Controlar dados e solicitar exclusão                                            | Avisos claros, retenção definida, proteção contra acesso entre contas e exclusão validada         |

O feed começa em ordem cronológica, sem recomendação algorítmica. O piloto da comunidade exige conta com e-mail confirmado. Conteúdo compartilhado fica visível aos membros autorizados; não será disponibilizado para indexação ou leitura pública anônima sem uma decisão explícita sobre essa mudança.

O diretório de lojas pode ser consultado sem conta. As cidades cobertas e a data de verificação de cada estabelecimento ficam claras.

## Navegação e telas

### Início

Apresenta a proposta, oferece criar conta ou entrar e permite conhecer o diretório. Explica a distinção entre jardim privado e publicações para a comunidade.

### Meu jardim

Mostra as plantas da conta, busca, última rega e próximos cuidados para conferir. A tela de uma planta reúne fotos, informações e diário. O botão de publicação abre um formulário separado: registrar um cuidado não cria um post.

### Comunidade

Mostra o feed paginado. Cada publicação apresenta autor, data, texto, imagem, comentários e curtidas. Ações de denúncia e bloqueio são acessíveis. Estados de feed vazio, carregamento, falha e conteúdo removido devem ser desenhados e testados.

### Perfil

Mostra apenas os dados escolhidos para a comunidade e suas publicações permitidas. A edição do próprio perfil é separada das configurações da conta. O jardim pessoal não aparece no perfil de outro usuário.

### Lojas próximas

Oferece primeiro seleção de cidade, com opção de autorizar localização para ordenar resultados por distância. Uma ficha informa nome, endereço comercial, contato, horários quando verificados, fonte e data da atualização.

A versão inicial usa um diretório cadastrado e revisado, sem afirmar que lista todas as lojas existentes. Não exige uma API paga de mapas nem cadastro de localização residencial. A posição exata do usuário não é salva no perfil; o diretório continua utilizável se ele negar a permissão.

### Conta e privacidade

Reúne acesso, recuperação, exportação e exclusão, preferências disponíveis e explicação de como os dados são usados. Credenciais e links de acesso nunca são solicitados por feedback ou suporte em issues públicas.

### Moderação

Área restrita para analisar denúncias, ocultar conteúdo e aplicar suspensão com justificativa registrada. As permissões de moderador são atribuídas pelo servidor, fora dos campos editáveis de perfil.

## Fluxos principais

1. **Entrar na comunidade:** abrir a URL → criar conta → ler o aviso de confirmação → confirmar e-mail → completar perfil opcional → acessar jardim e comunidade.
2. **Acompanhar uma planta:** adicionar foto e informações → salvar no jardim privado → registrar cuidado → conferir o diário em outro aparelho.
3. **Compartilhar evolução:** escolher criar publicação → selecionar uma foto para compartilhar e escrever texto → revisar visibilidade → publicar → acompanhar comentários. A cópia compartilhada possui regras e ciclo de exclusão próprios, sem tornar público o arquivo privado original.
4. **Encontrar uma loja:** selecionar cidade ou autorizar localização → consultar resultados cadastrados → abrir ficha → acessar contato ou rota em serviço externo. Dados de localização não entram em URLs públicas de perfil nem em logs desnecessários.
5. **Tratar conteúdo inadequado:** denunciar → registrar denúncia privada → moderador analisa → conteúdo é mantido, ocultado ou removido com registro. O autor não recebe a identidade de quem denunciou.
6. **Excluir dados:** confirmar a ação → revogar acesso → remover arquivos e registros vinculados conforme a política → informar o resultado. A política de backups e eventual retenção de evidências precisa ser definida antes do piloto; a exclusão não deve ser anunciada como instantânea ou completa se houver dados retidos.

## Modelo de dados proposto

Esta é a estrutura conceitual; as migrações e os testes vêm depois da revisão. Preservar os dados existentes durante qualquer alteração.

| Entidade               | Dados principais                                                  | Visibilidade                                                                    |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Conta de autenticação  | ID, e-mail verificado e credenciais geridas pelo provedor         | Privada; não duplicar e-mail no perfil público                                  |
| Perfil                 | ID da conta, apelido, apresentação, avatar e cidade opcional      | Membros autorizados no piloto; campos pessoais não são obrigatórios             |
| Jardim e plantas       | Proprietário, espécie, foto, aquisição e notas                    | Somente proprietário                                                            |
| Cuidados               | Planta, tipo e data                                               | Somente proprietário                                                            |
| Publicações            | Autor, texto, referência opcional à planta e imagem compartilhada | Comunidade autorizada, sujeita a moderação e bloqueios                          |
| Comentários e curtidas | Publicação e autor                                                | Mesmo limite de acesso da publicação; unicidade da curtida por conta            |
| Bloqueios              | Conta que bloqueou e conta bloqueada                              | Privados; aplicados às consultas e interações autorizadas                       |
| Denúncias              | Denunciante, conteúdo, motivo e estado                            | Denunciante vê seus próprios registros; moderadores recebem apenas o necessário |
| Lojas e cidades        | Endereço comercial, contato, coordenadas do negócio e verificação | Diretório público; escrita restrita à administração                             |
| Papéis e auditoria     | Permissões de equipe e ações administrativas                      | Somente administração autorizada; fora do perfil editável                       |

Avaliar normalizar o jardim atual, hoje armazenado como um documento por conta, em plantas e cuidados separados. A decisão deve considerar edição concorrente, consultas e migração reversível. Não reescrever o banco de produção sem uma migração validada e backup restaurável.

Manter o núcleo de dados em PostgreSQL e separar adaptadores de autenticação, arquivos e mensagens. Isso facilita uma migração futura, mas contas, sessões, políticas e fotos continuam exigindo trabalho próprio caso o provedor mude.

## Regras de acesso

| Recurso                  | Visitante            | Membro                                      | Proprietário / autor                                    | Moderação do produto                      |
| ------------------------ | -------------------- | ------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| Diretório publicado      | Consultar            | Consultar                                   | Consultar                                               | Administrar com permissão específica      |
| Jardim privado           | Sem acesso           | Sem acesso a jardins alheios                | Consultar e alterar o próprio                           | Sem acesso por função de moderação        |
| Perfil comunitário       | Sem acesso no piloto | Consultar campos permitidos                 | Editar campos permitidos                                | Ocultar ou restringir com justificativa   |
| Publicação e comentários | Sem acesso no piloto | Consultar e interagir conforme regras       | Editar ou excluir o próprio conteúdo                    | Ocultar ou remover com justificativa      |
| Foto de jardim           | Sem acesso           | Sem acesso a fotos alheias                  | Consultar e administrar as próprias                     | Sem acesso por função de moderação        |
| Foto compartilhada       | Sem acesso no piloto | Consultar se a publicação estiver acessível | Administrar via publicação                              | Administrar via procedimento de moderação |
| Denúncia                 | Sem acesso           | Criar e acompanhar a própria                | Sem acesso à identidade de denunciantes de seu conteúdo | Analisar com acesso restrito              |
| Papel administrativo     | Sem acesso           | Sem escrita                                 | Não pode atribuir papel a si mesmo                      | Atribuição separada e auditada            |

As regras devem ser aplicadas no banco e no backend. Esconder botões não protege uma operação. O acesso operacional à infraestrutura é diferente do papel de moderador: contas administrativas do provedor precisam de autenticação forte, acesso mínimo e registro de uso.

Na implementação, definir e testar o efeito do bloqueio sobre feed, perfis e comentários. Bloqueio não é garantia de impedir contato fora da plataforma, capturas de tela ou criação de outra conta.

## Segurança e operação para o piloto

- Confirmar e-mail; testar recuperação e exclusão com destinatário externo à equipe.
- Manter chaves administrativas e de provedores no backend em runtime. A chave Publishable do Supabase e a URL são públicas; nenhuma credencial privada deve entrar no build.
- Separar arquivos de jardim e arquivos compartilhados, com políticas próprias. No piloto, uma foto comunitária também não deve ter uma URL pública permanente que ignore as regras da publicação.
- Validar tamanho, formato, autorização e cotas no servidor. O redimensionamento no navegador ajuda, mas não substitui a validação do upload. Não aceitar SVG ou conteúdo executável como foto.
- Reduzir metadados de localização das imagens. Ao transferir uma foto privada para publicação, usar o fluxo validado e não somente publicar seu caminho original.
- Definir limites para cadastro, publicação, comentários, curtidas, buscas e armazenamento. Validar verificação de URLs de lojas e links externos sem executar conteúdo fornecido por usuários.
- Proteger a administração com MFA, permissões mínimas e auditoria; não usar papéis editáveis pelo cliente.
- Separar desenvolvimento, teste e produção. Nunca usar dados reais dos usuários em fixtures, screenshots públicos ou issues.
- Manter backups do banco e das fotos e testar restauração. O backup do banco sozinho não recupera os arquivos do Storage.
- Definir regras da comunidade, tratamento de denúncias, contato de suporte, aviso de privacidade e retenção de dados. Decidir o tratamento de menores antes de permitir seu cadastro.
- Monitorar erros e consumo sem registrar senhas, tokens, conteúdo privado ou localização precisa desnecessária.

Esses controles reduzem riscos; não são promessa de ausência de vulnerabilidades. Revisar com testes e evidências antes de abrir o produto.

## Infraestrutura e investimento

A proposta inicial é hospedagem comercial da interface, Supabase gerenciado para o backend, domínio próprio e provedor de e-mail com remetente autenticado. Confirmar os planos e suas condições antes da contratação. O GitHub Pages atual é a hospedagem do protótipo, não a escolha para operar o SaaS comercial.

Usar a faixa previamente discutida de R$ 200–250 mensais como referência de planejamento, sujeita à definição final do orçamento, câmbio, impostos, consumo, número de ambientes e fornecedores. Domínio é uma contratação anual separada. Não há autorização automática para compras, assinaturas ou cobranças.

Configurar alertas e limites na aplicação; verificar quais limites de cobrança cada provedor realmente oferece. Não assumir que um alerta representa um teto de gasto.

## Evoluções e trabalhos já iniciados

- O protótipo possui conta, jardim, diário e catálogo; revisar suas capacidades no código e no ambiente real antes de reutilizar.
- O PR de lembretes é um trabalho separado e ainda incompleto. Não integrar junto com este planejamento nem anunciar envio ativo. Canal, provedor, fila, consentimento e cotas precisam de definição e validação. A antiga preferência por gratuidade não é mais uma restrição geral do produto; investimento continua dependente de orçamento aprovado.
- Identificação por foto e análise de ambientes continuam na visão do produto, com avaliação de precisão, consentimento, fontes e custo. Confirmar sua prioridade no escopo do piloto antes de escolher uma API.
- Mensagens privadas, vídeos, marketplace, pagamento entre usuários, anúncios automatizados e aplicativo nas lojas ficam para avaliação posterior.
- Monetização vem depois da validação de valor: considerar assinatura opcional e parcerias claramente identificadas, preservando a confiança da comunidade. Não vender acesso a dados pessoais como parte da proposta.

## Etapas e evidências de conclusão

| Etapa          | Entrega revisável                                                          | Evidência para avançar                                                            |
| -------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1. Produto     | Este escopo, fluxos, telas e regras                                        | Revisão das prioridades, visibilidade da comunidade e limites do piloto           |
| 2. Arquitetura | Revisão do código, diagrama, esquema e plano de migração                   | Reuso definido; ameaças e permissões testáveis; preservação dos dados atuais      |
| 3. Operação    | Planos escolhidos, DNS, e-mail, ambientes, backups e moderação             | Aprovação concreta das contratações; e-mail externo e restauração testados        |
| 4. Construção  | PRs pequenos para contas/perfis, jardim, comunidade, lojas e administração | Testes e verificações de cada fluxo; nenhuma publicação por PR sem integração     |
| 5. Segurança   | Testes locais e no serviço real, inclusive duas contas e um moderador      | Acesso cruzado negado, limites aplicados, exclusão e recuperação validadas        |
| 6. Piloto      | Grupo pequeno convidado por canal privado                                  | Cadastro e uso sem assistência, feedback anonimizado, erros e custos acompanhados |

Critérios mínimos do piloto: criar conta, confirmar e-mail, cadastrar planta e foto, registrar cuidado, criar perfil, publicar deliberadamente, comentar, denunciar, bloquear, encontrar uma loja e excluir a conta. Validar também que negar localização não impede a busca por cidade.

Antes do piloto, registrar as decisões sobre nome/domínio, orçamento efetivo, política para menores, retenção de backups e papéis de moderação. Não é necessário fornecer senhas ou credenciais privadas no chat para revisar este plano.
