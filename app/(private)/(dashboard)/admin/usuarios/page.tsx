import { exigirPerfil } from "../../../../../lib/auth/guards";
import { Perfil } from "../../../../../generated/prisma/client";
import { listarUsuarios } from "../../../../../lib/services/usuarios";
import { formatarDataHora } from "../../../../../lib/formato";
import { ListaUsuarios } from "./lista-usuarios";

export default async function AdminUsuariosPage() {
  await exigirPerfil(Perfil.SECRETARIA);

  const usuarios = await listarUsuarios();

  return (
    <ListaUsuarios
      usuarios={usuarios.map((usuario) => ({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        ativo: usuario.ativo,
        secretaria: usuario.perfis.some((perfil) => perfil.perfil === Perfil.SECRETARIA),
        // Só a situação vai para o cliente, nunca o hash.
        senha: !usuario.senhaHash ? "nenhuma" : usuario.senhaProvisoria ? "provisoria" : "definida",
        historicoSenha: usuario.senhasDefinidas.map((definicao) => ({
          id: definicao.id,
          quem: definicao.definidaPor?.nome ?? "Implantação do sistema",
          quando: formatarDataHora(definicao.ocorridoEm),
        })),
        perfis: usuario.perfis.map((perfil) => perfil.perfil),
        // Coordenador que também dá aula no próprio curso tem vínculo duplo no
        // mesmo curso — a coluna mostra o curso uma vez só, o papel já está em Perfil.
        cursos: [
          ...new Set([
            ...usuario.vinculosDocente.map((vinculo) => vinculo.curso.nome),
            ...usuario.vinculosCoordenador.map((vinculo) => vinculo.curso.nome),
          ]),
        ],
      }))}
    />
  );
}
