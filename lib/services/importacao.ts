import { z } from "zod";
import { prisma } from "../db";
import { Perfil, Prisma } from "../../generated/prisma/client";
import { SchemaCodigoCurso, SchemaListaCodigosCurso } from "../curso";
import { mensagemPeriodoEncerrado, periodoEncerrado } from "../periodo";
import {
  MODELOS_IMPORTACAO,
  decodificarPlanilha,
  lerPlanilha,
  type ErroLinha,
  type LinhaPlanilha,
  type ResultadoImportacao,
} from "../importacao";
import { sincronizarPerfil } from "./perfis";
import { MENSAGEM_ULTIMA_SECRETARIA, SECRETARIA_ATIVA, travarPerfisDeSecretaria } from "./usuarios";

// Regras da importação de cadastro por planilha, comuns a todos os cadastros:
// - tudo ou nada: qualquer linha com erro e nada é gravado;
// - reimportar a mesma planilha não muda nada nem dá erro: o que já está
//   cadastrado é contado como já existente. Curso e vínculo existentes nunca
//   são alterados; usuário existente tem nome e secretaria atualizados pela
//   planilha (importarUsuarios);
// - nenhuma planilha remove vínculo, só acrescenta — e nunca em período
//   encerrado;
// - linha repetida dentro da própria planilha é erro, porque costuma ser
//   engano (o mesmo e-mail com dois nomes, por exemplo);
// - curso é sempre achado pelo código, nunca pelo nome: nome digitado com
//   erro caía em "não cadastrado" ou, pior, num curso de nome parecido.

type LinhaValida<T> = { linha: number; dados: T };

function validarLinhas<S extends z.ZodType>(
  linhas: LinhaPlanilha[],
  schema: S,
  erros: ErroLinha[],
): LinhaValida<z.output<S>>[] {
  const validas: LinhaValida<z.output<S>>[] = [];
  for (const { linha, valores } of linhas) {
    const resultado = schema.safeParse(valores);
    if (resultado.success) {
      validas.push({ linha, dados: resultado.data });
    } else {
      erros.push({ linha, erro: resultado.error.issues.map((problema) => problema.message).join(" ") });
    }
  }
  return validas;
}

// Sobre os valores crus, antes do zod: linha repetida que também tem outro
// erro aparece com os dois de uma vez, sem obrigar a uma segunda rodada.
function apontarRepetidas(
  linhas: LinhaPlanilha[],
  chave: (valores: Record<string, string>) => string,
  oQue: string,
  erros: ErroLinha[],
): void {
  const primeiraLinha = new Map<string, number>();
  for (const { linha, valores } of linhas) {
    const anterior = primeiraLinha.get(chave(valores));
    if (anterior === undefined) {
      primeiraLinha.set(chave(valores), linha);
    } else {
      erros.push({ linha, erro: `${oQue} repetido na planilha (já está na linha ${anterior}).` });
    }
  }
}

function falhou(erros: ErroLinha[]): ResultadoImportacao {
  return { gravado: false, erros: [...erros].sort((a, b) => a.linha - b.linha) };
}

// O @unique do banco diferencia caixa e espaço: sem isto, "engenharia civil"
// viraria um segundo curso ao lado de "Engenharia Civil".
function chaveNome(nome: string): string {
  return nome.replace(/\s+/g, " ").toLowerCase();
}

// Igual ao que o SchemaCodigoCurso grava, para comparar valores crus.
function chaveCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

type Cadastro = { id: number; ativo: boolean };

async function indexarCursosPorCodigo(tx: Prisma.TransactionClient): Promise<Map<string, Cadastro>> {
  const cursos = await tx.curso.findMany({ select: { id: true, codigo: true, ativo: true } });
  return new Map(cursos.map((curso) => [curso.codigo, curso]));
}

function resolverCurso(
  indice: Map<string, Cadastro>,
  codigo: string,
  linha: number,
  erros: ErroLinha[],
): number | null {
  const curso = indice.get(codigo);
  if (!curso) {
    erros.push({ linha, erro: `Nenhum curso cadastrado com o código ${codigo}.` });
  } else if (!curso.ativo) {
    erros.push({ linha, erro: `O curso ${codigo} está inativo.` });
  } else {
    return curso.id;
  }
  return null;
}

function resolverUsuario(
  indice: Map<string, Cadastro>,
  email: string,
  linha: number,
  erros: ErroLinha[],
): number | null {
  const usuario = indice.get(email);
  if (!usuario) {
    erros.push({ linha, erro: `Nenhum usuário cadastrado com o e-mail ${email}.` });
  } else if (!usuario.ativo) {
    erros.push({ linha, erro: `O usuário ${email} está inativo.` });
  } else {
    return usuario.id;
  }
  return null;
}

