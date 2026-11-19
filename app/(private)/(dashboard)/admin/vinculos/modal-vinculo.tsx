"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../../../../components/Modal";
import { BotaoPrimario } from "../../../../../components/BotaoPrimario";
import { BotaoSecundario } from "../../../../../components/BotaoSecundario";
import { MensagemErro } from "../../../../../components/MensagemErro";
import {
  AVISO_AVALIADOR,
  CamposVinculo,
  faltaPeriodo,
  paraNovoVinculo,
  valoresIniciais,
  type TipoVinculo,
} from "../../../../../components/CamposVinculo";
import { acaoVincular } from "./acoes";

type Opcao = { id: number; rotulo: string };

// Vincular docente ou coordenador, escolhendo a pessoa. Quem usa monta este
// componente só com o modal aberto, para o formulário abrir zerado.
export function ModalVinculo({
  tipo,
  onFechar,
  cursos,
  periodos,
  pessoas,
}: {
  tipo: TipoVinculo;
  onFechar: () => void;
  cursos: { id: number; codigo: string; nome: string }[];
  periodos: Opcao[];
  pessoas: Opcao[];
}) {
  const router = useRouter();
  const id = useId();
  const [valores, setValores] = useState(() => valoresIniciais(tipo, "", periodos));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar(evento: FormEvent) {
    evento.preventDefault();
    const vinculo = paraNovoVinculo(valores);
    if (!vinculo) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await acaoVincular(vinculo);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      onFechar();
      router.refresh();
    });
  }

  return (
    <Modal
      aberto
      eyebrow="ADMINISTRAÇÃO · VÍNCULOS"
      titulo={tipo === "docente" ? "Vincular docente a um curso" : "Vincular coordenador a um curso"}
      descricao={tipo === "coordenador" ? AVISO_AVALIADOR : undefined}
      onFechar={onFechar}
      rodape={
        <>
          <BotaoSecundario onClick={onFechar}>Cancelar</BotaoSecundario>
          <BotaoPrimario type="submit" form={`${id}-form`} disabled={pendente || faltaPeriodo(valores, periodos)}>
            {pendente ? "Salvando…" : "Vincular"}
          </BotaoPrimario>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={salvar} className="flex flex-col gap-4">
        {erro && <MensagemErro>{erro}</MensagemErro>}
        <CamposVinculo
          id={id}
          cursos={cursos}
          periodos={periodos}
          escolherTipo={false}
          pessoas={{ rotulo: tipo === "docente" ? "Docente" : "Coordenador", opcoes: pessoas }}
          valores={valores}
          onMudar={setValores}
        />
      </form>
    </Modal>
  );
}
