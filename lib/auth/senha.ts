import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// N=2^14, r=8, p=5: uma das configurações equivalentes ao mínimo da OWASP para
// scrypt, a que usa menos memória (16 MB por hash) — cabe com folga na função
// da Vercel. Os parâmetros vão gravados no próprio hash, então dá para subir o
// custo depois sem invalidar as senhas que já existem.
const CUSTO = { N: 2 ** 14, r: 8, p: 5 };
const BYTES_SAL = 16;
const BYTES_HASH = 64;
const PREFIXO = "scrypt";

function derivar(senha: string, sal: Buffer, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    // NFC: "ç" e "ã" podem chegar codificados de dois jeitos conforme teclado
    // e sistema; sem normalizar, a senha certa seria recusada.
    scrypt(senha.normalize("NFC"), sal, BYTES_HASH, opcoes, (erro, chave) => (erro ? rejeitar(erro) : resolver(chave)));
  });
}

// Formato: scrypt$N$r$p$sal$hash, sal e hash em hex. O sal é aleatório por
// senha, então duas pessoas com a mesma senha não ficam com o mesmo hash.
export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(BYTES_SAL);
  const derivado = await derivar(senha, sal, CUSTO);
  return [PREFIXO, CUSTO.N, CUSTO.r, CUSTO.p, sal.toString("hex"), derivado.toString("hex")].join("$");
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  const [prefixo, N, r, p, salHex, derivadoHex] = hash.split("$");
  if (prefixo !== PREFIXO || !salHex || !derivadoHex) return false;
  const esperado = Buffer.from(derivadoHex, "hex");
  const calculado = await derivar(senha, Buffer.from(salHex, "hex"), { N: Number(N), r: Number(r), p: Number(p) });
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
}

let hashFicticio: Promise<string> | undefined;

// Gasta o mesmo tempo de uma conferência de verdade quando não há senha para
// conferir (e-mail inexistente, conta sem senha, bloqueada). Sem isso, a
// resposta rápida denunciaria quais e-mails têm senha cadastrada.
export async function gastarTempoDeConferencia(senha: string): Promise<void> {
  hashFicticio ??= gerarHashSenha("senha-ficticia-para-igualar-o-tempo");
  await verificarSenha(senha, await hashFicticio);
}
