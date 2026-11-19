"use client";

import { Campo, classeCampoSelect } from "./Campo";
import { LinkTexto } from "./LinkTexto";

export type TipoVinculo = "docente" | "coordenador";

export type NovoVinculo =
  | { tipo: "docente"; pessoaId: number; cursoId: number; periodoLetivoId: number }
  | { tipo: "coordenador"; pessoaId: number; cursoId: number };

type Opcao = { id: number; rotulo: string };

export type ValoresVinculo = {
  tipo: TipoVinculo;
  cursoId: number | "";
  pessoaId: number | "";
  periodoId: number | "";
};

export const AVISO_AVALIADOR =
  "O primeiro coordenador ativo cadastrado para o curso é quem recebe os relatórios para avaliação.";

// `periodos` vem do mais recente ao mais antigo: o primeiro já vem escolhido.
export function valoresIniciais(tipo: TipoVinculo, pessoaId: number | "", periodos: Opcao[]): ValoresVinculo {
  return { tipo, cursoId: "", pessoaId, periodoId: periodos[0]?.id ?? "" };
}

// Pronto para a Server Action, ou null se falta algo — o `required` dos campos
// já segura no navegador; isto é a garantia do lado do código.
export function paraNovoVinculo(valores: ValoresVinculo): NovoVinculo | null {
  const { tipo, cursoId, pessoaId, periodoId } = valores;
  if (cursoId === "" || pessoaId === "") return null;
  if (tipo === "coordenador") return { tipo, pessoaId, cursoId };
  return periodoId === "" ? null : { tipo, pessoaId, cursoId, periodoLetivoId: periodoId };
}

export function faltaPeriodo(valores: ValoresVinculo, periodos: Opcao[]): boolean {
  return valores.tipo === "docente" && periodos.length === 0;
}

function numeroOuVazio(valor: string): number | "" {
  return valor === "" ? "" : Number(valor);
}

// Os campos de um vínculo novo, sem o <form>: quem usa decide onde fica o
// botão de enviar (rodapé de modal) e o que acontece depois.
export function CamposVinculo({
  id,
  cursos,
  periodos,
  escolherTipo,
  pessoas,
  valores,
  onMudar,
}: {
  id: string;
  cursos: { id: number; codigo: string; nome: string }[];
  periodos: Opcao[];
  // Na tela de usuários o tipo se escolhe aqui; na de vínculos vem do botão.
  escolherTipo: boolean;
  // Na tela de vínculos a pessoa se escolhe aqui; na de usuários já é a da linha.
  pessoas?: { rotulo: string; opcoes: Opcao[] };
  valores: ValoresVinculo;
  onMudar: (valores: ValoresVinculo) => void;
}) {
  const mudar = (parcial: Partial<ValoresVinculo>) => onMudar({ ...valores, ...parcial });

  return (
    <>
      {escolherTipo && (
        <Campo rotulo="Como" htmlFor={`${id}-tipo`}>
          <select
            id={`${id}-tipo`}
            value={valores.tipo}
            onChange={(evento) => mudar({ tipo: evento.target.value as TipoVinculo })}
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
          value={valores.cursoId}
          onChange={(evento) => mudar({ cursoId: numeroOuVazio(evento.target.value) })}
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
      {pessoas && (
        <Campo rotulo={pessoas.rotulo} htmlFor={`${id}-pessoa`}>
          <select
            id={`${id}-pessoa`}
            value={valores.pessoaId}
            onChange={(evento) => mudar({ pessoaId: numeroOuVazio(evento.target.value) })}
            required
            className={classeCampoSelect}
          >
            <option value="">— selecione —</option>
            {pessoas.opcoes.map((opcao) => (
              <option key={opcao.id} value={opcao.id}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {valores.tipo === "docente" &&
        (faltaPeriodo(valores, periodos) ? (
          <p className="text-[15px] text-tinta">
            Nenhum período letivo cadastrado. <LinkTexto href="/admin/periodos">Cadastre um período</LinkTexto> antes
            de vincular docentes a cursos.
          </p>
        ) : (
          <Campo rotulo="Período" htmlFor={`${id}-periodo`}>
            <select
              id={`${id}-periodo`}
              value={valores.periodoId}
              onChange={(evento) => mudar({ periodoId: numeroOuVazio(evento.target.value) })}
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
    </>
  );
}
