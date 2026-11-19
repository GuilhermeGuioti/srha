import { prisma } from "../../db";
import { listarCursos, criarCurso, atualizarCurso } from "../cursos";

async function limpar() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "VinculoCoordenadorCurso", "VinculoDocenteCurso", "PeriodoLetivo", "Curso", "UsuarioPerfil", "Usuario" RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  await limpar();
});

afterAll(async () => {
  await prisma.$disconnect();
});

test("cria curso e aparece na listagem", async () => {
  const id = await criarCurso({ codigo: "FIS", nome: "Fisioterapia", ativo: true });

  const cursos = await listarCursos();

  expect(cursos).toHaveLength(1);
  expect(cursos[0]).toMatchObject({ id, nome: "Fisioterapia", ativo: true });
});

test("nome de curso duplicado é rejeitado", async () => {
  await criarCurso({ codigo: "FIS", nome: "Fisioterapia", ativo: true });

  await expect(
    criarCurso({ codigo: "FISIO", nome: "Fisioterapia", ativo: true }),
  ).rejects.toThrow('Já existe o curso "Fisioterapia", com o código FIS.');
  // Só a caixa diferente também é o mesmo curso, como na importação.
  await expect(criarCurso({ codigo: "FISIO", nome: "FISIOTERAPIA", ativo: true })).rejects.toThrow(
    'Já existe o curso "Fisioterapia"',
  );
  const outro = await criarCurso({ codigo: "ENF", nome: "Enfermagem", ativo: true });
  await expect(atualizarCurso(outro, { codigo: "ENF", nome: "fisioterapia", ativo: true })).rejects.toThrow(
    'Já existe o curso "Fisioterapia"',
  );
});

test("o curso pode mudar a caixa do próprio nome", async () => {
  const id = await criarCurso({ codigo: "FIS", nome: "fisioterapia", ativo: true });

  await atualizarCurso(id, { codigo: "FIS", nome: "Fisioterapia", ativo: true });

  expect((await listarCursos())[0]).toMatchObject({ id, nome: "Fisioterapia" });
});

test("código de curso já usado por outro curso é rejeitado", async () => {
  await criarCurso({ codigo: "FIS", nome: "Fisioterapia", ativo: true });

  await expect(criarCurso({ codigo: "FIS", nome: "Física", ativo: true })).rejects.toThrow(
    "Já existe um curso com o código FIS (Fisioterapia).",
  );
});

test("o código pode mudar, e vínculo e relatório continuam no curso", async () => {
  const id = await criarCurso({ codigo: "C001", nome: "Fisioterapia", ativo: true });

  await atualizarCurso(id, { codigo: "FIS", nome: "Fisioterapia", ativo: true });

  const cursos = await listarCursos();
  expect(cursos[0]).toMatchObject({ id, codigo: "FIS" });
});

test("o banco recusa código fora do formato, mesmo sem passar pela tela", async () => {
  // Minúsculas: sem o CHECK, "fis" conviveria com "FIS" no índice único.
  for (const codigo of ["fis", "F", "FIS-", "FÍS", "FIS 1", "A".repeat(21)]) {
    await expect(prisma.curso.create({ data: { codigo, nome: `Curso ${codigo}` } })).rejects.toThrow(
      /Curso_codigo_formato/,
    );
  }
  await expect(prisma.curso.create({ data: { codigo: "DIR-01", nome: "Direito" } })).resolves.toMatchObject({
    codigo: "DIR-01",
  });
});

test("atualizar curso mantendo o mesmo nome não é rejeitado como duplicado", async () => {
  const id = await criarCurso({ codigo: "FIS", nome: "Fisioterapia", ativo: true });

  await atualizarCurso(id, { codigo: "FIS", nome: "Fisioterapia", ativo: false });

  const cursos = await listarCursos();
  expect(cursos[0].ativo).toBe(false);
});

test("inativar curso preserva o registro em vez de excluir", async () => {
  const id = await criarCurso({ codigo: "FIS", nome: "Fisioterapia", ativo: true });

  await atualizarCurso(id, { codigo: "FIS", nome: "Fisioterapia", ativo: false });

  const cursos = await listarCursos();
  expect(cursos).toHaveLength(1);
  expect(cursos[0].ativo).toBe(false);
});

test("o total de docentes é do período pedido, não a soma dos semestres renovados", async () => {
  const id = await criarCurso({ codigo: "FIS", nome: "Fisioterapia", ativo: true });
  const [helena, ana] = await Promise.all([
    prisma.usuario.create({ data: { nome: "Helena", email: "helena@srha.dev" } }),
    prisma.usuario.create({ data: { nome: "Ana", email: "ana@srha.dev" } }),
  ]);
  const datas = { aberturaSubmissao: new Date("2026-02-01T03:00:00Z"), encerramentoSubmissao: new Date("2026-07-10T03:00:00Z") };
  const [primeiro, segundo] = await Promise.all([
    prisma.periodoLetivo.create({ data: { ano: 2026, semestre: 1, ...datas } }),
    prisma.periodoLetivo.create({ data: { ano: 2026, semestre: 2, ...datas } }),
  ]);
  await prisma.vinculoDocenteCurso.createMany({
    data: [
      { docenteId: helena.id, cursoId: id, periodoLetivoId: primeiro.id },
      { docenteId: ana.id, cursoId: id, periodoLetivoId: primeiro.id },
      { docenteId: helena.id, cursoId: id, periodoLetivoId: segundo.id },
    ],
  });

  expect((await listarCursos(segundo.id))[0]._count.docentes).toBe(1);
  expect((await listarCursos(primeiro.id))[0]._count.docentes).toBe(2);
  expect((await listarCursos())[0]._count.docentes).toBe(0);
});
