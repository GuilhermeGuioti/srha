import { exigirPerfil } from "../../../../../lib/auth/guards";
import { Perfil } from "../../../../../generated/prisma/client";
import { prisma } from "../../../../../lib/db";
import { listarUsuarios } from "../../../../../lib/services/usuarios";
import { listarPeriodos } from "../../../../../lib/services/periodos";
import { formatarDataHora } from "../../../../../lib/formato";
import { ListaUsuarios } from "./lista-usuarios";

export default async function AdminUsuariosPage() {
  await exigirPerfil(Perfil.SECRETARIA);

  const [usuarios, cursosAtivos, periodos] = await Promise.all([
    listarUsuarios(),
    prisma.curso.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    listarPeriodos(),
  ]);

  return (
    <ListaUsuarios
      cursos={cursosAtivos.map((curso) => ({ id: curso.id, codigo: curso.codigo, nome: curso.nome }))}
      periodos={periodos.map((periodo) => ({ id: periodo.id, rotulo: `${periodo.ano}/${periodo.semestre}` }))}
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
        // Coordenação primeiro (não depende de período), depois a docência do
        // período mais recente ao mais antigo — a ordem que listarUsuarios já traz.
        vinculos: [
          ...usuario.vinculosCoordenador.map((vinculo) => ({
            id: vinculo.id,
            tipo: "coordenador" as const,
            cursoCodigo: vinculo.curso.codigo,
            cursoNome: vinculo.curso.nome,
          })),
          ...usuario.vinculosDocente.map((vinculo) => ({
            id: vinculo.id,
            tipo: "docente" as const,
            cursoCodigo: vinculo.curso.codigo,
            cursoNome: vinculo.curso.nome,
            periodoRotulo: `${vinculo.periodo.ano}/${vinculo.periodo.semestre}`,
          })),
        ],
      }))}
    />
  );
}
