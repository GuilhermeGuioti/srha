import { prisma } from "../../db";
import {
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  definirSenhaProvisoria,
  trocarSenhaProvisoria,
  alterarSenha,
} from "../usuarios";
import { verificarSenha } from "../../auth/senha";
import { Perfil } from "../../../generated/prisma/client";

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

test("cria usuário sem perfil secretaria por padrão", async () => {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });

  const usuarios = await listarUsuarios();

  expect(usuarios).toHaveLength(1);
  expect(usuarios[0]).toMatchObject({ id, nome: "Helena" });
  expect(usuarios[0].perfis).toHaveLength(0);
});

test("marcar secretaria ao criar grava UsuarioPerfil(SECRETARIA)", async () => {
  await criarUsuario({ nome: "Paulo", email: "paulo@srha.dev", ativo: true, secretaria: true });

  const usuarios = await listarUsuarios();

  expect(usuarios[0].perfis.map((p) => p.perfil)).toEqual([Perfil.SECRETARIA]);
});

test("desmarcar secretaria ao atualizar remove o UsuarioPerfil", async () => {
  // Outra secretaria ativa: tirar o perfil da única é bloqueado (teste abaixo).
  await criarUsuario({ nome: "Ana", email: "ana@srha.dev", ativo: true, secretaria: true });
  const id = await criarUsuario({ nome: "Paulo", email: "paulo@srha.dev", ativo: true, secretaria: true });

  await atualizarUsuario(id, { nome: "Paulo", email: "paulo@srha.dev", ativo: true, secretaria: false });

  const paulo = (await listarUsuarios()).find((usuario) => usuario.id === id)!;
  expect(paulo.perfis).toHaveLength(0);
});

test("a última secretaria ativa não pode ser inativada nem perder o perfil", async () => {
  const id = await criarUsuario({ nome: "Paulo", email: "paulo@srha.dev", ativo: true, secretaria: true });

  await expect(
    atualizarUsuario(id, { nome: "Paulo", email: "paulo@srha.dev", ativo: false, secretaria: true }),
  ).rejects.toThrow("ao menos uma pessoa ativa na secretaria");
  await expect(
    atualizarUsuario(id, { nome: "Paulo", email: "paulo@srha.dev", ativo: true, secretaria: false }),
  ).rejects.toThrow("ao menos uma pessoa ativa na secretaria");

  // A transação desfaz tudo: continua ativo e com o perfil.
  const [paulo] = await listarUsuarios();
  expect(paulo.ativo).toBe(true);
  expect(paulo.perfis.map((perfil) => perfil.perfil)).toEqual([Perfil.SECRETARIA]);

  // Editar o resto da ficha continua livre.
  await atualizarUsuario(id, { nome: "Paulo Tavares", email: "paulo@srha.dev", ativo: true, secretaria: true });
  expect((await listarUsuarios())[0].nome).toBe("Paulo Tavares");
});

test("com outra secretaria ativa, uma pode ser inativada", async () => {
  await criarUsuario({ nome: "Ana", email: "ana@srha.dev", ativo: true, secretaria: true });
  const id = await criarUsuario({ nome: "Paulo", email: "paulo@srha.dev", ativo: true, secretaria: true });

  await atualizarUsuario(id, { nome: "Paulo", email: "paulo@srha.dev", ativo: false, secretaria: true });

  const paulo = (await listarUsuarios()).find((usuario) => usuario.id === id)!;
  expect(paulo.ativo).toBe(false);
});

test("duas secretarias inativadas ao mesmo tempo: a segunda é recusada", async () => {
  const ana = await criarUsuario({ nome: "Ana", email: "ana@srha.dev", ativo: true, secretaria: true });
  const paulo = await criarUsuario({ nome: "Paulo", email: "paulo@srha.dev", ativo: true, secretaria: true });

  // Cada transação, sozinha, ainda via a outra secretaria ativa.
  const resultados = await Promise.allSettled([
    atualizarUsuario(ana, { nome: "Ana", email: "ana@srha.dev", ativo: false, secretaria: true }),
    atualizarUsuario(paulo, { nome: "Paulo", email: "paulo@srha.dev", ativo: false, secretaria: true }),
  ]);

  expect(resultados.filter((resultado) => resultado.status === "fulfilled")).toHaveLength(1);
  expect((await listarUsuarios()).filter((usuario) => usuario.ativo)).toHaveLength(1);
});

