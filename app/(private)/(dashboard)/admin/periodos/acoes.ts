"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPerfil } from "../../../../../lib/auth/guards";
import { Perfil } from "../../../../../generated/prisma/client";
import { criarPeriodo, atualizarPeriodo } from "../../../../../lib/services/periodos";
import { paraResultadoErro, type Resultado } from "../../../../../lib/tipos";

const SchemaId = z.number().int().positive();

const SchemaPeriodo = z.object({
  ano: z.number().int().min(2000, "Informe um ano válido."),
  semestre: z.number().int().min(1, "Semestre deve ser 1 ou 2.").max(2, "Semestre deve ser 1 ou 2."),
  aberturaSubmissao: z.date(),
  encerramentoSubmissao: z.date(),
});

export type DadosFormularioPeriodo = z.infer<typeof SchemaPeriodo>;

// O período aparece nos formulários e listas de vínculo, e as datas decidem o
// que ainda dá para vincular (período encerrado não muda) e o total de
// docentes de cada curso.
function revalidarTelasDePeriodo(): void {
  revalidatePath("/admin/periodos");
  revalidatePath("/admin/vinculos");
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/cursos");
}

export async function acaoCriarPeriodo(
  dados: DadosFormularioPeriodo,
): Promise<Resultado<{ id: number }>> {
  try {
    await exigirPerfil(Perfil.SECRETARIA); // 1. guard
    const validado = SchemaPeriodo.parse(dados); // 2. zod
    const id = await criarPeriodo(validado); // 3. serviço
    revalidarTelasDePeriodo(); // 4. revalidação
    return { ok: true, dados: { id } };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}

export async function acaoAtualizarPeriodo(
  id: number,
  dados: DadosFormularioPeriodo,
): Promise<Resultado<void>> {
  try {
    await exigirPerfil(Perfil.SECRETARIA);
    const idValidado = SchemaId.parse(id);
    const validado = SchemaPeriodo.parse(dados);
    await atualizarPeriodo(idValidado, validado);
    revalidarTelasDePeriodo();
    return { ok: true, dados: undefined };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}
