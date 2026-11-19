import { prisma } from "../db";

export type DadosCurso = {
  codigo: string;
  nome: string;
  ativo: boolean;
};

// O total de docentes é de um período só (o mais recente, na tela): o vínculo
// é por período, e contar todos somaria o mesmo docente a cada semestre
// renovado. Sem período, conta zero. Coordenação na ordem de cadastro do
// vínculo — o primeiro ativo é quem avalia.
export async function listarCursos(periodoLetivoId: number | null = null) {
  return prisma.curso.findMany({
    orderBy: { nome: "asc" },
    include: {
      coordenadores: { include: { coordenador: true }, orderBy: { id: "asc" } },
      _count: { select: { docentes: { where: { periodoLetivoId: periodoLetivoId ?? -1 } } } },
    },
  });
}

// Nome comparado sem caixa, como na importação: o @unique do banco diferencia,
// e "fisioterapia" virava um segundo curso ao lado de "Fisioterapia".
async function exigirDisponivel(dados: DadosCurso, ignorarId?: number): Promise<void> {
  const [mesmoCodigo, mesmoNome] = await Promise.all([
    prisma.curso.findUnique({ where: { codigo: dados.codigo } }),
    prisma.curso.findFirst({
      where: { nome: { equals: dados.nome, mode: "insensitive" }, id: ignorarId ? { not: ignorarId } : undefined },
    }),
  ]);
  if (mesmoCodigo && mesmoCodigo.id !== ignorarId) {
    throw new Error(`Já existe um curso com o código ${dados.codigo} (${mesmoCodigo.nome}).`);
  }
  if (mesmoNome) {
    throw new Error(`Já existe o curso "${mesmoNome.nome}", com o código ${mesmoNome.codigo}.`);
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
