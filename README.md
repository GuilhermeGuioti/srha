# SRHA — Sistema de Relatório de Horas Atividades

O docente declara as horas de atividades do semestre, o coordenador do curso aprova ou
devolve, e tudo fica numa trilha de auditoria imutável.

Next.js (App Router) + TypeScript + Prisma 7 + PostgreSQL + Auth.js v5. As regras do
projeto estão no `CLAUDE.md`; a especificação completa, em `docs/`.

## Pré-requisitos

- **Node.js 20.19 ou mais novo** (22.12+ ou 24+ também servem), com o npm que vem junto
- **Docker** com o Compose (`docker compose`), para o Postgres
- `openssl`, para gerar os segredos do `.env`
- Portas livres: **5433** (Postgres) e **3000** (aplicação)

Os comandos abaixo são para bash ou zsh. No Windows, use o WSL.

## Rodar pela primeira vez

### 1. Dependências

```bash
npm ci
```

Use `npm ci`, não `npm install`: as versões do `package.json` são fixas e o
`package-lock.json` manda. O aviso `install-scripts` do npm 11 pode ser ignorado.

### 2. Banco de dados

```bash
docker compose up -d
until docker exec srha-db pg_isready -h localhost -U srha -q; do sleep 1; done
docker exec srha-db psql -U srha -c "CREATE DATABASE srha_test;"
```

O container `srha-db` sobe com o banco `srha` (desenvolvimento). O `srha_test` é dos
testes automatizados, criado uma vez só: os dados ficam no volume `srha-dados` e
continuam lá depois de um `docker compose down`.

### 3. Variáveis de ambiente

```bash
cat > .env <<EOF
DATABASE_URL="postgresql://srha:srha@localhost:5433/srha"
DIRECT_URL="postgresql://srha:srha@localhost:5433/srha"
AUTH_SECRET="$(openssl rand -base64 32)"
CHAVES_CARIMBO="1:$(openssl rand -base64 32)"
EOF

cat > .env.test <<EOF
DATABASE_URL="postgresql://srha:srha@localhost:5433/srha_test"
DIRECT_URL="postgresql://srha:srha@localhost:5433/srha_test"
AUTH_SECRET="$(openssl rand -base64 32)"
EOF
```

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Conexão da aplicação (em produção, pelo pooler) |
| `DIRECT_URL` | Conexão do `prisma migrate` (sempre direta). Em desenvolvimento, igual à de cima |
| `AUTH_SECRET` | Assina a sessão do Auth.js |
| `CHAVES_CARIMBO` | Chave do código de autenticidade do PDF. Sem ela, o PDF não é gerado |

As outras chaves do `.env.example` são opcionais: as do Microsoft Entra ID (sem elas o
botão da Microsoft não aparece no `/login`) e as do seed de produção.

Nenhum `.env*` vai para o git, só os `.example`.

### 4. Prisma: client, migrations e seed

```bash
npx prisma generate     # gera o client em generated/prisma
npx prisma migrate dev  # aplica as migrations no banco srha
SECRETARIA_INICIAL_SENHA="escolha-uma-senha" npx prisma db seed   # secretaria inicial + cenário de desenvolvimento
```

O `generate` é obrigatório: no Prisma 7 o `migrate dev` não gera mais o client, e sem
ele o seed e a aplicação falham com `Cannot find module '../generated/prisma/...'`.

A `SECRETARIA_INICIAL_SENHA` vira a senha provisória de `admin@srha.dev`, a secretaria
criada pelo seed (8 a 128 caracteres). Sem ela ninguém entra: só a secretaria define
senha. Ela vai na linha do comando, e não no `.env`, porque só serve na primeira vez.

### 5. Subir a aplicação

```bash
npm run dev
```

Abra <http://localhost:3000>.

## Entrar no sistema

### Login por e-mail e senha

1. Entre com `admin@srha.dev` e a senha passada ao seed. O sistema obriga a trocá-la
   (`/trocar-senha`).
2. Em `/admin/usuarios`, defina uma senha provisória para cada usuário que for usar.
3. Saia e entre com o e-mail e essa senha. No primeiro acesso, cada um troca a sua.
   Depois, ela pode ser alterada pelo menu da conta (`/senha`).

