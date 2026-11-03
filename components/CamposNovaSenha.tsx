"use client";

import { Campo, classeCampo } from "./Campo";
import { TAMANHO_MAXIMO_SENHA, TAMANHO_MINIMO_SENHA } from "../lib/senha";

// Nova senha + confirmação: a troca da provisória e a alteração pelo menu da conta.
export function CamposNovaSenha({
  novaSenha,
  confirmacao,
  onNovaSenha,
  onConfirmacao,
}: {
  novaSenha: string;
  confirmacao: string;
  onNovaSenha: (valor: string) => void;
  onConfirmacao: (valor: string) => void;
}) {
  return (
    <>
      <Campo rotulo={`Nova senha (mínimo de ${TAMANHO_MINIMO_SENHA} caracteres)`} htmlFor="nova-senha">
        <input
          id="nova-senha"
          type="password"
          autoComplete="new-password"
          value={novaSenha}
          onChange={(evento) => onNovaSenha(evento.target.value)}
          required
          minLength={TAMANHO_MINIMO_SENHA}
          maxLength={TAMANHO_MAXIMO_SENHA}
          className={classeCampo}
        />
      </Campo>
      <Campo rotulo="Repita a nova senha" htmlFor="confirmacao-senha">
        <input
          id="confirmacao-senha"
          type="password"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(evento) => onConfirmacao(evento.target.value)}
          required
          maxLength={TAMANHO_MAXIMO_SENHA}
          className={classeCampo}
        />
      </Campo>
    </>
  );
}
