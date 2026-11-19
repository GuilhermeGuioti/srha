import { prisma } from "../db";
import { copiarVinculosDoPeriodoAnterior } from "./vinculos";

export type DadosPeriodo = {
  ano: number;
  semestre: number;
  aberturaSubmissao: Date;
  encerramentoSubmissao: Date;
};

export async function listarPeriodos() {
  return prisma.periodoLetivo.findMany({ orderBy: [{ ano: "desc" }, { semestre: "desc" }] });
}

async function exigirPeriodoDisponivel(ano: number, semestre: number, ignorarId?: number): Promise<void> {
  const existente = await prisma.periodoLetivo.findUnique({ where: { ano_semestre: { ano, semestre } } });
  if (existente && existente.id !== ignorarId) {
    throw new Error("Já existe um período letivo cadastrado para este ano e semestre.");
  }
}

function exigirPrazosValidos(dados: DadosPeriodo): void {
  if (dados.encerramentoSubmissao <= dados.aberturaSubmissao) {
    throw new Error("O encerramento da submissão deve ser depois da abertura.");
  }
}

// O período novo nasce com os docentes do anterior: sem isso, a secretaria
// vinculava todo mundo de novo a cada semestre.
export async function criarPeriodo(dados: DadosPeriodo): Promise<number> {
  await exigirPeriodoDisponivel(dados.ano, dados.semestre);
  exigirPrazosValidos(dados);
  return prisma.$transaction(async (tx) => {
    const periodo = await tx.periodoLetivo.create({ data: dados });
    await copiarVinculosDoPeriodoAnterior(tx, periodo.id);
    return periodo.id;
  });
}

export async function atualizarPeriodo(id: number, dados: DadosPeriodo): Promise<void> {
  await exigirPeriodoDisponivel(dados.ano, dados.semestre, id);
  exigirPrazosValidos(dados);
  await prisma.periodoLetivo.update({ where: { id }, data: dados });
}
