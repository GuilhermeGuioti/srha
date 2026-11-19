import { prisma } from "../../db";
import { listarPeriodos, criarPeriodo, atualizarPeriodo } from "../periodos";
import { SituacaoRelatorio } from "../../../generated/prisma/client";

async function limpar() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "PeriodoLetivo", "Curso", "Usuario" RESTART IDENTITY CASCADE`);
}

const dados = (extra?: Partial<Parameters<typeof criarPeriodo>[0]>) => ({
  ano: 2026,
  semestre: 2,
  aberturaSubmissao: new Date("2026-08-01T00:00:00Z"),
  encerramentoSubmissao: new Date("2026-12-15T23:59:59Z"),
  ...extra,
});

beforeEach(async () => {
  await limpar();
});

afterAll(async () => {
  await prisma.$disconnect();
});

test("cria período e aparece na listagem", async () => {
  const id = await criarPeriodo(dados());

  const periodos = await listarPeriodos();

  expect(periodos).toHaveLength(1);
  expect(periodos[0]).toMatchObject({ id, ano: 2026, semestre: 2 });
});

test("ano e semestre repetidos são rejeitados", async () => {
  await criarPeriodo(dados());

  await expect(criarPeriodo(dados())).rejects.toThrow(
    "Já existe um período letivo cadastrado para este ano e semestre.",
  );
});

test("atualizar período mantendo ano e semestre não é rejeitado como duplicado", async () => {
  const id = await criarPeriodo(dados());

  await atualizarPeriodo(id, dados({ encerramentoSubmissao: new Date("2026-12-20T23:59:59Z") }));

  const periodos = await listarPeriodos();
  expect(periodos[0].encerramentoSubmissao.toISOString()).toBe("2026-12-20T23:59:59.000Z");
});

test("encerramento antes ou igual à abertura é rejeitado", async () => {
  await expect(
    criarPeriodo(
      dados({
        aberturaSubmissao: new Date("2026-08-01T00:00:00Z"),
        encerramentoSubmissao: new Date("2026-08-01T00:00:00Z"),
      }),
    ),
  ).rejects.toThrow("O encerramento da submissão deve ser depois da abertura.");
});

test("período com relatório aprovado não muda de ano e semestre; as datas mudam", async () => {
  const id = await criarPeriodo(dados());
  const [docente, curso] = await Promise.all([
    prisma.usuario.create({ data: { nome: "Helena", email: "helena@srha.dev" } }),
    prisma.curso.create({ data: { codigo: "FIS", nome: "Fisioterapia" } }),
  ]);
  const relatorio = await prisma.relatorio.create({
    data: { docenteId: docente.id, cursoId: curso.id, periodoLetivoId: id },
  });

  // Rascunho não impede: nenhum PDF saiu ainda.
  await atualizarPeriodo(id, dados({ semestre: 1 }));
  await atualizarPeriodo(id, dados());

  await prisma.relatorio.update({ where: { id: relatorio.id }, data: { situacao: SituacaoRelatorio.APROVADO } });

  await expect(atualizarPeriodo(id, dados({ semestre: 1 }))).rejects.toThrow(
    "O período 2026/2 tem relatório aprovado — o ano e o semestre não podem mudar",
  );
  await expect(atualizarPeriodo(id, dados({ ano: 2027 }))).rejects.toThrow("tem relatório aprovado");

  await atualizarPeriodo(id, dados({ encerramentoSubmissao: new Date("2026-12-20T23:59:59Z") }));
  expect((await listarPeriodos())[0]).toMatchObject({ ano: 2026, semestre: 2 });
});
