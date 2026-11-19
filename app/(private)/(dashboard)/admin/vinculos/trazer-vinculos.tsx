"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../../../../components/Modal";
import { BotaoPrimario } from "../../../../../components/BotaoPrimario";
import { BotaoSecundario } from "../../../../../components/BotaoSecundario";
import { Campo, classeCampoSelect } from "../../../../../components/Campo";
import { MensagemErro } from "../../../../../components/MensagemErro";
import { AvisoConcluido } from "../../../../../components/AvisoConcluido";
import type { ResultadoContinuidade } from "../../../../../lib/services/vinculos";
import { acaoTrazerVinculosDoPeriodoAnterior } from "./acoes";

function plural(quantidade: number, singular: string, varios: string): string {
  return quantidade === 1 ? singular : varios;
}

function resumo({ origem, trazidos }: ResultadoContinuidade): string {
  if (!origem) return "Não há período anterior cadastrado — nada a trazer.";
  const rotulo = `${origem.ano}/${origem.semestre}`;
  if (trazidos === 0) return `Nenhum vínculo novo: os de ${rotulo} já estavam neste período.`;
  return `${trazidos} ${plural(trazidos, "vínculo trazido", "vínculos trazidos")} de ${rotulo}.`;
}

// O período novo já nasce com os docentes do anterior (criarPeriodo). Isto é
// para repetir a cópia depois: período criado antes da continuidade existir,
// ou gente acrescentada no semestre anterior depois de criar o novo.
export function TrazerVinculos({ periodos }: { periodos: { id: number; rotulo: string }[] }) {
  const router = useRouter();
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [periodoId, setPeriodoId] = useState<number | "">("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoContinuidade | null>(null);
  const [pendente, startTransition] = useTransition();

  // `periodos` vem do mais recente ao mais antigo: o anterior é o seguinte da lista.
  const indice = periodos.findIndex((periodo) => periodo.id === periodoId);
  const anterior = indice >= 0 ? periodos[indice + 1] : undefined;

  function abrir() {
    setPeriodoId(periodos[0]?.id ?? "");
    setErro(null);
    setResultado(null);
    setAberto(true);
  }

  function trazer(evento: FormEvent) {
    evento.preventDefault();
    if (periodoId === "") return;
    setErro(null);
    startTransition(async () => {
      const retorno = await acaoTrazerVinculosDoPeriodoAnterior(periodoId);
      if (!retorno.ok) {
        setErro(retorno.erro);
        return;
      }
      setResultado(retorno.dados);
      router.refresh();
    });
  }

  return (
    <>
      <BotaoSecundario onClick={abrir}>Trazer do período anterior</BotaoSecundario>

      <Modal
        aberto={aberto}
        eyebrow="ADMINISTRAÇÃO · VÍNCULOS"
        titulo="Trazer vínculos do período anterior"
        descricao="Copia os docentes vinculados no período anterior, de docentes e cursos ativos. Só acrescenta o que falta: não remove nem duplica — e quem foi tirado deste período mas continua no anterior volta."
        onFechar={() => setAberto(false)}
        rodape={
          <>
            <BotaoSecundario onClick={() => setAberto(false)}>{resultado ? "Fechar" : "Cancelar"}</BotaoSecundario>
            {!resultado && (
              <BotaoPrimario type="submit" form={`${id}-form`} disabled={pendente || !anterior}>
                {pendente ? "Trazendo…" : "Trazer vínculos"}
              </BotaoPrimario>
            )}
          </>
        }
      >
        <form id={`${id}-form`} onSubmit={trazer} className="flex flex-col gap-4">
          {erro && <MensagemErro>{erro}</MensagemErro>}
          <Campo
            rotulo="Para o período"
            htmlFor={`${id}-periodo`}
            dica={{
              id: `${id}-origem`,
              texto: anterior ? `Os vínculos vêm de ${anterior.rotulo}.` : "Não há período anterior a este cadastrado.",
            }}
          >
            <select
              id={`${id}-periodo`}
              value={periodoId}
              onChange={(evento) => {
                setPeriodoId(evento.target.value === "" ? "" : Number(evento.target.value));
                setResultado(null);
              }}
              aria-describedby={`${id}-origem`}
              required
              className={classeCampoSelect}
            >
              {periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>
                  {periodo.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          {resultado && <AvisoConcluido rotulo="Concluído">{resumo(resultado)}</AvisoConcluido>}
        </form>
      </Modal>
    </>
  );
}
