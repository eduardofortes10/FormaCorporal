# Forma

Aplicação de acompanhamento corporal com contas individuais, avaliações por data, comparação de medidas, estimativa de BF e mapa interativo de dobras cutâneas.

Há duas opções de hospedagem: **Vercel + Supabase** (veja [VERCEL.md](VERCEL.md)) ou servidor Node.js + SQLite persistente (instruções abaixo). O aplicativo publicado anteriormente no Sites continua sendo uma versão separada. A versão Supabase exige criar o projeto, executar a migração SQL e configurar as variáveis na Vercel.

## Executar no computador

Requer **Node.js 24.x** e npm. Não é necessário instalar um banco separado.

```sh
npm ci
```

Copie `.env.example` para `.env`. No PowerShell:

```powershell
Copy-Item .env.example .env
npm start
```

Em Linux/macOS, use `cp .env.example .env`. Abra **http://localhost:3000** e crie sua conta. Não há usuário nem senha padrão. Para reiniciar o servidor automaticamente durante desenvolvimento: `npm run dev`.

Use exatamente o endereço definido em `APP_ORIGIN`. `localhost` e `127.0.0.1` são origens diferentes. Abrir `dist/index.html` diretamente ou usar somente um servidor estático não funciona nesta versão, pois o login e as avaliações dependem da API.

## O que está implementado

- Cadastro, login e logout por e-mail e senha; sessões de 7 dias em cookies HttpOnly.
- Senhas derivadas com scrypt e salt individual; tokens de sessão armazenados como hashes.
- Banco SQLite persistente, com migrações versionadas e avaliações vinculadas ao usuário autenticado.
- Validação e recálculo do BF também no servidor; campos desconhecidos são descartados.
- Proteção contra gravação por outra origem e contra sobrescrita por abas/dispositivos desatualizados.
- Avaliações parciais, medidas bilaterais, sete dobras, histórico, gráficos e mapa ilustrativo.
- Importação/exportação JSON por conta e migração opcional dos dados antigos do navegador.
- Testes de cálculo, API, persistência, autenticação e interface.

O BF é uma estimativa de Jackson–Pollock 7 dobras + Siri. O desenho corporal representa medidas pontuais, não um mapa exato de gordura. As fontes e limitações do método estão na interface.

## Estrutura

```text
dist/                     HTML, CSS e módulos JavaScript servidos ao navegador
server/app.mjs            API HTTP, autenticação, autorização e arquivos públicos
server/database.mjs       Inicialização do SQLite e aplicação de migrações
server/security.mjs       Senhas, tokens e limitação de tentativas
server/migrations/        SQL versionado (não editar migrações já aplicadas)
scripts/backup.mjs        Backup consistente do banco, incluindo dados em WAL
scripts/browser-test.mjs  Testes da interface com Playwright
data/                    Banco criado em execução; ignorado pelo Git
backups/                 Cópias locais; ignoradas pelo Git
```

`dist/` contém o código-fonte do frontend. A versão Node serve esses arquivos diretamente e o backend usa módulos nativos. Para Vercel, `npm run build` gera `vercel-dist/` e inclui o SDK Supabase no frontend. Playwright, esbuild e PGlite são dependências de desenvolvimento. `node:sqlite` pode emitir aviso de API experimental em versões do Node 24.

## Variáveis de ambiente

| Variável | Exemplo | Finalidade |
| --- | --- | --- |
| `NODE_ENV` | `development` ou `production` | Em produção exige HTTPS e cookies Secure. |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` em contêiner ou conforme o provedor. |
| `PORT` | `3000` | Porta HTTP do processo. |
| `APP_ORIGIN` | `https://forma.seudominio.com` | Origem exata, sem barra final; valida requisições de gravação. |
| `DATABASE_PATH` | `/app/data/forma.sqlite` | Arquivo SQLite em disco persistente. |
| `ALLOW_REGISTRATION` | `true` | Defina `false` para impedir novos cadastros. |

Não envie `.env`, bancos, backups ou dados pessoais ao repositório. Não existe chave secreta compartilhada de sessão: cada login gera um token aleatório validado no banco.

## Dados e migração

As avaliações são salvas no servidor somente quando a API confirma a gravação. A interface indica `Salvando`, `Dados salvos no servidor` ou `Não salvo`. Não existe gravação offline. Cada conta pode guardar até 1.000 avaliações; importações aceitam arquivos de até 2 MB.

Se a mesma origem tiver a chave antiga `forma.records.v1`, uma faixa oferece a importação com confirmação explícita. Essa ação só é habilitada quando a conta está vazia; a cópia local é preservada.

Ao migrar do endereço antigo do Sites para outro domínio, os navegadores não compartilham o armazenamento local. Exporte o JSON no site antigo e importe na nova conta. A importação JSON substitui o histórico atual após confirmação; exporte antes se quiser preservá-lo.

Em conflito entre abas, a API retorna `409` e mantém os dados do servidor. A edição no formulário continua aberta. Copie as alterações pendentes, exporte o histórico visível se necessário e use **Atualizar dados** antes de refazer a alteração. Trocas de conta em outra aba também são detectadas antes de gravar.

## Testar

```sh
npm test
npx playwright install chromium
npm run test:browser
```

Para usar um Chrome já instalado no Windows:

```powershell
$env:BROWSER_EXECUTABLE = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run test:browser
```

Os testes usam bancos isolados em memória ou diretórios temporários. Não alteram o banco de uso normal. O workflow `.github/workflows/test.yml` executa os testes no GitHub Actions.

## Preparar o repositório remoto

Esta pasta já possui histórico Git, na branch `main`. Não é necessário executar `git init` novamente. Crie um repositório vazio no seu provedor e, dentro desta pasta:

```sh
git remote add origin <URL_DO_SEU_REPOSITORIO>
git push -u origin main
```

Se já existir um remoto `origin`, confira `git remote -v` antes de alterar sua URL. O envio não foi executado: ainda não foi informado um repositório de destino.

Os scripts temporários e o diretório `forma-qa` que possam existir ao lado desta pasta não fazem parte do projeto. Publique a pasta **forma**, não a pasta pai. `.openai/` é configuração local do histórico do Sites e não integra esta versão portátil.

## Hospedagem e operação

Veja [DEPLOYMENT.md](DEPLOYMENT.md) para Docker, HTTPS, volume persistente, backup e restauração.

Esta entrega não inclui verificação de e-mail, recuperação de senha por e-mail, MFA, painel administrativo nem monitoramento. Antes de abrir cadastros amplamente, prepare o fluxo de recuperação de acesso, a política de privacidade/retenção e backups externos. E-mails não verificados são identificadores de login, não prova de identidade. A separação por conta não impede o administrador do servidor de acessar o arquivo do banco.
