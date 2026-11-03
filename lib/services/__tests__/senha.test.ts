import { gastarTempoDeConferencia, gerarHashSenha, verificarSenha } from "../../auth/senha";

test("a senha certa confere com o hash gerado", async () => {
  const hash = await gerarHashSenha("correta-horse-42");

  expect(await verificarSenha("correta-horse-42", hash)).toBe(true);
});

test("senha errada não confere", async () => {
  const hash = await gerarHashSenha("correta-horse-42");

  expect(await verificarSenha("Correta-horse-42", hash)).toBe(false);
  expect(await verificarSenha("", hash)).toBe(false);
});

test("o hash guarda os parâmetros, não guarda a senha e muda a cada geração (sal aleatório)", async () => {
  const primeiro = await gerarHashSenha("mesma-senha-123");
  const segundo = await gerarHashSenha("mesma-senha-123");

  expect(primeiro).toMatch(/^scrypt\$16384\$8\$5\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  expect(primeiro).not.toContain("mesma-senha-123");
  expect(primeiro).not.toBe(segundo);
  expect(await verificarSenha("mesma-senha-123", segundo)).toBe(true);
});

test("o custo vem do próprio hash: hash gravado com outro custo continua conferindo", async () => {
  // Mesmo formato, custo menor — como ficaria uma senha antiga depois de o
  // custo padrão subir.
  const { scryptSync } = await import("node:crypto");
  const sal = Buffer.alloc(16, 7);
  const derivado = scryptSync("senha-antiga-1", sal, 64, { N: 2 ** 12, r: 8, p: 1 });
  const hash = `scrypt$4096$8$1$${sal.toString("hex")}$${derivado.toString("hex")}`;

  expect(await verificarSenha("senha-antiga-1", hash)).toBe(true);
  expect(await verificarSenha("senha-antiga-2", hash)).toBe(false);
});

test("acentos conferem qualquer que seja a forma Unicode em que chegam", async () => {
  const composta = "coração-açaí".normalize("NFC");
  const decomposta = "coração-açaí".normalize("NFD");
  expect(composta).not.toBe(decomposta);

  const hash = await gerarHashSenha(composta);

  expect(await verificarSenha(decomposta, hash)).toBe(true);
});

test("hash malformado ou de formato desconhecido não confere em vez de estourar", async () => {
  expect(await verificarSenha("qualquer", "sem-separador")).toBe(false);
  expect(await verificarSenha("qualquer", "abcd:ef01")).toBe(false);
  expect(await verificarSenha("qualquer", "bcrypt$1$2$3$aa$bb")).toBe(false);
});

test("a conferência fictícia não estoura e leva o tempo de uma de verdade", async () => {
  const hash = await gerarHashSenha("correta-horse-42");
  const inicioReal = performance.now();
  await verificarSenha("chute", hash);
  const real = performance.now() - inicioReal;

  await gastarTempoDeConferencia("aquece");
  const inicioFicticio = performance.now();
  await gastarTempoDeConferencia("chute");
  const ficticio = performance.now() - inicioFicticio;

  // Margem larga: o que importa é a mesma ordem de grandeza, não o milissegundo.
  expect(ficticio).toBeGreaterThan(real / 3);
});
