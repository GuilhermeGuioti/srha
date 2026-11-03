-- Proteções do login por senha (revisão de segurança de 2026-11-03):
-- tentativasSenha e senhaBloqueadaAte limitam chutes de senha por conta;
-- versaoSessao vai no token de sessão e, ao mudar (senha trocada ou
-- redefinida), invalida as sessões abertas antes disso.
ALTER TABLE "Usuario" ADD COLUMN     "senhaBloqueadaAte" TIMESTAMP(3),
ADD COLUMN     "tentativasSenha" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "versaoSessao" INTEGER NOT NULL DEFAULT 0;
