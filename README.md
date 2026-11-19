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

As outras chaves do `.env.example` são as do Microsoft Entra ID, opcionais (sem elas o
botão da Microsoft não aparece no `/login`), e as do seed, passadas na linha do comando
(passo 4).

Nenhum `.env*` vai para o git, só os `.example`.

### 4. Prisma: client, migrations e seed

```bash
npx prisma generate     # gera o client em generated/prisma
npx prisma migrate dev  # aplica as migrations no banco srha
SECRETARIA_INICIAL_EMAIL="voce@exemplo.com" SECRETARIA_INICIAL_SENHA="escolha-uma-senha" \
  npx prisma db seed    # cria a primeira secretaria
```

O `generate` é obrigatório: no Prisma 7 o `migrate dev` não gera mais o client, e sem
ele o seed e a aplicação falham com `Cannot find module '../generated/prisma/...'`.

O seed cria só a primeira secretaria, com o e-mail de `SECRETARIA_INICIAL_EMAIL` (e o
nome de `SECRETARIA_INICIAL_NOME`, se quiser). A `SECRETARIA_INICIAL_SENHA` vira a senha
provisória dela (8 a 128 caracteres). Sem ela ninguém entra, porque só a secretaria
define senha. As duas vão na linha do comando, e não no `.env`, porque só servem na
primeira vez. Cursos, períodos e os outros usuários a secretaria cadastra pelo sistema
(veja "Primeiro cadastro").

### 5. Subir a aplicação

```bash
npm run dev
```

Abra <http://localhost:3000>.

## Entrar no sistema

### Login por e-mail e senha

1. Entre com o e-mail e a senha passados ao seed. O sistema obriga a trocá-la
   (`/trocar-senha`).
2. Em `/admin/usuarios`, defina uma senha provisória para cada usuário que for usar.
3. Saia e entre com o e-mail e essa senha. No primeiro acesso, cada um troca a sua.
   Depois, ela pode ser alterada pelo menu da conta (`/senha`).

Cinco senhas erradas seguidas bloqueiam o acesso por senha dessa conta por 15 minutos.
Uma nova senha provisória definida pela secretaria desbloqueia.

### Primeiro cadastro

O banco começa só com a secretaria. Cadastre, como ela, nesta ordem. Cada importação
tem **Baixar modelo (CSV)** com o formato esperado.

1. `/admin/periodos`: o período letivo, com o prazo de entrega aberto hoje.
2. `/admin/cursos`: os cursos, cada um com um **código** (ex.: ENF). É pelo código que
   as planilhas acham o curso.
3. `/admin/usuarios`: docentes e coordenadores. A planilha de usuários já pode vincular
   cada pessoa, pelas colunas opcionais **Cursos como docente** (com Ano e Semestre) e
   **Cursos como coordenador**, com os códigos separados por vírgula.
4. Os vínculos que faltarem: em `/admin/vinculos`, ou na linha de cada pessoa em
   `/admin/usuarios` (botão de vínculos na linha da pessoa).

Reimportar a planilha de usuários atualiza o nome de quem já existe, e a Secretaria
também se a coluna vier na planilha. Nenhuma planilha remove vínculo: só acrescenta.

**A cada semestre**, cadastre o período novo em `/admin/periodos`. Ao salvar, abre a
renovação: os docentes do período anterior, por curso, todos marcados (só docentes e
cursos ativos). Desmarque quem saiu e confirme; depois, vincule quem entrou. Coordenação
não depende de período e continua como está. Para renovar de novo um período já criado,
use **Renovar do período anterior** em `/admin/vinculos`.

**Período encerrado não muda.** Depois do encerramento da submissão, os vínculos de
docente daquele período ficam como estão: nenhuma tela, renovação ou planilha acrescenta
ou remove. Esqueceu alguém? Estenda o encerramento em `/admin/periodos`, corrija e volte
a data. Ano e semestre de período com relatório aprovado também não mudam, porque o PDF
emitido traz o período; as datas mudam sempre.

Nenhum relatório é criado: o relatório nasce quando o docente o começa.

### Microsoft Entra ID

Sobe quando `AUTH_MICROSOFT_ENTRA_ID_ID`, `_SECRET` e `_ISSUER` estão preenchidas (as
três ou nenhuma). Isso depende do App registration da TI; veja os comentários no
`.env.example`.

## Roteiro de teste manual

Cobre o fluxo inteiro. Faça em ordem. Antes, cadastre (veja "Primeiro cadastro") dois
cursos, A e B, cada um com seu coordenador; um docente vinculado aos dois; e um
coordenador que também é docente do próprio curso. Defina a senha provisória de cada um.

