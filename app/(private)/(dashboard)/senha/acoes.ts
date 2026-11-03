"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "../../../../lib/auth/guards";
import { renovarSessaoAposTrocarSenha } from "../../../../lib/auth/sessao";
import { SchemaNovaSenha } from "../../../../lib/senha";
import { alterarSenha } from "../../../../lib/services/usuarios";
import { paraResultadoErro, type Resultado } from "../../../../lib/tipos";

const SchemaSenhaAtual = z.string().min(1, "Informe a senha atual.");

export async function acaoAlterarSenha(
  senhaAtual: string,
  novaSenha: string,
  confirmacao: string,
): Promise<Resultado<void>> {
  try {
    const sessao = await exigirSessao(); // 1. guard
    const atual = SchemaSenhaAtual.parse(senhaAtual); // 2. zod
    const dados = SchemaNovaSenha.parse({ novaSenha, confirmacao });
    await alterarSenha(sessao.usuarioId, atual, dados.novaSenha); // 3. serviço
    await renovarSessaoAposTrocarSenha(sessao.usuarioId, dados.novaSenha);
    revalidatePath("/senha"); // 4. revalidação
    return { ok: true, dados: undefined };
  } catch (erro) {
    return paraResultadoErro(erro);
  }
}