type PeriodoIndexado = { id: number; ano: number; semestre: number; encerramentoSubmissao: Date };

async function indexarPeriodos(tx: Prisma.TransactionClient): Promise<Map<string, PeriodoIndexado>> {
  const periodos = await tx.periodoLetivo.findMany({
    select: { id: true, ano: true, semestre: true, encerramentoSubmissao: true },
  });
  return new Map(periodos.map((periodo) => [`${periodo.ano}/${periodo.semestre}`, periodo]));
}

// Período encerrado não recebe vínculo de docente, nem por planilha.
function resolverPeriodo(
  indice: Map<string, PeriodoIndexado>,
  periodo: { ano: number; semestre: number },
  linha: number,
  erros: ErroLinha[],
): number | null {
  const encontrado = indice.get(`${periodo.ano}/${periodo.semestre}`);
  if (!encontrado) {
    erros.push({ linha, erro: `Período ${periodo.ano}/${periodo.semestre} não cadastrado.` });
  } else if (periodoEncerrado(encontrado)) {
    erros.push({ linha, erro: mensagemPeriodoEncerrado(encontrado) });
  } else {
    return encontrado.id;
  }
  return null;
}

type NovoVinculoDocente = { docenteId: number; cursoId: number; periodoLetivoId: number };
type NovoVinculoCoordenador = { coordenadorId: number; cursoId: number };

// Grava só os que faltam e conta os que já existiam. Quem tem vínculo de
// docente tem o perfil de docente — mesma consequência do vínculo manual
// (sincronizarPerfil).
async function gravarVinculosDocente(tx: Prisma.TransactionClient, vinculos: NovoVinculoDocente[]): Promise<number> {
  const existentes = await tx.vinculoDocenteCurso.findMany({
    where: { docenteId: { in: vinculos.map((vinculo) => vinculo.docenteId) } },
    select: { docenteId: true, cursoId: true, periodoLetivoId: true },
  });
  const chave = (vinculo: NovoVinculoDocente) => `${vinculo.docenteId}|${vinculo.cursoId}|${vinculo.periodoLetivoId}`;
  const jaCadastrados = new Set(existentes.map(chave));
  const { count } = await tx.vinculoDocenteCurso.createMany({
    data: vinculos.filter((vinculo) => !jaCadastrados.has(chave(vinculo))),
    skipDuplicates: true,
  });
  await tx.usuarioPerfil.createMany({
    data: [...new Set(vinculos.map((vinculo) => vinculo.docenteId))].map((usuarioId) => ({
      usuarioId,
      perfil: Perfil.DOCENTE,
    })),
    skipDuplicates: true,
  });
  return count;
}

async function gravarVinculosCoordenador(
  tx: Prisma.TransactionClient,
  vinculos: NovoVinculoCoordenador[],
): Promise<number> {
  const existentes = await tx.vinculoCoordenadorCurso.findMany({
    where: { coordenadorId: { in: vinculos.map((vinculo) => vinculo.coordenadorId) } },
    select: { coordenadorId: true, cursoId: true },
  });
  const chave = (vinculo: NovoVinculoCoordenador) => `${vinculo.coordenadorId}|${vinculo.cursoId}`;
  const jaCadastrados = new Set(existentes.map(chave));
  // Na ordem da planilha: o avaliador é o primeiro coordenador ativo pela
  // ordem de cadastro do vínculo, e um INSERT só numera as linhas na ordem
  // em que vêm.
  const { count } = await tx.vinculoCoordenadorCurso.createMany({
    data: vinculos.filter((vinculo) => !jaCadastrados.has(chave(vinculo))),
    skipDuplicates: true,
  });
  await tx.usuarioPerfil.createMany({
    data: [...new Set(vinculos.map((vinculo) => vinculo.coordenadorId))].map((usuarioId) => ({
      usuarioId,
      perfil: Perfil.COORDENADOR,
    })),
    skipDuplicates: true,
  });
  return count;
}

// Gravado e comparado em minúsculas, como no cadastro manual e no login.
const Email = z.string().toLowerCase();

const Ano = z.string().regex(/^\d{4}$/, "Ano inválido — use quatro dígitos, como 2026.").transform(Number);
const Semestre = z.enum(["1", "2"], "Semestre deve ser 1 ou 2.").transform(Number);

