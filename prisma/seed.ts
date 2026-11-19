import "dotenv/config";
import { Perfil } from "../generated/prisma/enums";
import { prisma } from "../lib/db";
import { SchemaSenha } from "../lib/senha";
import { definirSenhaProvisoria } from "../lib/services/usuarios";

// Só a secretaria inicial. Os tipos de atividade são lista fixa e vêm da
// migration tipos_atividade_fixos, não daqui. Cursos, períodos letivos e os
// demais usuários são cadastrados pela secretaria via UI (app/admin/*).

/**
 * A primeira secretaria vem do ambiente, nunca do código. Em produção precisa
 * ser a conta institucional real: é com ela que o Entra ID a reconhece.
 */
function secretariaInicial(): { nome: string; email: string } {
  const email = process.env.SECRETARIA_INICIAL_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      "Defina SECRETARIA_INICIAL_EMAIL (e, opcionalmente, SECRETARIA_INICIAL_NOME) com a conta de quem vai administrar o sistema.",
    );
  }
  return { nome: process.env.SECRETARIA_INICIAL_NOME?.trim() || "Secretaria Acadêmica", email };
}

/**
 * Sem o Entra ID configurado, a primeira secretaria só entra por senha — e
 * senha só a secretaria define, então ninguém mais poderia dar a dela. Fica
 * provisória e só é gravada se ela ainda não tiver uma: rodar o seed de novo
 * não desfaz a senha que ela já trocou.
 */
async function definirSenhaInicial(usuario: { id: number; senhaHash: string | null }) {
  const senha = process.env.SECRETARIA_INICIAL_SENHA;
  if (!senha) return;
  if (!usuario.senhaHash) {
    await definirSenhaProvisoria(usuario.id, SchemaSenha.parse(senha), null);
  }
  // Senha esquecida no ambiente é credencial largada: depois do primeiro
  // seed ela não serve para mais nada.
  console.warn("SECRETARIA_INICIAL_SENHA já foi usada — apague-a do ambiente.");
}

async function seed() {
  const { nome, email } = secretariaInicial();

  const secretaria = await prisma.usuario.upsert({ where: { email }, update: { nome }, create: { nome, email } });
  await prisma.usuarioPerfil.upsert({
    where: { usuarioId_perfil: { usuarioId: secretaria.id, perfil: Perfil.SECRETARIA } },
    update: {},
    create: { usuarioId: secretaria.id, perfil: Perfil.SECRETARIA },
  });
  await definirSenhaInicial(secretaria);

  console.log("Seed concluído.");
}

seed()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
