import { useState } from "react";
import ModalShell, { Alerta, BtnSecundario } from "./ModalShell";
import { api, BASE_URL } from "../../../lib/api";
import { fmtData, fmtTamanho } from "../../../lib/format";


interface Anexo {
  id: string;
  nomeOriginal?: string;
  url?: string;
  mimeType?: string;
  tamanho?: number;
  createdAt?: string;
}

interface Conta {
  id: string;
  descricao?: string;
  anexos?: unknown[];
}

type TipoConta = "pagar" | "receber";

interface AnexosModalProps {
  tipo: TipoConta;
  conta: Conta;
  podeEditar?: boolean;
  onFechar: () => void;
}

function iconeTipo(mime?: string): string {
  if (mime === "application/pdf") return "📄";
  if (mime?.startsWith("image/")) return "🖼";
  return "📎";
}

export default function AnexosModal({ tipo, conta, podeEditar, onFechar }: AnexosModalProps) {
  const ehPagar = tipo === "pagar";
  const [anexos, setAnexos] = useState<Anexo[]>((conta.anexos as Anexo[]) || []);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(file: File) {
    if (!file) return;
    setErro(""); setEnviando(true);
    try {
      const novo = ehPagar
        ? await api.anexarContaPagar(conta.id, file)
        : await api.anexarContaReceber(conta.id, file);
      setAnexos(prev => [...prev, novo as Anexo]);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(anexo: Anexo) {
    if (!confirm(`Excluir anexo "${anexo.nomeOriginal}"?`)) return;
    setErro("");
    try {
      if (ehPagar) await api.excluirAnexoContaPagar(conta.id, anexo.id);
      else await api.excluirAnexoContaReceber(conta.id, anexo.id);
      setAnexos(prev => prev.filter(a => a.id !== anexo.id));
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <ModalShell
      titulo="Anexos"
      subtitulo={conta.descricao}
      largura={560}
      bloquearEsc={enviando}
      onFechar={onFechar}
    >
      {podeEditar && (
        <label className={[
          "flex items-center justify-center gap-2 px-4 py-5 mb-4 rounded-[10px] border-2 border-dashed transition cursor-pointer",
          enviando
            ? "border-hairline-soft bg-white/[.015] text-fg-muted cursor-wait"
            : "border-iris/40 bg-iris/[.05] text-iris hover:bg-iris/[.08]",
        ].join(" ")}>
          <input type="file" accept="application/pdf,image/jpeg,image/png"
            disabled={enviando}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) enviar(f);
              e.target.value = "";
            }}
            className="hidden"
          />
          <span className="text-[13px] font-medium">
            {enviando ? "Enviando…" : "Selecionar arquivo (PDF, JPG, PNG até 5 MB)"}
          </span>
        </label>
      )}

      {erro && <Alerta>{erro}</Alerta>}

      <div className="bg-white/[.02] border border-hairline-soft rounded-[10px] overflow-hidden">
        {anexos.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-fg-muted text-[13px] font-medium">Nenhum anexo nesta conta.</div>
            {podeEditar && (
              <div className="text-fg-faint text-[12px] mt-1">Anexe PDF ou imagem para histórico.</div>
            )}
          </div>
        ) : anexos.map(a => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-hairline-soft last:border-b-0">
            <div className="text-[20px]">{iconeTipo(a.mimeType)}</div>
            <div className="flex-1 min-w-0">
              <a href={`${BASE_URL}${a.url}`} target="_blank" rel="noreferrer"
                className="block truncate text-[13px] text-fg-soft font-medium hover:text-iris">
                {a.nomeOriginal}
              </a>
              <div className="text-fg-faint text-[11px] mt-0.5 font-mono">
                {fmtTamanho(a.tamanho)} · {fmtData(a.createdAt)}
              </div>
            </div>
            <a href={`${BASE_URL}${a.url}`} target="_blank" rel="noreferrer"
              className="px-2.5 py-1 rounded-[6px] bg-iris/15 text-iris text-[11px] font-medium hover:bg-iris/25 transition">
              Abrir
            </a>
            {podeEditar && (
              <button type="button" onClick={() => excluir(a)}
                className="px-2.5 py-1 rounded-[6px] bg-coral/15 text-coral text-[11px] font-medium hover:bg-coral/25 transition">
                Excluir
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2.5 mt-5 pt-4 border-t border-hairline-soft">
        <BtnSecundario type="button" disabled={enviando} onClick={onFechar}>
          Fechar
        </BtnSecundario>
      </div>
    </ModalShell>
  );
}