1. **Docente:** entre como o docente. Na home, no curso A, clique em
   **Começar relatório**, adicione itens (a linha nova aparece direto na lista, as horas
   vão de 0,5 em 0,5), clique em **Salvar rascunho** e depois em
   **Enviar para avaliação**. O total é recalculado sozinho.
2. **Roteamento:** entre como o coordenador de B: ele não vê o relatório do curso A.
   Entre como o coordenador de A: o relatório está na fila em `/avaliacao`.
3. **Devolução:** como coordenador de A, abra o relatório e use **Devolver para ajuste**
   (a justificativa é obrigatória).
4. **Correção e aprovação:** como o docente, corrija e reenvie. Como o coordenador de A,
   clique em **Aprovar**. A trilha de auditoria ao lado do relatório mostra os quatro
   eventos em ordem, e o relatório aprovado não pode mais ser editado.
5. **Autoaprovação:** entre como o coordenador que também é docente, faça o relatório do
   próprio curso, envie e aprove você mesmo em `/avaliacao`.
6. **PDF e autenticidade:** em `/arquivo`, baixe o PDF de um relatório aprovado. Saia,
   abra `/validar` (há um link no `/login`), anexe o PDF ou digite o código impresso
   nele. A tela mostra o resumo oficial do relatório.
7. **Secretaria:** entre como a secretaria.
   - `/acompanhamento`: situação de entrega por curso. Quem nunca abriu o relatório
     aparece como "não iniciado". Dali sai a extração CSV do período.
   - A secretaria lê qualquer relatório, inclusive a trilha, mas não edita nem avalia.
8. **Celular:** repita parte do fluxo com a tela em 360 px (modo responsivo do DevTools).

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

**O prazo do período venceu:** ajuste o encerramento em `/admin/periodos`.

**Começar do zero (apaga os dois bancos):**

```bash
docker compose down -v
```

Depois repita os passos 2 e 4 de "Rodar pela primeira vez", o `migrate deploy` do banco
de testes e o primeiro cadastro.

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `Cannot find module '../generated/prisma/...'` | O client não foi gerado: `npx prisma generate` |
| `port is already allocated` ao subir o Docker | Algo já usa a porta 5433. Libere a porta ou troque a porta do host no `docker-compose.yml` e nas URLs do `.env` |
| `the database system is starting up` | O Postgres ainda está iniciando. Espere alguns segundos (o `until ... pg_isready` do passo 2 faz isso) |
| `config.test.ts` falha | O `.env.test` não existe ou não aponta para o `srha_test` |
| Testes falham com tabela ou coluna inexistente | Falta migration no banco de testes: rode o `migrate deploy` com o `.env.test` |
| O seed falha pedindo `SECRETARIA_INICIAL_EMAIL` | Ela é obrigatória em qualquer ambiente. Passe-a na linha do comando (passo 4) |
| Ninguém consegue entrar depois do seed | O seed rodou sem `SECRETARIA_INICIAL_SENHA` e a secretaria ficou sem senha. Rode o seed de novo com as duas variáveis |
| Esqueceu a senha da secretaria inicial | O seed não sobrescreve senha já definida. Outra secretaria pode dar uma provisória; em desenvolvimento, dá também para zerar o banco (`npx prisma migrate reset`) e rodar o seed de novo |
| O docente não consegue começar ou enviar o relatório | O prazo do período venceu ou ainda não começou. Ajuste as datas em `/admin/periodos` |
| "O período … já foi encerrado" ao vincular ou remover docente | Período encerrado não muda. Se for mesmo preciso, estenda o encerramento em `/admin/periodos` |
| O download do PDF falha | `CHAVES_CARIMBO` está vazia no `.env` |

## Seed em produção

O mesmo comando do passo 4, com a conta institucional de quem vai administrar o sistema
em `SECRETARIA_INICIAL_EMAIL` (e, se quiser, `SECRETARIA_INICIAL_NOME`): é com ela que o
Entra ID a reconhece. Sem essa variável o seed falha, em vez de criar uma conta que não
existe.

Enquanto o Entra ID não estiver configurado, defina também `SECRETARIA_INICIAL_SENHA`.
Ela vira a senha provisória da secretaria (só se ela ainda não tiver senha), trocada no
primeiro acesso. Apague a variável depois do seed.

Em produção, `DATABASE_URL` passa pelo pooler e `DIRECT_URL` é a conexão direta.
Nunca remova nem altere uma versão de `CHAVES_CARIMBO`: os PDFs já impressos com ela
deixariam de ser válidos. Detalhes no `CLAUDE.md`.
