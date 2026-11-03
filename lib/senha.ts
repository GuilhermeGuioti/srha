import { z } from "zod";

// Compartilhado entre as telas e as Server Actions — o hash mora em
// lib/auth/senha.ts, que usa node:crypto e o navegador não importa.

export const TAMANHO_MINIMO_SENHA = 8;
// Teto só para não aceitar texto arbitrariamente grande no hash.
export const TAMANHO_MAXIMO_SENHA = 128;

export const SchemaSenha = z
  .string()
  .min(TAMANHO_MINIMO_SENHA, `A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`)
  .max(TAMANHO_MAXIMO_SENHA, `A senha pode ter no máximo ${TAMANHO_MAXIMO_SENHA} caracteres.`);

export const SchemaNovaSenha = z
  .object({ novaSenha: SchemaSenha, confirmacao: z.string() })
  .refine((dados) => dados.novaSenha === dados.confirmacao, {
    message: "A confirmação não é igual à nova senha.",
    path: ["confirmacao"],
  });
