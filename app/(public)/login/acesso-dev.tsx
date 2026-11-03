"use client";

import { useState } from "react";
import { BotaoSecundario } from "../../../components/BotaoSecundario";
import { classeCampo } from "../../../components/Campo";
import { acaoEntrarComEmail, acaoEntrarComoAdmin } from "./acoes";

// Atalhos do login falso, escondidos atrás de um botão invisível no canto da
// tela (aparece só com o mouse em cima ou pelo Tab): fechado, o /login fica
// igual ao de produção. A page só renderiza isto em desenvolvimento.
export function AcessoDev() {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        aria-controls="acesso-dev"
        aria-label={aberto ? "Fechar login de desenvolvimento" : "Abrir login de desenvolvimento"}
        className="fixed right-2 bottom-2 flex h-11 w-11 items-center justify-center rounded-full font-mono text-[11px] font-semibold text-tinta-suave opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azul-interativo"
      >
        dev
      </button>

      {aberto && (
        <div
          id="acesso-dev"
          className="mt-6 flex flex-col gap-3 rounded-2xl border border-dashed border-borda-campo bg-superficie-sutil p-4"
        >
          <form action={acaoEntrarComoAdmin}>
            <BotaoSecundario type="submit">Dev · entrar como secretaria</BotaoSecundario>
          </form>
          <form action={acaoEntrarComEmail} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="email-dev" className="block text-[13px] font-semibold text-tinta-suave">
                Dev · entrar com outro e-mail cadastrado, sem senha
              </label>
              <input id="email-dev" name="email" type="email" required className={`${classeCampo} mt-1.5 w-full`} />
            </div>
            <BotaoSecundario type="submit">Entrar</BotaoSecundario>
          </form>
        </div>
      )}
    </>
  );
}
