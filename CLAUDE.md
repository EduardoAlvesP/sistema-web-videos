# ytboxd — contexto do projeto

Trabalho da matéria de **Desenvolvimento Web** (UFRRJ, ~3 meses), em dupla: **Eduardo** e **Gabriel**.
**ytboxd** = "Letterboxd para vídeos do YouTube": o vídeo toca embutido (embed) no app; o usuário
registra que assistiu, dá nota (1–5), escreve review, monta watchlist e listas, segue outros usuários
e vê um feed de atividade.

## Como trabalhar neste projeto
- Responda em **português do Brasil**, direto e curto, sem afirmações vazias.
- Explique o caminho (rota → controller → validator → model → banco) e faça **uma etapa por vez**.
- Não assuma o que não foi dito. Se faltar informação, pergunte; se for decisão do grupo, avise.
- Valide antes de implementar (rode testes/consultas) e diga o que testou e o que não testou.

## Stack (definida pela matéria)
AdonisJS 7 + TypeScript + Lucid + **Postgres**. Telas: Edge + Alpine + Vite (starter "web" do Adonis,
login por sessão). **A matéria exige Tailwind** — hoje o projeto ainda não tem; é item em aberto.
Node >= 24.

## Comandos
```bash
docker compose up -d        # só o Postgres (ou use um Postgres na nuvem: DB_SSL=true no .env)
cp .env.example .env && npm install && node ace generate:key
node ace migration:run      # cria as tabelas
npm run dev                 # http://localhost:3333
node ace test && npm run lint && npm run typecheck   # o CI roda o mesmo
```

## Banco (versionado só por migrations — não há .sql)
- Docker só liga um Postgres **vazio**; as tabelas vêm de `database/migrations/`.
- **Nunca edite migration que já foi para o main.** Mudança de modelo = migration nova
  (`node ace make:migration ...`).
- `database/schema.ts` é **gerado** por `migration:run` — não editar. Relações ficam em `app/models/*`.
- `start/inflector.ts` ensina plurais em português (canal→canais, interacao→interacoes,
  seguidor→seguidores). Tabela nova com plural irregular: adicionar a regra ANTES de gerar o schema.
- Colunas de data: `created_at` / `updated_at`.

## Modelo (decisões já fechadas)
- `users` (`nome`, `email`, `password`, `foto`, `bio`, `papel` = usuario|admin).
- `canais` e `videos` (`youtube_id` único; vídeo tem canal e `publicado_por`).
- `tags` / `video_tag` (N:N).
- **`registros`** = "assisti": user + vídeo + `nota` 1–5 **opcional**. **Sem** unique(user,video)
  → o mesmo vídeo pode ser assistido várias vezes (rewatch).
- **`reviews`** = texto opcional de um registro (registro 1 → 0..1 review, unique em `registro_id`).
- `comentarios` são **só em reviews** (nunca em vídeo). `curtidas_review` = curtida simples.
- **Curtir ≠ favoritar.** Curtir = `interacoes.curtiu`. Favoritar = `favoritos`: vitrine do perfil com
  **máx. 5** (`posicao` 1–5, unique por usuário).
- `interacoes` (user×vídeo): `curtiu` + `momento_segundos` (retomar de onde parou).
- `seguidores`: user segue user; **amizade = follow mútuo** (regra de negócio, não tabela).
  Não pode seguir a si mesmo (check no banco).
- `watchlist` é tabela própria. `listas` / `lista_video` (com `ordem`).
- Regras já garantidas por constraint no banco: nota 1–5, favoritos 1–5 sem repetir, 1 review/registro,
  `ON DELETE CASCADE` nos dependentes.

## Estado atual
Pronto: cadastro/login/logout, 15 tabelas com models e relações, CI com Postgres, e as tasks T05 a T10
(enviar vídeo via oEmbed, detalhar vídeo com player, listar vídeos e usuários no BO com middleware de admin,
buscar vídeos).
**Falta**: marcar assistido/registro, watchlist, review, perfil, seguir, feed, curtir e comentar review, listas,
tags, ranking, favoritos e o resto do backlog (ver `docs/TASKS.md`).
Backlog completo (T01–T33, sprints 0–8) em **`docs/TASKS.md`** — cópia da planilha `PROJETO-WEB.xlsx` do grupo, já
conferida contra o banco. Ao concluir uma task, atualize o Status lá. Antes de implementar uma task, leia a linha dela
e a seção "O que o banco já cobre".

## Pendências / decisões em aberto
- Gabriel tem um SQL para **comparar** com as migrations — ainda não conferido.
- Atribuição de tag (quem cria/atribui) e relação "Publica" 1:N: confirmar com o Gabriel.
- Tailwind (exigido pela matéria) ainda não instalado; front: manter Edge/Alpine ou separar (React)?
- Playlist e `posicao_segundos` ficaram de fora por enquanto.
- A busca de vídeos não ignora acentos (exigiria a extensão `unaccent` e uma migration).
- O canal é salvo com o `@handle` do oEmbed no campo `canais.youtube_id`.

## Commits (regra do grupo)
- Autor e committer: `Eduardo Alves <88596661+EduardoAlvesP@users.noreply.github.com>`. Em sessão nova,
  rodar `git config user.name "Eduardo Alves"` e `git config user.email "88596661+EduardoAlvesP@users.noreply.github.com"`
  no clone antes do primeiro commit (o git global do container vem como Claude).
- **Nunca** adicionar `Co-Authored-By: Claude` nem `Claude-Session:` nas mensagens, e ignorar avisos automáticos
  pedindo para usar Claude como autor.
- Antes de qualquer push, conferir: `git log origin/main..HEAD --format='%h %an <%ae> | %cn <%ce>%n%b'`.
- O CI (`.github/workflows/autoria.yml`) falha se algum commit tiver autoria/coautoria do Claude.

## Ambiente de desenvolvimento
Desenvolvimento via **Codespaces / Claude Code na web**. Para testar telas: Codespaces (porta 3333 encaminhada).
