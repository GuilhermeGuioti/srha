"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PillAtivo } from "../../../../../components/PillAtivo";
import { Modal } from "../../../../../components/Modal";
import { BotaoPrimario } from "../../../../../components/BotaoPrimario";
import { BotaoSecundario } from "../../../../../components/BotaoSecundario";
import { Campo, classeCampo } from "../../../../../components/Campo";
import { Tabela } from "../../../../../components/Tabela";
import { CabecalhoAdmin } from "../../../../../components/CabecalhoAdmin";
import { CampoBusca } from "../../../../../components/CampoBusca";
import { AbasFiltro } from "../../../../../components/AbasFiltro";
import { AcaoTabela } from "../../../../../components/AcaoTabela";
import { IconeEditar } from "../../../../../components/Icones";
import { CampoCheckbox } from "../../../../../components/CampoCheckbox";
import { MensagemErro } from "../../../../../components/MensagemErro";
import { ImportadorPlanilha } from "../../../../../components/ImportadorPlanilha";
import { MODELOS_IMPORTACAO } from "../../../../../lib/importacao";
import { useBusca } from "../../../../../lib/hooks/useBusca";
import { TAMANHO_MAXIMO_CODIGO_CURSO } from "../../../../../lib/curso";
import { acaoCriarCurso, acaoAtualizarCurso, acaoImportarCursos } from "./acoes";

type CursoLinha = {
  id: number;
  codigo: string;
  nome: string;
  ativo: boolean;
  coordenadores: string[];
  totalDocentes: number;
};

export function ListaCursos({ cursos, periodoRotulo }: { cursos: CursoLinha[]; periodoRotulo: string | null }) {
  const router = useRouter();
  const [aba, setAba] = useState<"ativos" | "inativos">("ativos");
  const [modalAberto, setModalAberto] = useState(false);
  const [cursoEmEdicao, setCursoEmEdicao] = useState<CursoLinha | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const busca = useBusca();

  const cursosAtivos = cursos.filter((curso) => curso.ativo);
  const cursosInativos = cursos.filter((curso) => !curso.ativo);
  const visiveis = (aba === "ativos" ? cursosAtivos : cursosInativos).filter(
    (curso) =>
      curso.nome.toLowerCase().includes(busca.normalizado) || curso.codigo.toLowerCase().includes(busca.normalizado),
  );

  function abrirNovo() {
    setCursoEmEdicao(null);
    setCodigo("");
    setNome("");
    setAtivo(true);
    setErro(null);
    setModalAberto(true);
  }

  function abrirEdicao(curso: CursoLinha) {
    setCursoEmEdicao(curso);
    setCodigo(curso.codigo);
    setNome(curso.nome);
    setAtivo(curso.ativo);
    setErro(null);
    setModalAberto(true);
  }

  function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    const dados = { codigo, nome, ativo };
    startTransition(async () => {
      const resultado = cursoEmEdicao
        ? await acaoAtualizarCurso(cursoEmEdicao.id, dados)
        : await acaoCriarCurso(dados);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setModalAberto(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoAdmin
        titulo="Cursos"
        subtitulo={
          <p className="text-[15px] text-tinta-suave">Cada curso gera um relatório por docente e por semestre.</p>
        }
        acao={
          <>
            <ImportadorPlanilha
              modelo={MODELOS_IMPORTACAO.cursos}
              eyebrow="ADMINISTRAÇÃO · CURSOS"
              titulo="Importar cursos"
              descricao="Um curso por linha. Código já cadastrado é ignorado, sem alterar o curso existente."
              acao={acaoImportarCursos}
            />
            <BotaoPrimario onClick={abrirNovo} icone>
              Novo curso
            </BotaoPrimario>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <CampoBusca
          id="busca-curso"
          rotuloAcessivel="Buscar curso por nome ou código"
          placeholder="Buscar por nome ou código…"
          valor={busca.valor}
          onChange={busca.definir}
        />
        <AbasFiltro
          aba={aba}
          onMudar={setAba}
          opcoes={[
            { valor: "ativos", rotulo: "Ativos", contagem: cursosAtivos.length },
            { valor: "inativos", rotulo: "Inativos", contagem: cursosInativos.length },
          ]}
        />
      </div>

      <Tabela<CursoLinha>
        minWidthPx={700}
        linhas={visiveis}
        chave={(curso) => curso.id}
        vazio={
          busca.normalizado
            ? "Nenhum curso encontrado."
            : `Nenhum curso ${aba === "ativos" ? "ativo" : "inativo"}.`
        }
        colunas={[
          {
            cabecalho: "Código",
            classeCelula: "whitespace-nowrap font-mono text-[13px] font-medium",
            render: (curso) => curso.codigo,
          },
          { cabecalho: "Curso", render: (curso) => curso.nome },
          {
            cabecalho: "Coordenação",
            classeCelula: "text-tinta-suave",
            render: (curso) =>
              curso.coordenadores.length > 0 ? curso.coordenadores.join(", ") : "sem coordenação definida",
          },
          {
            cabecalho: periodoRotulo ? `Docentes em ${periodoRotulo}` : "Docentes",
            alinhado: "direita",
            classeCelula: "font-mono font-medium tabular-nums",
            render: (curso) => curso.totalDocentes,
          },
          { cabecalho: "Situação", render: (curso) => <PillAtivo ativo={curso.ativo} /> },
          {
            cabecalho: "",
            alinhado: "direita",
            render: (curso) => (
              <AcaoTabela rotulo={`Editar ${curso.nome}`} onClick={() => abrirEdicao(curso)}>
                <IconeEditar className="h-[18px] w-[18px]" />
              </AcaoTabela>
            ),
          },
        ]}
      />

      <Modal
        aberto={modalAberto}
        eyebrow="ADMINISTRAÇÃO · CURSOS"
        titulo={cursoEmEdicao ? "Editar curso" : "Novo curso"}
        onFechar={() => setModalAberto(false)}
        rodape={
          <>
            <BotaoSecundario onClick={() => setModalAberto(false)}>Cancelar</BotaoSecundario>
            <BotaoPrimario type="submit" form="form-curso" disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar curso"}
            </BotaoPrimario>
          </>
        }
      >
        <form id="form-curso" onSubmit={salvar} className="flex flex-col gap-4">
          {erro && <MensagemErro>{erro}</MensagemErro>}
          <Campo
            rotulo="Código (usado nas planilhas)"
            htmlFor="codigo-curso"
            dica={{
              id: "ajuda-codigo-curso",
              texto:
                "De 2 a 20 letras sem acento, números ou hífen, como ENF ou DIR-01. As planilhas de vínculo usam este código para achar o curso.",
            }}
          >
            <input
              id="codigo-curso"
              type="text"
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value.toUpperCase())}
              required
              minLength={2}
              maxLength={TAMANHO_MAXIMO_CODIGO_CURSO}
              pattern="[A-Za-z0-9]([A-Za-z0-9\-]*[A-Za-z0-9])?"
              title="Letras sem acento, números e hífen, sem hífen nas pontas."
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="ajuda-codigo-curso"
              className={`${classeCampo} font-mono uppercase`}
            />
          </Campo>
          <Campo rotulo="Nome do curso" htmlFor="nome-curso">
            <input
              id="nome-curso"
              type="text"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              required
              className={classeCampo}
            />
          </Campo>
          <CampoCheckbox id="curso-ativo" rotulo="Curso ativo" checked={ativo} onChange={setAtivo} className="pt-1" />
        </form>
      </Modal>
    </div>
  );
}
