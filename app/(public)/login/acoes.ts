"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "../../../lib/auth/config";

// signIn redireciona lançando NEXT_REDIRECT: só o AuthError (credencial
// recusada) vira mensagem na tela; o resto precisa seguir adiante.
async function entrar(provider: string, opcoes: Record<string, string>): Promise<void> {
  try {
    await signIn(provider, { ...opcoes, redirectTo: "/" });
  } catch (erro) {
    if (erro instanceof AuthError) {
      redirect(`/login?erro=${provider}`);
    }
    throw erro;
  }
}

export async function acaoEntrarComMicrosoft(): Promise<void> {
  await entrar("microsoft-entra-id", {});
}

export async function acaoEntrarComSenha(formData: FormData): Promise<void> {
  await entrar("senha", {
    email: String(formData.get("email") ?? ""),
    senha: String(formData.get("senha") ?? ""),
  });
}

// Login falso, só em desenvolvimento: entra como qualquer usuário cadastrado,
// sem senha nem Microsoft. Fora dele o provider "dev" nem existe; a trava
// aqui é para a action não ficar chamável à toa no build de produção.
export async function acaoEntrarComoAdmin(): Promise<void> {
  if (process.env.NODE_ENV !== "development") redirect("/login");
  await entrar("dev", { email: "admin@srha.dev" });
}

export async function acaoEntrarComEmail(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV !== "development") redirect("/login");
  await entrar("dev", { email: String(formData.get("email") ?? "") });
}
