import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "../db";
import { lerConfiguracaoEntra } from "./entra";
import { buscarUsuarioPelaSenha, buscarUsuarioPeloPerfilEntra } from "./login";

declare module "next-auth" {
  interface Session {
    usuarioId: number;
    versaoSessao: number;
  }
  interface User {
    versaoSessao?: number;
  }
}

const ID_ENTRA = "microsoft-entra-id";

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function paraUsuarioDaSessao(usuario: { id: number; nome: string; email: string; versaoSessao: number }) {
  return { id: String(usuario.id), name: usuario.nome, email: usuario.email, versaoSessao: usuario.versaoSessao };
}

// Login falso de desenvolvimento (CLAUDE.md § Login falso para desenvolvimento).
const providerDev = Credentials({
  id: "dev",
  name: "Login de desenvolvimento",
  credentials: { email: { label: "E-mail", type: "text" } },
  async authorize(credentials) {
    const email = texto(credentials?.email).trim().toLowerCase();
    if (!email) return null;
    // Não achou de jeito nenhum: nega o acesso. Nunca cria usuário automaticamente.
    const usuario = await prisma.usuario.findUnique({ where: { email, ativo: true } });
    return usuario ? paraUsuarioDaSessao(usuario) : null;
  },
});

// E-mail e senha definidos pela secretaria (decisão de 2026-11-03, CLAUDE.md regra 3).
const providerSenha = Credentials({
  id: "senha",
  name: "E-mail e senha",
  credentials: {
    email: { label: "E-mail", type: "email" },
    senha: { label: "Senha", type: "password" },
  },
  async authorize(credentials) {
    const usuario = await buscarUsuarioPelaSenha(texto(credentials?.email), texto(credentials?.senha));
    return usuario ? paraUsuarioDaSessao(usuario) : null;
  },
});

const entra = lerConfiguracaoEntra(process.env);
export const entraConfigurado = entra !== null;

const providers: Provider[] = [providerSenha];
if (entra) {
  providers.push(
    MicrosoftEntraID({
      clientId: entra.clientId,
      clientSecret: entra.clientSecret,
      issuer: entra.issuer,
      // Só identidade, sem Microsoft Graph: o padrão do provider pede User.Read
      // para buscar a foto, que nem é usada aqui.
      authorization: { params: { scope: "openid profile email" } },
      profile: (perfil) => ({ id: perfil.oid, name: perfil.name, email: perfil.email ?? perfil.preferred_username }),
    }),
  );
}
if (process.env.NODE_ENV === "development") providers.push(providerDev);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // Recusa no retorno da Microsoft (signIn abaixo devolvendo false) chega como
  // /login?error=AccessDenied, em vez da página de erro padrão do Auth.js.
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Os providers de credenciais já filtraram no authorize(); o Entra ID
    // devolve qualquer conta do tenant, e é aqui que quem não está cadastrado
    // (ou foi inativado) é barrado.
    async signIn({ account, profile }) {
      if (account?.provider !== ID_ENTRA) return true;
      const usuario = entra ? await buscarUsuarioPeloPerfilEntra(profile, entra.tenantId) : null;
      return usuario?.ativo === true;
    },
    // Só age no login (account presente). Em qualquer outra chamada — inclusive
    // o "update" que o navegador pode disparar com dados próprios — o token
    // segue como está: usuarioId e versaoSessao nunca vêm do cliente.
    async jwt({ token, user, account, profile }) {
      if (!account) return token;
      if (account.provider === ID_ENTRA) {
        const usuario = entra ? await buscarUsuarioPeloPerfilEntra(profile, entra.tenantId) : null;
        if (usuario) {
          token.usuarioId = usuario.id;
          token.versaoSessao = usuario.versaoSessao;
        }
      } else if (user) {
        token.usuarioId = Number(user.id);
        token.versaoSessao = user.versaoSessao ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      session.usuarioId = token.usuarioId as number;
      session.versaoSessao = (token.versaoSessao as number | undefined) ?? 0;
      return session;
    },
  },
});