test("marcar secretaria duas vezes não duplica o perfil", async () => {
  const id = await criarUsuario({ nome: "Paulo", email: "paulo@srha.dev", ativo: true, secretaria: false });

  await atualizarUsuario(id, { nome: "Paulo", email: "paulo@srha.dev", ativo: true, secretaria: true });
  await atualizarUsuario(id, { nome: "Paulo", email: "paulo@srha.dev", ativo: true, secretaria: true });

  const usuarios = await listarUsuarios();
  expect(usuarios[0].perfis).toHaveLength(1);
});

test("email duplicado é rejeitado", async () => {
  await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });

  await expect(
    criarUsuario({ nome: "Outra Helena", email: "helena@srha.dev", ativo: true, secretaria: false }),
  ).rejects.toThrow("Já existe um usuário com este e-mail.");
});

test("inativar usuário preserva o registro em vez de excluir", async () => {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });

  await atualizarUsuario(id, { nome: "Helena", email: "helena@srha.dev", ativo: false, secretaria: false });

  const usuarios = await listarUsuarios();
  expect(usuarios).toHaveLength(1);
  expect(usuarios[0].ativo).toBe(false);
});

async function lerUsuario(id: number) {
  return prisma.usuario.findUniqueOrThrow({ where: { id } });
}

test("senha definida pela secretaria é gravada com hash e fica provisória", async () => {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });

  await definirSenhaProvisoria(id, "provisoria-123", null);

  const helena = await lerUsuario(id);
  expect(helena.senhaProvisoria).toBe(true);
  expect(helena.senhaHash).not.toContain("provisoria-123");
  expect(await verificarSenha("provisoria-123", helena.senhaHash!)).toBe(true);
});

test("trocar a provisória grava a nova senha e libera o acesso", async () => {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });
  await definirSenhaProvisoria(id, "provisoria-123", null);

  await trocarSenhaProvisoria(id, "minha-senha-nova");

  const helena = await lerUsuario(id);
  expect(helena.senhaProvisoria).toBe(false);
  expect(await verificarSenha("minha-senha-nova", helena.senhaHash!)).toBe(true);
  expect(await verificarSenha("provisoria-123", helena.senhaHash!)).toBe(false);
});

test("a nova senha não pode repetir a provisória", async () => {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });
  await definirSenhaProvisoria(id, "provisoria-123", null);

  await expect(trocarSenhaProvisoria(id, "provisoria-123")).rejects.toThrow("diferente da provisória");
  expect((await lerUsuario(id)).senhaProvisoria).toBe(true);
});

test("sem senha provisória não há troca: senha nova só pela secretaria", async () => {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });

  // Quem entra só pela Microsoft não ganha senha por conta própria...
  await expect(trocarSenhaProvisoria(id, "minha-senha-nova")).rejects.toThrow("Não há senha provisória");

  // ...e quem já trocou a provisória não troca de novo sem ela.
  await definirSenhaProvisoria(id, "provisoria-123", null);
  await trocarSenhaProvisoria(id, "minha-senha-nova");
  await expect(trocarSenhaProvisoria(id, "outra-senha-nova")).rejects.toThrow("Não há senha provisória");
  expect((await lerUsuario(id)).senhaHash).toBeTruthy();
  expect(await verificarSenha("minha-senha-nova", (await lerUsuario(id)).senhaHash!)).toBe(true);
});

test("editar nome e e-mail não mexe na senha", async () => {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });
  await definirSenhaProvisoria(id, "provisoria-123", null);
  const antes = await lerUsuario(id);

  await atualizarUsuario(id, { nome: "Helena Lima", email: "helena.lima@srha.dev", ativo: true, secretaria: false });

  const depois = await lerUsuario(id);
  expect(depois.senhaHash).toBe(antes.senhaHash);
  expect(depois.senhaProvisoria).toBe(true);
});

async function criarComSenhaPropria(senha: string) {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });
  await definirSenhaProvisoria(id, "provisoria-123", null);
  await trocarSenhaProvisoria(id, senha);
  return id;
}

test("a pessoa altera a própria senha informando a atual", async () => {
  const id = await criarComSenhaPropria("minha-senha-1");

  await alterarSenha(id, "minha-senha-1", "minha-senha-2");

  const helena = await lerUsuario(id);
  expect(await verificarSenha("minha-senha-2", helena.senhaHash!)).toBe(true);
  expect(await verificarSenha("minha-senha-1", helena.senhaHash!)).toBe(false);
  expect(helena.senhaProvisoria).toBe(false);
});

test("alterar com a senha atual errada é recusado e não muda nada", async () => {
  const id = await criarComSenhaPropria("minha-senha-1");
  const antes = await lerUsuario(id);

  await expect(alterarSenha(id, "chute-errado", "minha-senha-2")).rejects.toThrow("senha atual está incorreta");
  expect((await lerUsuario(id)).senhaHash).toBe(antes.senhaHash);
});