Cinco senhas erradas seguidas bloqueiam o acesso por senha dessa conta por 15 minutos.
Uma nova senha provisória definida pela secretaria desbloqueia.

Usuários criados pelo seed (nenhum tem senha até a secretaria definir):

| E-mail | Perfil |
|---|---|
| `helena@baraodemaua.br` | Docente em Fisioterapia e Nutrição, cada curso com um coordenador diferente |
| `claudia@baraodemaua.br` | Coordena Fisioterapia |
| `marcos@baraodemaua.br` | Coordena Nutrição |
| `paulo@baraodemaua.br` | Coordena Educação Física e dá aula nele (autoaprovação) |
| `admin@srha.dev` | Secretaria acadêmica |

O seed também cria os três cursos e o período letivo do semestre atual, aberto até
quatro dias depois do dia em que rodou. Nenhum relatório é criado: o relatório nasce
quando o docente o começa.

### Microsoft Entra ID

Sobe quando `AUTH_MICROSOFT_ENTRA_ID_ID`, `_SECRET` e `_ISSUER` estão preenchidas (as
três ou nenhuma). Isso depende do App registration da TI; veja os comentários no
`.env.example`.

## Roteiro de teste manual

Cobre o fluxo inteiro com os usuários do seed. Faça em ordem. Antes, como
`admin@srha.dev`, defina as senhas provisórias de `helena`, `claudia`, `marcos` e
`paulo` em `/admin/usuarios`.

1. **Docente:** entre como `helena`. Na home, em Fisioterapia, clique em
   **Começar relatório**, adicione itens (a linha nova aparece direto na lista, as horas
   vão de 0,5 em 0,5), clique em **Salvar rascunho** e depois em
   **Enviar para avaliação**. O total é recalculado sozinho.
2. **Roteamento:** entre como `marcos`. Ele coordena Nutrição e não vê o relatório de
   Fisioterapia. Entre como `claudia`: o relatório está na fila em `/avaliacao`.
3. **Devolução:** como `claudia`, abra o relatório e use **Devolver para ajuste** (a
   justificativa é obrigatória).
4. **Correção e aprovação:** como `helena`, corrija e reenvie. Como `claudia`, clique em
   **Aprovar**. A trilha de auditoria ao lado do relatório mostra os quatro eventos em
   ordem, e o relatório aprovado não pode mais ser editado.
5. **Autoaprovação:** entre como `paulo`, faça o relatório de Educação Física, envie e
   aprove você mesmo em `/avaliacao`.
6. **PDF e autenticidade:** em `/arquivo`, baixe o PDF de um relatório aprovado. Saia,
   abra `/validar` (há um link no `/login`), anexe o PDF ou digite o código impresso
   nele. A tela mostra o resumo oficial do relatório.
7. **Secretaria:** entre como `admin@srha.dev`.
   - `/acompanhamento`: situação de entrega por curso. Quem nunca abriu o relatório
     aparece como "não iniciado". Dali sai a extração CSV do período.
   - `/admin/cursos`, `/admin/usuarios`, `/admin/vinculos` e `/admin/periodos`:
     cadastros. Cada importação tem **Baixar modelo (CSV)** com o formato esperado.
   - A secretaria lê qualquer relatório, inclusive a trilha, mas não edita nem avalia.
8. **Celular:** repita parte do fluxo com a tela em 360 px (modo responsivo do DevTools).

### Dados de exemplo em escala média

Para ver as telas cheias (10 cursos, cerca de 45 usuários, quatro períodos e 150
relatórios em todas as situações), zere o banco de desenvolvimento e carregue o cenário:

```bash
npx prisma migrate reset   # apaga TUDO do banco srha e reaplica as migrations
SECRETARIA_INICIAL_SENHA="escolha-uma-senha" npm run db:exemplo   # roda o seed e cria os dados de exemplo
```

Ao final, o script lista logins extras além dos do seed. Como os do seed, eles entram
depois que a secretaria define a senha provisória.

