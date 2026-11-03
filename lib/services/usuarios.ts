import { prisma } from "../db";
import { Perfil } from "../../generated/prisma/client";
import { sincronizarPerfil } from "./perfis";
import { gerarHashSenha, verificarSenha } from "../auth/senha";
import { buscarUsuarioPelaSenha, LIMITE_TENTATIVAS_SENHA, MINUTOS_BLOQUEIO_SENHA } from "../auth/login";

export type DadosUsuario = {
  nome: string;
  email: string;
  ativo: boolean;
  secretaria: boolean;
};

export async function listarUsuarios() {
  return prisma.usuario.findMany({
    orderBy: { nome: "asc" },
    include: {
      perfis: true,
      senhasDefinidas: { orderBy: { ocorridoEm: "desc" }, include: { definidaPor: { select: { nome: true } } } },
      vinculosDocente: { include: { curso: true } },
      vinculosCoordenador: { include: { curso: true } },
    },
  });
}

async function exigirEmailDisponivel(email: string, ignorarId?: number): Promise<void> {
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente && existente.id !== ignorarId) {
    throw new Error("Já existe um usuário com este e-mail.");
  }
}

export async function criarUsuario(dados: DadosUsuario): Promise<number> {
  await exigirEmailDisponivel(dados.email);
  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: { nome: dados.nome, email: dados.email, ativo: dados.ativo },
    });
    await sincronizarPerfil(tx, usuario.id, Perfil.SECRETARIA, dados.secretaria);
    return usuario.id;
  });
}

const SECRETARIA_ATIVA = { ativo: true, perfis: { some: { perfil: Perfil.SECRETARIA } } };

export async function atualizarUsuario(id: number, dados: DadosUsuario): Promise<void> {
  await exigirEmailDisponivel(dados.email, id);
  await prisma.$transaction(async (tx) => {
    // Duas secretarias se inativando ao mesmo tempo: cada transação ainda via
    // a outra ativa e as duas passavam. Travando os perfis de secretaria, a
    // segunda espera a primeira e já conta o que sobrou.
    await tx.$queryRaw`SELECT 1 FROM "UsuarioPerfil" WHERE "perfil" = 'SECRETARIA' FOR UPDATE`;
    const eraSecretariaAtiva = await tx.usuario.count({ where: { id, ...SECRETARIA_ATIVA } });
    await tx.usuario.update({
      where: { id },
      data: { nome: dados.nome, email: dados.email, ativo: dados.ativo },
    });
    await sincronizarPerfil(tx, id, Perfil.SECRETARIA, dados.secretaria);
    // Sem ninguém ativo na secretaria, ninguém mais cadastra, vincula ou
    // reativa — o sistema trancaria por dentro. Se esta alteração tirou uma
    // secretaria ativa, confere quantas restaram e desfaz tudo se zerou.
    const deixouDeSer = eraSecretariaAtiva > 0 && !(dados.ativo && dados.secretaria);
    if (deixouDeSer && (await tx.usuario.count({ where: SECRETARIA_ATIVA })) === 0) {
      throw new Error(
        "O sistema precisa de ao menos uma pessoa ativa na secretaria acadêmica — cadastre outra antes de inativar esta ou tirar o perfil dela.",
      );
    }
  });
}

// A senha definida pela secretaria é sempre provisória: ela passa a senha para
// a pessoa, e os guards obrigam a troca no primeiro acesso. Serve também para
// quem esqueceu a senha ou ficou bloqueado — por isso zera o bloqueio. Toda
// mudança de senha incrementa versaoSessao, o que encerra as sessões abertas.
//
// Cada definição fica registrada em DefinicaoSenha, com quem definiu — senão a
// secretaria podia entrar como outra pessoa sem deixar marca. definidaPorId
// nulo só para a senha inicial do seed.
export async function definirSenhaProvisoria(
  id: number,
  senha: string,
  definidaPorId: number | null,
): Promise<void> {
  const senhaHash = await gerarHashSenha(senha);
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id },
      data: {
        senhaHash,
        senhaProvisoria: true,
        tentativasSenha: 0,
        senhaBloqueadaAte: null,
        versaoSessao: { increment: 1 },
      },
    }),
    prisma.definicaoSenha.create({ data: { usuarioId: id, definidaPorId } }),
  ]);
}

// Só troca a provisória: quem entra pela Microsoft não ganha senha por aqui, e
// quem já tem senha própria altera em alterarSenha, informando a atual.
export async function trocarSenhaProvisoria(id: number, novaSenha: string): Promise<void> {
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id } });
  if (!usuario.senhaProvisoria || !usuario.senhaHash) {
    throw new Error("Não há senha provisória para trocar.");
  }
  if (await verificarSenha(novaSenha, usuario.senhaHash)) {
    throw new Error("A nova senha precisa ser diferente da provisória.");
  }
  const senhaHash = await gerarHashSenha(novaSenha);
  await prisma.usuario.update({
    where: { id },
    data: { senhaHash, senhaProvisoria: false, versaoSessao: { increment: 1 } },
  });
}

// Alteração pela própria pessoa (menu da conta). Pede a senha atual para que
// uma sessão esquecida aberta não baste para trocar a senha e trancar o dono
// fora — e confere pelo mesmo caminho do login, que conta as tentativas.
export async function alterarSenha(id: number, senhaAtual: string, novaSenha: string): Promise<void> {
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id } });
  if (!usuario.senhaHash || usuario.senhaProvisoria) {
    throw new Error("Não há senha própria para alterar.");
  }
  if ((await buscarUsuarioPelaSenha(usuario.email, senhaAtual))?.id !== id) {
    throw new Error(
      `A senha atual está incorreta. Depois de ${LIMITE_TENTATIVAS_SENHA} tentativas erradas, o acesso por senha fica bloqueado por ${MINUTOS_BLOQUEIO_SENHA} minutos.`,
    );
  }
  if (senhaAtual.normalize("NFC") === novaSenha.normalize("NFC")) {
    throw new Error("A nova senha precisa ser diferente da atual.");
  }
  const senhaHash = await gerarHashSenha(novaSenha);
  await prisma.usuario.update({ where: { id }, data: { senhaHash, versaoSessao: { increment: 1 } } });
}
