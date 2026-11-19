import { prisma } from "../../db";
import {
  listarVinculosDocente,
  listarVinculosCoordenador,
  vincularDocente,
  desvincularDocente,
  vincularCoordenador,
  desvincularCoordenador,
  previaRenovacao,
  renovarVinculos,
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
  const periodo = await prisma.periodoLetivo.create({ data: { ano: 2026, semestre: 2, ...emAberto() } });
  return { docente, curso, outroCurso, periodo };
}

// Vínculo de docente só muda em período não encerrado: as datas acompanham o
// dia em que o teste roda, e o rótulo (ano/semestre) fica livre.
const DIA = 86_400_000;
function emAberto() {
  return { aberturaSubmissao: new Date(Date.now() - 30 * DIA), encerramentoSubmissao: new Date(Date.now() + 30 * DIA) };
}
function encerrado() {
  return { aberturaSubmissao: new Date(Date.now() - 60 * DIA), encerramentoSubmissao: new Date(Date.now() - DIA) };
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

describe("período encerrado", () => {
  async function encerrar(periodoLetivoId: number) {
    await prisma.periodoLetivo.update({ where: { id: periodoLetivoId }, data: encerrado() });
  }

  test("não ganha nem perde vínculo de docente; reaberto, volta a mudar", async () => {
    const { docente, curso, outroCurso, periodo } = await obterAmbiente();
    await vincularDocente(docente.id, curso.id, periodo.id);
    const [vinculo] = await listarVinculosDocente();
    await encerrar(periodo.id);

    const mensagem = "O período 2026/2 já foi encerrado — os vínculos de docente dele não mudam mais.";
    await expect(vincularDocente(docente.id, outroCurso.id, periodo.id)).rejects.toThrow(mensagem);
    await expect(desvincularDocente(vinculo.id)).rejects.toThrow(mensagem);
    expect(await listarVinculosDocente()).toHaveLength(1);

    // Estendendo o encerramento, a secretaria reabre o período e corrige.
    await prisma.periodoLetivo.update({ where: { id: periodo.id }, data: emAberto() });
    await desvincularDocente(vinculo.id);
    expect(await listarVinculosDocente()).toHaveLength(0);
  });

  test("coordenação não tem período: continua mudando", async () => {
    const { docente, curso, periodo } = await obterAmbiente();
    await encerrar(periodo.id);

    await vincularCoordenador(docente.id, curso.id);
    const [vinculo] = await listarVinculosCoordenador();
    await desvincularCoordenador(vinculo.id);

    expect(await listarVinculosCoordenador()).toHaveLength(0);
  });

  test("não é destino de renovação", async () => {
    const { docente, curso, periodo } = await obterAmbiente();
    await vincularDocente(docente.id, curso.id, periodo.id);
    const novo = await prisma.periodoLetivo.create({ data: { ano: 2027, semestre: 1, ...encerrado() } });

    await expect(previaRenovacao(novo.id)).rejects.toThrow("O período 2027/1 já foi encerrado");
    await expect(renovarVinculos(novo.id, [{ docenteId: docente.id, cursoId: curso.id }])).rejects.toThrow(
      "O período 2027/1 já foi encerrado",
    );
  });
});

test("remover vínculo de coordenador que não existe mais dá mensagem clara", async () => {
  await expect(desvincularCoordenador(999)).rejects.toThrow("Vínculo não encontrado.");
});

describe("renovação de semestre", () => {
  const prazos = (ano: number, semestre: number) => ({ ano, semestre, ...emAberto() });

  async function docentesDo(periodoLetivoId: number) {
    const vinculos = await prisma.vinculoDocenteCurso.findMany({
      where: { periodoLetivoId },
      include: { docente: true, curso: true },
      orderBy: { id: "asc" },
    });
    return vinculos.map((vinculo) => `${vinculo.docente.nome} em ${vinculo.curso.codigo}`);
  }

  // 2026/2 com Helena em FIS e ENF, Ana em FIS e Saulo (inativado) em FIS.
  async function semestreAnterior() {
    const ambiente = await obterAmbiente();
    const { docente, curso, outroCurso, periodo } = ambiente;
    const [ana, saulo] = await Promise.all([
      prisma.usuario.create({ data: { nome: "Ana", email: "ana@srha.dev" } }),
      prisma.usuario.create({ data: { nome: "Saulo", email: "saulo@srha.dev" } }),
    ]);
    await vincularDocente(docente.id, curso.id, periodo.id);
    await vincularDocente(docente.id, outroCurso.id, periodo.id);
    await vincularDocente(ana.id, curso.id, periodo.id);
    await vincularDocente(saulo.id, curso.id, periodo.id);
    await prisma.usuario.update({ where: { id: saulo.id }, data: { ativo: false } });
    // O caso de todo semestre: o anterior já encerrou quando a renovação abre.
    await prisma.periodoLetivo.update({ where: { id: periodo.id }, data: encerrado() });
    return { ...ambiente, ana, saulo };
  }

  test("período novo nasce sem docente: a renovação é que traz", async () => {
    await semestreAnterior();

    const novo = await criarPeriodo(prazos(2027, 1));

    expect(await docentesDo(novo)).toEqual([]);
  });

  test("a prévia mostra por curso, em ordem alfabética, só quem dá para renovar", async () => {
    const { docente, curso, outroCurso, ana } = await semestreAnterior();
    const novo = await criarPeriodo(prazos(2027, 1));

    expect(await previaRenovacao(novo)).toEqual({
      destino: { ano: 2027, semestre: 1 },
      origem: { ano: 2026, semestre: 2 },
      cursos: [
        { id: outroCurso.id, codigo: "ENF", nome: "Enfermagem", docentes: [{ id: docente.id, nome: "Helena" }] },
        {
          id: curso.id,
          codigo: "FIS",
          nome: "Fisioterapia",
          docentes: [
            { id: ana.id, nome: "Ana" },
            { id: docente.id, nome: "Helena" },
          ],
        },
      ],
      jaNoPeriodo: 0,
      inativos: 1,
    });
  });

  test("renovar grava só os marcados, sem relatório; o que já está não volta na prévia", async () => {
    const { docente, curso, outroCurso, ana } = await semestreAnterior();
    const novo = await criarPeriodo(prazos(2027, 1));

    // Ana saiu: a secretaria desmarcou.
    const resultado = await renovarVinculos(novo, [
      { docenteId: docente.id, cursoId: curso.id },
      { docenteId: docente.id, cursoId: outroCurso.id },
    ]);

    expect(resultado).toEqual({ origem: { ano: 2026, semestre: 2 }, renovados: 2 });
    expect(await docentesDo(novo)).toEqual(["Helena em FIS", "Helena em ENF"]);
    expect(await prisma.relatorio.count()).toBe(0);

    const depois = await previaRenovacao(novo);
    expect(depois.cursos).toEqual([
      { id: curso.id, codigo: "FIS", nome: "Fisioterapia", docentes: [{ id: ana.id, nome: "Ana" }] },
    ]);
    expect(depois.jaNoPeriodo).toBe(2);
  });

  test("renovar recusa par fora do período anterior ou que deixou de valer, sem gravar nada", async () => {
    const { docente, curso, saulo } = await semestreAnterior();
    const novo = await criarPeriodo(prazos(2027, 1));
    const enfermagem = await prisma.curso.findUniqueOrThrow({ where: { codigo: "ENF" } });
    await prisma.vinculoDocenteCurso.deleteMany({ where: { cursoId: enfermagem.id } });

    for (const intruso of [
      { docenteId: docente.id, cursoId: enfermagem.id }, // não está mais no anterior
      { docenteId: saulo.id, cursoId: curso.id }, // inativo
    ]) {
      await expect(renovarVinculos(novo, [{ docenteId: docente.id, cursoId: curso.id }, intruso])).rejects.toThrow(
        "A lista mudou desde que a renovação foi aberta. Abra de novo e confira.",
      );
    }
    expect(await docentesDo(novo)).toEqual([]);
  });

  test("o anterior é o de ano e semestre logo antes, não o último cadastrado", async () => {
    await semestreAnterior(); // 2026/2

    const antigo = await criarPeriodo(prazos(2026, 1));
    const novo = await criarPeriodo(prazos(2027, 1));

    expect((await previaRenovacao(antigo)).origem).toBeNull();
    expect((await previaRenovacao(novo)).origem).toEqual({ ano: 2026, semestre: 2 });
  });

  test("sem período anterior, não há o que renovar", async () => {
    const { docente, curso, periodo } = await obterAmbiente();

    expect(await previaRenovacao(periodo.id)).toMatchObject({ origem: null, cursos: [] });
    await expect(renovarVinculos(periodo.id, [{ docenteId: docente.id, cursoId: curso.id }])).rejects.toThrow(
      "Não há período anterior a este cadastrado — nada a renovar.",
    );
  });
});