const SimNao = z.string().transform((valor, contexto) => {
  const normalizado = valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (normalizado === "" || normalizado === "nao") return false;
  if (normalizado === "sim") return true;
  contexto.addIssue({ code: "custom", message: "Secretaria: use Sim ou Não." });
  return z.NEVER;
});

// Ano e semestre só importam com curso como docente: o vínculo de docente é
// por período, o de coordenador não.
const SchemaLinhaUsuario = z
  .object({
    nome: z.string(),
    email: Email.pipe(z.email("E-mail inválido.")),
    secretaria: SimNao,
    cursosDocente: SchemaListaCodigosCurso,
    ano: z.string(),
    semestre: z.string(),
    cursosCoordenador: SchemaListaCodigosCurso,
  })
  .transform((linha, contexto) => {
    const { ano, semestre, ...resto } = linha;
    if (resto.cursosDocente.length === 0) return { ...resto, periodo: null };
    if (ano === "" || semestre === "") {
      contexto.addIssue({ code: "custom", message: "Informe Ano e Semestre para os cursos como docente." });
      return z.NEVER;
    }
    const anoLido = Ano.safeParse(ano);
    const semestreLido = Semestre.safeParse(semestre);
    if (!anoLido.success || !semestreLido.success) {
      for (const problema of [...(anoLido.error?.issues ?? []), ...(semestreLido.error?.issues ?? [])]) {
        contexto.addIssue({ code: "custom", message: problema.message });
      }
      return z.NEVER;
    }
    return { ...resto, periodo: { ano: anoLido.data, semestre: semestreLido.data } };
  });

/**
 * Cria quem não existe e atualiza nome e secretaria de quem já existe (pelo
 * e-mail). Sem a coluna Secretaria no cabeçalho, o perfil de secretaria de
 * quem já existe não muda — planilha antiga, só com nome e e-mail, não tira o
 * perfil de ninguém. Com as colunas de cursos, vincula pelo código: como
 * docente no período de Ano e Semestre e como coordenador, na ordem da
 * planilha.
 */
