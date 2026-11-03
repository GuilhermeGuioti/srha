"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { classeBotaoPrimario } from "../../../components/BotaoPrimario";
import { CamposNovaSenha } from "../../../components/CamposNovaSenha";
import { MensagemErro } from "../../../components/MensagemErro";
import { acaoTrocarSenha } from "./acoes";

export function FormularioTrocaSenha() {
  const router = useRouter();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function trocar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await acaoTrocarSenha(novaSenha, confirmacao);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      router.replace("/");
    });
  }

  return (
    <form onSubmit={trocar} className="mt-7 flex flex-col gap-4">
      {erro && <MensagemErro>{erro}</MensagemErro>}
      <CamposNovaSenha
        novaSenha={novaSenha}
        confirmacao={confirmacao}
        onNovaSenha={setNovaSenha}
        onConfirmacao={setConfirmacao}
      />
      <button type="submit" disabled={pendente} className={`${classeBotaoPrimario} mt-3 min-h-[52px] w-full text-base`}>
        {pendente ? "Salvando…" : "Salvar e entrar"}
      </button>
    </form>
  );
}
