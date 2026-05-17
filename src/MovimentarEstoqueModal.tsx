import { useState, useMemo, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import SelectBusca from "./components/SelectBusca";

// ============ TIPOS ============

type TipoMov = "ENTRADA" | "SAIDA" | "AJUSTE";

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  estoque: number;
  tipoItem?: "PRODUTO" | "SERVICO";
  [extra: string]: unknown;
}

interface MovimentarEstoqueModalProps {
  produtos: Produto[];
  produtoInicial?: Produto | null;
  onCancelar: () => void;
  onSalvar: (mov: unknown) => void;
}

interface OpcaoTipo {
  val: TipoMov;
  label: string;
  cor: string;
}

export default function MovimentarEstoqueModal({
  produtos,
  produtoInicial,
  onCancelar,
  onSalvar,
}: MovimentarEstoqueModalProps) {
  const [produtoId, setProdutoId] = useState(produtoInicial?.id || "");
  const [tipo, setTipo] = useState<TipoMov>("ENTRADA");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const produto = useMemo(
    () => produtos.find((p) => p.id === produtoId) || produtoInicial || null,
    [produtoId, produtoInicial, produtos],
  );

  const previewDepois = useMemo(() => {
    if (!produto || quantidade === "") return null;
    const q = parseInt(quantidade, 10);
    if (!Number.isFinite(q)) return null;
    if (tipo === "ENTRADA") return produto.estoque + q;
    if (tipo === "SAIDA") return produto.estoque - q;
    if (tipo === "AJUSTE") return q;
    return null;
  }, [produto, tipo, quantidade]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!produtoId) { setErro("Selecione um produto"); return; }
    const q = parseInt(quantidade, 10);
    if (!Number.isFinite(q)) { setErro("Quantidade inválida"); return; }
    if (tipo !== "AJUSTE" && q <= 0) { setErro("Quantidade deve ser maior que zero"); return; }
    if (tipo === "AJUSTE" && q < 0) { setErro("Para ajuste, informe um valor >= 0"); return; }
    if (tipo === "SAIDA" && produto && q > produto.estoque) {
      setErro(`Estoque insuficiente. Disponível: ${produto.estoque}`); return;
    }

    setSalvando(true);
    try {
      const mov = await api.criarMovimentacao({ produtoId, tipo, quantidade: q, motivo });
      onSalvar(mov);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const tipoCor = tipo === "ENTRADA" ? C.green : tipo === "SAIDA" ? C.red : C.yellow;

  const opcoesTipo: OpcaoTipo[] = [
    { val: "ENTRADA", label: "↗ Entrada", cor: C.green },
    { val: "SAIDA",   label: "↙ Saída",   cor: C.red },
    { val: "AJUSTE",  label: "✎ Ajuste",  cor: C.yellow },
  ];

  return (
    <div
      onClick={() => !salvando && onCancelar()}
      className="fixed inset-0 flex items-center justify-center p-5"
      style={{ background: "rgba(0,0,0,0.65)", zIndex: 100 }}
    >
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="bg-gp-card w-full p-6"
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          maxWidth: 520,
        }}
      >
        <div className="flex justify-between items-center mb-5">
          <div className="text-gp-white font-bold text-lg">
            Movimentar Estoque
          </div>
          <button
            type="button"
            onClick={onCancelar}
            aria-label="Fechar"
            className="bg-transparent border-none text-gp-muted cursor-pointer"
            style={{ fontSize: 20 }}
          >
            ×
          </button>
        </div>

        <Campo label="Produto *">
          <SelectBusca<Produto>
            opcoes={produtos}
            value={produtoId}
            onChange={setProdutoId}
            labelFn={(p) => `${p.codigo} — ${p.nome} (estoque: ${p.estoque})`}
            filtroOpcoes={(p) => p.tipoItem !== "SERVICO"}
            placeholder="Buscar produto..."
            disabled={!!produtoInicial}
            required
            style={inputStyle}
          />
        </Campo>

        <Campo label="Tipo de movimentação *">
          <div className="grid grid-cols-3 gap-2">
            {opcoesTipo.map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setTipo(opt.val)}
                className="rounded-lg text-xs font-bold cursor-pointer"
                style={{
                  padding: "10px 8px",
                  background: tipo === opt.val ? opt.cor + "33" : C.surface,
                  border: `1px solid ${tipo === opt.val ? opt.cor : C.border}`,
                  color: tipo === opt.val ? opt.cor : C.text,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Campo>

        <Campo label={tipo === "AJUSTE" ? "Estoque deve ficar com *" : "Quantidade *"}>
          <input
            type="number"
            min="0"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
            style={inputStyle}
            autoFocus
            aria-label="Quantidade"
          />
          {tipo === "AJUSTE" && (
            <div className="text-gp-muted text-[11px] mt-1">
              Para ajuste, informe o valor absoluto que o estoque deve ficar (não soma/subtrai).
            </div>
          )}
        </Campo>

        <Campo label="Motivo / Observação">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            style={inputStyle}
            placeholder="Ex: nota fiscal 1234, perda, contagem, etc."
          />
        </Campo>

        {produto && previewDepois !== null && (
          <div
            className="bg-gp-surface mt-3 rounded-[10px]"
            style={{
              padding: "12px 14px",
              border: `1px solid ${tipoCor}55`,
            }}
          >
            <div className="text-gp-muted text-[11px] mb-1 font-semibold">PRÉVIA</div>
            <div className="text-gp-text text-sm">
              Estoque <span className="font-mono">{produto.estoque}</span>
              {" → "}
              <span
                className="font-mono font-bold"
                style={{ color: previewDepois < 0 ? C.red : tipoCor }}
              >
                {previewDepois}
              </span>
              {previewDepois < 0 && <span className="text-gp-red ml-2 text-xs">⚠ Negativo</span>}
            </div>
          </div>
        )}

        {erro && (
          <div
            className="mt-3.5 rounded-lg text-[13px] text-gp-red"
            style={{
              padding: "10px 12px",
              background: C.red + "22",
              border: `1px solid ${C.red}55`,
            }}
          >
            {erro}
          </div>
        )}

        <div className="flex gap-2.5 justify-end mt-5">
          <button
            type="button"
            onClick={onCancelar}
            disabled={salvando}
            className="bg-gp-surface text-gp-text rounded-lg font-semibold text-[13px] cursor-pointer"
            style={{
              border: `1px solid ${C.border}`,
              padding: "10px 18px",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="text-gp-white border-none rounded-lg font-bold text-[13px]"
            style={{
              background: salvando ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              padding: "10px 22px",
              cursor: salvando ? "default" : "pointer",
            }}
          >
            {salvando ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="block text-gp-muted text-xs mb-1.5 font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  color: C.text,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};
