"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPerfil } from "../../../../../lib/auth/guards";
import { Perfil } from "../../../../../generated/prisma/client";
import {
  vincularDocente,
  desvincularDocente,
  vincularCoordenador,
  desvincularCoordenador,
  previaRenovacao,
  renovarVinculos,
  type PreviaRenovacao,
} from "../../../../../lib/services/vinculos";
import { SchemaArquivoPlanilha, type ResultadoImportacao } from "../../../../../lib/importacao";
import { importarVinculosDocente, importarVinculosCoordenador } from "../../../../../lib/services/importacao";
import { paraResultadoErro, type Resultado } from "../../../../../lib/tipos";

const SchemaId = z.object({ id: z.number().int().positive() });

// Vínculo aparece em três telas: a de vínculos, a linha de cada pessoa em
// usuários (que também vincula) e a coordenação e o total de docentes em cursos.
function revalidarTelasDeVinculo(): void {
  revalidatePath("/admin/vinculos");
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/cursos");
}

const Id = z.number().int().positive();

const SchemaNovoVinculo = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("docente"), pessoaId: Id, cursoId: Id, periodoLetivoId: Id }),
  z.object({ tipo: z.literal("coordenador"), pessoaId: Id, cursoId: Id }),
]);

export type DadosNovoVinculo = z.infer<typeof SchemaNovoVinculo>;

// Das duas telas que vinculam: /admin/vinculos e a linha de cada pessoa em /admin/usuarios.
export async function acaoVincular(dados: DadosNovoVinculo): Promise<Resultado<void>> {
  try {
    await exigirPerfil(Perfil.SECRETARIA); // 1. guard
    const validado = SchemaNovoVinculo.parse(dados); // 2. zod
    if (validado.tipo === "docente") {
      await vincularDocente(validado.pessoaId, validado.cursoId, validado.periodoLetivoId); // 3. serviço
    } else {
      await vincularCoordenador(validado.pessoaId, validado.cursoId);
    }
    revalidarTelasDeVinculo(); // 4. revalidação
    return { ok: true, dados: undefined };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}

export async function acaoDesvincularDocente(id: number): Promise<Resultado<void>> {
  try {
    await exigirPerfil(Perfil.SECRETARIA);
    const validado = SchemaId.parse({ id });
    await desvincularDocente(validado.id);
    revalidarTelasDeVinculo();
    return { ok: true, dados: undefined };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}

export async function acaoDesvincularCoordenador(id: number): Promise<Resultado<void>> {
  try {
    await exigirPerfil(Perfil.SECRETARIA);
    const validado = SchemaId.parse({ id });
    await desvincularCoordenador(validado.id);
    revalidarTelasDeVinculo();
    return { ok: true, dados: undefined };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}

// Só lê: abre a renovação com os docentes do período anterior, por curso.
export async function acaoPreviaRenovacao(periodoLetivoId: number): Promise<Resultado<PreviaRenovacao>> {
  try {
    await exigirPerfil(Perfil.SECRETARIA);
    const validado = SchemaId.parse({ id: periodoLetivoId });
    return { ok: true, dados: await previaRenovacao(validado.id) };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}

const SchemaRenovacao = z.object({
  periodoLetivoId: Id,
  selecionados: z.array(z.object({ docenteId: Id, cursoId: Id })).min(1, "Marque ao menos um docente.").max(10_000),
});

export async function acaoRenovarVinculos(
  dados: z.infer<typeof SchemaRenovacao>,
): Promise<Resultado<{ origem: { ano: number; semestre: number } | null; renovados: number }>> {
  try {
    await exigirPerfil(Perfil.SECRETARIA);
    const validado = SchemaRenovacao.parse(dados);
    const resultado = await renovarVinculos(validado.periodoLetivoId, validado.selecionados);
    revalidarTelasDeVinculo();
    return { ok: true, dados: resultado };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}

export async function acaoImportarVinculosDocente(formulario: FormData): Promise<Resultado<ResultadoImportacao>> {
  try {
    await exigirPerfil(Perfil.SECRETARIA);
    const arquivo = SchemaArquivoPlanilha.parse(formulario.get("arquivo"));
    const resultado = await importarVinculosDocente(new Uint8Array(await arquivo.arrayBuffer()));
    revalidarTelasDeVinculo();
    return { ok: true, dados: resultado };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}

export async function acaoImportarVinculosCoordenador(formulario: FormData): Promise<Resultado<ResultadoImportacao>> {
  try {
    await exigirPerfil(Perfil.SECRETARIA);
    const arquivo = SchemaArquivoPlanilha.parse(formulario.get("arquivo"));
    const resultado = await importarVinculosCoordenador(new Uint8Array(await arquivo.arrayBuffer()));
    revalidarTelasDeVinculo();
    return { ok: true, dados: resultado };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}
