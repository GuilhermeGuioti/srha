// Curso com o código na frente, nas telas da secretaria: é o código que ela
// usa nas planilhas.
export function NomeCurso({ codigo, nome }: { codigo: string; nome: string }) {
  return (
    <span>
      <span className="mr-2 font-mono text-[13px] font-medium text-tinta-suave">{codigo}</span>
      {nome}
    </span>
  );
}
