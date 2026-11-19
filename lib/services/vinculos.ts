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
    // Removido em outra aba: sem isto, o delete lançava o erro cru do Prisma na tela.
    const existente = await tx.vinculoCoordenadorCurso.findUnique({ where: { id: vinculoId } });
    if (!existente) {
      throw new Error("Vínculo não encontrado.");
    }
    const vinculo = await tx.vinculoCoordenadorCurso.delete({ where: { id: vinculoId } });
    const restam = await tx.vinculoCoordenadorCurso.count({ where: { coordenadorId: vinculo.coordenadorId } });
    await sincronizarPerfil(tx, vinculo.coordenadorId, Perfil.COORDENADOR, restam > 0);
  });
}

// Renovação de semestre: o período novo começa sem docente, e a secretaria
// traz os do período anterior escolhendo quem continua — sem isso, vinculava
// todo mundo de novo a cada semestre. "Anterior" é o cadastrado logo antes por
// ano e semestre, não o último criado. Copia vínculo, nunca relatório: a linha
// de Relatorio continua nascendo sob demanda, e quem nunca abrir o sistema
// aparece como "não iniciado" no painel (RF18).

type Rotulo = { ano: number; semestre: number };

export type PreviaRenovacao = {
  destino: Rotulo;
  origem: Rotulo | null;
  // Só o que dá para renovar: docente e curso ativos, ainda fora do destino.
  cursos: { id: number; codigo: string; nome: string; docentes: { id: number; nome: string }[] }[];
  jaNoPeriodo: number;
  inativos: number;
};

export type ParRenovacao = { docenteId: number; cursoId: number };

async function periodoEAnterior(cliente: Prisma.TransactionClient, periodoLetivoId: number) {
  const periodo = await cliente.periodoLetivo.findUnique({ where: { id: periodoLetivoId } });
  if (!periodo) {
    throw new Error("Período letivo não encontrado.");
  }
  const anterior = await cliente.periodoLetivo.findFirst({
    where: { OR: [{ ano: { lt: periodo.ano } }, { ano: periodo.ano, semestre: { lt: periodo.semestre } }] },
    orderBy: [{ ano: "desc" }, { semestre: "desc" }],
  });
  return { periodo, anterior };
}

async function montarPrevia(cliente: Prisma.TransactionClient, periodoLetivoId: number): Promise<PreviaRenovacao> {
  const { periodo, anterior } = await periodoEAnterior(cliente, periodoLetivoId);
  const destino = { ano: periodo.ano, semestre: periodo.semestre };
  if (!anterior) {
    return { destino, origem: null, cursos: [], jaNoPeriodo: 0, inativos: 0 };
  }
  const [doAnterior, doDestino] = await Promise.all([
    cliente.vinculoDocenteCurso.findMany({
      where: { periodoLetivoId: anterior.id },
      include: { docente: true, curso: true },
    }),
    cliente.vinculoDocenteCurso.findMany({ where: { periodoLetivoId }, select: { docenteId: true, cursoId: true } }),
  ]);
  const presentes = new Set(doDestino.map((vinculo) => `${vinculo.docenteId}|${vinculo.cursoId}`));

  let jaNoPeriodo = 0;
  let inativos = 0;
  const porCurso = new Map<number, PreviaRenovacao["cursos"][number]>();
  for (const vinculo of doAnterior) {
    if (presentes.has(`${vinculo.docenteId}|${vinculo.cursoId}`)) {
      jaNoPeriodo++;
    } else if (!vinculo.docente.ativo || !vinculo.curso.ativo) {
      inativos++;
    } else {
      const curso = porCurso.get(vinculo.cursoId) ?? {
        id: vinculo.curso.id,
        codigo: vinculo.curso.codigo,
        nome: vinculo.curso.nome,
        docentes: [],
      };
      curso.docentes.push({ id: vinculo.docente.id, nome: vinculo.docente.nome });
      porCurso.set(vinculo.cursoId, curso);
    }
  }
  const emOrdem = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");
  const cursos = [...porCurso.values()].sort(emOrdem);
  for (const curso of cursos) curso.docentes.sort(emOrdem);
  return { destino, origem: { ano: anterior.ano, semestre: anterior.semestre }, cursos, jaNoPeriodo, inativos };
}

export async function previaRenovacao(periodoLetivoId: number): Promise<PreviaRenovacao> {
  return prisma.$transaction((tx) => montarPrevia(tx, periodoLetivoId));
}

/**
 * Grava os vínculos escolhidos na prévia. Cada par precisa ser renovável
 * agora — tela aberta há tempo pode ter par que outra pessoa já vinculou
 * (é pulado) ou que deixou de valer (docente inativado: recusa tudo).
 * Quem tem vínculo no anterior já tem o perfil de docente: não há perfil a
 * acertar.
 */
export async function renovarVinculos(
  periodoLetivoId: number,
  selecionados: ParRenovacao[],
): Promise<{ origem: Rotulo | null; renovados: number }> {
  return prisma.$transaction(async (tx) => {
    const { anterior } = await periodoEAnterior(tx, periodoLetivoId);
    if (!anterior) {
      throw new Error("Não há período anterior a este cadastrado — nada a renovar.");
    }
    const renovaveis = await tx.vinculoDocenteCurso.findMany({
      where: { periodoLetivoId: anterior.id, docente: { ativo: true }, curso: { ativo: true } },
      select: { docenteId: true, cursoId: true },
    });
    const permitidos = new Set(renovaveis.map((par) => `${par.docenteId}|${par.cursoId}`));
    if (selecionados.some((par) => !permitidos.has(`${par.docenteId}|${par.cursoId}`))) {
      throw new Error("A lista mudou desde que a renovação foi aberta. Abra de novo e confira.");
    }
    const { count } = await tx.vinculoDocenteCurso.createMany({
      data: selecionados.map((par) => ({ ...par, periodoLetivoId })),
      skipDuplicates: true,
    });
    return { origem: { ano: anterior.ano, semestre: anterior.semestre }, renovados: count };
  });
}
