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
import { IconeCadeado, IconeEditar, IconeVinculos } from "../../../../../components/Icones";
import { SeletorFiltro } from "../../../../../components/SeletorFiltro";
import { CampoCheckbox } from "../../../../../components/CampoCheckbox";
import { MensagemErro } from "../../../../../components/MensagemErro";
import { ImportadorPlanilha } from "../../../../../components/ImportadorPlanilha";
import { MODELOS_IMPORTACAO } from "../../../../../lib/importacao";
import { useBusca } from "../../../../../lib/hooks/useBusca";
import { TAMANHO_MAXIMO_SENHA, TAMANHO_MINIMO_SENHA } from "../../../../../lib/senha";
import { acaoCriarUsuario, acaoAtualizarUsuario, acaoDefinirSenhaProvisoria, acaoImportarUsuarios } from "./acoes";
import { ModalVinculosUsuario, type VinculoUsuario } from "./vinculos-usuario";
import type { Perfil as TipoPerfil } from "../../../../../generated/prisma/client";

type SituacaoSenha = "nenhuma" | "provisoria" | "definida";

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
  const [usuarioDaSenha, setUsuarioDaSenha] = useState<UsuarioLinha | null>(null);
  const [senhaProvisoria, setSenhaProvisoria] = useState("");
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  // Pelo id, não pela linha: depois de vincular, a lista recarrega e o modal
  // mostra a pessoa como ela está agora.
  const [idDosVinculos, setIdDosVinculos] = useState<number | null>(null);
  const usuarioDosVinculos = usuarios.find((usuario) => usuario.id === idDosVinculos);

  const usuariosAtivos = usuarios.filter((usuario) => usuario.ativo);
  const usuariosInativos = usuarios.filter((usuario) => !usuario.ativo);
  const visiveis = (aba === "ativos" ? usuariosAtivos : usuariosInativos).filter(
    (usuario) =>
      temPerfil(usuario, filtroPerfil) &&
      (usuario.nome.toLowerCase().includes(busca.normalizado) ||
        usuario.email.toLowerCase().includes(busca.normalizado)),
  );

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

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoAdmin
        titulo="Usuários"
        subtitulo={
          <p className="text-[15px] text-tinta-suave">
            Pessoas com acesso ao sistema. Em cada linha: senha de acesso, vínculos com cursos e cadastro.
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
          { cabecalho: "Pessoa", classeCelula: "whitespace-nowrap font-medium", render: (usuario) => usuario.nome },
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
                <AcaoTabela rotulo={`Vínculos de ${usuario.nome} com cursos`} onClick={() => setIdDosVinculos(usuario.id)}>
                  <IconeVinculos className="h-[18px] w-[18px]" />
                </AcaoTabela>
                <AcaoTabela rotulo={`Editar ${usuario.nome}`} onClick={() => abrirEdicao(usuario)}>
                  <IconeEditar className="h-[18px] w-[18px]" />
                </AcaoTabela>
              </div>
            ),
          },
        ]}
      />

      <Modal
        aberto={modalAberto}
        eyebrow="ADMINISTRAÇÃO · USUÁRIOS"
        titulo={usuarioEmEdicao ? "Editar usuário" : "Novo usuário"}
        descricao="Docente e coordenação são consequência do vínculo com o curso — botão de vínculos na linha da pessoa."
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

      {usuarioDosVinculos && (
        <ModalVinculosUsuario
          pessoa={usuarioDosVinculos}
          cursos={cursos}
          periodos={periodos}
          onFechar={() => setIdDosVinculos(null)}
        />
      )}

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
          {usuarioDaSenha && (
            <div>
              <div className="text-[13px] font-semibold text-tinta-suave">Situação atual</div>
              <div className="mt-1 text-[15px]">{rotuloSenha[usuarioDaSenha.senha]}</div>
              {usuarioDaSenha.historicoSenha.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-[13px] text-tinta-suave">
                  {usuarioDaSenha.historicoSenha.map((definicao) => (
                    <li key={definicao.id}>
                      Provisória definida por <span className="font-semibold text-tinta">{definicao.quem}</span> em{" "}
                      <span className="font-mono tabular-nums">{definicao.quando}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
