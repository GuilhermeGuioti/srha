"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pill, type Forma } from "../../../../../components/Pill";
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
import { IconeCadeado, IconeChevron, IconeEditar, IconeRemover } from "../../../../../components/Icones";
import { ModalVinculo } from "../../../../../components/ModalVinculo";
import { NomeCurso } from "../../../../../components/NomeCurso";
import { SeletorFiltro } from "../../../../../components/SeletorFiltro";
import { CampoCheckbox } from "../../../../../components/CampoCheckbox";
import { MensagemErro } from "../../../../../components/MensagemErro";
import { ImportadorPlanilha } from "../../../../../components/ImportadorPlanilha";
import { MODELOS_IMPORTACAO } from "../../../../../lib/importacao";
import { useBusca } from "../../../../../lib/hooks/useBusca";
import { TAMANHO_MAXIMO_SENHA, TAMANHO_MINIMO_SENHA } from "../../../../../lib/senha";
import { acaoCriarUsuario, acaoAtualizarUsuario, acaoDefinirSenhaProvisoria, acaoImportarUsuarios } from "./acoes";
import { acaoVincular, acaoDesvincularDocente, acaoDesvincularCoordenador } from "../vinculos/acoes";
import type { Perfil as TipoPerfil } from "../../../../../generated/prisma/client";

type SituacaoSenha = "nenhuma" | "provisoria" | "definida";

type VinculoUsuario =
  | { id: number; tipo: "docente"; cursoCodigo: string; cursoNome: string; periodoRotulo: string }
  | { id: number; tipo: "coordenador"; cursoCodigo: string; cursoNome: string };

type UsuarioLinha = {
  id: number;
  nome: string;
  email: string;
  ativo: boolean;
  secretaria: boolean;
  perfis: TipoPerfil[];
  vinculos: VinculoUsuario[];
  senha: SituacaoSenha;
  historicoSenha: { id: number; quem: string; quando: string }[];
};

const rotuloSenha: Record<SituacaoSenha, string> = {
  nenhuma: "Não definida",
  provisoria: "Provisória — a pessoa troca no primeiro acesso",
  definida: "Definida pela pessoa",
};

// Mesmos selos do /login: cor, rótulo e forma, para o perfil não depender só da cor.
const rotuloPerfil: Record<TipoPerfil, { rotulo: string; cor: "interativo" | "aprovado" | "neutro"; forma: Forma }> = {
  DOCENTE: { rotulo: "Docente", cor: "interativo", forma: "circulo" },
  COORDENADOR: { rotulo: "Coordenação", cor: "aprovado", forma: "quadrado" },
  SECRETARIA: { rotulo: "Secretaria", cor: "neutro", forma: "circulo-vazado" },
};

type FiltroPerfil = "todos" | TipoPerfil | "nenhum";

const OPCOES_FILTRO_PERFIL: { valor: FiltroPerfil; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos os perfis" },
  { valor: "DOCENTE", rotulo: "Docente" },
  { valor: "COORDENADOR", rotulo: "Coordenação" },
  { valor: "SECRETARIA", rotulo: "Secretaria" },
  { valor: "nenhum", rotulo: "Sem perfil" },
];

function temPerfil(usuario: UsuarioLinha, filtro: FiltroPerfil): boolean {
  if (filtro === "todos") return true;
  if (filtro === "nenhum") return usuario.perfis.length === 0;
  return usuario.perfis.includes(filtro);
}

const COLUNAS = 5;

