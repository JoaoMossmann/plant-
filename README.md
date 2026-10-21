# Jardim pessoal (nome provisório)

Uma primeira versão gratuita e sem backend para cuidar das plantas. React + Vite, responsiva e em português.

## O que já funciona

- Cadastro, edição e exclusão de plantas com foto, apelido, espécie, data de aquisição e observações.
- Fotos da galeria ou câmera, conforme as opções do dispositivo; redimensionamento local.
- Registro de regas e cuidados, diário e lembretes de conferência do solo ao abrir o site.
- Catálogo editorial de 12 espécies, filtros por região de cultivo, luz e segurança para cães e gatos.
- Sugestões para ambientes com base em respostas sobre luz, região e animais. A foto opcional é apenas uma referência visual, não é analisada.
- Persistência local em IndexedDB e exportação/importação de backup JSON. Importar adiciona plantas novas e preserva registros com IDs já existentes.

## Limitações desta versão

Não há login, sincronização entre dispositivos, identificação por IA, catálogo mundial completo, notificações com o site fechado ou análise automática de ambientes. Fotos e cadastros ficam apenas no navegador usado (não no GitHub). Limpar os dados do navegador pode apagar o jardim. Exporte backups regularmente. Compartilhar a URL não compartilha o jardim; cada navegador começa vazio. A foto de ambiente é temporária e não entra no backup. Não há analytics nem envio de fotos a terceiros.

Os intervalos de rega são pontos de partida para conferir o solo. Clima, vaso, substrato e estação mudam as necessidades. O filtro regional indica possibilidades de cultivo com proteção adequada, não distribuição nativa nem garantia de adaptação. Não tóxica não significa comestível. Confirme a espécie e procure um veterinário em caso de ingestão. Fonte inicial de toxicidade: https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants . Recomendações de cultivo precisam de revisão horticultural antes de um lançamento amplo.

## Rodar localmente / VS Code

Instale Node.js 24 LTS. Abra esta pasta no VS Code e execute no terminal:

```sh
npm ci
npm run dev
```

O terminal informa o endereço local. Para validar:

```sh
npm test
npm run build
npm run preview
```

Não são necessárias chaves ou variáveis de ambiente. `dist/` é o resultado publicável. Não envie backups ou fotos pessoais ao Git.

## Publicar gratuitamente com GitHub Pages

1. Envie o projeto à branch `main` de `usuario/plant-`.
2. No GitHub, abra **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Abra **Actions → Publicar site no GitHub Pages → Run workflow → main** (ou envie um novo commit).
4. Aguarde os jobs `build` e `deploy` concluírem. O endereço publicado aparece em **Settings → Pages** e no ambiente `github-pages`.
5. Abra a URL no celular e no computador. Cadastre uma planta e faça um backup para validar seu uso real.

A configuração `base: './'` permite hospedar os arquivos sob o caminho do repositório. A URL esperada é `https://usuario.github.io/plant-/`, mas só estará disponível depois de uma publicação bem-sucedida. GitHub Pages oferece hospedagem gratuita para repositórios públicos; repositórios privados dependem do plano. Antes de tornar um repositório público, confira se não há dados pessoais ou segredos.

Alternativas: Cloudflare Pages (comando de build `npm run build`, pasta `dist`) e Vercel (preset Vite). Os serviços têm planos gratuitos sujeitos aos termos e limites vigentes; confirme-os antes de escolher. Não é necessário comprar domínio: use o subdomínio oferecido pela hospedagem.

## Próximas etapas sugeridas

1. Testar com as plantas reais e ajustar os intervalos individualmente.
2. Login + banco e armazenamento de fotos (por exemplo Supabase) para sincronizar aparelhos. Configurar autenticação, políticas por usuário e limites de uploads antes de armazenar dados.
3. Identificação botânica por foto com API especializada (por exemplo Pl@ntNet), em uma função de servidor; verificar elegibilidade, cota e termos atuais. Nunca colocar uma chave secreta no frontend. Mostrar candidatos e confiança e pedir confirmação da espécie.
4. Recomendações de ambientes com foto e perguntas sobre horas de sol, orientação da janela e clima. Uma foto isolada não mede luminosidade ao longo do dia.
5. Notificações e lembretes configuráveis, exigindo permissão do usuário e infraestrutura para envio com o site fechado.
6. Expandir catálogo com fontes botânicas, licenças das imagens e revisão profissional de toxicidade e cultivo.

Não há garantia de IA ilimitada gratuita. A versão local pode operar sem custos de backend; sincronização, armazenamento e análise de imagens ficam sujeitos às cotas dos provedores.
