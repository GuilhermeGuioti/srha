-- Rastro das senhas provisórias (decisão de 2026-11-03): quem definiu a senha
-- de quem, e quando. Sem isso, a secretaria podia definir a senha de outra
-- pessoa, entrar como ela e agir em nome dela sem deixar marca nenhuma.

-- CreateTable
CREATE TABLE "DefinicaoSenha" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "definidaPorId" INTEGER,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefinicaoSenha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DefinicaoSenha_usuarioId_ocorridoEm_idx" ON "DefinicaoSenha"("usuarioId", "ocorridoEm");

-- AddForeignKey
ALTER TABLE "DefinicaoSenha" ADD CONSTRAINT "DefinicaoSenha_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefinicaoSenha" ADD CONSTRAINT "DefinicaoSenha_definidaPorId_fkey" FOREIGN KEY ("definidaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Só INSERT, como o EventoAuditoria: um rastro que se apaga não é rastro.
-- TRUNCATE não dispara trigger de linha — a limpeza dos testes continua.
CREATE FUNCTION "srha_recusar_alteracao_definicao_senha"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registro de senha definida é imutável.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DefinicaoSenha_imutavel"
BEFORE UPDATE OR DELETE ON "DefinicaoSenha"
FOR EACH ROW EXECUTE FUNCTION "srha_recusar_alteracao_definicao_senha"();
