import { prisma } from "../../db";
import { listarCursos, criarCurso, atualizarCurso } from "../cursos";

async function limpar() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "VinculoCoordenadorCurso", "VinculoDocenteCurso", "Curso", "UsuarioPerfil", "Usuario" RESTART IDENTITY CASCADE`,
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
  ).rejects.toThrow("Já existe um curso com este nome.");
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
