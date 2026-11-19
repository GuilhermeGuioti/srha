import { prisma } from "../../db";
import {
  importarUsuarios,
  importarCursos,
  importarVinculosDocente,
  importarVinculosCoordenador,
} from "../importacao";
import { MODELOS_IMPORTACAO, decodificarPlanilha, gerarModeloCsv, lerPlanilha } from "../../importacao";
import { Perfil } from "../../../generated/prisma/client";
import { MENSAGEM_ULTIMA_SECRETARIA } from "../usuarios";

async function limpar() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "VinculoCoordenadorCurso", "VinculoDocenteCurso", "PeriodoLetivo", "Curso", "UsuarioPerfil", "Usuario" RESTART IDENTITY CASCADE`,
  );
}

// Como o Excel em português salva: ";" e CRLF.
function planilha(...linhas: string[]): Uint8Array {
  return new TextEncoder().encode(linhas.join("\r\n"));
}

async function perfisDe(email: string) {
  const registros = await prisma.usuarioPerfil.findMany({ where: { usuario: { email } } });
  return registros.map((registro) => registro.perfil).sort();
}

async function obterAmbiente() {
  const [ana, bruno, inativo] = await Promise.all([
    prisma.usuario.create({ data: { nome: "Ana Gonçalves", email: "ana@srha.dev" } }),
    prisma.usuario.create({ data: { nome: "Bruno Lima", email: "bruno@srha.dev" } }),
    prisma.usuario.create({ data: { nome: "Inês Inativa", email: "ines@srha.dev", ativo: false } }),
  ]);
  const [computacao, software, extinto] = await Promise.all([
    prisma.curso.create({ data: { codigo: "CC", nome: "Ciência da Computação" } }),
    prisma.curso.create({ data: { codigo: "ES", nome: "Engenharia de Software" } }),
    prisma.curso.create({ data: { codigo: "EXT", nome: "Curso Extinto", ativo: false } }),
  ]);
  const periodo = await prisma.periodoLetivo.create({
    data: {
      ano: 2026,
      semestre: 2,
      aberturaSubmissao: new Date("2026-08-01T00:00:00Z"),
      encerramentoSubmissao: new Date("2026-12-15T23:59:59Z"),
    },
  });
  return { ana, bruno, inativo, computacao, software, extinto, periodo };
}

beforeEach(async () => {
  await limpar();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("leitura da planilha", () => {
  test("o modelo gerado é lido de volta, com BOM e linhas em branco do Excel no meio", () => {
    const modelo = MODELOS_IMPORTACAO.vinculosDocente;
    const texto = `${gerarModeloCsv(modelo)}ana@srha.dev;CC;2026;2\r\n;;;\r\nbruno@srha.dev;ES;2026;2\r\n`;

    const { linhas, erros } = lerPlanilha(texto, modelo);

    expect(erros).toEqual([]);
    expect(linhas).toEqual([
      { linha: 2, valores: { email: "ana@srha.dev", curso: "CC", ano: "2026", semestre: "2" } },
      { linha: 4, valores: { email: "bruno@srha.dev", curso: "ES", ano: "2026", semestre: "2" } },
    ]);
  });

  test("aceita vírgula como separador e cabeçalho sem acento, hífen ou caixa igual", () => {
    const { linhas, presentes } = lerPlanilha("NOME,email\nAna,ana@srha.dev", MODELOS_IMPORTACAO.usuarios);
    expect(linhas[0].valores).toEqual({
      nome: "Ana",
      email: "ana@srha.dev",
      secretaria: "",
      cursosDocente: "",
      ano: "",
      semestre: "",
      cursosCoordenador: "",
    });
    // Coluna opcional ausente chega vazia, mas fica de fora de `presentes`.
    expect([...presentes].sort()).toEqual(["email", "nome"]);

    const comAcento = { nomeArquivo: "modelo.csv", colunas: [{ chave: "descricao", rotulo: "Descrição", obrigatoria: true, exemplo: "" }] };
    const { linhas: semAcento } = lerPlanilha("Descricao\nOrientação", comAcento);
    expect(semAcento[0].valores).toEqual({ descricao: "Orientação" });
  });

  test("planilha de uma coluna não parte o nome na vírgula", () => {
    const umaColuna = { nomeArquivo: "modelo.csv", colunas: [{ chave: "nome", rotulo: "Nome", obrigatoria: true, exemplo: "" }] };
    const { linhas } = lerPlanilha("Nome\r\nAdministração, Gestão e Negócios", umaColuna);
    expect(linhas[0].valores.nome).toBe("Administração, Gestão e Negócios");
  });

  test("coluna obrigatória ausente no cabeçalho recusa a planilha inteira", () => {
    expect(() => lerPlanilha("Nome\nAna", MODELOS_IMPORTACAO.usuarios)).toThrow(/Coluna ausente.*E-mail/);
  });

  test("planilha só com cabeçalho é recusada", () => {
    expect(() => lerPlanilha("Nome;E-mail\r\n;\r\n", MODELOS_IMPORTACAO.usuarios)).toThrow(/nenhuma linha/);
  });

  test("CSV salvo pelo Excel em Windows-1252 mantém os acentos", () => {
    // "Conceição" em Windows-1252: ç = 0xE7, ã = 0xE3.
    const bytes = new Uint8Array([0x43, 0x6f, 0x6e, 0x63, 0x65, 0x69, 0xe7, 0xe3, 0x6f]);
    expect(decodificarPlanilha(bytes)).toBe("Conceição");
  });
});

describe("importarUsuarios", () => {
  const SEM_VINCULO = { atualizados: 0, vinculos: 0 };

  test("cria os usuários com e-mail em minúsculas e perfil de secretaria quando marcado", async () => {
    const resultado = await importarUsuarios(
      planilha("Nome;E-mail;Secretaria", "Ana Gonçalves;Ana@SRHA.dev;", "Sílvia Secretaria;silvia@srha.dev;Sim"),
    );

    expect(resultado).toEqual({ gravado: true, importados: 2, jaExistiam: 0, ...SEM_VINCULO });
    expect(await perfisDe("ana@srha.dev")).toEqual([]);
    expect(await perfisDe("silvia@srha.dev")).toEqual([Perfil.SECRETARIA]);
  });

  test("e-mail já cadastrado tem o nome e a secretaria atualizados pela planilha", async () => {
    await prisma.usuario.create({ data: { nome: "Ana Original", email: "ana@srha.dev", ativo: false } });

    const resultado = await importarUsuarios(
      planilha("Nome;E-mail;Secretaria", "Ana Nova;ana@srha.dev;Sim", "Bruno Lima;bruno@srha.dev;Não"),
    );

    expect(resultado).toEqual({ gravado: true, importados: 1, atualizados: 1, jaExistiam: 0, vinculos: 0 });
    const ana = await prisma.usuario.findUniqueOrThrow({ where: { email: "ana@srha.dev" } });
    // Ativo não está na planilha: continua como estava.
    expect(ana).toMatchObject({ nome: "Ana Nova", ativo: false });
    expect(await perfisDe("ana@srha.dev")).toEqual([Perfil.SECRETARIA]);
  });

  test("sem a coluna Secretaria, quem já existe continua com o perfil que tinha", async () => {
    const silvia = await prisma.usuario.create({ data: { nome: "Sílvia", email: "silvia@srha.dev" } });
    await prisma.usuarioPerfil.create({ data: { usuarioId: silvia.id, perfil: Perfil.SECRETARIA } });

    const resultado = await importarUsuarios(planilha("Nome;E-mail", "Sílvia Souza;silvia@srha.dev"));

    expect(resultado).toEqual({ gravado: true, importados: 0, atualizados: 1, jaExistiam: 0, vinculos: 0 });
    expect(await perfisDe("silvia@srha.dev")).toEqual([Perfil.SECRETARIA]);
  });

  test("Secretaria vazia tira o perfil, mas a planilha não deixa o sistema sem secretaria ativa", async () => {
    const [silvia, paula] = await Promise.all([
      prisma.usuario.create({ data: { nome: "Sílvia", email: "silvia@srha.dev" } }),
      prisma.usuario.create({ data: { nome: "Paula", email: "paula@srha.dev" } }),
    ]);
    await prisma.usuarioPerfil.createMany({
      data: [silvia, paula].map((usuario) => ({ usuarioId: usuario.id, perfil: Perfil.SECRETARIA })),
    });

    // Tirar as duas: recusa, e nada muda.
    const recusada = await importarUsuarios(
      planilha("Nome;E-mail;Secretaria", "Sílvia;silvia@srha.dev;", "Paula;paula@srha.dev;Não", "Novo;novo@srha.dev;"),
    );
    expect(recusada).toEqual({
      gravado: false,
      erros: [
        { linha: 2, erro: MENSAGEM_ULTIMA_SECRETARIA },
        { linha: 3, erro: MENSAGEM_ULTIMA_SECRETARIA },
      ],
    });
    expect(await perfisDe("silvia@srha.dev")).toEqual([Perfil.SECRETARIA]);
    expect(await prisma.usuario.count()).toBe(2);

    // Tirar uma só: a outra continua.
    const aceita = await importarUsuarios(planilha("Nome;E-mail;Secretaria", "Sílvia;silvia@srha.dev;"));
    expect(aceita).toEqual({ gravado: true, importados: 0, atualizados: 1, jaExistiam: 0, vinculos: 0 });
    expect(await perfisDe("silvia@srha.dev")).toEqual([]);
    expect(await perfisDe("paula@srha.dev")).toEqual([Perfil.SECRETARIA]);
  });

  test("cursos como docente e como coordenador vinculam pelo código e dão os perfis", async () => {
    const { ana, computacao, software, periodo } = await obterAmbiente();

    const resultado = await importarUsuarios(
      planilha(
        "Nome;E-mail;Cursos como docente;Ano;Semestre;Cursos como coordenador",
        "Carla Souza;carla@srha.dev;cc, es ES;2026;2;es",
        "Ana Gonçalves;ana@srha.dev;CC;2026;2;",
      ),
    );

    // Ana não mudou de nome: não conta como atualizada, mas ganha o vínculo.
    expect(resultado).toEqual({ gravado: true, importados: 1, atualizados: 0, jaExistiam: 1, vinculos: 4 });
    const carla = await prisma.usuario.findUniqueOrThrow({ where: { email: "carla@srha.dev" } });
    const docencia = await prisma.vinculoDocenteCurso.findMany({ orderBy: { id: "asc" } });
    expect(docencia).toMatchObject([
      { docenteId: carla.id, cursoId: computacao.id, periodoLetivoId: periodo.id },
      { docenteId: carla.id, cursoId: software.id, periodoLetivoId: periodo.id },
      { docenteId: ana.id, cursoId: computacao.id, periodoLetivoId: periodo.id },
    ]);
    expect(await prisma.vinculoCoordenadorCurso.findMany()).toMatchObject([
      { coordenadorId: carla.id, cursoId: software.id },
    ]);
    expect(await perfisDe("carla@srha.dev")).toEqual([Perfil.COORDENADOR, Perfil.DOCENTE]);
    expect(await perfisDe("ana@srha.dev")).toEqual([Perfil.DOCENTE]);

    // De novo: nada muda, e o vínculo que já existe não é duplicado nem removido.
    const reimportada = await importarUsuarios(
      planilha("Nome;E-mail;Cursos como docente;Ano;Semestre", "Carla Souza;carla@srha.dev;CC;2026;2"),
    );
    expect(reimportada).toEqual({ gravado: true, importados: 0, atualizados: 0, jaExistiam: 1, vinculos: 0 });
    expect(await prisma.vinculoDocenteCurso.count()).toBe(3);
  });

  test("curso, período ou usuário que não servem para vincular: nada é gravado", async () => {
    await obterAmbiente();

    const resultado = await importarUsuarios(
      planilha(
        "Nome;E-mail;Cursos como docente;Ano;Semestre;Cursos como coordenador",
        "Carla;carla@srha.dev;CC;;;",
        "Davi;davi@srha.dev;MED;2026;2;",
        "Elis;elis@srha.dev;;;;EXT",
        "Fábio;fabio@srha.dev;CC;2027;1;",
        "Inês Inativa;ines@srha.dev;;;;CC",
        "Gil;gil@srha.dev;C;2026;2;",
        "Hugo;hugo@srha.dev;CC;26;2;",
      ),
    );

    expect(resultado).toEqual({
      gravado: false,
      erros: [
        { linha: 2, erro: "Informe Ano e Semestre para os cursos como docente." },
        { linha: 7, erro: 'Código de curso inválido: "C".' },
        { linha: 8, erro: "Ano inválido — use quatro dígitos, como 2026." },
      ],
    });

    // Corrigido o formato, os erros que dependem do cadastro aparecem.
    const corrigida = await importarUsuarios(
      planilha(
        "Nome;E-mail;Cursos como docente;Ano;Semestre;Cursos como coordenador",
        "Davi;davi@srha.dev;MED;2026;2;",
        "Elis;elis@srha.dev;;;;EXT",
        "Fábio;fabio@srha.dev;CC;2027;1;",
        "Inês Inativa;ines@srha.dev;;;;CC",
      ),
    );
    expect(corrigida).toEqual({
      gravado: false,
      erros: [
        { linha: 2, erro: "Nenhum curso cadastrado com o código MED." },
        { linha: 3, erro: "O curso EXT está inativo." },
        { linha: 4, erro: "Período 2027/1 não cadastrado." },
        { linha: 5, erro: "O usuário ines@srha.dev está inativo e não pode ser vinculado a curso." },
      ],
    });
    expect(await prisma.usuario.count()).toBe(3);
    expect(await prisma.vinculoDocenteCurso.count()).toBe(0);
  });

  test("linha repetida que também tem outro erro mostra os dois de uma vez", async () => {
    const resultado = await importarUsuarios(
      planilha("Nome;E-mail;Secretaria", "Ana;ana@srha.dev;", "Outra Ana;ana@srha.dev;talvez"),
    );

    expect(resultado).toEqual({
      gravado: false,
      erros: [
        { linha: 3, erro: "E-mail repetido na planilha (já está na linha 2)." },
        { linha: 3, erro: "Secretaria: use Sim ou Não." },
      ],
    });
  });

  test("reimportar a mesma planilha não muda nada nem dá erro", async () => {
    const arquivo = planilha("Nome;E-mail", "Ana;ana@srha.dev", "Bruno;bruno@srha.dev");
    await importarUsuarios(arquivo);

    expect(await importarUsuarios(arquivo)).toEqual({ gravado: true, importados: 0, jaExistiam: 2, ...SEM_VINCULO });
    expect(await prisma.usuario.count()).toBe(2);
  });

  test("qualquer linha com erro: nada é gravado e cada erro aponta a linha do arquivo", async () => {
    const resultado = await importarUsuarios(
      planilha(
        "Nome;E-mail;Secretaria",
        "Ana;ana@srha.dev;",
        "Bruno;não-é-email;",
        "Carla;carla@srha.dev;talvez",
        ";dani@srha.dev;",
        "Ana de Novo;ANA@srha.dev;",
      ),
    );

    expect(resultado).toEqual({
      gravado: false,
      erros: [
        { linha: 3, erro: "E-mail inválido." },
        { linha: 4, erro: "Secretaria: use Sim ou Não." },
        { linha: 5, erro: "Não preenchido: Nome." },
        { linha: 6, erro: "E-mail repetido na planilha (já está na linha 2)." },
      ],
    });
    expect(await prisma.usuario.count()).toBe(0);
  });
});

describe("importarCursos", () => {
  test("código já cadastrado conta como já existente, em qualquer caixa e sem alterar o curso", async () => {
    await prisma.curso.create({ data: { codigo: "ECV", nome: "Engenharia Civil" } });

    const resultado = await importarCursos(planilha("Código;Nome", " ecv ;Engenharia Civil e Ambiental", "dir;Direito"));

    expect(resultado).toEqual({ gravado: true, importados: 1, jaExistiam: 1 });
    const cursos = await prisma.curso.findMany({ orderBy: { codigo: "asc" } });
    expect(cursos.map(({ codigo, nome }) => ({ codigo, nome }))).toEqual([
      { codigo: "DIR", nome: "Direito" },
      { codigo: "ECV", nome: "Engenharia Civil" },
    ]);
  });

  test("código inválido ou repetido na planilha: nada é gravado", async () => {
    const resultado = await importarCursos(
      planilha("Código;Nome", "DIR;Direito", "dir;Direito Penal", "D;Design", "ENF-;Enfermagem", "PSI;direito"),
    );

    const formato = "Código do curso: de 2 a 20 letras sem acento, números ou hífen, sem hífen nas pontas.";
    expect(resultado).toEqual({
      gravado: false,
      erros: [
        { linha: 3, erro: "Código repetido na planilha (já está na linha 2)." },
        { linha: 4, erro: formato },
        { linha: 5, erro: formato },
        { linha: 6, erro: "Curso repetido na planilha (já está na linha 2)." },
      ],
    });
    expect(await prisma.curso.count()).toBe(0);
  });

  test("código novo com o nome de um curso já cadastrado é recusado", async () => {
    await prisma.curso.create({ data: { codigo: "ECV", nome: "Engenharia Civil" } });

    const resultado = await importarCursos(planilha("Código;Nome", "CIV;engenharia  civil", "DIR;Direito"));

    expect(resultado).toEqual({
      gravado: false,
      erros: [{ linha: 2, erro: 'Já existe o curso "Engenharia Civil", com o código ECV.' }],
    });
    expect(await prisma.curso.count()).toBe(1);
  });
});

describe("importarVinculosDocente", () => {
  test("cria os vínculos e dá o perfil de docente", async () => {
    const { ana, computacao, software, periodo } = await obterAmbiente();

    const resultado = await importarVinculosDocente(
      planilha(
        "E-mail do docente;Código do curso;Ano;Semestre",
        "ana@srha.dev;CC;2026;2",
        "ANA@srha.dev; es ;2026;2",
      ),
    );

    expect(resultado).toEqual({ gravado: true, importados: 2, jaExistiam: 0 });
    const vinculos = await prisma.vinculoDocenteCurso.findMany({ orderBy: { id: "asc" } });
    expect(vinculos).toMatchObject([
      { docenteId: ana.id, cursoId: computacao.id, periodoLetivoId: periodo.id },
      { docenteId: ana.id, cursoId: software.id, periodoLetivoId: periodo.id },
    ]);
    expect(await perfisDe("ana@srha.dev")).toEqual([Perfil.DOCENTE]);
  });

  test("referência inexistente ou inativa: nada é gravado, nem as linhas boas", async () => {
    await obterAmbiente();

    const resultado = await importarVinculosDocente(
      planilha(
        "E-mail do docente;Código do curso;Ano;Semestre",
        "ana@srha.dev;CC;2026;2",
        "ninguem@srha.dev;CC;2026;2",
        "ines@srha.dev;CC;2026;2",
        "bruno@srha.dev;EXT;2026;2",
        "bruno@srha.dev;MED;2026;2",
        "bruno@srha.dev;CC;2027;1",
        "bruno@srha.dev;CC;2026;3",
      ),
    );

    expect(resultado).toEqual({
      gravado: false,
      erros: [
        { linha: 3, erro: "Nenhum usuário cadastrado com o e-mail ninguem@srha.dev." },
        { linha: 4, erro: "O usuário ines@srha.dev está inativo." },
        { linha: 5, erro: "O curso EXT está inativo." },
        { linha: 6, erro: "Nenhum curso cadastrado com o código MED." },
        { linha: 7, erro: "Período 2027/1 não cadastrado." },
        { linha: 8, erro: "Semestre deve ser 1 ou 2." },
      ],
    });
    expect(await prisma.vinculoDocenteCurso.count()).toBe(0);
    expect(await perfisDe("ana@srha.dev")).toEqual([]);
  });

  test("vínculo que já existe é pulado e contado", async () => {
    const { ana, computacao, periodo } = await obterAmbiente();
    await prisma.vinculoDocenteCurso.create({
      data: { docenteId: ana.id, cursoId: computacao.id, periodoLetivoId: periodo.id },
    });

    const resultado = await importarVinculosDocente(
      planilha(
        "E-mail do docente;Código do curso;Ano;Semestre",
        "ana@srha.dev;CC;2026;2",
        "bruno@srha.dev;CC;2026;2",
      ),
    );

    expect(resultado).toEqual({ gravado: true, importados: 1, jaExistiam: 1 });
    expect(await prisma.vinculoDocenteCurso.count()).toBe(2);
  });

  test("planilha antiga, com o curso pelo nome, é recusada pelo cabeçalho", async () => {
    await obterAmbiente();

    await expect(
      importarVinculosDocente(planilha("E-mail do docente;Curso;Ano;Semestre", "ana@srha.dev;Ciência da Computação;2026;2")),
    ).rejects.toThrow("Coluna ausente no cabeçalho: Código do curso. Use o modelo.");
  });
});

describe("importarVinculosCoordenador", () => {
  test("grava na ordem da planilha, que decide quem avalia primeiro, e dá o perfil de coordenador", async () => {
    const { ana, bruno, computacao } = await obterAmbiente();

    const resultado = await importarVinculosCoordenador(
      planilha(
        "E-mail do coordenador;Código do curso",
        "bruno@srha.dev;CC",
        "ana@srha.dev;cc",
      ),
    );

    expect(resultado).toEqual({ gravado: true, importados: 2, jaExistiam: 0 });
    const vinculos = await prisma.vinculoCoordenadorCurso.findMany({
      where: { cursoId: computacao.id },
      orderBy: { id: "asc" },
    });
    expect(vinculos.map((vinculo) => vinculo.coordenadorId)).toEqual([bruno.id, ana.id]);
    expect(await perfisDe("bruno@srha.dev")).toEqual([Perfil.COORDENADOR]);
  });

  test("perfil que o usuário já tinha não é duplicado", async () => {
    const { ana } = await obterAmbiente();
    await prisma.usuarioPerfil.create({ data: { usuarioId: ana.id, perfil: Perfil.COORDENADOR } });

    await importarVinculosCoordenador(planilha("E-mail do coordenador;Código do curso", "ana@srha.dev;ES"));

    expect(await perfisDe("ana@srha.dev")).toEqual([Perfil.COORDENADOR]);
  });
});
