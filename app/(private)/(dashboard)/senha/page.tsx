import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CabecalhoAdmin } from "../../../../components/CabecalhoAdmin";
import { Cartao } from "../../../../components/Cartao";
import { exigirSessaoPagina, obterUsuario } from "../../../../lib/auth/guards";
import { FormularioSenha } from "./formulario-senha";

export const metadata: Metadata = {
  title: "Alterar senha - SRHA",
};

// Qualquer perfil, mas só quem tem senha: quem entra só pela Microsoft não
// ganha senha por conta própria — essa sai da secretaria.
export default async function SenhaPage() {
  const sessao = await exigirSessaoPagina();
  const usuario = await obterUsuario(sessao.usuarioId);
  if (!usuario.senhaHash) {
    redirect("/");
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoAdmin
        titulo="Alterar senha"
        subtitulo={
          <p className="text-[15px] text-tinta-suave">
            Senha de acesso por e-mail. Esqueceu a atual? Peça à secretaria acadêmica uma senha provisória.
          </p>
        }
      />
      <Cartao className="px-5 py-6 sm:px-7">
        <FormularioSenha />
      </Cartao>
    </div>
  );
}
