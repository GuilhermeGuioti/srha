-- Login por e-mail e senha, ao lado do Entra ID (decisão do cliente de
-- 2026-11-03; ver CLAUDE.md, regra 3). Só a secretaria define a senha, e ela
-- nasce provisória: a pessoa troca no primeiro acesso. Guarda só o hash.
ALTER TABLE "Usuario" ADD COLUMN     "senhaHash" TEXT,
ADD COLUMN     "senhaProvisoria" BOOLEAN NOT NULL DEFAULT false;
