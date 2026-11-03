import { signIn } from "./config";
import { obterUsuario } from "./guards";

// Trocar a senha muda a versaoSessao e derruba todas as sessões da pessoa —
// inclusive a de quem acabou de trocar. Esta reabre só a dela, com a senha
// nova, para ela seguir sem precisar entrar de novo.
export async function renovarSessaoAposTrocarSenha(usuarioId: number, novaSenha: string): Promise<void> {
  const usuario = await obterUsuario(usuarioId);
  await signIn("senha", { email: usuario.email, senha: novaSenha, redirect: false });
}
