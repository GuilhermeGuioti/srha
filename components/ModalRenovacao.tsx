"use client";

import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { BotaoPrimario } from "./BotaoPrimario";
import { BotaoSecundario } from "./BotaoSecundario";
import { Campo, classeCampoSelect } from "./Campo";
import { CampoCheckbox } from "./CampoCheckbox";
import { MensagemErro } from "./MensagemErro";
import { AvisoConcluido } from "./AvisoConcluido";
import { NomeCurso } from "./NomeCurso";
import { classeLinkAcao } from "./LinkAcao";
import type { ParRenovacao, PreviaRenovacao } from "../lib/services/vinculos";
import type { Resultado } from "../lib/tipos";

type Rotulo = { ano: number; semestre: number };

function rotulo(periodo: Rotulo): string {
  return `${periodo.ano}/${periodo.semestre}`;
}

function plural(quantidade: number, singular: string, varios: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : varios}`;
}

const chave = (docenteId: number, cursoId: number) => `${docenteId}|${cursoId}`;

// Renovação de semestre: os docentes do período anterior, por curso, todos
// marcados; a secretaria desmarca quem saiu e confirma. Abre em Períodos,
// logo depois de criar um, e em Vínculos, escolhendo o período. Quem usa monta
// este componente só com o modal aberto, para ele abrir zerado.
export function ModalRenovacao({
  eyebrow,
  onFechar,
  periodoId,
  periodos,
  previaInicial,
  carregarPrevia,
  renovar,
}: {
  eyebrow: string;
  onFechar: () => void;
  periodoId: number;
  // Com a lista, a secretaria troca o período no próprio modal.
  periodos?: { id: number; rotulo: string }[];
  // Quem já carregou a prévia (Períodos, para saber se abre) passa adiante.
  previaInicial?: PreviaRenovacao;
  carregarPrevia: (periodoLetivoId: number) => Promise<Resultado<PreviaRenovacao>>;
  renovar: (dados: {
    periodoLetivoId: number;
    selecionados: ParRenovacao[];
  }) => Promise<Resultado<{ origem: Rotulo | null; renovados: number }>>;
}) {
  const router = useRouter();
  const id = useId();
  const [alvo, setAlvo] = useState(periodoId);
  const [previa, setPrevia] = useState<PreviaRenovacao | null>(previaInicial ?? null);
  // Todos começam marcados: guardar quem foi desmarcado é o caso raro.
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    if (previa !== null) return;
    let vigente = true;
    carregarPrevia(alvo).then((resultado) => {
      if (!vigente) return;
      if (resultado.ok) {
        setPrevia(resultado.dados);
      } else {
        setErro(resultado.erro);
      }
    });
    return () => {
      vigente = false;
    };
  }, [alvo, previa, carregarPrevia]);

  const pares = previa?.cursos.flatMap((curso) => curso.docentes.map((docente) => ({ docenteId: docente.id, cursoId: curso.id }))) ?? [];
  const selecionados = pares.filter((par) => !desmarcados.has(chave(par.docenteId, par.cursoId)));
  const destino = previa ? rotulo(previa.destino) : (periodos?.find((periodo) => periodo.id === alvo)?.rotulo ?? "");
  const origem = previa?.origem ? rotulo(previa.origem) : null;

  function trocarPeriodo(novo: number) {
    setAlvo(novo);
    setPrevia(null);
    setDesmarcados(new Set());
    setErro(null);
  }

  function marcar(chaves: string[], marcado: boolean) {
    setDesmarcados((atual) => {
      const proximo = new Set(atual);
      for (const item of chaves) {
        if (marcado) proximo.delete(item);
        else proximo.add(item);
      }
      return proximo;
    });
  }

  function confirmar(evento: FormEvent) {
    evento.preventDefault();
    if (selecionados.length === 0) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await renovar({ periodoLetivoId: alvo, selecionados });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setConcluido(
        `${plural(resultado.dados.renovados, "vínculo renovado", "vínculos renovados")} de ${origem} para ${destino}.`,
      );
      router.refresh();
    });
  }

  function conteudo() {
    if (!previa) {
      return erro ? null : (
        <p aria-live="polite" className="text-[15px] text-tinta-suave">
          Carregando os docentes do período anterior…
        </p>
      );
    }
    if (!origem) {
      return <p className="text-[15px] text-tinta">Não há período anterior a {destino} cadastrado — nada a renovar.</p>;
    }
    if (previa.cursos.length === 0) {
      return (
        <p className="text-[15px] text-tinta">
          Nada a renovar:{" "}
          {previa.jaNoPeriodo > 0
            ? `os docentes de ${origem} já estão em ${destino}.`
            : `${origem} não tem docente vinculado a curso ativo.`}
        </p>
      );
    }
    return (
      <>
        <p className="text-[15px] text-tinta">
          <span className="font-mono font-medium tabular-nums">{selecionados.length}</span> de{" "}
          <span className="font-mono font-medium tabular-nums">{pares.length}</span> vínculos marcados, em{" "}
          {plural(previa.cursos.length, "curso", "cursos")}.
        </p>
        <div className="flex flex-col gap-3">
          {previa.cursos.map((curso) => {
            const chaves = curso.docentes.map((docente) => chave(docente.id, curso.id));
            const marcados = chaves.filter((item) => !desmarcados.has(item)).length;
            const todos = marcados === chaves.length;
            return (
              <fieldset key={curso.id} className="rounded-xl border border-borda bg-superficie-sutil px-3.5 pt-1 pb-2">
                <legend className="sr-only">
                  {curso.codigo} {curso.nome}
                </legend>
                <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-borda pb-1">
                  <span className="py-2 text-[15px] font-semibold">
                    <NomeCurso codigo={curso.codigo} nome={curso.nome} />
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-mono text-[13px] font-medium tabular-nums text-tinta-suave">
                      {marcados} de {chaves.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => marcar(chaves, !todos)}
                      className={`${classeLinkAcao} text-[13px]`}
                    >
                      {todos ? "Desmarcar todos" : "Marcar todos"}
                      <span className="sr-only"> de {curso.nome}</span>
                    </button>
                  </span>
                </div>
                <div className="flex flex-col">
                  {curso.docentes.map((docente) => {
                    const item = chave(docente.id, curso.id);
                    return (
                      <CampoCheckbox
                        key={item}
                        id={`${id}-${item}`}
                        rotulo={docente.nome}
                        checked={!desmarcados.has(item)}
                        onChange={(marcado) => marcar([item], marcado)}
                      />
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
        {(previa.jaNoPeriodo > 0 || previa.inativos > 0) && (
          <p className="text-[13px] leading-relaxed text-tinta-suave">
            {previa.jaNoPeriodo > 0 && `${plural(previa.jaNoPeriodo, "vínculo já está", "vínculos já estão")} em ${destino}. `}
            {previa.inativos > 0 &&
              `${plural(previa.inativos, "vínculo fica", "vínculos ficam")} de fora por docente ou curso inativo.`}
          </p>
        )}
      </>
    );
  }

  return (
    <Modal
      aberto
      eyebrow={eyebrow}
      titulo={destino ? `Renovar vínculos para ${destino}` : "Renovar vínculos"}
      descricao={origem && !concluido ? `Vêm de ${origem} — desmarque quem saiu.` : undefined}
      onFechar={onFechar}
      rodape={
        <>
          <BotaoSecundario onClick={onFechar}>{concluido ? "Fechar" : "Cancelar"}</BotaoSecundario>
          {!concluido && (
            <BotaoPrimario type="submit" form={`${id}-form`} disabled={pendente || selecionados.length === 0}>
              {pendente ? "Renovando…" : `Renovar ${plural(selecionados.length, "vínculo", "vínculos")}`}
            </BotaoPrimario>
          )}
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={confirmar} className="flex flex-col gap-4">
        {periodos && !concluido && (
          <Campo rotulo="Para o período" htmlFor={`${id}-periodo`}>
            <select
              id={`${id}-periodo`}
              value={alvo}
              onChange={(evento) => trocarPeriodo(Number(evento.target.value))}
              className={classeCampoSelect}
            >
              {periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>
                  {periodo.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {erro && <MensagemErro>{erro}</MensagemErro>}
        {concluido ? <AvisoConcluido rotulo="Renovação concluída">{concluido}</AvisoConcluido> : conteudo()}
      </form>
    </Modal>
  );
}
