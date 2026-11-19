import { prisma } from "../db";

export type DadosCurso = {
  codigo: string;
  nome: string;
  ativo: boolean;
};

export async function listarCursos() {
  return prisma.curso.findMany({
    orderBy: { nome: "asc" },
    include: {
      coordenadores: { include: { coordenador: true } },
      _count: { select: { docentes: true } },
    },
  });
}

async function exigirDisponivel(dados: DadosCurso, ignorarId?: number): Promise<void> {
  const [mesmoCodigo, mesmoNome] = await Promise.all([
    prisma.curso.findUnique({ where: { codigo: dados.codigo } }),
    prisma.curso.findUnique({ where: { nome: dados.nome } }),
  ]);
  if (mesmoCodigo && mesmoCodigo.id !== ignorarId) {
    throw new Error(`Já existe um curso com o código ${dados.codigo} (${mesmoCodigo.nome}).`);
  }
  if (mesmoNome && mesmoNome.id !== ignorarId) {
    throw new Error("Já existe um curso com este nome.");
  }
}

export async function criarCurso(dados: DadosCurso): Promise<number> {
  await exigirDisponivel(dados);
  const curso = await prisma.curso.create({ data: dados });
  return curso.id;
}

// O código pode mudar: vínculos e relatórios apontam para o id, e o código só
// serve para achar o curso nas planilhas.
export async function atualizarCurso(id: number, dados: DadosCurso): Promise<void> {
  await exigirDisponivel(dados, id);
  await prisma.curso.update({ where: { id }, data: dados });
}
