import { prisma } from "../db";
import { Perfil, Prisma } from "../../generated/prisma/client";
import { sincronizarPerfil } from "./perfis";

export async function listarVinculosDocente() {
  return prisma.vinculoDocenteCurso.findMany({
    include: { docente: true, curso: true, periodo: true },
    orderBy: [
      { periodo: { ano: "desc" } },
      { periodo: { semestre: "desc" } },
      { curso: { nome: "asc" } },
      { docente: { nome: "asc" } },
    ],
  });
}

export async function listarVinculosCoordenador() {
  return prisma.vinculoCoordenadorCurso.findMany({
    include: { coordenador: true, curso: true },
    orderBy: [{ curso: { nome: "asc" } }, { coordenador: { nome: "asc" } }],
  });
}

// Pessoa ou curso inativo não ganha vínculo novo, venha de que tela vier —
// a de usuários lista também os inativos. O que já existe continua.
async function exigirAtivos(usuarioId: number, cursoId: number): Promise<void> {
  const [usuario, curso] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: usuarioId } }),
    prisma.curso.findUnique({ where: { id: cursoId } }),
  ]);
  if (!usuario || !curso) {
    throw new Error("Usuário ou curso não encontrado.");
  }
  if (!usuario.ativo) {
    throw new Error(`${usuario.nome} está inativo — reative o cadastro antes de vincular a um curso.`);
  }
  if (!curso.ativo) {
    throw new Error(`O curso ${curso.codigo} está inativo — reative-o antes de vincular alguém.`);
  }
}

export async function vincularDocente(docenteId: number, cursoId: number, periodoLetivoId: number): Promise<void> {
  await exigirAtivos(docenteId, cursoId);
  const existente = await prisma.vinculoDocenteCurso.findUnique({
    where: { docenteId_cursoId_periodoLetivoId: { docenteId, cursoId, periodoLetivoId } },
  });
  if (existente) {
    throw new Error("Este docente já está vinculado a este curso neste período.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.vinculoDocenteCurso.create({ data: { docenteId, cursoId, periodoLetivoId } });
    await sincronizarPerfil(tx, docenteId, Perfil.DOCENTE, true);
  });
}

export async function desvincularDocente(vinculoId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const vinculo = await tx.vinculoDocenteCurso.findUnique({ where: { id: vinculoId } });
    if (!vinculo) {
      throw new Error("Vínculo não encontrado.");
    }
    // Arquivo e painel partem dos vínculos: sem ele, o relatório — mesmo
    // aprovado — sumiria da consulta (RNF09). Mesma regra do RF03 para curso
    // com relatório: bloqueia com mensagem em vez de excluir.
    const relatorio = await tx.relatorio.findUnique({
      where: {
        docenteId_cursoId_periodoLetivoId: {
          docenteId: vinculo.docenteId,
          cursoId: vinculo.cursoId,
          periodoLetivoId: vinculo.periodoLetivoId,
        },
      },
    });
    if (relatorio) {
      throw new Error(
        "Este docente já começou o relatório deste curso neste período — o vínculo não pode ser removido.",
      );
    }
    await tx.vinculoDocenteCurso.delete({ where: { id: vinculoId } });
    const restam = await tx.vinculoDocenteCurso.count({ where: { docenteId: vinculo.docenteId } });
    await sincronizarPerfil(tx, vinculo.docenteId, Perfil.DOCENTE, restam > 0);
  });
}

export async function vincularCoordenador(coordenadorId: number, cursoId: number): Promise<void> {
  await exigirAtivos(coordenadorId, cursoId);
  const existente = await prisma.vinculoCoordenadorCurso.findUnique({
    where: { coordenadorId_cursoId: { coordenadorId, cursoId } },
  });
  if (existente) {
    throw new Error("Este coordenador já está vinculado a este curso.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.vinculoCoordenadorCurso.create({ data: { coordenadorId, cursoId } });
    await sincronizarPerfil(tx, coordenadorId, Perfil.COORDENADOR, true);
  });
}

export async function desvincularCoordenador(vinculoId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const vinculo = await tx.vinculoCoordenadorCurso.delete({ where: { id: vinculoId } });
    const restam = await tx.vinculoCoordenadorCurso.count({ where: { coordenadorId: vinculo.coordenadorId } });
    await sincronizarPerfil(tx, vinculo.coordenadorId, Perfil.COORDENADOR, restam > 0);
  });
}

export type ResultadoContinuidade = { origem: { ano: number; semestre: number } | null; trazidos: number };

/**
 * Continuidade entre semestres: traz para o período os vínculos de docente do
 * período anterior — o cadastrado logo antes dele por ano e semestre, não o
 * último criado —, só de docente e curso ativos. Só acrescenta: quem saiu do
 * curso a secretaria tira à mão. Não cria relatório: a linha de Relatorio
 * continua nascendo sob demanda, e quem nunca abrir o sistema aparece como
 * "não iniciado" no painel (RF18).
 */
export async function copiarVinculosDoPeriodoAnterior(
  tx: Prisma.TransactionClient,
  periodoLetivoId: number,
): Promise<ResultadoContinuidade> {
  const periodo = await tx.periodoLetivo.findUnique({ where: { id: periodoLetivoId } });
  if (!periodo) {
    throw new Error("Período letivo não encontrado.");
  }
  const anterior = await tx.periodoLetivo.findFirst({
    where: { OR: [{ ano: { lt: periodo.ano } }, { ano: periodo.ano, semestre: { lt: periodo.semestre } }] },
    orderBy: [{ ano: "desc" }, { semestre: "desc" }],
  });
  if (!anterior) {
    return { origem: null, trazidos: 0 };
  }
  // Quem tem vínculo no anterior já tem o perfil de docente (sincronizarPerfil
  // só o tira quando não sobra vínculo nenhum): não há perfil a acertar.
  const vinculos = await tx.vinculoDocenteCurso.findMany({
    where: { periodoLetivoId: anterior.id, docente: { ativo: true }, curso: { ativo: true } },
    select: { docenteId: true, cursoId: true },
    orderBy: { id: "asc" },
  });
  const { count } = await tx.vinculoDocenteCurso.createMany({
    data: vinculos.map((vinculo) => ({ ...vinculo, periodoLetivoId })),
    skipDuplicates: true,
  });
  return { origem: { ano: anterior.ano, semestre: anterior.semestre }, trazidos: count };
}

export async function trazerVinculosDoPeriodoAnterior(periodoLetivoId: number): Promise<ResultadoContinuidade> {
  return prisma.$transaction((tx) => copiarVinculosDoPeriodoAnterior(tx, periodoLetivoId));
}
