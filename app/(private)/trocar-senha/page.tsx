import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CartaoPublico } from "../../../components/CartaoPublico";
import { exigirSessaoPagina, obterUsuario } from "../../../lib/auth/guards";
import { acaoSair } from "../../../lib/auth/acoes";
import { FormularioTrocaSenha } from "./formulario-troca-senha";

export const metadata: Metadata = {
  title: "Trocar senha - SRHA",
};

export default async function TrocarSenhaPage() {
  const sessao = await exigirSessaoPagina({ senhaProvisoria: "permitir" });
  const usuario = await obterUsuario(sessao.usuarioId);
  if (!usuario.senhaProvisoria) {
    redirect("/");
  }

  return (
    <main className="flex flex-1 flex-col items-center bg-papel px-4 py-10 sm:px-6 sm:py-14">
      <CartaoPublico
        sobretitulo="SRHA · Primeiro acesso"
        titulo="Escolha sua senha"
        descricao={
          <>
            Olá, {usuario.nome}. A senha que você recebeu da secretaria vale só para este primeiro acesso —
            escolha uma nova para continuar.
          </>
        }
      >
        <FormularioTrocaSenha />
        <form action={acaoSair} className="mt-4 flex justify-center">
          <button
            type="submit"
            className="min-h-11 rounded-sm px-2 text-[15px] font-semibold text-azul-interativo hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azul-interativo"
          >
            Sair sem trocar
          </button>
        </form>
      </CartaoPublico>
    </main>
  );
}
