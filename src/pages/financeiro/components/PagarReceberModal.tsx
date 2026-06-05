import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import ModalShell, {
  Alerta, BtnPrimario, BtnSecundario, Campo, Input, Select,
} from "./ModalShell";
import { api } from "../../../lib/api";
import { fmtBRL, fmtData } from "../../../lib/format";


const GerenciarFormasModal = lazy(() =>
  import("../../../Financeiro").then(m => ({ default: m.GerenciarFormasModal }))
);

interface Conta {
  id: string;
  descricao?: string;
  vencimento?: string;
  valor?: number | string;
  valorBruto?: number | string;
  juros?: number | string;
  multa?: number | string;
  desconto?: number | string;
}

interface FormaCustom {
  id: string;
  nome: string;
  icone?: string;
  baseFormaPagamento: string;
}

interface Caixa {
  id: string;
  numero?: number | string;
  user?: { nome?: string } | null;
}

type TipoConta = "pagar" | "receber";

interface PagarReceberModalProps {
  tipo: TipoConta;
  conta: Conta;
  podeEditar?: boolean;
  onCancelar: () => void;
  onConfirmar: (payload: Record<string, unknown>) => void | Promise<void>;
}

const FORMAS_PAGAMENTO = [
  { id: "DINHEIRO",       label: "💵 Dinheiro" },
  { id: "PIX",            label: "⚡ PIX" },
  { id: "CARTAO_DEBITO",  label: "💳 Débito" },
  { id: "CARTAO_CREDITO", label: "💳 Crédito" },
  { id: "BOLETO",         label: "🧾 Boleto" },
  { id: "CREDIARIO",      label: "📒 Crediário" },
];

function hojeLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}
function parseNum(v: string): number {
  return parseFloat(v.replace(",", ".")) || 0;
}

