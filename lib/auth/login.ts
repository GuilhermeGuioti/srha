import type { Profile } from "next-auth";
import { prisma } from "../db";
import { TAMANHO_MAXIMO_SENHA } from "../senha";
import { gastarTempoDeConferencia, verificarSenha } from "./senha";

// Quem o login reconhece, pelos dois caminhos de produção. Nenhum dos dois
// cria usuário: quem não está cadastrado volta null e o acesso é negado.

export const LIMITE_TENTATIVAS_SENHA = 5;
export const MINUTOS_BLOQUEIO_SENHA = 15;

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Passos 2 e 3 do fluxo de login (CLAUDE.md).
export async function buscarUsuarioPeloEntra(oid: string, email: string) {
  const porOid = await prisma.usuario.findUnique({ where: { entraOid: oid } });
  if (porOid) return porOid;

  const porEmail = await prisma.usuario.findUnique({ where: { email: normalizarEmail(email) } });
  if (!porEmail) return null;

  // Já ligado a outra conta Microsoft: é outra pessoa com o mesmo e-mail (um
  // endereço reaproveitado no tenant, por exemplo). Ela não herda o histórico
  // de quem saiu — a secretaria decide.
  if (porEmail.entraOid) return null;

  // Daí em diante a busca é por oid: o e-mail pode mudar, e a pessoa perderia
  // o vínculo com o histórico.
  return prisma.usuario.update({ where: { id: porEmail.id }, data: { entraOid: oid } });
}

// O emissor configurado já restringe ao tenant da Barão (o Auth.js recusa
// token de outro emissor); conferir o tid é a segunda trava, caso a
// configuração mude. O e-mail de conta institucional costuma vir em
// preferred_username — o claim email só vem quando o tenant o preenche.
export async function buscarUsuarioPeloPerfilEntra(perfil: Profile | undefined, tenantId: string) {
  if (typeof perfil?.tid !== "string" || perfil.tid.toLowerCase() !== tenantId.toLowerCase()) return null;
  const oid = typeof perfil.oid === "string" ? perfil.oid : undefined;
  const email = perfil.email ?? (typeof perfil.preferred_username === "string" ? perfil.preferred_username : undefined);
  if (!oid || !email) return null;
  return buscarUsuarioPeloEntra(oid, email);
}

// Reserva a tentativa antes de conferir, numa instrução só: assim nem uma
// rajada de requisições paralelas confere mais que o limite. A que passa do
// limite já grava o bloqueio, na mesma instrução — nada fica travado para
// sempre se uma requisição cair no meio. Bloqueio vencido recomeça a contagem.
// Sem linha de volta, a conta está bloqueada. Hora em UTC, como o Prisma grava.
async function reservarTentativa(usuarioId: number): Promise<number | null> {
  const linhas = await prisma.$queryRaw<{ tentativasSenha: number }[]>`
    UPDATE "Usuario"
    SET "tentativasSenha" = CASE WHEN "senhaBloqueadaAte" IS NULL THEN "tentativasSenha" + 1 ELSE 1 END,
        "senhaBloqueadaAte" = CASE
          WHEN "senhaBloqueadaAte" IS NULL AND "tentativasSenha" + 1 > ${LIMITE_TENTATIVAS_SENHA}::int
          THEN (now() AT TIME ZONE 'UTC') + ${MINUTOS_BLOQUEIO_SENHA}::int * interval '1 minute'
        END
    WHERE "id" = ${usuarioId}
      AND ("senhaBloqueadaAte" IS NULL OR "senhaBloqueadaAte" <= (now() AT TIME ZONE 'UTC'))
    RETURNING "tentativasSenha"`;
  return linhas[0]?.tentativasSenha ?? null;
}

export async function buscarUsuarioPelaSenha(email: string, senha: string) {
  if (!email.trim() || !senha || senha.length > TAMANHO_MAXIMO_SENHA) return null;
  const usuario = await prisma.usuario.findUnique({ where: { email: normalizarEmail(email), ativo: true } });
  const tentativa = usuario?.senhaHash ? await reservarTentativa(usuario.id) : null;

  // Toda recusa leva o mesmo tempo e devolve o mesmo null: nem o tempo nem a
  // resposta dizem se o e-mail existe, se tem senha ou se está bloqueado.
  if (!usuario?.senhaHash || tentativa === null || tentativa > LIMITE_TENTATIVAS_SENHA) {
    await gastarTempoDeConferencia(senha);
    return null;
  }

  if (!(await verificarSenha(senha, usuario.senhaHash))) return null;
  await prisma.usuario.update({ where: { id: usuario.id }, data: { tentativasSenha: 0 } });
  return usuario;
}
