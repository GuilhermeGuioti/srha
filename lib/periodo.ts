// Leitura do período letivo que não depende de banco: serve ao servidor (as
// regras de vínculo) e à tela (selo de situação, o que dá para alterar).

type ComEncerramento = { encerramentoSubmissao: Date | string };

// Encerrado: passou o encerramento da submissão. Aceita string porque as telas
// recebem as datas já serializadas pela fronteira servidor → cliente.
export function periodoEncerrado(periodo: ComEncerramento, agora: Date = new Date()): boolean {
  return agora > new Date(periodo.encerramentoSubmissao);
}

// Período encerrado já foi: os vínculos de docente dele não ganham nem perdem
// ninguém, por tela, renovação ou planilha (decisão de 2026-11-19). O que
// passou fica como estava — é dele que saem o painel e o arquivo. Para
// corrigir, a secretaria reabre o período estendendo o encerramento.
export function mensagemPeriodoEncerrado(periodo: { ano: number; semestre: number }): string {
  return `O período ${periodo.ano}/${periodo.semestre} já foi encerrado — os vínculos de docente dele não mudam mais.`;
}
