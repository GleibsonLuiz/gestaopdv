import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import SelectBusca from "./components/SelectBusca";

// Registrar Produção (produção própria / ficha técnica).
//
// O padeiro escolhe o produto (que precisa ter receita cadastrada na aba
// Receita do cadastro), informa a quantidade produzida e confirma. O backend
// (POST /estoque/producao) faz numa transação: ENTRADA no produto final e
// SAÍDA proporcional de cada insumo, tudo auditado em MovimentacaoEstoque.
// A prévia abaixo replica o cálculo (consumo = coeficiente × quantidade)
// apenas para conferência visual — quem manda é o backend.

const fmtQtd = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
};

const fmtBRL = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface InsumoRef {
  id: string;
  codigo?: string;
  nome?: string;
  unidade?: string | null;
  precoCusto?: number | string | null;
  estoque?: number | string;
  controlarEstoque?: boolean;
}

interface ComposicaoItem {
  id: string;
  insumoId: string;
  quantidade: number | string;
  insumo?: InsumoRef | null;
}

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  estoque: number;
  unidade?: string;
  tipoItem?: "PRODUTO" | "SERVICO";
  composicao?: ComposicaoItem[] | null;
  [extra: string]: unknown;
}

interface ResultadoProducao {
  produto: { id: string; nome: string; unidade?: string | null; estoque: number | string };
  quantidadeProduzida: number;
  custoInsumos: number;
  custoUnitario: number | null;
  [extra: string]: unknown;
}

interface RegistrarProducaoModalProps {
  produtos: Produto[];
  onCancelar: () => void;
  onSalvar: (resultado: ResultadoProducao) => void;
}

