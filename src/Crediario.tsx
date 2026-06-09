// Crediario.tsx — caderneta digital (fiado). Lista clientes com saldo devedor
// e limite de credito; abre a caderneta do cliente para lancar compras no fiado
// e registrar pagamentos. Construido sobre Contas a Receber (a baixa reusa o
// endpoint /contas-receber/:id/receber).

import { useEffect, useState, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";

const fmtBRL = (v: unknown) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

interface ClienteCrediario {
  id: string;
  nome: string;
  cpfCnpj?: string;
  telefone?: string;
  limiteCredito: number | null;
  saldoDevedor: number;
  vencido: number;
  creditoDisponivel: number | null;
  acimaDoLimite: boolean;
  qtdAbertas: number;
}

interface Lancamento {
  id: string;
  descricao: string;
  valor: number;
  vencimento?: string;
  recebimento?: string;
  status: "PENDENTE" | "PAGA" | "ATRASADA" | "CANCELADA";
  vencida?: boolean;
  origemVenda?: boolean;
  criadaEm?: string;
}

interface Caderneta {
  cliente: { id: string; nome: string; cpfCnpj?: string; telefone?: string; limiteCredito: number | null };
  saldoDevedor: number;
  vencido: number;
  creditoDisponivel: number | null;
  acimaDoLimite: boolean;
  lancamentos: Lancamento[];
}

export default function Crediario({ user }: { user: SessionUser }) {
  const [lista, setLista] = useState<ClienteCrediario[]>([]);
  const [totais, setTotais] = useState({ totalDevedor: 0, totalVencido: 0 });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const r = await api.crediarioListar() as { clientes: ClienteCrediario[]; totalDevedor: number; totalVencido: number };
      setLista(r.clientes || []);
      setTotais({ totalDevedor: r.totalDevedor || 0, totalVencido: r.totalVencido || 0 });
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar crediário");
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  const filtrados = lista.filter(c => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return c.nome.toLowerCase().includes(q) || (c.cpfCnpj || "").includes(q.replace(/\D/g, ""));
  });

  return (
    <div>
      {/* KPIs */}
      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {[
          { rotulo: "Total a receber", valor: fmtBRL(totais.totalDevedor), cor: C.green },
          { rotulo: "Vencido", valor: fmtBRL(totais.totalVencido), cor: C.red },
          { rotulo: "Clientes com fiado", valor: String(lista.length), cor: C.accent },
        ].map((k, i) => (
          <div key={i} className="bg-gp-card border border-gp-border rounded-xl px-3 py-2 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full" style={{ background: k.cor }} />
            <div className="text-gp-muted text-[10px] font-bold uppercase tracking-[0.5px]">{k.rotulo}</div>
            <div className="text-lg font-extrabold mt-[2px]" style={{ color: k.cor }}>{k.valor}</div>
          </div>
        ))}
      </div>

      {erro && (
        <div className="px-4 py-3 mb-3 rounded-[10px] text-gp-red" style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}>{erro}</div>
      )}

      <div className="bg-gp-card border border-gp-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gp-border flex-wrap">
          <div className="text-gp-white text-sm font-bold">📒 Crediário — {filtrados.length} cliente(s)</div>
          <div className="flex gap-2">
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="🔍 Buscar cliente..."
              style={{ ...inputStyle, padding: "7px 12px", fontSize: 12, minWidth: 200 }}
            />
            <button onClick={carregar} disabled={carregando} style={btnSec}>🔄 {carregando ? "..." : "Atualizar"}</button>
          </div>
        </div>

        {carregando && lista.length === 0 ? (
          <div className="p-8 text-center text-gp-muted text-sm">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="p-8 text-center text-gp-muted text-sm">
            Nenhum cliente com crediário. Defina um limite de crédito ou lance uma compra no fiado para começar.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {["Cliente", "Saldo devedor", "Limite", "Disponível", "Vencido", ""].map((h, i) => (
                    <th key={i} style={{ padding: "9px 10px", textAlign: i === 0 ? "left" : "right", color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}55`, cursor: "pointer" }} onClick={() => setSelecionado(c.id)}>
                    <td style={{ padding: "9px 10px" }}>
                      <div className="text-gp-text font-semibold">{c.nome}</div>
                      <div className="text-gp-muted text-[10px]">{c.telefone || c.cpfCnpj || ""}{c.qtdAbertas ? ` · ${c.qtdAbertas} em aberto` : ""}</div>
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: c.saldoDevedor > 0 ? C.text : C.muted, fontWeight: 700 }}>{fmtBRL(c.saldoDevedor)}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: C.muted }}>{c.limiteCredito != null ? fmtBRL(c.limiteCredito) : "—"}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: c.acimaDoLimite ? C.red : C.green, fontWeight: 600 }}>
                      {c.creditoDisponivel != null ? fmtBRL(c.creditoDisponivel) : "Livre"}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: c.vencido > 0 ? C.red : C.muted, fontWeight: c.vencido > 0 ? 700 : 400 }}>{c.vencido > 0 ? fmtBRL(c.vencido) : "—"}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>
                      <span style={{ color: C.accent, fontSize: 11, fontWeight: 700 }}>Abrir →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selecionado && (
        <CadernetaModal
          clienteId={selecionado}
          user={user}
          onFechar={() => setSelecionado(null)}
          onMudou={carregar}
        />
      )}
    </div>
  );
}

// ============ MODAL: CADERNETA DO CLIENTE ============
function CadernetaModal({ clienteId, user, onFechar, onMudou }: { clienteId: string; user: SessionUser; onFechar: () => void; onMudou: () => void }) {
  const [dados, setDados] = useState<Caderneta | null>(null);
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState(false);

  // Form lancar fiado
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [vencimento, setVencimento] = useState("");

  // Form limite
  const [editandoLimite, setEditandoLimite] = useState(false);
  const [limiteInput, setLimiteInput] = useState("");

  const podeGerenciar = user.role === "ADMIN" || user.role === "GERENTE";

  async function carregar() {
    setErro("");
    try {
      const r = await api.crediarioCaderneta(clienteId) as Caderneta;
      setDados(r);
      setLimiteInput(r.cliente.limiteCredito != null ? String(r.cliente.limiteCredito) : "");
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar caderneta");
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [clienteId]);

  async function lancar() {
    const v = Number(String(valor).replace(",", "."));
    if (!v || v <= 0) { setErro("Informe um valor válido"); return; }
    setAcao(true); setErro("");
    try {
      await api.crediarioLancar(clienteId, {
        valor: v,
        descricao: descricao.trim() || undefined,
        vencimento: vencimento || undefined,
      });
      setValor(""); setDescricao(""); setVencimento("");
      await carregar(); onMudou();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível lançar");
    } finally {
      setAcao(false);
    }
  }

  async function receber(id: string) {
    if (!confirm("Registrar o pagamento desta compra (baixa total)?")) return;
    setAcao(true); setErro("");
    try {
      // caixaId: null → baixa a conta sem exigir caixa aberto.
      await api.receberConta(id, { caixaId: null });
      await carregar(); onMudou();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível registrar o pagamento");
    } finally {
      setAcao(false);
    }
  }

  async function salvarLimite() {
    setAcao(true); setErro("");
    try {
      const v = limiteInput.trim() === "" ? null : Number(String(limiteInput).replace(",", "."));
      await api.crediarioDefinirLimite(clienteId, v as number | null);
      setEditandoLimite(false);
      await carregar(); onMudou();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível salvar o limite");
    } finally {
      setAcao(false);
    }
  }

  return (
    <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", padding: 20 }}>
        {!dados ? (
          <div className="text-gp-muted text-sm p-4">{erro || "Carregando..."}</div>
        ) : (
          <>
            <div className="flex justify-between items-start gap-3 mb-3">
              <div>
                <div className="text-gp-white text-lg font-extrabold">📒 {dados.cliente.nome}</div>
                <div className="text-gp-muted text-xs mt-[2px]">{dados.cliente.telefone || dados.cliente.cpfCnpj || ""}</div>
              </div>
              <button onClick={onFechar} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            {erro && <div className="px-3 py-2 mb-3 rounded-lg text-gp-red text-xs" style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}>{erro}</div>}

            {/* Resumo */}
            <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
              <Resumo rotulo="Saldo devedor" valor={fmtBRL(dados.saldoDevedor)} cor={dados.saldoDevedor > 0 ? C.text : C.muted} />
              <Resumo rotulo="Vencido" valor={dados.vencido > 0 ? fmtBRL(dados.vencido) : "—"} cor={dados.vencido > 0 ? C.red : C.muted} />
              <Resumo rotulo="Limite" valor={dados.cliente.limiteCredito != null ? fmtBRL(dados.cliente.limiteCredito) : "Livre"} cor={C.muted} />
              <Resumo rotulo="Disponível" valor={dados.creditoDisponivel != null ? fmtBRL(dados.creditoDisponivel) : "Livre"} cor={dados.acimaDoLimite ? C.red : C.green} />
            </div>

            {/* Limite (gerencial) */}
            {podeGerenciar && (
              <div className="bg-gp-surface border border-gp-border rounded-lg px-3 py-2 mb-3 flex items-center gap-2 flex-wrap">
                {!editandoLimite ? (
                  <>
                    <span className="text-gp-muted text-xs">Limite de crédito: <strong className="text-gp-text">{dados.cliente.limiteCredito != null ? fmtBRL(dados.cliente.limiteCredito) : "sem limite"}</strong></span>
                    <button onClick={() => setEditandoLimite(true)} style={{ ...btnMini }}>Alterar</button>
                  </>
                ) : (
                  <>
                    <input value={limiteInput} onChange={e => setLimiteInput(e.target.value)} placeholder="ex: 500 (vazio = sem limite)" style={{ ...inputStyle, padding: "6px 10px", fontSize: 12, maxWidth: 200 }} />
                    <button onClick={salvarLimite} disabled={acao} style={{ ...btnMini, borderColor: C.green, color: C.green }}>Salvar</button>
                    <button onClick={() => { setEditandoLimite(false); setLimiteInput(dados.cliente.limiteCredito != null ? String(dados.cliente.limiteCredito) : ""); }} style={btnMini}>Cancelar</button>
                  </>
                )}
              </div>
            )}

            {/* Lancar fiado */}
            <div className="bg-gp-surface border border-gp-border rounded-lg p-3 mb-3">
              <div className="text-gp-muted text-[10px] font-bold uppercase tracking-[0.5px] mb-2">Lançar compra no fiado</div>
              <div className="flex gap-2 flex-wrap items-end">
                <div style={{ flex: "1 1 110px" }}>
                  <label style={lbl}>Valor *</label>
                  <input value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" inputMode="decimal" style={{ ...inputStyle, padding: "7px 10px", fontSize: 13 }} />
                </div>
                <div style={{ flex: "2 1 160px" }}>
                  <label style={lbl}>Descrição</label>
                  <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Compra no crediário" style={{ ...inputStyle, padding: "7px 10px", fontSize: 13 }} />
                </div>
                <div style={{ flex: "1 1 130px" }}>
                  <label style={lbl}>Vencimento</label>
                  <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} style={{ ...inputStyle, padding: "7px 10px", fontSize: 13 }} />
                </div>
                <button onClick={lancar} disabled={acao} style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`, color: "var(--accent-ink)", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: acao ? 0.6 : 1 }}>
                  + Lançar
                </button>
              </div>
              <div className="text-gp-muted text-[10px] mt-1">Vencimento em branco = 30 dias. Respeita o limite de crédito.</div>
            </div>

            {/* Lancamentos */}
            <div className="text-gp-muted text-[10px] font-bold uppercase tracking-[0.5px] mb-2">Lançamentos</div>
            {dados.lancamentos.length === 0 ? (
              <div className="text-gp-muted text-xs">Nenhum lançamento.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {dados.lancamentos.map(l => {
                  const cor = l.status === "PAGA" ? C.green : l.vencida ? C.red : l.status === "CANCELADA" ? C.muted : C.yellow;
                  const aberta = l.status === "PENDENTE" || l.status === "ATRASADA";
                  return (
                    <div key={l.id} className="bg-gp-surface border border-gp-border rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="text-gp-text text-xs font-semibold truncate">{l.descricao}{l.origemVenda ? " 🧾" : ""}</div>
                        <div className="text-gp-muted text-[10px]">
                          Venc. {fmtData(l.vencimento)}{l.status === "PAGA" && l.recebimento ? ` · Pago ${fmtData(l.recebimento)}` : ""}
                        </div>
                      </div>
                      <div className="text-gp-text text-xs font-bold whitespace-nowrap">{fmtBRL(l.valor)}</div>
                      <div style={{ minWidth: 78, textAlign: "right" }}>
                        {aberta ? (
                          <button onClick={() => receber(l.id)} disabled={acao} style={{ ...btnMini, borderColor: C.green, color: C.green }}>Receber</button>
                        ) : (
                          <span style={{ color: cor, fontSize: 10, fontWeight: 700 }}>{l.status}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <div className="bg-gp-surface border border-gp-border rounded-lg px-3 py-2">
      <div className="text-gp-muted text-[9px] font-bold uppercase tracking-[0.5px]">{rotulo}</div>
      <div className="text-sm font-extrabold mt-[2px]" style={{ color: cor }}>{valor}</div>
    </div>
  );
}

const inputStyle: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl: CSSProperties = { display: "block", color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 };
const btnSec: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer" };
const btnMini: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 10px", fontWeight: 700, fontSize: 11, cursor: "pointer" };
