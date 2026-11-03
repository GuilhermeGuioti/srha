import { prisma } from "../../db";
import {
  buscarUsuarioPelaSenha,
  buscarUsuarioPeloEntra,
  buscarUsuarioPeloPerfilEntra,
  LIMITE_TENTATIVAS_SENHA,
} from "../../auth/login";
import { gerarHashSenha } from "../../auth/senha";

async function limpar() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "VinculoCoordenadorCurso", "VinculoDocenteCurso", "UsuarioPerfil", "Usuario" RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  await limpar();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Entra ID", () => {
  test("acha pelo oid já gravado, mesmo com o e-mail mudado", async () => {
    const helena = await prisma.usuario.create({
      data: { nome: "Helena", email: "helena.souza@baraodemaua.br", entraOid: "oid-helena" },
    });

    const achado = await buscarUsuarioPeloEntra("oid-helena", "helena.lima@baraodemaua.br");

    expect(achado?.id).toBe(helena.id);
  });

  test("no primeiro login acha pelo e-mail e grava o oid", async () => {
    const helena = await prisma.usuario.create({ data: { nome: "Helena", email: "helena@baraodemaua.br" } });

    const achado = await buscarUsuarioPeloEntra("oid-helena", "helena@baraodemaua.br");

    expect(achado?.id).toBe(helena.id);
    const gravado = await prisma.usuario.findUniqueOrThrow({ where: { id: helena.id } });
    expect(gravado.entraOid).toBe("oid-helena");
  });

  test("o e-mail vindo da Microsoft é comparado sem diferenciar caixa", async () => {
    const helena = await prisma.usuario.create({ data: { nome: "Helena", email: "helena@baraodemaua.br" } });

    const achado = await buscarUsuarioPeloEntra("oid-helena", "Helena@BaraoDeMaua.br");

    expect(achado?.id).toBe(helena.id);
  });

  test("e-mail já ligado a outra conta Microsoft é negado e não troca o oid", async () => {
    const helena = await prisma.usuario.create({
      data: { nome: "Helena", email: "helena@baraodemaua.br", entraOid: "oid-helena" },
    });

    expect(await buscarUsuarioPeloEntra("oid-outra-pessoa", "helena@baraodemaua.br")).toBeNull();
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: helena.id } })).entraOid).toBe("oid-helena");
  });

  test("token de outro tenant é negado mesmo com e-mail cadastrado", async () => {
    const helena = await prisma.usuario.create({ data: { nome: "Helena", email: "helena@baraodemaua.br" } });
    const perfil = { oid: "oid-helena", email: "helena@baraodemaua.br" };

    expect(await buscarUsuarioPeloPerfilEntra({ ...perfil, tid: "tenant-de-fora" }, "tenant-barao")).toBeNull();
    expect(await buscarUsuarioPeloPerfilEntra(perfil, "tenant-barao")).toBeNull();
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: helena.id } })).entraOid).toBeNull();

    const achado = await buscarUsuarioPeloPerfilEntra({ ...perfil, tid: "TENANT-BARAO" }, "tenant-barao");
    expect(achado?.id).toBe(helena.id);
  });

  test("sem claim email, usa o preferred_username", async () => {
    const helena = await prisma.usuario.create({ data: { nome: "Helena", email: "helena@baraodemaua.br" } });

    const achado = await buscarUsuarioPeloPerfilEntra(
      { tid: "tenant-barao", oid: "oid-helena", preferred_username: "Helena@baraodemaua.br" },
      "tenant-barao",
    );

    expect(achado?.id).toBe(helena.id);
  });

  test("conta que não está cadastrada é negada, sem criar usuário", async () => {
    const achado = await buscarUsuarioPeloEntra("oid-aluno", "aluno@baraodemaua.br");

    expect(achado).toBeNull();
    expect(await prisma.usuario.count()).toBe(0);
  });
});

