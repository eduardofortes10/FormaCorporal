# Vercel + Supabase

A versão Node + SQLite não funciona como banco persistente em funções da Vercel. Esta configuração publica o frontend e usa Supabase Auth e PostgreSQL para os dados. O servidor local continua disponível com `npm start`.

## 1. Criar o banco

1. Crie uma conta em https://supabase.com e um projeto gratuito.
2. Guarde a senha do banco de forma privada. Ela não precisa ser enviada ao GitHub nem colocada no frontend.
3. No **SQL Editor**, execute o conteúdo de `supabase/migrations/001_assessments.sql` uma vez. A migração cria a tabela, as regras por usuário e a função de gravação com controle de versão.
   Depois execute `supabase/migrations/002_experience.sql` para ativar contexto das medições, metas, lembretes e fotos privadas. Se a primeira migração já foi aplicada, execute **somente a 002**. Ela preserva as avaliações existentes e pode ser reaplicada.
4. Em **Connect** ou **Settings → API**, copie a Project URL e a chave **publishable** (ou a antiga **anon**). Nunca use `service_role` ou `sb_secret_...`.

## 2. Configurar a Vercel

O repositório contém `vercel.json`. Configure o projeto com:

- Root Directory: raiz do repositório, sem subpasta.
- Framework Preset: Other.
- Build Command: `npm run build`.
- Output Directory: `vercel-dist`.
- Node.js: 24.x.
- Variáveis de ambiente: `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`.

Ative as variáveis nos ambientes desejados, Production e/ou Preview. Em seguida faça **Redeploy**: as variáveis públicas são incorporadas ao build. O build rejeita chaves secretas reconhecidas, evitando publicá-las por engano.

Sem essas variáveis, o frontend pode ser publicado, mas exibe “Configuração pendente” e não permite usar o armazenamento. Isso não significa que o banco esteja pronto.

## 3. Configurar o login

No Supabase, em **Authentication → URL Configuration**, informe o domínio de produção na **Site URL** e adicione-o às URLs de redirecionamento permitidas. Autorize separadamente os endereços de Preview usados para testes. Prefira o domínio estável do projeto em vez de uma URL de deployment que muda a cada build.

Com confirmação de e-mail ativa, o cadastro pede que a pessoa confirme o e-mail antes de entrar. Configure o envio de e-mails/SMTP conforme os limites do Supabase; o remetente padrão pode restringir os destinatários e não deve ser pressuposto como serviço de e-mail público pronto. O controle de novos cadastros desta versão é feito no painel do Supabase, não pela variável local `ALLOW_REGISTRATION`.

O SDK gerencia a sessão no navegador e envia o token ao Supabase. Esta versão não usa o cookie HttpOnly da implementação Node local. As regras RLS verificam o usuário autenticado; a chave pública não concede acesso às avaliações de outras contas.

## 4. Conferir o funcionamento

- Crie duas contas de teste e confirme os e-mails conforme a configuração.
- Salve uma avaliação, recarregue e entre em outro dispositivo.
- Confirme que a segunda conta não enxerga os dados da primeira.
- Teste importação, edição e exportação JSON.

As medidas são validadas no PostgreSQL; o BF derivado é recalculado no frontend a partir das medidas ao ler e salvar. Não use um valor de BF armazenado como fonte independente das dobras. O SQL impede gravações de outro usuário e usa transação e revisão para evitar sobrescritas silenciosas.

## Migração de dados e diferenças

Contas locais SQLite não são transferidas automaticamente para Supabase Auth. Cada pessoa cria sua nova conta, exporta as avaliações da versão anterior e importa o JSON. Dados antigos no mesmo navegador/origem podem ser importados pela faixa de migração. Domínios diferentes não compartilham localStorage.

O backup SQLite de `npm run backup` continua válido apenas para a versão Node. No Supabase, exporte seu histórico JSON e configure backups do PostgreSQL conforme o plano/ambiente contratado.

## Quando um link pede login na Vercel

Isso é **Deployment Protection**, anterior ao aplicativo. O login da Vercel é separado do login do Forma. Confira o deployment log no painel para o erro exato e use o domínio de produção autorizado para testar. Não é necessário remover a proteção para preparar o código.

## Verificação desta entrega

O build, a integração da interface e a migração PostgreSQL podem ser testados localmente. A ativação e os testes no projeto Supabase real dependem da criação do projeto, execução do SQL e configuração das variáveis. `npm test` mantém os testes da versão Node; `npm run test:cloud` cobre o adaptador e as regras PostgreSQL em um banco de teste PGlite.

## Atualização: abas, metas e fotos

Para um projeto já em funcionamento:

1. Abra `supabase/migrations/002_experience.sql` no repositório e copie **todo o arquivo**.
2. No projeto Supabase, abra **SQL Editor → New query**, cole o conteúdo e clique em **Run**. Não execute novamente a migração 001.
3. Aguarde o deploy do código atualizado na Vercel e atualize a página.
4. Crie uma meta e um lembrete, recarregue e confira a persistência. Envie uma foto de teste na aba Fotos e teste a exclusão. Uma segunda conta deve ter a própria galeria vazia.

A migração adiciona `user_preferences`, funções com revisão para evitar sobrescrita entre dispositivos, contexto opcional às avaliações e o bucket **privado** `progress-photos`. A pasta de cada foto é o UUID do usuário; políticas RLS limitam leitura, envio e exclusão à própria conta. Links de visualização duram 60 segundos. Não torne o bucket público. O SQL verifica limite de 40 objetos por conta, e o bucket aceita apenas JPEG até 1 MiB. A interface converte imagens no navegador, reduz a dimensão maior a 1400 px e não preserva EXIF.

O backup JSON existente contém avaliações e contexto; **não inclui metas, lembretes ou fotos**. As fotos podem ser baixadas individualmente. Na versão Node local, o backup SQLite inclui também preferências e imagens. O relatório usa a impressão do navegador: escolha **Salvar como PDF**; fotos e e-mail da conta ficam fora do relatório.

Lembretes são avisos no dashboard, sem envio de e-mail ou push. Metas não são recomendações clínicas. A conferência de alterações acima de 20% é uma regra de interface para encontrar possíveis erros de digitação, não um intervalo fisiológico; o usuário pode manter os valores.

`npm run test:experience` verifica etapas, contexto, comparação por região, consulta de pontos no gráfico, persistência de metas/lembretes, envio/leitura/exclusão de fotos, relatório, responsividade e limpeza no logout. `npm run test:cloud` aplica as duas migrações a um PostgreSQL local de teste, com esquema de Storage simulado, e testa isolamento e quota. Esses testes não substituem a verificação do serviço Storage no Supabase real.
