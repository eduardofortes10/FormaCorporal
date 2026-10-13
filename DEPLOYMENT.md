# Hospedagem do Forma

## Modelo suportado

Um processo Node.js 24.x, servindo interface e API na mesma origem, com um arquivo SQLite em **volume persistente local**. O endereço público deve usar HTTPS por meio do proxy do provedor ou de um proxy reverso.

Esta configuração é adequada para uma instância. Não use múltiplas réplicas compartilhando SQLite por sistema de arquivos de rede. Plataformas estáticas, GitHub Pages e funções com disco efêmero não preservam esse banco. Para escalar horizontalmente, primeiro adapte a camada de dados e a limitação de tentativas para serviços compartilhados.

## Docker Compose

1. Configure `.env` com `APP_ORIGIN=https://seu-dominio` e `ALLOW_REGISTRATION=true` ou `false`.
2. Prepare `backups/` no host com permissão de escrita para o usuário do contêiner (UID 1000 na imagem atual).
3. Inicie:

```sh
docker compose up -d --build
```

O Compose publica apenas em `127.0.0.1:3000`. Configure seu proxy HTTPS para encaminhar ao servidor local nessa porta. O contêiner usa a porta interna 3000 e um volume nomeado `forma-data` para `/app/data`. Ele não publica um banco separado.

Em um provedor que gerencie TLS, configure o domínio HTTPS, `APP_ORIGIN`, `HOST=0.0.0.0`, a porta esperada e um disco persistente no caminho apontado por `DATABASE_PATH`. O endpoint `GET /healthz` retorna `200` quando o banco responde.

O servidor não confia em `X-Forwarded-For`; o limitador por IP verá o endereço do proxy. Há também limite por e-mail. Para tráfego público maior, configure limitação na borda do provedor e ajuste conscientemente a política de proxies antes de alterar esse comportamento. A limitação local reinicia com o processo.

## Sem Docker

```sh
npm ci --omit=dev
npm start
```

Configure as variáveis em `.env` ou no ambiente do serviço. Use `NODE_ENV=production`, `APP_ORIGIN` HTTPS e um gerenciador de processos do host para reinício automático. Migrações pendentes são aplicadas na inicialização, antes de abrir a porta. Mantenha arquivos de migração já aplicados imutáveis e adicione novos arquivos SQL para futuras mudanças.

## Backups

Com o app em execução ou parado:

```sh
npm run backup
```

Um caminho de destino também pode ser informado:

```sh
npm run backup -- ./backups/copia-manual.sqlite
```

Em Docker:

```sh
docker compose exec forma node scripts/backup.mjs /app/backups/copia-manual.sqlite
```

Use um nome novo para cada cópia. O script usa a API de backup do SQLite; copiar somente o arquivo principal enquanto o servidor está gravando pode omitir dados presentes no WAL. Agende as cópias no host, copie-as para armazenamento externo protegido e teste a restauração. O volume do contêiner não substitui backup. Não execute `docker compose down -v` se quiser preservar os dados.

## Restaurar

1. Pare o servidor, inclusive todas as instâncias que acessem o banco.
2. Preserve o diretório de dados atual completo em uma pasta de arquivo, incluindo arquivos `-wal` e `-shm` se existirem.
3. Crie um diretório de dados vazio e copie o backup para o caminho definido por `DATABASE_PATH`. Não misture um banco restaurado com arquivos WAL/SHM antigos.
4. Ajuste a propriedade/permissões para o usuário do serviço, inicie o app e confira `/healthz`, login e avaliações.

O backup completo contém contas, hashes de senha, sessões e avaliações. Proteja-o como o banco original. Para invalidar sessões após restauração, com o app parado, execute no banco restaurado `DELETE FROM sessions;` usando uma ferramenta SQLite confiável.

## Estado de verificação

A API e o frontend são testados localmente. O Dockerfile e o Compose estão preparados, mas a construção/execução do contêiner depende de um ambiente com Docker. Nenhum provedor foi configurado e esta versão não foi implantada.
