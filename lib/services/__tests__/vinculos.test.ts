import { prisma } from "../../db";
import {
  listarVinculosDocente,
  listarVinculosCoordenador,
  vincularDocente,
  desvincularDocente,
  vincularCoordenador,
  desvincularCoordenador,
  trazerVinculosDoPeriodoAnterior,
} from "../vinculos";
import { criarPeriodo } from "../periodos";
import { Perfil } from "../../../generated/prisma/client";

async function limpar() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "VinculoCoordenadorCurso", "VinculoDocenteCurso", "PeriodoLetivo", "Curso", "UsuarioPerfil", "Usuario" RESTART IDENTITY CASCADE`,
  );
}

async function obterAmbiente() {
  const [docente, curso, outroCurso] = await Promise.all([
    prisma.usuario.create({ data: { nome: "Helena", email: "helena@srha.dev" } }),
    prisma.curso.create({ data: { codigo: "FIS", nome: "Fisioterapia" } }),
    prisma.curso.create({ data: { codigo: "ENF", nome: "Enfermagem" } }),
  ]);
  const periodo = await prisma.periodoLetivo.create({
    data: {
      ano: 2026,
      semestre: 2,
      aberturaSubmissao: new Date("2026-08-01T00:00:00Z"),
      encerramentoSubmissao: new Date("2026-12-15T23:59:59Z"),
    },
  });
  return { docente, curso, outroCurso, periodo };
}

async function perfisDe(usuarioId: number) {
  const registros = await prisma.usuarioPerfil.findMany({ where: { usuarioId } });
  return registros.map((r) => r.perfil);
}

beforeEach(async () => {
  await limpar();
});

afterAll(async () => {
  await prisma.$disconnect();
});

test("vincular docente ao curso cria o vínculo e o perfil DOCENTE", async () => {
  const { docente, curso, periodo } = await obterAmbiente();

  await vincularDocente(docente.id, curso.id, periodo.id);

  const vinculos = await listarVinculosDocente();
  expect(vinculos).toHaveLength(1);
  expect(vinculos[0]).toMatchObject({ docenteId: docente.id, cursoId: curso.id, periodoLetivoId: periodo.id });
  expect(await perfisDe(docente.id)).toEqual([Perfil.DOCENTE]);
});

test("vincular o mesmo docente ao mesmo curso e período duas vezes é rejeitado", async () => {
  const { docente, curso, periodo } = await obterAmbiente();
  await vincularDocente(docente.id, curso.id, periodo.id);

  await expect(vincularDocente(docente.id, curso.id, periodo.id)).rejects.toThrow(
    "Este docente já está vinculado a este curso neste período.",
  );
});

test("desvincular docente do único curso remove o perfil DOCENTE", async () => {
  const { docente, curso, periodo } = await obterAmbiente();
  await vincularDocente(docente.id, curso.id, periodo.id);
  const [vinculo] = await listarVinculosDocente();

  await desvincularDocente(vinculo.id);

  expect(await listarVinculosDocente()).toHaveLength(0);
  expect(await perfisDe(docente.id)).toEqual([]);
});

test("desvincular docente de um curso mantém o perfil DOCENTE se outro vínculo existe", async () => {
  const { docente, curso, outroCurso, periodo } = await obterAmbiente();
  await vincularDocente(docente.id, curso.id, periodo.id);
  await vincularDocente(docente.id, outroCurso.id, periodo.id);
  const [vinculo] = await listarVinculosDocente();

  await desvincularDocente(vinculo.id);

  expect(await listarVinculosDocente()).toHaveLength(1);
  expect(await perfisDe(docente.id)).toEqual([Perfil.DOCENTE]);
});

test("vínculo de docente que já tem relatório no curso e período não pode ser removido", async () => {
  const { docente, curso, periodo } = await obterAmbiente();
  await vincularDocente(docente.id, curso.id, periodo.id);
  await prisma.relatorio.create({ data: { docenteId: docente.id, cursoId: curso.id, periodoLetivoId: periodo.id } });
  const [vinculo] = await listarVinculosDocente();

  await expect(desvincularDocente(vinculo.id)).rejects.toThrow("o vínculo não pode ser removido");

  expect(await listarVinculosDocente()).toHaveLength(1);
  expect(await perfisDe(docente.id)).toEqual([Perfil.DOCENTE]);
});

test("vincular coordenador ao curso cria o vínculo e o perfil COORDENADOR", async () => {
  const { docente: coordenador, curso } = await obterAmbiente();

  await vincularCoordenador(coordenador.id, curso.id);

  const vinculos = await listarVinculosCoordenador();
  expect(vinculos).toHaveLength(1);
  expect(vinculos[0]).toMatchObject({ coordenadorId: coordenador.id, cursoId: curso.id });
  expect(await perfisDe(coordenador.id)).toEqual([Perfil.COORDENADOR]);
});

test("vincular o mesmo coordenador ao mesmo curso duas vezes é rejeitado", async () => {
  const { docente: coordenador, curso } = await obterAmbiente();
  await vincularCoordenador(coordenador.id, curso.id);

  await expect(vincularCoordenador(coordenador.id, curso.id)).rejects.toThrow(
    "Este coordenador já está vinculado a este curso.",
  );
});

test("desvincular coordenador do único curso remove o perfil COORDENADOR", async () => {
  const { docente: coordenador, curso } = await obterAmbiente();
  await vincularCoordenador(coordenador.id, curso.id);
  const [vinculo] = await listarVinculosCoordenador();

  await desvincularCoordenador(vinculo.id);

  expect(await listarVinculosCoordenador()).toHaveLength(0);
  expect(await perfisDe(coordenador.id)).toEqual([]);
});

test("usuário ou curso inativo não ganha vínculo novo, de docente nem de coordenador", async () => {
  const { docente, curso, outroCurso, periodo } = await obterAmbiente();
  await prisma.usuario.update({ where: { id: docente.id }, data: { ativo: false } });

  await expect(vincularDocente(docente.id, curso.id, periodo.id)).rejects.toThrow(
    "Helena está inativo — reative o cadastro antes de vincular a um curso.",
  );
  await expect(vincularCoordenador(docente.id, curso.id)).rejects.toThrow("Helena está inativo");

  await prisma.usuario.update({ where: { id: docente.id }, data: { ativo: true } });
  await prisma.curso.update({ where: { id: outroCurso.id }, data: { ativo: false } });

  await expect(vincularDocente(docente.id, outroCurso.id, periodo.id)).rejects.toThrow(
    "O curso ENF está inativo — reative-o antes de vincular alguém.",
  );
  await expect(vincularCoordenador(docente.id, outroCurso.id)).rejects.toThrow("O curso ENF está inativo");
  expect(await prisma.vinculoDocenteCurso.count()).toBe(0);
  expect(await prisma.vinculoCoordenadorCurso.count()).toBe(0);
});

describe("continuidade entre semestres", () => {
  const prazos = (ano: number, semestre: number) => ({
    ano,
    semestre,
    aberturaSubmissao: new Date(Date.UTC(ano, semestre === 1 ? 1 : 7, 1, 3)),
    encerramentoSubmissao: new Date(Date.UTC(ano, semestre === 1 ? 6 : 11, 10, 3)),
  });

  async function docentesDo(periodoLetivoId: number) {
    const vinculos = await prisma.vinculoDocenteCurso.findMany({
      where: { periodoLetivoId },
      include: { docente: true, curso: true },
      orderBy: { id: "asc" },
    });
    return vinculos.map((vinculo) => `${vinculo.docente.nome} em ${vinculo.curso.codigo}`);
  }

  test("período novo nasce com os docentes do anterior, só de docente e curso ativos, sem relatório", async () => {
    const { docente, curso, outroCurso, periodo } = await obterAmbiente();
    const saiu = await prisma.usuario.create({ data: { nome: "Saulo", email: "saulo@srha.dev" } });
    await vincularDocente(docente.id, curso.id, periodo.id);
    await vincularDocente(docente.id, outroCurso.id, periodo.id);
    await vincularDocente(saiu.id, curso.id, periodo.id);
    await prisma.usuario.update({ where: { id: saiu.id }, data: { ativo: false } });
    await prisma.curso.update({ where: { id: outroCurso.id }, data: { ativo: false } });

    const novo = await criarPeriodo(prazos(2027, 1));

    expect(await docentesDo(novo)).toEqual(["Helena em FIS"]);
    // O anterior fica como estava, e nenhum relatório nasce antes da hora.
    expect(await docentesDo(periodo.id)).toHaveLength(3);
    expect(await prisma.relatorio.count()).toBe(0);
  });

  test("o anterior é o de ano e semestre logo antes, não o último cadastrado", async () => {
    const { docente, curso, outroCurso, periodo } = await obterAmbiente(); // 2026/2
    await vincularDocente(docente.id, curso.id, periodo.id);

    // Cadastrado depois, mas mais antigo: não há período antes dele.
    const antigo = await criarPeriodo(prazos(2026, 1));
    expect(await docentesDo(antigo)).toEqual([]);
    await vincularDocente(docente.id, outroCurso.id, antigo);

    // 2027/1 vem de 2026/2, não de 2026/1.
    const novo = await criarPeriodo(prazos(2027, 1));
    expect(await docentesDo(novo)).toEqual(["Helena em FIS"]);
  });

  test("trazer de novo só acrescenta o que falta no período", async () => {
    const { docente, curso, outroCurso, periodo } = await obterAmbiente();
    await vincularDocente(docente.id, curso.id, periodo.id);
    const novo = await criarPeriodo(prazos(2027, 1));

    // Vínculo acrescentado no semestre anterior depois de criar o novo.
    await vincularDocente(docente.id, outroCurso.id, periodo.id);

    expect(await trazerVinculosDoPeriodoAnterior(novo)).toEqual({ origem: { ano: 2026, semestre: 2 }, trazidos: 1 });
    expect(await trazerVinculosDoPeriodoAnterior(novo)).toEqual({ origem: { ano: 2026, semestre: 2 }, trazidos: 0 });
    expect(await docentesDo(novo)).toEqual(["Helena em FIS", "Helena em ENF"]);
  });

  test("sem período anterior, não há o que trazer", async () => {
    const { periodo } = await obterAmbiente();

    expect(await trazerVinculosDoPeriodoAnterior(periodo.id)).toEqual({ origem: null, trazidos: 0 });
  });
});