test("a nova senha precisa ser diferente da atual", async () => {
  const id = await criarComSenhaPropria("minha-senha-1");

  await expect(alterarSenha(id, "minha-senha-1", "minha-senha-1")).rejects.toThrow("diferente da atual");
});

test("sem senha própria não há alteração: nem quem só entra pela Microsoft, nem com a provisória", async () => {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });
  await expect(alterarSenha(id, "", "minha-senha-2")).rejects.toThrow("Não há senha própria");

  // Com a provisória, o caminho é a troca obrigatória, não esta.
  await definirSenhaProvisoria(id, "provisoria-123", null);
  await expect(alterarSenha(id, "provisoria-123", "minha-senha-2")).rejects.toThrow("Não há senha própria");
  expect((await lerUsuario(id)).senhaProvisoria).toBe(true);
});

test("toda mudança de senha incrementa a versão da sessão", async () => {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });
  const versao = async () => (await lerUsuario(id)).versaoSessao;
  expect(await versao()).toBe(0);

  await definirSenhaProvisoria(id, "provisoria-123", null);
  expect(await versao()).toBe(1);
  await trocarSenhaProvisoria(id, "minha-senha-1");
  expect(await versao()).toBe(2);
  await alterarSenha(id, "minha-senha-1", "minha-senha-2");
  expect(await versao()).toBe(3);

  // Tentativa recusada não muda nada.
  await expect(alterarSenha(id, "chute-errado", "minha-senha-3")).rejects.toThrow();
  expect(await versao()).toBe(3);
});

test("a senha provisória da secretaria desbloqueia quem errou demais", async () => {
  const id = await criarComSenhaPropria("minha-senha-1");
  await prisma.usuario.update({
    where: { id },
    data: { tentativasSenha: 6, senhaBloqueadaAte: new Date(Date.now() + 15 * 60_000) },
  });

  await definirSenhaProvisoria(id, "provisoria-456", null);

  expect(await lerUsuario(id)).toMatchObject({ tentativasSenha: 0, senhaBloqueadaAte: null, senhaProvisoria: true });
});

test("errar a senha atual em /senha conta como tentativa de login", async () => {
  const id = await criarComSenhaPropria("minha-senha-1");

  await expect(alterarSenha(id, "chute-errado", "minha-senha-2")).rejects.toThrow("senha atual está incorreta");

  expect((await lerUsuario(id)).tentativasSenha).toBe(1);
});

test("cada senha provisória fica registrada com quem definiu, sem sobrescrever a anterior", async () => {
  const ana = await criarUsuario({ nome: "Ana", email: "ana@srha.dev", ativo: true, secretaria: true });
  const bia = await criarUsuario({ nome: "Bia", email: "bia@srha.dev", ativo: true, secretaria: true });
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });

  await definirSenhaProvisoria(id, "provisoria-123", ana);
  await definirSenhaProvisoria(id, "provisoria-456", bia);

  const helena = (await listarUsuarios()).find((usuario) => usuario.id === id)!;
  // Mais recente primeiro.
  expect(helena.senhasDefinidas.map((definicao) => definicao.definidaPor?.nome)).toEqual(["Bia", "Ana"]);
  expect(helena.senhasDefinidas[0].ocorridoEm.getTime()).toBeGreaterThanOrEqual(
    helena.senhasDefinidas[1].ocorridoEm.getTime(),
  );
});

test("a senha inicial do seed fica registrada sem pessoa por trás", async () => {
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: true });

  await definirSenhaProvisoria(id, "provisoria-123", null);

  const [definicao] = await prisma.definicaoSenha.findMany({ where: { usuarioId: id } });
  expect(definicao.definidaPorId).toBeNull();
});

test("o registro de senha definida não pode ser alterado nem apagado", async () => {
  const ana = await criarUsuario({ nome: "Ana", email: "ana@srha.dev", ativo: true, secretaria: true });
  const id = await criarUsuario({ nome: "Helena", email: "helena@srha.dev", ativo: true, secretaria: false });
  await definirSenhaProvisoria(id, "provisoria-123", ana);
  const [definicao] = await prisma.definicaoSenha.findMany({ where: { usuarioId: id } });

  await expect(
    prisma.definicaoSenha.update({ where: { id: definicao.id }, data: { definidaPorId: null } }),
  ).rejects.toThrow("imutável");
  await expect(prisma.definicaoSenha.delete({ where: { id: definicao.id } })).rejects.toThrow("imutável");
  expect(await prisma.definicaoSenha.count()).toBe(1);
});
