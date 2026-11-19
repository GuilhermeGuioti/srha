import type { ReactNode } from "react";
import { Pill } from "./Pill";

// Fecho de uma operação feita dentro de modal (importação, vínculos trazidos):
// selo com forma e rótulo, não só cor, e o resumo do que foi gravado.
export function AvisoConcluido({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <section role="status" className="flex flex-col gap-2">
      <div>
        <Pill cor="aprovado" forma="circulo">
          {rotulo}
        </Pill>
      </div>
      <p className="text-[15px] text-tinta">{children}</p>
    </section>
  );
}
