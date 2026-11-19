import { z } from "zod";

// Código do curso, compartilhado entre a tela, as Server Actions e as
// planilhas. Mesmo formato do CHECK da migration codigo_curso: o banco recusa
// o que escapar daqui.

export const TAMANHO_MAXIMO_CODIGO_CURSO = 20;

export const SchemaCodigoCurso = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9]([A-Z0-9-]{0,18}[A-Z0-9])$/,
    "Código do curso: de 2 a 20 letras sem acento, números ou hífen, sem hífen nas pontas.",
  );

// "ENF, PSI" ou "ENF PSI" na mesma célula da planilha. Código repetido na
// célula conta uma vez só; o inválido aparece pelo nome no erro, porque a
// célula pode ter vários.
export const SchemaListaCodigosCurso = z.string().transform((valor, contexto) => {
  const codigos = new Set<string>();
  for (const parte of valor.split(/[\s,]+/).filter((codigo) => codigo !== "")) {
    const lido = SchemaCodigoCurso.safeParse(parte);
    if (lido.success) {
      codigos.add(lido.data);
    } else {
      contexto.addIssue({ code: "custom", message: `Código de curso inválido: "${parte}".` });
    }
  }
  return [...codigos];
});
