"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao } from "../../../lib/auth/guards";
import { renovarSessaoAposTrocarSenha } from "../../../lib/auth/sessao";
import { SchemaNovaSenha } from "../../../lib/senha";
import { trocarSenhaProvisoria } from "../../../lib/services/usuarios";
import { paraResultadoErro, type Resultado } from "../../../lib/tipos";

export async function acaoTrocarSenha(novaSenha: string, confirmacao: string): Promise<Resultado<void>> {
  try {
    const sessao = await exigirSessao({ senhaProvisoria: "permitir" }); // 1. guard
    const dados = SchemaNovaSenha.parse({ novaSenha, confirmacao }); // 2. zod
    await trocarSenhaProvisoria(sessao.usuarioId, dados.novaSenha); // 3. serviço
    await renovarSessaoAposTrocarSenha(sessao.usuarioId, dados.novaSenha);
    revalidatePath("/", "layout"); // 4. revalidação
    return { ok: true, dados: undefined };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}
