"use client";

import { useState, useTransition, type FormEvent } from "react";
import { BotaoPrimario } from "../../../../components/BotaoPrimario";
import { Campo, classeCampo } from "../../../../components/Campo";
import { CamposNovaSenha } from "../../../../components/CamposNovaSenha";
import { Destaque } from "../../../../components/Destaque";
import { MensagemErro } from "../../../../components/MensagemErro";
import { TAMANHO_MAXIMO_SENHA } from "../../../../lib/senha";
import { acaoAlterarSenha } from "./acoes";

export function FormularioSenha() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [alterada, setAlterada] = useState(false);
  const [pendente, startTransition] = useTransition();

  function alterar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAlterada(false);
    startTransition(async () => {
      const resultado = await acaoAlterarSenha(senhaAtual, novaSenha, confirmacao);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
      setAlterada(true);
    });
  }

  return (
    <form onSubmit={alterar} className="flex max-w-md flex-col gap-4">
      {erro && <MensagemErro>{erro}</MensagemErro>}
      <div role="status" aria-live="polite">
        {alterada && (
          <Destaque tom="neutro" titulo="Senha alterada" compacto>
            <p className="mt-1 text-[15px] text-tinta-suave">Use a nova senha no próximo acesso.</p>
          </Destaque>
        )}
      </div>
      <Campo rotulo="Senha atual" htmlFor="senha-atual">
        <input
          id="senha-atual"
          type="password"
          autoComplete="current-password"
          value={senhaAtual}
          onChange={(evento) => setSenhaAtual(evento.target.value)}
          required
          maxLength={TAMANHO_MAXIMO_SENHA}
          className={classeCampo}
        />
      </Campo>
      <CamposNovaSenha
        novaSenha={novaSenha}
        confirmacao={confirmacao}
        onNovaSenha={setNovaSenha}
        onConfirmacao={setConfirmacao}
      />
      <div className="pt-2">
        <BotaoPrimario type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Alterar senha"}
        </BotaoPrimario>
      </div>
    </form>
  );
}