describe("e-mail e senha", () => {
  async function criarComSenha(dados: { email: string; senha: string; ativo?: boolean }) {
    return prisma.usuario.create({
      data: {
        nome: "Paulo",
        email: dados.email,
        ativo: dados.ativo ?? true,
        senhaHash: await gerarHashSenha(dados.senha),
      },
    });
  }

  test("entra com a senha certa, sem diferenciar caixa no e-mail", async () => {
    const paulo = await criarComSenha({ email: "paulo@baraodemaua.br", senha: "senha-certa-1" });

    const achado = await buscarUsuarioPelaSenha(" Paulo@BaraoDeMaua.br ", "senha-certa-1");

    expect(achado?.id).toBe(paulo.id);
  });

  test("senha errada é negada", async () => {
    await criarComSenha({ email: "paulo@baraodemaua.br", senha: "senha-certa-1" });

    expect(await buscarUsuarioPelaSenha("paulo@baraodemaua.br", "senha-errada")).toBeNull();
  });

  test("usuário sem senha definida é negado", async () => {
    await prisma.usuario.create({ data: { nome: "Helena", email: "helena@baraodemaua.br" } });

    expect(await buscarUsuarioPelaSenha("helena@baraodemaua.br", "qualquer-coisa")).toBeNull();
  });

  test("usuário inativado é negado mesmo com a senha certa", async () => {
    await criarComSenha({ email: "paulo@baraodemaua.br", senha: "senha-certa-1", ativo: false });

    expect(await buscarUsuarioPelaSenha("paulo@baraodemaua.br", "senha-certa-1")).toBeNull();
  });

  test("e-mail que não está cadastrado é negado", async () => {
    expect(await buscarUsuarioPelaSenha("ninguem@baraodemaua.br", "senha-certa-1")).toBeNull();
  });

  async function errar(vezes: number) {
    for (let i = 0; i < vezes; i++) {
      expect(await buscarUsuarioPelaSenha("paulo@baraodemaua.br", `chute-${i}`)).toBeNull();
    }
  }

  test(`depois de ${LIMITE_TENTATIVAS_SENHA} erros, nem a senha certa entra até o bloqueio vencer`, async () => {
    const paulo = await criarComSenha({ email: "paulo@baraodemaua.br", senha: "senha-certa-1" });

    await errar(LIMITE_TENTATIVAS_SENHA);
    expect(await buscarUsuarioPelaSenha("paulo@baraodemaua.br", "senha-certa-1")).toBeNull();
    const bloqueado = await prisma.usuario.findUniqueOrThrow({ where: { id: paulo.id } });
    expect(bloqueado.senhaBloqueadaAte!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);

    // Bloqueio vencido: a contagem recomeça e a senha certa volta a entrar.
    await prisma.usuario.update({ where: { id: paulo.id }, data: { senhaBloqueadaAte: new Date(Date.now() - 1000) } });
    expect((await buscarUsuarioPelaSenha("paulo@baraodemaua.br", "senha-certa-1"))?.id).toBe(paulo.id);
    const liberado = await prisma.usuario.findUniqueOrThrow({ where: { id: paulo.id } });
    expect(liberado).toMatchObject({ tentativasSenha: 0, senhaBloqueadaAte: null });
  });

  test("acertar antes do limite zera a contagem", async () => {
    const paulo = await criarComSenha({ email: "paulo@baraodemaua.br", senha: "senha-certa-1" });

    await errar(LIMITE_TENTATIVAS_SENHA - 1);
    expect((await buscarUsuarioPelaSenha("paulo@baraodemaua.br", "senha-certa-1"))?.id).toBe(paulo.id);
    await errar(LIMITE_TENTATIVAS_SENHA - 1);

    expect((await buscarUsuarioPelaSenha("paulo@baraodemaua.br", "senha-certa-1"))?.id).toBe(paulo.id);
  });

  test("rajada de tentativas em paralelo não confere mais senhas que o limite", async () => {
    const paulo = await criarComSenha({ email: "paulo@baraodemaua.br", senha: "senha-certa-1" });

    // Se a reserva não fosse atômica, as vinte leriam a conta antes de qualquer
    // uma gravar o erro, e todas seriam conferidas. Atômica, só as cinco
    // primeiras reservam para conferir; a sexta grava o bloqueio, e as demais
    // nem chegam a reservar.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => buscarUsuarioPelaSenha("paulo@baraodemaua.br", `chute-${i}`)),
    );

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: paulo.id } });
    expect(depois.tentativasSenha).toBe(LIMITE_TENTATIVAS_SENHA + 1);
    expect(depois.senhaBloqueadaAte).not.toBeNull();
    expect(await buscarUsuarioPelaSenha("paulo@baraodemaua.br", "senha-certa-1")).toBeNull();
  });

  test("senha acima do tamanho máximo é recusada sem conferir", async () => {
    await criarComSenha({ email: "paulo@baraodemaua.br", senha: "senha-certa-1" });

    expect(await buscarUsuarioPelaSenha("paulo@baraodemaua.br", "x".repeat(10_000))).toBeNull();
    expect((await prisma.usuario.findUniqueOrThrow({ where: { email: "paulo@baraodemaua.br" } })).tentativasSenha).toBe(0);
  });
});