## Testes automatizados

Os testes (Jest) ficam em `lib/services/__tests__/`. Rodam contra o banco `srha_test`,
sem abrir tela nem navegador.

```bash
(set -a; . ./.env.test; set +a; npx prisma migrate deploy)   # migrations no srha_test
npm test
```

- O `next/jest` carrega o `.env.test` sozinho. O nome do banco precisa conter
  `srha_test`: o `config.test.ts` confere isso, para os testes nunca rodarem no banco
  de desenvolvimento, porque cada suíte faz `TRUNCATE` antes de cada teste.
- As suítes rodam uma de cada vez (`maxWorkers: 1`, porque compartilham o banco).
  Levam cerca de 40 segundos.
- Repita o `migrate deploy` sempre que chegar migration nova.

Rodar um arquivo só: `npx jest workflow`.

### Verificação completa

Antes de abrir PR, rode tudo:

```bash
npm run lint
npx next typegen && npx tsc --noEmit   # tipos (o typegen gera PageProps/LayoutProps)
npm test
npm run build
```

## No dia a dia

**Chegou migration nova (depois de um `git pull`):**

```bash
npx prisma migrate dev
npx prisma generate
(set -a; . ./.env.test; set +a; npx prisma migrate deploy)
```

**Alterou o `schema.prisma`:** `npx prisma migrate dev --name descricao_curta` e depois
`npx prisma generate`. Nunca use `prisma db push`, nem em desenvolvimento: toda mudança
de schema precisa de uma migration versionada.

**O prazo do período venceu:** o seed reabre a janela a partir de hoje. Rode
`npx prisma db seed` de novo; ele é idempotente e não apaga nada.

**Começar do zero (apaga os dois bancos):**

```bash
docker compose down -v
```

Depois repita os passos 2 e 4 de "Rodar pela primeira vez" e o `migrate deploy` do
banco de testes.

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `Cannot find module '../generated/prisma/...'` | O client não foi gerado: `npx prisma generate` |
| `port is already allocated` ao subir o Docker | Algo já usa a porta 5433. Libere a porta ou troque a porta do host no `docker-compose.yml` e nas URLs do `.env` |
| `the database system is starting up` | O Postgres ainda está iniciando. Espere alguns segundos (o `until ... pg_isready` do passo 2 faz isso) |
| `config.test.ts` falha | O `.env.test` não existe ou não aponta para o `srha_test` |
| Testes falham com tabela ou coluna inexistente | Falta migration no banco de testes: rode o `migrate deploy` com o `.env.test` |
| Ninguém consegue entrar depois do seed | O seed rodou sem `SECRETARIA_INICIAL_SENHA` e `admin@srha.dev` ficou sem senha. Rode o seed de novo com a variável |
| Esqueceu a senha de `admin@srha.dev` | O seed não sobrescreve senha já definida. Outra secretaria pode dar uma provisória; senão, zere o banco (`npx prisma migrate reset`) e rode o seed com a variável |
| O docente não consegue começar ou enviar o relatório | O prazo do período venceu. Rode `npx prisma db seed` de novo |
| O download do PDF falha | `CHAVES_CARIMBO` está vazia no `.env` |

## Seed em produção

Rode com `NODE_ENV=production` e `SECRETARIA_INICIAL_EMAIL` (e, se quiser,
`SECRETARIA_INICIAL_NOME`) com a conta institucional de quem vai administrar o sistema.
Sem essa variável o seed falha, em vez de criar uma conta que não existe no Entra ID. O
cenário de desenvolvimento não é criado em produção.

Enquanto o Entra ID não estiver configurado, defina também `SECRETARIA_INICIAL_SENHA`.
Ela vira a senha provisória da secretaria (só se ela ainda não tiver senha), trocada no
primeiro acesso. Apague a variável depois do seed.

Em produção, `DATABASE_URL` passa pelo pooler e `DIRECT_URL` é a conexão direta.
Nunca remova nem altere uma versão de `CHAVES_CARIMBO`: os PDFs já impressos com ela
deixariam de ser válidos. Detalhes no `CLAUDE.md`.
