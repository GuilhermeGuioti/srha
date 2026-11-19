"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LinkTexto } from "../../../../../components/LinkTexto";
import { BotaoPrimario } from "../../../../../components/BotaoPrimario";
import { ModalVinculo, type TipoVinculo } from "../../../../../components/ModalVinculo";
import { NomeCurso } from "../../../../../components/NomeCurso";
import { Destaque } from "../../../../../components/Destaque";
import { SeletorFiltro } from "../../../../../components/SeletorFiltro";
import { Tabela } from "../../../../../components/Tabela";
import { CabecalhoAdmin } from "../../../../../components/CabecalhoAdmin";
import { CampoBusca } from "../../../../../components/CampoBusca";
import { AcaoTabela } from "../../../../../components/AcaoTabela";
import { IconeRemover } from "../../../../../components/Icones";
import { ImportadorPlanilha } from "../../../../../components/ImportadorPlanilha";
import { MODELOS_IMPORTACAO } from "../../../../../lib/importacao";
import { useBusca } from "../../../../../lib/hooks/useBusca";
import {
  acaoVincular,
  acaoDesvincularDocente,
  acaoDesvincularCoordenador,
  acaoImportarVinculosDocente,
  acaoImportarVinculosCoordenador,
} from "./acoes";

type Periodo = { id: number; rotulo: string };
type Curso = { id: number; codigo: string; nome: string };
type Opcao = { id: number; nome: string };
type VinculoDocente = {
  id: number;
  periodoLetivoId: number;
  periodoRotulo: string;
  cursoId: number;
  cursoCodigo: string;
  cursoNome: string;
  docenteId: number;
  docenteNome: string;
};
type VinculoCoordenador = {
  id: number;
  cursoId: number;
  cursoCodigo: string;
  cursoNome: string;
  coordenadorId: number;
  coordenadorNome: string;
};

