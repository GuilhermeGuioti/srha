import { exigirPerfil } from "../../../../../lib/auth/guards";
import { Perfil } from "../../../../../generated/prisma/client";
import { listarCursos } from "../../../../../lib/services/cursos";
import { listarPeriodos } from "../../../../../lib/services/periodos";
import { ListaCursos } from "./lista-cursos";

export default async function AdminCursosPage() {
  await exigirPerfil(Perfil.SECRETARIA);

  // Docentes do período mais recente: o vínculo é por período.
  const [recente] = await listarPeriodos();
  const cursos = await listarCursos(recente?.id ?? null);

  return (
    <ListaCursos
      periodoRotulo={recente ? `${recente.ano}/${recente.semestre}` : null}
      cursos={cursos.map((curso) => ({
        id: curso.id,
        codigo: curso.codigo,
        nome: curso.nome,
        ativo: curso.ativo,
        coordenadores: curso.coordenadores.map((vinculo) => vinculo.coordenador.nome),
        totalDocentes: curso._count.docentes,
      }))}
    />
  );
}