export function ListaUsuarios({
  usuarios,
  cursos,
  periodos,
}: {
  usuarios: UsuarioLinha[];
  cursos: { id: number; codigo: string; nome: string }[];
  periodos: { id: number; rotulo: string }[];
}) {
  const router = useRouter();
  const [modalAberto, setModalAberto] = useState(false);
  const [usuarioEmEdicao, setUsuarioEmEdicao] = useState<UsuarioLinha | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [secretaria, setSecretaria] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const busca = useBusca();
  const [aba, setAba] = useState<"ativos" | "inativos">("ativos");
  const [filtroPerfil, setFiltroPerfil] = useState<FiltroPerfil>("todos");
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [usuarioDaSenha, setUsuarioDaSenha] = useState<UsuarioLinha | null>(null);
  const [senhaProvisoria, setSenhaProvisoria] = useState("");
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [usuarioDoVinculo, setUsuarioDoVinculo] = useState<UsuarioLinha | null>(null);
  // Nova a cada abertura: o formulário do vínculo abre zerado (ModalVinculo).
  const [aberturaVinculo, setAberturaVinculo] = useState(0);

  const usuariosAtivos = usuarios.filter((usuario) => usuario.ativo);
  const usuariosInativos = usuarios.filter((usuario) => !usuario.ativo);
  const visiveis = (aba === "ativos" ? usuariosAtivos : usuariosInativos).filter(
    (usuario) =>
      temPerfil(usuario, filtroPerfil) &&
      (usuario.nome.toLowerCase().includes(busca.normalizado) ||
        usuario.email.toLowerCase().includes(busca.normalizado)),
  );

  function alternarExpandido(id: number) {
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) {
        proximo.delete(id);
      } else {
        proximo.add(id);
      }
      return proximo;
    });
  }

  function abrirNovo() {
    setUsuarioEmEdicao(null);
    setNome("");
    setEmail("");
    setAtivo(true);
    setSecretaria(false);
    setErro(null);
    setModalAberto(true);
  }

  function abrirEdicao(usuario: UsuarioLinha) {
    setUsuarioEmEdicao(usuario);
    setNome(usuario.nome);
    setEmail(usuario.email);
    setAtivo(usuario.ativo);
    setSecretaria(usuario.secretaria);
    setErro(null);
    setModalAberto(true);
  }

  function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    const dados = { nome, email, ativo, secretaria };
    startTransition(async () => {
      const resultado = usuarioEmEdicao
        ? await acaoAtualizarUsuario(usuarioEmEdicao.id, dados)
        : await acaoCriarUsuario(dados);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setModalAberto(false);
      router.refresh();
    });
  }

  function abrirSenha(usuario: UsuarioLinha) {
    setUsuarioDaSenha(usuario);
    setSenhaProvisoria("");
    setErroSenha(null);
  }

  function salvarSenha(evento: FormEvent) {
    evento.preventDefault();
    if (!usuarioDaSenha) return;
    setErroSenha(null);
    startTransition(async () => {
      const resultado = await acaoDefinirSenhaProvisoria(usuarioDaSenha.id, senhaProvisoria);
      if (!resultado.ok) {
        setErroSenha(resultado.erro);
        return;
      }
      setUsuarioDaSenha(null);
      router.refresh();
    });
  }

  function abrirVinculo(usuario: UsuarioLinha) {
    setUsuarioDoVinculo(usuario);
    setAberturaVinculo((atual) => atual + 1);
  }

  function removerVinculo(usuario: UsuarioLinha, vinculo: VinculoUsuario) {
    if (!window.confirm(`Remover o vínculo de ${usuario.nome} em ${vinculo.cursoNome}?`)) return;
    startTransition(async () => {
      const resultado = await (vinculo.tipo === "docente"
        ? acaoDesvincularDocente(vinculo.id)
        : acaoDesvincularCoordenador(vinculo.id));
      if (!resultado.ok) {
        // Fora de modal não há onde pendurar MensagemErro — mesmo canal nativo
        // do confirm acima, como na tela de vínculos.
        window.alert(resultado.erro);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoAdmin
        titulo="Usuários"
        subtitulo={
          <p className="text-[15px] text-tinta-suave">
            Pessoas com acesso ao sistema. Clique numa pessoa para ver e vincular cursos e ver a senha de acesso.
          </p>
        }
        acao={
          <>
            <ImportadorPlanilha
              modelo={MODELOS_IMPORTACAO.usuarios}
              eyebrow="ADMINISTRAÇÃO · USUÁRIOS"
              titulo="Importar usuários"
              descricao="Uma pessoa por linha. E-mail já cadastrado tem o nome atualizado, e a Secretaria também se a coluna vier na planilha. As colunas de cursos são opcionais e vinculam pelo código do curso; a planilha só acrescenta vínculos, nunca remove."
              acao={acaoImportarUsuarios}
            />
            <BotaoPrimario onClick={abrirNovo} icone>
              Novo usuário
            </BotaoPrimario>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <CampoBusca
          id="busca-usuario"
          rotuloAcessivel="Buscar usuário por nome ou e-mail"
          placeholder="Buscar por nome ou e-mail…"
          valor={busca.valor}
          onChange={busca.definir}
        />
        <SeletorFiltro
          id="filtro-perfil-usuario"
          rotuloAcessivel="Filtrar por perfil"
          valor={filtroPerfil}
          onChange={(valor) => setFiltroPerfil(valor as FiltroPerfil)}
          opcoes={OPCOES_FILTRO_PERFIL}
        />
        <AbasFiltro
          aba={aba}
          onMudar={setAba}
          opcoes={[
            { valor: "ativos", rotulo: "Ativos", contagem: usuariosAtivos.length },
            { valor: "inativos", rotulo: "Inativos", contagem: usuariosInativos.length },
          ]}
        />
      </div>

      <Tabela<UsuarioLinha>
        minWidthPx={720}
        linhas={visiveis}
        chave={(usuario) => usuario.id}
        vazio={
          busca.normalizado || filtroPerfil !== "todos"
            ? "Nenhum usuário encontrado."
            : `Nenhum usuário ${aba === "ativos" ? "ativo" : "inativo"}.`
        }
        colunas={[
          {
            cabecalho: "Pessoa",
            classeCelula: "whitespace-nowrap",
            render: (usuario) => {
              const aberto = expandidos.has(usuario.id);
              return (
                <button
                  type="button"
                  onClick={() => alternarExpandido(usuario.id)}
                  aria-expanded={aberto}
                  aria-controls={`detalhes-usuario-${usuario.id}`}
                  className="-ml-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-left font-medium transition-colors hover:bg-papel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azul-interativo"
                >
                  <IconeChevron
                    className={`h-3.5 w-3.5 flex-none text-tinta-suave transition-transform ${aberto ? "rotate-90" : ""}`}
                  />
                  {usuario.nome}
                </button>
              );
            },
          },
          {
            cabecalho: "E-mail institucional",
            classeCelula: "whitespace-nowrap font-mono text-[13px] font-medium text-tinta-suave",
            render: (usuario) => usuario.email,
          },
          {
            cabecalho: "Perfil",
            render: (usuario) =>
              usuario.perfis.length === 0 ? (
                <span className="text-tinta-suave">—</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {usuario.perfis.map((perfil) => (
                    <Pill key={perfil} cor={rotuloPerfil[perfil].cor} forma={rotuloPerfil[perfil].forma}>
                      {rotuloPerfil[perfil].rotulo}
                    </Pill>
                  ))}
                </div>
              ),
          },
          { cabecalho: "Situação", render: (usuario) => <PillAtivo ativo={usuario.ativo} /> },
          {
            cabecalho: "",
            alinhado: "direita",
            classeCelula: "whitespace-nowrap",
            render: (usuario) => (
              <div className="inline-flex gap-1">
                <AcaoTabela
                  rotulo={`${usuario.senha === "nenhuma" ? "Definir" : "Redefinir"} senha provisória de ${usuario.nome}`}
                  onClick={() => abrirSenha(usuario)}
                >
                  <IconeCadeado className="h-[18px] w-[18px]" />
                </AcaoTabela>
                <AcaoTabela rotulo={`Editar ${usuario.nome}`} onClick={() => abrirEdicao(usuario)}>
                  <IconeEditar className="h-[18px] w-[18px]" />
                </AcaoTabela>
              </div>
            ),
          },
        ]}
        linhaExtra={(usuario) => {
          if (!expandidos.has(usuario.id)) return null;
          return (
            <tr id={`detalhes-usuario-${usuario.id}`} className="border-b border-borda/70 bg-superficie-sutil last:border-0">
              <td colSpan={COLUNAS} className="px-4 py-4 pl-12">
                <div className="flex flex-wrap gap-x-10 gap-y-3 text-[15px]">
                  <div>
                    <div className="text-[13px] font-semibold text-tinta-suave">Cursos</div>
                    {usuario.vinculos.length === 0 ? (
                      <div className="mt-1.5 text-tinta-suave">Nenhum vínculo com curso.</div>
                    ) : (
                      <ul className="mt-1 flex flex-col">
                        {usuario.vinculos.map((vinculo) => {
                          const perfil = rotuloPerfil[vinculo.tipo === "docente" ? "DOCENTE" : "COORDENADOR"];
                          return (
                            <li key={`${vinculo.tipo}-${vinculo.id}`} className="flex flex-wrap items-center gap-x-3">
                              <NomeCurso codigo={vinculo.cursoCodigo} nome={vinculo.cursoNome} />
                              <Pill cor={perfil.cor} forma={perfil.forma}>
                                {perfil.rotulo}
                              </Pill>
                              {vinculo.tipo === "docente" && (
                                <span className="font-mono text-[13px] tabular-nums text-tinta-suave">
                                  {vinculo.periodoRotulo}
                                </span>
                              )}
                              <AcaoTabela
                                cor="devolvido"
                                rotulo={`Remover vínculo de ${usuario.nome} em ${vinculo.cursoNome}`}
                                onClick={() => removerVinculo(usuario, vinculo)}
                              >
                                <IconeRemover className="h-[18px] w-[18px]" />
                              </AcaoTabela>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {/* Inativo não ganha vínculo novo (o serviço recusa); os que
                        já tem continuam aqui. */}
                    {usuario.ativo && (
                      <div className="mt-2">
                        <BotaoSecundario onClick={() => abrirVinculo(usuario)}>Vincular a um curso</BotaoSecundario>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-tinta-suave">Senha de acesso</div>
                    <div className="mt-1.5">{rotuloSenha[usuario.senha]}</div>
                    {usuario.historicoSenha.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1 text-[13px] text-tinta-suave">
                        {usuario.historicoSenha.map((definicao) => (
                          <li key={definicao.id}>
                            Provisória definida por <span className="font-semibold text-tinta">{definicao.quem}</span> em{" "}
                            <span className="font-mono tabular-nums">{definicao.quando}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          );
        }}
      />

      <Modal
        aberto={modalAberto}
        eyebrow="ADMINISTRAÇÃO · USUÁRIOS"
        titulo={usuarioEmEdicao ? "Editar usuário" : "Novo usuário"}
        descricao="Docente e coordenação são consequência do vínculo com o curso: clique na pessoa, na lista, para vincular."
        onFechar={() => setModalAberto(false)}
        rodape={
          <>
            <BotaoSecundario onClick={() => setModalAberto(false)}>Cancelar</BotaoSecundario>
            <BotaoPrimario type="submit" form="form-usuario" disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar usuário"}
            </BotaoPrimario>
          </>
        }
      >
        <form id="form-usuario" onSubmit={salvar} className="flex flex-col gap-4">
          {erro && <MensagemErro>{erro}</MensagemErro>}
          <Campo rotulo="Nome" htmlFor="nome-usuario">
            <input
              id="nome-usuario"
              type="text"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              required
              className={classeCampo}
            />
          </Campo>
          <Campo rotulo="E-mail institucional" htmlFor="email-usuario">
            <input
              id="email-usuario"
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              required
              className={classeCampo}
            />
          </Campo>
          <CampoCheckbox id="usuario-ativo" rotulo="Usuário ativo" checked={ativo} onChange={setAtivo} className="pt-1" />
          <CampoCheckbox id="usuario-secretaria" rotulo="Secretaria acadêmica" checked={secretaria} onChange={setSecretaria} />
        </form>
      </Modal>

      <ModalVinculo
        key={aberturaVinculo}
        aberto={usuarioDoVinculo !== null}
        onFechar={() => setUsuarioDoVinculo(null)}
        eyebrow="ADMINISTRAÇÃO · USUÁRIOS"
        titulo={usuarioDoVinculo ? `Vincular ${usuarioDoVinculo.nome} a um curso` : "Vincular a um curso"}
        cursos={cursos}
        periodos={periodos}
        tipo="escolher"
        pessoa={{ id: usuarioDoVinculo?.id ?? 0 }}
        vincular={acaoVincular}
      />

      <Modal
        aberto={usuarioDaSenha !== null}
        eyebrow="ADMINISTRAÇÃO · USUÁRIOS"
        titulo="Senha provisória"
        descricao={`Passe a senha para ${usuarioDaSenha?.nome ?? "a pessoa"}. No primeiro acesso, o sistema pede para trocá-la. Uma senha anterior deixa de valer, e fica registrado que foi você quem definiu esta.`}
        onFechar={() => setUsuarioDaSenha(null)}
        rodape={
          <>
            <BotaoSecundario onClick={() => setUsuarioDaSenha(null)}>Cancelar</BotaoSecundario>
            <BotaoPrimario type="submit" form="form-senha" disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar senha"}
            </BotaoPrimario>
          </>
        }
      >
        <form id="form-senha" onSubmit={salvarSenha} className="flex flex-col gap-4">
          {erroSenha && <MensagemErro>{erroSenha}</MensagemErro>}
          {/* Texto visível de propósito: a secretaria precisa conferir o que
              digitou antes de passar adiante. */}
          <Campo rotulo={`Senha provisória (mínimo de ${TAMANHO_MINIMO_SENHA} caracteres)`} htmlFor="senha-provisoria">
            <input
              id="senha-provisoria"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={senhaProvisoria}
              onChange={(evento) => setSenhaProvisoria(evento.target.value)}
              required
              minLength={TAMANHO_MINIMO_SENHA}
              maxLength={TAMANHO_MAXIMO_SENHA}
              className={`${classeCampo} font-mono`}
            />
          </Campo>
        </form>
      </Modal>
    </div>
  );
}