export function ListaVinculos({
  periodos,
  vinculosDocente,
  vinculosCoordenador,
  cursos,
  usuarios,
}: {
  periodos: Periodo[];
  vinculosDocente: VinculoDocente[];
  vinculosCoordenador: VinculoCoordenador[];
  cursos: Curso[];
  usuarios: Opcao[];
}) {
  const router = useRouter();
  const [modo, setModo] = useState<TipoVinculo | null>(null);
  // Nova a cada abertura: o formulário do vínculo abre zerado (ModalVinculo).
  const [abertura, setAbertura] = useState(0);
  const [, startTransition] = useTransition();
  const buscaDocentes = useBusca();
  const buscaCoordenadores = useBusca();
  const [periodoFiltroId, setPeriodoFiltroId] = useState<number | "todos">("todos");

  const docentesFiltrados = vinculosDocente.filter(
    (vinculo) =>
      (periodoFiltroId === "todos" || vinculo.periodoLetivoId === periodoFiltroId) &&
      (vinculo.docenteNome.toLowerCase().includes(buscaDocentes.normalizado) ||
        vinculo.cursoNome.toLowerCase().includes(buscaDocentes.normalizado) ||
        vinculo.cursoCodigo.toLowerCase().includes(buscaDocentes.normalizado)),
  );

  const coordenadoresFiltrados = vinculosCoordenador.filter(
    (vinculo) =>
      vinculo.coordenadorNome.toLowerCase().includes(buscaCoordenadores.normalizado) ||
      vinculo.cursoNome.toLowerCase().includes(buscaCoordenadores.normalizado) ||
      vinculo.cursoCodigo.toLowerCase().includes(buscaCoordenadores.normalizado),
  );

  function abrirNovo(novoModo: TipoVinculo) {
    setModo(novoModo);
    setAbertura((atual) => atual + 1);
  }

  function remover(tipoVinculo: TipoVinculo, id: number, rotulo: string) {
    if (!window.confirm(`Remover o vínculo de ${rotulo}?`)) return;
    startTransition(async () => {
      const resultado = await (tipoVinculo === "docente" ? acaoDesvincularDocente(id) : acaoDesvincularCoordenador(id));
      if (!resultado.ok) {
        // Fora do modal não há onde pendurar MensagemErro — mesmo canal nativo
        // do confirm acima.
        window.alert(resultado.erro);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <CabecalhoAdmin
        titulo="Vínculos"
        subtitulo={
          <p className="text-[15px] text-tinta-suave">
            Quem dá aula em qual curso, por período, e quem coordena cada curso.
          </p>
        }
      />

      {periodos.length === 0 && (
        <Destaque como="p" tom="aguardando" className="text-[15px] text-tinta">
          Nenhum período letivo cadastrado.{" "}
          <LinkTexto href="/admin/periodos">Cadastre um período</LinkTexto>{" "}
          antes de vincular docentes a cursos.
        </Destaque>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        {periodos.length > 0 && (
          <section className="flex flex-col gap-4">
            <CabecalhoAdmin
              nivel={2}
              titulo="Docentes por curso"
              acao={
                <>
                  <ImportadorPlanilha
                    modelo={MODELOS_IMPORTACAO.vinculosDocente}
                    eyebrow="ADMINISTRAÇÃO · VÍNCULOS"
                    titulo="Importar vínculos de docentes"
                    descricao="Um vínculo por linha, com o curso pelo código. Docente, curso e período precisam estar cadastrados e ativos; vínculo que já existe é ignorado."
                    complementoAcessivel="de vínculos de docentes"
                    acao={acaoImportarVinculosDocente}
                  />
                  <BotaoPrimario onClick={() => abrirNovo("docente")} icone>
                    Vincular docente
                  </BotaoPrimario>
                </>
              }
            />

            <div className="flex flex-wrap gap-2">
              <CampoBusca
                id="busca-docentes"
                rotuloAcessivel="Buscar por nome do docente, nome ou código do curso"
                placeholder="Buscar por docente ou curso…"
                valor={buscaDocentes.valor}
                onChange={buscaDocentes.definir}
              />
              <SeletorFiltro
                id="filtro-periodo-docentes"
                rotuloAcessivel="Filtrar por período letivo"
                valor={periodoFiltroId}
                onChange={(valor) => setPeriodoFiltroId(valor === "todos" ? "todos" : Number(valor))}
                opcoes={[
                  { valor: "todos", rotulo: "Todos os períodos" },
                  ...periodos.map((periodo) => ({ valor: periodo.id, rotulo: periodo.rotulo })),
                ]}
              />
            </div>

            <Tabela<VinculoDocente>
              minWidthPx={0}
              linhas={docentesFiltrados}
              chave={(vinculo) => vinculo.id}
              vazio={
                buscaDocentes.normalizado || periodoFiltroId !== "todos"
                  ? "Nenhum vínculo encontrado."
                  : "Nenhum docente vinculado."
              }
              colunas={[
                {
                  cabecalho: "Curso",
                  largura: "38%",
                  render: (vinculo) => <NomeCurso codigo={vinculo.cursoCodigo} nome={vinculo.cursoNome} />,
                },
                { cabecalho: "Docente", largura: "38%", render: (vinculo) => vinculo.docenteNome },
                {
                  cabecalho: "Período",
                  largura: "12%",
                  classeCelula: "font-mono text-[13px] tabular-nums text-tinta-suave",
                  render: (vinculo) => vinculo.periodoRotulo,
                },
                {
                  cabecalho: "",
                  alinhado: "direita",
                  largura: "12%",
                  render: (vinculo) => (
                    <AcaoTabela
                      cor="devolvido"
                      rotulo={`Remover vínculo de ${vinculo.docenteNome} em ${vinculo.cursoNome}`}
                      onClick={() => remover("docente", vinculo.id, `${vinculo.docenteNome} em ${vinculo.cursoNome}`)}
                    >
                      <IconeRemover className="h-[18px] w-[18px]" />
                    </AcaoTabela>
                  ),
                },
              ]}
            />
          </section>
        )}

        <section className="flex flex-col gap-4">
          <CabecalhoAdmin
            nivel={2}
            titulo="Coordenadores por curso"
            acao={
              <>
                <ImportadorPlanilha
                  modelo={MODELOS_IMPORTACAO.vinculosCoordenador}
                  eyebrow="ADMINISTRAÇÃO · VÍNCULOS"
                  titulo="Importar vínculos de coordenadores"
                  descricao="Um vínculo por linha, com o curso pelo código. O primeiro coordenador ativo cadastrado para o curso recebe os relatórios para avaliação — as linhas são gravadas na ordem da planilha. Vínculo que já existe é ignorado."
                  complementoAcessivel="de vínculos de coordenadores"
                  acao={acaoImportarVinculosCoordenador}
                />
                <BotaoPrimario onClick={() => abrirNovo("coordenador")} icone>
                  Vincular coordenador
                </BotaoPrimario>
              </>
            }
          />

          <div className="flex gap-2">
            <CampoBusca
              id="busca-coordenadores"
              rotuloAcessivel="Buscar por nome do coordenador, nome ou código do curso"
              placeholder="Buscar por coordenador ou curso…"
              valor={buscaCoordenadores.valor}
              onChange={buscaCoordenadores.definir}
            />
          </div>

          <Tabela<VinculoCoordenador>
            minWidthPx={0}
            linhas={coordenadoresFiltrados}
            chave={(vinculo) => vinculo.id}
            vazio={
              buscaCoordenadores.normalizado ? "Nenhum vínculo encontrado." : "Nenhum coordenador vinculado."
            }
            colunas={[
              {
                cabecalho: "Curso",
                largura: "38%",
                render: (vinculo) => <NomeCurso codigo={vinculo.cursoCodigo} nome={vinculo.cursoNome} />,
              },
              { cabecalho: "Coordenador", largura: "38%", render: (vinculo) => vinculo.coordenadorNome },
              {
                cabecalho: "",
                alinhado: "direita",
                largura: "24%",
                render: (vinculo) => (
                  <AcaoTabela
                    cor="devolvido"
                    rotulo={`Remover vínculo de ${vinculo.coordenadorNome} em ${vinculo.cursoNome}`}
                    onClick={() =>
                      remover("coordenador", vinculo.id, `${vinculo.coordenadorNome} em ${vinculo.cursoNome}`)
                    }
                  >
                    <IconeRemover className="h-[18px] w-[18px]" />
                  </AcaoTabela>
                ),
              },
            ]}
          />
        </section>
      </div>

      <ModalVinculo
        key={abertura}
        aberto={modo !== null}
        onFechar={() => setModo(null)}
        eyebrow="ADMINISTRAÇÃO · VÍNCULOS"
        titulo={modo === "docente" ? "Vincular docente a um curso" : "Vincular coordenador a um curso"}
        cursos={cursos}
        periodos={periodos}
        tipo={modo ?? "docente"}
        pessoa={{
          rotulo: modo === "docente" ? "Docente" : "Coordenador",
          opcoes: usuarios.map((usuario) => ({ id: usuario.id, rotulo: usuario.nome })),
        }}
        vincular={acaoVincular}
      />
    </div>
  );
}
