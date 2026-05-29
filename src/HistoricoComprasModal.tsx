import { useEffect, useState } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";

// ============ TIPOS ============

interface FornecedorRef {
  id: string;
  nome: string;
  cnpj?: string | null;
}

interface CompraRef {
  id: string;
  numero: number;
  createdAt: string;
  cancelada: boolean;
  fornecedor: FornecedorRef | null;
}

interface ItemHistorico {
  id: string;
  quantidade: number | string;
  precoUnitario: number | string;
  subtotal: number | string;
  compra: CompraRef;
}

interface Resumo {
  totalCompras: number;
  quantidadeTotal: number;
  valorTotal: number;
  precoMedio: number | null;
  ultimoPreco: number | null;
  ultimaData: string | null;
  ultimoFornecedor: string | null;
}

interface HistoricoResposta {
  produto: { id: string; codigo: string; nome: string; unidade?: string | null };
  itens: ItemHistorico[];
  resumo: Resumo;
}

interface HistoricoComprasModalProps {
  produtoId: string;
  produtoNome: string;
  onFechar: () => void;
}

// ============ HELPERS ============

const fmtBRL = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtQtd = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
};

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

// ============ COMPONENTE ============

export default function HistoricoComprasModal({
  produtoId,
  produtoNome,
  onFechar,
}: HistoricoComprasModalProps) {
  const [dados, setDados] = useState<HistoricoResposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro("");
    api
      .historicoComprasProduto(produtoId)
      .then((r) => { if (vivo) setDados(r as HistoricoResposta); })
      .catch((e) => { if (vivo) setErro((e as Error).message); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [produtoId]);

  // Fecha com ESC
  useEffect(() => {
    function aoTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", aoTecla);
    return () => document.removeEventListener("keydown", aoTecla);
  }, [onFechar]);

  const itens = dados?.itens || [];
  const resumo = dados?.resumo;

  return (
    <div
      onClick={onFechar}
      className="fixed inset-0 flex items-center justify-center p-5"
      style={{ background: "rgba(0,0,0,0.65)", zIndex: 110 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gp-card w-full flex flex-col"
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          maxWidth: 760,
          maxHeight: "88vh",
        }}
      >
        {/* Cabecalho */}
        <div
          className="flex justify-between items-start gap-3"
          style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${C.border}` }}
        >
          <div className="min-w-0">
            <div className="text-gp-white font-bold text-lg">Histórico de compras</div>
            <div className="text-gp-muted text-[13px] mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
              {produtoNome}
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="bg-transparent border-none text-gp-muted cursor-pointer flex-shrink-0"
            style={{ fontSize: 22 }}
          >
            ×
          </button>
        </div>

        {/* Resumo */}
        {resumo && resumo.totalCompras > 0 && (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              padding: "14px 24px",
              borderBottom: `1px solid ${C.border}`,
              background: C.surface,
            }}
          >
            <ResumoItem rotulo="Compras" valor={String(resumo.totalCompras)} />
            <ResumoItem
              rotulo="Qtd. comprada"
              valor={`${fmtQtd(resumo.quantidadeTotal)}${dados?.produto.unidade ? " " + dados.produto.unidade : ""}`}
            />
            <ResumoItem rotulo="Total gasto" valor={fmtBRL(resumo.valorTotal)} cor={C.green} />
            <ResumoItem rotulo="Custo médio" valor={fmtBRL(resumo.precoMedio)} />
            <ResumoItem
              rotulo="Último custo"
              valor={fmtBRL(resumo.ultimoPreco)}
              sub={resumo.ultimaData ? fmtData(resumo.ultimaData) : undefined}
            />
          </div>
        )}

        {/* Corpo */}
        <div className="overflow-y-auto" style={{ flex: 1, minHeight: 0 }}>
          {carregando ? (
            <div className="py-[40px] text-center text-gp-muted text-[13px]">Carregando...</div>
          ) : erro ? (
            <div style={{ padding: 24 }}>
              <div
                className="rounded-lg text-[13px] text-gp-red"
                style={{ padding: "10px 12px", background: C.red + "22", border: `1px solid ${C.red}55` }}
              >
                {erro}
              </div>
            </div>
          ) : itens.length === 0 ? (
            <div className="py-[40px] px-6 text-center text-gp-muted text-[13px]">
              Este produto ainda não foi comprado de nenhum fornecedor.
            </div>
          ) : (
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr
                  className="text-gp-muted text-[11px] font-bold uppercase"
                  style={{ background: C.surface, letterSpacing: 0.4 }}
                >
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>Compra</th>
                  <th style={thStyle}>Fornecedor</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Qtd.</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Custo unit.</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => {
                  const cancelada = it.compra.cancelada;
                  return (
                    <tr
                      key={it.id}
                      style={{ borderTop: `1px solid ${C.border}`, opacity: cancelada ? 0.5 : 1 }}
                    >
                      <td style={tdStyle} className="text-gp-muted whitespace-nowrap">
                        {fmtData(it.compra.createdAt)}
                      </td>
                      <td style={tdStyle} className="font-mono text-xs whitespace-nowrap">
                        <span className="text-gp-text">#{it.compra.numero}</span>
                        {cancelada && (
                          <span
                            className="ml-1.5 text-[9px] font-extrabold rounded"
                            style={{
                              padding: "1px 5px",
                              background: C.red + "22",
                              color: C.red,
                              border: `1px solid ${C.red}55`,
                            }}
                          >
                            ESTORNADA
                          </span>
                        )}
                      </td>
                      <td style={tdStyle} className="text-gp-text">
                        <div className="overflow-hidden text-ellipsis whitespace-nowrap" style={{ maxWidth: 200 }}>
                          {it.compra.fornecedor?.nome || "—"}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }} className="text-gp-text whitespace-nowrap">
                        {fmtQtd(it.quantidade)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }} className="text-gp-text whitespace-nowrap">
                        {fmtBRL(it.precoUnitario)}
                      </td>
                      <td
                        style={{ ...tdStyle, textAlign: "right" }}
                        className="font-semibold whitespace-nowrap"
                      >
                        {fmtBRL(it.subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function ResumoItem({ rotulo, valor, sub, cor }: { rotulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div>
      <div className="text-gp-muted text-[10px] font-semibold uppercase" style={{ letterSpacing: 0.4 }}>
        {rotulo}
      </div>
      <div className="font-bold text-sm mt-0.5" style={{ color: cor || C.text }}>
        {valor}
      </div>
      {sub && <div className="text-gp-muted text-[10px] mt-px">{sub}</div>}
    </div>
  );
}

const thStyle = {
  padding: "10px 16px",
  textAlign: "left" as const,
};

const tdStyle = {
  padding: "10px 16px",
};
