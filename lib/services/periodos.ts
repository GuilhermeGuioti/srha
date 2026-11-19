import { prisma } from "../db";
import { SituacaoRelatorio } from "../../generated/prisma/client";

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

// Nasce sem docente: a renovação (previaRenovacao e renovarVinculos) traz os
// do período anterior que a secretaria confirmar.
export async function criarPeriodo(dados: DadosPeriodo): Promise<number> {
  await exigirPeriodoDisponivel(dados.ano, dados.semestre);
  exigirPrazosValidos(dados);
  const periodo = await prisma.periodoLetivo.create({ data: dados });
  return periodo.id;
}

// As datas sempre podem mudar (estender o prazo, reabrir). Ano e semestre não,
// se o período já tem relatório aprovado: o PDF emitido traz o período, e a
// /validar passaria a mostrar outro — o papel verdadeiro pareceria falso.
export async function atualizarPeriodo(id: number, dados: DadosPeriodo): Promise<void> {
  await exigirPeriodoDisponivel(dados.ano, dados.semestre, id);
  exigirPrazosValidos(dados);
  const atual = await prisma.periodoLetivo.findUnique({ where: { id } });
  if (!atual) {
    throw new Error("Período letivo não encontrado.");
  }
  const mudaRotulo = atual.ano !== dados.ano || atual.semestre !== dados.semestre;
  if (
    mudaRotulo &&
    (await prisma.relatorio.count({ where: { periodoLetivoId: id, situacao: SituacaoRelatorio.APROVADO } })) > 0
  ) {
    throw new Error(
      `O período ${atual.ano}/${atual.semestre} tem relatório aprovado — o ano e o semestre não podem mudar, porque o PDF emitido traz o período. As datas podem.`,
    );
  }
  await prisma.periodoLetivo.update({ where: { id }, data: dados });
}
