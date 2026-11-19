"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { BotaoPrimario } from "./BotaoPrimario";
import { BotaoSecundario } from "./BotaoSecundario";
import { Campo, classeCampoSelect } from "./Campo";
import { LinkTexto } from "./LinkTexto";
import { MensagemErro } from "./MensagemErro";
import type { Resultado } from "../lib/tipos";

export type TipoVinculo = "docente" | "coordenador";

export type NovoVinculo =
  | { tipo: "docente"; pessoaId: number; cursoId: number; periodoLetivoId: number }
  | { tipo: "coordenador"; pessoaId: number; cursoId: number };

type Opcao = { id: number; rotulo: string };

export const AVISO_AVALIADOR =
  "O primeiro coordenador ativo cadastrado para o curso é quem recebe os relatórios para avaliação.";

type ModalVinculoProps = {
  aberto: boolean;
  onFechar: () => void;
  eyebrow: string;
  titulo: string;
  cursos: { id: number; codigo: string; nome: string }[];
  // Do mais recente ao mais antigo: o primeiro já vem escolhido.
  periodos: Opcao[];
  // Fixo na tela de vínculos, que tem um botão para cada; na de usuários,
  // escolhido no próprio formulário.
  tipo: TipoVinculo | "escolher";
  // Escolhida no formulário na tela de vínculos; fixa na de usuários.
  pessoa: { opcoes: Opcao[]; rotulo: string } | { id: number };
  vincular: (vinculo: NovoVinculo) => Promise<Resultado<void>>;
};

// Vincular alguém a um curso, de /admin/vinculos ou de /admin/usuarios. O
// <dialog> fica montado e guardaria o que foi escolhido da última vez: quem
// usa troca a `key` a cada abertura, para o formulário abrir zerado.
export function ModalVinculo({
  aberto,
  onFechar,
  eyebrow,
  titulo,
  cursos,
  periodos,
  tipo,
  pessoa,
  vincular,
}: ModalVinculoProps) {
  const router = useRouter();
  const id = useId();
  const [tipoEscolhido, setTipoEscolhido] = useState<TipoVinculo>("docente");
  const [cursoId, setCursoId] = useState<number | "">("");
  const [pessoaId, setPessoaId] = useState<number | "">("id" in pessoa ? pessoa.id : "");
  const [periodoId, setPeriodoId] = useState<number | "">(periodos[0]?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const tipoAtual = tipo === "escolher" ? tipoEscolhido : tipo;
  const semPeriodo = tipoAtual === "docente" && periodos.length === 0;

  function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (cursoId === "" || pessoaId === "") return;
    if (tipoAtual === "docente" && periodoId === "") return;
    const vinculo: NovoVinculo =
      tipoAtual === "docente"
        ? { tipo: "docente", pessoaId, cursoId, periodoLetivoId: Number(periodoId) }
        : { tipo: "coordenador", pessoaId, cursoId };
    startTransition(async () => {
      const resultado = await vincular(vinculo);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      onFechar();
      router.refresh();
    });
  }

  return (
    <Modal
      aberto={aberto}
      eyebrow={eyebrow}
      titulo={titulo}
      descricao={tipoAtual === "coordenador" ? AVISO_AVALIADOR : undefined}
      onFechar={onFechar}
      rodape={
        <>
          <BotaoSecundario onClick={onFechar}>Cancelar</BotaoSecundario>
          <BotaoPrimario type="submit" form={`${id}-form`} disabled={pendente || semPeriodo}>
            {pendente ? "Salvando…" : "Vincular"}
          </BotaoPrimario>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={salvar} className="flex flex-col gap-4">
        {erro && <MensagemErro>{erro}</MensagemErro>}
        {tipo === "escolher" && (
          <Campo rotulo="Como" htmlFor={`${id}-tipo`}>
            <select
              id={`${id}-tipo`}
              value={tipoEscolhido}
              onChange={(evento) => setTipoEscolhido(evento.target.value as TipoVinculo)}
              className={classeCampoSelect}
            >
              <option value="docente">Docente (dá aula no curso)</option>
              <option value="coordenador">Coordenação do curso</option>
            </select>
          </Campo>
        )}
        <Campo rotulo="Curso" htmlFor={`${id}-curso`}>
          <select
            id={`${id}-curso`}
            value={cursoId}
            onChange={(evento) => setCursoId(evento.target.value === "" ? "" : Number(evento.target.value))}
            required
            className={classeCampoSelect}
          >
            <option value="">— selecione —</option>
            {cursos.map((curso) => (
              <option key={curso.id} value={curso.id}>
                {curso.codigo} · {curso.nome}
              </option>
            ))}
          </select>
        </Campo>
        {"opcoes" in pessoa && (
          <Campo rotulo={pessoa.rotulo} htmlFor={`${id}-pessoa`}>
            <select
              id={`${id}-pessoa`}
              value={pessoaId}
              onChange={(evento) => setPessoaId(evento.target.value === "" ? "" : Number(evento.target.value))}
              required
              className={classeCampoSelect}
            >
              <option value="">— selecione —</option>
              {pessoa.opcoes.map((opcao) => (
                <option key={opcao.id} value={opcao.id}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {tipoAtual === "docente" &&
          (semPeriodo ? (
            <p className="text-[15px] text-tinta">
              Nenhum período letivo cadastrado. <LinkTexto href="/admin/periodos">Cadastre um período</LinkTexto>{" "}
              antes de vincular docentes a cursos.
            </p>
          ) : (
            <Campo rotulo="Período" htmlFor={`${id}-periodo`}>
              <select
                id={`${id}-periodo`}
                value={periodoId}
                onChange={(evento) => setPeriodoId(evento.target.value === "" ? "" : Number(evento.target.value))}
                required
                className={classeCampoSelect}
              >
                <option value="">— selecione —</option>
                {periodos.map((periodo) => (
                  <option key={periodo.id} value={periodo.id}>
                    {periodo.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          ))}
      </form>
    </Modal>
  );
}