export async function importarUsuarios(bytes: Uint8Array): Promise<ResultadoImportacao> {
  const { linhas, erros, presentes } = lerPlanilha(decodificarPlanilha(bytes), MODELOS_IMPORTACAO.usuarios);
  apontarRepetidas(linhas, (valores) => valores.email.toLowerCase(), "E-mail", erros);
  const validas = validarLinhas(linhas, SchemaLinhaUsuario, erros);
  if (erros.length > 0) return falhou(erros);
  const informouSecretaria = presentes.has("secretaria");

  return prisma.$transaction(async (tx): Promise<ResultadoImportacao> => {
    await travarPerfisDeSecretaria(tx);
    const existentes = await tx.usuario.findMany({
      where: { email: { in: validas.map(({ dados }) => dados.email) } },
      include: { perfis: true },
    });
    const existentePorEmail = new Map(existentes.map((usuario) => [usuario.email, usuario]));
    const cursoPorCodigo = await indexarCursosPorCodigo(tx);
    const periodoPorRotulo = await indexarPeriodos(tx);

    const planos = validas.map(({ linha, dados }) => {
      const existente = existentePorEmail.get(dados.email);
      const eraSecretaria = existente?.perfis.some((perfil) => perfil.perfil === Perfil.SECRETARIA) ?? false;
      const secretaria = existente && !informouSecretaria ? eraSecretaria : dados.secretaria;
      if (existente && !existente.ativo && dados.cursosDocente.length + dados.cursosCoordenador.length > 0) {
        erros.push({ linha, erro: `O usuário ${dados.email} está inativo e não pode ser vinculado a curso.` });
      }
      const cursosDocente = dados.cursosDocente.map((codigo) => resolverCurso(cursoPorCodigo, codigo, linha, erros));
      const periodoLetivoId = dados.periodo ? resolverPeriodo(periodoPorRotulo, dados.periodo, linha, erros) : null;
      const cursosCoordenador = dados.cursosCoordenador.map((codigo) =>
        resolverCurso(cursoPorCodigo, codigo, linha, erros),
      );
      return {
        linha,
        dados,
        existente,
        secretaria,
        mudaNome: existente !== undefined && existente.nome !== dados.nome,
        mudaSecretaria: existente !== undefined && secretaria !== eraSecretaria,
        // Secretaria ativa que esta linha tira: inativa não contava antes.
        tiraSecretariaAtiva: existente !== undefined && existente.ativo && eraSecretaria && !secretaria,
        cursosDocente: cursosDocente.filter((id) => id !== null),
        periodoLetivoId,
        cursosCoordenador: cursosCoordenador.filter((id) => id !== null),
      };
    });

    // Antes de gravar: dentro da transação, devolver o erro sem lançar
    // confirmaria o que já tivesse sido gravado.
    const ativasAntes = await tx.usuario.count({ where: SECRETARIA_ATIVA });
    const ganham = planos.filter((plano) => plano.secretaria && (!plano.existente || (plano.existente.ativo && plano.mudaSecretaria)));
    const perdem = planos.filter((plano) => plano.tiraSecretariaAtiva);
    if (perdem.length > 0 && ativasAntes - perdem.length + ganham.length === 0) {
      for (const { linha } of perdem) {
        erros.push({ linha, erro: MENSAGEM_ULTIMA_SECRETARIA });
      }
    }
    if (erros.length > 0) return falhou(erros);

    // skipDuplicates: outra importação simultânea pode ter gravado o mesmo
    // e-mail entre a consulta acima e aqui — conta como "já existia".
    const novos = planos.filter((plano) => !plano.existente);
    const criados = await tx.usuario.createManyAndReturn({
      data: novos.map(({ dados }) => ({ nome: dados.nome, email: dados.email })),
      select: { id: true, email: true },
      skipDuplicates: true,
    });
    const secretariasNovas = new Set(novos.filter((plano) => plano.secretaria).map(({ dados }) => dados.email));
    await tx.usuarioPerfil.createMany({
      data: criados
        .filter((usuario) => secretariasNovas.has(usuario.email))
        .map((usuario) => ({ usuarioId: usuario.id, perfil: Perfil.SECRETARIA })),
    });

    let atualizados = 0;
    for (const plano of planos) {
      if (!plano.existente || !(plano.mudaNome || plano.mudaSecretaria)) continue;
      if (plano.mudaNome) {
        await tx.usuario.update({ where: { id: plano.existente.id }, data: { nome: plano.dados.nome } });
      }
      if (plano.mudaSecretaria) {
        await sincronizarPerfil(tx, plano.existente.id, Perfil.SECRETARIA, plano.secretaria);
      }
      atualizados++;
    }

    const idPorEmail = new Map([
      ...existentes.map((usuario) => [usuario.email, usuario.id] as const),
      ...criados.map((usuario) => [usuario.email, usuario.id] as const),
    ]);
    const vinculosDocente: NovoVinculoDocente[] = [];
    const vinculosCoordenador: NovoVinculoCoordenador[] = [];
    for (const plano of planos) {
      const usuarioId = idPorEmail.get(plano.dados.email);
      if (usuarioId === undefined) continue; // criado em paralelo por outra importação
      if (plano.periodoLetivoId !== null) {
        for (const cursoId of plano.cursosDocente) {
          vinculosDocente.push({ docenteId: usuarioId, cursoId, periodoLetivoId: plano.periodoLetivoId });
        }
      }
      for (const cursoId of plano.cursosCoordenador) {
        vinculosCoordenador.push({ coordenadorId: usuarioId, cursoId });
      }
    }
    const vinculos =
      (vinculosDocente.length > 0 ? await gravarVinculosDocente(tx, vinculosDocente) : 0) +
      (vinculosCoordenador.length > 0 ? await gravarVinculosCoordenador(tx, vinculosCoordenador) : 0);

    return {
      gravado: true,
      importados: criados.length,
      atualizados,
      jaExistiam: validas.length - criados.length - atualizados,
      vinculos,
    };
    // O padrão de 5 s não cobre centenas de linhas atualizadas uma a uma com o
    // pooler de produção no meio; a importação é rara e feita pela secretaria.
  }, { timeout: 30_000 });
}

const SchemaLinhaCurso = z.object({ codigo: SchemaCodigoCurso, nome: z.string() });

