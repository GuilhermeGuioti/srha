"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../../../../components/Modal";
import { BotaoPrimario } from "../../../../../components/BotaoPrimario";
import { BotaoSecundario } from "../../../../../components/BotaoSecundario";
import { AcaoTabela } from "../../../../../components/AcaoTabela";
import { IconeRemover } from "../../../../../components/Icones";
import { MensagemErro } from "../../../../../components/MensagemErro";
import { NomeCurso } from "../../../../../components/NomeCurso";
import {
  AVISO_AVALIADOR,
  CamposVinculo,
  faltaPeriodo,
  paraNovoVinculo,
  valoresIniciais,
} from "../../../../../components/CamposVinculo";
import { acaoVincular, acaoDesvincularDocente, acaoDesvincularCoordenador } from "../vinculos/acoes";

export type VinculoUsuario =
  | { id: number; tipo: "docente"; cursoCodigo: string; cursoNome: string; periodoRotulo: string; encerrado: boolean }
  | { id: number; tipo: "coordenador"; cursoCodigo: string; cursoNome: string };

type Pessoa = { id: number; nome: string; ativo: boolean; vinculos: VinculoUsuario[] };

const classeTituloBloco = "text-[13px] font-semibold text-tinta-suave";
const classeListaBloco = "mt-1.5 divide-y divide-borda rounded-xl border border-borda";

// Coordenação primeiro, sem período; docência agrupada por período, do mais
// recente ao mais antigo (a ordem que a page já manda). Acrescentar troca o
// conteúdo do mesmo modal pelo formulário — sem modal em cima de modal.
// Período encerrado aparece para consulta, sem remover; e não é oferecido
// para acrescentar (`periodosAbertos`).
export function ModalVinculosUsuario({
  pessoa,
  cursos,
  periodosAbertos: periodos,
  onFechar,
}: {
  pessoa: Pessoa;
  cursos: { id: number; codigo: string; nome: string }[];
  periodosAbertos: { id: number; rotulo: string }[];
  onFechar: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [tela, setTela] = useState<"lista" | "novo">("lista");
  const [valores, setValores] = useState(() => valoresIniciais("docente", pessoa.id, periodos));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const coordenacao = pessoa.vinculos.filter((vinculo) => vinculo.tipo === "coordenador");
  const docenciaPorPeriodo = new Map<string, { encerrado: boolean; vinculos: VinculoUsuario[] }>();
  for (const vinculo of pessoa.vinculos) {
    if (vinculo.tipo !== "docente") continue;
    const grupo = docenciaPorPeriodo.get(vinculo.periodoRotulo) ?? { encerrado: vinculo.encerrado, vinculos: [] };
    grupo.vinculos.push(vinculo);
    docenciaPorPeriodo.set(vinculo.periodoRotulo, grupo);
  }

  function acrescentar() {
    setValores(valoresIniciais("docente", pessoa.id, periodos));
    setErro(null);
    setTela("novo");
  }

  function voltar() {
    setErro(null);
    setTela("lista");
  }

  function vincular(evento: FormEvent) {
    evento.preventDefault();
    const vinculo = paraNovoVinculo(valores);
    if (!vinculo) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await acaoVincular(vinculo);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setTela("lista");
      router.refresh();
    });
  }

  function remover(vinculo: VinculoUsuario) {
    const onde = vinculo.tipo === "docente" ? ` em ${vinculo.periodoRotulo}` : "";
    if (!window.confirm(`Remover o vínculo de ${pessoa.nome} com ${vinculo.cursoNome}${onde}?`)) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await (vinculo.tipo === "docente"
        ? acaoDesvincularDocente(vinculo.id)
        : acaoDesvincularCoordenador(vinculo.id));
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      router.refresh();
    });
  }

  function linha(vinculo: VinculoUsuario) {
    const onde = vinculo.tipo === "docente" ? ` em ${vinculo.periodoRotulo}` : " (coordenação)";
    const fixo = vinculo.tipo === "docente" && vinculo.encerrado;
    return (
      <li
        key={`${vinculo.tipo}-${vinculo.id}`}
        // Sem o botão, a linha mantém a altura das que têm.
        className="flex min-h-12 items-center justify-between gap-3 py-0.5 pr-1 pl-3.5"
      >
        <NomeCurso codigo={vinculo.cursoCodigo} nome={vinculo.cursoNome} />
        {!fixo && (
          <AcaoTabela
            cor="devolvido"
            rotulo={`Remover vínculo com ${vinculo.cursoNome}${onde}`}
            onClick={() => remover(vinculo)}
          >
            <IconeRemover className="h-[18px] w-[18px]" />
          </AcaoTabela>
        )}
      </li>
    );
  }

  const novo = tela === "novo";

  return (
    <Modal
      aberto
      eyebrow="ADMINISTRAÇÃO · USUÁRIOS"
      titulo={novo ? "Acrescentar vínculo" : `Vínculos de ${pessoa.nome}`}
      descricao={
        novo
          ? valores.tipo === "coordenador"
            ? AVISO_AVALIADOR
            : `Curso em que ${pessoa.nome} dá aula, no período.`
          : "Docência é por período, e período encerrado não muda; coordenação vale até ser removida."
      }
      onFechar={onFechar}
      rodape={
        novo ? (
          <>
            <BotaoSecundario onClick={voltar}>Voltar</BotaoSecundario>
            <BotaoPrimario type="submit" form={`${id}-form`} disabled={pendente || faltaPeriodo(valores, periodos)}>
              {pendente ? "Salvando…" : "Vincular"}
            </BotaoPrimario>
          </>
        ) : (
          <>
            <BotaoSecundario onClick={onFechar}>Fechar</BotaoSecundario>
            {pessoa.ativo && (
              <BotaoPrimario onClick={acrescentar} icone>
                Acrescentar vínculo
              </BotaoPrimario>
            )}
          </>
        )
      }
    >
      {novo ? (
        <form id={`${id}-form`} onSubmit={vincular} className="flex flex-col gap-4">
          {erro && <MensagemErro>{erro}</MensagemErro>}
          <CamposVinculo
            id={id}
            cursos={cursos}
            periodos={periodos}
            escolherTipo
            valores={valores}
            onMudar={setValores}
          />
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          {erro && <MensagemErro>{erro}</MensagemErro>}
          {!pessoa.ativo && (
            <p className="text-[15px] text-tinta-suave">Usuário inativo: reative o cadastro para acrescentar vínculos.</p>
          )}
          <section>
            <h3 className={classeTituloBloco}>Coordenação</h3>
            {coordenacao.length === 0 ? (
              <p className="mt-1.5 text-[15px] text-tinta-suave">Não coordena nenhum curso.</p>
            ) : (
              <ul className={classeListaBloco}>{coordenacao.map(linha)}</ul>
            )}
          </section>
          <section>
            <h3 className={classeTituloBloco}>Docência</h3>
            {docenciaPorPeriodo.size === 0 ? (
              <p className="mt-1.5 text-[15px] text-tinta-suave">Não dá aula em nenhum curso.</p>
            ) : (
              <div className="mt-1.5 flex flex-col gap-3">
                {[...docenciaPorPeriodo].map(([periodo, grupo]) => (
                  <div key={periodo}>
                    <div className="text-[13px] text-tinta-suave">
                      <span className="font-mono font-medium tabular-nums">{periodo}</span>
                      {grupo.encerrado && " · encerrado"}
                    </div>
                    <ul className={classeListaBloco}>{grupo.vinculos.map(linha)}</ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
