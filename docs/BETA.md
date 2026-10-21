# Teste com quatro participantes

Objetivo: observar se as pessoas conseguem cadastrar uma planta e voltar para registrar cuidados sem ajuda. O teste inicial não é um lançamento comercial.

## Antes do convite

- Testar cadastro, confirmação e recuperação com um endereço que não pertence à equipe do projeto Supabase. O SMTP padrão do Supabase só atende endereços autorizados e tem limites reduzidos; configure SMTP próprio para receber participantes externos, mantendo confirmação de e-mail ativa.
- Validar isolamento com duas contas no projeto real, fotos privadas e a função de exclusão de conta. Os testes locais não substituem essa verificação.
- Conferir URLs exatas de redirecionamento, senha mínima e limites de requisições. Não desabilitar RLS, confirmação ou privacidade das fotos para contornar falhas.
- Acompanhar erros, armazenamento, tráfego e limites de e-mail no painel. Guardar backups e definir como responder a pedidos de exclusão.

## Roteiro sugerido

Durante uma semana, cada participante deve criar a própria conta, cadastrar duas plantas reais, escolher uma espécie no catálogo, enviar uma foto, registrar uma rega, consultar uma ficha e acessar pelo celular. Se possível, testar também em outro aparelho.

Pedir anotações sobre:

1. O que tentou fazer e o que esperava que acontecesse.
2. O que aconteceu de fato e em qual tela.
3. Modelo do aparelho e navegador.
4. Se a dificuldade impediu o uso ou foi apenas uma sugestão.

Não solicitar senhas, tokens, links de confirmação ou prints que exponham esses dados. Para screenshots de problemas, remover também o e-mail e outras informações pessoais. Não postar dados dos participantes em issues públicas. Reunir feedback por um canal privado e publicar no repositório apenas um resumo anonimizado.

Priorizar falhas de segurança e perda de dados, depois dificuldades de cadastro e cuidados, depois melhorias visuais. Registrar o que cada alteração deve resolver e testar novamente o fluxo afetado.

## Crescimento e custos

O banco do Supabase é PostgreSQL. Não é necessário migrar por atingir 100 contas: carga, tamanho das fotos, histórico e frequência de acesso importam mais que o número de cadastros. Consultar as cotas atuais em https://supabase.com/pricing e acompanhar uso real. Uma migração futura também deve tratar autenticação, arquivos, políticas de acesso e recuperação de dados, não apenas copiar tabelas.

## Monetização futura

Podem ser avaliadas assinatura por recursos adicionais, identificação por foto com cota e parcerias ou afiliação a lojas, sempre com transparência. Validar primeiro o uso recorrente e o custo de atendimento. Cobranças exigem um provedor de pagamentos e confirmação no servidor, sem armazenar números de cartão na aplicação.

O GitHub Pages não permite usá-lo para operar um negócio online ou fornecer um SaaS comercial. Antes de monetizar, mover a hospedagem da interface para um serviço cujo plano permita esse uso. A conta Supabase e seus dados podem ser mantidos, com ajuste dos redirecionamentos. Fonte: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits .

É possível monetizar um site sem aplicativo em lojas. Uma PWA pode ser uma evolução para instalação pelo navegador; publicação na App Store ou Google Play é uma decisão separada, com requisitos e custos próprios.