export default function PagarReceberModal({
  tipo, conta, podeEditar, onCancelar, onConfirmar,
}: PagarReceberModalProps) {
  const ehPagar = tipo === "pagar";
  const [data, setData] = useState(hojeLocal());
  const [ajustar, setAjustar] = useState(false);
  const [juros, setJuros] = useState(conta.juros ? String(conta.juros) : "");
  const [multa, setMulta] = useState(conta.multa ? String(conta.multa) : "");
  const [desconto, setDesconto] = useState(conta.desconto ? String(conta.desconto) : "");
  const [formaSel, setFormaSel] = useState("default:DINHEIRO");
  const [formasCustom, setFormasCustom] = useState<FormaCustom[]>([]);
  const [gerenciarAberto, setGerenciarAberto] = useState(false);
  const [caixaId, setCaixaId] = useState("");
  const [caixasAbertos, setCaixasAbertos] = useState<Caixa[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarCaixas({ status: "ABERTO" })
      .then((lista: unknown) => {
        const arr = Array.isArray(lista) ? lista : ((lista as { caixas?: Caixa[] })?.caixas || []);
        setCaixasAbertos(arr as Caixa[]);
      })
      .catch(() => setCaixasAbertos([]));
  }, []);

  const recarregarFormas = useCallback(() => {
    return api.listarFormasPagamento({ ativo: "true" })
      .then((lista: unknown) => setFormasCustom(Array.isArray(lista) ? (lista as FormaCustom[]) : []))
      .catch(() => setFormasCustom([]));
  }, []);

  useEffect(() => { recarregarFormas(); }, [recarregarFormas]);

  const formaPagamentoEnum = useMemo(() => {
    if (formaSel.startsWith("default:")) return formaSel.slice("default:".length);
    if (formaSel.startsWith("custom:")) {
      const id = formaSel.slice("custom:".length);
      return formasCustom.find(x => x.id === id)?.baseFormaPagamento || "DINHEIRO";
    }
    return "DINHEIRO";
  }, [formaSel, formasCustom]);

  const valorBrutoOriginal = Number(conta.valorBruto || conta.valor || 0);
  const liquido = useMemo(() => {
    if (!ajustar) return Number(conta.valor) || 0;
    return valorBrutoOriginal + parseNum(juros) + parseNum(multa) - parseNum(desconto);
  }, [ajustar, juros, multa, desconto, valorBrutoOriginal, conta.valor]);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!data) { setErro("Informe a data"); return; }
    if (ajustar && liquido <= 0) {
      setErro("Valor líquido (bruto + juros + multa − desconto) deve ser maior que zero");
      return;
    }
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = ehPagar
        ? { pagamento: data, formaPagamento: formaPagamentoEnum }
        : { recebimento: data, formaPagamento: formaPagamentoEnum };
      if (caixaId === "FORA") payload.caixaId = null;
      else if (caixaId) payload.caixaId = caixaId;
      if (ajustar) {
        payload.juros = parseNum(juros);
        payload.multa = parseNum(multa);
        payload.desconto = parseNum(desconto);
      }
      await onConfirmar(payload);
    } catch (err) {
      setErro((err as Error).message);
      setSalvando(false);
    }
  }

  return (
    <ModalShell
      titulo={ehPagar ? "Pagar conta" : "Receber conta"}
      subtitulo={conta.descricao}
      largura={480}
      bloquearEsc={salvando}
      onFechar={onCancelar}
    >
      <form onSubmit={confirmar}>
        <div className="bg-white/[.025] border border-hairline-soft rounded-[10px] p-3.5 mb-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-fg-muted">Vencimento</span>
            <span className="text-[12px] text-fg-soft font-mono">{fmtData(conta.vencimento)}</span>
          </div>
          <div className="flex items-end justify-between mt-1.5">
            <span className="text-[12px] text-fg-muted">{ehPagar ? "A pagar" : "A receber"}</span>
            <span className={`font-mono text-[22px] font-semibold tnum ${ehPagar ? "text-coral" : "text-emerald2"}`}>
              {fmtBRL(liquido)}
            </span>
          </div>
          {ajustar && (
            <div className="flex items-baseline justify-between mt-1 text-[10.5px] text-fg-faint">
              <span>Bruto original</span>
              <span className="font-mono">{fmtBRL(valorBrutoOriginal)}</span>
            </div>
          )}
        </div>

        <Campo label={`Data do ${ehPagar ? "pagamento" : "recebimento"} *`}>
          <Input type="date" value={data} onChange={e => setData(e.target.value)} required />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11.5px] font-medium text-fg-muted uppercase tracking-[.1em]">Forma</span>
              {podeEditar && (
                <button type="button" onClick={() => setGerenciarAberto(true)}
                  className="text-[10.5px] font-medium text-iris hover:underline">
                  Gerenciar
                </button>
              )}
            </div>
            <Select value={formaSel} onChange={e => setFormaSel(e.target.value)} className="mb-3.5">
              {FORMAS_PAGAMENTO.map(f => (
                <option key={f.id} value={`default:${f.id}`}>{f.label}</option>
              ))}
              {formasCustom.length > 0 && <option disabled>— Personalizadas —</option>}
              {formasCustom.map(c => (
                <option key={c.id} value={`custom:${c.id}`}>
                  {c.icone ? `${c.icone} ` : ""}{c.nome}
                </option>
              ))}
            </Select>
          </div>
          <Campo label={ehPagar ? "Caixa" : "Caixa"}>
            <Select value={caixaId} onChange={e => setCaixaId(e.target.value)}>
              <option value="">Caixa do meu usuário</option>
              {caixasAbertos.map(c => (
                <option key={c.id} value={c.id}>
                  #{c.numero} · {c.user?.nome || "—"}
                </option>
              ))}
              <option value="FORA">Fora do PDV</option>
            </Select>
          </Campo>
        </div>

        <button
          type="button"
          onClick={() => setAjustar(v => !v)}
          className={[
            "w-full h-10 mb-3.5 rounded-[9px] text-[12.5px] font-medium transition border",
            ajustar
              ? "bg-iris/15 border-iris/40 text-iris"
              : "bg-white/[.02] border-hairline-soft text-fg-muted hover:text-fg-soft",
          ].join(" ")}
        >
          {ajustar ? "✓ Ajuste de juros / multa / desconto ativo" : "+ Ajustar juros / multa / desconto"}
        </button>

        {ajustar && (
          <div className="grid grid-cols-3 gap-2">
            <Campo label="Juros">
              <Input type="number" step="0.01" min="0" value={juros}
                onChange={e => setJuros(e.target.value)} placeholder="0,00" />
            </Campo>
            <Campo label="Multa">
              <Input type="number" step="0.01" min="0" value={multa}
                onChange={e => setMulta(e.target.value)} placeholder="0,00" />
            </Campo>
            <Campo label="Desconto">
              <Input type="number" step="0.01" min="0" value={desconto}
                onChange={e => setDesconto(e.target.value)} placeholder="0,00" />
            </Campo>
          </div>
        )}

        {erro && <Alerta>{erro}</Alerta>}

        <div className="flex justify-end gap-2.5 mt-5 pt-4 border-t border-hairline-soft">
          <BtnSecundario type="button" disabled={salvando} onClick={onCancelar}>
            Cancelar
          </BtnSecundario>
          <BtnPrimario type="submit" disabled={salvando} tone={ehPagar ? "coral" : "emerald"}>
            {salvando
              ? "Confirmando…"
              : (ehPagar ? "Confirmar pagamento" : "Confirmar recebimento")}
          </BtnPrimario>
        </div>
      </form>

      {gerenciarAberto && (
        <Suspense fallback={null}>
          <GerenciarFormasModal
            podeExcluir={podeEditar}
            onFechar={async () => { setGerenciarAberto(false); await recarregarFormas(); }}
          />
        </Suspense>
      )}
    </ModalShell>
  );
}
