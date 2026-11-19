import type { ReactNode } from "react";

export const classeCampo =
  "min-h-11 rounded-lg border border-borda-campo bg-superficie px-3 text-[15px] text-tinta transition-colors hover:border-tinta-suave focus-visible:border-azul-interativo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azul-interativo";
// pr-9 (não px-3 herdado) — a seta nativa do <select> precisa de mais
// respiro da borda direita do que um input de texto.
export const classeCampoSelect =
  "min-h-11 rounded-lg border border-borda-campo bg-superficie pl-3 pr-9 text-[15px] text-tinta transition-colors hover:border-tinta-suave focus-visible:border-azul-interativo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azul-interativo";

// `dica` fica abaixo do campo, fora do rótulo; o campo aponta para ela com
// aria-describedby={dica.id}, para o leitor de tela ler junto.
export function Campo({
  rotulo,
  htmlFor,
  className,
  dica,
  children,
}: {
  rotulo: string;
  htmlFor: string;
  className?: string;
  dica?: { id: string; texto: ReactNode };
  children: ReactNode;
}) {
  const rotulado = (
    <label htmlFor={htmlFor} className={`flex flex-col gap-1.5 ${dica ? "" : (className ?? "")}`}>
      <span className="text-[13px] font-semibold text-tinta-suave">{rotulo}</span>
      {children}
    </label>
  );
  if (!dica) return rotulado;
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      {rotulado}
      <p id={dica.id} className="text-[13px] leading-relaxed text-tinta-suave">
        {dica.texto}
      </p>
    </div>
  );
}