// Código já cadastrado conta como já existente, sem alterar o curso. Código
// novo com o nome de outro curso é recusado: o nome também é único.
export async function importarCursos(bytes: Uint8Array): Promise<ResultadoImportacao> {
  const { linhas, erros } = lerPlanilha(decodificarPlanilha(bytes), MODELOS_IMPORTACAO.cursos);
  apontarRepetidas(linhas, (valores) => chaveCodigo(valores.codigo), "Código", erros);
  apontarRepetidas(linhas, (valores) => chaveNome(valores.nome), "Curso", erros);
  const validas = validarLinhas(linhas, SchemaLinhaCurso, erros);
  if (erros.length > 0) return falhou(erros);

  return prisma.$transaction(async (tx): Promise<ResultadoImportacao> => {
    const existentes = await tx.curso.findMany({ select: { codigo: true, nome: true } });
    const codigos = new Set(existentes.map((curso) => curso.codigo));
    const porNome = new Map(existentes.map((curso) => [chaveNome(curso.nome), curso]));

    const novos = validas.filter(({ dados }) => !codigos.has(dados.codigo));
    for (const { linha, dados } of novos) {
      const homonimo = porNome.get(chaveNome(dados.nome));
      if (homonimo) {
        erros.push({ linha, erro: `Já existe o curso "${homonimo.nome}", com o código ${homonimo.codigo}.` });
      }
    }
    if (erros.length > 0) return falhou(erros);

    const { count } = await tx.curso.createMany({ data: novos.map(({ dados }) => dados), skipDuplicates: true });
    return { gravado: true, importados: count, jaExistiam: validas.length - count };
  });
}

const SchemaLinhaVinculoDocente = z.object({
  email: Email,
  curso: SchemaCodigoCurso,
  ano: Ano,
  semestre: Semestre,
});

export async function importarVinculosDocente(bytes: Uint8Array): Promise<ResultadoImportacao> {
  const { linhas, erros } = lerPlanilha(decodificarPlanilha(bytes), MODELOS_IMPORTACAO.vinculosDocente);
  apontarRepetidas(
    linhas,
    (valores) => `${valores.email.toLowerCase()}|${chaveCodigo(valores.curso)}|${valores.ano}/${valores.semestre}`,
    "Vínculo",
    erros,
  );
  const validas = validarLinhas(linhas, SchemaLinhaVinculoDocente, erros);

  return prisma.$transaction(async (tx): Promise<ResultadoImportacao> => {
    const usuarios = await tx.usuario.findMany({
      where: { email: { in: validas.map(({ dados }) => dados.email) } },
      select: { id: true, email: true, ativo: true },
    });
    const usuarioPorEmail = new Map(usuarios.map((usuario) => [usuario.email, usuario]));
    const cursoPorCodigo = await indexarCursosPorCodigo(tx);
    const periodoPorRotulo = await indexarPeriodos(tx);

    const vinculos: NovoVinculoDocente[] = [];
    for (const { linha, dados } of validas) {
      const docenteId = resolverUsuario(usuarioPorEmail, dados.email, linha, erros);
      const cursoId = resolverCurso(cursoPorCodigo, dados.curso, linha, erros);
      const periodoLetivoId = resolverPeriodo(periodoPorRotulo, dados, linha, erros);
      if (docenteId !== null && cursoId !== null && periodoLetivoId !== null) {
        vinculos.push({ docenteId, cursoId, periodoLetivoId });
      }
    }
    if (erros.length > 0) return falhou(erros);

    const count = await gravarVinculosDocente(tx, vinculos);
    return { gravado: true, importados: count, jaExistiam: vinculos.length - count };
  });
}

const SchemaLinhaVinculoCoordenador = z.object({ email: Email, curso: SchemaCodigoCurso });

export async function importarVinculosCoordenador(bytes: Uint8Array): Promise<ResultadoImportacao> {
  const { linhas, erros } = lerPlanilha(decodificarPlanilha(bytes), MODELOS_IMPORTACAO.vinculosCoordenador);
  apontarRepetidas(linhas, (valores) => `${valores.email.toLowerCase()}|${chaveCodigo(valores.curso)}`, "Vínculo", erros);
  const validas = validarLinhas(linhas, SchemaLinhaVinculoCoordenador, erros);

  return prisma.$transaction(async (tx): Promise<ResultadoImportacao> => {
    const usuarios = await tx.usuario.findMany({
      where: { email: { in: validas.map(({ dados }) => dados.email) } },
      select: { id: true, email: true, ativo: true },
    });
    const usuarioPorEmail = new Map(usuarios.map((usuario) => [usuario.email, usuario]));
    const cursoPorCodigo = await indexarCursosPorCodigo(tx);

    const vinculos: NovoVinculoCoordenador[] = [];
    for (const { linha, dados } of validas) {
      const coordenadorId = resolverUsuario(usuarioPorEmail, dados.email, linha, erros);
      const cursoId = resolverCurso(cursoPorCodigo, dados.curso, linha, erros);
      if (coordenadorId !== null && cursoId !== null) {
        vinculos.push({ coordenadorId, cursoId });
      }
    }
    if (erros.length > 0) return falhou(erros);

    const count = await gravarVinculosCoordenador(tx, vinculos);
    return { gravado: true, importados: count, jaExistiam: vinculos.length - count };
  });
}
