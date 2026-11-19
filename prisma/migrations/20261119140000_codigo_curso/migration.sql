-- Código do curso: o identificador que a secretaria informa (ex.: ENF), usado
-- nas planilhas no lugar do nome, que dá margem a erro de digitação.

-- AlterTable
ALTER TABLE "Curso" ADD COLUMN "codigo" TEXT;

-- Cursos já cadastrados ganham um código provisório, para a secretaria trocar.
UPDATE "Curso" SET "codigo" = 'C' || lpad("id"::text, 3, '0');

ALTER TABLE "Curso" ALTER COLUMN "codigo" SET NOT NULL;

-- Sempre em maiúsculas, letras sem acento, números e hífen, de 2 a 20
-- caracteres, começando e terminando em letra ou número. Com isso o índice
-- único abaixo também barra "enf" ao lado de "ENF". A aplicação valida o
-- mesmo formato (lib/curso.ts); aqui é a garantia de qualquer caminho.
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_codigo_formato"
  CHECK ("codigo" ~ '^[A-Z0-9]([A-Z0-9-]{0,18}[A-Z0-9])$');

-- CreateIndex
CREATE UNIQUE INDEX "Curso_codigo_key" ON "Curso"("codigo");
