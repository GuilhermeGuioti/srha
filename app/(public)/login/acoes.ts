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