export default function RegistrarProducaoModal({ produtos, onCancelar, onSalvar }: RegistrarProducaoModalProps) {
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Só produtos físicos COM receita cadastrada podem ter produção registrada.
  const comFicha = useMemo(
    () => produtos.filter(
      (p) => (p.tipoItem ?? "PRODUTO") === "PRODUTO" && Array.isArray(p.composicao) && p.composicao.length > 0,
    ),
    [produtos],
  );

  const produto = useMemo(
    () => comFicha.find((p) => p.id === produtoId) || null,
    [comFicha, produtoId],
  );

  const qtd = parseFloat(String(quantidade).replace(",", "."));
  const qtdOk = Number.isFinite(qtd) && qtd > 0;

  // Prévia do consumo de insumos (espelha o cálculo do backend).
  const preview = useMemo(() => {
    if (!produto || !qtdOk) return [];
    return (produto.composicao || []).map((c) => {
      const consumo = Math.round(Number(c.quantidade) * qtd * 1000) / 1000;
      const disponivel = Number(c.insumo?.estoque ?? 0);
      const falta = consumo > disponivel + 1e-9 && c.insumo?.controlarEstoque !== false;
      const custo = Number(c.insumo?.precoCusto || 0) * consumo;
      return { item: c, consumo, disponivel, falta, custo };
    });
  }, [produto, qtd, qtdOk]);

  const custoTotal = Math.round(preview.reduce((s, x) => s + x.custo, 0) * 100) / 100;
  const temFalta = preview.some((x) => x.falta);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!produtoId) { setErro("Selecione o produto produzido"); return; }
    if (!qtdOk) { setErro("Informe a quantidade produzida"); return; }

    setSalvando(true);
    try {
      const resultado = await api.registrarProducao({
        produtoId,
        quantidade: Math.round(qtd * 1000) / 1000,
        observacao: observacao.trim() || undefined,
      }) as ResultadoProducao;
      onSalvar(resultado);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      onClick={() => !salvando && onCancelar()}
      className="fixed inset-0 flex items-center justify-center p-5"
      style={{ background: "rgba(0,0,0,0.65)", zIndex: 100 }}
    >
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="bg-gp-card w-full p-6 overflow-y-auto"
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          maxWidth: 560,
          maxHeight: "88vh",
        }}
      >
        <div className="flex justify-between items-center mb-5">
          <div>
            <div className="text-gp-white font-bold text-lg">⚙️ Registrar Produção</div>
            <div className="text-gp-muted text-xs mt-0.5">
              Dá entrada no produto e baixa os insumos da receita
            </div>
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

        {comFicha.length === 0 ? (
          <div
            className="text-gp-muted text-[13px] text-center rounded-[10px]"
            style={{ padding: "22px 16px", border: `1px dashed ${C.border}` }}
          >
            Nenhum produto com receita cadastrada.
            <div className="mt-1.5 text-[12px]">
              Cadastre os insumos na aba <b>🧾 Receita</b> do produto (tela Produtos) e volte aqui.
            </div>
          </div>
        ) : (
          <>
            <Campo label="Produto produzido *">
              <SelectBusca<Produto>
                opcoes={comFicha}
                value={produtoId}
                onChange={setProdutoId}
                labelFn={(p) => `${p.codigo} — ${p.nome} (estoque: ${fmtQtd(p.estoque)} ${p.unidade || "UN"})`}
                placeholder="Buscar produto com receita..."
                required
                style={inputStyle}
              />
            </Campo>

            <Campo label={`Quantidade produzida${produto ? ` (${(produto.unidade || "UN").toUpperCase()})` : ""} *`}>
              <input
                type="number"
                step="0.001"
                min="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                required
                style={inputStyle}
                autoFocus={!!produtoId}
                placeholder="Ex: 50"
                aria-label="Quantidade produzida"
              />
            </Campo>

            <Campo label="Observação (opcional)">
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value.slice(0, 120))}
                style={inputStyle}
                placeholder="Ex: fornada da manhã"
              />
            </Campo>

            {produto && qtdOk && (
              <div
                className="bg-gp-surface mt-3 rounded-[10px] overflow-hidden"
                style={{ border: `1px solid ${temFalta ? C.red + "66" : C.border}` }}
              >
                <div
                  className="text-gp-muted text-[11px] font-semibold uppercase"
                  style={{ padding: "10px 14px 6px", letterSpacing: 0.4 }}
                >
                  Consumo de insumos
                </div>
                {preview.map(({ item, consumo, disponivel, falta }) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 text-[12.5px]"
                    style={{ padding: "6px 14px", borderTop: `1px dashed ${C.border}` }}
                  >
                    <span className="text-gp-text truncate" style={{ flex: 1, minWidth: 0 }}>
                      {item.insumo?.nome || "Insumo"}
                    </span>
                    <span className="font-mono" style={{ color: falta ? C.red : C.text }}>
                      −{fmtQtd(consumo)} {(item.insumo?.unidade || "UN").toUpperCase()}
                    </span>
                    <span className="text-gp-muted font-mono text-[11px]" style={{ width: 110, textAlign: "right" }}>
                      disp.: {fmtQtd(disponivel)}{falta ? " ⚠" : ""}
                    </span>
                  </div>
                ))}
                <div
                  className="flex items-center justify-between text-[12.5px]"
                  style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, background: C.bg }}
                >
                  <span className="text-gp-muted">
                    Custo dos insumos
                    {custoTotal > 0 && qtd > 0 && (
                      <span className="text-[11px]"> ({fmtBRL(Math.round((custoTotal / qtd) * 100) / 100)} por {(produto.unidade || "UN").toUpperCase()})</span>
                    )}
                  </span>
                  <b className="text-gp-white font-mono">{fmtBRL(custoTotal)}</b>
                </div>
                {temFalta && (
                  <div className="text-[11.5px]" style={{ padding: "8px 14px", color: C.red, background: C.red + "11" }}>
                    ⚠ Insumo com saldo insuficiente — dê entrada no estoque dele ou ajuste a quantidade.
                  </div>
                )}
              </div>
            )}

            {erro && (
              <div
                className="mt-3.5 rounded-lg text-[13px] text-gp-red"
                style={{ padding: "10px 12px", background: C.red + "22", border: `1px solid ${C.red}55` }}
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
                style={{ border: `1px solid ${C.border}`, padding: "10px 18px" }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="text-gp-white border-none rounded-lg font-bold text-[13px]"
                style={{
                  background: salvando ? C.muted : `linear-gradient(135deg, ${C.green}, ${C.accent})`,
                  padding: "10px 22px",
                  cursor: salvando ? "default" : "pointer",
                }}
              >
                {salvando ? "Registrando..." : "Confirmar produção"}
              </button>
            </div>
          </>
        )}
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
